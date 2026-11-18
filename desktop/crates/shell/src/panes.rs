//! The side panes of the window: whether each is open, and how wide.

use std::ops::RangeInclusive;

/// The widths the left pane (the sessions) may take.
pub const LEFT_WIDTH: RangeInclusive<f32> = 200.0..=420.0;
/// The widths the right pane may take.
pub const RIGHT_WIDTH: RangeInclusive<f32> = 240.0..=480.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Pane {
    Left,
    Right,
}

#[derive(Clone, PartialEq, Debug)]
pub struct Panes {
    pub left_open: bool,
    pub right_open: bool,
    pub left_width: f32,
    pub right_width: f32,
}

impl Default for Panes {
    /// The left pane open at 260, the right one closed at 300.
    fn default() -> Panes {
        Panes {
            left_open: true,
            right_open: false,
            left_width: 260.0,
            right_width: 300.0,
        }
    }
}

impl Panes {
    pub fn toggle(&mut self, pane: Pane) {
        let open = match pane {
            Pane::Left => &mut self.left_open,
            Pane::Right => &mut self.right_open,
        };
        *open = !*open;
    }

    /// Sets the pane's width within its range and returns the width it took. A width that is
    /// no number leaves it as it was.
    pub fn resize(&mut self, pane: Pane, width: f32) -> f32 {
        let (current, range) = match pane {
            Pane::Left => (&mut self.left_width, LEFT_WIDTH),
            Pane::Right => (&mut self.right_width, RIGHT_WIDTH),
        };
        if !width.is_nan() {
            *current = width.clamp(*range.start(), *range.end());
        }
        *current
    }
}
