# Code Gate: Tier A tool 表示 (R-4)

**Run**: 2026-09-25
**Spec**: specs/004-ui-tier-a-tool-display/
**Diff scope**: touched-files.txt の 22 ファイル (BE 4 / FE 11 / tests 1 / docs 4 / spec 2)
**Tracks**: lint-agent (直接実行), test-agent (直接実行), convention-reviewer (subagent)

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | 0 | — |
| SHOULD_FIX | 3 | eslint.config.mjs 緩和 (M-001) / subagent ラベル (L-001) / data-slot 一貫性 (L-002) |
| CONSIDER | 0 | — |

**Status**: PASS

lint / typecheck / depcruise / check:constitution / test はすべて緑 (下記)。convention-reviewer は
MUST_FIX 0。検出された SHOULD_FIX 3 件のうち M-001 (lint 緩和 gap) と L-001 (日本語ラベル) は
本 gate 内で解消し、L-002 (サブ要素 data-slot) は accepted (非対処)。

## 機械トラック (直接実行で検証。lint-agent / test-agent 相当)

| track | 結果 |
|---|---|
| lint | `pnpm lint` exit 0 / **0 error / 0 warning** (復元ブロック追加後も緑) |
| typecheck (node + web) | エラー 0 |
| depcruise | 違反 0 (191 modules / 791 dependencies) |
| check:constitution | ok 14 / 違反 0 / pending 1。**SDK 許可 = `listSessions, getSessionMessages` のまま (新規呼び出しなし)** |
| test | **44 files / 902 passed** |

**`test:rules` は code-gate で実行しない** (discovery 規定。R-4 はルール定義を変更していない。pr-gate / CI が担う)。

## SHOULD_FIX findings

### M-001 [Medium → 解消] 手書き `.aui.tsx` 6 ファイルが GENERATED_FILES 緩和に落ちていた
- convention-reviewer 指摘。`eslint.config.mjs` の復元ブロックに 6 ファイルを追加し意味論 rule を 'error' に戻した
  (`prettier`/`react/prop-types` を除く。thread.aui.tsx と同方針)。`tool-registry.aui.tsx` の `TOOL_DISPLAY` を非 export に。
  **lint 再実行 0 error を確認。** ([convention-reviewer.code-gate.md](convention-reviewer.code-gate.md) CONV-M-001)

### L-001 [Low → 解消] 可視ラベル "Subagent" を Principle XV に合わせ日本語化
- `subagent.aui.tsx` ヘッダを "サブエージェント" に変更 (glossary canonical)。

### L-002 [Low → accepted] 新設 element のサブ要素に `data-slot` 無し
- 純粋なスタイリング一貫性で実害なし。reviewer も「任意」と評価。root の `data-slot="aui_*"` は house style 準拠。

## Track raw outputs

- [convention-reviewer.code-gate.md](convention-reviewer.code-gate.md)
- lint-agent / test-agent: 直接実行 (上表)。security / architecture / po reviewer は **起動しない** (pr-gate 専任)。
