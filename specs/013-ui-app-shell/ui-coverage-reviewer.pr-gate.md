# ui-coverage-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 1 (pr-gate、system scope)

## 初回読了 viewpoint

- FR/SC:
  - FR-003 / FR-005: 中央と中央のヘッダ。D 節 session-state を表示する部品が `CenterHeader` に移った
  - FR-013: `docs/ui-coverage.md` F 節の使い道と備考、ui charter の Scope の文言
  - FR-014 / FR-015: 右のペインのタブの表と「概要」。概要は権限モードとモデルを出す
  - SC-006: Constitution 検証が通ること
- touched files に該当する charter / Confirmation:
  - ui charter Scope「アプリのシェル」(charter.md:62-66)
  - ui charter KPI「表示網羅」(:149-151)
  - AD-044 Decision 1 / 2 / 4 / 6 と Confirmation (項目 21 は ok)
  - AD-046 Decision 4 / 6 (右のペインのタブ、置き場所の語彙)
  - Constitution XII Examples / Verification Manual、XIII Exceptions (constitution.md:811-815)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。本 reviewer は対応表の判断だけを見る
- B. 入力検証 / injection / CSP / 暗号: 該当なし: 概要・中央のヘッダの文字列の無害化は security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: charter の drift は architecture-reviewer の担当。ui charter :62-66 は Principle XII の適用範囲の判断に限って G の M-002 で扱った
- D. Constitution / ADR drift: 該当なし: AD-044 / AD-046 / XII の条文の drift は architecture-reviewer の担当。本 PR は AD-044 Decision 1 の書式のまま D 節の行を書いており、ADR の決定は変えていない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (`docs/discovery.md:347` に残る `SessionScreen` もそちらの範囲)
- G. optional reviewer 範囲: Critical:0 High:0 Medium:4 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

O-7 はタブのビューをやめてサイドバー・中央・右のペインの 3 面にした。表示の部品は移しただけで作り替えていない。

- **SDK の emit の表示の追加は観察されなかった**: `src/agents/**` と domain の DTO の差分は 0。`thread.aui.tsx` の差分は注記 1 行だけ。`ChatScreen.tsx` は密度の切り替えを出すかの引数だけ。`RunningSessionsProvider.tsx` は `SessionScreen` の runtime を移したもの。よって A〜E 節に行を足さない判断は diff の事実と一致する
- **対応表の差分**: D 節 `session-state` の element 名 (ui-coverage.md:169) と、F 節 5 行の備考・使い道だけ (`session-state` は D 節の行)
- **割当の範囲**: Tier の列の変更は 0。`後続` の行の変更も 0。roadmap の O-4〜O-6 の「対応表の割当 (O-2 から)」の本文も変わっていない
- **SDK の版**: `@anthropic-ai/claude-agent-sdk` の差分は 0
- **M-009 の制御文字**: `docs/` 配下に制御文字 0 件
- **判断の誤り**: 中央のヘッダの部品が移った結果、D 節の element 名が状態を描かない部品を指したまま残った。charter の「シェルは対象外」と ui-coverage-reviewer の発火条件も、シェルが対応表の行を担うようになった事実に追いついていない

## Findings

### [Medium] D 節 session-state の割当が、状態を描かない `LiveSessionPane` を指している (M-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:169` は `実装済み: LiveSessionPane の状態 (実行中)`。`LivePane.tsx:102-203` の `LiveSessionPane` は FailureBanner / EndNotice / DeniedNotice / キューの告知 / ApprovalCard / Thread だけを描き、`SESSION_ROW_STATUS_LABELS` を参照しない。状態のラベルを描くのはシェルの `CenterHeader` (`CenterHeader.tsx:38`。`CenterPane.tsx:72-77` の `RunningCenter` が渡す)。`plan.md:39` の前提「A〜E 節の差分 0」は、M-003 で表示の部品が移ったときに行が追随していない
- **同種事象探索**: D / E 節の `実装済み:` の element 名をコードと突き合わせた。ApprovalCard / FailureBanner (`LivePane.tsx:262`) / EndNotice (`:285`) / DeniedNotice (`:407`) は存在し該当の表示を描く。`SessionScreen` の残りは 0 件。名前の誤りは本行の 1 件
- **リスク/影響**: Tier A の session-state をどの部品が出しているかの唯一の記録。`CenterHeader.tsx:11` は後続 feature がここに表示を足すと書いており、行が別の部品を指していると矛盾に気付けない (UC-1)
- **推奨アクション**: `:169` を `実装済み: CenterHeader の状態 (実行中)` に直し、備考に「O-7 で中央のヘッダ (シェルの `CenterHeader`。`RunningCenter` から) に移した」を足す
- **根拠**: AD-044 Decision 1、Constitution XII Examples、UC-1 / UC-3
- **scope 根拠**: `docs/ui-coverage.md` は本 PR の touched file で、表示の移動も本 PR の差分

### [Medium] ui charter の「シェルは SDK の emit の表示ではないので Principle XII の判定の対象外」が、シェルの部品が Tier A の行を表示している事実と食い違う (M-002) (scope: feature)

- **観察**: `docs/domains/ui/charter.md:62-66`。実際にはシェルの `CenterHeader` が D 節の Tier A の行 session-state を描いている (M-001)。右のペインのタブの表には O-4〜O-6 が SDK の emit (Context display・Cost meter・Server panel・TodoList) を足す予定がある
- **同種事象探索**: `Principle XII` を ui charter で 4 件 (:78 / :141 / :164 / :65)。シェルを対象外とする記述は :65 の 1 件。AD-046 の `XII` は 0 件
- **リスク/影響**: 「シェルの部品を変える PR は対応表を見なくてよい」と読め、O-4 が中央のヘッダや右のペインに SDK の emit を足すときに対応表を直さない経路を正当化してしまう。O-7 自身の完了の判定まで外れると読み違えうる
- **推奨アクション**: :64-66 を「面の配置と遷移そのものは SDK の emit の表示ではないので、対応表に行を足さない。シェルの部品 (中央のヘッダ・右のペインのタブ) が SDK の emit や D 節の経路を表示するときは、その行の割当にその部品を書き、表示を変える PR で対応表を直す」の趣旨に直す
- **根拠**: Constitution XII Statement / Examples、AD-044 Decision 4、UC-6
- **scope 根拠**: ui charter は本 PR の touched file。charter drift の判断は architecture-reviewer に委ねる

### [Medium] 「概要」のタブが起動時の権限モードを「権限モード」として出す。SDK の権限モードの変化 (Tier A・後続: O-4) に追随しないことが、対応表にも O-4 の範囲にも書かれていない (M-004) (scope: feature)

- **観察**: `OverviewTab.tsx:80-83` は起動の設定 `config.permissionMode` を出し、見出しは「権限モード」。対応表は途中の変化を記録している (`ui-coverage.md:47` SDKStatusMessage Tier A・`後続: O-4`、C 節 :138 `EnterPlanMode`、E 節 :184 `set_permission_mode` は `後続: X-6`)。roadmap の O-4 の行 (:270) と X-6 の行 (:247) に概要の追随の記述は無い。モデルも同じ (`config.modelId` が null のとき「既定」。実際のモデルは `init` の `model`、`後続: O-5`)
- **同種事象探索**: `permissionMode` を features/shell で 2 件。`概要` を ui-coverage.md / roadmap.md の O-4・X-6 の行で 0 件
- **リスク/影響**: 権限モードが変わると概要が実際と違う値のまま残る。O-4 / X-6 が別の場所に表示を足すと食い違う 2 つの表示が残る。持ち主の記録が欠けている (UC-5 / AD-028 §5)
- **推奨アクション**: (a) 最小案: 見出しを「起動時の権限モード」「起動時のモデル」にする。または (b) 対応表 :47 / :44 の備考と roadmap の O-4・X-6 の行に追随の担当を書く
- **根拠**: AD-044 Decision 2、AD-028 §5、UC-5 / UC-6
- **scope 根拠**: `OverviewTab.tsx`・`docs/ui-coverage.md`・`docs/roadmap.md` はどれも本 PR の touched file

### [Medium] F 節の「使い道」が、O-7 のシェルで使っている element について事実と合わず、凡例に無い値も入った (M-005) (scope: feature)

- **観察**: Thread list (`ui-coverage.md:337`) は `A | 未使用` のままだが、生成物 `thread-list.aui.tsx` をサイドバーの 2 つの区画が使っている (直下の :338 と research R-04 は「既存の `thread-list.aui.tsx` の行で組んだ」と書く)。Loading state (:286) は `B | 未使用` のままだが `GenerationLoader` を起動中の面・設定の 4 画面・`ChatScreen` が使う。Empty state (:268) の使い道が凡例 (:222「使い道は対応表の行か `未使用`」) に無い自由記述になり、設定の 4 画面が漏れている。F 節の機械照合は Tier の値だけ
- **同種事象探索**: elements の生成物 21 ファイルのうち `未使用` なのに import されているもの: Thread list / Loading state (要確認: O-7 の外の既存分の Attachment :235 / Composer attachments :246)
- **リスク/影響**: XIII Exceptions は F 節を照合の相手にしている。使っている element を `未使用` と書くと次の feature が読み違える。凡例に「SDK の外で使っている」値が無く、書き方が揃わない
- **推奨アクション**: :222 の凡例に F の使い道の 3 つ目の値 (例: `SDK の外: <置き場所>`) を足し、Thread list / Loading state / Empty state をその値に揃える。Attachment / Composer attachments は実際に描かれているかを確かめる
- **根拠**: `docs/ui-coverage.md:222`、AD-044 Decision 6、Constitution XIII Exceptions、spec FR-013
- **scope 根拠**: F 節は本 PR の touched file で、対象の element は O-7 のシェルが使っている

### [Medium] ui-coverage-reviewer の発火条件にシェル (`features/shell/**`) が無い (M-003) (scope: feature)

- **観察**: 本 PR は a11y / ux の `auto_invoke_patterns` にだけ `features/shell/**/*.tsx` と `App.tsx` を足した (`reviewers.yml:47-48` / `:94-95`)。ui-coverage-reviewer (`:164-178`) にはシェルも `features/session/LivePane.tsx` (D 節の 4 行の部品) も無い (LivePane.tsx 側は `SessionScreen.tsx` から続く既存の穴)
- **同種事象探索**: `features/shell` を reviewers.yml で 2 件 (a11y / ux)。ui-coverage の節で 0 件
- **リスク/影響**: 中央のヘッダや右のペインのタブだけを変え対応表を変えない PR で本 reviewer が起動しない (UC-1 を検出する経路が無い)
- **推奨アクション**: ui-coverage-reviewer に `src/renderer/src/features/shell/**` と `src/renderer/src/features/session/LivePane.tsx` を足す
- **根拠**: Constitution XII Verification Manual、AD-044 Consequences
- **scope 根拠**: reviewers.yml は本 PR の touched file

### [Low] Settings の備考が registry の Settings を O-7 の設定のダイアログとだけ照合し、対応表の行の候補として見ていない (L-001) (scope: feature)

- **観察**: `ui-coverage.md:323` の備考は `elements-settings-panel` を「モデル・system prompt・temperature の設定の部品」と書くが、モデルと thinking は E 節 `set_model` (:185) / `set_max_thinking_tokens` (:186) (`後続: X-6`) に当たる
- **推奨アクション**: 備考に「実行中のモデル・thinking の切り替え (E set_model / set_max_thinking_tokens。X-6) の候補。X-6 で Model selector / Composer model picker と合わせて照合する」を足す
- **根拠**: AD-044 Decision 6

### [Low] D 節 session-state (Tier A・実装済み) の表示を確かめるテストが無い (L-002) (scope: feature)

- **観察**: `SESSION_ROW_STATUS_LABELS` を `*.test.tsx` で 0 件。中央のヘッダのテストは HTML の無害化と密度の切り替えだけ。`session-status` は code-gate L-105 で外した
- **推奨アクション**: 稼働中のセッションの状態を変え、中央のヘッダにその `SESSION_ROW_STATUS_LABELS` が出ることを確かめるテストを 1 本足す
- **根拠**: reviewer-base H、AD-044 Decision 1

### 固有観点の該当なし

- UC-2: 該当なし。`claude-agent-sdk` の差分 0。package.json / pnpm-lock.yaml の差分は vitest-axe とその依存だけ
- UC-4: 該当なし。Tier の列の変更は 0 件
- UC-7: 該当なし。O-7 を completed にする変更は無い (`status: reviewing`)。`後続: O-7` は 0 件

### H (担当範囲の regression の根拠)

- 他の D 節の行の部品 (ApprovalCard / DeniedNotice / FailureBanner / EndNotice) は `LiveSessionPane` の本体を変えずに移した。テストも名前を変えて残っている
- 欠けているのは session-state の表示のテスト (L-002) と発火条件 (M-003)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | D / E 節の `実装済み:` の element 名をコードと照合 | 1 | docs/ui-coverage.md:169 |
| M-002 | `Principle XII` in ui charter / `XII` in 0046 | 1 | docs/domains/ui/charter.md:65 |
| M-003 | `features/shell` in reviewers.yml | 2 (ui-coverage は 0) | reviewers.yml:47, :94 / 欠落 :164-178 |
| M-004 | `permissionMode` in features/shell、`概要` in ui-coverage.md / roadmap.md | 2 / 0 | OverviewTab.tsx:81-82, shell/labels.ts:59 |
| M-005 | elements の import と F 節の `未使用` の突き合わせ | 2 (+ 要確認 2) | ui-coverage.md:337, :286 (:235, :246)。:268 は凡例の外 |
| L-001 | `X-6` in F 節 | 2 | ui-coverage.md:297, :316 |
| L-002 | `SESSION_ROW_STATUS_LABELS` in *.test.tsx / `center-header` in src | 0 / 3 | AppShell.test.tsx:387, :400, CenterHeader.tsx:30 |

## Verdict

- Critical: 0
- High: 0
- Medium: 5
- Low: 2

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
