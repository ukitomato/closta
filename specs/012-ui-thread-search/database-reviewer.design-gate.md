# database-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-04 (design-gate R1。optional の追加トラック)
**Reviewer**: database-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC: FR-009〜FR-013 (起動元・記録の内容・置き場と保持・読み出し)、SC-005
- 該当 charter / Confirmation: session charter:158 KPI「再利用率」、AD-041 (h) (:148 / X-6 の `.bak` の重複抑止 :140)、AD-023 §8、Principle V (constitution:463)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner。器の有無は G で扱う
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: Critical:0 High:1 Medium:5 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

新しい永続化は `launch-usage.json` 1 つ (`{ schemaVersion: 1, days: { "YYYY-MM-DD": { preset, manual } } }`)。器 (DB-1) は secret・識別子を置けず問題なし。「既存 store と同じ」の宣言に対してデータの失い方 (DB-2/3/4) に食い違いがある。

## Findings

### [High] 将来版のファイルを「退避して空から始める」としており、既存 store の「将来版なら書き換えを拒む」と食い違う (H-001) (scope: feature)

- **観察**: data-model §4 / spec FR-012 は版の違いを退避して空から始める。既存は将来版を `schema-version-unknown` で区別し (`preset-store.ts:114-117`)、service が書き換えを拒む (`preset-service.ts:73,97,128` / `provider-service.ts:129,188,223,252`。理由 `domain/provider/dto.ts:70`)
- **同種事象探索**: `schema-version-unknown|storeNewerVersion` (src) で拒む service 2 件、spec 012 で区別 0 件
- **リスク/影響**: ダウングレードで v1 の空から書き始め、新しい版の記録が `.bak` にしか残らない。KPI の時系列が黙って途切れる
- **推奨アクション**: 数値で 1 より大きい版は退避のうえ書き込まない (`storeNewerVersion` 相当)。`getLaunchUsage()` の返し方も決める。欠けた・数値でない・1 未満は壊れたファイルとして退避して空から。テスト観点
- **根拠**: DB-3、`preset-store.ts:113-117`

### [Medium] キー集合の外のキーが 1 つでもあると、ファイル全体を捨てて空から始める (M-001) (scope: feature)

- **観察**: 既存はレコード単位で飛ばし読めた分を復元して退避 (`preset-store.ts:134-157`、`folder-store.ts:147-153`)
- **同種事象探索**: `skipped > 0 ? await backup` 2 件
- **推奨アクション**: 最上位の形が崩れたときだけ全体を捨て、日単位の不正はその日だけ飛ばして退避

### [Medium] 未作成以外の理由で読めないとき空として扱い、「まだ記録がありません」と誤表示。読み直しの規則も無い (M-002) (scope: feature)

- **観察**: 既存は読めない状態を例外にして renderer の失敗表示に乗せ、loaded を確定させず読み直す (`preset-service.ts:63-69,87-88`)
- **推奨アクション**: `getLaunchUsage()` で「記録なし」と「読めない」を分ける。`read-failed` は loaded を確定させず次で読み直す

### [Medium] 退避 (`.bak`) に失敗したときの扱いが書かれていない (M-003) (scope: feature)

- **観察**: 既存は退避の失敗で上書きしない (`folder-store.ts:73-81`、`preset-store.ts:74-78`)。本 feature は失敗を握りつぶすとだけ
- **同種事象探索**: `async function backup` 3 件、いずれも投げ直す
- **推奨アクション**: 退避に失敗したら load を失敗とし、loaded を立てず書き込まない。テスト

### [Medium] 書き込みに失敗した 1 回分をメモリに残すか捨てるかが曖昧 (M-004) (scope: feature)

- **観察**: 既存は「永続化が成功してから in-memory を差し替える」(`preset-service.ts:118-120`)
- **推奨アクション**: どちらかを data-model §4 に明記し、BE-041 のテストに固定。Edge Cases の文言を合わせる

### [Medium] 時計が先に跳んだときの刈り込みで、正しい記録がすべて消える (M-005) (scope: feature)

- **観察**: Edge Cases は時計が戻る場合だけ
- **同種事象探索**: `時計が` (specs/012) 1 件
- **推奨アクション**: 刈り込みの基準を「記録の最も新しい日」と「今日」の小さい方にするか、未来の日がある書き込みでは刈り込みを飛ばす。BE-001 のテスト

### [Medium] H: 上の指摘を捕まえるテストと観測点が tasks に無い (M-006) (scope: feature)

- **推奨アクション**: BE-040 / BE-041 に 7 項目 (将来版・日単位の不正・読めない/記録なし・退避の失敗・失敗した 1 回・時計の先跳び・一時ファイルの後始末)。`[launch-usage-store]` の prefix で理由キーと errno のコードだけを `console.warn` (Principle V)

### [Low] 読み出しのたびに同じ内容の `.bak` が増えうる (L-001) (scope: feature)

- **推奨アクション**: service が load の結果を 1 回だけ確定させる。プロセスをまたぐ重複は X-6 に従う

### [Low] `days` の型が `Record<string, …>` で、日付の妥当性と回数の上限を検査しない (L-002) (scope: feature)

- **推奨アクション**: `LocalDateKey` の brand、暦として正しい日付、`Number.isSafeInteger(n) && n >= 0`

### [Low] 書き込みに失敗したときに一時ファイルを消すことが data-model に無い (L-003) (scope: feature)

- **推奨アクション**: 失敗時は一時ファイルを消す (`preset-store.ts:169-178` と同じ)。fs の差し替えでテスト

### 該当なしの観点

DB-1 (器)、DB-5 (導出値を永続化しない)、DB-6 (パスを永続化しない)、DB-7 (SQL / migration なし)、同時書き込み (`requestSingleInstanceLock` と service の直列化)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `schema-version-unknown\|storeNewerVersion` | 2 / spec 012 で 0 | preset-service.ts:97, provider-service.ts:188 |
| M-001 | `skipped > 0 ? await backup` | 2 | preset-store.ts:151, folder-store.ts:148 |
| M-002 | `read-failed` | 2 ファイル | preset-store.ts:22-26, preset-service.ts:63-69 |
| M-003 | `async function backup` | 3 | preset-store.ts:74, provider-store.ts:72, folder-store.ts:77 |
| M-004 | `永続化が成功してから` | 1 | preset-service.ts:118 |
| M-005 | `時計が` (specs/012) | 1 | spec.md:155 |

## Verdict

- Critical: 0 / High: 1 / Medium: 6 / Low: 3
