//! The restart into the sandbox: marking it, reading the mark, and closing a switch the session
//! ended before. `restartFor` in SessionRuntime.kt.

use async_channel::Receiver;
use closta_presenter::input::{ControlRequested, PresenterInput, SandboxNotStarted};
use closta_presenter::records::operations::{ControlKind, SwitchKind, SwitchOutcome};
use closta_presenter::records::tasks::running_tasks;
use closta_presenter::session::SessionView;
use closta_presenter::thread_running::thread_is_running;
use futures_lite::future;

use super::{SessionStatus, Shared};
use crate::sandbox::SANDBOX_ON;

/// Marks a restart into the sandbox; [`super::SessionRuntime::turn_sandbox_on`] says when.
pub(super) fn turn_sandbox_on(shared: &Shared) -> bool {
    let id = uuid::Uuid::new_v4().to_string();
    // Under the store's lock, so two presses make one switch; the state's lock under it.
    shared.store.transition_with(|view| {
        let mut state = shared.state();
        let running = matches!(state.status, SessionStatus::Running { .. })
            && state.commands.as_ref().is_some_and(|c| !c.is_revoked());
        if !running || state.restart_for.is_some() || pending_sandbox(&view) {
            return (view, false);
        }
        if thread_is_running(&view.conversation, &view.transcript)
            || !running_tasks(&view.transcript).is_empty()
        {
            drop(state);
            return (view.fold(&PresenterInput::SandboxRefused(id)), false);
        }
        if let Some(commands) = state.commands.take() {
            commands.revoke();
        }
        state.set(SessionStatus::Starting, None);
        state.restart_for = Some(id.clone());
        // Full only when a wake-up is already waiting.
        _ = shared.restarting.try_send(());
        drop(state);
        let requested = PresenterInput::ControlRequested(ControlRequested {
            request_id: id,
            kind: ControlKind::Sandbox,
            value: Some(SANDBOX_ON.to_owned()),
        });
        (view.fold(&requested), true)
    })
}

/// The switch of a restart once one is marked, taken from the state.
pub(super) async fn marked(shared: &Shared, wake: &Receiver<()>) -> String {
    loop {
        if let Some(switch) = take_mark(shared, wake) {
            return switch;
        }
        if wake.recv().await.is_err() {
            future::pending::<()>().await;
        }
    }
}

/// Takes the restart's mark, and the wake-ups sent for it, under the state's lock.
pub(super) fn take_mark(shared: &Shared, wake: &Receiver<()>) -> Option<String> {
    let mut state = shared.state();
    while wake.try_recv().is_ok() {}
    state.restart_for.take()
}

/// Whether a switch of the sandbox waits for its answer.
fn pending_sandbox(view: &SessionView) -> bool {
    view.transcript.operations.switches.iter().any(|switch| {
        switch.kind == SwitchKind::Sandbox && switch.outcome == SwitchOutcome::Pending
    })
}

/// Records that the CLI of `switch` did not start in the sandbox, with its sentence.
pub(super) fn not_started(shared: &Shared, switch: String, detail: Option<String>) {
    let input = PresenterInput::SandboxNotStarted(SandboxNotStarted {
        request_id: switch,
        detail,
    });
    shared.store.transition(|view| view.fold(&input));
}

/// Closes the switch into the sandbox that still waits, the marked one or a pending one that
/// turns it on: the session is over, and the switch with it.
pub(super) fn fail_pending_sandbox(shared: &Shared) {
    shared.store.transition(|view| {
        let mark = shared.state().restart_for.take();
        let pending = mark.or_else(|| {
            view.transcript
                .operations
                .switches
                .iter()
                .rev()
                .find(|switch| {
                    switch.kind == SwitchKind::Sandbox
                        && switch.outcome == SwitchOutcome::Pending
                        && switch.value == SANDBOX_ON
                })
                .map(|switch| switch.id.clone())
        });
        match pending {
            Some(switch) => view.fold(&PresenterInput::SandboxNotStarted(SandboxNotStarted {
                request_id: switch,
                detail: None,
            })),
            None => view,
        }
    });
}
