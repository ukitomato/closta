---
status: needs-human-review
last_updated: 2026-09-15
generated_by: human (PLAN.md を素案として再導出)
---

# Domain Overview

Closta を 5 つの domain に分割する。各 charter は `docs/domains/<name>/charter.md`。

charter は **「誰が何をできるか / どう使うか / 何の技術で / ゴールは何か」** の粒度で書く。
機能の詳細仕様と実装方針は spec（`specs/<spec_id>/spec.md`）の責務であり、charter には書かない。

## 導出の経緯

「ユーザーが何をできるか」から引き直すと 6 つの能力が出る —
**見つける / 読む / 走らせる / 差配する / 環境を選ぶ / 安全に任せる**。
これを責務に畳むと下表の 5 domain になる。PLAN.md の素案（runtime / session / provider / ui / container）と
独立に導いて同じ形に落ちたため、この切り方を採用する。

素案からの実質的な変更は **`container` → `isolation`** の 1 点のみ。
理由は sandbox capability の判定（Seatbelt / bubblewrap を含む）と権限モードのゲート、
隔離状態の可視化が Docker に限らない責務であり、`container` という名前に収まらないためである。

## Domain map

| domain | mission（要約） | 軸 |
|---|---|---|
| `runtime` | Claude Code プロセスを「どこで」「どうやって」起動するかを抽象化し、パス名前空間と能力差を吸収する。配布も持つ | — |
| `session` | 複数フォルダ・複数ランタイムのセッションを一箇所から走査・起動・監視・差配する | — |
| `provider` | 認証方式を含む Provider を登録可能な値として一般化し、実行環境を導出する | 軸 2 |
| `isolation` | 危険な権限モードを安全に回せる境界を提供し、今どこで何の権限で動いているかを常に可視にする | 軸 3 |
| `ui` | Claude Code が emit する情報すべてに専用表示を与え、日本語環境で破綻しない操作体験を提供する | 軸 1 |

### `ui` を domain と呼ぶことについて

UI は本来 domain ではなく delivery mechanism である。それでも独立させるのは、
§4.1 が「emit される情報のうち専用表示を持たないものをゼロにする」という
**測定可能な達成目標**を与えているためである。各 domain に表示責務を散らすと
Constitution Principle XII の持ち主がいなくなり、軸 1 が検証不能になる。

## Feature 帰属

feature ID は **フェーズ接頭辞 + 連番**（`R-1` / `X-2` …）とする。
spec_id（`001-runtime-...`）とは独立させる。差し込み作業で番号がずれるのを避けるため。

| ID | feature | domain | milestone |
|---|---|---|---|
| R-1 | フォルダ登録とランタイム検出。**プロジェクト初期化・5 レイヤと依存規則の機械強制・CI・操作 UI（ランタイム一覧 / フォルダ登録 / 組み合わせ選択）を含む**。`Win32Runtime` + `WslRuntime` の検出、3 名前空間のパス型、到達可能性と越境の解決。**プロセス起動は含まない** | `runtime` | M1 |
| R-2 | セッション列挙（読み取り専用、WSL 内 config を Windows から横断） | `session` | M1 |
| R-3 | transcript の基本表示（markdown / streaming text / scroll anchor / tool fallback） | `ui` | M1 |
| R-4 | Tier A tool 表示（Terminal / Code diff / Todo / Subagent / Agent plan / Reasoning） | `ui` | M1 |
| X-1 | 単一セッション起動とストリーミング（Approval card、中断） | `session` | M2 |
| X-2 | 日本語 composer（IME ガード、message queue、draft restore） | `ui` | M2 |
| X-3 | Provider 登録と到達可能性判定 | `provider` | M2 |
| X-4 | 起動設定ダイアログとプリセット（軸の依存解決） | `session` | M2 |
| X-5 | supervisor 分離とマルチセッション（10 並列） | `session` | M2 |
| O-1 | セッション監視ビュー（状態一覧、密度切替、承認待ちの強調） | `session` | M3 |
| O-2 | `docs/ui-coverage.md` の確立と Tier A 完全化 | `ui` | M3 |
| O-3 | Thread 検索と observability | `ui` | M3 |
| I-1 | `DockerRuntime` と endpoint 抽象 + `sessionStore` ミラー | `isolation` | M4 |
| I-2 | コンテナライフサイクルと隔離可視化 | `isolation` | M4 |
| I-3 | sandbox capability 判定と権限モードのゲート | `isolation` | M4 |
| D-1 | パッケージングと Windows インストーラ | `runtime` | M5 |

### Optional scope（どのマイルストーンも待たない）

| ID | feature | domain | 備考 |
|---|---|---|---|
| OPT-mac | macOS 対応（`DirectRuntime`、Seatbelt capability、IME / レンダリング検証） | `runtime` | Windows 主軸の個人開発では critical path に乗らない |
| OPT-pty | PTY フォールバックタブ（xterm.js + node-pty） | `ui` | SDK 経路で足りない対話 TUI 用 |

### 帰属の判断根拠（迷いやすいもの）

- **X-2（日本語 composer）を `ui` の独立 feature にした** — Principle VIII は AD-001（Electron 採用）の
  理由であり §13.2（WSLg 不使用）の理由でもある。製品の採否条件が乗っている以上、
  他 feature の受け入れ条件の一項目として埋没させない
- **X-4（起動設定ダイアログ）は `session`** — UI 部品を多く含むが、中心は軸どうしの依存解決である
- **O-2 で `docs/ui-coverage.md` そのものを成果物にした** — Principle XII の検証基盤が
  素案では誰の担当でもなかった
- **D-1（配布）は `runtime`** — `asarUnpack` とネイティブモジュールの ABI（AD-009 / AD-013）は
  実行環境の問題であり `runtime` の関心事と重なる

## Milestone

各マイルストーンを「**できるようになること**」で定義する。
素案の M3「UI 完成」は漸近線であり完了判定が曖昧だったため、達成状態で言い換えた。

| | 定義 | feature | 完了の判定 |
|---|---|---|---|
| **M1** | **読める** | R-1〜R-4 | WSL 内の過去セッションを Windows の assistant-ui で読める。**ここで §4 の方針を確定する** |
| **M2** | **走らせられる** | X-1〜X-5 | 起動条件を選んで複数セッションを回せる。日本語で誤送信しない |
| **M3** | **差配できる** | O-1〜O-3 | 10 セッションを俯瞰でき、未表示情報がゼロ |
| **M4** | **任せられる** | I-1〜I-3 | Auto / bypassPermissions を隔離内で安全に回せる |
| **M5** | **配れる** | D-1 | 自分以外が使える |

**M1 を 4 feature に抑えてあるのは意図的**である。UI の見栄えが製品の採否を決める以上、
最短で判断材料を出す必要がある。素案では transcript 表示と Tier A tool が 1 feature に
束ねられていたが、これを R-3 / R-4 に割ったことで **R-3 の時点で一次判断ができる**。

## 依存関係

```
            ui
        ↗   ↑   ↖
  session   |    isolation
     ↑  ↖   |   ↗
 provider  runtime
```

- `runtime` は最下層。他 domain に依存しない
- `isolation` は `runtime` に依存する（`DockerRuntime` は `AgentRuntime` の実装）
- `session` は `runtime` と `provider` に依存する
- `ui` は全 domain に依存する（表示対象がすべての domain にまたがる）

## Cross-domain invariants

domain をまたいで守られるべき不変条件。いずれも Constitution Principle として昇格済み。

| 不変条件 | Principle | 関係する domain |
|---|---|---|
| パス操作は `domain` のパス API を経由する（ランタイム名前空間は `AgentRuntime.path`、ホスト名前空間と接頭辞照合は同モジュール群の別の公開面） | I | すべて |
| プラットフォーム分岐は `src/main/infra/runtime/` の内側に閉じる | II | すべて |
| 権限モードはランタイムの capability に従う | III | `runtime` / `session` / `isolation` / `ui` |
| Claude Code との通信は Agent SDK 経由 | IV | `session` / `isolation` |
| 長期資格情報を永続化しない | V | `provider` / `session` |
| 永続環境を構築・変更しない | VI | `runtime` / `isolation` |
| セッションの正本はアプリ外にある | X | `session` / `isolation` |

## Open Questions

- [ ] `sessionStore`（AD-007 のミラー）を `isolation` に置いたが、正本ポリシーは `session` の
      関心事である。責務の線引きを I-1 着手時に再確認する
- [ ] D-1（配布）に署名・自動更新まで広がる場合、`runtime` から分離すべきか
- [ ] transcript ミラーの保持期限と削除経路が未定義（AD-007 の blocking gap）。
      `isolation` と `session` のどちらが持つか
