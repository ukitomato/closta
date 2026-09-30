# Implementation Plan: Provider 登録と到達可能性判定 (X-3)

**Spec**: [spec.md](spec.md) · **Spec ID**: `007-provider-registration-and-reachability` · **Feature**: X-3 · **Domain**: `provider` · **Targets**: both

**Status**: frontmatter (`spec.md`) の `status:` を正とする

本 plan は「どう満たすか」を定める。受け入れ条件 (何を満たすか) は spec.md、規則の正本は
1 箇所 (AD-039 §3 の委譲マトリクス / AD-005 の `ProviderProfile` 型 / X-1 の env 許可リスト) に置き、
本 plan は参照形で書く。

## Domain Context

### Charter reference

- **Domain**: `provider` ([docs/domains/provider/charter.md](../../docs/domains/provider/charter.md))
- **Mission**: Claude Enterprise / Amazon Bedrock ほかを、**認証方式ごとに登録可能な Provider として一般化し、
  セッション起動時の実行環境を導出する**。**アプリが資格情報のライフサイクルに関与しないこと**が設計上の要
- **Scope (本 feature が触れる In scope)**: `ProviderProfile` の CRUD (同一 backend 複数登録) / 9 種
  `CredentialSource` / 候補の検出と提示 (**自動登録しない**) / モデルカタログ (Bedrock は inference profile ID pin) /
  Provider からの env 導出 / Provider × ランタイムの到達可能性判定 / 一時資格の期限監視。
  **Out of scope (charter)**: 秘密の保管 (→ `safeStorage` 参照キーのみ) / ログインフロー・期限切れ再取得
  (→ Claude Code) / セッション起動そのもの (→ `session`) / 登録 UI の element 選定 (→ `ui`)
- **Journey**: Journey 1 (検出と登録) = US-1、Journey 2 (起動時の選択・到達で絞る) = US-2、
  Journey 3 (一時資格の期限切れ) = US-3
- **charter 追随 (本 feature で行う)**: charter Related Specs の「未着手。X-3 が本 domain に属する」を本 spec で
  更新し、Open Questions の SPIKE-7 は既に `[x]` (AD-039)。architecture-reviewer が charter drift として見るため
  tasks (Shared) に含める

### Related ADRs

- [AD-005](../../docs/decisions/0005-provider-as-registrable-value.md) — accepted — Provider は認証方式・設定
  ディレクトリ・モデルカタログを含む**登録可能な値**。`ProviderProfile` 型の正本。**`Options.env` は置換で
  spread 必須** / 同一 backend 複数登録 / config-dir 認証は到達できるランタイムのみ / `CredentialSource` 9 種
- [AD-011](../../docs/decisions/0011-delegate-credential-resolution.md) — accepted — 資格情報の解決は
  Claude Code に委譲。アプリは秘密の実体もライフサイクルも持たない。FR-004〜FR-007 の設計原則
- [AD-039](../../docs/decisions/0039-credential-delegation-verified.md) — accepted (2026-09-29) — SPIKE-7。
  委譲は SDK 0.3.270 で成立。**§3 = 9×委譲マトリクス (本 feature の規則正本)** / D2 = helper は per-session
  inline `settings` / D3 = `env` 置換で curated base を spread / D4 = `aws-assume-role` はアプリが一時資格を扱う
  唯一の例外 / §5 = 到達可能性は `settingSources` と `env.CLAUDE_CONFIG_DIR` で制御 (実装は X-3)
- [AD-023](../../docs/decisions/0023-application-architecture.md) — accepted — 5 レイヤ / データのみの IPC /
  `domain` は I/O を持たない (§7) / 状態を持つ調停クラスは I/O をインタフェース経由 (§5) / `electron` import は
  app レイヤと **`infra/secrets/`** のみ (§8。本 feature が最初の `.ts` を置く)
- [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) — accepted — `Reachability` (3 値) /
  `Location` / `PathMapping`。FR-011 の到達可能性判定はこれを再利用する
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — accepted — X-1 の
  `buildLaunchEnv` / env 許可リスト / `WSLENV`・資格情報 denylist (FR-008/FR-009 が継承) / **§4 P1 の query options
  allowlist が `settings` を締め出す (C-001 の一方)** / **§6 の申し送り「`CLAUDE_CONFIG_DIR` を起動 env に含めるなら
  distro RuntimePath であることを検証する」(H-02 で FR-008 に反映)**
- [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) — proposed (本 feature で起票) —
  AD-036 §4 P1 ↔ AD-039 D2 の調停。`settings` を 2 キー限定の制約付き射影で許す。FR-005 / SC-006 の根拠 (C-001 解消)
- [AD-027](../../docs/decisions/0027-rule-firing-verification-and-service-io-rule.md) — accepted —
  `services-not-to-io` の実名列挙義務。「X-3 の `ProviderService` を作るときは `from` に実名を足す」(A-1)

### Glossary excerpt

- **Provider**: 認証方式・設定ディレクトリ・モデルカタログを含む**登録可能なエンティティ**。列挙でなく登録される値
- **ProviderProfile**: `Provider` の実体。`backend` / `configDir` / `credential` / `models` / `extraEnv`
- **CredentialSource**: Provider の認証方式。9 種。推奨は `api-key-helper` / `aws-credential-export`
- **Model catalog**: Provider ごとに使えるモデルの集合。Bedrock は inference profile ID で pin
- **Reachability**: あるランタイムからある作業フォルダに**到達できるか**の 3 値 (`reachable`/`unreachable`/`blocked`)。
  `blocked` (解消手順がある) と `unreachable` を混ぜない
- **本 feature で glossary に追記する候補**: `DetectedCandidate` (検出候補) / `DerivedLaunchEnv` (導出 env)。
  `CredentialSource` / `ProviderProfile` / `Model catalog` は既存。Principle XIV に従い code 投入前に追記する

## 上流からの申し送りの棚卸し (必須)

**実行コマンド** (Grep ツール): `pattern = "007-provider-registration-and-reachability|X-3"`, `glob = "*.md"`,
リポジトリ全体。**総ヒット: 約 104 行** (docs / PLAN.md / specs 配下)。加えて機械強制対象
(`.dependency-cruiser.js` / `eslint.config.mjs` / `scripts/constitution/allowlists.mjs`) は新設モジュール名
`provider` で個別に走査した (`.dependency-cruiser.js` 1 hit / `eslint.config.mjs` は `secrets` 系 hit /
`allowlists.mjs` **0 hit**)。以下に**全ヒットへ処理を割り当てる**。

### A. 機械強制の履行義務 (`.dependency-cruiser.js` / `eslint.config.mjs` / `check.mjs`)

| # | 申し送りの出所 | 本 feature での処理 | 割当 |
|---|---|---|---|
| A-1 | `.dependency-cruiser.js:232` `services-not-to-io` コメント「**X-3 の `ProviderService` を作るときは `from` に実名を足すこと**」。現 `from` は `folder-service\|runtime-store\|session-service\|session-launch-service` (:253)。AD-027 Consequences 同旨 | **状態を持つ調停クラスを `src/main/app/` に作る場合** (`provider-service.ts` 等) は `from` に実名追加 + 違反 fixture 1 件 (`__rulecheck__/`)。**純粋関数 (domain) + 薄い IPC ハンドラで収める場合は追加不要** — plan Phase 2 で確定する (A-1 の要否判定を tasks に明記) | SH-上流1 / SH-020 |
| A-2 | `eslint.config.mjs:96-97` `SECRETS_PATTERN`/`SECRETS_FILES` = `src/main/infra/secrets/**`、`:357-363` electron import は **app レイヤと `infra/secrets/` のみ** (AD-023 §8)。R-1 が例外枠として予約済み・対象 0 件 (database-reviewer L-003) | **本 feature が `infra/secrets/` に最初の `.ts` (safeStorage ラッパ) を置く**。electron import は既に許可済みなので eslint/depcruise 変更は**不要**。ただし「対象 0 件だったルールが初めて発火する」ので、置いた後 lint / depcruise が緑であることを確認 | SH-006 / SH-021 |
| A-3 | database-reviewer L-003 / 322 (R-1): **Principle V の Automated 検証は SQL カラム型に依存し JSON 設定ファイルを検査できない**。「H-003 の Principle V 項目を入れるとき走査対象に `infra/secrets/**` を明示的に含める」。secrets を置く feature が (a) Principle V の Automated を通ること (b) `services-not-to-io` に実名を足すこと | **JSON 設定 (`ProviderProfile` 永続化) に秘密値カラムを持たせない**ことを SC-002 の静的検査 + security-reviewer で担保。**check.mjs に JSON 設定の秘密検査が無い残余**は `UNDETECTED_NOTES` に `nextFeature` 付きで記録するか、本 feature で最小の静的検査を足すかを plan Phase 2 で確定 (機械強制で捕まらない経路を列挙する。AD-027 規範) | SH-020 / SH-022 |
| A-4 | X-1 `buildLaunchEnv` の **`WSLENV`・資格情報 denylist** (FR-006 / AD-036 §6)。security-reviewer R-1: 「将来 `provider` (X-3) が API キーをプロセス環境に載せると `WSLENV` が自動的に共有経路になる」。**加えて AD-036 §6 は「`CLAUDE_CONFIG_DIR` を起動 env に含めるなら distro RuntimePath であることを検証する」と申し送っており、config-dir 方式を初めて使う本 feature がこの条件を満たす** | (i) **env 導出は X-1 の許可リスト枠組みを継承** (FR-009。passthrough 許可リストに `WSLENV`・資格情報 0 件を SC-003 で assert)。方式固有の実名 curated 注入 (api-key/oauth-token/aws-assume-role) は別勘定。(ii) **`CLAUDE_CONFIG_DIR` は `RuntimePath` へ変換してから注入** (FR-008。素の HostPath を載せない。SC-003 で assert。H-02) | SH-013 / SH-020 |
| A-5 | `allowlists.mjs` に `provider` **0 hit**。provider はプロセスを spawn しない (helper は Claude Code が実行、STS はネットワーク API) | **`PROCESS_SPAWN_MODULES` 等への追加は不要**。AWS SDK (`@aws-sdk/client-sts`) は新規 external 依存だが spawn ではない。依存追加は discovery 更新 + (要否を plan で判断し) 軽量 ADR に紐づける | SH-005 / plan Phase 0 |

### B. 設計判断の申し送り (ADR / 先行 spec / docs)

| # | 申し送り | 処理 | 割当 |
|---|---|---|---|
| B-1 | R-2 `contracts/session-enumeration.md:319` / `data-model.md:22,445` / glossary:183: **X-3 で `EnumerationTarget.origin` に `'provider'` が加わる。「集合の差し替えだけで済む形にしておく」** | **本 feature の core ではない** — 列挙への合流は `session` domain の責務。X-3 は `ProviderProfile.configDir` を**値として供給**するところまで (spec Out of Scope)。「集合差し替えだけで済む形」を壊さないことを確認し、実合流は後続へ繰り越す (該当処理: 値の供給形の確認) | spec Out of Scope / research |
| B-2 | `docs/discovery.md:86` 秘密保管 safeStorage「**absent (X-3 で入る)**」 | 本 feature が safeStorage を導入 → discovery.md Tech Stack 表の当該行と Directory Map に `infra/secrets/` の実体を反映 (convention-reviewer の drift 対策) | SH-005 |
| B-3 | charter Related Specs「未着手。X-3 が本 domain に属する」/ Open Questions SPIKE-7 `[x]` | charter の Related Specs に本 spec を追加。SPIKE-7 は既に解決済み表記のため追加変更不要 | SH-005 |
| B-4 | `docs/roadmap.md:180` X-3 行 / po-reviewer L-101 (R-1): AD-027 の X-3 への申し送り (services-not-to-io 実名) が roadmap にも欲しい | roadmap の X-3 行に着手/完了を反映 (post-merge)。A-1 の実名追加要否が確定したら roadmap にも 1 行残すか判断 | SH-005 (post-merge) |
| B-5 | [AD-039](../../docs/decisions/0039-credential-delegation-verified.md) Open Questions: (i) helper の live 実発火を stub helper で 1 度観測、(ii) `aws-assume-role` を `awsCredentialExport` 化する選択肢の採否 (持ち主 = X-3) | (i) を quickstart / research に載せ実装時に裏取り。(ii) の採否を research + plan で判断し、採用/非採用を AD-039 追記 or 新 ADR に記録 | research R-01 / R-02 |
| B-6 | `specs/005` `data-model.md:161` / `spec.md:346`: X-1 は「pre-launch 到達性判定は X-3、実行時 API/認証エラーの表示は X-1」と責務分界済み | 本 feature は **pre-launch 到達可能性判定** (FR-011/012) を担う。実行時 provider-error の表示は X-1 で実装済みなので重複しない (責務分界を踏襲) | spec (US-2) |

**「該当なし」判断**: `PLAN.md:693-694,790` は feature backlog / SPIKE 一覧の再掲で処理不要。
`ux-reviewer.md:33` の "UX-3" は別文脈 (grep 偽陽性)。specs/001・002・005 配下の reviewer 出力ファイルの
X-3 言及は**将来 feature への申し送り**であり、上記 A/B に集約済み (services-not-to-io の実名 = A-1、
infra/secrets の到来 = A-2/A-3、WSLENV 共有経路 = A-4、EnumerationTarget origin = B-1 に対応)。

## Technical Context

- **Stack** ([docs/discovery.md](../../docs/discovery.md) を正とする): TypeScript 5.9 / Electron 39 /
  electron-vite 5 / React 19 / Tailwind 4 / `@assistant-ui/react` 0.15 / zustand 5 /
  `@anthropic-ai/claude-agent-sdk` 0.3.270 / Vitest 5。**新規依存候補**: `aws-assume-role` 方式のための
  AWS SDK (`@aws-sdk/client-sts`) — 導入要否と隔離方針を Phase 0 で確定 (A-5 / B-5)
- **Build / Test / Lint** ([docs/discovery.md](../../docs/discovery.md) の「agent 用」列を正とする):
  lint = `node node_modules/eslint/bin/eslint.js --cache .` / typecheck = 2 project の `tsc --noEmit` /
  depcruise = `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` /
  check:constitution = `node scripts/constitution/check.mjs` / test = Vitest。**E2E は Playwright** (X-2 導入済)
- **レイヤ配置** (AD-023 の 5 レイヤ):
  - `domain/provider/` — **純粋関数** (I/O なし。`ui` からも `agents`/`app` からも呼べる):
    `ProviderProfile → 導出 env` (`deriveLaunchEnv`。curated base を spread・denylist 適用) /
    Provider × ランタイムの**到達可能性判定** (`assessReachability`。runtime の `Reachability` を再利用) /
    **検出結果の正規化** (`normalizeDetectedCandidates`。登録前候補の整形・重複判定) / `CredentialSource` 型
  - `infra/settings/` — `ProviderProfile` の **JSON 永続化** (R-1 と同じ設定層。**秘密は持たず参照キーのみ**)
  - `infra/secrets/` — **safeStorage ラッパ** (`api-key` / `oauth-token` の参照値。本 feature が最初の `.ts`。
    electron import 許可済み枠 AD-023 §8)
  - `infra/` (aws 境界) — `aws-assume-role` の **STS `AssumeRole`** (AWS SDK 依存をこの方式に閉じる。
    一時資格はメモリのみ・非永続・期限監視。AD-039 D4)。検出の I/O (config dir 走査 / `~/.aws/config` 読み取り /
    env 走査) の I/O 境界も `infra` に閉じる (Principle II)
  - `main/app/` — IPC (Provider CRUD / 検出 / 到達可能性 / env 導出の呼び出し) + 合成。**状態を持つ調停クラスを
    作る場合は `services-not-to-io` に実名追加** (A-1)
  - `renderer/src/features/provider/` — 登録・検出提示・選択 UI (assistant-ui element を照合。Principle XIII)

## Architecture: 秘密を持たない導出パイプライン

**アプリは資格情報のライフサイクルに関与しない** (charter 設計上の要)。`ProviderProfile` は秘密の実体を持たず、
起動のたびに Provider から (a) `env` マップ、(b) 必要なら inline `settings` (helper パス)、を**純粋関数**で導出する。

```
検出 (infra: config dir / ~/.aws/config / env 走査)
   │  DetectedCandidate[] (登録前候補・提示のみ)
   ▼
利用者の明示操作 (renderer)  ──登録──▶  ProviderProfile
   │                                        │ (秘密の実体は持たない。
   │                                        │  api-key/oauth-token は safeStorage 参照キー)
   ▼                                        ▼
infra/settings (JSON 永続化・参照キーのみ)   infra/secrets (safeStorage: 参照値)
   │
   ▼  セッション起動時 (X-1 の launch と合流するのは X-4。本 feature は導出まで)
infra が先に解決 (I/O 境界):
   ├─ infra/secrets: api-key/oauth-token の safeStorage 参照キーを復号 → 秘密値 (string)
   ├─ (R-02) aws-assume-role は STS を**アプリで呼ばない** — helper パスを settings.awsCredentialExport で委譲
   └─ infra/runtime: config-dir の configDir(HostPath/UNC) → RuntimePath へ変換 (PathMapping 経由)
   ▼  復号済みの値・変換済み RuntimePath を「引数」で渡す (純粋関数は I/O しない)
domain/provider: deriveLaunchEnv(profile, runtime, resolved) → 純粋
   │  ├─ curated base を spread (PATH/HOME 等)。process.env 継承に頼らない (AD-039 D3)
   │  ├─ passthrough 許可リストに WSLENV・資格情報パターンを含めない (X-1 FR-006 継承)
   │  ├─ 方式固有 curated 実名注入: api-key=ANTHROPIC_API_KEY / oauth-token=CLAUDE_CODE_OAUTH_TOKEN /
   │  │   aws-profile=AWS_PROFILE(+AWS_REGION/Bedrock は CLAUDE_CODE_USE_BEDROCK) (resolved から。実名固定集合)
   │  ├─ config-dir: CLAUDE_CONFIG_DIR は resolved の RuntimePath を注入 (素の HostPath を載せない。AD-036 §6)
   │  └─ helper: apiKeyHelper/awsCredentialExport のパスを HelperSettings に (2 キー限定。AD-040)
   ▼
{ env, settings?: HelperSettings }  ──▶  env は X-4 が RuntimeLaunchSpec.env (infra/runtime) に合流
                                          (AD-036 §3 の custom spawn は Options.env を無視。§6 denylist locus を通す。M-101)。
                                          settings は buildQueryOptions (一次ゲート。SH-001b) を通し、query 直前に
                                          settings キー ⊆ {apiKeyHelper, awsCredentialExport} を assert (backstop。AD-040)

到達可能性: assessReachability(profile→Location, runtime)
   config-dir 系は configDir から所在(Location)を導出し、env.CLAUDE_CONFIG_DIR の指す先へ runtime が
   到達できるか (Reachability 再利用)。所在不特定は非 reachable に写像 (fail-closed)
   → 到達できる Provider だけを選択肢に出す (FR-012)
```

- **9 種 `CredentialSource` の分岐は AD-039 §3 マトリクスに 1:1 対応**する。domain の純粋関数が
  backend/credential + `resolved` (infra が復号/取得/変換した値) から導出物を返し、**純粋関数自身は
  `safeStorage` / STS / ファイルを呼ばない** (I/O は infra が先に済ませ引数で渡す。H-001/H-003 対応。
  AD-023 §3/§7)。**秘密の実体もライフサイクルも持たない** (`aws-assume-role` を除く 8 方式)
- **`aws-assume-role` のみアプリが一時資格を扱う** (AD-039 D4)。`awsCredentialExport` 化 (helper スクリプト化して
  期限監視を Claude Code に寄せる) の採否は research R-02 で判断する
- **到達可能性判定は runtime の `Reachability` を再利用**し、provider domain は判定ロジック
  (configDir→所在→config-dir が届くか) のみを足す (AD-039 §5。判定の実装が本 feature のスコープ)

## Constitution Check

| Principle | 本 feature での遵守 | 検証 |
|---|---|---|
| **V** (資格情報を永続化しない) | 秘密の実体を持たない。`api-key`/`oauth-token` は `safeStorage` 参照キーのみ / `extraEnv` は永続前に値スキャンし秘密値を拒否 (H-09) / helper は per-session 制約付き `settings` / `aws-assume-role` は一時資格メモリのみ非永続 / `DetectedCandidate` は env 値を運ばない (H-10) / ログに env・秘密を出さない | SC-002 静的検査 + security-reviewer。**check.mjs に Principle V 項目が無い残余 (H-11) は `infra/settings/**` の JSON 永続化に対する秘密検査を項目追加するか、`UNDETECTED_NOTES` に nextFeature owner 付きで登録し SC-002 文面を手動+test に正直化する (SH-010 で確定。AD-024 #9 / AD-027)** |
| **I** (パス操作は domain のパス API 経由) | `configDir` は `HostPath`。到達可能性は runtime の `PathMapping`/`Reachability` を再利用し、生パス連結をしない | depcruise `path-module-only-from-path-api` + 到達可能性純粋関数のテスト (SC-004) |
| **II** (プラットフォーム分岐は infra 内) | 検出の OS 依存 (`~/.aws/config` の所在・config dir 候補) の**プラットフォーム分岐は `infra/runtime/` に閉じる** (`PLATFORM_BRANCH_DIRS`=`src/main/infra/runtime/` のみ許可。検出モジュールが一般 `infra/` にあるなら `os`/`process.platform` を持ち込まず、base-path 解決を `infra/runtime` の能力 or domain のパス API 経由で得る。H-04)。domain/renderer に `process.platform` を書かない | `check.mjs` 項目 8 (`PLATFORM_BRANCH_DIRS`) + eslint boundaries (`os`/`process` は runtime-infra 限定)。R-04 で検出の OS 依存の置き場を確定 |
| **IV** (SDK 経由) | env / settings は SDK の `Options` で渡す (X-4 が起動時に合流)。アプリが `claude` を自前で叩かない | 呼び出し形の走査 (AD-039 が Options 型で裏取り済み) |
| **VII** (supervisor は Electron/native 非依存) | env 導出・到達可能性・検出正規化は `domain/provider` の純粋関数で `agents` から値で使える。`safeStorage` (Electron API) は `infra/secrets/` (main) に閉じ agents に漏らさない | depcruise `agents-not-to-electron/infra`。domain 純粋性 |
| **X** (正本はアプリ外) | 資格情報の正本とライフサイクルは Claude Code / OS キーチェーン側。アプリは参照キーと導出物のみ | — (構造的。秘密を保管しない) |
| **XI** (垂直スライス) | 「検出→明示登録→起動時の env 導出→到達で選択肢を絞る」観測可能な振る舞いを持つ | po-reviewer |
| **III** (権限モードは capability に従う) | 本 feature は権限モードを触らない (軸選択は X-4)。**helper を運ぶ `settings` は `HelperSettings` (2 キー限定) に閉じ、`permissions`/`permissionMode`/`env` を混入させない** (AD-036 §4 P1 の昇格面締め出しを AD-040 で維持したまま helper 2 キーだけ通す。C-001 対応)。env 導出が `--dangerously-*` / permissionMode 昇格経路を作らない | 導出 `settings` のキー集合 ⊆ {apiKeyHelper, awsCredentialExport} の単体テスト + `check.mjs` 項目 16 の違反 fixture (AD-040)。query 直前の実行時 assert |
| **XIII** (element 優先) | 登録・検出提示・選択 UI は assistant-ui の element を照合。無ければ候補名と不適合理由を PR に記載 | ux/convention-reviewer |
| **XIV** (Ubiquitous Language) | `DetectedCandidate` / `DerivedLaunchEnv` を glossary に追記。`CredentialSource`/`ProviderProfile`/`Model catalog`/`Reachability` は既存を踏襲 | architecture/po-reviewer |
| **XV** (Multi-language) | `CredentialSource` は参照キー (英語 code identifier)、日本語 UI への訳出は `ui`。失敗理由・警告文言も `ui` が訳す | (drift check) |

**新規 ADR**:
- **[AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) 起票済み (proposed)** —
  AD-036 §4 P1 (query options allowlist が `settings` を締め出す) と AD-039 D2 (helper = inline settings) を調停し、
  `settings` を `{apiKeyHelper, awsCredentialExport}` 2 キー限定の制約付き射影として許す。design-gate Round 1 の
  **C-001 の解消**。design-gate 通過で accepted へ。`check.mjs` 項目 16 / `QUERY_ESCALATION_OPTION_KEYS` の更新を本 ADR に紐づける
- **(要否を Phase 0 で確定)** AWS SDK (`@aws-sdk/client-sts`) の新規依存導入と `aws-assume-role` 方式への隔離
  (depcruise で aws-sdk を aws 境界 infra のみ import 可に。M-09) / `aws-assume-role` を直接 `AssumeRole` するか
  `awsCredentialExport` 化するか (AD-039 Open Question の決着。research R-02/R-03)。必要なら新 ADR を起票する。
**SPIKE-7 は AD-039 で accepted 済み**であり、本 feature は「蒸し返し」でなく実装判断として ADR を起票する。

## Phases

### Phase 0: Research ([research.md](research.md))
- **R-01**: helper (`apiKeyHelper` / `awsCredentialExport`) の live 実発火を **stub helper で 1 度観測**して
  AD-039 の型 + 公式ドキュメント判断を裏取りする (AD-039 Open Question)
- **R-02**: `aws-assume-role` を直接 `AssumeRole` するか **`awsCredentialExport` 化**するかを評価
  (期限監視をアプリが持つ vs Claude Code の cache-until-`Expiration` に寄せる。AD-039 Open Question)
- **R-03**: AWS SDK (`@aws-sdk/client-sts`) 導入の是非と bundle / 隔離コスト (A-5)
- **R-04**: 検出 (config dir 候補 / `~/.aws/config` パーサ / env 走査) の OS 差と I/O 境界の切り方
- **SPIKE-7 は完了済み** (AD-039)。新規 SPIKE は無い

### Phase 1: Data model & contracts (**作成済み**: [data-model.md](data-model.md) / [contracts/provider-registration.md](contracts/provider-registration.md) / [research.md](research.md))
`ProviderProfile` (AD-005 型) / `CredentialSource` 9 種 (AD-039 §3 参照) / `ModelCatalogRef` /
`DetectedCandidate` (env 値を運ばない) / `DerivedLaunchEnv` (`{ env, settings?: HelperSettings }`) /
`deriveLaunchEnv` の **resolved 引数の seam** (infra が復号/取得/変換した値を純粋関数へ渡す。H-03) /
到達可能性判定の入出力 (configDir→Location)。IPC 契約 (CRUD / 検出 / 到達可能性 / env 導出。**データのみ・
秘密非通過・名前付きチャネル・失敗時に payload を echo しない**。AD-023 §7/§8)、秘密の非保持表 (= AD-039 §3 参照)、
env 許可リスト (X-1 C-5 継承。passthrough vs 方式固有 curated 注入)。**design-gate Round 1 の H-05 (成果物不在) 解消**。

### Phase 2: 実装 (tasks.md が正)
BE (domain 純粋関数 / infra settings・secrets・aws / app IPC) → FE (renderer: 登録・検出提示・選択) →
Shared (allowlist 要否確定 / discovery・charter・glossary / 検証)。
**A-1 (services-not-to-io) の要否をここで確定**する — 状態を持つ調停クラスを作るなら実名 + fixture、
純粋関数 + 薄い IPC ハンドラで収めるなら不要。

### Phase 3: 検証
Vitest (SC-001〜SC-008 の計測経路: 検出 fake / env 導出純粋関数 / 到達可能性分岐 / STS・時計差し替え /
永続層・ログ走査) + 機械検証 (lint / typecheck / depcruise / check:constitution / test / test:rules) +
quickstart 実機 (検出→登録 / 到達で絞る / helper live 観測 R-01 / assume-role 期限監視)。

## Complexity / risks

- **`infra/secrets/` への初回配置** (A-2/A-3) — R-1 が例外枠として予約したが対象 0 件だった。safeStorage を置くと
  「electron import 許可・Principle V の JSON 自動検査不在・services 実名列挙」の 3 条件が同時に立つ
  (database-reviewer L-003)。**JSON 設定の秘密検査が check.mjs に無い残余**を明示し、SC-002 の静的検査 +
  security-reviewer で担保する (捕まらない経路を列挙。AD-027 規範)
- **env 導出の秘密透過** (A-4) — `WSLENV`・資格情報パターンが導出 env に混じると WSL 透過経路になる。X-1 の
  denylist を継承し、`api-key`/`oauth-token` の env 注入を Provider 指定の実名 1 個に限る (汎用パターン透過を作らない)
- **`aws-assume-role` の一時資格** — アプリが秘密を扱う唯一の例外。メモリのみ・非永続・期限監視の担保が要る。
  `awsCredentialExport` 化 (R-02) で Claude Code に寄せられれば例外を縮小できる
- **AWS SDK の新規依存** (R-03) — bundle 増と隔離。`aws-assume-role` 方式に閉じ、他方式に漏らさない
- **到達可能性判定の再利用境界** — runtime の `Reachability` を provider が正しく再利用し、config-dir が届くかの
  判定だけを足す (二重定義しない)

## Post-design re-check (design-gate 前の自己点検)

- [x] FR ↔ SC ↔ Acceptance の対応に欠落が無い (FR-001〜014 / SC-001〜010 / US-1〜4)
- [x] 上流申し送り (A-1〜A-5 / B-1〜B-6) 全件に割当先がある
- [x] 新規 ADR: C-001 の AD-040 を起票済み (proposed)。AWS SDK 依存 / assume-role 方式は Phase 0 で確定
- [x] charter Related Specs / discovery.md safeStorage 行の追随を tasks (SH-004/005) に含めた
- [x] 規則の正本 (AD-039 §3 / AD-005 型 / X-1 env 許可リスト C-5) を再掲せず参照形にした
- [x] design-gate Round 1 の C-001 を AD-040 + 制約付き `HelperSettings` で解消。H-01〜H-11 を spec/plan/tasks/data-model/contracts に反映
