---
status: proposed
date: 2026-10-04
id: AD-049
deciders: ukitomato
tags: [ui, sdk, scope]
supersedes: []
superseded-by: []
---

# AD-049: 会話の境界の表示・拒否の取り消し・Agent plan の markdown と、O-11 への分割

## Context

O-6 ([spec 016](../../specs/016-ui-boundaries-and-tool-displays/spec.md)) は `docs/ui-coverage.md` で `後続: O-6` の 30 行 (Tier A 14) と、O-2 の pr-gate と実機の目視 (V-4) から回した宿題を持つ。1 つの spec では FR が 20 を超え、3 つの ADR の判断 (`includeHookEvents`・`getSubagentMessages`・Background task の一覧の持ち主) が混ざる。

あわせて次の 3 点は、先行の決定に触れる。

- SDK の `model_refusal_fallback` は「`retracted_message_uuids` のメッセージを transcript の状態から外せ」と指示する (`sdk.d.ts:5044`)。今の稼働中のストアはメッセージを外す経路を持たない
- `informational` の `content` は Hook が prompt を止めた理由などで、会話・Hook の設定由来の文字列である。O-2 は Hook の出力本文を出さないと決めた
- [AD-035](0035-tier-a-tool-display-and-subagent-nesting.md) D6 は Agent plan を plain text で描くとし、Trade-off に「rich markdown 化は将来課題」と書いた

本 ADR は O-6 が夜間の自走で起こした。**未承認である (spec 016 の U-1〜U-5)。** [AD-046](0046-app-shell-layout.md) / [AD-047](0047-session-meter-and-failure-reasons.md) (proposed) を前提にする。

## Decision

1. **O-11 に分ける。** 一般の Hook と `includeHookEvents` (AD-041 (g) の読み替え)・`get_hooks_listing`、Background task の一覧の要否と `background_tasks_changed` / `background_tasks` / `stop_task`、後から背景に移った task、シェルの Background task の見分け、実行中の subagent の入れ子 (`getSubagentMessages`。Agent SDK の呼び出しの許可リストの追加)、Tier B の知らせの類、Checkpoints、File element、`server_tool_use` / `web_search_tool_result`、B 節の機械照合、V-4 の未記録の項目の確認を、新しい feature O-11 (M3・`ui`・依存 O-6) にする。O-11 は design の前に `includeHookEvents` と `getSubagentMessages` の ADR を起こす
2. **拒否の取り消しを実行中の transcript から外す。** agents は id の列 (形の検査と件数の上限) を AD-047 の `meter` の種類 `retraction` で送り、renderer の稼働中のストアが該当のメッセージを外す (冪等)。過去ログは記録のまま
3. **`informational` の本文を出す。** 本文と同じ無害化・1 行・300 コードポイント・`mayCarrySecret` で隠す (止まった理由が分からないと判断を誤る。Tier A)。O-2 の「Hook の出力本文を出さない」は `hook_response` の `output` / `stdout` / `stderr` の話で、変えない
4. **Agent plan を markdown で描く。** R-3 の `MarkdownText` (生 HTML を描かない・URL の allowlist) を通す。AD-035 D6 の Trade-off の「将来課題」をここで実施する (AD-035 の本文は変えない)

## Consequences

- M3 の完了の条件から O-6 の Tier A 14 行が消え、O-11 は Tier B 中心の M3 の feature になる
- `meter` の種類に `retraction` が加わる (AD-047 の許可リストに id の列の行を足す)
- 過去ログを開いたとき、拒否で取り消されたメッセージは記録どおり残る (実行中と過去ログで見え方が違いうる)

## Alternatives

- **全部を O-6 に** — FR が 20 を超え、ADR の判断が混ざる
- **取り消しを外さず印を付ける** — SDK の指示 (transcript の状態から外す) に反し、拒否された部分の応答が会話の一部に見える
- **`informational` を出さない** — 止まった理由が分からない
- **Agent plan を plain text のまま** — plan の構造 (見出し・箇条書き) が読めない

## Confirmation

- spec 016 の SC-001 / SC-002 / SC-005
- O-11 の design の前に、Decision 1 の 2 つの ADR が起きていること
