---
reviewer: architecture-reviewer
gate: pr-gate
round: 2
scope: default+adr-drift
---

# architecture-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07 (pr-gate Round 2。base `7bdb271` / HEAD `a4c37a8`。R1→R2 の差分 `9d98c39..a4c37a8`)
**Reviewer**: architecture-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2
**Mode**: default と ADR-drift を 1 つの出力にまとめた。ARCH-3 の照合は「ADR-drift 照合」の節に書いた

## 初回読了 viewpoint

- FR/SC (Round 2 の差分が影響するもの):
  - FR-018 / SC-008: 次の 3 つ
    - verify.yml の新しいステップ (:166-172)
    - `sidebar-screenshot.spec.ts` で撮る前に区画をスクロールする処理 (:82-97)
    - 基準画像 1 枚 (新規)
  - FR-001 / FR-008 (文言の表): `searchPlaceholder` の変更 (`session-list/labels.ts:206`、data-model §5 の :322)
  - FR-014 / SC-007: 差分は `src/renderer/src/**/*.tsx` に触れていない。XV の基準線 331 は Round 1 で数えた値のまま
  - SC-001〜SC-006: `vitest.config.ts:21-22,46,75` の testTimeout が変えるのは時間の上限だけで、合否の条件は変わらない (判断は code-gate の iter 3 で済んでいる。再指摘しない)
  - ほかの FR / SC は Round 1 から差分なし
- touched files に該当する charter / Confirmation:
  - AD-038 の D1〜D5 と Confirmation (`0038:37-88`, `:109-119`)
  - ui charter の KPI「日本語の健全性」(:162-163)
  - Constitution VIII の Verification、改定手順 (constitution.md:343-355)、v1.4.0 の Sync Impact Report (:18-19)
  - AD-028 §5「持ち主のいない延期を残さない」(`0028:191-194`)
  - 006 の基準画像の承認の先例 (006 quickstart.md:25-26 / quickstart-results.md:23-27)
  - design-gate M-27 (arch M-201。design-gate.md:85、unresolved)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の領域
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の領域。Round 2 の差分は入力の経路に触れていない
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:3 Low:4
- D. Constitution / ADR drift: Critical:0 High:0 Medium:3 Low:5
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の領域。SC-008 を暫定として扱っていない点は、M-007 で AD-038 D5 の記録の問題として出す
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の領域。verify.yml:114 の job の名前に sidebar が入っていない点も F の範囲なので出さない
- G. optional reviewer 範囲: 該当なし: placeholder の長さと文言は ux-reviewer、永続化は database-reviewer の領域
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

Round 2 の差分は、Round 1 の C-001 (architecture では H-001) を直したものである。中身は次の 4 つ。
- verify.yml の e2e job の最後に、`e2e/sidebar-screenshot.spec.ts` を流すステップを足した
- 撮る前に区画のスクロールの領域をグループの並びの上端まで送り、最初のグループの見出しと最初の行が見えることを確かめるようにした
- placeholder が 280px で切れていたので短くした
- CI の artifact (run 37546036334) の actual を基準画像としてコミットした

ほかに vitest の共通の testTimeout 20s がある (code-gate の iter 3 で人間が決めた)。`docs/`・charter・glossary・ADR・Constitution・roadmap は Round 2 で変わっていない。

CI の事実は invoker が記録したものである (reviewer は gh を実行できない)。
- a4c37a8 の run 37565959731 で、e2e の 6 ステップがすべて success だった
- 基準画像をコミットした後の最初の run は 37553390941 (success) である
- node 26 の失敗は allow-failure なので、ここでは扱わない

## Round 1 の指摘の扱い

| R1 の ID (pr-gate の番号) | Round 2 | 根拠 |
|---|---|---|
| H-001 (C-001) | **解消** (主要部分)。残りは M-007 に分けた | e2e/*.spec.ts の 5 本がすべて verify.yml にある (:139,145,159,164,172)。基準画像は Glob `e2e/**/*.png` で 2 件 (sidebar の 1 枚が増えた)。a4c37a8 の CI で success (invoker の記録) |
| M-001 (Medium #11) | 未解消 | `session-search.ts:3-4` と `SessionListScreen.tsx:25-26` の双方向の import が残っている。`_overview.md` と charter 2 つは変わっていない |
| M-002 (#12) | 未解消 | ui charter:174 / :185-189、glossary:917-918 は変わっていない |
| M-003 (#10) | 未解消 | reviewers.yml で `command-palette\|conversation-search\|features/provider` を検索して 0 件 |
| M-004 (#13) | 未解消 | `0045:49-54` は Confirmation の箇条のまま |
| M-005 (#8) | 未解消 | perf と session charter は変わっていない |
| M-006 (#14) | 未解消 | e2e で `Control\+[FfKk]` を検索して 1 件 (ime.spec.ts:223 の Ctrl+K)。Ctrl+F は 0 件 |
| L-001〜L-009 (Low #3〜#11) | 未解消 | 対象のファイルは Round 2 の差分に無い。L-008 は quickstart-results で `1,000` を検索して 0 件 |

## Constitution 改定 (v1.3.0 → v1.4.0。Principle XV) — 改定手順 2 への入力 (Round 2 の更新)

- Round 1 の照合表 (手順 1・3・4・5、基準線 331、Exceptions) は今もそのまま当てはまる。Round 2 の差分は `constitution.md` にも `0045` にも `src/renderer/src/**/*.tsx` にも触れていない
- 改定手順 2 (constitution.md:352「architecture-reviewer の owner を交えた人間レビュー」) は、次の 2 か所で「未了」と書かれている
  - constitution.md:18-19
  - quickstart-results.md:49-50
- 本出力は手順 2 への入力であって、承認ではない
- 注意: quickstart-results V-4 (:92-93) は、夜間の実行の前に利用者が出した一括の指示 (「承認 OK としてマージして次に進めたい」) を「承認済み」として扱っている。この扱いは手順 2 の人間レビューには当たらない (M-007 の観察を参照)

## ADR-drift 照合 (ARCH-3) — Round 2 の差分

| ADR | Round 2 の接点 | 結果 |
|---|---|---|
| AD-038 D1 | 新しいステップも `pnpm exec playwright test … -c playwright.config.ts` (verify.yml:172)。`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` は job の env (:117) | drift なし |
| AD-038 D2 | 変更は `e2e/` の中だけ。`.dependency-cruiser.js` / `eslint.config.mjs` は R1→R2 で変わっていない (invoker の記録) | drift なし |
| AD-038 D3 / D5 (中身) | 基準画像を Read で見た。写っているのは区画の見出し・検索欄・グループの見出し「E2E Project 同じ所在 3 件」と、合成の題の 3 行 (「ログイン画面の API 修正 v2」ほか)。どれも `e2e-capability.ts:109,140,486` の固定の索引の値である。会話の本文と config 由来のパスは写っていない | drift なし |
| AD-038 D4 | FontFace + CSSOM で当てている (`sidebar-screenshot.spec.ts:70-80`)。新しいステップにホストへの永続的な変更は無い | drift なし |
| AD-038 D5 (承認) | 基準画像をコミットした。利用者の目視は未了で、記録が自己矛盾している | **M-007** |
| AD-038 Confirmation | 日本語スクリーンショット比較のステップがあり、a4c37a8 で緑 (invoker の記録) | R1 H-001 は解消 |
| AD-045 Decision 2 | 文言の変更は文言の表 (`labels.ts`) の中だけ。差分の `.tsx` は 0 件で、コンポーネントへの直書きは増えていない | drift なし |
| AD-024 #18 / AD-025 | 「検査が 0 件なのに緑」の形 (R1 H-001) は解消した | — |
| AD-028 §5 | pr-gate R1 の system-scope の項目が roadmap に持ち主つきで載っていない | **L-010** |
| AD-031 | Round 2 で `docs/decisions/` の差分は 0 件。ADR の決定を in-place で書き換えた差分も 0 件 | — |

## Findings

### [Medium] サイドバーの基準画像の承認の記録が「未実施」「まだコミットしていない」「承認済み」を同時に書いている。利用者の目視が未了であることが、quickstart の手順にも SC の扱いにも出ていない (M-007) (scope: feature) [new。R1 H-001 の手順 3 と design-gate M-27 (arch M-201) の残り]

- **観察**:
  - 記録が自己矛盾している (quickstart-results.md):
    - :74 の見出しは「V-4 サイドバーの基準画像の承認 … — 未実施」
    - :76-77 は「基準画像 … はまだコミットしていない。… コミットするまで基準画像が無くて落ちる」
    - :23-24 は「基準画像をコミットするまでこのステップは落ちる。… 利用者の承認の後にコミットする (下の V-4。未了)」
    - :90-93 は「`sidebar-past-sessions-win32.png` としてコミットした。**承認**: … 承認済みとして扱った (画像そのものの目視は朝に利用者が確かめる項目に残す)」
    - 事実として、基準画像は HEAD にある (diff の new file)
  - V-4 が自分で定めた「記録すること」(:81-82) が満たされていない。「コミットの後の CI でこのステップが通ったこと」が書かれていない。invoker の記録では run 37553390941 と 37565959731 が success
  - 「朝に利用者が確かめる項目」の置き場が無い:
    - `朝` で検索すると :93 の 1 件だけ
    - 012 quickstart.md に基準画像の行は 0 件 (V-3 :29-36 にも無い)
    - design-gate M-27 と R1 H-001 の手順 3 が求めた「quickstart に承認の行を足す」は未了
  - 書かれた手順と、実際の順が違う:
    - 書かれた手順は「承認してから commit」。verify.yml:168-169、quickstart-results.md:24、pr-gate.md:37 の 3 か所
    - 実際は「main (agent) が確かめて commit → 利用者の目視は後」
  - 先例 006 は 3 段で記録した
    - 手順を quickstart.md:25-26 に置いた
    - 承認者・承認日・根拠を quickstart-results.md:23-27 に書いた
    - 承認するまで SC-002 を「暫定」とした
  - 012 は SC-008 の画像の部分を暫定と書いていない
- **同種事象探索**:
  - `朝` (docs と 012 の md): 1 件 (quickstart-results.md:93)
  - `未了|未実施|まだコミット|コミットするまで|承認済み` (012 quickstart-results.md): 7 行
    - V-4 に関わる行: :24, :74, :76-77, :93
    - ほかの行: :29 (V-1)、:50 (改定手順 2)、:69 (V-3)
  - `承認してから|承認済み基準画像|承認の後`: verify.yml:141,168 / quickstart-results.md:24 / pr-gate.md:37 / design-gate.md:85
  - `基準画像` (012 quickstart.md): 0 件
  - Glob `e2e/**/*.png`: 2 件
- **リスク/影響**:
  - AD-038 D5 は、初回の基準画像の視覚的妥当性の判断を「人間 deferred とし quickstart に記録する」と定める。先送りそのものは D5 の範囲内である。しかし今の記録では、PR のレビューで利用者が「済んだのか、未了なのか」を決められない
  - 「承認済み」と書いたまま PR がマージされると、D5 の人間の判断が行われないまま、記録の上では済んだことになる。基準画像を次に取り直す feature (O-4〜O-6) は、この画像を承認済みの基準として扱う
- **推奨アクション**:
  1. quickstart-results を事実に合わせる
     - V-4 の見出しを「基準画像はコミット済み (run 37546036334 の actual)。利用者の目視は未了 (AD-038 D5 の人間 deferred)」にする
     - :76-77 と :23-24 を直す
     - コミットの後の CI (37553390941 / 37565959731) でこのステップが通ったことを書く
  2. :92-93 の「承認済みとして扱った」を「利用者の目視の承認まで暫定」に改める
     - 006 と同じく、承認者・承認日・承認の根拠の欄を空けて残す
     - SC-008 の「FR-018 の基準画像の比較が CI で通る」も、目視で承認するまで暫定と書く
  3. quickstart.md に V-4 (基準画像の目視の手順と判断の観点) を足す。形は 006 quickstart.md:25-26 と同じにする
  4. verify.yml:168-169 の手順の文を、実際の順 (commit の後に利用者が目視で承認する。承認までは暫定) に合わせる。または、マージの前に利用者の目視を済ませる
- **根拠**: AD-038 D5、Constitution VIII Verification、006 quickstart(-results) の先例、design-gate M-27、ui charter KPI「日本語の健全性」
- **scope 根拠**: quickstart.md / quickstart-results.md / verify.yml は、どれも本 PR の touched files である

### [Medium] session の操作 UI と `features/search/` の依存が双方向なのに、`_overview.md` と charter 2 つの依存の記述が変わっていない (M-001) (scope: feature) [R1 M-001 / pr-gate Medium #11。未解消]

- **観察**:
  - `features/search/session-search.ts:3-4` が `@/features/session-list/group-label` と `/rows` を import する
  - 逆向きに、`features/session-list/SessionListScreen.tsx:25-26` が `@/features/search/session-search` と `/text-search` を import する
  - 依存の記述は変わっていない
    - `_overview.md:126-138` の依存関係
    - ui charter:173「依存される domain: なし (最上層)」
    - session charter:183「依存する domain: runtime, provider」
  - ui charter:54-56 は「検索欄・絞り込みは本 domain が持つ」と書くが、検索欄 `PastSearchField` は session の module にある (`SessionListScreen.tsx:814`)
- **同種事象探索**:
  - `@/features/session-list/` (`features/search`、テストを除く): 2 件 (:3, :4)
  - `@/features/search/` (`features/session-list`): 2 件 (:25, :26)
- **リスク/影響**:
  - 共有の土台 (`features/search/`) が、その利用者の 1 つに依存している。depcruise の `no-circular` は拾わない
  - roadmap:187-188 の (6) (feature 間の向きを機械で強制する) を入れるとき、この向きのために規則を緩めることになる
- **推奨アクション**: 次のどちらかを採る
  - (a) `features/search/` には `text-search.ts` だけを残す。行の対象は `session-list/` に、稼働中の対象は `shell/palette-commands.ts` に移す
  - (b) 3 つの依存の記述と ui charter:54-56 を、実際の置き場に合わせる
- **根拠**: `_overview.md` の依存関係、ui / session charter の Cross-domain dependencies、AD-023 Consequences (`0023:380-381`)
- **scope 根拠**: 3 ファイルとも touched files である

### [Medium] ui と session の境界の集合 (逆向きの呼び出しと、読む面の状態) が charter 2 つと glossary の間で食い違い、どれもコードと合っていない (M-002) (scope: feature) [R1 M-002 / pr-gate Medium #12。未解消]

- **観察**:
  - ui charter:185「シェルが session のストアの操作を呼ぶのは次の 2 つだけ」に、`RunningSessionsView.revealMessage` が無い。実際には `CenterPane.tsx:96` が渡し、`RunningSessionsProvider.tsx:156-170` の窓の状態を書き換える
  - session charter:186 が挙げる逆向きの呼び出しは `dismissLaunchNotice` の 1 つだけで、ui charter の 2 つと食い違う
  - `watchedIdOf` は `paletteOpen` も読む (`stores/ui.ts:132-144`)。しかし ui charter:174 と glossary:917-918 は「focus と設定・起動ダイアログの開閉」のままである
  - glossary:918 は、定義の正本を 013 data-model §1 と指したままである
- **同種事象探索**:
  - `revealMessage` (docs): 2 件 (session charter:238 / roadmap:259)。ui charter には 0 件
  - `watchedId|見ているセッション` の定義の行: 5 件。palette を含むのは glossary:201 だけ
- **リスク/影響**:
  - 運用上の正本 (ui charter「面の状態」。AD-046 の訂正節 `0046:69-72` がそう定めた) が、実装より 1 つ少ない
  - O-4〜O-6 が「2 つだけ」を前提に読む
- **推奨アクション**:
  - ui charter:185-189 に (3) `revealMessage` を足す
  - ui charter:174 の読む集合に `paletteOpen` を足す
  - session charter:184-186 を ui charter と同じ集合に揃える
  - glossary:917-918 の条件に palette を足し、正本の参照先を ui charter「面の状態」に直す
- **根拠**: Principle XIV、AD-046 の訂正節、ARCH-5 / ARCH-7
- **scope 根拠**: touched files である

### [Medium] Constitution XV の Verification が名指す Manual の検証者 (ux-reviewer) の定義と発火条件が、新しい規則に合っていない (M-003) (scope: feature) [R1 M-003 / pr-gate Medium #10。未解消]

- **観察**:
  - ux-reviewer の定義は、リソース化を前提にしたままである
    - `.claude/agents/ux-reviewer.md:15` は読む対象に「i18n リソース (`locales/*.json` / `i18n/`)」を挙げる
    - UX-6 (:49-53) は「i18n key の命名規約」を見る
  - 発火条件 (`.specify/spec-gate/reviewers.yml:89-124`) が、基準線を数えた範囲を覆っていない
    - 設定の 3 画面はコメントアウトされている (:115-117)
    - `features/provider` は 0 件
    - この 5 ファイルに、331 行のうち 164 行がある
  - 新しい element 2 つは eslint の一覧には足したが、reviewers.yml には足していない。reviewers.yml:102-103 の「足したらここにも足す」を履行していない
- **同種事象探索**:
  - `i18n` (ux-reviewer.md): 3 件 (:3, :15, :49)
  - `command-palette|conversation-search|features/provider` (reviewers.yml): 0 件
- **リスク/影響**: 改定した日から、XV の Manual の検証は約半分の範囲で起動しない。起動したときも、i18n key の観点で見ることになる
- **推奨アクション**:
  - UX-6 と :15 を、AD-045 の「文言の表・直書きを増やさない・基準線の式」に書き換える
  - reviewers.yml に element 2 つを足す
  - 設定の画面と provider を対象に入れるか決める。入れないなら、XV の Verification に範囲を書く
- **根拠**: Constitution XV Verification、AD-045 Decision 2、AD-024
- **scope 根拠**: XV の改定は本 PR の範囲であり、その検証の配線も同じ PR で直せる

### [Medium] i18n の判断の ADR に、accepted の後で Confirmation へ基準線を in-place で書き足している。AD-031 の in-place の規則 (日付つきの「訂正」節だけ) の外にある (M-004) (scope: feature / 一部 system) [R1 M-004 / pr-gate Medium #13。未解消]

- **観察**:
  - `0045:49-54` は「直書きの基準線 (Consequences の追記。2026-10-07…): 331 行」を、Confirmation の箇条として持つ
  - accepted になったのは 2026-10-05 (`0045:23`)
  - AD-031 Decision 1 (`0031:99-100`) が in-place で認めるのは、事実誤認の訂正だけである
  - XV の Verification (constitution.md:897-899) と Sync Impact Report (:28-29) が、この箇条を参照している
- **同種事象探索**: accepted ADR の、訂正ではない in-place の追記は 4 件 (`0034:95` / `0041:172` / `0046:70` / `0045:49`)。roadmap で「記録」節の明文化を検索して 0 件
- **リスク/影響**: drift の判定の基準が、規則の無い形で後から増える。その先例が 4 件目になる
- **推奨アクション**:
  - feature: `## 記録 (2026-10-07 / SH-002)` の節を立てて基準線を移し、XV の参照先を直す
  - system: AD-041:31 の follow-up を、roadmap に持ち主つきで登録する
- **根拠**: AD-031 Decision 1、Constitution 改定手順 1、AD-028 §5
- **scope 根拠**: 節の形は本 PR で直せる。規則の明文化は system の範囲

### [Medium] perf の実機計測の起動が、KPI「再利用率」の記録 (`launch-usage.json`) に入る。どの記録にもその扱いが無い (M-005) (scope: feature) [R1 M-005 / pr-gate Medium #8。未解消]

- **観察**:
  - perf は `CLOSTA_E2E` を取り除き、本物の composition で 10 本起動する (`perf/real-sessions.spec.ts:12,34,166,179-185`)
  - 受け付けた起動は記録される (`composition-root.ts:308,353` → `session-ipc.ts:163`)
  - session charter:165-179 / discovery / roadmap の O-8 の行に、perf の扱いが無い
- **同種事象探索**:
  - `setPath\(|user-data-dir` (src): 0 件
  - `perf` (session charter:165-179): 0 件
- **リスク/影響**: 判定は最低件数を持たない (session charter:170-171)。そのため O-8 が流す perf の起動がそのまま KPI に混ざる
- **推奨アクション**: O-8 の行と session charter の注記に、次のどちらかを書く
  - 計測用のユーザデータディレクトリを分けてから perf を流す
  - perf の後に、その日を判定から除く手順を discovery に置く
- **根拠**: session charter の KPI「再利用率」、AD-041 (h)
- **scope 根拠**: touched files である

### [Medium] composer で変換中に Ctrl+F を押したときの IME の回帰を見る E2E が無い (M-006) (scope: feature) [R1 M-006 / pr-gate Medium #14。未解消]

- **観察**:
  - Ctrl+F は window の capture で受け、独自の `isComposingKey` で判定する (`ConversationSearchProvider.tsx:43-45,143-152`)
  - Ctrl+K の判定は別の写しである (`CommandPalette.tsx:34`)
  - E2E は Ctrl+K のケース (ime.spec.ts:182-223) しかない
  - plan の RK-06 (plan.md:247) は、E2E で確かめると書いている
- **同種事象探索**: `Control\+[FfKk]` (e2e): 1 件 (ime.spec.ts:223)
- **リスク/影響**: Principle VIII は NON-NEGOTIABLE である。Ctrl+F の写しを誤ると、composer の変換を壊しても CI は緑のままになる。AD-037 D1 の「回帰は E2E で固定する」の範囲から外れている
- **推奨アクション**: ime.spec.ts に、Ctrl+K と同じ CDP の手順で 1 ケース足す。足さないなら、RK-06 に逸脱の理由を書く
- **根拠**: Constitution VIII (A)、AD-037 D1 (`0037:134-140`)
- **scope 根拠**: touched files である

### [Low] Elements の導入コストの ADR は実測結果 §1 で「standalone は採らない」と書くが、本 PR は standalone の element を 2 つ採った。その関係がどこにも書かれていない (L-001) (scope: system) [R1 L-001。未解消]

- **観察**:
  - `0033:50`「standalone は採らない」
  - 本 PR は `command-palette.tsx` / `conversation-search.tsx` を取り込んだ
  - research.md:53 は AD-033 に触れていない
- **同種事象探索**: `AD-033` (research.md): 0 件。`.aui` でない element: 10 件 (うち新規 2 件)
- **推奨アクション**: research R-04 と ui-coverage F 節の備考に、AD-033 §1 の答えの範囲を 1 文足す
- **根拠**: AD-033、AD-019
- **scope 根拠**: 既存の 8 件と食い違っているのは、本 PR より前からである

### [Low] palette は新しい全面のモーダルだが、シェルの ADR の Decision 4「モーダルの間は外部コンテンツを隠す」の列挙に入る道筋が無い (L-002) (scope: feature) [R1 L-002。未解消]

- **観察**: palette は `aria-modal="true"` を持つ (`components/ui/dialog.tsx:69`)。しかし roadmap:395 と prompts.md:340 に palette が無い
- **同種事象探索**: `設定・起動・承認` (docs): 3 件。palette の注記は 0 件
- **推奨アクション**: 2 か所に「palette も含む。判定は `[aria-modal="true"]`」と注記する
- **根拠**: AD-046 Decision 4
- **scope 根拠**: touched files である

### [Low] ui charter の frontmatter と Related ADRs に、i18n の判断の ADR が無い (L-003) (scope: feature) [R1 L-003。未解消]

- **観察**: ui charter:7-15 と :191-197 に `0045` が無い。出てくるのは :225 の 1 か所だけである
- **同種事象探索**: `0045` (ui charter): 1 件
- **推奨アクション**: 両方に AD-045 を足す
- **根拠**: ARCH-2
- **scope 根拠**: touched files である

### [Low] `_overview.md` の「帰属の判断根拠」に、ui の feature が session のモジュールを変える例外の理由と、後続の計測 feature の帰属の理由が無い (L-004) (scope: feature) [R1 L-004。未解消]

- **観察**: `_overview.md:82-105` の項目に、O-3 と O-8 の帰属を述べるものが無い
- **同種事象探索**: 項目は 8 件。O-3 / O-8 の帰属を述べる項目は 0 件
- **推奨アクション**: 2 行足す (O-3 = ui で U-5 の例外、O-8 = session で KPI の持ち主)
- **根拠**: AGENTS.md (domain の分解は人間が承認する)
- **scope 根拠**: touched files である

### [Low] spec と research が、glossary の Counterexamples に入れた語「再利用率の記録」を使っている (L-005) (scope: feature) [R1 L-005。未解消]

- **観察**: glossary:504 はこの語を禁じている。spec.md:33,47,360 と research.md:78 が使っている
- **同種事象探索**: 4 件
- **推奨アクション**: 「起動の利用記録」に直す
- **根拠**: Principle XIV
- **scope 根拠**: feature の文書である

### [Low] glossary の Shell の「中央のヘッダ」に、会話内検索のボタンと検索のバーが無い (L-006) (scope: feature) [R1 L-006。未解消]

- **観察**: glossary:909 の定義のまま。実装は `CenterHeader.tsx:16,36,71` にある
- **同種事象探索**: `検索` (glossary:903-923): 0 件
- **推奨アクション**: glossary:909 に追記する
- **根拠**: AD-046 Decision 6、Principle XIV
- **scope 根拠**: touched files である

### [Low] `main.css` は Principle XIII の除外のファイル (標準テーマの写し) だが、テーマの外の規則を足したので、冒頭の注記が事実と合わない (L-007) (scope: feature) [R1 L-007。未解消]

- **観察**: 冒頭 (`main.css:1-12`) は「そのまま写したもの」と書く。:151-167 に `::highlight()` を足した
- **同種事象探索**: 写しでない追加の注記: 2 件 (:104, :151)
- **推奨アクション**: 別のファイルに移す。または、冒頭の注記を直す
- **根拠**: Constitution XIII (`theme_baseline_exclusions`)
- **scope 根拠**: touched files である

### [Low] 会話内検索の 1,000 メッセージの走査の時間が、どの記録にも残らない (L-008) (scope: feature) [R1 L-008。未解消]

- **観察**: `conversation-search.test.ts:223-240` は時間を参考値として出すだけである。quickstart-results に値が無い
- **同種事象探索**: `1,000|1000|走査の時間` (quickstart-results.md): 0 件
- **推奨アクション**: SH-043 の値として 1 行書く
- **根拠**: AD-034 §1 の趣旨、ui charter KPI「スクロールの安定」
- **scope 根拠**: feature の文書である

### [Low] シェルの ADR の Alternatives「稼働中と過去を混ぜるか」の結論が、運用上の正本である ui charter に無い (L-009) (scope: feature) [R1 L-009。未解消]

- **観察**: 結論「混ぜない」は、013 spec と 012 spec FR-016 にだけある。ui charter には無い
- **同種事象探索**: `混ぜ` (docs。本件に当たるもの): 1 件 (`0046:50`)
- **推奨アクション**: ui charter に、結論と日付を 1 行書く
- **根拠**: AD-046 Alternatives と訂正節
- **scope 根拠**: touched files である

### [Low] pr-gate R1 が見つけた system-scope の項目と system follow-up が、roadmap に持ち主つきで登録されていない (L-010) (scope: feature) [new]

- **観察**:
  - pr-gate.md:167-170 は system follow-up を 2 件挙げる
    - `cascade_enforce` の ID の取り方
    - `e2e/*.spec.ts` がすべて verify.yml から流れることを確かめる検査 (C-001 の再発防止)
  - pr-gate.md には system-scope の指摘もある (Medium #20 / #21、Low #3 / #20 / #34 / #40)
  - 先例の O-7 は、pr-gate R1 / R2 の system-scope の項目を、自分の PR で roadmap に持ち主つきで登録した (roadmap.md:166, :195)
  - O-3 の分は、roadmap に 1 件も無い。例外は Medium #21 で、既存の roadmap.md:185 の (5) と同じ内容である
- **同種事象探索**:
  - `O-3 の pr-gate|012 pr-gate|forced-colors|Contrast themes|cascade_enforce` (roadmap): 0 件
  - `すべて verify\.yml|e2e/\*\.spec\.ts` (docs): 0 件
- **リスク/影響**: 持ち主のいない延期になる。とくに C-001 の再発防止が無いと、次に足した e2e spec が配線されないまま CI が緑になる、という R1 と同じ形を機械で検出できない
- **推奨アクション**: roadmap に「O-3 の pr-gate R1 が見つけた system-scope の項目 (O-3 起点。記録)」を立てる。上の 7 件 (Medium #21 は既存の (5) を参照) に持ち主を付けて登録する
- **根拠**: AD-028 §5 (`0028:191-194`)、roadmap.md:166,195 の先例
- **scope 根拠**: roadmap は本 PR の touched files である

## H. テスト / coverage / observability / regression (本 reviewer の担当範囲)

- 指摘を検出できるテストがあるか:
  - M-007 は記録の問題なので、検出するテストは無い。今後は、新しいステップ (verify.yml:171-172) が過去の区画の画素のずれを検出する
  - 撮る前の `toBeInViewport({ ratio: 1 })` (`sidebar-screenshot.spec.ts:96-97`) は、FR-018 の対象 (グループの見出しと行) が画像から外れたら、撮る前に落とす
  - M-006 は E2E を 1 ケース足せば検出できる
  - M-001 は、roadmap:187-188 の (6) が入れば検出できる
  - ほかは文書の drift で、検出するテストは無い
- 既存の振る舞いを壊していないと言える根拠:
  - a4c37a8 の CI で、e2e の 6 ステップ (composer の基準画像の比較を含む) がすべて success (invoker の記録)
  - code-gate の iter 3 (397d5f1) で vitest は 2266 passed。a4c37a8 で増えたのは gate の記録だけ
  - placeholder の旧い文字列が残っているのは、コメントと記録の 3 か所だけ (labels.ts:204、data-model.md:322、quickstart-results.md:88)。字面を固定しているテストは無い
  - XV の基準線: Round 2 の差分の `.tsx` は 0 件なので、331 は変わらない
- 観測点:
  - 失敗したときは、artifact に expected / actual / diff が上がる (verify.yml:176-182)
  - スクロールの領域が見つからないときは、理由つきで例外を出す (`sidebar-screenshot.spec.ts:90`)
  - testTimeout 20s で、20s 未満の遅れが失敗として出なくなる点は、code-gate の convention-reviewer.code-gate.md:234 が記録している (再指摘しない)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-007 | `朝` (docs と 012 の md) / `未了\|未実施\|まだコミット\|コミットするまで\|承認済み` (012 quickstart-results.md) / `承認してから\|承認済み基準画像\|承認の後` / `基準画像` (012 quickstart.md) / Glob `e2e/**/*.png` | 1 / 7 / 5 / 0 / 2 | quickstart-results.md:93 / quickstart-results.md:24,29,50,69,74,76,93 / verify.yml:141,168, quickstart-results.md:24, pr-gate.md:37, design-gate.md:85 / — / composer-fullwidth-win32.png, sidebar-past-sessions-win32.png |
| M-001 | `@/features/session-list/` (features/search) / `@/features/search/` (features/session-list) | 2 / 2 | session-search.ts:3,4 / SessionListScreen.tsx:25,26 |
| M-002 | `revealMessage` (docs) / `watchedId\|見ているセッション` の定義の行 | 2 / 5 | session charter:238, roadmap:259 / glossary:201,917-918, ui charter:174, session charter:184 |
| M-003 | `i18n` (ux-reviewer.md) / `command-palette\|conversation-search\|features/provider` (reviewers.yml) | 3 / 0 | ux-reviewer.md:3,15,49 / — |
| M-004 | accepted ADR の訂正ではない in-place の追記 / 「記録」節の明文化 (roadmap) | 4 / 0 | 0034:95, 0041:172, 0046:70, 0045:49 / — |
| M-005 | `setPath\(\|user-data-dir` (src) / `perf` (session charter:165-179) | 0 / 0 | — / — |
| M-006 | `Control\+[FfKk]` (e2e) | 1 | ime.spec.ts:223 |
| L-001 | `AD-033` (research.md) / `.aui` でない element | 0 / 10 | — / components/assistant-ui/elements/* |
| L-002 | `設定・起動・承認` (docs) | 3 | 0046:30, roadmap:395, prompts.md:340 |
| L-003 | `0045` (ui charter) | 1 | ui charter:225 |
| L-004 | `_overview.md` の帰属の判断根拠の項目 | 8 (O-3 / O-8 は 0) | _overview.md:82-105 |
| L-005 | `再利用率の記録` (012 spec / research) | 4 | spec.md:33,47,360, research.md:78 |
| L-006 | `検索` (glossary の Shell の項) | 0 | glossary.md:903-923 |
| L-007 | main.css の、写しでない追加の注記 | 2 | main.css:104,151 |
| L-008 | `1,000\|1000\|走査の時間` (quickstart-results.md) | 0 | — |
| L-009 | `混ぜ` (docs。本件に当たるもの) | 1 | 0046:50 |
| L-010 | `O-3 の pr-gate\|012 pr-gate\|forced-colors\|Contrast themes\|cascade_enforce` (roadmap) / `すべて verify\.yml\|e2e/\*\.spec\.ts` (docs) | 0 / 0 | — / — (先例: roadmap.md:166,195) |

## Verdict

- Critical: 0
- High: 0
- Medium: 7
- Low: 10
- Round inheritance: resolved from 1: 1 (H-001) / unresolved: 15 (M-001〜M-006, L-001〜L-009。重大度は Round 1 のまま) / new: 2 (M-007, L-010)
