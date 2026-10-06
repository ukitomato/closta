# po-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: po-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 3 (pr-gate。対象は R2 の修正の diff `a78a291..bcd6aa4`)

## 初回読了 viewpoint

- FR/SC (R2 の修正が触ったもの): FR-007 / US-2 AC3〜AC4 (`useShellFocus` の失敗した close の判定・`LaunchDialogHost` の外側の押下)、FR-008 / US-3 AC2・AC4 (戻り先・FE-031 の追記)、FR-002 / US-1 AC8 (`Sidebar` の `hidden` でのマウントの維持)、FR-003 / US-1 AC5 (文言)、SC-002 / SC-004 (計測経路の追記)、Edge Cases (ランタイム 0 件・入れ子のダイアログの Esc)、tasks FE-031 / FE-042
- touched files に該当する charter / Confirmation: ui charter の「面の状態」(`dismissLaunchNotice` を足した)、session charter の Related Specs (X-4 US-1 AC7 を狭めた)、AD-046 Confirmation の 1 つ目 (SC-001〜SC-005) と 2 つ目 (V-3)、roadmap の O-7 の行 (V-3b を completed の前の条件にした)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (FE-042 の U+202E は domain のテストが持つという記録を確かめただけ)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (X-4 US-1 AC7 を狭めた件は session charter に記録がある)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:0 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R2 の修正は src 21 files と docs/specs 15 files。R2 の自分の指摘 8 件はすべて閉じた (7 件は直り、M-005 は記録つきで受け入れ)。失敗した close の判定は `selectedId` に依らず、「`launch` が変わった」「`previousFailure` が立った」「`order` が減った」の 3 つがそろうこと。`close` 以外にこの組を作る経路は無い (`running-session-store.ts:515-558`)。中央に出していない失敗したセッションを閉じる経路のテストは `AppShell.test.tsx:1030`。`lastConfig` の扱いは data-model.md:38 に理由つきで決めてある。新しく見つけたのは、修正で足した計測経路の記録の正確さ 2 件と、spec が文言を丸ごと写している 1 件。どれも Low。

## R2 の指摘の判定

| R2 ID | R2 severity | 判定 | 確かめた事実 |
|---|---|---|---|
| M-101 | Medium | **resolved** (`lastConfig` は記録つきで受け入れ) | `useShellFocus.ts:39-53`、data-model.md:35 / :38、session / ui charter の追記、テスト `AppShell.test.tsx:1030-1044`。「選択が無い状態で閉じる」の専用テストは無いが同じ分岐を通る |
| M-005 | Medium | **resolved / 記録つきで受け入れ** | 入れ子のダイアログ: `:1046-1084`。SC-002 の設定の開閉: `:1132-1154`。SC-004: spec.md:244 / tasks.md:59。U+202E: tasks.md:69 (`build-normalize.test.ts:68,124` は実在)。FE-031 の AC4: tasks.md:58 (`composition-root.ts:197` / `session-service.test.ts:693` / `AppShell.test.tsx:856` は実在)。残り → L-201 / L-202 |
| M-004 | Low | **resolved** | spec.md:114、spec.md:194。テスト `:841` / `:856` |
| L-004 | Low | **resolved** (文面の写し → L-203) | spec.md:141 |
| L-101 | Low | **resolved** | `Sidebar.tsx:114`、data-model.md:76、テスト `:1086-1099`。スクロールの位置は V-3b #2 でしか確かめられない |
| L-102 | Low | **resolved** | `LaunchDialogHost.tsx:51`、data-model.md:52、テスト `:1046` |
| L-103 | Low | **resolved** | glossary.md:856、`session-view.ts:437`、`SessionAttentionAnnouncer.tsx:13` |
| L-104 | Low | **resolved** | quickstart-results.md:14,22,25 |

## Findings

### [Low] SC-002 の追記が「接続とキューの保持は V-3 (#3) で見た」と書くが、V-3 #3 が見たのは稼働中と過去の行き来だけ。設定のダイアログの開閉の後の接続とキューは、どの経路でも確かめていない (L-201) (scope: feature)

- **観察**: spec.md:240。V-3 #3 (quickstart-results.md:59) は設定の開閉を含まない。新しいテスト `AppShell.test.tsx:1132-1154` は開く前に届いたメッセージ・下書き・`selectedId` を確かめるだけで、閉じた後に新しいメッセージが届くか (接続) とキューは確かめていない
- **同種事象探索**: spec.md の計測経路で V-3 を引くもの 3 件。範囲が合わないのは :240 の 1 件
- **リスク/影響**: 壊れるおそれは低い (overlay で、中央も provider も unmount しない)。それでも計測経路が実際より広く満たされているように読める
- **推奨アクション**: `:1132` のテストで、閉じた後に `h.emit(A, …)` で 2 つ目のメッセージを送り、中央に出ることを確かめる。または :240 を絞る
- **根拠**: PO-2、spec SC-002、FR-004

### [Low] (H) US-3 AC4 (登録の後にサイドバーへ反映) の通しを「どこでも確かめていない」と記録したが、未実施の V-3b に行を足していない (L-202) (scope: feature)

- **観察**: tasks.md:58 と spec.md:244。AD-046 Confirmation の 1 つ目 (0046-app-shell-layout.md:54) は SC-001〜SC-005。V-3b (quickstart-results.md:71-82) に AC4 の行が無い。区間ごとのテストはある (`session-service.test.ts:693`、`SessionListScreen.test.tsx` の `onSessionsChanged`、`AppShell.test.tsx:856`)
- **推奨アクション**: V-3b に #7「設定の『作業フォルダ』で登録して閉じると、過去のセッションの区画に新しいフォルダのグループが出る」を足す
- **根拠**: PO-3、AD-046 Confirmation、spec SC-004 / US-3 AC4、reviewer-base の H 規則

### [Low] Edge Cases に足した「ランタイム 0 件」の行が、起動ダイアログの文言を全文で写している (L-203) (scope: feature)

- **観察**: spec.md:141 は `session/labels.ts:304-305` の文字列を写している。同じ diff でこの文言は変わっている
- **推奨アクション**: 「起動ダイアログの blocker の案内 (`LAUNCH_EMPTY_STATE_LABELS.noWslRuntimes`) に任せる」とキーの参照にする
- **根拠**: PO-3 (規則の正本は 1 か所)

## H の確認

- 今回の指摘を検出できるテスト: L-201 は無い (数行で足りる)。L-202 は区間ごとのテストだけ。L-203 は文面
- 既存の振る舞いの regression: `vitest run` 1969 passed (+9 は R2 の describe の 9 本)。E2E 11 passed / 1 failed (composer は本機の 1px。CI 待ち)。`useShellFocus` の書き換えは R1 H-001 のテスト `:774` と X-4 AC7 のテスト `:548` / `:841` を残したまま通る。読み上げは `App.tsx:20` でサイドバーの `hidden` の外なので、畳んでも止まらない
- 観測点: data-model.md:76 の「スクロールの位置が保たれる」は jsdom で確かめられず、V-3b #2 だけ。崩れたら data-model を直す。R2 のビルドの E2E の値は残っていないので、O-3 の比較の基準は R1 の行 (:19)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | `V-3` (spec.md の SC の計測経路) / 設定を閉じた後の `emit` | 3 (合わないのは 1) / 0 | spec.md:240 / AppShell.test.tsx:1132-1154 |
| L-202 | `onSessionsChanged` (session-list) / V-3b の AC4 の行 | 24 + 2 / 0 | SessionListScreen.test.tsx; useSessions.ts / quickstart-results.md:71-82 |
| L-203 | `noWslRuntimes` (src/renderer) | 3 | labels.ts:304; LaunchDialog.tsx:467; 写しは spec.md:141 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3 (L-201 / L-202 / L-203)
- Round inheritance: resolved from 2: 8 (M-005 は記録つきで受け入れ) / unresolved: 0 / new: 3

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
