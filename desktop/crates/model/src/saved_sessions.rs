//! A saved session as the list shows it. Mirrors `SavedSessions.kt`'s `SavedSessionSummary`.

use std::fmt;

/// One saved session of the project, as the list shows it: the CLI's own id for it, a `title`
/// made from its first user sentence (the id when it has none), when it was last written
/// (`updated_at_ms`, epoch milliseconds) and how big its record is (`bytes`).
///
/// The title is the user's own words: it is shown, and never logged. `Debug` gives its length only.
#[derive(Clone, PartialEq, Eq)]
pub struct SavedSessionSummary {
    pub id: String,
    pub title: String,
    pub updated_at_ms: i64,
    pub bytes: i64,
}

impl fmt::Debug for SavedSessionSummary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SavedSessionSummary({}, {} chars, {} bytes)",
            self.id,
            self.title.chars().map(char::len_utf16).sum::<usize>(),
            self.bytes
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_gives_the_title_s_length_and_never_its_words() {
        let summary = SavedSessionSummary {
            id: "s1".into(),
            title: "my secret plan".into(),
            updated_at_ms: 1,
            bytes: 42,
        };

        let text = format!("{summary:?}");

        assert_eq!("SavedSessionSummary(s1, 14 chars, 42 bytes)", text);
        assert!(!text.contains("secret"));
    }
}
