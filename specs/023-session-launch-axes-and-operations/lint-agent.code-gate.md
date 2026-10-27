# lint-agent code-gate iter 1

```json
{
  "commands": [
    {"command": "node node_modules/eslint/bin/eslint.js --cache --format json .", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false", "exit_code": 0},
    {"command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src", "exit_code": 0},
    {"command": "node scripts/constitution/check.mjs", "exit_code": 0}
  ],
  "exit_code": 0,
  "scope": "touched-files",
  "touched_count": 73,
  "not_linted_in_scope": ["e2e/live-session-settings.spec.ts", "tests/rule-fixtures/expected.mjs"],
  "detectors": [
    {"name": "eslint", "exit_code": 0, "violations": 42, "note": "prettier/prettier warning 42, error 0"},
    {"name": "typecheck-node", "exit_code": 0, "errors": 0},
    {"name": "typecheck-web", "exit_code": 0, "errors": 0},
    {"name": "depcruise", "exit_code": 0, "violations": 0, "note": "555 modules / 3017 dependencies"},
    {"name": "constitution", "exit_code": 0, "items": 21, "ok": 20, "violations": 0, "not_checked": 1}
  ],
  "violation_count_by_severity": {"error": 0, "warning": 42, "info": 0}
}
```
