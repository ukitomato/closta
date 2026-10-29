# Data Model: 起動中のセッションの UI の手直し (O-13)

**Spec**: [spec.md](spec.md) / **Plan**: [plan.md](plan.md) / **Contracts**: [contracts/ipc-live-models.md](contracts/ipc-live-models.md) / **ADR**: [AD-065](../../docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md)

本書は規則の正本である。023 の [data-model.md](../023-session-launch-axes-and-operations/data-model.md) の §4 (制御の結果) と §5 (受け付けの判定) は変えずに使い、足す分だけを書く。

---

## 1. モデルの候補 (Key Entity「モデルの候補」)

セッションごとに、次のどちらか一方を候補にする。

| 由来 | 条件 | 候補 | 送る値 |
|---|---|---|---|
| `catalog` | `config.providerId !== null` | `switchableModels(provider.models, effort)` (023 のまま) | `sdkModelOf(entry)` = `inferenceProfileId ?? id` |
| `live` | `config.providerId === null` | `switchableModels(liveModels, effort)` | `entry.id` (= `ModelInfo.value`) |

- 由来はセッションの起動の設定 (`providerId`) で決まり、実行中に変わらない
- 表示は `displayName`。今のモデルの値は `currentModelId ?? config.modelId` (023 のまま)。既定 (null) のときは「既定のモデル」(`LIVE_SETTING_LABELS.defaultModel`) を選べない先頭の項目として出す (023 のまま)

### 1.1 `LiveModelEntry` (一覧の 1 項目)

`ModelEntry` (`src/domain/provider/types.ts`) の部分集合の形で持つ。新しい型を立てず、`ModelEntry` をそのまま使う。

| フィールド | 由来 (`ModelInfo`) | 規則 |
|---|---|---|
| `id` | `value` | `isValidModelId` を通る |
| `displayName` | `displayName` | `isValidModelEntry` の規則 (空でない文字列) |
| `supportedEffortLevels` | `supportedEffortLevels` | 無ければ持たない。`EffortLevel` の 5 値の外を含めば項目ごと捨てる |

`description`・`resolvedModel`・`supports*` は写さない (表示に使わない)。

### 1.2 一覧の正規化 `normalizeLiveModels(raw: unknown): readonly ModelEntry[] | null`

置き場所は `src/domain/provider/model-catalog.ts`。I/O を持たない純関数で、**セッションスレッドだけが使う** (入力は SDK の `ModelInfo` の形。§4)。main は §1.3 を使う。

1. `raw` が配列でなければ `null`
2. 各要素を §1.1 の形に写す (オブジェクトでない・`value` が文字列でない要素は捨てる)
3. `isValidModelEntry` を通らないものを捨てる
4. 同じ `id` は先のものを残す
5. 先頭から `MAX_CATALOG_MODELS` (64) 件で切る

戻り値の配列が空でも `null` にしない (「空」と「失敗」を分ける。§3.2)。

### 1.3 境界の再検査 `normalizeLiveModelEntries(raw: unknown): readonly ModelEntry[] | null`

置き場所は §1.2 と同じ。main の `decodeSupervisorEvent` が `models-result` の `models` に当てる。入力はセッションスレッドが送った **`ModelEntry` の形** (`id` / `displayName` / `supportedEffortLevels`) で、`ModelInfo` の形 (`value`) を期待しない。

1. `raw` が配列でなければ `null`
2. `isValidModelEntry` を通らない要素と、`inferenceProfileId` を持つ要素 (§1.1 の形の外) を捨てる
3. 同じ `id` は先のものを残す
4. 先頭から `MAX_CATALOG_MODELS` (64) 件で切る

- §1.2 の出力をそのまま通すと、件数も中身も変わらない (`normalizeLiveModelEntries(normalizeLiveModels(x))` が `normalizeLiveModels(x)` と等しい)。この性質を層横断のテストで固定する (contracts のテストの観点)
- 戻り値の配列が空でも `null` にしない (§1.2 と同じ)

## 2. main の稼働中の行 (`Entry`) に足すもの

`src/main/app/session-launch-service.ts` の `Entry` に 1 つ足す。

| フィールド | 型 | 初期値 | 更新 |
|---|---|---|---|
| `liveModels` | `readonly ModelEntry[] \| null` | `null` | `models-result` を受けたときに置き換える (失敗は置き換えない) |

- 永続化しない。再開・再起動の行は `null` から始まる
- `commit` の `{ ...prev, ...status, threadAlive }` で保たれる (023 の `name` と同じ)
- 値はログに出さない。件数と、捨てた項目の数だけを出す (`[session] live-models count=N dropped=M`)

### 2.1 一覧の待ち (`PendingModels`)

023 の `PendingControl` と別の表に持つ。

| フィールド | 意味 |
|---|---|
| `sessionId` / `generation` | 照合 (023 と同じ) |
| `resolve` | `listSessionModels` の Promise を解く |
| `timer` | `CONTROL_RESULT_TIMEOUT_MS` (10 秒) の期限 |

- `changing` は立てない (取得は設定を変えない)
- 同じセッションで待ちがある間の 2 回目の要求は、同じ待ちに相乗りする (Promise を共有する)。制御は 1 回だけ送る
- スレッドの終了 (`onThreadEnded`) とセッションの消滅では、待ちを `session-ended` で解く (023 の `settleEnded` と同じ)

## 3. 受け付けの判定と結果

### 3.1 `listSessionModels(sessionId)` の判定 (上から順)

| 条件 | 結果 |
|---|---|
| 未知の `sessionId` | `{ ok: false, reason: 'unknown-session' }` |
| `config.providerId !== null` | `{ ok: false, reason: 'invalid-value' }` (カタログの側を使う) |
| `liveSettingBlocker('model', { ...row, changing: false })` が null でない | その理由 (`not-running` / `not-ready`) |
| スレッドが終わっている | `{ ok: false, reason: 'session-ended' }` |
| 上のどれにも当たらない | 制御 `list-models` を送って待つ |

### 3.2 結果

| セッションスレッドの答え | `Entry.liveModels` | `listSessionModels` の戻り値 |
|---|---|---|
| `models: ModelEntry[]` (空を含む) | 置き換える | `{ ok: true, models: switchableModels(liveModels, effort).map(toOption), reportedCount: liveModels.length }` |
| `models: null` (呼べない・例外・形の外) | 変えない | `{ ok: false, reason: 'rejected' }` |
| 期限切れ | 変えない | `{ ok: false, reason: 'timeout' }` |

`toOption = (m) => ({ id: m.id, displayName: m.displayName })`。effort は返さない (絞り込みは main で済ませる)。

`reportedCount` は effort で絞る前の件数 (main の再検査 §1.3 の後)。`models` が空のときに、renderer が次の 2 つを分けるために使う:

| `models` | `reportedCount` | 意味 | 表示 (§6.3) |
|---|---|---|---|
| 空 | `0` | Claude Code が空の一覧を返した | `emptyModelList` |
| 空 | `> 0` | 一覧はあるが、起動の effort が効くモデルが無い | `noModelForEffort` |

### 3.3 `setModel` の既定の Provider の分岐 (023 の §5.2 に足す)

023 の判定 (`liveSettingBlocker('model', row)`) を通った後に、次の順で見る。

1. `providerId === null` のとき
   - `entry.liveModels === null` なら `invalid-value` (まだ一覧を受け取っていない)
   - `switchableModels(entry.liveModels, entry.effort)` に `modelId` が無ければ `invalid-value`
   - あれば `requestControl(sessionId, { kind: 'set-model', model: target.id })`
2. `providerId !== null` のときは 023 のまま (カタログと照合して `sdkModelOf(target)`)

セッションスレッドの送る前の検査 (起動の `model` と同じ文字種) は 023 のまま。

## 4. セッションスレッドの `list-models`

置き場所は `src/agents/sdk-agent-session.ts` の `controlSink`。

1. `closing` か `queryHandle === null` なら `post({ kind: 'models-result', requestId, models: null })`
2. `queryHandle.supportedModels()` を待つ。例外は `models: null` にする (例外の文言は運ばない)
3. 返り値を `normalizeLiveModels` (§1.2) に通す。`null` (配列でない) は `models: null`。送るのは `ModelEntry` の形で、main は §1.3 で再検査する
4. `post({ kind: 'models-result', requestId, models })`

- 呼ぶのは要求 1 つにつき 1 回。キャッシュしない (main が持つ)
- `queryHandle` の型は `Pick<Query, 'interrupt' | 'setPermissionMode' | 'setModel' | 'supportedModels'> & AsyncIterable<SDKMessage>`
- `Query` の分類 (`sdk-agent-session.ts:145`) に `type QueryLiveReadMethod = 'supportedModels'` を立て、`QueryUnusedReadMethod` から外す。`QueryClassifiedMethod` に足す

## 5. 権限モードの名前の表 (Key Entity「権限モードの名前の表」)

置き場所は `src/renderer/src/features/chat/labels.ts`。

```ts
/** 照合した Claude Code の版 (AD-065 Decision 3)。版を上げたら docs/ui-coverage.md の手順で見直す。 */
export const CLAUDE_CODE_PERMISSION_MODE_NAMES_VERSION = '2.1.312'

export const PERMISSION_MODE_NAMES: Readonly<Record<PermissionModeKey, string>> = {
  default: 'Manual',
  plan: 'Plan',
  dontAsk: "Don't Ask",
  acceptEdits: 'Accept edits',
  bypassPermissions: 'Bypass Permissions',
  auto: 'Auto',
  unknown: '不明なモード'
}
```

- 読む側は変えない (帯・「概要」・選択・transcript の行・`PERMISSION_MODE_LABELS`)。FR-009 の「1 か所」は今も満たしている
- `PERMISSION_MODE_DESCRIPTIONS` (`features/session/labels.ts:461`) と、それを描く `LaunchDialog.tsx:765` の段落を消す (FR-008)
- 名前を囲む文 (例: `UNSAFE_MODE_BANNER_LABELS.unsafeModeBanner(name)` の「アプリが選んでいない権限モード (「…」) で動いています。」) は日本語のまま

## 6. composer の周りの選択

### 6.1 `ComposerExtensions` に足すもの

`src/renderer/src/features/chat/composer-extensions-context.ts`。

| フィールド | 型 | 意味 |
|---|---|---|
| `settings` | `ReactNode \| undefined` | `ComposerAction` の左の群に描く。無ければ描かない (過去の会話・テストの harness) |

`thread.aui.tsx` の `ComposerAction` は `useComposerExtensions().settings` を左の群 (`ComposerAddAttachment` の右) に置くだけで、中身を知らない。

### 6.2 LivePane が渡す中身

`LiveSessionPane` (`features/session/LivePane.tsx`) が `LiveSettingsControls` を組んで `settings` に渡す。入力は 023 の `CenterHeaderLive` の同じ値で、`CenterPane.tsx:113` が組んでいる値を `LiveSession` から直接読む。

| 入力 | 由来 |
|---|---|
| `permissionMode` | `meters.permissionMode ?? config.permissionMode` |
| `row` | `{ state: runState, claudeAlive: !ended, hasConversation: resumable, changing: changing !== null }` |
| `model.options` / `model.available` | §1 の由来ごと。`live` は §6.3 の状態 |
| `model.value` | `currentModelId ?? config.modelId` |
| `onSelect*` | `session.setPermissionMode` / `session.setModel` |

確定 (マウスの選択・Enter・blur で値が変わったとき) の後に `handOffFocusToComposer` で composer の入力にフォーカスを戻す。blur での確定は、フォーカスがすでに別の要素に移っているので戻さない (利用者が移した先を奪わない)。

### 6.3 既定の Provider の一覧の状態 (renderer)

置き場所は running-session-store のセッションごとの状態 `liveModels`。

| 状態 | 意味 | 選択の表示 |
|---|---|---|
| `{ phase: 'idle' }` | まだ聞いていない | 押せない。理由は blocker (最初の応答の前) か「モデルの一覧を読み込み中」 |
| `{ phase: 'loading' }` | 要求中 | 押せない。「モデルの一覧を読み込み中」 |
| `{ phase: 'ready', options, reportedCount }` | 受け取った (空を含む) | 空なら押せない。`reportedCount === 0` なら `LIVE_SETTING_LABELS.emptyModelList`、`> 0` なら `LIVE_SETTING_LABELS.noModelForEffort` (§3.2) |
| `{ phase: 'failed', reason }` | 失敗 | 押せない。`LIVE_MODEL_LIST_FAILURE_LABELS[reason]` (§9。`LIVE_SETTING_LABELS.failure` は設定の種類 (`LiveSettingKind`) をキーにした変更の失敗の表で、理由をキーにしないので使わない) |

- `idle` から要求に移るのは、選択が描かれていて `liveSettingBlocker('model', row)` が `busy` 以外で null のときに 1 回だけ (effect)
- `failed` からは、選択にフォーカスが入ったときに 1 回だけ聞き直す
- `ready` の後は聞き直さない (Claude Code の答えはセッションの間は変わらない前提。[ASSUMED]。変わる事例が quickstart で見つかれば、フォーカスごとに聞き直す形に改める)
- Provider のあるセッションは この状態を使わない (023 の `useProviders` のまま)

### 6.4 中央のヘッダ

`CenterHeader.tsx` から `LiveSettingsSlot` を外す。`CenterHeaderLive` からは、選択だけが使うフィールド (`configPermissionMode` / `onSelectPermissionMode` / `providerId` / `effort` / `onSelectModel`) を外す。`settingRow` と `name` / `onRename` は改名が使い、`currentModelId` は目盛りが使うので残す。`LiveSettingError` (直前の変更の失敗の 1 行) はヘッダの下に残す。

## 7. アプリのコマンド (Key Entity「アプリのコマンド」)

置き場所は `src/renderer/src/features/chat/app-commands.ts` (純関数)。

```ts
export type AppCommandName = 'resume'
export const APP_COMMANDS: readonly { readonly name: AppCommandName }[] = [{ name: 'resume' }]
/** 送信された入力がアプリのコマンドか。前後の空白を除いて `/resume` か `/resume <引数>`。引数は捨てる。 */
export function parseAppCommand(text: string): AppCommandName | null
/** 候補の合成。アプリのコマンドを先に置き、同名の Claude Code のコマンドを落とす。 */
export function mergeCommandCandidates(
  reported: readonly SlashCommandSource[] | null
): readonly SlashCommandSource[]
```

- 判定の正規表現は `/^\/resume(?:\s|$)/u` (前後の空白を除いた入力に対して)。`/resumeX` は当たらない。大文字の `/Resume` も当たらない (Claude Code のコマンドは小文字)
- 候補の説明は `APP_COMMAND_LABELS.resume` (「同じフォルダの過去のセッションを選んで再開する (アプリのコマンド)」)。`argumentHint` は空
- 候補の並び (`searchSlashCommands` の昇順) と 20 件の上限は変えない

### 7.1 横取り

| 入口 | 置き場所 | 規則 |
|---|---|---|
| 実行中の送信 (steer / enqueue) | `composer-queue-adapter.ts` の `createCappedAdapter(base, onResult, maxItems, intercept?)` | `intercept(text)` が true なら base を呼ばず、`onResult` も呼ばない (拒否の表示を出さない) |
| 待機中の送信 | `RunningSessionsProvider.tsx` の `onNew` | 同じ `intercept` を先に通す |

`intercept` は `running-session-store.ts` の `createQueue` で組む: `parseAppCommand(text) === 'resume'` なら `patch(sessionId, { resumePicker: true })` して true を返す。

### 7.2 選ぶ画面の状態

| 状態 | 置き場所 | 意味 |
|---|---|---|
| `resumePicker: boolean` | running-session-store のセッションごとの状態 | 開いているか。閉じると false |

選ぶ画面 (`ResumePickerDialog`) の中の状態 (検索の文字列・選択中の行・判定の待ち・失敗の理由) は部品のローカルに持つ。

### 7.3 選ぶ画面の候補

- 由来は `useSessionsStore((s) => s.index)` の `groups` のうち、`kind === 'folder' && folderId === live.config.folderId` のもの
- 1 行は `{ targetKey, sessionId, title: rowTitleText(summary), time: formatSessionTime(summary.lastModified) }`
- 並びはグループの中の順 (過去の一覧と同じ)
- 絞り込みは `features/search/text-search.ts` の `matchesAllTerms` (O-3 のコマンドパレットと同じ) を題に当てる
- 索引が `null` か `complete === false` で候補が 0 なら「読み込み中」と出し、`complete` で 0 なら「このフォルダに過去のセッションはありません」と出す

### 7.4 選んだ後 (`startPastResume`)

置き場所は `src/renderer/src/features/session/past-resume.ts`。`PastResumeBar` と共有する。

1. `resolvePastResume(targetKey, conversationId)` を呼ぶ
2. ok なら次の順に呼ぶ: `store.openResume({ source: { kind: 'past', targetKey, conversationId }, fixed: { folderId, runtimeId, providerId }, initial: null, initialOrigin: 'manual', replaces: null })`、`setLaunchOpen(true)`、選ぶ画面を閉じる
3. ok でなければ選ぶ画面を開いたまま `RESUME_UNAVAILABLE_LABELS[reason]` を出す (行の下に `role="alert"` で 1 行)

閉じたとき (選ばずに閉じた・Esc) は composer の入力にフォーカスを戻す。再開ダイアログに進んだときは、ダイアログのフォーカスの規則 (021) に任せる。

## 8. 右のパネル

| 部品 | 変更 |
|---|---|
| `RightPanel.tsx` の tablist | `flex min-w-0 flex-1 gap-1 overflow-x-auto` とスクロールバーを細くするクラス |
| 各タブ | `shrink-0 whitespace-nowrap` |
| 選択・フォーカスの移動 | 移った先のタブに `scrollIntoView({ block: 'nearest', inline: 'nearest' })` |
| `UsageTab.tsx` の `Items` | `grid-cols-[minmax(0,1fr)_auto]`。`dt` は `min-w-0 break-words`、`dd` は `whitespace-nowrap tabular-nums text-end` |
| トークンの内訳 | 入れ子の `Items` を親の `dd` の中から出し、`col-span-2` の行に置く (字下げで親子を示す) |

ペインの幅 (`SHELL_WIDTHS.panel` = 320px) は変えない。

## 9. 文言 (Principle XV)

足す文言はすべて文言の表に置く (直書きを増やさない)。

| 表 | キー | 文言 |
|---|---|---|
| `features/session/labels.ts` `LIVE_SETTING_LABELS` | `loadingModelList` | モデルの一覧を読み込み中 |
| 同上 | `emptyModelList` | Claude Code がモデルの一覧を返しませんでした |
| 同上 | `noModelForEffort` | 起動の effort が効くモデルが Claude Code の一覧にありません |
| `features/session/labels.ts` `LIVE_MODEL_LIST_FAILURE_LABELS` (`satisfies Record<LiveSettingFailure, string>`。`LIVE_SETTING_FAILURES` の 11 値を網羅する) | `unknown-session` | セッションが見つからないため、モデルの一覧を読み込めませんでした |
| 同上 | `invalid-value` | このセッションでは Claude Code にモデルの一覧を聞けません |
| 同上 | `not-running` | Claude Code が動いていないため、モデルの一覧を読み込めませんでした |
| 同上 | `not-ready` / `no-conversation` | 最初の応答の後にモデルの一覧を読み込みます |
| 同上 | `busy` | 変更中のため、モデルの一覧を読み込めませんでした |
| 同上 | `turn-running` | 応答の実行中のため、モデルの一覧を読み込めませんでした |
| 同上 | `rejected` | Claude Code がモデルの一覧に答えませんでした |
| 同上 | `session-ended` | セッションが終わったため、モデルの一覧を読み込めませんでした |
| 同上 | `timeout` | モデルの一覧の読み込みが時間内に終わりませんでした |
| 同上 | `write-failed` | モデルの一覧を読み込めませんでした |
| `features/chat/labels.ts` `APP_COMMAND_LABELS` | `resume` | 同じフォルダの過去のセッションを選んで再開する (アプリのコマンド) |
| `features/session/labels.ts` `RESUME_PICKER_LABELS` | `title` / `search` / `empty` / `noMatch` / `loading` / `close` | 過去のセッションを再開 / セッションを検索 / このフォルダに過去のセッションはありません / 「{query}」に合うセッションがありません (関数) / 読み込み中 / 閉じる |

`noModelList` (「この Provider にはモデルの一覧がありません」) は、Provider のカタログが見つからないときの表示として残す。
