//! Reading protocol trees in tests: plain paths through objects and collections, nothing of the
//! presenter's own (TreeReading.kt). A path that is not there panics, as Kotlin's casts throw.

use serde_json::{Map, Value};

/// The object at `path` under `node`.
pub fn at<'a>(node: &'a Value, path: &[&str]) -> &'a Map<String, Value> {
    let mut here = node;
    for key in path {
        here = here
            .get(key)
            .unwrap_or_else(|| panic!("no '{key}' on the path {path:?}"));
    }
    here.as_object()
        .unwrap_or_else(|| panic!("{path:?} is not an object"))
}

/// The string member `key`, when it is one.
pub fn str<'a>(node: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    node.get(key)?.as_str()
}

fn collection<'a>(node: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    node.get(key)
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no collection '{key}'"))
}

/// The keys of the collection under `key`, in order.
pub fn keys_of(node: &Map<String, Value>, key: &str) -> Vec<String> {
    collection(node, key)
        .get("order")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("the collection '{key}' has no order"))
        .iter()
        .map(|it| {
            it.as_str()
                .unwrap_or_else(|| panic!("a key of '{key}' is not a string"))
                .to_owned()
        })
        .collect()
}

/// The entries of the collection under `key`, in order.
pub fn entries<'a>(node: &'a Map<String, Value>, key: &str) -> Vec<&'a Map<String, Value>> {
    let by_id = collection(node, key)
        .get("byId")
        .unwrap_or_else(|| panic!("the collection '{key}' has no byId"));
    keys_of(node, key)
        .iter()
        .map(|entry| at(by_id, &[entry]))
        .collect()
}

pub fn messages(thread: &Map<String, Value>) -> Vec<&Map<String, Value>> {
    entries(thread, "messages")
}

pub fn parts(message: &Map<String, Value>) -> Vec<&Map<String, Value>> {
    entries(message, "parts")
}

pub fn message<'a>(thread: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    entry(thread, "messages", key)
}

pub fn part<'a>(message: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    entry(message, "parts", key)
}

fn entry<'a>(
    node: &'a Map<String, Value>,
    collection_key: &str,
    key: &str,
) -> &'a Map<String, Value> {
    collection(node, collection_key)
        .get("byId")
        .and_then(|by_id| by_id.get(key))
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no '{key}' in '{collection_key}'"))
}

/// The status as `type` or `type/reason`.
pub fn status(node: &Map<String, Value>) -> Option<String> {
    let status = node.get("status")?.as_object()?;
    let said: Vec<&str> = [str(status, "type"), str(status, "reason")]
        .into_iter()
        .flatten()
        .collect();
    Some(said.join("/"))
}

/// Every tool-call part anywhere under `node`, by its key, in the order they are met (a key met
/// again keeps its place and takes the later part, as Kotlin's `LinkedHashMap` does).
pub fn tool_calls(node: &Value) -> Map<String, Value> {
    let mut found = Map::new();
    let mut pending = vec![node];
    while let Some(value) = pending.pop() {
        match value {
            Value::Object(fields) => {
                if str(fields, "type") == Some("tool-call") {
                    let key = str(fields, "toolCallId").unwrap_or_default().to_owned();
                    found.insert(key, value.clone());
                }
                // Reversed so the walk meets members in their order.
                pending.extend(
                    fields
                        .iter()
                        .filter(|(key, _)| *key != "args" && *key != "result")
                        .map(|(_, child)| child)
                        .rev(),
                );
            }
            Value::Array(items) => pending.extend(items.iter().rev()),
            _ => {}
        }
    }
    found
}
