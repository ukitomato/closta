# Code Gate Iteration 2: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Spec**: `specs/001-runtime-folder-registration-runtime-detection/`
**Diff scope**: 199 files, +37,337 / -183 (`main...HEAD`)
**Tracks**: lint-agent, test-agent, convention-reviewer, a11y-reviewer, ux-reviewer

`database-reviewer` は migration / `.sql` が 0 件のため起動していない (scope 内 0 件を実測)。
`flutter-perf-reviewer` は registry 不在のため silent skip。
`security-reviewer` / `architecture-reviewer` / `po-reviewer` は **pr-gate 専任**のため起動していない。

## 仕様との差異 1 点 (Phase 0)

**`git diff HEAD` が空である。** iteration 1 の MUST_FIX 対応を 4 コミット
(`6c3f4aa` / `379f6a8` / `093c2c1` / `548b339`) として確定させたため、working tree はクリーンである。
skill の Phase 0 step 4 を字義どおり適用すると halt するが、gate の目的は実装のレビューなので
**scope を `main...HEAD`** に取った。iteration 1 と同じ扱いである。

なお iteration 1 で問題になった `touched-files.txt` の記載漏れは解消している —
`git diff --name-only main...HEAD` と**完全一致**する 199 件まで再生成した (`548b339`)。
したがって `diff_files ∩ touched_files` は 199 件であり、黙って外れるファイルは無い。

## severity 写像

skill が定めるのは `convention-reviewer の Critical/High → MUST_FIX / SHOULD_FIX` までで、
Medium / Low と stack 別 reviewer については定義が無い。本 iteration は次を適用した。

| reviewer severity | gate severity |
|---|---|
| Critical | MUST_FIX |
| High | SHOULD_FIX |
| Medium | SHOULD_FIX |
| Low | CONSIDER |
| lint `error` / test failure | MUST_FIX |
| lint `warning` | SHOULD_FIX |
| lint `info` | CONSIDER |

## Verdict

| Severity | Count | Where |
|---|---|---|
| MUST_FIX | **0** | — |
| SHOULD_FIX | 30 | a11y H-001/H-002 + M-001〜M-009 (11) / ux H-001〜H-003 + M-001〜M-005 (8) / convention H-001・M-001 + M-002〜M-007・C-001〜C-005 (11) |
| CONSIDER | 22 | a11y L-001〜L-006 (6) / ux L-001〜L-004 (4) / convention L-001〜L-007・C-004・C-006〜C-009 (12) |

**Status**: **PASS**

全 5 track の Critical は 0 件、lint error 0 件、test failure 0 件である。
したがって MUST_FIX は 0 件で、**Phase 5 の auto-fix loop は起動条件を満たさない**。

機械検証 (lint / typecheck / depcruise / check:constitution / test / test:rules) は
**6 track すべて exit 0 / violations 0 件**である。convention-reviewer が
`.eslintcache` を削除して独立に再実行した結果も同一だった。

**PASS は「指摘が無い」ことを意味しない。** SHOULD_FIX 30 件が残っており、
下記の 4 件は pr-gate の adversarial 検証で Critical に昇格しうる。
skill の判定規則 (`MUST_FIX == 0` ⇒ PASS) に従って昇格させたものである。

### gate 内で閉じた 1 件

**convention C-001** — `.specify/memory/constitution.md` の frontmatter が
`version: 1.2.1` / `last_amended: 2026-09-15` のままで、本文 `:768` の 1.2.2 / 2026-09-16 と
食い違っていた。**`093c2c1` の改定漏れ**であり、v1.2.2 の改定手続きが frontmatter に
届いていなかった。本 gate 内で frontmatter を 1.2.2 / 2026-09-16 に修正した。

同 iteration の a11y-reviewer が `:768` だけを見て MF-001 を解消認定していたため、
**2 人の reviewer が同じファイルを見て別の結論に達していた**。
convention-reviewer 側が正しい (改定手順は frontmatter を正本とする)。

## iteration 1 MUST_FIX 7 件の再検証

a11y-reviewer と ux-reviewer が独立に再検証した結果。

| ID | origin | 判定 | 根拠 |
|---|---|---|---|
| MF-001 | a11y | **解消** | Constitution v1.2.2 で根拠を「対象が無い」→「`isDisabled: true` で送信経路を閉じている」に訂正。AD-024 に `## 訂正:` 節。`ChatScreen.test.tsx` 2 ケースで固定。**事実訂正・根拠差し替え・回帰テストの 3 点が揃っている** |
| MF-002 | ux | **部分解消** | `ResolutionScreen.tsx:216-218` / `:238` の `.catch` は入った。ただし推奨アクション後半 (error boundary / `unhandledrejection`) が未実施で、**同型の欠落が `useFolders.ts` に 5 箇所残る** → ux H-001 / H-002 |
| MF-003 | test | **解消** | `ipc.ts:122-127` が `event.sender.id` を渡し、`browseDirectory(token, target, senderId)` で送信元を束縛 |
| MF-004 | self | **解消** | `index.html` から静的 CSP を撤去し、`protocol.ts:173` / `window.ts:76` の main 側応答ヘッダへ移設。`check:constitution` #10 が CSP を検査対象に持つ (ok) |
| MF-005 | ux | **解消 (副作用あり)** | `RuntimeListScreen.tsx:120-122` が `{runtime.id}` → `{runtime.distroName ?? 'Windows'}`。`host` / `wsl:<distro>` は画面から消えた。表示名の二重表示が残る → ux M-001 |
| MF-006 | a11y | **解消** | `index.html:7` `<html lang="ja">` / `:10` `<title>Closta</title>` |
| MF-007 | a11y / ux | **解消** | `ResolutionScreen.tsx:125-131` でボタンごと削除 (`onClick` 後付けではなく対話要素をやめる側を採用)。`ResolutionScreen.test.tsx:208-219` が AC の検証を置き換えており空洞化していない。`features/` 配下に `onClick` 無しの `<Button>` は 0 件 |

**MUST_FIX 由来の新規発生は 0 件。** ただし下の 2 件は「解消済み」とされた箇所の再検証で出たもので、
どちらも前 iteration の cascade 探索漏れにあたる。

## 特に注意すべき SHOULD_FIX 2 件

### ux H-001 — MF-002 と同型の永久ローディングが `useFolders.ts` に 5 箇所残る

`useFolders.ts` で `catch` を持つのは `load()` の `:82` だけである。`move` (`:128`) は
`loading: true` を立てた後に `await` しており、IPC が reject すると
`WorkspaceFoldersScreen.tsx:349-361` の `GenerationLoader` が**永久に出続ける** —
MF-002 で must-fix とされた形そのものである。`beginBrowse` (`:95`) の reject は
「押しても無反応」(MF-007 と同型)、`register` (`:151`) / `unregister` (`:174`) /
`pickHostFolder` (`:197`) は無通知。対して `useRuntimes.ts` は 3 経路すべてに catch を持つ。

### a11y H-002 — SF-004 は「解消」とコメントが宣言しているが解消していない

`WorkspaceFoldersScreen.tsx:349-351` の `aria-busy` 化が守るのは**ローディング中のフォーカスだけ**で、
移動完了時に `key={entry.path.value}` の全 `<li>` が差し替わるため `activeElement` は `<body>` に戻る。
移動先 (`:341`) も live region ではないため到達先が通知されない。
**コード内コメントが実態より強い解決を主張している**点が、次の iteration で見落とされる危険を持つ。

## 完了した track の内訳

### lint-agent (exit 0 / violations 0)

`docs/discovery.md` の `## Build / Test / Lint` を SSoT として pnpm 経由で実行。

| track | exit | violations | 実測 |
|---|---|---|---|
| lint | 0 | 0 | 106 files linted / errors 0 / warnings 0 |
| typecheck | 0 | 0 | `tsconfig.node.json` / `tsconfig.web.json` 両 project 出力なし |
| depcruise | 0 | 0 | no violations (118 modules, 416 dependencies) |
| check:constitution | 0 | 0 | 11 項目: ok 10 / 違反 0 / **検査対象なし 1** |
| test:rules | 0 | 0 | 違反サンプル 20 件、**期待表と全件一致 (20/20)** |

**violation ではないが verdict に残す事実**:

1. `check:constitution` #5「許可モジュール内にイメージ構築サブコマンドが無い」は
   **検査対象なし**。docker を名指せるモジュールが 0 件のため (R-1 の設計どおり)。
   スクリプト自身が「『検査対象なし』は合格ではない」と出力している
2. `test:rules` の期待表に `none` (機械検証で捕まらない経路) が 2 件あり、期待どおり一致した —
   `ui-path-concat` (塞ぐ feature: R-2) / `reuse-verified-other-distro` (塞ぐ feature: I-1)。
   **「全数検出」と読み替えてはならない**
3. `tests/rule-fixtures/**` は `eslint.config.mjs:137` で意図的に除外されている。
   違反サンプル置き場なので lint すれば必ず落ちる設計であり、この穴を埋めるのが `test:rules` である
4. `depcruise` の module 数は iteration 1 の 114 → **118**、dependency 数は 395 → **416** に増えた。
   `docs/discovery.md` の「R-1 時点の実測値 (2026-09-15)」表の更新を要するか要判断

### test-agent (exit 0 / failed 0)

- Test Files: **15 passed (15)**
- Tests: **264 passed (264)** — failed 0 / skipped 0 / todo 0
- `|node|` 12 files / 243 tests、`|renderer|` 3 files / 21 tests (うち `ChatScreen.test.tsx` 2)
- flaky の兆候なし
- **coverage: 取得不可**。`vitest.config.ts` に `coverage` block が無く、
  `@vitest/coverage-v8` / `-istanbul` が devDependencies にも `node_modules` にも無い。
  convention-reviewer の L-007 (coverage 未設定) は iteration 2 時点でも未解消

### a11y-reviewer (Critical 0 / High 2 / Medium 9 / Low 6)

全文は `a11y-reviewer.md`。iteration 1 の MUST_FIX 3 件 (MF-001 / MF-006 / MF-007) はすべて解消。

- High: H-001 フォーカスリングが約 1.5:1 (WCAG 1.4.11 / 2.4.7。`features/` の `<Button>` 15 件が
  単一の `cva` 経由) / H-002 ブラウズ移動時のフォーカス喪失 (SF-004 未解消)
- 新規違反の持ち込みは M-001 のみ — `lang="ja"` を宣言したことで `thread.aui.tsx` の
  英語文字列が WCAG 3.1.2 (Language of Parts) の対象として顕在化した。
  **MF-006 の修正を撤回すべき理由にはならない** (正味では改善)
- Round inheritance: resolved 5 / partially resolved 3 / unresolved 6 / new 5

### ux-reviewer (Critical 0 / High 3 / Medium 5 / Low 4)

全文は `ux-reviewer.md`。iteration 1 の MUST_FIX 3 件 (MF-002 / MF-005 / MF-007) は
指摘行そのものは解消 (MF-002 のみ部分解消)。

- High: H-001 `useFolders` の reject 受け皿 0 件 / H-002 error boundary・`unhandledrejection` が
  0 件のまま意図的な `throw` だけ増えた / H-003 未接続を日本語で告知した直後に
  `<h1>How can I help you today?</h1>` が主見出しとして出る
- `ChatScreen` の composer 封鎖は**方向として妥当**と判定 (偽の assistant 応答の除去、
  送信前の告知、`role="note"` の選択はいずれも適切)。ただし封鎖した画面に
  英語の chat UI が露出しており告知文と矛盾する (H-003)
- Round inheritance: resolved 7 / partially resolved 4 / unresolved 4 / new 7

### convention-reviewer (Critical 0 / High 2 / Medium 9 / Low 12)

全文は `convention-reviewer.md` (857 行)。lint 6 コマンドを `.eslintcache` 削除後に独立実行し、
すべて exit 0 / 指摘 0 件。lint 由来の finding は 0 件。

**iteration 1 の 15 件の消化**: 解消 **1 件** (M-003 — `src/domain/validation.ts` に
`hasControlCharacter` + 3 定数を集約し重複 0 件)。未解消 14 件、**うち悪化 4 件**
(M-001 / L-001 / L-004 / L-005) — いずれも iteration 1 が「次にこうなると効いてくる」と
書いた形が実際に起きたもの。

High 2 件:

1. **H-001 (継続)** — `agents-not-to-native` にネイティブモジュールの違反サンプルが
   依然 0 件。US-4 AC-2 の半分が未実証のまま
2. **M-001 を Medium → High に格上げ** — `6c3f4aa` が `GENERATED_FILES` / `.prettierignore`
   に載っている `error-state.tsx` を手で編集して `retryLabel` / `retryingLabel` prop を足した
   (iteration 1 の「`Retry` だけ英語」への対応)。`npx eslint --print-config` で当該ファイルの
   緩和 7 規則すべてが `0` (off) と確認済み。**再生成すると FR-047 対応の prop が消える**のに、
   再生成される前提で検査を外している。手書き混入は 1 → **2 件**。
   Constitution Principle VI の「除外はファイル単位の明示リストとし、ディレクトリ単位で
   除外してはならない」に真正面から当たる

新規 9 件のうち直近 4 コミット由来は 8 件。主なもの:

- **C-002** (`6c3f4aa`) — 新設の CSP 検査 (項目 10 (e)) の除外が
  `CSP_DECLARATION_EXEMPT_SUFFIXES = ['.test.ts','.test.tsx']` という**接尾辞パターン**。
  以後どこに置かれた `*.test.ts` も無条件に免除される。`allowlists.mjs` の他の許可リストは
  すべて実名である。※ `.html` の走査対象追加と (e) 自体は良い変更と評価されている
- **C-003** (`6c3f4aa`) — M-003 修正の残渣。`wsl-fs.ts:30` の `export { MAX_DIR_ENTRIES }`
  「互換のため」は参照 0 件。`validate.ts:34` が同じ定数に 2 つの import 経路を作っている
- **C-005** (`6c3f4aa`) — 新規 domain 型 `WslAvailability` が glossary に 0 件。
  canonical `Reachability` と語彙が競合 (Principle XIV)
- **C-007** — `tests/setup/renderer.ts` が「前後処理だけを持つ」docstring に反して
  3 つ目の責務 (`ResizeObserver` スタブ) を獲得した。実装とコメント自体は妥当と評価
- **C-008** — `ChatScreen.test.tsx:27,34` が上流の英語 accessible name `'Message input'` を
  唯一のセレクタに固定している (ux H-003 / a11y M-001 と同じ根を持つ)

**指定された新規ファイルの確認結果**: `ChatScreen.test.tsx` は命名 / 置き場所 / lint 分類
すべて既存と整合 (問題なしと明記、セレクタのみ C-008)。`src/domain/validation.ts` は
M-003 を正しく解消。`folder-service.test.ts` は命名 / 置き場所に問題なし。
`tests/setup/renderer.ts` の `ResizeObserver` スタブは実装もコメントも妥当
(`vi.stubGlobal` を避けた理由の明記を評価)、docstring との不一致のみ (C-007)。

## 次 iteration に向けた最小セット (convention-reviewer 推奨順)

1. **convention M-001**: `GENERATED_FILES` / `.prettierignore` をファイル単位リストに変える
   (または `error-state.tsx` の改変を自前ラッパへ切り出す)
2. ~~**convention C-001**: constitution frontmatter を 1.2.2 に直す~~ — **本 gate 内で完了**
3. **convention C-002**: `CSP_DECLARATION_EXEMPT_SUFFIXES` →
   `CSP_DECLARATION_EXEMPT_FILES = ['src/main/app/protocol.test.ts']`
4. **convention C-003 / C-004**: 参照 0 件の再 export 削除 + `wsl-fs.ts` の import 2 行入れ替え
5. **convention H-001 / M-007**: fixture を 4〜6 件足して `test:rules` を 20 → 25 件に
6. **ux H-001**: `useFolders` の 5 経路に catch を入れる (MF-002 と同型の残存)
7. **ux H-002**: error boundary 1 枚 + `unhandledrejection` 1 本
8. **a11y H-002**: ブラウズ移動後のフォーカス移送 + 到達先の live region 化 (SF-004 の実解消)
