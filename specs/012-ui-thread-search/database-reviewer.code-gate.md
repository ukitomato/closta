# database-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: database-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC: FR-009 (起動元。永続化しない renderer の状態として確認のみ)、FR-010 (`handleLaunchSession` の検証と記録の判定)、FR-011 (記録のキーの集合)、FR-012 (置き場・版・一時ファイル + rename・90 鍵の刈り込み・読み込みの結果の表)、FR-013 (読み出しの DTO)、FR-016 (discovery の置き場と消し方)、SC-005 (固定のキー集合・将来版・日単位の不正・退避の失敗・時計の先跳び・一時ファイルの後始末)、SC-006 (`SessionLaunchConfig` の差分 0。preset のスキーマは変わらない)
- touched files に該当する charter / Confirmation: session charter KPI「再利用率」の計測経路の注記 (`launch-usage.json`)、Constitution Principle V Verification (JSON の永続化スキーマも対象。AD-024 #9)、AD-023 §8 (store は electron を import せず userDataDir を引数で受ける)、AD-041 (h) (`.bak` の重複抑止と退避の一覧・復元 UI は X-6)、AD-038 (E2E は fake でファイルに書かない)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner。値の流れ (ログ・bundle への混入) は見ていない。スキーマの器は G の DB-1 で見た
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner。Principle V はスキーマの形として G で見た
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:1 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2

## スコープ要約

この PR で足した永続化は `launch-usage.json` の 1 つだけ (`{ schemaVersion: 1, days: { "YYYY-MM-DD": { preset, manual } } }`)。持ち主は次の 3 つ: domain の純関数 `src/domain/session/launch-usage.ts`、store `src/main/infra/settings/launch-usage-store.ts`、service `src/main/app/launch-usage-service.ts`。配線は `composition-root.ts:2198-2213` (diff の行)。SQL・migration は無い。preset / provider / folder のスキーマと `SessionLaunchConfig` は変わっていない (scope に `preset-record.ts` / `launch-config.ts` が無いことを確かめた)。renderer の `stores/ui.ts` には zustand の persist も localStorage も無い (Grep で 0 件)。`lastOrigin` / `launchOrigin` はメモリの中だけにある。

確かめた結果、次の 7 点は data-model §4 のとおりだった。
- DB-1: 書き出しは `toLaunchUsageRecord` を通し、許可したキーしか出さない
- DB-3: 版を持ち、将来版のファイルには書き込まない
- DB-4: 書き込みは一時ファイル + rename。失敗したら一時ファイルを消す
- DB-4: 解析に失敗したら空から始める前に `.bak` へ退避し、退避に失敗したら書き込まない
- 読めない (ENOENT 以外) ときは空に倒さない
- `requestSingleInstanceLock` (`src/main/index.ts:68`) があるので、複数のプロセスが last-write-wins で書き合う経路は無い
- 置き場は `app.getPath('userData')` (`composition-root.ts:109`)

以下の指摘は、この表の外にある隙間である。

## Findings

### [Medium] 退避して空から読み直したことが画面に出ず、利用者には「まだ記録がありません」と見える (M-001) (scope: feature)

- **観察**:
  - 最上位の形が崩れている、または日単位の不正があるとき、store は `.bak` に退避し、空 (または一部) を `kind: 'loaded'` で返す (`src/main/infra/settings/launch-usage-store.ts:150,153,162,177`)
  - service はこれを状態 `loaded` にして、ログに `reasons=...` を 1 行出すだけである。`skippedDays` は捨てる (`src/main/app/launch-usage-service.ts:80-86`)。`skippedDays` を本番のコードで読む箇所は 0 件
  - 読み出しの DTO `LaunchUsageSummaryDTO` (`src/domain/session/launch-usage.ts:54-61`) には「退避した」を表す値が無い。そのため renderer は 0/0 を受け取り、空の状態 `usageEmpty`「まだ記録がありません。起動すると…数えます」を出す (`src/renderer/src/features/session/PresetPanel.tsx:222-223`)
- **同種事象探索**: `restoreIssues|skipped` を `src/renderer/src/features/*Screen.tsx` で検索して 2 件。どちらも他の settings の store では読み込み時の退避を画面に出している (`WorkspaceFoldersScreen.tsx:632-646`、`ProviderScreen.tsx:305-309`)。退避を画面に出さないのは launch-usage だけ
- **リスク/影響**: 回数はそれまでの記録を失ったのに、画面は「記録がまだ無い」と言う。KPI「再利用率」の判定者 (spec US-4) は直近 30 日の回数が消えたことに気づけず、リセットの後の少ない件数で判定してしまう。元の記録は `.bak` に残っているので、黙って捨てる経路ではない (Critical ではない)。ただし利用者から見ると、黙って初期化されたのと区別できない
- **推奨アクション**: 案 1 (最小) と案 2 のどちらか。
  - 案 1: service が「この起動で退避した」(`reasonKeys.length > 0`) を覚え、DTO の `ok` に `restored: boolean` を 1 つ足す。`PresetPanel` はそのとき「記録の一部を読めず、退避しました」を出す。チャネルは増えない (SC-006 の「チャネル 1 つ」の内側)。ただし FR-013 / data-model §4 の DTO の形の正本を同じ PR で直す
  - 案 2: 今回は表示を変えず、data-model §4 の「表示」に「退避の後は空の状態と区別しない」と明記する。表示の持ち主は X-6 の退避 UI の行に足す (L-001 と合わせる)
- **根拠**: DB-4 (解析に失敗したときの初期化をユーザに見せない経路)、AD-042 Decision 4 (退避の件数の表示。X-4 で他の store に実装済み)
- **scope 根拠**: touched files (`launch-usage-service.ts` / `launch-usage.ts` / `PresetPanel.tsx` / data-model §4) で直せる

### [Low] `launch-usage.json` の `.bak` の復元手順と、退避の一覧・復元 UI の持ち主が書かれていない (L-001) (scope: feature)

- **観察**:
  - `docs/discovery.md` の追記 (diff の 170-181 行) には `.bak` の名前と「要らなければ消す」はあるが、`.bak` から元に戻す手順が無い
  - roadmap の X-6 の行 (`docs/roadmap.md:323`) が持つ退避の一覧・復元・版不一致の UI は「providers.json・presets.json」だけを名指ししている。`launch-usage.json` は入っていない
  - 将来版のファイルは書き換えないのに、プロセスごとに最初の読み込みで `.bak` を 1 つ作る (`launch-usage-store.ts:158-159`)。旧版のアプリで開き続けると、同じ内容の `.bak` が起動のたびに増える。同じ内容の `.bak` の重複抑止は X-6 の汎用の項目 (AD-041 (h)) なので、そこに含まれる
- **同種事象探索**: `\.bak` を `docs/roadmap.md` で検索して 1 件 (`:323`)。`launch-usage` は X-6 の行に 0 件
- **リスク/影響**: M-001 で退避が起きても、利用者には戻す道が書かれていない。AD-028 §5 (持ち主のいない延期を残さない) に照らすと、復元の持ち主が無い
- **推奨アクション**: discovery の「消し方」の隣に「戻し方」を 1 行足す (アプリを閉じ、`launch-usage.json.<時刻>.bak` を `launch-usage.json` に名前を変える)。roadmap の X-6 の行の退避の一覧・復元の対象に `launch-usage.json` を足す
- **根拠**: DB-3 (バックアップを取るなら復旧手順を書く)、AD-041 (h)、AD-028 §5
- **scope 根拠**: discovery.md / roadmap.md はこの PR の touched files

### [Low] 同じ版のファイルにある最上位の未知のキーは、退避せず次の書き込みで黙って消える (L-002) (scope: feature)

- **観察**: `load()` は最上位の `schemaVersion` と `days` しか見ない (`launch-usage-store.ts:157-163`)。最上位にほかのキーがあっても、`reasonKeys` は空、退避もしない。次の `save` は許可したキーしか書かない (`launch-usage.ts:208-216`) ので、そのキーは跡を残さず消える。一方、日の値に未知のキーがあるとその日を飛ばして退避する (`launch-usage-store.ts:169-177` / `launch-usage.ts:144-152`)。厳しさが層によって違う。data-model §4 の「最上位の形が崩れている」の列挙にも、未知の最上位のキーの扱いが無い
- **同種事象探索**: 最上位のキーを検査しない構えは `preset-store.ts:112-128` も同じ (1 件。既存)
- **リスク/影響**: このアプリの v1 は許可したキーしか書かないので、今の実害は改ざんか手での編集のときだけである。将来、版を上げずに最上位のキーを足す変更が入ると、旧版はそれを黙って捨てる。そうならないための「キーを足したら版を上げる」という規則がどこにも書かれていない
- **推奨アクション**: data-model §4 に「最上位のキーを足す変更は必ず `schemaVersion` を上げる」と 1 行書き、`launch-usage.ts` の `LAUNCH_USAGE_SCHEMA_VERSION` の注記にも同じ文を置く。あわせて、最上位の未知のキーを日単位の不正と同じく「退避して読む」に揃えるかを決める (揃えるなら store に 1 分岐とテストを 1 件足す)
- **根拠**: DB-2 (未知の値を読んだときの挙動)、DB-3 (版の付け方の規則)
- **scope 根拠**: data-model §4 と store はこの PR の新設

### [Low] 保存する形 `LaunchUsageRecord.days` の鍵の型が `string` で、日の鍵の brand が書き出しの型で外れている (L-003) (scope: feature)

- **観察**: `LaunchUsageRecord.days: Readonly<Record<string, LaunchDayCounts>>` (`src/domain/session/launch-usage.ts:64-67`)。メモリの中の形は `ReadonlyMap<LocalDayKey, ...>` (`:44-46`) で、`LocalDayKey` を作れるのは `toLocalDayKey` と `parseLocalDayKey` だけになっている。保存する形の型では、任意の文字列を鍵にしてよいことになっている
- **同種事象探索**: `Record<string,` を `src/domain/session/launch-usage.ts` で検索して 1 件 (`:66`)
- **リスク/影響**: 今、`LaunchUsageRecord` を作るのは `toLaunchUsageRecord` だけで、その入力は brand 付きの Map なので実害は無い。ただし将来この型を直接組むコード (移行・E2E・import) が書かれたとき、型の上では日付以外の文字列 (識別子や名前) を鍵に置ける器になっている。FR-011 の「構造上入らない形」は型の上では閉じていない
- **推奨アクション**: `days: Readonly<Partial<Record<LocalDayKey, LaunchDayCounts>>>` にする (`toLaunchUsageRecord` の `days` の宣言も同じ型にする)
- **根拠**: DB-1 (参照と実体・許可したキーを型で区別する)、Principle V Verification (JSON の永続化スキーマも対象)
- **scope 根拠**: この PR の新設の型

### [Low] 一時ファイル + rename が fsync を伴わず、途中で落ちたときに残った `.tmp` を掃除しない (L-004) (scope: system)

- **観察**: `launch-usage-store.ts:189-190` は writeFile の直後に rename している。fsync / `FileHandle.sync()` は無い。プロセスが writeFile と rename の間で落ちると `launch-usage.json.<時刻>.<連番>.tmp` が残り、起動時の掃除も無い
- **同種事象探索**: `rename\(` を `src/main/infra` (テストを除く) で検索して 4 件 (`folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159`)。`fsync|flush` は `src/main/infra/settings` で 0 件。4 つの store に共通の既存の構え
- **リスク/影響**: 電源断のときに rename だけが残り、中身が 0 バイトになりうる。その場合は解析の失敗から退避して空になるので、M-001 の経路で回数が消える。記録は計測用で、他の store も同じ構えなので Low とする
- **推奨アクション**: この PR では変えない。settings の store 4 つに共通の改修 (書き込みの後の `sync()` と、起動時の古い `.tmp` の削除) として、roadmap の X-6 の行の「settings store 3 種の…是正」に 4 種目として足すか、別の system follow-up にする
- **根拠**: DB-4 (書き込みの原子性と破損耐性)
- **scope 根拠**: 4 つの store に共通の構えで、この feature の touched files だけでは閉じない

### [Low] 日付を作れなかったとき (`RangeError`) も `write-failed` とログに出る (L-005) (scope: feature) [H: observability]

- **観察**: `record()` の try の中で `today()` (`toLocalDayKey`。年が 4 桁の外なら `RangeError`) を呼び、catch はどの例外にも `write-failed code=unknown` を出す (`src/main/app/launch-usage-service.ts:102,106-107`)
- **同種事象探索**: `write-failed` を `src/main/app/launch-usage-service.ts` で検索して 1 件 (`:107`)
- **リスク/影響**: 時計の異常をディスクの書き込みの失敗と読み違える。障害時に原因を特定する観測点として不正確になる
- **推奨アクション**: `today()` の失敗を `day-out-of-range` のような別の理由キーで出す (または `today()` を try の外で先に評価して分ける)。ログのテスト (`launch-usage-service.test.ts:217-260`) に 1 ケース足す
- **根拠**: reviewer-base H (障害時に原因を特定できる観測点)、data-model §4「ログ」(理由キーと errno のコード)
- **scope 根拠**: この PR の新設の service

### [Low] 実物の store と service を組み合わせた経路のテストが無い (L-006) (scope: feature) [H: test]

- **観察**: service のテストは fake の store だけを使う (`src/main/app/launch-usage-service.test.ts:48-67`)。store のテストは `load` / `save` を単独で呼ぶだけ (`src/main/infra/settings/launch-usage-store.test.ts`)。次の 2 つの経路を 1 本で確かめるテストが無い:
  - 壊れたファイル → `summary()` → `record()` でファイルが書き直され、`.bak` に原文が残る
  - 将来版のファイル → `record()` を何回呼んでもファイルの中身が同じ
- **同種事象探索**: `createLaunchUsageService` と `createLaunchUsageStore` を同時に使うテストを `src` で検索して 0 件
- **リスク/影響**: 「将来版を書き換えない」「退避してから書き直す」という保証は、2 つの層の取り決め (store が `newer-version` を返し、service が `state !== 'loaded'` で書かない) で成り立っている。片方の層の結果の名前や分岐を変えても、それぞれの単体テストは通ったまま保証が壊れうる。今は両方の単体テストがそれぞれの側を押さえているので Low とする
- **推奨アクション**: `launch-usage-store.test.ts` と同じ一時ディレクトリで、実物の store を service に差したテストを 2 本足す (上の 2 つの経路)
- **根拠**: reviewer-base H (指摘を検出できるテストがあるか)、SC-005 の計測経路
- **scope 根拠**: この PR の新設のテスト

## 該当なしの固有観点

- DB-6 パスの永続化: 該当なし: `launch-usage.json` はパスを持たない。本体・一時ファイル・`.bak` のパスは `hostPathOps.join` で組み (`launch-usage-store.ts:102-107`)、ファイルにもログにも書かない
- DB-7 SQL: 該当なし: SQL のスキーマ・migration は存在しない (tasks.md:115「DB migration は無い」)
- DB-5 正規化: 該当なし: 30 日の合計は永続化せず読み出しのたびに計算する (`summarizeLaunchUsage`)。参照 (セッション id・プリセット id) を持たないので、孤児になるものが無い
- DB-1 プリセットの export / import の型: 該当なし: preset のスキーマ (`preset-record.ts`) は変わらない。起動元は `SessionLaunchConfig` に入れていない (research R-05 の Alternatives どおり)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `restoreIssues\|skipped` (renderer `*Screen.tsx`) / `skippedDays` (src) | 2 / 本番 0 | `WorkspaceFoldersScreen.tsx:632`、`ProviderScreen.tsx:305` / `launch-usage-store.ts:48,89,91` (生成だけで、読む箇所は無い) |
| L-001 | `\.bak` (`docs/roadmap.md`) / `launch-usage` (X-6 の行) | 1 / 0 | `docs/roadmap.md:323` |
| L-002 | 最上位のキーを検査しない構え | 1 | `src/main/infra/settings/preset-store.ts:112-128` |
| L-003 | `Record<string,` (`launch-usage.ts`) | 1 | `src/domain/session/launch-usage.ts:66` |
| L-004 | `rename\(` (`src/main/infra`、テストを除く) / `fsync\|flush` | 4 / 0 | `folder-store.ts:168`、`launch-usage-store.ts:190`、`preset-store.ts:173`、`provider-store.ts:159` |
| L-005 | `write-failed` (`launch-usage-service.ts`) | 1 | `src/main/app/launch-usage-service.ts:107` |
| L-006 | `createLaunchUsageService` と `createLaunchUsageStore` を同時に使うテスト | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 6
