---
status: accepted
date: 2026-09-12
id: AD-008
deciders: ukitomato
tags: [container, scope]
supersedes: []
superseded-by: []
---

# AD-008: 永続環境の構築は行わない / 使い捨てコンテナの管理は行う

## Context

軸 3（Docker サンドボックス）を成立させるにはコンテナを起動する必要がある。一方で
「環境構築ツール」になることは非目標である（PLAN.md §9.1）。境界を明示する必要があった。

## Decision

**境界を以下のとおり定める。**

| 対象 | アプリがすること | アプリがしないこと |
|---|---|---|
| WSL ディストロ | 一覧を取得し起動先として提示する | ディストロの作成、`/etc/wsl.conf` の編集 |
| Docker **イメージ** | 存在を確認し、無ければ手順を案内する | `docker build`、Dockerfile の生成・配置 |
| Docker **コンテナ** | **宣言済みイメージから起動・停止・破棄する**（セッションのライフサイクル） | 永続コンテナの恒久的な管理 |
| Claude Code sandbox | 利用可否を判定し `capabilities` に反映する | bubblewrap / socat / seccomp の導入 |
| Provider 認証 | 設定済みプロファイルを検出し提示する。認証の起動は委譲する | 資格情報の保管、`/login` ロジックの再実装 |

**「永続的な環境（イメージ・ディストロ・OS 設定）の構築」は行わないが、
「セッションに紐づく使い捨てコンテナの起動と破棄」はライフサイクル管理として行う。**

## Rationale

この区別がないと、軸 3 が成立しない（コンテナを起動できない）か、
非目標である環境構築ツール化のどちらかに倒れる。

## Consequences

- Constitution Principle VI として機械検証する。`sudo` / `wsl --import` / `docker build` / `apt` の
  実行箇所が存在しないこと。`docker run` はコンテナライフサイクル管理モジュールにのみ存在すること
- 推奨イメージの Dockerfile は**ドキュメントとして同梱**する（アプリはビルドしない）
- 利用者側の前提は最小限に保たれる（PLAN.md §13.3）

## References

- PLAN.md §6.2（コンテナのライフサイクル）、§6.5、§9.1（非目標）
