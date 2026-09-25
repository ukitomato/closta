# Quickstart: Tier A tool 表示 (R-4)

実機での確認手順。**実機操作は人間 deferred** だが、**判定表 (`quickstart-results.md`) の記録は done 必須**
(SC-010。機械確認は tasks の SH で行う)。R-3 の quickstart (transcript 表示) の上に tool 表示を重ねて確認する。

## 前提

- R-3 が動作し、過去セッションの transcript が実データで表示できる (R-3 done)
- **R-3 の実機一次判断は R-4 の hard 前提ではない** (design-gate C-001 (a) で positioning 緩和)。R-3 rubric-a/b の
  実機記入と軸 1 の正式確定は roadmap の tracked debt (別ステップ)。**未記入のまま R-4 の実機確認に入ってよく**、
  その旨を `quickstart-results.md` に明記する
- 各 tool 種別 (Bash / Edit / Write / TodoWrite / Task / ExitPlanMode) を含む過去セッションを用意する
  (無ければ Claude Code で 1 本作る。**R-4 は起動しないので手動で作った過去ログを読む**)

## 確認手順

| # | 操作 | 期待 | SC |
| --- | --- | --- | --- |
| V-1 | Bash を含むセッションを開く | コマンドと出力が**端末風ブロック**で並び、成否が分かる (行 live ストリームは無くてよい) | SC-001 |
| V-2 | Edit / Write / MultiEdit を含むセッションを開く | ファイルと変更が **hunk 単位の diff** で表示。old/new が生 HTML/リンクとして動かない | SC-001/002 |
| V-3 | TodoWrite を含むセッションを開く | 各 Todo の**状態が視覚的に区別**される (pending/in_progress/completed) | SC-003 |
| V-4 | Task (subagent) を含むセッションを開く | 呼び出し (種別/依頼) と**配下の subagent 作業が親の下に入れ子**で並ぶ。件数/順序が SDK と一致 | SC-004 |
| V-5 | ExitPlanMode を含むセッションを開く | 計画が **Agent plan (plain text)** で表示。生 HTML 非描画・`javascript:` inert (markdown 整形は tracked debt) | SC-001 |
| V-6 | 専用表示を持たない tool (Read/Grep/MCP) を含むセッションを開く | それらは **fallback のまま**・欠落なし (Tier A 完全化は O-2) | SC-001 |
| V-7 | thinking と連続 tool を含むセッションを開く | thinking は Reasoning、連続 tool は Tool group に畳まれ、**その中でも専用表示が成立** | US-1 AC-6 |
| V-8 | 巨大な tool_result / 巨大 diff / 長い plan を含むセッションを開く | **切り詰め + 折りたたみ**。アプリが固まらない (main 経路に本文が乗らない) | SC-006 |
| V-9 | 日本語・全角・絵文字・コードを含む tool 入出力を開く | Terminal/diff の**等幅で全角桁が崩れない**。折返し・行送りが破綻しない | SC-007 |
| V-10 | 壊れた args / 途中終了 tool / 孤児 tool_result を含むセッションを開く | クラッシュせず、専用表示 (result 無し) か fallback で**欠落なく**示す | SC-005/FR-018 |

## SC-010 rubric (見栄えの判断材料。`quickstart-results.md` に記録)

実機で各観点を **OK / NG / 未実施** で記録する。判定表は grep 可能な決定的形式
`| rubric-<x> | 観点 | 判定 | 根拠 |` とし、機械確認 (SH) が行の存在と判定値を検査する。

| rubric | 観点 | 判定 | 根拠 |
| --- | --- | --- | --- |
| rubric-a | Terminal block が Claude Code TUI と同等以上に読める (command/output/成否) | 未実施 | |
| rubric-b | Code diff の hunk が追える (file_path + 変更前後) | 未実施 | |
| rubric-c | Todo / Subagent / Agent plan が欠落なく構造を示す (subagent 入れ子を含む) | 未実施 | |
| rubric-d | 日本語・全角・絵文字・コードで崩れない | 未実施 | |

**判断材料の提示**: 上記 rubric で tool 表示まで含めた軸 1 の**判断材料を提示・記録**する。
**「M1 完了 / 軸 1 の正式な方針確定」自体は R-4 の done-gate 合否条件にしない** (design-gate C-001 (a) の positioning 緩和) —
軸 1 の正式確定と R-3 実機一次判断 (rubric-a/b) の記入は roadmap の tracked debt が持ち主。
いずれかが NG なら charter「見た目の判断を先送りしない」に従い charter / PLAN.md §4 の見直しを別 task で起票する。

## R-3 からの継続確認

- R-3 の quickstart 項目 (transcript の基本表示・仮想化・スクロール) が R-4 の変更で回帰していないこと
- composer 送信経路が閉じたまま (送信できない) であること (FR-015)
