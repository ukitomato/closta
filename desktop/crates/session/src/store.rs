//! The conversation of one session under one lock. ConversationStore in SessionCommands.kt.

use std::sync::{Mutex, MutexGuard, PoisonError};

use async_channel::{Receiver, Sender, TrySendError};
use closta_model::ConversationState;
use closta_presenter::session::SessionView;

/// Core's state and the transcript of one session ([`SessionView`]), with every write
/// serialised: the event fold and an approval's answer both read the current view and replace
/// it, and without one lock between them a write made from an older view would drop what was
/// folded meanwhile.
///
/// The lock is never held across an `await`, and a step must not touch the store again.
#[derive(Default)]
pub struct ConversationStore {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    view: SessionView,
    watchers: Vec<Sender<()>>,
    closed: bool,
}

impl ConversationStore {
    // A step that panicked left the view it read in place: the store goes on from there.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Core's state and the transcript, from the same write.
    pub fn view(&self) -> SessionView {
        self.lock().view.clone()
    }

    /// Core's state alone.
    pub fn conversation(&self) -> ConversationState {
        self.lock().view.conversation.clone()
    }

    /// Replaces the view with what `step` makes of it.
    pub fn transition(&self, step: impl FnOnce(SessionView) -> SessionView) {
        self.transition_with(|view| (step(view), ()));
    }

    /// Replaces the view with what `step` makes of it, and returns what else it gave. Every
    /// watcher is told once the view is written.
    pub fn transition_with<R>(&self, step: impl FnOnce(SessionView) -> (SessionView, R)) -> R {
        let mut inner = self.lock();
        // Cloned, not taken: a step that panics leaves the last view in place.
        let (next, result) = step(inner.view.clone());
        inner.view = next;
        inner
            .watchers
            .retain(|watcher| !matches!(watcher.try_send(()), Err(TrySendError::Closed(()))));
        result
    }

    /// A ping after each write. It holds at most one: a watcher that does not read is told once,
    /// and reads the latest view with [`ConversationStore::view`]. A dropped receiver is let go
    /// at the next write, and every receiver at [`ConversationStore::close_watchers`].
    pub fn watch(&self) -> Receiver<()> {
        let (sender, receiver) = async_channel::bounded(1);
        let mut inner = self.lock();
        if !inner.closed {
            inner.watchers.push(sender);
        }
        receiver
    }

    /// Lets every watcher go: a ping already sent is still read, then the receiver is closed.
    /// A [`ConversationStore::watch`] taken after this returns a closed receiver. The view can
    /// still be written and read.
    pub fn close_watchers(&self) {
        let mut inner = self.lock();
        inner.closed = true;
        inner.watchers.clear();
    }
}
