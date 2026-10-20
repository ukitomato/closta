# Implementation Plan: Win32Runtime の直接起動 (X-8)

**Branch**: `020-session-win32-direct-launch` (main 0ba52bd の上) | **Date**: 2026-10-20 (`/cl-plan`) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-4 は **2026-10-19 に利用者が承認**)

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [contracts/ipc-win32-claude.md](./contracts/ipc-win32-claude.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-20 の作業ツリーと突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## 判断の承認

- **U-1〜U-4 は 2026-10-19 に利用者が承認した** (spec の「判断の一覧」)。本 plan の決定はどれもその範囲の中の実装の選択で、新しい利用者の判断は無い (`.needs-input.md` は作っていない)
- AGENTS.md の gated 確定事項 (domain の分解・Constitution Principle の採否) に当たるものは無い。domain は spec の `domain_selected_by: user` (session)。runtime domain の descriptor・検出・設定に触れる点は、spec の FR-004〜FR-007 / FR-015 が既に範囲に入れている (下の「Domain charter の整合」)
- **AD-058 は accepted (2026-10-21)**。夜間の自走の規則 (2026-10-21 に利用者が決定: 承認の要る判断は推奨案で採用して進む) で、design-gate R2 PASS の版を推奨案のまま採用した (RK-01。覆すときは別の PR)。plan の段で 1 つの ADR にまとめた (起動の契約と停止は同じ `Win32LaunchSpec` の `stop` で結ばれ、片方だけを承認しても実装できないため)

## Summary

- **起動 (US-1)**: `RuntimeLaunchSpec` を `WslLaunchSpec` (今の形) と `Win32LaunchSpec` の和にする (data-model §5)。main の起動の準備に Win32 の段 (§7) を足し、`claude.exe` を作業フォルダの HostPath を cwd にしてシェルなし・`windowsHide` で直接起動する。agents の `decodeLaunchSpec` と `composeClaudeSpawn` を種類で分ける (WSL の規則は変えない)
- **claude の場所 (US-2)**: 検出の `list()` で `claude.exe` を 1 回探し (上書き → `%USERPROFILE%\.local\bin` → PATH)、`claudeStatus` の 4 値を descriptor と DTO に持つ (§1〜§4)。場所の指定は userData の `runtime-settings.json` と 2 つの IPC (contracts C-1 / C-2)。起動の失敗の理由は今の `claude-not-found` (18 のまま)
- **止める (US-3)**: 強制終了・閉じる・アプリの終了で、セッションスレッドが stdin を閉じる前に `taskkill /T /F /PID` で木ごと止める (§9)。終了の待ちを 3 つ延ばす (§9.3)。保証の範囲は AD-058 Decision 3 の表
- **Provider (US-4)**: Win32 の env は 30 キーの許可リスト + 導出の `forwardKeys` (§6。proxy の 3 キーは Provider が上書きしてよい。`NODE_EXTRA_CA_CERTS` は Win32 の transport のキーで、extraEnv に持つ Provider は Win32 で到達不可)。config ディレクトリの判定と導出を `resolveConfigDirPath` に寄せ、`assessReachability` の win32 の特例を消す (§8)。extraEnv が Win32 の transport のキーに当たる Provider は判定で到達不可にする (§6.4)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (`spawnClaudeCodeProcess` の挙動は research R-01)。Node の `child_process` (agents の既存の spawn の経路)。新しい依存は足さない

**Storage**: userData の `runtime-settings.json` (新設。data-model §3。版と 1 つのパスだけ)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe、Constitution 検証 (`node scripts/constitution/check.mjs`)、rule fixtures (`tests/rule-fixtures/`)。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker) / domain)

**Performance Goals**: claude の探索は `list()` の中で WSL の 3 つの呼び出しと並列 (`isFile` 最大 258 回。PATH の要素 64 まで)。停止は 5 秒以内 (FR-012)

**Constraints**: data-model の冒頭の「変えないもの」。`LaunchFailureReason` は 18 のまま、`IPC_CHANNELS` は 2 つ増える、`RuntimeDescriptorDTO` のキーは 9 → 11、終了の待ちは §9.3

**Scale/Scope**: FR 16 / SC 6。新しい IPC 2 つ・設定ファイル 1 つ・新設のモジュール 4 つ (domain 1・infra 3)

### レイヤごとの変更 (2026-10-20 の作業ツリー = main 0ba52bd で確かめた)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/runtime/claude-executable.ts` (新設) | `classifyClaudeExecutable` (data-model §1.1) | — |
| domain | `src/domain/runtime/descriptor.ts` | `Win32ClaudeStatus`・`Win32RuntimeDescriptor` の 3 キー (§1.2) | `Win32RuntimeDescriptor` |
| main (infra) | `src/main/infra/runtime/win32.ts` | `createWin32Descriptor(now, claude)` (§1.2。factory の置き場所は今のまま) | `createWin32Descriptor` |
| domain / main (app) | `src/domain/runtime/dto.ts` / `src/main/app/dto-mapper.ts` | `claudeStatus` / `claudeOverridden` (§4) | `RuntimeDescriptorDTO`・`toRuntimeDescriptorDTO` |
| domain | `src/domain/session/agent-session.ts` | `WslLaunchSpec` / `Win32LaunchSpec` (`windowsHide`・`stop`) / 和の `RuntimeLaunchSpec`・停止の引数とコマンドの名前の正本 `WIN32_TREE_STOP_ARGS` / `WIN32_TREE_STOP_COMMAND_NAME` (§5) | `RuntimeLaunchSpec` |
| domain | `src/domain/session/launch-resolution.ts` | `RuntimeFact.distroName: string \| null`・`distro-mismatch` の条件 (§7) | `:38`, `:108` |
| domain | `src/domain/provider/helper-path.ts` / `reachability.ts` / `types.ts` | `resolveConfigDirPath` の win32 の分岐・戻りの型・`assessReachability` の win32 の特例を消す・`configDirRuntimePath` の型 (§8)・`assessReachability` に transport の禁止キーの述語を注入し extraEnv の衝突で到達不可 (§6.4) | `reachability.ts:39-53`、`types.ts:153` |
| domain | `src/domain/workspace/resolution.ts` | 注記だけ (X-8 は U-3 で到達不可のまま) | `:120-125` |
| agents | `src/agents/session-core.ts` | `composeClaudeSpawn` の win32 の分岐・`ClaudeSpawnPlan` の `cwd?` / `windowsHide?` (§5.3) | `:493-517` |
| agents | `src/agents/sdk-agent-session.ts` | `decodeLaunchSpec` の種類の分岐 (§5.2。停止の引数は `WIN32_TREE_STOP_ARGS` との完全一致・停止のコマンドの名前は `WIN32_TREE_STOP_COMMAND_NAME`・claude のパスは `classifyClaudeExecutable`)・spawn の呼び出しに spec の `cwd` / `windowsHide`・`stopTree()` (spec の値だけで起こす) と `TREE_STOP_TIMEOUT_MS`・kill / `forceEnd` / `finish` / `fatalSink` の順番 (§9) | decoder `:329-347`、`killSpawnedChild` `:442`、`finish` `:461-478`、`forceEnd` `:481-487`、spawn `:526-550`、controlSink `:589-627` |
| agents | `src/agents/supervisor-core.ts` | `shutdownMs` の既定 3,000 → 6,000 | `:83` |
| main (infra) | `src/main/infra/runtime/win32-claude.ts` (新設) | claude の探索 (§2) | — |
| main (infra) | `src/main/infra/runtime/win32-launch.ts` (新設) | `WIN32_LAUNCH_ENV_ALLOWLIST`・`WIN32_PROVIDER_OVERRIDABLE_KEYS`・`isWin32ForbiddenKey`・`buildWin32LaunchEnv`・`composeWin32LaunchEnv`・`buildWin32LaunchSpec` (§5.1 / §6) | `launch-spec.ts` の形にならう |
| main (infra) | `src/main/infra/runtime/wsl-detector.ts` | `DetectorDeps.locateWin32Claude` (省略時 fail-closed)・`list()` で並列に呼ぶ | `list()` `:67-130` |
| main (infra) | `src/main/infra/settings/runtime-settings-store.ts` (新設) | 設定の読み書き (§3) | `launch-usage-store.ts` の形 |
| main (app) | `src/main/app/launch-preparation.ts` | Win32 の段 (§7)・`LaunchInput` の和・deps 4 つ | `:128-129` (claudePath の検査) ほか全段 |
| main (app) | `src/main/app/session-launch-service.ts` | `DEFAULT_DISPOSE_WAIT_MS` 3,000 → 6,000 | `:111` |
| main | `src/main/index.ts` | `QUIT_TIMEOUT_MS` 5,000 → 7,000 | `:24` |
| main (app) | `src/main/app/composition-root.ts` / `src/main/app/ipc.ts` | 検出に locator を結線・設定のストア・2 つの IPC の handler (ファイル選択は `pickHostFolder` の形)・prepare の deps | detector `:96`、providers `:231-250`、prepareLaunch `:273-294`、pickHostFolder `:365-389` |
| domain / preload | `src/domain/capability.ts` / `capability.test.ts` / `src/preload/*` / `src/main/app/e2e-capability.ts` / `src/renderer/src/test-support/capability.ts` | 2 つの channel と `Win32ClaudePathResult` (contracts C-1 / C-2) | `capability.ts:228-270`、`capability.test.ts:19` |
| renderer | `src/renderer/src/features/session/LaunchDialog.tsx` | ランタイムの選択肢・facts・Provider の既定のラベル・claude の理由 (§10.1) | `:210`, `:236-240`, `:528`, `:695` |
| renderer | `src/renderer/src/features/session/labels.ts` | `claude-not-found` の文言をランタイムに依らない形に | `:31` (`:87` は変えない) |
| renderer | `src/renderer/src/features/runtime-list/RuntimeListScreen.tsx` / `labels.ts` | win32 のカードの claude の状態・2 つのボタン・文言 (§10.2 / §10.3) | `RuntimeCard`、`labels.ts:84` |
| scripts / 設定 | `scripts/constitution/allowlists.mjs` / `eslint.config.mjs` | 注記だけ (中身は変えない) | `allowlists.mjs:239-251`, `:281-295`、`eslint.config.mjs:103-108` |

**未確定の技術事項**: なし。実機で確かめる事項 (libuv の job・穏当な終了の子孫・コンソール窓・transcript の場所) は、どの結果でも契約を変えない形にしてあり、quickstart V-3〜V-7 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — claude.exe・taskkill.exe・作業フォルダのパスは `makeHostPath` / `hostPathOps.join` / `hostPathOps.basename` だけで作り、文字列の連結をしない (data-model §1.1 / §2 / §5.1)。agents の decoder も `makeHostPath` で検査する。PATH の分割はパスの組み立てではなく env の値の切り出しで、各要素は `makeHostPath` を通してから使う
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — Windows の起動・停止の値 (`claude.exe` の探索・env・`windowsHide`・`taskkill` のパスと引数) は `src/main/infra/runtime/` の新設の 2 ファイルで組む (FR-014)。agents は `process.platform` を見ず、Windows 固有の値をリテラルで持たず、`spec.stop` があるかで停止の手続きを選ぶ (データで渡された指示を検査して実行するだけ。AD-058 Decision 1)。停止の引数の正本 `WIN32_TREE_STOP_ARGS` とコマンドの末尾の名前の正本 `WIN32_TREE_STOP_COMMAND_NAME` は main と agents の両方が import できる domain に置き、agents はそれらと domain の `classifyClaudeExecutable` で検査するだけ (`taskkill.exe`・`.exe` を agents に綴らない)。renderer の分岐は descriptor の `kind` で、プラットフォームの判定ではない
- [x] **III. 権限モードは capability に従う** — 承認の経路・権限モードを変えない。Win32 のセッションも同じ `canUseTool` の経路 (FR-013)。起動ダイアログの権限モードは今のまま `SAFE_PERMISSION_MODES` の 3 つだけで、`Win32Runtime` (`autoModeSafe: false`) を選べるようになっても Auto / bypass は選択肢に現れない。Principle III の Verification (Automated: E2E) は FE-011 で満たす (CLOSTA_E2E の stub に `claudeStatus: 'found'` の Win32 の DTO を seed し、`Win32Runtime` を選んだときの権限モードの選択肢が 3 つだけであることを確かめる。実機の `claude.exe` は要らない)
- [x] **IV. 通信は Agent SDK 経由** — `query()` と `spawnClaudeCodeProcess` の既存の経路のまま。SDK の `options.command` / `cwd` / `env` を使わず spawn の計画で渡す (research R-01)
- [x] **V. 長期資格情報を永続化しない** — 設定ファイルは版とパスだけ。env は許可リスト + `LAUNCH_ENV_DENY_PATTERN`。DTO・IPC の戻り値・ログにパス・env の値を出さない。シェルを通さない (shim を起動しない。CVE-2024-27980)。残る面はプロキシの URL の資格情報 (RK-05)
- [x] **VI. 永続環境を構築・変更しない** — 利用者の環境 (PATH・インストール) を変えない。読むだけ。`PROCESS_SPAWN_MODULES` / `PID_KILL_MODULES` の中身を足さない (注記だけ。許可の追加ではないので Principle VI の ADR の義務には当たらないが、読み替えは AD-058 に書いた)
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents が使うのは Node の `child_process` (既存) と domain のパス API だけ。Job Object の native addon を退けた (AD-058 Alternatives)
- [x] **VIII. 日本語環境で破綻しない** — 日本語を含む作業フォルダのパスは HostPath のまま cwd に渡す (シェルを通さないので引用の問題が無い)。quickstart V-1 は日本語の名前のフォルダでも回す余地を残す

**Standard**

- [x] **IX. main process をブロックしない** — 探索は検出の非同期の `list()` の中。停止は agents のセッションスレッド。ファイル選択は既存の非同期のダイアログ
- [x] **X. セッションの正本はアプリ外** — transcript は Claude Code が書くホストの `~/.claude/projects` のまま (research R-13)
- [x] **XI. 垂直スライス** — US-1〜US-4 はどれも UI から観測できる。実機は quickstart V-0〜V-9
- [x] **XII. 未表示情報を残さない** — SessionEvent・transcript の形を変えない。新しい状態 (claudeStatus) は一覧と起動ダイアログに出す
- [x] **XIII. assistant-ui の element と design system を優先** — 新しい element は要らない。ランタイム一覧のカードと起動ダイアログの既存の部品に行を足す
- [x] **XIV. Ubiquitous Language** — `RuntimeLaunchSpec`・`LaunchInput`・Session thread・FailureReason の `claude-not-found`・Forward keys / Forbidden forward key を完了の PR の前に直し、「Win32 の起動の env の許可リスト」「プロセス木の停止」を足す
- [x] **XV. 多言語規約** — 文言は `features/runtime-list/labels.ts` と `features/session/labels.ts` (data-model §10.3)

**Domain charter の整合**

- [x] 本 feature の domain (`session`) の In scope (セッションの起動・停止・ランタイムへの起動の契約) に収まる
- [x] runtime domain の descriptor・検出・設定に触れる点は、X-4 (AD-041) と同じく起動の前提として spec に入れ、runtime charter の Related Specs / Related ADRs に記録する (FR-015)。domain の分解は変えない
- [x] provider domain の到達可能性の判定 (§8) は、判定と導出を同じ関数にする整合の修正で、Provider の責務を変えない

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- Scope (本 feature が触れる部分): 起動の値の契約 (`RuntimeLaunchSpec`)・セッション supervisor とセッションスレッド (AD-043)・停止の順番・起動ゲート
- 触れる他の domain: `runtime` ([charter](../../docs/domains/runtime/charter.md)) — Win32 の descriptor の claude の状態・検出・設定 (Related Specs `:148`・Related ADRs `:163` に記録)。`provider` — config ディレクトリの判定 (§8)。`workspace` — 判定表は変えず注記だけ
- session charter の X-8 の項 (`:337-339`) と frontmatter の `related_adrs` / `related_specs` に AD-058 と 020 を足す (FR-015)

### Related ADRs

- [AD-058](../../docs/decisions/0058-win32-direct-launch-contract-and-process-tree-stop.md) — Win32 の起動の契約とプロセス木の停止: **accepted** (本 feature で起こした。2026-10-21)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — 起動の値 (§3) と env の許可リスト (§6)。AD-058 が Win32 の分を読み替える: accepted
- [AD-018](../../docs/decisions/0018-wsl-process-control.md) — `wsl.exe` の止め方 (§3) と検出のときの claude の解決 (§4): accepted
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — セッションスレッドと supervisor・reaper を置かない (Decision 5)。AD-058 が Win32 の停止で読み替える: accepted
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — 起動の準備の段と forward keys・(e) の transport の和集合の注記 (`:98`): accepted
- [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) — 所在 WSL × `Win32Runtime` の「X-1 へ」(`:279`)。U-3 で到達不可のまま閉じる: accepted
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — e2e の capability の写し (`e2e-capability.ts`)。IPC を足すときに同じ変更で直す: accepted

### Glossary excerpt

- **RuntimeLaunchSpec** (`glossary.md:862`): WSL の 1 形の説明を、種類の和 (WSL / Win32) に直す
- **LaunchInput** (`:556`): WSL / Win32 の和に直す
- **Session thread** (`:1052`): Win32 の停止 (木ごと止める) を足す
- **FailureReason** の `claude-not-found` (`:408`): Win32 の claude の状態 (not-found / shim-only / override-invalid) もここに落ちる旨
- **Forward keys** (`:427`) / **Forbidden forward key** (`:439`): Win32 の transport のキーとの衝突は判定で到達不可にし、起動の時点でも拒否する旨・proxy の 3 キーは Provider が上書きしてよく `NODE_EXTRA_CA_CERTS` は上書きさせない旨
- **HostPath** (`:481`)・**Reachability** (`:843`)・**RuntimeDescriptor** (`:854`)・**AgentRuntime** (`:25`): 定義は変えない。RuntimeDescriptor に claude の状態を足す

## 上流からの申し送り

```text
# 2026-10-20 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "020-session-win32-direct-launch" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 2 件 / 1 ファイル (plan を書く前)
# 2) feature ID (spec_id だけでは roadmap・charter の申し送りに当たらないため足した)
rg -n "\bX-8\b" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 14 行 / 4 ファイル (plan を書く前。roadmap の 4 行は 7 か所)
# 3) 新設・変更のモジュール名を実名リスト方式のルールで
rg -n "win32|Win32|taskkill|claude-executable|runtime-settings|claudeStatus|ClaudePath|launch-spec|sdk-agent-session|infra/runtime" .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs .specify/spec-gate/reviewers.yml tests/rule-fixtures/expected.mjs
#    → 35 行 (dep-cruiser 3・eslint 9・reviewers 1・allowlists 10・expected 11)
# 参考 (棚卸しの範囲の外): AD-041 :98 / :137、AD-025 :279、src/domain/workspace/resolution.ts:120-125、glossary の各項
```

### 1) spec_id の 2 件

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/020/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |

### 2) feature ID (`X-8`) の 14 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 2 | `specs/020/spec.md:3`, `:14`, `:22`, `:53`, `:185` | 本 spec | **当たらない** |
| 3 | `docs/roadmap.md:385` | X-8 の行 (範囲と義務) | **受ける** — 完了の PR で結論 (実機の V-3〜V-5 の結果を含む) を書く (FR-015) |
| 4 | `docs/roadmap.md:386` | X-9 (Win32 の再開) が X-8 に依存 | **送る** — X-9 は本 feature の `Win32LaunchSpec` と transcript の場所 (V-7) を前提にする。完了の PR で X-9 の行に「前提は満たした」を書く |
| 5 | `docs/roadmap.md:355` | X-6 の行 (X-8 を切り出した記録) | **当たらない** — WSL の `claudePath` の形の検査と Worker の異常終了の孤児の観測は X-6 に残る。Win32 の分の観測を X-6 に足すことは AD-058 Decision 3 に書いた (X-6 の行の文言は X-6 の着手で直す) |
| 6 | `docs/roadmap.md:399` | 順の振り直しの記録 (3 か所) | **当たらない** — 記録のまま |
| 7 | `docs/domains/_overview.md:58`, `:72`, `:141` | feature の一覧・状態・M の範囲 | **受ける** — `:72` / `:141` の状態を完了の PR で直す。`:58` は一覧の行のまま |
| 8 | `docs/domains/session/charter.md:337`, `:338` | Related Specs の X-8 の項 | **受ける** — 020 と AD-058 を記録する (FR-015) |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 9 | `scripts/constitution/allowlists.mjs:239-251` (`PROCESS_SPAWN_MODULES` の `sdk-agent-session` の理由) | 「`wsl.exe` を起こす」 | **受ける** — 理由に「Win32 では `claude.exe` と停止の `taskkill.exe` を起こす (AD-058)」を足す。中身 (ファイルの列) は変えない |
| 10 | `scripts/constitution/allowlists.mjs:281-295` (`PID_KILL_MODULES` = `[]`) | reaper を置かない (AD-043 Decision 5) | **受ける** — 注記に「Win32 の木の停止は handle を持つスレッドが子の pid で行い、reaper ではない (AD-058)」を足す。`[]` のまま |
| 11 | `eslint.config.mjs:103-108` (spawn の例外の注記) | 同上 | **受ける** — 注記を同じ内容に直す |
| 12 | `scripts/constitution/check.mjs` の `SPAWN_CALL_PATTERNS` | コメントにも当たる | **当たる** — 新設の `win32-launch.ts` / `win32-claude.ts` にプロセス起動 API の名前を書かない (data-model §5.1。research R-14) |
| 13 | `.specify/spec-gate/reviewers.yml:173` (data reviewer の glob `src/main/infra/settings/**`) | 設定のストアの新設 | **当たる** — `runtime-settings-store.ts` で data reviewer が発火する (意図どおり。足す物は無い) |
| 14 | `.specify/spec-gate/reviewers.yml:183` | `src/main/infra/runtime/**` | **当たらない** — 既存の glob が新設の 2 ファイルを含む |
| 15 | `tests/rule-fixtures/expected.mjs:884` | Worker の作成の経路 | **当たらない** — Worker の作成の経路を足さない |
| 16 | 残りの 31 行 (dep-cruiser `:34`, `:40`, `:298`・eslint `:45`, `:47`, `:100`, `:101`, `:132`, `:133`, `:362`, `:377`・allowlists `:186`, `:196`, `:209`, `:370`, `:454`, `:546`, `:549`, `:585`, `:613`・expected `:101`, `:187`, `:508`, `:607`, `:611`, `:619`, `:627`, `:686`, `:871`, `:939`) | パスの module 名・win32 の既存の許可 | **当たらない** — 新設のファイルは既存のレイヤ規則と `PLATFORM_BRANCH_DIRS` に入る |

### 4) 参考 (棚卸しの範囲の外)

| # | 出所 | 処理 |
|---|---|---|
| 17 | `docs/decisions/0041-…md:98`, `:137` (transport の和集合の見直しの注記) | **受ける** — AD-058 Decision 5 (登録時は広げず、判定で到達不可にし、起動の時点でも拒否) |
| 18 | `docs/decisions/0025-…md:279` (「X-1 へ」) | **受ける** — AD-058「読み替える箇所」で閉じる (U-3) |
| 19 | `src/domain/workspace/resolution.ts:120-125` | **受ける** — 注記を「X-8 (U-3) で到達不可のまま」に直す |
| 20 | `docs/glossary.md` の各項 (上の Glossary excerpt) | **受ける** — 完了の PR の前に直す (Principle XIV) |

## 実装方針

規則の正本は data-model。ここには 2026-10-20 のソースと突き合わせて決めた置き場所と順序だけを書く。行番号は main 0ba52bd のもの。

### 起動の値と agents (US-1)

- `RuntimeLaunchSpec` を和にしても、WSL の値は `kind` を持たないままにする。既存の WSL のテスト (decoder・`composeClaudeSpawn`・`buildRuntimeLaunchSpec`) が変更なしで通ることを最初に確かめる (SC-006)
- `decodeLaunchSpec` は先頭で `kind` を読み、`'win32'` の検査を別の内部の関数にする (WSL の関数の本体に触れない)
- spawn の呼び出し (`:535`) は `...(plan.cwd !== undefined ? { cwd: plan.cwd } : {})` の形で、WSL の呼び出しの引数を変えない

### 停止 (US-3)

- `stopTree()` は `run()` の closure に置き、`spawnedChild` と `childExited` を共有する。WSL の `killSpawnedChild` は変えない。呼び出し元 (kill / `forceEnd` / `finish`) は `spec.stop` があるときだけ `await stopTree()` を挟み、その後に今の abort / close を行う
- `finish()` の `promptQueue.close()` の前の待ちは、穏当な終了の途中 (`end` の待ち) では挟まない (claude の自分からの終了を待っているので)
- 停止の単体テストは偽の child (`pid`・`exit` を任意に起こせる) と偽の spawn で、§9.2 の各行の順番 (停止の起動 → 子の exit → abort → close) を記録して比べる。期限・起動の失敗・非 0・2 回目の呼び出しの各行を足す。単体で確かめるのは順序と引数までで、子孫が実際に 0 件になること (SC-004) は quickstart V-3 (完了の前に必須) で決める

### claude の場所と設定 (US-2)

- locator は `wsl-detector.ts` に入れず、新設の `win32-claude.ts` に置いて `DetectorDeps` で注入する (detector のテストは既定の fail-closed のまま通る)
- 設定のストアは `launch-usage-store.ts` の読み書き・退避の形をそのまま使う (共通化はしない。2 つ目の利用で抽象を作らない)
- IPC の handler は composition-root の `pickHostFolder` の形 (ダイアログ → 検査 → 結果の union) にならう。保存の後の `runtimes.refresh()` の結果をそのまま返す

### main の起動の準備 (US-1 / US-4)

- `prepareLaunch` の先頭で `input.runtime.kind` を見て、Win32 の段の関数に分ける (WSL の段の関数は今のまま)。`LaunchInput` の和は domain の型で、composition-root の呼び出し (`:273-294`) は descriptor をそのまま渡す
- `composeWin32LaunchEnv` は `launch-spec.ts` の `composeLaunchEnv` と同じ検査の順 (名前 → 禁止 → 値) にする

### Provider (US-4)

- `resolveConfigDirPath` の戻りの型を広げたあと、呼び出し元 (`reachability.ts`・`provider-service.ts` の `deriveEnv`) を型エラーで洗う。SC-005 の表のテストは `helper-path.test.ts` の隣に置き、判定と導出を同じ行で比べる
- `assessReachability` の第 3 引数 (transport の禁止キーの述語。data-model §6.4) は必須にする (省略で許可側に倒さない)。`ProviderServiceDeps` に `isTransportForbiddenKey` を足し、composition-root (providers `:231-250`) で `wsl` → `isForbiddenForwardKey`・`win32` → `isWin32ForbiddenKey` を結線する

### renderer

- `LaunchDialog.tsx` の選択肢と facts の組み立ては純関数 (`launch-runtime-options.ts` など。名前は tasks) に切り出してテストする
- RuntimeCard のボタンは既存の再検出のボタンと同じ部品

### 実装の順

1. domain (`claude-executable.ts`・descriptor / DTO・`RuntimeLaunchSpec` の和・`RuntimeFact`・`resolveConfigDirPath`) と固定テスト
2. agents (decoder・`composeClaudeSpawn`・`stopTree` と順番・`shutdownMs`)
3. main の infra (`win32-claude.ts`・`win32-launch.ts`・設定のストア・detector の結線)
4. main の app (起動の準備・dispose の待ち・`QUIT_TIMEOUT_MS`)・IPC・preload・capability
5. renderer (起動ダイアログ・ランタイム一覧・文言)
6. 記録 (glossary・charter 2 つ・`_overview.md`・allowlists / eslint の注記・`resolution.ts` の注記・roadmap)
7. 実機 (quickstart V-0〜V-9)

## 機械強制の変更

- **固定テスト**: `WIN32_LAUNCH_ENV_ALLOWLIST` の 30 キーの集合、`WIN32_PROVIDER_OVERRIDABLE_KEYS` の 3 キー、`IPC_CHANNELS` の並び (`capability.test.ts:19`)、`Win32ClaudeStatus` の 4 値、`RuntimeDescriptorDTO` のキーの集合 (11)、`LaunchFailureReason` が 18 のまま、`WIN32_TREE_STOP_ARGS` (`['/T', '/F', '/PID']`)、`WIN32_TREE_STOP_COMMAND_NAME` (`'taskkill.exe'`)
- **往復**: `buildWin32LaunchSpec` が組んだ値が `decodeLaunchSpec` を通る (decoder の規則と組み立ての食い違いを検出する)
- **E2E**: 起動ダイアログで `Win32Runtime` を選んだときの権限モードの選択肢 (Principle III の Automated。FE-011)
- **単体**: data-model §1.1 / §2 / §3 / §5.2 / §5.3 / §6.2 / §7 / §8 / §9.2 の各表
- **component**: 起動ダイアログの選択肢 (4 つの状態)・ランタイム一覧のカード (vitest-axe の違反 0)
- **Constitution 検証 / lint**: 規則の中身は変えない。注記を直す (申し送り #9〜#11)。新設のファイルが `SPAWN_CALL_PATTERNS` に当たらないことは検証の実行で確かめる

## ADR

- **AD-058 (proposed) を起こした。** 起動の契約 (Decision 1 / 2 / 5 / 6 / 7) と停止 (Decision 3 / 4) を 1 つにまとめた。理由: 停止の指示は `Win32LaunchSpec` の `stop` として main から agents に渡る起動の契約の一部で、分けると片方の承認で契約が半端になる
- 読み替えは AD-036 §3 / §6・AD-018 §3・AD-043 Decision 5・AD-041 (e) の注記・AD-025 の「X-1 へ」。どれも accepted の本文は直さない (AD-031)
- accepted にするのは利用者の承認 (RK-01)。session charter と runtime charter への記録は完了の PR で行う (FR-015)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | AD-058 が承認で覆る | 覆ったときの範囲: 停止の方式 (Decision 3) → §9 と期限 (§9.3) を差し替える。env (Decision 5) → §6 を差し替える。どちらも起動の値の形 (§5) の `stop` / `env` の中身だけが変わり、和の形は残る。design-gate の結果を捨てて /cl-design --from plan から回し直す |
| RK-02 | libuv の job (`KILL_ON_JOB_CLOSE`) の前提が外れ、supervisor の異常終了で `claude.exe` が残る | 保証しない行 (§9.4) に入っているので契約は変わらない。V-4 で記録し、残るなら roadmap の X-6 の行に足す |
| RK-03 | 穏当な終了で claude が自分から終わったあと、子孫 (背景の task) が残る | FR-010 の対象外 (§9.2)。V-5 で記録し、残るなら穏当な終了の後にも木の停止を挟むかを利用者に返す (親子の関係が切れたあとは `/T` でたどれないので、別の方式が要る) |
| RK-04 | `taskkill` の起動から木のたどりまでの間に pid が再利用される | 子の handle を持ったまま起こすので、子の pid は子が終わるまで再利用されない。窓は子が止まった後の子孫のたどりだけで、理論上の残余として AD-058 Consequences に書いた |
| RK-05 | Provider のプロキシの URL に資格情報が埋め込まれていると env で渡る | WSL の起動と同じ扱い (denylist はキー名だけを見る)。AD-058 Consequences に書いた |
| RK-06 | extraEnv に Windows のパスの値を入れられない (`isWindowsPathValue` の拒否) | 既存の制限 (WSL の前提の検査) のまま。Win32 で要るなら別の feature で登録時の検査を transport ごとにする |
| RK-07 | アプリの終了の最悪の待ちが 5 秒から 7 秒に延びる | 停止が 5 秒を過ぎる場合だけ。通常は taskkill が数百 ms で終わる (本機のプロセスの起動の遅さを含む)。V-3 で時間を記録する |
| RK-08 | native installer の既定の場所が変わる・PATH に無い | 上書き (C-1) で直せる。探索の順は data-model §2 の 1 か所なので、場所が増えたら表を直す |
| RK-09 | `windowsHide` でも `claude.exe` の子孫 (Bash tool の `bash.exe` など) がコンソール窓を出す | V-6 で記録する。出るなら Claude Code 側の挙動で、本 feature の契約の外として roadmap の X-8 の結論に書く |
| RK-10 | Win32 のセッションの transcript が既存の列挙・再開の経路で読めない (場所・cwd の符号化) | V-7 で記録する。読めなければ X-9 (再開) に送る (一覧の列挙は本 feature の対象外の表示) |

## Project Structure

### Documentation (this feature)

```text
specs/020-session-win32-direct-launch/
├── spec.md                     # status を planning に
├── plan.md                     # 本ファイル
├── research.md                 # Phase 0 (R-01〜R-14)
├── data-model.md               # Phase 1 (§1〜§11。規則の正本)
├── contracts/
│   └── ipc-win32-claude.md     # Phase 1 (C-1〜C-4)
├── quickstart.md               # Phase 1 (V-0〜V-9)
└── tasks.md                    # Phase 2 (/cl-tasks)
docs/decisions/0058-win32-direct-launch-contract-and-process-tree-stop.md   # proposed
```

### Source Code (repository root)

```text
src/domain/runtime/
├── claude-executable.ts     # 新設
├── descriptor.ts            # Win32 の claude の状態
└── dto.ts                   # claudeStatus / claudeOverridden
src/domain/session/{agent-session.ts, launch-resolution.ts}
src/domain/provider/{helper-path.ts, reachability.ts, types.ts}
src/domain/workspace/resolution.ts          # 注記だけ
src/agents/{session-core.ts, sdk-agent-session.ts, supervisor-core.ts}
src/main/infra/runtime/
├── win32-claude.ts          # 新設
├── win32-launch.ts          # 新設
├── win32.ts                 # createWin32Descriptor(now, claude)
└── wsl-detector.ts          # locator の注入
src/main/infra/settings/runtime-settings-store.ts   # 新設
src/main/app/{launch-preparation.ts, session-launch-service.ts, dto-mapper.ts, composition-root.ts, ipc.ts, e2e-capability.ts}
src/main/index.ts
src/domain/capability.ts / src/preload/ / src/renderer/src/test-support/capability.ts
src/renderer/src/features/session/{LaunchDialog.tsx, labels.ts}
src/renderer/src/features/runtime-list/{RuntimeListScreen.tsx, labels.ts}
scripts/constitution/allowlists.mjs / eslint.config.mjs   # 注記だけ
docs/glossary.md / docs/domains/{session,runtime}/charter.md / docs/domains/_overview.md / docs/roadmap.md
```

**Structure Decision**: 既存のレイヤ (domain / agents / main の infra と app / renderer) に置く。新しいディレクトリは作らない。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物 (research / data-model / contracts / quickstart) をソースと突き合わせて、spec との食い違いが 2 つ見つかった: (1) stdin を閉じると claude が先に終わり子孫をたどれなくなるので、停止は stdin の close より前に行う (research R-05。§9.2 の順番で解いた。FR-010 の文言は変えない)、(2) 登録時の forward key の検査を Win32 のキーまで広げると保存済みの Provider が消える (§6.3。判定に transport の禁止キーの述語を注入して到達不可にし (§6.4)、起動の時点でも拒否して FR-009 を満たした。design-gate R1 H-004 で判定の側を足した)。どちらも Constitution の判定を変えない
- Principle II (agents は `spec.stop` で選び、プラットフォームを見ない) と VI (許可リストの中身を足さない) の判断を上の Check に書いた
- 違反は 0 件。Complexity Tracking は空

## Complexity Tracking

なし
