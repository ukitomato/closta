# architecture-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03
**Reviewer**: architecture-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Mode**: default と `scope: adr-drift` の両方
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- 本 PR が実装する、または影響を受ける FR/SC (Round 2 の差分で動いたもの): FR-003 / FR-008 (compact の失敗の短い理由と終了の告知)、FR-002 (押せない理由を 2 つに分けた)、FR-006 / SC-002 (`INVISIBLE_FORMAT`)、FR-012 / SC-005 (改訂の行、下限の検証、`probe-missing`、`minMessages` / `thresholdOverridden`、error-context の停止、`teardown=killed`)、SC-003 (E2E の compact の幅)、SC-006 (V-5 の再確認)、FR-013 (charter、roadmap、discovery)
- touched files に該当する charter / Confirmation: session charter KPI「並列時の滑らかさ」、ui charter の不変条件「隔離状態は一目で分かること」、AD-038 D2 / D3 と Confirmation、AD-031 (差分 0 件)、Constitution VIII / XIV / XV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲 (`INVISIBLE_FORMAT` は domain を変えず renderer の正規化に足しただけで、FR-010 は守られている)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲 (code-gate R2 の M-001 / L-002 は roadmap 記録済み)
- G. optional reviewer 範囲: 該当なし: a11y / ux / database は各 optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

0ba910f..HEAD は 25 files (specs/ を除くと 13)。docs、e2e、perf、renderer の session feature、`vitest.config.ts`。`src/main` / `src/preload` / `src/agents` / `src/domain` の差分は PR 全体でも 0 件。`docs/decisions/` の差分も 0 件。Playwright は `**/*.spec.ts`、Vitest は `perf/**/*.test.ts` で互いを拾わず、CI が流すのは純関数のテストだけ (AD-038 D3 は守られている)。

## Round 1 指摘の判定

| R1 ID | 判定 | 根拠 |
|---|---|---|
| M-001 KPI の宿題の持ち主 | **resolved** | roadmap O-3 の「義務 (O-1 から)」(2) に anchor 付きで (a)(b)(c) を登録。charter と quickstart-results が指し、リンクも正しい。O-1 の行も今の状態に直った。ui の O-3 が session の KPI を持つ形には「再利用率」の先例がある |
| M-002 perf の MIN_MESSAGES の NaN | **resolved** | `run-judgement.ts` の下限の検証と `probe-missing`。`minMessages` / `thresholdOverridden` を記録と SC-005 / FR-012 に。テスト 7 件で固定 |
| M-003 perf の ADR 化 | **resolved (roadmap に回す。利用者の決定)** | system-scope の項目に ADR で決めるものを列挙し、AD-038 を書き換えないと明記。持ち主の時期との食い違いは L-101 |
| L-001 隔離バッジの置き場 | **resolved** | compact の分岐に注記。tasks FE-021 にも記録 |
| L-002 型の置き場 | **resolved (roadmap に回す。利用者の決定)** | roadmap の store 切り出しの項目 (2)。O-2 の着手前、O-3 の i18n の前 |
| L-003 時刻の源 | **resolved** | plan の「実装時の変更」に注記 |
| L-004 plan と research の実装時の変更 | **resolved** | plan 2 か所、research 1 か所に注記 |

## Findings

### [Low] perf の ADR を「O-3 の前に決めるのが望ましい」としながら、その持ち主を M4 の後に切る feature にしている。O-3 の義務の行も ADR を指していない (L-101) (scope: feature)

- **観察**: roadmap の「実機計測ハーネスの ADR 化」の持ち主は「本 E2E / 検証基盤 feature (O-3 の KPI の宿題の前に決めるのが望ましい)」だが、その節の見出しは「持ち主 = 未定。M4 完了後に切る」。O-3 は M3 にある。O-3 の義務 (2) は ADR の項目を指していない。予定どおりに進むと「O-3 の前」は満たせず、O-3 が ADR なしで perf の安全柵と出力を変えることになる (R1 M-003 の再現)
- **同種事象探索**: `o3-kpi-smoothness|M4 完了後に切る|実機計測ハーネス` in docs/ → 4 件。ADR の項目と O-3 の行が互いを指す箇所は 0 件
- **推奨アクション** (最小): O-3 の義務 (2) に「(d) 着手時に ADR 化が未了なら O-3 で proposed の ADR を起こす」と足し、ADR の項目の持ち主を「O-3 が先に着手したら O-3」と直す
- **根拠**: session charter の KPI、AD-028 §5「持ち主のいない延期を残さない」、ARCH-2 / ARCH-3

### [Low] `teardown=killed` の出力が spec SC-005 の許可リストに無い (L-102) (scope: feature)

- **観察**: `perf/real-sessions.spec.ts` は `[O-1 SC-005] teardown=killed` を出すが、規則表は「出力は SC-005 の許可リストの項目だけ」とし、SC-005 の許可リストに後始末の結果は無い。中身は理由キーだけで実害は無い
- **同種事象探索**: `teardown|許可リスト` を perf/*.ts と spec.md で 5 件。許可リストに無い出力は `teardown=killed` の 1 件だけ
- **推奨アクション**: SC-005 の許可リストに「後始末の結果 (`teardown=killed` のときだけ)」を足す
- **根拠**: spec SC-005 / FR-012、ARCH-7

## 0 件の確認 (A〜H)

- **C**: Cross-domain invariants を破る経路 0 件。新しい文言は既存概念の表示の別形で glossary に新しい概念は要らない。指摘は L-101
- **D**: Constitution XV (文言は labels.ts、JSX 直書き 0)、VIII (compact の幅の E2E を強化。失敗の行は FR-010 で作れず `max-w-24 truncate` と component テストで補う)、AD-023 / AD-025 §4 (domain の `sanitizeBody` は不変)。指摘は L-102
- **H**: R1 M-002 は `run-judgement.test.ts` で固定。L-001 の注記の置き場の幅は SC-003 の E2E が守る。L-003 の前提を破ったときに落ちるテストは無いが plan に明記したので指摘にしない。code-gate 再実行 full 1731〜1732 passed、E2E 4 passed

## ADR-drift モード (scope: adr-drift)

- accepted ADR の in-place の変更: 0 件 (AD-031)
- AD-038 D2: 守られている (depcruise の起点は src のまま、`not-to-test` で src → perf を塞ぐ)。ESLint の字面の差は roadmap に回した。D3: CI に入る perf のコードは純関数のテストだけ。drift 0
- AD-043 Decision 3 / 4: 変更 0 件
- AD-023 §5: drift 0
- 新しい ADR の要否: perf の ADR 化は roadmap に回した (利用者の決定)。時期の矛盾は L-101

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-101 | `o3-kpi-smoothness\|M4 完了後に切る\|実機計測ハーネス` in docs/ | 4 | docs/roadmap.md (E2E / 検証基盤の見出し、ADR の項目、O-3 の行) / docs/domains/session/charter.md |
| L-102 | `teardown\|許可リスト` in perf/*.ts + spec.md | 5 | perf/run-judgement.ts / perf/real-sessions.spec.ts / spec.md SC-005 |
| (R1 L-004 の再確認) | `帯\|Root に\|属性を解決` | 5 (いずれも「実装時の変更」付き) | plan.md / research.md / tasks.md |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
- Round inheritance: resolved from 1: 7 / unresolved: 0 / new: 2 (L-101 / L-102)
