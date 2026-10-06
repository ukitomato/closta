# database-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: database-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: pr-gate Round 1 (system scope。起動理由: `src/main/infra/settings/**` に一致)

## 初回読了 viewpoint

- FR/SC:
  - FR-009: 起動元。renderer のメモリの中だけにあり、永続化しないことを確かめた (`running-session-store.ts` の `lastOrigin` / `launchOrigin`。`stores/ui.ts` に persist は無い)
  - FR-010: `handleLaunchSession` の検証と、記録するかどうかの判定 (`session-ipc.ts:161-163`)
  - FR-011: 記録のキーの集合
  - FR-012: 置き場、版、一時ファイル + rename、90 鍵の刈り込み、読み込みの結果の表
  - FR-013: 読み出しの DTO
  - FR-016: discovery / session charter / roadmap に書いた置き場、消し方、計測経路
  - SC-005: 固定のキー集合、将来版、日単位の不正、退避の失敗
  - SC-006: preset / provider / folder のスキーマと `SessionLaunchConfig` の差分が 0 であること
- touched files に該当する charter / Confirmation:
  - session charter の KPI「再利用率」の計測経路の注記 (`launch-usage.json`)
  - Constitution Principle V Verification (JSON の永続化スキーマも対象。AD-024 #9)
  - AD-023 §8: store が electron を import せず、userDataDir を引数で受ける。確かめた
  - AD-038 D3: E2E は fake を使い、ファイルに書かない。`src/main/index.ts:100-123` で確かめた
  - AD-041 (h): store の退避ファイルの一覧と復元 UI、`.bak` の重複抑止は X-6
  - AD-042 Decision 4: 退避の通知と「今後の規則」(壊れる変更では schemaVersion を上げる)
  - AD-007: SQLite のミラー。SQL はまだ存在しない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner。値の流れは見ていない。器 (スキーマの形) は G の DB-1 で見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner。KPI の判定への影響は、永続化の書き手の不変条件 (DB-5) としてだけ G で扱う
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner。Principle V はスキーマの形として G で見た
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:2 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

この diff (base main...HEAD 9d98c39) が足した永続化は `launch-usage.json` 1 つだけである (`{ schemaVersion: 1, days: { "YYYY-MM-DD": { preset, manual } } }`)。持ち主は次の 3 つ。

- domain の純関数: `src/domain/session/launch-usage.ts`
- store: `src/main/infra/settings/launch-usage-store.ts`
- service: `src/main/app/launch-usage-service.ts`

配線は `composition-root.ts:109,309` にある。SQL と migration は存在しない。scope の中で `infra/settings` の下にあるのは `launch-usage-store(.test).ts` だけで、既存の 3 つの store (folder / provider / preset) とそのスキーマ、`SessionLaunchConfig` は変わっていない。E2E の経路は `CLOSTA_E2E` で composition ごと差し替わり (`src/main/index.ts:100-123`)、本物の store を作らない。

code-gate の database-reviewer の指摘は CONSIDER の 7 件 (Medium 1 / Low 6) だった。HEAD 9d98c39 で該当箇所が変わっていないことを確かめたので、未解消として下に引き継ぐ。`.gate-verdict-code.json` の `must_fix_findings` は 0 件なので、抑止の対象は無い。新しい指摘は 2 件ある。

- M-001: 計測ハーネスが本物の記録に書く
- L-001: ダウングレードの状態が DTO で潰れる

## Findings

### [Medium] perf の実機計測が、利用者の本物の `launch-usage.json` に 1 回あたり最大 10 回の `manual` を書き込む (M-001) (scope: feature)

- **観察**:
  - `perf/real-sessions.spec.ts:166` は `CLOSTA_E2E` を拒む。`:179-185` はそれを env から取り除き、`electron.launch({ args: [resolve('out/main/index.js')], env })` で起動する。`--user-data-dir` は渡していない
  - 起動したアプリは `src/main/index.ts:125` の本物の composition に入る。`composition-root.ts:109` が `app.getPath('userData')` を取り、`:309` で本物の store を作る
  - perf の `launchOne` は軸を手で選ぶ (`perf/real-sessions.spec.ts:106,109,113,126` の `selectOption`)。そのため起動元は data-model §4 の表のとおり `manual` になる。起動するのは `SESSIONS = 10` 本 (`:34`)
  - `handleLaunchSession` は `launching` のたびに 1 回記録する (`src/main/app/session-ipc.ts:161-163`)
  - 一方、記録から外す経路として書かれているのは E2E だけである (`docs/discovery.md:359-370`、session charter の計測経路の注記)。O-8 の行 (`docs/roadmap.md:349`) にも、perf の実行が記録に混ざる扱いが無い
  - design-gate の M-19 (architecture M-102) が同じ問題を挙げたが、HEAD で未解消のまま。この PR は perf を触っている (locator の変更。diff の `perf/real-sessions.spec.ts`) のに、扱いは追加していない
- **同種事象探索**:
  - `electron\.launch\(` を `perf/**`・`e2e/**` で検索して 2 件。`perf/real-sessions.spec.ts:185` は本物の userData に書く。`e2e/support/launch.ts:27` は `CLOSTA_E2E=1` で fake に入り、ファイルに書かない
  - `user-data-dir|setPath\(` を `src/**`・`perf/**`・`e2e/**` で検索して 0 件
  - `(perf|real-sessions).{0,120}(manual|再利用率|launch-usage|ユーザデータ)` を `docs/**` で検索して 0 件
- **リスク/影響**:
  - 記録は「利用者が受け付けさせた起動」の回数だけを持つ、というのがこの永続化の不変条件である。perf はそこに合成の起動を混ぜる
  - 記録は日ごとの 2 つの回数しか持たない (FR-011)。そのため、後から harness の分だけを取り除けない。ファイルごと消すか、その日の値を手で直すしかない
  - KPI の判定は直近 30 日の 2 つの回数 (`sum30`) で行い、最低件数を持たない (spec FR-016)。O-8 は perf を繰り返し流す前提なので、数回の実行で `manual` に数十回が乗り、「プリセットを適用した起動 > 適用しない起動」の判定が覆る
- **推奨アクション** (どちらか):
  - 最小案 (コードを変えない): 3 か所に「perf の 1 回の実行は `manual` を最大 10 回足す。計測の前に `launch-usage.json` を退避し、計測の後に戻す」と書く。書く先は `docs/discovery.md` の `launch-usage.json` の節、roadmap の O-8 の行の義務、session charter の計測経路の注記
  - 案 2 (テストの側だけ): `perf/real-sessions.spec.ts` が起動の直後に `app.evaluate(({ app }) => app.getPath('userData'))` で置き場を取り、計測の前に `launch-usage.json` を複製し、`afterAll` で書き戻す
  - どちらの案でも、本番のコードに env で記録を止める分岐は足さない (AD-038 D3 の「env 単独で本番の挙動を変えない」と同じ原則)
- **根拠**: DB-5 (永続化の書き手の不変条件)、session charter の KPI「再利用率」の計測経路、AD-038 D3 (E2E 以外の harness の扱いが無い)、design-gate M-19
- **scope 根拠**: `perf/real-sessions.spec.ts`・`docs/discovery.md`・`docs/roadmap.md`・`docs/domains/session/charter.md` は、どれもこの PR の touched files

### [Medium] 退避して空から読み直したことが画面に出ず、利用者には「まだ記録がありません」と見える (M-002) (scope: feature) [code-gate DB-M-001 から持ち越し。HEAD で未解消]

- **観察**:
  - 最上位の形の崩れや日単位の不正があると、store は `.bak` に退避し、空 (または一部) を `loaded` で返す (`src/main/infra/settings/launch-usage-store.ts:150,153,162,177`)
  - service はログを 1 行出して状態を `loaded` にするだけで、`skippedDays` は捨てる (`src/main/app/launch-usage-service.ts:80-86`)
  - DTO (`src/domain/session/launch-usage.ts:54-61`) には「退避した」を表す値が無い。そのため `PresetPanel.tsx:222-223` は `usageEmpty` (「まだ記録がありません。」) を出す
- **同種事象探索**: `skippedDays|reasonKeys` を launch-usage・PresetPanel・useLaunchUsage で検索した。本番のコードで読むのは `launch-usage-service.ts:81-82` のログだけで、renderer に届く箇所は 0 件。他の store は退避を画面に出している (code-gate で確かめた `WorkspaceFoldersScreen.tsx:632-646`、`ProviderScreen.tsx:305-309`)
- **リスク/影響**: 回数を失ったのに、画面は「記録がまだ無い」と言う。KPI を判定する人は、リセット後の少ない件数で判定してしまう。原文は `.bak` に残るので Critical ではない
- **推奨アクション**: `ok` の DTO に `restored: boolean` を足し、PresetPanel に 1 行出す (チャネルは増えない)。直さないなら、data-model §4「表示」に「退避の後は空の状態と区別しない」と書き、表示の持ち主を X-6 にする
- **根拠**: DB-4 (解析に失敗したときの初期化を利用者に見せない経路)、AD-042 Decision 4 (退避の通知)
- **scope 根拠**: `launch-usage-service.ts` / `launch-usage.ts` / `PresetPanel.tsx` / data-model は、この PR で新設・変更したもの

### [Low] ダウングレード (将来版のファイル) は解けない状態なのに、DTO で「読めない」に潰れ、「次に開いたときに読み直します」と案内する (L-001) (scope: feature)

- **観察**:
  - data-model §4 の表は、`storeNewerVersion` と `readFailed` を同じ `unreadable` に写す。DTO の `unreadable` は理由を持たない (`src/domain/session/launch-usage.ts:61`)
  - service の `newer-version` は、そのプロセスの中で確定し、二度と読み直さない (`src/main/app/launch-usage-service.ts:65` の早期 return、`:75-79`)
  - プロセスをまたいでも、store は将来版を書き換えない (`launch-usage-store.ts:158-159`)。そのため、旧版のアプリを使う限り状態は解けない
  - それでも、文言は両方に `usageUnreadableHint` (「次に起動ダイアログを開いたときに読み直します。」) を出す (`src/renderer/src/features/session/labels.ts:485`、`PresetPanel.tsx:218`)。新しい版のアプリで開けば読めることは、どこにも示されない
  - 同じ文言の問題は design-gate M-02 (po M-002) が挙げており、HEAD で未解消。本指摘は DTO の形の側から見たものなので、dedup の鍵は `labels.ts:485` / data-model §4 とする
- **同種事象探索**: `usageUnreadableHint` を `src/renderer` で検索して 2 件 (`labels.ts:485`、`PresetPanel.tsx:218`)。`status: 'unreadable'` を返す経路は 3 件 (`launch-usage-service.ts:116,119`、`session-ipc.ts` の `handleGetLaunchUsage`)。どれも理由を持たない
- **リスク/影響**: 旧版で開いている利用者には、果たされない約束が出続ける。新しい版で開けば数字が戻ることが分からない。データは失われない (書き換えないため)
- **推奨アクション**: 最小案は、hint を両方の場合に当てはまる文にすること (例: 「新しい版のアプリが書いた記録か、読み取りに失敗しました。新しい版で開くか、次に開いたときに読み直します。」)。もう 1 つの案は、`unreadable` に `reason: 'newer-version' | 'read-failed'` を足し、文言を分けること。こちらは FR-013 / data-model §4 の DTO の正本を同じ PR で直す。SC-006 のチャネル数は変わらない
- **根拠**: DB-3 (ダウングレード時の挙動の定義)、AD-042 Decision 4 (ファイル全体の将来版は「保存ファイルを読み込めなかった」と出し分ける先例がある)
- **scope 根拠**: DTO・文言・data-model は、この PR で新設したもの

### [Low] `.bak` の戻し方と、退避の一覧・復元の持ち主に `launch-usage.json` が無い (L-002) (scope: feature) [code-gate DB-L-001 から持ち越し。HEAD で未解消]

- **観察**:
  - `docs/discovery.md:367-369` には消し方しか無く、`.bak` から戻す手順が無い
  - AD-041 (h) は「store 退避ファイルの一覧と復元 UI」を store を限らずに X-6 に預けている。ところが roadmap の X-6 の行 (`docs/roadmap.md:323`) は「providers.json・presets.json」だけを名指ししている
  - 将来版のファイルでは、プロセスごとに `.bak` が 1 つ増える (`launch-usage-store.ts:158-159`)
- **同種事象探索**: `launch-usage` を `docs/roadmap.md` で検索して 1 件 (`:345`。O-3 の行)。X-6 の行 (`:323`) には 0 件
- **リスク/影響**: M-002 の退避が起きても、戻す道が書かれていない。持ち主のいない延期になる (AD-028 §5)
- **推奨アクション**: discovery に「アプリを閉じ、`launch-usage.json.<時刻>.bak` を `launch-usage.json` に改名する」の 1 行を足す。roadmap の X-6 の行の対象に `launch-usage.json` を足す
- **根拠**: DB-3 (退避を取るなら復旧の手順を書く)、AD-041 (h)、AD-028 §5
- **scope 根拠**: discovery.md / roadmap.md は touched files

### [Low] 同じ版のファイルにある最上位の未知のキーは、退避されずに次の書き込みで黙って消える (L-003) (scope: feature) [code-gate DB-L-002 から持ち越し。HEAD で未解消]

- **観察**:
  - `launch-usage-store.ts:157-163` が見るのは `schemaVersion` と `days` だけである
  - 書き出しは許可したキーしか出さない (`launch-usage.ts:208-216`)
  - 日の値に未知のキーがあれば、その日を飛ばして退避する (`launch-usage.ts:144-152`)。最上位にはこれに当たる扱いが無く、厳しさが層によって違う
  - AD-042 Decision 4 の「今後の規則」は、旧版が拒否する変更で版を上げることを求める。しかし、旧版が拒否せずに捨てる変更 (任意の最上位のキーの追加) は対象外である
- **同種事象探索**: 最上位のキーを検査しない構えは `preset-store.ts:112-128` も同じ (1 件。既存)
- **リスク/影響**: 今の実害は、手で編集したときか改ざんのときに限る。将来、版を上げずに最上位のキーを足すと、旧版がそのキーを跡を残さず消す
- **推奨アクション**: data-model §4 と `LAUNCH_USAGE_SCHEMA_VERSION` の注記に「最上位のキーを足す変更は必ず版を上げる」と書く。あわせて、最上位の未知のキーを「退避して読む」に揃えるかを決める
- **根拠**: DB-2 (未知の値を読んだときの挙動)、DB-3 (版の付け方の規則)
- **scope 根拠**: この PR で新設した store と data-model

### [Low] 保存する形 `LaunchUsageRecord.days` の鍵が `string` で、日の鍵の brand が書き出しの型で外れる (L-004) (scope: feature) [code-gate DB-L-003 から持ち越し。HEAD で未解消]

- **観察**: `src/domain/session/launch-usage.ts:66` は `Readonly<Record<string, LaunchDayCounts>>` である。メモリの中の形は `ReadonlyMap<LocalDayKey, …>` (`:45`)
- **同種事象探索**: `Record<string,` を `launch-usage.ts` で検索して 2 件 (`:66` の型、`:209` の `toLaunchUsageRecord` の局所の宣言)
- **リスク/影響**: 今、この型を組むのは `toLaunchUsageRecord` だけなので、実害は無い。将来、移行・import・E2E のコードがこの型を直接組むと、型の上では日付以外の文字列 (識別子・名前) を鍵に置ける。FR-011 の「構造上入らない形」が、型の上では閉じていない
- **推奨アクション**: `:66` と `:209` を `Readonly<Partial<Record<LocalDayKey, LaunchDayCounts>>>` にする
- **根拠**: DB-1 (許可したキーを型で区別する)、Principle V Verification
- **scope 根拠**: この PR で新設した型

### [Low] 一時ファイル + rename に fsync が無く、残った `.tmp` を掃除しない。settings の store の書き込みの実装が 4 本目のコピーになった (L-005) (scope: system) [code-gate DB-L-004 から持ち越し。HEAD で未解消]

- **観察**:
  - `launch-usage-store.ts:189-190` は、writeFile の直後に `sync()` を挟まずに rename する。起動時に古い `.tmp` を消す処理も無い
  - 書き込みと退避の実装は、4 つの store がそれぞれに持っている。退避に失敗したときの扱いは store によって違う: launch-usage は `read-failed` を返し、preset-store は `backup()` が投げる (`preset-store.ts:74-77`)
  - roadmap の X-6 の行の是正項目は「settings store 3 種」のまま (`docs/roadmap.md:323`)
- **同種事象探索**: `rename\(` を `src/main/infra/settings` (テストを除く) で検索して 4 件 (`folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159`)。`fsync|sync\(` は 0 件
- **リスク/影響**: 電源断のときに 0 バイトのファイルが残りうる。その場合は解析の失敗から退避されて空になる (M-002 の経路)。store ごとの実装の差は、次に直すときの漏れになる
- **推奨アクション**: この PR では変えない。X-6 の行の「settings store 3 種」を 4 種にし、書き込みの後の `sync()`・古い `.tmp` の削除・書き込みと退避の共通部品への寄せを、1 つの system follow-up にする
- **根拠**: DB-4 (書き込みの原子性と破損耐性)
- **scope 根拠**: 4 つの store に共通の構えで、この feature の touched files だけでは閉じない

### [Low] 日付を作れないとき (`RangeError`) も `write-failed` とログに出る (L-006) (scope: feature) [H: observability] [code-gate DB-L-005 から持ち越し。HEAD で未解消]

- **観察**: `src/main/app/launch-usage-service.ts:102` で `today()` を try の中で評価している。`:106-107` の catch は、どの例外でも `write-failed code=unknown` を出す
- **同種事象探索**: `write-failed` を `launch-usage-service.ts` で検索して 1 件 (`:107`)
- **リスク/影響**: 時計の異常を、ディスクの書き込みの失敗と読み違える
- **推奨アクション**: `today()` の失敗に別の理由キー (`day-out-of-range`) を付ける。ログのテストに 1 ケース足す
- **根拠**: reviewer-base H (障害時に原因を特定できる観測点)、data-model §4「ログ」
- **scope 根拠**: この PR で新設した service

### [Low] 実物の store と service を組み合わせた経路のテストが無い (L-007) (scope: feature) [H: test] [code-gate DB-L-006 から持ち越し。HEAD で未解消]

- **観察**:
  - service のテストは fake の store だけを使う (`src/main/app/launch-usage-service.test.ts`)
  - store のテストは `load` / `save` を単独で呼ぶ (`launch-usage-store.test.ts:83-270`)
  - 「将来版のファイルは `record()` を何回呼んでも中身が同じ」「壊れたファイル → `summary()` → `record()` で書き直り、`.bak` に原文が残る」を、1 本で確かめるテストが無い
  - E2E は fake を通るので、この経路に届かない (M-001 と同じ理由で、perf も合否を見ない)
- **同種事象探索**: `createLaunchUsageStore` を使うファイルは 3 件 (`launch-usage-store.ts`、`launch-usage-store.test.ts`、`composition-root.ts`)。service と組み合わせたテストは 0 件
- **リスク/影響**: 「将来版を書き換えない」という保証は、2 つの層の取り決め (`newer-version` と `state !== 'loaded'`) で成り立っている。片方の名前や分岐を変えても、それぞれの単体テストは通ったまま保証が壊れうる
- **推奨アクション**: `launch-usage-store.test.ts` と同じ一時ディレクトリで、実物の store を service に差したテストを 2 本足す (上の 2 つの経路)
- **根拠**: reviewer-base H (指摘を検出できるテストがあるか)、SC-005 の計測経路
- **scope 根拠**: この PR で新設したテスト

## 観点ごとの確認 (指摘なし)

- DB-1 プリセットの export / import の型: 該当なし。preset のスキーマ (`preset-record.ts`) は scope に無い。起動元は `SessionLaunchConfig` にもプリセットにも入らない (SC-006)
- DB-2 必須フィールドの追加 / 改名: 該当なし。新設のファイルで、旧形式が無い。`LaunchState.lastOrigin` / `LiveSessionState.launchOrigin` はメモリの中だけにある
- DB-4 同時書き込み: `requestSingleInstanceLock` (`src/main/index.ts:68`) と service の Promise の鎖で直列化されている。読めない (ENOENT 以外) ときと、退避に失敗したときは書かない (`launch-usage-store.ts:136-143,113-128`)。置き場は `app.getPath('userData')` (`composition-root.ts:109`)
- DB-5 導出値: 30 日の合計は永続化せず、読み出しのたびに計算する。参照 (セッション id・プリセット id) を持たないので、孤児になるものが無い
- DB-6 パスの永続化: 該当なし。`launch-usage.json` はパスを持たない。本体・一時ファイル・`.bak` のパスは `hostPathOps.join` で組む (`launch-usage-store.ts:102-107`)
- DB-7 SQL: 該当なし。SQL のスキーマと migration は存在しない (tasks.md「DB migration は無い」)
- H (既存の振る舞いを壊していない根拠): scope の中で `infra/settings` の下にあるのは `launch-usage-store(.test).ts` だけ。既存の 3 つの store と、その単体テストは変わっていない。code-gate の test track は 2266 件が通過、失敗 0

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `electron\.launch\(` (perf/e2e) / `user-data-dir\|setPath\(` (src/perf/e2e) / `(perf\|real-sessions).{0,120}(manual\|再利用率\|launch-usage\|ユーザデータ)` (docs) | 2 / 0 / 0 | `perf/real-sessions.spec.ts:185` (本物の userData)、`e2e/support/launch.ts:27` (fake) |
| M-002 | `skippedDays\|reasonKeys` (launch-usage・PresetPanel・useLaunchUsage。本番のコード) | 読む箇所 1 (ログのみ) | `src/main/app/launch-usage-service.ts:81-82` |
| L-001 | `usageUnreadableHint` (src/renderer) / `status: 'unreadable'` を返す経路 | 2 / 3 | `labels.ts:485`、`PresetPanel.tsx:218` / `launch-usage-service.ts:116,119`、`session-ipc.ts` の `handleGetLaunchUsage` |
| L-002 | `launch-usage` (`docs/roadmap.md`) | 1 (X-6 の行は 0) | `docs/roadmap.md:345` |
| L-003 | 最上位のキーを検査しない構え | 1 (既存) | `src/main/infra/settings/preset-store.ts:112-128` |
| L-004 | `Record<string,` (`launch-usage.ts`) | 2 | `src/domain/session/launch-usage.ts:66,209` |
| L-005 | `rename\(` (`src/main/infra/settings`、テストを除く) / `fsync\|sync\(` | 4 / 0 | `folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159` |
| L-006 | `write-failed` (`launch-usage-service.ts`) | 1 | `src/main/app/launch-usage-service.ts:107` |
| L-007 | `createLaunchUsageStore` (src) と service の組み合わせ | 3 ファイル / 組み合わせ 0 | `launch-usage-store.ts`、`launch-usage-store.test.ts`、`composition-root.ts:309` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 7

関連するファイル (絶対パス):
- C:\dev\closta\perf\real-sessions.spec.ts
- C:\dev\closta\src\main\infra\settings\launch-usage-store.ts
- C:\dev\closta\src\main\app\launch-usage-service.ts
- C:\dev\closta\src\domain\session\launch-usage.ts
- C:\dev\closta\src\main\app\session-ipc.ts
- C:\dev\closta\src\main\app\composition-root.ts
- C:\dev\closta\src\renderer\src\features\session\PresetPanel.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\docs\discovery.md
- C:\dev\closta\docs\roadmap.md
- C:\dev\closta\docs\domains\session\charter.md
