# platform-boundary-reviewer レビュー: 計量と制限の表示 (O-4)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 (状態通知の `reasonKey` を通る)、FR-003 (調停役は解釈しない)、FR-004、FR-005、FR-010 (Principle III)、SC-002 / SC-004 / SC-006
- 該当 charter / Confirmation: isolation charter (:41 可視化ポリシー、Journey 2 :70-74)、runtime charter (:48)、AD-041 (a) Consequences :157 / Confirmation :169、AD-043 Decision 2 / 4、Principle III / VII、check.mjs 項目 14 / 16 / 18、`.dependency-cruiser.js`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:0
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:1

## スコープ要約

確かめたこと: 調停役の非解釈は守られる (`emit` で文字列にして中継。`sdk-agent-session.ts:300-301`)。状態通知の受信規則は `isLaunchFailureReason` (`status-update.ts:39`) が追随し main の差分 0。新設の 2 モジュールはディレクトリの正規表現の規則に入る (`.dependency-cruiser.js:193,200,207,217,270`)。主な問題は昇格を観測しても表示だけの設計と、可視化の規則を ui が決めていること。

## Findings

### [High] 実行中に権限モードが昇格したのを観測しても「注意の見た目」だけで終わる。AD-041 の「昇格経路 0 件」に違反した状態がランタイムの capability と無関係に続く (H-001) (scope: feature)

- **観察**: spec.md:148 / data-model.md:131 は安全 3 値の外を注意の見た目で出すだけ。AD-041 は「昇格経路は 0 件を維持する」(:157)。SDK は PermissionRequest hook の `updatedPermissions` の `setMode` (`sdk.d.ts:2341,2384-2385`) で昇格しうる。O-4 は不変条件が初めて実行時に観測できる場所
- **同種事象探索**: `アプリの外` 2 件、`isAutoModeAllowed|autoModeAllowed` (specs/014) 0 件、`isAutoModeAllowed` (src) は `capabilities.ts:160` に 1 件
- **リスク/影響**: `autoModeSafe !== true` のランタイムで無人実行が続く。「アプリの外で変更」は原因を決めつけ、退行を見えなくする。観測点も無い
- **推奨アクション**: AD-047 に昇格を観測したときの扱いを決定として書き、U-5 に (a) `isAutoModeAllowed` が false / unknown のランタイムで中断・失敗 (`permission-escalated`) か警告だけか (b) 強制しないなら持ち主と再訪の条件。注意の見た目を `autoModeAllowed` と組み合わせて段階を分ける。文言を「アプリが選んでいないモード」に。単体テスト
- **根拠**: Principle III / AD-041 (a) / isolation charter

### [Medium] 安全 3 値の外のモードをどう可視化するかを ui が独自に決めている (M-001) (scope: feature)

- **観察**: isolation charter は可視化ポリシーを In scope (:41)、見た目は ui (:49)、Journey 2 は `bypassPermissions` の区別を一覧で (:73)。O-4 は isolation を参照していない
- **同種事象探索**: `isolation` (specs/014) 0 件
- **推奨アクション**: plan の関わる domain に isolation。判定は isolation (または暫定で持つ domain) の 1 関数、ui は見た目。監視ビューの行に昇格の印を出すかを範囲外の節で決める

### [Medium] domain の `meter.ts` は SDK を import できず、SDK のフィールド形を手で書く。昇格値の列挙を置く場所と項目 16 の関係も plan に無い (M-002) (scope: feature)

- **観察**: domain は SDK を import できない (`allowlists.mjs:363`)。先例は `sdk-agent-session.ts:80-84` の `Equal<…>`。項目 16 は `src/agents/` で昇格値のリテラルを違反にし (`check.mjs:811-814,875-881`)、`assertSafePermissionMode` を挟むと throw → `process-crashed`
- **同種事象探索**: `Equal<` (src/agents) 1 件、`PermissionModeKey` 2 件
- **推奨アクション**: 昇格値のリテラルは domain の `meter.ts` だけ、agents は `.permissionMode` を渡すだけ、項目 16 に例外を足さない。`Equal` で `PermissionModeKey` / `RateLimitType` / `status` の値域を SDK と固定

### [Medium] セッションを閉じても `meters[sessionId]` が残りうる (M-003) (scope: feature)

- **観察**: `close()` は削除するマップを手で列挙 (`running-session-store.ts:507-515`)。`kill()` は port を閉じない (:485)
- **同種事象探索**: `delete .*\[sessionId\]` 4 件
- **推奨アクション**: FE-020 に `close()` の列挙に `meters`。閉じた id に書かない。テスト

### [Medium] 間引きで最後の値を遅れて送ると、tool の結果で消した経過時間が復活する (M-004) (scope: feature)

- **同種事象探索**: `間引|throttle` 5 件、取り消しと flush の記述 0
- **推奨アクション**: `cancel(toolUseId)` / `cancelThinking()` / `dispose()`。結果・assistant・`finish()` で取り消す。テストで結果の後と `ended` の後の 0 件
- **根拠**: AD-043 Decision 2 / SC-004

### [Low] 行の id の連番と権限モードの比較の基準値をどこに持つかが書かれていない (L-001) (scope: feature)

- **推奨アクション**: `run()` の closure に置く。基準値は `launchOptions.permissionMode`。domain の関数は連番を引数で受ける

### [Low] SDK が報告した権限モードを起動設定に書き戻してはならないことが明記されていない (L-002) (scope: feature)

- **推奨アクション**: `meters` だけに持ち、`config` / `lastConfig` / プリセットに書き戻さない。概要は `meters[id].permissionMode ?? config.permissionMode`

### 該当なしの固有観点

PB-1 (パスを運ばない)、PB-3 (capabilities を変えない)、PB-5、PB-6 (`PROCESS_SPAWN_MODULES` の差分 0)、PB-7 (新設モジュールは規則に入る。項目 16 との関係は M-002)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `アプリの外` (specs/014) | 2 | spec.md:148, data-model.md:131 |
| H-001 | `isAutoModeAllowed\|autoModeAllowed` (specs/014) | 0 | — |
| H-001 | `updatedPermissions\|setMode` (sdk.d.ts) | 3 | sdk.d.ts:2341, 2352, 2384 |
| M-001 | `isolation` (specs/014) | 0 | — |
| M-002 | `Equal<` (src/agents) | 1 | sdk-agent-session.ts:80 |
| M-003 | `delete .*\[sessionId\]` | 4 | running-session-store.ts:512-515 |
| M-004 | `間引\|throttle` (specs/014) | 5 | data-model.md:61, tasks.md:40, spec.md:146,168, research.md:37 |
| L-001 | `連番` (data-model.md) | 3 | :85-87 |
| L-002 | `lastConfig` (running-session-store.ts) | 2 | :353, 527 |

## Verdict

- Critical: 0 / High: 1 / Medium: 4 / Low: 2
