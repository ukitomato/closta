//! What one session has to show (SessionView.kt, and the tests' HostState.kt).

use std::sync::Arc;

use closta_model::ConversationState;

use crate::fold::fold_transcript;
use crate::input::PresenterInput;
use crate::transcript::{MessageSource, Transcript};

/// What one session has to show: core's state of the conversation and the presenter's
/// [`Transcript`] of it, folded from the same inputs in the same order — core first, then the
/// transcript with core's state before and after, which is what [`fold_transcript`] needs.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct SessionView {
    pub conversation: ConversationState,
    pub transcript: Arc<Transcript>,
}

impl SessionView {
    /// Folds `input`: a stdout line or a line of a restored record through core's `fold`, a
    /// decision through core's `resolve_approval`; core's state stays for anything else, which
    /// only the host knows. Then the transcript, with core's state before and after.
    pub fn fold(self, input: &PresenterInput) -> SessionView {
        let after = match input {
            PresenterInput::Event(event) | PresenterInput::Restored(event) => {
                closta_core::fold(self.conversation.clone(), event)
            }
            PresenterInput::Decided(decided) => closta_core::resolve_approval(
                self.conversation.clone(),
                &decided.decision,
                decided.elapsed_ms,
            ),
            PresenterInput::StopRequested
            | PresenterInput::UserSent(_)
            | PresenterInput::SendFailed(_)
            | PresenterInput::TurnChangesFound(_)
            | PresenterInput::RewindRequested(_)
            | PresenterInput::RewindNotSent(_)
            | PresenterInput::AttachmentRefused(_)
            | PresenterInput::AnswerFailed(_)
            | PresenterInput::FilesFound(_)
            | PresenterInput::ControlRequested(_)
            | PresenterInput::ControlSendFailed(_)
            | PresenterInput::EffortRefused(_)
            | PresenterInput::Launched(_)
            | PresenterInput::SandboxRefused(_)
            | PresenterInput::SandboxNotStarted(_)
            | PresenterInput::SessionsListed(_)
            | PresenterInput::HistoryRestored(_)
            | PresenterInput::HistoryUnavailable
            | PresenterInput::ResumeRefused(_) => {
                let transcript = fold_transcript(
                    &self.transcript,
                    input,
                    &self.conversation,
                    &self.conversation,
                );
                return SessionView {
                    conversation: self.conversation,
                    transcript,
                };
            }
        };
        let transcript = fold_transcript(&self.transcript, input, &self.conversation, &after);
        SessionView {
            conversation: after,
            transcript,
        }
    }
}

/// The id `view`'s conversation is saved under. A session launched or resumed by the host's
/// `host_id` keeps it; once the conversation was cleared the CLI goes on under a new one, which
/// its init after the clear names. From the clear until that init it is `host_id` again, never the
/// id of the conversation that was cleared (resumeIdOf in SessionView.kt).
pub fn resume_id_of(view: &SessionView, host_id: &str) -> String {
    view.conversation
        .session
        .as_ref()
        .filter(|_| view.transcript.cleared_at.is_some())
        .map_or_else(|| host_id.to_owned(), |session| session.session_id.clone())
}

/// Whether a message was sent after the last `/clear`; false while the conversation was never
/// cleared (sentAfterClear in ClearedTabs.kt, 022513f).
pub fn sent_after_clear(transcript: &Transcript) -> bool {
    transcript.cleared_at.is_some_and(|cleared| {
        transcript
            .messages
            .order()
            .skip(cleared + 1)
            .filter_map(|key| transcript.messages.get(key))
            .any(|message| message.source == MessageSource::Sent)
    })
}

/// The id a restart starts a new conversation under: the CLI's, once the init after the last
/// `/clear` named it, while nothing was sent since. The CLI may not have written that
/// conversation's file before its first message, so there is none to resume (clearedTabOf in
/// ClearedTabs.kt, 022513f). `None` before any clear, from the reset until that init, and once a
/// message was sent after it.
pub fn afresh_after_clear(view: &SessionView) -> Option<&str> {
    view.conversation
        .session
        .as_ref()
        .filter(|_| view.transcript.cleared_at.is_some() && !sent_after_clear(&view.transcript))
        .map(|session| session.session_id.as_str())
}

#[cfg(test)]
mod tests {
    use closta_model::{AgentEvent, ApprovalDecision, RawJson};

    use super::*;
    use crate::input::{Decided, PassedOn, PresenterInput, SendId, UserSent};
    use crate::thread_running::thread_is_running;

    fn control_request(request_id: &str) -> PresenterInput {
        PresenterInput::Event(AgentEvent::ControlRequest {
            request_id: request_id.into(),
            request: RawJson(r#"{"subtype":"can_use_tool","tool_name":"Bash","input":{}}"#.into()),
            agent_id: None,
            tool_name: Some("Bash".into()),
            tool_use_id: Some("t1".into()),
        })
    }

    fn sent(uuid: &str) -> PresenterInput {
        PresenterInput::UserSent(UserSent {
            message_id: SendId::new(&format!("send-{uuid}")).expect("a key"),
            text: uuid.into(),
            attachments: Vec::new(),
            uuid: Some(uuid.into()),
        })
    }

    fn life(uuid: &str, state: &str) -> PresenterInput {
        PresenterInput::Event(AgentEvent::CommandLifecycle {
            uuid: format!("l-{uuid}-{state}"),
            session_id: "s".into(),
            command_uuid: uuid.into(),
            state: state.into(),
        })
    }

    /// A successful `result` naming `last`, closing every turn in `all` (TurnBoundaryTest.resultFor).
    fn result(last: &str, all: &[&str]) -> PresenterInput {
        PresenterInput::Event(AgentEvent::Result {
            uuid: "u".into(),
            session_id: "s".into(),
            subtype: "success".into(),
            result: "ok".into(),
            is_error: false,
            stop_reason: Some("stop".into()),
            terminal_reason: Some("end_turn".into()),
            num_turns: 1,
            result_index: 0,
            queued_turn_count: Some(0),
            total_cost_usd: 0.0,
            duration_ms: 1,
            duration_api_ms: 1,
            ttft_ms: Some(1),
            ttft_stream_ms: Some(1),
            time_to_request_ms: Some(1),
            first_content_frame_ms: Some(1),
            fast_mode_state: Some("off".into()),
            usage: RawJson("{}".into()),
            model_usage: RawJson("{}".into()),
            permission_denials: RawJson("[]".into()),
            subagent_stats: Some(RawJson("{}".into())),
            api_error_status: None,
            fast_mode_disabled_reason: None,
            request_sent_wall_ms: None,
            user_message_uuid: Some(last.into()),
            user_message_uuids: Some(all.iter().map(|it| (*it).to_owned()).collect()),
            origin: None,
            local_command: None,
        })
    }

    #[test]
    fn an_unused_input_returns_the_same_transcript_arc() {
        let view = SessionView::default();
        let before = Arc::clone(&view.transcript);

        let after = view.fold(&PresenterInput::StopRequested);

        assert!(Arc::ptr_eq(&before, &after.transcript));
    }

    #[test]
    fn a_decision_resolves_the_approval_in_core() {
        let view = SessionView::default().fold(&control_request("r1"));
        assert_eq!(1, view.conversation.pending_approvals.len());

        let decided = view.fold(&PresenterInput::Decided(Decided {
            decision: ApprovalDecision::Allow {
                request_id: "r1".into(),
            },
            elapsed_ms: 10,
            passed_on: PassedOn::default(),
        }));

        assert!(decided.conversation.pending_approvals.is_empty());
    }

    #[test]
    fn an_input_only_the_host_knows_leaves_core_as_it_was() {
        let view = SessionView::default().fold(&control_request("r1"));
        let before = view.conversation.clone();

        let after = view.fold(&PresenterInput::HistoryUnavailable);

        assert_eq!(before, after.conversation);
    }

    #[test]
    fn messages_the_cli_ran_as_one_turn_stop_running_when_that_turn_ends() {
        // Seen with 2.1.319: two messages sent while a turn ran were run as one turn, and the
        // composer kept its stop button after it ended (the result names the last message; the
        // other one's lifecycle completes after it).
        let inputs = [
            sent("a"),
            life("a", "queued"),
            life("a", "started"),
            sent("b"),
            life("b", "queued"),
            sent("c"),
            life("c", "queued"),
            result("a", &["a"]),
            life("a", "completed"),
            life("b", "started"),
            life("c", "started"),
            result("c", &["b", "c"]),
            life("b", "completed"),
            life("c", "completed"),
        ];
        let states: Vec<SessionView> = inputs
            .iter()
            .scan(SessionView::default(), |view, input| {
                *view = view.clone().fold(input);
                Some(view.clone())
            })
            .collect();
        let ended = inputs
            .iter()
            .rposition(|it| *it == result("c", &["b", "c"]))
            .expect("the last result");

        assert!(
            thread_is_running(&states[0].conversation, &states[0].transcript),
            "a send core has no turn for yet runs"
        );
        for (index, input) in inputs.iter().enumerate() {
            if matches!(input, PresenterInput::Event(AgentEvent::Result { .. })) {
                assert_eq!(
                    None, states[index].transcript.routing.current_turn,
                    "the result at #{index} closed the turn receiving content"
                );
            }
        }
        let before = &states[ended - 1];
        assert!(
            thread_is_running(&before.conversation, &before.transcript),
            "running before"
        );
        for (index, view) in states.iter().enumerate().skip(ended) {
            assert!(
                !thread_is_running(&view.conversation, &view.transcript),
                "at rest at #{index}"
            );
        }
    }
}
