//! The mouth between the paths the CLI knows and the paths the host knows. For a project in WSL the
//! CLI runs in Linux while Windows reads the same files by UNC paths; anywhere else the two are the
//! same and nothing changes. Mirrors CliPaths.kt (`toIde` is [`CliPaths::to_host`]).

use super::wsl::{WslLocation, same_ignoring_case};

/// How paths cross between the CLI and the host for one project folder.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum CliPaths {
    /// The CLI and the host share one file system: every path is its own.
    Native,
    /// A project of `location`'s distribution. `host_root` is the project's own UNC head
    /// (`//wsl.localhost/Ubuntu` or `\\wsl$\Ubuntu`, host and separators as the project has them),
    /// so the paths made agree with the host's.
    Wsl {
        location: WslLocation,
        host_root: String,
    },
}

/// The paths for the project folder `directory`: [`CliPaths::Wsl`] when it is a UNC path on a WSL
/// host and the host is Windows, [`CliPaths::Native`] otherwise. The head is taken from the folder
/// as written, so a `\\wsl$\Ubuntu\…` project makes `\\wsl$\Ubuntu\…` paths.
pub fn cli_paths_for(directory: Option<&str>, host_on_windows: bool) -> CliPaths {
    let (Some(location), Some(directory)) =
        (WslLocation::parse(directory, host_on_windows), directory)
    else {
        return CliPaths::Native;
    };
    let slashed = directory.replace('\\', "/");
    let mut parts = slashed.strip_prefix("//").unwrap_or(&slashed).split('/');
    let (host, distro) = (
        parts.next().unwrap_or_default(),
        parts.next().unwrap_or_default(),
    );
    let separator = directory.chars().next().unwrap_or('/');
    CliPaths::Wsl {
        location,
        host_root: format!("{separator}{separator}{host}{separator}{distro}"),
    }
}

impl CliPaths {
    /// The host's path for a path the CLI gave.
    pub fn to_host(&self, cli_path: &str) -> String {
        let CliPaths::Wsl { host_root, .. } = self else {
            return cli_path.to_owned();
        };
        if let Some((letter, rest)) = mnt_drive(cli_path) {
            let rest = rest.replace('/', "\\");
            let rest = if rest.is_empty() { "\\" } else { &rest };
            format!("{}:{rest}", letter.to_ascii_uppercase())
        } else if cli_path.starts_with('/') {
            let separator = host_root.chars().next().unwrap_or('/');
            format!(
                "{host_root}{}",
                cli_path.replace('/', &separator.to_string())
            )
        } else {
            cli_path.to_owned()
        }
    }

    /// The CLI's path for a path the host gave.
    pub fn to_cli(&self, host_path: &str) -> String {
        let CliPaths::Wsl { location, .. } = self else {
            return host_path.to_owned();
        };
        match WslLocation::parse(Some(host_path), true) {
            Some(there) if same_ignoring_case(&there.distro, &location.distro) => there.linux_path,
            _ => match drive(host_path) {
                Some((letter, rest)) => format!(
                    "/mnt/{}{}",
                    letter.to_ascii_lowercase(),
                    rest.replace('\\', "/")
                ),
                None => host_path.to_owned(),
            },
        }
    }
}

// Kotlin's MNT, `^/mnt/([A-Za-z])((?:/.*)?)$`: the drive letter and the rest (empty, or from `/`).
fn mnt_drive(path: &str) -> Option<(char, &str)> {
    let after = path.strip_prefix("/mnt/")?;
    let letter = after.chars().next().filter(char::is_ascii_alphabetic)?;
    let rest = &after[1..];
    (rest.is_empty() || rest.starts_with('/') && no_line_break(rest)).then_some((letter, rest))
}

// Kotlin's DRIVE, `^([A-Za-z]):([\\/].*)$`: the drive letter and the rest from its separator.
fn drive(path: &str) -> Option<(char, &str)> {
    let letter = path.chars().next().filter(char::is_ascii_alphabetic)?;
    let rest = path[1..].strip_prefix(':')?;
    (rest.starts_with(['\\', '/']) && no_line_break(rest)).then_some((letter, rest))
}

// A Kotlin (Java) `.` matches any character but these line terminators.
fn no_line_break(text: &str) -> bool {
    !text.contains(['\n', '\r', '\u{85}', '\u{2028}', '\u{2029}'])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slash() -> CliPaths {
        cli_paths_for(Some("//wsl.localhost/Ubuntu/home/u/proj"), true)
    }

    fn back() -> CliPaths {
        cli_paths_for(Some(r"\\wsl$\Ubuntu\home\u\proj"), true)
    }

    #[test]
    fn a_linux_path_gets_the_projects_own_head() {
        assert_eq!(
            slash().to_host("/home/u/proj/a.kt"),
            "//wsl.localhost/Ubuntu/home/u/proj/a.kt"
        );
        assert_eq!(
            slash().to_host("/etc/hosts"),
            "//wsl.localhost/Ubuntu/etc/hosts"
        );
        assert_eq!(
            back().to_host("/home/u/proj/a.kt"),
            r"\\wsl$\Ubuntu\home\u\proj\a.kt"
        );
        assert_eq!(slash().to_host("relative/a.kt"), "relative/a.kt");
    }

    #[test]
    fn the_root_of_the_distribution_gives_the_same_head_with_or_without_a_trailing_separator() {
        for root in ["//wsl.localhost/Ubuntu", "//wsl.localhost/Ubuntu/"] {
            assert_eq!(
                cli_paths_for(Some(root), true).to_host("/x"),
                "//wsl.localhost/Ubuntu/x",
                "{root}"
            );
        }
    }

    #[test]
    fn a_unc_path_of_the_same_distribution_becomes_the_linux_path_whatever_the_host_separators_or_case()
     {
        assert_eq!(
            slash().to_cli("//wsl.localhost/Ubuntu/home/u/x"),
            "/home/u/x"
        );
        assert_eq!(slash().to_cli(r"\\wsl$\ubuntu\home\u\x"), "/home/u/x");
        assert_eq!(
            back().to_cli("//WSL.LOCALHOST/UBUNTU/home/u/x"),
            "/home/u/x"
        );
    }

    #[test]
    fn another_distribution_a_relative_path_and_a_linux_path_stay_as_they_are() {
        assert_eq!(
            slash().to_cli("//wsl.localhost/Debian/x"),
            "//wsl.localhost/Debian/x"
        );
        assert_eq!(slash().to_cli("src/a.kt"), "src/a.kt");
        assert_eq!(slash().to_cli("/home/u/x"), "/home/u/x");
        assert_eq!(slash().to_cli("//server/share/x"), "//server/share/x");
    }

    #[test]
    fn a_drive_path_and_its_mnt_form_go_both_ways_and_close() {
        let slash = slash();
        assert_eq!(slash.to_cli(r"C:\Users\u\a.txt"), "/mnt/c/Users/u/a.txt");
        assert_eq!(slash.to_cli("C:/Users/u/a.txt"), "/mnt/c/Users/u/a.txt");
        assert_eq!(slash.to_host("/mnt/c/Users/u/a.txt"), r"C:\Users\u\a.txt");
        assert_eq!(slash.to_host("/mnt/c"), r"C:\");
        assert_eq!(
            slash.to_host(&slash.to_cli(r"C:\Users\u\a.txt")),
            r"C:\Users\u\a.txt"
        );
        assert_eq!(
            slash.to_host("/mnt/cc/x"),
            "//wsl.localhost/Ubuntu/mnt/cc/x"
        );
    }

    #[test]
    fn a_path_that_is_not_a_wsl_one_is_not_changed_in_either_direction() {
        for paths in [
            cli_paths_for(Some("/work/proj"), true),
            cli_paths_for(Some("//wsl.localhost/Ubuntu/home/u/proj"), false),
            cli_paths_for(None, true),
            cli_paths_for(Some("//server/share/proj"), true),
        ] {
            assert_eq!(paths, CliPaths::Native);
            for path in [
                "/home/u/a.kt",
                r"C:\x\a.txt",
                "//wsl.localhost/Ubuntu/x",
                "file:///home/u/a.kt",
                "a.kt",
            ] {
                assert_eq!(paths.to_host(path), path);
                assert_eq!(paths.to_cli(path), path);
            }
        }
    }
}
