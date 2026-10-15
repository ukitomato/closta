# lint-agent — code-gate iter 5

Two invocations, combined. First: eslint on the 76 touched .ts/.tsx/.mjs files. Second: typecheck (node / web), depcruise, check:constitution. test:rules was not run.

```json
{
  "exit_code": 0,
  "scope": "touched-files (eslint) + project-wide (typecheck, depcruise, check:constitution)",
  "commands": [
    {"command": "node node_modules/eslint/bin/eslint.js --format json --no-warn-ignored <76 touched .ts/.tsx/.mjs files>", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false", "exit_code": 0},
    {"command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src", "exit_code": 0, "result": "no dependency violations (451 modules, 2349 dependencies)"},
    {"command": "node scripts/constitution/check.mjs", "exit_code": 0, "result": "項目 21: ok 20 / 違反 0 / 検査対象なし 1 (#5 pending)"}
  ],
  "detectors": ["eslint", "typecheck", "depcruise", "check:constitution"],
  "violations": [],
  "violation_count_by_severity": {"error": 0, "warning": 0, "info": 0},
  "notes": [
    "eslint-disable directive kept: thread.aui.tsx:381 react-hooks/incompatible-library (existing, justified)",
    "Not linted by ESLint: reviewers.yml, docs/*.md, specs/*/data-model.md, tests/rule-fixtures/**"
  ]
}
```
