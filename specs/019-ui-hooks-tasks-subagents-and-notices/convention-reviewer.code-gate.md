# convention-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Reviewer**: convention-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: code-gate iter 1

## 初回読了 viewpoint

- FR/SC のうち F に関係するもの:
  - FR-013 / SC-004: 項目 14 の fixture と `QUERY_OPTION_KEYS` / `AGENT_SDK_ALLOWED_CALLS` / `METER_UPDATE_TYPES` の固定。
  - FR-016 / SH-012: `eslint.config.mjs` と `reviewers.yml` の手書き element 一覧、src の O-11 注記。
  - FR-011 / FR-005: 新設モジュールの置き場所 (domain / agents / renderer)。
  - FR-004 / FR-006 / FR-008 / FR-010: spec・plan の識別子と実装名の突き合わせ。
- touched files に該当する charter / Confirmation:
  - ui charter (Subagent、右のペインのタブ、`docs/ui-coverage.md`)。
  - session charter の O-11 項 (query options、SDK 許可リスト、`meter`)。
  - Constitution VII (agents は domain と SDK だけを import) は新設 import で守られている。
  - AD-023 §7 の `no-circular` は depcruise が exit 0。
- lint-agent の JSON は受領した。`exit_code` は 0 で、5 コマンドすべて 0。lint を自分では実行していない。
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の範囲外 (security-reviewer が owner)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: convention-reviewer の範囲外 (security-reviewer が owner)
- C. 業務不変条件 / Charter drift: 該当なし: convention-reviewer の範囲外 (architecture-reviewer が owner)
- D. Constitution / ADR drift: 該当なし: convention-reviewer の範囲外 (architecture-reviewer が owner)
- E. User Story / SC / AC / UX: 該当なし: convention-reviewer の範囲外 (po-reviewer が owner)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:5 Low:8
- G. optional reviewer 範囲: 該当なし: convention-reviewer の範囲外
- H. テスト / coverage / observability / regression: High:0 Medium:0 Low:2。F の指摘を検出するテストは、後述の 2 点を除いてある。
  - 項目 14 の fixture 4 本と固定テストは追加済みで、既存テストは書き換えずに通る (quickstart-results V-0)。
  - `.vitest/` の混入と `nested-tool-context.ts` の lint 緩和を検出するテストやルールは無い (M-005、L-002)。
  - `ForegroundTaskMemory.size` はテスト専用で、本番側の観測点ではない (L-005)。

## スコープ要約

scope は 76 ファイルで、src は 63 ファイル + 新設を含む。一般の Hook の番号・読み上げ、前景 task の記憶と `backgrounded-task` 行、`background-tasks` meter とタブ、実行中の subagent 入れ子 (`live-tool-results.ts` の根と位置の表)、過去ログの `listSubagents` / `getSubagentMessages` 合成、項目 14 の呼び出しファイル制限を含む。

- CONV-1: lint は error 0、warning 4。うち 1 件は ESLint の ignore 通知で、コード違反ではない。
- CONV-2 (ファイル名): 新設ファイルは kebab-case と既存の PascalCase `*Tab.tsx` に従っており、一貫している。
- CONV-3 (配置): 新設はすべて plan どおりのレイヤに置かれている。
- CONV-4: `no-circular` は exit 0。import 順は lint で強制されておらず、乱れが 3 ファイルある (L-001)。
- CONV-5: 未解決の `O-11` 注記は `src` に 0 件 (Grep で確認)。
- CONV-6: spec・plan・tasks の識別子は実装と一致した (リネーム漏れなし)。

## Findings

### [Medium] prettier 警告: ChatScreen.o2.test.tsx (M-001) (scope: feature)
- **観察**: `src/renderer/src/features/chat/ChatScreen.o2.test.tsx:345:85` に `prettier/prettier`。本 feature の追加行。
- **同種事象探索**: lint-agent の `violations[]` に prettier/prettier が 3 件 (M-001〜M-003)。
- **推奨アクション**: `prettier --write` で整形。
- **根拠**: CONV-1 (warning は Medium)。

### [Medium] prettier 警告: LivePane.o2.test.tsx:1136 (M-002) (scope: feature、本 diff の行ではない)
- **観察**: `src/renderer/src/features/session/LivePane.o2.test.tsx:1136:32`。先行 feature 由来だが touched file。
- **推奨アクション**: 同じ整形で直す。直さないなら棚卸し。

### [Medium] prettier 警告: running-session-store.ts:707 (M-003) (scope: feature、本 diff の行ではない)
- **観察**: `src/renderer/src/features/session/running-session-store.ts:707:27`。O-10 由来の行。
- **推奨アクション**: M-002 と同じ。

### [Medium] 500 行超のファイルが本 feature でさらに伸びた (M-004) (scope: feature)
- **観察**: `thread.aui.tsx` 1555 行 (約 +110)、`running-session-store.ts` 855 行、`live-signals.ts` 873 行、`sdk-agent-session.ts` 813 行 (約 +30)。
- **同種事象探索**: touched src の 500 行超は上の 4 件。新設は最大 `foreground-tasks.ts` 173 行。
- **推奨アクション**: `thread.aui.tsx` の system-event 行の切り出しを棚卸し候補に。本 gate では直さない。
- **根拠**: CONV-3、AD-050。

### [Medium] `.vitest/` が未追跡のまま .gitignore に無く、code-gate の diff に混入 (M-005) (scope: feature)
- **観察**: `.gitignore` に `.vitest/` が無い。`.code-gate.diff` が `.vitest/json/output.json` を含み、diff 全体の Read が失敗した。
- **同種事象探索**: 018 L-002 に同じ指摘があり未対応。
- **推奨アクション**: `.gitignore` に `.vitest/` を足す。gate の diff 生成で untracked な生成物を除く。

### [Low] import 順の乱れ (L-001)
- `src/agents/sdk-agent-session.ts:53`、`src/domain/session/transcript.ts`、`src/agents/live-tool-results.ts`。強制する lint rule は無い。

### [Low] 手書きの `nested-tool-context.ts` が CLI 生成物の緩和ゾーンに入ったまま (L-002)
- `eslint.config.mjs:590-609` の手書き element 一覧に無いため prettier / explicit-function-return-type が off。

### [Low] `pathTail` のテストが renderer と domain の 2 か所に重複 (L-003)
- `src/renderer/src/features/chat/path-tail.test.ts` と `src/domain/session/path-tail.test.ts`。

### [Low] テストファイル名にタスク ID `fe001` (L-004)
- `src/renderer/src/components/assistant-ui/elements/nested-render.fe001.test.tsx`。

### [Low] `ForegroundTaskMemory.size` はテスト専用の公開メンバ (L-005)
- `src/domain/session/foreground-tasks.ts:35` / `:70`。

### [Low] `tool-registry.aui.tsx` で `TOOL_DISPLAY` の docblock が押し出された (L-006)

### [Low] `convertBlocks` の引数が 8 個 (L-007)
- `src/domain/session/transcript.ts`。

### [Low] `read-transcript.ts` の `run` を export した (L-008)
- `src/agents/read-transcript.ts:104`。Worker エントリでテストの都合で公開。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade の対象なし。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (なし) | — | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 5 (M-001〜M-005)
- Low: 8 (L-001〜L-008)
- lint-agent: 5 コマンドすべて `exit_code` 0 (lint / tsc node / tsc web / depcruise / check:constitution)。exit code 由来の Critical は 0。
