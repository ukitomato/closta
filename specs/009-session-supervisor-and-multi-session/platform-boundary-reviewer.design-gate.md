# platform-boundary-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md (+ plan.md / tasks.md)
**Round**: 3

## 初回読了 viewpoint

- FR/SC: この bundle は FR-001〜FR-016 / SC-001〜SC-010 の全件に関わる。本 reviewer の担当スライスに直接かかるのは FR-001 / SC-009 (Principle VII、単独起動、ビルド出力の検査)、FR-002 / SC-002 (項目 18)、FR-005 / FR-012 / FR-013 / SC-007 / SC-008 (pid による回収、WslRuntime への限定)、FR-015 (AD-036 §3 の読み替え)。
- touched files に該当する charter / Confirmation: AD-003 Decision Outcome / AD-018 / AD-043 Decision 5 / 6 / 7 / Constitution Principle I / II / III / VI (項目 7・15) / VII の Verification / `.dependency-cruiser.js:183-190` の限界注記 / `allowlists.mjs:429-449` (`WSL_FREE_DIRECTORIES`) / 新設予定の check.mjs 項目 18 / 19 / 20
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: 回収は `main/infra/runtime/reap-wsl-launchers.ts` に置かれ (plan.md:195)、WslRuntime への限定が Out of Scope に書かれている (spec.md:338)。runtime charter と isolation charter の Out of scope への侵犯は読み取れない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。M-001 / M-002 / M-003 / L-001 を検出するテスト・fixture・実測の欠落は、各指摘の推奨アクションに含めた。既存への影響: 項目 7 の `SPAWN_CALL_PATTERNS` (check.mjs:101-113) は `new Worker` / `spawning` / `onSpawned` に一致せず誤検出は生じない。項目 15 (check.mjs:735-736) は `reapWslLaunchers` の注入で違反にならない

## スコープ要約

R2 の指摘を受けて、共通の pid 受理述語 (`domain/session/pid.ts`)、registry の `reapable`、生成時刻による本人確認をやめた残余の記録、`spawning` の帳簿、項目 18 / 19 の参照方式と 4 形の fixture、項目 20 の Worker の `env`、`decodeWorkerMessage`、SC-009 と SH-022 のビルド出力の検査、スレッドの異常終了の根拠の書き分けが入った。前回の 6 件はすべて解消と判定した。今回は、`reapable` の出所と Worker 側の回収経路の限定、項目 18 の対象集合、本番でしか通らない起動形 (utilityProcess の argv、asar 内の Worker entry) を見た。

PB-1〜PB-7 の判定:
- PB-1: 該当なし (worker entry のパスはホスト側で解決・消費。asar は M-003)
- PB-2: 該当なし (supervisor 1 本は USER 決定。registry は sessionId と世代、port の待避は `Map`)
- PB-3: 回収の可否 (`reapable`) という能力表明の出所が未定義 → M-001
- PB-4: 該当なし (標準入出力経路の launch も `isSafePermissionMode` / `assertSafePermissionMode` を通る)
- PB-5: 該当なし
- PB-6: 該当なし
- PB-7: → M-002

## 前 Round 指摘の継承判定

| R2 ID | 判定 | 根拠 |
|---|---|---|
| H-001 (本人確認のデータの出所 / 調停役側の pid 検証 / WslRuntime への限定) | resolved from prev | `isAcceptablePid` を両経路で使う (plan.md:148, :173, :196)。本人確認は行わないと明記し残余を記録 (:198, :254、spec.md:279)。registry に `reapable` (:211)、BE-023 に負例。ただし `reapable` の出所と Worker 側の経路への適用が欠けており M-001 として出す |
| M-001 (項目 19 の正規表現 / 項目 18・20 の取りこぼし) | resolved from prev | plan.md:269-271、tasks.md:155 |
| M-002 (Worker→調停役のデコード位置) | resolved from prev | `decodeWorkerMessage` (plan.md:161)、項目 18 の対象拡大 (:269)、BE-004。ただし列挙が「全部」になっていない → M-002 |
| M-003 (SC-009 にビルド出力の検査が無い) | resolved from prev | spec.md:307-308、plan.md:272、tasks.md:170 |
| L-001 (spawn 直後の窓) | resolved from prev | plan.md:176、tasks.md:142 |
| L-002 (スレッドの異常終了の誘発手段) | resolved from prev | spec.md:303、tasks.md:14 |

## Findings

### [Medium] `reapable` の出所が未定義。Worker 側の `killPid` 経路は `reapable` を見ないため、Decision 5 の「回収は WslRuntime 専用」が調停役スレッド側で成り立たない (M-001) (scope: feature) — new (R2 H-001 の解消策の中に残った穴)

- **観察**:
  - `reapable` は「起動前段の結果 (WslRuntime で起動したか) から決める」としか書かれていない (plan.md:211)。現行の `RuntimeLaunchSpec` (`agent-session.ts:109-124`) にも `RuntimeLaunchSpecParams` (`launch-spec.ts:152-165`) にも、ランタイム種別や回収の可否を表すフィールドは無い。このため `session-launch-service.ts` が `runtime.kind === 'wsl'` のような分岐を自分で書く余地が残る。項目 15 はランタイム種別による分岐を検出しない。
  - Decision 5 は回収を「WslRuntime 専用」とするが、調停役スレッド側の経路は `ended` 未着で pid が記録済みなら無条件に `killPid(pid)` を呼ぶ (plan.md:176)。supervisor-core はランタイム種別も `reapable` も受け取らない。BE-022 にも `reapable: false` に当たる負例が無い。
- **同種事象探索**: `reapable` を spec_dir の *.md で 5 件 (plan.md:49, :196, :211, :214 / tasks.md:145)。出所と調停役スレッド側への適用を書いた行は 0 件。
- **リスク/影響**: 現状は WSL だけなので実害はまだ無い。Win32Runtime / Docker が加わったとき、Worker 側で検証されていない kill 経路が黙って有効になり、app には種別分岐が書かれやすい。
- **推奨アクション**:
  1. 回収の可否は infra/runtime が決めて値で運ぶ (例: `RuntimeLaunchSpec` に `orphanReap: 'pid' | 'none'`、値は `buildRuntimeLaunchSpec` が設定)。`session-launch-service` はこの値を registry にコピーするだけにし、種別を見ないと明記する。
  2. 同じ値を supervisor の `launch` の options に載せ、supervisor-core は `'pid'` のセッションだけ `killPid` を呼ぶ。`'none'` では「回収できない件数」を計上する。
  3. BE-022 に「`orphanReap: 'none'` で `killPid` が呼ばれない」を、BE-004 にこの値の enum 検証を足す。
- **根拠**: AD-043 Decision 5 / Principle II / AD-018 / AD-003 / runtime charter
- **scope 根拠**: plan の agents 節・main/app 節、tasks BE-004 / BE-008 / BE-022

### [Medium] 項目 18 の対象は「`supervisor-protocol.ts` 以外の全部」と書きながら 2 ファイルの列挙になっている。本文を扱う `transport.ts` (`openBodySink`) が漏れており、その import 先の `protocol.ts` には `JSON.parse` がある (M-002) (scope: feature) — new

- **観察**: 項目 18 の対象は `supervisor.ts` / `supervisor-core.ts` の 2 ファイル (plan.md:269)。しかし調停役スレッドで本文に触れるのは transport の `openBodySink` でもある (plan.md:165)。`transport.ts` は `./protocol` を import し (`transport.ts:1`)、`protocol.ts` には列挙用の `JSON.parse` がある (`protocol.ts:193,256`)。sink や supervisor-core が既存デコーダを流用して本文をパースしても、項目 18 は 0 件のまま緑になる。対象を実名列挙する方式なので、モジュールを後から足すと黙って対象外になる。
- **同種事象探索**: `JSON\.parse` を src/agents (テスト以外) で 2 件 (`protocol.ts:193, :256`)。`transport.ts` 自体の参照は 0 件で、対象に加えても違反は出ない。
- **リスク/影響**: SC-002 が、本文を最も直接に扱うモジュールを検査しないまま「検査済み」と記録される。
- **推奨アクション**:
  1. 項目 18 の対象に `src/agents/transport.ts` を加える。
  2. 対象を「`supervisor.ts` から静的 import で到達する `src/agents/` のモジュールのうち、`supervisor-protocol.ts` と `protocol.ts` を除く全部」と定義するか、少なくとも `supervisor.ts` の import 集合が列挙と一致することを項目 18 自身で照合する。
  3. `UNDETECTED_NOTES` に「デコーダを本文に適用する呼び出しは見えない」を記録し、BE-005 に「本文の payload が `decode*` 系の関数に渡らない」(spy) の観点を足す。
- **根拠**: PB-7 / AD-024 #2 / AD-031 §2 / spec FR-002・SC-002
- **scope 根拠**: `check.mjs` 項目 18、`tests/rule-fixtures/`、BE-005

### [Medium] SH-000 (4) は素の `node` による起動しか測らない。本番でしか通らない 2 つの条件 (utilityProcess での `process.argv[2]` の位置と、asar 内の worker entry を `new Worker` で読めるか) が未測定のまま、CI でも E2E でも通らない (M-003) (scope: feature) — new

- **観察**:
  - supervisor entry は worker entry のパスを `process.argv[2]` で受け (plan.md:179)、main は `utilityProcess.fork` の起動引数で渡す。現行の fork は引数 `[]` (`session-spawner.ts:39`)。utilityProcess の子で `process.argv` の何番目に引数が入るかは測られていない。SH-000 (4) が測るのは素の `node` 起動だけ。
  - 配布物は asar で包まれ、`electron-builder.yml:21-23` の `asarUnpack` は `resources/**` と SDK だけを展開する。worker entry のチャンクは `app.asar` 内のパスになり、utilityProcess の中で `new Worker(<app.asar 内のパス>)` が解決できるかは未測定。AD-009 は「asar 内の実行ファイルは直接起動できない」としている。
  - E2E は fake の supervisor 接続を使うので、本物の fork・argv・Worker のロードは CI を通らない。
- **同種事象探索**: `asar|argv` を spec_dir で検索すると plan.md:179 の 1 件だけで、asar に触れた行は 0 件。
- **リスク/影響**: パッケージ版で最初の launch の Worker 生成に失敗し、M2 の主機能が配布物でだけ壊れる可能性がある。例外で落ちるので High にはしない。
- **推奨アクション**:
  1. SH-000 (4) に 2 項目を足す: (a) `utilityProcess.fork(path, [workerPath])` の子で `process.argv` のどの位置に値が入るか、(b) パッケージ版で asar 内の worker entry を utilityProcess 内の `new Worker` で読めるか (読めなければ worker チャンクを `asarUnpack` に足し、展開先のパスを infra 側で 1 箇所で解決する)。
  2. supervisor entry では引数を位置に依存させない (例: `--worker-entry=<abs>` を探す。絶対パスでなければ理由キーを付けて起動を失敗させる)。
  3. SH-022 にパッケージ版での 1 本起動を足す。
- **根拠**: Principle VII / AD-010 / AD-009 / Principle I
- **scope 根拠**: SH-000 / SH-022 / plan の supervisor entry 節

### [Low] 調停役スレッド側の `isAcceptablePid` の除外集合が `[selfPid]` だけで、親プロセス (Electron main) の pid を除外しない (L-001) (scope: feature) — new

- **観察**: 調停役スレッドは `isAcceptablePid(pid, [selfPid])` で pid を受理する (plan.md:173)。main 側は `[process.pid, supervisorPid]` を除外しているが、調停役スレッド側には supervisor の親の pid が無い。
- **同種事象探索**: `isAcceptablePid` を spec_dir で 4 件。調停役スレッド側で `ppid` を除外する行は 0 件。
- **推奨アクション**: `isAcceptablePid(pid, [selfPid, process.ppid])` にする (`parentPid` として注入)。BE-005 の負例に「親の pid」を足す。
- **根拠**: AD-043 Decision 5 / spec FR-012

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `reapable` (spec_dir *.md) | 5 | plan.md:49, :196, :211, :214 / tasks.md:145 |
| M-002 | `JSON\.parse` (src/agents、テスト以外) | 2 | src/agents/protocol.ts:193, :256 (transport.ts:1 から import) |
| M-003 | `asar\|argv` (spec_dir *.md) | 1 | plan.md:179 (asar は 0 件) |
| L-001 | `isAcceptablePid` (spec_dir *.md) | 4 | plan.md:148, :173, :196 / tasks.md:27 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 1
- Round inheritance: resolved from 2: 6 / unresolved: 0 / new: 4
