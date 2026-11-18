//! Test support for the presenter: replays recorded captures through the providers' codec and the
//! presenter's fold, and projects the result to the tree the goldens hold. Nothing ships it.

/// The captures, `manifest.json` and the golden comparison, shared with `closta-providers`' tests.
#[path = "../../providers/tests/common/mod.rs"]
pub mod common;

pub mod gallery;
pub mod lines;
pub mod projector;
pub mod replay;
pub mod session;
pub mod synthetic;
pub mod tree_reading;
