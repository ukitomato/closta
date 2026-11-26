//! Which key does what around a card, and where a new card may take the keyboard. One table, so
//! the shell tests every row and the screen only maps its events to these values.

use closta_presenter::cards::{PermissionCard, ThreadCard};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CardKind {
    Permission,
    Plan,
    Question,
}

pub fn card_kind(card: &ThreadCard) -> CardKind {
    match card {
        ThreadCard::Permission(_) => CardKind::Permission,
        ThreadCard::Plan(_) => CardKind::Plan,
        ThreadCard::Question(_) => CardKind::Question,
    }
}

/// How many buttons the card has: a permission has Allow, Deny and, when the CLI offered
/// something to keep, a third; a plan has three; a question has none.
pub fn card_choices(card: &ThreadCard) -> usize {
    match card {
        ThreadCard::Permission(PermissionCard { suggestions, .. }) if suggestions.is_empty() => 2,
        ThreadCard::Permission(_) => 3,
        ThreadCard::Plan(_) => 3,
        ThreadCard::Question(_) => 0,
    }
}

/// Where the keyboard is.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FocusScene {
    Composer,
    FileEditor,
    /// The conversation, outside any waiting card.
    Thread,
    Card {
        kind: CardKind,
        choices: usize,
    },
    /// A card's text field: Deny..., Keep Planning... or Other.
    CardText {
        kind: CardKind,
    },
    /// A question's option.
    QuestionOption,
    /// A needs-you row in the list.
    NeedsYou,
    /// A dialog or a confirmation.
    Overlay,
    /// The left list's cursor row.
    Nav,
    /// No focus anywhere in particular: a band or one of its buttons, the window itself.
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Key {
    /// 1 to 9. The screen maps the digit row and the numpad alike.
    Digit(u8),
    Escape,
    Enter,
    Space,
    W,
    Up,
    Down,
    Left,
    Right,
    N,
    O,
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct CardKey {
    pub key: Key,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub platform: bool,
    /// The key came again without being released: a key repeat.
    pub held: bool,
}

impl CardKey {
    pub fn plain(key: Key) -> CardKey {
        CardKey {
            key,
            ctrl: false,
            alt: false,
            shift: false,
            platform: false,
            held: false,
        }
    }

    fn unmodified(&self) -> bool {
        !(self.ctrl || self.alt || self.shift || self.platform)
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CardKeyOutcome {
    /// Pick this button, counting from 0.
    Choose(usize),
    Deny,
    LeaveText,
    Answer,
    Toggle,
    ToComposer,
    NextWaiting,
    /// Open the row under the list's cursor.
    NavEnter,
    /// Leave the list for the selected slot's composer.
    LeaveList,
    /// Stop here and do nothing, so the focused part never receives it.
    Swallow,
    /// Hand it to the focused part as it is.
    Pass,
}

/// Tells a key held down from a fresh press: the key events carry no repeat flag, so the first
/// press of a key is remembered until its release.
#[derive(Default)]
pub struct Repeats {
    down: std::collections::HashSet<String>,
}

impl Repeats {
    /// Whether `key` came again with no release in between.
    pub fn pressed(&mut self, key: &str) -> bool {
        !self.down.insert(key.to_owned())
    }

    pub fn released(&mut self, key: &str) {
        self.down.remove(key);
    }

    /// Forgets every key, for when a release may have gone unseen.
    pub fn clear(&mut self) {
        self.down.clear();
    }
}

/// What a key does in `scene`, top to bottom: the first row that fits decides.
pub fn card_key(scene: &FocusScene, key: &CardKey) -> CardKeyOutcome {
    use CardKeyOutcome::{
        Answer, Choose, Deny, LeaveList, LeaveText, NavEnter, NextWaiting, Pass, Swallow,
        ToComposer, Toggle,
    };

    let in_card = matches!(
        scene,
        FocusScene::Card { .. } | FocusScene::CardText { .. } | FocusScene::QuestionOption
    );
    if key.alt && key.shift && !key.ctrl && !key.platform && key.key == Key::W {
        return match scene {
            _ if in_card => ToComposer,
            FocusScene::Overlay => Swallow,
            _ => NextWaiting,
        };
    }
    if key.held && key.unmodified() && held_is_stopped(scene, key.key) {
        return Swallow;
    }
    if *scene == FocusScene::Overlay {
        return Pass;
    }
    if key.key == Key::Escape && key.unmodified() {
        match scene {
            FocusScene::NeedsYou | FocusScene::Nav => return LeaveList,
            FocusScene::CardText { .. } => return LeaveText,
            FocusScene::Card { .. } | FocusScene::QuestionOption => return Deny,
            _ => {}
        }
    }
    let question_card = matches!(
        scene,
        FocusScene::Card {
            kind: CardKind::Question,
            ..
        }
    );
    let question_text = matches!(
        scene,
        FocusScene::CardText {
            kind: CardKind::Question
        }
    );
    if question_card || question_text || *scene == FocusScene::QuestionOption {
        let ctrl_only = (key.ctrl || key.platform) && !key.alt && !key.shift;
        if key.key == Key::Enter && ctrl_only {
            return Answer;
        }
        if *scene == FocusScene::QuestionOption
            && matches!(key.key, Key::Space | Key::Enter)
            && key.unmodified()
        {
            return Toggle;
        }
        return if question_card { Swallow } else { Pass };
    }
    if matches!(scene, FocusScene::CardText { .. }) || !key.unmodified() {
        return Pass;
    }
    match scene {
        FocusScene::Card { choices, .. } => match key.key {
            Key::Digit(n) if n >= 1 && usize::from(n) <= *choices => Choose(usize::from(n) - 1),
            Key::Digit(_) | Key::Enter | Key::Space => Swallow,
            _ => Pass,
        },
        FocusScene::NeedsYou | FocusScene::Nav => match key.key {
            Key::Enter => NavEnter,
            Key::Digit(_) | Key::Space => Swallow,
            _ => Pass,
        },
        _ => Pass,
    }
}

/// Whether an unmodified key that is being held down must not act in `scene`: a repeat would
/// answer twice, or press what an earlier Enter just focused. Typing repeats stay.
fn held_is_stopped(scene: &FocusScene, key: Key) -> bool {
    let list_or_card = matches!(
        scene,
        FocusScene::Card { .. }
            | FocusScene::QuestionOption
            | FocusScene::NeedsYou
            | FocusScene::Nav
    );
    match key {
        Key::Enter => true,
        Key::Escape => list_or_card || matches!(scene, FocusScene::CardText { .. }),
        Key::Digit(_) => list_or_card,
        Key::Space => !matches!(
            scene,
            FocusScene::Composer | FocusScene::CardText { .. } | FocusScene::FileEditor
        ),
        _ => false,
    }
}

/// Whether a card that appears may take the keyboard: only from the conversation, never from
/// something the user is typing in or reading.
pub fn card_may_take_focus(focus: &FocusScene) -> bool {
    *focus == FocusScene::Thread
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OverlayKey {
    Cancel,
    Confirm,
    Pass,
}

pub fn overlay_key(key: &CardKey) -> OverlayKey {
    match key.key {
        Key::Escape if key.unmodified() => OverlayKey::Cancel,
        Key::Enter if key.unmodified() => OverlayKey::Confirm,
        _ => OverlayKey::Pass,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use closta_presenter::cards::plan::{PlanCard, PlanGo};
    use closta_presenter::cards::{QuestionCard, ThreadCard};
    use closta_presenter::transcript::SuggestionRecord;

    use super::CardKeyOutcome::{
        Answer, Choose, Deny, LeaveList, LeaveText, NavEnter, NextWaiting, Pass, Swallow,
        ToComposer, Toggle,
    };
    use super::*;

    const KINDS: [CardKind; 3] = [CardKind::Permission, CardKind::Plan, CardKind::Question];

    fn plain(key: Key) -> CardKey {
        CardKey::plain(key)
    }

    fn with(key: Key, ctrl: bool, alt: bool, shift: bool, platform: bool) -> CardKey {
        CardKey {
            key,
            ctrl,
            alt,
            shift,
            platform,
            held: false,
        }
    }

    fn jump() -> CardKey {
        with(Key::W, false, true, true, false)
    }

    fn held(key: Key) -> CardKey {
        CardKey {
            held: true,
            ..CardKey::plain(key)
        }
    }

    fn card(kind: CardKind, choices: usize) -> FocusScene {
        FocusScene::Card { kind, choices }
    }

    fn permission_card(suggestions: Vec<SuggestionRecord>) -> ThreadCard {
        ThreadCard::Permission(closta_presenter::cards::PermissionCard {
            request_id: "r".to_owned(),
            tool_name: "Bash".to_owned(),
            subject: None,
            suggestions: Arc::from(suggestions),
            answered: None,
            failure: None,
            diff: None,
            input_fields: Vec::new(),
            hidden_marked: false,
            subject_in_fields: false,
            sandbox_off: false,
            raw_path: None,
            suggestion_lines: Vec::new(),
        })
    }

    #[test]
    fn alt_shift_w_leaves_a_card_for_the_composer() {
        let scenes = [
            card(CardKind::Permission, 3),
            FocusScene::CardText {
                kind: CardKind::Plan,
            },
            FocusScene::QuestionOption,
        ];
        for scene in scenes {
            assert_eq!(card_key(&scene, &jump()), ToComposer, "{scene:?}");
        }
    }

    #[test]
    fn alt_shift_w_elsewhere_goes_to_the_next_waiting_card() {
        let scenes = [
            FocusScene::Composer,
            FocusScene::FileEditor,
            FocusScene::Thread,
            FocusScene::NeedsYou,
            FocusScene::Nav,
            FocusScene::Other,
        ];
        for scene in scenes {
            assert_eq!(card_key(&scene, &jump()), NextWaiting, "{scene:?}");
        }
    }

    #[test]
    fn alt_shift_w_needs_exactly_alt_and_shift() {
        let scene = FocusScene::Composer;
        assert_eq!(
            card_key(&scene, &with(Key::W, true, true, true, false)),
            Pass
        );
        assert_eq!(
            card_key(&scene, &with(Key::W, false, true, true, true)),
            Pass
        );
        assert_eq!(
            card_key(&scene, &with(Key::W, false, true, false, false)),
            Pass
        );
    }

    #[test]
    fn escape_in_a_text_line_only_leaves_it() {
        for kind in KINDS {
            let scene = FocusScene::CardText { kind };
            assert_eq!(card_key(&scene, &plain(Key::Escape)), LeaveText, "{kind:?}");
        }
    }

    #[test]
    fn escape_on_a_card_says_no() {
        for kind in KINDS {
            let scene = card(kind, 2);
            assert_eq!(card_key(&scene, &plain(Key::Escape)), Deny, "{kind:?}");
        }
        assert_eq!(
            card_key(&FocusScene::QuestionOption, &plain(Key::Escape)),
            Deny
        );
        let shifted = with(Key::Escape, false, false, true, false);
        assert_eq!(card_key(&card(CardKind::Permission, 2), &shifted), Pass);
        assert_eq!(card_key(&FocusScene::QuestionOption, &shifted), Pass);
    }

    #[test]
    fn ctrl_enter_answers_a_question_from_anywhere_in_it() {
        let scenes = [
            card(CardKind::Question, 0),
            FocusScene::CardText {
                kind: CardKind::Question,
            },
            FocusScene::QuestionOption,
        ];
        for scene in scenes {
            for (ctrl, platform) in [(true, false), (false, true)] {
                let key = with(Key::Enter, ctrl, false, false, platform);
                assert_eq!(card_key(&scene, &key), Answer, "{scene:?}");
            }
        }
        assert_eq!(
            card_key(&card(CardKind::Question, 0), &plain(Key::Enter)),
            Swallow
        );
        let alt = with(Key::Enter, true, true, false, false);
        assert_ne!(card_key(&FocusScene::QuestionOption, &alt), Answer);
    }

    #[test]
    fn space_and_enter_toggle_a_focused_option() {
        for key in [Key::Space, Key::Enter] {
            assert_eq!(card_key(&FocusScene::QuestionOption, &plain(key)), Toggle);
        }
        let shifted = with(Key::Space, false, false, true, false);
        assert_eq!(card_key(&FocusScene::QuestionOption, &shifted), Pass);
        assert_eq!(
            card_key(&FocusScene::QuestionOption, &plain(Key::Digit(1))),
            Pass
        );
        let text = FocusScene::CardText {
            kind: CardKind::Question,
        };
        assert_eq!(card_key(&text, &plain(Key::Enter)), Pass);
        assert_eq!(
            card_key(&card(CardKind::Question, 0), &plain(Key::Space)),
            Swallow
        );
    }

    #[test]
    fn a_digit_in_a_text_line_or_with_a_modifier_is_typed() {
        let text = FocusScene::CardText {
            kind: CardKind::Permission,
        };
        assert_eq!(card_key(&text, &plain(Key::Digit(1))), Pass);
        let ctrl = with(Key::Digit(1), true, false, false, false);
        assert_eq!(card_key(&card(CardKind::Permission, 3), &ctrl), Pass);
    }

    #[test]
    fn digits_choose_up_to_the_buttons() {
        for kind in [CardKind::Permission, CardKind::Plan] {
            let three = card(kind, 3);
            assert_eq!(card_key(&three, &plain(Key::Digit(1))), Choose(0));
            assert_eq!(card_key(&three, &plain(Key::Digit(3))), Choose(2));
            assert_eq!(card_key(&three, &plain(Key::Digit(4))), Swallow);
            let two = card(kind, 2);
            assert_eq!(card_key(&two, &plain(Key::Digit(2))), Choose(1));
            assert_eq!(card_key(&two, &plain(Key::Digit(3))), Swallow);
        }
    }

    #[test]
    fn enter_and_space_on_a_card_do_nothing() {
        for kind in [CardKind::Permission, CardKind::Plan] {
            let scene = card(kind, 3);
            assert_eq!(card_key(&scene, &plain(Key::Enter)), Swallow);
            assert_eq!(card_key(&scene, &plain(Key::Space)), Swallow);
            assert_eq!(card_key(&scene, &plain(Key::Other)), Pass);
        }
    }

    #[test]
    fn digits_and_space_on_a_needs_you_row_still_do_nothing() {
        for key in [Key::Digit(1), Key::Digit(9), Key::Space] {
            assert_eq!(card_key(&FocusScene::NeedsYou, &plain(key)), Swallow);
        }
        assert_eq!(card_key(&FocusScene::NeedsYou, &plain(Key::Other)), Pass);
        for scene in [
            FocusScene::Composer,
            FocusScene::FileEditor,
            FocusScene::Thread,
            FocusScene::Other,
        ] {
            assert_eq!(card_key(&scene, &plain(Key::Digit(1))), Pass, "{scene:?}");
            assert_eq!(card_key(&scene, &plain(Key::Enter)), Pass, "{scene:?}");
        }
    }

    #[test]
    fn keys_behind_an_overlay_reach_nothing_behind() {
        assert_eq!(card_key(&FocusScene::Overlay, &jump()), Swallow);
        assert_eq!(card_key(&FocusScene::Overlay, &plain(Key::Digit(1))), Pass);
        assert_eq!(card_key(&FocusScene::Overlay, &plain(Key::Enter)), Pass);
        assert_eq!(card_key(&FocusScene::Overlay, &plain(Key::Escape)), Pass);
    }

    #[test]
    fn the_overlay_cancels_on_escape_and_confirms_on_enter() {
        assert_eq!(overlay_key(&plain(Key::Escape)), OverlayKey::Cancel);
        assert_eq!(overlay_key(&plain(Key::Enter)), OverlayKey::Confirm);
        let shifted = with(Key::Enter, false, false, true, false);
        assert_eq!(overlay_key(&shifted), OverlayKey::Pass);
        let ctrl = with(Key::Escape, true, false, false, false);
        assert_eq!(overlay_key(&ctrl), OverlayKey::Pass);
        assert_eq!(overlay_key(&plain(Key::Space)), OverlayKey::Pass);
    }

    #[test]
    fn a_new_card_takes_the_keyboard_only_from_the_conversation() {
        assert!(card_may_take_focus(&FocusScene::Thread));
        let others = [
            FocusScene::Composer,
            FocusScene::FileEditor,
            FocusScene::CardText {
                kind: CardKind::Plan,
            },
            card(CardKind::Permission, 2),
            FocusScene::QuestionOption,
            FocusScene::NeedsYou,
            FocusScene::Nav,
            FocusScene::Overlay,
            FocusScene::Other,
        ];
        for scene in others {
            assert!(!card_may_take_focus(&scene), "{scene:?}");
        }
    }

    #[test]
    fn a_held_enter_is_swallowed_everywhere() {
        let scenes = [
            FocusScene::Composer,
            FocusScene::Thread,
            FocusScene::Other,
            FocusScene::Overlay,
            FocusScene::FileEditor,
            FocusScene::QuestionOption,
            card(CardKind::Permission, 3),
            FocusScene::CardText {
                kind: CardKind::Plan,
            },
            FocusScene::NeedsYou,
            FocusScene::Nav,
        ];
        for scene in scenes {
            assert_eq!(card_key(&scene, &held(Key::Enter)), Swallow, "{scene:?}");
        }
        let newline = CardKey {
            shift: true,
            ..held(Key::Enter)
        };
        assert_eq!(card_key(&FocusScene::Composer, &newline), Pass);
    }

    #[test]
    fn held_digits_space_and_escape_are_swallowed_where_they_would_answer() {
        let answering = [
            card(CardKind::Permission, 3),
            FocusScene::QuestionOption,
            FocusScene::NeedsYou,
            FocusScene::Nav,
        ];
        for scene in answering {
            for key in [Key::Digit(1), Key::Space, Key::Escape] {
                assert_eq!(card_key(&scene, &held(key)), Swallow, "{scene:?} {key:?}");
            }
        }
        let typing = [
            FocusScene::Composer,
            FocusScene::CardText {
                kind: CardKind::Permission,
            },
        ];
        for scene in typing {
            for key in [Key::Digit(1), Key::Space] {
                assert_eq!(card_key(&scene, &held(key)), Pass, "{scene:?} {key:?}");
            }
        }
        let text = FocusScene::CardText {
            kind: CardKind::Permission,
        };
        assert_eq!(card_key(&text, &held(Key::Escape)), Swallow);
        for scene in [FocusScene::Thread, FocusScene::Other, FocusScene::Overlay] {
            assert_eq!(card_key(&scene, &held(Key::Space)), Swallow, "{scene:?}");
        }
        assert_eq!(card_key(&FocusScene::FileEditor, &held(Key::Space)), Pass);
    }

    #[test]
    fn after_nav_enter_a_held_enter_neither_sends_nor_restarts() {
        // The first Enter moves focus; the repeats after it find the new part and stop there,
        // while a fresh Enter on the same part still acts.
        for scene in [FocusScene::Composer, FocusScene::Other] {
            assert_eq!(card_key(&scene, &held(Key::Enter)), Swallow, "{scene:?}");
            assert_eq!(card_key(&scene, &plain(Key::Enter)), Pass, "{scene:?}");
        }
    }

    #[test]
    fn enter_on_the_list_opens_and_escape_leaves_it() {
        for scene in [FocusScene::NeedsYou, FocusScene::Nav] {
            assert_eq!(card_key(&scene, &plain(Key::Enter)), NavEnter, "{scene:?}");
            assert_eq!(
                card_key(&scene, &plain(Key::Escape)),
                LeaveList,
                "{scene:?}"
            );
            let ctrl = with(Key::Enter, true, false, false, false);
            assert_eq!(card_key(&scene, &ctrl), Pass, "{scene:?}");
        }
        assert_eq!(card_key(&FocusScene::Nav, &plain(Key::Space)), Swallow);
        assert_eq!(card_key(&FocusScene::Nav, &plain(Key::Digit(2))), Swallow);
        assert_eq!(card_key(&FocusScene::Nav, &plain(Key::Other)), Pass);
    }

    #[test]
    fn a_key_coming_again_without_its_release_is_held() {
        let mut repeats = Repeats::default();
        assert!(!repeats.pressed("1"));
        assert!(repeats.pressed("1"));
        repeats.released("1");
        assert!(!repeats.pressed("1"));
        repeats.released("2");
        assert!(repeats.pressed("1"));
        repeats.clear();
        assert!(!repeats.pressed("1"));
    }

    #[test]
    fn choices_follow_the_buttons() {
        let offered = SuggestionRecord {
            id: "s".to_owned(),
            kind: "addRules".to_owned(),
            ..SuggestionRecord::default()
        };
        let with_keep = permission_card(vec![offered]);
        assert_eq!(card_choices(&with_keep), 3);
        assert_eq!(card_kind(&with_keep), CardKind::Permission);
        assert_eq!(card_choices(&permission_card(Vec::new())), 2);
        let plan = ThreadCard::Plan(PlanCard {
            request_id: "r".to_owned(),
            plan: None,
            answered: None,
            failure: None,
            go: PlanGo::Auto,
        });
        assert_eq!((card_kind(&plan), card_choices(&plan)), (CardKind::Plan, 3));
        let question = ThreadCard::Question(QuestionCard {
            request_id: "r".to_owned(),
            questions: Vec::new(),
            answered: None,
            failure: None,
        });
        assert_eq!(
            (card_kind(&question), card_choices(&question)),
            (CardKind::Question, 0)
        );
    }
}
