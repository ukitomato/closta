# PR Gate Round 3: 所在をまたぐセッション列挙 (R-2)

**Run**: 2026-09-23
**Base**: `main`
**Diff stat**: 126 files, +22,677 -101
**Round 2 からの追加 commit**: `1440565` (17 ファイル)
**Reviewers**: `security` / `architecture` / `po` (feature scope) + `platform-boundary` / `a11y` / `ux` (system scope)
**Round inheritance**: Round 2 の Critical 0 / High 23 クラスタを引継ぎ

---

## Verdict

| Severity | This round (dedup 後) | Resolved from R2 | Partial | Unresolved (継続) | New in R3 |
|---|---|---|---|---|---|
| Critical | **0** | 0 | 0 | 0 | 0 |
| High | **24 クラスタ (生 30)** | **1** | 3 | 19 | **15** |
| Medium | 32 | — | — | — | — |
| Low | 13 | — | — | — | — |

**Status**: **`PASS` (Critical = 0)**

**しかし `/cl-done` を推奨しない。Round 2 の修正が 3 件の退行を持ち込み、うち 1 件は置き換える前より悪い。**

---

## ⚠ 収束の警告 (Phase 2 の前哨)

| Round | resolved_from_prev | new_in_round | resolved < new |
|---|---|---|---|
| R2 | 13 | 14 | **true** |
| R3 | **1** | **15** | **true** |

convergence gate は N ≥ 4 で発火する。定義は

```
convergence_failure := (R[N].resolved < R[N].new) AND (R[N-1].resolved < R[N-1].new)
```

**R[3] は既に `resolved < new` を満たしている。** したがって **Round 4 が `resolved ≥ new` を達成しなければ、その時点で `CONVERGENCE_FAILURE` により halt する** —
`--defer-remaining` は撤廃済なので、ADR 起票 + Constitution / spec 範囲調整以外の出口が無い。

Round 4 は「新しく見つける」のではなく「**閉じる**」ラウンドにする必要がある。

---

## orchestrator が実行して再現した事実

reviewer の主張のうち、**自分で走らせて確かめたもの**だけを挙げる。

### 1. crash 計上の順序変更が**恒久停止の退行**を入れた — A/B で再現

H2-004 で `handleExit` の crash 計上を `if (worker !== who) return` の**前**へ移した。
同時に `killIntentionally` は `kill()` が `false` を返したワーカを
`intentionallyKilled` から**取り除く**ようにした。この 2 つの組み合わせで、
**「意図して殺したが `kill()` が false を返し、その後に自然終了したワーカ」の `exit` が crash に数えられる。**

```
送信失敗 3 回 (kill() は false、exit は後から届く)

私の Round 2 修正 (HEAD)      → FINAL ok=false workers=3   ← 新しいワーカを起こせない
crash 計上の順序を戻した場合   → FINAL ok=false workers=4   ← 復旧する
```

`crashes` が減るのは応答が届いたときだけであり、ワーカを起こせなければ応答は来ない。
**アプリ再起動まで列挙が回復しない。** `kill()` が false を返すのは
「既に終了している / まだ spawn していない」ときで、timeout 経路と送信失敗経路は
どちらも「子が応答しない」状況で呼ばれる — 再現条件は特殊ではない。

**しかもこの順序変更は 1 件のテストにも固定されていない**
(順序を戻す変異を入れても `session-enumerator.test.ts` は 28/28 緑)。

### 2. `parseWslUncPath` が `toUncSpelling` を通っていない — 4 track が独立に指摘

`toUncSpelling` の docstring は
「**綴りの正規化をこの 1 関数に集める。** 以前は `looksLikeWslUnc` /
`uncRelativeDisplay` / **`parseWslUncPath`** がそれぞれ区切りの寄せを書いており…」
と 3 関数を名指すが、**呼び出し元は 2 箇所だけ** (`path-api.ts:180` / `:204`)。
`parseWslUncPath:232` は自前の `raw.replace(/\//g, '\\')` のままである。

```
\\?\UNC\wsl.localhost\Ubuntu\home\alice   (Ubuntu は検出済み)
  looksLikeWslUnc  → true
  parseWslUncPath  → fail('invalid-format')
  classifyCwd      → unknown-location      ← FR-017 は wsl-from-unc を要求
```

**FR-016 (推定するな) を守るために FR-017 (UNC は特定しろ) / US-1 AC-5 を落とした**交換になっている。
値にディストロ名が literal で書かれ、検出済み集合にも在るのに「所在不明」に落ちる。

**私が Round 2 で足したテストがこの誤りを正解として固定している** —
`cwd-origin-unc.test.ts:132-133` が `originPath(origin)).toBeNull()` を期待値に入れた。

### 3. `split(/s+/)` — 直したはずのバグを同じ行で作り直した

`SessionListScreen.test.tsx:948`。Round 2 の修正コメントは
「正規表現が `\s` ではなくリテラルの `s` だった」と**正しく記述している**のに、
その 20 行下で同じ誤りをしている。`className` を文字 `s` の連続で分割するため、
`opacity-50` の左隣は必ず `:` か空白であり、**断片が `'opacity-50'` と厳密一致することは原理的に起こらない**。
当該 assert は恒真。H-201 の回帰ガードは **4 巡目も機能していない**。

### 4. AD-031 に書いた許容の根拠が事実と違う

AD-031 Decision 2 は「1 件あたりの上限は正規化後の `TEXT_MAX_BYTES` (512) 系のフィールドで縛られている」と書いた。

```
grep -rn "TEXT_MAX_BYTES|normalizeText" src/agents/   →  コメント 2 件のみ (実装 0 件)
enumerate.ts:74-80 の docstring  →  「**正規化しない** (FR-049 は main 側で掛ける)」
```

正規化が掛かるのは `JSON.parse` の**後**である。
**main がパースするバイト列に効いている上限は 1 つも無い。**
`isRawSessionRecord` も長さを見ない。応答サイズは一度も測っていない。

### 5. ADR immutability の規則変更が執行系に届いていない

```
.claude/agents/reviewer-base.md:22        「accepted 後 immutable」
.claude/agents/architecture-reviewer.md:40 「accepted 後 immutable な ADR を修正する spec があれば High 以上」
```

AD-031 で規則を変えたのに、全 reviewer が invoke 直後に読むファイルは旧規則のまま。
**次の Round も同じ指摘が出る配線である。** skill 側の写し 2 本を含め計 4 箇所。
AD-028 から AD-031 への前方参照も無く (`AD-028` 全文に `AD-031` の出現 0 件)、
`supersedes: []` も空。

### 6. `decodeResponse === null` が 10 秒宙づり

`handleLine:243` は `response === null` で **settle せずに return** する。
H2-003 で壊れたレコードを検出した所在は `ENUMERATION_TIMEOUT_MS` (10,000ms) まで待ち、
そこで初めて `enumeration-failed` になる。列挙は直列化されているので
**壊れた対象が k 個あれば `k × (10s + 再起動 2.7s)` が一覧の所要時間に乗る**。

`protocol.ts:244` のコメントは「応答を落とせば呼び出し側が**理由キーを持つ行**にできる (FR-030)」
と書くが、**その機序が実装に無い**。H2-003 は「一覧全体が落ちる」を
「1 対象あたり 10 秒沈黙する」に置き換えただけである。

---

## 本 Round の総括 — 「修正が仕様を見ていない」

Round 2 の総括は「**検査が対象を見ていない**」を挙げた。
Round 3 で見えたのはその対をなす型である。

| 修正 | 塞いだもの | 落としたもの |
|---|---|---|
| H2-001 | FR-016 (由来 config からの推定) | **FR-017 / US-1 AC-5** (UNC からの所在特定) |
| H2-003 | 一覧全体が落ちる | **FR-004 / SC-006** (所在単位で N 件落ちる) + 10 秒沈黙 |
| H2-004 | 孤児プロセス | **AD-030 §7** (恒久停止の新経路) |
| H2-002 | `targetLabel` の制御文字 | **FR-049 後半** (印を示す) / **FR-052** (2 候補が同一ラベルに潰れる) |

po track の指摘がとくに重い: H2-003 で「間引くか落とすか」を議論したが、
**同じ spec の FR-049 が第 3 の答え (「行は落とさない」「印を示す」) を既に決めていた**。
根拠に引用した FR-012 / FR-038 はこの件について何も述べていない。**引用が誤りである。**

そして 4 件すべてについて、**修正を固定するテストが、修正が主張した不変条件ではなく
安全側の弱い性質を期待にしている** — `originPath === null` を期待して FR-017 違反を固定し、
順序変更は 28/28 緑のまま、`split(/s+/)` は恒真、`targetLabel` のテストは印も衝突も見ない。

---

## Critical (Round 3)

**0 件。** 6 track が独立に Critical 0 と判定した。
Round 1 の C-001 (未信頼値が privileged sink に届く) は再現せず、
残余はすべて表示値の露出・封じ込めの穴・機能不全である。

---

## High (Round 3) — 24 クラスタ

### 新規 — Round 2 の修正が持ち込んだもの (優先)

| ID | origin | Where | Issue |
|---|---|---|---|
| **H3-001** | platform / security / arch / po (**4 track 収束**) | `path-api.ts:232` | **`parseWslUncPath` が `toUncSpelling` を通らない**。デバイス綴りの検出済みディストロが `wsl-from-unc` にならず FR-017 / US-1 AC-5 違反。docstring が事実と違う。**1 行で直る**。私のテストが誤りを固定 |
| **H3-002** | platform-boundary | `session-enumerator.ts:291,316-324` | **crash 計上順序の変更が恒久停止の退行を入れた**。**orchestrator が A/B で再現**。順序変更を固定するテストは 0 件 |
| **H3-003** | ux / platform-boundary | `session-enumerator.ts:243` | **`decodeResponse === null` が settle せず 10 秒宙づり**。SC-008 を 1 対象で使い切る。`protocol.ts:244` が主張した機序が実装に無い |
| **H3-004** | security / platform-boundary | `cwd-origin.ts:157` | **`display: raw` の UNC 露出が 8 綴りで生きている** (区切り重なり / `GLOBALROOT` / `\\??\UNC\` / `@ssl` / 3 連区切り / 非 WSL UNC)。FR-042 は無条件の禁止。新テストは `display` を検査していない |
| **H3-005** | architecture | `AD-031:96-99` | **許容の根拠が事実と違う**。`src/agents/` に正規化 0 件、`toRecord` は「正規化しない」と明言。main がパースするバイト列に上限が無く、サイズを一度も測っていない |
| **H3-006** | architecture | `reviewer-base.md:22` ほか 4 箇所 | **規則変更が執行系に届いていない**。AD-028 → AD-031 の前方参照も `supersedes` も無い |
| **H3-007** | architecture | `AD-031:27-37,69-74` | **境目が運用できない**。先例 5 件のうち **3 件が自身の基準で誤判定**され、表の 2 行は内容が空欄のまま「5 件すべて訂正である」と断じている |
| **H3-008** | po / a11y / security | `target-finder.ts:38-41` | **`targetLabel` の正規化の印を捨てた**。FR-049 後半の不履行。`alice` と `al<U+202E>ice` が同一ラベルに潰れ、**`[USER]` が全ユーザ集約を受け入れた唯一の代償 (FR-052) が壊れる** |
| **H3-009** | po | `protocol.ts:246` | **応答全落としが FR-004 / SC-006 を所在単位で破る**。**FR-049 が第 3 の答え (印をつけて残す) を既に決めていた**。引用した FR-012 / FR-038 はこの件を述べていない。SC-007 の条件表にこの失敗モードが無い |
| **H3-010** | a11y / po / ux (**3 track 収束**) | `SessionListScreen.test.tsx:948` | **`split(/s+/)` — 直したバグの再導入**。恒真。H-201 の回帰ガードは 4 巡目も無効 |
| **H3-011** | security | `ipc.ts:89-97` | **境界に例外 sanitize が無い**。`ipcMain.handle` の reject はメッセージを renderer に載せる。H2-003 の catch は 3 本の脚のうち 1 本しか覆っていない (探索相 / `refresh()` が素通し) |
| **H3-012** | architecture / po | `AD-031` / `roadmap.md` | **再評価条件「R-3 が本文を運ぶ時点」に持ち主が無い**。v1.2.3 が AD-028 §5 で「持ち主のいない延期を残さない」と明文化した規範を、v1.2.4 を起こす ADR が自分に適用していない。**3 回目**。AD-028 は未チェック箱を残したが AD-031 は 0 件 |
| **H3-013** | a11y | `thread-list.aui.tsx:209,251` | **選択行 / hover 行のメタが light 4.39:1** (12px、AA 未達)。`--muted` と `--accent` が同値のため hover も同じ。**Round 1〜2 で計算されていない新規の数値** |
| **H3-014** | a11y | `WorkspaceFoldersScreen.tsx:413,477` | A11Y-201 の cascade 未完 + **減光が focus ring を巻き込み 1.4.11 も破る** (light 1.98:1 / dark 1.84:1)。減光配下の要素は操作可能なので 1.4.3 の例外が効かない |

### 継続 — Round 2 で意図的に未着手 (severity 据え置き)

| ID | origin | 内容 |
|---|---|---|
| H3-015 | platform | PB-204 `refresh()` に直列化もクールダウンも無い |
| H3-016 | platform | PB-205 検証項目 14 の回避形 3 種 (実測で再確認) |
| H3-017 | security / arch / platform | H2-009 env 許可リストの正本と検査項目。`UNC_API_NAMES` も 4 件のまま |
| H3-018 | platform | PB-208 束ねが `scope` を見ない |
| H3-019 | po | H2-010 契約乖離 + `SESSION_GROUP_DTO_FIELDS` 不在 (状況変わらず) |
| H3-020 | po | H2-015 SC-013「セッション 0 件」の肯定テスト 0 件 (状況変わらず) |
| H3-021 | po | H2-013 / H2-014 SC-008 の行き先と計測条件 |
| H3-022 | po | H2-016 実機証跡の陳腐化。**V-3 は SC-005 を測る関数そのものが変わった** |
| H3-023 | ux | UX-201..205 (区画空状態に操作なし / 理由の N 回反復 / CTA が理由と噛み合わない / バナー 2 枚 / 件数の確定形) |
| H3-024 | a11y | A11Y-202 / A11Y-203 (索引通知が live region 外 / 押した要素が消える 8 箇所) |

---

## Medium / Low (Round 3) — 32 / 13 件

主なもの:

- **`dispose()` の戻り値を誰も受けない** (4 track 収束)。`index.ts:90` が捨てる。contracts C-5 の後半 (`exit` の到着確認) は未実装
- **`\\?\C:\...` (ドライブ長パス) が `unknown-location` に落ちる** — 判定表 #4 を満たすべき値がホスト名前空間を失う。実機で解決することを確認済み
- **判定表が 3 箇所とも 7 行のまま、実装は 9 分岐** — H2-001 で乖離が 1 行増えた。SC-005 の「表の全セルを網羅」が意味を失っている
- **`sessionId` が唯一の未正規化・未上限フィールド**
- **`data-active:bg-accent` と `hover:bg-muted` が同一の色** (`main.css` で `--muted` = `--accent`)。H-202 のテストはトークン名の文字列検査で色を見ていない
- **骨組みが `prefers-reduced-motion` を無視** (同リポジトリの `thread.aui.tsx` は付けている)。表示は実測 8,245 ms で 2.2.2 の 5 秒を超える
- **Constitution v1.2.4 に Sync Impact Report が無い** (過去 5 版すべてに存在)。`plan.md:107` は今も「v1.2.2 に基づくゲート」
- **PATCH は妥当でない** — 改定手順への新規則追加は「表現の修正」ではなく、バージョニング方針表に Governance 変更の行が無い
- **`WorkspaceFoldersScreen` に renderer テストが 1 件も無い** — A11Y-201 の対象がそこにある
- 擬陽性テストの棚卸し 7 件 (a11y track)

---

## Track 別

| Track | Critical | High | Medium | Low | 継承 |
|---|---|---|---|---|---|
| security | 0 | 3 | 6 | 3 | resolved 1 / partial 3 / 継続 3 / new 6 |
| architecture | 0 | 4 | 6 | 2 | resolved 1 / partial 1 / unresolved 14 / new 4 |
| po | 0 | 4 | 5 | 2 | resolved 0 / unresolved 全件 / new 4 |
| platform-boundary | 0 | 8 | 4 | 0 | resolved 1 / partial 3 / unresolved 6 / 再評価不能 2 / new 6 |
| a11y | 0 | 4 | 5 | 3 | **A11Y-204 は partial (同一欠陥を再導入)** / 他は unresolved |
| ux | 0 | 7 | 6 | 3 | UX-201..205 全件未着手 / new 2 |

**H2-002 (`targetLabel` 正規化) が唯一 resolved と判定された修正である** (security / platform が独立に確認)。
ただし印を捨てた点が新しい High (H3-008) になった。

---

## 機械検証 (platform-boundary track が実行)

| 検証 | 結果 |
|---|---|
| `npm run lint` | 違反 0 |
| `npm run depcruise` | 違反 0 (165 modules / 661 dependencies) |
| `node scripts/constitution/check.mjs` | 15 項目 / ok 14 / violation 0 / **pending 1** |
| `node scripts/rules/run.mjs` | 26 件全件一致。捕まらない経路 2 件を自己申告 |
| `npm test` | 33 files / **661 passed** |
| 変異: `if (!wasIntentional)` を外す | 1 failed — **この半分は検査されている** |
| 変異: crash 計上を早期 return の後ろへ戻す | **28 passed** — 順序変更は 1 件も検査されていない |
| 実 OS: `fs.readdirSync` 11 綴り | `\\?\UNC\\...` は canonical UNC と同一に正規化。`\\?\C:\` は解決する |

---

## 次のアクション

Critical 0 なので gate 規則上は PASS。**ただし次の 3 点で `/cl-done` は勧められない。**

1. **H3-002 は退行である。** 置き換える前より悪い (恒久停止 > 一時的な誤カウント)。1 箇所の順序を戻し、`killIntentionally` の集合操作を見直せば閉じる。
2. **H3-001 は 1 行で直る**のに FR-017 / US-1 AC-5 を破っている。4 track が独立に同じ場所を指した。
3. **収束が危ない。** R[3] は `resolved 1 < new 15`。Round 4 で `resolved ≥ new` にしなければ `CONVERGENCE_FAILURE` で halt する。

**Round 4 は「閉じる」ラウンドにすること。** 最小集合 (いずれも小さい):

| # | 修正 | 規模 |
|---|---|---|
| 1 | `path-api.ts:232` を `toUncSpelling(raw)` に + テストの期待値を検出済み / 未検出で 2 分割 | 1 行 + テスト |
| 2 | crash 計上の順序を戻す + `killIntentionally` の集合操作を直す + 順序を固定するテスト | 数行 + テスト 1 件 |
| 3 | `handleLine` で `response === null` のとき即座に settle | 数行 + テスト 1 件 |
| 4 | `cwd-origin.ts:157` を「先頭が区切りなら生値を出さない」に + `toUncSpelling` に重なりの畳み込み | 数行 + テスト |
| 5 | `split(/s+/)` → `split(/\s+/)` | 1 文字 |
| 6 | AD-031 に日付つき訂正節 (根拠の訂正 / 境目の言い換え / 未チェック項目) + 執行系 4 ファイル + `roadmap.md` 2 行 | 文書 |
| 7 | `targetLabel` の印を保持 + 同一ラベル衝突の回避 | 数行 + テスト |
| 8 | 応答全落としを「形の合う要素は通し `malformedCount` を載せる」に + `spec.md` / SC-007 に 1 行 | 中 |
