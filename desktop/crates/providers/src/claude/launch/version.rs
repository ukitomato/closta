//! `claude --version`, run before the session the way the session itself will be started (same
//! spawner, environment and folder). It doubles as the PATH check. Mirrors ClaudeVersionProbe.kt.

use std::future::Future;
use std::time::{Duration, Instant};

use async_io::Timer;
use futures_lite::{StreamExt, future};

use crate::claude::launch::LaunchError;
use crate::claude::process::{AgentProcess, ProcessFailure};

/// How long the check may take, the spawn included: on Windows a spawn alone can take seconds.
pub const VERSION_TIMEOUT: Duration = Duration::from_secs(30);

const MAX_PART_DIGITS: usize = 9;
const MAX_SUFFIX: usize = 32;

/// Why the check failed. It names only the kind, never what the process printed: the `claude` on
/// PATH may be something else, and it runs with the launch's environment.
#[derive(Clone, PartialEq, Debug)]
pub enum VersionFailure {
    /// The process could not be started.
    Spawn(LaunchError),
    /// It ended with a code other than 0 (127 is the shell's "command not found").
    Exit(i32),
    /// It did not end in time.
    NoAnswer,
    /// It ended with 0 and printed no line that is not blank.
    NoOutput,
    /// Its first line that is not blank does not start with a version.
    NotAVersion,
}

/// The first word of `line` when it is a version, such as `2.1.325` in `2.1.325 (Claude Code)`:
/// digits.digits.digits (1 to 9 digits each) and up to 32 more of `[0-9A-Za-z.+-]`, the whole word.
/// Written by hand for `\d{1,9}\.\d{1,9}\.\d{1,9}[0-9A-Za-z.+-]{0,32}`.
pub fn version_of(line: &str) -> Option<&str> {
    let word = line.trim().split([' ', '\t']).next()?;
    let mut parts = word.splitn(3, '.');
    let is_number = |part: &str| {
        (1..=MAX_PART_DIGITS).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_digit())
    };
    if !(parts.next().is_some_and(is_number) && parts.next().is_some_and(is_number)) {
        return None;
    }
    let rest = parts.next()?;
    let leading = rest.bytes().take_while(u8::is_ascii_digit).count();
    let suffix_allowed = |b: u8| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'+' | b'-');
    // The third number takes up to 9 leading digits and the suffix the rest, as the regex would.
    let fits = leading >= 1
        && rest.len() <= leading.min(MAX_PART_DIGITS) + MAX_SUFFIX
        && rest.bytes().all(suffix_allowed);
    fits.then_some(word)
}

/// Runs the check within [`VERSION_TIMEOUT`]. `spawned` starts `claude --version` (a
/// [`crate::claude::launch::Launch::version_check`]); the caller decides where the synchronous
/// spawn runs.
pub async fn check_version(
    spawned: impl Future<Output = Result<Box<dyn AgentProcess>, LaunchError>>,
) -> Result<String, VersionFailure> {
    check_version_within(spawned, VERSION_TIMEOUT).await
}

/// Runs the check within `timeout`, the spawn included. The process is destroyed and dropped
/// before this returns, on every path. Dropping this future drops the process, which kills it; a
/// process whose spawn ends after this was dropped is dropped, and killed, where it is returned.
pub async fn check_version_within(
    spawned: impl Future<Output = Result<Box<dyn AgentProcess>, LaunchError>>,
    timeout: Duration,
) -> Result<String, VersionFailure> {
    let deadline = Instant::now() + timeout;
    let spawned = future::or(async { Some(spawned.await) }, async {
        Timer::at(deadline).await;
        None
    })
    .await;
    let mut process = match spawned {
        None => return Err(VersionFailure::NoAnswer),
        Some(Err(failure)) => return Err(VersionFailure::Spawn(failure)),
        Some(Ok(process)) => process,
    };
    let answer = future::or(answer_of(process.as_mut()), async {
        Timer::at(deadline).await;
        Err(VersionFailure::NoAnswer)
    })
    .await;
    process.destroy();
    drop(process);
    answer
}

/// Reads stdout to its end, as the session's pump does, with stderr drained on the race's side.
async fn answer_of(process: &mut dyn AgentProcess) -> Result<String, VersionFailure> {
    let lines = process.take_stdout_lines();
    let drain = process.take_stderr_drain();
    let reading = async {
        let Some(mut lines) = lines else {
            return Err(VersionFailure::NoOutput);
        };
        let mut first = None;
        while let Some(next) = lines.next().await {
            match next {
                Ok(line) => {
                    let line = line.trim();
                    if first.is_none() && !line.is_empty() {
                        first = Some(line.to_owned());
                    }
                }
                Err(ProcessFailure::Exit(code)) => return Err(VersionFailure::Exit(code)),
                // As in Kotlin, a read that breaks keeps what was read, and the exit code decides.
                Err(ProcessFailure::Io(_)) => match process.wait().await {
                    Ok(0) => break,
                    Ok(code) => return Err(VersionFailure::Exit(code)),
                    Err(_) => return Err(VersionFailure::NoAnswer),
                },
            }
        }
        let first = first.ok_or(VersionFailure::NoOutput)?;
        version_of(&first)
            .map(str::to_owned)
            .ok_or(VersionFailure::NotAVersion)
    };
    let draining = async {
        if let Some(drain) = drain {
            drain.await;
        }
        future::pending().await
    };
    future::race(reading, draining).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::fake::process::{
        FakeProcess, FakeProcessProbe, ProcessBeat, ProcessScript, ProcessTermination,
    };

    fn fake(lines: &[&str], termination: ProcessTermination) -> (FakeProcess, FakeProcessProbe) {
        FakeProcess::new(ProcessScript {
            beats: lines
                .iter()
                .map(|line| ProcessBeat::Line((*line).to_owned()))
                .collect(),
            termination,
            stdin_fails: false,
        })
    }

    fn check(process: FakeProcess) -> Result<String, VersionFailure> {
        let spawned = future::ready(Ok(Box::new(process) as Box<dyn AgentProcess>));
        future::block_on(check_version_within(spawned, Duration::from_secs(5)))
    }

    #[test]
    fn the_first_word_of_the_first_line_that_is_not_blank_is_the_version() {
        let (process, probe) = fake(
            &["", "  2.1.285 (Claude Code)  ", "extra"],
            ProcessTermination::Complete,
        );
        assert_eq!(check(process), Ok("2.1.285".to_owned()));
        assert!(probe.destroyed());
        assert!(probe.forcibly_destroyed(), "the box is dropped as well");
    }

    // Kotlin's `only a version is taken from the output, and anything else is not repeated`: the
    // failure has no field to repeat it in.
    #[test]
    fn only_a_version_is_taken_and_anything_else_is_not_repeated() {
        let marker = "version-probe-marker-AWS_SESSION_TOKEN=secret";
        let printed = [
            marker.to_owned(),
            format!("claude {marker}"),
            format!("2.1.{marker}"),
            format!("2.1.286{}", "x".repeat(33)),
            "v2.1.286".to_owned(),
        ];
        for printed in printed {
            assert_eq!(version_of(&printed), None, "{printed}");
            let (process, probe) = fake(&[&printed], ProcessTermination::Complete);
            let failure = check(process).expect_err("not a version");
            assert_eq!(failure, VersionFailure::NotAVersion);
            assert!(!format!("{failure:?}").contains("marker"));
            assert!(probe.destroyed());
        }
        assert_eq!(version_of("2.1.286 (Claude Code)"), Some("2.1.286"));
        assert_eq!(
            version_of("2.2.0-beta.1+build.7"),
            Some("2.2.0-beta.1+build.7")
        );
    }

    #[test]
    fn the_version_shape_is_matched_whole() {
        assert_eq!(version_of("2.1.325 (Claude Code)"), Some("2.1.325"));
        assert_eq!(version_of("\t2.1.325\tx"), Some("2.1.325"));
        assert_eq!(version_of("v2.1.0"), None);
        assert_eq!(version_of("1234567890.1.0"), None, "ten digits");
        assert_eq!(version_of("1.1234567890.0"), None, "ten digits");
        assert_eq!(
            version_of("123456789.123456789.123456789"),
            Some("123456789.123456789.123456789")
        );
        assert_eq!(version_of(&format!("2.1.0{}", "a".repeat(33))), None);
        let longest = format!("2.1.0{}", "a".repeat(32));
        assert_eq!(version_of(&longest), Some(longest.as_str()));
        // As the regex does, ten digits in the third number are nine and a suffix of one.
        assert_eq!(version_of("2.1.1234567890"), Some("2.1.1234567890"));
        assert_eq!(version_of("2.1."), None);
        assert_eq!(version_of("2.1"), None);
        assert_eq!(version_of("2..1"), None);
        assert_eq!(version_of("2.1.0_x"), None);
        assert_eq!(version_of("２.1.0"), None, "only ASCII digits");
        assert_eq!(version_of(""), None);
    }

    #[test]
    fn an_exit_that_is_not_zero_and_no_output_are_their_failures() {
        let (process, probe) = fake(
            &["2.1.0"],
            ProcessTermination::Error(ProcessFailure::Exit(2)),
        );
        assert_eq!(check(process), Err(VersionFailure::Exit(2)));
        assert!(probe.destroyed());
        let (process, _) = fake(&[" ", ""], ProcessTermination::Complete);
        assert_eq!(check(process), Err(VersionFailure::NoOutput));
    }

    #[test]
    fn a_broken_read_keeps_what_was_read_and_the_exit_code_decides() {
        let (process, _) = fake(
            &["2.1.0"],
            ProcessTermination::Error(ProcessFailure::Io(std::io::ErrorKind::BrokenPipe)),
        );
        assert_eq!(check(process), Ok("2.1.0".to_owned()));
    }

    #[test]
    fn a_failed_spawn_is_that_failure() {
        let spawned = future::ready(Err(LaunchError::TooManyProcesses));
        assert_eq!(
            future::block_on(check_version(spawned)),
            Err(VersionFailure::Spawn(LaunchError::TooManyProcesses))
        );
    }

    #[test]
    fn a_spawn_that_does_not_end_in_time_is_no_answer() {
        let spawned = future::pending::<Result<Box<dyn AgentProcess>, LaunchError>>();
        assert_eq!(
            future::block_on(check_version_within(spawned, Duration::from_millis(50))),
            Err(VersionFailure::NoAnswer)
        );
    }
}
