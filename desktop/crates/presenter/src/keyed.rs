//! An ordered collection addressed by key (Keyed.kt), and the keys the CLI's ids become (Keys.kt).

use std::fmt;
use std::sync::Arc;

use imbl::{HashMap, Vector};

use crate::json::is_key;

/// An ordered collection addressed by key, never by position — the transcript's form of the
/// tree's `{order, byId}`, since a sub-agent's tool call lands between others and a position
/// would shift.
///
/// It is immutable and both halves are persistent, so a put costs the same however many entries
/// there are. Replacing an entry keeps the order as the same `Arc`, and a change that leaves the
/// entry as it was (the same `Arc`) returns a collection that is [`same`](Self::same) as this
/// one, so an input that changes nothing changes no object above it either.
pub struct Keyed<T> {
    // In an `Arc` because `imbl::Vector::ptr_eq` is false for clones of a short, inline vector.
    order: Arc<Vector<String>>,
    by_key: HashMap<String, Arc<T>>,
}

impl<T> Keyed<T> {
    pub fn new() -> Self {
        Self {
            order: Arc::new(Vector::new()),
            by_key: HashMap::new(),
        }
    }

    pub fn len(&self) -> usize {
        self.order.len()
    }

    pub fn is_empty(&self) -> bool {
        self.order.is_empty()
    }

    pub fn order(&self) -> impl DoubleEndedIterator<Item = &str> {
        self.order.iter().map(String::as_str)
    }

    pub fn get(&self, key: &str) -> Option<&Arc<T>> {
        self.by_key.get(key)
    }

    pub fn contains(&self, key: &str) -> bool {
        self.by_key.contains_key(key)
    }

    /// The entries in order.
    pub fn values(&self) -> impl Iterator<Item = &Arc<T>> {
        self.order.iter().filter_map(|key| self.by_key.get(key))
    }

    /// Appends `value` under a new `key`, or replaces the entry in place when the key is there.
    pub fn put(&self, key: String, value: Arc<T>) -> Keyed<T> {
        match self.by_key.get(&key) {
            Some(old) if Arc::ptr_eq(old, &value) => self.clone(),
            Some(_) => Keyed {
                order: Arc::clone(&self.order),
                by_key: self.by_key.update(key, value),
            },
            None => {
                let mut order = Vector::clone(&self.order);
                order.push_back(key.clone());
                Keyed {
                    order: Arc::new(order),
                    by_key: self.by_key.update(key, value),
                }
            }
        }
    }

    /// Replaces the entry under `key` with `change` of it; a missing key or an unchanged entry
    /// (the same `Arc`) changes nothing.
    pub fn update(&self, key: &str, change: impl FnOnce(&Arc<T>) -> Arc<T>) -> Keyed<T> {
        let Some(old) = self.by_key.get(key) else {
            return self.clone();
        };
        let new = change(old);
        if Arc::ptr_eq(old, &new) {
            return self.clone();
        }
        Keyed {
            order: Arc::clone(&self.order),
            by_key: self.by_key.update(key.to_owned(), new),
        }
    }

    /// `wanted` when no entry has it, else the first of `wanted~2`, `wanted~3`… that none has.
    /// Two sources pick keys for the same collection — the host for its user messages, the CLI
    /// for its turns and messages — and nothing stops them picking the same string; a collection
    /// with one key twice is a tree the webview rejects.
    pub fn claim(&self, wanted: &str) -> String {
        claim_key(|key| self.contains(key), wanted)
    }

    /// Whether `other` has this very order (Kotlin's `order === other.order`): true after a put
    /// that replaced an entry, false after one that added a key.
    pub fn same_order(&self, other: &Keyed<T>) -> bool {
        Arc::ptr_eq(&self.order, &other.order)
    }

    /// Whether `other` is this very collection (Kotlin's `===`), not merely an equal one.
    pub fn same(&self, other: &Keyed<T>) -> bool {
        Arc::ptr_eq(&self.order, &other.order) && self.by_key.ptr_eq(&other.by_key)
    }
}

impl<T> Clone for Keyed<T> {
    fn clone(&self) -> Self {
        Self {
            order: Arc::clone(&self.order),
            by_key: self.by_key.clone(),
        }
    }
}

impl<T> Default for Keyed<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Equal entries in the same order (Kotlin's `==`); see [`Keyed::same`] for identity.
impl<T: PartialEq> PartialEq for Keyed<T> {
    fn eq(&self, other: &Self) -> bool {
        self.order == other.order && self.by_key == other.by_key
    }
}

impl<T: fmt::Debug> fmt::Debug for Keyed<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_map()
            .entries(self.order.iter().zip(self.values()))
            .finish()
    }
}

/// `wanted` when `taken` says it is free, else the first of `wanted~2`, `wanted~3`… that is.
pub fn claim_key(taken: impl Fn(&str) -> bool, wanted: &str) -> String {
    if !taken(wanted) {
        return wanted.to_owned();
    }
    (2..)
        .map(|suffix| format!("{wanted}~{suffix}"))
        .find(|key| !taken(key))
        .unwrap_or_default()
}

const ESCAPE: &str = "id:";

/// The key for a CLI id (`Keys.ofCliId`): the id itself when it is a key ([`is_key`]), else the
/// id behind an `id:` prefix. An id that already starts with the prefix is prefixed again, so two
/// different ids never get the same key. The same function makes a tool call's key and its
/// `toolCallId`, which the protocol requires to be equal.
pub fn of_cli_id(id: &str) -> String {
    if is_key(id) && !id.starts_with(ESCAPE) {
        id.to_owned()
    } else {
        format!("{ESCAPE}{id}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arc(text: &str) -> Arc<String> {
        Arc::new(text.to_owned())
    }

    fn order(keyed: &Keyed<String>) -> Vec<&str> {
        keyed.order().collect()
    }

    #[test]
    fn keyed_keeps_insertion_order() {
        let keyed = Keyed::new()
            .put("b".into(), arc("1"))
            .put("a".into(), arc("2"))
            .put("c".into(), arc("3"))
            .put("a".into(), arc("4"));
        assert_eq!(order(&keyed), ["b", "a", "c"]);
        assert_eq!(keyed.len(), 3);
        assert_eq!(
            keyed.values().map(|v| v.as_str()).collect::<Vec<_>>(),
            ["1", "4", "3"]
        );
        assert_eq!(keyed.get("a").map(|v| v.as_str()), Some("4"));
        assert!(keyed.contains("c"));
        assert!(!keyed.contains("d"));
        assert_eq!(keyed.get("d"), None);
        assert_eq!(Keyed::<String>::new().len(), 0);
    }

    #[test]
    fn keyed_put_of_the_same_arc_is_the_same_keyed() {
        let value = arc("1");
        let keyed = Keyed::new().put("a".into(), value.clone());
        let again = keyed.put("a".into(), value);
        assert!(again.same(&keyed));
        let equal = keyed.put("a".into(), arc("1"));
        assert!(
            !equal.same(&keyed),
            "an equal value in a new Arc is a change"
        );
        assert_eq!(equal, keyed, "but compares equal by value");
        assert!(!keyed.put("b".into(), arc("2")).same(&keyed));
    }

    #[test]
    fn keyed_update_keeps_other_entries_the_same_arc() {
        let keyed = Keyed::new()
            .put("a".into(), arc("1"))
            .put("b".into(), arc("2"));
        let updated = keyed.update("b", |old| arc(&format!("{old}!")));
        assert!(Arc::ptr_eq(
            updated.get("a").unwrap(),
            keyed.get("a").unwrap()
        ));
        assert_eq!(updated.get("b").map(|v| v.as_str()), Some("2!"));
        assert_eq!(order(&updated), ["a", "b"]);
        assert!(
            updated.same_order(&keyed),
            "a replaced entry keeps the order"
        );
        assert!(!keyed.put("c".into(), arc("3")).same_order(&keyed));
        assert!(
            keyed.update("b", Arc::clone).same(&keyed),
            "an unchanged entry"
        );
        assert!(
            keyed.update("z", |_| arc("x")).same(&keyed),
            "a missing key"
        );
    }

    #[test]
    fn keyed_compares_by_value_and_order() {
        let ab = Keyed::new()
            .put("a".into(), arc("1"))
            .put("b".into(), arc("2"));
        let ba = Keyed::new()
            .put("b".into(), arc("2"))
            .put("a".into(), arc("1"));
        assert_ne!(ab, ba);
        let ab_again = Keyed::new()
            .put("a".into(), arc("1"))
            .put("b".into(), arc("2"));
        assert_eq!(ab, ab_again);
        assert!(!ab.same(&ab_again));
    }

    #[test]
    fn claim_takes_the_first_free_suffix() {
        let keyed = Keyed::new()
            .put("abc".into(), arc("1"))
            .put("abc~2".into(), arc("2"))
            .put("abc~4".into(), arc("4"));
        assert_eq!(keyed.claim("x"), "x");
        assert_eq!(keyed.claim("abc"), "abc~3");
        assert_eq!(
            claim_key(|key| key != "k~5" && key.starts_with('k'), "k"),
            "k~5"
        );
    }

    #[test]
    fn an_id_that_is_a_key_stays_as_it_is_any_other_gets_one_prefix() {
        assert_eq!(of_cli_id("toolu_1"), "toolu_1");
        assert_eq!(of_cli_id("42"), "id:42");
        assert_eq!(of_cli_id(""), "id:");
        assert_eq!(of_cli_id("__proto__"), "id:__proto__");
        assert_eq!(of_cli_id("id:42"), "id:id:42");
        let tricky = [
            "toolu_1",
            "",
            "0",
            "42",
            "__proto__",
            "constructor",
            "prototype",
            "id:",
            "id:42",
            "id:id:42",
            "a",
        ];
        let keys: Vec<String> = tricky.iter().map(|id| of_cli_id(id)).collect();
        assert!(keys.iter().all(|key| is_key(key)), "{keys:?}");
        let distinct: std::collections::BTreeSet<_> = keys.iter().collect();
        assert_eq!(distinct.len(), tricky.len(), "{keys:?}");
    }
}
