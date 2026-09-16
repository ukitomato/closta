# PR Gate Round 1: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Base**: `main` (HEAD の祖先。diverge なし)
**Diff stat**: +37,337 / -183 over 199 files
**Reviewers**: security, architecture (default + adr-drift), po, platform-boundary, database
**Round inheritance**: Round 1 (初回)。design-gate の各 reviewer 出力を前 round として継承

## Verdict

| Severity | This round | Resolved from design-gate | New in R1 | Net (dedup 後) | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | **2** | 2 | 2 | **2** | 0 |
| High | 22 | 13 | 22 | **19** | 0 |
| Medium | 24 | 3 | 24 | **24** | 0 |
| Low | 16 | 0 | 16 | **15** | 0 |

**Status**: **FIX_REQUIRED**

**Next**: Critical を 2 件とも解消してから `/cl-pr-gate` を再実行 (Round 2)。
`--defer-remaining` 経路は撤廃済みのため、**Critical 残存では `/cl-done` に進めない**。
妥協が必要なら ADR 起票 + Constitution / spec 範囲調整で Critical を解消する。

### track 別の内訳

| Reviewer | Critical | High | Medium | Low | design-gate からの継承 |
|---|---|---|---|---|---|
| security | 0 | 2 | 4 | 4 | resolved 10 / unresolved 0 |
| architecture | **1** | 4 | 6 | 3 | resolved 3 / unresolved 0 |
| po | 0 | 8 | 5 | 2 | resolved 3 / partially 1 / unresolved 0 |
| platform-boundary | **1** | 5 | 3 | 4 | resolved 2 / unresolved 0 |
| database | 0 | 3 | 6 | 3 | (design-gate では未起動) |
| **合計 (raw)** | **2** | **22** | **24** | **16** | resolved 18 / partially 1 / unresolved 0 |

**design-gate の指摘は 5 reviewer 合計で 18 件が解消、未解消 0 件**である。
Critical 2 件はいずれも **Round 1 で新規に観察されたもの**で、design-gate からの持ち越しではない。

---

## Critical (Round 1)

2 件は独立した指摘だが**同じ穴の裏表**である。R-1 の機械強制の主張は
「lint / depcruise / check.mjs が違反 0」→「違反 0 はルールが死んでいる状態と区別できない (AD-025 の実測 5 件)」
→「だから `test:rules` が発火を確かめる」という 3 段構えで立っている。
**C-001 は 3 段目が機能していないことを示し、C-002 は要求された規則が 1 本存在しないことを示す。**
どちらも「`existing_violations: 0` が合格と見分けられない」という AD-024 が名指した反パターンの実例である。

### C-001 — `test:rules` の期待表照合が「意図した検出器が発火したか」を判定できず、`#N` 形式の期待は構造的に常に真 [origin: platform-boundary]

- **Where**: `scripts/rules/run.mjs:140-190` / `scripts/constitution/check.mjs:539-545` / `tests/rule-fixtures/expected.mjs:73,81,133,141,149,157,209`
- **Issue**: `verify()` は検出器の発火を **出力テキストにサンプルのファイル名が現れるか**だけで決め (`:142`)、期待規則名は **どの検出器の出力でもよい全体一致**で照合する (`:187` `Object.values(outputs).some((output) => output.includes(rule))`)。**どの規則がどのサンプルに対して発火したかという対応を一切検査していない。**
  そのうえ `check.mjs` は全 11 項目の見出しを状態に関わらず必ず印字するため、`rules: ['#1']` は **check.mjs が起動しさえすれば必ず満たされる**。
- **Why critical**: accepted ADR (AD-025) の結論「ルールは『書いた』ことではなく『違反サンプルで発火した』ことで確認する」に対する drift であり、Constitution `## Existing violations summary` の「`pnpm test:rules` が期待した検出器が実際に発火することを毎回確かめる」という主張の唯一の根拠がこれである。**項目 1 が完全に壊れても、`no-restricted-imports` が `src/main/app/**` に適用されなくなっても `test:rules` は緑のまま**である。
- **gate による独立確認 (実測)**: `run.mjs:187` を直読して照合が全出力横断の部分一致であることを確認した。具体例も裏取り済み — `expected.mjs:144-150` の `wsl-args-array` は `--import` を捕まえる意図で `rules: ['#1','#3']` を期待するが、`allowlists.mjs:161` が明記するとおり `--import` は `PRIVILEGED_COMMANDS_ALWAYS` / `_IN_SPAWN_CONTEXT` に無く (項目 2 の `WSL_ALLOWED_ARGS` 側の関心事)、**項目 1 はこのサンプルに 1 件も発火しない**。それでも 20/20 一致が報告される。
- **Suggested fix**: (1) `check.mjs` に `--json` を足し `{id, state, findings:[{file,line}]}` を出す。`run.mjs` は「項目 N の findings に当該サンプルの target が含まれるか」で照合する。(2) eslint / depcruise も `--format json` / `--output-type json` でサンプル単位に規則名と file:line を対応させる。(3) `wsl-args-array` の期待を実態に合わせる (`rules: ['#3']`)。**期待表を直すだけで済ませず (1)(2) で構造を塞ぐ。** (4) `no-orphans` の個別除外 (`run.mjs:110-116`) は (1)(2) 後に不要になる。除外を増やす方向に進めない。
- **Status in this round**: new

### C-002 — AD-023 §7 の `services ✗→ I/O モジュール直接` が不在のまま、AD-025 §9 の履行条件が HEAD で成立していない [origin: architecture]

- **Where**: `.dependency-cruiser.js` (forbidden 22 ルールに services 系 0 件) / `eslint.config.mjs` (`boundaries/dependencies` 10 policies に 0 件) / `src/main/app/folder-service.ts:1` / `src/main/app/runtime-store.ts:46`
- **Issue**: AD-025 §9 (accepted) は「対象が無いルールを書いて『強制した』とは言えない」として、**「最初の調停クラス (状態を持ち I/O をインタフェース経由で扱うクラス) を作る feature で `from` セレクタを実名で定義する」**と定めた。その feature は R-1 である。HEAD には調停クラスが 2 つある (`runtime-store.ts:46` は自身の docstring で「状態を持つ調停は結線層が担う」と宣言し AD-023 §5 の `RuntimeRegistry` そのもの、`folder-service.ts:90` は `folders`/`sessions`/`verifiedCache`/`listeners` を保持し I/O を注入されている)。**それでもルールは 1 行も無く、違反形が既に 1 件入っている** — `folder-service.ts:1` の `import { randomUUID } from 'node:crypto'`。同ファイルは `:81` で「`app` が `node:fs` を直接触らないために注入する」と書いており、同一ファイル内で方針が割れている。`node:crypto` を I/O と見なすのはこのリポジトリ自身の語彙である (`registry.ts:62`「`domain` は I/O を持たないため `crypto` を import できない」)。
- **Why critical**: severity 表が「accepted ADR drift」を Critical に列挙している。AD-025 が accepted になった時点で両調停クラスは既に存在していたため、これは実装の遅れではなく **ADR 本文の前提が accepted 時点で既に偽だった**ことになる。AD-023 §5 はこのルールを「**God Service への唯一の歯止め**」と位置づけており、歯止め 0 件のまま `folder-service.ts` は 400 行を超えた。X-1 / X-3 / I-2 で Service が 3 つ増える。
- **Suggested fix**: (1) `.dependency-cruiser.js` に `services-not-to-io` を 1 ルール追加 (`from: '^src/main/app/(folder-service|runtime-store)[.]ts$'`)。`randomUUID` は `deps.newId: () => string` として注入する (`registry.ts` が既に `makeFolderId(gen)` の形を持つので `composition-root.ts` で 1 行)。(2) `tests/rule-fixtures/a-direct/service-io-import.ts.fixture` を 1 件足す (C-001 の修正後でないと発火確認にならない点に注意)。(3) **AD-025 は accepted なので本文を in-place 改変しない** — 履行した事実を新規 ADR か plan の Post-design re-check に記録する。
- **Status in this round**: new
- **降格の判断**: reviewer 自身が「enforcement gap は High 上限と判定するなら降格に異議はない」と述べたが、**gate は降格しない**。cascade 探索は完了しており (`create[A-Z]` 14 件 → 調停クラス 2 件 / ルール 0 件 / 違反 1 件 / fixture 0 件)、severity 表は「accepted ADR drift」を Critical に明記している。gate を通すために実証済みの指摘を下げるのは hard gate の趣旨に反する。

---

## High (Round 1) — dedup 後 19 件

### 重複統合 (Phase 6 / multi-reviewer dedup)

| 統合後 | 元の指摘 | 統合の根拠 |
|---|---|---|
| **H-A** FR-010 の single-flight が実装に 1 箇所も無い | security H-002 + platform-boundary H-001 | 同一の観察 (`inflight\|coalesc` が `src/` に 0 件)。security は資源枯渇 (CWE-770) の面、platform は起動時二重検出と `ensureVerified` の負キャッシュ穴の面から記述。**FR-010 が「境界で強制する制約であり UI の作り方に委ねてはならない」と名指した仕組みが存在しない**という 1 つの事実 |
| **H-B** chat 画面が FR-033「chat 用 Element を採用しない」に反して出荷されている | po H-005 + architecture H-002 | 同一事実。po は spec / tasks / SC の追随漏れ、architecture は「NON-NEGOTIABLE の Verification を 2 度書き換えるより chat 画面を R-3 に送るほうが小さい修正だった。その選択肢の検討記録がどの SSoT にも無い」という判断経緯の面 |
| **H-C** Principle VI の検証スコープに CI 定義が入っておらず `tests/` が事実上のディレクトリ除外 | architecture H-003 + platform-boundary H-004 | 同一の `SCAN_ROOTS` / `SCAN_FILES` 問題。走査外の実行可能ファイル 7 件 (`.github/workflows/verify.yml` / `vitest.config.ts` / `tests/**` 5 件) |

### High 一覧

| ID | 指摘 | origin |
|---|---|---|
| H-A | FR-010 の single-flight 不在 (起動時に `wsl.exe` 3→6 回 / `ensureVerified` が空結果を非キャッシュ / `sessions` に上限・掃除なし) | security + platform |
| H-B | chat 画面の spec drift (FR-033 / Assumptions「UI は 3 画面」/ tasks SH-007 が `[x]` のまま) | po + architecture |
| H-C | Principle VI の検証スコープに CI 定義が無い | architecture + platform |
| H-D | `shell.openExternal` に scheme 許可リストが無く FR-040 の「拒否」が「OS への転送」になっている | security |
| H-E | 判定結果の書き戻しが再検出後の descriptor を上書きし、消えた/停止したディストロが `autoModeSafe: true` で復活しうる | platform |
| H-F | 停止を観測した後も `verifiedCache` が無効化されず SC-005 の「発行行為 0 件」が破れる | platform |
| H-G | `NamespaceId` の内部構造に触れる実装が宣言された単一箇所の外に 2 件 (`validate.ts:70,74` の `slice(4)` / `folder-record.ts:130` のテンプレートリテラル) | platform |
| H-H | Principle VIII の `existing_violations: 0` が「合格」と見分けられない (Principle VI は `ok`/`violation`/`pending` の 3 状態で同じ問題を解いている) | architecture |
| H-I | AD-024 `:251` の 1 行訂正 + 項目数の不統一 | architecture |
| H-J | SC-003「手動実行した AD-015 §8 の判定結果と一致する」が一度も照合されていない | po |
| H-K | SC-011「UI 上でそのまま表示される」に証拠 0 件 (日本語フォルダ名を描く renderer テストが無い) | po |
| H-L | SC-014 (単一インスタンス / 更新時刻不変) に証拠が 1 件も無い | po |
| H-M | SC-008 が「全数検出」と宣言する US-4 AC-2 の「ネイティブモジュール」半分に fixture 0 件 | po |
| H-N | US-2 の UI 側 AC 14 本のうち自動テストが 3 本のみ。残りを逃がした quickstart が打ち切られている | po |
| H-O | FR-009 / US-5 AS-5 の「導入手順文書への導線」が実装に存在せず、繰り延べ先が spec のどこにも無い | po |
| H-P | SC-002「`wsl -l -v` と 1 対 1 で一致」「列挙不能を理由つきで提示」のどちらにも証拠が無い | po |
| H-Q | 同一の一時ファイル名へ無直列化で書き込むため同時 save がファイルを壊す (`folder-store.ts:29,156-169`) | database |
| H-R | ファイル全体の失敗を常に `skipped: 1` と報告し、UI が事実に反する件数を出す | database |
| H-S | Principle V の Automated 検証が実体として存在せず AD-024 の「正本」表と repo 状態が食い違う (check.mjs の principle タグに V が 0 件) | database |

**H-A / H-Q は同じ「直列化が無い」根に由来する別の面である** — H-A は in-flight 合流の不在 (プロセス起動回数と `sessions` 増加)、H-Q は同一一時ファイル名への競合書き込み (ファイル破損と `rename` の ENOENT)。あわせて `register` / `unregister` の lost update (platform H-001 の (c)) も同根。**修正は 1 つの直列化機構で 3 面ともに効く。**

---

## Medium 24 件 / Low 15 件

全文は各 reviewer の成果物を参照。

- `security-reviewer.round1.md` (M 4 / L 4)
- `architecture-reviewer.round1.md` (M 6 / L 3)
- `po-reviewer.round1.md` (M 5 / L 2)
- `platform-boundary-reviewer.round1.md` (M 3 / L 4)
- `database-reviewer.round1.md` (M 6 / L 3)

**Low の重複統合 1 件**: `.bak` の単調増加と削除経路 0 件 — platform-boundary L-004 + database L-002 を統合 (16 → 15)。

**cross-gate の相互参照 2 件** (code-gate iteration 2 の指摘に対する独立判定):

- `error-state.tsx` の手編集 (code-gate convention M-001 / High) — platform-boundary が独立判定し「**レイヤ規則と禁止 import は `GENERATED_FILES` ブロックで解除されていないため Principle I / VII の穴ではない**」と結論 (L-002)。「再生成で FR-047 対応の prop が消える」という懸念自体は妥当で convention の owner に残る
- `CSP_DECLARATION_EXEMPT_SUFFIXES` (code-gate convention C-002) — platform-boundary が「出荷物に漏れる経路が無いため境界侵食ではない」として Low に判定 (L-001)。実名化の推奨には同意

---

## Phase 6: code-gate finding との重複 suppress

**`suppressed_by_code_gate` は 0 件である。**

5 reviewer すべてが `.gate-verdict-code.json` と `code-gate.md` を読み、code-gate iteration 1 の
MUST_FIX 7 件で resolved になった `path:line` を再指摘しなかった。

唯一の境界事例は security H-D (`window.ts:47-50` / `:64`) で、MF-004 (`index.html` の静的 CSP 撤去 →
`protocol.ts:173` / `window.ts:76`) と**同一ファイル**だが **origin が異なる** (MF-004 は CSP 宣言箇所の移設、
H-D は `openExternal` の scheme 検証欠落)。skill の Phase 6 が「同一行に異種 origin の finding が
存在する場合は suppress しない」と定めるため、新規指摘として計上した。

## viewpoint coverage

| cat | 内容 | 結果 |
|---|---|---|
| A | 認可 / 認証 / RLS / secret | Critical:0 High:1 Medium:1 Low:1 (security) |
| B | 入力検証 / injection / XSS / 暗号 | Critical:0 High:1 Medium:3 Low:3 (security) |
| C | 業務不変条件 / Charter drift | Critical:0 High:2 Medium:1 (platform) + architecture |
| D | Constitution / ADR drift | **Critical:1** High:3 Medium:1 Low:1 (architecture + platform + database) |
| E | User Story / SC / AC / UX | Critical:0 High:8 Medium:5 Low:2 (po) |
| F | 命名 / module / lint hookup | **Critical:1** Low:2 (platform。命名は code-gate の convention 専任) |
| G | DB / 永続化 / index 相当 / a11y / perf | Critical:0 High:2 Medium:5 Low:3 (database)。a11y / ux は code-gate iteration 2 で実施済み |
| H | テスト / coverage / observability / regression | Critical:0 High:1 Medium:3 (po + database) |

**欠落カテゴリなし** (`viewpoint_coverage_check` の A-H を全件記入)。
`cascade_enforce` による降格は **0 件** — Critical 2 件はいずれも 0 件確認付きの同種事象探索を伴っている。

## 記録した仕様逸脱 1 点

**`a11y-reviewer` / `ux-reviewer` を Round 1 で再起動していない。**
`.specify/spec-gate/reviewers.yml` は両者を `gates: [code-gate, pr-gate]` で登録しているが、
code-gate iteration 2 で同じ `main...HEAD` 全域 (199 files) を敵対的にレビュー済みで、
その後 UI ファイルは 1 件も変わっていない (`03b9654` は Constitution frontmatter、
`17be49f` は gate 成果物のみ)。両者の findings は code-gate iteration 2 の成果物
(a11y: High 2 / Medium 9 / Low 6、ux: High 3 / Medium 5 / Low 4) を参照する。
**Round 2 では UI に修正が入る見込みなので再起動すること。**

## reviewer 選定の訂正 (code-gate iteration 2 の誤り)

Round 1 の起動時に、code-gate iteration 2 での **reviewer 選定漏れ 2 件**が判明した。
`.specify/spec-gate/reviewers.yml` (プロジェクト固有の registry) が正であり、
skill 本文の汎用パターン表ではない。

- **`database-reviewer`**: registry の `auto_invoke_patterns` に `src/main/infra/settings/**` /
  `src/main/infra/secrets/**` が含まれる (AD-024 #9 —「Principle V の検証対象は SQL のカラム型に限らない。
  R-1 の永続化は JSON であり、SQL パターンだけでは発火しない」)。diff に該当 4 ファイル。
  code-gate iteration 2 で `.sql` 0 件を根拠に非起動としたのは誤りだった。
  **本 round で起動し High 3 / Medium 6 / Low 3 を得た** — iteration 2 で落としていた指摘である
- **`platform-boundary-reviewer`**: registry は `gates: [design-gate, code-gate, pr-gate]` かつ
  patterns が多数一致する。skill 本文の reviewer 表に載っていないが registry 上は code-gate でも対象だった。
  **本 round で起動し Critical 1 を含む 13 件を得た**

`api-performance-reviewer` / `openapi-contract-reviewer` は registry 不在で silent skip。
`lint-agent` / `test-agent` / `convention-reviewer` は code-gate 専任のため非起動。

## 次のアクション

Critical 2 件は**いずれも実装の作り変えを伴わない**。

1. **C-001**: `check.mjs --json` + `run.mjs` のサンプル単位照合 + `wsl-args-array` の期待訂正
2. **C-002**: depcruise 1 ルール + `randomUUID` の注入 (1 行) + fixture 1 件 + 履行記録の ADR

**C-001 を先に直すこと。** C-002 の fixture 追加は C-001 の修正後でなければ発火確認にならない
(現状の照合では新しい fixture も構造的に常に真になる)。

Critical 解消後に `/cl-pr-gate` を再実行 (Round 2)。High 19 件のうち H-A / H-Q は
1 つの直列化機構で 3 面に効くため、Round 2 の前に併せて畳むと効率がよい。
