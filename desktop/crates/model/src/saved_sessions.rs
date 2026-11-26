//! A saved session as the list shows it. Mirrors `SavedSessions.kt`'s `SavedSessionSummary`.

use std::fmt;

use crate::AgentEvent;

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

/// One saved conversation as the CLI wrote it: the `User` and `Assistant` events in the order the
/// CLI wrote them. `skipped` counts the lines that are not conversation (other kinds, broken
/// lines, sub-agent lines, the CLI's own notes). `dropped` counts the old lines left unread
/// because the record was too big (at least one when any were).
///
/// The events carry the user's own words: they are shown, and never logged. `Debug` gives counts
/// only.
#[derive(Clone, PartialEq)]
pub struct SavedTranscript {
    pub events: Vec<AgentEvent>,
    pub skipped: i32,
    pub dropped: i32,
}

impl fmt::Debug for SavedTranscript {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SavedTranscript({} events, {} skipped, {} dropped)",
            self.events.len(),
            self.skipped,
            self.dropped
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RawJson;

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

    #[test]
    fn debug_of_a_transcript_gives_counts_and_never_its_lines() {
        let transcript = SavedTranscript {
            events: vec![AgentEvent::User {
                uuid: "u1".into(),
                session_id: "s1".into(),
                timestamp: "2026-01-01T00:00:00Z".into(),
                message: RawJson("my secret plan".into()),
                parent_tool_use_id: None,
                tool_use_result: None,
                subagent_type: None,
                task_description: None,
            }],
            skipped: 22,
            dropped: 0,
        };

        let text = format!("{transcript:?}");

        assert_eq!("SavedTranscript(1 events, 22 skipped, 0 dropped)", text);
        assert!(!text.contains("secret"));
    }
}
