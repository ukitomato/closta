//! The line at the top of the window: the app's name and version.

use closta_model::AppInfo;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppHeader {
    pub title: String,
    pub headline: String,
}

pub fn app_header(info: &AppInfo) -> AppHeader {
    AppHeader {
        title: info.name.clone(),
        headline: format!("{} {}", info.name, info.version),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_header_puts_name_and_version_in_headline() {
        let info = AppInfo {
            name: "Closta".into(),
            version: "0.1.0".into(),
        };
        assert_eq!(
            app_header(&info),
            AppHeader {
                title: "Closta".into(),
                headline: "Closta 0.1.0".into()
            }
        );
    }
}
