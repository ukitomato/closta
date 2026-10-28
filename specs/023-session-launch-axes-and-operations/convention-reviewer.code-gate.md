# convention-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-29
**Reviewer**: convention-reviewer
**Gate**: code-gate iter 1 (status=reviewing からの再実行。pr-gate round 1 の High 修正 4428b06 を含む)
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- lint-agent JSON の受領: あり。`exit_code: 0`。5 コマンドすべて exit 0。eslint error 0 / warning 445 (すべて `prettier/prettier`)。constitution ok 20 / violation 0 / no-target 1
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner (constitution 検証は violation 0)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:3
- G. optional reviewer 範囲: 該当なし: convention-reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (4428b06 の各修正に対応するテストが同コミットにある)

## スコープ要約

scope 76 ファイル (`1a7d8b4..HEAD`)。4428b06 の追加 (check.mjs の再 export 検査、`LiveSettingsControls.tsx` の `useConfirmedSelect` hook、fixture 2 本) は命名・配置・参照とも既存規則に一致。depcruise 0 violation。

## Findings

### [Medium] M-001 prettier/prettier の warning が新規コードに約 40 件残っている (scope: feature)

- **観察**: 445 件中 405 件は `LiveSettingsControls.test.tsx` の作業ツリー CRLF (L-001)。残り 40 件は整形差分 (`check.mjs:710,712,725`、`session-launch-service.test.ts:1046-1054` ほか)
- **同種事象探索**: lint-agent JSON の `rule == prettier/prettier` → 445 件
- **推奨アクション**: format で整形。AD-050 により棚卸しで扱ってよい
- **根拠**: CONV-1

### [Medium] M-002 `session-launch-service.ts` が 500 行の目安を超えている (scope: feature) — 前回から継続

- **観察**: 612 行。`validate.ts` 519 行、`ipc.ts` 503 行も新たに超過
- **同種事象探索**: `wc -l` 再計測 → 新規超過 3 件
- **推奨アクション**: 棚卸しで切り出し
- **根拠**: CONV-3

### [Low] L-001 作業ツリーの `LiveSettingsControls.test.tsx` が CRLF (scope: feature)

- index は LF (`i/lf w/crlf`)。リポジトリ上は問題ない。作業ツリーを LF に正規化すれば warning 405 件が消える

### [Low] L-002 `.vitest/json/output.json` が未追跡のまま残る (scope: out-of-scope)

- コミットしない。必要なら `.gitignore` へ (棚卸し)

### [Low] L-003 前回の継続: 既存の大きいファイルへの追記、FE-030 の記録上のファイル名差 (scope: feature)

- 直さない。棚卸し

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent JSON の `rule == prettier/prettier` | 445 (CRLF 405 + 整形 40) | 上記 |
| M-002 | `wc -l` の 500 行超 | 3 (新規) | src/main/app/session-launch-service.ts:612, validate.ts:519, ipc.ts:503 |
| L-001 | `git ls-files --eol` で `i/lf` 以外 | 0 (index) / 作業ツリー CRLF 1 | src/renderer/src/features/shell/LiveSettingsControls.test.tsx |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3
