## Specification Analysis Report — 010-session-monitoring-view (O-1) / design-gate R2 Track A (analyze)

**対象**: `specs/010-session-monitoring-view/` の spec.md / plan.md / tasks.md / data-model.md / research.md / quickstart.md / checklists/requirements.md
**参照素材**: constitution.md (XIV / XV)、session・ui charter、`_overview.md`、glossary.md、AD-020 / 023 / 035 / 038 / 043、roadmap.md、R1 の結果 (gate-r1/design-gate.md・analyze.md)。主張を確かめるために `concurrency.ts`・`sanitize-body.ts`・`agent-session.ts`・`status-update.ts`・`preload/index.ts`・`eslint.config.mjs`・`.dependency-cruiser.js`・`allowlists.mjs` も読んだ。
**作業の範囲**: 読み取りだけで、ファイルは変更していない。`.specify/extensions.yml` には `before_analyze` / `after_analyze` のフックが無かった。

結論: R1 の analyze 指摘 21 件はすべて解消された (うち 3 件は一部解消)。design-gate の High 7 件と Medium 15 件も解消を確認した。改訂で新たに出た指摘は MEDIUM 6 件・LOW 9 件で、CRITICAL と HIGH は無い。

### 指摘一覧

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| N1 | 規定不足 (FR-004 / SC-001) | MEDIUM | plan.md:136, 150 / data-model.md:66-68 / tasks.md SH-004 | **new**。`trackStatus(sessionId)` はセッションごとに呼ぶ設計で、`setState` を 1 回にまとめる規定が無い。100ms の状態通知のバッチで 2 本が承認待ちに入ると `statusSince` が 2 回別々に変わり、Announcer が 2 回書き込む。「空にしてから書く」を 2 回続けると 2 本目の文しか読まれないおそれがあり、「同じ更新の 2 本は 1 つの文」(FR-004 / SC-001) が設計上保証されない | 1 回のストア更新の中の `statusSince` の変化を `setState` 1 回にまとめると data-model §1 / plan に明記する。SH-004 に「バッチで 2 本が変わっても `statusSince` の参照の変化は 1 回」を足す |
| N2 | 曖昧 (FR-004 / US-1 AC6) | MEDIUM | spec.md:157-160, US-1 AC6 / data-model.md:66 / R-05 | **new** (H-04 対応の副作用)。セッション画面以外を開いている間も `selectedId` は残るので、選択中のセッションが承認待ちになっても読み上げられない。AC6 の意図と食い違う | 「表示中」を「セッション画面が表示されていて、かつ選択中」と定義する。`announcements` に「セッション画面の表示の有無」を渡す。FE-003 に観点を足す |
| N3 | 規定不足 (FR-006) | MEDIUM | data-model.md:10 / plan.md:137 / tasks.md SH-004 | **new**。`activity` を書き直す契機は `message` / `permission-request` / `state` / 送信の 4 つだけで、承認に応じて `pending` が消えるとき・状態通知のバッチだけで行の状態が変わるときが入っていない。行の状態は「応答中」なのに直近の活動に「承認を求めている Bash …」が残りうる | `trackStatus` で行の状態が変わったとき、および `pending` が変わったときにも `scheduleActivity` を呼ぶと明記する |
| N4 | カバレッジ・規定不足 (FR-012 / SC-005) | MEDIUM | research.md:51, 53 / tasks.md SH-032 / FE-001 | **new**。perf は「行の `data-*` 属性 (状態の enum)」で判定するが、行の状態 9 値を `data-*` で出すタスクが無い (現行の行に `data-status` 等は無い)。本文を読まず `app.evaluate` も使わずにメッセージ数を数える方法も決まっていない | FE-001 か FE-021 に「行の Root に行の状態の enum を `data-*` で出す」を足す。メッセージ数の取り方を R-07 に決める |
| N5 | 不整合 (allowlist の食い違い) | MEDIUM | quickstart.md:32 / spec SC-005 / tasks.md SH-032・SH-033 | **new**。転記してよい項目のリストが文書ごとに違う (SC-005 と SH-033 にはプロンプトの識別子・ウィンドウサイズ・composition があり、quickstart V-3 手順 4 と SH-032 の出力には無い) | 許可リストの正本を 1 箇所にし、quickstart と SH-032 はそれを参照する。perf の出力にウィンドウサイズと composition を含める |
| N6 | ADR の引用誤り | MEDIUM | plan.md:73, 181 / tasks.md SH-090 / roadmap.md:128-132 | **new**。AD-038 D4 は「日本語フォントを同梱し、ホストを永続的に変更しない」決定で、書かれた死角は「`SCAN_FILES` が verify.yml を含まない」の 1 つだけ。「e2e は check.mjs の死角」「e2e は `SCAN_ROOTS` の外」はどの ADR にも決定として書かれていない | plan の「D4 e2e は check.mjs の死角」を改める。`perf/` (と `e2e/`) が `SCAN_ROOTS` の外にあることは roadmap に独立した system-scope の項目として起こす |
| N7 | 不整合 (data-model の内部) | LOW | data-model.md:21 / tasks.md SH-003 | **new**。「末尾から最大 2 件」と書いているが、表の 5 行はどれも末尾 1 件しか使わない | 「末尾 1 件」に直すか、2 件目を使う条件を表に足す |
| N8 | 規定不足 (FR-006 の 1.) | LOW | data-model.md:40 | **new**。承認要求の `input` が空になると、承認を求めている tool 名まで出なくなる | `approval` / `tool` は、`tool` が空でなければ `detail` が空でも残す |
| N9 | 用語のドリフト | LOW | spec.md:29 / spec.md:173 | **new**。Summary の「実行中の tool 名」は FR-006 の 2. と食い違う。「3 種」と書きながら前置きは 4 つ | 「呼び出した tool 名」「4 種」に直す |
| N10 | 曖昧 (SC-006 の測り方) | LOW | spec SC-006 / tasks.md FE-012 | **new**。行は 1 秒ごとの時計でも描画される。上限が時計による描画を含むのかが決まっていない | FE-012 で、時計を止めて数えると明記する |
| N11 | Constitution (XIV の手順) | LOW | tasks.md SH-001 / constitution.md:781 | **一部解消 (K1)**。XIV の「reviewer 確認後にコード投入」の確認の段が SH-001 に無い。Canonical / Candidate のどちらの節に追記するかも書かれていない | SH-001 に「Canonical Terms に追記し、reviewer の確認を経てから SH-002 へ進む」と書く |
| N12 | タスクの順序 | LOW | tasks.md SH-005 | **new**。SH-005 が `perf/` の実体より先に `perf/tsconfig.json` と型検査の step を入れると、include が空で `tsc -p` が TS18003 で落ちる | 型検査の step は SH-032 と同時に入れるか、include に `e2e/support/` を含める旨を書く |
| N13 | 受け入れ条件の不足 | LOW | spec US-3 AC1 / FR-008 | **new**。AC1 の compact の行に行の操作と隔離バッジの置き場が出てこない | AC1 に「行の操作も同じ段に出る」を足す |
| N14 | チェックリスト | LOW | checklists/requirements.md:36 | **一部解消 (Q1)**。例外語に spec に無い `e2e-capability.ts` があり、spec にある `labels.ts`・`quickstart-results` が無い | 例外語のリストを spec の実物に合わせる |
| N15 | 規定不足 (有効な回の判定) | LOW | research.md:53 / tasks.md SH-032 | **new**。「全期間で応答中」を 2 点で判定している理由が書かれていない | R-07 に「途中の状態は元へ戻らないので、2 点の確認で全期間を代表できる」と一文足す |

### R1 analyze 指摘の解消状況

| R1 ID | 重大度 | 状態 | 確認した箇所 |
|---|---|---|---|
| C1 | HIGH | resolved from prev | 間引きを購読の手前に移した (data-model §1・R-03・plan・SH-004)。FE-012 で描画回数の上限を測る。時計との関係は N10 |
| I1 | MEDIUM | resolved from prev | FR-006 の 3.・4. と data-model の表がそろった。残る食い違いは N7 |
| I2 | MEDIUM | resolved from prev | 機械強制の表と SH-005。D4 の引用の誤りは N6 |
| I3 | MEDIUM | resolved from prev | FR-012 / US-4 AC2 を「メッセージを継続的に」に改めた |
| I4 | MEDIUM | resolved from prev | SH-032 と R-07 が窓の始まりと終わりで状態を確かめる (理由の明記は N15) |
| I5 | MEDIUM | resolved from prev | FR-002 の参照を FR-005 に直した |
| G1 | MEDIUM | resolved from prev | USER 決定で FR-011 / SC-004 から強調を外した |
| G2 | LOW | resolved from prev | SH-092 と quickstart V-5 に `git diff --name-only` |
| G3 | LOW | resolved from prev | FE-003 / SH-003 に観点を足した |
| U1 | MEDIUM | resolved from prev (設計上の穴は N1 として new) | `announcements` が複数を 1 文で返す |
| U2 | LOW | resolved from prev | `nextAwaiting` は表示中を除いた最古 |
| U3 | LOW | resolved from prev | 「1 回の計測機会に 3 回」 |
| K1 | MEDIUM | resolved from prev (一部。N11) | SH-001 の `[P]` を外した |
| K2 | LOW | resolved from prev | XV の名前を直した |
| A1 | LOW | resolved from prev | AD-043 Decision 4 と X-5 FR-004 を併記 |
| T1 | LOW | resolved from prev | 「各セッションの live 表示のメッセージ配列」 |
| T2 | LOW | resolved from prev | RK-01〜RK-07 に改名 |
| T3 | LOW | resolved from prev | 没入ビューを FR-013 / Key Entities / SH-001 に足した |
| Q1 | LOW | resolved from prev (一部。N14) | Notes に例外語を列挙 |

### design-gate R1 の High / Medium の解消状況 (要旨)

- **H-01〜H-07: すべて resolved from prev。** 別画面での「表示中」の扱いは N2、D4 の引用の誤りは N6 として new
- **M-01〜M-15: すべて resolved from prev。** M-03 は N1、M-11・M-12 の記録項目は N5 として、改訂後の新しい穴を別に起こした

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | ✅ | FE-001, FE-002, FE-003 | |
| FR-002 | ✅ | SH-003, SH-004, FE-002, FE-004, FE-003 | N2 |
| FR-003 | ✅ | FE-002, FE-003 | |
| FR-004 | ✅ | SH-003, FE-004, FE-003, SH-093 | N1, N2 |
| FR-005 | ✅ | SH-002, SH-003, SH-004, FE-010, FE-011, FE-012 | |
| FR-006 | ✅ | SH-003, SH-004, FE-011, FE-012 | N3, N7, N8, N9 |
| FR-007 | ✅ | SH-003, FE-011, FE-012 | |
| FR-008 | ✅ | FE-001, FE-020, FE-021, FE-022, SH-031, SH-093 | N13 |
| FR-009 | ✅ | SH-002, SH-004, FE-022 | |
| FR-010 | ✅ | FE-011, FE-012, SH-092 | |
| FR-011 | ✅ | SH-030, SH-031 | |
| FR-012 | ✅ | SH-005, SH-032, SH-033, SH-090 | N4, N5, N15 |
| FR-013 | ✅ | SH-001, SH-090 | N6, N11 |
| SC-001 | ✅ | SH-003, FE-003, SH-093 | N1, N2 |
| SC-002 | ✅ | SH-003, FE-012 | |
| SC-003 | ✅ | SH-031, FE-022, SH-004, SH-093 | |
| SC-004 | ✅ | SH-030, SH-031 | |
| SC-005 | ✅ | SH-032, SH-033 | N4, N5 |
| SC-006 | ✅ | FE-012, SH-092 | N10 |

**Constitution Alignment Issues**: CRITICAL は無い。XIV の確認の段 (N11、LOW)。ADR の引用は AD-038 D4 だけが誤っている (N6)。

**Unmapped Tasks**: 無い。

**識別子の整合**: FR / SC に欠番・重複なし。tasks の ID は SH 13 件・FE 11 件で重複なし。相互参照はすべて実在する。

### Metrics

- 要件の総数: 19 (FR 13 + SC 6)
- タスクの総数: 24 (SH 13 / FE 11)
- カバレッジ: 100% (19/19)
- 曖昧: 3 件 (N2, N10, N15)
- 重複: 0 件
- 重大度別の件数: CRITICAL 0 / HIGH 0 / MEDIUM 6 (N1〜N6) / LOW 9 (N7〜N15)
- R1 analyze 指摘 21 件: 解消 21 件 (うち一部解消 3 件: U1→N1、K1→N11、Q1→N14)
