---
spec_id: 016-ui-boundaries-and-tool-displays
feature_id: O-6
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: drafting
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Feature Branch**: `016-ui-boundaries-and-tool-displays` (2026-10-13 に main (791f72d。O-7・O-3・O-4・O-5 のマージの後) の上に載せ直した)

**Created**: 2026-10-04 (夜間の自走で起案。夜間に仮採用した判断は **2026-10-05 に利用者が推奨案どおり承認した** — 下の「判断」を参照)

**Reopened**: 2026-10-13。O-7 の設計段階の上で書いた design を main に載せ直し、O-7 の実装 (PR #13)・O-3 の実装 (PR #14)・O-4 の実装 (PR #15)・O-5 の実装 (PR #17)・roadmap の O-6 の行 (順 16) と system-scope の持ち主の記録・accepted の AD-049 に合わせて直した。承認済みの判断 (U-1〜U-7・AD-049) は選び直していない。承認の無い [ASSUMED] と、main の規則と食い違う点は `.needs-input.md` の Q1〜Q3 に置いた

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 16 の O-6 の行の「対応表の割当 (O-2 から)」— コンパクション境界の専用 element (実行中を含む)、`file` part の File element、Checkpoints、モデルの拒否、`notification` / `informational` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `conversation_reset` / `mirror_error` / `tool_use_summary` / `active_goal`、`background_tasks_changed` と制御要求、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の TodoList 表示、`Read` / `Glob` / `Grep` の File tree、Web search / fetch、Agent plan の markdown、実行中の subagent の入れ子、一般の Hook の表示と `includeHookEvents` を足す ADR、実行中の Background task の一覧の要否、後から背景に移った task の行、B 節の機械照合。O-2 の pr-gate から: tool の表示の「結果待ち」と「結果不明」の印 / 支援技術への読み上げ (WCAG 4.1.3) / シェルの Background task を見分ける手がかり / ToolFallback の見出しの日本語化。O-2 の実機の目視 (V-4) の結果の反映。

## Summary

transcript の中で、会話がどこで区切られたか (圧縮・会話の作り直し・モデルの拒否)、なぜ止まったか (Hook やコマンドからの知らせ)、ファイル・検索・Web・計画の tool が何をしたかを、専用の表示で読めるようにする。

- **会話の境界**: 圧縮の境界 (実行中と過去ログ)、`conversation_reset`、モデルの拒否、`informational` (止まった理由など) を transcript の行で出す。モデルの拒否で置き換えられた応答は実行中の transcript から外す
- **tool の専用表示**: `Read` / `Glob` / `Grep` (ファイルと検索)、`WebFetch` / `WebSearch` (Web)、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` (計画と進捗) を専用に描く (今は ToolFallback)。Agent plan の本文を markdown で描く
- **tool の結果の状態**: 結果がまだ来ていない tool に「結果待ち」、来ないまま終わった tool に「結果不明」の印を出し、tool のエラーと区切りを支援技術に読み上げる。ToolFallback の見出しを日本語にする

完了の PR で `docs/ui-coverage.md` の `後続: O-6` の行を、本 feature の表示 (`実装済み`)・`表示不要`・新しい後続 **O-11** のどれかに書き換える。**本 feature で M3 の完了の条件から O-6 の Tier A 14 行が消え、代わりに O-11 の Tier A 3 行 (一般の Hook・後から背景に移った task・実行中の subagent の入れ子) が D 節に立つ (U-1)。**

## 本 feature の位置づけ

- **範囲を分ける (U-1)。** O-6 の行は 30 行 (Tier A 14) と、O-2 の pr-gate と V-4 から回した宿題を持つ。1 つの spec では FR が 20 を超える。本 feature は **Tier A の 14 行と、表示の状態 (結果待ち・結果不明・読み上げ・見出し)** に絞り、残りを新しい feature **O-11「Hook・背景の task・実行中の subagent と知らせの類の表示」(M3・`ui`・依存 O-6)** に送る:
  - 一般の Hook の表示と `includeHookEvents` の ADR (AD-041 (g) の読み替え)、`get_hooks_listing` (AD-036 §4 P3 の読み替えが要る)、`hook_name` にコマンドの文字列が入るかの確認 (V-4 の未記録の項目)
  - 実行中の Background task の一覧の要否 (`background_tasks_changed`。要るなら持ち主の domain を人間に諮る)、後から背景に移った task の行、シェルの Background task を秘密を出さずに見分ける手がかり
  - 実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`。AD-035 D3 の読み替えと Agent SDK の呼び出しの許可リストの追加に ADR が要る) と Agent handoff
  - Tier B の知らせの類 (`notification`・`local_command_output`・`memory_recall`・`prompt_suggestion`・`mirror_error`・`tool_use_summary`・`active_goal`)、Checkpoints の表示 (`files_persisted`。巻き戻しはしない)、`user/document` の File element、`server_tool_use` / `web_search_tool_result`
  - 対応表の B 節 (中身のブロック) の機械照合
  - 過去ログに Hook / task / 本 feature の行 (`informational`・拒否・会話の作り直し) が残るかの確認と、残るなら過去ログの行への変換 (V-4 と本 feature の V-3 の記録による。それまでの過去ログの `system` の本文には本 feature が伏せ字を当てる)
  - `TaskCreate` などをまとめた計画の一覧の要否 (Background task の一覧と合わせる)、伏せた Hook 名の見分け (O-2 pr-gate ux L-102)、O-11 の domain 間の依存 (session の無害化・query の options に触れる。O-2 pr-gate arch L-201)
- **拒否の後の「編集して再試行」は O-10 に送る** (`refused_user_message_uuid`。composer の操作の拡張で、O-10 の composer の設計と合わせる。roadmap の O-10 の行に書く)
- **task・チェックポイントを操作しない。** E 節の `rewind_files` / `stop_task` / `background_tasks` は、O-5 の MCP と同じく `表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048)` にする (O-11 に送らない)。`Query` の `readFile` を項目 16 の禁止に足す (`backgroundTasks` / `reloadOutputStyles` は O-5 が足した。FR-018)
- **O-7 の上に置き場所を書き (AD-046)、O-4 の行の作り方に従う。** O-7 (PR #13)・O-4 (PR #15)・O-5 (PR #17) は完了している。実行中の行は agents (O-4 の `src/agents/live-signals.ts` の `onSystem` の分岐。O-5 の `auth` / `plugin` の行と同じ場所) で組み、過去ログの変換と分ける (O-4 data-model §3)。右のペインのタブは足さない (タブの候補の TodoList・Background task は O-11。下の「義務の扱い」)
- **tool の入力と結果のパスは会話由来の本文である。** アプリのパスの値 (R-2 FR-042・AD-029・AD-032 の対象) ではないので、UNC の判定も接頭辞の除去もしない。見出しにはパスの末尾だけを出し、全体は今の ToolFallback / Code diff と同じく本文として出す (AD-049 Decision 5)
- **V-4 の未記録の項目は未確認として扱う** (quickstart-results の V-4 は「いい感じ」の判定と、追従の不具合の修正だけを記録している)。本 feature に関わる 2 つは、確かめずに両方の形に耐える規則にする: 並列の tool の結果の届き方 (送り直しの回数) → 結果の状態は tool の part ごとに決める / subagent の tool 名 (`Agent` / `Task`) → 既に両方に当たっている (`tool-registry.aui.tsx` の表)。2026-10-13 の時点でも 011 quickstart-results の V-4 は未記録のまま

### 義務の扱い

roadmap が O-6 に預けた義務 (O-6 の行と、system-scope の持ち主の記録で O-6 に当たりうるもの) の扱いの正本はこの表である。

| 義務 (roadmap の記録) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| O-2 から: 対応表の `後続: O-6` の 30 行 (Tier A 14) | Tier A 14 行を入れ、残りは O-11 に送る (U-1) | US-1 / US-2 / FR-001〜FR-010、data-model §5 |
| O-2 の pr-gate R2 から: 結果待ち・結果不明の印 / 読み上げ (WCAG 4.1.3) / ToolFallback の見出しの日本語化 | 入れる | US-3 / FR-011〜FR-013 |
| O-2 の pr-gate R2 から: シェルの Background task を秘密を出さずに見分ける手がかり | 送る (O-11。U-1) | 「本 feature の位置づけ」の O-11 の箇条書き |
| O-2 の V-4 の反映 (`hook_name`・過去ログの Hook / task・`Agent` / `Task`・並列の結果) | 2 つは両方の形に耐える規則、2 つは O-11 (U-1) | 上の V-4 の箇条書き、data-model §3 |
| O-7 から: 右のペインのタブの候補「TodoList」「Background task」 | 送る (O-11。U-1 の「計画の一覧の要否 (Background task の一覧と合わせる)」) | 本 feature は右のペインのタブを足さない。`TaskCreate` などは呼び出しごとに transcript で描く (FR-008) |
| O-4 から: 圧縮の行 (`compaction`) と `compact_boundary` の境界の element を統合するか並べるか | 並べる **[未承認 — `.needs-input.md` Q1]** | FR-001、data-model §1「見た目」、research R-07 |
| O-8 の行の (c): 観測点 `receivedMessages` の基準の変化を並べて書く | 入れる (記録だけ) | FR-017。本 feature の行は `message` なので数え、`retraction` は `meter` なので数えない (data-model §1「観測」) |
| system-scope「直近の活動の不可視文字の残り」(持ち主 = 次に `sanitizeBody` か直近の活動を触る feature) | 当たらない | 本 feature は `sanitizeBody` の集合と直近の活動の導出 (`normalizeLine`・`summarizeToolInput`) を変えない。`session-view.ts` の `pathTail` を `features/chat/path-tail.ts` に移すだけで (変わるのは末尾が区切りのパスの扱いだけ。data-model §2)、取り消しの後は既存の `trackDerived` を呼び直すだけ。伏せ字 (`redactSecrets`) は新しい関数で、`sanitizeBody` を変えない |
| system-scope「`runtime-store.ts` の検出を束ねる」・composer の 2 項目 (持ち主 = O-10 と X-6 の早いほう) | 当たらない | 本 feature は `runtime-store.ts` と composer を変えない (拒否の後の「編集して再試行」は O-10 に送る) |
| system-scope「`running-session-store.ts` の切り出し」・「押したボタンが自分ごと消える」・「Provider の表記の揺れ」 | 当たらない (O-4 が持って閉じた) | 本 feature はストアに削除の経路を足す (FR-003) が、切り出しは済んでいる (`running-session-monitor.ts` / `running-session-types.ts`)。承認カードは取り消しで消さない (data-model §1) |
| O-2 の pr-gate の Low (a11y L-001 / L-201 / L-202、ux L-101 / L-104。roadmap の割当の外) | 入れる **[未承認 — `.needs-input.md` Q2]** | plan の申し送りの表 #4 / #5。AGENTS.md の gate の原則 (AD-050 Decision 3) と食い違う |

## 判断 (2026-10-04 の夜間の自走で仮採用し、2026-10-05 に利用者が承認)

利用者は下の表の「仮採用した案」と AD-049 を 2026-10-05 に推奨案どおり承認した。表の字面は承認の時点のまま残す (U-4 の「proposed」は承認の前の状態で、AD-049 は同日に accepted になった。U-7 の `readFile` / `backgroundTasks` / `reloadOutputStyles` のうち後の 2 つは O-5 が先に足した)。

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | O-6 の範囲を分けるか (roadmap の範囲の変更・新しい feature の登録)。分けるなら O-11 の domain と M3 の扱い | 分ける。Tier A 14 行と表示の状態を O-6 に、上の箇条書きを O-11 (M3・依存 O-6) に。**O-11 の domain は `ui`** (表示が主。ADR の義務は session の境界なので、O-11 の ADR は session charter にも記録する)。**O-11 の Tier A 3 行を D 節に `後続: O-11` で立て、M3 の完了は O-11 を待つ** (O-2 pr-gate M-201 の答え) | 全部を O-6 に入れる (FR が 20 を超え、ADR の判断が混ざる) / O-11 を `session` にする (O-5 の O-10 と同じ。ADR の義務は session の境界にある) / O-11 を M3 の完了の条件に入れない (Tier A の 3 つが出ないまま M3 を閉じる) |
| U-2 | モデルの拒否で置き換えられた応答を実行中の transcript から外すか | 外す (SDK の指示どおり)。代わりの応答の `supersedes` が届いた時点で外し、ターンの終わりの `retracted_message_uuids` でも外す (冪等)。**外してからターンの終わりの拒否の行が届くまで、理由の行は無い** (応答が説明なく消える間がある。V-3 で確かめる)。過去ログは記録のまま [ASSUMED: 記録に取り消しの印は無い。V-3 で確かめる] | `supersedes` を受けた時点で仮の行「前の応答を取り消しました (理由はこのターンの終わりに出ます)」を出し、拒否の行で置き換える / 外さずに「取り消された」の印を付ける (SDK は transcript の状態から外すよう求めている) / ターンの終わりだけで外す (fallback のターンの間、拒否された部分と代わりが並ぶ) |
| U-3 | `informational` の `content` (Hook が prompt を止めた理由・slash command の出力の文言) を出すか。**O-2 の「Hook の出力本文を出さない」の例外になる** | 出す。秘密の形 (URL の資格情報・`Bearer`・秘密の名前の代入・既知のトークンなど) を伏せ字にし、無害化・1 行・O-2 の切り詰め (120 コードポイント。続きは出さない) を通す。伏せすぎ (`password: is required` の「is」など) を受け入れる。見出しは「知らせ」(SDK は Claude Code 自身の状態の行・Hook・コマンドの出力を同じ型で送るので、出所を断定しない)。`level` が `info` の知らせも控えめの見た目で出す (頻度は V-3 で記録)。過去ログの `system` の本文にも伏せ字を当てる。規則の正本は data-model §1 | 出さない (止まった理由が分からず判断を誤る。Tier A の理由) / 既定で畳み、操作で開く (肩越しの漏れは減るが、止まった理由が一目で分からない) |
| U-4 | Agent plan の本文を markdown で描くか (**AD-035 Decision 6 の読み替え**) | 描く。plan の文字列を `TextMessagePartProvider` で text part の context に包み、既存の `MarkdownText` をそのまま通す (新しい markdown の描画口を作らない)。markdown で見えなくなる本文 (生 HTML・コメント) のために「原文」の切り替えを付ける。AD-049 (proposed) に記録 | plain text のまま (AD-035 D6) |
| U-5 | WebSearch の結果から Sources / Inline citation を組むか | 組まない。結果は text として描き、見出しに検索語とドメインの制限を出す (文章からリンクを推測しない) | 結果の text からリンクを取り出して Sources に |
| U-6 | ui の feature が session の契約と操作 UI を広げてよいか (domain をまたぐ): agents のセッションスレッドに system の 4 つの subtype と最上位の `conversation_reset` の分岐、`meter` の種類 `retraction` (message の id の列)、稼働中のストアからのメッセージの削除、項目 16 の禁止の追加 | 広げる。O-4 U-1 と同じく O-6 (ui) が持ち、session charter に記録する。承認の要求 (`PermissionRequest`) と承認の応答の形は変えない (data-model §3 は承認待ちを tool ごとに見分けない) | session の feature に切り出し、O-6 はその後に表示だけを作る |
| U-7 | アプリが task・チェックポイントを操作するか (製品の範囲。巻き戻し・task の停止・前面の task を背景に移す) | 操作しない (アプリ全体の決定。AD-049 Decision 6。O-5 の「MCP を操作しない」と同じ)。E 節の `rewind_files` / `stop_task` / `background_tasks` は `表示不要`、Checkpoints (Tier A の element) は表示だけ。項目 16 の禁止に `readFile` / `backgroundTasks` / `reloadOutputStyles` を足す | O-11 で AD-036 §4 P3 の読み替えの ADR を起こし、巻き戻し・停止を扱う (回復の手段になるが、権限の境界を広げる) |

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

各項目の末尾に、`/cl-spec` Phase 8 の基準での根拠を書く (2026-10-13 の載せ直しで分類した)。

- Q: `Read` / `Glob` / `Grep` のパスをどう出すか → A: 会話由来の本文として出す (解決しない・UNC を判定しない)。見出しはパスの末尾と範囲、全体は畳んだ中身に。AD-049 Decision 5 で承認済み
- Q: `WebFetch` の URL をどう出すか → A: 見出しは http(s) のときだけ host (パスの末尾が秘密の webhook があるので、パスは見出しに出さない。design-gate R2 H-01)。全体は畳んだ中身に伏せ字を通して出す。AD-049 Decision 5 で承認済み
- Q: `TaskCreate` などをまとめた計画の一覧 (右のペインのタブ) を作るか → A: 作らない。呼び出しごとに描く。一覧の要否は O-11 の Background task の一覧と合わせて判断する。U-1 (O-11 の箇条書き) で承認済み
- Q: 読み上げの量と中身 → A: 見ているセッションで新しく届いた出来事だけ (O-2 から回された Hook / task の行の終わりを含む)。固定の文言と既知の列挙と件数だけを読み、会話由来の文字列を読まない [ASSUMED: 読み上げの文言 (ポジティブリスト)。会話由来の文字列を読まないのは U-3 の伏せ字の外に本文を出さないため]。1 秒に 1 回までにまとめる [ASSUMED: 数値の既定値 (ポジティブリスト)]
- Q: `conversation_reset` の `new_conversation_id` をどうするか → A: 読まない。アプリは今 SDK の会話の id を追っていない (`src` で 0 件)。境界の表示だけにし、/clear の後の id の扱いは V-3 で記録して X-6 (再開・分岐) に申し送る (読まないフィールドは data-model §1 の許可リストの規則。id を追うのは X-6 の範囲)
- Q: 圧縮の行 (O-4。進み具合) と圧縮の境界 (本 feature。区切り) を並べるか → A: 並べる。行 (圧縮中 → 完了) が先、境界が後。行は失敗も出すので境界に置き換えない (research R-07) [ASSUMED: **未承認 — ポジティブリストの外。roadmap の O-6 の行の「O-4 から」が O-6 に決めさせている。`.needs-input.md` Q1**]

## User Scenarios & Testing

### User Story 1 - 会話の区切りと止まった理由が分かる (Priority: P1)

利用者は transcript で、コンテキストが圧縮された所・会話が新しくなった所・モデルが応答を拒否した所と、Hook などで止まった理由を見る。

**Why this priority**: Tier A 5 行。区切りが見えないと、古い transcript がまだコンテキストに残っていると誤解して判断を誤る。止まった理由が出ないと、利用者は再送や中断を繰り返す。

**Independent Test**: 変換の単体と行の component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中に `compact_boundary` が届く、**When** transcript を見る、**Then** 圧縮の境界 (手動 / 自動と、前後のトークン数) が出る。過去ログでは同じ element で、手動 / 自動と数を省いた文言で出る (過去ログの DTO は数を運ばない)
2. **Given** `conversation_reset`、**When** 届く、**Then** 「ここから新しい会話です」の境界が出る (SDK は /clear・plan モードの終了・新しいセッションで送るので、上の内容がコンテキストに無いとは断定しない)
3. **Given** fallback のモデルでの再試行、**When** 代わりの応答 (`supersedes` 付き) が届く、**Then** 置き換えられた応答がその時点で実行中の transcript から外れ、ターンの終わりの `model_refusal_fallback` で「モデルが応答を拒否したため {fallback のモデル} に切り替えました」の行が出る (scope が local なら「この応答だけ」)。外してから拒否の行が届くまで理由の行は無い (U-2)。後から同じ id のメッセージや結果が届いても戻らない
4. **Given** `model_refusal_no_fallback`、**When** 届く、**Then** 「モデルが応答を拒否しました」の行と、言い直して送り直せる旨と、`content` (U-3 の規則) が出る
5. **Given** `informational`、**When** 届く、**Then** 「知らせ」の行に `content` (U-3 の規則) が出る。同じ `tool_use_id` の知らせは 1 行にまとまる。`prevent_continuation` なら「ここで止まりました」を添えて注意の見た目、`level` が `warning` / `suggestion` は注意の見た目、`info` / `notice` は控えめの見た目
6. **Given** 拒否のカテゴリ (`api_refusal_category`)、**When** 表示する、**Then** 形の検査を通ったときだけ分類として出し、説明 (`api_refusal_explanation`。API の文章) は出さない [ASSUMED: **未承認 — ポジティブリストの外。`.needs-input.md` Q3**]

---

### User Story 2 - ファイル・検索・Web・計画の tool が何をしたかが分かる (Priority: P1)

利用者は transcript で、`Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の呼び出しを、tool ごとの専用の表示で読む。

**Why this priority**: Tier A 9 行。今は ToolFallback で入力の JSON がそのまま出る。コードを読む作業ではこれらが呼び出しの大半を占める。

**Independent Test**: 表示ごとの component テスト (過去ログと実行中の fixture)。

**Acceptance Scenarios**:

1. **Given** `Read`、**When** 見る、**Then** 見出しにファイル名 (パスの末尾) と範囲 (行・ページ) が出て、畳んだ中身に全体のパスと結果が出る
2. **Given** `Glob` / `Grep` (`files_with_matches`)、**When** 見る、**Then** 見出しに検索の形 (パターン・対象のパスの末尾・`glob`) が出て、畳んだ中身に結果のファイルの一覧が File tree で出る。一覧でない行 (件数・打ち切りの注記など) は text で添える。`Grep` のほかの `output_mode` は text
3. **Given** `WebFetch`、**When** 見る、**Then** 見出しに host だけが出て (パス・クエリ・資格情報・フラグメントを出さない)、畳んだ中身に伏せ字を通した全体の URL と `prompt` と結果が出る
4. **Given** `WebSearch`、**When** 見る、**Then** 見出しに検索語と、ドメインの制限があればその件数が出て、畳んだ中身に結果の text が出る
5. **Given** `TaskCreate` / `TaskUpdate`、**When** 見る、**Then** TodoList の 1 項目で出る (`TaskCreate` は題と「追加した時点: 未着手」と、タスクの id が分かる結果の text。`TaskUpdate` は題か「タスク #{id}」と状態。`status` の無い `TaskUpdate` は見出しだけ)。`TaskGet` / `TaskList` は見出しと結果の text
6. **Given** `ExitPlanMode` の plan、**When** 見る、**Then** markdown として描かれ、生の HTML は描かれず、安全でない URL は無効になる (R-3 の境界)。「原文」に切り替えると全文が plain text で見え、描かれない部分があるときはその印が出る
7. **Given** 9 つの tool の結果がエラー (`is_error`)・一致が 0 件・結果が text でない、**When** 見る、**Then** エラーは既存のエラーの印と本文、0 件は結果の文 (File tree を出さない)、text でない結果は「text でない結果か、空の結果です」が出る

---

### User Story 3 - tool の結果を待っているか、来なかったかが分かり、支援技術でも追える (Priority: P2)

利用者は、結果がまだ来ていない tool と、来ないまま終わった tool を見分け、待つか動くかを決める。スクリーンリーダーの利用者は、画面を巡回しなくても tool のエラーや会話の区切りを知る (WCAG 4.1.3)。

**Why this priority**: US-1 / US-2 が無くても価値はあるが、表示の量が増えるほど要る。

**Independent Test**: tool の表示と読み上げの component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中のセッションで応答中 (`running`) に結果がまだ来ていない最新のターンの tool、**When** 見る、**Then** 「結果待ち」の動く印が出る。承認待ち (`awaiting_permission`) の間は動かない「結果待ち」。結果が届けば消える (並列の tool でも tool ごとに外れる)
2. **Given** 応答が終わった・中断した・セッションが終了・失敗した・過去ログ・前のターン、のどれかで結果の無い tool、**When** 見る、**Then** 「結果不明」の印が出る
3. **Given** 見ているセッションで新しく tool がエラーになった・Hook / task の行が終わった・圧縮 / 拒否 / 会話の作り直し / 止まった知らせが届いた、**When** 起きる、**Then** 支援技術に丁寧に (`aria-live="polite"`) 読み上げられる。最初の描画・セッションの切り替え・過去ログ・「さらに表示」では読まない。セッションの終わりで一斉に結果不明になった tool は読まない。1 秒に 1 回にまとめる
4. **Given** ToolFallback で描く tool、**When** 見る、**Then** 見出しが日本語 (「{tool 名} を実行」) で出る

---

### Edge Cases

- 拒否の `fallback_model` → O-4 data-model §2 の `modelId` の形の検査 (`isMeterModelId`。`session-init-report.ts`) に通らなければ「別のモデル」
- scope が `session` の fallback の後、O-7 の「概要」の「起動時のモデル」は起動時の設定のまま。実際のモデルは O-5 の「構成」のタブの「Claude Code が報告したモデル」(次の `init`) で分かる
- 結果待ちの tool に O-4 の経過時間 (`ToolResultMarks`) が出ている → 「結果待ち」の印と並べて出す。結果不明になったら経過時間を出さない (data-model §3)
- 取り消しの id に知らない id・閉じたセッション → 無視する (冪等)。取り消した行が画面より上にあっても表示位置を保ち、隠れた古いメッセージの件数を直す
- `informational` の `content` が空 → 見出しだけの行。120 コードポイントを超える → `…` で切れ、続きは出さない (U-3)
- 過去ログの `system` の記録に文字列の `content` がある (`informational`・`local_command_output`・拒否) → 今どおり system のメッセージとして出すが、伏せ字を通す (行への変換は O-11)
- `Read` / `Glob` / `Grep` のパスが WSL のパス・Windows 形式・UNC → どれも本文として出す (判定も除去もしない)。見出しの末尾は `/` と `\` の両方で切る
- `Glob` / `Grep` の結果の行が多い / ディレクトリ名が `__proto__` など → File tree は data-model §2 の上限と作り方に従う
- `WebFetch` の URL が読めない・http(s) でない → 見出しに「URL」とだけ出す。パスの末尾が秘密の webhook (`/services/T…/B…/<secret>`) → 見出しは host だけなので出ず、中身の URL は伏せ字になる
- `TaskUpdate` の `status` が知らない値 → 「不明」
- O-2 の結果待ちの上限 (256) で結果が別のメッセージに入った tool → 元の tool は「結果は別に表示」、結果は結果だけの表示
- 読み上げが重なる (並列の tool のエラー) → まとめて「{n} 件の tool がエラーになりました」

## Requirements

### Functional Requirements

#### 会話の境界と知らせ (US-1)

- **FR-001**: 圧縮の境界は、実行中と過去ログで同じ専用の表示 (TranscriptBoundary。registry に区切りの element が無いので作る) で描かなければならない。実行中は agents が `compact_boundary` から行を作り (O-4 の `live-signals.ts` の `onSystem`)、過去ログは今の `divider` の part を同じ表示に写す。O-4 の `compaction` の行とは並べる **[未承認 — `.needs-input.md` Q1]**。行の中身と文言の正本は data-model §1 / §4
- **FR-002**: `conversation_reset` を会話の境界として描かなければならない (実行中。最上位の型なので `sdk-agent-session.ts` の switch に分岐を足す)
- **FR-003**: `model_refusal_fallback` / `model_refusal_no_fallback` を拒否の行として描き、置き換えられた応答を実行中の transcript (稼働中のストア) から外さなければならない (U-2)。外す合図・送り方・戻らない仕組み・通すフィールドの正本は data-model §1
- **FR-004**: `informational` を知らせの行として描き、過去ログの `system` の記録の本文にも同じ伏せ字を当てなければならない (U-3)。本文の伏せ字・見た目の正本は data-model §1
- **FR-005**: FR-001〜FR-004 の行は O-2 のシステムイベントの行の経路 (`message`) で運び、part の形 (`TRANSCRIPT_PART_FIELDS`) は変えない。取り消しの id の列は O-4 の `meter` の種類 `retraction` で運び、O-4 の上限と間引きに掛けない (data-model §1)。`SessionEvent` の種類を増やさない

#### tool の専用表示 (US-2)

- **FR-006**: `Read` / `Glob` / `Grep` をファイルと検索の表示 (File tree・Tool call) で描かなければならない。パスは会話由来の本文で、解決も UNC の判定もしない。見出し・中身・File tree の作り方の正本は data-model §2
- **FR-007**: `WebFetch` / `WebSearch` を Web の表示で描かなければならない。URL の見せ方の正本は data-model §2。結果は text (U-5)
- **FR-008**: `TaskCreate` / `TaskUpdate` を TodoList の 1 項目で、`TaskGet` / `TaskList` を見出しと結果の text で描かなければならない (呼び出しごと。一覧の集約はしない)。状態の対応の正本は data-model §2
- **FR-009**: Agent plan の本文を R-3 の `MarkdownText` で描き、「原文」の切り替えを付けなければならない (U-4。AD-049)。方式の正本は data-model §2
- **FR-010**: tool の表示の振り分け (`tool-registry.aui.tsx`。O-5 の 2 段の登録) に FR-006〜FR-008 の tool を足さなければならない。過去ログと実行中の両方

#### tool の結果の状態と読み上げ (US-3)

- **FR-011**: data-model §3 に列挙した tool の表示は、結果待ち・結果不明の印を data-model §3 の規則で出さなければならない。印は O-4 の `ToolResultMarks` (経過時間・エラー・切り詰め) に足す
- **FR-012**: 見ているセッションで新しく起きた tool のエラー・Hook / task の行の終わり・圧縮・拒否・会話の作り直し・止まった知らせを、支援技術に読み上げなければならない。読む中身・きっかけ・まとめ方・重ねない相手の正本は data-model §4
- **FR-013**: ToolFallback の見出しと状態の文言を日本語にし、状態のアイコンを data-model §3 の結果の状態から決めなければならない (data-model §3 / §4)

#### 境界の検査・対応表と記録

- **FR-014**: 完了の PR で `docs/ui-coverage.md` を data-model §5 のとおりに書き換えなければならない。項目 21 の出力で、割当先が O-6 の行が 0
- **FR-015**: 完了の PR で roadmap に **O-11「Hook・背景の task・実行中の subagent と知らせの類の表示」**(M3・`ui`・依存 O-6。順 20 (O-10 の後) に置き、M4 / M5 の順を 1 つずつ振り直す) を登録し、範囲 (本 spec の「本 feature の位置づけ」の箇条書き) と ADR の義務を書かなければならない: `includeHookEvents` (AD-041 (g) の読み替え)、`getSubagentMessages` (AD-035 D3 の読み替えと許可リストの追加)、`get_hooks_listing` を呼ぶなら AD-036 §4 P3 の読み替え。同じ PR で対応表に `後続: O-11` の行を立てる (AD-044 の「後続 feature は roadmap に登録する」。O-5 が O-10 の行を完了の PR で足したのと同じ)。roadmap の O-6 の行を本 feature の範囲と結論に直し、依存の列を O-2 / O-7 / O-4 / O-5 にする
- **FR-016**: 決定は AD-049 (2026-10-05 に accepted) に記録した。本文は変えない。読み替える先行の決定 (AD-035 D6、AD-044 D4 / D6 の持ち主、AD-047 D2、O-2 の「Hook の出力本文を出さない」) は AD-049 の「読み替える箇所」が名指している
- **FR-017**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。対象の正本は tasks.md の SH-001 / SH-010 (glossary・ui / session charter・`_overview.md`・`docs/prompts.md`・roadmap の O-8 の行の (c) の注記・O-4 data-model §2 / AD-047 の参照)
- **FR-018**: `scripts/constitution/allowlists.mjs` の `QUERY_MUTATION_METHODS` に `readFile` を足さなければならない (AD-049 Decision 6 の 3 つのうち `backgroundTasks` / `reloadOutputStyles` は O-5 が足した)。`sdk-agent-session.ts` の `readFile` を `QueryUnusedReadMethod` から `QueryMutationMethod` に移し、集合の固定テスト (`tests/docs/query-mutation-methods.test.ts`。21 → 22) を直し、3 つのメソッドごとの違反の fixture で項目 16 が発火することを固定する。あわせて `sdk-agent-session.ts` の `queryHandle` の型を `interrupt` と非同期の反復だけに絞り、ブラケット・参照の形を型で塞がなければならない

### Key Entities

- **会話の境界の行**: 圧縮・会話の作り直し・拒否・知らせ。O-2 のシステムイベントの行の category。正本は data-model §1
- **取り消し (retraction)**: 置き換えられた応答の id の列。`meter` で運び、稼働中のストアから外す。O-4 の「保留の取り消し」とは別物。正本は data-model §1
- **tool の結果の状態**: 結果あり / 結果待ち / 結果不明。正本は data-model §3

### Assumptions / Clarifications

- **[承認済み U-1〜U-7]** 上の「判断」の表 (2026-10-05)
- **[承認済み AD-049]** パスと URL の見せ方 (Decision 5)。計画の一覧を作らないことは U-1
- **[ASSUMED]** 読み上げの量と中身 (ポジティブリスト)、`new_conversation_id` を読まないこと、過去ログに取り消しの印が無いこと (U-2 の中。V-3 で確かめる)
- **[未承認]** 圧縮の行と境界を並べること (`.needs-input.md` Q1)、O-2 の pr-gate の Low を引き受けること (Q2)、拒否の説明を出さないこと (Q3)
- V-4 の未記録の項目は未確認として扱う (本 feature に関わる 2 つは両方の形に耐える規則にする)

## Success Criteria

- **SC-001**: **区切りと止まった理由が出る。** US-1 の AC1〜AC6 のとおりになり、data-model §1 の読まないフィールドの目印の値と伏せ字の対象の目印が `SessionEvent` と DOM に 0 件。取り消しの id のメッセージが稼働中のストアから消え、O-4 の上限が埋まっていても・後から同じ id が届いても戻らない。計測経路: agents の変換の単体 + 稼働中のストアの単体 + 行の component テスト
- **SC-002**: **9 つの tool が専用に描かれる。** US-2 の AC1〜AC7 のとおりになり、入力が正しいとき 9 つの tool が ToolFallback で描かれない (過去ログ・実行中)。data-model §2 の出さない値 (URL のパス・クエリ・資格情報・フラグメント) が見出しに 0 件。Agent plan で R-3 の XSS の fixture 一式が描かれない。計測経路: 表示ごとの component テスト
- **SC-003**: **結果の状態が分かり、読み上げられる。** US-3 の AC1〜AC4 のとおりになり、data-model §3 に列挙したすべての表示で印が出て、vitest-axe (O-7 で導入) の違反 0。読み上げは 1 秒に 1 回以下で、会話由来の文字列の目印が 0 件。計測経路: tool の表示と読み上げの component テスト (偽の時計)
- **SC-004**: **対応表の O-6 の行が無くなる。** 項目 21 が通り、出力で割当先が O-6 の行が 0、M3 の完了の条件の残りが data-model §5 のとおり (O-6 の 14 行が消え、D 節の O-11 の 3 行が立つ)。計測経路: `node scripts/constitution/check.mjs`
- **SC-005**: **境界を広げない。** `SessionEvent` の種類・`TRANSCRIPT_PART_FIELDS`・Agent SDK の呼び出しの許可リスト・query の options のキー・`PermissionRequest` のフィールド・`toPermissionResult` の出力・IPC・preload・main の差分が 0。`MeterUpdate` の種類 (`METER_UPDATE_TYPES`) は O-5 の後の 8 から `retraction` の 1 つだけ増える。`sdk-agent-session.ts` の `Query` のメソッドの呼び出しは `interrupt` だけで、FR-018 の集合の固定テスト (22) が通り、メソッドごとの fixture で項目 16 が発火する。計測経路: 固定テスト + 項目 16 + `git diff` (quickstart V-1)

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表、システムイベントの行の経路と合成と「結果不明」の規則、tool の結果の経路、ファイル名の規則 (`pathTail`)
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)。PR #15 で完了): 実行中の行を agents で組む形 (`src/agents/live-signals.ts`)、`meter` (`METER_UPDATE_TYPES`) と上限 (`meter-throttle.ts`)、`modelId` の形の検査 (`isMeterModelId`)、`compaction` の行、tool の経過時間の印 (`ToolResultMarks`。AD-047。accepted)
- **O-5** ([015](../015-ui-mcp-elicitation-commands/spec.md)。PR #17 で完了): tool の表示の振り分けの表 (`tool-registry.aui.tsx` の `Object.hasOwn` の照合と 2 段の登録)、状態のアイコンの部品 (`ToolFallbackStatusIcon` / `statusWithError`。`tool-fallback.aui.tsx`)、`QUERY_MUTATION_METHODS` の拡張と集合の固定テスト、`meter` の上限に掛けない種類の前例 (`init-report` / `commands`。AD-048。accepted)
- **O-7** ([013](../013-ui-app-shell/spec.md)。PR #13 で完了): 置き場所の語彙と「見ているセッション」(`watchedId`)、vitest-axe の導入 (AD-046。accepted)
- **O-3** ([012](../012-ui-thread-search/spec.md)。PR #14 で完了): AD-045 (UI の文言を i18n リソース化しない。accepted)。本 feature の文言は `labels.ts` に置く (AD-045 Decision 2)
- **R-3 / R-4** (003 / 004): `MarkdownText` の XSS の境界、tool の専用表示の登録、Agent plan (AD-035)

## Out of Scope

- 上の「本 feature の位置づけ」で O-11 に送ったもの (一般の Hook・Background task の一覧・後から背景に移った task・シェルの Background task の見分け・実行中の subagent の入れ子 (入れ子の中の divider を含む)・Agent handoff・Tier B の知らせの類・Checkpoints の表示・File element・`server_tool_use` / `web_search_tool_result`・B 節の機械照合・過去ログへの本 feature の行の変換・V-4 の未記録の項目の確認)
- task・チェックポイントの操作 (`rewind_files` / `stop_task` / `background_tasks`。`表示不要`。U-7)
- 拒否の後の「編集して再試行」(`refused_user_message_uuid`) → O-10 (roadmap の O-10 の行に書く。SH-010)
- `TaskCreate` などをまとめた計画の一覧 → O-11 の Background task の一覧の判断と合わせる
- WebSearch の結果からの Sources / Inline citation (U-5)
