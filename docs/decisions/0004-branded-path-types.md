---
status: accepted
date: 2026-09-12
id: AD-004
deciders: ukitomato
tags: [runtime, types]
supersedes: []
superseded-by: []
---

# AD-004: パスは branded type で名前空間を分離する

## Context

開発ホストが Windows 11 + WSL2 であるため、Windows 形式と POSIX 形式の 2 つのパス名前空間が
同時に存在する。両者を混同すると transcript ディレクトリの解決が壊れる。

セッション transcript は `<config-dir>/projects/<encoded-cwd>/` に置かれ、`encoded-cwd` は
作業ディレクトリの非英数字を `-` に置換したものである。したがって同じフォルダでも
Windows 形式と POSIX 形式では**別ディレクトリ**になる。

## Decision

**パスを branded type で型レベルに分離する。**

```ts
type HostPath    = string & { readonly __brand: 'HostPath' };
type RuntimePath = string & { readonly __brand: 'RuntimePath' };
```

- `HostPath` — Electron プロセスから見たパス。Windows ではドライブレター形式
- `RuntimePath` — ランタイム内部から見たパス。現状は常に POSIX 形式

## Consequences

- アプリケーションコードは `node:path` / `path` を直接 import してはならない。
  パス操作は `runtime.path` を経由する → Constitution Principle I として ESLint で機械強制する
- 変換の責務は各 `AgentRuntime` 実装の内側に閉じる（[AD-003](0003-runtime-abstraction-by-transport.md)）
- **変換は 1 ホップとは限らない。** WSL 内 Docker Engine を使う構成では
  `HostPath` → WSL の `RuntimePath` → コンテナ内の `RuntimePath` と 2 段になる
  （[AD-012](0012-docker-control-via-cli.md)）。型と API は多段変換を表現できる必要がある
- Windows 主軸であることが利点になる。macOS 主軸なら `DirectRuntime`（恒等変換）だけで
  M1〜M3 が回ってしまい、この抽象が本当に機能するかを M4 まで検証できない

## References

- PLAN.md §10.1（リリース区切りの注記）
- SPIKE-8（ランタイム検出とパス変換の確定）
