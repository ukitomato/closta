---
status: accepted
date: 2026-10-20
id: AD-058
deciders: ukitomato
tags: [session, runtime, process, env]
supersedes: []
superseded-by: []
---

# AD-058: Win32Runtime の直接起動の契約とプロセス木の停止

## Context

[spec 020](../../specs/020-session-win32-direct-launch/spec.md) (X-8) は `Win32Runtime` で Claude Code のセッションを起動する。今の起動の値 (`RuntimeLaunchSpec`) と停止は `wsl.exe --exec` 形だけを前提にしている ([AD-036](0036-single-session-launch-process-and-live-stream.md) §3 / §6・[AD-018](0018-wsl-process-control.md) §3・[AD-043](0043-single-supervisor-session-threads-and-session-limit.md) Decision 5・[AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (e)・[AD-025](0025-workspace-folder-carries-location.md))。Windows では `claude.exe` を直接起動するので、起動の値の形・env・止め方を決め直す必要がある。

利用者の判断 (spec の U-1〜U-4。2026-10-19 承認) を前提に、契約を本 ADR に置く。規則の詳細の正本は [data-model.md](../../specs/020-session-win32-direct-launch/data-model.md) であり、本 ADR は決定と保証の範囲を書く。調査は [research.md](../../specs/020-session-win32-direct-launch/research.md)。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-036 §3 の起動の値 (`wsl.exe` + `prefixArgs` の 1 形) | `RuntimeLaunchSpec` は `WslLaunchSpec` (今の形。`kind` は省略可) と `Win32LaunchSpec` の和。WSL の形と検査は変えない |
| AD-036 §6 の env の許可リスト (WSL の 4 キー + `WSLENV`) | WSL はそのまま。Win32 は別の許可リスト (data-model §6.1 の 30 キー) |
| AD-018 §3 / AD-043 Decision 5 の「止めるのは `wsl.exe` の kill。孤児の回収役 (reaper) を置かない」 | Win32 では、子の handle を持つセッションスレッドが、`claude.exe` が生きている間に `taskkill /T /F /PID` で木ごと止める。reaper は置かない (`PID_KILL_MODULES` は `[]` のまま) |
| AD-041 (e) の注記「transport が増えたら和集合を見直す」 | 登録時の検証は WSL の 1 transport のまま。Win32 の transport のキーとの衝突は、到達可能性の判定で到達不可にし、起動の時点でも拒否する (Decision 5) |
| AD-025 の「所在 WSL × `Win32Runtime` は X-1 へ」 | 到達不可のまま (U-3)。検証の義務は X-8 で閉じる |

## Decision

1. **起動の値**: `Win32LaunchSpec` は `{ kind: 'win32', pathToClaudeCodeExecutable, command (= 同じパス), cwd (作業フォルダの HostPath), env, windowsHide: true, stop }`。`prefixArgs` を持たない。agents は `kind` で検査を分け、`kind` の無い値は今の WSL の規則で検査する。spawn はシェルを通さず、引数は配列。**Windows 固有の値 (実行ファイル・cwd・env・`windowsHide`・停止のコマンドと引数) はすべて main の `src/main/infra/runtime/` が組み、agents はデータで渡された指示を検査して実行するだけ** (プラットフォームを判定せず、リテラルを持たない。Principle II)。停止の引数の正本は domain の定数 `WIN32_TREE_STOP_ARGS` (`['/T', '/F', '/PID']`)、停止のコマンドの末尾の名前の正本は同じ場所の `WIN32_TREE_STOP_COMMAND_NAME` (`'taskkill.exe'`) で、main の組み立てと agents の検査の両方がこれらを使う。agents の検査は domain の定数と述語 (`stop.argsBeforePid` の完全一致・`stop.command` の末尾の名前の比較・`pathToClaudeCodeExecutable` の `classifyClaudeExecutable` が `exe`) だけで行い、Windows 固有の文字列を agents のファイルに綴らない
2. **claude.exe の場所**: 検出のときに 1 回解決して descriptor に持つ。順は設定の上書き → `%USERPROFILE%\.local\bin\claude.exe` → PATH。採るのは実在する `.exe` の絶対パスだけで、shim (`.cmd` / `.bat` / `.ps1`) は起動しない (CVE-2024-27980 の後の Node は shim を `shell: false` で起動できず、`shell: true` は引数の注入面を作る)。上書きが使えないときは自動の探索に戻らない。起動の失敗の理由は今の `claude-not-found` を使う (理由のキーを増やさない)
3. **プロセス木の停止**: 強制終了・閉じる・アプリの終了・renderer の再読み込み・セッションスレッドの例外では、セッションスレッドが `%SystemRoot%\System32\taskkill.exe /T /F /PID <pid>` を (絶対パス・シェルなしで) 起こし、**stdin を閉じる前に**木ごと止める。`claude.exe` が先に終わると子孫との親子の関係が切れ、`/T` が子孫をたどれなくなるため。期限は 5 秒で、過ぎたら記録して閉じる操作を進める。停止のコマンドが起動に失敗したら子だけを kill する。記録にはパス・コマンドの文字列・pid・env を出さない

   | 終わり方 | `claude.exe` | 子孫 |
   |---|---|---|
   | 強制終了・閉じる・アプリの正常な終了 (main からの全セッションの停止と supervisor の正常な shutdown)・renderer の再読み込み・セッションスレッドの JS の例外 | 止まる | 止まる |
   | 停止が 5 秒を過ぎた | 保証しない (記録する) | 保証しない |
   | 穏当な終了 (claude が自分から終わる) | 止まる | Claude Code の終わり方に依る (保証しない) |
   | Worker の異常終了 (`terminate()`・メモリ上限超過) | 保証しない | 保証しない |
   | supervisor の異常終了・外からの kill・main の異常終了 | 止まる (libuv の job の `KILL_ON_JOB_CLOSE`。実機で確かめる) | 保証しない |

   保証しない行の実機観測は X-6 の「Worker だけが異常終了したときの孤児の観測」に Win32 を足して扱う
4. **期限**: Win32 の停止の分だけ終了の待ちを延ばす — supervisor の shutdown の既定 3,000 → 6,000 ms、`DEFAULT_DISPOSE_WAIT_MS` 3,000 → 6,000 ms、`QUIT_TIMEOUT_MS` 5,000 → 7,000 ms。WSL の `CHILD_EXIT_TIMEOUT_MS` (3,000) は変えない
5. **env**: Win32 の env は許可リストのキーだけを親の env から拾い、`LAUNCH_ENV_DENY_PATTERN` を重ねて当てる。`WSLENV` / `WSL_UTF8` は入れない。Provider の導出 env は `forwardKeys` のキーだけを重ねる。許可リストのうち proxy の 3 キー (`HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`) は Provider が上書きしてよいキーで、Provider の値がホストの値に勝つ (登録時の検証が extraEnv に入れることを許しており、値が名前空間に依らないため)。`NODE_EXTRA_CA_CERTS` は上書きさせない — 値はファイルのパスで、登録時の検証が Windows のパスの形を拒否するため保存済みの値は必ず WSL の POSIX パスであり、重ねると `claude.exe` が読めずホストの社内 CA の値も消える。残りの許可リストのキー (`NODE_EXTRA_CA_CERTS` を含む Win32 の transport のキー)・固定の禁止キーに当たるもの (導出が足す `CLAUDE_CONFIG_DIR` などを除く)・制御文字を含む値は `invalid-config` で拒否する。登録時の検証は広げない (広げると保存済みの Provider の extraEnv が不正になり消える)。その代わり、**到達可能性の判定にランタイムの種類ごとの transport の禁止キーの述語を注入し、extraEnv が Win32 の transport のキーに当たる Provider は Win32 で到達不可にする** (判定と起動を同じ述語で決める。AD-041 (e) の「判定と実行の一致」を保つ)。起動の時点の拒否は多重の防御として残す
6. **Provider の config ディレクトリ**: 到達可能性の判定と起動の導出は `resolveConfigDirPath` だけで決める。Win32 ではホストのパスは到達可能 (HostPath のまま渡す)、UNC は到達不可。`assessReachability` の win32 の特例は消す。helper の方式は Win32 で到達不可のまま
7. **claude.exe の場所の指定**: userData の `runtime-settings.json` (`{ schemaVersion: 1, win32ClaudePath }`) に置く。選択と検査は main が行い (renderer はパスを渡さない)、DTO はパスを持たない

## Consequences

- アプリの終了の最悪の待ちが 5 秒から 7 秒に延びる
- `taskkill` の起動から子の終了までの間に pid が再利用される窓が理論上残る (子の handle を持ったまま起こすので、子が終わる前に pid が再利用されることはない。窓は子が止まった後の taskkill の木のたどりだけ)
- Provider のプロキシの URL に埋め込んだ資格情報は `HTTP_PROXY` などで渡る (WSL の起動と同じ扱い。denylist はキー名だけを見る)
- `PROCESS_SPAWN_MODULES` は増えない (停止のコマンドは既に許可されたセッションスレッドの module から起こす)。許可の理由の注記を直す

## Alternatives

- **Job Object** — native の addon か PowerShell の常駐が要る。依存とプロセスの数が増える
- **PowerShell の `Stop-Process` / CIM での木のたどり** — 起動が遅く (本機で秒単位)、停止の期限に収まらない
- **`tree-kill` などの npm パッケージ** — 中で `taskkill` を起こすだけで、依存を増やす理由が無い
- **shim を `shell: true` で起動する** — 引数の注入面を作る (Constitution Principle V)
- **登録時の検証を Win32 のキーまで広げる** — 保存済みの Provider を壊す

## Confirmation

- 起動の値・env・decoder・停止の順番は単体テスト (data-model §5・§6・§9。許可リストと `WIN32_TREE_STOP_ARGS` は pin テスト。組み立てた値が decoder を通る往復のテスト)
- 判定と導出の一致は SC-005 の表のテスト (config ディレクトリと extraEnv の行)
- 実機は [quickstart.md](../../specs/020-session-win32-direct-launch/quickstart.md) の V-1〜V-9。V-1 と V-3 は完了の前に必須。結果を roadmap の X-8 の行に書く
