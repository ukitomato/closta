//! The output of a short question put to a process, such as where the CLI keeps its records,
//! within a time. Mirrors ProbeOutput.kt.

use std::time::{Duration, Instant};

use async_io::Timer;
use futures_lite::{StreamExt, future};

use crate::claude::process::{AgentProcess, ProcessFailure};

/// The most bytes of stdout that are kept.
pub const MAX_BYTES: usize = 64 * 1024;

/// How long a question may take.
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// What `process` printed on stdout, each line ended by `\n`, or `None` when it did not finish
/// printing within `timeout` or the read failed. The exit code is not looked at: a login shell's
/// code is that of the profile's last command. At most `max_bytes` are kept, cut where a
/// character ends; reaching them ends the read and is no failure. stderr is read away. The process
/// is destroyed and dropped before this returns, on every path.
pub async fn probe_output_within(
    mut process: Box<dyn AgentProcess>,
    timeout: Duration,
    max_bytes: usize,
) -> Option<String> {
    let deadline = Instant::now() + timeout;
    let output = future::or(output_of(process.as_mut(), max_bytes), async {
        Timer::at(deadline).await;
        None
    })
    .await;
    process.destroy();
    drop(process);
    output
}

async fn output_of(process: &mut dyn AgentProcess, max_bytes: usize) -> Option<String> {
    let lines = process.take_stdout_lines();
    let drain = process.take_stderr_drain();
    let reading = async {
        let mut lines = lines?;
        let mut output = String::new();
        while let Some(next) = lines.next().await {
            match next {
                Ok(line) => {
                    output.push_str(&line);
                    output.push('\n');
                    if output.len() >= max_bytes {
                        output.truncate(output.floor_char_boundary(max_bytes));
                        break;
                    }
                }
                Err(ProcessFailure::Exit(_)) => break,
                Err(ProcessFailure::Io(_)) => return None,
            }
        }
        Some(output)
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
    use std::io;

    use super::*;
    use crate::claude::fake::process::{
        FakeProcess, FakeProcessProbe, ProcessBeat, ProcessScript, ProcessTermination,
    };

    fn fake(
        beats: Vec<ProcessBeat>,
        termination: ProcessTermination,
    ) -> (FakeProcess, FakeProcessProbe) {
        FakeProcess::new(ProcessScript {
            beats,
            termination,
            stdin_fails: false,
        })
    }

    fn lines(lines: &[&str]) -> Vec<ProcessBeat> {
        lines
            .iter()
            .map(|line| ProcessBeat::Line((*line).to_owned()))
            .collect()
    }

    fn probe(process: FakeProcess, timeout: Duration, max_bytes: usize) -> Option<String> {
        future::block_on(probe_output_within(Box::new(process), timeout, max_bytes))
    }

    #[test]
    fn what_the_process_printed_is_returned_and_it_is_destroyed() {
        let (process, seen) = fake(lines(&["a", "b"]), ProcessTermination::Complete);
        assert_eq!(
            probe(process, Duration::from_secs(5), MAX_BYTES).as_deref(),
            Some("a\nb\n")
        );
        assert!(seen.destroyed());
        assert!(seen.forcibly_destroyed(), "the box is dropped as well");
    }

    #[test]
    fn a_process_that_says_nothing_in_time_gives_none_and_is_destroyed() {
        let (process, seen) = fake(vec![ProcessBeat::AwaitStdin], ProcessTermination::Complete);
        assert_eq!(probe(process, Duration::from_millis(50), MAX_BYTES), None);
        assert!(seen.destroyed());
    }

    #[test]
    fn no_more_than_the_limit_is_kept_and_it_is_no_failure() {
        // The gate after the second line stays shut: the read must stop at the limit, not wait.
        let mut beats = lines(&["12345", "6789"]);
        beats.push(ProcessBeat::AwaitStdin);
        beats.extend(lines(&["never"]));
        let (process, seen) = fake(beats, ProcessTermination::Complete);
        assert_eq!(
            probe(process, Duration::from_secs(5), 8).as_deref(),
            Some("12345\n67")
        );
        assert!(seen.destroyed());
    }

    #[test]
    fn a_cut_never_splits_a_character() {
        let (process, _) = fake(lines(&["あい"]), ProcessTermination::Complete);
        assert_eq!(
            probe(process, Duration::from_secs(5), 4).as_deref(),
            Some("あ")
        );
    }

    #[test]
    fn an_exit_other_than_zero_still_gives_what_was_read() {
        let (process, seen) = fake(
            lines(&["CLAUDE_AGENT_HOME=/h"]),
            ProcessTermination::Error(ProcessFailure::Exit(1)),
        );
        assert_eq!(
            probe(process, Duration::from_secs(5), MAX_BYTES).as_deref(),
            Some("CLAUDE_AGENT_HOME=/h\n")
        );
        assert!(seen.destroyed());
    }

    #[test]
    fn a_read_that_fails_gives_none() {
        let (process, seen) = fake(
            lines(&["half"]),
            ProcessTermination::Error(ProcessFailure::Io(io::ErrorKind::BrokenPipe)),
        );
        assert_eq!(probe(process, Duration::from_secs(5), MAX_BYTES), None);
        assert!(seen.destroyed());
        let (process, seen) = fake(lines(&["x"]), ProcessTermination::LaunchFailure);
        assert_eq!(probe(process, Duration::from_secs(5), MAX_BYTES), None);
        assert!(seen.destroyed());
    }
}
