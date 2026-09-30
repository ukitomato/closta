# PR Gate Round 3: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Base**: main / **Diff stat**: +6383 -19 over 77 files
**Reviewers**: security / architecture / po / database / platform-boundary (5 並列、verification round)
**Round inheritance**: Round 2 (Critical 0, High 0, Medium 5, Low 13)

## Verdict

| Severity | R1 | R2 | R3 |
|---|---|---|---|
| Critical | 0 | 0 | **0** |
| High | 4 | 0 | **0** |
| Medium | 6 | 5 | 4 |
| Low | 12 | 13 | 5 |

**Status**: PASS (Critical=0)。**3 ラウンド連続 Critical=0、2 ラウンド連続 High=0。強い収束。**

## Round 2 fix の検証結果 (全 reviewer)
Round 2 で入れた fix (SEC-M-101 varNames 対称化 / C-M-101 reachability 安全側差 / PB-P-L03 namespace + `as never` 除去 / spec 範囲調整) は**全て resolved・妥当**と確認された。特に:
- `as never` の provider configDir 経路からの完全除去を確認 (platform-boundary)。
- version-skew 上書き防止・一意 temp 名の維持を実確認 (database)。
- reachability の fail-closed 安全側差の妥当性を確認 (architecture)。

## Round 3 の新規指摘 (4 Medium / 5 Low) と対応
**fixed (今 fix + 全緑検証):**
- **C-M-201** (Medium) — FR-009 / data-model §4(b) / plan / tasks に残った aws-assume-role の廃案「3 変数 env 実名注入」記述を R-02 準拠 (helper 委譲=settings) に修正。code は元々 R-02 準拠、doc の自己矛盾を解消。
- **SEC-M-201** (Medium) — secret を UTF-16 `.length` でなく **UTF-8 バイト長** (`MAX_SECRET_PLAINTEXT_BYTES` + TextEncoder) で縛る。multibyte secret の reload 消失を塞ぐ + 負例テスト。
- **DB-P3-M01 / PB-M-001** (Medium、同一) — unc configDir の store round-trip 正例 + 不正 namespace load 負例を追加 (永続 read 境界を回帰保護)。
- **H-L-201** (Low) — aws-assume-role が env.AWS_* を注入しない negative assert。 **PO-L-201** (Low) — SC-004 の IPC 呼称を `listReachableProviders` に統一。

**deferred (X-4 / future / 任意):** SEC-L-201 (helperPath/env 制御文字拒否 → X-4 helper 実行前) / DB-P3-L01 (temp orphan sweep → system) / PB-L-001 (unc 値形検証 → 任意) / DB-P-M03 (observability DTO → X-4) / DB-P-M04 (migration seam → future) / AD-039 D4・AD-005 後続 ADR (out-of-scope。roadmap ポインタ済)。

## 修正後の機械検証 (全緑)
tsc node/web 0 / depcruise 0 (251 modules) / check:constitution 0 / lint 0-0 / **test 1122 passed (71 files)** / test:rules 32/32。

## done 前の既知ブロッカー
- **SH-022 (quickstart 実機記録)**: 人間 deferred。実機操作は人間だが**判定表の記録は done 必須** (SC-009(b) 実ホストスキャン網羅 = charter KPI「検出の網羅」= 手動検証)。

各 reviewer raw output: `<reviewer>.pr-gate.round3.md`。
