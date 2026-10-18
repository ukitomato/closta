# lint-agent: code-gate iter 1

- overall exit_code: 0
- detectors: lint, typecheck, depcruise, check:constitution

| command | exit_code |
|---|---|
| node node_modules/eslint/bin/eslint.js --format json <63 touched files> | 0 |
| node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false | 0 |
| node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false | 0 |
| node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src | 0 |
| node scripts/constitution/check.mjs | 0 (ok 20 / violations 0 / pending 1: #5) |

violations (warning):
- src/renderer/src/features/chat/ChatScreen.o2.test.tsx:345:85 prettier/prettier
- src/renderer/src/features/session/LivePane.o2.test.tsx:1136:32 prettier/prettier
- src/renderer/src/features/session/running-session-store.ts:707:27 prettier/prettier
- tests/rule-fixtures/expected.mjs: ESLint ignore notice (not a violation)
