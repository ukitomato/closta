//! One slot's input box as the shell keeps it: the draft, what was sent before, and why the last
//! send did not go. It outlives a Restart, so the draft and the history survive it.

use std::collections::VecDeque;

use closta_core::ports::SendError;
use closta_presenter::input::SendId;

use crate::copy;

/// How many sent messages the history keeps.
pub const HISTORY_LIMIT: usize = 100;

#[derive(Default)]
pub struct Composer {
    draft: String,
    reason: Option<&'static str>,
    /// Ids already handed out; never reset, so a Restart does not reuse one.
    sent: u64,
    /// Sent messages, newest first.
    history: VecDeque<String>,
    /// The history place being shown, and the draft it replaced.
    browsing: Option<Browsing>,
}

struct Browsing {
    place: usize,
    stashed: String,
}

impl Composer {
    pub fn draft(&self) -> &str {
        &self.draft
    }

    pub fn reason(&self) -> Option<&'static str> {
        self.reason
    }

    /// Whether a sent message is shown in place of the draft.
    pub fn browsing(&self) -> bool {
        self.browsing.is_some()
    }

    pub fn has_draft(&self) -> bool {
        !self.draft.trim().is_empty()
    }

    /// Replaces the draft with what the user typed. Returns whether it changed; the same text
    /// changes nothing, so a redundant change event keeps the history place and the reason.
    pub fn edit(&mut self, text: &str) -> bool {
        if self.draft == text {
            return false;
        }
        text.clone_into(&mut self.draft);
        self.reason = None;
        self.browsing = None;
        true
    }

    /// The message to send, as typed, under a new id. A blank draft sends nothing and stays.
    pub fn take_for_send(&mut self) -> Option<(SendId, String)> {
        if !self.has_draft() {
            return None;
        }
        self.sent += 1;
        let id = SendId::new(&format!("s{}", self.sent))?;
        let text = std::mem::take(&mut self.draft);
        self.reason = None;
        self.browsing = None;
        self.history.push_front(text.clone());
        self.history.truncate(HISTORY_LIMIT);
        Some((id, text))
    }

    /// Forgets the reason a send did not go: the session it was about is gone.
    pub fn clear_reason(&mut self) {
        self.reason = None;
    }

    pub fn not_running(&mut self) {
        self.reason = Some(copy::NOT_RUNNING);
    }

    /// Puts the message back in front of whatever was typed since, and says why it did not go.
    pub fn failed(&mut self, sent: String, error: &SendError) {
        self.draft = if self.draft.is_empty() {
            sent
        } else {
            format!("{sent}\n{}", self.draft)
        };
        self.browsing = None;
        self.reason = Some(match error {
            SendError::Closed => copy::SEND_CLOSED,
            SendError::Encode(_) => copy::SEND_ENCODE,
        });
    }

    /// Shows the next older sent message, keeping the draft aside while browsing.
    pub fn previous(&mut self) -> bool {
        let place = match &self.browsing {
            None => 0,
            Some(browsing) => browsing.place + 1,
        };
        let Some(text) = self.history.get(place) else {
            return false;
        };
        let stashed = match self.browsing.take() {
            Some(browsing) => browsing.stashed,
            None => std::mem::take(&mut self.draft),
        };
        self.draft.clone_from(text);
        self.browsing = Some(Browsing { place, stashed });
        true
    }

    /// Shows the next newer sent message, and the draft that was set aside past the newest.
    #[allow(clippy::should_implement_trait)] // History's "next", not an iterator step.
    pub fn next(&mut self) -> bool {
        let Some(browsing) = self.browsing.take() else {
            return false;
        };
        match browsing.place.checked_sub(1) {
            Some(place) => {
                self.draft.clone_from(&self.history[place]);
                self.browsing = Some(Browsing { place, ..browsing });
            }
            None => self.draft = browsing.stashed,
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use closta_core::ports::EncodeError;

    use super::*;

    fn send(composer: &mut Composer, text: &str) -> (SendId, String) {
        composer.edit(text);
        composer.take_for_send().expect("sent")
    }

    #[test]
    fn a_blank_draft_is_not_sent_and_stays() {
        let mut composer = Composer::default();
        composer.edit("  \n ");
        assert!(composer.take_for_send().is_none());
        assert_eq!(composer.draft(), "  \n ");
        assert!(!composer.has_draft());
    }

    #[test]
    fn sending_empties_the_draft_and_numbers_from_s1() {
        let mut composer = Composer::default();
        composer.edit(" hi ");
        let (first, text) = composer.take_for_send().expect("sent");
        assert_eq!(text, " hi ");
        assert_eq!(composer.draft(), "");
        assert_eq!(Some(first), SendId::new("s1"));
        let (second, _) = send(&mut composer, "again");
        assert_eq!(Some(second), SendId::new("s2"));
    }

    #[test]
    fn a_failed_send_puts_the_text_back_with_its_reason() {
        let mut composer = Composer::default();
        composer.failed("sent".to_owned(), &SendError::Closed);
        assert_eq!(composer.draft(), "sent");
        assert_eq!(
            composer.reason(),
            Some("The session has ended. Restart it to send.")
        );
        composer.failed(
            "sent".to_owned(),
            &SendError::Encode(EncodeError::BadPayload),
        );
        assert_eq!(
            composer.reason(),
            Some("This message could not be encoded.")
        );
    }

    #[test]
    fn a_failed_send_joins_what_was_typed_meanwhile_after_a_newline() {
        let mut composer = Composer::default();
        composer.edit("more");
        composer.failed("sent".to_owned(), &SendError::Closed);
        assert_eq!(composer.draft(), "sent\nmore");
    }

    #[test]
    fn history_goes_back_newest_first_and_restores_the_draft_past_the_newest() {
        let mut composer = Composer::default();
        send(&mut composer, "one");
        send(&mut composer, "two");
        composer.edit("typing");
        assert!(!composer.next());
        assert!(composer.previous());
        assert_eq!(composer.draft(), "two");
        assert!(composer.previous());
        assert_eq!(composer.draft(), "one");
        assert!(!composer.previous());
        assert_eq!(composer.draft(), "one");
        assert!(composer.next());
        assert_eq!(composer.draft(), "two");
        assert!(composer.next());
        assert_eq!(composer.draft(), "typing");
        assert!(!composer.next());
    }

    #[test]
    fn browsing_lasts_from_the_first_step_back_until_the_draft_is_back_or_edited() {
        let mut composer = Composer::default();
        send(&mut composer, "one");
        composer.edit("typing");
        assert!(!composer.browsing());
        composer.previous();
        assert!(composer.browsing());
        composer.next();
        assert!(!composer.browsing(), "the draft is back");
        composer.previous();
        composer.edit("changed");
        assert!(!composer.browsing(), "an edit ends it");
    }

    #[test]
    fn history_keeps_the_last_hundred() {
        let mut composer = Composer::default();
        for n in 0..=HISTORY_LIMIT {
            send(&mut composer, &format!("m{n}"));
        }
        for _ in 0..HISTORY_LIMIT {
            assert!(composer.previous());
        }
        assert_eq!(composer.draft(), "m1");
        assert!(!composer.previous());
    }

    #[test]
    fn editing_while_browsing_stops_browsing() {
        let mut composer = Composer::default();
        send(&mut composer, "one");
        send(&mut composer, "two");
        composer.edit("mine");
        composer.previous();
        assert!(composer.edit("two!"));
        assert!(!composer.next());
        assert_eq!(composer.draft(), "two!");
        assert!(composer.previous());
        assert_eq!(composer.draft(), "two");
        assert!(composer.next());
        assert_eq!(composer.draft(), "two!");
    }

    #[test]
    fn an_edit_equal_to_the_draft_keeps_the_history_place_and_the_reason() {
        let mut composer = Composer::default();
        send(&mut composer, "one");
        composer.edit("mine");
        composer.previous();
        assert!(!composer.edit("one"));
        assert!(composer.next());
        assert_eq!(composer.draft(), "mine");

        let mut composer = Composer::default();
        composer.failed("sent".to_owned(), &SendError::Closed);
        assert!(!composer.edit("sent"));
        assert_eq!(composer.reason(), Some(copy::SEND_CLOSED));
    }

    #[test]
    fn not_running_keeps_the_draft_and_says_why() {
        let mut composer = Composer::default();
        composer.edit("keep");
        composer.not_running();
        assert_eq!(composer.draft(), "keep");
        assert_eq!(composer.reason(), Some("Session is not running"));
        assert!(composer.edit("keep more"));
        assert_eq!(composer.reason(), None);
    }
}
