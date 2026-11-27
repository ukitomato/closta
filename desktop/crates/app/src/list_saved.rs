//! `--list-saved <folder>`: finds where the CLI keeps the records of the project in `folder`,
//! lists them, and writes what it found to the ready file without opening a window. The file
//! holds counts only, never a title or a path.

use std::path::Path;
#[cfg(any(not(feature = "replay"), test))]
use std::path::PathBuf;
use std::process::ExitCode;

use closta_core::ports::SavedSessionsError;
use closta_platform::write_whole;
use closta_providers::claude::history::Survey;

use crate::saved::{record_homes, saved_sessions_for};

/// What a release build says of any argument it does not take.
#[cfg(any(not(feature = "replay"), test))]
const RELEASE_TAKES: &str = "this build takes only --list-saved and --ready-file";

/// The arguments a release build takes: none, which opens the window, or `--list-saved <folder>`
/// and an optional `--ready-file <path>`, which list without one. Anything else is an error.
#[cfg(any(not(feature = "replay"), test))]
pub fn parse_release(
    args: impl IntoIterator<Item = String>,
) -> Result<Option<(String, Option<PathBuf>)>, String> {
    let mut folder = None;
    let mut ready_file = None;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let slot = match arg.as_str() {
            "--list-saved" if folder.is_none() => &mut folder,
            "--ready-file" if ready_file.is_none() => &mut ready_file,
            _ => return Err(RELEASE_TAKES.to_owned()),
        };
        *slot = Some(args.next().ok_or_else(|| RELEASE_TAKES.to_owned())?);
    }
    match (folder, ready_file) {
        (None, None) => Ok(None),
        (Some(folder), ready_file) => Ok(Some((folder, ready_file.map(PathBuf::from)))),
        (None, Some(_)) => Err(RELEASE_TAKES.to_owned()),
    }
}

/// The check file's lines: whether the place was found, was missing or could not be read, how
/// many sessions were listed, and how many records could not be read.
pub fn lines(survey: &Result<Survey, SavedSessionsError>) -> Vec<String> {
    let (place, listed, unreadable) = match survey {
        Ok(survey) if survey.place_found => ("found", survey.sessions.len(), survey.unreadable),
        Ok(survey) => ("missing", survey.sessions.len(), survey.unreadable),
        Err(_) => ("error", 0, 0),
    };
    vec![
        format!("place={place}"),
        format!("listed={listed}"),
        format!("unreadable={unreadable}"),
    ]
}

/// Lists the saved sessions of `folder` and writes the check file to `ready_file` when one is
/// given. Ends with 0 when the place was found, else 1; of a list that fails only the kind is
/// logged. A check file that cannot be written also ends with 1.
pub fn run(folder: &str, ready_file: Option<&Path>) -> ExitCode {
    let sessions = saved_sessions_for(folder, &record_homes());
    let survey = sessions.survey(&|| false);
    if let Err(error) = &survey {
        tracing::warn!("the saved sessions could not be listed ({error:?})");
    }
    if let Some(path) = ready_file
        && let Err(error) = write_whole(path, &lines(&survey))
    {
        tracing::warn!("the check file could not be written ({:?})", error.kind());
        return ExitCode::FAILURE;
    }
    if matches!(
        survey,
        Ok(Survey {
            place_found: true,
            ..
        })
    ) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

#[cfg(test)]
mod tests {
    use closta_model::SavedSessionSummary;

    use super::*;

    #[test]
    fn the_check_file_holds_counts_and_nothing_else() {
        let survey = Survey {
            place_found: true,
            sessions: vec![SavedSessionSummary {
                id: "0b0c0d0e-0000-4000-8000-000000000001".to_owned(),
                title: "a secret title".to_owned(),
                updated_at_ms: 1_000,
                bytes: 10,
            }],
            unreadable: 2,
        };

        let lines = lines(&Ok(survey));

        assert_eq!(lines, ["place=found", "listed=1", "unreadable=2"]);
        assert!(lines.iter().all(|line| !line.contains("secret")));
    }

    #[test]
    fn a_missing_place_is_said() {
        let survey = Survey {
            place_found: false,
            sessions: Vec::new(),
            unreadable: 0,
        };

        assert_eq!(
            lines(&Ok(survey)),
            ["place=missing", "listed=0", "unreadable=0"]
        );
    }

    #[test]
    fn a_place_that_could_not_be_read_is_an_error() {
        let survey = Err(SavedSessionsError::Unreadable(
            std::io::ErrorKind::PermissionDenied,
        ));

        assert_eq!(lines(&survey), ["place=error", "listed=0", "unreadable=0"]);
    }

    #[test]
    fn release_takes_only_the_list_and_its_file() {
        let parse = |args: &[&str]| parse_release(args.iter().map(|arg| (*arg).to_owned()));

        assert_eq!(parse(&[]), Ok(None));
        assert_eq!(
            parse(&["--list-saved", r"C:\x", "--ready-file", "r"]),
            Ok(Some((r"C:\x".to_owned(), Some(PathBuf::from("r")))))
        );
        assert_eq!(
            parse(&["--list-saved", r"C:\x"]),
            Ok(Some((r"C:\x".to_owned(), None)))
        );
        for wrong in [
            &["--replay", "a"][..],
            &["--list-saved"][..],
            &["--list-saved", r"C:\x", "--ready-file"][..],
            &["--ready-file", "r"][..],
            &["--list-saved", "a", "--list-saved", "b"][..],
        ] {
            assert_eq!(parse(wrong), Err(RELEASE_TAKES.to_owned()));
        }
    }

    #[test]
    fn the_file_is_written_whole() {
        let dir = std::env::temp_dir().join(format!("closta-list-saved-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("listed");
        let lines = ["place=found", "listed=3", "unreadable=0"].map(str::to_owned);
        std::fs::write(&path, "an earlier file\n").unwrap();

        write_whole(&path, &lines).unwrap();

        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "place=found\nlisted=3\nunreadable=0\n"
        );
        assert!(!dir.join("listed.tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
