# ux-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: ux-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 3 (pr-gate。HEAD bcd6aa4 / base origin/main。対象は R2 の修正の差分 `a78a291..bcd6aa4`)

## 初回読了 viewpoint

- FR/SC:
  - FR-002 / US-1 AC8: 畳むと中身を `hidden` で隠す (`Sidebar.tsx:114`)、`focusLost` (`useFocusRescue.ts:48-55`)、戻り先の候補から隠れた要素を外す (`useDialogReturnFocus.ts:54-56`)
  - FR-003 / FR-005: 中央のフォーカスの救出 (`CenterPane.tsx:39-47`、`data-center-primary` :115 / :123)
  - FR-006: 件数の印の `context` と `title` (`SessionNavBadge.tsx:24-43`、`SettingsDialog.tsx:69`)
  - FR-007: 失敗した close の判定を選択から切り離した (`useShellFocus.ts:38-53`)。起動ダイアログは外側の押下で閉じない (`LaunchDialogHost.tsx:51`)
  - FR-008: 設定のダイアログの外側の押下 (テストを追加)
  - FR-015: 「概要」の `modelPending` (`OverviewTab.tsx:82-91`)
  - FR-016 / SC-008: 取得中の状態の行 (`SessionListScreen.tsx:906-910`)
  - SC-002 (テストを追加) / SC-007
- touched files に当たる charter / Confirmation:
  - ui charter の「面の状態」(`dismissLaunchNotice`)、Principle VIII (日本語の切り詰めと `title`)
  - AD-046 Confirmation: V-3 は 2026-10-05 に OK。V-3b は未実施
  - data-model §1:38 / :52、§2 の R2 の追記、§3 の R2 の追記、§5:121-122 / :132、§6:155 / :162 / :170-172
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R2 の feature の範囲の Medium 5 件 (M-004 / M-101 / M-102 / M-103 / M-104) はコードとテストの両方で直った。Low の M-003 / L-101 / L-102 も直った。

- 失敗した close の判定は `running-session-store.ts:533-558` の `close()` の 1 回の `setState` と合う。選んでいない行を閉じたときに告知が残る経路は無くなった
- サイドバーの `hidden` は Tailwind v4 の preflight (`preflight.css:396-398`、`display: none !important`) が `flex` より優先されるので実際に隠れる
- 起動ダイアログは閉じるボタン (`LaunchDialogHost.tsx:62-75`) と Esc が残るので、外側の押下を止めても閉じる手段はある

修正で新しく出た UX の問題は 1 件 (L-201)。R2 で持ち越した Low のうち 3 件 (M-002 / L-002 / L-005) は差分で触られておらず、受け入れの記録も無い。

## Round 2 の指摘の判定

| R2 ID | 判定 | 確かめた事実 |
|---|---|---|
| M-004 | resolved (`lastConfig` は accepted-with-record) | `useShellFocus.ts:39-53`。テスト `AppShell.test.tsx:1030`。data-model.md:38 の記録は正しい |
| M-101 | resolved | `SettingsDialog.tsx:69`、`SessionNavBadge.tsx:40`。テスト `:826-828`。見た目は V-3b #1 |
| M-102 | resolved | `SessionListScreen.tsx:137` と :402。テスト `:1101` (:402 のテストは無い → M-011) |
| M-103 | resolved | `Sidebar.tsx:114`。テスト `:1086` |
| M-104 | resolved | `LaunchDialogHost.tsx:51`。テスト `:1046` (入れ子の確認のダイアログを対照に置く。M-007 のテストも兼ねる) |
| M-008 | sent-to-roadmap | roadmap の O-3 の義務 (i)、data-model §3 の「残した判断」 |
| M-002 | unresolved | 差分なし |
| M-003 | resolved | `session/labels.ts:303-310` / :410。どちらも起動ダイアログだけが使う。「→」は 0 件 |
| L-002 | unresolved | `session/labels.ts:309`。glossary の決定も無い |
| L-005 | unresolved | `running-sessions-view.ts:23` に差分なし |
| L-101 | resolved | data-model §6:155 / :162 / :170-172、spec.md:79 / :168 |
| L-102 | resolved | `SessionListScreen.tsx:906-910`。テスト `SessionListScreen.test.tsx:1178-1181` |
| L-103 | resolved (生の ID) / accepted-with-record (見出しの書式) | `OverviewTab.tsx:82-91`、data-model.md:132。失敗のときにも行を隠す → L-201 |
| M-011 | partially | M-004 / M-102 / M-103 / M-104 / M-007 のテストは足された |

## Findings

### [Low] Provider の一覧の取得に失敗すると、「概要」から Provider と「起動時のモデル」の 2 行が理由の表示も再試行も無く消える (L-201) (scope: feature)

- **観察**: `OverviewTab.tsx:82` の `modelPending = config.providerId !== null && providers.providers === null` は読み込み中と失敗を区別しない。`useProviders.ts:57` は失敗すると `loadState: 'failed'` にするだけで `providers` は `null` のまま。R2 の修正で失敗のときにモデルの行も出なくなった (前は ID が出ていた)。Provider の行 (:72) は前から同じ。data-model.md:121-122 は読み込み中だけを決め、失敗を決めていない
- **同種事象探索**: `providers.providers === null` / `!== null` (OverviewTab.tsx) 2 件 (:72 / :82)。`loadState` を見る箇所は 0 件
- **リスク/影響**: 失敗しても「出せなかった」ことが分からず、正常に見える (UX-2)。ローカルの IPC の失敗なので起きることは少なく Low
- **推奨アクション**: 判定を `providers.loadState === 'loading'` に変える。失敗のときはモデルの行を ID のまま出すか、Provider の行に「取得できませんでした」を出す。data-model §5 に失敗のときの扱いを足す
- **根拠**: UX-2 / data-model §5

### [Low] 初回の空の状態の文とボタンが中央とサイドバーに 2 組出る (M-002 持ち越し・変化なし) (scope: feature)

- **推奨アクション**: R2 と同じ

### [Low] 「Provider」と「プロバイダ」の表記揺れ (L-002 持ち越し・変化なし) (scope: feature)

- **観察**: `session/labels.ts:309`、`shell/labels.ts:49`
- **推奨アクション**: glossary で表記を決める (system)。決めないなら受け入れを data-model §6 に記録する

### [Low] 中央の空の状態が、登録フォルダの一覧の取得の失敗を読み込み中と区別しない (L-005 持ち越し・変化なし) (scope: feature)

- **観察**: `running-sessions-view.ts:23`
- **推奨アクション**: R1 のとおり。直さないなら受け入れを記録する

### [Low] H: 修正の一部を検出するテストが無く、見た目は V-3b が未実施 (M-011 持ち越し) (scope: feature)

- **観察**: テストが無いもの: 行の `cwdDisplay` の `title` (`SessionListScreen.tsx:402`)、`providerId` があり一覧の読み込み中のときにモデルの行を隠すこと (`OverviewTab.tsx:82`。既存のテスト `:941` は `providerId: null`)、L-201 の失敗の経路、畳んだ帯の印の `title`、R1 の M-010 / L-003 / L-004。regression の根拠: vitest 1969 passed、E2E 11 passed / 1 failed、`hidden` への変更は既存のテストの期待を `not.toBeVisible()` に書き換えて追随 (`:487-488`)。余白・ツールチップ・スクロールの保持は jsdom で測れず V-3b が未実施
- **推奨アクション**: `providerId` があるときの読み込み中・失敗のテストを 1 本 (L-201 と同時に)。行の `cwdDisplay` の `title` のテストを M-102 のテストに足す。V-3b を実施して記録してから completed

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | `providers.providers === null\|!== null` / `loadState` (OverviewTab.tsx) | 2 / 0 | OverviewTab.tsx:72, :82 |
| M-003 (確認) | `→\|設定の「\|「設定」` (`**/labels.ts`) | 案内の文 4 件はすべて起動ダイアログの中。「→」は注記だけ | session/labels.ts:303, :305, :309, :410 |
| M-102 (確認) | `title={session.cwdDisplay}\|title={group.cwd` | 2 | SessionListScreen.tsx:137, :402 |
| M-103 (確認) | `data-shell-anchor` の参照 | 1 (隠れた要素を外す処理あり) | useDialogReturnFocus.ts:54 |
| M-004 (確認) | `previousFailure` を書く箇所 | 3 (行を減らすのは close の :554 だけ) | running-session-store.ts:363, :446, :554 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 5 (G 4: L-201, M-002, L-002, L-005 / H 1: M-011)
- Round inheritance: resolved from 2: 8 / accepted-with-record: 1 (L-103 の書式) / sent-to-roadmap: 1 (M-008) / partially: 1 (M-011) / unresolved: 3 (M-002, L-002, L-005) / new: 1 (L-201)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
