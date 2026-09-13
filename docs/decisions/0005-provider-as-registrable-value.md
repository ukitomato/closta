---
status: accepted
date: 2026-09-12
id: AD-005
deciders: ukitomato
tags: [provider, auth]
supersedes: []
superseded-by: []
---

# AD-005: Provider は認証方式を含む値として抽象化する

## Context

Claude Enterprise と Amazon Bedrock を 2 択のハードコードとして扱うと、
「本番用 Bedrock と検証用 Bedrock」「会社アカウントと個人アカウントの Enterprise」のような
同一バックエンドの複数構成を表現できない。

## Decision

**Provider を、認証方式・設定ディレクトリ・モデルカタログを含む登録可能なエンティティとして
一般化する。**

```ts
interface ProviderProfile {
  id: string;
  displayName: string;
  backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry';
  configDir?: HostPath;          // CLAUDE_CONFIG_DIR。未指定なら既定
  credential: CredentialSource;
  models: ModelCatalogRef;
  extraEnv?: Record<string, string>;
}
```

Provider は**アプリに登録される値**であり、コード上の列挙ではない。

## Consequences

- セッション起動時の環境変数は Provider から導出する
- **`Options.env` は `process.env` にマージではなく置換される**ため spread が必須
- Provider とランタイムの到達可能性判定が必要になる。`config-dir` 認証の Provider は、
  その config ディレクトリに到達できるランタイムでのみ利用可能
  （コンテナ内からホストの `~/.claude` は見えない）
- 認証方式は 9 種類を `CredentialSource` として定義する（PLAN.md §5.2）

## References

- PLAN.md §5（軸 2: Provider 抽象）、§7.2（軸の依存関係）
- [AD-011](0011-delegate-credential-resolution.md)
