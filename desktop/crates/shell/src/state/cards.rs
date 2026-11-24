//! The waiting cards: what is kept of each, and answering them.

use super::*;

impl ShellState {
    /// What is kept of the card of a request the slot waits on.
    pub fn card_state(&self, slot: SlotId, request_id: &str) -> Option<&CardState> {
        self.slots.get(&slot)?.cards.get(request_id)
    }

    /// Where the card of `request_id` stands among the slot's rows.
    pub fn card_at(&self, slot: SlotId, request_id: &str) -> Option<usize> {
        self.slots.get(&slot)?.rows.iter().position(
            |row| matches!(row, ThreadRow::Card(it) if it.card.request_id() == request_id),
        )
    }

    /// Whether the card was drawn in the conversation.
    pub fn shown(&self, slot: SlotId, request_id: &str) -> bool {
        self.card_state(slot, request_id)
            .is_some_and(|it| it.shown_ms.is_some())
    }

    /// The card's state, made from the card when it is first touched; `None` unless the slot
    /// waits on the request.
    pub(super) fn card_mut(&mut self, slot: SlotId, request_id: &str) -> Option<&mut CardState> {
        let held = self.slots.get_mut(&slot)?;
        if !held.cards.contains_key(request_id) {
            held.waits
                .iter()
                .find(|(alert, _)| request_of(alert) == Some(request_id))?;
            let view = held.runtime.view();
            let approval = view.transcript.approvals.get(request_id)?;
            let card = card_of(approval, plan_go_of(&view.transcript.operations));
            held.cards
                .insert(request_id.to_owned(), CardState::for_card(&card));
        }
        held.cards.get_mut(request_id)
    }

    /// Whether the card of the request keeps rules somewhere and `place` is one of the places it
    /// offers.
    pub(super) fn offers_place(&self, slot: SlotId, request_id: &str, place: &str) -> bool {
        let Some(held) = self.slots.get(&slot) else {
            return false;
        };
        let view = held.runtime.view();
        view.transcript
            .approvals
            .get(request_id)
            .is_some_and(|it| offers_destination(&it.suggestions))
            && SUGGESTION_DESTINATIONS.contains(&place)
    }

    /// Changes the picks of a question the card of the request asks, if it asks it (and has the
    /// option); `change` is told whether the question takes several answers.
    pub(super) fn pick(
        &mut self,
        slot: SlotId,
        request_id: &str,
        question: usize,
        option: Option<usize>,
        change: impl FnOnce(&mut CardState, bool),
    ) -> Acted {
        let multi = self.slots.get(&slot).and_then(|held| {
            let view = held.runtime.view();
            let approval = view.transcript.approvals.get(request_id)?;
            let ThreadCard::Question(card) =
                card_of(approval, plan_go_of(&view.transcript.operations))
            else {
                return None;
            };
            let asked = card.questions.get(question)?;
            option
                .is_none_or(|at| at < asked.options.len())
                .then_some(asked.multi_select)
        });
        let Some(multi) = multi else {
            return Acted::default();
        };
        let Some(card) = self.card_mut(slot, request_id) else {
            return Acted::default();
        };
        change(card, multi);
        self.remeasured(slot, request_id)
    }

    pub(super) fn set_note_open(&mut self, slot: SlotId, request_id: &str, open: bool) -> Acted {
        let Some(card) = self.card_mut(slot, request_id) else {
            return Acted::default();
        };
        card.note_open = open;
        let focus = if open {
            FocusTarget::CardNote {
                slot,
                request_id: request_id.to_owned(),
            }
        } else {
            FocusTarget::Card {
                slot,
                request_id: request_id.to_owned(),
            }
        };
        Acted {
            focus: Some(focus),
            ..self.remeasured(slot, request_id)
        }
    }

    /// The card's row is to be measured again.
    pub(super) fn remeasured(&self, slot: SlotId, request_id: &str) -> Acted {
        let changes = self
            .card_at(slot, request_id)
            .map(|at| RowChange::Remeasure(at..at + 1));
        Acted {
            rows: Some((slot, changes.into_iter().collect())),
            ..Acted::default()
        }
    }

    /// Answers the card in the conversation as `reply` says, if it was first drawn half a second
    /// before `now_ms`: a card that has just come up under the pointer or a held key is not
    /// answered unread.
    pub(super) fn answer_shown_card(
        &mut self,
        slot: SlotId,
        request_id: &str,
        reply: Reply,
        now_ms: i64,
    ) -> Acted {
        let shown_ms = self.card_state(slot, request_id).and_then(|it| it.shown_ms);
        if !card_accepts(shown_ms, now_ms) {
            return Acted::default();
        }
        self.answer_card(slot, request_id, reply)
    }

    /// Answers the card of `request_id` as `reply` says, if the session is running and waits on
    /// it. The first time it was seen is when the answer was asked for. A card whose answer
    /// could not be sent says so and stays.
    pub(super) fn answer_card(&mut self, slot: SlotId, request_id: &str, reply: Reply) -> Acted {
        let Some(held) = self.slots.get_mut(&slot).filter(|it| !it.closing) else {
            return Acted::default();
        };
        let Some(commands) = held.runtime.commands() else {
            return Acted::default();
        };
        if !matches!(held.runtime.status(), SessionStatus::Running { .. }) {
            return Acted::default();
        }
        let Some(first_seen) = held
            .waits
            .iter()
            .find(|(alert, _)| request_of(alert) == Some(request_id))
            .map(|(_, at)| *at)
        else {
            return Acted::default();
        };
        let view = held.runtime.view();
        if !view
            .conversation
            .pending_approvals
            .iter()
            .any(|it| it.request_id == request_id)
        {
            return Acted::default();
        }
        let Some(approval) = view.transcript.approvals.get(request_id) else {
            return Acted::default();
        };
        let go = plan_go_of(&view.transcript.operations);
        // A card never touched still keeps its rules where it starts out.
        let untouched;
        let state = match held.cards.get(request_id) {
            Some(state) => state,
            None => {
                untouched = CardState::for_card(&card_of(approval, go));
                &untouched
            }
        };
        let Some(answer) = verdict(approval, go, Some(state), reply) else {
            return Acted::default();
        };
        let requested_at =
            UNIX_EPOCH + Duration::from_millis(u64::try_from(first_seen).unwrap_or(0));
        match commands.respond_to_approval(
            &answer.decision,
            requested_at,
            answer.payload.as_deref(),
            answer.passed_on,
        ) {
            Ok(()) => {
                held.cards.remove(request_id);
                if let Some(mode) = answer.mode_after {
                    // The allow already carries the mode; a refused backstop changes nothing.
                    let _ = commands.switch_mode(&mode);
                }
            }
            Err(_) => commands.answer_failed(request_id, copy::ANSWER_FAILED),
        }
        Acted::default()
    }
}
