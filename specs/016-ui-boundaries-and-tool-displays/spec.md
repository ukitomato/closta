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

transcript の中で、会話がどこで区切られたか (圧縮・会話の作り直し・モデルの拒否)、なぜ止まったか (Hook やコマンドからの知らせ)、ファイル・検索・Web・計画の tool が何をしたかを、専用の表示で読めるようにする。

- **会話の境界**: 圧縮の境界 (実行中と過去ログ)、`conversation_reset`、モデルの拒否、`informational` (止まった理由など) を transcript の行で出す。モデルの拒否で置き換えられた応答は実行中の transcript から外す
- **tool の専用表示**: `Read` / `Glob` / `Grep` (ファイルと検索)、`WebFetch` / `WebSearch` (Web)、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (計画と進捗) を専用に描く (今は ToolFallback)。Agent plan の本文を markdown で描く
- **tool の結果の状態**: 結果がまだ来ていない tool に「結果待ち」、来ないまま終わった tool に「結果不明」の印を出し、tool のエラーと区切りを支援技術に読み上げる。ToolFallback の見出しを日本語にする

完了の PR で `docs/ui-coverage.md` の `後続: O-6` の行を、本 feature の表示 (`実装済み`)・`表示不要`・新しい後続 **O-11** のどれかに書き換える。**本 feature で M3 の完了の条件から O-6 の Tier A 14 行が消え、代わりに O-11 の Tier A 3 行 (一般の Hook・後から背景に移った task・実行中の subagent の入れ子) が D 節に立つ (U-1)。**

## 本 feature の位置づけ

- **範囲を分ける (未承認 U-1)。** O-6 の行は 30 行 (Tier A 14) と、O-2 の pr-gate と V-4 から回した宿題を持つ。1 つの spec では FR が 20 を超える。本 feature は **Tier A の 14 行と、表示の状態 (結果待ち・結果不明・読み上げ・見出し)** に絞り、残りを新しい feature **O-11「Hook・背景の task・実行中の subagent と知らせの類の表示」(M3・`ui`・依存 O-6)** に送る:
  - 一般の Hook の表示と `includeHookEvents` の ADR (AD-041 (g) の読み替え)、`get_hooks_listing` (AD-036 §4 P3 の読み替えが要る)、`hook_name` にコマンドの文字列が入るかの確認 (V-4 の未記録の項目)
  - 実行中の Background task の一覧の要否 (`background_tasks_changed`。要るなら持ち主の domain を人間に諮る)、後から背景に移った task の行、シェルの Background task を秘密を出さずに見分ける手がかり
  - 実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`。AD-035 D3 の読み替えと Agent SDK の呼び出しの許可リストの追加に ADR が要る) と Agent handoff
  - Tier B の知らせの類 (`notification`・`local_command_output`・`memory_recall`・`prompt_suggestion`・`mirror_error`・`tool_use_summary`・`active_goal`)、Checkpoints の表示 (`files_persisted`。巻き戻しはしない)、`user/document` の File element、`server_tool_use` / `web_search_tool_result`
  - 対応表の B 節 (中身のブロック) の機械照合
  - 過去ログに Hook / task / 本 feature の行 (`informational`・拒否・会話の作り直し) が残るかの確認と、残るなら過去ログの変換 (V-4 と本 feature の V-3 の記録による)
- **task・チェックポイントを操作しない。** E 節の `rewind_files` / `stop_task` / `background_tasks` は、O-5 の MCP と同じく `表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048)` にする (O-11 に送らない)。`Query` の `readFile` / `backgroundTasks` / `reloadOutputStyles` を項目 16 の禁止に足す (FR-018)
- **O-7 の上に置き場所を書き (AD-046)、O-4 の行の作り方に従う。** 実行中の行は agents (O-4 の `live-system-rows.ts`) で組み、過去ログの変換と分ける (O-4 data-model §3)
- **tool の入力と結果のパスは会話由来の本文である。** アプリのパスの値 (R-2 FR-042・AD-029・AD-032 の対象) ではないので、UNC の判定も接頭辞の除去もしない。見出しにはパスの末尾だけを出し、全体は今の ToolFallback / Code diff と同じく本文として出す (AD-049 Decision 5)
- **V-4 の未記録の項目は未確認として扱う** (quickstart-results の V-4 は「いい感じ」の判定と、追従の不具合の修正だけを記録している)。本 feature に関わる 2 つは、確かめずに両方の形に耐える規則にする: 並列の tool の結果の届き方 (送り直しの回数) → 結果の状態は tool の part ごとに決める / subagent の tool 名 (`Agent` / `Task`) → 既に両方に当たっている

## 未承認の判断 (夜間の自走で仮採用。2026-10-04)

**本 spec は design-gate で止め、利用者の承認まで /cl-implement に入らない。**

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | O-6 の範囲を分けるか (roadmap の範囲の変更・新しい feature の登録)。分けるなら O-11 の domain と M3 の扱い | 分ける。Tier A 14 行と表示の状態を O-6 に、上の箇条書きを O-11 (M3・依存 O-6) に。**O-11 の domain は `ui`** (表示が主。ADR の義務は session の境界なので、O-11 の ADR は session charter にも記録する)。**O-11 の Tier A 3 行を D 節に `後続: O-11` で立て、M3 の完了は O-11 を待つ** (O-2 pr-gate M-201 の答え) | 全部を O-6 に入れる (FR が 20 を超え、ADR の判断が混ざる) / O-11 を `session` にする (O-5 の O-10 と同じ。ADR の義務は session の境界にある) / O-11 を M3 の完了の条件に入れない (Tier A の 3 つが出ないまま M3 を閉じる) |
| U-2 | モデルの拒否で置き換えられた応答を実行中の transcript から外すか | 外す (SDK の指示どおり)。代わりの応答の `supersedes` が届いた時点で外し、ターンの終わりの `retracted_message_uuids` でも外す (冪等)。過去ログは記録のまま [ASSUMED: 記録に取り消しの印は無い。V-3 で確かめる] | 外さずに「取り消された」の印を付ける (SDK は transcript の状態から外すよう求めている) / ターンの終わりだけで外す (fallback のターンの間、拒否された部分と代わりが並ぶ) |
| U-3 | `informational` の `content` (Hook が prompt を止めた理由・slash command の出力の文言) を出すか。**O-2 の「Hook の出力本文を出さない」の例外になる** | 出す。秘密の形 (URL の資格情報・`Bearer`・既知のトークンの接頭辞など) を伏せ字にし、無害化・1 行・O-2 の切り詰めを通す。見出しは「Hook・コマンドからの知らせ」(Claude Code 自身の文言と見分ける)。規則の正本は data-model §1 | 出さない (止まった理由が分からず判断を誤る。Tier A の理由) / 既定で畳み、操作で開く (肩越しの漏れは減るが、止まった理由が一目で分からない) |
| U-4 | Agent plan の本文を markdown で描くか (**AD-035 Decision 6 の読み替え**) | 描く。plan の文字列を `TextMessagePartProvider` で text part の context に包み、既存の `MarkdownText` をそのまま通す (新しい markdown の描画口を作らない)。markdown で見えなくなる本文 (生 HTML・コメント) のために「原文」の切り替えを付ける。AD-049 (proposed) に記録 | plain text のまま (AD-035 D6) |
| U-5 | WebSearch の結果から Sources / Inline citation を組むか | 組まない。結果は text として描き、見出しに検索語とドメインの制限を出す (文章からリンクを推測しない) | 結果の text からリンクを取り出して Sources に |
| U-6 | ui の feature が session の契約と操作 UI を広げてよいか (domain をまたぐ): agents のセッションスレッドに system の 4 つの subtype と最上位の `conversation_reset` の分岐、`meter` の種類 `retraction` (message の id の列)、稼働中のストアからのメッセージの削除、項目 16 の禁止の追加 | 広げる。O-4 U-1 と同じく O-6 (ui) が持ち、session charter に記録する。承認の要求 (`PermissionRequest`) と承認の応答の形は変えない (data-model §3 は承認待ちを tool ごとに見分けない) | session の feature に切り出し、O-6 はその後に表示だけを作る |

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

- Q: `Read` / `Glob` / `Grep` のパスをどう出すか → A: 会話由来の本文として出す (解決しない・UNC を判定しない)。見出しはパスの末尾と範囲、全体は畳んだ中身に [ASSUMED]
- Q: `WebFetch` の URL をどう出すか → A: 見出しは http(s) のときだけ host と最後のパスの要素 (O-5 の URI の要約と同じ関数)。全体は畳んだ中身に伏せ字を通して出す [ASSUMED]
- Q: `TaskCreate` などをまとめた計画の一覧 (右のペインのタブ) を作るか → A: 作らない。呼び出しごとに描く。一覧の要否は O-11 の Background task の一覧と合わせて判断する [ASSUMED]
- Q: 読み上げの量と中身 → A: 見ているセッションで新しく届いた出来事だけ。固定の文言と既知の列挙と件数だけを読み、会話由来の文字列を読まない。1 秒に 1 回までにまとめる [ASSUMED]
- Q: `conversation_reset` の `new_conversation_id` をどうするか → A: 読まない。アプリは今 SDK の会話の id を追っていない (`src` で 0 件)。境界の表示だけにし、/clear の後の id の扱いは V-3 で記録して X-6 (再開・分岐) に申し送る [ASSUMED]
- Q: 圧縮の行 (O-4。進み具合) と圧縮の境界 (本 feature。区切り) を並べるか → A: 並べる。行 (圧縮中 → 完了) が先、境界が後。行は失敗も出すので境界に置き換えない (research R-07) [ASSUMED]

## User Scenarios & Testing

### User Story 1 - 会話の区切りと止まった理由が分かる (Priority: P1)

利用者は transcript で、コンテキストが圧縮された所・会話が新しくなった所・モデルが応答を拒否した所と、Hook などで止まった理由を見る。

**Why this priority**: Tier A 5 行。区切りが見えないと、古い transcript がまだコンテキストに残っていると誤解して判断を誤る。止まった理由が出ないと、利用者は再送や中断を繰り返す。

**Independent Test**: 変換の単体と行の component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中に `compact_boundary` が届く、**When** transcript を見る、**Then** 圧縮の境界 (手動 / 自動と、前後のトークン数) が出る。過去ログでは同じ element で、手動 / 自動と数を省いた文言で出る (過去ログの DTO は数を運ばない)
2. **Given** `conversation_reset`、**When** 届く、**Then** 「ここから新しい会話です。これより上の内容は Claude のコンテキストにありません」の境界が出る
3. **Given** fallback のモデルでの再試行、**When** 代わりの応答 (`supersedes` 付き) が届く、**Then** 置き換えられた応答がその時点で実行中の transcript から外れ、ターンの終わりの `model_refusal_fallback` で「モデルが応答を拒否したため {fallback のモデル} に切り替えました」の行が出る (scope が local なら「この応答だけ」)。後から同じ id のメッセージや結果が届いても戻らない
4. **Given** `model_refusal_no_fallback`、**When** 届く、**Then** 「モデルが応答を拒否しました」の行と、言い直して送り直せる旨と、`content` (U-3 の規則) が出る
5. **Given** `informational`、**When** 届く、**Then** 「Hook・コマンドからの知らせ」の行に `content` (U-3 の規則) が出る。`prevent_continuation` なら「ここで止まりました」を添えて注意の見た目、`level` が `warning` / `suggestion` は注意の見た目、`info` / `notice` は控えめの見た目
6. **Given** 拒否のカテゴリ (`api_refusal_category`)、**When** 表示する、**Then** 形の検査を通ったときだけ分類として出し、説明 (`api_refusal_explanation`。API の文章) は出さない [ASSUMED]

---

### User Story 2 - ファイル・検索・Web・計画の tool が何をしたかが分かる (Priority: P1)

利用者は transcript で、`Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の呼び出しを、tool ごとの専用の表示で読む。

**Why this priority**: Tier A 9 行。今は ToolFallback で入力の JSON がそのまま出る。コードを読む作業ではこれらが呼び出しの大半を占める。

**Independent Test**: 表示ごとの component テスト (過去ログと実行中の fixture)。

**Acceptance Scenarios**:

1. **Given** `Read`、**When** 見る、**Then** 見出しにファイル名 (パスの末尾) と範囲 (行・ページ) が出て、畳んだ中身に全体のパスと結果が出る
2. **Given** `Glob` / `Grep` (`files_with_matches`)、**When** 見る、**Then** 見出しに検索の形 (パターン・対象のパスの末尾・`glob`) が出て、畳んだ中身に結果のファイルの一覧が File tree で出る。一覧でない行 (件数・打ち切りの注記など) は text で添える。`Grep` のほかの `output_mode` は text
3. **Given** `WebFetch`、**When** 見る、**Then** 見出しに host と最後のパスの要素が出て (クエリ・資格情報・フラグメントを出さない)、畳んだ中身に `prompt` と結果が出る
4. **Given** `WebSearch`、**When** 見る、**Then** 見出しに検索語とドメインの制限が出て、畳んだ中身に結果の text が出る
5. **Given** `TaskCreate` / `TaskUpdate`、**When** 見る、**Then** TodoList の 1 項目で出る (`TaskCreate` は題と「追加した時点: 未着手」、`TaskUpdate` は題か「タスク #{id}」と状態)。`TaskGet` / `TaskList` は見出しと結果の text
6. **Given** `ExitPlanMode` の plan、**When** 見る、**Then** markdown として描かれ、生の HTML は描かれず、安全でない URL は無効になる (R-3 の境界)。「原文」に切り替えると全文が plain text で見える
7. **Given** 9 つの tool の結果がエラー (`is_error`)・一致が 0 件・結果が text でない、**When** 見る、**Then** エラーは既存のエラーの印と本文、0 件は結果の文 (File tree を出さない)、text でない結果は「text でない結果か、空の結果です」が出る

---

### User Story 3 - tool の結果を待っているか、来なかったかが分かり、支援技術でも追える (Priority: P2)

利用者は、結果がまだ来ていない tool と、来ないまま終わった tool を見分け、待つか動くかを決める。スクリーンリーダーの利用者は、画面を巡回しなくても tool のエラーや会話の区切りを知る (WCAG 4.1.3)。

**Why this priority**: US-1 / US-2 が無くても価値はあるが、表示の量が増えるほど要る。

**Independent Test**: tool の表示と読み上げの component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中のセッションで応答中 (`running`) に結果がまだ来ていない最新のターンの tool、**When** 見る、**Then** 「結果待ち」の動く印が出る。承認待ち (`awaiting_permission`) の間は動かない「結果待ち」。結果が届けば消える (並列の tool でも tool ごとに外れる)
2. **Given** 応答が終わった・中断した・セッションが終了・失敗した・過去ログ・前のターン、のどれかで結果の無い tool、**When** 見る、**Then** 「結果不明」の印が出る
3. **Given** 見ているセッションで新しく tool がエラーになった・圧縮 / 拒否 / 会話の作り直し / 止まった知らせが届いた、**When** 起きる、**Then** 支援技術に丁寧に (`aria-live="polite"`) 読み上げられる。最初の描画・セッションの切り替え・過去ログ・「さらに表示」では読まない。セッションの終わりで一斉に結果不明になった tool は読まない。1 秒に 1 回にまとめる
4. **Given** ToolFallback で描く tool、**When** 見る、**Then** 見出しが日本語 (「{tool 名} を実行」) で出る

---

### Edge Cases

- 拒否の `fallback_model` → O-4 data-model §2 の `modelId` の形の検査に通らなければ「別のモデル」
- scope が `session` の fallback の後、O-7 の「概要」のモデルは起動時の設定のまま。実際のモデルは O-5 の構成のタブ (次の `init`) で分かる
- 取り消しの id に知らない id・閉じたセッション → 無視する (冪等)。取り消した行が画面より上にあっても表示位置を保ち、隠れた古いメッセージの件数を直す
- `informational` の `content` が空 → 見出しだけの行
- `Read` / `Glob` / `Grep` のパスが WSL のパス・Windows 形式・UNC → どれも本文として出す (判定も除去もしない)。見出しの末尾は `/` と `\` の両方で切る
- `Glob` / `Grep` の結果の行が多い / ディレクトリ名が `__proto__` など → File tree は data-model §2 の上限と作り方に従う
- `WebFetch` の URL が読めない・http(s) でない → 見出しに「URL」とだけ出す
- `TaskUpdate` の `status` が知らない値 → 「不明」
- O-2 の結果待ちの上限 (256) で結果が別のメッセージに入った tool → 元の tool はターンの終わりに「結果不明」、結果は結果だけの表示
- 読み上げが重なる (並列の tool のエラー) → まとめて「{n} 件の tool がエラーになりました」

## Requirements

### Functional Requirements

#### 会話の境界と知らせ (US-1)

- **FR-001**: 圧縮の境界は、実行中と過去ログで同じ専用の表示 (Compaction boundary) で描かなければならない。実行中は agents が `compact_boundary` から行を作り (O-4 の `live-system-rows.ts`)、過去ログは今の `divider` の part を同じ表示に写す。行の中身と文言の正本は data-model §1 / §4
- **FR-002**: `conversation_reset` を会話の境界として描かなければならない (実行中)
- **FR-003**: `model_refusal_fallback` / `model_refusal_no_fallback` を拒否の行として描き、置き換えられた応答を実行中の transcript (稼働中のストア) から外さなければならない (U-2)。外す合図・送り方・戻らない仕組み・通すフィールドの正本は data-model §1
- **FR-004**: `informational` を知らせの行として描かなければならない (U-3)。本文の伏せ字・見た目の正本は data-model §1
- **FR-005**: FR-001〜FR-004 の行は O-2 のシステムイベントの行の経路 (`message`) で運び、part の形 (`TRANSCRIPT_PART_FIELDS`) は変えない。取り消しの id の列は O-4 の `meter` の種類 `retraction` で運び、O-4 の上限と間引きに掛けない (data-model §1)。`SessionEvent` の種類を増やさない

#### tool の専用表示 (US-2)

- **FR-006**: `Read` / `Glob` / `Grep` をファイルと検索の表示 (File tree・Tool call) で描かなければならない。パスは会話由来の本文で、解決も UNC の判定もしない。見出し・中身・File tree の作り方の正本は data-model §2
- **FR-007**: `WebFetch` / `WebSearch` を Web の表示で描かなければならない。URL の見せ方の正本は data-model §2。結果は text (U-5)
- **FR-008**: `TaskCreate` / `TaskUpdate` を TodoList の 1 項目で、`TaskGet` / `TaskList` を見出しと結果の text で描かなければならない (呼び出しごと。一覧の集約はしない)。状態の対応の正本は data-model §2
- **FR-009**: Agent plan の本文を R-3 の `MarkdownText` で描き、「原文」の切り替えを付けなければならない (U-4。AD-049)。方式の正本は data-model §2
- **FR-010**: tool の表示の振り分け (`tool-registry.aui.tsx`。O-5 の 2 段の登録) に FR-006〜FR-008 の tool を足さなければならない。過去ログと実行中の両方

#### tool の結果の状態と読み上げ (US-3)

- **FR-011**: data-model §3 に列挙した tool の表示は、結果待ち・結果不明の印を data-model §3 の規則で出さなければならない
- **FR-012**: 見ているセッションで新しく起きた tool のエラー・圧縮・拒否・会話の作り直し・止まった知らせを、支援技術に読み上げなければならない。読む中身・きっかけ・まとめ方・重ねない相手の正本は data-model §4
- **FR-013**: ToolFallback の見出しを日本語にしなければならない (data-model §4)

#### 境界の検査・対応表と記録

- **FR-014**: 完了の PR で `docs/ui-coverage.md` を data-model §5 のとおりに書き換えなければならない。項目 21 の出力で、割当先が O-6 の行が 0
- **FR-015**: roadmap に **O-11「Hook・背景の task・実行中の subagent と知らせの類の表示」**(M3・`ui`・依存 O-6) を登録し、範囲 (本 spec の「本 feature の位置づけ」の箇条書き) と ADR の義務を書かなければならない: `includeHookEvents` (AD-041 (g) の読み替え)、`getSubagentMessages` (AD-035 D3 の読み替えと許可リストの追加)、`get_hooks_listing` を呼ぶなら AD-036 §4 P3 の読み替え。roadmap の O-6 の行を本 feature の範囲に直す
- **FR-016**: 決定を ADR (AD-049、**proposed**) に記録しなければならない。読み替える先行の決定 (AD-035 D6、AD-044 D4 / D6 の持ち主、AD-047 D2、O-2 の「Hook の出力本文を出さない」) を名指す
- **FR-017**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。対象の正本は tasks.md の SH-001 / SH-010 (glossary・ui / session charter・`_overview.md`・`docs/prompts.md`・roadmap の O-3 (O-8) の義務 (c) の注記・O-4 data-model §2 / AD-047 の参照)
- **FR-018**: `scripts/constitution/allowlists.mjs` の `QUERY_MUTATION_METHODS` に `readFile` / `backgroundTasks` / `reloadOutputStyles` を足し、違反の fixture で項目 16 が発火することを固定しなければならない (task・パスの解決を機械で塞ぐ。O-5 の拡張と同じ形)

### Key Entities

- **会話の境界の行**: 圧縮・会話の作り直し・拒否・知らせ。O-2 のシステムイベントの行の category。正本は data-model §1
- **取り消し (retraction)**: 置き換えられた応答の id の列。`meter` で運び、稼働中のストアから外す。O-4 の「保留の取り消し」とは別物。正本は data-model §1
- **tool の結果の状態**: 結果あり / 結果待ち / 結果不明。正本は data-model §3

### Assumptions / Clarifications

- **[未承認 U-1〜U-6]** 上の「未承認の判断」の表
- **[ASSUMED]** パスと URL の見せ方、計画の一覧を作らないこと、読み上げの量と中身、拒否の説明を出さないこと、`new_conversation_id` を読まないこと、圧縮の行と境界を並べること、過去ログに取り消しの印が無いこと
- V-4 の未記録の項目は未確認として扱う (本 feature に関わる 2 つは両方の形に耐える規則にする)

## Success Criteria

- **SC-001**: **区切りと止まった理由が出る。** US-1 の AC1〜AC6 のとおりになり、data-model §1 の読まないフィールドの目印の値と伏せ字の対象の目印が `SessionEvent` と DOM に 0 件。取り消しの id のメッセージが稼働中のストアから消え、O-4 の上限が埋まっていても・後から同じ id が届いても戻らない。計測経路: agents の変換の単体 + 稼働中のストアの単体 + 行の component テスト
- **SC-002**: **9 つの tool が専用に描かれる。** US-2 の AC1〜AC7 のとおりになり、入力が正しいとき 9 つの tool が ToolFallback で描かれない (過去ログ・実行中)。data-model §2 の出さない値 (URL のクエリ・資格情報・フラグメント) が見出しに 0 件。Agent plan で R-3 の XSS の fixture 一式が描かれない。計測経路: 表示ごとの component テスト
- **SC-003**: **結果の状態が分かり、読み上げられる。** US-3 の AC1〜AC4 のとおりになり、data-model §3 に列挙したすべての表示で印が出て、vitest-axe (O-7 で導入) の違反 0。読み上げは 1 秒に 1 回以下で、会話由来の文字列の目印が 0 件。計測経路: tool の表示と読み上げの component テスト (偽の時計)
- **SC-004**: **対応表の O-6 の行が無くなる。** 項目 21 が通り、出力で割当先が O-6 の行が 0、M3 の完了の条件の残りが data-model §5 のとおり (O-6 の 14 行が消え、D 節の O-11 の 3 行が立つ)。計測経路: `node scripts/constitution/check.mjs`
- **SC-005**: **境界を広げない。** `SessionEvent` の種類・`TRANSCRIPT_PART_FIELDS`・Agent SDK の呼び出しの許可リスト・query の options のキー・`PermissionRequest` のフィールド・`toPermissionResult` の出力・IPC・preload・main の差分が 0。`MeterUpdate` の種類は O-5 の後の値から `retraction` の 1 つだけ増える。`sdk-agent-session.ts` の `Query` のメソッドの呼び出しは `interrupt` だけで、FR-018 の fixture で項目 16 が発火する。計測経路: 固定テスト + 項目 16 + `git diff` (quickstart V-1)

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表、システムイベントの行の経路と合成と「結果不明」の規則、tool の結果の経路、ファイル名の規則 (`pathTail`)
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)): 実行中の行を agents で組む形 (`live-system-rows.ts`)、`meter` と上限、`modelId` の形の検査、`compaction` の行 (AD-047。proposed)。**O-4 が先にマージされてから実装する**
- **O-5** ([015](../015-ui-mcp-elicitation-commands/spec.md)): tool の表示の振り分けの表 (`tool-registry.aui.tsx` の `Object.hasOwn` の照合と 2 段の登録。O-5 data-model §1)、URI の要約の関数、`QUERY_MUTATION_METHODS` の拡張 (AD-048。proposed)。**O-5 が先にマージされてから実装する**
- **O-7** ([013](../013-ui-app-shell/spec.md)): 置き場所の語彙と「見ているセッション」(`watchedId`)、vitest-axe の導入 (AD-046。proposed)
- **O-3** ([012](../012-ui-thread-search/spec.md)。別のブランチ): AD-045 (i18n。proposed)。本 feature は AD-045 に依らない (記録先を AD-045 の採否で分ける。tasks SH-010)
- **R-3 / R-4** (003 / 004): `MarkdownText` の XSS の境界、tool の専用表示の登録、Agent plan (AD-035)

## Out of Scope

- 上の「本 feature の位置づけ」で O-11 に送ったもの (一般の Hook・Background task の一覧・後から背景に移った task・シェルの Background task の見分け・実行中の subagent の入れ子 (入れ子の中の divider を含む)・Agent handoff・Tier B の知らせの類・Checkpoints の表示・File element・`server_tool_use` / `web_search_tool_result`・B 節の機械照合・過去ログへの本 feature の行の変換・V-4 の未記録の項目の確認)
- task・チェックポイントの操作 (`rewind_files` / `stop_task` / `background_tasks`。`表示不要`)
- 拒否の後の「編集して再試行」(`refused_user_message_uuid`。composer の操作の拡張。O-10 の composer の設計と合わせる)
- `TaskCreate` などをまとめた計画の一覧 → O-11 の Background task の一覧の判断と合わせる
- WebSearch の結果からの Sources / Inline citation (U-5)
