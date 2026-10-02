# architecture-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-02T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md

## 初回読了 viewpoint

- FR/SC (本 feature で実装または影響を受けるもの):
  - FR-001〜FR-004 (承認待ちと失敗の強調・件数・live region) / SC-001
  - FR-005〜FR-007 (経過時間・直近の活動・枠の使用数) / SC-002
  - FR-008〜FR-009 (情報密度の切り替え) / SC-003
  - FR-010 (境界の維持) / SC-006
  - FR-011〜FR-012 (E2E と実機計測) / SC-004・SC-005
  - FR-013 (glossary / charter / roadmap の追随)
- touched files に該当する charter / Confirmation:
  - session charter: Scope「監視ビュー」、Journey 3、KPI「並列時の滑らかさ」、Open Questions
  - ui charter: In scope「情報密度の切替（compact / comfortable）」、Journey 4、Out of scope「状態遷移 → session」
  - `_overview.md`: Feature 帰属表、「帰属の判断根拠」
  - AD-043 Decision 3・4 (状態通知に会話由来の文字列を載せない / 枠の数え方)
  - AD-038 D2 (e2e を src グラフから分離) と Confirmation (depcruise・lint の分離)
  - AD-020 Consequences と Open Questions (Hook / Background task)
  - AD-035 Consequences (Tool group の既定 open 化は O-1 候補)
  - AD-023 §5 (状態を持たない規則は純関数として 1 か所に置く) / §7
  - AD-034 (本文の経路)
  - Constitution VIII / IX / XIII / XIV / XV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲。実機計測 (perf/) の資格情報の扱いも同 reviewer に委ねる
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲。直近の活動は plain text で描画し、argsText は agents 側の `sanitizeBody` を通る (`src/domain/session/live-message.ts:52`)。この 2 点は確認済み
- C. 業務不変条件 / Charter drift: Critical:0 High:2 Medium:2 Low:3
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲。lint 設定の欠落は ADR D2 drift として D で扱った (H-002)
- G. optional reviewer 範囲: 該当なし: a11y・ux・database は各 optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

X-5 の稼働中セッション一覧 (`RunningSessionList.tsx` と、R-2 と共有する `thread-list.aui.tsx` の行) を、renderer の中だけで監視ビューに拡張する。主な内容は次のとおり。

- ストアに `statusSince` と `density` を足し、`session-view.ts` の純関数で経過時間・直近の活動・枠の使用数・承認待ちの順を導く
- IPC・状態通知・main・supervisor は変えない
- E2E の計測処理を `e2e/support/input-probe.ts` に切り出す
- 実 `claude` 10 本の実機計測を、新しいトップレベル `perf/` と `playwright.perf.config.ts` に置く (CI には載せない)
- glossary・session charter・roadmap・discovery を追随させる

ADR は起票しない。[USER 決定 2026-10-02] の 4 件は前提として扱い、決定そのものは指摘の対象にしない。指摘するのは、その決定の記録先と、他の SSoT との整合だけである。

## Findings

### [High] ui charter が持つ「情報密度の切替」と Journey 4 を、session の feature が再定義している。ui charter とその追随タスクが無い (H-001) (scope: feature)

- **観察**:
  - `docs/domains/ui/charter.md:42` は In scope に「情報密度の切替（compact / comfortable）」を挙げている
  - 同 `:102-105` (Journey 4) は「監視ビューでは各セッションが compact に並ぶ / 1 つを開くと comfortable な没入ビューになる」と定義している。密度は「監視 = compact、没入 = comfortable」という画面の性質である
  - 本 spec は密度を「サイドバーの行の表示状態」として session feature に持たせ、利用者のトグルにしている (`spec.md:168-173`, FR-008/FR-009)
  - 本 spec は charter Journey 3 の「一覧 ⇄ 没入」を「サイドバーの行を選ぶ ⇄ 次の行を選ぶ」と読み替えている (`spec.md:37`)
  - 記録の追随 (`spec.md:191-196` FR-013、`tasks.md:81-84` SH-090、`plan.md:148-151`) は session charter・glossary・roadmap・discovery だけを更新し、ui charter を更新しない
  - plan の申し送りの探索 (`plan.md:83-87`) は `\bO-1\b` の grep だけで行われた。ui charter は O-1 を名指ししていないため拾われていない
  - 申し送り表の #15 (`plan.md:107`) は transcript の密度を O-2 に送っている。一方 ui Journey 4 の「comfortable な没入ビュー」は transcript 側の密度であり、その持ち主の記録も ui charter に残らない
- **同種事象探索**: `Grep "密度|compact|comfortable|没入" docs/domains` → 該当は ui charter の `:42` / `:76-77` / `:102-105` と session charter の `:92` (Journey 3 の「没入ビュー」)。`Grep "ui/charter" specs/010-session-monitoring-view` → 0 件 (ui charter への言及が無い)
- **リスク/影響**:
  - USER 決定 (全面画面を作らない) と ui charter の Journey 4 が文面上で食い違ったまま残る
  - O-2 / O-3 (ui domain) の着手時に「密度切替は ui の in scope であり未実装」と読まれ、二重実装や再定義が起きうる
  - Journey 3 の読み替えも session charter に記録されないため、M3 の完了判定 (「俯瞰」) の根拠が spec の中にしか残らない
- **推奨アクション**: SH-090 に次を足す。
  1. ui charter `:42`: 「一覧の行の密度は O-1 (session。見た目と element は ui)、transcript の密度は O-2」と分担を明記する
  2. ui charter `:102-105`: Journey 4 を USER 決定 2026-10-02 に合わせて改める (または「O-1 で読み替えた」と注記する)
  3. session charter `:88-92`: Journey 3 に「監視ビュー = 稼働中セッション一覧の拡張 / 没入ビュー = 表示中セッションのペイン」を注記する
  4. plan の申し送り表に ui charter の行を足す
- **根拠**: ARCH-2 (Domain Charter drift)、ui charter Scope / Journey 4、Principle XIV
- **scope 根拠**: FR-013 / SH-090 (本 feature の docs 追随タスク) で直せる

### [High] 実機計測の置き場 `perf/` に AD-038 D2 の分離規則が適用されず、plan は「機械強制は変更しない」としている (H-002) (scope: feature)

- **観察**:
  - plan は `perf/` を「`e2e/` と同じく src のグラフの外 (AD-038 D2)」とする (`plan.md:162`)。一方「`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/` は変更しない」(`plan.md:161`) とし、`perf/` には型検査の追加しか計画していない (`tasks.md:76`, `plan.md:144`)
  - 実際の分離は**実名リスト**で書かれている:
    - `eslint.config.mjs:172-179` の `ignores` は `e2e/**` と `playwright.config.ts` だけである。`perf/**` と `playwright.perf.config.ts` は `eslint.config.mjs:192` の `files: ['**/*.{ts,tsx}']` (react-hooks / react-refresh) の lint 対象になる
    - CI は `pnpm lint` = `eslint --cache .` でリポジトリ全体を lint する (`.github/workflows/verify.yml:63-64`)
    - `.dependency-cruiser.js:140-141` の `not-to-test` は `^(specs|tests|e2e)` だけを塞ぐ。src → `perf/` の逆流入は検出されない
  - AD-038 D2 は「e2e 専用の実行 (別 config / 別起点)」「`not-to-test` の prefix を拡張し src→e2e の逆流入を塞ぐ」「実名リスト方式の既存ルールを緩める形の scope 編入を禁じる」と定める。AD-038 Confirmation は「e2e が src の depcruise グラフに混ざらず (… `not-to-test` prefix 拡張)」である
  - plan の上流 grep (`plan.md:87-88`) は「実名リスト方式のルールに本 feature が触るモジュールは無い」と結論している。しかし新設のトップレベルのディレクトリは、実名リストに**足す側**の対象である
- **同種事象探索**: `Grep "e2e" eslint.config.mjs / .dependency-cruiser.js / tsconfig*.json / package.json / playwright.config.ts` → 4 件 (`.dependency-cruiser.js:138,140,141` / `eslint.config.mjs:169,170,177`。`playwright.config.ts:16` の `testDir`)。いずれも `e2e` の実名だけで、`perf` を含むものは 0 件
- **リスク/影響**:
  - `perf/` が CI の lint で src 向けの規則に掛かる。Playwright の fixture などで react-hooks の誤検知が出て lint が赤になるか、それを避けるために規則を緩める方向の改変が誘発される
  - src → perf の import が機械的に止まらず、実 `claude` を起動する計測コード (`CLOSTA_E2E` を渡さない本物の composition) が src のグラフに入りうる
  - これは AD-038 D2 / Confirmation の趣旨からの逸脱である。D2 の字面は `e2e/` だけを名指しするため Critical にはしない
- **推奨アクション**:
  - `eslint.config.mjs` の `ignores` に `'perf/**'` と `'playwright.perf.config.ts'` を足す
  - `.dependency-cruiser.js` の `not-to-test` の `from.pathNot` / `to.path` を `^(specs|tests|e2e|perf)` に広げる
  - plan の「機械強制の変更」表の 2 行目以降に上記を記載し、SH-032 / SH-092 のタスクに含める
  - `perf/` は「CI 外・資格情報あり・自動操作」という新しい検証経路の類型である。D2 の類推で済ませるなら、plan の ADR 節にその判断を明記する。済ませないなら後続 ADR (AD-038 の決定は書き換えない) を起こす
- **根拠**: AD-038 D2 / Confirmation、AD-023 §7、ARCH-3 / ARCH-4
- **scope 根拠**: 本 feature が新設する `perf/` と、その機械強制の設定 (plan の touched files の範囲)

### [High] 「直近の活動」の間引きをフックで行う設計では、FR-006 / FR-010 / SC-006 の「本文の更新ごとに行を再描画しない」を満たせない (H-003) (scope: feature)

- **観察**:
  - spec は「本文の更新ごとに行を再描画しない」(`spec.md:161` FR-006)、「一覧の行は本文全体を購読しない … X-5 SC-003 の対策を崩さない」(`spec.md:179` FR-010) と定める
  - SC-006 (`spec.md:225`) は「本文の更新で間引きを超えて再描画しないこと」を component テストで測るとしている
  - 設計は次のとおりである:
    - research R-03 (`research.md:21`): 「行は `deriveActivity` の結果 (文字列) を selector で選び、表示に使う値を 500ms 間隔で間引くフック (`useThrottledValue`) を通す」
    - FE-011 (`tasks.md:49`): 「`useRowFacts` は … 末尾 1 件と `pending` だけを選ぶ」
  - zustand の selector が返す値 (末尾メッセージのオブジェクト、または導出した文字列) は、メッセージの upsert のたびに変わる (`running-session-store.ts:165-168` は毎回新しいオブジェクトと配列を作る)。行のコンポーネントはその都度再描画される。`useThrottledValue` はそのコンポーネントの**中で**動くため、遅らせられるのは表示する値だけで、再描画そのものは減らない
  - X-5 SC-003 の負荷 (10 本 × 20 件/秒) では、行の再描画が最大 200 回/秒のまま残る
- **同種事象探索**: `Grep "useThrottledValue|末尾 1 件|selector で選び" specs/010-session-monitoring-view` → 3 件 (`research.md:21` / `tasks.md:48-49` / `plan.md:133`)。いずれも同じ方式
- **リスク/影響**: FR-006 / FR-010 を設計の段階で満たしていない。SC-004 (p95 50ms / long task 100ms) を割ったとき、R-01 の対処「間引きの間隔を広げる」(`plan.md:168`) は効かない。間隔を広げても再描画の回数は変わらないためである
- **推奨アクション**:
  - 間引きを**購読の手前**に置く。たとえばストアに `activity: Record<sessionId, string | null>` を持たせ、`applyEvent` の `message` / `permission-request` の後に、セッションごとに 500ms で間引いて `deriveActivity` の結果を書き込む (最後の値は trailing で必ず反映する)。行は文字列 1 つだけを選ぶ
  - FE-012 の最後の観点 (`tasks.md:55`) は「最後の値が出る」だけでなく、**行の描画回数** (React Profiler の `onRender` や描画カウンタ) で上限を確認する形に改める
  - research R-03 と plan の renderer 節 (`plan.md:133`) を合わせて直す
- **根拠**: spec FR-006 / FR-010 / SC-006、X-5 SC-003 の対策 (5) (`RunningSessionList.tsx:72` の注記)
- **scope 根拠**: 本 feature の plan / research / tasks で直せる

### [Medium] `slotUsage` が、domain に置いた枠の数え方の正本 `countOccupying` を使わずに数え方を再実装している (M-001) (scope: feature)

- **観察**:
  - `src/domain/session/concurrency.ts:15-23` は、X-5 pr-gate R1 architecture L-002 / AD-023 §5 に従い「FR-005 の中核規則を domain に置く」として `countOccupying(entries: {claudeAlive})` を公開している
  - plan は「`domain` から使うのは既存の `MAX_CONCURRENT_SESSIONS` と型だけ」とする (`plan.md:20`)
  - data-model §2 (`data-model.md:40-42`) は、renderer の中で「`order` のうち `viewOf(state, id).ended === false` の数」を独自に数える
- **同種事象探索**: `Grep "MAX_CONCURRENT_SESSIONS" src` → 4 件 (`src/domain/session/concurrency.ts:13,32` / `concurrency.test.ts:3,7` / `src/renderer/src/features/session/labels.ts:2,35`)。`Grep "countOccupying" specs/010-session-monitoring-view` → 0 件
- **リスク/影響**: 同じ規則 (「claudeAlive で数え、run-state では数えない」) の実装が 2 か所になる。X-6 などで枠の定義が変わったとき、main の判定と renderer の表示が黙って食い違う。spec は「瞬間的な食い違い」(予約分) だけを許容しており、定義の食い違いは許容していない
- **推奨アクション**:
  - `slotUsage` は `countOccupying(order.map(id => ({ claudeAlive: state.statuses[id]?.claudeAlive !== false })))` で数える
  - `plan.md:20` の「型だけ」を「`MAX_CONCURRENT_SESSIONS` と `countOccupying`」に改める
  - SH-003 の単体に、`countOccupying` と同じ結果になることの観点を足す
- **根拠**: AD-023 §5 (状態を持たない規則は純関数として 1 か所に置く)、X-5 FR-005、`concurrency.ts:16-17` の注記
- **scope 根拠**: 本 feature の data-model / plan / SH-003 で直せる

### [Medium] Hook / Background task の回答「session に含めない」が状態管理の持ち主を空けたまま記録され、domain 帰属の正本 `_overview.md` と ui charter に反映されない (M-002) (scope: feature)

- **観察**:
  - AD-020 の Open Question (`docs/decisions/0020-sdk-emitted-message-inventory.md:129`) は「session domain の責務に含めるか、**別 domain にするか**」を問う
  - spec は「session に含めない。表示の割当を O-2 に送る」とし、記録先を session charter の Open Questions と roadmap の O-2 行に限る (`spec.md:194`, `tasks.md:82-83`)
  - ui charter の Out of scope (`docs/domains/ui/charter.md:56-57`) は「セッションの起動ロジックと**状態遷移** → `session`（本 domain は `session` が持つ状態を表示する）」と定める。そのため O-2 (ui) は状態管理を持てない
  - 結果として、Background task の**状態管理**の持ち主が、どの domain の文書にも無くなる
  - domain 帰属の正本である `_overview.md` の「帰属の判断根拠」(`docs/domains/_overview.md:75-84`) も更新対象に入っていない
- **同種事象探索**: `Grep "Background task|Hook" docs/domains` → 1 件 (`docs/domains/ui/charter.md:177`。O-2 で SDK 型から引き直す、という表示側の言及だけ)
- **リスク/影響**: O-2 で「表示に状態の保持が要る」と分かった時点で、持ち主の議論が再発する (AGENTS.md: domain decomposition は人間の承認事項)。USER 決定そのものは尊重するが、決定の到達範囲が記録から欠ける
- **推奨アクション**: SH-090 に次を足す。
  - `_overview.md` の「帰属の判断根拠」に 1 行を足す (Hook / Background task の状態は session に含めない。O-1 USER 決定 2026-10-02。表示の割当と、状態の保持が要る場合の持ち主 domain の判断は O-2)
  - ui charter の Open Questions (`:176-178` 付近) に、O-2 が持ち主を判断する旨を書く
  - roadmap O-2 行の申し送り文にも「状態の持ち主の判断」を含める
  - AD-020 の本文は変えない (現方針のとおり)
- **根拠**: ARCH-2 / ARCH-5、AD-020 Open Questions、ui charter Out of scope、AGENTS.md「domain decomposition は人間が承認」
- **scope 根拠**: FR-013 / SH-090 の docs 追随で直せる

### [Medium] 直近の活動の導出規則が spec FR-006 と data-model §2 で食い違う (M-003) (scope: feature)

- **観察**:
  - spec FR-006 (`spec.md:159`) の規則は 2 つである。(3)「それ以外は、最後の assistant 本文の**先頭 1 行**」。Edge Case (`spec.md:129`)「本文がまだ無い → 空」
  - data-model §2 (`data-model.md:19-28`) は次のとおりである:
    - 入力は「表示中のメッセージ配列の**末尾 1 件**」だけ
    - 末尾が user なら `null`
    - text は「**最後の** text part」で、改行は空白に畳んで 80 文字で切る。「先頭 1 行」の切り出しは無い
    - SH-003 も「末尾が user なら `null`」をテストの観点にしている (`tasks.md:14`)
  - そのため、応答待ちの後に 2 回目のプロンプトを送ると末尾が user になり、data-model では直近の活動が空になる。spec の (3) では直前の assistant 本文が出るはずである
  - 複数の text part を持つメッセージでは、spec は本文の先頭を、data-model は最後の part を出す
- **同種事象探索**: `Grep "先頭 1 行|最後の text part|末尾が user" specs/010-session-monitoring-view` → spec 2 件 (`:84`, `:159`) / data-model 2 件 (`:25-26`) / tasks 1 件 (`:14`)
- **リスク/影響**: tasks の規約は「値と導出の正本は data-model」(`tasks.md:7`) で、spec の FR は振る舞いの正本である。正本が 2 つの規則を言い、実装とテストは data-model 側に寄る。SC-002 (「FR-006 の優先順の各分岐」) の合否判定ができない
- **推奨アクション**: どちらかに揃える。
  - 案 1: 末尾 1 件の制約を保つなら、spec の (3) を「最後のメッセージが assistant のときその本文の…。末尾が user なら空」に改める
  - 案 2: 直前の assistant を出すなら、data-model の入力を「最後の assistant メッセージ」に改める (後方走査が要り、件数非依存の方針と緊張する点を research R-02 に記録する)
  - 「先頭 1 行」と「改行を畳む」のどちらを採るかも 1 か所に決める
- **根拠**: ARCH-1 (spec と下位文書の整合)、tasks の「規則の正本」
- **scope 根拠**: spec / data-model / SH-003 で直せる

### [Medium] Principle VIII (NON-NEGOTIABLE) の Constitution Check が composer に限定され、compact 1 行の全角レイアウトの検証経路が無い (M-004) (scope: feature)

- **観察**:
  - plan の Constitution Check は VIII を「composer を変えない」とし、スクリーンショットの基準画像の差分だけを扱う (`plan.md:43`)
  - Principle VIII の Statement は「全角混在時のレイアウト崩れを許容しない」で、composer に限らない (`.specify/memory/constitution.md:568`)
  - compact は 256px のサイドバー (`research.md:40`) に、次を 1 行で並べる設計である (`research.md:39`):
    - 状態のアイコンと日本語の文言
    - 作業フォルダの表示名 (全角を含みうる)
    - 経過時間 (`N時間M分`)
    - 最大 3 つの操作のアイコンボタン (「折り返さない」)
  - SC-003 / SH-031 の E2E は「10 行がスクロールなしで見える」(縦) だけを確かめる (`tasks.md:75`)。横あふれや操作ボタンの押し出しは確かめない
- **同種事象探索**: `Grep "全角|VIII" specs/010-session-monitoring-view` → plan 1 件 (`plan.md:43`)。spec / tasks の検証観点に全角は 0 件
- **リスク/影響**: 全角の長い表示名で操作ボタンが行の外に押し出される、または切り詰めでボタンが重なる崩れを、どの自動テストも検出しない。VIII は NON-NEGOTIABLE だが違反はまだ観察されていないため、Medium とする
- **推奨アクション**:
  - SH-031 に観点を足す: compact で全角の長い作業フォルダ表示名を持つ 10 行について、行の `scrollWidth <= clientWidth` と、操作ボタンの boundingBox が行と一覧の可視領域の内側にあること
  - plan の VIII 行を「サイドバーの行のレイアウトも対象」に改める
- **根拠**: Constitution Principle VIII、ARCH-1
- **scope 根拠**: 本 feature の plan / SH-031 で直せる

### [Low] 共有の element `thread-list.aui.tsx` に、session の状態語彙 (`data-attention="approval" | "failure"`) を持ち込む (L-001) (scope: feature)

- **観察**: `thread-list.aui.tsx:36-40` は「グループ分けの規則は `features/session-list/` が持つ … ここは体裁だけを持つ」と自らの境界を宣言している。plan / FE-001 は Root に `data-attention="approval" | "failure"` を付ける口を足す (`plan.md:135`, `tasks.md:33`)。R-2 と共有する element が、session feature の状態語彙を知る形になる
- **同種事象探索**: `Grep "data-attention" src` → 0 件 (新設)
- **リスク/影響**: element 層が feature の語彙に依存し、R-2 や将来の一覧で語彙が増えるたびに element を改変することになる
- **推奨アクション**: element には語彙を持たない口を置く。たとえば `RowMetaContext` と同じ形の `renderRowAttributes?: (rowKey) => Record<\`data-${string}\`, string>`、または行の `className` を解決する関数にする。値 (`approval` / `failure`) は `RunningSessionList.tsx` が決める
- **根拠**: ARCH-4、`thread-list.aui.tsx:36-40` の境界宣言、ui charter (element 選定は ui)
- **scope 根拠**: FE-001 / FE-020 で直せる

### [Low] 状態通知が handshake より先に届いた場合、`launch` が `statusSince` を `launching` で上書きし、行の状態とずれる (L-002) (scope: feature)

- **観察**:
  - `running-session-store.ts:450-454` は、`inFlight > 0` の間は未知の sessionId の状態通知を `statuses` に受ける
  - plan は「`patch` と状態通知の受信の後に `trackStatus`」としつつ、「起動の受付で `statusSince[id] = { status: 'launching', at: startedAt }`」と固定値で書く (`plan.md:122-123`)
  - `launch` は `patch` を通らず `setState` で行を足す (`running-session-store.ts:279-284`)
  - 先に `ready` の状態通知が届いていた場合、行は `ready` を示すのに、`statusSince.status` は `launching` のまま、次の更新まで残る
- **同種事象探索**: `Grep "inFlight === 0" src/renderer/src/features/session/running-session-store.ts` → 1 件 (`:452`)
- **リスク/影響**: 経過時間の起点と `announcement` の前の値が一時的に誤る。影響は小さい
- **推奨アクション**: 起動の受付時に `rowStatus(viewOf(state, id))` を評価して `statusSince` を入れる (`launching` を固定値にしない)。SH-004 に「handshake より先に状態通知が届く」観点を足す
- **根拠**: spec Key Entities「状態に入った時刻」、FR-005
- **scope 根拠**: SH-004 で直せる

### [Low] 上限時の「空け方」の案内が、X-5 の `session-limit` の文言 (枠の空け方の正本) より狭い (L-003) (scope: feature)

- **観察**: spec は案内を「応答待ちのセッションを終了する」とする (`spec.md:87`, `:164`)。既存の `labels.ts:35` の `session-limit` は「プロンプト待ち・応答待ち・中断は『終了』、起動中・応答中・承認待ちは『強制終了』、中断だけでは空かない、停止処理中も数える」と X-5 FR-005 / FR-011 に沿って書いている
- **同種事象探索**: `Grep "session-limit" src/renderer/src/features/session/labels.ts` → 1 件 (`:35`)
- **リスク/影響**: 同じ「枠の空け方」に、内容の違う 2 つの文言ができる
- **推奨アクション**: 上限時の案内は `SESSION_REJECT_LABELS['session-limit']` (または共通の部分文字列) を再利用し、spec の記述は「X-5 の拒否文言と同じ空け方」と参照形にする
- **根拠**: ARCH-7、keep-spec-small (規則の正本は 1 か所)
- **scope 根拠**: FR-007 / FE-011 で直せる

### [Low] 新しい用語の canonical な英語表記と識別子の対応が glossary の追随で決まっていない (L-004) (scope: feature)

- **観察**: SH-001 (`tasks.md:11`) は日本語の 4 語 (監視ビュー / 直近の活動 / 情報密度 / 枠の使用数) だけを挙げる。glossary は見出しを canonical な英語表記とする規約である (`docs/glossary.md:17`)。識別子は `statusSince` / `density` / `slotUsage` / `deriveActivity` / `Activity` が予定されている (`data-model.md:9-46`)。spec の Key Entity「状態に入った時刻」(`spec.md:202`) と、charter の用語「没入ビュー」は SH-001 の対象外である
- **同種事象探索**: `Grep "没入|Immersive|Monitoring view|slot" docs/glossary.md` → 0 件
- **推奨アクション**: SH-001 で各語の英語見出しと識別子を対応づける。例: Monitoring view / Recent activity (`Activity`) / Density / Slot usage (`slotUsage`。Concurrency limit との関係を Counterexamples に書く) / Status since (`statusSince`)。「没入ビュー」は glossary に足すか、spec で「表示中セッションのペイン」と言い換える
- **根拠**: Principle XIV / XV、ARCH-7
- **scope 根拠**: SH-001 で直せる

### [Low] 実機計測が読む環境変数が discovery の追随対象に挙がっていない (L-005) (scope: feature)

- **観察**: 実機計測は `CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` / `CLOSTA_PERF_PROMPT` を読む (`research.md:49-50`, `tasks.md:76`, `quickstart.md:24`)。SH-090 の discovery 更新 (`tasks.md:84`) は「実機計測の行」だけで、キーの一覧に触れない。リポジトリに `.env.example` は無い (Glob `.env*` → 0 件)
- **同種事象探索**: `Grep "CLOSTA_[A-Z_]+" docs/discovery.md` → 1 件 (`:232` の `CLOSTA_E2E` だけ)
- **推奨アクション**: discovery の Build / Test / Lint 表の実機計測の行に、3 つのキーと既定値を併記する
- **根拠**: ARCH-6
- **scope 根拠**: SH-090 で直せる

### [Low] `slotUsage` の単体の観点に「失敗 (`error`) で生存フラグが true の行を数える」が無い (L-006) (scope: feature)

- **観察**: data-model は「`error` でも生存フラグが true の間は数える」と明記している (`data-model.md:42`)。SH-003 の `slotUsage` の観点は「`launching` / `done` / `interrupted` を数え、生存フラグ false を数えない」だけである (`tasks.md:17`)。H-003 についても、現行の FE-012 の観点 (`tasks.md:55`) は再描画の回数を測れず、設計の欠陥を検出できない (H-003 の推奨アクションに含めた)
- **同種事象探索**: `Grep "error" specs/010-session-monitoring-view/tasks.md` → `slotUsage` の観点に 0 件
- **推奨アクション**: SH-003 に「`error` かつ生存」と「kill 済みでまだ生存 (`killed: true`, `claudeAlive: true`)」の 2 ケースを足す (M-001 の `countOccupying` との一致確認と同じテストで行う)
- **根拠**: X-5 FR-005、H (テスト戦略)
- **scope 根拠**: SH-003 で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `密度\|compact\|comfortable\|没入` in docs/domains | 4 | docs/domains/ui/charter.md:42, :76-77, :102-105 / docs/domains/session/charter.md:92 |
| H-002 | `e2e` in eslint.config.mjs / .dependency-cruiser.js / playwright.config.ts (`perf` は 0 件) | 7 | .dependency-cruiser.js:138,140,141 / eslint.config.mjs:169,170,177 / playwright.config.ts:16 |
| H-003 | `useThrottledValue\|末尾 1 件\|selector で選び` in specs/010 | 3 | research.md:21 / tasks.md:48-49 / plan.md:133 |
| M-001 | `MAX_CONCURRENT_SESSIONS` in src / `countOccupying` in specs/010 | 4 / 0 | src/domain/session/concurrency.ts:13,32 / concurrency.test.ts:3,7 / labels.ts:2,35 |
| M-002 | `Background task\|Hook` in docs/domains | 1 | docs/domains/ui/charter.md:177 |
| M-003 | `先頭 1 行\|最後の text part\|末尾が user` in specs/010 | 5 | spec.md:84, :159 / data-model.md:25-26 / tasks.md:14 |
| M-004 | `全角\|VIII` in specs/010 | 1 | plan.md:43 |
| L-001 | `data-attention` in src | 0 | — |
| L-002 | `inFlight === 0` in running-session-store.ts | 1 | running-session-store.ts:452 |
| L-003 | `session-limit` in labels.ts | 1 | labels.ts:35 |
| L-004 | `没入\|Immersive\|Monitoring view\|slot` in docs/glossary.md | 0 | — |
| L-005 | `CLOSTA_[A-Z_]+` in docs/discovery.md | 1 | docs/discovery.md:232 |
| L-006 | `error` in tasks.md の slotUsage の観点 | 0 | — |

## Verdict

- Critical: 0
- High: 3
- Medium: 4
- Low: 6
