---
status: accepted
date: 2026-09-12
id: AD-007
deciders: ukitomato
tags: [session, storage]
supersedes: []
superseded-by: []
---

# AD-007: セッションの正本は Claude Code 側に置く

## Context

セッションは Claude Code が `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化しており、
アプリの外で `claude` CLI から直接操作されうる。

## Decision

**セッションの正本は Claude Code 側に置く。アプリのストアはキャッシュまたはインデックスとして
扱う。**

SDK の `listSessions()` / `getSessionMessages()` / `getSessionInfo()` / `renameSession()` /
`tagSession()` を使う。**JSONL の自前パースは行わない**（[AD-002](0002-use-agent-sdk-not-cli.md)）。

## Decision Outcome

`DockerRuntime` ではコンテナ内に JSONL が閉じるため、`sessionStore` アダプタでホスト側 SQLite に
ミラーする。**この判断は runtime 実装の内側に閉じる。**

## Consequences

- 矛盾したときは Claude Code 側を正とする → Constitution Principle X
- セッション一覧の再取得でキャッシュが上書きされること（ユニットテストで検証）
- **未解決**: ミラーしたデータの保持期限・削除経路・エクスポートが未定義である。
  ミラー対象は会話全文とソースコード断片であり個人情報を含みうる。
  `/spec-gate scan` が requirement_gap（priority: blocking）として検出済み。
  Constitution の Principle 候補として起票が必要

## References

- PLAN.md §6.3（隔離設計）、`docs/discovery.md` の Unknown / Ambiguous
