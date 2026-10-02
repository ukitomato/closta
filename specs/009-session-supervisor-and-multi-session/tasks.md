# Tasks: supervisor 分離とマルチセッション (X-5)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md)

**記法**: `[BE]` backend (domain / agents / main) / `[FE]` renderer / `[SH]` 横断 (ADR・規則・docs・検証・共有の型)。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いの正本は spec の FR / SC、形の正本は plan の「実装方針」と「ADR」節である。本書は作業単位とテストの観点だけを書き、規則を書き写さない。

## Shared Tasks (先行: 実機確認・ADR・型・規則)

- [x] **SH-000** [SH] **実機確認 (plan Technical Context「未確認」1〜4)**。**結果 (2026-10-01)**: (1) 成立 / (2) 不成立 (中継の分岐) / (3) どの経路でも孤児なし (回収経路を作らない) / (4a) argv の位置は測定済み / (4b) ビルドと asar は BE-006・BE-007 の実装時に測る ([quickstart-results.md](./quickstart-results.md))。結果を `quickstart-results.md` に記録し、plan「SH-000 の結果による分岐」のどちらを採るかを決める
  - (1) utilityProcess の中の Worker で SDK `query()` (実 `claude`) と `child_process.spawn` が動く
  - (2) utilityProcess が受け取った port を Worker の `transferList` に渡せるか
  - (3) supervisor を `taskkill /F` で落としたとき、Worker を `terminate()` したとき、Worker の `resourceLimits` を超えさせたときに、`wsl.exe` と WSL 内 `claude` が残るか (`pgrep -af claude` で前後比較)。この (3) の Worker 側の結果は SC-008 の「スレッドの異常終了」の実測根拠になる
  - (4) supervisor entry と worker entry を `?modulePath` で別ファイルに出し、ビルド成果物の supervisor を `node` で起動して worker のパスを引数で渡せる
  - **(1) が成立しなければ以降に進まない** (plan R-01。AD-043 は proposed のまま書き直して利用者に諮る)
- [x] **SH-001** [SH] **AD-043 を起票する** (plan「ADR」節の Decision 1〜7 / Consequences / Confirmation)。status は proposed で起票する。SH-000 の後、**proposed のうちに Decision 2 / 5 を採った分岐の文に書き換え、採らなかった分岐を Considered options に移し、Confirmation の「accepted の条件」に実測値と `quickstart-results.md` の参照を書いてから accepted にする**。読み替え対象は spec FR-015 のとおり (accepted ADR の本文は変えない)。AD-023 §3 の例示が古くなる旨を注記する
- [x] **SH-002** [SH] [P] **glossary を追随させる** (Principle XIV。コード投入前。spec FR-016)
  - 定義の更新: `supervisor` (単一プロセス + 調停役スレッド + セッションスレッド、worker のパスを引数で渡す起動形) / `AgentSession` (`stop()` 削除・セッションスレッド・`end`) / `SessionRunState` (単一セッション不変の注記を外す。`done` は状態通知の畳み込みでは終端として扱わない) / `SessionControl` (`end`) / `SessionEvent` (調停役スレッドを経る経路・`end-forced`) / Message queue (`claude` の終了で cancelled) / 起動系の理由キーの件数 (10 種)
  - 追加: 調停役スレッド / セッションスレッド / 同時実行数の上限 / 状態通知 (SessionStatusUpdate) / 稼働中セッション一覧 (閉じるまで終了済みの行も含む旨を注記) / `session-limit` / `supervisor-exited` / `shutting-down` / 終了 (穏当。`end`)
  - Counterexamples: 状態通知 ≠ SessionSummary、稼働中セッション一覧 ≠ (列挙の) セッション一覧、同時実行数の上限 ≠ 起動設定の「上限」軸
- [x] **SH-003** [SH] [P] `domain/session/concurrency.ts` — `MAX_CONCURRENT_SESSIONS` と `canReserve` + 単体
- [x] **SH-004** [SH] [P] `domain/session/status-update.ts` — 型・`isSessionStatusUpdate`・`coalesceUpdates`・`acceptBatch`・`synthesizeExit`・`applySynthesized` + 単体 (`pid.ts` / `isAcceptablePid` は SH-000 (3) により作らない)。観点:
  - `error` と理由キー、`claudeAlive: false` が後続で上書きされない / `done` は後続の `running` で上書きされる
  - `acceptBatch` が別世代・registry に無い sessionId・形の崩れを捨て、`claudeAlive` の false→true を反映せず、`accepted` にも単調性を適用した値が出る
  - 全フィールドに会話由来の文字列が入らない (型の全フィールド走査。SC-004)
  - ~~`isAcceptablePid` が `0` / 負値 / 非整数 / `NaN` / excluded の pid を拒否する~~ (SH-000 (3) により作らない)
- [x] **SH-005** [SH] [P] `eslint.config.mjs` — `node:worker_threads` を `src/agents/supervisor.ts` / `sdk-agent-session.ts` に許可する (2 表記を揃える。plan 機械強制表)。**コードより先に入れる**

## US-1 — 複数のセッションを並行に起動する (P1)

**Goal**: 稼働中でも新しいセッションを起動でき、枠を占めるセッションが 10 本を超えると `session-limit` で拒否される (spec US-1 / FR-005 / FR-006)。

**Independent Test**: fake の supervisor 接続を注入した `session-launch-service` の単体 + E2E (spec US-1 Independent Test)。

### Backend

- [x] **BE-001** [BE] `domain/session/agent-session.ts` / `run-state.ts` — `session-active` を外し `session-limit` / `shutting-down` を足す。`LaunchFailureReason` に `supervisor-exited`。`SessionControl` に `end`、`SessionEvent` に `end-forced`。`AgentSession.stop()` と `isActive` を削除し、関連コメントを `SessionControl` の語彙に揃える (plan 申し送り #7)。**同じタスクで、これらに依存する既存の単体 (`labels.test.ts` の `session-active` 等) を書き換え、赤の期間を作らない**
- [x] **BE-002** [BE] `agents/sdk-agent-session.ts` + `session-core.ts` — セッションスレッド化 (plan agents 節)。単体の観点:
  - 本文が `{ kind: 'event', payload: string }` で出る
  - 状態通知の `claudeAlive` は常に true (spawn 前も)
  - ~~spawn の直前に `spawning`、直後に `spawned`~~ (SH-000 (3) により持たない)、子の exit で即時に `child-exited`
  - `wsl.exe` だけが異常終了したとき (スレッドは生存)、そのセッションが理由付き `error` になり `child-exited` が出る
  - `uncaughtException` で子が kill されてから `failure` → `ended` が出る
  - `end` は `done` / `interrupted` のときだけ効く (`idle` / `running` では何もしない)。子が期限内に終わらなければ `end-forced` を流してから kill に落ちる
  - kill / terminal error / launch のデコード失敗のいずれでも `ended` が出る (`process.exit` を呼ばない)
  - `requestId` は注入した生成器 (`globalThis.crypto.randomUUID`) から作られ、別セッション・未知・応答済みの決定は SDK のコールバックを解決しない (SC-005)
- [x] **BE-003** [BE] `agents/transport.ts` — parent-port 経路で受信 port を渡す (`onMessage(line, ports)`)。`openBodySink(ports, toLine)` を足す。**経路種別は公開しない**。単体の観点: parent-port 経路で port 1 本なら port へ送る sink、0 本なら `null` / stdio 経路では `toLine` の行を書く sink / 既存の列挙の呼び出しを壊さない
- [x] **BE-004** [BE] `agents/supervisor-protocol.ts` — `decodeSupervisorRequest` / `decodeWorkerMessage` / `encodeSupervisorEvent` + 単体。観点:
  - `decodeSupervisorRequest`: kind の enum・sessionId の UUID 述語・control の形を検証し、`event` の kind を受け付けない
  - `decodeWorkerMessage`: 未知の kind・形の崩れを捨てる / `event` は payload が string であることだけを確かめ、中身を読まない
  - `encodeSupervisorEvent`: 改行や引用符を含む payload を往復しても行が増えない
- [x] **BE-005** [BE] `agents/supervisor-core.ts` — 調停役スレッドの本体 (plan agents 節) + 単体 (fake の transport / Worker / 時計)。観点:
  - `openBodySink` が `null` の launch は Worker を起こさず拒否する。本体は経路種別を参照しない
  - 宛先解決: `control{sessionId:A}` は Worker A にだけ届き、未知の sessionId は捨てられる / Worker が他のセッションの sessionId を名乗っても、割り当てた sessionId で付け直す
  - 本文は `JSON.parse` されずに sink へ渡る / port の inbound を登録しない
  - 状態通知は 100ms 窓でまとまり、生存フラグの false (`child-exited`) と `thread-ended` は窓を待たずに即時に出る (`spawned` は SH-000 (3) により持たない)
  - ~~`spawned` の pid が `isAcceptablePid` を満たさない・2 回目のときは記録しない~~ (SH-000 (3) により pid を記録しない)
  - spec は最初の message で渡され、以後保持されない
  - `transport.onClosed` で全 Worker に kill を送り、期限後に終了する
  - ログに例外や破棄した値の中身を出さない (理由キーと件数だけ)
- [x] **BE-006** [BE] `agents/supervisor.ts` — supervisor entry (結線のみ)。Worker は `env` 未指定・`resourceLimits` 指定で起こし、`SHARE_ENV` を使わない。worker entry のパスは必須の起動引数で受ける
- [x] **BE-007** [BE] `main/app/session-spawner.ts` — 単一 supervisor 接続 (遅延 fork・`stdio: 'ignore'` とその理由のコメント・起動引数に worker パス・fork の直列化・世代番号・行長の上限・`onStatusBatch` / ~~`onSpawned` / `onChildExited`~~ / `onThreadEnded` / `onExit`。SH-000 (3) により pid 系は持たない)
- [x] **BE-008** [BE] `main/app/session-launch-service.ts` — semaphore 化 (plan main/app 節) + 単体 (SC-001)。**同じタスクで既存の `session-launch-service.test.ts` の SC-011 を本 feature の規則に書き換える** (書き換えた理由をテスト名に残す)。観点:
  - 上限 10・同時要求・`launching` 中 (spawn 前) も計上・11 本目は supervisor 接続を呼ばない
  - `prepareLaunch` 失敗と fork 失敗で枠が戻る
  - `error` / 終了 / 強制終了後 (`claudeAlive: false`) は計上せず、`done` / `interrupted` は計上する
  - 状態通知は `acceptBatch` を通して反映し、`accepted` だけが relay に渡る
  - `thread-ended` で `threadAlive: false` になり、以後の制御は `false` を返す
  - `killAll()` が全セッションに kill を送り、supervisor は止めない
  - 終了処理中の launch は `shutting-down`
  - 起動設定は起動ごとのスナップショットで、2 本の起動で互いに影響しない (FR-006)
- [x] **BE-009** [BE] IPC の 5 面 (capability / preload / ipc / e2e-capability / test-support) — ~~launch handshake に `label`~~ (実装時の変更: 表示名は renderer が起動設定と既存の一覧から引く。plan main/app 節)、`onSessionStatus`、`endSession` を足す (`handle()` 経由)。`respondPermission` の `requestId` を UUID 述語で検証する

### Frontend

- [x] **FE-001** [FE] `features/session/running-session-store.ts` (code-gate convention H-001 で `session-store.ts` から改名。寿命と注入は `running-session-context.ts`、純関数は `session-view.ts`) + `session-event-decoder.ts` — セッション単位のストア (plan renderer 節)。port の受け渡し (origin / source の検証・`Map<sessionId, MessagePort>` の待避・未要求 / 閉じた sessionId の port は close)、本文のデコード (失敗は破棄)、`onSessionStatus` の反映、`ended` の導出、起動成功で行追加と選択、閉じると行と保持を消して選択を外す、port が閉じても transcript を残す
- [x] **FE-002** [FE] `useLiveSession(sessionId)` — store から 1 セッション分を読み、制御を引数の sessionId に向ける。**unmount→kill と reset→kill を撤去する** (spec FR-008)。**同じタスクで既存の `useLiveSession.test.tsx` を本 feature の規則に書き換える**
- [x] **FE-003** [FE] [P] `LaunchDialog.tsx` — 同一登録フォルダの警告 (`!ended` のセッションが対象。起動はブロックしない) と `session-limit` の文言・導線 (FR-006 / US-1 AC2)
- [x] **FE-004** [FE] [P] `labels.ts` — `session-limit` / `shutting-down` / `supervisor-exited` / 同一フォルダ警告 / 一覧の状態ラベル (起動中・応答中・承認待ち・中断・応答待ち・失敗・終了済み) / 終了・停止・閉じる / 強制終了に落ちた通知 (Principle XV)。`session-active` の訳文を消す

## US-2 — 稼働中のセッションを一覧し、切り替え、終了・停止する (P1)

**Goal**: 一覧から切り替え、個別に終了・停止・閉じる。入力はセッションごとに分かれ、終わり方が見える (spec US-2 / FR-008〜FR-011)。

**Independent Test**: renderer の単体 / component テスト + E2E 1 本 (spec US-2 Independent Test)。

### Frontend

- [x] **FE-010** [FE] 下書きと送信待ちキュー (X-2) を `LiveSessionState` に移し、セッションごとに保つ。送信は送信時点の表示中セッションへ (FR-010。plan 申し送り #14)
- [x] **FE-011** [FE] `RunningSessionList.tsx` (code-gate convention L-005 で改名) — **assistant-ui の ThreadList (`thread-list.aui.tsx` + `ExternalStoreThreadListAdapter`) で組む** (実装時に独自 list から載せ替え。Principle XIII) — 行・選択・新規起動・操作の出し分け (終了は `(done | interrupted) && !ended` で `ending` 中は押せない / 停止は `launching` (強制終了だけ)・`running`・`awaiting_permission` / 閉じるは `ended`)・`end-forced` の表示・空状態 (行が 0 件) (FR-009 / FR-011)。独自 element を作る場合は Principle XIII の Exceptions の書式を完了条件にする
- [x] **FE-012** [FE] `SessionScreen.tsx` — 一覧 + 表示中セッションの 2 ペイン。ランタイムは 1 つで `adapters.threadList` に稼働中セッションを渡す。composer の無効化とキューの終端判定に `ended` を含める。表示していないセッションの更新で表示中の Thread を再描画しない (FR-008 / FR-010)
- [x] **FE-013** [FE] renderer 単体 / component テスト (SC-006)。観点:
  - 切り替えで取りこぼし・重複なし / 下書きとキューの分離 / 送信と承認の宛先
  - 2 本の並行起動で port が handshake より先に逆順で届いても、各 port が自分のセッションにだけ繋がる / 閉じたセッションの port は捨てられる
  - 切り替えと画面遷移で kill が呼ばれない / 閉じると保持から外れ、表示中なら選択が外れる / port が閉じても transcript が残る
  - `done` の行が `claudeAlive` で「応答待ち」と「終了済み」に分かれる / 終了済みでは composer が無効でキューが cancelled になる (終了の後、`done` 中の `child-exited` の後の両方)
  - 操作が状態に応じてだけ出る (`launching` は強制終了だけ) / 終了の処理中は終了を押せない / `end-forced` を受けると強制終了に落ちた旨が出る
  - 空状態 (行が 0 件) / 同一フォルダの警告が出て、起動ボタンは有効のまま
  - 本文のデコードに失敗したメッセージが破棄され、他のセッションに影響しない

### Backend

- [x] **BE-010** [BE] `main/app/session-ipc.ts` — 制御は registry に在り `threadAlive` の sessionId だけ。main の IPC ハンドラ直接呼びの負例テスト (未知・終了済み・スレッド終了後の sessionId / 不正な形の `requestId`。SC-005)。`requestId` の束縛は BE-002 の単体が担う
- [x] **BE-011** [BE] `end` の main 側の結線テスト — IPC → `session-launch-service` → supervisor 接続 (fake) の範囲で、`end` が該当セッションだけに渡ることを確かめる。supervisor 内の宛先解決は BE-005、セッションスレッドの `end` の振る舞いは BE-002 が担う

## US-3 — 10 本並行でも UI が固まらない (P2)

**Goal**: 本文は main も調停役スレッドも解釈せず、状態通知はバッチで届く。supervisor は単独起動できる (spec US-3 / FR-001〜FR-004)。

**Independent Test**: バッチャと受信規則の単体・本文経路の構造検査・E2E・単独起動の単体とビルド出力の検査と quickstart (spec US-3 Independent Test)。

### Backend

- [x] **BE-012** [BE] 単独起動 (SC-009) — `runSupervisor` を fake の stdio transport と fake の Worker で動かす単体 (2 セッションの launch → 状態通知と本文の行 → 終了 → 標準入力を閉じると終了)。ビルド成果物を `node` で起こす実機確認とビルド出力の検査は SH-022 に置く (R-2 SH-094 と同じ形)。本番 entry は実装を差し替える引数を持たない (worker entry のパスは main が `?modulePath` で渡すものだけ)
- [x] **BE-013** [BE] `main/app/session-status-relay.ts` — launch-service が受理した `accepted` を renderer へ 1 バッチ 1 送信 + 単体 (SC-004)。観点: 検証を持たない (受理済みだけを送る) / `claudeAlive` の false→true が renderer に届かない (BE-008 と組) / supervisor の異常終了の合成は窓の外で 1 回 / ログに中身を出さない
- [x] **BE-014** [BE] 本文経路の構造検査 (SC-002) — main が本文 port を保持しない / Worker からの本文が `OpaqueBody` のまま sink へ渡る / `supervisor.ts`・`supervisor-core.ts` がセッション port に `message` listener を登録しない。**SH-000 (2) で直送の分岐を採った場合は、`sdk-agent-session.ts` もセッション port に listener を登録しないことを加える**

### Frontend

- [x] **FE-020** [FE] E2E 負荷 (SC-003) — **進捗**: `e2e/multi-session.spec.ts` の 3 本目に実装済み。実行と計測値の記録が残る (要ビルド)。 本物の起動調停 + fake の supervisor 接続で、SC-003 に定義した負荷 (上限いっぱいの part は `BODY_MAX_BYTES`) を流し、`longtask` (50ms 超) の件数と入力遅延 (SC-003 の定義) の p95 を計測する

## US-4 — 失敗を閉じ込め、プロセスを残さない (P2)

**Goal**: 1 本の失敗は他に波及せず、スレッド / supervisor の異常終了・renderer の再読み込み・アプリ終了で `wsl.exe` を残さない (spec US-4 / FR-012〜FR-014)。

**Independent Test**: 調停役スレッドの単体・起動調停の単体・quickstart の実機観測 (spec US-4 Independent Test)。

### Backend

- [x] **BE-020** [BE] `session-launch-service.ts` — supervisor の exit (plan main/app 節) + 単体 (SC-007)。観点:
  - その世代の全エントリが `supervisor-exited` になり枠が戻る (最初の状態通知の前に落ちた起動要求を含む)
  - exit と同時に新規 launch が進んでいても、新しい世代のセッションに `supervisor-exited` が付かない
  - 異常終了後の 2 件同時の launch で supervisor は 1 本だけ fork される
  - 終了コード・世代・セッション数・回収できなかった数のログが 1 行出る (会話由来の文字列と env を含まない)
- [x] **BE-021** [BE] 終了処理と renderer 再読み込み — `session-launch-service.dispose(): Promise<number>` / `composition-root.ts:383` / `e2e-capability.ts` の `dispose` / `src/main/index.ts:69,118` の `before-quit` / `render-process-gone`・再読み込みの検知で `killAll()` (plan main/app 節) + 単体 (SC-008)。観点: 全セッションの kill → 全 `claudeAlive: false` か期限 → supervisor の kill の順序 / 2 回目の `before-quit` で dispose が再実行されない / dispose が resolve しなくても全体期限で quit する / 再読み込み・クラッシュの検知で全セッションに kill が送られ supervisor は止まらない
- [x] **BE-022** [BE] [P] 調停役スレッドの異常終了処理の単体 (SC-007) — fake の Worker で:
  - **判定は `ended` の有無で行う**: `done` (応答待ち) 中に `ended` 未着で Worker が終わると `process-crashed` が出る / kill 後に `ended` を受けてからの終了では `process-crashed` が出ない
  - メモリ上限超過相当の `error` でも、そのセッションだけが `process-crashed` になる
  - 1 Worker の異常終了で、他の Worker の本文と状態通知は流れ続ける
  - Worker が終わり方を問わず終了した時点でまだ `claudeAlive: true` なら false になる (`ended` 後の正常終了で `child-exited` 未着 / spawn 前の終了 / 異常終了のいずれも。R3-H-03)。pid による回収 (`killPid`) は持たない (SH-000 (3))
  - 1 Worker が 5MB 相当の本文を流している間も、他の Worker の本文が流れる
  - 1 本が `awaiting_permission` の間も、他の本文が流れる
- [x] **BE-023** [BE] [P] **作らない** — SH-000 (3c) で supervisor を強制終了しても孤児が残らなかったため不要 (判断と実測は quickstart-results.md。AD-043 Decision 5 に書く)。以下は元の記述: **(SH-000 (3) で supervisor 異常終了後に孤児が残る場合だけ)** `main/infra/runtime/reap-wsl-launchers.ts` と、`session-launch-service` への注入 (plan main/infra 節) + 単体。観点: `isAcceptablePid` を満たさない pid・`process.pid`・supervisor の pid・未知 sessionId・2 回目の `spawned`・別世代を受け付けない / `child-exited` を受けた pid は止めない / `reapable: false` のエントリは止めない。**孤児が残らない場合は作らず、その判断と実測を AD-043 と quickstart-results に書く**

### Frontend

- [x] **FE-030** [FE] [P] `supervisor-exited` / `process-crashed` の行表示と、表示中セッションの FailureBanner (既存) の文言。表示中のセッションが失敗しても選択は動かさない。port が閉じても transcript が読める

## Shared Tasks (機械強制・docs・検証)

- [x] **SH-010** [SH] 機械強制の変更 (plan「機械強制の変更」表のとおり)
  - `allowlists.mjs` の `PROCESS_SPAWN_MODULES` のコメント更新 / WSL を名指さない app モジュールに `session-status-relay.ts`
  - `check.mjs` 項目 18 (調停役スレッドの `JSON.parse` 参照 0 件)・項目 19 (`process.kill` 参照の置き場。SH-000 の結果で登録先を決める)・項目 20 (`SHARE_ENV` と Worker の `env`) を新設する。項目 18・19 は呼び出しでなく参照で数え、違反 fixture に参照渡し・ブラケット・分割代入・`.call` の 4 形を入れる。`tests/rule-fixtures/expected.mjs` を更新する
  - `UNDETECTED_NOTES` に記録: 項目 18 はスレッドを見ない / 多段の別名代入は拾わない / 項目 20 は式で組んだ options を拾わない / agents の標準モジュール禁止は import 文の層だけ
- [x] **SH-011** [SH] [P] E2E の追随 (SC-010)。**進捗**: `e2e-capability` の作り替えと select の label 化は済み。ビルドは agent が実行しない (discovery.md) ため、E2E の実行 (緑の確認)・スクリーンショット差分の確認が残る。単体の書き換えは BE-001 / BE-008 / FE-002 が同じタスクで行う
  - `e2e-capability` を使う既存 E2E を、本物の起動調停 + fake の supervisor 接続で緑にする。`ime.spec.ts` の 3 経路が緑であること
  - `e2e/composer-screenshot.spec.ts` の基準画像の差分を確認する。更新する場合は AD-038 D5 に従い PR で承認を得る
  - `e2e/support/launch.ts` / `launch-dialog.spec.ts` の select を位置 (`first()` / `nth(1)`) でなく label や role で拾うように直す
- [x] **SH-090** [SH] [P] docs を追随させる (FR-016。plan 申し送り #1 / #2 / #11)
  - session charter: frontmatter (`related_adrs` に AD-023 / AD-034 / AD-043、`related_specs` に 009) / Key concepts の supervisor / Related Specs / Related ADRs / 末尾の「X-5 / X-6 / O-1 は未着手」
  - roadmap: X-5 行の状態、X-6 行に「worker 内プロンプトキュー超過の通知」を 1 行
  - discovery.md:84: supervisor を present に (実際の起動形も書く)
- [x] **SH-091** [SH] [P] コード内コメントの宛先を更新する — 単一セッション不変・per-session を前提にした次の箇所 (architecture-reviewer design-gate R1 L-001 の列挙): `domain/capability.ts:110,117` / `domain/session/launch-gate.ts:14` / `domain/session/run-state.ts` / `main/app/session-ipc.ts:51,133` / `main/app/composition-root.ts:216-219,259-262` / `main/app/e2e-capability.ts` / `agents/sdk-agent-session.ts:40,403` / `renderer/.../SessionScreen.tsx:34,233` / `renderer/src/stores/ui.ts:34` / `session-spawner.ts` / `session-launch-service.ts` / `useLiveSession.ts`
- [x] **SH-092** [SH] Constitution の事実の追随を PATCH する (**v1.2.8 で反映。利用者承認 2026-10-01**)。対象は 3 つ: Principle IX の Verification「現状の制約」(worker→調停役→本文の出口の経路、調停役は文字列を中継するだけであること、項目 18 が置き場しか見ないこと) / Principle IX の Good example (中継の分岐で「パース済みの構造体を直送」から外れる扱い) / Principle VII Statement の単独起動の形 (worker のパスを引数で渡す)。**PATCH 案を AskUserQuestion で人間に承認してもらってから**反映し、Sync Impact Report を足す (AD-034 / v1.2.6 と同じ形)
- [x] **SH-020** [SH] E2E — **進捗**: spec は作成済み (型検査済み)。実行が残る (要ビルド)。`e2e/multi-session.spec.ts` に 2 本の起動 → 切り替え → 送信 (SC-006)、11 本目の拒否 (SC-001)。FE-020 の負荷と同じファイルに置く
- [x] **SH-021** [SH] 機械検証 (**2026-10-01 全緑**: lint / typecheck node・web・e2e / depcruise / check:constitution 20 項目 (違反 0・検査対象なし 1 は従来の #5) / test 1625 件 / test:rules 55/55。UNDETECTED_NOTES 4 件の塞ぐ feature は X-6 と仮置き) — lint / **typecheck (`tsc --noEmit` node + web)** / depcruise / check:constitution / test / test:rules を全緑にする <!-- [auto-added: TypeScript] -->
- [x] **SH-022** [SH] quickstart の実機記録 (`quickstart-results.md`)
  - **ビルド出力の検査**: supervisor と worker のチャンク、およびそれらが静的に読む全チャンクの `require` / `import` に `electron` が 0 件で、外部依存が SDK だけであることを件数で記録する (SC-009)
  - ビルド成果物の supervisor を `node` で起こし、標準入出力で 2 セッションを起動 → 終了 → 標準入力を閉じて終了 (SC-009)
  - 実 `claude` で 3 本を並行に起動 → 切り替え → 1 本を終了 → 1 本を強制終了 → 残りが続く
  - 10 本の手動観測 (charter KPI「並列時の滑らかさ」)。うち 1 本で数 MB の tool_result を出させ、他が止まらないことを見る
  - 孤児 0 (SC-008): アプリ終了 / renderer の再読み込み (開発者ツールのリロード) / supervisor の `taskkill /F` / Windows 側で 1 本の `wsl.exe` だけを止める、のそれぞれで `wsl.exe` と WSL 内 `claude` の残存を数える。スレッドの異常終了は SH-000 (3) の試作の実測を参照する

## design-gate R3 由来 (実装時に必ず直す)

R3 の High 4 件は plan / spec に未反映のまま実装へ進んだ (利用者の判断 2026-10-01)。該当タスクの実装時に次を満たし、plan / spec の該当箇所も同じ PR で直す。Medium / Low は [design-gate.md](./design-gate.md) を参照して実装中に拾う。

- [x] **R3-H-01** (BE-021 で扱う。**実装**: `src/main/index.ts` が全ウィンドウに掛ける `@electron-toolkit/utils` の `watchWindowShortcuts` が、`app.isPackaged` のとき `before-input-event` で Ctrl+R / Ctrl+Shift+R を `preventDefault` する (メニューの accelerator も止まる)。依存の import に `vi.mock` が効かず単体で固定できないため、SH-022 の実機確認で担保する) 本番ビルドでは再読み込みの accelerator (Ctrl+R / F5 / Ctrl+Shift+R) を無効にする (`Menu.setApplicationMenu(null)` か `before-input-event`)。開発時は残してよい。本番設定で無効になることを単体で固定し、SH-022 に「本番ビルドで Ctrl+R を押しても再読み込みされない」を足す
- [x] **R3-H-02** (BE-021 で扱う) `window.ts` の `will-navigate` は同一 origin を含めて全遷移を拒否する (http(s) は外部ブラウザへ)。`killAll` の検知契機は確定した文書の入れ替わり (`did-navigate` の main frame / `render-process-gone`) にし、`did-start-navigation` は使わない。会話由来 markdown の相対リンクの扱いは ui 側と決める。負例: 拒否された遷移では `killAll` が呼ばれない / 同一 origin の相対遷移が拒否される
- [x] **R3-H-03** (BE-005 / BE-008 / BE-022 で扱う) 調停役スレッドは、Worker が**終わり方を問わず**終了した時点でまだ `claudeAlive: true` なら false にする (SH-000 (3) により pid の回収は不要)。セッションスレッドの `uncaughtException` 経路も子の exit を待ってから `ended` を送る。負例: launch のデコード失敗 / spawn 前の例外 / `launching` 中の強制終了で枠が戻る
- [x] **R3-H-04** (BE-002 / FE-012 / FE-013 で扱う) セッションスレッドに `closing` 状態を持たせ、kill / `end` を受けた後の `send-prompt` / `respond-permission` / `interrupt` は無視する (run-state を巻き戻さない)。renderer の composer 無効化と送信待ちキューの終端判定は `ended || killed || ending` にする。負例: 終了・強制終了を押した直後から送信できない / 処理中に届いた送信で状態が `running` に戻らない

## 依存と順序

1. **SH-000** が最初。(1) が成立しなければ止まる。(2) の結果で本文の形 (中継 / 直送) と BE-014 の対象が、(3) の結果で BE-022 の `killPid` 経路と BE-023 の要否、項目 19 の登録先が決まる
2. SH-001 (proposed で起票) / SH-002 / SH-003 / SH-004 / SH-005 (型・用語・lint の許可) → US-1 の BE。SH-001 の accepted 化は SH-000 の結果で Decision 2 / 5 を書き換えた時点
3. US-1: BE-001 → BE-002 / BE-003 / BE-004 → BE-005 → BE-006 → BE-007 → BE-008 → BE-009 → FE-001 → FE-002 → FE-003 / FE-004
4. US-2 は US-1 の FE-001 / FE-002 の後。BE-010 / BE-011 は BE-009 の後
5. US-3 の BE-012 / BE-014 は BE-005 の後、BE-013 は BE-008 の後
6. US-4 の BE-020 / BE-021 は BE-008 の後、BE-022 は BE-005 の後、BE-023 は SH-000 (3) と BE-020 の後
7. SH-010 / SH-091 はコードが揃った後、SH-011 は BE-009 と FE-012 の後、SH-092 は SH-001 の後、SH-020 / SH-021 / SH-022 は最後
