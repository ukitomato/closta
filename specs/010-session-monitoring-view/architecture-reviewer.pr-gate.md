# architecture-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Mode**: default と `scope: adr-drift` の両方 (ADR-drift の結果は末尾の節にまとめた)
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- 本 PR が実装する、または影響を受ける FR/SC:
  - FR-001〜FR-004 / SC-001: 強調、見出しとナビの件数、App の寿命の live region
  - FR-005〜FR-007 / SC-002: 経過時間、直近の活動、枠の使用数
  - FR-008 / FR-009 / SC-003: 情報密度 (compact / comfortable)
  - FR-010 / SC-006: renderer の中で閉じる
  - FR-011 / SC-004: 負荷 E2E
  - FR-012 / SC-005: 実機計測 `perf/`
  - FR-013: glossary・charter・roadmap・discovery への追随
- touched files に該当する charter / Confirmation:
  - session charter: Out of scope、Journey 3、KPI「並列時の滑らかさ」、Open Questions
  - ui charter: In scope の密度、Out of scope「他 domain の操作 UI」、Journey 4、不変条件「隔離状態は一目で分かること」(`docs/domains/ui/charter.md:131`)
  - `_overview.md`: 帰属の判断根拠、Cross-domain invariants
  - ADR: AD-038 D2 / D3 / D5 と Confirmation、AD-043 Decision 3・4・5、AD-023 §5・§7、AD-025 §4、AD-020 Consequences、AD-035 Trade-off、AD-033
  - Constitution VIII / X / XIII / XIV / XV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲。perf の env や成果物も同 reviewer に委ねる
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲。`toActivityLine` は domain の `sanitizeBody` を再利用するだけであることは確認した
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲 (気づいた点は下の申し送りに書いた)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲 (CM-02 / CM-03 / CL-10 は再指摘しない)
- G. optional reviewer 範囲: 該当なし: a11y / ux / database は各 optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

diff は 61 files。specs/ を除くと、変更は renderer、docs、e2e、perf、検査の設定に収まっている。

**頼まれた確認点のうち、問題が無かったもの:**
- **renderer だけの境界**: `pr-gate-r1.stat` で `src/main` / `src/preload` / `src/agents` / `src/domain` の差分は 0 件。
- **domain の関数は再利用だけ**: `countOccupying` / `MAX_CONCURRENT_SESSIONS` / `sanitizeBody` を `session-view.ts:3-5` から呼んでいるだけで、domain 側は変えていない。AD-025 §4 の「ui → domain は型と純粋関数まで」の範囲内である。
- **element への語彙の漏れ**: `thread-list.aui.tsx` に足したのは `density` (element 内の型 `ThreadListRowDensity`)、`renderTooltip`、`data-density` だけ。`RowOptionsContext` にも session の語彙は無い。session に触れているのは `:81` のコメント 1 行だけで、指摘にしない。
- **zustand の購読の粒度**:
  - 直近の活動はストアが購読の手前で 500ms に間引き、`sameActivity` で同じ値を書かない (`running-session-store.ts:150-182`)。
  - `statusSince` は 1 回の `setState` にまとめている (`:193-206`)。状態通知のバッチは `trackDerived(touched)` で一括に渡す (`:576`)。
  - 1 秒の時計は別の store にあり、読むのは `ElapsedTime` だけ (`RunningSessionList.tsx:305-306`)。
  - 受信の累計を購読するのは `ReceivedMessagesProbe` だけ。
- **e2e / perf の配置と検査**:
  - `not-to-test` を `^(specs|tests|e2e|perf)` に広げた。
  - `perf/tsconfig.json` を足し、verify.yml の e2e job に型検査の step だけを足した。
  - `playwright.config.ts` の `testDir: './e2e'` と vitest の明示 include により、perf はどの runner にも拾われない。
- **用語集**:
  - 新しい用語 7 つを追加した。`total_terms: 80` は実数 (`^#### ` 80 件) と一致する。
  - 識別子 (`statusSince` / `activity` / `Activity` / `deriveActivity` / `slotUsage` / `density` / `toActivityLine`) も用語集と一致する。
- **charter**: session と ui の見た目の持ち主の食い違い (design-gate R2 M-102) は両方の charter で解消済み。

**po-reviewer への申し送り (E。本 reviewer は指摘として数えない):**
- compact の行では失敗の理由 (`RowStatusBadge failureReason={null}`、`RunningSessionList.tsx:2123` 相当) と終了の告知が行から消える。FR-008 はこれを行から外すことを許していない。po-reviewer.pr-gate.round1 の M-002 と同じ内容である。

## Findings

### [Medium] charter KPI「並列時の滑らかさ」の実機計測を、持ち主の feature を決めないまま 3 回目の繰越にしている (M-001) (scope: feature)

- **観察**:
  - `docs/domains/session/charter.md:140-142` は「有効な回を得られず、利用者判断で締めた」と書く。残りは「次にこの KPI を測る feature の宿題」で、持ち主の名前が無い。`quickstart-results.md:62` も「持ち主は次に charter KPI を測る feature」としている。
  - roadmap にこの宿題の行は無い。`docs/roadmap.md:227` の O-1 行は「実機計測 SC-005 は pr-gate 前の完了条件」のまま残っている。
  - 同じ charter の KPI「列挙の網羅」(`charter.md:148`) は「持ち主 feature は roadmap へ登録する」と持ち主の置き場を書いている。「並列時の滑らかさ」だけがそれを持たない。
  - spec US-4 は「2 feature にわたる繰越であり、本 feature の範囲から削らない」(`spec.md:120`) としていた。
- **同種事象探索**: `滑らかさ|V-3|SC-005` を `docs/roadmap.md` で検索 → 1 件 (`:227`。中身は古い記述)。`有効な回が 3 回|pr-gate 前の完了条件|pr-gate の前に済ませる` → 7 件 (`docs/roadmap.md:227`、`plan.md:169`、`quickstart.md:34`、`tasks.md:97`、`spec.md:55`、`:209`、`:241`)
- **リスク/影響**:
  - KPI の実機側の計測経路に持ち主が居なくなる (ARCH-2: charter の KPI の計測経路が欠ける)。
  - X-5 → O-1 と繰り越した宿題が、誰の着手条件にも入らないまま消えうる。
- **推奨アクション**:
  - roadmap の既存の行 (O-3 の observability、または「E2E / 検証基盤 feature」) に「義務 (O-1 から)」として足し、`charter.md:142` と `quickstart-results.md:62` からその行を指す。
  - 書く中身は 2 つ。(a) 窓の終わりの行の状態の内訳を出すこと (SC-005 の出力の許可リストが変わるので、利用者の承認が要る)。(b) プロンプトか、有効な回の条件を見直すこと。
  - `roadmap.md:227` を現在の状態に直す。
  - po-reviewer M-001 / H 系 (FR-012 の古い記述) と dedup key は同じ (FR-012 / SC-005)。
- **根拠**: session charter の KPI、ARCH-2
- **scope 根拠**: charter と roadmap はどちらも本 PR の touched files

### [Medium] perf の「有効な回」の下限が env で黙って変えられ、値が NaN になると判定が素通りする (M-002) (scope: feature) [H]

- **観察**:
  - `perf/real-sessions.spec.ts:34`: `const MIN_MESSAGES = Number(process.env.CLOSTA_PERF_MIN_MESSAGES ?? '30')`
  - `:226-231`: `messages < MIN_MESSAGES ? 'too-few-messages' : null`
  - `:234-248`: 記録 (`record`) に、使った下限の値が入らない
  - `Number('abc')` は NaN になり、`messages < NaN` は常に false になる。下限の判定がそのまま通る。
  - 観測点の属性が無いときも同じで、`received` は `Number('NaN')` (`:47-50` 相当) になり、`messages` が NaN になって通る。
  - 一方の spec FR-012 (`spec.md:206`) は「さらに変えるときは閾値と同じく利用者に諮る」と書き、Edge Case (`spec.md:145`) は「閾値や有効な回の下限を黙って緩めない」と書く。
- **同種事象探索**: `process\.env\.CLOSTA_PERF_` を perf/ で検索 → 6 件 (`:34`、FOLDER / RUNTIME / PROMPT ×2 / PROVIDER / MODEL)。数値に変換して判定に使うのは `MIN_MESSAGES` の 1 件だけ
- **リスク/影響**:
  - 下限を下げた回や env を書き間違えた回が、出力上は `valid: true` になる。
  - 記録 (quickstart-results) から下限が何件だったかを辿れない。
  - 「黙って緩めない」を手順書の運用だけに頼り、仕組みでは保証していない (ARCH-6: 設定と環境のずれ)。
- **推奨アクション**:
  - (a) 下限は `Number.isFinite(n) && n > 0` でなければ `refused: CLOSTA_PERF_MIN_MESSAGES` で失敗させる。
  - (b) `received` が有限値でなければ `invalidReason: 'probe-missing'` にする。
  - (c) 使った下限 (`minMessages`) を記録に足す。SC-005 の許可リストに 1 項目足すことになるので、spec にも足す。
  - (d) 既定値以外の下限で通った回は、valid のまま `thresholdOverridden: true` を出す。
- **根拠**: spec FR-012 / Edge Cases、ARCH-6
- **scope 根拠**: perf と spec はどちらも本 PR の touched files

### [Medium] 実資格情報で実アプリを自動操作する検証経路 (perf/) を、ADR を起こさず「AD-038 D2 の類推」として入れている (M-003) (scope: out-of-scope)

- **観察**:
  - `plan.md:182` は「`perf/` は『CI 外・実資格情報・自動操作』の新しい検証経路だが…D2 の類推で扱う (ADR は起こさない)」としている。
  - 実際に入った決めごとは次のとおりで、置き場は plan、コード注記、`docs/discovery.md:151` に分散している。
    - CI と `CLOSTA_E2E` を拒否する安全柵 (`playwright.perf.config.ts:15-17`、`perf/real-sessions.spec.ts:161-166` 相当)
    - agent は利用者の明示的な指示があるときだけ実行する (`docs/discovery.md:151`)
    - 起動前に権限モードが既定であることを確かめる
    - 成果物は repo の外に出す
    - e2e/support を perf と共有する (`perf/tsconfig.json:4`)
  - AD-038 の適用範囲は「credential-free の E2E」(D3) で、実資格情報を使う自動操作は ADR のどこにも決まっていない。
  - AD-038 自身の冒頭 (`docs/decisions/0038-e2e-screenshot-harness.md:15-17`) には「research ノート留めは governance 不足。起票すべき」として ADR 化した経緯 (先例 AD-036 / AD-034) が書かれている。
  - D2 の字面は「eslint は `e2e/**` の明示 override (Playwright 向けのみ) を足し、base を緩めない」(`0038:45-47`)。実装は ignores で外していて (`eslint.config.mjs:169-181`)、plan はこの形を「AD-038 D2 と同じ扱い」と引いている。roadmap の項目 (`roadmap.md:139`) も D2 との差を書いていない。
- **同種事象探索**: `AD-038 D2 の類推|D2 の類推` → 3 件 (`plan.md:182`、`eslint.config.mjs:172`、`perf/tsconfig.json:2`)。docs/decisions で `perf|実機計測` → 0 件
- **リスク/影響**:
  - 次に実機計測を足す feature (M-001 の宿題の持ち主) が、安全柵の根拠を ADR で辿れない。
  - `SCAN_ROOTS` の外にある死角 (roadmap の system-scope の項目) を ADR で決めるときにも、前提となる決定が無い。
  - 「agent が実資格情報を消費する経路」という統制上の判断が、plan の 1 行に留まる。
- **推奨アクション**:
  - 「CI 外の実機計測ハーネス」の ADR を proposed で起こす。中身は、置き場 (perf/ を src のグラフの外に置く)、安全柵 (CI / CLOSTA_E2E の拒否、既定の権限モード、成果物を外に出す)、agent の実行条件、e2e/support の共有、ESLint を ignore にするか override にするかの判断。
  - roadmap の `SCAN_ROOTS` の項目と ESLint の項目からその ADR を指す。
  - 本 PR で起こさない場合でも、roadmap の system-scope の項目に「実機計測ハーネスの ADR 化」を足す。
  - accepted の AD-038 は書き換えない。
- **根拠**: AD-038 D2 / D3 と Context、ARCH-3
- **scope 根拠**: 新しい ADR が要る

### [Low] FE-021「将来の隔離バッジの置き場を行の中に残す」に完了の印が付いているが、コードには置き場も注記も無い (L-001) (scope: feature)

- **観察**:
  - `tasks.md:77` の FE-021 は [x] で、「実装時の変更」の注記も無い。
  - `RunningSessionList.tsx` を `隔離|isolation|I-2` で検索すると 0 件。compact の分岐 (`SessionRowMeta` の compact 側) に、バッジを置く場所もコメントも無い。
  - 不変条件の正本は ui charter `:131`「隔離状態は一目で分かること」と spec FR-008。roadmap I-2 の行 (`roadmap.md:245` 相当) には義務として書かれている。
- **同種事象探索**: `隔離|isolation|Isolation|I-2` を `RunningSessionList.tsx` で検索 → 0 件
- **リスク/影響**:
  - I-2 が compact の行にバッジを足すと、O-1 SC-003 の「横あふれ無し・操作が行の内側」を壊しうる。
  - その場所がコード側から見つからない (cross-domain invariant の追跡が切れる)。
- **推奨アクション**:
  - compact の分岐に「I-2: 隔離バッジはここ (状態の前)。SC-003 の E2E が幅を守る」という 1 行の注記を置く。
  - または FE-021 に「実装時の変更: 置き場は roadmap I-2 に送った」と書く。
- **根拠**: ui charter の不変条件、spec FR-008、ARCH-5
- **scope 根拠**: touched files の中で直せる

### [Low] 行の状態の型と純粋な導出が文言の表 (labels.ts) に依存している。i18n の判断 (O-3) の前に、型の正本が UI ラベルに縛られる (L-002) (scope: feature)

- **観察**:
  - `labels.ts:95`: `export type SessionRowStatus = keyof typeof SESSION_ROW_STATUS_LABELS`。X-5 からある定義である。
  - O-1 はこの依存を広げた。
    - ストアの状態型 `StatusSince` が labels に依存する (`running-session-types.ts:14`)。
    - 純粋な導出の `session-view.ts:9` が、`Elapsed` 型と文を組む `attentionAnnouncement` を labels から取る。
  - 用語集は SessionRowStatus を session の概念として定義している (`glossary.md:772`)。
- **同種事象探索**: `SessionRowStatus` を src/renderer で検索 → 7 件 (`labels.ts:95`、`running-session-types.ts:14,63`、`RunningSessionList.tsx:40,263`、`session-view.ts:9,80`)
- **リスク/影響**:
  - roadmap O-3 の義務である i18n のリソース化で文言の表を外に出すと、ストアの型と導出の import が一緒に動く。
  - 依存の向き「型・導出 → 文言」が逆になっている (ARCH-4)。
- **推奨アクション**:
  - `SessionRowStatus` と `Elapsed` を `running-session-types.ts` (または `session-view.ts`) に移す。
  - labels 側は `Record<SessionRowStatus, string>` で型を検査する形にする。
  - `announcements` は `{ awaiting, failed }` の表示名の組を返し、文を組むのは呼び出し側 (Announcer) が labels で行う。
  - O-2 の前に予定している store の切り出し (CM-02) と同じ機会に行ってよい。
- **根拠**: Constitution XV (i18n の判断の期限は M3)、ARCH-4
- **scope 根拠**: 本 feature のモジュールの中で直せる

### [Low] 時刻とタイマの注入がそろっていない。経過時間を、注入した now() と、モジュール全体で 1 つの Date.now の差で出している (L-003) (scope: feature)

- **観察**:
  - ストアは `now` を注入できる (`running-session-store.ts:110`)。`statusSince.at` はその値で書く (`:201`)。
  - 一方、経過時間の基準になる時計はモジュールの singleton で、固定の `Date.now()` を使う (`useSessionClock.ts:17,27-28`)。`ElapsedTime` はこの 2 つの差を表示する (`RunningSessionList.tsx:305-306`)。
  - plan `:138` は「タイマはストアに注入する」としているが、間引きは `setTimeout` を直接呼んでいる (`running-session-store.ts:159`)。tasks にも「実装時の変更」の注記は無い。
- **同種事象探索**: `setTimeout|clearTimeout` を features/session/*.ts で検索 → 3 件 (`running-session-store.ts:134,159,482`)。`Date\.now|setInterval` を `useSessionClock.ts` で検索 → 3 件
- **リスク/影響**:
  - `now` を Date.now 以外に注入するテストや将来の用途で、経過時間が壊れる (時刻の源が 2 つある)。
  - 時計はストアのインスタンスの外にある global なので、テストの間で状態 (`users` / `timer`) が漏れうる。
  - 本番は両方とも Date.now なので、実害は無い。
- **推奨アクション**:
  - 時計にも同じ `now` を渡す (ストアの wiring から時計の作成関数に渡す)。
  - または plan `:138` を実装に合わせ、「時刻の源は Date.now に統一する」と注記する。
- **根拠**: plan の renderer 節、ARCH-4
- **scope 根拠**: touched files の中で直せる

### [Low] plan と research が、実装しなかった「行の Root に付ける data-* 属性を解決する口」と「左端の帯」を設計のまま残している (L-004) (scope: feature)

- **観察**:
  - `plan.md:152`、`:161`、`research.md:42` は、Root に付ける data-* 属性の resolver と左端の帯を前提に書かれている。
  - 実装は meta の中の状態の要素に `data-row-status` / `data-attention` を付けた。理由は `thread-list.aui.tsx:84-86` の注記にある。帯は無い。
  - 「実装時の変更」として記録されているのは `tasks.md:43` だけである。
- **同種事象探索**: `属性を解決|Root に|帯` を specs/010 の plan / research / data-model / tasks で検索 → 5 件 (`plan.md:152,161`、`research.md:42`、`tasks.md:42,43`)
- **リスク/影響**: O-2 や I-2 が element の口を設計するとき、plan と research が実在しない口を正本として示してしまう (規則の正本が分かれる)。
- **推奨アクション**: `plan.md:152`、`:161`、`research.md:42` に「実装時の変更: tasks FE-001 を参照」と 1 行ずつ足す。
- **根拠**: tasks の冒頭「方式の理由は research が正本」、ARCH-7
- **scope 根拠**: touched files

## 0 件の確認 (A〜H)

- **A / B**: owner の範囲外 (security)。`toActivityLine` は `sanitizeBody` を再利用し、`unknown` を `''` に倒すことは確認した。
- **C**:
  - _overview の Cross-domain invariants 9 行 (I〜X) と照合し、本 PR がこれらを破る経路は 0 件。Principle X の観点では、新しい状態はすべてメモリ内の派生値で、永続化しない。
  - 用語集の 7 語と識別子は一致する。表記ゆれの表に「監視ビュー / 稼働中セッション一覧」の行を足したことも確認した。
  - charter の新しい記述は USER 決定を引いている。
  - 指摘は M-001 と L-001 の 2 件。
- **D**:
  - Constitution VIII: compact の幅は E2E で確かめている。
  - XIII: Badge は公式の CLI で入れ、Tooltip は導入済みのもの、独自のトークンは足していない。
  - XIV: 用語集を追随させた。
  - XV: 文言は labels.ts に置き、i18n の判断は O-3 に送った。
  - 以上の 4 つに drift は 0 件。
  - AD-023 §7 / AD-025 §4 (ui → domain は純粋関数まで) と eslint boundaries: 違反 0 件 (lint-agent も exit 0)。
  - 指摘は M-003、L-002、L-003、L-004 の 4 件。
- **E / F / G**: owner の範囲外。
- **H**:
  - 本 reviewer の領域の回帰について:
    - 枠の数え方が main と一致することは、`session-view.monitor.test.ts:250-272` (同じ domain 関数を使う) で固定されている。
    - `statusSince` を 1 回の `setState` にまとめることは `running-session-store.monitor.test.ts:170`、間引きは `:192`、描画回数の上限は `RunningSessionList.monitor.test.tsx:350`、R-2 の element への波及は FE-023 (101 files・1719 passed) で確かめている。
  - 検出するテストが無いもの:
    - M-002: perf の判定に単体テストが無い。下限の検証は、純関数に切り出せば Vitest で固定できる。
    - L-003: Date.now 以外の `now` を注入するテストが無い。

## ADR-drift モード (scope: adr-drift)

- accepted ADR を in-place で変えた箇所: `docs/decisions/` の差分 0 件 (stat)。訂正節の濫用も 0 件。
- AD-020 Consequences (Hook / Background task) と AD-035 Trade-off (Tool group の既定 open 化。「O-1 候補」): ADR の本文には触れず、charter / _overview / roadmap に回答と申し送りを書いた。決定を変えてはいない。drift 0。
- AD-043 Decision 3 (枠は `claudeAlive` で数え、run-state では判定しない): renderer は domain の `countOccupying` を使っており一致する。Decision 4 (状態通知のフィールド): 変更 0 件。drift 0。
- AD-038:
  - D2 の `not-to-test` の拡張: 守られている。
  - D3 (CI に実資格情報を入れない): verify.yml に入ったのは型検査だけで、守られている。
  - D5 (基準画像): 更新していない (quickstart-results に、O-1 由来ではない 1px 差であると記録がある)。
  - D2 の ESLint の字面との差と、実資格情報の経路が ADR で決まっていないことは M-003 に書いた。
- AD-023 §5 (状態を持たない規則は純粋関数): `session-view.ts` に足したものは純粋関数で、drift 0。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `滑らかさ\|V-3\|SC-005` in docs/roadmap.md | 1 | docs/roadmap.md:227 |
| M-001 | `有効な回が 3 回\|pr-gate 前の完了条件\|pr-gate の前に済ませる` | 7 | docs/roadmap.md:227 / plan.md:169 / quickstart.md:34 / tasks.md:97 / spec.md:55,209,241 |
| M-002 | `process\.env\.CLOSTA_PERF_` in perf/ | 6 (数値に変換して判定に使うのは 1) | perf/real-sessions.spec.ts:34 |
| M-003 | `AD-038 D2 の類推\|D2 の類推` | 3 | plan.md:182 / eslint.config.mjs:172 / perf/tsconfig.json:2 |
| M-003 | `perf\|実機計測` in docs/decisions | 0 | — |
| L-001 | `隔離\|isolation\|Isolation\|I-2` in RunningSessionList.tsx | 0 | — |
| L-002 | `SessionRowStatus` in src/renderer | 7 | labels.ts:95 / running-session-types.ts:14,63 / RunningSessionList.tsx:40,263 / session-view.ts:9,80 |
| L-003 | `setTimeout\|clearTimeout` in features/session/*.ts | 3 | running-session-store.ts:134,159,482 |
| L-003 | `Date\.now\|setInterval` in useSessionClock.ts | 3 | useSessionClock.ts:17,27,28 |
| L-004 | `属性を解決\|Root に\|帯` in specs/010 plan/research/data-model/tasks | 5 | plan.md:152,161 / research.md:42 / tasks.md:42,43 |

## Verdict

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 3 | M-001 (C) / M-002 (H) / M-003 (D) |
| Low | 4 | L-001 (C) / L-002 (D) / L-003 (D) / L-004 (D) |

- Critical: 0
- High: 0
- Medium: 3
- Low: 4
