---
domain: provider
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-09-12
related_adrs:
  - docs/decisions/0005-provider-as-registrable-value.md
  - docs/decisions/0011-delegate-credential-resolution.md
  - docs/decisions/0039-credential-delegation-verified.md
related_specs: []
---

# Domain Charter: provider

## Mission

`provider` domain は、**Claude Enterprise / Amazon Bedrock ほかを、認証方式ごとに登録可能な
Provider として一般化し、セッション起動時の実行環境を導出する**ことを担う。

「セッションごとに認証・モデルを変えたい」という課題に答える domain であり、本プロダクトの軸 2 にあたる。
**アプリが資格情報のライフサイクルに関与しないこと**が本 domain の設計上の要である。

## Scope

### In scope

- `ProviderProfile` の登録・編集・削除（同一バックエンドの複数登録を許す）
- 9 種類の `CredentialSource` の扱い
- 候補の検出と提示（config ディレクトリ候補、`~/.aws/config` のプロファイル、既存の環境変数）。
  **自動登録はしない**
- モデルカタログの保持（Bedrock は inference profile ID を pin する）
- Provider からセッション起動時の環境変数を導出する
- Provider とランタイムの到達可能性判定
- 一時資格情報の有効期限監視と警告
  （**R-02/AD-039: 直接 AssumeRole ブランチを採る場合のみ**。現行は `awsCredentialExport` 化で期限監視も Claude Code に委譲。[007](../../../specs/007-provider-registration-and-reachability/spec.md) 参照）

### Out of scope

- 資格情報そのものの保管 → OS キーチェーン（`safeStorage`）に預け、参照キーのみを持つ
- ログインフローの実装、期限切れ時の再取得ロジック → Claude Code に委譲する
- セッションの起動そのもの → `session` domain
- 登録 UI の element 選定と見た目 → `ui` domain

## Actors / Personas

- **エンドユーザ（開発者）**: 会社アカウントと個人アカウント、本番用と検証用のように
  複数の実行環境を使い分けたい。資格情報をアプリに預けることには抵抗がある
- **システム**: セッション起動時に、選ばれた Provider から環境変数とモデル候補を導出する

## User Journey

### Journey 1: 初回起動時の検出と登録

1. システムが config ディレクトリ候補・AWS プロファイル・環境変数をスキャンする
2. 候補を一覧で提示する（**自動では登録しない**）
3. ユーザが使うものを選び、表示名を付けて登録する

### Journey 2: セッション起動時の選択

1. ユーザがランタイムを選ぶ
2. そのランタイムから到達できる Provider だけが選択肢に出る
   （コンテナ内からホストの `~/.claude` は見えないため）
3. Provider を選ぶとモデルカタログが切り替わる

### Journey 3: 一時資格情報の期限切れ

> **R-02/AD-039 (007)**: `aws-assume-role` を `awsCredentialExport` 化したため、期限監視・再取得は
> Claude Code に委譲した (他 8 方式と同じ委譲形)。以下は**直接 AssumeRole ブランチを採る場合のみ**の姿。

1. `aws-assume-role` の Provider でセッションを実行中、有効期限が近づく
2. システムが期限前に警告する
3. 実行中セッションが期限切れになった場合、UI に明示される

## Key concepts

- **Provider**: 認証方式・設定ディレクトリ・モデルカタログを含む登録可能なエンティティ。
  コード上の列挙ではなくアプリに登録される値
- **ProviderProfile**: Provider の実体
- **CredentialSource**: 認証方式。9 種類あり、それぞれ「アプリが秘密を持つか」が定義されている
- **モデルカタログ**: Provider ごとに使えるモデルの集合

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- 長期資格情報を永続化しない。永続化が必要なものは `safeStorage` 経由でキーチェーンに預け、
  参照キーのみを保持する（Principle V）
- 一時資格情報はメモリ上のみで扱い、SQLite にもファイルにも書かない
- ログに `env` をそのまま出力しない
- 候補の検出結果を**自動登録しない**。登録は常に利用者の明示操作を要する
- Bedrock のモデルは inference profile ID で pin する。alias 運用はしない
- `aws-assume-role` では `RoleSessionName` にアプリ名とセッション ID を含め、CloudTrail で追跡可能にする
  （**アプリによる helper スクリプト生成 (RoleSessionName 埋め込み) は X-4 の起動統合に帰属**。X-3 は helper パスを
  ユーザ入力で受け取り `settings.awsCredentialExport` に載せるまで。007 FR-006 参照）
- 推奨は `api-key-helper` と `aws-credential-export`。期限切れ時の再取得を Claude Code に任せられるため

## KPI / Success metrics

- **秘密値の非混入**: SQLite スキーマに秘密値カラムが 0、ログへの `env` 出力が 0 — 計測経路: 静的検査 + security-reviewer
- **到達可能性判定の正しさ**: 到達できない Provider が選択肢に現れない — 計測経路: E2E
- **検出の網羅**: ホストに存在する config ディレクトリと AWS プロファイルを取りこぼさない — 計測経路: 手動検証
- **委譲率**: 登録済み Provider のうち、アプリが秘密を保持しない方式の割合 — 計測経路: 設定の集計

## Cross-domain dependencies

- 依存する domain: `runtime`（config ディレクトリへの到達可能性判定）
- 依存される domain: `session`, `ui`
- 共有 invariant: Principle V。詳細は [docs/domains/_overview.md](../_overview.md)

## Related ADRs

- [AD-005](../../decisions/0005-provider-as-registrable-value.md) — Provider は認証方式を含む値として抽象化する
- [AD-011](../../decisions/0011-delegate-credential-resolution.md) — 資格情報の解決は Claude Code に委譲する
- [AD-039](../../decisions/0039-credential-delegation-verified.md) — SPIKE-7: 委譲は SDK 0.3.270 で成立（AD-011 の成立を確認）

## Related Specs

- [007-provider-registration-and-reachability](../../../specs/007-provider-registration-and-reachability/spec.md)
  — X-3 (Provider 登録と到達可能性判定)。本 domain 初の feature。
  `AD-005` の `ProviderProfile` を実体化し、9 種 `CredentialSource`・検出と提示・env 導出・到達可能性判定を実装。
  `aws-assume-role` は R-02 で **awsCredentialExport 化**を採用し、アプリは一時資格の実体を持たない
  (期限監視は Claude Code に委譲。charter Scope の「一時資格情報の有効期限監視」は委譲側へ寄った)。
  C-001 (helper の `Options.settings` と AD-036 §4 P1 の権限ゲートの衝突) を [AD-040](../../decisions/0040-provider-settings-constrained-projection.md) で調停。

## Open Questions

- [x] SPIKE-7: `apiKeyHelper` / `awsCredentialExport` / `awsAuthRefresh` の実際の挙動。
      呼び出しタイミング、期限切れ時の再取得、セッション単位の `--settings` で渡せるか
      → [AD-039](../../decisions/0039-credential-delegation-verified.md) で検証済み (2026-09-29)。
      委譲は SDK 0.3.270 で成立。helper 設定は per-session `settings` で渡せる。Scope は変更不要
- [ ] SPIKE-6: Provider ごとのモデル候補を動的取得する手段の有無
- [ ] `vertex` / `foundry` は初期リリースでは登録のみで検証対象外。いつ検証対象に入れるか
