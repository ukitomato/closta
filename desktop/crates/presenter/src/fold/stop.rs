//! The stop folds (HostOperations.kt): the turns open when stop was pressed, and the `result` that
//! ends them.

use std::sync::Arc;

use closta_model::{ConversationState, TurnPhase};

use crate::fold::paths::{replace_routing, with_routing};
use crate::transcript::{Routing, Transcript};

/// Keeps the turns open now, which the next `result` ends; with none open, the transcript is the
/// same `Arc`.
pub(crate) fn fold_stop(
    transcript: &Arc<Transcript>,
    conversation: &ConversationState,
) -> Arc<Transcript> {
    let routing = &transcript.routing;
    let open: Vec<&String> = conversation
        .turns
        .iter()
        .filter(|turn| {
            turn.phase == TurnPhase::Open && !routing.stopped.contains(&turn.command_uuid)
        })
        .map(|turn| &turn.command_uuid)
        .collect();
    if open.is_empty() {
        return Arc::clone(transcript);
    }
    let mut routing = routing.clone();
    for uuid in open {
        routing.stopping.insert(uuid.clone());
    }
    with_routing(transcript, routing)
}

/// A `result` after a stop: the turns open at the stop are over, whatever turn the `result` named
/// (HostOperations.kt).
pub(crate) fn stop_taken(transcript: &Arc<Transcript>) -> Arc<Transcript> {
    let routing = &transcript.routing;
    if routing.stopping.is_empty() {
        return Arc::clone(transcript);
    }
    let stopped = routing.stopped.clone().union(routing.stopping.clone());
    replace_routing(
        transcript,
        Routing {
            stopped,
            stopping: imbl::HashSet::new(),
            ..routing.clone()
        },
    )
}
