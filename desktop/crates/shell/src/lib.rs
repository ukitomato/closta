//! The state of the window, without GPUI: what the shell shows and how its rows change. The
//! platform wraps it and draws what it holds.

pub mod card_keys;
pub mod cards;
pub mod closing;
pub mod composer;
pub mod copy;
pub mod edit_patch;
pub mod elapsed;
pub mod header;
pub mod nav;
pub mod needs_you;
pub mod new_session;
pub mod panes;
pub mod projects;
pub mod rows;
pub mod settings;
pub mod slot;
pub mod state;
pub mod watch;
