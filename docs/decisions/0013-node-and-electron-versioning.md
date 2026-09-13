---
status: accepted
date: 2026-09-12
id: AD-013
deciders: ukitomato
tags: [toolchain]
supersedes: []
superseded-by: []
---

# AD-013: Node と Electron のバージョン方針

## Context

**実行時の言語機能を決めるのは Electron が同梱する Node であり、ホストの Node ではない。**
両者を混同すると、使える構文やネイティブモジュールの ABI を取り違える。

| 用途 | どの Node が使われるか |
|---|---|
| main / utilityProcess の実行 | **Electron 同梱 Node** |
| ネイティブモジュールのコンパイル対象 | **Electron の ABI**（`electron-rebuild` が解決） |
| ビルドツール（vite / tsc / electron-builder） | ホスト Node |
| supervisor の単独起動（テスト時） | ホスト Node |

## Decision

- **Electron は最新安定版を追随する。** `tsconfig` の `target` / `lib` は Electron 同梱 Node の
  バージョンに合わせる。Electron を上げたら `electron-rebuild` を再実行する
- **ホスト Node は Active LTS を使う。** 2026 年 9 月時点では **24**。22 は Maintenance LTS、
  26 は Current で 2026 年 10 月に LTS 昇格予定
- **Node 26 への移行は LTS 昇格後に検討する。** 実行時制約は Electron 側にあるため、
  ホスト Node を先行させる利益は小さい。ビルドツールの互換性リスクだけを負うことになる
- CI のマトリクスは Active LTS を基準にし、Current / Alpha は allow-failure ジョブで回す

## Decision Outcome

Node.js は 2026 年 10 月以降、年 1 回（4 月）のメジャーリリースに移行し、
**すべてのリリースが LTS になる**（奇数/偶数の区別が消える）。
「偶数だけを追う」という従来のヒューリスティクスは今後使わない。
バージョン番号は初回 Current リリースの年に一致する。

## Consequences

- supervisor がネイティブ依存を持てない根拠になる（[AD-010](0010-supervisor-runs-standalone.md)）
- CI が未構築である間、本方針の CI 部分は検証できない

## References

- PLAN.md §2、§13.1（ツールチェーン）
