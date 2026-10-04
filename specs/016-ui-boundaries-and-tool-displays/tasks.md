# Tasks: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents、`[FE]` renderer、`[SH]` 横断。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いは spec の FR / SC、行・取り消し・tool の見出しと中身・結果の状態・読み上げ・文言・対応表の書き換え先は data-model、方式の理由は research。

**着手の条件**: **O-7 (013)・O-4 (014)・O-5 (015) がマージされ、AD-046 / AD-047 / AD-048 / AD-049 が accepted になり、spec の U-1〜U-5 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 → コード。BE-001 → BE / FE の他。SH-010 は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] glossary — 会話の境界、結果待ち / 結果不明、O-11
- [ ] **SH-002** [SH] [P] element の照合 — registry の File tree / Tool call / Web search / Compaction boundary を実名で照合 (本番の CSP の下で動くこと)。結果の正本は PR の説明
- [ ] **BE-001** [BE] `system-event.ts` (+ test) と O-4 の `meter.ts` — category 5 つと status (data-model §1)、`isTerminalSystemEventStatus`、`meter` の `retraction` と検証 (id の形・128 件)

## US-1 — 会話の区切りと止まった理由が分かる (P1)

- [ ] **BE-010** [BE] `sdk-agent-session.ts` / O-4 の `live-system-rows.ts` (+ test) — `compact_boundary` / `conversation_reset` / `model_refusal_*` / `informational` の行と `retraction`。テスト: 通さないフィールド (`api_refusal_explanation`・`preserved_*`・`request_id`・`new_conversation_id`) の目印が出力に 0 件、`content` の `mayCarrySecret`、`tool_use_id` の重複の除き方、過去ログの変換に足していない (回帰)
- [ ] **FE-010** [FE] `running-session-store.ts` (+ test) — `retraction` で同じセッションの `messages` から外す (冪等・知らない id・閉じたセッション・承認の要求と結果待ちを壊さない (RK-02))
- [ ] **FE-011** [FE] `compaction-boundary.tsx` と `SystemEventRow` (5 つの category) と `convert.ts` の divider の写し。テスト: US-1 の AC1〜AC6 (過去ログの divider も同じ表示)

## US-2 — ファイル・検索・Web・計画の tool が何をしたかが分かる (P1)

- [ ] **FE-020** [FE] [P] `file-tool.aui.tsx` — `Read` / `Glob` / `Grep` (data-model §2。UNC の接頭辞を出さない、200 件の上限、`output_mode`)
- [ ] **FE-021** [FE] [P] `web-tool.aui.tsx` — `WebFetch` / `WebSearch` (URL の資格情報・クエリ・フラグメントを出さない、読めない URL)
- [ ] **FE-022** [FE] [P] `task-tool.aui.tsx` — `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (状態の対応・知らない値)
- [ ] **FE-023** [FE] `tool-registry.aui.tsx` に 9 つ、`agent-plan.aui.tsx` の本文を `MarkdownText` に。テスト: US-2 の AC1〜AC6 (過去ログと実行中の fixture)、Agent plan の `<script>` / `javascript:` が描かれない

## US-3 — tool の結果を待っているか、来なかったかが分かる (P2)

- [ ] **FE-030** [FE] `tool-result-state.ts` (+ test。新設) — data-model §3 の表 (並列の tool の結果が 1 つずつ・まとめて届く両方の fixture)
- [ ] **FE-031** [FE] 各専用表示と ToolFallback の見出しに状態の印、ToolFallback の見出しの日本語化
- [ ] **FE-032** [FE] `TranscriptAnnouncer.tsx` (新設) — data-model §4。テスト: US-3 の AC1〜AC4、1 秒に 1 回以下 (偽の時計)、`SessionAttentionAnnouncer` と重ならない、vitest-axe の違反 0

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-014〜FR-017) — `docs/ui-coverage.md` を data-model §5 のとおりに。項目 21 で割当先が O-6 の行が 0。roadmap に O-11 の行 (範囲と ADR の義務)、O-6 の行、`_overview.md` (Feature 帰属の表)、ui charter (Related Specs・Open Questions の持ち主を O-11 に)、`docs/prompts.md` (O-11)、O-4 data-model §3 の圧縮の行との関係の注記、AD-045 の例外の一覧に `transcript.ts:207`
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。V-1 / V-2。V-3 (実機) は利用者に残す
