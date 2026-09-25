# Contract: transcript 取得 IPC (単一 capability への追加)

[plan.md](../plan.md) / [contracts/transcript-read.md](transcript-read.md) の続き。
renderer が選択セッションの transcript を取得する IPC を、R-2 が確立した**単一 capability**に追加する。

## メソッド

| メソッド | 入力 | 出力 | 備考 |
| --- | --- | --- | --- |
| `getTranscript` | `{ sessionId: string, targetKey: string, requestToken: string }` | `TranscriptHandshakeDTO` | 読み取り専用。**本文は返さない** |

- **`getTranscript` invoke は本文を返さない。** 返すのは `TranscriptHandshakeDTO =
  { status: 'streaming' \| 'empty' \| 'failed', reason?: FailureReason, requestToken }` の軽量メタのみ。
  **本文 (`ThreadMessageLike` DTO) は main を経由せず、MessageChannelMain の port2 経由で
  取得プロセス↔renderer 直通で届く** ([transcript-read.md](transcript-read.md) C-3)。
  IPC 応答が巨大 JSON 文字列にならない (Principle IX / AD-023)
- **生の `ipcRenderer` を renderer に渡さない** (FR-005)。preload の単一 capability に閉じる。
  renderer が受ける port2 は main が transfer するが、**要求の発行は必ず本 invoke を通し main の検証を経る**
- `targetKey` は R-2 の `EnumerationTarget.key` を再利用し、どの config ディレクトリで探すかを決める
- `requestToken` は選択 epoch に対応し、stale 応答の破棄に使う (下記状態遷移)

## 検証表 (FR-017 / validate.ts に集約)

| 項目 | 規則 | 拒否例 |
| --- | --- | --- |
| `sessionId` | **UUID 形式への一致を必須**とする (path traversal 防止) | 非 UUID / `../` やセパレータ混入 / 空 / 非文字列 / 制御文字混入 |
| `targetKey` | R-2 の既知 `EnumerationTarget.key` に一致 | 未知キー / 空 / 任意パス |
| `requestToken` | 非空の文字列 | 空 / 非文字列 |
| port2 の宛先 | main が現在の window にのみ transfer する | 別 window / 未検証の宛先 |

- 検証は `validate.ts` に集約し、ハンドラ本体 (`session-ipc.ts`) がその検証関数を**呼んでいること**を
  テストする (R-2 の BE-029 と同型)。**任意パスの存在確認経路を作らない** (`targetKey` は既知集合に閉じる)
- `sessionId` は SDK のファイル解決 (`<config-dir>/projects/<cwd>/<uuid>.jsonl`) に渡る未信頼値であり、
  UUID 一致を強制しないと traversal の恐れがある (CWE-22。H-002)

## 状態遷移 (renderer)

```
選択なし ──選択(token=T1)──> loading ──port で本文到着(token=T1)──> ready
                              │                                └─空─> empty
                              └─失敗(handshake failed)─> failed (理由 + retry 導線)
選択切替(token=T2) ──> 新 sessionId で loading。T1 の本文/handshake が遅れて到着しても
                       **token 不一致で破棄**し現在表示を上書きしない (US-1 AC-5 / H-002)
failed ──retry(同一 sessionId/targetKey, token=T3)──> loading (所在起動後などに回復。M-004)
```

- **stale 破棄**: 応答 (handshake / port 本文) の `requestToken` が現在選択の token と一致しなければ破棄する
- **retry**: `failed` から同一 `sessionId` / `targetKey` で再取得する導線を持つ

## 検証 (この契約に対応する SC)

| 契約 | 検証 | SC |
| --- | --- | --- |
| 検証表の各行 | 不正入力の拒否 (main 側ハンドラを直接呼ぶ)。sessionId traversal/非 UUID 拒否 | SC-008 |
| 本文は invoke で返さない | handshake が本文を含まないこと / 本文は port 経由の構造検査 | SC-007 |
| stale 破棄 | token 不一致応答の破棄テスト | SC-001 |
| retry | failed からの再取得テスト | SC-001 |
| 単一 capability | preload が生の ipcRenderer を渡さない | SC-007 |
