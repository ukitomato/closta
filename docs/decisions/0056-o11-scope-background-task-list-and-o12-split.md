---
status: accepted
date: 2026-10-17
id: AD-056
deciders: ukitomato
tags: [ui, session, scope, background-task]
supersedes: []
superseded-by: []
---

# AD-056: 背景の task の一覧・Hook の一覧と計画の一覧を作らないこと・O-12 への分割

本 ADR は O-11 ([spec 019](../../specs/019-ui-hooks-tasks-subagents-and-notices/spec.md)) が夜間の自走で起こした (spec 019 の U-1 / U-3 / U-4 / U-6 / U-7)。design-gate (round 1) の H-01 / H-07 / H-08 で Decision 2 の括弧書き・持ち主と保持の書き分け・AD-044 Decision 6 の読み替え 2 行を直した。本 ADR と spec 019 の U-1〜U-11 は 2026-10-17 に利用者が承認した。承認の記録の前に、main にマージされた O-9 / O-10 との突き合わせで、Decision 1 に O-10 の `elicitation_complete` の行の過去ログの変換 (roadmap の O-11 の行に O-10 が足した義務) を、Consequences にタブの数を足した。

## Context

[AD-049](0049-boundaries-retraction-and-o11-split.md) Decision 1 は O-11 に、Hook・背景の task・実行中の subagent の入れ子と、Tier B の知らせの類・Checkpoints・File element・`server_tool_use` / `web_search_tool_result`・対応表の B 節の機械照合・過去ログへの O-6 の行の変換を送った。1 つの spec では FR が 20 を超え、単体で確かめられる機能が 2 つ入る (Tier A 3 行を出す表示と、Tier B の表示の類)。

[AD-044](0044-ui-coverage-assignment.md) Decision 6 は「Hook / Background task を session の責務に含めない。状態は保持せず transcript の 1 行として ui が描く」と答え、実行中の task の一覧の要否を後の feature (今は O-11) に残した。SDK の `background_tasks_changed` は生きている背景の task の全体を毎回送る (置き換えの意味。プロセスの起動時は空から始める。`sdk.d.ts:3422-3442`)。

制御要求 `get_hooks_listing` は CLI の `/hooks` メニューが描く Hook の設定の一覧を返す (`sdk.d.ts:3762-3767`)。呼ぶなら [AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P3 (`Query` は `interrupt()` だけを呼ぶ) の読み替えが要る。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-049 Decision 1 (Tier B の知らせの類などの持ち主は O-11) | 持ち主を O-12 にする (Decision 1)。AD-049 の本文は変えない |
| AD-044 Decision 6 の回答 (状態は保持しない) | 背景の task の一覧の最新の 1 つだけを稼働中のストアの計量 (`meters`) に持つ (Decision 2)。永続化しない。transcript の行は今どおり |
| AD-044 Decision 6 の回答 (Hook / Background task を session の責務に含めない) | 表示と feature の持ち主は `ui` のまま。ただし一覧の保持は session の契約 (`meter` の種類 `background-tasks`・稼働中のストアの `meters`) に置く (O-4〜O-6 の `meter` と同じ形。glossary の Meter の「`session` (契約と保持) / 表示は `ui`」)。session が持つのは id と種類の最新値の置き換えだけで、task の操作・状態の遷移の判断は持たない (Decision 2) |
| AD-044 Decision 6 の回答 (session は agents で無害化して通す経路だけを持つ) | agents は後から背景に移った task の行を作るため、前景で始まった task の種類 (`task_type`)・説明 (`description`。`local_bash` 以外の行の名前にだけ使う)・起動の id (`tool_use_id`) を、セッションスレッドごとに上限つき (256 件・古いものから忘れる)・永続化しない形で覚える。過去ログの変換は 1 回の変換に 1 つの同じ記憶を使う (domain の `foreground-tasks.ts`)。覚えた値は行を作るためだけに使い、`SessionEvent` にそのまま運ばない |
| [AD-047](0047-session-meter-and-failure-reasons.md) Decision 2 (`meter` は数・真偽・列挙・モデルの id だけを運ぶ) | 種類 `background-tasks` は task の id の列と種類 (`task_type`) を運ぶ (Decision 2)。説明 (`description`) は運ばない。O-6 の `retraction` (id の列) と同じ扱い |

## Decision

1. **O-12 に分ける。** Tier B の知らせの類 (`notification` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `tool_use_summary` / `active_goal`)、Checkpoints の表示 (`files_persisted`。巻き戻しはしない)、`user/document` の File element、`server_tool_use` / `web_search_tool_result`、対応表の B 節の機械照合、過去ログへの O-6 の行 (`informational`・拒否・会話の作り直し) と O-10 の行 (`elicitation_complete`。category `elicitation`) の変換を、新しい feature O-12 (M3・`ui`・依存 O-11) にする。どれも Tier B の行なので、M3 の完了の条件に数えない (AD-044 Decision 3)。O-11 の完了の PR で対応表のこれらの行を `後続: O-12` に書き換え、roadmap に O-12 の行を足す
2. **背景の task の一覧を作る。表示と feature の持ち主は `ui`、保持は session の契約。** 一覧は右のペインのタブで、`background_tasks_changed` の最新の 1 つを稼働中のストアの `meters` に置き換えで持つ (ambient の task を除く。セッションのプロセスが起動したら空に戻す)。agents は `meter` の種類 `background-tasks` で task の id と種類だけを送る。説明・コマンドは送らず、一覧の各行の名前は同じ id の transcript の task の行 (O-2 の規則で無害化済み。`local_bash` は説明を出さず、起動した `Bash` の呼び出しのコマンドの名前 (O-1 の直近の活動と同じ、秘密の形を弾く規則。spec 019 FR-005) だけを出す) から引く。session の契約 (`METER_UPDATE_TYPES` に 1 つ) を広げるのは O-4 / O-5 / O-6 と同じく ui の feature が持ち、session charter に記録する。一覧から task を止める・前面に戻す操作は付けない (AD-049 Decision 6)
3. **計画の一覧 (TodoList のタブ) は作らない。** `TaskCreate` / `TaskUpdate` は呼び出しごとに TodoList の 1 項目で描き (O-6)、全体は `TaskList` の結果で読める。右のペインのタブの候補の TodoList (O-7 から) は足さない
4. **`get_hooks_listing` を呼ばない。** Hook は実行されたときに transcript の行で出る。設定の一覧は Claude Code の `/hooks` で見られ、アプリの範囲 (表示) の外である。AD-036 §4 P3 は読み替えない。対応表の行は `表示不要` にする
5. **Agent handoff の element は使わない。** Claude Code の subagent は親に結果を返すだけで、会話の主導権を渡さない。入れ子は Subagent の表示 (AD-035) で描く。対応表の F 節の行は `未使用` のまま、理由を備考に書く

## Consequences

- M3 の完了は O-11 だけを待つ (O-12 は待たない)。roadmap の M4 / M5 の順を 1 つずつ振り直す
- `METER_UPDATE_TYPES` が O-6 の後の 9 から 1 つ増える。右のペインのタブが 1 つ増える (概要・使用量・構成・会話の地図 (O-9) の 4 つから 5 つ。O-4 のタブのキーボード操作に従う)
- 一覧 (置き換えの最新) と transcript の task の行 (開始と終わりの出来事) は、届く順が決まっていないので一時的に食い違いうる。一覧は「今動いているもの」、行は「起きたこと」として別に描く

## Alternatives

- **分けない** — FR が 20 を超え、Tier B の表示の判断が Tier A 3 行の完了を遅らせる
- **一覧を作らない** — 行の終わり (`task_notification`) を取りこぼすと、動いていない task が「実行中」に見え続ける。SDK はそれを避けるために置き換えの一覧を送っている
- **一覧の feature の持ち主を `session` にする** — 一覧は表示のための最新値で、session が持つのは O-4〜O-6 の `meter` と同じく値の契約と保持だけである。AD-044 Decision 6 から読み替えるのは保持の置き場 (上の「読み替える箇所」) だけで、task の操作 (止める・前面に戻す。AD-049 Decision 6) と状態の遷移の判断は今どおり session に持たせない。O-4〜O-6 の前例と同じく ui の feature が契約の拡張を持ち、session charter に記録する
- **一覧を中央のヘッダの件数だけにする** — 何が動いているかが分からない。件数はタブの見出しに出す
- **`get_hooks_listing` で設定の一覧を出す** — `Query` の呼び出しを広げる (P3 の読み替え) のに、利用者の判断に要る情報は増えない

## Confirmation

- spec 019 の SC (一覧の置き換え・起動で空に戻る・ambient を除く・説明を運ばない `meter` の固定テスト、対応表の項目 21 の出力で `後続: O-11` が 0)
- `METER_UPDATE_TYPES` の固定テストが 1 つ増えた集合と一致する
- 項目 16 の `Query` の呼び出しが `interrupt` だけのまま
