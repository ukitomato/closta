# ui-coverage-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 3 (pr-gate。HEAD bcd6aa4。見たのは R2 の修正の差分 a78a291..bcd6aa4)

## 初回読了 viewpoint

- FR/SC:
  - FR-005: 中央のヘッダ。D 節 session-state を描く部品。新しいテストが状態のラベルを確かめる
  - FR-013: 記録の追随。spec.md:487 に実装の追記 (charter の撤回に合わせた)
  - FR-014 / FR-015: 「概要」の「起動時の」の見出し。data-model §5 を直し、文字列のテストを足した
  - SC-006: Constitution 検証。ok 20 / 違反 0
- touched files に該当する charter / Confirmation: ui charter の In scope「アプリのシェル」と Out of scope、AD-044 Decision 1 / 4 / 5 / 6 と Confirmation、AD-046 Decision 6、Constitution XII Verification Manual、XIII Exceptions
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: F 節の凡例に足した規則は AD-044 Decision 5 が凡例に任せた書式の範囲。ADR の条文は変えていない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

対応表の判断にかかわるのは 7 つ (発火条件、D 節の文言の正本のコメント、F 節の凡例と 4 行、:23 の注記、持ち主の注記、テスト 2 本、spec / plan / data-model の追随)。コードの差分は SDK の emit の表示を足していないし変えていない。Tier の列、`表示不要` / `後続` の行、SDK の版 (0.3.270) の変更は 0 件。

## R2 の指摘の判定

| ID | R2 | 判定 | 確かめた事実 |
|---|---|---|---|
| M-101 | Medium | **resolved** | `reviewers.yml:189-192`、`session/labels.ts:101-103`、`session-view.ts:79-80`。launch-failure の注記の位置は L-202 |
| M-005 (残り) | Low | **resolved** | `ui-coverage.md:235` / `:246` / `:347` が import の事実と合う。同じ考え方を当てると別の行が食い違う (L-201) |
| L-101 | Low | **partially** | 凡例 `:222` と Error state `:269` は直った。Empty state `:268` と Loading state `:286` が新しい規則で書かれていない |
| L-102 | Low | **resolved** | 文字列のテスト、持ち主の注記 (`OverviewTab.tsx:78-81`、`shell/labels.ts:56-57`、data-model §5) は roadmap の範囲と合う。`reviewers.yml:197` |
| L-103 | Low | **resolved** | plan.md:39、spec.md:487、data-model §5 |
| L-104 | Low | **resolved** | `ui-coverage.md:23`。`OverviewTab.tsx:127-134` の 3 つの値と合う |
| L-002 | Low | **resolved** | `center-header` の「応答中」→「承認待ち」。経路が R2 の推奨と違う (L-203) |

## Findings

### [Low] F 節の凡例に足した「AD-046 Decision 6 の語で書く」規則に、既にある 2 行が従っていない (L-101 の残り) (scope: feature)

- **観察**: 凡例 `ui-coverage.md:222` の語は「サイドバー・中央のヘッダ・中央の本体・右のペインのタブ・設定のダイアログ」(AD-046:34)。Empty state `:268` (「O-7 の中央」「設定の 4 画面」) と Loading state `:286` (「起動ダイアログの起動中」「設定の 4 画面」「過去ログ」) が従っていない。凡例の定義の列挙も、`:347`「Thread の操作ボタン」と `:269`「過去ログの取得の失敗」を覆っていない
- **同種事象探索**: `SDK の外` 7 行 (:235, :246, :268, :269, :286, :337, :347)。語彙の外は :268 と :286、列挙の外は :269 と :347
- **推奨アクション**: :268 を「中央の本体 (空の状態・実行中の Thread の Welcome・過去ログ)・サイドバーの過去のセッションの区画・設定のダイアログ」に、:286 を「中央の本体の過去ログ・設定のダイアログ・起動ダイアログ (`LaunchDialogHost`) の起動中」に。凡例の列挙に「transcript の取得の失敗」と「Thread の操作のボタン」を足すか、「例」と明記する
- **根拠**: AD-046 Decision 6、AD-044 Decision 5、Constitution XIII Exceptions

### [Low] Attachment を「組み込み済み」で `SDK の外` にしたのに、Thread のテンプレートが描く操作のバーの element は `未使用` のまま (L-201) (scope: feature)

- **観察**: `thread.aui.tsx` は `ActionBarPrimitive.Copy` (:826)・`Reload` (:836)・Export as Markdown (:841-856)・`Edit` (:1037) と `EditComposer` (:1046) を描く。runtime は `onEdit` / `onReload` を渡していない (Attachment と同じ状態)。F 節の Edit message (`:266`)・Message actions (`:296`)・Regenerate menu (`:316`。Tier A) は `未使用` のまま。`:347` は「コピー・編集」のボタンがあると書く
- **同種事象探索**: 描いているのは Copy / Reload / Edit / ExportMarkdown の 4 件。BranchPicker (:1084) と Dictation (:605) は描かれないので `:297` / `:252` とは合う
- **推奨アクション**: 3 行の使い道を Attachment と同じ形にする (`SDK の外: 中央の本体の Thread の操作のバー`。備考に「`onEdit` / `onReload` を渡していないので編集・再生成は効かない。X-6 で照合する」)。または凡例に「`未使用` は registry の element を入れていないこと。テンプレートに組み込まれた primitive は数えない」と書き Attachment の 2 行を合わせる。どちらかに決める
- **根拠**: `ui-coverage.md:222` の `未使用` の定義、Constitution XIII Exceptions、AD-044 Decision 6

### [Low] launch-failure の文言の正本 `LAUNCH_REJECT_LABELS` の側に注記が無い (L-202) (scope: feature)

- **観察**: `session/labels.ts:101-103` の注記は launch-failure の正本を `LAUNCH_REJECT_LABELS` と書くが、その定義 (`:16-45`) にもファイルの先頭 (`:8-14`) にも対応表への言及が無い。FailureBanner は `launchFailureLabel` (`:51-53`) を通してこの表を描く (`LivePane.tsx:276`)
- **推奨アクション**: `LAUNCH_REJECT_LABELS` の直前に「対応表 D 節 launch-failure の文言の正本。変えるときは対応表の行を見る」と書く
- **根拠**: Constitution XII Verification Manual、AD-044 Consequences、UC-1 / UC-3

### [Low] 中央のヘッダの状態のテストは port の `state` の事象だけで状態を動かしている (L-203) (scope: feature)

- **観察**: 新しいテストは `h.emit(A, { kind: 'state', … })` だけを使う。`deriveSessionView` (`session-view.ts:55-57`) が `SessionStatusUpdate` の `state === 'error'` を「失敗」に、`claudeAlive === false` を「終了済み」にする経路はヘッダで確かめていない
- **同種事象探索**: `center-header` in *.test.tsx 3 件 (AppShell.test.tsx:408, :421, :1159)。`SessionStatusUpdate` で確かめるものは 0 件
- **推奨アクション**: 同じテストに `h.push([{ sessionId: A, state: 'error', reasonKey: 'provider-error', claudeAlive: false }])` と「失敗」の確認を足す
- **根拠**: reviewer-base H、AD-044 Decision 1

### 固有観点の該当なし

- UC-1: SDK の emit の表示の中身を変えていない。UC-2: package.json / lockfile の差分なし。UC-3: `表示不要` と `実装済み` の行の変更 0 件。UC-4: Tier の列の変更 0 件。UC-5: 持ち主の注記は roadmap の範囲に入る。UC-6: :23 の理由は AD-020 Decision 1 の分母に合う。UC-7: status は reviewing、`後続: O-7` は 0 件

### H

- 修正の差分は D 節の他の行の部品の中身を変えていない。中央のヘッダの状態は `SESSION_ROW_STATUS_LABELS[rowStatus(live)]` のまま
- 退行を捕まえるテストの残る穴は L-203 だけ

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 (残り) | `SDK の外` in ui-coverage.md | 7 (語彙の外 2・列挙の外 2) | ui-coverage.md:268, :286 / :269, :347 |
| L-201 | `ActionBarPrimitive\.\|BranchPickerPrimitive\|Dictate` in thread.aui.tsx × F 節の `未使用` | 4 描画 / 3 行 | thread.aui.tsx:826, :836, :856, :1037 / ui-coverage.md:266, :296, :316 |
| L-202 | `対応表\|ui-coverage` in session/labels.ts・session-view.ts | 2 (注記が無い正本 1) | labels.ts:101, session-view.ts:79 / labels.ts:16 |
| L-203 | `center-header` in *.test.tsx | 3 (SessionStatusUpdate の経路 0) | AppShell.test.tsx:408, :421, :1159 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
- Round inheritance: resolved from 2: 6 / partially: 1 (L-101) / unresolved: 0 / new: 3 (L-201 / L-202 / L-203)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
