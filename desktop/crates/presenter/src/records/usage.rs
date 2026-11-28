//! The answer to `get_usage`: what the session cost so far and the windows of the plan's limits
//! the host names (UsageReadings.kt).

use std::fmt;

use serde_json::{Map, Value};

use crate::json::JsonFields;

/// What the session cost so far (`session.total_cost_usd`), whether the plan's limits could be
/// read, and the windows of the plan's limits the host names. The cost and the shares are the
/// user's own numbers: `Debug` shows only how many windows there are.
#[derive(Clone, PartialEq)]
pub struct UsageRecord {
    pub session_cost_usd: f64,
    pub rate_limits_available: bool,
    pub windows: Vec<UsageWindow>,
}

impl fmt::Debug for UsageRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UsageRecord")
            .field("windows", &self.windows.len())
            .finish_non_exhaustive()
    }
}

/// One window of the plan's limits: its CLI name, the share used in percent (`None` when the CLI
/// gives none), and when it resets, as the CLI wrote it (ISO 8601). `Debug` shows the name only.
#[derive(Clone, PartialEq)]
pub struct UsageWindow {
    pub name: String,
    pub utilization_percent: Option<i32>,
    pub resets_at: Option<String>,
}

impl fmt::Debug for UsageWindow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UsageWindow")
            .field("name", &self.name)
            .finish_non_exhaustive()
    }
}

/// The windows read, in this order. The answer holds many other names (capture 43: names of no
/// window the type gives, all null, and `extra_usage`, `limits`, `spend` and `model_scoped`, which
/// are no window of this shape): none of them is read.
const WINDOWS: [&str; 4] = [
    "five_hour",
    "seven_day",
    "seven_day_opus",
    "seven_day_sonnet",
];

/// Reads the `response` of a `get_usage` answer; `None` when it has no cost of the session. No
/// limits, limits said not available, or a window that is null leave those windows out and keep
/// the cost.
pub fn usage_of(body: &Map<String, Value>) -> Option<UsageRecord> {
    let cost = body
        .obj("session")?
        .number("total_cost_usd")
        .filter(|it| it.is_finite())?;
    let available = body.get("rate_limits_available").and_then(Value::as_bool) == Some(true);
    let limits = body.obj("rate_limits").filter(|_| available);
    let windows = limits
        .map(|all| {
            WINDOWS
                .iter()
                .filter_map(|name| {
                    let window = all.obj(name)?;
                    Some(UsageWindow {
                        name: (*name).to_owned(),
                        utilization_percent: window
                            .number("utilization")
                            .filter(|it| it.is_finite())
                            .map(rounded),
                        resets_at: window.string("resets_at").map(str::to_owned),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(UsageRecord {
        session_cost_usd: cost,
        rate_limits_available: available,
        windows,
    })
}

/// Kotlin's `roundToInt`: halves go up, and a share past `Int` stops at its end.
#[allow(clippy::cast_possible_truncation)] // saturating: `as` stops at the ends of `i32`
fn rounded(share: f64) -> i32 {
    (share + 0.5).floor() as i32
}
