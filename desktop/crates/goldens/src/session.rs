//! One thread driven the way the host drives it (Session.kt): each input folds core and the
//! transcript ([`SessionView`], Kotlin's `HostState`), then the tree is projected.
//!
//! Kotlin also holds every tree to the contract (`TreeChecks`) and to a projector without a memo;
//! neither is ported: the projector here has no memo, and the contract checks stay on the Kotlin side.

use std::sync::Arc;

use closta_model::{AgentEvent, ApprovalDecision, ConversationState};
use closta_presenter::input::{Decided, PassedOn, PresenterInput, SendId, UserSent};
use closta_presenter::session::SessionView;
use closta_presenter::transcript::Transcript;
use serde_json::{Map, Value};

use crate::lines;
use crate::projector::project_tree;
use crate::tree_reading::at;

pub struct Session {
    thread_id: String,
    view: SessionView,
    tree: Value,
}

impl Default for Session {
    fn default() -> Self {
        Self::new("t1")
    }
}

impl Session {
    pub fn new(thread_id: &str) -> Self {
        let view = SessionView::default();
        let tree = project_tree(&view.conversation, &view.transcript, thread_id);
        Self {
            thread_id: thread_id.to_owned(),
            view,
            tree,
        }
    }

    pub fn view(&self) -> &SessionView {
        &self.view
    }

    pub fn conversation(&self) -> &ConversationState {
        &self.view.conversation
    }

    pub fn transcript(&self) -> &Arc<Transcript> {
        &self.view.transcript
    }

    /// The tree after the last input.
    pub fn tree(&self) -> &Value {
        &self.tree
    }

    /// The thread's node in the last tree.
    pub fn thread(&self) -> &Map<String, Value> {
        at(&self.tree, &["threads", "byId", &self.thread_id])
    }

    /// Folds `input` and gives the tree after it.
    pub fn input(&mut self, input: PresenterInput) -> Value {
        self.view = std::mem::take(&mut self.view).fold(&input);
        self.tree = project_tree(
            &self.view.conversation,
            &self.view.transcript,
            &self.thread_id,
        );
        self.tree.clone()
    }

    /// Folds each event as a stdout line.
    pub fn events(&mut self, events: impl IntoIterator<Item = AgentEvent>) -> Value {
        for event in events {
            self.input(PresenterInput::Event(event));
        }
        self.tree.clone()
    }

    /// The user sends `text` as the message `id`, with no attachment and no uuid.
    pub fn send(&mut self, id: &str, text: &str) -> Value {
        let message_id = SendId::new(id).unwrap_or_else(|| panic!("'{id}' is not a tree key"));
        self.input(PresenterInput::UserSent(UserSent {
            message_id,
            text: text.to_owned(),
            attachments: Vec::new(),
            uuid: None,
        }))
    }

    /// The host answers an approval after a second (Session.kt's default wait).
    pub fn decide(&mut self, decision: ApprovalDecision) -> Value {
        self.decide_after(decision, 1_000)
    }

    pub fn decide_after(&mut self, decision: ApprovalDecision, elapsed_ms: i64) -> Value {
        self.input(PresenterInput::Decided(Decided {
            decision,
            elapsed_ms,
            passed_on: PassedOn::default(),
        }))
    }

    /// A user turn `command` that has started: queued and started, as the CLI announces it.
    pub fn turn(&mut self, command: &str) -> Value {
        self.events([lines::queued(command), lines::started(command)])
    }
}
