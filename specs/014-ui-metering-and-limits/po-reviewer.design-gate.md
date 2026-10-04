# po-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: po-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md

## 初回読了 viewpoint

- 対象の FR/SC: FR-001〜FR-016、SC-001〜SC-006
- 対象の charter / Confirmation: ui charter KPI「表示網羅」(:141)、session charter (U-1)、AD-047 Confirmation、AD-046 / O-7 の中央のヘッダとタブの表 (013 data-model:89-121)
- roadmap の 13 項目はすべて US-1〜US-4 か U-3 で扱いが決まっている。`errors` だけ [ASSUMED] で出さない (L-001)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:3 Medium:7 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## Findings

### [High] US-1 AC3 と data-model §1 で「`api_error_status` が無い」ときの理由が食い違う (H-001) (scope: feature)

- **観察**: spec.md:78 は「それ以外か無い → API のエラー」、data-model.md:17-18 は無いとき `provider-error`
- **同種事象探索**: `api_error_status` (spec/data-model) 2 件
- **推奨アクション**: AC3 から「か無い」を消す。data-model §1 を正本と明記
- **根拠**: PO-3

### [High] SC-004 の E2E の計測経路は計量を流さないため、何も測っていない (H-002) (scope: feature)

- **観察**: SC-004 は E2E の long task を計測経路にするが、偽の supervisor は計量を流さない (plan RK-04)。基準も無い
- **同種事象探索**: `long task` (spec/plan) 2 件
- **推奨アクション**: SC-004 を agents の単体 (偽の時計) だけにするか、偽の supervisor に高頻度の fixture と基準の値
- **根拠**: PO-2

### [High] コンテキストの目盛りの推定が 100% を超える場合と、実際の値との照合が定義されていない (H-003) (scope: feature)

- **観察**: `usage` は「MAIN AGENT LOOP ONLY … per-turn」(`sdk.d.ts:5289`)。ターン内の要求ごとの入力が合算されるなら推定は実際を大きく上回る (未確認)。100% 超の表示も `/context` との照合も無い
- **同種事象探索**: `ratio` / `contextWindow` の上限の扱い 0 件
- **推奨アクション**: ratio > 1 の表示、V-3 に `/context` との差、実機の result の fixture で式を確かめる task
- **根拠**: PO-2 / PO-4

### [Medium] O-7 の中央のヘッダには権限モードの表示が無い。O-4 が足すと O-7 の「概要」の重複を禁じる規則とぶつかる (M-001) (scope: feature)

- **推奨アクション**: FR-010 に「中央のヘッダに新しく足す」。概要から外すか例外として記録

### [Medium] 費用は既定で畳まれた右のペインにだけ出て、ひと目では見えない (M-002) (scope: feature)

- **推奨アクション**: 費用の小さな表示を中央のヘッダに並べるか、畳まれていることを判断として記録

### [Medium] Quota banner の `utilization` / `resetsAt` の単位と書式が定義されていない (M-003) (scope: feature)

- **推奨アクション**: 単位の変換と書式。`seven_day_overage_included` の文言

### [Medium] 今の「全部に再ログインの導線」が、401/403 以外で届く認証の失敗では消える (M-004) (scope: feature)

- **推奨アクション**: 実機の result の fixture を取る task か、`execution-error` / `api-error` にログイン状態の確認の導線を添える

### [Medium] レート制限の帯がセッションごとで、帯が出ない Provider で失敗の文言が帯を参照する (M-005) (scope: feature)

- **推奨アクション**: 帯が無いときの文言を「しばらく待ってから」に。アカウントの制限を他のセッションに出さない理由を範囲外に

### [Medium] アプリの外で権限モードが安全 3 値の外に変わったことを知らせる機能が P2 に入っている (M-006) (scope: feature)

- **推奨アクション**: P1 に移すか、後回しにしないと明記
- **根拠**: Principle III

### [Medium] 使用量のタブの値が累計か最後のターンかが表示から分からず、累計が戻る edge case も一部抜けている (M-007) (scope: feature)

- **推奨アクション**: 見出しを「このセッションの累計」に。resume で戻ることを edge case に。0 の上書きの条件を data-model に揃える

### [Low] roadmap の項目「`errors`」を出さないことが [ASSUMED] だけで、`execution-error` の後の操作が具体的でない (L-001) (scope: feature)

- **推奨アクション**: U の表に入れる。対応表の `result` の行に理由。ログの場所を示すか文言から外す

### [Low] 4 つの Story のうち 3 つが P1 (L-002) (scope: feature)

- **推奨アクション**: Tier と揃えた根拠

### [Medium] 計量の経路を最初から最後まで通すテストが無い (H 観点) (M-008) (scope: feature)

- **推奨アクション**: SDK の fixture → port → decoder → ストア → DOM を 1 本、2 つのセッションで混ざらないこと

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `api_error_status` (spec/data-model) | 2 | spec.md:78, data-model.md:17-18 |
| H-002 | `long task` (spec/plan) | 2 | spec.md:219, plan.md:122 |
| H-003 | `ratio` / `contextWindow` の上限の扱い | 0 | data-model.md:122-123 |

## Verdict

- Critical: 0 / High: 3 / Medium: 8 / Low: 2
