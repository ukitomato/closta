# database-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: database-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: code-gate iteration 3 (base 7bdb271..HEAD 737e118)
**Round**: 3

## 初回読了 viewpoint

- FR/SC:
  - FR-009: 起動元は renderer のメモリにしか持たない。HEAD で再確認した: `src/renderer` に `localStorage|sessionStorage|indexedDB|zustand/middleware|persist(` は 0 件
  - FR-010: `handleLaunchSession` が起動元を検証し、記録するかを決める (`src/main/app/session-ipc.ts:159-164`)
  - FR-011: 記録に入れてよいキーの集合
  - FR-012: 置き場・版・一時ファイル + rename・鍵 90 個での刈り込み・読み込み結果の表
  - FR-013: 読み出しの DTO
  - FR-016: discovery / session charter / roadmap に書く置き場・消し方・計測経路
  - FR-018: E2E の CI ステップ。偽の capability を通るのでファイルに書かない
  - SC-005: キー集合の固定・将来版・日単位の不正・退避の失敗・一時ファイルの後始末
  - SC-006: preset / provider / folder のスキーマと `SessionLaunchConfig` の差分が 0
- touched files に該当する charter / Confirmation:
  - session charter KPI「再利用率」の計測経路の注記 (`docs/domains/session/charter.md:165-179`)
  - ui charter の O-3 の行 (`docs/domains/ui/charter.md:222-226`)
  - Constitution Principle V の Verification。JSON の永続化スキーマも対象 (AD-024 #9、`.specify/memory/constitution.md:510-514`)。この diff の Constitution の変更は Principle XV だけで、V には触れていない
  - AD-023 §8: store は electron を import しない
  - AD-038 D3: E2E の fake への差し替え (`src/main/index.ts:100`)
  - AD-041 (h)
  - AD-042 Decision 4 (退避の通知・ダウングレード・「今後の規則」)
  - AD-028 §5
  - AD-007: SQL はまだ無い
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。値の流れは見ていない。スキーマの形は G の DB-1 で見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。KPI 記録の書き手の不変条件は G の DB-5 で扱った
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。Principle V はスキーマの形として G で見た
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:2 Low:6
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

この PR が足した永続化は `launch-usage.json` の 1 つだけである。形は `{ schemaVersion: 1, days: { "YYYY-MM-DD": { preset, manual } } }`。

- 持ち主: `src/domain/session/launch-usage.ts`、`src/main/infra/settings/launch-usage-store.ts`、`src/main/app/launch-usage-service.ts`
- 配線: `src/main/app/composition-root.ts:109,308-309,353-354`
- SQL も migration も無い

iter 2 (HEAD ddc052e) から iter 3 (HEAD 737e118) までの差分は `src/renderer/src/features/chat/virtualization.test.tsx` だけである (diff 14779-14799 行)。中身はテスト 1 本の timeout を 20_000 にする変更とコメント 1 行で、永続化の層には触れていない。HEAD で永続化の 3 ファイル・store のテスト・service のテスト・`session-ipc.ts`・`e2e-capability.ts`・perf・discovery・roadmap・session charter を読み直した。前回の指摘で示した行番号は、すべて同じ内容のままだった。

前回の 10 件 (M-001・M-002・L-001〜L-008) は、HEAD でどれも直っていない。新しい指摘は無い。L-001 には、前例となる既存の箇所を 1 つ加えた (provider 側は将来版を区別して表示している)。重大度は変えていない。

## Findings

### [Medium] perf の実機計測が、利用者の本物の `launch-usage.json` に 1 回あたり最大 10 回の `manual` を足す (M-001) (scope: feature) [pr-gate R1 database:M-001 から持ち越し。iter 2 から未解消]

- **観察**:
  - `perf/real-sessions.spec.ts:166,179-185` は `CLOSTA_E2E` を取り除き、`--user-data-dir` を付けずに `electron.launch` を呼ぶ。そのため起動するのは本物の composition で、置き場は `app.getPath('userData')` になる (`composition-root.ts:109,309`)
  - perf は軸を手で選ぶ (`:105-113,126`)。起動元は `manual` になり、`SESSIONS = 10` 本 (`:34`) を起動する。起動が受け付けられるたびに 1 回記録される (`session-ipc.ts:163`)
  - 記録から外れる経路として書かれているのは E2E だけである (`docs/discovery.md:370`、`docs/domains/session/charter.md:179`)
- **同種事象探索**: perf と記録の両方に触れる文を検索した。クエリは `(perf|real-sessions).{0,200}(manual|再利用率|launch-usage|起動の利用記録)` とその逆順。範囲は `docs/**`・`perf/**` と、spec_dir の spec / plan / tasks / data-model / quickstart / quickstart-results。結果は 0 件
- **リスク/影響**:
  - 記録は日ごとの 2 つの回数しか持たない (FR-011)。後から計測の分だけを取り除けない
  - KPI は直近 30 日の回数で判定し、最低件数を持たない (FR-016)。O-8 で perf を数回流すだけで判定が覆る
- **推奨アクション**: 案は 2 つ。
  - 最小案: 次の 3 か所に「perf の 1 回は `manual` を最大 10 回足す。計測の前に退避し、後で戻す」と書く
    - discovery の `launch-usage.json` の節 (`docs/discovery.md:359-370`)
    - roadmap の O-8 の行 (`docs/roadmap.md:349`)
    - session charter の計測経路の注記
  - 案 2: perf の spec が `app.evaluate` で userData を取り、`launch-usage.json` を複製しておき、`afterAll` で書き戻す
  - どちらの案でも、本番のコードに env で記録を止める分岐は足さない (AD-038 D3)
- **根拠**: DB-5 (書き手の不変条件)、session charter の KPI の計測経路
- **scope 根拠**: perf / discovery / roadmap / session charter はこの PR の touched files である

### [Medium] 退避して空から読み直しても画面に出ず、「まだ記録がありません」と見える (M-002) (scope: feature) [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - store は退避した後、空 (または一部) を `loaded` で返す (`launch-usage-store.ts:150,153,162,177`)
  - service はログを 1 行出すだけで、`skippedDays` を捨てる (`launch-usage-service.ts:80-86`)
  - DTO (`launch-usage.ts:54-61`) には「退避した」を表す値が無い。そのため `PresetPanel.tsx:220-224` は `usageEmpty` を出す
- **同種事象探索**: 本番のコードで `skippedDays|reasonKeys` を launch-usage について読むのは、`launch-usage-service.ts:81-82` のログだけ (1 件)。renderer に届く箇所は 0 件。他の store は退避を画面に出している (`WorkspaceFoldersScreen.tsx:632-646`、`ProviderScreen.tsx:305-309`)
- **リスク/影響**: 回数を失っても、KPI を判定する人には気づく手段が無い。原文は `.bak` に残るので Critical ではない
- **推奨アクション**: 案は 2 つ。
  - `ok` の DTO に `restored: boolean` を足し、PresetPanel に 1 行出す。チャネルは増えない
  - 直さないなら、data-model §4「表示」に「退避の後は空の状態と区別しない」と書き、表示の持ち主を X-6 にする
- **根拠**: DB-4 (初期化を利用者に見せない経路)、AD-042 Decision 4 (退避の通知)
- **scope 根拠**: service / DTO / PresetPanel / data-model はこの PR で新設した

### [Low] 将来版 (ダウングレード) が DTO で「読めない」に潰れ、果たされない「次に開いたときに読み直します」が出る (L-001) (scope: feature) [pr-gate R1 database:L-001 から持ち越し。iter 2 から未解消]

- **観察**:
  - service は `newer-version` をプロセスが続く間は確定させ、読み直さない (`launch-usage-service.ts:65,75-79`)
  - それでも DTO は理由を持たない `unreadable` で (`launch-usage.ts:61`)、文言は `usageUnreadableHint`「次に起動ダイアログを開いたときに読み直します。」(`session/labels.ts:485`、`PresetPanel.tsx:218`) になる
  - 前例: provider 側は将来版を区別して表示している (`features/provider/labels.ts:57-61` の `wholeFileUnreadableLabel(storeNewerVersion)`)
- **同種事象探索**: `usageUnreadableHint` は 2 件 (`labels.ts:485`、`PresetPanel.tsx:218`)。`status: 'unreadable'` を返す main の経路は 4 件 (`launch-usage-service.ts:116,119`、`session-ipc.ts:183,191`)。将来版を区別する既存の表示は 1 件 (`provider/labels.ts:57`)
- **リスク/影響**: 旧版のアプリで開いている間は、約束された「読み直し」が起きない。新しい版で開けば読めることも示されない。データは失われない
- **推奨アクション**: 案は 2 つ。
  - hint を、どちらの場合にも当てはまる文にする
  - `unreadable` に `reason: 'newer-version' | 'read-failed'` を足して文言を分ける (provider と同じ構え)。このときは FR-013 / data-model §4 の正本を同じ PR で直す
- **根拠**: DB-3 (ダウングレード時の挙動)
- **scope 根拠**: DTO と文言はこの PR で新設した

### [Low] `.bak` からの戻し方が書かれておらず、退避の一覧・復元の持ち主の対象に `launch-usage.json` が無い (L-002) (scope: feature) [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - `docs/discovery.md:367-369` には消し方しか書かれていない
  - roadmap の X-6 の行 (`docs/roadmap.md:323`) は、退避の一覧・復元の対象として `providers.json`・`presets.json` しか名指ししていない
  - 将来版のファイルでは、プロセスごとに `.bak` が 1 つ増える (`launch-usage-store.ts:158-159`)
- **同種事象探索**: `docs/roadmap.md` で `launch-usage` は 1 件 (`:345`、O-3 の行)。X-6 の行では 0 件
- **リスク/影響**: M-002 の退避が起きても、元に戻す道が無い (AD-028 §5)
- **推奨アクション**:
  - discovery に「アプリを閉じ、`launch-usage.json.<時刻>.bak` を `launch-usage.json` に改名する」を足す。L-008 を直さない場合は「中身が空・途中で切れた `.bak` は選ばない」も添える
  - X-6 の行の対象に `launch-usage.json` を足す
- **根拠**: DB-3 (バックアップを取るなら復旧手順を書く)、AD-041 (h)
- **scope 根拠**: discovery.md / roadmap.md は touched files である

### [Low] 同じ版のファイルにある最上位の未知のキーが、退避されずに次の書き込みで黙って消える (L-003) (scope: feature) [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - store が最上位で見るのは `schemaVersion` と `days` だけ (`launch-usage-store.ts:157-163`)。書き出しは許可したキーしか出さない (`launch-usage.ts:208-216`)
  - 一方、日の値に未知のキーがあると、その日を飛ばして退避する (`launch-usage.ts:144-152`)
  - つまり層によって厳しさが違う
- **同種事象探索**: 最上位のキーを検査しない構えは、既存の `preset-store.ts:112-128` にもある (1 件)
- **リスク/影響**: 将来、版を上げずに最上位のキーを足すと、旧版がそのキーを跡なく消す。AD-042 の「今後の規則」は、旧版が拒否せずに捨てる変更を対象にしていない
- **推奨アクション**: data-model §4 と `LAUNCH_USAGE_SCHEMA_VERSION` (`launch-usage.ts:31`) の注記に「最上位のキーを足す変更は必ず版を上げる」と書く
- **根拠**: DB-2 / DB-3
- **scope 根拠**: store と data-model はこの PR で新設した

### [Low] 保存する形 `LaunchUsageRecord.days` の鍵が `string` で、日の鍵の brand が外れている (L-004) (scope: feature) [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - `launch-usage.ts:66` は `Readonly<Record<string, LaunchDayCounts>>`、`:209` の局所の宣言も `Record<string, LaunchDayCounts>` である
  - メモリの中の形は `ReadonlyMap<LocalDayKey, …>` (`:45`)
- **同種事象探索**: `launch-usage.ts` で `Record<string,` は 2 件 (`:66`、`:209`)
- **リスク/影響**: 今は実害が無い。ただし将来、移行や import のコードがこの型を直接組むと、型の上では日付以外の文字列 (識別子・名前) を鍵に置ける器になる
- **推奨アクション**: `:66` と `:209` を `Readonly<Partial<Record<LocalDayKey, LaunchDayCounts>>>` にする
- **根拠**: DB-1 (許可したキーを型で区別する)、Principle V の Verification
- **scope 根拠**: 型はこの PR で新設した

### [Low] 一時ファイル + rename に fsync が無く、残った `.tmp` を起動時に掃除しない (L-005) (scope: system) [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - `launch-usage-store.ts:189-190` は、writeFile の直後に `sync()` を挟まずに rename する
  - 古い `.tmp` を消す処理は無い
  - roadmap の X-6 の是正項目は「settings store 3 種」のまま (`docs/roadmap.md:323`)
- **同種事象探索**: `src/main/infra/settings` (テストを除く) で `rename\(` は 4 件 (`folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159`)。`fsync|\.sync\(` は 0 件
- **リスク/影響**: 電源断で 0 バイトのファイルが残りうる。その場合は M-002 の経路で記録がリセットされる
- **推奨アクション**: この PR ではコードを変えない。X-6 の行を「4 種」に直し、次の 4 つを 1 つの system follow-up にまとめる
  - 書き込みの後の `sync()`
  - 古い `.tmp` の削除
  - L-008 の `.bak` の後始末
  - 書き込みと退避の共通部品への寄せ
- **根拠**: DB-4
- **scope 根拠**: 4 つの store に共通の構えなので、この feature の中では閉じない

### [Low] 退避の書き込みに失敗すると途中まで書いた `.bak` が残る。後始末が無いのに、テストは「残らない」を常に通る形で固定しており、読み直しのたびに増える (L-008) (scope: feature) [code-gate iter 2 で新規。未解消]

- **観察**:
  - `backupThen` (`launch-usage-store.ts:113-128`) は、`.bak` の `fs.writeFile` が失敗すると `read-failed` / `backup-failed` を返すだけで、`.bak` を消さない。一時ファイルを `rm` で消す `save()` (`:186-195`) と対称になっていない
  - テスト `launch-usage-store.test.ts:183-200` は、`:199` で「`.bak` が 0 件」を確かめている。ところが差し替えた fs の `failingBackup` (`:62-71`) は、ファイルを作る前に投げる。そのため、このアサーションは実装に関係なく常に通る
  - 一時ファイル側のテスト (`:245-258`) は、途中まで書いてから投げる fake (`data.slice(0, 5)`) を使い、後始末を実際に確かめている
  - 実際の `writeFile` は、ENOSPC (テストが想定するコード) のとき、ファイルを作った後で書き込みに失敗しうる
  - service は `read-failed` のとき状態を `unloaded` のままにする (`launch-usage-service.ts:72-74`)。そのため `summary()` と `record()` のたびに `load()` → `backupThen` をやり直し、毎回 `now()` の違う名前で `.bak` を作る
- **同種事象探索**: `src/main/infra/settings` (テストを除く) で、`.bak` を `writeFile` で直接書き、失敗しても消さない箇所は 4 件 (`folder-store.ts:78-79`、`preset-store.ts:75-76`、`provider-store.ts:72-73`、`launch-usage-store.ts:118`)。退避に失敗した後で読み直す設計は launch-usage だけである (他の 3 つは投げる)
- **リスク/影響**:
  - 原文 (`launch-usage.json`) は書き換えないので、記録は失われない
  - ただし、ディスクが満杯の間は、中身の無い `.bak` が操作のたびに増える
  - L-002 の戻し方に従って最新の `.bak` を選ぶと、途中で切れた中身で正しいファイルを上書きしうる
- **推奨アクション**:
  - `backupThen` の catch で `await fs.rm(bakPath, { force: true }).catch(() => undefined)` を呼ぶ (`save()` と同じ形)
  - テストの `failingBackup` を「途中まで書いてから投げる」形に変え、`:199` のアサーションが後始末を実際に確かめるようにする
  - 他の 3 つの store は L-005 の system follow-up に含める
- **根拠**: DB-4 (破損耐性・半端な状態を残さない)、DB-3 (バックアップの信頼性)、reviewer-base H (指摘を検出できるテストがあるか)
- **scope 根拠**: launch-usage-store とそのテストはこの PR で新設した。他の 3 つの store は system scope

### [Low] 日付を作れないとき (`RangeError`) の観測が誤る。`record()` では `write-failed` と出て、`summary()` では何も出ない (L-006) (scope: feature) [H: observability] [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - `record()` は `today()` を try の中で評価する (`launch-usage-service.ts:102`)。catch は、どの例外にも `write-failed code=unknown` を出す (`:106-107`)
  - `summary()` の catch (`:118-120`) は、ログを出さずに `unreadable` を返す
- **同種事象探索**: `launch-usage-service.ts` で `write-failed` は 1 件 (`:107`)。同じファイルでログを出さない catch は 1 件 (`:118`)
- **リスク/影響**: 時計の異常を、ディスクの失敗と読み違える。`summary()` 側は手がかりがまったく無い
- **推奨アクション**: `today()` の失敗に `day-out-of-range` の理由キーを付け、両方の経路でログに出す。ログのテスト (`launch-usage-service.test.ts:217-260`) にケースを 1 つ足す
- **根拠**: reviewer-base H (原因を特定できる観測点)、data-model §4「ログ」
- **scope 根拠**: service はこの PR で新設した

### [Low] 実物の store と service を組み合わせた経路のテストが無い (L-007) (scope: feature) [H: test] [code-gate iter 1 から持ち越し。iter 2 から未解消]

- **観察**:
  - service のテストは fake の store だけを使う
  - store のテストは `load` / `save` を単独で呼ぶ (`launch-usage-store.test.ts:83-270`)
  - E2E は fake を通り、perf は合否を見ない。どちらもこの経路に届かない
  - 次の 2 つの保証を通しで確かめるテストが無い
    - 「将来版のファイルは、`record()` を何回呼んでも中身が変わらない」
    - 「壊れたファイル → `summary()` → `record()` で書き直り、`.bak` に原文が残る」
- **同種事象探索**: `src` で `createLaunchUsageStore` を使うファイルは 3 件 (store 本体・store のテスト・`composition-root.ts:309`)。service と組み合わせたテストは 0 件
- **リスク/影響**: 「将来版を書き換えない」は、2 つの層の取り決め (`newer-version` と `state !== 'loaded'`) で成り立っている。片方を変えても、それぞれの単体テストは通ったままになる
- **推奨アクション**: 同じ一時ディレクトリで、実物の store を service に差したテストを 2 本足す。L-008 の「失敗が続く間に `.bak` が増えない」を 3 本目にしてもよい
- **根拠**: reviewer-base H、SC-005 の計測経路
- **scope 根拠**: テストはこの PR で新設した

## 該当なしの固有観点

- **DB-1 秘密の器**: 該当なし。保存する形は版・日付・`preset` / `manual` の回数だけで、`Record<string, string>` のような何でも入る袋は無い (L-004 は日の鍵の型だけの話)。書き出しのキー集合はテストで固定している (`launch-usage-store.test.ts:204-222`)。プリセットの export / import の型は変わっていない
- **DB-2 既存ファイルとの互換**: 該当なし。新設のファイルで、旧形式が無い。既存の 3 つの store とそのスキーマは diff に無い
- **DB-4 同時書き込み・置き場**: 該当なし
  - 書き込みは `requestSingleInstanceLock` (`src/main/index.ts:68`) と service の Promise の鎖 (`launch-usage-service.ts:58-62`) で直列化している
  - 置き場は `app.getPath('userData')`
  - ENOENT 以外で読めないとき・退避に失敗したときは書かない (`launch-usage-store.ts:136-143`、`launch-usage-service.ts:101`)
- **DB-5 導出値・孤児**: 該当なし。30 日の合計は永続化しない。参照 (セッション id・プリセット id) を持たない
- **DB-6 パスの永続化**: 該当なし。ファイルはパスを持たない。パスは `hostPathOps.join` で組む (`launch-usage-store.ts:102-107`)
- **DB-7 SQL**: 該当なし。SQL のスキーマも migration も存在しない (`tasks.md:115`)
- **H (既存の振る舞いを壊していない根拠)**:
  - iter 2 の後の差分は `virtualization.test.tsx` の timeout だけで、永続化の層・そのテスト・配線に触れていない
  - E2E の CI ステップは `CLOSTA_E2E=1` (`e2e/support/launch.ts:31`) で fake (`e2e-capability.ts:476,593-597`) を通るので、ファイルに書かない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `(perf\|real-sessions).{0,200}(manual\|再利用率\|launch-usage\|起動の利用記録)` とその逆順 (docs/**・perf/**・spec_dir の正本文書) | 0 | なし |
| M-002 | `skippedDays\|reasonKeys` (本番のコード、launch-usage の読み手) | 1 (ログだけ) | `src/main/app/launch-usage-service.ts:81-82` |
| L-001 | `usageUnreadableHint` / main で `status: 'unreadable'` を返す経路 / 将来版を区別する既存の表示 | 2 / 4 / 1 | `session/labels.ts:485`、`PresetPanel.tsx:218` / `launch-usage-service.ts:116,119`、`session-ipc.ts:183,191` / `provider/labels.ts:57` |
| L-002 | `launch-usage` (`docs/roadmap.md`) | 1 (X-6 の行は 0) | `docs/roadmap.md:345` |
| L-003 | 最上位のキーを検査しない構え | 1 (既存) | `src/main/infra/settings/preset-store.ts:112-128` |
| L-004 | `Record<string,` (`launch-usage.ts`) | 2 | `src/domain/session/launch-usage.ts:66,209` |
| L-005 | `rename\(` / `fsync\|\.sync\(` (`src/main/infra/settings`、テストを除く) | 4 / 0 | `folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159` |
| L-006 | `write-failed` / ログを出さない catch (`launch-usage-service.ts`) | 1 / 1 | `launch-usage-service.ts:107` / `:118` |
| L-007 | `createLaunchUsageStore` (src) と service の組み合わせ | 3 ファイル / 組み合わせ 0 | `launch-usage-store.ts`、`launch-usage-store.test.ts`、`composition-root.ts:309` |
| L-008 | `.bak` を writeFile で直接書く箇所 (`src/main/infra/settings`、テストを除く) | 4 | `folder-store.ts:78-79`、`preset-store.ts:75-76`、`provider-store.ts:72-73`、`launch-usage-store.ts:118` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 8
- Round inheritance: iter 2 から解消 0 / 未解消 10 (M-001・M-002・L-001〜L-008。ID と重大度は前回のまま) / 新規 0。L-001 には前例の箇所 (`provider/labels.ts:57-61`) を足したが、重大度は変えていない
