use std::path::Path;
use std::process::Command;

use anyhow::{Context, bail};

/// The Windows-side copy of `desktop/`, as seen from WSL. The Windows build
/// needs the Windows SDK shader compiler and Windows paths, so it runs on Windows.
pub const WIN_COPY_WSL: &str = "/mnt/c/dev/tools/closta/desktop";
/// The same copy as Windows sees it.
pub const WIN_COPY: &str = r"C:\dev\tools\closta\desktop";

fn with_slash(path: &str) -> String {
    if path.ends_with('/') {
        path.to_owned()
    } else {
        format!("{path}/")
    }
}

/// Mirrors `src` into `dest`, leaving the Windows `target\` alone so the
/// dependencies are not rebuilt from scratch every time. Notes at the top of
/// `desktop/` are not part of the build and stay behind.
pub fn rsync_args(src: &Path, dest: &str) -> Vec<String> {
    vec![
        "-a".to_owned(),
        "--delete".to_owned(),
        "--exclude".to_owned(),
        "/target".to_owned(),
        "--exclude".to_owned(),
        "/*.md".to_owned(),
        with_slash(&src.to_string_lossy()),
        with_slash(dest),
    ]
}

pub fn exe_path(release: bool) -> String {
    let profile = if release { "release" } else { "debug" };
    format!(r"{WIN_COPY}\target\{profile}\closta.exe")
}

/// The PowerShell that builds on Windows. Cargo's output is left as it is and
/// its exit code becomes the script's, so a failed build fails the task.
pub fn powershell_script(release: bool, run: bool) -> String {
    let mut lines = vec![
        "[Console]::OutputEncoding = [Text.Encoding]::UTF8".to_owned(),
        format!("Set-Location '{WIN_COPY}' -ErrorAction Stop"),
        // A standalone Rust install earlier on PATH would ignore rust-toolchain.toml,
        // so rustup's proxies go first.
        "$env:Path = (Split-Path (Get-Command rustup -ErrorAction Stop).Source) + ';' + $env:Path"
            .to_owned(),
        if release {
            "cargo build --release".to_owned()
        } else {
            "cargo build".to_owned()
        },
    ];
    if run {
        lines.push(format!(
            "if ($LASTEXITCODE -eq 0) {{ Start-Process '{}' -ErrorAction Stop }}",
            exe_path(release)
        ));
    }
    // A cargo that never started leaves $LASTEXITCODE unset, and `exit $null` is 0.
    lines.push("if ($null -eq $LASTEXITCODE) { exit 1 }".to_owned());
    lines.push("exit $LASTEXITCODE".to_owned());
    lines.join("; ")
}

/// Copies `desktop/` to Windows and builds it there.
pub fn win_build(root: &Path, release: bool, run: bool) -> anyhow::Result<()> {
    println!("==> rsync to {WIN_COPY_WSL}");
    let status = Command::new("rsync")
        .args(rsync_args(root, WIN_COPY_WSL))
        .status()
        .context("could not start `rsync`")?;
    if !status.success() {
        bail!("rsync failed with {status}");
    }

    println!("==> cargo build on Windows");
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &powershell_script(release, run),
        ])
        .status()
        .context("could not start `powershell.exe`")?;
    if !status.success() {
        bail!("the Windows build failed with {status}");
    }
    println!("{}", exe_path(release));
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn rsync_args_keep_windows_target() {
        let args = rsync_args(Path::new("/src/desktop"), WIN_COPY_WSL);
        assert_eq!(
            args,
            [
                "-a",
                "--delete",
                "--exclude",
                "/target",
                "--exclude",
                "/*.md",
                "/src/desktop/",
                "/mnt/c/dev/tools/closta/desktop/",
            ]
        );
    }

    #[test]
    fn powershell_script_propagates_cargo_exit_code() {
        let script = powershell_script(false, false);
        assert!(script.contains("[Console]::OutputEncoding = [Text.Encoding]::UTF8"));
        assert!(script.contains(r"Set-Location 'C:\dev\tools\closta\desktop'"));
        assert!(!script.contains("Select-String"));
        assert!(script.ends_with("exit $LASTEXITCODE"));
    }

    #[test]
    fn powershell_script_puts_rustup_first_on_path() {
        let script = powershell_script(false, false);
        let path = script
            .find("(Get-Command rustup -ErrorAction Stop).Source")
            .unwrap();
        assert!(path < script.find("cargo build").unwrap());
    }

    #[test]
    fn powershell_script_fails_when_cargo_never_started() {
        let script = powershell_script(false, false);
        assert!(script.contains("if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE"));
    }

    #[test]
    fn release_and_run_flags_change_the_script() {
        assert!(powershell_script(true, false).contains("cargo build --release"));
        let debug = powershell_script(false, false);
        assert!(debug.contains("cargo build"));
        assert!(!debug.contains("--release"));
        assert!(!debug.contains("Start-Process"));

        let run = powershell_script(true, true);
        let start = format!("Start-Process '{}' -ErrorAction Stop", exe_path(true));
        let guarded = format!("if ($LASTEXITCODE -eq 0) {{ {start} }}");
        assert!(run.contains(&guarded), "{run}");
        assert_eq!(run.matches("Start-Process").count(), 1);
    }

    #[test]
    fn exe_path_points_at_the_closta_binary() {
        assert_eq!(
            exe_path(false),
            r"C:\dev\tools\closta\desktop\target\debug\closta.exe"
        );
        assert_eq!(
            exe_path(true),
            r"C:\dev\tools\closta\desktop\target\release\closta.exe"
        );
    }
}
