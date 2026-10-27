# Data Model: 実行中のセッションの操作 (X-6 の最初の分割)

**Date**: 2026-10-27 (`/cl-plan`) | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Contracts**: [contracts/ipc-live-session-settings.md](./contracts/ipc-live-session-settings.md)

本ファイルが規則の正本である。plan と tasks はここを参照し、規則を書き写さない。行番号は main 1a7d8b4 のもの。

## §0 変えないもの

- `QUERY_OPTION_KEYS` (12。`session-core.ts`)・`SessionLaunchConfig` の 6 軸・`SessionEvent` の種類・`METER_UPDATE_TYPES`・`LAUNCH_FAILURE_REASONS` (19)・`SessionStatusUpdate` の形
- `buildQueryOptions` と起動の権限モードの検査 (AD-041 (a))。安全 3 値 (`SAFE_PERMISSION_MODES`) の集合
- プリセット・`launch-usage.json`・X-9 の再開の初期値 (`LiveSessionState.config`)。変更した値をどこにも書き戻さない (FR-014)
- 停止・閉じる・終了・中断の操作の置き場 (稼働中の行と LivePane)
- composer (U-7)

## §1 セッション制御の追加 (`src/domain/session/agent-session.ts`)

`SessionControl` に 2 つの種類を足す (今は 6 種類 → 8 種類)。

| kind | フィールド | 値の検査 (`decodeSessionControl`。`session-core.ts:462-485`) |
|---|---|---|
| `set-permission-mode` | `requestId: string` / `mode: SafePermissionMode` | `requestId` は `isValidSessionId` (UUID)。`mode` は `isSafePermissionMode` (`@domain/session/launch-config`) |
| `set-model` | `requestId: string` / `model: string` | `requestId` は同上。`model` は `isValidModelId` (`@domain/provider/model-catalog`。起動の `model` と同じ文字種) |

- 名前の変更は `SessionControl` に入れない — セッションスレッドを通らない (§6)
- `AgentSession` の操作の語彙 (`agent-session.ts` の interface) に `setPermissionMode(requestId, mode)` と `setModel(requestId, model)` を足し、`SessionControl` と一致させる (今の規則)
- `acceptsWhileClosing` (`session-core.ts`) は `kill` だけのまま。終了処理の中の `set-*` は §3.2 のとおり失敗を返す

## §2 切り替えられるモデル (`src/domain/provider/model-catalog.ts` に足す純関数)

```ts
switchableModels(models: readonly ModelEntry[], effort: EffortLevel | null): readonly ModelEntry[]
```

- `effort === null` ならカタログの全部 (並びはカタログの順)
- `effort !== null` なら `(m.supportedEffortLevels ?? []).includes(effort)` のものだけ (`launch-resolution.ts:141-149` の起動の規則と同じ)
- renderer の選択肢 (§8) と main の検証 (§5.2) の両方がこの関数を使う

## §3 セッションスレッド (`src/agents/sdk-agent-session.ts`)

### §3.1 `Query` の型

- `queryHandle` の型 (`:456`) を `(Pick<Query, 'interrupt' | 'setPermissionMode' | 'setModel'> & AsyncIterable<SDKMessage>) | null` にする
- `Query` のメソッドの分類 (`:154-188`) に `QueryLiveSettingMethod = 'setPermissionMode' | 'setModel'` を足し、`QueryMutationMethod` から 2 つを外す (20)。網羅の検査は `interrupt` / `QueryLiveSettingMethod` / `QueryMutationMethod` / `QueryUnusedReadMethod` の 4 つの和が `Query` の自前のメソッドの全部であることを見る
- 冒頭の注記「`Query` のメソッドは `interrupt()` だけ (P3)」を「`interrupt()` と、安全 3 値の権限モード・カタログのモデルの切り替え (AD-062)」に直す

### §3.2 制御シンク (`controlSink`。`:745-805`)

| 条件 | 振る舞い |
|---|---|
| `closing` (終了処理の中) で `set-*` を受けた | `control-result` を `ok: false` で送る (`:746` の早期 return の前に判定する)。SDK を呼ばない |
| `queryHandle === null` | `ok: false` |
| `set-permission-mode` | `queryHandle.setPermissionMode(assertSafePermissionMode(control.mode))` を呼ぶ。成功したら `signals.onPermissionModeApplied(control.mode)` (§3.3) のあとで `ok: true`、reject なら `ok: false`。状態機械の遷移はしない |
| `set-model` | `queryHandle.setModel(control.model)` (引数を省かない)。成功で `ok: true`、reject で `ok: false` |

- 結果は `post({ kind: 'control-result', requestId, ok })` で調停役スレッドへ送る (`:912` の `conversation` と同じ経路)
- reject の理由 (例外の文字列) は送らない・ログに出さない
- 状態 (running / done …) で拒否しない — 受け付ける状態の判定は main が行う (§5.1)。セッションスレッドは SDK が拒否したらそれを返す

### §3.3 live-signals (`src/agents/live-signals.ts`)

- `LiveSignals` に `onPermissionModeApplied(mode: SafePermissionMode): void` を足す。中身は `observePermissionMode(mode)` (`:414`) をそのまま呼ぶ — 基準と違えば基準を更新し、`meter` の `permission-mode` と権限モードの行 (`mode:<seq>`・`changed`) を送る
- この後に Claude Code が `status` / `init` で同じ値を報告しても、基準と同じなので二重に出ない

## §4 結果の待ち (`src/main/app/session-launch-service.ts`)

### §4.1 Entry に足すもの

```ts
interface Entry extends RegistryStatus {
  // 既存: threadAlive / conversationId / axes
  readonly effort: EffortLevel | null   // 起動の effort (モデルの検証。§5.2)
  readonly name: string | null          // 付けた名前 (FR-012)。永続化しない
  readonly changing: LiveSettingKind | null  // 結果を待っている変更の種類 (§5.1 の busy は `changing !== null`。§4.3 の保留は `=== 'name'`)
  readonly heldPrompts: readonly SessionControl[]  // §4.3 で保留した `send-prompt` (届いた順)
}
```

- `commit` (`:195-212`) は受信規則の結果に無い値を元のエントリから引き継ぐ。足した 4 つも引き継ぐ (今は `conversationId` と `axes` を名指しで写しているので、`{ ...prev, ...status, threadAlive }` の形に直して漏れを無くす)
- 起動 (`:328`) で `effort: config.effort`・`name: null`・`changing: null`・`heldPrompts: []`

### §4.2 待ちの表

- `pending: Map<requestId, { sessionId, generation, resolve, timer }>`
- 解く条件 (どれか 1 つ。2 回目以降は無視):

| 出来事 | 結果 |
|---|---|
| `onControlResult(generation, sessionId, requestId, ok)` で一致 | `ok ? { ok: true } : { ok: false, reason: 'rejected' }` |
| `onThreadEnded` / `onExit` でそのセッション (世代) が終わった | `{ ok: false, reason: 'session-ended' }` |
| `killAll` / `dispose` | `session-ended` |
| 期限 10 秒 (`CONTROL_RESULT_TIMEOUT_MS`。[ASSUMED: 数値デフォルト値]) | `timeout` |

- 解いたら Entry の `changing` を null に戻す。知らない `requestId`・世代の違う結果は捨てる

### §4.3 改名の間のプロンプトの保留 (spec U-9 / FR-010。design-gate H-005)

改名を受け付けてから結果が出るまでの間にターンが始まると、`claude` の追記と custom-title の追記が同じ JSONL で重なる。main の `control(sessionId, control)` (`:369`) で次のとおり閉じる。判定の正本は main で、renderer と composer は変えない (U-7)。

| 条件 | 振る舞い |
|---|---|
| `control.kind === 'send-prompt'` かつ `entry.changing === 'name'` | supervisor へ送らず `heldPrompts` の末尾に足す。戻り値は `true` (受け付けた) |
| `endChange(sessionId, 'name')` (改名の結果。成功・`write-failed`・期限のどれでも) | `changing` を null に戻した後、`heldPrompts` を届いた順に `deps.connection.control` で送り、空にする。`threadAlive` でなければ送らずに捨てる |
| `onThreadEnded` / `onExit` / `killAll` / `dispose` でそのセッションが終わった | `heldPrompts` を送らずに捨てる |
| それ以外の制御 (`interrupt` / `end` / `kill` / 承認の応答ほか) | 今どおりすぐ送る (保留しない) |

- 保留の長さは最長で改名の期限 (§6.1 の 5。10 秒) で、main は数を数えない (プロンプトの数の上限はセッションスレッドのキューのまま)
- 改名の受け付けは `done` / `interrupted` だけ (§5.1) なので、保留の間に承認待ちは生じない
- 期限で子を止めた (§6.1 の 5) 後は、子の追記が途中で止まっていてもプロンプトを送る。止めた後に子が書き続けることは無い (残る窓は AD-062 Consequences の「応答待ちに入った直後」の 1 つだけ)
- ログに出すのは `[session] prompts held n=<数>` / `[session] prompts released n=<数>` だけ (プロンプトの本文を出さない)

## §5 main の受け付けの判定

### §5.1 状態の判定 (domain の純関数。`src/domain/session/live-settings.ts` を新設)

```ts
type LiveSettingKind = 'permission-mode' | 'model' | 'name'
liveSettingBlocker(kind, row: { state, claudeAlive, hasConversation, changing }): LiveSettingBlocker | null
```

- `row.changing` は真偽 (main は `entry.changing !== null`、renderer はストアの `changing !== null` を渡す)

| 条件 (上から順に見る) | blocker |
|---|---|
| `!claudeAlive` か 状態が `idle` / `error` | `not-running` |
| 状態が `launching` | `not-ready` |
| `changing` | `busy` |
| kind が `name` で `!hasConversation` | `no-conversation` |
| kind が `name` で状態が `running` / `awaiting_permission` | `turn-running` |
| それ以外 | `null` (受け付ける) |

- 権限モード・モデルは `running` / `awaiting_permission` / `interrupted` / `done` で受ける (research R-05)。名前は `done` / `interrupted` だけ
- renderer は同じ関数で押せる形と理由を決める (§8)。判定の正本は main (FR-010)

### §5.2 値の検証 (`src/main/app/validate.ts`)

| 要求 | 検証 | 外れたら |
|---|---|---|
| 権限モード | `sessionId` は UUID・`mode` は `isSafePermissionMode` | `invalid-value` (`setPermissionMode` は呼ばれない) |
| モデル | `sessionId` は UUID・`modelId` は `isValidModelId`。さらに service で、起動の Provider が null でなく、今の Provider の一覧にあり、`switchableModels(provider.models, entry.effort)` に `modelId` がある (Provider が null・消えた・選択肢が 0 のセッションは US-2 の対象外で、renderer は押せない形にする。spec U-10 / US-2 AC6) | `invalid-value` |
| 名前 | `sessionId` は UUID・`name` は §5.3 | `invalid-value` |

- 未知の `sessionId` (registry に無い) は `unknown-session`

### §5.3 名前の規則 (`src/domain/session/live-settings.ts`)

```ts
normalizeSessionName(raw: unknown): string | null
```

- 文字列でなければ null。前後の空白 (`String.prototype.trim`) を除いて 1〜100 文字 (UTF-16 のコード単位ではなく `Array.from` の数) [ASSUMED: 数値デフォルト値]
- 改行 (`\n` / `\r`)・制御文字 (`\p{Cc}`)・行と段落の区切り (` ` / ` `) を含めば null
- 通ったら trim した値を返す。renderer の入力の検証 (保存を押せるか) と main の検証が同じ関数を使う

## §6 改名の経路

### §6.1 流れ (main)

1. `ipc.ts` の `handle()` wrapper が送り元を検査し (外れたら既存どおり `rejected` で throw。contracts の共通の節)、`session-ipc.ts` の handler が UUID・`normalizeSessionName` を検査する
2. `session-rename-service.ts` (新設。状態を持たず、I/O は注入で受ける) が registry の行を引き、§5.1 (kind `name`) で判定する。受けたら `changing` を `'name'` にする (この間のプロンプトは §4.3 で保留される)
3. 会話の id と退避の表のレコード (`conversationRecord(sessionId)`) から列挙対象を決める: レコードの `targetKey` があればそれ、無ければ `resolveLiveTranscriptTarget(record)` (`live-transcript-target.ts` に切り出した 021 data-model §8.1 の規則)。決まらなければ `write-failed`
4. `transcriptTarget(targetKey)` で config ディレクトリの env を解き (WSL の所在が止まっていれば `write-failed`)、`buildTranscriptEnv` で env を作る
5. `rename-spawner.ts` が短命の子を起こし、`{ conversationId, name }` を 1 通送る。子の `{ ok }` の 1 通か、子の終わり・期限 (10 秒。[ASSUMED: 数値デフォルト値])・`dispose` で結果を決める。期限なら子を止める。子の追跡と後始末は §6.3
6. 成功なら registry の行の `name` を更新して `{ ok: true, name }`。失敗なら `name` は元のまま `{ ok: false, reason: 'write-failed' }`。どちらでも `endChange(sessionId, 'name')` で `changing` を戻し、§4.3 の保留したプロンプトを送る
7. 名前・会話の id・config ディレクトリをログに出さない。ログに出すのは `[session] rename ok` / `[session] rename failed` だけ

### §6.2 子 (`src/agents/rename-session.ts`)

- `process.parentPort` で 1 通を受け、形 (`isValidSessionId` と `normalizeSessionName` の結果と一致すること) を確かめてから `renameSession(conversationId, name)` を呼ぶ (`dir` は渡さない。research R-06)。結果を `{ ok: boolean }` の 1 通で返して終わる
- 2 通目以降は受けない。例外の文字列を返さない
- `AGENT_SDK_CALL_FILES` の `renameSession` の唯一のファイル

### §6.3 子の追跡と後始末 (`src/main/app/rename-spawner.ts`。AD-034 決定 2 の形。design-gate H-004)

AD-062 Decision 4 は改名の子を AD-034 決定 2 と同じ形で起こすとする。その形の条件 (クラッシュの封じ込め・window close / before-quit での終了・孤児の UNC ハンドルを残さない・同時数の上限) を満たすため、`rename-spawner.ts` が動いている子を持つ (`transcript-service.ts:14` / `:106-126` / `:131-138` の `active` と `dispose` と同じ形)。`session-rename-service.ts` は状態を持たないまま。

| 項目 | 振る舞い |
|---|---|
| 追跡 | 起こした子を `active: Map<launchId, child>` に入れ、子の終わり (自然終了・kill) で外す |
| 同時数の上限 | `MAX_CONCURRENT_RENAMES = 10` (セッションの同時実行数の上限と同じ値。[ASSUMED: 数値デフォルト値])。`active.size` が上限に達していたら子を起こさず、結果を `write-failed` で返す (transcript と違い、古い子を止めない — 書き込みの途中で止めないため)。同じセッションでは `changing` で 1 つ |
| `dispose(): number` | 以後の起動を断り (`write-failed`)、`active` の子を全部 kill し、待っている結果を `write-failed` で解く。kill を確かめられなかった子の数を返す |
| 結線 | `composition-root.ts` の `dispose` (`:507-509`) の合計に足す: `sessionsUnconfirmed + enumerator.dispose() + transcripts.dispose() + renames.dispose()`。window close / before-quit の今の経路に乗る |

- 期限で子を止める処理 (§6.1 の 5) と `dispose` は同じ kill を使う
- ログは理由のキーを持たない `[session] rename failed` のまま (理由の区別は Medium。gate の出力に残す)

## §7 Constitution 検証

| 項目 | 変更 |
|---|---|
| 14 | `AGENT_SDK_ALLOWED_CALLS` に `renameSession` (6)。`AGENT_SDK_CALL_FILES.renameSession = ['src/agents/rename-session.ts']`。SDK の値の import の検査と動的 import の検査を足す (research R-08) |
| 16 | `QUERY_MUTATION_METHODS` から `setPermissionMode` / `setModel` を外す (20)。SDK を保持するファイルの `.setPermissionMode(` (`?.` と計算キーの形を含む) の引数が `assertSafePermissionMode(` で始まり、その呼び出しが閉じてから `)` で終わること (`wrapperCallCompletes`) を見る。外れたら違反 |
| 7 | `PROCESS_SPAWN_MODULES` に `src/main/app/rename-spawner.ts` |
| 15 | `WSL_FREE_DIRECTORIES` に `session-rename-service.ts` / `rename-spawner.ts` / `live-transcript-target.ts` |
| depcruise | `services-not-to-io` の実名の列 (`.dependency-cruiser.js:254`) に `session-rename-service`。新しい規則 `agents-not-to-core` (research R-11) |

rule fixture:

| サンプル | 変更 |
|---|---|
| `a-direct/sdk-forbidden-call` | `renameSession` → `tagSession` |
| `a-direct/sdk-forbidden-call-alias` | `tagSession` の別名に差し替え、`detectors: ['constitution']`・`rules: ['#14']`。`UNDETECTED_NOTES` から外す |
| `a-direct/sdk-rename-session-outside` (新設) | `renameSession` を `rename-session.ts` 以外で呼ぶ → `#14` |
| `b-equivalent/sdk-query-mutation-method` | `setPermissionMode('default')` → `setMaxThinkingTokens(null)` |
| `b-equivalent/sdk-set-permission-mode-unwrapped` (新設) | `q.setPermissionMode(mode)` (包みなし) → `#16` |
| `b-equivalent/sdk-set-permission-mode-wrapper-escape` (新設) | `q.setPermissionMode(assertSafePermissionMode(a) || b)` (包みが閉じてから続く) → `#16` |
| `agents-builtin-via-get-builtin-module` | `detectors: ['depcruise']`。`UNDETECTED_NOTES` から外す |

## §8 renderer

### §8.1 ストア (`features/session/running-session-types.ts` / `running-session-store.ts`)

`LiveSessionState` に足す:

| フィールド | 型 | 意味 |
|---|---|---|
| `currentModelId` | `string \| null` | 成功したモデルの変更の値 (カタログの `id`)。無ければ null (起動の `config.modelId` を出す) |
| `name` | `string \| null` | main が返した名前 |
| `changing` | `LiveSettingKind \| null` | 結果を待っている変更の種類 |
| `settingError` | `LiveSettingKind \| null` | 直前の失敗 (1 行の表示)。次の変更の開始で消す |

- 権限モードの今の値は `meters.permissionMode ?? config.permissionMode` (§3.3 で成功が `meters` に入る)。失敗のときは `meters` が変わらないので元の値に戻る (FR-004)
- `config` は書き換えない (§0)

### §8.2 中央のヘッダ (`features/shell/CenterHeader.tsx`)

- `CenterHeaderLive` に `permissionMode` (今の値)・`modelId` (今の値)・`providerId`・`effort`・`name`・`row` (§5.1 の入力)・3 つの操作を足す
- 権限モードの選択: 選択肢は `SAFE_PERMISSION_MODES` の 3 つ。今の値が安全 3 値の外 (Claude Code の報告) なら選択肢の先頭に今の値を選べない項目として出す (`UnsafeModeBanner` はそのまま)
- モデルの選択: 選択肢は `switchableModels(provider.models, effort)`。今の値が null なら「既定」を選べない項目として出す。Provider が null・一覧に無い・選択肢が 0 なら選択は押せない (理由: 「この Provider にはモデルの一覧がありません」[ASSUMED: エラーメッセージ文言])
- 名前: 見出しのボタン (名前 `名前を変更`) を押すと 1 行の入力・「保存」・「キャンセル」。Enter は IME の変換中 (`isComposing`) なら確定しない。Escape で取り消し。保存は `normalizeSessionName` が null なら押せず、制限の文言を出す
- §5.1 の blocker があれば押せない形 (`aria-disabled` と理由の文言)。`changing` の間は 3 つとも押せない。状態ごとの押せる形は次の表 (quickstart V-4 はこの表で確かめる)

| 行の状態 | 権限モード | モデル | 名前を変更 |
|---|---|---|---|
| `idle` / `error` / `claudeAlive: false` (終わった行・失敗した行) | 押せない (`not-running`) | 押せない (`not-running`) | 押せない (`not-running`) |
| `launching` (起動の後、最初の応答の前) | 押せない (`not-ready`) | 押せない (`not-ready`) | 押せない (`not-ready`) |
| `running` / `awaiting_permission` (ターンの実行中・承認待ち) | 押せる | 押せる | 押せない (`turn-running`) |
| `done` / `interrupted` で会話の id なし | 押せる | 押せる | 押せない (`no-conversation`) |
| `done` / `interrupted` で会話の id あり | 押せる | 押せる | 押せる |
| `running` / `awaiting_permission` / `done` / `interrupted` で `changing !== null` (§5.1 の順で `not-running` / `not-ready` が先) | 押せない (`busy`) | 押せない (`busy`) | 押せない (`busy`) |

- モデルは上の表に加えて、Provider が null・一覧に無い・選択肢が 0 なら押せない (次の項。spec U-10 / US-2 AC6)
- 失敗は「権限モードを変更できませんでした」/「モデルを変更できませんでした」/「名前を変更できませんでした」をヘッダの下に `role="status"` で 1 行

### §8.3 見出しと稼働中の行

- 見出しと稼働中の行の題は `name ?? フォルダ名`
- `ContextCostMeter` に渡すモデル id は `currentModelId ?? config.modelId`
- 概要のタブ (`OverviewTab.tsx`) は、今の「現在の権限モード」の行 (`:109`。起動の値と違うときだけ出す) と同じ形で、`currentModelId` が起動の `modelId` と違うときに「現在のモデル」の行を出す (`specs/013-ui-app-shell/data-model.md:134` の「起動時の」の見出しはそのまま)

### §8.4 文言 (`features/session/labels.ts`)

`LIVE_SETTING_LABELS`: `permissionMode: '権限モード'`・`model: 'モデル'`・`currentModel: '現在のモデル'`・`rename: '名前を変更'`・`save: '保存'`・`cancel: 'キャンセル'`・`defaultModel: '既定'`・`nameRule: '1〜100 文字で、改行を含めずに入力してください'`・失敗の 3 文・blocker ごとの理由 (`not-running: 'Claude Code が動いていません'`・`not-ready: '最初の応答の後に変更できます'`・`busy: '変更中です'`・`no-conversation: '最初の応答の後に名前を付けられます'`・`turn-running: '応答の実行中は名前を変更できません'`) [ASSUMED: UI ラベル・ボタン文言 / エラーメッセージ文言]

## §9 記録の変更 (完了の PR)

- `docs/ui-coverage.md`: research R-10
- `docs/glossary.md`: 「Live session setting (実行中の設定の変更)」(権限モード・モデル・名前。永続化しない。安全 3 値の中の遷移) と「Session name (セッションの名前)」(Claude Code の custom-title。`SessionSummary.customTitle` と同じもの) を足す。`SessionControl` の定義に 2 種類を足す。`SafePermissionMode` の定義に「実行中の切り替えも同じ 3 値」を足す
- `docs/domains/session/charter.md`: Related ADRs に AD-062、Related Specs に 023、「X-6 は未着手」を「X-6 の最初の分割 (023) で実行中の操作を実装した。残りは roadmap の X-6 の行」に、frontmatter の `related_adrs` / `related_specs`
- `docs/domains/_overview.md:58`: X-6 の行に 023 の記録
- `docs/roadmap.md:355`: 023 の結論と、実機の未確認の項目
- `tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES` (research R-12 の 4 つに 1 文ずつ)
