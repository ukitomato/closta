//! A file the user sent with a message. Mirrors `Attachment.kt`.

use std::fmt;

/// What an [`Attachment`] is to the agent: an image, a document (a PDF), or text sent as a sentence.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AttachmentKind {
    Image,
    Document,
    Text,
}

impl AttachmentKind {
    fn wire_name(self) -> &'static str {
        match self {
            Self::Image => "IMAGE",
            Self::Document => "DOCUMENT",
            Self::Text => "TEXT",
        }
    }
}

/// One file the user sent with a message.
///
/// The bytes, the name and the path are the user's own: they are sent or kept, and never logged or
/// put in an error. `Debug` says only the kind and the size. Equality is by content.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct Attachment {
    pub kind: AttachmentKind,
    pub media_type: String,
    pub name: String,
    pub bytes: Vec<u8>,
    /// The file it was read from; `None` for what was pasted.
    pub path: Option<String>,
}

impl fmt::Debug for Attachment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Attachment({}, {} bytes)",
            self.kind.wire_name(),
            self.bytes.len()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::hash::{DefaultHasher, Hash, Hasher};

    fn attachment(
        kind: AttachmentKind,
        media_type: &str,
        name: &str,
        bytes: &[u8],
        path: Option<&str>,
    ) -> Attachment {
        Attachment {
            kind,
            media_type: media_type.into(),
            name: name.into(),
            bytes: bytes.to_vec(),
            path: path.map(str::to_string),
        }
    }

    fn hash_of(a: &Attachment) -> u64 {
        let mut h = DefaultHasher::new();
        a.hash(&mut h);
        h.finish()
    }

    #[test]
    fn debug_names_neither_the_file_nor_its_bytes() {
        let a = attachment(
            AttachmentKind::Text,
            "text/plain",
            "private-notes.txt",
            "the secret body".as_bytes(),
            None,
        );

        let text = format!("{a:?}");

        assert_eq!("Attachment(TEXT, 15 bytes)", text);
        assert!(!text.contains("private-notes"));
        assert!(!text.contains("secret"));
    }

    #[test]
    fn equality_is_by_content() {
        let png = |name: &str, bytes: &[u8]| {
            attachment(AttachmentKind::Image, "image/png", name, bytes, None)
        };
        let first = png("a.png", &[1, 2]);

        assert_eq!(first, png("a.png", &[1, 2]));
        assert_eq!(hash_of(&first), hash_of(&png("a.png", &[1, 2])));
        assert_ne!(first, png("a.png", &[1, 3]));
        assert_ne!(first, png("b.png", &[1, 2]));
    }

    #[test]
    fn the_path_it_came_from_counts_in_equality_but_is_never_said() {
        let from = attachment(
            AttachmentKind::Text,
            "text/plain",
            "a.txt",
            &[1],
            Some("/home/me/secret/a.txt"),
        );
        let pasted = attachment(AttachmentKind::Text, "text/plain", "a.txt", &[1], None);

        assert_eq!(Some("/home/me/secret/a.txt"), from.path.as_deref());
        assert!(!format!("{from:?}").contains("secret"));
        assert_ne!(from, pasted);
        assert_eq!(None, pasted.path);
    }
}
