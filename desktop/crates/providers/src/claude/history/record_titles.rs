//! The title a saved record is listed by, read from as little of it as names it. Nothing here fails
//! for a damaged line, and no title leaves this but as the one returned.

use std::collections::HashMap;
use std::io::{self, Read};
use std::path::Path;

use serde_json::{Map, Value};

use super::bounded_lines::{BoundedLines, Line};
use super::record_files::{RecordFs, open_head, open_tail};
use super::record_lines::{
    MAX_LINE_BYTES, has_type, is_main_user, may_be_conversation, row, string,
};
use super::text::{is_java_space, kt_is_blank, kt_trim, kt_trim_start};

/// How many lines from the top of a record are read for its title.
pub(crate) const HEAD_LINES: usize = 200;

/// How many bytes of a record's newest end are read for the lines that name it.
pub(crate) const TAIL_BYTES: u64 = 64 * 1024;

/// How many characters (code points) of the first sentence the title keeps.
pub(crate) const TITLE_CHARS: usize = 80;

// The lines that name a session; only a line whose `type` says it is one is parsed.
const NAMING_TYPES: [&str; 3] = ["custom-title", "ai-title", "last-prompt"];

/// The newest of each line that names a session, as far as it was read: the name the user gave
/// (`custom-title`), the CLI's title (`ai-title`) and the last prompt (`last-prompt`).
#[derive(Default)]
struct Names {
    custom: Option<String>,
    ai: Option<String>,
    prompt: Option<String>,
}

impl Names {
    /// The name a session is listed by, the way Claude Code chooses it.
    fn chosen(self) -> Option<String> {
        self.custom.or(self.ai).or(self.prompt)
    }

    /// These names, where `newer` (read from later in the record) has none of a kind.
    fn under(self, newer: Names) -> Names {
        Names {
            custom: newer.custom.or(self.custom),
            ai: newer.ai.or(self.ai),
            prompt: newer.prompt.or(self.prompt),
        }
    }

    fn take(&mut self, line: &str) {
        if !has_type(line, &NAMING_TYPES) {
            return;
        }
        let Some(row) = row(line) else { return };
        let (slot, key) = match string(&row, "type") {
            Some("custom-title") => (&mut self.custom, "customTitle"),
            Some("ai-title") => (&mut self.ai, "aiTitle"),
            Some("last-prompt") => (&mut self.prompt, "lastPrompt"),
            _ => return,
        };
        if let Some(name) = string(&row, key).and_then(clip) {
            *slot = Some(name);
        }
    }
}

/// The title of the record at `path`: `None` when none of its first [`HEAD_LINES`] lines is a user
/// line of the main conversation, empty when nothing in it is a title.
///
/// It is chosen as Claude Code chooses it: the newest name the user gave, the CLI's title, the last
/// prompt, and only then the first sentence of a user. The names are looked for in the lines before
/// the first sentence and in the newest [`TAIL_BYTES`] of the record, the newest end winning.
pub(crate) fn title_of(fs: &dyn RecordFs, path: &Path) -> io::Result<Option<String>> {
    let mut head = BoundedLines::new(open_head(fs, path)?, MAX_LINE_BYTES);
    let mut saw_user = false;
    let mut sentence = None;
    let mut names = Names::default();
    let mut read = 0;
    while read < HEAD_LINES && sentence.is_none() {
        let Some(line) = head.next_line()? else { break };
        read += 1;
        let Line::Text(text) = line else { continue };
        match may_be_conversation(&text).then(|| row(&text)).flatten() {
            Some(row) if is_main_user(&row) => {
                saw_user = true;
                sentence = sentence_of(&row);
            }
            _ => names.take(&text),
        }
    }
    if !saw_user {
        return Ok(None);
    }
    let newest = names_in(BoundedLines::new(
        open_tail(fs, path, TAIL_BYTES)?.reader,
        MAX_LINE_BYTES,
    ))?;
    Ok(Some(
        names
            .under(newest)
            .chosen()
            .or(sentence)
            .unwrap_or_default(),
    ))
}

// The newest names in `lines`, read to their end: the newest part of a record, bounded by the caller.
fn names_in(mut lines: BoundedLines<impl Read>) -> io::Result<Names> {
    let mut names = Names::default();
    while let Some(line) = lines.next_line()? {
        if let Line::Text(text) = line {
            names.take(&text);
        }
    }
    Ok(names)
}

// The first sentence a user line holds: a string content, or the first text block of a list that
// says something.
fn sentence_of(row: &Map<String, Value>) -> Option<String> {
    let text = match row.get("message")?.get("content")? {
        Value::String(text) => Some(text.as_str()).filter(|it| is_request(it)),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(Value::as_object)
            .filter(|block| string(block, "type") == Some("text"))
            .find_map(|block| string(block, "text").filter(|it| is_request(it))),
        _ => None,
    };
    clip(text?)
}

/// Whether `text` is something the user asked: not blank, and not the IDE's tags only.
pub(crate) fn is_request(text: &str) -> bool {
    !kt_is_blank(text) && !(kt_trim_start(text).starts_with("<ide_") && ide_tags_only(text))
}

/// `text` as a title: trimmed, each run of ASCII white space one space, of [`TITLE_CHARS`] code
/// points at most; `None` when nothing is left.
pub(crate) fn clip(text: &str) -> Option<String> {
    let mut title = String::new();
    let mut in_space = false;
    for c in kt_trim(text).chars() {
        if is_java_space(c) {
            if !in_space {
                title.push(' ');
            }
            in_space = true;
        } else {
            title.push(c);
            in_space = false;
        }
    }
    if title.is_empty() {
        return None;
    }
    if let Some((at, _)) = title.char_indices().nth(TITLE_CHARS) {
        title.truncate(at);
    }
    Some(title)
}

const OPEN: &str = "<ide_";
const CLOSE: &str = "</ide_";

/// Whether `text` is wholly the IDE's tags (`<ide_opened_file>…</ide_opened_file>`), as the regex
/// `(?:\s*<(ide_[a-z_]+)>.*?</\1>)+\s*` matches a whole string with `.` matching any character and
/// `\s` Java's six ASCII spaces. A tag may close at any later `</name>` of its name, as the regex
/// backtracks to; each start is tried once, and each closing is taken once per name.
pub(crate) fn ide_tags_only(text: &str) -> bool {
    let bytes = text.as_bytes();
    let closings = closings_by_name(text);
    // Per name, the index of its first closing already taken: those after it were taken before.
    let mut taken: HashMap<&str, usize> = HashMap::new();
    let mut tried = vec![false; bytes.len() + 1];
    let mut starts = vec![0];
    tried[0] = true;
    while let Some(start) = starts.pop() {
        let at = skip_spaces(bytes, start);
        if start > 0 && at == bytes.len() {
            return true;
        }
        let Some((name, body)) = opening_at(text, at) else {
            continue;
        };
        let Some(ends) = closings.get(name) else {
            continue;
        };
        let first = ends.partition_point(|&close| close < body);
        let until = taken.entry(name).or_insert(ends.len());
        if first < *until {
            for &close in &ends[first..*until] {
                // Past `</`, the name and `>`.
                let end = close + name.len() + 3;
                if !tried[end] {
                    tried[end] = true;
                    starts.push(end);
                }
            }
            *until = first;
        }
    }
    false
}

fn skip_spaces(bytes: &[u8], mut at: usize) -> usize {
    while at < bytes.len() && is_java_space(char::from(bytes[at])) {
        at += 1;
    }
    at
}

fn is_name_byte(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte == b'_'
}

// The `ide_…` name of a tag that `<` at `at` opens, and where its body begins.
fn opening_at(text: &str, at: usize) -> Option<(&str, usize)> {
    let name = text.get(at..)?.strip_prefix(OPEN)?;
    let len = name.bytes().take_while(|&b| is_name_byte(b)).count();
    (len > 0 && name.as_bytes().get(len) == Some(&b'>')).then(|| {
        (
            &text[at + 1..at + OPEN.len() + len],
            at + OPEN.len() + len + 1,
        )
    })
}

// Where each `</ide_…>` of `text` begins, by its `ide_…` name, in order.
fn closings_by_name(text: &str) -> HashMap<&str, Vec<usize>> {
    let mut closings: HashMap<&str, Vec<usize>> = HashMap::new();
    for (at, _) in text.match_indices(CLOSE) {
        let rest = &text.as_bytes()[at + CLOSE.len()..];
        let len = rest.iter().take_while(|&&b| is_name_byte(b)).count();
        if len > 0 && rest.get(len) == Some(&b'>') {
            closings
                .entry(&text[at + 2..at + CLOSE.len() + len])
                .or_default()
                .push(at);
        }
    }
    closings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::fake::record_fs::MemoryRecordFs;
    use crate::claude::history::record_lines::MAX_LINE_BYTES;
    use serde_json::{Value, json};
    use std::time::{Duration, Instant};

    const SESSION: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";
    const PATH: &str = "/p/00000000-0000-4000-8000-000000000001.jsonl";

    fn title(lines: &[String]) -> Option<String> {
        let fs = MemoryRecordFs::default();
        let mut bytes = String::new();
        for line in lines {
            bytes.push_str(line);
            bytes.push('\n');
        }
        fs.put(PATH, bytes.into_bytes(), 1);
        title_of(&fs, Path::new(PATH)).unwrap()
    }

    fn some(text: &str) -> Option<String> {
        Some(text.to_owned())
    }

    fn user_with(content: Value, extra: Value) -> String {
        let mut line = json!({"parentUuid": null, "isSidechain": false, "type": "user",
            "message": {"role": "user", "content": content},
            "uuid": "u", "timestamp": "2026-11-09T01:00:00.000Z", "sessionId": SESSION});
        if let (Some(into), Value::Object(from)) = (line.as_object_mut(), extra) {
            into.extend(from);
        }
        line.to_string()
    }

    fn user(content: Value) -> String {
        user_with(content, json!({}))
    }

    fn user_says(sentence: &str) -> String {
        user(json!(sentence))
    }

    fn user_blocks(texts: &[&str]) -> String {
        user(Value::Array(
            texts
                .iter()
                .map(|text| json!({"type": "text", "text": text}))
                .collect(),
        ))
    }

    fn tool_result() -> String {
        user(json!([{"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok"}]))
    }

    fn assistant(sentence: &str) -> String {
        json!({"type": "assistant", "uuid": "a", "sessionId": SESSION, "timestamp": "t",
            "requestId": "r", "isSidechain": false,
            "message": {"id": "m", "role": "assistant",
                "content": [{"type": "text", "text": sentence}]}})
        .to_string()
    }

    fn meta(kind: &str) -> String {
        json!({"type": kind, "sessionId": SESSION}).to_string()
    }

    fn ai_title(title: &str) -> String {
        json!({"type": "ai-title", "aiTitle": title, "sessionId": SESSION}).to_string()
    }

    fn custom_title(title: &str) -> String {
        json!({"type": "custom-title", "customTitle": title, "sessionId": SESSION}).to_string()
    }

    fn last_prompt(prompt: &str) -> String {
        json!({"type": "last-prompt", "lastPrompt": prompt, "leafUuid": "u", "sessionId": SESSION})
            .to_string()
    }

    // More bytes of conversation than the end that is read for the titles.
    fn past_the_tail() -> Vec<String> {
        let filler = "y".repeat(1000);
        vec![assistant(&filler); TAIL_BYTES as usize / 1000 + 2]
    }

    fn joined(parts: Vec<Vec<String>>) -> Vec<String> {
        parts.into_iter().flatten().collect()
    }

    // ---- which line names a session ----

    #[test]
    fn a_name_the_user_gave_wins_over_the_clis_title_and_the_last_prompt_even_when_written_before_them()
     {
        let lines = [
            custom_title("my name"),
            user_says("first"),
            ai_title("cli title"),
            last_prompt("again"),
        ];
        assert_eq!(title(&lines), some("my name"));
    }

    #[test]
    fn the_newest_line_of_a_kind_wins() {
        let renamed = [
            custom_title("old name"),
            user_says("first"),
            custom_title("new name"),
        ];
        let retitled = [
            user_says("first"),
            ai_title("first title"),
            assistant("ok"),
            ai_title("second"),
        ];
        let prompted = [
            user_says("first"),
            last_prompt("first"),
            user_says("later"),
            last_prompt("later"),
        ];
        assert_eq!(title(&renamed), some("new name"));
        assert_eq!(title(&retitled), some("second"));
        assert_eq!(
            title(&prompted),
            some("later"),
            "the last prompt, with no title"
        );
    }

    #[test]
    fn a_title_with_nothing_in_it_is_no_title_and_a_title_is_one_line_of_eighty_characters() {
        let blank = [
            user_says("first"),
            ai_title("cli title"),
            custom_title("   "),
        ];
        let long = [
            user_says("first"),
            ai_title(&format!("  one\n two  {}", "x".repeat(100))),
        ];
        assert_eq!(title(&blank), some("cli title"));
        assert_eq!(title(&long), Some(format!("one two {}", "x".repeat(72))));
    }

    #[test]
    fn with_no_title_line_the_first_request_is_the_title() {
        let lines = [
            user_says("the request"),
            assistant("an answer"),
            user_says("more"),
        ];
        assert_eq!(title(&lines), some("the request"));
    }

    #[test]
    fn a_title_line_does_not_list_a_record_no_user_speaks_in() {
        assert_eq!(title(&[ai_title("a title"), assistant("alone")]), None);
    }

    #[test]
    fn a_title_line_said_inside_a_message_is_not_a_title_line_and_a_damaged_line_is_passed_over() {
        let lines = [
            user_says("the request"),
            user_says(&ai_title("not a title")),
            "{\"type\":\"ai-title\",".to_owned(),
        ];
        assert_eq!(title(&lines), some("the request"));
    }

    // ---- where the title lines are read ----

    #[test]
    fn the_end_of_a_long_record_is_read_for_its_titles() {
        let lines = joined(vec![
            vec![user_says("the request")],
            past_the_tail(),
            vec![ai_title("at the end")],
        ]);
        assert_eq!(title(&lines), some("at the end"));
    }

    #[test]
    fn a_title_line_before_the_first_request_is_read_and_one_at_the_end_is_newer() {
        let head = vec![custom_title("from the head"), user_says("the request")];
        let head_only = joined(vec![head.clone(), past_the_tail()]);
        let both = joined(vec![head, past_the_tail(), vec![custom_title("new")]]);
        assert_eq!(title(&head_only), some("from the head"));
        assert_eq!(title(&both), some("new"));
    }

    #[test]
    fn a_title_line_past_the_first_request_and_before_the_end_that_is_read_is_not_looked_for() {
        let lines = joined(vec![
            vec![user_says("the request"), ai_title("in the middle")],
            past_the_tail(),
        ]);
        assert_eq!(title(&lines), some("the request"));
    }

    // ---- the first request ----

    #[test]
    fn a_block_the_ide_put_in_of_its_tags_only_is_not_the_request() {
        let opened = [user_blocks(&[
            "<ide_opened_file>The user opened the file /work/a.kt in the IDE.</ide_opened_file>",
            "fix the retry loop",
        ])];
        let selected = [user_blocks(&[
            "<ide_selection>The user selected the lines 1 to 2:\nval a = 1\n</ide_selection>",
            "  ",
            "explain this",
        ])];
        let only_tags = [
            user_says("<ide_opened_file>The user opened the file /work/a.kt.</ide_opened_file>"),
            user_says("the next one"),
        ];
        let tag_and_words = [user_blocks(&[
            "<ide_opened_file>/work/a.kt</ide_opened_file> look at this",
        ])];
        assert_eq!(title(&opened), some("fix the retry loop"));
        assert_eq!(title(&selected), some("explain this"));
        assert_eq!(
            title(&only_tags),
            some("the next one"),
            "a string of tags only is no request either"
        );
        assert_eq!(
            title(&tag_and_words),
            some("<ide_opened_file>/work/a.kt</ide_opened_file> look at this"),
            "a block with words of its own is a request"
        );
    }

    // ---- the first sentence, and the first 200 lines ----

    #[test]
    fn a_title_is_the_first_sentence_of_a_user_of_eighty_characters_or_empty_where_there_is_none() {
        let spaced = [
            meta("queue-operation"),
            user_says("  one\n\n   two\tthree  "),
        ];
        let long = format!("{}😀😀tail", "x".repeat(79));
        let skips_no_sentence = [
            tool_result(),
            user_blocks(&["", "  "]),
            user_blocks(&["", "the real one"]),
        ];
        let no_sentence = [tool_result(), assistant("hi")];
        assert_eq!(
            title(&spaced),
            some("one two three"),
            "white space is one space"
        );
        assert_eq!(
            title(&[user_says(&long)]),
            Some(format!("{}😀", "x".repeat(79))),
            "eighty characters, never through a character"
        );
        assert_eq!(
            title(&skips_no_sentence),
            some("the real one"),
            "a user line with no sentence is passed over for the next"
        );
        assert_eq!(
            title(&no_sentence),
            some(""),
            "no title when no user line has a sentence"
        );
    }

    #[test]
    fn a_record_with_no_user_in_its_first_200_lines_has_no_title_and_a_sentence_after_them_is_not_looked_for()
     {
        let only_assistant = [meta("queue-operation"), assistant("hi")];
        let only_sidechain = [
            user_with(json!("deep"), json!({"isSidechain": true})),
            meta("mode"),
        ];
        let late_user = joined(vec![
            vec![meta("attachment"); 200],
            vec![user_says("too late")],
        ]);
        let sentence_late = joined(vec![
            vec![tool_result()],
            vec![meta("attachment"); 199],
            vec![user_says("past 200")],
        ]);
        let sentence_in_time = joined(vec![
            vec![tool_result()],
            vec![meta("attachment"); 198],
            vec![user_says("at 200")],
        ]);
        let meta_only = [user_with(
            json!("a note to the model"),
            json!({"isMeta": true}),
        )];
        assert_eq!(title(&only_assistant), None);
        assert_eq!(title(&[]), None, "an empty record");
        assert_eq!(title(&only_sidechain), None);
        assert_eq!(title(&late_user), None);
        assert_eq!(title(&meta_only), None);
        assert_eq!(
            title(&sentence_late),
            some(""),
            "the sentence is the 201st line: no sentence in the first 200"
        );
        assert_eq!(
            title(&sentence_in_time),
            some("at 200"),
            "the 200th line is still looked at"
        );
    }

    #[test]
    fn a_title_is_not_looked_for_in_a_line_over_the_limit() {
        let lines = [
            user_says(&"y".repeat(MAX_LINE_BYTES + 1)),
            user_says("the short one"),
        ];
        assert_eq!(title(&lines), some("the short one"));
    }

    #[test]
    fn a_summary_of_a_compaction_is_not_a_title() {
        let summary = user_with(json!("the summary"), json!({"isCompactSummary": true}));
        assert_eq!(
            title(&[summary.clone(), user_says("what I said")]),
            some("what I said")
        );
        assert_eq!(title(&[summary]), None);
    }

    // ---- full-width spaces ----

    #[test]
    fn a_title_of_full_width_spaces_only_is_no_title() {
        let lines = [
            user_says("first"),
            ai_title("cli title"),
            custom_title("\u{3000}\u{3000}"),
        ];
        assert_eq!(title(&lines), some("cli title"));
        assert_eq!(clip("\u{3000}\u{3000}"), None);
    }

    #[test]
    fn full_width_spaces_around_a_title_are_trimmed() {
        assert_eq!(clip("\u{3000}題\u{3000}"), some("題"));
        assert_eq!(
            title(&[user_says("first"), custom_title("\u{3000}題\u{3000}")]),
            some("題")
        );
    }

    #[test]
    fn full_width_spaces_inside_are_not_squeezed() {
        assert_eq!(clip("a\u{3000}\u{3000}b"), some("a\u{3000}\u{3000}b"));
        assert_eq!(clip(" a \t\r\n\x0B\x0C b "), some("a b"));
    }

    #[test]
    fn a_full_width_space_around_the_colon_is_not_a_title_line() {
        let line = format!(
            "{{\"type\"\u{3000}:\"ai-title\",\"aiTitle\":\"spaced\",\"sessionId\":\"{SESSION}\"}}"
        );
        assert_eq!(title(&[user_says("first"), line]), some("first"));
        let ascii = format!(
            "{{\"type\" \t: \"ai-title\",\"aiTitle\":\"spaced\",\"sessionId\":\"{SESSION}\"}}"
        );
        assert_eq!(title(&[user_says("first"), ascii]), some("spaced"));
    }

    // ---- the IDE's tags ----

    #[test]
    fn ide_tags_read_as_kotlins_pattern() {
        for text in [
            "<ide_a>x</ide_a>",
            "<ide_opened_file>a</ide_opened_file><ide_selection>b\nc</ide_selection>",
            " \n<ide_a>x</ide_a>\t <ide_b></ide_b> \r\n",
            "<ide_a><ide_b>x</ide_b></ide_a>",
        ] {
            assert!(ide_tags_only(text), "{text:?}");
        }
        for text in [
            "<ide_a>x</ide_b>",
            "<ide_a>x",
            "<ide_a>x</ide_a> and words",
            "<ide_A>x</ide_A>",
            "<ide_>x</ide_>",
            "",
            "  ",
            "<ide_a>x</ide_a>\u{3000}",
        ] {
            assert!(!ide_tags_only(text), "{text:?}");
        }
    }

    #[test]
    fn a_tag_closed_again_after_words_is_tags_only_as_in_kotlin() {
        assert!(ide_tags_only("<ide_a>x</ide_a> y</ide_a>"));
        assert!(ide_tags_only("<ide_a>x</ide_a><ide_b>y</ide_a></ide_b>"));
    }

    #[test]
    fn many_closings_end_quickly() {
        let text = format!("<ide_a>{} y", "x</ide_a>".repeat(20_000));
        let started = Instant::now();
        assert!(!ide_tags_only(&text));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn many_tags_in_a_row_do_not_overflow_the_stack() {
        let text = "<ide_a></ide_a>".repeat(50_000);
        assert!(ide_tags_only(&text));
        assert!(!ide_tags_only(&format!("{text} y")));
    }

    #[test]
    fn a_full_width_space_before_the_tags_makes_it_a_request() {
        assert!(!ide_tags_only("\u{3000}<ide_a>x</ide_a>"));
        assert!(is_request("\u{3000}<ide_a>x</ide_a>"));
        assert!(!is_request(" <ide_a>x</ide_a> "));
        assert!(!is_request("\u{3000} "));
        assert!(is_request("look"));
    }
}
