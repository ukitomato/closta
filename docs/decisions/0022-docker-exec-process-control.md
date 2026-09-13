---
status: accepted
date: 2026-09-13
id: AD-022
deciders: ukitomato
tags: [isolation, runtime, session]
supersedes: []
superseded-by: []
---

# AD-022: `docker exec` 経由の強制終了はコンテナごと行う

## Context

SPIKE-10 の結果。I-1 の前提となる。

[AD-018](0018-wsl-process-control.md) で、`wsl.exe` 越しのプロセス制御について
「kill は graceful ではないが孤児は残らない」ことを確認した。
`DockerRuntime`（`wsl:<distro>` endpoint）では **`wsl.exe` → `docker exec` と 2 段になる**ため、
同じ結論が成立するかを確認する必要があった。

また PLAN.md §6.3 は「非 root。`--dangerously-skip-permissions` は root で起動拒否されるため必須」
と断定していたが、**実際に確認されていなかった**。

## 測定結果

WSL 内 Docker Engine（`wsl:Ubuntu-26.04` endpoint）で使い捨てコンテナを起動して検証した。

### stdin / stdout の疎通 — 問題なし

| 検証 | 結果 |
|---|---|
| 5MB の決定的データの往復ハッシュ | **完全一致**（`dbbe5517…`） |
| 日本語 JSON 行 | `{"type":"assistant","t":"あいう"}` が UTF-8 のまま LF 終端で通過 |

**`wsl.exe` + `docker exec` の 2 段を通しても stream-json は壊れない。**
[AD-015](0015-wsl-access-strategy.md) / [AD-018](0018-wsl-process-control.md) の結論が
コンテナ経由でも維持される。

### kill の伝播 — **孤児化する**

`wsl.exe -d <distro> -- docker exec -i <container> sleep 97` を起動し、`wsl.exe` を kill した。

```
kill 後のコンテナ内プロセス一覧:
   1 sleep 600      ← コンテナの PID 1
  31 sleep 97       ← 孤児として生存
  37 ps -o pid= args=
```

**`wsl.exe` を kill してもコンテナ内のプロセスは生き残る。**

理由は `docker exec` が**クライアント**だからである。クライアントを終了させても、
プロセスを実際に起動したのは dockerd であり、その子プロセスは影響を受けない。

**これは [AD-018](0018-wsl-process-control.md) の WSL 直接起動（孤児は残らない）と正反対である。**

### `docker kill` でコンテナごと終了すれば解消する

`docker kill <container>` + `--rm` により、コンテナと内部プロセスが一括で消えることを確認した。

### 非 root と `--dangerously-skip-permissions`

| 実行ユーザ | 結果 |
|---|---|
| `root` | **`--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`** |
| `1000:1000`（非 root） | エラーなく起動 |

**PLAN.md §6.3 の主張は正しい。** root では明示的に拒否される。

## Decision

### 1. `DockerRuntime` の強制終了は `docker kill <container>` とする

`wsl.exe` プロセスの kill では孤児が残るため、**コンテナ単位で終了させる**。

これは「コンテナはセッションと 1:1 の使い捨て」
（[AD-008](0008-no-persistent-environment-provisioning.md) / [AD-017](0017-container-workspace-strategy.md)）
という前提があって初めて安全に採れる手段である。
**1 コンテナに複数セッションを同居させると、1 つの強制終了が他を巻き添えにする。**
[AD-017](0017-container-workspace-strategy.md) がコンテナ使い回しを退けた判断を、別の理由から補強する。

### 2. 「強制終了」の実装をランタイムごとに変える。これは `AgentRuntime` が吸収する

[AD-018](0018-wsl-process-control.md) は UI に「中断」と「強制終了」の 2 操作を要求した。
このうち**中断は全ランタイム共通**（SDK の `interrupt()` = stdin 越しの control_request）だが、
**強制終了はランタイムによって手段が異なる**。

| ランタイム | 強制終了の手段 | 孤児 |
|---|---|---|
| `Win32Runtime` / `DirectRuntime` | プロセスを kill | 残らない |
| `WslRuntime` | `wsl.exe` を kill | 残らない（AD-018） |
| **`DockerRuntime`** | **`docker kill <container>`** | コンテナごと消える |

これは [AD-003](0003-runtime-abstraction-by-transport.md) の
「プラットフォーム差は各実装が内部で吸収する」の適用例である。
`AgentRuntime` に **強制終了の抽象**を持たせ、上位は手段を知らない。

### 3. コンテナは非 root で起動する（必須）

`bypassPermissions` を使うには非 root が必要であることが確認された。
**軸 3 の目的（無人実行を安全に回す）そのものが非 root 起動に依存している。**

推奨 Dockerfile（PLAN.md §6.5）に非 root ユーザの作成を含めることが必須要件になる。
アプリはイメージをビルドしないため、**イメージが非 root ユーザを持たない場合は
`--user` で指定するか、起動を拒否して案内する**。

### 4. `--rm` を既定とする

`docker kill` 後にコンテナが残らないことを確認済み。
孤児回収（I-2）の負担を減らすため `--rm` を既定とし、
「終了時に保持」を選んだ場合のみ外す。

## Consequences

- `isolation` domain の責務に「強制終了はコンテナ単位」が加わる
- **I-2 の孤児回収は、コンテナだけでなく「異常終了で残った `docker exec` のクライアント側」も
  考慮する必要はない**（クライアントは Closta 側のプロセスであり、Closta が死ねば一緒に消える）。
  逆に **Closta が異常終了した場合、コンテナは生き続ける**。起動時の孤児回収が効く場面である
- イメージ検証に「非 root ユーザが存在するか」の確認が加わる（I-2）
- `Win32Runtime` では `bypassPermissions` 自体が使えない（sandbox なし = `autoModeSafe: false`）ため、
  本項の root 制約は `DockerRuntime` と `WslRuntime` にのみ関係する

## Open Questions

- [ ] `docker kill` の前に graceful な停止を試すべきか（`docker stop` は SIGTERM → 10 秒後 SIGKILL）。
      中断が SDK の `interrupt()` で済むなら、強制終了は即 `docker kill` でよいかもしれない
- [ ] Closta が異常終了したあと再起動したとき、実行中だったコンテナ内セッションを
      「再接続」できるか、それとも破棄するか。`docker exec` を張り直せば stream は取れるか
- [ ] Docker Desktop（`host` endpoint）でも同じ孤児化が起きるか。起きるはずだが未測定

## References

- SPIKE-10（docs/roadmap.md）
- [AD-018](0018-wsl-process-control.md) — WSL 直接起動では孤児が残らない（本 ADR と対照的）
- [AD-017](0017-container-workspace-strategy.md) — コンテナ使い回しを退けた判断
- [AD-008](0008-no-persistent-environment-provisioning.md) — 使い捨てコンテナの原則
- PLAN.md §6.3（隔離設計）、§6.5（推奨 Dockerfile）
