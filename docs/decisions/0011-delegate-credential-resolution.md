---
status: accepted
date: 2026-09-12
id: AD-011
deciders: ukitomato
tags: [auth, security]
supersedes: []
superseded-by: []
---

# AD-011: 資格情報の解決は可能な限り Claude Code に委譲する

## Context

アプリが API キーや AWS 資格情報を保持・更新する設計は、漏洩面を広げ、
期限切れ時の再取得ロジックを自前で抱えることになる。

## Decision

**資格情報の解決を Claude Code 側のヘルパー機構に委譲する。**

- **Bedrock**: `awsCredentialExport` / `awsAuthRefresh` にヘルパーコマンドを指定し、
  期限切れ時の再取得を Claude Code に任せる
- **Anthropic**: `apiKeyHelper` に委譲する

推奨は `api-key-helper` と `aws-credential-export` の 2 方式である。

## Decision Outcome

アプリが自ら STS `AssumeRole` を叩く形も提供するが（`aws-assume-role`）、その場合も
**一時資格情報のみを扱い、メモリ上に留め、永続化しない**。要件は以下のとおり。

- 長期キーは扱わない。`sourceProfile` または既定の資格情報チェーンから `AssumeRole` する
- 発行された一時資格情報はメモリ上のみ。SQLite にもファイルにも書かない
- 有効期限を監視し、期限前に警告する。実行中セッションの期限切れは UI に明示する
- `RoleSessionName` にアプリ名とセッション ID を含め、CloudTrail で追跡可能にする

永続化が必要な秘密（API キー等）は Electron `safeStorage` で OS キーチェーンに預け、
SQLite には参照キーのみを持つ。

## Consequences

- Constitution Principle V として機械検証する
  （SQLite スキーマに秘密値カラムが存在しないこと、ログ出力に `env` をそのまま渡さないこと）
- SPIKE-7（認証委譲機構の確認）が本 ADR の成立可否を検証する

## References

- PLAN.md §5.2（認証方式）、§7.3（プリセット）
