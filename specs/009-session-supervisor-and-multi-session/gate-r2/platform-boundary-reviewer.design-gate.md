# platform-boundary-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md (+ plan.md / tasks.md)
**Round**: 2

## 初回読了 viewpoint

- FR/SC: この bundle は FR-001〜FR-016 / SC-001〜SC-010 の全件に関わる。本 reviewer の担当スライスに直接かかるのは次の項目。
  - FR-001 / SC-009 (Principle VII と単独起動の検証経路)
  - FR-002 / SC-002 (本文を解釈しないこと、項目 18)
  - FR-005 (枠を `claude` の生存で数えること)
  - FR-012 / FR-013 / FR-014 / SC-007 / SC-008 (異常終了時の回収、pid kill)
  - FR-015 (AD-036 §3 の読み替え)
- touched files に該当する charter / Confirmation:
  - AD-003 Decision Outcome (インスタンスは複数ありうる)
  - AD-018 Consequences (docker 経由の kill 伝播は未測定)
  - AD-036 §3
  - Constitution Principle II / V / VI (項目 7) / VII の Verification
  - `agents-not-to-electron` の限界注記 (`.dependency-cruiser.js:183-189`)
  - 計画中の check.mjs 項目 18 / 19 / 20
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer。pid の検証と本人確認は H-001 でプラットフォーム境界 (Principle II / 項目 7) の側からだけ扱った
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: 回収モジュールは `reap-wsl-launchers.ts` (WslRuntime 専用、条件付き) に改められた。runtime charter の Out of scope への侵犯はもう読み取れない。isolation charter には触れていない
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:0
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1 (このほか、H-001 / M-001 / M-002 / M-003 を検出するテストや fixture が無い点を、各指摘の推奨アクションに含めた)

## スコープ要約

R1 の指摘を受けて、bundle は次のように改訂された。

- 項目 18 / 19 / 20 を新設した。
- 制御行のデコードを `supervisor-protocol.ts` に分離した。
- 世代番号を導入し、`child-exited` を即時に送るようにした。
- 回収経路は SH-000 (3) の結果に応じて条件付きで作り、WslRuntime 専用とした。
- `transport.onClosed` を扱い、E2E を「本物の起動調停 + fake の supervisor 接続」で組むことにした。
- before-quit に再入ガードを足し、worker のパスは `?modulePath` から起動引数で渡すことにした。

R1 で本 reviewer が出した 11 件は、すべて resolved と判定した。今回の Round では、これらの解消策を実装に落としたときに生じる穴を見た。

PB-1 / PB-2 / PB-3 / PB-4 / PB-5 / PB-6 は、次の理由で該当なしとした。

- PB-1: 該当なし。worker のパスは main の `?modulePath` が返すホスト側の絶対パスで、ホスト上の supervisor が消費するため名前空間は一致する。同一フォルダ警告の照合限界は spec の Edge Cases (`spec.md:153`) に記録済み。
- PB-2: 該当なし。registry に世代番号が入り、別世代のメッセージを捨てる規則と BE-020 の単体がある。
- PB-3: 該当なし。`capabilities` の算出にも表明にも変更が無い。
- PB-4: 該当なし。stdio 経路の launch も既存の安全 3 値 decoder を通る。異常終了後に自動再開はしない。
- PB-5: 該当なし。変換段数に変更が無く、docker endpoint は範囲外。
- PB-6: 該当なし。名前付きボリューム・`--restart`・ディストロへの書き込みは無い。

## R1 指摘の継承判定

| R1 ID | 判定 | 根拠 |
|---|---|---|
| H-001 (pid kill の規則が無い / pid 未検証) | resolved from prev | 項目 19 を新設 (`plan.md:247`)。pid の受理条件を明記 (`:185`)。`child-exited` は即時に送る (`:163`, `:186`)。FR-015 に AD-036 §3 を追加。回収関数は deps として注入する (`:188`)。ただし解消策の内部に新しい穴があり、今回の H-001 として出す |
| H-002 (`claudeAlive` の合成 / 未 spawn で枠が戻らない) | resolved from prev | 枠の終了条件 3 つを FR-005 に規定。Worker の exit では `killPid` の後に false にする。デコード失敗でも `ended` を送る。SC-008 にスレッドの異常終了を追加。BE-022 に単体がある |
| M-001 (存在しない「Principle IX 検査」) | resolved from prev | 項目 18 を新設し、`OpaqueBody`、`supervisor-protocol.ts` への分離、`UNDETECTED_NOTES` の記録を入れた。FR-002 は「解釈しない」に改められた |
| M-002 (単独起動の entry と worker の解決) | resolved from prev | worker パスは起動引数で受け取る。SH-000 (4) を追加。SC-009 は「ビルドした supervisor」を起動する |
| M-003 (reap がランタイム非依存) | resolved from prev | `reapWslLaunchers` (WslRuntime 専用) とし、Out of Scope に限定を明記した |
| M-004 (世代が無い) | resolved from prev | 世代番号を導入。BE-020 に並行する launch のケースがある |
| M-005 (`onClosed` が無い) | resolved from prev | FR-001、plan、BE-005、US-3 AC4 で扱われた |
| M-006 (E2E の stub) | resolved from prev | USER 決定、plan、BE-021 での `e2e-capability` の dispose 非同期化 |
| L-001 (folderId 照合) | resolved from prev | Edge Cases に限界として記録した |
| L-002 (before-quit の再入 / V-8) | resolved from prev | `quitting` フラグ、BE-021 の観点、申し送り #8 の V-8 への言及 |
| L-003 (agents の標準モジュール禁止は import 文の層だけ) | resolved from prev | `UNDETECTED_NOTES` に記録。`node:crypto` の import 許可は不要にした |

## Findings

### [High] pid kill の本人確認に照合データの出所が無い。調停役スレッド側の回収には本人確認も pid 検証も無く、AD-043 Decision 5 と食い違う (H-001) (scope: feature) — new (R1 H-001 の解消策の中に生じた穴)

- **観察**:
  - AD-043 Decision 5 (`plan.md:233`) は、Worker の異常終了時の回収 (調停役スレッド) と supervisor の異常終了時の回収 (main) の**両方**について「pid は検証し、kill 前に本人確認をする」と定めている。R-06 (`:260`) も本人確認を必須としている。
  - **データの出所が無い**: main/infra 節は「spawn 時に受けた image 名とプロセス生成時刻と照合」とする (`plan.md:187`)。しかしセッションスレッドが送るのは `{ kind: 'spawned', pid }` だけである (`plan.md:171`)。Node の `ChildProcess` はプロセス生成時刻を公開しない。Windows で生成時刻を得るには OS への問い合わせ (PowerShell / `wmic` の spawn か、ネイティブ API) が要る。
  - **担い手のレイヤ**: 調停役スレッドの回収 (`plan.md:164`) は「記録した pid を `killPid` で止める」だけで、本人確認も pid の検証も書かれていない。Worker が名乗る sessionId は信用しないのに (`:159`)、Worker が名乗る pid は無検証で kill に使っている。agents で本人確認をするには OS への問い合わせが要り、spawn で行えば項目 7 に、プラットフォーム固有の処理を agents に置けば Principle II に当たる。
  - **WslRuntime 専用の限定が型にも分岐にも無い**: registry のエントリ (`plan.md:199`) にも、調停役スレッドの帳簿にも、ランタイム種別が無い。
  - BE-022 の観点には調停役スレッドの回収での pid 検証と本人確認が無い。BE-023 は「本人確認が合わなければ止めない」を挙げるが、照合するデータを誰が採るかは決まっていない。
- **同種事象探索**: `本人確認|image 名|生成時刻` を spec_dir の *.md で検索 → 009 本体で 4 件 (`plan.md:187`, `:233`, `:260`, `tasks.md:130`)。照合データを採る責務を書いた行は 0 件。
- **リスク/影響**: 実装者は (a) 本人確認を黙って省く (b) agents や main/app で OS 問い合わせのプロセスを起こし Principle II / 項目 7 を破る (c) 照合できずに常に kill しない、のどれかに追い込まれる。いずれの場合も Decision 5 の Confirmation は書面上だけ満たされる。
- **推奨アクション**:
  1. 本人確認のデータの出所と担い手を plan に書く。最小案: SH-000 (3) で「Worker の `terminate()` で子が残らない」ことが測れたら、調停役スレッドの `killPid` 経路を外す。残す場合: 照合データを採るのは `main/infra/runtime` の 1 モジュールに限り、`PROCESS_SPAWN_MODULES` に実名で登録する。調停役スレッドでは本人確認を行わず、「`child-exited` 未着、かつ Worker の exit から N ms 以内」に限って kill する。これを Decision 5 に書き分ける。
  2. 調停役スレッドの `spawned` 受信に pid の検証 (`Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid`、1 Worker あたり最初の 1 件だけ) を足す。BE-022 に負例を足す。
  3. 回収の対象を「WslRuntime で起動したセッション」に限ることを registry のエントリ (`runtimeKind` か `reapable: boolean`) で表現する。BE-023 に「`reapable: false` のエントリは止めない」を足す。
- **根拠**: AD-043 Decision 5 / Constitution Principle II / Principle VI 項目 7 / AD-018 Consequences / AD-003 Decision Outcome
- **scope 根拠**: plan の agents 節・main/infra 節・ADR 節、tasks BE-022 / BE-023 はいずれもこの feature の範囲

### [Medium] 新設の項目 19 の正規表現は、plan 自身が書く「`process.kill` を渡す」形を捕捉しない。項目 18 も等価な書き方を取りこぼす (M-001) (scope: feature) — new

- **観察**:
  - 項目 19 は `process\s*\.\s*kill\s*\(` を書けるモジュールの許可リストである (`plan.md:247`)。plan の supervisor entry は「`runSupervisor` に本物の … `process.kill` / タイマを渡すだけ」とする (`plan.md:167`)。素直に実装すると `killPid: process.kill` か `process.kill.bind(process)` になり、正規表現に一致しない。登録予定の唯一の実ファイルが検査から見えなくなる。
  - ほかに一致しない形: `process['kill'](pid)`、`const { kill } = process; kill(pid)`、`process.kill.call(process, pid)`。Constitution Principle II の検査は分割代入とブラケット記法を対象に含めているが、項目 19 の記述はそれを踏襲していない。
  - 項目 18 (`JSON.parse` 0 件) も `JSON['parse']`、`const { parse } = JSON`、`Reflect.apply(JSON.parse, …)` を取りこぼす。
  - 項目 20 (`SHARE_ENV` 0 件) は、`new Worker(path, { env: { ...process.env, ...spec.env } })` のように資格情報を Worker の `process.env` に混ぜる形を見ない。
- **同種事象探索**: `process\s*\.\s*kill|JSON\.parse|SHARE_ENV` を plan.md で検索 → 項目 18 / 19 / 20 の定義行 (`plan.md:246-248`) と `:167`。違反 fixture の形を指定した行は 0 件。
- **リスク/影響**: 項目 19 が「`supervisor.ts` 1 件を許可」と記録されても実際には一度も一致せず、許可リストの外に pid kill を書いても検出されない。AD-024 が挙げる「ルールが 1 件も一致しない形で書かれている」問題の再生産になる。
- **推奨アクション**: 項目 19 は呼び出しではなく**参照**で数える (例: `/\bprocess\s*(?:\.\s*kill\b|\[\s*['"`]kill['"`]\s*\])/` と分割代入の検出)。項目 18 も `JSON` の `parse` の参照で数える。違反 fixture に参照渡し・ブラケット・分割代入・`.call` の 4 形を入れ、拾えない形は `UNDETECTED_NOTES` に記録する。項目 20 に、`new Worker(` の第 2 引数で `env:` を指定したら違反とする規則を足すか、残余として記録する。
- **根拠**: PB-7 / AD-024 #2 / Constitution Principle II Verification
- **scope 根拠**: `check.mjs` 項目 18〜20 と `tests/rule-fixtures/` はこの feature の touched files

### [Medium] Worker から調停役スレッドへの状態通知のデコード位置が未定義。項目 18 と「payload は string」の検査とが両立しない (M-002) (scope: feature) — new

- **観察**:
  - 調停役スレッドは Worker からの envelope について「`kind` は enum、`payload` は string であることを確かめる」(`plan.md:159`)。一方で、状態通知はバッチャで `coalesceUpdates` に通す (`:162`)。`coalesceUpdates` は構造化された `SessionStatusUpdate` を取る。
  - 状態通知の payload が文字列なら、調停役スレッドのどこかで `JSON.parse` が要る。ところが項目 18 は `supervisor.ts` / `supervisor-core.ts` での `JSON.parse` を 0 件とする。`decodeSupervisorRequest` が受け付けるのは main からの `launch` / `control` だけである。
  - Worker からの `state` / `failure` / `spawned` / `child-exited` を、どの形で送り、どこでデコードするかを書いた行が無い。
- **同種事象探索**: `payload` を plan.md で検索 → 3 件 (`:159`, `:160`, `:170`)。状態通知の payload の形を定めた行は 0 件。
- **リスク/影響**: (a) 状態通知も文字列にしてパースを別モジュールへ逃がすと、項目 18 は形だけ緑になる。(b) オブジェクトで送り `payload は string` の検査を `event` だけに縮めると、plan と単体の観点が食い違う。
- **推奨アクション**: Worker→調停役の envelope を 2 種に分けて plan に書く (`event` は `payload: OpaqueBody`、それ以外は構造化オブジェクトで送り `supervisor-protocol.ts` の `decodeWorkerMessage` で検証。このデコーダは `event` の payload を読まない)。BE-004 に `decodeWorkerMessage` の単体を足す。項目 18 の対象を `supervisor-protocol.ts` 以外の調停役スレッドのモジュール全体に広げる。
- **根拠**: Constitution Principle IX / AD-031 §2 / spec FR-002 / SC-002
- **scope 根拠**: `supervisor-core.ts` / `supervisor-protocol.ts` / 項目 18 / BE-004 / BE-005 はこの feature の範囲

### [Medium] SC-009 の検証経路に、Principle VII の代替証拠であるビルド出力の検査が無い。素の `node` で起動できても electron 非依存の証明にならない (M-003) (scope: feature) — new

- **観察**:
  - SC-009 の計測経路は、単体・`lint`・`depcruise`・quickstart の `node` 起動である。
  - しかし `agents-not-to-electron` は `doNotFollow: node_modules` のため外部パッケージ経由の到達を見ない。規則自身が「**代わりの証拠はビルド出力である** (`out/main/enumerate-sessions-*.js` の `require` に `electron` が 0 件)」と書いている (`.dependency-cruiser.js:183-189`)。
  - 本 feature では supervisor entry と worker entry が `?modulePath` で別チャンクとして出力され、Rollup の共有チャンクを介して main 側のモジュールと同居する可能性もある。
  - 素の `node` で `require('electron')` を評価すると、npm の `electron` パッケージは実行ファイルのパス文字列を返すため例外にならない。quickstart で起動できたことは electron 非依存の証明にならない。
- **同種事象探索**: `out/main/|require.*electron|ビルド出力` を spec_dir で検索 → 009 本体では 0 件。
- **リスク/影響**: Principle VII の Automated 検証の穴が、本 feature で新しく生まれる 2 つの entry について無検査のまま残る。
- **推奨アクション**: SH-022 (と SC-009 の計測経路) に「supervisor / worker のビルド出力と、それらが静的に読む全チャンクの `require` / `import` に `electron` が 0 件で、外部依存は SDK だけ」であることの確認と件数の記録を足す。可能なら `scripts/constitution/` の検査項目にする。
- **根拠**: Constitution Principle VII Verification / AD-010 / `.dependency-cruiser.js:183-189` / PB-7
- **scope 根拠**: SC-009 / SH-022 はこの feature の範囲

### [Low] spawn の呼び出しから `spawned` の送信までの間に Worker が落ちると、pid は未記録のまま `claudeAlive: false` になり、`wsl.exe` が上限にも回収にも掛からない (L-001) (scope: feature) — new

- **観察**: 調停役スレッドは「pid が未記録 (spawn 前) なら、そのまま false にする」(`plan.md:164`)。しかし pid が未記録であることは「spawn 前」を意味しない。`child_process.spawn` が返ってから `spawned` が調停役スレッドに届くまでの間に、Worker がネイティブ例外や `terminate()` で終わる窓がある。
- **同種事象探索**: `spawn 前|未記録` を plan.md / tasks.md で検索 → 2 件 (`plan.md:164`、`tasks.md:127`)。spawn の直後に落ちる窓を扱う行は 0 件。
- **リスク/影響**: 窓は狭いが、起きると `wsl.exe` が残ったまま枠が空く。
- **推奨アクション**: SH-000 (3) の結果をこの窓にも当てはめて AD-043 に書く。子が残る場合は、spawn の直前に `{ kind: 'spawning' }` を送り「spawning を受けたが spawned が来ていない」状態を回収不能として計上する等を BE-022 の観点に足す。
- **根拠**: spec FR-005 / FR-012 / AD-018 Consequences
- **scope 根拠**: `supervisor-core.ts` / `sdk-agent-session.ts` / BE-022

### [Low] SH-022 の「スレッドの異常終了で孤児 0」を、本番ビルドで起こす手段が無い (L-002) (scope: feature) — new

- **観察**: SC-008 は「スレッドの異常終了」でも残存 0 件を求め、quickstart を唯一の実測根拠とする。しかし本番 entry は実装を差し替える引数を持たず、Worker に例外を注入する経路が無い。SH-000 (3) は `terminate()` の試作での測定であり、本番ビルドの `uncaughtException` 経路とは別物である。
- **同種事象探索**: `スレッドの異常終了` を spec / tasks で検索 → 5 件。誘発手段を書いた行は 0 件。
- **推奨アクション**: SH-022 で誘発手段 (例: WSL 内の `claude` を `kill -SEGV` してストリームを壊す、または Windows 側で `wsl.exe` だけを止める) を明記するか、スレッドの異常終了は SH-000 (3) の試作での実測を根拠とすると SC-008 に書き分ける。
- **根拠**: spec SC-008 / FR-012 / Constitution Principle XI
- **scope 根拠**: SH-022 / SC-008 はこの feature の範囲

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `本人確認\|image 名\|生成時刻` (spec_dir *.md) | 4 (009 本体) | plan.md:187, :233, :260 / tasks.md:130 |
| M-001 | `process\s*\.\s*kill\|JSON\.parse\|SHARE_ENV` (plan.md) | 4 | plan.md:167, :246, :247, :248 |
| M-002 | `payload` (plan.md) | 3 | plan.md:159, :160, :170 |
| M-003 | `out/main/\|require.*electron\|ビルド出力` (spec_dir、009 本体) | 0 | — |
| L-001 | `spawn 前\|未記録` (plan / tasks) | 2 | plan.md:164 / tasks.md:127 |
| L-002 | `スレッドの異常終了` (spec / tasks) | 5 | spec.md:220, :289 / tasks.md:112, :155 ほか |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 2
- Round inheritance: resolved from 1: 11 / unresolved: 0 / new: 6
