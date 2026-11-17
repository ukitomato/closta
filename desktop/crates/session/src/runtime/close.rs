//! How a closed session lets go of its process: told to end, waited for, killed when it does not
//! end, given up when the kill does not end it either. `awaitEnd` in SessionRuntime.kt.

use std::sync::Arc;
use std::time::Duration;

use async_channel::Receiver;
use async_io::Timer;
use closta_model::AgentEvent;
use closta_providers::claude::process::AgentProcess;
use closta_providers::claude::session::SessionPump;
use futures_lite::future;

use crate::log::SessionLog;

/// Runs the close order on `handle` while the pump goes on reading stdout (a reader that stops
/// stalls the child) and what it reads is let go unfolded. Returns when the close order is over,
/// whether or not stdout ended.
pub(super) async fn close_pumping(
    handle: Arc<dyn AgentProcess>,
    mut pump: SessionPump,
    events: &Receiver<AgentEvent>,
    wait: Duration,
    kill_wait: Duration,
    id: &str,
    log: &dyn SessionLog,
) {
    let pumping = async {
        let discarding = async { while events.recv().await.is_ok() {} };
        // By reference: a pump dropped as it ends would drop the process with it, and that kills.
        future::zip(&mut pump, discarding).await;
        // Once stdout is over, the close order alone says when the close is.
        future::pending::<()>().await;
    };
    future::or(close_process(handle, wait, kill_wait, id, log), pumping).await;
}

/// `destroy`, then up to `wait` for the end; then `destroy_forcibly` and up to `kill_wait`; then
/// the process is given up. Each step is logged.
pub(super) async fn close_process(
    handle: Arc<dyn AgentProcess>,
    wait: Duration,
    kill_wait: Duration,
    id: &str,
    log: &dyn SessionLog,
) {
    handle.destroy();
    let mut waiting = handle.wait();
    match within(&mut waiting, wait).await {
        Some(Ok(_)) => log.info(&format!("claude session {id}: closed, the process ended")),
        // The kind only: the error's text may name a path.
        Some(Err(error)) => log.warn(&format!(
            "claude session {id}: closed, waiting for the process failed ({:?})",
            error.kind()
        )),
        None => {
            log.warn(&format!(
                "claude session {id}: closed, the process did not end in {wait:?}"
            ));
            handle.destroy_forcibly();
            match within(&mut waiting, kill_wait).await {
                // A killed CLI had no chance to flush its saved record.
                Some(Ok(_)) => log.warn(&format!(
                    "claude session {id}: killed, the process ended; the end of its saved record \
                     may be missing"
                )),
                Some(Err(error)) => log.warn(&format!(
                    "claude session {id}: killed, waiting for the process failed ({:?})",
                    error.kind()
                )),
                None => log.warn(&format!(
                    "claude session {id}: the process did not end after a kill"
                )),
            }
        }
    }
}

/// What `waiting` gives within `limit`, or `None`. The same wait goes on after a `None`.
async fn within<T>(waiting: &mut future::Boxed<T>, limit: Duration) -> Option<T> {
    future::or(async { Some(waiting.await) }, async {
        Timer::after(limit).await;
        None
    })
    .await
}
