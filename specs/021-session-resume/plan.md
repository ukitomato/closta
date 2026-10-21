# Implementation Plan: セッションの再開 (resume) (X-9)

**Branch**: `021-session-resume` (main 7e13d60 の上) | **Date**: 2026-10-21 (`/cl-plan`) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-8 は採用 (2026-10-21 夜間の規則で推奨案を採用))

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [contracts/ipc-session-resume.md](./contracts/ipc-session-resume.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-21 の作業ツリー (main 7e13d60) と突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## 判断の承認

- **U-1〜U-8 は 2026-10-21 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で採用した** (spec の「判断の一覧」)。plan の段の実装の選択 P-1〜P-11 (research の各節) も採用 (2026-10-21 夜間の規則で推奨案を採用)。新しい利用者の判断として止める点は無い (`.needs-input.md` は作っていない)
- AGENTS.md の gated 確定事項 (domain の分解・Constitution Principle の採否) に当たるものは無い。domain は spec の `domain_selected_by: user` (session)。agents の query の options と main の registry に触れる点は spec の「本 feature の位置づけ」が範囲に入れている
- **AD-059 を起こし、accepted にした** ([docs/decisions/0059-…](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md))。2026-10-21 に夜間の規則で推奨案を採用した (覆ったときの範囲は RK-01)

## Summary

- **会話の id (U-1)**: セッションスレッドが最初の `system/init` の `session_id` を UUID の形で検査して 1 回だけ送り、調停役スレッドが即座に main へ中継し、main の起動の service が registry と退避の表 (上限 256) に持つ (data-model §1)。永続化しない・ログに出さない・renderer には「再開できるか」の真偽だけを渡す
- **再開の起動 (US-1 / US-2)**: `SessionResumeRequest` (`{ source, config }`) を新しい IPC `resumeSession` で受け、source から引き継ぐ 3 軸を解いて `config` と照合し、同じ会話の 2 本目を判定してから、今の `prepareLaunch` (起動ゲート・上限・WSL / Win32 の起動の値) を通して `options.resume` を足す (§2〜§5)。`QUERY_OPTION_KEYS` は 11 → 12 (§6.2)
- **過去の行の軸 (U-3)**: domain の純関数 `resolvePastResumeAxes` が列挙対象 × cwd × 登録フォルダ / ランタイム / Provider から決め、決まらない・cwd の出自が列挙対象の所在と一致しなければ 9 つの理由のどれかを返す (§3)。IPC `resolvePastResume` で過去の区画の行ごとに 1 回呼ぶ
- **ダイアログと行の入れ替え (U-2 / U-4 / U-6)**: 起動ダイアログに再開の形を足す (引き継ぐ 3 軸は表示だけ。§9.3)。受け付けで元の行を `replace` で消す (`close` を使わない。§9.4)。会話の id が無い失敗の行は「やり直す」(§9.5)
- **それまでの会話 (U-7)**: IPC `getResumedTranscript` で main が会話の id と列挙対象を解いて AD-034 の経路に渡し、renderer が `resumed:` 接頭辞の id で `messages` の先頭に入れ、区切りの行を足す (§8)
- **失敗の理由**: `resume-failed` を足す (18 → 19。§6.4 / §7)。再開の `init` が安全 3 値の外の権限モードを報告したときもこの理由で止める (fail closed。§6.3 / FR-017)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (`Options.resume`。research R-01)。assistant-ui (`useExternalStoreRuntime` の既存の経路)。新しい依存は足さない

**Storage**: なし (Principle X。会話の id はメモリだけ。research R-03)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe、Playwright の E2E (偽の capability)、Constitution 検証 (`node scripts/constitution/check.mjs`)、rule fixtures。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。セッションは WSL と Win32 の両方

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker) / domain)

**Performance Goals**: 過去の行の軸の解決は列挙のキャッシュだけを見る (列挙・`wsl.exe` を起こさない。contracts C-1)。それまでの会話の読み取りは再開 1 回につき 1 回 (今の過去ログと同じ取得プロセス)

**Constraints**: data-model §0 の「変えないもの」。`IPC_CHANNELS` は 4 つ増える。`QUERY_OPTION_KEYS` 12・`LAUNCH_FAILURE_REASONS` 19。`SessionStatusUpdate` / `SessionEvent` / `SessionLaunchConfig` の形は変えない

**Scale/Scope**: FR 17 / SC 9。新しい IPC 4 つ・新設のモジュール 3 つ (domain 1・main の app 1・renderer 1)

### レイヤごとの変更 (2026-10-21 の作業ツリー = main 7e13d60 で確かめた)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/resume.ts` (新設) | `ResumeSource`・`SessionResumeRequest`・`ResumeUnavailableReason`・`resolvePastResumeAxes` (data-model §2 / §3) | `match.ts:95` `matchFolder`、`helper-path.ts:76` `resolveConfigDirPath` |
| domain | `src/domain/session/agent-session.ts` | `LaunchQueryOptions.resume?` (§5.1)・`LAUNCH_FAILURE_REASONS` に `resume-failed` (§7) | `:63`, `:125` |
| domain / preload | `src/domain/capability.ts` / `capability.test.ts` / `src/preload/*` / `src/main/app/e2e-capability.ts` / `src/renderer/src/test-support/capability.ts` | 4 つの channel と DTO (contracts C-1〜C-4) | `IPC_CHANNELS` の固定の表 |
| agents | `src/agents/session-core.ts` | `QUERY_OPTION_KEYS` に `resume` (12)・`buildQueryOptions` の assert と書き込み (§6.2) | `:64` |
| agents | `src/agents/sdk-agent-session.ts` | `decodeLaunchOptions` の `resume` (§6.1)・`case 'system'` の会話の id の送出 (§6.3)・`resume-failed` の分岐 (§6.4) | decoder `:306`、system `:870`、子の `exit` の `process-crashed` `:717`、stream の例外の `stream-protocol-error` `:932`、`for await` の後 (`:928`)。`fatalSink` の `:727` は変えない |
| agents | `src/agents/supervisor-protocol.ts` / `supervisor-core.ts` | `WorkerMessage` / `SupervisorEvent` の `conversation` と 2 つの decoder (contracts C-5)・調停役スレッドの即時の中継 | `decodeWorkerMessage` `:91`、`decodeSupervisorEventForMain` `:135` |
| main (app) | `src/main/app/session-spawner.ts` | `SupervisorConnection.onConversation` (§1.2) | `onThreadEnded` `:151` |
| main (app) | `src/main/app/session-launch-service.ts` | `Entry.conversationId`・退避の表・`inFlightConversations`・`resume(...)`・`onConversation` の受け取り・`killAll` / `dispose` での消去 (§1.3 / §1.5 / §5) | `onThreadEnded` `:148`、`killAll` `:175`、`reserved` `:191` |
| main (app) | `src/main/app/resume-service.ts` (新設) | 過去の行の軸の解決の呼び出し・再開の流れの 1〜3・それまでの会話の列挙対象の決定 (§3.2 / §4 / §8.1)。I/O は注入で受ける | — |
| main (app) | `src/main/app/session-service.ts` | `pastResumeSource(targetKey, conversationId)` (§3.2) | `sessionsByTarget` `:186`、`transcriptTarget` `:741` |
| main (app) | `src/main/app/validate.ts` | `checkResumeRequest`・`checkPastResumeQuery` (§2.1) | `checkLaunchConfig` `:434` |
| main (app) | `src/main/app/session-ipc.ts` / `composition-root.ts` | 4 つの handler / 送出・`resume-service` の結線 | `launchSession` の handler |
| renderer | `src/renderer/src/features/session/running-session-store.ts` | `resumable` / `resumed`・`replace`・先頭へのそれまでの会話の挿入・先着の通知の記憶 (§8.2 / §9.4 / §9.6) | `close` `:733` |
| renderer | `src/renderer/src/features/session/RunningSessionsProvider.tsx` | `onSessionResumable` の購読・`getResumedTranscript` の port の受け取り | `:133-219` |
| renderer | `src/renderer/src/features/session/RunningSessionRow.tsx` / `LivePane.tsx` | 「再開」「やり直す」の出し分け (§9.1)。`EndNotice` / `FailureBanner` にも | `SessionRowActions` `:269`、`FailureBanner` `:397`、`EndNotice` `:420` |
| renderer | `src/renderer/src/features/session/LaunchDialog.tsx` | 再開の形 (§9.3)・「やり直す」の初期値 (§9.5) | — |
| renderer | `src/renderer/src/features/session/PastResumeBar.tsx` (新設) / `features/shell/CenterPane.tsx` | 過去の行の帯 (§9.2)。`PastCenter` の本文の下に置く | `PastCenter` `:161` |
| renderer | `src/renderer/src/features/session/labels.ts` | 文言 (§10)・`resume-failed` (§7) | — |
| renderer | `src/renderer/src/features/chat/` (`convert.ts` の呼び出し側・拒否の入力の再送) | `retryTextFor` が `resumed:` の id に `null` (research R-09) | `convert.ts:179` |
| scripts / 設定 | `scripts/constitution/allowlists.mjs` / `.dependency-cruiser.js` | `resume-service.ts` を実名で足す (申し送り #11 / #12) | `allowlists.mjs:537-561`、`.dependency-cruiser.js:254` |

**未確定の技術事項**: なし。実機で確かめる事項 (SDK の `init` の `session_id` が要求と同じか・会話が見つからないときの終わり方・Win32 の記録の読み取り) は、どの結果でも契約を変えない形にしてあり、quickstart V-2〜V-4 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — 新しいパスの組み立ては無い。cwd の一致は列挙の結果の `CwdOrigin` と `matchFolder` の `matchedPrefix` の比較 (data-model §3.1)。config ディレクトリは既存の `resolveConfigDirPath` の結果を比べるだけ
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 再開は `options.resume` を起動の service の 1 か所で足し、WSL / Win32 の起動の値の組み立てに分岐を足さない (FR-014・data-model §5)。過去の行のランタイムの決定 (`windows` → `host`、`wsl` → `wsl:D`) は所在の種類による値の対応で、`process.platform` を見ない
- [x] **III. 権限モードは capability に従う** — 再開の形のダイアログの権限モードは今の部品と `SAFE_PERMISSION_MODES` の 3 つのまま。`buildQueryOptions` の安全 3 値の assert は変えない。`resume` は escalation-neutral (research R-01)。その前提は、再開の最初の `init` が報告する権限モードが安全 3 値の外なら `resume-failed` で止めることで裏付ける (FR-017・data-model §6.3)。過去の会話の tool の許可は復元されない (承認の登録簿は新しいセッションスレッドで空から始まる)
- [x] **IV. 通信は Agent SDK 経由** — `query()` の `resume` の option だけを使う。transcript の自前パースをしない (それまでの会話は AD-034 の `getSessionMessages` の経路)。書き込み系 API (`forkSession` など) を呼ばない
- [x] **V. 長期資格情報を永続化しない** — 永続化するものが無い。会話の id は資格情報ではないが、値をログ・DTO・状態通知に出さない (§1.3 / §1.4)
- [x] **VI. 永続環境を構築・変更しない** — 利用者の環境を変えない。transcript は `claude` が追記するだけ
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents が足すのは decoder の分岐と `@domain/validation` の既存の述語だけ。新しいモジュールを作らない (research R-13)
- [x] **VIII. 日本語環境で破綻しない** — 再開の形のダイアログと composer は今の部品のまま (IME の確定の Enter の扱いは変えない)

**Standard**

- [x] **IX. main process をブロックしない** — 軸の解決は列挙のキャッシュの参照だけ。それまでの会話の本文は取得プロセス ↔ renderer の port で届き、main を通らない
- [x] **X. セッションの正本はアプリ外** — 会話の正本は Claude Code の transcript。会話の id はメモリの registry と退避の表だけで、アプリを終えれば消える (research R-03)
- [x] **XI. 垂直スライス** — US-1〜US-4 はどれも UI から観測できる。実機は quickstart V-1〜V-6
- [x] **XII. 未表示情報を残さない** — 新しい SDK のメッセージ型を表示に足さない (`SDKUserMessageReplay` は表示不要のまま)。`docs/ui-coverage.md:308` の割当から resume (X-9) を外し、`:277` の「fork / resume と合わせて X-6」を「fork と合わせて X-6」に直す (FR-016・data-model §11)
- [x] **XIII. assistant-ui の element と design system を優先** — それまでの会話は今の実行中の Chat の `messages` に入れる (別の Thread を重ねない。research R-09)。区切りの行は既存のシステムイベントの行の部品
- [x] **XIV. Ubiquitous Language** — 「Resume (再開)」「Conversation id (会話の id)」「Resume dialog (再開の形の起動ダイアログ)」を足し、SessionLaunchConfig / Session thread / FailureReason を直す (data-model §11)
- [x] **XV. 多言語規約** — 文言は `features/session/labels.ts` (data-model §10)

**Domain charter の整合**

- [x] 本 feature の domain (`session`) の In scope の「セッションの起動、応答のストリーミング、中断、再開、分岐」と業務ルール「再開時、フォルダ / ランタイム / Provider は引き継ぐ。変更したい場合は分岐として扱う」(`charter.md:60`, `:182`) に収まる
- [x] Out of scope に踏み込まない。それまでの会話の描画は ui の既存の変換 (`toThreadMessage`) と部品を使い、session はデータの供給と行の操作だけを足す

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- Scope (本 feature が触れる部分): セッションの再開 (`:60`)・`SessionLaunchConfig` の解決と依存解決 (`:61`)・セッション supervisor とセッションスレッド (`:65`)・Journey 4 「中断と再開」の手順 1〜2 (`:121-128`)・業務ルール「再開時の軸の引き継ぎ」(`:182`)
- 触れる他の domain: `ui` — 実行中の Chat の `messages` と過去ログの変換を使う (描画の部品は変えない)。`provider` — `resolveConfigDirPath` を読むだけ。`workspace` — `matchFolder` を読むだけ
- session charter の Journey 4 の注記 (`:123`)・Key concepts の失敗の理由 (`:141`。18 → 19)・Related Specs の X-9 の項 (`:344-346`)・frontmatter の `related_adrs` / `related_specs` に AD-059 と 021 を足す (FR-015)

### Related ADRs

- [AD-059](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md) — セッションの再開 (query の options の `resume`・会話の id の運び方・`resume-failed`): **accepted** (本 feature で起こした。2026-10-21 夜間の規則で推奨案を採用)
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — 起動設定と起動ゲート・(g) `QUERY_OPTION_KEYS` の固定・(h) fork / resume を X-6 に指名: accepted。AD-059 が (g) と (h) の resume を読み替える
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — 起動の契約・§4 P1 (options のキー集合の変更に ADR が要る): accepted
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — 単一 supervisor・セッションスレッド・上限 10・状態通知: accepted。AD-059 が message の種類に `conversation` を足す
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — Decision 1 の失敗の理由 18: accepted。AD-059 Decision 3 が 19 にする
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 過去ログの読み取りの経路 (短命の取得プロセスと renderer の port): accepted。それまでの会話の読み取りがそのまま使う
- [AD-058](../../docs/decisions/0058-win32-direct-launch-contract-and-process-tree-stop.md) — Win32 の起動の値と停止: accepted。再開も同じ組み立てを通る
- [AD-007](../../docs/decisions/0007-session-source-of-truth-is-claude-code.md) — セッションの正本は Claude Code: accepted (Principle X の根拠)
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — e2e の capability の写し。IPC を足すときに同じ変更で直す: accepted
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — ui-coverage の割当: accepted (FR-016)

### Glossary excerpt

- **Session** (`glossary.md:932`): Claude Code の 1 会話。UUID で識別され `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化される。正本は Claude Code 側。本 feature の「会話の id」はこの UUID
- **SessionLaunchConfig** (`:1029`): 起動時に選ぶ設定の組。X-4 は前 6 軸。再開の要求は別の型で包む旨を足す
- **Axis resolution (依存解決)** (`:70`): 作業フォルダ ↔ ランタイム → Provider → モデル → effort。再開の形のダイアログは Provider から下を今の規則で解く
- **EnumerationTarget (列挙対象)** (`:341`): 所在と config ディレクトリの組。過去の行の引き継ぐ軸を解く入力
- **CwdOrigin** (`:163`)・**Unregistered folder** (`:1296`)・**Pending match** (`:737`)・**Unknown location** (`:1308`): 過去の行の軸の解決の理由 (`folder-unregistered` / `folder-pending` / `location-unknown`) に当たる
- **Session thread** (`:1072`): 会話の id の送出 (最初の `init` だけ) を足す
- **SessionStatusUpdate (状態通知)** (`:1083`): 会話由来の文字列を含まない。会話の id を載せない (research R-10)
- **claudeAlive (生存フラグ)** (`:1093`): 「再開」を出すかと同じ会話の 2 本目の判定に使う
- **FailureReason** (`:404`): 18 種 → `resume-failed` を足して 19 種
- **Running session list** (`:913`)・**transcript** (`:1253`)・**System event row** (`:1143`): 行の操作・それまでの会話・区切りの行と読み取りの失敗の行の置き場

## 上流からの申し送り

```text
# 2026-10-21 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "021-session-resume" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 3 行 / 2 ファイル (plan を書く前)
# 2) feature ID (spec_id だけでは roadmap・charter の申し送りに当たらないため足した)
rg -n "\bX-9\b" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 50 行 / 19 ファイル (plan を書く前)
# 3) 新設・変更のモジュール名を実名リスト方式のルールで
rg -n "resume|session-launch-service|session-service|supervisor-protocol|sdk-agent-session|QUERY_OPTION_KEYS|resume-service|transcript-service" .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs .specify/spec-gate/reviewers.yml tests/rule-fixtures/expected.mjs
#    → 21 行 (dep-cruiser 3・eslint 1・allowlists 8・expected 9・reviewers 0)
# 参考 (棚卸しの範囲の外): rg -n "resume|再開" docs (roadmap を除く) のうち X-9 を名指さないもの、specs/009 の FR-013 の「再開は X-6」
```

### 1) spec_id の 3 行

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/021/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |
| 2 | `docs/decisions/0059-…md:13` | 1 | **当たらない** — 本 plan で起こした ADR の本文 |

### 2) feature ID (`X-9`) の 50 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 3 | `specs/021/` の spec 11・research 1・quickstart 2・data-model 5・contracts 1 | 本 feature の成果物 | **当たらない** |
| 4 | `docs/decisions/0059-…md:13`, `:17`, `:21`, `:31`, `:32` | 本 feature の ADR | **当たらない** |
| 5 | `docs/roadmap.md:386` | X-9 の行 (範囲の正本と前提) | **受ける** — 範囲は spec の「義務の扱い」の表に全部割り当てた。完了の PR で結論 (U-1〜U-8・AD-059・quickstart の実機の記録) を書く (FR-015) |
| 6 | `docs/roadmap.md:355` | X-6 の行 (X-9 を切り出した記録) | **当たらない** — X-6 に残る fork / rename / tag / delete・`/clear` の後の会話の id は spec の Out of Scope。X-6 の行は変えない (data-model §11) |
| 7 | `docs/roadmap.md:385` | X-8 の行 (X-9 への前提) | **受ける** — 020 V-7 / RK-10 (Win32 の記録が読めるか) を quickstart V-2 で確かめる (research R-14・RK-06)。X-8 の行は変えない |
| 8 | `docs/roadmap.md:399` | 順の振り直しの記録 | **当たらない** — 記録のまま |
| 9 | `docs/domains/_overview.md:58`, `:73`, `:141` | feature の一覧・状態・M の範囲 | **受ける** — `:73` の状態を完了の PR で直す。`:58` / `:141` は変えない |
| 10 | `docs/domains/session/charter.md:123`, `:340`, `:344` | Journey 4 の注記・Related Specs の X-8 / X-9 の項 | **受ける** — `:123` の注記と `:344-346` の X-9 の項に 021 と AD-059 を記録する (FR-015)。`:340` は X-8 の項で変えない |
| 11 | `docs/ui-coverage.md:308` | Message branches の割当 `fork (X-6) / resume (X-9)` | **受ける** — `fork (X-6)` だけにする (FR-016) |
| 12 | `specs/020/spec.md:33`, `:58`, `:225`・`research.md:235`・`tasks.md:93`・`plan.md:161`, `:264` | X-8 が X-9 に送った前提 (Win32 の transcript の場所・V-7) | **受ける** — #7 と同じ (quickstart V-2 / SC-007) |
| 13 | `specs/020/pr-gate.md:38`・`architecture-reviewer.pr-gate{,.round1}.md:32` | X-9 が未実証の前提 (020 の SC-004 の実機) に立つ懸念 | **当たる** — 020 の V-1 / V-3 (起動と木の停止の実機) は未実施のまま (session charter `:343`)。本 feature は Win32 の起動と停止の契約を変えないので、quickstart V-1 の Win32 の 3 通りが 020 の起動の実機を兼ねる。木の停止の実機は 020 の残りとして X-8 の行に残る (RK-06) |
| 14 | `specs/020/ui-coverage-reviewer.pr-gate{,.round1}.md:33`, `:42` | `ui-coverage.md:308` の X-9 の割当 | **受ける** — #11 と同じ |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 15 | `scripts/constitution/allowlists.mjs:537-561` (`WSL_FREE_DIRECTORIES`。`:541`, `:548`, `:551` が当たった) | app の起動系のモジュールを実名で列挙。新しいファイルは追加時に判断を強制される | **受ける** — `src/main/app/resume-service.ts` を足す (`wsl.exe` を名指さない。research R-13) |
| 16 | `.dependency-cruiser.js:254` (状態を持つ調停の service → I/O の直接依存の禁止の実名の列) | `session-service` / `session-launch-service` を含む | **受ける** — `resume-service` を足す (I/O を注入で受ける) |
| 17 | `tests/rule-fixtures/expected.mjs:843`, `:845` (項目 18 の対象を広げる時点) | 「fork / resume 等の制御行を足して調停役スレッドの import が増える X-6 の時点」 | **当たらない** — `conversation` の decoder は `supervisor-protocol.ts` に置き、`supervisor*.ts` の import は増えない (research R-13)。X-6 の時点のまま |
| 18 | `tests/rule-fixtures/expected.mjs:905` | 「agents にセッション操作 (fork / resume / rename 等) のモジュールが増える X-6 の時点」 | **当たらない** — agents に新しいモジュールを作らない (research R-13) |
| 19 | `tests/rule-fixtures/expected.mjs:751` (SDK の書き込み系 API の alias の検出を X-6 に付け替え) | 「書き込み系 API を実際に使う X-6 (fork / resume / rename / tag / delete)」 | **当たらない** — `resume` は `query()` の option で、書き込み系 API (`AGENT_SDK_ALLOWED_CALLS` の外。`allowlists.mjs:377-390`) を import も呼び出しもしない。付け替え先は X-6 のまま |
| 20 | `scripts/constitution/allowlists.mjs:374`, `:458`・`expected.mjs:939` | `query` を呼ぶのは `sdk-agent-session.ts`・`Query` の `.method()` は `interrupt()` だけ | **当たらない** — 呼ぶ API と `Query` のメソッドは増えない |
| 21 | `scripts/constitution/allowlists.mjs:252`・`:278`・`:528`・`eslint.config.mjs:110`・`.dependency-cruiser.js:234`, `:298`・`expected.mjs:686`, `:834`, `:840`, `:871` | spawn・worker_threads・調停役スレッドの decoder の置き場・service の説明 | **当たらない** — spawn・Worker の作成・decoder の置き場 (`supervisor-protocol.ts`) を変えない |
| 22 | `.specify/spec-gate/reviewers.yml` | 0 件 | **当たらない** — 既存の glob (`src/agents/**`・`src/main/app/**` など) が変更のファイルを含む |
| 23 | `allowlists.mjs:422-429` (`QUERY_ESCALATION_OPTION_KEYS`。grep の 3) には当たらないが関連) | options に現れてはならない昇格キー | **当たらない** — `resume` は昇格キーではない (research R-01 / R-13)。足さない・外さない |

### 4) 参考 (棚卸しの範囲の外)

| # | 出所 | 処理 |
|---|---|---|
| 24 | `specs/009-…/spec.md:238` (FR-013「失敗したセッションを自動で再開しない (再開は X-6)」)・`:341` | **受ける** — AD-059「読み替える箇所」と Decision 4 で X-9 に読み替える。自動で再開しないことは変えない (spec FR-009) |
| 25 | `docs/decisions/0041-…md:138` ((h) の「fork / resume / rename / tag / delete」) | **受ける** — AD-059「読み替える箇所」で resume だけを X-9 に。accepted の本文は直さない (AD-031) |
| 26 | `docs/ui-coverage.md:277` (Edit message の「fork / resume と合わせて X-6」) | **受ける** — 「fork と合わせて X-6」に直す (data-model §11) |
| 27 | `docs/ui-coverage.md:48` (`SDKUserMessageReplay` は表示不要) | **当たらない** — 表示不要のまま (research R-09。V-7 で SDK が流すかを記録する) |
| 28 | `docs/domains/session/charter.md:167` (`conversation_reset` の `new_conversation_id` を読まない。/clear の後は X-6) | **当たらない** — 最初の `init` だけを見る (data-model §1.2)。X-6 のまま |
| 29 | `docs/domains/session/charter.md:126-127` (Journey 4 の手順 2 の「上限」) | **当たらない** — 上限の軸は X-6 (spec Out of Scope) |
| 30 | `docs/domains/ui/charter.md:138`・`docs/decisions/0018-…md:88`, `:130` (「中断しても途中出力が残り再開できる」) | **当たらない** — 中断の後に次のプロンプトで続けること (今の挙動。U-8) を指す |
| 31 | `docs/glossary.md` の各項 (上の Glossary excerpt) | **受ける** — 完了の PR の前に直す (Principle XIV・FR-016) |

## 実装方針

規則の正本は data-model。ここには 2026-10-21 のソースと突き合わせて決めた置き場所と順序だけを書く。行番号は main 7e13d60 のもの。

### agents (US-1 / US-2)

- `QUERY_OPTION_KEYS` の pin テストを先に 12 に直して赤にし、`buildQueryOptions` を直して緑にする。`resume` の書き方は今の `model` / `effort` の条件つきの展開と同じ形 (項目 16 の backstop の検査に当たらないことを Constitution 検証で確かめる)
- `case 'system'` (`sdk-agent-session.ts:870`) の会話の id の送出は、今の `signals.onSystem(message)` の呼び出しの前に置き、構成の報告の経路に触れない
- `resume-failed` の分岐 (data-model §6.4) は、子の `exit` の `fail('process-crashed')` (`:717`) と stream の例外の `fail('stream-protocol-error')` (`:932`) の 2 か所の理由を 1 つの内部の関数 (`crashReason(fallback)`) で選ぶ (`launchOptions.resume !== undefined && !sawInit` なら `resume-failed`)。`fatalSink` (`:727`) はセッションスレッドの JS 例外の経路で `claude` の終わり方ではないので、再開でも `process-crashed` のまま。終了処理 (`closing`) の判定は今の呼び出し側のまま
- **新設の失敗の経路**: stream が例外なく終わった (`for await` を抜けた。`:928` の後) のに、再開の起動で `init` を受けておらず、`terminated` でも終了処理の中でもなく、まだ失敗でないときは `resume-failed` で失敗にする。今のコードはこの終わり方を失敗にしない (`finish` が先に `finished` を立てると `:717` も通らず「終了済み」に見える) ので、再開の起動に限って足す。新しい起動の終わり方は変えない
- **権限モードの fail closed** (§6.3 の 3・FR-017): `case 'system'` の `init` で、再開の起動の最初の `init` の `permissionMode` が `isSafePermissionMode` (`@domain/session/launch-config`) を通らなければ `fail('resume-failed')` と `terminated = true` (ループを抜け、`finally` の `finish` が子を止める)。昇格の値の綴りを書かない (項目 16)。新しい起動では検査しない (表示だけ。`live-signals.ts:437-445` のまま)

### supervisor の protocol

- `WorkerMessage` / `SupervisorEvent` に `conversation` を足し、`decodeWorkerMessage` / `decodeSupervisorEventForMain` の分岐は `thread-ended` (`supervisor-protocol.ts:152`) と同じ形にする。調停役スレッドは窓 (`status-batch`) に入れずに送る

### main (US-1〜US-3)

- `resume-service.ts` は「状態を持たない調停」(source の解決・3 軸の照合・それまでの会話の列挙対象の決定) だけを持ち、registry・退避の表・同じ会話の判定・予約は `session-launch-service.ts` の `resume(...)` に置く (`reserved` と `epoch` を持つのはこちらなので。data-model §5 の 4〜9)
- `session-launch-service.ts` の `launch` と `resume` は予約から登録までの本体を共有する (内部の関数に切り出す。`launch` の既存のテストが変更なしで通ることを最初に確かめる)
- `pastResumeSource` は列挙のキャッシュの参照だけで、`transcriptTarget` (`session-service.ts:741`) のような WSL の実行中の検査をしない (起動ゲートが行う)
- IPC の handler は `session-ipc.ts` の `launchSession` の handler と同じ形 (送り元の検査 → 述語 → service → handshake と port)

### renderer (US-1〜US-4)

- 行の操作の出し分け (data-model §9.1 の 2 つの表) は純関数 (`resumeActionFor(row)` など。名前は tasks) に切り出し、SC-004 のテストを表で回す
- 再開の形のダイアログの初期値・プリセットの適用・`fixed` の表示は、今の `LaunchDialog.tsx` の状態の組み立ての中で `resume` が null でないときだけ分岐する。新規起動の既存のコンポーネントテストが変更なしで通ることを確かめる (SC-005)
- それまでの会話の挿入は `running-session-store.ts` の `messages` の更新の 1 か所に置き、届く順 (新しいメッセージが先) に依らず先頭に入れる (§8.2)

### 実装の順

1. domain (`resume.ts`・`LaunchQueryOptions.resume`・`resume-failed`) と固定テスト (`LAUNCH_FAILURE_REASONS` 19)
2. agents (`QUERY_OPTION_KEYS` 12・`decodeLaunchOptions`・会話の id の送出・`resume-failed`)・supervisor の protocol
3. main の app (`session-spawner.ts`・`session-launch-service.ts`・`resume-service.ts`・`session-service.ts`・`validate.ts`)
4. IPC・preload・capability (4 つの channel)・e2e の capability の写し
5. renderer (ストア・Provider・行の操作・ダイアログ・過去の行の帯・文言)
6. 記録 (glossary・session charter・`ui-coverage.md`・`_overview.md`・allowlists / dependency-cruiser・roadmap)
7. 実機 (quickstart V-0〜V-7・V-9)。行えなければ「未実施」と書いてマージする (spec の「合否の扱い」)

## 機械強制の変更

- **固定テスト**: `QUERY_OPTION_KEYS` の 12 キー (`session-core.test.ts`)、`LAUNCH_FAILURE_REASONS` の 19 (`agent-session.test.ts`)、`IPC_CHANNELS` の並び (`capability.test.ts`)、`ResumeUnavailableReason` の 9 値
- **往復**: main の `checkResumeRequest` を通った値から組んだ options が agents の `decodeLaunchOptions` を通り、UUID の形でない `resume` が 3 か所 (validate・decoder・`buildQueryOptions`) のどれでも拒否される (SC-002)
- **単体**: data-model §1.3 / §1.5 (退避の表)・§3.1 (軸の解決の表。SC-003)・§4・§5 (同じ会話の 2 本目・予約。SC-006)・§6.3 / §6.4 (送出と `resume-failed` の表)・§8.1 (列挙対象の決定)・contracts C-5 (2 つの decoder)
- **component**: 行の操作の出し分け (SC-004)・再開の形のダイアログ (SC-005)・それまでの会話の表示と読み取りの失敗 (SC-007)。vitest-axe の違反 0
- **E2E**: 偽の capability で再開の受け付け (元の行が消え新しい行が選ばれる)・拒否 (元の行が残る)・`already-running` (その行が選ばれる) を流す (SC-006)
- **Constitution 検証 / lint**: 規則の中身は変えない。`WSL_FREE_DIRECTORIES` と `.dependency-cruiser.js:254` の実名の列に `resume-service` を足す (申し送り #15 / #16)

## ADR

- **AD-059 を起こした (accepted。2026-10-21 夜間の規則で推奨案を採用)。** query の options の `resume` (Decision 1)・会話の id の運び方と置き場 (Decision 2)・`resume-failed` (Decision 3)・利用者の操作による再開 (Decision 4) を 1 つにまとめた。理由: 再開の起動は `resume` の値の出所 (会話の id の運び方) と失敗の理由が揃って初めて成り立ち、片方だけを承認しても実装できない
- 読み替えは AD-041 (g) / (h)・AD-036 §4 P1・AD-043 の message の種類・AD-047 Decision 1・X-5 FR-013。どれも accepted の本文は直さない (AD-031)
- 利用者が後で覆したときの範囲は RK-01。session charter への記録は完了の PR で行う (FR-015)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 夜間の規則で採用した U-1〜U-8・P-1〜P-11・AD-059 を利用者が後で覆す | 覆ったときの範囲: U-1 (会話の id の出所) → data-model §1 と contracts C-4 / C-5 を差し替える。U-4 / U-5 → §5 の 4〜5 と §9.4。U-7 → §8 と C-3。どれも `QUERY_OPTION_KEYS` の 12 と起動の経路 (§5 の 6〜8) は残る。design-gate の結果を捨てて `/cl-design --from plan` から回し直す |
| RK-02 | `resume` の起動の `init` の `session_id` が要求の id と違う (SDK の挙動) | 上書きして事実だけを記録する (§1.3)。V-3 で確かめ、違ったら利用者に返す (同じ transcript に追記されない恐れ。SC-001 の判定に効く) |
| RK-03 | `provider-missing` に今の列挙では届かない | 単体テストの表で `origin` を差し替えて確かめる (research R-05)。US-1 AC5 は実機で確かめられないと quickstart の結果に書く |
| RK-04 | 過去の行の再開が、元の会話と違う資格情報 (Provider なし) で起きる | 会話は見つかる。AD-059 Consequences に書いた。過去の行から元の Provider を知る手段は無い |
| RK-05 | WSL の別のユーザのホームの会話の再開が `resume-failed` になる | 起動の前に弾けない (research R-05)。V-7 で記録する。理由の文言で「記録が見つからない」と出る |
| RK-06 | Win32 の記録が列挙・過去ログで読めない (020 V-7 / RK-10) | V-2 で確かめる。読めなければ Win32 の過去の行からの再開 (SC-001 の 1 通り) が成り立たないので利用者に返す。020 の木の停止の実機 (SC-004) は本 feature で兼ねない |
| RK-07 | 会話が見つからないとき `claude` が最初のプロンプトの後に終わる・`init` を出してから終わる | §6.4 の条件 (`init` の前) に当たらず `process-crashed` になる。V-4 で終わり方を記録し、合わなければ条件を直す (理由のキーは足したまま) |
| RK-10 | 再開の `init` が昇格の権限モードを報告するのは最初のプロンプトを送った後で、止めるまでの間に `claude` がそのターンを始めうる | `init` はターンの最初のメッセージで、tool の実行はモデルの応答の後なので窓は短い。fail closed は backstop で、主の根拠は SDK が `permissionMode` を毎回 `claude` の引数に渡すこと (research R-01)。V-9 で実効の権限モードを確かめ、昇格したままなら利用者に返す |
| RK-08 | 退避の表は renderer の「閉じる」を知らず、上限 256 か `killAll` まで残る | 値は会話の id と 3 つの id だけ (§1.5)。上限を超えた行の再開は `source-unknown` で拒否する |
| RK-09 | それまでの会話を `messages` に入れると、窓・検索・地図の件数が増える | 今の窓 (`MESSAGE_WINDOW`) と「さらに表示」がそのまま効く (research R-09)。性能は今の長い会話と同じ |

## Project Structure

### Documentation (this feature)

```text
specs/021-session-resume/
├── spec.md                       # status を planning に
├── plan.md                       # 本ファイル
├── research.md                   # Phase 0 (R-01〜R-14)
├── data-model.md                 # Phase 1 (§0〜§11。規則の正本)
├── contracts/
│   └── ipc-session-resume.md     # Phase 1 (C-1〜C-6)
├── quickstart.md                 # Phase 1 (V-0〜V-8)
└── tasks.md                      # Phase 2 (/cl-tasks)
docs/decisions/0059-session-resume-query-option-and-conversation-id.md   # accepted (2026-10-21)
```

### Source Code (repository root)

```text
src/domain/session/
├── resume.ts                # 新設
└── agent-session.ts         # LaunchQueryOptions.resume / resume-failed
src/domain/capability.ts     # 4 つの channel
src/agents/{session-core.ts, sdk-agent-session.ts, supervisor-protocol.ts, supervisor-core.ts}
src/main/app/
├── resume-service.ts        # 新設
├── session-launch-service.ts
├── session-spawner.ts
├── session-service.ts
├── validate.ts
├── session-ipc.ts
├── composition-root.ts
└── e2e-capability.ts
src/preload/ / src/renderer/src/test-support/capability.ts
src/renderer/src/features/session/
├── PastResumeBar.tsx        # 新設
├── running-session-store.ts
├── RunningSessionsProvider.tsx
├── RunningSessionRow.tsx
├── LivePane.tsx
├── LaunchDialog.tsx
└── labels.ts
src/renderer/src/features/shell/CenterPane.tsx
scripts/constitution/allowlists.mjs / .dependency-cruiser.js
docs/glossary.md / docs/domains/session/charter.md / docs/domains/_overview.md / docs/ui-coverage.md / docs/roadmap.md
```

**Structure Decision**: 既存のレイヤ (domain / agents / main の app / renderer) に置く。新しいディレクトリは作らない。main の infra は変えない (再開は既存の起動の値の組み立てを通るだけ)。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物 (research / data-model / contracts / quickstart) をソースと突き合わせて、食い違いが 1 つ見つかった: `isValidSessionId` の置き場は `src/domain/validation.ts:179` で、research R-02 と data-model §1.1 が `src/domain/session/validation.ts` と書いていた (直した。data-model §1.1 の境界の数も表の 5 行に合わせた)。Constitution の判定は変わらない
- spec との食い違いは無い。spec が plan に預けた 2 点は次のとおり決めた: (1) 再開の要求の型は `SessionLaunchConfig` を変えず別の型で包む (research R-06)、(2) transcript が見つからない失敗は理由のキーを足す (`resume-failed`。research R-07)
- Principle II (`resume` の付加は起動の service の 1 か所) と XII (ui-coverage の 2 行) の判断を上の Check に書いた
- 違反は 0 件。Complexity Tracking は空

## Complexity Tracking

なし
