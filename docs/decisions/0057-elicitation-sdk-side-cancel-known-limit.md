---
status: accepted
date: 2026-10-18
id: AD-057
deciders: ukitomato
tags: [session, sdk, mcp, ipc, scope]
supersedes: []
superseded-by: []
---

# AD-057: SDK の側で中断された Elicitation のカードは残す (AD-053 Decision 3 の読み替え)

## Context

[AD-053](0053-elicitation-callback-and-user-dialog.md) Decision 3 は「応答した時点・中断 (`signal`)・セッションの終了で renderer と agents の保持を捨てる」と定めた。しかし実装と [spec 018](../../specs/018-session-answer-ui-and-composer-commands/spec.md) の U-10 (2026-10-17 利用者承認) は、SDK の側だけで中断された Elicitation (MCP 側のタイムアウトなど) を renderer に知らせるイベントを足さず、カードが残ることを既知の限界としている。ADR は accepted 後に immutable ([AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md)) なので、AD-053 は直さず本 ADR で読み替えを記録する (pr-gate R1 architecture H-001)。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-053 Decision 3 の「中断 (`signal`) で renderer と agents の保持を捨てる」 | agents は `signal` で保持を捨て `cancel` を返す。renderer には知らせない。renderer が捨てるのは、応答・ターンの中断・セッションの終了 (終了・強制終了)・閉じる・失敗のとき |

## Decision

1. SDK の側だけの中断 (ターンを続けたままの MCP 側のタイムアウトなど) を renderer に知らせる `SessionEvent` は足さない。カードは残り、押せば外れる。agents は知らない要求として何もしない
2. 入力の値は renderer の component の state にだけあり、永続化・ログ・transcript に載せない (AD-053 Decision 3 の他の部分は変えない)
3. 知らせるイベントが要るかは、実機でこの状況が起きる頻度を確かめてから別の ADR で決める

## Consequences

- 残ったカードに答えても MCP サーバー側には届かない (agents は何もしない)。利用者には「効かない」ように見えうる
- `SessionEvent` の種類は 9 のまま増えない

## Alternatives

- **知らせるイベントを足す** — 種類が増え、頻度が不明なまま契約を広げる。U-10 で見送り
- **renderer が定期的に生存を確かめる** — 経路が増える

## Confirmation

- spec 018 の US-2 AC7 と Edge Cases の記述が本 ADR と一致する
- quickstart で実機の発生頻度を記録する (起こせなければ未確認として残す)
