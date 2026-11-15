//! Kotlin's rules for text, which the presenter must keep to show what the JetBrains client
//! shows: lengths and cuts count UTF-16 units, whitespace is `Char.isWhitespace`, and lines end
//! at `\r\n`, `\n` or `\r`. Use these instead of `str::len`, `str::trim` and `str::lines`.

/// The length of `text` in UTF-16 units, Kotlin's `String.length`.
pub fn utf16_len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

/// The first `n` UTF-16 units of `text`, Kotlin's `take`. Where Kotlin would keep the first half
/// of a surrogate pair, the cut moves before the pair: a `str` cannot hold half of one.
pub fn take_utf16(text: &str, n: usize) -> &str {
    let mut units = 0;
    for (at, c) in text.char_indices() {
        units += c.len_utf16();
        if units > n {
            return &text[..at];
        }
    }
    text
}

/// The last `n` UTF-16 units of `text`, Kotlin's `takeLast`. Where Kotlin would keep the second
/// half of a surrogate pair, the cut moves after the pair.
pub fn take_last_utf16(text: &str, n: usize) -> &str {
    let mut units = 0;
    for (at, c) in text.char_indices().rev() {
        units += c.len_utf16();
        if units > n {
            return &text[at + c.len_utf8()..];
        }
    }
    text
}

/// Kotlin's `Char.isWhitespace`: Java's `Character.isWhitespace` or `Character.isSpaceChar`.
/// That is U+0009..U+000D, U+001C..U+001F and the categories Zs, Zl and Zp. Unlike Rust's
/// `char::is_whitespace`, U+0085 is not whitespace and U+001C..U+001F are.
pub fn is_kt_whitespace(c: char) -> bool {
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

/// `text` without leading and trailing Kotlin whitespace, Kotlin's `trim`.
pub fn kt_trim(text: &str) -> &str {
    text.trim_matches(is_kt_whitespace)
}

/// Whether `text` is empty or Kotlin whitespace only, Kotlin's `isBlank`.
pub fn kt_is_blank(text: &str) -> bool {
    text.chars().all(is_kt_whitespace)
}

/// The lines of `text`, Kotlin's `lines`: a line ends at `\r\n`, `\n` or `\r`, and text that ends
/// with a line break has an empty last line.
pub fn kt_lines(text: &str) -> impl Iterator<Item = &str> {
    let mut rest = Some(text);
    std::iter::from_fn(move || {
        let current = rest?;
        match current.find(['\r', '\n']) {
            None => {
                rest = None;
                Some(current)
            }
            Some(at) => {
                let ending = if current[at..].starts_with("\r\n") {
                    2
                } else {
                    1
                };
                rest = Some(&current[at + ending..]);
                Some(&current[..at])
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_len_counts_a_surrogate_pair_as_two() {
        assert_eq!(utf16_len(""), 0);
        assert_eq!(utf16_len("aあ"), 2);
        assert_eq!(utf16_len("a😀b"), 4);
    }

    // Kotlin's `take` and `takeLast` count UTF-16 units and may keep half of a surrogate pair; a
    // Rust `String` cannot hold half a pair, so the cut moves to the pair's edge and drops it.
    #[test]
    fn take_utf16_never_splits_a_surrogate_pair() {
        let text = "a😀b";
        assert_eq!(take_utf16(text, 0), "");
        assert_eq!(take_utf16(text, 1), "a");
        assert_eq!(take_utf16(text, 2), "a");
        assert_eq!(take_utf16(text, 3), "a😀");
        assert_eq!(take_utf16(text, 4), text);
        assert_eq!(take_utf16(text, 99), text);
        assert_eq!(take_last_utf16(text, 0), "");
        assert_eq!(take_last_utf16(text, 1), "b");
        assert_eq!(take_last_utf16(text, 2), "b");
        assert_eq!(take_last_utf16(text, 3), "😀b");
        assert_eq!(take_last_utf16(text, 4), text);
        assert_eq!(take_last_utf16(text, 99), text);
        assert_eq!(take_utf16("あいう", 2), "あい");
        assert_eq!(take_last_utf16("あいう", 2), "いう");
    }

    #[test]
    fn kt_trim_matches_kotlin_whitespace() {
        // Character.isWhitespace or Character.isSpaceChar (Zs, Zl, Zp).
        let whitespace = [
            '\t', '\n', '\u{b}', '\u{c}', '\r', '\u{1c}', '\u{1d}', '\u{1e}', '\u{1f}', ' ',
            '\u{a0}', '\u{1680}', '\u{2000}', '\u{2007}', '\u{200a}', '\u{2028}', '\u{2029}',
            '\u{202f}', '\u{205f}', '\u{3000}',
        ];
        let not_whitespace = [
            'x', '\u{0}', '\u{8}', '\u{e}', '\u{1b}', '\u{7f}', '\u{85}', '\u{180e}', '\u{200b}',
            '\u{2060}', '\u{feff}', 'あ',
        ];
        for c in whitespace {
            assert!(is_kt_whitespace(c), "U+{:04X}", c as u32);
            assert_eq!(kt_trim(&format!("{c}x{c}")), "x", "U+{:04X}", c as u32);
        }
        for c in not_whitespace {
            assert!(!is_kt_whitespace(c), "U+{:04X}", c as u32);
            let text = format!("{c}x{c}");
            assert_eq!(kt_trim(&text), text, "U+{:04X}", c as u32);
        }
        assert_eq!(kt_trim("\u{2003}x\u{00A0}"), "x");
        assert_eq!(kt_trim(" \u{85}x\u{85} "), "\u{85}x\u{85}");
        assert_eq!(kt_trim(" a b "), "a b");
        assert_eq!(kt_trim("\u{3000}\u{1f}"), "");
    }

    #[test]
    fn kt_is_blank_is_true_for_empty_and_kotlin_whitespace_only() {
        assert!(kt_is_blank(""));
        assert!(kt_is_blank(" \t\u{3000}\u{1c}\r\n"));
        assert!(!kt_is_blank(" \u{85} "));
        assert!(!kt_is_blank(" x "));
    }

    #[test]
    fn kt_lines_splits_at_every_line_break_and_keeps_the_last_empty_line() {
        let lines = |text| kt_lines(text).collect::<Vec<_>>();
        assert_eq!(lines(""), [""]);
        assert_eq!(lines("a"), ["a"]);
        assert_eq!(lines("a\n"), ["a", ""]);
        assert_eq!(lines("a\r\nb\rc\nd"), ["a", "b", "c", "d"]);
        assert_eq!(lines("\r\r\n\n"), ["", "", "", ""]);
        assert_eq!(lines("a\u{2028}b\u{85}c"), ["a\u{2028}b\u{85}c"]);
    }
}
