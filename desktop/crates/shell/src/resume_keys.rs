//! The keys of the resume popup, whose search field has the keyboard.

use crate::card_keys::{CardKey, Key};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResumeKey {
    /// Open the picked row.
    Pick,
    Close,
    /// Move the pick by this many rows.
    Move(i32),
    /// Stop here and do nothing: the popup has nowhere else for the key to go.
    Stay,
    /// Hand it to the search field as it is.
    Pass,
}

/// What a key does in the popup. While the field composes text with an input method, every key
/// is the input method's, a held one too: Enter confirms, Esc cancels, the arrows pick a
/// candidate.
pub fn resume_key(composing: bool, key: &CardKey) -> ResumeKey {
    if composing {
        return ResumeKey::Pass;
    }
    let unmodified = !(key.ctrl || key.alt || key.shift || key.platform);
    match key.key {
        // A held Enter would open the next row once the first one is gone.
        Key::Enter if unmodified && key.held => ResumeKey::Stay,
        Key::Enter if unmodified => ResumeKey::Pick,
        Key::Escape if unmodified => ResumeKey::Close,
        Key::Up if unmodified => ResumeKey::Move(-1),
        Key::Down if unmodified => ResumeKey::Move(1),
        Key::Tab if !(key.ctrl || key.alt || key.platform) => ResumeKey::Stay,
        _ => ResumeKey::Pass,
    }
}

#[cfg(test)]
mod tests {
    use super::ResumeKey::{Close, Move, Pass, Pick, Stay};
    use super::*;

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

    fn held(key: Key) -> CardKey {
        CardKey {
            held: true,
            ..CardKey::plain(key)
        }
    }

    const POPUP_KEYS: [Key; 5] = [Key::Enter, Key::Escape, Key::Up, Key::Down, Key::Tab];

    #[test]
    fn while_composing_every_key_goes_to_the_field() {
        for key in POPUP_KEYS {
            assert_eq!(resume_key(true, &CardKey::plain(key)), Pass, "{key:?}");
        }
        assert_eq!(
            resume_key(true, &with(Key::Tab, false, false, true, false)),
            Pass
        );
    }

    #[test]
    fn the_keys_of_the_popup() {
        let plain = |key| resume_key(false, &CardKey::plain(key));
        assert_eq!(plain(Key::Enter), Pick);
        assert_eq!(plain(Key::Escape), Close);
        assert_eq!(plain(Key::Up), Move(-1));
        assert_eq!(plain(Key::Down), Move(1));
        assert_eq!(plain(Key::Tab), Stay);
        assert_eq!(
            resume_key(false, &with(Key::Tab, false, false, true, false)),
            Stay,
            "Shift+Tab"
        );
        for key in [Key::Other, Key::Space, Key::N, Key::Digit(1), Key::Left] {
            assert_eq!(plain(key), Pass, "{key:?}");
        }
        // A modifier makes the key the field's.
        for key in [Key::Enter, Key::Escape, Key::Up, Key::Down] {
            for (ctrl, alt, shift, platform) in [
                (true, false, false, false),
                (false, true, false, false),
                (false, false, true, false),
                (false, false, false, true),
            ] {
                let key = with(key, ctrl, alt, shift, platform);
                assert_eq!(resume_key(false, &key), Pass, "{key:?}");
            }
        }
        assert_eq!(
            resume_key(false, &with(Key::Tab, true, false, false, false)),
            Pass
        );
    }

    #[test]
    fn a_held_enter_picks_nothing() {
        assert_eq!(resume_key(false, &held(Key::Enter)), Stay);
        assert_eq!(resume_key(false, &held(Key::Down)), Move(1));
    }

    #[test]
    fn composing_is_seen_before_a_held_key() {
        assert_eq!(resume_key(true, &held(Key::Up)), Pass);
        assert_eq!(resume_key(true, &held(Key::Tab)), Pass);
        assert_eq!(resume_key(true, &held(Key::Enter)), Pass);
    }
}
