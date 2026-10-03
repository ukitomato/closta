---
status: active
generated_by: /spec-gate scan
generated_at: 2026-09-12T11:27:40Z
reviewed_at: 2026-09-15
revision: 3
---

# Project Discovery

> **revision 3 (2026-09-15)**: R-1 (フォルダ登録とランタイム検出) の実装が完了し、
> **「detected: none」はすべて成立しなくなった。** Tech Stack と Build / Test / Lint を実測値に置き換えた。
> `convention-reviewer` と `lint-agent` は本ファイルの Tech Stack section を SSoT として
> 読むため、記述の鮮度が直接それらの判断に効く。
> **旧記述を残したままにすると、lint コマンドを「存在しない」と判断して検査が丸ごと飛ぶ。**
>
> revision 2 (2026-09-13) までの記述は履歴として下の表に残す。
> 初版は 2026-09-12 の `/spec-gate scan` によるスナップショットである。

## revision 3 での主な更新

| 項目 | revision 2 (2026-09-13) | 現在 (2026-09-15) |
|---|---|---|
| Project type | unknown (greenfield / 未着手) | **Electron デスクトップアプリ** |
| アプリケーションコード | **0 行** | `src/` に **89 ファイル / 約 14,000 行** (TypeScript / TSX) |
| Primary language | detected: none | **TypeScript 5.9.3** |
| Frameworks | detected: none | **Electron 39 / electron-vite 5 / Vite 7 / React 19 / Tailwind CSS 4 / assistant-ui 0.15** |
| Package manager | lockfile 不在 | **pnpm 12** (`pnpm-lock.yaml`。`nodeLinker: hoisted`) |
| Build / Test / Lint | detected: none | **すべて存在する**（下の Build / Test / Lint section を参照） |
| git | コミット 17 本、追跡 149 ファイル | **`main` は 10 本**、追跡 374 ファイル、branch `001-runtime-folder-registration-runtime-detection`。**R-1 の変更はまだ未コミット** |

## revision 2 での主な更新

| 項目 | 初版 (2026-09-12) | revision 2 (2026-09-13) |
|---|---|---|
| git | コミット 1 本、追跡 1 ファイル、remote 未設定 | コミット 17 本、追跡 149 ファイル、remote `ukitomato/closta` |
| `.gitignore` | 不在 | 配置済み |
| `.claude/` `.specify/` | git 未追跡 (risk) | 追跡済み |
| `docs/` | 空ディレクトリ | 25 ファイル (ADR 14 / charter 5 / glossary / roadmap / prompts / verify-report) |
| Constitution | placeholder テンプレート | **`status: active` v1.0.0**、15 Principle |
| `/spec-gate bootstrap` | 未実行 | 実行済み (prefix `cl`)。wrapper 9 / agent 13 |
| feature ID | `F-001`〜`F-016` | `R-*` / `X-*` / `O-*` / `I-*` / `D-*` に再定義 |
| Python 依存 | 未検出 | `python3` 必須。Windows では `PYTHONUTF8=1` も必須 |
| pnpm | 未インストール | 12.4.1。`pnpm-workspace.yaml` に `nodeLinker: hoisted` |


## Tech Stack

### Top-level

- **Project type**: **Electron デスクトップアプリ** (revision 3 で確定)。`electron-vite` の公式 scaffold を出発点に、`app` / `ui` / `agents` / `infra` / `domain` の 5 レイヤで構成する ([AD-023](decisions/0023-application-architecture.md))。
- **Primary language**: **TypeScript 5.9.3**。`src/` に 89 ファイル / 約 14,000 行 (`.ts` / `.tsx`)、`scripts/` に検証スクリプト 5 ファイル (`.mjs`)。
  `tsconfig.json` は solution-style で、`tsconfig.node.json` (main / preload / domain / agents) と `tsconfig.web.json` (renderer) の 2 project を参照する。
  **root は `files: []` なので lint の解決器を向けてはならない** — 向けるとどのファイルも project に属さず `paths` が引かれない ([AD-025](decisions/0025-workspace-folder-carries-location.md))。
  以下は**プロダクト外**の vendored tooling である:
  - Bash: `C:\dev\closta\.claude\skills\spec-gate\scripts\` (3 ファイル, 1213 行) + `scripts\tests\` (5 ファイル, 440 行)
  - PowerShell: `C:\dev\closta\.specify\scripts\powershell\` (5 ファイル)
- **Frameworks**: **Electron 39 / electron-vite 5 / Vite 7.3 / React 19 / Tailwind CSS 4 / `@assistant-ui/react` 0.15 / zustand 5**。
  assistant-ui は **design system と element を入れただけで、チャットの runtime / backend は繋いでいない** (AD-025 §6 (b))。
- **Package manager**: **pnpm 12** (`pnpm-lock.yaml` present)。`pnpm-workspace.yaml` に `nodeLinker: hoisted` を置く。
  **Electron のパッケージングツールチェーンが `node_modules` の物理配置を要求するため必須**であり、`packages:` キーは持たない (monorepo ではない)。
- **`.gitignore`**: 配置済み。pnpm / Electron / Vite / electron-builder / better-sqlite3 の生成物、`.env` 系と鍵ファイル (Principle V の誤コミット経路)、SQLite ファイル、エディタ / OS 由来ファイルを除外。
- **Git**: branch `001-runtime-folder-registration-runtime-detection` (base `main`)、`main` のコミット 10 本、追跡ファイル 374 件、remote `https://github.com/ukitomato/closta.git` (未 push)。
  **R-1 の変更はまだ未コミットである。**

### Declared (PLAN.md §2「技術スタック（確定）」— 宣言値と on-disk の対照)

以下は `C:\dev\closta\PLAN.md:65-101` が「確定」と宣言する意図スタック。

**revision 3 での訂正**: 初版と revision 2 は `on-disk` を全行 `absent` としていたが、
R-1 の実装で成立しなくなった。**`on-disk` 列を実測値に置き換えた。**
present の行にも「入っているが使っていない」ものがあるので、括弧内の限定まで読むこと。

| レイヤ | 宣言値 | 根拠 | on-disk |
|---|---|---|---|
| デスクトップシェル | Electron (最新安定版追随) | PLAN.md:71, AD-001 (L106) | **present** (39.8.10) |
| ホスト Node.js | 24 (Active LTS) | PLAN.md:72, AD-013 (L252) | **present** (24.15.0。CI は 24 / 26) |
| 言語 | TypeScript (strict) | PLAN.md:73 | **present** (5.9.3) |
| UI | React + assistant-ui (Elements) | PLAN.md:74, §4 | **present** (React 19 / `@assistant-ui/react` 0.15)。**runtime / backend は未接続** |
| スタイル | Tailwind + assistant-ui design system | PLAN.md:75 | **present** (Tailwind 4)。design system は element に付随する形で導入 (AD-025 §6 (b)) |
| 状態管理 | Zustand (renderer のみ) | PLAN.md:76 | **present** (5) |
| 仮想化 | `@tanstack/react-virtual` | PLAN.md:77 | **present** (3.14.13)。R-3 で導入。`thread.aui.tsx` の仮想化パス (件数 > 40) で使用 ([AD-033](decisions/0033-assistant-ui-elements-introduction-cost.md)) |
| エージェント連携 | `@anthropic-ai/claude-agent-sdk` (TS, V1 `query()`) | PLAN.md:78, AD-002 (L134) | **present** (0.3.270)。**依存として入れただけで呼び出していない** (AD-026) |
| supervisor | Electron `utilityProcess` (単独起動可能) | PLAN.md:79, AD-006/AD-010 | **present** (X-5)。**単一の `utilityProcess`** (`src/agents/supervisor.ts`) が調停役スレッドとなり、セッションごとに `worker_threads` の Worker (`src/agents/sdk-agent-session.ts`) を起こす ([AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md))。main は `utilityProcess.fork(<supervisor>, ['--worker-entry=<worker>'])` で起こし、どちらのパスも electron-vite の `?modulePath` で得る。単独起動は同じ 2 ファイルを `node <supervisor> --worker-entry=<worker>` で起こし、標準入出力で話す |
| ターミナル | xterm.js + node-pty | PLAN.md:80 | absent (optional scope) |
| 秘密保管 | Electron `safeStorage` (OS キーチェーン) | PLAN.md:81, AD-011 (L229) | **present** (X-3 で導入)。`src/main/infra/secrets/safe-storage.ts` が `api-key`/`oauth-token` の秘密を seal し参照値のみ保持 |
| 永続化 | SQLite (better-sqlite3) | PLAN.md:82 | absent (I-1 で入る)。R-1 の設定は JSON ファイル |
| コンテナ制御 | Docker CLI 呼び出し | PLAN.md:83, AD-012 (L243) | absent (I-1 で入る)。**docker を名指せるモジュールは 0 件** (検証項目 4) |
| パッケージング | electron-builder (`asarUnpack` 必須) | PLAN.md:84, AD-009 (L210) | **present** (26.15.3)。`asarUnpack` 動作確認済み (AD-026) |
| Lint | ESLint + `no-restricted-imports` | PLAN.md:85 | **present** (ESLint 9 + `eslint-plugin-boundaries` + dependency-cruiser 18) |
| テスト | Vitest (unit) / Playwright (E2E) | PLAN.md:86 | **Vitest present** (5)。**Playwright present** (1.63。X-2 で導入。IME E2E 実走済) |
| パッケージマネージャ | pnpm | PLAN.md:795 | **present** (12.4.1) |

宣言されたランタイム抽象 (AD-003, PLAN.md:147-160): `DirectRuntime` / `WslRuntime` / `Win32Runtime` / `DockerRuntime`。

**revision 3**: R-1 で実装したのは `Win32Runtime` と `WslRuntime` の**検出**である
(`AgentRuntime.launch` は未実装)。`DockerRuntime` は I-1、`DirectRuntime` は OPT-mac。

branded type は AD-004 の 2 つ (`HostPath` / `RuntimePath`) から
**3 名前空間** (`HostPath` / `RuntimePath` / `WslUncPath`) に一般化した。
WSL 側の識別子は**ディストロ粒度**で持つ — `\\wsl.localhost\Ubuntu\` と
`\\wsl.localhost\Debian\` は別のファイルシステムであり、1 つの brand にすると
一方のパスを他方のランタイムに渡せてしまう ([AD-025](decisions/0025-workspace-folder-carries-location.md))。

### Per workspace (monorepo only)

**該当なし。** workspace 数 = **0**、sampling cap (20) 未適用、skipped workspace = なし。

**revision 2 注記**: `pnpm-workspace.yaml` は存在するが、これは pnpm 10 以降における**設定ファイル**
であって monorepo 定義ではない。`packages:` キーを持たず、内容は Electron 互換のための
`nodeLinker: hoisted` のみ。`package.json.workspaces` / `turbo.json` / `nx.json` / Cargo workspace /
`go.work` はいずれも 0 件。PLAN.md も monorepo を宣言しておらず、P-1 / P-9 (L571, L606) は単一パッケージ内の `runtime/` / `supervisor/` ディレクトリ層に対する ESLint 制約として記述されている。

**revision 3 注記**: PLAN.md が名指す `runtime/` / `supervisor/` は**実ディレクトリとして存在しない**。
[AD-023](decisions/0023-application-architecture.md) のレイヤ構成では
`supervisor` の実体が `src/agents/`、プラットフォーム分岐の許可先が `src/main/infra/runtime/` である。
正本は Constitution であり、検証条件は
[AD-024](decisions/0024-constitution-verification-paths.md) #1 / #6 / #8 で追随済み。
**PLAN.md の記述を根拠に `supervisor/` を探すと 0 件ヒットになり、「検証対象が無い」と誤って結論する。**

---

## Build / Test / Lint

**すべて存在する** (revision 3)。`convention-reviewer` / `lint-agent` / `test-agent` はこの表を正とする。
以下はいずれも CI (`.github/workflows/verify.yml`) の 1 ステップでもある。

**CI / 人間は `pnpm` 列、agent は「agent 用」列を使う。**
`pnpm X` / `npx X` は **pnpm + シェル + 実体の 3 プロセス**を起こす。
このマシンは常駐 security スタックがプロセス生成を hook しており
**1 spawn あたり 400〜2,400ms** かかる (`npm -v` 2,273ms / `npx -v` 2,398ms)。
実測で lint 13.2s → 7.4s、typecheck 7.5s → 4.1s。
`package.json` の `scripts` は SSoT なので**変更しない** — agent が読む側だけ直接形にする。

同じ理由で `.claude/settings.json` の `env` に `LANG` と `WINELOADERNOEXEC` を置いている。
Git Bash の profile が内部で起こす subprocess (`locale -uU` / `git --exec-path`) を短絡させる
ためのもので、**挙動は短絡前と同一**。消すと bash の起動が 3.5s から 6.7s に戻る。
`PYTHONUTF8` は `gate_common::truncate_subject` が呼ぶ python3 の出力が cp932 になり
commit subject が壊れるのを防ぐためである。

| 種別 | コマンド (CI / 人間) | agent 用 (`node` 直接) | 何を見るか |
|---|---|---|---|
| **lint** | `pnpm lint` | `node node_modules/eslint/bin/eslint.js --cache .` | ESLint 9 (`eslint.config.mjs`)。`eslint-plugin-boundaries` によるレイヤ間の許可行列と、`no-restricted-imports` による標準モジュールの直接 import 禁止 |
| **型検査** | `pnpm typecheck` | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` と `… -p tsconfig.web.json …` の 2 本 | `tsconfig.node.json` と `tsconfig.web.json` の 2 project を順に `tsc --noEmit` |
| **依存グラフ** | `pnpm depcruise` | `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | dependency-cruiser 18 (`.dependency-cruiser.js`)。**推移的な到達**と循環、`require()` 形式 |
| **Constitution 検証** | `pnpm check:constitution` | `node scripts/constitution/check.mjs` (同一) | `scripts/constitution/check.mjs`。21 項目 (X-5 で 18〜20、O-2 で 21 を追加)。許可リストの正本は `scripts/constitution/allowlists.mjs`。**項目 21 は `docs/ui-coverage.md` と SDK の型の機械照合 (Principle XII / AD-044)** — SDK (`@anthropic-ai/claude-agent-sdk`) の版を上げる PR は、domain を問わず対応表を同じ PR で直す (手順は対応表の冒頭) |
| **ユニットテスト** | `pnpm test` | 全件 `node node_modules/vitest/vitest.mjs run` / 絞り込み `node node_modules/vitest/vitest.mjs related --run <files…>` | Vitest 5。2 project (node / renderer)。いずれも `pool: 'threads'` |
| **ルール検証** | `pnpm test:rules` | `node scripts/rules/run.mjs` (同一)。**code-gate では実行しない** — 下記参照 | `scripts/rules/run.mjs`。**違反サンプルを検査対象へ展開し、期待した検出器が発火することを確かめる** |
| **E2E の型検査** | `pnpm exec tsc --noEmit -p e2e/tsconfig.json` (`package.json` に script は置かない。CI の e2e job が実行) | `node node_modules/typescript/bin/tsc --noEmit -p e2e/tsconfig.json` | `e2e/` は src グラフ外で上の型検査の対象外。Playwright は型検査せずに transpile するため、E2E の型の崩れはここでしか見えない (X-5 code-gate convention M-005) |
| **E2E** | `pnpm exec playwright test -c playwright.config.ts` (全) / `… e2e/ime.spec.ts …` (IME のみ) | `node node_modules/@playwright/test/cli.js test -c playwright.config.ts` | Playwright + Electron (`_electron.launch`。X-2 / AD-038)。**要ビルド** (`out/main/index.js` を起動)。IME E2E は独立ブラウザ不要。スクショ比較は同梱フォント + 承認済み基準画像が前提。`e2e/` は src グラフ外 (AD-038 D2) なので lint/depcruise/typecheck の対象外 (専用 `e2e/tsconfig.json`) |
| **実機計測** (O-1) | `CLOSTA_PERF_FOLDER=<作業フォルダの表示名> CLOSTA_PERF_RUNTIME=<ディストロ名> pnpm exec playwright test -c playwright.perf.config.ts` (**人間用。CI に載せない**) | — (**agent は実行しない。利用者の明示的な指示があるときだけ** `node node_modules/@playwright/test/cli.js test -c playwright.perf.config.ts`) | 実 `claude` 10 本で入力の滑らかさを測る (`perf/real-sessions.spec.ts`。charter KPI「並列時の滑らかさ」/ O-1 SC-005)。**要ビルド・実行中の WSL・既定 Provider・トークン消費**。環境変数: `CLOSTA_PERF_FOLDER` (作業フォルダの**表示名**。パスではない) / `CLOSTA_PERF_RUNTIME` (ディストロ名) (必須) / `CLOSTA_PERF_PROMPT` (既定は読み取り専用の tool を繰り返すプロンプト) / `CLOSTA_PERF_PROVIDER` / `CLOSTA_PERF_MODEL` (Provider とモデルの表示名の一部。未指定なら既定。モデルを選ぶには Provider のモデルカタログが要る) / `CLOSTA_PERF_MIN_MESSAGES` (有効な回の下限。既定 30。有限の正の数でなければ失敗で止まる。使った値は出力の `minMessages` / `thresholdOverridden` に出る)。`CI` または `CLOSTA_E2E` があると失敗で止まる。出力に `teardown=killed` が出た回は WSL 内に `claude` が残りうるので `ps` で確かめる。実行後は outputDir (`%TEMP%\closta-perf-results\`) に `.last-run.json` 以外が無いことを確かめる (O-1 quickstart V-3)。判定の純関数のテスト (`perf/run-judgement.test.ts`) は Vitest の node project に含まれる。型検査は `node node_modules/typescript/bin/tsc --noEmit -p perf/tsconfig.json` (CI の e2e job も実行) |
| **ビルド** | `pnpm build` | — (agent は実行しない) | 型検査 → `electron-vite build` |
| **パッケージング** | `pnpm build:win` | — (agent は実行しない) | `scripts/build/package.mjs` 経由で `electron-builder` ([AD-026](decisions/0026-packaging-first-pass.md)) |
| **整形** | `pnpm format` | — (agent は実行しない) | Prettier。**markdown は対象外** (`.prettierignore`。全角の表が崩れ、コードフェンスからセミコロンが消える) |

### `test:rules` を code-gate で実行しない理由

**`pnpm test:rules` は code-gate の auto-fix loop から呼ばない。pr-gate で 1 回と CI に任せる。**

- 1 回 **263 秒**かかる。code-gate Phase 3 は auto-fix loop の TAIL なので
  **毎 iteration 再実行される** (`--max-iter` 既定 3 → 最大 4 回)
- 検証内容は「ルール定義が生きているか」であり、**ルール定義を変えない限り結果は変わらない**。
  iteration ごとに実装コードが変わっても答えは同じなので、繰り返す価値がない
- **CI が毎 PR で実行している** (下記 CI/CD の verify ステップ)。カバレッジは落ちない
- **pr-gate Phase 0 が Round 1 で 1 回通す** (`cl-pr-gate/SKILL.md`)。
  Round 2 以降は `eslint.config.mjs` / `.dependency-cruiser.js` /
  `scripts/constitution/**` / `tests/rule-fixtures/**` / `scripts/rules/**` が
  直前 round 以降に変わったときだけ再実行する
- **他の検出器と並行させない。** 違反サンプルを `src/` 配下へ一時展開するため、
  同時に走った lint / depcruise が展開物を実コードの違反として拾う。
  同種の実行を 2 つ重ねると一方の後始末が他方の展開物を消し、
  **「ルールが死んでいる」と誤診する** (実測で 2 度)

### ユニットテストの実行 scope (code-gate)

- **iteration 途中** (`must_fix > 0` のまま次の iter に進む回): `vitest related --run <touched files>`
- **最終 iteration** (`must_fix == 0` になった回): **全件** `vitest run`。
  subset だけで PASS にしてはならない — touched files の外側に回帰が出る
- `.gate-verdict-code.json` の `tracks["test-agent"].scope` に
  `touched-files` / `full` のどちらで走ったかを必ず記録する

### lint / 検証が「違反 0」でも足りない理由

**ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する。**
R-1 の実装中に、書いてあるのに 1 件も一致しないルール・評価されない設定・
「未知」に落ちて判定を免れる依存が**実測で 5 件**見つかった (AD-025)。
どれも「違反 0 件」と区別がつかない。

`pnpm test:rules` が 21 件の違反サンプルを**1 件ずつ展開して**期待表と突き合わせる (AD-027)。
**機械検証で捕まらない経路が 2 件あり、それも期待表に `none` として明記してある** —
捕まらない経路を列挙せずに「全数検出」と言うと、検証の主張そのものが嘘になる。

**「全件一致」の範囲を正確に読むこと。** 照合されるのは期待表が**宣言した**検出器と規則だけである。
`check.mjs` の 11 項目のうち発火確認があるのは 5 項目、`pending` 1 項目、**確認なし 5 項目**である
(pr-gate Round 2 の platform-boundary H-005)。「21 件一致」は**宣言した期待が満たされた**ことを
示すのであって、検証項目の全数が確かめられたことを示さない。

### R-1 時点の実測値 (2026-09-16 / AD-027 後)

| 検証 | 結果 |
|---|---|
| `pnpm lint` | 違反 **0** |
| `pnpm typecheck` | エラー **0** |
| `pnpm depcruise` | 違反 **0** (118 modules / 416 dependencies) |
| `pnpm check:constitution` | 違反 **0** (ok 10 / 検査対象なし 1) |
| `pnpm test` | 15 files / **264 passed** |
| `pnpm test:rules` | 期待表と**全件一致** (21 件) |

> **訂正 (2026-09-16 / AD-027 / pr-gate Round 2)**
>
> 本表は当初 2026-09-15 時点の値 (114 modules / 395 dependencies、11 files / 213 passed、
> 違反サンプル 20 件) を記録していた。**そのうち「20 件すべて一致」は 1 行が偽だった** —
> `wsl-args-array` が期待していた項目 `#1` は、`check.mjs` が全項目の見出しを状態に関わらず
> 印字するため**構造的に常に満たされていた**。AD-027 で 1 件ずつ展開する形に改め、
> `#N` を `[VIOLATE] #N` で照合するようにし、期待を訂正した。
>
> 数値の変化 (modules / dependencies / test 件数) は R-1 の実装とゲート対応でコードが増えたためである。

正本は [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) の
`## Existing violations summary` である。

### vendored tooling の self-test (プロダクト外)

| 種別 | コマンド | 場所 |
|---|---|---|
| tooling test | `bash .specify/scripts/tests/run-all.bash` | `gate-common.sh` の self-test (cascade-enforce / spec-id-allocate / truncate-subject / verdict-validate / viewpoint-coverage) |

**プロダクトのテストではない。** `pnpm test` とは別物として扱う。

### まだ宣言だけのもの

- **E2E**: Playwright ([AD-038](decisions/0038-e2e-screenshot-harness.md))。**X-2 で導入・実走済** — `@playwright/test`
  (1.63) を devDependency に追加、app 側 E2E stub フック (`src/main/app/e2e-capability.ts`。`!app.isPackaged && CLOSTA_E2E==='1'`
  で production-inert / T030) を実装。**IME E2E (`e2e/ime.spec.ts`) は local で 3/3 緑** (idle / running+queue / 変換中マウス送信)。
  `e2e/` は src の lint/型グラフから分離済 (AD-038 D2)。Principle VIII の Automated 2 項目はここに乗る (grep でなく E2E が正本。AD-024 #18)。
  **日本語スクリーンショット比較も local 緑** — 同梱フォント Noto Sans JP (OFL。`e2e/fonts/NotoSansJP-Regular.ttf`) を
  **FontFace API + CSSOM で CSP 非破壊注入** (アプリの `style-src 'self'` が addStyleTag を弾くため。実走で発覚し修正)、基準画像
  `composer-fullwidth-win32.png` と比較。CI は `verify.yml` の `e2e` job に authored (IME 3 + screenshot 1)。**残るは人間の実機
  IME 目視と基準画像の最終 aesthetic 承認 (quickstart V-1〜V-5) のみ**
- **SQLite**: better-sqlite3。未導入 (I-1 の `sessionStore` で入る)
- **PTY**: 未導入 (optional scope)

---

## Flavors (B-4)

flavor artifact (`firebase.json` / `app.yaml` / `serverless.yml` / `wrangler.toml` / `flutter_flavorizr` / `.env*`) は **0 件**。

- flavor: `dev` — **absent: true**, reason: "flavor 定義ファイルが repo に存在せず、`.env.dev` も build config も不在"
- flavor: `stg` — **absent: true**, reason: "同上。PLAN.md にも stg 環境の概念が存在しない"
- flavor: `prod` — **absent: true**, reason: "同上。配布は D-1 (M5) に置かれており未着手"

補足 (observation): 本プロダクトにおける「環境差分」の相当物は build-time flavor ではなく **runtime 値** として設計されている。`ProviderProfile` (PLAN.md:396-405) は `backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry'` と `configDir` をアプリに登録する値であり、「本番用 Bedrock と検証用 Bedrock」を同時登録できる (L409-410)。`AgentRuntime` も同様に「検出結果から生成される値、シングルトンではない」(AD-003, L156-158)。したがって flavor 検出の枠組みは本プロジェクトには構造的に適用されない見込み。

---

## CI/CD

**revision 3: 構築済み。** 初版と revision 2 の「none detected」は成立しない。

- **Provider: GitHub Actions.**
- ワークフロー: [`.github/workflows/verify.yml`](../.github/workflows/verify.yml) の 1 本 (`verify`)。
  `push` (main) と `pull_request` で走る
- **ランナーは `windows-latest`。** R-1 の検証対象の大半が Windows 固有である
  (`wsl.exe` の呼び出し面、UNC 経路、ドライブレター、パス正規化) ため、
  Linux ランナーで回すと「通ったが実機の条件を見ていない」状態になる
- Node マトリクス: **24 (Active LTS。必須)** と **26 (Current。`continue-on-error`)**
  ([AD-013](decisions/0013-node-and-electron-versioning.md))
- ステップ: install → lint → typecheck → depcruise → check:constitution → test → **test:rules** → build。
  **1 検証 1 ステップ**にしてある (まとめるとどれが落ちたかログを読まないと分からない)

### CI に載っていないもの

| 対象 | 理由 |
|---|---|
| Principle VIII の Automated (composer の IME テスト / 日本語スクリーンショット比較) | (A) は composer が無く**対象が無い**、(B) は R-2 の E2E 基盤に相乗りする ([AD-024](decisions/0024-constitution-verification-paths.md) #18)。**CI が緑であることは本 Principle について何も示さない** |
| インストーラ生成 | FR-043 は「1 回通す」ことを求めており毎回は求めていない。R-1 では手元で 1 回通し、結果を [AD-026](decisions/0026-packaging-first-pass.md) に記録した |
| 実機依存の計測 (SC-004) / 停止中ディストロの不起動 (SC-005) | ランナーに WSL が無い。quickstart V-1〜V-7 が担う |

---

## Directory Map (depth=3)

```
.
├── .claude/                                  # Claude Code 設定。84 ファイル。git 追跡済み
│   ├── agents/                               # subagent 13 件 (generic reviewer 5 / actor 3 /
│   │                                         #   optional 3 / discovery-scanner / platform-boundary-reviewer)
│   ├── skills/cl-*/                          # daily workflow wrapper 9 種 (prefix: cl)
│   └── skills/                               # vendored skill 群
│       ├── spec-gate/                        # spec-driven-gating-workflow v0.2.0 (MIT, ukitomato)
│       │   ├── references/                   #   commands/ subagents/ wrappers/ docs-templates/ lang/ 他
│       │   └── scripts/                      #   gate-common.sh (844行) + spec-resolve / status-transition + tests/
│       └── speckit-*/                        # Spec Kit slash command skill 10 件 (SKILL.md のみ)
├── .specify/                                 # Spec Kit 足場 + spec-gate。36 ファイル。git 追跡済み
│   ├── extensions/agent-context/             # agent-context 拡張 v1.0.0 (bash + powershell スクリプト同梱)
│   ├── integrations/                         # claude.manifest.json / speckit.manifest.json
│   ├── memory/                               # constitution.md — **status: active v1.0.0、15 Principle**
│   ├── scripts/powershell/                   # check-prerequisites / common / create-new-feature / setup-plan / setup-tasks
│   ├── templates/                            # spec / plan / tasks / checklist / constitution テンプレート
│   └── workflows/speckit/                    # workflow.yml (specify→plan→tasks→implement)
├── docs/                                     # 25 ファイル。decisions/ 14 ADR、domains/ 5 charter、
│                                             #   glossary / roadmap / prompts / discovery / verify-report
├── CLAUDE.md                                 # 188B。SPECKIT マーカーのみ、実質「PLAN を読め」の 1 行
└── PLAN.md                                   # 56.5KB / 905 行。**唯一の git 追跡ファイル**。プロジェクト憲章
```

存在しない主要ディレクトリ: `src/`, `specs/`, `test/`, `.github/`, `node_modules/`, `.claude/commands/`。

### revision 3 で加わったディレクトリ

上の Map は初版 (2026-09-12) のスナップショットである。R-1 の実装で以下が加わった。

```
.
├── .github/workflows/verify.yml   # CI (SH-022)
├── src/
│   ├── domain/                    # 型・パス API・純粋関数。**I/O を持たない**
│   │   ├── runtime/               #   名前空間 / パス型 / パス API / capabilities / DTO
│   │   └── workspace/             #   フォルダ / 登録簿 / 到達可能性 / 解決 / 接頭辞照合
│   ├── agents/                    # supervisor の実体。**Electron 非依存**。SDK 呼び出しと spawn 主体
│   │                              #   (R-2 enumerate / R-3 read-transcript / X-1 session-core・sdk-agent-session)
│   ├── main/
│   │   ├── app/                   #   Electron の組み立て。IPC / 検証 / 合成ルート / store / spawner
│   │   └── infra/                 #   OS 資源の境界。runtime/ fs/ settings/
│   ├── preload/                   # 単一 capability。require は `electron` のみ
│   └── renderer/src/              # UI。features/ 配下に画面ごとのフォルダ
├── scripts/
│   ├── constitution/              # 検証スクリプトと許可リストの正本
│   ├── rules/                     # ルール検証ランナー (test:rules)
│   └── build/                     # パッケージングのラッパ (AD-026)
├── tests/
│   ├── setup/                     # 単体テスト基盤の検証
│   └── rule-fixtures/             # 違反サンプルと期待表。**通常検証のスコープ外**
└── specs/001-runtime-folder-registration-runtime-detection/
```

**`runtime/` と `supervisor/` はトップレベルには存在しない。**
PLAN.md の旧表記を根拠に探すと 0 件ヒットになる (上の revision 3 注記を参照)。

**X-1 (単一セッション起動) が加えたモジュール** (spec 005):
`src/agents/` に `session-core.ts` (権限ゲートの正の構成 P1-P3。SDK 非 import・注入式) と
`sdk-agent-session.ts` (SDK `query()` 入口・`child_process.spawn` の spawn 主体・`parentPort`/port 配線)。
`src/main/app/` に `session-launch-service.ts` (単一セッション不変・制御ルーティング) /
`session-spawner.ts` (per-session `utilityProcess` + `MessageChannelMain`) と `session-ipc.ts` への起動/制御ハンドラ追加。
`src/main/infra/runtime/` に `launch-spec.ts` (env allowlist + WSL argv builder)。
`src/renderer/src/features/session/` に起動 entry + live thread + 承認カード (`useLiveSession` / `SessionScreen` / `ApprovalCard`)。
claude 実行パスは `probe-script.ts` の `command -v claude` で検出時解決し `descriptor.claudePath` に載せる (AD-036)。

**X-3 (Provider 登録と到達可能性判定) が加えたモジュール** (spec 007):
`src/domain/provider/` に純粋関数群 (`types` / `settings`[HelperSettings] / `derive-env` / `reachability` / `detect` /
`secret-scan` / `dto`)。`src/main/infra/secrets/safe-storage.ts` (**infra/secrets 初の .ts**。electron `safeStorage`) /
`src/main/infra/settings/provider-{record,store}.ts` (JSON 永続化・秘密参照キーのみ) /
`src/main/infra/provider/{detect,detector}.ts` (config dir / `~/.aws/config` / env 検出。os/process 非 import)。
`src/main/app/provider-service.ts` (状態を持つ調停。`services-not-to-io` に実名追加) + `ipc.ts`/`validate.ts`/`composition-root.ts` へ配線。
`src/renderer/src/features/provider/` に登録・検出・CRUD UI。C-001 の権限ゲート調停で `session-core.ts` の `buildQueryOptions` を
`settings?: HelperSettings` 対応に拡張、`check.mjs` 項目 16 / `allowlists.mjs` を AD-040 で更新 (`QUERY_SETTINGS_ALLOWED_KEYS`)。

テストは `src/` 内の実装と同じ場所に置く。`tests/` にあるのは基盤の検証と違反サンプルだけである。

---

## README / Docs summary

### README highlights

- **`README.md` は absent: true** — reason: "repo root および全サブディレクトリに README.md が存在しない (`find` 全走査で 0 件。`.specify/extensions/agent-context/README.md` は vendored 拡張の同梱物)"。
- `C:\dev\closta\CLAUDE.md` (188B) は `<!-- SPECKIT START/END -->` マーカーで囲まれた自動生成ブロック 1 つのみ。内容は「現在のプランを読め」の誘導であり、プロジェクト固有情報は 0。**Spec Kit の後続コマンドがこのブロックを上書きする前提の状態**。

### `C:\dev\closta\PLAN.md` (observation E — 実質的な README / 憲章)

905 行、14 章 + 付録 2。自己定義として「本書は spec-driven-gating-workflow の**入力**である」「`/spec-gate scan` → `bootstrap` の実行**前**に読み込ませる」「Spec Kit が生成する `specs/<id>/plan.md` とは別物。上書き・置換しないこと」(L9-19) と明記。

主要セクション:

- **§1 プロダクト概要** (L23): Closta = 複数 Claude Code セッションを隔離実行環境ごとに走査・起動・管理するデスクトップ AI エージェントアプリ。三本の軸 = ①UI 完成度 (assistant-ui Elements) ②Provider 抽象 ③Docker サンドボックス。3 軸の交点が §7 SessionLaunchConfig。
- **§2 技術スタック（確定）** (L65): 上表。「`/spec-gate scan` の検出結果と突き合わせること。齟齬がある場合は本書を正とする」(L67) と明示 — **本 discovery の照合対象そのもの**。
- **§3 アーキテクチャ決定** (L104): **AD-001〜AD-014 が「確定済み」**。「design-gate のレビューで蒸し返す場合は新規 Critical findings ではなく ADR 起票として扱うこと」(L18-19) — downstream reviewer の severity 判定に直接影響する制約。
- **§4 軸 1 UI** (L321): 完成の定義 = 「Claude Code が emit する情報のうち専用表示を持たないものをゼロにする」。Element を Tier A/B/C に分類 (執筆時 143 要素と記載。**2026-09-13 の実確認では 202 要素**、AD-019)。
- **§5 軸 2 Provider** (L392): `ProviderProfile` 型定義 + `CredentialSource` 9 種 (L414-424)。推奨は `api-key-helper` / `aws-credential-export`。
- **§6 軸 3 Docker** (L458): 隔離設計表 (L484-492) — `~/.aws` `~/.ssh` `~/.gnupg` を**マウントしない**、非 root 必須、ネットワーク既定制限、transcript は host SQLite にミラー。
- **§8 Constitution Principle 候補** (L567): **P-1〜P-13**、各 Principle に「検証」方法を併記。`.specify/memory/constitution.md` の素材と明示。
- **§9 非目標** (L630): 環境構築の不実施、Claude Code 以外のエージェント非対応、SSH ランタイム / モバイル / Web / チーム機能 / 音声 / Linux 動作保証を除外。
- **§10 Feature バックログ** (L652): **F-001〜F-016**、1 feature = 1 branch = 1 spec。マイルストーン M1〜M6 (L677-684)。
- **§11 Spike** (L699): **SPIKE-1〜SPIKE-8**。SPIKE-8 (ランタイム検出・パス変換) と SPIKE-1 (`listSessions()` と `CLAUDE_CONFIG_DIR`) は F-001 / F-002 の**前提条件**と明記。

> **revision 2 注記**: 上記 §10 / §11 の要約は **2026-09-12 時点の PLAN.md の引用**である。
> その後 domain / feature / マイルストーンをゼロから引き直したため、`F-001`〜`F-016` と M1〜M6 は
> **現行の定義ではない**。feature の SSoT は [docs/domains/_overview.md](domains/_overview.md)、
> 順序と SPIKE の紐付けは [docs/roadmap.md](roadmap.md) を参照すること。
> PLAN.md §10 自身にも「本節は素案である」と明記済み。
- **§12 reviewer 構成の希望** (L763): 必須 = reviewer-base / security / architecture / po / convention。追加希望 = **ux-reviewer (最重要)** / a11y-reviewer。不要 = database / openapi-contract / api-performance。カスタム希望 = `ui-coverage-reviewer` / `platform-boundary-reviewer`。
- **§13 環境前提** (L787): Windows 11 22H2+ / WSL2 主軸、リポジトリは Windows 側 NTFS、**WSLg は使わない** (理由は P-13)、pnpm、gh CLI 2.90.0+、`uv tool install specify-cli`。
- **§14 実行手順** (L836): `specify init` → `gh skill install ... --pin v0.1.0` → `/spec-gate scan` → `bootstrap` (prefix `cl`) → `verify` → Constitution 昇格 → SPIKE-8 / SPIKE-1 → `/cl-spec "[runtime] ..."`。

### Existing `docs/`

- `docs/` に 25 ファイル。**reviewer-base が SSoT として要求する成果物は揃っている** — `docs/decisions/` (ADR 14 件、AD-001〜AD-014)、`docs/domains/<name>/charter.md` (5 domain)、`docs/glossary.md` (canonical 用語 23 語)。加えて `docs/roadmap.md` と `docs/prompts.md`。
- reviewer-base.md が前提とする SSoT 群 (`docs/discovery.md` / `docs/glossary.md` / `docs/domains/<name>/charter.md` / `docs/decisions/`) は**全て未生成**。
- P-11 (L614) が検証条件とする `docs/ui-coverage.md` も不在。
- 用語定義は `PLAN.md` 付録A (L878-891) に 11 語が存在し、glossary-extractor の一次素材になる: Closta / セッション / Provider / ランタイム / capabilities / SessionLaunchConfig / Element / Tier A-C / HostPath / RuntimePath。

### Recent CHANGELOG entries

- **`CHANGELOG.md` は absent: true** — reason: "repo に CHANGELOG.md が存在せず、git 履歴もコミット 1 本のみ (`49faef4 docs: add project plan`) のため変更傾向を導出できない"。
- active development の指標としては、git 履歴ではなく **`.specify/extensions/.registry` / `.specify/workflows/workflow-registry.json` の `installed_at` = `2026-09-12T11:13:25Z`** が唯一のタイムスタンプ。すなわち足場の設置は本日 (2026-09-12) 実施されたもので、リポジトリ年齢は事実上 1 日未満。

---

## Unknown / Ambiguous

- **セッション transcript ミラーの保持期限 / 削除経路が未定義**
  - category: `requirement_gap`
  - evidence: `C:\dev\closta\PLAN.md:191-192` (AD-007) が「`DockerRuntime` ではコンテナ内に JSONL が閉じるため `sessionStore` アダプタでホスト側 SQLite にミラーする」と宣言、`PLAN.md:492` (§6.3) が再掲。ミラー対象は会話全文 + ソースコード断片であり個人情報を含みうる。`PLAN.md` 全 905 行に対し `grep -nEi 'GDPR|個人情報|privacy|プライバシ|retention|保持期限|audit|監査|telemetry|PII|erasure'` を実行 → 該当 **0 件** (唯一のヒット L144 は SDK バージョン記述で無関係)。保持期限・削除 UI・エクスポート・第三者送信有無のいずれも未記述。
  - priority: `blocking`
  - downstream: charter-drafter (session / storage domain)、constitution-drafter (P-5 の隣に「ミラーデータの保持期限と削除経路」Principle 候補)、architecture-reviewer escalation 必須

- **LICENSE および第三者 OSS ライセンス表記が不在**
  - category: `requirement_gap`
  - evidence: repo root 全走査で `LICENSE` / `LICENSE.md` / `NOTICE` **0 件**。一方 `C:\dev\closta\PLAN.md:673` (F-016) が「Windows インストーラを生成」、`PLAN.md:684` (M6) が「自分以外が使える」配布を計画。`PLAN.md:71-86` の宣言スタック (Electron / node-pty / better-sqlite3 / assistant-ui / xterm.js 他) の再配布は各 OSS ライセンスの帰属表示義務を伴う。なお vendored skill `C:\dev\closta\.claude\skills\spec-gate\SKILL.md` は frontmatter で `license: MIT` を宣言しており、本体リポジトリのライセンス未定との非対称がある。
  - **revision 2 時点でも未解消。** 現行定義では配布は **D-1 (M5)** にあたる。Constitution の
    `## 未解決の Principle 候補` に `TODO(license)` として記載済み。
  - **revision 3: 自プロジェクト分は解消した。** R-1 (SH-031) で `LICENSE` (MIT 全文) を
    repo root に置き、`package.json` の `license` フィールドと一致させた。
    **残余は第三者依存の `NOTICE`** であり、D-1 に限定される
    ([AD-024](decisions/0024-constitution-verification-paths.md) #17)。
    vendored skill との非対称も解消した
  - priority: `blocking`
  - downstream: charter-drafter (distribution)、constitution-drafter (配布 Principle 候補)

- **資格情報の取り扱いは設計済み — requirement_gap ではない (明示的な非該当判定)**
  - category: `observation`
  - evidence: `C:\dev\closta\PLAN.md:586-591` (P-5) が「長期資格情報を永続化しない / `safeStorage` 経由でキーチェーン / 参照キーのみ保持 / ログへの混入禁止」を検証条件付きで定義。`PLAN.md:414-424` (§5.2) が `CredentialSource` 9 種それぞれについて「アプリが秘密を持つか」を表で明示。`PLAN.md:434` は `RoleSessionName` にアプリ名 + セッション ID を含め **CloudTrail で追跡可能にする**と監査経路まで指定。したがって「秘密管理の要件が不在」という requirement_gap は成立しない。ただし**検証対象のコードが 0 行**であるため、実装後に code-gate で再評価が必要。
  - downstream: security-reviewer (実装フェーズで P-5 検証条件を適用)

- **~~`.specify/memory/constitution.md` が placeholder テンプレートのまま~~ → 解消 (2026-09-13)**
  - `/speckit.constitution` により `status: active` v1.0.0 として批准。NON-NEGOTIABLE 8 + Standard 5 + Glossary 2 の計 15 Principle。
  - 以下は初版時点の記述として残す。
  - category: `gap`
  - evidence: `C:\dev\closta\.specify\memory\constitution.md` は `# [PROJECT_NAME] Constitution` / `[PRINCIPLE_1_NAME]` / `[GOVERNANCE_RULES]` / `**Version**: [CONSTITUTION_VERSION]` と未置換トークンのみ。一方 `C:\dev\closta\PLAN.md:569` は「`status: active` に昇格させてから design-gate を回すこと」、`PLAN.md:857` は「Constitution を active に昇格（§8 の P-1〜P-13 が反映されていることを確認）」を手順として要求。reviewer-base.md:21 が Constitution を SSoT と規定しているため、**現状ではあらゆる reviewer が D カテゴリ (Constitution drift) を判定できない**。
  - downstream: constitution-drafter (PLAN.md §8 L567-626 の P-1〜P-13 が直接の素材)、architecture-reviewer

- **アプリケーションソースツリーが存在しない**
  - category: `gap`
  - evidence: `src/` / `app/` / `packages/` いずれも不在。`git ls-files` = `PLAN.md` 1 件のみ。PLAN.md が検証条件で参照する `src/`, `runtime/`, `supervisor/` (L573, L576, L584, L594, L607) は全て未作成。
  - downstream: spec-reverser は全 FR を `[NOT-observed]` とせざるを得ない → **brownfield migrate は成立しない** (下記 quality score 参照)
  - **revision 3: 解消した。** `src/` に 89 ファイル / 約 14,000 行。
    ただし `runtime/` / `supervisor/` は**実ディレクトリとしては依然として存在しない** —
    AD-023 のレイヤ構成では `src/main/infra/runtime/` と `src/agents/` である。
    **本プロジェクトは greenfield であり、brownfield migrate は今後も使わない**

- **テストディレクトリ / テストランナーが不在**
  - category: `gap`
  - evidence: プロダクトの `test/` / `tests/` / `__tests__/` / `*.spec.ts` **0 件**。Vitest / Playwright は `PLAN.md:86` の宣言のみで devDependency も設定ファイルも不在。唯一存在する `C:\dev\closta\.claude\skills\spec-gate\scripts\tests\` (5 ファイル / 440 行 bash) は **vendored skill 自身の self-test** であり、プロダクトのカバレッジには算入できない。
  - **revision 3: Vitest は解消した。** `vitest.config.ts` に 2 project (node / renderer)、
    テスト 11 ファイル / 213 件。テストは `src/` 内の実装と同じ場所に置く
    (`tests/` には基盤の検証と違反サンプルのみ)。
    **Playwright (E2E) は未導入のまま** — Principle VIII の Automated 2 項目がここに乗る予定であり、
    R-1 の CI には載っていない (AD-024 #18)。
  - downstream: test-agent、po-reviewer (H カテゴリ)

- **CI が不在だが PLAN.md は CI の存在を前提にしている**
  - category: `gap`
  - evidence: `.github/` 不在、CI 設定 0 件。一方 `C:\dev\closta\PLAN.md:276` (AD-013) は「CI のマトリクスは Active LTS を基準にし、Current / Alpha は allow-failure ジョブで回す」、`PLAN.md:626` (P-13 検証条件) は「日本語を含むスクリーンショット比較が CI に存在すること」を Principle の充足条件として指定。**P-13 は CI 不在の状態では構造的に検証不能**。
  - downstream: constitution-drafter (P-13 の検証条件を CI 構築とセットで計画する必要)、architecture-reviewer

- **~~`.gitignore` が不在~~ → 解消 (2026-09-12)**
  - 以下は初版時点の記述として残す。
  - category: `gap`
  - evidence: repo 全体で `.gitignore` **0 件**。宣言スタックは `node_modules/` (pnpm)、`dist/`、`out/`、`electron-builder` 成果物、`better-sqlite3` のネイティブビルド生成物を生む。加えて `PLAN.md:419-420` は `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` を、`PLAN.md:421` は `~/.aws/credentials` プロファイル参照を扱う設計であり、`.env` 系ファイルの誤コミット経路が現時点で無防備。**F-001 着手前に解消すべき前提条件**。
  - downstream: security-reviewer、convention-reviewer

- **`README.md` が不在**
  - category: `gap`
  - evidence: repo 内に README.md 0 件。`C:\dev\closta\CLAUDE.md` は 188B の SPECKIT 自動生成ブロックのみでプロジェクト固有情報を持たない。実質的な入口ドキュメントは `PLAN.md` だが、同ファイルは自らを「spec-driven-gating-workflow の**入力**」(L11) と定義しており README の代替を意図していない。
  - downstream: charter-drafter

- **~~`docs/` が空ディレクトリ~~ → 解消 (2026-09-13)**
  - `docs/ui-coverage.md` のみ未作成。これは O-2 (M3) で作る feature の成果物である。
  - 以下は初版時点の記述として残す。
  - category: `gap`
  - evidence: `C:\dev\closta\docs\` は存在するがファイル 0 件、かつ git 未追跡 (空ディレクトリは git が追跡しないため)。reviewer-base.md:21-24 が SSoT として要求する `docs/decisions/` (ADR)、`docs/domains/<name>/charter.md`、`docs/glossary.md` が全て不在。さらに `PLAN.md:614` (P-11) は `docs/ui-coverage.md` の対応表に未割当行が無いことを検証条件としているが当該ファイルも不在。
  - downstream: charter-drafter、glossary-extractor、architecture-reviewer (ADR drift 判定不能)

- **~~`/spec-gate bootstrap` が未実行~~ → 解消 (2026-09-12)**
  - prefix `cl` で実行済み。wrapper 9 種、agent 13 件 (generic reviewer 5 / actor 3 / optional 3 / discovery-scanner / platform-boundary-reviewer)。
  - 以下は初版時点の記述として残す。
  - category: `observation`
  - evidence: `C:\dev\closta\.claude\agents\` には `discovery-scanner.md` と `reviewer-base.md` の **2 件のみ**。skill 側 `references\subagents\` には 13 件 (architecture-reviewer / charter-drafter / constitution-drafter / convention-reviewer / discovery-scanner / glossary-extractor / implementer / lint-agent / po-reviewer / reviewer-base / security-reviewer / spec-reverser / test-agent) が存在するが未配置。`.claude\commands\` ディレクトリ自体が不在で、`PLAN.md:288` が希望する prefix `cl` の daily wrapper (`/cl-spec` 等 9 種) は 1 つも未インストール。`specs/` ディレクトリも不在。→ 現在地は `PLAN.md:853` の `/spec-gate scan` ステップ。
  - downstream: invoker (`/spec-gate`)。bootstrap 実行時に §12 (L763-783) の reviewer 構成希望 — ux-reviewer / a11y-reviewer 追加、database / openapi-contract / api-performance 不要、カスタム `ui-coverage-reviewer` / `platform-boundary-reviewer` — を反映すること

- **~~`.claude/` と `.specify/` が git 未追跡~~ → 解消 (2026-09-12)**
  - 両ディレクトリを追跡下に置いた。`.claude/settings.local.json` のみ個人環境依存として除外。
  - 以下は初版時点の記述として残す。
  - category: `risk`
  - evidence: `git ls-files` = `PLAN.md` のみ。`git status` では `.claude/` (63 ファイル / 610KB) と `.specify/` (25 ファイル / 159KB) が untracked。この中には SSoT である `.specify\memory\constitution.md`、subagent 定義、gate 実行スクリプト (`gate-common.sh` 844 行) が含まれる。`.gitignore` も無いため意図的除外か未コミットかを artifact から判別できない。Constitution / ADR の改変履歴が git に残らない状態は、reviewer-base.md が規定する「accepted ADR drift = Critical」判定の根拠を失わせる。
  - downstream: constitution-drafter (governance 節)、architecture-reviewer

- **~~spec-gate の pin バージョンが PLAN.md 記載と不一致~~ → 解消 (2026-09-12)**
  - 実体の v0.2.0 に合わせて PLAN.md §14 を修正した。
  - 以下は初版時点の記述として残す。
  - category: `observation`
  - evidence: `C:\dev\closta\PLAN.md:850-851` は `gh skill install ukitomato/spec-driven-gating-workflow spec-gate --agent claude-code --pin v0.1.0` を指示。実際に設置されている `C:\dev\closta\.claude\skills\spec-gate\SKILL.md` の frontmatter は `github-pinned: v0.2.0` / `github-ref: refs/tags/v0.2.0` / `github-tree-sha: 094a68bc13391654bc77abf73785560c97551795`。**v0.2.0 が設置済み**であり、PLAN.md の手順書が古い。どちらが意図かは artifact から判別不能。
  - downstream: invoker (PLAN.md §14 の更新要否を判断)

- **PowerShell / bash / python3 の三重ツール依存** (revision 2 で更新)
  - category: `observation`
  - evidence: `C:\dev\closta\.specify\init-options.json` は `"script": "ps"`、`.specify\integration.json` も `"script": "ps"` を指定し、`.specify\scripts\` 配下は `powershell\` のみ (bash 版ディレクトリが存在しない)。一方 spec-gate 側 `C:\dev\closta\.claude\skills\spec-gate\scripts\` は `gate-common.sh` / `spec-resolve.sh` / `status-transition.sh` と `tests\*.bash` で **bash 専用**。`PLAN.md:803` が開発ホストを Windows 11 と規定しているため、gate の機械的 enforcement (`cascade_enforce` / `viewpoint_coverage_check` / `verdict_emit` / `verdict_validate`) の実行には Git Bash または WSL が必須。この依存は PLAN.md §13.1 のツールチェーン表 (L791-797) に記載されていない。
  - **revision 2 追記**: さらに `gate-common.sh` は `python3` に依存する。Windows では
    `python3` が Microsoft Store のエイリアススタブに奪われるため `uv python install --default` 等で
    実体を通す必要があり、加えて `PYTHONUTF8=1` がないと日本語ロケールで `truncate_subject` の
    `…` が cp932 出力になり commit subject が壊れる。本リポジトリでは `.claude/settings.json` で設定済み。
    PLAN.md §13.1 にも Git Bash と python3 を明記した。
  - downstream: invoker (bootstrap 時の実行環境確認)

- **Node / pnpm のバージョン pin artifact が不在** (一部解消)
  - category: `gap`
  - evidence: `.nvmrc` / `.node-version` / `.tool-versions` / `package.json` の `engines` / `packageManager` フィールド いずれも不在。`C:\dev\closta\PLAN.md:793` は「ホスト Node.js 24 (Active LTS)」、`PLAN.md:795` は「パッケージマネージャ pnpm」を要件としているが、機械的に強制する artifact が無い。AD-013 (L252-276) が Node と Electron 同梱 Node の ABI 差を重大な設計論点として扱っている以上、pin の欠落は実害に直結しうる。
  - **revision 2 追記**: `pnpm-workspace.yaml` に `nodeLinker: hoisted` を配置し、Electron 互換は
    固定した。ただし `.nvmrc` / `.node-version` / `engines` / `packageManager` は依然として不在であり、
    Node と pnpm の**バージョン**は pin されていない。R-1 (プロジェクト初期化を兼ねる) で整備する。
  - downstream: convention-reviewer、implementer (R-1 の前提整備)

- **git remote が未設定 / 名前空間の確保状況が不明**
  - category: `observation`
  - evidence: `git remote -v` が空。`C:\dev\closta\PLAN.md:838-841` は手順ステップ 0 として「名前空間を先に押さえる (AD-014): `gh repo create closta --private` / npm / crates.io / closta.dev」を指示し、`PLAN.md:293-294` は「空きを確認済みだが、AI エージェント領域の命名は現在進行形で埋まっており、放置すれば取られる」と時間的切迫を明示。ステップ 0 が完了しているかを repo artifact から判定できない。
  - downstream: invoker (人間への確認事項)

- **PLAN.md の「確定」スタックは全て未インストール — 齟齬の扱いは PLAN.md が規定済み**
  - category: `observation`
  - evidence: `C:\dev\closta\PLAN.md:67` は「`/spec-gate scan` の検出結果と突き合わせること。**齟齬がある場合は本書を正とする**」と明記。本 scan の検出結果は「スタック 0 件」であり、§2 の全 17 行が未実現。これは矛盾ではなく **greenfield の正常状態** (PLAN.md:843-845 の `mkdir closta && git init && specify init` 直後) として解釈すべき。ただし downstream の全 specialist は「§2 は実測ではなく宣言」として扱う必要がある。
  - downstream: 全 specialist (charter-drafter / spec-reverser / constitution-drafter / glossary-extractor)

- **AD-001〜AD-014 の ADR 化が未完**
  - category: `observation`
  - evidence: `C:\dev\closta\PLAN.md:104-317` に 14 件のアーキテクチャ決定が「確定済み」として記述されているが、`docs/decisions/` が不在のため MADR 形式の ADR ファイルとして存在しない。`PLAN.md:18-19` は「design-gate のレビューで蒸し返す場合は、新規の Critical findings ではなく ADR 起票として扱うこと」と要求しており、この運用は ADR ファイルの実体を前提とする。また `PLAN.md:860` は SPIKE-8 / SPIKE-1 の「結果を §3 に ADR として追記」と指示しており、ADR の置き場が `PLAN.md §3` なのか `docs/decisions/` なのかが**両立しない形で記述されている**。
  - downstream: architecture-reviewer (ADR drift owner)、invoker (ADR の SSoT 位置を人間に確認)

- **monorepo 不検出 — workspace sampling 非適用** (revision 2 で注記追加)
  - category: `observation`
  - sampled: n/a
  - evidence: 初版時点では monorepo marker 0 件、workspace 総数 **0**。
  - **revision 2 注記**: その後 `pnpm-workspace.yaml` を配置したが、これは **monorepo 定義ではなく
    pnpm の設定ファイル**である (pnpm 10 以降は `.npmrc` からここへ設定が移った)。`packages:` キーを
    持たないため workspace は依然として 0。内容は Electron 互換のための `nodeLinker: hoisted` のみ。
    **次回 scan 時に monorepo と誤判定されうるので注意すること。**
  - downstream: なし

---

## Project quality score (used by /spec-gate migrate quality floor)

| metric | value | note |
|---|---|---|
| has_git | **yes** | branch `main`、コミット 17 本、追跡ファイル 149 件、remote `ukitomato/closta` 設定済み (未 push) |
| has_readme | **no** | README.md 不在。`CLAUDE.md` は 188B の SPECKIT 自動生成ブロックのみ。`PLAN.md` (56.5KB) は charter であり README の代替を意図していない (L9-19) |
| has_test_dir | **no** | プロダクトのテスト 0 件。`.claude\skills\spec-gate\scripts\tests\` (5 ファイル) は vendored skill の self-test で算入不可 |
| has_ci | **no** | `.github/` 不在、CI 設定ファイル 0 件。PLAN.md AD-013 / P-13 は CI の存在を前提にしている |
| has_changelog | **no** | CHANGELOG.md 不在。git 履歴もコミット 1 本のみで変更傾向を導出不能 |
| docs_exist | **yes** | 25 ファイル。ADR 14 / charter 5 / glossary / roadmap / prompts / verify-report。`docs/ui-coverage.md` のみ O-2 待ち (**2026-10-03 追記**: O-2 で作成した) |
| **score** | **2 / 6** | 初版 1/6 から docs_exist が partial → yes に改善。threshold (default 3) は依然未満だが、**本プロジェクトは greenfield であり migrate の対象ではない**ため実害はない。残り 4 項目 (readme / test / ci / changelog) はソースコードの着手後に改善する |

### score の解釈 (invoker 向け)

本リポジトリは brownfield ではなく **greenfield (足場のみ設置済み、ソース 0 行)**。`migrate` の 5 phase (Charter Reverse / Spec Reverse / Constitution Draft / Glossary Extraction) のうち、既存コードからの逆算に依存する **Charter Reverse と Spec Reverse は入力が存在せず成立しない** (spec-reverser は全 FR を `[NOT-observed]` にせざるを得ない)。

一方で `PLAN.md` は charter / Principle 候補 (P-1〜P-13) / feature backlog (F-001〜F-016) / 用語集 (付録A) を**既に人間が明文化済み**であり、migrate が逆算で得ようとする成果物が上流に揃っている。したがって正しい経路は `PLAN.md:853-855` が指示するとおり **`/spec-gate scan` → `/spec-gate bootstrap` (prefix `cl`, §8 を constitution.draft.md の素材に使用) → `/spec-gate verify`** であり、migrate ではない。

bootstrap 前に解消を推奨する前提条件 (上記 finding より): `.gitignore` の作成、`.claude/` と `.specify/` の git 追跡方針決定、ADR の SSoT 位置 (`PLAN.md §3` か `docs/decisions/` か) の確定。
