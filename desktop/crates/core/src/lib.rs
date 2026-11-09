mod fold;
mod unknown;

pub use fold::fold;
pub use unknown::UnknownEventTally;

use closta_model::AppInfo;

pub trait AppInfoSource {
    fn app_info(&self) -> AppInfo;
}

pub fn describe_app(source: &dyn AppInfoSource) -> AppInfo {
    source.app_info()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed;

    impl AppInfoSource for Fixed {
        fn app_info(&self) -> AppInfo {
            AppInfo {
                name: "Fixed".into(),
                version: "9.9.9".into(),
            }
        }
    }

    #[test]
    fn describe_app_returns_what_the_source_reports() {
        assert_eq!(
            describe_app(&Fixed),
            AppInfo {
                name: "Fixed".into(),
                version: "9.9.9".into()
            }
        );
    }
}
