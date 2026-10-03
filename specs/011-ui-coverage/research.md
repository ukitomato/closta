# Research: ui-coverage 対応表の確立 (O-2)

**Spec**: [spec.md](./spec.md) / **Plan**: [plan.md](./plan.md)

調査の一次情報は `@anthropic-ai/claude-agent-sdk` **0.3.270** の `sdk.d.ts` / `sdk-tools.d.ts` と、2026-10-03 のコードの調べ (下の各節に file:line)。

## R-01 対応表の形と、どこまでを機械で導くか

- **Decision**: `docs/ui-coverage.md` を 6 つの節に分ける。行の単位と「機械で導くか」は節ごとに決める。

  | 節 | 行の単位 | 導出 | 出所 |
  |---|---|---|---|
  | A. メッセージ型 | `SDKMessage` のメンバー 1 つ (39) | **機械** (union の名前の集合と一致すること) | `sdk.d.ts:4945` |
  | B. 中身のブロック | assistant / user の content block の `type` | 手で維持 (割当だけを検査) | `live-message.ts:44-67` / `transcript.ts:196-265` |
  | C. tool | `ToolInputSchemas` のメンバー 1 つ (45) + 実行時の tool 名 | **機械** (入力型の名前の集合と一致すること) | `sdk-tools.d.ts:11-57` |
  | D. アプリが作る経路 | 承認要求 (`canUseTool`)・状態通知・失敗など、SDK のメッセージではなくアプリが作る表示 | 手で維持 (割当だけを検査) | `session-core.ts:169-185` など |
  | E. 制御要求 | `control_request` の `subtype` (約 45) | **機械** (subtype の集合と一致すること) | `sdk.d.ts:3578-4806` |
  | F. element の分類 | assistant-ui の element (Tier A / B / C) | 手で維持 (表示の割当の対象ではない) | AD-019、registry |

  - AD-020 の「control_request / system subtype は約 70 種」は、system の subtype (A 節のメッセージ型に含まれる) と control_request の subtype を合わせた数である。E 節は control_request の subtype だけを数え、system の subtype は A 節の行の備考に書く
  - `StdoutMessage` にだけ現れる `SDKActiveGoalMessage` (`sdk.d.ts:3301`) と `SDKKeepAliveMessage` (`:4878`) は `SDKMessage` の外である。A 節に「union の外」の小節として行を置き、機械の照合の対象外とする (export されていない keep_alive は「表示不要: 接続維持」)
  - **`SDKSessionInfo` のフィールドは行にしない** (002 data-model §3 の先行資料)。ui charter の Out of scope (他 domain の一覧画面は対応表の判定の対象外) による。理由を対応表の冒頭に書く
- **Rationale**: AD-020 Decision 1 は「型定義から機械的に導く」「型が増えたら未割当が増える」を求める。型定義に名前の集合が現れる節 (A / C / E) は機械で照合できる。B / D は SDK の型定義に名前の集合として現れない (content block は Anthropic Messages API の型で、アプリの経路はアプリのコード) ので、割当があることだけを検査する
- **Alternatives considered**: (a) 対応表をスクリプトで生成し、手で編集しない — 割当 (人の判断) を別のファイルに分けることになり、正本が 2 つになる。採らない。(b) A 節だけにする — tool の専用表示 (R-4) と承認カード (X-1) が対応表から外れ、元の O-2 のプロンプトの 8 つの表示の半分が行を持たない

## R-02 検査の置き場

- **Decision**: 検査のロジックを `scripts/ui-coverage/coverage.mjs` (依存なしの純関数) に置き、`scripts/constitution/check.mjs` の **項目 21** から呼ぶ。単体テストは `tests/ui-coverage/coverage.test.ts` (Vitest の node project。`tests/**/*.test.ts` が既に含まれる)
  - 純関数: SDK の `.d.ts` から A / C / E 節の名前の集合を取る関数、対応表の markdown から行を取る関数、roadmap から feature ID の集合を取る関数、照合して失敗の一覧を返す関数
  - 項目 21 は、ファイルを読んで純関数に渡し、失敗を `violations(21, …)` に流すだけ
- **Rationale**: Principle XII の Verification (Automated) の実装であり、Constitution 検証の項目に置くのが自然である (X-5 が 18〜20 を足した先例)。CI の `check:constitution` の step と agent 用のコマンド (`node scripts/constitution/check.mjs`) が既にあるので、**CI・package.json・discovery の表を変えずに**検査が回る
- **Alternatives considered**: (a) 独立した `pnpm check:ui-coverage` — package.json と verify.yml と discovery の表を足すことになる。(b) ルール検証 (`scripts/rules`) の違反サンプルに足す — 違反サンプルは `src/` に展開する方式で、`docs/` のファイルの検査に合わない。SC-002 は単体テストの違反サンプル (文字列の fixture) で満たす

## R-03 実行中の tool の結果をどう届けるか

- **Decision**: **`SessionEvent` の種類は増やさない。** agents のセッションスレッドが、送った assistant メッセージの DTO を tool_use の id で引ける形で持ち、`user` メッセージの `tool_result` を受けたら、domain の純関数で該当する tool-call part の `result` / `isError` / `truncated` を埋めて、**同じ id の `message` を送り直す**。renderer は既に id で upsert する (`running-session-store.ts:246-264`)
  - 結果の本文の取り出しと無害化は、過去ログの変換 (`transcript.ts:230-252`) と同じ関数を使う (共通化して domain に置く)
  - 対応する呼び出しが見つからない結果は、過去ログと同じく結果だけの tool-call として新しいメッセージで送る
  - 持つ DTO は「結果待ちの tool_use を含む最新のメッセージ」だけで、結果がそろったものから捨てる。上限 (例: 結果待ち 256 件) を超えたら古いものから捨て、捨てた後に来た結果は対応の無い結果として扱う
  - 同時に `redacted_thinking` を過去ログと同じ Reasoning の文言にそろえる (`live-message.ts:65-67`)
- **Rationale**: renderer・decoder・port のどこにも新しい種類を足さずに済む (FR-011 の「IPC と preload を増やさない」をさらに狭く守る)。表示の形は過去ログと同じ DTO なので R-4 の専用表示がそのまま使える
- **Alternatives considered**: (a) 新しい `SessionEvent` の種類 `tool-result` を足し、renderer が該当する part を書き換える — decoder・ストア・型の 3 か所に新しい経路ができる。(b) renderer が `user` メッセージを受けて対応づける — `user` メッセージを renderer に通すことになり、会話由来の文字列の経路が増える
- **Risk**: tool を多く呼ぶメッセージでは、同じ DTO を結果の数だけ送り直す。各回は本文の上限 (`BODY_MAX_BYTES`) の範囲で、X-5 の本文の間引き (メッセージ単位) の対象になる。SC-003 の component テストと X-5 の負荷 E2E で確かめる

## R-04 Hook / Background task をどう描くか

- **Decision**: `TranscriptPartDTO` に **`event`** の variant を足す (data-model §2)。Hook と Background task のシステムメッセージを、`role: 'system'` の `TranscriptMessageDTO` (part は `event` 1 つ) に変換する純関数を domain に置き、実行中 (agents) と過去ログ (`toTranscriptMessages`) の両方で使う
  - **1 つの Hook / task は 1 行にする**。メッセージの id を `hook:<hook_id>` / `task:<task_id>` にし、後続のメッセージ (Hook の応答、task の更新と通知) は同じ id で送り直して行の状態を書き換える (実行中は upsert、過去ログは最初の行にまとめる)
  - 変換するもの: `hook_started` / `hook_response` / `task_started` / `task_updated` / `task_notification`
  - 変換しないもの (対応表の割当): `hook_progress` (stdout / stderr を持つ。「表示不要: 開始と結果の行で足りる。出力本文は出さない」)、`task_progress` (進捗の要約。O-4)、`background_tasks_changed` (実行中の task の一覧を置き換える。一覧は作らない — O-6 で一覧の要否を判断)
  - `skip_transcript: true` の task は transcript に出さない (SDK の注記 `sdk.d.ts:5621`)
  - 通すフィールド (data-model §2): Hook は `hook_name` / `hook_event` / `outcome` (と `exit_code` の有無)。task は `description` / `status` / `task_type`。**`output` / `stdout` / `stderr` / `prompt` / `summary` / `output_file` は通さない**
- **Rationale**: 状態を持たずに (transcript のメッセージの配列だけで) 1 つの Hook / task の開始から終わりまでを 1 行に保てる。行の id での upsert は renderer に既にある
- **Alternatives considered**: (a) イベントごとに 1 行 — task の更新で行が並び、読み手が状態を組み立て直すことになる。(b) 新しい `SessionEvent` の種類 — R-03 と同じ理由で採らない
- **未確定 (実データで確かめる)**: 過去ログ (`getSessionMessages` の `includeSystemMessages: true`) に Hook / task のシステムメッセージが残るか。fixture のテストは作るが、残らなければ対応表の経路を「実行中のみ」と書く (spec Assumptions)

## R-05 subagent の tool 名 (`Task` / `Agent`)

- **Decision**: tool の登録表 (`tool-registry.aui.tsx:22-30`) と引数の読み取り (`tool-args.ts:150`) を、`Task` と `Agent` の両方で同じ Subagent の表示に当てる。`AgentInput` (`sdk-tools.d.ts:692`) の `description` / `prompt` / `subagent_type` を読む。過去ログの入れ子は `parent_tool_use_id` で組まれ、tool 名に依存しない (`transcript.ts:275-295`) ので変えない
- **Rationale**: SDK 0.3.270 には `TaskInput` が無く、実行時の名前が `Agent` なら fallback に落ちる。どちらの名前が来ても当たるようにし、対応表の C 節は実行時の名前 (`Agent`) と旧名 (`Task`) を備考に書く

## R-06 transcript の情報密度

- **Decision**: 密度は renderer の UI ストア (`stores/ui`) に `transcriptDensity` として持つ (永続化しない)。transcript の element (`thread.aui.tsx`) は context で密度を受け、Tool group は `defaultOpen = (density === 'comfortable')`、compact では Reasoning も閉じる。**密度を切り替えたときだけ** Tool group を作り直す (`key` に密度を含める) — 新しいメッセージが届いても作り直さないので、利用者が個々に開閉したものは保たれる (FR-012)
  - 切り替えの操作は、表示中セッションのペインと過去ログの画面のヘッダに置く。O-1 と同じく導入済みの `Button` + `aria-pressed` の 2 値
  - 間隔は `data-density` 属性で切り替える (既存のスペーシングのトークンの範囲。独自トークンを足さない)
- **Rationale**: AD-035 の Trade-off「既定 open 化の要否」に、既定の密度 (comfortable) で開く、と答える。開閉の状態を利用者ごとに覚える仕組みを作らない
- **Alternatives considered**: Tool group を制御された状態 (open を外から持つ) にする — 利用者の開閉を覚えるストアが要る

## R-07 直近の活動の tool ごとの整形

- **Decision**: 純関数 `summarizeToolInput(toolName, argsText)` を監視ビューの導出 (`session-view.ts`) から呼ぶ。規則の表は data-model §4。`deriveActivity` の tool の分岐と承認待ちの分岐の両方で使う
  - パスの末尾: `/` と `\` の両方で区切った最後の要素
  - `Bash`: 先頭の `NAME=value` の形の語 (環境変数の代入) を飛ばしてから最初の語。代入に秘密が入りうるため
  - 入力が JSON として読めない・フィールドが無い・規則の無い tool: tool 名だけ
- **Rationale**: 入力の先頭 1 行を出す今の形では、`Bash` のコマンドの引数や環境変数の代入 (トークン) が監視ビューに出る (O-1 design-gate security L-003)。出すものを「ファイル名」「コマンド名」に絞れば秘密の経路がほぼ無くなる

## R-08 element の Tier B / C の再棚卸し

- **Decision**: 実装の最初に assistant-ui の registry (https://www.assistant-ui.com/elements) の一覧を取り直し、Tier A の 35 (AD-019) と PLAN.md §4.3 / §4.4 の Tier B / C の名前を引いた残りを分類する。59 要素の一覧はどこにも残っていない (2026-10-03 の調べ) ので、registry の今の数を基準にする
  - 分類の結果は対応表の F 節に置く。AD-019 の Open Questions (Tier C の Data table / Chart / Timeline / Diagram を MCP の結果の表示に転用するか、Claude Code の一次概念に当たる element が他にあるか) と ui charter :194 に、F 節で答える (転用の判断は O-5 の割当)
- **Rationale**: 59 は 2026-09-13 の差分の数でしかなく、registry は増えている可能性がある。名前の一覧が無い以上、今の registry から引き直すしかない

## R-09 ui-coverage-reviewer の組み込み

- **Decision**: `/cl-add-reviewer ui-coverage-reviewer` で agent と reviewers.yml・registry を作り、次も直す (reviewers.yml の冒頭のコメントが求める組み込み)
  - `.claude/skills/cl-pr-gate/SKILL.md` と `cl-code-gate/SKILL.md` の候補の一覧
  - `.specify/.agents-registry.yaml` の `invoked_by`、`reviewer-base.md` の担当表 (G)
  - reviewers.yml:101 の「O-2 と同時に追加する」のコメントを消す
  - gates は `pr-gate` だけ。`auto_invoke_patterns` は `docs/ui-coverage.md`、SDK のメッセージを扱う agents / domain のファイル (`src/agents/**`、`src/domain/session/{transcript,live-message,system-event}*.ts`)、transcript の element (`src/renderer/src/components/assistant-ui/elements/**`)、`features/chat/**`、SDK の `package.json` の版の変更
- **Rationale**: 候補の一覧に名前が無い reviewer は yml にあっても起動しない (reviewers.yml:12-14)。SC-007 は起動されることまでを求める

## R-10 Constitution の PATCH

- **Decision**: v1.2.9 → **v1.2.10** (PATCH。原則の意味を変えず、検証の手段と記述を事実に合わせる)
  - XII: Automated を「`check:constitution` 項目 21 (対応表の検査)」に、`bad_pattern_grep` を残しつつ補助に格下げ、Manual の「未配置」を外す。Statement の後に「roadmap に実在する後続 feature の ID を書いた行は割当済みとみなす」を足す
  - XIII: 「未分類 59 要素」と「143」の記述を R-08 の結果に合わせる
  - Sync Impact Report を足し、plan テンプレートの XII の行 (`.specify/templates/plan-template.md:61`) を追随させる
- **Rationale**: 利用者の決定 (2026-10-03)。後続 feature の ID を割当とみなす読み方は、本文に書かないと reviewer ごとに解釈が分かれる

## R-11 roadmap の変更

- **Decision**:
  - M3 に 3 行を足す (順は O-3 の後): **O-4** 計量と制限、**O-5** MCP・Elicitation・プラグイン・コマンド、**O-6** 会話の境界と tool の専用表示の第 2 弾。各行に対応表の割当の範囲 (節と行) を書く。依存は O-2
  - `running-session-store.ts` / `RunningSessionList.tsx` の切り出しと型の移動の項目: 持ち主を「store に派生値を足すか、監視ビューの行を触る次の feature」に付け替え、理由 (O-2 は store に派生値を足さない) を書く (利用者の決定)
  - 直近の活動の不可視文字の残りの項目: 持ち主は変えない。O-2 の整形で入力の大半を出さなくなったことだけを書き足す
  - O-2 の題の「Tier A 完全化」を `_overview.md` / `docs/prompts.md` と合わせて今の範囲に直す
- **Rationale**: FR-004 / FR-015。後続 feature の ID が roadmap に無いと、FR-003 の検査が落ちる

## R-12 文書の追随の範囲

- **Decision**: FR-015 の範囲に加え、`docs/discovery.md` の docs の一覧 (`ui-coverage.md` の不在の記述)、ui charter の Related Specs、AD-035 の Trade-off への回答 (roadmap の記録)、003 / 004 の data-model §3 (先行の台帳) から対応表への参照を足す。`docs/verify-report.md` は 2026-09 時点の記録として**変えない** (日付の付いた報告である)。PLAN.md は §4.2 に「正本は docs/ui-coverage.md」の注記だけを足す
