//! The life of one session: checking the version, launching `claude`, folding what it says,
//! ending, closing and restarting into the sandbox. Ported from the Kotlin
//! `platforms/intellij/session` package.

pub mod clock;
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "the session runtime that uses it is not written yet"
    )
)]
mod live;
pub mod log;
pub mod status;

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
