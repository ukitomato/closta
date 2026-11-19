//! What waits for the user across the slots: one row per slot, the oldest wait first.

use std::collections::HashSet;

use closta_presenter::sessions::groups::{
    AlertChange, OpenOnlyAlert, PermissionAlert, SessionAlert,
};
use closta_presenter::sessions::window::{ShownAsk, accepts_answer, next_waiting};

use crate::slot::SlotId;

/// What a row asks for.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum NeedsYouItem {
    Permission(PermissionAlert),
    OpenOnly(OpenOnlyAlert),
    Failed { title: String },
}

/// One row of the needs-you list.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct NeedsYouRow {
    pub slot: SlotId,
    pub title: String,
    pub item: NeedsYouItem,
    /// How many requests the slot waits on.
    pub waiting: usize,
    pub since_ms: i64,
}

impl NeedsYouRow {
    pub fn request_id(&self) -> Option<&str> {
        match &self.item {
            NeedsYouItem::Permission(alert) => Some(&alert.request_id),
            NeedsYouItem::OpenOnly(alert) => Some(&alert.request_id),
            NeedsYouItem::Failed { .. } => None,
        }
    }

    /// The list may allow it: only a permission that can be answered without reading more.
    pub fn may_allow(&self) -> bool {
        matches!(&self.item, NeedsYouItem::Permission(alert) if alert.answerable)
    }
}

/// What one slot waits for, as the shell gathered it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SlotNeeds {
    pub slot: SlotId,
    pub title: String,
    /// The alerts in arrival order, each with the time it was first seen; no `Finished`.
    pub waits: Vec<(SessionAlert, i64)>,
    pub failed: Option<(String, i64)>,
}

/// The rows, oldest first (then by slot). A failed slot shows only its failure; any other
/// shows its first wait with the count of all.
pub fn needs_you_rows(slots: &[SlotNeeds]) -> Vec<NeedsYouRow> {
    let mut rows: Vec<NeedsYouRow> = slots.iter().filter_map(row_of).collect();
    rows.sort_by_key(|row| (row.since_ms, row.slot));
    rows
}

fn row_of(needs: &SlotNeeds) -> Option<NeedsYouRow> {
    if let Some((title, since_ms)) = &needs.failed {
        return Some(NeedsYouRow {
            slot: needs.slot,
            title: needs.title.clone(),
            item: NeedsYouItem::Failed {
                title: title.clone(),
            },
            waiting: 0,
            since_ms: *since_ms,
        });
    }
    let (first, since_ms) = needs.waits.first()?;
    let item = match first {
        SessionAlert::Permission(alert) => NeedsYouItem::Permission(alert.clone()),
        SessionAlert::OpenOnly(alert) => NeedsYouItem::OpenOnly(alert.clone()),
        SessionAlert::Finished(_) => return None,
    };
    Some(NeedsYouRow {
        slot: needs.slot,
        title: needs.title.clone(),
        item,
        waiting: needs.waits.len(),
        since_ms: *since_ms,
    })
}

/// Where Alt+Shift+W goes: the selected slot when it waits, else the next waiting one after it
/// (the first when none is selected or it does not wait).
pub fn jump_target(selected: Option<SlotId>, order: &[SlotId]) -> Option<SlotId> {
    if let Some(selected) = selected.filter(|it| order.contains(it)) {
        return Some(selected);
    }
    let ids: Vec<String> = order.iter().map(SlotId::to_string).collect();
    let next = next_waiting(selected.map(|it| it.to_string()).as_deref(), &ids)?;
    order.iter().copied().find(|it| it.to_string() == next)
}

/// The list takes an answer to `request_id`: its row has been shown for the delay. The time is
/// the list row's own, never a card's in a conversation.
pub fn list_accepts(
    shown_ms: Option<i64>,
    request_id: &str,
    still_waiting: &HashSet<String>,
    now_ms: i64,
) -> bool {
    let Some(since_ms) = shown_ms else {
        return false;
    };
    let shown = ShownAsk {
        session_id: String::new(),
        request_id: Some(request_id.to_owned()),
        since_ms,
    };
    accepts_answer(Some(&shown), request_id, still_waiting, now_ms)
}

/// A change calls for the user's eye: something new waits, or a slot has just failed.
pub fn attention(change: &AlertChange, newly_failed: bool) -> bool {
    !change.raised.is_empty() || newly_failed
}

#[cfg(test)]
mod tests {
    use closta_presenter::sessions::groups::{AlertKind, FinishedAlert};

    use super::*;

    fn permission(request: &str, answerable: bool) -> SessionAlert {
        SessionAlert::Permission(PermissionAlert {
            key: format!("k-{request}"),
            request_id: request.to_owned(),
            tool_name: "Bash".to_owned(),
            subject: String::new(),
            answerable,
        })
    }

    fn open_only(request: &str) -> SessionAlert {
        SessionAlert::OpenOnly(OpenOnlyAlert {
            key: format!("k-{request}"),
            request_id: request.to_owned(),
            what: AlertKind::Question,
        })
    }

    fn needs(n: u64, since_ms: i64) -> SlotNeeds {
        SlotNeeds {
            slot: SlotId::numbered(n),
            title: format!("s{n}"),
            waits: vec![(permission(&format!("r{n}"), true), since_ms)],
            failed: None,
        }
    }

    fn slots_of(rows: &[NeedsYouRow]) -> Vec<u64> {
        rows.iter().map(|it| it.slot.0).collect()
    }

    fn set(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|it| (*it).to_owned()).collect()
    }

    #[test]
    fn rows_follow_the_oldest_wait_then_the_slot() {
        let rows = needs_you_rows(&[needs(1, 2000), needs(3, 1000), needs(2, 2000)]);
        assert_eq!(slots_of(&rows), [3, 1, 2]);
    }

    #[test]
    fn a_slot_with_two_waits_is_one_row_with_its_count() {
        let mut slot = needs(1, 1000);
        slot.waits.push((open_only("r9"), 1500));
        let rows = needs_you_rows(&[slot]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].waiting, 2);
        assert_eq!(rows[0].since_ms, 1000);
        assert_eq!(rows[0].request_id(), Some("r1"));
    }

    #[test]
    fn a_failed_slot_shows_only_its_failure() {
        let mut slot = needs(1, 1000);
        slot.failed = Some(("Could not start".to_owned(), 3000));
        let rows = needs_you_rows(&[slot]);
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0].item,
            NeedsYouItem::Failed {
                title: "Could not start".to_owned()
            }
        );
        assert_eq!(rows[0].since_ms, 3000);
        assert_eq!(rows[0].request_id(), None);
    }

    #[test]
    fn an_empty_slot_has_no_row() {
        let empty = SlotNeeds {
            waits: Vec::new(),
            ..needs(1, 0)
        };
        let finished_only = SlotNeeds {
            waits: vec![(
                SessionAlert::Finished(FinishedAlert {
                    key: "f".to_owned(),
                }),
                5,
            )],
            ..needs(2, 0)
        };
        assert!(needs_you_rows(&[empty, finished_only]).is_empty());
    }

    #[test]
    fn only_an_answerable_permission_may_be_allowed() {
        let row = |alert| {
            needs_you_rows(&[SlotNeeds {
                waits: vec![(alert, 1)],
                ..needs(1, 0)
            }])
            .remove(0)
        };
        assert!(row(permission("r", true)).may_allow());
        assert!(!row(permission("r", false)).may_allow());
        assert!(!row(open_only("r")).may_allow());
    }

    #[test]
    fn jump_stays_on_a_waiting_selected_slot_and_else_goes_to_the_next() {
        let order = [SlotId::numbered(2), SlotId::numbered(5)];
        let id = SlotId::numbered;
        assert_eq!(jump_target(Some(id(5)), &order), Some(id(5)));
        assert_eq!(jump_target(Some(id(3)), &order), Some(id(2)));
        assert_eq!(jump_target(None, &order), Some(id(2)));
        assert_eq!(jump_target(Some(id(3)), &[]), None);
        assert_eq!(jump_target(None, &[]), None);
    }

    #[test]
    fn the_list_takes_an_answer_only_half_a_second_after_it_showed_the_request() {
        let waiting = set(&["r1"]);
        assert!(!list_accepts(Some(1000), "r1", &waiting, 1499));
        assert!(list_accepts(Some(1000), "r1", &waiting, 1500));
        assert!(!list_accepts(Some(1000), "r2", &waiting, 9000));
        assert!(!list_accepts(None, "r1", &waiting, 9000));
        assert!(!list_accepts(Some(1000), "r1", &waiting, 900));
    }

    #[test]
    fn attention_comes_with_a_raised_alert_or_a_new_failure() {
        let finished = AlertChange {
            raised: vec![SessionAlert::Finished(FinishedAlert {
                key: "f".to_owned(),
            })],
            expired: Vec::new(),
        };
        assert!(attention(&finished, false));
        let expired = AlertChange {
            raised: Vec::new(),
            expired: vec!["k".to_owned()],
        };
        assert!(!attention(&expired, false));
        assert!(attention(&expired, true));
        assert!(!attention(&AlertChange::default(), false));
    }
}
