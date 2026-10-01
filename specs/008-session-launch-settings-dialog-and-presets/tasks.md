# Tasks: 起動設定ダイアログとプリセット (X-4)

**Spec**: [spec.md](./spec.md) / **Plan**: [plan.md](./plan.md) / **targets**: both

凡例:

- `[BE]` backend (domain / agents / main)
- `[FE]` renderer
- `[SH]` 横断 (ADR・規則・docs・検証)
- `[P]` = 同じ phase 内で並列に進めてよい

本 tasks.md の ID は 008 の中だけで有効である。X-3 の ID を指すときは「X-3 FE-010」のように修飾する。

## Shared Tasks (先行: 実機確認・ADR・型・規則)

- [x] **SH-000** [SH] **実機確認 (plan R-01)**。すべて Node `spawn` (shell なし) で行い、結果を quickstart-results.md に記録して AD-041 (e)(f) の形を確定する
  - X-1 が解決した claudePath を `wsl.exe --cd <cwd> -d <distro> --exec <claudePath> --version` で起動できるか
  - `--settings` JSON 相当の引数と `[1m]` 付きの model ID が原文どおり届くか
  - `WSLENV` の env が届くか
  - Claude Code が helper をシェル経由で実行するか
  - Bash tool から秘密 env が見えるか (キー名の有無だけを記録する)
- [x] **SH-001** [SH] **AD-041 を起票する**「X-4 の起動設定を X-1 の起動ゲートに載せる」。範囲は plan「ADR」節の (a)〜(h) と Confirmation (ExitPlanMode)。AD-041 の該当節への pointer を次の 6 箇所に足す。
  - 005 contracts C-4 / C-5
  - 005 data-model §7 / §8
  - 007 contracts C-5 (provider-registration.md:55-57)
  - `agent-session.ts:86` のコメント

  AD-039 調査結果 §3「env-passthrough は秘密なし」の訂正は AD-042 に記録する。**SH-000 の結果を反映し、コード投入前に accepted にする**
- [x] **SH-002** [SH] [P] **AD-042 を起票する** (軽量)「AD-005 の型精緻化と AD-039 D4 の失効を記録」。対象は `CredentialRef` / `configDir: HostPath|WslUncPath` (X-3) と、`ModelEntry.supportedEffortLevels` / `DerivedLaunchEnv.forwardKeys` / `ResolvedCredential.helperRuntimePath` / `passthroughValues` (本 feature)。あわせて roadmap X-3 行の follow-up ポインタを閉じる。**BE-008 / BE-031 の前に accepted にする**
- [x] **SH-003** [SH] [P] **glossary を追随させる** (Principle XIV。コード投入前)
  - 起動軸 / 依存解決 / 越境警告 (Cross-boundary の派生語として) / SafePermissionMode / Preset を追記する (Ref は AD-041)
  - `LaunchInput` の定義を更新する: 安全 3 値、model / effort、Counterexample「昇格 3 値を型で持てない」
  - `SessionLaunchConfig` に「X-4 は 6 軸を実装」と注記する
  - `DerivedLaunchEnv` に forwardKeys と AD-041 (b)(e) の読み替えを追記する
  - `RuntimeLaunchSpec` の接頭引数を `--exec` 形に改める (Ref: AD-041 (f))
  - 「転送キー (forwardKeys)」「転送禁止キー」を見出しとして新規登録する
- [x] **SH-004** [BE] [P] `domain/session/launch-config.ts` — 共有述語を置く (I/O なし)
  - `SessionLaunchConfig`: folder / runtime は必須、provider / model / effort は `null` = 既定
  - `SafePermissionMode` / `isSafePermissionMode` / `assertSafePermissionMode`
  - `isValidPresetName` / `normalizePresetName` (trim + NFC)
  - `isValidLaunchConfig` (モデル / effort の述語は SH-005 のものを import する)
- [x] **SH-005** [BE] [P] `domain/provider` — provider 側の述語と型 (session はこれを import する)
  - `model-catalog.ts`: `EffortLevel` / `isValidModelId` (文字種 allowlist、先頭 `-` 禁止) / `isValidEffortLevels` (enum・重複なし・5 件以下)
  - `forward-env.ts` (述語と集合は plan の domain 節のとおり)
    - `makeForbiddenForwardKey(transportKeys)`: 大文字小文字を区別しない。transport 固有のキーは infra から注入する
    - `isValidForwardKeyName` / `isWindowsPathValue`
    - `PASSTHROUGH_VAR_ALLOWLIST`: detector の `CREDENTIAL_ENV_NAMES` を domain に移し、`CLAUDE_CONFIG_DIR` を除く
    - 表駆動の pin テスト: 実名 / prefix / 大文字小文字 / `CLAUDE_CODE_SHELL_PREFIX` / `CLAUDE_CONFIG_DIR` / `TMPDIR`
  - `types.ts`
    - `ModelEntry.supportedEffortLevels?` を足す
    - `ResolvedCredential.helperRuntimePath?: RuntimePath` (`awsCredentialExportPath` を置換) を足す
    - `passthroughValues?` を足す
    - `DerivedLaunchEnv.forwardKeys` を足す
  - agents 側に、`EffortLevel` / `SafePermissionMode` と SDK 型の相互代入・包含 assert を置く

## US-1 — 軸を選んでセッションを起動する (P1)

**独立検証**:

- 依存解決の純粋関数の単体
- fake launcher で、X-1 の launch が検証済み config で呼ばれることを確認する
- main 起動ゲートで無効な config が拒否されることを確認する
- renderer 単体で表示を確認する

### Backend
- [x] **BE-001** [BE] `domain/session/launch-resolution.ts` — `resolveLaunchAxes(draft, facts) → { draft, resets, blockers }` (越境は DTO の `boundary` で判定する。pr-gate R1 C-001)。純粋関数で、renderer と main が同じ関数を呼ぶ
  - facts: フォルダ / ランタイムの存在・実行状態、folder↔runtime の distro 整合、到達可能 Provider、カタログ、対応 effort
  - provider / model / effort の無効値は既定へ戻す。provider の reset は `requiresConfirmation`
  - フォルダ / ランタイムの不備・distro 不一致は blocker にする
  - 対応 effort が無いモデルは既定のみにする
- [x] **BE-002** [BE] `domain/session/agent-session.ts` — `LaunchInput` に `model?` / `effort?` / `permissionMode: SafePermissionMode` / `settings?` を足す (`'default'` リテラルを拡張)
- [x] **BE-003** [BE] `agents/session-core.ts`
  - `QUERY_OPTION_KEYS` に `'model'` / `'effort'` を足す
  - `buildQueryOptions` の permissionMode を `assertSafePermissionMode` 経由にする
  - **pin テスト**: `[...QUERY_OPTION_KEYS].sort()` を AD-041 の集合リテラルと一致させる
  - 既存の「`permissionMode: 'default'` 固定」の assert は削らず、「安全 3 値外は throw」に置き換えて残す
- [x] **BE-004** [BE] `agents/sdk-agent-session.ts` — launch メッセージを `{kind:'launch', spec, options}` に広げる
  - `decodeLaunchSpec` で options を共有述語 + `isHelperSettings` で再検証し、未知キーを捨て、不正なら起動を拒否する
  - settings 値にバックスラッシュ検査を掛ける
  - `:336` で `buildQueryOptions` に settings / model / effort を渡す (query 直前の 2 キー assert が効くことを確認。X-3 contracts C-4)
  - `session-spawner.ts` の postMessage も対応させる
  - decoder の負例テストを付ける
- [x] **BE-005** [BE] `main/app/validate.ts` — `checkLaunchConfig` (`isValidLaunchConfig` を呼ぶ)。`session-ipc.ts` の inline typeof を置換する
- [x] **BE-006** [BE] `session-launch-service.ts` + `composition-root.ts` — `launch(config)` / `prepareLaunch(config)`
  - **main の facts で `resolveLaunchAxes` を再評価**し、blocker / 確認要の reset があれば理由キーで拒否する
  - provider あり: `providers.deriveEnv(providerId, runtimeId)` を呼び、null なら `provider-unavailable`
  - provider が既定: X-1 の curated base だけを使う
  - spec.env だけを `composeLaunchEnv` (BE-009) にする。**fork env は `buildLaunchEnv` のまま**
  - `LaunchFailureReason` に `invalid-config` / `provider-unavailable` / `needs-confirmation` を足す (message に値を含めない)。最初の応答より前の SDK / claude の拒否は既存の `launch-failed` にする
  - 拒否理由キーを既存のログ経路に 1 行出す (値は含めない)
  - 単一セッション規則は維持する
- [x] **BE-007** [BE] IPC の 5 面 (capability / preload / ipc / e2e-capability / test-support) を `launchSession(config)` へ変える (`handle()` 経由)
- [x] **BE-008** [BE] [P] `checkProviderDraft` / `checkProviderPatch` / `provider-record` — `models[].id` / `inferenceProfileId` を `isValidModelId`、`supportedEffortLevels` を `isValidEffortLevels` で検証する。**両者で同じ述語・同じ上限**を使う (write/read 対称。SC-010)
- [x] **BE-009** [BE] env の転送キー集合と WSL への配送 (WSL 固有の処理は infra/runtime に閉じる)
  - `derive-env.ts` (X-3 改修)
    - `forwardKeys` を返す (方式固有の実名キー + 採用 extraEnv + env-passthrough の varNames。curated base のキーは含めない)
    - extraEnv は、転送禁止キーと Windows パス値を拒否にする。`DERIVATION_CONTROLLED_KEYS` の締め出しは維持する
    - env-passthrough は `resolved.passthroughValues` を注入する。varNames は `PASSTHROUGH_VAR_ALLOWLIST` の範囲に限る
    - `derive-env.ts:8-10,86` のヘッダとコメントを追随させる
  - `infra/runtime/launch-spec.ts`
    - `composeLaunchEnv(baseEnv, derived) → env`: `WSLENV` は `forwardKeys` + `/u` だけにし、base 側の `WSLENV` は捨てる。禁止キーや名前規則の違反は throw する
    - `buildRuntimeLaunchSpec({ baseEnv, launchEnv, ... })`: wsl.exe の解決は `baseEnv` だけで行い、prefixArgs を `--exec` 形にする (SH-000 の結果に従う。`--exec` は既存の許可形)
    - `LAUNCH_ENV_DENY_PATTERN` は passthrough 側にだけ掛ける
    - `agent-session.ts:84` のコメントを更新する
  - `infra/provider/*`: env-passthrough の varNames の値を process.env から取る
  - agents decoder では WSLENV を解釈しない (agents は WSL-free)。WSLENV の正しさは `composeLaunchEnv` と、その単体テストが担う

### Frontend
- [x] **FE-001** [FE] `features/session/LaunchEntry` を起動設定ダイアログに広げる (`LaunchDialog.tsx` に改名)
  - 軸: フォルダ / WSL ランタイム / Provider (`listReachableProviders` で絞り、除外理由を表示) / モデル (「既定」+ カタログ) / effort (モデル対応値) / 権限モード (安全 3 値)
  - 軸変更ごとに `resolveLaunchAxes` を呼んで reset を通知し、blocker があれば起動ボタンを無効にする (停止中のランタイムには再評価ボタンを付ける)
  - provider の reset が残っていれば、起動時に確認する (拒否したら Provider 軸を未確定にして戻る)
  - 起動が確立 (最初の応答) するまで入力を保持し、`launch-failed` を含むどの失敗でも理由キーの文言を出して入力を復元する
- [x] **FE-002** [FE] `useLiveSession.launch` を config オブジェクト引数に変える
- [x] **FE-003** [FE] [P] `features/provider/ProviderScreen` — モデルカタログの手入力編集 (モデル ID / 表示名 / inference profile ID / 対応 effort) (FR-017)
- [x] **FE-004** [FE] [P] `labels.ts` に次の文言を置く (Principle XV)
  - 軸ラベル
  - reset / blocker (停止中は「distro を起動してから再評価」) / 失敗理由キーの文言
  - Provider reset の確認文言 (「既定 Provider では distro の claude の既定資格情報が使われる」)
  - `dontAsk` の意味 (承認カードが出ず、事前承認が無ければ拒否)
  - 空状態と次の一手
- [x] **FE-005** [FE] renderer 単体テスト
  - 除外理由の表示
  - reset 通知と blocker による起動ボタン無効
  - 安全 3 値だけが出ること
  - `dontAsk` の説明
  - Provider reset の確認 (承認 → 既定 Provider で起動 / 拒否 → 未確定で戻る)
  - 失敗理由の表示と入力保持 (`system/init` の受信前に SDK が拒否した `launch-failed` と、確立前の中断で設定を保持したままダイアログを開き直すケースを含む)
  - 停止中ランタイムで再評価ボタンを押すと、facts を取り直して blocker が更新される
  - カタログ編集
  - 空状態

## US-2 — プリセットを保存・適用する (P1)

**独立検証**: preset 永続層のラウンドトリップ + 秘密非混入の assert + write/read 対称 + E2E 1 本。

### Backend
- [x] **BE-010** [BE] `domain/session/preset.ts` — `Preset = { id, name, config, updatedAt }`
- [x] **BE-011** [BE] `infra/settings/preset-record.ts` / `preset-store.ts` — provider-store と 1:1 にする (schemaVersion / 上書き前退避 / 一意 temp / id 一意)
  - record は allow-list キーのみとし、**値を `isValidLaunchConfig` で検証する** (昇格モード・不正 id を読み取りで拒否)
  - **秘密キーを持たない**
- [x] **BE-012** [BE] `main/app/preset-service.ts`
  - list / save (同名は上書き確認) / apply (`resolveLaunchAxes` の結果を返す。FR-011) / remove (既知 id と完全一致で照合)
  - `.dependency-cruiser.js` の `services-not-to-io` に実名を足す
- [x] **BE-013** [BE] IPC の 5 面に `listPresets` / `savePreset` / `removePreset` を足す (`handle()` 経由)。`checkPreset` (validate.ts。名前は `isValidPresetName`、同名判定は `normalizePresetName`、件数上限は 100、config は共有述語) を置く。preset-record も同じ述語を使う

### Frontend
- [x] **FE-010** [FE] `features/session/PresetPanel` + renderer 単体
  - 一覧 (更新日時降順) / 保存 (名前入力、同名は上書き確認) / 適用 / 削除 / 空状態
  - 適用後の reset を通知する
  - provider が reset された場合は起動前に確認する

## US-3 — 越境警告と依存解決の境界 (P2)

**独立検証**: 依存解決の境界値の単体 + 越境警告の renderer 単体。

### Backend
- [x] **BE-020** [BE] `launch-resolution.test.ts` — 境界値を網羅する
  - ランタイム変更 → 到達不可 Provider が既定へ (確認要)
  - Provider 変更 → カタログ外モデルが既定へ
  - モデル変更 → 非対応 effort が既定へ
  - folder↔runtime の distro 不一致 → blocker
  - 停止中ランタイム → blocker
  - 対応 effort なし → 既定のみ
  - 無効値のまま起動されない (SC-002)

### Frontend
- [x] **FE-020** [FE] ダイアログで越境警告を出す + renderer 単体 (SC-008)
  - 既存の解決結果 DTO (ResolutionScreen と同じ IPC 形) の `boundary === 'cross'` で警告し、`recommendation.impact` を表示する
  - **起動ボタンは有効のまま** (FR-008 / AD-016)

## US-4 — 導出 env と config-dir の実起動配線 (P2)

**独立検証**: `composeLaunchEnv` / `resolveConfigDirPath` / helperPath 分類の単体 + distro 内の実機観測。

### Backend
- [x] **BE-030** [BE] `domain/provider/helper-path.ts` — `resolveConfigDirPath` を実装する (plan の旧名 `resolveConfigDirRuntimePath` を composition-root ではなく domain に置いた) (変換不能は null で、X-3 deriveEnv の fail-closed に倒す)
  - host configDir: `runtimePathOps.fromHost`
  - UNC configDir: `runtimePathOps.fromUnc` + `isSameDistro(ns, runtime.id)`
  - `resolveCwd` とは別の変換実装を作らない
- [x] **BE-031** [BE] `domain/provider/helper-path.ts` — `classifyHelperPath(raw, runtime) → RuntimePath | null` (FR-014)
  - POSIX 絶対パスはそのまま、HostPath は `fromHost` で変換、それ以外は null
  - 結果を文字種 allowlist `^/[A-Za-z0-9._/+@-]+$` で照合する
  - **`assessReachability` (helper 系 3 方式) と main/app/provider-service の `resolved.helperRuntimePath` の両方がこれを呼ぶ**
  - `derive-env.ts:63,66,70` を `resolved.helperRuntimePath` 経由にし、`?? cred.helperPath` を撤去する
  - reachability.ts:51 の distro 比較を `isSameDistro` に揃える
- [x] **BE-032** [BE] [P] write/read 対称の検証 (X-3 SEC-L-201)
  - 対象: extraEnv の KEY と値 (転送禁止キー / 名前規則 / 資格情報 denylist / Windows パス値)、env-passthrough の varNames (`PASSTHROUGH_VAR_ALLOWLIST`)、helperPath、導出 env 値の制御文字
  - 新しい規則に反する既存レコードは、退避したうえで `invalid-record` にする (spec Assumptions)。provider-store の単体に「X-4 以前のレコード」を 1 ケース足す
  - 3 箇所で同じ述語を使う: validate (`checkProviderDraft` / `checkProviderPatch`) / provider-record / composeLaunchEnv

## Shared Tasks (機械強制・docs・検証)

- [x] **SH-010** [SH] `check.mjs` 項目 16 — backstop を足す
  - **値位置の `permissionMode:` と shorthand `{ permissionMode }` が `assertSafePermissionMode(` を通らなければ違反**にする。型位置 (interface / type literal) は除外する
  - 違反 fixture として `sdk-permission-mode-unwrapped` / `sdk-permission-mode-shorthand` を足す。型宣言は非違反の確認に使う
  - `expected.mjs` に行を足す
  - 違反メッセージ・`allowlists.mjs` の説明文を「安全 3 値 (AD-041)」に直す
- [x] **SH-011** [SH] 起動 argv の退行検出 (項目 2 は launch-spec.ts を走査しないため)
  - `buildRuntimeLaunchSpec` の pin テスト: prefixArgs の末尾が `--exec` で、`--` / `-u` / `--user` を含まない
  - 違反 fixture は置かない (項目 2 は `-u root` を構造的に検出できない)
  - 項目 2 の走査対象を広げるかどうかの判断を AD-041 (f) に記録する
  - X-1 のテストを書き換える: `launch-spec.test.ts:68,70`、`session-core.test.ts:141,163-168` (`'--'` 形の fixture と argv の完全一致 assert)
  - `WSL_FREE_DIRECTORIES` に `preset-service.ts` を足す
- [x] **SH-012** [SH] [P] `expected.mjs` UNDETECTED_NOTES の `nextFeature` を付け替え、howToClose に理由を 1 行足す
  - `ui-path-concat` → X-6
  - `sdk-forbidden-call-alias` → X-6
  - `principle-v-unknown-shape-secret` → X-7
- [x] **SH-013** [SH] [P] コード内コメントの宛先を更新する — `agent-session.ts:192` / `session-core.ts:143` / `ApprovalCard.tsx:14` / `useLiveSession.ts:264` の「capability スコープは X-4」を I-3 へ
- [x] **SH-014** [SH] [P] docs を追随させる
  - session charter
    - Related Specs に 008 を足し、「X-4 未着手」を更新する
    - 業務ルールに「X-4 時点は安全 3 値のみ・連動は I-3」、Journey 2 に「上限は X-6」を書く
    - KPI「再利用率」に「計測経路は O-3 が作る (X-4 では未計測)」と書く
    - SPIKE-6 の完了を反映する
  - provider charter: L94「helper 生成は X-4 に帰属」の宛先を X-7 に直し、Related Specs に 008 (FR-017 / AD-042) を足す
  - `docs/domains/_overview.md` の Feature 帰属表に X-6 (`session`) / X-7 (`provider`) を足す
  - roadmap X-4 行: 「権限モード 6 値」→ 安全 3 値 + AD-041、AD-017 を外して I-1 へ
  - roadmap O-3 行: KPI「再利用率」の計測経路を義務として登録する
  - X-1 research R-05 / plan B-4 の宛先 (X-6) を AD-041 に記録する
- [x] **SH-015** [SH] [P] constitution.md L845 (Existing violations 表「項目 5 は X-4 で対象が生じる」) の宛先を I-1 に直す。L834 の先例に従い、Principle と Verification には触れないので版は上げない。根拠は AD-041 (d)
- [x] **SH-020** [SH] Vitest — SC-001〜SC-010 の単体。対象:
  - 依存解決 / main 起動ゲートの拒否
  - 安全 3 値の assert / decoder の負例
  - preset のラウンドトリップ・秘密非混入・read 側の拒否
  - `composeLaunchEnv`
    - WSLENV = `forwardKeys` + `/u` だけになる
    - **curated base のキー (`TEMP` / `TMP` / `SystemRoot` / `windir`) と `WSL_UTF8` が WSLENV に 0**
    - base の WSLENV が 0
    - 禁止キーを含む extraEnv は拒否される
    - extraEnv の `SystemRoot` 上書きが wsl.exe の解決に効かない
  - `prepareLaunch`: fork env に導出キーが 0
  - env-passthrough の varNames が forwardKeys に入り、値が process.env から来る。`varNames: ['ANTHROPIC_API_KEY', 'PATH']` では前者が forwardKeys に入り、後者は拒否される
  - extraEnv の `CLAUDE_CODE_SHELL_PREFIX` / `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_USE_BEDROCK` / `TMPDIR` / `SYSTEMROOT` / `WINDIR` と Windows パス値は、いずれも拒否される
  - プリセット上限の境界 (100 件目は保存できる / 101 件目は拒否)
  - `resolveConfigDirPath` / `classifyHelperPath`
    - 空白・括弧を含むパスは拒否される
    - reachability と起動の判定が一致する
  - model ID のメタ文字負例 / カタログの write-read 対称
  - 起動が X-1 launch を呼ぶこと / `--exec` 形
  - 実行中セッションが Provider 削除の影響を受けないこと (起動時スナップショット)
- [x] **SH-021** [SH] 機械検証 — lint / **typecheck (`tsc --noEmit` node + web)** / depcruise / check:constitution / test / test:rules を全緑にする <!-- [auto-added: TypeScript] -->
- [x] **SH-022** [SH] E2E — 以下の 3 本
  - 到達不可 Provider が選択肢に 0 件 (X-3 SC-004 の E2E leg)、かつ Provider 切替でモデル選択肢が変わる
  - 上流変更で下流が既定へ戻り、通知される (charter KPI「依存解決の正しさ」)
  - プリセットの保存 → 適用 → 起動 (削除済み Provider を含むプリセットでは確認が出る)
- [x] **SH-023** [SH] quickstart の実機記録 (`quickstart-results.md`)
  - pr-gate R1 でいったん [ ] に戻した。
  - 2026-10-01 の追補 #5〜#8 (plan / 孤児なし / config-dir の forwardKeys と transcript) で再確認した。
  - api-key 系の方式に固有の観測は、[USER] の判断で X-7 の quickstart へ繰り越した。
  - ダイアログから起動する / プリセットを保存・適用する (越境警告は SC-008 の renderer 単体で確認。E2E の stub は DTO を返さない)
  - `dontAsk` の拒否表示
  - **config-dir Provider で起動し、transcript が選んだ config dir 配下に書かれる** (SC-006)
  - **Provider の `forwardKeys` が distro 内から見え、`printenv TMP TEMP` は空** (SC-007。config-dir で観測済み。api-key / aws-profile / env-passthrough に固有の観測は → X-7 へ繰越)
  - **メタ文字を含む引数が展開されない** (SC-009)
  - **`plan` で起動し、ExitPlanMode を承認した後もモードが昇格しない** (AD-041 Confirmation)
  - **`--exec` 起動後に強制終了し、distro 内に claude が残らない** (`ps` で確認。AD-041 (f) / AD-018 §3)
  - 注意: helper の stdout・env の値・秘密は記録しない。記録するのは exit code とキー名だけ

## pr-gate 由来の追加

pr-gate の指摘を直すときに足したもの。詳細は `pr-gate.md.round1` / `pr-gate.md.round2` を参照。

- [x] **BE-040** [BE] `providerLoadIssues` IPC (AD-042 Decision 4 の退避通知)
  - 入力は無い。戻り値は `{ skippedOnLoad, wholeFileUnreadable, storeNewerVersion }`。
  - capability / preload / ipc / e2e-capability / test-support の 5 面を揃え、`handle()` で送信元を検証する。
  - ProviderScreen に 1 行表示する。
- [x] **BE-041** [BE] 転送禁止キーの判定述語を composition-root から注入する (AD-041 (e) 3)。provider-record / validate は infra/runtime を import しない
- [x] **FE-040** [FE] 起動ダイアログの読み込み中・失敗の状態
  - 到達可能性: 取得中と失敗時は「既定」だけを選べる (fail-closed)。失敗時は専用の文言と再試行を出す。
  - 越境の DTO: 取得中は起動を保留する。unreachable は起動不可にする。
  - フォルダとランタイム: 読み込み中、読み込み失敗、再評価中の表示を出す。

## 範囲外の修正 (quickstart で見つかった既存の不具合)

X-4 の起動を実機で成立させるのに要るので、同じ PR に含める。詳細は `quickstart-results.md` の B-1 / B-2。

- [x] **FIX-001** [FE] B-1 (R-1 由来): `features/workspace-folders/useFolders.ts` — ブラウズトークンを ref で持ち、子フォルダへの移動で「読み込み中」のまま固まらないようにする。回帰テストを付ける
- [x] **FIX-002** [BE] B-2 (X-1 由来): `agents/sdk-agent-session.ts` — 最初のプロンプトを送った後のメッセージでだけ `ready` に遷移する (claude 2.1.285 が起動直後に `system/commands_changed` を出すため)。`launching` の表示を「準備完了 — プロンプトを送ると始まります」に変える。回帰テストを付ける。005 quickstart-results の B-4 に注記する

## 依存と順序

1. **SH-000 (実機確認) → SH-001 (AD-041)**。SH-003 (glossary) もコード投入前に済ませる。SH-002 / SH-004 / SH-005 は並行してよい
2. US-1 の順序: BE-001〜004 / BE-009 (domain / agents / infra) → BE-005〜007 (app / IPC) → FE-001〜005
3. US-2 は SH-004 と BE-001 の後、US-3 は BE-001 の後に着手する。BE-008 / BE-031 は SH-002 (AD-042) の accepted 後に着手する
4. Shared 検証 (SH-020〜023) は全 US の後に行う
