# platform-boundary-reviewer Review: セッション監視ビュー (O-1) — pr-gate Round 2 (system scope)

**Run**: 2026-10-03
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2 (R1 の後の差分 0ba910f..HEAD)

**結論**: R1 の L-001 は直っている。R1 の後の差分に新しい指摘はない (Critical 0 / High 0 / Medium 0 / Low 0)。

## 初回読了 viewpoint

- FR / SC:
  - **FR-012 / SC-005**: `perf/run-judgement.ts` と `perf/run-judgement.test.ts` を新しく足した。`perf/real-sessions.spec.ts` の判定、例外の文、後始末を変えた。`playwright.perf.config.ts` に `PLAYWRIGHT_NO_COPY_PROMPT` と `testMatch` を足した。SC-005 の許可リストに `minMessages` / `thresholdOverridden` が加わった
  - **SC-003**: `e2e/multi-session.spec.ts` の compact の幅の測定に、強制終了した行と終了済みの行を混ぜた
  - **FR-003 / FR-008**: compact の行に失敗の短い理由と終わり方の告知
  - **FR-006**: `session-view.ts` で不可視文字を取り除く
  - **FR-010 / SC-006**: delta の diff のヘッダで `src/main`、`src/preload`、`src/agents`、`src/domain` に変更はない
- touched file に当てはまる Charter と Confirmation: AD-038 D2 / D3 の類推 (perf/ は src のグラフの外、CI で実行しない)。AD-003 (perf のランタイム選択はロジック不変、例外の文だけ)。AD-004 / AD-012 は当てはまらない。AD-043 (main に差分なし)。Constitution Principle I / II / III / VI / VII
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲 (error-context を止める H-001 の妥当性も含む)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (不可視文字の除去も含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

R1 の後の差分は perf (判定の純関数化・下限の検証と `probe-missing`・例外の文を理由キーと件数だけに・`teardown=killed`・`PLAYWRIGHT_NO_COPY_PROMPT=1`・`testMatch`)、E2E (compact の幅の測定に終わった行を混ぜた)、renderer (compact の失敗の短い理由・終わり方の告知・不可視文字の除去) と、Vitest の include、文書。どの変更も IPC、preload、capability、パスの変換、権限ゲートの判定には触れていない。

## R1 の指摘の扱い

| R1 の ID | 判定 | 根拠 |
|---|---|---|
| L-001 (perf の後始末が kill に落ちても何も出ない) | **resolved** | `perf/real-sessions.spec.ts:153-158` の `catch` が kill の直前に `[O-1 SC-005] teardown=killed` を出す (理由キーだけ)。R1 の 3 つの失敗はどれもこの `catch` に入る。quickstart V-3 手順 5 と `docs/discovery.md:151` に `ps` で確かめる手順がある。3 つの原因の分離 (任意) はしていないが許容範囲 |

## PB-1〜PB-7 (R1 の後の差分について)

- **PB-1**: 該当なし: 境界をまたぐパスは差分にない。例外の文から env の値と候補の表示名が消え、外に出る経路は減った。`rowContext` は表示用の文字列
- **PB-2**: 該当なし: 単一インスタンスの仮定なし。`optionIndex` の判定は R1 から不変。`endNoticeOf` / `rowContext` は純粋な導出
- **PB-3**: 該当なし: capability を宣言するコードは差分にない。`LAUNCH_FAILURE_SHORT_LABELS` は表示の文言だけ
- **PB-4**: 該当なし: 権限モードの入口は増えていない。`pressLaunch` の `mode !== 'default'` の判定は不変 (例外の文から値を外しただけ)。E2E のクリックは偽の supervisor への行の操作
- **PB-5**: 該当なし
- **PB-6**: 該当なし: `PLAYWRIGHT_NO_COPY_PROMPT` は Playwright のプロセスの env だけ。起動される Electron にも渡るがアプリは読まない
- **PB-7**: 該当なし (新しい穴はない)
  - Vitest の include に `perf/**/*.test.ts`: perf/ が ESLint / depcruise の対象外であることは変わらず、Principle I / II の違反を機械的には捕まえない。ただし roadmap に記録済み (code-gate R2 convention L-002 の追記を含む) なので再指摘しない。`run-judgement.ts` は import を持たない純関数で、`run-judgement.test.ts` は `process.env` を書き換えない
  - `testMatch: '**/*.spec.ts'`: 足さなければ Playwright が `run-judgement.test.ts` を読んで壊れる。正しい対処。Vitest の include は `*.test.ts` だけなので 2 つの runner は重ならない
  - `perf/tsconfig.json` の `include` が新しいファイルを含み、CI の `typecheck (perf)` が型検査する

## Findings

なし。

## H (テストと退行) の注記

- 境界の退行: R1 の後の差分に `src/main`、`src/preload`、`src/agents`、`src/domain` はない。quickstart-results の V-5 に `main...HEAD` の再確認の記録がある
- L-001 の修正を検出するテストはない (実機でしか通らない。quickstart-results が「実機ではまだ流していない」と記録)。観測を足すだけなので指摘にしない
- `teardown=killed` が出ない経路が 1 つ残る (指摘にしない。仮定): `afterEach` の `page.evaluate` に期限がなく、renderer が固まると hook の期限 (60 秒) が先に切れて `catch` に入らない。quickstart V-3 手順 5 が毎回プロセス数を確かめさせるので観測の穴にはならない
- 判定の純関数のテストは既定値・上書き・不正な値・`probe-missing`・`not-all-running`・下限の境界を固定している

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (L-001 の再確認) | delta の diff で `teardown=killed` | 3 (コード 1 / 文書 2) | perf/real-sessions.spec.ts:156, docs/discovery.md:151, quickstart.md (V-3 手順 5) |
| (PB-7 の確認) | vitest.config.ts の node project の `include` | 1 | vitest.config.ts:46 |
| (PB-7 の確認) | perf/tsconfig.json の `include` | 1 | perf/tsconfig.json:4 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: resolved from 1: 1 (L-001) / unresolved: 0 / new: 0
