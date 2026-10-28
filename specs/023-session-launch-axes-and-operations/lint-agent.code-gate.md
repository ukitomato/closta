# lint-agent — code-gate iter 1 (re-run from reviewing)

**Scope**: specs/023-session-launch-axes-and-operations/.code-gate-scope.txt (76 files, base 1a7d8b4..HEAD)

**exit_code**: 0

| Command | exit |
|---|---|
| node node_modules/eslint/bin/eslint.js --format json --cache . | 0 |
| node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false | 0 |
| node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json | 0 |
| node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src | 0 (555 modules / 3017 deps, no violations) |
| node scripts/constitution/check.mjs | 0 (item 21: ok 20 / violations 0 / no-target 1) |

detectors: lint, typecheck, depcruise, check:constitution (test:rules not run)

## Violations (in scope)

| Severity | Count | Rule |
|---|---|---|
| error | 0 | - |
| warning | 445 | prettier/prettier (59 files) |
| info | 0 | - |

Severity mapping: warning -> SHOULD_FIX (High). No MUST_FIX.

Raw: scratchpad lint-agent-out.json / eslint.json (session scratchpad, not persisted).
