#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The replay of a capture through a fake process: its cue lines, the process that holds at a cue
//! until the host writes the matching stdin line, and the spawner that answers the version check
//! and one session.

use std::future::Future;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use closta_providers::claude::fake::replay::{
    REPLAY_KEY, ReplayControl, ReplayCue, ReplayError, ReplayLine, ReplayOptions, ReplaySpawner,
    VERSION_LINE, parse_replay, with_prompt,
};
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::version::check_version;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessFailure, ProcessSpawner};
use closta_providers::claude::protocol::encode;
use futures_lite::{StreamExt, future, stream};

const TIMEOUT: Duration = Duration::from_secs(30);
const NOT_YET: Duration = Duration::from_millis(200);

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

/// Whether `work` is still pending after a short while.
fn still_pending<T>(work: impl Future<Output = T>) -> bool {
    smol::block_on(future::race(
        async {
            work.await;
            false
        },
        async {
            smol::Timer::after(NOT_YET).await;
            true
        },
    ))
}

fn session_launch() -> Launch {
    Launch {
        args: vec![
            "--output-format".to_owned(),
            "stream-json".to_owned(),
            "--input-format".to_owned(),
            "stream-json".to_owned(),
        ],
        env: SecretEnv::default(),
        cwd: None,
    }
}

fn out(line: &str) -> ReplayLine {
    ReplayLine::Stdout(line.to_owned())
}

fn user(text: &str) -> ReplayCue {
    ReplayCue::User {
        text: text.to_owned(),
    }
}

fn answer(request_id: &str, allow: bool) -> ReplayCue {
    ReplayCue::Answer {
        request_id: request_id.to_owned(),
        allow,
    }
}

fn user_line(text: &str) -> String {
    encode::user_message("session", "message", text, &[]).unwrap()
}

/// A started replay: its process with the stderr drain running on smol's executor, as the
/// session's pump runs it, and its stdout.
struct Started {
    process: Box<dyn AgentProcess>,
    stdout: stream::Boxed<Result<String, ProcessFailure>>,
    _drain: smol::Task<()>,
}

fn start(lines: Vec<ReplayLine>, options: ReplayOptions) -> (Started, ReplayControl) {
    let (spawner, control) = ReplaySpawner::new(lines, options);
    let mut process = spawner.spawn(&session_launch()).unwrap();
    let stdout = process.take_stdout_lines().unwrap();
    let drain = smol::spawn(process.take_stderr_drain().unwrap());
    (
        Started {
            process,
            stdout,
            _drain: drain,
        },
        control,
    )
}

fn next_line(started: &mut Started) -> String {
    within(started.stdout.next()).unwrap().unwrap()
}

fn write(started: &Started, line: String) {
    within(started.process.write_stdin(line)).unwrap();
}

fn unique_log_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "closta-replay-{name}-{}-{}.ndjson",
        std::process::id(),
        uuid_like()
    ))
}

fn uuid_like() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
}

#[test]
fn stdout_lines_come_in_order_and_the_process_stays_alive() {
    let (mut started, control) = start(
        vec![out("one"), out("two"), out("three")],
        ReplayOptions::default(),
    );
    assert_eq!("one", next_line(&mut started));
    assert_eq!("two", next_line(&mut started));
    assert_eq!("three", next_line(&mut started));
    within(control.finished());
    assert!(
        still_pending(started.process.wait()),
        "the process stays alive after the last line"
    );
    assert!(
        still_pending(started.stdout.next()),
        "stdout stays open after the last line"
    );
}

#[test]
fn a_user_cue_waits_for_the_users_line_on_stdin() {
    let (mut started, control) = start(
        vec![ReplayLine::Cue(user("Fix the login")), out("after")],
        ReplayOptions::default(),
    );
    let cues = control.cues();
    assert_eq!(user("Fix the login"), within(cues.recv()).unwrap());

    write(&started, encode::get_settings("settings_1"));
    assert!(
        still_pending(started.stdout.next()),
        "a control request is not the user's line"
    );
    assert!(
        still_pending(control.finished()),
        "the replay is held at the cue"
    );

    write(&started, user_line("Fix the login"));
    assert_eq!("after", next_line(&mut started));
    within(control.finished());
}

#[test]
fn an_answer_cue_waits_for_the_control_response_of_its_request() {
    let (mut started, control) = start(
        vec![
            out("request"),
            ReplayLine::Cue(answer("req_7", true)),
            out("after"),
        ],
        ReplayOptions::default(),
    );
    assert_eq!("request", next_line(&mut started));
    assert_eq!(
        answer("req_7", true),
        within(control.cues().recv()).unwrap()
    );

    write(&started, encode::deny("req_other", "no"));
    assert!(
        still_pending(started.stdout.next()),
        "the answer to another request does not count"
    );

    write(&started, encode::allow("req_7", "{}", None).unwrap());
    assert_eq!("after", next_line(&mut started));
}

#[test]
fn stop_at_emits_through_that_line_and_no_further() {
    let (mut started, control) = start(
        vec![
            out("one"),
            ReplayLine::Cue(user("go on")),
            out("two"),
            out("three"),
        ],
        ReplayOptions {
            stop_at: Some(2),
            ..ReplayOptions::default()
        },
    );
    assert_eq!("one", next_line(&mut started));
    assert_eq!(user("go on"), within(control.cues().recv()).unwrap());
    write(&started, user_line("go on"));
    assert_eq!("two", next_line(&mut started), "the cue is not counted");
    within(control.finished());
    assert!(
        still_pending(started.stdout.next()),
        "nothing after the line it stops at"
    );
    assert!(
        still_pending(started.process.wait()),
        "the process stays alive after it stopped"
    );
}

#[test]
fn pace_waits_between_lines() {
    let begun = Instant::now();
    let (mut started, control) = start(
        vec![out("one"), out("two"), out("three")],
        ReplayOptions {
            pace: Duration::from_millis(50),
            ..ReplayOptions::default()
        },
    );
    for _ in 0..3 {
        next_line(&mut started);
    }
    within(control.finished());
    let took = begun.elapsed();
    assert!(
        took >= Duration::from_millis(100),
        "three lines at 50 ms took {took:?}"
    );
}

#[test]
fn stdin_goes_to_the_log_file_as_it_is_written() {
    let path = unique_log_path("stdin");
    let (started, control) = start(
        vec![out("one")],
        ReplayOptions {
            stdin_log: Some(path.clone()),
            ..ReplayOptions::default()
        },
    );
    let settings = encode::get_settings("settings_1");
    write(&started, settings.clone());
    assert_eq!(
        format!("{settings}\n"),
        std::fs::read_to_string(&path).unwrap()
    );

    let prompt = user_line("hello");
    write(&started, prompt.clone());
    assert_eq!(
        format!("{settings}\n{prompt}\n"),
        std::fs::read_to_string(&path).unwrap()
    );
    assert_eq!(vec![settings, prompt], control.stdin_lines());
    drop(started);
    std::fs::remove_file(&path).unwrap();
}

#[test]
fn the_spawner_answers_the_version_check_then_one_session() {
    let (spawner, _control) = ReplaySpawner::new(vec![out("one")], ReplayOptions::default());
    let version = session_launch().version_check();
    assert_eq!(
        Ok(VERSION_LINE.split(' ').next().unwrap().to_owned()),
        within(check_version(async { spawner.spawn(&version) }))
    );

    assert!(spawner.spawn(&session_launch()).is_ok());
    assert_eq!(
        LaunchError::Spawn(ErrorKind::Unsupported),
        spawner.spawn(&session_launch()).err().unwrap()
    );
}

#[test]
fn a_bad_cue_names_its_line_and_nothing_of_its_content() {
    let text = [
        r#"{"type":"system","subtype":"init"}"#,
        "",
        r#"{"closta_replay":"nope","text":"secret words"}"#,
    ]
    .join("\n");
    let failure = parse_replay(&text).unwrap_err();
    assert_eq!(ReplayError::BadCue { line: 3 }, failure);
    let shown = failure.to_string();
    assert!(shown.contains('3'), "{shown}");
    assert!(!shown.contains("nope"), "{shown}");
    assert!(!shown.contains("secret"), "{shown}");

    let missing_text = format!(r#"{{"{REPLAY_KEY}":"user"}}"#);
    assert_eq!(
        Err(ReplayError::BadCue { line: 1 }),
        parse_replay(&missing_text)
    );
}

#[test]
fn parse_replay_keeps_other_lines_as_stdout_and_drops_blank_ones() {
    let text = [
        r#"{"type":"system","subtype":"init"}"#,
        "",
        r#"{"closta_replay":"user","text":"Fix it"}"#,
        "not json at all",
        r#"{"type":"user","note":"closta_replay"}"#,
    ]
    .join("\n");
    assert_eq!(
        Ok(vec![
            out(r#"{"type":"system","subtype":"init"}"#),
            ReplayLine::Cue(user("Fix it")),
            out("not json at all"),
            out(r#"{"type":"user","note":"closta_replay"}"#),
        ]),
        parse_replay(&text)
    );
}

#[test]
fn with_prompt_puts_a_user_cue_first() {
    assert_eq!(
        vec![ReplayLine::Cue(user("Start")), out("one")],
        with_prompt(vec![out("one")], "Start")
    );
}

#[test]
fn a_cue_round_trips_through_its_line() {
    for cue in [
        user("Retry up to 3 times when \"login\" fails"),
        answer("req_1", true),
        answer("req_2", false),
    ] {
        assert_eq!(
            Ok(vec![ReplayLine::Cue(cue.clone())]),
            parse_replay(&cue.to_line())
        );
    }
}

#[test]
fn a_cue_is_answered_only_by_its_stdin_line() {
    assert!(user("hi").answered_by(&user_line("hi")));
    assert!(!user("hi").answered_by(&encode::get_settings("s")));
    assert!(answer("q", false).answered_by(&encode::deny("q", "no")));
    assert!(!answer("q", false).answered_by(&encode::deny("p", "no")));
    assert!(!answer("q", false).answered_by("not json"));
}
