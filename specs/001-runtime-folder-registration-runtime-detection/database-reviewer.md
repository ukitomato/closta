# database-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: database-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 1 (pr-gate / database-persistence track)

## 初回読了 viewpoint

読了: `reviewer-base.md` / `spec.md` (FR-001〜048, SC-001〜018, Edge Cases, Assumptions, Out of Scope)
/ `plan.md` §Domain Context / `data-model.md` §1〜10 / `contracts/workspace-store.md` 全文
/ `.specify/memory/constitution.md` Principle V / `docs/domains/runtime/charter.md`
/ `docs/decisions/0024-constitution-verification-paths.md` (Decision Outcome)
/ `tasks.md` BE-041 / BE-044 / `.specify/spec-gate/reviewers.yml`

**本 PR で実装/影響される FR / SC (永続化スコープ)**

- FR-014 — 登録フォルダを所在つきで永続化し再起動後に復元する (`folder-store.ts:84-154`)
- FR-016 — `(所在, 正規化済みパス)` の一意性。`id` の一意性は復元側で担保 (`folder-store.ts:139`)
- FR-019 — スキーマ版・名前空間つきパス・名前空間不一致の非復元・**上書き前の退避**・件数と理由の提示・秘密フィールドの不在
- FR-020 — 単一インスタンス (`src/main/index.ts:28`)。永続化ファイルの同時書き込み防止の唯一の担保
- FR-025 — パス組み立てを `domain` のパス API 経由に限定 (`folder-store.ts:56-71`)
- FR-038 — `infra` は `electron` を import しない。`userDataDir` を composition root から注入 (`composition-root.ts:58-62`)
- SC-013 — 復元 100% / 重複 0 件 / 破損・版不一致・名前空間不一致で**起動失敗 0 件** + 件数・理由の描画 + 元データの退避
- SC-014 — 2 重起動で永続化ファイルの更新時刻が変化しない
- SC-004 — 一覧再表示の予算 (`list-folders` は `measure.ts` の `BUDGET_MS` に**予算を持たない**)

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md:40` — 「作業フォルダの登録 (**所在を伴う**) と到達可能性判定」は本 domain の In scope
- Constitution **Principle V**「Verification / Manual: `database-reviewer` (スキーマ**と設定層**)」(`constitution.md:314`) — 本 review がこの Manual arm にあたる
- Constitution Principle V「Automated: **SQL のカラム型だけに依存しない** — 設定ファイル (JSON / YAML) の永続化スキーマも対象に含める (AD-024 #9)」(`constitution.md:311-313`)
- AD-024 Decision Outcome 表 (`0024-constitution-verification-paths.md:106`) — 「V | `scripts/constitution/check.mjs` (設定ファイルを走査対象に含む)」
- `contracts/workspace-store.md:42-46` — 秘密フィールドの不在 / allow-list を実装側の担保とする暫定措置

**severity 集計**

- A. 認可 / 認証 / RLS: 該当なし: owner は `security-reviewer`。本 PR に RLS / policy / GRANT に相当する機構は無く (SQL 0 件)、認証 context を参照する永続化フィールドも無い
- B. 入力検証 / injection / 暗号: 該当なし: owner は `security-reviewer`。ディスク上 JSON を未信頼入力として扱う観点は永続化スキーマの責務として G に集約した
- C. 業務不変条件 / Charter drift: 該当なし: owner は `architecture-reviewer`。`data-model.md` §6 の不変条件 (所在×パス名前空間の一致 / `reachability` を永続化しない) は `folder-record.ts:109` / `:147-151` で実装と一致しており、永続化側の drift は観察されない
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:0
- E. User Story 価値 / SC 計測可能性 / AC: 該当なし: owner は `po-reviewer`。SC-013 の「件数」の**報告値そのもの**は永続化層が算出しているため G (H-002) に置いた
- F. 命名 / module 配置 / lint hookup: 該当なし: owner は `convention-reviewer`。`RECORD_KEYS` / `SCHEMA_VERSION` / ファイル名の命名は一貫しており指摘なし
- G. DB / 永続化スキーマ / index 相当 / データ型: Critical:0 High:2 Medium:5 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

本 PR の永続化は **SQL / migration / Prisma を一切持たない JSON 設定ファイル 1 本**
(`<userData>/workspace-folders.json`) である。書き手は `src/main/infra/settings/folder-store.ts`
のみ (`writeFile|appendFile|createWriteStream` の全数 3 件、うち実装は `folder-store.ts:79` / `:167`)。
スキーマは `{ schemaVersion: 1, folders: [{ id, location, path{namespace,value}, displayName, registeredAt }] }`
で、`folder-record.ts` がキー名 allow-list と値検証を担い、`domain` の `isNamespaceConsistent()` /
`makeHostPath()` / `makeRuntimePath()` / `isValidFolderId()` / `isUniqueId()` を通して
branded type を復元する。読み込みは「読めた分を復元し、落ちた分を件数・理由・退避先で報告する」
形で contracts/workspace-store.md に一致している。
**秘密情報フィールドは 0 件**であり、Principle V の実体面 (何を書いているか) は満たしている。
指摘は (1) 同時書き込みと耐久性、(2) 復元できなかった**件数**の報告精度、
(3) Principle V の **Automated 検証経路が存在しない** (AD-024 の正本表との不一致)、
(4) スキーマ版の移行 seam の不在、に集中する。

## Findings

### [High] 同一の一時ファイル名へ無直列化で書き込むため、同時 save がファイルを壊しメモリとディスクが乖離する (H-001) (scope: feature)

- **観察**: `src/main/infra/settings/folder-store.ts:29` が一時ファイル名を**プロセス共有の固定値**
  `workspace-folders.json.tmp` として持ち、`:156-169` の `save()` は
  `writeFile(temp)` → `rename(temp, file)` を**排他なしで**実行する。
  呼び出し側 (`src/main/app/folder-service.ts:359-360` / `:381-382`) は `folders` を差し替えてから
  `await store.save(folders)` するだけで、直列化 (mutex / promise chain / 世代番号) を持たない。
  `register()` / `unregister()` はそれぞれ `await ensureLoaded()` で一度 yield するため、
  2 つの IPC invoke が同一 tick で入ると**両者が save 中に重なる**。
  重なったときの帰結は 2 つある。
  (a) 同じパスに対する 2 つの `O_TRUNC` 書き込みが交錯し、短いペイロードの後に長いペイロードの
  尾が残った JSON になる → 次回起動は `parse-failed` で**全件退避**。
  (b) 先行 `rename` が temp を移動済みのため後続 `rename` が ENOENT で reject → `save()` が
  throw して `ipcMain.handle` 経由で renderer に伝播し (`src/main/app/ipc.ts:78-80` に try/catch なし)、
  **メモリは 2 件削除済み・ディスクは 1 件削除済み**のまま残る (次回起動で削除したはずのエントリが復活する)。
- **同種事象探索**:
  - `store.save(` / `.save(folders` in `src/` → **2 件** (`src/main/app/folder-service.ts:360`, `:382`)。どちらも無防備
  - `mutex|queue|serial|inFlight|pending` (-i) in `src/` → **1 件**、該当は
    `src/renderer/src/components/assistant-ui/elements/tool-fallback.aui.tsx:257` の
    `[Unserializable value]` 文字列のみ。**直列化機構はリポジトリ全体で 0 件**
  - renderer 側の in-flight ガード → **0 件**。`src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx:495-502`
    は全エントリの `onUnregister` を同時に押せる状態で描画し、`useFolders.ts:172-188` の
    `unregister` は前回の完了を待たない
  - 一時ファイル名を共有する他の書き手 → **0 件** (`writeFile|appendFile|createWriteStream` の実装 2 件はいずれも `folder-store.ts`)
- **リスク/影響**: SC-013「登録フォルダの復元が **100%**」と FR-014 が壊れる。
  最悪ケースでは登録全件が失われ (退避ファイルにしか残らない)、軽いケースでも
  「解除したはずのフォルダが再起動で戻る」という再現困難な不整合になる。
  FR-020 の単一インスタンス制限は**プロセス間**の同時書き込みしか塞がず、プロセス内の
  並行 invoke には効かない。contracts/workspace-store.md:88 の「アプリは単一インスタンスに制限する」
  という根拠欄はこの穴を覆っていない。
  FR-039 は「main 側は送信元とペイロードの双方を未信頼として検証しなければならない」と定めており、
  **renderer が invoke を直列化することを前提にしてはならない**。
  Critical にしないのは、人間の操作だけで踏むには 2 クリックが save 所要時間 (数 ms) 内に
  収まる必要があり、現時点で観察できる確実な実害経路ではないためである (severity 禁則に従う)。
- **推奨アクション**:
  1. `createFolderStore` 内に書き込みの直列化を置く (promise chain で十分。
     `tail = tail.then(run, run)` 形で `save()` を通す)
  2. 一時ファイル名を**呼び出しごとに一意**にする (`workspace-folders.json.<pid>.<seq>.tmp`)。
     固定名は将来のマルチ WebContents (AD-025 の目標レイアウト) で再発する同型の穴である
  3. 失敗時に `.tmp` を掃除する (`rename` が失敗したら `rm(temp, { force: true })`)
  4. 回帰テストを 1 本追加する: `await Promise.all([store.save(a), store.save(b)])` の後に
     `load()` が `skipped: 0` で **a か b のどちらか**を返し、`.tmp` が残らないこと
- **根拠**: FR-014 / FR-019 / FR-020 / SC-013 / contracts/workspace-store.md §書き込みの規則 /
  FR-039 / CWE-362 (Race Condition) / CWE-367 (TOCTOU)
- **scope 根拠**: feature。`folder-store.ts` と `folder-service.ts` は本 PR の touched files であり、store 内部で完結して修正できる

### [High] ファイル全体が読めなかったときの損失件数を常に 1 と報告し、UI が事実に反する数を出す (H-002) (scope: feature)

- **観察**: `folder-store.ts:101` / `:109` / `:122` が `parse-failed` / `schema-version-unknown` を
  **`skipped: 1`** で返す。これは「レコード 1 件が落ちた」を意味する値だが、実際に失われたのは
  ファイルに含まれていた**全登録**である。renderer は
  `WorkspaceFoldersScreen.tsx:507-512` で `restoreIssues.skipped` をそのまま
  「復元できなかった登録が N 件あります」に埋めるため、30 件登録していた利用者にも「1 件」と表示される。
  `folder-store.test.ts:122-140` はこの経路を検査しているが `skipped` を assert していないため、
  誤りが pin されていない。
- **同種事象探索**: `skipped: 1` in `src/` → **3 件** (`folder-store.ts:101`, `:109`, `:122`)。
  いずれもファイル全体の失敗経路。レコード単位の計上 (`folder-store.ts:134`, `:141` の `skipped += 1`) は正しい。
  報告値の消費側は **1 箇所** (`WorkspaceFoldersScreen.tsx:510`)。
- **リスク/影響**: SC-013 の「**復元できなかった件数**と理由が画面上に描画され」と
  FR-019 の「件数と理由を利用者に提示しなければならない」を満たさない。
  利用者は「1 件くらいなら」と判断して**次の登録操作を行い、その時点の `save()` が元ファイルを置換する**。
  退避ファイル (`.bak`) が唯一の残存コピーになるため、件数の過小報告は実データ喪失の認知を直接妨げる。
  `schema-version-unknown` では `root.folders` が配列なら件数が判明する
  (`folder-store.ts:114-124` は `root.folders` を見ずに捨てている) ため、少なくともこの経路の過小報告は防げる。
- **推奨アクション**:
  1. `RestoreIssuesDTO` (`src/domain/workspace/dto.ts:46-51`) に**ファイル単位の失敗**を表す場を足す
     (例 `fileLevel` を `parse-failed` / `schema-version-unknown` / `null` の 3 値で持つ)。
     `skipped` は「レコード単位で落ちた件数」に限定する
  2. UI 文言を 2 系統に分ける。ファイル単位なら「登録ファイル全体を読めませんでした (退避先: …)。
     登録は復元されていません」、レコード単位なら現行の「N 件」。FR-047 に従い内部キーは出さない
  3. `schema-version-unknown` で `root.folders` が配列のときは要素数を件数として報告する
  4. `folder-store.test.ts` に「10 件入ったファイルが `parse-failed` したとき `skipped` が 1 ではないこと」を pin する
- **根拠**: SC-013 / FR-019 / spec US-2 AC-14 / contracts/workspace-store.md §読み戻しの規則 / FR-047
- **scope 根拠**: feature。`folder-store.ts` (touched) と `domain/workspace/dto.ts` + renderer 1 箇所で閉じる

### [High] Principle V の Automated 検証が実体として存在せず、AD-024 が定めた「正本」と repo 状態が食い違う (H-003) (scope: feature)

- **観察**: `.specify/memory/constitution.md:291-315` の Principle V は `amended: 2026-09-15 (AD-024 #9)` を持ち、
  Verification / Automated に「**SQL のカラム型だけに依存しない** — 設定ファイル (JSON / YAML) の
  永続化スキーマも対象に含める (AD-024 #9)。R-1 の永続化は JSON であり、SQL を見る検証では届かない」
  と書かれている。AD-024 (status: accepted) の Decision Outcome 表
  `docs/decisions/0024-constitution-verification-paths.md:106` は
  「V | `scripts/constitution/check.mjs` (設定ファイルを走査対象に含む)」を**Automated の正本**として指定している。
  しかし `scripts/constitution/check.mjs` には Principle V の項目が**存在しない**。
  同時に `constitution.md:296` の `bad_pattern_grep` は改定後も SQL カラム型
  (`api_?key|...` の直後に `TEXT|BLOB|VARCHAR` を要求する形) のままであり、
  AD-024 #9 が「届かない」と断じた形が残っている。
  結果として Principle V の自動検証は**どこにも無い**。
- **同種事象探索**:
  - `check.mjs` の principle タグ全数 = `VI` (項目 1,2,3,4,5,6,7,9) / `II` (項目 8) /
    `FR-040` (項目 10) / `FR-039 / FR-040` (項目 11)。**V タグの項目は 0 件**
    (`scripts/constitution/check.mjs:137,147,162,188,214,227,231,243,254,323,344,365,392,399,481,530`)
  - `api_?key|safeStorage|secret|password|schemaVersion|settings` (-i) in `scripts/` → **1 件**、
    該当は `scripts/constitution/allowlists.mjs:297` の `setLoginItemSettings` のみ
    (Principle VI の API 名リスト)。**設定ファイルの永続化スキーマを検査するコードは 0 件**
  - 実体面の全数確認 (擁護側): 永続化フィールドは `folder-record.ts:28` の
    `RECORD_KEYS` (`id` / `location` / `path` / `displayName` / `registeredAt`) のみ。
    `token|secret|password|apiKey|credential` (-i) in `src/main/infra/settings/` → **3 件**、
    全件が `folder-store.test.ts:194,268,273` の allow-list 反証 fixture。
    **現時点で秘密情報の永続化は 0 件**であり実害は成立していないため Critical ではなく High とする
- **リスク/影響**: `contracts/workspace-store.md:45-46` は「Principle V の自動検証は SQL のカラム型に
  依存しており JSON 設定ファイルを検査できない。検証条件の追随は AD-024 のスコープに含め、
  **それまでは allow-list を実装側の担保とする**」と暫定措置を宣言している。
  ところが AD-024 は本 PR で accepted になっており、その表が指す実装が無いため、
  **暫定措置の解除条件が満たされたことにされながら中身が空**という状態で feature が閉じる。
  `docs/verify-report.md:167` は既に Principle V を pass と記録している。
  次に設定層へ載るのは X-3 の Provider 設定 (AD-011 / Principle V の本命) で、
  `infra/secrets/` と `safeStorage` が絡む。検証が無いまま「R-1 で pass」が既成事実になると、
  次 feature で秘密フィールドが JSON に載っても機械的には止まらない。
- **推奨アクション**:
  1. `scripts/constitution/check.mjs` に Principle V の項目を 1 つ足す。最小形は
     「`src/main/infra/settings/**` と永続化 store の allow-list 定数 (`RECORD_KEYS` 相当)、
     および書き出し関数のリテラルキー集合に、禁止語 (api key / token / secret / password /
     credential。ただし参照キーを示す `*_ref` / `*Ref` は許可) が現れないこと」。
     JSON スキーマの正本がコード上の定数である以上、検査対象は**定数と `JSON.stringify` に渡す
     オブジェクトリテラル**であって `.json` ファイル本体ではない (userData 配下は repo に無い)
  2. `constitution.md:296` の `bad_pattern_grep` を SQL カラム型のみの形から改める。
     **Statement を改定して metadata を据え置くと、AD-024 が指摘したのと同型の drift が
     Principle V 自身で再発する**
  3. 実装を入れないなら `contracts/workspace-store.md:45-46` の暫定措置を「解除済み」と
     読める形にしない (「AD-024 のスコープ」ではなく「未実装。次に触る feature で実装する」と明記する)
- **根拠**: Constitution Principle V (Verification / Automated, amended 2026-09-15) /
  **AD-024 (accepted) Decision Outcome 表 :106** / AD-024 本文 :24-25 / #2 / #7 / #8
  (「grep は正本になり得ない」「実在しないパスを検査する grep は常に合格する」) /
  `.specify/spec-gate/reviewers.yml:29-31` (本 reviewer の発火根拠)
- **scope 根拠**: feature。`scripts/constitution/` は本 feature が FR-036 / FR-037 で整備した対象であり、
  AD-024 も本 feature で起票された (spec.md:596-598)。
  accepted ADR drift の owner は cat D の `architecture-reviewer` であり **dedup 対象**になりうるが、
  Constitution が Principle V の Manual verifier に `database-reviewer` を実名指定しているため本 reviewer からも提出する

### [Medium] スキーマ版の移行 seam が無く、旧版と未来版を区別せず一律破棄する (M-001) (scope: feature)

- **観察**: `folder-store.ts:114` は `root.schemaVersion !== SCHEMA_VERSION` の**等値比較 1 本**で、
  (a) 未来版 (v2 のファイルを v1 で開いた)、(b) 旧版 (v1 のファイルを v2 で開く将来)、
  (c) `schemaVersion` 欠落、(d) 型違い (文字列の "1") をすべて同じ経路に落とし、
  `schema-version-unknown` で**全件破棄 + 退避**する。移行関数のフックが無い。
  `contracts/workspace-store.md:110` は「I-1 が所在にコンテナを追加する場合、`schemaVersion` を
  上げて**移行を定義する**」と将来の移行を前提にしているが、現在のコードには移行を差し込む場所が無く、
  `SCHEMA_VERSION` を 2 に上げた瞬間に**既存利用者の全登録が「復元できませんでした」になる**。
- **同種事象探索**: `SCHEMA_VERSION` in `src/` → **4 件** (`folder-record.ts:31` 定義 /
  `folder-store.ts:114` 読み / `:160` 書き / `folder-store.test.ts:9,66,231-233`)。
  版を跨ぐ変換コードは **0 件**。テストは版 99 (未来) と欠落のみで、
  **`schemaVersion` がより小さい値のケースは 0 件**。
- **リスク/影響**: 次にこのファイルのスキーマを変える feature (I-1 / X-3) が、移行を書かずに
  `SCHEMA_VERSION` を上げるだけで通ってしまう。退避はされるが、利用者から見れば
  「更新したら登録が全部消えた」である。SC-013 の「復元 100%」は同一版の前提でしか担保されていない。
- **推奨アクション**:
  1. 読み込みを「版が小さい → `migrate(version, root)` / 版が大きい → 退避して読まない /
     一致 → そのまま」の 3 分岐に開き、`migrate` を「既知の旧版が無いので恒等」として今は空で置く。
     分岐を作っておくのが安い段階は今である (v1 しか無いので恒等で足りる)
  2. 理由キーを `schema-version-newer` / `schema-version-unknown` に分ける
     (利用者に示すべき次の操作が違う — 前者は「アプリを更新してください」)
  3. `folder-store.test.ts` に `schemaVersion` が 0 のケースを足し、
     「旧版は退避され、移行未実装であることが理由で分かる」ことを pin する
- **根拠**: contracts/workspace-store.md:110 §拡張点 / FR-019 / SC-013 /
  spec Edge Case「永続化ファイルの破損 / 将来バージョンのスキーマ」
- **scope 根拠**: feature。`folder-store.ts` 内で閉じる

### [Medium] 退避の失敗が load() 全体を throw させ、読めたレコードごと一覧が理由なしで落ちる (M-002) (scope: feature)

- **観察**: `folder-store.ts:77-81` の `backup()` は `writeFile` の失敗をそのまま投げる
  (docblock :76「退避に失敗したら例外を投げる — 黙って進むと元ファイルを失う」)。
  呼び出しは `:98` / `:106` / `:119` / `:148` の 4 箇所で、いずれも try/catch の外にある。
  特に `:148` は「一部だけ壊れていた」経路であり、**正常に復元できたレコードが `folders` に
  既に積まれているのに、退避の失敗で `LoadResult` ごと失われる**。
  上位 (`folder-service.ts:106-112` の `ensureLoaded`) も catch しないため `list()` が reject し、
  renderer は `useFolders.ts:82` で `setFailed(true)` の blanket failure になる
  (件数も理由も退避先も出ない)。
- **同種事象探索**: `await backup(` in `folder-store.ts` → **4 件** (:98, :106, :119, :148)。
  うち 3 件は全件失敗経路なので影響は同じだが、:148 だけは**読めたレコードを伴う**ため損失が大きい。
  `folder-store.test.ts` に退避失敗のケースは **0 件** (書き込み可能な一時ディレクトリでしか試していない)。
  `RestoreIssueReason` (`src/domain/workspace/dto.ts:35-40`) に `backup-failed` は **0 件**。
- **リスク/影響**: FR-019「**起動は妨げられない**」/ SC-013「起動失敗 **0 件**」と衝突する。
  読み取り専用の userData (企業管理端末 / ディスク満杯 / 対策ソフトのロック) で
  「1 件だけ壊れたファイル」を開くと、フォルダ画面全体が失敗表示になる。
  なお**退避が完了するまで置換しない**という要件 (FR-019) は維持しなければならないため、
  単に catch して進めるのは誤りである (次の登録操作で元ファイルが消える)。
- **推奨アクション**:
  1. `backup()` の失敗を捕まえ `LoadResult` を返す形に変える
     (`backupPath: null` + `reasonKeys` に `backup-failed` を追加。DTO と訳語も追加)
  2. **同時に store を「保存禁止」状態にする**。退避できていないので置換してはならない。
     `save()` は `backup-required` を返して拒否し、UI は「退避できていないため保存を止めています。
     退避先の書き込み権限を確認してください」を出す。FR-019 の不変条件はここで守る
  3. `folder-store.test.ts` に「退避先が書けないとき、例外を投げずに読めたレコードと
     `backup-failed` を返し、`save()` が元ファイルを置換しない」ことを追加する
- **根拠**: FR-019 / SC-013 / contracts/workspace-store.md:87 (退避が完了するまで置換しない)
- **scope 根拠**: feature。`folder-store.ts` + `domain/workspace/dto.ts` + 文言 1 箇所

### [Medium] 登録件数にもファイルサイズにも上限が無く、復元が O(n^2)、一覧構築が件数比例の逐次 I/O になる (index 相当) (M-003) (scope: feature)

- **観察**: 「index 相当」の観点で見ると、このストアは**全走査しか持たない**。
  - `folder-store.ts:126` は `root.folders` の要素数を検査せず全件ループする。
    ループ内の `isUniqueId(folders, id)` (`src/domain/workspace/registry.ts:34` / `folder-store.ts:139`) は
    既存配列の線形走査なので、復元は **O(n^2)**
  - 読み込みは `readFile(..., 'utf8')` + `JSON.parse` で**全文をメモリに載せる** (`:87`, `:95`)。
    サイズ上限が無いため、肥大化した / 改変されたファイルが main プロセスを同期的にブロックする
  - `folder-service.ts:173-179` の `buildList()` は登録 1 件ごとに `await checkExistence(folder)` を
    **逐次**実行する (所在 `wsl` は UNC 直読み、所在 `windows` は `hostFs.exists`)。
    `data-model.md:363` は「実在確認の回数は登録件数に比例するが `wsl.exe` の呼び出しは伴わない」と
    比例を許容しているが、**逐次**である点と**上限が無い**点は担保されていない
  - `src/main/app/measure.ts` の `BUDGET_MS` に `list-folders` の予算が**無い** (SC-004 が定めていないため意図的)。
    つまり一覧構築が何秒かかっても**超過として記録されない**
- **同種事象探索**: 件数上限の定数を全数探索 → `src/domain/validation.ts` の上限は
  `MAX_DISPLAY_NAME_LENGTH` (255) / `MAX_PATH_VALUE_LENGTH` (4096) / `MAX_DIR_ENTRIES` (2000) の
  **3 件**で、**登録件数の上限は 0 件**。
  `MAX_DIR_ENTRIES` の docblock (`validation.ts:57-62`) は「上限が無いと巨大なディレクトリ 1 つで
  IPC のペイロードと描画が破綻する」と**同じ理屈を既に採用している**。
  永続化件数に同じ配慮が無いのが非対称である。
- **リスク/影響**: spec は「永続化ファイルが壊れている」ケースを要件化しており、
  **ディスク上の内容は入力**である。件数を 10^5 に膨らませたファイル 1 本で起動時の復元が
  O(n^2) で固まり、SC-004 の「ランタイム一覧の初回描画 3 秒」(同じ main プロセス上) を巻き込んで破れる。
  通常運用でも、登録が数百件に育つと逐次 UNC 実在確認で一覧が体感的に止まる。
- **推奨アクション**:
  1. `src/domain/validation.ts` に `MAX_WORKSPACE_FOLDERS` (例 500) を置き `MAX_DIR_ENTRIES` と同じ扱いにする。
     `folder-store.ts` は超過分を読まず `too-many-records` として計上し、`register()` も上限で拒否する
     (**IPC 境界と永続化境界の双方が同じ定数を参照する** — `validation.ts:8-16` の方針どおり)
  2. 復元の重複判定を `Set` に変える (O(n) 化)。`isUniqueId` は登録時のまま残してよい
  3. `readFile` の前にサイズ上限を掛ける (`stat` の size が上限超なら読まずに退避する)
  4. `buildList()` の実在確認を束ねるか、上限件数で切る
  5. `list-folders` に予算を持たせるには SC-004 の改定が要るので**本 PR では触らない**
     (`measure.ts` の docblock の方針を尊重する)。代わりに上限で最悪時間を有界にする
- **根拠**: SC-004 / SC-013 / data-model.md §6 実在確認の制約 /
  `src/domain/validation.ts:57-62` (同型の上限を既に採用) / CWE-400 (Uncontrolled Resource Consumption)
- **scope 根拠**: feature。定数は `domain/validation.ts`、適用は `folder-store.ts` / `folder-service.ts`

### [Medium] registeredAt の値域検証が弱く、非整数・負値・天文学的な値がそのまま復元される (データ型適切性) (M-004) (scope: feature)

- **観察**: `folder-record.ts:88` は `typeof r.registeredAt !== 'number' || !Number.isFinite(...)` のみ。
  1e300 / -8.64e15 / 1.5 / 0 がすべて通る。`Number.isFinite(1e300)` は true であり、
  その値から作った `Date` は Invalid Date になる。
  この値は `folder-service.ts:162` で DTO にそのまま載り renderer へ渡る。
  スキーマ上の型は「epoch ミリ秒」であって「任意の有限数」ではない。
  他のフィールドは長さ・文字種・形式まで固めている (`id` は `wf_` + 英数字 8-32、
  `displayName` は長さ + 制御文字、`path.value` は長さ + 制御文字 + 名前空間形式) ので、
  **`registeredAt` だけが値域を持たない**。
- **同種事象探索**: `registeredAt` in `src/` → 実装 **5 件**
  (`folder-record.ts:28` allow-list / `:88` 検証 / `:116` 復元 / `folder-service.ts:162` DTO /
  `:212`, `:224` 登録時は `now()` なので健全)。
  `Number.isFinite` in `src/` → **1 件** (`folder-record.ts:88`)。
  `src/domain/validation.ts` に時刻の述語は **0 件**。
- **リスク/影響**: 「登録日時」を表示・整列に使う機能 (現行 UI とこれ以降の feature) で
  Invalid Date や逆順が出る。`invalid-record` として落とせば FR-019 の枠内で
  「復元できなかった」として正しく報告できるのに、通してしまうと
  **壊れた値が正常復元として扱われる** (SC-013 の「復元 100%」の質が下がる)。
- **推奨アクション**: `src/domain/validation.ts` に述語 (`isValidTimestamp`) を置き IPC 境界と共有する。
  条件は `typeof v === 'number'` かつ `Number.isSafeInteger(v)` かつ `v >= 0`。
  未来値の上限は時計巻き戻しで既存レコードが落ちるため置かない。
  `folder-record.ts:88` をこれに差し替え、`folder-store.test.ts:199` の隣に
  1e300 / -1 / 1.5 のケースを足す。
- **根拠**: FR-019 / contracts/workspace-store.md:61 (`registeredAt` が有限の数値でない → `invalid-record`) /
  `src/domain/validation.ts:8-16` (述語と上限を 1 箇所に集める方針)
- **scope 根拠**: feature

### [Medium] writeFile + rename に flush が無く「書き込み中のクラッシュで全件を失わない」という表明を満たしきれない (M-005) (scope: feature)

- **観察**: `folder-store.ts:20` と `:165` が「一時ファイル + rename による atomic 置換」で
  「書き込み中のクラッシュで全件を失わない」と表明している。実装 (`:167-168`) は
  `writeFile(temp)` → `rename(temp, file)` で、**temp の fsync も親ディレクトリの fsync も無い**。
  `rename` 自体は原子的だが、データが不揮発化される前に rename のメタデータが先に永続化されうるため、
  電源断後に**ゼロ長または部分内容のファイル**が残る余地がある。
  そのとき旧内容は既に rename で置換されて存在しない。
  次回起動は `parse-failed` 経路 (`:96-103`) に入り、**退避されるのは壊れた内容**であって
  旧内容ではないため、登録は復旧不能になる。
- **同種事象探索**: `fsync|datasync|.sync()` in `src/` → **0 件**。
  書き込み経路は `folder-store.ts:79` (退避) と `:167` (本体) の **2 件**のみで、どちらも flush 無し。
  退避側も `writeFile` 直書きなので、退避完了の判定が「呼び出しが返った」だけになっている。
- **リスク/影響**: 頻度は低い (電源断 / 強制終了 + FS のタイミング依存) が、影響は
  「全登録の喪失」であり docblock の表明と乖離している。
  H-001 の同時書き込みと合わせると、`parse-failed` は「起きない想定の経路」ではなく
  **到達しうる経路**として扱うべきである。
- **推奨アクション**:
  1. `open` → 書き込み → `sync()` → `close` → `rename` に変える (`node:fs/promises` の `open`)。
     可能なら親ディレクトリも同期する
  2. 置換前の内容を `workspace-folders.json.prev` として 1 世代だけ残す
     (壊れた置換からの復帰経路になる。`.bak` とは別概念で、「読めなかったから退避」ではなく
     「直前の正常内容」)
  3. fsync を入れないなら docblock の表明を実装に合わせて弱める
- **根拠**: contracts/workspace-store.md:89 / SC-013 / `folder-store.ts:20` の自己表明
- **scope 根拠**: feature

### [Medium] 永続化の回帰テストに、同時書き込み・旧スキーマ版・退避失敗・大量レコードの 4 観点が無い (M-006) (scope: feature)

- **観察**: `folder-store.test.ts` は 16 ケースで 未作成 / 正常復元 (所在 2 種・非 ASCII) /
  `parse-failed` / `schema-version-unknown` (未来版) / `namespace-mismatch` / `id` 重複 /
  `displayName` (制御文字・長さ) / バックスラッシュ POSIX 値 / `distroName` 文字種 / 未知キー /
  `registeredAt` 型 / 部分破損 / 例外 0 件 / 書き込み 3 件 を押さえており、
  contracts/workspace-store.md §テスト の 5 行 (復元・重複・破損・UI 到達・allow-list) を満たす。
  一方で本 review が挙げた経路は**どれも 0 件**:
  同時 `save()` (H-001) / `schemaVersion` がより小さい値 (M-001) / 退避の失敗 (M-002) /
  件数上限と O(n^2) (M-003)。
- **同種事象探索**: `Promise.all|concurrent|同時` in `folder-store.test.ts` → **0 件**。
  `EACCES|EPERM|readonly` in `src/main/infra/settings/` → **0 件** (書き込み失敗の注入点が無い)。
  `schemaVersion: 0` / `schemaVersion: 2` in `src/` → **0 件**。
- **リスク/影響**: 上記 High / Medium を直しても**pin が無いので再発を検出できない**。
  特に H-001 は「直列化を消しても既存 16 ケースは全部緑」である。
- **推奨アクション**: 各指摘の推奨アクションに挙げたテストを 4 本足す。
  退避失敗は読み取り専用ディレクトリを作るより、`FolderStore` の生成時に書き込み関数を
  注入できるようにする方が安定する (現在は `node:fs/promises` を直接 import しているため注入点が無い。
  `now` を注入している設計 (`folder-store.ts:54`) と同じ理屈で書き込みも注入対象になりうる)。
- **根拠**: SC-013 / contracts/workspace-store.md §テスト / reviewer-base cat H
- **scope 根拠**: feature

### [Low] トップレベルのキーに allow-list が無く、契約の「未知のキーは読み書きのどちらでも通さない」と非対称 (L-001) (scope: feature)

- **観察**: `folder-record.ts:72-75` はレコード単位で `RECORD_KEYS` の allow-list を強制するが、
  `folder-store.ts:113-126` はルートオブジェクトについて `schemaVersion` と `folders` だけを見て、
  **未知のトップレベルキーを黙って無視する**。
  `schemaVersion` と `folders` に加えて任意のキーを持つファイルは「正常」として読まれ (`skipped: 0`)、
  次の `save()` で静かに消える。
  contracts/workspace-store.md:43 は「保存するフィールドはコード上の allow-list で固定し、
  **未知のキーは読み書きのどちらでも通さない**」と書いており、レコード単位に限る読み方は文面から自明ではない。
- **同種事象探索**: `RECORD_KEYS` in `src/` → **2 件** (`folder-record.ts:28` 定義 / `:74` 適用)。
  ルート用の allow-list 定数は **0 件**。
- **リスク/影響**: 現在の実害は無い (無視されるだけ)。ただし Principle V の観点では
  「秘密らしきキーが混入したファイルを黙って受理して、次の保存で消す」挙動は検出も報告もされない。
  版スキュー (未来版が同じ `schemaVersion` で追加キーを持つ) の兆候も見逃す。
- **推奨アクション**: ルート用 allow-list (`schemaVersion` / `folders`) を置き、
  未知のトップレベルキーがあれば退避したうえで計上する (破棄はしない — `folders` が読めるなら読む)。
  少なくとも「読み取り側の allow-list はレコード単位」と契約側に明記する。
- **根拠**: contracts/workspace-store.md:43 / Constitution Principle V
- **scope 根拠**: feature

### [Low] 退避ファイルが無制限に増え、同一ミリ秒の退避は上書きされる (L-002) (scope: feature)

- **観察**: `folder-store.ts:67-70` の退避先は `workspace-folders.json.<now()>.bak`。
  `:77-81` は `writeFile` を排他フラグなしで呼ぶため、**同じスタンプの既存退避を黙って上書きする**。
  また、恒久的に不正なレコードが 1 件混ざったファイルは、利用者が登録操作をしない限り
  `save()` で書き直されないため、**起動ごとに `.bak` が 1 つ増える** (`:148` は `skipped > 0` なら毎回退避する)。
  世代数の上限も掃除も無い。
- **同種事象探索**: `.bak` in `src/` → **3 件** (`folder-store.ts:68` 生成 /
  `folder-store.test.ts:71` 件数検査 / `ResolutionScreen.test.tsx:252` fixture)。
  削除・世代管理のコードは **0 件**。排他フラグ (`wx` / `flag:`) の使用は **0 件**。
- **リスク/影響**: userData 配下に登録パス一覧のコピーが溜まり続ける (秘密ではないが利用者の
  ディレクトリ構成が残る)。同一ミリ秒の衝突は実運用では稀だが、`now` が固定された環境では確実に起きる
  (`folder-store.test.ts:29` の `NOW` 固定は、退避が 1 件しか残らないことに依存している)。
- **推奨アクション**: 排他フラグで開いて衝突時は連番を付す。世代数に上限 (例 5) を設けて古いものから消す。
  同一内容なら再退避しない (内容比較) でも足りる。
- **根拠**: FR-019 / contracts/workspace-store.md:93 (退避先は利用者への報告に含める)
- **scope 根拠**: feature

### [Low] infra/secrets/ の空ディレクトリは記録されているが、実体の無い許可リストが 2 箇所に生きている (L-003) (scope: feature)

- **観察 (依頼された確認項目 5 の結論)**: **「何のために用意され、いつ何が入る予定か」は記録されている。**
  - `src/main/infra/secrets/.gitkeep` 自身に
    「`infra/secrets` は electron import の唯一の例外枠 (AD-023 §8)。`safeStorage` を使う X-3 で実装する。R-1 では空。」
  - `spec.md:393` (FR-038) / `tasks.md:54` / `plan.md:145`
    (「`secrets/` (空。electron import の例外枠。X-3 で使う)」)
  - `docs/decisions/0023-application-architecture.md:356-366` §8 が根拠 ADR
  したがって**記録漏れの指摘は出さない**。残る観察は、この空ディレクトリに対する許可リストが
  2 箇所で生きていることである: `.dependency-cruiser.js:52` の許可正規表現
  (`electron-only-from-app-and-secrets`, :231) と
  `eslint.config.mjs:96-97` の `SECRETS_PATTERN` / `SECRETS_FILES` (:193, :326-332)。
- **同種事象探索**: `secrets` in `*.js` / `*.mjs` / `src/` → 実装側 **9 件**
  (`.dependency-cruiser.js:52,231,233` / `eslint.config.mjs:96,97,104,193,326,332`)。
  `src/main/infra/secrets/` 配下の `.ts` は **0 件** (`.gitkeep` のみ)。
- **リスク/影響**: AD-024 自身が本文 :24-25 と #1 / #6 で「実在しないパスを検査する規則は
  **常に空を返し常に合格する**」ことを問題として挙げている。ここは逆向き
  (実在しないパスを**許可**している) だが同型で、最初にこのディレクトリへ置かれたファイルは
  「`electron` を import してよい / Principle V の自動検証は無い (H-003)」の 2 条件を同時に満たす。
  X-3 が `safeStorage` を入れる場所がまさにここである。
- **推奨アクション**: 本 PR で塞ぐ必要はない。H-003 の Principle V 項目を入れるときに
  **走査対象に `src/main/infra/secrets/**` を明示的に含める** (空でも「対象として列挙されている」状態にする)。
  併せて X-3 の申し送りに「`infra/secrets/` へ最初のファイルを置く feature が
  Principle V の Automated 検証を通ること」を条件として残す。
- **根拠**: AD-023 §8 / FR-038 / AD-024 本文 :24-25 (実在しないパスを指す規則) / Constitution Principle V
- **scope 根拠**: feature (X-3 への申し送りは system)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `store\.save\(` / `\.save\(folders` in `src/` | 2 | `src/main/app/folder-service.ts:360`, `:382` |
| H-001 | `mutex|queue|serial|inFlight|pending` (-i) in `src/` | 1 (無関係) | `src/renderer/src/components/assistant-ui/elements/tool-fallback.aui.tsx:257`。直列化機構 **0 件** |
| H-001 | `writeFile|appendFile|createWriteStream` in `src/**/*.ts` | 3 (実装 2) | `folder-store.ts:79`, `:167`, `folder-store.test.ts:51` |
| H-001 | renderer の in-flight ガード | 0 | `WorkspaceFoldersScreen.tsx:495-502`, `useFolders.ts:172-188` |
| H-002 | `skipped: 1` in `src/` | 3 | `folder-store.ts:101`, `:109`, `:122` |
| H-002 | 報告値の消費側 | 1 | `WorkspaceFoldersScreen.tsx:510` |
| H-003 | `check.mjs` の principle タグ全数 | V は **0 件** (VI×9 / II×1 / FR-040×1 / FR-039+040×1) | `scripts/constitution/check.mjs:137,147,162,188,214,227,231,243,254,323,344,365,392,399,481,530` |
| H-003 | `api_?key|safeStorage|secret|password|schemaVersion|settings` (-i) in `scripts/` | 1 (無関係) | `scripts/constitution/allowlists.mjs:297` |
| H-003 | `token|secret|password|apiKey|credential` (-i) in `src/main/infra/settings/` | 3 (全件テスト fixture) | `folder-store.test.ts:194`, `:268`, `:273`。永続化フィールドとしては **0 件** |
| H-003 | 永続化 allow-list の実体 | 1 | `folder-record.ts:28` |
| M-001 | `SCHEMA_VERSION` in `src/` | 4 (版変換コード 0 件) | `folder-record.ts:31`, `folder-store.ts:114`, `:160`, `folder-store.test.ts:9` |
| M-001 | `schemaVersion: 0` / `: 2` in `src/` | 0 | — |
| M-002 | `await backup(` in `folder-store.ts` | 4 | `:98`, `:106`, `:119`, `:148` |
| M-002 | `RestoreIssueReason` の値 | 5 (`backup-failed` は 0 件) | `src/domain/workspace/dto.ts:35-40` |
| M-003 | `MAX_` in `src/domain/validation.ts` | 3 (件数上限は 0 件) | `validation.ts:46`, `:55`, `:63` |
| M-004 | `Number.isFinite` in `src/` | 1 | `folder-record.ts:88` |
| M-005 | `fsync` / `datasync` / `.sync()` in `src/` | 0 | — |
| M-006 | `Promise.all|concurrent|同時` in `folder-store.test.ts` | 0 | — |
| L-001 | `RECORD_KEYS` in `src/` | 2 (ルート用は 0 件) | `folder-record.ts:28`, `:74` |
| L-002 | `.bak` in `src/` | 3 (掃除コード 0 件) | `folder-store.ts:68`, `folder-store.test.ts:71`, `ResolutionScreen.test.tsx:252` |
| L-003 | `secrets` in `*.js` / `*.mjs` / `src/` | 9 (`src/main/infra/secrets/**/*.ts` は 0 件) | `.dependency-cruiser.js:52,231,233`, `eslint.config.mjs:96,97,104,193,326,332` |
| 全体 | `*.sql` / `**/migrations/**` / `schema.prisma` | 0 | 対象なし (R-1 の設計どおり。指摘としては出さない) |

## Verdict

- Critical: 0
- High: 3
- Medium: 6
- Low: 3
