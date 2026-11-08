#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    closta_platform::run(closta_presenter::shell_state(&closta_core::describe_app(
        &closta_providers::BuildInfo,
    )));
}
