# convention-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:00:00+09:00
**Reviewer**: convention-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Gate**: code-gate
**Round**: 2 (iter 2, re-run after pr-gate fixes)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-015 と SC-001〜SC-005 はすべて touched files に関わる。iter 1 からの差分は pr-gate MD-01 (`live-signals.ts:439-525`、data-model.md:137)、MD-02 (`RightPanel.tsx:112-176`)、MD-10 (`QUERY_MUTATION_METHODS` が 21 件)
- touched files に該当する charter / Confirmation: ui charter、session charter、glossary の SessionInitReport / Meter、AD-035 Decision 1 / AD-048 Decision 5、AD-046 Decision 4、`eslint.config.mjs` の手書き element の一覧
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:8
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

touched files 63 件。CONV-1: lint-agent の `exit_code` 0、5 detector すべて exit 0、`violations[]` 空。lint 由来の finding 無し、Critical 経路に当たらない。depcruise が循環 0 のため madge 未実行。新規ファイルの命名は既存と揃っている。iter 1 の指摘 11 件はすべて未解消。

## Findings

### [Medium] live-signals.ts が 656 行になり 500 行を超えた。汎用の合流器も同じファイルに残っている (M-001) (scope: feature) [unresolved from iter 1 M-001]
- **観察**: `src/agents/live-signals.ts` 656 行 (iter 1 は 630)。`createReportCoalescer<T>` (`:131`) と `INIT_REPORT_COALESCE_MS` (`:69`) は汎用部品
- **同種事象探索**: `createReportCoalescer|INIT_REPORT_COALESCE_MS|report-coalescer` (src) 7 件、すべて live-signals.ts
- **推奨アクション**: `src/agents/report-coalescer.ts` に移し単体テストを隣に置く
- **根拠**: CONV-3

### [Medium] elements/ の手書きテスト 3 本が CLI 生成物向けの緩和区域に入ったまま (M-002) (scope: feature) [unresolved from iter 1 M-002]
- **観察**: `eslint.config.mjs:73-77` の `GENERATED_FILES` が `:530-541` で 7 rule を off。手書き一覧 (`:588-598`) にテストが無い
- **同種事象探索**: Glob `elements/*.test.tsx` 3 件 (mcp-tool-call / tool-registry / ask-user-question)
- **推奨アクション**: 3 本を `:588-598` に足すか区域外へ移す
- **根拠**: `eslint.config.mjs:542-546` / CONV-5

### [Medium] `PanelTab.attention` のシグネチャが data-model / tasks と実装で違う (M-003) (scope: feature) [unresolved from iter 1 M-003]
- **観察**: 実装 `panel-tabs.ts:31` は `(meters: SessionMeters) => boolean`、data-model.md:126 / tasks.md:62 は `(sessionId: string) => boolean`
- **推奨アクション**: 設計文書を実装の形に揃える (designer)
- **根拠**: CONV-6

### [Low] 外から参照されない export が 7 つ (L-001) [unresolved]
- `mcp-tool-name.ts:25,30,49,134,159,167`、`live-signals.ts:69`。根拠: CONV-5

### [Low] MCP 見出しの区切り `›` を 3 か所で別々に組み立てている (L-002) [unresolved, 2→3 件]
- `mcp-tool-name.ts:136` / `ApprovalCard.tsx:54` / `mcp-tool-call.aui.tsx:129`。根拠: CONV-5

### [Low] `INVISIBLE_OR_CONTROL` を domain と renderer で二重定義 (L-003) [unresolved]
- `session-init-report.ts:129` / `mcp-tool-name.ts:46`。根拠: CONV-5

### [Low] glossary の `SessionInitReport` に当たる識別子がコードに無い (L-004) [unresolved]
- glossary.md:889、型名は `InitReportMeter`。根拠: CONV-6 / Principle XIV

### [Low] tool-registry のコメントが「5 tool 表示種」のまま (L-005) [unresolved]
- `tool-registry.aui.tsx:21` (実際は 7)。根拠: CONV-6

### [Low] `session-init-report.ts` (488 行) が構成以外の責務も持つ (L-006) [unresolved]
- 根拠: CONV-3

### [Low] 未使用 export / import 順序の機械検出が無い (L-007) (scope: system) [unresolved]
- knip / ts-prune / `import/order` / `max-lines` 0 件

### [Low] 注意の印付きタブ名を RightPanel の 2 か所で組み立てている (L-008) (scope: feature) [new, MD-02 由来]
- `RightPanel.tsx:113` / `:157`。推奨: 名前を作る関数を 1 つ置く。根拠: CONV-5

### H-category
- **[Medium] (H-M-001)**: M-002 のテストは緩めた rule で lint され検出が無い。合流器に単体テストが無い。未使用 export は検出されない。L-008 は `^構成` 照合で間接的に守られている。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `createReportCoalescer\|INIT_REPORT_COALESCE_MS\|report-coalescer` (src) | 7 (1 file) | src/agents/live-signals.ts:69,127,131,164,169,273,276 |
| M-002 | Glob `elements/*.test.tsx` | 3 | mcp-tool-call / tool-registry / ask-user-question .aui.test.tsx |
| M-003 | `attention\?: \(sessionId: string\) => boolean` | 2 | data-model.md:126 / tasks.md:62 |
| L-001 | 未使用 export 名 | 7 | mcp-tool-name.ts:25,30,49,134,159,167 / live-signals.ts:69 |
| L-002 | `›` (src, テスト除く) | 3 | mcp-tool-name.ts:136 / ApprovalCard.tsx:54 / mcp-tool-call.aui.tsx:129 |
| L-003 | `INVISIBLE_OR_CONTROL\s*=` | 2 | session-init-report.ts:129 / mcp-tool-name.ts:46 |
| L-004 | `\bSessionInitReport\b` (src) | 1 | labels.ts:213 |
| L-005 | `5 tool 表示種` | 1 | tool-registry.aui.tsx:21 |
| L-006 | 責務の同居 | 1 | session-init-report.ts |
| L-007 | `max-lines\|knip\|ts-prune\|import/order` | 0 | — |
| L-008 | `SHELL_LABELS.attention` (RightPanel.tsx) | 2 | RightPanel.tsx:113,157 |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 8
- Round inheritance: resolved 0 / unresolved 11 / new 1 (L-008)

<details><summary>lint-agent input</summary>

{"exit_code":0,"detectors":{"eslint":{"exit_code":0},"typecheck_node":{"exit_code":0},"typecheck_web":{"exit_code":0},"depcruise":{"exit_code":0},"check_constitution":{"exit_code":0}},"violations":[]}

</details>
