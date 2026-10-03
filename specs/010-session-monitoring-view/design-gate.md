# Design Gate: セッション監視ビュー (O-1) — Round 2

**Run**: 2026-10-02T18:00:00+09:00
**Spec**: specs/010-session-monitoring-view/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [gate-r1/design-gate.md](./gate-r1/design-gate.md) (R1: Critical 0 / High 7 / Medium 15 / Low 19。PASS)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 6      | 9   |
| po-reviewer                | 0        | 2    | 3      | 3   |
| architecture-reviewer      | 0        | 1    | 2      | 5   |
| security-reviewer          | 0        | 0    | 0      | 4   |
| platform-boundary-reviewer | 0        | 0    | 2      | 2   |
| **Total (dedup)**          | **0**    | 2    | 10     | 16  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 7    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 2    |

viewpoint coverage: 4 reviewer とも A〜H 欠落なし。cascade_enforce による降格: 0 件。R1 の Medium 15 件もすべて resolved (各トラックの解消状況表)。

**Status**: PASS
**Next**: status は implementing のまま (R1 で昇格済みの再レビュー)。High 2 件は文面で直せるので `/cl-implement` の前に反映することを推奨する

## Critical (Total: 0)

なし。

## High (Total: 2, dedup 後)

### H-01 — 実機計測の有効な回の条件 (窓の中のメッセージ数・10 本が応答中) を観測する手段が無い [origin: po H-102 / architecture H-101 / analyze N4] [new]

- **Where**: spec FR-012・SC-005 / research R-07 / tasks SH-032 / FE-001
- **Issue**: perf は `page.evaluate` と行の `data-*` だけを使う制約だが、行の状態 enum を `data-*` で出すタスクが無く、表示していない 9 本のメッセージ数を数える口も無い。場当たりにストアを `window` に出すと、本文を含むストアが本番で晒される
- **Action**: 行の Root に状態 enum (`data-row-status`)、一覧に全セッションの受信メッセージの累計数 (数値だけ) を `data-*` で出す FE タスクを SH-032 の前に置く。「本番の composition にストアを晒す global を作らない」を plan の制約にする。下限を変えるときは利用者に諮る

### H-02 — セッション画面以外を開いている間、選ばれていたセッションの遷移が読み上げられない [origin: po H-101 / analyze N2] [new]

- **Where**: spec FR-004・SC-001 / data-model `announcements` / tasks FE-003
- **Issue**: `announcements` は画面によらず `selectedId` を除くので、直前まで作業していたセッションが別画面にいる間に承認待ちになっても読まれない
- **Action**: 「表示中」を「セッション画面が表示されていて、かつ選ばれている」と定義し、`announcements` に画面の表示の有無を渡す。FE-003 に観点を足す

## Medium (Total: 10, dedup 後)

| ID | origin | 要旨 |
|---|---|---|
| M-01 | analyze N1 | 同じバッチの複数の遷移で `statusSince` の `setState` が分かれ、1 文にまとまらない |
| M-02 | analyze N3 / architecture L-101 | 直近の活動の書き直しの契機に `pending` の消滅と状態通知による行の状態の変化が無い |
| M-03 | analyze N5 | quickstart-results に写す項目の許可リストが文書ごとに違う |
| M-04 | analyze N6 / platform-boundary M-001 | AD-038 D4 の引用誤り。`SCAN_ROOTS` の外にある `e2e/` / `perf/` の死角は別の system-scope 項目にする |
| M-05 | po M-101 | セッション画面以外を開いている間、失敗には目で見える手掛かりが無い (除外とも書かれていない) |
| M-06 | po M-103 | SC-005 の実機計測を完了条件として扱うか (pr-gate の前に済ませるか)・閾値を割ったときの着地が無い |
| M-07 | po M-102 | US-1 AC2「承認カードが見える」を検出する自動テストが無い |
| M-08 | platform-boundary M-002 | 後始末を test 本体の `finally` に置くとタイムアウトで動かない (`afterEach` / fixture へ) |
| M-09 | architecture M-101 | App の寿命の live region が使う作業フォルダの表示名の供給元が無い |
| M-10 | architecture M-102 | 監視ビューの見た目の持ち主が session charter と ui charter で食い違う |

## Low (Total: 16, dedup 後)

- security L-007 (`toActivityLine` の走査量の上界) / L-008 (reply の連結の手前の型の穴) / L-009 (Playwright の call log に HTML の抜粋) / L-010 + platform-boundary L-002 (安全柵を持つ `playwright.perf.config.ts` が静的検査の外)
- platform-boundary L-001 (起動要求中の +1 は UI の直列化に依存)
- po L-101 + analyze N15 (有効な回を 2 点で判定する根拠) / po L-102 + analyze N10 + architecture L-103 (描画回数の上限の測り方と時計の購読) / po L-103 (ナビからは 2 操作)
- architecture L-102 (App シェルの責務。`SessionNavBadge` を export) / L-104 + analyze N7 + N9 (「末尾 2 件」・「3 種」・「実行中の tool 名」) / L-105 (XIII の候補照合: ToggleGroup / Badge / Tooltip)
- analyze N8 (承認の `input` が空で tool 名まで消える) / N11 (XIV の reviewer 確認の段) / N12 (SH-005 の型検査の step の順序) / N13 (US-3 AC1 に行の操作) / N14 (チェックリストの例外語)

## Dedup log

| merged | key |
|---|---|
| po H-102 + architecture H-101 + analyze N4 | FR-012 / SC-005 (観測点) |
| po H-101 + analyze N2 | FR-004 (表示中の定義) |
| analyze N3 + architecture L-101 | FR-006 (書き直しの契機) |
| analyze N6 + platform-boundary M-001 | AD-038 D4 |
| security L-010 + platform-boundary L-002 | `playwright.perf.config.ts` の静的検査 |
| po L-101 + analyze N15 | FR-012 (2 点の判定) |
| po L-102 + analyze N10 + architecture L-103 | SC-006 (描画回数) |
| architecture L-104 + analyze N7 + analyze N9 | FR-006 / data-model §2 |

## Track raw outputs

<details>
<summary>analyze</summary>

[analyze.md](./analyze.md)
</details>

<details>
<summary>po-reviewer</summary>

[po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
</details>

<details>
<summary>architecture-reviewer</summary>

[architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
</details>

<details>
<summary>security-reviewer</summary>

[security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
</details>

<details>
<summary>platform-boundary-reviewer</summary>

[platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
</details>
