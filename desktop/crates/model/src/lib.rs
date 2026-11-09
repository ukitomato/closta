mod event;

pub use event::{AgentEvent, AgentEventKind, RawJson};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_equality_compares_name_and_version() {
        let base = AppInfo {
            name: "Closta".into(),
            version: "0.1.0".into(),
        };
        assert_eq!(base, base.clone());
        assert_ne!(
            base,
            AppInfo {
                name: "Other".into(),
                version: "0.1.0".into()
            }
        );
        assert_ne!(
            base,
            AppInfo {
                name: "Closta".into(),
                version: "0.2.0".into()
            }
        );
    }
}
