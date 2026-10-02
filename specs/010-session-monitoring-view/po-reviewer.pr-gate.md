# po-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 1 (pr-gate)

Critical はありません。High は 1 件で、KPI「並列時の滑らかさ」の実機計測が 3 度目の繰越しになっているのに、それを持つ feature も roadmap の項目もないことです。ほかに Medium 5 件と Low 3 件があります。利用者の判断 (SC-005 を閉じたこと、有効回の最小メッセージ数を 30 に下げたこと、ナレーターをスコープ外にしたこと、背景タスクを O-2 に回したこと) は覆していません。見たのは、それらの記録が正しいかどうかだけです。

## 初回読了 viewpoint

- **この PR の FR / SC**
  - FR-001〜FR-013 はすべて、この PR で実装されているか影響を受けています。
  - SC-001〜SC-006 はすべて範囲内です。
  - SC-005 は有効回 0 件のまま、利用者が閉じました (2026-10-02)。
- **変更ファイルが触れている Charter と Confirmation**
  - session charter: Out of scope、Journey 3 の読み替え、KPI「並列時の滑らかさ」、Related Specs、Open Questions
  - ui charter: In scope (density を持つのはどこか)、Journey 4、Open Questions
  - `_overview.md`: 帰属の判断根拠
  - roadmap: O-1 / O-2 / O-3 / I-2 の行と system-scope の項目
  - AD-038 Confirmation: perf は CI の e2e の経路の外にあり、スタブの経路は変えていない
  - AD-043: supervisor と IPC は変わっていない。`src/main`、`preload`、`agents`、`domain` は `.pr-gate-scope.txt` に現れない
  - AD-020 Consequences: Hook / 背景タスクの判断
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (XSS の境界はテストが要素 0 件を確かめていると見たが、判定は担当に任せる)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (charter の KPI の記録が正確かどうかは E で扱う)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:3 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲 (code-gate の CONSIDER は再指摘しない)
- G. optional reviewer 範囲: 該当なし: a11y-reviewer / ux-reviewer の範囲 (ナレーターは利用者の判断でスコープ外)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:1

## スコープ要約

O-1 は X-5 のサイドバー (`RunningSessionList`) を監視ビューに広げる。変更は renderer だけで、次を足す。
- 承認待ちと失敗の強調
- 承認待ちの件数 (押すと最も長く待っているセッションに移る) と失敗の件数
- ナビのバッジ
- アプリ全体の live region
- 枠の使用数と、上限に達したときの通知
- 各行の経過時間と直近の活動
- コンパクト / 詳しく の密度の切り替え

KPI の計測のために次を足した。
- X-5 の負荷 E2E を、監視ビューを出した状態で流すようにした (SC-004)。
- 実機での計測手順 `perf/real-sessions.spec.ts` を足した (SC-005)。

文書の追従: 用語集、session / ui の charter、`_overview.md`、roadmap、discovery。

記録された結果:
- SC-005: 7 回流して有効回 0 件。利用者が 2026-10-02 に閉じた。
- E2E: p95 35.5ms、最長の long task 70ms、50ms を超えた long task 33 件。

## FR / SC coverage

| ID | 実装 | テスト | 評価 |
|---|---|---|---|
| FR-001 | `RowStatusBadge` (承認待ちはアイコンと文言) | monitor.test「表示中以外が承認待ち…並びは変わらない」 | 被覆 |
| FR-002 | `MonitorSummary` の件数ボタン、`nextAwaiting`、`selectNextAwaiting`、`SessionNavBadge` | 純関数 / ストア / コンポーネント / `SessionScreen.test` (承認カードが描かれる) | 被覆。「移る直前に承認待ちが解けた」場合のテストがない (M-005)。押せないときの理由の文言が一般的すぎる (L-003) |
| FR-003 | 失敗の印と理由 (詳しく のみ)、見出しとナビの失敗件数 | monitor.test「失敗は承認待ちと別の印…」 | **部分**: コンパクトの行に理由が出ない (M-002) |
| FR-004 | `SessionAttentionAnnouncer` (アプリの寿命、`watchedId`) | 純関数 4 件 / コンポーネント 5 件 | 被覆。実際のスクリーンリーダーで聞くことは利用者の判断でスコープ外 |
| FR-005 | `ElapsedTime`、`formatElapsed`、`useSessionClock` | 純関数の境界値 / コンポーネント / 時計 | 被覆 |
| FR-006 | `deriveActivity`、`toActivityLine`、ストアでの間引き | 純関数 14 件 / ストア 3 件 / コンポーネント 2 件 | 被覆 |
| FR-007 | `slotUsage` (`countOccupying` + 1)、`LimitNotice` | 純関数 / コンポーネント (10/10 → 9/10) | 被覆 |
| FR-008 | 密度の context、コンパクトの行、ツールチップ | コンポーネント / E2E (SC-003) / 目視確認 V-4 | **部分**: コンパクトで失敗の理由と終了の告知が落ちる (M-002)。隔離の印の置き場は roadmap の I-2 に引き渡し済み |
| FR-009 | ストアの `density` | ストア / コンポーネント | 被覆 |
| FR-010 | `src/main`、`preload`、`agents`、`domain` に差分がない (scope.txt) | V-5 | 被覆。コミット後の再確認が記録されていない (L-002) |
| FR-011 | E2E `multi-session.spec.ts` | E2E 合格 | 被覆。long task 33 件の評価がされていない (M-004) |
| FR-012 | `perf/real-sessions.spec.ts`、discovery の行 | — (CI の外) | 手順はある。**完了条件は満たしておらず、利用者が閉じた。FR-012 の本文は更新されていない (M-001)** |
| FR-013 | 用語集 / charter / `_overview` / roadmap | — | 被覆。**KPI の宿題に担い手がいない (H-001)** |
| SC-001 | — | 純関数 + コンポーネント + SessionScreen | 被覆 |
| SC-002 | — | 純関数 + コンポーネント | 被覆 |
| SC-003 | — | E2E + コンポーネント + V-4 | 被覆 (コンポーネントテストにコンパクトの失敗行がない) |
| SC-004 | — | E2E 35.5ms / 70ms | 被覆 |
| SC-005 | — | V-3: 7 回中、有効回 0 件 | 利用者の判断で閉じた |
| SC-006 | — | Profiler のテスト (1 セッション) + V-5 | 部分: 行ごとに再描画が分かれていることのテストが書かれていない (M-005) |

## Findings

### [High] KPI「並列時の滑らかさ」の実機計測が 3 度目の繰越しになり、担い手がどこにも登録されていない (H-001) (scope: feature)

- **観察**
  - `docs/domains/session/charter.md:140-142` と `specs/010-session-monitoring-view/quickstart-results.md:62` は、次の計測を「次にこの KPI を測る feature」に回している。これは feature の ID ではない。
  - 利用者が残した宿題 (窓の終わりの行の状態の内訳 — 応答待ち / 承認待ち / 失敗 — を出力に足すこと) も、担い手がどこにもいない。
  - `docs/roadmap.md` (M3 の 10〜12 行目と system-scope の項目) に、この宿題の項目がない。`docs/roadmap.md` を `並列時の滑らかさ|内訳` で Grep → 0 件。
- **同種事象探索**
  - `docs/` を `並列時の滑らかさ` で Grep → 1 件 (`docs/domains/session/charter.md:137`)。
  - `docs/roadmap.md` を `内訳` で Grep → 0 件。
- **リスク/影響**
  - この計測は X-5 の SC-003 から O-1 に移ってきたもので、spec の US-4 は「2 feature にわたる繰越であり、本 feature の範囲から削らない」と書いている。
  - 閉じたのは利用者の判断である。しかし宿題が文章の中にしかないので、今後の design-gate が拾うことはない。
  - その結果、10 本が窓のあいだずっと応答を流している状態での実機の値が測られないまま終わりうる。KPI の根拠は部分的なままになる。
  - 同じ charter の「再利用率」の項目は担い手 (O-3) を明記しており、この項目だけが揃っていない。
- **推奨アクション** (最小案: 記録だけで、コードは変えない)
  1. `docs/roadmap.md` に宿題を足す。既存の行 (O-2 か O-3) の「義務 (O-1 から)」にするか、新しい項目にする。書くのは次の 3 つ。
     - (a) `perf` で、窓の終わりの行の状態の内訳を出力に足す。これは SC-005 の出力の allowlist に内訳を足すことでもあるので、利用者の承認が要る。
     - (b) 10 本が窓のあいだずっと応答を流し続けるように、プロンプトか有効回の条件を変える。
     - (c) 測り直す。
  2. `charter.md:142` と `quickstart-results.md:62` から、その roadmap の項目を指す。
- **根拠**: charter の KPI (計測の経路)、spec の US-4 の Why this priority、roadmap の M3 の到達状態
- **scope 根拠**: roadmap と charter はこの PR の touched file

### [Medium] FR-012 と roadmap が「有効回 3 回までは pr-gate に進まない」のまま残っている (M-001) (scope: feature)

- **観察**
  - 次の箇所が、元の決まりを注記なしで書いたままになっている。
    - `spec.md:209`: FR-012「完了条件… 有効な回が 3 回… まで pr-gate / done に進まない」
    - `spec.md:55`: Clarifications
    - `spec.md:241`: Assumptions
    - `plan.md:169`
    - `quickstart.md:34`
    - `tasks.md:9`
    - `docs/roadmap.md:227`:「実装中… 実機計測 SC-005 は pr-gate 前の完了条件」
  - 「利用者の判断で閉じた」という注記があるのは、SC-005 (`spec.md:254`) と SH-033 (`tasks.md:98`) だけである。
- **同種事象探索**: spec / plan / quickstart を `完了条件` で Grep → 5 件 (上に列挙)。ほかに `roadmap.md:227` と `tasks.md:9`。
- **リスク/影響**
  - 規範の本文である FR-012 が、実際の状態 (いま pr-gate にいる) と食い違う。
  - 後から監査する人は、これを gate の迂回と読む。
  - spec 自身の edge case「黙って緩めない」(`spec.md:145`) は、この書き方にも当てはまる。
- **推奨アクション**
  - FR-012 の「完了条件」の項目の下に、日付つきの改訂を 1 行足す:「2026-10-02: 有効回 0 件。利用者が、記録した事実とともに SC-005 を閉じた。SC-005 / quickstart-results の V-3 を参照」。
  - `roadmap.md:227` を現在の状態に直す。
  - `plan.md:169` と `quickstart.md:34` から同じ注記を指す。
- **根拠**: spec の edge case (`spec.md:145`)
- **scope 根拠**: どれも touched file

### [Medium] コンパクトの行で失敗の理由と終了の告知が落ち、FR-008 が許していない (M-002) (scope: feature)

- **観察**
  - `src/renderer/src/features/session/RunningSessionList.tsx:353`: コンパクトの行は `<RowStatusBadge status={status} failureReason={null} />` を呼ぶ。
  - コンパクトの `sr-only` のブロック (`:356` 付近) にあるのは、文脈と直近の活動だけである。
  - 終了の告知 (`session-row-end-notice`、`:373`) は 詳しく の行にしかない。
  - `RowTooltip` (`:382`) は失敗の理由を出すが、終了の告知 (強制停止 / 強制終了) は出さない。
- **同種事象探索**: `failureReason=\{null\}|session-row-end-notice` で Grep → 2 件 (`:353`、`:373`)。
- **リスク/影響**
  - FR-008 がコンパクトで落としてよいとしているのは「ランタイム、開始時刻、直近の活動」だけである。FR-003 は理由の文言を行に出すことを求め、US-3 の AC2 はコンパクトでも US-1 と同じ扱いを求めている。
  - コンパクトでは理由がホバー / フォーカスのツールチップにしか出ず、強制終了の告知はどこにも出ない。これは M3 の「未表示の情報がゼロ」とぶつかる。
  - コンパクトのコンポーネントテストは失敗行を扱っていないので、これに気づけない。
- **推奨アクション**
  - 案 (a)、コード: コンパクトでも理由を出す (たとえば印の横に短い文言)。終了の告知を `RowTooltip` と `sr-only` のブロックの両方に足す。
  - 案 (b)、記録だけ: FR-008 を改訂して、コンパクトでは理由と終了の告知も落としてよい (ツールチップ / フォーカスで読める) とし、利用者の承認を得る。案 (b) でも、ツールチップに終了の告知を足すことは必要。
  - どちらの案でも、`RunningSessionList.monitor.test.tsx` にコンパクトかつ失敗の場合を足す。
- **根拠**: spec の FR-003、FR-008、US-3 の AC2
- **scope 根拠**: touched file

### [Medium] 行の切り替えで出た 100〜275ms の long task を「計測手順の産物」と事実として書き、KPI の記録から外している (M-003) (scope: feature)

- **観察**
  - 1〜3 回目では、`quickstart-results.md:38-40` に各回ちょうど 1 件ずつ long task がある。275ms、102ms、251ms で、どれも `LONG_TASK_MAX_MS` = 100 を超えている。
  - `quickstart-results.md:50` は、これらが「計測手順の産物だった」と事実として書いている。
  - しかし 4 回目では 3 つのことを同時に変えている。(1) 10 本を先にすべて起動する、(2) 最後の行を表示したままにする、(3) 描画が落ち着くのを待ってから測る。したがって原因の帰属は推測である。
  - 観測されたのは「実負荷の下で表示する行を切り替えると (トランスクリプトの構築で) 100〜275ms の long task が出た」ということである。行の切り替えは charter の Journey 3 の手順 3 (「1 つを選んで没入ビューに切り替える」) に当たる。
  - `charter.md:140-142` の KPI の行は「long task 0 件」としか書いていない。
- **同種事象探索**: `specs/010-session-monitoring-view` を `産物` で Grep → 1 件 (`quickstart-results.md:50`)。`docs/domains/session/charter.md` を `long task 0` で Grep → 1 件 (`:141`)。
- **リスク/影響**
  - KPI は「UI の入力応答が保たれる」であり、行の切り替えも入力である。今の記録は、行の切り替えに問題がないように読める。
  - 中心の Journey の操作で起きるもたつきが視界から外れ、担い手もいない。
- **推奨アクション**
  - `quickstart-results.md:50` を観測として書き直す。例:「1〜3 回目では、表示する行を切り替えた直後に 100ms を超える long task が 1 件出た。4 回目からは打鍵の間だけを測っている。実負荷の下での行の切り替えの滑らかさは測っていない」。
  - `charter.md` の KPI の項目に 1 行足す。
  - H-001 で登録する宿題に「行の切り替えを測る」を足す。
- **根拠**: charter の Journey 3 と KPI
- **scope 根拠**: touched file

### [Medium] E2E で 50ms を超えた long task 33 件の評価を約束したのに、記録されていない (M-004) (scope: feature)

- **観察**
  - `quickstart-results.md:22` は、件数が X-5 の 0〜10 件より多いこと、監視ビューの更新が原因かもしれないことを書き、「実機計測 (V-3) の値と並べて判断する」としている。
  - V-3 の結論 (`:55-64`) は、この件に戻っていない。
- **同種事象探索**: `specs/010-session-monitoring-view` を `33 件` で Grep → 2 件 (`quickstart-results.md:19`、`:22`)。
- **リスク/影響**
  - 件数は合否を決めない (X-5 での利用者の判断)。それでも、この feature 自身の変更による約 3 倍の後退の兆しが、結論のないまま残っている。
  - 次にこの KPI を測る feature が、比較の基準を失う。
- **推奨アクション**
  - V-3 の結論に 1 行足す:「E2E の件数は 0〜10 件から 33 件に増えた。実機の 4〜7 回目では 100ms を超える long task は 0 件。原因は切り分けていない」。
  - H-001 の宿題に含める。
- **根拠**: spec の SC-004 (「記録のみ」)、plan の RK-02
- **scope 根拠**: touched file

### [Medium] tasks に書いたテストのうち、「移る直前に承認待ちが解けた」場合と行ごとの再描画の分離が書かれていない (M-005) (scope: feature)

- **観察**
  - `tasks.md:49` (FE-003) は、クリックの直後に対象の承認待ちが解けても件数ボタンが例外を投げないことのテストを求めている。`src/renderer/src/features/session` を `解け|例外にならない|not\.toThrow` で Grep → テストに 0 件。
  - `tasks.md:68` (FE-012) は、再描画について 4 つの確認を求めている。
    - 時計で行の本体が再描画されない
    - あるセッションの本文の更新で、ほかの行が再描画されない
    - 本文が届いても一覧の Root が再描画されない
    - SC-006 の再描画の回数
  - あるのは、一覧全体を Profiler で包んで 1 セッションで測るテスト 1 件だけである (`RunningSessionList.monitor.test.tsx`「本文を 500ms の間に 20 回更新しても…」)。
- **同種事象探索**: 上のとおり 0 件。
- **リスク/影響**
  - SC-006 の設計の要点 (「行は本文の配列を購読しない」) が、複数行では守られていない。
  - 10 セッションのとき、1 つのセッションの本文で全行が再描画される後退が起きても気づけない。
  - spec の edge case (`spec.md:134`) にテストがないまま残る。
- **推奨アクション**
  - 2〜3 セッションでの Profiler のテストか、行ごとの再描画の回数を数えるテストを足す。
  - 件数ボタンを押した直後に状態を「承認待ちでない」に変えて、例外が出ず承認カードも出ないことを確かめるテストを足す。
  - あるいは、これらを書かなかったことと理由を tasks.md に記録する。
- **根拠**: tasks の FE-003 / FE-012、spec の SC-006
- **scope 根拠**: touched file

### [Low] SC-005 の「弱い点」に書いた、終わりに応答中だった本数の幅が表と合わない (L-001) (scope: feature)

- **観察**
  - `quickstart-results.md:61` は、4〜7 回目について「終わりに応答中 4〜8 本」と書いている。
  - 表 (`:41-44`) ではその回は 7 / 4 / 4 / 4 本なので、幅は 4〜7 本である。8 は 2 回目の値。
- **推奨アクション**:「4〜7 本」に直す。
- **scope 根拠**: touched file

### [Low] V-5 が「コミット後に再確認する」のまま残っている (L-002) (scope: feature)

- **観察**
  - `quickstart-results.md:81` は「コミット後に `git diff --name-only main...HEAD` で再確認する」と未来形で書いている。
  - scope.txt では `src/main`、`preload`、`agents`、`domain` の変更が 0 件と確かめられるが、結果のファイルにはそれが記録されていない。
- **推奨アクション**: 再確認の結果を日付つきで書き足す。
- **scope 根拠**: touched file

### [Low] 件数ボタンが押せない理由が「表示中のセッションだけが承認待ち」の場合を区別しない (L-003) (scope: feature)

- **観察**
  - `labels.ts` の `MONITOR_LABELS.awaitingNoTarget` は「ほかに承認待ちのセッションはありません。」で、承認待ちが 0 件のときにも「表示中のセッションだけが承認待ち」のときにも使われる。
  - spec の edge case (`spec.md:133`) は、理由として「表示中のセッションが承認を待っている」を求めている。
- **推奨アクション**: `counts.awaiting > 0 && !hasTarget` のときは別の文言を出す。
- **scope 根拠**: touched file

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `docs/roadmap.md` を `並列時の滑らかさ\|内訳` | 0 | — (`charter.md:137` / `quickstart-results.md:62` にのみある) |
| M-001 | spec / plan / quickstart を `完了条件` | 5 (+ roadmap 1、tasks 1) | `spec.md:55,209,241`、`plan.md:169`、`quickstart.md:34`、`roadmap.md:227`、`tasks.md:9` |
| M-002 | `failureReason=\{null\}\|session-row-end-notice` | 2 | `RunningSessionList.tsx:353,373` |
| M-003 | `産物` / `long task 0` | 1 / 1 | `quickstart-results.md:50`、`charter.md:141` |
| M-004 | `33 件` | 2 | `quickstart-results.md:19,22` |
| M-005 | テストを `解け\|例外にならない\|not\.toThrow` | 0 | — |

## Verdict

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 1 | H-001 |
| Medium | 5 | M-001, M-002, M-003, M-004, M-005 |
| Low | 3 | L-001, L-002, L-003 |

- Critical: 0
- High: 1
- Medium: 5
- Low: 3
