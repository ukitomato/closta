---
status: accepted
date: 2026-09-12
id: AD-003
deciders: ukitomato
tags: [runtime, platform]
supersedes: []
superseded-by: []
---

# AD-003: ランタイム抽象はトランスポート軸で切る

## Context

Claude Code プロセスを起動する場所は複数ありうる（ホスト直接 / WSL ディストロ内 / コンテナ内）。
抽象化の軸をプラットフォーム（posix / win32）に取るか、トランスポート（起動方法）に取るかを
決める必要があった。

## Decision

**トランスポート軸で切る。**

```
DirectRuntime  — ホストで直接起動 (macOS / Linux)
WslRuntime     — wsl.exe -d <distro> -- ...
Win32Runtime   — ホストで直接起動 (Windows native)
DockerRuntime  — docker exec -i <container> ...
```

`DockerRuntime` は **docker CLI への到達経路（endpoint）を値として持つ**。ホスト PATH の
`docker` を叩く場合と、`wsl.exe -d <distro> -- docker ...` として WSL 内の Docker Engine を
叩く場合があり、後者は `WslRuntime` の上に `DockerRuntime` が乗る合成になる
（[AD-012](0012-docker-control-via-cli.md)）。

## Rationale

プラットフォーム差を軸に取ると、`DockerRuntime` のようにホスト OS とランタイム OS が
一致しないケースを表現できない。ホストが Windows でもコンテナ内は Linux である。

## Decision Outcome

- `WslRuntime` と `DockerRuntime` は**インスタンスが複数存在しうる**
  （ディストロごと / endpoint × コンテナごと）
- `AgentRuntime` はシングルトンではなく、**検出結果から生成される値**として扱う
- プラットフォーム差（posix / win32）は軸としては持たず、各実装が内部で吸収する
- 「ネイティブ Windows は sandbox 非対応」は `capabilities.autoModeSafe: false` として表明する

## Consequences

- `process.platform` による分岐が `runtime/` の外に漏れてはならない
  → Constitution Principle II として機械検証する
- 権限モードの選択肢がランタイムの `capabilities` に従属する → Constitution Principle III

## References

- PLAN.md §2.1（対応プラットフォーム）、§7.2（軸の依存関係）
- [AD-004](0004-branded-path-types.md)
