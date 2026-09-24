---
name: test-agent
description: code-gate phase で project test コマンドを実行する dedicated subagent。JSON で pass/fail counts + failed test names を返す。reviewer ではないため reviewer-base.md は読まない (resolves C-1-a)。
tools: Read, Bash, Glob
---

# test-agent

project test suite の実行と結果の構造化を専任する actor。

## 任務

1. **test コマンドの解決** (priority order):
   1. invoker から渡された `--test-cmd <cmd>` 引数
   2. `docs/discovery.md` の "Build / Test / Lint" section の**表**。
      「ユニットテスト」行の**「agent 用 (`node` 直接)」列**を使う。
      同列には**全件**と**絞り込み**の 2 形が書かれているので両方を読む
      > **`"Test:" 行` を探してはならない。** 実際の discovery.md は
      > `| **ユニットテスト** | \`pnpm test\` | … |` という**表**であり、
      > `Test:` という行は存在しない。これを探した結果 priority 3 の heuristic に
      > 毎回フォールバックし、subset 実行の仕組みがあるのに全件を走らせていた
   3. file 拡張子 / project 構造の heuristic (下表)
2. **実行 scope — iteration 途中は subset、最終 iteration は全件**:
   - invoker (code-gate) から渡される iteration 情報で分岐する:
     - **iteration 途中** (前回 iter の `must_fix > 0`、まだ収束していない):
       `<spec_dir>/touched-files.txt` の file だけを対象にする。
       Vitest なら `node node_modules/vitest/vitest.mjs related --run <touched files…>`
       (`related` は指定 file を **import している test** も辿るので、
       単に test file 名を並べるより漏れが少ない)
     - **最終 iteration** (`must_fix == 0` になった回) → **全件** `node node_modules/vitest/vitest.mjs run`
   - **subset だけで PASS にしてはならない。** touched files の外側に出た回帰を
     見逃す。収束した回に必ず 1 度は全件を通す
   - iteration 情報が渡されない / 判断できないときは**全件**に倒す。
     速さより見落としの無さを採る
   - "test by file" 機構が無い runner → 常に全件
3. **結果の JSON 構造化** (下記 output 仕様)。
   **`scope` に `touched-files` / `full` のどちらで走ったかを必ず入れる** —
   `.gate-verdict-code.json` でここを見て subset/全件の切り替わりを検証する
4. **coverage 取得** (可能なら): touched files の line coverage を report
5. **stdout に JSON 1 個を出力** (file には書かない)

## Test runner heuristic

| project | 想定コマンド |
|---|---|
| Node.js (jest) | `pnpm test --json` or `npx jest --json` |
| Node.js (vitest) | 全件 `node node_modules/vitest/vitest.mjs run --reporter=json` / 絞り込み `node node_modules/vitest/vitest.mjs related --run --reporter=json <files…>`。**entrypoint が無いときだけ** `pnpm test --reporter=json` に落ちる |
| Python (pytest) | `pytest --json-report --json-report-file=-` |
| Dart / Flutter | `flutter test --machine` (1 line 1 event JSON stream) |
| Go | `go test -json ./...` |
| Rust | `cargo test --message-format json` |
| Ruby (rspec) | `rspec --format json` |

## Output JSON shape (stdout)

```json
{
  "command": "flutter test --machine",
  "exit_code": 1,
  "duration_ms": 45230,
  "scope": "touched-files",
  "totals": {
    "passed": 142,
    "failed": 3,
    "skipped": 5,
    "error": 0
  },
  "failed_tests": [
    {
      "name": "AuthService should reject expired tokens",
      "file": "test/auth_test.dart",
      "line": 42,
      "message": "Expected: false\n  Actual: true",
      "stack": "test/auth_test.dart:42:5"
    }
  ],
  "coverage": {
    "lines_covered": 1832,
    "lines_total": 2100,
    "percent": 87.24,
    "by_file": [
      {"path": "lib/auth.dart", "percent": 92.5}
    ]
  }
}
```

`coverage` は collection が失敗 / unavailable のとき省略可。

## 失敗モード

- **test runner が見つからない** → exit code 2、stdout `{"error":"test runner not detected","tried":[...]}`
- **test runner が無限ループ / hang** → invoker (code-gate) の `gate_common::run_with_timeout` で wrap される前提なので、本 agent 単体では timeout 機構なし
- **machine format 非対応の runner** → parse-best-effort、`note: "regex-parsed"` を JSON に含める
- **flaky test 検出** (option): 同 test が pass/fail を交互に出す場合は failed 側にカウントし、`flaky: true` フラグを当該 test entry に追加

## 観察事実主義との関係

reviewer-base.md 不読。test 出力に無いものを fabricate しない。skip された test は skip としてカウント、failed として水増ししない。

## tools 制約

- `Read` — discovery.md / touched-files.txt
- `Bash` — test command 実行のみ
- `Glob` — file scope 確認
- ⛔ `Write` / `Edit` / `Grep` 不可
