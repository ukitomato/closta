---
status: accepted
date: 2026-09-12
id: AD-009
deciders: ukitomato
tags: [packaging]
supersedes: []
superseded-by: []
---

# AD-009: ネイティブバイナリは asar から展開する

## Context

Agent SDK はプラットフォーム別ネイティブバイナリを optional dependency として持つ。
electron-builder は既定でアプリを asar アーカイブにまとめるが、asar 内の実行ファイルは
直接起動できない。

## Decision

**該当バイナリを `asarUnpack` に指定し、実行ビットを維持する。**

## Consequences

- `node-pty` などのネイティブモジュールは Electron の ABI に合わせた再ビルドが必要になる
  （[AD-001](0001-adopt-electron-over-tauri.md) の帰結）。
  **手段は `electron-builder install-app-deps` である**（electron-vite の公式テンプレートが
  `postinstall` に設定する）。PLAN.md が挙げていた `electron-rebuild` ではない。
  [AD-023](0023-application-architecture.md) で公式 scaffold を確認して判明した
- パッケージング設定の検証が F-016 の受け入れ条件に含まれる
  （`asarUnpack` によりネイティブバイナリが実行可能であること）

## References

- PLAN.md §2、F-016（パッケージングと配布）
