# platform-boundary-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-02
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 3 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 / FR-005 / FR-012 / FR-013 / FR-014。SC-008 / SC-009
- touched files に該当する charter / Confirmation: AD-043 Decision 1・5・6・7 と Confirmation、AD-018 §3、AD-036 §3、AD-041 (e) 6、AD-003、Constitution Principle III / VII
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: このスライスの外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## R2 指摘の判定

| ID | 判定 | 根拠 |
|---|---|---|
| R1 M-001 | deferred (記録あり) | AD-043 `:76`、`docs/roadmap.md:194` X-6 |
| L-101 | resolved | `verify.yml:95-102`。out/main の指定子は申告と一致 (`sdk-agent-session-*.js:2-4`, `supervisor-*.js:2`) |
| L-102 | resolved | `sdk-agent-session.ts:390`、catch `:546-549`、テスト `sdk-agent-session.test.ts:357-366` |
| L-103 | resolved (取り残し 1 件は L-201) | `launch-preparation.ts:34,46,183`、`session-spawner.ts:24` |

R2 のその他の変更 (`canEnd` / `resultAction` / renderer の強制終了表示) は PB 観点で該当なし。

## Findings

### [Low] L-201 `prepareLaunch` に渡す `baseEnv` の注記に fork env の責務が残る (new) (scope: feature)
- **観察**: `src/main/app/composition-root.ts:282`「fork env と wsl.exe の絶対パス解決の両方に使う curated base」。fork env は `:262` で注入
- **同種事象探索**: `fork env` (src/main/app) 9 件、古いのは 1 件
- **推奨アクション**: 注記を「wsl.exe 解決と launch env の合成。fork env は `:262` で注入 (AD-043 Decision 7)」に
- **根拠**: AD-041 (e) 6 / AD-043 Decision 7

**H 欄**: L-102 はテストで回帰を防ぐ。L-101 は CI の煙試験が検出器。L-201 は注記のみ。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | `fork env` (src/main/app) | 9 (古い 1) | src/main/app/composition-root.ts:282 |
| L-101 確認 | require / import / from 指定子 (out/main) | 4 (許可内) | out/main/sdk-agent-session-*.js:2-4, out/main/supervisor-*.js:2 |

Critical の申告はない。

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 2: 3 / deferred: 1 (R1 M-001) / unresolved: 0 / new: 1 (L-201)
