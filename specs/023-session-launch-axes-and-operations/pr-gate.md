# PR Gate Round 1: 実行中のセッションの操作 (X-6 の最初の分割 / 023)

**Run**: 2026-10-28
**Base**: main (1a7d8b4) ... HEAD (e6a093d)
**Diff stat**: +7066 -198 over 97 files
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped reviewers**: database-reviewer — auto_invoke_patterns に一致する変更ファイルが無い (変更 97 件 / pattern 5 件)。lint-agent / test-agent / convention-reviewer は code-gate 専任のため起動しない
**Round inheritance**: 初回 (Round 1)。前 round の findings なし
**Rule verification**: `node scripts/rules/run.mjs` を Round 1 で単独実行 — 期待表と一致 77 件、exit 0 (捕まらない経路 7 件は UNDETECTED_NOTES の既存記録)

## Verdict

集計は multi-reviewer dedup の後 (下の「Dedup」を参照)。

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 5 | 0 | 5 | 5 | 0 |
| Medium   | 15 | 0 | 15 | 15 | 0 |
| Low      | 17 | 0 | 17 | 17 | 0 |

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/023-session-launch-axes-and-operations
  (AD-050: High はこの round で直す。High を確かめるためだけの round は回さない)

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 押せない状態が見た目で区別できず、理由が hover の `title` と sr-only にしか出ない [origin: ux | +a11y M-001 | +po M-001]
- **Where**: src/renderer/src/features/shell/LiveSettingsControls.tsx:73-86, :151-163, :259-270 (理由 :103-107, :176-180, :271-275)
- **Issue**: `aria-disabled` だけで見た目を変えない。既定の Provider のセッションではモデルの選択が恒久的に反応しない
- **Suggested fix**: `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed` を足し、理由を見える形で 1 つ出す。見た目のクラスのテストを足す
- **Status in this round**: new

### H-002 — 中央のヘッダの行が 480px / 既定 1100px のウィンドウで溢れ、題が潰れ、右端の操作が `overflow-hidden` で切れる [origin: a11y | +ux M-004]
- **Where**: src/renderer/src/features/shell/CenterHeader.tsx:149-186, LiveSettingsControls.tsx:71, :149, :266, :282, CenterPane.tsx:62
- **Issue**: `flex-wrap` が無く、023 が足した要素はすべて `shrink-0`。WCAG 1.4.10 / 2.4.7
- **Suggested fix**: 行を折り返せる形にするか、実行中の設定を 2 段目に回す。`centerMin` の幅で `scrollWidth <= clientWidth` を見る検査を足す
- **Status in this round**: new

### H-003 — 閉じた native `<select>` の矢印キーで `onChange` が走り、通過した値ごとに実セッションの設定を変える [origin: a11y]
- **Where**: src/renderer/src/features/shell/LiveSettingsControls.tsx:79-83, :157-161
- **Issue**: 確定の段階が無い。通過した中間のモデル / 権限モード (`dontAsk` を含む) が実際に適用される。WCAG 3.2.2
- **Suggested fix**: 確定の操作を分ける (ローカル state + blur / Enter) か popup 型の部品にする。`{ArrowDown}` の検査を足す
- **Status in this round**: new

### H-004 — US-3 AC4 の「入力が空」で制限の文言が出ない [origin: po]
- **Where**: src/renderer/src/features/shell/LiveSettingsControls.tsx:292, :293, :328、LiveSettingsControls.test.tsx:248, :196-201
- **Issue**: `invalid && draft !== ''` の条件で、空のときは保存が押せないのに理由が出ない。AC4 の文面と実装が食い違う
- **Suggested fix**: touched の後は空でも `nameRule` を出す (3 箇所の条件を揃える) か、AC を書き換える。テストの表に `''` を足す
- **Status in this round**: new

### H-005 — 項目 14 が SDK の re-export (`export { X } from '<sdk>'` / `export *`) と非リテラルの specifier を素通しし、UNDETECTED_NOTES の記録だけ消した [origin: architecture | +platform-boundary M-001]
- **Where**: scripts/constitution/check.mjs:668, :680-692, :708-715、tests/rule-fixtures/expected.mjs (`sdk-forbidden-call-alias` の削除)
- **Issue**: `tagSession` / `deleteSession` / `forkSession` への到達を機械検証が見逃す。AD-034 §3 / SC-017 の記録の規範に反する (実害 0 件)
- **Suggested fix**: 項目 14 に再 export / 非リテラル specifier の検出と fixture を足すか、`UNDETECTED_NOTES` に新しい項目 (why / mitigatedBy / nextFeature / howToClose) を足す
- **Status in this round**: new

## Medium / Low (Round 1)

本文は各 reviewer の raw output を参照する (AGENTS.md: Medium / Low は直さず棚卸しで扱う)。

- Medium (15): architecture M-001 (AD-063 の項目 5 / 15 の事実誤認)、architecture M-002 = ui-coverage M-001 (E 節 3 行の経路の列が `なし`)、architecture M-003 (`LiveSettingsControls` の置き場と session charter の In scope)、architecture M-004 = platform-boundary M-002 (SDK の動的 import の fixture が無い)、ui-coverage M-002 / M-003、ux M-001 / M-002 / M-003 (+po L-001) / M-005 (+po M-002) / M-006 (+a11y M-003)、a11y M-002、po M-003 / M-004、security M-001
- Low (17): ui-coverage L-001〜003、ux L-001〜003、a11y L-001 / L-002、security L-001〜003、platform-boundary L-001、architecture L-001〜005 (L-004 は scope: system)

## Dedup

集約 key (`path:line` > FR > Principle) で同一とみなしたもの。重い側の severity を残した。

| 残した ID | 統合した reviewer finding |
|---|---|
| H-001 (ux H-001) | a11y M-001、po M-001 |
| H-002 (a11y H-001) | ux M-004 |
| H-005 (architecture H-001) | platform-boundary M-001 |
| architecture M-002 | ui-coverage M-001 |
| architecture M-004 | platform-boundary M-002 |
| ux M-003 | po L-001 |
| ux M-005 | po M-002 |
| ux M-006 | a11y M-003 |

## Suppressed by code-gate

0 件 (code-gate の `must_fix_findings` は空)。platform-boundary M-001 は code-gate M-001 と同じ事象 (未修正) で、pr-gate では architecture H-001 として High に上がっている。

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 1 / Low 3
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 4 / Low 5
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 4 / Low 1
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 6 / Low 3
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) — Critical 0 / High 2 / Medium 3 / Low 2
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 2 / Low 1
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 3 / Low 3
