//! The keys that reach beyond a card: to the left list, to a new session or the resume popup, and
//! along the list. Only a key `card_key` passed is asked here.

use crate::card_keys::{CardKey, FocusScene, Key};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HubKeyOutcome {
    /// Move the list's focus to its cursor.
    ToList,
    /// Open the new-session dialog on the folder of the project at hand.
    NewSessionHere,
    /// Open the resume popup on the project at hand.
    OpenResume,
    /// Move the list's cursor by this many rows.
    Move(i32),
    Left,
    Right,
    Pass,
}

/// What a key does beyond the cards in `scene`. Inside a card, a card's text field and a
/// question's option the key is left alone, as it is behind an overlay.
pub fn hub_key(scene: &FocusScene, key: &CardKey) -> HubKeyOutcome {
    use HubKeyOutcome::{Left, Move, NewSessionHere, OpenResume, Pass, Right, ToList};

    let in_card = matches!(
        scene,
        FocusScene::Card { .. } | FocusScene::CardText { .. } | FocusScene::QuestionOption
    );
    let on_list = matches!(scene, FocusScene::NeedsYou | FocusScene::Nav);
    let only =
        |ctrl: bool, alt: bool| key.ctrl == ctrl && key.alt == alt && !key.shift && !key.platform;
    let ctrl_shift = key.ctrl && key.shift && !key.alt && !key.platform;
    let open_scene = !in_card && *scene != FocusScene::Overlay;
    match key.key {
        Key::N if only(true, false) && open_scene => NewSessionHere,
        Key::O if ctrl_shift && open_scene => OpenResume,
        Key::Digit(1) if only(false, true) => {
            if in_card || matches!(scene, FocusScene::FileEditor | FocusScene::Overlay) {
                Pass
            } else {
                ToList
            }
        }
        Key::Up if on_list && only(false, false) => Move(-1),
        Key::Down if on_list && only(false, false) => Move(1),
        Key::Left if on_list && only(false, false) => Left,
        Key::Right if on_list && only(false, false) => Right,
        _ => Pass,
    }
}

#[cfg(test)]
mod tests {
    use super::HubKeyOutcome::{Left, Move, NewSessionHere, OpenResume, Pass, Right, ToList};
    use super::*;
    use crate::card_keys::{CardKey, CardKind, FocusScene, Key};

    fn with(key: Key, ctrl: bool, alt: bool, shift: bool) -> CardKey {
        CardKey {
            ctrl,
            alt,
            shift,
            ..CardKey::plain(key)
        }
    }

    fn card() -> FocusScene {
        FocusScene::Card {
            kind: CardKind::Permission,
            choices: 3,
        }
    }

    fn inside() -> [FocusScene; 3] {
        [
            card(),
            FocusScene::CardText {
                kind: CardKind::Plan,
            },
            FocusScene::QuestionOption,
        ]
    }

    #[test]
    fn alt_one_goes_to_the_list_from_where_it_may() {
        let alt_one = with(Key::Digit(1), false, true, false);
        for scene in [
            FocusScene::Composer,
            FocusScene::Thread,
            FocusScene::NeedsYou,
            FocusScene::Nav,
            FocusScene::Other,
        ] {
            assert_eq!(hub_key(&scene, &alt_one), ToList, "{scene:?}");
        }
        let mut refused = inside().to_vec();
        refused.extend([FocusScene::FileEditor, FocusScene::Overlay]);
        for scene in refused {
            assert_eq!(hub_key(&scene, &alt_one), Pass, "{scene:?}");
        }
        let two = with(Key::Digit(2), false, true, false);
        assert_eq!(hub_key(&FocusScene::Composer, &two), Pass);
        let more = with(Key::Digit(1), false, true, true);
        assert_eq!(hub_key(&FocusScene::Composer, &more), Pass);
    }

    #[test]
    fn ctrl_n_asks_for_a_new_session_outside_cards_and_overlays() {
        let ctrl_n = with(Key::N, true, false, false);
        for scene in [
            FocusScene::Composer,
            FocusScene::FileEditor,
            FocusScene::Thread,
            FocusScene::NeedsYou,
            FocusScene::Nav,
            FocusScene::Other,
        ] {
            assert_eq!(hub_key(&scene, &ctrl_n), NewSessionHere, "{scene:?}");
        }
        let mut refused = inside().to_vec();
        refused.push(FocusScene::Overlay);
        for scene in refused {
            assert_eq!(hub_key(&scene, &ctrl_n), Pass, "{scene:?}");
        }
        let shifted = with(Key::N, true, false, true);
        assert_eq!(hub_key(&FocusScene::Composer, &shifted), Pass);
        assert_eq!(
            hub_key(&FocusScene::Composer, &CardKey::plain(Key::N)),
            Pass
        );
    }

    #[test]
    fn arrows_move_only_on_the_list() {
        for scene in [FocusScene::NeedsYou, FocusScene::Nav] {
            assert_eq!(hub_key(&scene, &CardKey::plain(Key::Up)), Move(-1));
            assert_eq!(hub_key(&scene, &CardKey::plain(Key::Down)), Move(1));
            assert_eq!(hub_key(&scene, &CardKey::plain(Key::Left)), Left);
            assert_eq!(hub_key(&scene, &CardKey::plain(Key::Right)), Right);
            assert_eq!(hub_key(&scene, &with(Key::Up, false, false, true)), Pass);
        }
        for scene in [FocusScene::Composer, FocusScene::Thread, FocusScene::Other] {
            assert_eq!(hub_key(&scene, &CardKey::plain(Key::Up)), Pass, "{scene:?}");
        }
        assert_eq!(
            hub_key(&FocusScene::Composer, &with(Key::Up, false, false, true)),
            Pass
        );
    }

    #[test]
    fn ctrl_shift_o_opens_the_resume_popup_outside_cards_and_overlays() {
        let key = with(Key::O, true, false, true);
        for scene in [
            FocusScene::Composer,
            FocusScene::FileEditor,
            FocusScene::Thread,
            FocusScene::NeedsYou,
            FocusScene::Nav,
            FocusScene::Other,
        ] {
            assert_eq!(hub_key(&scene, &key), OpenResume, "{scene:?}");
        }
        let mut refused = inside().to_vec();
        refused.push(FocusScene::Overlay);
        for scene in refused {
            assert_eq!(hub_key(&scene, &key), Pass, "{scene:?}");
        }
        for other in [
            with(Key::O, true, false, false),
            with(Key::O, false, false, true),
            with(Key::O, true, true, true),
            CardKey {
                platform: true,
                ..key
            },
            CardKey::plain(Key::O),
        ] {
            assert_eq!(hub_key(&FocusScene::Composer, &other), Pass, "{other:?}");
        }
    }
}
