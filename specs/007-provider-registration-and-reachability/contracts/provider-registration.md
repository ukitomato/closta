# Contracts: Provider 登録と到達可能性判定 (X-3)

**Spec**: [../spec.md](../spec.md) · **Data model**: [../data-model.md](../data-model.md)

IPC 契約。[AD-023](../../../docs/decisions/0023-application-architecture.md) §7/§8 の
「**データのみのプロトコル**」「SDK クライアント・コールバック・AbortSignal・File を IPC に通さない」
「main が送信元とペイロードを**未信頼として検証**」「preload は**単一 capability**の名前付き面」に従う。

## C-1 IPC チャネル (renderer → main、名前付き invoke のみ)

**汎用 `invoke(channel, ...args)` パススルーを露出しない** (channel allowlist を消さない。security L-02)。

| チャネル | 入力 (データのみ) | 出力 (データのみ) | main 検証 |
|---|---|---|---|
| `provider.detect` | (なし) | `DetectedCandidate[]` (**env 値を含まない**。data-model §3) | 送信元 |
| `provider.register` | `{ displayName, backend, credentialInput, models, extraEnv? }` | `{ id }` or `{ error: reasonKey }` | 送信元 + ペイロード + **extraEnv 値スキャン** (H-09) + safeStorage 可否 (M-03) |
| `provider.update` | `{ id, patch }` | `{ ok }` or `{ error }` | 送信元 + id 実在 + patch 検証 |
| `provider.delete` | `{ id }` | `{ ok }` | 送信元 + id 実在 (削除時 safeStorage 参照キー解放) |
| `provider.list` | (なし) | `ProviderProfile[]` (**参照のみ・秘密なし**) | 送信元 |
| `provider.listReachable` | `{ runtimeId }` | `{ reachable: ProviderSummary[], excluded: {id, reason}[] }` | 送信元 + runtimeId 実在 |
| `provider.deriveEnv` | `{ providerId, runtimeId }` | `{ ok }` (導出は main 内で完結。**env/settings を renderer へ返さない**) | 送信元 + 実在 + 到達可能性 |
| `providerLoadIssues` (**X-4 で追加**。[AD-042](../../../docs/decisions/0042-provider-type-refinement-and-d4-lapse.md) Decision 4) | (なし) | `{ skippedOnLoad: number, wholeFileUnreadable: boolean, storeNewerVersion: boolean }` (件数と種別のみ。名前・値・パスは返さない) | 送信元 |

- **`credentialInput`**: `api-key`/`oauth-token` の秘密は renderer → main へ渡り、**main が `safeStorage` へ預けて
  参照キーに変える**。以後 renderer は参照キーも秘密値も保持しない (FR-004)。renderer 状態・ログに秘密を残さない。
- **`deriveEnv` の出力に env / settings の中身を載せない** — 導出物 (`DerivedLaunchEnv`) は main/agents 内に留め、
  X-4 が起動時に `query()` へ渡す。renderer は「導出できた/できない」だけを知る。

## C-2 秘密の非通過表 (どの経路に何が乗るか)

| 経路 | 乗ってよいもの | 乗せてはいけないもの |
|---|---|---|
| `detect` の戻り | 変数名・存在・config dir パス・aws プロファイル名 | **env の値**・秘密 (H-10) |
| `register` の入力 | `api-key`/`oauth-token` の秘密 (safeStorage 行き) | — |
| `register` 以外の戻り | 参照キー・メタ | 秘密の実体 |
| `deriveEnv` の戻り | `{ ok } \| { error: reasonKey }` | env / settings の中身・秘密 |
| ログ・エラー・crash | 理由キー・Provider id・sessionId | **env・秘密・payload** (FR-007) |

## C-3 失敗時の contract (payload を echo しない。security M-02 / CWE-209)

- ハンドラが throw / reject する場合、**理由キーのみの構造化エラー** (`{ error: reasonKey }`) を返す。
  例外のスタックトレースや**入力 payload (秘密を含む) を renderer へ返さない・ログに残さない**。
- 失敗理由キー例: `safestorage-unavailable` / `extraenv-secret-detected` / `provider-not-found` /
  `runtime-not-found` / `unreachable` / `assume-role-failed` / `temp-cred-expired`。

## C-4 制約付き settings の消費 contract (C-001 / AD-040)

- `deriveEnv` が生成する `settings?` は `HelperSettings` (`{ apiKeyHelper?, awsCredentialExport? }`)。
- **X-4 が `query()` options に載せる直前 (agents `sdk-agent-session.ts`) で
  `Object.keys(settings) ⊆ {apiKeyHelper, awsCredentialExport}` を明示述語で assert** し、逸脱は throw。
- 機械強制: `check.mjs` 項目 16 / `QUERY_ESCALATION_OPTION_KEYS` を「`settings` に helper 2 キー以外が現れたら違反」に更新
  (`QUERY_SETTINGS_ALLOWED_KEYS = ['apiKeyHelper','awsCredentialExport']`)。違反 fixture = 3 キー目を混ぜた settings。

## C-5 env 許可リスト (X-1 C-5 継承 + 本 feature の追加規則)

- **passthrough 許可リスト**の実名集合は X-1 contracts C-5 が正本 (再掲しない)。`WSLENV`・資格情報パターンを含まない。
- **方式固有 curated 実名注入** (data-model §4(b)) は passthrough とは別勘定で型分離する。
- `aws-assume-role` の 3 AWS 変数を **WSL ランタイムへ `WSLENV` 透過で届けない** (research R-02 で届け方を確定)。

> **読み替え (後続 ADR)**: X-4 で [AD-041](../../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e) により、次のように変わる。
> - 方式固有の実名注入と env-passthrough の varNames (実名 allowlist) は、導出が返す `forwardKeys` として、アプリが生成する `WSLENV` (`/u` のみ) で WSL へ届ける。
> - 親 env の `WSLENV` の透過は引き続き行わない。
> - curated base のキーと転送禁止キーは届けない。
