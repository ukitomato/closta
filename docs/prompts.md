---
status: needs-human-review
last_updated: 2026-09-12
generated_by: human (docs/domains/_overview.md の feature 定義から作成)
---

# `/cl-design` プロンプト集

各 feature を `/cl-design` にかけるときの実際の入力文。
順序は [docs/roadmap.md](roadmap.md) を正とする。

## 使い方

```
/cl-design "[<domain>] <feature description>" --targets <frontend|backend|both>
```

`/cl-design` は **spec → plan → tasks → design-gate を 1 コマンドで完走**する。
design-gate が PASS すれば status が `implementing` まで進み、`/cl-implement` に渡せる状態になる。

- `[<domain>]` プレフィックスから domain が抽出される。省略時は charter の Mission / Scope と
  description の意味的一致度でスコアリングされ、**明確な最高スコアがあれば自動選択**される
  （僅差のときだけ AskUserQuestion で聞かれる）
- `--targets` は省略しても**自動推論して自動採用**されるが、本書では**明示する**。
  各 feature の targets は `docs/domains/_overview.md` の帰属設計で決めてあり、
  推論に委ねる理由がないため
- description は 1〜3 文。**詳細仕様は書かない。** 受け入れ条件と設計は
  spec → plan の過程で詰める
- **形は `"[<domain>] <ID>: <何ができるようになるか>"`。** 範囲・義務・依存・design の前に起こす ADR の正本は
  [roadmap](roadmap.md) の `<ID>` の行で、`/cl-spec` がそこから読む。プロンプトに義務を並べない
  (2026-10-12 から。下の M1〜M3 の使用済みのプロンプトは実際に使った入力の記録として残す。
  未使用のもの (O-8 / O-9 / O-10、M4、M5) は着手のときにこの形に書き直す)

### design-gate が FIX_REQUIRED で止まったとき

Critical 指摘を修正したうえで、gate から再開する。

```
/cl-design --spec-dir <spec_dir> --from gate
```

`--from plan|tasks|gate` で中断地点から再開できる。`--from plan` は tasks.md を
stale にするため、status が `tasking` 以降だと確認を求められる。

### 個別に叩きたいとき

`/cl-spec` / `/cl-plan` / `/cl-tasks` / `/cl-design-gate` は個別にも起動できる。
`/cl-design` はそれらへの委譲とチェーン管理だけを担っており、挙動は同じ。

## Pre-flight — 完了済み

`docs/roadmap.md` の pre-flight P-1〜P-6 はすべて解決済み。
reviewer の追加も以下のとおり決着している。

| reviewer | 状態 |
|---|---|
| `platform-boundary-reviewer` | **作成・登録済み**。観点は lint / tsc が見られない領域のみ（PB-1〜PB-7） |
| `ui-coverage-reviewer` | **作成・登録済み (O-2)**。pr-gate のみ。観点は判断を要するもの (UC-1〜UC-7)。機械照合は Constitution 検証の項目 21 |

**M1 に着手できる状態である。**

---

## M1: 読める

### R-1 — フォルダ登録とランタイム検出

```
/cl-design "[runtime] 作業フォルダを登録し、それを Win32Runtime と WslRuntime のどちらで開くかを選べるようにする。HostPath と RuntimePath を branded type で分離し、C:\ と /mnt/c および /home のパス変換を両方向で通す。WSL ディストロの一覧検出と、ランタイムごとの capabilities 表明を含む。electron-vite の公式 CLI によるプロジェクト初期化、app / ui / agents / infra / domain の 5 レイヤ構成、ESLint と dependency-cruiser による依存規則の強制も本 feature に含める。" --targets both
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
Electron の骨格 / ESLint / dependency-cruiser がここで生まれる。scaffolding だけを独立 feature に
しないのは、観測可能な振る舞いを持たないため（Principle XI）。

**レイヤ構成は [AD-023](decisions/0023-application-architecture.md) で確定済み。**
`app` / `ui` / `agents` / `infra` / `domain` の 5 レイヤ、UseCase レイヤなし、
インタフェースは `domain` 側、`agents` はセッションごとに 1 プロセス。
**最初のコミットで構成が固定される**ので、実装前に必ず読むこと。
`pnpm-workspace.yaml` の `nodeLinker: hoisted` は配置済みなので、最初の `pnpm install` から
hoisted で入る。

**ディレクトリ構成を手で作ってはならない。** 公式 CLI

```
pnpm create @quick-start/electron@latest <dir> --template react-ts --skip
```

が生成する `src/main` / `src/preload` / `src/renderer` を土台とし、5 レイヤはそこからの
**差分**として載せる。AD-023 に「実際に scaffold して検証した事実」の表があり、
`allowBuilds` / preload の出力形式 / `sandbox: true` の可否 / 既定メタデータの修正箇所は
**調査済み**なので再調査しない。

**README.md も本 feature で書く。** 外部 OSS と同じ体裁とし、**全文英語**で書く。
文体・構成は [ukitomato/loupe](https://github.com/ukitomato/loupe) の README を参考にする
（タイトル → 太字の 1 行要約 → バッジ → 位置づけの段落 → 絵文字付き箇条書き → 絵文字見出しの各節）。
**まだ動くものが無い段階なので、実装済みのように書いてはならない。** status を明示する。
scaffold が生成する README は破棄し、置き換える。

公開 ID は [AD-023](decisions/0023-application-architecture.md) の「公開 ID と配布メタデータ」に従う
（`appId` = `setAppUserModelId()` = `dev.closta.app`）。

**Constitution の機械検証もここで整備する。** Principle I / II / VII は ESLint ルール
（`no-restricted-imports` による標準パスモジュールの禁止、`process.platform` の
`src/main/infra/runtime/` 外禁止、**`src/agents/`** での `electron` とネイティブモジュール禁止）と
**dependency-cruiser による推移的到達の禁止**、Principle VI は検証スクリプト
（`scripts/constitution/check.mjs`）として実装する。
`platform-boundary-reviewer` はこれらを**複製せず**、
ルールが見られない領域だけを担当する設計になっているため、ここでルールが整備されないと
検査に穴が空く。

**実装後の追記 (2026-09-15)**: 「Automated の正本を grep から lint + グラフ検証 + 検証スクリプトへ」
移した（[AD-024](decisions/0024-constitution-verification-paths.md) #2 / #7 / #8）。
grep は補助であって正本ではない。
さらに、**ルールは「書いた」ことではなく「違反サンプルで発火した」ことで確認する** —
書いてあるのに 1 件も一致しないルールが実測で 5 件見つかったためである
（[AD-025](decisions/0025-workspace-folder-carries-location.md)）。
違反サンプルと期待表は `tests/rule-fixtures/`、検証は `pnpm test:rules` にある。

### R-2 — セッション列挙（読み取り専用）

```
/cl-design "[session] 登録フォルダを横断して Claude Code のセッション一覧を取得する。WSL ディストロ内の config ディレクトリを Windows 側から列挙できること。読み取り専用で、起動は行わない。" --targets both
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
/cl-design "[ui] 選んだセッションの transcript を assistant-ui で表示する。markdown 本文、streaming text、scroll anchor、未定義ツールの fallback 表示を実装し、数千メッセージでも仮想化でスクロールが破綻しないこと。この時点で UI の見栄えを判断できることを受け入れ条件に含める。" --targets frontend
```

**前提**: SPIKE-2 完了。**本 feature の完了時点で軸 1 の方針を確定する。**

### R-4 — Tier A tool 表示

```
/cl-design "[ui] 過去ログから再現可能な Tier A の tool 表示を実装する。Bash の Terminal block、Edit/Write の Code diff、TodoWrite の Todo list、Task の Subagent list、ExitPlanMode の Agent plan、thinking の Reasoning、連続 tool の Tool group。" --targets frontend
```

---

## M2: 走らせられる

### X-1 — 単一セッション起動とストリーミング

```
/cl-design "[session] WSL ディストロ内で Claude Code のセッションを起動し、応答をストリーミング表示する。canUseTool の permission 要求に承認カードで応答でき、実行中の中断と途中出力の保持ができること。Provider は既定のものを使い、起動条件の選択 UI は含めない。" --targets both
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
/cl-design "[ui] composer が日本語 IME で正しく動作するようにする。変換確定の Enter が送信にならないこと、全角混在でレイアウトが崩れないこと、実行中に次の入力を積めること、下書きが復元されること。IME の E2E テストと日本語を含むスクリーンショット比較を CI に載せる。" --targets frontend
```

**前提**: SPIKE-4 完了。assistant-ui 側が `isComposing` を扱っていない場合、
自前ガードの実装を spec に含める。

### X-3 — Provider 登録と到達可能性判定

```
/cl-design "[provider] Provider を認証方式つきで登録できるようにする。config ディレクトリ候補と AWS プロファイルを検出して提示し、利用者の明示操作で登録する。秘密はキーチェーン参照のみを保持し、Provider とランタイムの到達可能性を判定する。" --targets both
```

**前提**: SPIKE-7 完了。

### X-4 — 起動設定ダイアログとプリセット

```
/cl-design "[session] SessionLaunchConfig の各軸を選んでセッションを起動するダイアログを実装する。ランタイム、Provider、モデル、権限モードの依存関係を解決し、上流を変えたら無効になった下流の値を既定に戻して通知する。Win32Runtime 選択時に Auto と bypass が選択不可であること。設定を名前付きプリセットとして保存・適用できること。" --targets both
```

**前提**: SPIKE-6 完了。`PermissionMode` と `effort` の正確な列挙値が確定していること。

### X-5 — supervisor 分離とマルチセッション

```
/cl-design "[session] セッション supervisor を utilityProcess に分離し、10 セッションを並列実行しても UI が滑らかに保たれるようにする。supervisor は Electron API にもネイティブモジュールにも依存せず、node 単体で起動できること。semaphore 制御と IPC のバッチ化を含む。" --targets both
```

---

## M3: 差配できる

### O-1 — セッション監視ビュー

```
/cl-design "[session] 実行中セッションを俯瞰する監視ビューを実装する。idle / running / awaiting_permission / error の状態を一覧で示し、承認待ちを目立たせる。compact と comfortable の情報密度を切り替えられ、一覧と没入ビューを行き来できること。" --targets frontend
```

### O-2 — ui-coverage 対応表の確立と Tier A 完全化

> **O-2 の design で範囲を改めた (USER 決定 2026-10-03。[spec 011](../specs/011-ui-coverage/spec.md))。** O-2 は対応表・SDK の型との
> 機械照合 (Constitution 検証の項目 21)・割当の確定・`ui-coverage-reviewer` と、実行中の tool の結果・Hook / Background task の行・
> transcript の情報密度に絞った。下のプロンプトの 8 つの表示は、対応表の割当として後続に回した: Permission grant → I-3、
> Cost meter / Quota banner / Context display → O-4、Elicitation form / Server panel → O-5、Web search → O-6、Checkpoints → O-12 (O-6 の design で O-11 に分け、O-11 の design で O-12 に送った。O-12 で実装した: `files_persisted` のシステムイベントの行。巻き戻しはしない)。
> 下は当初のプロンプトの記録として残す。

```
/cl-design "[ui] SDK のメッセージ型・tool 名・システムイベントと表示実装の対応表を docs/ui-coverage.md として確立し、未割当をゼロにする。Permission grant、Elicitation form、Server panel、Checkpoints、Web search、Cost meter、Quota banner、Context display を実装する。対応表の未割当行を検出する CI スクリプトも用意する。" --targets frontend
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

### O-7 — アプリのシェル (O-3 の前)

> 利用者の発言 (2026-10-04) から O-2 と O-3 のあいだに足した ([spec 013](../specs/013-ui-app-shell/spec.md) /
> [AD-046](decisions/0046-app-shell-layout.md))。O-3〜O-6 の置き場所がシェルの分割で決まるので、O-3 より先に行う。

```
/cl-design "[ui] 上部のタブのビューを廃し、Cursor の Agent View に近い 3 面のシェルにする。左のサイドバーに新規起動・稼働中のセッション・過去のセッション・設定、中央に選んだセッションの会話 (実行中の Chat か過去ログ)、右に表示中のセッションの情報をタブで切り替えるペインを置く。設定の 4 画面と起動はダイアログにする。右のペインは枠とタブを足す仕組みと「概要」のタブまでで、他のタブは後続に回す。素材は AD-025 の目標レイアウト。" --targets frontend
```

### O-3 — Thread 検索と探す操作

> **O-3 の design で範囲を分けた (U-1。2026-10-05 に利用者が承認。[spec 012](../specs/012-ui-thread-search/spec.md))。** O-3 は「探す」
> (Thread search・会話内検索・Command palette・Empty state) と、roadmap が預けた義務 (再利用率の計測経路・i18n リソース化の判断・
> O-7 からの過去の区画の並び) に絞った。conversation map / message timing / 活動の heat graph は O-9 に、KPI「並列時の滑らかさ」の
> 実機計測は O-8 に分けた。義務を含めるので targets は both にした。下の 1 つめは当初のプロンプトの記録、2 つめは実際に使った入力である。

```
/cl-design "[ui] セッションを横断して探せるようにする。Thread search、会話内検索、conversation map、message timing、活動の heat graph、command palette、empty state を実装する。" --targets frontend
```

```
/cl-design "[ui] O-3 (roadmap M3 の順 12、domain: ui、依存: O-2): セッションを横断して探せるようにする。Thread search、会話内検索、conversation map、message timing、活動の heat graph、command palette、empty state。義務 (X-4 から): session charter KPI「再利用率」の計測経路 (起動元 preset / manual のローカル利用ログ。AD-041 (h))。義務 (O-1 から): (1) UI ラベルの i18n リソース化の判断 (Constitution Principle XV の期限 M3。target-finder.ts の 2 本を含める) (2) session charter KPI「並列時の滑らかさ」の実機計測の宿題 (roadmap O-3 の行の (a)〜(d))。表示の追加は docs/ui-coverage.md の行を同じ PR で直す (Constitution XII / AD-044)。" --targets both
```

### O-4 — 計量と制限の表示

> O-2 の design で後続に回した表示のうち O-4 の 3 つ (Cost meter / Quota banner / Context display。上の O-2 の注) と、対応表の `後続: O-4` の行を
> そのまま範囲にした ([spec 014](../specs/014-ui-metering-and-limits/spec.md))。Cost meter は右のペインの「使用量」のタブ、Quota banner は中央の
> ヘッダの下の帯、Context display は中央のヘッダの目盛りになった。session の契約 (失敗の理由のキー・`SessionEvent` の `meter`) を広げるので
> targets は both にした (U-1。[AD-047](decisions/0047-session-meter-and-failure-reasons.md))。下は実際に使った入力である。

```
/cl-design "[ui] O-4 (roadmap M3 の順 13、domain: ui、依存: O-2): SDK が emit する計量と制限の情報を表示する。対象は docs/ui-coverage.md で「後続: O-4」の行で、範囲は roadmap の O-4 の行の「対応表の割当 (O-2 から)」に従う (result の失敗の理由・費用・使用量・ターン数・permission_denials、rate_limit_event (Quota banner)、api_retry、status (権限モードの変化・圧縮中・圧縮の失敗)、thinking_tokens、tool_progress、Context display、Cost meter、task_progress)。完了の PR で対象の行を実装済み / 表示不要に書き換え、Constitution 検証の項目 21 の M3 の残りを減らす。" --targets both
```

### O-8 — 並列時の滑らかさの実機計測

> O-3 の design で O-3 から分けた (spec 012 の U-1)。宿題の正本は [roadmap の O-8 の行](roadmap.md#o3-kpi-smoothness) の (a)〜(d) と基準の変化の追記。

```
/cl-design "[session] O-8 (roadmap M3、domain: session、依存: O-7): session charter KPI「並列時の滑らかさ」を実機で測り直す。roadmap の O-8 の行の (a)〜(d) を扱う: (a) perf の出力に窓の終わりの行の状態の内訳を足す (SC-005 の出力の許可リストの変更なので利用者の承認が要る) (b) 10 本が窓のあいだ応答を流し続けるように、プロンプトか有効な回の条件を見直す (c) 行の切り替え (シェルの中央の切り替え) も含めて測る (d) 実機計測ハーネス (perf/) の ADR が未了なら、proposed の ADR を起こしてから perf の安全柵・出力を変える。O-1 / X-5 の値と比べるときは、roadmap の O-8 の行にある基準の変化を並べて書く。"
```

### O-9 — 会話の時間と活動の可視化

> O-3 の design で O-3 から分けた (spec 012 の U-1)。範囲の正本は [roadmap の O-9 の行](roadmap.md)。
> **完了の注記**: O-9 は [017 spec](../specs/017-ui-conversation-time-and-activity/spec.md) として実装した ([AD-051](decisions/0051-message-time-source-and-display-only.md))。下のプロンプトは当時の記録。

```
/cl-design "[ui] O-9 (roadmap M3、domain: ui、依存: O-3): 会話の時間と活動を見えるようにする。conversation map、message timing、活動の heat graph と、docs/ui-coverage.md の F 節で O-9 に預けた Activity graph / Heat graph / Message timing / Trace waterfall の判断。message timing はメッセージの時刻 (createdAt。今は過去ログ・実行中とも null) を変換で埋める必要があり、session の契約の拡張を伴うので、持ち主を session charter と合わせて確かめる。transcript の本文を横断する検索の要否 (列挙と取得の負荷) もあわせて判断する。"
```

### O-10 — Claude Code からの問いに答える UI と composer のコマンドの候補

> O-5 の design で O-5 から分けた (spec 015 の U-1。[AD-048](decisions/0048-session-config-display-and-answer-ui-split.md) Decision 1)。範囲と義務の正本は [roadmap の O-10 の行](roadmap.md) (015 spec FR-013)。
> 回答は agents の `canUseTool` と SDK の callback で返し、表示の部品は renderer に置くので targets は both。**design の前に 2 つの ADR を起こす**。

```
/cl-design "[session] O-10 (roadmap M3、domain: session、依存: O-5): Claude Code からの問いに答える UI (AskUserQuestion の回答・Elicitation・request_user_dialog) と composer のスラッシュコマンドの候補。範囲と義務の正本は roadmap の O-10 の行。" --targets both
```

### O-11 — Hook・背景の task・実行中の subagent と知らせの類の表示

> O-6 の design で O-6 から分けた (spec 016 の U-1。[AD-049](decisions/0049-boundaries-retraction-and-o11-split.md) Decision 1)。範囲と ADR の義務の正本は [roadmap の O-11 の行](roadmap.md) (016 spec FR-015)。
> 表示が主なので domain は `ui`。agents の呼び出しの許可リストと query の options に触れるので targets は both。**design の前に ADR を起こす** (session charter にも記録する)。

```
/cl-design "[ui] O-11 (roadmap M3、domain: ui、依存: O-6): Hook・背景の task・実行中の subagent と知らせの類の表示。roadmap の O-11 の行の範囲に従う: 一般の Hook の表示 (includeHookEvents。hook_name にコマンドの文字列が入るかを確かめ、入るなら hook_event だけを出す)・実行中の Background task の一覧の要否 (要るなら持ち主の domain を人間に諮る。右のペインのタブの要否も判断する)・後から背景に移った task の行・シェルの Background task を秘密を出さずに見分ける手がかり・実行中の subagent の入れ子 (getSubagentMessages・parent_tool_use_id) と Agent handoff・Tier B の知らせの類 (notification / local_command_output / memory_recall / prompt_suggestion / mirror_error / tool_use_summary / active_goal)・Checkpoints の表示 (files_persisted。巻き戻しはしない)・File element・server_tool_use / web_search_tool_result・対応表の B 節の機械照合・過去ログへの O-6 の行と Hook / task の行の変換 (O-6 の quickstart V-3 と O-2 の V-4 の記録による)。design の前に includeHookEvents (AD-041 (g) の読み替え)・getSubagentMessages (AD-035 Decision 3 の読み替えと Agent SDK の呼び出しの許可リストの追加)・get_hooks_listing を呼ぶなら AD-036 §4 P3 の読み替えの ADR を起こす。完了の PR で docs/ui-coverage.md の「後続: O-11」の行を書き換える (Constitution XII / AD-044)。" --targets both
```

### O-12 — 知らせの類・Checkpoints・中身のブロックの表示

> O-11 の design で O-11 から分けた (spec 019 の U-1。[AD-056](decisions/0056-o11-scope-background-task-list-and-o12-split.md) Decision 1)。範囲の正本は [roadmap の O-12 の行](roadmap.md)。
> Tier B と過去ログの経路だけなので M3 の完了の条件に数えない。表示が主なので domain は `ui`。過去ログの変換 (agents / domain) と renderer の両方に触れるので targets は both。

```
/cl-design "[ui] O-12 (roadmap M3、domain: ui、依存: O-11): 知らせの類・Checkpoints・中身のブロックの表示。roadmap の O-12 の行の範囲に従う: Tier B の知らせの類 (notification / local_command_output / memory_recall / prompt_suggestion / mirror_error / tool_use_summary / active_goal)・Checkpoints の表示 (files_persisted。巻き戻しはしない)・user/document の File element・server_tool_use / web_search_tool_result (Sources / Inline citation の判断し直しを含む)・対応表の B 節の機械照合・過去ログへの O-6 の行 (informational・拒否・会話の作り直し) と O-10 の elicitation_complete の行の変換 (O-6 の quickstart V-3 と O-10 の quickstart V-3 の記録による)。完了の PR で docs/ui-coverage.md の「後続: O-12」の行を書き換える (Constitution XII / AD-044)。" --targets both
```

**注**: O-8 の `--targets` はまだ決めていない (`_overview.md` の帰属に targets の記録が無い)。O-8 は src のグラフの外の `perf/` が中心で、
着手のときに決めて書き足す。O-9 は変換 (agents / domain) と renderer の両方に触れるので `both` で決めた (017 の design)。

---

## M4: 任せられる

### I-1 — DockerRuntime と endpoint 抽象

```
/cl-design "[isolation] コンテナ内で Claude Code のセッションを起動できるようにする。docker CLI への到達経路を endpoint として抽象化し、host と wsl:<distro> の両方を扱えること。主開発ホストは WSL 内 Docker Engine であり Docker Desktop ではない。コンテナ内の transcript を SDK の SessionStore 実装でホスト側 SQLite にミラーする。作業領域戦略として bind / clone-ephemeral / clone-volume を選べるようにし、WSL 側フォルダは bind、Windows 側フォルダは clone-ephemeral を推奨として提示する。強制終了は docker kill でコンテナごと行う。" --targets both
```

### I-2 — コンテナライフサイクルと隔離可視化

```
/cl-design "[isolation] 使い捨てコンテナのライフサイクルを管理する。イメージの存在確認（ビルドはしない）、セッション開始時の起動、終了時の破棄または保持、起動時の孤児コンテナ**および未使用 volume** の検出と破棄提案。作業フォルダのみのマウントと非 root 起動を検証し、隔離状態をバッジで一目に分かるようにする。" --targets both
```

### I-3 — sandbox capability 判定と権限モードのゲート

```
/cl-design "[isolation] ランタイムごとの sandbox 利用可否を判定し、権限モードの選択肢をゲートする。autoModeSafe が !== true のランタイムで bypassPermissions を選択不可にし (Auto は X-10 で確認つきで選べる。autoModeSafe === true のランタイムでは X-10 は確認を省いているが sandbox は有効でない。sandbox を有効にするか、確認を省き続けるかを判断し直す。026 U-6 / AD-066)、bypass の選択には明示確認を要求する。許可ドメイン等の sandbox 設定を --settings で渡せること。" --targets both
```

---

## M5: 配れる

### D-1 — パッケージングと Windows インストーラ

```
/cl-design "[runtime] electron-builder で Windows インストーラを生成する。Agent SDK のネイティブバイナリと node-pty が asarUnpack により実行可能な状態で同梱されること。インストールした状態からセッションを起動できることを受け入れ条件に含める。" --targets both
```

---

## Optional scope

### OPT-mac — macOS 対応

```
/cl-design "[runtime] macOS でビルド・起動できるようにし、DirectRuntime でセッションを起動できるようにする。Seatbelt sandbox の capability を反映し、IME とレンダリングを macOS 上で検証する。" --targets both
```

### OPT-pty — PTY フォールバックタブ

```
/cl-design "[ui] xterm.js と node-pty による端末タブを追加し、SDK 経路では扱えない対話 TUI に切り替えられるようにする。" --targets both
```

O-7 の後は、端末は右のペインのタブ (Terminal) として足す (AD-046 Decision 4。OPT-panel は Terminal を持たない)。

### OPT-panel — 右のペインのタブ

```
/cl-design "[ui] O-7 の右のペインに、表示中のセッションの作業フォルダの Changes (git の差分)、Files (ファイルの一覧)、Browser、PR の Webview のタブを足す。Browser と PR の Webview は AD-046 Decision 4 の境界のすべてに従う: 主ウィンドウの webviewTag を使わず、main が管理する WebContentsView に独立した partition と CSP で載せる。モーダル (設定・起動・承認) を開いている間は外部のビューを隠すか外す。renderer が報告する配置の矩形は main で検証する。外部コンテンツのタブはタブの表 (panel-tabs.ts) の Content では表さず、OPT-panel でタブの種別を足す。アプリの CSP を緩めない。main / infra 側の作業 (git・ファイルの監視・別の WebContents) をどの domain が持つかは design で人間に諮る。Terminal は OPT-pty が持つ。" --targets both
```
