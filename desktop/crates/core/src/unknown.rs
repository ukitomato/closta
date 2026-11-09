//! How many lines the reader could not place. Mirrors `UnknownEventTally.kt`.
//!
//! Two separate numbers: an unknown kind means the CLI started sending something new, a broken
//! line means the bytes were damaged. Only the first raw line of each sort is kept.

use closta_model::{AgentEvent, RawJson};
use std::collections::BTreeMap;

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct UnknownEventTally {
    pub unknown_by_wire_type: BTreeMap<String, i32>,
    pub broken_line_count: i32,
    pub first_unknown: Option<RawJson>,
    pub first_broken_line: Option<String>,
}

impl UnknownEventTally {
    /// Lines whose `type` matched no declared kind.
    pub fn unknown_count(&self) -> i32 {
        self.unknown_by_wire_type.values().sum()
    }

    /// Every line that could not be placed, of either sort.
    pub fn total_count(&self) -> i32 {
        self.unknown_count() + self.broken_line_count
    }

    /// True when every line was placed.
    pub fn is_clean(&self) -> bool {
        self.total_count() == 0
    }

    /// Folds one event in. Known events leave the tally untouched.
    pub fn accept(mut self, event: &AgentEvent) -> Self {
        match event {
            AgentEvent::UnknownKind { wire_type, raw } => {
                *self
                    .unknown_by_wire_type
                    .entry(wire_type.clone())
                    .or_default() += 1;
                if self.first_unknown.is_none() {
                    self.first_unknown = Some(raw.clone());
                }
            }
            AgentEvent::BrokenLine { line, .. } => {
                self.broken_line_count += 1;
                if self.first_broken_line.is_none() {
                    self.first_broken_line = Some(line.clone());
                }
            }
            _ => {}
        }
        self
    }

    /// Counts a whole stream.
    pub fn of<'a>(events: impl IntoIterator<Item = &'a AgentEvent>) -> Self {
        events.into_iter().fold(Self::default(), Self::accept)
    }
}
