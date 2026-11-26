//! Projects: the folders sessions run in, keyed by the place they name and shown by a name that
//! tells apart projects called the same. Nothing here touches the screen or the disk.

use std::fmt;

use closta_providers::claude::launch::wsl::WslLocation;

use crate::copy;
use crate::new_session::{Runtime, folder_title, runtime_of};

/// Compares folders by the place they name, however they were written. Not for display.
#[derive(Clone, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub struct ProjectKey(String);

// Written by hand: the key holds the folder path.
impl fmt::Debug for ProjectKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ProjectKey(..)")
    }
}

impl ProjectKey {
    #[cfg(test)]
    fn text(&self) -> &str {
        &self.0
    }
}

/// The key of `folder`, or `None` when it is blank. WSL folders keep the case of the Linux path
/// (the distribution's name does not matter); Windows folders ignore case, the direction of
/// separators and trailing separators.
pub fn project_key(folder: &str) -> Option<ProjectKey> {
    let folder = folder.trim();
    if folder.is_empty() {
        return None;
    }
    if let Some(location) = WslLocation::parse(Some(folder), true) {
        return Some(ProjectKey(format!(
            "wsl:{}:{}",
            location.distro.to_lowercase(),
            location.linux_path
        )));
    }
    let slashed = folder.replace('/', "\\");
    let stripped = slashed.trim_end_matches('\\');
    let is_drive = {
        let bytes = stripped.as_bytes();
        bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
    };
    let mut key = stripped.to_lowercase();
    if stripped.len() < slashed.len() && (is_drive || stripped.is_empty()) {
        key.push('\\');
    }
    Some(ProjectKey(key))
}

/// A folder the user works in, as the list shows it.
#[derive(Clone, PartialEq, Eq)]
pub struct Project {
    pub key: ProjectKey,
    /// How the folder was first written (trimmed).
    pub folder: String,
    pub name: String,
    pub runtime: Runtime,
    pub collapsed: bool,
}

// Written by hand: the folder and the name are the user's.
impl fmt::Debug for Project {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Project")
            .field("name_len", &self.name.len())
            .field("runtime", &runtime_debug(&self.runtime))
            .field("collapsed", &self.collapsed)
            .finish()
    }
}

fn runtime_debug(runtime: &Runtime) -> &'static str {
    match runtime {
        Runtime::Wsl { .. } => "Wsl",
        Runtime::Win32 => "Win32",
    }
}

impl Project {
    /// The project of `folder`, or `None` when it is blank.
    pub fn new(folder: &str) -> Option<Project> {
        let key = project_key(folder)?;
        let folder = folder.trim();
        Some(Project {
            key,
            folder: folder.to_owned(),
            name: folder_title(folder),
            runtime: runtime_of(folder),
            collapsed: false,
        })
    }
}

/// The folders above the project's own, nearest first. A WSL folder is counted inside its
/// distribution; the drive of a Windows folder counts as a folder.
fn parents(project: &Project) -> Vec<String> {
    let mut parts: Vec<String> = match WslLocation::parse(Some(&project.folder), true) {
        Some(location) => location.linux_path.split('/').map(str::to_owned).collect(),
        None => project
            .folder
            .split(['\\', '/'])
            .map(str::to_owned)
            .collect(),
    };
    parts.retain(|part| !part.is_empty());
    parts.pop();
    parts.reverse();
    parts
}

fn same_runtime(a: &Runtime, b: &Runtime) -> bool {
    match (a, b) {
        (Runtime::Wsl { distro: a }, Runtime::Wsl { distro: b }) => {
            a.to_lowercase() == b.to_lowercase()
        }
        (Runtime::Win32, Runtime::Win32) => true,
        _ => false,
    }
}

/// The name a heading or a row shows: the project's name, with what tells it from the projects of
/// the same name in `all` (the runtime, the distribution, then the folders above).
pub fn display_name(project: &Project, all: &[Project]) -> String {
    let named: Vec<&Project> = all
        .iter()
        .filter(|other| other.key != project.key && other.name == project.name)
        .collect();
    if named.is_empty() {
        return project.name.clone();
    }
    let kind_differs = named
        .iter()
        .any(|other| copy::runtime_kind(&other.runtime) != copy::runtime_kind(&project.runtime));
    let mut parts: Vec<String> = Vec::new();
    let peers: Vec<&Project> = named
        .iter()
        .copied()
        .filter(|other| same_runtime(&other.runtime, &project.runtime))
        .collect();
    let distro_differs = named.iter().any(|other| {
        copy::runtime_kind(&other.runtime) == copy::runtime_kind(&project.runtime)
            && !same_runtime(&other.runtime, &project.runtime)
    });
    if distro_differs {
        parts.push(copy::runtime_label(&project.runtime));
    } else if kind_differs {
        parts.push(copy::runtime_kind(&project.runtime).to_owned());
    }
    if !peers.is_empty() {
        let mine = parents(project);
        let others: Vec<Vec<String>> = peers.iter().map(|peer| parents(peer)).collect();
        let longest = others
            .iter()
            .map(Vec::len)
            .chain([mine.len()])
            .max()
            .unwrap_or(0);
        let shown = |chain: &[String], depth: usize| {
            let take = depth.min(chain.len());
            chain[..take]
                .iter()
                .rev()
                .cloned()
                .collect::<Vec<_>>()
                .join("/")
        };
        let depth = (1..=longest)
            .find(|&depth| {
                let mine = shown(&mine, depth);
                others.iter().all(|other| shown(other, depth) != mine)
            })
            .unwrap_or(longest);
        let text = shown(&mine, depth);
        if !text.is_empty() {
            parts.push(text);
        }
    }
    if parts.is_empty() {
        project.name.clone()
    } else {
        format!("{} ({})", project.name, parts.join(" · "))
    }
}

/// [`display_name`] of every project, in the order of `all`.
pub fn display_names(all: &[Project]) -> Vec<String> {
    all.iter()
        .map(|project| display_name(project, all))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(folder: &str) -> ProjectKey {
        project_key(folder).unwrap()
    }

    fn names(folders: &[&str]) -> Vec<String> {
        let all: Vec<Project> = folders.iter().map(|f| Project::new(f).unwrap()).collect();
        display_names(&all)
    }

    #[test]
    fn the_same_place_written_two_ways_has_one_key() {
        assert_eq!(
            key(r"\\wsl$\Ubuntu\home\x"),
            key(r"\\wsl.localhost\ubuntu\home\x\")
        );
        assert_eq!(
            key(r"\\wsl$\Ubuntu\home\x"),
            key("//wsl.localhost/Ubuntu/home/x")
        );
        assert_eq!(key(r"C:\Work"), key("c:/work"));
        assert_eq!(key(r"C:\Work"), key(r"C:\Work\"));
    }

    #[test]
    fn a_drive_root_and_a_distribution_root_keep_their_separator() {
        assert_eq!(key(r"C:\"), key("C:/"));
        assert_eq!(key(r"C:\").text(), "c:\\");
        assert_eq!(key(r"C:\\\").text(), "c:\\");
        assert!(
            key(r"\\wsl.localhost\Ubuntu\")
                .text()
                .ends_with("wsl:ubuntu:/")
        );
    }

    #[test]
    fn linux_paths_keep_their_case() {
        assert_ne!(
            key(r"\\wsl.localhost\Ubuntu\home\X"),
            key(r"\\wsl.localhost\Ubuntu\home\x")
        );
    }

    #[test]
    fn a_blank_folder_has_no_key() {
        assert!(project_key("").is_none());
        assert!(project_key("   ").is_none());
        assert!(Project::new("  ").is_none());
    }

    #[test]
    fn a_project_keeps_the_first_writing_trimmed() {
        let project = Project::new(r"  C:\Work\Closta\ ").unwrap();
        assert_eq!(project.folder, r"C:\Work\Closta\");
        assert_eq!(project.name, "Closta");
        assert_eq!(project.runtime, Runtime::Win32);
        assert!(!project.collapsed);
    }

    #[test]
    fn a_name_alone_is_shown_as_it_is() {
        assert_eq!(names(&[r"C:\a\closta", r"C:\a\other"]), ["closta", "other"]);
    }

    #[test]
    fn the_same_name_on_another_runtime_says_the_runtime() {
        assert_eq!(
            names(&[r"C:\a\closta", r"\\wsl.localhost\Ubuntu\home\me\closta"]),
            ["closta (Windows)", "closta (WSL)"]
        );
    }

    #[test]
    fn the_same_name_on_the_same_runtime_says_the_folder_above() {
        let base = r"\\wsl.localhost\Ubuntu\home";
        assert_eq!(
            names(&[
                &format!(r"{base}\a\tools\closta"),
                &format!(r"{base}\a\work\closta")
            ]),
            ["closta (tools)", "closta (work)"]
        );
        assert_eq!(
            names(&[
                &format!(r"{base}\a\x\tools\closta"),
                &format!(r"{base}\b\x\tools\closta")
            ]),
            ["closta (a/x/tools)", "closta (b/x/tools)"]
        );
    }

    #[test]
    fn a_folder_with_no_more_parents_uses_what_it_has() {
        assert_eq!(
            names(&[r"C:\closta", r"C:\x\closta"]),
            ["closta (C:)", "closta (x)"]
        );
    }

    #[test]
    fn the_same_path_in_two_distributions_says_the_distribution() {
        assert_eq!(
            names(&[
                r"\\wsl.localhost\Ubuntu\home\me\p",
                r"\\wsl.localhost\Debian\home\me\p"
            ]),
            ["p (WSL · Ubuntu)", "p (WSL · Debian)"]
        );
    }

    #[test]
    fn debug_shows_no_folder_or_name() {
        let project = Project::new(r"\\wsl.localhost\Ubuntu\home\closta").unwrap();
        for text in [format!("{project:?}"), format!("{:?}", project.key)] {
            assert!(!text.contains("closta"), "{text}");
            assert!(!text.contains("home"), "{text}");
            assert!(!text.contains("Ubuntu"), "{text}");
        }
        assert!(format!("{project:?}").contains("Wsl"));
    }
}
