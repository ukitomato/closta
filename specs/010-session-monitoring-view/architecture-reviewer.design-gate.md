# architecture-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-02T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC (本 feature で実装または影響を受けるもの):
  - FR-001〜FR-004: 承認待ち・失敗の強調、見出しとナビの件数、App の寿命の live region。SC-001
  - FR-005〜FR-007: 経過時間、直近の活動 (購読の手前で間引く)、枠の使用数 (`countOccupying`)。SC-002
  - FR-008〜FR-009: 情報密度。compact のレイアウトは Principle VIII の対象。SC-003
  - FR-010: renderer の中で閉じる。SC-006 (行の描画回数を含む)
  - FR-011 / FR-012: 負荷 E2E と実機計測 (`perf/`)。SC-004 / SC-005
  - FR-013: glossary・session / ui charter・`_overview.md`・roadmap・discovery の追随
- touched files に該当する charter / Confirmation:
  - session charter: Scope「監視ビュー」と Out of scope「監視ビューの見た目と element 選定 → ui」、Journey 3、KPI「並列時の滑らかさ」
  - ui charter: In scope「情報密度の切替」と Out of scope「他 domain の操作 UI → 各 domain」、Journey 4、Open Questions
  - isolation の不変条件「隔離状態は一目で分かること」(ui charter `:126`)
  - `_overview.md`: 帰属の判断根拠
  - AD-038: D2・D3・D4・D5 と Confirmation
  - AD-043: Decision 3・4・5
  - AD-023 §5、AD-020 Consequences、AD-035 Consequences、AD-034
  - Constitution VIII / XIII / XIV / XV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲。実機計測の env と成果物の扱いも同 reviewer に委ねる
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲。`toActivityLine` は `sanitizeBody` を行単位で使い、`unknown` を `''` に倒す (data-model §2)。この点は確認済み
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / database は各 optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:1

## スコープ要約

R1 の後の改訂で、ストアに `statusSince`・`activity`・`density` を足し (直近の活動は購読の手前で 500ms ごとに間引く)、枠の数え方を domain の `countOccupying` にそろえ、`perf/` に AD-038 D2 と同じ分離を掛ける表を足し、ui charter・`_overview.md`・isolation のバッジの置き場を記録の追随に入れた。renderer の外は変えない。ADR は起票しない。[USER 決定 2026-10-02] の 7 件は前提として扱う。

### R1 の High の解消状況

| R1 ID | 状態 | 根拠 |
|---|---|---|
| H-001 (ui charter の密度と Journey 4) | **resolved** | `spec.md:209`、`plan.md:65`・`:124-125`、`tasks.md:96` |
| H-002 (`perf/` に AD-038 D2 の分離が無い) | **resolved** | `plan.md:174-182`、`tasks.md:12` |
| H-003 (行の中の間引きでは再描画が減らない) | **resolved** | `data-model.md:10`・`:15`、`research.md:21-23`、`plan.md:137`・`:146`、`tasks.md:62`。時計の購読について Low を残した (L-103) |

### R1 の Medium / Low の解消状況

- M-001〜M-004: resolved (M-003 の残りは L-104)
- L-001〜L-006: resolved

## Findings

### [High] 実機計測の「有効な回」を判定するための観測点が設計に無い。SH-032 はこのままでは実装できない (H-101) (scope: feature) — new

- **観察**:
  - FR-012 の有効な回の条件 (`spec.md:200`) は「窓の全期間で 10 本が応答中」かつ「窓の中で届いたメッセージが 100 件以上」。SC-005 は窓の中のメッセージ数の記録を求める
  - perf の制約 (`research.md:49-51`、`tasks.md:85`): renderer の `page.evaluate` だけを使い `app.evaluate` は使わない / 状態の判定は行の `data-*` 属性 / 会話由来のテキストは assert に使わない
  - 表示していない 9 本のメッセージ数は perf から観測できない: renderer の DOM に描かれる本文は表示中の 1 本だけ / 一覧の行の直近の活動は間引かれ値が等しければ書かない / main は本文を運ばない
  - src には本番の composition でストアを外から読む口が無い (renderer の本体に `window.__` 等は 0 件)
  - 行の状態 enum を `data-*` で出すタスクも無い (現状は `data-testid="session-row-status"` だけ。FE-001 / FE-002 が出すのは強調の値だけ)
- **同種事象探索**: `メッセージ数|message count|messageCount|窓の中` → 9 件、いずれも観測の手段を書いていない。`data-[a-z-]+=` in features/session → 行の状態 enum の属性は 0 件
- **リスク/影響**: 計測を実施しても完了と判定できない。実装時に場当たりの観測口 (renderer の本番 composition でストアを `window` に出すなど) が入りうる。それは会話本文を含むストア全体を production-inert のゲートなしで晒し、AD-038 D3 の考え方と逆向きになる
- **推奨アクション**:
  - (a) 行の Root に状態 enum (`data-row-status`) を出し、全セッションの受信メッセージの累計数 (本文を含まない数値) を `data-*` で出す。ストアに件数カウンタ 1 つを足す
  - (b) 窓の中のメッセージ数を有効な回の条件から外す (利用者に諮る)
  - どちらでも「本番の composition にストアを晒す global を作らない」を plan の制約として明記する。ポーリングの間隔も定める (MutationObserver で計測自体が重くなった実績がある)
- **根拠**: spec FR-012 / SC-005、AD-038 D3、AD-034 / AD-043 Decision 4
- **scope 根拠**: plan / data-model / tasks で直せる

### [Medium] App の寿命に置く live region が使う作業フォルダの表示名の供給元が設計に無い (M-101) (scope: feature) — new

- **観察**: `announcements` は作業フォルダの表示名で文を組み、`SessionAttentionAnnouncer` は `App` の寿命に置く。一方、表示名の解決は `SessionScreen` の中の `useFolders()` (コンポーネントごとに IPC の取得・購読を持つ) で行われており、セッション画面以外を開いている間この値はどこにも無い。plan・tasks は供給元を書いていない
- **同種事象探索**: `folderName|表示名` in plan/tasks/data-model/research → 供給元の記述 0 件
- **リスク/影響**: Announcer の中で `useFolders()` を呼ぶと App の寿命の IPC 購読が増える (plan に無い配線)。一覧の読み込み前・失敗時は表示名が `''` になり「と が承認待ちになりました」のような文が読まれる
- **推奨アクション**: (a) 起動の受付時にストアに表示名を写す (renderer の中の値)、または (b) Announcer が `useFolders()` を呼ぶと明記し購読が増えることを記録する。表示名が引けないときの固定の代替語を `labels.ts` に置き、FE-003 に観点を足す
- **根拠**: spec FR-004、USER 決定 2026-10-02 design-gate H-04、ARCH-4
- **scope 根拠**: plan / FE-004 / FE-003 で直せる

### [Medium] 「監視ビューの見た目と element 選定」の持ち主が session charter と ui charter で食い違っている。本 feature はその隙間で見た目を決めているのに、追随で解消しない (M-102) (scope: feature) — new

- **観察**:
  - session charter Out of scope (`:54-55`): 「承認カードや**監視ビューの見た目と element 選定** → `ui` domain」
  - ui charter Out of scope (`:62-63`): 「**他 domain の操作 UI (一覧・登録・選択画面)** → 各 domain が持つ」
  - spec `:39` は session charter 側を引用するが、research R-06 / plan は compact の行のレイアウト・補助情報の出し方・強調の帯を決めている
  - SH-090 の改訂項目にこの食い違いは入っていない
- **同種事象探索**: `見た目と element|操作 UI` in docs/domains → 2 か所が逆向きの帰属を示す
- **リスク/影響**: 監視ビューの見た目の判断は、文書上どちらの domain の feature も持ち主にならない
- **推奨アクション**: SH-090 に 1 行足し、どちらかに揃える。(a) session charter を「稼働中セッション一覧 (監視ビュー) は session の操作 UI」に改める、または (b) 監視ビューの見た目は ui が持つとし、本 feature の R-06 を「O-2 / O-3 で ui が見直す暫定」と roadmap に記録する。spec `:39` も合わせる
- **根拠**: ARCH-2、session / ui charter Out of scope、Principle XIII Manual
- **scope 根拠**: FR-013 / SH-090 で直せる

### [Low] 直近の活動を書き直す契機が `deriveActivity` の入力より狭い (L-101) (scope: feature) — new

- **観察**: `scheduleActivity` の契機は `message` / `permission-request` / `state` / `appendUser` の 4 つ。`pending` が `null` になる経路 (`respond` `:345`、`kill` `:360`、`failure` `:185`) と、状態通知で `view` が変わる経路が入っていない
- **同種事象探索**: `pending: null` in running-session-store.ts → 3 件
- **リスク/影響**: 次の `state` まで「承認を求めている Bash」が残りうる。影響は小さい
- **推奨アクション**: `scheduleActivity` を `trackStatus` と同じ位置から呼ぶ。SH-004 に観点を足す
- **根拠**: AD-023 §5、spec FR-006
- **scope 根拠**: plan / data-model / SH-004 で直せる

### [Low] App シェルの責務宣言と、ナビに承認待ちの件数を直接導く設計が食い違う (L-102) (scope: feature) — new

- **観察**: `App.tsx:13-20` は「画面の切り替えとテーマだけを持ち、業務ロジックを持たない」と宣言している。plan と research R-09 は、`App.tsx` が `attentionCounts` を導いて件数を出すとする
- **推奨アクション**: session feature から `SessionNavBadge` を export し、App は差し込むだけにする。App の冒頭コメントを改める
- **根拠**: ARCH-4、`App.tsx:13-20`
- **scope 根拠**: FE-004 で直せる

### [Low] 1 秒の時計を context で配ると、各行が毎秒再描画される。research の理由づけと SC-006 の描画回数の上限が噛み合わない (L-103) (scope: feature) — new (H-003 の残り)

- **観察**: R-03 は「表記が変わらなければ描画は変わらない」とするが、context を読むコンポーネントは値が変わるたびに再描画される (止まるのは DOM の commit だけ)。FE-012 は行の描画回数を数える
- **リスク/影響**: 時計の tick がテストの窓に入るかで FE-012 が揺れる
- **推奨アクション**: 経過時間の表示を行の子の小さなコンポーネントに切り出してそこだけが時計を読むか、時計を zustand の store にして selector で表記を選ぶ。FE-012 では行本体と経過時間の子の描画回数を分けて数える。R-03 の文を正確に直す
- **根拠**: spec FR-005 / FR-010 / SC-006、R1 H-003
- **scope 根拠**: research / plan / FE-010 / FE-012 で直せる

### [Low] data-model §2 の「末尾から最大 2 件」の 2 件目を使う行が表に無い。FR-006 の前置きの数「3 種」が列挙の 4 つと合わない (L-104) (scope: feature) — new (R1 M-003 の残り)

- **観察**: `data-model.md:21` は「末尾と、その直前の assistant」を見るとするが、表のどの行も直前の assistant を使わない。末尾が tool の呼び出しだけの assistant メッセージで応答中でないときの扱いが決まらない。`spec.md:173` は「3 種」と書き 4 つ列挙している
- **推奨アクション**: 表に行を足すか「直前の assistant」の記述を消す。spec の「3 種」を「4 種」に直す
- **根拠**: ARCH-7、tasks の「値と導出の正本は data-model」
- **scope 根拠**: spec / data-model / SH-003 で直せる

### [Low] Principle XIII の Constitution Check が「独自 element を新設しない」とだけ書き、候補との照合を記録していない (L-105) (scope: feature) — new

- **観察**: 本 feature が新たに足す UI (密度のトグル・件数のバッジ・compact で外した情報の提示) に対し、候補 (ToggleGroup / Badge は未導入、Tooltip は導入済み) との照合が無い。XIII の Exceptions は照合した候補名と不適合理由の記載を求める
- **リスク/影響**: `title` 属性はキーボードのフォーカスや触れた操作では表示されない。導入済みの Tooltip を使わない理由が残らない
- **推奨アクション**: plan の XIII 行または research R-06 に、3 点について照合した候補と採る・採らない理由を書く
- **根拠**: Constitution Principle XIII (Exceptions / Manual)
- **scope 根拠**: plan / research で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `window\.__\|globalThis\.__\|CLOSTA_E2E` in src | 3 (renderer の本体は 0) | src/main/index.ts:95,100 / src/main/app/e2e-capability.ts:38 |
| H-101 | `メッセージ数\|message count\|messageCount\|窓の中` in specs/010 | 9 | spec.md:200,232,243 / research.md:53 / plan.md:189 / tasks.md:87,88,90 / quickstart.md:32 |
| H-101 | `data-[a-z-]+=` in src/renderer/src/features/session | 状態 enum の属性は 0 | RunningSessionList.tsx:128 (data-testid のみ) |
| M-101 | `folderName\|表示名` in plan/tasks/data-model/research | 供給元の記述 0 | data-model.md:66,68 / research.md:33 |
| M-102 | `見た目と element\|操作 UI` in docs/domains | 2 | docs/domains/session/charter.md:54 / docs/domains/ui/charter.md:62-63 |
| L-101 | `pending: null` in running-session-store.ts | 3 | running-session-store.ts:185,345,360 |
| L-102 | `useRunningSessionStoreWiring` in App.tsx | 1 | src/renderer/src/App.tsx:34 |
| L-103 | `useSessionClock\|context` in plan.md | 1 | plan.md:149 |
| L-104 | `直前の assistant\|末尾 2 件\|3 種` in specs/010 | 3 | data-model.md:21 / tasks.md:15 / spec.md:173 |
| L-105 | Glob `src/renderer/src/components/ui/*` | 8 (tooltip あり / toggle・badge なし) | src/renderer/src/components/ui/tooltip.tsx |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 5
- Round inheritance: resolved from 1: 13 / unresolved: 0 / new: 8 (L-103 は R1 H-003、L-104 は R1 M-003 の残り)
