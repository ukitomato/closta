# Data Model: セッションの再開 (resume) (X-9)

**Date**: 2026-10-21 (`/cl-plan`) | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

本ファイルが規則の正本である。plan / tasks / contracts は節の番号で参照し、規則を書き写さない。理由と退けた案は research の R-nn。

## §0 変えないもの

- `SessionLaunchConfig` の 6 軸と `isValidLaunchConfig` の許可リスト・プリセットの形 (`presets.json`) — 再開の要求は別の型で包む (§2)
- 起動ゲート・依存解決の再評価・同時実行数の上限 (10)・WSL / Win32 の起動の値の組み立て (`launch-preparation.ts`)。再開は同じ `prepareLaunch` を通る (FR-014)
- `SessionStatusUpdate` のキーの集合 (`UPDATE_KEYS`) と受信規則 (`acceptBatch`)・状態通知の中継 (`session-status-relay.ts`)
- `SessionEvent` の種類 (9)・`SessionControl`・`TranscriptMessageDTO` の形・`SESSION_SUMMARY_DTO_FIELDS`
- `composeClaudeSpawn` と env の許可リスト (WSL / Win32)。`resume` は SDK が `claude` の引数に入れる (R-01)
- 権限モードは安全 3 値 (AD-041 (a))。承認の経路
- 項目 16 の禁止キー・SDK の呼び出しの許可リスト (R-13)
- 失敗したセッションを自動で再開しない (X-5 FR-013)

## §1 会話の id

Claude Code の session id (UUID)。transcript のファイル名 (`<id>.jsonl`) と同じ値。Closta の稼働中の行の `sessionId` (main が `crypto.randomUUID` で採る) とは別の値で、混ぜない。

### §1.1 形の検査

`isValidSessionId` (`src/domain/validation.ts:179`) を使う。新しい述語を作らない。検査する境界は 5 つ:

| 境界 | 置き場 | 外れたら |
|---|---|---|
| SDK → セッションスレッド (`system/init` の `session_id`) | `sdk-agent-session.ts` の `case 'system'` | 運ばない (その行は会話の id を持たない) |
| セッションスレッド → 調停役スレッド (`WorkerMessage` の `conversation`) | `supervisor-protocol.ts` の `decodeWorkerMessage` | その message を捨てる |
| 調停役スレッド → main (`SupervisorEvent` の `conversation`) | `supervisor-protocol.ts` の `decodeSupervisorEventForMain` (`sessionId` と `conversationId` の両方) | その event を捨てる |
| renderer → main (過去の行の `conversationId`) | `validate.ts` の `checkResumeRequest` / `checkPastResumeQuery` (§2) | 要求を拒否する |
| main → セッションスレッド (起動の options の `resume`) | `sdk-agent-session.ts` の `decodeLaunchOptions` (§6.1) | 起動しない (今の不正な options と同じ) |

### §1.2 運び方

1. セッションスレッドは、**最初の** `system` / `init` で `session_id` を §1.1 で検査し、通ったら `post({ kind: 'conversation', conversationId })` を 1 回だけ送る。2 回目以降の `init` は見ない (`/clear` の後は X-6。spec Edge Cases)
2. 調停役スレッドは受けた `conversation` を、窓で束ねずに即座に main へ `{ kind: 'conversation', sessionId, conversationId }` で送る (`thread-ended` と同じ扱い)。中身を解釈しない・ログに出さない
3. main (`session-spawner.ts`) は `SupervisorConnection.onConversation(listener: (generation, sessionId, conversationId) => void)` で起動の service に渡す

### §1.3 main の保持

`session-launch-service.ts` が持つ。**永続化しない。値をログに出さない** (件数と理由のキーだけ)。

| 持ち物 | 形 | 書く | 消す |
|---|---|---|---|
| registry の `Entry.conversationId` | `string \| null` | 起動で `null` (再開の起動は要求の id)。`onConversation` で同じ世代のエントリに上書き | エントリと一緒 |
| 退避の表 `conversations` | `Map<sessionId, ConversationRecord>` | `onConversation` と再開の起動の受け付け | §1.5 |

```ts
/** 稼働中の行の再開の元 (main だけが持つ)。 */
interface ConversationRecord {
  readonly conversationId: string
  /** 元の起動設定の引き継ぐ 3 軸 (§4)。 */
  readonly folderId: string
  readonly runtimeId: string
  readonly providerId: string | null
  /** それまでの会話を読む列挙対象 (§8)。過去の行から再開したときだけ値を持つ。 */
  readonly targetKey: string | null
}
```

- 起動の service は registry のエントリを作るとき、起動設定の 3 軸を `pendingAxes` に覚えておき、`onConversation` で `ConversationRecord` にする (起動設定そのものは持たない)
- `onConversation` の値が、再開の起動で入れた id と違ったら上書きし、`[session] conversation-id-changed` の 1 行だけを記録する (値を出さない。R-02)
- 世代の違う (`entry.generation !== generation`) ・知らない `sessionId` の `conversation` は捨てる (`onThreadEnded` と同じ)

### §1.4 renderer に渡すもの

真偽だけ。値は渡さない。

- 稼働中の行が会話の id を持ったら、main は `sessionResumable` チャネルで `{ sessionId }` を 1 回送る (contracts C-4)
- 再開の起動の行は、受け付けの時点で会話の id を持っている。renderer は `resumeSession` の受け付けで新しい行を「再開できる」にする (通知を待たない。§9.1)

### §1.5 退避の表を消す条件

| 条件 | 消すもの |
|---|---|
| その行を元にした再開の起動を受け付けた (U-4) | 元の行のレコード |
| `killAll` (renderer の再読み込み・クラッシュ) | 全部 |
| 件数が 256 を超えた | 最も古いもの (挿入順) |
| `dispose` | 全部 (アプリの終了) |

renderer の「閉じる」は main に届かない (IPC が無い) ので、閉じた行のレコードは上限か `killAll` まで残る。値は会話の id と 3 つの id だけで、上限 256 で増え続けない。

## §2 再開の要求

```ts
type ResumeSource =
  | { readonly kind: 'live'; readonly sessionId: string }
  | { readonly kind: 'past'; readonly targetKey: string; readonly conversationId: string }

interface SessionResumeRequest {
  readonly source: ResumeSource
  /** 6 軸。引き継ぐ 3 軸は source から解いた値と一致しなければならない (§4)。 */
  readonly config: SessionLaunchConfig
}
```

置き場は `src/domain/session/resume.ts` (新設)。

### §2.1 main の検証 (`validate.ts`)

| 述語 | 検査 | 外れたら |
|---|---|---|
| `checkResumeRequest(value, knownTargetKeys)` | オブジェクトで、キーは `source` / `config` だけ。`config` は `checkLaunchConfig`。`source.kind` が `'live'` なら `sessionId` が `isValidSessionId`、キーは `kind` / `sessionId` だけ。`'past'` なら `targetKey` が `isKnownTargetKey`・`conversationId` が `isValidSessionId`、キーは `kind` / `targetKey` / `conversationId` だけ | `{ status: 'rejected', reasonKey: 'invalid-config' }` |
| `checkPastResumeQuery(targetKey, conversationId, knownTargetKeys)` | `isKnownTargetKey` と `isValidSessionId` | `{ ok: false, reason: 'source-unknown' }` |

## §3 過去の行の軸の解決

`resolvePastResumeAxes(input): PastResumeAxes` (domain の純関数。`src/domain/session/resume.ts`)。I/O を持たない。

```ts
interface PastResumeInput {
  /** 列挙対象 (所在・config ディレクトリ・origin)。 */
  readonly target: EnumerationTarget
  /** 行の cwd の出自 (列挙の結果の `SessionSummary.origin`)。 */
  readonly origin: CwdOrigin
  readonly folders: readonly WorkspaceFolder[]
  readonly runtimes: readonly RuntimeDescriptor[]
  readonly providers: readonly ProviderProfile[]
  readonly resolve: ResolveFolderRuntime
}

type PastResumeAxes =
  | {
      readonly ok: true
      readonly folderId: string
      readonly runtimeId: RuntimeNamespaceId
      readonly providerId: string | null
    }
  | { readonly ok: false; readonly reason: ResumeUnavailableReason }

type ResumeUnavailableReason =
  | 'source-unknown'
  | 'runtime-missing'
  | 'location-mismatch'
  | 'folder-unregistered'
  | 'cwd-mismatch'
  | 'folder-pending'
  | 'location-unknown'
  | 'provider-missing'
  | 'provider-ambiguous'
```

### §3.1 判定の順 (上から。最初に当たった行で決まる)

| 段 | 条件 | 結果 |
|---|---|---|
| 1 ランタイム | 列挙対象の所在が `windows` → `host`、`wsl` のディストロ D → `wsl:D` (`locationNamespace(target.location)`)。その id の descriptor が `runtimes` に無い | `runtime-missing` |
| 1b 出自の一致 | 出自が `host` / `wsl-from-unc` / `wsl-inherited` のどれかで、次を満たさない: 所在が `windows` なら出自は `host`、所在がディストロ D なら出自は `wsl-inherited` かつ `isSameNamespace(origin.namespace, <段 1 の id>)`。`wsl-from-unc` は所在に依らず満たさない | `location-mismatch` |
| | 出自が `absent` / `unknown-location` / `undetected-distro` | 段 2 へ (`matchFolder` が `unknown` を返す) |
| 2 フォルダ | `matchFolder({ origin, folders, runtimes, resolve })` が `unregistered` | `folder-unregistered` |
| | 同 `pending` | `folder-pending` |
| | 同 `unknown` | `location-unknown` |
| | 同 `folder` で、`matchedPrefix` が行の cwd (`originPath(origin).value`) と一致しない (フォルダの下のディレクトリ) | `cwd-mismatch` |
| | 同 `folder` で `matchedPrefix` が cwd と一致する | `folderId` に決まる |
| 3 Provider | 候補 = 資格情報の出所が `config-dir` / `in-app-login` で `configDir` を持ち、`resolveConfigDirPath(configDir, runtime)` が `ok` で、`path` の名前空間と値が列挙対象の `configDir` と完全に一致する Provider。候補が 2 つ以上 | `provider-ambiguous` |
| | 候補が 1 つ | その Provider |
| | 候補が 0 で、列挙対象の `origin` が `'default'` | Provider なし (`null`) |
| | 候補が 0 で、`origin` が `'default'` でない | `provider-missing` |

- 段 1 のランタイムは段 2 の `matchFolder` に渡す `runtimes` と同じ集合から引く (同じ表を 2 つ持たない)
- 段 1b を置く理由: 段 1 はランタイムを列挙対象の所在から、段 2 (`matchFolder`) はフォルダを cwd の出自の名前空間から決めるので、段 1b が無いと 2 つが別の名前空間を指す組を `ok` で返しうる (ホストの記録にある UNC の cwd → { WSL のフォルダ × `host` } で起動の時に `invalid-config`、`/mnt/c` を経て { ホストのフォルダ × `host` } で `resume-failed`)。段 1b を通った行では、段 2 の `matchFolder` が使うランタイムは段 1 のランタイムと同じになる。理由は research R-05
- 段 1b は名前空間の比較に `locationNamespace` / `isSameNamespace` (`folder.ts:73` / `namespace.ts:134`) と出自の型 (`origin.ts`) の `kind` / `namespace` だけを使い、所在 → 名前空間の対応の表を別に持たない。`cwd-origin.ts` の `originLocation` は使わない (パス API に依存するため。`resume.ts` の依存を増やさない)
- cwd の一致は文字列の完全一致 (大文字と小文字を区別する。`matchesAtSegmentBoundary` と同じ。Windows の大文字小文字の違いは今の対応づけでも別のパスになる)
- 今の列挙対象は常に `origin: 'default'` なので `provider-missing` には今は届かない (research R-05)。表のテストは `origin` を差し替えて組む
- 所在のディストロが止まっている行は列挙されない (spec Edge Cases) ので段 1 に来ない

### §3.2 main での呼び出し

`session-service.ts` に `pastResumeSource(targetKey, conversationId): { target, origin } | null` を足す。列挙のキャッシュ (`targets` と `sessionsByTarget`) から、`targetKey` の対象と、その対象の中で `sessionId === conversationId` の行を引く。どちらかが無ければ `null` (→ `source-unknown`)。列挙をやり直さない。

`resume-service.ts` (新設。§5) が `pastResumeSource` の結果・登録フォルダ・ランタイム・Provider の一覧・`resolve` (session-service のメモ化と同じもの) を `resolvePastResumeAxes` に渡す。

## §4 稼働中の行の軸

`source.kind === 'live'` のとき、退避の表 (§1.3) の `ConversationRecord` を引く。

| 条件 | 結果 |
|---|---|
| レコードが無い (会話の id を持たない・上限で捨てた・`killAll` の後) | `{ status: 'rejected', reasonKey: 'source-unknown' }` |
| `config` の `folderId` / `runtimeId` / `providerId` がレコードと 1 つでも違う | `{ status: 'rejected', reasonKey: 'invalid-config' }` |
| 一致する | §5 へ。モデル / effort / 権限モードは `config` の値 |

過去の行 (`source.kind === 'past'`) も同じく、`config` の 3 軸が §3 の結果と違えば `invalid-config`、§3 が `ok: false` ならその理由で拒否する。

元の行の Provider・フォルダ・ランタイムがその後に削除・登録解除された・到達できない、は §5 の `prepareLaunch` の起動ゲートが今の理由 (`unknown-target` / `provider-unavailable` / `distro-not-running` など) で拒否する (FR-008)。軸を差し替える経路は無い。

## §5 再開の起動の流れ

`resume-service.ts` (新設。状態を持たない調停。I/O は注入で受ける) と `session-launch-service.ts` の `resume(...)` (新設のメソッド)。

```ts
type ResumeOutcome =
  | LaunchOutcome
  | { readonly status: 'already-running'; readonly sessionId: string }
  | { readonly status: 'rejected'; readonly reason: ResumeRejectReason }

type ResumeRejectReason = SessionLaunchRejectReason | ResumeUnavailableReason | 'conversation-running'
```

| 順 | 処理 | 結果 |
|---|---|---|
| 1 | §2.1 の検証 (IPC の handler) | 外れたら `invalid-config` |
| 2 | source から会話の id と引き継ぐ 3 軸を解く (§3 / §4) | 外れたらその理由 |
| 3 | `config` の 3 軸が 2 の値と一致するか | 違えば `invalid-config` |
| 4 | registry に `claudeAlive: true` で同じ `conversationId` のエントリがある | `{ status: 'already-running', sessionId: <そのエントリ> }` (起動しない。U-5) |
| 5 | 同じ `conversationId` の再開が準備の途中 (`inFlightConversations` の Set にある) | `conversation-running` |
| 6 | 今の `launch` と同じ: 終了処理中 → `shutting-down`、上限 → `session-limit`。通れば `reserved += 1` と `inFlightConversations.add(id)` (4〜6 は `await` の前に同期で行う) | |
| 7 | `prepareLaunch(config)` (今の起動ゲート・env・spec の組み立て) | 今の理由で拒否 |
| 8 | `prep.input.options` に `resume: conversationId` を足して `connection.launch` | 今の `launch-failed` |
| 9 | registry に `conversationId` 付きで登録。退避の表に新しい行のレコード (過去の行なら `targetKey` 付き) を入れ、source が `live` なら元の行のレコードを消す (§1.5) | `{ status: 'launching', sessionId, port }` |
| 終わり | `finally` で `reserved -= 1` と `inFlightConversations.delete(id)` | |

- 4 の判定は 6 より前に置く — 上限いっぱいでも、動いている行を選ぶ答えは返せる
- `killAll` をまたいだ要求は今の `launch` と同じく登録しない (`epoch`)
- 再開の起動は `LaunchQueryOptions` に `resume` を足すだけで、`prepareLaunch` に会話の id を渡さない (起動ゲートは会話の id を見ない)
- `prepareLaunch` の結果の `options` に `resume` を足す処理は起動の service の 1 か所に置く (WSL / Win32 の分岐の外。FR-014)

### §5.1 `LaunchQueryOptions` の変更

```ts
interface LaunchQueryOptions {
  readonly permissionMode: SafePermissionMode
  readonly model?: string
  readonly effort?: EffortLevel
  readonly settings?: HelperSettings
  /** 再開する会話の id (X-9 / AD-059)。新しい起動では持たない。 */
  readonly resume?: string
}
```

## §6 agents

### §6.1 起動の値の検査 (`decodeLaunchOptions`)

`o.resume !== undefined && !isValidSessionId(o.resume)` なら `null` (起動しない)。通ったら返す値に `resume` を足す。

### §6.2 `QUERY_OPTION_KEYS` と `buildQueryOptions`

- `QUERY_OPTION_KEYS` に `'resume'` を足す (11 → 12)。pin テスト (`session-core.test.ts:209-214`) を 12 キーに直す
- `BuiltQueryOptions.resume?: string`・`BuildQueryOptionsDeps.resume?: string`。`buildQueryOptions` は `isValidSessionId` で assert し直し (外れたら throw)、オブジェクトリテラルに `...(deps.resume !== undefined ? { resume: deps.resume } : {})` の形で書く (今の `model` / `effort` と同じ形)
- `forkSession` / `sessionId` / `resumeSessionAt` / `continue` は足さない

### §6.3 会話の id の送出

`run()` の closure に `conversationPosted = false` と `sawInit = false` を持つ。`case 'system'` で `subtype === 'init'` のとき:

1. 再開の起動 (`launchOptions.resume !== undefined`) で、これが最初の `init` (`sawInit === false`) なら、`permissionMode` を `isSafePermissionMode` で検査する。通らない (無いときも) なら `fail('resume-failed')` と `terminated = true` にして、2 以降と `signals.onSystem` を行わずに抜ける (ループを出て `finally` の `finish` が子を止める。fail closed。spec FR-017 / research R-01)。新しい起動では検査しない (表示だけ。今どおり)
2. `sawInit = true`
3. `!conversationPosted` で `session_id` が `isValidSessionId` を通ったら、`post({ kind: 'conversation', conversationId })`、`conversationPosted = true`

`signals.onSystem(message)` (構成の報告) の呼び出しは今のまま。1 で止めた `init` の会話の id は運ばない (main は再開の受け付けで要求の id を持っているので、行は失敗の「再開」になる。§7)。昇格の値の綴りを書かない (項目 16。`isSafePermissionMode` の正の判定だけを使う)。

### §6.4 `resume-failed`

`launchOptions.resume !== undefined` (再開の起動) で `sawInit === false` のうちに、次の 3 つの経路に来たら `resume-failed` で失敗にする。箇所は `sdk-agent-session.ts` の main 7e13d60 の行番号 (理由は research R-07)。

| 経路 | 箇所 | 新しい起動 | 再開で `init` の前 | 再開で `init` の後 |
|---|---|---|---|---|
| A. 終了処理の外で子 (`claude`) が終わった | `child.once('exit')` (`:717`) | `process-crashed` (今どおり) | `resume-failed` | `process-crashed` (今どおり) |
| B. stream が例外で終わった | `catch` (`:932`) | `stream-protocol-error` (今どおり) | `resume-failed` | `stream-protocol-error` (今どおり) |
| C. stream が例外なく終わった (`for await` を抜けた。`terminated` でない) | **新設** — ループの後 (`:928` の後、`finally` の前) | 失敗にしない (今どおり) | `resume-failed` | 失敗にしない (今どおり) |
| (対象外) セッションスレッドの JS 例外 | `fatalSink` (`:727`) | `process-crashed` | `process-crashed` (変えない) | `process-crashed` |

- A と B は今の 2 か所の理由を 1 つの内部の関数 (`crashReason(fallback)`) で選ぶ。C は再開の起動に限って足す新しい失敗の経路で、条件は `resume !== undefined && !sawInit && !closing && !isErrored()`
- `fatalSink` は Closta の内部の例外の経路で `claude` の終わり方ではないので、`resume-failed` (記録が見つからない) と読ませない
- 終了処理の中 (`closing`) では失敗にしない (今どおり。A〜C のどれも)
- 最初のプロンプトの前に利用者が終了・強制終了したときは今どおり (`closing` が立つ)
- §6.3 の 1 (権限モードの fail closed) も `resume-failed` を使う。そのときは `terminated = true` で C には来ない

## §7 `LaunchFailureReason` の `resume-failed`

- `LaunchFailureReason` と `LAUNCH_FAILURE_REASONS` に `'resume-failed'` を足す (18 → 19。AD-059 Decision 3)。固定テスト (`agent-session.test.ts:244`) を 19 に直す
- 状態通知の理由のキーとして main を経由する (`isLaunchFailureReason` が追随し、main のコードの差分は無い。AD-047 Consequences と同じ)
- 再ログインの導線 (`isReloginFailure`) は出さない
- 文言 (`features/session/labels.ts`): 行の短い理由「再開できませんでした」、中央の失敗の表示「会話を再開できませんでした。会話の記録が見つからない・読めない、または再開した会話が安全でない権限モードで起きました。」 [ASSUMED: エラーメッセージ文言]
- 失敗した行は会話の id を持つ (再開の起動は受け付けの時点で持つ。§1.3) ので「再開」が出る (§9.1)。同じ原因なら同じ失敗になるが、利用者が transcript を戻した・ディストロのユーザを直したあとに試せる

## §8 それまでの会話の読み取り

`getResumedTranscript(sessionId, requestToken)` (contracts C-3)。main の `resume-service.ts` が、新しい行の `ConversationRecord` から会話の id と読む列挙対象を決め、今の `transcriptService.getTranscript(conversationId, targetKey, token)` に渡す (AD-034 の経路をそのまま使う)。

### §8.1 読む列挙対象

| 再開の元 | 列挙対象 |
|---|---|
| 過去の行 | `ConversationRecord.targetKey` (その行の `targetKey`) |
| 稼働中の行 | 元の起動設定のランタイムの所在 (`host` → `windows`、`wsl:D` → ディストロ D) の列挙対象のうち、(1) 列挙のキャッシュにその会話の id の行を持つもの。(2) 無ければ、Provider が `configDir` を持つときは `resolveConfigDirPath` の結果が `configDir` と一致するもの、持たないとき (Provider なし・`configDir` の無い Provider) は `origin: 'default'` の対象がその所在に 1 つだけならそれ。(3) 決まらなければ読み取りの失敗 |

- 稼働中の行から再開した行をさらに再開したとき、新しいレコードの `targetKey` は (1)〜(2) で決めた値を入れる (読むたびに決め直さない)
- 読み取りの失敗は `TranscriptHandshakeDTO` の今の失敗 (`status: 'failed'`・理由のキー) で返す。決まらないときの理由のキーは `transcript-read-failed`
- 知らない `sessionId`・会話の id を持たない行は `status: 'failed'` (`transcript-read-failed`)

### §8.2 renderer の表示

- 再開の起動を受け付けたら、新しい行のストアの状態に `resumed: { phase: 'loading' }` を持ち、`getResumedTranscript` を 1 回呼ぶ (`useTranscript` の port の受け取り方と同じ。`requestToken` で照合)
- 届いた `TranscriptMessageDTO[]` を過去ログと同じ変換 (`toThreadMessage`) で `ThreadMessageLike` にし、id に `resumed:` の接頭辞を付け、`messages` の先頭に入れる。その後ろに区切りの行を 1 つ入れる。区切りの行は既存のシステムイベントの行 (`{ id: 'resumed:divider', role: 'system', parts: [{ type: 'system-event', category: 'informational', opens: true, name: '', detail: 'ここから再開', status: 'notice' }] }`) にする。`divider` の part は圧縮の境界として描かれ `label` を読まないため使わない。`notice` は終わった行で状態の文言を出さない
- 届く前に新しいメッセージが来ていても、それまでの会話は先頭に入れる (並びは記録の順。新しいやり取りが後)
- 失敗したら `messages` の先頭に失敗の 1 行 (システムイベントの行。「それまでの会話を読み込めませんでした」) を入れる。composer は使えるまま (FR-013)。再取得の操作は出さない (過去の区画の行から読める)
- 読み取り専用 (US-4 AC2) の扱いは research R-09。`retryTextFor` は `resumed:` の id に `null` を返す
- 0 件なら区切りの行だけを入れる
- 窓・「さらに表示」・会話内検索・会話の地図は先頭のそれまでの会話を含めた `messages` に効く

## §9 renderer

### §9.1 行の操作の出し分け

稼働中の区画の行 (`SessionRowActions` の `availableActions`)。`claudeAlive` は状態通知の値、「会話の id」は §1.4 の真偽 (`resumable`)。

| 行の状態 | `claudeAlive` | 会話の id | 出す操作 (今の終了・中断・強制終了・閉じるに足すもの) |
|---|---|---|---|
| 起動中・応答中・承認待ち・応答待ち・中断済み | true | どちらでも | なし (U-8) |
| 終了済み (`ended`) | false | あり | 「再開」 |
| 終了済み | false | なし | なし (閉じるだけ) |
| 失敗 | false | あり | 「再開」 |
| 失敗 | false | なし | 「やり直す」 |
| 失敗で `claudeAlive` が true (終わりの通知の前) | true | どちらでも | なし |

過去の区画の行 (中央の過去ログの画面の下の帯。§9.2):

| `resolvePastResume` の結果 | 出すもの |
|---|---|
| `ok: true` | 押せる「再開」 |
| `ok: false` | 押せない「再開」と理由の文言 (§10)。`folder-unregistered` は今の「作業フォルダとして登録」(`registerSeedOf` の初期値) を並べる |
| 取得中 | 押せない「再開」(理由を出さない) |

### §9.2 置き場所

- 稼働中の行: `RunningSessionRow.tsx` の `SessionRowActions`。中央の終わりの通知 (`EndNotice`) と失敗の表示 (`FailureBanner`) にも同じ操作を「閉じる」の隣に出す (今の「閉じる」と同じ並び)
- 過去の行: 中央の過去ログの画面 (`PastCenter`) の本文の下に帯 (`PastResumeBar`。session の操作 UI) を置く。中央のヘッダ (`CenterHeader`) には置かない (ヘッダに操作を置かない規則)。過去の行を選ぶたびに `resolvePastResume` を 1 回呼ぶ (一覧の全行には呼ばない)

### §9.3 再開の形の起動ダイアログ

起動ダイアログ (`LaunchDialog.tsx`) に再開の形を足す。ストアの起動の状態に `resume: ResumeDialogState | null` を持つ。

```ts
interface ResumeDialogState {
  readonly source: ResumeSource
  /** 引き継ぐ 3 軸 (表示だけ)。 */
  readonly fixed: { readonly folderId: string; readonly runtimeId: string; readonly providerId: string | null }
  /** 選び直せる 3 軸の初期値。稼働中の行は元の起動設定の値、過去の行は null (ダイアログの既定)。 */
  readonly initial: Pick<SessionLaunchConfig, 'modelId' | 'effort' | 'permissionMode'> | null
  /** 初期値の組の起動元 (下の表の「起動元」)。稼働中の行はその行の `launchOrigin`、過去の行は `'manual'`。 */
  readonly initialOrigin: LaunchOrigin
  /** 稼働中の行から開いたときの元の行 (U-4 で閉じる)。 */
  readonly replaces: string | null
}
```

| 項目 | 規則 |
|---|---|
| 見出し・起動のボタン | 「セッションを再開」・「再開する」 [ASSUMED: UI ラベル・ボタン文言] |
| フォルダ / ランタイム / Provider | 選択の部品を出さず、値の表示名をテキストで出す (変えられない)。表示名が引けない (削除された) ときは「(削除済み)」を出し、起動のボタンはそのまま (main が §4 / 起動ゲートで拒否する。FR-008) |
| モデル / effort / 権限モード | 今の依存解決 (Provider → モデル → effort) と同じ部品・同じ規則。初期値は `initial` (null ならダイアログの今の既定)。初期値が今の Provider で選べないときは今の規則で既定に戻して通知する (FR-007 / US-3 AC4) |
| プリセット | 適用すると、選び直せる 3 軸だけに当てる。引き継ぐ 3 軸は変えない (spec Edge Cases)。プリセットの保存は今の 6 軸のまま (引き継ぐ 3 軸は `fixed` の値) |
| 同じフォルダの警告 | 今どおり (終わっていないセッションのフォルダ) |
| 起動 | `resumeSession({ source, config }, origin)`。`config` の 3 軸は `fixed` |
| 起動元 (`origin`) | 今の 3 段の規則 (012 data-model §4「renderer の起動元」・`LaunchDialog.tsx:91`) のまま: このダイアログでプリセットを適用したら `preset`、適用せずに選び直せる軸を手で変えたら `manual`、どちらも無ければ初期値の組の起動元。初期値の組の起動元は、稼働中の行からの再開では**その行の `launchOrigin`**、過去の行からの再開 (`initial: null`。元の起動元を持たない) では `manual`。`ResumeDialogState` に `initialOrigin: LaunchOrigin` (稼働中の行は `launchOrigin`、過去の行は `'manual'`) を持たせて渡す。research R-12 |

### §9.4 受け付け・拒否と行の入れ替え

| `resumeSession` の答え | renderer |
|---|---|
| `launching` | 新しい行を作って選ぶ (今の `launch` の受け付けと同じ)。新しい行は `resumable: true`。§8.2 の読み取りを始める。`replaces` があれば元の行を `replace` で消す (U-4。`close` を使わない。`previousFailure` を立てない。research R-11)。ダイアログを閉じる |
| `already-running` | 返った `sessionId` の行を選び、ダイアログを閉じる。元の行は残す (FR-011) |
| `rejected` | 今の拒否と同じく、ダイアログに理由 (§10) を出して開いたままにする。元の行は残す (US-2 AC6) |

### §9.5 「やり直す」

会話の id を持たない失敗の行の「やり直す」は、ダイアログを新規起動の形で開き、その行の起動設定を初期値 (`lastConfig`) にする。行は今の「失敗した行を閉じる」と同じく閉じる (前回の失敗の告知が出る)。新しい操作の型を作らない — 今の `close` のあとダイアログを開くのと同じ遷移に、中央に出しているかに依らずダイアログを開くことだけを足す (FR-009)。

### §9.6 稼働中のストアの状態

`LiveSessionState` に足す:

| フィールド | 値 | 書く |
|---|---|---|
| `resumable` | `boolean` | `sessionResumable` の通知・再開の受け付け |
| `resumed` | `{ phase: 'loading' \| 'loaded' \| 'failed' } \| null` | 再開の受け付けで `loading`、§8.2 で更新 |

`sessionResumable` の通知が行より先に届いた (受け付けの handshake と通知の順が入れ替わった) ときは、通知の `sessionId` を覚えておき、行を作るときに当てる (上限は同時実行数の上限と同じ 10。古いものから捨てる)。

## §10 文言

置き場は `features/session/labels.ts`。[ASSUMED: エラーメッセージ文言]。

| キー | 文言 |
|---|---|
| 操作 | 「再開」・「やり直す」 |
| `folder-unregistered` | この会話の作業フォルダは登録されていません。フォルダを登録してから再開してください |
| `cwd-mismatch` | この会話の作業ディレクトリは、登録フォルダの下の別のディレクトリです。そのディレクトリを作業フォルダとして登録してから再開してください |
| `folder-pending` | この会話の所在の確認が終わっていません。しばらくしてから再開してください |
| `location-unknown` | この会話の作業ディレクトリの所在が分からないため、再開できません |
| `runtime-missing` | この会話のランタイムが見つかりません。ランタイムを再検出してから再開してください |
| `location-mismatch` | この会話は、記録のある環境と別の環境の作業ディレクトリで動いていたため、Closta からは再開できません |
| `provider-missing` | この会話の config ディレクトリに対応する Provider がありません。Provider を登録してから再開してください |
| `provider-ambiguous` | この会話の config ディレクトリに対応する Provider が複数あります。1 つにしてから再開してください |
| `source-unknown` | この会話を再開できません。一覧を再取得してから試してください |
| `conversation-running` | この会話はすでに実行中です |
| 区切りの行 | ここから再開 |
| 読み取りの失敗 | それまでの会話を読み込めませんでした |

`already-running` は理由を出さずにその行を選ぶ (spec の「この会話はすでに実行中です」は `conversation-running` の文言)。

## §11 記録

| 置き場 | 内容 |
|---|---|
| `docs/decisions/0059-session-resume-query-option-and-conversation-id.md` | AD-059 (accepted。2026-10-21 に夜間の規則で推奨案を採用) |
| `docs/domains/session/charter.md` | Journey 4 の注記 (`:123`)・Key concepts の失敗の理由 (18 → 19。`:141`)・Related ADRs に AD-059・Related Specs の X-9 の項 (`:344-346`)・業務ルール (`:182`) は変えない |
| `docs/glossary.md` | 「Resume (再開)」「Conversation id (会話の id)」「Resume dialog (再開の形の起動ダイアログ)」を足す。「SessionLaunchConfig」に再開は別の型で包む旨、「Session thread」に会話の id の送出、FailureReason に `resume-failed` |
| `docs/ui-coverage.md` | `:308` (Message branches) を `fork (X-6)` だけにする。`:277` (Edit message) の「fork / resume と合わせて X-6」を「fork と合わせて X-6」に直す (resume は編集を使わない) |
| `docs/roadmap.md` | X-9 の行 (`:386`) に結論 (完了の PR)。X-6 の行 (`:355`) は変えない |
| `docs/domains/_overview.md` | X-9 の行 (`:73`) の状態 (完了の PR) |
| `scripts/constitution/allowlists.mjs` | `WSL_FREE_DIRECTORIES` に `src/main/app/resume-service.ts` |
| `.dependency-cruiser.js` | `:254` の実名の列に `resume-service` |
