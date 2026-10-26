---
status: accepted
date: 2026-10-27
id: AD-061
deciders: ukitomato
tags: [ui, session, contract]
supersedes: []
superseded-by: []
---

# AD-061: O-12 が広げた session の契約 (知らせの category・part・agents の分岐)

[AD-060](0060-content-block-verification-and-unsupported-block-mark.md) の Decision は B 節の機械照合と知らないブロックの印 (`unsupported-block`) だけを決めた。O-12 ([spec 022](../../specs/022-ui-notices-checkpoints-and-content-blocks/spec.md)) の実装は、それに加えて下の 4 つの集合・形を広げた。「集合を変えるには ADR が要る」([AD-053](0053-elicitation-callback-and-user-dialog.md) Decision 6 / [AD-056](0056-o11-scope-background-task-list-and-o12-split.md) の前例) の対象だが AD-060 には書かれていなかったので、pr-gate round 1 (H-002) の指摘を受けて本 ADR で書く。AD-060 は accepted で immutable のため書き足さない。本 ADR は夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用し、2026-10-27 に accepted とした。規則の詳細の正本は [data-model.md](../../specs/022-ui-notices-checkpoints-and-content-blocks/data-model.md) §1 / §2 / §4。

## Decision

1. **システムイベントの行の category を 13 から 20 にする。** 足すのは知らせの類の 7 つ: `notification` / `local-command-output` / `tool-use-summary` / `active-goal` / `mirror-error` / `memory-recall` / `files-persisted`。変換は `src/domain/session/notice-rows.ts` の純粋関数 `toNoticeRow` 1 つで、実行中と過去ログが共有する。読まないフィールドの値は DTO に入らない
2. **`TRANSCRIPT_PART_FIELDS` に part `server-tool-call` を足す。** サーバー側の tool (`server_tool_use` と結果のブロック) の呼び出しと結果を 1 つの part にする。形は `type` / `toolCallId` / `toolName` / `argsText` / `truncated` / `result` (`result` は `null` か `ServerToolResultDTO` = `web-search` / `error` / `unsupported` の 3 つ)。結果のブロックを同じ id の呼び出しの part に寄せる対応づけは、過去ログは `transcript.ts`、実行中の同じメッセージの中は `live-message.ts`、実行中の別のメッセージにまたがるものは `live-tool-results.ts` の `applyServerResults` (埋めた呼び出しのメッセージを送り直す) が行う。対応の無い結果は孤児の part として出す (data-model §2.3)
3. **`file` part の形を `{type, filename, text}` から `{type, filename, mediaType}` に変える。** `text` (O-12 の前から常に `''`) を消し、`mediaType: DocumentMediaType` (`'application/pdf'` / `'text/plain'` / `''`) を足す。`TRANSCRIPT_PART_FIELDS.file` は `[type, filename, mediaType]`。`document` ブロックの変換は `content-blocks.ts` の `documentPart` で、過去ログの変換 (`transcript.ts`) から呼ぶ。`filename` は `title` か `source.filename` を伏せ字と 120 コードポイントの切り詰めに通し (名前が無ければ英語の既定 `'document'` でなく `''`)、`mediaType` は `source.type` から決める (`base64` / `url` → PDF、`text` → text、他 → `''`)。`source.data` などの中身は運ばない (data-model §2.1 / §2.2)。`unsupported-block` (AD-060 Decision 3) と合わせて、part の集合と形の変更は本 ADR と AD-060 で完結する
4. **agents の `system` メッセージの分岐に 5 つの subtype と、最上位の `tool_use_summary` / `active_goal` の分岐を足す。** 5 つの subtype (`notification` / `local_command_output` / `memory_recall` / `mirror_error` / `files_persisted`) は `live-signals.ts` の `onSystem` の switch に足す。`sdk-agent-session.ts` の stream の switch には `case 'tool_use_summary'` を足し、`active_goal` は `SDKMessage` の union の外なので `default:` の中の型ガード (`asRecord(message)?.type === 'active_goal'`。cast しない。spec U-13) で受けて、どちらも新設の `signals.onNotice` に渡す。agents はメッセージを未信頼のまま `toNoticeRow` に渡し、`uuid` と表示に要るフィールドだけを `toNoticeRow` が読む。`preceding_tool_use_ids` など読まないフィールドは読まない

## Consequences

- 上の集合を再び変えるときは、本 ADR を supersede する ADR を起こす
- ui / session の charter の `related_adrs` に本 ADR と AD-060 を載せる
- `system-event.test.ts` の category の集合の test は本 ADR と AD-053 / AD-056 を根拠に引く

## Confirmation

- `src/domain/session/system-event.test.ts` の category の集合 (20)、`transcript-dto` の part の表、`notice-rows` の単体テスト
