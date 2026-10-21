# Contracts: セッションの再開 (X-9)

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

規則の正本は data-model。ここには境界の形 (名前・引数・戻り値・検証の置き場) だけを書く。`IPC_CHANNELS` に足すのは C-1〜C-4 の 4 つ (`src/domain/capability.test.ts` の固定の表を同じ PR で直す)。preload (`src/preload/index.ts` / `index.d.ts`)・`src/main/app/e2e-capability.ts`・`src/renderer/src/test-support/capability.ts` も同じ変更で直す (AD-038)。

## C-1 `resolvePastResume`

```ts
resolvePastResume(targetKey: string, conversationId: string): Promise<PastResumeDTO>

type PastResumeDTO =
  | {
      readonly ok: true
      readonly folderId: string
      readonly runtimeId: string
      readonly providerId: string | null
    }
  | { readonly ok: false; readonly reason: ResumeUnavailableReason }
```

- チャネル: `closta:resolvePastResume` (renderer → main。`ipcMain.handle`)
- main の検証: 送り元 (`isTrustedSender`)・`checkPastResumeQuery` (data-model §2.1)。外れたら `{ ok: false, reason: 'source-unknown' }`
- 判定: data-model §3 (列挙のキャッシュだけを見る。列挙・`wsl.exe` を起こさない)
- 戻り値にパス・config ディレクトリ・会話由来の文字列を含めない (3 つの不透明な id と理由のキーだけ)

## C-2 `resumeSession`

```ts
resumeSession(request: SessionResumeRequest, origin: LaunchOrigin): Promise<SessionResumeHandshakeDTO>

type SessionResumeHandshakeDTO =
  | SessionLaunchHandshakeDTO // { status: 'launching', sessionId } | { status: 'rejected', reasonKey: SessionLaunchRejectReason }
  | { readonly status: 'already-running'; readonly sessionId: string }
  | { readonly status: 'rejected'; readonly reasonKey: ResumeUnavailableReason | 'conversation-running' }
```

- チャネル: `closta:resumeSession` (renderer → main)
- main の検証: 送り元・`checkResumeRequest` (data-model §2.1)。外れたら `{ status: 'rejected', reasonKey: 'invalid-config' }`。`origin` は今の `launchSession` と同じく厳密比較で、外れても起動は通常どおり扱って記録だけを行わない。renderer が `origin` を決める規則は data-model §9.3 の「起動元」(3 段の規則。稼働中の行からの再開はその行の `launchOrigin` を初期値の組の起動元にする)
- 流れ: data-model §5
- 受け付けたら、今の `launchSession` と同じく supervisor に繋がった port を `sessionPort` のチャネル (`SESSION_PORT_MESSAGE`) で renderer に渡す (受け取り方は今と同じ。`sessionId` で照合)
- 起動の利用記録は受け付けたときだけ 1 回 (research R-12)

## C-3 `getResumedTranscript`

```ts
getResumedTranscript(sessionId: string, requestToken: string): Promise<TranscriptHandshakeDTO>
```

- チャネル: `closta:getResumedTranscript` (renderer → main)
- main の検証: 送り元・`isValidSessionId(sessionId)`・`requestToken` は今の `getTranscript` と同じ述語
- 読む会話と列挙対象: data-model §8.1。決まったら今の `transcriptService.getTranscript(conversationId, targetKey, requestToken)` を呼ぶ (AD-034 の経路。本文は取得プロセス ↔ renderer の port で届き、main を通らない)
- port は今の `transcriptPort` のチャネルと `TRANSCRIPT_PORT_MESSAGE` で渡す (renderer は `requestToken` で照合する)
- 戻り値は今の `TranscriptHandshakeDTO`。会話の id を含めない

## C-4 `onSessionResumable`

```ts
onSessionResumable(listener: (sessionIds: readonly string[]) => void): () => void
```

- チャネル: `closta:sessionResumable` (main → renderer。`webContents.send`)
- 送る時: main の起動の service が稼働中の行の会話の id を初めて記録したとき (data-model §1.4)。再開の起動の行には送らない (受け付けで分かる)
- 値は Closta の `sessionId` の列だけ。会話の id を含めない
- 購読解除は返るトークンで行う (今の `onSessionStatus` と同じ形)
- preload は配列であることと各要素が `isValidSessionId` であることを確かめてから渡す

## C-5 supervisor の protocol

置き場は `src/agents/supervisor-protocol.ts` (調停役スレッドのデコーダの唯一の置き場。項目 18)。

```ts
// セッションスレッド → 調停役スレッド
type WorkerMessage =
  | /* 今の event / status / child-exited / ended */
  | { readonly kind: 'conversation'; readonly conversationId: string }

// 調停役スレッド → main
type SupervisorEvent =
  | /* 今の status-batch / thread-ended / event */
  | { readonly kind: 'conversation'; readonly sessionId: string; readonly conversationId: string }
```

- `decodeWorkerMessage`: `conversationId` が `isValidSessionId` でなければ `null`
- `decodeSupervisorEventForMain`: `sessionId` と `conversationId` が両方 `isValidSessionId` でなければ `null`
- 調停役スレッド (`supervisor-core.ts`): 窓で束ねずに即座に送る。値をログに出さない
- main (`session-spawner.ts`): `SupervisorConnection.onConversation(listener: (generation: number, sessionId: string, conversationId: string) => void)` を足す

## C-6 起動の options

- `LaunchQueryOptions.resume?: string` (data-model §5.1)。main → supervisor → セッションスレッドの launch の message の `options` に載る
- セッションスレッドの `decodeLaunchOptions` が `isValidSessionId` で検査する (data-model §6.1)
- `QUERY_OPTION_KEYS` は 12 キー (data-model §6.2。AD-059 Decision 1)
