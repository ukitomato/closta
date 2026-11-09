//! Typed access to one line's fields, reading values the way Gson's `JsonPrimitive` does.
//! Mirrors `Fields` in StreamJsonCodec.kt.
//!
//! A field is read as required only where every recorded line of that kind carries it. A JSON
//! `null` counts as absent. Where Gson's `asLong`, `asInt` or `asDouble` throws
//! `NumberFormatException` the accessors return [`FieldError::NotANumber`], including the `_or_null`
//! ones, so the caller can carry both errors to `UnknownKind` with `?`.

use super::json::raw_text;
use closta_model::RawJson;
use serde_json::{Map, Number, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FieldError {
    Missing { name: String },
    NotANumber { name: String },
}

pub(crate) struct Fields<'a>(&'a Map<String, Value>);

impl<'a> Fields<'a> {
    pub(crate) fn new(map: &'a Map<String, Value>) -> Self {
        Self(map)
    }

    pub(crate) fn text(&self, name: &str) -> Result<String, FieldError> {
        self.text_or_null(name).ok_or_else(|| missing(name))
    }

    /// A number is written the way serde_json writes it; see [`number_low_64`] for why this can
    /// differ from Gson's `asString`, which keeps the literal as read.
    pub(crate) fn text_or_null(&self, name: &str) -> Option<String> {
        match self.primitive(name)? {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            _ => None,
        }
    }

    pub(crate) fn whole(&self, name: &str) -> Result<i64, FieldError> {
        self.whole_or_null(name)?.ok_or_else(|| missing(name))
    }

    pub(crate) fn whole_or_null(&self, name: &str) -> Result<Option<i64>, FieldError> {
        self.primitive(name)
            .map(|v| match v {
                Value::Number(n) => Ok(number_low_64(n)),
                Value::String(s) => s.parse::<i64>().map_err(|_| not_a_number(name)),
                _ => Err(not_a_number(name)),
            })
            .transpose()
    }

    pub(crate) fn count(&self, name: &str) -> Result<i32, FieldError> {
        self.count_or_null(name)?.ok_or_else(|| missing(name))
    }

    pub(crate) fn count_or_null(&self, name: &str) -> Result<Option<i32>, FieldError> {
        self.primitive(name)
            .map(|v| match v {
                // The low 32 bits of the truncated value, which is what `intValue()` gives.
                Value::Number(n) => Ok(number_low_64(n) as i32),
                Value::String(s) => s.parse::<i32>().map_err(|_| not_a_number(name)),
                _ => Err(not_a_number(name)),
            })
            .transpose()
    }

    /// A NaN read here (from the string `"NaN"`) makes any state holding it unequal to itself,
    /// because `NaN != NaN`; do not compare states that may carry one with `PartialEq`.
    pub(crate) fn money(&self, name: &str) -> Result<f64, FieldError> {
        match self.primitive(name) {
            None => Err(missing(name)),
            Some(Value::Number(n)) => n.as_f64().ok_or_else(|| not_a_number(name)),
            Some(Value::String(s)) => java_parse_double(s).ok_or_else(|| not_a_number(name)),
            Some(_) => Err(not_a_number(name)),
        }
    }

    pub(crate) fn flag(&self, name: &str) -> Result<bool, FieldError> {
        self.flag_or_null(name)?.ok_or_else(|| missing(name))
    }

    /// True for the boolean `true` and for any string equal to `true` ignoring case; false otherwise.
    pub(crate) fn flag_or_null(&self, name: &str) -> Result<Option<bool>, FieldError> {
        Ok(self.primitive(name).map(|v| match v {
            Value::Bool(b) => *b,
            Value::String(s) => s.eq_ignore_ascii_case("true"),
            _ => false,
        }))
    }

    /// The strings of an array, leaving out any entry that is not one; `None` when the field is
    /// absent or not an array.
    pub(crate) fn texts_or_null(&self, name: &str) -> Option<Vec<String>> {
        match self.present(name)? {
            Value::Array(items) => Some(
                items
                    .iter()
                    .filter_map(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        _ => None,
                    })
                    .collect(),
            ),
            _ => None,
        }
    }

    /// An array of strings, one per line. An entry that Gson's `asString` would throw on (an
    /// object, or a null) is an error here.
    ///
    /// Kotlin difference (1): Kotlin throws `UnsupportedOperationException` for such input; here
    /// it is `Missing`, and both end as `UnknownKind`.
    pub(crate) fn lines(&self, name: &str) -> Result<String, FieldError> {
        let Some(Value::Array(items)) = self.present(name) else {
            return Err(missing(name));
        };
        let texts: Option<Vec<String>> = items.iter().map(gson_as_string).collect();
        texts.map(|t| t.join("\n")).ok_or_else(|| missing(name))
    }

    pub(crate) fn raw(&self, name: &str) -> Result<RawJson, FieldError> {
        self.raw_or_null(name).ok_or_else(|| missing(name))
    }

    pub(crate) fn raw_or_null(&self, name: &str) -> Option<RawJson> {
        self.present(name).map(|v| RawJson(raw_text(v)))
    }

    /// A nested object, so a `control_request` can read the typed scalars inside `request`.
    pub(crate) fn nested(&self, name: &str) -> Option<&'a Map<String, Value>> {
        match self.present(name)? {
            Value::Object(m) => Some(m),
            _ => None,
        }
    }

    fn primitive(&self, name: &str) -> Option<&'a Value> {
        self.present(name)
            .filter(|v| matches!(v, Value::String(_) | Value::Number(_) | Value::Bool(_)))
    }

    fn present(&self, name: &str) -> Option<&'a Value> {
        self.0.get(name).filter(|v| !v.is_null())
    }
}

fn missing(name: &str) -> FieldError {
    FieldError::Missing { name: name.into() }
}

fn not_a_number(name: &str) -> FieldError {
    FieldError::NotANumber { name: name.into() }
}

/// Gson's `JsonElement.getAsString` for the elements that have one: a primitive, or an array of
/// exactly one such element.
fn gson_as_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Array(items) if items.len() == 1 => gson_as_string(&items[0]),
        _ => None,
    }
}

/// Number literal fidelity (Kotlin difference 4, widened): serde_json is used without
/// `arbitrary_precision`, so a number's literal is not kept. Integers beyond u64 are rounded to
/// f64 before wrapping, the Gson 10000-character limit on a literal does not apply, and `text`
/// prints a number in serde_json's form (`1e5` as `100000.0`). Gson differs only for literals
/// that serde_json rewrites; every value that is exact in f64 matches `BigDecimal`.
///
/// The low 64 bits of a number truncated toward zero, as `BigDecimal.longValue()` gives. Integers
/// beyond i64 wrap; a float beyond 2^63 is its exact integer value, whose low bits come from the
/// mantissa shifted into place.
fn number_low_64(n: &Number) -> i64 {
    if let Some(i) = n.as_i64() {
        return i;
    }
    if let Some(u) = n.as_u64() {
        return u as i64;
    }
    let t = n.as_f64().unwrap_or(0.0).trunc();
    if t.abs() < 9_223_372_036_854_775_808.0 {
        return t as i64;
    }
    let bits = t.to_bits();
    let shift = ((bits >> 52) & 0x7ff) as i64 - 1075;
    let mantissa = (bits & ((1 << 52) - 1)) | (1 << 52);
    let magnitude = if shift >= 64 { 0 } else { mantissa << shift };
    if t < 0.0 {
        magnitude.wrapping_neg() as i64
    } else {
        magnitude as i64
    }
}

/// `Double.parseDouble` for the forms JSON strings can plausibly hold: surrounding whitespace, a
/// sign, `NaN`, `Infinity`, decimal digits with an optional exponent and a trailing `f` or `d`.
/// Hexadecimal floats are not read.
fn java_parse_double(s: &str) -> Option<f64> {
    let t = s.trim_matches(|c: char| c <= ' ');
    let (negative, body) = match t.as_bytes().first()? {
        b'-' => (true, &t[1..]),
        b'+' => (false, &t[1..]),
        _ => (false, t),
    };
    let magnitude = match body {
        "NaN" => return Some(f64::NAN),
        "Infinity" => f64::INFINITY,
        _ => {
            let digits = body.strip_suffix(['f', 'F', 'd', 'D']).unwrap_or(body);
            if !digits
                .chars()
                .all(|c| c.is_ascii_digit() || matches!(c, '.' | 'e' | 'E' | '+' | '-'))
            {
                return None;
            }
            digits.parse::<f64>().ok()?
        }
    };
    Some(if negative { -magnitude } else { magnitude })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Map, Value};

    fn obj(json: &str) -> Map<String, Value> {
        match serde_json::from_str(json).unwrap() {
            Value::Object(m) => m,
            _ => panic!("not an object"),
        }
    }

    fn not_a_number(name: &str) -> FieldError {
        FieldError::NotANumber { name: name.into() }
    }

    #[test]
    fn text_reads_numbers_and_booleans_as_strings() {
        let m = obj(r#"{"u":5,"b":true}"#);
        let f = Fields::new(&m);
        assert_eq!(f.text("u").unwrap(), "5");
        assert_eq!(f.text("b").unwrap(), "true");
    }

    #[test]
    fn whole_and_count_coerce_like_gson() {
        let m = obj(
            r#"{"s":"12","d":1.5,"neg":-1.5,"big":1e20,"u64":18446744073709551615,"i32":4294967297,"bigint":100000000000000000000,"e":1e5}"#,
        );
        let f = Fields::new(&m);
        assert_eq!(f.whole("s").unwrap(), 12);
        assert_eq!(f.count("s").unwrap(), 12);
        assert_eq!(f.whole("d").unwrap(), 1);
        assert_eq!(f.count("d").unwrap(), 1);
        assert_eq!(f.whole("neg").unwrap(), -1);
        // BigDecimal("1E+20").longValue() = 100000000000000000000 mod 2^64 = 7766279631452241920
        assert_eq!(f.whole("big").unwrap(), 7_766_279_631_452_241_920);
        assert_eq!(f.count("big").unwrap(), 1_661_992_960);
        assert_eq!(f.whole("u64").unwrap(), -1);
        assert_eq!(f.count("u64").unwrap(), -1);
        assert_eq!(f.count("i32").unwrap(), 1);
        assert_eq!(f.whole("i32").unwrap(), 4_294_967_297);
        assert_eq!(f.whole("e").unwrap(), 100_000);
        assert_eq!(f.whole("bigint").unwrap(), 7_766_279_631_452_241_920);
        assert_eq!(f.count("bigint").unwrap(), 1_661_992_960);
    }

    #[test]
    fn unreadable_numbers_are_not_a_number() {
        let m = obj(r#"{"a":"abc","b":"1.5","c":true}"#);
        let f = Fields::new(&m);
        for k in ["a", "b", "c"] {
            assert_eq!(f.whole(k), Err(not_a_number(k)));
            assert_eq!(f.whole_or_null(k), Err(not_a_number(k)));
            assert_eq!(f.count(k), Err(not_a_number(k)));
            assert_eq!(f.count_or_null(k), Err(not_a_number(k)));
        }
    }

    #[test]
    fn money_accepts_nan_and_infinity_strings() {
        let m = obj(r#"{"a":"NaN","b":"Infinity","c":1.25,"d":"-Infinity","e":"x"}"#);
        let f = Fields::new(&m);
        assert!(f.money("a").unwrap().is_nan());
        assert_eq!(f.money("b").unwrap(), f64::INFINITY);
        assert_eq!(f.money("c").unwrap(), 1.25);
        assert_eq!(f.money("d").unwrap(), f64::NEG_INFINITY);
        assert_eq!(f.money("e"), Err(not_a_number("e")));
    }

    #[test]
    fn flag_is_true_only_for_true() {
        let m = obj(r#"{"a":true,"b":"TRUE","c":1,"d":"yes","e":false}"#);
        let f = Fields::new(&m);
        assert_eq!(f.flag("a"), Ok(true));
        assert_eq!(f.flag("b"), Ok(true));
        assert_eq!(f.flag("c"), Ok(false));
        assert_eq!(f.flag("d"), Ok(false));
        assert_eq!(f.flag_or_null("e"), Ok(Some(false)));
    }

    #[test]
    fn null_counts_as_missing() {
        let m = obj(r#"{"k":null}"#);
        let f = Fields::new(&m);
        assert_eq!(f.text_or_null("k"), None);
        assert_eq!(f.text("k"), Err(FieldError::Missing { name: "k".into() }));
        assert_eq!(f.whole_or_null("k"), Ok(None));
        assert_eq!(
            f.whole("nope"),
            Err(FieldError::Missing {
                name: "nope".into()
            })
        );
        assert_eq!(f.raw_or_null("k"), None);
        assert!(f.nested("k").is_none());
    }

    #[test]
    fn lines_joins_with_newline() {
        let m = obj(r#"{"errors":["a","b"],"mixed":["a",2],"objs":[{}]}"#);
        let f = Fields::new(&m);
        assert_eq!(f.lines("errors").unwrap(), "a\nb");
        assert_eq!(f.lines("mixed").unwrap(), "a\n2");
        // Kotlin difference (1): Gson throws here, which the codec turns into UnknownKind.
        assert!(f.lines("objs").is_err());
        assert!(f.lines("nope").is_err());
    }

    #[test]
    fn texts_raw_and_nested() {
        let m = obj(r#"{"t":["a",1,"b"],"o":{"x":1},"r":{"b":1,"a":[]}}"#);
        let f = Fields::new(&m);
        assert_eq!(
            f.texts_or_null("t"),
            Some(vec!["a".to_string(), "b".to_string()])
        );
        assert_eq!(f.texts_or_null("o"), None);
        assert_eq!(f.raw("r").unwrap(), RawJson(r#"{"b":1,"a":[]}"#.into()));
        assert!(f.nested("o").is_some());
        assert!(f.nested("t").is_none());
    }
}
