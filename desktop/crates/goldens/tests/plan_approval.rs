//! The plan card and what answering it sends (PlanApprovalTest.kt). `cardFollowsGoChange` goes
//! through the rows and moves with them.

use std::sync::Arc;

use closta_goldens::replay::replay;
use closta_model::ApprovalDecision;
use closta_presenter::cards::plan::{PlanCard, PlanChoice, PlanGo, plan_answer, plan_go_of};
use closta_presenter::cards::{ThreadCard, allow_payload, card_of};
use closta_presenter::json::JsonFields;
use closta_presenter::records::operations::OperationRecords;
use closta_presenter::text::kt_is_blank;
use closta_presenter::transcript::{ApprovalOutcome, ApprovalRecord};
use serde_json::{Value, json};

fn approvals() -> Vec<ApprovalRecord> {
    let steps = replay("29-exit-plan-mode");
    let transcript = &steps
        .last()
        .unwrap_or_else(|| panic!("no step"))
        .view
        .transcript;
    transcript
        .approvals
        .values()
        .map(|it| ApprovalRecord::clone(it))
        .collect()
}

fn plan_approval() -> ApprovalRecord {
    approvals()
        .into_iter()
        .find(|it| it.tool_name.as_deref() == Some("ExitPlanMode"))
        .unwrap_or_else(|| panic!("no ExitPlanMode request"))
}

fn plan_card(card: ThreadCard) -> PlanCard {
    match card {
        ThreadCard::Plan(card) => card,
        other => panic!("not a plan card: {other:?}"),
    }
}

fn allow(card: &PlanCard) -> ApprovalDecision {
    ApprovalDecision::Allow {
        request_id: card.request_id.clone(),
    }
}

#[test]
fn a_plan_card_from_the_capture() {
    let approval = plan_approval();
    let card = plan_card(card_of(&approval, PlanGo::AcceptEdits));
    assert_eq!(approval.request_id, card.request_id);
    assert!(card.plan.as_deref().is_some_and(|it| !kt_is_blank(it)));
    let plan = approval
        .input
        .as_deref()
        .and_then(Value::as_object)
        .and_then(|it| it.string("plan"))
        .map(str::to_owned);
    assert_eq!(plan, card.plan);
    assert_eq!(PlanGo::AcceptEdits, card.go);
}

#[test]
fn the_edit_after_the_plan_is_a_permission() {
    let edit = approvals()
        .into_iter()
        .find(|it| it.tool_name.as_deref() == Some("Edit"))
        .expect("an Edit request");
    assert!(matches!(
        card_of(&edit, PlanGo::Auto),
        ThreadCard::Permission(_)
    ));
}

#[test]
fn a_plan_without_its_text_still_asks() {
    let approval = ApprovalRecord {
        request_id: "r1".into(),
        tool_use_id: Some("t1".into()),
        tool_name: Some("ExitPlanMode".into()),
        input: Some(Arc::new(
            json!({"planFilePath": "/home/user/.claude/plans/p.md"}),
        )),
        ..ApprovalRecord::default()
    };
    assert_eq!(
        None,
        plan_card(card_of(&approval, PlanGo::AcceptEdits)).plan
    );
    let blank = ApprovalRecord {
        input: Some(Arc::new(json!({"plan": " \n\t"}))),
        ..approval
    };
    assert_eq!(None, plan_card(card_of(&blank, PlanGo::AcceptEdits)).plan);
}

#[test]
fn plan_answer_payloads() {
    let approval = plan_approval();
    let card = plan_card(card_of(&approval, PlanGo::AcceptEdits));
    let auto = plan_answer(&card, &approval, PlanChoice::Go, "");
    assert_eq!(allow(&card), auto.decision);
    assert_eq!(allow_payload(&approval), auto.payload);
    assert_eq!(Some("acceptEdits"), auto.mode_after.as_deref());
    let ask = plan_answer(&card, &approval, PlanChoice::AskEdits, "");
    assert_eq!(allow(&card), ask.decision);
    assert_eq!(allow_payload(&approval), ask.payload);
    assert_eq!(None, ask.mode_after);
    let keep = plan_answer(&card, &approval, PlanChoice::KeepPlanning, "");
    assert_eq!(
        ApprovalDecision::Deny {
            request_id: card.request_id.clone()
        },
        keep.decision
    );
    assert_eq!(None, keep.mode_after);
}

#[test]
fn keep_planning_carries_the_comment() {
    let approval = plan_approval();
    let card = plan_card(card_of(&approval, PlanGo::AcceptEdits));
    let keep = plan_answer(
        &card,
        &approval,
        PlanChoice::KeepPlanning,
        "  テストの手順も入れて \n",
    );
    assert_eq!("テストの手順も入れて", keep.payload);
}

#[test]
fn go_keeps_its_mode_through_the_allow() {
    // The CLI goes back to default by itself on the allow (capture 29, line 156); the allow
    // carries the mode, as sdk.d.ts' PermissionUpdate { type: 'setMode', mode, destination } has
    // it.
    let approval = plan_approval();
    let card = plan_card(card_of(&approval, PlanGo::AcceptEdits));
    let auto = plan_answer(&card, &approval, PlanChoice::Go, "");
    let updates: Value = serde_json::from_str(
        auto.passed_on
            .updated_permissions
            .as_deref()
            .expect("the mode to keep"),
    )
    .expect("JSON");
    assert_eq!(
        json!([{"type": "setMode", "mode": "acceptEdits", "destination": "session"}]),
        updates
    );
    assert_eq!(
        approval.input.as_deref().and_then(Value::as_object),
        auto.passed_on.input.as_deref()
    );
    let ask = plan_answer(&card, &approval, PlanChoice::AskEdits, "");
    assert_eq!(None, ask.passed_on.updated_permissions);
    assert_eq!(None, ask.mode_after);
}

#[test]
fn go_is_bypass_once_bypass_was_entered() {
    let operations = OperationRecords {
        bypass_entered: true,
        auto_rejected: true,
        ..OperationRecords::default()
    };
    assert_eq!(PlanGo::Bypass, plan_go_of(&operations));
}

#[test]
fn go_is_accept_edits_after_auto_was_rejected() {
    let operations = OperationRecords {
        auto_rejected: true,
        ..OperationRecords::default()
    };
    assert_eq!(PlanGo::AcceptEdits, plan_go_of(&operations));
}

#[test]
fn go_is_auto_by_default() {
    assert_eq!(PlanGo::Auto, plan_go_of(&OperationRecords::default()));
}

#[test]
fn a_go_answer_carries_the_mode() {
    let approval = plan_approval();
    let card = plan_card(card_of(&approval, PlanGo::Auto));
    let made = plan_answer(
        &PlanCard {
            go: PlanGo::Auto,
            ..card.clone()
        },
        &approval,
        PlanChoice::Go,
        "",
    );
    assert_eq!(Some("auto"), made.mode_after.as_deref());
    assert_eq!(
        Some(r#"[{"type":"setMode","mode":"auto","destination":"session"}]"#),
        made.passed_on.updated_permissions.as_deref()
    );
    let bypass = plan_answer(
        &PlanCard {
            go: PlanGo::Bypass,
            ..card
        },
        &approval,
        PlanChoice::Go,
        "",
    );
    assert_eq!(Some("bypassPermissions"), bypass.mode_after.as_deref());
}

#[test]
fn plan_debug_leaves_out_the_plan_and_the_comment() {
    let approval = plan_approval();
    let card = PlanCard {
        answered: None,
        ..plan_card(card_of(&approval, PlanGo::AcceptEdits))
    };
    let plan = card.plan.clone().expect("a plan");
    let shown = format!("{card:?}");
    assert_eq!(format!("PlanCard({}, open)", card.request_id), shown);
    assert!(!shown.contains(&plan));
    let answered = PlanCard {
        answered: Some(ApprovalOutcome::Approved),
        ..card.clone()
    };
    assert_eq!(
        format!("PlanCard({}, Approved)", card.request_id),
        format!("{answered:?}")
    );
    let comment = "秘密の一言";
    let keep = plan_answer(&card, &approval, PlanChoice::KeepPlanning, comment);
    let shown = format!("{keep:?}");
    assert!(!shown.contains(comment));
    assert!(!shown.contains(&plan));
    assert!(shown.ends_with(", no switch)"), "{shown}");
    let go = format!("{:?}", plan_answer(&card, &approval, PlanChoice::Go, ""));
    assert!(!go.contains(&plan));
    assert!(go.ends_with(", acceptEdits)"), "{go}");
}
