//! Waiting on one slot's session: a wake-up per batch of changes, until the session has ended.

use async_channel::Receiver;
use closta_session::status::SessionStatus;
use futures_lite::future;

use crate::slot::SlotId;

/// Waits on the status and the view of the session one slot held at one generation.
pub struct SlotWatch {
    slot: SlotId,
    generation: u64,
    status: Receiver<SessionStatus>,
    /// `None` once the view's channel closed before the status's.
    view: Option<Receiver<()>>,
    /// Closed once the session's run has returned: nothing writes its view after that.
    finished: Receiver<()>,
}

enum Woke {
    Changed,
    StatusClosed,
    ViewClosed,
}

impl SlotWatch {
    pub(crate) fn new(
        slot: SlotId,
        generation: u64,
        status: Receiver<SessionStatus>,
        view: Receiver<()>,
        finished: Receiver<()>,
    ) -> SlotWatch {
        SlotWatch {
            slot,
            generation,
            status,
            view: Some(view),
            finished,
        }
    }

    pub fn slot(&self) -> SlotId {
        self.slot
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Waits for a change of the status or the view, lets go of every wake-up that came with
    /// it, and returns `true`. Returns `false` once the session has ended and its run has
    /// returned; the caller then refreshes once more and stops waiting.
    ///
    /// The status channel closes at the end, but a closed session's run can still write its
    /// view while it winds down, after the view's channel was closed. Waiting for the run to
    /// return makes the last refresh read what it wrote.
    pub async fn changed(&mut self) -> bool {
        loop {
            let status = async {
                match self.status.recv().await {
                    Ok(_) => Woke::Changed,
                    Err(_) => Woke::StatusClosed,
                }
            };
            let woke = match &self.view {
                Some(view) => {
                    future::or(status, async {
                        match view.recv().await {
                            Ok(()) => Woke::Changed,
                            Err(_) => Woke::ViewClosed,
                        }
                    })
                    .await
                }
                None => status.await,
            };
            match woke {
                Woke::Changed => {
                    while self.status.try_recv().is_ok() {}
                    if let Some(view) = &self.view {
                        while view.try_recv().is_ok() {}
                    }
                    return true;
                }
                Woke::ViewClosed => self.view = None,
                Woke::StatusClosed => {
                    _ = self.finished.recv().await;
                    return false;
                }
            }
        }
    }
}
