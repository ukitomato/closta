#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]
//! What the session crate's tests share: a log that keeps its lines, a session that takes
//! nothing, and a clock that stands still.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use closta_core::ports::{AgentSession, Clock, SendError};
use closta_model::{ApprovalDecision, Attachment};
use closta_session::log::SessionLog;

/// A [`SessionLog`] that keeps every line, as `"INFO …"` or `"WARN …"`.
#[derive(Default)]
pub struct RecordingLog {
    lines: Mutex<Vec<String>>,
}

impl RecordingLog {
    /// The lines written so far, in order.
    pub fn lines(&self) -> Vec<String> {
        self.lines
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn push(&self, level: &str, line: &str) {
        self.lines
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(format!("{level} {line}"));
    }
}

impl SessionLog for RecordingLog {
    fn info(&self, line: &str) {
        self.push("INFO", line);
    }

    fn warn(&self, line: &str) {
        self.push("WARN", line);
    }
}

/// An [`AgentSession`] that is already closed: every send is `Err(Closed)`.
pub struct Failing;

impl AgentSession for Failing {
    fn send_user_message(
        &self,
        _text: &str,
        _attachments: &[Attachment],
        _uuid: Option<&str>,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn respond_to_approval(
        &self,
        _decision: &ApprovalDecision,
        _payload: Option<&str>,
        _updated_permissions: Option<&str>,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_model(&self, _model: &str, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_permission_mode(&self, _mode: &str, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn request_context_usage(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn request_settings(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_effort(&self, _effort: Option<&str>, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn turn_sandbox_off(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn request_mcp_status(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_mcp_server_enabled(
        &self,
        _name: &str,
        _enabled: bool,
        _request_id: &str,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn reconnect_mcp_server(&self, _name: &str, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn rewind_files(
        &self,
        _user_message_id: &str,
        _dry_run: bool,
        _request_id: &str,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn interrupt(&self) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn stop_task(&self, _task_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }
}

struct FixedClock(SystemTime);

impl Clock for FixedClock {
    fn now(&self) -> SystemTime {
        self.0
    }
}

/// A clock that always says `ms` milliseconds after the epoch.
pub fn fixed_clock(ms: u64) -> Arc<dyn Clock> {
    Arc::new(FixedClock(UNIX_EPOCH + Duration::from_millis(ms)))
}
