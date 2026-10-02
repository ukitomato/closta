# PR Gate Round 1: セッション監視ビュー (O-1)

**Run**: 2026-10-03T00:00:00+09:00
**Base**: main (949ad1b) … HEAD 0ba910f
**Diff stat**: +6947 -190 over 61 files (specs/ を除くと +2886 -190 over 32 files)
**Reviewers**: security-reviewer, architecture-reviewer (default + adr-drift), po-reviewer, platform-boundary-reviewer (system scope。`.dependency-cruiser.js` が `**/.dependency-cruiser.*` に一致)
**Round inheritance**: なし (Round 1)

起動しなかった reviewer (`reviewers_filter pr-gate` の stderr を転記):
- database-reviewer: skip — auto_invoke_patterns に一致する変更ファイルが無い (変更 61 件 / pattern 5 件)
- ux-reviewer: skip — auto_invoke_patterns に一致する変更ファイルが無い (変更 61 件 / pattern 1 件)
- a11y-reviewer: skip — auto_invoke_patterns に一致する変更ファイルが無い (変更 61 件 / pattern 1 件)

**ルール発火検証** (`node scripts/rules/run.mjs`、単独で実行): exit 0。期待表と 64 件一致。機械検証で捕まらない経路 9 件は、いずれも既存のもので担い手の feature が記録済み (本 PR で増えたものは無い)。

## Verdict

| Severity | This round (dedup 後) | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | — | 0 | 0 | 0 |
| High     | 2 | — | 2 | 2 | 0 |
| Medium   | 8 | — | 8 | 8 | 0 |
| Low      | 10 | — | 10 | 10 | 0 |

dedup の内訳: 4 track の raw は High 2 / Medium 9 / Low 10。po H-001 と architecture M-001 は同じ key (FR-012 / SC-005。charter KPI の宿題に担い手が無い) なので、重い方の High (H-02) に 1 件としてまとめた。architecture の po への申し送り (compact の失敗の理由) は数えていない (po M-002 と同じもの)。code-gate の MUST_FIX は 0 件なので、code-gate との突合で抑止したものは無い。

**Status**: PASS (Critical=0)
**Next**:
  PASS → /cl-done specs/010-session-monitoring-view (High 2 件は done の前に直すことを推奨。下の「推奨対応」)

## Critical (Round 1)

なし。

## High (Round 1)

### H-01 — perf が失敗した回に、Playwright が error-context.md (aria snapshot) を書き、会話由来の文字列が一時ディレクトリに残る [origin: security H-001]
- **Where**: playwright.perf.config.ts:12-13,26-28 / perf/real-sessions.spec.ts:150-153,252
- **Issue**: trace / screenshot / video は off にしてあるが、Playwright 1.63 は失敗時に `page.ariaSnapshot()` を `error-context.md` として outputDir に書く。止められるのは `PLAYWRIGHT_NO_COPY_PROMPT` だけ。perf は無効な回を意図して失敗させるので (7 回とも無効)、実物が `%TEMP%\closta-perf-results\…\error-context.md` に残っていて、直近の活動の行 (送信 / 応答) を含む。
- **Why high**: FR-012 / R-07 / SC-005 の許可リスト (会話由来の文字列を出力・成果物に残さない) に、観察できる形で反している。同じユーザのローカルにとどまり外部に送られる経路ではないので、Critical ではない。
- **Suggested fix**: 設定ファイルの CI ガードの直後で `process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'` にし、コメントを直す。残っている `%TEMP%\closta-perf-results\` を消して記録する。R-07 と tasks の成果物の項目に error-context を加える。
- **Status in this round**: new

### H-02 — charter KPI「並列時の滑らかさ」の実機計測が 3 度目の繰越しになり、担い手が roadmap に無い [origin: po H-001 + architecture M-001]
- **Where**: docs/domains/session/charter.md:140-142 / specs/010-session-monitoring-view/quickstart-results.md:62 / docs/roadmap.md:227
- **Issue**: 担い手が「次にこの KPI を測る feature」としか書かれておらず、roadmap に項目が無い。利用者が残した宿題 (窓の終わりの行の状態の内訳を出す) もどこにも登録されていない。roadmap の O-1 の行は「SC-005 は pr-gate 前の完了条件」のまま残っている。
- **Why high**: X-5 → O-1 と繰り越してきた KPI の計測経路が、どの design-gate にも拾われずに消えうる (ARCH-2)。
- **Suggested fix**: roadmap の既存の行 (O-3 または検証基盤) に「義務 (O-1 から)」として、(a) 内訳の出力、(b) 窓のあいだ 10 本が流れ続けるようにプロンプトか有効な回の条件を見直す、(c) 測り直す (行の切り替えの計測を含む) を足す。charter と quickstart-results からその行を指し、roadmap:227 を今の状態に直す。
- **Status in this round**: new

## Medium (Round 1)

| ID | origin | 要旨 | Where |
|---|---|---|---|
| M-01 | po M-001 | FR-012 の「有効な回が 3 回まで pr-gate に進まない」が、改訂の注記なしで残っている (spec / plan / quickstart / tasks / roadmap) | spec.md:55,209,241 / plan.md:169 / quickstart.md:34 / tasks.md:9 / roadmap.md:227 |
| M-02 | po M-002 | compact の行で失敗の理由と終了の告知が落ちる。FR-008 が落としてよいとしているのはランタイム・開始時刻・直近の活動だけ | RunningSessionList.tsx:353,373,382 |
| M-03 | po M-003 | 行の切り替えで出た 100〜275ms の long task を「計測手順の産物」と事実として書き、KPI の記録から外している | quickstart-results.md:50 / charter.md:141 |
| M-04 | po M-004 | E2E の long task 33 件について、「V-3 と並べて判断する」とした評価が記録されていない | quickstart-results.md:22 |
| M-05 | po M-005 | tasks に書いたテストのうち、「移る直前に承認待ちが解けた」場合と、複数の行で再描画が分かれていることのテストが無い | tasks.md:49,68 |
| M-06 | security M-001 | perf の成果物と出力の方針 (許可リストだけを出す) を確かめる手段が無い | playwright.perf.config.ts:12-13 |
| M-07 | architecture M-002 | `CLOSTA_PERF_MIN_MESSAGES` が NaN になると下限の判定が素通りする。使った下限が記録に残らない | perf/real-sessions.spec.ts:34,226-248 |
| M-08 | architecture M-003 (scope: out-of-scope) | 実資格情報で実アプリを自動操作する perf/ を、ADR なしで「AD-038 D2 の類推」として入れた | plan.md:182 / eslint.config.mjs:172 |

## Low (Round 1)

| ID | origin | 要旨 |
|---|---|---|
| L-01 | po L-001 | SC-005 の「弱い点」の「4〜8 本」は、表に合わせると「4〜7 本」 |
| L-02 | po L-002 | V-5 が「コミット後に再確認する」のまま残っている |
| L-03 | po L-003 | 件数ボタンが押せない理由が「表示中のセッションだけが承認待ち」の場合を区別しない |
| L-04 | security L-001 | 直近の活動の正規化が、ゼロ幅文字やタグ文字を残す |
| L-05 | security L-002 | perf の例外の文に、env の値と選択肢の一覧がそのまま入る |
| L-06 | architecture L-001 | FE-021 (隔離バッジの置き場) が完了になっているが、コードに置き場も注記も無い |
| L-07 | architecture L-002 | 行の状態の型と純粋な導出が、文言の表 (labels.ts) に依存している |
| L-08 | architecture L-003 | 時刻の源が 2 つある (ストアに注入した now と、時計の Date.now)。間引きのタイマも注入していない |
| L-09 | architecture L-004 | plan と research に、実装しなかった Root の属性の口と左端の帯が設計として残っている |
| L-10 | platform-boundary L-001 | perf の後始末が kill にフォールバックしても何も出力しない |

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 1 / Low 2。cascade の降格 0、A–H の欠落 0
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 3 / Low 4。cascade の降格 0、A–H の欠落 0
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) — Critical 0 / High 1 / Medium 5 / Low 3。cascade の降格 0、A–H の欠落 0
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) — Critical 0 / High 0 / Medium 0 / Low 1。cascade の降格 0、A–H の欠落 0
