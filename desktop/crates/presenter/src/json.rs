//! Reading and writing the JSON the CLI sends (JsonRead.kt, JsonText.kt), the tree's rules for
//! values and keys (TreeRules.kt), and typed reads of an object's members (JsonFields.kt).
//!
//! Values are `serde_json::Value`. Two things Gson keeps cannot be held there, and the codec
//! already turns a line with either into a broken line: a number that is not finite as an `f64`
//! (`1e400`), and a lone surrogate (`"\ud800"`). [`parse`] refuses both.

use serde_json::{Map, Number, Value};

/// How deep the tree may nest: the objects and arrays on its deepest branch, the root being 1
/// (the webview's `MAX_DEPTH`). The renderer in the webview recurses, so the contract caps it.
pub const MAX_DEPTH: usize = 256;

/// How deep [`parse`] builds a value. Twice [`MAX_DEPTH`] on purpose: a value too deep *for the
/// tree* is still read whole, so the projection can fold it into its text.
pub const NESTING_LIMIT: usize = 2 * MAX_DEPTH;

/// What stands where a value nested deeper than [`NESTING_LIMIT`] was.
pub const TOO_DEEP: &str = "[nested deeper than 512 levels, not shown]";

/// Reads JSON text into a value, or gives `None` when the text is not one complete JSON value.
///
/// It reads as Gson's `JsonReader` does in strict mode: a leading BOM is skipped, whitespace is
/// space, tab, CR and LF, keywords are lowercase, a string holds no raw control character and
/// only JSON's escapes. A repeated key keeps its first place and its last value.
///
/// It keeps its own stack, so no input overflows the call stack. A container that would be open
/// inside [`NESTING_LIMIT`] others is not built: it is checked and stands as [`TOO_DEEP`], and
/// the rest of the text is read as usual. Losing the whole value instead would lose what sits
/// next to the deep part — a tool call's command beside a deep pad — and a call the user is asked
/// to approve must show what it runs.
pub fn parse(text: &str) -> Option<Value> {
    let mut reader = Reader {
        text: text.strip_prefix('\u{feff}').unwrap_or(text),
        pos: 0,
    };
    let mut open = Stack::default();
    loop {
        // A value starts here, or a container just opened closes empty.
        let complete = match reader.next_token()? {
            b'[' => {
                open.push(false);
                reader.eat(b']').then(|| open.close()).flatten()
            }
            b'{' => {
                open.push(true);
                if reader.eat(b'}') {
                    open.close()
                } else {
                    open.set_key(reader.key()?);
                    None
                }
            }
            first => Some(reader.scalar(first, open.skipping())?),
        };
        let Some(mut value) = complete else { continue };
        // Hand the value to its container, closing each container that ends right after it.
        loop {
            let Some(object) = open.top_is_object() else {
                return reader.at_end().then_some(value);
            };
            open.add(value);
            match (reader.next_token()?, object) {
                (b',', true) => {
                    open.set_key(reader.key()?);
                    break;
                }
                (b',', false) => break,
                (b'}', true) | (b']', false) => value = open.close()?,
                _ => return None,
            }
        }
    }
}

/// The containers still open while reading. Those inside [`NESTING_LIMIT`] others are not built:
/// only whether each is an object is kept, so the brackets can still be matched.
#[derive(Default)]
struct Stack {
    built: Vec<Open>,
    skipped: Vec<bool>,
}

enum Open {
    Array(Vec<Value>),
    /// The members so far and the name of the member being read.
    Object(Map<String, Value>, String),
}

impl Stack {
    fn push(&mut self, object: bool) {
        if self.built.len() == NESTING_LIMIT {
            self.skipped.push(object);
        } else if object {
            self.built.push(Open::Object(Map::new(), String::new()));
        } else {
            self.built.push(Open::Array(Vec::new()));
        }
    }

    fn skipping(&self) -> bool {
        !self.skipped.is_empty()
    }

    /// Whether the innermost container is an object; `None` when none is open.
    fn top_is_object(&self) -> Option<bool> {
        match (self.skipped.last(), self.built.last()) {
            (Some(object), _) => Some(*object),
            (None, Some(open)) => Some(matches!(open, Open::Object(..))),
            (None, None) => None,
        }
    }

    fn set_key(&mut self, key: String) {
        if let (false, Some(Open::Object(_, name))) = (self.skipping(), self.built.last_mut()) {
            *name = key;
        }
    }

    fn add(&mut self, value: Value) {
        if self.skipping() {
            return;
        }
        match self.built.last_mut() {
            Some(Open::Array(items)) => items.push(value),
            Some(Open::Object(members, name)) => {
                members.insert(std::mem::take(name), value);
            }
            None => {}
        }
    }

    /// Closes the innermost container. The outermost skipped one becomes [`TOO_DEEP`]; what a
    /// skipped one holds is dropped, so any value does there.
    fn close(&mut self) -> Option<Value> {
        if self.skipped.pop().is_some() {
            return Some(if self.skipped.is_empty() {
                Value::String(TOO_DEEP.to_owned())
            } else {
                Value::Null
            });
        }
        Some(match self.built.pop()? {
            Open::Array(items) => Value::Array(items),
            Open::Object(members, _) => Value::Object(members),
        })
    }
}

struct Reader<'a> {
    text: &'a str,
    pos: usize,
}

impl Reader<'_> {
    fn bytes(&self) -> &[u8] {
        self.text.as_bytes()
    }

    fn skip_whitespace(&mut self) {
        while let Some(b' ' | b'\t' | b'\r' | b'\n') = self.bytes().get(self.pos) {
            self.pos += 1;
        }
    }

    /// The next byte that is not whitespace, consumed.
    fn next_token(&mut self) -> Option<u8> {
        self.skip_whitespace();
        let byte = *self.bytes().get(self.pos)?;
        self.pos += 1;
        Some(byte)
    }

    /// Consumes `byte` if it comes next after whitespace.
    fn eat(&mut self, byte: u8) -> bool {
        self.skip_whitespace();
        let found = self.bytes().get(self.pos) == Some(&byte);
        if found {
            self.pos += 1;
        }
        found
    }

    fn at_end(&mut self) -> bool {
        self.skip_whitespace();
        self.pos == self.text.len()
    }

    /// A member's name and the colon after it.
    fn key(&mut self) -> Option<String> {
        if self.next_token()? != b'"' {
            return None;
        }
        let key = self.string()?;
        (self.next_token()? == b':').then_some(key)
    }

    /// The scalar whose first byte, `first`, was just consumed. A number in a skipped container
    /// is checked against the grammar but not converted, as Gson skips it.
    fn scalar(&mut self, first: u8, skipping: bool) -> Option<Value> {
        match first {
            b'"' => self.string().map(Value::String),
            b'-' | b'0'..=b'9' => self.number(skipping),
            b't' => self.keyword("rue", Value::Bool(true)),
            b'f' => self.keyword("alse", Value::Bool(false)),
            b'n' => self.keyword("ull", Value::Null),
            _ => None,
        }
    }

    fn keyword(&mut self, rest: &str, value: Value) -> Option<Value> {
        let found = self.text[self.pos..].starts_with(rest);
        self.pos += rest.len();
        found.then_some(value)
    }

    fn digits(&mut self) -> usize {
        let start = self.pos;
        while self.bytes().get(self.pos).is_some_and(u8::is_ascii_digit) {
            self.pos += 1;
        }
        self.pos - start
    }

    fn number(&mut self, skipping: bool) -> Option<Value> {
        let start = self.pos - 1;
        let first = if self.bytes()[start] == b'-' {
            let first = *self.bytes().get(self.pos)?;
            self.pos += 1;
            first
        } else {
            self.bytes()[start]
        };
        match first {
            b'0' => {}
            b'1'..=b'9' => {
                self.digits();
            }
            _ => return None,
        }
        if self.eat_byte(b'.') && self.digits() == 0 {
            return None;
        }
        if self.eat_byte(b'e') || self.eat_byte(b'E') {
            let _ = self.eat_byte(b'+') || self.eat_byte(b'-');
            if self.digits() == 0 {
                return None;
            }
        }
        if skipping {
            return Some(Value::Null);
        }
        serde_json::from_str::<Number>(&self.text[start..self.pos])
            .ok()
            .map(Value::Number)
    }

    fn eat_byte(&mut self, byte: u8) -> bool {
        let found = self.bytes().get(self.pos) == Some(&byte);
        if found {
            self.pos += 1;
        }
        found
    }

    /// The rest of a string whose opening quote was just consumed.
    fn string(&mut self) -> Option<String> {
        let mut out = String::new();
        let mut run = self.pos;
        loop {
            let byte = *self.bytes().get(self.pos)?;
            match byte {
                b'"' => {
                    out.push_str(&self.text[run..self.pos]);
                    self.pos += 1;
                    return Some(out);
                }
                b'\\' => {
                    out.push_str(&self.text[run..self.pos]);
                    self.pos += 1;
                    out.push(self.escape()?);
                    run = self.pos;
                }
                0x00..=0x1f => return None,
                _ => self.pos += 1,
            }
        }
    }

    /// The character an escape stands for; the backslash was just consumed.
    fn escape(&mut self) -> Option<char> {
        let byte = *self.bytes().get(self.pos)?;
        self.pos += 1;
        Some(match byte {
            b'"' => '"',
            b'\\' => '\\',
            b'/' => '/',
            b'b' => '\u{8}',
            b'f' => '\u{c}',
            b'n' => '\n',
            b'r' => '\r',
            b't' => '\t',
            b'u' => {
                let unit = self.hex_unit()?;
                if (0xd800..0xdc00).contains(&unit) {
                    // A high surrogate must be followed by an escaped low one.
                    if !self.text[self.pos..].starts_with("\\u") {
                        return None;
                    }
                    self.pos += 2;
                    let low = self.hex_unit()?;
                    return char::decode_utf16([unit, low]).next()?.ok();
                }
                char::from_u32(u32::from(unit))?
            }
            _ => return None,
        })
    }

    fn hex_unit(&mut self) -> Option<u16> {
        let hex = self.text.get(self.pos..self.pos + 4)?;
        if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        self.pos += 4;
        u16::from_str_radix(hex, 16).ok()
    }
}

/// The compact JSON text of a value: members in their order, and nothing escaped that RFC 8259
/// does not require — quotes, backslashes and control characters — so Japanese text stays
/// readable. This is what `JsonText.compact` writes; serde_json escapes exactly that set, the
/// `compact_escapes_only_what_json_requires` test pins it. Numbers are serde_json's.
pub fn compact(value: &Value) -> String {
    value.to_string()
}

const UNSAFE_SEGMENTS: [&str; 3] = ["__proto__", "constructor", "prototype"];

/// Whether `key` can name an entity in a collection: an op addresses the entity through its key,
/// so the key must be a path segment — not empty, not read as an array index, not one that
/// reaches a prototype.
pub fn is_key(key: &str) -> bool {
    let index = key == "0"
        || (!key.starts_with('0') && !key.is_empty() && key.bytes().all(|b| b.is_ascii_digit()));
    !key.is_empty() && !index && !UNSAFE_SEGMENTS.contains(&key)
}

/// Keys that reach the prototype once the webview copies or merges a value: `__proto__`, and
/// `constructor` holding an object with a `prototype` key.
fn is_unsafe_member(key: &str, value: &Value) -> bool {
    key == "__proto__"
        || (key == "constructor"
            && value
                .as_object()
                .is_some_and(|o| o.contains_key("prototype")))
}

/// Whether `value` can go where `room` levels are left (`MAX_DEPTH` minus the level of the node
/// that holds it): no more than `room` objects and arrays on any branch and no unsafe member
/// anywhere inside. Kotlin also refuses a number that is not finite as a double; a serde_json
/// number always is. The walk keeps its own stack and stops at the first value that does not fit.
pub fn fits(value: &Value, room: usize) -> bool {
    let mut pending = vec![(value, 1)];
    while let Some((next, level)) = pending.pop() {
        match next {
            Value::Object(members) => {
                if level > room || members.iter().any(|(k, v)| is_unsafe_member(k, v)) {
                    return false;
                }
                pending.extend(members.values().map(|v| (v, level + 1)));
            }
            Value::Array(items) => {
                if level > room {
                    return false;
                }
                pending.extend(items.iter().map(|v| (v, level + 1)));
            }
            _ => {}
        }
    }
    true
}

/// Reading the CLI's content: a member of the wrong type reads as absent, so an odd line changes
/// nothing.
pub trait JsonFields {
    fn string(&self, key: &str) -> Option<&str>;
    fn obj(&self, key: &str) -> Option<&Map<String, Value>>;
    fn array(&self, key: &str) -> Option<&Vec<Value>>;
    /// A small non-negative integer member that fits Kotlin's `Int`, such as a block index.
    fn index(&self, key: &str) -> Option<i64>;
    /// A non-negative integer member that fits Kotlin's `Long`, such as a token count.
    fn count(&self, key: &str) -> Option<i64>;
    fn number(&self, key: &str) -> Option<f64>;
}

impl JsonFields for Map<String, Value> {
    fn string(&self, key: &str) -> Option<&str> {
        self.get(key)?.as_str()
    }

    fn obj(&self, key: &str) -> Option<&Map<String, Value>> {
        self.get(key)?.as_object()
    }

    fn array(&self, key: &str) -> Option<&Vec<Value>> {
        self.get(key)?.as_array()
    }

    fn index(&self, key: &str) -> Option<i64> {
        self.count(key).filter(|n| *n <= i64::from(i32::MAX))
    }

    fn count(&self, key: &str) -> Option<i64> {
        self.get(key)?.as_i64().filter(|n| *n >= 0)
    }

    fn number(&self, key: &str) -> Option<f64> {
        self.get(key)?.as_f64()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn deep_text(depth: usize) -> String {
        format!("{}{}", "[".repeat(depth), "]".repeat(depth))
    }

    // `depth` arrays, the innermost holding `inside` when there is one.
    fn deep(depth: usize, inside: Option<Value>) -> Value {
        let mut value = Value::Array(inside.into_iter().collect());
        for _ in 1..depth {
            value = Value::Array(vec![value]);
        }
        value
    }

    // `depth` objects: `{"a":{"a":…{}}}`.
    fn nested(depth: usize) -> Value {
        let mut value = json!({});
        for _ in 1..depth {
            value = json!({ "a": value });
        }
        value
    }

    fn too_deep() -> Option<Value> {
        Some(Value::String(TOO_DEEP.into()))
    }

    #[test]
    fn objects_compare_regardless_of_member_order() {
        let a = parse(r#"{"x":1,"y":["s",null]}"#).unwrap();
        let b = parse(r#"{"y":["s",null],"x":1}"#).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, json!({ "x": 2 }));
        assert_ne!(parse("[true,false]"), parse("[false,true]"));
    }

    #[test]
    fn parse_reads_numbers_by_the_json_grammar() {
        for bad in [
            "01", "1.", ".5", "+1", "NaN", "Infinity", "1e", "--1", "0x10", "-", "1.e5",
        ] {
            assert_eq!(parse(bad), None, "{bad}");
        }
        for (good, value) in [
            ("0", json!(0)),
            ("12", json!(12)),
            ("-3.25", json!(-3.25)),
            ("6.02E+23", json!(6.02e23)),
            ("1E-7", json!(1e-7)),
            (
                "12345678901234567890",
                json!(12_345_678_901_234_567_890_u64),
            ),
            ("1e-400", json!(0.0)),
        ] {
            assert_eq!(parse(good), Some(value), "{good}");
        }
        assert!(parse("-0").unwrap().is_number());
        assert!(parse("123456789012345678901234567890").unwrap().is_f64());
    }

    // Kotlin difference: Gson keeps `1e400` as text; a serde_json number must be a finite f64, so
    // the value is unreadable, as the codec already treats such a line.
    #[test]
    fn parse_refuses_a_number_that_is_not_finite_as_a_double() {
        assert_eq!(parse("1e400"), None);
        assert_eq!(parse(r#"{"n":-1E400}"#), None);
    }

    #[test]
    fn compact_escapes_only_what_json_requires() {
        let text = "\"\\/\n\r\t\u{8}\u{c}\u{1}\u{1f}\u{7f}あ😀\u{2028}x";
        assert_eq!(
            compact(&Value::String(text.into())),
            "\"\\\"\\\\/\\n\\r\\t\\b\\f\\u0001\\u001f\u{7f}あ😀\u{2028}x\""
        );
    }

    #[test]
    fn compact_keeps_member_order_and_prints_empties_inline() {
        let value = parse(r#"{"b":[1,{}],"a":[],"c":{"d":true,"e":null}}"#).unwrap();
        assert_eq!(
            compact(&value),
            r#"{"b":[1,{}],"a":[],"c":{"d":true,"e":null}}"#
        );
    }

    #[test]
    fn parse_gives_back_what_compact_printed() {
        let value = json!({
            "text": "改行\nと \"引用\" と \\ と \u{0}",
            "numbers": [-0.0, 1.5, 12_345_678_901_234_567_890_u64, -7],
            "flags": [true, false, null],
        });
        assert_eq!(parse(&compact(&value)), Some(value));
    }

    #[test]
    fn parse_keeps_proto_as_an_own_key_and_a_repeated_key_keeps_its_first_place_and_last_value() {
        let read = parse(r#"{"__proto__":{"a":1},"k":1,"k":2,"z":0}"#).unwrap();
        let read = read.as_object().unwrap();
        assert!(read.contains_key("__proto__"));
        assert_eq!(read["k"], json!(2));
        assert_eq!(
            read.keys().map(String::as_str).collect::<Vec<_>>(),
            ["__proto__", "k", "z"]
        );
    }

    #[test]
    fn parse_gives_none_for_what_is_not_one_json_value() {
        for bad in [
            "",
            " ",
            "{",
            "[1,]",
            "{\"a\":}",
            "nul",
            "{} {}",
            "[1] x",
            "'a'",
            "{a:1}",
            "NaN",
            "01",
            "\"\\x\"",
            "[\"\u{0}\"]",
            "\"\u{1f}\"",
            "TRUE",
            "Null",
            "[1 2]",
            "{\"a\" 1}",
            "{,}",
            "[}",
            "{]",
            "\"\\u12\"",
            "\"\\uzzzz\"",
            "\"\\'\"",
            "// c\n1",
            "\"open",
        ] {
            assert_eq!(parse(bad), None, "{bad:?}");
        }
        assert_eq!(parse(" \"a\" "), Some(json!("a")));
        assert_eq!(parse("null"), Some(Value::Null));
        assert_eq!(parse("\t[ 1 ,\r\n{ } ]\n"), Some(json!([1, {}])));
    }

    #[test]
    fn parse_rejects_trailing_garbage_and_two_values() {
        assert_eq!(parse("{} x"), None);
        assert_eq!(parse("1 2"), None);
        assert_eq!(parse(""), None);
    }

    #[test]
    fn parse_reads_escapes_and_skips_a_leading_bom_as_gson_does() {
        assert_eq!(
            parse(r#""\"\\\/\b\f\n\r\t\u0041\u00e9\uD83D\uDE00""#),
            Some(json!("\"\\/\u{8}\u{c}\n\r\tAé😀"))
        );
        assert_eq!(parse("\u{feff}{\"a\":1}"), Some(json!({ "a": 1 })));
    }

    // Kotlin difference: Gson keeps a lone surrogate as a lone UTF-16 unit, which a Rust String
    // cannot hold; the value is unreadable, as the codec already treats such a line.
    #[test]
    fn parse_refuses_a_lone_surrogate_escape() {
        for bad in [
            r#""\ud800""#,
            r#""\udc00""#,
            r#""\ud800x""#,
            r#""\ud800\u0041""#,
        ] {
            assert_eq!(parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn parse_replaces_values_nested_past_the_limit_and_reads_the_rest() {
        assert_eq!(TOO_DEEP, "[nested deeper than 512 levels, not shown]");
        assert_eq!((MAX_DEPTH, NESTING_LIMIT), (256, 512));
        assert_eq!(parse(&deep_text(300)), Some(deep(300, None)));
        // The outermost container is level 1: 512 open containers read, the 513th is replaced.
        assert_eq!(parse(&deep_text(512)), Some(deep(512, None)));
        assert_eq!(parse(&deep_text(513)), Some(deep(512, too_deep())));
        assert_eq!(
            parse(&format!("{}{{}}{}", "[".repeat(512), "]".repeat(512))),
            Some(deep(512, too_deep()))
        );

        // The outer object takes a level, so `pad` holds 511 arrays and the marker.
        let line = format!(r#"{{"cmd":"ls","pad":{}}}"#, deep_text(512));
        let read = parse(&line).unwrap();
        assert_eq!(read["cmd"], json!("ls"));
        assert_eq!(read["pad"], deep(511, too_deep()));

        let line = format!(r#"{{"a":{},"b":1}}"#, deep_text(600));
        assert_eq!(parse(&line).unwrap()["b"], json!(1), "the rest is read");

        let skipped = format!(
            r#"{}{{"n":1e400,"s":"x"}}{}"#,
            "[".repeat(512),
            "]".repeat(512)
        );
        assert_eq!(
            parse(&skipped),
            Some(deep(512, too_deep())),
            "a skipped number is not converted"
        );

        let broken = format!(r#"{{"a":{}}}"#, &deep_text(600)[..1199]);
        assert_eq!(
            parse(&broken),
            None,
            "text that is not JSON is still unreadable"
        );
        let mismatched = format!("{}}}{}", "[".repeat(600), "]".repeat(599));
        assert_eq!(
            parse(&mismatched),
            None,
            "brackets match even where skipped"
        );
    }

    #[test]
    fn parse_survives_a_hundred_thousand_levels() {
        assert_eq!(parse(&deep_text(100_000)), Some(deep(512, too_deep())));
        assert_eq!(parse(&deep_text(200_000)), Some(deep(512, too_deep())));
    }

    #[test]
    fn a_key_is_a_path_segment_the_webview_accepts() {
        for key in [
            "a",
            "toolu_01",
            "01",
            "-1",
            "1.5",
            "send-1",
            "msg:0",
            "id:7",
            " ",
            "__proto",
            "Constructor",
        ] {
            assert!(is_key(key), "{key}");
        }
        for key in [
            "",
            "0",
            "7",
            "12",
            "9007199254740993",
            "__proto__",
            "constructor",
            "prototype",
        ] {
            assert!(!is_key(key), "{key}");
        }
    }

    #[test]
    fn a_value_fits_in_exactly_as_many_levels_as_it_nests() {
        assert!(fits(&json!("leaf"), 0), "a primitive takes no level");
        assert!(fits(&json!({}), 1));
        assert!(!fits(&json!({}), 0));
        assert!(fits(&nested(10), 10));
        assert!(!fits(&nested(11), 10));
        assert!(fits(&deep(10, None), 10));
        assert!(!fits(&deep(11, None), 10));
        let wide = json!({ "shallow": {}, "deep": nested(5) });
        assert!(fits(&wide, 6));
        assert!(!fits(&wide, 5), "the deepest branch decides");
    }

    #[test]
    fn a_value_with_a_member_that_reaches_the_prototype_does_not_fit_anywhere() {
        assert!(!fits(
            &json!({ "list": [{ "__proto__": null }] }),
            MAX_DEPTH
        ));
        assert!(!fits(
            &json!({ "constructor": { "prototype": {} } }),
            MAX_DEPTH
        ));
        assert!(fits(&json!({ "constructor": { "name": null } }), MAX_DEPTH));
        assert!(fits(&json!({ "prototype": {} }), MAX_DEPTH));
        assert!(fits(&json!({ "constructor": "prototype" }), MAX_DEPTH));
    }

    // Kotlin's `fits` also refuses a number that is not finite as a double; a serde_json number
    // always is (`parse_refuses_a_number_that_is_not_finite_as_a_double`).
    #[test]
    fn every_number_a_value_can_hold_fits() {
        assert!(fits(&parse("1e-400").unwrap(), 0));
        assert!(fits(&parse("123456789012345678901234567890").unwrap(), 0));
    }

    #[test]
    fn json_fields_read_a_member_of_the_wrong_type_as_absent() {
        let value = json!({
            "s": "x", "o": {"k": 1}, "a": [1], "i": 3, "neg": -1, "f": 1.0,
            "big": 3_000_000_000_u64, "huge": 18_000_000_000_000_000_000_u64, "n": 2.5,
        });
        let map = value.as_object().unwrap();
        assert_eq!(map.string("s"), Some("x"));
        assert_eq!(map.string("o"), None);
        assert_eq!(map.obj("o").map(|o| o.len()), Some(1));
        assert_eq!(map.obj("a"), None);
        assert_eq!(map.array("a").map(Vec::len), Some(1));
        assert_eq!(map.array("missing"), None);
        assert_eq!(map.index("i"), Some(3));
        assert_eq!(map.index("neg"), None);
        assert_eq!(map.index("f"), None, "Kotlin's toIntOrNull refuses 1.0");
        assert_eq!(map.index("big"), None, "an index is an Int");
        assert_eq!(map.index("s"), None);
        assert_eq!(map.count("big"), Some(3_000_000_000));
        assert_eq!(map.count("neg"), None);
        assert_eq!(map.count("huge"), None, "a count is a Long");
        assert_eq!(map.count("f"), None);
        assert_eq!(map.number("n"), Some(2.5));
        assert_eq!(map.number("i"), Some(3.0));
        assert_eq!(map.number("s"), None);
    }
}
