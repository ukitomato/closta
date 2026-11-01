# ux-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01
**Reviewer**: ux-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: FR-001, FR-002, FR-005, FR-008, FR-012 / SC-001, SC-004
- charter / Confirmation: session charter、Principle III / VIII / XIII / XV。code-gate の must_fix は 0 件。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。UX の実装完成度は G に記録
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ux): Critical:0 High:0 Medium:3 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

確認の部品 `AutoModeConfirmation.tsx`、`LaunchDialog.tsx` / `LivePane.tsx` の確認の流れ、`CenterBanners.tsx` の `AutoModeBanner` / `AutoModeAnnouncer`、`LiveSettingsControls.tsx` の選択肢、文言 (`session/labels.ts` / `shell/labels.ts`)。確認の本文・初期焦点・Escape・IME 除外・承諾まで前の値・帯と読み上げの分離は手当て済み。

## Findings

### [Medium] 起動時の確認の承諾ボタンが「Auto にする」のままで、実際の動作 (起動) と食い違う (M-001) (scope: feature)

- **観察**: `AutoModeConfirmation.tsx:63-65` の承諾ボタンは `session/labels.ts:457` の「Auto にする」。`LaunchDialog.tsx:616-627` の `acceptAuto` は `'launch'` のとき `send(launchConfig)` で起動する。
- **同種事象探索**: `AUTO_MODE_CONFIRMATION_LABELS.accept` で 1 件 (`AutoModeConfirmation.tsx:64`)。`kind` の出し分けは 0 件。
- **推奨アクション**: `kind` を部品に渡し、`'launch'` では「Auto で起動する」系の文言にする。
- **根拠**: UX-5

### [Medium] 実行中の Auto への変更が失敗したとき、原因も次の手も出ない。専用の文言も表示に届いていない (M-002) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:461-475` は種別の汎用文言だけ。`settingError` は理由を持たない (`running-session-store.ts:1011-1021, 1038-1041`)。`LIVE_SETTING_LABELS['auto-mode-unconfirmed']` (`labels.ts:465`) と `LIVE_MODEL_LIST_FAILURE_LABELS['auto-mode-unconfirmed']` (`labels.ts:507`) は画面から引かれていない。
- **同種事象探索**: 描画側 1 件 (`LiveSettingsControls.tsx:473`)、理由で引く経路 0 件。
- **推奨アクション**: (a) 理由を持たせ Auto 用の一言を出す、または (b) 使わない文言を消す。
- **根拠**: UX-2

### [Medium] 起動ダイアログでは確認を閉じたあとの焦点が選択欄に戻らない (M-003) (scope: feature)

- **観察**: `LivePane.tsx:350-358` は `focusComposerIn` で戻すが、`LaunchDialog.tsx:1184-1189` には戻す処理が無い。
- **同種事象探索**: 焦点復帰は `LivePane.tsx` 2 件、`LaunchDialog.tsx` 0 件。
- **推奨アクション**: `'select'` は select へ、`'launch'` は起動ボタンへ焦点を戻す。
- **根拠**: UX-7 / UX-9

### [Low] Auto の帯の文に実装用語「composer」が混ざる (L-001) (scope: feature)

- **観察**: `shell/labels.ts:177` の `autoModeRevert`。画面の入力欄の名前は「メッセージ」(`chat/labels.ts:579-580`)。
- **推奨アクション**: 「権限モードの選択からいつでも戻せます」などにする。
- **根拠**: UX-6 / Principle XV

### [Low] 確認の本文の「分類器」は説明のない用語 (L-002) (scope: feature)

- **観察**: `labels.ts:456`、`shell/labels.ts:176`。
- **推奨アクション**: 初出で一言添える。

### [Low] 確認の取り消しボタンの語が他の確認とそろっていない (L-003) (scope: feature)

- **観察**: 「取り消す」(`labels.ts:458`) / 「キャンセル」(`:472`) / 「やめる」(`:754`) / 「戻って選び直す」(`LaunchDialog.tsx:1177-1179`)。
- **推奨アクション**: 棚卸しで扱う。

### [Low] 確認の Escape は window の capture で、非 modal の `LivePane` では他の Escape も飲み込む (L-004) (scope: feature)

- **観察**: `AutoModeConfirmation.tsx:38-48`。`ConversationSearchProvider.tsx:179` / `CommandPalette.tsx:123` の Escape が効かなくなる。
- **推奨アクション**: 確認の中に焦点があるときだけ捕まえる。

### [Low] 選択肢の「Auto」に確認が要ることの手がかりがない (L-005) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:276-280`、`LaunchDialog.tsx:953-957`。AD-065 Decision 3 の方針どおり。
- **推奨アクション**: 対応不要。

### [Medium] 確認の UX の主要な分岐を検出するテストの欠け (H-M01) (scope: feature)

- **観察**: M-001 の文言の出し分け・M-002 の Auto 失敗時の表示・M-003 の焦点・L-004 の Escape 飲み込みを検出するテストが無い。
- **推奨アクション**: M-001 / M-003 を直すときにテストを足す。

### [Low] 既存の振る舞いを壊していない根拠と観測点 (H-L01) (scope: feature)

- **観察**: 安全 3 値は確認なしで印 false (`LivePane.settings.test.tsx:430`)。UI 層の観測点は無い。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `AUTO_MODE_CONFIRMATION_LABELS.accept` / `kind` 出し分け | 1 / 0 | `src/renderer/src/features/session/AutoModeConfirmation.tsx:64` |
| M-002 | `LIVE_SETTING_LABELS\[` / `.failure\[` | 1 / 0 | `src/renderer/src/features/session/LiveSettingsControls.tsx:473` |
| M-003 | `focusComposerIn` / 焦点復帰 | 2 / 0 | `src/renderer/src/features/session/LivePane.tsx:352,357` |
| L-001 | `composer\|コンポーザ\|入力欄` (labels の文言) | 1 | `src/renderer/src/features/shell/labels.ts:177` |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 6
