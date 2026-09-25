---
id: AD-035
title: Tier A tool 表示の element 選定と subagent 入れ子の DTO 表現
status: accepted
date: 2026-09-25
deciders: [ukitomato]
tags: [ui, tool-display, subagent, principle-xiii, principle-xii]
supersedes: []
superseded-by: []
related: [AD-019, AD-020, AD-023, AD-033, AD-034]
---

# AD-035: Tier A tool 表示の element 選定と subagent 入れ子の DTO 表現

> **status: accepted (2026-09-25、ukitomato 承認)。** 本 ADR は R-4 (spec `004-ui-tier-a-tool-display`) の
> SH-002 として起票した。design-gate Round 2 で全 5 トラック Critical 0 / High 0 を確認済み。
> Principle の変更・許可リストの拡張を伴わない (新規 SDK 呼び出し・新規 spawn なし) ため、本 ADR は
> **設計判断の記録**であり NON-NEGOTIABLE の改定ではない。

## Context

R-4 は R-3 (transcript の基本表示) が fallback で残した tool 実行を、Claude Code の一次概念に直結する
7 種の専用表示に置き換える (Bash→Terminal block、Edit/Write/MultiEdit→Code diff、TodoWrite→Todo list、
Task→Subagent、ExitPlanMode→Agent plan、thinking→Reasoning [R-3 済]、連続 tool→Tool group [R-3 済])。
subagent (Task) 配下メッセージの入れ子表示のため targets は user 承認で frontend→both に昇格した。

design-gate (Round 1 FIX_REQUIRED → Round 2 PASS) が固定した設計判断を本 ADR に記録する。

## Decision

### 1. tool-UI は `toolName` dispatcher で描画する (registry。`makeAssistantToolUI` に依存しない)

R-3 の `thread.aui.tsx` は `useExternalStoreRuntime` で `part.toolUI ?? <ToolFallback>` により tool を描画する。
`part.toolUI` は AI-SDK 系 toolkit の name 登録 slot であり **external-store では確実に埋まらない**
(research R-01)。したがって `tool-registry.aui.tsx` に `toolName → コンポーネント` の map を置き、
描画点 (thread.aui.tsx の tool-call 既定コンポーネント) から dispatch する。**未登録 toolName は必ず
`ToolFallback` (R-3) に落ちる** — この不変をテストで固定する。5 表示種 (Terminal / Code diff / Todo /
Subagent / Agent plan) を 7 toolName にマップする (Edit/Write/MultiEdit → Code diff)。

### 2. element は registry を実名照合したうえで `.aui.tsx` として自作する (Principle XIII)

assistant-ui registry の `elements-terminal-block` / `-code-diff` / `-todo-list` / `-subagent-list` /
`-agent-plan` を候補として照合した (AD-019。§4.2 の Tier A は実在)。いずれも Claude Code の args/result 形
(Bash の command+出力、Edit の old/new、TodoWrite の todos、Task の subagent_type+入れ子、ExitPlanMode の plan) と
props 形が合わず、または入れ子 transcript の再帰描画を持たないため、**R-3 の `.aui.tsx` 群と同じ house style で
自作**した。これは Principle XIII の Example (「Tool fallback AUI をカスタマイズして Bash 用の Terminal block に
寄せる」) そのものであり、`docs/discovery.md` を汚す新規依存は増やさない (registry element は元来ソース同梱)。

### 3. subagent 親子リンクは `parent_tool_use_id` を一次鍵にする (research R-02。新規 SDK 呼び出しなし)

`sdk.d.ts` 0.3.270 の `SessionMessage` は `parent_tool_use_id` (subagent 内で生成されたメッセージを起動した
Task の `tool_use.id`) と `parent_agent_id` (多段時の親 subagent の agentId) を持つ。**一次鍵は
`parent_tool_use_id`** で、getSessionMessages が返す inline の subagent メッセージを親 Task の tool-call に
入れ子化する。**`getSubagentMessages(sessionId, agentId)` は使わない** — 使うと新規 SDK 呼び出し =
許可リスト拡張 + agentId 列挙が要り scope を超える。過去ログに subagent 本文が inline に無いセッションでは
Task カード + inline 分までを示し、完全な subagent 会話の入れ子は将来 (getSubagentMessages 導入時) の課題とする
(欠落は起こさない)。

### 4. subagent 入れ子は DTO の tool-call.children で表現し、変換は取得プロセス側の純粋関数で行う

`TranscriptPartDTO` の tool-call 変種に `children: readonly TranscriptMessageDTO[]` を足し、subagent の
入れ子木を DTO に閉じる (data-model §5 の案 a)。対応づけ (`transcript.ts` の `toTranscriptMessages`) は
**AD-034 の取得プロセス側で走る純粋関数の内側**に足すため、main は本文経路に乗らない (Principle IX 維持)。
`convert.ts` は children を assistant-ui の tool-call part に載せられないため `args.__subagentChildren` として
Subagent 表示へ渡す (tool-call part に専用フィールドが無いための内部規約)。**`convert.ts` は untrusted argsText 由来の
`__` prefix キーを必ず strip し、信頼値 (`part.children` / `part.truncated`) を明示設定する** — argsText への marker 注入による
偽の入れ子・偽の切り詰めバッジを防ぐ (design-gate PR-H-1)。追加フィールドは
`TRANSCRIPT_PART_FIELDS` / schema 検査に載せる (逐語露出面の固定。SC-008)。

### 5. 対応づけの健全性: id ベース・循環/自己参照・一意でない id・深さ上限

- **id ベース** (**隣接非依存**)。親 Task は子より前に現れる SDK 記録順を前提とし、親子が隣接していなくても id で入れ子になる (SC-009)。
  **「任意の並べ替えで不変」ではない** — 子が親より前に来る full reorder では孤児化する (design-gate PR-H-2 で narrowing)。
- 親 tool_use は子より必ず前に現れるため forest となり**循環しない**。self-reference (parent が自分の tool_use) は
  個別に弾き top-level に置く。**一意でない id は最初の一致に attach** (二重 attach しない)。
- 親不明の subagent メッセージは孤児として top-level に平坦化 (欠落なし)。
- 深さ上限 `MAX_SUBAGENT_DEPTH` を超えるネストは top-level に平坦化して深さを有界化する (病的入力対策)。
  視覚的なインデント上限は renderer 側でさらに絞る (`VISUAL_MAX_DEPTH`)。

### 6. 会話由来文字列の安全性 (R-3 境界を argsText へ拡張)

R-3 の `sanitizeBody` (双方向制御文字/C1 除去 + byte 上限) は `text`/`thinking`/`result` にのみ適用されていた。
R-4 の 5 表示の主コンテンツは **`argsText` (tool_use.input)** 由来のため、**`transcript.ts` で argsText にも
`sanitizeBody` + byte 上限を適用**する (取得プロセス側・parse 前)。表示は Terminal/diff/todo/plan とも
**plain text** で描画し (React が escape する)、生 HTML/URL allowlist 逸脱を再導入しない。ExitPlanMode の plan は
`MarkdownText` が text-part context 依存で任意文字列を安全に受けられないため **plain text (whitespace-pre-wrap)**
で描画する (`javascript:` 等は inert text 化。rich markdown 化は plan を text part 化する将来課題)。

## Consequences

- **Good**: R-4 が新規 SDK 呼び出し・新規 IPC・新規プロセスを持たず (取得は R-3 の経路をそのまま使う)、
  許可リスト変更を伴わない。BE の変更は `domain` の 2 ファイル (transcript.ts / transcript-dto.ts) に閉じる。
- **Good**: 未登録 tool は fallback に落ちる不変で Principle XII の割り当て漏れを作らない (Tier A 完全化は O-2)。
- **Trade-off**: subagent 本文が inline に無い過去ログでは深い入れ子が出ない (getSubagentMessages 未使用)。
  実データでの確認は quickstart V-4 (人間 deferred) に送る。
- **Trade-off**: 専用表示は R-3 の Tool group (既定は閉) の内側に来るため、既定では畳まれている
  (展開で表示。FR-007 の共存)。既定 open 化の要否は SC-010 の実機二次判断のフィードバック次第 (O-1 候補)。
- **Trade-off**: Agent plan を plain text で描画するため plan の markdown 書式はレンダリングされない。

## Confirmation

- `transcript.test.ts` / `transcript-schema.test.ts` が入れ子・孤児・自己参照・一意でない id・隣接非依存・
  argsText サニタイズ・schema 固定を検証 (SC-004/008/009 / design-gate H-1)。
- `tool-args.test.ts` が narrowing と null 安全退避を検証 (SC-005)。
- `ChatScreen.test.tsx` が 5 専用表示の描画・未対応 tool の fallback・XSS/bidi 境界・Tool group 共存を検証
  (SC-001/002/005 / FR-007)。
- `check:constitution` 項目 14 が SDK 許可 = `listSessions, getSessionMessages` のまま (新規呼び出しなし) を確認。
- design-gate Round 2: 全 5 トラック Critical 0 / High 0 (`design-gate.md`)。
