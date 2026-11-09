mod claude;

use closta_core::AppInfoSource;
use closta_model::AppInfo;

pub struct BuildInfo;

impl AppInfoSource for BuildInfo {
    fn app_info(&self) -> AppInfo {
        AppInfo {
            name: "Closta".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_info_reports_closta_and_package_version() {
        let info = closta_core::describe_app(&BuildInfo);
        assert_eq!(
            info,
            AppInfo {
                name: "Closta".into(),
                version: "0.1.0".into()
            }
        );
    }
}
