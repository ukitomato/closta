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

- `CLAUDE_BIN=/path/to/claude` chooses the CLI binary. To add a capture next to existing ones, use the same CLI
  version as the manifest: `record.mjs` stops before writing anything when the version differs, unless
  `--allow-version-change` is given (for re-recording everything on a new version).
- `CLOSTA_PII_NAMES` and `CLOSTA_PII_ORGS` (comma-separated) add personal and organization names the audit must not
  find. `git config user.name` is always included. Keep them in your environment, not in a file.
- Each scenario runs in a fresh temporary directory, and the CLI's records for it are removed afterwards.
