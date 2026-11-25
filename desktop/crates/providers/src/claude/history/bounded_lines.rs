//! The lines of a saved record, read without holding a line over the limit.

use std::io::{self, Read};

const CHUNK: usize = 64 * 1024;

#[derive(PartialEq, Eq)]
pub(crate) enum Line {
    Text(String),
    TooLong,
}

// A record line is the user's text, so `Debug` shows only the kind and the size.
impl std::fmt::Debug for Line {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Line::Text(text) => write!(f, "Text({} bytes)", text.len()),
            Line::TooLong => f.write_str("TooLong"),
        }
    }
}

/// A line is its bytes up to a `\n` (a `\r` stays), read as UTF-8 with damaged bytes replaced, so one
/// damaged byte damages one line. A line over `max_line_bytes` is not kept, only counted, and the rest of
/// it up to its newline is read away.
pub(crate) struct BoundedLines<R: Read> {
    input: R,
    max_line_bytes: usize,
    buffer: Box<[u8; CHUNK]>,
    start: usize,
    end: usize,
}

impl<R: Read> BoundedLines<R> {
    pub(crate) fn new(input: R, max_line_bytes: usize) -> Self {
        Self {
            input,
            max_line_bytes,
            buffer: Box::new([0; CHUNK]),
            start: 0,
            end: 0,
        }
    }

    /// The next line, or `None` at the end of the record.
    pub(crate) fn next_line(&mut self) -> io::Result<Option<Line>> {
        let mut line = Vec::new();
        let mut too_long = false;
        let mut saw_any = false;
        loop {
            if !self.fill()? {
                break;
            }
            saw_any = true;
            let pending = &self.buffer[self.start..self.end];
            let newline = pending.iter().position(|&b| b == b'\n');
            let taken = newline.unwrap_or(pending.len());
            if !too_long {
                if line.len() + taken > self.max_line_bytes {
                    too_long = true;
                    line = Vec::new();
                } else {
                    line.extend_from_slice(&pending[..taken]);
                }
            }
            self.start += newline.map_or(taken, |at| at + 1);
            if newline.is_some() {
                break;
            }
        }
        Ok(if !saw_any {
            None
        } else if too_long {
            Some(Line::TooLong)
        } else {
            Some(Line::Text(String::from_utf8_lossy(&line).into_owned()))
        })
    }

    // True when there are bytes to take; reads the next chunk when the last is used up.
    fn fill(&mut self) -> io::Result<bool> {
        if self.start >= self.end {
            self.start = 0;
            self.end = loop {
                match self.input.read(&mut self.buffer[..]) {
                    Ok(n) => break n,
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                    Err(e) => return Err(e),
                }
            };
        }
        Ok(self.start < self.end)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn lines(input: &[u8], max: usize) -> Vec<Option<Line>> {
        let mut reader = BoundedLines::new(Cursor::new(input.to_vec()), max);
        let mut out = Vec::new();
        loop {
            let next = reader.next_line().unwrap();
            let done = next.is_none();
            out.push(next);
            if done {
                return out;
            }
        }
    }

    fn text(s: &str) -> Option<Line> {
        Some(Line::Text(s.to_string()))
    }

    #[test]
    fn a_line_over_the_limit_is_counted_and_the_lines_after_it_are_read() {
        let input = format!("short\n{}\nafter\n", "x".repeat(25));
        assert_eq!(
            lines(input.as_bytes(), 10),
            vec![text("short"), Some(Line::TooLong), text("after"), None]
        );
    }

    #[test]
    fn a_line_exactly_at_the_limit_is_read_and_one_byte_more_is_not() {
        let at = "x".repeat(10);
        let over = "x".repeat(11);
        assert_eq!(
            lines(format!("{at}\n").as_bytes(), 10),
            vec![text(&at), None]
        );
        assert_eq!(
            lines(format!("{over}\n").as_bytes(), 10),
            vec![Some(Line::TooLong), None]
        );
        assert_eq!(lines(over.as_bytes(), 10), vec![Some(Line::TooLong), None]);
    }

    #[test]
    fn a_line_longer_than_a_chunk_is_read_whole() {
        let long = "y".repeat(200 * 1024);
        let input = format!("{long}\nnext\n");
        assert_eq!(
            lines(input.as_bytes(), 1024 * 1024),
            vec![text(&long), text("next"), None]
        );
    }

    #[test]
    fn a_damaged_byte_damages_one_line() {
        assert_eq!(
            lines(b"a\xffb\nok\n", 100),
            vec![text("a\u{FFFD}b"), text("ok"), None]
        );
    }

    #[test]
    fn a_last_line_without_a_newline_is_a_line() {
        assert_eq!(lines(b"a\nb", 10), vec![text("a"), text("b"), None]);
    }

    #[test]
    fn an_empty_line_is_an_empty_text() {
        assert_eq!(lines(b"\nx\n", 10), vec![text(""), text("x"), None]);
    }

    #[test]
    fn a_carriage_return_is_kept() {
        assert_eq!(lines(b"a\r\n", 10), vec![text("a\r"), None]);
    }

    #[test]
    fn debug_of_a_text_line_shows_its_size_and_not_its_text() {
        let shown = format!("{:?}", Line::Text("secret words".to_string()));
        assert_eq!(shown, "Text(12 bytes)");
        assert!(!shown.contains("secret"));
        assert_eq!(format!("{:?}", Line::TooLong), "TooLong");
    }
}
