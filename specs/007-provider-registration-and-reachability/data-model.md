# Data Model: Provider 登録と到達可能性判定 (X-3)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

型の正本は [AD-005](../../docs/decisions/0005-provider-as-registrable-value.md) (`ProviderProfile`) と
[AD-039](../../docs/decisions/0039-credential-delegation-verified.md) §3 (9 種 `CredentialSource` × 委譲マトリクス)。
本ファイルは X-3 が足す型・seam・不変条件を定める。**秘密の実体はどの永続型にも現れない。**

## §1 ProviderProfile (永続・秘密なし)

```ts
interface ProviderProfile {
  id: string;
  displayName: string;
  backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry';
  configDir?: HostPath | WslUncPath; // CLAUDE_CONFIG_DIR。WSL 内 config は UNC 名前空間 (AD-025 §2)。未指定なら既定
  credential: CredentialRef;         // 秘密の実体でなく「参照」
  models: ModelCatalogRef;
  extraEnv?: Record<string, string>; // 秘密値は持てない (§3 の値スキャンで拒否)
}
```

- **JSON 永続化** (`infra/settings/`。R-1 と同じ設定層)。**秘密値カラムを持たない** (FR-004 / SC-002)。
- **同一 backend 複数登録**の識別鍵は `id` (表示は `displayName`)。重複判定は (backend, configDir, credential 種別) で候補提示時のみ。

## §2 CredentialRef と CredentialSource (9 種)

`credential` は方式 (`CredentialSource`) と、方式ごとの**参照**を持つ判別 union。秘密の実体は持たない。

> **AD-005 型正本からの精緻化 (読み替え)**: AD-005 は `credential: CredentialSource` (9 種の認証方式 enum) と定める。
> `CredentialSource` は参照の置き場を持たないため、秘密非保持・参照のみ (Principle V / FR-004) を満たすには
> `credential: CredentialRef = { source: CredentialSource, ...非秘密の参照 }` に精緻化する (AD-005 の意図は保持・
> AD-005 は immutable なので本文は変えず本 data-model で読み替えを記録)。spec Key Entities / glossary の `credential`
> 表記も `CredentialRef` に揃える (Principle XIV。architecture M-101)。

| `source` (CredentialSource) | 参照が保持するもの | 委譲/注入 (正本 = AD-039 §3) |
|---|---|---|
| `config-dir` | `configDir` パスのみ | `env.CLAUDE_CONFIG_DIR` (§4 で RuntimePath 変換) |
| `in-app-login` | `configDir` パスのみ | `/login` 起動後 config-dir と同じ |
| `api-key-helper` | helper スクリプトの**パスのみ** | `settings.apiKeyHelper` (§4 `HelperSettings`) |
| `api-key` | `safeStorage` **参照キー**のみ | 起動時に復号 → `env.ANTHROPIC_API_KEY` (§4 resolved) |
| `oauth-token` | `safeStorage` **参照キー**のみ | 復号 → `env.CLAUDE_CODE_OAUTH_TOKEN` |
| `aws-profile` | プロファイル名のみ (秘密なし) | `env.AWS_PROFILE` + `AWS_REGION` + `CLAUDE_CODE_USE_BEDROCK=1` |
| `aws-credential-export` | helper スクリプトの**パスのみ** | `settings.awsCredentialExport` (`HelperSettings`) |
| `aws-assume-role` | ロール ARN 等の**メタ + 生成した helper スクリプトのパス** (秘密なし) | **awsCredentialExport 化 (R-02 決定)**: アプリが `AssumeRole` して一時資格を JSON 出力する helper を用意し `settings.awsCredentialExport` で渡す。**期限監視は Claude Code**。アプリは一時資格の実体を持たない |
| `env-passthrough` | 変数名の集合のみ (**値なし**) | 親環境を起動時に spread |

**`aws-assume-role` を除く 8 方式でアプリが持つのは参照キー / パス / メタ / 無**のいずれか (AD-039 §3)。

## §3 DetectedCandidate (登録前・env 値を運ばない)

```ts
interface DetectedCandidate {
  kind: 'config-dir' | 'aws-profile' | 'env-passthrough';
  displayLabel: string;
  meta: DetectedMeta;      // config dir パス / aws プロファイル名 / env 変数名の集合
  alreadyRegistered: boolean;   // 登録済みとの重複 (提示のみ。FR-002)
}
```

- **不変条件**: `env-passthrough` の `meta` は**変数名・存在のみ**を持ち、**env の秘密「値」を含まない** (H-10 / FR-002)。
  検出 (`infra`) は値を読まず名前/存在のみを DTO 化して境界を越える。
- **提示のみ・自動登録しない** (FR-002 / SC-001)。破損した `~/.aws/config` はその候補をスキップし他候補を継続 (SC-009)。

## §4 DerivedLaunchEnv と resolved seam (純粋関数の I/O 分離)

**`deriveLaunchEnv` は純粋関数**であり I/O を持たない (Principle VII / AD-023 §3/§7)。`infra` が先に解決した値を
`resolved` 引数で受ける (H-03)。

```ts
// infra が先に解決 (I/O 境界)
interface ResolvedCredential {
  apiKeyValue?: string;          // infra/secrets が safeStorage から復号 (api-key)
  oauthTokenValue?: string;      // 同上 (oauth-token)
  awsCredentialExportPath?: string;    // aws-assume-role の helper スクリプトパス (R-02: awsCredentialExport 化)
  configDirRuntimePath?: RuntimePath;  // infra/runtime が configDir(HostPath|WslUncPath) → RuntimePath 変換
                                       // (到達可能性 §6 と同じ classifyRawPath/parseWslUncPath 経由に一意化。H-101)
}

// 純粋関数 (I/O なし)
function deriveLaunchEnv(
  profile: ProviderProfile,
  runtime: RuntimeDescriptor,
  resolved: ResolvedCredential,
): { env: Record<string, string>; settings?: HelperSettings };

// helper を運ぶ制約付き射影 (2 キー限定。AD-040)
type HelperSettings = { apiKeyHelper?: string; awsCredentialExport?: string };
```

**env 導出の 2 経路 (型で分離。FR-009)**:
- **(a) passthrough 許可リスト**: curated base の実名集合 (`PATH` / `HOME` 等)。正本 = X-1 contracts C-5。
  **`WSLENV` と資格情報系パターンを含まない**。
- **(b) 方式固有 curated 実名注入**: `api-key`=`ANTHROPIC_API_KEY` / `oauth-token`=`CLAUDE_CODE_OAUTH_TOKEN` /
  `aws-profile`=`AWS_PROFILE`(+`AWS_REGION`/Bedrock は `CLAUDE_CODE_USE_BEDROCK`) の**実名固定集合**。`resolved` の値を注入。
  **`api-key-helper`/`aws-credential-export`/`aws-assume-role` は env に載せず `settings`(`HelperSettings`) で helper パスを渡す**
  (R-02: `aws-assume-role` も awsCredentialExport 化。アプリは一時資格を env に注入しない。FR-006)。

**不変条件**:
- `config-dir` は `resolved.configDirRuntimePath` (RuntimePath) を `env.CLAUDE_CONFIG_DIR` に載せる。**素の HostPath を載せない** (AD-036 §6 / H-02)。
- `settings` は `HelperSettings` (2 キー) に閉じ、`permissions`/`permissionMode`/`env` を組めない (C-001 / AD-040)。
  query() options に載せる直前 (agents) に `Object.keys(settings) ⊆ {apiKeyHelper, awsCredentialExport}` を assert (逸脱は throw)。
  一次ゲートは `buildQueryOptions` の `settings?: HelperSettings` リテラル追加 (AD-040 Decision 3。SH-001b)。
- **導出 env の注入 locus**: X-1 の AD-036 §3 で custom `spawnClaudeCodeProcess` は `Options.env` を無視し
  `RuntimeLaunchSpec.env` から spawn env を構成する。よって導出 `env` は **X-4 が `RuntimeLaunchSpec.env`
  (infra/runtime) に合流**させ、AD-036 §6 の denylist enforcement locus (SC-006(b) 最終 env) を通す (platform M-101)。
  「`Options.env` は置換」は SDK セマンティクス (spread 根拠) であり注入 locus の指定ではない。

## §5 一時資格の扱い — **N/A (R-02: awsCredentialExport 化)**

**アプリは一時資格の実体を扱わない。** `aws-assume-role` は helper スクリプト (`AssumeRole` して一時資格を JSON 出力) の
パスを `settings.awsCredentialExport` で渡し、**期限監視・cache・再取得は Claude Code** が所有する (research R-02)。
よって `TempCredential` 型・メモリ保持・アプリ側の期限監視 (旧 FR-013 / SC-005 / SC-008) は**本 feature では不要**になった。
`RoleSessionName` (アプリ名 + セッション ID。CloudTrail 追跡。AD-039 D4) は **helper スクリプト生成側**で設定する。

## §6 到達可能性判定 (configDir → Location → Reachability)

```ts
function assessReachability(profile: ProviderProfile, runtime: RuntimeDescriptor): Reachability;
// Reachability = 'reachable' | 'unreachable' | 'blocked' (runtime domain から再利用。AD-025)
```

- `config-dir` 系は `configDir` から**所在 (`Location`) を導出** (`classifyRawPath` / `parseWslUncPath`) してから
  runtime の `PathMapping` / `Reachability` に載せる (H-02)。
- **所在不特定 (`unknown-location` / `opaque-unc`) は非 `reachable` に写像** (fail-closed。M-06 / SC-004)。
- 到達できる Provider だけを選択肢に出す (FR-012)。除外時は理由キー (`unreachable`/`blocked`/所在不特定)。

## §7 ModelCatalogRef

- Provider ごとのモデル集合。**Bedrock は inference profile ID で pin** (alias 運用しない。FR-010 / SC-007)。静的保持 (動的取得は SPIKE-6)。

## §8 不変条件のまとめ (テスト対象 = SH-020)

1. 検出は提示のみ・自動登録 0 (SC-001)。
2. 永続型に秘密値カラム 0 / `extraEnv` の値スキャンで秘密値を拒否 (SC-002 / H-09)。
3. passthrough 許可リストに `WSLENV`・資格情報 0 / `CLAUDE_CONFIG_DIR` が RuntimePath (SC-003 / H-02)。
4. `settings` キー ⊆ `{apiKeyHelper, awsCredentialExport}` (SC-006 / C-001)。
5. 到達不可・所在不特定が選択肢に 0 (SC-004 / M-06)。
6. `aws-assume-role` は helper パス (`settings.awsCredentialExport`) のみを持ち、一時資格の実体をアプリが持たない (R-02。旧 SC-005/008 は N/A)。
7. `DetectedCandidate` に env 値が現れない (H-10)。
