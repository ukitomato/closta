//! Where a session records its launch. SessionLog.kt.
//!
//! A line may hold only the session id, the argv, the version, the distribution's name and the
//! failure's kind: never an env value, the working folder's path, the user's text or stderr.

/// Where a session writes one line about its launch and its end.
pub trait SessionLog: Send + Sync {
    fn info(&self, line: &str);

    fn warn(&self, line: &str);
}

/// The production log: the lines go to `tracing`.
pub struct TracingLog;

impl SessionLog for TracingLog {
    fn info(&self, line: &str) {
        tracing::info!("{line}");
    }

    fn warn(&self, line: &str) {
        tracing::warn!("{line}");
    }
}
