# Contracts: 既定の Provider のモデルの一覧 (O-13)

**Data model**: [../data-model.md](../data-model.md) §1〜§4 / **ADR**: [AD-065](../../../docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md) / **先行**: [023 contracts/ipc-live-session-settings.md](../../023-session-launch-axes-and-operations/contracts/ipc-live-session-settings.md)

023 の C-1〜C-6 は変えない。本書は C-7〜C-9 を足し、C-2 (`setSessionModel`) の検証に既定の Provider の分岐を足す。

---

## C-7 `listSessionModels(sessionId)` (renderer → main)

| 項目 | 値 |
|---|---|
| チャネル | `closta:listSessionModels` (`IPC_CHANNELS.listSessionModels`) |
| 引数 | ちょうど 1 つ。`sessionId` は UUID (`checkListModelsArgs`。外れたら service を呼ばず `unknown-session`) |
| 戻り値 | `LiveModelsResult` |
| 登録 | `ipc.ts` の `handle()` の wrapper (023 と同じ) |

```ts
// src/domain/session/live-settings.ts に足す
export type LiveModelsResult =
  | {
      readonly ok: true
      readonly models: readonly LiveModelOption[]
      /** effort で絞る前の件数 (main の再検査の後)。`models` が空の理由を分ける (data-model §3.2) */
      readonly reportedCount: number
    }
  | { readonly ok: false; readonly reason: LiveSettingFailure }

export interface LiveModelOption {
  readonly id: string
  readonly displayName: string
}
```

- `reason` は `LIVE_SETTING_FAILURES` の既存の値だけ (AD-065 Consequences。集合は変えない)。返しうるのは `unknown-session` / `invalid-value` / `not-running` / `not-ready` / `session-ended` / `rejected` / `timeout`
- `models` は起動の effort で絞った後の値。空の配列は `ok: true` である。`reportedCount` は 0 以上の整数で、`models.length` 以上
- renderer は `reason` を `LIVE_MODEL_LIST_FAILURE_LABELS` (data-model §9) で文言にする
- `capability.ts` の `ClostaCapability`・`preload/index.ts`・`e2e-capability.ts`・`test-support/capability.ts` (`notStubbed`)・`app-shell-harness.tsx` に同じ名前で足す。`capability.test.ts` のチャネルの pin を 1 つ増やす

## C-8 `SessionControl` の `list-models` (main → 調停役 → セッションスレッド)

```ts
// src/domain/session/agent-session.ts の SessionControl に足す (9 種類目)
| { readonly kind: 'list-models'; readonly requestId: string }
```

- `requestId` は main の `newRequestId` (UUID)
- セッションスレッドのデコーダは `requestId` が空でない文字列であることだけを見る。外れたら捨てる (023 の `set-*` と同じ)
- 制御は `deps.connection.control(sessionId, control)` の既存の経路で送る

## C-9 WorkerMessage `models-result` (セッションスレッド → 調停役 → main)

```ts
// src/agents/supervisor-protocol.ts
| { readonly kind: 'models-result'; readonly requestId: string; readonly models: readonly ModelEntry[] | null }
```

- 調停役スレッドは窓で束ねず、受けたらすぐに `SupervisorEvent` として main に送る (023 の `control-result` と同じ扱い)。中身を解釈しない
- main 側のデコーダ (`decodeSupervisorEvent`) の検査:
  - `requestId` が空でない文字列
  - `models` は `null` か配列。配列なら `normalizeLiveModelEntries` (data-model §1.3。`ModelEntry` の形を検査する) を通す。`normalizeLiveModels` (`ModelInfo` の形を期待する) は当てない。通った件数が元の件数と違えば、差を `dropped` としてログに出す
- `SupervisorConnection` に `onModelsResult(listener: (generation, sessionId, requestId, models) => void)` を足す
- 知らない `requestId`・別のセッション・世代の違う結果は捨てる (023 の `onControlResult` と同じ)

## C-2 の追加: `setSessionModel(sessionId, modelId)` の既定の Provider

引数の検査 (`checkSetModelArgs`) は 023 のまま。service の判定は [data-model §3.3](../data-model.md) のとおりで、既定の Provider の行では `Entry.liveModels` を effort で絞った集合と照合する。一覧をまだ受け取っていなければ `invalid-value` を返す。

## 呼び出しの順 (正常系)

```
renderer                     main                         調停役               セッションスレッド
   | listSessionModels(id) -->|                              |                       |
   |                          | 判定 (§3.1) を通る            |                       |
   |                          | pending に積む (10 秒)        |                       |
   |                          |-- control list-models ------->|-- 転送 ------------->|
   |                          |                              |                       | supportedModels()
   |                          |                              |                       | normalizeLiveModels
   |                          |<----- models-result ---------|<-- models-result -----|
   |                          | normalizeLiveModelEntries     |                       |
   |                          | Entry.liveModels を置き換え   |                       |
   |<-- { ok, models } -------| switchableModels で絞る       |                       |
   | setSessionModel(id, m) ->| liveModels と照合 (C-2)       |                       |
   |                          |-- control set-model --------->|---------------------->| setModel(m)
```

## テストの観点 (tasks への入力)

層ごとの単体と偽の capability の E2E だけでは、セッションスレッドの出力の形と main の再検査の形の食い違いを CI で検出できない (実機の V-1 は未実施でマージしうる)。そのため下の表の「層横断」の行を必須とする。

| 観点 | 置き場所 |
|---|---|
| `checkListModelsArgs` の引数の数・UUID | `src/main/app/validate.test.ts` |
| §3.1 の判定の表の各行と、相乗り・期限・終了での解決 | `src/main/app/session-launch-service.test.ts` |
| `setModel` の既定の Provider の 3 分岐 (未受信・一覧の外・effort の外) と送る値 | 同上 |
| `normalizeLiveModels` の 5 規則・`normalizeLiveModelEntries` の 4 規則 | `src/domain/provider/model-catalog.test.ts` |
| `list-models` の制御で `supportedModels` を 1 回呼ぶ・例外・ハンドル無し | `src/agents/sdk-agent-session.test.ts` |
| `models-result` のデコーダ (形の外を捨てる) | `src/agents/supervisor-protocol.test.ts` |
| **層横断**: 偽の `supportedModels()` の `ModelInfo[]` をセッションスレッドの制御シンクに通して得た `models-result` を、そのまま (構造化複製を模して) 調停役の中継と main の `decodeSupervisorEvent` に通し、件数と `id` の並びが保たれ `dropped=0` であること。`ModelInfo` の形 (`value`) の配列を main のデコーダに直接渡すと全件落ちることも確かめる (形の取り違えの検出) | `src/agents/live-models-path.test.ts` (新設。偽は `Query` だけで、正規化・中継・デコーダは本物を使う) |
| `reportedCount` (空の一覧で 0、effort で全件落ちたとき元の件数) | `src/main/app/session-launch-service.test.ts` |
| チャネルの pin | `src/domain/capability.test.ts` |
