//! One stream-json line off the CLI's stdout becomes a JSON object, or a reason it is not one.
//! Mirrors `parseJson` and `exceedsDepth` in StreamJsonCodec.kt.

use serde::Deserialize;
use serde_json::{Map, Value};

/// The deepest nesting a line may have (objects and arrays together; the top-level object counts as 1).
pub(crate) const MAX_DEPTH: usize = 200;

/// A line that is not a JSON object. The codec turns every such line into `BrokenLine`; the reason
/// is the text carried with it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LineError {
    pub(crate) reason: String,
}

impl LineError {
    fn new(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

/// Parses one line strictly into its top-level object.
///
/// The depth is counted before parsing so that a pathological line never reaches the recursive
/// parser, and a leading BOM is skipped as Gson does. serde_json is strict by nature: trailing
/// content, comments and unquoted literals are errors.
///
/// Kotlin difference (2): a lone surrogate escape (`\ud800`) is an error here, where Gson keeps
/// a lone UTF-16 unit that a Rust `String` cannot hold.
pub(crate) fn parse_line(line: &str) -> Result<Map<String, Value>, LineError> {
    if exceeds_depth(line) {
        return Err(LineError::new(format!(
            "nesting deeper than {MAX_DEPTH} levels"
        )));
    }
    let text = line.strip_prefix('\u{feff}').unwrap_or(line);
    if text.chars().all(|c| matches!(c, ' ' | '\t' | '\r' | '\n')) {
        return Err(LineError::new("blank or empty line"));
    }
    let mut de = serde_json::Deserializer::from_str(text);
    de.disable_recursion_limit();
    let value = Value::deserialize(&mut de)
        .and_then(|v| de.end().map(|()| v))
        .map_err(|e| LineError::new(e.to_string()))?;
    match value {
        Value::Object(map) => Ok(map),
        _ => Err(LineError::new("top-level JSON value is not an object")),
    }
}

/// The compact JSON text of a value, as Gson's `JsonElement.toString()` writes it.
///
/// Kotlin difference (3): Gson escapes U+2028 and U+2029; serde_json writes them raw.
/// Kotlin difference (4): Gson keeps a number's literal as read; serde_json rewrites exponents
/// (`1e5` becomes `100000.0`), trailing zeros (`1.50` becomes `1.5`) and integers beyond i64.
pub(crate) fn raw_text(value: &Value) -> String {
    value.to_string()
}

/// Whether `line` nests deeper than [`MAX_DEPTH`]. One pass, no recursion; brackets inside string
/// literals (and after escaped quotes) are not counted. Unbalanced input is left to the parser.
fn exceeds_depth(line: &str) -> bool {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for c in line.chars() {
        if in_string {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' | '[' => depth += 1,
            '}' | ']' => depth = depth.saturating_sub(1),
            _ => {}
        }
        if depth > MAX_DEPTH {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn nested_to(depth: usize) -> String {
        let inner = format!(
            "{}{{}}{}",
            "{\"a\":".repeat(depth - 2),
            "}".repeat(depth - 2)
        );
        format!(r#"{{"type":"holographic_telemetry","n":{inner}}}"#)
    }

    #[test]
    fn depth_limit_matches_kotlin() {
        assert_eq!(MAX_DEPTH, 200);
        assert!(parse_line(&nested_to(200)).is_ok());
        assert!(parse_line(&nested_to(201)).is_err());
        assert!(parse_line(&nested_to(10_000)).is_err());
        let brackets = format!("{}{}", "[".repeat(500), "{".repeat(500));
        assert!(parse_line(&format!(r#"{{"type":"a","s":"{brackets}"}}"#)).is_ok());
        let escaped = format!(r#"a\"[{}"#, "[".repeat(500));
        assert!(parse_line(&format!(r#"{{"type":"a","s":"{escaped}"}}"#)).is_ok());
    }

    #[test]
    fn strict_json_rejects_trailing_garbage_and_comments() {
        assert!(parse_line(r#"{"type":"a"} x"#).is_err());
        assert!(parse_line(r#"{"type":"a"} // c"#).is_err());
    }

    #[test]
    fn non_objects_and_blank_lines_are_errors() {
        for line in ["", "   ", "[]", "\"x\"", "null", "42"] {
            assert!(parse_line(line).is_err(), "{line:?}");
        }
    }

    #[test]
    fn duplicate_keys_keep_the_last_value() {
        let map = parse_line(r#"{"type":"a","k":1,"k":2}"#).unwrap();
        assert_eq!(map["k"], Value::from(2));
    }

    #[test]
    fn raw_text_keeps_key_order() {
        let line = r#"{"b":1,"a":"x","c":[true]}"#;
        let map = parse_line(line).unwrap();
        assert_eq!(raw_text(&Value::Object(map)), line);
    }

    // Kotlin difference (4): Gson keeps the literal of a number as written; serde_json
    // rewrites exponents, trailing zeros and integers beyond i64.
    #[test]
    fn raw_text_rewrites_unusual_number_literals() {
        let map = parse_line(r#"{"a":1e5,"b":1.50}"#).unwrap();
        assert_eq!(raw_text(&Value::Object(map)), r#"{"a":100000.0,"b":1.5}"#);
    }

    // Kotlin difference (3): Gson escapes U+2028 and U+2029 when writing; serde_json does not.
    #[test]
    fn line_separators_are_not_escaped() {
        let map = parse_line("{\"s\":\"a\\u2028b\"}").unwrap();
        assert!(raw_text(&Value::Object(map)).contains('\u{2028}'));
    }

    #[test]
    fn leading_bom_is_skipped() {
        let with = parse_line("\u{feff}{\"type\":\"a\"}").unwrap();
        let without = parse_line("{\"type\":\"a\"}").unwrap();
        assert_eq!(with, without);
    }

    // Kotlin difference (2): Gson turns a lone surrogate escape into a lone UTF-16 unit;
    // a Rust String cannot hold one, so serde_json rejects the line.
    #[test]
    fn lone_surrogate_is_a_broken_line() {
        assert!(parse_line("{\"type\":\"a\",\"s\":\"\\ud800\"}").is_err());
    }
}
