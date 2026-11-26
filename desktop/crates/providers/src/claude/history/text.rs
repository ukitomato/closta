//! Kotlin and Java whitespace rules, the same sets as the presenter's `text` module.

/// Kotlin's `Char.isWhitespace`: U+0009..U+000D, U+001C..U+001F and the categories Zs, Zl and Zp.
/// Unlike Rust's `char::is_whitespace`, U+0085 is not whitespace and U+001C..U+001F are.
pub(crate) fn is_kt_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{9}'..='\u{d}'
            | '\u{1c}'..='\u{20}'
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
    )
}

/// Kotlin's `trim`.
pub(crate) fn kt_trim(text: &str) -> &str {
    text.trim_matches(is_kt_whitespace)
}

/// Kotlin's `trimStart`.
pub(crate) fn kt_trim_start(text: &str) -> &str {
    text.trim_start_matches(is_kt_whitespace)
}

/// Kotlin's `isBlank`.
pub(crate) fn kt_is_blank(text: &str) -> bool {
    text.chars().all(is_kt_whitespace)
}

/// The characters of Java regex `\s`: space, tab, newline, vertical tab, form feed and carriage return.
pub(crate) fn is_java_space(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\n' | '\x0B' | '\x0C' | '\r')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kotlin_whitespace_is_the_presenters() {
        for c in ['\u{3000}', '\u{a0}', '\u{1c}', ' ', '\t', '\r'] {
            assert!(is_kt_whitespace(c), "U+{:04X}", c as u32);
        }
        for c in ['\u{85}', 'x', '\u{200b}'] {
            assert!(!is_kt_whitespace(c), "U+{:04X}", c as u32);
        }
        assert_eq!(kt_trim("\u{3000} a b\u{a0}"), "a b");
        assert_eq!(kt_trim_start("\u{3000} a \u{a0}"), "a \u{a0}");
        assert!(kt_is_blank(" \u{1c}\u{3000}"));
        assert!(!kt_is_blank(" \u{85}"));
    }

    #[test]
    fn java_space_is_six_ascii_characters() {
        for c in [' ', '\t', '\n', '\x0B', '\x0C', '\r'] {
            assert!(is_java_space(c), "U+{:04X}", c as u32);
        }
        for c in ['\u{3000}', '\u{a0}', '\u{1c}', '\u{85}', 'x'] {
            assert!(!is_java_space(c), "U+{:04X}", c as u32);
        }
    }
}
