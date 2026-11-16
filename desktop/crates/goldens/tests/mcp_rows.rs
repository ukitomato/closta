//! The MCP tab's list: the servers the CLI listed, what each lets the user press, and the
//! sentence of the last refused switch (McpRowsTest.kt).

use std::sync::Arc;

use closta_goldens::replay::replay;
use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;
use closta_presenter::mcp_rows::{McpList, McpRow, mcp_list};
use closta_presenter::records::mcp::{MCP_SOURCE_SDK, MCP_UNKNOWN, McpServerRecord};
use closta_presenter::records::operations::{
    OperationRecords, SwitchKind, SwitchOutcome, SwitchRecord,
};

fn server(name: &str, status: &str) -> McpServerRecord {
    McpServerRecord {
        name: name.to_owned(),
        status: status.to_owned(),
        source: "dynamic".to_owned(),
        tools: Arc::from([]),
        error: None,
    }
}

fn listing(servers: Vec<McpServerRecord>) -> OperationRecords {
    OperationRecords {
        mcp_servers: Some(servers.into()),
        ..OperationRecords::default()
    }
}

fn rows(operations: &OperationRecords) -> Vec<McpRow> {
    match mcp_list(operations) {
        McpList::Rows { rows, .. } => rows,
        other => panic!("rows, not {other:?}"),
    }
}

fn last_operations(scenario: &str) -> OperationRecords {
    let steps = replay(scenario);
    let last = steps.last().unwrap_or_else(|| panic!("no steps"));
    OperationRecords::clone(&last.view.transcript.operations)
}

#[test]
fn mcp_rows_from_capture_24() {
    let McpList::Rows {
        rows,
        stale,
        notice,
    } = mcp_list(&last_operations("24-mcp-management"))
    else {
        panic!("rows")
    };
    assert_eq!(1, rows.len());
    let row = &rows[0];
    assert_eq!("fake-echo", row.name);
    assert_eq!("connected", row.status);
    assert_eq!(1, row.tools);
    assert!(row.enabled);
    assert!(row.can_toggle);
    assert!(row.can_reconnect);
    assert!(!row.needs_sign_in);
    assert!(!row.busy);
    assert_eq!(None, row.error);
    assert!(!stale);
    // The last request turned off a name the CLI does not know: its refusal is the list's notice.
    assert_eq!(Some("Server not found: no-such-server"), notice.as_deref());
}

#[test]
fn mcp_rows_after_the_server_was_turned_off() {
    let steps = replay("24-mcp-management");
    // The answer to req-4 is the list right after the turn off.
    let after_off = steps
        .iter()
        .find(|step| {
            matches!(
                &step.input,
                PresenterInput::Event(AgentEvent::ControlResponse { request_id: Some(id), .. })
                    if id == "24-mcp-management-req-4"
            )
        })
        .unwrap_or_else(|| panic!("the answer to req-4"));
    let rows = rows(&after_off.view.transcript.operations);
    assert_eq!(1, rows.len());
    let row = &rows[0];
    assert_eq!("disabled", row.status);
    assert!(!row.enabled);
    assert_eq!(0, row.tools);
    assert!(row.can_toggle);
    assert!(!row.can_reconnect);
}

#[test]
fn mcp_rows_while_waiting() {
    assert_eq!(McpList::Waiting, mcp_list(&OperationRecords::default()));
    let asked = OperationRecords {
        mcp_waiting: imbl::vector!["r1".to_owned()],
        ..OperationRecords::default()
    };
    assert_eq!(McpList::Waiting, mcp_list(&asked));
}

#[test]
fn unreadable_list() {
    let unread = OperationRecords {
        mcp_unreadable: true,
        ..OperationRecords::default()
    };
    assert_eq!(McpList::Unreadable, mcp_list(&unread));
    let older = OperationRecords {
        mcp_unreadable: true,
        ..listing(vec![server("a", "connected")])
    };
    let McpList::Rows { rows, stale, .. } = mcp_list(&older) else {
        panic!("rows")
    };
    assert!(stale);
    assert_eq!(
        vec!["a"],
        rows.iter().map(|it| it.name.as_str()).collect::<Vec<_>>()
    );
}

#[test]
fn needs_auth_asks_for_the_terminal() {
    let rows = rows(&listing(vec![server("s", "needs-auth")]));
    assert_eq!(1, rows.len());
    let row = &rows[0];
    assert_eq!("needs-auth", row.status);
    assert!(row.needs_sign_in);
    assert!(!row.can_reconnect);
    assert!(row.can_toggle);
}

#[test]
fn busy_while_toggling() {
    let pending = SwitchRecord {
        id: "r1".to_owned(),
        seq: 1,
        kind: SwitchKind::McpDisable,
        value: "a".to_owned(),
        outcome: SwitchOutcome::Pending,
        detail: None,
    };
    let operations = OperationRecords {
        switches: imbl::vector![pending.clone()],
        ..listing(vec![
            McpServerRecord {
                tools: Arc::from(["x".to_owned()]),
                ..server("a", "connected")
            },
            McpServerRecord {
                error: Some("refused".to_owned()),
                ..server("b", "failed")
            },
        ])
    };
    let listed = rows(&operations);
    let (a, b) = (&listed[0], &listed[1]);
    assert!(a.busy);
    assert!(!a.can_toggle);
    assert!(!a.can_reconnect);
    assert!(!b.busy);
    assert_eq!("failed", b.status);
    assert_eq!(Some("refused"), b.error.as_deref());
    assert!(b.can_reconnect);
    let McpList::Rows { notice, .. } = mcp_list(&operations) else {
        panic!("rows")
    };
    assert_eq!(None, notice, "a pending switch is no notice");
    let applied = OperationRecords {
        switches: imbl::vector![SwitchRecord {
            outcome: SwitchOutcome::Applied,
            ..pending
        }],
        ..operations
    };
    assert!(!rows(&applied)[0].busy);
}

#[test]
fn the_hosts_own_server_cannot_be_switched() {
    let operations = OperationRecords {
        built_in_mcp_servers: Arc::from(["named".to_owned()]),
        ..listing(vec![
            McpServerRecord {
                source: MCP_SOURCE_SDK.to_owned(),
                ..server("ide", "connected")
            },
            server("named", "connected"),
        ])
    };
    for row in rows(&operations) {
        assert!(!row.can_toggle, "{}", row.name);
        assert!(!row.can_reconnect, "{}", row.name);
    }
}

#[test]
fn other_states_read_as_they_are() {
    let labels: Vec<(String, bool)> = rows(&listing(vec![
        server("p", "pending"),
        server("u", MCP_UNKNOWN),
    ]))
    .into_iter()
    .map(|it| (it.status, it.can_toggle))
    .collect();
    assert_eq!(
        vec![
            ("pending".to_owned(), true),
            (MCP_UNKNOWN.to_owned(), false)
        ],
        labels
    );
}
