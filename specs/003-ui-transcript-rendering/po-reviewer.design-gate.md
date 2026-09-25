# po-reviewer — design-gate (R-3) Round 2

**Run**: 2026-09-24 / read-only

## Verdict: Critical 0 / High 1 / Medium 2 / Low 1

Round 1 resolved: 9 (C-001 SC-009 / H-001 SC-002 / H-002 stale / M-001 SC-006 / M-002 FR-009a / M-003 US-3 / M-004 retry / M-005 obs / L-001)。unresolved: 0。new: 4。

## High (new)

### H-001 — SC-009→SC-010 の割り直しが quickstart / checklist に未伝播、主目的 SC-010 の計測経路が spec と矛盾し rubric が手順に無い
- **Where**: spec.md (SC-009=表示先割り当て / SC-010=見栄え判断) vs quickstart.md:3,60 (「見栄え=SC-009」) / checklists/requirements.md:36 (見栄え=SC-009) / checklists:18 (「SC-001〜SC-009」で SC-010 を落とす) / analyze.md:10,30 (stale)
- **Issue**: SC-010 は主目的 (M1 完了判定・ユーザ受け入れ条件)。その計測経路 quickstart V-9 が自身を SC-009 と誤記し spec と矛盾、かつ V-9 本文が rubric の 4 観点 (a markdown ハイライト / b 日本語行送り / c fallback tool 欠落なし / d 数千件スクロール) の OK/NG 記録表を持たない → quickstart だけ見た実施者が漠然メモで done 到達しうる。
- **Action**: (a) quickstart:3,60 / checklists:36 の見栄え=SC-009 を **SC-010** に訂正。(b) checklists:18 を「SC-001〜SC-010」に。(c) **quickstart V-9 に rubric 4 観点を OK/NG 記録表テンプレとして列挙**し quickstart-results と 1:1 対応。(d) analyze.md の SC 範囲を SC-010/FR-020 まで更新。spec を SSoT に他文書を追随。

## Medium (new)
- **M-001**: SC-010「記録の有無は機械確認可能」を実装する検証タスクが不在 (SH-068 は実機実施のみ)。→ SH-067 に「quickstart-results.md が rubric 4 観点の OK/NG 行を含むこと、欠落時 done fail」を追加。判定表の artifact 形状 (4 行のキー) を grep 可能な決定的形式で定義。
- **M-002** [H viewpoint]: tasks:10 の test-strategy 索引が SC↔検証手段を誤る (SC-002 を quickstart のみ、SC-006/SC-001 を Vitest のみに片寄せ。spec は各々 Vitest+実機の両方)。→ tasks:10 を SC-001/002/006 = 「Vitest + 実機の双方」に訂正。

## Low (new)
- **L-001**: quickstart V-8 の参照が data-model §6 (サニタイザ) を指すが失敗状態は §8。SC-003 の「定数倍以内」の定数 K 未指定。→ 参照を §8 に訂正、SC-003 に K の目安。

## 総括
Round 1 の Critical/High はすべて resolved (SC-010 新設 + rubric + done 必須)。ただし **SC 番号割り直しが quickstart/checklist に未伝播で主目的の検証経路が矛盾 (H-001)** と、done 担保の機械確認未 wire (M-001) を修正すれば設計意図どおりに機能する。
