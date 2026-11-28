//! Closing a slot and closing the window.

use super::*;

impl ShellState {
    pub fn close_stage(&self) -> &CloseStage {
        &self.closing
    }

    /// Closes every slot's session. The run is over once every run that has not returned has,
    /// those of replaced sessions too, and the settings saved so far were written; `destroy`
    /// kills the processes of those still left.
    pub fn close_all(&mut self) -> CloseRun {
        for held in self.slots.values() {
            held.runtime.close();
        }
        self.settle_nav();
        let waits: Vec<Receiver<()>> = lock(&self.runs)
            .values()
            .map(|run| run.finished.clone())
            .collect();
        let runs = Arc::clone(&self.runs);
        let flushed = self.ports.settings.flushed();
        let returned = async move {
            for finished in waits {
                // Nothing is ever sent: the receiver closes when the run has returned.
                _ = finished.recv().await;
            }
        };
        CloseRun {
            returned: Box::pin(async move {
                future::zip(returned, flushed).await;
            }),
            destroy: Box::new(move || {
                let left: Vec<SessionRuntime> = lock(&runs)
                    .values()
                    .map(|run| run.runtime.clone())
                    .collect();
                for runtime in left {
                    runtime.destroy_now();
                }
            }),
        }
    }

    /// The slot being asked about before it is closed, and what is at stake.
    pub fn slot_close(&self) -> Option<(SlotId, CloseQuestion)> {
        self.slot_close
    }

    /// Asks before closing a slot that works or holds a draft; closes one that does not.
    pub(super) fn close_slot(&mut self, slot: SlotId) -> Acted {
        // One overlay at a time: the window's question stands, and a slot closes once.
        if self.closing != CloseStage::Open || self.slot_close.is_some() {
            return Acted::default();
        }
        let Some(held) = self.slots.get(&slot).filter(|it| !it.closing) else {
            return Acted::default();
        };
        let question = CloseQuestion {
            working: usize::from(held.is_working()),
            drafts: usize::from(held.composer.has_draft()),
        };
        if question.working == 0 && question.drafts == 0 {
            return self.begin_close_slot(slot);
        }
        self.slot_close = Some((slot, question));
        Acted::default()
    }

    /// Tells the slot's session to end; the slot goes at once if its run has returned, else with
    /// the refresh that sees it return.
    pub(super) fn begin_close_slot(&mut self, slot: SlotId) -> Acted {
        let Some(held) = self.slots.get_mut(&slot).filter(|it| !it.closing) else {
            return Acted::default();
        };
        held.runtime.close();
        held.closing = true;
        if !held.finished.is_closed() {
            return Acted::default();
        }
        self.remove(slot);
        Acted {
            removed: vec![slot],
            ..Acted::default()
        }
    }

    pub(super) fn request_close(&mut self) -> Acted {
        // One overlay at a time: the window's question replaces the slot's and the dialog.
        self.slot_close = None;
        self.dialog = None;
        if self.closing != CloseStage::Open {
            return Acted::default();
        }
        let question = CloseQuestion {
            working: self.slots.values().filter(|it| it.is_working()).count(),
            drafts: self
                .slots
                .values()
                .filter(|it| it.composer.has_draft())
                .count(),
        };
        if question.working == 0 && question.drafts == 0 {
            return self.begin_close();
        }
        self.closing = CloseStage::Asking(question);
        Acted::default()
    }

    /// Enters the closing stage from Open or Asking; from the closing stage it does nothing.
    pub(super) fn begin_close(&mut self) -> Acted {
        if self.closing == CloseStage::Closing {
            return Acted::default();
        }
        self.closing = CloseStage::Closing;
        self.pending_new = None;
        if let Some(picker) = self.resume.take() {
            picker.halt();
        }
        Acted {
            close: true,
            ..Acted::default()
        }
    }
}
