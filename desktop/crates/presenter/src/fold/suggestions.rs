//! Reading the `permission_suggestions` of a control request (Suggestions.kt). They are the CLI's
//! content, so a member of the wrong type reads as absent.

use std::sync::Arc;

use serde_json::{Map, Value};

use crate::json::{JsonFields, compact};
use crate::transcript::SuggestionRecord;

/// The `permission_suggestions` of a request, each with the id of its place in the list. An entry
/// that is not an object, or has no `type`, is left out and the others keep their places.
pub(crate) fn suggestions_of(request: Option<&Map<String, Value>>) -> Arc<[SuggestionRecord]> {
    let Some(items) = request.and_then(|it| it.array("permission_suggestions")) else {
        return Arc::from([]);
    };
    items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let fields = item.as_object()?;
            let kind = fields.string("type")?;
            Some(SuggestionRecord {
                id: suggestion_id(index),
                kind: kind.to_owned(),
                detail: detail_of(kind, fields),
                destination: fields.string("destination").map(str::to_owned),
                raw: compact(item),
            })
        })
        .collect()
}

/// The id of the suggestion at `position` (from 0) in a request's list.
pub fn suggestion_id(position: usize) -> String {
    format!("s{}", position + 1)
}

fn detail_of(kind: &str, suggestion: &Map<String, Value>) -> String {
    match kind {
        "setMode" => suggestion.string("mode").unwrap_or_default().to_owned(),
        "addRules" | "replaceRules" | "removeRules" => suggestion
            .array("rules")
            .map(|rules| {
                rules
                    .iter()
                    .filter_map(Value::as_object)
                    .map(|rule| {
                        let tool = rule.string("toolName").unwrap_or_default();
                        match rule.string("ruleContent") {
                            Some(content) => format!("{tool}({content})"),
                            None => tool.to_owned(),
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        "addDirectories" | "removeDirectories" => suggestion
            .array("directories")
            .map(|directories| {
                directories
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn request(text: &str) -> Map<String, Value> {
        match parse(text) {
            Some(Value::Object(fields)) => fields,
            _ => panic!("not an object"),
        }
    }

    #[test]
    fn rules_read_as_tool_and_content_one_to_a_line_and_other_kinds_have_no_detail() {
        let offered = request(concat!(
            r#"{"permission_suggestions":[{"type":"replaceRules","rules":[{"toolName":"Bash","ruleContent":"ls:*"},"#,
            r#""x",{"ruleContent":"y"}]},{"type":"removeDirectories","directories":["/a",1,"/b"]},"#,
            r#"{"type":"somethingNew","destination":7}]}"#
        ));

        let read = suggestions_of(Some(&offered));

        assert_eq!(
            vec!["Bash(ls:*)\n(y)", "/a\n/b", ""],
            read.iter().map(|it| it.detail.as_str()).collect::<Vec<_>>()
        );
        assert_eq!(
            None, read[2].destination,
            "a destination that is not a string"
        );
        assert_eq!(r#"{"type":"somethingNew","destination":7}"#, read[2].raw);
    }

    #[test]
    fn a_request_without_a_list_offers_nothing() {
        assert!(suggestions_of(None).is_empty());
        assert!(suggestions_of(Some(&request(r#"{"permission_suggestions":{}}"#))).is_empty());
    }
}
