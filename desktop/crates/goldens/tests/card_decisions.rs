//! What a card's buttons decide, where kept suggestions go, and a question's answers
//! (CardDecisionsTest.kt).

use closta_goldens::replay::replay;
use closta_presenter::cards::decisions::{
    PermissionChoice, QuestionPick, detail_choice, kept_suggestions, offers_destination,
    permission_choice, question_answers, questions_complete,
};
use closta_presenter::cards::{SuggestionLine, suggestion_lines_of};
use closta_presenter::transcript::SuggestionRecord;

fn suggestion(
    id: &str,
    kind: &str,
    detail: &str,
    destination: &str,
    raw: &str,
) -> SuggestionRecord {
    SuggestionRecord {
        id: id.into(),
        kind: kind.into(),
        detail: detail.into(),
        destination: Some(destination.into()),
        raw: raw.into(),
    }
}

fn rule() -> SuggestionRecord {
    suggestion(
        "s1",
        "addRules",
        "",
        "localSettings",
        r#"{"type":"addRules","destination":"localSettings"}"#,
    )
}

fn mode() -> SuggestionRecord {
    suggestion(
        "s2",
        "setMode",
        "acceptEdits",
        "session",
        r#"{"type":"setMode"}"#,
    )
}

fn pick(question: &str, chosen: &[&str], other: Option<&str>) -> QuestionPick {
    QuestionPick {
        question: question.into(),
        chosen: chosen.iter().map(|it| (*it).to_owned()).collect(),
        other: other.map(str::to_owned),
    }
}

#[test]
fn the_first_button_allows() {
    assert_eq!(PermissionChoice::Allow, permission_choice(0, false));
    assert_eq!(PermissionChoice::Allow, permission_choice(0, true));
}

#[test]
fn without_suggestions_the_second_button_denies() {
    assert_eq!(PermissionChoice::Deny, permission_choice(1, false));
}

#[test]
fn with_suggestions_the_second_button_keeps_them() {
    assert_eq!(PermissionChoice::AllowKeep, permission_choice(1, true));
}

#[test]
fn with_suggestions_the_third_button_denies() {
    assert_eq!(PermissionChoice::Deny, permission_choice(2, true));
}

#[test]
fn the_sessions_window_answers_as_the_conversation_does_or_not_at_all() {
    for has_suggestions in [false, true] {
        for index in 0..=8 {
            if let Some(detail) = detail_choice(index, has_suggestions) {
                assert_eq!(permission_choice(index, has_suggestions), detail);
            }
        }
    }
}

#[test]
fn the_sessions_window_never_keeps_a_suggestion() {
    for has_suggestions in [false, true] {
        for index in 0..=8 {
            assert_ne!(
                Some(PermissionChoice::AllowKeep),
                detail_choice(index, has_suggestions)
            );
        }
    }
}

#[test]
fn with_suggestions_the_sessions_windows_second_key_does_nothing_and_its_third_denies() {
    assert_eq!(Some(PermissionChoice::Allow), detail_choice(0, true));
    assert_eq!(None, detail_choice(1, true));
    assert_eq!(Some(PermissionChoice::Deny), detail_choice(2, true));
}

#[test]
fn without_suggestions_the_sessions_windows_second_key_denies() {
    assert_eq!(Some(PermissionChoice::Allow), detail_choice(0, false));
    assert_eq!(Some(PermissionChoice::Deny), detail_choice(1, false));
}

#[test]
fn a_destination_not_chosen_keeps_each_suggestion_as_offered() {
    let offered = vec![rule(), mode()];
    assert_eq!(offered, kept_suggestions(&offered, None));
}

#[test]
fn a_destination_chosen_moves_each_suggestion_not_already_there() {
    let kept = kept_suggestions(&[rule()], Some("projectSettings"));
    assert_eq!(1, kept.len());
    assert_eq!(Some("projectSettings"), kept[0].destination.as_deref());
    assert!(kept[0].raw.contains(r#""destination":"projectSettings""#));
    assert_eq!(
        vec![rule()],
        kept_suggestions(&[rule()], Some("localSettings"))
    );
}

#[test]
fn a_moved_rule_keeps_its_raw_members_in_their_places() {
    let kept = kept_suggestions(&[rule()], Some("userSettings"));
    assert_eq!(
        r#"{"type":"addRules","destination":"userSettings"}"#,
        kept[0].raw
    );
}

#[test]
fn choosing_all_projects_moves_the_rules_but_leaves_a_mode_switch_in_the_session() {
    let session_rule = SuggestionRecord {
        id: "s3".into(),
        destination: Some("session".into()),
        ..rule()
    };
    let kept = kept_suggestions(&[mode(), session_rule], Some("userSettings"));
    assert_eq!(Some("session"), kept[0].destination.as_deref());
    assert_eq!(mode(), kept[0]);
    assert_eq!(Some("userSettings"), kept[1].destination.as_deref());
}

#[test]
fn a_directory_grant_and_a_rule_removal_stay_where_they_were_offered_unless_they_are_rules() {
    let dirs = suggestion(
        "s4",
        "addDirectories",
        "/a",
        "session",
        r#"{"type":"addDirectories"}"#,
    );
    let removal = suggestion(
        "s5",
        "removeRules",
        "",
        "session",
        r#"{"type":"removeRules"}"#,
    );
    let kept = kept_suggestions(&[dirs, removal], Some("userSettings"));
    assert_eq!(Some("session"), kept[0].destination.as_deref());
    assert_eq!(Some("userSettings"), kept[1].destination.as_deref());
}

#[test]
fn each_suggestion_is_its_own_line() {
    let dirs = suggestion(
        "s4",
        "addDirectories",
        "/a\n/b",
        "session",
        r#"{"type":"addDirectories"}"#,
    );
    let lines = suggestion_lines_of(&[mode(), dirs]);
    let expected = vec![
        SuggestionLine {
            kind: "setMode".into(),
            detail: "acceptEdits".into(),
        },
        SuggestionLine {
            kind: "addDirectories".into(),
            detail: "/a\n/b".into(),
        },
    ];
    assert_eq!(expected, lines);
}

#[test]
fn the_captured_suggestions_keep_the_mode_switch_in_the_session_when_all_projects_is_chosen() {
    let names = [
        "05-permission-can-use-tool",
        "12-subagent-permission",
        "16-permission-suggestion-accept",
    ];
    for name in names {
        let steps = replay(name);
        let transcript = &steps.last().expect("a step").view.transcript;
        let offered: Vec<SuggestionRecord> = transcript
            .approvals
            .values()
            .flat_map(|it| it.suggestions.iter().cloned())
            .collect();
        let kept = kept_suggestions(&offered, Some("userSettings"));
        for (before, after) in offered.iter().zip(&kept) {
            if before.kind == "setMode" {
                assert_eq!(Some("session"), after.destination.as_deref(), "{name}");
                assert_eq!(before, after, "{name}");
            }
        }
    }
}

#[test]
fn a_destination_is_offered_only_when_a_rule_is_suggested() {
    let dirs = suggestion(
        "s4",
        "addDirectories",
        "/a",
        "session",
        r#"{"type":"addDirectories"}"#,
    );
    assert!(offers_destination(&[mode(), rule()]));
    assert!(!offers_destination(&[mode(), dirs]));
    assert!(!offers_destination(&[]));
}

#[test]
fn answers_join_a_multi_select_with_a_comma_and_use_other_when_written() {
    let answers = question_answers(&[
        pick("Which?", &["A", "B"], None),
        pick("Why?", &[], Some("  my own  ")),
        pick("Both?", &["C"], Some("D")),
        pick("Blank other?", &["E"], Some("   ")),
    ]);
    let expected: Vec<(String, String)> = [
        ("Which?", "A, B"),
        ("Why?", "my own"),
        ("Both?", "C, D"),
        ("Blank other?", "E"),
    ]
    .iter()
    .map(|(q, a)| ((*q).to_owned(), (*a).to_owned()))
    .collect();
    assert_eq!(expected, answers);
}

#[test]
fn a_question_given_twice_keeps_its_first_place_and_its_last_answer() {
    let answers = question_answers(&[
        pick("Q", &["A"], None),
        pick("R", &["B"], None),
        pick("Q", &["C"], None),
    ]);
    assert_eq!(
        vec![
            ("Q".to_owned(), "C".to_owned()),
            ("R".to_owned(), "B".to_owned())
        ],
        answers
    );
}

#[test]
fn questions_are_complete_only_when_each_has_an_answer() {
    assert!(questions_complete(&[pick("Q", &["A"], None)]));
    assert!(!questions_complete(&[pick("Q", &[], Some("  "))]));
    let one_unanswered = [pick("Q", &["A"], None), pick("R", &[], None)];
    assert!(!questions_complete(&one_unanswered));
}
