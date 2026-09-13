---
status: needs-human-review
last_updated: 2026-09-12
generated_by: human (docs/domains/_overview.md の feature 定義から作成)
---

# `/cl-spec` プロンプト集

各 feature を `/cl-spec` にかけるときの実際の入力文。
順序は [docs/roadmap.md](roadmap.md) を正とする。

## 使い方

```
/cl-spec "[<domain>] <feature description>"
```

- `[<domain>]` プレフィックスから domain が抽出される。指定しない場合は
  `docs/domains/*/charter.md` の一覧から選択を求められる
- `--targets frontend|backend|both` で targets の確認を省略できる
- description は 1〜3 文。**詳細仕様は書かない。** 受け入れ条件と設計は
  `/cl-spec` → `/cl-plan` の過程で詰める

## Pre-flight

feature ではないが、M1 の前に実行する。

```
/cl-add-reviewer ui-coverage-reviewer
/cl-add-reviewer platform-boundary-reviewer
```

---

## M1: 読める

### R-1 — フォルダ登録とランタイム検出

```
/cl-spec "[runtime] 作業フォルダを登録し、それを Win32Runtime と WslRuntime のどちらで開くかを選べるようにする。HostPath と RuntimePath を branded type で分離し、C:\ と /mnt/c および /home のパス変換を両方向で通す。WSL ディストロの一覧検出と、ランタイムごとの capabilities 表明を含む。Electron + TypeScript + React + Vite のプロジェクト初期化と ESLint の no-restricted-imports 設定も本 feature に含める。" --targets both
```

**前提**: SPIKE-8 **完了済み** → [AD-015](decisions/0015-wsl-access-strategy.md)。
実装前に必ず読むこと。以下が R-1 の設計を直接縛る。

- WSL 内ファイルは UNC 直読み。`wsl.exe` はプロセス起動専用（単一ファイルで 50 倍差）
- `wsl.exe` の固定コストは約 1.5 秒。**ループ内で呼ばない**
- `WSL_UTF8=1` 必須（`wsl.exe` 自身の出力は既定で UTF-16LE）
- Windows パスを引数で渡すとバックスラッシュが消える。フォワードスラッシュか `WSLENV` を使う
- パス変換は起動時に `mount` からマッピングを取得し、以後ホスト側で計算する
  （`wslpath` は 1 回 1.5 秒かかるため変換ごとには呼べない）
- `claude` はログインシェルの PATH にしかない

**注**: 本 feature が**プロジェクトの初期化を兼ねる**。`package.json` / `tsconfig` / Vite /
Electron の main・renderer 骨格 / ESLint がここで生まれる。scaffolding だけを独立 feature に
しないのは、観測可能な振る舞いを持たないため（Principle XI）。
`pnpm-workspace.yaml` の `nodeLinker: hoisted` は配置済みなので、最初の `pnpm install` から
hoisted で入る。

**Constitution の機械検証もここで整備する。** Principle I / II / VII は ESLint ルール
（`no-restricted-imports` による `node:path` 禁止、`process.platform` の `runtime/` 外禁止、
`supervisor/` での `electron` とネイティブモジュール禁止）、Principle VI は CI の grep
スクリプトとして実装する。`platform-boundary-reviewer` はこれらを**複製せず**、
ルールが見られない領域だけを担当する設計になっているため、ここでルールが整備されないと
検査に穴が空く。

### R-2 — セッション列挙（読み取り専用）

```
/cl-spec "[session] 登録フォルダを横断して Claude Code のセッション一覧を取得する。WSL ディストロ内の config ディレクトリを Windows 側から列挙できること。読み取り専用で、起動は行わない。" --targets both
```

**前提**: SPIKE-1 **完了済み** → [AD-021](decisions/0021-session-store-and-enumeration.md)。
`listSessions()` は config dir を引数で取れないことが確定したため、
**Provider ごとの短命 child process 方式を本線として spec に含める**。
`process.env` の書き換えは並行列挙でレースを起こすため採らない。

`listSessions({ dir })` は git worktree を既定で含む（`includeWorktrees` 既定 `true`）点、
および `includeProgrammatic` 既定 `true` により Closta 自身が起動したセッションも
一覧に出る点を、表示仕様として扱うこと。

### R-3 — transcript の基本表示

```
/cl-spec "[ui] 選んだセッションの transcript を assistant-ui で表示する。markdown 本文、streaming text、scroll anchor、未定義ツールの fallback 表示を実装し、数千メッセージでも仮想化でスクロールが破綻しないこと。この時点で UI の見栄えを判断できることを受け入れ条件に含める。" --targets frontend
```

**前提**: SPIKE-2 完了。**本 feature の完了時点で軸 1 の方針を確定する。**

### R-4 — Tier A tool 表示

```
/cl-spec "[ui] 過去ログから再現可能な Tier A の tool 表示を実装する。Bash の Terminal block、Edit/Write の Code diff、TodoWrite の Todo list、Task の Subagent list、ExitPlanMode の Agent plan、thinking の Reasoning、連続 tool の Tool group。" --targets frontend
```

---

## M2: 走らせられる

### X-1 — 単一セッション起動とストリーミング

```
/cl-spec "[session] WSL ディストロ内で Claude Code のセッションを起動し、応答をストリーミング表示する。canUseTool の permission 要求に承認カードで応答でき、実行中の中断と途中出力の保持ができること。Provider は既定のものを使い、起動条件の選択 UI は含めない。" --targets both
```

**前提**: SPIKE-5 **完了済み** → [AD-018](decisions/0018-wsl-process-control.md)。SPIKE-3 は未。

AD-018 が本 feature の設計を直接縛る。

- **中断は SDK の `interrupt()`（stdin 越しの control_request）を使う。** signal は WSL を越えない
- **stdin を開いたまま保つ。** `AsyncIterable` 形式が必須。閉じると control_request が届かず
  interrupt も `can_use_tool` 応答もできなくなる
- UI には**「中断」と「強制終了」の 2 操作**が要る。後者は `wsl.exe` の kill で、
  孤児は残らないが graceful ではない
- stdin へは `
` で終端する（CRLF にしない）

### X-2 — 日本語 composer

```
/cl-spec "[ui] composer が日本語 IME で正しく動作するようにする。変換確定の Enter が送信にならないこと、全角混在でレイアウトが崩れないこと、実行中に次の入力を積めること、下書きが復元されること。IME の E2E テストと日本語を含むスクリーンショット比較を CI に載せる。" --targets frontend
```

**前提**: SPIKE-4 完了。assistant-ui 側が `isComposing` を扱っていない場合、
自前ガードの実装を spec に含める。

### X-3 — Provider 登録と到達可能性判定

```
/cl-spec "[provider] Provider を認証方式つきで登録できるようにする。config ディレクトリ候補と AWS プロファイルを検出して提示し、利用者の明示操作で登録する。秘密はキーチェーン参照のみを保持し、Provider とランタイムの到達可能性を判定する。" --targets both
```

**前提**: SPIKE-7 完了。

### X-4 — 起動設定ダイアログとプリセット

```
/cl-spec "[session] SessionLaunchConfig の各軸を選んでセッションを起動するダイアログを実装する。ランタイム、Provider、モデル、権限モードの依存関係を解決し、上流を変えたら無効になった下流の値を既定に戻して通知する。Win32Runtime 選択時に Auto と bypass が選択不可であること。設定を名前付きプリセットとして保存・適用できること。" --targets both
```

**前提**: SPIKE-6 完了。`PermissionMode` と `effort` の正確な列挙値が確定していること。

### X-5 — supervisor 分離とマルチセッション

```
/cl-spec "[session] セッション supervisor を utilityProcess に分離し、10 セッションを並列実行しても UI が滑らかに保たれるようにする。supervisor は Electron API にもネイティブモジュールにも依存せず、node 単体で起動できること。semaphore 制御と IPC のバッチ化を含む。" --targets both
```

---

## M3: 差配できる

### O-1 — セッション監視ビュー

```
/cl-spec "[session] 実行中セッションを俯瞰する監視ビューを実装する。idle / running / awaiting_permission / error の状態を一覧で示し、承認待ちを目立たせる。compact と comfortable の情報密度を切り替えられ、一覧と没入ビューを行き来できること。" --targets frontend
```

### O-2 — ui-coverage 対応表の確立と Tier A 完全化

```
/cl-spec "[ui] SDK のメッセージ型・tool 名・システムイベントと表示実装の対応表を docs/ui-coverage.md として確立し、未割当をゼロにする。Permission grant、Elicitation form、Server panel、Checkpoints、Web search、Cost meter、Quota banner、Context display を実装する。対応表の未割当行を検出する CI スクリプトも用意する。" --targets frontend
```

**注**: 本 feature の完了をもって Principle XII が検証可能になる。

**本 feature 内で `ui-coverage-reviewer` を作成する。**

```
/cl-add-reviewer ui-coverage-reviewer --scope both
```

観点は「新しい tool・メッセージ型・システムイベントの実装を含む PR で、対応表の行追加が
**同一 PR に**含まれているか」「Tier A の項目が未実装のまま feature が completed に
なっていないか」といった**判断が要るもの**に限る。未割当行の検出そのものは grep なので
CI スクリプトの担当とし、reviewer に複製しない。

### O-3 — Thread 検索と observability

```
/cl-spec "[ui] セッションを横断して探せるようにする。Thread search、会話内検索、conversation map、message timing、活動の heat graph、command palette、empty state を実装する。" --targets frontend
```

---

## M4: 任せられる

### I-1 — DockerRuntime と endpoint 抽象

```
/cl-spec "[isolation] コンテナ内で Claude Code のセッションを起動できるようにする。docker CLI への到達経路を endpoint として抽象化し、host と wsl:<distro> の両方を扱えること。主開発ホストは WSL 内 Docker Engine であり Docker Desktop ではない。コンテナ内の transcript を SDK の SessionStore 実装でホスト側 SQLite にミラーする。作業領域戦略として bind / clone-ephemeral / clone-volume を選べるようにし、WSL 側フォルダは bind、Windows 側フォルダは clone-ephemeral を推奨として提示する。強制終了は docker kill でコンテナごと行う。" --targets both
```

### I-2 — コンテナライフサイクルと隔離可視化

```
/cl-spec "[isolation] 使い捨てコンテナのライフサイクルを管理する。イメージの存在確認（ビルドはしない）、セッション開始時の起動、終了時の破棄または保持、起動時の孤児コンテナ**および未使用 volume** の検出と破棄提案。作業フォルダのみのマウントと非 root 起動を検証し、隔離状態をバッジで一目に分かるようにする。" --targets both
```

### I-3 — sandbox capability 判定と権限モードのゲート

```
/cl-spec "[isolation] ランタイムごとの sandbox 利用可否を判定し、権限モードの選択肢をゲートする。autoModeSafe が false のランタイムで Auto と bypassPermissions を選択不可にし、bypass の選択には明示確認を要求する。許可ドメイン等の sandbox 設定を --settings で渡せること。" --targets both
```

---

## M5: 配れる

### D-1 — パッケージングと Windows インストーラ

```
/cl-spec "[runtime] electron-builder で Windows インストーラを生成する。Agent SDK のネイティブバイナリと node-pty が asarUnpack により実行可能な状態で同梱されること。インストールした状態からセッションを起動できることを受け入れ条件に含める。" --targets both
```

---

## Optional scope

### OPT-mac — macOS 対応

```
/cl-spec "[runtime] macOS でビルド・起動できるようにし、DirectRuntime でセッションを起動できるようにする。Seatbelt sandbox の capability を反映し、IME とレンダリングを macOS 上で検証する。" --targets both
```

### OPT-pty — PTY フォールバックタブ

```
/cl-spec "[ui] xterm.js と node-pty による端末タブを追加し、SDK 経路では扱えない対話 TUI に切り替えられるようにする。" --targets both
```
