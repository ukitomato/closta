# code-gate: convention-reviewer (R-4)

**Run**: 2026-09-25 · Read-only · **Verdict**: Critical 0 / High 0 / Medium 1 / Low 2 · MUST_FIX (Critical+High) = 0

lint 受領: `pnpm lint` exit 0 / 0 error / 0 warning。typecheck・depcruise (0 violations / 191 modules)・
check:constitution (ok 14)・vitest 902 も緑。命名・module 配置・UL は合格 (下記 caller 回答)。

## caller 4 観点への回答
1. **Naming**: 合格。`.aui.tsx` + kebab-case、PascalCase component + memo/displayName、`parse*Args`、英語 identifier、root `data-slot="aui_*"`。
2. **Module placement**: 合格 (AD-023)。domain 純粋関数 / DTO / renderer 表示 / features 配線が正しい層。depcruise 0 violations。
3. **lint hookup**: M-001 の 1 件 (下記)。
4. **Ubiquitous Language**: identifier は合格 (Subagent / Subagent group→children / Terminal block / Code diff / Todo list / Agent plan、AD-035 と一致)。唯一 nuance は可視ラベル (L-001)。

## Findings

### CONV-M-001 [Medium / SHOULD_FIX] 手書き `.aui.tsx` 6 ファイルが GENERATED_FILES 緩和に落ち strictness 無効
- **Where**: `eslint.config.mjs:73-77` (GENERATED_FILES glob) / `:443-454` (rule off) vs 復元リスト `:461-476` (safe-url.ts / thread.aui.tsx のみ)。
  新設 6 ファイル (terminal-block / code-diff / todo-list / subagent / agent-plan / tool-registry) は緩和 glob 配下だが AD-035 Decision 2 の**手書き**コード。
- **Issue**: strictness (explicit-return-type / react-hooks / react-refresh / no-empty) が off。`tool-registry.aui.tsx` は const map + component を同一 export し
  strictness を戻すと `react-refresh/only-export-components` が発火 (= 現在マスクされている)。
- **→ 解消 (2026-09-25、code-gate 内で対処)**: `eslint.config.mjs` の復元ブロックに 6 ファイルを追加し、意味論の番人
  (explicit-function-return-type / react-hooks/refs / react-hooks/exhaustive-deps / react-refresh/only-export-components / no-empty) を 'error' に戻した
  (`prettier/prettier` と `react/prop-types` は戻さない — assistant-ui 整形の保持 / TS で検証済み・型別名 FC に false-positive。thread.aui.tsx と同方針)。
  `tool-registry.aui.tsx` の `TOOL_DISPLAY` map を非 export にし react-refresh を満たした。**lint 再実行で 0 error / 0 warning を確認。**

### CONV-L-001 [Low] 可視 UI ラベル "Subagent" が Principle XV (日本語第一) と不整合
- **Where**: `subagent.aui.tsx` ヘッダ "Subagent" (glossary 日本語表記 = サブエージェント) / "Todo" / "Bash"。
- **→ 解消 (2026-09-25)**: `subagent.aui.tsx` ヘッダを **"サブエージェント"** に変更 (glossary canonical)。
  "Bash" (ツール固有名詞) / "Todo" (定着した loanword) は tool 由来ラベルとして据え置き。

### CONV-L-002 [Low] 新設 element のサブ要素に `data-slot` 無く house style と不揃い
- **Where**: 新設 element は root のみ `data-slot`、サブ要素は `aui-*` class のみ (cf. tool-fallback.aui.tsx は各サブ要素に data-slot)。
- **判断**: **accepted (非対処)**。純粋にスタイリング/テスト指定の一貫性で実害なし、reviewer も「任意」と評価。root の `data-slot="aui_*"` は house style と一致。

## Verdict
convention-reviewer: Critical 0 / High 0 / Medium 1 / Low 2 · **MUST_FIX = 0**。
Medium (M-001) と Low (L-001) は code-gate 内で解消。L-002 は accepted。
