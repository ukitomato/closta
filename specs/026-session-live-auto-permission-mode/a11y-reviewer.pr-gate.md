# a11y-reviewer Review: 権限モードの Auto (起動と実行中) (026-session-live-auto-permission-mode)

**Run**: 2026-11-01
**Reviewer**: a11y-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: FR-001/002, FR-005, FR-008, FR-012, SC-001, SC-004。
- charter / Confirmation: docs/domains/session/charter.md (Principle VIII の IME と XIII の Escape)、AD-066。対象 UI: `AutoModeConfirmation.tsx`、`LaunchDialog.tsx`、`LivePane.tsx`、`LiveSettingsControls.tsx`、`CenterBanners.tsx`。vendored primitive は変更なし。
- A. 認可 / 認証 / secret 管理: 該当なし: 担当外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: 担当外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: 担当外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: 担当外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: 担当外 (po-reviewer)
- F. 命名 / module / lint hookup: 該当なし: 担当外 (convention-reviewer)
- G. optional reviewer 範囲 (WCAG): Critical:0 High:0 Medium:1 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

native `<select>` に Auto を追加 (2 か所)、新部品 `AutoModeConfirmation` (`role="alertdialog"`、開いた時点で焦点を「取り消す」、window capture の Escape)、Auto の帯 (`role="note"`) と常時 mount の `role="status"` sr-only 読み上げ (`CenterBanners.tsx`)、`LivePane` への確認の組み込み。LivePane 側の焦点の行き来・live region・IME 除外・読み上げ 1 回は良い (`LivePane.settings.test.tsx:377-415`)。

## Findings

### [Medium] 起動ダイアログで Auto の確認を閉じると焦点の行き先が失われる (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/LaunchDialog.tsx:1184-1190` で `onCancel={() => setAutoConfirm(null)}` と `acceptAuto` で閉じるが、焦点の戻し先が無い。`AutoModeConfirmation.tsx:34-36` は mount 時に「取り消す」へ焦点を移すので、unmount で焦点が body / ダイアログ container に落ちる。LivePane は `focusComposerIn(paneRef.current)` で戻している (`LivePane.tsx:352, 357`)。
- **同種事象探索**: `\.focus\(|autoFocus|returnFocus` を LaunchDialog.tsx に掛けて 0 件。既存の Provider 確認 (`LaunchDialog.tsx:1154-1182`) も同種 (026 以前から)。
- **リスク/影響**: キーボード・SR 利用者が位置を見失う。WCAG 2.4.3。回復可能なので Medium。
- **推奨アクション**: 開く前の要素 (select か起動ボタン) を覚え、`onCancel` / `onAccept` の後に `focus()` する。
- **根拠**: WCAG 2.1 SC 2.4.3 / APG のダイアログ

### [Low] Auto の帯の文字色のコントラスト余白が薄く、Quota 帯の info と色が揃っていない (L-001) (scope: feature)

- **観察**: `src/renderer/src/features/shell/CenterBanners.tsx:112` は `text-amber-700` on `bg-amber-500/10` で約 4.65:1。`:259` の Quota 帯は `text-amber-800`。
- **推奨アクション**: `text-amber-800` に揃える。
- **根拠**: WCAG 1.4.3

### [Low] Auto の確認の Escape が window 全体の capture で、別の場所の Escape も取り消しに使われる (L-002) (scope: feature)

- **観察**: `AutoModeConfirmation.tsx:38-48` は `window` capture で `keydown` を聞き `stopPropagation` / `preventDefault` する。LivePane の確認は非モーダルで、composer の Escape を横取りする。
- **推奨アクション**: 非モーダル使用時は `e.target` が確認の中にあるときだけ処理する。
- **根拠**: WCAG 2.1.1

### [Medium] 確認と帯の a11y に対する自動検査とテストの穴 (H-001) (scope: feature)

- **観察**: LaunchDialog に Auto の確認を閉じたあとの焦点の assertion が無い (`toHaveFocus` / `activeElement` 0 件)。axe は `color-contrast` を無効 (`AutoModeConfirmation.test.tsx:40`、`LaunchDialog.test.tsx:1997, 2111, 2315`)。
- **推奨アクション**: M-001 の修正とあわせて、焦点が select に戻るテストを足す。
- **根拠**: reviewer-base の H

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `\.focus\(\|autoFocus\|returnFocus` (LaunchDialog.tsx) | 0 | 既存の Provider 確認も同種 (`LaunchDialog.tsx:1154-1182`) |
| L-001 | `text-amber-700` / `text-amber-800` (CenterBanners.tsx) | 2 | `CenterBanners.tsx:112`, `:259` |
| L-002 | keydown の capture 登録 (AutoModeConfirmation.tsx) | 1 | `AutoModeConfirmation.tsx:46` |
| H-001 | `toHaveFocus` (LaunchDialog.test.tsx) | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
