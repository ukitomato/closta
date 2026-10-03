# architecture-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: architecture-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-015 / SC-001〜SC-006。当たるもの: FR-002・003・004・005・007・010・011・012・013 / SC-002・003・005・006
- 該当 charter / Confirmation: ui charter (Scope / Out of scope L39-76、Cross-domain L152-157、Journey 4 L114、KPI「日本語の健全性」L144)、session charter (Journey 3 L99-101、KPI「並列時の滑らかさ」L139-147、Related Specs L194)、`_overview.md`、AD-025「目標レイアウト」(L244-277)、AD-024 #18 (B) (L182, L197-199)、AD-028 §5 (L184)、AD-043、X-5 FR-008、X-4 US-1 AC7、O-1 FR-003 / FR-004、AD-046 (proposed)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner (AD-046 Decision 4 が AD-025 の CSP を引き継ぐことだけ確認)
- C. 業務不変条件 / Charter drift: Critical:0 High:3 Medium:4 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: 該当なし: a11y・ux・ui-coverage の owner
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:1 Low:0

## スコープ要約

renderer だけの変更。(1) 稼働中の `AssistantRuntimeProvider` をシェル全体へ (2) `SessionScreen` の分割 (3) 面の状態を `focus` に、選択の id は 2 つのストア (4) 記録の追随。コードの主張は確かめた。spec・plan に反映されていないもの: `SessionAttentionAnnouncer.tsx:28` の `screen === 'launch'`、`perf/real-sessions.spec.ts:189` の nav、ストア内部の `selectedId` の書き換え (`running-session-store.ts:397,522`)、窓の既定幅 1100px (`window.ts:45`)。

## Findings

### [High] focus と selectedId の 2 か所持ちで、ストアの内部で選択が変わる経路に中央の面が追随しない (H-001) (scope: feature)

- **観察**: `selectedId` は行の選択以外でも変わる (起動の受け付け `:397`、close `:522`、`selectNextAwaiting` `RunningSessionList.tsx:159`)。`nextAwaiting` は `selectedId` を表示中として除外 (`session-view.ts:421`)。読み上げは `screen === 'launch'` で「見ているか」を決める (`SessionAttentionAnnouncer.tsx:28`)。置き換え後の「見ているセッション」の定義が無い
- **同種事象探索**: `selectedId:` (running-session-store.ts) `:137,397,412,522`。`screen === 'launch'` 1 件。`selectNextAwaiting` 1 件
- **リスク/影響**: 過去を表示中に承認待ちのボタンを押すと中央が追随しない (O-1 FR-003)。隠れた選択済みセッションが「表示中」とみなされ、ボタンの無効化と読み上げの抑止 (O-1 FR-004)
- **推奨アクション**: data-model §1 に focus の書き手の一覧 (行の選択・起動の受け付け・`selectNextAwaiting`・close)。シェルが `selectedId` / `selectedRowKey` の変化を購読して focus を決める。watchedId = `focus === 'running' ? selectedId : null` (設定のダイアログの扱いも)。`nextAwaiting` と announcer が同じ定義。FE-014 に 2 観点
- **根拠**: O-1 FR-003 / FR-004、session charter Journey 3、X-5 FR-008

### [High] 実行後の失敗から「閉じて起動し直す」を押しても起動ダイアログに戻らず、X-4 US-1 AC7 の経路が切れる (H-002) (scope: feature)

- **観察**: `SessionScreen.tsx:111-122` / `running-session-store.ts:523-530` / `SessionScreen.tsx:449,467`。新しいシェルでは空の状態になる
- **同種事象探索**: `previousFailure|閉じて起動し直す|閉じて再起動` 3 件
- **推奨アクション**: FR-007 に「失敗したセッションを閉じたら `launchOpen = true`、ダイアログは `previousFailure` と `lastConfig` を出す」。FE-021 にテスト
- **根拠**: X-4 US-1 AC7

### [High] 「composer の領域の基準画像は変わらない」という前提が成り立たない (Principle VIII (B) / SC-003) (H-003) (scope: feature)

- **観察**: composer の幅は中央の幅に従う (`composer-screenshot.spec.ts:52`、`thread.aui.tsx:202,220` の 704px、`window.ts:45` の 1100px)。今の中央 844px、新しいシェルで 500px
- **リスク/影響**: SC-003 は達成できない。撮り直しは人間の aesthetic 承認を要する (`constitution.md:613`、AD-024 #18 `:182`)
- **推奨アクション**: FR-011 / SC-003 / plan VIII を「撮り直し、人間の承認を quickstart に」に。または E2E の窓の幅を固定して中央の幅を今と同じに。申し送り #2 を「撮り直しの持ち主 = O-7」に
- **根拠**: Principle VIII (B)、AD-024 #18、AD-028 §5

### [High] 実機計測ハーネスが nav の「セッション起動」を押しており、session charter の KPI の計測経路が壊れる (H-004) (scope: feature)

- **観察**: `perf/real-sessions.spec.ts:189` (と `:191` の「新規起動」)。FR-011 / SH-020 / SC-005 / quickstart V-1 は perf を対象にしていない。perf は CI 外
- **推奨アクション**: SH-020 に perf を足す。SC-005 / V-1 の grep に `perf`。roadmap の O-3 義務 (2)(c) の基準が新しいシェルで変わることを注記。perf の安全柵・出力は変えないので roadmap L155 の ADR の条件に当たらない旨を plan に
- **根拠**: session charter KPI「並列時の滑らかさ」、roadmap O-3 義務 (2)

### [Medium] U-2 (シェルの持ち主 = ui) の charter 反映が「Scope に 1 行足す」だけ (M-001) (scope: feature)

- **観察**: ui charter の除外の理由 (対応表に載らない画面は XII の判定対象外。`:69-76`) と「依存される domain: なし」(`:155`)。session のコンポーネントが `stores/ui.ts` を読み書きする
- **推奨アクション**: ui charter に (a) シェルは XII の判定対象外 (b) 面の状態の依存の扱い。focus をシェル側で購読すれば session → ui の書き込みを無くせる。`_overview.md` の帰属の判断根拠に O-7 = ui の理由

### [Medium] AD-046 Decision 5 が AD-025 の「上部ナビの 4 画面」を設定の 4 項目に読み替えているが、指す画面が違う (M-002) (scope: feature)

- **観察**: AD-025 の 4 画面は R-1 の 3 画面 + chat。プロバイダは X-3、chat は中央へ
- **推奨アクション**: Decision 5 と FR-012 を「R-1 の設定・セットアップの 3 画面と X-3 のプロバイダ → 設定のダイアログ。R-1 の chat (R-3 で過去ログ) → 中央の本体」に

### [Medium] FR-004 / US-1 AC4 のスクロール位置の保持を X-5 FR-008 に帰しているが、X-5 にその要件は無く、設計にも手段が無い (M-003) (scope: feature)

- **推奨アクション**: 新しい要件にするなら手段と観点を足す。しないなら外し、X-5 FR-008 の帰属を「接続・transcript・下書き・キュー」に

### [Medium] glossary の追随の対象が足りない (M-004) (scope: feature)

- **観察**: 没入ビュー (`glossary.md:389-390`)、session charter `:101,194` のナビ、R-2 の一覧の canonical な呼び名、`:949` の表。FR-013 / SH-001 / AD-046 Decision 6 の語の集合が揃っていない
- **推奨アクション**: SH-001 / SH-010 に足し、語の正本を AD-046 Decision 6 に揃える

### [Medium] OPT-panel の登録が OPT-pty と Terminal の持ち主で重なり、Changes / Files / Browser の domain の範囲を超える (M-005) (scope: feature)

- **推奨アクション**: OPT-panel を「Changes / PR の Webview / Files / Browser。Terminal は OPT-pty」に。main / infra の作業の domain は OPT-panel の design で人間に諮る

### [Low] resizable の照合を実装の時まで延ばしているが、F 節で今決められる (L-001) (scope: feature)

- **観察**: F 節の 127 名に resizable は無い
- **推奨アクション**: research R-04 に記す。ドラッグの幅変更を入れるかと依存を plan に

### [Low] ADR の番号が AD-045 を飛ばしている (L-002) (scope: feature)

- **推奨アクション**: 予約が無ければ振り直す。予約済みならその旨を書く

### [Low] O-3 の前に差し込むことで、roadmap の「RunningSessionList / store の切り出し」の持ち主の判定に当たるかが評価されていない (L-003) (scope: feature)

- **推奨アクション**: plan の申し送り表に「該当なし — 行の部品と store の派生値を変えない」

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `selectedId:` / `screen === 'launch'` / `selectNextAwaiting` | 4 / 1 / 1 | running-session-store.ts:137,397,412,522 / SessionAttentionAnnouncer.tsx:28 / RunningSessionList.tsx:159 |
| H-002 | `previousFailure\|閉じて起動し直す\|閉じて再起動` | 3 | running-session-store.ts:528 / SessionScreen.tsx:155,467 |
| H-003 | `toHaveScreenshot` / `thread-max-width` | 1 / 2 | composer-screenshot.spec.ts:53 / thread.aui.tsx:202,432 / window.ts:45 |
| H-004 | `セッション起動` (e2e/perf/src) | 3 | e2e/support/launch.ts:47 / e2e/launch-dialog.spec.ts:18 / perf/real-sessions.spec.ts:189 |
| M-001 | `useUiStore` (session 系) | 2 ファイル | SessionListScreen.tsx:20,203,736 / SessionAttentionAnnouncer.tsx:3,28 |
| M-002 | `上部ナビ\|4 画面` | 2 | 0025:262 / 0046:29 |
| M-003 | `スクロール` (009 spec) | 0 | — |
| M-004 | `セッション画面\|ナビに\|ナビの` | 6 | glossary.md:389,485 / session charter:99,101,194 / ui charter:114 |
| M-005 | `OPT-pty` | 4 | roadmap.md:298 / _overview.md:76 / ui charter:186 / 0025:274 |
| L-001 | `resizable` (ui-coverage.md) | 0 | — |
| L-002 | `AD-045\|0045-` | 0 | — |
| L-003 | `監視ビューの行を触る次の feature` | 1 | roadmap.md:170 |

## Verdict

- Critical: 0 / High: 4 / Medium: 5 / Low: 3

accepted ADR の Decision に反する設計は見つからなかった。
