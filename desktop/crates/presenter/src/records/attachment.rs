//! What the thread keeps of the files a user sent with a message: the point of each, never its
//! bytes (AttachmentRecords.kt).

use std::fmt;

use closta_model::AttachmentKind;

use crate::input::AttachmentRefused;
use crate::records::operations::{OperationRecords, SwitchKind};
use crate::text::kt_trim;

/// One file the user sent: its `name`, what it is (`kind`, `media_type`), how many bytes it was
/// (`size`) and the `path` it was read from (`None` when it was pasted, or put back from a record).
/// It is a part of the user's message in the tree, ahead of the words; the tree does not carry the
/// path. The name and the path are the user's own: `Debug` leaves them out.
#[derive(Clone, PartialEq, Eq)]
pub struct AttachmentRecord {
    pub name: String,
    pub kind: AttachmentKind,
    pub media_type: String,
    pub size: i64,
    pub path: Option<String>,
}

impl fmt::Debug for AttachmentRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AttachmentRecord({:?}, {} bytes)", self.kind, self.size)
    }
}

/// Why the host did not send a message that came with attachments: a closed set of words, never a
/// name.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AttachmentRefusal {
    Missing,
    TooLarge,
    TooMany,
    Unsupported,
    NotText,
}

impl AttachmentRefusal {
    pub fn wire(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::TooLarge => "too-large",
            Self::TooMany => "too-many",
            Self::Unsupported => "unsupported",
            Self::NotText => "not-text",
        }
    }
}

impl OperationRecords {
    /// The host did not send a message because of its attachments: a record that is over at once,
    /// like a refused resume.
    pub(crate) fn refuse_attachment(&self, input: &AttachmentRefused) -> Self {
        self.refused(
            &input.request_id,
            SwitchKind::Attachment,
            input.reason.wire(),
            None,
        )
    }
}

/// What the composer takes as attachments, the same rules as the original webview's (its
/// `attachmentRules`, AttachmentRules.kt): the limits are conservative, the API's own are not
/// recorded. A text file must also be UTF-8; that is read where the bytes are.
pub struct AttachmentLimits;

impl AttachmentLimits {
    pub const MAX_BYTES: i64 = 5 * 1024 * 1024;
    pub const MAX_PER_SEND: usize = 10;
    /// Counted in code points, as Kotlin's `codePointCount`, not in UTF-16 units.
    pub const MAX_NAME_CHARS: usize = 255;
    pub const MEDIA_TYPES: [&str; 6] = [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
        "application/json",
    ];
    pub const TEXT_PREFIX: &str = "text/";
    pub const TEXT_EXTENSIONS: [&str; 20] = [
        ".txt", ".md", ".csv", ".log", ".xml", ".yaml", ".yml", ".toml", ".ini", ".html", ".css",
        ".js", ".ts", ".tsx", ".jsx", ".kt", ".java", ".py", ".sh", ".sql",
    ];
}

/// Why a file is not taken.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AttachmentFault {
    TooLarge,
    TooMany,
    NameTooLong,
    Unsupported,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum AttachmentVerdict {
    Ok {
        kind: AttachmentKind,
        media_type: String,
    },
    Refused(AttachmentFault),
}

/// Whether a file of `name`, `media_type` (`None` when nothing says what it is) and `size` bytes
/// can go with a message that already carries `already_attached` files.
pub fn check_attachment(
    name: &str,
    media_type: Option<&str>,
    size: i64,
    already_attached: usize,
) -> AttachmentVerdict {
    let Some(media_type) = media_type_of(name, media_type) else {
        return AttachmentVerdict::Refused(AttachmentFault::Unsupported);
    };
    if name.chars().count() > AttachmentLimits::MAX_NAME_CHARS {
        AttachmentVerdict::Refused(AttachmentFault::NameTooLong)
    } else if size > AttachmentLimits::MAX_BYTES {
        AttachmentVerdict::Refused(AttachmentFault::TooLarge)
    } else if already_attached >= AttachmentLimits::MAX_PER_SEND {
        AttachmentVerdict::Refused(AttachmentFault::TooMany)
    } else {
        AttachmentVerdict::Ok {
            kind: kind_of(&media_type),
            media_type,
        }
    }
}

fn media_type_of(name: &str, given: Option<&str>) -> Option<String> {
    let given = given.unwrap_or_default();
    let before_parameters = given.split_once(';').map_or(given, |(it, _)| it);
    let media_type = kt_trim(before_parameters).to_lowercase();
    if !media_type.is_empty() {
        let taken = AttachmentLimits::MEDIA_TYPES.contains(&media_type.as_str())
            || media_type.starts_with(AttachmentLimits::TEXT_PREFIX);
        return taken.then_some(media_type);
    }
    let lower = name.to_lowercase();
    AttachmentLimits::TEXT_EXTENSIONS
        .iter()
        .any(|it| lower.ends_with(it))
        .then(|| "text/plain".to_owned())
}

fn kind_of(media_type: &str) -> AttachmentKind {
    if media_type.starts_with("image/") {
        AttachmentKind::Image
    } else if media_type == "application/pdf" {
        AttachmentKind::Document
    } else {
        AttachmentKind::Text
    }
}
