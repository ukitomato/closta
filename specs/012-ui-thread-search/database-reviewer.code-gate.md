# database-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: database-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: code-gate iteration 2 (pr-gate Round 1 の修正の後。base 7bdb271..HEAD ddc052e)
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-009: 起動元。renderer のメモリの中だけにある。今回も確かめた: renderer に `localStorage|sessionStorage|indexedDB|zustand/middleware|persist(` は 0 件
  - FR-010: `handleLaunchSession` の検証と、記録するかの判定 (`src/main/app/session-ipc.ts:161-163`)
  - FR-011: 記録のキーの集合
  - FR-012: 置き場・版・一時ファイル + rename・90 鍵の刈り込み・読み込みの結果の表
  - FR-013: 読み出しの DTO
  - FR-016: discovery / session charter / roadmap にある置き場・消し方・計測経路
  - FR-018: 新しい CI ステップ。偽の capability を通り、ファイルに書かないことを確かめた
  - SC-005: キー集合の固定・将来版・日単位の不正・退避の失敗・一時ファイルの後始末
  - SC-006: preset / provider / folder のスキーマと `SessionLaunchConfig` の差分 0
- touched files に該当する charter / Confirmation:
  - session charter の KPI「再利用率」の計測経路の注記 (`docs/domains/session/charter.md:165-179`)
  - Constitution Principle V の Verification (JSON の永続化スキーマも対象。AD-024 #9。`.specify/memory/constitution.md:510-514`)
  - AD-023 §8: store は electron を import しない
  - AD-038 D3: E2E は `src/main/index.ts:100-123` で fake に差し替わる
  - AD-041 (h): 退避ファイルの一覧・復元 UI は X-6
  - AD-042 Decision 4: 退避の通知と「今後の規則」
  - AD-007: SQL はまだ無い
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner。値の流れは見ていない。器 (スキーマの形) は G の DB-1 で見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner。KPI の記録の書き手の不変条件は DB-5 として G で扱った
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner。Principle V はスキーマの形として G で見た
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:2 Low:6
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

この PR で足した永続化は `launch-usage.json` の 1 つだけ (`{ schemaVersion: 1, days: { "YYYY-MM-DD": { preset, manual } } }`)。

- 持ち主: `src/domain/session/launch-usage.ts` / `src/main/infra/settings/launch-usage-store.ts` / `src/main/app/launch-usage-service.ts`
- 配線: `composition-root.ts:109,308-309,353-354`
- SQL と migration は無い

iter 1 の後の修正 (9d98c39..ddc052e) は pr-gate R1 C-001 だけを直している。変わったのは次の 4 つ:

- `.github/workflows/verify.yml:166-172` の e2e ステップ
- `e2e/sidebar-screenshot.spec.ts`
- `session-list/labels.ts` の placeholder
- 基準画像

永続化の層には触れていない。前回の指摘で示した行番号はすべて同じ内容のままだった。

新しい e2e ステップは `launchApp` (`e2e/support/launch.ts:27-34`、`CLOSTA_E2E=1`) を通る。このため記録はメモリ内の fake (`e2e-capability.ts:476,593-597`) に入り、ファイルには書かない。10 本起動するケースでも、永続化の後退は無い。

前回の 7 件と、pr-gate R1 で database が出した 2 件は、HEAD でどれも直っていない。新しい指摘は 1 件ある (L-008)。

## Findings

### [Medium] perf の実機計測が、利用者の本物の `launch-usage.json` に 1 回あたり最大 10 回の `manual` を書く (M-001) (scope: feature) [pr-gate R1 database:M-001 / Medium #8 から持ち越し。HEAD で直っていない]

- **観察**:
  - `perf/real-sessions.spec.ts:166,179-185` は `CLOSTA_E2E` を取り除き、`--user-data-dir` を付けずに `electron.launch` を呼ぶ。そのため起動するのは本物の composition で、置き場は `app.getPath('userData')` になる (`composition-root.ts:109,309`)
  - perf は軸を手で選ぶ (`:106,109,113,126`)。起動元は `manual` になり、`SESSIONS = 10` (`:34`) 本を起動する。受け付けられるたびに 1 回記録される (`session-ipc.ts:163`)
  - 記録から外れる経路として書かれているのは E2E だけ (`docs/discovery.md:370`、`docs/domains/session/charter.md:179`)
- **同種事象探索**: perf と記録の両方に触れる文 (`(perf|real-sessions).{0,200}(manual|再利用率|launch-usage|起動の利用記録)` とその逆順) を、`docs/**`・`perf/**`・spec_dir の spec / plan / tasks / data-model / quickstart(-results) で検索した。結果は 0 件 (当たるのは gate の報告だけ)
- **リスク/影響**:
  - 記録は日ごとの 2 つの回数しか持たない (FR-011)。後から計測の分だけを取り除けない
  - KPI は直近 30 日の回数で判定し、最低件数を持たない (FR-016)。O-8 で数回流すだけで判定が覆る
- **推奨アクション**: 案は 2 つ。
  - 最小案: discovery の `launch-usage.json` の節、roadmap の O-8 の行 (`docs/roadmap.md:349`)、session charter の計測経路の注記の 3 か所に書く。内容は「perf の 1 回は `manual` を最大 10 回足す。計測の前に退避し、後で戻す」
  - 案 2: perf の spec が `app.evaluate` で userData を取り、`launch-usage.json` を複製して `afterAll` で書き戻す
  - どちらの案でも、本番のコードに env で記録を止める分岐は足さない (AD-038 D3)
- **根拠**: DB-5 (書き手の不変条件)、session charter の KPI の計測経路
- **scope 根拠**: perf / discovery / roadmap / session charter はこの PR の touched files

### [Medium] 退避して空から読み直しても画面に出ず、「まだ記録がありません」と見える (M-002) (scope: feature) [code-gate iter 1 M-001 / pr-gate R1 Medium #9 から持ち越し]

- **観察**:
  - store は退避した後、空 (または一部) を `loaded` で返す (`launch-usage-store.ts:150,153,162,177`)
  - service はログを 1 行出すだけで、`skippedDays` を捨てる (`launch-usage-service.ts:80-86`)
  - DTO (`launch-usage.ts:54-61`) には「退避した」を表す値が無い。そのため `PresetPanel.tsx:220-224` は `usageEmpty` を出す
- **同種事象探索**: `skippedDays|reasonKeys` を本番のコードで読むのは `launch-usage-service.ts:81-82` のログだけ (1 件)。renderer に届く箇所は 0 件。他の store は退避を画面に出している (`WorkspaceFoldersScreen.tsx:632-646`、`ProviderScreen.tsx:305-309`)
- **リスク/影響**: 回数を失っても、KPI を判定する人には気づく手段が無い。原文は `.bak` に残るので Critical ではない
- **推奨アクション**: `ok` の DTO に `restored: boolean` を足し、PresetPanel に 1 行出す (チャネルは増えない)。直さないなら、data-model §4「表示」に「退避の後は空の状態と区別しない」と書き、表示の持ち主を X-6 にする
- **根拠**: DB-4 (初期化を利用者に見せない経路)、AD-042 Decision 4 (退避の通知)
- **scope 根拠**: この PR で新設した service / DTO / PresetPanel / data-model

### [Low] 将来版 (ダウングレード) が DTO で「読めない」に潰れ、果たされない「次に開いたときに読み直します」が出る (L-001) (scope: feature) [pr-gate R1 database:L-001 (Medium #1 に dedup) から持ち越し]

- **観察**:
  - service は `newer-version` をそのプロセスの間は確定させ、読み直さない (`launch-usage-service.ts:65,75-79`)
  - それでも DTO は理由を持たない `unreadable` で (`launch-usage.ts:61`)、文言は `usageUnreadableHint` (`session/labels.ts:485`、`PresetPanel.tsx:218`) になる
- **同種事象探索**: `usageUnreadableHint` は 2 件 (`labels.ts:485`、`PresetPanel.tsx:218`)。`status: 'unreadable'` を返す経路は 3 件 (`launch-usage-service.ts:116,119`、`session-ipc.ts:183,191`)
- **リスク/影響**: 旧版のアプリで開いている間は、約束された「読み直し」が起きない。新しい版で開けば読めることが示されない。データは失われない
- **推奨アクション**: 案は 2 つ。
  - hint を両方の場合に当てはまる文にする
  - `unreadable` に `reason: 'newer-version' | 'read-failed'` を足して文言を分ける。このときは FR-013 / data-model §4 の正本を同じ PR で直す
- **根拠**: DB-3 (ダウングレード時の挙動)
- **scope 根拠**: この PR で新設した DTO と文言

### [Low] `.bak` からの戻し方が書かれておらず、退避の一覧・復元の持ち主に `launch-usage.json` が無い (L-002) (scope: feature) [code-gate iter 1 L-001 から持ち越し]

- **観察**:
  - `docs/discovery.md:367-369` には消し方しか無い
  - roadmap の X-6 の行 (`docs/roadmap.md:323`) の退避の一覧・復元は `providers.json`・`presets.json` だけを名指ししている
  - 将来版では、プロセスごとに `.bak` が 1 つ増える (`launch-usage-store.ts:158-159`)
- **同種事象探索**: `launch-usage` を `docs/roadmap.md` で検索して 1 件 (`:345`。O-3 の行)。X-6 の行には 0 件
- **リスク/影響**: M-002 の退避が起きても戻す道が無い (AD-028 §5)
- **推奨アクション**:
  - discovery に「アプリを閉じ、`launch-usage.json.<時刻>.bak` を `launch-usage.json` に改名する」を足す。L-008 を直さない場合は「中身が空・途中で切れた `.bak` は選ばない」も添える
  - X-6 の行の対象に `launch-usage.json` を足す
- **根拠**: DB-3 (バックアップを取るなら復旧手順を書く)、AD-041 (h)
- **scope 根拠**: discovery.md / roadmap.md は touched files

### [Low] 同じ版のファイルにある最上位の未知のキーが、退避されずに次の書き込みで黙って消える (L-003) (scope: feature) [code-gate iter 1 L-002 から持ち越し]

- **観察**: store が見るのは `schemaVersion` と `days` だけ (`launch-usage-store.ts:157-163`)。書き出しは許可したキーしか出さない (`launch-usage.ts:208-216`)。一方、日の値に未知のキーがあると、その日を飛ばして退避する (`launch-usage.ts:144-152`)。層によって厳しさが違う
- **同種事象探索**: 最上位のキーを検査しない構えは `preset-store.ts:112-128` にもある (既存の 1 件)
- **リスク/影響**: 将来、版を上げずに最上位のキーを足すと、旧版がそのキーを跡なく消す。AD-042 の「今後の規則」は、旧版が拒否せずに捨てる変更を対象にしていない
- **推奨アクション**: data-model §4 と `LAUNCH_USAGE_SCHEMA_VERSION` (`launch-usage.ts:31`) の注記に「最上位のキーを足す変更は必ず版を上げる」と書く
- **根拠**: DB-2 / DB-3
- **scope 根拠**: この PR で新設した store と data-model

### [Low] 保存する形 `LaunchUsageRecord.days` の鍵が `string` で、日の鍵の brand が外れている (L-004) (scope: feature) [code-gate iter 1 L-003 から持ち越し]

- **観察**: `launch-usage.ts:66` は `Readonly<Record<string, LaunchDayCounts>>`、`:209` の局所の宣言も `Record<string, …>` である。メモリの中の形は `ReadonlyMap<LocalDayKey, …>` (`:45`)
- **同種事象探索**: `Record<string,` を `launch-usage.ts` で検索して 2 件 (`:66`、`:209`)
- **リスク/影響**: 今は実害が無い。将来、移行や import のコードがこの型を直接組むと、型の上では日付以外の文字列 (識別子・名前) を鍵に置ける器になる
- **推奨アクション**: `:66` と `:209` を `Readonly<Partial<Record<LocalDayKey, LaunchDayCounts>>>` にする
- **根拠**: DB-1 (許可したキーを型で区別する)、Principle V Verification
- **scope 根拠**: この PR で新設した型

### [Low] 一時ファイル + rename に fsync が無く、残った `.tmp` を起動時に掃除しない (L-005) (scope: system) [code-gate iter 1 L-004 から持ち越し]

- **観察**: `launch-usage-store.ts:189-190` は、writeFile の直後に `sync()` を挟まずに rename する。古い `.tmp` を消す処理は無い。X-6 の是正項目は「settings store 3 種」のまま (`docs/roadmap.md:323`)
- **同種事象探索**: `rename\(` を `src/main/infra/settings` (テストを除く) で検索して 4 件 (`folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159`)。`fsync|sync\(` は 0 件
- **リスク/影響**: 電源断で 0 バイトのファイルが残りうる。その場合は M-002 の経路で記録がリセットされる
- **推奨アクション**: この PR では変えない。X-6 の行を「4 種」に直し、次の 4 つを 1 つの system follow-up にまとめる:
  - 書き込みの後の `sync()`
  - 古い `.tmp` の削除
  - L-008 の `.bak` の後始末
  - 書き込みと退避の共通部品への寄せ
- **根拠**: DB-4
- **scope 根拠**: 4 つの store に共通の構えなので、この feature では閉じない

### [Low] 退避の書き込みに失敗すると、途中まで書いた `.bak` が残る。後始末の無さをテストが逆に「残らない」と固定しており、読み直しのたびに増える (L-008) (scope: feature) [new]

- **観察**:
  - `backupThen` (`launch-usage-store.ts:113-128`) は `fs.writeFile(... .bak)` が失敗すると `read-failed` / `backup-failed` を返すだけで、`.bak` を消さない。`save()` (`:186-195`) が一時ファイルを `rm` で消すのと対称になっていない
  - テストの退避の失敗のケース (`launch-usage-store.test.ts:183-200`) は `:199` で「`.bak` が 0 件」を確かめている。ところが差し替えた fs の `failingBackup` (`:62-71`) は、ファイルを作る前に投げる。そのため、このアサーションは実装に関係なく常に通る
  - これに対し、一時ファイルの側のテスト (`:245-258`) は途中まで書いてから投げる fake (`data.slice(0, 5)`) を使い、後始末を実際に確かめている
  - 実際の `writeFile` は ENOSPC (テストが使うコード) のとき、ファイルを作った後で書き込みに失敗する。0 バイトか途中までのファイルが残る
  - service は `read-failed` のとき状態を `unloaded` のままにする (`launch-usage-service.ts:72-74`)。そのため `summary()` (起動ダイアログを開くたび) と `record()` (起動を受け付けるたび) のたびに `load()` → `backupThen` をやり直す。毎回 `now()` の違う名前で `.bak` を作る
- **同種事象探索**: `.bak` を `writeFile` で直接書き、失敗しても消さない箇所は src/main/infra/settings (テストを除く) で 4 件 (`folder-store.ts:78-79`、`preset-store.ts:74-77`、`provider-store.ts:71-74`、`launch-usage-store.ts:118`)。退避の失敗の後に読み直す設計は launch-usage だけ (他の 3 つは投げる)
- **リスク/影響**: 原文 (`launch-usage.json`) は書き換えないので、記録は失われない。ただし、ディスクが満杯のあいだは中身の無い `.bak` が操作のたびに増える。L-002 の戻し方に従って最新の `.bak` を選ぶと、途中で切れた中身で元の正しいファイルを上書きしうる。テストは、この後始末が無いことを「残らない」として固定している
- **推奨アクション**:
  - `backupThen` の catch で `await fs.rm(bakPath, { force: true }).catch(() => undefined)` を呼ぶ (`save()` と同じ形)
  - テストの `failingBackup` を「途中まで書いてから投げる」形に変え、`:199` のアサーションが実際の後始末を確かめるようにする
  - 他の 3 つの store は L-005 の system follow-up に含める
- **根拠**: DB-4 (破損耐性・半端な状態を残さない)、DB-3 (バックアップの信頼性)、reviewer-base H (指摘を検出できるテストがあるか)
- **scope 根拠**: launch-usage-store とそのテストはこの PR で新設した。他の 3 つの store は system

### [Low] 日付を作れないとき (`RangeError`) の観測が誤る。`record()` では `write-failed` と出て、`summary()` では何も出ない (L-006) (scope: feature) [H: observability] [code-gate iter 1 L-005 から持ち越し。箇所を 1 つ足した]

- **観察**:
  - `record()` は `today()` を try の中で評価する (`launch-usage-service.ts:102`)。catch は、どの例外にも `write-failed code=unknown` を出す (`:106-107`)
  - `summary()` の catch (`:118-120`) は、ログを出さずに `unreadable` を返す
- **同種事象探索**: `write-failed` は `launch-usage-service.ts` で 1 件 (`:107`)。ログを出さない catch は同じファイルで 1 件 (`:118`)
- **リスク/影響**: 時計の異常をディスクの失敗と読み違える。`summary()` 側は手がかりがまったく無い
- **推奨アクション**: `today()` の失敗に `day-out-of-range` の理由キーを付け、両方の経路でログに出す。ログのテスト (`launch-usage-service.test.ts:217-260`) に 1 ケース足す
- **根拠**: reviewer-base H (原因を特定できる観測点)、data-model §4「ログ」
- **scope 根拠**: この PR で新設した service

### [Low] 実物の store と service を組み合わせた経路のテストが無い (L-007) (scope: feature) [H: test] [code-gate iter 1 L-006 から持ち越し]

- **観察**:
  - service のテストは fake の store だけを使う
  - store のテストは `load` / `save` を単独で呼ぶ (`launch-usage-store.test.ts:83-270`)
  - E2E は fake を通り、perf は合否を見ない。どちらもこの経路に届かない
  - 次の 2 つの保証を通しで確かめるテストが無い:
    - 「将来版のファイルは、`record()` を何回呼んでも中身が同じ」
    - 「壊れたファイル → `summary()` → `record()` で書き直り、`.bak` に原文が残る」
- **同種事象探索**: `createLaunchUsageStore` を使うファイルは 3 件 (store 本体・store のテスト・`composition-root.ts:309`)。service と組み合わせたテストは 0 件
- **リスク/影響**: 「将来版を書き換えない」は、2 つの層の取り決め (`newer-version` と `state !== 'loaded'`) で成り立っている。片方を変えても、それぞれの単体テストは通ったままになる
- **推奨アクション**: 同じ一時ディレクトリで、実物の store を service に差したテストを 2 本足す。L-008 の「失敗が続くあいだ `.bak` が増えない」を 3 本目に加えてもよい
- **根拠**: reviewer-base H、SC-005 の計測経路
- **scope 根拠**: この PR で新設したテスト

## 該当なしの固有観点

- DB-1 秘密の器: 該当なし。保存する形は版・日付・`preset` / `manual` の回数だけ。`Record<string, string>` のように何でも入る袋は無い (L-004 は日の鍵の型だけ)。書き出しのキー集合はテストで固定している (`launch-usage-store.test.ts:204-222`)。プリセットの export / import の型は変わらない
- DB-2 既存ファイルとの互換: 該当なし。新設のファイルで、旧形式が無い。既存の 3 つの store とそのスキーマは scope に無い
- DB-4 同時書き込み・置き場: 該当なし。`requestSingleInstanceLock` (`src/main/index.ts:68`) と service の Promise の鎖で直列化している。置き場は `app.getPath('userData')`。ENOENT 以外で読めないとき、退避に失敗したときは書かない
- DB-5 導出値・孤児: 該当なし。30 日の合計は永続化しない。参照 (セッション id・プリセット id) を持たない
- DB-6 パスの永続化: 該当なし。ファイルはパスを持たない。パスは `hostPathOps.join` で組む (`launch-usage-store.ts:102-107`)
- DB-7 SQL: 該当なし。SQL のスキーマと migration は存在しない (tasks.md:115)
- H (既存の振る舞いを壊していない根拠): iter 1 の後の差分は永続化の層に触れていない。新しい CI ステップは `CLOSTA_E2E=1` の fake を通り、ファイルに書かない (`e2e/support/launch.ts:27-34`、`src/main/index.ts:100-123`)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `(perf\|real-sessions).{0,200}(manual\|再利用率\|launch-usage\|起動の利用記録)` とその逆順 (docs/**・perf/**・spec_dir の正本文書) | 0 | (gate の報告だけに当たる) |
| M-002 | `skippedDays\|reasonKeys` (本番のコード) | 1 (ログだけ) | `src/main/app/launch-usage-service.ts:81-82` |
| L-001 | `usageUnreadableHint` (src/renderer) / `status: 'unreadable'` を返す経路 | 2 / 3 | `session/labels.ts:485`、`PresetPanel.tsx:218` / `launch-usage-service.ts:116,119`、`session-ipc.ts:183,191` |
| L-002 | `launch-usage` (`docs/roadmap.md`) | 1 (X-6 の行は 0) | `docs/roadmap.md:345` |
| L-003 | 最上位のキーを検査しない構え | 1 (既存) | `src/main/infra/settings/preset-store.ts:112-128` |
| L-004 | `Record<string,` (`launch-usage.ts`) | 2 | `src/domain/session/launch-usage.ts:66,209` |
| L-005 | `rename\(` (`src/main/infra/settings`、テストを除く) / `fsync\|sync\(` | 4 / 0 | `folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159` |
| L-006 | `write-failed` / ログを出さない catch (`launch-usage-service.ts`) | 1 / 1 | `launch-usage-service.ts:107` / `:118` |
| L-007 | `createLaunchUsageStore` (src) と service の組み合わせ | 3 ファイル / 組み合わせ 0 | `launch-usage-store.ts`、`launch-usage-store.test.ts`、`composition-root.ts:309` |
| L-008 | `\.bak\`` を writeFile で直接書く箇所 (src/main/infra/settings、テストを除く) | 4 | `folder-store.ts:78-79`、`preset-store.ts:74-77`、`provider-store.ts:71-74`、`launch-usage-store.ts:118` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 8
- Round inheritance: iter 1 から解消 0 / 未解消 7 (iter 1 の M-001・L-001〜L-006 → 今回の M-002・L-002〜L-007) / pr-gate R1 から引き継いで未解消 2 (M-001・L-001) / 新規 1 (L-008)
