# database-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: database-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2 (pr-gate、system scope。起動理由: `src/main/infra/settings/launch-usage-store.test.ts` が `src/main/infra/settings/**` に一致)

## 初回読了 viewpoint

- FR/SC (Round 1 から対象は変わらない。Round 2 で spec.md:265-312 と :337-338 を読み直した):
  - FR-009: 起動元は renderer のメモリの中だけにあり、永続化しない
  - FR-010: `handleLaunchSession` が記録するかどうかを判定する
  - FR-011: 記録のキーの集合
  - FR-012: 置き場、版、一時ファイル + rename、90 鍵の刈り込み、読み込みの結果の表
  - FR-013: 読み出しの DTO
  - FR-016: discovery / session charter / roadmap の記述
  - SC-005: 固定のキー集合、将来版、日単位の不正、退避の失敗
  - SC-006: スキーマの差分 0
  - FR-018: Round 2 の差分の中心。E2E の基準画像。CLOSTA_E2E の fake を通るので、永続化には触れない
- touched files に該当する charter / Confirmation:
  - session charter の KPI「再利用率」の計測経路 (`docs/domains/session/charter.md:166,177-178`)
  - Constitution Principle V Verification (JSON の永続化スキーマ)
  - AD-023 §8 (store が electron を import しない)
  - AD-038 D3 (E2E は fake を使う。`e2e/support/launch.ts:27,31`)
  - AD-041 (h) (`.bak` の一覧と復元は X-6 が持つ)
  - AD-042 Decision 4 (退避の通知と版の規則)
  - AD-007 (SQL はまだ存在しない)
  - Round 1 から Round 2 の差分は、plan.md・charter・ADR を変えていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。器 (スキーマの形) は G の DB-1 で見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。KPI への影響は、永続化の書き手の不変条件 (DB-5) として G で扱う
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。Principle V はスキーマの形として G で見た
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:2 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

Round 1 から Round 2 の差分 (9d98c39..a4c37a8) が触ったのは次のものだけで、どれも永続化には関わらない。

- `verify.yml` の e2e job に sidebar-screenshot のステップを 1 つ足した
- `e2e/sidebar-screenshot.spec.ts` の撮影前のスクロール
- 基準画像 `sidebar-past-sessions-win32.png` の追加
- `session-list/labels.ts` の placeholder の文言
- data-model §5 / §7
- quickstart-results.md と touched-files.txt
- `vitest.config.ts` の `testTimeout: 20_000`

次のものは差分に入っていない。

- 永続化のスキーマ・store・service・domain の純関数 (`launch-usage-store.ts` / `launch-usage-service.ts` / `launch-usage.ts`)
- `perf/real-sessions.spec.ts`
- `docs/discovery.md` / `docs/roadmap.md` / session charter
- data-model §4

新しい CI のステップは `launchApp` を通るので、`CLOSTA_E2E=1` の fake で動き、ファイルに書かない (`e2e/support/launch.ts:31`)。基準画像はテストの成果物で、アプリの永続化ではない。SQL と migration は今も存在しない。`.gate-verdict-code.json` の `must_fix_findings` は 0 件なので、抑止の対象は無い。

Round 1 の 9 件は、HEAD a4c37a8 の該当行を読み直して、すべて未解消のまま残っていることを確かめた。Round 1 の pr-gate.md の dedup で、L-001 は Medium #1 (ux:M-005 / po:M-001) に集約されている。この reviewer の重大度は Low のまま据え置く。追加の事実は無く、格上げもしない。

## Findings

### [Medium] perf の実機計測が、利用者の本物の `launch-usage.json` に 1 回あたり最大 10 回の `manual` を書き込む (M-001) (scope: feature) [Round 1 から未解消]

- **観察** (a4c37a8 で読み直した):
  - `perf/real-sessions.spec.ts:166` は `CLOSTA_E2E` を拒む。`:180-185` はそれを env から取り除き、`--user-data-dir` を渡さずに `electron.launch` する
  - 軸は手で選ぶ (`:106,109,113,126` の `selectOption`)。そのため起動元は `manual` になる
  - 起動するのは `SESSIONS = 10` 本 (`:34`)
  - 記録から外す経路として書かれているのは、今も E2E だけである (`docs/discovery.md:370`)。session charter の perf の記述 (`charter.md:147`) にも、記録の扱いが無い
- **同種事象探索**:
  - `electron\.launch\(|user-data-dir|setPath\(` を `{perf,e2e,src}/**/*.ts` で検索して 2 件。`perf/real-sessions.spec.ts:185` は本物の userData に入る。`e2e/support/launch.ts:27` は fake に入る
  - `perf|real-sessions` を session charter で検索して 1 件 (`:147`)。記録の扱いは書かれていない
- **リスク/影響**: 記録は日ごとの 2 つの回数しか持たない。そのため、後から perf の分だけを取り除けない。O-8 で perf を繰り返すと `manual` が増え、KPI の不等式の判定が覆る
- **推奨アクション** (Round 1 と同じ):
  - 最小案: discovery の `launch-usage.json` の節、roadmap の O-8 の行、session charter の計測経路の注記に、「perf の 1 回の実行は `manual` を最大 10 回足す。計測の前に退避し、後で戻す」と書く
  - 案 2: perf の spec が `launch-usage.json` を複製し、`afterAll` で書き戻す
  - どちらの案でも、本番のコードに env で記録を止める分岐は足さない (AD-038 D3)
- **根拠**: DB-5、session charter の KPI「再利用率」、AD-038 D3、design-gate M-19
- **scope 根拠**: perf / discovery / roadmap / session charter は、どれも touched files

### [Medium] 退避して空から読み直したことが画面に出ず、利用者には「まだ記録がありません」と見える (M-002) (scope: feature) [code-gate DB-M-001 / Round 1 から未解消]

- **観察**:
  - store は退避の後、空 (または一部) を `loaded` で返す (`src/main/infra/settings/launch-usage-store.ts:150,153,162,177`)
  - service はログを 1 行出して、状態を `loaded` にするだけである (`src/main/app/launch-usage-service.ts:80-86`)
  - DTO (`src/domain/session/launch-usage.ts:54-61`) には、退避したことを表す値が無い
  - そのため `PresetPanel.tsx:222-223` は `usageEmpty` を出す
- **同種事象探索**: `restored|usageUnreadableHint|usageEmpty` を `src` で検索して 9 件。DTO に退避を表す値はどこにも無い (`restored` に当たるのは `LivePane.tsx:234-245` の無関係な ref だけ)。`skippedDays|reasonKeys` を読むのは、今も service のログ (`launch-usage-service.ts:81-82`) だけである
- **リスク/影響**: 回数を失ったのに、画面は「記録がまだ無い」と言う。KPI を判定する人は、リセット後の件数で判定する。原文は `.bak` に残る
- **推奨アクション**: `ok` の DTO に `restored: boolean` を足し、PresetPanel に 1 行出す。直さない場合は、data-model §4「表示」に「区別しない」と書き、表示の持ち主を X-6 にする
- **根拠**: DB-4、AD-042 Decision 4
- **scope 根拠**: service / domain / PresetPanel / data-model は、この PR で新設・変更したもの

### [Low] ダウングレード (将来版のファイル) は解けない状態なのに、DTO で「読めない」に潰れ、「次に開いたときに読み直します」と案内する (L-001) (scope: feature) [Round 1 から未解消。pr-gate R1 で Medium #1 に dedup 済み]

- **観察**:
  - `launch-usage.ts:61` の `unreadable` は理由を持たない
  - service の `newer-version` は確定したまま再読しない (`launch-usage-service.ts:65,75-79`)
  - store は将来版を書き換えない (`launch-usage-store.ts:158-159`)
  - それでも文言は両方に `usageUnreadableHint` を出す (`src/renderer/src/features/session/labels.ts:485`、`PresetPanel.tsx:218`)
- **同種事象探索**: `usageUnreadableHint` を `src` で検索して 2 件 (`labels.ts:485`、`PresetPanel.tsx:218`)
- **リスク/影響**: 旧版のアプリで開いている間は、果たされない約束が出続ける。データは失われない
- **推奨アクション**: 最小案は、hint を両方の場合に当てはまる文にすること。もう 1 つの案は、`unreadable` に `reason: 'newer-version' | 'read-failed'` を足すこと (FR-013 / data-model §4 を同じ PR で直す)
- **根拠**: DB-3、AD-042 Decision 4
- **scope 根拠**: DTO / 文言 / data-model は、この PR で新設したもの

### [Low] `.bak` の戻し方と、退避の一覧・復元の持ち主に `launch-usage.json` が無い (L-002) (scope: feature) [code-gate DB-L-001 / Round 1 から未解消]

- **観察**:
  - `docs/discovery.md:367-369` には消し方しか無く、`.bak` から戻す手順が無い
  - roadmap の X-6 の行 (`docs/roadmap.md:323`) が退避の一覧と復元の対象として名指すのは、今も「providers.json・presets.json」だけである
- **同種事象探索**: `launch-usage|settings store|perf の実行|manual` を `docs/roadmap.md` で検索して 2 件。X-6 の行 (`:323`) に `launch-usage` は無い
- **リスク/影響**: 退避が起きても、戻す道が書かれていない。持ち主のいない延期になる (AD-028 §5)
- **推奨アクション**:
  - discovery に「アプリを閉じ、`launch-usage.json.<時刻>.bak` を `launch-usage.json` に改名する」の 1 行を足す
  - X-6 の行の対象に `launch-usage.json` を足す
- **根拠**: DB-3、AD-041 (h)、AD-028 §5
- **scope 根拠**: discovery.md / roadmap.md は touched files

### [Low] 同じ版のファイルにある最上位の未知のキーは、退避されずに次の書き込みで黙って消える (L-003) (scope: feature) [code-gate DB-L-002 / Round 1 から未解消]

- **観察**:
  - store が検査するのは `schemaVersion` と `days` だけである (`launch-usage-store.ts:157-163`)
  - 書き出しは許可したキーしか出さない (`launch-usage.ts:208-216`)
  - 日の値には未知のキーを拒む検査がある (`launch-usage.ts:144-152`)。最上位にはこれに当たる扱いが無い
- **同種事象探索**: 最上位のキーを検査しない構えは `preset-store.ts` も同じ (1 件。既存)
- **リスク/影響**: 将来、版を上げずに最上位のキーを足すと、旧版がそのキーを跡を残さず消す
- **推奨アクション**: data-model §4 と `LAUNCH_USAGE_SCHEMA_VERSION` (`launch-usage.ts:31`) の注記に、「最上位のキーを足す変更は必ず版を上げる」と書く
- **根拠**: DB-2、DB-3
- **scope 根拠**: この PR で新設した store と data-model

### [Low] 保存する形 `LaunchUsageRecord.days` の鍵が `string` で、日の鍵の brand が書き出しの型で外れる (L-004) (scope: feature) [code-gate DB-L-003 / Round 1 から未解消]

- **観察**:
  - `src/domain/session/launch-usage.ts:66` は `Readonly<Record<string, LaunchDayCounts>>` である
  - `:209` の局所の宣言も `Record<string, LaunchDayCounts>` である
  - メモリの中の形は `ReadonlyMap<LocalDayKey, …>` (`:45`)
- **同種事象探索**: `Record<string,` を `launch-usage.ts` で検索して 2 件 (`:66`、`:209`)
- **リスク/影響**: 今、この型を組むのは `toLaunchUsageRecord` だけである。将来この型を直接組むコードは、型の上では日付以外の文字列を鍵に置ける
- **推奨アクション**: 2 か所を `Readonly<Partial<Record<LocalDayKey, LaunchDayCounts>>>` にする
- **根拠**: DB-1、Principle V Verification
- **scope 根拠**: この PR で新設した型

### [Low] 一時ファイル + rename に fsync が無く、残った `.tmp` を掃除しない。settings の store の書き込みの実装が 4 本目のコピーになった (L-005) (scope: system) [code-gate DB-L-004 / Round 1 から未解消]

- **観察**:
  - `launch-usage-store.ts:189-190` は、writeFile の直後に `sync()` を挟まずに rename する。古い `.tmp` を消す処理も無い
  - 退避の書き込みは、4 つの store すべてで、失敗したときに途中まで書いた `.bak` を消さない (`launch-usage-store.ts:117-126`、`preset-store.ts:74-77`、`provider-store.ts:71-75`、`folder-store.ts:77-81`)
  - Round 2 の追加観察: launch-usage では `backup-failed` のとき、service が状態を `unloaded` のまま残す (`launch-usage-service.ts:72-74`)。そのため `summary()` / `record()` のたびに読み直し、退避をやり直す。ENOSPC などで失敗が続くと、時刻の違う途中までの `.bak` が操作のたびに増えうる (1 つは数 KB)。重大度は変えない
- **同種事象探索**:
  - `rename\(|fsync|\.sync\(` を `src/main/infra/settings` (テストを除く) で検索して 4 件。`folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159` で、どれも rename。fsync は 0 件
  - `\.bak` の書き込みは 4 store にある (`launch-usage-store.ts:118`、`preset-store.ts:75`、`provider-store.ts:72`、`folder-store.ts:68`)
- **リスク/影響**:
  - 電源断のときに 0 バイトのファイルが残りうる。その場合は M-002 の経路で空になる
  - store ごとに実装が違うので、次に直すときに漏れが出る
- **推奨アクション**: この PR では変えない。roadmap X-6 の行の「settings store 3 種」(`docs/roadmap.md:323`) を 4 種にし、1 つの system follow-up にまとめる。中身は次の 4 つ
  - 書き込みの後の `sync()`
  - 古い `.tmp` の削除
  - 退避に失敗したときの途中までの `.bak` の削除
  - 書き込みと退避の共通部品への寄せ
- **根拠**: DB-4
- **scope 根拠**: 4 つの store に共通の構えで、この feature の touched files だけでは閉じない

### [Low] 日付を作れないとき (`RangeError`) も `write-failed` とログに出る (L-006) (scope: feature) [H: observability] [code-gate DB-L-005 / Round 1 から未解消]

- **観察**:
  - `launch-usage-service.ts:102` は `today()` を try の中で評価する
  - `toLocalDayKey` は `RangeError` を投げうる (`launch-usage.ts:129`)
  - `:106-107` の catch は、どの例外でも `write-failed code=unknown` を出す
- **同種事象探索**: `write-failed` を `launch-usage-service.ts` で検索して 1 件 (`:107`)
- **リスク/影響**: 時計の異常を、ディスクの書き込みの失敗と読み違える
- **推奨アクション**: `today()` の失敗に別の理由キー (`day-out-of-range`) を付ける。ログのテストに 1 ケース足す
- **根拠**: reviewer-base H、data-model §4「ログ」
- **scope 根拠**: この PR で新設した service

### [Low] 実物の store と service を組み合わせた経路のテストが無い (L-007) (scope: feature) [H: test] [code-gate DB-L-006 / Round 1 から未解消]

- **観察**:
  - service のテストは fake の store だけを使う
  - store のテストは `load` / `save` を単独で呼ぶ
  - Round 2 の差分はどちらのテストにも触れていない
  - E2E は fake を通る。perf は CI で動かない (`perf/real-sessions.spec.ts:165`)
- **同種事象探索**: `createLaunchUsageStore` を使うファイルは 3 件 (`launch-usage-store.ts`、`launch-usage-store.test.ts`、`composition-root.ts`)。service と組み合わせたテストは無い
- **リスク/影響**: 「将来版を書き換えない」という保証は、2 つの層の取り決め (`newer-version` と `state !== 'loaded'`) で成り立っている。片方を変えても、それぞれの単体テストは通ったまま保証が壊れうる
- **推奨アクション**: 一時ディレクトリで実物の store を service に差したテストを 2 本足す
  - 将来版のファイルは、`record()` を何回呼んでも中身が変わらない
  - 壊れたファイル → `summary()` → `record()` で書き直り、`.bak` に原文が残る
- **根拠**: reviewer-base H、SC-005 の計測経路
- **scope 根拠**: この PR で新設したテスト

## 観点ごとの確認 (指摘なし)

- DB-1 プリセットの export / import の型: 該当なし。preset のスキーマは scope に無い。Round 2 の差分も永続化の型に触れていない
- DB-2 必須フィールドの追加 / 改名: 該当なし。新設のファイルで、旧形式が無い。Round 2 の placeholder の文言の変更は labels.ts の定数で、永続化されない
- DB-4 同時書き込み / 置き場: Round 1 の確認から変わっていない (単一インスタンスのロック、service の Promise の鎖、`app.getPath('userData')`)
- DB-5 導出値: 30 日の合計は永続化しない (`launch-usage.ts:186-205`)
- DB-6 パスの永続化: 該当なし。`launch-usage.json` はパスを持たない
- DB-7 SQL: 該当なし。SQL のスキーマと migration は存在しない
- Round 2 で足した CI のステップ・基準画像・E2E のスクロール: 永続化の経路に入らない (`CLOSTA_E2E=1`。`e2e/support/launch.ts:31`)

## H (既存の振る舞いを壊していない根拠)

- Round 2 の差分は `src/main/infra/settings/**`、`launch-usage-*`、`src/domain/session/launch-usage*` を変えていない。Round 1 の時点の根拠 (code-gate の test track で 2266 件が通過) がそのまま有効
- invoker が観察した CI の run 37565959731 (HEAD a4c37a8) では、verify (node 24) が success だった
- verify (node 26) は failure だった。repo では allow-failure だが、この reviewer はその失敗にファイル I/O の store のテストが含まれるかを確かめられない (gh を使えない)。根拠の限界として記す。指摘にはしない
- `vitest.config.ts` の `testTimeout: 20_000` は上限を延ばすだけで、store / service のテストの assertion は変えない
- 指摘を検出できるテストの有無は L-007 (組み合わせの経路) と L-006 (ログの理由キー) のとおりで、どちらも未解消

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `electron\.launch\(\|user-data-dir\|setPath\(` ({perf,e2e,src}/**/*.ts) | 2 | `perf/real-sessions.spec.ts:185`、`e2e/support/launch.ts:27` |
| M-002 | `restored\|usageUnreadableHint\|usageEmpty` (src) | 9 | `labels.ts:481,482,485`、`PresetPanel.tsx:218,222,223`、`LivePane.tsx:234,236,237,245` (無関係な ref) |
| L-001 | `usageUnreadableHint` (src) | 2 | `src/renderer/src/features/session/labels.ts:485`、`PresetPanel.tsx:218` |
| L-002 | `launch-usage\|settings store\|perf の実行\|manual` (docs/roadmap.md) | 2 | `docs/roadmap.md:323,345` |
| L-003 | 最上位のキーを検査しない構え (settings の store) | 1 | `src/main/infra/settings/preset-store.ts` (既存) |
| L-004 | `Record<string,` (launch-usage.ts) | 2 | `src/domain/session/launch-usage.ts:66,209` |
| L-005 | `rename\(\|fsync\|\.sync\(` (src/main/infra/settings、テストを除く) | 4 | `folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159` |
| L-006 | `write-failed` (launch-usage-service.ts) | 1 | `src/main/app/launch-usage-service.ts:107` |
| L-007 | `createLaunchUsageStore` (src) | 3 | `launch-usage-store.ts`、`launch-usage-store.test.ts`、`composition-root.ts` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 7
- Round inheritance: resolved from 1: 0 / unresolved: 9 / new: 0 (Round 2 の差分は永続化の層に触れていない。L-005 に追加の観察を 1 つ足したが、重大度は変えていない)
