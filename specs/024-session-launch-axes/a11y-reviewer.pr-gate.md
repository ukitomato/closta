# a11y-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Reviewer**: a11y-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1 (pr-gate, system scope。起動パターン `src/renderer/src/features/session/**/*.tsx`)

## 初回読了 viewpoint

- FR/SC (UI に関わるもの): FR-001 追加ディレクトリの軸 (登録フォルダの選択で、パス入力なし)、FR-004 上限の入力 2 つ、FR-007 セッション名の入力 (IME の Enter は SC-005 / Principle VIII)、FR-012 再開の形での出し分け、FR-013 概要のタブ、SC-005 コンポーネントテスト (tasks.md の FE-030 に「vitest-axe の違反 0」の記述あり)。
- charter / Confirmation: Constitution Principle VIII (IME)、Principle XIII (素の form 部品と `Button`。research R-11 で承認済み)。session charter に a11y 固有の義務は無し (Grep 0 件)。該当 ADR は AD-064 (renderer の UI は対象外)。
- 見た UI ファイル: `LaunchExtraAxes.tsx` (新規)、`LaunchDialog.tsx`、`PresetPanel.tsx`、`shell/OverviewTab.tsx`、`labels.ts` / `launch-extra-axes.ts`、テーマ `assets/main.css`
- code-gate の `must_fix_findings` は空なので、重複して除外する where は無い。vendored primitive (`src/renderer/src/components/ui/*`) は指摘対象外。

- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の担当外 (po-reviewer が担当)
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:1 Medium:2 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

起動ダイアログに追加ディレクトリ (fieldset/legend + 選択 + 一覧)、上限 2 欄、セッション名の欄を足し、概要のタブに 3 行を足した変更である。

- 全体として WCAG の基本は押さえられている。入力はすべて `<label>` で包み、エラーは `aria-invalid` + `aria-describedby` + `role="alert"` の組。外すボタンは「外す: <名前>」。追加ディレクトリは `fieldset`/`legend`。概要は `dl`。
- 色は既存トークンのみで、色だけに意味を載せていない。`text-destructive` は light で約 4.8:1。
- native の input / select は outline を消していない。アニメーション・`<html lang>`・画像の追加は無い (A11Y-7/8/9 該当なし)。

観察できた問題は、キーボード操作の経路 (A11Y-2) と動的通知 (A11Y-5 / A11Y-6) に集中している。

## Findings

### [High] セッション名欄の Enter が、確認中の「既定 Provider での起動の確認」を素通りして起動する (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/LaunchExtraAxes.tsx:102-109` は名前欄の Enter で `props.onSessionNameSubmit()` を呼ぶ。
  - `src/renderer/src/features/session/LaunchDialog.tsx:915` はこれに `launch` を直結している。
  - `src/renderer/src/features/session/LaunchDialog.tsx:550-556` の `launch` は、`needsConfirmation && !confirming` のときは `setConfirming(true)` して return し、すでに `confirming === true` のときはそのまま `setConfirming(false)` して `session.launch` に進む。
  - 名前欄は `confirming` 中も disabled にならず、確認の `alertdialog` (`LaunchDialog.tsx:1070`) にフォーカスも移らない。`confirming` を落とすのは `onSessionNameChange` (入力変更) だけである。
- 経路:
  1. Provider が既定に戻った状態で名前欄にフォーカスし、Enter を押す。確認が出る。
  2. もう一度 Enter を押す (二度押し・キーリピート)。確認ボタン「既定 Provider で起動する」を押さずに、既定の資格情報・課金先で起動する。
- **同種事象探索**: `onSessionNameSubmit|onKeyDown|requiresConfirmation` を `src/renderer/src/features/session/*.tsx` で検索。Enter で `launch` に入る経路は `LaunchExtraAxes.tsx:102-107` の 1 件だけ。上限の 2 欄には Enter の起動は無い。テストは `LaunchDialog.test.tsx:2059-2070` が IME と通常の Enter だけで、確認中の Enter は 0 件。
- **リスク/影響**: 「既定の資格情報・課金先で黙って起動させない」(`LaunchDialog.tsx:106` の規則表・US-2 AC3) の確認が、Enter 1 回で無効になる (WCAG 3.2.2 / 3.3.4 の趣旨)。確認は課金先の取り違えを防ぐ安全弁なので High。
- **推奨アクション**: 名前欄の Enter 経路は `confirming` 中は何もしない (例 `onSessionNameSubmit={() => { if (!confirming) launch() }}`)。確認中は名前欄の Enter を無効にするテストを `LaunchDialog.test.tsx:2059` の隣に足す。
- **根拠**: WCAG 2.1 SC 3.2.2 (On Input)、LaunchDialog の規則表、024 spec US-2 AC3 の系列 (X-4 US-2 AC3)。
- **scope 根拠**: 024 で新規に足した `LaunchExtraAxes.tsx` の Enter ハンドラと `LaunchDialog.tsx:915` の結線。

### [Medium] 上限欄の `role="alert"` が、入力の途中で一時的に不正な値のたびに読み上げられる (M-001) (scope: feature)

- **観察**: `LaunchExtraAxes.tsx:67-71` と `87-91` は入力が不正になるたびに `role="alert"` を出す。検証は毎キー入力で走る (`LaunchDialog.tsx:920-931`)。「0.5」と打つ途中の「0」と「0.」が不正になり、一瞬 alert が出て消える (`launch-extra-axes.ts:28-30`)。
- **同種事象探索**: `role="alert"` を `LaunchExtraAxes.tsx` で 3 件 (`:68` / `:88` / `:116`)。
- **リスク/影響**: スクリーンリーダー利用者は正しい値を打っている最中に割り込まれる (WCAG 3.3.1 / 4.1.3)。
- **推奨アクション**: alert は blur か起動の試行時に出す。入力中は `aria-live="polite"` に落とす、または途中入力を不正に数えない。範囲のヒントを常設の説明文にする。
- **根拠**: WCAG 2.1 SC 3.3.1 / 4.1.3。
- **scope 根拠**: 024 の新規部品。

### [Medium] 追加ディレクトリの「外す」の後にフォーカスが失われる (M-002) (scope: feature)

- **観察**: `LaunchExtraAxes.tsx:152-160` の外すボタンは押すと `li` (最後の 1 件なら `ul` ごと) が unmount される。フォーカス移動のコードは無い。
- **同種事象探索**: `\.focus\(|autoFocus|ref=` を `LaunchExtraAxes.tsx` / `LaunchDialog.tsx` で 0 件。
- **リスク/影響**: フォーカスが `body` に落ち、キーボード利用者は先頭から Tab を取り直す (WCAG 2.4.3)。追加側も何が足されたかの通知が無い。
- **推奨アクション**: 外した後は隣の外すボタンか「フォルダを追加」の select にフォーカスを移す。件数変化を `aria-live="polite"` で通知する。
- **根拠**: WCAG 2.1 SC 2.4.3。
- **scope 根拠**: 024 の新規部品。

### [Medium] H 観点: 上記の keyboard / 動的通知の経路を検出するテストが無い (M-003) (scope: feature)

- **観察**: 確認中の Enter (H-001)、外した後のフォーカス (M-002)、途中入力で alert が出ないこと (M-001)、無効の理由 (L-001) のテストが見当たらない。`toHaveAccessibleDescription` / `toHaveFocus` は `LaunchDialog.test.tsx` に 0 件。
- **推奨アクション**: H-001 の修正に確認中の Enter のテストを足す。M-001 / M-002 の修正と同じ PR で `toHaveFocus` と `toHaveAccessibleDescription` を足す。
- **根拠**: reviewer-base の H 観点。

### [Low] 無効化された「フォルダを追加」に理由が無い (L-001) (scope: feature)

`LaunchExtraAxes.tsx:136` `disabled={full || choices.length === 0}`。10 件到達と選択肢ゼロを区別せず理由の文言も無い。WCAG 2.1 SC 3.3.2。

### [Low] 既定値の意味が placeholder にしか無く、範囲・単位が入力前から見えない (L-002) (scope: feature)

`LaunchExtraAxes.tsx:60` / `80` の「上限なし」は placeholder だけ。範囲はエラー後にしか出ない (`labels.ts:563-564`)。WCAG 2.1 SC 3.3.2 / 1.4.3。

### [Low] 名前欄だけが Enter で起動し、上限欄は起動しない (L-003) (scope: feature)

`LaunchExtraAxes.tsx:102-109`。同じ形の欄で Enter の挙動が割れている。WCAG 2.1 SC 3.2.4。

### [Low] ARIA の細部 (L-004) (scope: feature)

`LaunchExtraAxes.tsx:148` の `ul aria-label` は `legend` と同文で冗長。`LaunchDialog.tsx:936-940` の `ul role="status"` は list 意味を消す (既存パターンの踏襲)。固定 id (`max-turns-range` 等) は `useId` にすべき。WCAG 2.1 SC 4.1.2 / 4.1.3。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `onSessionNameSubmit\|onKeyDown\|requiresConfirmation` (session/*.tsx) | 1 | `LaunchExtraAxes.tsx:102-107` / `LaunchDialog.tsx:915` |
| M-001 | `role="alert"` (`LaunchExtraAxes.tsx`) | 3 | `LaunchExtraAxes.tsx:68` / `:88` / `:116` |
| M-002 | `\.focus\(\|autoFocus\|ref=` | 0 | - |
| M-003 | `toHaveAccessibleDescription\|toHaveFocus` (`LaunchDialog.test.tsx`) | 0 | - |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 4
