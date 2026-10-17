# Research: Hook・背景の task・実行中の subagent の表示 (O-11)

**Spec**: [spec.md](./spec.md) | **Date**: 2026-10-17 (`/cl-plan`。夜間の自走。利用者は不在)

SDK の行番号は `node_modules/@anthropic-ai/claude-agent-sdk/` の 0.3.270 (`sdk.d.ts` / `sdk.mjs` / `sdk-tools.d.ts`)。ソースの行番号は 2026-10-17 の作業ツリー (main 1761c32 の上) で確かめた。
designer は Agent ツールを持たないので、`/speckit.plan` の research agents の分の調査はここに直接書いた。

**未承認の前提**: R-01〜R-15 はどれも spec の U-1〜U-11 (未承認。夜間の仮採用) と AD-054 / AD-055 / AD-056 (proposed) の上に立つ。承認で覆ったときの手当ては plan の RK-01。

---

## R-01 一般の Hook を出す option (U-2 / AD-054)

- **Decision**: `buildQueryOptions` に `includeHookEvents: true` をリテラルで足す。`get_hooks_listing` は呼ばない
- **Rationale**: SDK は既定で SessionStart / Setup の Hook だけを emit し、それ以外は `includeHookEvents: true` のときだけ `hook_started` / `hook_progress` / `hook_response` を出す (`sdk.d.ts:1722-1731`)。メッセージの形は SessionStart と同じ (`sdk.d.ts:4814-4850`: `hook_started {hook_id, hook_name, hook_event}`、`hook_response` は加えて `output` / `stdout` / `stderr` / `exit_code` / `outcome: success|error|cancelled`)。O-2 の `toSystemEventMessage` (`system-event.ts:131-147`) は `hook_event` の値を問わず全部を行にするので、変換の追加は要らない
- **Alternatives**: 起動のダイアログで切り替える (起動の入力・プリセットが広がる。AD-054 Alternatives) / `get_hooks_listing` で設定の一覧を出す (AD-036 §4 P3 の読み替えが要り、利用者の判断に要る情報は増えない。AD-056 Decision 4)

## R-02 `hook_name` の形と伏せた名前の見分け (FR-002 / O-2 pr-gate ux L-102)

- **Decision**: 名前の規則は O-2 のまま (`HOOK_NAME_SHAPE` = `/^[\w.*|-]+(?::[\w.*|-]*)*$/` と `mayCarrySecret`。`system-event.ts:80-90`)。名前を伏せた行 (`name === ''`) は renderer の純関数で通し番号を付け「Hook ({hook_event}) {n}」と出す。番号は「同じターン (直前の user のメッセージから次の user のメッセージまで) の、名前を伏せた同じ `hook_event` の行の中の出現順」。DTO は変えない
- **Rationale**: SDK の型は `hook_name: string` で、中身 (`PreToolUse:Bash` の形か、コマンドの文字列か) を型からは決められない。V-4 (O-2) の未記録の項目で、quickstart V-1 で実データを記録する。番号を agents で振ると DTO の `name` か `detail` に入れることになり、`name` を伏せた意味 (名前の欄に会話外の文字列を入れない) が崩れる。renderer はスレッドのメッセージ列を持っているので、列からの純関数で十分 (O-6 の `toolResultState` と同じく thread の context で渡す)
- **Alternatives**: 番号を付けない (同じ tool の前後の Hook が同じ見出しになり区別できない) / `hook_id` の末尾を出す (id は会話外の値で意味が無い)

## R-03 一般の Hook の見た目と読み上げ (FR-003)

- **Decision**: 失敗 (`failed`)・取り消し (`cancelled`) の Hook の行は注意の見た目 (`SystemEventRow` の `attention` の tone)。成功は今の控えめの見た目。読み上げ (`TranscriptAnnouncer` の `rowAnnouncement`) は、`hook_event` が `SessionStart` / `Setup` 以外の Hook を `failed` / `cancelled` のときだけ読む。SessionStart / Setup の Hook は今どおり (終わりの状態をすべて読む)
- **Rationale**: 今の `rowAnnouncement` (`transcript-announcements.ts`) は hook / task の行を終わりの状態 (`ENDED_STATUSES`) のすべてで読む。一般の Hook が tool ごとに走ると成功の読み上げが溢れる (spec Clarifications の [ASSUMED])。`attention` の tone は今 refusal と一部の informational だけに当たる (`thread.aui.tsx` の `SystemEventRow`)。Hook の失敗・取り消しは tool を止めうるので同じ扱いにする (SessionStart の Hook にも当てる。見た目だけで読み上げの量は変えない)
- **Alternatives**: 一般の Hook を読まない (失敗が支援技術に伝わらない。US-1 AC4) / 一般の Hook をまとめて 1 行にする (Edge Cases で退けた)

## R-04 後から背景に移った task (FR-004 / US-2 AC1)

- **Decision**: domain に「前景で始まった task の記憶」(`createForegroundTaskMemory`。上限 256・古いものから忘れる) を置き、実行中 (agents) と過去ログ (`transcript.ts`) が同じものを使う。`task_started` で `is_backgrounded !== true` (かつ ambient・`skip_transcript` でない) なら記憶し、`task_updated` の `patch.is_backgrounded === true` で記憶にある task なら、`task_started` から作るのと同じ中身の行を category `backgrounded-task` で開く (`opens: true`。状態は `patch.status` があればそれ、無ければ `running`)。以後の `task_updated` / `task_notification` は O-2 の合成 (`mergeSystemEvent`) で同じ行に入る
- **Rationale**: `task_started` (`sdk.d.ts:5596-5630`) は `is_backgrounded?` を持ち、O-2 は true のものだけを行にする (`system-event.ts:150`)。`task_updated` (`sdk.d.ts:5632-5649`) の `patch.is_backgrounded` が後から true になる経路は今は捨てている (`mergeSystemEvent` は行の無い id への `opens: false` を捨てる。`:213`)。行を開くには説明・種類が要るが `task_updated` は持たないので、`task_started` の時点の値を覚えるしかない。印を status で持つと次の `task_updated` の `status` で上書きされる (`:219`) ので、合成で保たれる category で持つ (`mergeSystemEvent` は前の part の category を残す)
- **影響**: `SYSTEM_EVENT_CATEGORIES` が 11 → 12。`TRANSCRIPT_PART_FIELDS` は変えない (part の形は同じ)。`mergedDetail` の task の進み具合の分岐 (`:193`) は `backgrounded-task` にも当てる。renderer の網羅の表 (`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・読み上げ・ラベル) は型で落ちるので全部に足す
- **Alternatives**: `task_updated` で記憶なしに名前の無い行を開く (種類が分からず、`local_bash` を見分けられない) / 印を `detail` に符号化する (task の `detail` は種類と進み具合を既に持ち、O-4 の `splitTaskDetail` の形が崩れる)

## R-05 シェルの背景の task の手がかり (FR-005)

- **Decision**: `bashCommandName` の規則 (`session-view.ts:243-265`: 不安全な文字があれば空・先頭の代入を飛ばす・最初の語の末尾・`SAFE_NAME` と `SECRET_PREFIX`) と `pathTail` を domain (`src/domain/session/command-name.ts` と `src/domain/session/path-tail.ts`) に移し、renderer の `session-view.ts` と `features/chat/path-tail.ts` は domain から import / re-export する。agents と `transcript.ts` は、`local_bash` の `task_started` の `tool_use_id` が指す `Bash` の呼び出しの `argsText` の `command` から名前を取り、行の `name` に入れる。取れなければ `name` は空 (renderer は種類のラベル「シェルのコマンド」だけ)
- **Rationale**: DTO を変えずに見分けるには `name` に入れるしかない。`local_bash` の `description` はコマンドそのもので出さない (O-2 pr-gate R1 security L-002) が、`Bash` の呼び出しの入力は同じセッションの transcript に既に出ていて、O-1 の直近の活動は同じ規則でコマンドの名前を出している (秘密の形を弾く規則を共有する)。実行中は `live-tool-results.ts` が覚えている主ループの assistant のメッセージ (上限 256) から引く。過去ログは `toolCallById` から引く。規則を renderer に置いたままでは agents (supervisor) から呼べない (Principle VII の依存の向き: agents は domain だけ)
- **Principle I**: `pathTail` は会話由来の本文の文字列の切り出しで、アプリのパスの値ではない (AD-049 Decision 5)。`node:path` も `path-api` も import しない。domain に置いても I の対象 (アプリのパスの操作) にならない。切った値を IPC・port の入力に戻さない (今の注記をそのまま移す)
- **Alternatives**: renderer で行の名前を Bash の呼び出しから引く (renderer は過去ログと実行中の両方で同じ thread を持つので可能だが、一覧のタブ (R-07) は行の名前から引くので、二段の参照になる) / `description` を秘密の判定に通して出す (URL の資格情報・`Bearer` を通す。O-2 で退けた)

## R-06 背景の task の一覧の `meter` (FR-006 / U-3 / AD-056 Decision 2)

- **Decision**: `METER_UPDATE_TYPES` に `background-tasks` (9 → 10)。形は `{ type: 'background-tasks'; tasks: readonly { taskId: string; taskType: BackgroundTaskType }[] }`。`BackgroundTaskType` は `local_bash` / `local_agent` / `local_workflow` / `mcp_task` / `other` (renderer の `TASK_TYPE_LABELS` の 4 つと、それ以外)。`ambient === true` を除き、`task_id` の形 (`isValidTaskId`) の外れたものを捨て、64 件で切る。agents は `background_tasks_changed` (`sdk.d.ts:3422-3442`) を受けるたびに `send` で即時に送る (間引かない)
- **Rationale**: SDK は生きている背景の task の全体を毎回送る (置き換え)。起動時には送らず、プロセスの起動で空から始まる。`task_type` は `string` で列挙ではないので、表示に使う 4 つ以外を `other` に寄せる (未知の文字列を運ばない。AD-047 Decision 2 の「列挙だけ」)。`description` は運ばない (AD-056)。置き換えの値なので、間引きで途中を落としても最後が届けばよいが、O-4 の `meter-throttle` は鍵ごとの間引きで最後を落としうる形 (014 data-model §2) ではないかを確かめるより、低頻度 (task の開始と終わりだけ) の値として即時に送るほうが単純 (O-6 の `retraction` と同じ)
- **上限 64**: 1 つのセッションで同時に背景で動く task は数件の想定。上限は表示の有界化のため ([ASSUMED] ではなく O-4 の `MAX_METER_*` と同じ形の安全上限。超えた分は一覧に出ないが transcript の行は出る)
- **Alternatives**: 一覧を transcript の行から組む (行の終わりを取りこぼしたら直らない。AD-056 Alternatives) / `description` を運ぶ (AD-047 Decision 2 の読み替えが広がる)

## R-07 右のペインのタブ「背景の task」(US-2 AC3〜AC5)

- **Decision**: renderer の `SessionMeters` に `backgroundTasks: readonly BackgroundTaskEntry[] | null` (null = まだ届いていない) を足し、`applyMeter` の `case 'background-tasks'` で置き換える。セッションのプロセスの起動 (今 `EMPTY_SESSION_METERS` で `meters` を初期化する箇所) で空に戻る。`PANEL_TABS` に `background-tasks` (label「背景の task」) を足し、見出しに件数を出す。各行の名前は同じセッションの transcript の `task:<taskId>` の行の `name` (R-05 の後の値) から引き、無ければ種類のラベルだけ。終了・失敗したセッションでは「セッションは動いていません」の旨を出し一覧を出さない
- **Rationale**: O-4 / O-5 のタブ (usage / init-report) と同じ経路 (`meters` → タブの `Content`)。`running-session-store.ts` の `case 'meter'` は `meters` の枝だけを書く (`retraction` の例外は O-6 の 1 種類だけのまま)。タブのキーボード操作は O-4 / O-7 のタブの表のまま (AD-046)
- **Alternatives**: 中央のヘッダの件数だけ (何が動いているか分からない。AD-056 Alternatives)

## R-08 実行中の subagent の入れ子 (FR-008 / US-3 AC1・AC2・AC5)

- **Decision**: `forwardSubagentText: true` を足し (AD-054)、`live-tool-results.ts` の追跡を「主ループのメッセージ (根) の最新の DTO と、`toolUseId` → 根の id の表」に広げる。`parent_tool_use_id` が null でない assistant / user のメッセージは、表で親の tool-call を引き、その `children` (深い位置も含む) に入れて根を同じ id で送り直す。入れ子の中の tool の結果も同じ表で引いて深い位置に埋める
- **Rationale**: 今は `case 'assistant'` (`sdk-agent-session.ts:628-702` の switch) が `parent_tool_use_id` を見ずに主ループに平らに emit する。DTO は `children` を既に持ち (R-4 / AD-035 Decision 4)、renderer の `convert.ts` は tool-call の args に `__subagentChildren` を載せて Subagent の表示が描く。O-2 の tool の結果の送り直し (同じ id で根を出し直し、ストアが置き換える) と同じ形にすれば、ストア・IPC・`SessionEvent` は変えずに済む
- **根の保持の上限**: 今の `MAX_PENDING_TOOL_MESSAGES = 256` (`live-tool-results.ts:27`) を根の LRU の上限にする。子の数は 1 つの tool-call で 500 (過去ログの `getSubagentMessages` の上限と同じ値。[ASSUMED] の数値の既定値)、超えたら親の `truncated` を立てて足さない。深さは `MAX_SUBAGENT_DEPTH = 8` (`transcript.ts:40`)。超えたら主ループに平らに出す (AD-035 Decision 5)
- **孤児**: 親の id が表に無い (親より先に届いた・忘れた) メッセージは主ループに平らに出す (spec Edge Cases)。自分の tool-call を親に指すものも同じ
- **取り消し**: O-6 の `retract` で根を忘れたら、その子への後のメッセージは表に親が無いので孤児になる。**取り消した根の配下に属する `toolUseId` は取り消しの記憶 (上限 512) に入れ、子のメッセージを孤児としても出さない** (spec Edge Cases「親と一緒に外れる」)
- **送り直しの量**: 子が増えるたびに根を送り直すので、1 つの根の DTO は子の数に比例して大きくなる。`withToolResults` の `RESEND_RESULT_MAX_BYTES = 1_000_000` と同じ考え方で、根の送り直しの大きさが上限を超えたら子を足さずに `truncated` を立てる (data-model §3 の上限の表)。立てた後は印を届ける 1 回だけ送り直し、以後その親への子では送り直さない。見え方は Subagent の表示の今の切り詰めの印 (spec US-3 AC6 / U-10)。最新の子を残す方式 (古い子の結果本文を落とす) は、送り直しの形が子の位置で変わり過去ログの入れ子と形が分かれるので採らない
- **入れ子の user**: 入れ子の user のメッセージは tool_result だけを読み、text を送らない (design-gate H-09。U-11)。主ループは `sdk-agent-session.ts` の `case 'user'` で user の本文を送らない (011 data-model §3 手順 4)。`SDKUserMessage` は CLI が会話に足す合成の内容も運び `isSynthetic?` を持つ (`sdk.d.ts:5698-5707`) ので、text を描くと Hook の追加の文脈などが DOM に出る経路になる。subagent への依頼の文は親の `Agent` の呼び出しの引数に出ている。過去ログの `getSubagentMessages` の user の記録も同じ規則にする (FR-011)
- **Alternatives**: 実行中も `getSubagentMessages` で読む (ファイルの読み直しが要り、届いた順に出せない。U-5) / renderer で入れ子を組む (DTO の `children` を実行中だけ別の経路で作ることになり、過去ログと形が分かれる。FR-011)

## R-09 subagent の system のメッセージ (FR-009 / US-3 AC3)

- **Decision** (design-gate H-03 で直した。U-9): 実行中に `parent_tool_use_id` を持つ system のメッセージが届いたら、`compact_boundary` だけは親の tool-call の `children` に divider として入れる。他 (Hook・task・知らせ) は捨てず、帰属の無い system と同じく主ループの行にする (Principle XII の「未表示を残さない」と AD-035 Decision 5 の「欠落なし」。SDK 0.3.270 では subagent の中の Hook も帰属なしで届き主ループの行になるので、見え方が変わらない)。`permission_denied` (O-4) はこの判定より前で扱う (承認の経路を変えない)
- **Rationale**: SDK 0.3.270 の型では `parent_tool_use_id` を持つのは assistant / user / stream_event / tool_progress だけで、system のメッセージは持たない (`sdk.d.ts` の各 system の型)。つまり subagent の中の圧縮の境界が親の帰属つきで届くかは型からは保証されない。帰属の無い system は主ループのものとして扱うしかない (今どおり)。帰属つきで届いたときに取り違えない規則だけを置き、届くかは quickstart V-5 で記録する。過去ログは `getSubagentMessages` が user / assistant の行だけを返す (`sdk.mjs:202` の `JP()`) ので、subagent の圧縮の境界は出ない (spec Assumptions)
- **Alternatives**: system にも帰属を推測する (届いた順で直前の subagent に入れる。順番は保証されない) / 帰属つきの Hook・task を入れ子の system-event の part にする (`hook_started` と `hook_response` の合成を入れ子の中にも組むことになり、SDK 0.3.270 では通らない経路のために合成が 2 つになる) / 捨てる (最初の版。spec の「入れ子だけに描く」と食い違い、Hook の失敗が見えなくなる)

## R-10 入れ子の中の表示 (FR-009 / FR-011 / US-3 AC1・AC5)

- **Decision**: Subagent の表示 (`subagent.aui.tsx`) の入れ子の tool-call を、今の簡易な描画 (tool 名・`ToolResultMarks`・結果の `pre`) から、主ループと同じ tool の表示の振り分け (`tool-registry.aui.tsx` の完全一致の表 → MCP → ToolFallback) に替える。tool の表示は props だけで描く (useAuiState を使わない) ので、`convert.ts` の tool-call の part を props に写す関数を export して共有する。入れ子の深さは React の context で渡し、`VISUAL_MAX_DEPTH = 3` を超えたら今の簡易な描画に倒す。入れ子の text は markdown の本文の共有の部品 (`TextMessagePartProvider` + `MarkdownText` を包む) で描き、thinking は今の Reasoning の表示で描く
- **Rationale**: US-3 AC1 は「主ループと同じ表示」を求める。O-6 の結果待ち・結果不明の印 (`toolResultState`) は thread の context から引くので、入れ子の tool も同じ context の中にあれば同じ規則が当たる (AC5)。`TextMessagePartProvider` の import は今 `agent-plan.aui.tsx` だけに固定されている (`agent-plan.aui.test.tsx:134`)。共有の部品を作り、固定の対象をその部品に移す (Agent plan もその部品を使う)
- **確かめること (plan RK-05)**: registry の表示と Reasoning が、message の part の context の外 (入れ子) で描けるか。実装の最初に component テストで確かめる。描けない表示は今の簡易な描画に倒す
- **依存の向き** (design-gate H-06): `tool-registry.aui.tsx:12` が Subagent を import し、`thread.aui.tsx:20` が registry を import している。`subagent.aui.tsx` から registry や `thread.aui.tsx` の表 (`SYSTEM_EVENT_ICONS`) を import すると循環になり、`.dependency-cruiser.js:77-81` の `no-circular` (AD-023 §7) で落ちる。振り分けは `subagent.aui.tsx` が定義する context に registry が Provider で注入する (data-model §3.3)。表を別ファイルに切り出す案は、registry と Subagent が同じ表を参照すると表のファイルが Subagent を import するのでやはり循環になるため採らない
- **Alternatives**: 入れ子は今の簡易な描画のまま (AC1 の「主ループと同じ表示」を満たさない)

## R-11 過去ログの subagent の本文 (FR-010 / U-8 / AD-055)

- **Decision**: `read-transcript.ts` は `getSessionMessages` の後に `listSubagents(sessionId)` を呼び、先頭から 32 件の agentId について `getSubagentMessages(sessionId, agentId, { limit: 500 })` を呼ぶ。読んだ記録の列を domain の `toTranscriptMessages(records, subagents)` に渡し、domain が各 subagent の記録の `parent_tool_use_id` で親の `Agent` の呼び出しに入れ子にする。1 つの subagent の失敗はその subagent を捨てるだけで、過去ログ全体の frame は `messages` のまま。`listSubagents` 自体の失敗は subagent を 0 件として扱う
- **SDK の事実** (`.needs-input.md` の Q1 の調査。回答 A で採用):
  - `getSessionMessages` の `SessionMessage` (`sdk.d.ts:5903-5916`) は agentId を持たない。主のセッションの経路は sidechain の行を落とす。agentId を構造で持つ `AgentOutput.agentId` (`sdk-tools.d.ts:103-105`) は実行中の `SDKUserMessage.tool_use_result` (`sdk.d.ts:5709`) だけ
  - `listSubagents(sessionId, { dir })` (`sdk.d.ts:1057`) は `string[]` (agentId の列)
  - `getSubagentMessages(sessionId, agentId, { dir, limit, offset })` (`sdk.d.ts:844`) は meta ファイルの `toolUseId` を各メッセージの `parent_tool_use_id` に、`parentAgentId` を `parent_agent_id` に入れる (`sdk.mjs:202` の `JP(e,t,n,r)` が user / assistant の行を `bk(l, TZ(toolUseId), parentAgentId)` で写す)。subagent のファイルは入れ子の `agentRelPath` の下にもありうる
- **結び方**: 親は SDK が付ける `parent_tool_use_id` だけで決める。`listSubagents` の列挙の順番には頼らない (列挙の順を入れ替えても結果が同じことを単体で固定する。SC-003)。tool の結果の文面 (モデル向けの agentId の後置き) を読まない
- **合成の規則** (正本は data-model §3): 主の記録を先に変換し、subagent の記録の列を「親が見つかったものから」繰り返し入れる (多段の subagent は親の subagent が入った後に親が見つかる)。進まなくなったら止め、親の見つからない列は捨てる (主ループに平らに出さない。主の記録の孤児の規則と違うのは、列挙で読んだ記録は会話の位置を持たないため)。親の呼び出しに inline の子が既にあれば重ねない。主の記録と同じ uuid の記録は捨てる
- **Alternatives**: AD-055 を取り下げる (B。過去ログの入れ子が空のまま) / 構造の agentId が来たときだけ呼ぶ (C。SDK 0.3.270 では呼ばれない) — どちらも `.needs-input.md` の Q1 で退けた

## R-12 項目 14 の呼び出しごとのファイルの制限 (FR-013 / SC-004)

- **Decision**: `scripts/constitution/allowlists.mjs` に `AGENT_SDK_CALL_FILES` (`{ listSubagents: ['src/agents/read-transcript.ts'], getSubagentMessages: ['src/agents/read-transcript.ts'] }`) を足し、`AGENT_SDK_ALLOWED_CALLS` を 5 つにする。`check.mjs` の項目 14 (`:702-709`) は、許可の名前でも `AGENT_SDK_CALL_FILES` に載っていて、ファイルが列に無く、呼び出し形が当たるなら違反にする。**import の読み方も直す** (design-gate H-10): 今は `:687-689` が 'g' フラグなしの `exec` で 1 つ目の名前付き import しか読まず、`:690-700` が `as` の後のローカル名で照合する。そのため (a) SDK を既に import しているファイルの 2 つ目の import 文で `getSubagentMessages` を呼ぶ、(b) `getSubagentMessages as getSessionMessages` と許可の名前の別名で呼ぶ、の 2 つの形が抜ける。ファイル中のすべての名前付き import を集め、(import した名前, ローカル名) の組で、許可リストと `AGENT_SDK_CALL_FILES` は import した名前で、呼び出し形はローカル名で照合する。fixture は `tests/rule-fixtures/a-direct/` に 4 本 (`listSubagents` と `getSubagentMessages` を `src/agents/__rulecheck__/` で呼ぶ 2 本と、(a) / (b) の形の 2 本) と `expected.mjs` の行。`UNDETECTED_NOTES['sdk-forbidden-call-alias']` の「許可は query/listSessions/getSessionMessages の 3 件」を 5 件に直す
- **Rationale**: 今の項目 14 は binding の名前だけを見て、ファイルを問わない (`src/agents/` のどこでも許可の名前は呼べる)。AD-055 Decision 1 は 2 つを `read-transcript.ts` だけに許すので、ファイルの制限が要る。`AGENT_SDK_IMPORT_DIRECTORIES` の注記 (`allowlists.mjs:355-361`) は「置き場と呼べるものを 1 つのリストで兼ねさせない」と書く。新しい表はどちらとも別の 3 つ目で、既存の 2 つの意味を変えない。既存の 3 つの API はファイルの制限を持たないまま (読み替えない)
- **Alternatives**: 制限を付けずに 5 つに広げる (AD-055 Decision 1 の「`read-transcript.ts` だけ」が機械で守られない) / 3 つの既存の API にも制限を付ける (AD-034 / AD-036 の決定を広げて読み替える。本 feature の範囲の外)

## R-13 `QUERY_OPTION_KEYS` の固定と O-10 との合流 (FR-001 / FR-007 / FR-013)

- **Decision**: `QUERY_OPTION_KEYS` (`session-core.ts:48-57`。8 キー) に `includeHookEvents` / `forwardSubagentText` を足し 10 キーに。pin テスト (`session-core.test.ts:198-211`) を 10 キーに。`BuiltQueryOptions` に `readonly includeHookEvents: true` / `readonly forwardSubagentText: true`。項目 16 は禁止のキーの表 (`QUERY_ESCALATION_OPTION_KEYS`) なので変えない (2 キーは escalation-neutral。AD-054 Decision 2)
- **Rationale**: O-10 (未マージの枝) も AD-041 (g) を読み替えてキーを足す。AD-054 Decision 4 のとおり、後にマージする PR が和集合で pin テストを直す
- **Alternatives**: なし (ADR の決定のとおり)

## R-14 対応表の書き換えと O-12 (FR-012 / FR-014 / U-1)

- **Decision**: data-model §4 の表のとおり。D 節の 3 行 (`docs/ui-coverage.md:180-182`) を `実装済み`、`get_hooks_listing` (`:223`) を `表示不要`、`background_tasks_changed` (`:68`) を `実装済み`、Tier B の `後続: O-11` の行を `後続: O-12`、F 節の Background runs / Agent handoff / Task card の備考を直す
- **Rationale**: 項目 21 (`check.mjs`) は割当先の feature が roadmap にあることを見るので、O-12 の行を roadmap に足す PR と同じ PR で書き換える (AD-044)

## R-15 過去ログの Hook / task の行 (V-4 の残り。義務の扱いの表)

- **Decision**: 変換は O-2 で実装済み (`transcript.ts:182-204` が `toSystemEventMessage` と `mergeSystemEvent` を通す)。過去ログの JSONL に `hook_*` / `task_*` の system の行が残るかは未確認のまま quickstart V-2 で記録する。残れば対応表の経路を「両方」に直す (FR-012)。R-04 の後から背景に移った task も同じ変換で作る
- **Rationale**: `getSessionMessages` の `includeSystemMessages: true` (`read-transcript.ts:70`) で system の行は返るが、CLI が Hook / task の出来事を JSONL に書くかは版による
