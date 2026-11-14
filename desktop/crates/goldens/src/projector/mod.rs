//! The test side's TreeProjector (TreeProjector.kt), without its memo: the tree of one thread,
//! built afresh from core's state and the transcript. A fresh Kotlin projector builds an equal
//! tree, so the goldens hold for this one too.
//!
//! The tree builders the Kotlin side keeps next to the records (`rewindNode`, `savedSessionsNode`,
//! `mcpServersNode`, `putMcp`, `attachmentNode`) are here as well: `closta-presenter` builds no
//! tree.

mod approvals;
mod extras;
mod leaves;
mod nodes;
mod operations;
mod question;
mod thread;

use closta_model::ConversationState;
use closta_presenter::json::is_key;
use closta_presenter::transcript::Transcript;
use serde_json::{Value, json};

use nodes::collection_node;

/// The tree of one thread `thread_id`: `{"threads":{"order":[…],"byId":{…}}}`. The host names the
/// thread before the first turn, so the id is the host's and must be a tree key.
pub fn project_tree(
    conversation: &ConversationState,
    transcript: &Transcript,
    thread_id: &str,
) -> Value {
    assert!(
        is_key(thread_id),
        "a thread id must be a tree key: '{thread_id}'"
    );
    let thread = thread::project_thread(thread_id, conversation, transcript);
    json!({ "threads": collection_node(vec![(thread_id.to_owned(), thread)]) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree_reading::{at, keys_of, messages};

    #[test]
    fn empty_transcript_projects_one_idle_thread() {
        let tree = project_tree(
            &ConversationState::default(),
            &Transcript::default(),
            "thread-1",
        );

        assert_eq!(
            vec!["thread-1".to_owned()],
            keys_of(at(&tree, &[]), "threads")
        );
        let thread = at(&tree, &["threads", "byId", "thread-1"]);
        assert_eq!(Some(&Value::Bool(false)), thread.get("isRunning"));
        assert!(messages(thread).is_empty());
    }
}
