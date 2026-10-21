# lint-agent (code-gate iter 1)

- command: node node_modules/eslint/bin/eslint.js --format json <touched 58 files>
- exit_code: 0 / error 0 / warning 4399 (prettier/prettier `Delete ␍` 4398 + e2e ignored-file 1) / info 0
- 追加検出器 (invoker 実行): tsc node exit 0 / tsc web exit 0 / depcruise exit 0 (違反 0) / check:constitution exit 0 (違反 0)
- test:rules: 未実行 (code-gate の規定)
