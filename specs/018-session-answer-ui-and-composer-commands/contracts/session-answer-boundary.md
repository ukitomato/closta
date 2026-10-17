# Contract: 問いに答える経路の境界 (O-10)

**Spec**: [../spec.md](../spec.md) / **Data model**: [../data-model.md](../data-model.md)

005 contracts (C-1 control plane / C-2 data plane / C-4 承認の応答) への追加分だけを書く。005 の本文は変えず、005 contracts C-4 と 005 data-model §5 に本書と AD-052 / AD-053 への pointer を置く (FR-017)。

## C-1'. control plane (renderer → main → agents)

| capability のメソッド | IPC のチャネル | 変更 | main の検証 | 送る制御 |
|---|---|---|---|---|
| `respondPermission(sessionId, requestId, outcome, scope, answers?)` | 既存 (`IPC_CHANNELS.respondPermission`) | 第 5 引数 `answers?: readonly string[]` を足す | 今の検証 + `answers` があれば `isPermissionAnswers` | `{kind: 'respond-permission', decision: {requestId, outcome, scope, answers?}}` |
| `respondElicitation(sessionId, requestId, action, content?)` | **新規** `IPC_CHANNELS.respondElicitation` (U-7) | 新規 | UUID ×2・`isElicitationAction`・`accept` で `content` があれば `isElicitationContent` (0〜32 キー。`content` の省略を許す) | `{kind: 'respond-elicitation', response: {requestId, action, content?}}` |

- 戻り値はどちらも今の `respondPermission` と同じ `Promise<void>` (`src/domain/capability.ts:141`)。検証に落ちても renderer に失敗を返さない (制御を送らないだけ)。検証の述語は domain に置き、renderer は送る前に同じ述語で確かめる (spec U-9。data-model §3「述語の置き場所」)
- main の新しい handler は `src/main/app/ipc.ts` の `handle()` (送信元の検査つき) で登録する (`respondPermission` の `:305` と同じ形)
- preload (`src/preload/index.ts`) は `respondElicitation` を 1 つ足し、`respondPermission` の第 5 引数を渡す。他の公開面は変えない

| `respondElicitation` の入力の例 | main の検証 | 送る制御 |
|---|---|---|
| `accept`・`content` なし (URL のリンクを押した) | 通す | `{requestId, action: 'accept'}` |
| `accept`・`content: {}` (全部が任意の form を空で送った) | 通す | `{requestId, action: 'accept', content: {}}` |
| `accept`・`content` が 33 キー / 値が object / `__proto__` のキー | 落とす | なし |
| `decline` / `cancel`・`content` つき | 通す (`content` を捨てる) | `{requestId, action}` |
- チャネルの集合の固定テスト (`src/domain/capability.test.ts:53-55`) は +1。URL を開くチャネルは足さない (AD-053 Decision 5)
- E2E の偽の capability (`src/main/app/e2e-capability.ts`) の制御の switch に `respond-elicitation` を足す (応答を受けたら待ちを外すだけ)。renderer の test-support (`test-support/capability.ts`) に `notStubbed('respondElicitation')`

### `SessionControl` (domain)

```ts
| { readonly kind: 'respond-elicitation'; readonly response: ElicitationResponse }

interface ElicitationResponse {
  readonly requestId: string
  readonly action: 'accept' | 'decline' | 'cancel'
  /** `accept` のときだけ。値は string | number | boolean */
  readonly content?: Readonly<Record<string, string | number | boolean>>
}
```

`AgentSession` (操作面の概念契約) に `respondElicitation(response: ElicitationResponse): void` を足す (操作の語彙を `SessionControl` と一致させる)。

## C-2'. data plane (agents → renderer)

| `SessionEvent` | 変更 |
|---|---|
| `permission-request` | `request.answerable?: 'ask-user-question'` が付きうる |
| `elicitation-request` | **新規** (`SESSION_EVENT_KINDS` 8 → 9)。`request: ElicitationPrompt` (data-model §2) |
| `message` | 新しい category `elicitation` と status `no-fallback-retry` の行 (data-model §5)。`TRANSCRIPT_PART_FIELDS` は変えない |

decoder (renderer の `SessionEvent` の受け口) は未知の種類を捨てる今の規則のまま、`elicitation-request` の形 (data-model §2 の型と上限) を確かめて受ける。

Elicitation の要求を取り下げる種類は足さない (spec U-10)。renderer がカードを外す場面は data-model §4 renderer「外す」が正本で、ターンを続けたまま SDK の側で中断された要求のカードは残る (既知の限界)。

## C-3'. query の options (agents → SDK)

| キー | 変更 |
|---|---|
| `onElicitation` | **新規** (`QUERY_OPTION_KEYS` 8 → 9) |
| `onUserDialog` / `supportedDialogKinds` | 足さない。`SUPPORTED_DIALOG_KINDS = [] as const` (domain) が空であることを pin する |

## C-4'. 承認の応答 (agents → SDK)

| tool | 決定 | 出力 |
|---|---|---|
| `AskUserQuestion` (SDK の値の完全一致) | allow + 射影の成功 | `{behavior: 'allow', updatedInput}` (AD-052 Decision 2) |
| `AskUserQuestion` | allow + 回答なし / 射影の失敗 | `{behavior: 'deny', message}` |
| どの tool も | deny | `{behavior: 'deny', message}` |
| それ以外の tool | allow | `{behavior: 'allow'}` |

`updatedPermissions` はどの出力にも無い。

## C-5'. Elicitation の応答 (agents → SDK)

| 場面 | `onElicitation` の戻り値 |
|---|---|
| URL の要求 (`openUrl` が http(s)) への `accept` | `{action: 'accept'}` (renderer が content を付けていても捨てる) |
| URL の要求 (`openUrl: null`) への `accept` | `{action: 'decline'}` |
| form (`fields: null`。答えられない) への `accept` | `{action: 'decline'}` |
| form への `accept` が照合を通った | `{action: 'accept', content}` (content が無ければ `{}` として照合し、`content: {}` を返す) |
| form への `accept` が照合に落ちた | `{action: 'decline'}` |
| renderer の `decline` / `cancel` | そのまま (`content` 無し) |
| 待ちの上限を超えた | `{action: 'decline'}` (renderer に送らない) |
| `signal` の abort・セッションの終了 | `{action: 'cancel'}` |
