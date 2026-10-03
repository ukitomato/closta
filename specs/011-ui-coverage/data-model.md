# Data Model: ui-coverage 対応表の確立 (O-2)

**Spec**: [spec.md](./spec.md) / **Research**: [research.md](./research.md)

DTO と純関数の値と形の正本は本書。振る舞いの正本は spec の FR、方式の理由は research。対応表について: **決定 (割当の 3 種類と後続 ID の読み方、Tier の決め方、機械照合する節、ToolFallback と Tier、M3 の完了の条件) の正本は AD-044**、**書式の詳細 (列・値の綴り・SDK を上げたときの手順) の正本は `docs/ui-coverage.md` の凡例**。食い違ったら AD-044 を正とする。本書の §1 は実装のための初版の設計である (design-gate R2 architecture L-101)。

## §1 `docs/ui-coverage.md` の初版の書式

### 冒頭

- `SDK: @anthropic-ai/claude-agent-sdk <version>` の 1 行 (検査は `node_modules/@anthropic-ai/claude-agent-sdk/package.json` の `version` と比べる)
- 凡例: 割当の 3 種類、行の Tier の決め方、経路の書き方、対象外にしたもの (`SDKSessionInfo` など) と理由、B / D / F 節が機械照合の外である理由
- SDK を上げたときの手順: 項目 21 の失敗の出力を読む → 足りない行を足し、消えた行を消す → 冒頭の版を書き換える → 項目 21 が ok になることを確かめる

### 節

| 節 | 内容 | 機械照合 |
|---|---|---|
| A | `SDKMessage` のメンバー (39) | する (`sdk.d.ts` の union の名前の集合と一致) |
| A' | `SDKMessage` の外で stdout に現れる型 (`SDKActiveGoalMessage` / keep_alive) | しない。見出しを `### A' union の外` にし、parse は A の照合から外す |
| B | 中身のブロック (`assistant/<type>` / `user/<type>`) | しない (割当の書式だけを検査。research R-01) |
| C | tool の入力型 (45) | する (`sdk-tools.d.ts` の `ToolInputSchemas`) |
| D | アプリが作る経路 | しない (割当の書式だけを検査) |
| E | `control_request` の subtype | する (`sdk.d.ts` の制御要求の型の `subtype` の集合) |
| F | element の分類 | しない (Tier の値だけを検査。表示の割当の対象ではない) |

### A〜E 節の列

| 列 | 値 | 検査 |
|---|---|---|
| 識別子 | A: 型名 (`SDKHookStartedMessage`)、B: `assistant/<type>`、C: 入力型の名前 (`FileEditInput`)、D: 経路の名前 (`permission-request` など)、E: subtype | A / C / E は SDK の集合と一致 |
| 判別子 | A: `type` / `subtype`、C: 実行時の tool 名 (`Edit`) | 書式のみ |
| Tier | `A` / `B` / `C` | 3 値のどれか |
| 割当 | `実装済み: <element> (<経路>)` / `後続: <feature ID>` / `表示不要: <理由>` | 3 種類のどれか。`後続` の ID は roadmap の表の ID 列にあること。`実装済み` で element が `ToolFallback` だけの行は Tier B / C。Tier C の行は `表示不要: Tier C (<理由>)` |
| 経路 | `実行中` / `過去ログ` / `両方` / `なし` (表示不要の行) | 書式のみ |
| 備考 | 自由 | — |

- 割当ではないもの: 空、`未割当`、`TBD`、`—` だけ (XII の `bad_pattern_grep` は割当の列だけを見る形に改める。FR-016)
- **行の Tier の決め方**: Claude Code の一次概念 (会話・tool の実行と結果・承認・中断・コンテキスト・費用と制限・セッションの境界) に直結し、利用者が見ないと判断を誤るものを A。体験を押し上げるが無くても判断を誤らないものを B。対象外 (Voice・Generative など) を C。迷う行は備考に理由を書き、ui-coverage-reviewer が妥当性を見る

### 検査の出力 (項目 21)

- 通ったとき: 節ごとの行の数、割当の種類 × Tier の件数、`後続` の feature ID ごとの件数と、その ID の milestone (roadmap の M 見出し)。**M3 の完了の条件は「Tier A の `後続` のうち、割当先が M3 の feature の行が 0」** (Permission grant のように M4 以降の feature に割り当てた Tier A の行は M3 の条件に数えない。design-gate R2 po H-101)
- 失敗のとき: `<節> <識別子>: <理由>` を 1 行ずつ

### 照合の歯止め (parse の取りこぼし)

- 下限: A 節 ≥ 39、C 節 ≥ 45、E 節 ≥ 38 (SDK 0.3.270 の実数。`coverage.mjs` の `LOWER_BOUNDS`)。下回れば「読めた名前が極端に少ない」で違反
- parse から独立した正解: テスト (BE-011) が devDependency の `typescript` のコンパイラ API で、インストール済みの `sdk.d.ts` / `sdk-tools.d.ts` から `SDKMessage` の union のメンバー・`ToolInputSchemas` のメンバー・control_request の `subtype` のリテラルを列挙し、`coverage.mjs` (依存なし) の parse の結果と集合が一致することを確かめる (design-gate R2 platform-boundary M-101)
- `後続` の ID として有効なのは、roadmap の milestone ごとの feature の表 (`| 順 | ID | feature |` の表) と Optional scope の表の ID だけ。`P-4` / `SPIKE-12` などは無効。完了済みの feature の ID は違反にする (表示が実装されたなら `実装済み` に直す)

## §2 `TranscriptPartDTO` の `system-event` (domain/session/transcript-dto.ts)

part の type は `system-event` (glossary の「システムイベントの行」と data part の名前にそろえる。agents の `post` の kind `event` と区別する。design-gate R2 architecture L-102)。

```ts
| {
    readonly type: 'system-event'
    readonly category: 'hook' | 'task'
    /** 行を作ってよいイベントか (hook_started / hook_response / task_started だけ true)。 */
    readonly opens: boolean
    /** Hook: hook_name / task: description。sanitizeBody + 1 行に正規化 + 120 コードポイントで切り詰め。無ければ ''。 */
    readonly name: string
    /** Hook: hook_event (SessionStart など) / task: task_type。無ければ ''。同じ正規化。 */
    readonly detail: string
    /** 無ければ null (task_updated の patch.status は任意。design-gate R2 analyze N1)。 */
    readonly status: EventStatus | null
  }
```

- `EventStatus` (理由キー。訳は renderer の `features/chat/labels.ts`):
  - Hook: `started` (hook_started) / `succeeded` / `failed` / `cancelled` (hook_response の `outcome`)
  - task: `pending` / `running` / `completed` / `failed` / `killed` / `paused` / `stopped` (task_started は `running`、task_updated の `patch.status`、task_notification の `status`)
  - 値があるのに知らない値は `unknown`。値が無いときは `null`
  - 終わりを表す値: Hook は `succeeded` / `failed` / `cancelled`、task は `completed` / `failed` / `killed` / `stopped`。それ以外の値の行が FR-009 の「結果不明」の対象
- `TRANSCRIPT_PART_FIELDS['system-event'] = ['type', 'category', 'opens', 'name', 'detail', 'status']` (003 SC-009 の台帳 / `transcript-schema.test.ts`。増えたら検査が落ちる)
- 変換の入力 (SDK のフィールドの許可リスト。**これが正本**):

  | subtype | 読むフィールド | 読まないフィールド | opens |
  |---|---|---|---|
  | `hook_started` | `hook_id` (行の id)、`hook_name`、`hook_event` | — | true |
  | `hook_response` | `hook_id`、`hook_name`、`hook_event`、`outcome` | `output`、`stdout`、`stderr`、`exit_code` | true |
  | `task_started` | `task_id`、`description`、`task_type`、`skip_transcript`、`is_backgrounded`、`ambient` | `prompt`、`workflow_name`、`subagent_type` ほか | true |
  | `task_updated` | `task_id`、`patch.status` | `patch.description`、`patch.error`、`patch.end_time` ほか | false |
  | `task_notification` | `task_id`、`status`、`skip_transcript` | `summary`、`output_file`、`usage`、`resource_links` | false |

- **Background task だけを行にする** (design-gate R2 analyze N3): `task_started` は `is_backgrounded === true` かつ `ambient !== true` かつ `skip_transcript !== true` のときだけ変換する。前景の task (subagent の呼び出しは Subagent の表示がある、前景の Bash は tool の結果がある) と、後から背景に移った task は行にしない (O-6 に記録)。`task_updated` は `patch.description` を読まない (名前は開始のときのものを保つ。design-gate R2 architecture H-101)
- `task_type` が `local_bash` の task の `description` はコマンドの文字列でありうる。`description` は名前に使うが、§4 と同じ規則 (代入・`$(`・backtick・クォート・既知の秘密の接頭辞を含めば出さない) を通し、通らなければ名前を `''` にして detail の `task_type` だけで描く (design-gate R2 platform-boundary の申し送り)
- メッセージ: `{ id: 'hook:<hook_id>' | 'task:<task_id>', role: 'system', parts: [system-event], createdAt }`。上の条件に合わないもの・`skip_transcript: true` のものは変換しない (`null`)
- `TranscriptMessageDTO.id` は「SDK の `uuid`、または接頭辞つきの合成 id (`hook:` / `task:` / `result:`)」とする (注記を直す)
- **合成** (`mergeSystemEvent(prev, next)`。domain の純関数。規則の正本はここだけ):
  - 同じ id の行が無い: `next.opens` が true なら行を作る。false なら捨てる (隠した task・前景の task・開始を見ていない task への更新)
  - 同じ id の行がある: `status` は `next.status` が null でなければ `next`、null なら `prev`。`name` / `detail` は `next` が空でなければ `next`、空なら `prev`。`opens` は `prev` のまま
- **renderer の store での合成** (design-gate R2 architecture M-101): store の `messages` は変換後の `ThreadMessageLike` なので、upsert の前に、前の行の data part の `data` から DTO の `system-event` を復元する関数 (`fromSystemEventData`。`features/chat/convert.ts`) を通し、DTO どうしで `mergeSystemEvent` を通してから変換する。規則は domain の 1 か所のまま
- **結果不明**: 終わりを表さない `status` の行は、(a) 実行中はセッションが終了済み・失敗のとき (thread の context に store のセッションの状態を渡す)、(b) 過去ログは常に、renderer が「結果不明 (記録に終わりが無い)」の文言で描く (DTO は変えない)。過去ログを開いた時点でまだ動いている task も同じに出る (記録に結果が無いことは事実)
- **assistant-ui への写し**: `convert.ts` は system-event のメッセージを `role: 'assistant'` の `ThreadMessageLike` (content は data part 1 つ: `{ type: 'data', name: 'system-event', data: { category, opens, name, detail, status } }`。`metadata.custom.systemEvent: true`) に写す。assistant-ui の system ロールは text 1 つしか受けない (`thread-message-like.ts:269-273`)
- **描き分け** (design-gate R2 architecture M-102 / analyze N4): `thread.aui.tsx` の `ThreadMessage` は `metadata.custom.systemEvent` のメッセージを専用の部品 (`SystemEventRow`) に回し、AssistantMessage の footer・action bar・branch picker・running indicator を付けない。`isRunning` で末尾が system-event の行のとき、running indicator はその行に付けず、実行中の印は composer 側の既存の表示に任せる
- **renderer の検証** (`isSystemEventPart`。実行中の decoder と過去ログの frame の受け口の両方で使う): `category` と `status` は列挙の照合 (`Object.hasOwn` を使い、prototype のキーを通さない)、`opens` は boolean、`name` / `detail` は文字列。外れた part は落とす。あわせて tool-call の part の `result` (`string | null`)・`isError` / `truncated` (boolean) も確かめる (design-gate R2 security L-101)

## §3 実行中の tool の結果の対応 (agents のセッションスレッドの中)

- 置き場所: `run()` の closure (`permissions` と同じ寿命)。module スコープに置かない
- `pendingToolCalls: Map<toolUseId, messageId>` と `lastMessages: Map<messageId, TranscriptMessageDTO>` (結果待ちの tool_use を含むメッセージだけ)
- `toolCallId` が `''` の tool_use は登録しない
- `user` メッセージを受けたら、その中の `tool_result` ブロックをまとめて処理する:
  1. 結果ごとに `toolUseId` で `messageId` を引き、domain の純関数 `withToolResult(dto, toolUseId, block)` で part を埋める
  2. 影響を受けたメッセージを **user メッセージ 1 つにつき 1 回だけ** 送り直す (並列の tool の結果が 1 つの user メッセージで来ても送り直しは 1 回)。結果待ちが 0 になったメッセージは両方の Map から消す
  3. 引けない結果は、結果だけの tool-call のメッセージを `result:<toolUseId>` で送る
  4. `user` メッセージの `tool_result` 以外のブロック (本文) は送らない
- 1 回の送り直しの合計の上限 (design-gate R2 security M-004): 送り直すメッセージの tool-call の `result` の合計を 1MB [ASSUMED] までにする。超えた分の `result` は短くして `truncated: true` にする (先に埋まった結果から削らない。今回埋めた結果を削る)。並列の結果が 1 つの user メッセージで来るかは quickstart V-4 で確かめる
- 上限: 結果待ち 256 件 [ASSUMED]。超えたら古いメッセージから捨てる。見積もり: 1 件が `argsText` と `result` で最大 200KB × 2 として約 100MB で、セッションスレッドのヒープ上限 (1024MB。`supervisor.ts`) の 1/10 に収まる
- 結果の本文: 過去ログと同じ取り出し (`text` ブロックの連結、`content` が文字列ならそのまま) + `sanitizeBody` (`BODY_MAX_BYTES`)。`is_error` → `isError`、切り詰め → `truncated`
- `post` に渡す kind は `status` / `event` / `ended` / `child-exited` のまま (調停役スレッドのプロトコルを変えない)

## §4 直近の活動の tool ごとの要点 (`summarizeToolInput`)

| tool (実行時の名前) | 出すもの | 入力のフィールド |
|---|---|---|
| `Read` / `Edit` / `Write` / `MultiEdit` | ファイル名 (パスの末尾) | `file_path` |
| `NotebookEdit` | ファイル名 | `notebook_path` |
| `Bash` | コマンドの名前 | `command` |
| `Agent` / `Task` | subagent の種類 | `subagent_type` |
| `Glob` / `Grep` | 出さない (tool 名だけ) | — (検索語は会話の内容そのもの) |
| 上記以外・読めない | 出さない (tool 名だけ) | — |

- パスの末尾: `/` と `\` の両方で区切った最後の要素
- `Bash` のコマンドの名前:
  1. コマンドの文字列にクォート (`"` / `'`)・バックスラッシュ・`$`・backtick・`(` があれば、**何も出さない** (tool 名だけ)。代入の値やサブシェルに秘密が入りうるため (design-gate R2 security L-102)
  2. 空白で区切り、先頭から `NAME=...` の形の代入を読み飛ばし、残りの最初の語の末尾 (パスの末尾) を取る
  3. それが `^[A-Za-z0-9._+-]{1,64}$` に合い、既知の秘密の接頭辞 (`sk-` / `ghp_` / `gho_` / `glpat-` / `AIza` / `xox`) で始まらないときだけ出す。合わなければ何も出さない
- `Agent` / `Task` の `subagent_type` も同じ文字の制限を通す
- 出力: `{ tool, detail }`。既存の `toActivityLine` (1 行化と 80 コードポイントの切り詰め) を通す
- `deriveActivity` は `ThreadMessageLike` の配列を末尾から遡り、`metadata.custom.systemEvent` のメッセージ (data part `system-event` だけのメッセージ) と id が `result:` で始まるメッセージを読み飛ばす (design-gate R2 architecture M-101)

## §5 transcript の情報密度

- `stores/ui` の `transcriptDensity: 'comfortable' | 'compact'` (既定 `comfortable`)、`setTranscriptDensity`。永続化しない
- 監視ビューの行の密度 (`running-session-store` の `density`) とは別の値。切り替えの文言は `features/chat/labels.ts` に置き、「transcript の表示」と分かる文言にする

## §6 観測点 `receivedMessages` (O-1) の意味の変化

- O-1 の `receivedMessages` は port の `message` を受けるたびに 1 足す。本 feature の後は、tool の結果の送り直しと Hook / task の行の作成・更新も数える
- O-1 / X-5 の実機計測の値と比べるときは、この基準の変化を並べて書く (010 data-model と roadmap の O-3 の義務 (2) に注記)
