# po-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-06T00:00:00+09:00 (時刻は取得していない。日付だけが正確)
**Reviewer**: po-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 4 (前 Round = `specs/012-ui-thread-search/design-gate.md.20261006T212011` (R3) と `po-reviewer.design-gate.md` (R3))

## 初回読了 viewpoint

- FR/SC:
  - US-1: FR-001 / FR-002 / FR-017 / FR-018
  - US-2: FR-003〜FR-005
  - US-3: FR-006 / FR-007
  - Empty state: FR-008
  - US-4: FR-009〜FR-013
  - 記録の追随: FR-014〜FR-016
  - SC-001〜SC-008
  - 本 Round で文面が変わった箇所:
    - Clarifications 2026-10-06 の 3 問 (`spec.md:96-100`)
    - US-4 AC8 (`spec.md:181`)
    - FR-009 (`spec.md:265-266`)
    - FR-010 (`spec.md:271`)
    - FR-016 の session charter の注記 (`spec.md:303`)
    - SC-005 を AC1〜AC8 に変更 (`spec.md:336`)
    - data-model §4「renderer の起動元」「書き込み」「表示」(`data-model.md:223,243-256,263`)
    - research R-05 (`research.md:80`)
    - plan (`plan.md:153,197`)
    - FE-040 (`tasks.md:97-98`)
- touched files に該当する charter / Confirmation:
  - session charter KPI「再利用率」(`docs/domains/session/charter.md:163-164`)。FR-016 で文言と注記を改める対象
  - ui charter: Scope「Thread 検索…」(`docs/domains/ui/charter.md:52`) と「面の状態」(`:173-180`)
  - AD-041 (h): O-3 を計測経路の持ち主に指名している (`docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md:148`)
  - AD-045 Consequences / Confirmation (`docs/decisions/0045-ui-labels-no-i18n-resources.md:34-36,45-48`)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲 (KPI の判別力は SC の計測可能性として E で扱う)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の Owner 範囲
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:4 Low:7
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の Owner 範囲
- G. optional reviewer 範囲: 該当なし: po-reviewer は optional reviewer ではない (フォーカスと空の状態の文言は、UX flow の入口と出口に限って E で扱う)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:2

## スコープ要約

R3 の後に designer が直したのは、gate の H-04 (起動元の引き継ぎ)、M-13 (受け付けの後の失敗の再試行)、M-01 (KPI の期間と最低件数) の 3 件である。3 件とも利用者が 2026-10-06 に回答し、その結果が Clarifications に記録されている (`spec.md:96-100`)。

本 Round で見た点は 3 つ:
- H-04 の手当てが、KPI の判定を両方向の偏りなしに支えるか
- R3 の po の指摘が残っているか
- 変わった文面から新しく生じた負のシナリオと、計測経路の追随

R3 の po の Medium・Low のうち、M-001 を除く 12 件は文面が変わっていない (下の各指摘で確かめた)。

**前 Round の High H-04 は解消した。** 根拠:
- 規則が「初期値の設定のまま起動したときだけ引き継ぐ」に狭まった。書いてある箇所は `data-model.md:246-248,251-254`、`spec.md:265-266`、`research.md:80`、`plan.md:197`
- 負の AC として US-4 AC8 (`spec.md:181`) が足された
- FE-040 のテスト (`tasks.md:98`) に、次の 2 つが足された:
  - 「preset で起動 → 開き直して軸を 1 つ変える → `manual`」
  - 「preset → manual → manual → preset」の並び
- 引き換え (拒否の後に軸を直して再試行した起動は `manual`) が書かれている (`spec.md:266`、`data-model.md:254`)
- 実装の前提も確かめた:
  - 起動の経路は `LaunchDialog.tsx:354` の 1 か所だけ (renderer の本番コードを `\.launch\(|launchSession\(` で検索して 3 件。`LaunchDialog.tsx:354` / `running-session-store.ts:368` / `RunningSessionsProvider.tsx:70`。どれもこの 1 本の経路の段)
  - 「手で変えた」の判定に使う `update` を呼ぶのは、6 つの軸の `onChange` だけ (`LaunchDialog.tsx:431,485,502,550,569,589`)
  - `useEffect` から下書きを書き換える経路は無い (`LaunchDialog.tsx:110,150` はどちらも取得だけ)
  - よって、data-model の「依存解決の自動の reset は『手で変えた』に数えない」はコードの構造と合う

## Findings

### [Medium] 将来版のファイルが「読めない」に畳まれ、「次に起動ダイアログを開いたときに読み直します」と約束するが、読み直しは起きない (R3 M-002 / gate M-02。unresolved from prev (M-002)) (M-002) (scope: feature)

- **観察**:
  - 将来版は書き込まない (`data-model.md:214`)。読み込み済みになったら再読しない (`:218`)。読み直すのは `readFailed` だけ (`:215`)
  - DTO は 2 つを同じ `unreadable` にまとめる (`data-model.md:236`)。ヒントは両方とも `usageUnreadableHint`「次に起動ダイアログを開いたときに読み直します。」(`:312`)
  - FE-041 のテスト (`tasks.md:99`) は 4 つの表示を見るだけで、2 つを区別しない。US-4 AC4 (`spec.md:177`) にも将来版の行が無い
- **同種事象探索**: `storeNewerVersion|usageUnreadableHint|読み直します|usageEmpty` (specs/012 の 6 文書) で 7 件 (`data-model.md:214,236,262,309,310,312` / `tasks.md:99`)。2 つを区別する表示は 0 件
- **リスク/影響**: 表示が事実と違う。回復の手段 (アプリを上げる・ファイルを退避する) が示されないまま、記録が黙って止まる (PO-6)
- **推奨アクション**: DTO に `newer-version` を分けるか、ヒントを両方に当てはまる文にする。将来版には `docs/discovery.md` の消し方を示す。US-4 AC4 と FE-041 に将来版の行を足す
- **根拠**: PO-4 / PO-6
- **scope 根拠**: data-model §4 / §5 と FE-041 の文面で直せる

### [Medium] 過去ログの取得中と取得の失敗の間に、会話内検索が 0 件の文言「一致する箇所はありません」を出す (R3 M-003 / gate M-03。unresolved from prev (M-003)) (M-003) (scope: feature)

- **観察**:
  - provider は会話を出しているとき (`shown` が `running` / `past`) に中央を包む (`data-model.md:109`)。過去の供給元は `useTranscript()` の `messages` (`:106`)
  - `useTranscript` は `loading` / `failed` / `empty` の状態を持つ (`src/renderer/src/features/chat/ChatScreen.tsx:77,100,112,116`)
  - §2「開く・閉じる・キー」(`data-model.md:150-156`) に、この 3 つの状態のときの検索のボタンと Ctrl+F の扱いが無い
- **同種事象探索**: `loading|failed|取得中|読み込み中|取得の失敗|フォーカス` (data-model.md) で 8 件 (`:77,152,180,185,262,308,332`)。会話内検索の文脈で取得の状態を扱う記述は 0 件
- **リスク/影響**: 失敗を「一致なし」と誤認させる。取得中に入れた語の件数が、0 から急に増える
- **推奨アクション**: `loading` / `failed` の間は検索のボタンを無効にするか、バーに状態の文言を出す。US-2 に AC を 1 つ、FE-026 にテストを足す
- **根拠**: PO-4
- **scope 根拠**: data-model §2 と FE-026 で直せる

### [Medium] 会話内検索のバーを開いたときと閉じたときのフォーカスの行き先が無い (R3 M-004 / gate M-04。unresolved from prev (M-004)) (M-004) (scope: feature)

- **観察**:
  - 開くときに書かれているのは「開いていれば入力欄にフォーカスを移すだけ」(`data-model.md:152`) だけである
  - 閉じたときの規則 (`:156`) は、強調とスクロール位置しか定めない。US-2 AC6 (`spec.md:139`) も同じ
  - 対照: palette は戻り先を定めている (`spec.md:241`、`data-model.md:185`)
- **同種事象探索**: `フォーカス` (data-model.md) で 3 件 (`:152,180,185`)。会話内検索を閉じた後の行き先は 0 件
- **リスク/影響**: composer から Ctrl+F で開いて Esc で閉じたとき、キーボードだけの利用者が戻る先が実装任せになる
- **推奨アクション**: FR-003 に次を書く。開いたら入力欄へ。閉じたら開く前の要素へ (消えていれば中央のヘッダの検索のボタン)。US-2 AC6 と FE-026 に足す
- **根拠**: PO-6
- **scope 根拠**: FR-003 / data-model §2 / FE-026 で直せる

### [Medium] Command palette と会話内検索の入口がショートカットだけで、画面上の手がかりが無い (R3 M-005 / gate M-05。unresolved from prev (M-005)) (M-005) (scope: feature)

- **観察**:
  - palette の開き方は Ctrl+K だけである (`spec.md:155,241`)
  - §5 の文言の表 (`data-model.md:279-312`) に、palette を開くボタンもショートカットの表記も無い
  - 検索のボタンの `searchOpen` (`:290`) にも Ctrl+F の表記が無い
  - US-3 の Why は「入口を 1 つにまとめる」(`spec.md:149`)
- **同種事象探索**: `aria-keyshortcuts|\(Ctrl\+K\)|\(Ctrl\+F\)|ショートカット` (specs/012 の 6 文書) で 0 件
- **リスク/影響**: P2 の Story が、存在を知らない利用者に届かない
- **推奨アクション**: palette を開くボタン・ツールチップの「(Ctrl+K)」「(Ctrl+F)」・`aria-keyshortcuts` のどれかを §3 / §5 に書く。入れないなら、理由と持ち主を Out of Scope に書く
- **根拠**: PO-6 / PO-1
- **scope 根拠**: data-model §3 / §5 で直せる

### [Medium] (H) US-4 の renderer → preload → main を通しで確かめるテストが無い。preload が起動元を落としても型検査は通り、main は黙って記録しないので、KPI の計測経路が緑のまま 0 件になりうる (R3 M-006 / gate M-06。unresolved from prev (M-006)) (M-006) (scope: feature)

- **観察**:
  - E2E のタスクは SH-010 / SH-020 / SH-030 だけ (`tasks.md:47,67,80`)。plan の E2E (`plan.md:216`) にも US-4 のケースが無い
  - BE-043 は E2E のメモリ内の fake を配線する (`tasks.md:94`) が、それを使うテストが無い
  - SC-005 の計測経路 (`spec.md:336`) は単体と component テストだけ
  - main は起動元の欠落を「記録だけしない」と扱う (`spec.md:270`)。単体テストはこれを正しい振る舞いとして固定する (`tasks.md:95`)
  - ログを出すのは読み込みと書き込みの失敗だけ (`data-model.md:265-267`)。起動元の欠落・未知では何も出ない
  - **追加事実 (本 Round)**:
    - 今の preload は `launchSession: (config) => ipcRenderer.invoke(IPC_CHANNELS.launchSession, config)` である (`src/preload/index.ts:58`)
    - capability の型を `launchSession(config, origin)` に広げても (`src/domain/capability.ts:122`)、引数の少ない arrow は TypeScript の代入規則で型検査を通る。preload の更新漏れを `tsc` は捕まえない
    - preload の単体テストは無い (`src/preload/**/*.test.ts` は 0 件)
    - FE-040 のテストは capability の境界まで (`tasks.md:98`「capability の `launchSession` に起動元が届く」)。BE-043 のテストは `handleLaunchSession` から先である。preload の 1 行を確かめるテストはどこにも無い
- **同種事象探索**: `e2e/|E2E` (tasks.md) で 12 件。US-4 の E2E のケースは 0 件。`src/preload/**/*.test.ts` で 0 件
- **リスク/影響**:
  - 単体テスト・型検査・component テストがすべて緑のまま、プリセットの欄がずっと「まだ記録がありません」になりうる
  - 症状は「起動していない」と区別できず、main のログにも原因が残らない
  - AD-041 (h) が O-3 に預けた計測経路が黙って機能しない
  - 重大度を Medium に据え置いた理由: BE-043 が preload の変更を明示しているので、本 Round の時点では実害ではなくカバレッジの穴にとどまる
- **推奨アクション**:
  - `e2e/launch-dialog.spec.ts` に 1〜2 ケース足し、SC-005 の計測経路に E2E を加える。ケース: 適用して起動 → 開き直す → 「プリセットを適用 1 回 / 適用なし 0 回」が出る。もう 1 つは H-04 で決めた引き継ぎ (開き直して初期値のまま起動 → 2 回)
  - E2E を足さないなら、次の 2 つの両方を入れる。どちらか片方では、更新漏れを捕まえるか原因を残すかのどちらかが欠ける
    - preload の構造のテスト (第 2 引数を invoke に渡すこと)
    - main が起動元の欠落・未知を理由キー (`origin-missing` / `origin-unknown`) だけで 1 回ログに出すこと (値は出さない)
- **根拠**: base H (検出できるテスト・観測点) / PO-2
- **scope 根拠**: tasks (SH 系の E2E) と data-model §4「ログ」で直せる

### [Low] AC / SC と文言の表の語が揃っていない。受け付けの後の失敗の再試行を別の 1 回に数える決定 (M-13) も、AC に無い (R3 L-001 / gate L-01。unresolved from prev (L-001)) (L-001) (scope: feature)

- **観察**:
  - US-4 の AC2 / AC4 / AC7 / AC8 と Clarifications は「手動」(`spec.md:87,175,177,180,181`)。表示は「適用なし」(`data-model.md:307`)
  - SC-004 は「語を消す操作」(`spec.md:335`)。FR-008 と US-1 AC3 は「語と絞り込みをすべて解除する」(`spec.md:116,255`)
  - AC3「拒否・失敗した (起動ゲートでの拒否)」(`spec.md:176`) から、本 Round の決定が読み取れない。決定は「受け付けの後に失敗し、再試行した起動は別の 1 回に数える」で、FR-010 (`spec.md:271`) にだけある
- **同種事象探索**: `手動` (spec.md の US-4) で 5 件 (`:87,175,177,180,181`)。`語を消す操作` で 1 件 (`:335`)
- **推奨アクション**:
  - AC の語を文言の表に揃える
  - SC-004 を「語と絞り込みをすべて解除する操作」にする
  - AC3 を「起動ゲートで拒否された・起動に失敗した」にし、正の AC として「受け付けの後に失敗して再試行した起動は 2 回に数える」を 1 つ足す
- **根拠**: PO-3

### [Low] 記録が 31 日より前にだけあるときも「まだ記録がありません」と出る (R3 L-002 / gate M-02 に統合。unresolved from prev (L-002)) (L-002) (scope: feature)

- **観察**:
  - `ok` で 2 つとも 0 のときは `usageEmpty`「まだ記録がありません。」(`data-model.md:262,309`)
  - 鍵の数による刈り込みでは、使う日が疎らなら 90 暦日より前の日も残る (`data-model.md:203`)
- **同種事象探索**: `usageEmpty` で 3 件 (`data-model.md:262,309` / `tasks.md:99`)
- **推奨アクション**: 文言を「直近 30 日の起動はありません。」にする
- **根拠**: PO-3

### [Low] palette の候補を上限の 50 件で切ったことが利用者に示されない (R3 L-003 / gate L-02。unresolved from prev (L-003)) (L-003) (scope: feature)

- **観察**: 上限は 50 件 (`spec.md:250`、`data-model.md:176`)。過去の一覧は数百件ある (`plan.md:28`)。切ったことを示す文言が §5 に無い
- **同種事象探索**: `50 件` で 4 件 (`spec.md:250,327` / `data-model.md:176` / `tasks.md:75`)
- **推奨アクション**: 切ったときに「ほか N 件。語を足して絞り込んでください」を 1 行出す。FE-030 に足す
- **根拠**: PO-4

### [Low] US-3 の価値を確かめる観測が quickstart に無い (R1 から残る。R3 L-004 / gate L-03。unresolved from prev (L-004)) (L-004) (scope: feature)

- **観察**: V-3 (`quickstart.md:23-30`) の palette の確認は IME の 1 行 (`:25`) だけ。US-1 には価値の観測 (`:28`) がある
- **同種事象探索**: `palette|Ctrl\+K` (quickstart.md) で 1 件 (`:25`)
- **推奨アクション**: V-3 に 1 行足す:「サイドバーと設定を開かずに、palette から目当てのセッションを開き、設定の項目を開けたか」
- **根拠**: PO-1

### [Low] Thread search の件数が、取得の途中でも「{n} 件が一致」と出て範囲を示さない (R3 L-005 / gate L-04。unresolved from prev (L-005)) (L-005) (scope: feature)

- **観察**: 0 件の文言は「読み込み済みの」と範囲を示す (`data-model.md:285`)。一方、`searchCount(n)` (`:283`) は範囲を示さない
- **同種事象探索**: `searchCount|読み込み済み` (data-model.md) で 3 件 (`:77,283,285`)
- **推奨アクション**: `coverage` が complete でないときは、件数に「(読み込み済みの範囲)」を添える
- **根拠**: PO-4

### [Low] 所在がすべて読めないときに語を入れると、`search-empty` が `all-unlisted` を隠し、出口が「検索と絞り込みをすべて解除する」になる (R3 L-007 / gate L-27。unresolved from prev (L-007)) (L-007) (scope: feature)

- **観察**:
  - `search-empty` は 2 番目、`all-unlisted` 以降は 4 番目以降 (`data-model.md:70-75`)
  - `folder` のグループは登録フォルダから必ず作られる (`src/renderer/src/features/session-list/SessionListScreen.tsx:816`)。行が 0 件 (`:811`) でも、語を入れれば区画が 0 になって `search-empty` が出る
  - 本 Round で既存のコードを確かめ直した。既存の `filtered-out` も同じく `all-unlisted` より先に判定する (`SessionListScreen.tsx:848` の後に `:852`)。つまり `search-empty` の優先順位は、既存の前例に揃っている
- **同種事象探索**: `search-empty` (data-model / tasks) で 5 件 (`data-model.md:68,73,77,311` / `tasks.md:43`)。読み込んだ行が 0 件のときの扱いは 0 件
- **リスク/影響**: 失敗を「一致なし」と読ませ、出口が回復の操作 (取り直す) ではなく解除になる。軽いのは、「列挙の結果」の失敗の行がスクロールの領域に残るためである
- **推奨アクション**: 次のどちらかにする
  - `total === 0` のときは `search-empty` と `filtered-out` の両方を飛ばし、索引の状態を出す。FE-012 に「すべての所在が失敗 + 語あり → `all-unlisted`」を足す
  - 既存の前例に揃えたままにし、§1 の空の状態の表に「受け入れた判断」として理由を 1 行書いて閉じる
- **根拠**: PO-4 / PO-6

### [Low] spec の US-4 の Independent Test と SC-005 の計測経路に、起動元の規則 (AC6〜AC8) を確かめる起動ダイアログの component テストが入っていない (L-008) (scope: feature) [new]

- **観察**:
  - SC-005 は「US-4 の AC1〜AC8 のとおり」と言う。しかし計測経路 (`spec.md:336`) に並ぶのは次の 4 つだけである:
    - domain の純関数
    - store / service の単体
    - `handleLaunchSession` の単体
    - プリセットの欄の component テスト
  - US-4 の Independent Test (`spec.md:170`) も同じ並びである
  - AC6〜AC8 (H-02 / H-04 の結論) を確かめるのは、起動ダイアログの component テスト (FE-040。`tasks.md:98`) だけである。tasks の Independent Test (`tasks.md:86`) と plan (`plan.md:215`) には書かれているが、spec の 2 か所には無い
- **同種事象探索**: `起動ダイアログ.*(component|テスト)|component テスト.*起動ダイアログ|FE-040` (spec / plan / tasks / quickstart) で 5 件 (`tasks.md:11,86,97,114,125`)。spec.md は 0 件
- **リスク/影響**: 本 Round の主題 (H-04) の AC を判定する手段が、SC の計測経路から辿れない。tasks に残っているので、実害は小さい
- **推奨アクション**: SC-005 の計測経路と US-4 の Independent Test に「起動ダイアログの component テスト (起動元の表の各行と、AC7 / AC8 の並び)」を足す
- **根拠**: PO-2 / PO-3
- **scope 根拠**: spec の 2 行で直せる

### [Low] (H) E2E の偽の capability が過去の一覧を返すようになることが、O-8 に送る「基準の変化」に入っていない (R3 L-006 / gate L-05。unresolved from prev (L-006)) (L-006) (scope: feature)

- **観察**:
  - BE-010 (`tasks.md:37`、`data-model.md:340-350`) で、E2E の過去の一覧が空から 6 行になる
  - 基準の変化として並べているのは、検索欄による描画の変化だけである。並べている箇所は、spec の「義務の扱い」(`spec.md:64`) と申し送り #4 (`plan.md:143`)
  - SH-040 (`tasks.md:103`) にも固定データの記述が無い
- **同種事象探索**: `基準の変化` (specs/012) で 3 件 (`spec.md:45,64` / `plan.md:143`)。固定データを基準の変化とする記述は 0 件
- **推奨アクション**: SH-040 で、O-8 の行に「O-3 で E2E の偽の capability が過去の一覧に 6 行を返すようになった (BE-010)」を足す
- **根拠**: base H (比較の基準の維持)

### [Low] (H) quickstart V-2 が、FR-016 で session charter に足す KPI の注記 (判定の期間・最低件数と判定の時期を持たないこと・数える単位) を確かめない (L-009) (scope: feature) [new]

- **観察**:
  - 本 Round で、FR-016 (`spec.md:303`) と plan の申し送り #14 (`plan.md:153`) に、session charter の KPI の注記が足された。中身は 3 つ:
    - 判定は直近 30 日の 2 つの回数で行う
    - 最低件数と判定の時期は持たない
    - 数える単位は受け付けた起動の要求
  - SC-007 の計測経路である V-2 (`quickstart.md:20`) が確かめるのは、KPI の文言と計測経路の 2 点だけである
- **同種事象探索**: `最低件数|判定の時期|受け付けた起動の要求|直近 30 日` (specs/012 の 6 文書) で 12 件 (`spec.md:36,87,99,100,166,177,271,282,303,327` / `data-model.md:223,263,306` / `plan.md:153`)。quickstart.md は 0 件
- **リスク/影響**: 利用者が 2026-10-06 に選んだ KPI の判定の条件が、charter に書かれたかを確かめる手順が無い。書き漏れても、SC-007 は通ってしまう
- **推奨アクション**: V-2 の KPI の行に「計測経路の注記に、判定の期間 (直近 30 日)・最低件数と判定の時期を持たないこと・数える単位 (受け付けた起動の要求) がある」を足す
- **根拠**: base H / PO-2

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (H-04 の解消の確認) | `軸を変えても\|付いて回\|lastOrigin` (specs/012 の 6 文書) | 15。「軸を変えても」引き継ぐ記述は 0 (同じダイアログの中の U-6 を除く) | data-model.md:245-256 / spec.md:78,86,265,266 / research.md:80 / plan.md:197 / tasks.md:97 |
| (H-04 の前提) | `update\(\|setDraft\(\|useEffect\(` (LaunchDialog.tsx) | 11 (`update` の呼び出しは 6 つの軸の `onChange` だけ) | LaunchDialog.tsx:110,150,315,319,326,431,485,502,550,569,589 |
| M-002 | `storeNewerVersion\|usageUnreadableHint\|読み直します\|usageEmpty` | 7 (区別 0) | data-model.md:214,236,262,309,310,312 / tasks.md:99 |
| M-003 | `loading\|failed\|取得中\|読み込み中\|取得の失敗\|フォーカス` (data-model.md) | 8 (会話内検索の取得の状態 0) | data-model.md:77,152,180,185,262,308,332 |
| M-004 | `フォーカス` (data-model.md) | 3 (閉じた後の行き先 0) | data-model.md:152,180,185 |
| M-005 | `aria-keyshortcuts\|\(Ctrl\+K\)\|\(Ctrl\+F\)\|ショートカット` | 0 | — |
| M-006 | `e2e/\|E2E` (tasks.md) / `src/preload/**/*.test.ts` | 12 (US-4 の E2E 0) / 0 | tasks.md:47,67,80,94 / plan.md:216 / src/preload/index.ts:58 |
| L-001 | `手動` (spec.md の US-4) / `語を消す操作` | 5 / 1 | spec.md:87,175,177,180,181 / spec.md:335 |
| L-002 | `usageEmpty` | 3 | data-model.md:262,309 / tasks.md:99 |
| L-003 | `50 件` | 4 | spec.md:250,327 / data-model.md:176 / tasks.md:75 |
| L-004 | `palette\|Ctrl\+K` (quickstart.md) | 1 | quickstart.md:25 |
| L-005 | `searchCount\|読み込み済み` (data-model.md) | 3 | data-model.md:77,283,285 |
| L-006 | `基準の変化` | 3 (固定データ 0) | spec.md:45,64 / plan.md:143 |
| L-007 | `search-empty` (data-model / tasks) | 5 (行が 0 件のときの扱い 0) | data-model.md:68,73,77,311 / tasks.md:43 |
| L-008 | `起動ダイアログ.*(component\|テスト)\|component テスト.*起動ダイアログ\|FE-040` | 5 (spec.md 0) | tasks.md:11,86,97,114,125 |
| L-009 | `最低件数\|判定の時期\|受け付けた起動の要求\|直近 30 日` | 12 (quickstart.md 0) | spec.md:303 / plan.md:153 / data-model.md:263 ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 5
- Low: 9
- Round inheritance: resolved from 3: 2 / unresolved: 12 / new: 2
  - **前 Round の High H-04 (po R3 H-001) は resolved from prev。** 規則は「初期値の設定のまま起動したときだけ引き継ぐ」に狭まった。AC8、FE-040 の負のテストと並びのテスト、引き換えの記述も揃っている (根拠はスコープ要約)
  - resolved (2):
    - R3 H-001 (gate H-04)
    - R3 M-001 (gate M-01)。KPI の判定の期間は直近 30 日、最低件数と判定の時期は持たない、と利用者の選択で明記された (`spec.md:100,303`、`data-model.md:263`、`plan.md:153`)。R3 で出した推奨のうち「持たないなら『持たない』と明記する」を満たす
    - 参考: gate M-13 (analyze が出所) は、数える単位として `spec.md:99,271` と `data-model.md:223` で決着した。AC に無い点は L-001 に残した
  - unresolved (12): R3 M-002〜M-006 → 本 Round の M-002〜M-006、R3 L-001〜L-007 → 本 Round の L-001〜L-007 (ID は R3 のまま)。severity はすべて前 Round のまま。M-006 には preload と型検査の追加事実を書いたが、格上げはしていない
  - new (2): L-008 (spec の SC-005 と Independent Test に起動ダイアログの component テストが無い)、L-009 (V-2 が KPI の注記を確かめない)。どちらも本 Round で足された AC8 / FR-016 の文面から生じた

### 関連ファイル

- C:\dev\closta\specs\012-ui-thread-search\spec.md
- C:\dev\closta\specs\012-ui-thread-search\data-model.md
- C:\dev\closta\specs\012-ui-thread-search\tasks.md
- C:\dev\closta\specs\012-ui-thread-search\plan.md
- C:\dev\closta\specs\012-ui-thread-search\research.md
- C:\dev\closta\specs\012-ui-thread-search\quickstart.md
- C:\dev\closta\specs\012-ui-thread-search\design-gate.md.20261006T212011
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.tsx
- C:\dev\closta\src\preload\index.ts
- C:\dev\closta\src\domain\capability.ts
- C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx
- C:\dev\closta\src\renderer\src\features\chat\ChatScreen.tsx
- C:\dev\closta\docs\domains\session\charter.md
