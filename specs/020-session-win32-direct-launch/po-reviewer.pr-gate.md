# po-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: po-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 と SC-001〜SC-006。中心は US-1 (FR-001 / FR-002 / FR-013, SC-001)、US-2 (FR-004〜FR-007, SC-002)、US-3 (FR-010〜FR-012, SC-004)、US-4 (FR-008 / FR-009, SC-003 / SC-005)、SC-006。
- touched files に該当する charter / Confirmation: session charter Journey 2 と Related Specs、runtime charter Related Specs、AD-058 Confirmation (SC-004 の V-3)、docs/roadmap.md:385。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:1 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: ux / a11y は各 optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

code-gate H-001 (設定の読み込み失敗を「指定なし」扱い) は `composition-root.ts:121-134` で直っている。PO 観点で残るのは、実機に計測経路を置いた SC と完了の条件の食い違い、および Win32 を選んだ利用者に残る WSL 前提の文言。

## Findings

### [High] SC-001 / SC-004 は実機の V-1 / V-3 を /cl-done の前に必須としているのに、roadmap は「未実施でマージ」を結論にしている (H-001) (scope: feature)

- **観察**: `spec.md:204` (SC-001) は「V-1 は `/cl-done` の前に必須 (確かめずに完了にしない)」、`spec.md:207` (SC-004) も V-3 について同じ。一方 `quickstart-results.md:20` は「すべて **未実施**。V-1 (SC-001) と V-3 (SC-004) を含む」、`docs/roadmap.md:385` は「2026-10-21 の夜間の規則で『未実施』としてマージ」。`.claude/skills/cl-done` に `quickstart` は 0 件で、機械的な確認手段は無い。
- **同種事象探索**: roadmap の他の行 (382, 383, 384) は「/cl-done の前に必須」とは書いていないので矛盾しない。
- **リスク/影響**: SC-004 は US-3 の唯一の合否判定。SC の合否が決まらないまま completed になる。
- **推奨アクション**: (a) `/cl-done` の前に V-1 / V-3 を利用者の実機で実施して記録し、roadmap:385 を直す。または (b) SC-001 / SC-004 を「マージ後に利用者が確かめ、結果で completed にする」に改め、completed 化の条件を quickstart-results.md と roadmap:385 に書く。どちらにするかは利用者の判断が要る。
- **根拠**: spec SC-001 / SC-004、AD-058 Confirmation、PO-2。

### [High] Win32 で起動するときの「既定 Provider」の確認文言が、資格情報と課金先を「ディストロ内の claude」と誤って示す (H-002) (scope: feature)

- **観察**: `session/labels.ts:528-529` (`PROVIDER_RESET_CONFIRMATION`) と `:535-536` (`PROVIDER_RESET_CONFIRMATION_UNVERIFIED`) がランタイム種別で分かれず、`LaunchDialog.tsx:760-762` が無条件に出す。FE-040 は `PROVIDER_DEFAULT_LABELS` (`labels.ts:400-403`) だけを分けた。
- **同種事象探索**: `ディストロ内` で 3 件 (`:401` は正しい、`:529` / `:536` が問題)。
- **リスク/影響**: US-4 AC2 の経路で、課金先と資格情報について誤った説明で同意させる。
- **推奨アクション**: `{ wsl, win32 }` に分け、LaunchDialog で選んだランタイムの種類から引く。テストを足す。
- **根拠**: spec US-4、session charter Journey 2 手順 3、PO-6。

### [Medium] WSL が無い・全部止まっているホストでも、起動ダイアログが「WSL ランタイムが見つからない / 全部止まっている」と案内する (M-001) (scope: feature)

- **観察**: `LaunchDialog.tsx:424-425` の `allRuntimesStopped` と `:507-508` の `noWslRuntimes` は WSL だけで判定し、`labels.ts:413-416` を出す。design-gate M-012 / analyze E1 で unresolved。
- **推奨アクション**: 判定を起動できるランタイムの一覧に替える。

### [Medium] H: M-001 / H-002 の状態を確かめるテストが無い (M-002) (scope: feature)

- **観察**: Win32 の確認文言、Win32 だけがあるホストの空状態のテストが無い。`[tree-stop]` の stderr 記録 (`sdk-agent-session.ts:555,574,578,583`) で FR-012 の観測点はある。
- **推奨アクション**: H-002 / M-001 の修正と同時にテストを足す。

### [Low] US-3 の Why は具体的だが、charter の KPI と結び付いていない (L-001) (scope: feature)

- spec.md:115 / :33。棚卸しで charter に KPI を足すかを検討する。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `未実施\|V-1\|V-3` in docs/roadmap.md; `quickstart` in .claude/skills/cl-done | 1 / 0 | docs/roadmap.md:385 |
| H-002 | `ディストロ内` in src/renderer/src (非テスト) | 3 (問題は 2) | labels.ts:401 (正しい), labels.ts:529, labels.ts:536 |
| M-001 | `WSL ランタイム` in src/renderer/src (非テスト) | 2 | labels.ts:414, labels.ts:416 |

## Verdict

- Critical: 0
- High: 2
- Medium: 2
- Low: 1
