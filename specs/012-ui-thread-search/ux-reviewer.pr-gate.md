# ux-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: ux-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: 過去のセッションの区画の Thread search・件数・`search-empty`・並び・ツールチップ (`SessionListScreen.tsx`、`session-list/labels.ts`)
  - FR-003 / FR-004 / FR-005: 会話内検索のバーとボタン・0 件・間引き (`ConversationSearchBar.tsx`、`ConversationSearchProvider.tsx`、`useConversationSearch.ts`、`elements/conversation-search.tsx`、`CenterPane.tsx`、`CenterHeader.tsx`)
  - FR-006 / FR-007: Command palette (`CommandPalette.tsx`、`palette-commands.ts`、`elements/command-palette.tsx`、`AppShell.tsx`)
  - FR-008: この feature で足した 4 つの空の状態 (Thread search の 0 件・会話内検索の 0 件・palette の 0 件・利用記録の無し / 読めない)
  - FR-009 / FR-013: 起動元 (画面には出ない) とプリセットの欄の利用記録 (`LaunchDialog.tsx`、`PresetPanel.tsx`、`useLaunchUsage.ts`、`session/labels.ts`)
  - FR-014: composer の名前と placeholder (`thread.aui.tsx`、`chat/labels.ts`)、AD-045 の直書きの基準線
  - SC-001 / SC-002 / SC-003 / SC-004 / SC-005 (表示の部分) / SC-008
- touched files に当たる charter / Confirmation:
  - ui charter の業務ルール (Principle VIII / XIII) と KPI「自作率」(計測経路が ux-reviewer)。`PastSearchField` は自作で、element 内蔵の検索を使わない理由は `thread-list.aui.tsx:38` に書いてある。palette と会話内検索は registry の element を取り込み、変えた点をファイルの先頭に書いている (`command-palette.tsx:16-29`、`conversation-search.tsx:8-20`)
  - AD-045 Decision 2 と Confirmation (直書きの基準線 331 行): 同じ式を Grep ツールで HEAD (9d98c39) に当て、`*.tsx` からテストを除いた件数を足すと **331 行**。基準線から増えていない
  - session charter の KPI「再利用率」の表示 (プリセットの欄 `PresetPanel.tsx:206-232`)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-045 の直書きの基準線は UX-6 として G で見た)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:7 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

この PR は 4 つの「探す」操作を足す: サイドバーの過去のセッションの区画の Thread search、中央のヘッダの会話内検索、アプリ全体の Command palette (Ctrl+K)、プリセットの欄の直近 30 日の起動の内訳。加えて composer の文言を日本語にし、過去の区画の並びを直す (`role="group"`・ツールチップ・列挙の結果の 1 行の要約)。UX の観点で見たのは、空・失敗・取得中の状態 (UX-1〜3)、次の操作の文言、件数の断言の一貫性、palette の見つけやすさと候補の上限 (UX-7)、表記の揺れと直書き (UX-6 / UX-9)。破壊的な操作は追加されておらず (UX-5)、通知・トーストも新しく無い (UX-8)。vendored primitive (`components/ui/dialog.tsx`、`elements/empty-state.tsx`) は reviewers.yml の `exclude_patterns` のとおり指摘の対象にしていない。code-gate の `must_fix_findings` は空なので、抑えるべき重複は無い。関連する DB-M-001 (退避の後に空と見える) とは経路を分けた。

## Findings

### [Medium] 会話内検索の 0 件の文言が、検索の対象外 (tool の入出力・Reasoning) を示さない (M-001) (scope: feature)

- **観察**:
  - 0 件の表示は `chat/labels.ts:102-103` の「一致する箇所はありません。」「語を変えるか、検索を閉じてください。」で、`ConversationSearchBar.tsx:50-60` が描く。placeholder は「語を入力」(`chat/labels.ts:100`) だけ
  - FR-004 により、tool の入出力と Reasoning は検索の対象外になる
  - 既定の `comfortable` では tool の呼び出しのまとまりが最初から開いている (`chat/labels.ts:115,119-120`)。つまり対象外の本文が画面に見えている
  - `ConversationSearch.test.tsx:389-399` はこの組み合わせを固定している。Bash の結果と Reasoning に「りんご」がある会話で「りんご」を探すと、上の 2 文と「0 / 0 件」が出る
- **同種事象探索**: `searchNone|paletteNone|searchEmpty\b|usageEmpty\b|usageUnreadable\b` (テストを除く) で 0 件の文言を引くと 5 種。範囲を文言で示しているのは Thread search の `searchEmpty`「読み込み済みの…」(`session-list/labels.ts:208`) だけで、会話内検索は範囲を言わない
- **リスク/影響**: 利用者は画面に見えている語を探して「一致しない」と言われる。示された次の操作「語を変える」では直らない (FR-008 の「なぜ空か」が誤る)
- **推奨アクション**: `searchNoneHint` (と data-model §5) に対象の範囲を書く。例: 「会話の本文だけを探します (tool の入出力と考えている過程は対象外)。語を変えるか、検索を閉じてください。」。placeholder も「本文を検索」のように範囲を示す。`ConversationSearch.test.tsx:396-398` の期待値を直す
- **根拠**: spec FR-004 / FR-008、UX-1
- **scope 根拠**: 文言の表とバーは本 PR の touched files

### [Medium] 過去ログの取得中・失敗・空のときも会話内検索が開き、「一致する箇所はありません」と出る (M-002) (scope: feature)

- **観察**:
  - `PastCenter` は取得の状態に関わらず `transcript.messages` を provider に渡す (`CenterPane.tsx:155,175`)
  - `useTranscript` は取得中に `messages` を `[]` にし (`useTranscript.ts:93-98`)、失敗のときも `[]` のまま (`:130-133`、`:160-165`)
  - 検索のボタンは provider があれば必ず出る (`ConversationSearchBar.tsx:66-84`)。palette の「会話内を検索」も中央に会話を出していれば常に候補になる (`palette-commands.ts:141-146`、`CommandPalette.tsx:215`)
  - そのため、取得中や失敗のときに語を入れると「0 / 0 件」と「一致する箇所はありません」が出る
  - 付随してコードから読める点 (実行はしていない):
    - 取得中に語を入れ、その後で本文が届いた場合、語は変わっていないので移動の要求が出ない (`useConversationSearch.ts:92-102`)。`reconcileCurrent` は `current === null` から最初の一致を選ぶ (`conversation-search.ts:183`) ので、バーは「1 / n 件」と出すが、表示はその一致に移っていない
    - 続けて Enter を押すと `stepHit` で 2 番目へ移り (`useConversationSearch.ts:110-121`)、1 番目を飛ばす
- **同種事象探索**: `<ConversationSearchProvider` で 2 件 (`CenterPane.tsx:93` 稼働中、`:175` 過去)。稼働中には取得の状態が無いので、当たるのは過去の 1 件。テストは過去ログの状態を `'ready'` に固定している (`ConversationSearch.test.tsx:42`)。取得中・失敗の組み合わせのテストは 0 件
- **リスク/影響**: 本体が「読み込み中」や「失敗・再取得」を出している上で、ヘッダの下のバーが「一致しない」と断言する。読めていないのを「無い」と読ませる (R-2 FR-012 と同じ種類の誤り)。読み込みが終わった後は 1 件目を飛ばす
- **推奨アクション**:
  - provider に `searchable` (`transcript.status === 'ready'`) を渡す。`ready` でない間はバーの文を別にする (例: 「会話を読み込み中です」「会話を読み込めなかったので検索できません」。文言は `chat/labels.ts`)。または 0 件の空の状態を出さない
  - 本文が初めて揃ったときに語が空でなければ、語の変化と同じに扱い、最初の一致へ移る
  - テストに `status: 'loading' | 'failed'` の場合を足す
- **根拠**: spec FR-008 / US-2 AC1、UX-2 / UX-3
- **scope 根拠**: `CenterPane.tsx` と会話内検索の部品は本 PR の touched files

### [Medium] `search-empty` の文言が、所在・フォルダの絞り込みで隠れた一致まで「一致するものはありません」と断言する (M-003) (scope: feature)

- **観察**:
  - `visible` はフォルダ → 所在 → 語の順に絞る (`SessionListScreen.tsx:998-1011`)。`search-empty` の条件は `searching && visible.length === 0` (`:1094`) で、文言は「読み込み済みのセッションに一致するものはありません。」(`session-list/labels.ts:208`。描くのは `:1321-1328`)
  - フォルダ A で絞った状態で、フォルダ B の行にだけ当たる語を入れると、読み込み済みの行に一致があるのに「一致するものはありません」と出る
  - テスト `SessionListScreen.test.tsx:1748-1780` の語は `zzzz` で、どこにも一致しない。この経路は確かめられていない
- **同種事象探索**: 空の状態の分岐は `SessionListScreen.tsx:1086-1106` の 1 か所。既存の `filtered-out` (`:1096`、`:1330-1344`) は「絞り込みに一致する…」と範囲を言う。絞り込みを考えずに断言するのは `search-empty` の 1 件
- **リスク/影響**: 解除すれば見つかる状態を「無い」と読ませる。この画面は「索引の空と、絞り込みの結果の 0 件を混ぜない」と注記しているが (`SessionListScreen.tsx:1060-1064`)、その規則から外れる
- **推奨アクション**:
  - `filtering` のときは文言を分ける。例: 「絞り込みの範囲の、読み込み済みのセッションに一致するものはありません。」。または絞り込みを外したときの一致の件数を数えて「絞り込みを解除すると N 件あります」と出す
  - data-model §5 と `PAST_SESSIONS_LABELS` に足し、「絞り込みの外にだけ一致がある」テストを足す
- **根拠**: spec FR-001 / FR-008、UX-1 (初回とフィルタの結果 0 件を区別する)
- **scope 根拠**: 本 PR の touched files

### [Medium] Thread search の件数「{n} 件が一致」が coverage を見ずに断言し、一覧の取得中・失敗でも「0 件が一致」と出す (M-004) (scope: feature)

- **観察**:
  - 語があるときの件数は、常に `searchCount(matchedCount)` (`SessionListScreen.tsx:1019,1131`、`session-list/labels.ts:204`)
  - 同じ画面のほかの件数はすべて `countText(count, coverage)` を通り、`pending` / `partial` では「以上 (取得中)」を付ける (`session-list/labels.ts:85-88`)。画面の注記にも「画面の断言はすべてここから来る」とある (`SessionListScreen.tsx:1067-1074`)
  - 索引が `null` (初回の取得中か失敗) のとき、`buildSessionRows(null)` は空を返す (`rows.ts:86`)。そのため、skeleton (`SessionListScreen.tsx:1211-1215`) や `ErrorState` (`:1200-1209`) の横で「0 件が一致」と出る。空の状態は索引が `null` だと出ない (`:1087`) ので、語っているのは件数の文だけになる
  - テスト `SessionListScreen.test.tsx:1782-1790` は先頭ページのときの `searchEmpty` だけを見ていて、件数の文言は見ていない
- **同種事象探索**: `countText\(|searchCount\(` (テストを除く) で 3 件。`SessionListScreen.tsx:277` と `:663` は coverage を通り、`:1131` の `searchCount` だけが通らない
- **リスク/影響**: 段階取得の途中で「3 件が一致」と言い切るので、利用者は続きを取らずに探すのをやめる。取得中・失敗の「0 件が一致」は、無いと誤読させる
- **推奨アクション**:
  - `searchCount(n, coverage)` にして、`pending` / `partial` は「{n} 件以上が一致 (取得中)」「{n} 件以上が一致」にする
  - 索引が `null` の間は件数を出さないか、「一覧を取得中です」にする
  - data-model §5 とテストを直す
- **根拠**: R-2 FR-037 / 不変条件 5 (`session-list/labels.ts:43-88`)、UX-3 / UX-9
- **scope 根拠**: 本 PR の touched files

### [Medium] 「記録を読めません」の次の操作「次に起動ダイアログを開いたときに読み直します。」が、将来版のときは偽になる (M-005) (scope: feature)

- **観察**:
  - 読み出しの値が `unreadable` なら、いつも同じ文を出す (`PresetPanel.tsx:215-219`、`session/labels.ts:485`)
  - service は将来版を `newer-version` の状態に固定する (`launch-usage-service.ts:75-79`)。`ensureLoaded` は `unloaded` のときしか読まない (`:64-65`)。そのため、プロセスの間 `summary()` は `unreadable` を返し続け (`:116`)、`record()` も捨て続ける (`:101`)
  - store は将来版の原文を `.bak` に写すだけで、元のファイルを残す (`launch-usage-store.ts:118,159`)。次のプロセスでも同じ将来版になる
  - テスト同士が食い違う。`launch-usage-service.test.ts:197` は「将来版なら書かず、集計は unreadable。再読もしない」を固定し、`PresetPanel.test.tsx:188-193` は「次に起動ダイアログを開いたときに読み直します。」を固定している
  - 設計の段階から食い違っている (data-model.md:254,258 と :352)
- **同種事象探索**: DTO の `unreadable` が `storeNewerVersion` と `readFailed` を 1 つにまとめている (data-model.md:276)。読み出しの経路は `useLaunchUsage.ts:984-989` (DTO の形が合わなければ `unreadable`) の 1 か所。code-gate の DB-M-001 (退避の後に空と見える) は別の経路で、この偽の案内は扱っていない
- **リスク/影響**: 起こらない読み直しを待たせる。将来版の間は計測が止まる (KPI「再利用率」の計測経路が黙って止まる) のに、利用者が取れる操作が示されない。分かるのは main のログの `schema-version-unknown` (`launch-usage-service.ts:76`) だけ
- **推奨アクション**:
  - 最小案: 案内を両方で正しい文にする。例: 「一時的に読めなかったときは、次に起動ダイアログを開いたときに読み直します。新しい版のアプリで書かれた記録は、この版では読み書きしません。」
  - 分ける案: DTO の `unreadable` に理由 (`newer-version` / `read-failed`) を持たせ、文言を分ける。将来版には「アプリを更新するか、`launch-usage.json` を退避してください」と discovery の消し方を示す
  - data-model §4 / §5 と `PresetPanel.test.tsx:193` を直す
- **根拠**: spec FR-008 / FR-013、data-model §4、UX-2 (失敗の種類ごとの出し分けと回復の操作)
- **scope 根拠**: 本 PR の touched files

### [Medium] palette の候補を 50 件で黙って切る (M-006) (scope: feature)

- **観察**:
  - `buildPaletteCandidates` は操作 → 稼働中 → 過去の合計を `PALETTE_MAX_CANDIDATES = 50` で切り、切ったことを返さない (`palette-commands.ts:97-98,229-241`)
  - element にも「ほかに N 件」を出す口が無い。0 件のときの `empty` しかない (`command-palette.tsx:283-285`)
  - `palette-commands.test.ts:207-229` は 50 件で止まることだけを確かめている
- **同種事象探索**: 同じ PR の過去の区画には、上限で切ったときに「上限で打ち切りました」と「続きを取る」を出す前例がある (`SessionListScreen.tsx:666-684`。FR-038「黙って切らない」)。上限で切っても示さないのは palette の 1 か所
- **リスク/影響**: 過去の行は所在ごとに数百件ありうる。短い語では目当てが 51 件目以降に落ちても気づけず、「無い」と誤読しやすい
- **推奨アクション**: 切った件数を一緒に返し、一覧の下に「ほかに N 件あります。語を足して絞ってください。」を出す (文言は `PALETTE_LABELS`)。テストを足す
- **根拠**: spec FR-007 ([ASSUMED] 50 件)、R-2 FR-038 の前例、UX-7
- **scope 根拠**: 本 PR の touched files

### [Medium] Command palette の入口が Ctrl+K だけで、画面のどこにも示されない (M-007) (scope: feature)

- **観察**:
  - palette を開けるのは `window` の Ctrl+K だけ (`CommandPalette.tsx:79-89`)。サイドバー・中央のヘッダ・設定に開くボタンが無い
  - 操作の候補には `keys` (ショートカットの表示) を渡していない (`CommandPalette.tsx:162-175`)。element は `keys` を描ける (`command-palette.tsx:230-245`)
  - 会話内検索のボタンは `aria-keyshortcuts="Control+F"` を持つが、`title` は「会話内を検索」だけで、Ctrl+F は目に見えない (`ConversationSearchBar.tsx:76-78`)
- **同種事象探索**: renderer の中を `Control\+K|aria-keyshortcuts` で探すと、`aria-keyshortcuts` は 1 件 (`ConversationSearchBar.tsx:78`)、`Control+K` は 0 件。文言の表を `ショートカット|Ctrl|キーボード` (`features/**/*.ts`) で探すと 0 件
- **リスク/影響**: 知らなければ palette の存在に気づけない。マウントの利用者は開く手段が無い。US-3 の価値 (分かれた入口を 1 つにまとめる) が見つけられない形になる
- **推奨アクション**:
  - 最小案: サイドバーの「新規起動」の近くに「コマンド (Ctrl+K)」の ghost のボタン (`aria-keyshortcuts="Control+K"`) を置く
  - 会話内検索のボタンの `title` を「会話内を検索 (Ctrl+F)」にする
  - palette の `chat:search` の候補に `keys` を渡す
  - 文言は `shell/labels.ts` / `chat/labels.ts` に置く
- **根拠**: spec US-3 (Why this priority)、AD-046 Consequences (palette の操作)、UX-7
- **scope 根拠**: 本 PR の touched files

### [Low] palette の 0 件の文言が「操作」としか言わず、セッションの探す範囲と過去の一覧の取得中・失敗を示さない (L-001) (scope: feature)

- **観察**:
  - 語があるときはセッションも候補になるが、0 件の文は「一致する操作はありません。」(`shell/labels.ts:55-56`、`CommandPalette.tsx:184-189`)
  - 過去の候補は `useSessionsStore` の索引から作る (`CommandPalette.tsx:213-227`)。索引が `null` (取得中・失敗) なら、何も言わずに候補が 0 になる
  - Thread search は「読み込み済みの」と範囲を示しており (`session-list/labels.ts:208`)、2 つの検索で言い方が揃っていない
- **推奨アクション**: 「一致する操作やセッションはありません。」と「セッションは読み込み済みの一覧から探します。」にする。spec US-3 AC6 と data-model §5 の字面も直す
- **根拠**: spec FR-008、UX-1 / UX-9

### [Low] 0 件のとき「0 / 0 件」と空の状態が重ねて出て、次へ / 前へも押せるまま (L-002) (scope: feature)

- **観察**:
  - 会話内検索の位置の文は、0 件でも「0 / 0 件」と出る (`ConversationSearchBar.tsx:31-33`)。その下に空の状態も出る (`:50-60`)。次へ / 前へは 0 件でも有効 (`conversation-search.tsx:92-112`)
  - テスト `ConversationSearch.test.tsx:399` は「0 / 0 件」を固定している
  - Thread search でも、`search-empty` と並んで「0 件が一致」(`SessionListScreen.tsx:1131`) が出る
- **推奨アクション**: 0 件のときは位置の文を「0 件」にするか出さない。移動のボタンは `disabled` にする
- **根拠**: UX-9

### [Low] 「まだ記録がありません。」が、直近 30 日の外 (31〜90 日) に記録があるときも出る (L-003) (scope: feature)

- **観察**: `ok` で 2 つの回数が 0 なら `usageEmpty` を出す (`PresetPanel.tsx:220-224`、`session/labels.ts:481-482`)。DTO が返すのは 30 日の合計だけ (data-model.md:274-277,302) なので、31〜90 日の記録があっても「まだ記録がありません」になる
- **推奨アクション**: 「直近 30 日の起動はありません。」にする (見出し「直近 30 日の起動」と揃う)。data-model §5 も直す
- **根拠**: UX-1

### [Low] palette の element に英小文字の `esc` を直書きしていて、文言の表の「Esc」と表記が揺れる (L-004) (scope: feature)

- **観察**: `command-palette.tsx:168-177` に `esc` を直書きしている (`aria-hidden`)。文言の表は「Esc で閉じてください」(`shell/labels.ts:56`)。AD-045 の基準線の式は日本語だけを数えるので、この直書きは数に入らない
- **推奨アクション**: `CommandPaletteLabels` に `escHint` を足し、`shell/labels.ts` から「Esc」を渡す
- **根拠**: AD-045 Decision 2、UX-6 / UX-9

### [Low] 稼働中のセッションは作業フォルダとランタイムの名前でしか palette に当たらず、会話の語で探すと同じ会話の「過去」(読み取り専用) だけが出る (L-005) (scope: feature)

- **観察**: 稼働中のセッションを照合するのは、作業フォルダとランタイムの表示名だけ (`session-search.ts:145-157`、`palette-commands.ts:166-192`)。過去の候補は題・最初のプロンプトなどで当たる (`palette-commands.ts:194-223`)。Edge Cases (spec.md:195) のとおり、同じ会話は両方の一覧に載りうる。最初のプロンプトの語で探すと「過去」の候補だけが出て、選ぶと実行中ではなく読み取り専用の過去ログが開く
- **推奨アクション**: 稼働中の候補の照合に、ストアにある最初の user の本文を加える。広げないなら、data-model §1 と palette の候補の補足に「稼働中はフォルダ・ランタイムの名前で探す」と示す
- **根拠**: spec FR-007、UX-7

### [Low] M-001〜M-005 の経路にテストが無いか、テストが誤った振る舞いを固定している (L-006) (scope: feature) [H]

- **観察**:
  - M-001: `ConversationSearch.test.tsx:389-399` が、範囲を言わない文言を期待値にしている
  - M-002: 過去ログの状態を `'ready'` に固定していて (`ConversationSearch.test.tsx:42`)、取得中・失敗の組み合わせが 0 件
  - M-003: `SessionListScreen.test.tsx:1748-1780` の語 `zzzz` はどこにも一致しない
  - M-004: `SessionListScreen.test.tsx:1782-1790` は件数の文言を見ていない
  - M-005: `PresetPanel.test.tsx:188-193` と `launch-usage-service.test.ts:197` が食い違っている
- **既存の振る舞いを壊していないと言える根拠** (観察したもの):
  - 古い composer の文言 (`Message input|Send a message`) は `*.{ts,tsx,mjs}` で 0 件で、E2E / perf の locator にも残っていない
  - `filtered-out` の文言とボタンは変わっていない (`SessionListScreen.tsx:1330-1344`、テスト `:1759`)
  - AD-045 の直書きの基準線は 331 → 331
- **observability**: 会話内検索と palette の 0 件はログに残らない (renderer の表示状態なので要らない)。将来版の記録で計測が止まったことは、main のログの `schema-version-unknown` (`launch-usage-service.ts:76`) でしか分からない
- **推奨アクション**: M-001〜M-005 を直すときに、上のテストを同じ PR で直すか足す
- **根拠**: reviewer-base の H の規則

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `searchNone\|paletteNone\|searchEmpty\b\|usageEmpty\b\|usageUnreadable\b` (renderer、テストを除く) | 5 種 (範囲を示すのは 1 種) | `chat/labels.ts:102-103`、`session-list/labels.ts:208`、`shell/labels.ts:55-56`、`session/labels.ts:481,484` |
| M-002 | `<ConversationSearchProvider` (renderer、テストを除く) | 2 (取得の状態を持つのは 1) | `CenterPane.tsx:93`、`CenterPane.tsx:175` |
| M-003 | 空の状態の分岐 (`emptyNotice`) | 1 か所 (絞り込みを考えない断言は 1 件) | `SessionListScreen.tsx:1094`、`:1321-1328` |
| M-004 | `countText\(\|searchCount\(` (renderer、テストを除く) | 3 (coverage を通らないのは 1) | `SessionListScreen.tsx:277`、`:663`、`:1131` |
| M-005 | `newer-version` の扱い (service / store / テスト) | 3 | `launch-usage-service.ts:75-79`、`launch-usage-store.ts:118,159`、`launch-usage-service.test.ts:197` |
| M-006 | `PALETTE_MAX_CANDIDATES` / `上限で打ち切りました` | 2 / 1 (前例) | `palette-commands.ts:98,236-239`、`SessionListScreen.tsx:675` |
| M-007 | `aria-keyshortcuts` / `Control\+K` (renderer) / `ショートカット\|Ctrl\|キーボード` (`features/**/*.ts`) | 1 / 0 / 0 | `ConversationSearchBar.tsx:78` |
| L-001 | `paletteNone` | 1 | `shell/labels.ts:55`、`CommandPalette.tsx:186` |
| L-002 | 0 件の位置の文 | 2 | `ConversationSearchBar.tsx:31-33`、`SessionListScreen.tsx:1131` |
| L-003 | `usageEmpty` | 1 | `PresetPanel.tsx:222` |
| L-004 | `esc` の直書き (element) | 1 | `command-palette.tsx:176` |
| L-005 | `runningSessionMatches` の照合の対象 | 1 | `session-search.ts:152-155` |
| L-006 | 上の各経路のテスト | 5 | `ConversationSearch.test.tsx:42,389-399`、`SessionListScreen.test.tsx:1748-1790`、`PresetPanel.test.tsx:188-193`、`launch-usage-service.test.ts:197` |

## Verdict

- Critical: 0
- High: 0
- Medium: 7
- Low: 6

関連ファイル (絶対パス):
- C:\dev\closta\src\renderer\src\features\chat\labels.ts
- C:\dev\closta\src\renderer\src\features\chat\ConversationSearchBar.tsx
- C:\dev\closta\src\renderer\src\features\chat\ConversationSearchProvider.tsx
- C:\dev\closta\src\renderer\src\features\chat\useConversationSearch.ts
- C:\dev\closta\src\renderer\src\features\chat\conversation-search.ts
- C:\dev\closta\src\renderer\src\features\shell\CenterPane.tsx
- C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx
- C:\dev\closta\src\renderer\src\features\session-list\labels.ts
- C:\dev\closta\src\renderer\src\features\session\PresetPanel.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\main\app\launch-usage-service.ts
- C:\dev\closta\src\main\infra\settings\launch-usage-store.ts
- C:\dev\closta\src\renderer\src\features\shell\CommandPalette.tsx
- C:\dev\closta\src\renderer\src\features\shell\palette-commands.ts
- C:\dev\closta\src\renderer\src\features\shell\labels.ts
- C:\dev\closta\src\renderer\src\components\assistant-ui\elements\command-palette.tsx
- C:\dev\closta\src\renderer\src\components\assistant-ui\elements\conversation-search.tsx
- C:\dev\closta\src\renderer\src\features\search\session-search.ts
- C:\dev\closta\specs\012-ui-thread-search\data-model.md
