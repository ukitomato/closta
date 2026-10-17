# Implementation Plan: 会話の時間と活動の可視化 (O-9)

**Branch**: `017-ui-conversation-time-and-activity` (main 1761c32 の上) | **Date**: 2026-10-16 (夜間の自走。利用者は不在) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-8 は夜間の仮採用で、2026-10-17 に利用者が**承認済み**。U-8 は design-gate H-001 の修正で足した。AD-051 は本 plan で proposed として起こし、2026-10-17 に accepted)

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、1761c32 のソースと突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## Summary

- **メッセージの時刻 (US-1)**: domain に時刻の検査の純関数 `parseMessageTime` を新設する。過去ログの変換は `getSessionMessages` の返りの `timestamp` を、実行中の agents は SDK の `timestamp` を使い、無ければ受信時刻を入れる。利用者の入力は稼働中のストアが送った時刻を入れる (AD-051)。renderer は時刻を `metadata.custom.createdAt` に写して読む (assistant-ui の `createdAt` の既定値「今」を避ける)。中央の利用者と assistant のメッセージに時刻を、終わったターンに所要時間を出す
- **会話の地図 (US-2)**: renderer の純関数 `deriveTurns` がターンを導く。右のペインのタブの表に「会話の地図」を足し、ターンごとの行を仮想化して描く。行を選ぶと、O-3 の会話内検索と同じ移動 (`navigateTo`) で中央が移る。中央と右のペインは、シェルが持つ「中央の会話の公開口」(新設) でつなぐ
- **活動の帯 (US-3)**: 純関数 `activityBins` が会話の時間を最大 48 の区間に分け、地図のタブの上端に toolbar の帯として描く
- **記録**: 対応表の F 節の O-9 の 4 行と、registry に増えた Conversation map を 1 行足す。A 節の 2 行・SDK を上げたときの手順・glossary・charter 2 つ・roadmap ほか (data-model §7)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (型の行は data-model の冒頭)。`@assistant-ui/react` 0.15.19 (`metadata.custom` は変換をそのまま通る。`createdAt` の既定値は `thread-message-like.ts:115`)。`@tanstack/react-virtual` ^3.14.13 (transcript の仮想化と同じ)。`lucide-react` (`MapIcon`)。新しい npm の依存は足さない (registry の element を取り込む場合も、その element の依存が既にあるものに限る。research R-10)

**Storage**: N/A (時刻・ターン・区間はどれも表示の状態で、永続化しない。Principle X)

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe (O-7 で導入)、Constitution 検証 (`node scripts/constitution/check.mjs`)。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。Claude Code は WSL / Windows / docker endpoint のどれでも動く (表示の時刻の時計のずれは補正しない。所要時間は 1 つの時計どうしで引く。U-8)

**Project Type**: desktop-app (main / preload / renderer / agents (supervisor の Worker) / domain)

**Performance Goals**: 地図のタブの更新は 500ms に 1 回まで (spec Clarifications)。地図が同時に描く行の数は会話の長さに依存しない (FR-011 / SC-003)。`deriveTurns` / `activityBins` はメッセージの数に比例する 1 回の走査

**Constraints**: `TranscriptMessageDTO` の形・`TRANSCRIPT_MESSAGE_FIELDS`・`TRANSCRIPT_PART_FIELDS`・`SessionEvent` の種類・`METER_UPDATE_TYPES`・IPC・preload・main・Agent SDK の呼び出しの許可リスト・query の options のキーを変えない (FR-005 / SC-005)

**Scale/Scope**: FR 16 / SC 6。新しい表示 3 つ (MessageTimeLabel・ConversationMapTab・活動の帯)、新しい純関数 4 つ (`parseMessageTime`・`deriveTurns`・`activityBins`・書式の関数)

### レイヤごとの変更 (1761c32 で確かめた起点)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/transcript-time.ts` (新設) | `parseMessageTime(raw, now)` (data-model §1。import を持たない) | — |
| domain | `src/domain/session/transcript.ts` | `SessionMessageLike` に `timestamp?: unknown`。`toTranscriptMessages(records, options?: { now?: number })`。各メッセージ・Hook / task の行に時刻 | `:161-163`、`:183` / `:195` (行)、`:286` (メッセージ) |
| domain | `src/domain/session/live-message.ts` | `LiveAssistantMessage` に `timestamp?: unknown`。`toLiveAssistantMessage(msg, receivedAt)` | `:76` |
| domain | `src/domain/session/system-event.ts` | 変更なし (`toSystemEventMessage(raw, createdAt)` の第 2 引数は既にある。`:124`) | — |
| agents | `src/agents/read-transcript.ts` | `toTranscriptMessages(messages, { now: Date.now() })` | `:70-75` |
| agents | `src/agents/sdk-agent-session.ts` | `for await` で 1 件ごとに `receivedAt` を取り、`case 'assistant'` (`toLiveAssistantMessage`)・`case 'user'` (`applyUserMessage`)・`case 'system'` (`toSystemEventMessage(message, receivedAt)`) に渡す | `:628-702` (`:629-639` / `:640-646` / `:678`) |
| agents | `src/agents/live-signals.ts` | `rowEvent` の `createdAt` を `clock.now()` に。`:101` の注記を直す | `:101-120` (`:117`) |
| agents | `src/agents/live-tool-results.ts` | `applyUserMessage(raw, receivedAt)`、`orphanMessage(result, receivedAt)` | `:74-81`、`:122` |
| renderer | `src/renderer/src/features/chat/convert.ts` | `toThreadMessage` で `metadata.custom.createdAt`。`fromSystemEventData` は `readMessageTime` で読む | `:143`、`:155-174` |
| renderer | `src/renderer/src/features/chat/` (新設) | `message-time.ts` (`readMessageTime`・書式の 3 関数)、`turns.ts` (`deriveTurns`)、`activity-bins.ts`、`center-conversation.ts` (公開口の store と context)、`ConversationTimeProvider.tsx` (導出・所要時間の context・publish)、`MessageTimeLabel.tsx`。`labels.ts` に文言 | `labels.ts:15` (`COUNT_FORMAT`)・`:18-33` |
| renderer | `src/renderer/src/features/chat/ConversationSearchProvider.tsx` | `goTo` の本体を `useCallback` の `navigateTo` に移し、context で出す (research R-07) | `:94-112` |
| renderer | `src/renderer/src/features/session/running-session-store.ts` | `appendUser` に時刻 (`now()`)。`upsertMessage` で前の時刻を保つ。`message` の取り込み (`applyMessage`) と `appendUser` で `metadata.custom.receivedAt` に `now()` (所要時間の時計。U-8) | `:120-148`、`:403-411`、`:620-630` |
| renderer | `src/renderer/src/features/session/RunningSessionsProvider.tsx` | `busy` の判定を `isRunBusy` に出す (地図と所要時間の `lastTurnOpen` が同じ判定を使う) | `:183-192` |
| renderer | `src/renderer/src/features/shell/` | `CenterPane.tsx` の `RunningCenter` / `PastCenter` に `ConversationTimeProvider`。`AppShell.tsx` の `ShellLayout` に公開口の store。`ConversationMapTab.tsx` (新設。地図と帯)。`panel-tabs.ts` に行。`labels.ts` に文言 | `CenterPane.tsx:93-115` / `:181-193`、`AppShell.tsx:45-69`、`panel-tabs.ts:34-60`、`labels.ts:41-46` |
| renderer | `src/renderer/src/stores/ui.ts` | `PanelTabId` に `'conversation-map'` | `:30` |
| renderer | `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` | `UserMessage` と `AssistantMessage` に `MessageTimeLabel` (システムイベントの行と divider には置かない) | `:828-962`、`:1284-1317` |
| 設定 | `eslint.config.mjs` | registry の element (`elements-message-timing` / `heat-graph` / `conversation-map`) を取り込んで手を入れたときだけ、手を入れた element の一覧 (`:624-627`) に足す | `:619-634` |

**未確定の技術事項**: なし。spec の [ASSUMED] は文言と数値の既定値で、本 plan で足した文言 (data-model §5 の「本書」の行) も同じ種類。実機で確かめる前提 (過去ログに `timestamp` が残るか・実行中の SDK が `timestamp` を持つか) は quickstart V-3 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — N/A: パスの値を扱わない
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — 時刻の書式はローカルの時刻 (`Intl.DateTimeFormat`) で、OS で分けない。WSL とホストの時計のずれを補正しない (AD-051 Decision 5)
- [x] **III. 権限モードは capability に従う** — N/A: 承認と権限モードに触れない
- [x] **IV. 通信は Agent SDK 経由** — SDK が返す値 (`getSessionMessages` の返り・`SDKAssistantMessage`) を読むだけ。JSONL を自分で読まない (AD-034 / AD-051)。`Query` のメソッドの呼び出し・Agent SDK の呼び出しの許可リストを変えない
- [x] **V. 長期資格情報を永続化しない** — N/A: 時刻だけを読む。地図の入力の先頭は変換で無害化済みの本文を切り詰めるだけ
- [x] **VI. 永続環境を構築・変更しない** — N/A
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents が足す import は `domain/session/transcript-time.ts` だけ
- [x] **VIII. 日本語環境で破綻しない** — composer を変えない。地図と帯のキー操作は IME の変換中のキーを無視する。入力の先頭はコードポイントで切る (サロゲートペアを割らない)

**Standard**

- [x] **IX. main process をブロックしない** — 変換は agents と renderer。main の差分 0
- [x] **X. セッションの正本はアプリ外** — 時刻は Claude Code の記録の値で、表示だけに使い、永続化しない
- [x] **XI. 垂直スライス** — US-1〜US-3 はどれも中央と右のペインで観測できる。実機の目視は quickstart V-3
- [x] **XII. 未表示情報を残さない** — 完了の PR で対応表を data-model §7 のとおりに書き換える。A 節の行の集合は変えないので項目 21 が ok
- [x] **XIII. assistant-ui の element と design system を優先** — Message timing (AUI と standalone)・Heat graph・Conversation map (registry に増えた名前。F 節に足してから照合する) を実装の最初に取り込んで確かめ、照合した候補名と不適合の理由を PR の説明に書く。Activity graph / Trace waterfall は U-6 で使わない (research R-10)。帯の色はテーマのトークンの不透明度だけ
- [x] **XIV. Ubiquitous Language** — 用語 (メッセージの時刻・ターン・ターンの所要時間・会話の地図・活動の帯) を glossary に足す (FR-016)。印の名前は O-6 の category の語 (`SYSTEM_EVENT_CATEGORY_LABELS`) を使う
- [x] **XV. 多言語規約** — 文言は `features/chat/labels.ts` と `features/shell/labels.ts` に置く (AD-045)。コンポーネントに直書きしない

**Domain charter の整合**

- [x] 本 feature の domain (`ui`) の In scope (「Thread 検索、conversation map、observability 系の表示」`charter.md:61`・transcript の表示・右のペインのタブの表 `:77-84`) に収まっている
- [x] 不変条件「長大スレッドは仮想化する」(`charter.md:162`) — 地図も仮想化する (FR-011)
- [x] Out of scope (他 domain) には、session の契約の値 (`createdAt` を埋める変換) に触れる点で踏み込む。O-4 U-1 / O-6 U-6 と同じ形で spec U-1 (2026-10-17 承認) とし、session charter に記録する (FR-016)

## Domain Context

### Charter reference

- Domain: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- Mission: Claude Code が emit する情報のすべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する (`charter.md:35-36`)
- Scope: transcript の表示、Thread 検索・conversation map・observability 系の表示 (`:61`)、アプリのシェル (右のペインのタブの表。`:77-84`)、`docs/ui-coverage.md` の維持
- Journey: Journey 1「過去セッションを読む」(`:112-118`。時刻と地図で「いつ・どこで」が読める) と Journey 2「実行中セッションを見て応答する」(`:120-125`。所要時間。地図はスクロールを奪わない)
- KPI: 「表示網羅」(項目 21) と「自作率」(照合の結果を PR に書く)。`:165-176`
- 触れる他の domain: `session` ([charter](../../docs/domains/session/charter.md)) — `createdAt` を埋める変換 (domain の変換と agents のセッションスレッド)・稼働中のストアの `appendUser` (U-1)。session charter の Key concepts・Related ADRs・Related Specs に記録する
- charter の frontmatter の `related_specs` に 017 が、`related_adrs` に AD-051 が無い — FR-016 の記録の更新で足す

### Related ADRs

- **AD-051** ([0051](../../docs/decisions/0051-message-time-source-and-display-only.md)) — メッセージの時刻の出所と、表示だけに使うこと: **accepted** (本 plan で起こした。U-2 / U-3 と合わせて 2026-10-17 に利用者が承認)
- [AD-046](../../docs/decisions/0046-app-shell-layout.md) — シェルと右のペインのタブの表 (Decision 4)・置き場所の語 (Decision 6): accepted (O-7)
- [AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) — UI の文言を `labels.ts` に置く: accepted (O-3)
- [AD-044](../../docs/decisions/0044-ui-coverage-assignment.md) — 対応表の割当の書式と項目 21: accepted
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — 過去ログの取得の経路 (1 要求 = 1 プロセス。地図は取得し直さない): accepted
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) / [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) — 実行中の行を agents で組む形・境界の行と取り消し (地図の印と数え方): accepted
- [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) — element の棚卸し (F 節の分類): accepted
- [AD-050](../../docs/decisions/0050-gate-finding-handling-and-round-limit.md) — gate の Medium / Low の扱いと round の上限: proposed (AGENTS.md の gate の原則に入っている)

### Glossary excerpt

- **Conversation search (会話内検索)** (`glossary.md:209-219`): 開いた会話の `text` part を探し、一致へ移る (O-3)。地図と帯はこの移動の経路を使う
- **System event row (システムイベントの行)** (`:1028-1049`): Hook / task と O-4〜O-6 の行。地図の境界の印は O-6 の 3 つの category。時刻の表示は付けない
- **Shell (シェル)** (`:1051-1071`): サイドバー・中央・右のペイン。地図は右のペインのタブ
- **Thread search** (`:1075-1085`): 要約行のフィールドを探す。Counterexamples (`:1083`) の「本文の横断検索は O-9 で要否を判断する」を U-7 の結論に直す
- **transcript** (`:1134`): 会話の表示。時刻は表示だけに使う
- 本 feature で足す語: メッセージの時刻・ターン・ターンの所要時間・会話の地図・活動の帯 (FR-016)

## 上流からの申し送り

```text
# 2026-10-16 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "017-ui-conversation-time-and-activity" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 2 件 / 1 ファイル (この plan と research / data-model / quickstart / AD-051 を書く前の数)
# 2) feature ID (spec_id だけでは roadmap・対応表・charter の申し送りに当たらないため足した)
rg -n "\bO-9\b" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 77 件 / 24 ファイル
# 3) 新設のモジュール名を実名リスト方式のルールで
rg -n "transcript-time|parseMessageTime|center-conversation|turns\.ts|activity-bins|ConversationMap|conversation-map|MessageTime" .dependency-cruiser.js eslint.config.mjs scripts/**/*.mjs .specify/spec-gate/reviewers.yml
#    → 0 件
#    加えて、実名リストを持つ 2 ファイルを読んだ (eslint.config.mjs:557-634、reviewers.yml:37-76 / :104-140 / :196-230)
# 合計: 79 件 (1) 2 + 2) 77 + 3) 0)
```

### 1) spec_id の 2 件

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/017/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |

### 2) feature ID (`O-9`) の 77 件

本 spec の中の 13 件は **当たらない** (#1 と同じ理由)。残りの 64 件を出所ごとに割り当てる。

| # | 出所 | 件数 | 内容 | 処理 |
|---|---|---:|---|---|
| 2 | `docs/roadmap.md:382` (O-9 の行) | 1 | 範囲・`createdAt` の前提と持ち主の確認・本文の横断検索と一覧の仮想化の判断 | **受ける** — spec の「義務の扱い」の表が正本。完了の PR で行に結論を書く (FR-016。data-model §7) |
| 3 | `docs/roadmap.md:377` (O-3 の行)・`:388` (O-8 / O-9 を足した注記) | 2 | O-3 から O-9 に分けた記録 | **当たらない** — O-3 の記録 |
| 4 | `docs/roadmap.md:381` (O-8 の行の (c)。`O-9` の綴りは無いが、O-4〜O-6 の前例の義務) | — | 観測点 `receivedMessages` の基準の変化を並べて書く | **受ける** — 記録だけ (spec「義務の扱い」。research R-13) |
| 5 | `docs/ui-coverage.md:235`, `:287`, `:309`, `:357` | 4 | F 節の Activity graph / Heat graph / Message timing / Trace waterfall の備考 | **受ける** — data-model §7 (FR-014)。あわせて registry に増えた Conversation map を F 節に足す (Principle XIII の Exceptions。research R-10) |
| 6 | `docs/glossary.md:1083` | 1 | Thread search の Counterexamples「本文の横断検索は O-9 で要否を判断する」 | **受ける** — U-7 の結論に直す (FR-016) |
| 7 | `docs/domains/_overview.md:68` | 1 | feature の一覧の O-9 の行 | **受ける** — 範囲を結論に (FR-016) |
| 8 | `docs/domains/ui/charter.md:65`, `:234`, `:251` | 3 | 本文の横断検索の要否は O-9・O-3 から分けた記録・残りの feature | **受ける** — `:65` を結論に、`:251` から O-9 を外す。`:234` は O-3 の記録のまま (FR-016) |
| 9 | `docs/prompts.md:32`, `:261`, `:291`, `:293`, `:296`, `:317`, `:318` | 7 | 未使用のプロンプトの書き直し・O-3 から分けた記録・O-9 のプロンプト・targets の注 | **受ける** — `:291-296` に完了の注記、`:317-318` に targets を `both` で決めたと書く。`:32` / `:261` は記録のまま (FR-016) |
| 10 | `docs/ai-workflow/PLAN.md:84`, `:108`, `:121`, `:259` | 4 | ワークフローの進め方 (O-8 / O-9 / O-10 を 1 本ずつ design する) | **当たらない** — 進め方の記録。本 feature はその「1 本ずつ」の 1 本 |
| 11 | `specs/012-ui-thread-search/spec.md` | 9 | U-1 の分割・FR-004 の [ASSUMED]「会話内検索の対象を広げるかは O-9 で再検討」・Out of Scope (本文の横断検索・地図と timing と heat graph)・roadmap の注記 | **受ける** — FR-004 の預かりは spec の「義務の扱い」で「広げない」(U-7)。roadmap の O-9 の行に結論を書き足す (FR-016)。012 の文書は変えない |
| 12 | `specs/012-ui-thread-search/plan.md` | 7 | O-8 / O-9 の登録・F 節の付け替え・申し送り #26 (一覧の仮想化は O-9 の本文の横断検索の判断と合わせて見る) | **受ける** — #26 は U-7 (b) で「足さない」。他は O-3 の記録 |
| 13 | `specs/012-ui-thread-search/research.md:7`・`tasks.md:108` | 2 | O-3 の範囲の分割・roadmap の追随 | **当たらない** — O-3 の記録 |
| 14 | `specs/012-ui-thread-search/quickstart.md:19`, `:27`, `:34`・`quickstart-results.md:52`, `:67`, `:71` | 6 | O-9 の行の存在の確認・F 節の備考の確認・**V-3「過去のセッション 50 件以上で語 1〜2 個で絞れたか」(O-9 の本文の横断検索の判断材料。未実施)** | **受ける** — `:34` / `:71` の確認は本 feature の quickstart V-3 の 11 に引き継ぐ (research R-11)。他は O-3 の記録 |
| 15 | `specs/012-ui-thread-search/a11y-reviewer.pr-gate.md:186`・`.round1.md:234`・`.round2.md:186` | 3 | [Low] L-004 会話内検索の `status` に一致の役割と前後の数語を足す。「O-9 で扱うなら roadmap に書く」 | **扱わない** — Low。roadmap の O-9 の行に無く、本 feature の範囲 (会話内検索を広げない。U-7) の外。O-3 の gate の出力に残り、M3 の終わりの棚卸しで扱う (AGENTS.md の gate の原則 / AD-050) |
| 16 | `specs/012-ui-thread-search/ui-coverage-reviewer.pr-gate*.md` (3 本) | 9 | F 節の 4 行の付け替えの確認・**R1 `:113`「シェルの部品が SDK の emit を出すとき行に書くかが O-9 でまた出る」** | **受ける** — 地図とメッセージの時刻は SDK の emit (assistant / user のメッセージの時刻) を出すので、A 節の 2 行の割当に書く (ui charter `:81-84` の規則。FR-014)。他は確認の記録 |
| 17 | `specs/012-ui-thread-search/architecture-reviewer.design-gate.md:239`, `:334` | 2 | `_overview.md` の帰属の判断根拠の見出し (O-3 / O-8 / O-9 は 0 件) | **当たらない** — L-101 (Low)。O-3 の gate の出力に残る |
| 18 | `specs/012-ui-thread-search/platform-boundary-reviewer.pr-gate.round1.md:143` | 1 | 「パスの値は検索の対象にならない」という無い不変条件を前提に O-9 の本文の横断検索を判断すると誤る | **受ける** — U-7 は本文の横断検索を足さないので、この前提に依らない。本 feature は検索の対象を変えない |
| 19 | `specs/012-ui-thread-search/po-reviewer.pr-gate.round1.md:170` | 1 | [ASSUMED] の範囲の判断を O-9 に送るなら、その間の誤解を文言で防ぐ | **受ける** — U-7 (c) で会話内検索の対象を広げないと決め、O-3 の文言 (text part だけを探す) はそのまま正しい |
| 20 | `specs/015-ui-mcp-elicitation-commands/architecture-reviewer.pr-gate.round1.md:34` | 1 | 後続 (O-6 / O-9) が「読み取りだから呼んでよい」と `Query` のメソッドを読む余地 | **受ける** — 本 feature は `Query` のメソッドを呼ばない。`getSessionMessages` の呼び方 (`includeSystemMessages`) も変えない (FR-005) |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 21 | `eslint.config.mjs:557-634` (手書きのコードに strictness を戻す一覧) | `elements/` の手書きのファイルと手を入れた registry の element を 1 つずつ並べる。`thread.aui.tsx` は `:565-569` | **条件つきで受ける** — 新しい UI は `features/chat` / `features/shell` に置く (緩和の外)。registry の element を取り込んで手を入れたときだけ `:624-627` に足す。`thread.aui.tsx` は一覧にあるまま |
| 22 | `.specify/spec-gate/reviewers.yml:44` / `:48-50` / `:109` / `:113-115` / `:206-230` | a11y / ux は `features/chat/**/*.tsx`・`features/shell/**/*.tsx`・`panel-tabs.ts`・`labels.ts` を、ui-coverage は `src/domain/session/transcript*.ts`・`features/chat/**`・`features/shell/**/*.tsx` を持つ | **当たらない** — 新設のファイルはどれも今のパターンに入る (`transcript-time.ts` は `transcript*.ts` に当たる)。registry の element を `elements/` に取り込むなら、a11y / ux の手書きの element の一覧 (`:54-76` / `:120-140`) に足すかを同じ PR で決める |
| 23 | `.dependency-cruiser.js`・`scripts/constitution/*.mjs` | 新設のモジュール名で 0 件。新設のファイルは既存のレイヤ規則 (domain / agents / renderer) に入る | **当たらない** |
| 24 | `src/renderer/src/features/shell/panel-tabs.test.ts:74-76` (`PANEL_TABS` の id の並びの固定テスト) | 3 つ | **受ける** — `['overview', 'usage', 'init-report', 'conversation-map']` に直す (実名リストではないが、集合を固定するテスト) |

### 4) 参考: `src` の注記 (棚卸しの範囲の外)

| # | 出所 | 処理 |
|---|---|---|
| 25 | `src/agents/live-signals.ts:101` (`createdAt` は O-2 と同じく `null`)・`src/domain/session/transcript-dto.ts` の `createdAt` の注記 (「取得できないときは null」) | **受ける** — `:101` を AD-051 の受信時刻に直す。DTO の注記は今も正しい (値の範囲の説明に AD-051 への参照を足す) |
| 26 | `src/renderer/src/stores/ui.ts:28`・`features/shell/panel-tabs.ts:12-16` (後続 feature が表に行を足す) | **受ける** — 本 feature が 4 つ目の行を足したことを注記に足す |

### 5) system-scope の持ち主の記録

spec の「義務の扱い」の表の最後の 2 行が正本 (直近の活動の不可視文字・composer の 2 項目と `runtime-store.ts` の検出)。どれも当たらない。本 plan で足すものは無い。

## 実装方針

規則の正本は data-model。ここには 1761c32 のソースと突き合わせて決めた置き場所と順序だけを書く。

### 時刻の値 (US-1。FR-001〜FR-005)

- `parseMessageTime` は `src/domain/session/transcript-time.ts` に置き、import を持たない。過去ログ (`transcript.ts`) と実行中 (`live-message.ts`・agents) の両方が呼ぶ
- 過去ログの Hook / task の行は `toSystemEventMessage({ ...asRecord(rec.message), type: 'system' }, createdAt)` (`transcript.ts:183`) で作り、`:195` の `createdAt: null` を `merged.createdAt` にする。時刻は `rec.timestamp` (記録の最上位) にあり、`rec.message` の中ではない
- 実行中は `sdk-agent-session.ts` の `for await` の先頭で `const receivedAt = Date.now()` を 1 回だけ取り、switch の 3 つの枝に渡す。`live-signals.ts` の `rowEvent` は自分の時計 (`clock.now()`) を使う (signals は自分の時計をテストで差し替えている)
- 稼働中のストアの `appendUser` の時刻はストアの `now()` (テストで差し替えられる時計)。積まれた入力は取り出して `send` に渡す直前の `appendUser` (`:484-496`) で入る
- 所要時間の時計 (U-8): 稼働中のストアは `message` を取り込むたびに `now()` を 1 回取り、`withReceivedAt(like, ms)` (`message-time.ts`) で `metadata.custom.receivedAt` に入れる (差し替えでは上書き)。`appendUser` は `createdAt` と同じ値を入れる。`deriveTurns` はターンの始まりが `receivedAt` を持てばその時計で、持たなければ記録の時刻で両端を引く (data-model §2)。DTO・agents は変えない
- renderer の写し: `toThreadMessage` と `appendUser` は同じ helper (`withMessageTime(like, ms)`。`message-time.ts`) を通して `createdAt` と `metadata.custom.createdAt` を入れる。`appendUser` は `features/session` から `features/chat` の helper を import する (今も `convert.ts` を import している方向)

### 中央の表示 (US-1。FR-006 / FR-007)

- `MessageTimeLabel` を `thread.aui.tsx` の `UserMessage` と `AssistantMessage` に置く。時刻は `useAuiState` でメッセージの `metadata.custom.createdAt` を読み、所要時間は `ConversationTimeProvider` の context (`Map<id, durationMs>`) を id で引く
- **実装の最初に** registry の `elements-message-timing` を取り込んで照合する (research R-10)。合えば `MessageTimeLabel` はその element を包む。合わなければ文字の体裁 (`text-muted-foreground` の小さな文字) で作る。どちらでも置き場所と context は同じ
- システムイベントの行は `AssistantOrSystemEvent` (`thread.aui.tsx`) が行に振り分けた後に描くので、`AssistantMessage` の本体の枝にだけ置けば行には出ない。過去ログの divider は data part だけの assistant として同じ振り分けを通る (O-6) ので、data part だけのメッセージには置かない

### 地図と中央の経路 (US-2。FR-008〜FR-011)

- `ConversationSearchProvider` (`:94-101`) の `goTo` の中身を `navigateTo = useCallback(…, [registry, reveal])` に移す。`pendingRevealRef` と再試行 (`:107-112`) はそのまま。effect (`:103-105`) は `navigateTo` を呼ぶ。`navigateTo` は新しい context (`ConversationNavigateContext`) で出す
- `ConversationTimeProvider` は `ConversationSearchProvider` の内側に置く (`RunningCenter` は `:93-115`、`PastCenter` は `:181-193`)。props は `conversationKey`・`messages` (検索の provider と同じ値)・`lastTurnOpen`。`deriveTurns` を `useMemo` で走らせ、所要時間の context を配り、effect で公開口に publish する
- 公開口の store は `AppShell.tsx` の `ShellLayout` (`:45-69`) で `useState(createCenterConversationStore)` で 1 つ作り、`CenterPane` と `RightPanel` を含む範囲に context で配る。テストの harness (`test-support/app-shell-harness.tsx`) は `AppShell` を描くのでそのまま乗る
- 地図のタブ (`ConversationMapTab.tsx`) は `useSyncExternalStore` で公開口を読み、500ms の間引きを通してから描く。帯の `activityBins` はタブの中で `useMemo`
- タブの行は `PANEL_TABS` の最後。`RightPanel` のキー操作とテスト (`RightPanel.tabs.test.tsx`) は表を読むので変更しない。`panel-tabs.test.ts:74-76` の固定の並びだけを直す

### 実装の順

1. domain (`parseMessageTime`・過去ログの時刻・`toLiveAssistantMessage`) と表の単体
2. agents (`receivedAt`・結果だけのメッセージ・行の時刻・`read-transcript` の `now`)
3. renderer の写し (`withMessageTime`・`readMessageTime`・`toThreadMessage`・`fromSystemEventData`・`appendUser`・`upsertMessage`)
4. registry の照合 (Message timing・Heat graph・Conversation map。research R-10)。Conversation map が「合う」なら止めて利用者に返す (RK-04)
5. `deriveTurns`・書式の関数・`MessageTimeLabel`・`ConversationTimeProvider` と中央の表示
6. `navigateTo` の切り出し・公開口・地図のタブ
7. `activityBins` と帯
8. 記録 (対応表・glossary・charter 2 つ・`_overview.md`・`prompts.md`・roadmap・src の注記。data-model §7)

## 機械強制の変更

- **固定テスト**: `PANEL_TABS` の id の並び (4 つ)。`TRANSCRIPT_MESSAGE_FIELDS` / `TRANSCRIPT_PART_FIELDS` / `METER_UPDATE_TYPES` は変えずに通す (SC-005)
- **単体**: `parseMessageTime` の表 (data-model §1)、過去ログの変換の時刻、`toLiveAssistantMessage` の時刻、agents の 3 経路と送り直しで時刻が変わらないこと、`appendUser` と積まれた入力、`deriveTurns` (§2 の各規則)、`activityBins` の表 (§4)、書式の関数 (§5。日付をまたぐ・1 時間以上)
- **component**: 時刻と所要時間 (偽の時計。US-1 AC1〜AC5)、地図 (US-2 AC1〜AC6。1,000 ターンで描く `<li>` の数の上限。vitest-axe)、帯 (US-3 AC1〜AC4。vitest-axe)
- **lint / depcruise / Constitution 検証**: 規則の追加は無い。registry の element に手を入れたときだけ `eslint.config.mjs` の一覧に足す (申し送り #21)

## ADR

AD-051 を本 plan で起こした (FR-015)。spec の U-2 / U-3 と合わせて 2026-10-17 に利用者が承認し、accepted にした。ほかの accepted の ADR の本文は変えない。session charter の Related ADRs に AD-051 を足すのは FR-016 の記録の更新。

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 夜間に仮採用した判断 (U-1〜U-8・AD-051) が承認で覆る | 2026-10-17 に利用者がすべてそのまま承認した (解消)。実装の途中で前提が覆ったら止めて利用者に返す |
| RK-02 | 実機の過去ログが `timestamp` を返さない (SDK の実装と記録の違い) | `null` に倒れて今の表示に戻る。quickstart V-3 の 1 で確かめ、出なければ AD-051 の Confirmation に従って見直す |
| RK-03 | ランタイム (WSL ディストロ・docker endpoint のコンテナ) の時計 (SDK の値) とホストの時計 (受信時刻・送信時刻) がずれる | 所要時間は 1 つの時計どうしで引く (実行中は renderer の受信時刻。data-model §1「renderer の受信時刻」/ §2。U-8 / AD-051 Decision 7) ので、ずれは所要時間に乗らない。表示の時刻と活動の帯は補正しない (AD-051 Decision 5)。V-3 の 4 を WSL ランタイムで行い (docker endpoint があればそれでも)、実行中と過去ログの所要時間の差を記録する。`deriveTurns` の時計が 2 つの固定テストで守る |
| RK-04 | registry の `conversation-map` が合い、U-5 (行の一覧の形) と食い違う | 実装の順の 4 で確かめる。合うなら実装を止め、`.needs-input` の形で利用者に返す (U-5 の見直し) |
| RK-05 | 過去ログの圧縮の要約・`is_meta` の user の記録が 1 ターンに数えられる | 既知の限界 (research R-06)。V-3 の 3 で記録し、見分けるなら後続で `isCompactSummary` / `is_meta` を変換に通す (本 feature の範囲の外) |
| RK-06 | assistant のメッセージ (tool だけを含む) ごとに時刻が出て、transcript が騒がしくなる | spec FR-006 のとおり出す。V-3 の 12 で記録し、密度の規則を足すなら利用者の判断を待つ |
| RK-07 | `navigateTo` を `useEffectEvent` から `useCallback` に移す変更で、O-3 の会話内検索の移動 (窓を広げて移り直す) が壊れる | 中身を変えず置き場所だけを替える。O-3 の `ConversationSearch.test.tsx`・`transcript-navigator.test.tsx`・`RunningSessionsProvider.test.tsx` をそのまま通す |
| RK-08 | 地図の仮想化で、フォーカスのある行が描く範囲の外に出てフォーカスを失う | `rangeExtractor` で常に描く (data-model §6)。component テストで末尾まで移ってから先頭に戻る操作を固定する |
| RK-09 | 中央の切り替えの順で、古い provider の `clear` が新しい publish を消す | `clear` は同じ `conversationKey` のときだけ消す (data-model §6)。切り替えの component テストで固定する |
| RK-10 | 所要時間の context の参照が毎回変わり、利用者のメッセージがすべて再描画される | 中身が同じなら前の Map を返す (data-model §2)。component テストで描画の回数を見る |

## Project Structure

### Documentation (this feature)

```text
specs/017-ui-conversation-time-and-activity/
├── spec.md
├── plan.md              # 本ファイル
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md             # /cl-tasks で作る
docs/decisions/0051-message-time-source-and-display-only.md   # AD-051 (accepted)
```

contracts/ は作らない (IPC・preload・port の契約を変えない。FR-005)。

### Source Code (repository root)

```text
src/
├── domain/session/
│   ├── transcript-time.ts          # 新設 parseMessageTime
│   ├── transcript.ts               # 過去ログの時刻
│   └── live-message.ts             # 実行中の assistant の時刻
├── agents/
│   ├── read-transcript.ts          # now を渡す
│   ├── sdk-agent-session.ts        # receivedAt
│   ├── live-signals.ts             # 行の時刻
│   └── live-tool-results.ts        # 結果だけのメッセージの時刻
└── renderer/src/
    ├── features/chat/
    │   ├── message-time.ts         # 新設 readMessageTime・withMessageTime・書式
    │   ├── turns.ts                # 新設 deriveTurns
    │   ├── activity-bins.ts        # 新設 activityBins
    │   ├── center-conversation.ts  # 新設 中央の会話の公開口
    │   ├── ConversationTimeProvider.tsx  # 新設
    │   ├── MessageTimeLabel.tsx    # 新設
    │   ├── ConversationSearchProvider.tsx  # navigateTo の切り出し
    │   ├── convert.ts
    │   └── labels.ts
    ├── features/session/
    │   ├── running-session-store.ts
    │   └── RunningSessionsProvider.tsx   # isRunBusy
    ├── features/shell/
    │   ├── ConversationMapTab.tsx  # 新設 地図と帯
    │   ├── panel-tabs.ts
    │   ├── CenterPane.tsx
    │   ├── AppShell.tsx
    │   └── labels.ts
    ├── stores/ui.ts
    └── components/assistant-ui/elements/thread.aui.tsx
```

**Structure Decision**: 既存の desktop-app の構成のまま。新しい UI は `features/chat` (中央の本体の部品と純関数) と `features/shell` (右のペインのタブ) に置き、`elements/` には registry の element を取り込むときだけ置く。

## 設計後の見直し (Phase 1 の後)

- Constitution Check を data-model と research の後に見直した。変わった項目は XIII (registry に増えた Conversation map を F 節に足してから照合する手順を足した。research R-10) だけで、違反は無い
- spec の FR-014 の書き換えの対象に Conversation map の 1 行が増えた。Principle XIII の Exceptions が求める手順で、範囲の判断ではないので spec は変えず、data-model §7 に書いた
- `[NEEDS CLARIFICATION]` は無い

## Complexity Tracking

違反は無い。新しい経路 (中央の会話の公開口) は、右のペインのタブが中央の provider の外にあるために要る最小のもので、移動の仕組みは O-3 のものを使う (research R-07)。
