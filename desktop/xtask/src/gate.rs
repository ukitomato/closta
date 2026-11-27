//! The load gate `cargo xtask perf` passes before it measures: a busy machine times every budget
//! slow, so perf waits for the 1-minute load to fall below the core count.

use std::fmt;
use std::time::Duration;

/// How long perf sleeps between two reads of a busy machine.
pub const PAUSE: Duration = Duration::from_secs(30);
/// How many times perf sleeps before it gives up: thirty pauses, fifteen minutes.
pub const PAUSES: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Gate {
    Run,
    Busy,
}

/// What the wait ended with: a quiet load (`None` when it could not be read), or the last busy one.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Waited {
    Quiet(Option<f64>),
    Busy(f64),
}

/// The machine stayed busy for the whole wait; `main` turns it into exit code 2.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Busy {
    pub load: f64,
    pub cores: usize,
}

impl fmt::Display for Busy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "the machine is busy (load {:.1} of {} cores); perf did not run",
            self.load, self.cores
        )
    }
}

impl std::error::Error for Busy {}

/// Runs below the core count.
pub fn gate(load_1min: f64, cores: usize) -> Gate {
    if load_1min < cores as f64 {
        Gate::Run
    } else {
        Gate::Busy
    }
}

/// The first number of `/proc/loadavg`; `None` when the text is missing or not a number.
pub fn read_load(text: Option<&str>) -> Option<f64> {
    text?.split_whitespace().next()?.parse().ok()
}

/// Reads the load, and while it is busy sleeps `PAUSE` and reads again, at most `PAUSES` times.
pub fn wait_for_quiet(
    read: &mut dyn FnMut() -> Option<f64>,
    sleep: &mut dyn FnMut(Duration),
    cores: usize,
) -> Waited {
    let mut pauses = 0;
    loop {
        let Some(load) = read() else {
            return Waited::Quiet(None);
        };
        if gate(load, cores) == Gate::Run {
            return Waited::Quiet(Some(load));
        }
        if pauses == PAUSES {
            return Waited::Busy(load);
        }
        sleep(PAUSE);
        pauses += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate_runs_just_under_the_core_count() {
        assert_eq!(gate(27.99, 28), Gate::Run);
    }

    #[test]
    fn gate_waits_at_exactly_the_core_count() {
        assert_eq!(gate(28.0, 28), Gate::Busy);
    }

    #[test]
    fn gate_reads_the_first_number_of_loadavg() {
        assert_eq!(
            read_load(Some("5.36 3.08 3.69 8/14627 703229\n")),
            Some(5.36)
        );
    }

    #[test]
    fn gate_runs_when_the_load_cannot_be_read() {
        assert_eq!(read_load(None), None);
        assert_eq!(read_load(Some("x")), None);
        let mut reads = 0;
        let mut sleeps = 0;
        let waited = wait_for_quiet(
            &mut || {
                reads += 1;
                None
            },
            &mut |_| sleeps += 1,
            28,
        );
        assert_eq!(waited, Waited::Quiet(None));
        assert_eq!((reads, sleeps), (1, 0));
    }

    #[test]
    fn a_busy_machine_is_read_every_thirty_seconds_for_fifteen_minutes() {
        let mut slept = Vec::new();
        let waited = wait_for_quiet(&mut || Some(30.0), &mut |it| slept.push(it), 28);
        assert_eq!(waited, Waited::Busy(30.0));
        assert_eq!(slept, vec![Duration::from_secs(30); 30]);
    }

    #[test]
    fn a_machine_that_quiets_runs_at_once() {
        let mut loads = [Some(30.0), Some(29.0), Some(3.0)].into_iter();
        let mut sleeps = 0;
        let waited = wait_for_quiet(&mut || loads.next().flatten(), &mut |_| sleeps += 1, 28);
        assert_eq!(waited, Waited::Quiet(Some(3.0)));
        assert_eq!(sleeps, 2);
    }

    #[test]
    fn busy_says_the_load_to_one_decimal() {
        let busy = Busy {
            load: 30.04,
            cores: 28,
        };
        assert_eq!(
            busy.to_string(),
            "the machine is busy (load 30.0 of 28 cores); perf did not run"
        );
    }
}
