# po-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: po-reviewer
**Spec**: specs/013-ui-app-shell/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-015、SC-001〜SC-006。すべて本 feature の対象
- 該当 charter / Confirmation: ui charter (Scope / Journey 2・4 / Principle「見た目の判断を先送りしない」)、session charter:99、AD-025 目標レイアウト、AD-046 (proposed) の Confirmation、X-4 US-1 AC7、X-5 FR-008
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:3 Medium:5 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux / a11y / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約

renderer だけの 3 面のシェル。主な穴は (1) 失敗したセッションから立て直す流れが切れる (2) 既定のウィンドウ幅で SC-003 (基準画像の更新 0) を満たせない (3) スクロール位置を保つ AC を設計もテストも裏付けていない。

## Findings

### [High] 失敗したセッションを「閉じて再起動」すると空の状態に落ち、前回の設定と理由を出す起動ダイアログに戻らない (H-001) (scope: feature)

- **観察**: `running-session-store.ts:503-529` は失敗したセッションを閉じると `selectedId: null` にし `launch.lastConfig` / `previousFailure` を書く。`SessionScreen.tsx:111-122` は未選択のとき中央に起動ダイアログを描く。これで X-4 US-1 AC7 と「閉じて起動し直す / 閉じて再起動」(`SessionScreen.tsx:449,467`) が成り立つ。新しいシェルでは data-model §1 が「`selectedId` が `null` → 空の状態」、起動ダイアログは `launchOpen` で明示的に開く
- **同種事象探索**: `閉じて起動し直す|閉じて再起動` 3 件 (`SessionScreen.tsx:449,467`、`running-session-store.ts:505`)
- **リスク/影響**: ボタンの文言どおりに動かず、X-4 US-1 AC7 が黙って壊れる
- **推奨アクション**: FR-007 か Edge Cases に「失敗したセッションを閉じる → 起動ダイアログが前回の設定と理由つきで開く」。data-model §1 に遷移を書き、FE-021 の観点に入れる
- **根拠**: X-4 US-1 AC7 / ui charter Journey 2 step 4

### [High] 既定のウィンドウ幅 1100px では中央が 500px になり、composer が細くなるので SC-003「基準画像の更新が 0」を設計の時点で満たせない (H-002) (scope: feature)

- **観察**: `window.ts:45` 既定幅 1100px。サイドバー 280 + 右 320 で中央 500px (最小 480 のすぐ上)。今は中央約 844px で composer は `--thread-max-width: 44rem` (`thread.aui.tsx:202`) いっぱい。基準画像は composer の要素の画像 (`composer-screenshot.spec.ts:52-53`)。FR-011 は更新を許し、SC-003 は禁じていて矛盾
- **同種事象探索**: `width:|minWidth` (src/main) 1 件 (`window.ts:45`、minWidth 0)。`--thread-max-width` 4 件
- **推奨アクション**: SC-003 を「更新 0、または理由と承認者を記録」に揃える。data-model §2 に既定のウィンドウ幅での中央の幅。右のペインを既定で開くか・ウィンドウ幅を広げるかを U-4 に足す
- **根拠**: PO-2 / PO-6 / Principle VIII

### [High] US-1 AC4 / FR-004 の「スクロールの位置は保たれる」を、設計もテストも裏付けていない (H-003) (scope: feature)

- **観察**: X-5 FR-008 はスクロールの位置を含まない。`LiveSessionPane` は `key={live.sessionId}` で作り直される (`SessionScreen.tsx:97-98,183-185`)。中央が `ChatScreen` に切り替われば unmount。SC-002 / FE-014 にスクロールの観点なし
- **同種事象探索**: `スクロールの位置` (specs/013) 2 件 (spec.md:77,161)、SC と tasks 0 件
- **推奨アクション**: (a) 「戻ると下端に追従する (今の振る舞い)」に書き換える か (b) 方式を plan に書き SC-002 / FE-014 に観点を足す
- **根拠**: PO-3 / X-5 FR-008

### [High] (H) 立て直しの流れと基準画像を検出するテストの観点が tasks にない (H-004) (scope: feature)

- **観察**: FE-014 / FE-021 / FE-042 に H-001 / H-003 の観点が無い。SH-020 は基準画像を変えない前提
- **同種事象探索**: `previousFailure|閉じて再起動|AC7` (tasks.md) 0 件
- **推奨アクション**: FE-021 に失敗→ダイアログの観点。SH-020 に基準画像が変わったら理由と承認を記録する手順
- **根拠**: X-4 US-1 AC7 / reviewer-base の H 規則

### [Medium] 起動中にダイアログを閉じた場合と、起動が拒否された場合の AC がない (M-001) (scope: feature)

- **観察**: 起動中に閉じられると、受け付け時に `focus = 'running'` で中央を奪う。上限の拒否は E2E (`multi-session.spec.ts:107`) で見ているが US-2 に AC が無い
- **推奨アクション**: US-2 に AC4「起動中は閉じられない (または閉じても中央を切り替えない)」と AC5「拒否・失敗はダイアログを閉じずに理由を出す」。FE-021 に入れる
- **根拠**: PO-4 / AD-043

### [Medium] サイドバーの稼働中の区画が 0 件のとき (初回起動を含む) の表示を決めていない (M-002) (scope: feature)

- **推奨アクション**: data-model §3 / §6 に 0 件の文言、初回起動の 3 面をまとめた AC
- **根拠**: PO-4

### [Medium] US-1 / US-2 の利点 (タブを行き来しない・入口が 1 つ) を測る SC がない (M-003) (scope: feature)

- **推奨アクション**: 「起動直後から、稼働中の会話・過去の会話・起動ダイアログのそれぞれに 1 回の操作で届く」の SC
- **根拠**: PO-1 / PO-2

### [Medium] 優先度が依存関係と合っていない: P1 の AC が P2 の US-3 / US-4 を前提にしている (M-004) (scope: feature)

- **観察**: US-1 AC1 は右のペイン、AC5 は「設定 → 作業フォルダ」を求める。US-3 が無いと登録画面に届かない
- **推奨アクション**: US-3 を P1 に。US-4 を P2 のままなら US-1 AC1 と SC-001 から右のペインを外す
- **根拠**: PO-5

### [Medium] 「概要」タブの価値が薄く、中央のヘッダと内容が重なる (M-005) (scope: feature)

- **観察**: フォルダ・ランタイム・開始は `SessionHeader` (`SessionScreen.tsx:103-109`) と重なる。新しく見えるのは Provider・モデル・権限モード。US-4 の Why が開発側の事情
- **推奨アクション**: Why を利用者の利点で書き直す。重なる項目を外すか右を既定で畳むかを U-4 に足す
- **根拠**: PO-1 / ui charter Mission

### [Low] 「概要」の項目が spec と data-model で食い違う (L-001) (scope: feature)

- **推奨アクション**: spec.md:31 と US-4 AC1 を「項目の正本は data-model §5」に

### [Low] 3 面の最小の幅の合計 (568px) より狭いウィンドウの振る舞いと、サイドバーを手で畳む AC がない (L-002) (scope: feature)

- **推奨アクション**: ウィンドウの最小の幅を決めるか中央の最小を割るのを許すかを data-model §2 に。サイドバーを畳む AC を US-1 に

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `閉じて起動し直す\|閉じて再起動` | 3 | SessionScreen.tsx:449,467; running-session-store.ts:505 |
| H-002 | `width:\|minWidth` (src/main) / `--thread-max-width` | 1 / 4 | window.ts:45; thread.aui.tsx:202,220,432,446 |
| H-003 | `スクロールの位置` (specs/013) | 2 | spec.md:77,161 |
| H-004 | `previousFailure\|閉じて再起動\|AC7` (tasks.md) | 0 | — |
| M-001 | `拒否` (spec.md US-2 / Edge) | 0 | — |
| M-003 | `クリック\|操作の数\|手数` (spec.md SC) | 0 | — |
| M-004 | `Priority: P2` | 2 | spec.md:99,116 |
| L-002 | `minWidth` (src/main) | 0 | — |

## Verdict

- Critical: 0 / High: 4 (E:3 / H:1) / Medium: 5 / Low: 2
