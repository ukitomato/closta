//! `cargo xtask gallery-capture` and `cargo xtask synth-capture`: run the goldens example of the
//! same name, which writes its replay files to `<desktop>/target/replay`. xtask does not depend on
//! `closta-goldens`; it runs the example under the shared lock instead.

use std::path::Path;

use crate::check::{Step, locked_cargo};

/// The examples xtask runs, by the command's name.
pub const EXAMPLES: [&str; 2] = ["gallery-capture", "synth-capture"];

/// The one step of the capture command `name`, writing under `root/target/replay`.
pub fn steps(name: &'static str, root: &Path) -> Vec<Step> {
    let dir = root.join("target").join("replay");
    let dir = dir.to_string_lossy();
    vec![locked_cargo(
        name,
        &[
            "run",
            "-j",
            "4",
            "-p",
            "closta-goldens",
            "--example",
            name,
            "--",
            &dir,
        ],
    )]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_commands_run_the_goldens_examples_under_the_lock() {
        for name in EXAMPLES {
            let steps = steps(name, Path::new("/d"));
            let [Step::Command { program, args, .. }] = steps.as_slice() else {
                panic!("one command for {name}");
            };
            assert_eq!("flock", program);
            assert_eq!(
                vec![
                    "/tmp/closta-gradle.lock",
                    "cargo",
                    "run",
                    "-j",
                    "4",
                    "-p",
                    "closta-goldens",
                    "--example",
                    name,
                    "--",
                    "/d/target/replay",
                ],
                *args
            );
        }
    }
}
