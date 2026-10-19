---
status: accepted
date: 2026-10-17
id: AD-054
deciders: ukitomato
tags: [session, sdk, ui, hooks, subagent]
supersedes: []
superseded-by: []
---

# AD-054: query の options に `includeHookEvents` と `forwardSubagentText` を足す (AD-041 (g) の読み替え)

本 ADR は O-11 ([spec 019](../../specs/019-ui-hooks-tasks-subagents-and-notices/spec.md)) が夜間の自走で起こした (spec 019 の U-2 / U-5)。本 ADR と spec 019 の U-1〜U-11 は 2026-10-17 に利用者が承認した。承認の前に、先にマージされた O-10 ([AD-053](0053-elicitation-callback-and-user-dialog.md)) の `onElicitation` との和集合にキーの数を直した (Decision 4 の適用)。

## Context

O-11 は対応表の D 節の Tier A 3 行のうち、一般の Hook (`general-hooks`) と実行中の subagent の入れ子 (`subagent-nesting-live`) を表示する。どちらも、SDK が既定では emit しないメッセージを要る。

- **一般の Hook**: SDK は既定で SessionStart / Setup の Hook だけを `hook_started` / `hook_response` で出す。PreToolUse・PostToolUse・Stop などの Hook は `includeHookEvents: true` のときだけ出る (`sdk.d.ts:1722-1731`)
- **subagent の本文**: SDK は既定で subagent の `tool_use` / `tool_result` だけを `parent_tool_use_id` 付きで出す。subagent の text / thinking は `forwardSubagentText: true` のときだけ出る (`sdk.d.ts:1737-1743`。「入れ子の transcript を描けるように」と説明がある)

query の options のキー集合は [AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) で `QUERY_OPTION_KEYS` に固定され、`src/agents/session-core.test.ts` の pin テストがリテラルで守る。集合を変えるには ADR が要る ([AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P1)。O-10 の [AD-053](0053-elicitation-callback-and-user-dialog.md) が `onElicitation` を足し、今は 9 キーである。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-041 (g) (`QUERY_OPTION_KEYS` の 8 キー。AD-053 の読み替えで 9 キー) / AD-036 §4 P1 / 005 contracts C-4 | `includeHookEvents` と `forwardSubagentText` の 2 キーを足し 11 キーにする (Decision 1)。他のキー (AD-053 の `onElicitation` を含む) と AD-041 (g) の「escalation-neutral だけを足す」の判定は変えない |

## Decision

1. **`QUERY_OPTION_KEYS` に `includeHookEvents` と `forwardSubagentText` を足す。** 値は `buildQueryOptions` が組むリテラルの `true` だけで、型も `true` に閉じる。起動の入力・IPC・プリセット・Provider の設定からは渡さない (利用者が切り替える設定にしない)
2. **2 キーは escalation-neutral である。** どちらも出力のメッセージを増やすだけで、権限の面・tool の集合・env・Hook の実行そのものを変えない。Hook はこの option の有無にかかわらず Claude Code の設定どおり実行される
3. **増えたメッセージは既存の許可リストを通す。** 一般の Hook の `hook_started` / `hook_response` は O-2 の `toSystemEventMessage` (011 data-model §2) をそのまま通し、出力本文 (`stdout` / `stderr` / `output`)・終了コードを読まない。`hook_progress` は今どおり表示しない。subagent の text / thinking は主ループと同じ無害化 (`sanitizeBody`) を通す
4. **他の読み替えとの合流。** 同じ (g) を読み替える枝と集合が重なったら、後にマージする PR が和集合で pin テストを直す (どちらの ADR も本文を変えない)。O-10 (AD-053) が先にマージされたので、本 ADR の PR が `onElicitation` を含む 11 キーで pin テストを直す

## Consequences

- 1 つのターンのメッセージ数が増える (tool ごとの PreToolUse / PostToolUse の Hook、subagent の本文)。O-8 の観測点 `receivedMessages` の基準が変わる (roadmap の O-8 の行の (c) に並べて書く)
- subagent のメッセージを主ループの transcript に平らに出さず、親の `Agent` の呼び出しの入れ子にする処理が agents に要る (spec 019 の FR-007〜FR-009)
- Hook の名前 (`hook_name`) の形の規則 (O-2 pr-gate R2 security L-101 の allowlist) は、一般の Hook にもそのまま当たる

## Alternatives

- **渡さない** — D 節の Tier A 2 行が出せず、M3 が閉じない
- **起動のダイアログで切り替えられるようにする** — 起動の入力・プリセットのスキーマ・IPC が広がる。表示の量は表示側で抑えられる
- **`includeHookEvents` だけを足す** — 実行中の入れ子は tool の呼び出しだけになり、subagent が何を言ったかは過去ログでしか読めない

## Confirmation

- `src/agents/session-core.test.ts` の pin テストが 11 キー (AD-041 (g) の 8・AD-053 の `onElicitation`・本 ADR の 2) と一致する。`buildQueryOptions` の単体テストで 2 キーの値が `true` のリテラルである
- 項目 16 の options の検査が 2 キーを許し、他の allowlist 外キーでは今どおり発火する
- quickstart: 一般の Hook (PreToolUse など) の行が出ること、`hook_name` の実際の形、subagent の text が `parent_tool_use_id` 付きで届くことを実機で記録する
