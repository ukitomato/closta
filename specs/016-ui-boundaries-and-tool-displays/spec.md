---
spec_id: 016-ui-boundaries-and-tool-displays
feature_id: O-6
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: tasking
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Feature Branch**: `016-ui-boundaries-and-tool-displays` (`015-ui-mcp-elicitation-commands` → `014-ui-metering-and-limits` → `013-ui-app-shell` の上に積んである)

**Created**: 2026-10-04 (夜間の自走で起案。**人間の承認が要る判断を仮採用している — 下の「未承認の判断」を参照**)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 15 の O-6 の行の「対応表の割当 (O-2 から)」— コンパクション境界の専用 element (実行中を含む)、`file` part の File element、Checkpoints、モデルの拒否、`notification` / `informational` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `conversation_reset` / `mirror_error` / `tool_use_summary` / `active_goal`、`background_tasks_changed` と制御要求、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の TodoList 表示、`Read` / `Glob` / `Grep` の File tree、Web search / fetch、Agent plan の markdown、実行中の subagent の入れ子、一般の Hook の表示と `includeHookEvents` を足す ADR、実行中の Background task の一覧の要否、後から背景に移った task の行、B 節の機械照合。O-2 の pr-gate から: tool の表示の「結果待ち」と「結果不明」の印 / 支援技術への読み上げ (WCAG 4.1.3) / シェルの Background task を見分ける手がかり / ToolFallback の見出しの日本語化。O-2 の実機の目視 (V-4) の結果の反映。

## Summary

transcript の中で、会話がどこで区切られたか (圧縮・会話の作り直し・モデルの拒否)、なぜ止まったか (Hook などの知らせ)、ファイル・検索・Web・計画の tool が何をしたかを、専用の表示で読めるようにする。

- **会話の境界**: 圧縮の境界 (実行中と過去ログ)、`conversation_reset`、モデルの拒否 (切り替えた / 切り替えられなかった)、`informational` (止まった理由など) を transcript の行で出す。モデルの拒否で取り消されたメッセージは transcript から外す
- **tool の専用表示**: `Read` / `Glob` / `Grep` (ファイルと検索)、`WebFetch` / `WebSearch` (Web)、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (計画と進捗) を専用に描く (今は ToolFallback)。Agent plan の本文を markdown で描く
- **tool の結果の状態**: 結果がまだ来ていない tool に「結果待ち」、来ないまま終わった tool に「結果不明」の印を出し、tool のエラーと Hook / task の状態の変化を支援技術に読み上げる。ToolFallback の見出しを日本語にする

完了の PR で `docs/ui-coverage.md` の `後続: O-6` の行を、本 feature の表示 (`実装済み`)・`表示不要`・新しい後続 **O-11** のどれかに書き換える。**本 feature で M3 の完了の条件 (Tier A の後続のうち割当先が M3 の feature の行) から O-6 の 14 行が消える。**

## 本 feature の位置づけ

- **範囲を分ける (未承認 U-1)。** O-6 の行は 30 行 (Tier A 14) と、O-2 の pr-gate と V-4 から回した宿題を持つ。1 つの spec では FR が 20 を超える。本 feature は **Tier A の 14 行と、表示の状態 (結果待ち・結果不明・読み上げ・見出し)** に絞り、残りを新しい feature **O-11「Hook・背景の task・実行中の subagent と知らせの類の表示」(M3・`ui`・依存 O-6)** に送る:
  - 一般の Hook の表示と `includeHookEvents` の ADR (AD-041 (g) の読み替え)、`get_hooks_listing`、`hook_name` にコマンドの文字列が入るかの確認 (V-4 の未記録の項目)
  - 実行中の Background task の一覧の要否 (`background_tasks_changed`・`background_tasks`・`stop_task`。要るなら持ち主の domain を人間に諮る)、後から背景に移った task の行、シェルの Background task を秘密を出さずに見分ける手がかり
  - 実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`。Agent SDK の呼び出しの許可リストの追加に ADR が要る) と Agent handoff
  - Tier B の知らせの類 (`notification`・`local_command_output`・`memory_recall`・`prompt_suggestion`・`mirror_error`・`tool_use_summary`・`active_goal`)、Checkpoints (`files_persisted`・`rewind_files`)、`user/document` の File element、`server_tool_use` / `web_search_tool_result`
  - 対応表の B 節 (中身のブロック) の機械照合
  - 過去ログに Hook / task の行が残るかの確認 (V-4 の未記録の項目)
- **O-7 の上に置き場所を書き (AD-046)、O-4 の行の作り方に従う。** 実行中の行は agents (O-4 の `live-system-rows.ts`) で組み、過去ログの変換と分ける (O-4 data-model §3)
- **V-4 の未記録の項目は未確認として扱う** (quickstart-results の V-4 は「いい感じ」の判定と、追従の不具合の修正だけを記録している)。本 feature に関わる 2 つは、確かめずに両方の形に耐える規則にする: 並列の tool の結果の届き方 (送り直しの回数) → 結果待ちの印は tool ごとに外れる / subagent の tool 名 (`Agent` / `Task`) → 既に両方に当たっている

## 未承認の判断 (夜間の自走で仮採用。2026-10-04)

**本 spec は design-gate で止め、利用者の承認まで /cl-implement に入らない。**

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | O-6 の範囲を分けるか (roadmap の範囲の変更・新しい feature の登録) | 分ける。Tier A 14 行と表示の状態を O-6 に、Hook・背景の task・実行中の subagent・Tier B の知らせの類・Checkpoints・B 節の照合を O-11 (M3・`ui`・依存 O-6) に | 全部を O-6 に入れる (FR が 20 を超え、3 つの ADR の判断が混ざる) |
| U-2 | モデルの拒否の取り消し (`retracted_message_uuids`) を実行中の transcript から外すか | 外す (SDK の指示どおり)。外した数を拒否の行に出す。過去ログは記録のまま (取り消しの印は記録に無い) | 外さずに「取り消された」の印を付ける (SDK は transcript の状態から外すよう求めている) |
| U-3 | `informational` の `content` (Hook が prompt を止めた理由・slash command の出力の文言) を出すか | 出す。ただし本文と同じ無害化 (`sanitizeBody`)・1 行に正規化・300 コードポイントで切り詰め、`mayCarrySecret` が true なら出さず「理由は Claude Code のログを見てください」 | 出さない (止まった理由が分からず判断を誤る。Tier A の理由) |
| U-4 | Agent plan の本文を markdown で描くか (AD-035 D6 の Trade-off の「将来課題」) | 描く。R-3 の `MarkdownText` (生 HTML を描かない・URL の allowlist) を通す。AD-049 (proposed) に記録 | plain text のまま |
| U-5 | WebSearch の結果から Sources / Inline citation を組むか | 組まない。結果は text として描き、見出しに検索語とドメインの制限を出す (結果の形を推測しない) | 結果の text からリンクを取り出して Sources に |

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

- Q: `Read` / `Glob` / `Grep` のパスをどう出すか → A: 表示用の文字列として出す (解決しない。Principle I)。見出しはファイル名 (パスの末尾) と範囲、全体のパスは中身に [ASSUMED]
- Q: `WebFetch` の URL をどう出すか → A: ドメインとパスだけ。クエリ・フラグメント・資格情報 (`user:pass@`) は出さない。`prompt` は中身に [ASSUMED]
- Q: `TaskCreate` などをまとめた計画の一覧 (右のペインのタブ) を作るか → A: 作らない。呼び出しごとに TodoList の形で描く。一覧は transcript から導けるが、要否は O-11 の Background task の一覧と合わせて判断する [ASSUMED]
- Q: 読み上げの量 → A: tool のエラー・Hook / task の終わり (失敗・結果不明を含む)・圧縮と拒否と会話の作り直しだけを、1 秒に 1 回までにまとめて読み上げる。表示中のセッションだけ [ASSUMED]

## User Scenarios & Testing

### User Story 1 - 会話の区切りと止まった理由が分かる (Priority: P1)

利用者は transcript で、コンテキストが圧縮された所・会話が新しくなった所・モデルが応答を拒否した所と、Hook などで止まった理由を見る。

**Why this priority**: Tier A 5 行。区切りが見えないと、古い transcript がまだコンテキストに残っていると誤解して判断を誤る。止まった理由が出ないと、利用者は再送や中断を繰り返す。

**Independent Test**: 変換の単体と行の component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中に `compact_boundary` が届く、**When** transcript を見る、**Then** 「ここでコンテキストを圧縮しました (手動 / 自動、前 N トークン → 後 M トークン)」の境界が出る。過去ログでも同じ形で出る (今の divider を置き換える)
2. **Given** `conversation_reset`、**When** 届く、**Then** 「ここから新しい会話です。これより上の内容は Claude のコンテキストにありません」の境界が出る
3. **Given** `model_refusal_fallback`、**When** 届く、**Then** 「モデルが応答を拒否したため {fallback_model} に切り替えました」(scope が local なら「この応答だけ」) の行が出て、`retracted_message_uuids` のメッセージが実行中の transcript から外れ、外した数が行に出る
4. **Given** `model_refusal_no_fallback`、**When** 届く、**Then** 「モデルが応答を拒否しました」の行と、`content` (無害化・切り詰め) が出る
5. **Given** `informational` (`level` が `warning` / `suggestion`、または `prevent_continuation: true`)、**When** 届く、**Then** 「Claude Code からの知らせ」の行に `content` (U-3 の規則) が出る。`prevent_continuation` なら「ここで止まりました」を添え、注意の見た目にする。`level` が `info` / `notice` は控えめの見た目
6. **Given** 拒否のカテゴリ・説明 (`api_refusal_category` / `api_refusal_explanation`)、**When** 表示する、**Then** カテゴリは出すが、説明 (API の文章) は出さない [ASSUMED]

---

### User Story 2 - ファイル・検索・Web・計画の tool が何をしたかが分かる (Priority: P1)

利用者は transcript で、`Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の呼び出しを、tool ごとの専用の表示で読む。

**Why this priority**: Tier A 9 行。今は ToolFallback で入力の JSON がそのまま出る。コードを読む作業ではこれらが呼び出しの大半を占める。

**Independent Test**: 表示ごとの component テスト (過去ログと実行中の fixture)。

**Acceptance Scenarios**:

1. **Given** `Read`、**When** 見る、**Then** 見出しにファイル名と範囲 (行・ページ) が出て、中身に全体のパスと結果 (行番号つきのコード) が出る
2. **Given** `Glob` / `Grep`、**When** 見る、**Then** 見出しに検索の形 (パターン・対象のパス・`glob`) が出て、結果のファイルの一覧を File tree で出す。`Grep` の内容の一致は text で出す
3. **Given** `WebFetch`、**When** 見る、**Then** 見出しにドメインとパスが出て (クエリ・資格情報を出さない)、中身に `prompt` と結果が出る
4. **Given** `WebSearch`、**When** 見る、**Then** 見出しに検索語とドメインの制限が出て、中身に結果の text が出る
5. **Given** `TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList`、**When** 見る、**Then** TodoList の形 (題・状態 (未着手 / 進行中 / 完了 / 削除)・進行中の文言) で出る。`TaskList` / `TaskGet` は結果の text
6. **Given** `ExitPlanMode` の plan、**When** 見る、**Then** markdown として描かれ、生の HTML は描かれず、安全でない URL は無効になる (R-3 の境界)

---

### User Story 3 - tool の結果を待っているか、来なかったかが分かり、支援技術でも追える (Priority: P2)

利用者は、結果がまだ来ていない tool と、来ないまま終わった tool を見分ける。スクリーンリーダーの利用者は、tool のエラーや Hook / task の終わりを読み上げで知る。

**Why this priority**: O-2 の pr-gate から回した宿題。US-1 / US-2 が無くても価値はあるが、表示の量が増えるほど要る。

**Independent Test**: tool の表示と読み上げの component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中のセッションで結果がまだ来ていない tool、**When** 見る、**Then** 「結果待ち」の印が出る。結果が届けば消える (並列の tool でも tool ごとに外れる)
2. **Given** セッションが終了・失敗した、または過去ログで結果の無い tool、**When** 見る、**Then** 「結果不明」の印が出る (O-2 のシステムイベントの行の「結果不明」と同じ考え方)
3. **Given** 表示中のセッションで tool がエラーになった・Hook / task が終わった (失敗・結果不明を含む)・圧縮 / 拒否 / 会話の作り直しが起きた、**When** 起きる、**Then** 支援技術に丁寧に (`aria-live="polite"`) 読み上げられる。短い間に重なったら 1 秒に 1 回にまとめる
4. **Given** ToolFallback で描く tool、**When** 見る、**Then** 見出しが日本語 (「{tool 名} を実行」など) で出る

---

### Edge Cases

- 過去ログの圧縮の境界に `pre_tokens` などが無い → 数を出さず「ここでコンテキストを圧縮しました」
- `retracted_message_uuids` に知らない id → 無視する (取り消しは冪等)。表示中でないセッションでも、そのセッションのメッセージから外す
- 拒否の `fallback_model` / `original_model` の文字列 → O-4 data-model §2 の `modelId` の形の検査に通らなければ「別のモデル」
- `informational` の `tool_use_id` (同じ tool の進み具合の重複を消す) → 同じ `tool_use_id` の行は 1 つにまとめる
- `Read` の `file_path` が WSL のパス・UNC → 表示用の文字列として出し、UNC の接頭辞は出さない (R-2 FR-042 の規則を使う)
- `Glob` / `Grep` の結果のファイルが非常に多い → File tree は 200 件まで、超えた数を「ほか N 件」
- `WebFetch` の URL が URL として読めない → 見出しに「URL」とだけ出し、中身に無害化した文字列
- `TaskUpdate` の `status` が知らない値 → 「不明」
- 結果待ちの tool が承認待ちのとき → 承認カードがあるので「承認待ち」を優先
- 読み上げが大量に重なる (並列の tool のエラー) → まとめて「N 件の tool がエラー」

## Requirements

### Functional Requirements

#### 会話の境界と知らせ (US-1)

- **FR-001**: 圧縮の境界は、実行中と過去ログで同じ専用の表示 (Compaction boundary) で描かなければならない。実行中は agents が `compact_boundary` から行を作り (O-4 の `live-system-rows.ts`)、過去ログは今の `divider` の part を同じ表示に写す。出す数と文言の正本は data-model §1
- **FR-002**: `conversation_reset` を会話の境界として描かなければならない (実行中)
- **FR-003**: `model_refusal_fallback` / `model_refusal_no_fallback` を拒否の行として描き、`model_refusal_fallback` の `retracted_message_uuids` のメッセージを実行中の transcript (稼働中のストア) から外さなければならない (U-2)。通すフィールドの正本は data-model §1 (`api_refusal_explanation` は通さない)
- **FR-004**: `informational` を知らせの行として描かなければならない。`content` の扱いは U-3、`level` と `prevent_continuation` の見た目と、`tool_use_id` での重複の除き方の正本は data-model §1
- **FR-005**: FR-001〜FR-004 の行は O-2 のシステムイベントの行の経路 (`message`) で運び、part の形 (`TRANSCRIPT_PART_FIELDS`) は変えない。行の組み立ては agents に置く (過去ログの変換は圧縮の divider の写しだけ)。取り消しの id の列は O-4 の `meter` の種類 `retraction` で運ぶ (data-model §1)。`SessionEvent` の種類を増やさない

#### tool の専用表示 (US-2)

- **FR-006**: `Read` / `Glob` / `Grep` をファイルと検索の表示 (File tree・Tool call) で描かなければならない。見出しと中身の項目の正本は data-model §2。パスは表示用の文字列で、解決しない (Principle I)
- **FR-007**: `WebFetch` / `WebSearch` を Web の表示で描かなければならない。URL はドメインとパスだけ (data-model §2)。結果は text (U-5)
- **FR-008**: `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` を TodoList の形で描かなければならない (呼び出しごと。一覧の集約はしない)。状態の対応の正本は data-model §2
- **FR-009**: Agent plan の本文を R-3 の `MarkdownText` で描かなければならない (U-4。AD-049)。生 HTML を描かず URL の allowlist を通す (R-3 FR-020 の境界)
- **FR-010**: tool の表示の振り分け (`tool-registry.aui.tsx`) に FR-006〜FR-008 の tool を足さなければならない。過去ログと実行中の両方

#### tool の結果の状態と読み上げ (US-3)

- **FR-011**: tool の表示は、結果待ち・結果不明・承認待ちの印を、data-model §3 の規則で出さなければならない (セッションの状態は O-2 の thread の context から受ける)
- **FR-012**: 表示中のセッションで、tool のエラー・Hook / task の終わり・圧縮・拒否・会話の作り直しを、支援技術に読み上げなければならない (`aria-live="polite"`、1 秒に 1 回までにまとめる)。文言の正本は data-model §4。既存の `SessionAttentionAnnouncer` (承認待ち・失敗) と別の口にし、重ねて読まない
- **FR-013**: ToolFallback の見出しを日本語にしなければならない (data-model §4)

#### 対応表と記録

- **FR-014**: 完了の PR で `docs/ui-coverage.md` の `後続: O-6` の行をすべて書き換えなければならない。書き換え先の正本は data-model §5。項目 21 の出力で、割当先が O-6 の行が 0、M3 の完了の条件から O-6 の Tier A 14 行が消える
- **FR-015**: roadmap に **O-11「Hook・背景の task・実行中の subagent と知らせの類の表示」**(M3・`ui`・依存 O-6) を登録し、範囲 (本 spec の「本 feature の位置づけ」の箇条書き) と ADR の義務 (`includeHookEvents` の AD-041 (g) の読み替え、`getSubagentMessages` の許可リストの追加) を書かなければならない。roadmap の O-6 の行を本 feature の範囲に直す
- **FR-016**: 決定を ADR (AD-049、**proposed**) に記録しなければならない: O-11 への分割、拒否の取り消しを実行中の transcript から外すこと、`informational` の本文の扱い、Agent plan の markdown (AD-035 D6 の Trade-off の読み替え)
- **FR-017**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。glossary (会話の境界・結果待ち / 結果不明・O-11 の範囲)、ui charter (Related Specs)、`_overview.md` (Feature 帰属の表に O-11)、`docs/prompts.md` (O-11)、O-4 の圧縮の行との関係 (O-4 data-model §3 の注記: O-4 の `compaction` の行は進み具合、本 feature の境界は区切り。両方を並べて描く)

### Key Entities

- **会話の境界の行**: 圧縮・会話の作り直し・拒否。O-2 のシステムイベントの行の category。正本は data-model §1
- **tool の結果の状態**: 結果あり / 結果待ち / 承認待ち / 結果不明。正本は data-model §3

### Assumptions / Clarifications

- **[未承認 U-1〜U-5]** 上の「未承認の判断」の表
- **[ASSUMED]** パスと URL の見せ方、計画の一覧を作らないこと、読み上げの量、拒否の説明を出さないこと
- V-4 の未記録の項目は未確認として扱う (本 feature に関わる 2 つは両方の形に耐える規則にする)

## Success Criteria

- **SC-001**: **区切りと止まった理由が出る。** US-1 の AC1〜AC6 のとおりになり、通さないフィールド (`api_refusal_explanation`・`compact_metadata` の `preserved_*`) の目印の値が `SessionEvent` と DOM に 0 件。取り消しで指定された id のメッセージが稼働中のストアから消える。計測経路: agents の変換の単体 + 稼働中のストアの単体 + 行の component テスト
- **SC-002**: **9 つの tool が専用に描かれる。** US-2 の AC1〜AC6 のとおりになり、9 つの tool が ToolFallback で描かれない (過去ログ・実行中)。`WebFetch` の見出しにクエリ・資格情報が 0 件。Agent plan の markdown で `<script>` / `javascript:` が描かれない。計測経路: 表示ごとの component テスト
- **SC-003**: **結果の状態が分かり、読み上げられる。** US-3 の AC1〜AC4 のとおりになり、vitest-axe の違反 0。読み上げは 1 秒に 1 回以下。計測経路: tool の表示と読み上げの component テスト (偽の時計)
- **SC-004**: **対応表の O-6 の行が無くなる。** 項目 21 が通り、出力で割当先が O-6 の行が 0、M3 の完了の条件の残りから O-6 の 14 行が消え、O-11 の行が data-model §5 のとおり。計測経路: `node scripts/constitution/check.mjs`
- **SC-005**: **境界を広げない。** `SessionEvent` の種類・`TRANSCRIPT_PART_FIELDS`・Agent SDK の呼び出しの許可リスト・query の options のキー・IPC・preload・main の差分が 0。計測経路: 固定テスト + `git diff` (quickstart)

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表、システムイベントの行の経路と合成と「結果不明」の規則、tool の結果の経路
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)): 実行中の行を agents で組む形 (`live-system-rows.ts`)、`modelId` の形の検査、`compaction` の行 (AD-047。proposed)。**O-4 が先にマージされてから実装する**
- **O-5** ([015](../015-ui-mcp-elicitation-commands/spec.md)): tool の表示の振り分けの表 (`tool-registry.aui.tsx` の `Object.hasOwn` の照合と 2 段の登録。O-5 data-model §1)、`meter` の種類の足し方 (AD-048。proposed)。**O-5 が先にマージされてから実装する**
- **O-7** ([013](../013-ui-app-shell/spec.md)): 置き場所の語彙 (AD-046。proposed)
- **R-3 / R-4** (003 / 004): `MarkdownText` の XSS の境界、tool の専用表示の登録、Agent plan (AD-035)
- **R-2** (002): パスの表示の規則 (UNC の接頭辞を出さない。FR-042)

## Out of Scope

- 一般の Hook・`includeHookEvents`・`get_hooks_listing`、Background task の一覧と `background_tasks_changed` / `background_tasks` / `stop_task`、後から背景に移った task、シェルの Background task の見分け、実行中の subagent の入れ子と Agent handoff、Tier B の知らせの類、Checkpoints、File element (`user/document`)、`server_tool_use` / `web_search_tool_result`、B 節の機械照合、V-4 の未記録の項目の確認 → **O-11** (新規登録)
- `TaskCreate` などをまとめた計画の一覧 → O-11 の Background task の一覧の判断と合わせる
- WebSearch の結果からの Sources / Inline citation (U-5)
