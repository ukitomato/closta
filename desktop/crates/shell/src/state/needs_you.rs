//! The needs-you list, the window's title, and answering from the list.

use super::*;

impl ShellState {
    /// What waits for the user, one row a slot, the oldest first. A slot that is being closed
    /// shows nothing.
    pub fn needs_you(&self) -> Vec<NeedsYouRow> {
        let slots: Vec<SlotNeeds> = self
            .slots
            .iter()
            .filter(|(_, held)| !held.closing)
            .map(|(id, held)| SlotNeeds {
                slot: *id,
                title: held.title.clone(),
                waits: held.waits.clone(),
                failed: self
                    .failure(*id)
                    .zip(held.failed_since)
                    .map(|((title, _), at)| (title, at)),
            })
            .collect();
        needs_you_rows(&slots)
    }

    /// How many requests the listed slots wait on, for the window's title.
    pub fn waiting_count(&self) -> usize {
        self.slots
            .values()
            .filter(|held| !held.closing)
            .map(|held| held.waits.len())
            .sum()
    }

    /// The window's title if it differs from the one this last returned; the first call
    /// always returns one.
    pub fn title_change(&mut self) -> Option<String> {
        let title = copy::window_title(&self.header.title, self.waiting_count());
        if self.shown_title.as_ref() == Some(&title) {
            return None;
        }
        self.shown_title = Some(title.clone());
        Some(title)
    }

    /// The row the needs-you list shows for the slot.
    fn row_of(&self, slot: SlotId) -> Option<NeedsYouRow> {
        self.needs_you().into_iter().find(|it| it.slot == slot)
    }

    /// Allows the request the slot's row shows. Everything must hold: the row shows exactly
    /// this request and it may be allowed unread, the row itself was drawn 500 ms ago in the
    /// place it has now (not a card in the conversation), the slot still waits on it, and the
    /// slot's session is live.
    pub(super) fn allow_from_list(&mut self, slot: SlotId, request_id: &str, now_ms: i64) -> Acted {
        let rows = self.needs_you();
        let Some((place, row)) = rows.iter().enumerate().find(|(_, it)| it.slot == slot) else {
            return Acted::default();
        };
        if row.request_id() != Some(request_id) || !row.may_allow() {
            return Acted::default();
        }
        let Some(held) = self.slots.get(&slot) else {
            return Acted::default();
        };
        let waiting: HashSet<String> = held
            .waits
            .iter()
            .filter_map(|(alert, _)| request_of(alert).map(str::to_owned))
            .collect();
        let shown = held
            .cards
            .get(request_id)
            .and_then(|it| it.list_shown)
            .filter(|(at, _)| *at == place)
            .map(|(_, since_ms)| (request_id, since_ms));
        if !list_accepts(shown, request_id, &waiting, now_ms) {
            return Acted::default();
        }
        self.answer_card(slot, request_id, Reply::Choose(0))
    }

    pub(super) fn deny_from_list(&mut self, slot: SlotId, request_id: &str) -> Acted {
        let Some(row) = self.row_of(slot) else {
            return Acted::default();
        };
        if row.request_id() != Some(request_id) || !row.may_allow() {
            return Acted::default();
        }
        self.select(slot);
        let Some(card) = self.card_mut(slot, request_id) else {
            return Acted::default();
        };
        card.note_open = true;
        Acted {
            focus: Some(FocusTarget::CardNote {
                slot,
                request_id: request_id.to_owned(),
            }),
            ..Acted::default()
        }
    }

    pub(super) fn open_from_list(&mut self, slot: SlotId) -> Acted {
        let Some(row) = self.row_of(slot) else {
            return Acted::default();
        };
        self.select(slot);
        let focus = match row.request_id() {
            Some(request_id) => FocusTarget::Card {
                slot,
                request_id: request_id.to_owned(),
            },
            None => FocusTarget::FailureBand(slot),
        };
        Acted {
            focus: Some(focus),
            ..Acted::default()
        }
    }

    pub(super) fn jump_to_waiting(&mut self) -> Acted {
        let rows = self.needs_you();
        let order: Vec<SlotId> = rows
            .iter()
            .filter(|it| it.request_id().is_some())
            .map(|it| it.slot)
            .collect();
        let Some(slot) = jump_target(self.selected, &order) else {
            return Acted::default();
        };
        let Some(request_id) = rows
            .iter()
            .find(|it| it.slot == slot)
            .and_then(NeedsYouRow::request_id)
        else {
            return Acted::default();
        };
        self.select(slot);
        Acted {
            focus: Some(FocusTarget::Card {
                slot,
                request_id: request_id.to_owned(),
            }),
            ..Acted::default()
        }
    }

    /// Whether the card's row was drawn in the needs-you list.
    pub fn list_shown(&self, slot: SlotId, request_id: &str) -> bool {
        self.list_shown_at(slot, request_id).is_some()
    }

    /// Where the card's row was drawn in the needs-you list (its index among the rows), when it
    /// was.
    pub fn list_shown_at(&self, slot: SlotId, request_id: &str) -> Option<usize> {
        self.card_state(slot, request_id)?
            .list_shown
            .map(|(at, _)| at)
    }
}
