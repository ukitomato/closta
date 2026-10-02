---
status: accepted
date: 2026-10-01
id: AD-043
deciders: ukitomato
tags: [session, process, performance, supervisor]
supersedes: []
superseded-by: []
---

# AD-043: 単一 supervisor + セッションスレッドと同時実行数の上限

## Context

X-5（[spec 009](../../specs/009-session-supervisor-and-multi-session/spec.md)）は、複数のセッションを並行に起動・切り替え・停止できるようにする。X-1 / X-4 は supervisor を **per-session の `utilityProcess`** として実装し、2 本目の起動を `session-active` で拒否していた。この形は次の accepted の決定に基づく。

- [AD-023](0023-application-architecture.md) §1: レイヤ表の agents の寿命は「セッション開始〜終了」
- AD-023 §6: `agents` はセッションごとに 1 プロセス。根拠は 3 つ — (i) 1 スレッドで全セッションを捌くと 5MB のパース中に他が止まる / (ii) クラッシュ隔離 / (iii) 単独起動がセッションと 1:1 で自然
- [AD-036](0036-single-session-launch-process-and-live-stream.md) §1: 実行単位は per-session の `utilityProcess`。§3: kill ハンドルは agents が保持する
- X-1 FR-002 / FR-019 / SC-011、X-4 US-1 AC7: 単一セッション不変 (`session-active`)

利用者は design-gate (R1〜R3) を通じて、supervisor を**単一の `utilityProcess` + セッションごとの `worker_threads`** にすること、同時実行数を 10 に固定して超過を拒否すること、main を経由するのは状態通知だけにすることを決めた。成立性は SH-000 で実測した（[quickstart-results.md](../../specs/009-session-supervisor-and-multi-session/quickstart-results.md)）。

本 ADR は SH-000 (4b)（electron-vite のビルド成果物と、パッケージ版の asar 内の worker entry）を実装後に実測し、Confirmation に書いて **2026-10-01 に accepted にした**。

merge 前の pr-gate R1（2026-10-02）で、Decision 1（AD-030 §5 訂正の非適用）・2（AD-006 の読み替え）・3（最初のプロンプト待ちの終了、X-1 data-model §4 の読み替え）・5（残余）・6（Worker の標準出力）・7（fork env の注入）に追記した。いずれも accepted の決定の範囲内の明確化と実装で分かった事実の記録であり、merge 後の変更は後続 ADR で行う（pr-gate R2 architecture L-102）。続く pr-gate R2 では、Decision 2 に roadmap の持ち主（Principle IX の Automated の改定）への参照を足し、Decision 2・6 と Consequences の「Constitution の改定で人間に諮る」を「v1.2.8 で追随した」に書き換えた（pr-gate R3 architecture L-201）。

## Decision

### 1. supervisor は単一の `utilityProcess` + セッションスレッドにする

**読み替える箇所**: AD-023 §1（agents の寿命）・§6（per-session プロセス）/ AD-036 §1 / X-1 FR-002

- supervisor は単一の `utilityProcess` とし、主スレッド（**調停役スレッド**）が、セッションごとに `worker_threads` の Worker（**セッションスレッド**）を起こす。SDK `query()` と stream のパースはセッションスレッドで行う。
- 寿命: supervisor は最初の起動要求で起こし、アプリ終了まで常駐する。セッションと寿命を共にするのはセッションスレッドである。
- AD-023 §6 の 3 根拠の扱い:
  - (i) パースの分離は、セッションスレッドに分けることで満たす。
  - (ii) **プロセス単位のクラッシュ隔離は失う**。supervisor のネイティブクラッシュは全セッションに及び、`supervisor-exited` として理由付きに示す。Worker の `resourceLimits` で、メモリ超過だけはスレッド単位に閉じ込める（SH-000 (3d) で、超過した Worker だけが落ちることを確認した）。
  - (iii) 単独起動の単位は supervisor 1 プロセスになる。標準入出力で複数セッションを扱う。
- [AD-030](0030-enumeration-runs-in-one-resident-process.md) §5（本体は経路を知らない）は**読み替えない**。経路の選択と、経路ごとの本文の出口（port か行か）の判定は `transport` が行う。
- ただし AD-030 §5 の訂正の「親は 2 経路の両方を購読する」は **supervisor には適用しない**（main は `stdio: 'ignore'` で fork し parentPort だけを購読する）。理由: utilityProcess の下では parentPort が必ず選ばれ、stdout を開くと標準入出力経路の本文の行が main に流れる経路を作るため（Principle IX / V）。両経路が実際に使われうる列挙プロセスには従来どおり適用する（pr-gate R1 architecture M-001）。
- AD-023 §3 の `AgentSession` の例示（`stop()`）は X-5 で古くなる。`stop()` は削除し、操作語彙を `SessionControl` と揃える。

### 2. 本文はセッションスレッドが文字列化し、調停役スレッドは解釈せずに中継する

SH-000 (2) で、utilityProcess が受け取った port（`MessagePortMain`）は Worker の `transferList` に渡せなかった（`Found invalid value in transferList`）。したがって本文は中継する。

- セッションスレッドは本文（`SessionEvent`）を `JSON.stringify` し、調停役スレッドへ送る。調停役スレッドは本文を `OpaqueBody` として、`transport` が作った本文の出口へ渡す。**JSON として解釈しない**（スレッド間の文字列コピーは許容する。本文の各 part は `BODY_MAX_BYTES` で有界）。
- main は本文のデータ経路に乗らない（AD-034 §1 / AD-036 §2 のまま）。renderer は受け取った文字列を復元し、形を検証する。
- 制御行と Worker からのメッセージのデコードは `supervisor-protocol.ts` に限り、本文の中身を読まない。
- Constitution Principle IX の Good example（パース済みの構造体を MessagePort で直送）から外れる。その扱いと検査の限界は Constitution v1.2.8（2026-10-01、X-5 SH-092 で承認）の IX の Good example と現状の制約に記録した。
- **読み替える箇所**: [AD-006](0006-supervisor-in-utility-process.md) Consequences の「supervisor 外に stream の `JSON.parse` が存在しないこと」。禁じる対象は **main process（と調停役スレッド）での stream の解釈**であり、renderer が中継された本文（`BODY_MAX_BYTES` で有界な part）を復元することは許す（X-1 で renderer が行っていた structured clone の deserialize と同じ位置づけ）。Constitution IX の Automated（「`src/agents/` の外に stream の `JSON.parse` 処理が存在しないこと」）の字面は v1.2.8 では未改定で、同じ節の X-5 の Good example と食い違っていた。利用者の承認を得て v1.2.9（2026-10-02）で「main process と調停役スレッドに stream の `JSON.parse` 処理が存在しないこと」に改めた（pr-gate R1〜R3 architecture H-001）。

### 3. 同時実行数は 10 に固定し、超過は拒否する

**読み替える箇所**: X-1 FR-019 / SC-011 / X-4 US-1 AC7・Edge Cases（`session-active`）

- 上限は 10。枠は起動要求の予約で占め、`claude` が終わるまで占め続ける。run-state では判定しない（X-1 の `done` は「応答完了・次のプロンプト待ち」と「強制終了後」の両方を表す）。
- 超過は理由キー `session-limit` で拒否する。`session-active` は廃止する。
- 応答待ち・中断済み・最初のプロンプト待ち（起動直後で一度も送信していない `launching`）のセッションに、破損警告の無い穏当な「終了」（制御 `end`）を足す（最初のプロンプト待ちは pr-gate R1 po H-001 で追加）。
- **読み替える箇所**: X-1 data-model §4 の状態機械。`fail` は `error` 以外のすべての状態（`done` を含む）から `error` へ進む。`done` は「生存して次のプロンプトを待つ」も表すため、応答待ちの間の `claude` の異常終了を `error` にする（SH-022 の実機で発見。終了・強制終了の後の `fail` はセッションスレッドの `closing` が塞ぐ。pr-gate R1 architecture M-002）。

### 4. main を経由するのは状態通知だけにし、バッチ化する

- 状態通知（sessionId / run-state / 理由キー / `claude` の生存フラグ）だけを supervisor→main→renderer で運び、supervisor の 100ms 窓でまとめる。
- sessionId は調停役スレッドが送信元の Worker から付ける。main の受信規則は domain の 1 関数（世代の照合・生存フラグの単調性）に置く。
- main での行のパースは本文を運ばないメタデータに限る（[AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) §2）。

### 5. kill の主体は変えず、pid による回収経路は持たない

**読み替える箇所**: AD-036 §3（kill ハンドルは agents が保持する）

- 主たる kill の経路は変えない。セッションスレッドが保持する子（`wsl.exe`）を kill する。
- SH-000 (3) で、Worker の `terminate()`・メモリ上限超過・supervisor の `utilityProcess.kill()`・`taskkill /F` のいずれでも、`wsl.exe` と WSL 内 `claude` は残らなかった。したがって、**pid を記録して main や調停役スレッドから止める回収経路は作らない**。Worker が終わったときは、生存フラグを false にして理由を合成するだけにする。
- 孤児が残らない仕組み（所有プロセスの終了で子の stdin が閉じるのか、Electron がプロセスツリーを回収するのか）は切り分けていない。アプリ終了・renderer の再読み込み・supervisor の強制終了・`wsl.exe` の停止は実機観測（SH-022）で孤児 0 を確かめた。
- **残余**: Worker 単体の異常終了（`terminate()` / メモリ上限超過）で孤児が残らないことは、`claude` がアイドル（プロンプトの入力を開いたまま）のときにしか観測していない。ツール実行中に Worker だけが落ちた場合、調停役スレッドは子の生存を確かめずに生存フラグを false にするため、`wsl.exe` / `claude` が残ったまま枠が空いて見えうる（pr-gate R1 platform-boundary M-001）。この観測は roadmap の X-6 に送る。残るなら本 Decision の条件（回収経路を作る）に戻る。

### 6. 単独起動の形

- 単独起動は `node <supervisor entry> --worker-entry=<worker entry の絶対パス>` とする。Worker の標準出力は受け取って読み捨てる（標準入出力経路のプロトコル行に混ぜない。pr-gate R1 platform-boundary L-002）。main は `?modulePath` で得たバンドル済みのパスだけを渡す（IPC・env・利用者入力から決まらない）。
- [AD-010](0010-supervisor-runs-standalone.md) の Decision の起動コマンド（`node dist/supervisor.js`）は例示であり、決定（Electron / ネイティブに依存しない・標準入出力で話す）は変えない。Constitution Principle VII の Statement の字面は v1.2.8（2026-10-01、X-5 SH-092 で承認）でこの形に追随した。

### 7. セッションスレッドの env と資源

- supervisor の fork env はランタイムに依存しない curated base とし、接続の構築時に注入する（起動ごとに受け取らない。pr-gate R1 platform-boundary L-001）。
- Worker は `env` を指定せずに起こし（supervisor の curated base の複製）、`SHARE_ENV` を使わない。資格情報を含む起動指示は最初の message でだけ渡し、調停役スレッドは以後保持しない。
- Worker には `resourceLimits` を指定する。

## Considered options

- **supervisor + セッションごとの子プロセス**: クラッシュ隔離をプロセス単位で保てるが、メモリは Node プロセス × N のまま。利用者が単一 supervisor + スレッドを選んだ。SH-000 (1) が成立しなければこちらに切り替える予定だった。
- **最小案（プロセス構成を変えない）**: X-1 の per-session `utilityProcess` のまま main 側に semaphore とバッチ化だけを足す。「supervisor に集約」の要求を満たさない。
- **port を Worker に直送する**: SH-000 (2) で `MessagePortMain` を Worker に渡せず、成立しなかった。
- **pid による回収経路（main / 調停役スレッド）**: SH-000 (3) で孤児が残らなかったので不要になった。作る場合は pid の検証・即時の終了通知・世代の照合が必要で、生成時刻による本人確認は Node から取れない（OS への問い合わせにプロセスの起動かネイティブ API を要する）ため、pid 再利用による誤 kill の残余が残る設計だった。

## Consequences

- メモリは Node 1 プロセス + Worker × N で、per-session プロセスより小さい。
- supervisor のネイティブクラッシュで全セッションが落ちる。US-4 で理由付きに示し、次の起動で 1 本だけ起こし直す。
- `check.mjs` に検査項目を足す: 調停役スレッドのモジュールでの `JSON.parse` 参照 0 件 / `process.kill` 参照を書けるモジュール 0 件 / `SHARE_ENV` と Worker の `env` 指定 0 件。
- Constitution Principle IX（Good example と現状の制約）と VII（Statement の起動形）は v1.2.8 で、IX の Automated の字面は v1.2.9（2026-10-02、利用者承認）で追随した。

## Confirmation

accepted の条件:

- [x] SH-000 (1) Worker 内で SDK `query()` と spawn が動く — 成立（quickstart-results.md）
- [x] SH-000 (2) port を Worker に渡せるか — 不成立。Decision 2 を中継の分岐で確定
- [x] SH-000 (3) 孤児が残るか — 残らない。Decision 5 を「回収経路を持たない」で確定
- [x] SH-000 (4a) utilityProcess の子での起動引数の位置 — `process.argv[2]` 以降。位置に依存しない `--worker-entry=` を採る
- [x] SH-000 (4b) electron-vite のビルド成果物の supervisor を `node` で起動できる / パッケージ版で asar 内の worker entry を `new Worker` で読める — **成立** (2026-10-01)。`out/main/supervisor-*.js` を `node <supervisor> --worker-entry=<worker>` で起こし、標準入出力で実 `claude` の 2 セッションを起動 → 応答 → 終了 → 標準入力を閉じて exit 0。パッケージ版 (`win-unpacked`) で 3 本が応答 (quickstart-results.md SH-022)

実装時に確かめる（実装後はチェックを付けるだけにする）:

- [x] SC-002 の構造検査（main が本文 port を保持しない / 調停役スレッドが本文を解釈しない）— supervisor-core の単体 (本文を `JSON.parse` しない・セッション port を購読しない) と check.mjs 項目 18
- [x] SC-009 の単体・ビルド出力の検査（`electron` の require 0 件）・quickstart の単独起動 — supervisor のチャンクの require は `node:worker_threads` だけ、worker のチャンクは `node:child_process` / `node:worker_threads` / SDK だけ (`electron` 0 件)
- [x] SC-008 の実機観測で孤児 0（アプリ終了・再読み込み・supervisor の強制終了・`wsl.exe` の停止）— いずれも `wsl.exe` と WSL 内 `claude` の数が起動前に戻った (quickstart-results.md SH-022)

## References

- [spec 009](../../specs/009-session-supervisor-and-multi-session/spec.md) / [plan](../../specs/009-session-supervisor-and-multi-session/plan.md) / [design-gate](../../specs/009-session-supervisor-and-multi-session/design-gate.md)
- [AD-006](0006-supervisor-in-utility-process.md) / [AD-010](0010-supervisor-runs-standalone.md) / [AD-018](0018-wsl-process-control.md) / [AD-023](0023-application-architecture.md) / [AD-030](0030-enumeration-runs-in-one-resident-process.md) / [AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) / [AD-034](0034-transcript-read-path-and-process-boundary.md) / [AD-036](0036-single-session-launch-process-and-live-stream.md)
