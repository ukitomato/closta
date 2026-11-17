//! Starting `claude` directly on the host. For now only how `claude.exe` is found on Windows.

use super::LaunchError;

/// The `claude.exe` on `path_var` (a Windows `PATH`, `;`-separated, entries maybe quoted), the
/// first in order. A script (`claude.cmd`, `.bat`, `.ps1`) is never run: it goes through
/// `cmd.exe`, whose quoting breaks the arguments. When only a script is found the failure is
/// [`LaunchError::ScriptOnly`]; when nothing is, [`LaunchError::CommandNotFound`].
pub fn locate_claude_exe(
    path_var: &str,
    is_file: &dyn Fn(&str) -> bool,
) -> Result<String, LaunchError> {
    let dirs = path_var
        .split(';')
        .map(|entry| entry.trim_matches('"').trim_end_matches('\\'))
        .filter(|dir| !dir.is_empty());
    let mut script_found = false;
    for dir in dirs {
        let exe = format!(r"{dir}\claude.exe");
        if is_file(&exe) {
            return Ok(exe);
        }
        script_found = script_found
            || ["claude.cmd", "claude.bat", "claude.ps1"]
                .iter()
                .any(|script| is_file(&format!(r"{dir}\{script}")));
    }
    Err(if script_found {
        LaunchError::ScriptOnly
    } else {
        LaunchError::CommandNotFound
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn present(files: &[&str]) -> impl Fn(&str) -> bool {
        let files: Vec<String> = files.iter().map(|f| (*f).to_owned()).collect();
        move |path| files.iter().any(|f| f == path)
    }

    const PATH: &str = "C:\\a;;\"C:\\b\\\"";

    #[test]
    fn claude_exe_wins_and_scripts_alone_are_refused() {
        assert_eq!(
            locate_claude_exe(PATH, &present(&[r"C:\a\claude.cmd", r"C:\b\claude.exe"])),
            Ok(r"C:\b\claude.exe".to_owned())
        );
        assert_eq!(
            locate_claude_exe(PATH, &present(&[r"C:\a\claude.cmd"])),
            Err(LaunchError::ScriptOnly)
        );
        assert_eq!(
            locate_claude_exe(PATH, &present(&[])),
            Err(LaunchError::CommandNotFound)
        );
    }

    #[test]
    fn every_script_kind_is_refused_and_the_first_exe_is_taken() {
        for script in ["claude.bat", "claude.ps1"] {
            assert_eq!(
                locate_claude_exe(PATH, &present(&[&format!(r"C:\b\{script}")])),
                Err(LaunchError::ScriptOnly),
                "{script}"
            );
        }
        assert_eq!(
            locate_claude_exe(
                r"C:\a\\;C:\b",
                &present(&[r"C:\a\claude.exe", r"C:\b\claude.exe"])
            ),
            Ok(r"C:\a\claude.exe".to_owned())
        );
        assert_eq!(
            locate_claude_exe("", &present(&[r"\claude.exe"])),
            Err(LaunchError::CommandNotFound)
        );
    }
}
