# Design Gate: Tier A tool 表示 (R-4) — Round 2 (re-verify)

**Run**: 2026-09-25 (Round 2)
**Spec**: specs/004-ui-tier-a-tool-display/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Round 1**: [design-gate.round1.md](design-gate.round1.md) (FIX_REQUIRED, Critical 1 / High 3 / Medium 8 / Low 5)

## Verdict

| Track                      | Critical | High | Medium (unresolved/new) | Low (unresolved/new) |
| -------------------------- | -------- | ---- | ----------------------- | -------------------- |
| analyze                    | 0        | 0    | 2 (partial-apply残)     | 2 (1 accepted)       |
| po-reviewer                | 0        | 0    | 1                       | 1                    |
| architecture-reviewer      | 0        | 0    | 1                       | 0                    |
| security-reviewer          | 0        | 0    | 1                       | 0                    |
| platform-boundary-reviewer | 0        | 0    | 0                       | 1                    |
| **Total (dedup)**          | **0**    | 0    | (下記、全て解消済み)    | (下記)               |

|                      | Critical | High  |
| -------------------- | -------- | ----- |
| Resolved from prev   | 1        | 3     |
| Unresolved from prev | 0        | 0     |
| New in this run      | 0        | 0     |

**Status**: PASS
**Next**: Critical=0 かつ 元 status `tasking` → **tasking → implementing 昇格**、`/cl-implement specs/004-ui-tier-a-tool-display` 起動可能。

cascade_enforce: 0件確認なし Critical → High 降格は該当なし (Critical 0)。

## Round 1 → Round 2 の解消

Round 1 の **Critical 1 + High 3** はすべて解消:

| R1 finding | 解消 |
| --- | --- |
| **C-001** SC-010 が M1完了/軸1確定を計測不能 | **人間承認 (a) positioning 緩和** — SC-010 を「判断材料の提示 + 判定表の記録」に、軸1確定は roadmap tracked debt の別ステップへ。po R2 が overclaim 解消・machine-checkable を確認 |
| **H-1** argsText が sanitize/byte cap を通らない | argsText に `sanitizeBody` (bidi/C1 除去) + byte 上限を domain `transcript.ts` (取得プロセス側・parse 前) で適用。security R2 が全 5 表示 + 入れ子で airtight を確認、architecture R2 が layer 健全性を確認、platform-boundary R2 が main off-path 維持を確認 |
| **H-2** bidi/byte テスト欠如 | BE-012 (domain 正本) + FE-021 + FE-042 (DOM 端点) に追加 |
| **H-3** linkage key 断定 + AD-020 誤帰属 + glossary 矛盾 | 全 artifact で key-neutral 化 (「親参照 id、R-02 で確定」)、AD-020 を SDK 型の分母に限定、glossary 粒度を統一 |

Round 1 の Medium 8 / Low 5 もすべて解消 (循環/自己参照 visited-set、registry 5-not-7、MarkdownText plan 経路の safe-url 固定、SC-003 書き分け、FR-007 共存テスト、SC-006 入れ子 frame 構造検査、depth SSoT、ラベル修正、log 経路 secret ガード ほか)。

## Round 2 で検出した partial-apply 残り (すべて本 Round の追記で解消済み)

Round 1 fix の部分適用による live cross-artifact 矛盾を Round 2 が検出。いずれも Critical/High ではなく、
本 Round のレビュー後追記で解消した:

| R2 finding | origin | 解消 |
| --- | --- | --- |
| contract C-1 が「7 種」残存 | analyze A-M-2 | C-1 を「5 tool 種と 1:1」に訂正 |
| linkage key 中立化の未適用スポット (FR-010 / US-2 Independent Test / data-model §3 表 / plan glossary・src・#1) | analyze A-H-1 | 全スポットを「親参照 id、R-02 で確定」に中立化 |
| plan Complexity Tracking「argsText は小さく」残存 | platform-boundary PB-L-001 / architecture M-003 | 「取得プロセス側で sanitizeBody + byte cap 済み」に改稿 |
| bidi 除去テストの責務層/検証層のずれ (SSoT=domain だが assertion が renderer) | security M-N01 | 正本を BE-012 (domain)、`tool-args.test` は narrowing のみ、DOM 端点 FE-042 に整理 |
| plan #7 / quickstart:9 が「二次判断 done 必須」を残す + ラベル残滓 | po N-001/N-002 | positioning 緩和に統一、「判断材料の提示」に置換 |
| spec Assumptions の depth 値ポインタが §4 SSoT と不一致 | analyze A-L-2 | 「data-model §4 (SSoT)」に修正 |

**accepted (非 block)**: Principle XII vacuous scope 文の 3 箇所逐語重複 (analyze A-L-3)。analyze 自身が
「drift ではなく既知の gate item。各文脈に存在理由があり consolidation は nice-to-have」と評価。data-model §3 を正本と宣言済み。

## 人間承認事項 (design-gate) — 確定

1. **C-001 の解消方針**: **(a) positioning 緩和を確定** (ユーザ承認済み)
2. **Principle XII の scope 解釈の継続** (data-model §3 を O-2 前の暫定台帳、ui-coverage.md を O-2 に委譲、vacuous、人間承認): 継続を承認 (R-3 承認済みの継続)
3. **起票する ADR** (element 選定 + subagent 入れ子 DTO + tool-UI 登録方式 + 深さ打ち切り): 採用 (実装フェーズ SH-002。設計判断の記録)
4. **charter / _overview の追随**: 実装フェーズ SH-061 で反映

## Track raw outputs

- Round 2: [analyze.round2.md](analyze.round2.md) · [po-reviewer.design-gate.round2.md](po-reviewer.design-gate.round2.md) · [architecture-reviewer.design-gate.round2.md](architecture-reviewer.design-gate.round2.md) · [security-reviewer.design-gate.round2.md](security-reviewer.design-gate.round2.md) · [platform-boundary-reviewer.design-gate.round2.md](platform-boundary-reviewer.design-gate.round2.md)
- Round 1: [analyze.md](analyze.md) · [po-reviewer.design-gate.md](po-reviewer.design-gate.md) · [architecture-reviewer.design-gate.md](architecture-reviewer.design-gate.md) · [security-reviewer.design-gate.md](security-reviewer.design-gate.md) · [platform-boundary-reviewer.design-gate.md](platform-boundary-reviewer.design-gate.md)
