# lint-agent — code-gate iteration 1

```json
{
  "command": "node node_modules/eslint/bin/eslint.js --cache --no-warn-ignored --format json <77 touched files>",
  "commands": [
    {"command": "node node_modules/eslint/bin/eslint.js --cache --no-warn-ignored --format json <77 touched files>", "detector": "lint", "exit_code": 0, "duration_ms": 133956, "scope": "touched-files", "files_linted": 77},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false --pretty false", "detector": "typecheck", "exit_code": 0, "duration_ms": 9665, "scope": "project"},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false --pretty false", "detector": "typecheck", "exit_code": 0, "duration_ms": 15976, "scope": "project"},
    {"command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src --output-type err-long", "detector": "depcruise", "exit_code": 0, "duration_ms": 14583, "scope": "project", "summary": "no dependency violations found (411 modules, 2093 dependencies cruised)"},
    {"command": "node scripts/constitution/check.mjs", "detector": "check:constitution", "exit_code": 0, "duration_ms": 2137, "scope": "project", "summary": "項目 21 件: ok 20 / 違反 0 / 検査対象なし 1 (#5 pending)"}
  ],
  "detectors": ["lint", "typecheck", "depcruise", "check:constitution"],
  "exit_code": 0,
  "duration_ms": 176318,
  "scope": "touched-files",
  "touched_count": 88,
  "lintable_touched_count": 77,
  "violations": [],
  "violation_count_by_severity": {"error": 0, "warning": 0, "info": 0},
  "notes": [
    "コマンドは docs/discovery.md の Build / Test / Lint 表の「agent 用」列から決めた。eslint は '.' の代わりに touched files のうち lint できる 77 件 (.ts/.tsx/.mjs) を渡し、--format json と --no-warn-ignored を付けた。tsc には --pretty false、depcruise には --output-type err-long を付けた",
    "eslint は 77 件全部が lint 対象になった (ignore で落ちたファイルは 0 件)。lint できない touched files 11 件 (.md 10 件、.yml 1 件) は渡していない",
    "tsc / depcruise / check:constitution は project 全体を対象に走らせた。project 全体でも違反 0 件なので、touched files への抽出で落とした件数も 0 件",
    "抑止済みのメッセージが 1 件ある (violations には入れていない): src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:366:23 の react-hooks/incompatible-library。eslint-disable-next-line で抑止しており、justification は空",
    "check:constitution の #5 は pending (docker を名指せるモジュールが 0 件で、検査対象が無い)。違反ではない",
    "eslint だけで 133956ms かかった。キャッシュが効かなかった可能性がある (touched files に eslint.config.mjs が含まれている)",
    "実行していないもの: test:rules (code-gate では実行しない規則)、build / packaging / format (lint ではない)。e2e/tsconfig.json と perf/tsconfig.json の型検査は、touched files に e2e/ と perf/ のファイルが無いため実行していない"
  ]
}
```
