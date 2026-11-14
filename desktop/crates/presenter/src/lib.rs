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
