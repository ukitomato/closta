# Track A — speckit-analyze (design-gate, R-3) Round 2

**Run**: 2026-09-24 / read-only

## Verdict: Critical 0 / High 0 / Medium 4 / Low 3

Round 1: Medium 3 全 RESOLVED (I1 dir / C1 XII 承認 / G1 post-design)、Low 5 中 4 RESOLVED、U1 は plan FR drift として N1 に転移。

FR 20/20 に ≥1 task (カバレッジ 100%)。SC 10/10 に計測経路。US-1〜3 と `## US-N` 一致。未解決マーカーなし。Duplication 0。Constitution/ADR 参照は正確 (v1.2.5、AD-031/033/021/030/020/019 を原文照合)。**MUST 違反なし → Critical 0。**

## 新規 finding (Round 2)

| ID | Category | Severity | Location | 説明 | 提案 |
|---|---|---|---|---|---|
| **N1** | Inconsistency | Medium | plan.md 複数 | **plan の FR 識別子が現行 spec より一律ずれ** (spec/tasks は正)。「composer 送信経路 閉 (FR-013)」→ 正 FR-014、「仮想化 ViewportProvider (FR-014)」→ FR-015、「日本語 (FR-015)」→ FR-016、「streaming text (FR-009)」→ FR-010。FR 挿入後に plan が未追随 | plan の該当箇所を現行 spec 番号へ更新 |
| **N2** | Inconsistency | Medium | plan #8 / quickstart.md L3・V-9 | **見栄え一次判断 SC の番号が SC-009/SC-010 で食い違う**。spec は SC-010=見栄え。plan #8 / quickstart が SC-009 と誤記 → SC-010 (done 必須) の計測経路リンクが V-9 側で切れる (po H-001 と同根) | plan #8 と quickstart を SC-010 に統一 |
| **N6** | Coverage | Medium | tasks FE 群 / FR-020 | **FR-020 の URL allowlist を実装する task が無い** (FE-034 は test のみ、FE-040 は仮想化)。SC-008 のセキュリティ要件が test-only で実装が暗黙 (security S-004 と同根) | 既存 FE task に「markdown URL allowlist 実装 + rehype-raw 不採用の確認」を明記 or 新 FE task |
| **N7** | Coverage | Medium | tasks BE-027 / contract C-2 | **contract C-2 が約束する「並行要求で各応答が targetKey と一致する回帰テスト」を実装する task が無い** (platform-boundary H-102 と同根) | BE-027 に env レース回帰テストを加える |
| N3 | Inconsistency | Low | quickstart V-8 | 参照が data-model §6 (サニタイザ) を指すが失敗状態は §8 | §8 に訂正 |
| N4 | Ambiguity | Low | spec FR-005 vs contracts C-3 | FR-005「port を渡さない」が C-3 (main 仲介 transfer 可) と字面矛盾 (security S-001 と同根) | FR-005 を「main 検証を迂回する未仲介 port を渡さない」に精緻化 |
| N5 | Inconsistency | Low | tasks phase 見出し | Phase 1/2 → Phase 7 に飛ぶ (3-6 欠) | US 節を Phase 3-5 相当と明記 or 番号振り直し (cosmetic) |

## Next Actions
Critical/High 0 で hard-gate 上 blocking なし。Medium 4 (N1/N2/N6/N7) は identifier 整合・カバレッジ穴で FIX 推奨。N2 は done 必須 SC-010 のリンク切れ、N6/N7 はセキュリティ要件の実装/検証 task 欠落なので優先。
