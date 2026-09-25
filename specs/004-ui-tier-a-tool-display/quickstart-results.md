# Quickstart 実測・判定結果: Tier A tool 表示 (R-4)

- **記録日**: 2026-09-25
- **対象**: R-4 (004-ui-tier-a-tool-display)
- **様式**: [quickstart.md](quickstart.md) の V-1〜V-10 に対応
- **判定の位置づけ**: SC-010 (見栄えの判断材料) の rubric 判定表 (a〜d) の**記録が done の必須 artifact**。
  実機操作の実施と OK/NG 判断は人間 deferred。**機械確認**は `tests/spec-artifacts/r4-quickstart-rubric.test.ts` が
  rubric-a〜rubric-d の行と判定の存在を検査する (SH-064)。
  **「M1 完了 / 軸 1 の正式な方針確定」自体は R-4 done の合否条件にしない** (design-gate C-001 (a) の positioning 緩和)。

## SC の自動検証状況 (実機不要な範囲)

**「PASS」は自動検証で満たした範囲を指す。核心が実機のみで測れる SC は実機 pending を明示する。**

| SC | 内容 | 経路 | 状態 |
|---|---|---|---|
| SC-001 | 5 種の専用表示が描画され未対応 tool は fallback | `ChatScreen.test.tsx` (Bash/Edit/Write/TodoWrite/ExitPlanMode/Task の各 data-slot + 未対応 fallback) | **unit PASS** |
| SC-001 (実データ) | 実データ transcript での各表示 | quickstart **V-1〜V-5 (実機)** | **pending (実機。人間 deferred)** |
| SC-002 | Code diff の old/new が生 HTML/script として実行・描画されない | `ChatScreen.test.tsx` (Edit の `<script>` が要素化されず literal text) | **PASS** |
| SC-003 | Todo status ごとに区別可能な DOM マーカー / 未知 status 保持 | `ChatScreen.test.tsx` (`data-status` completed/in_progress/pending/blocked) | **PASS** (視覚差は V-3 実機) |
| SC-004 | subagent 入れ子の件数・順序・役割一致 / 欠落・二重なし | `transcript.test.ts` (入れ子/孤児/多段/隣接非依存) + `ChatScreen.test.tsx` (入れ子描画) | **PASS** (実データ入れ子は V-4 実機) |
| SC-005 | 壊れた args / 未応答 / 孤児 / 未対応 tool で fallback 安全退避 | `tool-args.test.ts` + `transcript.test.ts` + `ChatScreen.test.tsx` | **PASS** |
| SC-006 | 巨大 argsText/result 切り詰め / 本文が main 経路に現れない | `transcript.test.ts` (truncated) + R-3 の port 構造検査 (`session-ipc.test.ts` 等) + 手動レビュー | **PASS** |
| SC-007 | サニタイザが改行/タブ保持・argsText の bidi/C1 除去 | `sanitize-body.test.ts` + `transcript.test.ts` (argsText bidi 除去) + `ChatScreen.test.tsx` (DOM 端点) | **PASS** (視覚は V-9 実機) |
| SC-008 | tool 名・content 種別すべてに表示先 / DTO schema 固定 (children 含む) | `transcript-schema.test.ts` / data-model §3 | **PASS** |
| SC-009 | subagent 対応づけが id ベース・隣接非依存 | `transcript.test.ts` (隣接非依存 / 自己参照 / 一意でない id / 深さ有界化) | **PASS** |

## SC-010 rubric 判定表 (見栄えの判断材料)

**凡例**: 判定 = `OK` / `NG` / `未実施`（実機・人間 deferred）。
自動検証で裏取りできる観点は根拠を併記するが、**見た目の判断は実機でしか確定しない**ため
実機未実施の観点は `未実施` とする（記録の存在が done の必須項目。OK 化は実機後）。

| key | 観点 | 判定 | 根拠 / メモ |
|---|---|---|---|
| rubric-a | Terminal block が Claude Code TUI と同等以上に読める (command/output/成否) | 未実施 | 実機での TUI 比較が必要。`terminal-block.aui.tsx` は導入済み (等幅・改行保持・成否アイコン) |
| rubric-b | Code diff の hunk が追える (file_path + 変更前後) | 未実施 | 実機での目視が必要。`code-diff.aui.tsx` は del/add 行 + file_path を表示 |
| rubric-c | Todo / Subagent / Agent plan が欠落なく構造を示す (subagent 入れ子を含む) | 未実施 | 自動検証は PASS (`ChatScreen.test.tsx` で各 data-slot + 入れ子 + status marker を確認)。実機の見た目は未確認 |
| rubric-d | 日本語・全角・絵文字・コードで崩れない | 未実施 | 実機での目視が必要。plain text 描画 + `wrap-break-word` は導入済み |

> **判断材料の提示**: 実機 V-1〜V-10 の実施後にここへ結論を記す。「M1 完了 / 軸 1 の正式な方針確定」は
> R-4 done の合否条件にしない (design-gate C-001 (a))。軸 1 の正式確定は **R-3 実機一次判断 (rubric-a/b) の記入と
> あわせた別ステップ** (roadmap の tracked debt)。いずれかが `NG` なら charter「見た目の判断を先送りしない」に従い
> charter / roadmap / PLAN.md §4 の見直しを別 task として起票する。

## 実機 V-1〜V-10 (人間 deferred)

| V | 内容 | 状態 |
|---|---|---|
| V-1 | Bash → Terminal block (SC-001) | 未実施 (実機。unit PASS) |
| V-2 | Edit/Write/MultiEdit → Code diff (SC-001/002) | 未実施 (実機。unit PASS) |
| V-3 | TodoWrite → Todo list (status 視覚区別。SC-003) | 未実施 (実機。DOM marker は自動 PASS) |
| V-4 | Task → Subagent 入れ子 (SC-004) | 未実施 (実機。変換・描画は自動 PASS。実データ入れ子の inline 有無も確認) |
| V-5 | ExitPlanMode → Agent plan (SC-001) | 未実施 (実機) |
| V-6 | 未対応 tool が fallback のまま | 未実施 (実機。自動 PASS) |
| V-7 | thinking=Reasoning / 連続 tool=Tool group の共存 (US-1 AC-6) | 未実施 (実機。共存の自動検証は PASS) |
| V-8 | 巨大 result/diff/plan の切り詰め・非フリーズ (SC-006) | 未実施 (実機。truncated 自動 PASS) |
| V-9 | 日本語・全角・絵文字・コードの健全性 (SC-007) | 未実施 (実機。サニタイザ自動 PASS) |
| V-10 | 壊れた/未応答/孤児 tool の安全退避 (SC-005) | 未実施 (実機。自動 PASS) |

> **持ち主**: R-4 の実機確認は本 feature。R-3 の実機一次判断 (rubric-a/b) の記入は roadmap の tracked debt であり、
> R-4 done をブロックしない (design-gate C-001 (a))。
>
> **実データの補足 (research R-02)**: `getSessionMessages` が subagent 本文まで inline で返すかは録画時設定に依存する。
> inline に無いセッションでは Task カード + inline 分までを示す (欠落なし)。完全な subagent 会話の入れ子が要る場合は
> `getSubagentMessages` の導入 (新規 SDK 呼び出し = ADR/allowlist) を別 feature で検討する。V-4 で実データを確認する。
