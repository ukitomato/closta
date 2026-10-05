# PR Gate Round 1: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05
**Base**: origin/main (merge-base 0818409)
**Diff stat**: +5457 -575 over 93 files (HEAD 7d46352)
**Reviewers**: security / architecture (default + ADR-drift) / po / ux / a11y / platform-boundary / ui-coverage (7 並列)
**起動しなかった reviewer**: database-reviewer (`auto_invoke_patterns` に一致する変更ファイルが無い。変更 93 件 / pattern 5 件)
**Round inheritance**: Round 1 (引継ぎなし)
**ルール発火検証**: Round 1 で単独で実行。`node scripts/rules/run.mjs` exit 0 (期待表と一致。既知の死角の一覧のみ)

## Verdict

| Severity | This round (dedup 前) | dedup 後 | Suppressed by code-gate |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 7 | 7 | 0 |
| Medium | 37 | 29 | 0 |
| Low | 35 | 33 | 0 |

reviewer ごと (dedup 前): security C0/H0/M2/L5、architecture C0/H1/M4/L8、po C0/H1/M6/L4、ux C0/H3/M11/L5、a11y C0/H2/M7/L7、platform-boundary C0/H0/M2/L4、ui-coverage C0/H0/M5/L2。全員の raw output に `viewpoint_coverage_check` (A〜H すべてあり) と `cascade_enforce` (降格 0) を実行した。code-gate の `must_fix_findings` は 0 件なので suppress は無い。

**Status**: **PASS (Critical=0)**

**invoker の判断**: High 7 件はどれも O-7 で入った負の経路・記録の食い違いで、直すコストが小さい。`/cl-done` に進む前に High と主な Medium を直し、Round 2 で再検証する。

## High (dedup 後)

| ID | 内容 | origin (重複) |
|---|---|---|
| HI-1 | 失敗したセッションをサイドバーの行の「閉じる」で閉じると、過去の会話を読んでいても中央が空になり起動ダイアログが開く (`useShellFocus.ts:37-43` が focus を見ない) | po H-001 = ux M-005 |
| HI-2 | 起動ダイアログを閉じても開いた元にフォーカスが戻らない (Radix は `DialogTrigger` にしか戻さない) | a11y H-001 |
| HI-3 | サイドバーと右のペインの畳む / 開くボタンが押した瞬間に unmount され、フォーカスと `aria-expanded` の変化が失われる (自動の畳みも同じ) | a11y H-002 |
| HI-4 | 設定のダイアログを開いている間、承認待ち・失敗の印がどこにも見えない (O-1 の USER 決定の退行) | ux H-001 |
| HI-5 | 起動の直後、過去の区画が `listRuntimes` を待つ間「未取得」のまま読み込み中を示さず、押せる「全件を取り直す」が FR-016 の順序を迂回する | ux H-002 = po M-002 |
| HI-6 | 280px のサイドバーで過去の区画の見出しの行が折り返さず、未登録フォルダの区画の見出しが潰れて横にあふれる | ux H-003 |
| HI-7 | AD-046 Consequences (:38) の「session のコンポーネントは面の状態を書かない」と、実装の例外 2 件 (`seedFolderDraft` / `openSettings('folders')`) が accepted ADR の上で食い違う。AD-031 の訂正節が要る | architecture H-001 (code-gate L-103 の申し送り) |

## Medium の主な重複 (dedup)

| 内容 | origin |
|---|---|
| 起動の拒否と前回の失敗の告知が、閉じて開き直しても残る | po M-001 = ux M-004 |
| 起動ダイアログを開いている間も `watchedId` を変えない (承認待ちが読み上げられない) | po M-003 = a11y M-002 |
| 登録の後に設定を閉じると開いた元が消えていてフォーカスを失う | po M-004 = a11y M-003 |
| tasks で完了にしたテストの観点が実在しない / a11y・UX のテストが足りない | po M-005 = a11y M-007 = ux M-011 (+ security L-001 / L-002) |
| ui-coverage-reviewer の発火条件にシェルが無い | ui-coverage M-003 = architecture M-004 |
| 「概要」の権限モード・モデルの見出しと表示 (起動時の値・生の ID) | ui-coverage M-004 + ux M-006 |
| 自動の畳みの `belowRef` | ux M-009 + po L-002 |
| 長い題の全文を見る手段 / 切り詰めのテスト | a11y M-006 (+ ux M-011) |
| SC-003 / V-3 / CI の判定の記録 | po M-006 = architecture L-003 / L-007 |

## Track raw outputs

- [security-reviewer.pr-gate.round1.md](security-reviewer.pr-gate.round1.md)
- [architecture-reviewer.pr-gate.round1.md](architecture-reviewer.pr-gate.round1.md)
- [po-reviewer.pr-gate.round1.md](po-reviewer.pr-gate.round1.md)
- [ux-reviewer.pr-gate.round1.md](ux-reviewer.pr-gate.round1.md)
- [a11y-reviewer.pr-gate.round1.md](a11y-reviewer.pr-gate.round1.md)
- [platform-boundary-reviewer.pr-gate.round1.md](platform-boundary-reviewer.pr-gate.round1.md)
- [ui-coverage-reviewer.pr-gate.round1.md](ui-coverage-reviewer.pr-gate.round1.md)
