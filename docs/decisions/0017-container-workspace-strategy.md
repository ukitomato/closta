---
status: accepted
date: 2026-09-13
id: AD-017
deciders: ukitomato
tags: [isolation, runtime, performance, ux]
supersedes: []
superseded-by: []
---

# AD-017: コンテナの作業領域戦略を起動設定の軸として持つ

## Context

[AD-016](0016-cross-filesystem-performance-cliff.md) で、Linux 側のプロセスが NTFS を読むと
走査が約 800 倍遅くなることが分かった。`DockerRuntime` で Windows 側フォルダを bind mount する
構成はこの崖を踏む。

対処として「セッション開始時に WSL 側へコピーし、終了時に差分を戻す」案を検討したが、
**コピーは二重の真実を生む**。エージェントがコピー側で作業するあいだ、利用者のエディタは
元フォルダを開いている。両側で編集が起きたとき「差分を反映」にはマージの意味論がなく、
静かに上書きする実装になりがちである。性能問題を直すために正しさの問題を作ることになる。

実測: closta（149 追跡ファイル、`node_modules` なし）を ext4 にコピーして **61 秒**。
実プロジェクトで `node_modules` を含めれば分単位になる。除外すればエージェントがビルドできない。

## 測定結果

Ubuntu-26.04 内の Docker（overlayfs / `/var/lib/docker` は ext4）。
150 ファイル × 200B の create + find + read + delete。コンテナ起動 1,018ms を差し引いた実 I/O。

| 構成 | 実 I/O |
|---|---|
| コンテナ overlayfs（書き込み層） | 112 ms |
| named volume | **29 ms** |
| bind mount: WSL の ext4 | 101 ms |
| bind mount: `/mnt/c`（NTFS） | **10,832 ms** |

**WSL 側フォルダの bind mount は劣化しない。** 崖を踏むのは NTFS を bind した場合だけである。

## Decision

### 1. 作業領域戦略を `SessionLaunchConfig` の軸として持つ

単一の機構を押しつけず、利用者が選べるようにする。

| 戦略 | 実体 | 残るもの | remote |
|---|---|---|---|
| `bind` | ホストのフォルダを bind mount する | なし | 不要 |
| `clone-ephemeral` | **コンテナの書き込み層に clone する** | **なし** | 必要 |
| `clone-volume` | named volume に clone する | volume | 必要 |

### 2. 既定はフォルダの所在で出し分ける

- **WSL 側フォルダ → `bind`**。速く（101 ms）、二重の真実も生まれない。人間とエージェントが
  同じ作業ツリーを共有できる
- **Windows 側フォルダ → `clone-ephemeral` を推奨として提示**。`bind` も選べるが越境警告を出す
- **`clone-volume` はオプトイン**。大きいリポジトリで毎回の clone を避けたい場合のみ

`clone-*` は remote を必要とする。remote が無いリポジトリでは選択肢に出さない
（[AD-005](0005-provider-as-registrable-value.md) と同じく、到達できない選択肢は見せない）。

### 3. 成果は git で返す。ファイルの差分同期は行わない

`clone-*` 戦略での成果物は **`git push` で返す**。ワークフローは既に `/cl-done` で PR を出す
設計になっており、そこにそのまま乗る。

分岐が起きた場合は git のマージ意味論で解決される。**アプリが独自の差分反映機構を持たない。**
これは `mutagen` / `docker-sync` のような双方向同期ツールを採らない判断でもある
（常駐デーモンと独自の衝突解決を持ち込むため。[AD-012](0012-docker-control-via-cli.md) の
「依存を増やさない」と同じ理由）。

### 4. 蓄積対策として `clone-ephemeral` を既定の clone 戦略にする

**volume を作らないことが最も確実な蓄積対策である。** コンテナ破棄で作業領域ごと消える。
実測でも 112 ms と volume（29 ms）に対して実用上の差がない。

`clone-volume` を選んだ場合:

- volume 名を決定的にする（`closta-ws-<repo-url の hash>`）。同一リポジトリで重複を作らない
- セッション開始時に `fetch` + 指定ブランチへ `reset` する。古い状態を持ち越さない
- **I-2 の孤児回収を volume にも拡張する。** 起動時に「Closta 管理下の未使用 volume が
  N 個 / M GB」を提示して破棄を促す

### 5. コンテナを使い回さない

**技術的に不可能である。** `docker update` にマウント系のフラグはなく（リソース制限のみ）、
マウントは `docker create` 時に固定される。変更には再作成が要る。

親ディレクトリを丸ごとマウントして cwd を切り替えれば擬似的に使い回せるが、採らない。

- §6.3 の「マウントは作業フォルダのみ」を破る。他のリポジトリがコンテナから見える
- 前セッションの副作用（導入されたパッケージ、書き換えられた設定）が残り、
  軸 3 の「完全な隔離境界」が毀損する
- [AD-008](0008-no-persistent-environment-provisioning.md) が「永続コンテナの恒久的な管理」を
  明示的に非目標としている

**そして節約できる量が小さい。** コンテナ起動は実測 1,018 ms で、`wsl.exe` の約 1,500 ms より安い。
セッションあたり 1 秒のために隔離を崩す取引にはならない。

## Consequences

- `SessionLaunchConfig` に軸が 1 つ増える（PLAN.md §7.1）。X-4 の依存解決が複雑になる
  - 依存: **ランタイム → 作業領域戦略**（`DockerRuntime` 以外では `bind` 固定）
  - 依存: **フォルダ → 作業領域戦略**（remote が無ければ `clone-*` を出さない）
- I-2（コンテナライフサイクルと隔離可視化）のスコープに **volume の孤児回収**が加わる
- `isolation` charter の In scope に「作業領域戦略の決定と実施」を加える
- `clone-ephemeral` では**セッション中断時に未 push の作業が失われる**。長時間の無人実行では
  こまめな push か、中断時の退避が要る。UI で明示すること
- 本判断は WSL 内 Docker Engine（`wsl:<distro>` endpoint）での測定に基づく。
  Docker Desktop（`host` endpoint）での bind mount 速度は未測定であり、SPIKE-10 で確認する

## Open Questions

- [ ] `clone-ephemeral` で中断時の未 push 作業をどう扱うか。自動 commit + push する退避先
      （`closta/wip-<session-id>` ブランチ等）を用意するか
- [ ] `--depth 1` の shallow clone を既定にするか。速いが `git log` を使う作業で困る
- [ ] 大きいリポジトリで `clone-ephemeral` の所要がどれくらいになるか未測定
- [ ] Docker Desktop での bind mount 速度（SPIKE-10）

## References

- SPIKE-9 / SPIKE-10（docs/roadmap.md）
- [AD-016](0016-cross-filesystem-performance-cliff.md) — 性能崖の発見
- [AD-008](0008-no-persistent-environment-provisioning.md) — 使い捨てコンテナの原則
- [AD-012](0012-docker-control-via-cli.md) — docker endpoint と依存を増やさない判断
- PLAN.md §6.3（隔離設計）、§7.1（起動設定の軸）
- 先行事例: VS Code Dev Containers の "Clone Repository in Container Volume"
  （まさに本件と同じ性能問題のために存在する機能）
