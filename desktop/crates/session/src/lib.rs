//! The life of one session: checking the version, launching `claude`, folding what it says,
//! ending, closing and restarting into the sandbox. Ported from the Kotlin
//! `platforms/intellij/session` package.

pub mod clock;
pub mod commands;
pub mod history;
pub mod launch;
mod live;
pub mod log;
pub mod runtime;
pub mod sandbox;
pub mod status;
pub mod store;

/// The permission modes the CLI takes (the six capture `07` switched through, with
/// `bypassPermissions`). PermissionModes.kt.
pub const PERMISSION_MODES: [&str; 6] = [
    "default",
    "acceptEdits",
    "plan",
    "auto",
    "dontAsk",
    "bypassPermissions",
];
