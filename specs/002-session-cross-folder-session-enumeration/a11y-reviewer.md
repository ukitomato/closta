# a11y-reviewer Review: セッション列挙 (R-2)

**Run**: 2026-09-23
**Reviewer**: a11y-reviewer
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Round**: 1 (code-gate iteration 1)

**注**: reviewer は read-only tool のため本ファイルを Write できず、gate orchestrator が hand-back 内容を保存した。

## 初回読了 viewpoint

読了済み: `.claude/agents/reviewer-base.md` 全文 / `spec.md` 全文 (FR-001〜052 / SC-001〜016 / Edge Cases / Assumptions / Out of Scope) / `plan.md` Domain Context + Related ADRs + 「UI の構成 (Principle XIII の扱い)」(plan.md:254-275) / `tasks.md` (a11y 名指しタスクの有無を grep: **0 件**) / 対象 UI 全ファイル (`SessionListScreen.tsx` / `labels.ts` / `rows.ts` / `useSessions.ts` / `useFolderLabels.ts` / `thread-list.aui.tsx` / `WorkspaceFoldersScreen.tsx` / `App.tsx` / `input.tsx`) / 依存部品 (`components/ui/button.tsx` / `skeleton.tsx` / `elements/empty-state.tsx` / `error-state.tsx` / `surfaces.tsx` / `runtime/thread-list-adapter.ts` / `stores/ui.ts`) / theme token (`src/renderer/src/assets/main.css` の `:root` / `.dark` 全値) / `src/renderer/index.html` / `node_modules/@assistant-ui/react/dist/primitives/threadList*`・`threadListItem/ThreadListItemRoot.js` (role / aria / キーボード実装の実体確認) / `SessionListScreen.test.tsx` (a11y 断言の有無)。

**本 PR で実装/影響される FR / SC (a11y 観点で追跡したもの)**

- FR-037 (先頭から段階的に提示) — 段階描画が支援技術に伝わるかの起点。`SessionListScreen.tsx:419-423`
- FR-032 / SC-013 (空状態 5 条件に導線) — 導線が**キーボードとフォーカス管理の観点で成立するか**。`:525-588`
- FR-030 / FR-031 (所在ごとの失敗を理由つきに) — `Outcomes` の提示形式。`:258-311` / `labels.ts:19-36`
- FR-025 / FR-026 (未登録グループの畳みと登録導線) — 開閉状態の伝達とフォーカス遷移。`:173-207`
- FR-040 (所在とフォルダの絞り込み) — 選択状態の伝達。`:462-511`
- FR-052 (由来候補の常時識別) — `SourceLabel` の提示形式。`:79-85`
- FR-046 / FR-047 (日本語第一言語 / 要約が空でも識別可能) — `lang="ja"` (index.html:7) と `rowTitleText` は満たしている
- FR-022 / FR-028 / FR-029 (保留 / 不明 / worktree・programmatic の区別可能な提示) — **色記号依存の有無**を検査 → 全て日本語テキストを持ち 1.4.1 は満たす
- SC-009 (非 ASCII / 空要約 / 制御文字でも行が識別可能) — `truncate` による視覚的欠落に限り残余あり (M-002)
- SC-008 (先頭 50 件 2 秒 / キャッシュ 100 ms) — 段階描画を a11y で潰さない制約として参照 (H-001 の推奨アクションは追加 I/O を伴わない)

**touched files に該当する charter / Confirmation**

- `plan.md:254-275` 「UI の構成 (Principle XIII の扱い)」 — element の写しから書き込み操作を外す方針は守られている (`thread-list.aui.tsx:14-35` / `thread-list-adapter.ts:10-26`)。**ただし同節は role / 状態伝達を規定しておらず、primitive を直接組んだ結果の ARIA 責務が誰の持ち物か未定義** (H-002 / H-004 の根拠)
- `spec.md` Assumptions `[USER]` 「セッション一覧は assistant-ui の thread-list 系 element を土台にする / 4 種のグループと失敗行は element のモデルに無いため primitive を直接組む」 — **element が持っていた semantics も同時に外れる**点が本 review の中心 (H-002 / H-004 / H-005)
- `docs/domains/session/charter.md` Journey 1 — 一覧の到達性そのものが Journey の成立条件。キーボード単独操作は成立している (行 Trigger は native `<button>`、`ThreadListItemRoot` が ArrowUp/Down の roving も実装) ため **Critical 級のキーボード到達不可は 0 件**
- Constitution Principle XIII (既存 element / トークンを優先) — `WorkspaceFoldersScreen.tsx:66-87` が過去の a11y 指摘に対し「独自トークンを足さず既存パレットの段を選び直す」で応じた先例があり、C-001 / H-008 の推奨アクションも同じ形に収めた

**viewpoint 集計**

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲。本 review は renderer の提示層のみを見た
- B. 入力検証 / injection / 暗号: 該当なし: `security-reviewer` の Owner 範囲。renderer は DTO を表示するだけで検証責務を持たない
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner 範囲。Principle XIII は推奨アクションの**制約**として参照しただけで drift 判定はしていない
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` / `ux-reviewer` の Owner 範囲。価値・SC 計測可能性・空状態の文言は扱わない
- F. 命名 / module / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲
- G. DB / API / a11y / perf / OpenAPI / UX state: Critical:1 High:8 Medium:5 Low:3
- H. テスト / coverage / observability / regression: Medium:1

## スコープ要約

R-2 が追加した `SessionListScreen` は、`ThreadListPrimitive` を「会話リスト」から「読み取り専用のセッション一覧」へ転用し、**4 種のグループの入れ子・所在ごとの成否行・絞り込み・段階描画**という element のモデルに無い構造を primitive の上に自前で組んでいる。結果として **文言 (日本語ラベル) の網羅性は非常に高い** (`labels.ts` が `Record` で全参照キーを訳出し、`FAILURE_REASON_HINTS` が解消手順まで持つ。「取得中 / 未列挙 / 失敗 / 履歴なし」は色や記号ではなく**テキストで区別**されており WCAG 1.4.1 は満たす) 一方、**その文言が「いつ変わったか」「どの構造に属するか」「どれが選択中か」を支援技術へ渡す層が丸ごと欠けている**。具体的には renderer 全体で `aria-live` / `role="status"` / `aria-busy` を持つのは `WorkspaceFoldersScreen` と `error-state` / `runtime-list` だけで、**`features/session-list/` には 1 つも無く** (grep 結果)、`aria-expanded` / `aria-pressed` は **リポジトリ全体で 0 件**である。加えて `error-state` の本文が light 既定テーマで 2.9:1 しか無く、R-2 が 4 つ目の呼び出し元として同じ不適合を新規に持ち込んでいる。キーボード到達性そのもの (行 / 開閉 / 絞り込み / 登録導線) は native 要素で成立しているため Critical はコントラスト 1 件に留まる。

## Findings

### [Critical] `ErrorState` の本文が light 既定で 2.9:1 — セッション一覧の失敗時に次の操作が読めない (C-001) (scope: system)

- **観察**: `src/renderer/src/components/assistant-ui/elements/error-state.tsx:69` が背景に `bg-red-500/[0.06]` (light) / `dark:bg-red-500/10` を、`:78` が本文に `text-red-600/60 dark:text-red-400/60` (`text-[13px]`) を指定している。`src/renderer/src/features/session-list/SessionListScreen.tsx:437-446` が **R-2 で新規にこの部品を呼び出し**、`detail="再取得してください。続く場合はログを確認してください。"` を渡している。
  Tailwind v4 の `red-600` (`oklch(0.577 0.245 27.325)` ≒ `#e7000b`) を alpha 0.6 で背景へ合成した実効色の相対輝度は約 0.281、背景 (`red-500` 6% over `#ffffff`) は約 0.914 → **コントラスト比 約 2.9:1**。dark も `red-400/60` on `#09090b`+`red-500/10` で **約 2.9:1**。同要素の見出し (`:77` `text-red-600` / `text-sm font-medium` = 14px、large text 扱いにならない) も **約 4.4:1**、再試行ボタン (`:85` `text-red-600` / `text-xs`) も **約 4.4:1** で、いずれも 4.5:1 を下回る。`retrying` 分岐 (`:56` `text-foreground/55` on `#ffffff`) も **約 4.4:1**。
- **同種事象探索**: `grep -rn 'text-red-600/60|text-red-400/60|ErrorState' src/renderer/src` で **13 件** (定義 1 + 呼び出し 4 + import 4 + 型/コメント 4)。alpha 付き本文色の実体は `error-state.tsx:78` の **1 箇所**、影響する呼び出し元は `features/session-list/SessionListScreen.tsx:438` (R-2 新規) / `features/workspace-folders/WorkspaceFoldersScreen.tsx:309` / `features/runtime-list/RuntimeListScreen.tsx:165` / `features/folder-runtime-resolution/ResolutionScreen.tsx:274` の **4 件**。
- **リスク/影響**: WCAG 2.1 **1.4.3 Contrast (Minimum) / AA の明確な不適合**であり、既定テーマ (light、`stores/ui.ts:59` の `dark: false`) の起動直後に発生する。しかも不足しているのは「何をすれば復帰できるか」を唯一書いている行であり、`SessionListScreen` にとってこの分岐は **IPC 自体が通らなかった場合の最後の出口** (`useSessions.ts:61-68` が例外を state に落とす経路) である。ロービジョン利用者にとって、失敗したことは分かるが復帰手段が読めない状態になる。1.4.1 は満たしているため回避手段が無い。
- **推奨アクション**: `error-state.tsx:78` の alpha を外し、**既存パレットの段を選び直すだけ**にする (`WorkspaceFoldersScreen.tsx:66-87` が同じ判断を先例として記録済み。独自トークンを足さないので Principle XIII と衝突しない)。
  - `:78` → `text-red-700 dark:text-red-300` (light `red-700` ≒ `#c10007` で背景 0.914 に対し約 6.3:1、dark `red-300` ≒ `#ffa2a2` で約 8:1)
  - `:77` → `text-red-700 dark:text-red-300` (現状 4.4:1 → 4.5:1 未満のため同時に直す)
  - `:85` のボタンラベルも同段へ (`text-xs` は 4.5:1 必須)
  - `:56` の `text-foreground/55` → `text-foreground/70` 以上 (約 4.4:1 → 6:1 超)
  - 4 呼び出し元すべてが同一部品経由なので**修正は 1 ファイルで cascade 全件を塞ぐ**。`retryLabel` / `retryingLabel` を prop 化した既存方針 (`:16-30`) と同様、registry 原本との差分としてコメントを残すこと
- **根拠**: WCAG 2.1 SC 1.4.3 (AA) / Constitution Principle XIII (既存トークンの段を選び直す形に限る) / `WorkspaceFoldersScreen.tsx:66-87` の先例
- **scope 根拠**: `error-state.tsx` は `touched-files.txt` に無く 4 画面共有の registry 写しであるため `system`。ただし **R-2 が 4 つ目の呼び出し元を新設して同じ不適合を新規経路に持ち込んでいる**ため、本 feature で塞ぐのが最も安い

### [High] 段階描画・取得完了・失敗が live region に乗らず、スクリーンリーダー利用者が一覧の変化を追えない (H-001) (scope: feature)

- **観察**: `SessionListScreen.tsx` 全体に `aria-live` / `role="status"` / `role="alert"` / `aria-busy` が **1 つも無い**。変化するのは (a) `:416-423` の「未取得 → 取得時刻 … — 先頭ページのみ表示しています（件数は確定していません） → — 全 N 件」、(b) `:454-460` の `Outcomes` 行が所在ごとに増える、(c) `:513-523` の `Section` と行が増える、(d) `:426-434` のボタンラベル「全件を取り直す ↔ 取得中…」、(e) `:437` の失敗表示。いずれも**無音で DOM が差し替わる**。
  唯一の候補である `thread-list.aui.tsx:88-107` の `ThreadListSkeleton` は `role="status"` + `aria-label="セッションを取得しています"` を持つが、**(i) 中身が空の `<div>`** (`Skeleton` はテキストを持たない) のため live region の通知内容が空であり、**(ii) `rows = 5` の各行に role が付くので status region が 5 個同時にマウントされる**。live region はアクセシブル名ではなく**内容の変化**を読むため、この実装では「取得中」は伝わらず、代わりに空の通知が 5 回発火しうる。
  対照的に同じ R-2 の diff 内で `WorkspaceFoldersScreen.tsx:549-560` は「常時マウントして中身だけ差し替える」live region を明示的なコメント付きで導入しており、`:434` は `aria-busy` も付けている。**主対象画面だけがこの層を持っていない。**
- **同種事象探索**: `grep -rn 'aria-live|role="status"|role="alert"|aria-busy' src/renderer/src` で **15 件**。`features/session-list/` 配下は **0 件**、`thread-list.aui.tsx:94` の 1 件のみが間接的に関わる。
- **リスク/影響**: WCAG 2.1 **4.1.3 Status Messages (AA)** の不適合。spec が最も力を入れている 3 つの状態 — 段階描画中である (FR-037)、件数が確定した、所在が列挙できなかった (FR-030/FR-031) — が視覚のみに存在する。実測で WSL 先頭 50 件に 1.8 秒かかるため、スクリーンリーダー利用者は**無音の 2 秒のあと、再フォーカスして初めて行が増えたことに気付く**。H-007 (disabled によるフォーカス喪失) と重なると、再取得操作に対する feedback が完全に 0 になる。
- **推奨アクション**:
  1. `:408-435` の `<header>` 内、鮮度テキスト `:411-424` を包む `<p>` に **`role="status" aria-live="polite"` を付ける** (`WorkspaceFoldersScreen.tsx:554` と同形、常時マウント)
  2. 一覧本体に **`aria-busy={sessions.loading}`** を付ける (`WorkspaceFoldersScreen.tsx:434` と同形)
  3. `:437-446` の失敗ブロックを常時マウントの `<div role="status" aria-live="polite" className="empty:hidden">` で包む
  4. `thread-list.aui.tsx:88-107` は **`role="status"` を行ごとから外し最外殻 1 箇所に移す**。内容が空である問題を `<span className="sr-only">セッションを取得しています</span>` で埋め、骨組み行自体は `aria-hidden` にする
  5. **過剰読み上げを避ける措置も同時に入れる**: 行が増える経路 (`:454-523`) には live region を**付けない**。通知は (1) の要約 1 行に集約し、`aria-live="assertive"` は使わない
- **根拠**: WCAG 2.1 SC 4.1.3 (AA) / SC 1.3.1 / FR-037 / FR-030 / FR-031 / `WorkspaceFoldersScreen.tsx:549-553` の同種修正の先例
- **scope 根拠**: `SessionListScreen.tsx` / `thread-list.aui.tsx` はともに touched (feature)

### [High] 畳まれた未登録グループの展開状態が支援技術に伝わらない (H-002) (scope: feature)

- **観察**: `SessionListScreen.tsx:203-207` の開閉ボタンは `{open ? '畳む' : '開く'}` という**ラベル文字列だけ**で状態を表し、`aria-expanded` / `aria-controls` を持たない。制御対象 (`:216-246`) には `id` も無い。`useState(!collapsible)` (`:174`) により未登録グループは既定で閉じ、**閉じている間は行が DOM に存在しない**。
- **同種事象探索**: `grep -rn 'aria-expanded|aria-pressed|aria-controls' src/renderer/src` で **0 件** (リポジトリ全体)。同種の toggle は `SessionListScreen.tsx:203-207` / `:467-507` / `App.tsx:59-65` の 3 箇所。
- **リスク/影響**: WCAG 2.1 **4.1.2 Name, Role, Value (A)** の不適合。ブラウズモードで一覧を走査する利用者は「見出しと件数はあるのに行が無い」状態に遭遇して、それが **畳まれているのか / 本当に 0 件なのか / 取得途中なのか**を区別できない。この 3 者の区別は spec が FR-051 / FR-025 / FR-037 で**明示的に分けたがっている軸**である。
- **推奨アクション**: disclosure pattern にする (`aria-expanded={open}` + `aria-controls={panelId}`、対象に `id`)。ボタンのアクセシブル名にグループ名を含める。行数が多い場合は条件レンダリングのまま `aria-expanded` のみでも 4.1.2 は満たす。
- **根拠**: WCAG 2.1 SC 4.1.2 (A) / SC 1.3.1 / FR-025 / ARIA APG "Disclosure"
- **scope 根拠**: touched (feature)

### [High] 絞り込みの選択状態が `variant` の色だけで表され、支援技術には一切伝わらない (H-003) (scope: feature)

- **観察**: `SessionListScreen.tsx:462-511` の絞り込みは選択中を `variant={... ? 'secondary' : 'ghost'}` (`:468` / `:476-481` / `:492` / `:500`) で表す。`button.tsx:16-19` により `secondary` は `bg-secondary` (light ≒ `#f4f4f5`)、`ghost` は背景なし (`#ffffff`)。差は **輝度比 約 1.04:1**。`aria-pressed` も `role="radiogroup"` / `aria-checked` も無い。グループ自体にアクセシブル名が無く、見出しは `:466` の素の `<span>`、区切りは `:490` の `<span>/</span>`。
- **同種事象探索**: `grep -rn 'aria-pressed|role="radio|role="group' src/renderer/src` で **0 件**。`variant={cond ? 'secondary' : 'ghost'}` 形は `:468,477-480,492,501` の **5 箇所** (すべて本 feature が新設)。
- **リスク/影響**: WCAG 2.1 **4.1.2 (A)** および **1.4.1 Use of Color (A)** の不適合。いま何で絞られているのかを知る手段が無い。晴眼キーボード利用者にとっても 1.04:1 の差は実質不可視で、一覧が短くなった理由を辿れない。**解除の導線は絞り込み結果 0 件のときしか現れない**ため、状態が分からないまま「セッションが消えた」と読み違える経路が残る。
- **推奨アクション**: (1) 各ボタンに `aria-pressed={選択中}` (5 箇所)、(2) 2 群を `role="group" aria-label="所在で絞り込む"` / `"フォルダで絞り込む"` で包む、(3) 選択中を色以外でも示す (太字 / `sr-only` の「(選択中)」)、(4) `:490` の `/` を `aria-hidden` に。
- **根拠**: WCAG 2.1 SC 4.1.2 (A) / SC 1.4.1 (A) / SC 1.3.1 (A) / FR-040
- **scope 根拠**: touched (feature)

### [High] グループ見出しが heading でなく、セクションにアクセシブル名も list semantics も無い (H-004) (scope: feature)

- **観察**: `SessionListScreen.tsx:191` は各グループを `<section>` で描くが、`SectionHeading` (`:88-142`) が出すのは `<span className="text-sm font-medium">` であり **heading 要素でも `aria-label` でもない**。`<section>` はアクセシブル名を持たないと `region` landmark として露出しない → **4 種のグループはすべて「名前の無い generic」**になる。画面内の heading は `:410` の `<h1>` と `:272` の `<h2>` の 2 つだけで、**一覧本体側には heading が 1 つも無い**。
  `thread-list.aui.tsx:37-47` / `:61-85` と `ThreadListRoot.js:16` の実体はいずれも素の `Primitive.div` で `role="list"` / `listitem` を持たない。`ThreadListItemRoot.js:44-53` も `div`。
- **同種事象探索**: `grep -rn '<h1|<h2|<h3' src/renderer/src/features` で heading は 3 件。`role="list"` は renderer 全体で **0 件**。
- **リスク/影響**: WCAG 2.1 **1.3.1 (A)** / **2.4.6 (AA)** の不適合。R-2 の一覧の構造そのもの (4 種のグループを潰さない、`SessionListScreen.tsx:42` が規則として掲げている) が**カードの枠線と字面の太さでしか表現されていない**。heading ジャンプでグループを渡り歩けず、行にフォーカスしたとき自分がどのグループに居るかも分からない。
- **推奨アクション**: (1) `SectionHeading` の第 1 要素を `<h3>` に (見た目は不変)、(2) `:191` の `<section>` に `aria-labelledby`、(3) `thread-list.aui.tsx:63-84` の items に `role="list"`、`ThreadListItem` の Root に `role="listitem"`、(4) `WorkspaceFoldersScreen.tsx:337` を `<h1>` に上げる (M-005 と同一修正)。
- **根拠**: WCAG 2.1 SC 1.3.1 (A) / SC 2.4.6 (AA) / FR-022 / FR-025 / FR-028 / `plan.md:254-264`
- **scope 根拠**: touched (feature)

### [High] セッション行の付帯情報が行と別ブロックに置かれ、順序の一致だけで対応している (H-005) (scope: feature)

- **観察**: `SessionListScreen.tsx:216-246` で、1 区画は **(a) `ThreadListItemsByKey` が描く表題ボタンの列** (`:218`) と、**(b) `section.group.sessions` を回して描く付帯情報の `<ul>`** (`:219-243`) の **2 つの兄弟ブロック**に分かれている。(b) には由来候補 (FR-052)、出自、開始時刻、ブランチ、タグ、サイズ、`worktree`、`SDK / daemon 由来` (FR-029)、切り詰め・制御文字除去の注記 (FR-049) が入る。表題と付帯情報を結ぶのは**配列順序だけ**で、`aria-describedby` も `id` 参照も無い。
  `ThreadListItemsByKey` (`thread-list.aui.tsx:72-83`) は未知の鍵を **null に落とす**ため、runtime 反映が 1 tick 遅れる窓では **(a) の件数が (b) より少なくなる**。この窓では順序による対応も崩れる。
- **同種事象探索**: `grep -rn 'aria-describedby' src/renderer/src` で **3 件** (すべて `WorkspaceFoldersScreen`。**セッション行には 0 件**)。
- **リスク/影響**: WCAG 2.1 **1.3.1 (A)** の不適合。行 (フォーカス可能な `<button>`) に到達したとき読まれるのは表題だけで、**その行を他と識別する情報のすべてが別の場所にある**。
- **推奨アクション**: 表題と付帯情報を**同じ行の中に入れる**のが本筋 (`ThreadListItem` に children を通す)。最小改変なら (1) (b) の各 `<li>` に `id={meta-${rowKey}}`、(a) の Trigger に `aria-describedby`、(2) 裸の値に何の情報かを添える (M-004)、(3) (b) も同じ `rowKeys` から引いて行数が原理的に一致する形にする。
- **根拠**: WCAG 2.1 SC 1.3.1 (A) / SC 4.1.2 (A) / FR-029 / FR-049 / FR-052
- **scope 根拠**: touched (feature)

### [High] 「作業フォルダとして登録」で画面が丸ごと入れ替わり、フォーカスが body に落ちる (H-006) (scope: feature)

- **観察**: `SessionListScreen.tsx:198-202` の「作業フォルダとして登録」は `seedFolderDraft(registerSeed)` を呼ぶだけに見えるが、`stores/ui.ts:62` の実装は **`set({ folderDraftSeed, screen: 'folders' })`** であり **画面遷移を伴う**。`App.tsx:33` / `:68-72` が `Screen` を差し替えるため、**押したボタン自身を含む `SessionListScreen` 全体がアンマウントされ、フォーカスは `document.body` に落ちる**。遷移先の `SeededDraft` にフォーカスは移らず、live region も無いので**画面が変わったこと自体が通知されない**。同種の経路が `:552` にもある。
  この不具合様式は同じリポジトリで既に 1 度観測・修正されている: `WorkspaceFoldersScreen.tsx:427-432` のコメント「以前は `loading` 中にこのブロック全体を unmount していたため、**押したボタン自身が DOM から消え、フォーカスが body に落ちていた**」。
- **同種事象探索**: `grep -rn 'setScreen\(|seedFolderDraft\(' src/renderer/src` で 4 件。フォーカスを失うのは **`SessionListScreen.tsx:199` と `:552` の 2 件**。
- **リスク/影響**: WCAG 2.1 **2.4.3 Focus Order (A)** / **3.2.2 On Input** の趣旨に抵触。FR-026 の登録導線は US-2 の中核であり、その導線を使った瞬間にキーボード利用者は入力欄の位置を失う。
- **推奨アクション**: (1) 遷移先の `SeededDraft` で `seed !== null` になったとき表示名入力へ `focus()` (`FolderCard` の `scrollIntoView` と同じ形)、または `tabIndex={-1}` の見出しにフォーカス、(2) ボタンに `aria-describedby` で「登録画面へ移動します」を添える、(3) `:552` も同様。
- **根拠**: WCAG 2.1 SC 2.4.3 (A) / SC 3.2.2 (A) / FR-026 / `WorkspaceFoldersScreen.tsx:427-432` の先例
- **scope 根拠**: touched (feature)

### [High] 取得中に操作ボタンを `disabled` にしてフォーカスを奪う — 同一 PR 内の方針と矛盾 (H-007) (scope: feature)

- **観察**: `SessionListScreen.tsx:426-434` の「全件を取り直す」は `disabled={sessions.loading}` を持つ。キーボードで Enter した瞬間に `loading` が真になり、**フォーカスされている要素が `disabled` になってフォーカスを失う**。取得完了後も戻らない。同形は `:274` / `:565` / `:580` にもある。
  同じ R-2 の diff 内で `WorkspaceFoldersScreen.tsx:377-386` は**逆の判断を明文化している**: 「**`disabled` にしない。** `disabled` は要素をタブ順から外すので、キーボード利用者はボタンに一度も到達せず、押せないことにも理由にも気付けない」 → `aria-disabled` + ガード節。**主対象画面はこの方針を踏襲していない。**
- **同種事象探索**: 押下によって自分自身が disabled になるボタンは `SessionListScreen.tsx:429` / `:274` / `:565` / `:581` の **4 件**、`WorkspaceFoldersScreen.tsx:408` の 1 件で計 5 件。`aria-disabled` を採る例は `WorkspaceFoldersScreen.tsx:384` の 1 件。
- **リスク/影響**: WCAG 2.1 **2.4.3 (A)** / **2.4.7 (AA)** に抵触。H-001 と重なると、**再取得を押した直後に「フォーカスも feedback も無い」状態が 2 秒以上続く**。FR-033 により再取得は利用者が最も頻繁に使う操作である。
- **推奨アクション**: 4 件を `aria-disabled` + `onClick` 先頭のガードに置き換える (`WorkspaceFoldersScreen.tsx:377-386` と同形)。`WorkspaceFoldersScreen.tsx:408` も揃える。
- **根拠**: WCAG 2.1 SC 2.4.3 (A) / SC 2.4.7 (AA) / 同一プロジェクトの明文化された方針
- **scope 根拠**: touched (feature)

### [High] フォーカス指標のコントラストが 1.5〜2.6:1 — セッション行では実質不可視 (H-008) (scope: system)

- **観察**: `components/ui/button.tsx:7` は `focus-visible:ring-[3px] focus-visible:ring-ring/50` + `focus-visible:border-ring`。light の `--ring` は `oklch(0.705 0.015 286.067)` ≒ `#a1a1aa` で、**全不透明でも白背景に対し約 2.6:1**、`/50` 合成では **約 1.5:1**。`ghost` variant は border を持たないため絞り込みボタンのフォーカス指標は **1.5:1 の ring のみ**。
  行はさらに弱い: `thread-list.aui.tsx:135` は `ring-ring/50` + **`ring-1`** (1px)、`:131` の `focus-visible:bg-muted` は **約 1.04:1** の変化。加えて `:131` は `data-active:bg-muted` (選択中) と `has-focus-visible:bg-muted` (フォーカス) に**同じ背景色**を使っている。
- **同種事象探索**: `grep -rn 'ring-ring/50|focus-visible:ring-1' src/renderer/src` で **8 件**。
- **リスク/影響**: WCAG 2.1 **1.4.11 Non-text Contrast (AA)** はフォーカス指標に 3:1 を要求する。R-2 はキーボードで数百行を辿る使い方が主になる (`ThreadListItemRoot.js:20-41` が Arrow roving を実装) ため、1px / 1.5:1 では「どの行に居るか分からない」。H-003 と重なると**フォーカス・選択・絞り込みの 3 つが同時に判別不能**。
- **推奨アクション**: 既存トークンの段を選び直す形に留める (Principle XIII)。(1) `button.tsx:7` の `ring-ring/50` → `ring-ring`、3:1 には `--ring` 自体を `--muted-foreground` 相当へ寄せる (**トークン 1 行で全画面が適合**)、(2) `thread-list.aui.tsx:135` を `ring-2` + `ring-ring` に、`:131` の選択表現を背景色以外 (左端の `border-s-2` 等) にして**フォーカスと選択を分離**、(3) `surfaces.tsx:20` の alpha も外す。
- **根拠**: WCAG 2.1 SC 1.4.11 (AA) / SC 2.4.7 (AA) / Principle XIII
- **scope 根拠**: 実体は `button.tsx` と `main.css` の `--ring` (touched 外) のため `system`。ただし `thread-list.aui.tsx:135` は touched であり、**行のフォーカス指標だけは本 feature 内で直せる**

### [Medium] 選択中の行の `aria-current` がフォーカス対象でない親 div に付く (M-001) (scope: feature)

- **観察**: `ThreadListItemRoot.js:44-48` は選択中の行の **Root (`Primitive.div`)** に `data-active="true"` と `aria-current="true"` を付ける。一方フォーカス可能なのは子の `Trigger` (`thread-list.aui.tsx:133-156`)。`aria-current` は祖先に付いていても子ボタンにフォーカスしたときには読み上げられないのが一般的な挙動。
- **推奨アクション**: `thread-list.aui.tsx:125-159` で active 判定を取り、**Trigger 側に `aria-current`** を渡す (H-004 の `role="listitem"` 化と同時に)。
- **根拠**: WCAG 2.1 SC 4.1.2 (A)
- **scope 根拠**: touched (feature)

### [Medium] 表題の `truncate` で全文に到達できない (M-002) (scope: feature)

- **観察**: `thread-list.aui.tsx:144-147` の表題は `truncate`、`SessionListScreen.tsx:127` の作業ディレクトリも `truncate`。`title` 属性もツールチップも無い。行は `h-8` 固定で折り返せない。
- **リスク/影響**: SC-009 が「切れなく表示される」を要求しているが長い要約は視覚的に必ず切れる。DOM にテキスト全体はあるためスクリーンリーダーは読めるが、**ロービジョン・拡大利用者と晴眼利用者には全文への到達手段が無い**。
- **推奨アクション**: 行に `title={表題文字列}` を渡す (`titleOf` (`SessionListScreen.tsx:342-345`) が既に文字列を持つ)。`TooltipProvider` 導入済みなのでそちらでも良い。
- **根拠**: WCAG 2.1 SC 1.4.4 の趣旨 / SC 1.4.10 / SC-009
- **scope 根拠**: touched (feature)

### [Medium] `prefers-reduced-motion` 未対応のアニメーションが 2 箇所残る (M-003) (scope: feature)

- **観察**: `components/ui/skeleton.tsx:7` は `animate-pulse` のみで `motion-reduce:animate-none` を持たない。`thread-list.aui.tsx:137-142` の `Loader2Icon` も `animate-spin` のみ。
- **同種事象探索**: `grep -rn 'animate-pulse|animate-spin' src/renderer/src` で **12 件**。`motion-reduce:animate-none` を持つのは `error-state.tsx:55` のみ。R-2 の経路にあるのは 2 件。`surfaces.tsx` の各トークンは `motion-reduce:transition-none` を一貫して持っており、**プロジェクト方針としては reduced motion 対応が既定**。
- **推奨アクション**: 2 箇所に `motion-reduce:animate-none` を足す。`skeleton.tsx` は registry 写しなので逸脱理由をコメントに残す。
- **根拠**: WCAG 2.1 SC 2.3.3 (AAA、参考) / `surfaces.tsx` に確立済みの方針
- **scope 根拠**: `thread-list.aui.tsx` は touched。`skeleton.tsx` は touched 外だが 1 語追加で済む

### [Medium] 付帯情報が「何の情報か」を伴わない裸の値で並ぶ (M-004) (scope: feature)

- **観察**: `SessionListScreen.tsx:232-241` は `SourceLabel`(由来候補=ユーザ)、`CWD_ORIGIN_LABELS[...]`、`worktree`、`SDK / daemon 由来` を**ラベル無しの値だけ**で並べる (`開始` / `ブランチ` / `タグ` には接頭語がある)。スクリーンリーダーは「ubuntu-user Windows worktree」のような**語の列**として読む。さらに `SourceLabel` (`:80-84`) は `label.length === 0` で **`null` を返す**ため、由来候補が空文字のとき何も出ない。
- **リスク/影響**: WCAG 2.1 1.3.1。FR-052 が要求する識別可能性が支援技術上で失われる。CWD の「Windows」と所在の「Windows」が同一文字列で別概念を指す点も接頭語が無いため区別できない (`plan.md:56-57` が Principle XIV の対象に挙げた問題が UI 側に出ている)。
- **推奨アクション**: `sr-only` の接頭語を持たせる (「由来 …」「作業ディレクトリの所在: …」)。空文字で `null` を返す挙動は「由来不明」を出すか DTO 制約にするかへ。
- **根拠**: WCAG 2.1 SC 1.3.1 (A) / FR-052 / FR-029
- **scope 根拠**: touched (feature)

### [Medium] 画面ごとの heading 起点が揃っておらず、`WorkspaceFoldersScreen` に `h1` が無い (M-005) (scope: feature)

- **観察**: `SessionListScreen.tsx:410` は `<h1>`、`WorkspaceFoldersScreen.tsx:337` は `<h2>` で**同画面に `h1` が存在しない**。`App.tsx:40` のアプリ名は `<span>`。`App.tsx:68` の `<main>` と `:41` の `<nav>` は適切 (良い点)。
- **リスク/影響**: WCAG 2.1 1.3.1 / 2.4.6。画面遷移が `<main>` の中身だけを差し替える構造なので heading が画面の同一性を示す唯一の手がかりになる。
- **推奨アクション**: `WorkspaceFoldersScreen.tsx:337` を `<h1>` に (他画面も確認)。H-004 と合わせて h1 → h2 → h3 の階層を作る。
- **根拠**: WCAG 2.1 SC 1.3.1 (A) / SC 2.4.6 (AA)
- **scope 根拠**: touched (feature)

### [Medium] renderer テストに a11y の断言が 1 つも無く、上記が回帰検知されない (M-006) (scope: feature)

- **観察**: `SessionListScreen.test.tsx` は `getByRole('button', { name: … })` を 8 箇所で使い**アクセシブル名は間接的に守られている** (良い点) が、`aria-expanded` / `aria-pressed` / `aria-live` / `role="status"` / `aria-current` を検査する断言は **0 件**。`tasks.md` に a11y 名指しタスクも **0 件**。
- **リスク/影響**: H-001 / H-002 / H-003 を直しても、次の feature (R-3 / X-1) で無言のうちに壊れる。`WorkspaceFoldersScreen.tsx:549-553` の live region もコメントで守られているだけでテストが無い。
- **推奨アクション**: 最低限 (a) 開閉ボタンの `aria-expanded` が押下で反転、(b) 絞り込みの選択が `aria-pressed` で示される、(c) 鮮度テキストが `role="status"` の中にある、(d) 選択行が `aria-current` を持つ の 4 件を追加する。
- **根拠**: reviewer-base cat H / AD-027 「ルールは違反サンプルで発火したことで確認する」の思想
- **scope 根拠**: touched (feature)

### [Low] 装飾用の区切り文字が読み上げられる (L-001) (scope: feature)

- **観察**: `SessionListScreen.tsx:490` の `<span>/</span>` は視覚的な区切りだが `aria-hidden` を持たない。`WorkspaceFoldersScreen.tsx:497` の絵文字は `aria-hidden` 済み (良い例)。
- **推奨アクション**: `aria-hidden` を付ける。H-003 の `role="group"` 化で区切り自体を不要にするのが望ましい。
- **根拠**: WCAG 2.1 SC 1.3.1 (A)
- **scope 根拠**: touched (feature)

### [Low] 単独の数値・記号がラベル無しで読まれる (L-002) (scope: feature)

- **観察**: `SessionListScreen.tsx:197` の `{count} 件`、`:300` の `{outcome.count} 件`、`:237` の `formatBytes(...)` は文脈語を持たない。`:423` の `— 全 {total} 件` も em dash が読まれる。
- **推奨アクション**: `aria-label` か `sr-only` で補う (H-002 の判別にも効く)。
- **根拠**: WCAG 2.1 SC 1.3.1 (A)
- **scope 根拠**: touched (feature)

### [Low] 本文へのスキップ手段が無い (L-003) (scope: system)

- **観察**: `App.tsx:39-66` のヘッダには nav 5 項目 + テーマ切替があり、`<main>` (`:68`) へのスキップリンクが無い。画面遷移のたびにフォーカスは body に戻る (H-006) ため**毎回 6 要素を Tab で通過**する。
- **推奨アクション**: `<a href="#main" className="sr-only focus:not-sr-only">本文へスキップ</a>` + `<main id="main" tabIndex={-1}>`。
- **根拠**: WCAG 2.1 SC 2.4.1 (A。SPA では適用解釈に幅があるため Low)
- **scope 根拠**: `App.tsx` は touched だが全画面共通のシェル方針に関わるため `system` 寄り

## 適合を確認した点 (参考、指摘ではない)

- `src/renderer/index.html:7` の `lang="ja"` (WCAG 3.1.1) — コメント付きで意図が明示されている
- 「取得中 / 列挙済み / 履歴なし / 列挙できませんでした / 停止中のため未列挙 / 保留 / 所在不明 / 未検出のディストロ / 越境」は**すべて日本語テキスト**で区別され、色や記号のみに依存していない → **WCAG 1.4.1 は満たす**
- `Outcomes` の失敗行に色を一切使っていないため、色覚特性による判別不能が発生しない
- キーボード到達性: 行 Trigger は native `<button>`、開閉・絞り込み・登録導線・再取得も `Button` = native `<button>`。正の `tabindex` は renderer 全体で 0 件。`ThreadListItemRoot.js:20-41` が ArrowUp/Down の roving も提供 → **Critical 級の到達不可は無し**
- `ThreadListItem` の実行中表示は `aria-hidden` のアイコン + `sr-only` テキスト「実行中」の組み合わせ — 正しい形
- `WorkspaceFoldersScreen.tsx:255-269` / `:511-526` の入力欄は可視 `<label for>` + `aria-describedby` を備え placeholder 依存を脱している (WCAG 3.3.2 / 2.4.6)
- `WorkspaceFoldersScreen.tsx:377-386` の `aria-disabled` 採用、`:427-445` の unmount 回避と `aria-busy`、`:549-560` の常時マウント live region — いずれも本 review が主対象画面に欠けていると指摘した対策の**同一 PR 内の正しい実装例**
- `WorkspaceFoldersScreen.tsx:66-92` の `ReachabilityBadge` は light 既定で 4.5:1 を満たす段を選び直した経緯をコメントで保持
- `components/ui/input.tsx` は `aria-invalid` 対応を持つが、**R-2 の 2 画面はこの `Input` を使わず素の `<input>` を書いている**ため `input.tsx` の diff は a11y 上の影響を持たない (指摘なし)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `text-red-600/60|text-red-400/60|ErrorState` | 13 (実体 1 / 呼出 4) | `elements/error-state.tsx:78` (実体) / `:69` `:77` `:85` `:56` / 呼出: `SessionListScreen.tsx:438`, `WorkspaceFoldersScreen.tsx:309`, `RuntimeListScreen.tsx:165`, `ResolutionScreen.tsx:274` |
| H-001 | `aria-live|role="status"|role="alert"|aria-busy` | 15 (session-list 配下 **0**) | `WorkspaceFoldersScreen.tsx:434,442,443,554,568,569` / `RuntimeListScreen.tsx:205` / `ResolutionScreen.tsx:76` / `error-state.tsx:47,67` / `thread-list.aui.tsx:94` |
| H-002 | `aria-expanded|aria-controls` | **0** | 該当箇所 `SessionListScreen.tsx:203-207` に属性なし |
| H-003 | `aria-pressed|role="radio|role="group` | **0** | 対象 toggle 5 件: `SessionListScreen.tsx:468,477-480,492,501` |
| H-004 | `<h1|<h2|<h3` (features) / `role="list"` | 3 / **0** | `SessionListScreen.tsx:410,272` / `WorkspaceFoldersScreen.tsx:337`。group 見出しは `:104,111,124,135` がいずれも `<span>` |
| H-005 | `aria-describedby` | 3 (session-list 配下 **0**) | `WorkspaceFoldersScreen.tsx:263,385,518`。分離構造は `SessionListScreen.tsx:218` vs `:219-243` |
| H-006 | `setScreen\(|seedFolderDraft\(` | 4 (フォーカス喪失 2) | `stores/ui.ts:61-63` / `SessionListScreen.tsx:199`, `:552` / `App.tsx:44` (問題なし) |
| H-007 | 自身が押下で `disabled` になるボタン | 5 | `SessionListScreen.tsx:429,274,565,581` / `WorkspaceFoldersScreen.tsx:408`。反例: `WorkspaceFoldersScreen.tsx:384` |
| H-008 | `ring-ring/50|focus-visible:ring-1` | 8 | `button.tsx:7` / `input.tsx:11` / `textarea.tsx:9` / `thread-list.aui.tsx:135` / `surfaces.tsx:20` / `empty-state.tsx:63` / `WorkspaceFoldersScreen.tsx:261,516` |
| M-003 | `animate-pulse|animate-spin` | 12 (R-2 経路 2) | `skeleton.tsx:7` / `thread-list.aui.tsx:141`。`motion-reduce` 付きは `error-state.tsx:55` のみ |

## Verdict

- Critical: 1
- High: 8
- Medium: 6
- Low: 3
