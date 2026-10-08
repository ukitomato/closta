# ui-coverage-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

## 初回読了 viewpoint

- FR/SC:
  - FR-014: 対応表の `後続: O-4` の行の書き換え (本 reviewer の主対象)
  - FR-001 / FR-002: A `result`・D `launch-failure` の行
  - FR-003 / FR-005: D に足した `meter` の行
  - FR-004 / FR-007 / FR-011 / FR-013: A `status` / `api_retry` / `task_progress` の行 (SystemEventRow)
  - FR-006: A `rate_limit_event` / F Quota banner
  - FR-008 / FR-009: A `result`、E `get_context_usage` / `get_session_cost` / `get_usage`、F Context display / Cost meter
  - FR-010: A `status`・A `init` (`permissionMode`)
  - FR-012: A `tool_progress` / `thinking_tokens`、F Thinking indicator
  - FR-016: roadmap の O-4 / O-6 / I-2 / I-3 の行
  - SC-005 (O-4 の行が消える)、SC-003
- touched files に当たる charter / Confirmation:
  - ui charter In scope「シェルの部品が SDK の emit を表示するときは、その行の割当にその部品を書く」(charter.md:70-77)
  - ui charter Out of scope「他 domain の操作 UI」(charter.md:87-94)、KPI「表示網羅」
  - AD-044 Decision 1 / 2 / 3 / Confirmation
  - AD-047 Decision 4 / Consequences
  - Constitution XII Verification (Manual)
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer。本 reviewer は無害化と許可リストを扱わない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: owner は architecture-reviewer。ui charter の Out of scope との照合は G (UC-6) で行った
- D. Constitution / ADR drift: 該当なし: owner は architecture-reviewer。AD-044 / AD-047 の条文の drift は扱わない
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: 該当なし: owner は convention-reviewer
- G. optional reviewer 範囲: Critical:0 High:0 Medium:3 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-4 は対応表の `後続: O-4` の 10 行を書き換えた。
- A 節の 7 行 (`result` / `status` / `api_retry` / `rate_limit_event` / `tool_progress` / `task_progress` / `thinking_tokens`) を `実装済み (実行中)` にした
- E 節の 3 行 (`get_context_usage` / `get_session_cost` / `get_usage`) を `表示不要` にした
- D 節に `meter` の行を足し、F 節の 6 要素の使い道を直した

割当に書いた element (FailureBanner / UsageTab / ContextCostMeter / SystemEventRow / UnsafeModeBanner / OverviewTab / ToolResultMarks / ThinkingIndicator / QuotaBanner) は、すべてコードにあり描画されていることを確かめた。`後続: O-4` は 0 件。Tier の値が変わった行は無い。SDK の版も変わっていない。

残るのは次の 4 つ。
- Tier A を `表示不要` にした根拠の前提が確かめられていない
- 実機での形の確認が済んでいないことと、その後の持ち主が、どの行にも書かれていない
- init の行の経路と Tier の理由が古いまま
- 隣の行の割当と備考が追随していない

## 観点ごとの結果

- **UC-1**: 描画を足した分岐と対応表の行は同じ PR で直っている。描画を足した分岐は次のとおり: `live-signals.ts` の分岐、SystemEventRow の 3 つの category と task の進み具合 (`thread.aui.tsx`)、ToolResultMarks の経過時間 (6 つの tool の表示すべて)、`LiveThinkingIndicator` (2 つの viewport)、CenterBanners、UsageTab、ContextCostMeter、OverviewTab の現在の権限モード。逆向き (`実装済み` なのに描画が無い) は 0。ただし隣の行に追随の漏れがある (L-002 / M-002)
- **UC-2**: 該当なし。`package.json` / `pnpm-lock.yaml` は touched-files・scope のどちらにも無く、冒頭の `SDK: 0.3.270` も変わらない
- **UC-3**: M-001 / M-003 / L-001
- **UC-4**: 該当なし。diff の中で Tier の値が変わった行は 0 (A・D・E・F の差分の行を全部読んだ。D に足した `meter` は A)。O-4 の Tier B の行 (`tool_progress` / `task_progress` / `thinking_tokens` / `get_session_cost` / `get_usage`) は、無くても判断を誤らない情報で、引き下げではない。init の Tier B の理由が古くなった点は M-002
- **UC-5**: 新しい `後続` の行は 0。O-4 が他の feature に預けた事項は、持ち主の行の範囲に書かれている:
  - subagent の中の tool の経過時間 → O-6「実行中の subagent の入れ子」(roadmap.md:363)
  - 圧縮の行と `compact_boundary` の統合 → O-6「O-4 から」(roadmap.md:363)
  - 警告の帯の強制と文言 → I-2 / I-3 (roadmap.md:387-388)
  - 実機の確認 (V-4) の結果を反映する持ち主だけが無い (M-003)
- **UC-6**: 該当なし。監視ビューの行の短い理由と読み上げ (session の操作 UI) は備考で触れているだけで、割当の element にしていない (ui-coverage.md:48,175)。SDK の emit なのに「他 domain の画面」として外した行も無い
- **UC-7**: 該当なし。本 PR は O-4 を completed にしていない (spec.md:8 `status: reviewing`。roadmap.md:361 に「完了」は無い)。`後続: O-4` は Grep で 0 件。M3 の件数 24 → 19 は quickstart-results.md:44 の記録で、本 reviewer は実行していない。マージ後の completed のコミットより前に、M-001 / M-003 の持ち主を決める必要がある

## Findings

### [Medium] Tier A の `get_context_usage` を `表示不要` にした根拠 (推定の Context display) の前提が確かめられておらず、行に見直しの条件と持ち主が無い (M-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:196` の割当は `表示不要: 制御要求を呼ばない。コンテキストの使用量は…推定する (U-3)`、備考は「Context display は…推定で実装済み (経路: 実行中)」で、この推定を `表示不要` の根拠にしている。推定には次の制約があるが、備考はどれにも触れていない。
  - (a) 精度 (`/context` との差 ±10%) は `quickstart-results.md:61` (V-4 #3) で「未確認」
  - (b) 主モデルの照合の前提 (`modelUsage` のキーの形) は「誰も観察していない」(`data-model.md:226`)
  - (c) 目盛りは最初の result の後にしか出ない (`ContextCostMeter.tsx:34-35`、`data-model.md:228`)。セッションの最初のターン (tool を何度も呼ぶ長い loop になりうる) の間は、コンテキストの情報が一切出ない

  roadmap の O-4 の行 (`roadmap.md:361`) は V-4 #3 の結果を「data-model §2 / §4 を直すかは利用者の確認の後に決める」としか書いていない。この対応表の行を見直すことも、O-4 の完了後にどの feature が持つかも書いていない
- **同種事象探索**: `^\| [^|]+ \| [^|]+ \| A \| 表示不要` で 1 件 (`docs/ui-coverage.md:196` のみ)
- **リスク/影響**: A・C・E 節で唯一の、Tier A (コンテキスト) の `表示不要` の行である。V-4 #3 で推定が外れれば `表示不要` (AD-044 Decision 1 の「重複」) の根拠が崩れ、M3 の件数を減らした判断 (24 → 19 の 1 件) も確かめていない前提の上に立つことになる。O-4 が完了すると、この行を見直す持ち主がいない (AD-028 §5)
- **推奨アクション**:
  1. `ui-coverage.md:196` の備考に「推定の精度は 014 quickstart V-4 #3 で未確認。最初の result の前 (セッションの最初のターン) は出ない」を足す
  2. 見直しの条件を書く。例:「±10% を超えたら、推定の式を直すか、`get_context_usage` を呼ぶか (項目 14 の許可リストの追加と ADR。AD-047 Consequences) を <持ち主> が判断する」
  3. その持ち主を roadmap の該当する行に書く (M3 の ui の feature。例は O-6 の行の「O-4 から」)。または V-4 #3 を確かめるまで O-4 を completed にしない
- **根拠**: AD-044 Decision 1 (表示不要 = 内部制御・重複) / Decision 2 (迷う行は備考に理由) / AD-028 §5 / Constitution XII Verification (Manual)
- **scope 根拠**: `docs/ui-coverage.md` と `docs/roadmap.md` はこの PR の touched files

### [Medium] A `init` の行の経路が「なし」のまま。Tier B の理由も O-4 自身の設計と食い違う (M-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:49` (`SDKSystemMessage` / `init`) は `後続: O-5` で、経路は `なし`。ところが O-4 は init の `permissionMode` を読み (`live-signals.ts:366-370` → `observePermissionMode` → `meter` の `permission-mode` と権限モードの行)、実行中に権限モードの行 (SystemEventRow)・警告の帯 (`CenterBanners.tsx:65-67`)・「概要」の現在の権限モード (`OverviewTab.tsx:108-113`) に出している。備考は「表示は権限モードの行と警告の帯」と書きながら、経路の列は「表示していない」を意味する `なし` のまま。

  さらに Tier B の理由「起動の設定は起動のダイアログ (X-4) で利用者が選んでいる」は、O-4 の Edge Case (`spec.md:173`。init の `permissionMode` が起動の直後から安全 3 値の外 =「アプリが選んでいない権限モード」) と食い違う
- **同種事象探索**: 一部を表示している `後続` の行が経路にその表示を書く慣例を、`^\| … \| [AB] \| 後続: … \| (過去ログ|実行中|両方) \|` で 17 件確かめた (`ui-coverage.md:51,111,124,126,127,129,130,131,133,134,137,138,139,144,145,146,147`)。この慣例に反しているのは `ui-coverage.md:49` の 1 件
- **リスク/影響**: 承認に直結する情報 (Tier A の概念) の表示経路が、対応表では「表示していない」と読める。O-5 がこの行を `実装済み` に書き換えるとき、init の権限モードの経路を落としたり、理由を誤読したりしうる。項目 21 は経路の列と割当の整合を見ない (AD-044 Decision 4)
- **推奨アクション**: `ui-coverage.md:49` の経路を `実行中` にする。Tier の理由を「`permissionMode` (承認に直結) は O-4 が権限モードの行・警告の帯・概要で実装済み (実行中)。残りのフィールドは起動の設定で利用者が選んでいる / O-5」のように分けて書く
- **根拠**: AD-044 Decision 2 (迷う行は備考に理由) / ui-coverage.md の凡例の「経路」(`なし` = 表示していない) / ui charter:73-77
- **scope 根拠**: touched file (`docs/ui-coverage.md`)

### [Medium] O-4 の `実装済み` の行が、実機での形の確認 (V-4) が済んでいないことを書いておらず、結果を反映する持ち主もいない (M-003) (scope: feature)

- **観察**: `quickstart-results.md:52-68` では V-4 の 10 項目がすべて「未確認」(#1 失敗の形、#4 `utilization` / `resetsAt` の単位、#5 権限モードが `status` と `init` のどちらで届くか、#6-#8 経過時間・思考・圧縮・task の進み具合)。それでも次の行は無条件に `実装済み` で、備考に V-4 への言及が無い。
  - Tier A: `ui-coverage.md:48` (result)、`:52` (status)、`:53` (api_retry)、`:77` (rate_limit_event)
  - Tier B: `:62`、`:67`、`:69`

  O-2 は同じ状況で、行に「実データに残るかは O-2 quickstart V-4 で確かめ」と書き (`ui-coverage.md:58,60,64-66`)、結果の反映を O-6 の範囲に入れていた (`roadmap.md:363`「O-2 の実機の目視 (quickstart V-4) の結果の反映」)。O-4 の分は `roadmap.md:361` に項目を並べただけで、「直すかは利用者の確認の後に決める」以上の持ち主の feature が無い。同じ行が「本番で知らない形を後から知る観測点が無い (RK-14)」とも書いている
- **同種事象探索**: `V-4` で `docs/ui-coverage.md` に 5 件 (`:58,:60,:64,:65,:66`。どれも O-2 の V-4)。014 の V-4 に触れた行は 0 件
- **リスク/影響**: 実機の形が違ったとき (知らない失敗がすべて `provider-error` に倒れる、decoder が `meter` を捨てる) でも、対応表は `実装済み` のまま残る。それに気づく観測点も、直す持ち主もいない。なお観察できた緩和策があるので Medium に留めた:
  - 失敗の理由が分からなくても FailureBanner は出る (表示は失われず、区別の精度だけが落ちる)
  - `toUtilizationPct` / `toResetsAtSec` は両方の単位を受ける (`meter.ts:214-233`)
  - 権限モードは `status` と `init` の両方から観測している (`live-signals.ts:260,369`)
- **推奨アクション**:
  1. 上の 7 行の備考に「実機の形は 014 quickstart V-4 #n で未確認」を足す (O-2 の書き方にそろえる)
  2. roadmap で、V-4 の結果を反映する持ち主の feature を決める。たとえば O-6 の行に「O-4 の実機の目視 (014 quickstart V-4) の結果の反映 (data-model §1 / §2 / §4 と対応表の行)」を足す。または V-4 を確かめるまで O-4 を completed にしない
- **根拠**: AD-028 §5 (持ち主のいない延期を残さない) / AD-044 Consequences (後続 feature の行に割当の範囲を書く) / Constitution XII Verification (Manual)
- **scope 根拠**: touched files (`docs/ui-coverage.md`, `docs/roadmap.md`)

### [Low] `rate_limit_event` の行と F の Quota banner の行が、超過分の表示を書いていない (L-001) (scope: feature)

- **観察**: `ui-coverage.md:77` は「制限の種類・使用率・解除の時刻を出し」「`overage*`…は出さない」と書き、F の `:316` も超過分に触れていない。実装は `isUsingOverage` を運び (`live-signals.ts:398`)、帯に「超過分を使っています。」を出す (`quota-banner.ts:49`、`shell/labels.ts:142`)。data-model §2 (`data-model.md:66`) は `isUsingOverage` (運ぶ) と `overage*` (運ばない) を分けているが、対応表の字面だけでは超過分を隠していると読める
- **同種事象探索**: `quotaOverage|usingOverage|isUsingOverage` で src に 26 件。表示に効くのは `quota-banner.ts:49` と `CenterBanners.tsx:107`。対応表の言及は 0 件
- **推奨アクション**: `:77` を「制限の種類・使用率・超過分を使っているか (`isUsingOverage`)・解除の時刻を出す。`overageStatus` などの他の `overage*`…は出さない」と直す。`:316` にも同じ趣旨を足す
- **根拠**: ui-coverage.md の凡例 (割当と備考は表示の実態を書く)
- **scope 根拠**: touched file

### [Low] O-4 の element に値を渡すようになった隣の行の割当が追随していない (L-002) (scope: feature)

- **観察**:
  - (1) `ui-coverage.md:45` (SDKAssistantMessage) の割当は `Thread / MarkdownText / Reasoning / ToolGroup (両方)` のまま。O-4 で主ループの assistant の `usage` が ContextCostMeter の分子になり (`live-signals.ts:206-211`)、`error` が失敗の理由の材料になった (`:329-331`)。F の Context display (`:263`) は使い道に `A SDKAssistantMessage` と書いており、指した先の行と合わない
  - (2) `:79` (SDKPermissionDeniedMessage) と `:173` (D permission-denied) は `DeniedNotice` だけ。UsageTab が「聞かれずに拒否された操作」の件数を `denied` の長さから出している (`UsageTab.tsx:50,129-132`)
- **同種事象探索**: O-4 の element に値を渡すが割当に載っていない行は 3 件 (`:45`, `:79`, `:173`)。`:46` (SDKUserMessage。tool の結果で経過時間の保留を取り消すだけで、表示には出ない) は数えない
- **推奨アクション**:
  - `:45` の割当に `ContextCostMeter (実行中)` を足し、備考に「`usage` (入力側) はコンテキストの推定、`error` (列挙) は失敗の理由の材料。O-4」と書く
  - `:79` / `:173` に `UsageTab` (件数) を足す
- **根拠**: ui charter:73-77 (シェルの部品が SDK の emit を表示するときは、その行の割当にその部品を書く) / AD-044 Decision 1
- **scope 根拠**: touched file

### [Low] (H) ui-coverage-reviewer の発火条件が、Quota banner の表示を決める `quota-banner.ts` を拾わない (L-003) (scope: feature)

- **観察**: `.specify/spec-gate/reviewers.yml:178-206` は shell について `shell/panel-tabs.ts`・`shell/labels.ts`・`shell/**/*.tsx` だけを見る。`src/renderer/src/features/shell/quota-banner.ts` は Tier A の `rate_limit_event` の帯を、どの `status` で出し、いつ消すかを決める純関数だが、どれにも当たらない。`src/renderer/src/features/session/useSessionMeters.ts` も当たらない。本 PR は `meter*.ts` を足した (`reviewers.yml:187-188`) が、この 2 つは足していない
- **同種事象探索**: Glob `src/renderer/src/features/shell/*.ts` で 14 件。SDK の emit の表示の判定を持つのは `quota-banner.ts` の 1 件 (他はレイアウト・フォーカス・palette とテスト)
- **リスク/影響**: `quota-banner.ts` だけを変える PR (たとえば `rejected` を出さなくする) では本 reviewer が起動せず、「表示の変更と対応表の更新が同じ PR にあるか」を誰も見ない
- **推奨アクション**: `auto_invoke_patterns` に `src/renderer/src/features/shell/quota-banner.ts` (と `src/renderer/src/features/session/useSessionMeters.ts`) を足す。足さない場合は、`session/labels.ts` と同じく、ファイルの側に「変えるときは対応表の行を見る」と書く
- **根拠**: Constitution XII Verification (Manual。表示を足す PR に対応表の更新が含まれるか) / AD-044 Consequences
- **scope 根拠**: touched file (`.specify/spec-gate/reviewers.yml`)

**H の補足**:
- M-001 / M-002 / M-003 / L-001 / L-002 は機械では検出できない。経路の列・備考・Tier の理由は項目 21 の範囲外 (AD-044 Decision 4) で、本 reviewer の手検証だけが見ている
- 既存の振る舞いを壊していない根拠:
  - A・C・E 節の行の集合は差分で変わっていない (diff の 767-890 行を全部読んだ。D は 8 → 9)
  - 項目 21 は ok (`quickstart-results.md:41-46`。本 reviewer は実行していない)
- 本番で SDK の形がずれたときの観測点が無い (RK-14) ことの影響は M-003 に含めた

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `^\| [^|]+ \| [^|]+ \| A \| 表示不要` (docs/ui-coverage.md) | 1 | docs/ui-coverage.md:196 |
| M-002 | `^\| … \| [AB] \| 後続: [A-Z]-\d+ \| (過去ログ\|実行中\|両方) \|` (慣例の確認) | 17 | docs/ui-coverage.md:51,111,124,126,127,129,130,131,133,134,137,138,139,144,145,146,147 (違反は :49 の 1 件) |
| M-003 | `V-4` (docs/ui-coverage.md) | 5 | docs/ui-coverage.md:58,60,64,65,66 (どれも O-2。014 の V-4 は 0) |
| L-001 | `quotaOverage\|usingOverage\|isUsingOverage` (src) | 26 | src/renderer/src/features/shell/quota-banner.ts:49 / CenterBanners.tsx:107 (表示に効くのは 2) |
| L-002 | O-4 の element に値を渡すが割当に載っていない行 | 3 | docs/ui-coverage.md:45,79,173 |
| L-003 | Glob `src/renderer/src/features/shell/*.ts` | 14 | src/renderer/src/features/shell/quota-banner.ts (判定を持つのは 1) |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
