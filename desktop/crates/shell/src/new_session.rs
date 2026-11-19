//! The New Session dialog's state. Only the runtime kind is here so far.

/// Where a session's `claude` runs, decided by the folder.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Runtime {
    Windows,
    Wsl { distro: String },
}
