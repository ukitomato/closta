# Tasks: ui-coverage 対応表の確立 (O-2)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` agents / domain / scripts、`[FE]` renderer、`[SH]` 横断 (docs・規則・reviewer・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。targets=both の Backend / Frontend / Shared の区分はこのタグで示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC、DTO と純関数の値と形の正本は data-model、対応表の書式の正本は対応表の凡例と AD-044、方式の理由は research。本書は作業単位とテストの観点だけを書き、規則を書き写さない。

**順序の制約**: SH-001 (glossary) と SH-003 (AD-044) → コード。SH-002 (element の照合) → FE-010。BE-001 (DTO) → BE / FE の他。SH-010 (roadmap の O-4〜O-6) → SH-011 (対応表)。SH-011 は US-2〜US-4 で足す表示を含めて最後に仕上げる。SH-090 (Constitution) は AD-044 が accepted になってから。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。FR-015): ui-coverage 対応表 (割当の 3 種類、行の Tier の決め方、ToolFallback と Tier B / C)、transcript の情報密度 (監視ビューの行の密度と区別。Counterexamples)、システムイベントの行 (状態を保持しない・1 つの Hook / task で 1 行)、Subagent (`Agent` / `Task`)、Hook / Background task / Tool group の見出し
- [ ] **SH-002** [SH] **element の照合を記録する** (Principle XIII。research R-06 / plan US-2): システムイベントの行と transcript の密度の切り替えについて、assistant-ui の registry の候補を実名で照合し、採否と理由を research に追記する。assistant-ui の system ロールの制約 (text 1 つ) を前提に入れる。独自のトークンを足さない
- [ ] **SH-003** [SH] **AD-044 を proposed で起こす** (FR-016 / research R-10): 割当の 3 種類と後続 ID の読み方、M3 の完了の条件、対応表の節と機械照合の範囲、行の Tier の決め方、ToolFallback と Tier、対応表の書式の正本、AD-019 / AD-020 の Open Questions への回答。**利用者に accepted にしてもらう** (SH-090 の前提)
- [ ] **BE-001** [BE] `transcript-dto.ts` — `system-event` の variant (`opens` と任意の `status` を含む) と `EventStatus`、`TRANSCRIPT_PART_FIELDS['system-event']`、`id` の注記 (合成 id の接頭辞) (data-model §2)。003 SC-009 の台帳 (`transcript-schema.test.ts`) が `system-event` で通ること

## US-1 — SDK が emit する情報のどれがどこに表示されるかが分かる (P1)

**Goal**: `docs/ui-coverage.md` と、SDK の型定義と照合する検査 (spec US-1 / FR-001〜006)。

**Independent Test**: 検査の単体テストと `check.mjs` 項目 21 の発火のテスト。

- [ ] **BE-010** [BE] `scripts/ui-coverage/coverage.mjs` — parse 関数 (SDK の `SDKMessage` の union / `ToolInputSchemas` / control_request の subtype / 対応表 (A' 節を照合から外す) / roadmap の ID) と `checkCoverage`、件数の集計 (data-model §1)。冒頭の注記から対応表の凡例を指す
- [ ] **BE-011** [BE] `tests/ui-coverage/coverage.test.ts` — 観点 (SC-002):
  - 行の欠け (SDK に型を 1 つ足した fixture) / 余分な行 (SDK から 1 つ消した fixture) / 割当が 3 種類でない (空・`未割当`・`TBD`・`—`) / roadmap に無い ID / SDK の版の違い — それぞれ該当する行と理由を出して落ちる
  - `実装済み: ToolFallback` だけの Tier A の行が落ち、Tier B / C の行は通る。Tier C の行の割当の書式
  - A' 節 (union の外) の行は余分な行にならない
  - 入力が無い・parse の結果が下限 (data-model §1) を下回るときに通さない
  - **parse から独立した正解**: `typescript` のコンパイラ API でインストール済みの `sdk.d.ts` / `sdk-tools.d.ts` から集合を列挙し、`coverage.mjs` の parse と一致する (design-gate R2 platform-boundary M-101)
  - `後続` の ID: roadmap の feature の表の ID だけが有効 (`P-4` / `SPIKE-12` は違反)。完了済みの feature の ID は違反
  - 件数の集計 (割当の種類 × Tier、後続 ID ごとと milestone、M3 の完了の条件の件数)
- [ ] **BE-012** [BE] `scripts/constitution/check.mjs` — 項目 21 (Principle XII)。pending を持たず、入力のファイルが無ければ違反。通ったときに件数を出す。**入力を差し替える口は足さない** (環境変数も引数も読まない。design-gate R2 platform-boundary L-102 / architecture L-103)。`tests/ui-coverage/item21.test.ts` は一時ディレクトリにリポジトリの形 (scripts・docs・node_modules の SDK の 3 ファイル) を組み、`cwd` を変えて `check.mjs` を呼び、崩した対応表で `[VIOLATE] #21` と非 0 の終了コード (SC-002 / AD-027)。`docs/discovery.md` の「20 項目」と、`scripts/rules` が項目の数を持つならそれを直す
- [ ] **SH-010** [SH] **後続 feature を roadmap に登録する** (FR-004 / research R-11): M3 に O-4 / O-5 / O-6 の行 (domain `ui`、依存は O-2、各行に対応表の割当の範囲。O-4 に task の進捗、O-6 に一般の Hook と `includeHookEvents` の ADR・Background task の一覧の要否・後から背景に移った task・B 節の機械照合)。「順」の列は O-4〜O-6 を 13〜15 とし、M4 / M5 を 16〜19 に振り直す。D-1 の依存は O-3 のまま (M3 の完了は待たない) と注記する (design-gate R2 architecture L-105)。`_overview.md` の Feature 帰属の表と M3 の範囲、M3 の達成状態の読み方 (AD-044 の条件) も同じコミットで
- [ ] **SH-011** [SH] **`docs/ui-coverage.md` を書く** (FR-001 / FR-002 / data-model §1): 凡例 (書式の正本・Tier の決め方・SDK を上げたときの手順・機械照合の外の節の理由)、A〜F 節。A・C・E 節の行は BE-010 の parse の出力から起こし (parse の正しさは BE-011 の独立した正解で確かめる)、E 節の実数を research R-01 と quickstart V-1 に記録する。割当は US-2〜US-4 で足した表示 (tool の結果・event の行・Subagent の `Agent`) を含め、Hook / task の経路は「実行中」(過去ログは未確認 V-4) とする。plan の「上流からの申し送り」#3・#4・#5・#15・#16・#18〜#24 の各行の扱いを反映する。項目 21 が ok になること
- [ ] **SH-012** [SH] **element の Tier B / C の再棚卸し** (FR-005 / research R-08): registry の一覧を web の読み取りだけで取り直し (CLI で add しない。package.json / lockfile の差分 0)、Tier A 35 と PLAN.md の Tier B / C の名前を引いた残りを分類して F 節に書く。AD-019 の Open Questions と ui charter :194 に AD-044 で答える。registry が取れなければ未確認として記録する (RK-06)
- [ ] **SH-013** [SH] **`ui-coverage-reviewer` を組み込む** (FR-006 / research R-09): `/cl-add-reviewer ui-coverage-reviewer`。観点は判断を要するものだけ。reviewers.yml (gates: pr-gate / research R-09 の auto_invoke_patterns)、registry の `invoked_by: [pr-gate]`、cl-pr-gate の候補の一覧、reviewer-base の担当表 (G)。reviewers.yml:101 のコメントを消す。quickstart V-5 で起動されることを確かめる (SC-007)

## US-2 — 実行中のセッションで tool の結果とシステムイベントが見える (P1)

**Goal**: 実行中の tool の結果と Hook / Background task を transcript に出す (spec US-2 / FR-007〜011)。

**Independent Test**: domain と agents の単体、renderer の component テスト。

- [ ] **BE-020** [BE] [P] `tool-result.ts` (新設) — 結果の取り出しを `transcript.ts:230-252` から移し、`withToolResult` を足す (data-model §3)。`transcript.ts` は移した関数を使う (過去ログの既存のテストが緑のまま)。切り詰め (`truncated`) とエラー (`isError`)
- [ ] **BE-021** [BE] [P] `system-event.ts` (新設) — `toSystemEventMessage` と `mergeSystemEvent` (data-model §2)。観点:
  - 5 つの subtype のそれぞれが期待の `system-event` (`opens` を含む) になる / 通さないフィールド (`output` / `stdout` / `stderr` / `exit_code` / `prompt` / `summary` / `output_file` / `patch.description` / `patch.error`) の値が DTO のどこにも出ない
  - `skip_transcript: true`・前景の task (`is_backgrounded` が true でない)・`ambient: true` は `null` / 値のある知らない status は `unknown`、status の無い `task_updated` は `null` / 名前と detail の制御文字・双方向制御文字・改行が除かれ 120 コードポイントで切れる / `local_bash` の description が代入・`$(`・秘密の接頭辞を含むと名前が `''` / 文字列でないフィールドで例外を投げない
  - 合成: 行の無い id には `opens` が false の更新で行を作らない (隠した task に `patch.description` つきの `task_updated` が届いても行が出ない) / status の無い更新で `running` が保たれる / 名前の無い更新で前の名前が保たれる
- [ ] **BE-022** [BE] `transcript.ts` — 過去ログのシステムメッセージを `toSystemEventMessage` で変換し、同じ id の後続を `mergeSystemEvent` で合成する。compact_boundary の注記を「対応表 A 節 / O-6」に直す
- [ ] **BE-023** [BE] `live-message.ts` — `redacted_thinking` を過去ログと同じ Reasoning の文言に (FR-007)。注記を直す
- [ ] **BE-024** [BE] `sdk-agent-session.ts` — switch に `user` の tool_result と system の Hook / task の分岐、結果待ちの対応 (data-model §3。`run()` の closure)。`default:` の注記を対応表の参照に直す。観点 (単体):
  - tool_use を含む assistant → 結果の `user` で同じ id の `message` が結果を埋めて送り直される / エラー・切り詰めの結果
  - 並列の結果が 1 つの user メッセージで来ても送り直しは 1 回 / 結果が 1 つずつ別の user メッセージで来ても送り直しの回数は user メッセージの数以下 / 対応の無い結果は `result:<id>` / `toolCallId` が空の tool_use は登録しない / 256 件を超えたら古いものを捨てる / 1 回の送り直しの `result` の合計が 1MB 以下 (超えた分は `truncated`。data-model §3)
  - `SESSION_EVENT_KINDS` が 7 つのまま (固定テスト。design-gate R2 platform-boundary L-101)
  - `user` メッセージの本文 (tool_result 以外のブロック) は送らない
  - Hook の開始と応答が同じ id / task の開始・更新・通知が同じ id / `hook_progress`・`task_progress`・`background_tasks_changed` は送らない
  - `post` に渡す kind が `status` / `event` / `ended` / `child-exited` のまま / query の options のキーが変わらない (`session-core.test.ts` の pin のまま)
  - 状態通知 (`SessionStatusUpdate`) のフィールドは変わらない (X-5 の全フィールド走査が緑)
- [ ] **FE-010** [FE] renderer の経路 (data-model §2):
  - `isSystemEventPart` (列挙は `Object.hasOwn` で照合) と tool-call の part の `result` / `isError` / `truncated` の型の検証を、実行中の decoder (`session-event-decoder.ts`) と過去ログの frame の受け口 (`useTranscript.ts`) の両方で使う
  - 実行中の store の upsert: system-event のメッセージは、前の行の data part から `fromSystemEventData` で DTO を復元し、DTO どうしで `mergeSystemEvent` を通してから変換する (規則は domain の 1 か所)
  - `convert.ts` が system-event のメッセージを `role: 'assistant'` の data part (`metadata.custom.systemEvent`) に写す
  - `thread.aui.tsx` の `ThreadMessage` が `metadata.custom.systemEvent` のメッセージを `SystemEventRow` に回す (AssistantMessage の footer・action bar・branch picker・running indicator を付けない。末尾が system-event の行で `isRunning` でも indicator を付けない)。名前は状態の文言と見た目で分ける。終わりの来ない行は、セッションが終了・失敗した後 (thread の context に store のセッションの状態を渡す) と過去ログで「結果不明 (記録に終わりが無い)」。Hook の失敗の行に案内。SH-002 の element。文言は `features/chat/labels.ts` (新設)
- [ ] **FE-011** [FE] [P] Subagent の `Agent` — `tool-registry.aui.tsx` と `tool-args.ts` (research R-05)
- [ ] **FE-012** [FE] component テスト — 観点 (SC-003):
  - 実行中: tool-call の後に結果を埋めた同じ id の `message` が届くと Terminal block に出力が出る / エラーと切り詰めの表示 / `Agent` が Subagent の表示になる
  - システムイベントの行: Hook の名前と結果、task の説明と状態。同じ id の更新で行が増えずに書き換わる。名前の無い更新で名前が消えない。HTML・双方向制御文字・偽の状態の文言を含む名前が要素にならず、状態の文言と区別される。全角の長い名前が 1 行で切り詰まる
  - 終わりの来ない行が、セッションの終了・失敗の後と過去ログで「結果不明」になる / `failed` の Hook の行に案内が出て、`succeeded` / `cancelled` には出ない
  - system-event のメッセージで assistant-ui の変換が例外を投げない / 行に action bar・branch picker が無く、末尾が system-event の行で `isRunning` のとき running indicator がその行に出ない
  - 過去ログ: 同じ形で出る。`system-event` の part の `status` に prototype のキー (`constructor` など) が来ても描かない。tool-call の `result` が文字列でない part を落とす

## US-3 — transcript の情報密度を切り替える (P2)

**Goal**: compact / comfortable と Tool group の既定の開閉 (spec US-3 / FR-012・FR-013)。

**Independent Test**: transcript の component テスト。

- [ ] **FE-020** [FE] `stores/ui` に `transcriptDensity` (data-model §5)。`thread.aui.tsx` が context で受け、Tool group (`key` と `defaultOpen`)・Reasoning・`data-density` (research R-06)
- [ ] **FE-021** [FE] 切り替えの操作を `SessionScreen` のペインのヘッダと `ChatScreen` のヘッダに (同じ部品。`Button` + `aria-pressed`、group 名は「transcript の表示」、文言は `features/chat/labels.ts`)
- [ ] **FE-022** [FE] component テスト — 観点 (SC-005):
  - 既定で Tool group が開く / compact で Tool group と Reasoning が閉じる
  - 利用者が開閉した Tool group が新しいメッセージ・ストリーミングで上書きされない / 密度の切り替えで新しい既定に戻る
  - セッションの切り替えと過去ログの行き来で密度が保たれる / 監視ビューの行の密度とは独立で、切り替えの accessible name が区別できる
  - 既存のテストの直し: `ChatScreen.test.tsx` の `expandToolGroups` と R-4 の共存テストを密度の前提に合わせる。`virtualization.test.tsx` を既定の密度で通す
  - ストリーミング中の切り替えでスクロール位置を奪わない (component で観測できる範囲。残りは quickstart V-4)

## US-4 — 監視ビューの直近の活動が tool ごとに要点だけを出す (P3)

**Goal**: `summarizeToolInput` と event の読み飛ばし (spec US-4 / FR-014)。

**Independent Test**: 純関数の単体。

- [ ] **FE-030** [FE] `session-view.ts` — `summarizeToolInput` (data-model §4) を `deriveActivity` の tool の分岐と承認待ちの分岐で使う。`deriveActivity` は `ThreadMessageLike` の配列を末尾から遡り、`metadata.custom.systemEvent` のメッセージと id が `result:` のメッセージを読み飛ばす
- [ ] **FE-031** [FE] 単体 — 観点 (SC-006):
  - 表の各行 / Windows と POSIX のパスの末尾 / JSON として読めない入力・フィールドが無い入力で tool 名だけ / 承認待ちも同じ規則
  - `Bash`: `TOKEN="a b" cmd` / `TOKEN='a b' cmd` / `FOO=a\ b cmd` / `A=$( ghp_x ) cmd` / backtick で何も出さない、`A=1 B=2 cmd` で `cmd`、`/home/user/bin/tool` で `tool`、素の `ghp_…` / `sk-…` で何も出さない。`sk-` / `ghp_` / `AIza` / `Bearer` の値がどのケースでも出ない
  - 末尾が system-event の行や `result:` のメッセージ (ThreadMessageLike の形) でも、それより前の活動が出る
  - O-1 の既存のテスト (直近の活動) の期待を新しい規則に合わせて直す

## Polish — 記録の追随と検証

- [ ] **SH-090** [SH] **Constitution v1.3.0** (FR-016 / research R-10。**AD-044 が accepted になってから**): 改定手順の 2 (人間と architecture-reviewer の確認) と 4 (Amendment trail) を含める。XII (Automated を項目 21、`bad_pattern_grep` を割当の列に、Manual は配置済みの `ui-coverage-reviewer` と既存の `ux-reviewer` を残す、後続 ID の読み方と M3 の完了の条件、Adoption metadata の `violation_threshold` / `existing_violations`)、XIII (再棚卸しの結果と確認日)、Sync Impact Report (MINOR の理由・MAJOR に当たらない理由・既存違反の enumeration)、plan-template の XII の行、discovery に「SDK の版を上げる PR は対応表を同じ PR で直す」
- [ ] **SH-091** [SH] **docs を追随させる** (FR-015 / research R-11 / R-12):
  - ui charter (Open Questions を閉じる・KPI の計測経路と M3 の完了の条件・Related Specs に O-2)
  - session charter (Hook / BG の状態を保持しないこと、tool の結果の対応づけの一時的な表、直近の活動の読み飛ばしと整形の規則)
  - `_overview.md` (帰属の判断根拠・O-2 の題。帰属表と M3 は SH-010)
  - roadmap (O-2 の行・P-4・store / 一覧の切り出しの持ち主の付け替え・不可視文字の項目の書き足し・O-3 の義務 (2) に `receivedMessages` の注記)、010 data-model に `receivedMessages` の注記
  - `docs/prompts.md` (O-2 のプロンプトの範囲)、`docs/discovery.md` (`ui-coverage.md` の不在の記述・項目の数)
  - PLAN.md §4.2 に「正本は docs/ui-coverage.md」の注記、003 / 004 の data-model §3 から対応表への参照
  - コードの注記「専用 element は O-2」(plan の申し送り #20) を直す
- [ ] **SH-092** [SH] [P] 検証: 型検査 (node / web / e2e / perf)・lint・depcruise・check:constitution (項目 21 を含む)・全件の単体・X-5 の負荷 E2E (既存の経路の回帰の確認。要ビルド)。`git diff --name-only main...HEAD -- src/preload src/main src/agents/supervisor.ts src/agents/supervisor-core.ts src/agents/supervisor-protocol.ts src/agents/transport.ts` が 0 件 (quickstart V-3)
- [ ] **SH-093** [SH] quickstart の結果を `quickstart-results.md` に記録する。V-4 (実機の目視) は利用者が行う項目として記録する
