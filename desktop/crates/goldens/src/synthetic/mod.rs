//! A made-up session in the shape of the user's largest recorded one (SyntheticSession.kt),
//! counted from `~/.claude/projects` without reading what was said (2026-11-03): its turns, tool
//! calls (sub-agents' included), sub-agents, Skill and MCP calls, and the length of its replies.
//! Nothing of the user's own sessions is in it. The history is written the way a resumed session
//! reads it: finished snapshots, nothing streamed.
//!
//! The draws come from a seeded generator of this crate's own, not Kotlin's `Random`: the lines
//! have Kotlin's shapes and counts, not its exact words.

pub mod replay_script;
pub mod stream_script;

use closta_presenter::text::{is_kt_whitespace, utf16_len};
use serde_json::{Value, json};

use stream_script::StreamScript;

/// One turn of a made-up session: the user's words (the host shows them; the CLI does not echo
/// them) and stdout.
#[derive(Clone, PartialEq, Debug)]
pub struct SyntheticTurn {
    pub prompt: String,
    pub lines: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Shape {
    pub turns: usize,
    pub tools: usize,
    pub subagents: usize,
    pub skills: usize,
    pub mcp: usize,
    pub total_text: usize,
    pub longest_text: usize,
}

pub const LARGEST: Shape = Shape {
    turns: 200,
    tools: 2_000,
    subagents: 150,
    skills: 70,
    mcp: 13,
    total_text: 170_000,
    longest_text: 7_500,
};

/// Twice the largest session, as one conversation (TranscriptFoldBudgetTest.kt's `DOUBLED`). The
/// longest reply stays as long as in [`LARGEST`], as in Kotlin.
pub const DOUBLED: Shape = Shape {
    turns: LARGEST.turns * 2,
    tools: LARGEST.tools * 2,
    subagents: LARGEST.subagents * 2,
    skills: LARGEST.skills * 2,
    mcp: LARGEST.mcp * 2,
    total_text: LARGEST.total_text * 2,
    longest_text: LARGEST.longest_text,
};

const NESTED_TOOLS: usize = 4;
const SUBAGENT_TEXT: usize = 200;
const INTERLEAVED_TEXT: usize = 120;
const INTERLEAVED_EVERY: usize = 4;
const LONG_EVERY: usize = 40;
const RESULT_TEXT: usize = 400;
const PROMPT_LENGTH: usize = 80;
const NESTED_IDS: usize = 10;
const WRITE_LINES: usize = 12;

const PLAIN_TOOLS: [&str; 8] = [
    "Read", "Grep", "Edit", "Bash", "Glob", "Read", "Edit", "Write",
];

/// The session of `shape`, drawn from `seed`: the same seed gives the same lines.
pub fn session(shape: &Shape, seed: u64) -> Vec<SyntheticTurn> {
    let mut random = Random(seed);
    let top_level = shape.tools - shape.subagents * NESTED_TOOLS;
    let kinds = tool_kinds(shape, top_level, &mut random);
    let mut writer = MarkdownWriter { random };
    let interleaved = top_level.div_ceil(INTERLEAVED_EVERY);
    let long_turns: Vec<usize> = (LONG_EVERY..shape.turns).step_by(LONG_EVERY).collect();
    // A shape is a test input: an invalid one fails with its reason.
    #[allow(clippy::expect_used)]
    let budget = shape
        .total_text
        .checked_sub(
            shape.subagents * SUBAGENT_TEXT
                + interleaved * INTERLEAVED_TEXT
                + long_turns.len() * shape.longest_text,
        )
        .expect("shape too small for its texts");
    let final_length = budget / (shape.turns - long_turns.len());

    let mut call = 0;
    let mut message = 0;
    let mut next_message = || {
        let id = format!("msg_{message}");
        message += 1;
        id
    };
    (0..shape.turns)
        .map(|turn| {
            let mut script = StreamScript::new("synthetic");
            let command = format!("cmd-{turn}");
            script.lifecycle(&command, "queued");
            script.lifecycle(&command, "started");
            if turn == 0 {
                script.init();
            }
            let count = top_level / shape.turns + usize::from(turn < top_level % shape.turns);
            for _ in 0..count {
                let id = format!("toolu_{call}");
                let kind = kinds[call];
                let mut blocks = Vec::new();
                if call % INTERLEAVED_EVERY == 0 {
                    blocks.push(stream_script::text(&writer.paragraph(INTERLEAVED_TEXT)));
                }
                blocks.push(stream_script::tool_use(&id, kind, input_for(kind, call)));
                script.assistant(&next_message(), blocks, None);
                if kind == "Task" {
                    for nested in 0..NESTED_TOOLS {
                        let nested_id = format!("{id}_n{nested}");
                        let nested_kind = PLAIN_TOOLS[nested % PLAIN_TOOLS.len()];
                        let input = input_for(nested_kind, call * NESTED_IDS + nested);
                        script.assistant(
                            &next_message(),
                            vec![stream_script::tool_use(&nested_id, nested_kind, input)],
                            Some(&id),
                        );
                        script.tool_result(
                            &nested_id,
                            &writer.paragraph(RESULT_TEXT),
                            Some(&id),
                            false,
                        );
                    }
                    script.assistant(
                        &next_message(),
                        vec![stream_script::text(&writer.paragraph(SUBAGENT_TEXT))],
                        Some(&id),
                    );
                }
                script.tool_result(&id, &writer.paragraph(RESULT_TEXT), None, false);
                call += 1;
            }
            let length = if long_turns.contains(&turn) {
                shape.longest_text
            } else {
                final_length
            };
            let reply = writer.reply(length);
            script.assistant(&next_message(), vec![stream_script::text(&reply)], None);
            script.result(&reply);
            script.lifecycle(&command, "completed");
            SyntheticTurn {
                prompt: format!("Request {}: {}", turn + 1, writer.paragraph(PROMPT_LENGTH)),
                lines: script.lines(),
            }
        })
        .collect()
}

fn tool_kinds(shape: &Shape, top_level: usize, random: &mut Random) -> Vec<&'static str> {
    let special = shape.subagents + shape.skills + shape.mcp;
    let mut kinds: Vec<&'static str> = std::iter::repeat_n("Task", shape.subagents)
        .chain(std::iter::repeat_n("Skill", shape.skills))
        .chain(std::iter::repeat_n("mcp__jira__search", shape.mcp))
        .chain((0..top_level - special).map(|it| PLAIN_TOOLS[it % PLAIN_TOOLS.len()]))
        .collect();
    random.shuffle(&mut kinds);
    kinds
}

fn input_for(kind: &str, n: usize) -> Value {
    match kind {
        "Read" | "Write" | "Edit" => {
            let mut input =
                json!({ "file_path": format!("/repo/module{n}/src/main/kotlin/Service{n}.kt") });
            if kind == "Edit" {
                input["old_string"] = format!("fun call{n}() =\n    old()").into();
                input["new_string"] =
                    format!("fun call{n}() =\n    retry {{\n        new()\n    }}").into();
            }
            if kind == "Write" {
                let content: Vec<String> =
                    (1..=WRITE_LINES).map(|it| format!("line {it}")).collect();
                input["content"] = content.join("\n").into();
            }
            input
        }
        "Bash" => {
            json!({ "command": format!("./gradlew :module{n}:test --tests '*Service{n}Test'") })
        }
        "Grep" | "Glob" => json!({ "pattern": format!("Service{n}") }),
        "Task" => json!({
            "description": format!("Investigate module {n}"),
            "prompt": format!("Look into module {n} and report what calls Service{n}."),
        }),
        "Skill" => json!({ "skill": format!("review-{n}") }),
        _ => json!({ "query": format!("PROJ-{n}") }),
    }
}

/// SplitMix64: small, seeded, and the same on every platform.
struct Random(u64);

impl Random {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A number in `0..bound`.
    fn below(&mut self, bound: usize) -> usize {
        // The bounds here are small, so the modulo's bias is negligible.
        (self.next_u64() % bound as u64) as usize
    }

    fn shuffle<T>(&mut self, items: &mut [T]) {
        for last in (1..items.len()).rev() {
            items.swap(last, self.below(last + 1));
        }
    }
}

const SENTENCES: [&str; 6] = [
    "The change is kept to two places: `AuthService` and `RetryPolicy`.",
    "The retry only counts network failures; anything the server says is returned at once.",
    "The tests run on virtual time, so no wait is really waited.",
    "Callers on the EDT now go through a coroutine, so the UI no longer blocks.",
    "There are three existing callers, and none of them changes behaviour.",
    "This keeps the log free of user names and URLs.",
];

const BLOCK_KINDS: usize = 5;
const PARAGRAPH: usize = 180;
const ITEM: usize = 40;
const LIST_ITEMS: usize = 4;
const CODE_LINES: usize = 8;
const TABLE_ROWS: usize = 4;

/// Markdown of a given length, drawn from a few kinds of block, in English. Every sentence is
/// ASCII, so a byte is a UTF-16 unit.
struct MarkdownWriter {
    random: Random,
}

impl MarkdownWriter {
    fn paragraph(&mut self, length: usize) -> String {
        let mut text = String::new();
        while utf16_len(&text) < length {
            text.push_str(SENTENCES[self.random.below(SENTENCES.len())]);
            text.push(' ');
        }
        text.truncate(length);
        text.trim_end_matches(is_kt_whitespace).to_owned()
    }

    fn reply(&mut self, length: usize) -> String {
        let mut text = String::new();
        let mut section = 1;
        loop {
            let block = self.block(section);
            section += 1;
            if utf16_len(&text) + utf16_len(&block) > length {
                break;
            }
            text.push_str(&block);
        }
        let rest = length - utf16_len(&text);
        if rest > 0 {
            let mut tail = self.paragraph(rest);
            while utf16_len(&tail) < rest {
                tail.push('.');
            }
            text.push_str(&tail);
        }
        text
    }

    fn block(&mut self, section: usize) -> String {
        match self.random.below(BLOCK_KINDS) {
            0 => format!("## Change {section}\n\n"),
            1 => self.paragraph(PARAGRAPH) + "\n\n",
            2 => {
                let items: String = (0..LIST_ITEMS)
                    .map(|_| format!("- {}\n", self.paragraph(ITEM)))
                    .collect();
                items + "\n"
            }
            3 => {
                let code: Vec<String> = (1..=CODE_LINES)
                    .map(|it| format!("val value{it} = compute({it}) // {section}"))
                    .collect();
                format!("```kotlin\n{}\n```\n\n", code.join("\n"))
            }
            _ => {
                let rows: String = (1..=TABLE_ROWS)
                    .map(|it| {
                        format!(
                            "| item{it} | {} | {} | {} |\n",
                            it + it,
                            it + it + it,
                            self.paragraph(ITEM)
                        )
                    })
                    .collect();
                format!("| Item | Before | After | Notes |\n|---|---|---|---|\n{rows}\n")
            }
        }
    }
}
