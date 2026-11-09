//! Layer rules for the desktop workspace, checked by `cargo xtask layers`.
//!
//! 1. `model`, `core`, `presenter` and `providers` must not reach `gpui*`.
//! 2. Workspace dependencies must follow the allow table.
//! 3. `closta-model` must stay synchronous: no `async` or `.await`.

use std::collections::{BTreeSet, HashMap};
use std::fmt;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use cargo_metadata::{Metadata, MetadataCommand, Node, PackageId};

const MODEL: &str = "closta-model";

/// Crates that must not have `gpui*` anywhere in their dependency closure.
const GUI_FREE: &[&str] = &[
    "closta-model",
    "closta-core",
    "closta-presenter",
    "closta-providers",
];

/// Allowed direct workspace dependencies per crate.
const ALLOWED: &[(&str, &[&str])] = &[
    ("closta-model", &[]),
    ("closta-core", &["closta-model"]),
    ("closta-presenter", &["closta-core", "closta-model"]),
    ("closta-providers", &["closta-core", "closta-model"]),
    (
        "closta-platform",
        &["closta-presenter", "closta-core", "closta-model"],
    ),
    (
        "closta",
        &[
            "closta-platform",
            "closta-providers",
            "closta-presenter",
            "closta-core",
            "closta-model",
        ],
    ),
    ("xtask", &[]),
];

#[derive(Debug, Clone)]
pub struct Package {
    pub name: String,
    /// Direct dependencies inside the workspace (normal, dev and build).
    pub workspace_deps: Vec<String>,
    /// Names of all transitive dependencies.
    pub closure: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub rule: u8,
    pub krate: String,
    pub detail: String,
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[rule {}] {}: {}", self.rule, self.krate, self.detail)
    }
}

pub fn check_graph(packages: &[Package]) -> Vec<Violation> {
    let mut out = Vec::new();
    for p in packages {
        if GUI_FREE.contains(&p.name.as_str()) {
            for dep in p.closure.iter().filter(|d| d.starts_with("gpui")) {
                out.push(Violation {
                    rule: 1,
                    krate: p.name.clone(),
                    detail: format!("depends on `{dep}` (directly or transitively)"),
                });
            }
        }
        match ALLOWED.iter().find(|(name, _)| *name == p.name) {
            Some((_, allowed)) => {
                for dep in p
                    .workspace_deps
                    .iter()
                    .filter(|d| !allowed.contains(&d.as_str()))
                {
                    out.push(Violation {
                        rule: 2,
                        krate: p.name.clone(),
                        detail: format!("may not depend on `{dep}`"),
                    });
                }
            }
            None => out.push(Violation {
                rule: 2,
                krate: p.name.clone(),
                detail: "is not in the layer allow table".into(),
            }),
        }
    }
    out
}

/// Replaces comments, string literals and char literals with spaces,
/// keeping newlines so line numbers stay intact.
fn blank_comments_and_strings(src: &str) -> String {
    let c: Vec<char> = src.chars().collect();
    let mut out = String::with_capacity(src.len());
    let blank = |out: &mut String, ch: char| out.push(if ch == '\n' { '\n' } else { ' ' });
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        let next = c.get(i + 1).copied();
        if ch == '/' && next == Some('/') {
            while i < c.len() && c[i] != '\n' {
                out.push(' ');
                i += 1;
            }
        } else if ch == '/' && next == Some('*') {
            let mut depth = 0;
            while i < c.len() {
                if c[i] == '/' && c.get(i + 1) == Some(&'*') {
                    depth += 1;
                    out.push_str("  ");
                    i += 2;
                } else if c[i] == '*' && c.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    out.push_str("  ");
                    i += 2;
                    if depth == 0 {
                        break;
                    }
                } else {
                    blank(&mut out, c[i]);
                    i += 1;
                }
            }
        } else if let Some(hashes) = raw_string_start(&c, i) {
            // r"..." / r#"..."# / br#"..."#: blank the prefix, then scan for the closer.
            let mut j = i;
            while c[j] != '"' {
                out.push(' ');
                j += 1;
            }
            out.push(' ');
            j += 1;
            while j < c.len() {
                if c[j] == '"' && (0..hashes).all(|k| c.get(j + 1 + k) == Some(&'#')) {
                    for _ in 0..=hashes {
                        out.push(' ');
                    }
                    j += 1 + hashes;
                    break;
                }
                blank(&mut out, c[j]);
                j += 1;
            }
            i = j;
        } else if ch == '"' {
            out.push(' ');
            i += 1;
            while i < c.len() {
                if c[i] == '\\' {
                    out.push(' ');
                    if let Some(&e) = c.get(i + 1) {
                        blank(&mut out, e);
                    }
                    i += 2;
                } else if c[i] == '"' {
                    out.push(' ');
                    i += 1;
                    break;
                } else {
                    blank(&mut out, c[i]);
                    i += 1;
                }
            }
        } else if ch == '\'' {
            // A char literal closes within a few chars; otherwise it is a lifetime.
            let len = if next == Some('\\') {
                c.get(i + 3..)
                    .and_then(|rest| rest.iter().position(|&x| x == '\''))
                    .map(|p| p + 4)
            } else if c.get(i + 2) == Some(&'\'') {
                Some(3)
            } else {
                None
            };
            match len {
                Some(n) => {
                    for _ in 0..n {
                        out.push(' ');
                    }
                    i += n;
                }
                None => {
                    out.push(ch);
                    i += 1;
                }
            }
        } else {
            out.push(ch);
            i += 1;
        }
    }
    out
}

/// If a raw string literal starts at `i`, returns its number of `#`s.
fn raw_string_start(c: &[char], i: usize) -> Option<usize> {
    if i > 0 && is_ident(c[i - 1]) {
        return None;
    }
    let mut j = i;
    if c.get(j) == Some(&'b') {
        j += 1;
    }
    if c.get(j) != Some(&'r') {
        return None;
    }
    j += 1;
    let mut hashes = 0;
    while c.get(j) == Some(&'#') {
        hashes += 1;
        j += 1;
    }
    (c.get(j) == Some(&'"')).then_some(hashes)
}

fn is_ident(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

pub fn check_model_source(file: &str, src: &str) -> Vec<Violation> {
    let mut out = Vec::new();
    for (idx, line) in blank_comments_and_strings(src).lines().enumerate() {
        let chars: Vec<char> = line.chars().collect();
        for (word, needs_dot) in [("async", false), ("await", true)] {
            let w: Vec<char> = word.chars().collect();
            for start in 0..=chars.len().saturating_sub(w.len()) {
                if chars.len() < w.len() || chars[start..start + w.len()] != w[..] {
                    continue;
                }
                let before = start.checked_sub(1).map(|b| chars[b]);
                let after = chars.get(start + w.len()).copied();
                let boundary = !before.is_some_and(is_ident) && !after.is_some_and(is_ident);
                if boundary && (!needs_dot || before == Some('.')) {
                    let shown = if needs_dot { ".await" } else { "async" };
                    out.push(Violation {
                        rule: 3,
                        krate: MODEL.into(),
                        detail: format!("{file}:{}: uses `{shown}`", idx + 1),
                    });
                }
            }
        }
    }
    out
}

pub fn from_metadata(md: &Metadata) -> Vec<Package> {
    let names: HashMap<&PackageId, &str> = md
        .packages
        .iter()
        .map(|p| (&p.id, p.name.as_str()))
        .collect();
    let nodes: HashMap<&PackageId, &Node> = md
        .resolve
        .iter()
        .flat_map(|r| r.nodes.iter())
        .map(|n| (&n.id, n))
        .collect();
    let members: BTreeSet<&PackageId> = md.workspace_members.iter().collect();

    let mut out = Vec::new();
    for id in &members {
        let Some(node) = nodes.get(id) else { continue };
        let workspace_deps = node
            .deps
            .iter()
            .filter(|d| members.contains(&d.pkg))
            .filter_map(|d| names.get(&d.pkg).map(|n| (*n).to_owned()))
            .collect();

        let mut seen: BTreeSet<&PackageId> = BTreeSet::new();
        let mut stack: Vec<&PackageId> = node.deps.iter().map(|d| &d.pkg).collect();
        while let Some(next) = stack.pop() {
            if !seen.insert(next) {
                continue;
            }
            if let Some(n) = nodes.get(next) {
                stack.extend(n.deps.iter().map(|d| &d.pkg));
            }
        }
        let closure = seen
            .iter()
            .filter_map(|p| names.get(p).map(|n| (*n).to_owned()))
            .collect();

        out.push(Package {
            name: names.get(id).map(|n| (*n).to_owned()).unwrap_or_default(),
            workspace_deps,
            closure,
        });
    }
    out
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in std::fs::read_dir(dir).with_context(|| format!("reading {}", dir.display()))? {
        let path = entry?.path();
        if path.is_dir() {
            rust_files(&path, out)?;
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
    Ok(())
}

pub fn run(root: &Path) -> Result<()> {
    let md = MetadataCommand::new()
        .manifest_path(root.join("Cargo.toml"))
        .exec()
        .context("running cargo metadata")?;
    let mut violations = check_graph(&from_metadata(&md));

    let mut files = Vec::new();
    rust_files(&root.join("crates/model/src"), &mut files)?;
    files.sort();
    for file in files {
        let src = std::fs::read_to_string(&file)
            .with_context(|| format!("reading {}", file.display()))?;
        let shown = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .display()
            .to_string();
        violations.extend(check_model_source(&shown, &src));
    }

    for v in &violations {
        eprintln!("{v}");
    }
    if !violations.is_empty() {
        bail!("{} layer violation(s)", violations.len());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pkg(name: &str, deps: &[&str], closure: &[&str]) -> Package {
        Package {
            name: name.into(),
            workspace_deps: deps.iter().map(|s| (*s).into()).collect(),
            closure: closure.iter().map(|s| (*s).into()).collect(),
        }
    }

    fn clean() -> Vec<Package> {
        vec![
            pkg("closta-model", &[], &["serde"]),
            pkg("closta-core", &["closta-model"], &["closta-model"]),
            pkg(
                "closta-presenter",
                &["closta-core", "closta-model"],
                &["closta-core"],
            ),
            pkg(
                "closta-providers",
                &["closta-core", "closta-model"],
                &["closta-core"],
            ),
            pkg(
                "closta-platform",
                &["closta-presenter", "closta-core", "closta-model"],
                &["gpui-kit", "gpui"],
            ),
            pkg(
                "closta",
                &[
                    "closta-platform",
                    "closta-providers",
                    "closta-presenter",
                    "closta-core",
                    "closta-model",
                ],
                &["gpui-kit", "gpui"],
            ),
            pkg("xtask", &[], &["anyhow"]),
        ]
    }

    #[test]
    fn clean_graph_has_no_violations() {
        assert!(check_graph(&clean()).is_empty());
    }

    #[test]
    fn gpui_in_presenter_closure_is_rule_1() {
        let mut g = clean();
        g[2].closure.push("gpui-pre".into());
        let v = check_graph(&g);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].rule, 1);
        assert_eq!(v[0].krate, "closta-presenter");
    }

    #[test]
    fn dev_dependency_on_gpui_is_rule_1() {
        let mut g = clean();
        g[2].closure.push("gpui-kit".into());
        let v = check_graph(&g);
        assert!(
            v.iter()
                .any(|x| x.rule == 1 && x.krate == "closta-presenter")
        );
    }

    #[test]
    fn platform_may_depend_on_gpui() {
        let g = vec![
            pkg("closta-model", &[], &["serde"]),
            pkg("closta-core", &["closta-model"], &["closta-model"]),
            pkg(
                "closta-platform",
                &["closta-core", "closta-model"],
                &["gpui-kit", "gpui"],
            ),
        ];
        assert!(check_graph(&g).is_empty());
    }

    #[test]
    fn outward_dependency_is_rule_2() {
        let mut g = clean();
        g[1].workspace_deps.push("closta-presenter".into());
        let v = check_graph(&g);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].rule, 2);
        assert_eq!(v[0].krate, "closta-core");
    }

    #[test]
    fn async_fn_and_await_are_rule_3() {
        let v = check_model_source("a.rs", "async fn f() {}\nlet y = x.await;\n");
        assert_eq!(v.len(), 2);
        assert!(v.iter().all(|x| x.rule == 3 && x.krate == "closta-model"));
        assert!(v[0].detail.contains("a.rs:1"));
        assert!(v[1].detail.contains("a.rs:2"));
    }

    #[test]
    fn async_in_comment_or_string_is_allowed() {
        let src = "// async\n/* async\n.await */\nlet s = \"async .await\";\nlet r = r#\"async\"#;\nlet c = 'a';\nlet asyncio = 1;\n";
        assert!(check_model_source("a.rs", src).is_empty());
    }
}
