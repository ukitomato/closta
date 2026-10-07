---
status: accepted
date: 2026-10-04
id: AD-045
deciders: ukitomato
tags: [ui, i18n, constitution]
supersedes: []
superseded-by: []
---

# AD-045: UI の文言を i18n リソース化しない (Principle XV の M3 の判断)

## Context

Constitution Principle XV は「UI labels: 日本語を第一言語とする。i18n リソース化の要否は M3 (O-1〜O-3) までに判断する」と定める。O-1 はこの判断を O-3 に送った ([010 research R-08](../../specs/010-session-monitoring-view/research.md))。判断には、`src/main/infra/session/target-finder.ts` が作る日本語 2 本 (`候補 #N` / `名前 (#N)`。「訳出は `ui`」(R-2 FR-031 / FR-047) の例外) を含めることになっている (roadmap の「Principle XV (i18n) の棚卸しへの申し送り」。R-2 pr-gate Round 4 / A4-006)。

2026-10-04 の時点の状態:

- UI の文言は feature ごとの文言の表 (`labels.ts` など) に日本語で置いている。英語の UI の要求は無い
- 利用者は 1 人で、配布 (D-1) の前である
- roadmap は、リソース化するなら先に `running-session-store.ts` の切り出し (行の状態の型を文言の表から外す) を済ませるよう求めている

本 ADR は O-3 ([spec 012](../../specs/012-ui-thread-search/spec.md)) が夜間の自走で起こした。判断 (spec 012 の U-3) と本 ADR は 2026-10-05 に利用者が承認した。Constitution XV の字面は O-3 の PR で改める (Consequences)。

## Decision

1. **UI の文言は i18n リソース化しない。** 日本語単一を維持する。i18n のライブラリ・言語の切り替え・翻訳ファイルを持たない
2. **文言の置き場の規則**: UI の文言は feature ごとの文言の表 (`labels.ts` など) に置き、コンポーネントへの直書きを新たに増やさない。リソース化を再検討するとき、表をそのまま翻訳の単位にできる形を保つ。機械強制は足さない (直書きの検出は誤検出が多く、reviewer (ux-reviewer の i18n の観点) で見る)
3. **`target-finder.ts` の 2 本は infra の例外として据え置く。** 一意性を境界の手前で決める必要があり、移すと `EnumerationTarget` と DTO 2 本にフィールドが増える (roadmap の申し送り)。リソース化を再検討するときは、infra は序数だけを持ち、`ui` が文言を組む形に移す
4. **再検討の条件**: (a) 英語など日本語以外の UI の要求が出たとき、(b) D-1 (配布) の前。どちらかで本 ADR を見直す

## Consequences

- Constitution XV の「i18n リソース化の要否は M3 (O-1〜O-3) までに判断する」を、accepted の後に「リソース化しない (AD-045)。UI の文言は feature ごとの文言の表に置き、直書きを新たに増やさない。再検討の条件は AD-045」に改める。**MINOR** (Decision 2 の規則を指針に足す拡張であり、期限付きの宿題を確定の判断に置き換える意味の変更でもある。design-gate R1 architecture M-002)。改定は O-3 の PR で、改定手順 2 (architecture-reviewer を交えた人間のレビュー) と 4 (Amendment trail) を踏む
- 「直書きを新たに増やさない」の基準線: O-3 の実装の最初に、コンポーネントの中の日本語の直書きの件数を数えて本 ADR の Confirmation に記録する (ux-reviewer が「新たに」を判定する基準)
- 本 ADR の accepted は O-3 の /cl-implement の着手の条件である
- `running-session-store.ts` の切り出しは「i18n リソース化の前に済ませる」前提を失う。切り出しそのものの理由 (ファイルの大きさ・型の依存の向き) は残るので、持ち主は roadmap の記録のまま
- 英語の UI が要るようになったら、全 feature の文言の表を移す作業が一度に要る。表に集めてあるので移す量は読める

## Alternatives

- **リソース化する** — 今は利用者に価値が無く、全 feature の文言を移す大きな作業と、先行する切り出しが要る
- **判断を M4 以降に延ばす** — Constitution の期限 (M3) を破る。延ばすなら期限の改定が要り、判断の記録と同じ手間になる

## Confirmation

- Constitution XV の改定の PR で、本 ADR が accepted であること
- 再検討の条件 (b) は D-1 の design で確かめる (roadmap の D-1 の行に注記する)
- **直書きの基準線** (Consequences の追記。2026-10-07、O-3 の実装の前の `73ebbc0` で数えた): **331 行**
  - 対象のファイル: `src/renderer/src` 配下の `*.tsx` から `*.test.tsx` を除いたもの
  - 式 (Grep ツール = ripgrep。リポジトリの root で): `rg -c --glob '*.tsx' --glob '!*.test.tsx' '^[ \t]*(?:[\p{Hiragana}\p{Katakana}\p{Han}]|(?:\{[^/]|[^ \t/*{]).*[\p{Hiragana}\p{Katakana}\p{Han}])' src/renderer/src` の件数の合計
  - 数えるもの: 先頭 (空白の後) がコメントの記号 (`//`・`*`・`/*`・`{/*`) でない行のうち、平仮名・片仮名・漢字を含む行
  - 式の限界: 行の単位では、複数行のコメント (`{/* … */}` など) の 2 行目以降と JSX のテキストを区別できず、前者も数える。行末のコメントだけに日本語がある行も数える。TypeScript の構文木で照合すると、日本語を含む文字列リテラル・テンプレート・JSX のテキストは 16 ファイルに 273 個 (252 行。どれも式に当たる) で、差の 79 行はコメント (複数行のコメントの 2 行目以降 78・行末のコメント 1) である
  - 「新たに増やさない」の判定: 同じ式の件数が 331 から増えたら、増えた行がコメントか直書きかを差分で見る
