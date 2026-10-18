# Implementation Plan: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Branch**: `018-session-answer-ui-and-composer-commands` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md) (FR-001〜FR-017 / SC-001〜SC-010 / U-1〜U-10。夜間の自走で仮採用し、2026-10-17 に利用者が承認した。U-8 / U-9 は design-gate R1、U-10 は R2 の修正で足した)

関連: [research.md](research.md) / [data-model.md](data-model.md) / [contracts/session-answer-boundary.md](contracts/session-answer-boundary.md) / [quickstart.md](quickstart.md)

## Summary

Claude Code が利用者に答えを求めたとき、アプリの中で答えられるようにする。あわせて composer の手入れをする。

- **`AskUserQuestion`**: agents の `canUseTool` は、SDK の元の入力と tool 名を closure に持ったまま決定を待つ。決定が許可で回答があれば、domain の純関数 `projectAskUserQuestionAnswer` で `updatedInput` (元の入力 + `answers`) を組む (AD-052)。renderer は問いの位置ごとの回答を `respondPermission` の第 5 引数で送り、main が形を検証する。承認カードは agents が付けた印 `answerable` のときだけ、答える部品を出す
- **Elicitation**: query の options に `onElicitation` を足す (9 キー。AD-053)。要求は形の検査とスキーマの部分集合への射影を通して `SessionEvent` の `elicitation-request` で送る。応答は新しい IPC のチャネル `respondElicitation` (U-7) → main の検証 → `SessionControl` の `respond-elicitation` で返す。agents がスキーマと照合して `accept` / `decline` を返す。待つ間は `awaiting_permission` とする (U-5)
- **`elicitation_complete`**: システムイベントの行 (category `elicitation`) にする。**`request_user_dialog`** は受けない (U-3)
- **composer**: assistant-ui の trigger popover の primitive で `/` の候補を出す (変換中のガードはライブラリの側にある)。ボタンの名前を日本語にし、`unstable_focusOnRunStart={false}` にする
- **拒否の後の「編集して再試行」**: `refused_user_message_uuid` があれば status を `no-fallback-retry` にする (真偽だけを運ぶ)。renderer はアプリが送った直前の入力を composer に戻す

## Technical Context

**Language/Version**: TypeScript 5 (strict)、Electron (main / preload / renderer)、Node の `worker_threads` (supervisor / セッションスレッド)

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (版は上げない)、`@assistant-ui/react` 0.15.19 (`ComposerPrimitive.Unstable_TriggerPopover*`)、React 19、Tailwind v4 / shadcn (components/ui)。新しい npm の依存は足さない

**Storage**: なし。回答と Elicitation の入力は永続化しない (FR-009)。稼働中のストアに Elicitation の要求の写しを持つだけ (入力の値は持たない)

**Testing**: Vitest 5 (node / renderer の 2 project。vitest-axe)、Playwright + Electron の E2E (`e2e/ime.spec.ts`)、Constitution 検証 (`scripts/constitution/check.mjs` 項目 16 / 21)、ルール検証 (`scripts/rules/run.mjs`)

**Target Platform**: Windows 11 の Electron のアプリ + WSL の `claude`

**Project Type**: desktop-app (Electron。AD-023 のレイヤ構成)

**Performance Goals**: 新しい計測の目標は無い。`elicitation_complete` の行は `message` なので O-8 の観測点に数える (data-model「観測」)

**Constraints**: AD-036 Decision 2 (port は一方向・制御は検証済み IPC)、AD-052 / AD-053 (accepted。2026-10-17)、Principle VIII (IME)、XIII (element の照合)、XV (文言の表)

**Scale/Scope**: 1 セッションの Elicitation の待ちは 4 まで。回答は 4 件まで。1 つの値は 1,000 コードポイントまで。Elicitation の項目は 32 まで。コマンドの候補は 20 件まで描く

### 層ごとの変更

| 層 | ファイル | 変更 | 出所 |
|---|---|---|---|
| domain | `src/domain/session/agent-session.ts` | `PermissionRequest.answerable?`・`PermissionDecision.answers?`・`AskUserQuestionResult` / `CanUseToolResult`・`projectAskUserQuestionAnswer` / `toAskUserQuestionResult` (`toPermissionResult` の隣)・`SessionEvent` の `elicitation-request` (`SESSION_EVENT_KINDS` 9)・`SessionControl` の `respond-elicitation`・`AgentSession.respondElicitation`・定数 (`ASK_USER_QUESTION_TOOL_NAME` / `ANSWER_MAX_COUNT` / `ANSWER_MAX_CODE_POINTS`)・検証の述語 `isPermissionAnswers` (renderer・main・agents が共有。U-9) | FR-001〜FR-004 / FR-006 / FR-008 |
| domain | `src/domain/session/elicitation.ts` (新規) | `ElicitationPrompt` / `ElicitationField` / `ElicitationUrl` / `ElicitationResponse` の型・`toElicitationPrompt(raw)` (形の検査と部分集合への射影)・`matchesElicitationSchema(fields, content)`・検証の述語 `isElicitationAction` / `isElicitationContent` (共有。U-9)・`ELICITATION_MAX_PENDING`・`SUPPORTED_DIALOG_KINDS = []` | FR-005 / FR-006 / FR-008 |
| domain | `src/domain/session/transcript-dto.ts` | `SYSTEM_EVENT_CATEGORIES` に `elicitation` (12)・`SYSTEM_EVENT_STATUSES` に `no-fallback-retry` (22) | FR-010 / FR-015 |
| domain | `src/domain/capability.ts` | `ClostaCapability.respondPermission` の第 5 引数・`respondElicitation`・`IPC_CHANNELS.respondElicitation` | FR-002 / U-7 |
| agents | `src/agents/session-core.ts` | `QUERY_OPTION_KEYS` に `onElicitation` (9)・`buildQueryOptions` の deps と object literal・`createCanUseTool` の分岐 (`answerable` の付与と `toAskUserQuestionResult`)・`createPermissionRegistry.size()`・`createElicitationRegistry`・`createOnElicitation` (要求の写し・上限・`signal`・照合)・`decodeDecision` の `answers`・`decodeSessionControl` の `respond-elicitation`・`acceptsWhileClosing` | FR-003 / FR-005 / FR-006 / FR-008 / FR-009 / FR-011 |
| agents | `src/agents/sdk-agent-session.ts` | `onElicitation` の結線・`controlSink` の `respond-elicitation`・承認と Elicitation の合計による `permission-respond`・`finish` / `kill` / `end` での `cancelAll()` | FR-009 / FR-011 |
| agents | `src/agents/live-signals.ts` | `onSystem` に `elicitation_complete`・`onRefusalNoFallback` の status の分岐 | FR-010 / FR-015 |
| main | `src/main/app/validate.ts` | domain の `isPermissionAnswers` / `isElicitationAction` / `isElicitationContent` を呼ぶ (main に別の規則を書かない。U-9) | FR-002 / FR-008 |
| main | `src/main/app/session-ipc.ts` / `ipc.ts` | `handleRespondPermission` の `answers`・`handleRespondElicitation` と `handle()` での登録。戻り値は `Promise<void>` (U-9) | FR-002 / FR-008 / U-7 |
| main | `src/main/app/e2e-capability.ts` | 制御の switch に `respond-elicitation` | U-7 |
| preload | `src/preload/index.ts` | `respondPermission` の引数・`respondElicitation` | U-7 |
| renderer | `features/session/running-session-types.ts` / `running-session-store.ts` / `session-event-decoder.ts` | `PendingPermission.answerable`・`LiveSessionState.elicitations`・`respond(…, answers?)`・`respondElicitation`・`elicitation-request` の受け口と外す規則 | FR-002 / FR-006 / FR-009 |
| renderer | `features/session/ApprovalCard.tsx` / `AskUserQuestionAnswer.tsx` (新規) | 答える部品 (ラジオ / チェック / その他)・「回答を送る」「拒否」・注記の削除。問いの表示は `ask-user-question.aui.tsx` の `parseAskUserQuestionArgs` と部品を使う | FR-001 / U-6 (a) |
| renderer | `features/session/ElicitationCard.tsx` (新規) / `LivePane.tsx` | 問いのカード (form / URL / 答えられない)・承認カードの下に置く・`focus-handoff.ts` の規則 | FR-007 / U-6 (b) (e) |
| renderer | `features/session/labels.ts` | `APPROVAL_CARD_LABELS` の追加 (`askUserQuestionNotice` を削る)・`ELICITATION_LABELS` | FR-001 / FR-007 |
| renderer | `features/chat/composer-extensions.tsx` (新規) / `features/chat/slash-commands.ts` (新規) | `ComposerExtensionsContext` (コマンドの一覧・「編集して再試行」の文と操作。LivePane が渡し、過去ログは渡さない)・前方一致と並びと件数の純関数・trigger popover の adapter / matcher / formatter | FR-012 / FR-015 |
| renderer | `components/assistant-ui/elements/thread.aui.tsx` | `Composer` に trigger popover と `unstable_focusOnRunStart={false}`・ボタンと最下部への名前を文言の表から・`SystemEventRow` の「編集して再試行」と `elicitation` の行 | FR-012〜FR-015 / FR-010 |
| renderer | `features/chat/labels.ts` | `COMPOSER_LABELS`・`SYSTEM_EVENT_LABELS`・category / status の文言 | FR-010 / FR-013 / FR-015 |
| renderer | `test-support/capability.ts` | `notStubbed('respondElicitation')` | U-7 |
| e2e | `e2e/ime.spec.ts` | 変換中の `/` の場合・`'Send message'` の locator | SC-006 / SC-007 |
| scripts | `scripts/constitution/check.mjs` / `tests/rule-fixtures/` | 項目 16 の `updatedInput` / `updatedPermissions` の backstop と違反の fixture | FR-004 / R-10 |
| docs | ui-coverage・glossary・charter ×2・`_overview.md`・roadmap・prompts・005 contracts / data-model・`.specify/spec-gate/reviewers.yml`・`eslint.config.mjs` | 上流からの申し送りと機械強制の変更のとおり | FR-016 / FR-017 |

## Constitution Check

*GATE: Phase 0 の前と Phase 1 の後に確かめた。*

**NON-NEGOTIABLE**

- [x] **I. パス操作** — N/A: パスを扱わない (URL は `new URL()` で解釈するだけ)
- [x] **II. プラットフォーム分岐** — N/A: 分岐を足さない。URL を開くのは今の `openExternalIfHttp` の経路 (R-08)
- [x] **III. 権限モード** — 権限モード・tool の集合・env を変えない。`updatedInput` は `AskUserQuestion` の許可だけで、中身は元の入力 + `answers` だけ (AD-052)。`updatedPermissions` は出さない。`onElicitation` は escalation-neutral (AD-053 Decision 1)。`onUserDialog` / `supportedDialogKinds` は渡さない。項目 16 に backstop を足す
- [x] **IV. Agent SDK 経由** — 新しい通信は SDK の callback (`onElicitation`) と `canUseTool` の戻り値だけ。stream の自前パースをしない
- [x] **V. 長期資格情報** — 回答と Elicitation の入力は永続化しない・ログに出さない (FR-009 / SC-004)。URL の表示は `redactSecrets` を通す
- [x] **VI. 永続環境** — N/A
- [x] **VII. supervisor の非依存** — agents に足すのは domain の純関数の呼び出しと SDK の callback だけ。Electron を import しない (depcruise)
- [x] **VIII. 日本語環境** — コマンドの候補は `ComposerPrimitive.Input` のキー処理の中で動き、変換中 (`isComposing`) はトリガーの plugin の前に返る (R-11)。自前の keydown ガードを足さない。IME の E2E に変換中の `/` の場合を足す (SC-006)。問いのカードの入力欄は送信を Enter に結ばない (「送る」はボタンだけ)

**Standard**

- [x] **IX. main をブロックしない** — main は形の検証だけ。スキーマとの照合は agents
- [x] **X. 正本はアプリ外** — 回答は Claude Code の transcript に入る。アプリは持たない
- [x] **XI. 垂直スライス** — US-1〜US-4 のそれぞれに観測できる振る舞い (カード・行・候補・composer の文) がある
- [x] **XII. 未表示を残さない** — `後続: O-10` の 4 行と関わる行を同じ PR で書き換える (data-model §6)。項目 21 で O-10 が 0
- [x] **XIII. assistant-ui を優先** — composer の候補は assistant-ui の trigger popover の primitive。registry の `Composer slash commands` / `Composer trigger popover` / `Elicitation form` / `Question flow` は SH で取り込んで実名で照合し、結論を PR の説明と F 節に書く (R-11 / R-14)
- [x] **XIV. Ubiquitous Language** — glossary の Question from Claude Code・Approval card・Composer・PermissionRequest / PermissionDecision を直し、問いのカード (Elicitation card)・コマンドの候補を足す (FR-017)
- [x] **XV. 多言語規約** — 文言は `features/chat/labels.ts` と `features/session/labels.ts` の表に置く。`ApprovalCard` の直書きの「許可」「拒否」も表に移す

**Domain charter の整合**

- [x] session charter の In scope「`canUseTool` の permission 往復の配管」「セッション状態の管理」に収まる。Elicitation の往復は同じ配管の拡張 (charter に記録する。FR-017)
- [x] ui charter の In scope「composer (slash commands)」の部品は ui が持つ (015 spec U-1 / U-6)。承認カードと問いのカードの見た目は ui (session charter Out of scope の「承認カードの見た目と element 選定 → ui」)。Out of scope に踏み込まない

## Domain Context

### Charter

- 主 domain: `session` ([charter](../../docs/domains/session/charter.md))
  - Mission: 複数フォルダ・複数ランタイムにまたがる Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
  - In scope (関わる行): `canUseTool` の permission 往復の配管・セッション状態の管理 (idle / running / awaiting_permission / error) と監視ビュー
  - Out of scope (関わる行): transcript や tool 出力の描画・承認カードの見た目と element 選定 → `ui`
  - 業務ルール: セッションの正本は Claude Code 側 (Principle X)・Claude Code との通信は Agent SDK 経由 (Principle IV)・権限モードの選択肢は capability に従う (Principle III)
- 関わる他 domain: `ui` ([charter](../../docs/domains/ui/charter.md)) — composer (slash commands の候補の持ち主は O-10。部品と IME の扱いは ui)・承認カードと問いのカードの見た目・対応表の維持

### Related ADRs

- [AD-052](../../docs/decisions/0052-ask-user-question-answer-projection.md) — `AskUserQuestion` の回答を `updatedInput` の制約付き射影で返す: **accepted** (2026-10-17。本 feature。U-1)
- [AD-053](../../docs/decisions/0053-elicitation-callback-and-user-dialog.md) — `onElicitation` を足し、`onUserDialog` / `supportedDialogKinds` は渡さない: **accepted** (2026-10-17。本 feature。U-2 / U-3 / U-7)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — 単一セッション起動とライブストリーム。Decision 2 (port は一方向・制御は検証済み IPC) は守り、Decision 4 (P2) は AD-052 が読み替える: **accepted**
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — (g) query の options のキーの固定。AD-053 が読み替える: **accepted**
- [AD-048](../../docs/decisions/0048-session-config-display-and-answer-ui-split.md) — 問いに答える UI を O-10 に分ける (Decision 1)・Tier C を転用しない・MCP を操作しない (Decision 2): **accepted**
- [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — 拒否の行と伏せ字。「編集して再試行」を O-10 に送った: **accepted**
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — `meter` とシステムイベントの行を agents で組む形: **accepted**
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言は feature の文言の表 (i18n リソース化しない): **accepted**
- [AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) — IME のガードはライブラリ側・`ComposerPrimitive.Input` を差し替えない: **accepted**
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — セッションスレッドと承認の照合・agents の記録の出力 0 件 (Decision 6): **accepted**
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当と M3 の完了の条件: **accepted**

### Glossary 抜粋

- **Question from Claude Code (Claude Code からの問い)** — Claude Code が利用者に答えを求めるもの。`AskUserQuestion`・Elicitation・`request_user_dialog` の 3 つ。O-10 の範囲は問いに答える UI と composer のスラッシュコマンドの候補 (glossary:736-748)。本 feature で O-10 の結論 (答えるのは前 2 つ・`request_user_dialog` は受けない) に書き換える
- **Approval card (承認カード)** — `canUseTool` の permission 要求に応答する UI。`ui` (状態は `session`) (glossary:54-58)。本 feature で `AskUserQuestion` の答える部品を足す
- **PermissionRequest / PermissionDecision** — `canUseTool` の権限往復。`toPermissionResult` の出力は `{behavior, message}` (glossary:697-707)。Counterexample の「`updatedInput` を出さない」を AD-052 の読み替えに直す
- **Composer** — `ComposerPrimitive.Input` を用い、IME の二重ガードは assistant-ui 側。自前ガードを新設しない (glossary:160-168)。コマンドの候補も同じ Input の上に載せる
- **System event row (システムイベントの行)** — agents が組む transcript の 1 行 (glossary:1056)。category `elicitation` と status `no-fallback-retry` を足す
- 新しく足す: 問いのカード (Elicitation card)・コマンドの候補 (Slash command candidates)

## 上流からの申し送り

```
Grep pattern="018-session-answer-ui-and-composer-commands" glob="{docs,.specify,tests,specs}/**/*.{md,mjs,js,yaml,yml}"   → 4 件
Grep pattern="\bO-10\b"                                     glob="{docs,.specify,tests,specs}/**/*.{md,mjs,js,yaml,yml}"   → 176 件
Grep pattern="ask-user-question|elicitation|question-card|slash-command|respondElicitation|onElicitation|updatedInput|ApprovalCard|thread\.aui"
     glob="{.dependency-cruiser.js,eslint.config.mjs,scripts/constitution/*.mjs,.specify/spec-gate/reviewers.yml}"     → 9 件
合計 189 件
```

処理の語: **受ける** (本 feature の範囲で直す) / **送る** (持ち主に渡す) / **当たらない** (新しい義務を課さない記録) / **注記** (本 feature 自身の記述・自明)。

### 1. spec_id (4 件)

| # | ヒット | 内容 | 処理 |
|---|---|---|---|
| 1 | spec.md:2 / :16 | 本 spec の frontmatter と枝の名前 | **注記** |
| 2 | 0052:15 / 0053:15 | 本 feature の ADR の Context | **注記** — proposed のうちに本 plan の結論 (U-7) を AD-053 の Consequences に足した。AD-052 は変えない |

### 2. feature ID `O-10` (176 件)

| # | ヒット | 内容 | 処理 |
|---|---|---|---|
| 3 | spec.md:3,14,22,33,35,55,58,63,74,233,234,260 (12) | 本 spec | **注記** |
| 4 | roadmap.md:383 (O-10 の行) | 範囲と義務 (1)〜(3)・O-5 / O-6 からの申し送り・2 つの ADR | **受ける** — spec「義務の扱い」の表のとおり全部を入れた。完了の PR で行に結論 (U-1〜U-7 と字面との差: 問いの文のキーは agents が決める・`request_user_dialog` は空の allowlist・`respondElicitation` のチャネル) を書く (FR-017) |
| 5 | roadmap.md:200-202 / :210-212 (system-scope の composer の 2 項目) | 英語の名前の残り・ターンの開始のフォーカスの奪取。持ち主 = O-10 と X-6 の早いほう | **受ける** — FR-013 / FR-014 (R-12 / R-13)。完了の PR で 2 項目を閉じた記録を書く |
| 6 | roadmap.md:380 (O-6 の行) / 016 spec.md:46,66,245 / 016 analyze.round2:27 / 016 arch design-gate.round2:182,193 / round3:73 | 拒否の後の「編集して再試行」を O-10 に送った記録 | **受ける** — US-4 / FR-015 (R-09)。016 の記録そのものは履歴で変えない |
| 7 | roadmap.md:379 (O-5 の行) / 015 quickstart.md:23 / 015 quickstart-results:46 | O-5 V-3 の `AskUserQuestion` を許可したときの tool_result の中身 (O-10 の材料) | **受ける** — quickstart V-3 #1〜#3 (回答を送ったときの中身として記録する)。O-5 の行の記録は変えない |
| 8 | roadmap.md:390 / :381 (O-8 の行の (c) には未ヒットだが同じ義務) | O-10 の登録の経緯 / O-8 の観測点の基準の変化 | :390 は **当たらない** (履歴)。O-8 の (c) は **受ける** — `elicitation_complete` の行は数え、`elicitation-request` は数えないと並べて書く (FR-017) |
| 9 | ui-coverage.md:57,73,79,140,226,227,260,278,320 (9) | `後続: O-10` の 4 行と O-10 を名指す備考 | **受ける** — data-model §6 の書き換え先。:172 (D permission-request。015 ui-coverage pr-gate M の推奨で「O-10 で注記を外す」と書く予定だった行) と :241 (F Approval card) にも備考を足す |
| 10 | glossary.md:741,745,747 | Question from Claude Code の O-10 の範囲と Counterexample | **受ける** — O-10 の結論に書き換える。:704-706 (PermissionRequest / PermissionDecision の Counterexample。未ヒット) も AD-052 の読み替えに直す (FR-017) |
| 11 | session charter:307-309 | Related Specs の O-10 (未着手) | **受ける** — Related Specs を結論に、Related ADRs に AD-052 / AD-053、`SessionEvent` (9)・`SessionControl` (`respond-elicitation`)・`PermissionDecision.answers` の拡張を記録する (FR-017) |
| 12 | ui charter:58,247,258 | slash commands の候補の持ち主は O-10・O-10 は session で表示の部品は ui | **受ける** — :58 に結論 (trigger popover の primitive・IME はライブラリのガード・部品は ui の `features/chat`)。015 arch design-gate L-102 の推奨 (O-10 の中で候補の部品と IME の扱いは ui が持つ) もここで書く。:247 / :258 は **当たらない** (分担の記録のまま正しい) |
| 13 | _overview.md:69,110 | Feature 帰属の表と帰属の根拠 | **受ける** — :69 の題はそのまま、O-10 の結論を根拠の節 (:110) に 1 行足す (FR-017)。:115 は O-11 の記述で **当たらない** |
| 14 | prompts.md:32,300,302,306 | O-10 のプロンプトと「未使用のものは着手のときにこの形に書き直す」 | **受ける** — 着手したので :300-306 を書き直し済みの形 (1〜3 文 + roadmap の行への参照) にする (FR-017) |
| 15 | ai-workflow/PLAN.md:41,84,108,121,259 | ワークフローの見直しの計画 (O-10 のプロンプトの義務の運び方の指摘を含む) | **当たらない** — :108 の「義務の文が roadmap に移っていることを確かめてから削る」は #14 で満たす。計画の文書は変えない |
| 16 | 0048:11,34,43,46,58 | O-10 に分けた決定と Confirmation | **注記** — accepted で変えない。Confirmation (O-10 の行と対応表の 4 行) は本 feature の完了で閉じる。:34 の「domain は利用者が決める」は 015 U-1 で決まった (015 arch pr-gate の M。既知) |
| 17 | 0052:24 / 0053:26,34 | 本 feature の ADR | **注記** |
| 18 | 015 spec / plan / research / data-model / tasks / quickstart(-results) / analyze / design-gate / 各 reviewer の出力 (約 100 件) | O-10 を登録した feature の記録 | **当たらない** (履歴) — ただし次の 2 つは **受ける**: (a) ui-coverage pr-gate R1/R2 の「O-10 で注記を外すときに D 節を直し忘れるおそれ」→ #9 の :172 (b) arch design-gate L-101 / L-102 → #13 / #12 |
| 19 | 016 quickstart-results:29,32 / 016 ui-coverage pr-gate R1:11,38,40 / 016 po design-gate R3:91 / 016 tasks:89 / 016 arch design-gate:188 / 016 analyze.round3:5 | O-10 の件数 (`O-10(M3) 4 [Tier A 3]`) と分割の記録 | **当たらない** (履歴)。SC-009 で件数が 0 になる |

**O-9 の後の main に載せ直して増えたヒット (2026-10-17)**: 017 の 4 件 (plan:160 / spec:73 / ui-coverage-reviewer.pr-gate:35,65)。plan:160・spec:73・pr-gate:35 は **当たらない** (履歴)。pr-gate:65 (O-10 の「編集して再試行」が、O-9 で地図にも出るようになった拒否の行を壊しうる) は **受ける** — 地図の拒否の印は category `refusal` で決まり (`features/chat/turns.ts` の `TURN_MARK_CATEGORIES`)、status (`no-fallback-retry` を足す) に依らないので変わらない。ui-coverage の A `:57` は「「編集して再試行」は O-10」の句だけを書き換え、`ConversationMapTab` と O-9 の注記を残す (data-model §6)。同じく O-9 で、agents の行の `createdAt` は受信時刻 (`live-signals.ts` の `rowEvent`。AD-051) になった。`elicitation_complete` の行も同じ `rowEvent` で組む (data-model §5)

### 3. 名前の一覧のファイル (9 件)

| # | ヒット | 内容 | 処理 |
|---|---|---|---|
| 20 | reviewers.yml:60,67 (a11y) / :125,132 (ux) | 手書きの element の明示の一覧 | **受ける** — 新しいファイルは `features/session/**/*.tsx` と `features/chat/**/*.tsx` に置くので glob で当たる (足さない)。`thread.aui.tsx` / `ask-user-question.aui.tsx` は既にある |
| 21 | reviewers.yml:224 (ui-coverage。`ApprovalCard.tsx`) | 承認カードの明示 | **受ける** — `features/session/ElicitationCard.tsx` と `features/session/AskUserQuestionAnswer.tsx` を同じ並びに足す。domain の `src/domain/session/elicitation*.ts` も足す (SDK の要求を正規化する domain のモジュール。:211-213 と同じ理由) |
| 22 | eslint.config.mjs:566,578,589,599,622 | 手書きの element の一覧と番人の注記 | **注記** — 新しい element を `components/assistant-ui/elements/` に足さない (部品は features に置く) ので一覧は変えない。registry の element を取り込んで手を入れたら、O-3 の `command-palette.tsx` と同じく :624-627 の block に足す (SH の照合の結論による) |

`.dependency-cruiser.js` と `scripts/constitution/*.mjs` には 0 件。`scripts/constitution/check.mjs` は項目 16 を変える (下の「機械強制の変更」)。

## 実装方針

1. **domain を先に固める**: 型・射影・Elicitation の写しと照合・列挙の追加を純関数とその pin テストで作る (data-model §1 / §2 / §5)。agents / main / renderer はこれを呼ぶだけにする
2. **agents**: `createCanUseTool` は raw の `toolName` / `input` で分岐する。`answerable` の付与と射影は同じ定数で判定する。`createOnElicitation` は `session-core.ts` に置き (SDK を import しない)、`sdk-agent-session.ts` は `buildQueryOptions` に渡すだけにする。状態の遷移は 2 つの registry の合計で決める
3. **main / preload**: 既存の `handleRespondPermission` の並びに `handleRespondElicitation` を足し、`ipc.ts` の `handle()` で登録する。述語は domain に置き、`validate.ts`・renderer の送る前の確かめ・agents の decode が同じ関数を呼ぶ (U-9)。`as` を使わない。IPC の戻り値は `Promise<void>` のまま
   - **URL の Elicitation (agents / renderer)**: リンクを押すと開くのと同時に content なしの `accept` を返してカードを外す。agents の registry は要求の mode と `openUrl` の有無を持ち、URL の `accept` は content を捨て、開けない URL・答えられない form への `accept` は `decline` に替える (U-8。data-model §3 / §4)
4. **renderer の承認カード**: `ApprovalCard` は `request.answerable === 'ask-user-question'` のとき `AskUserQuestionAnswer` を描く。回答は component の state にだけ持つ。全部の問いに答えるまで「回答を送る」は `aria-disabled` + 未回答の問いの印 (U-6 (a))
5. **renderer の問いのカード**: `LivePane` の承認カードの直後に `ElicitationCard` (先頭の 1 枚と残りの数)。押したボタンでカードが外れるときは `handOffFocusToComposer` を先に呼ぶ (今の承認カードと同じ)。URL は `<a target="_blank">` (R-08)
6. **composer**: `ComposerExtensionsContext` を `features/chat` に置き、LivePane が値を渡す。`thread.aui.tsx` の `Composer` は context があるときだけ trigger popover を描く。`SystemEventRow` は context の `retryTextFor(messageId)` が文を返すときだけ「編集して再試行」を出す
7. **記録**: 完了の PR で ui-coverage・glossary・charter・roadmap・prompts・005 の pointer をまとめて直す (対象の一覧の正本は tasks.md)

## 機械強制の変更

| 対象 | 変更 | 守るもの |
|---|---|---|
| `session-core.test.ts` の `QUERY_OPTION_KEYS` の pin | 8 → 9 キー (`onElicitation`)。`onUserDialog` / `supportedDialogKinds` を含まない | SC-010 / AD-053 |
| `session-core.test.ts:248-270` (全 return が `toPermissionResult` 経由) | `toPermissionResult(` か `toAskUserQuestionResult(` を通す形を認める | FR-004 |
| `agent-session` の pin テスト | `SESSION_EVENT_KINDS` 9・tool ごとの出力のキー集合・`updatedInput` のキー集合・`updatedPermissions` 0・`SUPPORTED_DIALOG_KINDS` が空 | SC-002 / SC-010 |
| `system-event.test.ts` | category 12・status 22 | FR-010 / FR-015 |
| `src/domain/capability.test.ts:53-55` | チャネルの集合 +1 (`respondElicitation`) | U-7 |
| 項目 16 (`check.mjs`) | `src/agents/` の非テストのコードの `updatedInput` / `updatedPermissions` を違反に。違反の fixture `tests/rule-fixtures/b-equivalent/sdk-updated-input.ts.fixture` と `expected.mjs` | FR-004 / R-10 |
| `.specify/spec-gate/reviewers.yml` | ui-coverage-reviewer に `ElicitationCard.tsx` / `AskUserQuestionAnswer.tsx` / `src/domain/session/elicitation*.ts` | #21 |
| `QUERY_MUTATION_METHODS` / `AGENT_SDK_ALLOWED_CALLS` / `METER_UPDATE_TYPES` / `TRANSCRIPT_PART_FIELDS` | 変えない (差分 0 を V-1 で確かめる) | SC-010 |

## ADR

- 新しい ADR は起こさない。AD-052 / AD-053 が本 feature の決定の正本で、proposed のうちに U-7 の結論を AD-053 の Consequences に、U-8 の結論 (`elicitation_id` は行の id にだけ使い、カードと照合しない) を AD-053 Decision 6 に足した。2026-10-17 の利用者の承認 (spec「承認の記録」) で 2 つとも accepted (`date: 2026-10-17`) にした
- **実装の着手の条件は、AD-052 / AD-053 が accepted (日付つき) であること** (2026-10-17 に満たした)。proposed のまま実装に進むと、accepted の AD-036 Decision 4 P2 と AD-041 (g) に反するコードが入るためである。SH-013 は `/cl-done` の前に `status: accepted` をもう一度確かめる
- 005 contracts C-4 と 005 data-model §5 には AD-052 / AD-053 と本 feature の contracts への pointer を置く (FR-017)

## Risks

| # | リスク | 手当て |
|---|---|---|
| RK-01 | 無害化した `input` の JSON が切り詰めで壊れ、renderer が問いを読めない | 答える部品を出さず、「答えられません。拒否して本文で答えてください」と「拒否」だけ (R-01)。agents は問いの数で照合するので、renderer が読み違えても誤った回答は許可にならない |
| RK-02 | Claude Code の `answers` の書式 (`multiSelect`・その他) が端末の UI と違う | 値は文として Claude に読まれる。V-3 #1〜#3 で記録し、違えば data-model §1 を直す (利用者の確認の後) |
| RK-03 | `dontAsk` / `plan` で `AskUserQuestion` が承認の要求として届かない | 届いたときだけ答える規則 (R-16)。V-3 #4 で記録 |
| RK-04 | Elicitation を送る MCP サーバーが手元に無く、実機で確かめられない | fixture の単体と component で振る舞いを確かめる。V-3 #5 / #6 は起こせなければ未確認として残す |
| RK-05 | trigger popover は `unstable_` の API で、assistant-ui の版を上げると変わる | 使う面を `features/chat/slash-commands.ts` と `Composer` の 1 か所に閉じ、component テストで振る舞いを固定する。版を上げる PR が直す |
| RK-06 | `unstable_focusOnScrollToBottom` (既定 true) も composer にフォーカスを移す | 今回は runStart だけを止める (system-scope の記録の範囲)。最下部へのボタンを押したときの移動は利用者の操作に伴うので WCAG 3.2 の「予期しない変化」に当たりにくい。気付いた reviewer の指摘は gate の出力に残す |
| RK-07 | 承認が 2 件重なったとき、今は 1 件目の応答で `running` に戻る。合計で判定すると振る舞いが変わる | FR-011 の求める形への変更。監視ビューの承認待ちの件数の表示は状態で決まるので、重なりの間は承認待ちのまま (意図どおり)。単体テストに重なりの場合を足す |
| RK-08 | `<a target="_blank">` が renderer で初めての形で、reviewer が新しい経路と読む | `setWindowOpenHandler` が全部を `deny` して `openExternalIfHttp` に落とす既存の防御 (R-08)。新しい IPC を作らない (AD-053 Decision 5)。navigation-policy のテストに http(s) でない URL の負の例があることを SH で確かめる |
| RK-09 | 「編集して再試行」の文を `user-*` の楽観の行から取るので、再起動・閉じた後の行・Hook の自動のプロンプトでは文が見つからない | 見つからなければボタンを出さない (spec Edge Cases)。agents の status は `refused_user_message_uuid` があるときだけ立つ |
| RK-10 | MCP サーバーが form で秘密を求める | アプリは値を持ち続けない (SC-004)。MCP の仕様の禁止をサーバーが守るとは限らない (AD-053 Consequences)。入力欄に `type="password"` は使わない (スキーマに無い区別を推測しない) |

## Project Structure

### Documentation (this feature)

```text
specs/018-session-answer-ui-and-composer-commands/
├── spec.md
├── plan.md              # 本書
├── research.md          # R-01〜R-16
├── data-model.md        # §1〜§6 (規則の正本)
├── quickstart.md        # V-1〜V-3
├── contracts/
│   └── session-answer-boundary.md
└── tasks.md             # /cl-tasks で作る
```

### Source Code

```text
src/
├── domain/
│   ├── capability.ts                       # respondPermission の引数・respondElicitation・IPC_CHANNELS
│   └── session/
│       ├── agent-session.ts                # 型・射影・SessionEvent / SessionControl
│       ├── elicitation.ts                  # 新規: 要求の写し・部分集合・照合
│       └── transcript-dto.ts               # category / status の追加
├── agents/
│   ├── session-core.ts                     # QUERY_OPTION_KEYS・canUseTool・registry・onElicitation・decode
│   ├── sdk-agent-session.ts                # 結線・状態の遷移・後始末
│   └── live-signals.ts                     # elicitation_complete・拒否の status
├── main/app/
│   ├── validate.ts / session-ipc.ts / ipc.ts / e2e-capability.ts
├── preload/index.ts
└── renderer/src/
    ├── features/session/
    │   ├── ApprovalCard.tsx / AskUserQuestionAnswer.tsx (新規) / ElicitationCard.tsx (新規)
    │   ├── LivePane.tsx / running-session-store.ts / running-session-types.ts / session-event-decoder.ts / labels.ts
    ├── features/chat/
    │   ├── composer-extensions.tsx (新規) / slash-commands.ts (新規) / labels.ts
    ├── components/assistant-ui/elements/thread.aui.tsx
    └── test-support/capability.ts
e2e/ime.spec.ts
scripts/constitution/check.mjs
tests/rule-fixtures/b-equivalent/sdk-updated-input.ts.fixture (新規) / expected.mjs
```

**Structure Decision**: AD-023 のレイヤ構成のまま。新しい部品は ui の features (`features/session` / `features/chat`) に置き、`components/assistant-ui/elements/` には手書きの element を足さない (registry の element を採ったときだけ取り込む)。

## 設計後の見直し (Phase 1 の後)

- NEEDS CLARIFICATION は残っていない。plan の段で見つけた食い違い (FR-008 と SC-010) は U-7 として spec に足し、AD-053 の Consequences を直した (main の仮採用。2026-10-17 に利用者が承認)
- Constitution Check は Phase 1 の後も全項目が通る。Complexity Tracking に載せる違反は無い
- after_plan の hook (`speckit.agent-context.update`) は optional で、自動では実行しない

## Complexity Tracking

違反なし。
