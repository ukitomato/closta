# PR Gate Round 2: 所在をまたぐセッション列挙 (R-2)

**Run**: 2026-09-23
**Base**: `main` (Round 1 と同じ根拠。`main...HEAD` = R-2 そのもの)
**Diff stat**: 125 files, +22,320 -98
**Round 1 からの追加 commit**: `5b04434` / `a057791` / `fafd5fb` (27 ファイル。すべて `src/` と gate 生成物)
**Reviewers**: `security` / `architecture` / `po` (feature scope) + `platform-boundary` / `a11y` / `ux` (system scope)
**Round inheritance**: Round 1 の Critical 2 / High 29 を引継ぎ

---

## Verdict

| Severity | This round (dedup 後) | Resolved from R1 | Partial | Unresolved | New in R2 | Suppressed by code-gate |
|---|---|---|---|---|---|---|
| Critical | **0** | 2 | 0 | 0 | 0 | 0 |
| High | **23 クラスタ (生 29)** | 13 | 6 | 9 | 14 | 0 |
| Medium | 41 | — | — | — | — | 0 |
| Low | 21 | — | — | — | — | 0 |

**Status**: **`PASS` (Critical = 0)**

**ただし orchestrator は `/cl-done` を推奨しない。** 下記「PASS と同時に記録する留保」を参照のこと。
gate の規則上 Critical=0 は PASS だが、本 Round で確認された High のうち **4 件は Round 1 の修正自身が作った穴**であり、うち 2 件は**実行して再現済み**である。

**Next**:
- 修正する → `/cl-pr-gate` (Round 3)
- 修正せず進む → `/cl-done` は可能。ただし残余を spec / roadmap に記録すること

---

## PASS と同時に記録する留保 (orchestrator による実行確認)

reviewer の主張のうち、**orchestrator が自分で実行して再現したもの**だけを挙げる。

### 1. UNC 綴りの穴 (Round 1 platform H-001 / security H-001 の残余) — **再現済み**

```
入力: //?/UNC/wsl.localhost/Ubuntu/home/alice
  looksLikeWslUnc → false
  classifyCwd     → { kind: 'wsl-inherited',
                      path: { namespace: 'wsl:Ubuntu', value: '/?/UNC/wsl.localhost/Ubuntu/home/alice' } }

入力: \\wsl.localhost\\-bad\home\alice   (区切りが 2 つ)
  looksLikeWslUnc → true
  uncRelativeDisplay → '/-bad/home/alice'      ← 検証を通っていないディストロ名が出る
```

1 件目は FR-042 の UNC 露出にとどまらず、**FR-016 が禁じた「由来 config の所在からの推定」そのもの**である。
`looksLikeWslUnc` が `/` 綴りのデバイス名前空間接頭辞を見ないため、`raw.startsWith('/')` の
POSIX 分岐に落ちて `wsl:Ubuntu` として branding される。
2 件目は Round 1 で入れた `expect(display).not.toContain('-bad')` が、
**区切りを 1 つ増やすだけで破れる**ことを示す。

### 2. `intentionallyKilled` が到達不能で、同名のテストが修正を検査していない — **再現済み**

```
if (!wasIntentional) crashes += 1   →   crashes += 1   に書き換え
npx vitest run src/main/app/session-enumerator.test.ts  →  25 passed (発火せず)
```

`killIntentionally` の 3 呼び出しがいずれも直後に `worker = null` を置くため、
遅れて届く `exit` は `if (worker !== who) return` で先に返る。
`platform-boundary H-004` の名前を持つテスト (`session-enumerator.test.ts:405`) は
**H-004 の修正を検査していない**。守りが二重化していて片方が死んでいる。

### 3. a11y の回帰テストが正規表現の誤りで発火しない — **確認済み**

`SessionListScreen.test.tsx:931` の `not.toMatch(/(^|s)opacity-50(s|$)/)` は
`\s` ではなく**リテラルの `s`**。`className="… opacity-50"` は前が半角空白なので一致せず、
**修正前のコードでも緑になる**。加えて断言時点は `busy = false` であり busy 時の className を一度も見ていない。

### 4. 契約乖離 — **確認済み**

`contracts/ipc-session-list.md:86` の `boundary` は **group variant だけ**で、
`SessionSummaryDTO` ブロックには無い。Round 1 の po H-001 修正が `dto.ts` / 許可リスト / sample の
3 箇所を同時に足したため、SC-011 の「項目が増えたら落ちる」検査は緑のまま契約から離れた。
`SESSION_GROUP_DTO_FIELDS` は**リポジトリに存在しない** (grep 0 件) ので group variant 側は検査自体が無い。

### 5. 「セッションがまだありません」の肯定テストが 0 件 — **確認済み**

`SessionListScreen.test.tsx` の当該文字列は Round 1 で足した**否定 assert 1 件だけ** (`:1127`)。
SC-013 の 5 条件のうち 1 条件が、宣言した 2 つの計測経路 (グループ関数 / renderer 単体) のうち
renderer 側をすり抜けている。

---

## 本 Round の総括 — 「検査が対象を見ていない」が 6 件

Round 1 の修正は**実装としては効いている** (4 track が独立にそう判定した)。
残っている High の性質は 2 つに分かれる。

1. **修正が検査側に追随しなかった** — 新設した `looksLikeWslUnc` / `uncRelativeDisplay` が
   `UNC_API_NAMES` に入っていない (A-201)、新 DTO フィールドが契約に無い (PO-201)、
   新しい守りにテストが無い (PB-209)、新しいテストが壊れている (A11Y-204)。
2. **Round 2 送りにした文書 / 検査体制が 1 件も着手されていない** — Round 1 修正の 27 ファイルに
   `spec.md` / `quickstart*.md` / `roadmap.md` / `charter.md` / `discovery.md` / `glossary.md` /
   `data-model.md` / `contracts/` が 1 つも含まれていない。

**「違反 0」が何も示さない箇所が 3 件、実測で示された** (platform-boundary track):
検査項目 14 の回避形 3 種 (動的 `import()` / サブパス / `require` 間接) がすべて `ok` を返す、
SC-016 の env テストが同じ定数どうしの比較、`dto-schema.test.ts` の FR-042 assert が手書きリテラル対象。

---

## Critical (Round 2)

**0 件。**

Round 1 の C-001 (cwd 由来の値が未検査で境界を越える) は、6 つの合意事項のうち 4 件が完了し、
**「未信頼値が privileged sink に届く」経路は塞がっている** (`build.ts:68-77` の正規化 +
`validation.ts:32-65` の bidi 追加 + 呼び出し 4 箇所の強い側への統一)。
残余は配線漏れ 2 本 (③ `targetLabel` / ⑥ テストの同義反復) であり、
どちらも「現時点で実害が成立」の要件を満たさないため High 上限とした。
security / platform-boundary の 2 track が独立に同じ判定に達している。

---

## High (Round 2) — 23 クラスタ

### 実装の欠陥 (機能に影響する)

| ID | origin | Where | Issue | R1 |
|---|---|---|---|---|
| **H2-001** | security / platform-boundary / architecture | `path-api.ts:144-149` / `cwd-origin.ts:128,144` | **UNC 綴りの穴**。`\\?\UNC\` 系 4 綴りが `looksLikeWslUnc` を素通りし、`/` 綴りは `wsl-inherited` として**誤帰属**する (FR-016)。`\\` 始まりは `display: raw` で UNC 全文が境界を越える (FR-042)。区切り重複で未検証ディストロ名が `display` に出る。**orchestrator が実行して再現** | partial |
| **H2-002** | security / platform-boundary | `target-finder.ts:111,133,185,212,245` | **`targetLabel` だけが正規化を通らない** (C-001 合意事項 ③ 未実施)。`hasForbiddenCharacter` は bidi を通すため、C-001 が塞いだ偽装が隣のフィールドで成立する。FR-052 によりこの値は**必ず全行に表示される** | partial |
| **H2-003** | security / platform-boundary | `protocol.ts:197` / `session-service.ts:290` | **列挙応答の要素が無検査キャスト**。`"cwd": 123` のような 1 レコードで `normalizeText` が TypeError を投げ、`enumerateTarget`〜`fetchAll` に catch が無いため**一覧全体が落ちる**。FR-030 / SC-007 を所在単位どころか全体で破る。`sessionId` は型検査すら無い | new |
| **H2-004** | architecture / platform-boundary / security | `session-enumerator.ts:276-279` / `enumerator-spawner.ts:73-83` | **`kill()` の戻り値を捨て、`disposed` 印が無く、`spawned.add` が配線の後**。contracts C-5 が要求する「戻り値と `exit` の到着を確認」が未実装。`onLine` の throw 経路で `spawned` に入らない孤児が残る。`dispose()` 後の要求が新しいプロセスを起こす | new |
| **H2-005** | platform-boundary | `session-service.ts:623-627` | **`refresh()` に直列化もクールダウンも無い**。列挙器の抑制は第 2 相にしか掛からず、第 1 相 (UNC 探索 I/O + `wsl.exe`) は毎回無条件。並行した `fetchAll` が互いの `commit` を上書きする。contracts C-6 の明文に反する | unresolved (H-005) |
| **H2-006** | platform-boundary / architecture | `session-enumerator.ts:380-387` | 要求の束ねが `scope` を見ないため、先頭ページ要求と全件要求が合流する。逆順では**全件取得が 50 件の結果を `complete=true` で確定**し行が消える | unresolved |

### 検査体制の欠陥 (規則が効いていない)

| ID | origin | Where | Issue | R1 |
|---|---|---|---|---|
| **H2-007** | architecture | `allowlists.mjs:338` | **新設した 2 つの UNC API が `UNC_API_NAMES` に無い**。項目 13 は `src/agents/` が `looksLikeWslUnc` / `uncRelativeDisplay` を呼んでも `ok` を返す。AD-028 §3 リスト 2 の機械検証が部分的にしか対象を知らない | new |
| **H2-008** | platform-boundary | `check.mjs:618-695` | **項目 14 が回避形 3 種を素通し** (動的 `import()` / サブパス import / `require` 間接)。**実測で 3 形すべて `ok`**、対照の宣言形は検出。contracts C-4 はこの検査が FR-044 の実効性を単独で担うと明言している | unresolved (H-006) |
| **H2-009** | security / architecture / platform-boundary | `config-dir.ts:58` / `allowlists.mjs` / `check.mjs` | **env 許可リストの正本が contract 指定の場所に無く、検査項目も無い**。SC-016 のテスト 2 本のうち 1 本が同義反復 (`config-dir.test.ts:88`)。ただし `session-enumerator.test.ts:297` の厳密一致は**実効的**であり、Round 1 の「同義反復」という記述は訂正を要する | unresolved (H-002/H-003/H-007) |
| **H2-010** | po | `dto.ts:66,166` / `contracts/ipc-session-list.md:92-100` | **SC-011 の検査が同義反復**で、Round 1 の修正が契約から乖離したまま緑になった。`SESSION_GROUP_DTO_FIELDS` は存在せず group variant 側は検査が無い。**orchestrator が確認** | new |

### 人間の判断を要する (AskUserQuestion gated 相当)

| ID | origin | Where | Issue | R1 |
|---|---|---|---|---|
| **H2-011** | architecture | `session-enumerator.ts:224` / `plan.md:139-141` | **列挙応答の `JSON.parse` が main process で走る**。Principle IX の ✗ Bad そのもので、1 応答に最大 5,000 件が載る。`bad_pattern_grep` はコードの置き場を見るので 0 件を返し、**「どのプロセスで走るか」を見る検査が無い**。plan.md の Constitution Check IX が事実と違う根拠で `[x]` になっている。選択: 構造体 `postMessage` に変える / 根拠文を事実に直す | new |
| **H2-012** | architecture | `docs/decisions/0028,0030` | **accepted な ADR 3 件が in-place 修正されたまま**。AD-028 §2 自身の immutability 宣言と矛盾。先例 2 件 (AD-019 / AD-024) は実践側にある。選択: 訂正節を後続 ADR に移す / 規則を実践に合わせて明文化する | unresolved (H-004) |

### spec / 受け入れ基準 (po)

| ID | origin | Issue | R1 |
|---|---|---|---|
| **H2-013** | po | SC-008「700 件で 10 秒」が未達見込みのまま Out of Scope にも roadmap にも行き先が無い。**E2E 基盤とは独立に閉じられる** | unresolved (H-002) |
| **H2-014** | po | SC-008「先頭 50 件 2 秒」の合格が「ホストに 50 件以上あること」に依存。余裕 21〜159ms に対し固定費のばらつきが約 200ms | unresolved (H-003) |
| **H2-015** | po | SC-013「セッション 0 件」の肯定テストが 0 件。**orchestrator が確認** | unresolved (H-004) |
| **H2-016** | po | US-1 / US-2 / US-3 の AC 実機証跡 (2026-09-18) が、その後 2 回の UI 改修を反映していない。**改修した領域は AC が対象とする領域そのもの** | unresolved (H-005) |

### UX / a11y

| ID | origin | Where | Issue | R1 |
|---|---|---|---|---|
| **H2-017** | ux / po | `SessionListScreen.tsx:311-371` | **`SectionEmpty` に操作要素が 0 件**。しかも Round 1 の修正で failed 分岐が early return になり、**失敗が 1 件でもあれば US-1 AC-9 の案内が 0 件フォルダ全部から消える**。新テストがその不在を固定した | new |
| **H2-018** | ux / a11y | `SessionListScreen.tsx:603-624` | 0 行 folder 区画に**全所在**が渡るため、同じ理由とヒントが (登録フォルダ数 × 失敗所在数) 回反復する。逆に**行がある区画には欠落の警告が出ない** — 要る場所に出ず、要らない場所に N 回出る | new |
| **H2-019** | ux | `SessionListScreen.tsx:1019,1045` | 索引バナーの唯一の操作が理由に関わらず「ランタイムを再検出して取り直す」。`permission-denied` / `wsl-unavailable` / `path-too-long` では**直せない操作**が唯一の操作になる。同画面の `Outcomes:519` は条件を持つので判定基準が 2 つ同居 | new |
| **H2-020** | ux | `SessionListScreen.tsx:1001,1087` | 索引バナーと 2 枚目の空状態が**排他でない**。初回起動 (登録 0 件 + ディストロ停止中) で `EmptyState` が 2 枚積まれ、最優先の「作業フォルダを登録する」が下に来る。**orchestrator が条件を確認** | new |
| **H2-021** | ux | `SessionListScreen.tsx:893` / `countText` | `complete` は「全所在を**試した**」であって「全所在を**読めた**」ではない。失敗があっても「全 N 件」を確定形で出す。Round 1 で 0 件経路だけ保護したため `total > 0` が**明示的に条件から外れた** | new |
| **H2-022** | a11y | `WorkspaceFoldersScreen.tsx:413,477` | H-201 の cascade 未完。テキストに掛かる `opacity-50` が light **3.74:1** / `text-muted-foreground` で **1.98:1**。`:413` は恒久状態、`:477` は減光中も操作可能なので 1.4.3 の例外が効かない | new |
| **H2-023** | a11y | `SessionListScreen.tsx:1001-1071,311-371` | 索引の 3 分岐と `SectionEmpty` が**すべて live region の外**。唯一読まれるのは鮮度行の「全 0 件」— **FR-012 が「無いと読ませるな」と定めたその文字列**。反例 (正しい形) が同 PR 内 `WorkspaceFoldersScreen.tsx:596` にある | new |
| **H2-024** | a11y | 8 箇所 | 「押した要素が消えてフォーカスが body に落ちる」が 8 件残存。H-205 / MF-006 と同型。`.focus()` による移送は feature 全体で 1 件のみ | new |

(H2-024 まで数えると 24。H2-006 は H2-005 と同一 track の同族だが Where が異なるため別立てとした。dedup 後のクラスタ数は **23**、生の High は 29。)

---

## Medium / Low (Round 2) — 41 / 21 件

各 track の報告を参照。主なもの:

- **私が書いたテストが発火しない** 4 件 — a11y の `opacity-50` 正規表現 / `intentionallyKilled` の crash カウント / `dto-schema.test.ts` の FR-042 assert / SC-016 の env テスト
- **contracts / data-model / Constitution / charter / glossary の追随漏れ** 多数 — AD-030 前の「短命プロセス」記述が 4 箇所、判定表が実装より 1 行短い、Constitution の版表記が自己矛盾、検証項目数 11→15 が未追随、AD-029 §3 の「1 関数」が 3 関数に
- **`platform-ok:` 注記 3 件が no-op** (対象式が無い / 行末形式でない)
- **renderer が所在を表示ラベルで同定** — `Windows` という名前のディストロで名前空間が潰れる
- **`cwdKey` が U+0000 を含んで境界を越える** (Round 1 Medium の継承)
- **越境の日本語ラベルが R-1 と R-2 で食い違う** — Round 1 の修正で露出が 1 つ増えた

---

## Track 別

| Track | Critical | High | Medium | Low | 継承 |
|---|---|---|---|---|---|
| security | 0 | 4 | 6 | 3 | resolved 1 / partial 2 / unresolved 3 / new 4 |
| architecture | 0 | 5 | 10 | 3 | resolved 1 / partial 1 / unresolved 9 / new 5 |
| po | 0 | 5 | 10 | 3 | resolved 1 / unresolved 14 / new 4 |
| platform-boundary | 0 | 7 | 5 | 2 | resolved 2 / partial 3 / unresolved 3 / new 8 |
| a11y | 0 | 3 | 10 | 4 | **resolved 5 / partial 0 / unresolved 0** |
| ux | 0 | 5 | 9 | 6 | resolved 3 / partial 1 |

**a11y track は Round 1 の 5 件すべてを resolved と判定した唯一の track である。**
ただし 5 件すべてに同一クラスの未処理箇所または新しい副作用が付随している。

---

## 機械検証 (platform-boundary track が実行)

| 検証 | 結果 |
|---|---|
| `npm run lint` | 違反 0 |
| `npm run depcruise` | 違反 0 (165 modules / 660 dependencies) |
| `node scripts/constitution/check.mjs` | 15 項目 / ok 14 / violation 0 / **pending 1** (項目 5) |
| `node scripts/rules/run.mjs` | 違反サンプル 26 件、期待表と全件一致。**発火確認がある項目は 9 件、確認なし 5 件** |
| `npm test` | 33 files / **640 passed** |

---

## 次のアクション

1. **PASS (Critical=0) なので `/cl-done` は規則上可能。**
2. ただし H2-001 / H2-003 / H2-009 / H2-017 は機能または封じ込めに直接効く。修正して Round 3 を回すのが筋。
3. H2-011 (Principle IX) と H2-012 (ADR immutability) は**人間の確定が要る**。
4. 修正せずに進む場合、H2-013 〜 H2-016 は `spec.md` 2 行 + `roadmap.md` 1 行 + `quickstart.md` 1 行 +
   テスト 1 件 + `quickstart-results.md` への追記で閉じられる (E2E 基盤の先送りとは独立)。
