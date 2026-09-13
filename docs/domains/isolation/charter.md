---
domain: isolation
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出。素案の container domain を改名・拡張)
last_reviewed: 2026-09-12
related_adrs:
  - docs/decisions/0008-no-persistent-environment-provisioning.md
  - docs/decisions/0012-docker-control-via-cli.md
  - docs/decisions/0007-session-source-of-truth-is-claude-code.md
related_specs: []
---

# Domain Charter: isolation

## Mission

`isolation` domain は、**Auto モードと `bypassPermissions` を安全に実行できる境界を提供し、
「今どこで何の権限で動いているか」が常に分かる状態を保つ**ことを担う。

素案では `container` という名前だったが、責務は Docker に限らない。
sandbox capability の判定（Seatbelt / bubblewrap を含む）、権限モードのゲート、
隔離状態の可視化が同じ mission の下にあるため `isolation` とする。

## Scope

### In scope

- **権限モードのゲート** — `capabilities.autoModeSafe === false` のランタイムで
  Auto / `bypassPermissions` を選択不可にする（Principle III の実行主体）
- **sandbox 設定** — ランタイムごとの sandbox 可否判定、許可ドメイン等を `--settings` で渡す
- **使い捨てコンテナのライフサイクル** — イメージ存在確認、起動、終了時の破棄 / 保持、孤児回収
- **作業領域戦略の決定と実施** — `bind` / `clone-ephemeral` / `clone-volume` の選択と、
  volume の決定的命名・未使用 volume の回収（[AD-017](../../decisions/0017-container-workspace-strategy.md)）
- **`DockerRuntime` の endpoint 抽象** — `host` / `wsl:<distro>` の判別と多段パス変換
- **隔離設計の実施** — 作業フォルダのみマウント、非 root、ネットワーク制限、リソース上限
- **`sessionStore` ミラー** — コンテナ内 JSONL をホスト側 SQLite に写す
- **隔離状態の可視化ポリシー** — 何をもって「隔離されている」と表示するかの定義

### Out of scope

- ランタイムの検出と `capabilities` の**表明** → `runtime` domain
  （本 domain は表明された capability を**使う**側）
- 隔離バッジの element 選定と見た目 → `ui` domain（本 domain は表示すべき状態を定義する）
- Docker **イメージ**のビルド、Dockerfile の生成・配置 → **非目標**（Principle VI）
- 永続コンテナの恒久的な管理、WSL ディストロの作成 → **非目標**
- bubblewrap / socat / seccomp の導入 → **非目標**

## Actors / Personas

- **エンドユーザ（開発者）**: 承認をいちいち返さずに作業を任せたい。ただし
  ホスト環境が壊れたり資格情報が漏れたりするのは許容できない
- **システム**: セッションのライフサイクルに合わせてコンテナを起動・破棄する

## User Journey

### Journey 1: 無人実行のためのコンテナ起動

1. ユーザが「隔離して実行」を選ぶ
2. システムが指定イメージの存在を確認する。無ければ推奨 Dockerfile とビルド手順を案内する（**ビルドはしない**）
3. 使い捨てコンテナを起動し、作業フォルダのみをマウントする
4. コンテナ内で `bypassPermissions` のセッションが走る
5. セッション終了時にコンテナを破棄する（保持も選択可能）

### Journey 2: 今どこで動いているかを確認する

1. ユーザがセッション一覧を見る
2. 隔離されているセッションにはバッジが付き、`bypassPermissions` のものは視覚的に区別される
3. 隔離されていないランタイムでは、危険な権限モードがそもそも選べない

### Journey 3: 孤児コンテナの回収

1. アプリ起動時、システムがアプリ管理下の停止済みコンテナを検出する
2. ユーザに破棄を提案する
3. ユーザが承認すると破棄される

## Key concepts

- **使い捨てコンテナ**: セッションに紐づき、終了時に破棄されるコンテナ。
  **永続環境の構築をしないという原則の唯一の例外**
- **endpoint**: `DockerRuntime` が docker CLI に到達する経路（`host` / `wsl:<distro>`）
- **autoModeSafe**: そのランタイムで無人実行を許してよいか
- **sessionStore**: コンテナ内 JSONL のホスト側ミラー
- **隔離バッジ**: セッションが境界の内側で動いていることを示す表示

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- `autoModeSafe === false` のランタイムで `auto` / `bypassPermissions` を選択可能にしてはならない（Principle III）。
  **`dontAsk` は制限対象に含めない** — 「聞かずに拒否」であり隔離されていない環境でこそ有用
  （[AD-020](../../decisions/0020-sdk-emitted-message-inventory.md)）
- `bypassPermissions` の選択には `allowDangerouslySkipPermissions: true` と明示確認を要する
- 永続環境を構築・変更しない。**使い捨てコンテナの起動・破棄のみが例外**（Principle VI）
- `docker run` の呼び出しはコンテナライフサイクル管理モジュールにのみ存在する
- マウントは作業フォルダのみ。`~/.aws` / `~/.ssh` / `~/.gnupg` はマウントしない
- コンテナは非 root で起動する。**実測で確認済み**（root では
  `--dangerously-skip-permissions cannot be used with root/sudo privileges` で拒否、
  非 root では起動。[AD-022](../../decisions/0022-docker-exec-process-control.md)）
- **強制終了は `docker kill <container>` で行う。** `wsl.exe` の kill ではコンテナ内プロセスが
  孤児化する（AD-022）。これはコンテナがセッションと 1:1 であることに依存する
- 資格情報は `env` で注入し、長期キーではなく一時トークンを優先する（Principle V）
- 外側のコンテナが境界を担うため、コンテナ内では Claude Code の sandbox を無効にし
  `bypassPermissions` で回すのを既定とする
- **隔離状態は一目で分かること。** 隔離されているかどうかを利用者が推測する必要があってはならない

## KPI / Success metrics

- **無人実行の完走**: `bypassPermissions` のセッションが隔離内で完走する — 計測経路: M4 の手動検証
- **孤児の残存**: アプリ管理下の停止済みコンテナ **と未使用 volume** が放置されない — 計測経路: 起動時スキャンの結果
- **越境の回避率**: Windows 側フォルダで `bind` を選んだセッションの割合が低く保たれる — 計測経路: 起動設定の集計
- **マウント逸脱**: 作業フォルダ以外がマウントされた回数が 0 — 計測経路: 静的検査 + security-reviewer
- **権限ゲートの正しさ**: `Win32Runtime` 選択時に Auto / bypass が disabled — 計測経路: Playwright E2E
- **隔離の可視性**: 隔離状態が表示されないセッションが 0 — 計測経路: ux-reviewer + E2E

## Cross-domain dependencies

- 依存する domain: `runtime`（`capabilities` の表明、endpoint 判別、パス変換）
- 依存される domain: `session`（起動時の権限ゲート）、`ui`（隔離表示）
- 共有 invariant: Principle III / V / VI / X。詳細は [docs/domains/_overview.md](../_overview.md)

## Related ADRs

- [AD-008](../../decisions/0008-no-persistent-environment-provisioning.md) — 永続環境は作らない / 使い捨てコンテナは管理する
- [AD-012](../../decisions/0012-docker-control-via-cli.md) — Docker 制御は CLI 呼び出し、endpoint を値に持つ
- [AD-007](../../decisions/0007-session-source-of-truth-is-claude-code.md) — `sessionStore` ミラーの位置づけ

## Related Specs

（未着手。I-1 / I-2 / I-3 が本 domain に属する）

## Open Questions

- [ ] **transcript ミラーの保持期限・削除経路・エクスポートが未定義**（AD-007 の blocking gap）。
      ミラー対象は会話全文とソースコード断片であり個人情報を含みうる。
      Constitution の Principle 候補として起票が必要
- [x] ~~`/mnt/c` 越し bind mount の実効速度~~ → SPIKE-9 で測定し
      [AD-016](../../decisions/0016-cross-filesystem-performance-cliff.md) に記録。走査が約 800 倍遅い。
      ただし**コンテナ bind mount 経由は未測定**で、SPIKE-10 で確認する
- [ ] 越境警告を出す閾値（ファイル数か実測スループットか）。AD-016 の Open Question
- [ ] コンテナ内で Claude Code の sandbox も併用する場合、`enableWeakerNestedSandbox` が必要か
- [ ] コンテナの粒度はセッション単位を既定とするが、フォルダ単位の共有をいつ提供するか
