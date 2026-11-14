//! What a refusal says, from RefusalSentence.kt.

use crate::text::{kt_trim, take_utf16};

/// What a refusal says when the CLI's own error carried no sentence.
pub const NO_SENTENCE: &str = "The request was refused.";

/// The most UTF-16 units of the CLI's error a refusal keeps.
pub const MAX_DETAIL_CHARS: usize = 500;

/// What a refusal says: the CLI's error, trimmed and cut to [`MAX_DETAIL_CHARS`], or
/// [`NO_SENTENCE`] when it has none.
pub fn plain_sentence_of(error: &str) -> String {
    match kt_trim(error) {
        "" => NO_SENTENCE.to_owned(),
        sentence => take_utf16(sentence, MAX_DETAIL_CHARS).to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_refusal_says_the_trimmed_error_or_no_sentence() {
        assert_eq!(plain_sentence_of(""), NO_SENTENCE);
        assert_eq!(plain_sentence_of(" \u{3000}\n"), NO_SENTENCE);
        assert_eq!(plain_sentence_of("  Busy.\n"), "Busy.");
    }

    #[test]
    fn a_refusal_keeps_at_most_500_utf16_units_and_never_half_a_pair() {
        let long = "x".repeat(600);
        assert_eq!(plain_sentence_of(&long), "x".repeat(MAX_DETAIL_CHARS));
        let pair_at_the_cut = format!("{}😀tail", "x".repeat(499));
        assert_eq!(plain_sentence_of(&pair_at_the_cut), "x".repeat(499));
    }
}
