# test-agent: code-gate iter 1

- command: node node_modules/vitest/vitest.mjs run --reporter=json
- scope: full
- exit_code: 0
- passed 3449 / failed 0 / skipped 0 / error 0, test files 801
- unhandled errors: 0
- failed_tests: []
- test:rules: not run
