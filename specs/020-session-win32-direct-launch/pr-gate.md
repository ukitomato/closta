# PR Gate Round 1: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Base**: main (merge-base 0ba52bd。origin/HEAD の symref `001-runtime-folder-registration-runtime-detection` は stale なので使っていない。PR の base は main)
**Head**: 7e5e1ba
**Diff stat**: +7280 -161 over 106 files
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, database-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (8 並列)
**Skipped reviewers**: なし (`reviewers_filter pr-gate` が候補 8 件すべてを返した)。lint-agent / test-agent / convention-reviewer は code-gate 専任のため起動しない
**Round inheritance**: Round 1 (前 round なし)
**Rule verification**: 実行した (Round 1)。`node scripts/rules/run.mjs` exit 0、期待表と一致 74 件、機械検証で捕まらない経路 9 件 (既知の追跡対象。期待表との不一致なし)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 3 | 0 | 3 | 3 | 0 |
| Medium   | 13 | 0 | 13 | 13 | 0 |
| Low      | 16 | 0 | 16 | 16 | 0 |

件数は reviewer 間の重複を統合した後のもの (統合前: High 5 / Medium 15 / Low 18)。code-gate の `must_fix_findings` は 0 件のため suppress 対象なし。

**Status**: PASS (Critical=0)

**Next**:
  PASS → /cl-done specs/020-session-win32-direct-launch
  ただし AD-050 により High 3 件はこの round で直す (High を確かめるためだけの round は回さない)。H-001 は利用者の判断を要する。

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 実機の V-1 / V-3 を「完了の前に必須」とする AD-058 Confirmation / spec SC-001 / SC-004 と、「完了」と書く roadmap / _overview の食い違い [origin: architecture H-001 + po H-001]
- **Where**: docs/decisions/0058-win32-direct-launch-contract-and-process-tree-stop.md:68, specs/020-session-win32-direct-launch/spec.md:204, :207, tasks.md:9, :96, :109, plan.md:203, quickstart.md:6, quickstart-results.md:20, docs/domains/_overview.md:72, docs/roadmap.md:385
- **Issue**: tasks.md:96 の夜間の規則の読み替えだけで、正本 (AD-058 / spec SC) の必須条件を外して「完了」と記録している
- **Why high**: SC-004 (US-3 の唯一の合否判定) が決まらないまま completed になり、X-9 が未実証の前提に立つ
- **Suggested fix**: (最小) `_overview.md:72` / `roadmap.md:385` を「実装済み・マージ済み (V-1 / V-3 は未充足)」にし、main での completed コミットを V-1 / V-3 の後に置く。V-1 / V-3 なしで完了にするなら後続 ADR か利用者承認つきの SC 改定 (AD-058 の in-place 書き換えは AD-031 で不可)。どちらにするかは利用者の判断
- **Status in this round**: new

### H-002 — Win32 で既定 Provider の確認文が「ディストロ内の claude の既定の資格情報と課金先」と言う [origin: ux H-002 + po H-002]
- **Where**: src/renderer/src/features/session/labels.ts:529, :536, src/renderer/src/features/session/LaunchDialog.tsx:759-763
- **Issue**: `PROVIDER_DEFAULT_LABELS` は `{wsl, win32}` に分けたが、確認文はランタイム種別で分けていない
- **Why high**: 課金先と資格情報の同意文が Win32 の実態と食い違う
- **Suggested fix**: 確認文を `{ wsl, win32 }` の Record にし、選んだランタイムの kind で引く。Win32 の文言テストを足す
- **Status in this round**: new

### H-003 — Win32 セッションの行・ヘッダ・パレット・検索のランタイム名が「見つからないランタイム」になる [origin: ux H-001]
- **Where**: src/renderer/src/features/session/RunningSessionsProvider.tsx:57-64 (消費側 RunningSessionRow.tsx:86,260 / CenterPane.tsx:85 / palette-commands.ts:178 / session-search.ts:154)
- **Issue**: `distroName ?? SESSION_NAME_FALLBACKS.runtime` で、Win32 の descriptor は `distroName: null`
- **Why high**: FR-013 / spec Edge Cases (ランタイムの表示名で見分ける) に反する。design-gate M-013 / analyze E2 が未解消のまま
- **Suggested fix**: `runtimeTitle(r.kind, r.distroName)` 経由にし、Win32 の行が「Windows (ホスト)」と出るテストを足す
- **Status in this round**: new

## Medium / Low

本文は各 reviewer の raw output を参照 (AD-050: Medium / Low は直さず、マイルストーン末の棚卸しで扱う)。統合した重複:
- architecture M-002 = platform-boundary M-001 (`configDirRuntimePath` が `HostPath | RuntimePath`)
- ux M-001 ≈ po M-002 (Win32 の確認文・表示のテスト欠落)
- architecture L-001 = platform-boundary L-004 (`kind === 'win32' ? … : WSL` の二分)
- security L-002 = platform-boundary L-001 (taskkill の照合が末尾の名前だけ)

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) — C0 H0 M2 L4
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) — C0 H1 M2 L2
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) — C0 H2 M2 L1
- [database-reviewer.pr-gate.md](./database-reviewer.pr-gate.md) — C0 H0 M2 L2
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) — C0 H2 M2 L4
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) — C0 H0 M3 L1
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) — C0 H0 M2 L4
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) — C0 H0 M0 L0
