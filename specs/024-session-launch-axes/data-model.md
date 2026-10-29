# Data Model: 起動設定の残りの軸 (024)

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Contracts**: [contracts/launch-config-v2.md](./contracts/launch-config-v2.md)

規則の形の正本は本ファイルである。plan.md と tasks.md は節の番号で参照する。

## §0 変えないもの

- 安全 3 値の権限モード・`canUseTool` の経路・`PermissionGate`・tool の集合・env (AD-036 / AD-040)
- `settings` の 2 キーの射影 (AD-040)。追加ディレクトリを `settings.permissions.additionalDirectories` に載せない
- 結果の分類 (`classifyResult` / `classifyResultFailure`) と失敗の理由の集合 (`LAUNCH_FAILURE_REASONS`。`max-turns` / `max-budget` は既にある。O-4)
- 引き継ぐ 3 軸 (作業フォルダ・ランタイム・Provider) と `resume-service` の照合 (021)
- 作業フォルダ ↔ ランタイムの blocker (`LaunchBlocker`) と軸の reset (`AxisReset`) の型
- IPC の channel と capability の関数の形 (`launchSession(config, origin)` / `resumeSession(request)` / `savePreset(name, config)` / `resolveFolderRuntime(...)`)。引数の **値の形** だけが広がる
- `launch-usage.json` の形 (U-9 / FR-014)
- 023 の改名 (`renameSession`)・`normalizeSessionName`・`SESSION_NAME_MAX_LENGTH`
- WSL_FREE_DIRECTORIES・services-not-to-io・PROCESS_SPAWN_MODULES の実名の列 (新しいモジュールは renderer の 2 ファイルだけ)

## §1 `SessionLaunchConfig` (domain/session/launch-config.ts)

```ts
export interface SessionLaunchConfig {
  // 前 6 軸 (変わらない)
  readonly folderId: string;
  readonly runtimeId: string;
  readonly providerId: string | null;
  readonly modelId: string | null;
  readonly effort: EffortLevel | null;
  readonly permissionMode: SafePermissionMode;
  // 024
  readonly additionalDirectoryIds: readonly string[];
  readonly maxTurns: number | null;
  readonly maxBudgetUsd: number | null;
  readonly sessionName: string | null;
}

/** プリセットが持つ形。名前を含まない (FR-010) */
export type PresetLaunchConfig = Omit<SessionLaunchConfig, 'sessionName'>;
```

### §1.1 定数

| 名前 | 値 | 用途 |
|---|---|---|
| `LAUNCH_CONFIG_KEYS` | 10 キー (上の順) | `isValidLaunchConfig` の allowlist |
| `PRESET_CONFIG_KEYS` | `sessionName` を除く 9 キー | `isValidPresetConfig` の allowlist |
| `PRESET_CONFIG_KEYS_V1` | 前 6 軸の 6 キー | 版 1 のレコードの検証 (§6) |
| `MAX_ADDITIONAL_DIRECTORIES` | `10` | U-2 |
| `MAX_TURNS_LIMIT` | `1000` (下限 1) | U-4 |
| `MAX_BUDGET_USD_LIMIT` | `1000` (下限 `MIN_BUDGET_USD = 0.01`) | U-4 |
| `DEFAULT_EXTRA_AXES` | `{ additionalDirectoryIds: [], maxTurns: null, maxBudgetUsd: null }` | 版 1 の読み替え・テストの既定 |

### §1.2 述語

| 述語 | 真になる条件 |
|---|---|
| `isValidMaxTurns(v)` | `v === null` または (`typeof v === 'number'` かつ `Number.isInteger(v)` かつ `1 <= v <= 1000`) |
| `isValidMaxBudgetUsd(v)` | `v === null` または (`typeof v === 'number'` かつ `Number.isFinite(v)` かつ `0.01 <= v <= 1000` かつ `Number(v.toFixed(2)) === v`) |
| `isValidLaunchSessionName(v)` | `v === null` または (`typeof v === 'string'` かつ `normalizeSessionName(v) === v`) |
| `isValidAdditionalDirectoryIds(v, folderId)` | 配列 (`Array.isArray`) かつ長さ 0〜10 かつ全要素が `isIdString` かつ重複なし かつ `folderId` を含まない |
| `isValidPresetConfig(v)` | object・キーが `PRESET_CONFIG_KEYS` と一致・前 6 軸の今の規則・上の 3 述語 (追加ディレクトリは `v.folderId` に対して) |
| `isValidLaunchConfig(v)` | キーが `LAUNCH_CONFIG_KEYS` と一致・`isValidPresetConfig` の 9 キーの規則・`isValidLaunchSessionName(v.sessionName)` |

- `normalizeSessionName` は `live-settings.ts` から import する (`live-settings.ts` は run-state だけを import するので循環しない)
- 未知のキー・キーの欠け・`undefined` の値は今の規則どおり形の外
- `toPresetConfig(config: SessionLaunchConfig): PresetLaunchConfig` は `sessionName` を除いた新しい object を返す (renderer の保存の前と、テスト)

## §2 依存解決 (domain/session/launch-resolution.ts)

### §2.1 `LaunchDraft` と facts

```ts
export interface LaunchDraft {
  // 前 6 軸 (今のまま。folderId / runtimeId は nullable)
  ...
  readonly additionalDirectoryIds: readonly string[];
  readonly maxTurns: number | null;
  readonly maxBudgetUsd: number | null;
}

export interface LaunchFacts {
  ...今のまま
  /** 解決結果 DTO が unreachable / probe-failed だった folder id。renderer だけが渡す (§2.3)。省略は空 */
  readonly unreachableFolderIds?: readonly string[];
}
```

- 名前は下書きに入れない (依存解決の対象ではない。ダイアログの state に別に持つ)。`toLaunchDraft(config)` は `sessionName` を除いた値を返す

### §2.2 `DirectoryReset` と解決結果

```ts
export type DirectoryResetReason = 'unregistered' | 'unreachable' | 'same-as-folder';

export interface DirectoryReset {
  readonly folderId: string;
  readonly reason: DirectoryResetReason;
}

export interface LaunchResolution {
  ...今のまま (draft は外した後の追加ディレクトリを持つ)
  readonly directoryResets: readonly DirectoryReset[];
}
```

### §2.3 項目ごとの判定 (順に評価し、最初に当たった理由で外す)

| 順 | 条件 | 理由 |
|---|---|---|
| 1 | `facts.folders` に id が無い | `unregistered` |
| 2 | `draft.folderId !== null` かつ id が `draft.folderId` と同じ | `same-as-folder` |
| 3 | 項目のフォルダの `distroName !== null` かつ選んだランタイムが facts にあり、その `distroName !== 項目の distroName` (Win32 は `null` なので当たる) | `unreachable` |
| 4 | `facts.unreachableFolderIds` に id がある | `unreachable` |
| — | どれにも当たらない | 残す (順序を保つ) |

- 重複した id は後ろの方を黙って捨てる (下書きの組み立ての誤り。ダイアログは重複を作らない。main の形の検証は重複を拒否する)
- ランタイムが未選択・facts に無い (blocker が出る) ときは 3 を評価しない
- 下書きの `additionalDirectoryIds` は変えず、`resolution.draft` だけが外した後の値を持つ (今の model / effort の reset と同じ)

### §2.4 `toLaunchConfig`

```ts
export function toLaunchConfig(resolution: LaunchResolution, sessionName: string | null): SessionLaunchConfig | null;
```

- `ready` でなければ `null` (今のまま)。`sessionName` は呼び出し側が検証済みの値 (`null` か `normalizeSessionName` を通った値) を渡す
- 上限は下書きの値をそのまま写す (依存解決は上限を見ない)

## §3 main の検証 (main/app/validate.ts)

| 関数 | 変更 |
|---|---|
| `checkLaunchConfig` | `isValidLaunchConfig` (§1.2) をそのまま使う。追加ディレクトリの id が登録済みかは起動ゲート (§4) が見る |
| `checkResumeRequest` | `config` が `checkLaunchConfig` を通り、かつ `config.sessionName === null`。外れれば `invalid-config` (FR-012) |
| `checkPreset(name, config)` | `isValidPresetConfig` を使う (`sessionName` を持つ config は拒否。FR-010 / FR-011) |

## §4 起動ゲート (main/app/launch-preparation.ts)

### §4.1 再評価

- `resolveLaunchAxes` に main が持つ facts (folders / runtimes / providers) を渡す。`unreachableFolderIds` は渡さない
- `directoryResets.length > 0` → `invalid-config` (理由のキーだけをログに出す)。外す項目が 1 つでもあれば起動全体を拒否し、main は黙って外して続けない (spec FR-003 / AD-064 Decision 2)。全件が通ったときだけ §4.2 の変換に進む

### §4.2 変換 (WSL / Win32 の両方から呼ぶ 1 つの関数)

```ts
function resolveAdditionalDirectories(
  ids: readonly string[],
  runtime: RuntimeDTO,      // 選択ランタイム
  expectedNamespace: string // WSL: runtime.id / Win32: 'host'
): readonly string[] | null; // null = 変換できない → invalid-config
```

| 項目ごとの条件 | 結果 |
|---|---|
| フォルダが見つからない | `null` |
| `resolveFolderRuntime({ folder, runtime })` が `reachability !== 'reachable'` | `null` |
| `runtimePath === null` か `runtimePath.namespace !== expectedNamespace` | `null` |
| 上のどれでもない | `runtimePath.value` を順に積む |

- WSL の段は `resolveFolderRuntime` が要る pathMapping を今の cwd の解決と同じ情報から得る (作業フォルダの cwd が通った起動では、同じランタイムの PathMapping は確定している)
- 変換した値は作業フォルダの cwd と同じ値の形 (WSL: POSIX の絶対パス / Win32: ドライブ付きの Windows のパス)

### §4.3 options の組み立て

| `LaunchQueryOptions` のキー | 載せる条件 | 値 |
|---|---|---|
| `additionalDirectories` | 変換後が 1 件以上 | §4.2 の値 |
| `maxTurns` | `config.maxTurns !== null` | そのまま |
| `maxBudgetUsd` | `config.maxBudgetUsd !== null` | そのまま |
| `title` | `config.sessionName !== null` (再開では §3 により必ず `null`) | そのまま |

## §5 agents (domain/session/agent-session.ts / agents/sdk-agent-session.ts / agents/session-core.ts)

### §5.1 `LaunchQueryOptions`

```ts
export interface LaunchQueryOptions {
  readonly permissionMode: SafePermissionMode;
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly settings?: ...;
  readonly resume?: string;
  // 024
  readonly additionalDirectories?: readonly string[];
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
  readonly title?: string;
}
```

### §5.2 パスの値の述語

```ts
export type LaunchDirectoryKind = 'posix' | 'windows';
export function isLaunchDirectoryValue(kind: LaunchDirectoryKind, value: unknown): value is string;
```

| kind | 真になる条件 |
|---|---|
| `posix` (WSL の起動) | string・`/` で始まる・`\` を含まない・`/` で分けた成分に `.` / `..` が無い・制御文字 (`\p{Cc}`) が無い・4096 文字以下 |
| `windows` (Win32 の起動) | `makeHostPath(value)` が成功し、正規化した値が `value` と同じ |

### §5.3 `decodeLaunchOptions`

- 4 キーは **キーが無い** か、次を満たすときだけ通す。外れれば decode の失敗 (起動しない。今の未知の値の扱い)
  - `additionalDirectories`: 配列・1〜10 件・重複なし・全件が `isLaunchDirectoryValue(kind, v)` (`kind` は `launchDirectoryKindOf(spec)` = spec が `isWin32LaunchSpec` なら `windows`、それ以外は `posix`)
  - `maxTurns`: `isValidMaxTurns` かつ非 null
  - `maxBudgetUsd`: `isValidMaxBudgetUsd` かつ非 null
  - `title`: `isValidLaunchSessionName` かつ非 null
- 未知のキーは今どおり捨てる

### §5.4 `buildQueryOptions`

- §5.3 と同じ規則を assert し、外れれば `Error` を throw する。メッセージにはキーの名前だけを入れ、値 (パス・名前・数) を入れない
- 追加ディレクトリの形は **`kind` に合う形** だけを通す (「`posix` か `windows` のどちらかの形」では通さない)。そのため `BuildQueryOptionsDeps` に次の欄を足す:

```ts
export interface BuildQueryOptionsDeps {
  ...今のまま
  readonly additionalDirectories?: readonly string[];
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
  readonly title?: string;
  /** 追加ディレクトリの形を決めるランタイムの種類。呼び出し側が `launchDirectoryKindOf(spec)` (`isWin32LaunchSpec(spec)` なら `windows`、それ以外は `posix`) で決める。必須 */
  readonly launchDirectoryKind: LaunchDirectoryKind;
}
```

- `launchDirectoryKindOf(spec: RuntimeLaunchSpec): LaunchDirectoryKind` は `agent-session.ts` の `isWin32LaunchSpec` の隣に置き、decoder (§5.3) と `buildQueryOptions` の呼び出し (`sdk-agent-session.ts`) の両方が同じ関数で `kind` を決める
- `launchDirectoryKind` は query の options に載せない (deps だけの欄。`QUERY_OPTION_KEYS` は 16 のまま)。`additionalDirectories` が無いときも渡す (必須にして渡し忘れを型で落とす)
- 負例: WSL の起動 (`launchDirectoryKind: 'posix'`) に Windows のパス、Win32 の起動 (`'windows'`) に POSIX のパスを渡すと throw する
- 4 キーは値があるときだけ spread する
- `QUERY_OPTION_KEYS` (12 → 16):

```
今の 12 (session-core.ts:68-84):
  permissionMode, canUseTool, pathToClaudeCodeExecutable, spawnClaudeCodeProcess,
  abortController, settings, model, effort, onElicitation, includeHookEvents,
  forwardSubagentText, resume
024 で足す 4:
  additionalDirectories, maxTurns, maxBudgetUsd, title
```

(pin テストはリテラルで 16 を並べる。足す 4 つの各行に AD-064 の Decision の番号をコメントで書く)

## §6 プリセットの store (main/infra/settings/preset-record.ts / preset-store.ts)

### §6.1 版

| 版 | 読む | 書く | config の検証 | 読み替え |
|---|---|---|---|---|
| 1 | する | しない | `PRESET_CONFIG_KEYS_V1` の 6 キーと前 6 軸の規則 | `{ ...config, ...DEFAULT_EXTRA_AXES }` |
| 2 | する | する | `isValidPresetConfig` (9 キー) | そのまま |
| 3 以上 | しない | — | — | `schema-version-unknown` と退避 (今の規則) |
| それ以外 (0・数でない・欠け) | しない | — | — | `parse-failed` と退避 (今の規則) |

- `PRESET_SCHEMA_VERSION = 2`。`SUPPORTED_PRESET_SCHEMA_VERSIONS = [1, 2]`
- `toPresetRecord(value, version)` に版を渡し、読み替えは record の関数の中で行う (AD-042 Decision 4)
- 版 1 のファイルを読んだだけでは書き戻さない。次の `save` で版 2 の全件を書く
- 1 件のレコードが規則の外なら今の `invalid-record` の扱い (その件を読まない) のまま
- `Preset.config` の型は `PresetLaunchConfig`

## §7 再開の形 (renderer)

### §7.1 `ResumeDialogState.initial`

```ts
initial: Pick<SessionLaunchConfig,
  'modelId' | 'effort' | 'permissionMode' | 'additionalDirectoryIds' | 'maxTurns' | 'maxBudgetUsd'
> | null;
```

| 開いた所 | `initial` |
|---|---|
| 稼働中の行の「再開」 | その行の `config` の 6 つの値 |
| 過去の区画の行の「再開」 | `null` (既定: 追加ディレクトリ `[]`・上限 `null`。前 3 軸は今のまま) |
| 「やり直す」 | 再開の形ではない (新規の起動。`lastConfig` の全部の軸。名前を含む。入力の文字列の初期値は §9.2.1) |

- `initial` の上限は、下書きの数の値と同時に入力の文字列の初期値にも写す (§9.2.1)

### §7.2 再開の形のダイアログ

- 名前の部品を出さない。送る `config.sessionName` は `null`
- プリセットの適用は選び直せる 6 軸に当てる (引き継ぐ 3 軸は変えない)
- 追加ディレクトリは `fixed.folderId` と `fixed.runtimeId` に対して §2 の依存解決を通す

## §8 名前の表示 (main registry / renderer store)

| 場所 | 変更 |
|---|---|
| `session-launch-service.ts` の `startSession` | registry の行の `name` を `config.sessionName` で初期化する (今は `null` 固定) |
| renderer のストアの起動の受け付け | `LiveSessionState.name` を起動の `config.sessionName` で初期化する |
| 稼働中の行の題・中央のヘッダ | 今の `name` の表示 (023) のまま |
| ログ | 名前を出さない (今の `logRejection` は理由のキーだけ) |

## §9 起動ダイアログと概要のタブ (renderer)

### §9.1 ファイル

| ファイル | 中身 |
|---|---|
| `features/session/LaunchExtraAxes.tsx` (新設) | 追加ディレクトリの選択と一覧・上限の 2 つの入力・名前の入力 (再開の形では名前を出さない) |
| `features/session/launch-extra-axes.ts` (新設) | 入力の文字列の解釈 (`parseMaxTurnsInput` / `parseMaxBudgetInput` / `parseSessionNameInput`)・追加の選択肢の組み立て (`additionalDirectoryChoices`)。純関数 |
| `features/session/LaunchDialog.tsx` | 入力の文字列の state・追加ディレクトリの解決結果 DTO の hook・押せない条件・通知の並びに `directoryResets` を足す |
| `features/session/labels.ts` | 文言 (§9.3) |
| `features/shell/OverviewTab.tsx` | 3 行を足す (§9.4) |

### §9.2 入力の解釈

| 入力 | 空 (trim 後) | 解釈できる | 解釈できない |
|---|---|---|---|
| ターン数 | `null` (上限なし) | `/^\d+$/` で `isValidMaxTurns` | 起動を押せない・範囲の文言 |
| 費用 | `null` (上限なし) | `/^\d+(\.\d{1,2})?$/` で `Number(...)` が `isValidMaxBudgetUsd` | 同上 |
| 名前 | `null` (名前なし) | `normalizeSessionName(raw)` が非 null | 同上 (023 の制限の文言) |

### §9.2.1 入力の文字列の初期化

`LaunchDialog` の `maxTurnsInput` / `maxBudgetInput` / `sessionNameInput` は、下書きの初期値 (`LaunchDialog.tsx` の `useState<LaunchDraft>` の初期化) と **同じ時点・同じ元** から 1 回だけ決める。元の値を `source` と呼ぶ。

| 開き方 | `source` (下書きと同じ) | 名前の元 |
|---|---|---|
| 新規の起動で `lastConfig` が null | 既定 (`DEFAULT_EXTRA_AXES`) | なし |
| 新規の起動で `lastConfig` がある (拒否・失敗・受け付けの後・起動せずに閉じた後・「やり直す」) | `lastConfig` | `lastConfig.sessionName` |
| 再開の形で拒否から戻った (`phase === 'rejected'` かつ `lastConfig` がある) | `lastConfig` | なし (再開の形は名前を出さない。`lastConfig.sessionName` は §3 により `null`) |
| 再開の形 (それ以外) | `resume.initial` (null は既定) | なし |

| 入力 | 初期値 |
|---|---|
| `maxTurnsInput` | `source.maxTurns === null` なら `''`、それ以外は `String(source.maxTurns)` |
| `maxBudgetInput` | `source.maxBudgetUsd === null` なら `''`、それ以外は `String(source.maxBudgetUsd)` (§1.2 により小数 2 桁以内なので、§9.2 の正規表現と述語を通り同じ数に戻る) |
| `sessionNameInput` | 名前の元が `null` かなしなら `''`、それ以外はその値 |

- 初期値は §9.2 の解釈を通すと `source` と同じ値に戻る (往復で変わらない)。上限が黙って「上限なし」に戻る経路を作らない
- プリセットの適用 (FE-040) は上限の 2 つの入力を同じ規則でプリセットの値に置き換え、名前の入力に触れない
- 下書きと入力の文字列を別々の時点で初期化しない (片方だけが `lastConfig` を見ると、送る値と画面の値が食い違う)

### §9.3 文言

| キー | 文言 |
|---|---|
| 軸の見出し | 「追加ディレクトリ」「ターン数の上限」「費用の上限 (USD)」「セッション名」 |
| ボタン | 「フォルダを追加」「外す」 |
| プレースホルダ | 上限は「上限なし」、名前は「自動で付ける」 |
| 範囲の文言 | 「ターン数は 1〜1000 の整数で入力してください」「費用は 0.01〜1000 の範囲で入力してください」。名前は 023 の文言 |
| 外した通知 | `unreachable` / `same-as-folder`: 「追加ディレクトリ <表示名> はこのランタイムから使えないため外しました」(作業フォルダと同じになったときは「追加ディレクトリ <表示名> は作業フォルダと同じため外しました」)、`unregistered`: 「追加ディレクトリ <表示名> は登録が解除されたため外しました」(表示名が引けないときは「(削除されたフォルダ)」) |
| 越境の警告 | 作業フォルダと同じ `CROSS_BOUNDARY_LABELS` の文言に、項目の表示名を前置する |

### §9.4 概要のタブ

| 行 | 値 |
|---|---|
| 追加ディレクトリ | 表示名を「、」で並べる。0 件は「なし」。登録が解除された id は「(削除されたフォルダ)」 |
| ターン数の上限 | 数か「上限なし」 |
| 費用の上限 (USD) | `toFixed(2)` か「上限なし」 |

## §10 文書の更新 (完了の PR)

| 文書 | 箇所 | 変更 |
|---|---|---|
| `docs/glossary.md` | SessionLaunchConfig (`:1093-1102`) | 「前 6 軸」→ 10 軸の列挙、「X-6 が扱う」→ 024 で実装、「6 軸の形は変えない」→ 再開は引き継ぐ 3 軸を変えない |
| 同 | Preset (`:807-813`) | 版 2・名前を持たない |
| 同 | Session name (`:1036-1042`) | Counterexample (`:1041`) の X-6 の記述を「起動のときの名前は 024」に |
| 同 | Concurrency limit (`:211-218`) | Counterexample (`:217`) の「上限 (ターン数・費用) は X-6」を 024 に |
| 同 | Launch axis (`:546`) | 「6 つ (X-4)」→ 9 つ (追加ディレクトリ・ターン数の上限・費用の上限・セッション名を足す。024)。Ref に 024 spec |
| 同 | LaunchInput (`:586`) | `options: LaunchQueryOptions` の中身に任意の `additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title` (024) と `resume` (X-9) を足す |
| 同 | Resume (`:949`) | 「モデル / effort / 権限モードは選び直せる」→ 選び直せる軸は 6 つ (モデル / effort / 権限モード / 追加ディレクトリ / ターン数の上限 / 費用の上限。024)。名前は再開で渡さない |
| 同 | Resume dialog (`:960`) | 「モデル / effort / 権限モードは今の部品と依存解決のまま」→ 選び直せる 6 軸は今の部品と依存解決 (追加ディレクトリは `directoryResets`)。名前の部品は出さない (024) |
| `docs/domains/session/charter.md` | Journey 2 手順 3 (`:110`)・Journey 4 手順 2 (`:133-134`)・Related ADRs (`:263`)・X-6 の節 (`:352-354`)・frontmatter | 実装済みに・AD-064 と 024 を足す |
| 同 | Key concepts のプリセット (`:142`) | 「名前付きで保存された `SessionLaunchConfig`」→「名前付きで保存された `PresetLaunchConfig` (`SessionLaunchConfig` からセッション名を除いたもの。`presets.json` 版 2。024)」。資格情報の値を含まない記述は残す |
| `docs/roadmap.md` | X-6 の行 (`:355`) | 024 の結論と未確認の項目 |
| `tests/rule-fixtures/expected.mjs` | `ui-path-concat` の `howToClose` | 「024 で確かめた: 当たらない ...」(P-11) |
