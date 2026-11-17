//! The environment a launch gives its child. Mirrors `overlayEnvironment` in ProcessSpawner.kt.

use std::collections::{BTreeMap, BTreeSet};
use std::ffi::{OsStr, OsString};
use std::fmt;

/// Environment variables for a launch, auth among them. The values never appear in any string
/// form: `Debug` shows only the count, and there is no `Display` or `Serialize`.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct SecretEnv(BTreeMap<String, String>);

impl SecretEnv {
    pub fn insert(&mut self, name: impl Into<String>, value: impl Into<String>) {
        self.0.insert(name.into(), value.into());
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.0.get(name).map(String::as_str)
    }

    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.0.keys().map(String::as_str)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &str)> {
        self.0.iter().map(|(k, v)| (k.as_str(), v.as_str()))
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// This env with `over` laid on it: a name in `over` wins.
    #[must_use]
    pub fn overlaid(&self, over: &SecretEnv) -> SecretEnv {
        let mut merged = self.0.clone();
        merged.extend(over.0.iter().map(|(k, v)| (k.clone(), v.clone())));
        SecretEnv(merged)
    }
}

impl FromIterator<(String, String)> for SecretEnv {
    fn from_iter<I: IntoIterator<Item = (String, String)>>(iter: I) -> Self {
        SecretEnv(iter.into_iter().collect())
    }
}

impl fmt::Debug for SecretEnv {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SecretEnv(<{} redacted>)", self.0.len())
    }
}

/// The child's environment: `inherited` without the `dropped` names, with `overlay` laid over it
/// (a name in `overlay` wins). Names are compared ignoring ASCII case on Windows, exactly elsewhere.
pub fn child_environment(
    inherited: &[(OsString, OsString)],
    dropped: &BTreeSet<String>,
    overlay: &SecretEnv,
) -> Vec<(OsString, OsString)> {
    overlay_with(inherited, dropped, overlay, cfg!(windows))
}

fn overlay_with(
    inherited: &[(OsString, OsString)],
    dropped: &BTreeSet<String>,
    overlay: &SecretEnv,
    ignore_case: bool,
) -> Vec<(OsString, OsString)> {
    let named = |name: &OsStr, other: &str| {
        if ignore_case {
            name.to_string_lossy().eq_ignore_ascii_case(other)
        } else {
            name == other
        }
    };
    inherited
        .iter()
        .filter(|(name, _)| {
            !dropped.iter().any(|d| named(name, d)) && !overlay.names().any(|o| named(name, o))
        })
        .cloned()
        .chain(
            overlay
                .iter()
                .map(|(name, value)| (OsString::from(name), OsString::from(value))),
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> SecretEnv {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect()
    }

    fn os(pairs: &[(&str, &str)]) -> Vec<(OsString, OsString)> {
        pairs
            .iter()
            .map(|(k, v)| (OsString::from(k), OsString::from(v)))
            .collect()
    }

    fn names(list: &[&str]) -> BTreeSet<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    // A stand-in set of names to drop. Bedrock, whose launch decides the real set, comes in a
    // later stage.
    const DROPPED: [&str; 4] = [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_PROFILE",
    ];

    fn inherited() -> Vec<(OsString, OsString)> {
        let mut list = os(&[
            ("PATH", "/usr/bin"),
            ("HTTPS_PROXY", "http://proxy.example:8080"),
            ("ANTHROPIC_BEDROCK_BASE_URL", "https://bedrock.vpce.example"),
            ("AWS_DEFAULT_REGION", "eu-west-1"),
        ]);
        list.extend(DROPPED.iter().map(|name| {
            (
                OsString::from(name),
                OsString::from(format!("inherited-{name}")),
            )
        }));
        list
    }

    fn lookup<'a>(list: &'a [(OsString, OsString)], name: &str) -> Option<&'a OsStr> {
        list.iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_os_str())
    }

    #[test]
    fn the_dropped_names_go_and_the_rest_stays() {
        let child = child_environment(&inherited(), &names(&DROPPED), &SecretEnv::default());
        for name in DROPPED {
            assert!(lookup(&child, name).is_none(), "kept {name}");
        }
        assert_eq!(lookup(&child, "PATH"), Some(OsStr::new("/usr/bin")));
        assert_eq!(
            lookup(&child, "HTTPS_PROXY"),
            Some(OsStr::new("http://proxy.example:8080"))
        );
        assert_eq!(
            lookup(&child, "ANTHROPIC_BEDROCK_BASE_URL"),
            Some(OsStr::new("https://bedrock.vpce.example"))
        );
        assert_eq!(
            lookup(&child, "AWS_DEFAULT_REGION"),
            Some(OsStr::new("eu-west-1"))
        );
    }

    #[test]
    fn the_launch_env_wins_over_what_was_inherited() {
        let child = child_environment(
            &inherited(),
            &names(&DROPPED),
            &env(&[
                ("AWS_ACCESS_KEY_ID", "AKIA_INJECTED"),
                ("AWS_PROFILE", "set-by-the-launch"),
            ]),
        );
        assert_eq!(
            lookup(&child, "AWS_ACCESS_KEY_ID"),
            Some(OsStr::new("AKIA_INJECTED"))
        );
        // A name the launch sets itself is the launch's, even when the inherited one was dropped.
        assert_eq!(
            lookup(&child, "AWS_PROFILE"),
            Some(OsStr::new("set-by-the-launch"))
        );
        assert_eq!(
            child.iter().filter(|(k, _)| k == "AWS_PROFILE").count(),
            1,
            "one entry per name"
        );
    }

    #[test]
    fn child_environment_drops_then_overlays() {
        let child = child_environment(
            &os(&[("A", "1"), ("DROP", "2"), ("B", "3")]),
            &names(&["DROP"]),
            &env(&[("B", "9"), ("C", "4")]),
        );
        assert_eq!(child, os(&[("A", "1"), ("B", "9"), ("C", "4")]));
    }

    #[test]
    fn names_match_ignoring_case_only_where_the_os_does() {
        let inherited = os(&[("Path", "C:\\bin"), ("aws_profile", "old"), ("Keep", "k")]);
        let dropped = names(&["AWS_PROFILE"]);
        let overlay = env(&[("PATH", "D:\\bin")]);

        let windows = overlay_with(&inherited, &dropped, &overlay, true);
        assert_eq!(windows, os(&[("Keep", "k"), ("PATH", "D:\\bin")]));

        let exact = overlay_with(&inherited, &dropped, &overlay, false);
        assert_eq!(
            exact,
            os(&[
                ("Path", "C:\\bin"),
                ("aws_profile", "old"),
                ("Keep", "k"),
                ("PATH", "D:\\bin"),
            ])
        );
    }

    #[test]
    fn overlaid_lets_the_other_env_win() {
        let base = env(&[("A", "1"), ("B", "2")]);
        let merged = base.overlaid(&env(&[("B", "9"), ("C", "3")]));
        assert_eq!(merged, env(&[("A", "1"), ("B", "9"), ("C", "3")]));
        assert_eq!(merged.len(), 3);
        assert_eq!(merged.get("B"), Some("9"));
        assert_eq!(merged.names().collect::<Vec<_>>(), ["A", "B", "C"]);
        assert!(SecretEnv::default().is_empty());
    }

    #[test]
    fn debug_counts_the_values_and_shows_none() {
        let shown = format!(
            "{:?}",
            env(&[("ANTHROPIC_API_KEY", "sk-secret"), ("K", "v")])
        );
        assert_eq!(shown, "SecretEnv(<2 redacted>)");
    }
}
