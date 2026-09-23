# ux-reviewer Review: 所在をまたぐセッション列挙 (002-session-cross-folder-session-enumeration)

**Run**: 2026-09-23
**Reviewer**: ux-reviewer
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Gate**: code-gate iteration 1 (ux track)

## 初回読了 viewpoint

- FR/SC (本 track で影響を受けるもの):
  - FR-007 / FR-012 — 停止中は「未列挙」、config 不在は「履歴なし」。画面で両者が区別されるか
  - FR-025 / FR-026 / FR-028 — 未登録フォルダの畳み込み・登録導線・「作業フォルダ不明」の理由区別
  - FR-030 / FR-031 — 所在ごとの失敗行と理由キーの訳出
  - FR-032 / SC-013 — 空状態 5 条件すべてに導線
  - FR-034 / SC-012 — 取得時刻の提示と置き換えの体感
  - FR-037 — 段階描画中に件数を確定値として見せない (data-model §7 `partial → complete`)
  - FR-038 — 上限到達時の追加取得の手段
  - FR-040 — 所在とフォルダによる絞り込み
  - FR-046 / FR-047 — 日本語第一言語、内部識別子を出さない、要約が空でも識別可能
  - FR-051 / FR-052 — 履歴 0 件の登録フォルダを消さない / 由来候補 (ユーザ) の常時識別
  - SC-008 — 先頭 50 件 2 秒 (段階描画の前提)
- touched files に該当する charter / Confirmation:
  - `docs/domains/session/charter.md` (セッション一覧の読み取り専用性)、`docs/glossary.md` の **WorkspaceFolder (作業フォルダ)** / **CwdOrigin (作業ディレクトリの出自)** / **Unregistered folder (未登録フォルダ)** — 表記の一貫性は本 reviewer の K 観点で扱う
  - `quickstart-results.md` SH-089 V-6 / V-8 (段階描画中の件数・空状態の実機確認結果)
- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲。本 track は表示層のみを見た
- B. 入力検証 / injection / 暗号: 該当なし: 同上 (正規化 FR-049 の表示面は G の M-007 で表記のみ扱う)
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner 範囲
- D. Constitution / ADR drift: 該当なし: 同上
- E. User Story 価値 / SC 計測可能性 / AC: 該当なし: `po-reviewer` の Owner 範囲 (本 reviewer は実装の UX 完成度のみ)
- F. 命名 / module 配置 / lint hookup: 該当なし: `convention-reviewer` の Owner 範囲 (未使用 export `ThreadListLoading` は同 reviewer に委ねる)
- G. DB / API / a11y / perf / OpenAPI / **UX state**: Critical:0 High:5 Medium:8 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約

R-2 の読み取り専用セッション一覧画面。`SessionListScreen.tsx` が 4 種グループ (登録フォルダ / 対応づけ保留 / 未登録フォルダ / 作業フォルダ不明) を区画として描き、`Outcomes` が所在ごとの成否を行として残し、空状態 5 条件を `EmptyState` 内の分岐で出し分ける。文言は参照キー由来 (`FailureReason` / `PendingReason` / `UnknownReason` / `CwdOriginKind` / `Boundary` / `TargetStatus`) のみ `labels.ts` に `Record` で集約され、静的コピーは JSX 直書き (他 feature と同じ方針)。列挙は main 側で**所在ごとに段階公開**され (`session-service.ts:385-424`)、`complete: false` の間は「出そろっていない」ことだけを DTO が運ぶ。本レビューは空状態 / 失敗提示 / 段階描画中の表示 / 取得時刻 / 情報構造 / 文言集約の 6 点を見た。**主要な欠落は「区画の件数と行の対応」「段階描画中の確定値提示」「空状態 2 条件の到達不能」「所在絞り込みが主要コンテンツを消す」** の 4 系統に集まっている。

## Findings

### [High] セッション表題の一覧とメタデータ一覧が縦に分離しており、行と由来ユーザ (FR-052) の対応が失われる (H-001) (scope: feature)

- **観察**: `src/renderer/src/features/session-list/SessionListScreen.tsx:216-246` で、1 区画の中に
  (1) `<ThreadListItemsByKey rowKeys={section.rowKeys} />` (表題行の並び) を描き、
  **その直後に別の `<ul>`** として `section.group.sessions.map(...)` を並べている。
  `<li>` には `SourceLabel`(由来ユーザ)・`CWD_ORIGIN_LABELS[originKind]`・開始時刻・ブランチ・タグ・サイズ・worktree・SDK 由来・切り詰め表示が入る (`:232-241`)。
  DOM は「表題 N 行 → メタデータ N 行」の**逐次 2 ブロック**であり、i 番目の表題と i 番目のメタデータは視覚的に隣接しない。
  実機データでは 1 所在 278 件 (`quickstart-results.md` SH-089 実データ内訳) が 1 区画に入りうる。
- **同種事象探索**: `grep -n 'ThreadListItemsByKey|matchesLocation|ThreadListSkeleton' src/renderer/src` で `ThreadListItemsByKey` の**使用は 1 件**
  (`SessionListScreen.tsx:218`。定義 `components/assistant-ui/elements/thread-list.aui.tsx:61`、import `SessionListScreen.tsx:14`)。
  同型の「行リストとメタリストを別ブロックで並べる」実装は他 feature に **0 件** (`WorkspaceFoldersScreen.tsx` は 1 行 1 カードに畳んでいる)。
- **リスク/影響**: (a) どの行がどのユーザ (`targetLabel`) の履歴かを**画面上で対応づけられない**。FR-052 は「どのユーザの履歴を見ているかが分からない状態を作ってはならない」と定め、spec `## Assumptions` (spec.md:500-513) では**他ユーザの会話要約を 1 画面に集約することの代償 (compensating control) として FR-052 の常時表示**を人間判断で採っている。表示はあるが**帰属が読めない**ため、その代償が機能していない。
  (b) 越境・出自・ブランチ・サイズも同様に対応づけ不能で、FR-029 (worktree / programmatic の区別) が「区画のどこかに worktree という語がある」までしか意味を持たない。
  (c) `ThreadListItemsByKey` は runtime が知らない鍵を黙って落とす (`thread-list.aui.tsx:72-82`) ため、表題は N-1 行・メタデータは N 行という**行数ずれ**が段階描画の 1 tick ごとに起きる。
- **推奨アクション**: メタデータを行の中に入れる。`ThreadListItemsByKey` に per-row の子 (`renderMeta?: (rowKey) => ReactNode`) を渡せる形にするか、`ThreadListItem` に `Title` の下段としてメタ行を描く slot を持たせ、`SessionListScreen` 側の独立 `<ul>` (`:219-243`) を削除する。テストも「同一 `<li>` / 同一行内に表題と `targetLabel` が同居する」ことを見る形へ変える (現行 `SessionListScreen.test.tsx:150-156` は `getAllByText('alice').length > 0` で画面のどこかにあることしか確認していない)。
- **根拠**: FR-052 / FR-029 / spec.md:500-513 の [USER] 露出面評価 / SC-009 (行が識別可能であること) / Principle XIII (UI 構成の責務分離)
- **scope 根拠**: touched files (`SessionListScreen.tsx` / `thread-list.aui.tsx`) で直接修正可能

### [High] 区画見出しの「N 件」が `complete: false` の間も確定値として提示される (H-002) (scope: feature)

- **観察**: `SessionListScreen.tsx:197` が `<span>{count} 件</span>` を**無条件**で描く (`count = section.rowKeys.length`、`:175`)。
  `Outcomes` も `:299-301` で `status === 'ok'` の行に `{outcome.count} 件` を無条件に出す。
  ヘッダだけは `:419-423` で `complete` を見て出し分けている。
  一方 `data-model.md:374-376` は **「`partial` の間はグループ件数を確定値として見せない (FR-037 / R-06)。… 『このフォルダのセッションは 3 件』と見せると誤りになる」** と、まさにこの見せ方を禁じている (`src/domain/session/dto.ts:123-129` の doc comment も同文)。
  main は所在ごとに `commit(..., false)` → `publish()` する (`src/main/app/session-service.ts:409-418`) ので、この窓は毎回の初回取得で必ず通る。
- **同種事象探索**: `grep -n '件' src/renderer/src --glob '*.tsx'` で件数を数として提示する箇所は **4 件**:
  `SessionListScreen.tsx:197` (区画見出し・無条件)、`:300` (所在行・無条件)、`:423` (ヘッダ・`complete` で保護済み)、
  `WorkspaceFoldersScreen.tsx:594` (復元失敗件数。partial の概念が無く該当せず)。
  **要修正は 2 件** (`:197` / `:300`)。
- **リスク/影響**: 段階描画中に「このフォルダ 3 件」「Ubuntu-26.04 50 件」と読めてしまい、その直後に 278 件へ跳ねる。FR-037 が禁じている誤読そのもので、`quickstart-results.md` SH-089 V-6 の「先頭ページ表示中にグループ件数を確定値として見せていない | **成立**」という判定は根拠が `complete: false` のまま**という DTO 側の事実**であり、**UI が確定値を描いていることは確認されていない** (根拠と結論が別物)。
- **推奨アクション**: `complete === false` のときは区画・所在行の件数を「N 件以上」「取得中」等の未確定表記にするか非表示にする。`index.complete` を `Section` / `Outcomes` に渡す (現在は props に無い)。あわせて `SessionListScreen.test.tsx:104-111` を「区画見出しに `1 件` が出ないこと」まで見るよう拡張する (現行はヘッダの `全 1 件` 不在のみ)。
- **根拠**: FR-037 / data-model.md:374-376 / dto.ts:123-129 / SC-013 の前提
- **scope 根拠**: touched files で直接修正可能

### [High] FR-032 の空状態 2 条件 (「セッション 0 件」「全所在が未列挙」) が実装上ほぼ到達不能 (H-003) (scope: feature)

- **観察**: 画面レベルの `EmptyState` は `sessions.index !== null && visible.length === 0` でしか描かれない (`SessionListScreen.tsx:525`)。
  ところが `src/domain/session/group.ts:68-73, 144-151` は **`folder` グループを登録フォルダ一覧から seed** する (FR-051)。したがって登録フォルダが 1 件以上あれば `groups.length >= 1` → `view.sections.length >= 1` → 絞り込みをしていなければ `visible.length >= 1` になる。
  `EmptyState` 内の分岐順は 絞り込み (`:532`) → 登録フォルダ 0 件 (`:546`) → `allUnlisted` (`:556`) → セッション 0 件 (`:571`) で、後ろ 2 つは「**登録フォルダ >= 1 件かつ区画が 0 件**」という、上記 seed と両立しない条件を要求する。
  それを裏づけるのがテスト fixture である: `SessionListScreen.test.tsx:474-514` は `listSessions: () => index([])` (グループ 0) と `listFolders` の**フォルダ 1 件**を組み合わせており、`groupSessions()` が production では作れない組み合わせで緑になっている。
- **同種事象探索**: `grep -n "kind: 'folder'" src/domain/session/group.ts` → seed 経路 **1 件** (`group.ts:71-73` の `for (const folder of input.folders)`)。
  `grep -rn 'このフォルダのセッションはありません' src/renderer/src` → **1 件** (`SessionListScreen.tsx:213`) + テスト 2 件。
  画面レベル `EmptyState` の使用は **1 件** (`SessionListScreen.tsx:531`)。
- **リスク/影響**: 「どの所在も列挙できていません。」+ 再検出ボタン、「セッションがまだありません。」+ 取り直すボタン という**復旧導線が実機では出ない**。全所在失敗時に利用者が見るのは、登録フォルダ区画がそれぞれ「このフォルダのセッションはありません。」と並ぶ画面である (H-004 参照)。SC-013 は 5 条件すべてで「空白の画面が 0 件」を求めており、文字は出るが**条件に対応した導線が出ない**。しかも SH-089 V-8 では「全所在が未列挙」は**踏まれていない** (「踏まなかった — `wsl --shutdown` が要る」) ため、実機でもこの不整合は検出されていない。
- **推奨アクション**: 条件を「区画が 0 件か」ではなく**索引の性質**で判定する。例えば `allUnlisted` / 「全区画のセッション合計が 0」を `visible.length === 0` と独立に評価し、区画一覧の**上**に説明バナーとして出す (区画は FR-051 のため残す)。テスト fixture は `groupSessions()` を通して作り、`index([])` + フォルダ 1 件のような production で作れない形を使わない。
- **根拠**: FR-032 / FR-051 / SC-013 / quickstart-results.md SH-089 V-8
- **scope 根拠**: touched files (`SessionListScreen.tsx`) + 同 feature のテスト

### [High] 所在が失敗・未列挙でも登録フォルダ区画が「このフォルダのセッションはありません。」と 0 件を断言する (H-004) (scope: feature)

- **観察**: `SessionListScreen.tsx:211-214` は `open && count === 0` だけを条件に断定文を出す。`index.complete` も当該フォルダの所在の `outcome.status` も見ていない。
  段階描画中 (`session-service.ts:417` の中間 publish) や、当該フォルダの所在が `failed` (`permission-denied` / `distro-not-running` 等) のときも同じ文になる。
  `labels.ts:38-43` は `TARGET_STATUS_LABELS` で `no-history`「セッションの履歴がありません」と `failed`「列挙できませんでした」を**わざわざ区別**しており、FR-012 も「失敗ではなく履歴なし」と両者の区別を要求している。その区別が**フォルダ区画では消えている**。
- **同種事象探索**: `grep -rn 'このフォルダのセッションはありません' src/renderer/src` → 実装 **1 件** (`:213`)。同型の「0 件を状態未考慮で断定する」箇所は他 feature に **0 件** (`WorkspaceFoldersScreen.tsx:479` の「このフォルダには項目がありません。」はブラウズ成功後のみ描画)。
- **リスク/影響**: 「読めなかった」を「無い」と読ませる。FR-051 が守ろうとした「登録が失敗したのか履歴が無いのかの区別」を、別の形で壊している。全所在失敗時 (H-003 により画面レベルの説明が出ない) には、画面全体が「どのフォルダにもセッションが無い」と主張する。
- **推奨アクション**: 区画に当該フォルダの所在の `outcome` を渡し、(a) `complete === false` → 「取得中です」、(b) 対応する所在が `failed` → 「この所在は列挙できていません」+ `FAILURE_REASON_HINTS` と再取得導線、(c) `no-history` / `ok` かつ 0 件 → 現行文 + 導線 (M-001) の 3 分岐にする。
- **根拠**: FR-012 / FR-030 / FR-032 / FR-051 / labels.ts:38-43
- **scope 根拠**: touched files で直接修正可能

### [High] 所在で絞り込むと登録フォルダのセッションが全部消え、「一致するセッションがありません」と出る (H-005) (scope: feature)

- **観察**: `SessionListScreen.tsx:317-322` の `matchesLocation()` は `group.kind === 'pending' || 'unregistered'` のときだけ `group.location` を見て、それ以外 (`folder` / `unknown`) は `location === null` として **`false`** を返す。
  `SessionGroupDTO` の `folder` variant は `folderId` / `boundary` / `sessions` しか持たず (`src/domain/session/dto.ts:60-65`)、所在を運んでいない。
  結果、「Ubuntu-26.04」で絞り込むと**登録フォルダ区画が全滅**し、残るのは未登録・保留グループだけになる。テスト自身がこの挙動を前提に書かれている: `SessionListScreen.test.tsx:634` 「所在 Ubuntu で絞ると、folder グループ (所在を持たない) は外れて 0 件になる。」— **絞り込み結果 0 件の空状態 (FR-032 #5) を作るための手段として使われている**。
  なお `SessionSummaryDTO` は `targetKey` を持ち、`index.outcomes` が `targetKey → location` を持つので、行単位で所在を引くことは renderer 内で可能である。
- **同種事象探索**: `grep -n 'matchesLocation' src/renderer/src` → **2 件** (定義 `:317`、使用 `:384`)。所在フィルタの実装はこの 1 経路のみ。
- **リスク/影響**: 本 feature の中心価値は「Windows と WSL を横断した一覧」であり、その所在フィルタが**登録フォルダのセッションを 1 件も返さない**。US-1 の主役データを隠した上で「絞り込みに一致するセッションがありません。」と表示するため、利用者は「この所在には自分のセッションが無い」と誤解する。FR-040 の要求 (所在による絞り込み) は形式的に存在するが、意味が反転している。
- **推奨アクション**: グループ単位ではなく**セッション単位**で絞る。`index.outcomes` から `targetKey → location` の索引を作り、`session.targetKey` の所在が一致する行だけを残した区画を組む (区画が空になったら区画ごと落とす)。`folder` 区画は複数所在のセッションを含みうるため、フィルタ後の件数表示は H-002 の未確定表記と整合させる。FR-032 #5 のテストは「存在しない所在ではなく、実際に 0 件になる組み合わせ」で作り直す。
- **根拠**: FR-040 / FR-019 / FR-020 (所在が違うだけで未登録扱いにしない設計意図) / US-1
- **scope 根拠**: touched files で直接修正可能 (DTO 変更なしで実装可能)

### [High] SC-013 #2/#4 の renderer テストが production で生成され得ない fixture に依存しており、空状態のカバレッジが名目化している (H-006) (scope: feature)

- **観察**: `SessionListScreen.test.tsx:474-514` (FR-032 #4) は `index([])` + 登録フォルダ 1 件、`:537-555` は folder グループ 3 件を**手書き**で与えている。前者の組み合わせは `groupSessions()` (`src/domain/session/group.ts:71-73`) が seed する仕様と両立しない (H-003)。
  さらに H-002 のテスト (`:104-111`) はヘッダの `全 1 件` 不在のみを確認し、区画見出しの `1 件` を見ていない。H-001 の FR-052 テスト (`:150-156`) は `getAllByText('alice')` で画面内存在のみを確認し、行との対応を見ていない。
- **同種事象探索**: `grep -n 'it\(' src/renderer/src/features/session-list/SessionListScreen.test.tsx` → 空状態関連は **4 件** (`:474` / `:516` / `:537` / `:611`)。うち **1 件** (`:474`) が到達不能状態の fixture、**1 件** (`:611`) が H-005 の不具合挙動を前提としている。
- **リスク/影響**: 空状態 5 条件は SC-013 の主判定 (「renderer 単体テスト」) であり、そのテストが**実装の欠陥を固定**している。緑のまま H-003 / H-005 が残り続ける。
- **推奨アクション**: 空状態テストは `groupSessions()` の出力を fixture 源にする (domain を通す)。到達不能な分岐を検出したら「その分岐が production の索引で作れるか」を 1 件のテストで固定する。
- **根拠**: SC-013 / reviewer-base viewpoint H / quickstart-results.md SH-089 V-8 (実機未実施であるため単体テストが唯一の担保)
- **scope 根拠**: touched files (同 feature のテスト)

### [High] FR-038 の追加取得 UI が未配線 (H-007) (scope: feature)

- **観察**: `fetchMore` は `useSessions.ts:37, 90-100, 116` に定義されているが、**画面からの呼び出しが 0 件**である。
  `Outcomes` の `truncated` 表示 (`SessionListScreen.tsx:302-305`) は「上限で打ち切りました」と伝えるだけで、続きを取る操作が無い。
- **同種事象探索**: `grep -rn 'fetchMore' src/renderer/src` → 定義 3 行とテストスタブのみ。**UI からの呼び出し 0 件**。
- **リスク/影響**: FR-038 が「続きを取る手段」を要求しているが、行き止まりになっている。
- **推奨アクション**: `truncated` の行に「続きを取る」を置き、`fetchMore(outcome.key, outcome.count)` を呼ぶ。
- **根拠**: FR-038
- **scope 根拠**: touched files

### [Medium] 空状態 5 条件のうち「登録フォルダ単位のセッション 0 件」だけ導線が無い (M-001) (scope: feature)

- **観察**: `SessionListScreen.tsx:211-214` は文のみ。画面レベルの 4 分岐 (`:531-586`) はすべてボタンを伴う (「作業フォルダを登録する」「ランタイムを再検出して取り直す」「取り直す」「絞り込みを解除する」)。SC-013 は **5 条件すべて**で導線を求め、画面の doc comment (`:526-530`) も「どの条件も文言ではなく操作を出す」と宣言している。
- **リスク/影響**: 履歴 0 件のフォルダで利用者が次に何をすればよいか (Claude Code をそのフォルダで使う / 取り直す / 登録を見直す) が示されない。SH-089 V-8 の 1 行目は「操作実施。指摘なし」だが、これは操作者の主観報告である。
- **推奨アクション**: H-004 の 3 分岐と合わせ、`ok`/`no-history` かつ 0 件の場合に「このフォルダで Claude Code を使うと、ここに並びます」+ 「取り直す」ボタン (または登録を開く導線) を置く。
- **根拠**: FR-032 / SC-013
- **scope 根拠**: touched files

### [Medium] 段階描画中、まだ列挙していない所在が「列挙の結果」に行を持たず、進行中であることが伝わらない (M-002) (scope: feature)

- **観察**: `session-service.ts:387-418` は `nextOutcomes` に**済んだ所在だけ**を push して publish する。`Outcomes` (`SessionListScreen.tsx:279-308`) はその配列をそのまま並べるため、未処理の所在は行が無い。
  さらに `sessions.loading` は `setIndex` のたびに `false` に落ちる (`src/renderer/src/stores/sessions.ts:44`) ので、段階描画中はヘッダのボタンが「全件を取り直す」に戻り、スケルトン (`:448-452` は `index === null` 条件) も出ない。「まだ出そろっていない」ことを伝えるのはヘッダ 1 文 (`:421` 「先頭ページのみ表示しています（件数は確定していません）」) だけである。実測では所在ごとに 1.2〜3.3 秒、全体で 7 秒級 (`quickstart-results.md` SH-074 / V-6)。
- **リスク/影響**: (a) 所在が 1 つずつ増えるため、利用者は「この所在は失敗して出てこないのか」「まだ来ていないのか」を区別できない。(b) 所在フィルタのチップは `index.outcomes` から作られる (`:373-379`) ので**操作中に増える** → レイアウトが押し出され誤クリックを招く。(c) ヘッダ文の「先頭ページのみ」は、実際には「所在の一部のみ」であり説明が実態とずれている。
- **推奨アクション**: 所在の行を**探索結果の全所在ぶん先に描き** (status 未確定の行として「取得中」)、済んだものを差し替える。ヘッダ文も「取得中の所在があります (n/m)」のように進行を示す。チップは所在が確定してから描く、または先に全所在ぶん描いて無効状態にする。
- **根拠**: FR-037 / FR-030 / SC-008 の段階描画方針 / data-model §7
- **scope 根拠**: feature (renderer 側で `outcomes` の埋め方を変えるか、main の中間 publish に未処理所在を含める)

### [Medium] 「全所在が未列挙」の案内文が理由に関わらず「ディストロを起動してから取り直してください」になる (M-003) (scope: feature)

- **観察**: `SessionListScreen.tsx:556-570`。`allUnlisted` は `status === 'failed'` の全一致で立つ (`:399-401`) ので、理由が `permission-denied` / `wsl-unavailable` / `path-too-long` / `enumeration-failed` でも同じ文とボタン (ランタイム再検出) になる。`labels.ts:29-36` には理由別の `FAILURE_REASON_HINTS` が既にある。
- **リスク/影響**: 起動しても直らない原因に対して「起動してください」と案内する。`Outcomes` 側では理由別ヒントが出るため、同一画面で矛盾した指示が並ぶ。
- **推奨アクション**: `allUnlisted` の文面を、集まった `reasonKey` の集合から組む (単一理由ならその `FAILURE_REASON_HINTS`、複数なら「所在ごとの理由を確認してください」+ 結果セクションへの誘導)。ボタンも `distro-not-running` が含まれるときだけ再検出にする (`Outcomes:267` と同じ判定)。
- **根拠**: FR-031 / FR-032 / labels.ts:29-36
- **scope 根拠**: touched files

### [Medium] 7 秒級の再取得・再検出に対して進捗表示が弱く、他画面の慣習 (「…中…」ラベル) から外れている (M-004) (scope: feature)

- **観察**: `Outcomes` の再検出ボタン (`SessionListScreen.tsx:272-277`) と空状態の再検出ボタン (`:562-569`) は `disabled={busy}` だけでラベルが変わらない。`rediscover()` は `refreshRuntimes()` → `refreshSessions()` を直列で待つ (`useSessions.ts:102-114`) ため、実測で `wsl.exe` 固定費 1.3 秒 + 全件 7 秒級。
  他画面は busy でラベルを変えている: `RuntimeListScreen.tsx:194` `{refreshing ? '再検出中…' : '再検出'}`、`WorkspaceFoldersScreen.tsx:409` `{runtimes.refreshing ? '再検出中…' : 'ランタイムを再検出'}`。session-list のヘッダだけは `:433` で `'取得中…'` に変えており、**同一画面内でも不統一**。
- **リスク/影響**: グレーアウトのみでは「押せたのか」が分からず連打・離脱を招く。表記の不統一は K (consistency) の問題でもある。
- **推奨アクション**: 再検出ボタンにも busy ラベル (「再検出しています…」) を与える。`refresh` 中は一覧側に stale 表示 (取得時刻の淡色化 + 「更新中」) を出す。
- **根拠**: 実測 `quickstart-results.md` SH-074 / V-6、既存 2 画面の慣習
- **scope 根拠**: touched files

### [Medium] 「作業フォルダ不明」と「作業ディレクトリ不明」が同一画面に並び、glossary の用語定義と衝突する (M-005) (scope: feature)

- **観察**: `SessionListScreen.tsx:135` が `unknown` グループの見出しに **「作業フォルダ不明」** (spec.md:308-310 の語をそのまま採用)、`:128` が `unregistered` グループの cwd 欠落時のフォールバックに **「作業ディレクトリ不明」** を使う。
  `docs/glossary.md:360-362` は **作業フォルダ = 登録された WorkspaceFolder**、`:92-97` は **作業ディレクトリ = セッションに記録された cwd** と別語として定義している。したがって「作業フォルダ不明」は定義上「どの登録フォルダか不明」と読めるが、実体は「cwd から所在が決まらない/cwd が無い」である。
  `grep -rn '作業フォルダ不明' --glob '!node_modules/**'` → 実装 1 / テスト 1 / spec 3 / tasks 1 / quickstart 1。
- **リスク/影響**: 4 グループの読み分けが本 feature の中核であり (`po-reviewer.md:207` も近接語の密度を指摘済み)、1 文字違いの 2 語が隣接すると誤読が起きる。用語の正本 (glossary) と画面が食い違うため、どちらが正しいかを利用者もレビュワーも決められない。
- **推奨アクション**: 画面文言を glossary に合わせる (例: `unknown` グループ = 「作業ディレクトリ不明」、`unregistered` の欠落時 = 「作業ディレクトリの記録なし」)。spec / glossary のどちらを正本にするかは 1 箇所で決め、他は参照にする (MEMORY の「規則の正本は 1 箇所」)。用語を変える場合は spec.md:308 と glossary の整合を同時に更新する。
- **根拠**: docs/glossary.md:92-97, 360-362 / FR-046 / FR-048 / Principle XIV
- **scope 根拠**: feature (画面文言) + glossary 整合は architecture-reviewer と重複しない範囲で表記のみ

### [Medium] 登録フォルダ区画に所在が表示されず、「越境 / 同じ所在 / 未判定」の相対表現しか出ない (M-006) (scope: feature)

- **観察**: `SectionHeading` の `folder` 分岐 (`SessionListScreen.tsx:100-107`) はフォルダ表示名と `BOUNDARY_LABELS[group.boundary]` のみ。`useFolderLabels` は `FolderListDTO` を取得しているのに `entries` で `id` と `displayName` だけを残し (`useFolderLabels.ts:56-60`)、`folder.location` を捨てている。`pending` / `unregistered` 区画には所在名が出る (`:112` / `:128`) ため、**登録フォルダだけ所在が読めない**。
- **リスク/影響**: 本画面の主題は所在横断である。「work」というフォルダが Windows 側か Ubuntu-26.04 側かを、この画面だけでは判断できない。「越境」は**セッション側から見た相対値**であり、フォルダの所在そのものではない。
- **推奨アクション**: `FolderLabels.entries` / `nameOf` に所在を持たせ、見出しに `Windows` / `<distroName>` を出す (H-005 の所在フィルタ実装でも同じ索引が要る)。
- **根拠**: FR-040 / FR-047 / US-1 (両所在が同じ画面に並ぶこと)
- **scope 根拠**: touched files (`useFolderLabels.ts` / `SessionListScreen.tsx`)

### [Medium] セッション 0 件の登録フォルダに「未判定」バッジが常時付き、段階描画で表示が揺れる (M-007) (scope: feature)

- **観察**: `src/domain/session/group.ts:72` は seed 時に `boundary: 'unknown'` を入れる。`BOUNDARY_LABELS.unknown` は「未判定」(`labels.ts:81-85`)。よって履歴 0 件のフォルダは常に「work 未判定」と並ぶ。段階描画でセッションが届くと「同じ所在」/「越境」へ切り替わるため、同じ行のバッジが取得中に変化する。
- **リスク/影響**: 「未判定」は R-1 の到達可能性 3 値に由来する語で、利用者には「何かが判定できていない異常」と読める。0 件フォルダに異常の気配を付けるのは FR-051 の意図 (登録が成功していることを示す) と逆方向。
- **推奨アクション**: セッション 0 件の `folder` 区画では boundary バッジを出さない (判定材料が無いため)。表示するなら「セッションが無いため未判定」のように理由を添える。
- **根拠**: FR-051 / FR-023 / labels.ts:81-85
- **scope 根拠**: touched files

### [Medium] 取得時刻が分精度の絶対表記のみで、再取得が反映されたかを利用者が確認できない窓がある (M-008) (scope: feature)

- **観察**: `SessionListScreen.tsx:55-65` の `TIME_FORMAT` は `year/month/day hour/minute` (秒なし)。表示は `:416-418` の「取得時刻 2026/09/23 14:05」。相対表記は無い。`EnumerationOutcomeDTO.fetchedAt` (所在ごとの取得時刻、`dto.ts:115`) は画面で使われていない。再取得完了時のトースト等の通知経路も無い (`grep` でトースト系部品の使用 0 件)。
- **リスク/影響**: (a) SC-012 は「取得時刻が更新される」ことで置き換えを測るが、同一分内に再取得すると**表示が変わらない**ため、利用者には「押しても何も起きなかった」と映る (7 秒待った直後にこれが起きる)。(b) 鮮度 (Principle X の「正本はアプリ外」) を判断するには現在時刻との差を暗算する必要がある。(c) 所在ごとに実際の取得時刻が最大数秒ずれるのに 1 つの時刻しか出ない。
- **推奨アクション**: 秒まで出す、または「3 分前 (2026/09/23 14:05)」の併記にする。再取得完了時に短い成功通知 (aria-live 付き) を出す。所在行には `outcome.fetchedAt` を添える。
- **根拠**: FR-034 / SC-012 / Principle X
- **scope 根拠**: touched files

### [Low] 取得失敗時に再試行導線が 2 つ並び、ラベルが違う (L-001) (scope: feature)

- **観察**: `SessionListScreen.tsx:437-446` の `ErrorState` (ボタン「再取得」) と、ヘッダの「全件を取り直す」(`:426-434`) が同時に出る。どちらも `sessions.refresh()` を呼ぶ。`ErrorState` は `retrying` の間**エラー本文とボタンを消してスピナだけにする** (`error-state.tsx:42-61`) ため、再試行中は理由が画面から消える。
- **推奨アクション**: 文言を揃える (両方「全件を取り直す」)。再試行中もエラー理由を残す (`retrying` 表示の中に title を残す prop を足す)。
- **根拠**: 一貫性 (K) / FR-046
- **scope 根拠**: feature

### [Low] 絞り込みチップが件数無制限に横並びで、登録フォルダが増えると操作領域が肥大する (L-002) (scope: feature)

- **観察**: `SessionListScreen.tsx:498-507` が `folderLabels.entries` をそのままボタン列にする。上限・折り畳み・検索は無い。登録フォルダ数の上限は画面側に無い。
- **推奨アクション**: 一定数を超えたら select / combobox に切り替えるか、上位 N 件 + 「すべて表示」にする。
- **根拠**: 情報構造 (G) / FR-040
- **scope 根拠**: feature

### [Low] 静的コピーが JSX 直書きで、文言の正本が 1 箇所に無い (L-003) (scope: feature)

- **観察**: `labels.ts` は**参照キー由来の訳出のみ**を `Record` で網羅している (設計意図として妥当。`labels.ts:5-16`)。一方 `SessionListScreen.tsx` には静的コピーが 20 箇所以上直書きされている (`:104` 登録フォルダ / `:112` Windows / `:124` 未登録フォルダ / `:135` 作業フォルダ不明 / `:200` 作業フォルダとして登録 / `:204` 畳む・開く / `:213` / `:271` 列挙の結果 / `:275` / `:304` / `:410` / `:421` / `:433` / `:534`-`:584` ほか)。i18n ライブラリは未導入で (`locales/` は node_modules のみ)、他 feature も同方針 (`WorkspaceFoldersScreen.tsx:141,171,337,479` など) なので**規約違反ではない**が、正本が無いことが M-005 の表記衝突と M-004 の busy ラベル不統一を生んでいる。
- **推奨アクション**: 少なくとも「所在の呼称」「作業フォルダ / 作業ディレクトリ」「再取得・再検出系の動詞」の 3 系統は `labels.ts` に定数として出し、画面間で共有する (`stores/ui.ts:18` の `SCREEN_LABELS` と同じ形)。
- **根拠**: FR-046 / MEMORY「規則の正本は 1 箇所、他は参照形」
- **scope 根拠**: feature

### [Low] 初回描画の 1 フレームで「未取得」だけが出る (L-004) (scope: feature)

- **観察**: `stores/sessions.ts:41` の初期値は `loading: false`。`useSessions` の effect が走る前の初回描画では `index === null && loading === false` となり、スケルトン条件 (`SessionListScreen.tsx:448`) を満たさずヘッダの「未取得」だけが出る。
- **推奨アクション**: ストアの初期値を `loading: true` にするか、`index === null && !failed` でスケルトンを出す。
- **根拠**: Loading state (C)
- **scope 根拠**: feature

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `ThreadListItemsByKey\|matchesLocation\|ThreadListSkeleton` (src/renderer/src) | 使用 1 件 (定義/import 各 1) | `SessionListScreen.tsx:218` / 定義 `components/assistant-ui/elements/thread-list.aui.tsx:61` / import `SessionListScreen.tsx:14` |
| H-002 | `件` (src/renderer/src, `*.tsx`) | 件数提示 4 件 (要修正 2 件) | 無条件 `SessionListScreen.tsx:197`, `:300` / 保護済 `:423` / 対象外 `WorkspaceFoldersScreen.tsx:594` |
| H-003 | `kind: 'folder'` (src/domain/session/group.ts) + `EmptyState` 使用 | seed 経路 1 件 / 画面レベル EmptyState 1 件 | `group.ts:71-73`, `group.ts:144-151` / `SessionListScreen.tsx:531` / 到達不能分岐 `:556`, `:571` / fixture `SessionListScreen.test.tsx:474-514` |
| H-004 | `このフォルダのセッションはありません` (repo, node_modules 除く) | 実装 1 件 + テスト 2 件 | `SessionListScreen.tsx:213` / `SessionListScreen.test.tsx:192`, `:553` |
| H-005 | `matchesLocation` (src/renderer/src) | 2 件 (定義 1 / 使用 1) | `SessionListScreen.tsx:317`, `:384`。DTO 側の欠落 `src/domain/session/dto.ts:60-65` |
| H-006 | `it\(` (SessionListScreen.test.tsx) | 空状態関連 4 件 (問題 2 件) | `:474` (到達不能 fixture) / `:611` (H-005 の挙動前提) / 妥当 `:516`, `:537` |
| H-007 | `fetchMore` (src/renderer/src) | 定義 3 行 / UI からの呼び出し 0 件 | `useSessions.ts:37,90,116` / `SessionListScreen.tsx:302-305` (行き止まりの表示) |
| M-004 | `再検出\|取得中` (src/renderer/src, `*.tsx`) | busy ラベル慣習 2 件 / 未追随 2 件 | 慣習 `RuntimeListScreen.tsx:194`, `WorkspaceFoldersScreen.tsx:409` / 未追随 `SessionListScreen.tsx:272-277`, `:562-569` |
| M-005 | `作業フォルダ不明` (repo, node_modules 除く) | 7 件 | `SessionListScreen.tsx:135` / `SessionListScreen.test.tsx:222` / `spec.md:118,309,401` / `tasks.md:246` / `quickstart.md:87` |
| L-003 | `^export const [A-Z_]+_LABELS` (src/renderer/src) | 24 件 (すべて参照キー訳出。静的コピーの集約は 0 件) | `features/session-list/labels.ts` 6 件 / `features/workspace-folders/labels.ts` 9 件 / `features/runtime-list/labels.ts` 8 件 / `stores/ui.ts:18` |

## Verdict

- Critical: 0
- High: 7
- Medium: 8
- Low: 4

**注**: reviewer は read-only tool のため本ファイルを Write できず、gate orchestrator が hand-back 内容を保存した。
H-007 は reviewer が要約で独立 ID 化を提案したものを gate 側で Findings に取り込んだ。
