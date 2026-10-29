# po-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC:
  - US-1 (P1): FR-001〜FR-004、FR-008〜FR-010 / SC-001、SC-003、SC-007
  - US-2 (P1): FR-005〜FR-007 / SC-002
  - US-3 (P2): FR-011〜FR-013 / SC-004
  - US-4 (P2): FR-014〜FR-015 / SC-005
  - US-5 (P3): FR-016〜FR-018 / SC-006
- touched files に該当する charter / Confirmation: ui charter Mission (`docs/domains/ui/charter.md:48-51`)、KPI「日本語の健全性」(SC-007)、AD-065 Confirmation、AD-037
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:1 Low:3
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲: 該当なし: optional reviewer が担当 (a11y / ux / ui-coverage)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

利用者が実機で報告した 6 項目を、User Story 5 本・FR 18・SC 7 で直した PR である。design-gate の po-reviewer が出した High 2 件は実装で閉じている (H-001 → `LIVE_MODEL_LIST_FAILURE_LABELS`、H-002 → `reportedCount` と `noModelForEffort`)。design-gate の M-001 の「出口が無い」も `LivePane.tsx` の `onFocus` で実質的に解けている。

PR で新たに見つかったのは主に US-3 の停止ボタンの見た目である。

## Findings

### [High] 停止ボタンの class 名の typo で `size-7` が効かず、停止ボタンが送信ボタン (28px) より大きい 36px で描かれる (H-001) (scope: feature)

- **観察**: `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:861` は `className="aui-composer-cancelsize-7 rounded-full"`。元の値は `"aui-composer-cancel size-7 rounded-full"` (`.pr-gate.diff:5683-5684`)。`size="icon"` の既定は `size-9` (`src/renderer/src/components/ui/button.tsx:42`)。送信ボタンは `size-7` (`thread.aui.tsx:837`)。tasks FE-030 (`tasks.md:84`) は「大きさ・丸・場所・アイコン・`aria-label` は変えない」と明記している。
- **同種事象探索**: `aui-composer-cancelsize` 1 件、diff の追加行の連結 className 1 件 (同じ箇所)
- **リスク/影響**: US-3 の価値「停止を誤って押さない」に反し、押しやすさがむしろ上がる。生成の開始と終了のたびに composer の action の行の高さが変わる (RK-05)。SC-004 の単体は `data-variant` しか見ていない (`composer-escape.test.tsx:102-106`)。
- **推奨アクション**: `thread.aui.tsx:861` を `className="aui-composer-cancel size-7 rounded-full"` に戻す。`composer-escape.test.tsx` に停止ボタンが `size-7` を持つことを足す。
- **根拠**: spec US-3 AC1 / FR-011、tasks FE-030、plan RK-05
- **scope 根拠**: touched file の 1 行

### [Medium] SC-004 の自動の確認は「variant が違う」だけで、大きさまで固定していない。H-001 の regression を CI が通した (M-001) (scope: feature)

- **観察**: `composer-escape.test.tsx:102-106` は `data-variant === 'outline'` だけ。`e2e/ime.spec.ts:364-405` は表示と消滅だけ。生成中の composer の基準画像は無い。
- **推奨アクション**: 単体で停止ボタンと送信ボタンが同じ size の class を持つことを固定する。E2E で停止ボタンの幅が送信ボタン以下であることを 1 行足す。
- **根拠**: H 観点、SC-004

### [Medium] SC-002 の「実機で 1 回切り替える」と RK-03 が未確認のまま (M-002) (scope: feature)

- **観察**: `quickstart-results.md:28-30` で V-1〜V-9 がすべて未実施。E2E (`e2e/live-session-settings.spec.ts:438-465`) は偽の 2 件で切り替えている。実際の `ModelInfo.value` が `setModel` で拒否される可能性 (plan RK-03) は未確認。roadmap の O-13 の行 (`docs/roadmap.md:388`) は「未実施」と記録しており、夜間の規則には沿っている。
- **推奨アクション**: 実機で V-1 / V-2 を行い、結果を `quickstart-results.md` に書く。design-gate M-002 からの持ち越し。
- **根拠**: PO-2

### [Low] `RESUME_PICKER_LABELS.close` が定義だけで使われていない (L-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/labels.ts:488` に `close: '閉じる'`。`ResumePickerDialog.tsx` は `showCloseButton={false}` で参照 0 件。
- **推奨アクション**: 閉じるボタンを出すか、文言を消す。
- **根拠**: PO-6

### [Low] SC-005 の E2E は、右のパネルの幅が 320px であることを assert していない (L-002) (scope: feature)

- **観察**: `e2e/right-panel.spec.ts:583-653`。
- **推奨アクション**: パネルの幅が `SHELL_WIDTHS.panel` (320) であることを 1 行 assert する。

### [Low] `/resume` の選ぶ画面に今のセッション自身が出る (RK-09) ことが、spec の Edge Cases に書かれていない (L-003) (scope: feature)

- **観察**: plan `RK-09` (`plan.md:392`) では既知の制限。spec の Edge Cases (`spec.md:168-177`) と `e2e/resume-command.spec.ts` は扱っていない。design-gate M-004 からの持ち越し。
- **推奨アクション**: Edge Cases に既知の制限として 1 行足す。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `cancelsize\|aui-composer-cancel` (repo) | 1 (typo) | src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:861 |
| H-001 | `^\+.*className="[^"]*[a-z](size\|rounded\|flex\|min\|max\|text)-` (.pr-gate.diff) | 1 | .pr-gate.diff:5684 |
| L-001 | `RESUME_PICKER_LABELS\.close` (src/renderer/src/features/session) | 0 | 定義は labels.ts:488 だけ |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 3
