//! What the thread keeps of the files a user sent with a message: the point of each, never its
//! bytes (AttachmentRecords.kt).

use std::fmt;

use closta_model::AttachmentKind;

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
