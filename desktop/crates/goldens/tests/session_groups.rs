//! How the sessions list groups a session, which notifications a change of its view raises or
//! takes back, and a session's name (SessionGroupsTest.kt, SessionTitleTest).

use std::sync::Arc;

use closta_goldens::replay::replay;
use closta_model::ConversationState;
use closta_presenter::fold::fold_transcript;
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::sessions::groups::{
    AlertChange, AlertKind, FinishedAlert, OpenOnlyAlert, PermissionAlert, SessionAlert,
    SessionGroup, SessionSummary, TITLE_MAX, WaitReason, alerts_between, session_summary,
    session_title, waiting_alerts,
};
use closta_presenter::text::take_utf16;
use closta_presenter::thread_running::thread_is_running;
use closta_presenter::transcript::{ApprovalRecord, Transcript};
use serde_json::{Value, json};

type View = (ConversationState, Arc<Transcript>);

const COMMAND: &str = "./gradlew :auth:test --tests 'dev.example.auth.SignInTest' --info --stacktrace --no-daemon --rerun";

fn views(scenario: &str) -> Vec<View> {
    replay(scenario)
        .into_iter()
        .map(|step| (step.view.conversation, step.view.transcript))
        .collect()
}

fn pending(view: &View) -> bool {
    view.0
        .pending_approvals
        .iter()
        .any(|it| !it.request_id.is_empty())
}

/// The first view where an approval waits, and the one before it.
fn first_wait(scenario: &str) -> (View, View) {
    let all = views(scenario);
    let at = all
        .iter()
        .position(pending)
        .unwrap_or_else(|| panic!("{scenario}: nothing waits"));
    (all[at - 1].clone(), all[at].clone())
}

/// Every approval of `view` as a request of `tool`, with `input` when given.
fn as_tool(view: &View, tool: &str, input: Option<Value>) -> View {
    let transcript = &view.1;
    let approvals =
        transcript
            .approvals
            .values()
            .fold(transcript.approvals.clone(), |approvals, record| {
                let changed = ApprovalRecord {
                    tool_name: Some(tool.to_owned()),
                    input: input.clone().map(Arc::new).or_else(|| record.input.clone()),
                    ..ApprovalRecord::clone(record)
                };
                approvals.put(record.request_id.clone(), Arc::new(changed))
            });
    (
        view.0.clone(),
        Arc::new(Transcript {
            approvals,
            ..Transcript::clone(transcript)
        }),
    )
}

/// No capture asks for Bash (the recorder runs it without asking): 05's request, with a command
/// for its input.
fn as_bash(view: &View, command: &str) -> View {
    as_tool(view, "Bash", Some(json!({ "command": command })))
}

fn summary(view: &View, unread: bool) -> SessionSummary {
    session_summary(&view.0, &view.1, unread)
}

fn alerts(before: Option<&View>, after: &View) -> AlertChange {
    alerts_between(
        before.map(|(conversation, transcript)| (conversation, &**transcript)),
        (&after.0, &after.1),
    )
}

fn single_request(view: &View) -> String {
    assert_eq!(1, view.0.pending_approvals.len());
    view.0.pending_approvals[0].request_id.clone()
}

fn running(view: &View) -> bool {
    thread_is_running(&view.0, &view.1)
}

#[test]
fn waiting_comes_first() {
    let (_, bash) = first_wait("05-permission-can-use-tool");
    let waiting = summary(&as_bash(&bash, COMMAND), true);
    assert_eq!(SessionGroup::Waiting, waiting.group);
    assert_eq!(
        Some(WaitReason::Permission {
            tool_name: "Bash".into(),
            subject: Some(take_utf16(COMMAND, 40).to_owned()),
        }),
        waiting.reason
    );

    let (_, question) = first_wait("14-ask-answers-updatedinput");
    assert_eq!(
        SessionSummary {
            group: SessionGroup::Waiting,
            reason: Some(WaitReason::Question),
        },
        summary(&question, false)
    );

    let (_, plan) = first_wait("05-permission-can-use-tool");
    assert_eq!(
        Some(WaitReason::Plan),
        summary(&as_tool(&plan, "ExitPlanMode", None), false).reason
    );
}

#[test]
fn running_then_unread_then_other() {
    let all = views("01-baseline-text");
    let running_view = all
        .iter()
        .find(|it| running(it) && !pending(it))
        .unwrap_or_else(|| panic!("a running view"));
    let group = |group| SessionSummary {
        group,
        reason: None,
    };
    assert_eq!(group(SessionGroup::Running), summary(running_view, true));
    let done = all.last().unwrap_or_else(|| panic!("a last view"));
    assert_eq!(group(SessionGroup::Unread), summary(done, true));
    assert_eq!(group(SessionGroup::Other), summary(done, false));
    // The list shows the groups in this order.
    let mut groups = [
        SessionGroup::Other,
        SessionGroup::Unread,
        SessionGroup::Running,
        SessionGroup::Waiting,
    ];
    groups.sort();
    assert_eq!(
        [
            SessionGroup::Waiting,
            SessionGroup::Running,
            SessionGroup::Unread,
            SessionGroup::Other,
        ],
        groups
    );
}

#[test]
fn a_permission_while_hidden_alerts() {
    let (before, after) = first_wait("05-permission-can-use-tool");
    let id = single_request(&after);

    let change = alerts(Some(&as_bash(&before, COMMAND)), &as_bash(&after, COMMAND));

    assert_eq!(
        vec![SessionAlert::Permission(PermissionAlert {
            key: id.clone(),
            request_id: id,
            tool_name: "Bash".into(),
            subject: take_utf16(COMMAND, 80).to_owned(),
            answerable: false,
        })],
        change.raised
    );
    assert!(change.expired.is_empty());
}

#[test]
fn the_same_pending_alerts_once() {
    let (_, after) = first_wait("05-permission-can-use-tool");
    assert_eq!(AlertChange::default(), alerts(Some(&after), &after));
}

#[test]
fn an_answer_expires_the_alert() {
    let all = views("05-permission-can-use-tool");
    let at = all
        .iter()
        .position(pending)
        .unwrap_or_else(|| panic!("a waiting view"));
    let id = single_request(&all[at]);
    let answered = all[at..]
        .iter()
        .find(|it| !pending(it))
        .unwrap_or_else(|| panic!("an answered view"));

    assert_eq!(vec![id], alerts(Some(&all[at]), answered).expired);
}

fn open_only(id: &str, what: AlertKind) -> SessionAlert {
    SessionAlert::OpenOnly(OpenOnlyAlert {
        key: id.to_owned(),
        request_id: id.to_owned(),
        what,
    })
}

fn open_only_kind(alert: &SessionAlert) -> AlertKind {
    match alert {
        SessionAlert::OpenOnly(alert) => alert.what,
        other => panic!("not an open-only alert: {other:?}"),
    }
}

fn single(change: AlertChange) -> SessionAlert {
    assert_eq!(1, change.raised.len(), "{change:?}");
    change
        .raised
        .into_iter()
        .next()
        .unwrap_or_else(|| panic!("one alert"))
}

#[test]
fn an_edit_and_a_question_only_open_the_session() {
    let (before_edit, edit) = first_wait("17-edit-approval");
    let edit_id = single_request(&edit);
    assert_eq!(
        vec![open_only(&edit_id, AlertKind::Edit)],
        alerts(Some(&before_edit), &edit).raised
    );

    let (before_ask, ask) = first_wait("14-ask-answers-updatedinput");
    let ask_id = single_request(&ask);
    assert_eq!(
        vec![open_only(&ask_id, AlertKind::Question)],
        alerts(Some(&before_ask), &ask).raised
    );

    let (before_write, write) = first_wait("05-permission-can-use-tool");
    assert_eq!(
        AlertKind::Edit,
        open_only_kind(&single(alerts(Some(&before_write), &write)))
    );
    let plan = single(alerts(
        Some(&as_tool(&before_write, "ExitPlanMode", None)),
        &as_tool(&write, "ExitPlanMode", None),
    ));
    assert_eq!(AlertKind::Plan, open_only_kind(&plan));
}

fn alert_for(tool: &str, input: Value) -> PermissionAlert {
    let (before, after) = first_wait("05-permission-can-use-tool");
    match single(alerts(
        Some(&as_tool(&before, tool, Some(input.clone()))),
        &as_tool(&after, tool, Some(input)),
    )) {
        SessionAlert::Permission(alert) => alert,
        other => panic!("not a permission alert: {other:?}"),
    }
}

fn bash_alert(command: &str) -> PermissionAlert {
    alert_for("Bash", json!({ "command": command }))
}

fn bash_alert_with(command: &str, key: &str, value: Value) -> PermissionAlert {
    alert_for("Bash", json!({ "command": command, key: value }))
}

fn read_alert(path: &str) -> PermissionAlert {
    alert_for("Read", json!({ "file_path": path }))
}

#[test]
fn a_short_one_line_command_can_be_allowed_from_the_notification() {
    assert!(bash_alert(&"a".repeat(80)).answerable);
    assert!(bash_alert_with("ls", "description", json!("list")).answerable);
}

#[test]
fn a_long_or_multi_line_command_cannot() {
    assert!(!bash_alert(&"a".repeat(81)).answerable);
    assert!(!bash_alert("ls\nrm -rf x").answerable);
}

#[test]
fn a_command_with_more_input_than_the_command_cannot() {
    assert!(!bash_alert_with("ls", "timeout", json!("5")).answerable);
    assert!(!bash_alert_with("ls", "dangerouslyDisableSandbox", json!(true)).answerable);
}

#[test]
fn a_tool_other_than_bash_and_the_file_tools_cannot() {
    let input = json!({ "url": "https://example.com" });
    for tool in ["WebFetch", "Grep", "mcp__server__call"] {
        assert!(!alert_for(tool, input.clone()).answerable, "{tool}");
    }
}

#[test]
fn a_read_whose_whole_path_fits_is_shown_whole_and_can_be_allowed() {
    let alert = read_alert("/home/u/.ssh/id_rsa");
    assert_eq!("/home/u/.ssh/id_rsa", alert.subject);
    assert!(alert.answerable);
    assert_eq!("note.txt", read_alert("note.txt").subject);
}

#[test]
fn a_read_whose_path_is_too_long_is_shown_shortened_and_cannot_be_allowed() {
    let alert = read_alert(&format!("/{}/.ssh/id_rsa", "d".repeat(80)));
    assert_eq!(".ssh/id_rsa", alert.subject);
    assert!(!alert.answerable);
}

#[test]
fn a_read_with_more_input_than_the_path_cannot() {
    let alert = alert_for("Read", json!({ "file_path": "/a/b", "limit": "1" }));
    assert!(!alert.answerable);
}

#[test]
fn a_bash_without_a_string_command_cannot() {
    assert!(!alert_for("Bash", json!({})).answerable);
    assert!(!alert_for("Bash", json!({ "command": true })).answerable);
    assert!(!bash_alert("").answerable);
}

#[test]
fn a_read_that_is_not_a_path_alone_cannot() {
    assert!(!alert_for("Read", json!({})).answerable);
    assert!(!read_alert("").answerable);
    for key in ["offset", "pages"] {
        let input = json!({ "file_path": "/a/b", key: "1" });
        assert!(!alert_for("Read", input).answerable, "{key}");
    }
}

#[test]
fn a_windows_path_is_shown_whole_or_by_its_folder() {
    assert_eq!(
        "C:\\a\\.ssh\\id_rsa",
        read_alert("C:\\a\\.ssh\\id_rsa").subject
    );
    assert_eq!(
        ".ssh/id_rsa",
        read_alert(&format!("C:\\{}\\.ssh\\id_rsa", "d".repeat(80))).subject
    );
}

#[test]
fn hidden_characters_are_marked() {
    let bash = bash_alert("cat evil\u{202E}txt.sh");
    assert!(bash.subject.contains("<U+202E>"), "{}", bash.subject);
    assert!(!bash.answerable);
    let read = read_alert("/a/evil\u{202E}txt");
    assert!(read.subject.contains("<U+202E>"), "{}", read.subject);
    assert!(!read.answerable);
}

#[test]
fn an_alert_shows_nothing_of_another_tools_input() {
    let url = json!({ "url": "https://example.com/secret?q=1" });
    for tool in ["WebFetch", "Grep", "Task", "mcp__server__call"] {
        assert_eq!("", alert_for(tool, url.clone()).subject, "{tool}");
    }
}

#[test]
fn a_turn_end_raises_finished() {
    let all = views("01-baseline-text");
    let end = (1..all.len())
        .find(|&it| running(&all[it - 1]) && !running(&all[it]))
        .unwrap_or_else(|| panic!("a turn end"));
    let turns = all[end].0.turns.len();

    let raised = alerts(Some(&all[end - 1]), &all[end]).raised;
    assert_eq!(
        vec![SessionAlert::Finished(FinishedAlert {
            key: format!("finished:{turns}"),
        })],
        raised
    );
    assert_eq!(format!("finished:{turns}"), raised[0].key());
    assert!(alerts(Some(&all[end]), &all[end]).raised.is_empty());
}

#[test]
fn a_first_look_raises_what_waits() {
    let (_, after) = first_wait("17-edit-approval");
    let id = single_request(&after);
    assert_eq!(
        vec![open_only(&id, AlertKind::Edit)],
        alerts(None, &after).raised
    );
    let done = views("01-baseline-text");
    assert!(
        alerts(None, done.last().unwrap_or_else(|| panic!("a last view")))
            .raised
            .is_empty()
    );
}

#[test]
fn a_session_with_nothing_is_other() {
    let summary = session_summary(&ConversationState::default(), &Transcript::default(), false);
    assert_eq!(SessionGroup::Other, summary.group);
    assert_eq!(None, summary.reason);
}

fn sent(text: &str) -> Arc<Transcript> {
    let empty = ConversationState::default();
    let sent = PresenterInput::UserSent(UserSent {
        message_id: SendId::new("u1").unwrap_or_else(|| panic!("a send id")),
        text: text.to_owned(),
        attachments: Vec::new(),
        uuid: None,
    });
    fold_transcript(&Arc::default(), &sent, &empty, &empty)
}

#[test]
fn the_first_line_of_the_first_request_names_a_session() {
    let all = replay("01-baseline-text");
    let transcript = &all
        .last()
        .unwrap_or_else(|| panic!("a last step"))
        .view
        .transcript;
    assert_eq!(
        Some("Respond with exactly one word: pong".to_owned()),
        session_title(transcript)
    );
}

#[test]
fn a_long_request_is_cut() {
    let long = format!("{}\n二行目", "あ".repeat(100));
    assert_eq!(Some("あ".repeat(TITLE_MAX)), session_title(&sent(&long)));
}

#[test]
fn a_session_with_no_request_has_no_title() {
    assert_eq!(None, session_title(&Transcript::default()));
}

#[test]
fn a_title_cut_inside_an_emoji_keeps_whole_characters() {
    let title = format!("{}\u{1F600}", "a".repeat(59));
    assert_eq!(Some("a".repeat(59)), session_title(&sent(&title)));

    let (_, waiting) = first_wait("05-permission-can-use-tool");
    let reason_command = format!("{}\u{1F600}", "a".repeat(39));
    assert_eq!(
        Some(WaitReason::Permission {
            tool_name: "Bash".into(),
            subject: Some("a".repeat(39)),
        }),
        summary(&as_bash(&waiting, &reason_command), false).reason
    );

    let alert = bash_alert(&format!("{}\u{1F600}", "a".repeat(79)));
    assert_eq!("a".repeat(79), alert.subject);
    assert!(!alert.answerable);
}

#[test]
fn waiting_alerts_name_what_waits_in_arrival_order() {
    let (_, sandbox) = first_wait("36-sandbox-unavailable");
    let waiting = waiting_alerts(&sandbox.0, &sandbox.1);
    let [SessionAlert::Permission(alert)] = waiting.as_slice() else {
        panic!("36: expected one permission alert, got {waiting:?}");
    };
    assert_eq!("Bash", alert.tool_name);
    assert!(alert.answerable);
    assert!(
        alert.subject.starts_with("touch "),
        "36: {:?}",
        alert.subject
    );

    let open_only = |scenario: &str, what: AlertKind| {
        let (_, wait) = first_wait(scenario);
        let waiting = waiting_alerts(&wait.0, &wait.1);
        let [SessionAlert::OpenOnly(alert)] = waiting.as_slice() else {
            panic!("{scenario}: expected one open-only alert, got {waiting:?}");
        };
        assert_eq!(what, alert.what, "{scenario}");
    };
    open_only("17-edit-approval", AlertKind::Edit);
    open_only("18-ask-multi-question", AlertKind::Question);
    open_only("29-exit-plan-mode", AlertKind::Plan);

    let all = views("01-baseline-text");
    let last = all.last().expect("01 has views");
    assert!(waiting_alerts(&last.0, &last.1).is_empty());
}

#[test]
fn the_alerts_agree_with_alerts_between() {
    let (_, after) = first_wait("36-sandbox-unavailable");
    assert_eq!(
        waiting_alerts(&after.0, &after.1),
        alerts(None, &after).raised
    );
}
