# convention-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-15T15:56:12Z
**Reviewer**: convention-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Gate**: code-gate iteration 1
**Diff scope**: `git diff main...HEAD` (194 files / +35,236)

## 初回読了 viewpoint

**FR/SC (本 reviewer の観点に該当するもの)**

- FR-025 / FR-035 / FR-036 / FR-038 / FR-041 — 標準モジュール・`electron`・プロセス起動・
  プラットフォーム分岐・ネイティブモジュールの許可範囲 (lint hookup の対象そのもの)
- FR-033 — assistant-ui の design system / Element の採用範囲
- FR-047 — UI 文言は日本語
- SC-008 — 違反サンプル群 (a) の**全数検出**。US-4 AC-1〜AC-11 が名指す経路は群の別を問わず全数検出
- SC-009 — 規則適合状態で lint / 型検査 / 依存グラフ / Principle 検証が違反 0
- SC-012 — README / LICENSE の体裁 (Principle XV Exceptions)
- SC-017 — 群 (b) の検出 / 未検出の一覧と、未検出への feature ID 割り当て

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md` — 本 feature の domain
- AD-023 §1 / §3 / §5 / §7 / §8 — 5 レイヤ / インタフェースは `domain` / 依存規則を 2 ツールで強制
- AD-024 #7 / #8 / #12 / #14 — Automated の正本を lint + グラフ検証へ / 表層文書の英語 Exceptions
- AD-025 §「設定しただけでは効かない」(a)〜(e) — ルールが黙って死ぬ 5 つの実測例
- Constitution Principle I / II / VI / VII / XIII / XIV / XV
- `docs/glossary.md` (31 語)、`docs/discovery.md` revision 3「Build / Test / Lint」

**viewpoint 集計**

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の Owner 範囲
- B. 入力検証 / injection / 暗号: 該当なし: `security-reviewer` の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: charter / glossary **文書側**の drift は `architecture-reviewer` の Owner 範囲。本 reviewer は「コード識別子が glossary の canonical 表記と食い違う」側だけを F に計上した
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner 範囲。AD-023 Consequences の `eslint.config.ts` / `.dependency-cruiser.cjs` という**ファイル名**の不一致だけを L-001 に F として計上した
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` の Owner 範囲
- F. 命名 / module 配置 / lint hookup: Critical:0 High:1 Medium:7 Low:6
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 本 PR に DB / HTTP API / OpenAPI が無く、a11y / UX は `a11y-reviewer` / `ux-reviewer` の Owner 範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R-1 はプロジェクト初期化と `runtime` domain 最下層を同時に立てる feature であり、
AD-023 が「最初のコミットでディレクトリ構成と依存規則が固定される」と述べたとおり、
本 PR で決まった規約が以後の全 feature を拘束する。本 reviewer は
(1) `docs/discovery.md` revision 3 が SSoT と定める 6 つの検証コマンドを実際に実行し、
(2) コード識別子と `docs/glossary.md` の canonical 表記の突き合わせ、
(3) AD-023 の 5 レイヤに対する置き場所の妥当性、
(4) `eslint.config.mjs` / `.dependency-cruiser.js` の「書いてあるのに効いていない」穴、
(5) Principle XV の言語混在、を見た。

**実行結果 (2026-09-15。`.eslintcache` を削除してから実行)**

| 検証 | 結果 | 記録値 (discovery.md:151-160 / constitution.md:645-650) |
|---|---|---|
| `pnpm lint` | 違反 **0** (exit 0) | 違反 0 |
| `pnpm typecheck` | エラー **0** (exit 0) | エラー 0 |
| `pnpm depcruise` | 違反 **0** (**115 modules / 398 dependencies**) | 違反 0 (114 modules / 395 dependencies) |
| `pnpm check:constitution` | 違反 **0** (ok 10 / pending 1) | 違反 0 (ok 10 / 検査対象なし 1) |
| `pnpm test` | **13 files / 245 passed** | 11 files / 213 passed |
| `pnpm test:rules` | 期待表と全件一致 (20 件) | 全件一致 |

**lint コマンド由来の finding は 0 件である。** 6 コマンドすべてが exit 0 で、
ESLint / dependency-cruiser / Principle 検証はいずれも 1 件も指摘を出さない。
したがって以下の finding は、すべて**検証が構造的に届いていない範囲**から出したものである。

<details>
<summary>lint / 検証コマンドの生 output</summary>

```
$ pnpm lint
(出力なし。exit 0)

$ pnpm typecheck
> tsc --noEmit -p tsconfig.node.json --composite false
> tsc --noEmit -p tsconfig.web.json --composite false
(出力なし。exit 0)

$ pnpm depcruise
✔ no dependency violations found (115 modules, 398 dependencies cruised)

$ pnpm check:constitution
Constitution 検証 — 対象 100 ファイル
[ok     ] #1 特権コマンド文字列の不在 (引数配列も捕捉)  (Principle VI)
[ok     ] #2 `wsl.exe` に渡す引数が許可リスト内  (Principle VI)
[ok     ] #3 `wsl.exe` を名指せるモジュールの許可リスト  (Principle VI)
[ok     ] #4 docker CLI を名指せるモジュールの許可リスト  (Principle VI)
[pending] #5 許可モジュール内にイメージ構築サブコマンドが無い  (Principle VI)
[ok     ] #6 ディストロ内スクリプトが定義済みの内容と一致 (3 点検査)  (Principle VI)
[ok     ] #7 プロセス起動 API を使えるモジュールの許可リスト  (Principle VI)
[ok     ] #8 注記のないプラットフォーム分岐の不在 (等価 API / 構文変形を含む)  (Principle II)
[ok     ] #9 OS へのプロトコル関連付け API の不在  (Principle VI)
[ok     ] #10 CSP が FR-040 の directive を満たし禁止形を含まない  (Principle FR-040)
[ok     ] #11 window.open / 遷移の拒否と origin 定数の単一性  (Principle FR-039 / FR-040)
項目 11 件: ok 10 / 違反 0 (指摘 0 件) / 検査対象なし 1

$ pnpm test
Test Files  13 passed (13)
     Tests  245 passed (245)

$ pnpm test:rules
展開: 20 件 / 期待表と一致: 20 件
機械検証で捕まらない経路: 2 件 (ui-path-concat / reuse-verified-other-distro)
```

</details>

## Findings

### [High] US-4 AC-2 の「ネイティブモジュール」経路に違反サンプルが無く、規則の発火が未確認 (H-001) (scope: feature)

- **観察**: `.dependency-cruiser.js:188` の `agents-not-to-native` と `eslint.config.mjs:62`
  (`NATIVE_MODULES`) / `:336-343` (`MSG_NATIVE` の policy) は
  `better-sqlite3` / `node-pty` / `keytar` を `agents` / `domain` で禁じている。
  しかし `tests/rule-fixtures/expected.mjs` の FIXTURES 20 件に**ネイティブモジュールを
  名指すサンプルが 1 件も無い** (`grep -rln 'better-sqlite3|node-pty|keytar' tests/` → **0 件**)。
  spec.md の US-4 AC-2 は「`agents` レイヤのファイル、When `electron` **やネイティブモジュール**に
  推移的に依存する、Then 止まる」であり、fixture は
  `a-direct/agents-electron-transitive.ts.fixture` の `electron` 側だけを覆っている。
- **同種事象探索**: `grep -rln "better-sqlite3\|node-pty\|keytar" tests/` で **0 件**。
  `grep -n "name: '" .dependency-cruiser.js` の 21 規則のうち本プロジェクト固有は 10 件、
  `expected.mjs` が `rules:` で名指すのは 5 件 (`no-circular` / `agents-not-to-electron` /
  `domain-not-to-io` / `path-module-only-from-path-api` / `ui-not-to-core`)。
  未名指しの 5 件を M-007 に分離した。
- **リスク/影響**: spec.md:490-495 (SC-008) は「US-4 の Acceptance Scenario が『止まる』と
  明記する経路は、群 (a) / (b) の別を問わず**すべて全数検出される**」「**該当する AC を
  3 つだけ列挙する形にしない** — 列挙すると、同じ構造を持つ残りが拘束を外れて
  『未検出でも記録すれば可』の側に落ちる」と明記している。AC-2 の半分が未実証である。
  さらに 3 モジュールはいずれも**未導入**なので、仮に fixture を置いても
  `not-to-unresolvable` (`.dependency-cruiser.js:123`) が先に発火し、
  `agents-not-to-native` が本当に一致するかは依然分からない。
  AD-025 (d) が記録した「`^electron($|/)` と書いたルールは 1 件も一致せず黙って死んでいた」と
  同じ失敗モードが、I-1 で `better-sqlite3` が入る瞬間まで検出できない。
- **推奨アクション**: `tests/rule-fixtures/` に群 (a) として
  `agents-native-import.ts.fixture` (`src/agents/__rulecheck__/` へ展開、
  `import Database from 'better-sqlite3'`) と `domain-native-import.ts.fixture` を追加し、
  `expected.mjs` に `detectors: ['eslint','depcruise']` /
  `rules: ['no-restricted-imports','agents-not-to-native']` を書く。
  **未導入モジュールのため `not-to-unresolvable` が同時に発火する**ので、
  `expected.mjs` の照合が部分一致であることを利用して期待規則に両方を並べるか、
  fixture 用の型スタブを `tests/rule-fixtures/` 内に置いて解決させる。
  どちらも採れない場合は `expected.mjs` の `UNDETECTED_NOTES` に
  「ネイティブモジュール経路は導入まで発火未確認」を明記し、SC-017 と同じ扱いで
  塞ぐ feature ID (I-1) を割り当てる — **AC-2 を覆ったことにしない。**
- **根拠**: spec.md:490-495 (SC-008) / spec.md US-4 AC-2 / AD-025 (d) /
  Constitution Principle VII (Verification「Automated (正本)」) / FR-041
- **scope 根拠**: `tests/rule-fixtures/` は本 PR の touched files であり、feature 内で修正可能

### [Medium] CLI 生成物向けの lint / 整形緩和が手書きファイルを巻き込んでいる (M-001) (scope: feature)

- **観察**: `eslint.config.mjs:73-77` の `GENERATED_FILES` は
  `src/renderer/src/{components,hooks,lib}/**/*.{ts,tsx}` を対象に
  `prettier/prettier` / `@typescript-eslint/explicit-function-return-type` /
  `react/prop-types` / `react-hooks/refs` / `react-hooks/exhaustive-deps` /
  `react-refresh/only-export-components` / `no-empty` を `off` にする
  (`eslint.config.mjs:403-414`)。`.prettierignore:11-13` が同じ 3 ディレクトリを整形対象外にする。
  同ブロックのコメントは「`shadcn` / `assistant-ui add` が生成したファイル。**手で書いたコードではない。**」と
  断定している。
  しかし `src/renderer/src/lib/utils.ts:5-8` の docstring は
  「手動 `components.json` では alias 解決に失敗して生成されないため**自分で置く**」と
  書いており、**手書きである**。
  `npx eslint --print-config src/renderer/src/lib/utils.ts` で確認したところ、
  同ファイルに対し上記 7 規則はすべて `0` (off) で計算される。
- **同種事象探索**: 3 ディレクトリ配下 23 ファイルのうち、
  本プロジェクトの整形規約 (`.prettierrc.yaml`: `singleQuote: true` / `semi: false`) に
  従っているのは `src/renderer/src/lib/utils.ts` の **1 件のみ**
  (他 22 件は上流由来の `"..."` + `;` 体裁)。手書き混入は現時点で 1 件。
- **リスク/影響**: 「上流を再生成すると上書きされるので体裁のルールを掛けない」という
  除外の根拠が、この 1 ファイルには成立しない (再生成されないから手で置いた)。
  `src/renderer/src/hooks/` は手書きの共有 hook の自然な置き場であり
  (L-002 の cross-feature import 参照)、**次にここへ手書きを置いた時点で
  同じ緩和が黙って適用される。** 除外集合がディレクトリ単位なので、混入は目に見えない。
- **推奨アクション**: `GENERATED_FILES` と `.prettierignore` を
  **ファイル単位の明示リスト**に変える。Constitution Principle XIII の
  `theme_baseline_exclusions` と Principle VI の「除外はファイル単位の明示リストとし、
  ディレクトリ単位で除外してはならない」(constitution.md:343-345) が既に同じ方針を採っており、
  それをここにも適用する。最小の修正は両ファイルの `src/renderer/src/lib` を外し、
  `src/renderer/src/lib/utils.ts` を通常の規則下に戻すこと
  (現状の内容は既に規約に適合しているので違反は出ない)。
- **根拠**: Constitution Principle VI Verification (除外はファイル単位) /
  Principle XIII `theme_baseline_exclusions` / plan.md:313-316 (SH-015 の除外方針) /
  `src/renderer/src/lib/utils.ts:5-8`
- **scope 根拠**: `eslint.config.mjs` / `.prettierignore` は本 PR の touched files

### [Medium] `cn` が 2 実装同居し、`components.json` の `utils` alias と食い違う (M-002) (scope: feature)

- **観察**: `components.json:16` は `"utils": "@/lib/utils"` を宣言し、
  `src/renderer/src/lib/utils.ts:9` がその実体 (`clsx` + `tailwind-merge`) を提供する。
  ところが `src/renderer/src/components/ui/` の 6 ファイルは
  **npm パッケージ `cn` を裸の specifier で import** している。
  - `src/renderer/src/components/ui/avatar.tsx:2` `import { cn } from "cn"`
  - `src/renderer/src/components/ui/button.tsx:3` 同
  - `src/renderer/src/components/ui/dialog.tsx:2` 同
  - `src/renderer/src/components/ui/skeleton.tsx:1` 同
  - `src/renderer/src/components/ui/textarea.tsx:2` 同
  - `src/renderer/src/components/ui/tooltip.tsx:4` 同
  `package.json:37` に `"cn": "^0.3.0"` (`github.com/shadcn-ui/cn`。
  "Drop-in replacement for clsx + tailwind-merge") が **runtime dependency** として入っている。
- **同種事象探索**: `grep -rln "from ['\"]@/lib/utils['\"]" src/` → **19 件**、
  `grep -rn "from ['\"]cn['\"]" src/` → **6 件**。同一の helper が 2 実装に分かれている。
  `ui/*` primitive 群だけが `cn` パッケージ側、assistant-ui element 群と
  `features/` の 3 画面は `@/lib/utils` 側。
- **リスク/影響**: `cn` パッケージはコンパイル済みテーブルで class を畳む実装で、
  `clsx` + `tailwind-merge` とは**競合解決の設定が別物**である。
  `Button` / `Dialog` / `Tooltip` に `className` を渡して上書きする経路
  (`ResolutionScreen.tsx` / `RuntimeListScreen.tsx` / `WorkspaceFoldersScreen.tsx` が
  いずれも行っている) で、element 側と primitive 側の畳み方が食い違いうる。
  加えて `cn` は精度を出すために `cn build` (`cn-tables.mjs` 生成) を前提とするが、
  `package.json` の scripts にその段が無い。
  `boundaries/dependencies` は policy (1) で外部パッケージを一律許可し
  (`eslint.config.mjs:240`)、`no-restricted-imports` にも `cn` は無く、
  depcruise の `no-non-package-json` は `package.json` にある以上通る。
  **lint 3 層すべてが構造的にこの食い違いを見ない。**
- **推奨アクション**: どちらかに寄せる。
  (a) `components.json` の宣言どおりに寄せる場合 — `ui/*` 6 ファイルの import を
  `@/lib/utils` に直し、`package.json` から `cn` を外す。生成物を手で直すことになるので、
  `components.json` の `aliases.utils` が `add` 時に効いていない原因
  (registry 側が新しい `cn` 規約に移行済み) を `docs/decisions/` に 1 件記録する。
  (b) `cn` パッケージに寄せる場合 — `src/renderer/src/lib/utils.ts` を廃し、
  19 ファイルの import を `cn` に移し、`clsx` / `tailwind-merge` を依存から外し、
  `cn build` を `package.json` の scripts と CI に足す。
  **いずれにせよ「2 実装同居」を残さない。** 判断は AD 起票を伴う (Principle XIII の
  design system 一貫性に触るため)。
- **根拠**: Constitution Principle XIII / `components.json:16` /
  AD-025 §6 (b) (assistant-ui は element に付随する styling を採る)
- **scope 根拠**: `components.json` / `package.json` / `src/renderer/src/components/ui/` は本 PR の touched files

### [Medium] 同一の純粋関数と 3 つの上限定数が `app` / `infra` に重複し、`domain` に無い (M-003) (scope: feature)

- **観察**: `hasControlCharacter` が**同一実装で 2 箇所**にある。
  - `src/main/app/validate.ts:26-32`
  - `src/main/infra/settings/folder-record.ts:34-40`
  (どちらも `code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)` の 7 行。差分なし)
  上限定数も重複する。
  - `MAX_DISPLAY_NAME_LENGTH = 255` — `src/main/app/validate.ts:21` と `src/main/infra/settings/folder-record.ts:29`
  - `MAX_PATH_VALUE_LENGTH = 4096` — `src/main/app/validate.ts:22` と `src/main/infra/settings/folder-record.ts:32`
  - `MAX_DIR_ENTRIES = 2000` — `src/main/app/validate.ts:24` と `src/main/infra/fs/wsl-fs.ts:29`
  うち `src/main/app/validate.ts:24` の `MAX_DIR_ENTRIES` は
  **どこからも参照されていない** (`grep -rn MAX_DIR_ENTRIES src/` → 定義 2 件 +
  `wsl-fs.ts:86` の使用 1 件のみ)。app 側の写しだけが死んでいる。
- **同種事象探索**: `grep -rn "MAX_DIR_ENTRIES\|MAX_DISPLAY_NAME_LENGTH\|MAX_PATH_VALUE_LENGTH" src/`
  → 定義 6 件 / 使用 7 件。重複は上記 3 組 = **3 件**。
  同種の「pure logic が `app`/`infra` にあって `domain` に無い」例として
  `isKnownRuntimeId` (`src/domain/runtime/descriptor.ts:89`) と
  `findRuntime` (`src/main/app/validate.ts:95`) の役割重複が 1 件 (M-004 で扱う)。
- **リスク/影響**: AD-023 §1 は `domain` を「entity・規則・インタフェース定義。**I/O なし**」、
  §5 は「状態を持たない規則は**純粋関数**」と定める。`hasControlCharacter` と 3 定数は
  完全に純粋な規則であり、置き場所は `domain` である。
  実害は**片方だけ変わったときに誰も気付かないこと**にある。
  `validate.ts` は IPC 入口で 4096 を超えるパスを弾き、`folder-record.ts` は
  復元時に 4096 を超えるレコードを弾く。片方を 8192 にすると
  「登録はできるが次回起動で復元されないフォルダ」が生まれ、
  SC-013 の「復元 100%」が静かに崩れる。lint / depcruise / 型検査のいずれも
  定数の値の一致を見ない。
- **推奨アクション**: `src/domain/workspace/limits.ts` (または既存の
  `src/domain/workspace/folder.ts`) に 3 定数と `hasControlCharacter` を移し、
  `src/main/app/validate.ts` / `src/main/infra/settings/folder-record.ts` /
  `src/main/infra/fs/wsl-fs.ts` から `@domain/...` 経由で参照する。
  `src/main/app/validate.ts:24` の死んだ写しは削除する。
  `app`/`infra` → `domain` は `boundaries/dependencies` で既に許可済みなので設定変更は不要。
- **根拠**: AD-023 §1 / §3 / §5 / spec.md SC-013 (復元 100%) /
  plan.md:175 (「DTO は `domain` に置く」と同じ論法)
- **scope 根拠**: 3 ファイルすべて本 PR の touched files

### [Medium] `domain` の公開 export 6 件が呼び出し 0 件・テスト 0 件で、docstring は利用者を名指している (M-004) (scope: feature)

- **観察**: 以下は**宣言行以外にリポジトリ内の参照が 1 件も無い** export である
  (`grep -rn "\b<name>\b" src/ scripts/ tests/` が定義行のみを返す)。
  - `src/domain/runtime/path-api.ts:232` `identityHost` — docstring「`Win32Runtime` の恒等変換」
  - `src/domain/runtime/path-types.ts:151,156` `PathParts` / `pathParts`
  - `src/domain/runtime/namespace.ts:96` `isSameNamespace` — docstring「境界を渡る値に使う」
  - `src/domain/workspace/registry.ts:39` `foldersAtLocation` — docstring
    「**一覧の所在別表示と第 0 段の判定が使う**」
  - `src/domain/runtime/descriptor.ts:65` `sameRuntime` — docstring「同一性は `id` で判定する (FR-011)」
  - `src/domain/runtime/descriptor.ts:89` `isKnownRuntimeId` — docstring「**未信頼入力の検証に使う**」
  いずれも `specs/001-.../contracts/` / `data-model.md` / `docs/` にも名前が出てこない (grep 0 件)。
- **同種事象探索**: 全 `src/` (生成物 3 ディレクトリを除く) の
  `export (const|function|class|interface|type|enum)` 宣言に対して
  「宣言ファイル外の参照」を突き合わせると 51 件が該当し、
  うち「宣言行以外の参照が 0 件」= **6 件** (上記)。
  残りは戻り値型・引数型として同一ファイル内で使われている型 (公開面として妥当)。
  ファイル内でのみ使われていて `export` が不要なものは
  `src/domain/runtime/capabilities.ts:16,23,85,93` (`Tristate` / `DEPENDENCY_NAMES` /
  `deriveAutoModeSafe` / `initialCapabilities`)、
  `src/domain/workspace/prefix-match.ts:18,32` (`separatorFor` / `matchesAtSegmentBoundary`)、
  `src/main/app/origins.ts:19` (`PACKAGED_ORIGIN`)、
  `src/main/app/protocol.ts:147` (`rendererOutputDir`)、
  `src/renderer/src/test-support/capability.ts:40` (`stubCapability`) の **9 件**。
- **リスク/影響**: 2 点ある。
  (1) `pathParts()` は「brand を落として `{namespace, value}` にする」ための `domain` の公開面だが、
  **実際の DTO 組み立て 7 箇所はすべて手で inline している** —
  `src/main/app/folder-service.ts:142,175,281,286,290` /
  `src/main/infra/settings/folder-record.ts:147` /
  `src/main/app/composition-root.ts:119`。
  `domain` に用意した唯一の退化点が使われず、境界を渡る形の組み立てが `app`/`infra` に散っている。
  (2) `isKnownRuntimeId` (`domain`) と `findRuntime` (`src/main/app/validate.ts:95`) は
  「未信頼入力の `runtimeId` を既知 descriptor に照合する」という**同じ役割**を持ち、
  使われているのは後者だけである。docstring が「未信頼入力の検証に使う」と主張する
  `domain` 側が死んでいるため、次に検証を足す実装者がどちらを使うべきか読み取れない。
  6 件はいずれもユニットテストも無いので、AD-023 Consequences「`domain` のテストはモックが
  ゼロになる。入力を渡して戻り値を見るだけで済む」の利点も得られていない。
  **dead export を見る検出器が toolchain に 1 つも無い** — `knip` / `ts-prune` は未導入、
  depcruise の `no-orphans` (`.dependency-cruiser.js:84`) は**モジュール単位**しか見ず
  かつ `severity: 'warn'`、`noUnusedLocals` は `export` された識別子を見ない。
- **推奨アクション**: 6 件を「使う」か「消す」かに振り分ける。
  (a) `pathParts()` を上記 7 箇所の inline 置き換えに使う、
  (b) `isKnownRuntimeId` を `validate.ts` の `findRuntime` に統合して 1 つにする、
  (c) 残る `identityHost` / `isSameNamespace` / `foldersAtLocation` / `sameRuntime` を削除する
  (X-1 / R-2 で必要になった時点で書く。**docstring が名指す利用者が存在しない状態で残さない**)。
  併せて `knip` を devDependency に入れて `pnpm lint` の隣に 1 ステップ足すか、
  depcruise の `no-orphans` を `error` に上げる。
- **根拠**: AD-023 §1 / §4 / Consequences (`domain` のテストはモックゼロ) /
  plan.md:300-303 (「対象が無いルールを書いて『強制した』とは言えない」と同じ論法)
- **scope 根拠**: すべて本 PR の touched files

### [Medium] canonical `Cross-boundary` がコード内で 3 表記に割れている (M-005) (scope: feature)

- **観察**: `docs/glossary.md:83-90` は canonical を **`Cross-boundary`** (日本語「越境」) と定める。
  コード上の表記は 3 通りある。
  - canonical 準拠: `src/domain/workspace/folder.ts:24` `CrossBoundaryStep` /
    `src/domain/workspace/dto.ts:60` `CrossBoundaryRecommendation`
  - `Boundary` 落ち: `src/domain/workspace/resolution.ts:82` `function crossRecommendation(...)`
    (呼び出しは `:173,190`)
  - `Boundary` 落ち: `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:62`
    `function CrossRecommendation(...)` (使用は `:125`)
  - `Boundary` 落ち: `src/renderer/src/features/workspace-folders/labels.ts:50` `CROSS_STEP_LABELS`
    (中身は `Record<CrossBoundaryStep, string>` — 型は canonical、定数名は非 canonical)
- **同種事象探索**: `grep -rn "CrossBoundary\|crossRecommendation\|CrossRecommendation\|crossBoundary" src/`
  → 14 件。canonical 表記 10 件 / 非 canonical **4 件**。
  他の新規 8 語は canonical と一致していた —
  `Location` (`src/domain/workspace/folder.ts:11`) / `WorkspaceFolder` (`:46`) /
  `Reachability` (`:15` = `'reachable' | 'unreachable' | 'blocked'`。glossary の 3 値と一致) /
  `RuntimeDescriptor` (`src/domain/runtime/descriptor.ts:48`) /
  `PathMapping` (`src/domain/runtime/path-mapping.ts:20`) /
  `WslUncPath` (`src/domain/runtime/path-types.ts:38`) はいずれも一致。
- **リスク/影響**: Principle XIV は canonical term の一貫使用を求め、
  glossary の "Detected synonyms (要統一)" (glossary.md:302-310) は
  `Location` について「『置き場所』はパスの意味にも読めるため避ける」のように
  **落ちた語が別の意味に読める**ことを統一の理由に挙げている。
  `Cross` 単独は「交差」「跨る」の一般語であり、
  `Boundary` (`src/domain/workspace/dto.ts:58` の `'native' | 'cross' | 'unknown'`) という
  別の型名も同居しているため、`CrossRecommendation` が
  「`Boundary` に関する推奨」なのか「`cross` 値のときの推奨」なのかが名前から決まらない。
  I-1 / X-4 が同じ判定表を拡張する (plan.md:245-246) ので、表記が割れたまま増える。
- **推奨アクション**: 3 箇所を canonical に揃える —
  `crossRecommendation` → `crossBoundaryRecommendation`、
  `CrossRecommendation` → `CrossBoundaryRecommendationCard` 等 (型名と衝突するため)、
  `CROSS_STEP_LABELS` → `CROSS_BOUNDARY_STEP_LABELS`。
  glossary.md の "Detected synonyms" 表に `Cross-boundary` の行を足して
  「`Cross` 単独表記は避ける」を明記する。
- **根拠**: Constitution Principle XIV / `docs/glossary.md:83-90` / glossary.md:302-310
- **scope 根拠**: 3 ファイルすべて本 PR の touched files

### [Medium] Node / pnpm のバージョン pin が repo に無い (M-006) (scope: feature)

- **観察**: `.nvmrc` / `.node-version` / `.tool-versions` は**いずれも不在**、
  `package.json` に `engines` も `packageManager` も無い
  (`grep -n "engines|packageManager" package.json` → 0 件)。
  `pnpm-workspace.yaml` は `nodeLinker` / `allowBuilds` のみ。
  `.github/workflows/verify.yml:50-51` は
  「`packageManager` フィールドを置いていないので明示する」と**自認したうえで**
  `pnpm/action-setup@v6` に `version: 12` をハードコードしている。
- **同種事象探索**: バージョンを名指す箇所は
  `.github/workflows/verify.yml:38,40` (Node 24 / 26) と `:51` (pnpm 12) の 3 件のみ。
  リポジトリ側に対応する artifact は **0 件**。
- **リスク/影響**: `docs/discovery.md:435-441` は本項目を
  「Node / pnpm のバージョン pin artifact が不在 (一部解消)」として残し、
  「`.nvmrc` / `.node-version` / `engines` / `packageManager` は依然として不在であり、
  Node と pnpm の**バージョン**は pin されていない。**R-1 (プロジェクト初期化を兼ねる) で整備する**」
  「downstream: **convention-reviewer**、implementer (R-1 の前提整備)」と明記している。
  R-1 は完了したが未整備である。
  AD-013 は Electron 同梱 Node とホスト Node の NODE_MODULE_VERSION 差を
  重大な設計論点として扱っており (Principle VII の Why が同じ理由を引く)、
  `pnpm install --frozen-lockfile` は lockfile の一致しか見ないので
  ホストの Node / pnpm が違っても通る。CI だけが正しい版を使い、
  手元の `postinstall` (`electron-builder install-app-deps`) はホストの版で native を焼く。
- **推奨アクション**: `package.json` に `packageManager` (pnpm@12.4.1) と
  `engines.node` (>=24 <27) を足し、`.node-version` (または `.nvmrc`) に 24 を置く。
  `verify.yml:51` の `version: 12` は `packageManager` 由来に切り替えられる
  (`pnpm/action-setup` は `packageManager` を読む) ので、
  バージョンの SSoT を `package.json` に一本化できる。
- **根拠**: `docs/discovery.md:435-441` (downstream に convention-reviewer を名指し) /
  AD-013 / Constitution Principle VII Why
- **scope 根拠**: `package.json` / `verify.yml` は本 PR の touched files。
  discovery.md が R-1 の整備対象と明記している

### [Medium] 対象コードのある依存グラフ規則 4 件に違反サンプルが無い (M-007) (scope: feature)

- **観察**: `.dependency-cruiser.js` の本プロジェクト固有規則は 10 件。
  `tests/rule-fixtures/expected.mjs` が `rules:` で名指すのは 5 件
  (`no-circular` / `agents-not-to-electron` / `domain-not-to-io` /
  `path-module-only-from-path-api` / `ui-not-to-core`)。
  未名指しの 5 件のうち、**現時点で対象コードが存在する**のは次の 4 件である。
  - `.dependency-cruiser.js:231` `electron-only-from-app-and-secrets` —
    対象: `electron` を直接 import する 9 モジュール
  - `.dependency-cruiser.js:249` `ui-not-to-app` — 対象: `src/renderer/` 全体
  - `.dependency-cruiser.js:256` `app-not-to-ui` — 対象: `src/main/` `src/preload/` 全体
  - `.dependency-cruiser.js:215` `domain-not-to-electron` — 対象: `src/domain/` 全体
  (残る `agents-not-to-native` は H-001、`agents-not-to-infra` は
  `src/agents/` が `.gitkeep` のみで対象なし)
- **同種事象探索**: `grep -n "rules:" tests/rule-fixtures/expected.mjs` → 15 行、
  名指された規則名の集合は 5 件。ESLint 側も
  `boundaries/dependencies` の許可行列 (`eslint.config.mjs:238-343`) のうち
  fixture で発火が確認されているのは domain→core 禁止・ui→core 禁止・
  `path-api` 例外・`runtime-infra` 例外の 4 経路で、
  app↮ui と `electron` の policy は未確認。
- **リスク/影響**: AD-025 が「書いてあるのに評価されないルールが実測で 5 件」
  「`^electron($|/)` と書いたルールは 1 件も一致せず黙って死んでいた」と記録し、
  `expected.mjs:1-27` 自身が
  「**ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する**」と書いている。
  この基準に照らすと上記 4 件は未強制である。
  `electron-only-from-app-and-secrets` については本 review で
  `depcruise --output-type json` を取り、グラフ上の解決名が
  `node_modules/electron/index.js` であること、
  `ELECTRON` の正規表現 (`.dependency-cruiser.js:68`) がこれに一致すること、
  9 モジュールすべてが `ELECTRON_ALLOWED` (`:52`) 配下であることまでは確認した —
  **一致はしている。しかし「許可外から呼んだら止まる」側は未実証である。**
  app↮ui は AD-023 §7 の明示的な不変条件であり、
  R-2 以降 renderer と main の往復が増える面でもある。
- **推奨アクション**: 群 (a) の fixture を 4 件足す —
  `src/renderer/src/__rulecheck__/ui-imports-app.ts`、
  `src/main/app/__rulecheck__/app-imports-ui.ts`、
  `src/domain/runtime/__rulecheck__/domain-electron.ts`、
  `src/main/infra/fs/__rulecheck__/electron-outside-allowlist.ts`。
  `expected.mjs` の期待表に `rules` を書き、`pnpm test:rules` の 20 件を 24 件にする。
  ESLint 側は同じ fixture で `boundaries/dependencies` も発火するので二重に取れる。
- **根拠**: `tests/rule-fixtures/expected.mjs:1-27` / AD-025 (a)〜(e) /
  spec.md:496-497 (SC-009 は「違反 0」を、SC-008 は「発火」を別に要求している) / AD-023 §7
- **scope 根拠**: `tests/rule-fixtures/` は本 PR の touched files

### [Low] plan.md / AD-023 が名指すファイル名・モジュール集合と実体が食い違う (L-001) (scope: feature)

- **観察**: 4 件。
  - `plan.md:139` は `src/main/app/folder-picker.ts` を「所在 windows 用のネイティブダイアログ」として
    宣言しているが、**同ファイルは存在しない**。実体は
    `src/main/app/composition-root.ts:98-122` の `pickHostFolder()` に畳まれている
    (`:100-102` に「ネイティブダイアログは `app` レイヤに置く」という理由は書かれている)
  - `plan.md:163` は `.dependency-cruiser.cjs`、AD-023 Consequences
    (`docs/decisions/0023-application-architecture.md:371`) は `eslint.config.ts` と
    `.dependency-cruiser.cjs` を挙げるが、実体は `eslint.config.mjs` と `.dependency-cruiser.js`
  - `plan.md:149` は `features/{runtime-list,workspace-folders,folder-runtime-resolution}/` の
    3 feature を宣言するが、実体は 4 つ —
    `src/renderer/src/features/chat/ChatScreen.tsx` が加わり
    `src/renderer/src/App.tsx:5,22` から配線されている。
    spec.md:561 は「**[ASSUMED]** 本 feature の UI は 3 画面」、plan.md:96 は「画面 3 つ」
  - `src/domain/capability.ts` は plan.md:157-159 の `domain/{runtime,workspace}/` 2 分割に
    入らない `domain` 直下のファイル (置き場所の理由は `:17-21` に記載あり)
- **同種事象探索**: plan.md「Project Structure」が名指す 20 パスを 1 件ずつ存在確認し、
  不一致 **4 件** (上記)。他 16 件は一致。
- **リスク/影響**: `features/chat/` の追加自体は AD-025 / plan.md:231-237 が記録した
  人間判断 (「最初から Element も入れ、チャットの runtime / backend は繋がない」) の帰結であり
  理由は残っている。問題は **spec.md:561 と plan.md:96 / :149 が旧記述のまま**である点で、
  次の feature が「R-1 の画面は 3 つ」を前提に数えると合わない。
  ファイル名の 2 件は accepted ADR の記述と実体の不一致なので、
  **severity の最終判断は `architecture-reviewer` (ADR drift owner) に委ねる** —
  本 reviewer は「名前が指すものが無い」という事実のみを F として記録する。
- **推奨アクション**: plan.md:139 の `folder-picker.ts` 行を
  「`composition-root.ts` に畳んだ」注記に直し、plan.md:163 の拡張子を実体に合わせ、
  plan.md:96 / :149 と spec.md:561 の「3 画面」を 4 に直す
  (`chat` を R-1 の範囲に含めた根拠として AD-025 を参照する)。
  AD-023 は immutable なので、読み替えは AD-024 と同じ形で別 ADR に記録する。
- **根拠**: plan.md:96 / :139 / :149 / :163、spec.md:561、AD-023:371、AD-025 (plan.md:231-237)
- **scope 根拠**: spec / plan は本 PR の touched files。AD-023 の読み替えは out-of-scope 寄り

### [Low] ファイル名規約が 3 系統混在し、SSoT もルールも無い (L-002) (scope: feature)

- **観察**: 同一 `src/` 配下に 3 系統が同居する。
  - kebab-case: `src/domain/**` / `src/main/**` の全 40 ファイル
    (`path-api.ts` / `folder-service.ts` / `wsl-detector.ts` …)
  - PascalCase: `src/renderer/src/App.tsx` / `features/chat/ChatScreen.tsx` /
    `features/runtime-list/RuntimeListScreen.tsx` /
    `features/workspace-folders/WorkspaceFoldersScreen.tsx` /
    `features/folder-runtime-resolution/ResolutionScreen.tsx` (+ `.test.tsx`)
  - camelCase: `features/runtime-list/useRuntimes.ts` / `features/workspace-folders/useFolders.ts`
  一方、生成物側の hook は kebab-case (`src/renderer/src/hooks/use-attachment-src.ts` /
  `use-copy-to-clipboard.ts`)。**同じ「React hook」が 2 系統の綴りで並ぶ。**
  `grep -rniE "kebab|PascalCase|camelCase|ファイル名" docs/ specs/001-.../ .specify/memory/` は
  規約を述べる記述を **0 件**返す。`eslint-plugin-unicorn` の `filename-case` 等も未導入。
- **同種事象探索**: 3 系統 / SSoT 0 件 / lint ルール 0 件。
  ディレクトリ名は全 21 件が kebab-case で一貫している (例外なし)。
  加えて、共有モジュールが 1 feature の内側に置かれ他 feature から
  相対 import されている経路が 4 件ある —
  `features/folder-runtime-resolution/ResolutionScreen.tsx:13,14,23` が
  `../runtime-list/useRuntimes` / `../workspace-folders/useFolders` / `../runtime-list/labels` を、
  `features/workspace-folders/WorkspaceFoldersScreen.tsx:13` が `../runtime-list/useRuntimes` を
  import している。持ち上げ先の自然な候補 (`src/renderer/src/hooks/`) が
  M-001 の生成物除外に入っているため、持ち上げると lint 緩和に巻き込まれる。
- **リスク/影響**: AD-023 Context は
  「**最初のコミットでディレクトリ構成と依存規則が固定される**ため、着手前に決める必要があった」と
  述べ、その 2 つは実際に固定された。**ファイル名だけが固定されていない。**
  AD-023 Consequences の「`ui` の内部構成は規約を課さない」は内部**構成**についての判断なので、
  `renderer` 内が PascalCase/camelCase なのは逸脱ではない。
  しかし「規約を課さない」と「決めていない」は別で、現状は
  R-2 以降の実装者が `features/` に何を置くとき何式で名付けるかを
  既存ファイルから推測するしかない。`useRuntimes.ts` と `use-attachment-src.ts` が
  隣り合っている以上、推測は割れる。
- **推奨アクション**: 1 行で足りる。`docs/domains/ui/charter.md` か `AGENTS.md` に
  「`src/renderer/` の React component は PascalCase、hook は camelCase
  (生成物は上流の綴りに従う)、それ以外の `src/` は kebab-case」を書く。
  機械強制まで要るなら `eslint-plugin-unicorn` の `unicorn/filename-case` を
  `GENERATED_FILES` を除いたパスに掛ける。**0 件のまま残すより明文が 1 行あるほうが安い。**
  cross-feature 共有は M-001 の除外をファイル単位に直したうえで
  `src/renderer/src/hooks/` へ持ち上げるのが筋。
- **根拠**: AD-023 Context / AD-023 Consequences (`ui` の内部構成) /
  Constitution Principle XV (Code identifiers は英語。綴り方式は未規定)
- **scope 根拠**: 本 PR がファイル構成を固定した feature である

### [Low] 未使用の runtime dependency が 1 件残る (L-003) (scope: feature)

- **観察**: `package.json:33` の `@electron-toolkit/preload` は
  `dependencies` (devDependencies ではない) にあるが、`src/` からの import は **0 件**。
  唯一の言及は `src/preload/index.ts:14` のコメント
  「scaffold 既定の `@electron-toolkit/preload` はこれで `module not found` になる」。
  AD-025 が「`@electron-toolkit/preload` は sandbox 下でも動く」は成立しないと訂正し
  (plan.md:253-259)、R-1 は preload を単一 capability に置き換えた。**依存だけが残っている。**
- **同種事象探索**: `depcruise src --output-type json` のグラフから
  `node_modules/<pkg>` に到達する集合を取り、`dependencies` 13 件と突き合わせると
  未到達は 3 件 —
  `@anthropic-ai/claude-agent-sdk` (AD-026 / discovery.md:83 が「依存として入れただけで
  呼び出していない」と**意図的**に記録済み。対象外)、
  `tw-shimmer` (`src/renderer/src/assets/main.css:16` の import で使用。CSS はグラフ外なので偽陽性)、
  `@electron-toolkit/preload` (**真に未使用**)。
- **リスク/影響**: `electron-builder` の `files` / `asarUnpack` が
  `dependencies` を基準に同梱物を決めるため、配布物に不要なパッケージが入る
  (AD-026 の第 1 段階は通っているので現時点の実害はない)。
  depcruise には declared-but-unused を見る規則が無く (`no-non-package-json` は逆方向)、
  検出器が構造的に存在しない。
- **推奨アクション**: `package.json` から `@electron-toolkit/preload` を削除し
  `pnpm install` で lockfile を更新する。M-004 で `knip` を入れる場合は
  未使用依存もそこで一緒に見られる。
- **根拠**: AD-025 (plan.md:253-259) / AD-026 / `src/preload/index.ts:14`
- **scope 根拠**: `package.json` は本 PR の touched files

### [Low] `docs/discovery.md` と Constitution の「R-1 時点の実測値」が HEAD と一致しない (L-004) (scope: feature)

- **観察**: `docs/discovery.md:151-160`「R-1 時点の実測値 (2026-09-15)」と
  `.specify/memory/constitution.md:645-650`「Existing violations summary」は
  `pnpm test` = **11 files / 213 passed**、
  `pnpm depcruise` = **114 modules / 395 dependencies** を記録する。
  本 review で HEAD に対して実行した結果は
  **13 files / 245 passed**、**115 modules / 398 dependencies** である
  (違反 0 / エラー 0 という結論は一致)。
- **同種事象探索**: 6 コマンド中、数値が記録されているのは 2 件。**2 件とも不一致。**
  残る 4 件 (lint / typecheck / check:constitution / test:rules) は
  「違反 0」「ok 10 / 検査対象なし 1」「全件一致」で一致している。
- **リスク/影響**: `docs/discovery.md:11-18` 自身が
  「`convention-reviewer` と `lint-agent` は本ファイルの Tech Stack section を SSoT として
  読むため、記述の鮮度が直接それらの判断に効く」
  「**旧記述を残したままにすると、lint コマンドを「存在しない」と判断して検査が丸ごと飛ぶ**」と
  警告している。今回の不一致は鮮度の問題であって検査が飛ぶ形ではないが、
  Constitution の改定手順 5「既存違反 enumeration」が記録した数値が
  HEAD と一致しない状態は、次の改定時に「何が変わったか」の基準にならない。
- **推奨アクション**: 2 ファイルの数値を HEAD の実測に更新する
  (13 files / 245 passed、115 modules / 398 dependencies)。
  Constitution 側は表現の修正のみなので PATCH bump で足りる。
  **より本質的な案**: 数値を文書に転記する代わりに、
  `pnpm test:rules` と同じ形で「記録値と実測値の一致」を CI の 1 ステップにする。
  転記は必ず腐る。
- **根拠**: `docs/discovery.md:11-18` / `:151-160` /
  `.specify/memory/constitution.md:135` (既存違反 enumeration) / `:645-650`
- **scope 根拠**: 両ファイルは本 PR の touched files

### [Low] `Browse session` を裸の `session` / `sessions` 識別子で表している (L-005) (scope: feature)

- **観察**: `docs/glossary.md:55-62` は `Browse session` を定義し、
  Counterexamples で「`Session` (Claude Code の 1 会話) とは**別概念**である」と明記する。
  型名は canonical に従っている (`src/main/app/folder-service.ts:44` `interface BrowseSession`)。
  一方、値と引数の名前は `Browse` が落ちている。
  - `src/main/app/folder-service.ts:84` `const sessions = new Map<string, BrowseSession>()`
  - `src/main/app/folder-service.ts:251-253` `const session = sessions.get(token)`
  - `src/main/app/validate.ts:141` `sessionNamespace: NamespaceId` (引数名)
  - `src/main/app/validate.test.ts:217` `const session = UBUNTU`
  UI 文言は glossary の要求どおり「セッション」を使っていない
  (`src/renderer/src/features/workspace-folders/labels.ts:76`
  「選択の有効期間が切れました。もう一度開いてください」)。
- **同種事象探索**: `grep -rnE "Session|session" src/ --include=*.ts --include=*.tsx`
  (生成物を除く) → 30 件。canonical 表記 (`BrowseSession` / `browse-session-expired`) 8 件、
  裸の `session` 系 **20 件** (うち 17 件は `validate.test.ts` の同一変数)、
  Electron API 由来 (`webContents.session`、`src/main/app/window.ts:72`) 1 件、
  日本語コメント「ブラウズセッション」1 件。
- **リスク/影響**: 現時点では `folder-service.ts` / `validate.ts` の内部に閉じており
  読み違える余地は小さい。効いてくるのは R-2 以降で、
  `Session` (Claude Code の 1 会話) が同じ `app` レイヤに入り
  `validate.ts` が session 関連の IPC 入力も検証するようになった時点である。
  そのとき `sessionNamespace` はどちらの session か決まらない。
- **推奨アクション**: `sessions` → `browseSessions`、`session` → `browseSession`、
  `sessionNamespace` → `browseNamespace` (または `verifiedNamespace`) に改める。
  3 ファイル / 20 箇所で、型名は既に canonical なので機械的な置換で済む。
- **根拠**: Constitution Principle XIV / `docs/glossary.md:55-62`
- **scope 根拠**: 3 ファイルすべて本 PR の touched files

### [Low] テスト専用モジュールを production コードから import できる (L-006) (scope: feature)

- **観察**: テストは `src/` 内に co-locate する方針 (`vitest.config.ts:8-13`) で、
  テスト専用モジュールが 2 つ `src/` 配下にある。
  - `src/domain/workspace/__fixtures__/runtime.ts`
  - `src/renderer/src/test-support/capability.ts`
  `.dependency-cruiser.js:144` の `not-to-spec` は
  `.spec.` / `.test.` で終わるファイルへの依存を禁じ、
  `:137` の `not-to-test` は `^(specs|tests)` への依存を禁じる。
  **どちらも `src/**/__fixtures__/` と `src/renderer/src/test-support/` に一致しない。**
  現時点の import 元はテストファイルのみ
  (`src/domain/workspace/resolution.test.ts:14` / `ResolutionScreen.test.tsx:11`) で、
  実害は発生していない。
- **同種事象探索**: `grep -rn "__fixtures__|test-support" src/` → 4 件。
  production コードからの参照は **0 件**。
- **リスク/影響**: `src/**` は `electron-vite` のバンドル対象であり、
  production モジュールがこの 2 つに触れれば fake 実装が出荷物に入る。
  `not-to-spec` / `not-to-test` を「同じ目的の規則」として置いた設計に
  1 系統の穴が残っている形で、これは本プロジェクトが避けたいと明言している
  「書いてあるのに届かない」(AD-025) と同じ構造である。
- **推奨アクション**: `.dependency-cruiser.js:144` の `not-to-spec` の `to.path` に
  `(^|/)(__fixtures__|test-support)/` を足す (テストファイル自身は
  `from` 側を `pathNot` で除く)。ついでに `tests/rule-fixtures/` に群 (a) の
  fixture を 1 件足せば M-007 と同じ手当てで発火まで確認できる。
- **根拠**: `.dependency-cruiser.js:137-149` / AD-025 / `vitest.config.ts:8-13`
- **scope 根拠**: `.dependency-cruiser.js` は本 PR の touched files

### [Low] coverage の計測が設定されていない (H カテゴリ) (L-007) (scope: feature)

- **観察**: `vitest.config.ts` に `coverage` の設定が無く、
  `package.json` の devDependencies に `@vitest/coverage-v8` /
  `@vitest/coverage-istanbul` が無い (`@vitest/ui` のみ)。
  `.github/workflows/verify.yml:75-76` の `test` ステップも `pnpm test` を素で呼ぶだけである。
  245 件のテストが何を覆っているかを示す数値が存在しない。
- **同種事象探索**: `find . -name "*.test.*" -not -path "./node_modules/*"` → 13 件。
  `src/domain/` の 11 実装ファイルに対してテストファイルは 3 件
  (`path-api.test.ts` / `registry.test.ts` / `resolution.test.ts`)。
  ただし `isAutoModeAllowed` (Principle III の単一判定点) は
  `src/main/infra/runtime/wsl-detector.test.ts:141,142,406,407` で直接検証されており、
  「重要な純粋関数が未検証」という事象は本 review では **0 件**見つかっていない。
- **リスク/影響**: `docs/discovery.md` / Constitution が「213 passed」のような**件数**で
  検証を記録しており (L-004)、件数は覆っている範囲を表さない。
  AD-023 Consequences が「`domain` のテストはモックがゼロになる」と述べる利点を
  実際に使い切れているかを判定する材料がない。
  本 PR の SC 群に coverage 閾値の要求は無いので**違反ではない**。
- **推奨アクション**: `@vitest/coverage-v8` を入れて
  `vitest.config.ts` に `coverage` の `include: ['src/domain/**']` と text reporter を置き、
  CI の `test` ステップで出力させる。**閾値は置かなくてよい** —
  まず「どこが覆われていないか」が見える状態を作るほうが先である。
- **根拠**: `vitest.config.ts` / `package.json:45-78` / AD-023 Consequences
- **scope 根拠**: 本 PR がテスト基盤を立てた feature である

## 同種事象探索 cascade summary

| 指摘 ID | Grep / 検証コマンド | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `grep -rln "better-sqlite3\|node-pty\|keytar" tests/` | **0** | 該当なし = fixture 不在 |
| H-001 | `.dependency-cruiser.js` の固有規則 vs `expected.mjs` の `rules:` | 10 / 名指し 5 | `.dependency-cruiser.js:179,188,195,202,215,222,231,240,249,256` |
| M-001 | `.prettierrc.yaml` 準拠体裁を持つファイル / `GENERATED_FILES` 配下 23 件 | 1 | `src/renderer/src/lib/utils.ts:1-11` |
| M-001 | `npx eslint --print-config src/renderer/src/lib/utils.ts` | 緩和 7 規則すべて `0` | `eslint.config.mjs:73-77,403-414` / `.prettierignore:11-13` |
| M-002 | `grep -rn "from \"cn\"" src/` | 6 | `components/ui/avatar.tsx:2` `button.tsx:3` `dialog.tsx:2` `skeleton.tsx:1` `textarea.tsx:2` `tooltip.tsx:4` |
| M-002 | `grep -rln "@/lib/utils" src/` | 19 | `components.json:16` の宣言と一致する側 |
| M-003 | `grep -rn "MAX_DIR_ENTRIES\|MAX_DISPLAY_NAME_LENGTH\|MAX_PATH_VALUE_LENGTH" src/` | 定義 6 / 重複 3 組 | `app/validate.ts:21,22,24` / `infra/settings/folder-record.ts:29,32` / `infra/fs/wsl-fs.ts:29` |
| M-003 | `hasControlCharacter` の実装比較 | 同一実装 2 | `app/validate.ts:26-32` / `infra/settings/folder-record.ts:34-40` |
| M-004 | 全 export の宣言ファイル外参照突き合わせ (51 件中) | **6** | `path-api.ts:232` / `path-types.ts:151,156` / `namespace.ts:96` / `registry.ts:39` / `descriptor.ts:65,89` |
| M-004 | `{ namespace: X.namespace, value: X.value }` の inline | 7 | `folder-service.ts:142,175,281,286,290` / `folder-record.ts:147` / `composition-root.ts:119` |
| M-005 | `grep -rn "CrossBoundary\|crossRecommendation\|CrossRecommendation" src/` | 14 (非 canonical **4**) | `resolution.ts:82,173,190` / `ResolutionScreen.tsx:62,125` / `labels.ts:50` |
| M-005 | 新規 glossary 8 語の canonical 一致確認 | 7 / 8 一致 | `folder.ts:11,15,46` / `descriptor.ts:48` / `path-mapping.ts:20` / `path-types.ts:38` |
| M-006 | 版 pin artifact の存在確認 (`.nvmrc` / `.node-version` / `engines` / `packageManager`) | **0** | `.github/workflows/verify.yml:38,40,50-51` のみが版を名指す |
| M-007 | 対象コードを持つ未 fixture 規則 | 4 | `.dependency-cruiser.js:215,231,249,256` |
| M-007 | `electron` 直接 import の実体 (グラフ JSON) | 9 | `main/app/{composition-root,validate,origins,ipc,protocol,window}.ts` / `main/index.ts` / `preload/index.ts` |
| L-001 | plan.md「Project Structure」の 20 パスの存在確認 | 不一致 4 | `plan.md:96,139,149,163` / `spec.md:561` / `AD-023:371` |
| L-002 | `grep -rniE "kebab\|PascalCase\|camelCase\|ファイル名" docs/ specs/ .specify/memory/` | 規約記述 **0** | SSoT 不在 |
| L-002 | cross-feature の相対 import | 4 | `ResolutionScreen.tsx:13,14,23` / `WorkspaceFoldersScreen.tsx:13` |
| L-003 | グラフ到達集合 vs `dependencies` 13 件 | 真に未使用 1 | `package.json:33` |
| L-004 | `pnpm test` / `pnpm depcruise` の実測 vs 記録 | 不一致 2 | `docs/discovery.md:151-160` / `constitution.md:645-650` |
| L-005 | `grep -rnE "Session\|session" src/` (生成物除く) | 30 (裸 20) | `folder-service.ts:84,251-253` / `validate.ts:141` / `validate.test.ts:217` |
| L-006 | `grep -rn "__fixtures__\|test-support" src/` | 4 (production から 0) | `.dependency-cruiser.js:137-149` に一致する規則なし |
| L-007 | `find . -name "*.test.*"` / devDependencies の coverage パッケージ | 13 / **0** | `vitest.config.ts` / `package.json:45-78` |

## Verdict

- Critical: 0
- High: 1
- Medium: 7
- Low: 7

**lint コマンド由来の Critical / High は 0 件である。**
`pnpm lint` / `pnpm typecheck` / `pnpm depcruise` / `pnpm check:constitution` /
`pnpm test` / `pnpm test:rules` の 6 コマンドすべてが exit 0 で完了し、1 件も指摘を出さない。
本 reviewer の finding はすべて「検証が構造的に届いていない範囲」から出したものであり、
内訳は次の 3 系統である。

1. **規則は書かれているが発火が未確認** — H-001 / M-007 / L-006
2. **緩和の適用範囲が広すぎて手書きコードを巻き込んでいる** — M-001
3. **その種類の不整合を見る検出器が存在しない** — M-002 / M-003 / M-004 / M-005 / M-006 /
   L-002 / L-003 / L-004 / L-005 / L-007
