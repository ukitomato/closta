# a11y-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: a11y-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC (UI に関わるもの): FR-001, FR-006 / FR-007, SC-002。US-2 AC2〜AC4 と US-1 AC6。
- touched files に該当する charter / Confirmation: docs/domains/session/charter.md。Constitution XIII / XV は labels.ts の `Record` 網羅と既存トークンの使用で守られている。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer が担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer が担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が担当
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:0 Medium:2 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

対象は LaunchDialog.tsx のランタイム select (無効 option と `aria-describedby`)、RuntimeListScreen.tsx の `Win32ClaudeSection`、labels.ts / launch-runtime-options.ts。

- label 関連付け: `id="win32-claude-guidance"` と select の `aria-describedby` (LaunchDialog.tsx:524-547)。
- 無効な Win32 option はラベル末尾に状態の文字列を添える (launch-runtime-options.ts:39-44)。
- ボタンは shadcn `Button` (`focus-visible:ring-[3px]`)。
- コントラスト: 既存の `text-muted-foreground` / `text-destructive` だけ。独自色なし。
- テスト: axe (`color-contrast` 無効) と `aria-describedby`、option の disabled (LaunchDialog.test.tsx:1440-1452, RuntimeListScreen.test.tsx:62-71)。

Critical / High に当たる観察事実は無い。

## Findings

### [Medium] ランタイム一覧の claude 状態が変わっても支援技術に通知されない (M-001) (scope: feature)

- **観察**: `RuntimeListScreen.tsx:134-135` の状態ラベルと理由は通知の領域に入っていない。`updated` / 解除成功は `setNotice(null)` で何も出ない (通知は `rejected` / `save-failed` の `role="alert"` (147 行) だけ)。LaunchDialog.tsx:538-547 の案内も live region ではない。
- **リスク/影響**: WCAG 2.1 SC 4.1.3。
- **推奨アクション**: `<p role="status">` を常設し、`updated` で固定文を入れる (パスは出さない)。

### [Medium] 「指定を解除」の成功でボタンが消え、「選ぶ」は処理中に disabled になるため、キーボードのフォーカスが失われる (M-002) (scope: feature)

- **観察**: `RuntimeListScreen.tsx:137-144`。解除成功で `claudeOverridden` が false になりフォーカス中のボタンが消える。`busy` の間は両ボタンが `disabled`。`ref` / `focus()` の退避先なし。
- **リスク/影響**: WCAG 2.1 SC 2.4.3。
- **推奨アクション**: 解除成功後に「claude.exe を選ぶ」へフォーカスを戻す、または `aria-disabled` + 二重実行ガード。

### [Medium] H: 新規に足した UI の a11y 検査が、フォーカス移動と通知の観点を持たない (M-003) (scope: feature)

- **観察**: RuntimeListScreen.test.tsx:84-141 に `updated` 後の status / フォーカス位置の assert が 0 件。
- **推奨アクション**: M-001 / M-002 の修正と同時にテストを足す。

### [Low] Win32 が選択されていなくても、ランタイム select に Win32 用の案内が `aria-describedby` で結ばれる (L-001) (scope: feature)

- **観察**: `LaunchDialog.tsx:528`。読み上げが冗長になるだけ。対応は任意。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade_enforce の対象は無い。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `aria-live\|role="status"\|\.focus\(\)\|useRef` (runtime-list 非テスト) | 1 | src/renderer/src/features/runtime-list/RuntimeListScreen.tsx:275 |
| M-002 | 同上 | 0 | - |
| M-003 | `RuntimeListScreen.test.tsx` のフォーカス・status の assert | 0 | - |
| L-001 | `aria-describedby` の Win32 関連 | 1 | src/renderer/src/features/session/LaunchDialog.tsx:528 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 1
