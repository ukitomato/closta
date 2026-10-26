---
status: accepted
date: 2026-10-22
id: AD-060
deciders: ukitomato
tags: [ui, sdk, constitution, coverage]
supersedes: []
superseded-by: []
---

# AD-060: 対応表の B 節 (中身のブロック) の機械照合と、知らないブロックの印

本 ADR は O-12 ([spec 022](../../specs/022-ui-notices-checkpoints-and-content-blocks/spec.md)) の plan で起こした (spec U-7 / U-8)。spec の U-1〜U-13 と本 ADR は、夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用し、2026-10-22 に accepted とした。規則の詳細の正本は [data-model.md](../../specs/022-ui-notices-checkpoints-and-content-blocks/data-model.md) §2 / §3 で、本 ADR は決定と読み替えだけを書く。調査は [research.md](../../specs/022-ui-notices-checkpoints-and-content-blocks/research.md) R-01 / R-02 / R-12。

## Context

- [AD-044](0044-ui-coverage-assignment.md) Decision 4 は、対応表の B 節 (assistant / user のメッセージの content block) を機械照合の外にした。型は `@anthropic-ai/sdk` の union にあり、照合を Agent SDK の外に広げることになるためである。照合は O-6 の design で O-11 に、O-11 の design で O-12 に送られた ([AD-049](0049-boundaries-retraction-and-o11-split.md) Decision 1 / [AD-056](0056-o11-scope-background-task-list-and-o12-split.md) Decision 1)
- Agent SDK 0.3.270 の `sdk.d.ts` は `SDKAssistantMessage.message` を `@anthropic-ai/sdk` の `BetaMessage`、`SDKUserMessage.message` を `MessageParam` として import している。Agent SDK が emit する content block の集合は、この 2 つの型の `content` の union で決まる
- `@anthropic-ai/sdk` 0.125.0 (Agent SDK の peer。`nodeLinker: hoisted` で `node_modules/@anthropic-ai/sdk` に入る) の union は assistant 側 17・user 側 16 のメンバーを持つ。今の B 節は 10 行で、23 行が足りない
- 専用の表示を持たないブロックは、実行中の assistant (`live-message.ts`) と過去ログ (`transcript.ts`) の `default:` で黙って捨てている (実行中の user のメッセージと過去ログの subagent の user の記録は、知らないブロックに限らず tool_result のほかを読まない経路である)。行を `表示不要` にすると、捨てていることを対応表で追認するだけで、新しいブロックが届いても利用者に見えない (Principle XII)

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-044 Decision 4 の表の B 節「機械照合しない」 | 照合する (Decision 1)。照合の基準は Agent SDK の型が参照する `@anthropic-ai/sdk` の union |
| AD-044 Decision 4 の「対応表に書いた SDK の版が入っている SDK と一致すること」 | Agent SDK の版に加え、`@anthropic-ai/sdk` の版も照合する (Decision 2) |
| Constitution Principle XII の Verification (Automated) の「A・C・E 節」 | 「A・B・C・E 節」に改める。照合の範囲を広げる改定なのでバージョニング方針表の「指針の実質的な拡張 = MINOR」に当たり v1.5.0 とする。改定手順 2 (人間レビュー) を経るため、本 ADR を実装する PR (spec 022) には入れず、利用者のレビューの後に別の PR で行う (spec U-12)。それまで項目 21 は字面より多くを照合するが、字面に反しない |

## Decision

1. **B 節は、Agent SDK の型が参照する union のメンバーの `type` の集合と照合する。** `sdk.d.ts` の import から `BetaMessage` と `MessageParam` の型のファイルを決め、`content` の union (`BetaContentBlock` / `ContentBlockParam`) の各メンバーの `type` の literal を読む。識別子は `<role>/<type>`。足りない行・余る行・辿れない参照 (import・型の形が変わった) は Constitution 検証の項目 21 の違反にする。読めた名前の数の下限 (`LOWER_BOUNDS.B`) を置く
2. **対応表の冒頭に `@anthropic-ai/sdk` の版を書き、入っている版と照合する。** 読む経路は `node_modules/@anthropic-ai/sdk/` (cwd から。hoisted の配置)。依存に直接足さない (Agent SDK が実際に参照する版とずれさせない)。Agent SDK を上げる PR は、peer の版が変わったら B 節も同じ PR で直す (AD-044 Consequences の手順に B 節を足す)
3. **専用の表示を持たない content block は捨てず、種類の名前だけの 1 行の印 (UnsupportedBlockMark) を出す。** 経路は assistant のブロック (実行中と過去ログ。subagent の assistant を含む) と過去ログの主ループの user のブロックで、DTO の part `unsupported-block` (種類の名前だけ。形の検査に外れたら空) にする。ブロックの中身は運ばない。印で描く行の割当は `実装済み: UnsupportedBlockMark (<経路>)` (Tier B)。実行中の user のメッセージと過去ログの subagent の user の記録は今どおり tool_result だけを読み、印を出さない (user の content を読まない経路。spec U-10)
4. **Claude Code の会話に現れない組み合わせ (user の `tool_use` など) の行は `表示不要: <理由>` にする。** ただし過去ログの user の記録は許可一覧 (`text` / `image` / `document` / `tool_result`) の外を印にする (role を見る。spec U-11) ので、届けば見える (割当は「表示を作らない」理由であり、捨てることの追認ではない)

## Considered options

- **(採用) Agent SDK の型が参照する union を辿る**: SDK の版を上げたときに足りない行が検出され、照合の範囲が Agent SDK の emit (AD-020 Decision 1 の分母) から外れない
- **今の B 節の 10 行を固定の一覧として照合する**: SDK の版を上げても足りない行が検出されない (spec U-7 (b))
- **照合しない (AD-044 Decision 4 のまま)**: roadmap の O-12 の義務を満たさない (spec U-7 (c))
- **知らないブロックを今どおり捨て、行を `表示不要` にする**: 捨てていることを割当で追認するだけ (spec U-8 (b))
- **ブロックごとに専用の表示を作る**: Tier B の行のために表示が増え、1 feature に収まらない (spec U-8 (c))

## Consequences

- 項目 21 の入力が 3 つ増える (`@anthropic-ai/sdk` の 2 つの型のファイルと `package.json`)。pnpm の配置が hoisted でなくなると入力が無くなって違反になる (CI で気づける)
- Constitution Principle XII の Verification の字面は、利用者のレビューの後の別の PR で v1.5.0 (MINOR) として改める (持ち越しは roadmap の O-12 の行)。改定の時点で B 節は 33 行で照合が ok (既存違反 0) なので、これまで適合していた状態が違反になることは無い (MAJOR に当たらない理由)
- 新しいブロックが SDK に足されると、照合が落ち、変換は印を出す。表示を作るかは対応表の行の割当で判断する

## Confirmation

- `node scripts/constitution/check.mjs` の項目 21 が B 節を照合して ok (33 行)、`tests/ui-coverage/coverage.test.ts` の B 節の fixture (足りない・余る・版が違う・入力が無い・型が読めない・参照が変わった) で違反
- 変換の単体テストで、B 節の各行のブロックが Decision 3 の経路で専用の表示の part か `unsupported-block` のどちらかになり (0 件で消えるブロックが無い)、印を出さない 2 つの経路では tool_result だけが part になる (経路ごとの表。spec SC-004)
