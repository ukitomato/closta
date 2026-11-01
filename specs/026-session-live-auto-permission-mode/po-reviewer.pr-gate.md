# po-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01
**Reviewer**: po-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012、SC-001〜SC-005 (SC-005 は quickstart V-3 で未実施)。
- charter / Confirmation: session charter の業務ルール (`docs/domains/session/charter.md:192`)、Out of scope の注記 (`:88`)、isolation charter、AD-066 (proposed)。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:1 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:2 Medium:0 Low:1

## スコープ要約

US-1 (P1) 1 本。起動の設定と実行中の composer で Auto を選べる。隔離の無いランタイムでは毎回確認、main は印の無い要求を拒否、Auto の間は帯、プリセット版 3、再開の初期値で Auto を `default` に戻す。Constitution III 改定 (1.6.0) と AD-066 (proposed) を含む。quickstart V-1〜V-5 は未実施。

## Findings

### [High] FR-012 / Edge Case 4 (プリセットの `auto` は適用の後も確認を省かない) に renderer のテストが無い。tasks では FE-013 が完了になっている (H-001) (scope: feature)

- **観察**: 実装は `LaunchDialog.tsx:542-546` (`applyPreset` が `setAutoAckRuntimeId(null)`) と `:610` 付近にある。しかし `LaunchDialog.test.tsx:2179-2319` に次のテストが無い: (1) プリセットで `auto` を適用 → 起動で確認が出る、(2) 承諾 → `default` → `auto` のプリセット → 起動で再確認 (design-gate H-001)、(3) 承諾 → `default` → 起動で `ack === false`、(4) Provider の確認と Auto の確認が同時に描かれない、(5) 判定中 (`unknown`) のランタイムで確認が出る (Edge Case 6)。`LaunchDialog.resume.test.tsx:293-313` も承諾の経路だけで、取り消しで `resumeSession` が呼ばれないこと (H-003) と安全 3 値の再開で印 `false` が無い。`tasks.md:63-64` (FE-013) はこれらを観点に挙げて `[x]`。
- **同種事象探索**: `permissionMode: 'auto'` in src/renderer 7 件、うちプリセットのテスト 0 件 (`LaunchDialog.test.tsx:2232,2251,2291` / `LaunchDialog.resume.test.tsx:308` / `resume-action.test.tsx:258` / `RunningSessionsProvider.test.tsx:210` / `LaunchDialog.tsx:621`)。判定中ランタイムのテスト 0 件。
- **リスク/影響**: `send()` は `ack = requiresAutoModeConfirmation(...)` を載せる (`LaunchDialog.tsx:589` 付近) ため、renderer の分岐が退行して確認を飛ばしても main は通す。回帰の検出は renderer の単体テストにしか無く、AC1 / AC5 と FR-012 を 1:1 で検証できない。
- **推奨アクション**: 上記 (1)〜(5) を `LaunchDialog.test.tsx` に、取り消しで `resumeSession` 0 回と安全 3 値の再開で印 `false` を `LaunchDialog.resume.test.tsx` に足す。
- **根拠**: spec FR-012 / Edge Cases 4・6 / US-1 AC1・AC5、tasks FE-013、design-gate H-001 / H-003

### [High] SH-012 は完了になっているが、SC-001 / SC-004 の計測経路の E2E と、SC-002 の計測経路の rule fixture の照合を実行していない (H-002) (scope: feature)

- **観察**: SC-001 / SC-004 は E2E (`spec.md:93`, `:96`)、SC-002 は項目 16 の rule fixture (`spec.md:94`) を計測経路とする。`tasks.md:80` (SH-012) は E2E と rule fixture の照合を求めて `[x]`。`quickstart-results.md:18-19` は「rule fixture の照合: agent は実行しない」「E2E: 未実施」。新設の E2E 2 本 (`e2e/launch-dialog.spec.ts:540-577`、`e2e/live-session-settings.spec.ts:591-634`) は実行記録が無い。
- **同種事象探索**: `未実施|実行しない` in quickstart-results.md で 7 件 (V-1〜V-5 と `:18-19`)。SC-005 が許すのは V-1〜V-5 だけ。
- **リスク/影響**: SC-001 / SC-004 の E2E 側、SC-002 の rule fixture 側を評価できない。tasks の完了の印が実態と食い違う。
- **推奨アクション**: E2E (2 spec) と `test:rules` を実行し `quickstart-results.md` に書く。できないなら SH-012 を `[ ]` に戻すか未実行と明記し、PR 本文で該当 SC を「未計測」と書く。
- **根拠**: spec SC-001 / SC-002 / SC-004、tasks SH-012

### [Medium] 実行中の Auto の確認が開いている間は、アプリ全体の Escape を window の capture で奪う (M-001) (scope: feature)

- **観察**: `AutoModeConfirmation.tsx:38-48` は `window.addEventListener('keydown', …, true)` で Escape を取り消しに使う。`LivePane.tsx:345-361` の確認は非モーダル。
- **同種事象探索**: 新設の `addEventListener('keydown'` は 1 件。
- **推奨アクション**: `e.target` が確認の枠の中のときだけ取り消す等。テストを足す。
- **根拠**: spec Edge Cases、Principle XIII / VIII

### [Low] 外部の変更で Auto → 他の値 → Auto と戻ったときも、利用者が選んだ文言の帯と読み上げになる (L-001) (scope: feature)

- **観察**: `CenterBanners.tsx` の `autoShown = isAutoPermissionMode(mode) && isAutoPermissionMode(chosen)` は途中で観測が Auto の外に出た事実を見ない。spec Edge Case 3 と食い違う。
- **推奨アクション**: 観測が Auto の外に出たら `chosenPermissionMode` を合わせるか、Edge Case 3 の文面を明確にする。

### [Low] テストの名前「隔離つきで確かめ済み (autoModeAllowed)」が U-6 の定義と逆に読める (L-002) (scope: feature)

- **観察**: `LaunchDialog.test.tsx:2282`、`LivePane.settings.test.tsx:418` 付近。U-6 / FR-005 は「true は sandbox を使える、であって隔離の中で動くではない」。
- **推奨アクション**: 名前を「sandbox を使える (autoModeAllowed true。U-6 の受け入れたリスク)」にする。

### [Low] `auto-mode-unconfirmed` の起動の拒否の文が案内する回復の手順が成り立たない (L-003) (scope: feature)

- **観察**: `labels.ts:85`「権限モードを選び直して確認してください」。この拒否は renderer と main の判定の食い違い時だけ起き、選び直しても確認は出ない。
- **推奨アクション**: ダイアログの開き直しを促す文にするか、拒否時にランタイム一覧を取り直す。
- **根拠**: PO-6

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `permissionMode: 'auto'` in src/renderer | 7 (プリセットのテスト 0) | LaunchDialog.test.tsx:2232,2251,2291 / LaunchDialog.resume.test.tsx:308 / resume-action.test.tsx:258 / RunningSessionsProvider.test.tsx:210 / LaunchDialog.tsx:621 |
| H-002 | `未実施\|実行しない` in quickstart-results.md | 7 | quickstart-results.md:5-9,18,19 |
| M-001 | `addEventListener('keydown'` (新設) | 1 | AutoModeConfirmation.tsx:46 |
| L-001 | `chosenPermissionMode` の書き換え | 2 | running-session-store.ts |
| L-002 | `隔離つきで確かめ済み` | 2 | LaunchDialog.test.tsx:2282 / LivePane.settings.test.tsx:418 |
| L-003 | `auto-mode-unconfirmed` の文言 | 2 | labels.ts:85 / LIVE_SETTING_LABELS |

## Verdict

- Critical: 0
- High: 2
- Medium: 1
- Low: 3
