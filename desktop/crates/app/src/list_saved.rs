//! `--list-saved <folder>`: finds where the CLI keeps the records of the project in `folder`,
//! lists them, and writes what it found to the ready file without opening a window. The file
//! holds counts only, never a title or a path.

use std::collections::BTreeSet;
use std::path::Path;
use std::process::ExitCode;
use std::sync::Arc;

use closta_platform::write_whole;
use closta_providers::claude::history::{ProjectTranscripts, StdRecordFs, Survey};
use closta_providers::claude::launch::wsl::{WslLocation, WslProgram, WslSpawner};
use closta_providers::claude::process::ProcessSpawner;
use closta_session::history::place::{
    ProbeSpawnerFor, RecordHomes, native_config_dir, record_source, wsl_record_home,
};
use closta_session::log::{SessionLog, TracingLog};

/// Where the CLI keeps its records in each WSL distribution, asked of the distribution's `sh`.
pub fn record_homes() -> Arc<RecordHomes> {
    let spawner_for: ProbeSpawnerFor = Arc::new(
        |location: &WslLocation, program: WslProgram| -> Arc<dyn ProcessSpawner> {
            Arc::new(WslSpawner::new(location.clone(), program, BTreeSet::new()))
        },
    );
    Arc::new(RecordHomes::new(Arc::new(move |location: &WslLocation| {
        wsl_record_home(location, &spawner_for, &TracingLog)
    })))
}

/// The saved sessions of the project in `folder`, read from this machine's config directory or,
/// for a folder in a WSL distribution, from the place `homes` finds there.
pub fn saved_sessions_for(folder: &str, homes: &Arc<RecordHomes>) -> ProjectTranscripts {
    let homes = Arc::clone(homes);
    let source = record_source(
        Some(folder),
        cfg!(windows),
        native_config_dir(&|name| std::env::var(name).ok()),
        Arc::new(move |location: &WslLocation| homes.home(location)),
    );
    ProjectTranscripts::new(
        Arc::new(StdRecordFs),
        source.config_dir,
        source.working_directory,
        source.resolve_links,
        Arc::new(|line: &str| TracingLog.info(line)),
    )
}

/// The check file's lines: whether the place was found, how many sessions were listed, and how
/// many records could not be read.
pub fn lines(survey: &Survey) -> Vec<String> {
    let place = if survey.place_found {
        "found"
    } else {
        "missing"
    };
    vec![
        format!("place={place}"),
        format!("listed={}", survey.sessions.len()),
        format!("unreadable={}", survey.unreadable),
    ]
}

/// Lists the saved sessions of `folder` and writes the check file to `ready_file` when one is
/// given. Ends with 0 when the place was found, else 1; a list that fails is a missing place, and
/// only its kind is logged. A check file that cannot be written also ends with 1.
pub fn run(folder: &str, ready_file: Option<&Path>) -> ExitCode {
    let sessions = saved_sessions_for(folder, &record_homes());
    let survey = sessions.survey(&|| false).unwrap_or_else(|error| {
        tracing::warn!("the saved sessions could not be listed ({error:?})");
        Survey {
            place_found: false,
            sessions: Vec::new(),
            unreadable: 0,
        }
    });
    if let Some(path) = ready_file
        && let Err(error) = write_whole(path, &lines(&survey))
    {
        tracing::warn!("the check file could not be written ({:?})", error.kind());
        return ExitCode::FAILURE;
    }
    if survey.place_found {
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

        let lines = lines(&survey);

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
            lines(&survey),
            ["place=missing", "listed=0", "unreadable=0"]
        );
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

    #[test]
    fn saved_sessions_for_shows_nothing_of_the_folder() {
        let homes = Arc::new(RecordHomes::new(Arc::new(|_| None)));

        let sessions = saved_sessions_for(r"\\wsl.localhost\Ubuntu\home\me\p", &homes);

        assert_eq!(format!("{sessions:?}"), "ProjectTranscripts");
    }
}
