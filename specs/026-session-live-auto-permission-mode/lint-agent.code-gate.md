# lint-agent (code-gate iter 3)

> iter 3 (scope 77 files, item21.test.ts を含む): 5 コマンドすべて exit 0。eslint error 0 / warning 63 (prettier/prettier。iter 2 と同じ箇所)。e2e / md / fixture の 19 ファイルは eslint 対象外の notice。depcruise 違反なし (575 modules)。check:constitution ok / 違反 0 / #5 pending。以下は iter 2 の内訳で、iter 3 も同じ。

**Run**: 2026-11-01
**Overall exit_code**: 0
**detectors**: eslint, typecheck (tsconfig.node.json), typecheck (tsconfig.web.json), depcruise, check:constitution (test:rules は実行しない)

| command | exit_code | 結果 |
|---|---|---|
| `node node_modules/eslint/bin/eslint.js --format json --cache <59 files from .code-gate-scope.txt>` | 0 | error 0 / warning 65 (prettier/prettier 63, e2e ignored-file notice 2) |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` | 0 | 出力なし |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false` | 0 | 出力なし |
| `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | 0 | no dependency violations (575 modules, 3180 deps) |
| `node scripts/constitution/check.mjs` | 0 | ok 20 / violations 0 / no-target 1 (#5 pending、R-1 設計どおり) |

## violations (severity warning, 63 件 + notice 2 件)

prettier/prettier の整形差分。ファイル別件数:

- src/main/app/session-launch-service.test.ts: 20 (1059-1069, 1093-1101)
- src/main/app/validate.ts: 1 (442)
- src/preload/index.ts: 1 (87)
- src/renderer/src/features/session/AutoModeConfirmation.test.tsx: 4 (6, 40, 54, 77)
- src/renderer/src/features/session/LaunchDialog.resume.test.tsx: 8 (154, 199, 301, 303, 379, 403, 426, 449)
- src/renderer/src/features/session/LaunchDialog.test.tsx: 24 (219, 291, 324, 642, 710, 847, 888, 1202, 1215, 1257, 1289, 1486, 1568, 1717, 1767, 1791, 2002, 2017, 2069, 2117, 2130, 2174, 2315, 2331)
- src/renderer/src/features/session/LivePane.settings.test.tsx: 1 (342)
- src/renderer/src/features/session/RunningSessionsProvider.test.tsx: 2 (188, 189)
- src/renderer/src/features/session/RunningSessionsProvider.tsx: 1 (100)
- src/renderer/src/features/session/resume-action.test.tsx: 1 (275)
- e2e/launch-dialog.spec.ts, e2e/live-session-settings.spec.ts: ignored-file notice (AD-038 D2 で e2e は eslint の対象外。違反ではない)

lint の対象外 (md / fixture): docs/**, .specify/**, quickstart-results.md, tests/rule-fixtures/*.ts.fixture (6), tests/rule-fixtures/expected.mjs
