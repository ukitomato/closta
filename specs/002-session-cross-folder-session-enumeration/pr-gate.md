# PR Gate Round 5: 所在をまたぐセッション列挙 (R-2)

**Run**: 2026-09-24
**Base**: `main`
**Diff stat**: +25,946 -251 over 149 files
**Reviewers**: security / architecture / po / platform-boundary / a11y / ux (6 並列)
**起動しなかった reviewer**: `database-reviewer` — `auto_invoke_patterns` に一致する変更なし (migrations 0 / `*.sql` 0)。`api-performance` / `openapi-contract` は reviewers.yml で未採用。
**Round inheritance**: Round 4 findings (Critical 0 / High 26) を全 track に引継ぎ

## Verdict

| Severity | This round (dedup) | Resolved from R4 | New in R5 | Suppressed by code-gate |
|---|---|---|---|---|
| Critical | **0** | — | 0 | 0 |
| High | 10 | 9 | 3 | 0 |
| Medium | 14 | 3 | 4 | 0 |
| Low | 7 | 2 | 5 | 0 |

**Status**: **PASS (Critical = 0 / 収束条件を満たす)**

**Next**: PASS → /cl-done は許可される。**ただし推奨しない** — 下記の open High 10 件、特に **Round 5 の 3 件の incomplete-fix (C4-003 / C4-002 / C4-012 の未達側)** と **持ち主のいない High 2 件 (PB4-002 / PB4-003)** を先に閉じるべき。scope を人間に確認する。

### 収束判定 (Phase 2)

```
convergence_failure := (R[5].resolved < R[5].new) AND (R[4].resolved < R[4].new)
```

| Round | resolved_from_prev | new_in_round | resolved < new |
|---|---:|---:|---|
| R[4] | 19 | 28 | 真 |
| R[5] | **14** | **12** | **偽** |

→ **R[5] は resolved (14) ≥ new (12)。R2 以降で初めて収束条件を満たした。convergence_failure = 偽。halt しない。**

track 別 (自己申告、cross-track dedup 前): resolved 16 / new 13。
dedup で resolved から 2 件 (C4-001 = A4-007+PO4-003 / C4-010 = PB4-007+A4-008)、
new から 2 件 (opaque-unc spec = arch L-002+PO5-002 / 候補#N = ux C-003+a11y G-L4) を控除 → resolved 14 / new 12。

**質的評価**: Round 5 の new はすべて「壊した」ではなく「**直した層の鏡面を取りこぼした**」型 (incomplete fix) か、
「fix が値を load-bearing にして顕在化した」型である。Round 2 の「隣を壊す」型退行は 1 件も無い。
次に畳むべき不変条件は architecture-reviewer の言葉どおり
**「正本を移したら、旧写しを同じコミットで消すか参照形に変える」** = 「片側でなく両側を直す」である。

---

## Round 4 からの解消 (fully resolved 9 High + 3 Medium/Low)

| ID | 内容 | 確認した track | 根拠 |
|---|---|---|---|
| C4-001 | group DTO 写像の走査 + `cwdKey` の U+0000 除去 | architecture (A4-007) / po (PO4-003) | `dto-boundary.test.ts` が 4 variant 走査 + `SESSION_GROUP_DTO_FIELDS` 検査。`cwdKeyOf` = `JSON.stringify` |
| C4-002 | 先頭 trim + `other` の区切り連続ガード | security (S4-001) | `path-api.ts:186` trim / `cwd-origin.ts` が `shape.value` 使用。**ただし #7 に穴が残る → PB5-001** |
| C4-004 | `canonicalDistroName` 大小無視照合 | platform (PB4-001、probe 実測) | `ubuntu-26.04`→`Ubuntu-26.04` / 検出集合外→`null`。「何でも通る」でない |
| C4-009 | `disambiguate` の fixpoint 化 | po (PO4-001) | 生成後集合に対し閉じた。反例 `['alice','alice','alice (#0)']` を test で固定 |
| C4-010 | `malformed` を id 照合時のみ決着 | platform (PB4-007、probe) / architecture (A4-008) | `id !== waiting.id → return`。`{}` / 構造化ログ / id 不一致で落とさない |
| C4-011 | AD-031 の TEXT_MAX_BYTES 根拠訂正 | architecture (A4-001) | `grep TEXT_MAX_BYTES src/agents/` = 0 件で訂正が事実に即す |
| C4-013 | 執行系 4 ファイルの immutability 記述 | architecture (A4-002) | 4 ファイル同一内容更新、invoke 時本文も新規則 |
| C4-014 | AD-031 の境目の言い換え | architecture (A4-003) | 先例再分類 + 「訂正節に決定変更を書かない」 |
| C4-015 | Principle IX 再評価の持ち主 | architecture (A4-004) | roadmap + AD-031 + Constitution の 3 者で閉環 |
| M4-03 (PO4-005) | SC-005/007/015 の文面更新 | po | testable であることを確認 (性質テスト / HOSTILE / decodeResponse) |
| M4-12 (M-2) | Constitution SIR + 版番号 | architecture | v1.2.4 SIR を v1.2.5 で遡及補完。(L-001 の再帰のみ残) |
| PO4-013 | glossary の候補#N / Coverage / opaque-unc | po | FR-048 充足、反例つきで登録 |

---

## Open High (10 件)

### 分類 A: Round 5 の incomplete-fix (3 件) — **私が直した層の鏡面を取りこぼした**

#### H-A1 — `undetected-distro` の distroName が DTO・契約には届くが renderer が描画せず画面に出ない [origin: ux C-001。C4-003 の UX 未達側]
- **Where**: `src/renderer/src/features/session-list/SessionListScreen.tsx:376-411` (`SessionMeta`)
- **Issue**: `SessionMeta` は `CWD_ORIGIN_LABELS[session.originKind]` (=「未検出のディストロ」) を出すが **`session.cwdDisplay` を一度も描画しない**。renderer で `cwdDisplay` を読むのは `:142` の `group.cwdDisplay` (unregistered グループ用、host/wsl 由来では常に null) のみ。`session.cwdDisplay` の read は **0 件** (orchestrator が grep で確認)。
- **Why High**: C4-003 (PO4-002) は「名前が出ないと `unknown-location` との差が訳語だけになる」を直すためのもの。DTO・契約層では resolved だが、**利用者から見た挙動は Round 4 の退行時と変わらない**。FR-017 / US-1 AC-8 が UI で未達。**指摘された層 (DTO mapper) を直して、値が消費される層 (renderer) を直さなかった** — この feature の再発パターン。
- **Suggested fix**: `SessionMeta` に `session.cwdDisplay` の描画を追加 (sr-only「作業ディレクトリ」を添える)。`SessionListScreen.test.tsx` に「undetected-distro の行で distroName が画面に出る」assertion (現状 0 件)。**ux C-002 (dead cwdDisplay) / C-005 (概念の二重表示) も同時に閉じる。**
- **確認方法**: orchestrator が `grep cwdDisplay src/renderer` と `SessionMeta` (376-411) を読解して**確認済み**。

#### H-A2 — posix 分岐 (#7) が `\\wsl.localhost\` を部分文字列として境界に露出する [origin: platform PB5-001。C4-002 の未達側]
- **Where**: `src/domain/runtime/path-api.ts:195` (posix、無防備) vs `:210` (other、`SEPARATOR_RUN` ガードあり) / `src/domain/session/cwd-origin.ts:67-68` (偽の不変条件コメント)
- **Issue**: `SEPARATOR_RUN.test(raw)` ガードは `other` 分岐 (#8) にしか掛かっていない。posix 分岐 (#7) は `separators === 1` で無条件に `{kind:'posix', value:raw}` を返す。`/x\wsl.localhost\Ubuntu\home` (先頭 `/` 1 本、2 文字目が非区切り) は #7 に落ち、`\wsl.localhost\` を含む生値が `unknown-location` display として境界に出る。platform が probe で実測。`cwd-origin.ts:67-68` の「#7 は共有名もサーバ名も含まない」は**偽**。
- **Why High**: FR-042 (UNC 接頭辞を境界に載せない) の観測された違反。AD-032 Consequences「綴りが増えても破れない」の反例。Round 4 が halt した「毎ラウンド綴りの穴」型がそのまま残る。権限昇格・データ喪失は無く行は `unknown-location` 標識なので Critical ではない。
- **Suggested fix**: `classifyRawPath` の posix 分岐にも `SEPARATOR_RUN.test(raw)` を掛け #8 と対称にする。性質テストに「先頭区切り 1 本 + 内部に区切り連続」を追加し変異発火を確認。`cwd-origin.ts:67-68` の不変条件コメントを真にする。
- **確認方法**: orchestrator が `path-api.ts:195,210` / `cwd-origin.ts:67` を読解して**確認済み**。

#### H-A3 — AD-032 §6「判定表の正本 1 箇所 / テストは参照形」が未達 — テストが旧 7 行番号の写しを保持 [origin: architecture H-001。C4-012 の未達側]
- **Where**: `src/domain/session/cwd-origin.test.ts:30,36,69,123,143,160,187` (describe 7 ブロック、旧番号) vs 正本 `cwd-origin.ts:45-58` docstring (8 行)
- **Issue**: 正本 #4 = `opaque-unc`、test #4 = `host`。`opaque-unc` を扱う numbered describe は 0 件。data-model は参照形化したが**テストは旧番号の写しのまま**。同じ「#4」がなお別物を指す。
- **Why High**: AD-032 §6 (accepted ADR の Decision) の drift が同一 PR 内に存在。C4-012 / PO4-005 の根「同じ #4 が別物」が test 軸で未解消。SC-005「判定表の全セル網羅」の検証が canonical 表に対して閉じない。
- **Suggested fix**: describe を canonical 8 行に振り直す (#4 に opaque-unc、host を #5 へ)、または AD-032 §6 のとおり「正本の #N」の参照形にして写しを消す。
- **確認方法**: orchestrator は architecture の grep 結果 (describe 7 件 / canonical 8 行) を採用。

### 分類 B: 持ち主のいない High 2 件 (governance gap) — **AD-028 §5 の「持ち主のいない延期を残さない」違反**

#### H-B1 — 並行要求の束ねが `scope` を見ず `page` が `all` として `complete: true` で確定 [origin: platform PB5-003 = PB4-002。3 round 継続・**持ち主未登録**]
- **Where**: `src/main/app/session-enumerator.ts:496,502` (`inflight` 鍵が `request.target.key` のみ) / `session-service.ts:523`
- **Issue**: inflight 鍵に `scope` が無く、`all` 要求が飛行中の `page` promise に合流すると先頭 50 件のまま `complete: true` が立つ。FR-037 / FR-004 / SC-006 が同時に破れる。
- **Why High**: renderer 未信頼 (AD-023)。引き金は H-B2 (refresh が list 進行中に並走)。**Round 5 で未着手、かつ roadmap R-3 申し送りに持ち主が無い。**
- **Suggested fix**: inflight 鍵に `scope` を含める、または scope 違いを鎖に並べる。**まず持ち主を決める** (Round 6 で修正 / R-3 送りなら roadmap 登録)。

#### H-B2 — `refresh()` に直列化もクールダウンも無く探索相の UNC I/O が重なる [origin: platform PB5-004 = PB4-003。3 round 継続・**持ち主未登録**]
- **Where**: `src/main/app/session-service.ts:662-666`
- **Issue**: `list()` は `firstPage`、`completeInBackground()` は `completing` で守るが `refresh()` は無防備。探索相 (`finder.hostTarget()` / `wslTargets()`) は列挙器の cooldown を通らず押した回数だけ UNC `readdir` が走る。
- **Why High**: renderer 未信頼。`ENUMERATION_COOLDOWN_MS` の理由が探索相に届かない。**Round 5 で未着手、roadmap に持ち主無し。**
- **Suggested fix**: `refreshing` promise で 1 本に合流、`completing` / `firstPage` と相互排他。

### 分類 C: 持ち主あり・意図的先送りの High 3 件

#### H-C1 — 検証項目 14 (SDK import) が 5 回避形を素通し [platform PB5-005 = PB4-004。**R-3 owned** (`roadmap.md:91`)]
#### H-C2 — 検証項目 13 (`agents`→UNC API) が別名で無効化 [platform PB5-006 = PB4-005。**R-3 owned** (`roadmap.md:91`)]
#### H-C3 — `EmptyState` が live region で包まれず空状態変化が AT に通知されない [a11y G-H1 = A11Y3-005/A11Y4-002。1 行で閉じる (先例 `WorkspaceFoldersScreen.tsx:596`)。指示により据え置き]

### 分類 D: 記録の偽完了 + defense-in-depth の High 2 件

#### H-D1 — 実機証跡が Round 5 の実装変更を反映せず tasks.md / quickstart が完了を偽って主張 [po PO5-001 = PO4-004 / C4-016]
- **Where**: `quickstart-results.md:5` (「決着」) / `tasks.md:379` (`[x] SH-089`) / `roadmap.md:82-98` (R-3 申し送りに quickstart 行なし)
- **Issue**: 証跡は 2026-09-18。Round 5 が変えた V-1/V-3/V-4/V-6/V-8 の領域は「操作実施・指摘なし」で通したまま。**実機再実行は人間 deferred で妥当だが、偽の `[x]` と「決着」、台帳エントリ不在**が残る。
- **Suggested fix** (本 Round のコミット内で可): (1) `quickstart-results.md:5` を「Round 5 変更後は未再実行」に訂正、(2) `tasks.md:379` を `[ ]` か「再実行待ち (実機/人間)」注記、(3) roadmap に「quickstart 5 行の実機再実行 / owner: 人間 / 根拠 C4-016」を 1 行登録。

#### H-D2 — `isValidDistroName` が bidi 制御文字を通し、`dto-mapper` の関門が 3 フィールドしか覆わない [security H-001 = S4-003。defense-in-depth]
- **Where**: `src/domain/runtime/namespace.ts:41` (`isValidDistroName` が bidi 非対応) / `src/main/app/dto-mapper.ts` (関門は `cwdDisplay`/`suggestedDisplayName`/`targetLabel` の 3 種のみ、`location`/`cwd`/`cwdKey`/5 テキストは素通し)
- **Issue**: 制御文字判定器が 4 定義あり bidi を見るのは 2 つだけ。**到達可能な実害経路は upstream (`build.ts` の `normalizeText` + `originLocation` が canonical/target のみ運ぶ) で塞がれている**ため Critical でなく High 上限。
- **Suggested fix**: `isValidDistroName` を `hasControlCharacter` と揃え bidi を弾く (定義を 1 箇所に集約)。`dto-boundary.test.ts` に無 gate フィールドの汚染ケースを足す (security M-001)。

---

## Medium (dedup 14 件) — 主なもの

| ID | 内容 | origin |
|---|---|---|
| M5-01 | `dto-boundary.test` が無 gate フィールド (`cwd`/`cwdKey`/`location`) を汚染入力で行使していない — H-D2 の穴を固定できていない | security M-001 |
| M5-02 | `protocol.ts:229-231` の docstring が反証済み根拠 (「雑音が JSON object の見込みは薄い」) を主張し続ける (C4-010 の鏡面) | platform PB5-002 |
| M5-03 | AD-032 の `amends:[AD-028]` が本文で裏付けられず、AD-028 に `amended-by` 後方リンクなし (AD-031 も同様) | architecture M-002 |
| M5-04 | `短命プロセス` が plan.md:66 / checklists:75 / spec.md:592 に残存 (contracts/charter は直したが取りこぼし) | architecture M-001 |
| M5-05 | `_overview` に VII/IX を足したが session/charter (VII) と isolation/charter (VII・IX) が未整合 | architecture M-003 |
| M5-06 | FR-031「訳出は ui」の infra 例外 (`候補 #N`) が spec に注記されず roadmap にしかない | architecture M-004 |
| M5-07 | M4-14 (`src/agents/` の 2 役の線引き) が AD-032 で扱われず未解決 | architecture M-005 |
| M5-08 | `programmatic` が無検査で IPC 境界を渡る (`boolean` 型の嘘、`"yes"` が素通り) | platform PB5-007 |
| M5-09 | opaque-unc / undetected-distro が spec Edge Cases / Key Entities に未反映 (Key Entities は 5 状態のみ)、持ち主が AD-032 と roadmap で矛盾 | po PO5-002 |
| M5-10 | 行ごと間引き件数が payload に出ず、FR-049「示す」義務の適用除外が spec に未記載 | po PO5-003 |
| M5-11 | ux C-002 (dead cwdDisplay) — H-A1 修正で同時に閉じる | ux C-002 |
| M5-12 | ヘッダの「全件を取り直す」が無条件で fix-environment 抑止と二重基準 (M4-09/PO4-007 継続) | ux C-004 |
| M5-13 | `SourceLabel` に役割記述子 sr-only が無く `名前 (#N)`/`候補 #N` が文脈なしで読み上げ | a11y G-M2 |
| M5-14 | `SourceLabel` badge の contrast が `(#N)` を下限で表示する疑い (要実測) | a11y G-M3 |

## Low (dedup 7 件) — 主なもの

| ID | 内容 | origin |
|---|---|---|
| L5-01 | `cwdKeyOf` の comment が `JSON.stringify` の保証を過大に述べる (DEL/C1/bidi はエスケープされない) | security L-001 |
| L5-02 | Constitution v1.2.5 が自らの新規則「Governance 追加=MINOR」に照らすと PATCH の再帰的曖昧さ | architecture L-001 |
| L5-03 | AD-032 申し送り「opaque-unc を spec Edge Cases に (持ち主 R-2 Round 5)」が未実施 | architecture L-002 / po と重複 |
| L5-04 | `候補 #N` の `#` が JP スクリーンリーダで発音不定 | a11y G-L4 / ux C-003 と重複 |
| L5-05 | `pathDisplay` が `truncated` を捨て cwdDisplay に切り詰め印が出ない | a11y G-L5 |
| L5-06 | 同一セッションに「未検出」概念が 2 度出て冗長・表記揺れ | ux C-005 |
| L5-07 | Round 別 track 本文の保存規約が未適用で継承検証が困難 (S4-002 が評価不能になった実例) | po PO5-004 / security |

---

## 機械検証 (Round 5 作業末尾で実行済み)

| 検証 | 結果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **34 files / 741 passed / 0 failed** |
| `node node_modules/typescript/bin/tsc --noEmit` | エラー 0 |
| `node node_modules/eslint/bin/eslint.js src scripts tests` | 0 errors |
| `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | 違反 0 (166 modules / 680 deps) |
| `node scripts/constitution/check.mjs` | 15 項目 ok 14 / 違反 0 / 検査対象なし 1 |
| **ルール発火検証** `node scripts/rules/run.mjs` | **26 件一致**。Round 4 以降に規則定義・fixture 未変更のため Phase 0 step 6 の再実行は不要だが、Round 5 作業末尾で単独実行済み |

**ただし security M-001 のとおり、`dto-boundary.test` は無 gate フィールドを汚染入力で行使していない。緑は遵守の証拠にならない。**

---

## 次にやるべきこと

収束条件は満たしたので gate は halt しないが、Critical=0 の PASS は「done 可」の機械判定にすぎない。
**推奨は Round 6 を回して以下を閉じてから /cl-done。** いずれも数行〜文書で、CI に依存しない。

| 優先 | 対象 | 閉じる ID | 規模 |
|---|---|---|---|
| 1 | **incomplete-fix 3 件** — `SessionMeta` に cwdDisplay 描画 (H-A1 + ux C-002/C-005) / posix #7 に SEPARATOR_RUN (H-A2) / test describe を 8 行に (H-A3) | H-A1 / H-A2 / H-A3 | 各数行 + テスト |
| 2 | **持ち主のいない High 2 件に決着** — PB4-002 (inflight scope) / PB4-003 (refresh 直列化) を Round 6 で修正するか、ADR + roadmap で持ち主登録 | H-B1 / H-B2 | 数行 or 文書 |
| 3 | **偽完了の訂正** — tasks.md `[x]` / quickstart「決着」を訂正、roadmap に quickstart 再実行の owner 登録 | H-D1 | 文書 |
| 4 | **defense-in-depth** — `isValidDistroName` を bidi 込みに、`dto-boundary.test` に無 gate フィールドの汚染ケース | H-D2 / M5-01 | 数行 + テスト |
| 5 | **記録の鏡面** — protocol docstring / AD-028 amended-by / 短命プロセス 3 箇所 / charter VII・IX / FR-031 例外注記 / opaque-unc を spec Edge Cases / owner 矛盾の一本化 | M5-02〜10 | 文書 |

**SC-008 の予算値は人間承認済み。** 触れない。
**E2E / CI 基盤は M4 まで対象外。** 上記はいずれも依存しない。
**a11y G-H1 (H-C3) / 検出器 13・14 (H-C1/C2) は持ち主あり (R-3)** なので Round 6 の必須ではない。
