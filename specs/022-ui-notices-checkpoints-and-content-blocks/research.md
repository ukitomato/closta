# Research: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Date**: 2026-10-22 (`/cl-plan`。夜間の自走) | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本書は design で確かめた事実と、それに基づく判断 (R-xx) を記録する。規則の正本は [data-model.md](./data-model.md)。行番号は 2026-10-22 の作業ツリー (main e79a694 の上) のもの。SDK は `@anthropic-ai/claude-agent-sdk` 0.3.270、`@anthropic-ai/sdk` 0.125.0。

## R-01 B 節の照合の基準 — Agent SDK の型が参照する union を辿る (U-7)

**事実**

- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1` は `import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';`、`:8` は `import type { MessageParam } from '@anthropic-ai/sdk/resources';`。`SDKAssistantMessage.message` は `BetaMessage` (`:3344`)、`SDKUserMessage.message` は `MessageParam` (`:5705`)
- `@anthropic-ai/sdk` は Agent SDK の peer dependency。`package.json` の直接の依存ではないが、`pnpm-workspace.yaml` の `nodeLinker: hoisted` で `node_modules/@anthropic-ai/sdk` (0.125.0。lock も 0.125.0) に置かれる
- `resources/beta/messages/messages.d.mts:2701` の `BetaMessage` は `content: Array<BetaContentBlock>;` (`:2747`)。`BetaContentBlock` (`:2078`) は 17 メンバー: `text`・`thinking`・`redacted_thinking`・`tool_use`・`server_tool_use`・`web_search_tool_result`・`web_fetch_tool_result`・`advisor_tool_result`・`code_execution_tool_result`・`bash_code_execution_tool_result`・`text_editor_code_execution_tool_result`・`tool_search_tool_result`・`mcp_tool_use`・`mcp_tool_result`・`container_upload`・`compaction`・`fallback`
- `resources/messages/messages.d.mts:2037` の `MessageParam` は `content: string | Array<ContentBlockParam>;`。`ContentBlockParam` (`:1748`) は 16 メンバー: `text`・`image`・`document`・`search_result`・`thinking`・`redacted_thinking`・`tool_use`・`tool_result`・`server_tool_use`・`web_search_tool_result`・`web_fetch_tool_result`・`code_execution_tool_result`・`bash_code_execution_tool_result`・`text_editor_code_execution_tool_result`・`tool_search_tool_result`・`container_upload`
- 各メンバーは `export interface X {` で、トップレベルに `type: 'x';` を持ち、`extends` を使わない
- 今の B 節は 10 行 (assistant 6・user 4)。照合で assistant 側 11 行・user 側 12 行が足りない (spec U-7 の見込みと同じ)。照合の後は 33 行

**判断**

- 照合の基準は `sdk.d.ts` の import の specifier から型のファイルを決め、`BetaMessage.content` → `Array<X>` → `X` の union → 各メンバーの interface の `type` の literal の順で辿る (user 側も同じ)。union の名前を固定で書かず import から辿るので、Agent SDK が参照する型を変えたときも辿れる。辿れなかったら違反 (「入力が無い」と同じ扱い)
- 識別子は今の B 節と同じ `<role>/<type>`
- 版は `node_modules/@anthropic-ai/sdk/package.json` の `version` を読み、対応表の冒頭の 2 行目の `SDK:` の行 (`SDK: \`@anthropic-ai/sdk\` 0.125.0`) と照合する。Agent SDK の版の行の正規表現 (`parseCoverage`) は `claude-agent-sdk` に固定されているので、別の正規表現で読む
- 読む経路は cwd からの相対の `node_modules/@anthropic-ai/sdk/` (項目 21 の `SDK_DIR` と同じ扱い)。hoisted の配置に依存する。配置が変わって読めなければ違反になり、CI で気づける (RK-03)

**退けた案**

- (b) 今の 10 行を固定の一覧にする — spec U-7 で退けた
- `@anthropic-ai/sdk` を直接の依存に足して版を固定する — Agent SDK の peer の範囲と別に版を持つことになり、Agent SDK が実際に参照する型からずれうる。依存を増やさない

## R-02 coverage.mjs の読み方の拡張

**事実**

- `scripts/ui-coverage/coverage.mjs` は `typeAliasBody` (type alias の本体)・`objectTopLevelText`・`unionMemberNames` で A / C / E を読む。interface の本体を読む関数は無い
- `checkCoverage` は A / C / E を集合で比べ、B / D / F / A' は書式だけを見る。`LOWER_BOUNDS = {A:39, C:45, E:38}`
- 項目 21 (`scripts/constitution/check.mjs:1329-1389`) は入力 5 つ (`sdkDts`・`toolsDts`・`sdkPackage`・`table`・`roadmap`) を cwd から読み、無ければ違反。`tests/ui-coverage/item21.test.ts` は一時のリポジトリの形を作って項目 21 を流す

**判断**

- `interfaceBody(text, name)` を足す (`export interface <name> {` の位置から括弧の対応で本体を取る。既存の `objectTopLevelText` でトップレベルのフィールドを読む)。`BetaMessage` / `MessageParam` は interface、`BetaContentBlock` / `ContentBlockParam` は type alias
- 新しい入力は 3 つ: `betaMessagesDts` (`node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.mts`)・`messagesDts` (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.mts`)・`anthropicSdkPackage` (`node_modules/@anthropic-ai/sdk/package.json`)。specifier から決めたパスが上の 2 つと違えば違反 (R-01 の「辿れなければ違反」)
- `LOWER_BOUNDS.B = 33`
- fixture は `tests/ui-coverage/coverage.test.ts` に 4 つ (B の行が足りない・余る・`@anthropic-ai/sdk` の版が違う・入力が無い)。`item21.test.ts` の一時のリポジトリに 3 つのファイルを足す (今の fixture の形に揃える)

## R-03 知らせの類の行 — 変換を domain に 1 つ置く (FR-002 / FR-012)

**事実**

- O-2 の行は `toSystemEventMessage(raw, createdAt)` (`src/domain/session/system-event.ts:124`) が `type: 'system'` の Hook / task の subtype だけを作る。実行中は `sdk-agent-session.ts:937` の `taskRows.build(...)`、過去ログは `transcript.ts:301` の `taskRows.build({...asRecord(rec.message), type: 'system'}, ...)` で、どちらも `foreground-tasks.ts` の `createTaskRowBuilder` を通る
- O-6 / O-10 の行 (`informational`・`model_refusal_fallback`・`model_refusal_no_fallback`・`elicitation_complete`・`conversation_reset`) は agents の `live-signals.ts` だけが作る (`:628-701`・`:839`)。過去ログには経路が無く、伏せ字つきの system の本文になる
- `conversation_reset`・`tool_use_summary`・`active_goal`・`prompt_suggestion` は `SDKMessage` のトップレベルの `type` で、`sdk-agent-session.ts:884-960` の switch の `case 'conversation_reset'` 以外は `default:` で捨てる
- 過去ログの `SessionMessage` の `type` は `'user' | 'assistant' | 'system'` だけで、`message` は `unknown`。トップレベルの種類が過去ログにどう残るか (`system` の記録の `message.type` か、残らないか) は確かめていない (spec U-9 / Assumptions)

**判断**

- 新設の `src/domain/session/notice-rows.ts` に `toNoticeRow(raw, createdAt, fallbackId)` を置き、FR-002 の 7 つと O-6 / O-10 の 5 つ (計 12 の種類) の行を作る。判別子は `type === 'system'` なら `subtype`、それ以外は `type` (data-model §1.1)
- `live-signals.ts` の O-6 / O-10 の行の組み立ては `toNoticeRow` を呼ぶ形にし、副作用 (`model_refusal_fallback` の `retractIds`) だけを残す。変換の関数は 1 つ (FR-012)。`pickKey`・`countToken`・`refusalCategory`・`isMcpName` など行に使う小さな関数は、domain に無いものを `notice-rows.ts` に移す (agents から domain を import する向きはそのまま。Principle VII)
- 過去ログは `transcript.ts` の system の記録の分岐で、`taskRows.build` が `null` を返したら `toNoticeRow` に渡す。**判別子を元の `message.type` から取る**: 今の `{...asRecord(rec.message), type: 'system'}` は `type` を上書きするので、上書きの前の `message.type` が `system` 以外の文字列ならそれを判別子にする (data-model §1.1)。`toNoticeRow` も `null` を返したら今の伏せ字つきの本文のまま (U-9)
- `elicitation_complete` の id の代わりは、実行中は今どおり `randomUUID()`、過去ログは記録の `uuid` (無ければ記録の位置の id)。`fallbackId` で呼び出し元が渡す (domain は乱数を持たない)

## R-04 知らせの類の status と既存の status の再利用

**事実**: `SYSTEM_EVENT_STATUSES` は 22。O-6 の `warning` / `notice` は 1 回の出来事で終わり (`isTerminalSystemEventStatus`)、`completed` / `failed` も終わり。`running` / `pending` は終わりではなく、終わりの来ない行は「結果不明」と描かれる

**判断**: 新しい status を足さない (22 のまま)。7 つの category の行はどれも 1 回の出来事なので終わりの status だけを使う (data-model §1.3)。`notification` の `high` / `immediate` は `warning` (注意の見た目・読み上げ)、`low` / `medium` は `notice`。`files_persisted` は失敗があれば `failed`、無ければ `completed`。`mirror_error` は `failed`。`active_goal` の `null` は `completed`、それ以外は `notice`

## R-05 `notification` の 1 行へのまとめ (FR-003)

**事実**: `mergeSystemEvent` は同じ id の後続を前の行の位置で書き換える (`opens` は前のまま、`detail` は空でなければ次の値)。O-6 の `informational` は同じ `tool_use_id` を同じ id にしてまとめている

**判断**: 行の id を `notification:<key>` にする。`key` は Claude Code の内部の識別子で未信頼なので、形の検査 (`/^[A-Za-z0-9_.:-]{1,64}$/`) を通したものだけを id に使い、外れたら `notification:<uuid>` (まとめない)。後続も `opens: true` で送る (前の行が消えていても作り直せる。`informational` と同じ)

## R-06 `memory_recall` の運ぶ値 (FR-005)

**事実** (`sdk.d.ts` の `SDKMemoryRecallMessage`): `mode: 'select' | 'synthesize'`、`memories[]` の各項目は `path` (絶対パス・`<synthesis:DIR>`・organization のときの https URL)・`scope: 'personal' | 'team' | 'organization'`・`content?`

**判断**

- `detail` に `mode`・件数・scope ごとの数・要約の件数を、`name` にファイル名の末尾 (O-11 で domain に移した `path-tail.ts` の `pathTail`) を改行区切りで最大 20 件 (超えた分は件数) 載せる。URL は host だけ、`<synthesis:...>` は名前に出さず要約の件数に数える
- `content` と絶対パスは読まない (末尾を切り出した後の文字列だけを運ぶ)。`pathTail` は会話由来の文字列の切り出しで、アプリのパスの値ではない (AD-049 Decision 5 / O-11 research R-05 と同じ。Principle I)
- 末尾の文字列にも `sanitizeBody` 相当の 1 行化と伏せ字 (`redactedBodyLine`) を通す

## R-07 `files_persisted` の運ぶ値 (FR-006)

**事実** (`SDKFilesPersistedEvent`): `files[{filename, file_id}]`・`failed[{filename, error}]`・`processed_at`

**判断**: 両方が空なら行を作らない。`detail` は保存の件数と失敗の件数と、最初の失敗の理由 (伏せ字と切り詰め)。`name` は保存と失敗のファイル名 (伏せ字・1 行化、最大 20 件、超えた分は件数)。`file_id`・`processed_at` は読まない。id は `files-persisted:<uuid>`。巻き戻し・開く操作を持たない (AD-049 Decision 6)

## R-08 `server_tool_use` と結果のブロック — DTO の part を足す (FR-007 / FR-008)

**事実**

- `BetaServerToolUseBlock` は `{id, input, name, type, caller?}`。`name` は `advisor` / `web_search` / `web_fetch` / `code_execution` / `bash_code_execution` / `text_editor_code_execution` / `tool_search_tool_regex` / `tool_search_tool_bm25`
- `BetaWebSearchToolResultBlock` は `{content, tool_use_id, type}`。`content` は `BetaWebSearchToolResultError` (`error_code` 6 値) か `BetaWebSearchResultBlock[]` (`encrypted_content`・`page_age`・`title`・`type`・`url`)
- Claude Code はブロックを別々の SDK の assistant のメッセージに分けて送る (O-2 の tool_use と tool_result の送り直しと同じ前提)。`server_tool_use` と結果のブロックが同じメッセージに来るとは限らない
- 今の tool-call の part の `result` は文字列 (tool_result の本文) で、assistant-ui の tool-call に `result` として渡る。`useToolResultState` が thread の context から結果の状態 (結果待ち・結果不明) を引く (O-6)

**判断**

- DTO に `server-tool-call` の part を足す: `{toolCallId, toolName, argsText, truncated, result: ServerToolResultDTO | null}`。`ServerToolResultDTO` は `web-search` (Sources)・`error` (エラーの種類)・`unsupported` (結果のブロックの種類の名前) の 3 つ。tool-call の part に Sources を JSON の文字列で入れる案は、信頼の印を argsText / result と同じ名前空間に置くことになり (PR-H-1 と同じ問題)、型で縛れないので退けた
- 結果のブロックは、同じ id の `server-tool-call` があればその `result` に埋め、無ければ `result` を持つ孤児の `server-tool-call` (`toolName` は空) として単独で出す (O-2 の孤児の結果と同じ)。実行中は `live-tool-results.ts` の追跡に server-tool-call の id を足して前のメッセージを送り直し、過去ログは `transcript.ts` が id の表で埋める (data-model §2.3)
- `encrypted_content`・`page_age`・`caller` は運ばない。`input` は tool_use と同じ `argsText` の無害化 (`sanitizeBody` とバイトの上限)
- renderer では `convert.ts` が assistant-ui の tool-call に写し、args に信頼の印 `__serverTool` (Sources などの結果) を載せる。argsText 由来の `__` のキーは今どおり `stripInternalKeys` で剥がす。registry は `__serverTool` を先に見て `ServerToolCall` の表示に振り分ける

## R-09 Sources のリンクの経路 (FR-009)

**事実**

- `src/main/app/window.ts` の `openExternalIfHttp` (http / https だけを `shell.openExternal`) が `setWindowOpenHandler` と `will-navigate` に配線されている
- renderer の `lib/safe-url.ts` の `safeUrlTransform` が markdown のリンクの URL を絞る。`web-tool-heading.ts` の `webFetchHeading(url)` は host だけ (長さの上限 256) を返す

**判断**: 項目は `<a href={url} target="_blank" rel="noreferrer noopener">` で描き、新しい窓の要求を main の `setWindowOpenHandler` → `openExternalIfHttp` で開く (main の変更なし。SC-007)。renderer は http(s) の形の URL だけを `href` にし、それ以外はタイトルと host の文字列だけ。host は `webFetchHeading` を使う。renderer は URL を取得・プレビューしない。domain は URL を長さの上限 (2048 バイト) と制御文字の除去だけで運び、http(s) でなければ空にする (data-model §2.2)

## R-10 Inline citation を組まない (U-5)

**事実**: text のブロックの `citations` は `MarkdownText` の本文の位置を指す。O-6 (AD-034) の markdown の XSS の境界は `markdown-text.tsx` の 1 か所

**判断**: `citations` は読まない (今どおり本文だけ)。F 節の Inline citation は `未使用` (備考に U-5)

## R-11 `user/document` を File element に (FR-010)

**事実**

- 今の `transcript.ts:244` は `document` を `{type: 'file', filename: documentName(b), text: ''}` にし、`documentName` (`:129`) は `title` を無害化しない。`text` は常に空
- `convert.ts:74-76` は file を `📎 filename` の text に写す
- assistant-ui の `FileMessagePart` は `{filename?, data, mimeType, sourceType?: 'url' | 'id'}`。registry の `components/file.tsx` は `sourceType: 'id'` のときダウンロードのリンクと大きさを出さない。名前の既定 "Unnamed file" と "Download" は英語
- `DocumentBlockParam.source` は `base64` (`media_type: 'application/pdf'`)・`text` (`'text/plain'`)・`content`・`url` (PDF)・`file` (`file_id`)

**判断**: file の part を `{filename, mediaType}` にし、`text` を消す (`TRANSCRIPT_PART_FIELDS` の固定テストを同じ PR で直す)。`filename` は `title` を 1 行化と伏せ字と切り詰め (120) に通す。`mediaType` は `base64` / `url` → `application/pdf`、`text` → `text/plain`、他は空。`convert.ts` は assistant-ui の file に `data: ''`・`sourceType: 'id'` で写し、名前が空なら `labels.ts` の文言を入れる (英語の既定を出さない。Principle VIII / XV)。中身 (`source.data`) は読まない

## R-12 知らないブロックの印 (FR-011 / U-8)

**事実**: 実行中は `live-message.ts:76` の `default:`、過去ログは `transcript.ts:248` の `default:` で、知らないブロックを捨てる

**判断**: DTO に `unsupported-block` の part (`{blockType}`) を足す。`blockType` は `/^[a-z][a-z0-9_]{0,63}$/` に合えばその値、外れたら空。中身は読まない。実行中と過去ログの両方の `default:` と、`server-tool-call` の結果の種類の外のブロック (`mcp_tool_use` など) で使う。renderer は data part (名前 `unsupported-block`) に写し、assistant と user の両方の Parts で 1 行の印を描く。実行中の user の content は今どおり tool_result だけを読む (user の text を出さない。O-11 U-11) ので、user の印は過去ログの主ループだけ (過去ログの subagent の user の記録も tool_result だけ)。過去ログの user の記録は role を見て許可一覧の外を印にする (design-gate H-001 / H-002 の修正。spec U-10 / U-11。規則の正本は data-model §2.2)

## R-13 query の options と境界

**事実**: `QUERY_OPTION_KEYS` は 12 (AD-059)。`SESSION_EVENT_KINDS`・`AGENT_SDK_ALLOWED_CALLS`・`METER_UPDATE_TYPES`・IPC・preload・main は本 feature の経路に要らない

**判断**: どれも変えない (SC-007)。`promptSuggestions` を渡さないので `prompt_suggestion` は届かない (U-1)。新しい行は `message` の `SessionEvent` で運ぶ (O-8 の `receivedMessages` に数える。FR-017)

## R-14 共有のブロックの変換 (FR-007 / FR-010 / FR-011)

**事実**: 実行中 (`live-message.ts` の `toLiveAssistantMessage`) と過去ログ (`transcript.ts` の `convertBlocks`) はブロックの変換を別々に持つ (text / thinking / redacted_thinking / tool_use は両方に同じ規則がある)

**判断**: 新設の `src/domain/session/content-blocks.ts` に、本 feature が足すブロック (`server_tool_use`・結果のブロック・`document`・知らないブロック) の part の組み立てを置き、両方の `switch` から呼ぶ。既存の 4 種類の規則は動かさない (差分を小さくする。今の規則はテストで固定されている)

## R-15 renderer の網羅の表

**事実**: `thread.aui.tsx` の `SystemEventRow` (`SYSTEM_EVENT_ICONS`・`systemEventDetailText`・`isWrappedCategory`)・`features/chat/labels.ts`・`transcript-announcements.ts` の `rowAnnouncement` は category の網羅の表 (`Record<SystemEventCategory, …>`) を持つ

**判断**: 7 つの category を足すと型で落ちる (意図した失敗。O-11 の RK-10 と同じ)。各表に足す。読み上げは `notification` の `warning`・`mirror_error`・`files_persisted` の `failed` だけ (spec の [ASSUMED] の読み上げの量)
