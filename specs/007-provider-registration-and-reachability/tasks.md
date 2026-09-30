# Tasks: Provider 登録と到達可能性判定 (X-3)

**Spec**: [spec.md](spec.md) · [plan.md](plan.md) · [data-model.md](data-model.md) ·
[contracts/provider-registration.md](contracts/provider-registration.md)

**Status**: frontmatter (`spec.md`) の `status:` を正とする

## 規約

- タスク ID: `SH-` (Shared) / `BE-` (Backend: domain / infra / app) / `FE-` (Frontend: renderer)。
- `[P]` = 同 phase 内で他タスクとファイル競合せず並列実行可能。
- 各タスクに対応する FR / SC / 上流申し送り (A-*/B-*) を付す。
- User Story 単位で独立検証可能に並べる (Principle XI)。US-1 だけ実装しても「検出→明示登録で
  `ProviderProfile` が 1 件でき、秘密の実体がアプリに残らない」MVP になる。

---

## Phase 0: Foundation (Shared・多くが blocking)

- **SH-001** ✅ [Shared] **ADR** — (1) **[AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md)
  起票 → design-gate 通過で accepted**: AD-036 §4 P1 ↔ AD-039 D2 を調停し `settings` を 2 キー限定の制約付き射影で許す (C-001 解消)。
  (2)(3) **R-02 で `awsCredentialExport` 化を決定 → `@aws-sdk/client-sts` は入れない**。新規依存が無いため隔離 ADR は不要、
  期限監視は Claude Code 委譲。決定は research R-02 に記録 (AD-039 は immutable のため追記でなく research/spec に決着を残す。A-5 / B-5)
- **SH-001b** ✅ [BE] **C-001 の一次ゲート改修 (AD-040 Decision 3)** — `src/agents/session-core.ts` の
  `buildQueryOptions` の `BuiltQueryOptions` / `BuildQueryOptionsDeps` に **`settings?: HelperSettings` を
  オブジェクトリテラルで追加** (後段 spread/append 禁止 = P1 の正の構成を保つ)。これが load-bearing gate。
  settings を options に載せる主体は本タスク (X-1 コードの改修)、実際の Provider 選択→launch 配線は X-4 (architecture H-101)
- **SH-001c** ✅ [Shared] **C-001 の backstop 機械強制 (AD-040 Decision 4)** — `check.mjs` 項目 16 /
  `QUERY_ESCALATION_OPTION_KEYS` を「`settings` キー全禁止」から「`settings` は許すが値のキー集合が
  `{apiKeyHelper, awsCredentialExport}` を超えたら違反」へ更新。`allowlists.mjs` に `QUERY_SETTINGS_ALLOWED_KEYS` を追加し、
  **3 キー目を混ぜた `settings` を検出する違反 fixture** を `tests/rule-fixtures/` に置く。**項目 16 は grep backstop
  (変数形 settings は中身を見られない)。UNDETECTED_NOTES に backstop の限界を記録** (M-102。load-bearing は SH-001b + BE-010b)
- **SH-002** ✅ [Shared][P] `domain/provider/` に型定義 — `ProviderProfile` (AD-005 型) / `CredentialSource` (9 種。
  AD-039 §3 参照) / `ModelCatalogRef` / `DetectedCandidate` / `DerivedLaunchEnv` / 到達可能性判定の入出力型。
  **I/O を持たない** (data-model §1)。`configDir` は `HostPath` (Principle I)
- **SH-003** ✅ [Shared][P] glossary に **`DetectedCandidate` / `DerivedLaunchEnv`** を追記 (Principle XIV。code 投入前)。
  `CredentialSource` / `ProviderProfile` / `Model catalog` / `Reachability` は既存を踏襲し矛盾を生まない (FR-014)
- **SH-004** ✅ [Shared][P] charter 追随 — `docs/domains/provider/charter.md` の Related Specs に本 spec を追加
  (「未着手」を外す)。Open Questions の SPIKE-7 は既に `[x]` (AD-039) のため変更不要 (B-3)
- **SH-005** ✅ [Shared][P] `docs/discovery.md` 追随 — Tech Stack 表「秘密保管 safeStorage」行を `absent (X-3 で入る)`
  から **present** に更新し、Directory Map に `src/main/infra/secrets/` の実体と `src/main/infra/settings/` の
  Provider 永続化を反映 (convention-reviewer drift 対策。B-2)。`docs/roadmap.md` X-3 行は post-merge で着手/完了反映 (B-4)

---

## US-1 — 検出候補を提示し、明示操作で Provider を登録する (P1)

**独立検証**: 検出レイヤ (ファイルアクセス / env 読み取り) を fake にし、提示のみ + 明示操作での登録を確認。自動登録 0 件。

- **BE-001** ✅ [BE] `infra/` (検出境界) — config ディレクトリ候補 / `~/.aws/config` プロファイル / 既存 env を
  走査し **`DetectedCandidate[]` を返す** (I/O は infra に閉じる。Principle II)。**登録は行わない** (FR-002, SC-001)
- **BE-002** ✅ [BE][P] `domain/provider/` — **`normalizeDetectedCandidates`** 純粋関数。登録前候補の整形・
  登録済みとの重複判定・3 由来 (config dir / aws profile / env passthrough) の正規化 (FR-002。I/O なし)
- **BE-003** ✅ [BE] `infra/secrets/` — **safeStorage ラッパ** (`api-key` / `oauth-token` の参照値を預け参照キーを返す。
  復号は起動時の env 導出でのみ)。**本 feature が `infra/secrets/` に最初の `.ts` を置く** (electron import 許可済み枠
  AD-023 §8。A-2)。safeStorage 不可環境では登録拒否 + 理由 (Edge Case) (FR-004, SC-002)
- **BE-004** ✅ [BE] `infra/settings/` — `ProviderProfile` の **JSON 永続化** (R-1 と同じ設定層)。**秘密値カラムを
  持たず参照キーのみ** (SQLite スキーマは持たない。I-1)。同一 backend 複数登録を許す鍵設計 (FR-001/004, SC-002)。
  **永続前に `extraEnv` の値をスキャン**し秘密らしい形 (`sk-`/`AIza`/`ghp-`/長大トークン/AWS キー形) は登録拒否
  (無害キー名の下の秘密値を平文 JSON に焼き込ませない。H-09。純粋関数 = domain の scan、拒否は app/infra)
- **BE-005** ✅ [BE] `main/app/` — `provider.detect` / `provider.register` IPC ハンドラ (送信元・ペイロード検証)。
  検出結果を提示用に返し (**DetectedCandidate は env 値を運ばない**。H-10)、登録は明示操作のペイロードでのみ実行。
  **失敗/例外時は理由キーのみの構造化エラーを返し、入力 payload (秘密) や stack を renderer へ返さず・ログに残さない**
  (contracts C-3。M-02 / CWE-209) (FR-002/007, SC-001)
- **FE-001** ✅ [FE] `renderer/src/features/provider/` — **検出候補の一覧提示 + 登録フォーム** (表示名 +
  `CredentialSource` 選択 + `api-key`/`oauth-token` の秘密入力)。assistant-ui element を照合 (Principle XIII)。
  空状態 (候補ゼロ) を空白にせず手動登録導線を出す (FR-002, SC-001)
- **FE-002** ✅ [FE][P] `renderer/` — `api-key`/`oauth-token` 秘密入力を **safeStorage 参照キーに変える経路のみ**
  (renderer に秘密を保持しない。境界を越えたら main が safeStorage へ)。ログ・状態に秘密を残さない (FR-004/007, SC-002)

---

## US-2 — 起動時に env を導出し、到達可能性で選択肢を絞る (P1)

**独立検証**: `ProviderProfile → env` 導出の純粋関数と到達可能性判定の単体テスト。到達不可 Provider が選択肢に 0 件。

- **BE-010** ✅ [BE] `domain/provider/` — **`deriveLaunchEnv(profile, runtime, resolved)`** 純粋関数 (**I/O なし**。
  `resolved` = infra が復号/取得/変換した値。data-model §4 の seam。H-03)。`Options.env` は置換なので **curated base を
  spread**、9 種 `CredentialSource` を AD-039 §3 に 1:1 分岐し、(a) `env` マップ (方式固有の**実名 curated 注入**。
  `config-dir` は `resolved.configDirRuntimePath` を `CLAUDE_CONFIG_DIR` に載せる。素の HostPath 不可。H-02) +
  (b) 必要なら **`HelperSettings` (2 キー限定。`Settings` 全体を組めない型)** を返す (FR-003/005/008, SC-003/006, C-001/AD-040)
- **BE-010b** ✅ [BE] `agents/` — query() options に載せる直前に **`settings` キー集合 ⊆ `{apiKeyHelper, awsCredentialExport}`
  を明示述語で assert** (`as` 禁止・逸脱は throw)。呼び出しは 1 箇所に集約 (contracts C-4。C-001/AD-040)。
  **実装**: `assertHelperSettings` (`src/domain/provider/settings.ts`) を `buildQueryOptions` (1 箇所) が呼ぶ形で集約。負例テスト済み
- **BE-011** ✅ [BE][P] `domain/provider/` — **env 導出の 2 経路を型で分離** (FR-009。A-4): (a) **passthrough 許可リスト**
  (X-1 C-5 継承。`WSLENV`・資格情報パターンを含めない)、(b) **方式固有の実名 curated 注入** (`api-key`=ANTHROPIC_API_KEY /
  `oauth-token`=CLAUDE_CODE_OAUTH_TOKEN / `aws-profile`=AWS_PROFILE(+AWS_REGION/Bedrock は CLAUDE_CODE_USE_BEDROCK) の
  実名固定集合)。**helper 系 (`api-key-helper`/`aws-credential-export`/`aws-assume-role`) は env に載せず settings で委譲**
  (R-02: aws-assume-role も awsCredentialExport 化。アプリは一時資格を env 注入しない)。汎用パターン透過を作らない (SC-003, H-01)
- **BE-012** ✅ [BE][P] `domain/provider/` — **`assessReachability(profile, runtime)`** 純粋関数。**configDir から所在
  (`Location`) を導出** (`classifyRawPath`/`parseWslUncPath`) してから runtime の `PathMapping`/`Reachability` に載せる
  (H-02)。`reachable`/`unreachable`/`blocked` を区別 (二重定義しない。AD-039 §5)。**所在不特定 (`unknown-location`/
  `opaque-unc`) は非 reachable に写像** (fail-closed。M-06) (FR-011, SC-004)
- **BE-013** ✅ [BE][P] `domain/provider/` — **モデルカタログ保持** (`ModelCatalogRef` + `ModelEntry.inferenceProfileId`)。
  **Bedrock は inference profile ID で pin** し alias 運用しない。型 + `provider-record` の round-trip 検証まで X-3
  (pin 保持を round-trip test で担保。SC-007)。**カタログを画面に投入し Provider 切替で差し替える UI は ⏭ X-4** (FE-010)
- **BE-014** ✅ [BE] `main/app/` — `provider.deriveEnv` / `provider.listReachable` IPC ハンドラ。到達できる Provider
  だけを選択肢用に返す。**helper 設定が per-session inline `settings` として渡り global settings.json に書かない**
  ことを保証 (FR-005/012, SC-004/006)
- **FE-010** ⏭ **X-4 へ繰越** [FE] `renderer/` — **ランタイム選択に連動した Provider 選択肢の絞り込み** (到達できる
  Provider だけ提示。除外理由を示す) と Provider 切替でのモデルカタログ表示更新。**US-2 の起動選択 UI 面であり
  起動統合 (X-4) に帰属**する (spec Out of Scope 改訂で確定。PO-H-001)。X-3 は判定エンジン + `listReachableProviders`
  IPC + `REACHABILITY_EXCLUDED_LABELS` ラベルをバックエンドとして提供済み (FR-011/012, SC-004 の単体まで)

---

## US-3 — 一時資格の期限を監視し、期限切れを明示する (P2)

**独立検証**: STS `AssumeRole` レイヤと時計を差し替え、期限前警告・実行中期限切れ・メモリのみを確認。

- **BE-020** ✅(部分) ⏭ **X-4** [BE] `infra/` — **`aws-assume-role` の awsCredentialExport 化** (R-02 決定)。**X-3 で完了した部分**:
  ユーザ入力の helper パスを検証し、`derive-env` が `settings.awsCredentialExport` (`HelperSettings`) に載せる
  (`aws-assume-role` → `awsCredentialExport` 射影)。**アプリ本体は `@aws-sdk/client-sts` を import せず、一時資格の
  実体を持たない** (期限監視は Claude Code)。**⏭ X-4 へ繰越**: `AssumeRole` して一時資格を JSON 出力し `RoleSessionName`
  (アプリ名 + セッション ID。CloudTrail) を仕込んだ **helper スクリプトのアプリ側生成/配置**と helper の起動配線
  (spec FR-006 改訂で X-4 帰属に確定。PO-H-003)。**M-09/M-103 の depcruise aws-sdk 隔離ルールは不要** (依存を入れない
  ため)。helper が AWS CLI/SDK を使うかは helper の実装事項 (FR-006)
- **BE-021** ✅ [BE] **N/A (R-02: awsCredentialExport 化)** — 期限監視を Claude Code に委譲したため、アプリ側の
  期限監視・閾値判定は実装しない (FR-013 / SC-005/008 が N/A)
- **FE-020** ✅ [FE] **N/A (R-02: awsCredentialExport 化)** — 期限監視を Claude Code に委譲したため、期限前警告・
  期限切れ明示 UI は本 feature では実装しない (FR-013 / SC-008 が N/A)

---

## US-4 — Provider を編集・削除し、同一 backend を複数登録する (P2)

**独立検証**: `ProviderProfile` ストアの CRUD と削除時の safeStorage 参照キー解放を確認。

- **BE-030** ✅ [BE] `infra/settings/` + `main/app/` — `provider.update` / `provider.delete` IPC ハンドラと
  ストア CRUD。**同一 backend 複数登録**を表示名で識別。編集時 `api-key`/`oauth-token` は**再入力時のみ**
  safeStorage 更新。削除時に紐づく **safeStorage 参照キーを解放** (秘密の実体を残さない) (FR-001/004, SC-002/010)
- **FE-030** ✅ [FE] `renderer/` — Provider 一覧 + 編集・削除 UI。本番用/検証用 Bedrock を別 Provider として並べる。
  **外部由来文字列 (displayName / 検出候補の aws プロファイル名・env 変数名・config dir パス) は React 既定エスケープで
  描画し `dangerouslySetInnerHTML`/`innerHTML` を使わない** (L-08) (FR-001, SC-010)

---

## 横断 (Principle V / defense-in-depth)

- **SH-010** ✅ [Shared] **Principle V の Automated ガードを建てる (H-11)** — check.mjs は現状 Principle V 項目が 0 件
  (bad_pattern_grep は SQL 型隣接のみで JSON 設定を検出できない。security H-004)。**check.mjs に項目 17 を追加**し、
  `src/main/infra/settings/**` `src/main/infra/secrets/**` の**本体ソース**の文字列リテラルを既知プレフィクスの秘密
  (sk-/AKIA/ghp_/glpat-/xox…-/AIza/PEM) で走査 (`SECRET_LITERAL_SCAN_DIRS` / `SECRET_LITERAL_PATTERN`。test 除外)。
  実ソース緑・正の fixture (`principle-v-hardcoded-secret` → `#17` 発火) で恒久的に機械検証
  (AD-024 #9 / database-reviewer R-1 L-003)。**建てられない残余は `UNDETECTED_NOTES` に nextFeature=X-4 で登録**
  (`principle-v-unknown-shape-secret` = 未知形式 + runtime `providers.json` の値は静的に見えない。runtime は
  `scanExtraEnvForSecrets` エントロピー + BE-004 登録拒否 + SC-002 が load-bearing)。SC-002 の文面は「ソース固定
  プレフィクス grep + runtime 値スキャン + test」の範囲を正直に記す (AD-027 規範)。併せて (a) 導出 env の passthrough に
  `WSLENV`・資格情報 0 (`deriveLaunchEnv` denylist H-101)、(b) ログに env/秘密 0 (FR-004/007/009, SC-002/003)
- **SH-011** ✅ [Shared] **`services-not-to-io` の実名追加** (A-1 / M-07) — **実装で確定: 調停クラスが要る**。
  Provider CRUD は読み込んだ profiles を保持し store/secrets/検出を調停する状態持ちであり、folder-service と同型の
  `provider-service.ts` を作った (I/O はインタフェース注入・type-only import で node core を直接持たない)。
  `.dependency-cruiser.js` の `services-not-to-io` `from` に **`provider-service` を実名追加**し comment を更新
  (AD-027 Consequences の履行)。違反 fixture は既存 `service-io-import.ts.fixture` がルール発火を担保。depcruise 緑で確認済

---

## Phase 3: 検証 (Shared)

- **SH-020** ✅ [Shared] SC-001〜SC-010 の **Vitest** を書く — 検出レイヤ / env 読み取り / STS `AssumeRole` / 時計を
  差し替えた単体、`deriveLaunchEnv`・`assessReachability`・`normalizeDetectedCandidates`・許可リスト適用・期限監視
  閾値・`extraEnv` 値スキャンの**純粋関数**、永続層 (JSON) とログの秘密走査。**負例**: (i) `process.env` を素通しした
  env が拒否、(ii) `WSLENV`/資格情報 fake を **passthrough 許可リスト**に入れない、(iii) helper 導出が global
  settings.json に書かず `HelperSettings` を返す、(iv) 到達不可 Provider が選択肢に 0 件、(v) 一時資格が永続層・ログに
  現れない、**(vi) 無害キー名の下の秘密値 (`FOO=sk-...`) が `extraEnv` 登録拒否される (H-09)、(vii) `DetectedCandidate`
  に env の値が現れない (名前/存在のみ。H-10)、(viii) 導出 `settings` のキー集合 ⊆ `{apiKeyHelper, awsCredentialExport}`
  で `permissions`/`permissionMode`/`env` を混ぜると fail (C-001/AD-040)、(ix) `config-dir` の `CLAUDE_CONFIG_DIR` が
  RuntimePath で組まれ素の HostPath を素通ししない (H-02)、(x) 所在不特定 configDir が非 reachable に写像され選択肢に 0
  (M-06)、(xi) 破損 `~/.aws/config` はスキップし他候補を継続 + 検出網羅ケース (SC-009)、(xii) 期限閾値 5 分前の境界値で
  警告発火 (SC-008)、(xiii) 同一 backend 複数登録の識別 + 削除時の safeStorage 参照キー解放 (SC-010)、
  **(xiv) helper 方式で `settings` が `buildQueryOptions` 経由で query options に現れる*正例* + 後段 append が無い構造確認
  (SH-001b。C-001 の正の flow)、(xv) query 直前の実行時 assert が 3 キー目/変数形 settings を throw する負例 (BE-010b)、
  (xvi) UNC 入力 configDir が `parseWslUncPath` 経由で RuntimePath に変換される (H-101)、(xvii) 既登録重複で二重登録導線 0
  (AC-5) / safeStorage 不可で理由付き拒否 (AC-6) / extraEnv KEY (WSLENV/AWS_*) が導出 env に現れない (security H-101) /
  権限不足の config 読み取り失敗はスキップし他候補継続 (po L-102)**
- **SH-021** ✅ [Shared] 機械検証を通す — **lint** (`node node_modules/eslint/bin/eslint.js --cache .`) /
  **typecheck** (2 project の `tsc --noEmit`) / **depcruise** (`agents-not-to-electron/infra` / `domain-not-to-io`
  (`deriveLaunchEnv` が I/O しない = 緑。H-03) / `services-not-to-io` / **aws-sdk 隔離ルール** M-09) /
  **check:constitution** (**項目 16 の AD-040 更新後、helper 2 キー限定 settings が緑・3 キー目 fixture が違反検出**。
  Principle V 項目 SH-010 が緑) / **test** (Vitest 全件) / **test:rules** (SH-001b の違反 fixture)。
  `infra/secrets/` 初回配置後に lint/depcruise が緑であること (A-2)。`services-not-to-io` の判断 (SH-011) を最終確認
- **SH-022** ✅ [Shared] quickstart を実機で記録 (`quickstart-results.md`) — 検出→登録 / 到達で絞る / **helper live
  観測** (stub helper で 1 度発火。R-01/AD-039 Open Question) / `aws-assume-role` 期限監視。実機操作は人間 deferred、
  **実機確認済 (2026-09-30)**: US-1 (検出・登録・編集・削除) は実機 OK。到達フィルタ UI / helper live / catalog は X-4、期限監視は N/A (R-02)。判定表は quickstart-results.md。
  判定表の記録は done 必須

---

## Backend Tasks (index)

`domain/provider` / `infra` (settings / secrets / aws / 検出境界) / `main/app` に属するタスク:
BE-001〜005 / BE-010〜014 / BE-020〜021 / BE-030。**純粋関数** (env 導出・到達可能性・検出正規化・期限閾値) は
`domain/provider`、**I/O** (検出・JSON 永続化・safeStorage・STS) は `infra`、**IPC/検証/合成**は `main/app`。

## Frontend Tasks (index)

`renderer/src/features/provider/` に属するタスク: FE-001〜002 / FE-010 / FE-020 / FE-030。
検出提示 + 登録フォーム・到達で絞った選択・モデルカタログ表示・期限警告・CRUD UI。assistant-ui element を照合。

## Shared Tasks (index)

DB migration は無い (JSON 設定層 + safeStorage。SQLite 永続化は I-1)。共有は **型 / glossary / charter / discovery /
ADR 要否 / 機械強制の許可リスト / 検証** に相当: SH-001〜005 / SH-010〜011 / SH-020〜022。
API contract に相当するのは IPC 契約 ([contracts/provider-registration.md](contracts/provider-registration.md))。

## Dependencies / 実行順

1. **SH-001 (ADR 要否) と SH-002 (型) が先行**。SH-003〜005 (glossary/charter/discovery) は並行可。
2. US-1 (検出→登録) → US-2 (導出・到達可能性) → US-3 (期限監視) → US-4 (CRUD) の順に垂直スライスを積む。
   US-1 完了時点で「検出→明示登録で `ProviderProfile` が 1 件でき秘密の実体が残らない」MVP。
3. BE-020 (STS) は SH-001 (AWS SDK 依存の ADR 要否) の後。SH-010/011 は各 US の実装後。
4. Phase 3 (SH-020〜022) は各 US 実装後。SH-021 の全件テストは最終 iteration。
