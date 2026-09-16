# convention-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16T14:45:00Z
**Reviewer**: convention-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Gate**: code-gate **iteration 2**
**Round**: 2
**Diff scope**: `git diff main...HEAD` (199 files / `.code-gate-scope.txt`)。
iteration 1 からの増分は `7d00a51..HEAD` の 4 コミット (33 files / +2,291 / -190)

## 初回読了 viewpoint

**FR/SC (本 reviewer の観点に該当するもの)**

- FR-025 / FR-035 / FR-036 / FR-038 / FR-041 — 標準モジュール・`electron`・プロセス起動・
  プラットフォーム分岐・ネイティブモジュールの許可範囲 (lint hookup の対象そのもの)
- FR-033 — assistant-ui の design system / Element の採用範囲
- FR-040 — CSP の宣言箇所 (iteration 2 で検証項目 10 に (e) が加わった)
- FR-047 — UI 文言は日本語
- SC-008 — 違反サンプル群 (a) の全数検出。US-4 AC-1〜AC-11 が名指す経路は群の別を問わず全数検出
- SC-009 — 規則適合状態で lint / 型検査 / 依存グラフ / Principle 検証が違反 0
- SC-012 — README / LICENSE の体裁 (Principle XV Exceptions)
- SC-013 — 再起動で登録内容がすべて復元される (M-003 の重複定数が崩していた不変条件)
- SC-015 — WSL 不在 / 列挙失敗 / 0 台の区別 (iteration 2 で `WslAvailability` が入った)
- SC-017 — 群 (b) の検出 / 未検出の一覧と、未検出への feature ID 割り当て

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md` / `docs/domains/ui/charter.md` — 本 feature の domain
- AD-023 §1 / §3 / §5 / §7 / §8 — 5 レイヤ / インタフェースは `domain` / 依存規則を 2 ツールで強制
- AD-024 #7 / #8 / #12 / #14 / **#18** — Automated の正本を lint + グラフ検証へ / 表層文書の英語
  Exceptions / Principle VIII の Automated を R-1 でどこまで載せるか (iteration 2 で訂正された)
- AD-025 §「設定しただけでは効かない」(a)〜(e) / §6 (b) / §7 (CSP の緩和は 1 関数の dev 分岐のみ)
- Constitution **v1.2.2** Principle I / II / VI / VII / **VIII** / XIII / XIV / XV
- `docs/glossary.md` (31 語)、`docs/discovery.md` revision 3「Build / Test / Lint」

**viewpoint 集計**

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲
- B. 入力検証 / injection / 暗号: 該当なし: `security-reviewer` の Owner 範囲。
  新規 `src/domain/validation.ts` は**置き場所と重複解消**の観点だけを F に計上した
  (述語そのものの妥当性は security 側)
- C. 業務不変条件 / Charter drift: 該当なし: charter / glossary **文書側**の drift は
  `architecture-reviewer` の Owner 範囲。本 reviewer は「コード識別子が glossary の canonical 表記と
  食い違う / glossary に無い語をコードに入れた」側だけを F に計上した (M-005 / C-005)
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner 範囲。
  Constitution の **frontmatter と本文のバージョン不一致** (C-001) と AD-023 Consequences の
  ファイル名不一致 (L-001) だけを「名前が指すものが実体と違う」事実として F に計上した
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` の Owner 範囲
- F. 命名 / module 配置 / lint hookup: Critical:0 High:2 Medium:9 Low:9
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 本 PR に DB / HTTP API / OpenAPI が無く、
  a11y / UX は `a11y-reviewer` / `ux-reviewer` の Owner 範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:3
  (L-004 / L-007 / C-007)

## スコープ要約

iteration 2 で見たのは 3 つである。
(1) `docs/discovery.md` revision 3 が SSoT と定める 6 つの検証コマンドを HEAD に対して再実行する、
(2) iteration 1 の自分の finding 15 件 (H-001 / M-001〜M-007 / L-001〜L-007) の解消状況を 1 件ずつ確認する、
(3) 直近 4 コミット (`6c3f4aa` / `379f6a8` / `093c2c1` / `548b339`) が新たな命名 / module 配置 /
lint hookup の違反を持ち込んでいないかを見る。指定された新規ファイル 3 件と
`tests/setup/renderer.ts` の `ResizeObserver` スタブは個別に読んだ。

**結論を先に置く。** 6 コマンドはすべて exit 0 で違反 0 のまま、iteration 1 の 15 件のうち
**解消は 1 件 (M-003) だけ**である。残り 14 件は未解消で、そのうち 4 件 (M-001 / L-001 / L-004 / L-005) は
**iteration 1 が「次にこれが起きたら効いてくる」と書いた形が実際に起きて悪化した**。
新規 finding は 9 件で、うち 8 件は直近 4 コミットが持ち込んだものである。

**実行結果 (2026-09-16。`.eslintcache` を削除してから実行)**

| 検証 | iteration 2 実測 | iteration 1 実測 | 文書の記録値 |
|---|---|---|---|
| `pnpm lint` | 違反 **0** (exit 0) | 違反 0 | 違反 0 |
| `pnpm typecheck` | エラー **0** (exit 0) | エラー 0 | エラー 0 |
| `pnpm depcruise` | 違反 **0** (**118 modules / 416 dependencies**) | 0 (115 / 398) | 0 (114 / 395) |
| `pnpm check:constitution` | 違反 **0** (ok 10 / pending 1。**対象 104 ファイル**) | 0 (ok 10 / pending 1。100) | 0 (ok 10 / 検査対象なし 1) |
| `pnpm test` | **15 files / 264 passed** | 13 files / 245 passed | 11 files / 213 passed |
| `pnpm test:rules` | 期待表と全件一致 (**20 件のまま**) | 全件一致 (20 件) | 全件一致 |

**lint コマンド由来の finding は iteration 2 でも 0 件である。** 6 コマンドすべてが exit 0 で、
ESLint / dependency-cruiser / Principle 検証はいずれも 1 件も指摘を出さない。
以下の finding はすべて**検証が構造的に届いていない範囲**から出したものである。

<details>
<summary>lint / 検証コマンドの生 output (iteration 2)</summary>

```
$ rm -f .eslintcache && pnpm lint
$ eslint --cache .
(出力なし。exit 0)

$ pnpm typecheck
> tsc --noEmit -p tsconfig.node.json --composite false
> tsc --noEmit -p tsconfig.web.json --composite false
(出力なし。exit 0)

$ pnpm depcruise
✔ no dependency violations found (118 modules, 416 dependencies cruised)

$ pnpm check:constitution
Constitution 検証 — 対象 104 ファイル
[ok     ] #1 特権コマンド文字列の不在 (引数配列も捕捉)  (Principle VI)
[ok     ] #2 `wsl.exe` に渡す引数が許可リスト内  (Principle VI)
[ok     ] #3 `wsl.exe` を名指せるモジュールの許可リスト  (Principle VI)
            許可: src/main/infra/runtime/wsl-cli.ts
[ok     ] #4 docker CLI を名指せるモジュールの許可リスト  (Principle VI)
            許可: (なし。R-1 では docker を使わない)
[pending] #5 許可モジュール内にイメージ構築サブコマンドが無い  (Principle VI)
            docker を名指せるモジュールが 0 件なので検査対象が存在しない
[ok     ] #6 ディストロ内スクリプトが定義済みの内容と一致 (3 点検査)  (Principle VI)
[ok     ] #7 プロセス起動 API を使えるモジュールの許可リスト  (Principle VI)
            許可: src/main/infra/runtime/wsl-cli.ts, scripts/rules/run.mjs, scripts/build/package.mjs
[ok     ] #8 注記のないプラットフォーム分岐の不在 (等価 API / 構文変形を含む)  (Principle II)
            許可ディレクトリ: src/main/infra/runtime/
[ok     ] #9 OS へのプロトコル関連付け API の不在  (Principle VI)
[ok     ] #10 CSP が FR-040 の directive を満たし禁止形を含まない  (Principle FR-040)
[ok     ] #11 window.open / 遷移の拒否と origin 定数の単一性  (Principle FR-039 / FR-040)
項目 11 件: ok 10 / 違反 0 (指摘 0 件) / 検査対象なし 1

$ pnpm test
Test Files  15 passed (15)
     Tests  264 passed (264)

$ pnpm test:rules
期待表と一致: 20 件
機械検証で捕まらない経路: 2 件 (ui-path-concat / reuse-verified-other-distro)
```

</details>

## iteration 1 findings の継承 (要求事項 1)

| ID | iter1 | iteration 2 判定 | 根拠 (検証クエリ / 実測) |
|---|---|---|---|
| **H-001** ネイティブモジュール経路に違反サンプルが無い | High | **未解消** | `grep -rn "better-sqlite3\|node-pty\|keytar" tests/` → **0 件**。FIXTURES は 20 件のまま |
| **M-001** CLI 生成物向けの緩和が手書きを巻き込む | Medium | **未解消 + 悪化 → High に格上げ** | `6c3f4aa` が `GENERATED_FILES` 内の `error-state.tsx` を手で編集。手書き 1 → **2 件** |
| **M-002** `cn` が 2 実装同居 | Medium | **未解消** | `grep -rn "from \"cn\"" src/` → **6 件**。`package.json:37` に `"cn": "^0.3.0"` が残る |
| **M-003** 純粋関数と 3 定数が `app`/`infra` に重複 | Medium | **解消** | `src/domain/validation.ts` に集約。重複 **0 件**。ただし残渣 2 件 → **C-003** |
| **M-004** `domain` の公開 export 6 件が参照 0 | Medium | **未解消** | 6 件すべて宣言行以外の参照が **0 件**。`isKnownRuntimeId` は `descriptor.ts:89` → `:117` に動いただけ |
| **M-005** canonical `Cross-boundary` が割れる | Medium | **未解消** | 非 canonical **4 件**が同位置に残る (`resolution.ts:82,173,190` / `ResolutionScreen.tsx:63,146` / `labels.ts:50`) |
| **M-006** Node / pnpm の版 pin が無い | Medium | **未解消** | `.nvmrc` / `.node-version` / `.tool-versions` 不在、`grep -n "engines\|packageManager" package.json` → **0 件** |
| **M-007** 対象コードのある依存グラフ規則 4 件に fixture が無い | Medium | **未解消** | `grep -n "rules:" expected.mjs` → 15 行 / 名指し **5 規則のまま** |
| **L-001** plan.md / AD-023 の名指しと実体の食い違い | Low | **未解消 + 悪化** | 4 件そのまま。加えて `src/domain/validation.ts` が `domain` 直下の **2 つ目**になり plan.md:157-159 との差が広がった |
| **L-002** ファイル名規約 3 系統混在、SSoT なし | Low | **未解消 (悪化なし)** | 規約記述 **0 件**。新規 `ChatScreen.test.tsx` は PascalCase 系に従い逸脱は増えていない |
| **L-003** 未使用の runtime dependency | Low | **未解消** | `package.json:33` の `@electron-toolkit/preload`。`src/` からの import 0 件 |
| **L-004** 文書の記録値が HEAD と不一致 | Low | **未解消 + 悪化** | 記録 11/213・114/395 に対し実測 **15/264**・**118/416**。ズレが 2 → 3 世代 |
| **L-005** `Browse session` を裸の `session` で表す | Low | **未解消 + 悪化** | 新規 `folder-service.test.ts` が `openSession` を **10 箇所**追加 |
| **L-006** テスト専用モジュールを production から import できる | Low | **未解消** | `not-to-spec` は `[.](spec\|test)[.]` のみ。`__fixtures__` / `test-support` に一致する規則 **0 件** |
| **L-007** coverage の計測が無い | Low | **未解消** | `@vitest/coverage-*` が devDependencies に **0 件**、`vitest.config.ts` に `coverage` キー無し |

**解消 1 / 未解消 14 (うち悪化 4) / 新規 9。**

## Findings

### [High] ネイティブモジュール経路に違反サンプルが無く、規則の発火が未確認 (H-001) (scope: feature) — iteration 1 から未解消

- **Where**: `.dependency-cruiser.js:188` (`agents-not-to-native`) / `eslint.config.mjs:58-61`
  (`NATIVE_MODULES`) / `tests/rule-fixtures/expected.mjs` (FIXTURES 20 件)
- **Issue**: `better-sqlite3` / `node-pty` / `keytar` を `agents` / `domain` で禁じる規則が
  3 層に書かれているが、それを踏む違反サンプルが **1 件も無い**。
  `grep -rn "better-sqlite3\|node-pty\|keytar" tests/` は iteration 2 でも **0 件**。
  spec.md の US-4 AC-2 は「`agents` レイヤのファイル、When `electron` **やネイティブモジュール**に
  推移的に依存する、Then 止まる」であり、fixture は `electron` 側だけを覆っている。
- **同種事象探索**: 上記 grep → **0 件**。`expected.mjs` の `rules:` は 15 行 / 5 規則で iteration 1 から変化なし。
- **Why**: spec.md:490-495 (SC-008) は「US-4 の Acceptance Scenario が『止まる』と明記する経路は、
  群 (a) / (b) の別を問わず**すべて全数検出される**」「**該当する AC を 3 つだけ列挙する形にしない**」と
  明記している。AC-2 の半分が未実証のまま iteration 2 を迎えた。
  3 モジュールは未導入なので `not-to-unresolvable` (`.dependency-cruiser.js:123`) が先に発火し、
  `agents-not-to-native` が本当に一致するかは依然分からない。
  AD-025 (d) の「`^electron($|/)` と書いたルールは 1 件も一致せず黙って死んでいた」と同じ失敗モードが、
  I-1 で `better-sqlite3` が入る瞬間まで検出できない。
- **Suggested fix**: `tests/rule-fixtures/a-direct/` に `agents-native-import.ts.fixture` と
  `domain-native-import.ts.fixture` を追加し、`expected.mjs` に
  `detectors: ['eslint','depcruise']` / `rules: ['no-restricted-imports','agents-not-to-native']` を書く。
  未導入モジュールなので `not-to-unresolvable` が同時に発火する — 期待規則に両方を並べるか、
  fixture 用の型スタブを `tests/rule-fixtures/` 内に置いて解決させる。
  どちらも採れない場合は `expected.mjs` の `UNDETECTED_NOTES` に
  「ネイティブモジュール経路は導入まで発火未確認」を明記し、SC-017 と同じ扱いで塞ぐ feature ID (I-1) を
  割り当てる — **AC-2 を覆ったことにしない。**
- **根拠**: spec.md:490-495 (SC-008) / spec.md US-4 AC-2 / AD-025 (d) /
  Constitution Principle VII Verification / FR-041
- **scope 根拠**: `tests/rule-fixtures/` は本 PR の touched files

### [High] CLI 生成物向けの lint / 整形緩和が、実際に手書きコードを飲み込んだ (M-001) (scope: feature) — iteration 1 は Medium。**追加事実あり**

- **追加事実 (格上げの根拠)**: iteration 1 は「`src/renderer/src/hooks/` は手書きの共有 hook の自然な置き場であり、
  **次にここへ手書きを置いた時点で同じ緩和が黙って適用される**」と書いた。
  **その「次」が同一 feature 内で起きた。** `6c3f4aa` が
  `src/renderer/src/components/assistant-ui/elements/error-state.tsx` を手で編集し、
  `retryLabel` / `retryingLabel` prop を足して `Retry` / `Retrying` の日本語化経路を作った
  (iteration 1 code-gate の CONSIDER「`ErrorState` の `Retry` だけ英語」への対応)。
  推測ではなく diff で観察できる事実である。
- **Where**: `eslint.config.mjs:73-77` (`GENERATED_FILES`) / `:403-413` (7 規則 off) /
  `.prettierignore:11-13`。手書きが入った実体は
  `src/renderer/src/components/assistant-ui/elements/error-state.tsx:16-29,37-38,57,88` と
  `src/renderer/src/lib/utils.ts:5-11`
- **Issue**: `GENERATED_FILES` は `src/renderer/src/{components,hooks,lib}/**/*.{ts,tsx}` を
  **ディレクトリ単位**で対象にして `prettier/prettier` /
  `@typescript-eslint/explicit-function-return-type` / `react/prop-types` / `react-hooks/refs` /
  `react-hooks/exhaustive-deps` / `react-refresh/only-export-components` / `no-empty` を off にする。
  `npx eslint --print-config src/renderer/src/components/assistant-ui/elements/error-state.tsx` で
  確認したところ、**7 規則すべてが `0` (off)** で計算される。
  同ブロックのコメントは「`shadcn` / `assistant-ui add` が生成したファイル。**手で書いたコードではない。**」と
  断定しているが、この 2 ファイルについては**成立しない**。
  実際 `error-state.tsx:37-38` は `retryLabel = "Retry"` と二重引用符 + セミコロンの上流体裁のままで、
  本プロジェクトの `.prettierrc.yaml` (`singleQuote: true` / `semi: false`) に反するが検査されない。
  `ErrorState` にも戻り型注釈が無いが (`}: ErrorStateProps) {`)、
  `explicit-function-return-type` が off なので通る。
- **同種事象探索**: `grep -rl "する\|ため\|して\|こと" src/renderer/src/{components,hooks,lib}` →
  **2 件** (`components/assistant-ui/elements/error-state.tsx` / `lib/utils.ts`)。
  iteration 1 は 1 件だった。日本語の散文を持つファイルは上流 registry には存在しないので、
  この 2 件が Closta 側の手書き / 改変である
  (`file-tree.tsx` / `range.ts` / `image.tsx` / `thread.aui.tsx` は `−` `…` `●` が
  CJK 範囲に入るための偽陽性で、除外済み)。
- **Why**: 除外の根拠は「上流を再生成すると上書きされるので体裁のルールを掛けない」である。
  `error-state.tsx` は**再生成されると日本語ラベル用の prop が消える**ファイルになったので、
  この根拠が逆向きに効く — 上書きされて困るのに、上書きされる前提で検査を外している。
  逸脱を記録しているのは**ファイル内のコメントだけ**で、「改変済み生成物」の一覧は
  リポジトリのどこにも無い (`docs/` / `plan.md` / `tasks.md` に記述 0 件)。
  Constitution Principle VI Verification は「**除外はファイル単位の明示リスト**とし、ディレクトリ単位で
  除外してはならない — そこに後から実行可能コードが増えたときに検証が構造的に届かなくなる」
  (constitution.md:364-367) と定め、Principle XIII も `theme_baseline_exclusions` で同じ方針を採る。
  ここだけがディレクトリ単位である。
- **Suggested fix**: `GENERATED_FILES` と `.prettierignore:11-13` を**ファイル単位の明示リスト**に変える。
  最小の修正は 2 ファイル (`error-state.tsx` / `lib/utils.ts`) を緩和集合から外して通常の規則下に戻すこと
  (`lib/utils.ts` は既に規約に適合。`error-state.tsx` は prettier が引用符とセミコロンを直す)。
  再生成との衝突を避けたいなら、`error-state.tsx` の改変を `src/renderer/src/components/closta/` 等の
  **自前ラッパ**に切り出し、生成物側を無改変に戻す方が筋が通る (改変済み生成物 0 件を保てる)。
  いずれの場合も「改変済み生成物」の一覧を `plan.md` か ADR に 1 箇所置く。
- **根拠**: Constitution Principle VI Verification (constitution.md:362-368) / Principle XIII
  `theme_baseline_exclusions` / plan.md:313-316 (SH-015 の除外方針) / `.prettierrc.yaml` / FR-047
- **scope 根拠**: `eslint.config.mjs` / `.prettierignore` / `error-state.tsx` は本 PR の touched files

### [Medium] Constitution の frontmatter が v1.2.1 のまま、本文だけ v1.2.2 になっている (C-001) (scope: feature) — **新規 (`093c2c1`)**

- **Where**: `.specify/memory/constitution.md:2-5` (`version: 1.2.1` / `last_amended: 2026-09-15`) と
  `:768` (`**Version**: 1.2.2 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-09-16`)
- **Issue**: `093c2c1` は Sync Impact Report (`:10-27`)、Principle VIII の `amended` 行 (`:424`)、
  Amendment trail (`:756`)、本文末尾の Version 行 (`:768`) を v1.2.2 / 2026-09-16 に更新したが、
  **frontmatter の `version:` と `last_amended:` を更新していない**。
  `git diff 379f6a8..093c2c1 -- .specify/memory/constitution.md` の変更行に
  `version: 1.2.1` は含まれない。1 ファイル内に「1.2.1」と「1.2.2」、
  「2026-09-15」と「2026-09-16」が同時に立っている。
- **同種事象探索**: `grep -rn "^version:" --include=*.md docs/ .specify/ specs/` → **1 件**
  (`.specify/memory/constitution.md:3`)。frontmatter で version を持つ文書は本ファイルだけなので cascade なし。
  `docs/decisions/0024-constitution-verification-paths.md:236` は本文側 (v1.2.2) に合わせている。
- **Why**: Constitution 自身の「改定手順」(`:153`) は手順 3 として「**version を SemVer で上げる**」を
  要求している。frontmatter は最初に読まれる位置であり、現に同 iteration の
  `a11y-reviewer.md:43` は `:768` の "Version 1.2.2" を根拠に解消を認定して frontmatter を見ていない。
  **次の改定が 1.2.1 を起点に PATCH を刻むと 1.2.2 が欠番になる。**
  `status: active` / version を読む機械経路は現時点で存在しない
  (`grep -rn "constitution" .claude/skills/spec-gate/scripts/*.sh | grep -iE "version|frontmatter|status"` → 0 件)
  ため実害は「読み手が版を誤る」に留まる。Critical にはしない。
- **Suggested fix**: `:3-5` を `version: 1.2.2` / `last_amended: 2026-09-16` に直す。
  再発防止には `scripts/constitution/check.mjs` に
  「frontmatter の `version` と本文末尾の `**Version**:`、Amendment trail の最終行が一致すること」を
  1 項目足す — 3 箇所への転記は必ず腐る (L-004 と同じ構造)。
- **根拠**: `.specify/memory/constitution.md:147-155` (改定手順 3) / `:2-5` / `:768` / AD-024 #18 / Principle XIV
- **scope 根拠**: `.specify/memory/constitution.md` は本 PR の touched files (`.code-gate-scope.txt`)

### [Medium] 新しい CSP 検査の除外が接尾辞パターンで、以後の全テストファイルが構造的に免除される (C-002) (scope: feature) — **新規 (`6c3f4aa`)**

- **Where**: `scripts/constitution/allowlists.mjs:316-326`
  (`CSP_DECLARATION_EXEMPT_SUFFIXES = ['.test.ts', '.test.tsx']`) /
  `scripts/constitution/check.mjs:455-478` (検証項目 10 の (e))
- **Issue**: `6c3f4aa` は項目 10 に (e)「`CSP_FILES` 以外に CSP 宣言が無いこと」を足した。
  `.html` を `SCAN_EXTENSIONS` に加えた修正 (`allowlists.mjs:37-44`) と合わせて、
  scaffold の `index.html` が `unsafe-inline` を宣言していた穴を塞ぐ**良い追加**である。
  問題は除外の書き方で、判定が `src.file.endsWith(suffix)` のため
  **リポジトリのどこに置かれた `*.test.ts` / `*.test.tsx` でも無条件に (e) から外れる**。
  `CSP_FILES` (`:304`) と `SELF_DEFINITION_FILES` が実名リストなのに、この 1 つだけがパターンである。
- **同種事象探索**: `allowlists.mjs` の許可 / 除外リストのうちパターン一致で判定するものは **1 件**
  (`CSP_DECLARATION_EXEMPT_SUFFIXES`)。`ALLOWED_ORIGINS_FILE` / `CSP_FILES` / `WSL_CLI_FILES` /
  `SPAWN_ALLOWED` はいずれも実名 (`PLATFORM_BRANCH_DIRS` はディレクトリ実名で、
  Principle II が明示的にその形を指定している)。同種の範囲過大な除外は
  `eslint.config.mjs:73-77` の `GENERATED_FILES` にもう 1 件ある (M-001)。
- **Why**: Constitution Principle VI Verification は「**除外はファイル単位の明示リスト**とし、
  ディレクトリ単位で除外してはならない — そこに後から実行可能コードが増えたときに検証が構造的に届かなくなる」
  (constitution.md:364-367) と定める。接尾辞パターンは対象集合が**将来のファイルを含んで無限に開いている**。
  現時点の該当は `src/main/app/protocol.test.ts` 1 件だけなので実害はない。
  効いてくるのは R-2 以降で、`*.test.ts` に CSP 文字列をコピーして「テストのために」緩和形を書いた瞬間であり、
  検査は黙って 0 件を返す。AD-025 §7 が定めた「緩和は CSP を組み立てる 1 関数の dev 分岐にのみ現れる」は
  **宣言箇所が 1 つであること**を前提にしており、(e) はその前提を守るための検査そのものである。
- **Suggested fix**: `CSP_DECLARATION_EXEMPT_FILES = ['src/main/app/protocol.test.ts']` のように
  ファイル単位の実名にする (`allowlists.mjs` は「追加には ADR を要する」正本なので、
  増やすたびに判断が記録される)。併せて `tests/rule-fixtures/` に群 (a) の fixture を 1 件足し、
  「許可外ファイルに `default-src` を書くと (e) が発火する」ことを `pnpm test:rules` で確認する —
  今の (e) は書かれているだけで発火が未確認である (M-007 と同じ系統)。
- **根拠**: Constitution Principle VI Verification (constitution.md:362-368) /
  `scripts/constitution/allowlists.mjs:303-326` / AD-025 §7 / FR-040
- **scope 根拠**: `scripts/constitution/allowlists.mjs` は本 PR の touched files

### [Medium] M-003 の修正が「互換のため」の再 export を 2 つ残し、片方は参照 0 件である (C-003) (scope: feature) — **新規 (`6c3f4aa`)**

- **Where**: `src/main/infra/fs/wsl-fs.ts:30` (`export { MAX_DIR_ENTRIES }`) /
  `src/main/app/validate.ts:34` (`export { MAX_DISPLAY_NAME_LENGTH, MAX_PATH_VALUE_LENGTH } from '@domain/validation'`)
- **Issue**: M-003 の修正は正しい方向で、定数と `hasControlCharacter` は
  `src/domain/validation.ts` に 1 箇所へ集約された (重複 0 件)。
  ただし移動元に**再 export が 2 つ残っている**。
  `wsl-fs.ts:30` は「定義は `domain` に 1 つだけ置く。**互換のため再 export する**」と書かれているが、
  `MAX_DIR_ENTRIES` を `wsl-fs` から import している箇所はリポジトリ内に **0 件**である。
  `validate.ts:34` の 2 定数は `src/main/app/validate.test.ts:19-20` が唯一の利用者で、
  同じ定数に `@domain/validation` と `./validate` の **2 つの import 経路**が同時に立っている。
- **同種事象探索**: `grep -rn "hasControlCharacter\|MAX_DISPLAY_NAME_LENGTH\|MAX_PATH_VALUE_LENGTH\|MAX_DIR_ENTRIES" src/ scripts/ tests/`
  → 定義 4 / 再 export **2** / うち参照 0 件の再 export **1** (`wsl-fs.ts:30`)。
  これは iteration 1 の M-004 (参照 0 件の公開 export 6 件) と同じ系統で、
  **M-003 を直す過程で同じ種類の負債が 1 件増えた**。
  dead export を見る検出器は依然として存在しない (`knip` / `ts-prune` 未導入、
  `no-orphans` はモジュール単位かつ `severity: 'warn'`、`noUnusedLocals` は `export` された識別子を見ない)。
- **Why**: 「互換のため」は**外部利用者がいるときの理由**である。ここは単一パッケージで全参照を grep できる。
  互換対象が存在しない再 export は、次の実装者に「`wsl-fs` から取ってよい」という誤った選択肢を見せるだけになる。
  `validate.ts:34` はテストだけが再 export 経路を使っている状態で、
  「テストのために公開面を広げた」形が M-004 と同じ読み違えを招く。
- **Suggested fix**: `wsl-fs.ts:30` の `export { MAX_DIR_ENTRIES }` を削除する (import は使用のため残す)。
  `validate.ts:34` の再 export を削除し、`validate.test.ts:19-20` を `@domain/validation` からの
  直接 import に切り替える。併せて M-004 の推奨どおり `knip` を入れるか
  `.dependency-cruiser.js:84` の `no-orphans` を `error` に上げる — この種類の残渣は毎回出る。
- **根拠**: AD-023 §1 / §3 / iteration 1 M-004 / `src/domain/validation.ts:8-23`
- **scope 根拠**: 3 ファイルすべて本 PR の touched files

### [Medium] 新しい domain 型 `WslAvailability` が glossary に無く、canonical `Reachability` と語彙が競合する (C-005) (scope: feature) — **新規 (`6c3f4aa`)**

- **Where**: `src/domain/runtime/descriptor.ts:83-99`
  (`export type WslAvailability = 'available' | 'not-installed' | 'enumeration-failed'`) /
  `:105-113` (`RuntimeEnumeration.wslAvailability`) / `src/domain/runtime/dto.ts:85-87`
  (`RuntimeListDTO.wslAvailability`) /
  `src/renderer/src/features/runtime-list/labels.ts:59-70` (`WSL_AVAILABILITY_LABELS`)
- **Issue**: `6c3f4aa` が 3 値の domain 型 `WslAvailability` を新設し、DTO と renderer の訳出表まで通した。
  `grep -n "Availability\|利用可否\|availability" docs/glossary.md` → **0 件**。
  glossary には既に canonical `Reachability` (`docs/glossary.md:197-206`。
  `reachable` / `unreachable` / `blocked`、日本語表記「到達可能性」) がある。
- **同種事象探索**: `git diff 7d00a51..HEAD -- src/domain/` で新規に導入された domain の公開型は
  `WslAvailability` の **1 件** (他は既存型へのフィールド追加と `src/domain/validation.ts` の
  関数 1 / 定数 3)。glossary 未登録は 1 / 1。
- **Why**: Principle XIV は「新規用語は glossary 追記 + reviewer 確認後に code 投入」と定める。
  ここが問題になるのは語彙が近いためである — `available` と `reachable`、
  「利用可否」と「到達可能性」は日本語文書上ほぼ同義に読め、
  `Reachability` の Counterexamples が「`blocked` を `unreachable` と混ぜない。前者は
  『今は届かないが解消手順がある』」と区別を強調しているのと同じ種類の混同が起きる。
  実際 `WslAvailability` の `enumeration-failed` は「一時的な失敗かもしれない」= `blocked` に近い意味論を持つ。
  glossary に行が無いまま I-1 / X-4 が別の 3 値状態を足すと、
  どちらの語彙体系に載せるかを決める根拠が残らない。
- **Suggested fix**: `docs/glossary.md` の Canonical Terms に `WslAvailability` を 1 項目足す —
  Definition (ホスト全体の WSL 利用可否を表す 3 値)、日本語表記、Domain (`runtime`)、
  **Counterexamples に「`Reachability` と混ぜない。あちらはランタイム×フォルダの組に対する到達性、
  こちらはホストに WSL があるか」** を明記する。
  `descriptor.ts:83-99` の docstring が既に `enumerationIssues` との対比でこの区別を書いているので、文面は流用できる。
- **根拠**: Constitution Principle XIV / `docs/glossary.md:197-206` /
  `src/domain/runtime/descriptor.ts:83-99` / SC-015 / FR-012
- **scope 根拠**: `docs/glossary.md` / `src/domain/runtime/descriptor.ts` は本 PR の touched files

### [Medium] `cn` が 2 実装同居し、`components.json` の `utils` alias と食い違う (M-002) (scope: feature) — iteration 1 から未解消

- **Where**: `components.json:16` (`"utils": "@/lib/utils"`) / `src/renderer/src/lib/utils.ts:9` /
  `src/renderer/src/components/ui/{avatar,button,dialog,skeleton,textarea,tooltip}.tsx` /
  `package.json:37` (`"cn": "^0.3.0"` が **runtime dependency**)
- **Issue**: `ui/*` primitive 6 件は npm パッケージ `cn` を裸の specifier で import し、
  assistant-ui element 群と `features/` の 4 画面は `@/lib/utils` (`clsx` + `tailwind-merge`) を使う。
  iteration 2 でも `grep -rn "from \"cn\"" src/` → **6 件**、`grep -rln "@/lib/utils" src/` → 19 件で不変。
- **同種事象探索**: 6 / 19。`cn` を禁止する記述は `no-restricted-imports` / `boundaries/dependencies` /
  `.dependency-cruiser.js` のいずれにも **0 件** (`boundaries` の policy (1) が外部パッケージを一律許可し、
  `no-non-package-json` は `package.json` にある以上通る)。**lint 3 層すべてがこの食い違いを見ない。**
- **Why**: `cn` はコンパイル済みテーブルで class を畳む実装で、
  `clsx` + `tailwind-merge` とは競合解決の設定が別物である。
  primitive に `className` を渡して上書きする経路は iteration 2 で**増えた** —
  `WorkspaceFoldersScreen.tsx` が +226 行、`ResolutionScreen.tsx` が +93 行、
  `RuntimeListScreen.tsx` が +50 行の改修を受け、いずれも primitive に `className` を渡している。
  畳み方の食い違いが露出する面が広がった。
  加えて `cn` は精度を出すため `cn build` (`cn-tables.mjs` 生成) を前提とするが、scripts にその段が無い。
- **Suggested fix**: どちらかに寄せる。(a) `components.json` の宣言どおりに寄せる —
  `ui/*` 6 ファイルの import を `@/lib/utils` に直し、`package.json` から `cn` を外す。
  生成物を手で直すことになるので `aliases.utils` が `add` 時に効かない原因を `docs/decisions/` に 1 件記録する。
  (b) `cn` に寄せる — `lib/utils.ts` を廃し 19 ファイルを移し、`clsx` / `tailwind-merge` を外し、
  `cn build` を scripts と CI に足す。**いずれにせよ「2 実装同居」を残さない。**
- **根拠**: Constitution Principle XIII / `components.json:16` / AD-025 §6 (b)
- **scope 根拠**: `components.json` / `package.json` / `src/renderer/src/components/ui/` は本 PR の touched files

### [Medium] `domain` の公開 export 6 件が呼び出し 0 件・テスト 0 件のまま (M-004) (scope: feature) — iteration 1 から未解消

- **Where**: `src/domain/runtime/path-api.ts:232` (`identityHost`) /
  `src/domain/runtime/path-types.ts:151,156` (`PathParts` / `pathParts`) /
  `src/domain/runtime/namespace.ts:96` (`isSameNamespace`) /
  `src/domain/workspace/registry.ts:39` (`foldersAtLocation`) /
  `src/domain/runtime/descriptor.ts:65` (`sameRuntime`) / `:117` (`isKnownRuntimeId`)
- **Issue**: 6 件すべて、**宣言行以外にリポジトリ内の参照が 1 件も無い**状態が続く。
  `isKnownRuntimeId` は `6c3f4aa` で `descriptor.ts:89` → `:117` に動いただけで参照 0 件のまま。
  `specs/.../contracts/` / `data-model.md` / `docs/` にも名前が出てこない。
- **同種事象探索**: 7 識別子 (`PathParts` は型と関数で 2 行) に対する
  `grep -rn "\b<name>\b" src/ scripts/ tests/ specs/001-.../contracts/` は宣言行のみを返す → **6 件**。
  `pathParts()` が担うはずの「brand を落として `{namespace, value}` にする」組み立ては、
  iteration 2 でも `src/main/app/folder-service.ts` / `src/main/infra/settings/folder-record.ts:147` /
  `src/main/app/composition-root.ts:119` で手で inline されたままである。
- **Why**: docstring が利用者を名指しているのに存在しない。
  `foldersAtLocation` は「一覧の所在別表示と第 0 段の判定が使う」、
  `isKnownRuntimeId` は「未信頼入力の検証に使う」と書くが、実際に未信頼入力を検証しているのは
  `src/main/app/validate.ts` の `findRuntime` である。
  次に検証を足す実装者がどちらを使うべきか読み取れない。
  6 件はユニットテストも無いので AD-023 Consequences「`domain` のテストはモックがゼロになる」の利点も得ていない。
  **dead export を見る検出器が toolchain に 1 つも無い** (C-003 と同じ)。
- **Suggested fix**: (a) `pathParts()` を上記 inline 箇所の置き換えに使う、
  (b) `isKnownRuntimeId` を `validate.ts` の `findRuntime` に統合して 1 つにする、
  (c) 残る `identityHost` / `isSameNamespace` / `foldersAtLocation` / `sameRuntime` を削除する
  (X-1 / R-2 で必要になった時点で書く)。併せて `knip` を入れるか `no-orphans` を `error` に上げる。
- **根拠**: AD-023 §1 / §4 / Consequences / plan.md:300-303
- **scope 根拠**: すべて本 PR の touched files

### [Medium] canonical `Cross-boundary` がコード内で 2 表記に割れたまま (M-005) (scope: feature) — iteration 1 から未解消

- **Where**: canonical 側 `src/domain/workspace/folder.ts:24` (`CrossBoundaryStep`) /
  `src/domain/workspace/dto.ts:60` (`CrossBoundaryRecommendation`)。
  非 canonical 側 `src/domain/workspace/resolution.ts:82,173,190` (`crossRecommendation`) /
  `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:63,146` (`CrossRecommendation`) /
  `src/renderer/src/features/workspace-folders/labels.ts:50` (`CROSS_STEP_LABELS`。
  型は `Record<CrossBoundaryStep, string>` で canonical、定数名だけ非 canonical)
- **Issue**: `docs/glossary.md:83-90` は canonical を `Cross-boundary` (日本語「越境」) と定めるが、
  `Boundary` が落ちた表記が **4 箇所**残る。
  `grep -rn "CrossBoundary\|crossRecommendation\|CrossRecommendation\|CROSS_STEP_LABELS" src/` →
  16 件 (canonical 12 / 非 canonical 4)。
- **Why**: `Cross` 単独は「交差」「跨る」の一般語で、`Boundary`
  (`src/domain/workspace/dto.ts` の `'native' | 'cross' | 'unknown'`) という別の型名も同居するため、
  `CrossRecommendation` が「`Boundary` に関する推奨」なのか「`cross` 値のときの推奨」なのかが名前から決まらない。
  `ResolutionScreen.tsx` は iteration 2 で +93 行の改修を受け、`CrossRecommendation` の使用位置が
  `:125` → `:146` に動いた — **表記が割れたまま触られている。**
  I-1 / X-4 が同じ判定表を拡張する (plan.md:245-246)。
- **Suggested fix**: `crossRecommendation` → `crossBoundaryRecommendation`、
  `CrossRecommendation` → `CrossBoundaryRecommendationCard` (型名と衝突するため)、
  `CROSS_STEP_LABELS` → `CROSS_BOUNDARY_STEP_LABELS`。
  `docs/glossary.md` の "Detected synonyms (要統一)" に `Cross-boundary` の行を足し
  「`Cross` 単独表記は避ける」を明記する。
- **根拠**: Constitution Principle XIV / `docs/glossary.md:83-90` / glossary.md:302-310
- **scope 根拠**: 3 ファイルすべて本 PR の touched files

### [Medium] Node / pnpm のバージョン pin が repo に無い (M-006) (scope: feature) — iteration 1 から未解消

- **Where**: `.nvmrc` / `.node-version` / `.tool-versions` が**いずれも不在**。
  `package.json` に `engines` も `packageManager` も無い
  (`grep -n "engines\|packageManager" package.json` → **0 件**)。
  版を名指すのは `.github/workflows/verify.yml:38,40` (Node 24 / 26) と `:51` (pnpm 12) の 3 件のみ。
- **Issue**: `verify.yml:50-51` は「`packageManager` フィールドを置いていないので明示する」と
  **自認したうえで** `pnpm/action-setup@v6` に `version: 12` をハードコードしている。
- **Why**: `docs/discovery.md:435-441` が本項目を「**R-1 (プロジェクト初期化を兼ねる) で整備する**」
  「downstream: **convention-reviewer**、implementer (R-1 の前提整備)」と名指しで残している。
  R-1 は iteration 2 でも未整備である。
  AD-013 は Electron 同梱 Node とホスト Node の `NODE_MODULE_VERSION` 差を重大な設計論点として扱い、
  `pnpm install --frozen-lockfile` は lockfile の一致しか見ないのでホストの Node / pnpm が違っても通る。
  CI だけが正しい版を使い、手元の `postinstall` (`electron-builder install-app-deps`) は
  ホストの版で native を焼く。
- **Suggested fix**: `package.json` に `packageManager` (`pnpm@12.4.1`) と `engines.node` (`>=24 <27`) を足し、
  `.node-version` に `24` を置く。`verify.yml:51` の `version: 12` は `packageManager` 由来に切り替えられるので、
  版の SSoT を `package.json` に一本化できる。
- **根拠**: `docs/discovery.md:435-441` / AD-013 / Constitution Principle VII Why
- **scope 根拠**: `package.json` / `verify.yml` は本 PR の touched files

### [Medium] 対象コードのある依存グラフ規則 4 件に違反サンプルが無い (M-007) (scope: feature) — iteration 1 から未解消

- **Where**: `.dependency-cruiser.js:215` (`domain-not-to-electron`) / `:231`
  (`electron-only-from-app-and-secrets`) / `:249` (`ui-not-to-app`) / `:256` (`app-not-to-ui`)。
  期待表は `tests/rule-fixtures/expected.mjs`
- **Issue**: 本プロジェクト固有の依存グラフ規則 10 件のうち `expected.mjs` が `rules:` で名指すのは
  **5 件のまま** (`no-circular` / `agents-not-to-electron` / `domain-not-to-io` /
  `path-module-only-from-path-api` / `ui-not-to-core`)。
  未名指しで**かつ現時点で対象コードが存在する**のが上記 4 件である
  (`agents-not-to-native` は H-001、`agents-not-to-infra` は `src/agents/` が `.gitkeep` のみで対象なし)。
  iteration 2 で新設された検証項目 10 の (e) も fixture 無しなので、未発火確認の規則は実質 5 件になった。
- **同種事象探索**: `grep -n "rules:" tests/rule-fixtures/expected.mjs` → 15 行 / 5 規則。
  `pnpm test:rules` の展開件数は **20 件で iteration 1 から増えていない**。
- **Why**: `expected.mjs:1-27` 自身が「**ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する**」と
  書き、AD-025 が「書いてあるのに評価されないルールが実測で 5 件」と記録している。
  この基準に照らすと上記 4 件は未強制である。`app↮ui` は AD-023 §7 の明示的な不変条件であり、
  R-2 以降 renderer と main の往復が増える面でもある。
- **Suggested fix**: 群 (a) の fixture を 4 件足す —
  `src/renderer/src/__rulecheck__/ui-imports-app.ts` / `src/main/app/__rulecheck__/app-imports-ui.ts` /
  `src/domain/runtime/__rulecheck__/domain-electron.ts` /
  `src/main/infra/fs/__rulecheck__/electron-outside-allowlist.ts`。
  `expected.mjs` に `rules` を書き、20 件を 24 件 (C-002 の (e) を含めれば 25 件) にする。
  ESLint 側は同じ fixture で `boundaries/dependencies` も発火するので二重に取れる。
- **根拠**: `tests/rule-fixtures/expected.mjs:1-27` / AD-025 (a)〜(e) /
  spec.md:496-497 (SC-009 は「違反 0」を、SC-008 は「発火」を別に要求している) / AD-023 §7
- **scope 根拠**: `tests/rule-fixtures/` は本 PR の touched files

### [Low] import 順序を機械で見る規則が 1 つも無く、新規コードで順序が崩れた (C-004) (scope: feature) — **新規 (`6c3f4aa`)**

- **Where**: `src/main/infra/fs/wsl-fs.ts:1-2`

```ts
import { MAX_DIR_ENTRIES } from '@domain/validation'   // ← alias (local)
import { readdir, stat } from 'node:fs/promises'       // ← 標準モジュール
```

- **Issue**: 標準モジュールより先に alias import が来ている。
  `eslint.config.mjs` には `import/order` / `simple-import-sort` / `sort-imports` のいずれも無い
  (`grep -n "import/order\|simple-import-sort\|sort-imports" eslint.config.mjs` → **0 件**)。
  prettier も import を並べ替えない (`@trivago/prettier-plugin-sort-imports` 等は未導入)。
- **同種事象探索**: `node:` 系を import する **8 ファイル**の先頭 import を 1 件ずつ確認した。
  `path-api.ts` / `folder-service.ts` / `protocol.ts` / `host-fs.ts` / `wsl-cli.ts` /
  `folder-store.ts` / `folder-store.test.ts` の **7 件は `node:` を先頭に置いている**。
  逸脱は `wsl-fs.ts` の **1 件だけ**で、それが `6c3f4aa` で入った行である。
- **Why**: 実行時の挙動は変わらないので実害はない。効いているのは
  「7 ファイルが暗黙に守っていた順序を 8 ファイル目が破り、誰も気付かない」点で、
  **暗黙規約は 1 件破られると次からは推測できなくなる** (L-002 と同じ構造)。
  順序を見る検出器が無いので、レビューで指摘しない限り戻らない。
- **Suggested fix**: 最小の修正は `wsl-fs.ts` の 2 行を入れ替えること
  (`node:fs/promises` → `@domain/*` → 相対、が既存 7 ファイルの並び)。
  機械強制まで要るなら `eslint-plugin-import` の `import/order` を
  `groups: ['builtin','external','internal','parent','sibling']` + `pathGroups` で
  `@domain/*` を `internal` に割り当てて `src/**` に掛ける。`GENERATED_FILES` は除外する。
- **根拠**: `src/main/infra/fs/wsl-fs.ts:1-2` / 既存 7 ファイルの並び / AD-023 Context
- **scope 根拠**: `src/main/infra/fs/wsl-fs.ts` / `eslint.config.mjs` は本 PR の touched files

### [Low] alias `@renderer/*` が 3 つの設定に宣言されて使用 0 件 (C-006) (scope: feature) — **新規指摘 (実体は iteration 1 以前から)**

- **Where**: `tsconfig.web.json:16-18` / `electron.vite.config.ts:40` /
  `vitest.config.ts` の renderer project `resolve.alias`。加えて `tsconfig.json:12-16` (root) は
  `@/*` **だけ**、`tsconfig.node.json` は `@domain/*` **だけ**を宣言する
- **Issue**: `grep -rn "from '@renderer/" src/` → **0 件**。`@/` は 70 件使われている。
  `@renderer` は 3 箇所に宣言されて 1 度も使われていない。
  さらに alias 集合が設定ごとに違う — root tsconfig は `@/*` のみ、node tsconfig は `@domain/*` のみ、
  web tsconfig は 3 つすべて、vite は target ごとに別集合 (`main` は `@domain` + `@resources`)。
- **同種事象探索**: 宣言箇所 = tsconfig 3 / vite 1 (target 3) / vitest 2 project /
  eslint の `import/resolver` (tsconfig 2 project を参照) = **同じ alias が最大 6 箇所で定義される**。
  使用 0 件の alias は `@renderer` の 1 つ。
- **Why**: 同じディレクトリに 2 つの specifier (`@/` と `@renderer/`) が通る状態は、
  次の実装者が両方を使い始める余地を残す。`@/` は shadcn 規約で生成物が要求する綴りなので消せないが、
  `@renderer` は electron-vite scaffold の残りである。
  許可行列はパスで判定するので**どちらの綴りでも同じに解決され、今のところ穴にはならない** —
  ただし `docs/discovery.md:52-54` が「root は `files: []` なので lint の解決器を向けてはならない」と
  記録したとおり、この層の設定不一致は実測で穴を作ったことがある領域である。
- **Suggested fix**: `@renderer` を 3 箇所から削除して `@/` と `@domain/` の 2 つに絞る。
  併せて root `tsconfig.json` の `paths` (`@/*`) の要否を確認する —
  `files: []` の solution tsconfig に `paths` を置いても参照される project は無いので、
  不要なら削除して宣言箇所を減らす。
- **根拠**: `docs/discovery.md:52-54` / `tsconfig.json` / `tsconfig.web.json` /
  `electron.vite.config.ts` / `vitest.config.ts`
- **scope 根拠**: 4 ファイルすべて本 PR の touched files

### [Low] `tests/setup/renderer.ts` が自らの docstring に反する 3 つ目の責務を持った (C-007) (scope: feature、H カテゴリ) — **新規 (`379f6a8`)**

- **Where**: `tests/setup/renderer.ts:6-16` (docstring) / `:18-41` (`ResizeObserver` スタブ) / `:43-46` (`afterEach`)
- **Issue**: docstring は「ここは **vitest の `setupFiles`** であり、**毎テストの前後処理だけを持つ**」と
  書いたうえで、例外として `test-support/capability` の再輸出を説明している。
  `379f6a8` は 3 つ目の責務として **jsdom に無い DOM API のスタブ** を足した。
  現在このファイルは (1) jest-dom の登録、(2) `src` 側スタブの再輸出、(3) DOM polyfill、
  (4) `afterEach` の 4 つを持ち、docstring の宣言と一致しない。
- **同種事象探索**: `tests/setup/` の中身は `renderer.ts` / `harness.test.tsx` の 2 件。
  polyfill を置いた別ファイルは **0 件**。
  なお `tests/setup/**/*` は `tsconfig.node.json` と `tsconfig.web.json` の**両方**の `include` に入っており、
  renderer 専用の setup ファイルが node project でも型検査される
  (現状は通っている — jest-dom が DOM 型を引き込むため)。
- **Why**: スタブの実装自体は妥当で、コメントも「なぜ `vi.stubGlobal` ではなく直接代入か」まで説明している
  (`unstubAllGlobals` で毎テスト消えると mount のたびに落ちる)。
  問題は単一責任の宣言が残ったまま増えたことで、次に polyfill が要るとき
  (`IntersectionObserver` / `matchMedia` はいずれも assistant-ui element が触りうる) に
  置き場所の判断がこのファイルの記述からできない。
- **Suggested fix**: `tests/setup/dom-polyfills.ts` を新設してスタブを移し、
  `vitest.config.ts` の renderer project の `setupFiles` を
  `['tests/setup/dom-polyfills.ts', 'tests/setup/renderer.ts']` の 2 件にする。
  それをしない場合は docstring を実態に合わせて 4 点に書き換える。
  **「だけを持つ」という記述を残したまま増やさない。**
- **根拠**: `tests/setup/renderer.ts:6-16` / `vitest.config.ts` / AD-023 §5
- **scope 根拠**: `tests/setup/renderer.ts` は本 PR の touched files

### [Low] 新規テストが上流の英語 accessible name を唯一のセレクタとして固定した (C-008) (scope: feature) — **新規 (`379f6a8`)**

- **Where**: `src/renderer/src/features/chat/ChatScreen.test.tsx:27,34`
  (`await screen.findByLabelText('Message input')`)
- **Issue**: このテストは Principle VIII v1.2.2 の「composer は描画されるが送信経路を閉じている」前提を
  固定する**唯一の番人**である (constitution.md:440 / :706 が名指している)。
  その唯一のセレクタが `@assistant-ui/react` 由来の**英語の accessible name** である。
  `ChatScreen.tsx` 自身の可視文言はすべて日本語 (`:69`「この画面はまだ Claude Code に繋がっていません。」等)
  なので、画面内で可視文言と accessible name の言語が食い違っている。
- **同種事象探索**: `grep -rn "findByLabelText\|getByLabelText" src/renderer/` → **2 件**
  (どちらも本ファイル)。他の renderer テスト (`ResolutionScreen.test.tsx` / `harness.test.tsx`) は
  role / 日本語テキストで引いており、英語ラベル依存は本ファイルのみ。
  なお `6c3f4aa` は `error-state.tsx` の `Retry` / `Retrying` を prop 化して日本語化経路を作った
  (M-001) ので、**同じ種類の未訳ラベルを 1 件直して 1 件固定した**形になっている。
- **Why**: FR-047 と Principle XV は UI ラベルを日本語第一言語と定める。
  訳出そのものの優先度判断は `a11y-reviewer` / `ux-reviewer` の Owner 範囲なので、
  本 reviewer は「テストが上流の英語文字列に固定されている」規約上の事実だけを記録する。
  効いてくるのは composer を日本語化した瞬間で、そのときこのテストは落ちる —
  落ちること自体は健全だが、**Principle VIII の唯一の番人が訳出作業で落ちる**ため、
  「ラベルを直したらテストが落ちたので `data-testid` に逃がす」という対応を取ると番人の意味が薄れる。
- **Suggested fix**: セレクタを言語非依存にする。`screen.findByRole('textbox')` にするか、
  `Thread` の composer に Closta 側から `aria-label` を与えて日本語文言を SSoT にし、
  テストはその定数 (`labels.ts` に置く) を参照する。後者なら FR-047 対応と番人の維持が同時に済む。
- **根拠**: FR-047 / Constitution Principle XV / constitution.md:440 / :706 /
  `src/renderer/src/features/chat/ChatScreen.tsx:69-74`
- **scope 根拠**: `ChatScreen.test.tsx` は本 PR の touched files。
  ラベル訳出の要否は `a11y-reviewer` / `ux-reviewer` に委ねる

### [Low] gate の作業成果物の命名が 3 系統あり、`.gitignore` に 3 パターン必要になっている (C-009) (scope: feature / system)

- **Where**: `.gitignore:77-79` (`specs/**/*.iter[0-9]*` / `specs/**/*-gate.md.[0-9]*` /
  `specs/**/.*-scope.txt`) と `specs/001-runtime-folder-registration-runtime-detection/` 内の
  `code-gate.md.iter1` / `code-gate.md.20260916-141046` / `.code-gate-scope.txt` / `touched-files.txt`
- **Issue**: 同一ディレクトリ内で、同じ「gate が生成した作業成果物」に 3 つの命名規則が同居する。
  (a) `<name>.iter<N>` (b) `<name>.<timestamp>` (c) 先頭ドット + `<name>-scope.txt`。
  さらに (c) だけが隠しファイルで、同じ性質の `touched-files.txt` は**追跡対象の可視ファイル**である
  (`git ls-files` で確認)。`git check-ignore -v` で 3 パターンがそれぞれ別行に対応することを確認した。
- **同種事象探索**: spec dir 内の成果物のうち追跡 22 / ignore 3。ignore パターンは `.gitignore` に **3 行**。
  spec dir は 1 つしかないので cascade は 1 ディレクトリ分。
- **Why**: 実害は小さいが、**次の spec dir で同じ 3 系統が再生産される**。
  パターンが 3 つに割れていると、4 つ目の命名 (例: `code-gate.md.bak`) が生まれたときに
  黙って追跡対象に入る。iteration 1 の成果物が `code-gate.md.iter1` と
  `code-gate.md.20260916-141046` の両形式で並存しているのは、
  2 つの生成経路が同じ目的で別名を付けている証拠である。
- **Suggested fix**: 退避形式を 1 つに決める (`<name>.iter<N>` が人間に読みやすい)。
  `.gitignore` を `specs/**/*.iter[0-9]*` + `specs/**/.*-scope.txt` の 2 行に減らし、
  timestamp 形式を生成している側を iter 形式に寄せる。
  `.code-gate-scope.txt` を隠しにする理由が「派生物だから」なら `touched-files.txt` も同じ判断に揃える。
- **根拠**: `.gitignore:77-79` / `git ls-files specs/001-.../` / `git check-ignore -v` の出力
- **scope 根拠**: `.gitignore` は本 PR の touched files。wrapper 側
  (`.claude/skills/cl-code-gate/`) の修正は本 PR の範囲外なので system scope

### [Low] plan.md / AD-023 が名指すファイル名・モジュール集合と実体の食い違いが 1 件増えた (L-001) (scope: feature) — 未解消 + 悪化

- **Where**: `plan.md:96` / `:139` / `:149` / `:157-159` / `:163`、`spec.md:561`、
  `docs/decisions/0023-application-architecture.md:371`
- **Issue**: iteration 1 の 4 件がすべて残る。
  (a) `plan.md:139` の `src/main/app/folder-picker.ts` は不在 (実体は `composition-root.ts:98-122` の
  `pickHostFolder()`)。(b) `plan.md:163` は `.dependency-cruiser.cjs`、AD-023:371 は `eslint.config.ts` /
  `.dependency-cruiser.cjs` を挙げるが実体は `eslint.config.mjs` / `.dependency-cruiser.js`。
  (c) `plan.md:149` と `spec.md:561` は「画面 3 つ」だが実体は 4 つ (`features/chat/` が加わっている)。
  **(d) 新規** — `plan.md:157-159` は `domain/{runtime,workspace}/` の 2 分割を宣言するが、
  `6c3f4aa` が `src/domain/validation.ts` を `domain` 直下に置いたため、
  2 分割に入らない直下ファイルが `capability.ts` と合わせて **2 件**になった。
- **同種事象探索**: `ls src/domain/*.ts` → **2 件** (iteration 1 は 1 件)。
  plan.md「Project Structure」が名指す 20 パスの存在確認では不一致 4 件のまま。
- **Why**: `validation.ts` の置き場所自体は妥当である — IPC 境界と永続化境界の双方が使う述語であり、
  `runtime` にも `workspace` にも属さない。`capability.ts` が直下にある理由と同じで、
  ファイル内 (`:1-23`) に理由も書かれている。**問題は plan.md 側が追随していないこと**で、
  次の feature が「`domain` は 2 分割」を前提に置き場所を探すと直下という選択肢が見えない。
  ファイル名の 2 件は accepted ADR の記述と実体の不一致なので、
  **severity の最終判断は `architecture-reviewer` (ADR drift owner) に委ねる。**
- **Suggested fix**: `plan.md:139` の `folder-picker.ts` 行を「`composition-root.ts` に畳んだ」注記に直し、
  `:163` の拡張子を実体に合わせ、`:96` / `:149` と `spec.md:561` の「3 画面」を 4 に直し、
  `:157-159` に「`domain` 直下には `runtime` / `workspace` のどちらにも属さない横断モジュールを置く
  (`capability.ts` / `validation.ts`)」を 1 行足す。
  AD-023 は immutable なので、読み替えは AD-024 と同じ形で別 ADR に記録する。
- **根拠**: plan.md:96 / :139 / :149 / :157-159 / :163、spec.md:561、AD-023:371、AD-025
- **scope 根拠**: spec / plan は本 PR の touched files。AD-023 の読み替えは out-of-scope 寄り

### [Low] ファイル名規約が 3 系統混在し、SSoT もルールも無い (L-002) (scope: feature) — 未解消 (悪化なし)

- **Where**: kebab-case = `src/domain/**` / `src/main/**`。
  PascalCase = `src/renderer/src/App.tsx` / `features/*/[A-Z]*.tsx` (+ `.test.tsx`)。
  camelCase = `features/runtime-list/useRuntimes.ts` / `features/workspace-folders/useFolders.ts`。
  生成物側 hook は kebab-case (`src/renderer/src/hooks/use-attachment-src.ts`)
- **Issue**: 規約を述べる記述が依然 **0 件**
  (`grep -rniE "kebab|PascalCase|camelCase|ファイル名" docs/ specs/001-.../ .specify/memory/`)。
  `unicorn/filename-case` 等も未導入。
  iteration 2 で追加された `ChatScreen.test.tsx` は既存の PascalCase 系に従っており **新たな逸脱は無い**。
- **Why**: AD-023 Context は「最初のコミットでディレクトリ構成と依存規則が固定される」と述べ、
  その 2 つは固定された。**ファイル名だけが固定されていない。**
  `useRuntimes.ts` と `use-attachment-src.ts` が隣り合っている以上、R-2 以降の実装者の推測は割れる。
  また cross-feature 共有が 1 feature の内側に置かれ相対 import されている経路が **4 件**残る
  (`ResolutionScreen.tsx:13,14,23` / `WorkspaceFoldersScreen.tsx:13`)。
  持ち上げ先の候補 `src/renderer/src/hooks/` は M-001 の緩和集合内にあるので、
  持ち上げると lint 緩和に巻き込まれる。
- **Suggested fix**: 1 行で足りる。`docs/domains/ui/charter.md` に
  「`src/renderer/` の React component は PascalCase、hook は camelCase (生成物は上流の綴りに従う)、
  それ以外の `src/` は kebab-case」を書く。機械強制まで要るなら `unicorn/filename-case` を
  `GENERATED_FILES` を除いたパスに掛ける。cross-feature 共有は M-001 の除外をファイル単位に直したうえで
  `src/renderer/src/hooks/` へ持ち上げる。
- **根拠**: AD-023 Context / Consequences / Constitution Principle XV
- **scope 根拠**: 本 PR がファイル構成を固定した feature である

### [Low] 未使用の runtime dependency が 1 件残る (L-003) (scope: feature) — 未解消

- **Where**: `package.json:33` (`"@electron-toolkit/preload": "^3.0.2"`。`dependencies` 側)
- **Issue**: `src/` からの import は **0 件**。唯一の言及は `src/preload/index.ts:14` のコメント
  「scaffold 既定の `@electron-toolkit/preload` はこれで `module not found` になる」。
  AD-025 が「sandbox 下でも動く」を訂正し (plan.md:253-259)、R-1 は preload を単一 capability に置き換えた。
  **依存だけが残っている。**
- **同種事象探索**: `depcruise src --output-type json` の到達集合と `dependencies` の突き合わせで未到達 3 件。
  意図的なもの 1 件 (`@anthropic-ai/claude-agent-sdk`。discovery.md:83 が記録済み) と
  偽陽性 1 件 (`tw-shimmer`。CSS import なのでグラフ外) を除くと **真に未使用は 1 件**。
- **Why**: `electron-builder` の `files` / `asarUnpack` が `dependencies` を基準に同梱物を決めるため、
  配布物に不要なパッケージが入る (AD-026 の第 1 段階は通っているので現時点の実害はない)。
  depcruise には declared-but-unused を見る規則が無く、検出器が構造的に存在しない。
- **Suggested fix**: `package.json` から削除し `pnpm install` で lockfile を更新する。
  C-003 / M-004 で `knip` を入れる場合は未使用依存もそこで一緒に見られる。
- **根拠**: AD-025 (plan.md:253-259) / AD-026 / `src/preload/index.ts:14`
- **scope 根拠**: `package.json` は本 PR の touched files

### [Low] 文書に転記した検証の実測値が HEAD と 3 世代ズレた (L-004) (scope: feature、H カテゴリ) — 未解消 + 悪化

- **Where**: `docs/discovery.md:151-160`「R-1 時点の実測値 (2026-09-15)」 /
  `.specify/memory/constitution.md:658-676`「Existing violations summary」
- **Issue**: 両者は `pnpm test` = **11 files / 213 passed**、
  `pnpm depcruise` = **114 modules / 395 dependencies** を記録する。
  iteration 1 の実測は 13 / 245、115 / 398。
  **iteration 2 の実測は 15 files / 264 passed、118 modules / 416 dependencies** である
  (違反 0 / エラー 0 という結論は一致)。
  `pnpm check:constitution` の対象ファイル数も 100 → 104 に増えている。
- **追加事実 (悪化の根拠)**: `548b339` は「docs: regenerate the R-1 touched files from main...HEAD」として
  `touched-files.txt` を 152 行更新した。**同じコミットで派生成果物を 1 つだけ再生成し、
  同種の派生値である discovery.md / constitution.md の実測値は更新していない。**
  また constitution.md:660 は自らを「**v1.2.1 時点の** enumeration (2026-09-15)」と書いており、
  文書本体は v1.2.2 になっている (C-001)。
- **Why**: `docs/discovery.md:11-18` 自身が「`convention-reviewer` と `lint-agent` は本ファイルの
  Tech Stack section を SSoT として読むため、記述の鮮度が直接それらの判断に効く」
  「**旧記述を残したままにすると、lint コマンドを「存在しない」と判断して検査が丸ごと飛ぶ**」と警告している。
  今回の不一致は鮮度の問題で検査が飛ぶ形ではないが、Constitution 改定手順 5 の
  「既存違反 enumeration」が記録した数値が HEAD と一致しない状態は、
  次の改定で「何が変わったか」の基準にならない。
- **Suggested fix**: 2 ファイルの数値を HEAD の実測に更新する
  (15 files / 264 passed、118 modules / 416 dependencies、対象 104 ファイル)。
  **より本質的な案**: 数値を文書に転記する代わりに、`pnpm test:rules` と同じ形で
  「記録値と実測値の一致」を CI の 1 ステップにする。**転記は必ず腐る** —
  iteration 1 で指摘して iteration 2 でさらにズレたことがその証拠である。
  C-001 の版番号転記も同じ手当てで塞げる。
- **根拠**: `docs/discovery.md:11-18` / `:151-160` / `.specify/memory/constitution.md:155` / `:658-676`
- **scope 根拠**: 両ファイルは本 PR の touched files

### [Low] `Browse session` の裸表記が新規テストで 10 箇所増えた (L-005) (scope: feature) — 未解消 + 悪化

- **Where**: `src/main/app/folder-service.ts:98` (`const sessions = new Map<string, BrowseSession>()`) /
  `:246,266-308` (`session`) / `src/main/app/validate.ts:141` (`sessionNamespace`) /
  `src/main/app/validate.test.ts:217` / **新規**
  `src/main/app/folder-service.test.ts:139,152,160,172,180,189,198,213,226,240` (`openSession`)
- **Issue**: `docs/glossary.md:55-62` は `Browse session` を定義し、Counterexamples で
  「`Session` (Claude Code の 1 会話) とは**別概念**である」と明記する。
  型名は canonical に従う (`folder-service.ts:48` `interface BrowseSession`、
  `BROWSE_SESSION_TTL_MS`、`browse-session-expired`) が、値・引数・ヘルパ名は `Browse` が落ちている。
  `6c3f4aa` が追加した `folder-service.test.ts` は `openSession` を **10 箇所**使い、裸表記を拡大した。
- **同種事象探索**: `grep -rlE "\bsessions?\b" src/ --include=*.ts --include=*.tsx` (生成物除く) → 6 ファイル。
  うち Electron API 由来 1 件 (`src/main/app/window.ts` の `webContents.session`)。
  UI 文言は glossary の要求どおり「セッション」を使っていない
  (`labels.ts:76`「選択の有効期間が切れました。もう一度開いてください」) — **ここは正しい。**
- **Why**: 現時点では `app` レイヤ内部に閉じており読み違える余地は小さい。
  効いてくるのは R-2 以降で、`Session` (Claude Code の 1 会話) が同じ `app` レイヤに入り
  `validate.ts` が session 関連の IPC 入力も検証するようになった時点である。
  そのとき `sessionNamespace` と `openSession` はどちらの session か決まらない。
  **新規ファイルで表記を増やしたので、統一のコストも増えた。**
- **Suggested fix**: `sessions` → `browseSessions`、`session` → `browseSession`、
  `sessionNamespace` → `browseNamespace` (または `verifiedNamespace`)、
  `openSession` → `openBrowseSession`。型名は既に canonical なので機械的な置換で済む。
- **根拠**: Constitution Principle XIV / `docs/glossary.md:55-62`
- **scope 根拠**: 4 ファイルすべて本 PR の touched files

### [Low] テスト専用モジュールを production コードから import できる (L-006) (scope: feature) — 未解消

- **Where**: `.dependency-cruiser.js:136-149` (`not-to-test` / `not-to-spec`) /
  `src/domain/workspace/__fixtures__/runtime.ts` / `src/renderer/src/test-support/capability.ts`
- **Issue**: `not-to-spec` の `to.path` は
  `[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$`、`not-to-test` は `^(specs|tests)`。
  **どちらも `src/**/__fixtures__/` と `src/renderer/src/test-support/` に一致しない。**
  現時点の import 元はテストと vitest の setup のみ
  (`src/domain/workspace/resolution.test.ts:14` / `ResolutionScreen.test.tsx:11` /
  `tests/setup/harness.test.tsx:6` / `tests/setup/renderer.ts:16`)。production からの参照は **0 件**。
- **Why**: `src/**` は `electron-vite` のバンドル対象であり、production モジュールがこの 2 つに触れれば
  fake 実装が出荷物に入る。`not-to-spec` / `not-to-test` を「同じ目的の規則」として置いた設計に
  1 系統の穴が残る形で、本プロジェクトが避けたいと明言している「書いてあるのに届かない」(AD-025) と
  同じ構造である。
- **Suggested fix**: `not-to-spec` の `to.path` に `(^|/)(__fixtures__|test-support)/` を足す
  (テストファイル自身と `tests/setup/` は `from` 側を `pathNot` で除く)。
  `tests/rule-fixtures/` に群 (a) の fixture を 1 件足せば M-007 と同じ手当てで発火まで確認できる。
- **根拠**: `.dependency-cruiser.js:136-149` / AD-025 / `vitest.config.ts`
- **scope 根拠**: `.dependency-cruiser.js` は本 PR の touched files

### [Low] coverage の計測が設定されていない (L-007) (scope: feature、H カテゴリ) — 未解消

- **Where**: `vitest.config.ts` (`coverage` キー無し) / `package.json` の devDependencies
  (`@vitest/coverage-v8` / `-istanbul` が **0 件**。`@vitest/ui` のみ) /
  `.github/workflows/verify.yml` の `test` ステップ
- **Issue**: 264 件のテストが何を覆っているかを示す数値が存在しない。
  iteration 2 でテストは 13 → **15 ファイル** / 245 → **264 件**に増えたが、計測は入っていない。
- **同種事象探索**: `*.test.*` → **15 件**。`src/domain/` の 12 実装ファイルに対してテストは 3 件
  (`path-api.test.ts` / `registry.test.ts` / `resolution.test.ts`)。
  新規 `src/domain/validation.ts` には専用テストが無く、
  `validate.test.ts` / `folder-record` 経由で間接的に踏まれるだけである。
- **Why**: `docs/discovery.md` / Constitution が「213 passed」のような**件数**で検証を記録しており (L-004)、
  件数は覆っている範囲を表さない。AD-023 Consequences が「`domain` のテストはモックがゼロになる」と
  述べる利点を使い切れているかを判定する材料がない。
  本 PR の SC 群に coverage 閾値の要求は無いので**違反ではない**。
- **Suggested fix**: `@vitest/coverage-v8` を入れて `vitest.config.ts` に
  `coverage.include: ['src/domain/**']` と text reporter を置き、CI の `test` ステップで出力させる。
  **閾値は置かなくてよい** — まず「どこが覆われていないか」が見える状態を作るほうが先である。
- **根拠**: `vitest.config.ts` / `package.json` / AD-023 Consequences
- **scope 根拠**: 本 PR がテスト基盤を立てた feature である

## 指定された新規ファイル / 変更の確認結果 (要求事項 3)

| 対象 | 命名 | 置き場所 | lint hookup | 判定 |
|---|---|---|---|---|
| `src/renderer/src/features/chat/ChatScreen.test.tsx` | PascalCase + `.test.tsx`。既存 3 画面のテストと一致 | feature フォルダ内に co-locate。`vitest.config.ts` の renderer project `include` に一致 | `pnpm lint` / `typecheck` の対象内。`boundaries` の `ui` に分類され違反 0 | **命名 / 置き場所は問題なし。** セレクタが上流の英語ラベル依存 → **C-008** |
| `src/domain/validation.ts` | kebab 不要の単語 1 語。`src/domain/**` の綴りと整合 | `domain` **直下**。`runtime` / `workspace` のどちらにも属さない横断モジュールとして妥当だが plan.md:157-159 は 2 分割しか宣言していない | `boundaries/no-unknown-files` を通過 (= レイヤに分類された)。`domain-not-to-io` の対象に入る | **M-003 を正しく解消した。** 残渣 → **C-003**、plan.md 追随漏れ → **L-001 (d)** |
| `src/main/app/folder-service.test.ts` | kebab-case + `.test.ts`。`src/main/**` と整合 | 実装の隣に co-locate。node project に一致 | 対象内。違反 0 | **命名 / 置き場所は問題なし。** `openSession` が裸表記を 10 箇所拡大 → **L-005** |
| `tests/setup/renderer.ts` の `ResizeObserver` スタブ | — | `setupFiles` に polyfill を同居させた | 対象内 (`tests/setup/**` は node / web 両 tsconfig の `include`) | 実装は妥当。docstring の単一責任宣言と不一致 → **C-007** |

`6c3f4aa` の他の変更 (`allowlists.mjs` の `.html` 追加 / `check.mjs` の項目 10 (e) 追加 /
`descriptor.ts` の `WslAvailability` / renderer 4 画面の改修 / `src/renderer/index.html` の CSP 撤去) について:
**`.html` を走査対象に加えた修正と項目 10 (e) の追加は、AD-025 §7 の前提を実際に守らせる方向の良い変更である。**
lint hookup の観点で残る問題は除外の書き方 (**C-002**) と発火未確認 (**M-007**) の 2 点に限る。

## 同種事象探索 cascade summary

| 指摘 ID | Grep / 検証コマンド | 該当件数 | path:line |
|---|---|---|---|
| — | `pnpm lint` / `typecheck` / `depcruise` / `check:constitution` / `test` / `test:rules` | **全件 exit 0 / 指摘 0** | 0 件 |
| H-001 | `grep -rn "better-sqlite3\|node-pty\|keytar" tests/` | **0** | fixture 不在 |
| H-001 | `.dependency-cruiser.js` の固有規則 vs `expected.mjs` の `rules:` | 10 / 名指し 5 | `.dependency-cruiser.js:179,188,195,202,215,222,231,240,249,256` |
| M-001 | `grep -rl "する\|ため\|して\|こと" src/renderer/src/{components,hooks,lib}` | **2** (iter1 は 1) | `components/assistant-ui/elements/error-state.tsx` / `lib/utils.ts` |
| M-001 | `npx eslint --print-config .../error-state.tsx` | 緩和 7 規則すべて `0` | `eslint.config.mjs:73-77,403-413` / `.prettierignore:11-13` |
| M-002 | `grep -rn "from \"cn\"" src/` | 6 | `components/ui/{avatar,button,dialog,skeleton,textarea,tooltip}.tsx` |
| M-003 | `grep -rn "hasControlCharacter\|MAX_*" src/ scripts/ tests/` | 重複 **0** (解消) | 定義は `src/domain/validation.ts:32,46,55,63` の 1 箇所 |
| M-004 | 6 識別子の宣言ファイル外参照 | **0** (全件 dead) | `path-api.ts:232` / `path-types.ts:151,156` / `namespace.ts:96` / `registry.ts:39` / `descriptor.ts:65,117` |
| M-005 | `grep -rn "CrossBoundary\|crossRecommendation\|CrossRecommendation\|CROSS_STEP_LABELS" src/` | 16 (非 canonical **4**) | `resolution.ts:82,173,190` / `ResolutionScreen.tsx:63,146` / `labels.ts:50` |
| M-006 | 版 pin artifact の存在確認 | **0** | `.github/workflows/verify.yml:38,40,51` のみが版を名指す |
| M-007 | 対象コードを持つ未 fixture 規則 | 4 (+ 新設の #10 (e) で 5) | `.dependency-cruiser.js:215,231,249,256` / `check.mjs:455-478` |
| C-001 | `grep -rn "^version:" --include=*.md docs/ .specify/ specs/` | **1** (cascade なし) | `.specify/memory/constitution.md:3` vs `:768` |
| C-002 | `allowlists.mjs` の除外のうちパターン一致判定 | **1** | `scripts/constitution/allowlists.mjs:326` |
| C-003 | 参照 0 件の再 export / 二重 import 経路 | **1** / 1 | `src/main/infra/fs/wsl-fs.ts:30` / `src/main/app/validate.ts:34` |
| C-004 | `node:` を import する 8 ファイルの先頭 import | 逸脱 **1 / 8** | `src/main/infra/fs/wsl-fs.ts:1-2` |
| C-004 | `grep -n "import/order\|simple-import-sort\|sort-imports" eslint.config.mjs` | **0** | 順序を見る規則なし |
| C-005 | `grep -n "Availability\|利用可否" docs/glossary.md` | **0** | `src/domain/runtime/descriptor.ts:83-99` が未登録 |
| C-006 | `grep -rn "from '@renderer/" src/` | **0** (宣言 3 箇所) | `tsconfig.web.json:16-18` / `electron.vite.config.ts:40` / `vitest.config.ts` |
| C-007 | `tests/setup/` の polyfill 専用ファイル | **0** | `tests/setup/renderer.ts:18-41` |
| C-008 | `grep -rn "findByLabelText\|getByLabelText" src/renderer/` | **2** (両方本ファイル) | `ChatScreen.test.tsx:27,34` |
| C-009 | `git check-ignore -v` で gate 成果物 3 件 | パターン **3 行** | `.gitignore:77,78,79` |
| L-001 | `ls src/domain/*.ts` | **2** (iter1 は 1) | `capability.ts` / `validation.ts` vs `plan.md:157-159` |
| L-002 | `grep -rniE "kebab\|PascalCase\|camelCase\|ファイル名" docs/ specs/ .specify/memory/` | 規約記述 **0** | SSoT 不在 |
| L-003 | グラフ到達集合 vs `dependencies` | 真に未使用 1 | `package.json:33` |
| L-004 | `pnpm test` / `depcruise` の実測 vs 記録 | 不一致 2 (ズレ 3 世代) | `docs/discovery.md:151-160` / `constitution.md:658-676` |
| L-005 | `grep -rlE "\bsessions?\b" src/` (生成物除く) | 6 ファイル (新規 `openSession` **10**) | `folder-service.test.ts:139,152,160,172,180,189,198,213,226,240` |
| L-006 | `grep -rn "__fixtures__\|test-support" src/ tests/` | 5 (production から **0**) | `.dependency-cruiser.js:136-149` に一致する規則なし |
| L-007 | `*.test.*` の数 / coverage パッケージ | 15 / **0** | `vitest.config.ts` / `package.json` |

## Verdict

- Critical: **0**
- High: **2** (H-001 未解消 / M-001 を追加事実により Medium → High に格上げ)
- Medium: **9** (M-002 / M-004 / M-005 / M-006 / M-007 / C-001 / C-002 / C-003 / C-005)
- Low: **12** (L-001〜L-007 / C-004 / C-006 / C-007 / C-008 / C-009)
- Round inheritance: **resolved from 1: 1** (M-003) / **unresolved: 14**
  (うち悪化 4 = M-001 / L-001 / L-004 / L-005) / **new: 9** (C-001〜C-009)

**lint コマンド由来の Critical / High は iteration 2 でも 0 件である。**
`pnpm lint` / `typecheck` / `depcruise` / `check:constitution` / `test` / `test:rules` の
6 コマンドすべてが exit 0 で完了し、1 件も指摘を出さない。
本 reviewer の finding はすべて「検証が構造的に届いていない範囲」から出したものであり、
内訳は次の 4 系統である。

1. **規則は書かれているが発火が未確認** — H-001 / M-007 / L-006 / C-002
2. **緩和・除外の適用範囲が広すぎて手書きコードや将来のファイルを飲み込む** —
   M-001 (**実害が発生済み**) / C-002
3. **その種類の不整合を見る検出器が存在しない** — M-002 / M-004 / M-005 / M-006 / C-001 / C-003 /
   C-004 / C-005 / C-006 / L-002 / L-003 / L-004 / L-005 / L-007
4. **宣言 (docstring / plan / frontmatter) と実体の不一致** — C-001 / C-007 / L-001

**iteration 2 で最も重いのは M-001 の格上げである。** iteration 1 が
「次にここへ手書きを置いた時点で同じ緩和が黙って適用される」と予測した形が、
同一 feature の修正コミット (`6c3f4aa`) の中で実際に起きた。
`error-state.tsx` は 7 規則 off / prettier 対象外のまま手で改変され、
再生成すると FR-047 対応の prop が消える状態になっている。
**除外をディレクトリ単位からファイル単位に変えるまで、同じことが次の feature でも起きる。**
