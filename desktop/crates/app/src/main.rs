#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    closta_platform::run(closta_shell::header::app_header(
        &closta_core::describe_app(&closta_providers::BuildInfo),
    ));
}
