---
status: needs-human-review
last_updated: 2026-09-15
generated_by: human (PLAN.md を素案として再導出)
---

# Roadmap

`/cl-design` を実行していく順序と、各 feature の依存・前提 SPIKE を定義する。
feature の定義と domain 帰属は [docs/domains/_overview.md](domains/_overview.md) を正とする。
各 feature に投げる実際のプロンプトは [docs/prompts.md](prompts.md) にある。

## 原則

- **1 feature = 1 branch = 1 spec。** 各 feature は単体で動作確認できる垂直スライスとする（Principle XI）
- **SPIKE は feature ではない。** 対応する feature の spec 着手**前**の調査タスクとして扱い、
  結果は `docs/decisions/` に ADR として起票する
- **マイルストーンは「できるようになること」で定義する。** 完了判定を漸近線にしない

## 着手前に片付けること（Pre-flight）

M1 に入る前に必要。いずれも feature ではない。

| # | 作業 | 状態 | 理由 |
|---|---|---|---|
| P-1 | `pnpm` のインストールと `nodeLinker: hoisted` の設定 | **完了** | pnpm 12.4.1 導入済み。`pnpm-workspace.yaml` に `nodeLinker: hoisted` を配置済み |
| P-2 | Constitution を `active` に昇格する | **完了** | v1.0.0 批准 (2026-09-13)。15 Principle。`constitution.draft.md` は削除済み |
| P-3 | Principle VI の検証条件を書き直す | **完了** | 文字列 grep をやめ、モジュール境界で縛る形に変更済み |
| P-4 | `/cl-add-reviewer ui-coverage-reviewer` | **O-2 へ延期** | 検査対象の `docs/ui-coverage.md` が O-2 まで存在しない。それ以前は指摘がノイズにしかならない。O-2 のスコープに移動 |
| P-5 | `/cl-add-reviewer platform-boundary-reviewer` | **完了** | 作成・両レジストリ登録済み。観点は lint / tsc が見られない領域のみ（PB-1〜PB-7） |
| P-6 | `docs/discovery.md` を人間レビューし `status: active` へ | **完了** | revision 2 (2026-09-13)。scan 以降に変わった事実を更新したうえで active に昇格 |

### P-7 の補足: アーキテクチャは着手前に確定済み

[AD-023](decisions/0023-application-architecture.md) で `app` / `ui` / `agents` / `infra` / `domain` の
5 レイヤ構成を確定した。R-1 の最初のコミットで固定されるため、着手前に決める必要があった。
UseCase レイヤは作らず、状態の有無で純粋関数と Service を使い分ける。
依存規則は ESLint（編集時）と dependency-cruiser（CI・推移的依存）の両方で強制する。

### P-5 の補足: reviewer に何を持たせるか

Constitution Principle I / II / VII は **ESLint** で、VI は **CI の grep** で、
`HostPath` / `RuntimePath` の取り違えは **tsc** で機械的に検出される。
これらを reviewer に重複して持たせると、同じ検査を高いコストで遅く回すことになる。

`platform-boundary-reviewer` には **lint と型検査が構造的に見られない領域**だけを担当させた。
IPC / 永続化境界での型の消失、単一インスタンス仮定、capabilities の虚偽表明、
権限ゲートの迂回、多段パス変換の欠落、grep に掛からない永続化、
そして **lint ルール自体の穴**（ルールの複製ではなく、ルールの網羅性を見る）。

機械的な検査は **R-1 のスコープ**に含めた（ESLint ルールと CI の grep スクリプト）。

### P-1 の補足: pnpm と Electron の非互換

Electron のパッケージングツールチェーンは `node_modules` が npm と同じ形で**物理的に**
配置されていることを要求する。pnpm 既定のシンボリックリンク方式とは非互換であるため、
`nodeLinker: hoisted` の指定が要る（[Electron 公式チュートリアル](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)）。

pnpm 10 以降は設定の置き場が `.npmrc` から `pnpm-workspace.yaml` に移っている。
本リポジトリでは後者に配置済み。`packages:` キーを持たないため monorepo ではないが、
**`discovery-scanner` は `pnpm-workspace.yaml` の存在を monorepo marker として扱う**ので、
次回 `/spec-gate scan` の結果を読むときは注意すること。

## M1: 読める

**達成状態**: WSL 内の過去セッションを Windows の assistant-ui で読める。
**ここで軸 1 の方針を確定する。** 結果次第では `ui` charter と本ロードマップを見直す。

**進捗 (2026-09-15)**: R-1 の実装が完了した（`/cl-code-gate` 以降は未通過）。
検出・登録・解決と、5 レイヤの依存規則の機械強制、CI、SPIKE-13 の第 1 段階までが入っている。
**プロセス起動はまだどこにも無い** — R-1 は Agent SDK を依存として入れただけで呼び出していない。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 1 | R-1 | フォルダ登録とランタイム検出 **(実装完了 / gate 未通過)** | `runtime` | — | SPIKE-8 / SPIKE-9 **完了** |
| 2 | R-2 | セッション列挙（読み取り専用） | `session` | **R-1 の US-1〜US-3** | SPIKE-1 **完了** |
| 3 | R-3 | transcript の基本表示 | `ui` | R-2 | **SPIKE-2** / SPIKE-14 **完了** |
| 4 | R-4 | Tier A tool 表示 | `ui` | R-3 | — |
| — | — | *(SPIKE-9 / SPIKE-13 は R-1 までに実施)* | — | — | — |

**R-3 の完了時点で見栄えの一次判断ができる。** R-4 まで待たない。

#### R-3 への申し送り (pr-gate Round 4 / 2026-09-23)

**持ち主のいない延期を残さない** (AD-028 §5 が確立した規範)。R-2 が先送りした判断はここが持ち主である。

| # | 申し送り | 根拠 |
|---|---|---|
| 1 | **Principle IX の再評価** — 列挙応答のパースを main に残す判断。R-3 が transcript 本文を運ぶ時点で「数 MB の `tool_result`」が実際に現れるので、構造体 `postMessage` への移行を判断する | [AD-031](decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2 |
| 2 | **`createLineAssembler` の行長上限** — 現状パース対象のバイト列に上限が無い。#1 と同時に判断する | AD-031 訂正 (2026-09-23) |
| 3 | **検証項目 13 / 14 の構造化** — 項目 13 は別名 1 つ (`const f = ops.toUnc`) で無効化され、項目 14 は default / 動的 import など **5 形を素通し**する (どちらも A/B 実測済み)。項目 13 は「`agents → path-api` の import 0 件」を depcruise で、項目 14 は `matchAll` + 動的 import 検出で置き換える | pr-gate Round 4 / C4-007 / C4-008 |
| 4 | **デバイス名前空間の綴りの再評価** — `\\?\UNC\` / `\\.\UNC\` / `\\?\C:\` は**実機で解決する**が、実測 0 件のため解析していない。R-3 までに実測が増えたら判断し直す | [AD-032](decisions/0032-unc-shape-classification-by-separator-count.md) |
| 5 | **`opaque-unc` を spec の Edge Cases に記録** — 「値はあるが読めない」は `UnknownReason` の 3 値のどれでもない第 3 の状態である | pr-gate Round 4 / PO4-006 |

**Principle XV (i18n) の棚卸しへの申し送り**: `src/main/infra/session/target-finder.ts` の
`候補 #N` / `名前 (#N)` は **`infra` が生成する日本語**であり、「訳出は `ui`」(FR-031 / FR-047) の例外である。
一意性を境界の手前で決める必要があるため現状はここに置いている
(移すと `EnumerationTarget` + DTO 2 本にフィールドが増える)。
**M3 までの i18n リソース化の判断でこの 2 本を必ず含めること** (pr-gate Round 4 / A4-006)。

#### R-2 の依存は R-1 の全体ではない

R-2 が要るのは **US-1（ランタイム検出）/ US-2（フォルダ登録）/ US-3（組み合わせの解決）**である。
これらが揃った時点で「どのディストロのどのフォルダを見るか」が決まり、
セッションの列挙先（`<config-dir>/projects/<encoded-cwd>/`）を組み立てられる。

R-1 の残り 2 つは R-2 をブロックしない。

| R-1 の US | R-2 への関係 |
|---|---|
| US-4（依存規則違反がその場で止まる） | Foundational だが R-2 の入力ではない。**先に入れておく価値は「R-2 以降のコードが最初から規則下に置かれる」こと**にある |
| US-5（リポジトリを訪れた人が現状を把握できる） | R-2 の入力ではない。Polish |

**R-1 の US-3 完了時点で R-2 に着手してよい。**

### M2 の前提は先に潰してある

**SPIKE-5**（`spawnClaudeCodeProcess` による WSL 起動）は M1 に先立って実施済み
（[AD-018](decisions/0018-wsl-process-control.md)）。ここが通らないと M2 が成立しないため
早く潰した。結果として stdin / stdout の疎通、中断機構、大きな tool_result の扱いは確定している。

## M2: 走らせられる

**達成状態**: 起動条件を選んで複数セッションを回せる。日本語で誤送信しない。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 5 | X-1 | 単一セッション起動とストリーミング | `session` | R-4 | SPIKE-5 / SPIKE-3 **完了** |
| 6 | X-2 | 日本語 composer | `ui` | X-1 | **SPIKE-4** |
| 7 | X-3 | Provider 登録と到達可能性判定 | `provider` | X-1 | **SPIKE-7** |
| 8 | X-4 | 起動設定ダイアログとプリセット | `session` | X-3 | SPIKE-6 **完了** / 越境警告 AD-016 / 作業領域戦略 AD-017 / 権限モード 6 値 AD-020 |
| 9 | X-5 | supervisor 分離とマルチセッション | `session` | X-4 | — |

X-2 を X-1 の直後に置いたのは、**日本語入力が壊れたままでは以降の feature を自分で使えない**ため。
Principle VIII は製品の採否条件であり、後回しにすると検証が遅れる。

## M3: 差配できる

**達成状態**: 10 セッションを俯瞰でき、未表示情報がゼロ。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 10 | O-1 | セッション監視ビュー | `session` | X-5 | — |
| 11 | O-2 | `docs/ui-coverage.md` の確立（**SDK 39 型から導出**）+ Tier B/C 再棚卸し | `ui` | O-1 | SPIKE-12 **完了** |
| 12 | O-3 | Thread 検索と observability | `ui` | O-2 | — |

**O-2 で対応表そのものを成果物にする。** これが揃うまで Principle XII は検証不能である。

## M4: 任せられる

**達成状態**: Auto / `bypassPermissions` を隔離内で安全に回せる。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 13 | I-1 | `DockerRuntime` と endpoint 抽象 + `sessionStore` | `isolation` | X-5 | SPIKE-10 **完了** / SPIKE-11（再定義） |
| 14 | I-2 | コンテナライフサイクルと隔離可視化 **+ volume 孤児回収** | `isolation` | I-1 | — |
| 15 | I-3 | sandbox capability 判定と権限モードのゲート | `isolation` | I-2 | — |

I-1 では **`wsl:<distro>` endpoint（WSL 内 Docker Engine）を第一に検証する。**
主開発ホストに Docker Desktop は入っていない。`/mnt/c` 越し bind mount の実効速度もここで実測し、
遅ければ §13.2 のリポジトリ配置方針を見直す。

## M5: 配れる

**達成状態**: 自分以外が使える。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 16 | D-1 | パッケージングと Windows インストーラ | `runtime` | O-3 | **SPIKE-13**（本格確認） |

## Optional scope

どのマイルストーンも待たない。やる価値はあるが critical path に乗らない。

| ID | feature | domain | 着手の目安 |
|---|---|---|---|
| OPT-mac | macOS 対応（`DirectRuntime` / Seatbelt / IME 検証） | `runtime` | M5 の後、必要になったら |
| OPT-pty | PTY フォールバックタブ | `ui` | SDK 経路で足りない対話 TUI に出会ったら |

## SPIKE 一覧

| ID | 内容 | いつ | 所要 |
|---|---|---|---|
| SPIKE-8 | ランタイム検出とパス変換の確定。**docker endpoint の検出手段を含む** | R-1 の前 | **完了 (2026-09-13)** → [AD-015](decisions/0015-wsl-access-strategy.md) |
| SPIKE-1 | `listSessions()` と `CLAUDE_CONFIG_DIR` の関係 | R-2 の前 | **完了 (2026-09-13)** → [AD-021](decisions/0021-session-store-and-enumeration.md)。config dir は引数で取れない。子プロセス方式が本線 |
| SPIKE-2 | assistant-ui Elements の導入コスト実測 | R-3 の前 | 半日 |
| SPIKE-5 | `spawnClaudeCodeProcess` による WSL 起動 | X-1 の前 | **完了 (2026-09-13)** → [AD-018](decisions/0018-wsl-process-control.md) |
| SPIKE-3 | `claude` プロセスの実メモリ測定 | X-1 の前 | **完了 (2026-09-13)** → [AD-001](decisions/0001-adopt-electron-over-tauri.md) に追記。idle 225MB / 並列でも変わらず |
| SPIKE-4 | 日本語 IME の composer 挙動 | X-2 の前 | 1〜2時間 |
| SPIKE-7 | 認証委譲機構の確認 | X-3 の前 | 半日 |
| SPIKE-6 | SDK 型定義からの選択肢確定 | X-4 の前 | **ほぼ完了 (2026-09-13)** → [AD-020](decisions/0020-sdk-emitted-message-inventory.md)。`SandboxSettings` の詳細のみ I-3 前に残す |
| SPIKE-9 | **`/mnt/c` 越し bind mount の実効速度** | R-1 の前 | **完了 (2026-09-13)** → [AD-016](decisions/0016-cross-filesystem-performance-cliff.md) |
| SPIKE-10 | `docker exec -i` 疎通 / 非 root × bypassPermissions | I-1 の前 | **完了 (2026-09-13)** → [AD-022](decisions/0022-docker-exec-process-control.md)。疎通 OK、**kill は孤児化**、非 root 必須を確認 |
| SPIKE-11 | **再定義**: `SessionStoreEntry` の型と SQLite スキーマ設計（ミラー手段自体は AD-021 で解決） | I-1 の前 | 1〜2時間 |
| **SPIKE-14** | **assistant-ui の element 実在確認** | R-3 の前 | **完了 (2026-09-13)** → [AD-019](decisions/0019-assistant-ui-element-inventory.md) |
| SPIKE-12 | SDK が emit する型・tool 名・システムイベントの全列挙 | O-2 の前 | **完了 (2026-09-13)** → [AD-020](decisions/0020-sdk-emitted-message-inventory.md)。`SDKMessage` は 39 型 |
| SPIKE-13 | `asarUnpack` とネイティブバイナリの同梱可否 | **R-1 で薄く試す** / D-1 の前に本格確認 | **第 1 段階 完了 (2026-09-15)** → [AD-026](decisions/0026-packaging-first-pass.md)。`claude.exe` (227 MB) が asar 外に実行ビット付きで展開され、インストーラ (約 176 MB) が生成できた。**第 2 段階（署名・公証・自動更新）は D-1** / 半日 |

各 SPIKE の結果は `docs/decisions/` に ADR として起票する（PLAN.md §3 ではない）。

### SPIKE-9 を前倒しする理由

[AD-012](decisions/0012-docker-control-via-cli.md) では「I-1 で実測する」としていたが、
**これは PLAN.md §13.2 の「リポジトリを Windows 側 NTFS に置く」という根本方針を覆しうる**論点である。

WSL 内 Docker Engine に `/mnt/c` 越しで bind mount する構成が実用にならない速度なら、
選択肢は「リポジトリを WSL 側に置く」か「コンテナ内で作業フォルダを別管理する」になる。
**M4 まで待つと、それまでに積み上げた配置前提がすべてひっくり返る。**
R-1 に着手する前に潰しておくべきである。

### SPIKE-12 と SPIKE-6 の違い

SPIKE-6 は `SessionLaunchConfig` の**選択肢の値**（`PermissionMode` の列挙値、`effort` の段階）を
確定するもの。SPIKE-12 は **UI が表示すべき情報の全集合**（メッセージ型 / tool 名 / システムイベント）を
列挙するもので、`docs/ui-coverage.md` の行そのものになる。別物なので分けてある。

### SPIKE-13 を 2 段階にする理由

`asarUnpack` でネイティブバイナリが動く形で同梱できるかは「やってみないと分からない」典型で、
**D-1（M5）で初めて詰まると配布経路ごと失われる**。R-1 でプロジェクトを初期化する時点で
Agent SDK を 1 つ入れて `electron-builder` を 1 回通すだけでも、致命的な非互換は早期に見つかる。

**第 1 段階で実際に 2 つ見つかった。** いずれもホストのセキュリティ製品との相互作用で、
素の `electron-builder` ではインストーラが生成できなかった
（[AD-026](decisions/0026-packaging-first-pass.md) §3）。D-1 で初めて踏んだ場合、
配布経路の問題とビルド環境の問題の切り分けから始めることになっていた。

あわせて **インストーラの大半が SDK 同梱バイナリである**ことが分かった。
D-1 で配布サイズを議論する際、削減余地はアプリ側のバンドルではなくそこにある。

## 1 feature のワークフロー

```
/cl-design "<docs/prompts.md の該当プロンプト>"
      ├─ /cl-spec        spec.md        (drafting)
      ├─ /cl-plan        plan.md        (→ planning)
      ├─ /cl-tasks       tasks.md       (→ tasking)
      └─ /cl-design-gate Critical=0 で   (→ implementing)
/cl-implement        ← auto-chain で code-gate
/cl-code-gate        ← PASS で reviewing へ
/cl-pr-gate          ← Critical=0 で done を許可
/cl-done             ← PR 提出、completed へ
```

**`/cl-design` が Design フェーズ 4 ステップを 1 コマンドで完走する。** 個別起動も可能。

gate が fail したら status を進めない。Critical を解消してから再実行する。
design-gate が FIX_REQUIRED のときは status が `tasking` に留まり（`implementing` からは降格）、
`/cl-design --spec-dir <dir> --from gate` で再開する。
