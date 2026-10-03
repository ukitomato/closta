---
status: proposed
date: 2026-10-04
id: AD-046
deciders: ukitomato
tags: [ui, layout, shell]
supersedes: []
superseded-by: []
---

# AD-046: アプリのシェルを 3 面 (サイドバー・中央・右のペイン) にする

## Context

[AD-025](0025-workspace-folder-carries-location.md) は「目標レイアウト (2026-09-15 に人間から提示)」として、左に thread-list-sidebar、中央に Chat、右にブラウザのタブのように切り替える Workspace / Panel の 3 ペインを記録した。同じ節は「この記録は決定ではなく目標の共有である。採用にあたっては ADR を要する」「最初の UI 系 feature がシェルを組み替えることになる」と書いた。

その後の feature (R-2〜O-2) は、R-1 の上部のナビゲーションに画面を足す形で進み、2026-10-04 の時点で 7 つのタブ (ランタイム / 作業フォルダ / プロバイダ / セッション / 組み合わせ / セッション起動 / 会話) がある。稼働中のセッションを見るのと過去のセッションを読むのに、別のタブを行き来する。

2026-10-04、利用者は「今のタブビューは全部廃止されて、ThreadList と Chat 画面の UI しかないアプリになるはず」「Cursor の AgentView のイメージが近い。右ペインも入れることになる」と示した。M3 の残り (O-3〜O-6) は置き場所 (サイドバー・中央のヘッダ・右のタブ) で中身が変わるので、シェルを先に決める。

本 ADR は O-7 ([spec 013](../../specs/013-ui-app-shell/spec.md)) が夜間の自走で起こした。**細部は未承認である (spec 013 の U-1〜U-5)。**

## Decision

1. **上部のタブのナビゲーションをやめ、面を 3 つにする**: 左のサイドバー (`nav`)、中央 (`main`)、右のペイン (`complementary`)
2. **サイドバー**: 上から「新規起動」、稼働中のセッションの区画 (O-1 の監視ビュー)、過去のセッションの区画 (R-2 の一覧)、「設定」。区画の中身の持ち主 (session) は変えない
3. **中央**: 選んだ行に応じて、実行中の Chat (稼働中) か過去ログの transcript (過去) か空の状態。上端に中央のヘッダ (見出し・密度の切り替え)
4. **右のペイン**: 表示中のセッションに付く情報をタブで切り替える。タブは 1 か所の表に登録し、後続 feature が行を足す。最初のタブは「概要」。Changes / PR の Webview / Terminal / Files / Browser は OPT-panel。Browser / PR の Webview は AD-025 の「別の WebContents・独立した partition と CSP。アプリの CSP を緩めない」に従う
5. **設定**: ランタイム・作業フォルダ・プロバイダ・組み合わせの 4 画面とテーマを、サイドバーの「設定」から開く全面のダイアログにまとめる。R-1 の「上部ナビの 4 画面」(AD-025 の R-1 との関係の 1 点目) を、この設定のダイアログに読み替える
6. **置き場所の語彙**: 後続 feature は表示の置き場所を「サイドバー」「中央のヘッダ」「中央の本体」「右のペインのタブ」「設定のダイアログ」で書く

## Consequences

- 面の状態は `stores/ui.ts` の 1 か所 (中央の focus・設定・畳み) になり、画面の ID (`SCREENS`) は無くなる
- 稼働中の thread list の runtime の provider をシェルの全体に上げる。過去の一覧と transcript は内側に自分の provider を持つ (入れ子)
- O-3 の Command palette の操作は「画面へ移動」ではなく「設定の項目を開く・新規起動・セッションを開く」になる
- O-4〜O-6 の表示の候補 (Context display・Cost meter / Server panel / TodoList・Background task) は右のペインのタブになりうる。各 feature の design で決める
- 狭いウィンドウでは右 → 左の順に自動で畳む

## Alternatives

- **2 面 (右なし)** — 右を後から足すと中央の幅と分割を変え、O-3〜O-6 の置き場所を書き直す
- **設定を中央の面に出す** — Chat と設定が同じ面を取り合い、会話の位置を失う
- **稼働中と過去を 1 つの一覧に混ぜる** — 監視ビューの行と過去の行は持つ情報と操作が違う。O-3 の Thread search の後に再検討する

## Confirmation

- spec 013 の SC-001〜SC-005 (component テスト・E2E)
- 実機の目視 (spec 013 quickstart V-3) で、利用者が Cursor の Agent View の意図に近いと確かめる
