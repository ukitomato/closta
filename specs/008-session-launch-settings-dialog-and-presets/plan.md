# Implementation Plan: 起動設定ダイアログとプリセット (X-4)

**Branch**: `008-session-launch-settings-dialog-and-presets` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

## Summary

X-1 の単一セッション起動は `launchSession(folderId, runtimeId)` / `LaunchInput.permissionMode: 'default'` である。これを、**検証済みの起動設定オブジェクト**を受ける形に広げる。加えるものは以下。

- 6 軸 (フォルダ / WSL ランタイム / Provider / モデル / effort / 権限モード) を選ぶダイアログ
- 名前付きプリセット
- 依存解決 (renderer と main の起動ゲートで同じ純粋関数を使う)
- 越境警告

X-3 の `deriveEnv` / `listReachableProviders` / `HelperSettings` を**実起動へ初めて配線する**。design-gate の実測で、X-1 の起動には 2 つの問題が見つかった。

- **env が wsl.exe を越えない**。
- **`--` 以降の argv がシェル展開される**。

この 2 つを、実名キーによる `WSLENV` 生成と `wsl.exe --exec` で直す。

権限モードは安全 3 値に限り、AD-036 §4 P1 / §5 / §6 を調停する AD-041 を起票する。aws-assume-role helper の生成は X-7 へ繰り越す (USER 決定)。

## Technical Context

- **Stack**: Electron 39 / electron-vite 5 / React 19 / TypeScript / zustand 5 / Vitest / `@anthropic-ai/claude-agent-sdk` (docs/discovery.md)
- **レイヤ** (AD-023): `domain` (純粋) / `agents` (Electron 非依存・SDK 保持) / `main/infra` (OS 境界) / `main/app` (合成・IPC) / `renderer`
- **永続化**: `userData` 配下の JSON (`presets.json`)。X-3 `provider-store` と同型 (schemaVersion / 上書き前退避 / 一意 temp)
- **起動できるランタイム**: WSL のみ (X-1 と同じ。Win32 直接起動は X-6)
- **SDK 事実** (調査済み):
  - `EffortLevel = low|medium|high|xhigh|max`
  - `PermissionMode` は 6 値 (AD-020)
  - `supportedEffortLevels` は、稼働中の `Query` からしか得られない。したがって起動前のダイアログはカタログの静的データを正とする
- **WSL 実測 (2026-09-30, Ubuntu-26.04, Node `spawn` shell なし)**:

  | # | 形 | 結果 |
  |---|---|---|
  | A | `wsl.exe -d D -- printf '%s\n' '{"k":"$(echo PWNED)"}'` | `{"k":"PWNED"}n` (**`$(...)` 展開、`\` 消去**) |
  | B | 同じ引数を `--exec` で | 原文どおり |
  | C | `-- printf '%s' 'x;echo INJECTED'` | 原文どおり (`;` では分割されない。二重引用相当) |
  | E | `--exec` + `WSLENV=A/u:B/u` | 両方の値が届く |
  | F | `--exec /bin/sh -c 'command -v claude'` | 見つからない (login PATH なし) |

  platform-boundary の probe でも同じことを確認済み: `WSLENV` 無しでは env が届かず (`unset`)、`WSLENV=K/u` を付けると届いた。

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス名前空間) | ✅ | config-dir は `runtimePathOps.fromHost` / `fromUnc` + 同一 distro 照合で `RuntimePath` を生成し、branded のまま渡す (新しい変換実装を作らない)。helperPath は選択ランタイムの名前空間で分類する |
| III (権限ゲート) | ✅ (ADR 要) | 安全 3 値のみ。昇格モードは型 + `check.mjs` 項目 16 で締め出したまま。AD-041 で §5 を拡張し、§4 P1 に model / effort を足す。`plan` → ExitPlanMode の遷移先を Confirmation で確認する |
| IV (SDK 経由) | ✅ | model / effort / permissionMode は `query()` の options で渡す。`setModel()` / `setPermissionMode()` は使わない |
| V (資格情報非永続) | ✅ | プリセットは Provider を id 参照で持つ。導出 env は wsl.exe の spawn env にだけ載せ、fork env と argv に載せない (CWE-214) |
| II (プラットフォーム差を infra に閉じる) | ✅ | `--exec` / WSLENV の生成 / transport 固有の禁止キー集合は infra/runtime に置き、domain には注入する |
| VI (永続環境を構築しない) | ✅ (条件付きで ADR 要) | helper 生成を X-7 へ繰り越したので、ディストロにもアプリのデータ域にもスクリプトを書かない。`check.mjs` 項目 6 は SH-000 が成立すれば変更しない。不成立なら AD-041 (f) の分岐に従って登録し、項目 6 を改修する |
| VII (supervisor Electron 非依存) | ✅ | agents 側の変更は options 構成と launch decoder のみ。electron を import しない |
| VIII (日本語環境) | ✅ | プリセット名は日本語を許し、表示名と同じ述語 (制御文字のみ拒否) で検証する。ダイアログの入力は既存の IME 対応コンポーネントを使う |
| IX (main をブロックしない) | ✅ | 依存解決は純粋関数。I/O は既存 IPC |
| XI (観測可能な垂直スライス) | ✅ | ダイアログ → 起動 → ストリーミングを E2E で観測できる。distro 内の env は quickstart で観測する |
| XIII (element 優先) | ✅ | ダイアログ・一覧は既存の UI element (assistant-ui / 既存 features) を使い、独自 element を新設しない |
| XIV (glossary) | ✅ | 起動軸 / 依存解決 / 越境警告 (Cross-boundary の派生) / SafePermissionMode / Preset を追記し、LaunchInput を追随させる |
| XV (訳出は ui) | ✅ | 軸ラベル・通知・理由キーの文言は renderer の labels に置く |

## Domain Context

### Charter reference
- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがる Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- Scope (本 feature に関わる部分): `SessionLaunchConfig` の解決と軸どうしの依存関係の解決 / プリセットの保存・適用 / `canUseTool` の往復の配管
- Journey 2: フォルダ → ランタイム → Provider・モデル・effort・権限モード・上限 → 起動 → 同じ組み合わせをプリセット保存 (上限は X-6)
- 業務ルール:
  - プリセットに長期資格情報の値を含めない (V)
  - 上流の軸を変更したとき、無効な下流を既定に戻し通知する
  - 権限モードの選択肢はランタイム capability に従う (X-4 は安全 3 値のみ。連動は I-3)

### Related ADRs
- [AD-015](../../docs/decisions/0015-wsl-access-strategy.md) — WSL アクセス戦略: accepted。§5 (引数のバックスラッシュ消去、WSLENV の透過)、§7 (`wsl.exe -- command -v claude`)。`--exec` 化との整合を AD-041 で記録する
- [AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md) — FS 境界をまたぐ作業フォルダの性能崖: accepted。越境は閾値なしで警告する
- [AD-017](../../docs/decisions/0017-container-workspace-strategy.md) — コンテナの作業領域戦略: accepted。**コンテナ専用**のため、AD-041 で帰属を I-1 へ付け替える
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) — SDK メッセージ型と SPIKE-6: accepted。PermissionMode 6 値と危険度、EffortLevel 5 値
- [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) — 作業フォルダは所在を持つ: accepted。越境判定 (`resolveFolderRuntime` / 解決結果 DTO) の根拠
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — X-1 の起動プロセスと権限ゲート: accepted。§4 P1 (options allowlist) / §5 (`default` 固定) / §6 (env denylist) を **AD-041 で調停する**
- [AD-039](../../docs/decisions/0039-credential-delegation-verified.md) — 資格情報委譲の検証: accepted。D2 (per-session settings)。D4 は X-3 R-02 で失効しており、AD-042 で記録する
- [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) — settings の 2 キー射影: accepted。`buildQueryOptions` + query 直前 assert の配線を本 feature で完成させる。Consequence「permissionMode `default` リテラル固定」を AD-041 で読み替える
- AD-005 (Provider は値) — X-3 で `CredentialRef` / `configDir` union を、本 feature で `ModelEntry.supportedEffortLevels` を足す。型の精緻化を AD-042 で記録する

### Glossary excerpt
- **SessionLaunchConfig**: 起動時に選択される設定の組。**本 feature は前 6 軸**を扱う
- **Preset (プリセット)**: 名前付きで保存された `SessionLaunchConfig`。資格情報の値は含まない
- **Model catalog**: Provider ごとに使えるモデルの集合。Bedrock は inference profile ID で pin する
- **Reachability**: ランタイムから作業フォルダ / Provider に到達できるかの 3 値
- **Cross-boundary (越境)**: 作業フォルダとランタイムがファイルシステム境界をまたぐこと (「越境警告」はこの派生語として登録する)
- **LaunchInput**: X-1 の起動入力。本 feature で安全 3 値・model / effort に広げる

## 上流からの申し送り

**実行したコマンド** (2026-09-30):

```bash
spec_id=008-session-launch-settings-dialog-and-presets
grep -rn "$spec_id" docs/ .specify/ tests/ specs/ --include='*.md' --include='*.mjs' --include='*.js' --include='*.yaml' --include='*.yml' | grep -v "specs/$spec_id/"   # → 0 件
grep -rn "X-4" docs/ .specify/ tests/ specs/ scripts/ --include=... | grep -v "specs/$spec_id/"                                                                  # → 142 件 / 61 ファイル
grep -n "session-launch\|preset\|permissionMode\|PERMISSION_MODE" .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs              # → 5 件
```

spec_id は新規採番のため 0 件。`X-4` の 142 件は、reviewer / gate transcript の重複を除くと **30 行 / 20 件の distinct 義務**に集約された。処理は以下のとおり (design-gate R1 で繰越先を feature ID に確定)。

| # | 出典 (代表) | 義務 | 処理 |
|---|---|---|---|
| 1 | 005 spec:36-38,443,475 / glossary:289 / _overview:56 / prompts:195 | 起動設定ダイアログ + 依存解決 + 通知 | **本 feature** (FR-001〜007) |
| 2 | prompts:198 / 007 spec:422 | プリセット保存・適用 | **本 feature** (FR-009〜011) |
| 3 | 002 plan:32 / roadmap:181,253 | 権限モード・effort の列挙値は AD-020 | **本 feature** (FR-001/004)。roadmap の「6 値」を「安全 3 値」に追随させる (FR-015) |
| 4 | 005 spec:100,299 (FR-013),396 (SC-006a) | `default` 固定を拡張 | **本 feature**: AD-041 (a)(b)。昇格モードは I-3 |
| 5 | 005 spec:444,488 / research R-05 / plan B-4 / AD-025:279 | Win32Runtime 直接起動 + autoModeSafe E2E | **X-6** (新 launch 経路になるため。USER 決定) |
| 6 | 005 spec:295 (FR-012) / data-model:141 | 承認の `capability` スコープ永続化とプリセット反映 | **I-3** (権限面を広げるため、権限ゲートの設計と一緒に扱う) |
| 7 | agent-session.ts:192 / session-core.ts:143 / ApprovalCard.tsx:14 / useLiveSession.ts:264 (コメント) | `scope: 'capability'` を通す | **I-3** (#6 と同一)。コード内コメントの宛先を I-3 に更新する |
| 8 | AD-040:73 / 007 plan:139 / 007 contracts:25 / glossary:170 | Provider → deriveEnv → `RuntimeLaunchSpec.env` 合流 / settings を buildQueryOptions へ | **本 feature** (FR-005 / FR-013)。WSL への配送は実名 `WSLENV` (AD-041 (e)) |
| 9 | 007 contracts C-4:47 / data-model:101 | query 直前に settings 2 キー assert | **本 feature** (FR-005) |
| 10 | composition-root.ts:280 / 007 FR-008 | `resolveConfigDirRuntimePath` 実装 | **本 feature** (FR-012) |
| 11 | 007 spec:94,289,360,418 / X-3 tasks FE-010 | 到達可能性で絞った Provider 選択 + 除外理由 + E2E | **本 feature** (FR-002 / SC-001) |
| 12 | 007 SC-007 / X-3 tasks FE-010 (カタログ面) | Provider 連動のモデルカタログ | **本 feature** (FR-003 / FR-017) |
| 13 | 007 FR-006 / X-3 tasks BE-020 / provider charter:93 | RoleSessionName 付き helper 生成 + 配線 | **X-7** (USER 決定。roadmap に行を起こした) |
| 14 | 007 quickstart-results:16 | helper の live 観測 | **X-7** (#13 と同一)。X-4 の quickstart は env 配送の live 観測を担う |
| 15 | 007 spec:177 | 実行中セッションの Provider 編集・削除 | **本 feature** (Edge Case: 起動時スナップショット。単体で 1 ケース確認) |
| 16 | 007 pr-gate:31 (SEC-L-201) | helper / env 値の制御文字拒否 | **本 feature** (FR-014) |
| 17 | 007 code-gate DB-M-002 / expected.mjs:420 (`principle-v-unknown-shape-secret`) | 自由入力の秘密経路が増えたら IPC で秘密スキャン | **本 feature では発火しない**。本 feature の自由入力はプリセット名 (表示用で起動に使わない) とモデル ID (文字種 allowlist で拘束) で、秘密を持つ欄ではない。`nextFeature` を **X-7** (資格情報まわりの登録欄を増やす) へ付け替える |
| 18 | expected.mjs:398 (`ui-path-concat`) | 追加ディレクトリ入力で opaque PathDTO を強制 | **発火しない** (追加ディレクトリ軸は X-6)。`nextFeature` を **X-6** に付け替える |
| 19 | expected.mjs:375 (`sdk-forbidden-call-alias`) | 書き込み系 SDK API 利用時に binding denylist | **発火しない** (rename / delete を使わない)。`nextFeature` を **X-6** に付け替える |
| 20 | 007 code-gate PB-L-001 / PB-L-002 / CONV-L-002 | distro 綴り正規化 / 項目 17 走査範囲 / detect 命名 | PB-L-002 は**本 feature で処理済み扱い** (preset 永続層は `infra/settings/` に置き、項目 17 の既存範囲に入る)。他は据置 |
| 21 | 007 pr-gate DB-P-M03 | providers.json 退避・版不一致の UI | 一覧・復元・版不一致の UI は **X-6** (USER 決定)。件数 / ファイル全体を読めなかった旨の 1 行表示は **本 feature** (pr-gate R1 USER 決定。AD-042 Decision 4) |
| 22 | 005 quickstart:132 / pr-gate sec L-001 | `requestId` の予測不能化 | **X-5** |
| 23 | AD-016:97 | 越境警告を受け入れ条件に | **本 feature** (FR-008 / SC-008) |
| 24 | AD-017:103 / AD-025:48 | コンテナの作業領域戦略軸 | **I-1** へ付け替え (AD-041 (d)) |
| 25 | constitution.md:845 | 項目 5 の対象が「X-4 で生じる」 | **発火しない** (docker を使わない)。Existing violations 表の宛先を I-1 に直す**事実追随** を SH-015 で行う (版は上げない。L834 の先例) |
| 26 | 001 research:402 | distro 起動/停止の継続検出 | **I-1** (本 feature は検出を増やさない) |
| 27 | 001 contracts/workspace-store:107 | プリセットの秘密はキーチェーン参照のみ | **本 feature** (FR-010。Provider を id 参照にするので参照キーすら持たない) |
| 28 | 005 spec:453,485 / plan:23 | fork / resume / rename / tag / delete | **X-6** |
| 29 | session charter:151 | 「X-4 未着手」の更新 + Related Specs | **本 feature** (FR-015) |
| 30 | 007 spec:300 | 期限閾値の設定可否 | **消滅** (R-02 で期限監視は N/A) |
| 31 | session charter:128 (design-gate R1 で追加) | KPI「再利用率」の計測経路 (ローカル利用ログ) | **O-3** (observability)。本 feature には計測基盤が無い。roadmap の O-3 に義務を登録する |

規則ファイル (実名リスト方式) のうち該当するもの:

- `.dependency-cruiser.js:252` `services-not-to-io` — `preset-service` の実名を**追加する**
- `allowlists.mjs:383` `PERMISSION_MODE_ESCALATION_VALUES` — **変更しない** (昇格値の締め出しを維持する)。説明文の「'default' 固定」は「安全 3 値 (AD-041)」に直す
- `allowlists.mjs:178` の `WSL_ALLOWED_ARGS` (項目 2) — `--exec` は既にある。変更しない
- `allowlists.mjs:435` spawn 許可 — 変更しない (新たな spawn を作らない)
- `allowlists.mjs:465` `DISTRO_SCRIPT_CONSTANTS` — **変更しない** (helper 生成を X-7 へ繰り越したため)

## 実装方針 (レイヤ別)

### domain
- `domain/provider/model-catalog.ts` (新)
  - `EffortLevel` / `isValidModelId` (文字種 allowlist) / `isValidEffortLevels` (enum / 重複なし / 5 件以下) を置く。
  - モデルカタログは provider の概念なので provider に置く。session はこれを import する (session → provider の順方向依存)。
- `domain/provider/forward-env.ts` (新)
  - `makeForbiddenForwardKey(transportKeys) → (key) => boolean`: 転送禁止キーの述語を作る。
    - 照合は大文字小文字を区別しない。
    - transport に依存するキー集合 (`LAUNCH_ENV_ALLOWLIST` ∪ `WSL_UTF8` / `WSLENV`) は infra から注入する。X-3 の `isDeniedEnvKey` と同じ構え (domain に transport 名を複製しない)。
    - domain が固定で持つのは transport に依存しないものだけ: `PATH` / `HOME` / `SHELL` / `TMPDIR` / `NODE_OPTIONS` / `NODE_PATH` / `LD_*` / `BASH_ENV` / `ENV` / `PROMPT_COMMAND` / `IFS` / `PS4` / `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_*` / `ANTHROPIC_*` (例外は `ANTHROPIC_BASE_URL`)。
  - `isValidForwardKeyName` (`^[A-Z_][A-Z0-9_]*$`) / `isWindowsPathValue`。
  - `PASSTHROUGH_VAR_ALLOWLIST`: `CREDENTIAL_ENV_NAMES` から `CLAUDE_CONFIG_DIR` を除いたもの。detector と共有するため、実名の集合を domain に移す。
  - これらを validate (`isValidExtraEnv` / env-passthrough の varNames) / provider-record / deriveLaunchEnv の 3 箇所で共有する。表駆動の pin テストで集合を固定する。
- `domain/provider/helper-path.ts` (新)
  - `classifyHelperPath(raw, runtime) → RuntimePath | null`。POSIX 絶対パスはそのまま、HostPath は `fromHost` で変換し、結果を文字種 allowlist で照合する。
  - `assessReachability` と `prepareLaunch` の両方がこれを呼ぶ (判定と実行を同じ関数にする)。
- `domain/provider/derive-env.ts` (X-3 改修)
  - `DerivedLaunchEnv` に `forwardKeys: readonly string[]` を足す。中身は方式固有の実名キー + 採用した extraEnv のキー + env-passthrough の varNames で、curated base のキーは含めない。
  - extraEnv は、転送禁止キーに当たるキーと Windows パス値を拒否する。`DERIVATION_CONTROLLED_KEYS` の締め出しは、転送禁止キーの `CLAUDE_CONFIG_DIR` に包含して維持する。
  - 資格情報 denylist に当たる extraEnv キーは、X-3 どおり導出時に skip する。登録時の IPC では同じ述語で拒否し、黙って消える状態を作らない。
  - env-passthrough は `resolved.passthroughValues` を注入する。値は infra が process.env から取り、varNames は `PASSTHROUGH_VAR_ALLOWLIST` に限る。
  - helper 系 3 方式は `resolved.helperRuntimePath` (分類済み) だけを settings に載せる。`?? cred.helperPath` の fallback は撤去する。
  - `DerivedLaunchEnv` / `ResolvedCredential` の型変更は AD-042 に記録する。
- `domain/session/launch-config.ts` (新)
  - `SessionLaunchConfig`: folderId / runtimeId は必須。provider / model / effort は `null` = 既定。
  - `SafePermissionMode = 'default'|'plan'|'dontAsk'` / `isSafePermissionMode` / `assertSafePermissionMode` (安全 3 値外は throw)。
  - `isValidPresetName` (表示名と同じ規則) / `normalizePresetName` (trim + NFC)。
  - `isValidLaunchConfig` を置き、IPC / preset-record / agents decoder で**共有する**。
- `domain/session/launch-resolution.ts` (新) — **依存解決の純粋関数** `resolveLaunchAxes(draft, facts) → { draft, resets: AxisReset[], blockers: LaunchBlocker[] }` (越境の判定は持たない。警告は解決結果 DTO の `boundary === 'cross'` だけで出す。FR-008 / pr-gate R1 C-001) (`draft` は未確定の軸を持てる `LaunchDraft`。確定形への変換は `toLaunchConfig`)
  - facts は次の 5 つ: フォルダ / ランタイムの存在と実行状態、folder↔runtime の distro 整合、到達可能な Provider 集合、Provider ごとのカタログ、モデルごとの対応 effort。
  - 無効な provider / model / effort は既定 (`null`) に戻して reset を返す。provider の reset には `requiresConfirmation` を付ける。
  - フォルダ / ランタイムの不備は blocker にする。
- `domain/session/agent-session.ts` — `LaunchInput` に `model?` / `effort?` / `permissionMode: SafePermissionMode` / `settings?` を足す。
- `domain/provider/types.ts`
  - `ModelEntry.supportedEffortLevels?: readonly EffortLevel[]` を足す (`EffortLevel` は types.ts に SDK 準拠で定義し、agents 側に SDK 型との相互代入 assert を置く。model-catalog.ts との循環 import を避けるため types.ts に置いた)。
  - `ResolvedCredential` の `awsCredentialExportPath?: string` を `helperRuntimePath?: RuntimePath` (helper 系 3 方式共通) に置き換え、`passthroughValues?` を足す。
  - `DerivedLaunchEnv` に `forwardKeys` を足す。
- `domain/session/preset.ts` (新) — `Preset = { id, name, config: SessionLaunchConfig, updatedAt }`

### agents
- `session-core.ts`
  - `QUERY_OPTION_KEYS` に `'model'` / `'effort'` を足す。**AD-041 の集合をリテラルで固定する pin テスト**を置く。
  - `buildQueryOptions` の `permissionMode` を `assertSafePermissionMode` に通す。
- `sdk-agent-session.ts`
  - launch メッセージを `{kind:'launch', spec, options: {permissionMode, model?, effort?, settings?}}` にする。
  - `decodeLaunchSpec` は `isValidLaunchConfig` の部分述語 / `isHelperSettings` で**再検証**し、未知キーを捨て、不正なら起動を拒否する。settings 値にバックスラッシュ検査を掛ける (AD-036 §3)。
  - `:336` で `buildQueryOptions` に settings / model / effort を渡す。

### main/infra
- `infra/runtime/launch-spec.ts` — WSL transport 固有の処理はここに閉じる (AD-003。domain/session は WSL-free のまま)
  - `composeLaunchEnv(baseEnv, derived) → env` (純粋関数)
    - env は base + derived.env の合流とする。
    - `WSLENV` は `derived.forwardKeys` の各キーに `/u` を付けて `:` で連結する。
    - base 側の `WSLENV` は捨てる。
    - forwardKeys に名前規則の違反、または転送禁止キー (方式固有の実名キーと passthrough allowlist を除く。AD-041 (e) 2) があれば throw する (呼び出し側が `invalid-config` にする)。
    - forwardKeys に無いキーは WSLENV に載らない。
  - `buildRuntimeLaunchSpec({ baseEnv, launchEnv, ... })`
    - wsl.exe の解決 (`resolveWslCommand`) には `baseEnv` だけを使い、extraEnv の `SystemRoot` 上書きを効かせない。
    - prefixArgs を `['--cd', cwd, '-d', distro, '--exec']` にする (claudePath は解決済みの絶対パス)。`--exec` は既存の許可形 (allowlists.mjs:178)。
  - `LAUNCH_ENV_DENY_PATTERN` は **passthrough (curated base と extraEnv) に対してだけ**掛ける。
- `infra/provider/*` (X-3 改修)
  - env-passthrough の varNames の値を process.env から取り、`resolved.passthroughValues` にする。
  - helperPath を `classifyHelperPath` で `resolved.helperRuntimePath` にする。
- `infra/settings/preset-store.ts` / `preset-record.ts` (新)
  - provider-store と 1:1 の構えにする。
  - record のキーを allow-list (id / name / config / updatedAt) で制限し、値を `isValidLaunchConfig` で検証する。**秘密キーを持たない**。

### main/app
- `validate.ts`
  - `checkLaunchConfig` (新): `isValidLaunchConfig` を呼ぶ。
  - `checkPreset` (新): 名前は `isValidPresetName`、config は同じ述語を使う。preset-record も同じ述語を使う。
  - `checkProviderDraft` / `checkProviderPatch` の models は `isValidModelId` / `isValidEffortLevels`、extraEnv は `isForbiddenForwardKey` / `isValidForwardKeyName` で検証する。provider-record も同じ述語を使う。
- `session-launch-service.ts`
  - `launch(folderId, runtimeId)` を `launch(config)` にする。**main 側の facts で `resolveLaunchAxes` を再評価**し、blocker または確認の要る reset があれば理由キーで拒否する。
  - 単一セッション規則は維持する。
  - `LaunchFailureReason` に `invalid-config` / `provider-unavailable` / `needs-confirmation` を足す (message に値を含めない)。
- `launch-preparation.ts` (新。`createPrepareLaunch(deps)` が返す `prepareLaunch` を composition-root が配線する)
  - `prepareLaunch(config)` で `providers.deriveEnv(providerId, runtimeId)` を呼ぶ。null なら `provider-unavailable`。provider が既定なら X-1 の curated base だけを使う。
  - `composeLaunchEnv` を spec.env にだけ使い、**fork env は `buildLaunchEnv` のまま**にする (`prepareLaunch` の単体で assert する)。
  - config-dir の変換は domain の `resolveConfigDirPath` (`domain/provider/helper-path.ts`。`classifyHelperPath` と同じく選択ランタイムの名前空間で解く) で行い、`runtimePathOps.fromHost` / `fromUnc` + `isSameDistro` で実装する。reachability.ts:51 の `===` も `isSameDistro` に揃える。
  - 拒否理由キーは既存のログ経路に 1 行出す (値は含めない)。
- `preset-service.ts` (新)
  - list / save (同名は上書き確認フラグ) / apply (`resolveLaunchAxes` の結果を返す) / remove (既知 id と完全一致で照合)。
  - `.dependency-cruiser.js` `services-not-to-io` に実名を足す。
- IPC
  - `launchSession(config)` に変える。
  - `listPresets` / `savePreset` / `removePreset` を足す。
  - capability / preload / ipc / e2e-capability / test-support の 5 面を揃え、すべて `handle()` 経由で登録する。
  - 越境警告は既存の解決結果 DTO (`resolveFolderRuntime` の IPC 形。ResolutionScreen と同じ) を消費する。

### renderer
- `features/session/LaunchEntry` → 起動設定ダイアログ (`LaunchDialog.tsx` に改名)
  - 軸変更のたびに `resolveLaunchAxes` を呼び、reset を通知する。blocker があれば起動ボタンを無効にして理由と次の一手 (停止中なら distro を起動して再評価ボタン) を示す。
  - provider の reset (`requiresConfirmation`) が残っていれば、起動時に確認する。文言は「既定 Provider では distro の claude の既定資格情報が使われる」。拒否したら Provider 軸を未確定にして戻る。
  - 起動が確立 (最初の応答) するまで入力を保持し、`launch-failed` を含むどの失敗でも復元する。
  - 越境は `boundary === 'cross'` で警告し、起動は有効のままにする。
  - `dontAsk` の説明文を出す。
  - 起動失敗時は理由キーの文言を表示し、入力を保つ。
- `features/session/PresetPanel` (新)
  - 一覧 (更新日時降順) / 保存 (名前入力、同名は上書き確認) / 適用 / 削除 / 空状態。
  - Provider が reset された適用は、起動前に確認する。
- `features/provider/ProviderScreen` — モデルカタログの手入力編集 (モデル ID / 表示名 / inference profile ID / 対応 effort)
- 各コンポーネントに renderer 単体テストを付ける (除外理由 / reset 通知 / 安全 3 値 / 越境警告 / カタログ編集 / 空状態)

## ADR

- **AD-041 (新規・本 feature)**「X-4 の起動設定を X-1 の起動ゲートに載せる」 — 決定の範囲:
  - (a) AD-036 §5 の `default` 固定を `{default, plan, dontAsk}` の allowlist にする。
  - (b) X-1 SC-006(a) の `dontAsk` 禁止を上書きし、SC-006(b)(c) / 005 contracts C-5 / data-model §7 の env 規則を読み替える。
    - passthrough は許可リストと完全一致させる。
    - 転送キーは `forwardKeys` に限る。
    - `WSLENV` はアプリが生成したものだけにする。
    - 資格情報は wsl.exe の spawn env に限り、fork env と argv では 0 にする。
    - 改めるテスト: `launch-spec.test.ts:29` は passthrough に限定して存続させ、spec.env の完全一致 assert は X-4 の形に置き換える。
  - (c) 昇格モードの capability 連動と capability スコープ承認の永続化を I-3 へ回す (preset 適用時に capability で再検証する前方注記を含む)。
  - (d) AD-017 / AD-025 の作業領域軸を I-1 へ付け替える。
  - (e) **env の配送**
    - アプリが `forwardKeys` から `WSLENV` を生成する (`/u` のみ)。
    - curated base のキーと転送禁止キーは転送しない。
    - AD-036 §6 の denylist の範囲を passthrough に限定する。
    - fork env と argv には導出 env を載せない。
    - 残存リスクを 2 点記録する。
      - wsl.exe の spawn env は Windows 側の同じユーザーのプロセスから見える。
      - WSL 内の claude の子プロセス (Bash tool) は秘密 env を継承し、`dontAsk` の事前承認済み Bash からも読める。
    - `ANTHROPIC_BASE_URL` など送信先を変える extraEnv は許可する (利用者が登録した値として扱う)。ただし、資格情報と同時に載ることを残存リスクに書く。
  - (f) **起動 argv を `wsl.exe --exec` にする**
    - 根拠はシェル展開の実測。
    - 読み替える箇所: AD-015 §2 / §5 / §7、AD-036 §3 (prefixArgs)、005 data-model §8。
    - `command -v` による claude の解決は、起動前の probe のまま残す。
    - SH-000 が不成立の場合の分岐 (固定リテラルの `/bin/sh -c` と項目 6 への登録) も、ここに事前に書く。
  - (g) **AD-036 §4 P1 に `model` / `effort` を足す** (escalation-neutral の根拠)。AD-040 の Consequence「permissionMode `default` リテラル固定」を読み替える。005 contracts C-4 に AD-041 への pointer を置く。
  - (h) 繰越先 (X-6 / X-7 / I-3 / O-3) の指名。
  - Confirmation: SDK 0.3.270 で、`plan` → ExitPlanMode 承認後の遷移先が昇格しない (P2 の下で `updatedPermissions` を返さない) ことを型または実機で確認する。
- AD-041 は (a)〜(h) を**節見出し**で構成し、各節の冒頭に「読み替える ADR §」を固定の書式で置く (allowlists.mjs のコメントや 005 contracts の pointer から節単位で辿れるようにする)。
- **AD-042 (新規・本 feature、軽量)**「AD-005 の型精緻化と AD-039 D4 の失効を記録する」 — 対象は次のとおり。
  - X-3 の `CredentialRef` / `configDir: HostPath|WslUncPath`
  - 本 feature の `ModelEntry.supportedEffortLevels` / `DerivedLaunchEnv.forwardKeys` / `ResolvedCredential.helperRuntimePath` / `passthroughValues`X-3 pr-gate D-L-101/102 と roadmap の follow-up ポインタを閉じる。

## 機械強制の変更

- `check.mjs` 項目 16
  - 昇格値の検出は変更しない。
  - **`assertSafePermissionMode(` を通らない値位置の `permissionMode:` と、shorthand `{ permissionMode }` を違反にする** backstop を足す。型位置 (interface / type literal) は除外する。
  - 違反メッセージの「'default' 固定」を「安全 3 値 (AD-041)」に直す。
- `check.mjs` 項目 2 (WSL 引数)
  - `--exec` は既に許可形にある (allowlists.mjs:178)。
  - 項目 2 の走査対象 (`WSL_CALLER_MODULES`) は wsl-cli.ts だけで、起動 argv を組む launch-spec.ts は見ていない。そこで、退行を検出する手段を 2 つ置く。
    - `buildRuntimeLaunchSpec` の pin テスト: prefixArgs の末尾が `--exec` で、`--` / `-u` / `--user` を含まない。
    - 違反 fixture は置かない。項目 2 は `-u root` を構造的に検出できず、fixture を置いても期待表が嘘になる。退行の検出は pin テストに一本化する。
  - 項目 2 の走査対象そのものを広げるかどうかは、AD-041 (f) で判断を記録する。
- `allowlists.mjs` の `WSL_FREE_DIRECTORIES` — `preset-service.ts` を実名で足す (wsl.exe を名指さないため)。
- `check.mjs` 項目 6 / 17 — 変更しない。
- `.dependency-cruiser.js` — `services-not-to-io` に `preset-service` を足す。
- `tests/rule-fixtures/expected.mjs`
  - 違反 fixture を足す: `sdk-permission-mode-unwrapped` (assert を通さない値位置) / `sdk-permission-mode-shorthand`。型宣言は非違反の確認に使う。
  - UNDETECTED_NOTES の `nextFeature` を付け替える: `ui-path-concat` → X-6、`sdk-forbidden-call-alias` → X-6、`principle-v-unknown-shape-secret` → X-7 (howToClose に理由を 1 行)。

## Risks / 未確定

- **R-01 (高)**: `--exec` では login shell の PATH が効かない。claude が `#!/usr/bin/env node` 形式 (nvm 等の node) だと起動できない可能性がある。
  - **SH-001 の AD-041 accepted 前に実機で確認する**。確認するのは次の 2 点。
    - X-1 で解決した claudePath を `--exec` で起動できるか。
    - `--settings` JSON が原文どおり届くか。
  - あわせて確認すること:
    - `[1m]` 付きの model ID が原文どおり届くか
    - Claude Code が helper (`apiKeyHelper` / `awsCredentialExport`) をシェル経由で実行するか
    - Bash tool から秘密 env が見えるか (キー名の有無だけを記録し、値は記録しない)
  - 不成立なら、代替は `--exec /bin/sh -c '<固定リテラル>' <claudePath> ...` だけとする (位置引数を引用し、`eval` しない。`-l` は使わない)。
    - その固定リテラルは `check.mjs` 項目 6 (`DISTRO_SCRIPT_CONSTANTS`) に登録する。
    - 登録の根拠は AD-041 (f) の分岐にする。
  - 「`--` を維持してメタ文字なしを assert」は採らない (`--settings` の JSON が必ず `"{}` を含み、モデル ID の `[]` は glob になる)。
- **R-02**: `supportedEffortLevels` は手入力の静的データである。誤入力で SDK が拒否する effort を渡すと起動に失敗する。拒否時は理由キーを launch 失敗理由として表示する (US-1 AC7)。
- **R-03**: `dontAsk` は「事前承認が無ければ拒否」するモードで、承認カードが出ない。拒否の理由が分かる表示を受け入れ条件にした (US-1 AC6)。
- **R-04**: `WSLENV` は wsl.exe の spawn env に載るので、Windows 側の同じユーザーのプロセスからは env が見える。これは X-1 以前から api-key を env で渡す方式に内在していた露出であり、argv (CWE-214) や fork env より狭い。残存リスクとして AD-041 に記録する。

## Project Structure

```
src/domain/session/{launch-config,launch-resolution,preset}.ts (+test)
src/domain/provider/{model-catalog,forward-env,helper-path}.ts (+test) / derive-env.ts / reachability.ts (改修)
src/domain/session/agent-session.ts (LaunchInput 拡張)
src/domain/provider/types.ts (ModelEntry.supportedEffortLevels / helperRuntimePath / passthroughValues / forwardKeys)
src/agents/{session-core,sdk-agent-session}.ts (+test)
src/main/infra/runtime/launch-spec.ts (--exec / composeLaunchEnv / baseEnv と launchEnv の分離)
src/main/infra/provider/* (passthroughValues / helperRuntimePath)
src/main/infra/settings/{preset-store,preset-record}.ts (+test)
src/main/app/{preset-service,session-launch-service,composition-root,ipc,validate,session-ipc}.ts
src/domain/capability.ts / src/preload/index.ts / src/main/app/e2e-capability.ts / src/renderer/src/test-support/capability.ts
src/renderer/src/features/session/{LaunchDialog,PresetPanel,...}.tsx (+test)
src/renderer/src/features/provider/ProviderScreen.tsx (モデル編集 +test)
scripts/constitution/{check,allowlists}.mjs / .dependency-cruiser.js / tests/rule-fixtures/*
docs/decisions/0041-*.md / 0042-*.md / docs/glossary.md / docs/roadmap.md / docs/domains/session/charter.md / .specify/memory/constitution.md (L845 事実追随。版は上げない)
```
