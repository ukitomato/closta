# Quickstart Results: supervisor 分離とマルチセッション (X-5)

## SH-000 — 成立性の実測 (2026-10-01)

**環境**: Windows 11 Enterprise 10.0.26200 / Electron 39.8.10 / `@anthropic-ai/claude-agent-sdk` 0.3.270 / WSL `Ubuntu-26.04` (Running) / `claude` 2.1.286 (`/home/yukiyamato/.local/bin/claude`)

**試作**: リポジトリ外 (セッションの scratchpad) に、Electron main → `utilityProcess.fork(supervisor.mjs, ['--worker-entry=<abs>', 'second-arg'])` → `new Worker(worker.mjs, { resourceLimits })` → Worker 内で SDK `query()` + `spawnClaudeCodeProcess` (`wsl.exe --cd /tmp -d Ubuntu-26.04 --exec <claude> ...`) を組んだ。本文は Worker が `JSON.stringify` した文字列を supervisor の主スレッドが port へ中継した。fork env は curated 相当 (`SystemRoot` / `windir` / `TEMP` / `TMP` / `USERPROFILE`) に絞った。孤児の判定は、Windows 側の `tasklist /FI "PID eq <wsl.exe の pid>"` と、WSL 内の `pgrep -f` の件数 (前後比較。件数 1 は `pgrep` を起動した `sh -c` 自身) で行った。

| # | 項目 | 結果 | 観測 |
|---|---|---|---|
| (1) | utilityProcess 内の Worker で SDK `query()` と `child_process.spawn` が動くか | **成立** | `sdk-imported` → `spawned` (wsl.exe pid) → 本文 `system/init` → `assistant` ("ok") → `result/success` → `child-exited` (code 0) → Worker exit 0。モデル呼び出し 1 回 |
| (2) | utilityProcess が受け取った port (`MessagePortMain`) を Worker の `transferList` に渡せるか | **不成立** | `Found invalid value in transferList.` (`e.ports[0]` は `MessagePortMain`)。→ **中継の分岐**で確定。Worker が文字列化した本文を調停役スレッドが port へ中継する形は (1) で動作確認済み |
| (3a) | Worker を `terminate()` したとき、その Worker が spawn した `wsl.exe` / `claude` が残るか | **残らない** | spawn 4 秒後に terminate (プロンプトの入力は開いたまま) → 2 秒後に `wsl.exe` は存在せず、WSL 内 `claude` の件数も起動前に戻った |
| (3b) | supervisor を `utilityProcess.kill()` したとき | **残らない** | 4 秒以内に `wsl.exe` は存在せず、WSL 内 `claude` も起動前の件数 |
| (3c) | supervisor を `taskkill /F` で強制終了したとき (クラッシュ相当) | **残らない** | supervisor exit 1。4 秒以内に `wsl.exe` は存在せず、WSL 内 `claude` も起動前の件数 |
| (3d) | Worker が `resourceLimits` を超えたとき (`maxOldGenerationSizeMb: 256` で意図的に超過) | **Worker だけが落ち、残らない** | `worker-error: Worker terminated due to reaching memory limit: JS heap out of memory` → Worker exit 1。supervisor は生存。2 秒後に `wsl.exe` は存在せず、WSL 内 `claude` も起動前の件数 |
| (4a) | utilityProcess の子で、fork の起動引数が `process.argv` のどの位置に入るか | **測定済み** | `[electron.exe, <script>, <第 1 引数>, <第 2 引数>]`。第 1 引数は `process.argv[2]`。plan どおり位置に依存せず `--worker-entry=<abs>` を探す形にする |
| (4b) | electron-vite で supervisor / worker entry を `?modulePath` で別ファイルに出し、ビルド成果物の supervisor を `node` で起動できるか / パッケージ版で asar 内の worker entry を `new Worker` で読めるか | **成立 (2026-10-01、実装後に実測)** | 下の SH-022「ビルド出力と単独起動」「パッケージ版」。AD-043 を accepted にした |

### 分岐の決定 (plan「SH-000 の結果による分岐」)

- **(2) → 中継の分岐**。本文はセッションスレッドで文字列化し、調停役スレッドが transport の本文の出口 (`openBodySink`) へ渡す。直送の分岐は採らないので、R3-M-08 (直送分岐の標準入出力経路) と BE-014 の直送分岐の追加検査は対象外になる
- **(3) → pid による回収経路を作らない**。Worker の terminate・メモリ上限超過・supervisor の kill / 強制終了のいずれでも孤児が残らなかった。したがって次を作らない (plan / tasks の該当箇所を同じ PR で直す):
  - main の `reap-wsl-launchers.ts` (BE-023) と registry の `reapable`
  - 調停役スレッドの `killPid` / `spawning` の帳簿 / pid の記録と `isAcceptablePid` / `spawned` の main への送信
  - check.mjs 項目 19 (pid 指定 kill の置き場) は登録先 0 件で新設し、`process.kill` 参照を書けるモジュールを持たない状態を固定する
  - Worker が `ended` 未着で終わったときは、`claudeAlive: false` と `process-crashed` を合成するだけでよい (子は残らない)
- **残余**: 孤児が残らない仕組みは、所有プロセス (Worker を抱える supervisor) の終了・スレッドの終了で子の stdin パイプが閉じ、`claude` が EOF で終わる (または Electron がプロセスツリーを回収する) ことに依っていると見られる。どちらの仕組みかは切り分けていない。SC-008 の実機観測 (SH-022) で、アプリ終了・再読み込み・`wsl.exe` の停止についても同じく 0 件であることを確かめる

## SH-022 — 実機記録 (2026-10-01)

**環境**: SH-000 と同じ (Windows 11 / Electron 39.8.10 / SDK 0.3.270 / WSL `Ubuntu-26.04` / `claude` 2.1.286)。
実機操作は Playwright (`_electron`) でパッケージ版 (`dist/win-unpacked/closta.exe`) を操作した。検証用の userData (`--user-data-dir`) に作業フォルダ `/tmp/closta-x5` だけを登録し、利用者の実プロジェクトの会話履歴に検証用セッションを残さないようにした。孤児の数は Windows 側の `tasklist` の `wsl.exe` 件数と、WSL 内の `pgrep -f -c <claude のパス>` で前後比較した (基準 `wsl.exe`=19 は検証と無関係の常駐分)。モデル呼び出しは 1 回の通しで約 15 回。

### ビルド出力と単独起動 (SC-009)

| 項目 | 結果 | 観測 |
|---|---|---|
| チャンクの分離 | 成立 | `out/main/supervisor-*.js` (11.5 kB) と `out/main/sdk-agent-session-*.js` (20.5 kB) が別ファイルに出る |
| `require` / `import` の件数 | 成立 | supervisor: `node:worker_threads` の 1 件のみ。worker: `node:child_process` / `node:worker_threads` / `@anthropic-ai/claude-agent-sdk` の 3 件のみ。**`electron` 0 件・他チャンクの読み込み 0 件** |
| `node` で単独起動 → 標準入力を閉じる | 成立 | 空の標準入力で起動すると 0.6 秒で exit 0 |
| 標準入出力で 2 セッション | 成立 | 2 本を launch → 実 `claude` が応答 (`done`) → `end` → 生存フラグ false → `thread-ended` ×2 → 標準入力を閉じて supervisor exit 0 (6.6 秒)。行 16 本 (本文 8 / 状態通知 6 / thread-ended 2)。前後で `wsl.exe`=23→23・`claude`=0→0 |

### パッケージ版 (asar) と quickstart のシナリオ

| # | シナリオ | 結果 | 観測 |
|---|---|---|---|
| 4b | パッケージ版で worker entry を asar から `new Worker` で読む | PASS | 3 本とも起動して応答待ちに到達 |
| a | 実 `claude` で 3 本を並行に起動 → 切り替え | PASS | 3 本が並行に応答。切り替えで各セッションに自分の発話だけが見える。稼働 3 本で `wsl.exe` +6・`claude` 3 |
| b | 1 本を終了 → 1 本を応答中に強制終了 → 残りが続く | PASS | 終了した行は「終了済み」で composer 無効。強制終了の行に通知。3 本目が応答 |
| c | 10 本で 11 本目を起動 | PASS | 「同時に動かせるセッションは 10 件までです…」で拒否、行は 10 のまま。10 本で `wsl.exe` +20・`claude` 10 |
| c | 1 本で巨大な出力 (`seq 1 300000` を Bash で実行) の最中に別のセッションへ送信 | PASS | 巨大出力側が「応答中」のまま、別のセッションが 1.4〜1.9 秒で応答。巨大出力側も最後の行 (300000) を返した。本機の `claude` は Bash が事前許可されていたため承認カードは出なかった |
| e | 本番ビルドで Ctrl+R / Ctrl+Shift+R | PASS | 押しても再読み込みされず 10 行のまま (R3-H-01。`watchWindowShortcuts`) |
| d | renderer の再読み込み | PASS | 10 本稼働 (`wsl.exe`=39・`claude`=10) → 再読み込み後 8 秒で基準 (`wsl.exe`=19・`claude`=0) |
| d | supervisor (utilityProcess) を `taskkill /F` | PASS | 全行が「失敗」(supervisor-exited の文言)。数は基準に戻る。次の起動で supervisor を起こし直して応答 |
| d | 応答待ちのセッションの `wsl.exe` を 1 本だけ `taskkill /F` | PASS | その行だけが「失敗」になり、もう 1 本は応答待ちのまま |
| d | アプリの終了 | PASS | 終了後 8 秒で基準に戻る |

**実機で見つかって直した不具合** (いずれも E2E の偽接続では出なかった):

1. **一覧の操作ボタンが隣の行に重なり押せない** — ThreadList の行に操作を足した際の `flex-wrap` と Trigger の `h-full` の組み合わせ。操作のある行を縦積みにして修正し、E2E (SC-006) に「行の終了を押す → 終了済み」を足した
2. **応答待ちの間の `wsl.exe` の異常終了が「失敗」でなく「終了済み」になる** (FR-012 違反) — SDK の stream が例外なく終わるため。セッションスレッドが終了処理の外での子の終了を `process-crashed` とし、run-state の `fail` を `done` からも受けるようにした (単体を追加)
3. **最初のプロンプト待ちのセッションを「終了」すると、期限切れで強制終了 (`end-forced`) に落ちる** (pr-gate R1 po H-001 の修正後に、標準入出力の単独起動で実 `claude` を使って確認) — 最初のプロンプトの前は、プロンプトの入力を閉じても `claude` が自分から終わらない。`claude` は最初のプロンプトを受けるまで会話を始めず、会話の履歴 (JSONL) もまだ書いていない前提で、最初のプロンプトの前の終了は期限を待たずに子を止め、破損の警告を出さないようにした。修正後は約 0.7 秒で `thread-ended` に至り、`end-forced` は出なかった (単体 `sdk-agent-session.test.ts` を追加)。**JSONL が作られていないことのファイル単位の確認と、この経路の前後の孤児数の比較は記録していない**

### SC-003 (10 本並行での入力の滑らかさ) の実測

E2E (`e2e/multi-session.spec.ts`。本物の起動調停 + 偽の supervisor 接続) で、10 本が各 20 件/秒・1KB を 30 秒流し 1 本が上限いっぱいの part を流す間に、表示中のセッションの composer に打鍵した。

| 段階 | 50ms 超の long task | 最大 | 入力遅延 p95 |
|---|---:|---:|---:|
| 実装直後 | 54 件 | 123ms | (計測不良) |
| 対策後 (末尾 100 件の窓・仮想化の id キー・下書きの非リアクティブ保持・composer の memo 化・ThreadList) | 0〜10 件 (実行ごとに揺れる) | 51〜84ms | 17〜29ms |
| 巨大な part を計測の窓の中で流し、着信を assert (pr-gate R1 po H-002 / R2 po M-102。2026-10-02、3 回) | 0〜1 件 | 59ms | 19〜26ms |

R2 の計測: 巨大な part は計測を仕込んだ時点では未着で、打鍵の間 (ページ時刻 22.6〜23.0 秒) に届いた。着信の検出を一覧の MutationObserver で行った版は、監視自体が負荷中の再描画ごとに走って計測を重くした (5 回中 1 回が p95 78.7ms・long task の最大 101ms で不合格)。200ms ごとに 1 回読む方式に替えて上の値になった。

切り分け: 裏の 9 本だけが流す場合は long task 0 件 (p95 16ms) で、残りは表示中のセッション自身の描画と打鍵が重なったときにだけ出る。件数の揺れは本機の常駐セキュリティによる揺れと区別できないため、SC-003 の合否は「入力遅延 p95 ≤ 50ms かつ long task の最大 < 100ms」とし、件数は記録のみとした (利用者判断 2026-10-01)。