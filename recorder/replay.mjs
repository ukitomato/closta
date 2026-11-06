// Checks whether the resumed CLI (the second stdout) replays the user and assistant lines of the first one.
// Not by uuid alone: if the CLI sends the same message under a new uuid, a matching message id or body is still a replay.

const speech = (rows) => rows.filter((r) => r.type === 'user' || r.type === 'assistant');
const bodyOf = (r) => (r.message?.content === undefined ? '' : JSON.stringify(r.message.content));

export function sameLine(a, b) {
  return (
    (a.uuid !== undefined && a.uuid === b.uuid) ||
    (typeof a.message?.id === 'string' && a.message.id !== '' && a.message.id === b.message?.id) ||
    (bodyOf(a) !== '' && bodyOf(a) === bodyOf(b))
  );
}

// The user and assistant lines of second that match some line of first.
export function replayedLines(first, second) {
  return speech(second).filter((r) => speech(first).some((f) => sameLine(f, r)));
}
