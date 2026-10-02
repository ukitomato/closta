# architecture-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-02
**Reviewer**: architecture-reviewer (default モード + ADR-drift モード)
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-010 (主に FR-002 / FR-005 / FR-011 / FR-012 / FR-015 / SC-002 / SC-009)
- touched files に該当する charter / Confirmation: session charter Scope、AD-043 Decision 1〜7 と Confirmation、AD-006 Consequences、AD-030 §5 訂正、AD-031 §2、AD-023 §5、Constitution v1.2.8 の IX / VII
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer / platform-boundary-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## Round 2 の指摘の再判定

| ID | 判定 | 根拠 |
|---|---|---|
| H-001 (残り) | resolved (字面の改定は out-of-scope として持ち主へ) | `docs/roadmap.md:144-149`、AD-043 `:52` / `:101`。`constitution.md:598` は人間の承認待ち。stream 本文の復元は `session-event-decoder.ts:54` のみ、調停役スレッド本体 0 件 |
| L-101 | resolved | `0043-...md:51,81,101` |
| L-102 | resolved (残りは L-201) | `0043-...md:26` |
| L-103 | resolved | `glossary.md:289-290`, `:594-595` |
| L-104 | resolved | `run-state.ts:76`、利用 `session-core.ts:283` / `session-view.ts:117` / `e2e-capability.ts:204` / `sdk-agent-session.ts:445` |
| L-105 | resolved | `charter.md:48` |
| L-106 | resolved | `launch-preparation.ts:34,46`、`session-spawner.ts:24,28` |
| L-006 | resolved | `session-core.ts:348-354`、`session-core.test.ts:102-110`、`sdk-agent-session.ts:517` |
| L-107 | resolved | `verify.yml:95-100` |

## Findings

### [Low] L-201 AD-043 Context の追記の記録が R1 分しか挙げず、R2 で足した文を含まない (new) (scope: feature)
- **観察**: `0043-...md:26` は pr-gate R1 の追記だけを数える。Decision 2 (`:52`) の R2 の持ち主参照、`:51,81,101` の v1.2.8 追随の書き換えが記録に無い
- **同種事象探索**: AD-043 で `R2` を含む行 2 件 (`:26`, `:52`)
- **推奨アクション**: `:26` 末尾に R2 の追記を 1 文
- **根拠**: AD-031 §1

### Critical 0 件の確認
accepted ADR の in-place 書き換え 0、レイヤ違反 0、調停役スレッド本体の `JSON.parse` 0、cross-domain invariant の矛盾なし。

### H の所見
- `canEnd` の直接テストは `session-core.test.ts:76-84` (re-export 経由) のみ。正本は 1 つで漏れにはならない
- 規則の発火検証は未完走 (47/64)。本 reviewer の判定はそれに依存しない (項目 18 の対象は Grep で直接確認) が、gate 側での扱いが要る

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `JSON\.parse` (src、テスト以外) | 18 (本文復元 1、調停役本体 0) | session-event-decoder.ts:54 / supervisor-protocol.ts:50,143 |
| H-001 | roadmap `Principle IX の Automated` | 1 | docs/roadmap.md:144-149 |
| L-104 | `canEnd` (src) | 定義 1、利用 5 | run-state.ts:76 ほか |
| L-006 | `resultAction` | 定義 1、テスト 1、利用 1 | session-core.ts:348 ほか |
| L-201 | AD-043 の `R2` | 2 | docs/decisions/0043-...md:26,52 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 2: 9 / unresolved: 0 / new: 1 (L-201)
