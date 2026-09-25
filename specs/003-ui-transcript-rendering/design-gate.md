# Design Gate: transcript の基本表示 (R-3) — Round 2

**Run**: 2026-09-24
**Spec**: specs/003-ui-transcript-rendering/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [design-gate.round1.md](design-gate.round1.md) (Round 1: Critical 4 / FIX_REQUIRED)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 4      | 3   |
| po-reviewer                | 0        | 1    | 2      | 1   |
| architecture-reviewer      | 0        | 2    | 2      | 0   |
| security-reviewer          | 0        | 2    | 3      | 2   |
| platform-boundary-reviewer | 0        | 2    | 1      | 0   |
| **Total (dedup)**          | **0**    | 6    | 7      | 4   |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from Round 1 | 4        | 7    |
| Unresolved from R1   | 0        | 0    |
| New in Round 2       | 0        | 6    |

**Status**: PASS (Critical=0)
**Next**: status `tasking → implementing` 昇格、`/cl-implement specs/003-ui-transcript-rendering` 起動可能。

**Round 1 の Critical 4 + High 7 はすべて resolved** と全 5 トラックが確認。Round 2 の新規 High/Medium は
いずれも Round 1 修正が生んだ整合ドリフト + 設計の詰めであり、**本 Round の集約後に設計文書へ反映済み**
(下記 [対応済み] 参照)。新規 Critical は 0。設計の中核 (main を本文経路から外す MessageChannelMain 構造 /
env 固定専用プロセス / Principle IX の検証正直化 / 到達集合検査の持ち主登録 / Principle XII の vacuous 明記) は
accepted ADR (AD-031/AD-033/AD-030/AD-021/AD-023) と整合している。

## Round 1 Critical の解消 (全 track 合意)

- **R1 C-001 (Principle IX main-in-path + 検証虚偽)** → resolved: MessageChannelMain で main を本文経路から外し、
  SC-007 を「port transfer 構造検査 + 手動レビュー、到達集合検査は未構築」に正直化、SH-062b で持ち主登録。
- **R1 C-002 (共有 env 並行レース)** → resolved: target ごと env 固定の専用短命プロセスで取得 (常駐に相乗りしない)。
- **R1 C-003 (normalize 本文流用)** → resolved: 本文用サニタイザ (改行/タブ保持・bidi/C1 除去) を新設。
- **R1 C-004 (SC-009 rubric 欠如 + done 非必須)** → resolved: SC-010 に rubric 4 観点 + 判定表の記録を done 必須 artifact に。

## Round 2 High (6, dedup) — すべて [対応済み]

- **H-001 plan VII の文言矛盾** (arch H-001 / pb H-101): plan.md:137「既存列挙プロセスに相乗りさせる」→ 専用プロセスに訂正。[対応済み]
- **H-002 spawn 許可リスト計上漏れ** (arch H-002 / pb M-101): SH-001 ADR (f) に `PROCESS_SPAWN_MODULES` 追加 + SH-060 + SSoT 表 + SH-067 の項目 7 緑確認。[対応済み]
- **H-003 env レース回帰テスト未割当** (pb H-102 / analyze N7): BE-027b に並行 targetKey 一致の回帰テストを追加 (C-2 検証行と 1:1)。[対応済み]
- **H-004 SC-009→010 の quickstart/checklist 未伝播** (po H-001 / arch M-002 / analyze N2): quickstart V-9 (SC-010 + rubric 表) / checklists / plan #8 を訂正。[対応済み]
- **H-005 直結 port の inbound 未規定 + FR-005 矛盾** (security S-001 / analyze N4): FR-005 精緻化 + contracts C-3 に「port2 は一方向送出専用、inbound 受理しない」。[対応済み]
- **H-006 画像 URL allowlist と実 CSP 不整合** (security S-002): 画像 URL を `data:`(画像)/相対のみに絞り http(s) を除外 (spec FR-020 / data-model §7)。[対応済み]

## Round 2 Medium (7, dedup) — 主要 [対応済み]

- **M-001 SC-010 の機械確認未 wire** (po M-001): SH-067b に quickstart-results の rubric 4 観点記録の機械確認を追加。[対応済み]
- **M-002 URL enforcement タスク欠** (security S-004 / analyze N6): FE-035 に URL allowlist 実装タスクを新設。[対応済み]
- **M-003 ADR の AD-030 調停不足** (arch M-001): SH-001 (g) に並行 spawn 劣化 + 寿命/孤児処理 + 第 3 プロセス形態の位置づけ。[対応済み]
- **M-004 in-flight プロセス kill / 同時上限** (security S-003): data-model §8 に切替時 kill + 同時数上限。[対応済み]
- **M-005 plan FR 番号 drift** (analyze N1): plan の FR-013/014/015/009 参照を現行 spec 番号に訂正。[対応済み]
- **M-006 test-strategy 索引の SC 片寄せ** (po M-002): tasks の Tests 行を SC-001/002/006 = Vitest+実機 に訂正。[対応済み]
- **M-007 observability** (security M-003): bounded FailureReason + 本文非 log で対応。取得プロセス spawn/port 失敗の粒度は最小 (carried)。

## Round 2 Low (4) — carried (実装/後続で精緻化)

- S-005 本文サニタイザの危険 C0 集合と CR の実名確定 (BE-013/BE-014 で実装時に固定)
- S-006 取得プロセスへ渡す env の実名 allowlist (BE-020/BE-026 で固定)
- po L-001 SC-003 の定数 K の目安 / quickstart V-8 の §参照 (§8 に訂正済み)
- analyze N5 tasks の Phase 番号非連続 (cosmetic)

## 人間承認が要る項目 (pr-gate / 実装前に確定)

1. 起票 ADR (SH-001): transcript 取得経路 + プロセス境界 + SDK 許可拡張 + `PROCESS_SPAWN_MODULES` 拡張 + AD-030 調停
2. Constitution Principle IX PATCH (SH-062): 「到達集合検査は未構築」を残す
3. 到達集合検査の持ち主 feature の roadmap 登録 (SH-062b)
4. charter / `_overview.md` の追随 + KPI E2E 計測経路の注記 (SH-065)
5. Principle XII の scope 解釈 (data-model §3 を O-2 前の暫定台帳、不在中は自動検証 vacuous)
6. MarkdownText 継続 / Streamdown を X-1 で評価する判断

## Track raw outputs (Round 2)

- [analyze.md](analyze.md)
- [po-reviewer.design-gate.md](po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](platform-boundary-reviewer.design-gate.md)
