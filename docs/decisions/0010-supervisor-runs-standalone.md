---
status: accepted
date: 2026-09-12
id: AD-010
deciders: ukitomato
tags: [process, testability]
supersedes: []
superseded-by: []
---

# AD-010: supervisor は単独起動可能な Node プロセスとして実装する

## Context

[AD-006](0006-supervisor-in-utility-process.md) で supervisor を `utilityProcess` に置いたが、
そのまま Electron API に依存させると (1) テストに Electron 起動が必要になり、
(2) [AD-001](0001-adopt-electron-over-tauri.md) の後戻りが不可能になる。

## Decision

**supervisor は Electron API に依存してはならない。** `node dist/supervisor.js` として
単体起動でき、標準入出力経由でプロトコルを話せる形に保つ。

**supervisor はネイティブモジュールにも依存してはならない。**

## Rationale

Electron の同梱 Node とホスト Node は ABI（`NODE_MODULE_VERSION`）が異なるため、
`better-sqlite3` のようなネイティブ依存を supervisor が持つと 2 種類のビルドが必要になり、
単独起動可能性が実質的に失われる（[AD-013](0013-node-and-electron-versioning.md)）。

## Decision Outcome

- SQLite アクセスは main process 側に置き、supervisor はプロトコル配管に徹する
- renderer と supervisor の IPC は薄い自前レイヤでラップし、`ipcRenderer` への直接依存を
  UI に漏らさない

## Consequences

- Constitution Principle VII として ESLint で機械強制する
  （`supervisor/` 配下での `electron` import とネイティブモジュール import を error にする）
- Electron を立てずに supervisor をテストできる
- シェル選択を後から変更する際のコストが限定される

## References

- PLAN.md §2、F-007
