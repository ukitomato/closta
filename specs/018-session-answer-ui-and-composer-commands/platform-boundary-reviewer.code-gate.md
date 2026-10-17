# platform-boundary-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Gate**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC:
  - 影響あり: FR-003 / FR-004 / SC-002。承認の応答の境界 (`toAskUserQuestionResult`) と、項目 16 の新しい P2 backstop が対象
  - 影響あり: FR-005 / SC-010。`QUERY_OPTION_KEYS` の 9 キーと、`onUserDialog` / `supportedDialogKinds` を載せないことが対象
  - 影響あり: FR-007 / FR-008。URL をホストで開く経路と、新しい IPC `respondElicitation` のセッションの振り分けが対象
  - 範囲外: FR-001 / FR-002 / FR-006 / FR-009〜FR-017 と SC-001 / SC-003〜SC-009
- touched files に該当する charter / Confirmation:
  - runtime / isolation の charter は該当なし
  - Principle III の判定 (`autoModeSafe` / `isAutoModeAllowed`) は diff に無い
  - Principle VII: agents が新しく import するのは `@domain/session/elicitation` と `@domain/validation` だけ
  - Principle II: diff の追加行に `process.platform`・`os.platform`・`navigator.`・`userAgent`・`platform-ok` は 0 件
  - AD-052 / AD-053 Confirmation は PB-7 として F で見た
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter の Out of scope に踏み込む変更が diff に無い
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:2
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

- 項目 16 に P2 の綴りの検査 (scripts/constitution/check.mjs:918-926)
- 違反の fixture `tests/rule-fixtures/b-equivalent/sdk-updated-input.ts.fixture`
- `updatedInput` は domain で組む (`src/domain/session/agent-session.ts:346-390`)。agents は無害化前の tool 名で振り分け (`src/agents/session-core.ts:213` / `:225`)
- Elicitation の registry と `onElicitation` は `run()` の closure (`src/agents/sdk-agent-session.ts:368-372`)

PB-1 該当なし / PB-2 該当なし (`handleRespondElicitation` は sessionId で振り分け) / PB-3 該当なし / PB-4 経路の増加なし (負の単体テスト session-core.test.ts:378-402) / PB-5 L-002 / PB-6 該当なし / PB-7 M-001 / M-003 / L-001 / L-003

design-gate R2 の 5 件は実装後も残る (AD-050 により Medium / Low は gate で直さない)。

## Findings

### [Medium] 項目 16 の新しい P2 の検査は `src/agents/` しか見ていない。`updatedInput` を組む domain は検査の外 (M-001) (scope: feature) — unresolved from design-gate
- **観察**: `sdkScope` は `AGENT_SDK_IMPORT_DIRECTORIES` (allowlists.mjs:363) に限られる (check.mjs:812-815, 920-926)。戻り値の組み立ては agent-session.ts:390。domain が `updatedPermissions` を返すように変わっても項目 16 は発火しない。現時点のコードには 0 件で実害なし
- **同種事象探索**: `\bupdated(Input|Permissions)\b` in src 非テスト 9 件 (コード agent-session.ts:303/:382/:383/:390、注記 session-core.ts:205、agent-session.ts:279/:300/:343/:371)
- **推奨アクション**: P2 の範囲に `src/domain/` を足し、`updatedInput` は agent-session.ts の 1 ファイルだけを実名で許す
- **根拠**: AD-052 Decision 4 (d) / Constitution Principle III

### [Medium] 新しい P2 の fixture は `updatedInput` の 1 つだけ。`updatedPermissions` の発火確認も迂回形の UNDETECTED_NOTES も無い (M-003) (scope: feature) — unresolved from design-gate
- **観察**: 期待表追加は 1 行 (expected.mjs:367-376)。`['updated' + 'Input']` 等の組み立て形は拾えず UNDETECTED_NOTES に記載なし
- **同種事象探索**: `updated` in tests/rule-fixtures 3 件 (expected.mjs:368/:369/:372)、fixture 本体 2 件、`updatedPermissions` 0 件
- **推奨アクション**: `b-equivalent/sdk-updated-permissions.ts.fixture` を足し、組み立て形を UNDETECTED_NOTES に記載
- **根拠**: AD-052 Decision 4 (d) / expected.mjs:236

### [Low] `toAskUserQuestionResult` が tool 名を受け取らない。FR-004 は存在しない「静的な検査」を直す対象として書いたまま (M-002 から降格) (scope: feature)
- **観察**: agent-session.ts:374。負の単体テストあり (session-core.test.ts:378-402)。spec.md:221 / data-model.md:76 の記述が実物 (実行時のキー検査 session-core.test.ts:263) とずれる
- **同種事象探索**: `toPermissionResult` in scripts/ tests/rule-fixtures/ eslint.config.mjs 3 件 (注記のみ)
- **推奨アクション**: FR-004 / data-model.md:76 を実行時の pin に揃える

### [Low] `onUserDialog` / `supportedDialogKinds` を options に載せないことを CI で守るのは単体の pin だけ (L-001) (scope: feature)
- **観察**: session-core.test.ts:210-212、agent-session.kinds.test.ts:28、elicitation.test.ts:298。`QUERY_ESCALATION_OPTION_KEYS` に 2 キーなし (scripts で 0 件)
- **推奨アクション**: 2 キーを `QUERY_ESCALATION_OPTION_KEYS` に足す
- **根拠**: AD-053 Decision 4

### [Low] URL の Elicitation はランタイム名前空間の URL をホストのブラウザで開く。越境が未記録 (L-002) (scope: system)
- **観察**: elicitation.ts:188 / :421-422、window.ts:31 `openExternalIfHttp`。ADR-0053 / isolation charter に記載 0 件
- **推奨アクション**: isolation charter の Open Questions に 1 行
- **根拠**: AD-003 / AD-012

### [Low] P2 の検査の注記が検査範囲を超えて言い切っている (L-003) (scope: feature)
- **観察**: check.mjs:918-919、allowlists.mjs:385-386
- **推奨アクション**: M-001 を直さないなら注記に「domain 側は pin テスト (agent-session.test.ts:170) が守る」と追記
- **根拠**: AD-024

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `\bupdated(Input\|Permissions)\b` in src (非テスト) | 9 | agent-session.ts:279, :300, :303, :343, :371, :382, :383, :390 / session-core.ts:205 |
| M-003 | `updated` in tests/rule-fixtures | 5 | expected.mjs:368, :369, :372 / sdk-updated-input.ts.fixture:5, :9 |
| M-002→Low | `toPermissionResult` in scripts/tests/eslint | 3 | allowlists.mjs:385 / check.mjs:779, :948 |
| L-001 | `onUserDialog\|supportedDialogKinds\|SUPPORTED_DIALOG_KINDS` | scripts 0 / src 9 | session-core.test.ts:210-212 他 |
| L-002 | `localhost\|名前空間\|I-3` in ADR-0053; `Elicitation` in isolation charter | 0 / 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
