# Specification Analysis Report: 011-ui-coverage (O-2) — design-gate Round 1 Track A

読んだもの: spec / plan / tasks / data-model / research / quickstart、constitution (v1.2.9)、ui charter、`_overview.md`、glossary、roadmap、AD-019 / AD-020 / AD-028 / AD-034 / AD-035 / AD-043。ファイルは編集していない。

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| C1 | Constitution | CRITICAL | plan.md「ADR: 起票しない」; research R-10; spec FR-016; tasks SH-090; constitution.md L284-296 (改定手順) | Constitution の改定手順は、既存の Principle を変えるときの手順 1 に ADR を求める。plan は XII (後続 feature の ID を割当とみなす記述の追加、Automated / Manual の入れ替え) と XIII を変えるが、ADR を起こさないと決めている。直近の PATCH (v1.2.6〜v1.2.9) はすべて ADR を引いている | XII / XIII の改定の ADR を短く起こす (AD-019 / AD-020 の Open Questions の回答も載せられる)。または ADR を省くことに人間の明示の承認を得る。SH-090 の前にタスクを足す |
| C2 | Constitution | HIGH | research R-10 (「PATCH。原則の意味を変えず」); spec FR-016; constitution の版の表 L956-962 | 後続 feature の ID だけの行を「割当」とみなすのは、XII の意味を緩める (今の Statement は各行に表示実装を求める)。版の表では「指針の実質的な拡張」(MINOR) か再定義に当たり、文言だけの PATCH ではない | 版の上げ方を見直す (MINOR で v1.3.0 にするか、PATCH の理由を書く)。architecture-reviewer と人間に確かめる |
| I1 | Inconsistency | HIGH | spec FR-008 vs research R-04、data-model §2、tasks BE-024 | FR-008 は `hook_progress` / `task_progress` / `background_tasks_changed` を含む 8 つの subtype を renderer に届けるとするが、R-04・data-model・BE-024 は 5 つだけを変換し、その 3 つは送らないことをテストする | FR-008 を 5 つに直し、残り 3 つは対応表の割当 (表示不要 / 後続) で扱い届けないと書く |
| I2 | Inconsistency | MEDIUM | spec US-2 AC4 (「1 行ずつ出る」「進み」) vs research R-04、quickstart V-4.4、BE-024 | AC は状態の変化ごとに 1 行・進捗を出す、と読める。設計は 1 つの task を 1 行にして書き換え、進捗を出さない | AC4 を「task ごとに 1 行、状態を書き換える。進捗は出さない」に直す |
| I3 | Inconsistency | MEDIUM | research R-04 (「と `exit_code` の有無」) vs data-model §2 (`exit_code` は読まない) | `exit_code` (の有無) を許可リストに通すかが食い違う | data-model を正本として R-04 を直す |
| I4 | Inconsistency | MEDIUM | research R-04 (`background_tasks_changed` → O-6) vs spec Out of Scope (人間に諮る) と FR-004 の O-6 | 一覧の要否の判断の行き先が 2 つ。O-6 の範囲に一覧が無い | どちらかにそろえる |
| I5 | Inconsistency | MEDIUM | spec FR-006 (cl-code-gate / cl-pr-gate の候補) vs research R-09 (gates は pr-gate だけ)、SC-007 | code-gate の候補の一覧に足すのに gates は pr-gate だけ。registry の `invoked_by` の値が書かれていない | code-gate を範囲にするかを決める。`invoked_by` を書く |
| I6 | Inconsistency | MEDIUM | spec FR-012 (利用者の開閉を上書きしない) vs research R-06 / tasks FE-020 (`key={density}` で作り直す) | 密度を切り替えると利用者の開閉もリセットされる | FR-012 を「新しいメッセージでは上書きしない。密度の切り替えでは新しい既定に戻る」に狭める |
| I7 | Inconsistency | MEDIUM | data-model §1; constitution XII の `bad_pattern_grep`; research R-10 | 経路の列の `—` を表示不要の行で許すが、XII の grep はどの列の `—` にも当たる | 経路の列に別の語 (`なし`) を使うか、grep を割当の列に絞る |
| I8 | Inconsistency | MEDIUM | research R-01 (A 節の「union の外」) vs spec FR-003 (余分な行で失敗)、data-model §1 | union の外の行が「余分な行」で落ちる。parse が小節を飛ばす規則が無い | data-model §1 に小節の目印と parse の規則、BE-011 に場合を足す |
| I9 | Inconsistency | LOW | spec FR-001 (`type` / `subtype` で区別できる単位) vs spec Assumptions (メンバー 1 つにつき 1 行) | 行の単位の定義が 2 つ | FR-001 を「メンバー 1 つにつき 1 行。subtype は備考」に |
| I10 | Inconsistency | LOW | spec FR-003 (失敗の条件 5 つ)、SC-002 vs data-model §1 / BE-011 (ToolFallback だけの Tier A でも失敗) | 6 つ目の条件が FR-003 と SC-002 に無い | FR-003 に足す |
| I11 | Inconsistency | LOW | data-model §4 (`Agent` / `Task` → `subagent_type`) vs spec FR-014 / US-4 | spec に無い規則がある。SC-006 は「tool の入力の引数」を 0 件とする | FR-014 に足すか、規則を消す |
| U1 | Underspecification | MEDIUM | tasks BE-001、plan、data-model §2 (「SC-009 の台帳」) | 本 spec に SC-009 は無い (003 の SC) | 「003 SC-009 / `transcript-schema.test.ts`」と書く |
| U2 | Underspecification | MEDIUM | spec FR-015 / FR-004; tasks SH-091; `_overview.md` L55-66・L100 (M3 = O-1〜O-3) | O-4〜O-6 を足すと `_overview.md` の feature の表と M3 の行も変わる | SH-091 / FR-015 に足す |
| U3 | Underspecification | LOW | spec FR-014 (整形の規則を対応表の tool の行から参照) | 参照を作るタスクが無い | SH-011 か FE-030 に足す |
| U4 | Underspecification | LOW | spec FR-015 (AD-019 / AD-020 の Open Questions の回答); tasks SH-091 | 回答の記録先がタスクに書かれていない | SH-091 に記録先を書く |
| G1 | Coverage | MEDIUM | spec Edge Case (ストリーミング中の密度の切り替えでスクロールを奪わない); tasks FE-022 | `key={density}` の作り直しがスクロールを動かしうるが、目視だけ | FE-022 に足すか、目視だけと明記する |
| G2 | Coverage | MEDIUM | spec Edge Case (巨大な結果の切り詰めが分かる); tasks BE-024 / FE-012 | 実行中の結果の切り詰めと表示のテストが無い | BE-024 / FE-012 に足す |
| D1 | Constitution (template) | MEDIUM | plan Constitution Check vs plan-template | Principle VIII の行が無い (日本語の文言と切り替えを足す) | VIII の行を足す |
| T1 | Terminology | LOW | plan (「R-06」など) vs spec の「R-3 / R-4」 | research の ID が roadmap の feature ID に見える | 「research R-06」と書く |
| T2 | Terminology | LOW | glossary の Density (session / `density`) | transcript の密度の用語が要る | SH-001 で別の用語を作る |
| A1 | Ambiguity | LOW | spec FR-012 / FR-013 [ASSUMED]、data-model §3 (256) | 仮定が残る (許容) | gate か quickstart で確かめる |
| A2 | Ambiguity | LOW | spec FR-012 comfortable | comfortable の Reasoning の開閉が書かれていない | 「既存の既定のまま」と書く |
| R1 | References | LOW | spec Dependencies | FR-011 が引く AD-034 / AD-043 が Dependencies に無い | 足す |

ADR の引用は正しい (AD-019 D2、AD-020 D1、AD-028 §5、AD-034 D1、AD-035 Trade-off、AD-043 D2)。O-4 / O-5 / O-6 は docs に無く衝突しない。I-3 は実在する。

### Coverage Summary

FR-001〜FR-016 / SC-001〜SC-007 の 23 件すべてにタスクがある (100%)。注記: FR-004 (U2)、FR-006 (I5)、FR-007 (G2)、FR-008 (I1)、FR-012 (I6)、FR-014 (U3)、FR-015 (U2 / U4)、FR-016 (C1 / C2)。

### Metrics

- 要件 23 (FR 16 + SC 7) / タスク 26 / 被覆 100%
- Critical 1 (C1) / High 2 (C2, I1) / Medium 12 / Low 10
