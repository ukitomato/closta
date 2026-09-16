# PLAN.md — Closta

> **Closta** — 複数の Claude Code セッションを、隔離された実行環境ごとに走査・起動・管理するデスクトップ AI エージェントアプリケーション。
>
> 語源は cloister（回廊）。中庭を囲んで独立した房が並び、中央から全体を見渡せる構造に由来する。
> 英語の `cloistered`（隔離された）と同根であり、隔離・俯瞰・差配という本プロダクトの3要素を1語に含む。
> 命名の経緯と判断基準は AD-014 を参照。

> **このドキュメントの位置づけ**
>
> 本書は [spec-driven-gating-workflow](https://github.com/ukitomato/spec-driven-gating-workflow) の**入力**である。
>
> - `/spec-gate scan` → `/spec-gate bootstrap` の実行**前**に読み込ませる
> - `bootstrap` が生成する `.specify/memory/constitution.draft.md` の素材は §8 を使う
> - `/<prefix>-spec` に渡す feature の切り出し元は §10 を使う
> - Spec Kit が feature ごとに生成する `specs/<id>/plan.md` とは**別物**。本書を上書き・置換しないこと
>
> 本書に「確定」と書かれた決定は既に検討済みである。design-gate のレビューで蒸し返す場合は、
> 新規の Critical findings ではなく ADR 起票として扱うこと。

---

## 1. プロダクト概要

### 1.1 何を作るか

Claude Code のセッションを複数フォルダ・複数セッションにまたがって走査・管理する**デスクトップ AI エージェントアプリケーション**。

Cursor の Agents View / VS Code の Agent View が出発点だが、目指すのは「CLI のラッパー」ではなく
**自前の AI エージェントアプリとして完成した製品**である。

### 1.2 三本の軸

本プロダクトは以下の 3 軸で構成される。いずれか一本でも欠けると製品として成立しない。

| 軸 | 内容 | 詳細 |
|---|---|---|
| **軸 1: UI 完成度** | assistant-ui の Elements / Tool UI を可能な限り実装し、Claude Code が emit する全情報に専用表示を与える | §4 |
| **軸 2: Provider 抽象** | Claude Enterprise / Bedrock ほかを、認証方式ごと登録可能な Provider として一般化する | §5 |
| **軸 3: Docker サンドボックス** | Auto / bypassPermissions を安全に実行できる完全な隔離境界を提供する | §6 |

3 軸が交わる点が**セッション起動設定**（§7）であり、これが日常操作の入口となる。

### 1.3 UI に関する立場

**UI は機能の付随物ではなく、採否を決める要素である。**

貧弱な UI、既製感のある UI、日本語が崩れる UI は、機能が揃っていても使われない。
したがって本プロジェクトにおいて「UI の作り込み」は後回しにできるタスクではなく、
軸 1 として最初期から並走させる（§10 のマイルストーン M1 で見栄えの判断材料が出る構成にしてある）。

### 1.4 解決したい課題

| 課題 | 現状 |
|---|---|
| 複数リポジトリで並行して走らせたセッションの所在が分からない | ターミナルのタブを人間が記憶している |
| CLI の TUI では tool 実行内容が読みにくい | ANSI エスケープの流れを目で追っている |
| セッションごとに実行環境・認証・モデル・権限モードを変えたい | シェルの環境変数とフラグを手で組み替えている |
| 同じ組み合わせを毎回打ち直している | シェル関数やエイリアスが乱立している |
| Auto / bypass を安心して回せる場所がない | 結局すべて手動承認している |
| 過去セッションの内容を横断的に探したい | `~/.claude/projects/**/*.jsonl` を手で grep している |

---

## 2. 技術スタック（確定）

`/spec-gate scan` の検出結果と突き合わせること。齟齬がある場合は本書を正とする。

| レイヤ | 採用 | 備考 |
|---|---|---|
| デスクトップシェル | Electron（最新安定版を追随） | Tauri ではない。理由は AD-001。**同梱 Node が実行時の制約**。AD-013 |
| ホスト Node.js | 24（Active LTS） | ビルドツールと supervisor 単独実行にのみ使用。AD-013 |
| 言語 | TypeScript (strict) | |
| UI | React + **assistant-ui（Elements 含む）** | 軸 1 の中核。§4 |
| スタイル | Tailwind + assistant-ui design system | 独自トークンを増やさない（P-12） |
| 状態管理 | Zustand | renderer 側のみ |
| 長大スレッド | `@tanstack/react-virtual`（assistant-ui の virtualization ガイドに従う） | |
| Claude Code 連携 | `@anthropic-ai/claude-agent-sdk` (TypeScript, V1 `query()` API) | AD-002 |
| セッション supervisor | Electron `utilityProcess`（単独起動可能な形で実装） | AD-006, AD-010 |
| ターミナル | xterm.js + node-pty | PTY フォールバックタブ用 |
| 秘密保管 | Electron `safeStorage`（OS キーチェーン） | 参照のみ SQLite。AD-011 |
| ローカル永続化 | SQLite (better-sqlite3) | フォルダ / Provider / プリセット / sessionStore ミラー |
| コンテナ制御 | Docker CLI（`docker` コマンド呼び出し） | 到達経路は `host` / `wsl:<distro>` の 2 系統。AD-012 |
| パッケージング | electron-builder | `asarUnpack` 必須。AD-009 |
| Lint | ESLint + `no-restricted-imports` | P-1 / P-9 の機械的強制 |
| テスト | Vitest（ユニット） / Playwright（E2E） | |

### 2.1 対応プラットフォーム

| 優先 | ホスト | ランタイム | sandbox | 無人実行 (`autoModeSafe`) |
|---|---|---|---|---|
| **1** | Windows 11 | `WslRuntime` | bubblewrap（ディストロ側の準備に依存） | 条件付きで可 |
| **1** | Windows 11 | `Win32Runtime` | なし | **不可** |
| **2** | Windows / macOS | `DockerRuntime` | コンテナ境界 | **可（推奨）** |
| **3** | macOS (arm64 / x64) | `DirectRuntime` | Seatbelt | 可 |

**開発ホストが Windows 11 + WSL2 であるため、優先 1 の 2 ランタイムは R-1 の時点で必要になる**（§13.2）。
`DirectRuntime` は `Win32Runtime` の兄弟（パス変換が恒等）であり、OPT-mac で低コストに追加できる。

Linux ホストは `DirectRuntime` で動作するはずだが、初期リリースの検証対象外とする。

---

## 3. アーキテクチャ決定（確定済み）

> **ADR の SSoT は `docs/decisions/`（MADR 形式）である。** 本節は決定の経緯を読み物として残すが、
> `architecture-reviewer` が drift 判定に使う正本はファイル実体のほうである。
> AD-001〜AD-014 は `docs/decisions/0001`〜`0014` に切り出し済み。本節と食い違う場合は `docs/decisions/` を正とする。

### AD-001: Electron を採用する（Tauri ではない）

Tauri は起動速度とバンドルサイズで明確に優位であり、`node-pty` の再ビルド税からも解放される。
それでも Electron を採る理由は以下の 2 点である。

**(1) 軽量性の効き幅が小さい。**
本アプリの重量は `claude` ネイティブプロセス（セッションあたり数百 MB オーダー）が支配する。
シェル本体の差は 10 セッション時点で総使用量の数パーセントにとどまる。

**(2) WebView 分岐のコストが軸 1 に直撃する。**
Tauri の WebView は macOS が WKWebView、Windows が WebView2 と異なる。
軸 1 で実装する UI は、エンジン差が出やすい領域にほぼ全て乗っている。

- **日本語 IME**: composer の「変換確定中の Enter は送信しない」処理は `isComposing` と
  `compositionend` / `keydown` の発火順序に依存し、この順序がエンジン間で異なる
- **高頻度ストリーミング描画**: トークン単位の再レンダリング
- **仮想スクロール**: 数千メッセージの transcript でのスクロールアンカリング挙動
- **xterm.js**: WebGL renderer のサポート状況がエンジンで異なる

**UI 完成度を製品の採否条件に据える以上、2 エンジン分の UI 検証コストは受け入れられない。**

なお Tauri を採る場合でも Agent SDK は失われない（`externalBin` に `bun build --compile` した
Node sidecar を同梱、`extractFromBunfs()` 使用）。ただし Node/Bun ランタイムが同居するため
軽量性の優位はさらに縮む。

**再評価の条件**: `claude` プロセス 1 本の実メモリが 150MB 程度に収まり、かつ軸 1 が
一段落した後であれば再検討に値する。移行コストは AD-010 により限定される。

### AD-002: Agent SDK を使う（CLI 直叩きではない）

Agent SDK の実体はネイティブ `claude` バイナリを子プロセス起動し、stdin/stdout で
stream-json を往復するラッパーである。差は配管が既に書かれているかどうかのみ。

CLI レベルの制御は `pathToClaudeCodeExecutable` / `spawnClaudeCodeProcess` / `extraArgs` で維持される。

公式 SDK は TypeScript と Python の 2 言語のみ。Rust 実装はコミュニティ製であり、
stream-json の control protocol は実装詳細であるため、追随責任を第三者に預けない（P-4）。

`unstable_v2_createSession` 系の V2 session API は TypeScript Agent SDK 0.3.142 で削除済み。
`query()` に `AsyncIterable<SDKUserMessage>` を渡す V1 形式を使う。

### AD-003: ランタイム抽象はトランスポート軸で切る

```
DirectRuntime  — ホストで直接起動 (macOS / Linux)
WslRuntime     — wsl.exe -d <distro> -- ...
Win32Runtime   — ホストで直接起動 (Windows native)
DockerRuntime  — docker exec -i <container> ...
```

`WslRuntime` と `DockerRuntime` は**インスタンスが複数存在しうる**（ディストロごと / コンテナごと）。
`AgentRuntime` はシングルトンではなく、検出結果から生成される値として扱う。

プラットフォーム差（posix / win32）は軸としては持たず、各実装が内部で吸収する。
「ネイティブ Windows は sandbox 非対応」は `capabilities.autoModeSafe: false` として表明する。

### AD-004: パスは branded type で名前空間を分離する

```ts
type HostPath    = string & { readonly __brand: 'HostPath' };
type RuntimePath = string & { readonly __brand: 'RuntimePath' };
```

セッション transcript は `<config-dir>/projects/<encoded-cwd>/` に置かれ、`encoded-cwd` は
作業ディレクトリの非英数字を `-` に置換したもの。`/home/y/p` と `C:\Users\y\p` は別ディレクトリになる。

### AD-005: Provider は認証方式を含む値として抽象化する

プロバイダをハードコードされた 2 択（Enterprise / Bedrock）として扱わない。
**認証方式・設定ディレクトリ・モデルカタログを含む登録可能なエンティティ**として一般化する。
詳細は §5。

セッション起動時の環境変数は Provider から導出する。`Options.env` は `process.env` に
**マージではなく置換**されるため spread 必須。

### AD-006: セッション supervisor は `utilityProcess` に置く

tool_result が数 MB になることがあり、main process で `JSON.parse` するとウィンドウが固まる。
supervisor を `utilityProcess` に分離し、renderer とは MessagePort で直結する。

### AD-007: セッションの正本は Claude Code 側に置く

SDK の `listSessions()` / `getSessionMessages()` / `getSessionInfo()` / `renameSession()` /
`tagSession()` を使う。JSONL の自前パースは行わない。

`DockerRuntime` ではコンテナ内に JSONL が閉じるため `sessionStore` アダプタでホスト側 SQLite に
ミラーする。この判断は runtime 実装の内側に閉じる。

### AD-008: 永続環境の構築は行わない / 使い捨てコンテナの管理は行う

境界を以下のとおり定める。

| 対象 | アプリがすること | アプリがしないこと |
|---|---|---|
| WSL ディストロ | 一覧を取得し起動先として提示する | ディストロの作成、`/etc/wsl.conf` の編集 |
| Docker **イメージ** | 存在を確認し、無ければ手順を案内する | `docker build`、Dockerfile の生成・配置 |
| Docker **コンテナ** | **宣言済みイメージから起動・停止・破棄する**（セッションのライフサイクル） | 永続コンテナの恒久的な管理 |
| Claude Code sandbox | 利用可否を判定し `capabilities` に反映する | bubblewrap / socat / seccomp の導入 |
| Provider 認証 | 設定済みプロファイルを検出し提示する。認証の起動は委譲する | 資格情報の保管、`/login` ロジックの再実装 |

**「永続的な環境（イメージ・ディストロ・OS 設定）の構築」は行わないが、
「セッションに紐づく使い捨てコンテナの起動と破棄」はライフサイクル管理として行う。**
この区別が軸 3 を成立させる。

### AD-009: ネイティブバイナリは asar から展開する

Agent SDK はプラットフォーム別ネイティブバイナリを optional dependency として持つ。
asar に格納すると実行できないため `asarUnpack` に指定し実行ビットを維持する。
`node-pty` も Electron ABI 向けの再ビルドが必要（`electron-builder install-app-deps`）。

### AD-010: supervisor は単独起動可能な Node プロセスとして実装する

supervisor は Electron API に依存してはならない。`node dist/supervisor.js` として単体起動でき、
標準入出力経由でプロトコルを話せる形に保つ。

目的は (1) Electron を立てずにテストできること、(2) AD-001 の後戻り可能性。
renderer ↔ supervisor の IPC は薄い自前レイヤでラップし、`ipcRenderer` への直接依存を UI に漏らさない。

**supervisor はネイティブモジュールに依存してはならない。** Electron の同梱 Node とホスト Node は
ABI（`NODE_MODULE_VERSION`）が異なるため、`better-sqlite3` のようなネイティブ依存を supervisor が
持つと 2 種類のビルドが必要になり、単独起動可能性が実質的に失われる。
SQLite アクセスは main process 側に置き、supervisor はプロトコル配管に徹する。

### AD-011: 資格情報の解決は可能な限り Claude Code に委譲する

アプリが資格情報を保持・更新する設計を避ける。Claude Code 側のヘルパー機構に委譲する。

- **Bedrock**: `awsCredentialExport` / `awsAuthRefresh` にヘルパーコマンドを指定し、
  期限切れ時の再取得を Claude Code に任せる
- **Anthropic**: `apiKeyHelper` に委譲する

アプリが自ら STS `AssumeRole` を叩く形も提供するが（§5.2）、その場合も
**一時資格情報のみを扱い、メモリ上に留め、永続化しない**。

永続化が必要な秘密（API キー等）は Electron `safeStorage` で OS キーチェーンに預け、
SQLite には参照キーのみを持つ。

### AD-012: Docker 制御は CLI 呼び出しで行う

Docker Engine API の SDK を抱えず、`docker` コマンドを呼ぶ。理由は
(1) Docker Desktop / Colima / Rancher Desktop 等の差異を CLI が吸収する、
(2) 依存とバイナリサイズが増えない、(3) 利用者が同じコマンドを手で再現できる（デバッグ容易性）。

`docker` コマンドの所在は環境で異なるため、`DockerRuntime` は **endpoint**（`host` /
`wsl:<distro>`）を値として持つ。**主開発ホストには Docker Desktop が入っておらず、
WSL ディストロ内に Docker Engine を直接導入している**ため、実際の起動は
`wsl.exe -d <distro> -- docker exec -i <container> ...` という `WslRuntime` との合成になる。
Docker Desktop 構成も同じ抽象で扱えるようにする。詳細は docs/decisions/0012。

### AD-013: Node と Electron のバージョン方針

**実行時の言語機能を決めるのは Electron が同梱する Node であり、ホストの Node ではない。**
両者を混同しないこと。

| 用途 | どの Node が使われるか |
|---|---|
| main / utilityProcess の実行 | **Electron 同梱 Node** |
| ネイティブモジュールのコンパイル対象 | **Electron の ABI**（`electron-builder install-app-deps` が解決） |
| ビルドツール（vite / tsc / electron-builder） | ホスト Node |
| supervisor の単独起動（テスト時） | ホスト Node |

方針:

- **Electron は最新安定版を追随する。** `tsconfig` の `target` / `lib` は Electron 同梱 Node の
  バージョンに合わせる。Electron を上げたら `electron-builder install-app-deps` を再実行する
- **ホスト Node は Active LTS を使う。** 2026 年 9 月時点では **24**。22 は Maintenance LTS、
  26 は Current で 2026 年 10 月に LTS 昇格予定
- **Node 26 への移行は LTS 昇格後に検討する。** 実行時制約は Electron 側にあるため、
  ホスト Node を先行させる利益は小さい。ビルドツールの互換性リスクだけを負うことになる
- Node.js は 2026 年 10 月以降、年 1 回（4 月）のメジャーリリースに移行し、
  **すべてのリリースが LTS になる**（奇数/偶数の区別が消える）。
  「偶数だけを追う」という従来のヒューリスティクスは今後使わない。
  バージョン番号は初回 Current リリースの年に一致する
- CI のマトリクスは Active LTS を基準にし、Current / Alpha は allow-failure ジョブで回す

### AD-014: 名称と識別子

プロダクト名は **Closta**。cloister（回廊）の縮約による造語である。

#### 識別子

| 用途 | 値 |
|---|---|
| リポジトリ / パッケージ名 | `closta` |
| CLI 名 | `closta` |
| spec-gate の daily wrapper prefix | `cl`（`/cl-spec`、`/cl-plan` ほか） |
| 環境変数の接頭辞 | `CLOSTA_` |
| 設定ディレクトリ | `~/.closta` |
| ドメイン | `closta.dev` |

**着手時に `gh` / `npm` / `crates.io` / `closta.dev` を先に押さえること。** 空きを確認済みだが、
AI エージェント領域の命名は現在進行形で埋まっており、放置すれば取られる。

#### 命名時に確立した判定基準

候補名の評価にあたり、以下を適用した。今後の派生パッケージ名にも同じ基準を使う。

- **同一領域（AI エージェント / 開発者ツール / コンテナ管理）に同名が存在する場合は失格。**
  一般的な知名度ではなく、領域の重なりが判断軸である
- **別領域の同名は許容する。** CMS テーマ、バイオインフォマティクス、医療機関、金融などとの
  衝突は、開発者が検索する文脈が異なるため実害が小さい
- **GitHub のユーザー名 / org が個人に取得済みの場合は避ける。** 製品でなくとも名前空間が使えない

#### 経緯（要約）

Atrium / Barbican / Reeve / Portcullis / Seneschal / Gantry / Orrery / Carrel / Davit / Apiary の
10 語を検討し、すべて衝突した。うち Seneschal は「Claude を使う AI パイプラインオーケストレータ」、
Gantry は「プロバイダ中立のエージェントランタイム」、Orrery は「エージェント支援開発の
オブザーバビリティ層」、Davit は「コンテナ管理の macOS GUI」であり、いずれも本プロダクトと
同一領域だった。

**意味的に適合する語ほど先に取られている**という構造的な問題があり、辞書語による探索を断念して
造語に切り替えた。造語 10 案のうち 3 案が完全に空きであり、そこから短さと語源の可読性で Closta を選んだ。

この経緯を残すのは、将来「なぜ普通の英単語にしなかったのか」という問いが必ず出るためである。

---

## 4. 軸 1: UI 完成度（assistant-ui Elements）

### 4.1 完成の定義

**「Claude Code が emit する情報のうち、専用表示を持たないものをゼロにする」**ことを UI 完成の定義とする。

SDK のメッセージ型・tool 名・システムイベントを網羅した対応表を維持し、
各項目に割り当てられた element（または自作コンポーネント）が存在することを検証条件とする（P-11）。
未割当が残っている間、UI 系 feature は `completed` にしない。

### 4.2 Tier A — 必須（Claude Code の一次概念に直結）

| Claude Code の概念 | assistant-ui Element | 備考 |
|---|---|---|
| tool_use / tool_result（汎用） | Tool fallback AUI, Tool group AUI | 未定義ツールの既定表示と連続 tool の折り畳み |
| Bash | Terminal block | 行単位ストリーム + exit status |
| Edit / Write / MultiEdit | Code diff, Reviewable diff | hunk 単位の表示 |
| Read / Glob / Grep | Tool call, File tree | 触れたファイルの一覧 |
| TodoWrite | Todo list | run 中に書き換わる |
| Task（subagent） | Subagent list, Agent handoff | `forwardSubagentText` と対で使う |
| plan mode / ExitPlanMode | Agent plan | |
| `canUseTool` | **Approval card, Permission grant** | 本アプリの心臓部。単発承認と capability 付与を区別 |
| thinking ブロック | Reasoning AUI, Thinking indicator | |
| `effort` | Reasoning effort, Model selector AUI | 消費実績も表示 |
| `total_cost_usd` / `maxBudgetUsd` | Cost meter | セッション累計とモデル別内訳 |
| レート制限 / クォータ | Quota banner | |
| コンテキストウィンドウ | Context display AUI, Context breakdown | `/context` 相当 |
| `slash_commands`（init message） | Slash commands | init で取得した一覧をそのまま出す |
| セッション一覧 | Thread list AUI, Thread list sidebar AUI | `listSessions()` と接続 |
| セッション状態 | Agent status | idle / running / awaiting_permission / error |
| 中断（interrupt） | Stopped run | 途中出力を残して再開可能に |
| 実行中の入力 | Message queue | `createMessageQueue` と対で使う |
| `forkSession` | Message branches, Regenerate with | 分岐の行き来 |
| file checkpointing | Checkpoints | `enableFileCheckpointing` 有効時 |
| MCP サーバ | Server panel, MCP config dialog AUI | init message の `mcp_servers` |
| MCP elicitation | Elicitation form | SDK の `onElicitation` と対 |
| WebSearch / WebFetch | Web search, Inline citation | |
| markdown 本文 | Markdown text AUI, Shiki highlighter AUI, Mermaid diagram | |
| ストリーミング | Streaming text, Scroll anchor | スクロール位置を奪わない |
| エラー | Error state, Tool failure | ターンを壊さない再試行導線 |

### 4.3 Tier B — 体験を押し上げる（M3 で実装）

Conversation map AUI / Search in conversation / Thread search / Message timing AUI /
Trace waterfall / Heat graph（セッション活動）/ Command palette / Draft restore /
Settings panel / Empty state / Onboarding / Tool timeline / Canvas split /
Attachment AUI / Mentions / Quote AUI / Follow-up suggestions AUI

### 4.4 Tier C — 対象外

Voice 系（Voice conversation / Read aloud / Orb）、Generative 22 要素、
Image generation、Map answer、Launcher bubble、Mobile composer、Assistant modal。

Generative 群は「モデルが構造化データを返す前提の UI」であり、Claude Code の
tool 出力とは前提が異なる。ただし Data table / Chart / Timeline / Diagram は
将来 MCP ツールの結果表示に転用しうるため、Tier C の中では優先度が高い。

### 4.5 UI 設計原則

- **assistant-ui の design system に乗る。** 独自のカラートークン・スペーシングスケールを
  増やさない。同等の element が存在する場合は自作しない（P-12）
- **日本語で破綻しない。** IME の変換確定、フォントスタック、行間、折り返し、
  等幅フォントでの全角混在を検証項目に含める
- **密度を選べる。** 10 セッション並列の監視ビューと、1 セッションへの没入ビューでは
  必要な情報密度が異なる。compact / comfortable を切り替えられること
- **Electron 特有の配線**は assistant-ui の Electron ガイドに従い、
  preload / IPC 越しのストリーミングブリッジとして実装する
- **長大スレッドは仮想化する。** assistant-ui の virtualization ガイドに従う

---

## 5. 軸 2: Provider 抽象

### 5.1 モデル

```ts
interface ProviderProfile {
  id: string;
  displayName: string;
  backend: 'anthropic' | 'bedrock' | 'vertex' | 'foundry';
  configDir?: HostPath;          // CLAUDE_CONFIG_DIR。未指定なら既定
  credential: CredentialSource;
  models: ModelCatalogRef;
  extraEnv?: Record<string, string>;
}
```

Provider は**アプリに登録される値**であり、コード上の列挙ではない。
同一バックエンドの Provider を複数登録できる（本番用 Bedrock と検証用 Bedrock、
会社アカウントと個人アカウントの Enterprise、など）。

### 5.2 認証方式（`CredentialSource`）

| kind | 内容 | アプリが秘密を持つか |
|---|---|---|
| `config-dir` | 指定した `CLAUDE_CONFIG_DIR` の資格情報をそのまま使う | 持たない |
| `in-app-login` | アプリから Claude Code のログインフローを起動し、以後は `config-dir` と同様 | 持たない |
| `api-key-helper` | `apiKeyHelper` にコマンドを設定し、Claude Code に取得を委譲 | 持たない |
| `api-key` | `ANTHROPIC_API_KEY` を注入 | **キーチェーン参照のみ** |
| `oauth-token` | `CLAUDE_CODE_OAUTH_TOKEN` を注入 | **キーチェーン参照のみ** |
| `aws-profile` | `~/.aws/credentials` の特定プロファイルと リージョンを指定 | 持たない |
| `aws-credential-export` | `awsCredentialExport` にコマンドを設定し Claude Code に委譲 | 持たない |
| `aws-assume-role` | IAM ロール ARN とリージョンから STS で**一時セッショントークン**を発行 | **一時のみ・メモリ上のみ** |
| `env-passthrough` | 親プロセスの環境変数をそのまま使う | 持たない |

**推奨は `api-key-helper` と `aws-credential-export`。** 期限切れ時の再取得を Claude Code に
任せられるため、アプリが資格情報のライフサイクルに関与しなくて済む（AD-011）。

`aws-assume-role` を選んだ場合の要件:

- 長期キーは扱わない。`sourceProfile` または既定の資格情報チェーンから `AssumeRole` する
- 発行された一時資格情報はメモリ上のみ。SQLite にもファイルにも書かない
- 有効期限を監視し、期限前に警告する。実行中セッションの期限切れは UI に明示する
- セッション名（`RoleSessionName`）にアプリ名とセッション ID を含め、CloudTrail で追跡可能にする

### 5.3 モデルカタログ

| backend | モデル指定 | 注意 |
|---|---|---|
| `anthropic` | alias（opus / sonnet / haiku）または明示 ID | |
| `bedrock` | inference profile ID（リージョン prefix 付き） | **必ず pin する。** alias 運用は破綻する |
| `vertex` / `foundry` | 各サービスのモデル ID | 初期リリースでは登録のみ、検証対象外 |

カタログは Provider ごとに設定ファイルで保持する。動的取得の手段があれば補完する（SPIKE-6）。

### 5.4 検出と登録

初回起動時および明示操作時に候補をスキャンして提示する。**自動登録はしない**（P-8 の精神）。

- `~/.claude`、`~/.claude-*` などの config ディレクトリ候補
- `~/.aws/config` のプロファイル一覧とリージョン
- 環境変数に既に設定されている Provider 相当の値

提示された候補から利用者が選び、表示名を付けて登録する。

---

## 6. 軸 3: Docker サンドボックス

### 6.1 位置づけ

**Auto モードと `bypassPermissions` を安全に実行できる唯一の完全な境界。**

OS 組み込み sandbox（Seatbelt / bubblewrap）は Bash サブプロセスのみを覆うが、
コンテナ境界はファイルツール・MCP サーバ・hook を含むプロセス全体を覆う。
無人実行を主目的とするセッションは `DockerRuntime` を推奨既定とする。

### 6.2 コンテナのライフサイクル

AD-008 の区分に従い、**イメージは利用者が用意し、コンテナはアプリが管理する**。

| フェーズ | アプリの動作 |
|---|---|
| イメージ確認 | 指定イメージの存在を確認。無ければ推奨 Dockerfile とビルド手順を案内する（ビルドはしない） |
| 起動 | セッション開始時に使い捨てコンテナを起動。命名規則でアプリ管理下であることを明示 |
| 実行 | `docker exec -i` で `claude` を起動し、stream-json を往復 |
| 終了 | セッション終了時に破棄（既定）または保持（選択可能） |
| 孤児回収 | 起動時にアプリ管理下の停止済みコンテナを検出し、破棄を提案する |

コンテナの粒度はセッション単位を既定とし、フォルダ単位の共有も選択可能にする。

### 6.3 隔離設計

| 項目 | 方針 |
|---|---|
| マウント | **作業フォルダのみ。** `~/.aws`、`~/.ssh`、`~/.gnupg` はマウントしない |
| ユーザ | **非 root。** `--dangerously-skip-permissions` は root で起動拒否されるため必須 |
| 資格情報 | `env` で注入。長期キーではなく一時トークンを優先（§5.2） |
| ネットワーク | 既定は制限。許可ドメインは Claude Code 側の `allowedDomains` + `strictAllowlist` で制御 |
| 内側の sandbox | 外側のコンテナが境界を担うため、コンテナ内では Claude Code の sandbox を無効にし `bypassPermissions` で回すのを既定とする。両方使う場合は `enableWeakerNestedSandbox` が必要になりうる |
| リソース | `--memory` / `--cpus` をセッション設定から指定可能にする |
| transcript | コンテナ内 JSONL を `sessionStore` でホスト側 SQLite にミラー（AD-007） |

### 6.4 UI 上の扱い

**隔離状態は一目で分かること。** セッションカード・タブ・ヘッダに隔離バッジを表示し、
`bypassPermissions` で動作中のセッションは視覚的に区別する。

隔離されていないランタイムで危険な権限モードが選べないこと（P-3）と合わせ、
「今どこで何の権限で動いているか」が常に分かる状態を維持する。

### 6.5 推奨 Dockerfile の提供

アプリはビルドしないが、**推奨イメージの Dockerfile をドキュメントとして同梱する**。
非 root ユーザ、Claude Code 導入、一般的な開発ツールチェーンを含む最小構成とし、
利用者が自分のスタックに合わせて拡張できる形にする。

---

## 7. セッション起動設定（SessionLaunchConfig）

3 軸が交わる点。日常操作の入口。

### 7.1 選択軸

| 軸 | 値 | 対応する SDK オプション |
|---|---|---|
| 作業フォルダ | `HostPath` → `RuntimePath` に変換 | `cwd` |
| ランタイム | Direct / WSL / Win32 / Docker | `spawnClaudeCodeProcess` |
| └ ランタイム個別 | WSL: ディストロ / Docker: イメージ・コンテナ設定 | 同上 |
| Provider | 登録済み Provider から選択（§5） | `env`, `settings` |
| モデル | Provider のカタログから選択 | `model` |
| effort | low / medium / high / xhigh / max | `effort` |
| 権限モード | `default` / `plan` / `acceptEdits` / **`dontAsk`** / `auto` / `bypassPermissions` の 6 値（AD-020 で実確認）。危険なのは `auto` と `bypassPermissions` のみ | `permissionMode` |
| sandbox | 有効 / 無効、許可ドメイン | `sandbox`, `settings` |
| 追加ディレクトリ | `RuntimePath[]` | `additionalDirectories` |
| 上限 | ターン数 / 予算(USD) | `maxTurns`, `maxBudgetUsd` |
| セッション名 | 任意文字列 | `title` |

正確な列挙値は SDK の型定義に従う（SPIKE-6）。

### 7.2 軸の依存関係

ダイアログ実装の核心は、軸が独立していないことにある。

- **ランタイム → 権限モード**: `autoModeSafe === false` のとき Auto / bypass を選択不可（P-3）
- **ランタイム → sandbox**: `capabilities.sandbox === 'none'` のとき sandbox 設定を非活性
- **ランタイム → フォルダ**: そのランタイムからパス変換可能なフォルダに限る
- **Provider → モデル**: カタログが変わる
- **Provider → ランタイム**: `config-dir` 認証の Provider は、その config ディレクトリに
  到達できるランタイムでのみ利用可能（コンテナ内からホストの `~/.claude` は見えない）
- **権限モード = bypass**: `allowDangerouslySkipPermissions: true` が必須。明示確認を要求

解決順序は「ランタイム → Provider → モデル → モード」。上流変更時に下流を検証し直し、
無効になった値は既定に戻して UI で通知する。

### 7.3 プリセット

`SessionLaunchConfig` を名前付きで保存・再利用できる。

- フォルダごとの既定プリセットを持てる
- SQLite に保存する。**資格情報の値は含めない**（P-5）
- 適用後も個別の軸を上書きできる

### 7.4 再開時の扱い

| 軸 | 再開時 |
|---|---|
| フォルダ / ランタイム / Provider | **引き継ぐ**（変更するとセッションの同一性が壊れる） |
| モデル / effort / 権限モード / 上限 | **選び直せる** |
| セッション名 | `renameSession()` で変更可能 |

引き継ぐ軸を変更したい場合は `forkSession` による分岐として扱う。

---

## 8. Constitution Principle 候補

`status: active` に昇格させてから design-gate を回すこと。

### P-1: パス操作は必ず `domain` のパス API を経由する

> **追随メモ (2026-09-15)**: Constitution v1.2.0 / AD-024 #14 により、Principle I の Statement は
> 「`domain` が公開するパス API を経由する。ランタイム名前空間の操作は `AgentRuntime.path` として
> 公開し、ホスト名前空間の操作と接頭辞照合は同モジュール群の別の公開面とする」に改まった。
> 以下の本文は素材として残すが、**正本は Constitution である**。

アプリケーションコードは `node:path` / `path` を直接 import してはならない。
- **検証**: ESLint `no-restricted-imports` が `runtime/` 配下以外での import を error にする

### P-2: プラットフォーム分岐は `AgentRuntime` 実装の内側に閉じる
- **検証**: `grep -rn "process.platform" src/ --exclude-dir=runtime` が空であること

### P-3: 権限モードの選択肢はランタイムの capability に従う
`autoModeSafe === false` のランタイムで Auto / bypass を選択可能にしてはならない。
- **検証**: `Win32Runtime` 選択時に Auto / bypass が disabled であること（E2E）

### P-4: Claude Code との通信は Agent SDK 経由に限定する
stream-json を自前でパースしてはならない。
- **検証**: `src/` 内に stream-json のパース実装が存在しないこと

### P-5: 長期資格情報を永続化しない
API キー・OAuth トークン・AWS 長期キーを SQLite / 設定ファイル / プリセットに書いてはならない。
永続化が必要なものは `safeStorage` 経由でキーチェーンに預け、参照キーのみを保持する。
一時資格情報はメモリ上のみで扱い、期限を監視する。ログへの混入も禁止。
- **検証**: SQLite スキーマに秘密値カラムが存在しないこと。ログ出力に `env` を
  そのまま渡す箇所がないこと

### P-6: main process をブロックしない
- **検証**: supervisor 外に stream の `JSON.parse` 処理が存在しないこと
- **追随 (2026-09-15)**: supervisor の**実ディレクトリは `src/agents/`** である
  （[AD-023](docs/decisions/0023-application-architecture.md) のレイヤ構成）。
  正本は Constitution Principle IX であり、検証条件は
  [AD-024](docs/decisions/0024-constitution-verification-paths.md) #6 で追随済み

### P-7: セッションの正本はアプリ外にある
アプリのストアはキャッシュまたはインデックス。矛盾時は Claude Code 側を正とする。
- **検証**: セッション一覧の再取得でキャッシュが上書きされること（ユニットテスト）

### P-8: 永続環境を構築・変更しない
OS 設定の書き換え、パッケージのインストール、ディストロの作成、イメージのビルド、
特権を要する操作を行ってはならない。**使い捨てコンテナの起動・破棄は例外**として認める（AD-008）。
- **検証**: `sudo` / `wsl --import` / `docker build` / `apt` 等の実行箇所が存在しないこと。
  `docker run` はコンテナライフサイクル管理モジュールにのみ存在すること

### P-9: supervisor は Electron に依存しない
- **検証**: ESLint が `supervisor/` 配下での `electron` import を error にする
- **追随 (2026-09-15)**: 実ディレクトリは `src/agents/` である。
  また **import / require の両形式**を対象とし、**推移的な到達も禁止する** —
  ESLint は直接 import を、dependency-cruiser は推移的到達を見る。
  正本は Constitution Principle VII であり、検証条件は AD-024 #1 / #2 で追随済み

### P-10: 各 feature は単体で動作確認可能な垂直スライスとする
- **検証**: 各 spec の受け入れ条件に観測可能な振る舞いが 1 つ以上含まれること

### P-11: Claude Code が emit する情報に未表示のものを残さない
SDK のメッセージ型・tool 名・システムイベントの対応表を維持し、各項目に表示実装を割り当てる。
- **検証**: `docs/ui-coverage.md` の対応表に未割当行が存在しないこと。
  新しい tool / イベントに対応する際は表の更新を同一 PR に含めること

### P-12: assistant-ui の element と design system を優先する
同等の element が存在する UI を自作してはならない。独自のカラートークン・
スペーシングスケールを追加してはならない。
- **検証**: 自作コンポーネントの追加時、対応する element が存在しないことを
  PR 説明に記載すること（convention-reviewer / ux-reviewer）

### P-13: 日本語環境で破綻しない
IME 変換確定時の誤送信、フォント崩れ、全角混在時のレイアウト崩れを許容しない。
- **検証**: composer の IME テストケースが E2E に存在すること。
  日本語を含むスクリーンショット比較が CI に存在すること

---

## 9. 非目標（Non-Goals）

### 9.1 環境の構築・管理

- WSL ディストロの作成・設定
- Docker **イメージ**のビルド（推奨 Dockerfile はドキュメントとして提供する）
- Claude Code の sandbox 依存パッケージの導入
- Claude Code 本体のインストール・アップデート

### 9.2 機能スコープ外

- Claude Code 以外のコーディングエージェントへの対応
- ACP クライアントとしての実装
- リモートホスト上の Claude Code への接続（SSH ランタイム）
- モバイル / Web クライアント
- セッションの複数ユーザ共有、チーム機能
- Claude Code 自体の設定 GUI（CLAUDE.md エディタ、権限ルールエディタ）
- 音声入出力（assistant-ui の Voice 系 element）
- Linux ホストの動作保証

---

## 10. Feature バックログ

> **本節は素案である。SSoT は [docs/domains/_overview.md](docs/domains/_overview.md) と
> [docs/roadmap.md](docs/roadmap.md) に移した。** 食い違う場合はそちらを正とする。
>
> 2026-09-12 に、ADR で確定した内容と環境実態（WSL 内 Docker Engine）を前提に
> domain / feature / マイルストーンをゼロから引き直した。domain の切り方は追認されたが
> （`container` → `isolation` の改名を除く）、feature の粒度とマイルストーンの定義は変わった。

1 feature = 1 git branch = 1 spec。feature ID は **フェーズ接頭辞 + 連番**とし、
spec_id（`001-runtime-...`）とは独立させる。差し込み作業で番号がずれるのを避けるため。

| ID | Feature | domain | 依存 | マイルストーン |
|---|---|---|---|---|
| R-1 | フォルダ登録とランタイム検出（`Win32Runtime` + `WslRuntime`、パス型、ESLint 強制） | `runtime` | — | M1 |
| R-2 | セッション列挙（読み取り専用、WSL 内 config を Windows から横断） | `session` | R-1 | M1 |
| R-3 | transcript の基本表示（markdown / streaming / scroll anchor / tool fallback） | `ui` | R-2 | M1 |
| R-4 | Tier A tool 表示（Terminal / Code diff / Todo / Subagent / Agent plan / Reasoning） | `ui` | R-3 | M1 |
| X-1 | 単一セッション起動とストリーミング（Approval card、中断） | `session` | R-4 | M2 |
| X-2 | 日本語 composer（IME ガード、message queue、draft restore） | `ui` | X-1 | M2 |
| X-3 | Provider 登録と到達可能性判定 | `provider` | X-1 | M2 |
| X-4 | 起動設定ダイアログとプリセット（軸の依存解決） | `session` | X-3 | M2 |
| X-5 | supervisor 分離とマルチセッション（10 並列） | `session` | X-4 | M2 |
| O-1 | セッション監視ビュー（状態一覧、密度切替、承認待ちの強調） | `session` | X-5 | M3 |
| O-2 | `docs/ui-coverage.md` の確立と Tier A 完全化 | `ui` | O-1 | M3 |
| O-3 | Thread 検索と observability | `ui` | O-2 | M3 |
| I-1 | `DockerRuntime` と endpoint 抽象 + `sessionStore` ミラー | `isolation` | X-5 | M4 |
| I-2 | コンテナライフサイクルと隔離可視化 | `isolation` | I-1 | M4 |
| I-3 | sandbox capability 判定と権限モードのゲート | `isolation` | I-2 | M4 |
| D-1 | パッケージングと Windows インストーラ | `runtime` | O-3 | M5 |

### 10.1 Optional scope

どのマイルストーンも待たない。やる価値はあるが critical path に乗らない。

| ID | Feature | domain |
|---|---|---|
| OPT-mac | macOS 対応（`DirectRuntime` / Seatbelt capability / IME・レンダリング検証） | `runtime` |
| OPT-pty | PTY フォールバックタブ（xterm.js + node-pty） | `ui` |

素案では macOS を M5、配布を M6 の独立マイルストーンに置いていたが、
Windows 主軸の個人開発では macOS が critical path に乗らないため optional scope に移した。

### 10.2 リリース区切り

各マイルストーンを「**できるようになること**」で定義する。
素案の「M3: UI 完成」は漸近線であり完了判定が曖昧だったため、達成状態で言い換えた。

| マイルストーン | 定義 | feature | 完了の判定 |
|---|---|---|---|
| **M1** | **読める** | R-1〜R-4 | WSL 内の過去セッションを Windows の assistant-ui で読める。**ここで軸 1 の方針を確定する** |
| **M2** | **走らせられる** | X-1〜X-5 | 起動条件を選んで複数セッションを回せる。日本語で誤送信しない |
| **M3** | **差配できる** | O-1〜O-3 | 10 セッションを俯瞰でき、未表示情報がゼロ |
| **M4** | **任せられる** | I-1〜I-3 | Auto / `bypassPermissions` を隔離内で安全に回せる |
| **M5** | **配れる** | D-1 | 自分以外が使える |

**M1 を 4 feature に抑えてあるのは意図的**である。UI の見栄えが製品の採否を決める以上、
最短で判断材料を出す必要がある。素案では transcript 表示と Tier A tool が 1 feature に
束ねられていたが、これを R-3 / R-4 に割ったことで **R-3 の時点で一次判断ができる**。

**`WslRuntime` と `Win32Runtime` を R-1 に前倒ししてあるのも意図的**である。
開発ホストが Windows 11 + WSL2 であり、日常のセッションは WSL ディストロ内に存在する。
したがって R-2（セッション列挙）の時点で既に `HostPath ≠ RuntimePath` の状態が発生する。

これは制約ではなく利点として扱う。macOS 主軸であれば `DirectRuntime`（恒等変換）だけで
M1〜M3 が回ってしまい、AD-004 のパス抽象が本当に機能するかを M4 まで検証できない。
Windows 主軸なら**初日から二名前空間が同居するため、抽象が常時テストされる**。


## 11. 先に潰す不確定点（Spike）

> **本節は素案である。SSoT は [docs/roadmap.md](docs/roadmap.md) の SPIKE 一覧に移した。**
> 素案の 8 本は M1 / M2 を想定して作られており、M3〜M5 の feature に対応する SPIKE が
> 欠けていた。roadmap 側で SPIKE-9〜13 を追加してある。

feature ではなく、対応する feature の spec 着手前の調査タスクとして扱う。
結果は `docs/decisions/` に ADR として起票する。順序は [docs/roadmap.md](docs/roadmap.md) を正とする。

### SPIKE-1: `listSessions()` と `CLAUDE_CONFIG_DIR` の関係（R-2 の前）
`ListSessionsOptions` に config dir 指定がない。ホストプロセスの環境変数を参照している可能性が高い。
- **確認**: 単一プロセスから複数 config ディレクトリのセッションを列挙できるか
- **逃げ**: Provider ごとに短命な child process で列挙し IPC で返す
- **所要**: 1〜2時間

### SPIKE-2: assistant-ui Elements の導入コスト実測（R-3 の前）
Tier A のうち 2〜3 個（Terminal block / Code diff / Todo list）を実際に入れ、
`useExternalStoreRuntime` と接続してみる。
- **確認**: element のインストール単位、カスタマイズ範囲、design system の拘束度、
  Claude Code の tool_result 形式との変換コスト
- **判断材料**: §4.2 の表の実現可能性と工数見積もり
- **所要**: 半日

### SPIKE-3: `claude` プロセスの実メモリ測定（X-1 の前）
AD-001 の再評価条件に直結する。3〜5 セッション同時実行時の RSS を測る。
- **判断**: 1 本あたり 150MB 程度なら AD-001 を再検討。500MB 超ならシェル選択は誤差として確定
- **所要**: 30分

### SPIKE-4: 日本語 IME の composer 挙動（X-2 の前）
assistant-ui の composer で「変換確定の Enter が送信にならない」ことを確認する。
- **確認**: `isComposing` の扱い、assistant-ui 側で対応済みか自前ガードが必要か
- **重要度**: P-13 の成立可否に直結。問題があれば X-2 の受け入れ条件に修正実装を含める
- **所要**: 1〜2時間

### SPIKE-5: `spawnClaudeCodeProcess` による WSL 起動（**X-1 の前**）
`wsl.exe -d <distro> -- ...` を噛ませて stdin/stdout の往復が成立するかを確認する。
Windows 主軸のため、この検証は M2 の前提条件になる（Docker 経由は I-1 の前に別途確認）。
- **確認**: 起動・ストリーミング・`canUseTool` の往復・中断（SIGINT 伝播）、
  stdout のバッファリング、大きな tool_result での詰まり
- **重要度**: ここが通らないと M2 が成立しない。**M1 と並行して先に着手してよい**
- **所要**: 半日

### SPIKE-6: SDK 型定義からの選択肢確定（X-4 の前）
§7.1 の表は概念レベル。実装前に型定義から正確な値を確定させる。
- **確認**: `PermissionMode` の列挙値と Auto モードの指定方法、`effort` の列挙値、
  `SandboxSettings` の構造、Provider ごとのモデル候補を動的取得する手段の有無
- **所要**: 1時間

### SPIKE-7: 認証委譲機構の確認（X-3 の前）
`apiKeyHelper` / `awsCredentialExport` / `awsAuthRefresh` の実際の挙動を確認する。
- **確認**: ヘルパーコマンドの呼び出しタイミング、期限切れ時の再取得、
  設定をセッション単位の `--settings` で渡せるか、macOS Keychain と
  `CLAUDE_CONFIG_DIR` を分けたときの相互作用
- **重要度**: AD-011 の成立可否に直結
- **所要**: 半日

### SPIKE-8: ランタイム検出とパス変換の確定（**R-1 の前**）
Windows 主軸のため、`WslRuntime` が R-1 に含まれる。その前提を固める。
- **確認**:
  - WSL ディストロ一覧の取得と WSL2 / WSL1 の判別（WSL1 は sandbox 非対応）
  - ディストロ内の `$HOME` 解決、`C:\` ↔ `/mnt/c` 変換、`\\wsl.localhost\` 経由アクセスの実効速度
  - Windows 側から WSL 内の `~/.claude/projects` を読む最良の手段
    （`\\wsl.localhost` 直読み vs `wsl.exe` 経由でのプロセス実行）
  - **docker endpoint の検出**: ホスト PATH に `docker` が無い場合に、どの WSL ディストロが
    Docker Engine を持つかを走査する手段（`wsl.exe -d <d> -- command -v docker`）と、
    Docker Desktop 構成との判別
  - 各ランタイム内での sandbox 利用可否の判定方法（`capabilities.sandbox` の決定根拠）
  - 検出結果のキャッシュ戦略と再検出トリガ（ディストロの起動/停止）
- **所要**: 半日

---

## 12. reviewer 構成の希望

### 必須（bootstrap 標準）
- `reviewer-base`
- `security-reviewer` — 資格情報の取り扱い（P-5）、環境非干渉（P-8）、コンテナ隔離（§6.3）
- `architecture-reviewer` — Constitution 整合、特に P-1 / P-2 / P-6 / P-9
- `po-reviewer`
- `convention-reviewer` — P-12 の element 優先原則

### 追加を希望
- **`ux-reviewer`** — 軸 1 が製品の採否を決めるため最重要。§7 のダイアログの依存関係、
  §4 の Tier A 網羅、隔離状態の可視性（§6.4）を見る
- `a11y-reviewer` — キーボード操作の網羅、フォーカス管理
- `database-reviewer` — `sessionStore` ミラー（AD-007）のスキーマと P-5（秘密値カラムを持たない）を見る

### 不要
- `openapi-contract-reviewer` / `api-performance-reviewer`

### カスタム reviewer
- `ui-coverage-reviewer` — P-11 の対応表に未割当がないかを機械的に検証する
- `platform-boundary-reviewer` — P-1 / P-2 / P-3 / P-8 / P-9 の検証。
  **`WslRuntime` が R-1 に含まれるため、早期から必要**

---

## 13. 環境前提

### 13.1 ツールチェーン

| 項目 | 要件 | 備考 |
|---|---|---|
| ホスト Node.js | **24（Active LTS）** | 2026-09 時点。22 は Maintenance、26 は 2026-10 に LTS 昇格予定。AD-013 |
| Electron | 最新安定版 | 実行時の言語機能はこちらが決める。AD-013 |
| パッケージマネージャ | pnpm | **`pnpm-workspace.yaml` に `nodeLinker: hoisted` が必須。** Electron のパッケージングツールチェーンは `node_modules` が npm と同じ形で物理配置されていることを要求し、pnpm 既定のシンボリックリンク方式とは非互換。pnpm 10 以降は `.npmrc` ではなく `pnpm-workspace.yaml` が設定の置き場 |
| gh CLI | 2.90.0 以上 | `gh skill` に必要 |
| uv / Spec Kit | `uv tool install specify-cli` | |
| Git Bash | Git for Windows 同梱 | spec-gate の gate スクリプトは bash 専用。Windows では必須 |
| python3 | 3.12 以上 | `gate-common.sh` の cascade_enforce / viewpoint_coverage / verdict_validate が依存。Windows では `python3` が Microsoft Store のエイリアススタブに奪われるため `uv python install --default` 等で実体を通すこと。**`PYTHONUTF8=1` が必須**（未設定だと日本語ロケールで commit subject の `…` が cp932 で出力され壊れる） |

### 13.2 開発ホスト（Windows 11 + WSL2 を主軸）

| 項目 | 方針 |
|---|---|
| OS | **Windows 11 22H2 以降** |
| ターゲット実行環境 | **WSL2 ディストロ内の Claude Code**、および **WSL ディストロ内に直接導入した Docker Engine**（Docker Desktop ではない。AD-012） |
| リポジトリの配置 | **Windows 側（NTFS）** |
| Electron の起動 | **Windows ネイティブ。WSLg は使わない** |
| テスト実行 | Windows 側。ネイティブモジュールの ABI が一致する必要があるため |
| macOS | OPT-mac で対応。それまで検証対象外 |

**リポジトリを Windows 側に置く理由**は、Electron のビルドと GUI 起動がネイティブ側で行われるためである。
`node_modules` をファイルシステム境界（`/mnt/c` や `\\wsl.localhost`）越しに参照する構成は
遅く、ネイティブモジュールのビルドで壊れやすい。

**WSLg を使わない理由は P-13 である。** 開発中ずっと WSLg 上の Electron を見ていると、
日本語 IME の composition イベント挙動、フォントレンダリング、DPI スケーリングが
本番環境（Windows ネイティブ Electron）と乖離する。IME の誤送信のような不具合を
リリース直前まで発見できなくなる。**UI 完成度を採否条件に据える以上、
開発中の見え方は本番と一致していなければならない。**

**このアプリ自体の開発に使う Claude Code と、このアプリが起動する Claude Code は別物である。**
前者は開発フローの話、後者は製品の機能の話であり、混同しないこと。

### 13.3 利用者側の前提

最小限に保つ。

- Claude Code がインストール済みで認証済みであること
- Docker を使う場合は Docker が動作していること
- WSL ランタイムを使う場合は WSL2 ディストロが存在すること

**隔離環境の事前構築は求めない**（AD-008）。用意されていれば使い、なければ
その capability に応じて選択肢を制限する。

---

## 14. 実行手順

```bash
# 0. 名前空間を先に押さえる（AD-014）
#    gh repo create closta --private
#    npm / crates.io / closta.dev

mkdir closta && cd closta
git init
specify init

cp /path/to/PLAN.md ./PLAN.md
git add PLAN.md && git commit -m "docs: add project plan"

gh skill install ukitomato/spec-driven-gating-workflow spec-gate \
  --agent claude-code --pin v0.2.0

/spec-gate scan
/spec-gate bootstrap    # prefix は "cl" を希望。§8 を constitution.draft.md の素材に使う
/spec-gate verify

# Constitution を active に昇格（§8 の P-1〜P-13 が反映されていることを確認）
# SPIKE-8（ランタイム検出・パス変換・docker endpoint 検出）を実施 → R-1 の前提
# SPIKE-1（listSessions と CLAUDE_CONFIG_DIR）を実施 → R-2 の前提
# 結果を docs/decisions/ に ADR として起票（§3 ではない）

/cl-spec "<docs/prompts.md の R-1 のプロンプト>"
```

### 14.1 Claude Code への最初の指示

> PLAN.md を読んでください。これはこのプロジェクトの憲章です。
> §1.2 の三本の軸がこのプロダクトの骨格です。特に軸 1（UI 完成度）は
> 機能の付随物ではなく製品の採否条件として扱ってください。
> §3 のアーキテクチャ決定は検討済みなので前提としてください。
> §8 の Principle は `/spec-gate bootstrap` で constitution.draft.md を作る際の素材にしてください。
> §9 の非目標、特に「永続環境を構築しない」は厳格に守ってください（使い捨てコンテナは例外）。
> §10 の feature は上から順に 1 つずつ `/cl-spec` にかけます。まだ着手しないでください。
> まず `/spec-gate scan` を実行し、検出したスタックと §2 の記載に齟齬がないか報告してください。

---

## 付録A: 用語

| 用語 | 定義 |
|---|---|
| Closta | 本プロダクトの名称。cloister（回廊）の縮約。AD-014 |
| セッション | Claude Code の 1 会話。UUID で識別され `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化される |
| Provider | 認証方式・設定ディレクトリ・モデルカタログを含む登録可能なエンティティ。§5 |
| ランタイム | Claude Code プロセスを起動する場所と方法。WSL / Docker は複数インスタンスを持ちうる |
| capabilities | ランタイムが提供する能力。`sandbox` の種別と `autoModeSafe` の可否 |
| SessionLaunchConfig | セッション起動時に選択される設定の組。§7 |
| Element | assistant-ui が提供する UI 部品。202 種（2026-09-13 確認、AD-019）。§4 |
| Tier A / B / C | Element の実装優先度。§4.2〜4.4 |
| HostPath | Electron プロセスから見たパス。Windows では `C:\...` 形式 |
| RuntimePath | ランタイム内部から見たパス。現状は常に POSIX 形式 |

## 付録B: 参考資料

- [Agent SDK — Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Agent SDK reference — TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Permission modes](https://code.claude.com/docs/en/permission-modes)
- [Configure the sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing)
- [Choose a sandbox environment](https://code.claude.com/docs/en/sandbox-environments)
- [Claude Code on Amazon Bedrock](https://code.claude.com/docs/en/amazon-bedrock)
- [assistant-ui — Elements（202 要素の一覧、2026-09-13 確認）](https://www.assistant-ui.com/elements)
- [assistant-ui — Guides](https://www.assistant-ui.com/docs/guides)
- [assistant-ui — Tools & Generative UI](https://www.assistant-ui.com/docs/tools)
- [assistant-ui — Electron 環境](https://www.assistant-ui.com/docs/guides/electron)
- [assistant-ui — Thread Virtualization](https://www.assistant-ui.com/docs/guides/virtualization)
- [assistant-ui — External Store Runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)