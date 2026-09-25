# PR Gate Round 2: Tier A tool 表示 (R-4)

**Run**: 2026-09-25
**Base**: main (working-tree diff; feature uncommitted)
**Diff stat**: 12 tracked +890/-68 + 新規ファイル群 (6 elements + tool-args + tests + ADR-0035 + spec artifacts)
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer (3 並列 clean-context)。platform-boundary-reviewer は非起動 (下記 skipped)
**Round inheritance**: Round 1 findings (High: 3, Medium: 3, Low: 3) を引継ぎ (full inheritance — 各 reviewer に Round 1 raw output を渡して解消を再検証)

## Verdict

| Severity | Surfaced this round | Resolved from R1 | New in R2 | Net unresolved (in-round 修正後) | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | **0** | 0 |
| High | 0 | 3 | 0 | **0** | 0 |
| Medium | 1 (PO-M) | 3 | 1 | **0** | 0 |
| Low | 4 | 3 | 4 | **0** | 0 |

**Status**: **PASS (Critical=0)**

Round 1 の 3 High はすべて解消を確認 (下記)。Round 2 で surfaced した 1 Medium + 4 Low は
いずれも Low〜Medium の非 Critical 残渣で、**invoker が in-round で修正し機械検証で確定した**
(「並べ替え不変」grep=0 / ChatScreen 34 tests pass / lint 0 / tsc-web 0)。
残渣は doc 文言・テスト追加・1 行 guard のみで、再レビューで判断が変わる余地のない決定的検証で裏取り済みのため Round 3 は起こさない。

**Next**: PASS → `/cl-done specs/004-ui-tier-a-tool-display`

## Round 1 High の解消確認 (Round 2)

### PR-H-1 (injection) — RESOLVED [security H-001 + architecture H-002]
`convert.ts:33-58` が `__` prefix を strip し `__subagentChildren`/`__truncated` を信頼値で無条件設定。
`subagent.aui.tsx` の `isValidChild` + breadth 上限。負テスト `ChatScreen.test.tsx:495-545` (偽 children / malformed / 偽 truncated)。security・architecture 両 reviewer が閉塞を確認。

### PR-H-2 (SC-009 overstate) — RESOLVED [po H-002 + architecture H-001]
SC-009 / AD-035 D5 / data-model §4 / contract / quickstart-results を「id ベース・隣接非依存 (親 Task が子より前提)」に narrowing。
隣接非依存テスト `transcript.test.ts:333-352` + depth-overflow `:354-378`。po・architecture 両 reviewer が整合を確認。

### PR-H-3 (Agent plan drift) — RESOLVED [po H-001 + architecture M-001]
plain-text を正式方針として FR-006 / US-1 AC-4 / C-3 / data-model §6 / FE-027 / quickstart V-5 / roadmap tracked debt に伝播。
実装 `agent-plan.aui.tsx:37-39` と AD-035 D6 に一致。po・architecture 両 reviewer が伝播を確認。

## Round 2 で surfaced した残渣 (すべて in-round 修正 + 検証済み)

### [Medium] PO-M — 「並べ替え不変」文言が 4 artifact に残り狭義化 SC-009 と矛盾 (done-evidence 過大主張)
- **Where**: `quickstart-results.md:21` / `tasks.md:57` / `plan.md:191` / `docs/decisions/0035-...md:102`
- **修正**: 4 箇所を「隣接非依存」に統一。quickstart-results.md は実在テスト名 (入れ子/孤児/多段/隣接非依存) に修正。0035 は merge 前の新規 ADR のため in-place 修正。
- **検証**: 追跡成果物への `並べ替え不変` grep = 0 (残るのは design-gate の歴史記録 1 件のみ、改変対象外)

### [Low] ARCH-L-003 — data-model §2/§3 の残留 markdown/XSS 境界記述
- **Where**: `data-model.md` §2 (ExitPlanMode 行) / §3 (割り当て表)
- **修正**: 2 セルを D6 の plain-text 記述に統一

### [Low] PO-L1 — 巨大 diff 折りたたみの render テスト不在 + バッジ説明の不正確
- **修正**: `ChatScreen.test.tsx` に >200 行 Write → 「残り N 行を省略」テストを追加。`data-model.md:39-40` を正確化 (`truncated` = argsText 切り詰め ∨ result 切り詰めの論理和、バッジは result 切り詰めの信号)。
- **注**: reviewer の「バッジ削除」提案は**不採用** — `transcript.ts:238` により result 切り詰め時にバッジは到達可能なため dead UI ではない。

### [Low] PO-L2 (NEW) — subagent breadth 打ち切りが未テスト
- **修正**: `ChatScreen.test.tsx` に 51 件 children → 「（以降 1 件を省略）」テストを追加

### [Low] SEC L-NEW-1 — `isValidChild` が `parts` 各要素まで未検証 (defense-in-depth)
- **修正**: `subagent.aui.tsx:83` を `Array.isArray(part.children) && part.children.length > 0` にガード (到達経路は無いが再帰描画側の対を閉じた)

## 機械検証 (in-round 修正後)

| 検査 | 結果 |
|---|---|
| lint (変更ファイル) | 0 errors |
| tsc-web (`tsconfig.web.json`) | clean |
| ChatScreen.test.tsx (`--maxWorkers=1`) | **34 passed** (32→+2: PO-L1/L2 新規テスト) |
| `並べ替え不変` grep (追跡成果物) | 0 |
| cascade_enforce (3 reviewer) | demotions 0 (未確認 Critical なし) |
| viewpoint_coverage (3 reviewer) | A-H all present |

## Track raw outputs
- [security-reviewer.pr-gate.round2.md](security-reviewer.pr-gate.round2.md)
- [architecture-reviewer.pr-gate.round2.md](architecture-reviewer.pr-gate.round2.md)
- [po-reviewer.pr-gate.round2.md](po-reviewer.pr-gate.round2.md)

## skipped reviewers
- **platform-boundary-reviewer**: Round 1 は 0C/0H/0M/1L で、唯一の Low (depth-overflow test) は解消済み。trigger の `eslint.config.mjs` は Round 1 以降不変で、Round-2 変更 (subagent guard 1 行 / docs / tests) は runtime・IPC・永続化境界に触れないため非再起動。R1 verdict を継承
- **a11y-reviewer / ux-reviewer**: reviewers.yml auto_invoke_patterns 非該当 (`elements/**` と `*.test.tsx` は exclude)
- **database-reviewer**: migrations/sql/settings/secrets 非該当

## rule verification
Round 1 で `node scripts/rules/run.mjs` exit 0 (期待表全件一致) を確認済み。Round 2 は Round 1 以降に規則定義
(`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/**` / `tests/rule-fixtures/**` / `scripts/rules/**`)
の変更が無いため再実行せず (SKILL Phase 0 step 6)。
