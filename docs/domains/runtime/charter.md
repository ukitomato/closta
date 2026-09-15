---
domain: runtime
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-09-15
related_adrs:
  - docs/decisions/0003-runtime-abstraction-by-transport.md
  - docs/decisions/0004-branded-path-types.md
  - docs/decisions/0009-unpack-native-binaries-from-asar.md
  - docs/decisions/0012-docker-control-via-cli.md
  - docs/decisions/0013-node-and-electron-versioning.md
  - docs/decisions/0015-wsl-access-strategy.md
  - docs/decisions/0016-cross-filesystem-performance-cliff.md
  - docs/decisions/0025-workspace-folder-carries-location.md
  - docs/decisions/0026-packaging-first-pass.md
related_specs:
  - specs/001-runtime-folder-registration-runtime-detection/spec.md
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
- ランタイムの検出 — WSL ディストロ一覧、WSL1 / WSL2 の判別、実行状態の確認
- `capabilities` の決定 — `sandbox` の種別と `autoModeSafe` の可否を**表明する**こと
- パスの名前空間を分離する branded type と、多段を含むパス変換
- 作業フォルダの登録（**所在を伴う**）と、ランタイムからの到達可能性判定
- アプリのパッケージングと配布（`asarUnpack`、`electron-builder install-app-deps`、インストーラ生成）

### Out of scope

- `capabilities` を**使って**権限モードを制限すること → `isolation` domain
  （本 domain は能力を表明するところまで。ゲートは `isolation`）
- コンテナのライフサイクルと隔離設計 → `isolation` domain
- セッションの列挙・起動・監視 → `session` domain
- 認証と環境変数の導出 → `provider` domain
- **docker endpoint（`host` / `wsl:<distro>`）の判別** → `isolation` domain。
  endpoint は `DockerRuntime` の構成であり、コンテナのライフサイクル設計と不可分である
  （[AD-012](../../decisions/0012-docker-control-via-cli.md) は両 domain の共有 ADR）
- transcript / tool 表示の element 選定と見た目 → `ui` domain。
  **ただし本 domain の操作 UI（ランタイム一覧・フォルダ登録・組み合わせ選択）は本 domain が持つ**
  （[AD-025](../../decisions/0025-workspace-folder-carries-location.md)。`ui` charter の Out of scope と対になる）
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

- **AgentRuntime**: Claude Code プロセスを起動する場所と方法を表す**インタフェース**。
  `descriptor` と `path` を持つ。シングルトンではない
- **RuntimeDescriptor**: 検出で得られた**ランタイムの事実**を表す値。
  「検出結果から生成される値」にあたるのは `AgentRuntime` ではなくこちらである
- **capabilities**: ランタイムが提供する能力。`sandbox` の種別と `autoModeSafe`（**3 値**）に加え、
  `probeState` / `seccompFilter` / `missingDependencies` / `probedAt` を持つ。
  **項目の欠落を「問題なし」と読まない**
- **HostPath** / **RuntimePath** / **WslUncPath**: ホストから見たパス / ランタイム内部から見たパス /
  Windows 側から WSL を指す UNC 形式のパス。**3 名前空間**であり、
  WSL 側の識別子はディストロ粒度で持つ
- **Location**: 作業フォルダの**所在**。パスとは別に保持する
- **Reachability**: 到達可能性の 3 値（`reachable` / `unreachable` / `blocked`）
- **endpoint**: `DockerRuntime` が docker CLI に到達する経路（判別は `isolation`）

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- パス操作は `domain` が公開するパス API を経由する。ランタイム名前空間の操作は
  `AgentRuntime.path` として公開し、**ホスト名前空間の操作と接頭辞照合は同モジュール群の別の公開面**とする。
  標準モジュールを直接 import してよいのは実装ファイル 1 つに限る
  （Principle I / [AD-024](../../decisions/0024-constitution-verification-paths.md) #14）
- プラットフォーム分岐は `src/main/infra/runtime/` の内側に閉じる（Principle II / AD-024 #8）
- ランタイムは `capabilities` を**正直に表明する**。能力がないものを「ある」と言ってはならない。
  確認していないことは `unknown` として表明し、`true` に丸めない
- 検出は**停止中のディストロを起動しない**。起動が必要な判定は `blocked` として
  解消手順とともに返す（SC-005）
- 永続環境（ディストロ・イメージ・OS 設定）を構築・変更しない（Principle VI）
- supervisor は Electron とネイティブモジュールに依存しない（Principle VII）

## KPI / Success metrics

**WSL 側**（R-1 で計測経路が通った）

- **パス変換の正しさ**: `Win32Runtime`（恒等）と `WslRuntime`（`C:\` ↔ `/mnt/c`、`/home`）の
  往復変換ユニットテストが 100% 通過 — 計測経路: Vitest
- **検出の網羅**: ホストに存在する WSL ディストロを取りこぼさない — 計測経路: 実機検証（quickstart V-1）
- **停止中ディストロを起動しない**: 検出の前後で実行状態が変わらない — 計測経路: 実機検証（`wsl -l -v` の前後比較。SC-005）
- **capability の正確さ**: `Win32Runtime` が `autoModeSafe: false` を表明する — 計測経路: ユニットテスト
- **検出の所要時間**: 一覧 3,000 ms / 判定バッチ 4,000 ms / キャッシュ応答 100 ms 以内 — 計測経路: 実機計測（SC-004）

**docker 側**（`isolation` と共有。計測経路は I-1 で立つ）

- **endpoint の判別**: `host` / `wsl:<distro>` を取りこぼさず、Docker Desktop 構成と区別できる — 計測経路: I-1 の実機検証
- **判別コスト**: ディストロごとの走査を起動時 1 回に抑える — 計測経路: I-1 の実機計測

**配布**

- **配布物の実行可能性**: 生成したインストーラからネイティブバイナリが起動できる — 計測経路: M5 の手動検証。
  **R-1 の時点では「asar 外に展開され実行ビットが保たれること」までを確認した**
  （[AD-026](../../decisions/0026-packaging-first-pass.md)。起動そのものは D-1）

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
- [AD-015](../../decisions/0015-wsl-access-strategy.md) — WSL への到達手段
- [AD-016](../../decisions/0016-cross-filesystem-performance-cliff.md) — 越境の性能崖
- [AD-025](../../decisions/0025-workspace-folder-carries-location.md) — 作業フォルダは所在を伴う。
  パス型モデルを 3 名前空間に一般化する
- [AD-026](../../decisions/0026-packaging-first-pass.md) — インストーラ生成の第 1 段階

## Related Specs

- [R-1 フォルダ登録とランタイム検出](../../../specs/001-runtime-folder-registration-runtime-detection/spec.md)
  — 検出・登録・解決を実装した。**起動（`AgentRuntime.launch`）は含まない**

D-1 / OPT-mac は未着手。

## Open Questions

- [x] ~~SPIKE-8: WSL 内 `~/.claude/projects` の読み取り方法とその実効速度~~ →
      [AD-015](../../decisions/0015-wsl-access-strategy.md) で確定。UNC 直読みが単一ファイルで
      **50 倍**速い（32 ms vs 1,622 ms）。`wsl.exe` はプロセス起動にのみ使う
- [x] ~~SPIKE-8: docker endpoint の検出手段と Docker Desktop 構成との判別~~ → AD-015。
      ディストロごとに約 1.7 秒かかるため、起動時 1 回の走査 + キャッシュとする
- [x] ~~ランタイム検出結果のキャッシュ戦略~~ → AD-015。キャッシュのキーにディストロ名と
      endpoint を含める。再検出はユーザの明示操作とディストロの起動/停止検知時に限る
- [x] ~~**フォルダ × ランタイムの越境判定** — パス形式だけで判定するか実測を伴うか~~ →
      [AD-025](../../decisions/0025-workspace-folder-carries-location.md) で確定。
      **所在 × ランタイム × マッピングの表で決める。実測は伴わない。**
      判定は 3 段（到達可否 → 変換材料の有無 → 変換と越境）であり、
      **第 2 段の鍵は `pathMapping` の有無であって `probeState` ではない**
- [x] ~~**停止中ディストロの扱い** — 検出のために起動してよいか~~ → R-1 で確定。
      **起動しない**（SC-005。実機で `wsl -l -v` の前後比較により確認）。
      停止中は `probeState: 'not-probed'` / `autoModeSafe: 'unknown'` のまま列挙し、
      到達可能性は `blocked`（`distro-not-running`）として解消手順を添えて返す。
      **`unreachable` と混ぜない** — 起動すれば解消するものと、改名・削除で解消しないものは
      利用者に示す次の操作が違う
- [x] ~~WSL サービス停止時に UNC 経路が使えない場合のフォールバックが要るか~~ → R-1 で確定。
      **フォールバックを持たない。** 列挙の失敗は理由付きで返し、到達可能性は `blocked` になる。
      `wsl.exe` による代替列挙を用意すると、UNC が使えない状況で
      **停止中ディストロを起動する経路ができてしまい SC-005 に反する**
- [x] ~~`socat` 不在時の sandbox への影響~~ → socat は**必須依存**であり、不在なら sandbox は
      動作しない。計測環境は導入後に `sandbox: 'bubblewrap'` へ変わり、隔離の実動作も確認済み
      （AD-015）。アプリは導入しない（Principle VI）ので案内にとどめ、capabilities に反映する
- [x] ~~seccomp フィルタ（`@anthropic-ai/sandbox-runtime`、任意依存）の有無を `capabilities` で
      区別するか~~ → R-1 で確定。**`seccompFilter` として `capabilities` に持つ。**
      判定前は `'unknown'` であり、`false` に丸めない。
      **これを `autoModeSafe` に織り込むかは I-3 の判断**とする —
      「安全とみなす sandbox 種別」の定義を `isolation` に移す時点で決める（AD-025 §5）
- [ ] `wsl.exe` の固定コスト 1.5 秒が一般的な値か、計測環境固有（Defender / wsl-vpnkit）か。
      **R-1 の実機計測では実行状態の確認 1 回で 1.2〜1.4 秒**であり AD-015 の値と整合した。
      ただし計測したのは同一ホストのみなので、一般性は依然として未確認である。
      **判定バッチの実測は 3,593〜3,910 ms で予算 4,000 ms に対し余裕が薄い**（SC-004）。
      別環境で固定コストが上振れすると最初に破れるのはここである
- [ ] D-1（配布）に署名・自動更新まで含める場合、本 domain から分離すべきか
