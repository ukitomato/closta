# convention-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21
**Reviewer**: convention-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: iter 1 (code-gate)

## 初回読了 viewpoint

- FR/SC: FR-004 / SC-002、FR-005 / SC-003、FR-014、FR-016、SC-004 / SC-008
- touched files に該当する charter / Confirmation: docs/domains/session/charter.md (Journey 4)。allowlists.mjs:562 / .dependency-cruiser.js:254 は更新済み
- lint-agent の JSON は受領。exit_code 0 なので CONV-1 の Critical はない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:3
- G. optional reviewer 範囲: 該当なし: 本 reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## Findings

### [Medium] ESLint 警告 4,399 件はすべて環境由来 (CRLF の作業ツリー) で、コード起因の lint 違反は 0 件 (M-001) (scope: out-of-scope)
- 観察: prettier/prettier 4,398 件はすべて `Delete ␍`。.gitattributes:3 は `* text=auto eol=lf`、git status は clean。残り 1 件は e2e の ignore 警告
- 推奨: gate の対象としては直さない。次回は LF の作業ツリーで実質の prettier 違反 0 件を確かめる

### [Medium] 再開の追加で 500 行超のファイルがさらに肥大した (M-002) (scope: feature)
- 観察: running-session-store.ts 1178 (+321 正味)、LaunchDialog.tsx 899、sdk-agent-session.ts 1021、session-service.ts 881、e2e-capability.ts 712、labels.ts 651、LivePane.tsx 619、composition-root.ts 528、session-core.ts 650
- 推奨: 本 PR では直さない。棚卸しで running-session-store.ts の再開部分 (:172-215) の切り出しを扱う
- 根拠: CONV-3

### [Medium] spec / plan / tasks と実装でモジュール名が食い違う: resolvePastResumeAxes は resume-axes.ts、テストは resume.test.ts (M-003) (scope: feature)
- 観察: plan.md / tasks.md BE-001 / data-model §3 は src/domain/session/resume.ts に置くと書くが、実装は resume-axes.ts:18-113。分割理由は quickstart-results.md:11 と resume-axes.ts:13-16 に記録。resume.test.ts:17 が ./resume-axes を import
- 推奨: resume.test.ts を resume-axes.test.ts に改名 (または分割)、plan / tasks / data-model に resume-axes.ts を併記
- 根拠: CONV-2 / CONV-6

### [Low] resume-service.ts の import が揃っていない (L-001) (scope: feature)
- src/main/app/resume-service.ts:5-12。@domain/session/launch-config の import を同ブロックに寄せる

### [Low] E2E spec が ESLint の対象外のまま (L-002) (scope: system)
- eslint.config.mjs:181 の ignore。既知の状態

### [Low] resume-action.ts が純関数と React の hook を同居させている (L-003) (scope: feature)
- src/renderer/src/features/session/resume-action.ts:26-36 / :39-71。X-6 で増えたら分ける

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent JSON の detectors (prettier 以外の rule) | 0 | — |
| M-002 | 差分のあるファイルの行数が 500 超 | 9 | running-session-store.ts:1178 ほか |
| M-003 | `resume-axes` (リポジトリ全体) | 8 | session-ipc.ts:12、resume-service.ts:7、ipc.ts:26、resume.test.ts:17 ほか specs 4 件 |

## lint-agent 結果の翻訳

- exit_code: 0 → 非ゼロ exit の Critical は 0 件
- error 0 件 → Critical / High の lint finding は 0 件
- warning 4,399 件 → M-001 に集約
- invoker 実行の検出器 (tsc 2 本 exit 0、dep-cruiser 0 違反、constitution 違反 0) は追加の finding なし

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
