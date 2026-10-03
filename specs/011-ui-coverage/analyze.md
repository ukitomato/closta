# Specification Analysis Report: 011-ui-coverage (O-2) — design-gate Round 2 Track A

読んだもの: spec / plan / tasks / data-model / research / quickstart、constitution v1.2.9 (改定手順・XII・XIII・版の方針表)、ui charter、`_overview.md`、glossary、roadmap、AD-019 / AD-035 / AD-041 (g)、SDK 0.3.270 の `sdk.d.ts` の hook / task の型。AD-020 / AD-034 / AD-043 の Decision と Confirmation は R1 の確認に依った。ファイルは編集していない。

## R1 の指摘の判定

25 件のうち 24 件 resolved、1 件 (T1: research の ID が feature の ID に見える) が一部 resolved、unresolved 0。C1 (ADR なしの改定) → AD-044 を先に起こす。C2 (版) → MINOR v1.3.0。I1〜I11 / U1〜U4 / G1 / G2 / D1 / T2 / A1 / A2 / R1 → resolved。

## 新しい指摘 (Round 2)

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| N1 | Inconsistency | HIGH | data-model §2 (合成「`status` は `next`」「知らない値は `unknown`」); `sdk.d.ts:5639-5646` (`patch.status?` は任意); spec US-2 AC4; BE-021 | `task_updated` はよく `patch.status` を持たない (`is_backgrounded` / `end_time` / `description` / `total_paused_ms` だけの変化)。変換が `unknown` を作り、合成が `running` を上書きして、実行中に「結果不明」になる | 変換の出力の status を任意 (無しの印) にし、合成は無しのとき `prev.status` を保つ。BE-021 に「status の無い更新で `running` が保たれる」 |
| N2 | Inconsistency | MEDIUM | spec FR-009 (行の無い更新は捨てる) vs data-model §2 (名前があれば行を作る); BE-021 | 隠した task・開始を見ていない task への `patch.description` つきの更新が行を作り、spec に反する | 行を作れるのを `hook_started` / `task_started` に限るか、spec を合わせる。BE-021 にケース |
| N3 | Underspec | MEDIUM | spec US-2 / FR-008 / glossary; data-model §2; `sdk.d.ts:5606-5627` (`is_backgrounded`、`ambient`) | `task_started` は前景の task (`is_backgrounded: false`) にも出る。`Agent` の subagent (local_agent) ごとに Subagent の表示に加えて event の行が出る | `is_backgrounded` / `ambient` で絞るか重複を受け入れるかを決めて data-model §2 と AD-044 / A 節の備考に。V-4 で確かめる。絞るなら許可リストに足す |
| N4 | Underspec | MEDIUM | plan「thread.aui.tsx の data part の分岐」; data-model §2; FE-010 / FE-012; `thread.aui.tsx` (data part の分岐は今は無い) | 分岐は新しく作る必要がある。event の行は `role: 'assistant'` なので、assistant のメッセージの体裁 (action bar・コピー・読み上げ) で描かれうる | FE-010 に data part の登録の仕方と assistant の体裁なしで描くことを書く。FE-012 に action bar が無いこと・assistant の発話として読まれないこと |
| N5 | Ambiguity | LOW | spec FR-003 (「読めた名前が極端に少ない」); plan RK-03; BE-011 | 閾値が定義されていない | data-model §1 に節ごとの下限を書く |
| N6 | Underspec | LOW | data-model §1 (`後続` の ID は roadmap の表の ID 列); roadmap (P-4・SPIKE-12・完了済みの O-1 も ID 列にある) | どの表の ID を有効とするかが無い。`後続: SPIKE-12` や完了済みの `O-1` が通る | feature の順の表に限り、完了済みの ID を違反にするかを決める。BE-011 にケース |
| N7 | Inconsistency | LOW | plan Project Structure (`features/session/.../labels.ts`、`cl-{code,pr}-gate/SKILL.md`) vs research R-06 / R-09 | R1 の残り | `features/chat/labels.ts` と `cl-pr-gate/SKILL.md` だけに |
| N8 | Inconsistency | LOW | spec FR-004 (O-6 の範囲) vs research R-11 / R-01 / SH-010 (B 節の機械照合は O-6) | FR-004 に B 節の機械照合が無い | FR-004 の O-6 に足す |
| N9 | Constitution (procedure) | LOW | tasks SH-090; constitution 改定手順 step 2 / step 4; FR-016 (Manual の `ux-reviewer`) | SH-090 に手順 2 (人間と architecture-reviewer の確認) と 4 (Amendment trail) が無い。`ux-reviewer` を残すかが不明 | SH-090 に足し、`ux-reviewer` を残すか書く |
| N10 | Underspec | LOW | spec FR-009 / data-model §2 (終了・失敗の後に結果不明); FE-010 | 過去ログと共有の `thread.aui.tsx` が実行中のセッションの終了・失敗をどこから知るかが無い | FE-010 に源 (store の状態 → context) を書き、FE-012 に |
| T1' | Terminology | LOW | plan Summary (素の R-03〜R-07) | R1 T1 の残り | plan では「research R-0x」と書く |

**確かめて問題が無かったもの**: AD-044 は未使用の番号。AD-041 (g) のキー集合は変わらない。SDK の `includeHookEvents` (L1731)、`hook_response` の `exit_code` / `outcome`、`skip_transcript`。`read-transcript.ts:70` の `includeSystemMessages: true`。AD-035 の既定 open は Trade-off で ADR drift ではない。plan-template の XII の行と discovery の「20 項目」はタスクにある。Critical の Constitution の衝突は残っていない。

## Coverage Summary

FR-001〜FR-016 / SC-001〜SC-007 の 23 件すべてにタスクがある (100%)。注記: FR-003 (N5 / N6)、FR-004 (N8)、FR-006 (N7)、FR-008 (N1 / N3)、FR-009 (N1 / N2 / N10)、FR-010 (N3)、FR-016 (N9)、SC-003 (N4)。

## Metrics

- 要件 23 / タスク 28 / 被覆 100%
- R1: 25 件 (24 resolved、1 一部)
- 新規: 11 件 (Critical 0 / High 1 / Medium 3 / Low 7)
