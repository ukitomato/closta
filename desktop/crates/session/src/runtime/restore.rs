//! The restore of a resumed session: its saved record put back into the view before the CLI's
//! events are read.

use std::sync::Arc;
use std::sync::atomic::Ordering;

use async_channel::Receiver;
use closta_core::ports::SavedSessionsError;
use futures_lite::future;

use super::{SessionConfig, Shared};
use crate::history::SessionOpening;
use crate::history::restore::{history_unavailable, restore_steps, restored};

/// Puts the earlier conversation of a resumed session back into the view from its saved record,
/// in the steps of [`restore_steps`], each folded onto the view from before the restore. Nothing
/// the CLI says is folded meanwhile: its events are read only after this. A record that cannot be
/// read does not fail the session: it goes on without it, and the view says so; only the kind of
/// the failure is logged. Returns `false` when the session was closed during the read, which is
/// then told to stop (Kotlin's `restoreHistory`).
pub(super) async fn restore_history(
    shared: &Shared,
    config: &SessionConfig,
    closed: &Receiver<()>,
) -> bool {
    if config.opening == SessionOpening::New {
        return true;
    }
    let id = &config.id;
    let Some(saved) = config.saved.clone() else {
        unavailable(shared, config, "no saved sessions");
        return true;
    };
    let stop = Arc::clone(&shared.stop_reading);
    let reading = {
        let (id, stop) = (id.clone(), Arc::clone(&stop));
        blocking::unblock(move || saved.read(&id, &|| stop.load(Ordering::SeqCst)))
    };
    // The close side first: a close seen once the read is over still wins.
    let read = future::or(
        async {
            _ = closed.recv().await;
            None
        },
        async { Some(reading.await) },
    )
    .await;
    let transcript = match read {
        // A stop is only ever asked for by a close.
        None | Some(Err(SavedSessionsError::Stopped)) => {
            stop.store(true, Ordering::SeqCst);
            return false;
        }
        Some(Err(error)) => {
            unavailable(shared, config, &format!("{error:?}"));
            return true;
        }
        Some(Ok(transcript)) => transcript,
    };
    let mut before = None;
    for (lines, dropped) in restore_steps(&transcript.events, transcript.dropped) {
        shared.store.transition(|now| {
            let before = before.get_or_insert(now);
            restored(before.clone(), &lines, dropped)
        });
    }
    config.log.info(&format!(
        "claude session {id}: put back {} lines of the saved record ({transcript:?})",
        transcript.events.len()
    ));
    true
}

/// The record of a resumed session said to be unreadable, for the `reason` logged.
fn unavailable(shared: &Shared, config: &SessionConfig, reason: &str) {
    config.log.warn(&format!(
        "claude session {}: the saved record could not be read ({reason})",
        config.id
    ));
    shared.store.transition(history_unavailable);
}
