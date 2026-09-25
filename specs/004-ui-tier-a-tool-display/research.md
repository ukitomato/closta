# Research: Tier A tool 表示 (R-4)

[plan.md](plan.md) の Phase 0。**着手前に潰す不確実性**を列挙し、公式ドキュメント / sdk.d.ts / 実データで
裏取りする。実装で答えが変わる可能性のあるものは「実測課題」として残し `quickstart-results.md` に記録する。

## R-01 tool-UI の name 別登録が `useExternalStoreRuntime` で成立するか

**問い**: R-3 の `thread.aui.tsx` は `part.toolUI ?? <ToolFallback {...part} />` で描画する。
`part.toolUI` を `toolName` 別に埋める公式機構 (`makeAssistantToolUI` / `AssistantToolUI`) が、
backend を持たない `useExternalStoreRuntime` + `AssistantRuntimeProvider` (R-3 の構成) で機能するか。

**調べ方**: `.claude/skills/tools/SKILL.md` と `.claude/skills/runtime/` の external-store 節を読む。
`makeAssistantToolUI({ toolName, render })` の mount 位置 (runtime provider ツリー内) と、
external-store で `part.toolUI` slot が埋まる条件を確認する。

**確定 (2026-09-25)**: **方式 (b) を採る**。R-3 の `thread.aui.tsx` は `useExternalStoreRuntime` で
`part.toolUI ?? <ToolFallback {...part} />` により tool を描画する。`part.toolUI` は AI-SDK 系 toolkit の
name 登録で埋まる slot であり、**external-store では確実に埋まらない**ため、`makeAssistantToolUI` に依存しない。
`tool-registry.aui.tsx` に `toolName → コンポーネント` の map を置き、R-3 の描画点で引く (未登録は `ToolFallback`)。
**利点**: 描画点が 1 箇所に閉じ、runtime 内部機構に依存せず、`ChatScreen.test.tsx` の回帰テストがそのまま番人になる。

**判断基準 (記録)**:
- 方式 (a) (`makeAssistantToolUI` で name 登録) は AI-SDK runtime 前提の slot に依存し external-store で不確実 → 却下
- 方式 (b) (描画点 dispatcher) を採用

**不変** (どちらでも): 未対応 tool は `ToolFallback` に落ちる。登録表は `tool-registry.aui.tsx` の 1 箇所。
**結論は本 feature の ADR に記録**する (plan「起票する ADR」(c))。

## R-02 subagent の親子リンクの実 key (sdk.d.ts + 実データ)

**問い**: Task で起動した subagent の配下メッセージを、どの key で親 Task に対応づけるか。
候補: `parent_agent_id` (subagent 由来の識別子) / `parent_tool_use_id` (親 tool_use への参照)。

**現状分かっていること** ([src/domain/session/transcript.ts](../../src/domain/session/transcript.ts) の
`SessionMessageLike`):
- `parent_tool_use_id?: string | null` と `parent_agent_id?: string | null` の両方が SDK 由来で存在する
- 現 `transcript.ts` は**両方を宣言だけして使っていない** (メッセージを flat に出す)
- [R-3 data-model.md](../003-ui-transcript-rendering/data-model.md) §1 の `SessionMessage` は
  `parent_tool_use_id` / `parent_agent_id` を持つと sdk.d.ts 0.3.270 で確認済み

**調べ方** (R-3 が getSessionMessages を sdk.d.ts 直読で確認したのと同じ):
1. `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` で `parent_agent_id` / `parent_tool_use_id` の
   定義と、Task tool_use の id との関係を読む
2. **実データ** (subagent を使った過去セッション) を 1 本取り、Task の `tool_use.id` と
   配下メッセージの `parent_tool_use_id` / `parent_agent_id` の実値を突き合わせる

**確定 (2026-09-25、sdk.d.ts 0.3.270 直読)**: `SessionMessage` (sdk.d.ts:5903-5916) は次を持つ。
- `parent_tool_use_id: string | null` — **subagent 内で生成されたメッセージのとき、それを起動した Task の
  `tool_use.id`** が入る (SDKAssistantMessage の doc: 「non-null when the message was produced inside a subagent
  started by that tool_use」)。**これが depth-1 subagent ↔ 親 Task の一次リンク鍵**。
- `parent_agent_id: string | null` — 「**この subagent を起動した subagent の agentId**、depth-1 (main が起動) や
  main 自身では null」。**多段ネスト (subagent→subagent) の連鎖鍵**。

**結論**:
- **一次鍵 = `parent_tool_use_id`** (→ Task `tool_use.id`)。位置非依存の id 対応づけ (R-3 の tool_use↔tool_result と同型)。
- **多段 = `parent_agent_id`** の連鎖。ただし SessionMessage は自分の agentId を持たないため、多段の完全な木は
  parent_agent_id だけでは組み切れない場合がある → **depth-1 を一次対応づけ**とし、多段は best-effort + 深さ打ち切り。
- **新規 SDK 呼び出しは不要**: 両フィールドは `getSessionMessages` の返り型にあり、subagent メッセージが
  inline で返る前提で group する。**`getSubagentMessages(sessionId, agentId)` (sdk.d.ts:844) は別途 subagent 専用
  transcript を読む代替**だが、これを使うと新規 SDK 呼び出し = allowlist 変更 + ADR + agentId 列挙が要る。
  **本 feature は getSessionMessages の inline 分のみで nesting を組み、getSubagentMessages は使わない** (targets/scope 据え置き)。
- **`forwardSubagentText`** (sdk.d.ts:1738) は `query()` の live オプションで、既定は「subagent の tool_use/tool_result のみ
  emit」。過去ログ (JSONL) に subagent の text 本文まで記録されているかは録画時設定に依存する。**実データで
  subagent 本文が inline に無いセッションでは、Task カード + inline の subagent tool 実行までを示し、
  完全な subagent 会話 (text/thinking) の入れ子は getSubagentMessages 導入 (別 feature / ADR) に送る** — この限界を
  quickstart-results と data-model §4 に明記し、欠落は起こさない (あるものは全て入れ子で示す)。

**実測課題**: 実データで「getSessionMessages が subagent 本文まで inline で返すか」を確認し
`quickstart-results.md` に記録する (人間 deferred。V-4)。

## R-03 各 tool の args / result の実形 (Claude Code / SDK)

**問い**: 各専用表示が読む args / result の実フィールドは何か。**untrusted narrowing** の対象を確定する。

**現状の想定** (Claude Code の tool 定義。data-model §2 で確定):

| tool | args の主フィールド | result の形 | 専用表示 |
| --- | --- | --- | --- |
| Bash | `command` (`description` / `timeout` は任意) | stdout/stderr を結合した文字列 (`result`) | Terminal block |
| Edit | `file_path` / `old_string` / `new_string` (`replace_all`) | 適用結果の文字列 | Code diff |
| Write | `file_path` / `content` | 適用結果の文字列 | Code diff (全行 add) |
| MultiEdit | `file_path` / `edits[]` (`old_string`/`new_string`) | 適用結果 | Code diff (複数 hunk) |
| TodoWrite | `todos[]` (`content` / `status` / `activeForm`) | 確認文字列 | Todo list |
| Task | `subagent_type` / `description` / `prompt` | subagent の最終 text | Subagent |
| ExitPlanMode | `plan` (markdown) | 承認/却下 | Agent plan |

**調べ方**: Claude Code の tool schema (公式 / SDK 型) と実データで各フィールド名を裏取りする。
**exit status**: Bash の result に exit code が構造的に含まれるかを確認する。**含まれなければ `isError` で
成否のみ示し、exit code は捏造しない** (spec Edge Cases「成否を捏造しない」)。

**判断基準**: 確定したフィールド名を data-model §2 の表に固定する。**フィールドが揃わない実データ
(古い tool 版・別名) は fallback へ安全退避** (FR-009 / SC-005)。narrowing は「形が変わりうる外部形」として書く。

## R-04 element の採用 / 調整 / 自作の判断 (Principle XIII の実名照合)

**問い**: registry の各 element をそのまま採用できるか、調整が要るか、自作が要るか。

**候補** (`.claude/skills/elements/references/standalone-elements.md` で実在確認済み):

| 専用表示 | registry 候補 | props の噛み合わせ | 暫定判断 |
| --- | --- | --- | --- |
| Terminal block | `elements-terminal-block` (`TerminalBlock`) | command + output + exit を渡す形か | 採用 + 調整 (Bash の args/result を props に写す) |
| Code diff | `elements-code-diff` (`CodeDiff` / `DiffLine`) / `reviewable-diff` | `DiffLine[]` を要求 → old/new から hunk を組む純関数が要る | 採用 + 調整 (diff 計算を足す) |
| Todo list | `elements-todo-list` (`TodoList` / `TodoItem`) | `status` の値域が Claude Code (pending/in_progress/completed) と合うか | 採用 + 調整 (status マップ) |
| Subagent | `elements-subagent-list` (`SubagentList` / `SubagentItem`) / `agent-handoff` | 入れ子メッセージの描画は subagent-list に無い可能性 | **採用 + 自作補完の可能性** (入れ子は transcript の再帰描画が要る) |
| Agent plan | `elements-agent-plan` (`AgentPlan`) | plan (markdown) を渡す形か | 採用 + 調整 (R-3 の markdown/XSS 境界を通す) |

**調べ方**: 各 element のインストール単位と props を standalone-elements.md / catalog で確認し、
Claude Code の args/result 形と噛み合わせる。**diff 計算** (old_string/new_string → hunk) は
ライブラリ依存を増やさず純関数で最小実装できるかを確認する (Principle XIII / discovery を汚さない)。

**判断基準**: 採用/調整で足りるものは registry から導入し `.aui.tsx` にする。**自作が要る部分
(subagent 入れ子の再帰描画など) は候補名と不適合理由を PR / ADR に実名で記す** (FR-013 / Principle XIII Exceptions)。
**registry element がソース同梱で dependency を増やさない**ことを確認し discovery.md を汚さない。

## R-05 巨大 diff / 巨大 result の切り詰めと main 経路の維持

**問い**: 巨大 tool_result / 巨大 diff を専用表示で扱っても、R-3 の「main を本文経路から外す」
(SC-007) と「本文サニタイザの上限」(FR-016/017) を回帰させないか。

**現状** ([transcript.ts](../../src/domain/session/transcript.ts) / [sanitize-body](../../src/domain/session/sanitize-body.ts)):
- `result` は取得プロセス側で `sanitizeBody(…, TOOL_RESULT_MAX_BYTES)` を通した**切り詰め済み文字列**で来る
- 本文は `MessageChannelMain` の port で運ばれ main を通らない (AD-034)

**判断基準** (design-gate H-1/H-2 で訂正 — `argsText` は R-3 で sanitize も byte cap も未適用だった):
- `result` は `sanitizeBody(…, TOOL_RESULT_MAX_BYTES)` 済みだが **`argsText` は `safeStringify` のみ** (transcript.ts:180)。
  R-4 の 5 表示の主コンテンツは argsText 由来のため、**取得プロセス側 (`transcript.ts`) で argsText にも
  `sanitizeBody` (bidi/C1 除去) + byte 上限を足す** (data-model §2/§6)
- 専用表示は取得プロセス側でサニタイズ・切り詰め済みの `result` / `argsText` を表示するだけにし、renderer で
  巨大本文を再取得しない。**巨大な args (Write content / Edit old-new / plan) は parse 前に byte 上限を効かせ**
  renderer の `JSON.parse`/描画をブロックさせない (platform-boundary M-001 / security H-002)
- Terminal / diff の切り詰め表示は R-3 の折りたたみ方針に合わせる。**main 経路は R-4 で変えない** (SC-006)

## R-06 Reasoning / Tool group と専用表示の共存 (回帰確認)

**問い**: R-3 実装済みの Reasoning / Tool group (`groupPartByType`) の中に専用表示が来たとき、
畳み込みが壊れないか。

**現状** ([thread.aui.tsx](../../src/renderer/src/components/assistant-ui/elements/thread.aui.tsx)):
- `groupPartByType({ reasoning: [...], "tool-call": ["group-chainOfThought", "group-tool"], ... })` で
  連続 tool を `group-tool` に、reasoning を `group-reasoning` に畳む
- `group-tool` の children は各 tool-call の描画 (= `part.toolUI ?? ToolFallback`)

**判断基準**: 専用表示は `group-tool` の children として描画されるため、**専用表示に置き換えても
Tool group の畳み込み構造は変わらない**はず。これを FR-007 / US-1 AC-6 の Vitest で回帰確認する
(専用表示を含む連続 tool が 1 つの Tool group に畳まれる)。**壊れる場合のみ** `thread.aui.tsx` の
グルーピング設定を調整する。

## 実測課題 (quickstart-results.md に記録)

- **R-02 の subagent 実データ確認** — 実機で Task を使った過去セッションの入れ子を目視確認 (人間 deferred)
- **各専用表示の見栄え判断材料 (SC-010 rubric)** — Terminal / Code diff / Todo / Subagent / Agent plan を
  実機で rubric 判定 (人間 deferred。**判定表の記録は done 必須だが OK/NG 判断と軸 1 確定は別ステップ**。design-gate C-001)
- **R-03 の Bash exit code の有無** — 実データで exit code が result に含まれるかを確認し、無ければ
  `isError` のみ表示に確定
