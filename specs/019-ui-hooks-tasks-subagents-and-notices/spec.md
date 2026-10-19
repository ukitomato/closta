---
spec_id: 019-ui-hooks-tasks-subagents-and-notices
feature_id: O-11
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: auto
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: Hook・背景の task・実行中の subagent の表示 (O-11)

**Feature Branch**: `019-ui-hooks-tasks-subagents-and-notices`

**Created**: 2026-10-17 (夜間の自走で起案。人間の承認が要る判断は推奨案で仮採用し、2026-10-17 に利用者が U-1〜U-11 と AD-054〜056 を承認した — 下の「判断の一覧」)

**main との突き合わせ**: 2026-10-18 に main 6fa08c2 (O-9 #20 / O-10 #23 のマージ後) に rebase し、O-9 / O-10 が足した型・タブ・対応表の行に合わせて直した (`QUERY_OPTION_KEYS` は AD-053 の `onElicitation` との和集合、`SYSTEM_EVENT_CATEGORIES` は O-10 の `elicitation` を含む数、右のペインのタブは O-9 の「会話の地図」を含む数、`createdAt` (AD-051) の扱い、O-10 の `elicitation_complete` の過去ログの変換の送り先)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 20 の O-11 の行 (範囲と義務の正本)。O-6 の spec 016 の U-1 と [AD-049](../../docs/decisions/0049-boundaries-retraction-and-o11-split.md) Decision 1 で O-6 から分けた。対応表 (`docs/ui-coverage.md`) の `後続: O-11` の行 (D 節の Tier A 3 行と Tier B の残り)。

## Summary

transcript と右のペインで、Claude Code が実行した Hook、背景で動いている task、実行中の subagent が何をしているかを読めるようにする。

- **一般の Hook**: PreToolUse・PostToolUse・Stop などの Hook の開始と結果を、SessionStart の Hook と同じ行で出す (今は SDK が既定で SessionStart / Setup だけを出す)
- **背景の task**: 前景で始まって後から背景に移った task にも行を出す。シェルの背景の task をコマンドの名前で見分ける。今動いている背景の task の一覧を右のペインのタブに出す
- **実行中の subagent の入れ子**: subagent の中の発言と tool の呼び出しを、実行中も過去ログも親の `Agent` の呼び出しの中に入れ子で出す (今は実行中は主ループに平らに並ぶ)

完了の PR で対応表の `後続: O-11` の行を、本 feature の表示 (`実装済み`)・`表示不要`・新しい後続 **O-12** のどれかに書き換える。**D 節の Tier A 3 行 (一般の Hook・後から背景に移った task・実行中の subagent の入れ子) は本 feature で `実装済み` になり、M3 の完了の条件の残りが 0 になる。**

## 判断の一覧 (2026-10-17 に利用者が承認)

夜間の自走で推奨案を仮採用し、**2026-10-17 に利用者が U-1〜U-11 と AD-054 / AD-055 / AD-056 を承認した** (design-gate H-02 の解消)。U-9〜U-11 は design-gate (round 1) の修正で足したもので、同じ承認に含まれる。gated 確定事項の U-3 (一覧の持ち主の domain) と U-7 (Principle XIII の Agent handoff) も承認済み。

| 判断 | 1 行の要約 | 記録 |
|---|---|---|
| U-1 | 範囲を分け、Tier B の表示の類を新しい O-12 に送る (roadmap の更新案は「本 feature の位置づけ」) | AD-056 Decision 1 |
| U-2 | 一般の Hook のため `includeHookEvents: true` を渡す。`get_hooks_listing` は呼ばない | AD-054 / AD-056 Decision 4 |
| U-3 | **背景の task の一覧を作り、表示と feature の持ち主は `ui`。保持は session の契約** (`meter` の種類 `background-tasks` と稼働中のストアの `meters`。O-4〜O-6 と同じ形。右のペインのタブ。design-gate H-07 で書き分けた) | AD-056 Decision 2 |
| U-4 | 計画の一覧 (TodoList のタブ) は作らない | AD-056 Decision 3 |
| U-5 | 実行中の入れ子は stream から組み (`forwardSubagentText: true`)、過去ログは `getSubagentMessages` で補う | AD-054 / AD-055 |
| U-6 | ui の feature が session の契約 (agents の入れ子・`meter` の種類・query の options・SDK の許可リスト) を広げる | AD-054 / AD-055 / AD-056 Decision 2 |
| U-7 | Agent handoff の element は使わない | AD-056 Decision 5 |
| U-8 | 過去ログの subagent の agentId を `listSubagents` で列挙し、`getSubagentMessages` が返す `parent_tool_use_id` で親の呼び出しと結ぶ (design で SDK 0.3.270 を確かめた結果。許可リストは 5 つ) | AD-055 Decision 1 / 2 |
| U-9 | 帰属つき (`parent_tool_use_id`) の system のメッセージは、`compact_boundary` (入れ子の divider) 以外を帰属の無いものと同じく主ループの行にする (入れ子に Hook の行を描かない。捨てない) (design-gate H-03) | data-model §3.1 |
| U-10 | 実行中の入れ子が上限 (子 500 件・根の送り直し 1 MB) に当たったら、以後の子を足さず切り詰めの印を出す。最新の子を残す方式は採らない (design-gate H-04) | data-model §3.1 |
| U-11 | 入れ子の user のメッセージは tool_result だけを読み、user の text を描かない (実行中と過去ログ。O-2 の「user の本文は送らない」を継ぐ) (design-gate H-09) | data-model §3.1 / §3.2 |
| ADR | [AD-054](../../docs/decisions/0054-query-options-hook-events-and-subagent-text.md) / [AD-055](../../docs/decisions/0055-subagent-messages-for-past-transcripts.md) / [AD-056](../../docs/decisions/0056-o11-scope-background-task-list-and-o12-split.md) (いずれも accepted。2026-10-17) | `docs/decisions/` |

## 本 feature の位置づけ

- **範囲を分ける (U-1)。** roadmap の O-11 の行は Tier A 3 行と Tier B 14 行の表示・3 つの ADR・過去ログの変換・機械照合を持ち、1 つの spec では FR が 20 を超える。単体で確かめられる機能が 2 つ入っている (Tier A 3 行を出す Hook・task・subagent の表示と、Tier B の知らせ・ブロックの表示)。本 feature は前者に絞り、後者を新しい O-12 に送る
- **roadmap の更新案** (この段では roadmap を編集しない。完了の PR で書く。FR-014):
  - 新しい行 **O-12「知らせの類・Checkpoints・中身のブロックの表示」**(M3・順 21・`ui`・依存 O-11)。範囲: Tier B の知らせの類 (`notification` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `tool_use_summary` / `active_goal`)・Checkpoints の表示 (`files_persisted`。巻き戻しはしない)・`user/document` の File element・`server_tool_use` / `web_search_tool_result` (Sources / Inline citation の判断し直しを含む。O-6 U-5)・対応表の B 節の機械照合・過去ログへの O-6 の行 (`informational`・拒否・会話の作り直し) と O-10 の行 (`elicitation_complete`。category `elicitation`) の変換 (O-6 の quickstart V-3 と O-10 の quickstart V-3 の記録による)。Tier B と、実行中の経路で `実装済み` の行の過去ログの経路だけなので M3 の完了の条件に数えない。M4 / M5 の順を 1 つずつ振り直す (I-1 が 22 から)
  - O-11 の行の範囲を本 spec の範囲に直し、O-12 に送った項目と結論を書く
- **ADR を design の前に起こした** (AD-049 Decision 1。roadmap の行の義務): `includeHookEvents` (AD-041 (g) の読み替え) は AD-054、`getSubagentMessages` (AD-035 Decision 3 の読み替えと許可リストの追加。design で `listSubagents` も足した。U-8) は AD-055。`get_hooks_listing` は呼ばない (U-2) ので AD-036 §4 P3 の読み替えは起こさず、呼ばない判断を AD-056 Decision 4 に書いた。AD-054 は roadmap の行が名指していない `forwardSubagentText` も足す (U-5。実行中の入れ子に subagent の本文を出すため)
- **session の境界に触れるもの (O-2 pr-gate arch L-201 の答え)**: query の options のキー (AD-054)・Agent SDK の呼び出しの許可リスト (AD-055)・agents のセッションスレッドの subagent のメッセージの扱い (入れ子にして送り直す)・`meter` の種類 `background-tasks` (AD-056)。`SessionEvent` の種類・承認の要求と応答・IPC・preload・main は変えない。3 つの ADR は session charter にも記録する (FR-015)
- **O-2 / O-4 / O-6 の行の作り方に従う。** 行は O-2 のシステムイベントの行 (`toSystemEventMessage` と `mergeSystemEvent`) で、実行中の行の組み立ては agents (`live-signals.ts` / `sdk-agent-session.ts`)。入れ子は R-4 の DTO の `children` と AD-035 Decision 4 / 5 の規則

### 義務の扱い

roadmap の O-11 の行が預けた範囲と義務の扱いの正本はこの表である。

| 義務 (roadmap の O-11 の行) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| 一般の Hook の表示と `includeHookEvents` の ADR | 扱う | US-1 / FR-001〜FR-003、AD-054 |
| `get_hooks_listing` (呼ぶなら AD-036 §4 P3 の ADR) | 扱う (呼ばない。U-2) | AD-056 Decision 4、FR-012 |
| `hook_name` にコマンドの文字列が入るかの確認 (V-4 の未記録の項目) | 扱う (quickstart で記録。それまで O-2 の allowlist の形の規則を一般の Hook にも当てる) | FR-002、SC-005 |
| 伏せた Hook 名の見分け (O-2 pr-gate ux L-102) | 扱う | FR-002 |
| 実行中の Background task の一覧の要否 (要るなら持ち主の domain を人間に諮る)・右のペインのタブ (TodoList・Background task) の要否 | 扱う (一覧を作る・表示と feature の持ち主は `ui`、保持は session の契約・TodoList のタブは作らない。U-3 / U-4) | US-2 / FR-006、AD-056 Decision 2 / 3 |
| 後から背景に移った task の行 | 扱う | US-2 / FR-004 |
| シェルの Background task を秘密を出さずに見分ける手がかり | 扱う | US-2 / FR-005 |
| 実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`・入れ子の中の divider) と Agent handoff | 扱う (Agent handoff は使わない。U-7) | US-3 / FR-007〜FR-011、AD-054 / AD-055 |
| `TaskCreate` などをまとめた計画の一覧の要否 | 扱う (作らない。U-4) | AD-056 Decision 3 |
| 過去ログの Hook / task の行の変換 (O-2 の V-4 の記録による) | 扱う (変換は O-2 で実装済み。実データに残るかを quickstart で記録し、残れば経路を「両方」に直す) | FR-012、SC-005 |
| O-11 の domain 間の依存 (O-2 pr-gate arch L-201) | 扱う | 上の「session の境界に触れるもの」、FR-015 |
| Tier B の知らせの類・Checkpoints の表示・`user/document` の File element・`server_tool_use` / `web_search_tool_result` | 送る (O-12。U-1) | 上の roadmap の更新案 |
| 対応表の B 節の機械照合 | 送る (O-12。U-1。B 節の行と同じ feature で照合する) | 同上 |
| 過去ログへの O-6 の行 (`informational`・拒否・会話の作り直し) の変換 (O-6 の V-3 の記録による) | 送る (O-12。U-1) | 同上 |
| 過去ログへの O-10 の `elicitation_complete` の行 (category `elicitation`) の変換 (O-10 が roadmap の O-11 の行に足した。対応表 A 節の `SDKElicitationCompleteMessage` の備考) | 送る (O-12。U-1 の「過去ログへの O-6 の行の変換」と同じ扱い。AD-056 Decision 1) | 同上、data-model §4 |
| O-11 の完了の PR で対応表の対象の行を書き換える | 扱う | FR-012 |
| O-8 の行の (c): 観測点 `receivedMessages` の基準の変化を並べて書く | 扱う (記録だけ) | FR-016 |

## 判断 (2026-10-17 の夜間の自走で仮採用し、同日に利用者が承認)

| # | 判断 | 採った案 (2026-10-17 に承認) | 代わりの案 |
|---|---|---|---|
| U-1 | O-11 の範囲を分けるか (roadmap の範囲の変更・新しい feature の登録) | 分ける。Hook・task・subagent (Tier A 3 行とその義務) を O-11 に、Tier B の表示の類・B 節の照合・O-6 の行の過去ログの変換を O-12 (M3・`ui`・依存 O-11) に。O-12 は M3 の完了の条件に数えない | 分けない (FR が 20 を超え、Tier B の判断が Tier A 3 行の完了を遅らせる) / O-12 を Optional scope に置く (Tier B の行の持ち主が M3 の外になり、`後続` の ID の範囲が広がる) |
| U-2 | 一般の Hook を出すか。出すなら `includeHookEvents` を渡すか、`get_hooks_listing` を呼ぶか | 出す。`includeHookEvents: true` をリテラルで渡す (AD-054)。`get_hooks_listing` は呼ばない (設定の一覧は `/hooks` で見られる。AD-056 Decision 4) | 起動のダイアログで切り替える (起動の入力・プリセットが広がる) / `get_hooks_listing` で右のペインに設定の一覧を出す (`Query` の呼び出しを広げる) |
| U-3 | **実行中の背景の task の一覧を作るか。作るなら持ち主の domain** | 作る。**表示と feature の持ち主は `ui`** (表示が主)。**保持は session の契約**: `meter` の種類 `background-tasks` と稼働中のストアの `meters` (O-4〜O-6 の `meter` と同じ形)、agents のセッションスレッドの前景の task の記憶 (上限 256・永続化しない)。AD-044 Decision 6 の「session の責務に含めない・状態は保持しない」を AD-056 が読み替える (「読み替える箇所」)。右のペインのタブ「背景の task」に、`background_tasks_changed` の最新の 1 つを置き換えで出す。agents は id と種類だけを送り、名前は同じ id の transcript の行から引く (AD-056 Decision 2) | 作らない (行の終わりを取りこぼすと「実行中」が残る) / 持ち主を `session` にする / 中央のヘッダの件数だけにする |
| U-4 | 計画の一覧 (`TaskCreate` などをまとめた TodoList のタブ) を作るか | 作らない (呼び出しごとの表示と `TaskList` の結果で読める。AD-056 Decision 3) | 右のペインに TodoList のタブを足す (`TaskCreate` / `TaskUpdate` の入力から計画の状態を組む。状態の持ち主が要る) |
| U-5 | 実行中の subagent の入れ子をどう組むか。過去ログの subagent の本文を `getSubagentMessages` で読むか | 実行中は stream の `parent_tool_use_id` で親の `Agent` の呼び出しの `children` に入れ、`forwardSubagentText: true` で本文も出す (AD-054)。過去ログは `getSubagentMessages` で補う (AD-055。agentId の取り方は U-8) | `forwardSubagentText` を渡さない (実行中の入れ子は tool の呼び出しだけ) / `getSubagentMessages` を使わない (AD-035 D3 のまま。過去ログの入れ子が空) / 実行中も `getSubagentMessages` で読む (ファイルの読み直しが要り、届いた順に出せない) |
| U-6 | ui の feature が session の契約を広げてよいか (domain をまたぐ) | 広げる。O-4 U-1・O-6 U-6 と同じく O-11 (ui) が持ち、session charter に記録する。承認の要求・応答と `SessionEvent` の種類は変えない | session の feature に切り出し、O-11 はその後に表示だけを作る |
| U-7 | Agent handoff の element を使うか (Principle XIII) | 使わない (Claude Code の subagent は会話の主導権を渡さない。入れ子は Subagent の表示。AD-056 Decision 5) | 入れ子の見出しに Agent handoff を使う |
| U-8 | 過去ログの subagent の agentId をどこから取るか (design で、SDK 0.3.270 の `getSessionMessages` に agentId を運ぶ構造が無いと分かった) | `listSubagents(sessionId)` で列挙し、`getSubagentMessages` の各メッセージの `parent_tool_use_id` (SDK が subagent の meta ファイルの `toolUseId` から付ける) で親の `Agent` の呼び出しと結ぶ。列挙の順番には頼らない。`AGENT_SDK_ALLOWED_CALLS` は 5 つで、2 つは `read-transcript.ts` でだけ呼べる。`parent_tool_use_id` が null・親の無い subagent は入れ子にしない (AD-055 Decision 1 / 2) | AD-055 を取り下げ `getSubagentMessages` を呼ばない (過去ログの入れ子が空のまま) / 構造の agentId が来たときだけ呼ぶ (SDK 0.3.270 では呼ばれない経路が残る) |
| U-9 | 帰属つき (`parent_tool_use_id` が文字列) の system のメッセージ (Hook・task・知らせなど) をどう描くか (design-gate H-03: spec は「入れ子だけに描く」、data-model は「捨てる」で食い違っていた) | `compact_boundary` だけ親の `children` に divider を足し、他は帰属の無い system と同じく主ループの行にする (今どおりの経路。捨てない。Principle XII / AD-035 Decision 5 の「欠落なし」)。SDK 0.3.270 の型では system は帰属を持たないので、subagent の中の Hook は今も主ループの行で出る。帰属つきで届いても見え方が変わらない | 入れ子の中に system-event の part として入れる (Subagent の表示は最小の 1 行を描けるが、`hook_started` と `hook_response` の合成を入れ子の中でも組む必要があり、SDK 0.3.270 では通らない経路のために合成を 2 つ持つ) / 捨てる (Hook の失敗が見えなくなる。US-1) |
| U-10 | 実行中の入れ子が上限 (1 つの tool-call の子 500 件・根の送り直し 1,000,000 バイト) に当たったときの見え方 (design-gate H-04) | 以後の子を足さず、親の tool-call の `truncated` を立てる。親の Subagent の表示 (入れ子の tool-call を含む) に今の切り詰めの印 (`ToolResultMarks`) が出る。親の `Agent` の呼び出しの結果は主ループの結果の送り直しの規則で今どおり埋まる。上限の後に最新の子を残す方式は採らない (Out of Scope) | 古い子の結果本文を落として最新の子を残す (送り直しの形が子の位置で変わり、過去ログの入れ子と形が分かれる。FR-011) / 根の送り直しから入れ子の tool の結果本文を外す (入れ子の tool の結果が実行中に見えない。AC5) |
| U-11 | 入れ子の user のメッセージの text を描くか (design-gate H-09: CLI が subagent に注入する合成の user メッセージ (Hook の追加の文脈・system reminder など) が DOM に出る経路になる) | 描かない。入れ子の user は tool_result だけを読む (主ループの「user の本文は送らない」(O-2。011 data-model §3 手順 4) と同じ)。過去ログの `getSubagentMessages` の user の記録も同じ (実行中と過去ログで同じ形。FR-011)。subagent への依頼の文は親の `Agent` の呼び出しの引数に出ている | user の text を出し `isSynthetic === true` だけを捨てる (`isSynthetic` を付けない合成の経路があると漏れる。過去ログの記録に `isSynthetic` が残るかも未確認) |

## Clarifications

### Session 2026-10-17 (夜間の自走。利用者は不在)

ポジティブリストの項目だけを `[ASSUMED]` で埋めた。それ以外の判断は上の U-n (2026-10-17 に承認)。

- Q: 一般の Hook の行の既定の見た目 → A: 成功した Hook は控えめの見た目、失敗・取り消しは注意の見た目 [ASSUMED: デフォルト表示状態]
- Q: 一般の Hook の読み上げ → A: 失敗・取り消しになった Hook だけを読む (成功は読まない。tool ごとに Hook が走ると読み上げが溢れる)。O-6 の「Hook / task の行の終わり」の読み上げのうち、SessionStart / Setup の Hook は今どおり [ASSUMED: 読み上げの量 (O-6 と同じくポジティブリストの文言・既定の振る舞いとして扱う)]
- Q: 名前を伏せた Hook の見分け方 → A: 「Hook ({hook_event})」に、同じターンの同じ `hook_event` の中の通し番号を添える (「Hook (PreToolUse) 2」) [ASSUMED: UI ラベル]
- Q: 後から背景に移った task の行の文言 → A: 背景で始まった task の行と同じ見た目に「背景に移した」を添える [ASSUMED: UI ラベル]
- Q: 背景の task のタブの名前と並び → A: タブ「背景の task」(見出しに件数)。並びは届いた一覧の順 (SDK の順のまま) [ASSUMED: UI ラベル・ソート順]
- Q: 前景で始まった task を後から背景に移すまで覚えておく数 → A: セッションごとに 256 件まで。超えたら古いものから忘れる (忘れた task が背景に移っても行は出ない) [ASSUMED: 数値の既定値]
- Q: 過去ログで `getSubagentMessages` で読む数 → A: 1 つの過去ログで 32 の subagent まで、1 つの subagent で 500 メッセージまで [ASSUMED: 数値の既定値]
- Q: 入れ子の subagent の既定の開閉 → A: 今の Subagent の表示の既定 (畳む) のまま [ASSUMED: デフォルト表示状態]

## User Scenarios & Testing

### User Story 1 - 実行された Hook が分かる (Priority: P1)

利用者は transcript で、tool の前後や応答の終わりに走った Hook と、その結果 (成功・失敗・取り消し) を見る。

**Why this priority**: D 節の Tier A (`general-hooks`)。Hook が tool を止めた・遅らせたことが見えないと、利用者は Claude Code の挙動を誤解して再送や中断を繰り返す。

**Independent Test**: agents の変換の単体 (偽の SDK のメッセージ) と行の component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中のセッション、**When** PreToolUse / PostToolUse / Stop などの Hook の `hook_started` が届く、**Then** SessionStart の Hook と同じ Hook の行が出て、`hook_response` で同じ行が成功・失敗・取り消しに書き換わる
2. **Given** `hook_name` が O-2 の allowlist の形 (`PreToolUse:Bash` など)、**When** 行を見る、**Then** 名前が出る。形に合わない・秘密を含みうる名前は出さず、「Hook ({hook_event})」と通し番号で見分けられる
3. **Given** Hook の出力本文・終了コード・`hook_progress`、**When** 届く、**Then** どれも DOM と `SessionEvent` に出ない
4. **Given** Hook が失敗した、**When** 見ているセッションで起きる、**Then** 支援技術に読み上げられる。成功した Hook は読み上げない
5. **Given** subagent の中の tool の前後で Hook が走った、**When** transcript を見る、**Then** AC1〜AC4 と同じ Hook の行が主ループに出る (入れ子の中に Hook の行は描かない。`parent_tool_use_id` 付きの Hook のメッセージが届いても同じ。U-9)

---

### User Story 2 - 背景で動いている task が分かる (Priority: P1)

利用者は、背景で動いている task (subagent・シェルのコマンド) を、始まり方にかかわらず transcript の行で見て、今動いているものの一覧を右のペインで確かめる。

**Why this priority**: D 節の Tier A (`late-backgrounded-task`)。前景で始まって背景に移った task は今は行が無く、動いているのに見えない。一覧が無いと、終わりの知らせを取りこぼした task が動いているように見え続ける。

**Independent Test**: agents の変換の単体・稼働中のストアの単体・タブの component テスト。

**Acceptance Scenarios**:

1. **Given** 前景で始まった task (`task_started` の `is_backgrounded` が false)、**When** `task_updated` の `patch.is_backgrounded` が true で届く、**Then** その task の行が「背景に移した」の印つきで出て、以後の更新と終わりが同じ行に合成される (実行中と過去ログ)
2. **Given** シェルの背景の task (`local_bash`)、**When** 行と一覧を見る、**Then** 説明 (コマンドそのもの) は出ず、起動した `Bash` の呼び出しのコマンドの名前 (O-1 の直近の活動の規則) で見分けられる。名前が取れなければ「シェル」だけ
3. **Given** `background_tasks_changed`、**When** 届く、**Then** 右のペインの「背景の task」のタブが、その一覧で置き換わる (ambient の task を除く)。見出しに件数が出る
4. **Given** セッションのプロセスが起動した (起動・再起動)、**When** タブを見る、**Then** 一覧は空から始まる。終了・失敗したセッションでは一覧を出さず「セッションは動いていません」の旨を出す
5. **Given** 一覧の task、**When** 見る、**Then** 止める・前面に戻す操作は無い (AD-049 Decision 6)

---

### User Story 3 - 実行中の subagent が何をしているかが分かる (Priority: P1)

利用者は、subagent の発言と tool の呼び出しを、親の `Agent` の呼び出しの中で、実行中も過去ログも同じ形の入れ子で読む。

**Why this priority**: D 節の Tier A (`subagent-nesting-live`)。今は実行中の subagent の tool の呼び出しが主ループの transcript に平らに並び、誰の操作か分からない。

**Independent Test**: agents の入れ子の単体 (偽の SDK のメッセージ)・過去ログの取得の単体 (偽の SDK)・Subagent の表示の component テスト。

**Acceptance Scenarios**:

1. **Given** 実行中に `parent_tool_use_id` 付きの assistant / user のメッセージが届く、**When** transcript を見る、**Then** 主ループに平らに出ず、親の `Agent` の呼び出しの入れ子に出る。subagent の text・thinking・tool の呼び出しと結果が、主ループと同じ表示で描かれる
2. **Given** subagent の中で subagent が起動した (多段)、**When** 見る、**Then** 入れ子が多段になる。深さの上限・親の無いメッセージ・自分を親にするメッセージは AD-035 Decision 5 の規則で描く (欠落させない)
3. **Given** 実行中に subagent の中の圧縮の境界 (divider) が届く、**When** 見る、**Then** 入れ子の中に出る (主ループの境界と取り違えない)。過去ログでは SDK が subagent の system の行を返さないので出ない (U-8)
4. **Given** subagent の本文が inline に無い過去ログで、`listSubagents` が列挙し `getSubagentMessages` の `parent_tool_use_id` が過去ログの `Agent` の呼び出しを指す subagent、**When** 開く、**Then** 読んだ本文が入れ子に出る。`parent_tool_use_id` が null・親の無い・読めない subagent は今どおり Task のカードと inline の分だけ
5. **Given** 実行中の入れ子の中の tool、**When** 結果がまだ来ない・来ないまま終わった、**Then** O-6 の結果待ち・結果不明の印が出る (主ループと同じ規則)
6. **Given** 実行中の入れ子が上限 (1 つの tool-call の子 500 件、または根の送り直し 1,000,000 バイト) に当たった、**When** 見る、**Then** 親の Subagent の表示 (または入れ子の tool-call) に切り詰めの印が出て、以後の子は足されない。親の `Agent` の呼び出しの結果は届く (U-10)
7. **Given** 入れ子の user のメッセージ (実行中と過去ログ)、**When** 見る、**Then** tool の結果だけが入れ子に出て、user の text (合成のものを含む) は出ない (U-11)

---

### Edge Cases

- Hook が tool ごとに走り行が多い → 1 行ずつ出す (まとめない)。成功は控えめの見た目 ([ASSUMED])
- `hook_response` が `hook_started` より先に届く → O-2 の合成の規則のまま (Hook の応答は行を作れる)
- `task_updated` の `is_backgrounded` が true だが、覚えている前景の task に無い (上限で忘れた・前のプロセス) → 行を作らない (一覧には出る)
- 一覧にあるが transcript に行の無い task → 一覧の行は種類だけで描く (名前は出さない)
- 一覧と transcript の行が食い違う (一覧は空なのに行は「実行中」) → 直さない。一覧は今動いているもの、行は起きたことを描く (AD-056 Consequences)
- subagent のメッセージが親の `Agent` の呼び出しより先に届く・親が知らない id → 主ループの位置に平らに出す (AD-035 Decision 5 の孤児と同じ)
- 拒否で取り消された主ループの応答の中の `Agent` の入れ子 → 親と一緒に外れる (O-6 の取り消しの規則)
- subagent の中の Hook・task・`informational` などの system のメッセージ → `parent_tool_use_id` を持っていても、`compact_boundary` (入れ子の divider) 以外は帰属の無いものと同じく主ループの行に出す (捨てない。入れ子に system の行を描かない。行の種類を増やさない。U-9)
- 実行中の入れ子が上限 (子 500 件・根の送り直し 1 MB) に当たる → 以後の子は足さず、親に切り詰めの印を出す。最新の子が見えなくなることは受け入れる (U-10。過去ログで開き直すと `getSubagentMessages` の上限 (500) まで読める)
- 主ループと subagent が同時に tool を走らせる → 経過時間 (O-4) は主ループの tool だけのまま。入れ子の tool は結果の状態の印だけ
- `getSubagentMessages` が空・失敗・上限を超えた → その subagent だけ inline の分で描き、過去ログ全体を失敗にしない

## Requirements

### Functional Requirements

#### 一般の Hook (US-1)

- **FR-001**: セッションの起動で query の options に `includeHookEvents: true` を渡さなければならない (AD-054。値はリテラルで、起動の入力から渡さない)
- **FR-002**: 一般の Hook の `hook_started` / `hook_response` を O-2 の Hook の行 (`toSystemEventMessage`) で描かなければならない。名前の allowlist の形の規則と、読まないフィールド (出力本文・終了コード) は O-2 のまま。名前を伏せた行は `hook_event` と通し番号で見分ける。規則の正本は data-model §1
- **FR-003**: 一般の Hook の行の見た目と読み上げを data-model §1 の規則にしなければならない (失敗・取り消しだけを読む。O-6 の読み上げの経路 (`TranscriptAnnouncer`) に足す)

#### 背景の task (US-2)

- **FR-004**: agents は前景で始まった task を覚え (上限は data-model §2)、`task_updated` の `patch.is_backgrounded` が true になったときに task の行を開かなければならない。過去ログの変換 (`transcript.ts`) も同じ規則で行を作る。行の中身は背景で始まった task の行と同じ規則 (`local_bash` は説明を出さない)
- **FR-005**: シェルの背景の task の行と一覧の行に、起動した `Bash` の呼び出し (`task_started` の `tool_use_id`) のコマンドの名前を出さなければならない。名前の規則は O-1 の直近の活動 (`summarizeToolInput`) をそのまま使い、説明・引数を出さない。正本は data-model §2
- **FR-006**: agents は `background_tasks_changed` を `meter` の種類 `background-tasks` (task の id と種類の列。説明を運ばない。ambient を除く) で送り、renderer は稼働中のストアの `meters` に最新の 1 つを置き換えで持ち、右のペインのタブ「背景の task」(概要・使用量・構成・会話の地図の後の 5 つ目) に描かなければならない (U-3。AD-056 Decision 2)。セッションのプロセスの起動で空に戻し、永続化しない。O-4 の `meter` の上限と間引きの扱い・タブのキーボード操作の正本は data-model §2

#### 実行中の subagent の入れ子 (US-3)

- **FR-007**: セッションの起動で query の options に `forwardSubagentText: true` を渡さなければならない (AD-054)
- **FR-008**: agents は `parent_tool_use_id` が null でない assistant / user のメッセージを主ループのメッセージとして送らず、親の `Agent` の呼び出しの `children` に入れて、親のメッセージを同じ id で送り直さなければならない (O-2 の tool の結果の送り直しと同じ形)。入れ子の user のメッセージは tool_result だけを読み、user の text を送らない (O-2 の「user の本文は送らない」のまま。U-11)。上限に当たったら以後の子を足さず親の `truncated` を立てる (U-10)。本文の無害化・入れ子の健全性 (id・孤児・自己参照・深さの上限)・送り直しの上限は AD-035 Decision 4 / 5 / 6 と O-2 の規則を継ぐ。子のメッセージの `createdAt` は主ループと同じ AD-051 の規則で埋める (表示はしない)。正本は data-model §3
- **FR-009**: 入れ子の中の tool の結果・圧縮の境界・結果待ちと結果不明の印を、主ループと同じ表示で描かなければならない。`parent_tool_use_id` を持つ system のメッセージは、`compact_boundary` だけを入れ子の divider にし、他は帰属の無いものと同じく主ループの行にする (U-9。data-model §3)
- **FR-010**: 過去ログの取得 (`read-transcript.ts`) は、`listSubagents` で agentId を列挙し、`getSubagentMessages` で読んだ本文を、各メッセージの `parent_tool_use_id` が指す親の `Agent` の呼び出しに、過去ログの変換と同じ規則で入れ子にしなければならない (AD-055 / U-8。上限は data-model §3)。列挙の順番で結ばず、tool の結果の文面を解析しない。親の呼び出しに inline の子が既にある subagent は重ねない。subagent の user の記録は tool_result だけを読む (FR-008 と同じ。U-11)
- **FR-011**: Subagent の表示は、実行中と過去ログで同じ入れ子の形 (DTO の `children`) を描かなければならない。`TRANSCRIPT_PART_FIELDS` は変えない

#### 境界の検査・対応表と記録

- **FR-012**: 完了の PR で `docs/ui-coverage.md` を data-model §4 のとおりに書き換えなければならない: D 節の 3 行を `実装済み` (**ただし各行は quickstart の実機の記録が「届いた」であることを条件にする**: general-hooks は V-1 (一般の Hook の行が出た)、late-backgrounded-task は V-3 (`patch.is_backgrounded` が届き「背景に移した」の行が出た)、subagent-nesting-live は V-4 (subagent のメッセージが `parent_tool_use_id` 付きで届き入れ子に出た)。記録が無い・「届かない」の行は `実装済み` にせず、`後続: O-11` のまま完了の PR を出さずに利用者に返す (plan RK-06))、`get_hooks_listing` を `表示不要` (AD-056 Decision 4)、`background_tasks_changed` を `実装済み`、Tier B の `後続: O-11` の行を `後続: O-12`、F 節の Background runs / Agent handoff / Task card の備考を直す。quickstart で過去ログに Hook / task の行が残ると確かめた行は経路を「両方」に直す。項目 21 の出力で割当先が O-11 の行が 0
- **FR-013**: `QUERY_OPTION_KEYS` の pin テスト (`src/agents/session-core.test.ts`) を AD-054 の集合 (AD-053 の `onElicitation` を含む 11 キー) に、`AGENT_SDK_ALLOWED_CALLS` を AD-055 の集合 (5 つ) に直し、`getSubagentMessages` を `read-transcript.ts` の外で呼ぶ fixture と `listSubagents` を `read-transcript.ts` の外で呼ぶ fixture、SDK を import したファイルの 2 つ目の import 文で呼ぶ fixture、許可の名前の別名 (`getSubagentMessages as getSessionMessages`) で呼ぶ fixture で項目 14 が発火することを固定しなければならない (項目 14 はファイル中のすべての名前付き import を、import した名前で照合する。design-gate H-10)。`METER_UPDATE_TYPES` の固定テストを 1 つ増えた集合にする
- **FR-014**: 完了の PR で roadmap に **O-12「知らせの類・Checkpoints・中身のブロックの表示」**(M3・順 21・`ui`・依存 O-11) を登録し (範囲は「本 feature の位置づけ」の更新案)、M4 / M5 の順を振り直し、O-11 の行を本 feature の範囲と結論に直さなければならない (U-1。AD-044 の「後続 feature は roadmap に登録する」)
- **FR-015**: AD-054 / AD-055 / AD-056 (2026-10-17 に利用者が承認し accepted) を、session charter (O-11 の項) と ui charter に記録しなければならない
- **FR-016**: 導入した用語と判断を記録に反映しなければならない (Principle XIV): glossary (一般の Hook・背景の task の一覧・後から背景に移った task)・`_overview.md` (O-12 の帰属)・`docs/prompts.md` (O-12 の起動文)・roadmap の O-8 の行の (c) (一般の Hook と subagent の本文で `receivedMessages` の基準が変わる。`background-tasks` は `meter` なので数えない)

### Key Entities

- **一般の Hook の行**: SessionStart / Setup 以外の Hook の開始と結果。O-2 の Hook の行と同じ category。正本は data-model §1
- **背景の task の一覧**: `background_tasks_changed` の最新の 1 つ (置き換え)。task の id と種類。稼働中のストアの `meters` にだけあり、永続化しない。正本は data-model §2
- **subagent の入れ子**: 親の `Agent` の呼び出しの `children`。実行中は agents が stream から、過去ログは取得プロセスが組む。正本は data-model §3

### Assumptions / Clarifications

- **[承認済み U-1〜U-11 (2026-10-17)]** 上の「判断」の表。AD-054 / AD-055 / AD-056 (accepted)。U-9〜U-11 は design-gate (round 1) の H-03 / H-04 / H-09 の修正で足した
- **[ASSUMED]** 8 件 (Clarifications の Session 2026-10-17): 一般の Hook の見た目・一般の Hook の読み上げの量・伏せた Hook 名のラベル・後から背景に移った task のラベル・タブの名前と並び・前景の task を覚える数・`getSubagentMessages` で読む数・入れ子の既定の開閉
- **design の回答 (2026-10-17。`.needs-input.md` の Q1 / Q2)**: Q1 → U-8。Q2 → U-1〜U-8 と 3 つの ADR は仮採用のまま design-gate まで進め、実装には入らない (FR-015 の承認は実装の前)。承認は 2026-10-17 に得た (上の「判断の一覧」)
- V-4 の未記録の項目 (`hook_name` の形・過去ログに Hook / task の行が残るか) は未確認として扱い、quickstart で記録する。それまで両方の形に耐える規則にする (O-2 の名前の allowlist・過去ログの変換は実装済み)
- SDK 0.3.270 の過去ログの経路 (`getSessionMessages`) は agentId を構造で渡さない (design で確かめた。`sdk.d.ts:5903-5916`)。agentId は `listSubagents` で取り、親とは `getSubagentMessages` の `parent_tool_use_id` (`sdk.mjs:202`) で結ぶ (U-8)。subagent の system の行 (圧縮の境界) は `getSubagentMessages` が返さないので、過去ログの入れ子に出ない

## Success Criteria

- **SC-001**: **一般の Hook が出る。** US-1 の AC1〜AC4 のとおりになり、Hook の出力本文・終了コードの目印の値が `SessionEvent` と DOM に 0 件。計測経路: agents の変換の単体 + 行と読み上げの component テスト
- **SC-002**: **背景の task が見える。** US-2 の AC1〜AC5 のとおりになり、`local_bash` の説明の目印の値が行・一覧・`meter` に 0 件。`background-tasks` の `meter` のフィールドが id と種類だけ。計測経路: agents の単体 + 稼働中のストアの単体 + タブの component テスト (vitest-axe の違反 0)
- **SC-003**: **実行中と過去ログで subagent が入れ子になる。** US-3 の AC1〜AC7 のとおりになり、`parent_tool_use_id` を持つ assistant / user のメッセージが主ループの transcript に 0 件 (孤児を除く)。入れ子の user の text (`isSynthetic` のもの・Hook の出力の目印を持つものを含む) の目印が `SessionEvent` と DOM に 0 件。tool の結果の文面の偽の agentId で入れ子が作られず、`listSubagents` の列挙の順番を入れ替えても入れ子が変わらない。計測経路: agents の入れ子の単体 + `read-transcript.ts` / `transcript.ts` の単体 (偽の SDK) + Subagent の表示の component テスト
- **SC-004**: **境界の広がりが ADR の範囲に収まる。** `QUERY_OPTION_KEYS` が AD-054 の集合 (11 キー)、`AGENT_SDK_ALLOWED_CALLS` が AD-055 の 5 つ (うち 2 つは `read-transcript.ts` でだけ)、`METER_UPDATE_TYPES` が 1 つ増えた集合で、固定テストと項目 14 / 16 の fixture が通る。`SessionEvent` の種類・`TRANSCRIPT_PART_FIELDS`・`PermissionRequest`・`toPermissionResult`・IPC・preload・main の差分が 0、`Query` の呼び出しは `interrupt` だけ。計測経路: 固定テスト + `node scripts/constitution/check.mjs` + `git diff` (quickstart)
- **SC-005**: **対応表の O-11 の行が無くなり、M3 の Tier A の残りが 0。** 2 つの部分に分ける:
  - (自動) 項目 21 が通り、出力で割当先が O-11 の行が 0、M3 の完了の条件の行が 0、O-12 の行が数えられている。計測経路: `node scripts/constitution/check.mjs`
  - (手で記録) D 節の 3 行を `実装済み` にした根拠として、quickstart の V-1 / V-3 / V-4 の記録が「届いた」である (FR-012 の条件。未記録・「届かない」の行があれば自動の部分は成り立たないまま利用者に返す)。あわせて `hook_name` の実際の形・過去ログの Hook / task の行の有無・subagent の system の帰属 (V-5)・`listSubagents` が入れ子の subagent のファイルを列挙するか (V-6) を記録する。計測経路: `quickstart-results.md`

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): Hook / task の行の変換と合成 (`toSystemEventMessage` / `mergeSystemEvent`)・名前の allowlist・tool の結果の送り直し・対応表と項目 21。FR-008 / FR-009 (行と結果の経路) をそのまま継ぐ
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)): `meter` (`METER_UPDATE_TYPES`) と上限・`live-signals.ts` の行の組み立て・task の進み具合・タブのキーボード操作 (AD-047)
- **O-6** ([016](../016-ui-boundaries-and-tool-displays/spec.md)): 結果待ち・結果不明の印と読み上げ (`TranscriptAnnouncer`)・取り消し・圧縮の境界 (AD-049)
- **O-1** ([010](../010-session-monitoring-view/spec.md)): 直近の活動のコマンドの名前の規則 (`summarizeToolInput`。FR-005 はこれを継ぐ)
- **O-7** ([013](../013-ui-app-shell/spec.md)): 右のペインのタブの表 (AD-046)
- **O-9** ([017](../017-ui-conversation-time-and-activity/spec.md)): メッセージの時刻 `createdAt` (AD-051。入れ子の子のメッセージも埋める)・右のペインのタブ「会話の地図」(本 feature のタブはその後に並ぶ)・活動の帯 (主ループのメッセージの tool-call だけを数える。入れ子の tool は数えない)
- **O-10** ([018](../018-session-answer-ui-and-composer-commands/spec.md)): `QUERY_OPTION_KEYS` の `onElicitation` (AD-053。本 feature はその和集合で pin を直す)・category `elicitation` (`SYSTEM_EVENT_CATEGORIES` の数の起点)・`SessionEvent` の種類 9 (本 feature は変えない)
- **R-4** (004): Subagent の表示・DTO の `children`・入れ子の健全性 (AD-035)
- **X-1 / X-4** (005 / 008): query の options の正の構成 (AD-036 §4 / AD-041 (g))

## Out of Scope

- O-12 に送ったもの (Tier B の知らせの類・Checkpoints の表示・File element・`server_tool_use` / `web_search_tool_result`・B 節の機械照合・過去ログへの O-6 / O-10 の行の変換)
- 入れ子の中のメッセージの時刻の表示と、入れ子の tool を O-9 の活動の帯に数えること
- task・チェックポイントの操作 (止める・前面に戻す・巻き戻し。AD-049 Decision 6)
- Hook の設定の一覧 (`get_hooks_listing`。U-2) と Hook の出力本文
- 計画の一覧 (TodoList のタブ。U-4)
- 入れ子の中の tool の経過時間 (O-4 の主ループの規則のまま)
- 実行中の入れ子が上限に当たった後に最新の子を残す方式 (U-10。送り直しの形が子の位置で変わり、過去ログの入れ子と形が分かれる)
- 入れ子の中の system の行 (Hook・task・知らせ) と user の text (U-9 / U-11)
- 一般の Hook と subagent の本文を起動のダイアログで切り替える設定 (AD-054 Alternatives)
