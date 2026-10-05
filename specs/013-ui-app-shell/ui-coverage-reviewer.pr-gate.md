# ui-coverage-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2 (pr-gate、system scope。HEAD bb6f547、修正の差分 7d46352..bb6f547)

## 初回読了 viewpoint

- FR/SC:
  - FR-005: 中央のヘッダ。D 節 session-state を描く部品 (`CenterHeader`)
  - FR-013: 記録の追随 (`docs/ui-coverage.md` F 節、ui charter の Scope)。spec.md:218 に「シェルは Principle XII の判定の対象外」が残っている (L-103)
  - FR-014 / FR-015: 右のペインのタブと「概要」(起動時の値の見出し。M-004)
  - SC-006: Constitution 検証が通ること
- touched files に該当する charter / Confirmation: ui charter In scope「アプリのシェル」(:62-69) と Out of scope (:79-86)、AD-044 Decision 1 / 4 / 5 / 6 と Confirmation、AD-046 Decision 6、Constitution XII Verification Manual、XIII Exceptions
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (charter :66-69 は G で見た。M-002 は resolved)
- D. Constitution / ADR drift: 該当なし: F 節の凡例に 3 つ目の値を足したのは AD-044 Decision 5 が凡例に任せた書式の範囲。ADR の条文の drift は architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:1 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

修正の差分で対応表の判断にかかわるのは 6 つ (D 節 session-state の element 名、F 節の凡例と 3 行の使い道、Settings の備考、ui charter の In scope の文、reviewers.yml の発火条件、「概要」の見出し)。コードの差分に SDK の emit の表示を足す・変えるものは無い。Tier の列と `後続` の行の変更は 0 件、SDK の版の変更も 0 件。roadmap の O-4 / O-6 の行の変更は `後続` の範囲を変えない。

## Round 1 の指摘の判定

| ID | R1 | 判定 | 確かめた事実 |
|---|---|---|---|
| M-001 | Medium | **resolved** | `ui-coverage.md:169` は `実装済み: CenterHeader の状態 (実行中)`。`RunningCenter` が状態を渡し `CenterHeader` が描く |
| M-002 | Medium | **resolved** | charter :66-69 が推奨の趣旨どおり。spec FR-013 (spec.md:218) に古い文が残る (L-103) |
| M-003 | Medium | **resolved** (推奨どおり) | `reviewers.yml:187-192`。ただし R1 の推奨に漏れがあった (承認カードは `LivePane.tsx` の外)。新規 M-101 |
| M-004 | Medium | **resolved** | `labels.ts:62` / `:65` が `起動時の${...}`。退行を捕まえる仕組みが無い (L-102)、data-model §5 が古い (L-103) |
| M-005 | Medium | **partially** (残りは Low) | 凡例と Thread list・Loading state・Empty state の置き場所は import と一致。Attachment / Composer attachments は新しい定義と食い違う |
| L-001 | Low | **resolved** | `ui-coverage.md:323` に X-6 の候補の文 |
| L-002 | Low | **unresolved** | 中央のヘッダの状態のラベルを確かめるテストは 0 件 |

## Findings

### [Medium] ui-coverage-reviewer の発火条件に承認カード (`ApprovalCard.tsx`) と、状態・失敗の文言を決めるモジュールが入っていない。追加した注記は承認カードを `LivePane.tsx` の中にあると書いている (M-101) (scope: feature)

- **観察**: `reviewers.yml:187` の注記は `LivePane.tsx` を「承認カード・失敗と終了の告知・拒否の一覧」と書くが、承認カードは `features/session/ApprovalCard.tsx:16` (D 節 permission-request・E 節 can_use_tool。Tier A) で、どの glob にも掛からない。D 節の文言を決める `session/labels.ts:102` (`SESSION_ROW_STATUS_LABELS`)・`:51` (`launchFailureLabel`)・`session-view.ts:80` (`rowStatus`) も外
- **同種事象探索**: D・E 節の `実装済み:` の element の定義ファイルと発火条件の突き合わせで、表示の部品で掛からないのは `ApprovalCard.tsx` の 1 件
- **リスク/影響**: 承認カードだけを変える PR、状態のラベル・失敗の理由の文言だけを変える PR で本 reviewer が起動しない (UC-1 / UC-3)。注記は承認カードが既に対象だと読者に思わせる
- **推奨アクション**: `src/renderer/src/features/session/ApprovalCard.tsx` を足し、注記の「承認カード」をその行に移す。`session/labels.ts` と `session-view.ts` は監視ビューと共有なので足すかは判断が要る。足さない場合はファイルの先頭のコメントに「D 節の文言の正本で、変えるときは対応表の該当の行を見る」と書く
- **根拠**: Constitution XII Verification Manual、AD-044 Consequences、UC-1 / UC-3

### [Low] Attachment / Composer attachments / Tooltip icon button が、新しい定義の `未使用 (入れていない・描いていない)` と食い違う (M-005 の残り) (scope: feature)

- **観察**: `thread.aui.tsx:4-7` が `attachment.aui.tsx` の部品を import し composer (:578 / :603) と利用者のメッセージ (:1009) に置く (adapter は設定していない)。Tooltip icon button (:347) も `components/tooltip-icon-button.tsx` を Thread などが使う
- **推奨アクション**: 3 行の使い道を事実に合わせる (Attachment / Composer attachments は「Thread に組み込み済み。adapter が無いので添付は受け付けない」、Tooltip icon button は Thread の操作ボタンの部品)。または凡例の `未使用` の定義を緩める
- **根拠**: `docs/ui-coverage.md:222`、Constitution XIII Exceptions、AD-044 Decision 6

### [Low] F 節の 3 つ目の値 `SDK の外: <置き場所>` の定義と使い方が揃っていない (L-101) (scope: feature)

- **観察**: (1) 他の値と組み合わせる規則が無い — Error state (`:269`) は `D launch-failure`・備考 `FailureBanner` のままだが、`FailureBanner` は Error state を使わない自作の部品で、`ErrorState` を使うのは SDK の外の 6 か所 (設定の 4 画面・過去のセッションの区画・過去ログ) (2) 定義の挙げる場面に当たらない用途がある (Empty state の「実行中の Thread の Welcome・過去ログ」、Loading state の「過去ログ」は transcript の中) (3) `<置き場所>` が AD-046 Decision 6 の語彙で書かれていない (語彙どおりは Thread list だけ)
- **推奨アクション**: 凡例を「SDK の emit を表示しない用途 (シェル・設定・他 domain の操作 UI・transcript の空と読み込み中)」にし、「対応表の行と併せて書くときは `/` で並べる」「`<置き場所>` は AD-046 Decision 6 の語で書く」を足す。Error state を `D launch-failure / SDK の外: …` とし、備考を「launch-failure はアプリが自作した FailureBanner」に直す
- **根拠**: AD-044 Decision 5 / 6、AD-046 Decision 6、Constitution XIII Exceptions

### [Low] M-004 の修正 (見出しの「起動時の」) には退行を捕まえるものが無い。注記は持ち主として X-6 を落としている (L-102) (scope: feature)

- **観察**: (1) `AppShell.test.tsx:949` / `:951` は `OVERVIEW_LABELS.model` / `.permissionMode` をその定数自身で照合しており、見出しを戻しても通る (2) `features/shell/labels.ts` は ui-coverage-reviewer の発火条件に無い (3) `labels.ts:56` と `OverviewTab.tsx:78` は実行中の変化の持ち主を「O-4 / O-5」と書くが、実行中の切り替えは E 節の `set_permission_mode` / `set_model` (`後続: X-6`)
- **推奨アクション**: テストで見出しの文字列 (`'起動時の'`) を確かめる。注記を「O-4 (`status`)・O-5 (`init` の `model`)・X-6 (`set_permission_mode` / `set_model`)」に直す。`shell/labels.ts` の発火条件は M-101 と合わせて判断する
- **根拠**: reviewer-base H、AD-028 §5、UC-5

### [Low] 対応表の判断を書いた feature の記録が、修正に追随していない (L-103) (scope: feature)

- **観察**: `plan.md:39` は「A〜E 節の差分 0」のまま (D 節 :169 が変わった)。`spec.md:218` (FR-013) は「シェルは Principle XII の判定の対象外」を求めたまま (charter は撤回した)。`data-model.md:111-112` (§5) の項目名は「モデル」「権限モード」のまま
- **推奨アクション**: 3 か所を実装と charter に合わせて直す (spec は実装の追記として)
- **根拠**: Constitution XIV、UC-1、UC-6

### [Low] 凡例が SDKSessionInfo の値を行にしない理由を「他 domain の操作 UI」としているが、ui のシェルの「概要」もその値を出すようになった (L-104) (scope: feature)

- **観察**: 凡例 `ui-coverage.md:23` は `SDKSessionInfo` を行にしない理由を「ui charter の Out of scope (他 domain の操作 UI)」とする。「概要」(ui) は過去のセッションの `gitBranch` / `createdAt` / `lastModified` を出す。結論は変わらず、食い違うのは理由
- **推奨アクション**: :23 に「`SDKSessionInfo` は SDK の emit (AD-020 Decision 1 の分母) の外。O-7 の『概要』が出す値も一覧の行と同じ値の再掲なので行にしない」と足す。AD-044 は書き換えない
- **根拠**: AD-044 Decision 4 / 5、AD-020 Decision 1、UC-6

### [Low] D 節 session-state (Tier A・実装済み) の表示を確かめるテストが無い (L-002) (scope: feature) — R1 から持ち越し・unresolved

- **推奨アクション**: 稼働中のセッションの状態を変え (`h.push`)、`center-header` にその `SESSION_ROW_STATUS_LABELS` が出ることを確かめるテストを 1 本足す
- **根拠**: reviewer-base H、AD-044 Decision 1

### 固有観点の該当なし

- UC-1: 修正の差分のコードは SDK の emit の表示の中身を変えない
- UC-2: `package.json` / lockfile の差分なし。SDK は 0.3.270 のまま
- UC-3: `表示不要` の行の変更 0 件。`dismissLaunchNotice` は失敗の理由をその前にサイドバーの行で出しているので、Tier A の launch-failure を隠す経路にはならない
- UC-4: Tier の列の変更 0 件
- UC-5: roadmap の O-4 / O-6 の行の変更は `後続` の範囲を変えない
- UC-7: `status: reviewing`。`後続: O-7` は 0 件

### H

- 修正の差分は D 節の他の行の部品の中身を変えていない (`LivePane.tsx` の差分は `Launching` の `role="status"` だけ)
- 欠けているのは session-state の表示のテスト (L-002)、見出しの退行のテスト (L-102)、承認カードの発火条件 (M-101)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | D・E 節の element の定義ファイル × ui-coverage の glob | 3 (表示の部品は 1) | ApprovalCard.tsx:16、session/labels.ts:51, :102、session-view.ts:80 |
| M-005 (残り) | elements/ と components/ の import × F 節の `未使用` | 3 | ui-coverage.md:235, :246, :347 |
| L-101 | `SDK の外` / `ErrorState` の import | 4 / 6 | ui-coverage.md:222, :268, :286, :337 / 設定の 4 画面・SessionListScreen.tsx:10・ChatScreen.tsx:12 |
| L-102 | `OVERVIEW_LABELS.(model\|permissionMode)` in *.test.tsx / `O-4 / O-5` の注記 | 2 / 2 | AppShell.test.tsx:949, :951 / labels.ts:56, OverviewTab.tsx:78 |
| L-103 | `A〜E 節\|差分 0` / `判定の対象外` / §5 の項目名 | 1 / 1 / 2 | plan.md:39 / spec.md:218 / data-model.md:111-112 |
| L-104 | `SDKSessionInfo` in ui-coverage.md | 1 | ui-coverage.md:23 |
| L-002 | 中央のヘッダの状態のラベルの assertion | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 6
- Round inheritance: resolved from 1: 5 (M-001 / M-002 / M-003 / M-004 / L-001) / partially: 1 (M-005。残りを Low で数えた) / unresolved: 1 (L-002) / new: 5 (M-101 / L-101 / L-102 / L-103 / L-104)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
