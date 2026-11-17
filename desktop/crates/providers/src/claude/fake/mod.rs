//! Test doubles for the crates that drive a `claude` session in their tests. Mirrors the Kotlin
//! test fixtures (FakeAgentProcess.kt). Built only with the `fake` feature.

#![allow(clippy::unwrap_used, clippy::expect_used)]

pub mod process;
pub mod spawner;
