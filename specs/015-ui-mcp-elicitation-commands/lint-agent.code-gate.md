# lint-agent — code-gate iter 2

Run: 2026-10-11. Scope: 63 touched files (full-project lint, filtered to scope). test:rules not run (code-gate).

```json
{
  "command": "node node_modules/eslint/bin/eslint.js --cache --format json .",
  "commands": [
    {"command": "node node_modules/eslint/bin/eslint.js --cache --format json -o <scratchpad>/eslint.json .", "exit_code": 0, "duration_ms": 11698},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false", "exit_code": 0, "duration_ms": 8523},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false", "exit_code": 0, "duration_ms": 14659},
    {"command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src", "exit_code": 0, "duration_ms": 15674},
    {"command": "node scripts/constitution/check.mjs", "exit_code": 0, "duration_ms": 3983}
  ],
  "exit_code": 0,
  "duration_ms": 54537,
  "scope": "full-project (filtered to touched files)",
  "touched_count": 63,
  "detectors": {
    "eslint": {"exit_code": 0, "files_linted": 414, "messages": 0},
    "typecheck_node": {"exit_code": 0, "errors": 0},
    "typecheck_web": {"exit_code": 0, "errors": 0},
    "depcruise": {"exit_code": 0, "summary": "no dependency violations found (423 modules, 2192 dependencies cruised)"},
    "check_constitution": {"exit_code": 0, "summary": "項目 21 件: ok 20 / 違反 0 (指摘 0 件) / 検査対象なし 1"},
    "test_rules": {"skipped": true, "reason": "test:rules is not run in code-gate"}
  },
  "violations": [],
  "violation_count_by_severity": {"error": 0, "warning": 0, "info": 0}
}
```
