---
status: accepted
date: 2026-09-12
id: AD-012
deciders: ukitomato
tags: [container]
supersedes: []
superseded-by: []
---

# AD-012: Docker 制御は CLI 呼び出しで行う

## Context

コンテナ制御の実装手段として、Docker Engine API の SDK を使うか、
`docker` コマンドを呼ぶかを比較した。

## Decision

**Docker Engine API の SDK を抱えず、`docker` コマンドを呼ぶ。**

## Rationale

1. Docker Desktop / Colima / Rancher Desktop 等の差異を CLI が吸収する
2. 依存とバイナリサイズが増えない
3. 利用者が同じコマンドを手で再現できる（デバッグ容易性）

## Decision Outcome: docker CLI への到達経路

**`docker` コマンドがどこにあるかは環境によって異なる。** `DockerRuntime` は
「どの docker CLI を叩くか」を **endpoint** として値に持つ。

| endpoint | 起動の形 | 想定環境 |
|---|---|---|
| `host` | `docker exec -i <container> ...` | Docker Desktop（Windows / macOS）、Linux ネイティブ |
| `wsl:<distro>` | `wsl.exe -d <distro> -- docker exec -i <container> ...` | WSL ディストロ内に Docker Engine を直接導入した構成 |

**主開発ホストは後者である。** 2026-09-12 時点の実測:

- Windows の PATH に `docker` / `docker.exe` は**存在しない**（Docker Desktop 未導入）
- `Ubuntu-26.04` 内に Docker Engine 29.4.3（client / server とも）が
  `/var/run/docker.sock` で動作している

`WslRuntime` と同様、**`DockerRuntime` も endpoint ごとに複数インスタンスが存在しうる**
（[AD-003](0003-runtime-abstraction-by-transport.md) の「検出結果から生成される値」原則と同じ）。
`wsl:<distro>` endpoint は `WslRuntime` の上に `DockerRuntime` が乗る**合成**である。

## Consequences

- **パス変換が 2 ホップになる。** `wsl:<distro>` endpoint では bind mount に渡すパスを
  `HostPath` → WSL の `RuntimePath`（`/mnt/c/...`）→ コンテナ内の `RuntimePath` の順に
  変換する。Docker Desktop は 1 ホップ目を自前で吸収するため、両者を同じ型で扱えるように
  する必要がある（[AD-004](0004-branded-path-types.md)）
- **endpoint の検出が必要になる。** ホスト PATH に `docker` が無い場合、WSL ディストロを
  走査して docker を持つものを探す。SPIKE-8 の確認項目に含める
- **性能リスク（実測済み）。** `/mnt/c` 越しのアクセスは warm でも走査が約 800 倍遅い。
  SPIKE-9 で測定し [AD-016](0016-cross-filesystem-performance-cliff.md) として起票した。
  Docker 固有ではなく「Linux プロセスが Windows のファイルシステムを読む」構図全体の問題であり、
  `WslRuntime` にも同じ崖がある。コンテナ bind mount 経由はさらに 1 層重なるが未測定（SPIKE-10）
- `docker run` の呼び出し箇所はコンテナライフサイクル管理モジュールに限定される
  （[AD-008](0008-no-persistent-environment-provisioning.md)、Constitution Principle VI）
- **CLI 呼び出しという決定自体は本訂正で変わらない。** むしろ補強される。Engine API SDK を
  採っていた場合、WSL 内の Unix socket にホストプロセスから到達する手段を別途用意する
  必要があり、さらに複雑になっていた

## References

- PLAN.md §6（軸 3: Docker サンドボックス）
