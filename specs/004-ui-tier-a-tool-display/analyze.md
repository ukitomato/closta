# Design-gate Track A: analyze (R-4)

**Run**: 2026-09-25 · **Verdict**: Critical 0 / High 1 / Medium 3 / Low 3 · Read-only, no files changed.

機械的 cross-artifact consistency。Constitution Principle I–XV は全て実在し plan の引用は正確
(Principle XIII Example 逐語・VIII 延期・IX/XII/XIV/XV を検証)。AD-019/023/033/034 の引用も正確。
FR-001..018 は全て ≥1 task がカバー、AC 13 件 (US-1×6 / US-2×3 / US-3×4) は tasks + quickstart V-1..V-10 に対応。
Dependencies が参照する task ID は全て実在。`targets: both` の根拠 (subagent nesting のみ BE) は一貫。

## Findings

### A-H-1 [High] subagent 親子リンク key が spec では確定扱い、他成果物では未確定 — glossary と内部矛盾
- **Where**: spec.md FR-005 / US-2 AC-1 / Key Entities; data-model §3 (L51) vs §4 (L76-78) vs §5 glossary (L104);
  research R-02; contracts/transcript-subagent.md C-1
- **Issue**: FR-005 / US-2 AC-1 / Key Entities は linkage を確定として書く (「`parent_agent_id` が当該 Task に対応」)。
  しかし research R-02 / data-model §4 / contract C-1 は key 未確定 (「`parent_tool_use_id` または `parent_agent_id`。R-02 で確定」)、
  R-02 は `parent_agent_id` が agent/session 粒度で Task→agent 橋渡し表が要る可能性を警告。glossary (§5) は
  `parent_agent_id` → 親セッション と書き、FR-005 の Task tool_use 対応と矛盾。現コードは両フィールド宣言のみで未使用。
- **Why**: US-2 機構と `targets: both` 根拠がこの key に依存。SC-004/009 は id ベース対応づけを計測するため、
  真の key が `parent_tool_use_id` なら AC が誤前提。glossary/FR-005 の粒度矛盾は live inconsistency。
- **Action**: FR-005 / US-2 AC-1 / Key Entities / data-model §3 を key-neutral (「親参照 id、R-02 で確定」) に統一、
  glossary の粒度 (親セッション vs Task tool_use) を §4/C-1/R-02 と一致させる。field 名は R-02 確定まで spec に書かない。

### A-M-1 [Medium] SC-003 / SC-007 に計測タスクが明示割り当てされていない
- **Where**: spec SC-003 / SC-007; tasks Tests header; FE-026 / FE-029 / FE-041/042
- **Issue**: header は「SC-002/003/005/008/009 は Vitest」「SC-001/007 は Vitest+実機」とするが、SC-003
  (Todo status 区別 + 未知 status 欠落なし) / SC-007 (サニタイザ改行/タブ保持) を計測と明示する task が無い。
  SC-003 は FE-026 実装 + FE-029 で描画テストされるが SC-001/002/005 に帰属。「未知 status」edge case のテスト task が無い。
  SC-007 の Vitest は実は R-3 の `sanitize-body` テスト継承で R-4 task に再掲されていない。
- **Action**: SC-003 (未知 status 含む) を Todo テスト task に足し (FE-026/FE-029 の引用拡張)、
  SC-007 の Vitest は R-3 既存 sanitizer テストで満たすことを header に注記 (R-4 は quickstart V-9/rubric-d のみ追加)。

### A-M-2 [Medium] 「tool-registry の 7 種と 1:1」が toolName 5 種の登録実態と食い違う
- **Where**: data-model §3 実装時の義務 (L68); contracts/tool-display-mapping.md C-1 (L8, 5 件列挙); tasks FE-022
- **Issue**: 「toolName→表示 登録を §3 の 7 種と 1:1 で照合」とあるが、§3 の 7 種は thinking→Reasoning と
  連続tool→Tool group を含み、これらは toolName ではない (thinking は content-block 種、Tool group は隣接 tool-call の
  grouping)。toolName registry は 5 tool のみ持てる (C-1 が実際に列挙するのも 5)。C-1 は自己矛盾 (7 と言い 5 を列挙)。
- **Action**: 「toolName registry は §3 の **5 tool 種**と 1:1; thinking(Reasoning)/連続tool(Tool group) は R-3 の
  grouping が担い registry 対象外」に data-model §3 / C-1 / FE-022 を訂正。

### A-M-3 [Medium] AD-020 の引用が過大 — subagent/`parent_agent_id` を AD-020 の決定として帰属
- **Where**: spec Dependencies (L291); plan Related ADRs (L36)
- **Issue**: AD-020 が決めるのは SDKMessage=39型 / control・system subtype / PermissionMode=6値 / session API 実在。
  その "Task" は `SDKTaskNotification` 系 (= Background task) で Task-tool subagent ではない。AD-020 は
  `parent_agent_id` も subagent-Task nesting も述べない。`parent_agent_id` の出所は sdk.d.ts / R-3 data-model §1。
- **Action**: AD-020 は「SDK メッセージ型の分母」に限って引用し、`parent_agent_id`/subagent 識別の帰属を
  sdk.d.ts 0.3.270 / R-3 data-model §1 に移す (R-02 は既にそうしている)。

### A-L-1 [Low] tasks の「5 種の専用表示 (FE-024〜028)」ラベルが実体とずれる
- **Where**: tasks section header L80, Dependencies L169, 並列化 L179
- **Issue**: FE-024–028 = Terminal(024)/Code diff(025)/Todo(026)/Agent plan(027)/**convert.ts(028)** = 4 表示 + 1 変換。
  Subagent 表示は FE-030 (US-2)。「5 種の専用表示」は誤ラベル (実表示を除外し非表示 task を含む)。
- **Action**: 「4 専用表示 + convert (FE-024〜028); Subagent 表示は FE-030」に改題。

### A-L-2 [Low] 多段 subagent 深さ打ち切りルールが多数の成果物に重複、単一 SSoT 未宣言・値未定
- **Where**: spec US-2 AC-3 / FR-005 / Edge Cases / Assumptions; data-model §4; contract C-1/C-2; tasks BE-011/FE-030
- **Action**: data-model §4 を深さルール/値の SSoT と宣言し他は参照形にする。

### A-L-3 [Low] Principle XII "vacuous" scope ルールが逐語で複数箇所に重複
- **Where**: spec FR-016; plan Principle XII; data-model §3 (自らを「正本」と宣言済み)
- **Action**: 全文を data-model §3 に置き、spec FR-016 / plan Principle XII は参照形にする。

## Notes
- Principle XII の「data-model §3 = O-2 前の暫定台帳、ui-coverage.md を O-2 に委譲」scope 解釈は
  design-gate 人間承認項目として plan Post-design / FR-016 に既記載 — drift ではなく既知の gate item。
- コード相互確認は全て pass (`thread.aui.tsx:679`, `convert.ts:16/32-41`, `transcript.ts:16-22`,
  `transcript-dto.ts:68/80`)。FR-011 の schema-anchoring は記述どおり実装可能。
