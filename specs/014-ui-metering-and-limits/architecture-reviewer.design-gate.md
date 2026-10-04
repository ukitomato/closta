# architecture-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: architecture-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-006 すべて
- 該当 charter / Confirmation: session charter (:56-64、:220-226)、ui charter (:63、:69)、`_overview.md` (:88-97)、AD-044 Decision 1/2/3/6、AD-041 (g) と Consequences / Confirmation、AD-043 Decision 2/4、AD-036、Constitution III / IV / IX / XII / XIII / XIV、proposed の AD-046 / AD-047 / 013 data-model
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:5 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y の担当範囲 (AD-044 の解釈は D の L-004)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

確かめたコードの事実: `sdk-agent-session.ts:527-542` は失敗をすべて `fail('provider-error')`、`fail` は `postStatus()` も呼ぶ (:315-320。理由キーは状態通知で main を経由。`status-update.ts:24,39`)、`toSystemEventMessage` は過去ログ (`transcript.ts:182`) と共有、`LAUNCH_REJECT_LABELS` は `launchFailureLabel` と共有 (`labels.ts:16,51`)。

## Findings

### [High] X-1 FR-020 / US-4 AC6 の「rate limit・クレジット不足などは `provider-error`」を上書きしているのに記録が無い。根拠に挙げた「X-1 FR-030」は X-1 の spec に存在しない (H-001) (scope: feature)

- **観察**: 005 spec:341-345 (FR-020)・:180-182 (US-4 AC6)・:206-207、005 data-model:156 は、クレジット不足・rate limit などを `provider-error` に保持すると定める。014 はこれを分けるが「読み替える箇所」が無い。「X-1 FR-030」は 005 spec に 0 件 (gate の JSON と `session-core.ts:324,333` のコメントだけ)。data-model §1 にクレジット不足の行が無く、今の「クレジットを確認」の案内が消える
- **同種事象探索**: `FR-030` 10 件
- **推奨アクション**: 「X-1 FR-030」を「X-1 FR-020 / US-4 AC6 (コードでは V-11)」に。AD-047 に読み替える箇所の節 (FR-020 / US-4 AC6 / 005 data-model §6 / glossary の FailureReason)。クレジット不足のキーを決める
- **根拠**: AD-031 / 改定手順 1、AD-041 の先例

### [High] task の進み具合のために、セッションスレッドと renderer の両方に task ごとの状態を持たせている。AD-044 Decision 6 と O-2 の利用者の決定 (状態は保持しない) に反する (H-002) (scope: feature)

- **観察**: data-model.md:57 / tasks.md:41 は「行がある task だけ」emit (セッションスレッドが id の集合を持つ)、:77 は renderer に `taskProgress`。AD-044 Decision 6 (:84)、session charter (:222-226)、`_overview.md:91-95`、`system-event.ts:21` は状態を持たない
- **同種事象探索**: 014 の中に 4 件、src に 0 件
- **推奨アクション**: 既存の `task:<task_id>` の行に `opens: false` の更新として流す (`mergeSystemEvent` が行の無い id を捨てる)。数は `detail` に数だけで。`meter` の `task-progress` と保持を消す
- **根拠**: AD-044 Decision 6、session charter、`_overview.md`

### [Medium] U-1 の範囲が「契約」だけで、session が持つ操作 UI (監視ビューの行・稼働中のストア) の変更が承認の対象に入っていない (M-001) (scope: feature)

- **推奨アクション**: U-1 と FR-016 に「監視ビューの行の短い理由と再ログインの導線、稼働中のストアの `meters`」

### [Medium] 新しい category を過去ログの経路にも出すのか決まっていない。`toSystemEventMessage` は過去ログの変換と共有されている (M-002) (scope: feature)

- **同種事象探索**: `toSystemEventMessage(` 2 件 (`sdk-agent-session.ts:555` / `transcript.ts:182`)
- **推奨アクション**: 行の組み立てを agents に置き `toSystemEventMessage` に足さない。`transcript.ts` が新しい category から行を作らない回帰テスト

### [Medium] 圧縮の表示が O-6 の範囲と重なり、関係が決められていない (M-003) (scope: feature)

- **推奨アクション**: 申し送りの表に O-6。O-4 は進み具合、O-6 は会話の区切り。統合するか並べるかの判断の義務を O-6 の行に

### [Medium] 権限モードを中央のヘッダと「概要」の両方に出すことが、O-7 data-model §5 の「中央のヘッダと重なる項目は出さない」に反する (M-004) (scope: feature)

- **推奨アクション**: 出す場所を 1 つに絞るか、O-7 §5 を改めると明記

### [Medium] KPI「並列時の滑らかさ」の観測点 `receivedMessages` の基準が O-4 でまた変わるのに、O-3 への申し送りが無い (M-005) (scope: feature)

- **推奨アクション**: `meter` は数えない / 行は数える。roadmap の O-3 (O-8) の義務 (c) に注記

### [Medium] 再ログインの導線の規則が spec の中で食い違っている (M-008) (scope: feature)

- **推奨アクション**: data-model §1 で決め、SC-001 と FR-002 を参照の形に

### [Medium] 安全 3 値の外の権限モードを観測したとき「(アプリの外で変更)」と原因を決めつけていて、AD-041 の「昇格経路 0 件」との関係が書かれていない (M-007) (scope: feature)

- **推奨アクション**: 原因に触れない文言。AD-041 を参照し、逸脱として扱うかを AD-047 に。ExitPlanMode の後の `status` が安全 3 値のままの fixture

### [Medium] SC-004 の E2E が計量を流さないので、「負荷を上げない」を測れていない (M-006) (scope: feature)

- **推奨アクション**: 偽の supervisor に計量を流すか、E2E を外して agents の単体だけに

### [Low] 起動の語彙 `LaunchFailureReason` / `SessionLaunchRejectReason` に、ターンの失敗が混ざる (L-001) (scope: feature)

- **同種事象探索**: `SessionLaunchRejectReason` (src) 12 件
- **推奨アクション**: glossary を「起動とターンの失敗」に。AD-047 Consequences に 1 行

### [Low] 増えた失敗の理由のキーは状態通知として main を経由するのに、AD-047 に書かれていない (L-002) (scope: feature)

- **推奨アクション**: AD-047 Consequences に「値の集合だけが広がる」

### [Low] `meter` の `models` の配列に上限が無い (L-003) (scope: feature)

- **推奨アクション**: 上限 (16 など) を agents と decoder で

### [Low] Tier A の `get_context_usage` を `表示不要` にする理由を、備考の Tier の判断として残す (L-004) (scope: feature)

- **推奨アクション**: 備考に「Context display は result の推定で実装済み」「内訳は出さない」「AD-047 Decision 4」

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `FR-030` | 10 | spec.md:53,80,159,216,227 / data-model.md:7 / tasks.md:22 / plan.md:58 / 0047:28 / roadmap.md:256 |
| H-002 | `taskProgress\|task-progress\|行がある task` | 4 | data-model.md:39,57,77 / tasks.md:41 |
| M-001 | `features/session/` (plan / tasks) | 4 | plan.md:22,131 / tasks.md:24,30 |
| M-002 | `toSystemEventMessage(` | 2 | sdk-agent-session.ts:555 / transcript.ts:182 |
| M-003 | O-6 との関係 | 0 | — |
| M-004 | `中央のヘッダと「概要」` | 4 | spec.md:131,184 / data-model.md:131 / tasks.md:42 |
| M-005 | `receivedMessages` (014) | 0 | — |
| M-006 | `multi-session.spec.ts` (014) | 1 | spec.md:219 |
| M-007 | `アプリの外で変更` | 2 | spec.md:148 / data-model.md:131 |
| M-008 | `再ログイン` (014) | 6 | spec.md:161,216 / data-model.md:15,18,22 / tasks.md:24 |
| L-001 | `SessionLaunchRejectReason` (src) | 12 | labels.ts / LaunchDialog.tsx / running-session-types.ts / session-launch-service.ts / agent-session.ts |
| L-002 | `isLaunchFailureReason` (src) | 3 | status-update.ts:39 / supervisor-protocol.ts:101 / session-event-decoder.ts:81 |
| L-003 | `models` の上限 | 0 | — |
| L-004 | E 節の Tier A で `表示不要` | 0 | — |

## Verdict

- Critical: 0 / High: 2 / Medium: 8 / Low: 4
