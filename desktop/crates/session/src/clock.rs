//! The use cases' clock on the system clock. SystemClock.kt.

use std::time::SystemTime;

use closta_core::ports::Clock;

/// The real [`Clock`] the composition root gives the use cases.
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_clock_tells_the_time_the_system_does() {
        let before = SystemTime::now();
        let now = SystemClock.now();
        assert!(now >= before);
        assert!(now <= SystemTime::now());
    }
}
