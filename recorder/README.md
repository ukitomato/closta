# recorder

Records the `claude` CLI's bidirectional stream-json protocol into the capture files the plugin's tests replay
(`jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures/*.ndjson`, listed in `manifest.json`).

Every line the CLI writes goes through a PII scrubber (`scrub.mjs`) before it reaches a file; there is no path that
writes a raw line. The scrubber replaces e-mail addresses, the account's organization and its UUID, the user name in
home paths, and drops managed (organization policy) settings. After writing, an audit (`findPii`) scans the file
again and throws the recording away if anything is left.

Node 18 or later. No dependencies.

## Tests

```bash
cd recorder
npm test          # the scrubber and recorder self-tests; no API calls
node verify.mjs   # checks the existing captures (manifest, hashes, PII audit); no API calls
```

## Recording

Recording starts a real `claude` CLI and spends API usage.

```bash
node record.mjs --list   # the scenarios
node record.mjs 06 07    # re-record some scenarios (only their manifest entries change)
node record.mjs          # re-record every scenario (overwrites the captures)
```

- Scenarios are declared in `scenarios.mjs`. Besides the steps they can set `hooks` (the callbacks `initialize` declares),
  `hookCallback` and `elicitation` (how to answer those requests from the CLI; a `null` payload answers a hook with an
  error and an elicitation not at all) and `pending: true`. A pending scenario is defined but not recorded yet:
  `verify.mjs` prints `pending: <id>` for it instead of failing on its missing manifest entry. Drop the flag when you record it.
- Steps that need an id from what the CLI wrote: `cancelQueued {userIndex}` (the uuid of the userIndex-th user line sent), `backgroundTool {toolName}`
  (the last `tool_use` id of that tool), `taskOutput {times, everyMs}` (the last `system/task_started` task id) and
  `renameSession {title, previousSession}` (the last `system/init` session id, or the one before it). Each waits for its answer.
  `extraDirs: [name]` makes folders next to the cwd, and `{EXTRA:<name>}` in `flags` becomes the path. `permission.respond(req, {index, cwd})`
  gets the index of the `can_use_tool` request from 0. `waitFor` counts a `command_lifecycle` line as `command_lifecycle/<state>`.
- `CLAUDE_BIN=/path/to/claude` chooses the CLI binary. To add a capture next to existing ones, use the same CLI
  version as the manifest: `record.mjs` stops before writing anything when the version differs, unless
  `--allow-version-change` is given (for re-recording everything on a new version).
- `CLOSTA_PII_NAMES` and `CLOSTA_PII_ORGS` (comma-separated) add personal and organization names the audit must not
  find. `git config user.name` is always included. Keep them in your environment, not in a file.
- Each scenario runs in a fresh temporary directory, and the CLI's records for it are removed afterwards.
- The CLI runs with a fresh config directory that holds only a copy of `~/.claude/.credentials.json`, removed when
  recording ends, so your own skills, plugins, agents and settings stay out of the captures. Set `CLAUDE_CONFIG_DIR`
  to record with a config of your choosing instead.
