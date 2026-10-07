# ux-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: ux-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-017: 過去のセッションの区画の検索欄とスクロールする領域の並び (`SessionListScreen.tsx`、`session-list/labels.ts`)。Round 2 で placeholder が変わった
  - FR-018 / SC-008: サイドバーの基準画像と高さの E2E (`e2e/sidebar-screenshot.spec.ts`、基準画像、`verify.yml`)。Round 2 で、撮る前のスクロール・CI のステップ・基準画像が加わった
  - FR-003〜FR-008 / FR-009 / FR-013 / FR-014、SC-001〜SC-005: Round 1 からコードは変わっていない (下の「継続」の指摘)
- touched files に当たる charter / Confirmation:
  - ui charter の KPI「自作率」(計測経路は ux-reviewer)。Round 2 の差分に自作の部品は増えていない
  - AD-045 Confirmation (直書きの基準線 331 行): HEAD `a4c37a8` で同じ式を Grep ツールで当てた。`src/renderer/src` の `*.tsx` からテストを除いた合計は **331 行** で、増えていない。Round 2 の差分は renderer の `.tsx` に触れていない
  - AD-038 D5 (基準画像の承認): 承認の手続きは po / architecture が見る。UX として見たのは、画像に写っている状態だけ (L-007)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-045 の直書きの基準線は UX-6 として G で見た。331 → 331)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:8 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

Round 1 から Round 2 までのコードの差分 (`9d98c39..a4c37a8`) は、pr-gate R1 C-001 を直すものだけだった。
- verify.yml にサイドバーの E2E のステップを足した
- E2E が、撮る前に区画のスクロールの領域をグループの並びまで送るようになった
- CI の artifact から取った基準画像をコミットした
- 検索欄の placeholder を 16 字から 13 字に縮めた (「題・ブランチ・フォルダなど」)
- vitest の timeout を 20s にした
- data-model / quickstart-results を直した

UX の観点では、まず差分を見た。新しい文言は placeholder だけで、空・失敗・取得中の状態、破壊的な操作、通知は増えていない (UX-1〜3・UX-5・UX-8 の新しい対象は無い)。次に、CI の artifact と基準画像から新しく分かった事実を見た。区画の最初の見た目に行が入らないことである (M-008)。Round 1 の ux の指摘 13 件は、どれも直す対象になっていない (pr-gate.md の Next は C-001 だけ)。HEAD で同じ箇所を確かめ直し、重大度を変えずに引き継いだ。位置は今の行に直した (`session-list/labels.ts` だけ 4 行ずれた)。vendored primitive は、reviewers.yml の `exclude_patterns` のとおり対象にしていない。code-gate の `must_fix_findings` は空なので、抑える重複は無い。

## Findings

### [Medium] 区画の最初の見た目と検索の結果が、取得時刻・取り直し・列挙の結果・絞り込みの下に押し出される。768px の画面では過去の行が 1 つも見えない (M-008) (scope: feature) [new]

- **観察**:
  - スクロールする領域の並び (`SessionListScreen.tsx:1135`。data-model §6 `data-model.md:364-369` のとおり):
    1. 取得時刻と「全件を取り直す」(`:1141-1198`)
    2. 列挙の結果 (`:1217-1226`)
    3. 所在とフォルダの絞り込みのチップ (`:1229-1293`)
    4. 空の状態 (`:1306`)
    5. グループ
  - CI の artifact (内容 1000×640、区画 279×361。`quickstart-results.md:118-120,123`) には、スクロールしないと見出し・検索欄・取得時刻・「全件を取り直す」・列挙の結果の要約・絞り込みまでしか写らず、**グループの見出しも行も入っていなかった**。E2E は、撮る前にスクロールの領域を送らないと行を写せない (`e2e/sidebar-screenshot.spec.ts:17,82-94`)
  - 基準画像 `sidebar-past-sessions-win32.png` では、送った後でもスクロールのつまみの上端が軌道の約 4 割の位置にある (目測)。グループより上の要素だけで、見えている高さ (約 290px) を超えている
  - 1000×640 は既定の 1100×760 (`src/main/app/window.ts:45-46`) より小さい。ただし 768px の画面ではウィンドウが縮む (`e2e/sidebar-screenshot.spec.ts:14`、`Sidebar.tsx:131-133`「768px の環境 (CI のランナー・小さいノート PC)」)。稼働中のセッションがあれば、過去の区画はさらに縮む (`Sidebar.tsx:135`)。既定の大きさで行がいくつ見えるかは、どのテストも確かめていない
  - 語を入れてもスクロールの位置は変わらない。一致した行と `search-empty` の空の状態 (`:1306-1328`) は、どちらも絞り込みの下に出る。見えるのは検索欄の下の「{n} 件が一致」(`:1131`) だけになる
- **同種事象探索**: `scrollTop|scrollIntoView|scrollTo\(` を `src/renderer/src/features/session-list` で探すと 0 件 (語を変えたときにスクロールを直す処理が無い)。固定の外に置いた常設の要素は 4 種 (取得時刻の行・取り直しのボタン・列挙の結果・絞り込み)
- **リスク/影響**:
  - US-1 (P1) の「語を入れる → 一致を見る → 開く」で、結果が画面に入らない
  - 過去の区画を最初に開くと操作の部品しか見えず、セッションが無いように見える
  - M-004 の「0 件が一致」と重なると、「無い」と読まれやすい
- **推奨アクション**:
  - 最小案 (並びも文言も変えない): 語が空から非空に変わったとき、と `search-empty` に変わったときに、スクロールの領域をグループの並び (または空の状態) の上端まで送る
  - 並べ替える案: 検索中 (`searching`) は、空の状態とグループを取得時刻・列挙の結果・絞り込みより先に出す
  - 畳む案: 絞り込みのチップを 1 行の開閉 (「絞り込み: すべて」と選んでいる値) にし、取得時刻と取り直しを 1 行にまとめる
  - どの案でも data-model §6 の並びの図を直す。Clarification 2026-10-06 (i) の「固定するのは見出しと検索欄だけ」は変えない
  - テストは L-007
- **根拠**: spec US-1 AC1・AC3、FR-001、FR-017、UX-7 (主な内容を操作の部品より先に出す。1 画面に詰め込みすぎない)
- **scope 根拠**: `SessionListScreen.tsx` と data-model §6 は本 PR の touched files で、本 PR の FR-017 がこの並びを決めた

### [Medium] 会話内検索の 0 件の文言が、検索の対象外 (tool の入出力・Reasoning) を示さない (M-001) (scope: feature) [継続 / unresolved]

- **観察**: `chat/labels.ts:100,102-103` (「語を入力」「一致する箇所はありません。」「語を変えるか、検索を閉じてください。」)、`ConversationSearchBar.tsx:50-60`。Round 1 から変わっていない。テストは `ConversationSearch.test.tsx:389-399` がこの文言を固定している
- **同種事象探索**: 0 件の文言 5 種のうち、範囲を文言で示すのは `session-list/labels.ts:212` の 1 種だけ
- **リスク/影響**: 画面に見えている tool の本文の語で探すと「一致しない」と言われ、示された「語を変える」では直らない
- **推奨アクション**: Round 1 のとおり。`searchNoneHint` と placeholder に対象の範囲を書く
- **根拠**: FR-004 / FR-008、UX-1
- **scope 根拠**: 本 PR の touched files

### [Medium] 過去ログの取得中・失敗・空のときも会話内検索が開き、「一致する箇所はありません」と出る (M-002) (scope: feature) [継続 / unresolved]

- **観察**: `CenterPane.tsx:155,175` は、取得の状態に関わらず `transcript.messages` を provider に渡す。Round 1 から変わっていない。読み込みの後に 1 件目を飛ばす経路 (`useConversationSearch.ts:92-121`) も同じ
- **同種事象探索**: `<ConversationSearchProvider` は 2 件 (`CenterPane.tsx:93,175`)。取得の状態を持つのは過去の 1 件。取得中・失敗の組み合わせのテストは 0 件
- **リスク/影響**: 読めていないものを「無い」と読ませる
- **推奨アクション**: Round 1 のとおり (`searchable` を渡す、本文が初めて揃ったときに最初の一致へ移る、テストを足す)
- **根拠**: FR-008 / US-2 AC1、UX-2 / UX-3
- **scope 根拠**: 本 PR の touched files

### [Medium] `search-empty` が、所在・フォルダの絞り込みで隠れた一致まで「一致するものはありません」と断言する (M-003) (scope: feature) [継続 / unresolved]

- **観察**: `SessionListScreen.tsx:998-1011,1094`、文言は `session-list/labels.ts:212` (Round 1 の :208 から 4 行ずれただけで、中身は同じ)
- **同種事象探索**: 空の状態の分岐は `SessionListScreen.tsx:1086-1106` の 1 か所。絞り込みを考えずに断言するのは 1 件
- **リスク/影響**: 絞り込みを解除すれば見つかるものを「無い」と読ませる
- **推奨アクション**: Round 1 のとおり
- **根拠**: FR-001 / FR-008、UX-1
- **scope 根拠**: 本 PR の touched files

### [Medium] Thread search の件数「{n} 件が一致」が coverage を見ず、索引が null の間も「0 件が一致」と出す (M-004) (scope: feature) [継続 / unresolved]

- **観察**: `SessionListScreen.tsx:1019,1131`、`session-list/labels.ts:208` (Round 1 の :204)。中身は変わっていない
- **同種事象探索**: `countText\(|searchCount\(` は 3 件 (`SessionListScreen.tsx:277,663,1131`)。coverage を通らないのは :1131 の 1 件
- **リスク/影響**: 段階取得の途中で件数を言い切り、取得中・失敗のときも「0 件」と出る。M-008 の後では、利用者に見える唯一の文になる
- **推奨アクション**: Round 1 のとおり
- **根拠**: R-2 FR-037 / 不変条件 5、UX-3 / UX-9
- **scope 根拠**: 本 PR の touched files

### [Medium] 「記録を読めません」に添える「次に起動ダイアログを開いたときに読み直します。」が、将来版のファイルでは偽になる (M-005) (scope: feature) [継続 / unresolved]

- **観察**: `session/labels.ts:485`、`PresetPanel.tsx:215-219`、`launch-usage-service.ts:64-65,75-79`。Round 1 から変わっていない
- **同種事象探索**: `newer-version` の扱いは 3 か所 (`launch-usage-service.ts:75-79`、`launch-usage-store.ts:118,159`、`launch-usage-service.test.ts:197`)
- **リスク/影響**: 起こらない読み直しを待たせる。将来版の間は計測が止まる
- **推奨アクション**: Round 1 のとおり (最小案は文言だけを直す)
- **根拠**: FR-008 / FR-013、UX-2
- **scope 根拠**: 本 PR の touched files

### [Medium] palette の候補を 50 件で切るが、切ったことを示さない (M-006) (scope: feature) [継続 / unresolved]

- **観察**: `palette-commands.ts:98` (`PALETTE_MAX_CANDIDATES = 50`)、`:229-241`、`command-palette.tsx:283-285`。変わっていない
- **同種事象探索**: 上限で切るのは 2 か所。過去の区画 (`SessionListScreen.tsx:666-684`) は切ったことを示し、palette は示さない
- **リスク/影響**: 目当てが 51 件目より後にあっても気づけない
- **推奨アクション**: Round 1 のとおり
- **根拠**: FR-007、R-2 FR-038 の前例、UX-7
- **scope 根拠**: 本 PR の touched files

### [Medium] Command palette の入口が Ctrl+K だけで、画面のどこにも示されない (M-007) (scope: feature) [継続 / unresolved]

- **観察**: `CommandPalette.tsx:79-89,162-175`、`ConversationSearchBar.tsx:76-78`。変わっていない
- **同種事象探索**: renderer の `aria-keyshortcuts` は 1 件 (`ConversationSearchBar.tsx:78`)。`Control+K` は 0 件
- **リスク/影響**: palette があることに気づけない。マウスの利用者には開く手段が無い
- **推奨アクション**: Round 1 のとおり
- **根拠**: US-3、AD-046 Consequences、UX-7
- **scope 根拠**: 本 PR の touched files

### [Low] palette の 0 件の文言が「操作」としか言わず、セッションを探す範囲も索引の取得中・失敗も示さない (L-001) (scope: feature) [継続 / unresolved]

- **観察**: `shell/labels.ts:55-56`、`CommandPalette.tsx:184-189,213-227`。Thread search が範囲を示すのは `session-list/labels.ts:212`
- **推奨アクション**: Round 1 のとおり
- **根拠**: FR-008、UX-1 / UX-9

### [Low] 0 件のとき「0 / 0 件」と空の状態が重なり、次へ / 前へも押せる (L-002) (scope: feature) [継続 / unresolved]

- **観察**: `ConversationSearchBar.tsx:31-33,50-60`、`conversation-search.tsx:92-112`、`SessionListScreen.tsx:1131`
- **推奨アクション**: Round 1 のとおり
- **根拠**: UX-9

### [Low] 31〜90 日前にしか記録が無いときも「まだ記録がありません。」と出る (L-003) (scope: feature) [継続 / unresolved]

- **観察**: `PresetPanel.tsx:220-224`、`session/labels.ts:481-482`
- **推奨アクション**: Round 1 のとおり (「直近 30 日の起動はありません。」)
- **根拠**: UX-1

### [Low] palette の element に `esc` を直書きしていて、文言の表の「Esc」と表記が揺れる (L-004) (scope: feature) [継続 / unresolved]

- **観察**: `command-palette.tsx:168-177`、`shell/labels.ts:56`
- **推奨アクション**: Round 1 のとおり
- **根拠**: AD-045 Decision 2、UX-6 / UX-9

### [Low] 稼働中のセッションは作業フォルダとランタイムの名前でしか palette に当たらない (L-005) (scope: feature) [継続 / unresolved]

- **観察**: `session-search.ts:145-157`、`palette-commands.ts:166-223`
- **推奨アクション**: Round 1 のとおり
- **根拠**: FR-007、UX-7

### [Low] M-001〜M-005 の経路にテストが無いか、テストが誤った振る舞いを固定している (L-006) (scope: feature) [H] [継続 / unresolved]

- **観察**: `ConversationSearch.test.tsx:42,389-399`、`SessionListScreen.test.tsx:1748-1790`、`PresetPanel.test.tsx:188-193`、`launch-usage-service.test.ts:197`。Round 2 の差分はこれらのテストに触れていない
- **推奨アクション**: Round 1 のとおり
- **根拠**: reviewer-base の H の規則

### [Low] 基準画像も SC-008 のケースも、スクロールした後の状態しか見ていない。最初の見た目と、語を入れた直後の見た目を見るテストが無い (L-007) (scope: feature) [H] [new]

- **観察**:
  - 基準画像のケースは、撮る前にスクロールの領域を送る (`e2e/sidebar-screenshot.spec.ts:82-94`)。SC-008 のケースが確かめるのは、`scrollIntoViewIfNeeded` で行に届くことだけ (`:131-140`)
  - スクロールしない状態で、行か検索の結果か `search-empty` が区画の中に見えることを確かめるテストは 0 件
  - V-4 の承認 (`quickstart-results.md:123-126`) の対象は送った後の画像で、利用者が最初に見る状態は承認の対象に入っていない
- **既存の振る舞いを壊していないと言える根拠 (Round 2 の差分)**:
  - placeholder の変更: 古い文言「フォルダなどで探す」が残っているのは `session-list/labels.ts:204` のコメントだけで、テストにも E2E にも 0 件
  - 長さの見積もり: 279px の区画から `px-2`・`pl-7`・`pr-8`・枠を引くと文字の幅は約 201px (`SessionListScreen.tsx:832,853`)。13 字 × 14px = 182px で収まり、基準画像でも切れていない。win32 の基準画像の比較があるので、長くすれば CI が捕まえる
  - AD-045 の直書きの基準線: 331 → 331 (上の「初回読了」)
  - CI run 37565959731 で、e2e job の 6 ステップがすべて success (invoker の観察)
- **observability**: 表示の状態なので、ログは要らない
- **推奨アクション**:
  - M-008 を直すときに、`sidebar-screenshot.spec.ts` にケースを 1 つ足す: `CONTENT_SIZE` のままスクロールせずに語を入れ、最初に一致した行 (または `search-empty` の空の状態) が区画の中に見えることを `toBeInViewport` で確かめる
  - quickstart-results の V-4 の行に、承認した画像は送った後の状態だと書く
- **根拠**: reviewer-base の H の規則、spec SC-008

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-008 | `scrollTop\|scrollIntoView\|scrollTo\(` (`src/renderer/src/features/session-list`) | 0 | なし |
| M-001 | `searchNone\|paletteNone\|searchEmpty\b\|usageEmpty\b\|usageUnreadable\b` (renderer、テストを除く) | 5 | `chat/labels.ts:102`、`session-list/labels.ts:212`、`shell/labels.ts:55`、`session/labels.ts:481`、`session/labels.ts:484` |
| M-002 | `<ConversationSearchProvider` (renderer、テストを除く) | 2 | `CenterPane.tsx:93`、`CenterPane.tsx:175` |
| M-003 | 空の状態の分岐 (`emptyNotice`) | 1 | `SessionListScreen.tsx:1094` |
| M-004 | `countText\(\|searchCount\(` (renderer、テストを除く) | 3 | `SessionListScreen.tsx:277`、`:663`、`:1131` |
| M-005 | `newer-version` の扱い | 3 | `launch-usage-service.ts:75`、`launch-usage-store.ts:118`、`launch-usage-service.test.ts:197` |
| M-006 | `PALETTE_MAX_CANDIDATES` / `上限で打ち切りました` | 2 | `palette-commands.ts:98`、`SessionListScreen.tsx:675` |
| M-007 | `aria-keyshortcuts` (renderer) | 1 | `ConversationSearchBar.tsx:78` |
| L-001 | `paletteNone` | 1 | `shell/labels.ts:55` |
| L-002 | 0 件の位置の文 | 2 | `ConversationSearchBar.tsx:31`、`SessionListScreen.tsx:1131` |
| L-003 | `usageEmpty` | 1 | `PresetPanel.tsx:222` |
| L-004 | `esc` の直書き (element) | 1 | `command-palette.tsx:176` |
| L-005 | `runningSessionMatches` の照合の対象 | 1 | `session-search.ts:152` |
| L-006 | 上の各経路のテスト | 5 | `ConversationSearch.test.tsx:42`、`:389`、`SessionListScreen.test.tsx:1748`、`PresetPanel.test.tsx:188`、`launch-usage-service.test.ts:197` |
| L-007 | `toBeInViewport\|scrollIntoViewIfNeeded` (`e2e/sidebar-screenshot.spec.ts`) | 3 | `e2e/sidebar-screenshot.spec.ts:96`、`:97`、`:132` |

## Verdict

- Critical: 0
- High: 0
- Medium: 8
- Low: 7
- Round inheritance: resolved from 1: 0 / unresolved: 13 (M-001〜M-007、L-001〜L-006。どれも重大度は Round 1 のまま) / new: 2 (M-008、L-007)
