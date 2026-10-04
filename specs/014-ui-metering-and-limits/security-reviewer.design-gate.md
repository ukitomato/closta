# security-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: security-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (A)、FR-003 (B / DoS)、FR-004 / FR-007 / FR-011 (B)、FR-005 (prototype のキー)、FR-006 / FR-009 (範囲外の数)、SC-002 / SC-004 / SC-006
- 該当 charter / Confirmation: AD-047 Confirmation、O-2 data-model §2 (`transcript-guard.ts:28-40`)、AD-034 / AD-043。ui / session charter に security の前提の記述なし
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:1 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:4 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲 (PB-4 は platform-boundary-reviewer)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

会話由来の文字列を読まない許可リスト・状態通知に載せない・IPC 等の差分 0・新しい SDK の呼び出しなし、の骨格は正しい。許可リストで通す値の中身 (文字列の id・列挙・prototype のキー・数の上限・間引きの後始末) と、認証失敗の分類の実測に穴がある。

## Findings

### [Medium] 列挙の照合とキー付きの保持で prototype のキーを弾く規則が `type` にしか書かれていない (M-001) (scope: feature)

- **観察**: data-model.md:66 は `type` だけ `Object.hasOwn`。入れ子の列挙 (`status` / `limitType` / `mode` / 文言の表) と、`toolUseId` / `taskId` ごとの保持の構造が無い。`modelId` の規則は `__proto__` / `constructor` を通す
- **同種事象探索**: `[A-Z_]{3,}\[[a-zA-Z.]+\] \?\?` 5 件 (`system-event.ts:117`、`tool-registry.aui.tsx:36`、`ProviderScreen.tsx:319`、`protocol.ts:91`、`chat/labels.ts:65` は守られている)。正しい型は `transcript-guard.ts:28-40`
- **推奨アクション**: 全ての列挙を agents と decoder の両方で `enumTable` / `inEnum` の方式で照合、知らない値は null / unknown。文言の表も `Object.hasOwn`。id をキーにする保持は `Map` か `Object.create(null)`。テストに `__proto__` / `constructor` / `toString`。既存の `system-event.ts:117` と `tool-registry.aui.tsx:36` は同じ PR か system scope で
- **根拠**: CWE-1321、O-2 data-model §2

### [Medium] 許可リストで通す文字列の id (`toolUseId` / `taskId`) の形が agents 側で決まっておらず、renderer 側も具体的な値が無い (M-002) (scope: feature)

- **観察**: agents の検証は `modelId` だけ。`modelId` の規則は `scheme://user:token@host/...` を通す
- **同種事象探索**: `hook_id|task_id` (system-event.ts) 8 件 (O-2 も長さの検査なし)
- **推奨アクション**: `^[A-Za-z0-9_-]{1,128}$` などを正本に、agents と decoder で同じ定数 (domain の `meter.ts`)。`modelId` は `//` を含むものと `mayCarrySecret` が true のものを落とす。テスト
- **根拠**: CWE-20 / CWE-532 / AD-047 Decision 2

### [Medium] 数の検証が `Number.isFinite` かつ 0 以上だけで、上限と単位が無い。`resetsAt` が大きいと日時の書式化が投げ、renderer に ErrorBoundary が無い (M-003) (scope: feature)

- **観察**: `resetsAt` の単位が無い。`Intl.DateTimeFormat` は Invalid Date で `RangeError`。ErrorBoundary 0 件で root が unmount される
- **同種事象探索**: 日時の書式化 3 件、ErrorBoundary 0 件
- **推奨アクション**: 数ごとの単位と上限 (`resetsAt` は epoch 秒で 0 < x < 1e11 など)。書式化の前に `Number.isNaN(date.getTime())`。テストに `resetsAt: 1e300` / `utilization: 1e9`
- **根拠**: CWE-20 / CWE-248 / Principle IX

### [Medium] 間引きの範囲と後始末が決まっていない。`task_progress` は間引かれず、tool ごとの状態は上限なし、終了後に予約した送信が残る (M-004) (scope: feature)

- **同種事象探索**: `setTimeout` (sdk-agent-session.ts) 1 件 (:330。期限で解決する)
- **推奨アクション**: `task-progress` も task ごとに 1 秒に 1 回、セッションあたりの `meter` の合計に上限 (1 秒に 20 件など)、間引きの状態は tool の結果・assistant・`terminated`・`finish()` で破棄、`finish()` は予約を取り消してから `ended`、同時に追う tool の数と `turn.models` の件数 (32 など) に上限。テスト
- **根拠**: CWE-400 / CWE-770 / Principle IX / SC-004

### [Medium] 認証失敗の分類が、実際の失敗の形を確かめないまま `api_error_status` 401/403 に頼っており、今の再ログインの導線を失う経路がある (M-005) (scope: feature)

- **観察**: subtype を先に評価するので `error_during_execution` の失敗は導線なし。X-1 の V-11 (認証切れの実機) は deferred のまま (`005 quickstart-results.md:27,98`)。403 は認証以外でも返る
- **同種事象探索**: `api_error_status` の実測の fixture 0 件 (`session-core.test.ts:379-389` は subtype だけ)
- **推奨アクション**: (最小案) 実機の形を確かめるまで `execution-error` も `isReloginFailure` に含めるか文言に「ログイン状態も確かめる」。(本案) 認証切れの実機の result を fixture にして表を決め、V-3 の認証の項目を U-4 の承認の条件に。403 の扱いを理由とともに
- **根拠**: X-1 FR-030 / AD-039

### [Medium] H: 上の指摘を検出するテストが tasks に無い (M-006) (scope: feature)

- **推奨アクション**: BE-002 / BE-040 / FE-020 / FE-021 / BE-010 に M-001〜M-005 の fixture。decoder が捨てた件数を開発ビルドでだけ数える

### [Low] `api-retry` の行の `detail` で `error_status` が null のときの組み立てが決まっていない (L-001) (scope: feature)

- **推奨アクション**: 各値は整数だけ。null なら HTTP の部分を省く

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `[A-Z_]{3,}\[[a-zA-Z.]+\] \?\?` | 5 | system-event.ts:117 / tool-registry.aui.tsx:36 / ProviderScreen.tsx:319 / protocol.ts:91 / chat/labels.ts:65 |
| M-002 | `hook_id\|task_id` (system-event.ts) | 8 | system-event.ts:112-150 |
| M-003 | 日時の書式化 / ErrorBoundary | 3 / 0 | convert.ts:157 / SessionListScreen.tsx:62,71 / labels.ts:249 |
| M-004 | `setTimeout` (sdk-agent-session.ts) | 1 | sdk-agent-session.ts:330 |
| M-005 | `api_error_status` の実測の fixture | 0 | 005 quickstart-results.md:27,98 / session-core.test.ts:379-389 |
| M-006 | tasks.md の内容 | 0 | tasks.md:18,30,40 |
| L-001 | data-model §3 `api-retry` | 1 | data-model.md:85 |

## Verdict

- Critical: 0 / High: 0 / Medium: 6 / Low: 1
