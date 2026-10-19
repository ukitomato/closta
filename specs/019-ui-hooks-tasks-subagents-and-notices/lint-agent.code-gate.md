# lint-agent — code-gate iter 2

```json
{
  "exit_code": 0,
  "detectors": [
    {"name": "lint", "command": "node node_modules/eslint/bin/eslint.js --format json .", "exit_code": 0, "errors": 0, "warnings": 22, "touched_violations": 0},
    {"name": "typecheck-node", "command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false", "exit_code": 0, "errors": 0},
    {"name": "typecheck-web", "command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false", "exit_code": 0, "errors": 0},
    {"name": "depcruise", "command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src", "exit_code": 0, "violations": 0},
    {"name": "check:constitution", "command": "node scripts/constitution/check.mjs", "exit_code": 0, "result": "21 items: ok 20 / violations 0 / no target 1"}
  ],
  "scope": "touched-files (4 files; data-model.md is not lintable)",
  "violations": [],
  "violation_count_by_severity": {"error": 0, "warning": 0, "info": 0},
  "out_of_scope_violation_count_by_severity": {"error": 0, "warning": 22, "info": 0},
  "notes": [
    "The 22 out-of-scope warnings are all prettier/prettier in files outside the scope.",
    "test:rules was not run (code-gate does not run it)."
  ]
}
```
