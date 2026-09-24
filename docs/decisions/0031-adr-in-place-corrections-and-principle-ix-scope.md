---
status: accepted
date: 2026-09-23
id: AD-031
deciders: ukitomato
tags: [governance, architecture, process]
supersedes: []
superseded-by: []
amends: [AD-028]
related: [AD-019, AD-024, AD-030, AD-032]
---

# AD-031: accepted な ADR の in-place 訂正を認め、Principle IX の検証の限界を明記する

> **訂正 (2026-09-23 / pr-gate Round 4)**
>
> 本 ADR 自身の記述に 2 つの誤りがあった。いずれも決定は変えない。
>
> **1. Decision 2 の許容根拠が事実でない。**
> 「1 件あたりの上限は正規化後の `TEXT_MAX_BYTES` (512) 系のフィールドで縛られており」と
> 書いたが、**`src/agents/` に `TEXT_MAX_BYTES` も `normalizeText` も出現しない** (0 件)。
> 正規化が走るのは `JSON.parse` の**後**、`domain`/`app` の層である。
> `createLineAssembler` は `\n` を探すだけで**行長の上限を持たない**。
> `MAX_SESSIONS_PER_TARGET` (5,000) の検査も `JSON.parse` の後で効く。
>
> pr-gate Round 4 の不変条件 2 で `RawSessionRecord` の文字列 6 項目が
> `string | null` から `unknown` になり、**「パース前に何も縛っていない」ことが
> 型宣言としても明示された**。
>
> **許容の根拠は「本文を運ばない」(FR-044 / SC-011) の 1 本である。**
> 件数の上限だけがパース後に効く。パース対象のバイト列に上限は無い。
>
> **2. 先例 5 件の分類が、本 ADR 自身の基準で誤っている。**
> 「5 件すべてが事実誤認の訂正である」と断じたが、AD-028 の訂正節は
> 「規則 3 の初版は実装不能だった」として**規則そのものを差し替えて**おり、
> C-2 の「所在の識別子を起動引数で渡す」行も差し替えている。
> 本 ADR の基準 (「読み手が同じ決定に至るか」) では、これは**決定の変更**である。
>
> したがって規則を次の形に言い換える —
> **「訂正節に決定の変更を書いてはならない。書く必要が生じたら後続 ADR を起こす」**。
> 判断の対象を「なぜ書くか」ではなく「**何を書いたか**」に移すことで、
> 起票時に機械的に判定できる。
> 最初の適用例が [AD-032](0032-unc-shape-classification-by-separator-count.md) である
> (UNC 判定モデルの変更を AD-029 の in-place 訂正にせず、後続 ADR に置いた)。

## Context

pr-gate Round 2 (R-2 / セッション列挙) で `architecture-reviewer` が 2 件の drift を挙げた。
どちらも「規則の文言」と「実践」が食い違っている状態であり、**どちらが正本かが決まっていない**。

### 1. ADR の immutability (Round 1 H-004 / Round 2 A-205)

[AD-028](0028-session-enumeration-process-and-unc-handoff.md) §2 は次のように宣言している。

> **AD-023 を in-place 改変しない。accepted な ADR は immutable として扱い、
> 読み替えの根拠を後続 ADR に置く** — AD-025 §2 が AD-004 に対して確立した形式に従う。

ところが実践は逆に動いている。

| ADR | 挿入された節 | 内容 |
|---|---|---|
| AD-019 | 訂正 | element の総数は 143 ではなく 202 |
| AD-024 | 訂正 | R-1 に composer は存在する |
| AD-028 | 訂正 (2026-09-17 / 採択当日) | — |
| AD-028 | 訂正 (2026-09-17 / 実装時) | — |
| AD-030 | 訂正 (2026-09-18) | §5。Electron 下の応答経路は `parentPort` である |

**5 件すべてが「決定の変更」ではなく「事実誤認の訂正」である。**
AD-019 / AD-024 は AD-028 §2 の宣言より前の先例であり、
AD-028 自身と AD-030 は宣言の**後**に同じことをしている。

### 2. Principle IX の検証が見ている場所 (Round 2 A-202)

[Principle IX](../../.specify/memory/constitution.md) は
「stream の逐次パースは supervisor 側で行うべきであり、main process で行うべきではない」と定め、
✗ Bad として「main process が stdout chunk を受けて `JSON.parse` してから renderer へ転送する」を挙げる。

R-2 の実装はこの形に**一致する**。子は応答を `JSON.stringify` した 1 行として
`parentPort.postMessage()` で返し、親 (main) が `createLineAssembler` で組み立てて
`decodeResponse` = `JSON.parse` する。1 応答には最大 `MAX_SESSIONS_PER_TARGET` (5,000) 件が載る。

**検証がこれを見られない。** `bad_pattern_grep` は

```
grep -rn "JSON.parse" src/ | grep -v "src/agents/" | grep -iE "chunk|stdout|stream|line"
```

であり、パース**コードの置き場**を見る。実体は `src/agents/protocol.ts` にあるので 0 件を返す。
**「どのプロセスで走るか」を見る検査はどこにも無い。**

さらに `plan.md` の Constitution Check IX は
「列挙の I/O とパースを `utilityProcess` に出す」を根拠に `[x]` を付けており、
**遵守チェックが事実と違う根拠で立っている**。

## Decision

### 1. 実践を規則に合わせる (ADR の in-place 訂正を認める)

**採択当日 / 実装時に判明した事実誤認の訂正は、日付つきの「訂正」節として
accepted な ADR に in-place で書いてよい。決定そのものの変更は後続 ADR に置く。**

判断の境目は「読み手が同じ決定に至るか」である。

| 種別 | 置き場 | 例 |
|---|---|---|
| 事実誤認の訂正 (数値・経路・前提の誤り) | **in-place の「訂正」節**。日付と発見の経緯を書く | AD-030 §5 「応答は標準出力」→ `parentPort` |
| 決定の変更 / 読み替え | **後続 ADR** | AD-030 が AD-028 §1 の実行単位を差し替えた |

**規則の側を変える理由**: 先例 2 件 (AD-019 / AD-024) が宣言より前に確立しており、
宣言の後の 3 件も同じ性質である。**5 件すべてが訂正であって決定の変更ではない。**
事実誤認の訂正のために ADR を 1 本起こすと、
「AD-028 の 143 は 202 の誤りである」だけの ADR が並び、
**決定の一覧を読んでも決定が分からなくなる**。

immutability が守ろうとしているのは「決定の履歴が後から書き換えられないこと」であり、
それは訂正節の側に日付を要求すれば保てる。

**AD-028 §2 の宣言はこの ADR で読み替える。** AD-028 は in-place で直さない —
この節は決定の変更であって事実誤認の訂正ではないからである
(自分で定めた境目に自分で従う)。

### 2. Principle IX の適用範囲と検証の限界を明記する

**実装は変えない。** 列挙応答のパースは main に残る。

理由は 2 つある。

- Principle IX の Why は「tool_result が数 MB になることがあり、
  main process で `JSON.parse` するとウィンドウが固まる」である。
  R-2 の応答は**列挙結果のメタデータ**であり、transcript の本文を載せない (FR-044 / SC-011)。
  1 件あたりの上限は正規化後の `TEXT_MAX_BYTES` (512) 系のフィールドで縛られており、
  件数の上限は `MAX_SESSIONS_PER_TARGET` (5,000) である。
- 構造体を `postMessage` する形 (structured clone) に変えると
  `protocol.ts` / `transport.ts` / `enumerator-spawner.ts` の 3 モジュールに手が入る。
  **経路が 2 本あること (stdio / `parentPort`) を本体が知らない**という AD-030 §5 の性質を
  保ったまま行う必要があり、R-2 の範囲で払う費用として見合わない。

かわりに次を記録する。

- `plan.md` の Constitution Check IX の**根拠文を事実に直す** —
  「列挙の I/O とパースを `utilityProcess` に出す」は誤りである。
  I/O は出ているが、**応答 1 行のパースは main に残る**。
- Principle IX の Verification に
  **「`bad_pattern_grep` はパースコードの置き場を見る。どのプロセスで走るかは見ていない」**
  を明記する。`existing_violations: 0` は遵守の証拠ではない
  (AD-024 #18 が Principle VIII について確立した形と同じ)。

**将来の再評価の条件を置く**: R-3 (transcript 表示) が本文を運ぶ経路を作る時点で、
Principle IX の Why が名指す「数 MB の tool_result」が実際に現れる。
そのとき構造体 `postMessage` への移行を再評価する。

**持ち主** (2026-09-23 追記 / pr-gate Round 4): `docs/roadmap.md` の R-3 行。

- [ ] Principle IX の再評価 — 構造体 `postMessage` への移行判断。R-3 が本文を運ぶ時点
- [ ] `createLineAssembler` に行長上限を置くか判断する。
      上記の訂正 1 のとおり、現状パース対象のバイト列に上限は無い

v1.2.3 が AD-028 §5 について「**持ち主のいない延期は、次に本 Principle を見る人が
『R-2 で載ったはず』と誤読する形で残る**」と明文化した規範を、
本 ADR は 3 round のあいだ自分に適用していなかった (pr-gate Round 4 / A4-004)。

## Consequences

### 良い面

- ADR の訂正が「規則違反」として毎 gate で挙がらなくなる。
  Round 1 と Round 2 で同じ指摘が 2 度出ており、費用が反復していた。
- Principle IX について「検査が緑であること」が何を示さないかが書かれる。
  本プロジェクトが繰り返し塞いできた「違反が 0 件なのではなく検査が 0 件」の 1 件を明示に変える。

### 悪い面 / 残余

- **in-place の訂正は git の履歴を辿らないと差分が分からない。**
  訂正節に日付を必須にすることで緩和するが、消えない。
- **Principle IX の Automated 検証は依然としてプロセス境界を見ない。**
  この ADR はそれを塞がず、**塞いでいないことを書く**だけである。
  塞ぐには「どのモジュールが main で評価されるか」を依存グラフから導く検査が要る
  (`composition-root` からの到達集合)。R-3 で本文を運ぶ時点の宿題とする。

## Confirmation

- AD-028 §2 の宣言は本 ADR で読み替えられた。AD-028 は編集しない
- `.specify/memory/constitution.md` v1.2.4 —
  改定手順に本 ADR への参照を置き、Principle IX の Verification に限界を明記した
- `specs/002-session-cross-folder-session-enumeration/plan.md` の
  Constitution Check IX の根拠文を事実に直した
- 実装の変更は無い
