# security-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 3

**Run**: 2026-09-30
**Reviewer**: security-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: この bundle で影響を受けるもの
  - FR-013: forwardKeys、転送禁止キー、WSLENV の生成、`--exec`
  - FR-014: classifyHelperPath と文字種 allowlist
  - FR-005 / FR-006: decoder の再検証と main 起動ゲート
  - FR-010 / FR-017: write/read 対称
  - SC-007 / SC-009 / SC-010
- touched files に該当する charter / Confirmation
  - AD-036 §6 (AD-041 (e) で passthrough に限定する)
  - AD-015 §5 / §7 (AD-041 (f))
  - AD-039 D3
  - AD-040 Decision 3/4 と Confirmation
  - provider charter: 一時資格をファイルに書かない
  - session charter: preset に秘密を入れない
- A. 認可 / 認証 / secret 管理 / プロセス境界 hardening: Critical:0 High:1 Medium:1 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が担当する
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が担当する (AD-036 §6 の範囲限定は人間が確定済み)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が担当する
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が担当する
- G. optional reviewer 範囲: 該当なし: security は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

round 3 では、round 2 の N-001〜N-005 が閉じたかを確かめた。対象は、改訂後の bundle で追加された次の 4 点である。

- forwardKeys (spec.md:237-243 / plan.md:162)
- isForbiddenForwardKey (spec.md:244-246 / plan.md:154-157)
- composeLaunchEnv (plan.md:194-199)
- classifyHelperPath (spec.md:252-258 / plan.md:158-160)

突き合わせた既存コードは以下。

- `derive-env.ts:32,38,46`
- `provider-service.ts:272-287`
- `validate.ts:246-253,297,312`
- `provider-record.ts:88-112,161-176`
- `launch-spec.ts:24,30,102`
- `detector.ts:22-31`
- インストール済み SDK の env 名レジストリ (`sdk.mjs:119`)

結論は次のとおり。

- forwardKeys を明示集合にしたことで、round 2 の中核は閉じた。閉じたのは、curated base の越境、親 WSLENV の越境、skip と reject の曖昧さの 3 点である。
- 残る問題は 2 点ある。
  - 転送禁止キーは汎用のシェル・ローダ系の名前しか見ていない。Claude Code 自身の実行系 env と、導出が制御するキーが漏れている。
  - env-passthrough の varNames に対象の制限が無い。

## Round 2 status

| ID | status | evidence path:line |
|---|---|---|
| N-001 (転送キー集合が未定義 / 実行を乗っ取れる env / TEMP・TMP の越境) | resolved (集合は明示された。curated base と WSL_UTF8 は除外され、違反は reject、親 WSLENV は捨てる。ただし禁止集合に漏れがある → N-101、varNames の範囲 → N-102) | spec.md:237-248, plan.md:154-157,162-164,194-199, tasks.md:35,83-87,207-213 |
| N-002 (R-01 fallback (b) が成立しない) | resolved (fallback は固定リテラルの `/bin/sh -c` に限られ、`-l` は使わず、項目 6 に登録する。(b) は不採用と明記) | spec.md:295, plan.md:310-313 |
| N-003 (helperPath の文字種) | resolved (`^/[A-Za-z0-9._/+@-]+$` で照合し、外れたら拒否。分類関数は 1 つで reachability と起動が共有する。helper の実行方式は SH-000 で実機確認する) | spec.md:257-258, plan.md:158-160, tasks.md:20,166-170,216-218 |
| N-004 (子プロセスへの秘密 env の継承と dontAsk の重なり) | resolved (AD-041 (e) の残存リスクに記載。SH-000 でキー名だけを観測する) | plan.md:265-267,309, tasks.md:21,233 |
| N-005 (`--exec` の退行を機械的に検出する手段) | resolved (prefixArgs の pin テスト。末尾が `--exec` で、`--` / `-u` / `--user` を含まない。違反 fixture として `-u root` を足す) | plan.md:288-293, tasks.md:183-186 |

## Findings

### [High] 転送禁止キーの denylist が Claude Code 自身の実行系 env (`CLAUDE_CODE_SHELL_PREFIX` / `CLAUDE_CODE_SHELL` と権限系の `CLAUDE_CODE_*`) と、導出が制御するキー (`CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_USE_BEDROCK`) を含まない。env-passthrough の検出候補の `CLAUDE_CONFIG_DIR` がそのまま越境する (N-101) (scope: feature) [new]

- **観察**:
  - 転送禁止キーの集合 (spec.md:245, plan.md:155, tasks.md:35) は次のとおりである。
    - curated base と同名のキー、`WSL_UTF8` / `WSLENV`
    - `PATH` / `HOME` / `SHELL` / `NODE_OPTIONS` / `NODE_PATH` / `LD_*` / `BASH_ENV` / `ENV` / `PROMPT_COMMAND` / `IFS` / `PS4`
    - つまりシェルとローダの汎用名だけで、Claude Code の env は入っていない。
  - インストール済み SDK の env 名レジストリ (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:119`) に次の名前が実在する。
    - `CLAUDE_CODE_SHELL_PREFIX` / `CLAUDE_CODE_SHELL`: Bash tool の実行コマンドを前置・差し替える系。
    - `CLAUDE_CODE_AUTO_MODE_EXTERNAL_PERMISSIONS` / `CLAUDE_CODE_SANDBOXED` / `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` / `CLAUDE_CODE_DISABLE_HOOK_FORWARDING`: 権限・hook 系。
    - いずれも `^[A-Z_][A-Z0-9_]*$` を満たす。`LAUNCH_ENV_DENY_PATTERN` (`launch-spec.ts:30`) にも一致しないので、extraEnv から forwardKeys に入る。
  - 現行の `derive-env.ts:32,46` は、`DERIVATION_CONTROLLED_KEYS = {CLAUDE_CONFIG_DIR}` を extraEnv から締め出している。
    - plan.md:163 / tasks.md:84 は、この締め出しを「isForbiddenForwardKey に当たるキーは拒否」に置き換える。しかし isForbiddenForwardKey の列挙に `CLAUDE_CONFIG_DIR` が無い。
    - `CLAUDE_CODE_USE_BEDROCK` (導出が注入する方式固有キー) も、資格情報の denylist と転送禁止キーの両方をすり抜ける。
  - env-passthrough の varNames にも転送禁止キーを掛ける、と書かれている (spec.md:244)。一方、検出候補の名前集合 `CREDENTIAL_ENV_NAMES` (`src/main/infra/provider/detector.ts:27`) は `CLAUDE_CONFIG_DIR` を含む。
    - その結果、検出から登録した env-passthrough Provider では、アプリの process.env にある `CLAUDE_CONFIG_DIR` (Windows 形式の値) が `/u` (パス変換なし) で WSL に届く (spec.md:240,247)。
    - これは US-4 AC2「既定 config dir を黙って掴む経路が無い」と、`provider-service.ts:262-271` の fail-closed を迂回する。RuntimePath の型の観点は platform-boundary-reviewer が担当する。本指摘は「導出が制御するキーを別の経路で上書きできる」点に限る。
- **同種事象探索**: 次の 2 つを検索した。
  - `CLAUDE_CODE_SHELL|DERIVATION_CONTROLLED_KEYS` を bundle と src/domain/provider で検索して 2 件。どちらも `derive-env.ts:32,46` で、bundle 内は 0 件。
  - `CLAUDE_CODE_SHELL_PREFIX` を SDK で検索して 2 件 (`sdk.mjs:119`, `bridge.mjs`)。
- **リスク/影響**:
  - (a) extraEnv の `CLAUDE_CODE_SHELL_PREFIX=<任意コマンド>` は、Bash tool のすべての実行に前置される。これは `BASH_ENV` と同じ種類の実行乗っ取りで、承認済みの Bash に便乗して canUseTool の外でコードが走る (CWE-15 / CWE-426)。
  - (b) 権限・hook 系の `CLAUDE_CODE_*` は、Principle III の権限ゲートを env 側から変えうる。個々の効果は未検証だが、extraEnv で持ち込めること自体が AD-041 (a) の「安全 3 値」の前提を env 側に開ける。
  - (c) 導出が制御するキーを上書きされると、利用者の意図と違う config dir・資格情報・課金先で黙って起動する。
  - providers.json は WSL 側から書き換えられるので (round 2 の前提)、extraEnv は信頼できない入力として扱う必要がある。
- **推奨アクション**:
  - (1) isForbiddenForwardKey に次を足す。
    - `CLAUDE_CODE_*` と `ANTHROPIC_*` の prefix 全体。ただし次の許可リストに限って除外する。
      - 方式固有キー (`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` / `CLAUDE_CODE_USE_BEDROCK`) は、導出の注入経路だけで出す。
      - `ANTHROPIC_BASE_URL` は AD-041 (e) で許可済みなので、明示許可として残す。
    - `CLAUDE_CONFIG_DIR`。
    - あわせて、「extraEnv / varNames が方式固有キー 6 種と衝突したら拒否する」ことを明記する。
  - (2) env-passthrough の varNames から `CLAUDE_CONFIG_DIR` を外す。detector.ts:27 の候補名からも外すか、config-dir 方式へ誘導する。
  - (3) 次を AD-041 (e) に 1 行で書く: 転送禁止を denylist で表す以上、Claude Code の新しい env は既定で通る。このため prefix 単位で deny し、許可は実名で行う。
  - (4) tasks.md BE-009 / BE-032 と SH-020 の負例に、次のキーを含む extraEnv と varNames が reject されることを足す。
    - `CLAUDE_CODE_SHELL_PREFIX`
    - `CLAUDE_CONFIG_DIR`
    - `CLAUDE_CODE_USE_BEDROCK`
- **根拠**: Principle III / V、AD-036 §6、AD-041 (e)、CWE-15 / CWE-426、round 2 N-001 の残り。
- **scope 根拠**: この feature の `domain/provider/forward-env.ts` (SH-005)、BE-009、BE-032 で直せる。

### [Medium] env-passthrough の varNames が名前規則と転送禁止キーでしか絞られない。アプリの process.env にある任意の変数 (GH_TOKEN / AZURE_* / NPM_TOKEN など) の値が WSL 内の claude まで届く (N-102) (scope: feature) [new]

- **観察**:
  - spec.md:240,247 / plan.md:164,205 は、varNames の値を「アプリ自身の process.env から取り、方式固有キーと同じ扱いで注入する」としている。
  - spec.md:248 は、資格情報系の denylist を passthrough (curated base と extraEnv) だけに掛ける。したがって varNames は `*TOKEN` / `*SECRET` / `AWS_*` も通る。
  - varNames の検証は次の箇所で、いずれも非空・長さ・制御文字しか見ない。
    - `validate.ts:312`
    - `provider-record.ts:106-112`
    - renderer の自由テキスト入力 (`ProviderScreen.tsx:61-64`)
  - 本来の対象は `CREDENTIAL_ENV_NAMES` (`detector.ts:22-31`) の 8 名である。しかし、登録値をこの集合に限る規則は bundle に無い。
- **同種事象探索**: `varNames` を src の非テストで検索して 9 件。すべて型・形状の検証で、名前の allowlist は 0 件。
- **リスク/影響**:
  - 利用者の誤入力、または WSL 側からの providers.json 改ざん (既存 Provider の id を保ったまま varNames を差し替える) が起点になる。
  - そうなると、次回の起動でホスト側 process.env の任意の秘密が WSL の claude に渡る。
  - 子プロセスは env を継承し、`dontAsk` の事前承認済み Bash からも読める (N-004 で記録済みの経路)。そのため、ホストの秘密を WSL へ持ち出す手段になる (CWE-526 / CWE-200)。
  - WSL interop が有効なら Windows のユーザー env は別経路でも読める。ただし、アプリを起動したシェルでだけ設定された値は、この経路で初めて露出する。
- **推奨アクション**:
  - varNames を `CREDENTIAL_ENV_NAMES` (から `CLAUDE_CONFIG_DIR` を除いたもの) の実名 allowlist に限る。
  - この述語を validate / provider-record / deriveLaunchEnv の 3 箇所で共有する (BE-032 に追加)。
  - allowlist の外にある既存レコードの扱い (reject して理由を示す) を AD-042 に記録する。
- **根拠**: Principle V、AD-036 §6、CWE-526、CWE-200。

### [Low] 「curated base と同名のキー」の照合で大文字小文字をどう扱うかが決まっていない。`SYSTEMROOT` / `WINDIR` は名前規則を満たし、Windows の env では `SystemRoot` / `windir` と同じ変数になる (N-103) (scope: feature) [new]

- **観察**:
  - curated base のキーは `SystemRoot` / `windir` / `TEMP` / `TMP` である (`launch-spec.ts:24`)。
  - 名前規則は `^[A-Z_][A-Z0-9_]*$` (spec.md:243) なので、`SystemRoot` は名前規則で落ちる。一方、`SYSTEMROOT` / `WINDIR` は名前規則を通る。
  - 「同名」の比較が case-sensitive なら、この 2 つは禁止に当たらない。その場合、composeLaunchEnv の合流 env (plan.md:195) には `SystemRoot` と `SYSTEMROOT` が並ぶ。
  - Windows の CreateProcess は env を大文字小文字を区別せずに扱う。重複したキーのどちらが wsl.exe に渡るかは、spawn 側の重複排除の順序に依存する。
  - SC-007 / tasks.md:213 が保証しているのは「wsl.exe の**解決**に効かない」ことだけである。
- **リスク/影響**: wsl.exe プロセスの `SystemRoot` を extraEnv で差し替えられる余地が残る。値は `/u` で WSL にも届く。
- **推奨アクション**: isForbiddenForwardKey の curated base と `WSL_UTF8` / `WSLENV` の照合を case-insensitive (`toUpperCase` で比較) と明記する。SH-020 に `SYSTEMROOT` / `WINDIR` の負例を足す。
- **根拠**: CWE-178、AD-039 D3。

### [Low] (H) 転送禁止キーの述語に集合を固定するテストが無い。名前規則の追加で既存の providers.json が read 側で弾かれたときの扱いも書かれていない (N-104) (scope: feature) [new]

- **観察**:
  - SH-020 (tasks.md:211-213) の負例は「禁止キーを含む extraEnv は拒否される」の 1 項目だけである。QUERY_OPTION_KEYS と同じ形の集合リテラルの pin テストは無く、次のケースも無い。
    - prefix 系 (`LD_*`)
    - 大文字小文字の違い
    - N-101 のキー
  - BE-032 / plan.md:215 は、provider-record の read 側に isValidForwardKeyName を掛ける。
    - 現在の X-3 の read 側は KEY の長さと制御文字しか見ないので (`provider-record.ts:165-172`)、小文字のキーを持つ既存レコードは X-4 で `invalid-record` になる。
    - 既存の store の挙動では、そのレコードの Provider が一覧から消えうる。
- **リスク/影響**: 禁止集合を縮めても誰も気づかない。既存 Provider が無言で消えれば、利用者は preset の Provider reset (US-2 AC3) を経て既定の資格情報で起動しうる。
- **推奨アクション**:
  - `forward-env.test.ts` に禁止集合の表駆動テストを置く。対象は実名、prefix、大文字小文字の違い、N-101 のキー。
  - 名前規則に違反する既存レコードの扱い (reject して理由キーを出す。無言で skip しない) を AD-042 と SH-020 に足す。
- **根拠**: X-3 SEC-M-001 (write/read 対称)、Principle V。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| N-101 | `CLAUDE_CODE_SHELL\|DERIVATION_CONTROLLED_KEYS` (specs/008 bundle, src/domain/provider, src/main/infra/runtime) | 2 | src/domain/provider/derive-env.ts:32, src/domain/provider/derive-env.ts:46 |
| N-101 | `CLAUDE_CODE_SHELL_PREFIX` (node_modules/@anthropic-ai/claude-agent-sdk) | 2 | node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:119, node_modules/@anthropic-ai/claude-agent-sdk/bridge.mjs |
| N-101 | `CLAUDE_CONFIG_DIR` in CREDENTIAL_ENV_NAMES | 1 | src/main/infra/provider/detector.ts:27 |
| N-102 | `varNames` (src 非テスト) | 9 | src/main/app/validate.ts:312, src/main/infra/settings/provider-record.ts:108-112, src/main/infra/provider/detect.ts:84, src/domain/provider/types.ts:58,108, src/domain/provider/detect.ts:19,43, src/renderer/src/features/provider/ProviderScreen.tsx:64, src/main/app/provider-service.ts:131 |
| N-103 | `toUpperCase\|case-insensitive\|大文字小文字` (bundle, src/domain/provider, src/main/infra/runtime) | 1 | src/main/infra/runtime/wsl-output.ts:212 |
| N-104 | `extraEnv` KEY 検証 (provider-record read 側) | 1 | src/main/infra/settings/provider-record.ts:165 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 2
- Round inheritance: resolved from 2: 5 (N-001〜N-005) / unresolved: 0 / new: 4 (N-101〜N-104)

関連ファイル:
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\spec.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\plan.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\tasks.md
- C:\dev\closta\src\domain\provider\derive-env.ts
- C:\dev\closta\src\main\infra\provider\detector.ts
- C:\dev\closta\src\main\infra\runtime\launch-spec.ts
- C:\dev\closta\src\main\app\validate.ts
- C:\dev\closta\src\main\infra\settings\provider-record.ts
- C:\dev\closta\node_modules\@anthropic-ai\claude-agent-sdk\sdk.mjs
