---
domain: ui
status: needs-human-review
owner: ukitomato
generated_by: human (PLAN.md を素案として再導出)
last_reviewed: 2026-10-05
related_adrs:
  - docs/decisions/0001-adopt-electron-over-tauri.md
  - docs/decisions/0006-supervisor-in-utility-process.md
  - docs/decisions/0019-assistant-ui-element-inventory.md
  - docs/decisions/0020-sdk-emitted-message-inventory.md
  - docs/decisions/0034-transcript-read-path-and-process-boundary.md
  - docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md
  - docs/decisions/0044-ui-coverage-assignment.md
  - docs/decisions/0046-app-shell-layout.md
  - docs/decisions/0047-session-meter-and-failure-reasons.md
  - docs/decisions/0048-session-config-display-and-answer-ui-split.md
  - docs/decisions/0049-boundaries-retraction-and-o11-split.md
  - docs/decisions/0051-message-time-source-and-display-only.md
  - docs/decisions/0052-ask-user-question-answer-projection.md
  - docs/decisions/0053-elicitation-callback-and-user-dialog.md
  - docs/decisions/0054-query-options-hook-events-and-subagent-text.md
  - docs/decisions/0055-subagent-messages-for-past-transcripts.md
  - docs/decisions/0056-o11-scope-background-task-list-and-o12-split.md
  - docs/decisions/0057-elicitation-sdk-side-cancel-known-limit.md
related_specs:
  - specs/003-ui-transcript-rendering/spec.md
  - specs/004-ui-tier-a-tool-display/spec.md
  - specs/006-ui-japanese-ime-composer/spec.md
  - specs/011-ui-coverage/spec.md
  - specs/013-ui-app-shell/spec.md
  - specs/012-ui-thread-search/spec.md
  - specs/017-ui-conversation-time-and-activity/spec.md
  - specs/014-ui-metering-and-limits/spec.md
  - specs/015-ui-mcp-elicitation-commands/spec.md
  - specs/016-ui-boundaries-and-tool-displays/spec.md
  - specs/018-session-answer-ui-and-composer-commands/spec.md
  - specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
---

# Domain Charter: ui

## Mission

`ui` domain は、**Claude Code が emit する情報のすべてに専用表示を与え、
日本語環境で破綻しない操作体験を提供する**ことを担う。

本プロダクトの軸 1 であり、**機能の付随物ではなく採否を決める要素**である。
貧弱な UI、既製感のある UI、日本語が崩れる UI は、機能が揃っていても使われない。

### UI は domain ではないのでは、という問いについて

UI は本来 delivery mechanism であり domain ではない。それでも独立させるのは、
「emit される情報のうち専用表示を持たないものをゼロにする」という**測定可能な達成目標**が
あるためである。各 domain に表示責務を散らすと Principle XII の持ち主がいなくなり、
軸 1 が検証不能になる。

## Scope

### In scope

- assistant-ui の Elements / Tool UI の実装（Tier A 必須、Tier B は体験向上）
- transcript の表示（markdown / streaming / 仮想スクロール / スクロールアンカリング）
- tool 出力の専用表示（Terminal block / Code diff / Todo / Subagent / Agent plan / Reasoning ほか）
- composer（日本語 IME、message queue、draft restore、slash commands、mentions、attachments）
  — slash commands の候補の持ち主は O-10 (O-5 の design で分けた。015 spec U-6 / [AD-048](../../decisions/0048-session-config-display-and-answer-ui-split.md) Decision 1)。
  O-5 は一覧を右のペインの「構成」のタブに出すだけで、composer を変えない。**O-10 の結論** (018 spec FR-012): 先頭の `/` の候補は
  assistant-ui の trigger popover の primitive (`Unstable_TriggerPopoverRoot` / `Unstable_TriggerPopover`) を直接使い (registry の element は
  取り込まない)、IME の変換中のガードはライブラリ側のものを外さない。候補の部品は ui の `features/chat` に置き、一覧は session の
  `meter` の `commands` を稼働中のセッションから渡す
- `docs/ui-coverage.md`（SDK のメッセージ型・tool 名・システムイベントと表示実装の対応表）の維持
- 情報密度の切替（compact / comfortable）— **transcript の密度** (O-2)。稼働中セッション一覧 (監視ビュー) の行の密度は
  session の操作 UI として O-1 が持つ (下の Out of scope「他 domain の操作 UI」。O-1 USER 決定 2026-10-02)
- Thread 検索、conversation map、observability 系の表示
  — **O-3 の例外 (U-5。2026-10-05 に利用者が承認。[012 spec](../../../specs/012-ui-thread-search/spec.md))**: Thread search は
  session の操作 UI (サイドバーの過去のセッションの区画。下の Out of scope「他 domain の操作 UI」) の上に ui が載せる。一致の規則
  (`features/search/`) と検索欄・絞り込みは本 domain が持ち、一覧の中身・行の形・取得は session のまま。**transcript の本文を
  横断して検索しない** (読み込み済みの要約行のフィールドだけを探す。本文の横断検索は O-9 の U-7 でしないと決めた)。同じ U-5 で、O-3 は起動ダイアログの
  プリセットの欄 (再利用率の表示) と、起動の利用記録の domain / main のモジュールにも手を入れた (置き場は session の永続化層。
  session charter の KPI「再利用率」)
- Electron 特有の配線（preload / IPC 越しのストリーミングブリッジ）
  — **基盤そのものではない。** renderer の配信プロトコル・CSP 基線・
  Constitution 検証項目 10 は **R-1 が `app` レイヤで固定した**。
  本 domain の feature がこれを超える指定を要する場合は、
  **nonce / hash で `unsafe-inline` を用いずに満たすか、緩和を ADR で記録する**
  （[AD-025](../../decisions/0025-workspace-folder-carries-location.md) §7。
  `unsafe-inline` は開発ビルドの `script-src` / `style-src` に限り許され、
  `unsafe-eval` は両環境で禁止。ゲートは `app.isPackaged` である）
- PTY フォールバックタブ（optional scope）
- **アプリのシェル** (面の配置と遷移。O-7 / [AD-046](../../decisions/0046-app-shell-layout.md)) — サイドバー・中央・右のペインの
  3 面、設定と起動のダイアログの枠 (開閉・項目・フォーカスの戻り)、中央の focus と中央のヘッダ、右のペインのタブの表。
  サイドバーの 2 つの一覧の中身と行の形は session が、ダイアログの中身 (X-4 の `LaunchDialog`、ランタイム・作業フォルダ・
  Provider・組み合わせの画面) は各 domain が持ち (下の Out of scope「他 domain の操作 UI」)、シェルは置き場所と選択に応じた
  中央の切り替えを持つ。**面の配置と遷移そのものは SDK の emit の表示ではないので、対応表 (Principle XII) に行を足さない。
  ただしシェルの部品 (中央のヘッダ・右のペインのタブ) が SDK の emit や D 節の経路を表示するときは、その行の割当にその部品を
  書き、表示を変える PR で対応表を直す** (中央のヘッダは D 節の session-state を描く。右のペインに足すタブ (O-4〜O-6・OPT-panel)
  も同じ。pr-gate R1 ui-coverage M-002)

### Out of scope

- セッションの起動ロジックと状態遷移 → `session` domain
  （本 domain は `session` が持つ状態を**表示する**）
- Provider の登録ロジックと到達可能性判定 → `provider` domain
- 隔離状態の**判定** → `isolation` domain（本 domain はそれを**表示する**）
- Voice 系 element（Voice conversation / Read aloud / Orb）→ **非目標**
- Generative 22 要素、Image generation、Map answer、Mobile composer → **Tier C、対象外**
- **他 domain の操作 UI（一覧・登録・選択画面）** → 各 domain が持つ。
  本 domain は **transcript / tool 表示の element 選定と見た目**を持つ。
  こう分けるのは [Principle XII](../../../.specify/memory/constitution.md)（`docs/ui-coverage.md` の
  未割当行がある間 UI 系 feature を完了にしない）の**持ち主を明確にする**ためである。
  対応表が対象とするのは SDK のメッセージ型・tool 名・システムイベントであり、
  ランタイム一覧やフォルダ登録画面はそこに現れない。
  これらを本 domain の担当にすると、**対応表に載らない画面が Principle XII の判定対象に
  なってしまい、判定が不能になる**（R-1 の画面は `runtime` domain が持つ）

## Actors / Personas

- **エンドユーザ（開発者）**: CLI の TUI では tool 実行内容が読みにくい。
  ANSI エスケープの流れを目で追うのをやめたい。日本語で普通に入力したい
- **監視者としての同一ユーザ**: 10 セッション並列を俯瞰したいときと、
  1 セッションに没入したいときで必要な情報密度が違う

## User Journey

### Journey 1: 過去セッションを読む

1. ユーザがセッションを選ぶ
2. transcript が表示される。markdown は整形され、コードはハイライトされる
3. tool 実行は種類ごとの専用表示で現れる（Bash は行単位ストリーム + exit status、
   Edit は hunk 単位の diff、TodoWrite はチェックリスト）
4. 数千メッセージでもスクロールが破綻しない

### Journey 2: 実行中セッションを見て応答する

1. ストリーミング中もスクロール位置が奪われない
2. permission 要求が承認カードとして現れる。単発承認と capability 付与が区別される
3. 実行中に次の入力を積める（message queue）
4. 中断しても途中出力が残り、再開できる

### Journey 3: 日本語で入力する

1. ユーザが日本語を入力し、変換候補を確定するために Enter を押す
2. **送信されない**。変換が確定するだけ
3. もう一度 Enter で送信される
4. 全角混在でもレイアウトが崩れない

### Journey 4: 密度を切り替える

1. 監視ビューでは各セッションが compact に並ぶ
2. 1 つを開くと comfortable な没入ビューになる

O-1 で読み替えた: 監視ビューはサイドバーの稼働中の区画 (session の操作 UI) で、行の密度 (compact / comfortable) は
利用者が切り替える。没入ビューは中央の本体の実行中の Chat。transcript 側の密度の切替は本 domain の O-2 が扱う
([010 spec](../../../specs/010-session-monitoring-view/spec.md))。O-1 の時点の「セッション画面のサイドバー」と「表示中セッションの
ペイン」は、O-7 でシェルのサイドバーと中央に置き換わった ([013 spec](../../../specs/013-ui-app-shell/spec.md))

## Key concepts

- **Element**: assistant-ui が提供する UI 部品。202 種（2026-09-13 確認、[AD-019](../../decisions/0019-assistant-ui-element-inventory.md)）。2026-10-03 の registry の名前は 127（数え方が違う。分類は `docs/ui-coverage.md` F 節）
- **Tier A / B / C**: Element の実装優先度。A は Claude Code の一次概念に直結する必須、
  B は体験を押し上げるもの、C は対象外
- **ui-coverage 対応表**: `docs/ui-coverage.md`。emit される情報と表示実装の対応
- **承認カード (Approval card)**: `canUseTool` の応答 UI。本アプリの心臓部

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- **assistant-ui の design system に乗る。** 独自のカラートークン・スペーシングスケールを
  増やさない。同等の element が存在する UI を自作しない（Principle XIII）
- **emit される情報に未表示のものを残さない。** 対応表に未割当がある間、
  UI 系 feature を `completed` にしない（Principle XII）
- **日本語で破綻しない。** IME 変換確定時の誤送信、フォント崩れ、
  全角混在時のレイアウト崩れを許容しない（Principle VIII）
- **長大スレッドは仮想化する。** スクロールアンカリングを壊さない
- **隔離状態は一目で分かること。** セッションの行・中央のヘッダに隔離バッジを表示する (O-7 でタブは無くなった)

## KPI / Success metrics

- **表示網羅**: `docs/ui-coverage.md` の未割当行が 0、かつ M3 の完了の条件 (Tier A の後続のうち、割当先が M3 の feature の
  行が 0。[AD-044](../../decisions/0044-ui-coverage-assignment.md)) — 計測経路: Constitution 検証の項目 21 (SDK の型との機械照合と
  割当の種類 × Tier・後続の件数の出力。CI) + `ui-coverage-reviewer` (割当の妥当性の判断。pr-gate) (O-2)
- **日本語の健全性**: composer の IME テストが E2E に存在し通過、
  日本語を含むスクリーンショット比較が CI に存在する — 計測経路: Playwright + CI
- **スクロールの安定**: 数千メッセージの transcript でストリーミング中にスクロール位置が奪われない —
  計測経路: E2E。**E2E 自体は延期中 (AD-024 #18。持ち主は roadmap の「E2E / 検証基盤 feature」)。
  R-3 は暫定代替として Vitest (同時マウント DOM ノード数が総件数に依存しない / スクロール位置飛び 0) +
  quickstart 実機 (V-5) で担保する** (R-3 / [AD-033](../../decisions/0033-assistant-ui-elements-introduction-cost.md))
- **自作率**: 自作コンポーネントのうち「対応する element が存在しない」と PR で説明されたものの割合が 100% — 計測経路: convention-reviewer / ux-reviewer

## Cross-domain dependencies

- 依存する domain: `runtime`, `session`, `provider`, `isolation`（表示対象がすべてにまたがる）
- 依存される domain: なし（最上層）。ただし `stores/ui.ts` (面の状態と画面をまたぐ受け渡し) は他 domain の操作 UI が**読む** —
  session は `watchedIdOf` で focus と設定・起動ダイアログの開閉を (`RunningSessionList` / `SessionAttentionAnnouncer`)、
  runtime は `folderDraftSeed` を (`WorkspaceFoldersScreen`。受け取ったら `clearFolderDraftSeed` で消す。使い切りの受け渡しの受け手が
  消す操作で、面の状態ではない)。他 domain が面の状態を書くのは下の「面の状態」の例外 2 件だけ (pr-gate R1 architecture M-001 /
  R2 architecture L-101)
- 共有 invariant: Principle III（選べない選択肢を出さない）/ VIII / XII / XIII。
  詳細は [docs/domains/_overview.md](../_overview.md)
- **面の状態** (O-7。**この項が運用上の正本**。AD-046 の訂正の節 (2026-10-05 の時点の記録) に、その後の追加を足したもの。
  pr-gate R3 architecture L-201): 中央の focus・設定・畳みは `stores/ui.ts` の 1 か所にあり、
  focus はシェル (`useShellFocus`) だけが書く。シェルは session のストアの選択 (`selectionSeq`) を購読し、session のコンポーネントは
  focus を書かない。session のコンポーネントが面の状態を書く例外は設定の「作業フォルダ」を開く 2 つの導線だけで、どちらも R-2 から
  続く登録の受け渡しとして残る: `seedFolderDraft` (未登録フォルダの「登録」から初期値つきで開く) と `openSettings('folders')`
  (フォルダが 0 件のときの案内)。どちらも `focus` には触れない。逆向きに、シェルが session のストアの操作を呼ぶのは次の 2 つだけ。
  (1) 起動の告知を消す操作 (`dismissLaunchNotice`): 起動ダイアログを起動せずに閉じたときと、中央に出していない失敗したセッションを
  閉じたとき。起動の状態の遷移のロジックは session のストアの中に残る (pr-gate R2 architecture M-101)。(2) **Command palette の
  セッションの候補の実行** (O-3。012 spec FR-007): 選択の操作 (稼働中は `select`、過去は `sessions.select`) を呼ぶだけで、サイドバーで
  行を選んだのと同じになる。palette は `focus` を書かず、focus はシェル (`useShellFocus`) が選択の通知から決める

## Related ADRs

- [AD-001](../../decisions/0001-adopt-electron-over-tauri.md) — Electron を採用する（本 domain の検証コストが決め手）
- [AD-006](../../decisions/0006-supervisor-in-utility-process.md) — supervisor 分離（描画をブロックしないため）
- [AD-037](../../decisions/0037-japanese-ime-composer-behavior.md) — 日本語 IME の composer 挙動（SPIKE-4）。二重ガードで自前ガード不要 / 実行中積み・下書きは runtime capability / Principle VIII Automated の持ち主は X-2
- [AD-038](../../decisions/0038-e2e-screenshot-harness.md) — E2E / スクリーンショット検証ハーネス（Playwright + Electron。credential-free・フォント同梱・e2e を src グラフ外に分離）
- [AD-046](../../decisions/0046-app-shell-layout.md) — アプリのシェル（サイドバー・中央・右のペインの 3 面。設定と起動はダイアログ。右のペインのタブの表と外部コンテンツの境界）

## Related Specs

- [R-3: transcript の基本表示](../../../specs/003-ui-transcript-rendering/spec.md) — **完了** (#3)。
  本 domain 初の feature。markdown 本文 / streaming text / scroll anchor / 未定義 tool の fallback /
  数千メッセージの仮想化を実装し、**この時点で見栄えの一次判断を行う** (下記 Principle「見た目の判断を先送りしない」)。
  取得経路とプロセス境界は [AD-034](../../decisions/0034-transcript-read-path-and-process-boundary.md)
- [R-4: Tier A tool 表示](../../../specs/004-ui-tier-a-tool-display/spec.md) — **完了** (#4)。
  R-3 の fallback を 7 種の専用表示に置き換える (Bash→Terminal / Edit・Write→Code diff / TodoWrite→Todo /
  Task→Subagent 入れ子 / ExitPlanMode→Agent plan、Reasoning・Tool group は R-3 済)。element 選定と subagent 入れ子の
  DTO 表現は [AD-035](../../decisions/0035-tier-a-tool-display-and-subagent-nesting.md)。**M1 最終 feature**。
  **見栄えの正式な方針確定は SC-010 rubric の実機記入 + R-3 一次判断とあわせた別ステップ** (roadmap の tracked debt)
- [X-2: 日本語 composer](../../../specs/006-ui-japanese-ime-composer/spec.md) — **実装中**。
  Journey 3 (IME 確定 Enter 非送信 / 全角レイアウト) と Journey 2 step 3 (message queue) を実装し、
  Principle VIII Automated 2 項目 (IME E2E / 日本語スクリーンショット比較) を CI に常設する。
  自前 IME ガードは新設せず assistant-ui の二重ガードを殺さない ([AD-037](../../decisions/0037-japanese-ime-composer-behavior.md) D1)。
  E2E / スクリーンショット検証ハーネスは [AD-038](../../decisions/0038-e2e-screenshot-harness.md)
- [O-2: ui-coverage 対応表の確立](../../../specs/011-ui-coverage/spec.md) — **実装中**。`docs/ui-coverage.md` を作り
  SDK の型と機械で照合する (Constitution 検証の項目 21)。各行の割当を確定し、表示の実装の残りを O-4 / O-5 / O-6 に割り当てた。
  実行中の tool の結果と Hook / Background task の行 (システムイベントの行)、transcript の情報密度、`ui-coverage-reviewer` を足す。
  割当の読み方は [AD-044](../../decisions/0044-ui-coverage-assignment.md)
- [O-7: アプリのシェル](../../../specs/013-ui-app-shell/spec.md) — **実装中**。タブのビューを廃し、サイドバー (稼働中と過去の
  セッション)・中央 (実行中の Chat / 過去ログ)・右のペイン (枠・タブの表・「概要」) の 3 面にする。設定と起動はダイアログ。
  [AD-046](../../decisions/0046-app-shell-layout.md)
- [O-3: Thread 検索と探す操作](../../../specs/012-ui-thread-search/spec.md) — **実装中**。サイドバーの過去のセッションの区画の
  Thread search、中央のヘッダの会話内検索、Command palette、本 feature の空の状態。session charter の KPI「再利用率」の計測経路
  (起動元 `preset` / `manual` と `launch-usage.json`。AD-041 (h))、UI の文言を i18n リソース化しない判断
  ([AD-045](../../decisions/0045-ui-labels-no-i18n-resources.md))、O-7 から預かった過去の区画の並び (`role="group"`・
  ツールチップ・基準画像) を含む。conversation map / message timing / heat graph は O-9 に分けた (U-1)
- [O-4: 計量と制限の表示](../../../specs/014-ui-metering-and-limits/spec.md) — **実装中**。ターンの失敗の理由の区別、中央のヘッダの
  目盛り (コンテキストの使用量の推定・費用) と帯 (権限モードの警告の帯・Quota banner)、右のペインの「使用量」のタブ、「概要」の現在の
  権限モード、transcript の行 (API の再試行・コンテキストの圧縮・権限モード・task の進み具合)、tool の経過時間と思考の印。
  session の契約 (失敗の理由のキー・`SessionEvent` の `meter`) を広げる (U-1。[AD-047](../../decisions/0047-session-meter-and-failure-reasons.md))。
  O-7 から預かったタブのキーボード操作 (WAI-ARIA の Tabs pattern) とテストの分割、system-scope から預かった稼働中のストアと監視ビューの行の
  切り出し・消えるボタンのフォーカス・「Provider」の表記を含む
- [O-5: MCP・プラグイン・コマンドの表示](../../../specs/015-ui-mcp-elicitation-commands/spec.md) — **実装中**。MCP の tool
  (`mcp__*` と組み込みの 4 tool) の専用表示 (`McpToolCall`)、`AskUserQuestion` の読み取り専用の表示と承認カードの注記、右のペインの
  「構成」のタブ (Claude Code が報告した構成) と畳んだ帯の注意の印、認証とプラグインの行。session の契約 (`meter` の種類 `init-report` /
  `commands`) を広げる ([AD-048](../../decisions/0048-session-config-display-and-answer-ui-split.md))。問いに答える UI と composer の
  スラッシュコマンドの候補は O-10 (domain `session`) に分けた
- [O-6: 会話の境界と tool の専用表示の第 2 弾](../../../specs/016-ui-boundaries-and-tool-displays/spec.md) — **実装中**。圧縮の境界・
  `conversation_reset`・モデルの拒否・知らせ (`informational`) の行、`Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` /
  `TaskCreate` などの専用表示、Agent plan の markdown、tool の結果待ち・結果不明の印と読み上げ。session の契約 (`meter` の種類
  `retraction`・稼働中のストアからのメッセージの削除) を広げる ([AD-049](../../decisions/0049-boundaries-retraction-and-o11-split.md))。
  Hook・背景の task・subagent の入れ子と知らせの類は O-11 に分けた
- [O-9: 会話の時間と活動の可視化](../../../specs/017-ui-conversation-time-and-activity/spec.md) — **実装中**。メッセージの時刻と
  ターンの所要時間を中央の本体に出し、右のペインの新しいタブ「会話の地図」にターンごとの行と活動の帯 (開いている会話 1 つの
  時間の区間) を置く。`createdAt` を埋める変換の変更は session の契約の値の拡張で、O-9 (ui) が持つ
  ([AD-051](../../decisions/0051-message-time-source-and-display-only.md))。transcript の本文の横断検索・過去の一覧の仮想化は
  しない (U-7)
- （残り。O-6 / O-11 / O-12 / OPT-pty / OPT-panel が本 domain に属する。O-10 は `session` で、表示の部品を本 domain が持つ）

## Open Questions

- [x] ~~element の実在確認~~ → [AD-019](../../decisions/0019-assistant-ui-element-inventory.md)。
      §4.2 / §4.3 が名指しする 35 element はすべて実在。Tier A の選定を変える理由はない
- [x] ~~Tier B / C の再棚卸し（未分類 59 要素）~~ → O-2。registry を 2026-10-03 に引き直し、`docs/ui-coverage.md` の F 節に
      分類した ([AD-044](../../decisions/0044-ui-coverage-assignment.md) Decision 6)
- [x] ~~§4.2 の Tier A 表は暫定~~ → O-2。`docs/ui-coverage.md` が SDK の型から導いた正本になった (PLAN.md §4.2 は参照)
- [x] ~~Hook / Background task の表示の割当と、状態の保持が要る場合の持ち主 domain~~ → O-2 (USER 決定 2026-10-03)。
      状態は保持せず、transcript の 1 行 (システムイベントの行) として本 domain が描く。持ち主の domain は要らない。
      実行中の task の一覧は O-11 で作ると決めた (USER 決定 2026-10-17)。表示と feature の持ち主は本 domain、保持は session の契約
      (`meter` の種類 `background-tasks`。[AD-056](../../decisions/0056-o11-scope-background-task-list-and-o12-split.md) Decision 2)
- [ ] SPIKE-2: assistant-ui Elements の導入コスト実測。element のインストール単位、
      カスタマイズ範囲、design system の拘束度、Claude Code の tool_result 形式との変換コスト。
      **結果次第では本 charter の Scope を見直す**
- [x] ~~SPIKE-4: assistant-ui の composer が `isComposing` を正しく扱うか~~ →
      [AD-037](../../decisions/0037-japanese-ime-composer-behavior.md)。`ComposerPrimitive.Input` が変換確定 Enter を
      二重ガード (keydown の `nativeEvent.isComposing` + `compositionRef`) で扱う。**自前ガードは不要**。
      実行中積み・下書き復元は IME でなく runtime capability / composer state として X-2 が持つ (D2)
- [x] ~~Tier C のうち Data table / Chart / Timeline / Diagram は、将来 MCP ツールの結果表示に転用しうる。いつ判断するか~~
      → O-5 (MCP) で判断する (AD-044 Decision 6。roadmap の O-5 の行)。**O-5 の答え: 転用しない**
      ([AD-048](../../decisions/0048-session-config-display-and-answer-ui-split.md) Decision 4。015 spec U-5)。MCP の結果は平文として描く

## Principles (domain-specific)

### Principle: 見た目の判断を先送りしない

**Statement**: UI の方向性に関わる判断は、実装が積み上がってからではなく、
最小の表示が出た時点で行う。

**Why**: 軸 1 が製品の採否を決める以上、方向性が誤っていた場合の手戻りは大きい。
M1 を 4 feature に抑え、R-3（transcript の基本表示）の時点で一次判断ができる構成にしてある。
M1 の結果次第では本 charter と PLAN.md §4 の方針そのものを見直す。
