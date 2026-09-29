---
status: accepted
date: 2026-09-29
id: AD-039
deciders: ukitomato
tags: [provider, auth, sdk, security]
supersedes: []
superseded-by: []
---

# AD-039: 資格情報解決の Claude Code 委譲は SDK 0.3.270 で成立する（SPIKE-7）

## Context

SPIKE-7（認証委譲機構の確認）の結果。X-3（Provider 登録と到達可能性判定）の前提であり、
[AD-005](0005-provider-as-registrable-value.md)（Provider は認証方式を含む値）と
[AD-011](0011-delegate-credential-resolution.md)（資格情報の解決は Claude Code に委譲）の
**成立可否を検証する**（AD-011 Consequences が本 SPIKE を成立条件として名指ししている）。

検証すべき問い（PLAN.md §SPIKE-7 / [charter](../domains/provider/charter.md) Open Questions）:

- `apiKeyHelper` / `awsCredentialExport` / `awsAuthRefresh` の呼び出しタイミングと期限切れ再取得
- helper 設定をセッション単位の `--settings` で渡せるか
- macOS Keychain と `CLAUDE_CONFIG_DIR` を分けたときの相互作用
- アプリが「資格情報を保管せず、参照キー（`safeStorage`）+ 起動時の環境変数導出だけ」で委譲できるか

## 調査手法と一次情報の境界

2 系統の一次情報で確認した。**どちらまでが型で保証され、どこからが Claude Code の実挙動か**を分けて記す。

- **型 (surface)**: pin 済み `@anthropic-ai/claude-agent-sdk` **0.3.270**（同梱 `claudeCodeVersion` 2.1.270）の
  `sdk.d.ts` を実機で読んだ。AD-021（SPIKE-1）と同じく型定義を一次情報として扱う
- **実挙動 (timing/lifecycle)**: Claude Code / Bedrock の**公式ドキュメント**
  （`authentication` / `amazon-bedrock` / `settings-reference`）に基づく。型では分からない部分

**live な実行観測（実際に helper を発火させて呼び出し回数を測る）は本 SPIKE では実施していない。**
型 + 公式ドキュメントまでで AD-011 の成立可否は判定できる（下記 Decision 1）。

## 調査結果

### 1. 委譲に必要な拡張点はすべて SDK `Options` / `Settings` 型に実在する（型で保証）

```ts
// Options（query() に渡す）
settings?: string | Settings;      // "Equivalent to the --settings CLI flag"
                                   // "loaded into the 'flag settings' layer,
                                   //  which has the highest priority among user-controlled settings"
managedSettings?: Settings;        // "Intended for embedding applications (e.g. desktop apps)"
                                   //  restrictive-only の policy tier
settingSources?: ('user'|'project'|'local')[];  // [] で filesystem 設定を無効化（SDK isolation）
env?: { [k: string]: string | undefined };       // ↓
// Settings（settings.json スキーマ）
apiKeyHelper?: string;             // "Path to a script that outputs authentication values"
awsCredentialExport?: string;      // "Path to a script that exports AWS credentials"
awsAuthRefresh?: string;           // "Path to a script that refreshes AWS authentication"
gcpAuthRefresh?: string;           // Vertex 用（初期リリースは登録のみ）
env?: { [k: string]: string };     // "Environment variables to set for Claude Code sessions"
```

決定的な 2 点:

- **`Options.env` は subprocess 環境を「置換」する** — 型定義コメント: *"When set, this value
  REPLACES the subprocess environment entirely — it is not merged with `process.env`. Spread
  `process.env` yourself"*。AD-005 Consequences の「`env` は置換・spread 必須」を裏取りした
- **helper 設定はセッション単位の `settings` で渡せる** — `settings?: string | Settings` は
  `--settings` 相当で、inline `Settings` オブジェクトを query() ごとに渡せる。**グローバルの
  `~/.claude/settings.json` を書き換えずに** Provider ごとの helper を注入できる

補助:
`ApiKeySource`（`'ANTHROPIC_API_KEY' | 'apiKeyHelper' | ... | 'oauth'`）で、解決に使った出所を
Claude Code 側が報告する = **解決の所有権が Claude Code 側にある**ことの型的証左。

### 2. helper の呼び出しタイミングと再取得は Claude Code が所有する（公式ドキュメント）

| helper | 呼び出しタイミング | 期限切れ再取得の所有者 |
|---|---|---|
| `apiKeyHelper` | セッション開始・資格情報リロード・既定 **5 分** TTL（`CLAUDE_CODE_API_KEY_HELPER_TTL_MS`）・出力失効/401 時。失敗は 3 回までリトライ | **Claude Code** がキャッシュと再実行を管理。スクリプトは毎回「新鮮な値を返すだけ」でよい |
| `awsCredentialExport` | セッション開始・リロード時（default chain が有効でも走る）。出力は `{Credentials:{AccessKeyId,SecretAccessKey,SessionToken,Expiration}}` か `aws configure export-credentials --format process` の flat 形式 | **Claude Code** が `Expiration` の **5 分前**までキャッシュ（`Expiration` 無しは 1 時間） |
| `awsAuthRefresh` | **資格情報が失効と検知されたときのみ**。実行前に STS `GetCallerIdentity` で失効を確認し、生きていればスキップ。`.aws` を更新する系（`aws sso login` 等）向け | **Claude Code** が失効検知して起動。完了後に default chain を再解決 |

`/login`（対話 OAuth）とそのトークン自動更新も Claude Code が完全所有する（失効 3 日前に起動時警告 /
失効時は `/login` を促して失敗）。**埋め込みアプリはログインフローも 401 対応も再取得も持たなくてよい。**

### 3. 9 種 CredentialSource × 委譲マトリクス（PLAN.md §5.2 と対応）

| CredentialSource | 委譲メカニズム（SDK / env） | アプリが保持するもの | 期限切れ再取得の所有者 |
|---|---|---|---|
| `config-dir` | `env.CLAUDE_CONFIG_DIR` を対象 dir へ。Claude Code が `$DIR/.credentials.json` を読む | dir パス**のみ**（秘密なし） | Claude Code |
| `in-app-login` | アプリが `/login` を起動 → 以後 `config-dir` と同じ | dir パスのみ（秘密なし） | Claude Code |
| `api-key-helper` | `settings.apiKeyHelper` にスクリプトパス（per-session `settings`） | スクリプトの場所のみ（秘密なし） | Claude Code（5 分 TTL） |
| `api-key` | `env.ANTHROPIC_API_KEY` に注入 | **`safeStorage` 参照キーのみ**。起動時に復号して env 導出 | 静的キー。ライフサイクル無関与 |
| `oauth-token` | `env.CLAUDE_CODE_OAUTH_TOKEN` に注入 | **`safeStorage` 参照キーのみ** | 長命トークン（`claude setup-token`）。更新はユーザ再発行 |
| `aws-profile` | `env.AWS_PROFILE` + `AWS_REGION` + `CLAUDE_CODE_USE_BEDROCK=1` | 秘密なし（`~/.aws` を参照） | AWS CLI / SSO（Claude Code が default chain を解決） |
| `aws-credential-export` | `settings.awsCredentialExport` にスクリプトパス | スクリプトの場所のみ（秘密なし） | Claude Code（`Expiration` の 5 分前まで cache） |
| `aws-assume-role` | **アプリが STS `AssumeRole`** し一時資格を `env`（`AWS_ACCESS_KEY_ID`/`SECRET`/`SESSION_TOKEN`）に注入 | **一時資格情報のみ・メモリ上のみ**。長期キーは扱わない | **アプリ**（唯一の例外。期限監視・警告） |
| `env-passthrough` | 親プロセスの環境を `env` に spread | 秘密なし | 親環境の所有者 |

**`aws-assume-role` を除く 8 方式で、アプリが持つのは「参照キー」か「パス」か「無」のいずれか**であり、
秘密の実体もそのライフサイクルもアプリは持たない。AD-011 と charter Scope（Out of scope: ログインフロー /
期限切れ再取得 / 秘密の保管）は**変更不要でそのまま成立する**。

### 4. `CLAUDE_CONFIG_DIR` と鍵ストアの相互作用

- config dir ごとに独立した `$CLAUDE_CONFIG_DIR/.credentials.json` を持つ（macOS では Keychain エントリも
  その dir に紐づく）。よって **config dir を分ければ profile は自然に隔離される**
- アプリの `safeStorage` は `api-key` / `oauth-token` 方式の**参照値のみ**を持つ。Claude Code の
  per-config-dir `.credentials.json`（`/login` / `config-dir` 系の実体）とは**別ストア・別方式**で衝突しない
- 主開発ホスト（Windows）では `safeStorage` の裏は DPAPI。macOS Keychain 固有の相互作用は
  OPT-mac まで検証対象外

## Decision

### 1. AD-011 は成立する。委譲設計を維持する

SDK 0.3.270 で委譲に必要な拡張点（`settings` / `env` / helper 3 種 / `settingSources` / `managedSettings`）が
すべて実在し、helper の再取得は Claude Code が所有する。**AD-005 / AD-011 / charter Scope は変更不要。**

### 2. helper 設定は per-session の inline `settings` で渡す（グローバル settings.json を汚さない）

`api-key-helper` / `aws-credential-export` は、query() ごとに `Options.settings` へ inline `Settings`
オブジェクトとして注入する。`~/.claude/settings.json` に書かない。
**代償**: `--settings` は当該 invocation にのみ効く（公式ドキュメント）。したがって
**セッション起動のたびにアプリが Provider から `settings` を導出して渡す**設計とする（X-3）。

### 3. `env` は置換なので curated base を spread する（AD-005 の具体化）

`Options.env` を指定する以上、Provider 由来の変数だけでなく Claude Code が要る基盤変数
（`PATH` / `HOME` 等）も明示的に含める。無指定で `process.env` 継承に頼らない
（Provider 分離のため env を指定する場面が主だから）。ログに `env` を素で出さない（Principle V）。

### 4. `aws-assume-role` はアプリが一時資格を扱う唯一の例外として隔離する

一時資格情報のみ・メモリ上のみ・SQLite/ファイル非書き込み・期限監視 + 警告・`RoleSessionName` に
アプリ名 + セッション ID（AD-011 / charter 既定）。他 8 方式と経路を分け、AWS SDK 依存をこの方式に閉じる。

### 5. 到達可能性・隔離の制御は `settingSources` と `env.CLAUDE_CONFIG_DIR` で行う

`config-dir` 系 Provider の到達可能性（charter Journey 2: コンテナからホスト `~/.claude` は不可視）は、
`env.CLAUDE_CONFIG_DIR` の指す先へランタイムが到達できるかで決まる。ファイル層設定の漏れ込みを避けたい
場面では `settingSources: []` で遮断する。**到達可能性判定そのものの実装は X-3 のスコープ。**

## Consequences

- **SPIKE-7 は完了。** roadmap の SPIKE 一覧と charter Open Questions を更新する
- X-3 の `ProviderProfile → SessionLaunchConfig` 導出は、backend/credential から
  (a) `env` マップ、(b) 必要なら inline `settings`（helper パス）、の 2 つを生成する純粋関数になる
- Principle V の検証範囲は妥当。秘密の永続化面は `api-key` / `oauth-token` の `safeStorage` 参照のみに
  限局し、helper 方式は永続秘密を 0 にする
- managed settings による precedence の**厳密な順位**は本 SPIKE で一次確認できていない。
  SDK 型定義は `managedSettings` を「restrictive-only の policy tier」とだけ述べる。
  企業ロックダウン（`managedSettings` で網掛け）を使う場合の順位確定は X-3 か enterprise 対応時に持ち越す

## Open Questions

- [ ] **live 実挙動の確認**: helper の実発火回数・TTL 実測は未実施（型 + 公式ドキュメントまで）。
      X-3 実装時に stub helper で 1 度観測して裏取りする
- [ ] **`aws-assume-role` を `awsCredentialExport` 化する選択肢**: アプリの AssumeRole を
      「一時資格を JSON 出力する helper スクリプト」として実装すれば、Decision 4 の「アプリが期限監視」を
      Claude Code の cache-until-`Expiration` に委譲へ寄せられる。X-3 で採否を判断する（持ち主 = X-3）
- [ ] **precedence 厳密順位**: CLI フラグ / `--settings` / filesystem 各層 / managed / env の相対順を
      一次確認する（enterprise 対応時）
- [ ] `vertex`（`gcpAuthRefresh`）/ `foundry` は初期リリースでは登録のみ・検証対象外（charter）

## References

- SPIKE-7（docs/roadmap.md）、PLAN.md §5.2 / §SPIKE-7
- `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts`（`Options` / `Settings` / `SettingSource` / `ApiKeySource`）
- Claude Code 公式: `authentication` / `amazon-bedrock` / `settings-reference`（helper の timing / TTL / 出力形式）
- [AD-005](0005-provider-as-registrable-value.md) — Provider は認証方式を含む値
- [AD-011](0011-delegate-credential-resolution.md) — 資格情報の解決は Claude Code に委譲（本 ADR が成立を確認）
- [AD-002](0002-use-agent-sdk-not-cli.md) — SDK 経由。helper / settings / env は `Options` で渡す
- [AD-021](0021-session-store-and-enumeration.md) — 同じ「型定義を一次情報とする」手法の先行例
