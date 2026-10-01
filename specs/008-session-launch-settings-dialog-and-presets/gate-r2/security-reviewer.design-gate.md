# security-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 2

**Run**: 2026-09-30
**Reviewer**: security-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: この bundle で影響を受けるもの。
  - FR-001/004/005: 起動 config、安全 3 値、launch メッセージの明示フィールドと decoder の再検証
  - FR-006/007: main 起動ゲートでの再評価
  - FR-009/010: preset の write/read 対称
  - FR-012/013/014: config-dir の RuntimePath、実名 WSLENV の生成、`--exec`、helperPath の分類
  - FR-017: モデル ID の文字種 allowlist
  - SC-002/003/004/005/007/009/010
- touched files に該当する charter / Confirmation:
  - session charter (preset に秘密を入れない)
  - provider charter (一時資格をファイルに書かない)
  - AD-036 §4 P1 / §5 / §6 (§6 は AD-041 (e) で passthrough に範囲を限定する予定)
  - AD-015 §5 / §7 (AD-041 (f) で `--exec` と整合させる)
  - AD-039 D3 (curated base を spread する)
  - AD-040 Decision 3/4 + Confirmation (query 直前の assert)
  - check.mjs 項目 2 (`WSL_ALLOWED_ARGS`) と項目 16
- A. 認可 / 認証 / secret 管理 / プロセス境界 hardening: Critical:0 High:1 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:2 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner (AD-036 §6 の範囲限定そのものは人間の決定で確定済み)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: 該当なし: security は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

round 2 では、改訂後の bundle が round-1 の H-001〜H-004 / M-001〜M-006 / L-001〜L-005 を閉じたかを確かめた。あわせて、新しく入った実名 WSLENV の生成 (FR-013 / plan の `composeLaunchEnv`) と `wsl.exe --exec` (FR-013 / R-01) が生む新しい露出面を見た。突き合わせた既存コードは以下。

- `derive-env.ts:38-49`: 導出 env は curatedBase と extraEnv を spread する
- `provider-service.ts:282-287`: curatedBase は `buildLaunchEnv(process.env)`
- `validate.ts:246-253`: extraEnv の KEY 検証
- `launch-spec.ts:30,102`: denylist と `--` 形の argv
- `session-core.ts:175-183`: env は spec.env だけ、argv は配列
- `sdk-agent-session.ts:163-183`: 現行の decoder

helper の生成が X-7 へ繰り越されたので、H-003 / H-004 の対象は本 feature から無くなった。

## Round 1 status

| ID | status | evidence path:line |
|---|---|---|
| H-001 (env の配送経路が未設計) | resolved (配送経路は決まった。ただし対象キー集合の定義に新しい穴がある → N-001) | spec.md:225-230 (FR-013), plan.md:160-163, plan.md:184, tasks.md:71-75 |
| H-002 (`--` 以降のシェル解釈 + model ID が未検証) | resolved (SH-000 の成立が条件。fallback には問題が残る → N-002) | spec.md:180-181 (FR-017), spec.md:230, plan.md:154,182, tasks.md:16,26 |
| H-003 (assume-role のパラメータ検証) | resolved (X-7 へ繰り越し。対象が消えた) | spec.md:39-42, spec.md:265, plan.md:53, plan.md:146 |
| H-004 (userData helper の完全性) | resolved (X-7 へ繰り越し。ファイルを生成しない) | spec.md:332, plan.md:53 |
| M-001 (launch メッセージと decoder) | resolved | spec.md:192 (FR-005), plan.md:176-177, tasks.md:55-60 |
| M-002 (main での再解決) | resolved | spec.md:199 (FR-006), plan.md:195, tasks.md:63 |
| M-003 (fork env への資格情報混入) | resolved | spec.md:229, plan.md:200, tasks.md:66,173 |
| M-004 (ExitPlanMode の遷移) | resolved | spec.md:186, plan.md:235 |
| M-005 (preset の read 側の検証) | resolved | spec.md:217 (FR-010), plan.md:187, tasks.md:105, spec.md:285 (SC-004) |
| M-006 (テストの欠落) | resolved | tasks.md:169-177 (SH-020), tasks.md:187-188 (SH-023) |
| L-001 (preset 名の理由付け) | resolved | plan.md:124 (#17), spec.md:212 |
| L-002 (quickstart に秘密を記録しない) | resolved | tasks.md:189 |
| L-003 (IPC 登録方法と id 照合) | resolved | plan.md:204,209, tasks.md:108,110 |
| L-004 (`'default'` sentinel の衝突) | resolved | spec.md:170, plan.md:152 |
| L-005 (失敗理由キー) | resolved | plan.md:197, tasks.md:67 |

## Findings

### [High] WSLENV に載せる「導出キー」の集合が定義されていない。`DerivedLaunchEnv.env` には curatedBase と extraEnv が混ざっているので、実行を乗っ取れる env (NODE_OPTIONS / LD_PRELOAD / PATH / ANTHROPIC_BASE_URL など) と Windows の TEMP/TMP が初めて Linux 側の claude に届く (N-001) (scope: feature) [new]

- **観察**:
  - 設計側の記述:
    - `plan.md:160-163`: `composeLaunchEnv(curatedBase, derived)` は「`derived` のキーの実名に `/u` を付けて連結し、`^[A-Z_][A-Z0-9_]*$` に限る」。
    - `spec.md:227`: 「導出キーの実名だけで WSLENV を生成」。
    - `plan.md:184`: 「denylist は passthrough (curated base) にだけ掛ける」。
  - 実際の `derived` (`DerivedLaunchEnv.env`) の中身:
    - (1) `{ ...curatedBase }` (`derive-env.ts:38`)。`SystemRoot`/`windir`/`TEMP`/`TMP`/`WSL_UTF8` が入る (`launch-spec.ts:24,47`)。
    - (2) extraEnv (`derive-env.ts:44-48`)。資格情報 denylist と `CLAUDE_CONFIG_DIR` だけを除外する。
    - (3) curated 注入キー。
  - extraEnv の KEY 検証は `isValidName` (非空・長さ・制御文字なし) だけ (`validate.ts:246-253`)。`NODE_OPTIONS` / `NODE_PATH` / `LD_PRELOAD` / `BASH_ENV` / `PATH` / `HOME` / `ANTHROPIC_BASE_URL` は `LAUNCH_ENV_DENY_PATTERN` (`launch-spec.ts:30`) にも一致しない。
  - X-1/X-3 の時点では WSLENV が無く env が wsl.exe を越えなかった (spec.md:130)。このため extraEnv は事実上無効で、ここが問題にならなかった。FR-013 で初めて有効になる。
  - env-passthrough の varNames は「infra が curatedBase に合流済み」とコメントされている (`derive-env.ts:86`)。しかし curatedBase は `buildLaunchEnv(process.env)` (`provider-service.ts:285` / `composition-root.ts:285`) で、許可リストの 4 キーしか持たず、varNames は合流していない。WSLENV に載せるかどうかの規則も bundle に無い。
- **同種事象探索**: `NODE_OPTIONS|LD_PRELOAD|BASH_ENV|ANTHROPIC_BASE_URL` を src / scripts / decisions / specs 007-008 で検索して 1 件 (`detector.ts:25`。env-passthrough の候補名に `ANTHROPIC_BASE_URL` がある)。実行を乗っ取れるキーの denylist は 0 件。
- **リスク/影響**: 実装者が plan の文言どおり「`derived` の全キー」を WSLENV に載せた場合の影響。
  - (a) extraEnv の `NODE_OPTIONS=--require …` / `LD_PRELOAD` で、Linux 側の claude プロセス内で任意コードが実行される。canUseTool を経ない (CWE-426 / CWE-15)。
  - (b) api-key Provider で `ANTHROPIC_BASE_URL` を差し替えると、`ANTHROPIC_API_KEY` が任意のホストへ送られる。
  - (c) `PATH` を上書きすると、Bash tool 経由で起動するバイナリの解決が乗っ取られる。
  - (d) curatedBase の `TMP`/`TEMP` (Windows 形式の値。`/u` は変換しない) が Linux に入る。Node の `os.tmpdir()` は POSIX で `TMPDIR`→`TMP`→`TEMP` の順に参照するので、一時ファイルが作業フォルダ内の相対パス `C:\Users\...` に書かれうる。機密を含む一時ファイルが repo に混入する。
  - providers.json は /mnt/c 経由で WSL 側から書き換えられるので (round-1 H-004 と同じ前提)、extraEnv は信頼できない入力として扱う必要がある。
  - `^[A-Z_][A-Z0-9_]*$` に「限る」が skip なのか reject なのかも決まっていない。reject なら、`SystemRoot`/`windir` が常に一致しないので全起動が失敗する。
- **推奨アクション**:
  - (1) AD-041 (e) と plan に、WSLENV に載せるキー集合を実名で固定する。例:
    - curated 注入分 = `{ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, AWS_PROFILE, AWS_REGION, CLAUDE_CODE_USE_BEDROCK, CLAUDE_CONFIG_DIR}`
    - これに ∪ として「extraEnv / env-passthrough を越境させるか」の明示判断を加える
    - curatedBase のキー (`SystemRoot`/`windir`/`TEMP`/`TMP`/`WSL_UTF8`) は必ず除く。
  - (2) extraEnv / env-passthrough を越境させるなら、実行を乗っ取れる env の denylist を置く (`NODE_OPTIONS`, `NODE_PATH`, `LD_*`, `DYLD_*`, `BASH_ENV`, `ENV`, `PATH`, `HOME`, `SHELL`, `PS4`, `PROMPT_COMMAND`, `IFS`)。これを `validate.ts` の `isValidExtraEnv`、`provider-record`、`composeLaunchEnv` の 3 箇所で共有する (write/read 対称)。
  - (3) `ANTHROPIC_BASE_URL` など送信先を変える env の扱い (許可するなら「資格情報と同時に載る」ことを AD-041 の残存リスクに書く) を決める。
  - (4) 名前規則の違反は reject (理由キー `invalid-config`) なのか skip なのかを明記する。
  - (5) SH-020 の `composeLaunchEnv` のテストに負例を足す: curatedBase のキーが WSLENV に 0、hijack キーを含む extraEnv が 0 または reject、env-passthrough の扱い。
- **根拠**: AD-036 §6、AD-039 D3、Principle V、CWE-426 / CWE-15 / CWE-522。
- **scope 根拠**: この feature の BE-009 / BE-032 / AD-041 (e) で直せる。

### [Medium] R-01 の fallback (b)「`--` を維持し、全要素にメタ文字なしを assert」は成立しない。settings の JSON は本質的に `"{}` を含み、モデル ID の allowlist は glob 文字 `[]` を許す (N-002) (scope: feature) [new]

- **観察**:
  - `plan.md:257-259` は、`--exec` が成立しない場合の fallback を 2 つ挙げている。
    - (a) `--exec /bin/sh -lc 'exec "$0" "$@"' <claudePath> ...`
    - (b) `--` を維持して「全要素にシェルメタ文字を含まない」assert を掛ける
  - (b) が成立しない理由:
    - helper 系 Provider では、SDK が `--settings` に JSON を argv として渡す (round-1 H-002 の前提)。JSON には `"` `{` `}` が必ず入る。
    - `spec.md:180` の model ID の allowlist は `[` `]` を許す。これは `--` 経由のシェルで glob として展開される。
    - 実測 A (`plan.md:37`) で `\` の消去と `$(...)` の展開を確認済み。
- **同種事象探索**: `シェルメタ文字を含まない` を bundle 内で検索して 1 件 (plan.md:259)。
- **リスク/影響**: (b) を採ると、helper 系の起動が常に assert で失敗する。それを避けようとして assert の対象を緩める (JSON を除外する) 誘因が生まれ、round-1 H-002 の注入経路が戻る。
- **推奨アクション**:
  - fallback (b) を plan / AD-041 (f) の候補から外す。`--exec` が不成立なら (a) だけにする。
  - (a) を採る場合は、次を AD-041 (f) に書く。
    - スクリプト本文は固定リテラルとし、`"$@"` を引用したまま `eval` しない。
    - `-l` で login profile が読まれることを残存リスクとして記録する。
  - SH-000 の確認項目に「`[1m]` 付きの model ID が原文どおり届く」を足す。
- **根拠**: CWE-78、AD-015 §5、plan 実測 A。

### [Medium] helperPath は Claude Code が「スクリプトとして実行する」値なのに、FR-014 の分類は名前空間と制御文字しか見ない。HostPath から変換したパスは空白 / `(` / `'` / `$` を含みうる (N-003) (scope: feature) [new]

- **観察**:
  - SDK の型は `apiKeyHelper` を「Path to a script that outputs authentication values」、`awsCredentialExport` を「Path to a script that exports AWS credentials」としている (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6138-6148`)。実行の仕方 (シェル経由か execFile か) は型からは分からない。
  - FR-014 (`spec.md:232-234`) と BE-031/032 (`tasks.md:146-149`) の扱いは次のとおり。
    - POSIX 絶対パスはそのまま使う。
    - HostPath は PathMapping で変換する。
    - それ以外は制御文字だけを拒否する。
  - Windows のパスは `Program Files (x86)`、`O'Brien`、`$` を含むディレクトリ名を普通に取りうる。変換すると `/mnt/c/Program Files (x86)/...` になる。
  - X-3 の `validate.ts:297` は `isStr(c.helperPath)` だけを見る。
- **同種事象探索**: `helperPath` の検証器で文字種を見るものは 0 件 (`validate.ts:297` と `provider-record.ts` はどちらも型と長さだけ)。
- **リスク/影響**: Claude Code が helper をシェル経由で実行するなら、helperPath 内のメタ文字はコマンドインジェクション (CWE-78) になる。空白や括弧のような無害な文字でも helper の起動が壊れる。helper はセッション中に canUseTool を経ずに繰り返し実行される。
- **推奨アクション**:
  - SH-000 に「helper の実行方式 (シェル経由かどうか)」の実機確認を足し、結果を AD-041 に記録する。
  - シェル経由なら、分類後の RuntimePath を文字種 allowlist で照合し、外れたら理由キーで起動を拒否する。例: `^/[A-Za-z0-9._/+@-]+$`。
  - この述語を validate / provider-record / 起動時分類の 3 箇所で共有する。
- **根拠**: CWE-78 / CWE-20、X-3 SEC-L-201、AD-040。

### [Low] R-04 の残存リスクに「`--exec` で届いた秘密 env は claude の tool 子プロセスにも継承される」ことが書かれていない。`dontAsk` の新設と重なる (N-004) (scope: feature) [new]

- **観察**: `plan.md:263` の R-04 は、Windows 側で wsl.exe の env が見えることだけを残存リスクにしている。
  - FR-013 で `ANTHROPIC_API_KEY` などが Linux 側の claude の env に初めて入る。その子プロセス (Bash tool) は既定で env を継承する。
  - `dontAsk` (`spec.md:76-78`) では、事前承認ルールに一致する Bash は承認カードを経ずに実行される。
- **リスク/影響**: prompt injection によって、事前承認済みの Bash から秘密 env を読み出して送信する経路が、カードを経ずに成立しうる (CWE-526)。
- **推奨アクション**:
  - AD-041 の残存リスクに、子プロセスへの継承と `dontAsk` との組み合わせを 1 行足す。
  - quickstart SH-023 で、Bash tool から秘密 env が見えるかを「キー名の有無だけ」で記録する (値は記録しない)。
- **根拠**: Principle V、AD-036 §6、CWE-526。

### [Low] (H) `--exec` 化の regression を防ぐ機械的な保証が unit の形のテストだけで、項目 2 は `--exec` の追加しか予定していない (N-005) (scope: feature) [new]

- **観察**: `tasks.md:75` / `plan.md:244` は `WSL_ALLOWED_ARGS` に `--exec` を足すだけである。項目 2 はリテラルの allowlist 照合 (`check.mjs:167-173`) なので、launch-spec が `--` 形に戻っても違反にならない。
- **推奨アクション**:
  - SH-020 の `--exec` 形の pin テストに加えて、`launch-spec.ts` の prefixArgs に `--` リテラルが無いことの assert を置く (unit でも check.mjs でもよい)。
  - quickstart の SC-009 leg (メタ文字が展開されない) を、起動経路の変更時に再実行する対象として記録する。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| N-001 | `NODE_OPTIONS\|LD_PRELOAD\|BASH_ENV\|ANTHROPIC_BASE_URL` (src, scripts, decisions, specs/007-008) | 1 | src/main/infra/provider/detector.ts:25 |
| N-001 | `extraEnv\|env-passthrough\|isDeniedEnvKey` (src, 非テスト) | 50 | derive-env.ts:38,44-48,86; validate.ts:246-253; provider-service.ts:285-287; composition-root.ts:285-287 ほか |
| N-002 | `シェルメタ文字を含まない` (bundle) | 1 | specs/008-session-launch-settings-dialog-and-presets/plan.md:259 |
| N-003 | `apiKeyHelper\|awsCredentialExport` (sdk.d.ts) | 5 | node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6138-6148 |
| N-005 | `WSL_ALLOWED_ARGS` (scripts/constitution) | 3 | check.mjs:60,167; allowlists.mjs:163 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 2
- Round inheritance: resolved from 1: 15 (H-001〜H-004, M-001〜M-006, L-001〜L-005) / unresolved: 0 / new: 5 (N-001〜N-005)
