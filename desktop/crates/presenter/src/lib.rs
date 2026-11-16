pub mod cards;
pub mod composer_state;
pub mod edit_diff;
pub mod fold;
pub mod input;
pub mod json;
pub mod keyed;
pub mod mcp_rows;
pub mod records;
pub mod refusal_sentence;
pub mod rewind_refusal;
pub mod rewind_targets;
pub mod rows;
pub mod session;
pub mod text;
pub mod thread_running;
pub mod tool_line;
pub mod transcript;
pub mod visible;

use closta_model::AppInfo;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellState {
    pub title: String,
    pub headline: String,
}

pub fn shell_state(info: &AppInfo) -> ShellState {
    ShellState {
        title: info.name.clone(),
        headline: format!("{} {}", info.name, info.version),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_state_puts_name_and_version_in_headline() {
        let info = AppInfo {
            name: "Closta".into(),
            version: "0.1.0".into(),
        };
        assert_eq!(
            shell_state(&info),
            ShellState {
                title: "Closta".into(),
                headline: "Closta 0.1.0".into()
            }
        );
    }
}
