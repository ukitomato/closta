//! A replay file played into a slot: the replay process stands in for the CLI, and the companion
//! sends what the file's cues stand for (the user's prompts and the answers to requests) through
//! the session's commands, once the session has taken in the lines before each cue.

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use async_io::Timer;
use closta_model::ApprovalDecision;
use closta_presenter::input::{PassedOn, SendId};
use closta_presenter::session::SessionView;
use closta_presenter::thread_running::thread_is_running;
use closta_providers::claude::fake::replay::{
    ReplayControl, ReplayCue, ReplayOptions, ReplaySpawner, parse_replay, with_prompt,
};
use closta_providers::claude::launch::env::SecretEnv;
use closta_session::launch::NativeSessionLaunchPlanner;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::slot::{Companion, SlotLaunch};
use futures_lite::future;

use crate::args::ReplayArg;

/// How long the companion waits for the session to be ready for one cue before it gives up.
pub const CUE_WAIT: Duration = Duration::from_secs(30);

/// The slot that plays `arg` with `pace` between two lines, and the replay's control.
pub fn slot_launch(arg: &ReplayArg, pace: Duration) -> Result<(SlotLaunch, ReplayControl), String> {
    let text = std::fs::read_to_string(&arg.path)
        .map_err(|error| format!("could not read a replay file: {}", error.kind()))?;
    let mut lines = parse_replay(&text).map_err(|error| error.to_string())?;
    if let Some(prompt) = &arg.prompt {
        lines = with_prompt(lines, prompt);
    }
    let options = ReplayOptions {
        pace,
        stop_at: arg.stop_at,
        stdin_log: arg.stdin_log.clone(),
    };
    let (spawner, control) = ReplaySpawner::new(lines, options);
    let cues = control.cues();
    let companion: Companion = Box::new(move |runtime| Box::pin(accompany(runtime, cues)));
    let launch = SlotLaunch {
        title: title(&arg.path),
        planner: Arc::new(NativeSessionLaunchPlanner::new(
            Arc::new(spawner),
            Arc::new(SecretEnv::default),
        )),
        working_directory: None,
        companion: Some(companion),
    };
    Ok((launch, control))
}

/// The slot's title: the file's name without its extension.
fn title(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The id of the `n`-th message the companion sends, from 1.
fn send_id(n: usize) -> Option<SendId> {
    SendId::new(&format!("replay-{n}"))
}

/// Takes the cues one by one and sends each once the session is ready for it. It stops at a cue
/// it waited [`CUE_WAIT`] for, at one it could not send, and when the session ends; the replay
/// then stays where it is.
async fn accompany(runtime: SessionRuntime, cues: async_channel::Receiver<ReplayCue>) {
    let mut sent = 0;
    while let Ok(cue) = cues.recv().await {
        let ready = match &cue {
            // An answer is taken only for a request the view holds as pending.
            ReplayCue::Answer { request_id, .. } => {
                wait_until(&runtime, |_, view| {
                    view.conversation
                        .pending_approvals
                        .iter()
                        .any(|approval| approval.request_id == *request_id)
                })
                .await
            }
            // A prompt goes once the turn before it has been folded closed.
            ReplayCue::User { .. } => {
                wait_until(&runtime, |status, view| {
                    matches!(status, SessionStatus::Running { .. })
                        && !thread_is_running(&view.conversation, &view.transcript)
                })
                .await
            }
        };
        let Some(commands) = runtime.commands().filter(|_| ready) else {
            return;
        };
        let result = match cue {
            ReplayCue::Answer { request_id, allow } => {
                let decision = if allow {
                    ApprovalDecision::Allow { request_id }
                } else {
                    ApprovalDecision::Deny { request_id }
                };
                commands.respond_to_approval(
                    &decision,
                    SystemTime::now(),
                    None,
                    PassedOn::default(),
                )
            }
            ReplayCue::User { text } => {
                sent += 1;
                let Some(id) = send_id(sent) else {
                    return;
                };
                commands.send_message(id, &text, &[])
            }
        };
        if result.is_err() {
            return;
        }
    }
}

/// Whether the session's status and view came to `ready` within [`CUE_WAIT`]; false once the
/// session ended without it.
async fn wait_until(
    runtime: &SessionRuntime,
    ready: impl Fn(&SessionStatus, &SessionView) -> bool,
) -> bool {
    let waiting = async {
        // Taken before the first look, so a change between the look and the wait wakes it.
        let statuses = runtime.watch_status();
        let views = runtime.watch_view();
        loop {
            let status = runtime.status();
            if ready(&status, &runtime.view()) {
                return true;
            }
            if status.is_end() {
                return false;
            }
            let woke = future::or(async { statuses.recv().await.is_ok() }, async {
                views.recv().await.is_ok()
            })
            .await;
            if !woke {
                // A channel closes once the session ended: one last look.
                return ready(&runtime.status(), &runtime.view());
            }
        }
    };
    future::or(waiting, async {
        Timer::after(CUE_WAIT).await;
        false
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use closta_presenter::rows::{ThreadRow, ThreadRows};
    use closta_session::log::TracingLog;
    use closta_session::runtime::SessionConfig;

    use super::*;

    /// Where `cargo xtask win-test` copies the replay files before it runs these tests.
    const GALLERY: &str = r"C:\dev\tools\closta\replay\gallery.ndjson";

    #[test]
    fn the_replay_send_ids_are_keys() {
        for n in [1, 2, 200] {
            assert!(send_id(n).is_some(), "replay-{n}");
        }
        assert_eq!(
            send_id(1).map(|id| id.as_str().to_owned()),
            Some("replay-1".to_owned())
        );
    }

    /// Runs `body` on `executor` and gives up after `limit`.
    fn within<T>(
        executor: &smol::Executor<'static>,
        limit: Duration,
        body: impl Future<Output = T>,
    ) -> Option<T> {
        smol::block_on(executor.run(future::or(async { Some(body.await) }, async {
            Timer::after(limit).await;
            None
        })))
    }

    #[test]
    fn the_gallery_replays_to_its_end_through_the_runtime() {
        let arg = ReplayArg {
            path: PathBuf::from(GALLERY),
            prompt: None,
            stop_at: None,
            stdin_log: None,
        };
        let (launch, control) = slot_launch(&arg, Duration::ZERO).unwrap();
        assert_eq!(launch.title, "gallery");
        let config = SessionConfig::new(
            "6f1c2a40-0a8e-4c55-9d1e-3f7b8c2d9e01",
            launch.planner,
            None,
            Arc::new(TracingLog),
        );
        let (runtime, run) = SessionRuntime::new(config);
        let executor = smol::Executor::new();
        executor.spawn(run).detach();
        let companion = launch.companion.unwrap();
        executor.spawn(companion(runtime.clone())).detach();

        // Each cue is sent only once the lines before it were folded: an answer sent earlier is
        // not taken (its request is not pending yet), and the replay never reaches its end.
        let finished = within(&executor, Duration::from_secs(60), control.finished());
        assert!(finished.is_some(), "the replay did not reach its end");

        // The last lines can still be on their way through the pump.
        let settled = within(&executor, Duration::from_secs(10), async {
            let views = runtime.watch_view();
            while runtime.view().conversation.pending_approvals.len() < 4 {
                if views.recv().await.is_err() {
                    break;
                }
            }
        });
        assert!(settled.is_some(), "the last requests were not folded");

        let view = runtime.view();
        let rows = ThreadRows::default().of(&view.transcript);
        let asks = rows
            .iter()
            .filter(|row| matches!(row, ThreadRow::Ask(_)))
            .count();
        let waiting = rows
            .iter()
            .filter(|row| matches!(row, ThreadRow::Card(card) if card.card.answered().is_none()))
            .count();
        assert_eq!(asks, 2);
        assert_eq!(waiting, 4);
        let answers = control
            .stdin_lines()
            .iter()
            .filter(|line| line.contains("\"control_response\""))
            .count();
        assert!(answers >= 3, "{answers} answers reached the replay");
        runtime.close();
    }
}
