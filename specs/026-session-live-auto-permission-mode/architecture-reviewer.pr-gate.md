# architecture-reviewer Review: 権限モードの Auto (起動と実行中)

- Run: 2026-11-01 / pr-gate Round 1
- mode: pr-gate (default viewpoints + ADR-drift mode, `scope: adr-drift` included)
- spec_dir: specs/026-session-live-auto-permission-mode
- code-gate must_fix_findings は空のため再報告対象なし。

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012, SC-001〜SC-005。
- charter / Confirmation: session charter (:88, :191, :272, :379)、isolation charter In-scope、Constitution Principle III 1.6.0、AD-066 Confirmation と再読する accepted 決定 (Principle III / AD-062 D1 / AD-036 §5 / AD-041 (a)(c) / AD-020 / AD-059 D1・V-9・D3 / AD-015 / AD-042 / AD-065 D3 / AD-047 D5)。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer / platform-boundary-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: architecture の範囲外
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (例: session-launch-service.ts の `autoUnconfirmed` の上の孤立 JSDoc)
- G. optional reviewer 範囲: 該当なし
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

`auto` を起動と実行中で選べるようにし、renderer の確認を IPC arg[2] `autoModeAcknowledged` で送る。main は `=== true` だけを承諾とみなし、`launch` / `resume` / `setPermissionMode` で fail-closed (`auto-mode-unconfirmed`)。Constitution Principle III 1.5.0 → 1.6.0、AD-066 (proposed)、プリセット版 3、glossary・charter 更新。

適合を確認: `requiresAutoModeConfirmation` は domain 層 (`src/domain/session/launch-config.ts`)、main の印の検査の順序、`session-ipc.ts:203`/`:246` の `args[2] === true`、`validate.ts` の 2/3 引数、`composition-root.ts:315-318`。accepted ADR の in-place 編集は無く、docs/decisions の新規は 0066 のみ。

## Findings

### H-001 [High] (D, ARCH-3) [scope: merge-precondition] 実装が proposed の AD-066 に依拠し、Constitution 改定のレビューが未了

- **Where**: `docs/decisions/0066-auto-permission-mode-with-confirmation.md` (frontmatter `status: proposed`)、`.specify/memory/constitution.md:15`, `:1137` (Sync Impact Report step 2「未了」)
- **Fact**: diff は accepted の AD-062 D1 / AD-041 (a) / AD-059 D1・D3 / AD-065 D3 / AD-047 D5 / AD-036 §5 が固定した振る舞いを変え、根拠は proposed の AD-066 だけ。マージ前提条件 (RK-01 / SH-012 / H-007: AD-066 accepted とレビュー日の記入) は文章だけで、機械的に止めるものが無い。夜間自走のポリシー (verify 緑 + Critical 0 で自動マージ) では人の受理前にマージされうる。
- **Why not Critical**: コードでは直せない。PR 自体が受理の場なので、止めると循環する。
- **Action**: マージ前に人が AD-066 を accepted にし、Constitution の Sync Impact Report step 2 のレビュー日を埋める。任意で /cl-done か CI に「spec が導入した ADR が proposed のままならマージを拒否する」検査を足す。
- **Cascade**: `status: proposed` in docs/decisions で 2 件 (0066、既存の 0050)。

### M-001 [Medium] (C, ARCH-2) session charter が Auto の判定の置き場所について自己矛盾

- **Where**: `docs/domains/session/charter.md:191`「（Principle III。判定は `isolation`）」。同 charter の :88 / :272 / :379 と plan は暫定で session に置く。
- **Action**: :191 を「判定は暫定で session、I-3 で isolation へ」に直す。
- **Cascade**: 1 件 (:191)。

### M-002 [Medium] (D, ARCH-4) store の `launch` / `resume` が印を optional で受け、data-model §6.4 と乖離

- **Where**: `src/renderer/src/features/session/running-session-store.ts` (`autoModeAcknowledged?: boolean = false`)
- **Fact**: `data-model.md:200` (§6.4) と tasks FE-011 は段 1〜4 で必須。`setPermissionMode` は必須。main は fail-closed なので安全上の影響は無いが、渡し忘れを型で検出できない。
- **Action**: 必須にして 3 か所の呼び出しで明示的に渡す。
- **Cascade**: 3 件 (`app-shell-harness.tsx:252`、`RunningSessionsProvider.tsx:90`, `:105`)。

### M-003 [Medium] (D, ARCH-3/ARCH-4) renderer が `'auto'` リテラルを直書き

- **Where**: `src/renderer/src/features/session/LaunchDialog.tsx:621` (`update({ permissionMode: 'auto' })`)
- **Fact**: plan P-13 と AD-066 で補正した AD-047 D5 は、renderer で `'auto'` リテラルを書かず domain の定数・述語を使うとする。非テストで唯一。
- **Action**: domain が export する定数に置き換える。
- **Cascade**: `['"]auto['"]` (renderer 非テスト) 1 件。

### M-004 [Medium] (H) Principle III の自動検証 (E2E) と新しい rule fixture が未実行

- **Where**: `specs/026-session-live-auto-permission-mode/quickstart-results.md`
- **Fact**: E2E (`e2e/launch-dialog.spec.ts`, `e2e/live-session-settings.spec.ts`)、test:rules、手動 V-1〜V-5 は未実行。Principle III の Verification はその E2E に依る。`src/main/app/e2e-capability.ts` が起動時に `permission-mode` の meter を出すようになり、既存 E2E の期待 (meter の数・順) を壊さないかは未確認。
- **Action**: マージ前に CI で E2E と test:rules の緑を確認し記録する。

### L-001 [Low] (D) `setPermissionMode` の印の検査が fail-open の形

- **Where**: `src/main/app/session-launch-service.ts` (:649-659 付近)。`runtimeId !== undefined && autoUnconfirmed(...)`。今は届かない。
- **Suggestion**: `runtimeId === undefined` なら拒否する。

### L-002 [Low] (C) isolation charter の文の曖昧さ

- **Where**: `docs/domains/isolation/charter.md` (In-scope) の「（Principle III の実行主体）」。
- **Suggestion**: 暫定の置き場所 (今は session、I-3 で isolation) を明示する。

### L-003 [Low] (C, ARCH-7) glossary の項目の欠け

- **Where**: `docs/glossary.md`。`chosenPermissionMode` と Auto の帯 / 読み上げの項目が無い。
- **Suggestion**: 足す。`total_terms` の drift は本 PR 以前から。

## Cascade summary

| Pattern | Hits | Location |
|---|---:|---|
| `['"]auto['"]` (renderer, non-test) | 1 | LaunchDialog.tsx:621 |
| 「判定は `isolation`」 (session charter) | 1 | charter.md:191 |
| `(store\|actions\|getState\(\))\.(launch\|resume)\(` (renderer) | 3 | app-shell-harness.tsx:252, RunningSessionsProvider.tsx:90 / :105 |
| `status: proposed` (docs/decisions) | 2 | 0066 (本 PR), 0050 (既存) |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 3
