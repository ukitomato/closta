---
domain: runtime
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-09-12
related_adrs:
  - docs/decisions/0003-runtime-abstraction-by-transport.md
  - docs/decisions/0004-branded-path-types.md
  - docs/decisions/0009-unpack-native-binaries-from-asar.md
  - docs/decisions/0012-docker-control-via-cli.md
  - docs/decisions/0013-node-and-electron-versioning.md
related_specs: []
---

# Domain Charter: runtime

## Mission

`runtime` domain は、**Claude Code プロセスを「どこで」「どうやって」起動するかを抽象化し、
ホストと実行環境のあいだのパス名前空間と能力差を吸収する**ことを担う。

利用者には「作業フォルダをどこで開くか選べる」という形で現れ、他 domain には
「どのランタイムでも同じ手順でプロセスを起動しパスを解決できる」基盤として現れる。
アプリ自身の配布（ネイティブバイナリと ABI の整合）も本 domain が持つ。

## Scope

### In scope

- `AgentRuntime` インタフェースと起動契約
- ランタイムの検出 — WSL ディストロ一覧、WSL1 / WSL2 の判別、docker endpoint（`host` / `wsl:<distro>`）の判別
- `capabilities` の決定 — `sandbox` の種別と `autoModeSafe` の可否を**表明する**こと
- `HostPath` / `RuntimePath` の branded type と、多段を含むパス変換
- 作業フォルダの登録と、ランタイムからの到達可能性判定
- アプリのパッケージングと配布（`asarUnpack`、`electron-rebuild`、インストーラ生成）

### Out of scope

- `capabilities` を**使って**権限モードを制限すること → `isolation` domain
  （本 domain は能力を表明するところまで。ゲートは `isolation`）
- コンテナのライフサイクルと隔離設計 → `isolation` domain
- セッションの列挙・起動・監視 → `session` domain
- 認証と環境変数の導出 → `provider` domain
- 画面表示 → `ui` domain
- WSL ディストロの作成、Docker イメージのビルド、sandbox 依存パッケージの導入 → **非目標**（Principle VI）

## Actors / Personas

- **エンドユーザ（開発者）**: 作業フォルダを登録し、それをどのランタイムで開くかを選ぶ。
  ランタイムが提供できない機能は選択肢として現れないことを期待する
- **他 domain（システム）**: ランタイムを値として受け取り、プロセス起動とパス解決を委譲する

## User Journey

### Journey 1: 起動先ランタイムの検出と提示

1. アプリ起動時、システムはホストで利用可能なランタイムを走査する
2. Windows なら `Win32Runtime` と、検出された WSL ディストロごとの `WslRuntime` を列挙する
3. 各ランタイムの `capabilities` を判定する
4. ユーザは一覧から起動先を選ぶ

### Journey 2: フォルダをランタイム間で解決する

1. ユーザが Windows 側のフォルダを登録する
2. `WslRuntime` を選ぶと、システムが `HostPath` を `RuntimePath` に変換する
3. そのランタイムから到達できないフォルダは選択肢に現れない

### Journey 3: 配布物を作る

1. 開発者がインストーラをビルドする
2. ネイティブバイナリが asar から展開され、実行ビットが維持される
3. 利用者がインストーラを実行し、セッションを起動できる

## Key concepts

- **AgentRuntime**: Claude Code プロセスを起動する場所と方法。シングルトンではなく検出結果から生成される値
- **capabilities**: ランタイムが提供する能力。`sandbox` の種別と `autoModeSafe` の可否
- **HostPath** / **RuntimePath**: ホストから見たパス / ランタイム内部から見たパス
- **endpoint**: `DockerRuntime` が docker CLI に到達する経路

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- パス操作は必ず `runtime.path` を経由する（Principle I）
- プラットフォーム分岐は `AgentRuntime` 実装の内側に閉じる（Principle II）
- ランタイムは `capabilities` を**正直に表明する**。能力がないものを「ある」と言ってはならない
- 永続環境（ディストロ・イメージ・OS 設定）を構築・変更しない（Principle VI）
- supervisor は Electron とネイティブモジュールに依存しない（Principle VII）

## KPI / Success metrics

- **パス変換の正しさ**: `Win32Runtime`（恒等）と `WslRuntime`（`C:\` ↔ `/mnt/c`、`/home`）の
  往復変換ユニットテストが 100% 通過 — 計測経路: Vitest
- **検出の網羅**: ホストに存在する WSL ディストロと docker endpoint を取りこぼさない — 計測経路: 手動検証 + E2E
- **capability の正確さ**: `Win32Runtime` が `autoModeSafe: false` を表明する — 計測経路: ユニットテスト
- **配布物の実行可能性**: 生成したインストーラからネイティブバイナリが起動できる — 計測経路: M5 の手動検証

## Cross-domain dependencies

- 依存する domain: なし（最下層）
- 依存される domain: `session`, `isolation`, `ui`
- 共有 invariant: Principle I / II / VI。詳細は [docs/domains/_overview.md](../_overview.md)

## Related ADRs

- [AD-003](../../decisions/0003-runtime-abstraction-by-transport.md) — ランタイム抽象はトランスポート軸で切る
- [AD-004](../../decisions/0004-branded-path-types.md) — パスは branded type で名前空間を分離する
- [AD-009](../../decisions/0009-unpack-native-binaries-from-asar.md) — ネイティブバイナリは asar から展開する
- [AD-012](../../decisions/0012-docker-control-via-cli.md) — docker endpoint（`isolation` と共有）
- [AD-013](../../decisions/0013-node-and-electron-versioning.md) — Node と Electron のバージョン方針
- [AD-023](../../decisions/0023-application-architecture.md) — レイヤ構成。`AgentRuntime` は
  「検出（infra）」「起動（agents）」「パス変換（domain）」に分かれる

## Related Specs

（未着手。R-1 / D-1 / OPT-mac が本 domain に属する）

## Open Questions

- [x] ~~SPIKE-8: WSL 内 `~/.claude/projects` の読み取り方法とその実効速度~~ →
      [AD-015](../../decisions/0015-wsl-access-strategy.md) で確定。UNC 直読みが単一ファイルで
      **50 倍**速い（32 ms vs 1,622 ms）。`wsl.exe` はプロセス起動にのみ使う
- [x] ~~SPIKE-8: docker endpoint の検出手段と Docker Desktop 構成との判別~~ → AD-015。
      ディストロごとに約 1.7 秒かかるため、起動時 1 回の走査 + キャッシュとする
- [x] ~~ランタイム検出結果のキャッシュ戦略~~ → AD-015。キャッシュのキーにディストロ名と
      endpoint を含める。再検出はユーザの明示操作とディストロの起動/停止検知時に限る
- [ ] **フォルダ × ランタイムの越境判定** — [AD-016](../../decisions/0016-cross-filesystem-performance-cliff.md)。
      パス形式だけで判定するか実測を伴うか。R-1 のスコープに入る
- [ ] **停止中ディストロの扱い** — 検出のために起動してよいか。`wsl.exe -d <stopped>` は
      ディストロを起動してしまう。`capabilities: unknown` として扱い、選択時に初めて
      判定する案がある
- [ ] WSL サービス停止時に UNC 経路が使えない場合のフォールバックが要るか
- [x] ~~`socat` 不在時の sandbox への影響~~ → socat は**必須依存**であり、不在なら sandbox は
      動作しない。計測環境は導入後に `sandbox: 'bubblewrap'` へ変わり、隔離の実動作も確認済み
      （AD-015）。アプリは導入しない（Principle VI）ので案内にとどめ、capabilities に反映する
- [ ] seccomp フィルタ（`@anthropic-ai/sandbox-runtime`、任意依存）の有無を `capabilities` で
      区別するか。無いと UNIX ドメインソケット経由の抜け道が残る
- [ ] `wsl.exe` の固定コスト 1.5 秒が一般的な値か、計測環境固有（Defender / wsl-vpnkit）か
- [ ] D-1（配布）に署名・自動更新まで含める場合、本 domain から分離すべきか
