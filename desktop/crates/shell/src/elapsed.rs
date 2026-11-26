//! How long ago, in words: the time a session has stood under its heading and the age of a saved
//! conversation. The time is given, never read here, so a test can say what it is.

const MINUTE_MS: i64 = 60_000;
const HOUR_MS: i64 = 60 * MINUTE_MS;
const DAY_MS: i64 = 24 * HOUR_MS;

/// The time since `since_ms` as `"now"` under a minute, `"N min"` under an hour, else `"N h"`
/// (whole units, rounded down). A time after `now_ms` is `"now"`.
pub fn elapsed_text(since_ms: i64, now_ms: i64) -> String {
    let passed = now_ms.saturating_sub(since_ms);
    if passed < MINUTE_MS {
        "now".to_owned()
    } else if passed < HOUR_MS {
        format!("{} min", passed / MINUTE_MS)
    } else {
        format!("{} h", passed / HOUR_MS)
    }
}

/// The age of `then_ms` as `"just now"` under a minute, `"N min ago"` under an hour, `"N h ago"`
/// under a day, else `"N d ago"` (whole units, rounded down). A time after `now_ms` is
/// `"just now"`.
pub fn ago_text(then_ms: i64, now_ms: i64) -> String {
    let passed = now_ms.saturating_sub(then_ms);
    if passed < MINUTE_MS {
        "just now".to_owned()
    } else if passed < HOUR_MS {
        format!("{} min ago", passed / MINUTE_MS)
    } else if passed < DAY_MS {
        format!("{} h ago", passed / HOUR_MS)
    } else {
        format!("{} d ago", passed / DAY_MS)
    }
}

#[cfg(test)]
mod tests {
    use super::{ago_text, elapsed_text};

    const SECOND: i64 = 1000;
    const MINUTE: i64 = 60 * SECOND;
    const HOUR: i64 = 60 * MINUTE;

    #[test]
    fn elapsed_text_steps_at_a_minute_and_an_hour() {
        let at = |ms: i64| elapsed_text(1_000_000, 1_000_000 + ms);
        assert_eq!(at(0), "now");
        assert_eq!(at(59 * SECOND), "now");
        assert_eq!(at(60 * SECOND), "1 min");
        assert_eq!(at(59 * MINUTE + 59 * SECOND), "59 min");
        assert_eq!(at(60 * MINUTE), "1 h");
        assert_eq!(at(25 * HOUR), "25 h");
        assert_eq!(elapsed_text(2_000_000, 1_000_000), "now", "a future time");
    }

    #[test]
    fn ago_text_steps_at_a_minute_an_hour_and_a_day() {
        let at = |ms: i64| ago_text(1_000_000, 1_000_000 + ms);
        assert_eq!(at(59 * SECOND), "just now");
        assert_eq!(at(60 * SECOND), "1 min ago");
        assert_eq!(at(59 * MINUTE + 59 * SECOND), "59 min ago");
        assert_eq!(at(60 * MINUTE), "1 h ago");
        assert_eq!(at(23 * HOUR), "23 h ago");
        assert_eq!(at(24 * HOUR), "1 d ago");
        assert_eq!(ago_text(2_000_000, 1_000_000), "just now", "a future time");
    }
}
