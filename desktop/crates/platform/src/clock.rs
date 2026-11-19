//! The one clock the window hands the shell: unix milliseconds read off the wall once at the
//! start and carried forward by a monotonic clock, so a time never goes back when the system's
//! clock is set.

use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug)]
pub(crate) struct WallClock {
    base_unix_ms: i64,
    base: Instant,
}

impl WallClock {
    /// Reads the wall clock now; every later time is counted from here.
    pub(crate) fn start() -> WallClock {
        let unix_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| {
                i64::try_from(since.as_millis()).unwrap_or(i64::MAX)
            });
        WallClock {
            base_unix_ms: unix_ms,
            base: Instant::now(),
        }
    }

    /// The unix time in milliseconds.
    pub(crate) fn now_ms(&self) -> i64 {
        let elapsed = i64::try_from(self.base.elapsed().as_millis()).unwrap_or(i64::MAX);
        self.base_unix_ms.saturating_add(elapsed)
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use super::WallClock;

    #[test]
    fn the_clock_starts_at_the_wall_and_never_goes_back() {
        let wall = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("after 1970")
            .as_millis();
        let clock = WallClock::start();
        let first = clock.now_ms();
        let wall = i64::try_from(wall).expect("fits");
        assert!((first - wall).abs() < 1_000, "{first} vs {wall}");
        std::thread::sleep(Duration::from_millis(20));
        let later = clock.now_ms();
        assert!(later >= first + 20, "{later} after {first}");
    }
}
