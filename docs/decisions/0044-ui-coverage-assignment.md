---
status: accepted
date: 2026-10-03
id: AD-044
deciders: ukitomato
tags: [ui, sdk, constitution, scope]
supersedes: []
superseded-by: []
---

# AD-044: ui-coverage 対応表の割当と機械照合

## Context

Constitution Principle XII は「SDK のメッセージ型・tool 名・システムイベントの対応表を `docs/ui-coverage.md` に維持し、各項目に表示実装を割り当てる。未割当が残っている間、UI 系 feature を completed にしてはならない」と定める。[AD-020](0020-sdk-emitted-message-inventory.md) Decision 1 は、対応表の行を SDK の型定義から機械的に導き、分母を `SDKMessage` の 39 型と control 経路にすると決めた。対応表は O-2 ([spec 011](../../specs/011-ui-coverage/spec.md)) で作る。

O-2 の調査 (2026-10-03) では、39 型のうち表示に届いているのは 4 型で、実行中は tool の結果も捨てていた。O-2 の範囲で全部の表示を実装すると 1 feature に収まらない。利用者は O-2 の design-gate の前後で次を決めた (2026-10-03)。

- O-2 は対応表・機械照合・reviewer と、一部の表示 (実行中の tool の結果、Hook / Background task の行) に限り、残りの表示は後続 feature (O-4 / O-5 / O-6。domain `ui`) に割り当てる
- 後続 feature の ID を書いた行は「割当済み」とみなす
- ToolFallback (汎用の表示) だけで出る行を「実装済み」にできるのは Tier B / C に限る
- Constitution XII / XIII を本 ADR を根拠に改める (MINOR)

これは XII の「割当」の意味を、表示実装だけから「表示実装・後続 feature・表示不要の理由」に広げる決定であり、M3 (差配できる = 未表示ゼロ) の完了の判定と、今後のすべての UI 系 feature の completed の判定を左右する。Constitution の改定手順 1 に従い、議論を本 ADR に記録する。

本 ADR は O-2 の実装中に proposed で起こし、**2026-10-03 に利用者が accepted にした**。Decision 3 (M3 の完了の条件を「割当先が M3 の feature の行」に限る) は design-gate R2 po H-101 を受けた設計判断で、accepted の時点で利用者が確かめた。

## Decision

### 1. 割当は 3 種類

対応表の各行は、次の 3 種類のどれかの割当を持つ。空・`未割当`・`TBD`・`—` は割当ではない。

| 種類 | 書き方 | 条件 |
|---|---|---|
| 実装済み | `実装済み: <element> (<経路>)` | 表示を担う element と、実行中 / 過去ログのどちらで出るか。**element が ToolFallback だけの行は Tier B / C に限る** |
| 後続 | `後続: <feature ID>` | ID は roadmap の feature の表 (milestone ごとの `\| 順 \| ID \| feature \|` の表と Optional scope の表) に実在し、**完了していない** feature に限る |
| 表示不要 | `表示不要: <理由>` | 内部制御・重複など。Tier C の行は `表示不要: Tier C (<理由>)` |

### 2. 行の Tier の決め方

element の Tier ([AD-019](0019-assistant-ui-element-inventory.md)) と同じ 3 値を、対応表の行にも付ける。

- **A**: Claude Code の一次概念 (会話・tool の実行と結果・承認・中断・コンテキスト・費用と制限・セッションの境界) に直結し、利用者が見ないと判断を誤るもの
- **B**: 体験を押し上げるが、無くても判断を誤らないもの
- **C**: 対象外 (Voice・Generative など)

迷う行は備考に理由を書き、`ui-coverage-reviewer` が妥当性を見る。

### 3. M3 の完了の条件

roadmap の M3 の達成状態「未表示情報がゼロ」は、**Tier A の `後続` の行のうち、割当先が M3 の feature の行が 0** のときに満たされたと判定する。

- M4 以降の feature に割り当てた Tier A の行 (例: 承認の capability 付与 → I-3) は M3 の条件に数えない。その行はその feature の完了で解消する
- Tier B の `後続` の行は M3 の条件に数えない
- 機械照合 (Decision 4) の出力に、割当の種類 × Tier と、後続 feature の ID ごとの件数と milestone を出し、この条件の件数を読めるようにする

### 4. 機械照合する範囲

対応表は 6 節に分ける。

| 節 | 内容 | 機械照合 |
|---|---|---|
| A | `SDKMessage` のメンバー (1 メンバー 1 行。subtype は備考) | する (`sdk.d.ts` の union の名前の集合と一致) |
| A' | `SDKMessage` の外で stdout に現れる型 | しない |
| B | 中身のブロック (assistant / user の content block) | しない (型は `@anthropic-ai/sdk` の beta の union にあるが、Agent SDK の外に照合を広げることになるので O-6 に割り当てる) |
| C | tool の入力型 (`ToolInputSchemas` のメンバー) と実行時の tool 名 | する |
| D | アプリが作る表示の経路 (承認要求など) | しない |
| E | 制御要求 (`control_request` の subtype。AD-020 Decision 1 の「control 経路」) | する |
| F | element の分類 (Tier) | しない (表示の割当の対象ではない) |

照合は Constitution 検証の項目 21 が行い、CI で常に流す。照合する節は、SDK の型と対応表の名前の集合が一致すること、割当が Decision 1 の書き方であること、対応表に書いた SDK の版が入っている SDK と一致することを確かめる。入力のどれかが無いときは「検査対象なし」ではなく違反にする。

他 domain の一覧画面に出る値 (`SDKSessionInfo` のフィールドなど) は行にしない。ui charter の Out of scope (他 domain の操作 UI は Principle XII の判定対象にしない) による。

### 5. 書式の正本

本 ADR は決定 (割当の 3 種類、Tier の決め方、M3 の完了の条件、機械照合する節) の正本である。列・値の綴り・SDK を上げたときの手順などの書式の詳細は `docs/ui-coverage.md` の凡例を正本にする。食い違ったら本 ADR を正とし、決定を変えるときは後続 ADR を起こす。

### 6. AD-019 / AD-020 の Open Questions への回答

| 問い | 回答 |
|---|---|
| AD-020: Hook / Background task を session の責務に含めるか | 含めない。状態は保持せず、transcript の 1 行 (システムイベントの行) として ui が描く。session は agents で無害化して通す経路だけを持つ (O-2 FR-008 / FR-009)。実行中の task の一覧の要否は O-6 で判断し、要るなら持ち主の domain を人間に諮る |
| AD-020: `SDKPartialAssistantMessage` を使うか | 使わない。X-1 がメッセージ単位の更新を採った (chunk 境界で双方向制御文字やサロゲートを割らない)。対応表 A 節で「表示不要: 部分メッセージを要求しない (X-1)」とする |
| AD-020: 表示が不要なもの (内部制御系) をどう区別するか | 割当の「表示不要: 理由」(Decision 1) |
| AD-019: Tier B / C の再棚卸し (未分類 59 要素) | O-2 で registry から引き直し、対応表 F 節に分類を記録する (確認日を併記。AD-019 D3) |
| AD-019 / ui charter: Tier C の Data table / Chart / Timeline / Diagram を MCP の結果の表示に転用するか | O-5 (MCP) で判断する。F 節の備考に置く |
| AD-019: 202 の中に Claude Code の一次概念に当たる element が他にあるか | F 節の分類で答える (「使い道」の列に対応表の行を書く) |

## Considered options

- **(採用) 後続 feature の ID を割当とみなす**: O-2 を対応表と照合に絞り、表示の実装を feature に分けられる。M3 の完了は Decision 3 の条件で別に測る
- **全行を表示実装まで揃えてから completed にする (XII の字面どおり)**: O-2 が 1 feature に収まらず、対応表そのもの (XII の検証の土台) が遅れる
- **ToolFallback を常に実装済みとみなす**: 未割当は簡単に 0 になるが、専用表示の欠けが対応表から見えなくなる

## Consequences

- Constitution XII / XIII を v1.3.0 (MINOR) で改める。XII の判定の意味を広げる (適合と判定される状態を広げる) 改定であり、これまで適合していた状態が違反になることは無いので MAJOR に当たらない
- 項目 21 は CI で常に違反を検出する。**SDK の版を上げる PR は、domain を問わず対応表を同じ PR で直す** (`ui-coverage-reviewer` が `package.json` / `pnpm-lock.yaml` の変更で起動する。手順は対応表の冒頭と docs/discovery.md)
- XII の Adoption metadata「開発途上の未割当は違反としない」は、項目 21 の扱い (常に違反、後続の行は違反にしない) に改める
- M3 の完了の判定は、後続の Tier A の行の件数 (項目 21 の出力) で読む
- 後続 feature (O-4 / O-5 / O-6) は roadmap に登録し、各行に対応表の割当の範囲を書く (持ち主のいない延期を残さない。AD-028 §5)

## Confirmation

- Constitution 検証の項目 21 が現在の SDK (0.3.270) と対応表で ok になり、崩した入力で違反になる (O-2 SC-001 / SC-002。`tests/ui-coverage/`)
- 項目 21 の出力に、M3 の完了の条件の件数が出る
- 対応表の A・C・E 節の行の数が SDK の型定義と一致する (parse から独立した正解は TypeScript のコンパイラ API で列挙した集合)

## References

- [AD-019](0019-assistant-ui-element-inventory.md) / [AD-020](0020-sdk-emitted-message-inventory.md) / [AD-028](0028-session-enumeration-process-and-unc-handoff.md) §5 / [AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g)
- [spec 011](../../specs/011-ui-coverage/spec.md) / [data-model](../../specs/011-ui-coverage/data-model.md) §1
- Constitution Principle XII / XIII と改定手順
