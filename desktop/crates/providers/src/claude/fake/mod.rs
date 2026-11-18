//! Test doubles for the crates that drive a `claude` session in their tests, and the contract
//! every `AgentSession` meets. Mirrors the Kotlin test fixtures (FakeAgentProcess.kt,
//! FakeAgentSession.kt, AgentSessionContract.kt, FakeProcesses.kt). Built only with the `fake` feature.

#![allow(clippy::unwrap_used, clippy::expect_used)]

pub mod contract;
pub mod live;
pub mod process;
pub mod replay;
pub mod script;
pub mod session;
pub mod spawner;
