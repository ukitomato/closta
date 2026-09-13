---
status: active
generated_by: /spec-gate scan
generated_at: 2026-09-12T11:27:40Z
reviewed_at: 2026-09-13
revision: 2
---

# Project Discovery

> **revision 2 (2026-09-13)**: 初版は 2026-09-12 の `/spec-gate scan` によるスナップショット。
> その後の作業で事実が変わった箇所を更新したうえで `status: active` に昇格した。
> `convention-reviewer` と `lint-agent` は本ファイルの Tech Stack section を SSoT として
> 読むため、記述の鮮度が直接それらの判断に効く。
>
> **初版から変わっていない最重要事項**: アプリケーションのソースコードは依然として **0 行**である。
> Tech Stack の「detected: none」は現在も正しい。

## revision 2 での主な更新

| 項目 | 初版 (2026-09-12) | 現在 (2026-09-13) |
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

- **Project type**: **unknown (greenfield / 未着手)** — アプリケーションのソースツリーが存在しない。リポジトリの実体はドキュメント (PLAN.md / docs/) と Spec Kit / spec-gate の足場のみ。**revision 2 時点でも本項は変わらない。**
- **Primary language**: **detected: none.** 実行可能なアプリケーションコード (`.ts` / `.js` / `.py` / `.dart` 等) は 0 件。存在するコードは vendored tooling のみ:
  - Bash: `C:\dev\closta\.claude\skills\spec-gate\scripts\` (3 ファイル, 1213 行) + `scripts\tests\` (5 ファイル, 440 行)
  - PowerShell: `C:\dev\closta\.specify\scripts\powershell\` (5 ファイル)
- **Frameworks**: **detected: none.** 観点 A の manifest glob (package.json / pyproject.toml / pubspec.yaml / Cargo.toml / go.mod / pom.xml / *.csproj / Gemfile / composer.json / Dockerfile / docker-compose / Makefile) は **全て 0 件ヒット**。
- **Package manager lockfile**: absent (pnpm-lock.yaml / package-lock.json / yarn.lock いずれも不在)。
- **`.gitignore`**: 配置済み。pnpm / Electron / Vite / electron-builder / better-sqlite3 の生成物、`.env` 系と鍵ファイル (Principle V の誤コミット経路)、SQLite ファイル、エディタ / OS 由来ファイルを除外。
- **Git**: `main` ブランチ、コミット 17 本、追跡ファイル 149 件、remote `https://github.com/ukitomato/closta.git` (未 push)。

### Declared (PLAN.md §2「技術スタック（確定）」— documented only, NOT installed)

以下は `C:\dev\closta\PLAN.md:65-101` が「確定」と宣言する意図スタック。**ディスク上に対応する artifact は 1 つも存在しない**。検出結果ではなく charter の宣言として扱うこと。

| レイヤ | 宣言値 | 根拠 | on-disk |
|---|---|---|---|
| デスクトップシェル | Electron (最新安定版追随) | PLAN.md:71, AD-001 (L106) | absent |
| ホスト Node.js | 24 (Active LTS) | PLAN.md:72, AD-013 (L252) | absent |
| 言語 | TypeScript (strict) | PLAN.md:73 | absent |
| UI | React + assistant-ui (Elements) | PLAN.md:74, §4 | absent |
| スタイル | Tailwind + assistant-ui design system | PLAN.md:75 | absent |
| 状態管理 | Zustand (renderer のみ) | PLAN.md:76 | absent |
| 仮想化 | `@tanstack/react-virtual` | PLAN.md:77 | absent |
| エージェント連携 | `@anthropic-ai/claude-agent-sdk` (TS, V1 `query()`) | PLAN.md:78, AD-002 (L134) | absent |
| supervisor | Electron `utilityProcess` (単独起動可能) | PLAN.md:79, AD-006/AD-010 | absent |
| ターミナル | xterm.js + node-pty | PLAN.md:80 | absent |
| 秘密保管 | Electron `safeStorage` (OS キーチェーン) | PLAN.md:81, AD-011 (L229) | absent |
| 永続化 | SQLite (better-sqlite3) | PLAN.md:82 | absent |
| コンテナ制御 | Docker CLI 呼び出し | PLAN.md:83, AD-012 (L243) | absent |
| パッケージング | electron-builder (`asarUnpack` 必須) | PLAN.md:84, AD-009 (L210) | absent |
| Lint | ESLint + `no-restricted-imports` | PLAN.md:85 | absent |
| テスト | Vitest (unit) / Playwright (E2E) | PLAN.md:86 | absent |
| パッケージマネージャ | pnpm | PLAN.md:795 | absent |

宣言されたランタイム抽象 (AD-003, PLAN.md:147-160): `DirectRuntime` / `WslRuntime` / `Win32Runtime` / `DockerRuntime`。宣言された branded type (AD-004): `HostPath` / `RuntimePath`。

### Per workspace (monorepo only)

**該当なし。** workspace 数 = **0**、sampling cap (20) 未適用、skipped workspace = なし。

**revision 2 注記**: `pnpm-workspace.yaml` は存在するが、これは pnpm 10 以降における**設定ファイル**
であって monorepo 定義ではない。`packages:` キーを持たず、内容は Electron 互換のための
`nodeLinker: hoisted` のみ。`package.json.workspaces` / `turbo.json` / `nx.json` / Cargo workspace /
`go.work` はいずれも 0 件。PLAN.md も monorepo を宣言しておらず、P-1 / P-9 (L571, L606) は単一パッケージ内の `runtime/` / `supervisor/` ディレクトリ層に対する ESLint 制約として記述されている。

---

## Build / Test / Lint

**detected: none.** 実行可能な build / test / lint コマンドはリポジトリ上に存在しない (`package.json.scripts` / `Makefile` / `pyproject.toml [tool.*]` いずれも不在)。

現在ディスク上で実行可能な唯一の自動化:

| 種別 | コマンド | 場所 |
|---|---|---|
| tooling test | `bash .claude/skills/spec-gate/scripts/tests/run-all.bash` | `C:\dev\closta\.claude\skills\spec-gate\scripts\tests\run-all.bash` (5 test 本体: cascade-enforce / spec-id-allocate / truncate-subject / verdict-validate / viewpoint-coverage) |

これは vendored skill (spec-gate v0.2.0) 自身の self-test であり、**プロダクトのテストではない**。

### Planned (PLAN.md 宣言、未セットアップ)

- Build: `vite` / `tsc` / `electron-builder`、ネイティブ再ビルドに `electron-builder install-app-deps` (PLAN.md:84, 260-262)
- Test: Vitest (unit) / Playwright (E2E)。加えて P-13 (L623-626) が「日本語スクリーンショット比較を CI に持つ」ことを検証条件に指定
- Lint: ESLint + `no-restricted-imports` (P-1 が `node:path` 直 import を、P-9 が `supervisor/` での `electron` import を error 化する前提)
- 機械検証として grep ベースの Principle 検証も宣言済み: P-2 は `grep -rn "process.platform" src/ --exclude-dir=runtime` が空であること (L576)、P-8 は `sudo` / `wsl --import` / `docker build` / `apt` 実行箇所が存在しないこと (L603)

---

## Flavors (B-4)

flavor artifact (`firebase.json` / `app.yaml` / `serverless.yml` / `wrangler.toml` / `flutter_flavorizr` / `.env*`) は **0 件**。

- flavor: `dev` — **absent: true**, reason: "flavor 定義ファイルが repo に存在せず、`.env.dev` も build config も不在"
- flavor: `stg` — **absent: true**, reason: "同上。PLAN.md にも stg 環境の概念が存在しない"
- flavor: `prod` — **absent: true**, reason: "同上。配布は D-1 (M5) に置かれており未着手"

補足 (observation): 本プロダクトにおける「環境差分」の相当物は build-time flavor ではなく **runtime 値** として設計されている。`ProviderProfile` (PLAN.md:396-405) は `backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry'` と `configDir` をアプリに登録する値であり、「本番用 Bedrock と検証用 Bedrock」を同時登録できる (L409-410)。`AgentRuntime` も同様に「検出結果から生成される値、シングルトンではない」(AD-003, L156-158)。したがって flavor 検出の枠組みは本プロジェクトには構造的に適用されない見込み。

---

## CI/CD

- **Provider: none detected.**
- `.github/` ディレクトリ **不在**。`.gitlab-ci.yml` / `Jenkinsfile` / `azure-pipelines.yml` / `bitbucket-pipelines.yml` いずれも不在。
- Pipelines: **0 件**。

PLAN.md は CI の存在を複数箇所で前提にしている (AD-013 L276: 「CI のマトリクスは Active LTS を基準にし、Current / Alpha は allow-failure ジョブで回す」、P-13 L626: 「日本語を含むスクリーンショット比較が CI に存在すること」)。宣言と実体の乖離は下記 `gap` として記録。

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

- **テストディレクトリ / テストランナーが不在**
  - category: `gap`
  - evidence: プロダクトの `test/` / `tests/` / `__tests__/` / `*.spec.ts` **0 件**。Vitest / Playwright は `PLAN.md:86` の宣言のみで devDependency も設定ファイルも不在。唯一存在する `C:\dev\closta\.claude\skills\spec-gate\scripts\tests\` (5 ファイル / 440 行 bash) は **vendored skill 自身の self-test** であり、プロダクトのカバレッジには算入できない。
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
| docs_exist | **yes** | 25 ファイル。ADR 14 / charter 5 / glossary / roadmap / prompts / verify-report。`docs/ui-coverage.md` のみ O-2 待ち |
| **score** | **2 / 6** | 初版 1/6 から docs_exist が partial → yes に改善。threshold (default 3) は依然未満だが、**本プロジェクトは greenfield であり migrate の対象ではない**ため実害はない。残り 4 項目 (readme / test / ci / changelog) はソースコードの着手後に改善する |

### score の解釈 (invoker 向け)

本リポジトリは brownfield ではなく **greenfield (足場のみ設置済み、ソース 0 行)**。`migrate` の 5 phase (Charter Reverse / Spec Reverse / Constitution Draft / Glossary Extraction) のうち、既存コードからの逆算に依存する **Charter Reverse と Spec Reverse は入力が存在せず成立しない** (spec-reverser は全 FR を `[NOT-observed]` にせざるを得ない)。

一方で `PLAN.md` は charter / Principle 候補 (P-1〜P-13) / feature backlog (F-001〜F-016) / 用語集 (付録A) を**既に人間が明文化済み**であり、migrate が逆算で得ようとする成果物が上流に揃っている。したがって正しい経路は `PLAN.md:853-855` が指示するとおり **`/spec-gate scan` → `/spec-gate bootstrap` (prefix `cl`, §8 を constitution.draft.md の素材に使用) → `/spec-gate verify`** であり、migrate ではない。

bootstrap 前に解消を推奨する前提条件 (上記 finding より): `.gitignore` の作成、`.claude/` と `.specify/` の git 追跡方針決定、ADR の SSoT 位置 (`PLAN.md §3` か `docs/decisions/` か) の確定。
