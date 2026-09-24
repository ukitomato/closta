# PR Gate Round 6: 所在をまたぐセッション列挙 (R-2)

**Run**: 2026-09-24
**Base**: `main`
**Diff stat**: +26,069 -253 over 150 files
**Reviewers**: security / architecture / po / platform-boundary / a11y / ux (6 並列)
**起動しなかった reviewer**: `database-reviewer` (migrations 0 / *.sql 0)、`api-performance` / `openapi-contract` (未採用)
**Round inheritance**: Round 5 findings (Critical 0 / High 10) を全 track に引継ぎ
**track 別本文**: `reviews/round6-tracks.md` に保存 (PO5-004 / L5-07 を是正)

## Verdict

| Severity | This round (dedup) | Resolved from R5 | New in R6 | Suppressed by code-gate |
|---|---|---|---|---|
| Critical | **0** | — | 0 | 0 |
| High | 5 | 9 | 1 | 0 |
| Medium | 8 | 5 | 3 | 0 |
| Low | 10 | 3 | 5 | 0 |

**Status**: **PASS (Critical 0 / 収束成立)**

**Next**: PASS → /cl-done 許可。open High 5 件のうち **新規は A6-001 の 1 件のみ** (AD-032 の記録 drift、doc 修正で閉じる)。残り 4 件は持ち主あり (H-D2 = Q1 未選択 / 検出器 13・14 = R-3 owned / a11y EmptyState = 据え置き)。

### 収束判定 (Phase 2)

```
convergence_failure := (R[6].resolved < R[6].new) AND (R[5].resolved < R[5].new)
```

| Round | resolved | new | resolved < new |
|---|---:|---:|---|
| R[5] | 14 | 12 | **偽** |
| R[6] | 13 | 9 | 偽 |

→ **R[5] が既に収束していたため、R[6] の結果によらず convergence_failure は偽。** halt しない。
R[6] 単体でも resolved (13) ≥ new (9) で収束方向。

track 別 resolved (自己申告): security 0 / arch 5 / po 4 / platform 4 / a11y 0 / ux 2 = 15。
dedup: H-A1 (ux C-001 + po) / H-A2 (platform + …) の重複を控除 → 13。
new: security 1 / arch 4 / po 3 / platform 0 / a11y 2 / ux 1 = 11 → dedup (N-001 = a11y L6-02) → 9。

### 6 track すべて Critical 0。実装修正はすべて resolved 確認

Round 6 は承認スコープ (incomplete-fix 3 + 未持ち主 High 2 + 偽完了 + 鏡面文書) を閉じた。
複数 track が**実測で**解消を確認した:

- **H-A1** (distroName が画面に届かない) → ux が経路追跡、po が end-to-end で価値到達を確認、a11y が sr-only 付き改善と確認
- **H-A2** (posix #7 の UNC 露出) → platform が実測: `/x\wsl.localhost\` → opaque-unc / `/home//y` → posix / `C:\` → host。**単調安全 (表示値を消すのみ、新規露出は構造上不能)**
- **H-A3** (test 判定表番号) → architecture が正本 8 行と test 8 describe の 1 対 1 を確認
- **H-B1** (inflight scope) → platform が実測で単射・境界非越を確認
- **H-B2** (refresh 直列化) → platform が実測 (`hostCalls === 1`)
- **H-D1** (偽完了) → po が 3 系統 (tasks / quickstart / roadmap) の一貫を確認

---

## Open High (dedup 5 件)

### 分類 A: Round 6 が持ち込んだ記録 drift (1 件) — 「両側を直す」の再発

#### A6-001 — H-A2 で `raw.includes('\\')` を足したのに AD-032 の判定モデル記述を訂正していない [origin: architecture。新規]
- **Where**: `docs/decisions/0032-...md:120` (Consequences「綴りに依存しない」未訂正) / `src/domain/runtime/path-api.ts:211,222` (code は変わった)
- **Issue**: AD-032 §1 は「先頭区切りの本数で形を決める」、§3 は「区切りの連続 (`[\\/]{2,}`) を含む値に表示値を持たせない」、Consequences は「**綴りが増えても破れない。形の性質は綴りに依存しない**」。しかし H-A2 は単一バックスラッシュ (`raw.includes('\\')`) を判定に加え、**綴り (backslash の有無) に依存するようになった**。code docstring (`cwd-origin.ts:67` / `path-api.ts:200`) は PB5-001 を参照して更新したが、**accepted ADR 側は 0 件**。
- **Why High**: AD-032 を生んだ C4-012 (「判定モデルを変えたが ADR に記録が無い」) と**同型の drift が AD-032 自身に発生**。AD-031 の境目では、Consequences の反証は日付つき in-place「訂正」節を、判定モデルの変更が「決定の変更」なら後続 ADR を要する。code の振る舞いは正しい (穴は塞がった) ので Critical でなく doc/governance drift = High 上限。
- **Suggested fix**: AD-032 に日付つき「訂正」節を足し、(a) Consequences「綴りに依存しない」は PB5-001 で反証された旨、(b) §1/§3 に「先頭区切り 1 本でも内部に `\` を含めば opaque-unc」を記録。code の PB5-001 参照 2 箇所と対にする。
- **Status**: new / **doc 1 節で閉じる**

### 分類 B: 持ち主あり・意図的先送り / 据え置き (4 件)

#### B1 — H-D2 (S6-001 = S4-003): `isValidDistroName` の bidi / `dto-mapper` 関門の被覆 [security。Q1 で人間が未選択 = Round 6 スコープ外。defense-in-depth、到達経路は upstream で封止]
#### B2 — 検出器 14 (PB5-005 = PB4-004): SDK import の回避形 [platform。**R-3 owned** roadmap #3]
#### B3 — 検出器 13 (PB5-006 = PB4-005): agents→UNC API の別名回避 [platform。**R-3 owned** roadmap #3]
#### B4 — a11y EmptyState の live region (G-H1 = A11Y3-005/A11Y4-002) [a11y。据え置き、1 行で閉じる。先例 `WorkspaceFoldersScreen.tsx:596`]

---

## Medium (dedup 8 件)

| ID | 内容 | origin | 種別 |
|---|---|---|---|
| M6-01 | **SC-006 本文 (総数=合計) が FR-049 の「総数−落とした件数」と未調律** — 片側だけ直した | po M-001 | new (鏡面) |
| M6-02 | AD-030 に `amends:[AD-028]` が無い (AD-028 の amended-by を足した片側) | arch A6-002 | new (鏡面) |
| M6-03 | plan.md:43 が「短命プロセス方式が本線」のまま (3 箇所直した片側) plan.md:69 と矛盾 | arch A6-003 | new (鏡面) |
| M6-04 | `dto-boundary.test` が無 gate フィールドを汚染入力で行使しない (H-D2 と対) | security S6-002 | 継続 |
| M6-05 | `programmatic` が無検査で境界を渡る (`"yes"` 素通り)。**持ち主未登録** | platform PB5-007 | 継続 |
| M6-06 | truncate に全文確認手段なし (長い unknown-location パスの同定 defeat) | ux N-001 / a11y L6-02 | new |
| M6-07 | SourceLabel に役割 sr-only なし | a11y G-M2 | 継続 |
| M6-08 | SourceLabel badge の contrast (light 4.5:1 境界、要実測) | a11y G-M3 | 継続 |

## Low (dedup 10 件) — 主なもの

| ID | 内容 | origin |
|---|---|---|
| L6-01 | posix/other のバックスラッシュ判定が正当な POSIX ファイル名も opaque に (fail-safe、受容) | security S6-004 |
| L6-02 | `cwdKeyOf` の comment が JSON.stringify の保証を過大に | security S6-003 |
| L6-03 | AD-032 box / roadmap #5 が Round 6 実施分を「Round 5 で実施」と誤帰属 | po L-001 |
| L6-04 | isolation charter の Principle V が _overview 未割当 (既存、編集行で露出) | arch A6-004 |
| L6-05 | Constitution v1.2.5 の PATCH 再帰 (継続) | arch A6-005 |
| L6-06 | sr-only 接頭辞「作業ディレクトリの所在」「作業ディレクトリ」が近似で紛らわしい | a11y L6-01 |
| L6-07 | refresh の逐次連打に最小間隔なし (合流はする) | platform L-001 |
| L6-08 | `候補 #N` の `#` 発音不定 | a11y G-L4 / ux C-003 |
| L6-09 | pathDisplay が truncated を捨てる | a11y G-L5 |
| L6-10 | 未検出概念の二重表示 (悪化なし) | ux C-005 |

---

## メタ観察: 「両側を直す」が 3 round 連続で再発している

Round 4 が「実装が 4 回変わり記録が 0 回追随」を指摘 → Round 5 が「記録と実装を同じコミットで閉じる」を不変条件に → Round 5 自身が片側だけ直した (H-001 test / M-001 短命 / M-002 amended-by / M-003 charter) → Round 6 がそれを閉じる → **Round 6 自身がまた片側だけ直した** (A6-001 AD-032 / A6-002 AD-030 amends / A6-003 plan.md:43 / M6-01 SC-006)。

いずれも数行の doc 修正だが、**「正本を移したら旧写しを全数消す/参照形にする」を機械で保証する手段が無い**ことが根である。architecture の言うとおり、次に畳むべきは「片側修正を検出する仕組み」だが、これは R-2 の範囲を超える (roadmap / 後続 feature)。

Round 6 の new はすべて Medium/Low の doc 鏡面か defense-in-depth で、**実装の正しさに関わる new High は 0**。A6-001 も code は正しく ADR 記述だけの drift。

---

## 機械検証 (Round 6 作業末尾で実行済み)

| 検証 | 結果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **34 files / 747 passed / 0 failed** |
| `node node_modules/typescript/bin/tsc --noEmit` | エラー 0 |
| `node node_modules/eslint/bin/eslint.js src scripts tests` | 0 errors |
| `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | 違反 0 (166 modules / 680 deps) |
| `node scripts/constitution/check.mjs` | 15 項目 ok 14 / 違反 0 / 検査対象なし 1 |
| ルール発火 | Round 5 以降に規則定義・fixture 未変更のため Phase 0 step 6 の再実行不要 (既に 26 件一致で確認済み) |

---

## 次にやるべきこと

収束は成立し gate は halt しない。Critical 0 で /cl-done は許可される。
残る判断は「open High 5 件をどこまで閉じてから done か」である。

| 優先 | 対象 | 閉じる ID | 規模 |
|---|---|---|---|
| 1 | **A6-001** — AD-032 に日付つき訂正節 (Consequences の反証 + §1/§3 の content 判定) | A6-001 | doc 1 節 |
| 2 | **鏡面 doc 3 件** — SC-006 を FR-049 に揃える / AD-030 に `amends` / plan.md:43 注記 | M6-01 / M6-02 / M6-03 | 各 1 行 |
| 3 | **H-D2 の決着** — `isValidDistroName` を bidi 込みに + dto-boundary.test に汚染ケース、または R-3 送りで持ち主登録 | B1 / M6-04 | 数行 or 文書 |
| 4 | **PB5-007 の持ち主** — programmatic の値域検査を R-3 に owner 登録 (現状未登録 Medium) | M6-05 | 文書 |
| 5 | 任意 doc/a11y 微修正 | L6-* / M6-06〜08 | 各 1 行 |

**SC-008 の予算値は人間承認済み。E2E / CI は M4 まで対象外。** 上記はいずれも CI 非依存。
**検出器 13/14 (B2/B3) と a11y EmptyState (B4) は持ち主あり**なので done の必須ではない。
