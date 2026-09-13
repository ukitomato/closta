---
status: accepted
date: 2026-09-13
id: AD-019
deciders: ukitomato
tags: [ui, verification]
supersedes: []
superseded-by: []
---

# AD-019: assistant-ui の element 実在確認と Tier 分類の再棚卸しの扱い

## Context

SPIKE-14 の結果。PLAN.md §4.2 の Tier A 表は「Terminal block」「Code diff」「Approval card」など
**具体的な element 名を 25 行にわたって列挙**しているが、**それらが実在するかの確認が
一度も行われていなかった**。

軸 1（UI 完成度）は製品の採否条件であり、§4 の計画全体がこの前提に乗っている。
前提が崩れれば §4 ごと書き直しになるため、R-3（transcript の基本表示）より前に潰す必要があった。

SPIKE-2（assistant-ui Elements の導入コスト実測）はコストを測るものであって、
**その前段の「そもそも存在するか」を問うものではなかった**。SPIKE として立てられていなかった穴である。

## 確認結果

`https://www.assistant-ui.com/elements` を照会し、PLAN.md §4.2 / §4.3 が名指しする
**35 個の element 名がすべて実在することを確認した**。

| 分類 | 確認できた element |
|---|---|
| tool 表示 | Terminal block / Code diff / Reviewable diff / Tool fallback / Tool group / Todo list |
| エージェント | Subagent list / Agent handoff / Agent plan / Agent status / Thinking indicator |
| 承認 | **Approval card** / **Permission grant** |
| 推論・コスト | Reasoning effort / Model selector / Cost meter / Quota banner / Context display |
| セッション | Thread list / Stopped run / Message queue / Message branches / Checkpoints |
| MCP | Server panel / Elicitation form |
| 本文 | Markdown text / Shiki highlighter / Mermaid diagram / Streaming text / Scroll anchor |
| その他 | Slash commands / Web search / Inline citation / Error state / Tool failure |

説明文も意図と一致している。例:

- **Approval card**: "Human in the loop: the agent asks before it runs anything with side effects."
- **Permission grant**: "Granting a capability rather than approving one action, with the reach spelled out."
- **Terminal block**: "Command output that streams line by line and ends with an exit status."

PLAN.md §4.2 が「単発承認と capability 付与を区別」と書いていた設計意図は、
**Approval card と Permission grant という 2 つの element として実際に分かれている**。

## 訂正: element の総数は 143 ではなく 202

PLAN.md（§4 / 付録A / 付録B）は「143 種」と記載しているが、**現在は 202 種**である。
執筆時点から約 40% 増えている。

なお 202 種には **runtime 接続型（`<name>.aui.tsx`）と props 駆動の standalone 型**が混在する。
standalone は約 120 種とされる。`useExternalStoreRuntime` と接続する本プロダクトでは
どちらを採るかが実装コストに効くため、SPIKE-2 で確認する。

## Decision

### 1. §4.2 の Tier A 表はそのまま採用する

35 個すべてが実在し、説明も意図と一致したため、**Tier A の選定を変更する理由はない**。
R-3 / R-4 / O-2 は現行の表のまま進める。

### 2. Tier 分類の再棚卸しは O-2 のスコープに含める。今はやらない

143 → 202 の差分 **59 要素が未分類**である。しかし今それを分類しても、
実装の実感がないまま机上で Tier を割り振ることになり、精度が上がらない。

**O-2（`docs/ui-coverage.md` の確立）が、SDK が emit する情報と表示実装の対応表を作る feature である。**
未分類要素の棚卸しはその作業と同じ素材を扱うため、**O-2 に統合するのが自然**である。

それまでは「Tier A は確定、Tier B / C は暫定」として扱う。

### 3. 「143 種」の記述を全て 202 に訂正する

`PLAN.md` / `docs/glossary.md` / `docs/domains/ui/charter.md` / `docs/discovery.md` の
記述を更新する。数はさらに増えうるため、**glossary には数を書かず「§4 参照」に留める**案も
検討したが、規模感を伝える情報としての価値があるため数値は残し、
**確認日を併記する**形にする。

## Consequences

- 軸 1 の計画の前提が検証済みになった。§4 を書き直す必要はない
- O-2 のスコープに「Tier B / C の再棚卸し（59 要素）」が加わる
- SPIKE-2（導入コスト実測）は当初の目的どおり「入れてみてコストを測る」に集中できる。
  存在確認は本 ADR で済んでいる
- element 数は今後も増える。**数を書いた箇所は陳腐化する**前提で、確認日を併記する

## Open Questions

- [ ] Tier C に置いた Generative 22 要素は、202 への増加でどう変わったか。
      Data table / Chart / Timeline / Diagram を MCP ツールの結果表示に転用する判断（§4.4）は
      いつ行うか
- [ ] 202 要素のうち Claude Code の一次概念に対応するものが他にないか。
      O-2 の棚卸しで確認する

## References

- SPIKE-14（docs/roadmap.md）
- [assistant-ui — Elements](https://www.assistant-ui.com/elements)（2026-09-13 時点で 202 要素）
- PLAN.md §4.2〜§4.4（Tier A / B / C の分類）
- `docs/domains/ui/charter.md`
