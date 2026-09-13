---
status: accepted
date: 2026-09-13
id: AD-018
deciders: ukitomato
tags: [runtime, session, sdk, wsl]
supersedes: []
superseded-by: []
---

# AD-018: WSL 越しのプロセス制御と中断の方式

## Context

SPIKE-5（`spawnClaudeCodeProcess` による WSL 起動）の結果。X-1 の前提となる。

[AD-015](0015-wsl-access-strategy.md) で stream-json が `wsl.exe` 経由でも壊れないことは
確認済みだった。残る確認項目は **大きな tool_result での詰まり** と
**中断（SIGINT 伝播）** の 2 点である。

## 測定結果

### stdout 方向

| 検証 | 結果 |
|---|---|
| 10MB のペイロード通過 | 13,981,016 bytes 受信。欠落なし |
| 5MB の決定的データの往復ハッシュ | **完全一致**（`dbbe5517…`） |
| 50,000 行 × 日本語混じり | **50,000 行**受信。欠落ゼロ |
| 1MB と 10MB の所要 | どちらも約 3.8 秒（`wsl.exe` 起動が支配的） |

**大きな tool_result で詰まることはない。** スループットは十分で、サイズに対して線形に悪化しない。

### 双方向のレイテンシ

行単位の往復（Windows → WSL → Windows）で **0〜9 ms**。
**バッファリングによるデッドロックは起きない。** ストリーミング表示に必要な即時性がある。

### stdin 方向

34 bytes の JSON（日本語含む）+ LF を送り、WSL 側で **35 bytes を受信**。
内容は完全一致、末尾は `7d0a`（`}` + LF）で **CR の混入なし**。

stdin を閉じると子プロセスは **ExitCode 0 で正常終了**する。

### 中断（プロセス kill）

`wsl.exe` を kill したときの WSL 内の子プロセスの挙動:

```
kill 前 : 対象プロセス 1 / trap ログ "started"
kill 後 : 対象プロセス 0 / trap ログ "started"   ← SIGTERM も SIGINT も記録されない
```

**孤児は残らないが、graceful ではない。** `trap TERM` / `trap INT` のいずれも発火せず、
子プロセスは後処理の機会なく終了する。

### SDK の interrupt 機構

**公式ドキュメント（`/docs/en/agent-sdk/typescript`）には機構が明記されていない。**
`AbortController` の存在のみが記載され、内部が control message か OS signal かは書かれていない。
そのため `@anthropic-ai/claude-agent-sdk` **0.3.270** のパッケージを取得して型定義と実装を確認した。

```
sdk.d.ts:2625   interrupt(): Promise<SDKControlInterruptResponse | undefined>;
sdk.d.ts:4270   subtype: 'interrupt';
sdk.mjs         subtype:"interrupt"   ← initialize / can_use_tool と同じ control_request 群
```

**interrupt は stream-json の `control_request` として stdin 経由で送られる。OS signal ではない。**

型定義には以下も含まれる。

- `interrupt_receipt_v1` capability — 応答に `still_queued`（中断を生き延びたキュー内メッセージの uuid）が載る
- `cancel_queued: true` — キュー内のメッセージも同時に取り消す
- `cancel_async_message` — 個別 uuid の取り消し
- **「Closed-input exception: a one-shot run (string prompt / `-p` closes stdin) …
  with stdin closed, a stop_task control could never be delivered」**
  — **stdin を閉じると control_request が届かなくなる**

## Decision

### 1. 中断は SDK の `interrupt()` を使う。signal に頼らない

`wsl.exe` 経由では SIGINT / SIGTERM が子プロセスに伝播しないが、**それは問題にならない**。
interrupt は stdin 越しの control_request であり、stdin がバイト単位で通ることは実証済みである。

「中断しても途中出力を残して再開可能にする」（PLAN.md X-1 の受け入れ条件）は
signal ではなく SDK の API で実現する。

### 2. stdin を開いたまま保つ

**`query()` に `AsyncIterable<SDKUserMessage>` を渡す V1 形式が必須である。**
文字列プロンプトの一発実行は stdin を閉じるため、**control_request を送る経路が失われ、
interrupt も `can_use_tool` の応答もできなくなる**。

これは [AD-002](0002-use-agent-sdk-not-cli.md) が V1 形式を選んだ判断を、別の理由から裏付ける。
AD-002 は「V2 が削除済みだから」を根拠にしていたが、**そもそも対話的制御に V1 形式が要る**。

### 3. ハードストップは `wsl.exe` の kill とする

interrupt が効かない場合（プロセスが応答しない、プロトコルが壊れた）の最終手段として
`wsl.exe` プロセスを kill する。**孤児は残らない**ことを確認済みである。

ただし graceful ではないため、**UI 上で「中断」と「強制終了」を区別する**。
前者は SDK の interrupt、後者は kill であり、後者では途中出力の保全を保証しない。

### 4. ラッパーを噛ませるときは stdin を潰さない

`wsl.exe -d <distro> -- <cmd>` は stdin をそのまま渡す。
しかし `sh -c 'echo ... | base64 -d | bash'` のようにスクリプト自体をパイプから読ませると、
**実行されるスクリプトの stdin がそのパイプ（消費済み）になり、即座に EOF を見る**。

本 SPIKE でこの罠を実際に踏んだ。ラッパーが必要な場合は
`bash -lc 'exec <cmd>'` のようにスクリプトをパイプ経由で渡さない形にする。

`claude` はログインシェルの PATH にしかない（[AD-015](0015-wsl-access-strategy.md)）ため、
実行パスを起動時に 1 回解決して `pathToClaudeCodeExecutable` に渡し、
`bash -lc` を常用しないのが望ましい。

### 5. stdin への書き込みは LF で終端する

Windows 側から `WriteLine` 相当を使うと CRLF が送られ、行末に CR が残る。
JSON パーサは末尾空白を許容するため直ちには壊れないが、**`\n` で明示的に終端する**。
Node の `stdin.write(json + '\n')` は自然にこの形になる。

## Consequences

- X-1（単一セッション起動とストリーミング）の受け入れ条件に
  「中断後に途中出力が残り再開できる」を含められる。signal の問題は解消済み
- **UI に「中断」と「強制終了」の 2 つの操作が要る**。`ui` domain の責務が 1 つ増える
- `supervisor` は `wsl.exe` プロセスのハンドルを保持し、kill できる必要がある
- `still_queued` / `cancelled` の uuid リストを UI に反映できると、
  中断時に「何が残り何が消えたか」を利用者に示せる。Message queue 表示（Tier A）と対になる
- 本測定は `wsl.exe` 経由のみ。**`docker exec -i` 経由は未測定**であり SPIKE-10 で確認する。
  コンテナが 1 段増えるため、特に kill の伝播は改めて確認が要る

## Open Questions

- [ ] `docker exec -i` 経由でも同じ結論が成立するか（SPIKE-10）
- [ ] `wsl.exe` kill 時、`claude` が書きかけだった JSONL transcript が壊れないか。
      壊れるなら「強制終了」の警告文にその旨を含める必要がある
- [ ] `interrupt_receipt_v1` capability が実際に利用可能かは init message の
      `capabilities` で確認する必要がある。古い CLI では空応答になる

## References

- SPIKE-5（docs/roadmap.md）
- [AD-002](0002-use-agent-sdk-not-cli.md) — Agent SDK V1 形式の採用
- [AD-015](0015-wsl-access-strategy.md) — stream-json の疎通と `claude` の PATH
- `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` / `sdk.mjs`
  （公式ドキュメントに機構の記載がないため、パッケージ実体を一次情報とした）
