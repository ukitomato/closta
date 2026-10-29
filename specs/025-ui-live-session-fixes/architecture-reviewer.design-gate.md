# architecture-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-29
**Reviewer**: architecture-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004 (composer の周りの選択): composer と中央のヘッダ。AD-046 の置き場所の語、ui-coverage F 節
  - FR-005〜FR-007 (既定の Provider のモデル): AD-036 §4 P3、AD-062 Decision 2・6、AD-043 Decision 4。session の契約 (`SessionControl` / supervisor の message / IPC) を広げる
  - FR-008〜FR-010 (権限モードの名前): Constitution Principle XV の Exceptions の改定 (AD-065 Decision 3 / 4)
  - FR-011〜FR-013 (停止と Esc): AD-037 D1 (`onKeyDown` で preventDefault しない、ガードを殺さない)
  - FR-014〜FR-015 (右のパネル): AD-046 (幅は変えない)
  - FR-016〜FR-018 (`/resume`): AD-059 / X-9 の再開の流れ、ui charter の「面の状態」
  - SC-001〜SC-007: 計測経路は tasks の各テストにある
- touched files に該当する charter / Confirmation:
  - ui charter: Scope (composer `:68`・ui-coverage `:74`・アプリのシェル `:93-100`)、Cross-domain dependencies と「面の状態」(`:197-213`)
  - session charter: Related ADRs / Related Specs (ui の feature が session の契約を広げたときの記録の先例)
  - provider charter: モデルカタログ (`:37`, `:86`)
  - `_overview.md`: Feature 帰属の表、帰属の判断根拠
  - Confirmation: AD-065 全項目、AD-062 (Provider のあるセッションの分は変えない)、AD-037 D1、AD-046 Decision 6
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:3 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:3 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 永続化スキーマの変更なし。a11y / ux / ui-coverage はそれぞれの reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。担当範囲で見た点:
  - US-2 の境界の回帰は検出できる。AD-065 Confirmation の単体、`queryMethodsAreClassified` の型の網羅、`query-mutation-methods.test.ts` (20)、rule fixture `sdk-query-method-indirect` (BE-021) がある
  - 観測点は `[session] live-models count=N dropped=M` で足りている
  - 検出手段が欠けているもの: features/session から features/shell への import の向きの確認 (M-003) と、Constitution と名前の表を一緒にマージすることの確認 (H-001)。どちらも各指摘の推奨アクションに含めた

## スコープ要約

本 spec は ui の feature で、実機で見つかった 6 つの問題を直す。
- composer の周りに選択を移す
- 既定の Provider のモデルを `Query.supportedModels()` で取り、`list-models` / `models-result` / `listSessionModels` の経路を足す
- 権限モードの名前を Claude Code の英語の表記にし、Principle XV の Exceptions を改定する
- 停止ボタンを `outline` にし、Esc で止める
- 右のパネルのタブと使用量の崩れを直す
- `/resume` を足す

決定は AD-065 (accepted) にあり、AD-036 §4 P3 と AD-062 Decision 1〜3 を後続 ADR で読み替えている。これは AD-031 の手続きどおりで、accepted の ADR を in-place で書き換える箇所は無い。

主な問題は 2 つある。1 つは Constitution の改定とコードのマージ順 (RK-08)。もう 1 つは、session の契約を広げる ui の feature としての記録が、先例どおりに予定されていないことである。

## Findings

### [High] RK-08 の分割では、Constitution の Exceptions より先に英語の名前が main に入る (H-001) (scope: feature)

- **観察**:
  - `specs/025-ui-live-session-fixes/plan.md:391` (RK-08) と `tasks.md:126` (SH-011)・`tasks.md:154` は、夜間に PR をマージするとき Constitution の差分だけを別 PR に分け、「名前の表の変更は AD-065 (accepted) を根拠に先に入れる」としている
  - 一方 plan 自身 (`plan.md:377`) と AD-065 Alternatives (`docs/decisions/0065-…md:68`) は、「Constitution を改めないと Principle XV の本文と食い違ったまま残る」ことを、改定を選んだ理由に挙げている
- **同種事象探索**: `RK-08` で 3 件 (`plan.md:391`, `tasks.md:126`, `tasks.md:154`)。先例として挙げる O-12 U-12 (`docs/roadmap.md:387`) は Verification の文言の改定で、コードの側は改定に依存していない。改定に依存するコードを先にマージする先例は 0 件
- **リスク/影響**:
  - Governance (`.specify/memory/constitution.md:1026-1028`) は「Principle と ADR が食い違う場合は Constitution を正とする」と定める。分割すると、main が Principle XV の UI labels (日本語が第一言語) と食い違い、ADR だけを根拠とする期間ができる
  - AD-065 Decision 4 の改定手順 2 は「O-13 の PR で人間のレビュー」としている (`0065-…md:51`)。コードだけを先にマージすると、その審査の前に例外が既成事実になる
- **推奨アクション**: RK-08 を次のどちらかに改める。
  - (a) 分割するときは、FE-010 (名前の表・説明の削除) を SH-011 と同じ人間レビュー待ちの PR に入れる
  - (b) Constitution の PR が先にマージされたことを、FE-010 を含む PR のマージ条件にする

  tasks.md:126 / :154 の記述も同じように直す。SH-012 の確認項目に「`PERMISSION_MODE_NAMES` の差分と Constitution XV の Exceptions が同じ PR か、Constitution が先に main にある」ことを足す。
- **根拠**: Constitution Governance「優先順位」・改定手順 2、AD-065 Decision 4
- **scope 根拠**: plan / tasks の手順で直せる

### [Medium] session の契約を広げるのに、session charter と `_overview.md` を直す予定が無い (M-001) (scope: feature)

- **観察**:
  - `plan.md:179` は「main / agents の一覧の経路は session の制御の配管で、charter の改定は要らない」としている
  - SH-010 (`tasks.md:121-125`) が直すのは ui charter だけである
  - 一方、本 feature は session の契約を広げる。`SessionControl` 8 → 9、supervisor の message `models-result`、IPC `listSessionModels`、`setModel` の検証の規則 (AD-062 Decision 2 の読み替え) である。AD-065 も `affected_domains: [ui, session]` (`0065-…md:7`) としている
- **同種事象探索**:
  - `ui の feature が本 domain の契約を広げた` で session charter に 4 件 (`docs/domains/session/charter.md:255`, `:256`, `:258`, `:262`)
  - Related Specs の O-4 / O-5 / O-6 / O-9 / O-11 / O-12 の項 (`:301-340`)
  - `_overview.md` の「O-X は ui のまま、session の契約を広げる」が `:108-127` に 5 項
  - `_overview.md` の Feature 帰属の表に O-13 の行は 0 件。M3 の行 (`:142`) も「O-1〜O-12 と X-8 / X-9」のまま
- **リスク/影響**: session charter の X-6 の記録 (`:352-354`) を読むと、実行中のモデルの変更が今もカタログに閉じているように読める。023 U-10 の残りが O-13 で閉じたことも session の側に残らない
- **推奨アクション**: SH-010 に次の 3 つを足す。
  - session charter の Related ADRs に AD-065 (「O-13。ui の feature が本 domain の契約を広げた」)
  - session charter の Related Specs に O-13 (ui) の項。広げた契約の件数と、変えないものを書く
  - `_overview.md` の Feature 帰属の表に O-13 の行、M3 の行に O-13 (完了の条件に数えない)、帰属の判断根拠に「O-13 は ui のまま、session の契約を広げる」

  plan.md:179 の「charter の改定は要らない」も直す。
- **根拠**: session charter の記録の先例 (O-4〜O-12)、`_overview.md` の帰属の判断根拠
- **scope 根拠**: charter の SSoT の drift。本 PR の docs で直せる

### [Medium] ui charter の「面の状態」の例外が実態と合っておらず、本 feature で書き手がまた増える (M-002) (scope: system)

- **観察**: ui charter (`docs/domains/ui/charter.md:197-213`) は、session のコンポーネントが面の状態 (`stores/ui.ts`) を書く例外を `seedFolderDraft` と `openSettings('folders')` の「2 件だけ」としている。しかし起動ダイアログの開閉 (`setLaunchOpen`) は、すでに session から書かれている。FE-052 / FE-053 の `startPastResume` (data-model §7.4 の手順 2) は、ResumePickerDialog から同じ書き込みを行う
- **同種事象探索**: `setLaunchOpen` を `src/renderer/src/features/session` で探すと 3 箇所。`PastResumeBar.tsx:82`、`resume-action.ts:67`、`RunningSessionsProvider.tsx:95` (`setLaunchOpen(false)`)。charter の例外にはどれも載っていない
- **リスク/影響**: 「この項が運用上の正本」と書かれた不変条件が守られていない。本 feature の plan の Domain charter の整合 (`plan.md:171-179`) も、ここを確かめていない
- **推奨アクション**: SH-010 で ui charter の「面の状態」に例外を 1 つ足す。中身は「再開の導線 (`startPastResume` / `resume-action`) が起動ダイアログを開く `setLaunchOpen(true)`。`focus` には触れない」。既存の 3 箇所 (X-9 の 021 由来) もまとめて書く
- **根拠**: ui charter「面の状態」、glossary Shell の Counterexamples (`docs/glossary.md:1251-1252`)
- **scope 根拠**: 既存の drift は 021 由来なので system。本 feature で書き手が増えるので、同じ PR で直すのがよい

### [Medium] ResumePickerDialog に `useDialogReturnFocus` (features/shell) を写す指示があいまいで、import の向きを後から確かめる手段も無い (M-003) (scope: feature)

- **観察**:
  - FE-053 (`tasks.md:114`) は「`features/shell/CommandPalette.tsx` の `Dialog`・`useDialogReturnFocus`・… の表示の組み方を写す」としている。plan.md:321 も同じである
  - `useDialogReturnFocus` は `src/renderer/src/features/shell/useDialogReturnFocus.ts:27` にある
  - 一方、plan は LiveSettingsControls を移す理由を「`features/session` は今 `features/shell` を import していない」(`plan.md:304`) としている。FE-001 のテスト (`tasks.md:36`) もその 0 件を確かめる
  - さらに data-model §7.4 では、閉じたときの戻り先は `handOffFocusToComposer` で、`useDialogReturnFocus` を使う必要がない
- **同種事象探索**:
  - features/session から features/shell への import は今 0 件
  - `useDialogReturnFocus` を import しているのは features/shell の 3 ファイル (`CommandPalette.tsx:28`, `LaunchDialogHost.tsx:14`, `SettingsDialog.tsx:15`)
  - `.dependency-cruiser.js` に features 間の規則は 0 件
- **リスク/影響**: 0 件の確認は FE-001 の時点で 1 回行うだけで、SH-012 (`tasks.md:127`) の境界の確認に入っていない。FE-053 で import が足されても検出されない
- **推奨アクション**:
  - FE-053 / plan.md:321 から `useDialogReturnFocus` を外す。閉じたときは `handOffFocusToComposer`、再開に進んだときは 021 の規則、と §7.4 のとおりに書く
  - SH-012 に「`src/renderer/src/features/session/` から `features/shell/` への import が 0 件」を Grep で確かめる項目を足す
- **根拠**: plan の「実装方針」の移動の理由、ui charter の Cross-domain dependencies
- **scope 根拠**: tasks / plan で直せる

### [Medium] `normalizeLiveModels` を provider の `model-catalog.ts` に置く。plan 自身の「カタログではない」と食い違う (M-004) (scope: feature)

- **観察**:
  - data-model §1.2 (`data-model.md:35`) と BE-020 は、`normalizeLiveModels(raw: unknown)` を `src/domain/provider/model-catalog.ts` に置く
  - この関数は Agent SDK の `ModelInfo` の形 (`value` → `id`) を知っている
  - 一方 plan の Glossary excerpt (`plan.md:217`) は「既定の Provider の一覧はカタログではない (Provider に属さない)。検査の規則だけを共有する」としている。provider charter のモデルカタログは「Provider ごとに使えるモデルの集合」(`docs/domains/provider/charter.md:86`) である
- **同種事象探索**: SDK 由来のモデルの id の検査を domain/session に置き、provider の `isValidModelId` を読む先例が 1 件ある (`src/domain/session/session-init-report.ts:1`, `:152-162`)。provider の側に SDK の返り値の写しを置いた先例は 0 件
- **リスク/影響**: provider domain が session (Claude Code が動いている間の答え) の SDK の形を持つ。domain の依存は session → provider なので、知識の置き場が逆になる
- **推奨アクション**: `normalizeLiveModels` を `src/domain/session/live-settings.ts` (`LiveModelsResult` と同じファイル) に置き、`isValidModelEntry` / `MAX_CATALOG_MODELS` を provider から import する。data-model §1.2、BE-020、plan のレイヤごとの表 (`plan.md:100`)、contracts のテストの観点の置き場所 (`model-catalog.test.ts` → `live-settings.test.ts`) を同じように直す
- **根拠**: provider charter の Key concepts、glossary Model catalog、`_overview.md` の依存関係
- **scope 根拠**: 本 feature の新設の関数の置き場所

### [Medium] AD-065 の読み替えの表に AD-043 Decision 4 (main を経由するのは状態通知だけ) が無い (M-005) (scope: feature)

- **観察**:
  - AD-043 Decision 4 (`docs/decisions/0043-…md:63-67`) は「main を経由するのは状態通知だけにし」「main での行のパースは本文を運ばないメタデータに限る」としている
  - AD-065 の `models-result` (contracts C-9) は、supervisor から main に値 (最大 64 件のモデルの一覧) を運ぶ。成否だけを運ぶ `control-result` と違い、値を運ぶ初めての message である
  - それなのに AD-065 の「読み替える箇所」(`0065-…md:25-30`) は AD-043 を挙げていない。plan の Related ADRs (`plan.md:211`) は「`models-result` を足す」とだけ書いている
- **同種事象探索**: supervisor → main の message の種類の追加は、AD-062 Decision 6 の `control-result` が 1 件。こちらも AD-043 Decision 4 を読み替えの表に載せていない (`0062-…md:24-32`)。本件は先例の欠落を 2 回目に重ねることになる
- **リスク/影響**: AD-043 Decision 4 の字面と実態の差が増える。次に supervisor から main へ値を運びたい feature が、根拠を辿れない
- **推奨アクション**: AD-065 はこの枝でまだマージされていない。マージ前に、読み替えの表に 1 行足す。中身は「AD-043 Decision 4 → 本文を運ばない有界のメタデータ (`models-result`。検査した最大 64 件) を main に運ぶ。本文の経路は変えない」。マージ後に直す場合は、AD-031 の日付つきの訂正節にする
- **根拠**: AD-043 Decision 4、AD-031
- **scope 根拠**: 本 feature で起こした ADR

### [Medium] ui-coverage の置き場所の書き換え「composer の周り」が AD-046 Decision 6 の語に無い (M-006) (scope: feature)

- **観察**:
  - SH-010 (`tasks.md:122`) と research R-11 (`research.md:197`) は、F 節の 3 行と E 節 `:219` / `:220` の置き場所を「中央のヘッダ」から「composer の周り」に書き直すとしている
  - AD-046 Decision 6 (`docs/decisions/0046-app-shell-layout.md:34`) は「後続 feature は表示の置き場所を『サイドバー』『中央のヘッダ』『中央の本体』『右のペインのタブ』『設定のダイアログ』で書く」と定める
  - ui-coverage の凡例 (`docs/ui-coverage.md:19`) は、その語で表せないときはコンポーネントの名前を添える、としている
- **同種事象探索**: `中央の本体の composer` の先例が 2 件ある (`docs/ui-coverage.md:270`, `:281`)
- **リスク/影響**: 置き場所の語の集合 (glossary Shell `docs/glossary.md:1241`) の外の語が、対応表と glossary に入る
- **推奨アクション**: SH-010 の書き換えの語を「中央の本体の composer (左の群。`LiveSettingsControls`)」にする。SH-001 の Composer の定義の追記も同じ語にそろえる
- **根拠**: AD-046 Decision 6、ui-coverage の凡例
- **scope 根拠**: 本 PR の docs の書き換え

### [Low] glossary の SessionControl の列挙に既存の `respond-elicitation` が抜けている (L-001) (scope: feature)

- **観察**: `docs/glossary.md:1015-1017` は「8 種類」としながら、名前を 7 つしか挙げていない (`respond-elicitation` が無い)。SH-001 (`tasks.md:27`) の変更は「8 → 9 種類」だけである
- **推奨アクション**: SH-001 で 9 つの名前を全部挙げ、`list-models` が main から発行する読み取りの要求であることを添える
- **根拠**: Principle XIV
- **scope 根拠**: 本 feature で触る glossary の項

### [Low] 選ぶ画面の語が glossary に無く、題が Resume dialog とほぼ同じ (L-002) (scope: feature)

- **観察**: 選ぶ画面の題「過去のセッションを再開」(`data-model.md:262`) は、すぐ後に開く Resume dialog の見出し「セッションを再開」(`docs/glossary.md:950`) とほぼ同じである。data-model §7.3 は 1 行に `sessionId`、§7.4 は `conversationId` と書き、同じ値の呼び名が揺れている
- **推奨アクション**:
  - SH-001 で「Resume picker (再開するセッションを選ぶ画面)」を足し、Resume dialog との違いを Counterexamples に書く
  - §7.3 / §7.4 の呼び名を `conversationId` にそろえる (`resolvePastResume(targetKey, conversationId)`。`src/domain/capability.ts:170`)
- **根拠**: Principle XIV
- **scope 根拠**: 本 feature の新しい概念

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `RK-08` (specs/025) | 3 | plan.md:391, tasks.md:126, tasks.md:154 |
| M-001 | `ui の feature が本 domain の契約を広げた` (session charter) / `O-13` (_overview) | 4 / 0 | session/charter.md:255, :256, :258, :262 / _overview.md (なし) |
| M-002 | `setLaunchOpen` (features/session) | 3 | PastResumeBar.tsx:82, resume-action.ts:67, RunningSessionsProvider.tsx:95 |
| M-003 | `features/shell` を import (features/session) / `useDialogReturnFocus` | 0 / 3 | — / CommandPalette.tsx:28, LaunchDialogHost.tsx:14, SettingsDialog.tsx:15 |
| M-004 | `isValidModelId` を domain/session で使う先例 | 1 | session-init-report.ts:1 |
| M-005 | supervisor → main の message の追加で AD-043 D4 を読み替えた ADR | 0 | AD-062 Decision 6 も読み替えていない |
| M-006 | `中央の本体の composer` (ui-coverage) | 2 | ui-coverage.md:270, :281 |

## Verdict

- Critical: 0
- High: 1
- Medium: 6
- Low: 2
