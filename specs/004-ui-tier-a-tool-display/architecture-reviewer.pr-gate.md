# pr-gate Round 2 (re-verify): architecture-reviewer (R-4 / Tier A tool 表示)

**Run**: 2026-09-25 · Read-only · **Round**: 2

## Verdict

architecture-reviewer: Critical 0 / High 0 / Medium 0 / Low 1 (UNRESOLVED + NEW only)

Round 1 was Critical 0 / High 2 / Medium 2 / Low 2. All 6 Round-1 findings are resolved. One residual Low (incomplete sweep of the M-001 family) remains. No High/Medium introduced.

Round inheritance: resolved from Round 1: 6 (H-001, H-002, M-001, M-002, L-001, L-002) / unresolved: 0 / new: 1 (Low)

## 初回読了 viewpoint

- FR/SC touched: FR-004/005/006/009/010/011/012, SC-004/SC-009 (subagent 入れ子 + plain-text plan); AD-035 D4/D5/D6.
- charter/Confirmation touched: `docs/glossary.md` (Element / Subagent / Subagent group), AD-035 Confirmation。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner (marker injection の設計面は D で確認済)
- C. 業務不変条件 / Charter・Glossary drift: Critical:0 High:0 Medium:0 Low:0 (glossary L-001 解決、cross-domain invariant 侵害なし)
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1 (AD-035 D6 vs data-model §2/§3 残留)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer owner (code-gate PASS)
- G. optional reviewer 範囲: 該当なし: 本 reviewer 範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (Round-1 指摘の検出テストが全て新設)

## Resolved

**H-001 (SC-009 overstate + single-pass + no test) — RESOLVED**
- Narrowing が全成果物に伝播: spec `spec.md:268-270`, `data-model.md` §4, `contracts/transcript-subagent.md` C-1/C-2, AD-035 D5。
- 実装は single-pass forward (`transcript.ts:182-296`) で narrowing 後の文言と一致。
- テスト新設: `transcript.test.ts:333-352` 隣接非依存、`:354-378` MAX_SUBAGENT_DEPTH 超過の top-level 平坦化。

**H-002 (`__` marker が untrusted args と同一 namespace) — RESOLVED**
- `convert.ts:33-39` `stripInternalKeys` が `__` prefix を常時除去、`:54-58` で信頼値を無条件設定。
- `subagent.aui.tsx:31-47` `isValidChild`、`code-diff.aui.tsx:106-109` は信頼 `__truncated` のみ読む。AD-035 D4 に記録。
- 負テスト: `ChatScreen.test.tsx:495-545`。

**M-001 (Agent plan plain-text vs contract/data-model/FR drift) — RESOLVED (残留 1 件は下記 NEW)**
- plain-text 化が伝播: FR-006, `data-model.md` §6, C-3, FE-027, quickstart V-5, roadmap tracked debt。実装 `agent-plan.aui.tsx:37-39` と AD-035 D6 に一致。

**M-002 (H-001/H-002 検出テスト不在) — RESOLVED** — adjacency / depth / injection テストで担保。

**L-001 (glossary 未登録) — RESOLVED** — `glossary.md` Element の Note(R-4) + Subagent group。

**L-002 (ToolFallback slot が dispatcher 兼務) — RESOLVED** — `thread.aui.tsx` に警告コメント追加。

AD-035 忠実度: D4 / D5 / D6 いずれも code と一致。code-gate verdict PASS。

## Unresolved / New

### [Low] AD-035 D6 (plain-text) と data-model §2/§3 の残留 markdown/XSS-境界 記述 (ARCH-L-003) (scope: feature) — **修正済み (invoker 適用)**
- **Where**: `specs/004-ui-tier-a-tool-display/data-model.md` §2 (ExitPlanMode 行) と §3 (割り当て表)。
- **Issue**: M-001 の plain-text 化が §6 等には伝播したが、data-model §2・§3 の 2 セルだけ旧「markdown → XSS/URL 境界」記述が残り AD-035 D6 と矛盾。SSoT (§6) は修正済みのため実害は限定的だが accepted ADR の Decision と成果物文言が矛盾する残留 drift。
- **適用した Fix**: §2/§3 の 2 セルを D6 の plain-text 記述に統一 (React escape / 生 HTML 非描画 / `javascript:` inert / markdown 整形は tracked debt)。

## 新規 drift 確認
- convert.ts の marker を全 tool-call に無条件付与する点は AD-035 D4「信頼値を明示設定」に沿い、下流は Task/Edit のみ読むため無害。新規 drift なし。
- Principle IX / XIII / AD-023 layering / AD-034 port 経路: いずれも Round 1 から不変、fix による退行なし。

## 同種事象探索 cascade summary
| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (Critical なし) | — | — | Critical 申告なしのため cascade 必須要件は非該当 |
| 参考: 並べ替え不変/隣接非依存 文言 | `並べ替え不変` | Round 2 で invoker が 4 箇所を隣接非依存へ修正済 (po PR-M と同一系) | quickstart-results/tasks/plan/0035 |
