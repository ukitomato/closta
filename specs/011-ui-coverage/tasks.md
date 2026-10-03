# Tasks: ui-coverage 対応表の確立 (O-2)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` agents / domain / scripts、`[FE]` renderer、`[SH]` 横断 (docs・規則・reviewer・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。targets=both の Backend / Frontend / Shared の区分はこのタグで示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC、値と形の正本は data-model、方式の理由は research。本書は作業単位とテストの観点だけを書き、規則を書き写さない。

**順序の制約**: SH-001 (glossary) → コード。SH-002 (element の照合の記録) → FE-010。BE-001 (DTO) → BE / FE の他。US-1 の対応表 (SH-011) は US-2 の実装で足す表示 (tool の結果・event の行) を含めて最後に仕上げる。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] **glossary を追随させる** (Principle XIV。FR-015): ui-coverage 対応表の定義に割当の 3 種類 (実装済み / 後続 / 表示不要) と Tier B / C の ToolFallback の扱い、transcript の情報密度 (監視ビューの行の密度との区別を Counterexamples に)、システムイベントの行 (状態を保持しない)
- [ ] **SH-002** [SH] **element の照合を記録する** (Principle XIII。research R-06 / plan US-2): システムイベントの行と transcript の密度の切り替えについて、assistant-ui の registry の候補を実名で照合し、採否と理由を research に追記する。独自のトークンを足さない
- [ ] **BE-001** [BE] `transcript-dto.ts` — `event` の variant と `EventStatus`、`TRANSCRIPT_PART_FIELDS.event` (data-model §2)。SC-009 の台帳の検査が `event` で通ること

## US-1 — SDK が emit する情報のどれがどこに表示されるかが分かる (P1)

**Goal**: `docs/ui-coverage.md` と、SDK の型定義と照合する検査 (spec US-1 / FR-001〜006)。

**Independent Test**: 検査の単体テストと `check.mjs` 項目 21。

- [ ] **BE-010** [BE] `scripts/ui-coverage/coverage.mjs` — parse 関数 (SDK の `SDKMessage` の union / `ToolInputSchemas` / control_request の subtype / 対応表 / roadmap の ID) と `checkCoverage` (research R-02 / plan 実装方針)。parse の結果が極端に少ないときは失敗にする (RK-03)
- [ ] **BE-011** [BE] `tests/ui-coverage/coverage.test.ts` — 観点 (SC-002):
  - 行の欠け (SDK に型を 1 つ足した fixture) / 余分な行 (SDK から 1 つ消した fixture) / 割当が 3 種類でない (空・`未割当`・`TBD`・`—`) / roadmap に無い ID / SDK の版の違い — それぞれ該当する行と理由を出して落ちる
  - `実装済み: ToolFallback` だけの Tier A の行が落ち、Tier B / C の行は通る
  - parse の対象が 0 件のとき通さない
  - 実ファイルの抜粋の fixture で parse が A・C・E 節の名前を取りこぼさない
- [ ] **BE-012** [BE] `scripts/constitution/check.mjs` — 項目 21 (Principle XII)。SDK が無ければ pending。出力に各節の行の数を出す。`docs/discovery.md` の「20 項目」と、`scripts/rules` が項目の数を持つならそれを直す
- [ ] **SH-010** [SH] **後続 feature を roadmap に登録する** (FR-004 / research R-11): M3 に O-4 / O-5 / O-6 の行 (各行に対応表の割当の範囲)。依存は O-2。SH-011 の前に入れる (検査が ID を見るため)
- [ ] **SH-011** [SH] **`docs/ui-coverage.md` を書く** (FR-001 / FR-002 / data-model §1): A〜F 節。A・C・E 節の行は BE-010 の parse の出力から起こす。割当は人の判断で、US-2〜US-4 で足した表示 (tool の結果・event の行・Subagent の `Agent`) を含める。plan の「上流からの申し送り」#3・#4・#5・#15・#16・#18〜#24 の各行の扱いを反映する。項目 21 が ok になること
- [ ] **SH-012** [SH] **element の Tier B / C の再棚卸し** (FR-005 / research R-08): registry の一覧を取り直し、Tier A 35 と PLAN.md の Tier B / C の名前を引いた残りを分類して F 節に書く。AD-019 の Open Questions と ui charter :194 (Tier C の転用) に答える。registry が取れなければ未確認として記録する (RK-06)
- [ ] **SH-013** [SH] **`ui-coverage-reviewer` を組み込む** (FR-006 / research R-09): `/cl-add-reviewer ui-coverage-reviewer`。観点は判断を要するものだけ (plan の申し送り #1)。reviewers.yml (gates: pr-gate / auto_invoke_patterns)・registry の `invoked_by`・cl-pr-gate と cl-code-gate の候補の一覧・reviewer-base の担当表 (G)。reviewers.yml:101 のコメントを消す。quickstart V-5 で起動されることを確かめる (SC-007)

## US-2 — 実行中のセッションで tool の結果とシステムイベントが見える (P1)

**Goal**: 実行中の tool の結果と Hook / Background task を transcript に出す (spec US-2 / FR-007〜011)。

**Independent Test**: domain と agents の単体、renderer の component テスト。

- [ ] **BE-020** [BE] [P] `tool-result.ts` (新設) — 結果の取り出しを `transcript.ts:230-252` から移し、`withToolResult` を足す (data-model §3)。`transcript.ts` は移した関数を使う (過去ログの既存のテストが緑のまま)
- [ ] **BE-021** [BE] [P] `system-event.ts` (新設) — `toSystemEventMessage` (data-model §2)。観点:
  - 5 つの subtype のそれぞれが期待の `event` になる / 通さないフィールド (`output` / `stdout` / `stderr` / `prompt` / `summary` / `output_file` / `patch.error`) の値が DTO のどこにも出ない
  - `skip_transcript: true` は `null` / 知らない status は `unknown` / 名前と detail の制御文字・双方向制御文字・改行が除かれ 120 コードポイントで切れる / 文字列でないフィールドで例外を投げない
- [ ] **BE-022** [BE] `transcript.ts` — 過去ログのシステムメッセージを `toSystemEventMessage` で変換し、同じ id の後続を最初の行にまとめる。compact_boundary の注記を「対応表 A 節 / O-6」に直す
- [ ] **BE-023** [BE] `live-message.ts` — `redacted_thinking` を過去ログと同じ Reasoning の文言に (FR-007)。注記を直す
- [ ] **BE-024** [BE] `sdk-agent-session.ts` — switch に `user` の tool_result と system の Hook / task の分岐、結果待ちの対応 (data-model §3)。`default:` の注記を対応表の参照に直す。観点 (単体):
  - tool_use を含む assistant → 結果の `user` で同じ id の `message` が結果を埋めて送り直される / エラーの結果は `isError`
  - 対応の無い結果は `result:<id>` の新しいメッセージ / 上限を超えたら古いものを捨てる
  - `user` メッセージの本文 (tool_result 以外のブロック) は送らない
  - Hook の開始と応答が同じ id の 1 行になる / task の開始・更新・通知が同じ id の 1 行になる / `hook_progress`・`task_progress`・`background_tasks_changed` は送らない
  - 状態通知 (`SessionStatusUpdate`) のフィールドは変わらない (X-5 の全フィールド走査が緑)
- [ ] **FE-010** [FE] decoder (`session-event-decoder.ts` と過去ログの frame の decoder) が `event` の part を検証する (`category` / `status` の列挙、文字列の型)。`convert.ts` が `event` を data part に写す。`thread.aui.tsx` の data part の分岐でシステムイベントの行を描く (SH-002 の element。文言は `labels.ts`)
- [ ] **FE-011** [FE] [P] Subagent の `Agent` — `tool-registry.aui.tsx` と `tool-args.ts` (research R-05)
- [ ] **FE-012** [FE] component テスト — 観点 (SC-003):
  - 実行中: tool-call の後に結果を埋めた同じ id の `message` が届くと Terminal block に出力が出る / エラーの表示 / `Agent` が Subagent の表示になる
  - システムイベントの行: Hook の名前と結果、task の説明と状態。同じ id の更新で行が増えずに書き換わる。HTML・双方向制御文字を含む名前が要素にならない
  - 過去ログ: 同じ形で出る

## US-3 — transcript の情報密度を切り替える (P2)

**Goal**: compact / comfortable と Tool group の既定の開閉 (spec US-3 / FR-012・FR-013)。

**Independent Test**: transcript の component テスト。

- [ ] **FE-020** [FE] `stores/ui` に `transcriptDensity` (data-model §5)。`thread.aui.tsx` が context で受け、Tool group (`key` と `defaultOpen`)・Reasoning・`data-density` (research R-06)
- [ ] **FE-021** [FE] 切り替えの操作を `SessionScreen` のペインのヘッダと `ChatScreen` のヘッダに (同じ部品。`Button` + `aria-pressed`、文言は `labels.ts`)
- [ ] **FE-022** [FE] component テスト — 観点 (SC-005): 既定で Tool group が開く / compact で Tool group と Reasoning が閉じる / 利用者が開閉した Tool group が新しいメッセージで上書きされない / セッションの切り替えと過去ログの行き来で密度が保たれる / 監視ビューの行の密度とは独立

## US-4 — 監視ビューの直近の活動が tool ごとに要点だけを出す (P3)

**Goal**: `summarizeToolInput` (spec US-4 / FR-014)。

**Independent Test**: 純関数の単体。

- [ ] **FE-030** [FE] `session-view.ts` — `summarizeToolInput` (data-model §4) を `deriveActivity` の tool の分岐と承認待ちの分岐で使う
- [ ] **FE-031** [FE] 単体 — 観点 (SC-006): 表の各行 / `Bash` の先頭の `TOKEN=secret` を飛ばし、値が出力に出ない / Windows と POSIX のパスの末尾 / JSON として読めない入力・フィールドが無い入力で tool 名だけ / 承認待ちも同じ規則。O-1 の既存のテスト (直近の活動) の期待を新しい規則に合わせて直す

## Polish — 記録の追随と検証

- [ ] **SH-090** [SH] **Constitution v1.2.10** (FR-016 / research R-10): XII (Automated を項目 21、Manual を配置済みの reviewer、後続 feature の ID の扱い)、XIII (再棚卸しの結果)、Sync Impact Report、plan-template の XII の行
- [ ] **SH-091** [SH] **docs を追随させる** (FR-015 / research R-11 / R-12):
  - ui charter (Open Questions を閉じる・KPI の計測経路・Related Specs に O-2)、session charter (`SessionEvent` の経路で状態を保持しないこと)、`_overview.md` (帰属の判断根拠・O-2 の題)
  - roadmap (O-2 の行・P-4・store / 一覧の切り出しの持ち主の付け替え・不可視文字の項目の書き足し)、`docs/prompts.md` (O-2 のプロンプトの範囲)、`docs/discovery.md` (`ui-coverage.md` の不在の記述・項目の数)
  - PLAN.md §4.2 に「正本は docs/ui-coverage.md」の注記、003 / 004 の data-model §3 から対応表への参照
  - コードの注記「専用 element は O-2」(plan の申し送り #20) を直す
- [ ] **SH-092** [SH] [P] 検証: 型検査 (node / web / e2e / perf)・lint・depcruise・check:constitution (項目 21 を含む)・全件の単体・X-5 の負荷 E2E (要ビルド。RK-02)。`git diff --name-only main...HEAD -- src/preload src/main` が 0 件 (quickstart V-3)
- [ ] **SH-093** [SH] quickstart の結果を `quickstart-results.md` に記録する。V-4 (実機の目視) は利用者が行う項目として記録する
