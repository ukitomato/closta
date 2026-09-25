---
description: 'Task list for R-4 Tier A tool 表示'
---

# Tasks: Tier A tool 表示 (R-4)

**Input**: [spec.md](spec.md) / [plan.md](plan.md) / [research.md](research.md) /
[data-model.md](data-model.md) / [contracts/](contracts/) / [quickstart.md](quickstart.md)

**Tests**: SC-002/005/008/009 は Vitest、**SC-003 は Vitest (status 別 DOM マーカー・未知 status 保持) + 視覚差は quickstart**、
**SC-001 は Vitest + 実機**、**SC-007 は R-3 既存 `sanitize-body` テスト (改行/タブ保持) + argsText サニタイズの新規 Vitest + 視覚は quickstart**、
**SC-004 は `domain` 変換 Vitest + quickstart (実機で入れ子を確認)**、SC-006 は port 構造検査 (入れ子 frame が port2 のみ) + 手動レビュー + Vitest、
SC-010 は quickstart 実機 + rubric 判定表の記録。

## Format

`[ID] [P?] Description` — `BE` = `domain` / `agents` 側、`FE` = renderer、
`SH` = element 導入 / ドキュメント / 検証 / ADR。`[P]` は同 phase 内で並列実行可能 (別ファイル・依存なし)。

`## US-1` 〜 `## US-3` が spec の User Story に対応する。target 別の索引は末尾。

---

## Phase 1: Setup

- [x] SH-001 **research を確定する (前倒し)** — [research.md](research.md) の R-01 (tool-UI 登録方式) /
      R-02 (subagent 親子リンクの実 key) / R-03 (各 tool の args/result 形) / R-04 (element 採用/自作) を
      公式ドキュメント + sdk.d.ts + 実データで裏取りし、結論を data-model §2/§4/§5 と contracts に確定する。
      **BE-010 / FE-030 は R-02 (リンク key) / R-01 (登録方式) の確定を前提**とする
- [x] SH-002 **ADR を起票する** — Tier A tool 表示の element 選定 (Principle XIII 実名照合) + subagent 入れ子の
      DTO 表現 (AD-034 の shape を継ぐ) + tool-UI 登録方式 (R-01) + 多段 subagent の深さ打ち切り。
      **Principle 変更・許可リスト変更を伴わない**ため「設計判断の記録」。採否は design-gate 人間承認 (plan「起票する ADR」)
- [x] SH-003 [P] registry element を導入する — `elements-terminal-block` / `-code-diff` / `-todo-list` /
      `-subagent-list` / `-agent-plan` を `.aui.tsx` として追加 (research R-04 の採否に従う)。
      **dependency を増やさない** (ソース同梱) ことを確認し `docs/discovery.md` を汚さない
- [x] SH-004 [P] fixture を用意する — 各 tool 種別 (Bash/Edit/Write/MultiEdit/TodoWrite/Task/ExitPlanMode) と
      subagent 入れ子 / 孤児 / 多段 / 壊れた args / 未応答 / 巨大 result / 敵対的内容を含む `SessionMessageLike[]`。
      各テストにインライン or `src/domain/session/__fixtures__/` に配置 (SC-001〜009 の各テストが所有)

**Checkpoint**: research が確定、ADR が accepted、registry element が入りビルドが通る

---

## Phase 2: Foundational — `domain` の subagent グルーピング + DTO 拡張 (BLOCKING)

**I/O を一切持たない。** モックゼロでテストできることを確認する (AD-023 Consequences)。取得プロセス側で走る。

- [x] BE-010 `src/domain/session/transcript-dto.ts` (改修) — subagent 入れ子を表現するフィールドを追加
      (data-model §5 の (a) `children` か (b) `depth`/`parentId` を ADR/実装で確定)。
      `TRANSCRIPT_PART_FIELDS` / `TRANSCRIPT_MESSAGE_FIELDS` に載せる ([contracts/transcript-subagent.md](contracts/transcript-subagent.md) C-3 / FR-011)
- [x] BE-011 `src/domain/session/transcript.ts` (改修) — (1) **`argsText` に `sanitizeBody` (bidi/C1 除去) + バイト上限を適用**
      (R-3 は未適用。`safeStringify` の後に通す。design-gate H-1/H-2)、(2) **subagent 親子グルーピング** — Task の `tool_use.id` と
      配下メッセージの親参照 (R-02 で確定した key) を鍵に **id で対応づけ** (位置非依存)。孤児はフラット、多段は深さ打ち切り
      「以降は省略」明示、**循環/自己参照は visited-set で枝打ち切り + 孤児 fallback、一意でない id は最初の一致か孤児** (M-1/L-4)。
      **既存の tool_use↔tool_result / text / thinking / image / divider 処理を壊さない** (追加であり置換でない。C-1/C-4 / FR-010)
- [x] BE-012 `transcript.test.ts` (追記) — [contracts/transcript-subagent.md](contracts/transcript-subagent.md) C-2 の
      検証表 (1〜7) と 1:1 — 入れ子 (件数/順序/役割一致) / 孤児フラット / 多段打ち切り / **隣接非依存** /
      subagent 内の part 変換 + **argsText サニタイズ (bidi/C1 除去・byte 上限)** / **循環・自己参照 / 一意でない id** (SC-004/SC-009/SC-006/H-1)
- [x] BE-013 [P] `transcript-schema.test.ts` (追記) — 入れ子フィールドの schema を固定し、
      逐語を運ぶフィールドの集合が想定と一致することを検査 (SC-008)

**Checkpoint**: `domain` の subagent グルーピングが I/O なしで全通過し、既存 R-3 変換テストが回帰しない

---

## US-1: 過去ログの tool 実行を種別ごとの専用表示で読む (P1)

### tool-UI 登録と args narrowing (FE)

- [x] FE-020 `src/renderer/src/features/chat/tool-args.ts` (新設) — [contracts/tool-display-mapping.md](contracts/tool-display-mapping.md) C-2 の
      narrowing 関数群 (`parseBashArgs` / `parseEditArgs` / `parseWriteArgs` / `parseMultiEditArgs` /
      `parseTodoArgs` / `parseTaskArgs` / `parsePlanArgs`)。**untrusted narrowing。失敗は `null`** (throw しない。FR-009)
- [x] FE-021 `tool-args.test.ts` (新設) — 壊れた args JSON / 欠落フィールド / 型不一致 / 別名 tool で
      `null` を返し**生 argsText の fallback に退避**する (SC-005)。**サニタイズ済み入力で narrowing が値を保つ** +
      **巨大 args フィールド → byte 上限で切り詰め + 折りたたみフラグ** (design-gate H-2)。
      **bidi/C1 除去の正本テストは BE-012 (domain `transcript.test.ts`)**、DOM 端点は FE-042 (design-gate M-N01/H-3)
- [x] FE-022 `src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx` (新設) —
      `toolName` → 専用表示 の登録を **1 箇所に集める** (data-model §3 の **5 tool 種**と 1:1。
      thinking/連続 tool は R-3 grouping が担い対象外。design-gate M-2)。**未対応 toolName は必ず `ToolFallback` に落ちる** (C-1)。
      登録方式は research R-01 の結論 (`makeAssistantToolUI` or 描画点)
- [x] FE-023 `thread.aui.tsx` (改修) — tool-call 描画点に tool-registry を差し込む (R-01)。
      **`part.toolUI ?? ToolFallback` の fallback 分岐を維持**。Tool group / Reasoning グループの
      内側でも専用表示が成立することを保つ (FR-007 / US-1 AC-6)

### 4 専用表示 + convert (FE)  <!-- Subagent 表示は US-2 の FE-030。design-gate L-1 -->

<!-- FE-024 Terminal / FE-025 Code diff / FE-026 Todo / FE-027 Agent plan の 4 表示 + FE-028 convert -->


- [x] FE-024 `terminal-block.aui.tsx` (新設) — Bash の command + 捕捉済み output を**等幅・プレーンテキスト**で。
      exit code は result に有れば示し無ければ `isError` で成否 (捏造しない)。巨大 output は R-3 の切り詰め済み result を使う (FR-001/C-3)
- [x] FE-025 `code-diff.aui.tsx` (新設) — Edit/Write/MultiEdit の old/new から **hunk を組む純関数** + 行表示。
      **プレーンテキスト** (生 HTML/markdown/script 不可)。巨大 diff は折りたたみ (FR-002/017/C-3)
- [x] FE-026 [P] `todo-list.aui.tsx` (新設) — TodoWrite の各 Todo の status (pending/in_progress/completed) を
      視覚区別。未知 status は生値表示 (欠落禁止) (FR-003/C-3)
- [x] FE-027 [P] `agent-plan.aui.tsx` (新設) — ExitPlanMode の plan を **plain text (whitespace-pre-wrap) で描画**
      (React escape により生 HTML 非描画・`javascript:` inert)。`MarkdownText` は context 依存で任意文字列を安全に受けられないため
      独自 markdown 経路を作らない。markdown 整形は roadmap tracked debt (FR-006/C-3。AD-035 D6 / design-gate PR-H-3)
- [x] FE-028 [P] `convert.ts` (改修) — DTO の tool-call を各専用表示 part へ写す (既存の写しを回帰させない)。
      **File 表示 (`📎`) / divider は R-3 のまま** (O-2 送り。plan #2)
- [x] FE-029 `ChatScreen.test.tsx` (追記) — 各専用表示 (Terminal/Code diff/Todo/Agent plan) の描画 /
      **未対応 tool が fallback のまま** / **XSS payload で生 HTML 非描画・リンク無害化** (R-3 回帰維持) /
      **連続する専用表示が 1 つの Tool group に畳まれ内部で各専用表示が成立** (FR-007/US-1 AC-6。design-gate M-4) /
      **送信経路が閉じている** (Principle VIII 回帰維持) (SC-001/002/005)

**Checkpoint**: 実機で Bash/Edit/Write/TodoWrite/ExitPlanMode が専用表示、未対応 tool は fallback (SC-001 / quickstart V-1〜V-7)

---

## US-2: subagent (Task) の入れ子を親子関係で読む (P1)

- [x] FE-030 `subagent.aui.tsx` (新設) — Task の `subagent_type`/依頼/最終結果カード + **配下メッセージの
      入れ子描画** (BE-010/011 の DTO 入れ子を再帰描画)。多段は深さ打ち切り「以降は省略」明示。
      registry `subagent-list` を照合し、入れ子の再帰は不適合なら自作 (候補名/理由を ADR に記す。FR-004/005/C-5)
- [x] FE-031 `convert.ts` (改修) — DTO の subagent 入れ子を `ThreadMessageLike` の subagent 表示 part へ写す
      (C-4)。**仮想化 (R-3) と両立** — 入れ子の高さ計算・折りたたみが仮想行を壊さない
- [x] FE-032 `ChatScreen.test.tsx` / `subagent` テスト (追記) — 親 Task 下の入れ子・記録順・件数一致 /
      孤児フラット / 多段打ち切り (SC-004。`domain` 側は BE-012 が担保、ここは描画の欠落なしを見る)

**Checkpoint**: Task 配下の subagent 作業が親の下に入れ子で並び欠落・二重なし (SC-004 / quickstart V-4)

---

## US-3: 大きい・壊れた・未応答の tool でも表示が破綻しない (P2)

- [x] FE-040 **安全退避の徹底** — 各専用表示が narrowing 失敗 (FE-020 の `null`)・`result === null`
      (未応答)・孤児 tool_result・未対応 tool 名でクラッシュせず fallback / result 無し表示に退避する
      (FR-009/018 / C-1/C-2)
- [x] FE-041 **巨大入力の切り詰め** — 巨大 tool_result / 巨大 diff / 長大 plan を R-3 の上限で
      切り詰め + 折りたたみ。renderer で本文を再取得・`JSON.parse` しない。**main 経路を R-4 で変えない** (FR-017/SC-006/C-4)
- [x] FE-042 テスト — `ChatScreen.test.tsx` / 各 element テスト: 壊れた args / 未応答 / 孤児 / 未対応 tool /
      巨大 result・巨大 args / **敵対的内容 (生 HTML / `javascript:` / 双方向制御文字)** で描画がクラッシュせず、
      専用表示 or fallback で欠落なく、XSS が起きない。**Terminal command / diff old-new / plan の各表示で bidi/C1 が DOM に現れない**
      ことと **plan の `javascript:` リンク無害化・生 HTML 非描画**を assert (SC-005/006 / design-gate H-3/M-5 / R-3 境界回帰維持)

**Checkpoint**: 不完全・敵対的・巨大な入力で破綻しない (quickstart V-8/V-10)

---

## Phase 7: 検証と上流 SSoT の追随

- [x] SH-060 `lint`/`typecheck`/`depcruise`/`check:constitution`/`test`/`test:rules` を**全通過**させる。
      **新規 SDK 呼び出し・新規 spawn が無い**ため `allowlists.mjs` / rule-fixtures は変更しない
      (check:constitution の許可リスト項目は R-3 のまま)。`src/agents/` の electron/native 到達 0 を維持。
      **SC-006 の port 構造検査を、入れ子拡張後の `TranscriptFrameDTO` (children/depth) が port2 のみを流れ handshake に
      本文/children が載らないことまで拡張** (design-gate M-7)。**本文を渡す `console.*` は 0、fallback の reason に
      argsText/result 本文を含めない** (design-gate L-5。grep 確認)
- [x] SH-061 `docs/domains/ui/charter.md` の **`related_specs` と Related Specs に本 spec を追加**し、
      「(残り。R-4 / …)」を R-4 着手中に更新 (#5)。`docs/domains/_overview.md` の R-4 行に spec_id を紐づける (**人間承認**)
- [x] SH-062 [P] `docs/glossary.md` に **Subagent** を追加 (data-model §5)。TranscriptView の定義に
      「tool 種別ごとの専用表示 (R-4)」を 1 行足す (#5)
- [x] SH-063 [P] `docs/roadmap.md` の R-3 申し送り #1 (subagent ネスト) の消化を反映、M1 の R-4 行を着手中に更新 (#1/#7)。
      **R-3 実機一次判断 (rubric-a/b) の記入 + 軸 1 の正式確定を tracked debt として明記** (design-gate C-001 (a))、
      到達集合検査行に R-4 で変換が重くなった旨を 1 行 (design-gate M-7)
- [x] SH-064 **SC-010 rubric の機械確認** — `tests/spec-artifacts/r4-quickstart-rubric.test.ts` (新設) が
      `quickstart-results.md` の rubric-a〜rubric-d 行と判定 (OK/NG/未実施) の存在を検査。欠落で test 失敗 = done を fail
      (R-3 の SH-067b と同形式)
- [x] SH-065 `quickstart-results.md` を作成し **SC-010 rubric 判定表 (a〜d) を記録**、自動検証で満たした SC を併記。
      **実機操作の実施と OK/NG 判断は人間 deferred** (rubric は現状 `未実施`) だが**判定表が記録済み**なので done 必須 artifact は満たす
      (SH-064 が機械確認)。**「M1 完了 / 軸 1 確定」は R-4 done-gate の合否条件にしない** (design-gate C-001 (a) の positioning 緩和)。
      軸 1 の正式確定と R-3 一次判断の実機記入は roadmap の tracked debt (SH-063) が持ち主。方針変更が要れば charter/PLAN §4 見直しを別 task で起票 (#6/#7)

**Checkpoint**: 全 SC の計測経路が実行済みで、上流文書と spec の食い違いが 0

---

## Dependencies

```text
Phase 1 (SH-001 research / SH-002 ADR / SH-003 element / SH-004 fixture)
   ↓
Phase 2 (BE-010 → BE-011 → BE-012 / BE-013)   ← BLOCKING (subagent グルーピング + DTO)
   ↓
US-1 FE (FE-020 → FE-021 / FE-022 → FE-023 → FE-024/FE-025/FE-026/FE-027/FE-028 → FE-029)
   ↓
US-2 (FE-030 → FE-031 → FE-032)   ← 専用表示が出てから入れ子を重ねる。BE-010/011 に依存
   ↓
US-3 (FE-040 → FE-041 → FE-042)
   ↓
Phase 7 (SH-060 〜 SH-065)
```

- **BE-010/011 は SH-001 の R-02 (リンク key) 確定を前提** (親子の鍵を研究より先に決めない)
- **FE-022/023 は SH-001 の R-01 (登録方式) 確定を前提**
- **FE-024〜028 (4 表示 + convert) は BE 非依存** — 既存 DTO の toolName/argsText/result から描画 (renderer 単独)
- **FE-030/031 (subagent 入れ子) は BE-010/011 に依存** (DTO 入れ子を描画する)
- **SH-002 (ADR) は BE-010 の DTO 表現確定と整合** (入れ子表現を ADR に記す)
- **SH-061 は design-gate の人間承認を要する** (charter/overview の改定)

## 並列化の指針

- Phase 1 の SH-003/SH-004 は独立
- US-1 の FE-026 (Todo) / FE-027 (Agent plan) / FE-028 (convert) は別ファイルで独立
- Phase 7 のドキュメント系 (SH-062/SH-063) は相互に独立
- **4 専用表示 + convert (FE-024〜028) は subagent 入れ子 (US-2) と独立に進められる** (targets が both に上がる理由は US-2 のみ)

---

## Target 別索引

### Backend (`src/domain/session/`)

BE-010 〜 BE-013 (subagent グルーピング + DTO 入れ子拡張 + schema)。**新規 SDK 呼び出し・新規 IPC・新規プロセスなし**

### Frontend (`src/renderer/`)

FE-020/FE-021 (args narrowing) / FE-022/FE-023 (tool-UI 登録 + 描画点) /
FE-024〜029 (US-1。4 専用表示 + convert + test。Subagent 表示は FE-030) / FE-030〜032 (US-2。subagent 入れ子) /
FE-040〜042 (US-3。堅牢性)

### Shared (element 導入 / 検証 / ドキュメント / ADR)

SH-001 (research) / SH-002 (ADR) / SH-003 (element 導入) / SH-004 (fixture) /
SH-060 〜 SH-065 (検証・charter・glossary・roadmap・rubric 機械確認・quickstart)
