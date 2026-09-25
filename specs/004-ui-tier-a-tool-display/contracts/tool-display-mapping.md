# Contract: toolName ↔ 専用表示 のマッピング (R-4)

`ui` の tool 描画の契約。**どの `toolName` がどの専用表示に回り、どの入力を安全に narrowing し、
どう fallback へ退避するか**を固定する。[data-model.md](../data-model.md) §2 / §3 と 1:1。

## C-1 登録表 (`tool-registry.aui.tsx`)

- R-4 が拾う `toolName` は **1 箇所** (`tool-registry.aui.tsx`) に集める。表は data-model §3 の **5 tool 種**と 1:1
  (thinking(Reasoning)/連続tool(Tool group) は R-3 grouping が担い registry 対象外。design-gate M-2)
- 登録: `Bash`→TerminalBlock / `Edit`・`Write`・`MultiEdit`→CodeDiff / `TodoWrite`→TodoList /
  `Task`→Subagent / `ExitPlanMode`→AgentPlan
- **登録に無い `toolName` は必ず `ToolFallback` (R-3) に落ちる** — この不変をテストで固定する (SC-005)
- 照合は**完全一致**。大文字小文字・別名で捏造マッチしない (外れたら fallback。spec Edge Cases)

## C-2 args の narrowing 契約 (`tool-args.ts`)

各専用表示は `argsText` を直接読まず、`tool-args.ts` の narrowing 関数を通す。

| 関数 | 入力 | 成功時 | 失敗時 (契約) |
| --- | --- | --- | --- |
| `parseBashArgs` | `argsText` | `{ command, description? }` | `null` → 呼び出し側は fallback へ |
| `parseEditArgs` | `argsText` | `{ file_path, old_string, new_string, replace_all? }` | `null` → fallback |
| `parseWriteArgs` | `argsText` | `{ file_path, content }` | `null` → fallback |
| `parseMultiEditArgs` | `argsText` | `{ file_path, edits: {old_string,new_string}[] }` | `null` → fallback |
| `parseTodoArgs` | `argsText` | `{ todos: {content,status,activeForm?}[] }` | `null` → fallback |
| `parseTaskArgs` | `argsText` | `{ subagent_type, description?, prompt? }` | `null` → fallback |
| `parsePlanArgs` | `argsText` | `{ plan }` | `null` → fallback |

- **すべて untrusted narrowing**。`JSON.parse` 失敗・型不一致・必須フィールド欠落は `null` を返す (throw しない)
- `null` のとき呼び出し側 (専用表示 or registry) は **生 `argsText` の `ToolFallback` に退避**する (FR-009 / SC-005)
- narrowing は**純粋関数**でモックなしテスト可能 (`tool-args.test.ts`)
- **入力は `domain` (`transcript.ts`) で `sanitizeBody` (双方向制御文字/C1 除去) + バイト上限を通した後の `argsText`** である
  (R-3 は argsText に未適用だった。design-gate H-1)。**`tool-args.ts` は sanitize を行わず、サニタイズ済み入力での narrowing のみ**を担う。
  **bidi/C1 除去の正本テストは domain の `transcript.test.ts` (BE-012)**、DOM 端点は `ChatScreen.test.tsx` (FE-042) が持つ (design-gate M-N01)。
  narrowing 側でもバイト超過フィールドは切り詰め + 折りたたみフラグを付け、巨大 args で描画をブロックしない (design-gate H-2)

## C-3 描画の安全契約

| 表示 | 描画規則 |
| --- | --- |
| Terminal block | command / output を**等幅・プレーンテキスト**。exit code は result に有れば示し無ければ `isError` で成否のみ |
| Code diff | old/new から hunk を組み**プレーンテキスト**で行表示。生 HTML/markdown/script を実行しない。巨大 diff は折りたたみ |
| Todo list | `status` を既知集合に照合。未知 status は生値表示 (欠落禁止) |
| Subagent | `subagent_type`/`description`/最終結果 + 配下メッセージの入れ子 ([transcript-subagent.md](transcript-subagent.md)) |
| Agent plan | plan を **plain text (whitespace-pre-wrap) で描画** (React escape により生 HTML 非描画・`javascript:` inert)。`MarkdownText` は text part context 依存で任意文字列を安全に受けられないため**独自 markdown 経路を作らない**。markdown 整形は roadmap tracked debt (AD-035 D6 / design-gate PR-H-3) |

## C-4 R-3 境界の非回帰 (FR-012 / FR-015 / FR-017)

- 生 HTML 非描画・URL allowlist・本文サニタイザ・巨大 result 切り詰め・**本文を main 経路に置かない**を
  R-4 で回帰させない (R-3 の SC-007 / FR-016/020 を維持)
- composer 送信経路は閉じたまま (`isDisabled: true`)。`ChatScreen.test.tsx` の回帰前提を維持

## C-5 element 選定の記録 (Principle XIII。FR-013)

- 各専用表示は registry (`elements-terminal-block` / `-code-diff` / `-todo-list` / `-subagent-list` /
  `-agent-plan`) を**実名照合**して採用・調整・自作を決める
- 自作する部分 (例: subagent 入れ子の再帰描画) は**候補名と不適合理由**を PR / ADR に記す
- registry element が dependency を増やさない (ソース同梱) ことを確認し `docs/discovery.md` を汚さない
