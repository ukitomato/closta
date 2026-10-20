# Data Model: Win32Runtime の直接起動 (X-8)

**Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

本ファイルが規則の正本である。plan・tasks・AD-058 はここを参照し、規則を書き写さない。

**変えないもの** (FR-016 / SC-006):

- WSL の起動の値の形 (`pathToClaudeCodeExecutable` / `command` / `prefixArgs` / `env`)・`buildRuntimeLaunchSpec`・`composeLaunchEnv`・
  `LAUNCH_ENV_ALLOWLIST` (4)・`TRANSPORT_FORWARD_KEYS`・`assertNoBackslash`・WSL の `decodeLaunchSpec` の規則
- WSL の停止の順番 (子の `kill` → abort → キューの close) と `CHILD_EXIT_TIMEOUT_MS` (3,000)
- `LaunchFailureReason` (18)・`LaunchPreflightReason` (3)・`SessionEvent` (9 種類)・`SessionControl`・`QUERY_OPTION_KEYS` (11)
- `PROCESS_SPAWN_MODULES` / `PID_KILL_MODULES` / `PLATFORM_BRANCH_DIRS` の中身 (注記だけ直す)
- 作業フォルダとランタイムの解決の判定表 (`resolveFolderRuntime`)。所在 WSL × `Win32Runtime` は `unreachable('unc-cwd-unsupported')` のまま (U-3)
- 登録時の extraEnv の検証 (transport の和集合 = WSL の 1 transport のまま。§6.3)

---

## §1 Win32Runtime の claude の状態 (domain)

### §1.1 実行ファイルの形の判定 — `src/domain/runtime/claude-executable.ts` (新設・純粋)

`classifyClaudeExecutable(raw: string): 'exe' | 'shim' | 'invalid'`

| 入力 | 結果 |
|---|---|
| `makeHostPath(raw)` が失敗 (相対・UNC・空・制御文字) | `invalid` |
| 末尾の名前 (`hostPathOps.basename`) の拡張子が `.exe` (大文字小文字を区別しない) | `exe` |
| 拡張子が `.cmd` / `.bat` / `.ps1` | `shim` |
| それ以外 | `invalid` |

ファイルが在るかは見ない (I/O を持たない。在るかは §2 の locator が見る)。

### §1.2 状態 — `src/domain/runtime/descriptor.ts`

```ts
export type Win32ClaudeStatus = 'found' | 'not-found' | 'shim-only' | 'override-invalid'

export interface Win32RuntimeDescriptor extends RuntimeDescriptorBase {
  // 既存のキーはそのまま
  /** ホストの claude.exe の絶対パス (HostPath の文字列)。`found` のときだけ非 null。IPC/DTO に出さない。 */
  readonly claudePath: string | null
  readonly claudeStatus: Win32ClaudeStatus
  /** 設定で場所を指定しているか (ランタイム一覧の「指定を解除」を出すため)。 */
  readonly claudeOverridden: boolean
}
```

| `claudeStatus` | 条件 (§2 の結果) | 起動 |
|---|---|---|
| `found` | 採った `.exe` がある | 可 |
| `not-found` | 指定なし・既知の場所にも PATH にも `.exe` も shim も無い | 拒否 (`claude-not-found`) |
| `shim-only` | 指定なし・`.exe` は無いが PATH に shim がある | 拒否 (`claude-not-found`) |
| `override-invalid` | 指定ありで、指定が `exe` でない・ファイルが無い | 拒否 (`claude-not-found`)。**自動の探索に戻らない** (FR-006) |

`createWin32Descriptor(now, claude)` が `claude` (§2 の結果) を受けて 3 つのキーを埋める。

## §2 claude の探索 — `src/main/infra/runtime/win32-claude.ts` (新設)

```ts
export interface Win32ClaudeLocatorDeps {
  /** 実在するファイルか (`fs.stat` の `isFile()`。リンクはたどる)。失敗は false。 */
  readonly isFile: (path: HostPath) => Promise<boolean>
  /** 親の env の読み取り (`USERPROFILE` と `PATH` だけを読む)。 */
  readonly env: () => Readonly<Record<string, string | undefined>>
  /** 設定の上書き (§3)。無ければ null。 */
  readonly override: () => Promise<string | null>
}
export type Win32ClaudeLocation =
  | { readonly status: 'found'; readonly path: HostPath; readonly overridden: boolean }
  | { readonly status: 'not-found' | 'shim-only'; readonly overridden: false }
  | { readonly status: 'override-invalid'; readonly overridden: true }
export function createWin32ClaudeLocator(deps: Win32ClaudeLocatorDeps): () => Promise<Win32ClaudeLocation>
```

手順 (上から順。決まったら下を見ない):

1. **上書き**: `override()` が非 null なら、`classifyClaudeExecutable` が `exe` で `isFile` が true のとき `found` (overridden)。それ以外は `override-invalid`
2. **既知の場所**: `USERPROFILE` が `makeHostPath` を通るなら `hostPathOps.join(USERPROFILE, '.local', 'bin', 'claude.exe')`。`isFile` なら `found`
3. **PATH**: `PATH` を `;` で分け、前後の空白と `"` を外す。`makeHostPath` を通らない要素 (空・相対・UNC) は飛ばす。先頭の要素から順に
   `claude.exe` を見て、在れば `found`。`claude.cmd` / `claude.bat` / `claude.ps1` が在れば「shim を見た」を覚える
4. 見つからなければ、shim を見ていれば `shim-only`、でなければ `not-found`

- 要素の数の上限は 64 (それ以降は見ない)。`isFile` の呼び出しは最大 1 + 1 + 64 × 4 回で、`list()` の中で WSL の 3 つの呼び出しと並列に走る
- パスの組み立ては `hostPathOps.join` だけ (Principle I)。ログにパスを出さない (状態のキーだけ)
- 呼ぶのは `wsl-detector.ts` の `list()` の 1 箇所 (`DetectorDeps.locateWin32Claude`。省略時は `{ status: 'not-found' }` を返す fail-closed の既定)

## §3 claude の場所の指定 — `src/main/infra/settings/runtime-settings-store.ts` (新設)

ファイル: userData の `runtime-settings.json`

```json
{ "schemaVersion": 1, "win32ClaudePath": "C:\\Users\\u\\.local\\bin\\claude.exe" }
```

| 読み込み | 結果 |
|---|---|
| 未作成 (ENOENT) | 指定なし |
| 最上位がオブジェクトでない・JSON でない・版が欠ける / 1 未満 / 非数値 | `.bak` に退避して**読めない** (`parse-failed`) |
| 将来版 (`schemaVersion` > 1) | 退避して**読めない** (`newer-version`。書き込まない) |
| `win32ClaudePath` が文字列でも null でもない・長さ > `MAX_PATH_VALUE_LENGTH`・制御文字 | 退避して**読めない** (`parse-failed`) |
| 読めない (ENOENT 以外) | **読めない** (`read-failed`。退避しない) |

- **「読めない」は指定なしではない (FR-006)。** 利用者の指定を黙って捨てて自動の探索に倒さず、locator は `override-invalid` (claude を使えない理由: 設定を読めない) を返して起動を拒否する。自動の探索に戻るのは未作成 (ENOENT) だけ
- 保存は、現在のファイルが将来版 (`schemaVersion` > 1) なら書き込まず失敗する (`save-failed`)。破損したファイルは保存で置き換わる (復旧経路)

- 書き込みは一時ファイル + rename (`launch-usage-store.ts` と同じ)。中身は版と 1 つのパスだけで、資格情報を持たない (Principle V)
- 結果は理由のキーと errno のコードだけを返し、ログは結線 (composition-root) が理由のキーだけを出す
- 保存する値は §1.1 で `exe` のものだけ (contracts C-1 が保存の前に判定する)。ファイルの在る無しは保存の時点では見ない (検出が見る)

## §4 DTO — `src/domain/runtime/dto.ts`

`RuntimeDescriptorDTO` に 2 つを足す。

```ts
/** Win32Runtime の claude の状態。WslRuntime は null (WSL の claudePath の判定は X-6)。 */
readonly claudeStatus: Win32ClaudeStatus | null
/** 設定で場所を指定しているか。WslRuntime は false。 */
readonly claudeOverridden: boolean
```

パス (`claudePath`) は DTO に出さない (WSL と同じ。`dto-mapper.ts` で写さない)。

## §5 起動の値 — `src/domain/session/agent-session.ts`

```ts
/** WSL の起動の値。形は X-4 のまま。`kind` は省略可 (省略は 'wsl')。 */
export interface WslLaunchSpec {
  readonly kind?: 'wsl'
  readonly pathToClaudeCodeExecutable: string
  readonly command: string
  readonly prefixArgs: readonly string[]
  readonly env: Record<string, string>
}

/**
 * プロセス木の停止の、pid の前に置く引数の正本 (AD-058 Decision 3)。
 * main の組み立て (§5.1) と agents の検査 (§5.2) の両方がこれを使う (値を 2 箇所に書かない)。
 */
export const WIN32_TREE_STOP_ARGS = ['/T', '/F', '/PID'] as const

/**
 * プロセス木の停止のコマンドの末尾の名前の正本 (AD-058 Decision 1)。
 * main の組み立て (§5.1 の `hostPathOps.join` の最後の要素) と agents の検査 (§5.2 の basename の比較) の両方がこれを使う。
 */
export const WIN32_TREE_STOP_COMMAND_NAME = 'taskkill.exe'

/** Win32 の起動の値 (AD-058 Decision 1)。 */
export interface Win32LaunchSpec {
  readonly kind: 'win32'
  /** claude.exe の絶対パス (HostPath の文字列)。 */
  readonly pathToClaudeCodeExecutable: string
  /** 実行ファイル。`pathToClaudeCodeExecutable` と同じ値。 */
  readonly command: string
  /** 作業フォルダの HostPath の文字列。ホストの spawn の cwd に渡す。 */
  readonly cwd: string
  /** §6 の組み合わせ。 */
  readonly env: Record<string, string>
  /**
   * コンソール窓を出さない指示。claude.exe と停止のコマンドの両方の spawn に渡す。
   * Windows 固有の値を main が組み、agents は値を写すだけにする (FR-014。agents はプラットフォームを見ない)。
   */
  readonly windowsHide: true
  /** プロセス木の停止の指示 (§9)。 */
  readonly stop: {
    /** `%SystemRoot%\System32\taskkill.exe` の絶対パス。 */
    readonly command: string
    /** pid の前に置く固定の引数。値は `WIN32_TREE_STOP_ARGS` と完全に一致する。 */
    readonly argsBeforePid: readonly string[]
    /** 停止のコマンドの env (`SystemRoot` / `windir` だけ)。資格情報を含めない。 */
    readonly env: Record<string, string>
  }
}

export type RuntimeLaunchSpec = WslLaunchSpec | Win32LaunchSpec
```

`WIN32_TREE_STOP_ARGS` / `WIN32_TREE_STOP_COMMAND_NAME` を domain (`agent-session.ts`) に置くのは、main と agents の両方が import できる層がここだけだから
(agents は `src/main/` を import できない)。Windows の値の**組み立て**は §5.1 (infra/runtime) が行い、agents は
domain の定数と述語 (`WIN32_TREE_STOP_ARGS`・`WIN32_TREE_STOP_COMMAND_NAME`・§1.1 の `classifyClaudeExecutable`) で**検査**するだけで、
自分で値を作らず、Windows 固有の文字列 (`taskkill.exe`・`.exe`・`/T` など) を agents のファイルに綴らない (FR-014)。

### §5.1 組み立て — `src/main/infra/runtime/win32-launch.ts` (新設)

`buildWin32LaunchSpec({ cwd, claudePath, baseEnv, launchEnv }): Win32LaunchSpec`。満たさなければ throw (呼び出し側が `launch-failed`。値はメッセージに入れない)。

| 検査 | 規則 |
|---|---|
| `cwd` | `makeHostPath` が通る |
| `claudePath` | `classifyClaudeExecutable` が `exe` |
| `stop.command` | `baseEnv.SystemRoot` (無ければ `windir`) が `makeHostPath` を通り、`hostPathOps.join(root, 'System32', WIN32_TREE_STOP_COMMAND_NAME)` (§5)。解決できなければ throw (裸名にしない。CWE-426) |
| `stop.argsBeforePid` | `[...WIN32_TREE_STOP_ARGS]` (§5。リテラルを書かない) |
| `stop.env` | `baseEnv` から `SystemRoot` / `windir` だけ |
| `env` | `launchEnv` (§6.2 の結果) |
| `windowsHide` | `true` |

組み立てた値は §5.2 の decoder を必ず通る (build → decode の往復を BE-011 のテストで確かめる)。

このファイルにプロセス起動 API の名前を書かない (コメントを含む。research R-14)。

### §5.2 agents の検査 — `decodeLaunchSpec` (`sdk-agent-session.ts:329-347`)

`kind` で分ける。`kind` が無い・`'wsl'` なら今の規則のまま (返す値にも `kind` を付けない)。`'win32'` なら下の規則。それ以外は null。

| キー | Win32 の規則 |
|---|---|
| `pathToClaudeCodeExecutable` | 文字列・`classifyClaudeExecutable(value) === 'exe'` (§1.1。`makeHostPath` が通ることも含む。`.exe` の判定を agents に別に持たない) |
| `command` | `pathToClaudeCodeExecutable` と同じ文字列 |
| `cwd` | 文字列・`makeHostPath` が通る |
| `prefixArgs` | 持たない (キーがあれば null) |
| `env` | 文字列の値だけを写す。`WSLENV` / `WSL_UTF8` のキー (大文字小文字を区別しない) があれば null |
| `windowsHide` | `true` (真偽値の `true` だけ。無い・`false`・文字列は null) |
| `stop` | オブジェクト (無い・null・配列は null) |
| `stop.command` | 文字列・`makeHostPath` が通る・末尾の名前 (`hostPathOps.basename`) が `WIN32_TREE_STOP_COMMAND_NAME` (§5) と一致する (大文字小文字を区別しない) |
| `stop.argsBeforePid` | 配列で、長さと各要素が `WIN32_TREE_STOP_ARGS` と完全に一致する (順番も綴りも大文字小文字も。`/T /F /IM`・`/T /F /PID /PID`・`/X`・`/PID` の欠落・`/t /f /pid` は null) |
| `stop.env` | 文字列の値だけを写す |

### §5.3 spawn の計画 — `composeClaudeSpawn` (`session-core.ts:508-517`)

| spec | `command` | `args` | `env` | `cwd` | `windowsHide` |
|---|---|---|---|---|---|
| WSL (今のまま) | `spec.command` | `[...prefixArgs, path, ...options.args]` | `{ ...spec.env }` | 付けない | 付けない |
| Win32 | `spec.pathToClaudeCodeExecutable` | `[...options.args]` | `{ ...spec.env }` | `spec.cwd` | `spec.windowsHide` |

`ClaudeSpawnPlan` に `cwd?` / `windowsHide?` を足し、spawn の呼び出し (`sdk-agent-session.ts:535`) は、計画にあるときだけ渡す。
SDK の `options.command` / `options.cwd` / `options.env` は使わない (research R-01)。

## §6 Win32 の起動の env (FR-008 / FR-009)

### §6.1 許可リスト — `WIN32_LAUNCH_ENV_ALLOWLIST` (`win32-launch.ts`。**この表が正本**。pin テストで固定する)

| 区分 | キー |
|---|---|
| 実行と探索 | `PATH`・`PATHEXT`・`ComSpec` |
| システム | `SystemRoot`・`SystemDrive`・`windir`・`OS`・`NUMBER_OF_PROCESSORS`・`PROCESSOR_ARCHITECTURE` |
| 一時ディレクトリ | `TEMP`・`TMP` |
| 利用者とホーム | `USERPROFILE`・`USERNAME`・`USERDOMAIN`・`HOMEDRIVE`・`HOMEPATH`・`APPDATA`・`LOCALAPPDATA` |
| プログラムの場所 | `ProgramData`・`ProgramFiles`・`ProgramFiles(x86)`・`ProgramW6432`・`CommonProgramFiles`・`CommonProgramFiles(x86)`・`CommonProgramW6432` |
| Claude Code | `CLAUDE_CODE_GIT_BASH_PATH` |
| ネットワーク | `HTTP_PROXY`・`HTTPS_PROXY`・`NO_PROXY`・`NODE_EXTRA_CA_CERTS` |

計 30 キー。`WSLENV` / `WSL_UTF8` を含まない (U-4)。

**Provider が上書きしてよいキー** — `WIN32_PROVIDER_OVERRIDABLE_KEYS` (`win32-launch.ts`。pin テストで固定): proxy の 3 キー
(`HTTP_PROXY`・`HTTPS_PROXY`・`NO_PROXY`)。今の登録時の検証は、これらを Provider の extraEnv に入れることを
意図して通している (`launch-spec.test.ts:227` の `HTTPS_PROXY`。AD-041 (e))。値は URL とホスト名の並びで、
WSL とホストのどちらでも同じ意味になるので、Win32 でも Provider の値をホストの値の上に重ねる。

**`NODE_EXTRA_CA_CERTS` は上書きしてよいキーに入れない** (Win32 の transport のキー)。値はファイルのパスで、登録時の検証は
Windows のパスの形の値を拒否する (`forward-env.ts:185-187` の `isWindowsPathValue`・`:213`) ので、保存済みの extraEnv の値は必ず WSL の
POSIX パスである。Win32 の `claude.exe` はそれを読めず、重ねるとホストの正しい値 (社内 CA) も消える。したがって extraEnv に
`NODE_EXTRA_CA_CERTS` を持つ Provider は Win32 で到達不可にし (§6.4。今の到達不可の理由と文言で出す)、Win32 の起動ではホストの値だけが届く。
残りの 27 キーが Win32 の transport のキーである (`WIN32_TRANSPORT_KEYS` = 許可リスト − 上書きしてよいキー)。

### §6.2 組み立て

`buildWin32LaunchEnv(source)`: 許可リストのキーだけを `source` (親の env) から拾う。キーの照合は大文字小文字を区別しない
(`source` のキーを大文字にして引き、出力は表のキーの綴り)。`LAUNCH_ENV_DENY_PATTERN` に当たるキーは入れない (二重の網)。

`composeWin32LaunchEnv(baseEnv, derived)`: env = `baseEnv` に、`derived.forwardKeys` の各キーの値 (`derived.env[key]`) だけを重ねる
(上書きしてよいキー (§6.1) は Provider の値がホストの値に勝つ)。
**`derived.env` の残り (WSL の curated base) は使わない** — 導出が足したキーは `forwardKeys` に全部入っている (`derive-env.ts:59-62`)。
各キーで次を満たさなければ throw (呼び出し側が `invalid-config`):

| 規則 | 理由 |
|---|---|
| `isValidForwardKeyName(key)` と `typeof derived.env[key] === 'string'` | WSL と同じ |
| `isWin32ForbiddenKey(key)` が true で、`isDerivationForwardKey(key)` が false | Win32 の transport のキー (§6.1) と固定の禁止キーを Provider から上書きさせない |
| 値に制御文字が無い (`hasControlCharacter`) | FR-009 |

`isWin32ForbiddenKey = makeForbiddenForwardKey(WIN32_TRANSPORT_KEYS)` (domain の述語に infra のキーを注入する。AD-041 (e) と同じ構え)。
結果に `WSLENV` / `WSL_UTF8` が無いことを SC-003 のテストで確かめる。

### §6.3 登録時の検証 (変えない)

登録時の extraEnv の検証は今の WSL の述語のまま (transport の和集合を広げない)。広げると既存の `providers.json` の読み込みで
今まで通っていた extraEnv が不正になり、Provider が消える。Win32 の transport のキーと実際に衝突するのは、登録を通る名前
(`^[A-Z_][A-Z0-9_]*$`) で、固定の禁止キー・WSL の transport のキー・prefix の禁止に当たらないもの — `USERNAME`・`USERDOMAIN`・`OS`・
`NUMBER_OF_PROCESSORS`・`PROCESSOR_ARCHITECTURE`・`PATHEXT`・`USERPROFILE`・`HOMEDRIVE`・`HOMEPATH`・`APPDATA`・`LOCALAPPDATA`・
`NODE_EXTRA_CA_CERTS` (§6.1) など (値が Windows のパスの形なら登録で既に拒否される)。この衝突は §6.4 の判定で到達不可にし、§6.2 が起動の時点でも拒否する
(`invalid-config`。多重の防御。黙って捨てない)。和集合の見直し (AD-041 (e) / (h) の「I-1 で transport が増えたら」) は AD-058 Decision 5 に書く。

### §6.4 到達可能性の判定 (FR-009。判定と起動を同じ述語で決める)

`assessReachability(profile, runtime, isTransportForbiddenKey)` に、ランタイムの種類ごとの transport の禁止キーの述語を注入する
(`isTransportForbiddenKey: (kind: RuntimeDescriptor['kind'], key: string) => boolean`。domain に infra のキーを複製しない)。

- 今の判定 (helper・config ディレクトリ。§8) の**前に**、`profile.extraEnv` の各キーで
  `isTransportForbiddenKey(runtime.kind, key) && !isDerivationForwardKey(key)` なら `unreachable` を返す
- 結線 (composition-root → `provider-service.ts` の deps): `wsl` → 今の `isForbiddenForwardKey` (登録時に同じ述語で拒否済みなので、WSL の判定は変わらない)、
  `win32` → `isWin32ForbiddenKey` (§6.2 と同じ関数)
- `provider-service.ts` の `assessReachability` / `splitByReachability` の 3 つの呼び出し (`:265`・`:286`・`:350`) がこの deps を渡す。
  起動ダイアログの「選べない Provider」に今の到達不可の理由で出る (新しい理由のキーは足さない)

## §7 起動の準備 — `src/main/app/launch-preparation.ts`

`runtime.kind === 'win32'` の段を足す (WSL の段は今のまま)。

| 段 | Win32 の規則 |
|---|---|
| 1. 依存解決の再評価 | `resolveLaunchAxes` を `{ id: 'host', distroName: null, running: true }` の facts で呼ぶ。blocker → `invalid-config`。reset の扱いは WSL と同じ (停止中の分岐は無い) |
| 2. 作業フォルダとランタイム | `resolveFolderRuntime({ folder, runtime })` が `reachable` で `runtimePath.namespace === 'host'` でなければ `invalid-config` (所在 WSL は U-3 でここに落ちる) |
| 3. claude | `claudeStatus !== 'found'` か `claudePath === null` なら `claude-not-found`。**起動の時点で `win32ClaudeIsFile(claudePath)` が false なら `claude-not-found`** (Edge Cases の「検出の後に変わった」) |
| 4. env 導出 | WSL と同じ (`deriveEnv(providerId, 'host')`。null / throw → `provider-unavailable`) |
| 5. env 合成 | `composeWin32LaunchEnv(win32BaseEnv(), derived)`。throw → `invalid-config` |
| 6. 起動の値 | `buildWin32LaunchSpec({ cwd: runtimePath.value, claudePath, baseEnv: win32BaseEnv(), launchEnv })`。throw → `launch-failed` |

`VerifiedRunning` は使わない (`Win32Runtime` は常に `running`。実行中確認は WSL の概念)。

- `LaunchPreparationDeps` に `win32BaseEnv` / `composeWin32LaunchEnv` / `buildWin32LaunchSpec` / `win32ClaudeIsFile` を足す
- `LaunchInput` を種類で分ける: `WslLaunchInput` (今の形) | `Win32LaunchInput { folder; runtime: Win32RuntimeDescriptor; options }`
- `launch-resolution.ts` の `RuntimeFact.distroName` を `string | null` にし、`distro-mismatch` は `folder.distroName !== null && runtime.distroName !== null && 不一致` のときだけにする (WSL の facts は常に文字列なので WSL の判定は変わらない)

## §8 Provider の config ディレクトリ (FR-009 / SC-005)

`resolveConfigDirPath(configDir, runtime)` の表 (`helper-path.ts`)。`assessReachability` (到達可能性) と `provider-service.ts` の
`deriveEnv` (起動の導出) の両方がこれだけを呼ぶ。`assessReachability` の win32 の特例 (`reachability.ts:46-53` の win32 の 2 行) は消す。
opaque-unc の fail-closed (`namespaceDistroName(...) === null` → `unreachable`) は残す。

| ランタイム | configDir | 状態 | 結果 |
|---|---|---|---|
| win32 | ホスト (`C:\...`) | — | `ok` (`HostPath` のまま) |
| win32 | UNC (`\\wsl.localhost\<D>\...`) | — | `unreachable` |
| wsl | ホスト | stopped | `blocked` |
| wsl | ホスト | mapping 未取得 | `blocked` |
| wsl | ホスト | mapping の外 | `unreachable` |
| wsl | ホスト | mapping の内 | `ok` (RuntimePath) |
| wsl | UNC (同じ distro) | running | `ok` (RuntimePath) |
| wsl | UNC (別の distro) | running | `unreachable` |
| wsl | UNC | stopped | `blocked` |

- 戻りの型を `{ ok: true; path: HostPath | RuntimePath }` に広げ、`ResolvedCredential.configDirRuntimePath` の型も同じに広げる (名前は変えない。research R-08)
- SC-005 は、この表の全行で `assessReachability` が `reachable` ⇔ `deriveEnv` が非 null (config-dir / in-app-login の Provider) であることを 1 つの表で回す
- SC-005 の表に extraEnv の行を足す (§6.4)。判定 (`assessReachability`) が `reachable` ⇔ 起動 (`deriveEnv` が非 null で、Win32 は `composeWin32LaunchEnv` が throw しない) を同じ行で比べる:

| ランタイム | extraEnv | 判定 | 起動 |
|---|---|---|---|
| win32 | `HTTPS_PROXY` / `NO_PROXY` (上書きしてよいキー) | `reachable` | 通り、Provider の値がホストの値に勝つ |
| win32 | `USERNAME` / `NUMBER_OF_PROCESSORS` / `NODE_EXTRA_CA_CERTS` (Win32 の transport のキー) | `unreachable` | `invalid-config` |
| win32 | 許可リストの外のキー (`FOO_BAR`) | `reachable` | 通る |
| wsl | `HTTPS_PROXY` / `USERNAME` | `reachable` | 通る (今のまま) |
- helper の方式 (`classifyHelperPath`) は win32 で `unreachable` のまま (Out of Scope)

## §9 プロセス木の停止 (agents。FR-010〜FR-012)

`sdk-agent-session.ts` の `run()` の closure に置く。`spec.kind === 'win32'` (= `spec.stop` がある) のときだけ使う。WSL は今の `killSpawnedChild` のまま。

### §9.1 停止の手続き `stopTree(): Promise<void>`

1. 子がいない・`childExited` なら何もしない
2. 既に起こしていれば、同じ待ちを返す (2 回目は無害。Edge Cases)
3. `pid` が無ければ `child.kill()` に落とす
4. `spawn(stop.command, [...stop.argsBeforePid, String(pid)], { env: { ...stop.env }, shell: false, windowsHide: spec.windowsHide, stdio: 'ignore' })`
   (Windows 固有の値はどれも spec から写す。agents にリテラルを持たない。FR-014)
5. 停止のコマンドが起動に失敗した (`error`)・非 0 で終わって子がまだ生きている → `child.kill()` に落とし、`[tree-stop] fallback` を記録する
6. 子の `exit` を `TREE_STOP_TIMEOUT_MS` (5,000。新しい定数) まで待つ。過ぎたら `[tree-stop] timeout` を記録して先へ進む (閉じる操作を止めない。FR-012)

記録 (stderr の 1 行) に出すのは固定の語と終了コードの数だけ。パス・コマンドの文字列・pid・env の値を出さない (FR-012 / Principle V)。

### §9.2 終わり方ごとの順番

| 終わり方 | Win32 の順番 | 今 (WSL) |
|---|---|---|
| 強制終了 (`kill`) と「閉じる」 (renderer の `close()` は終わっていなければ `killSession`) | 状態を `kill` に → 承認・問いを捨てる → **`stopTree()` を待つ** → abort → キューの close | kill → abort → close (同期) |
| 起動前 (`spawnedChild === null`) の kill | 今と同じ (`finish()` に入る) | 同じ |
| 最初のプロンプトの前の `end` | 強制終了と同じ順番 | 同じ (kill の扱い) |
| 穏当な終了 (`end`) | キューを閉じて claude の自分からの終了を 3,000 ms 待つ (今のまま)。過ぎたら `forceEnd` | 同じ |
| `forceEnd` | `end-forced` を 1 回 → **`stopTree()` を待つ** → abort | kill → abort |
| `finish()` (終わり方を問わない出口・セッションスレッドの例外 `fatalSink`) | signals / 承認 / 問いを捨てる → **子が生きていて穏当な終了の途中でなければ `stopTree()` を待ってから** キューを閉じる → `ended` | キューを先に閉じる |
| アプリの終了・renderer の再読み込み | main の `killAll` が全セッションに `kill` を送る → 上の強制終了の順番 | 同じ |
| supervisor が親を失った | 調停役スレッドが全セッションに `kill` を送り、`shutdownMs` の後に Worker を止める → 上の強制終了の順番 | 同じ |

**穏当な終了で claude が自分から終わったとき**、その子孫が止まるかは Claude Code 自身の終わり方に依る (FR-010 の対象外。quickstart V-5 で記録する)。

### §9.3 期限 (research R-11)

| 定数 | 今 | 本 feature |
|---|---:|---:|
| `TREE_STOP_TIMEOUT_MS` (sdk-agent-session.ts。新設) | — | 5,000 |
| `CHILD_EXIT_TIMEOUT_MS` (sdk-agent-session.ts:183。WSL と穏当な終了の待ち) | 3,000 | 3,000 (変えない) |
| `shutdownTimeoutMs` の既定 (supervisor-core.ts:83) | 3,000 | 6,000 |
| `DEFAULT_DISPOSE_WAIT_MS` (session-launch-service.ts:111) | 3,000 | 6,000 |
| `QUIT_TIMEOUT_MS` (src/main/index.ts:24) | 5,000 | 7,000 |

### §9.4 保証する終わり方 / しない終わり方 (FR-011。AD-058 Decision 3 の表の元)

| 終わり方 | `claude.exe` | 子孫 | 仕組み |
|---|---|---|---|
| 強制終了・閉じる・アプリの終了・renderer の再読み込み・セッションスレッドの JS の例外 | 止まる | 止まる | §9.1 (claude が生きている間に木ごと) |
| 期限 (5 秒) を過ぎた停止 | 止まらないことがある | 止まらないことがある | 記録して進む。supervisor の終了時は libuv の job が `claude.exe` を止める |
| Worker の異常終了 (`terminate()`・メモリ上限超過) | 止まらないことがある (stdin の EOF で自分から終わりうる) | **保証しない** | X-6 の「ツール実行中に Worker だけが異常終了したときの孤児の実機観測」(roadmap の X-6 の行) に Win32 を足す |
| supervisor の異常終了・外からの kill・main の異常終了 | 止まる (libuv の job。V-4 で確かめる) | **保証しない** | 同上 |

## §10 renderer

### §10.1 起動ダイアログ — `LaunchDialog.tsx`

- ランタイムの選択肢 (`:210` の `wslRuntimes`) を「起動先のランタイム」に替える: 先頭に `Win32Runtime` (表示名「Windows (ホスト)」。`runtime-list/labels.ts:84` の表示名を使う)、続けて今の WSL の並び
- `claudeStatus !== 'found'` の `Win32Runtime` は `<option disabled>` で出し、表示名の後ろに状態の短いラベル (§10.3) を付ける (FR-001)
- **`claudeStatus !== 'found'` の `Win32Runtime` があるときは、プリセットの有無・選んだランタイムに依らず、ランタイムの選択欄の下に
  §10.3 の理由と直し方を常に出す** (FR-007。`<option disabled>` は選べないので、選んで理由を読む経路が無いため)。
  選択欄と `aria-describedby` で結ぶ。理由と直し方の後ろに、直す場所の案内 (§10.3 の `where-to-fix`) を添える
- facts の `runtimes` (`:236-240`) に `Win32Runtime` を入れるのは `claudeStatus === 'found'` のときだけ (`{ id: 'host', distroName: null, running: true }`)。
  プリセットが使えない `Win32Runtime` を指していれば `runtime-missing` で止まる (理由と直し方は上の項のとおり選択欄の下に出ている)
- 権限モードの選択肢は今のまま `SAFE_PERMISSION_MODES` の 3 つ (`default` / `plan` / `dontAsk`) だけ。`Win32Runtime` を選んでも Auto / `bypassPermissions` は
  選択肢に現れない (Principle III。`Win32Runtime` は `autoModeSafe: false`)。軸の表示名「ランタイム (WSL)」(`session/labels.ts:389`) は
  Win32 が並ぶので「ランタイム」に直す (e2e の selector も同じ変更で直す)
- Provider の既定のラベル (`:528`) を選んだランタイムで替える: WSL は今の「既定 (ディストロ内の claude の設定)」、Win32 は「既定 (Windows の claude の設定)」
- 所在 WSL の作業フォルダ × `Win32Runtime` は、今の `folderRuntimeUnreachable` の表示 (`:695`) で止まる (US-1 AC6。変えない)

### §10.2 ランタイム一覧 — `RuntimeListScreen.tsx` の `RuntimeCard`

`kind === 'win32'` のカードに claude の状態の行を足す: 状態のラベル・理由と直し方 (§10.3)・「claude.exe を選ぶ」ボタン (contracts C-1)・
`claudeOverridden` のときだけ「指定を解除」ボタン (C-2)。ボタンの結果が `rejected` / `save-failed` なら、その理由をカードの中に出す。

### §10.3 文言 (`runtime-list/labels.ts` に足す。訳出は ui。Principle XV)

| キー | 短いラベル | 理由と直し方 |
|---|---|---|
| `found` | claude.exe あり | — |
| `not-found` | claude.exe なし | Claude Code の native 版 (claude.exe) が見つかりません。native 版を入れるか、claude.exe の場所を指定してください。 |
| `shim-only` | npm 版のみ | Claude Code の native 版 (claude.exe) が見つかりません。npm 版 (claude.cmd) からは起動できません。native 版を入れるか、設定で claude.exe の場所を指定してください。(spec Clarifications の文言) |
| `override-invalid` | 指定が無効 | 指定した場所に claude.exe がありません。claude.exe を選び直すか、指定を解除してください。 |
| 選択の拒否 `not-exe` | — | claude.exe (拡張子 .exe のファイル) を選んでください。 |
| 保存の失敗 `save-failed` | — | 指定を保存できませんでした。もう一度お試しください。 |
| 直す場所の案内 `where-to-fix` (起動ダイアログだけ) | — | ランタイム一覧の「Windows (ホスト)」のカードで、claude.exe の場所の指定と再検出ができます。 |

`session/labels.ts:31` の `claude-not-found` を「claude が見つかりませんでした。ランタイム一覧で claude の状態を確かめ、導入するか場所を指定してから再検出してください。」に直す
(ランタイムに依らない形。短いラベル `:87`「claude なし」は変えない)。

## §11 固定テストと定数の変化

| 対象 | 今 | 本 feature |
|---|---|---|
| `WIN32_LAUNCH_ENV_ALLOWLIST` | — | 30 キー (§6.1 の表の集合で固定) |
| `WIN32_PROVIDER_OVERRIDABLE_KEYS` | — | 3 キー (§6.1。許可リストの部分集合であること・`NODE_EXTRA_CA_CERTS` を含まないことも固定) |
| `IPC_CHANNELS` (`capability.test.ts:19` の並び) | — | `pickWin32ClaudePath` / `clearWin32ClaudePath` を足す |
| `RuntimeDescriptorDTO` のキー | 9 | 11 (`claudeStatus` / `claudeOverridden`) |
| `Win32ClaudeStatus` | — | 4 値 |
| `LaunchFailureReason` | 18 | 18 (変えない) |
| `WIN32_TREE_STOP_ARGS` (`agent-session.ts`) | — | `['/T', '/F', '/PID']` (pin。`buildWin32LaunchSpec` の `stop.argsBeforePid` と decoder がこれを使う) |
| `WIN32_TREE_STOP_COMMAND_NAME` (`agent-session.ts`) | — | `'taskkill.exe'` (pin。`buildWin32LaunchSpec` の `stop.command` の組み立てと decoder の basename の比較がこれを使う) |
