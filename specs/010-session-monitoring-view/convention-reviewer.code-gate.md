# convention-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03
**Reviewer**: convention-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: code-gate 再実行 (status reviewing から。pr-gate R1 の指摘を直した差分)。iteration 4 (lint は iteration 3 で exit 1 → 修正後 exit 0)

## 初回読了 viewpoint

- FR/SC:
  - FR-002 / FR-003 / FR-008: compact の失敗の短い理由 `launchFailureShortLabel`、終了の告知 `endNoticeOf`、押せない理由 `MONITOR_LABELS.awaitingOnlyWatched` (RunningSessionList.tsx / labels.ts)
  - FR-006 / SC-002: `normalizeLine` で `INVISIBLE_FORMAT` を除去 (session-view.ts:170-181)
  - FR-012 / SC-005: perf の判定を純関数 `perf/run-judgement.ts` に分離し、`perf/run-judgement.test.ts` で固定。`PLAYWRIGHT_NO_COPY_PROMPT`、`teardown=killed`
  - SC-003: E2E の compact 幅の測定に、強制終了の行と終了済みの行を混ぜた (e2e/multi-session.spec.ts:213-221)
  - SC-006: 3 本で行ごとの再描画を分離するテスト (RunningSessionList.monitor.test.tsx:410-448)
- 該当する charter / Confirmation:
  - session charter の KPI「並列時の滑らかさ」(perf の経路)
  - roadmap の system-scope の項目 (docs/roadmap.md:133-153。e2e/ と perf/ の lint・SCAN_ROOTS・ADR 化)
  - Constitution には命名やファイル配置の Principle が無い (Grep で `命名|naming|kebab|PascalCase|500 行` を探して 0 件)
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の Owner 範囲外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: Owner 範囲外。`INVISIBLE_FORMAT` の網羅性は security-reviewer が見る
- C. 業務不変条件 / Charter drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: Owner 範囲外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: Owner 範囲外 (po-reviewer)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:3
- G. optional reviewer 範囲: 該当なし: optional reviewer の観点で、本 reviewer は扱わない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0
  - M-002 の食い違いを検出するテストは無い。件数は M-002 に含め、ここでは数えない
  - 新しい識別子にはテストがある (`launchFailureShortLabel` / `awaitingOnlyWatched` / 終了の告知 / 不可視文字 / `judgeRun`・`parseMinMessages`)
  - 再描画を数える spy (`vi.mock('./session-view')` の素通し) は、`deriveSessionView` がモジュールの外から呼ばれる経路だけを数える。行が `viewOf` 経由に変わると 0 を期待する assert が空振りで通るが、`rowRenders(B) > 0` の assert がこれを検出するので実害は無い
  - 観測点: 後始末が kill に落ちたら `teardown=killed` を 1 行出す。例外の文は理由キーと件数だけ

## スコープ要約

pr-gate R1 の指摘を直した差分 (tasks.md の PR-01〜PR-08)。renderer は compact の失敗の短い理由と終了の告知、押せない理由の区別、直近の活動の不可視文字の除去。perf は判定を純関数に切り出し、Vitest の node project の include に `perf/**/*.test.ts`、Playwright 側の testMatch を `**/*.spec.ts` に絞った。新規ファイルの命名 (kebab-case) と識別子は既存の慣習と一致。循環依存なし (dependency-cruiser exit 0)。

## Findings

### [Medium] RunningSessionList.tsx が 523 行になり、500 行の目安を超えた (M-001) (scope: feature)

- **観察**: pr-gate R1 の対応で `endNoticeOf`、compact の失敗の分岐、sr-only の失敗と告知、ツールチップの告知が増え、500 行を超えた
- **同種事象探索**: 触ったファイルで 500 行超は 2 件 (`RunningSessionList.tsx` 523 / `RunningSessionList.monitor.test.tsx` 521 (テスト))。前例: `running-session-store.ts` 587 行 (code-gate CM-02 で見送り)
- **リスク/影響**: I-2 の隔離バッジと O-2 で行の要素がさらに増える。CM-02 と同じ型の負債
- **推奨アクション**: 行の部品を `RunningSessionRow.tsx` などに切り出す。見送るなら CM-02 と同じ形で記録し、roadmap の store 切り出しの項目に並べる
- **根拠**: CONV-3、code-gate CM-02 の前例

### [Medium] compact の失敗の全文を出す条件が、sr-only とツールチップで食い違う。行の文脈の組み立ても重複している (M-002) (scope: feature)

- **観察**: sr-only は `status === 'failed' && failureReason !== null`、ツールチップは `failureReason !== null` だけ。`failureReason` は port の `failure` で run-state と独立に入る (`interrupt-unavailable` の後に強制終了された行は `failed` 以外のまま理由を持つ)。その場合ツールチップにだけ理由が出て、読み上げと comfortable には出ない。文脈の join も 2 か所に重複
- **同種事象探索**: `launchFailureLabel\(` 3 件 (条件 2 通り)、文脈の join 2 件
- **推奨アクション**: 補足情報を 1 か所で導き、条件をそろえる。`failureReason` を持つが `failed` ではない行のテストを足す
- **根拠**: CONV-3、spec FR-008

### [Low] `data-testid="session-row-tooltip-end-notice"` を参照するものが無い (L-001) (scope: feature)

- **推奨アクション**: testid を外す (CONV-5)

### [Low] `perf/` が Vitest で単体テストされるコードを持つようになったが、ESLint の ignores の対象のまま (L-002) (scope: system)

- **推奨アクション**: roadmap の ESLint / ADR の項目に、`perf/*.test.ts` と `run-judgement.ts` が Vitest の対象になったことを 1 行足す。本 feature で ESLint をつなぐ必要は無い

### [Low] import の指定子と local import の並びが揃っていない (L-003) (scope: feature)

- **観察**: `RunningSessionList.tsx` の named import で `slotUsage*` の間に型が挟まる / monitor.test.tsx の local import の順。並びを強制する規則は無い
- **推奨アクション**: 触ったついでに並べ替える

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `^` (count) | 2 (500 行超) | RunningSessionList.tsx (523), RunningSessionList.monitor.test.tsx (521) |
| M-002 | `launchFailureLabel\(` / 文脈の join | 3 / 2 | RunningSessionList.tsx:325, :396, :436 / :381, :432 |
| L-001 | `tooltip-end-notice` (src + e2e) | 1 (定義のみ) | RunningSessionList.tsx:437 |
| L-002 | `perf` (eslint / depcruise / verify.yml) | 4 | eslint.config.mjs:181-182, .dependency-cruiser.js:141, verify.yml:154-155 |
| L-003 | `import/order\|simple-import-sort` | 0 (規則なし) | RunningSessionList.tsx:40-42, monitor.test.tsx:19-25 |

## Lint 結果 (CONV-1)

lint-agent の JSON (iteration 4): `exit_code` 0、`violations[]` 空、7 検出器すべて exit 0。iteration 3 の `session-view.ts:170` の `no-irregular-whitespace` 2 件は `\u` のエスケープで直った。

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 3

## invoker の対応 (code-gate 本体が記録。reviewer の判定ではない)

| ID | 対応 |
|---|---|
| M-001 | 見送り。roadmap の「`running-session-store.ts` の切り出しと、行の状態の型の置き場」の項目に (3) として並べた (O-2 の着手前) |
| M-002 | 修正。`rowContext` に文脈をまとめ、ツールチップの理由も失敗の行だけにそろえた。テスト「理由を持つが失敗ではない行 … 理由を出さない」を足した |
| L-001 | 修正。testid を外した |
| L-002 | roadmap の ESLint の項目に 1 行足した |
| L-003 | `RunningSessionList.tsx` の named import を直した。test の local import はそのまま |

修正後に eslint (session feature) exit 0、`tsc -p tsconfig.web.json` exit 0、全件 `vitest run` 1732 passed (exit 0)。
