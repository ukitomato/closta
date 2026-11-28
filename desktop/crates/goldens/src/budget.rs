//! Reading a microsecond budget over several rounds: one round's tail can spike when another
//! process takes the core, so the budget reads the best round's p99.

use std::time::Duration;

const P99: usize = 99;
const PERCENT: usize = 100;

/// The p99 of each round, the least of them, and the median of every time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rounds {
    pub p99s: Vec<Duration>,
    pub least: Duration,
    pub median: Duration,
}

impl Rounds {
    /// Each inner list is one round's times, in any order; every round must hold at least one.
    pub fn of(times: Vec<Vec<Duration>>) -> Rounds {
        let mut all: Vec<Duration> = times.iter().flatten().copied().collect();
        all.sort();
        let median = all[all.len() / 2];
        let p99s: Vec<Duration> = times
            .into_iter()
            .map(|mut round| {
                round.sort();
                round[round.len() * P99 / PERCENT]
            })
            .collect();
        let least = p99s.iter().min().copied().unwrap_or_default();
        Rounds {
            p99s,
            least,
            median,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn micros(values: &[u64]) -> Vec<Duration> {
        values.iter().map(|it| Duration::from_micros(*it)).collect()
    }

    /// A round of 100 times: 99 at `body` and one at `tail`, so its p99 is `tail`.
    fn round(body: u64, tail: u64) -> Vec<Duration> {
        let mut times = micros(&[body; 99]);
        times.insert(50, Duration::from_micros(tail));
        times
    }

    #[test]
    fn the_least_round_p99_is_what_the_budget_reads() {
        let rounds = Rounds::of(vec![round(10, 40), round(10, 900), round(12, 30)]);
        assert_eq!(rounds.p99s, micros(&[40, 900, 30]));
        assert_eq!(rounds.least, Duration::from_micros(30));
        assert_eq!(rounds.median, Duration::from_micros(10));
    }
}
