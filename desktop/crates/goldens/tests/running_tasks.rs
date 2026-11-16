//! The running list above the composer, read from the CLI's own lists of background tasks, and
//! the rows of a subagent's own messages (RunningTasksTest.kt).

use closta_goldens::replay::replay;
use closta_presenter::input::PresenterInput;
use closta_presenter::records::tasks::{AGENT_TOOLS, running_tasks};
use closta_presenter::rows::{ThreadRow, ThreadRows, agent_rows};
use closta_presenter::session::SessionView;
use closta_presenter::transcript::Transcript;
use closta_providers::claude::protocol::decode;

fn fold(lines: &[String]) -> Transcript {
    let view = lines.iter().fold(SessionView::default(), |view, line| {
        view.fold(&PresenterInput::Event(decode(line)))
    });
    Transcript::clone(&view.transcript)
}

fn changed(tasks: &[String]) -> String {
    format!(
        r#"{{"type":"system","subtype":"background_tasks_changed","tasks":[{}],"uuid":"u","session_id":"s"}}"#,
        tasks.join(",")
    )
}

fn task(id: &str, kind: &str, parent: Option<&str>, ambient: Option<bool>) -> String {
    let mut out = format!(r#"{{"task_id":"{id}","task_type":"{kind}","description":"d-{id}""#);
    if let Some(parent) = parent {
        out.push_str(&format!(r#","parent_task_id":"{parent}""#));
    }
    if let Some(ambient) = ambient {
        out.push_str(&format!(r#","ambient":{ambient}"#));
    }
    out.push('}');
    out
}

fn agent(id: &str) -> String {
    task(id, "local_agent", None, None)
}

fn progress(id: &str, tool: &str, ms: i64) -> String {
    format!(
        concat!(
            r#"{{"type":"system","subtype":"task_progress","task_id":"{id}","tool_use_id":"toolu_{id}","#,
            r#""description":"Running","subagent_type":"general-purpose","#,
            r#""usage":{{"total_tokens":1,"tool_uses":1,"duration_ms":{ms}}},"last_tool_name":"{tool}","#,
            r#""uuid":"u","session_id":"s"}}"#
        ),
        id = id,
        tool = tool,
        ms = ms
    )
}

fn ids(transcript: &Transcript) -> Vec<String> {
    running_tasks(transcript)
        .into_iter()
        .map(|it| it.task_id)
        .collect()
}

#[test]
fn ambient_tasks_are_hidden() {
    let transcript = fold(&[changed(&[
        agent("a"),
        task("w", "local_agent", None, Some(true)),
    ])]);
    assert_eq!(vec!["a"], ids(&transcript));
}

#[test]
fn child_tasks_are_indented() {
    let transcript = fold(&[changed(&[
        agent("a"),
        agent("b"),
        task("sh", "local_bash", Some("a"), None),
        task("x", "local_agent", Some("gone"), None),
    ])]);
    let tasks = running_tasks(&transcript);
    let placed: Vec<(&str, i32)> = tasks
        .iter()
        .map(|it| (it.task_id.as_str(), it.depth))
        .collect();
    assert_eq!(vec![("a", 0), ("sh", 1), ("b", 0), ("x", 0)], placed);
    assert_eq!("shell", tasks[1].kind);
    assert_eq!("agent", tasks[0].kind);
}

#[test]
fn another_task_type_is_its_own_kind() {
    let transcript = fold(&[changed(&[task("r", "remote_agent", None, None)])]);
    assert_eq!("remote_agent", running_tasks(&transcript)[0].kind);
}

#[test]
fn finished_tasks_leave() {
    let transcript = fold(&[changed(&[agent("a"), agent("b")]), changed(&[agent("b")])]);
    assert_eq!(vec!["b"], ids(&transcript));
    assert!(ids(&fold(&[changed(&[agent("a")]), changed(&[])])).is_empty());
}

#[test]
fn progress_gives_the_last_tool_and_the_time_so_far() {
    let transcript = fold(&[
        changed(&[agent("a")]),
        progress("a", "Read", 1_000),
        progress("a", "Bash", 2_500),
    ]);
    let tasks = running_tasks(&transcript);
    assert_eq!(1, tasks.len());
    let only = &tasks[0];
    assert_eq!(Some("Bash"), only.detail.as_deref());
    assert_eq!(Some(2_500), only.elapsed_ms);
    assert_eq!(Some("toolu_a"), only.tool_use_id.as_deref());
    assert_eq!("d-a", only.title);
}

#[test]
fn a_loop_of_parents_still_shows_each_task_once() {
    let transcript = fold(&[changed(&[
        task("a", "local_agent", Some("b"), None),
        task("b", "local_agent", Some("a"), None),
    ])]);
    let mut seen = ids(&transcript);
    assert_eq!(2, seen.len());
    seen.sort();
    assert_eq!(vec!["a", "b"], seen);
}

#[test]
fn capture_10_lists_the_background_agent_while_it_runs() {
    let steps = replay("10-background-task");
    let seen: Vec<_> = steps
        .iter()
        .map(|step| running_tasks(&step.view.transcript))
        .filter(|it| !it.is_empty())
        .collect();
    assert!(!seen.is_empty());
    assert_eq!("agent", seen[0][0].kind);
    let last = steps.last().unwrap_or_else(|| panic!("no steps"));
    assert!(running_tasks(&last.view.transcript).is_empty());
}

#[test]
fn agent_rows_are_the_subagents_messages() {
    let steps = replay("12-subagent-permission");
    let last = steps.last().unwrap_or_else(|| panic!("no steps"));
    let transcript = &last.view.transcript;
    let agent = ThreadRows::default()
        .of(transcript)
        .into_iter()
        .find_map(|row| match row {
            ThreadRow::Tool(tool) if AGENT_TOOLS.contains(&tool.tool_name.as_str()) => Some(tool),
            _ => None,
        })
        .unwrap_or_else(|| panic!("an agent row"));
    let rows = agent_rows(transcript, &agent.tool_use_id);
    assert!(!rows.is_empty());
    assert!(
        !rows
            .iter()
            .any(|row| matches!(row, ThreadRow::Ask(ask) if ask.key == agent.key))
    );
    assert!(agent_rows(transcript, "no-such-call").is_empty());
}
