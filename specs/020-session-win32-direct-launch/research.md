# Research: Win32Runtime の直接起動 (X-8)

**Date**: 2026-10-20 (`/cl-plan`) | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本ファイルは Phase 0 の調査の記録である。speckit の research agents は使えないので、designer がソースと
`node_modules` の SDK (0.3.270) を読んで書いた。各節は「問い / 分かったこと / 決定 / 退けた案」の順で書く。
**実機でしか分からないもの**は「確かめ」に quickstart の番号を書く。行番号は 2026-10-20 の作業ツリーのもの。

---

## R-01 SDK の `spawnClaudeCodeProcess` が native の `.exe` に渡すもの

**問い**: `pathToClaudeCodeExecutable` に `C:\...\claude.exe` を渡したとき、SDK がコールバックに渡す
`SpawnOptions` (`{command, args, cwd, env, signal}`。`sdk.d.ts:8772`) は何か。

**分かったこと**

- SDK は `LFe(path)` (`sdk.mjs:121`) で native かを決める。拡張子が `.js` / `.mjs` / `.tsx` / `.ts` / `.jsx` でなければ native で、
  `command = path`、`args = [...executableArgs, ...CLI の引数]` になる。`.exe` は native。WSL の POSIX パス (`/home/.../claude`) も
  native で、今の `composeClaudeSpawn` (`session-core.ts:508-517`) が `options.args` を CLI の引数だけとして扱えているのはこのため
- `cwd` は SDK の `options.cwd` (Closta は渡さない。`QUERY_OPTION_KEYS` に無い) で、渡さなければ SDK 側の既定になる。`env` は SDK が組んだもの
- SDK の `close()` (`sdk.mjs:121` の ProcessTransport) は、子がまだ生きていれば **2,000 ms (`OFe`) 後に**、ホストが `win32` なら
  さらに 5,000 ms 待ってから `kill("SIGKILL")` する。つまり SDK が自分で子を殺すのは止める要求から約 7 秒後である

**決定**

- Win32 の spawn は `command = spec.pathToClaudeCodeExecutable`、`args = options.args`、`cwd = spec.cwd`、`env = spec.env` にする。
  SDK の `options.command` / `options.cwd` / `options.env` は使わない (WSL と同じく env は spec だけ。AD-036 §3 の H-01)
- SDK の遅い SIGKILL (約 7 秒後) は Closta のプロセス木の停止 (R-03。止める要求の直後に始める) より後なので、順番が入れ替わらない

**退けた案**: `options.command` をそのまま使う — SDK の判定 (`LFe`) に依存し、Closta が検出で確かめた絶対パスと別の値が入りうる。

## R-02 Windows のプロセス木と libuv の job

**問い**: `claude.exe` の子 (Bash tool の Git Bash、背景の task) は、親を止めると止まるか。supervisor が死んだらどうなるか。

**分かったこと**

- Windows は親を止めても子を止めない。子の `ParentProcessId` は親が死んでも書き換わらない (付け替えがない) ので、
  **親が生きている間なら** 親の pid から子孫をたどれる。親が死んだ後は、`taskkill /T` は親の pid が見つからずに失敗し、子孫は残る
- libuv (Node の `child_process`) は Windows で、`detached` でない子を **プロセスごとに 1 つの job** に入れる。job には
  `KILL_ON_JOB_CLOSE` と `SILENT_BREAKAWAY_OK` が付く (libuv `src/win/process.c` の `uv__init_global_job_handle`。記憶による。
  **確かめ: quickstart V-4**)。したがって
  - supervisor (`utilityProcess`) が死ぬと job が閉じ、**`claude.exe` は止まる**
  - `SILENT_BREAKAWAY_OK` のため、`claude.exe` が起こした子 (孫) は job に入らない。**孫は supervisor の死では止まらない**
- AD-018 §3 / AD-043 Decision 5 の「孤児が残らない」は `wsl.exe` の実測で、WSL の側で `wsl.exe` の終了が中の claude を止めるためである。
  Win32 では成り立たない (spec の「義務の扱い」の 5 行目)

**決定**: 止める操作は「`claude.exe` が生きている間に、その pid を根にプロセス木ごと止める」にする (R-03 / R-05)。
supervisor の異常終了・外からの kill・main の異常終了では `claude.exe` だけが libuv の job で止まり、孫は残りうる。
これを AD-058 の「保証しない終わり方」に書く (FR-011)。

## R-03 プロセス木を止める手段

**問い**: Node (Electron の utilityProcess の Worker) からプロセス木を止める方法。

| 案 | 評価 |
|---|---|
| **A. `%SystemRoot%\System32\taskkill.exe /T /F /PID <pid>`** (採る) | Windows に標準で入っている。引数は固定の 3 つと pid だけ。シェルを経ない。セッションスレッド (`sdk-agent-session.ts`。spawn の許可リストに既にある) から起こせる。本機ではプロセスの起動に 400〜2,400 ms かかる (CLAUDE.md) が、5 秒の期限に収まる |
| B. job object を自分で作る (ネイティブモジュール / FFI) | agents はネイティブモジュールを禁じる (AD-010 / Principle VII)。却下 |
| C. PowerShell / WMI (`Get-CimInstance Win32_Process` で子をたどる) | `powershell` は `PRIVILEGED_COMMANDS_ALWAYS` (Constitution 検証の項目 1) に入っている。起動も重い。却下 |
| D. npm の `tree-kill` | Windows では中で `taskkill /T /F` を呼ぶだけ。依存が増えるだけで得るものがない。却下 |
| E. `child.kill()` だけ | 子孫が残る (R-02)。U-2 に反する |

**決定**: A。コマンドのパスと固定の引数は `src/main/infra/runtime/win32-launch.ts` が組み、起動の値 (`Win32LaunchSpec.stop`) に載せて
agents へ値で渡す (`wsl.exe` と同じ構え。agents はリテラルを持たない)。agents は pid を末尾に足して起こすだけである。
`taskkill` は Constitution 検証の特権コマンドの表 (`allowlists.mjs:88` / `:142`) に無い。自分の子を止めるだけで特権を要さない (Principle VI)。

## R-04 pid で止めるときの取り違え

**問い**: pid の再利用で別のプロセスを止めないか (AD-043 Decision 5 が pid の回収経路を退けた理由)。

**分かったこと**

- Windows はプロセスのハンドルが開いている間、その pid を再利用しない。Node の `ChildProcess` はハンドルを `exit` の通知の直前まで
  閉じない (`internal/child_process` の `onexit` が `_handle.close()` の直後に `exit` を emit する)。したがって `childExited` が
  false の間に `taskkill` を**起こす**時点では、pid は確かに自分の子のものである
- ただし `taskkill` が実際に pid を引くのは別プロセスで、起動に数百 ms かかる。その間に子が自分から終わり、ハンドルが閉じ、
  pid が再利用される窓が残る (ミリ秒の単位。再利用されたプロセスが同じ pid を引く確率は低い)

**決定**: 起こすのは `!childExited` のときだけにし、1 セッションにつき 1 回だけ起こす (2 回目は同じ待ちを返す。Edge Cases の「重なる」)。
残る窓は AD-058 の Consequences に「既知の残余」として書く。閉じる手段 (ネイティブ API でハンドルを渡す) は Principle VII で取れない。
AD-043 Decision 5 の「pid による回収経路を持たない」は**ハンドルを持たない側 (main / 調停役スレッド) が後から pid で止める経路**の話で、
本 feature はハンドルを持っているセッションスレッドが自分の子に対して行う。項目 19 (`PID_KILL_MODULES`) は `process.kill` の参照を
見るもので、本 feature は `process.kill` を使わない。登録は 0 件のまま、注記を直す。

## R-05 止める順番 (入力を閉じる前に止める)

**問い**: 強制終了の今の順番 (`sdk-agent-session.ts:616-627`: 子の kill → abort → プロンプトのキューを閉じる) を Win32 でも使えるか。

**分かったこと**: プロンプトのキューを閉じると SDK は子の stdin を閉じ、abort すると SDK の `close()` が走る。`claude.exe` は stdin の
終わりで自分から終わりうる。**`taskkill` が子孫をたどる前に `claude.exe` が終わると、子孫は親の pid から外れて残る** (R-02)。
本機では `taskkill` の起動だけで最大 2.4 秒かかる。

**決定**: Win32 では、プロセス木の停止を先に起こし、`claude.exe` の終了 (または 5 秒の期限) を待ってから abort とキューの close を行う。
WSL の順番は変えない (FR-016)。分岐は起動の値に停止の指示 (`stop`) があるかで行い、`process.platform` を見ない (Principle II)。
規則の正本は data-model §9。

## R-06 `claude.exe` の場所

**問い**: native 版の既知の場所、npm 版の形、`shell: false` で起動できるもの。

**分かったこと**

- native installer (`install.ps1`) は `%USERPROFILE%\.local\bin\claude.exe` に置く (公式の手順。**確かめ: quickstart V-0**)。
  WinGet の版は `%LOCALAPPDATA%\Microsoft\WinGet\Links\claude.exe` (シンボリックリンク。PATH に入る) に現れる
- npm 版 (`npm i -g @anthropic-ai/claude-code`) は npm の bin に `claude.cmd` / `claude.ps1` / `claude` (sh スクリプト) を置く。`.exe` は無い
- Node は 2024-04 (CVE-2024-27980) 以降、`shell: false` で `.cmd` / `.bat` を起こすと `EINVAL` で失敗する。`.ps1` は実行ファイルではない。
  したがって shim は `shell: false` では起動できない (spec US-2 の Why)
- `fs.stat` はシンボリックリンクをたどるので、WinGet のリンクも `isFile()` で実体の `.exe` として判定できる

**決定**: 探す順は 設定の上書き → `%USERPROFILE%\.local\bin\claude.exe` → PATH の各要素 (FR-004)。PATH の要素は、ドライブレターの
絶対パスだけを使う (`makeHostPath` が UNC と相対を拒む。空の要素・引用符で囲まれた要素は引用符を外して判定する)。各要素で
`claude.exe` を先に、無ければ `claude.cmd` / `claude.bat` / `claude.ps1` を見て「shim がある」を記録する。PATHEXT は見ない
(shim の拡張子は npm が作る 3 つに固定。`.exe` だけを採る)。探索はランタイムの検出 (`list()`) の 1 回だけで、`wsl.exe` の呼び出し回数
(contracts/runtime-detection.md C-1 の 3 回) を変えない。規則の正本は data-model §1 / §2。

**退けた案**

- `where.exe claude` を起こす — プロセスが 1 つ増え (本機で最大 2.4 秒)、出力の解釈が要る。`fs.stat` で足りる
- npm 版を `node cli.js` で起こす — Out of Scope (spec)

## R-07 Windows の起動の env

**問い**: `claude.exe` (Windows) と Git Bash が動くのに要る env。FR-008 の「少なくとも」の外に足すもの。

**分かったこと**

- Windows の Claude Code は Bash tool に Git Bash を使い、`CLAUDE_CODE_GIT_BASH_PATH` か PATH 上の `git` から探す (公式の手順)
- ホームと設定の場所は `USERPROFILE` (`os.homedir()`)・`APPDATA`・`LOCALAPPDATA` から決まる
- Git Bash (MSYS2) と多くの CLI は `SystemDrive`・`ProgramData`・`NUMBER_OF_PROCESSORS`・`PROCESSOR_ARCHITECTURE`・`OS`・
  `USERNAME`・`USERDOMAIN` を読む
- 社内ネットワークでは `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` と、社内 CA の `NODE_EXTRA_CA_CERTS` が無いと API に届かない。
  WSL の起動ではこれらは WSL の中の env であり、Closta は転送していない。Win32 の起動ではホストの env が唯一の出所になる
- `LAUNCH_ENV_DENY_PATTERN` (`launch-spec.ts:37`) は上のどのキーにも当たらない

**決定**: 許可リストの正本は data-model §6 の表 (30 キー)。proxy と CA の 4 キーを入れる (無いと主開発ホストで US-1 が成り立たない)。
proxy の URL に資格情報 (`http://user:pass@host`) が入る形は denylist で拾えない。値はログに出さず、渡す先は利用者の `claude.exe` だけ
なので受け入れ、RK-05 に書く。`WSLENV` / `WSL_UTF8` は入れない (U-4)。
proxy の 3 キーは Provider の extraEnv が持つことを登録時の検証が許しており (AD-041 (e))、値 (URL・ホスト名) が名前空間に依らないので、
Win32 でも Provider の値がホストの値に勝つ「上書きしてよいキー」とし、transport の禁止キーから外す (data-model §6.1)。
`NODE_EXTRA_CA_CERTS` は外さない — 値はファイルのパスで、登録時の検証が Windows のパスの形の値を拒否する (`forward-env.ts:185-187`・`:213`) ため、
保存済みの extraEnv の値は WSL の POSIX パスに限られ、`claude.exe` は読めない (重ねるとホストの社内 CA の値も消える)。
残りの許可リストのキー (`NODE_EXTRA_CA_CERTS` を含む) と extraEnv が衝突する Provider は、
到達可能性の判定で Win32 では到達不可にする (data-model §6.4。判定と起動の一致)。

**退けた案**

- 親の env を全部渡す — 利用者のシェルの `ANTHROPIC_API_KEY` などが「既定 (claude の設定)」の起動に黙って混ざる (AD-036 §6 の趣旨)
- proxy を Claude Code の `settings.json` の `env` に書いてもらう — 主開発ホストで設定なしに動かない。案内だけでは US-2 の「何も設定せずに」に反する

## R-08 Provider の config ディレクトリ (FR-009)

**問い**: 到達可能性の判定と起動の導出が食い違う箇所。

**分かったこと**

- `assessReachability` (`src/domain/provider/reachability.ts:46-53`) は、ホストの configDir × win32 を `reachable`、UNC の configDir × win32 を
  `unreachable` と**自分で**決めてから `resolveConfigDirPath` を呼ぶ
- `resolveConfigDirPath` (`src/domain/provider/helper-path.ts:75-92`) は `runtime.kind !== 'wsl'` を一律に `unreachable` にする。
  `provider-service.ts:298` の導出はこちらを呼ぶので、win32 では `null` → `provider-unavailable` になる (spec US-4 の Why)
- `classifyHelperPath` (`helper-path.ts:44-45`) は win32 を `unreachable` にし、判定と導出の両方がこれを呼ぶ。helper の方式は Out of Scope で、今のままでよい
- 導出の値 `configDirRuntimePath` の型は `RuntimePath` (`src/domain/provider/types.ts:153`)

**決定**: `resolveConfigDirPath` に win32 の分岐を足す (ホストの configDir はそのまま `HostPath` で返す・UNC は `unreachable`)。
`assessReachability` の win32 の特例 2 行を消して、`resolveConfigDirPath` だけで決める (判定と導出を同じ関数に。FR-009)。
戻りの型は `HostPath | RuntimePath`。`configDirRuntimePath` は名前を変えずに型を広げる (改名は provider の X-3 / X-4 のテストを広く書き換える。
注記で「選んだランタイムから見たパス」と書く)。表の正本は data-model §8。

## R-09 claude の場所の指定の保存先

**問い**: FR-006 の指定をどこに永続化するか (spec の Key Entities で plan に任された)。

**分かったこと**

- 既存の設定のファイルは `folders.json` / `providers.json` / `presets.json` / `launch-usage.json` (`src/main/infra/settings/`)。どれも 1 つの関心に 1 ファイル
- ランタイムの descriptor は検出のたびに作り直す値で、永続化しない (`runtime-store.ts`)
- renderer から任意のパスを受ける IPC は無い。ホストのパスの入口は main のダイアログ (`pickHostFolder`。`composition-root.ts:365-389`) だけ

**決定**

- 新しいファイル `runtime-settings.json` (userData。`{ schemaVersion: 1, win32ClaudePath: string | null }`) と
  `src/main/infra/settings/runtime-settings-store.ts`。読み書きの形は `launch-usage-store.ts` に揃える (一時ファイル + rename、壊れたら `.bak`)
- 指定は **main のファイル選択のダイアログ** (`closta:pickWin32ClaudePath`) で受け、renderer はパスの文字列を送らない。解除は `closta:clearWin32ClaudePath`。
  どちらも保存の後にランタイムを検出し直す。契約の正本は contracts/ipc-win32-claude.md

**退けた案**: renderer の入力欄でパスを受ける — renderer から任意のパスを main に送る経路が増える (host-fs.ts の注記の方針に反する)。

## R-10 起動の失敗の理由のキー (FR-007)

**問い**: `claude-not-found` を使うか、足すか。

**分かったこと**: `LaunchFailureReason` は 18 で固定されている (`agent-session.test.ts:237`・`labels.test.ts:39`・glossary・ui-coverage D 節)。
起動を拒否するのは「claude が使えない」の 1 つで、利用者の直し方の違い (native を入れる・指定を直す) はランタイム一覧と起動ダイアログで出せる。

**決定**: `claude-not-found` を使う (18 のまま)。文言をランタイムに依らない形に直し (今はディストロ限定)、細かい理由は descriptor の
`claudeStatus` (DTO に出す) から引く。data-model §4 / §10。

## R-11 止める期限と、外側の期限

**問い**: 5 秒のプロセス木の停止 (FR-012) は、今の外側の期限の中に収まるか。

**分かったこと**

| 期限 | 値 | 場所 |
|---|---:|---|
| セッションスレッドの子の終了待ち | 3,000 ms | `sdk-agent-session.ts:183` |
| supervisor が親を失ったときの終了待ち | 3,000 ms | `supervisor-core.ts:83` |
| main の dispose の終了待ち | 3,000 ms | `session-launch-service.ts:111` |
| アプリの終了処理全体 | 5,000 ms | `src/main/index.ts:24` |

外側が 3 秒で切ると、main が supervisor を止め、job が `taskkill` ごと止めて (R-02)、孫が残りうる。

**決定**: Win32 のプロセス木の停止の期限を 5,000 ms (新しい定数) にし、外側を **dispose 6,000 ms・supervisor 6,000 ms・アプリの終了 7,000 ms** に上げる。
どれも上限で、全部のセッションが終われば待たずに進む (WSL では今どおり数十 ms で終わる)。WSL の子の終了待ち (3,000 ms) は変えない。
最悪の終了の時間が 5 秒から 7 秒に延びることを AD-058 の Consequences に書く。

## R-12 コンソールの窓

**問い**: コンソールを持たない supervisor から console アプリの `claude.exe` / `taskkill.exe` を起こすと、窓が出るか。

**分かったこと**: Node の `windowsHide` の既定は false で、親にコンソールが無いと console アプリに新しい窓ができうる。今の `wsl.exe` の spawn は
`windowsHide` を渡していない (実機で窓が出ていないので、utilityProcess の起こし方で抑えられている可能性がある。切り分けていない)。

**決定**: Win32 の 2 つの spawn に `windowsHide: true` を付ける。値は main が `Win32LaunchSpec.windowsHide` に載せ、agents は写すだけ (FR-014。data-model §5)。WSL の spawn は変えない (FR-016)。**確かめ: quickstart V-6**。

## R-13 Win32 のセッションの記録の場所 (spec Assumptions)

**問い**: Win32 で起動した `claude.exe` の記録は、今のセッション列挙 (R-2 のホストの対象) で読めるか。

**分かったこと**: 既定の config ディレクトリは `%USERPROFILE%\.claude` で、記録は `projects/<cwd を符号化した名前>/<uuid>.jsonl`。
R-2 はホストの対象として `hostHome` の `.claude` を列挙する (`composition-root.ts:144-180`)。Provider の config ディレクトリ (ホスト) を
`CLAUDE_CONFIG_DIR` で渡せば、その Provider の対象にも書かれる。

**決定**: コードの変更は要らない。**確かめ: quickstart V-7**。読めなければ X-9 (resume) の前提が崩れるので、利用者に返す。

## R-14 Constitution 検証と lint への影響

| 項目 / 規則 | 本 feature の扱い |
|---|---|
| 項目 1 (特権コマンド) | `taskkill` は表に無い。`powershell` / `wmic` を使わない |
| 項目 3 / 15 (`wsl.exe` の名指し・`WSL_FREE_DIRECTORIES`) | Win32 の新しいファイルに `wsl.exe` を書かない。`launch-preparation.ts` / `dto-mapper.ts` / `session-launch-service.ts` (WSL-free) に足すのは種類の分岐だけ |
| **項目 7 (プロセス起動 API の許可リスト)** | 新しいモジュールは足さない。`claude.exe` と `taskkill.exe` を起こすのは既に登録済みの `sdk-agent-session.ts`。**`SPAWN_CALL_PATTERNS` (`check.mjs:117-129`) はコメントの中の `spawn(` / `execFile(` / `fork(` / `utilityProcess` も拾う**ので、新しい infra / domain のファイルのコメントに起動 API の名前を括弧つきで書かない。登録の注記 (`allowlists.mjs:239-251`) を Win32 の 2 つに直す |
| 項目 8 (プラットフォーム分岐) | `process.platform` を使わない。ランタイムの種類 (`kind`) と起動の値の `stop` で分ける |
| 項目 19 (`PID_KILL_MODULES`) | `process.kill` を使わない。登録は 0 件のまま、注記 (`allowlists.mjs:281-294`) に Win32 の停止を書く |
| ESLint の spawn 例外 (`eslint.config.mjs:103-108`) | 例外のファイルは同じ。注記に Win32 の 2 つを足す |
| dependency-cruiser | 新しい infra のファイル (`win32-launch.ts` / `win32-claude.ts` / `runtime-settings-store.ts`) は `node:fs/promises` と domain だけを使う。`services-not-to-io` の対象 (`runtime-store` / `provider-service` / `session-launch-service`) に I/O の import を足さない (結線は `composition-root.ts`) |
| `tests/rule-fixtures/expected.mjs:884` (`worker-env-via-expression` の howToClose) | Worker の起こし方を増やさないので当たらない (plan の申し送り #17) |
