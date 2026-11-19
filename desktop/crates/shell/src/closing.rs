//! Closing the window: what is asked first, which stage the close is in, and the wait for every
//! run to return with the kill that ends it when they do not.

use std::time::Duration;

use async_io::Timer;
use futures_lite::future;

/// How long the runs are given to return before their processes are killed.
pub const CLOSE_LIMIT: Duration = Duration::from_secs(10);

/// How long the kill is given before the window stops waiting.
pub const DESTROY_GRACE: Duration = Duration::from_secs(1);

/// What the confirmation says is at stake.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct CloseQuestion {
    /// Sessions that are working.
    pub working: usize,
    /// Slots whose draft is not empty.
    pub drafts: usize,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CloseStage {
    Open,
    Asking(CloseQuestion),
    Closing,
}

/// The close of every session: it ends when `returned` is over, and `destroy` kills what is left.
pub struct CloseRun {
    /// Over once no run is left.
    pub returned: future::Boxed<()>,
    /// Kills every process that has not ended, now.
    pub destroy: Box<dyn FnOnce() + Send>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CloseEnd {
    Returned,
    Destroyed,
}

/// Waits `limit` for the runs to return; past it, kills and waits `grace` more, and gives up.
pub async fn finish_closing(run: CloseRun, limit: Duration, grace: Duration) -> CloseEnd {
    let CloseRun {
        mut returned,
        destroy,
    } = run;
    if within(&mut returned, limit).await {
        return CloseEnd::Returned;
    }
    destroy();
    within(&mut returned, grace).await;
    CloseEnd::Destroyed
}

/// Whether `waiting` is over within `limit`. The same wait goes on after a `false`.
async fn within(waiting: &mut future::Boxed<()>, limit: Duration) -> bool {
    future::or(
        async {
            waiting.await;
            true
        },
        async {
            Timer::after(limit).await;
            false
        },
    )
    .await
}
