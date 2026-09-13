---
status: accepted
date: 2026-09-13
id: AD-016
deciders: ukitomato
tags: [runtime, isolation, performance, ux]
supersedes: []
superseded-by: []
---

# AD-016: ファイルシステム境界をまたぐ作業フォルダの性能崖を製品仕様として扱う

## Context

SPIKE-9 の結果。[AD-012](0012-docker-control-via-cli.md) では
「`/mnt/c` 越し bind mount の実効速度は I-1（M4）で実測する」としていたが、
PLAN.md §13.2 の「リポジトリを Windows 側 NTFS に置く」という方針を覆しうるため
R-1 の前に前倒しして測定した。

**結果として、これは開発環境の都合ではなく製品の仕様に関わる問題だと判明した。**

## 測定結果

Ubuntu-26.04 の内側から、同一のリポジトリ（151 ファイル）に対して実行。
いずれも warm 状態で 2〜3 回繰り返し、値が安定していることを確認している。

| 操作 | ext4（WSL ネイティブ） | `/mnt/c` 越し（9p/drvfs） | 倍率 |
|---|---|---|---|
| `find` 151 ファイル | 9〜11 ms | 7,904〜8,296 ms | **約 800 倍** |
| `git status --porcelain` | 21〜22 ms | 4,562〜4,864 ms（初回 27,955 ms） | **約 220 倍** |
| 小ファイル 300 個の作成 | 804 ms | 21,756 ms | 約 27 倍 |
| 同 読み取り | 19 ms | 22,463 ms | 約 1,180 倍 |
| 同 削除 | 15 ms | 13,330 ms | 約 890 倍 |
| リポジトリを ext4 へコピー | — | 61,641 ms | — |

**warm でも改善しない。** `find` は 3 回とも 8 秒前後で安定しており、
キャッシュによる緩和は期待できない。

## 問題の本質

これは Docker 固有でも、bind mount 固有でもない。
**「Linux 側のプロセスが Windows 側のファイルシステムを読む」構図そのもののコスト**である。

したがって影響範囲は `DockerRuntime` に限らない。

| 構成 | 作業フォルダ | 影響 |
|---|---|---|
| `Win32Runtime` + `C:\...` | NTFS ネイティブ | なし |
| `WslRuntime` + `C:\...` | `/mnt/c/...` = 9p | **あり** |
| `WslRuntime` + WSL 側のパス | ext4 | なし |
| `DockerRuntime`（`wsl:<distro>`）+ `C:\...` | 9p をさらに bind mount | **あり（より悪い可能性）** |
| `DockerRuntime` + WSL 側のパス | ext4 を bind mount | 軽微 |

Claude Code は Glob / Grep / Read を多用する。作業フォルダの走査が 800 倍遅い環境では、
**エージェントが実用にならない。**

## Decision

### 1. 性能崖を `capabilities` ではなく「フォルダ × ランタイムの組み合わせ」の属性として扱う

`capabilities` はランタイム単体の能力を表す（[AD-003](0003-runtime-abstraction-by-transport.md)）。
本件はランタイム単体の性質ではなく**組み合わせ**で決まるため、別の軸として持つ。

`SessionLaunchConfig` の解決時（PLAN.md §7.2 の「ランタイム → フォルダ」の依存）に、
選ばれたランタイムから見てそのフォルダがネイティブか越境かを判定する。

### 2. 越境する組み合わせは選択可能にしたうえで、起動前に明示する

**選択不可にはしない。** 小さなリポジトリなら許容できるし、利用者が事情を分かって選ぶ場合もある。
[Principle III](../../.specify/memory/constitution.md) が権限モードを禁止するのは安全性の問題だが、
本件は性能の問題であり、性質が異なる。

代わりに、**起動設定ダイアログとセッションカードで越境状態を明示する**。
隔離バッジ（[AD-008](0008-no-persistent-environment-provisioning.md) / §6.4）と同じ思想で、
「今どこのファイルシステムを触っているか」が常に分かる状態を保つ。

### 3. 推奨を提示する

`WslRuntime` / `DockerRuntime` を選んだとき、そのランタイムのネイティブファイルシステム上の
フォルダを推奨として提示する。WSL 側に `git clone` することを促す文言を出す。

**アプリが勝手に clone やコピーをしてはならない**（Principle VI）。案内にとどめる。

### 4. PLAN.md §13.2 の方針は維持する

「Closta のリポジトリを Windows 側 NTFS に置く」は**引き続き正しい**。
Electron のビルドと GUI 起動は Windows ネイティブで行われ、そこでは NTFS がネイティブだからである。

ただし帰結として、**Closta を自分自身のリポジトリに対して WSL セッションで dogfooding すると
この性能崖を踏む。** これは不便だが、開発ホストの構成として受け入れる。
dogfooding の対象を WSL 側に置いた別リポジトリにする回避策もある。

## Consequences

- R-1（フォルダ登録とランタイム検出）で、**フォルダとランタイムの組み合わせがネイティブか
  越境かを判定するロジックが必要**になる。単なるパス変換だけでは足りない
- X-4（起動設定ダイアログ）で、越境時の警告表示が受け入れ条件に加わる
- I-1（`DockerRuntime`）では、bind mount 経由でさらに 1 層重なる。
  **本測定は WSL 内からの直接アクセスであり、コンテナ bind mount 経由は未測定である。**
  少なくとも同等、おそらくより遅い。SPIKE-10 で確認する
- `ui` domain に「越境状態の可視化」という表示責務が増える
- ベンチマークの閾値をどこに置くかは未定。「800 倍」は極端だが、
  小さなフォルダなら体感差は小さい。**フォルダサイズと組み合わせて判定すべきか**は Open Question

## Open Questions

- [ ] 越境判定をパス形式だけで行うか（`/mnt/` 配下かどうか）、実測を伴うか。
      実測は起動を遅らせるため、初回のみ計測してキャッシュする案がある
- [ ] 警告を出す閾値。ファイル数か、実測のスループットか
- [ ] Docker Desktop（`host` endpoint）で Windows パスを bind mount した場合の速度。
      Desktop も内部的には同種の変換を行うため同様の崖がある可能性が高いが未測定
- [ ] `\\wsl.localhost` 経由で Windows 側から WSL のファイルを読む逆方向のコストは
      [AD-015](0015-wsl-access-strategy.md) で測定済み（単一ファイル 32 ms）。
      こちらは実用範囲であり、方向によって非対称である理由は未調査

## References

- SPIKE-9（docs/roadmap.md）
- [AD-012](0012-docker-control-via-cli.md) — docker endpoint。本件の発端
- [AD-015](0015-wsl-access-strategy.md) — 逆方向（Windows → WSL）のアクセス性能
- [AD-003](0003-runtime-abstraction-by-transport.md) — `capabilities` の位置づけ
- PLAN.md §13.2 — リポジトリ配置の方針
