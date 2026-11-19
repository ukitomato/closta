//! The state of the window, without GPUI: what the shell shows and how its rows change. The
//! platform wraps it and draws what it holds.

pub mod closing;
pub mod composer;
pub mod copy;
pub mod header;
pub mod new_session;
pub mod panes;
pub mod rows;
pub mod slot;
pub mod state;
pub mod watch;
