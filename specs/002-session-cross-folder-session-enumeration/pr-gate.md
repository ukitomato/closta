# PR Gate Round 4: 所在をまたぐセッション列挙 (R-2)

**Run**: 2026-09-23
**Base**: `main`
**Diff stat**: +24,848 -246 over 142 files
**Reviewers**: security / architecture / po / platform-boundary / a11y / ux (6 並列)
**起動しなかった reviewer**: `database-reviewer` — `gate_common::reviewers_filter` が
「`auto_invoke_patterns` に一致する変更ファイルが無い」として除外 (migration 0 件 / `*.sql` 0 件)。
`api-performance-reviewer` / `openapi-contract-reviewer` は `reviewers.yml` で未採用。
**Round inheritance**: Round 3 findings (Critical 0 / High 24) を全 track に引継ぎ

## Verdict

| Severity | This round (dedup 後) | Raw (track 合計) | Resolved from R3 | New in R4 | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | **0** | 0 | — | 0 | 0 |
| High | 26 | 32 | — | — | 0 |
| Medium | 31 | 36 | — | — | 0 |
| Low | 18 | 21 | — | — | 0 |
| **計** | **75** | 89 | **19** (raw 27) | **28** (raw 36) | 0 |

**Status**: **CONVERGENCE_FAILURE**

**Next**: ADR 起票 + spec 範囲調整 → Round 5。`--defer-remaining` は撤廃済 (pure hard gate)。

### 収束判定 (Phase 2)

```
convergence_failure := (R[4].resolved < R[4].new) AND (R[3].resolved < R[3].new)
```

| Round | resolved_from_prev | new_in_round | resolved < new |
|---|---:|---:|---|
| R[3] | 1 | 15 | **真** |
| R[4] | 19 (raw 27) | 28 (raw 36) | **真** |

→ **両方が真。CONVERGENCE_FAILURE で halt。**

**この判定は dedup の精度に依存しない。** raw 合計 (resolved 27 < new 36) でも、
本 md の dedup 後 (19 < 28) でも、想定しうるどの dedup でも不等号の向きは変わらない。
resolved が new を超えるには raw resolved 27 を上回る必要があり、それは raw の上限を超える。

### Critical=0 でありながら halt する理由

Round 4 は **Critical 0 / 6 track 全一致**であり、Round 3 で「置き換える前より悪い」と
判定された退行 (H3-002 恒久停止 / H3-001 UNC 未接続 / H3-003 10 秒宙づり) は
**platform-boundary の A/B 実測で解消が確認された**。実装の方向は正しい。

halt するのは「実装が 4 回変わったのに、spec / 契約 / ADR / 実機証跡が 1 回も追随していない」
ためである。3 track (architecture / po / platform-boundary) が独立に同じ診断に達した。

- `opaque-unc` は `specs/` 配下に **1 件も出現しない** (po / architecture)
- `classifyRawPath` を記録している文書は **0 件** (architecture)
- SC-005 / SC-015 は Round 4 の中心変更を測っていない (po)
- 判定表が **3 つの別番号体系**になり、同じ「#4」が 3 つの別のものを指す (po)
- `quickstart-results.md` は全体が 2026-09-18 で、Round 4 が変えた 5 行を覆っていない (po)

したがって次に畳むべき不変条件は architecture-reviewer の言葉どおり
**「記録と実装の対応を、実装を変えた同じコミットで閉じる」**である。

---

## Round 3 からの解消 (deduped 19 件)

| # | 内容 | 報告した track | 確認方法 |
|---|---|---|---|
| R-01 | UNC 綴りの穴 / `display: raw` 露出 (H3-004) | platform, security | `opaque-unc` の実測 3 綴り |
| R-02 | `parseWslUncPath` が未接続 (H3-001 / A3-004 / PO3-001) | platform, architecture, po | `\\wsl$\...` / `//wsl.localhost/...` → `wsl-from-unc` |
| R-03 | crash 計上順序による恒久停止 (H3-002) | platform | **A/B 実測** `WORKERS=4` (Round 3 は 3) |
| R-04 | `decodeResponse === null` の 10 秒宙づり (H3-003) | platform | `malformed` 即 settle |
| R-05 | `dispose()` の戻り値を誰も受けない (PB3-005 / PO3-008) | platform, po, architecture(partial) | `index.ts:98-103` |
| R-06 | `split(/s+/)` がリテラル `s` で恒真 (PO3-005 / H3-010) | po | `test.tsx:988` が `split(/\s+/)` |
| R-07 | `SectionEmpty` に同名ボタンが N 個並ぶ (PO3-011 / PO-219) | po | 論証を妥当と判定 |
| R-08 | SC-013「セッション 0 件」の肯定テスト不在 (PO3-020) | po | `test.tsx:1184-1205` |
| R-09〜R-19 | ux 8 件 / a11y 4 件 / security 4 件 (重複 5 件を控除) | ux, a11y, security | 各 track 集計 |

**特筆**: ux track は単体で **resolved 8 / new 5** と収束条件を満たし、
platform track も **resolved 5 / new 4** で満たす。収束していないのは全体集計である。

---

## High (dedup 後 26 件)

### C4-001 — 不変条件 4 の走査が、3 つある DTO 写像のうち 1 つを見ていない [origin: architecture (A4-007) + po (PO4-003)]
- **Where**: `src/main/app/dto-boundary.test.ts:9,11-30` / `src/main/app/dto-mapper.ts:136,169` / `src/domain/session/match.ts:75`
- **Issue**: このテストの docstring は「フィールド名を知らないので、あとから誰かがフィールドを足しても落ちる」と主張するが、`import` は `toSessionSummaryDTO` と `toEnumerationOutcomeDTOs` の 2 つだけで、**`toSessionGroupDTO` を一度も呼んでいない**。その未走査の経路が `cwdKey` を素通しで載せ、`cwdKeyOf` は `` `${namespace}\u0000${value}` `` で**構造上必ず U+0000 を含む**。
- **Why High**: 単独の `cwdKey` 越境 (Round 1 から Medium 継承) ではなく、**Round 4 が新たに立てた「もう漏れない」という主張が偽**である点。この網が緑であることを根拠に次 Round 以降の棚卸しが省かれる。加えて SC-011 は `SessionGroupDTO` の各 variant を要求するが `SESSION_GROUP_DTO_FIELDS` は src 全体で **0 件**。
- **Suggested fix**: (1) `toSessionGroupDTO` の 4 variant を走査に追加、(2) 落ちる `cwdKey` の区切りを非制御文字にする、(3) docstring を「覆っている写像を実名で書いた文」に直す、(4) `SESSION_GROUP_DTO_FIELDS` を 4 本定義し許可リスト検査を足す。
- **Status**: **new** / **orchestrator が読解で確認済**

### C4-002 — 区切り以外の 1 文字で `classifyRawPath` の UNC 判定を抜け、生 UNC が境界に出る [origin: security (S4-001)]
- **Where**: `src/domain/session/cwd-origin.ts:67,130-132` / `src/domain/runtime/path-api.ts:154-158,177-179`
- **Issue**: `classifyCwd` は `raw.trim().length === 0` で空判定だけして、**trim していない `raw`** を `classifyRawPath` に渡す。先頭が空白なら `leadingSeparatorCount` は 0 を返し、`makeHostPath` が失敗して `other` に落ち、`cwd-origin.ts:132` が `display: raw` で生 UNC をそのまま出す。
- **Why High**: 不変条件 1 が「先頭区切りの本数」という形の性質に置き換えた、その**性質の外側に穴が残った**。FR-042 の違反経路。
- **Suggested fix**: `classifyRawPath` の入口で `raw.trim()` を使う (または `classifyCwd` が trim 済みの値を渡す)。性質テストに「先頭に空白/制御文字を付けた UNC」を追加。
- **Status**: **new** / **orchestrator が読解で確認済**

### C4-003 — `undetected-distro` の表示からディストロ名が消えた (Round 4 の退行) [origin: po (PO4-002)]
- **Where**: `src/domain/session/cwd-origin.ts:100` / `src/main/app/dto-mapper.ts:109` / 契約 `contracts/ipc-session-list.md:137`
- **Issue**: `display` を生 UNC から**変換後の POSIX パスだけ**に変えた。`SessionSummaryDTO` に `distroName` を運ぶ経路は **0 件**。契約は「ディストロ名 + 変換後の POSIX パス」と明記し、`:141-143` は理由 (分解は `infra`、renderer は再合成しない) まで書いている。
- **Why High**: `undetected-distro` を `unknown-location` から分けた唯一の意味が「**どのディストロかは分かる**」である (FR-017 / US-1 AC-8)。名前が出ないと利用者は次の操作を決められず、差は訳語だけになる。**FR-042 はディストロ名の露出を禁じていない** (`EnumerationOutcomeDTO.location` は平文で運ぶ) ため、塞ぐ必要のないものまで塞いだ。
- **Suggested fix**: `display` を `<distroName>: <posix>` 相当に `infra`/`domain` で合成する (DTO を増やさない)。
- **Status**: **new** / **orchestrator が読解で確認済**

### C4-004 — UNC のディストロ名を大小区別で照合しており、OS が同一と解決する綴りが「未検出の所在」に落ちる [origin: platform (PB4-001)]
- **Where**: `src/domain/session/cwd-origin.ts:99` / `src/domain/runtime/path-api.ts:207,212`
- **Issue**: 接頭辞は `lower.startsWith(...)` で大小無視にしたが、**ディストロ名は素の文字列のまま**通す。実機で Windows は share 名を大小無視で解決する (`\\wsl.localhost\ubuntu-26.04\home` → OK)。同じ値が `undetected-distro` になる。
- **Why High**: H3-001 と**まったく同じ失敗モードが、綴りではなく大小の軸で残っている**。不変条件 1 が「穴を毎ラウンド出す設計をやめる」と宣言した直後の穴。`originLocation()` が `null` を返すため登録導線も成立しない (FR-017 / US-1 AC-5)。
- **Suggested fix**: `namespace.ts` に `canonicalDistroName(raw, detected)` を置き、大小無視の完全一致で検出済み集合の綴りを返す。`isSameDistro` も同じ規則に揃える。
- **Status**: **new** / **platform が実機 + vitest probe で実測**

### C4-005 — 並行要求の束ねが `scope` を見ず、`page` の結果が `all` として `complete: true` で確定する [origin: platform (PB4-002 / 継続 PB-208)]
- **Where**: `src/main/app/session-enumerator.ts:481-488` / `src/main/app/session-service.ts:511-525`
- **Issue**: `inflight` の鍵が `request.target.key` だけで `scope` を含まない。実測で `SAME_PROMISE=true` / 送信 1 本。先頭 50 件だけを持ったまま `complete: true` が立つ。
- **Why High**: FR-037 と FR-004 / SC-006 が同時に破れる。到達経路は「先頭ページ取得中に再取得を押す」。
- **Suggested fix**: 鍵に `scope` を含める、または scope 違いは合流させず鎖に並べる。
- **Status**: 継続 (Round 3 から severity 据え置き) / **platform が probe で実測**

### C4-006 — `refresh()` に直列化もクールダウンも無く、押すたびに UNC 浅い列挙が重なる [origin: platform (PB4-003 / 継続 PB-204)]
- **Where**: `src/main/app/session-service.ts:662-666`
- **Issue**: `list()` は `firstPage`、`completeInBackground()` は `completing` で守るが、`refresh()` だけが素の `await fetchAll({kind:'all'})`。**探索相 (`finder.hostTarget()` / `wslTargets()`) は列挙器を通らない**ので呼ばれた回数だけ UNC `readdir` が走る。
- **Why High**: renderer は未信頼 (AD-023)。`ENUMERATION_COOLDOWN_MS` を置いた理由が探索相にだけ手当てされていない。C4-005 の引き金でもある。
- **Suggested fix**: `refreshing` promise で 1 本に合流させ、`completing` / `firstPage` と相互排他にする。
- **Status**: 継続 (据え置き)

### C4-007 — 検証項目 14 (Agent SDK 許可 1 件) が 5 つの回避形を素通しする [origin: platform (PB4-004 / 継続 PB-205)]
- **Where**: `scripts/constitution/check.mjs:656-686`
- **Issue**: 正規表現を 7 入力に適用した結果、発火 2 / **素通り 5** (default import / 動的 import / 分割代入 dynamic / `createRequire` / **2 つ目の名前付き import 文**)。
- **Why High**: 項目 14 は FR-044 (transcript 本文を運ばない) の唯一の機械的番人。AD-027 の「違反サンプルで発火したことで確認する」基準に照らすと、確認済みは baseline 1 形のみ。
- **Suggested fix**: `named` を `matchAll` に、default/名前空間 import を違反に、`import(` / `createRequire` の出現自体を違反に。`tests/rule-fixtures/` に 5 形を追加。
- **Status**: 継続 (据え置き)

### C4-008 — 検証項目 13 (`agents` が UNC API を呼ばない) が別名 1 つで完全に無効化される [origin: platform (PB4-005)]
- **Where**: `scripts/constitution/check.mjs:585,603-607` / `scripts/constitution/allowlists.mjs:338-345`
- **Issue**: **実 A/B 実測** — 直接呼び出し `runtimePathOps.toUnc(target)` → `[VIOLATE] #13`。別名 `const makeUnc = ops.toUnc; makeUnc(target)` → `[ok]`。
- **Why High**: `expected.mjs:79-90` のとおりこのサンプルの `detectors` は `['constitution']` の 1 つだけで、ESLint も depcruise も `agents → path-api` を止めない。**項目 13 が FR-042 封じ込めの唯一の検出器**であり、不変条件 1 で `UNC_API_NAMES` に `classifyRawPath` を足した効果も同じ形で外れる。
- **Suggested fix**: 項目 13 を「`src/agents/` から `@domain/runtime/path-api` への import 0 件」に**構造で**置き換え、depcruise ルールを足して `detectors` を 2 つにする。
- **Status**: **new** / **platform が A/B 実測**

### C4-009 — 由来候補の一意化が fixpoint でなく、かつ `infra` が訳出済みの日本語を境界に出す [origin: po (PO4-001) + architecture (A4-006) + platform (PB4-013)]
- **Where**: `src/main/infra/session/target-finder.ts:64-75` (特に `:70,72`)
- **Issue (a) 一意性**: `disambiguate()` は生ラベルで重複を数え、**生成したラベルが既存ラベルと衝突しないかを見ていない**。`['alice','alice','alice (#0)']` → `['alice (#0)','alice (#1)','alice (#0)']` で 1 番目と 3 番目が同一。FR-052 の一意性が破れる。
- **Issue (b) 訳出の層**: `` `候補 #${ordinal}` `` / `` `${label} (#${ordinal})` `` は**日本語の表示文字列を `infra` で生成**して IPC を渡る。FR-031「訳出は `ui` が行う」と、**同じ Round のコミットが書いた** `cwd-origin.ts:63`「参照キーが意味を運ぶ (訳出は `ui` の責務)」に正面から反する。同じ問いに 2 通りの答えがある。
- **Issue (c) 切り詰め**: `target-finder` は 512 バイト正規化の**後**に接尾辞を足すので最大 517 バイト。`dto-mapper.displayName` が再び 512 で切ると**曖昧さ解消の接尾辞が落ちる**。
- **Why High**: 不変条件 4 が自ら宣言した性質 (一意かつ非空) の反例であり、値の出どころはホスト利用者以外が作れるディレクトリ名。
- **Suggested fix**: `disambiguate` は**序数**を返し、日本語は `labels.ts` に移す。(a)(b)(c) が同時に閉じる。
- **Status**: **new** (3 track が独立に到達)

### C4-010 — `malformed(id: null)` の雑音 1 行が飛行中の要求を即座に失敗させる [origin: architecture (A4-008) + platform (PB4-007)]
- **Where**: `src/agents/protocol.ts:261-266` / `src/main/app/session-enumerator.ts:332-336` / `src/main/app/enumerator-spawner.ts:63-84`
- **Issue**: 実測 `{}` / `{"level":"info"}` → `{"kind":"malformed","id":null}`。`handleLine` は `id === null` のとき `waiting.id` 照合を飛ばして `enumeration-failed` に落とす。`enumerator-spawner` は **`parentPort` と `stdout` の両方**を購読し続けており、Electron 下で `stdout` は**雑音専用チャネルとして生きている** — まさに SDK / 依存の構造化ログが出る場所。
- **Why High**: 10 秒宙づり (H3-003) の解消と引き換えに、雑音由来の偽の失敗が入った。根拠の「雑音が JSON オブジェクトである見込みは薄い」は**実測していない前提**であり、C4-011 (AD-031 の `TEXT_MAX_BYTES`) と同じ型の誤り。
- **Suggested fix**: `id === null` のときは settle しない (雑音扱いに戻す)。宙づりは `id` が読めた場合に限れば覆える。加えて `parentPort` から応答を受けたら stdout 購読を落とす。
- **Status**: **new**

### C4-011 — AD-031 の許容根拠が偽であり、不変条件 2 でさらに弱くなった [origin: architecture (A4-001 / 継続 A3-001・H3-005)]
- **Where**: `docs/decisions/0031-...md:96-99` / `src/agents/protocol.ts:321-333` / `src/domain/session/interfaces.ts:104-136`
- **Issue**: 「1 件あたりの上限は `TEXT_MAX_BYTES` で縛られている」を根拠に main での `JSON.parse` を許容したが、`grep "TEXT_MAX_BYTES|normalizeText" src/agents/` = **0 件**、`createLineAssembler` に**行長上限が無い**。不変条件 2 で文字列 6 項目が `unknown` になり、「パース前に何も縛っていない」ことを型宣言として公式化した。
- **Why High**: Principle IX (Standard) の逸脱を許容した唯一の論拠が事実でない。Constitution `:504-515` がこの ADR を参照している。
- **Suggested fix**: AD-031 に日付つき訂正節。許容根拠を「本文を運ばない」1 本に絞る。`createLineAssembler` に行長上限を置けば記述と実装が一致する。
- **Status**: 継続 (Round 3 から据え置き) / **orchestrator が Round 3 で確認済**

### C4-012 — 不変条件 1 が AD-029 の判定モデルを変えたが、ADR / data-model のどこにも記録が無い [origin: architecture (A4-005) + po (PO4-005)]
- **Where**: `src/domain/runtime/path-api.ts:107-180` ⟷ `docs/decisions/0029-...md:46-83` / `data-model.md:74-96`
- **Issue**: 判定が「綴りの列挙」から「先頭区切りの本数」に変わり、`opaque-unc` が新設され、公開面は「1 つ追加」ではなく関数 2 + 型 2 になった。`classifyRawPath` を記録している文書は **0 件**。判定表は `cwd-origin.ts` 8 行 / `data-model.md` 7 行 / テストの `describe` 7 行の **3 体系**で、同じ「#4」が 3 つの別のものを指す。
- **Why High**: SC-005 は「判定表の全セルを網羅」を計測条件とするため、**表の正本が 3 つあってどれも実装と違う**と計測条件が意味を失う。AD-031 の境目では、これは「事実誤認の訂正」ではなく**決定の変更**であり後続 ADR を要する。
- **Suggested fix**: 後続 ADR 1 本 + `data-model.md` を 8 行に + charter / `_overview.md` / plan.md の `parseWslUncPath()` 記述に `classifyRawPath()` を足す。
- **Status**: **new**

### C4-013 — ADR immutability の規則変更が執行系 4 ファイルに届いていない [origin: architecture (A4-002 / 継続 A3-003)]
- **Where**: `.claude/agents/reviewer-base.md:22` / `.claude/agents/architecture-reviewer.md:40` / `.claude/skills/spec-gate/references/subagents/{reviewer-base,architecture-reviewer}.md`
- **Issue**: AD-031 が「事実誤認の訂正は in-place」と決めたのに、**全 reviewer が invoke 直後に読む 4 ファイルは「accepted 後 immutable」のまま**。Round 3 の diff は `.claude/agents/` の 3 ファイルを触っており、**触れたのに直さなかった**。`0028-*.md` に `AD-031` の出現 0 件、`supersedes: []` も空。
- **Why High**: 規則の SSoT と執行系が食い違い、**次の Round も同じ指摘が機械的に再生産される配線**。本 Round の architecture-reviewer 自身、旧規則を指した指示書で判定している。
- **Status**: 継続 (据え置き)

### C4-014 — AD-031 の「境目」が運用できない (先例 5 件の分類が自身の基準で誤っている) [origin: architecture (A4-003 / 継続 A3-002)]
- **Where**: `docs/decisions/0031-...md:27-37,69-80`
- **Issue**: 表の AD-028 の 2 行は内容が空欄のまま「5 件すべてが事実誤認の訂正である」と断じている。実際 AD-028 `:101-114` は規則そのものを差し替えており、AD-031 自身の基準では**決定の変更**。
- **Why High**: in-place 訂正を認める Constitution 改定 (v1.2.4) の唯一の論拠が自己矛盾している。
- **Status**: 継続 (据え置き)

### C4-015 — Principle IX 再評価の「持ち主」が 4 巡目も置かれていない [origin: architecture (A4-004) + po (PO3-004)]
- **Where**: `docs/decisions/0031-...md:115-117` / `.specify/memory/constitution.md:514` / `docs/roadmap.md`
- **Issue**: 「R-3 が本文を運ぶ時点で再評価する」と書いたが、`docs/roadmap.md` に `AD-031` / `Principle IX` の出現 **0 件**。v1.2.3 が AD-028 §5 について明文化した「持ち主のいない延期を残さない」を、その次の版を起こす ADR が自分に適用していない。**同じ型の指摘は R-1 から 3 回目。**
- **Status**: 継続 (据え置き)

### C4-016 — 実機証跡が Round 4 の UI 変更を反映していない [origin: po (PO4-004 / 継続 PO3-007・H2-016)]
- **Where**: `specs/.../quickstart-results.md:334-495`
- **Issue**: 証跡はすべて 2026-09-18。Round 4 が変えたのは、まさに証跡が「操作実施。指摘なし」で通した領域 (V-1 件数表記 / V-3 出自 / V-4 導線の出し分け / V-6 先頭ページ / V-8 空状態の優先順位)。冒頭 `:5` は今も「SH-074 / SH-089 ともに決着」。
- **Why High**: SC-001 / SC-007 / SC-013 の計測経路が「Vitest + quickstart」であり、**AC の充足は現在のコードについて誰も確認していない**。
- **Suggested fix**: 全面再実行は不要。**Round 4 が触れた 5 行だけ**を再実行して日付つきで追記。CI / E2E 基盤に依存しない。
- **Status**: 継続 (据え置き)

### C4-017〜C4-026 — security 3 件 / a11y 6 件 / ux 5 件 (重複控除後 10 件)
本 md の集約時点で orchestrator が**全文を保持しているのは po / architecture / platform-boundary の 3 track**である。
security / a11y / ux は verdict 集計と、orchestrator が独立に検証した指摘のみを本文に持つ。

- **security**: Critical 0 / High 4 / Medium 5 / Low 2。resolved 4 / partial 1 / unresolved 3 / 再評価不能 5 / new 6。
  `/cl-done` 前に閉じるべき最小集合として **S4-001 / S4-002 / S4-003** を自ら指名。
  S4-001 は C4-002 として上に展開済 (orchestrator が読解で確認)。
  S4-003 は「`location.distroName` が `dto-mapper` の関門を通らず、`isValidDistroName` が bidi 制御文字を通す」。
- **a11y**: Critical 0 / High 6 / Medium 4 / Low 4。resolved 4 / 回避 1 / unresolved 4 / 再評価不能 4 / new 8。
  A11Y3-005 と A11Y4-002 は `<EmptyState>` を `role="status" aria-live="polite"` で包む **1 行**で同時に閉じる
  (先例: `WorkspaceFoldersScreen.tsx:596`)。
- **ux**: Critical 0 / High 5 / Medium 8 / Low 5。**resolved 8 / new 5** — 単体で収束条件を満たす唯一の track。
  po が独立に「UX3-003〜006 (coverage 1 本化) は閉じた」と確認している。

**この欠落自体が po track の指摘 PO4-012 である** — `pr-gate.md.roundN` は保存されているのに
track 別の本文が上書きされ、次 Round の reviewer が「resolved か unresolved か」を自分で検証できない。
Round 5 以降は `<track>-reviewer.round<N>.md` の命名で保存すること
(先例: `architecture-reviewer.round2.md`)。

---

## Medium (dedup 後 31 件) — 主なもの

| ID | 内容 | origin |
|---|---|---|
| M4-01 | `programmatic` の型検査が Round 4 で削られ、プロセス境界で `unknown → boolean` の嘘が残った。実測で `"yes"` が素通り | platform (PB4-006) + po (PO4-009) |
| M4-02 | 行の間引き件数が payload にも UI にも出ない (`malformedCount` 不採用)。FR-049 前半「除去が起きたことを payload 上で示す」の適用除外が未記載 | po (PO4-010) + architecture (M-5) |
| M4-03 | SC-005 / SC-015 が Round 4 の中心変更 (`opaque-unc` / 型違いを「不明」に倒す) を測っていない | po (PO4-005) |
| M4-04 | `\\?\UNC\...` / `\\.\UNC\...` は実機で解決するのに所在も表示値も失う | platform (PB4-008) |
| M4-05 | `\\?\C:\...` は UNC ではない (server も share も無い) のに UNC 扱いされ、FR-042 の根拠なしに表示値を落とす | platform (PB4-009) |
| M4-06 | 連続 crash 上限による恒久停止が汎用の `enumeration-failed` でしか現れず、再武装の経路も無い。実測 `WORKERS=3` で打ち止め | platform (PB4-010) |
| M4-07 | 列挙プロセスの env 許可リストが `allowlists.mjs` の外にあり、検査項目も無い | platform (PB4-011) |
| M4-08 | `opaque-unc` の行は「値はあるが読めない」という第 3 の状態で、`UnknownReason` にも spec にも無い | po (PO4-006) |
| M4-09 | 「理由に見合う操作だけを出す」が 1 箇所でなく、ヘッダの再取得が無条件に残る | po (PO4-007) |
| M4-10 | `SectionEmpty` に操作を置かない例外が spec に無く、SC-013 が機械的に判定できない | po (PO4-008) |
| M4-11 | AD-030 前の「短命プロセス」記述が contracts / charter の 3 箇所に残る。同じ節で見出しと本文が食い違う | architecture (M-1) |
| M4-12 | Constitution v1.2.4 に Sync Impact Report が無く、plan.md は「v1.2.2 に基づく」のまま | architecture (M-2) |
| M4-13 | `_overview.md` の Cross-domain invariants に Principle VII / IX の行が無い | architecture (M-3) |
| M4-14 | `src/agents/` が「列挙プロセス」と「親子共有プロトコル」の 2 役を持ち、規則・検査・実装が三者三様 | architecture (M-4) |
| M4-15 | `dispose()` の「`exit` の到着確認」が未実装。`ending` を「確認できた」側に数えるため孤児が 0 件と報告される | architecture (M-6) |
| M4-16 | `parseWslUncPath` が外部呼び出し 0 件のまま `export` されている (「公開 API を 1 つに畳んだ」が未完) | architecture (M-7) |
| M4-17〜M4-31 | security 5 件 / a11y 4 件 / ux 8 件 (重複控除後 15 件) | security, a11y, ux |

## Low (dedup 後 18 件) — 主なもの

| ID | 内容 | origin |
|---|---|---|
| L4-01 | 絞り込み中もヘッダの件数は索引全体を指す | po (PO4-011) |
| L4-02 | Round 2 / 3 の track 別本文が spec dir に残っておらず継承検証ができない | po (PO4-012) |
| L4-03 | `候補 #N` / `名前 (#N)` が glossary 未登録 (FR-048) | po (PO4-013) |
| L4-04 | `Coverage` / `FailureRemedy` / `opaque-unc` / `RawPathShape` が glossary 未登録 | architecture (L-1) |
| L4-05 | `classifyRawPath` の `separators === 1` が単一バックスラッシュも `posix` 扱い (`\dev\proj`) | architecture (L-2) |
| L4-06 | 判定表 8 行が実装の 9 分岐を覆っていない (`\home\y` が表に無い経路で `unknown-location`) | platform (PB4-012) |
| L4-07 | `warmUp()` が `launch()` の例外をアプリ起動経路まで通す | platform (PB4-014) |
| L4-08 | `'ended'` は書くだけで誰も読めない状態で、遷移表 7 行のうち 2 行が独立に観測できない | platform (PB4-015) |
| L4-09〜L4-18 | security 2 件 / a11y 4 件 / ux 5 件 (重複控除後 10 件) | security, a11y, ux |

---

## 機械検証 (platform-boundary が Round 4 で実行)

| 検証 | 結果 |
|---|---|
| `node node_modules/eslint/bin/eslint.js src scripts tests` | 違反 **0** |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` | エラー **0** |
| `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | 違反 **0** (166 modules / 675 dependencies) |
| `node scripts/constitution/check.mjs` | 15 項目 / ok 14 / violation 0 / pending 1 (#5 docker、R-2 非使用) |
| `node node_modules/vitest/vitest.mjs run` | **34 files / 719 passed / 0 failed** |
| `node scripts/rules/run.mjs` | orchestrator が Phase 0 で実行済 — **26 件一致** |

**ただし C4-007 / C4-008 のとおり、検証項目 13 と 14 は回避形を検出しない。**
緑であることは遵守の証拠にならない (Constitution が Principle VIII / IX について書いた留保と同じ形)。

---

## 次にやるべきこと

収束規則により Round 5 へは**そのままは進めない**。ADR 起票 + spec 範囲調整を経る。
3 track が独立に指した根は 1 つである — **実装が 4 回変わり、記録が 0 回追随した**。

| # | 対象 | 閉じる ID | 規模 |
|---|---|---|---|
| 1 | **後続 ADR 1 本** — UNC 判定を綴りの列挙から先頭区切りの本数へ / `opaque-unc` の追加 / `path-api` 公開面の一本化 / `src/agents/` の 2 役の線引き。AD-029 §1 §3 と AD-028 §3 の読み替え根拠にする | C4-012 / M4-14 | 文書 1 本 |
| 2 | **AD-031 に日付つき訂正節** — 根拠の訂正 / 先例表 2 行を埋めて再分類 / 境目の言い換え + `roadmap.md` の R-3 行に申し送り | C4-011 / C4-014 / C4-015 | 文書 |
| 3 | **執行系 4 ファイルの 1 行置換** + AD-028 §2 直下に読み替え 1 行 + AD-031 frontmatter | C4-013 | 5 行 |
| 4 | **spec / data-model / contracts の追随** — SC-005 に `opaque-unc`、SC-015 に「型違いを不明に倒す」、判定表を 8 行に統一、`SESSION_GROUP_DTO_FIELDS`、「短命プロセス」3 箇所 | C4-012 の一部 / M4-03 / M4-11 | 文書 |
| 5 | **実装の欠陥 6 件** — C4-001 (group 経路の走査 + `cwdKey`) / C4-002 (trim) / C4-003 (ディストロ名) / C4-004 (大小無視) / C4-009 (序数を返す) / C4-010 (`id === null` は settle しない) | 上記 | 各数行 + テスト |
| 6 | **検出器の構造化** — 項目 13 を depcruise へ、項目 14 を `matchAll` + 動的 import へ、違反サンプル 6 件 | C4-007 / C4-008 | 中 |
| 7 | **quickstart 5 行の再実行** | C4-016 | 実機操作 |

**SC-008 には触れない。** 予算値は人間承認済みであり、指摘は「未検証であることの行き先が台帳に無い」点のみ (継続 PO3-021)。
**E2E / CI 基盤は M4 まで対象外** (人間の指示)。上記 1〜7 はいずれも CI に依存しない。
