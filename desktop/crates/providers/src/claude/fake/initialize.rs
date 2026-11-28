//! Telling the `initialize` a session queues first apart from every other stdin line, for fakes
//! that stand in for the CLI.

use crate::claude::protocol::json::parse_line;
use crate::claude::session::INITIALIZE_ID_PREFIX;

/// Whether `line` is the initialize `ClaudeSession::queue_initialize` writes: a control request
/// with our id prefix, no in-process MCP servers and no `perTaskStopAffordance`.
pub fn is_initialize(line: &str) -> bool {
    let Ok(object) = parse_line(line) else {
        return false;
    };
    let ours = object.get("type").and_then(|v| v.as_str()) == Some("control_request")
        && object
            .get("request_id")
            .and_then(|v| v.as_str())
            .is_some_and(|id| id.starts_with(INITIALIZE_ID_PREFIX));
    let Some(request) = object.get("request").and_then(|v| v.as_object()) else {
        return false;
    };
    ours && request.get("subtype").and_then(|v| v.as_str()) == Some("initialize")
        && request
            .get("sdkMcpServers")
            .and_then(|v| v.as_array())
            .is_some_and(Vec::is_empty)
        && !request.contains_key("perTaskStopAffordance")
}

/// The request id of an initialize line, or `None` for any other line.
pub(crate) fn initialize_id(line: &str) -> Option<String> {
    if !is_initialize(line) {
        return None;
    }
    let object = parse_line(line).ok()?;
    object.get("request_id")?.as_str().map(str::to_owned)
}

/// `lines` without the initialize a session queues first. Empty stays empty; a first line that
/// is neither an initialize nor absent is a test bug and panics.
pub fn after_initialize(mut lines: Vec<String>) -> Vec<String> {
    let Some(first) = lines.first() else {
        return lines;
    };
    assert!(
        is_initialize(first),
        "the first stdin line is not the initialize"
    );
    lines.remove(0);
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::fake::live::{LiveOptions, LiveProcess};
    use crate::claude::process::AgentProcess;
    use crate::claude::protocol::encode;
    use futures_lite::future::block_on;

    fn ours() -> String {
        encode::initialize("closta-init-x", &[], false)
    }

    #[test]
    fn an_initialize_of_ours_is_told_apart() {
        assert!(is_initialize(&ours()));
        assert!(!is_initialize(&encode::initialize("req-1", &[], false)));
        assert!(!is_initialize(&encode::initialize(
            "closta-init-x",
            &["ide".to_string()],
            false
        )));
        assert!(!is_initialize(&encode::interrupt("closta-init-x")));
        assert!(!is_initialize(&encode::initialize(
            "closta-init-x",
            &[],
            true
        )));
        assert!(!is_initialize("not json"));
    }

    #[test]
    fn after_initialize_drops_the_first_line_only_when_it_is_one() {
        assert!(after_initialize(Vec::new()).is_empty());
        let user = encode::user_message("S", "U", "hi", &[]).unwrap();
        assert_eq!(
            vec![user.clone()],
            after_initialize(vec![ours(), user.clone()])
        );
        let refused = std::panic::catch_unwind(|| after_initialize(vec![user]));
        assert!(refused.is_err());
    }

    #[test]
    fn skip_initialize_reads_one_line_and_names_its_id() {
        let (process, control) = LiveProcess::new(LiveOptions::default());
        let user = encode::user_message("S", "U", "hi", &[]).unwrap();
        block_on(process.write_stdin(ours())).unwrap();
        block_on(process.write_stdin(user.clone())).unwrap();
        assert_eq!("closta-init-x", block_on(control.skip_initialize()));
        assert_eq!(Some(user), block_on(control.next_stdin_line()));
    }

    #[test]
    fn skip_initialize_panics_when_the_first_line_is_a_message() {
        let (process, control) = LiveProcess::new(LiveOptions::default());
        let user = encode::user_message("S", "U", "hi", &[]).unwrap();
        block_on(process.write_stdin(user)).unwrap();
        let skipped = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            block_on(control.skip_initialize())
        }));
        assert!(skipped.is_err());
    }
}
