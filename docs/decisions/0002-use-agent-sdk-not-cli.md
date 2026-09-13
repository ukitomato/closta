---
status: accepted
date: 2026-09-12
id: AD-002
deciders: ukitomato
tags: [sdk, integration]
supersedes: []
superseded-by: []
---

# AD-002: Agent SDK を使う（CLI 直叩きではない）

## Context

Claude Code との通信手段として、`@anthropic-ai/claude-agent-sdk` を使うか、`claude` バイナリを
直接子プロセス起動して stream-json を自前でやり取りするかを比較した。

Agent SDK の実体はネイティブ `claude` バイナリを子プロセス起動し、stdin/stdout で stream-json を
往復するラッパーである。差は配管が既に書かれているかどうかのみ。

## Decision

**TypeScript 版 Agent SDK の V1 `query()` API を使う。stream-json の自前パースは行わない。**

## Rationale

- CLI レベルの制御は `pathToClaudeCodeExecutable` / `spawnClaudeCodeProcess` / `extraArgs` で
  維持される。自前実装で得られる追加の自由度はない
- stream-json の control protocol は **実装詳細**であり、バージョン間で変更されうる。
  自前パースは追随責任を自分で負うことを意味する
- 公式 SDK は TypeScript と Python の 2 言語のみ。Rust 実装はコミュニティ製であり、
  追随責任を第三者に預けることになる

## Decision Outcome

`unstable_v2_createSession` 系の V2 session API は TypeScript Agent SDK 0.3.142 で削除済み。
`query()` に `AsyncIterable<SDKUserMessage>` を渡す **V1 形式**を使う。

## Consequences

- 実装言語が TypeScript に事実上固定される
- SDK のバージョン更新に追随する運用が必要になる
- Constitution Principle IV として機械検証する（`src/` に stream-json パース実装が存在しないこと）

## References

- PLAN.md §2、§4
- [Agent SDK reference — TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)
