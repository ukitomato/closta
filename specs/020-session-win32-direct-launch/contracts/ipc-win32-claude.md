# Contract: Win32 の claude の場所の指定と起動の値 (X-8)

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

規則の正本は data-model.md。本ファイルは境界 (renderer ⇄ main・main → agents) の形だけを書く。

## C-1 `closta:pickWin32ClaudePath` (renderer → main。invoke)

- 引数: なし (renderer はパスを渡さない。選択も検査も main が行う)
- main の手順:
  1. ファイル選択のダイアログを出す (`properties: ['openFile']`、filter `{ name: 'claude.exe', extensions: ['exe'] }`)
  2. 取り消し → `{ status: 'cancelled' }`
  3. `classifyClaudeExecutable(path)` が `exe` でなければ `{ status: 'rejected', reason: 'not-exe' }` (保存しない)
  4. 保存 (data-model §3)。失敗 → `{ status: 'save-failed' }`
  5. `runtimes.refresh()` で再検出し、`{ status: 'updated', runtimes }` を返す
- 戻り値:

```ts
export type Win32ClaudePathResult =
  | { readonly status: 'updated'; readonly runtimes: readonly RuntimeDescriptorDTO[] }
  | { readonly status: 'cancelled' }
  | { readonly status: 'rejected'; readonly reason: 'not-exe' }
  | { readonly status: 'save-failed' }
```

- 戻り値・ログにパスを含めない (DTO はパスを持たない。data-model §4)
- ファイルが在るかは保存の時点では判定しない (再検出が `override-invalid` を出す)

## C-2 `closta:clearWin32ClaudePath` (renderer → main。invoke)

- 引数: なし
- 指定を `null` で保存し、再検出して `{ status: 'updated', runtimes }`。保存の失敗は `{ status: 'save-failed' }`
- 戻り値の型は C-1 と同じ (`cancelled` / `rejected` は返さない)

両 channel は `capability.ts` の `IPC_CHANNELS` に足し、`capability.test.ts` の並びの pin・preload・`ipc.ts` の結線・
`e2e-capability.ts` (AD-038)・`test-support/capability.ts` を同じ変更で直す。

## C-3 `RuntimeDescriptorDTO` に足すキー

| キー | 型 | WslRuntime | Win32Runtime |
|---|---|---|---|
| `claudeStatus` | `'found' \| 'not-found' \| 'shim-only' \| 'override-invalid' \| null` | `null` | 検出の結果 |
| `claudeOverridden` | `boolean` | `false` | 設定で指定しているか |

`claudePath` は DTO に出さない。

## C-4 main → agents の `Win32LaunchSpec` (`SessionCommand` の `launch` の `spec`)

```jsonc
{
  "kind": "win32",
  "pathToClaudeCodeExecutable": "C:\\Users\\u\\.local\\bin\\claude.exe",
  "command": "C:\\Users\\u\\.local\\bin\\claude.exe",
  "cwd": "C:\\dev\\closta",
  "env": { "PATH": "…", "SystemRoot": "C:\\WINDOWS", "…": "…" },
  "windowsHide": true,
  "stop": {
    "command": "C:\\WINDOWS\\System32\\taskkill.exe",
    "argsBeforePid": ["/T", "/F", "/PID"],
    "env": { "SystemRoot": "C:\\WINDOWS", "windir": "C:\\WINDOWS" }
  }
}
```

- `stop.argsBeforePid` は domain の定数 `WIN32_TREE_STOP_ARGS` と完全に一致する値だけが通る。`stop.command` は末尾の名前が domain の定数 `WIN32_TREE_STOP_COMMAND_NAME` (`'taskkill.exe'`) と一致する (大文字小文字を区別しない)、`pathToClaudeCodeExecutable` は domain の `classifyClaudeExecutable` が `exe`、`windowsHide` は `true` だけが通る
- agents は `decodeLaunchSpec` (data-model §5.2) で検査し、通らなければ `launch-failed` で終える (今の WSL と同じ扱い)。main が組んだ値 (data-model §5.1) は必ず通る
- `kind` を持たない値は WSL の値として今の規則で検査する (互換)
- 値・env をログ・`SessionEvent` に出さない (Principle V)
