---
status: accepted
date: 2026-09-12
id: AD-006
deciders: ukitomato
tags: [process, performance]
supersedes: []
superseded-by: []
---

# AD-006: セッション supervisor は `utilityProcess` に置く

## Context

tool_result が数 MB になることがある。これを main process で `JSON.parse` すると
ウィンドウが固まる。10 セッション並列を想定する以上、1 セッションの巨大な tool_result が
UI 全体を止める構造は許容できない。

## Decision

**セッション supervisor を Electron の `utilityProcess` に分離し、renderer とは MessagePort で
直結する。**

## Consequences

- stream の逐次パースは supervisor 側で行う → Constitution Principle IX として機械検証する
  （supervisor 外に stream の `JSON.parse` が存在しないこと）
- supervisor は Electron API にもネイティブモジュールにも依存してはならない
  （[AD-010](0010-supervisor-runs-standalone.md)、Constitution Principle VII）
- SQLite アクセスは main process 側に置く

## References

- PLAN.md §2、F-007（マルチセッション supervisor）
