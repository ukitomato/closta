# test-agent — code-gate iteration 1

```json
{
  "command": "node node_modules/vitest/vitest.mjs run --reporter=default --reporter=json --outputFile.json=<scratchpad>/vitest.json",
  "command_source": "docs/discovery.md Build / Test / Lint table, unit test row, agent column, full-run form",
  "runner": "vitest 5.0.0 (projects: node / renderer, pool: threads)",
  "exit_code": 0,
  "duration_ms": 136416,
  "vitest_reported_duration_ms": 125230,
  "timeout_wrapper": "gate_common::run_with_timeout 560s -> ok",
  "scope": "full",
  "test_files": {"passed": 144, "failed": 0, "total": 144},
  "totals": {"passed": 2604, "failed": 0, "skipped": 0, "error": 0},
  "failed_tests": [],
  "note": "Totals come from the default reporter summary ('Test Files 144 passed (144)' / 'Tests 2604 passed (2604)'). The summary lists no skipped or todo tests. Coverage is left out because no @vitest/coverage-* provider is installed under node_modules. The stderr noise is not a failure: React's 'flushSync was called from inside a lifecycle method' warnings in transcript-navigator / virtualization / ConversationSearch tests, and one expected provider-store log line in provider-service.test.ts."
}
```
