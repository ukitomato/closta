//! Hidden and bidirectional characters made visible, from VisibleText.kt.

use std::fmt::Write as _;

/// Text with its hidden and bidirectional characters replaced by marks; `had_hidden` tells
/// whether any was replaced.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct VisibleText {
    pub text: String,
    pub had_hidden: bool,
}

/// Replaces each hidden or bidirectional character with a mark such as `<U+202E>`, so it can be
/// seen where it is shown. Tab and line feed stay; every other C0 control, every C1 control, the
/// bidi embedding, override, isolate and zero-width characters, the line and paragraph
/// separators, and the byte order mark are marked.
///
/// Kotlin looks at UTF-16 units. Every marked character is in the BMP and none is a surrogate,
/// so looking at each `char` marks the same ones.
pub fn visible(text: &str) -> VisibleText {
    let mut had_hidden = false;
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if is_hidden(c) {
            had_hidden = true;
            let _ = write!(out, "<U+{:04X}>", u32::from(c));
        } else {
            out.push(c);
        }
    }
    VisibleText {
        text: out,
        had_hidden,
    }
}

fn is_hidden(c: char) -> bool {
    match c {
        '\t' | '\n' => false,
        '\u{0}'..='\u{1f}'
        | '\u{80}'..='\u{9f}'
        | '\u{200b}'..='\u{200f}'
        | '\u{202a}'..='\u{202e}'
        | '\u{2066}'..='\u{2069}'
        | '\u{2028}'
        | '\u{2029}'
        | '\u{feff}' => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One character from its code point, so the test source stays ASCII and never holds a
    /// hidden character itself.
    fn ch(code: u32) -> String {
        char::from_u32(code).expect("a scalar value").to_string()
    }

    fn shown(text: &str, had_hidden: bool) -> VisibleText {
        VisibleText {
            text: text.to_owned(),
            had_hidden,
        }
    }

    #[test]
    fn a_right_to_left_override_becomes_a_mark() {
        assert_eq!(
            shown("evil<U+202E>txt.sh", true),
            visible(&format!("evil{}txt.sh", ch(0x202E)))
        );
    }

    #[test]
    fn tabs_and_newlines_stay() {
        assert_eq!(shown("a\tb\nc", false), visible("a\tb\nc"));
    }

    #[test]
    fn zero_width_bidi_isolates_bom_and_c1_controls_become_marks() {
        assert_eq!(shown("<U+200B>", true), visible(&ch(0x200B)));
        assert_eq!(shown("<U+2066>", true), visible(&ch(0x2066)));
        assert_eq!(shown("<U+FEFF>", true), visible(&ch(0xFEFF)));
        assert_eq!(shown("<U+0085>", true), visible(&ch(0x0085)));
    }

    #[test]
    fn every_code_point_in_the_marked_ranges_becomes_a_mark() {
        let ranges = [
            0x202A..=0x202E,
            0x2066..=0x2069,
            0x200B..=0x200F,
            0x2028..=0x2029,
            0x0000..=0x0008,
            0x000B..=0x000C,
            0x000D..=0x001F,
            0x0080..=0x009F,
            0xFEFF..=0xFEFF,
        ];
        for range in ranges {
            for code in range {
                let expected = format!("<U+{code:04X}>");
                assert_eq!(shown(&expected, true), visible(&ch(code)), "U+{code:04X}");
            }
        }
    }

    #[test]
    fn characters_next_to_the_marked_ranges_stay() {
        let neighbours = [
            0x0020, 0x007E, 0x007F, 0x00A0, 0x00AD, 0x1680, 0x2000, 0x200A, 0x2010, 0x2027, 0x202F,
            0x2065, 0x206A, 0xFEFE, 0xFF00,
        ];
        let kept: String = neighbours.into_iter().map(ch).collect();
        assert_eq!(shown(&kept, false), visible(&kept));
    }

    #[test]
    fn carriage_return_is_marked() {
        assert_eq!(
            shown("a<U+000D>b", true),
            visible(&format!("a{}b", ch(0x000D)))
        );
    }

    #[test]
    fn a_mark_keeps_the_surrounding_text_in_order() {
        assert_eq!(
            shown("x<U+200B>y<U+202E>z<U+0080>", true),
            visible(&format!("x{}y{}z{}", ch(0x200B), ch(0x202E), ch(0x0080)))
        );
    }

    #[test]
    fn empty_text_has_no_hidden_characters() {
        assert_eq!(shown("", false), visible(""));
    }

    #[test]
    fn visible_keeps_a_character_outside_the_bmp() {
        assert_eq!(
            VisibleText {
                text: "😀<U+202E>".into(),
                had_hidden: true
            },
            visible("😀\u{202E}")
        );
    }
}
