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
- **Rationale**: AD-020 Decision 1 は「型定義から機械的に導く」「型が増えたら未割当が増える」を求める。Agent SDK の型定義に名前の集合が現れる節 (A / C / E) は機械で照合する。D はアプリのコードの経路なので型定義に現れない。**B (content block) は `@anthropic-ai/sdk` の `BetaContentBlock` などの union として型定義はある** (`sdk.d.ts:1` が import する) が、beta の型の union は SDK の版ごとに名前と構成が大きく動き、parse の対象を Agent SDK の外に広げることになる。本 feature では B を機械照合の外に置き、凡例にその理由を書く。実行中・過去ログとも知らないブロックは捨てる (既存の振る舞い) ので、増えたブロックは「表示されない」として現れる。B の機械照合は O-6 (ブロックの専用表示) の範囲に割り当てる (design-gate R1 architecture M-007)
- **Alternatives considered**: (a) 対応表をスクリプトで生成し、手で編集しない — 割当 (人の判断) を別のファイルに分けることになり、正本が 2 つになる。採らない。(b) A 節だけにする — tool の専用表示 (R-4) と承認カード (X-1) が対応表から外れ、元の O-2 のプロンプトの 8 つの表示の半分が行を持たない

## R-02 検査の置き場

- **Decision**: 検査のロジックを `scripts/ui-coverage/coverage.mjs` (依存なしの純関数) に置き、`scripts/constitution/check.mjs` の **項目 21** から呼ぶ。単体テストは `tests/ui-coverage/coverage.test.ts` (Vitest の node project。`tests/**/*.test.ts` が既に含まれる)
  - 純関数: SDK の `.d.ts` から A / C / E 節の名前の集合を取る関数、対応表の markdown から行を取る関数、roadmap から feature ID の集合を取る関数、照合して失敗の一覧を返す関数
  - 項目 21 は、ファイルを読んで純関数に渡し、失敗を `violations(21, …)` に流すだけ。**pending (検査対象なし) を持たない** — 5 つの入力 (`sdk.d.ts` / `sdk-tools.d.ts` / SDK の `package.json` / `docs/ui-coverage.md` / `docs/roadmap.md`) のどれかが無ければ、ファイル名を示して違反にする。SDK は直接の依存で CI は必ず install するので、入力の欠けは「検査が届かなくなった」ことを意味する (design-gate R1 platform-boundary M-003。Constitution VI「pending を ok に混ぜない」)
  - 配線の発火の確認: 崩した対応表を一時ディレクトリに置いて `check.mjs` を呼び、`[VIOLATE] #21` と非 0 の終了コードを確かめるテストを置く (`check.mjs` に入力のパスを差し替える口を足す。design-gate R1 architecture M-009 / AD-027)
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
- **送り直しの回数**: user メッセージ 1 つにつき、影響を受けた assistant メッセージを 1 回だけ送り直す (data-model §3)。並列の tool 呼び出しの結果は 1 つの user メッセージで来るので、N 個の並列の結果でも送り直しは 1 回。逐次の呼び出しはそれぞれ別の assistant メッセージなので、N² にはならない
- **Risk**: 送り直しの負荷は **E2E では観測できない** (偽 supervisor は main の中で text のメッセージだけを作り、セッションスレッドを通らない。design-gate R1 security M-004 / platform-boundary M-001)。agents の単体で「送り直しの回数が user メッセージの数以下」「各回の payload が上限内」「256 件を超えたら古いものを捨てる」を固定し、renderer は component テストで「同じ id の更新で行が増えない」を見る。実負荷は quickstart V-4 で利用者が見る

## R-04 Hook / Background task をどう描くか

- **Decision**: `TranscriptPartDTO` に **`event`** の variant を足す (data-model §2)。Hook と Background task のシステムメッセージを、`role: 'system'` の `TranscriptMessageDTO` (part は `event` 1 つ) に変換する純関数を domain に置き、実行中 (agents) と過去ログ (`toTranscriptMessages`) の両方で使う
  - **1 つの Hook / task は 1 行にする**。メッセージの id を `hook:<hook_id>` / `task:<task_id>` にし、後続のメッセージ (Hook の応答、task の更新と通知) は同じ id で送る。**renderer が同じ id の行に合成する** (`mergeSystemEvent`。data-model §2)。`task_updated` と `task_notification` は名前を持たない (SDK の注記は「Clients merge into their local task map」) ので、合成は名前の無い更新で前の名前を保ち、行の無い id への名前の無い更新は捨てる。これで `skip_transcript` で隠した task の後続も現れない。状態は transcript のメッセージの配列の中にだけあり、別の表を持たない (USER 決定 2026-10-03。design-gate R1 architecture H-002)
  - **assistant-ui の system ロールは text 1 つしか受けない** (`@assistant-ui/core` の `thread-message-like.ts:269-273`)。DTO の `role` は `system` のまま (意味として)、`convert.ts` が `role: 'assistant'` の data part に写す (design-gate R1 architecture H-001)
  - **Hook は SDK の既定では SessionStart / Setup のものだけが出る** (`includeHookEvents` が `@default false`。`sdk.d.ts:1722-1731`)。query の options のキー集合は AD-041 (g) で固定されているので足さない (USER 決定 2026-10-03)。一般の Hook は O-6 に割り当て、`includeHookEvents` を足す ADR を O-6 で起こす
  - 変換するもの: `hook_started` / `hook_response` / `task_started` / `task_updated` / `task_notification`
  - 変換しないもの (対応表の割当): `hook_progress` (stdout / stderr を持つ。「表示不要: 開始と結果の行で足りる。出力本文は出さない」)、`task_progress` (進捗の要約。O-4)、`background_tasks_changed` (実行中の task の一覧を置き換える。一覧は作らない — O-6 で一覧の要否を判断)
  - `skip_transcript: true` の task は transcript に出さない (SDK の注記 `sdk.d.ts:5621`)
  - 通すフィールドの正本は data-model §2 (Hook は `hook_name` / `hook_event` / `outcome`、task は `description` / `status` / `task_type`)。**`output` / `stdout` / `stderr` / `exit_code` / `prompt` / `summary` / `output_file` は通さない**
  - 終わり (応答・完了の通知) の来ない行は、セッションが終了・失敗した後と過去ログで「結果不明」と描く (design-gate R1 po H-003)。Hook の失敗の行には、Hook の設定と Claude Code のログを確かめる案内を添える (po M-003)
- **Rationale**: 状態を持たずに (transcript のメッセージの配列だけで) 1 つの Hook / task の開始から終わりまでを 1 行に保てる。行の id での upsert は renderer に既にある
- **Alternatives considered**: (a) イベントごとに 1 行 — task の更新で行が並び、読み手が状態を組み立て直すことになる。(b) 新しい `SessionEvent` の種類 — R-03 と同じ理由で採らない
- **未確定 (実データで確かめる)**: 過去ログ (`getSessionMessages` の `includeSystemMessages: true`) に Hook / task のシステムメッセージが残るか。fixture のテストは作るが、残らなければ対応表の経路を「実行中のみ」と書く (spec Assumptions)

## R-05 subagent の tool 名 (`Task` / `Agent`)

- **Decision**: tool の登録表 (`tool-registry.aui.tsx:22-30`) と引数の読み取り (`tool-args.ts:150`) を、`Task` と `Agent` の両方で同じ Subagent の表示に当てる。`AgentInput` (`sdk-tools.d.ts:692`) の `description` / `prompt` / `subagent_type` を読む。過去ログの入れ子は `parent_tool_use_id` で組まれ、tool 名に依存しない (`transcript.ts:275-295`) ので変えない
- **Rationale**: SDK 0.3.270 には `TaskInput` が無く、実行時の名前が `Agent` なら fallback に落ちる。どちらの名前が来ても当たるようにし、対応表の C 節は実行時の名前 (`Agent`) と旧名 (`Task`) を備考に書く

## R-06 transcript の情報密度

- **Decision**: 密度は renderer の UI ストア (`stores/ui`) に `transcriptDensity` として持つ (永続化しない)。transcript の element (`thread.aui.tsx`) は context で密度を受け、Tool group は `defaultOpen = (density === 'comfortable')`、compact では Reasoning も閉じる。**密度を切り替えたときだけ** Tool group を作り直す (`key` に密度を含める) — 新しいメッセージが届いても作り直さないので、利用者が個々に開閉したものは保たれる (FR-012)
  - 切り替えの操作は、表示中セッションのペインと過去ログの画面のヘッダに置く。O-1 と同じく導入済みの `Button` + `aria-pressed` の 2 値。**文言は監視ビューの密度 (サイドバーの見出し) と区別できるもの (「transcript の表示」の group 名) にする** (design-gate R1 po M-005)
  - 間隔は `data-density` 属性で切り替える (既存のスペーシングのトークンの範囲。独自トークンを足さない)
  - 文言 (密度・システムイベントの行の状態) は `features/chat/labels.ts` に置く。transcript の element は過去ログと共有し、今 elements が import する features は `features/chat` だけなので、session の `labels.ts` には置かない (design-gate R1 architecture M-006)
  - 既存のテストの前提が変わる: `ChatScreen.test.tsx` の `expandToolGroups` は「既定は閉」を前提に trigger を押すので、密度の前提に合わせて直す。`virtualization.test.tsx` を既定 (comfortable) で通す (po M-006)
- **Rationale**: AD-035 の Trade-off「既定 open 化の要否」に、既定の密度 (comfortable) で開く、と答える。開閉の状態を利用者ごとに覚える仕組みを作らない
- **Alternatives considered**: Tool group を制御された状態 (open を外から持つ) にする — 利用者の開閉を覚えるストアが要る

## R-07 直近の活動の tool ごとの整形

- **Decision**: 純関数 `summarizeToolInput(toolName, argsText)` を監視ビューの導出 (`session-view.ts`) から呼ぶ。規則の表は data-model §4。`deriveActivity` の tool の分岐と承認待ちの分岐の両方で使う
  - パスの末尾: `/` と `\` の両方で区切った最後の要素
  - `Bash`: 先頭の環境変数の代入を飛ばしてからコマンドの名前 (パスの末尾)。代入の値にクォートかバックスラッシュがあれば何も出さず、名前が安全な文字 (`^[A-Za-z0-9._+-]{1,64}$`) だけで書けるときだけ出す。空白で素朴に区切ると `TOKEN="sk-... def" cmd` で秘密の後半 (`def"`) が出るため (design-gate R1 security M-002)
  - `deriveActivity` は末尾から遡り、Hook / task の行と結果だけのメッセージを読み飛ばす。末尾 1 件だけを見ると、Hook の行が届くたびに直近の活動が空になる (O-1 FR-006 の regression。design-gate R1 architecture H-003)
  - 入力が JSON として読めない・フィールドが無い・規則の無い tool: tool 名だけ
- **Rationale**: 入力の先頭 1 行を出す今の形では、`Bash` のコマンドの引数や環境変数の代入 (トークン) が監視ビューに出る (O-1 design-gate security L-003)。出すものを「ファイル名」「コマンド名」に絞れば秘密の経路がほぼ無くなる

## R-08 element の Tier B / C の再棚卸し

- **Decision**: 実装の最初に assistant-ui の registry (https://www.assistant-ui.com/elements) の一覧を **web の読み取りだけで** 取り直し (CLI で component を add しない。package.json / lockfile の差分は 0。design-gate R1 security L-004)、Tier A の 35 (AD-019) と PLAN.md §4.3 / §4.4 の Tier B / C の名前を引いた残りを分類する。59 要素の一覧はどこにも残っていない (2026-10-03 の調べ) ので、registry の今の数を基準にする
  - 分類の結果は対応表の F 節に置く。AD-019 の Open Questions (Tier C の Data table / Chart / Timeline / Diagram を MCP の結果の表示に転用するか、Claude Code の一次概念に当たる element が他にあるか) と ui charter :194 に、F 節で答える (転用の判断は O-5 の割当)
- **Rationale**: 59 は 2026-09-13 の差分の数でしかなく、registry は増えている可能性がある。名前の一覧が無い以上、今の registry から引き直すしかない

## R-09 ui-coverage-reviewer の組み込み

- **Decision**: `/cl-add-reviewer ui-coverage-reviewer` で agent と reviewers.yml・registry を作り、次も直す (reviewers.yml の冒頭のコメントが求める組み込み)
  - gates は `pr-gate` だけ。したがって `.claude/skills/cl-pr-gate/SKILL.md` の候補の一覧に足し、cl-code-gate には足さない (design-gate R1 analyze I5)
  - `.specify/.agents-registry.yaml` の `invoked_by: [pr-gate]` (design-gate には出さない)、`reviewer-base.md` の担当表 (G)
  - reviewers.yml:101 の「O-2 と同時に追加する」のコメントを消す
  - `auto_invoke_patterns` (diff に現れる実在のパス): `docs/ui-coverage.md`、`package.json` と `pnpm-lock.yaml` (SDK の版の変更)、`src/agents/**`、`src/domain/session/{transcript,transcript-dto,live-message,system-event,tool-result}*.ts`、`src/renderer/src/components/assistant-ui/elements/**`、`src/renderer/src/features/chat/**`、`scripts/ui-coverage/**` (design-gate R1 architecture L-004)
- **Rationale**: 候補の一覧に名前が無い reviewer は yml にあっても起動しない (reviewers.yml:12-14)。SC-007 は起動されることまでを求める

## R-10 Constitution の PATCH

- **Decision**: **先に ADR (AD-044「ui-coverage 対応表の割当と機械照合」) を proposed で起こし、利用者が accepted にしてから** Constitution を v1.2.9 → **v1.3.0** (MINOR) に改める (design-gate R1 analyze C1・C2 / architecture H-004。USER 決定 2026-10-03)
  - AD-044 に書くもの: 割当の 3 種類と「後続 feature の ID は roadmap に実在するものに限り割当とみなす」読み方、M3 の完了の条件 (Tier A の `後続` の行が 0)、対応表の節と機械照合の範囲 (R-01)、行の Tier の決め方、ToolFallback を実装済みにできるのは Tier B / C に限ること、AD-019 / AD-020 の Open Questions への回答 (表示不要の欄、Hook / BG の持ち主、`SDKPartialAssistantMessage`、Tier C の転用、59 要素)。対応表の書式の正本は対応表の凡例と AD-044 に置く
  - XII: Automated を「`check:constitution` 項目 21 (対応表の検査)」に、`bad_pattern_grep` を割当の列だけを見る形に改めて補助に、Manual の「未配置」を外す。Statement の後に後続 ID の読み方と M3 の完了の条件を足す
  - XIII: 「未分類 59 要素」と「143」の記述を R-08 の結果に合わせ、数に確認日を併記する (AD-019 D3)
  - Sync Impact Report に、版の方針表の「指針の実質的な拡張」の行で MINOR とした理由を書く。plan テンプレートの XII の行 (`.specify/templates/plan-template.md:61`) を追随させる
- **Rationale**: Constitution の改定手順 1 は既存の Principle の変更に ADR を求める (これまでの Principle の改定はすべて ADR を挙げている)。後続 ID を割当とみなすのは XII の判定の意味の拡張であり、方針表では MINOR に当たる

## R-11 roadmap の変更

- **Decision**:
  - M3 に 3 行を足す (順は O-3 の後。domain はいずれも `ui`。USER 決定 2026-10-03): **O-4** 計量と制限 (task の進捗を含む)、**O-5** MCP・Elicitation・プラグイン・コマンド、**O-6** 会話の境界と tool の専用表示の第 2 弾 (一般の Hook と `includeHookEvents` の ADR、実行中の Background task の一覧の要否、B 節の機械照合を含む)。各行に対応表の割当の範囲 (節と行) を書く。依存は O-2
  - `_overview.md` の Feature 帰属の表に 3 行を足し、M3 の範囲を O-1〜O-6 にする (design-gate R1 architecture H-005)
  - `running-session-store.ts` / `RunningSessionList.tsx` の切り出しと型の移動の項目: 持ち主を「store に派生値を足すか、監視ビューの行を触る次の feature」に付け替え、理由 (O-2 は store に派生値を足さない) を書く (利用者の決定)
  - 直近の活動の不可視文字の残りの項目: 持ち主は変えない。O-2 の整形で入力の大半を出さなくなったことだけを書き足す
  - O-2 の題の「Tier A 完全化」を `_overview.md` / `docs/prompts.md` と合わせて今の範囲に直す
- **Rationale**: FR-004 / FR-015。後続 feature の ID が roadmap に無いと、FR-003 の検査が落ちる

## R-12 文書の追随の範囲

- **Decision**: FR-015 の範囲に加え、`docs/discovery.md` の docs の一覧 (`ui-coverage.md` の不在の記述)、ui charter の Related Specs、AD-035 の Trade-off への回答 (roadmap の記録)、003 / 004 の data-model §3 (先行の台帳) から対応表への参照を足す。`docs/verify-report.md` は 2026-09 時点の記録として**変えない** (日付の付いた報告である)。PLAN.md は §4.2 に「正本は docs/ui-coverage.md」の注記だけを足す
