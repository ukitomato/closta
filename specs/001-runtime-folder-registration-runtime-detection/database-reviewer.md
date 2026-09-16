# database-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: database-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (pr-gate / database-persistence track)

## 初回読了 viewpoint

読了: `.claude/agents/reviewer-base.md` / `spec.md` (FR-014 / FR-016 / FR-019 / FR-020 / FR-025 / FR-038 / FR-039, SC-004 / SC-013 / SC-014)
/ `plan.md` §Domain Context / `data-model.md` §6 / `contracts/workspace-store.md` 全文
/ `.specify/memory/constitution.md` Principle V (`:291-315`) / `docs/decisions/0024-constitution-verification-paths.md` Decision Outcome
/ `docs/decisions/0027-rule-firing-verification-and-service-io-rule.md` (本 round の新規 ADR)
/ `pr-gate.md` (Round 1 verdict) / `.gate-verdict-code.json` / `code-gate.md` (MUST_FIX 7 件の解消表 `:76-82`)
/ `database-reviewer.md` (自身の Round 1 出力)

**本 PR で実装/影響される FR / SC (永続化スコープ)**

- FR-014 — 所在つきで永続化し再起動後に復元する (`folder-store.ts:84-154`)
- FR-016 — `(所在, 正規化済みパス)` の一意性 (`registry.ts:24-31`)。**`id` の一意性は読み戻し側だけが要求する** (`folder-store.ts:139`)
- FR-019 — スキーマ版 / 名前空間つきパス / 上書き前の退避 / 件数と理由の提示 / 秘密フィールドの不在
- FR-020 — 単一インスタンス (`src/main/index.ts:28`)。プロセス間の同時書き込みのみを塞ぐ
- FR-025 — パス組み立ては `domain` のパス API 経由 (`folder-store.ts:55-71`)
- FR-038 — `infra` は `electron` を import しない。`userDataDir` を composition root から注入 (`composition-root.ts:60-64`)
- SC-013 — 復元 100% / 重複 0 件 / 破損・版不一致・名前空間不一致で起動失敗 0 件 + 件数・理由の描画 + 元データの退避
- SC-014 — 2 重起動で永続化ファイルの更新時刻が変化しない

**touched files に該当する charter / Confirmation**

- Constitution **Principle V** `:314`「Manual: `database-reviewer` (スキーマ**と設定層**)」— 本 review がこの Manual arm
- Constitution Principle V `:311-313`「**SQL のカラム型だけに依存しない** — 設定ファイル (JSON / YAML) の永続化スキーマも対象に含める (AD-024 #9)」
- AD-024 (accepted) Decision Outcome `:106`「V | `scripts/constitution/check.mjs` (設定ファイルを走査対象に含む)」
- `contracts/workspace-store.md:42-46` — 秘密フィールドの不在 / allow-list を実装側の担保とする暫定措置
- `contracts/workspace-store.md:59` / `:66` — **`id` が形式不正または他のレコードと重複する → 復元せず `invalid-record`**。「`id` の一意性を要求しないと `unregisterFolder(id)` / `resolveFolderRuntime(folderId, ...)` の対象が一意に決まらない」
- **AD-027** (本 round で追加。`:109` が `deps.newId: () => string` への置き換えを記録) — 本 round の新規判定対象

**severity 集計**

- A. 認可 / 認証 / RLS: 該当なし: owner は `security-reviewer`。SQL / RLS policy / GRANT は **0 件** (R-1 の設計どおり。指摘としては出さない)。認証 context を参照する永続化フィールドも 0 件。**ブラウズトークンの予測困難性そのものは cat A の owner に委ねる** — 本 reviewer は M-008 で「永続化ファイルが生成列の観測窓になる」面だけを扱う
- B. 入力検証 / injection / 暗号: 該当なし: owner は `security-reviewer`。ディスク上 JSON を未信頼入力として扱う観点は永続化スキーマの責務として G に集約した
- C. 業務不変条件 / Charter drift: 該当なし: owner は `architecture-reviewer`。`data-model.md` §6 の不変条件 (所在×パス名前空間の一致 / `reachability` を永続化しない) は `folder-record.ts:109` / `:147-151` で実装と一致し、本 round でも変化なし
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:0
- E. User Story 価値 / SC 計測可能性 / AC: 該当なし: owner は `po-reviewer`。SC-013 の「件数」の**報告値そのもの**は永続化層が算出しているため G (H-002) に置いた
- F. 命名 / module 配置 / lint hookup: 該当なし: owner は `convention-reviewer`。`newId` / `makeFolderId` / `RECORD_KEYS` / `SCHEMA_VERSION` の命名は一貫しており指摘なし
- G. DB / 永続化スキーマ / index 相当 / データ型: Critical:0 High:3 Medium:6 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

R-1 の永続化は **SQL / migration / Prisma を一切持たない JSON 設定ファイル 1 本** (`<userData>/workspace-folders.json`)
である。Round 2 で `src/main/infra/settings/` は **1 バイトも変わっていない** (`git log -- src/main/infra/settings/`
の最新は `6c3f4aa`、これは Round 1 より前)。`src/domain/workspace/dto.ts` / `src/domain/validation.ts` も同様。
したがって **Round 1 の High 3 / Medium 6 / Low 3 は 12 件すべて unresolved** である。

本 round の変更は識別子の生成源の注入 (`cfec16b`) で、永続化から見ると**書き込み側の唯一の id 生産者が
モジュール内の固定実装から差し替え可能な seam になった**ことを意味する。読み戻し側は
`contracts/workspace-store.md:59` / `folder-store.ts:138-143` で **`id` の一意性を要求し続けている**のに対し、
書き込み側にはその検査が 1 件も無く、seam の契約文 (`folder-service.ts:95`) には長さ条件しか書かれていない。
これが本 round の新規指摘 H-004 である。あわせて、テストが `newId` を差し替えたことで
**production の生成源を実行するテストが 0 件**になり (M-007)、1 つの源が永続 id と capability トークンを
兼ねる構図 (M-008) と、読み側が生成不能な id を受理する値域の非対称 (L-004) を新規に挙げる。

`.gate-verdict-code.json` と `code-gate.md:76-82` を読み、code-gate iteration 1 の MUST_FIX 7 件
(MF-001 / MF-006 / MF-007 = a11y、MF-002 / MF-005 = ux、MF-003 = test、MF-004 = CSP) はいずれも
永続化層と `path:line` が重複しないことを確認した。**suppress 対象 0 件。**

## 依頼された 3 項目への直接回答

### 1. 識別子の一意性 — 衝突リスクは上がっていない (Round 1 と同等)

`composition-root.ts:80` の `randomUUID().replace(/-/g, '')` は RFC 4122 v4 の 32 桁小文字 hex である。
`makeFolderId` (`registry.ts:65-69`) は `[^0-9a-z]` を除去 (hex なので除去 0 文字) してから `slice(0, 24)` を取る。
先頭 24 桁のうち index 12 はバージョン `'4'` (4 bit 固定)、index 16 は variant の上位 2 bit が固定なので、
**永続化される `id` の実効エントロピーは 96 - 6 = 90 bit** である。件数上限が無い (M-003) 状態でも、
登録 500 件での誕生日衝突確率は約 `500^2 / 2 / 2^90 ~ 1e-22`。**実用上 0。**

Round 1 時点の実装 (`folder-service.ts` 内で `randomUUID().replace(/-/g,'')` を直接呼ぶ) と
**エントロピーは完全に同一**であり、注入化そのものによる衝突リスクの増加は観察されない。
変わったのは「その保証がどこに宿るか」だけで、その移動が H-004 / M-007 の根拠になる。

### 2. テスト用の決定的 `newId` が production に漏れる経路 — **0 件**

- `newId` は `FolderServiceDeps` の**必須プロパティ** (`folder-service.ts:97`。`?` も既定値も無い)。既定のフォールバック実装は存在しない
- `createFolderService` の呼び出しは **2 件のみ** (`composition-root.ts:66` / `folder-service.test.ts:127`)。production 経路は前者だけである
- `folder-store.test.ts` の書き込み先は `tests/.tmp/store-*` (`:27`, `:35-39`) で、`.gitignore:64` が `tests/.tmp/` を無視している。アプリが読むのは `app.getPath('userData')` 配下だけ (`composition-root.ts:60`) なので、テストが書いたファイルがアプリに読まれる経路は無い
- テストの `testid00000001` は確かに `isValidFolderId` を通る (`wf_testid00000001` は `/^wf_[0-9a-z]{8,32}$/` に一致する) が、そもそも `folder-service.test.ts` の store は `async save() {}` のスタブ (`:109-111`) でディスクに何も書かない。**さらに `register()` を呼ぶテストが 1 件も無い** (M-007 の根拠)
- **ブラウズトークンは永続化されない。** `sessions` は in-memory `Map` (`folder-service.ts:108`) で、`fromFolderRecord` (`folder-record.ts:136-153`) が出力するキーは `RECORD_KEYS` の 5 つだけ。トークンが JSON に載る経路は 0 件 (Principle V の実体面は本 round でも維持されている)

**結論: 混入経路は観察されない。** ただし「漏れない」ことを担保しているのは型 (必須プロパティ) と
呼び出し箇所の少なさだけで、テストは 0 件である (M-007 に含める)。

### 3. 識別子側の値域/形式の検証 — `registeredAt` (M-004) より強いが、書き込み側に一意性が無い

読み側の `id` 検証は `isValidFolderId` (`registry.ts:53-57`) が接頭辞・文字種・長さの 3 点を固めており、
**値域を持たない `registeredAt` (M-004、未対応) より明確に強い**。ただし 2 つの穴が残る。

- **一意性は読み側だけにある** → H-004
- **読み側の許容幅 (8-32) が書き側の値域 (常に 24 以下) より広い** → L-004

`registeredAt` 側は Round 1 の M-004 のまま未対応であり、`folder-record.ts:88` は
`typeof === 'number' && Number.isFinite()` のみで `1e300` / `-1` / `1.5` を通す。
**識別子と時刻の 2 フィールドで「読み側が書き側より緩い」構図が共通しており、修正は
`src/domain/validation.ts` に述語を集める M-004 の推奨アクションで一括して塞げる。**

## Round 1 からの継承判定 (12 件を 1 件ずつ)

根拠: `git log --oneline -- src/main/infra/settings/ src/domain/workspace/dto.ts src/domain/validation.ts`
→ 最新は `6c3f4aa` (Round 1 より前)。直近 3 コミット (`3acc803` / `ca6f2ce` / `cfec16b`) の
`--stat` に `src/main/infra/settings/**` は **0 件**。`scripts/constitution/check.mjs` は `ca6f2ce` で
`scripts/rules/run.mjs` 側のみが変わり、Principle V の項目追加は無い。

| ID | 指摘 | 本 round の状況 | 根拠 |
|---|---|---|---|
| H-001 | 固定一時ファイル名 + 無直列化の同時 save | **unresolved** | `folder-store.ts:29` (`TEMP_NAME` 固定) / `:156-169` (排他なし) が未変更。`store.save(` の呼び出しは `folder-service.ts:370` / `:392` の 2 件で、いずれも直列化なし (Round 1 の `:360` / `:382` から**行番号のみ** `newId` docblock 挿入で +10 行ずれた)。`mutex|queue|serial|inFlight|pending` (-i) の実装は依然 **0 件** |
| H-002 | ファイル全体の失敗を常に `skipped: 1` と報告 | **unresolved** | `folder-store.ts:101` / `:109` / `:122` が未変更。`dto.ts` の `RestoreIssuesDTO` も未変更 |
| H-003 | Principle V の Automated 検証が不在で AD-024 の正本表と食い違う | **unresolved** | `scripts/constitution/` に Principle V の検査項目は依然 **0 件** (`check.mjs:114` / `:325` / `allowlists.mjs:289` の 3 件はすべて VI)。`constitution.md:296` の `bad_pattern_grep` は SQL カラム型 (`(TEXT|BLOB|VARCHAR)`) のまま。`docs/verify-report.md:205` は `| V | 秘密値カラム / ログ混入 | 0 | 0 | pass |` と記録済み |
| M-001 | スキーマ版の移行 seam が無い | **unresolved** | `folder-store.ts:114` の等値比較 1 本が未変更。版変換コード 0 件 |
| M-002 | 退避の失敗が `load()` 全体を throw させる | **unresolved** | `folder-store.ts:77-81` / `:98` / `:106` / `:119` / `:148` が未変更。`dto.ts` に `backup-failed` は 0 件 |
| M-003 | 件数上限が無く復元が O(n^2)、一覧構築が逐次 I/O | **unresolved** | `validation.ts` 未変更 (`MAX_WORKSPACE_FOLDERS` 0 件)。`folder-store.ts:126-145` / `folder-service.ts:183-189` の逐次 `await checkExistence` も未変更 |
| M-004 | `registeredAt` の値域検証が弱い | **unresolved** | `folder-record.ts:88` が `Number.isFinite` のみで未変更。**依頼項目 3 の対象**。本 round で `id` 側と比べると非対称がさらに明確になった (L-004 参照) |
| M-005 | `writeFile` + `rename` に flush が無い | **unresolved** | `folder-store.ts:165-168` 未変更。`fsync|datasync|\.sync\(` は `src/` に **0 件** |
| M-006 | 回帰テストに 4 観点 (同時書き込み / 旧版 / 退避失敗 / 大量レコード) が無い | **unresolved (加えて根拠が強まった)** | `folder-store.test.ts` 未変更。**本 round で追加された `services-not-to-io` ルール (`.dependency-cruiser.js`) は「調停は I/O を注入で受け取る」を機械強制として確立した** — M-006 が推した「`FolderStore` の書き込み関数を注入して退避失敗を試験する」形は、リポジトリ自身が新たに採用した論法と同型になった |
| L-001 | ルートオブジェクトに allow-list が無い | **unresolved** | `folder-store.ts:113-126` 未変更。ルート用 allow-list 定数 0 件 |
| L-002 | `.bak` の世代管理なし / 同一ミリ秒で上書き | **unresolved** | `folder-store.ts:67-81` 未変更。削除・世代管理・排他フラグ 0 件。Round 1 で platform-boundary L-004 と統合済み (`pr-gate.md:117`) |
| L-003 | `infra/secrets/` への electron 許可が対象 0 件 | **unresolved (悪化の兆候あり)** | `src/main/infra/secrets/` は `.gitkeep` のみで `.ts` 0 件。本 round の `services-not-to-io` の comment は「**X-3 の `ProviderService` を作るときは、ここに実名を足すこと**」と明記した。X-3 が `infra/secrets/` に `safeStorage` を置く時点で「electron を import してよい」「Principle V の自動検証が無い (H-003)」「services ルールの実名列挙が要る」の 3 条件が同時に立つ |

**resolved: 0 / partially: 0 / unresolved: 12。**

## Findings

### [High] 注入された newId の契約が永続化が要求する id 一意性を書いておらず、書き込み側に一意性検査が 0 件になった (H-004) (scope: feature)

- **観察**:
  - `contracts/workspace-store.md:59` は「**`id` が形式不正、または他のレコードと重複する** → 復元せず `invalid-record` として計上する」と定め、`:66` が理由を「`id` の一意性を要求しないと `unregisterFolder(id)` / `resolveFolderRuntime(folderId, ...)` の対象が一意に決まらない」と書いている。実装もこれに従い `folder-store.ts:138-143` が `isUniqueId(folders, result.folder.id)` を**読み戻し時に**要求する。
  - ところが**書き込み側にこの検査は 1 件も無い**。`folder-service.ts:341-384` の `register()` は `findDuplicate` (= `(所在, パス)` の重複。`registry.ts:24-31`) だけを見て、`isUniqueId` を呼ばずに `folders = [...folders, candidate]` (`:369`) → `store.save(folders)` (`:370`) する。
  - `id` の生産者は `folder-service.ts:212` の `makeFolderId(newId)` 1 箇所のみで、本 round (`cfec16b`) でその `newId` が**注入された seam** になった。seam の契約文 (`folder-service.ts:86-97` の docblock) が課している条件は「**8 文字以上の英数字を返すこと。`makeFolderId` が短すぎる値を拒否する**」の 1 行だけで、**一意性にも予測困難性にも言及がない**。
  - `makeFolderId` (`registry.ts:65-69`) も検査するのは strip 後の長さ `>= 8` だけである。したがって `newId = () => 'aaaaaaaa'` は**文書化された契約を完全に満たしながら**毎回同じ `wf_aaaaaaaa` を返す。`registry.test.ts:120` が pin しているのも `makeFolderId(() => 'abc')` が throw することだけで、**値が呼び出しごとに変化することを要求するテストは 0 件**である。
  - 重複 `id` が成立したときの帰結は 2 段になる。
    (a) **同一セッション内**: `unregister(id)` は `folders.filter((folder) => folder.id !== id)` (`folder-service.ts:389`) なので、**1 枚のカードの解除操作で同じ `id` を持つ全エントリが消える**。`resolve(folderId, ...)` は `find` (`:399`) なので先頭 1 件にしか当たらず、2 件目は永久に解決できない。
    (b) **次回起動時**: `folder-store.ts:139-143` が 2 件目以降を `skipped += 1` / `invalid-record` として**黙って捨て**、`:148` が `.bak` を 1 本生成する。利用者に出るのは「復元できなかった登録が 1 件あります」だけで、**原因が書き込み側にあることは画面からも `.bak` からも判別できない**。
  - Round 1 では同じ保証が `folder-service.ts` 内の固定実装として**同一ファイル内に**あった。本 round でそれが呼び出し側の裁量に移り、かつ移した先の契約文には条件が書かれていない。
- **同種事象探索**:
  - `makeFolderId|isValidFolderId|isUniqueId` in `src/` → **12 件**。うち `isUniqueId` の**実装側呼び出しは 1 件のみ** (`folder-store.ts:139` = 読み戻し)。定義は `registry.ts:34`、残り 2 件は `registry.test.ts:125,126`。**書き込み経路からの `isUniqueId` 呼び出しは 0 件**
  - `makeFolderId(` の呼び出し → 実装 **1 件** (`folder-service.ts:212`)。ほかは `registry.test.ts:115,120` と docblock 参照 (`composition-root.ts:78` / `folder-service.ts:93,95` / `folder-service.test.ts:122`)
  - `newId` in repo (node_modules 除く) → **8 件**。実装は `composition-root.ts:80` (production の唯一の源) / `folder-service.ts:97,101,212,255` / `folder-service.test.ts:125,135`。残り 1 件は `docs/decisions/0027-...md:109` の記録。**既定値・フォールバック実装は 0 件**
  - `createFolderService` の呼び出し → **2 件** (`composition-root.ts:66` / `folder-service.test.ts:127`)
  - `\.register\(` / `registerFolder` in `src/` → service を直接呼ぶテストは **0 件** (renderer / preload / ipc / capability の宣言と renderer 呼び出しのみ)。**重複 `id` を作る回帰テストの置き場すら無い**
  - 同型の seam (注入源の契約が消費側の不変条件より緩い) → `now: () => number` (`folder-store.ts:54` / `folder-service.ts:84`) も同じ形だが、時刻は一意性を要求されないため該当しない。**同型は `newId` の 1 件のみ**
- **リスク/影響**: `contracts/workspace-store.md:66` が明文化した不変条件 (`id` の一意性) の**生産側が無防備**になった。
  現行の `composition-root.ts:80` は 90 bit のエントロピーを持つため**現時点で実害は成立していない** (依頼項目 1 の回答参照) — これが Critical にしない理由である
  (reviewer-base の severity 禁則「真に Critical なのは現時点で観察事実として実害が成立している経路のみ」)。
  それでも High とするのは次の 3 点が観察事実として揃っているためである。
  (1) **契約文が定数源を許している** (`folder-service.ts:95` の条件は長さのみ)。
  (2) **違反したときの失敗モードがエラーではなく黙った永続データ喪失である** (`folder-store.ts:139-143` が `skipped` に埋め、H-002 の過小報告と合流する)。
  (3) **書き込み側に検査が 0 件なので、将来この seam に別の源を渡す feature を止める機構がどこにも無い** (X-1 / X-3 / I-2 で Service が 3 つ増えることは `.dependency-cruiser.js` の `services-not-to-io` comment 自身が明記している)。
  AD-027 が確立した「調停は I/O を注入で受け取る」は正しい方向だが、**注入に移した値の不変条件を契約として書き下ろす作業が伴っていない**。
- **推奨アクション**:
  1. `folder-service.ts:86-97` の docblock に永続化が要求する条件を明記する。最小形は
     「**呼び出しごとに異なる値を返すこと。永続化される `id` の一意性と、ブラウズトークンの推測不能性の双方がこの性質に依存する**
     (`contracts/workspace-store.md:59` / `:66`)。暗号論的乱数源を使うこと。8 文字以上の `[0-9a-z]`」
  2. **書き込み側に一意性検査を置く。** `folder-service.ts:349` の直後に
     `if (!isUniqueId(folders, candidate.id)) return { ok: false, reason: 'id-collision', existing: null }`
     を足す (`RegisterFolderResult` の `reason` に 1 値追加)。
     **黙って上書きさせない**のが要点で、`register()` が失敗を返せば利用者は再試行できる。
     読み戻し側で捨てる (`folder-store.ts:139`) のは既に手遅れの場所である
  3. `unregister` を `id` 一意前提で書いていることを明示する。`filter` (`:389`) は重複時に**複数件消す** —
     一意性検査が入るまでは 1 件しか消さない形にするか、少なくとも「`id` は一意であることが `register` 側で保証される」を docblock に書く
  4. `registry.test.ts` に「同じ値を返す源では `makeFolderId` が同じ `id` を返す」ことを**明示的に pin** し、
     `folder-service.test.ts` に「定数 `newId` で 2 件登録すると 2 件目が `id-collision` で拒否される」を足す
     (M-007 の `register()` テスト不在と同時に解消できる)
- **根拠**: `contracts/workspace-store.md:59` / `:66` / FR-016 / FR-019 / SC-013 /
  AD-027 `:109` (注入への置き換えの記録) / AD-023 §5 / §7 / CWE-330 (Use of Insufficiently Random Values) の契約欠落面
- **scope 根拠**: feature。`folder-service.ts` / `registry.ts` / `contracts/workspace-store.md` はいずれも本 PR の touched files であり、書き込み側の 1 分岐と docblock 1 段落で閉じる

### [High] 同一の一時ファイル名へ無直列化で書き込むため、同時 save がファイルを壊しメモリとディスクが乖離する (H-001) (scope: feature) — Round 1 から unresolved

- **観察 (本 round で再確認)**: `folder-store.ts:29` の `TEMP_NAME = 'workspace-folders.json.tmp'` は**プロセス共有の固定値**のままで、`:156-169` の `save()` は `writeFile(temp)` → `rename(temp, file)` を**排他なしで**実行する。呼び出し側は `folder-service.ts:370` (`register`) / `:392` (`unregister`) の 2 件で、どちらも `await ensureLoaded()` で一度 yield したあと `folders` を差し替えて `await store.save(folders)` するだけである (Round 1 の `:360` / `:382` から行番号が +10 ずれたのは `newId` docblock の挿入によるもので、**構造は同一**)。
  重なったときの帰結は Round 1 と同じ 2 つ — (a) 同一パスへの 2 つの `O_TRUNC` 書き込みが交錯して次回起動が `parse-failed` で全件退避、(b) 先行 `rename` が temp を移動済みで後続が ENOENT reject → `save()` が throw し `ipc.ts` 経由で renderer に伝播、**メモリは 2 件削除済み / ディスクは 1 件削除済み**で残る。
- **同種事象探索**: `store\.save\(` in `src/` → **2 件** (`folder-service.ts:370`, `:392`)。`mutex|queue|serial|inFlight|pending` (-i) の直列化機構 → **0 件** (該当は `tool-fallback.aui.tsx:257` の文字列のみ)。renderer の in-flight ガード → **0 件**。一時ファイル名を共有する他の書き手 → **0 件**。
- **リスク/影響**: SC-013「復元 100%」/ FR-014 が壊れる。FR-020 の単一インスタンス制限は**プロセス間**の同時書き込みしか塞がず、`contracts/workspace-store.md:88` の根拠欄はこの穴を覆っていない。FR-039 は「main 側は送信元とペイロードの双方を未信頼として検証」と定めており、**renderer が invoke を直列化することを前提にしてはならない**。
- **推奨アクション**: Round 1 の 4 点 (store 内の promise chain / 一時ファイル名の一意化 / 失敗時の `.tmp` 掃除 / `Promise.all([save(a), save(b)])` の回帰テスト) をそのまま維持。`pr-gate.md:103` が指摘したとおり **H-A (single-flight 不在) と同じ直列化機構で 3 面に効く**。
- **根拠**: FR-014 / FR-019 / FR-020 / FR-039 / SC-013 / `contracts/workspace-store.md` §書き込みの規則 / CWE-362 / CWE-367
- **scope 根拠**: feature

### [High] ファイル全体が読めなかったときの損失件数を常に 1 と報告し、UI が事実に反する数を出す (H-002) (scope: feature) — Round 1 から unresolved

- **観察 (本 round で再確認)**: `folder-store.ts:101` / `:109` / `:122` が `parse-failed` / `schema-version-unknown` を **`skipped: 1`** で返す。実際に失われたのはファイルに含まれていた全登録である。renderer は `WorkspaceFoldersScreen.tsx` で `restoreIssues.skipped` をそのまま「復元できなかった登録が N 件あります」に埋める。`folder-store.test.ts` はこの経路を通るが `skipped` を assert していないため誤りが pin されていない。`dto.ts` の `RestoreIssuesDTO` も未変更。
- **同種事象探索**: `skipped: 1` in `src/` → **3 件** (`folder-store.ts:101`, `:109`, `:122`)。レコード単位の計上 (`:134`, `:141`) は正しい。
- **リスク/影響**: SC-013 の「復元できなかった件数と理由が画面上に描画され」と FR-019 を満たさない。過小報告のまま利用者が次の登録操作を行うと `save()` が元ファイルを置換し、`.bak` が唯一の残存コピーになる。**H-004 の重複 `id` も同じ `skipped` に埋まるため、2 種類の原因が同じ「1 件」に潰れる。**
- **推奨アクション**: Round 1 の 4 点 (`RestoreIssuesDTO` にファイル単位の失敗を表す場を足す / UI 文言を 2 系統に分ける / `schema-version-unknown` で `root.folders` が配列なら要素数を報告 / 10 件入りファイルの `parse-failed` で `skipped !== 1` を pin) を維持。
- **根拠**: SC-013 / FR-019 / US-2 AC-14 / `contracts/workspace-store.md` §読み戻しの規則 / FR-047
- **scope 根拠**: feature

### [High] Principle V の Automated 検証が実体として存在せず、AD-024 が定めた「正本」と repo 状態が食い違う (H-003) (scope: feature) — Round 1 から unresolved

- **観察 (本 round で再確認)**: `constitution.md:310-313` の Principle V / Verification / Automated は `amended: 2026-09-15 (AD-024 #9)` で「**SQL のカラム型だけに依存しない** — 設定ファイル (JSON / YAML) の永続化スキーマも対象に含める。R-1 の永続化は JSON であり、SQL を見る検証では届かない」と書かれている。AD-024 (accepted) Decision Outcome `:106` は `scripts/constitution/check.mjs` (設定ファイルを走査対象に含む) を Automated の正本に指定している。
  **`scripts/constitution/` に Principle V の検査項目は本 round でも 0 件**。`constitution.md:296` の `bad_pattern_grep` は `(api_?key|oauth_?token|secret|password|aws_secret_access_key)\s*(TEXT|BLOB|VARCHAR)` のまま、すなわち **AD-024 #9 が「届かない」と断じた SQL カラム型の形**が残っている。`docs/verify-report.md:205` は Principle V を pass と記録済み。
- **同種事象探索**: `Principle V\b` / principle タグ in `scripts/constitution/` → **3 件の該当は全件 VI** (`check.mjs:114`, `:325`, `allowlists.mjs:289`)。**V の検査項目 0 件**。`token|secret|password|apiKey|credential` (-i) in `src/main/infra/settings/` → 3 件、全件が `folder-store.test.ts` の allow-list 反証 fixture。**永続化フィールドとしての秘密情報は 0 件** (実体面は満たされている) — これが Critical ではなく High である理由。
- **リスク/影響**: `contracts/workspace-store.md:45-46` は「Principle V の自動検証は SQL のカラム型に依存しており JSON 設定ファイルを検査できない。検証条件の追随は AD-024 のスコープに含め、**それまでは allow-list を実装側の担保とする**」と暫定措置を宣言している。AD-024 は本 PR で accepted になったので**暫定措置の解除条件が満たされたことにされながら中身が空**という状態で feature が閉じる。次に設定層へ載るのは X-3 の Provider 設定 (`infra/secrets/` + `safeStorage`) で、**本 round で追加された `services-not-to-io` の comment がその到来を明文化した** (L-003 参照)。
- **推奨アクション**: Round 1 の 3 点を維持。(1) `check.mjs` に Principle V の項目を足す (検査対象は `.json` 実体ではなく **`RECORD_KEYS` 相当の allow-list 定数と `JSON.stringify` に渡すオブジェクトリテラル**。走査根に `src/main/infra/settings/**` と `src/main/infra/secrets/**` を明示的に含める)。(2) `constitution.md:296` の `bad_pattern_grep` を SQL カラム型のみの形から改める (Statement を改定して metadata を据え置くと AD-024 が指摘した drift が Principle V 自身で再発する)。(3) 実装を入れないなら `contracts/workspace-store.md:45-46` を「未実装。次に触る feature で実装する」と読める形に直す。
- **根拠**: Constitution Principle V `:310-314` / **AD-024 (accepted) `:106`** / AD-024 本文 `:24-25`「実在しないパスを検査する grep は常に合格する」/ `.specify/spec-gate/reviewers.yml` (本 reviewer の発火根拠)
- **scope 根拠**: feature。`scripts/constitution/` は本 feature が FR-036 / FR-037 で整備した対象。cat D の owner は `architecture-reviewer` であり **dedup 対象になりうる**が、Constitution `:314` が Principle V の Manual verifier に `database-reviewer` を実名指定しているため本 reviewer からも提出する

### [Medium] 生成源の注入で production の識別子生成器がテストから外れ、永続化への書き込み経路の単体カバレッジが 0 になった (M-007) (scope: feature)

- **観察**:
  - `folder-service.test.ts:120-125` はコメントで「**識別子を決定的にする。** 注入するようになったので (AD-023 §5 / §7) テストから固定できる。`makeFolderId` は 8 文字以上の英数字を要求する」と書き、連番の `newId` を渡す。
  - ところが**同ファイルのテストは `makeFolderId` に到達しない**。`describe` / `it` は `:157-267` にあり、内訳は `browseDirectory` のトークン検証 9 本と「前提の確認」2 本。**`service.register(...)` / `service.unregister(...)` を呼ぶテストは 1 件も無い**。注入した `newId` が実際に効いているのは `folder-service.ts:255` の `const token = newId()` (ブラウズトークン) だけであり、コメントが根拠に挙げた `makeFolderId` の 8 文字条件は**このファイルでは一度も評価されない**。
  - 結果として **`toFolder()` → `makeFolderId(newId)` → `store.save()` という永続化への書き込み経路は単体テスト 0 件**である。`store` は `async save() {}` のスタブ (`:109-111`) なので、仮に `register()` テストを足しても現状の harness では書き込み内容を検査できない。
  - さらに **production の生成源 `composition-root.ts:80` を実行するテストは 0 件**になった。変更前は `folder-service.ts` 内で `randomUUID()` を直接呼んでいたため、`folder-service.test.ts` が `register()` を呼べば production の源が走る経路が存在した。変更後はテストが必ず `newId` を差し替えるので、**その経路が構造的に消えた**。`composition-root.ts` は `electron` を import する (`:3`) ため単体テストの対象にもできない (テストファイル 0 件)。
- **同種事象探索**:
  - `describe(` / `it(` in `folder-service.test.ts` → **13 行** (`:157,158,166,186,195,204,219,232,240,246,262,263,267`)。`register` / `unregister` を呼ぶものは **0 件**
  - `\.register\(|\.unregister\(` in `src/` → **4 件**、全件 renderer (`WorkspaceFoldersScreen.tsx:273`, `:449` / `useFolders.ts:151`, `:174`) で `capability()` 経由のスタブ呼び出し。**main 側 service を直接呼ぶテストは 0 件**
  - `createFolderService` → **2 件** (`composition-root.ts:66` / `folder-service.test.ts:127`)
  - `composition-root` のテストファイル → **0 件** (`src/main/app/composition-root.test.ts` は存在しない)
  - `randomUUID` in `src/` → **1 件** (`composition-root.ts:1`, `:80`)。**この 1 行が `id` 一意性の唯一の担保であり、テストが 0 件**
- **リスク/影響**: H-004 で述べたとおり、`id` 一意性の保証は `composition-root.ts:80` の 1 行だけに宿るようになった。その 1 行はテスト対象外のファイルにあり、かつ**その正しさを検査するテストが 0 件**である。誰かが `newId: () => String(Date.now())` に書き換えても (契約文の「8 文字以上の英数字」を満たす) **テストは全部緑のまま通る**。これは AD-024 / pr-gate Round 1 C-001 が名指した「`existing_violations: 0` が合格と見分けられない」と同型の状態が、identifier という別の面で再生産されたことを意味する。
  加えて、永続化の書き込み経路 (`register` → `save`) に単体テストが無いことは、H-001 (同時 save) / H-004 (`id` 衝突) / M-001 (版移行) の回帰テストを**どこにも置けない**ことと同義である (M-006 と合流)。
- **推奨アクション**:
  1. `folder-service.test.ts` の store スタブを**書き込み内容を記録する fake** に変える (`saved: WorkspaceFolder[][]` に push するだけで足りる)。そのうえで `register()` / `unregister()` のテストを足す。最小 3 本: (a) 登録が `save` に渡る、(b) 定数 `newId` で 2 件登録すると 2 件目が拒否される (H-004 の pin)、(c) `unregister` で 1 件だけ消える
  2. **production の生成源を検査可能にする。** `composition-root.ts:80` のラムダを `export function createIdSource(): () => string` として `src/main/app/` の別ファイル (`electron` を import しない) に切り出し、「100 回呼んで重複 0 件」「`isValidFolderId(makeFolderId(source))` が真」を pin する。H-004 の推奨 1 で docblock に書く条件と 1 対 1 に対応させる
  3. `folder-service.test.ts:120-123` のコメントを実態に合わせる。現状は「`makeFolderId` が要求するから `testid` 形式にした」と読めるが、そのコードパスは実行されていない。**根拠として書かれた条件が一度も評価されないコメントは、次の読者に「試験済み」と誤読される**
- **根拠**: SC-013 / `contracts/workspace-store.md` §テスト / AD-027 `:109` / AD-024 本文 `:24-25` (「書いた」ことと「発火した」ことの区別) / reviewer-base cat H
- **scope 根拠**: feature。`folder-service.test.ts` / `composition-root.ts` はいずれも本 round の touched files

### [Medium] 1 つの生成源が「永続化される識別子」と「capability トークン」を兼ね、契約に予測困難性が書かれていない (M-008) (scope: feature)

- **観察**: `newId` の消費者は 2 つある。`folder-service.ts:212` の `makeFolderId(newId)` は**ディスクに書かれ IPC で renderer に渡り `.bak` にも複製される値**を作り、`:255` の `const token = newId()` は**ブラウズ能力そのものを表すトークン**を作る。契約文 (`:86-97`) はこの 2 用途の非対称に触れず、条件は「8 文字以上の英数字」だけである。
  変更前は `token = randomUUID()` と `makeFolderId(() => randomUUID().replace(/-/g,''))` が**それぞれ独立に `randomUUID` を呼んでいた**。本 round で両者が同一の注入源に集約された。
  現行の `composition-root.ts:80` は 2 回の呼び出しが独立な v4 UUID を返すため**今は問題が成立しない**が、契約が許す決定的な源 (テストが実際に渡している連番がその実例である) を渡すと、**永続化ファイルに書かれた `id` が生成列の観測窓になる**。`wf_testid00000001` を読めば次のトークンが `testid00000002` であると分かる。
  永続化ファイルは秘密ではなく (`<userData>` 配下。`quickstart-results.md:107` / `manual-checklist.md:242` が利用者に直接開かせている)、さらに Round 1 の L-002 のとおり `.bak` が**無制限に増える**ため、観測窓は時間とともに広がる。
- **同種事象探索**: `newId()` の直接呼び出し → **1 件** (`folder-service.ts:255` = トークン)。`makeFolderId(newId)` 経由 → **1 件** (`:212` = 永続 id)。**1 つの源に 2 種類の消費者**という構図は他に 0 件 (`now` は時刻のみ、`hostFs` / `fs` / `detector` / `store` はいずれも単一用途)。
  トークンが永続化される経路 → **0 件** (`sessions` は in-memory `Map` (`folder-service.ts:108`)、`fromFolderRecord` (`folder-record.ts:136-153`) の出力キーは `RECORD_KEYS` の 5 つのみ)。**Principle V の実体面は維持されている。**
- **リスク/影響**: 現時点の実害は 0 (依頼項目 1 / 2 の回答参照) なので Medium とする。
  それでも指摘するのは、**永続化される値と capability secret を同じ源から引くことは、片方の要求 (一意であれば足りる) が他方の要求 (推測不能でなければならない) を隠す**からである。
  契約に強い側の条件が書かれていない状態で源を差し替える feature が来たとき、破れるのはトークン側だが**兆候が現れるのは永続化ファイル側**になる。
  なお `folder-service.ts:271` は「トークンの存在有無が分かると総当たりの手掛かりになる」として `browse-session-expired` の理由を意図的に潰しており、**トークンの推測不能性を前提にした設計判断が既にコード上に書かれている**。その前提を支える条件が注入契約に書かれていないのが本指摘である。
- **推奨アクション**:
  1. H-004 の推奨 1 と同じ docblock に**推測不能性**を明記する (「暗号論的乱数源を使うこと。`Date.now()` / 連番 / ハッシュなどの決定的な源を渡してはならない」)
  2. できれば**用途ごとに源を分ける** (`newFolderId` / `newBrowseToken`)。永続化される値と capability secret は要求が違うので、契約を 1 本にまとめると弱い側に引きずられる。分ければテストは `newFolderId` だけを決定化でき、トークンは production の源を使ったままにできる (M-007 の推奨 2 と整合する)
  3. `folder-service.test.ts` が決定的な源を渡すのは `makeFolderId` 側だけにする (上記 2 を実施すればトークンは差し替えなくてよい)
- **根拠**: Constitution Principle V (設定層) / `contracts/ipc-capability.md` の `token` の行 / `folder-service.ts:271` の自己表明 / Round 1 L-002 (`.bak` の単調増加) / CWE-330
- **scope 根拠**: feature。`security-reviewer` (cat A / B) がトークンの推測不能性そのものを owner とするため **dedup 候補**。本 reviewer は「永続化ファイルが生成列の観測窓になる」面と「契約文の欠落」に限って提出する

### [Medium] スキーマ版の移行 seam が無く、旧版と未来版を区別せず一律破棄する (M-001) (scope: feature) — Round 1 から unresolved

- **観察 (再確認)**: `folder-store.ts:114` は `root.schemaVersion !== SCHEMA_VERSION` の等値比較 1 本で、未来版 / 旧版 / 欠落 / 型違いをすべて `schema-version-unknown` に落として全件破棄 + 退避する。移行関数のフックが無い。`contracts/workspace-store.md:109` は「I-1 が所在にコンテナを追加する場合、`schemaVersion` を上げて**移行を定義する**」と将来の移行を前提にしている。
- **同種事象探索**: `SCHEMA_VERSION` in `src/` → 定義 1 (`folder-record.ts:31`) / 読み 1 (`folder-store.ts:114`) / 書き 1 (`:160`) + テスト。版を跨ぐ変換コード **0 件**。`schemaVersion: 0` / `: 2` のテスト **0 件**。
- **リスク/影響**: 次にスキーマを変える feature (I-1 / X-3) が移行を書かずに `SCHEMA_VERSION` を上げるだけで通る。利用者から見れば「更新したら登録が全部消えた」。
- **推奨アクション**: Round 1 の 3 点 (3 分岐に開いて `migrate` を恒等で置く / 理由キーを `schema-version-newer` と分ける / `schemaVersion: 0` のテストを足す) を維持。
- **根拠**: `contracts/workspace-store.md:109` / FR-019 / SC-013
- **scope 根拠**: feature

### [Medium] 退避の失敗が load() 全体を throw させ、読めたレコードごと一覧が理由なしで落ちる (M-002) (scope: feature) — Round 1 から unresolved

- **観察 (再確認)**: `folder-store.ts:77-81` の `backup()` は `writeFile` の失敗をそのまま投げ (docblock `:75`)、呼び出し 4 箇所 (`:98` / `:106` / `:119` / `:148`) はいずれも try/catch の外にある。特に `:148` は「一部だけ壊れていた」経路で、**正常に復元できたレコードが `folders` に積まれているのに退避の失敗で `LoadResult` ごと失われる**。上位 (`folder-service.ts:116-122` の `ensureLoaded`) も catch しないため `list()` が reject する。
- **同種事象探索**: `await backup(` in `folder-store.ts` → **4 件**。退避失敗のテスト **0 件**。`RestoreIssueReason` に `backup-failed` **0 件**。
- **リスク/影響**: FR-019「起動は妨げられない」/ SC-013「起動失敗 0 件」と衝突する。**単に catch して進めるのは誤り** — 退避が完了するまで置換してはならない (FR-019)。
- **推奨アクション**: Round 1 の 3 点 (`backup-failed` を `LoadResult` で返す / 同時に store を「保存禁止」にして `save()` を拒否する / 退避先が書けないケースのテスト) を維持。**書き込み関数の注入は `services-not-to-io` が確立した論法と同型** (M-006 参照)。
- **根拠**: FR-019 / SC-013 / `contracts/workspace-store.md:87`
- **scope 根拠**: feature

### [Medium] 登録件数にもファイルサイズにも上限が無く、復元が O(n^2)、一覧構築が件数比例の逐次 I/O になる (index 相当) (M-003) (scope: feature) — Round 1 から unresolved

- **観察 (再確認)**: `folder-store.ts:126-145` は要素数を検査せず全件ループし、ループ内の `isUniqueId` (`registry.ts:34`) が線形走査なので復元は **O(n^2)**。`readFile(..., 'utf8')` + `JSON.parse` (`:87`, `:95`) がサイズ上限なしに全文をメモリへ載せる。`folder-service.ts:183-189` の `buildList()` は登録 1 件ごとに `await checkExistence(folder)` を**逐次**実行する。`measure.ts` の `BUDGET_MS` に `list-folders` の予算が無いため超過として記録もされない。
- **同種事象探索**: `MAX_` in `src/domain/validation.ts` → **3 件** (`MAX_DISPLAY_NAME_LENGTH` / `MAX_PATH_VALUE_LENGTH` / `MAX_DIR_ENTRIES`)。**登録件数の上限は 0 件**。`MAX_DIR_ENTRIES` の docblock は「上限が無いと巨大なディレクトリ 1 つで IPC のペイロードと描画が破綻する」と**同じ理屈を既に採用している**。
- **リスク/影響**: ディスク上の内容は入力である (spec が破損ケースを要件化している)。件数を膨らませたファイル 1 本で起動時の復元が O(n^2) で固まり、同じ main プロセス上の SC-004 を巻き込む。
- **推奨アクション**: Round 1 の 5 点 (`MAX_WORKSPACE_FOLDERS` を `validation.ts` に置く / 復元の重複判定を `Set` 化 / `readFile` 前の `stat` サイズ上限 / `buildList()` の実在確認を束ねる / `list-folders` の予算は SC-004 改定が要るので本 PR では触らない) を維持。**`Set` 化は H-004 で書き込み側に `isUniqueId` を足す話と独立** (書き込み側は 1 件判定なので線形で足りる)。
- **根拠**: SC-004 / SC-013 / `data-model.md` §6 / `src/domain/validation.ts:57-62` / CWE-400
- **scope 根拠**: feature

### [Medium] registeredAt の値域検証が弱く、非整数・負値・天文学的な値がそのまま復元される (データ型適切性) (M-004) (scope: feature) — Round 1 から unresolved / 依頼項目 3 の対象

- **観察 (再確認 + 本 round の追加観察)**: `folder-record.ts:88` は `typeof r.registeredAt !== 'number' || !Number.isFinite(r.registeredAt)` のみで、`1e300` / `-8.64e15` / `1.5` / `0` がすべて通る。`Number.isFinite(1e300)` は真であり、その値から作った `Date` は Invalid Date になる。値は `folder-service.ts:172` で DTO に載って renderer へ渡る。
  **追加観察**: 同じレコードの `id` 側は `isValidFolderId` (`registry.ts:53-57`) が接頭辞・文字種・長さを固め、`displayName` は長さ + 制御文字、`path.value` は長さ + 制御文字 + 名前空間形式を持つ。**`registeredAt` だけが値域を持たない**という Round 1 の観察は本 round でも成立し、L-004 と合わせると「読み側の許容幅が書き側の値域より広い」構図が 2 フィールドで共通していることが分かる。
- **同種事象探索**: `Number.isFinite` in `src/` → **1 件** (`folder-record.ts:88`)。`src/domain/validation.ts` に時刻の述語 **0 件**。`registeredAt` の実装参照 → `folder-record.ts:28` / `:88` / `:116` / `:146` / `folder-service.ts:172` / `:222` / `:234` (登録時は `now()` なので健全)。
- **推奨アクション**: Round 1 のまま — `src/domain/validation.ts` に `isValidTimestamp` (`typeof v === 'number'` かつ `Number.isSafeInteger(v)` かつ `v >= 0`) を置き IPC 境界と共有する。未来値の上限は時計巻き戻しで既存レコードが落ちるため置かない。**L-004 の `id` 値域も同じ改修で一緒に締められる。**
- **根拠**: FR-019 / `contracts/workspace-store.md:61` / `src/domain/validation.ts:8-16`
- **scope 根拠**: feature

### [Medium] writeFile + rename に flush が無く「書き込み中のクラッシュで全件を失わない」という表明を満たしきれない (M-005) (scope: feature) — Round 1 から unresolved

- **観察 (再確認)**: `folder-store.ts:19` と `:165` が「一時ファイル + rename による atomic 置換」で「書き込み中のクラッシュで全件を失わない」と表明しているが、実装 (`:167-168`) は `writeFile(temp)` → `rename(temp, file)` で **temp の fsync も親ディレクトリの fsync も無い**。電源断後にゼロ長または部分内容のファイルが残る余地があり、そのとき旧内容は既に置換で消えている。次回起動は `parse-failed` に入り、**退避されるのは壊れた内容**である。
- **同種事象探索**: `fsync|datasync|\.sync\(` in `src/` → **0 件**。書き込み経路は `folder-store.ts:79` (退避) と `:167` (本体) の 2 件のみで、どちらも flush 無し。
- **推奨アクション**: Round 1 の 3 点 (`open` → 書き込み → `sync()` → `close` → `rename` / 直前の正常内容を `.prev` として 1 世代残す / 入れないなら docblock の表明を弱める) を維持。
- **根拠**: `contracts/workspace-store.md:89` / SC-013 / `folder-store.ts:19` の自己表明
- **scope 根拠**: feature

### [Medium] 永続化の回帰テストに、同時書き込み・旧スキーマ版・退避失敗・大量レコードの 4 観点が無い (M-006) (scope: feature) — Round 1 から unresolved / 根拠が強まった

- **観察 (再確認 + 本 round の追加観察)**: `folder-store.test.ts` は 16 ケースで `contracts/workspace-store.md` §テストの 5 行を満たすが、本 review が挙げた 4 経路 (同時 `save()` = H-001 / `schemaVersion` がより小さい値 = M-001 / 退避の失敗 = M-002 / 件数上限と O(n^2) = M-003) は**どれも 0 件**のまま。本 round では **H-004 (重複 `id` の生成) と M-007 (書き込み経路のカバレッジ 0) が加わり、未 pin の経路は 6 つになった**。
  **追加観察**: Round 1 の推奨は「`FolderStore` の生成時に書き込み関数を注入できるようにする方が安定する」だった。本 round で追加された `.dependency-cruiser.js` の `services-not-to-io` ルールは、その comment で「**調停は I/O をインタフェース経由で注入され、自分で取りに行かない。これが God Service への唯一の歯止めである**」と宣言し `folder-service` / `runtime-store` を実名で縛った。`folder-store.ts` は状態を持たない `infra` なので規則の対象外だが、**「I/O を注入すれば試験できる」という論法自体がリポジトリの機械強制として確立した**ため、Round 1 の推奨はリポジトリ自身の方針と同型になった。
- **同種事象探索**: `Promise.all|concurrent|同時` in `folder-store.test.ts` → **0 件**。`EACCES|EPERM|readonly` in `src/main/infra/settings/` → **0 件**。`schemaVersion: 0` / `: 2` in `src/` → **0 件**。`node:fs/promises` in `folder-store.ts` → **1 件** (`:1` の直接 import。注入点 0 件)。
- **リスク/影響**: 上記 High / Medium を直しても **pin が無いので再発を検出できない**。特に H-001 は「直列化を消しても既存 16 ケースは全部緑」であり、H-004 は「書き込み側の一意性検査を消しても既存テストは全部緑」である。
- **推奨アクション**: Round 1 の 4 本 + H-004 / M-007 の 4 本を足す。`FolderStore` の生成に書き込み関数を注入できるようにする (`now` を注入している `:54` と同じ理屈)。
- **根拠**: SC-013 / `contracts/workspace-store.md` §テスト / `.dependency-cruiser.js` の `services-not-to-io` comment / reviewer-base cat H
- **scope 根拠**: feature

### [Low] トップレベルのキーに allow-list が無く、契約の「未知のキーは読み書きのどちらでも通さない」と非対称 (L-001) (scope: feature) — Round 1 から unresolved

- **観察 (再確認)**: `folder-record.ts:72-75` はレコード単位で `RECORD_KEYS` の allow-list を強制するが、`folder-store.ts:113-126` はルートオブジェクトについて `schemaVersion` と `folders` だけを見て**未知のトップレベルキーを黙って無視する**。そのファイルは `skipped: 0` で「正常」として読まれ、次の `save()` で静かに消える。`contracts/workspace-store.md:43` の「未知のキーは読み書きのどちらでも通さない」からレコード単位限定は自明ではない。
- **同種事象探索**: `RECORD_KEYS` in `src/` → **2 件** (`folder-record.ts:28` 定義 / `:74` 適用)。ルート用 allow-list 定数 **0 件**。
- **推奨アクション**: ルート用 allow-list を置き、未知のトップレベルキーがあれば退避したうえで計上する (破棄はしない)。少なくとも「読み取り側の allow-list はレコード単位」と契約側に明記する。**H-003 の Principle V 検査を入れるとき、検査対象の allow-list 定数がレコード単位の 1 本しか無いことが問題になる**ため併せて直すのが安い。
- **根拠**: `contracts/workspace-store.md:43` / Constitution Principle V
- **scope 根拠**: feature

### [Low] 退避ファイルが無制限に増え、同一ミリ秒の退避は上書きされる (L-002) (scope: feature) — Round 1 から unresolved

- **観察 (再確認)**: 退避先は `workspace-folders.json.<now()>.bak` (`folder-store.ts:67-70`)。`:77-81` は `writeFile` を排他フラグなしで呼ぶため**同じスタンプの既存退避を黙って上書きする**。恒久的に不正なレコードが 1 件混ざったファイルは `:148` が毎回退避するため**起動ごとに `.bak` が 1 つ増える**。世代上限も掃除も無い。
- **同種事象探索**: `\.bak` in `src/` → **3 件** (`folder-store.ts:68` 生成 / `folder-store.test.ts:71` 件数検査 / `ResolutionScreen.test.tsx:252` fixture)。削除・世代管理 **0 件**。排他フラグ (`wx` / `flag:`) **0 件**。
- **リスク/影響**: userData 配下に登録パス一覧のコピーが溜まり続ける。**M-008 と合わせると、生成列の観測窓が時間とともに広がる**面が加わる。Round 1 で platform-boundary L-004 と統合済み (`pr-gate.md:117`)。
- **推奨アクション**: 排他フラグで開いて衝突時は連番を付す。世代上限 (例 5) を設けて古いものから消す。同一内容なら再退避しない。
- **根拠**: FR-019 / `contracts/workspace-store.md:93`
- **scope 根拠**: feature

### [Low] infra/secrets/ の空ディレクトリに対する許可リストが 2 箇所に生きており、X-3 の到来が本 round で明文化された (L-003) (scope: feature / 申し送りは system) — Round 1 から unresolved

- **観察 (再確認 + 本 round の追加観察)**: `src/main/infra/secrets/` は `.gitkeep` のみで `.ts` **0 件**。「何のために用意され、いつ何が入る予定か」は記録されている (`.gitkeep` 自身 / `spec.md:393` FR-038 / `tasks.md:54` / `plan.md:145` / AD-023 §8) ため**記録漏れの指摘は出さない**。残る観察は、この空ディレクトリに対する許可リストが `.dependency-cruiser.js:52` / `:231` と `eslint.config.mjs:96-97` / `:193` / `:326-332` の 2 系統で生きていることである。
  **追加観察**: 本 round で追加された `services-not-to-io` の comment が「**X-1 の `SessionService` / X-3 の `ProviderService` / I-2 の `ContainerService` を作るときは、ここに実名を足すこと**」と書いた。X-3 の `ProviderService` は `safeStorage` を使うため `infra/secrets/` に最初のファイルを置く feature である。**その時点で「`electron` を import してよい」「Principle V の Automated 検証が無い (H-003)」「services ルールに実名を足さないと歯止めが効かない」の 3 条件が同時に成立する。**
- **同種事象探索**: `secrets` in `*.js` / `*.mjs` / `src/` → 実装側 **9 件** (`.dependency-cruiser.js:52,231,233` / `eslint.config.mjs:96,97,104,193,326,332`)。`src/main/infra/secrets/` 配下の `.ts` → **0 件**。
- **リスク/影響**: AD-024 本文 `:24-25` / #1 / #6 は「実在しないパスを検査する規則は常に空を返し常に合格する」を問題として挙げている。ここは逆向き (実在しないパスを**許可**している) だが同型である。
- **推奨アクション**: 本 PR で塞ぐ必要はない。H-003 の Principle V 項目を入れるときに**走査対象に `src/main/infra/secrets/**` を明示的に含める** (空でも対象として列挙されている状態にする)。併せて X-3 の申し送りに「`infra/secrets/` へ最初のファイルを置く feature が (a) Principle V の Automated 検証を通ること (b) `services-not-to-io` に `ProviderService` の実名を足すこと」を条件として残す。
- **根拠**: AD-023 §8 / FR-038 / AD-024 本文 `:24-25` / Constitution Principle V / `.dependency-cruiser.js` の `services-not-to-io` comment
- **scope 根拠**: feature (X-3 への申し送りは system)

### [Low] 読み側 isValidFolderId の許容幅 (8-32) が書き側 makeFolderId の値域 (常に 24 以下) より広く、生成不能な id を正常復元する (L-004) (scope: feature)

- **観察**: `registry.ts:53` の `ID_PATTERN = /^wf_[0-9a-z]{8,32}$/` は接尾辞 8-32 文字を受理するが、`makeFolderId` (`:65-69`) は `suffix.slice(0, 24)` を返すので**書き側が生成できるのは 8-24 文字だけ**である (`composition-root.ts:80` の源では常に 24)。`folder-record.ts:77` は読み戻しでこの広い方の述語を使うため、`wf_` + 25-32 文字の `id` は「アプリが生成しえない値」でありながら正常復元される (`skipped` にも計上されない)。
  なぜ 24 で切って 32 まで受理するのかを説明する記述は `registry.ts` にも `contracts/workspace-store.md` にも `data-model.md` にも無い。契約側 (`:59`) の記述は「`id` が形式不正、または他のレコードと重複する」だけで、形式の具体が実装にしか無い。
  あわせて `makeFolderId` の `replace(/[^0-9a-z]/g, '')` は**エントロピーを黙って落とす**。大文字を含む源 (例 `randomUUID().toUpperCase()`) を渡すと英字が全部除去され、残った数字だけで長さ `>= 8` を満たした場合に**そのまま通る**。契約の床は「strip 後 8 文字」= 約 41 bit であり、実際値の 90 bit からは遠い。
- **同種事象探索**: `ID_PATTERN|isValidFolderId` in `src/` → 定義 **2** (`registry.ts:53`, `:55`) / 適用 **1** (`folder-record.ts:77`) / テスト **5** (`registry.test.ts:107-111,116`)。`slice(0, 24)` の根拠を書いた記述 → **0 件**。同型の「読み側が書き側より緩い」フィールド → **1 件** (`registeredAt` = M-004)。
- **リスク/影響**: 現在の実害は無い (受理された長い `id` も一意なら普通に動く)。ただし (1) 生成側の値域を契約に書いていないので `slice(0, 24)` を将来変えても誰も気づかない、(2) 読み側の幅が広いことで「手で編集された / 別実装が書いた `id`」を検出できない、(3) strip の silent なエントロピー低下は H-004 / M-008 の契約欠落と同じ根から出ている。
- **推奨アクション**:
  1. `ID_PATTERN` を生成側の値域に合わせる (`{8,24}`) か、**24 で切る理由と 32 まで受理する理由を `registry.ts` のコメントと `contracts/workspace-store.md` の `id` の行に書く**。どちらでもよいが、**両方が黙っている状態をやめる**
  2. `makeFolderId` の strip を「不正文字が含まれていたら throw」に変える (silent に落とさない)。契約 (H-004 の推奨 1) が `[0-9a-z]` を要求しているのだから、違反は検出して知らせるべきである
  3. M-004 の `isValidTimestamp` を `src/domain/validation.ts` に置くとき、**`id` の形式述語も同じ場所に集める**ことを検討する (`validation.ts:8-16` の「述語と上限を 1 箇所に集める」方針と整合する)
- **根拠**: `contracts/workspace-store.md:59` / `registry.ts:48-53` の docblock (「形式を固定するのは永続化ファイル由来の値が `unregisterFolder(id)` の対象になるため」) / `src/domain/validation.ts:8-16`
- **scope 根拠**: feature

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-004 | `isUniqueId` の**実装側**呼び出し in `src/` | **1** (読み戻しのみ。書き込み側 **0 件**) | `folder-store.ts:139` (定義 `registry.ts:34`、テスト `registry.test.ts:125,126`) |
| H-004 | `makeFolderId(` の実装呼び出し | 1 | `folder-service.ts:212` |
| H-004 | `newId` in repo (node_modules 除く) | 8 (既定値・フォールバック **0 件**) | `composition-root.ts:80` / `folder-service.ts:97,101,212,255` / `folder-service.test.ts:125,135` / `docs/decisions/0027-*.md:109` |
| H-004 | `createFolderService` の呼び出し | 2 | `composition-root.ts:66`, `folder-service.test.ts:127` |
| H-004 | service を直接呼ぶ `register` テスト | **0** | `\.register\(` の 4 件は全件 renderer (`WorkspaceFoldersScreen.tsx:273,449` / `useFolders.ts:151,174`) |
| H-004 | 同型 seam (注入源の契約が消費側の不変条件より緩い) | 1 (`newId` のみ。`now` は該当せず) | `folder-service.ts:86-97` |
| M-007 | `describe(` / `it(` in `folder-service.test.ts` | 13 行 (`register`/`unregister` を呼ぶもの **0 件**) | `:157,158,166,186,195,204,219,232,240,246,262,263,267` |
| M-007 | `composition-root` のテストファイル | **0** | — |
| M-007 | `randomUUID` in `src/` | 1 (テスト **0 件**) | `composition-root.ts:1`, `:80` |
| M-008 | `newId()` の直接呼び出し (トークン) / `makeFolderId(newId)` (永続 id) | 1 / 1 | `folder-service.ts:255` / `:212` |
| M-008 | トークンが永続化される経路 | **0** | `sessions` は in-memory `Map` (`folder-service.ts:108`)、`fromFolderRecord` の出力キーは 5 つ (`folder-record.ts:136-153`) |
| L-004 | `ID_PATTERN` / `isValidFolderId` | 定義 2 / 適用 1 / テスト 5 | `registry.ts:53,55` / `folder-record.ts:77` / `registry.test.ts:107-111,116` |
| L-004 | `slice(0, 24)` の根拠を書いた記述 | **0** | — |
| H-001 | `store\.save\(` in `src/` | 2 | `folder-service.ts:370`, `:392` |
| H-001 | `mutex|queue|serial|inFlight|pending` (-i) の直列化機構 | **0** | 該当は `tool-fallback.aui.tsx:257` の文字列のみ |
| H-002 | `skipped: 1` in `src/` | 3 | `folder-store.ts:101`, `:109`, `:122` |
| H-003 | Principle V の検査項目 in `scripts/constitution/` | **0** (3 件の該当は全件 VI) | `check.mjs:114`, `:325`, `allowlists.mjs:289` |
| H-003 | Principle V の `bad_pattern_grep` の形 | SQL カラム型のまま | `constitution.md:296` |
| H-003 | verify-report の Principle V | pass 記録済み | `docs/verify-report.md:205` |
| M-001 | 版を跨ぐ変換コード / `schemaVersion: 0` / `: 2` | **0 / 0** | — |
| M-002 | `await backup(` in `folder-store.ts` / `backup-failed` in `dto.ts` | 4 / **0** | `:98`, `:106`, `:119`, `:148` |
| M-003 | `MAX_` in `src/domain/validation.ts` (件数上限) | 3 件中**件数上限 0 件** | `validation.ts:46`, `:55`, `:63` |
| M-004 | `Number.isFinite` in `src/` / `validation.ts` の時刻述語 | 1 / **0** | `folder-record.ts:88` |
| M-005 | `fsync|datasync|\.sync\(` in `src/` | **0** | — |
| M-006 | `Promise.all|concurrent|同時` in `folder-store.test.ts` / `node:fs/promises` の注入点 | **0 / 0** | `folder-store.ts:1` が直接 import |
| L-001 | ルート用 allow-list 定数 | **0** | `RECORD_KEYS` は `folder-record.ts:28`, `:74` の 2 件 |
| L-002 | `\.bak` の削除・世代管理 / 排他フラグ | **0 / 0** | 生成は `folder-store.ts:68` |
| L-003 | `src/main/infra/secrets/**/*.ts` | **0** (許可リストは 9 件) | `.dependency-cruiser.js:52,231,233` / `eslint.config.mjs:96,97,104,193,326,332` |
| 継承判定 | Round 1 以降の `src/main/infra/settings/` 変更コミット | **0** | 最新は `6c3f4aa` (Round 1 より前) |
| 全体 | `*.sql` / `**/migrations/**` / `schema.prisma` | 0 | **対象なし (R-1 の設計どおり。指摘としては出さない)** |

## Verdict

- Critical: 0
- High: 4 (H-001 / H-002 / H-003 = Round 1 継続、H-004 = 新規)
- Medium: 8 (M-001〜M-006 = Round 1 継続、M-007 / M-008 = 新規)
- Low: 4 (L-001〜L-003 = Round 1 継続、L-004 = 新規)
- Round inheritance: **resolved from Round 1: 0 / partially: 0 / unresolved: 12 / new: 4**
- Severity 格上げ: **0 件** (Round 1 の High / Medium / Low はいずれも据え置き。「追加事実」による格上げは行っていない)
- cascade demotions: 0 (Critical 0 件のため対象なし)
- code-gate iteration 1 の MUST_FIX 7 件との重複 suppress: **0 件** (MF-001〜MF-007 はすべて a11y / ux / test / CSP 領域で、永続化層と `path:line` が重複しない)

### 修正順序の提案 (依存関係あり)

1. **H-004** — 書き込み側の一意性検査 1 分岐 + `newId` docblock の条件明記。**最も安い** (実装 3 行 + docblock 1 段落)
2. **M-007** — store スタブを fake に変え `register()` / `unregister()` のテストを足す。**H-004 / H-001 / M-001 の回帰テストを置く場所がここで初めて生まれる**ので、先に実施すると後続が安い
3. **H-001** — store 内に promise chain を置き、一時ファイル名を一意化。`pr-gate.md:103` のとおり **H-A と同じ機構で 3 面に効く**
4. **H-002** — `RestoreIssuesDTO` にファイル単位の失敗を足す。H-004 の `id` 衝突も同じ `skipped` に埋まるため、H-004 の後に実施すると報告値の意味が確定する
5. **H-003** — `check.mjs` に Principle V 項目 + `bad_pattern_grep` の改定。走査根に `infra/settings/**` と `infra/secrets/**` を含める (L-003 / L-001 も同時に締まる)
6. Medium / Low は上記の副作用で大半が同じファイルに触るため、まとめて 1 コミットにできる
