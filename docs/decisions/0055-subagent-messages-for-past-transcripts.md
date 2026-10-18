---
status: accepted
date: 2026-10-17
id: AD-055
deciders: ukitomato
tags: [session, sdk, ui, subagent, principle-iv]
supersedes: []
superseded-by: []
---

# AD-055: 過去ログの subagent の本文を `getSubagentMessages` で読む (AD-035 Decision 3 の読み替えと許可リストの追加)

本 ADR は O-11 ([spec 019](../../specs/019-ui-hooks-tasks-subagents-and-notices/spec.md)) が夜間の自走で起こした (spec 019 の U-5 / U-8)。U-8 (agentId を `listSubagents` で列挙する) は design (`/cl-plan`) で SDK 0.3.270 を確かめた結果による書き直しである。本 ADR と spec 019 の U-1〜U-11 は 2026-10-17 に利用者が承認した。

## Context

[AD-035](0035-tier-a-tool-display-and-subagent-nesting.md) Decision 3 は、subagent の入れ子を `parent_tool_use_id` で組み、`getSubagentMessages` は使わないと決めた (新しい SDK の呼び出しと agentId の列挙が要り、R-4 の範囲を超えるため)。過去ログに subagent の本文が inline に無いセッションでは Task のカードと inline の分までを示し、完全な入れ子は「`getSubagentMessages` の導入時」の課題とした。

SDK は subagent の transcript を親のセッションとは別のファイル (`<sessionId>/subagents/agent-<agentId>.jsonl`。`sdk.d.ts:1050`) に置く。`getSessionMessages` の結果に subagent の本文が入らないなら、過去ログの Subagent の表示は中身が空になる。O-11 は実行中の入れ子を stream から組む ([AD-054](0054-query-options-hook-events-and-subagent-text.md)) ので、同じセッションが実行中には入れ子で見え、過去ログでは見えない。

Agent SDK の呼び出しの許可リスト (`AGENT_SDK_ALLOWED_CALLS`。`listSessions` / `getSessionMessages` / `query`) を広げるには ADR が要る (AD-036 §4)。

SDK 0.3.270 で確かめた事実 (spec 019 の design):

- 過去ログの経路 (`getSessionMessages`) には agentId を運ぶ構造が無い。`SessionMessage` は `type` / `uuid` / `session_id` / `message` / `parent_tool_use_id` / `parent_agent_id` だけを持つ (`sdk.d.ts:5903-5916`)。agentId を構造で持つ `AgentOutput.agentId` (`sdk-tools.d.ts:103-105`) は実行中の `SDKUserMessage.tool_use_result` (`sdk.d.ts:5709`) にしか届かない。主のセッションの `getSessionMessages` は sidechain の行を落とすので、subagent の本文は inline にも無い
- `listSubagents(sessionId)` (`sdk.d.ts:1057`) は、そのセッションの subagent の agentId の列を返す
- `getSubagentMessages(sessionId, agentId)` (`sdk.d.ts:844`) は、subagent の meta ファイルの `toolUseId` (親の `Agent` の呼び出しの id) を各メッセージの `parent_tool_use_id` に入れて返す (`sdk.mjs:202`)。user / assistant の行だけを返し、system の行 (会話の圧縮の境界など) は返さない

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-035 Decision 3 (「`getSubagentMessages(sessionId, agentId)` は使わない」) と Consequences の Trade-off | 過去ログの取得で使う (Decision 1)。一次鍵は `parent_tool_use_id` のまま。inline に本文がある subagent は今どおり |
| `scripts/constitution/allowlists.mjs` の `AGENT_SDK_ALLOWED_CALLS` (AD-034 / AD-036 §4) | `listSubagents` と `getSubagentMessages` を足す (3 → 5)。2 つは `src/agents/read-transcript.ts` でだけ呼べる (項目 14 に呼び出しごとのファイルの制限を足す)。書き込み系の API は足さない |

## Decision

1. **`listSubagents` と `getSubagentMessages` を許可リストに足し、過去ログの取得の経路だけで呼ぶ。** 呼ぶのは `src/agents/read-transcript.ts` (AD-034 の取得プロセス) だけで、読み取り専用である。実行中のセッションでは呼ばない (入れ子は stream から組む。AD-054)。項目 14 は 2 つの呼び出しを他のファイルで見つけたら発火する
2. **agentId は `listSubagents` で列挙し、親の `Agent` の呼び出しとは `getSubagentMessages` が返す `parent_tool_use_id` で結ぶ。** `parent_tool_use_id` は SDK が subagent の meta ファイルの `toolUseId` から付ける構造で、列挙の順番には頼らない。tool の結果の文面 (モデル向けの agentId の後置き) を解析して agentId を取らない (会話由来の文字列で、偽れる)。`parent_tool_use_id` が null の subagent・親の呼び出しが過去ログに無い subagent は入れ子にしない (AD-035 Decision 3 のまま。Task のカードと inline の分)。親の呼び出しに inline の子が既にあるときは読んだ本文で重ねない
3. **読んだ本文は過去ログの変換と同じ規則を通す。** 無害化・切り詰め (AD-035 Decision 6)、入れ子の健全性 (AD-035 Decision 5 の id・循環・深さの上限)、DTO の `children` (Decision 4)。1 つの過去ログで読む subagent の数と 1 つの subagent のメッセージの数に上限を置き、超えた分は読まない (上限の値は spec 019 の [ASSUMED])
4. **失敗しても過去ログ全体を失敗にしない。** subagent のファイルが無い・読めないときはその subagent を inline の分だけで描く

## Consequences

- 過去ログの取得で subagent ごとにファイルを読む。取得は AD-034 の取得プロセスで走るので main は塞がない (Principle IX)
- Constitution Principle IV の Statement (SDK の API でセッションを読み、JSONL を自前で読まない) に合う。本文は変えない
- 項目 14 の出力の許可の列が 5 つになり、呼び出しごとのファイルの制限が 1 つの仕組みとして増える
- subagent の system の行 (会話の圧縮の境界) は過去ログの入れ子に出ない (SDK が返さない)

## Alternatives

- **AD-035 Decision 3 のまま** — 過去ログの Subagent の表示が空のままで、実行中と見え方が分かれる
- **列挙の順番で親の呼び出しと結ぶ** — 順番の対応は SDK が保証しない。誤った入れ子を作りうる。Decision 2 は順番ではなく SDK が付ける `parent_tool_use_id` で結ぶので、この理由に当たらない
- **agentId を SDK が構造で渡す subagent だけを読む (`listSubagents` を足さない)** — SDK 0.3.270 の過去ログの経路には agentId を運ぶ構造が無く、呼ばれない経路とテストだけが残る (この ADR の最初の版の Decision 2)
- **tool の結果の文面から agentId を取る** — 会話由来の文字列で、偽の入れ子を作れる (AD-035 の design-gate PR-H-1 と同じ種類)

## Confirmation

- 項目 14 が `listSubagents` / `getSubagentMessages` を `read-transcript.ts` でだけ許し、`read-transcript.ts` の外で 2 つを呼ぶ fixture で発火する
- `read-transcript.ts` / `transcript.ts` の単体テスト (偽の SDK): 結べる subagent が入れ子になる・`parent_tool_use_id` が null や親の無い subagent と読めないファイルは inline の分だけ・上限を超えた分は読まない・深さの上限
- quickstart: subagent を使った過去ログで入れ子の本文が出ることを実機で記録する
