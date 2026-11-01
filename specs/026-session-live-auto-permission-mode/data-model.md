# Data Model: 権限モードの Auto (起動と実行中)

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Contracts**: [contracts/ipc-auto-permission-mode.md](./contracts/ipc-auto-permission-mode.md)

本書が規則の正本である。plan・tasks・ADR (AD-066) は本書を参照し、規則を書き写さない。行番号は 026 の枝 (e9dcfb8。025 / 024 のマージ後) のもの (2026-10-30 に載せ直した。research の冒頭)。

## §0 変えないもの

- `acceptEdits` / `bypassPermissions` へ移る経路は、起動・実行中とも 0 件のまま (FR-004)。項目 16 の昇格の値の文字列リテラルの禁止 (`PERMISSION_MODE_ESCALATION_VALUES` の 3 値) も残す
- `isAutoModeAllowed` / `autoModeStatus` / `deriveAutoModeSafe` / `fixedCapabilities` と DTO の不変条件 (`autoModeAllowed` をゲートに、`autoModeStatus` を表示に使う)
- `IPC_CHANNELS` の数と並び。`SessionControl` の種類 (9。025 の `list-models` を含む)。`QUERY_MUTATION_METHODS` (20)。`QUERY_OPTION_KEYS` (16。024)。`SessionEvent` の種類。`SessionLaunchConfig` のキー (10。024)・`PresetLaunchConfig` のキー (9)
- 権限モードの名前の表 (`PERMISSION_MODE_NAMES`。Claude Code の表記。AD-065 Decision 3) と照合の版の定数。説明は付けない
- 実行中に変えた権限モードをプリセット・`lastConfig`・再開の初期値に残さない (AD-062 Consequences。spec Out of Scope)
- 023 の実行中の変更の受け付けの規則 (`liveSettingBlocker`)・待ちの表・`control-result`・失敗の 1 行の表示

## §1 型と述語 (domain。`src/domain/session/launch-config.ts`)

| 名前 | 定義 | 使う所 |
|---|---|---|
| `SafePermissionMode` | `'default' \| 'plan' \| 'dontAsk'` (今のまま) | 帯の条件 (§5)。確認の条件の補集合 |
| `SAFE_PERMISSION_MODES` / `isSafePermissionMode` | 今のまま | 帯・resume の init の検査 (§3.2) |
| **`SelectablePermissionMode`** (新設) | `SafePermissionMode \| 'auto'` (許可の 4 値) | 起動の設定・起動の query・実行中の変更の値の型 |
| **`SELECTABLE_PERMISSION_MODES`** (新設) | `['default', 'plan', 'dontAsk', 'auto'] as const` (選択肢の並び。安全 3 値の後に `auto`) | 選択肢の描画 |
| **`isSelectablePermissionMode(v: unknown)`** (新設) | 4 値のどれかと厳密に等しい | main の検査・agents の decoder・renderer の選択 |
| **`assertSelectablePermissionMode(v: unknown)`** (新設) | 通れば値を返し、外れたら `throw` (文言は「許可の 4 値の外の権限モード (AD-066)」) | agents が SDK に渡す直前 (項目 16 の許可の包み) |
| `assertSafePermissionMode` | **消す** (使い手を全部 `assertSelectablePermissionMode` に移す。research P-2) | — |
| **`isAutoPermissionMode(v: unknown): v is 'auto'`** (新設) | `v === 'auto'` | 帯の選び方 (§5.2)。renderer に `'auto'` の綴りを書かない (research P-13) |
| **`requiresAutoModeConfirmation(mode, autoModeAllowed: boolean)`** (新設) | `isAutoPermissionMode(mode) && autoModeAllowed !== true` | main の印の検査 (§4)・renderer の確認 (§6)。true で確認を省くのは spec U-6 (受け入れたリスク) |
| **`resumeInitialPermissionMode(mode: SelectablePermissionMode): SafePermissionMode`** (新設) | `auto` なら `'default'`、他はそのまま | 再開の初期値 (§7) |

- `hasValidBaseAxes` の最後 (`launch-config.ts:181`) を `isSelectablePermissionMode(c.permissionMode)` にする。版 1 のプリセット・版 2 / 3 のプリセット・起動の 3 つの述語が共有するので、3 つとも許可の 4 値に広がる (版 1 / 2 のファイルに `auto` は書かれていないので、読み込みの結果は変わらない)
- 型を `SelectablePermissionMode` に広げる所: `SessionLaunchConfig.permissionMode` (`launch-config.ts:60`)・`LaunchDraft.permissionMode` (`launch-resolution.ts:26`)・`LaunchQueryOptions.permissionMode` (`agent-session.ts:130`)・`SessionControl` の `set-permission-mode` の `mode` (`:360`)・`AgentSession.setPermissionMode` (`:387`)・`Capability.setSessionPermissionMode` の `mode` (`capability.ts:227`)・`session-core.ts` (`:145`, `:176`)・`live-signals.ts` (`:201`, `:246`)・`session-launch-service.ts` (`:141`, `:206`)・`ipc.ts:158`・`session-ipc.ts:80`・`validate.ts:441`・`LiveComposerSettings` の `configPermissionMode` / `onSelectPermissionMode` (`LivePane.tsx:420`, `:429`)・`LiveSettingsControls` の `onSelectPermissionMode` (`:37`, `:241`)・`useLiveSession.ts` (`:54`, `:108`)・`running-session-store.ts` の `setPermissionMode` (`:129`)・renderer の文言の `Record` (§9)
- **`autoModeAllowed` が true の意味** (spec U-6): 「そのランタイムで sandbox が使える」(bubblewrap のある WSL など。`capabilities.ts:85-90`) であって、「このセッションが隔離の中で動いている」ではない。Closta は I-3 まで sandbox を有効にしない (`QUERY_OPTION_KEYS` にも settings の許可リストにも sandbox が無い)。true で確認を省くのは利用者が 2026-10-31 に受け入れたリスクで、本書の文言 (§5.3 / §9) は true でも隔離されていると読める文にしない。`requiresAutoModeConfirmation` の注記 (JSDoc) にもこの意味と U-6 / AD-066 を書く
- **置き場所は session の暫定** (design-gate H-004): `requiresAutoModeConfirmation` は Principle III の改定後の要求 (確認を挟むか) の判定で、ゲートの方針にあたる。X-10 では `src/domain/session/launch-config.ts` に暫定で置き、I-3 で isolation の判定 (`SAFE_SANDBOX_KINDS` を移す先。AD-025 §5) の隣へ移す。isolation charter と session charter にこの暫定を書く (§11)
- `sdk-agent-session.ts:122` の型の検査 (`safeModeIsSdkMode`) を「`SelectablePermissionMode` が SDK の `PermissionMode` の部分集合」に直す

## §2 拒否の理由のキー

| 集合 | 今 | 足すキー | 後 | 固定 |
|---|---:|---|---:|---|
| `LaunchPreflightReason` / `LAUNCH_PREFLIGHT_REASONS` (`agent-session.ts:97-103`) | 3 | `auto-mode-unconfirmed` | 4 | 起動の拒否の理由の合計は 24 → 25 (注記の数を直す)。文言は `LAUNCH_REJECT_LABELS` (§9) |
| `LIVE_SETTING_FAILURES` (`live-settings.ts:50-62`) | 11 | `auto-mode-unconfirmed` (末尾) | 12 | `live-settings.test.ts` の並びの固定を直す。「集合を変えるには ADR が要る (AD-062)」の注記に AD-066 を足す。文言は `LIVE_SETTING_LABELS` (§9) |

`ResumeOutcome` の `rejected` は `SessionLaunchRejectReason` を含むので、再開の拒否にも同じキーが出る (型の変更は要らない)。

## §3 agents (セッションスレッド)

### §3.1 値の検査

| 場所 | 今 | 後 |
|---|---|---|
| `decodeLaunchOptions` (`sdk-agent-session.ts:322`, `:348`) | `isSafePermissionMode` / `assertSafePermissionMode` | `isSelectablePermissionMode` / `assertSelectablePermissionMode` |
| `buildQueryOptions` の呼び出しの `permissionMode:` (`:890`) | `assertSafePermissionMode(launchOptions.permissionMode)` | `assertSelectablePermissionMode(...)` |
| 制御シンクの `set-permission-mode` (`:797`) | `.setPermissionMode(assertSafePermissionMode(mode))` | `.setPermissionMode(assertSelectablePermissionMode(mode))`。成功で `signals.onPermissionModeApplied(mode)` は今のまま。`:181` の注記も直す |
| decoder の `set-permission-mode` (`session-core.ts:557`) | `isSafePermissionMode(mode)` | `isSelectablePermissionMode(mode)` |
| `session-core.ts:257` (`buildQueryOptions`。注記 `:142`, `:223`) | `assertSafePermissionMode(deps.permissionMode)` | `assertSelectablePermissionMode(...)` |

agents は確認の印を受けず、見ない。`'auto'` の文字列を agents のファイルに書かない (項目 16 の P1 が落とす)。

### §3.2 再開の init の検査 (`sdk-agent-session.ts:986`)

最初の `init` で、再開 (`launchOptions.resume !== undefined`) のときに次のどちらでもなければ `fail('resume-failed')`:

1. `isSafePermissionMode(init.permissionMode)`
2. `init.permissionMode === launchOptions.permissionMode` (起動で頼んだ値。`auto` で頼んだ再開が `auto` で戻るのはこちら)

`default` で頼んだ再開が `auto` で戻る・`bypassPermissions` / `acceptEdits` / 不明な値で戻るのは今どおり失敗 (research P-5)。

## §4 main (確認の印の検査)

### §4.1 IPC の印 (contracts C-1〜C-3)

- 3 つの口の 3 つ目の引数 `autoModeAcknowledged`。`args[2] === true` だけを承諾とし、他の値はすべて「承諾なし」(起動・変更そのものは拒否しない)
- `checkSetPermissionModeArgs` (`validate.ts:436-443`) は `args.length` が 2 または 3、`isValidSessionId(args[0])`、`isSelectablePermissionMode(args[1])` を求める (3 つ目の型は問わない)
- `checkLaunchConfig` / `checkResumeRequest` / `checkPreset` は `isValidLaunchConfig` を通るので、許可の 4 値に自動で広がる

### §4.2 判定 (`src/main/app/session-launch-service.ts` だけ)

新しい必須の依存 `autoModeAllowed(runtimeId: string): boolean`。composition-root は `runtimes.snapshot()` から記述子を引いて `isAutoModeAllowed(descriptor.capabilities)` を返し、見つからなければ `false`。e2e は `knownRuntimes` から同じ関数で作る。

| 操作 | 判定の位置 | 確認が要るのに印が無い |
|---|---|---|
| `launch(config, ack)` | `startSession` (`session-launch-service.ts:492-550`) の先頭 (`:496` の `disposing` の検査の直後、`:497` の枠の予約の前。同期) | `{ status: 'rejected', reason: 'auto-mode-unconfirmed' }`。`prepareLaunch` を呼ばない |
| `resume(config, resolved, ack)` | 同じ (`already-running` / `conversation-running` の判定の後、`startSession` の中) | 同じ。`resume-service` は `ack` を素通しする |
| `setPermissionMode(sessionId, mode, ack)` | `:620-626` の `liveSettingBlocker` の判定の後、`requestControl` の前。ランタイムは `Entry.axes.runtimeId` | `{ ok: false, reason: 'auto-mode-unconfirmed' }`。制御を送らない |

「確認が要る」は `requiresAutoModeConfirmation(mode, deps.autoModeAllowed(runtimeId))` (§1)。安全 3 値と、`autoModeAllowed` が true のランタイムの `auto` は印を見ない (true は sandbox を使えるという意味で、隔離の中で動くという意味ではない。spec U-6 で受け入れたリスク)。

### §4.3 プリセット (`src/main/infra/settings/`)

- `PRESET_SCHEMA_VERSION` を **2 → 3** にし、`SUPPORTED_PRESET_SCHEMA_VERSIONS` を `[1, 2, 3]` にする (`preset-record.ts:27`, `:30`。024 が版 2 にした。research P-7)
- 読み込み: 版 1 は今の読み替え (024。`isValidPresetConfigV1` と既定の補完)。版 2 と 3 は同じ述語 (`isValidPresetConfig`。§1 で 4 値に広がる) で受ける。3 より大きければ `schema-version-unknown`、対応表に無い値は `parse-failed` (今と同じ形。`preset-store.ts:119-127`)
- 書き出し: 3 (版 1 / 2 のファイルは次の `save` で 3 になる)
- プリセットに確認の印を持たせない (印は `SessionLaunchConfig` に無い)

## §5 帯 (renderer。`src/renderer/src/features/shell/CenterBanners.tsx`)

### §5.1 ストアの値 (`running-session-types.ts` / `running-session-store.ts`)

`LiveSessionState` に `chosenPermissionMode: SelectablePermissionMode` を足す。

| 時点 | 値 |
|---|---|
| 起動・再開で行を作った | `config.permissionMode` |
| 実行中の変更の要求を送る (`setPermissionMode` の `beginSetting` と同時) | 要求の値 |
| 要求が失敗した (`ok: false`) | 送る前の値に戻す |
| 成功した | そのまま |

`config` には書き戻さない (§0)。

### §5.2 帯の選び方

`mode = meters.permissionMode` (観測した値。今の `UnsafeModeBanner` と同じ入力)、`chosen = chosenPermissionMode`。

| 条件 | 帯 |
|---|---|
| `isAutoPermissionMode(mode) && isAutoPermissionMode(chosen)` | **`AutoModeBanner`** (新設) |
| 上に当たらず、`mode !== null && !isSafePermissionMode(mode)` | `UnsafeModeBanner` (今のまま) |
| それ以外 | 出さない |

並びは今と同じ位置 (権限モードの帯 → Quota banner → 会話内検索のバー)。2 つの帯が同時に出ることは無い。

### §5.3 `AutoModeBanner` と読み上げの置き場所

`CenterBanners` は key を持たず、`sessionId` が変わっても作り直されない (`CenterBanners.tsx:35-46`)。帯の中に live region と前の値を置くと、mount の時点で既に `auto` なので読み上げが 0 回になり、key の無い `CenterBanners` に置くと別のセッションへの切り替えで読み上げてしまう。live region を中身と同時に挿入するとスクリーンリーダーは読み上げないことが多い (design-gate H-002)。そこで次の形にする。

| 項目 | 規則 |
|---|---|
| 置き場所 | `CenterBanners` は権限モードの帯を `<PermissionModeBanners key={sessionId} sessionId runtimeId />` (新設。`CenterBanners.tsx` の中) で描く。`PermissionModeBanners` は §5.2 の表で視覚の帯 (`AutoModeBanner` / `UnsafeModeBanner` / なし) を選び、**常に** `AutoModeAnnouncer` (下) を描く |
| 視覚の帯 (`AutoModeBanner`) | `role="note"`、`data-testid="auto-mode-banner"`、amber の色 (`text-amber-700 dark:text-amber-400`。破壊的な赤にしない)。文は §9 の `autoModeBanner(PERMISSION_MODE_NAMES.auto)` + Auto の帯の隔離の文 (§9 の `autoModeIsolation(status)`。`UnsafeModeBanner` の隔離の文は使わない) + `autoModeRevert`。live region を持たない |
| 読み上げ (`AutoModeAnnouncer`) | `sr-only` の `role="status"` (`aria-live="polite"`、`data-testid="auto-mode-announcer"`)。**中身が空でも常に mount しておく** (セッションの間 `key={sessionId}` の中で作り直さない)。前の観測の値 (`meters.permissionMode`) を `useRef` で持ち、mount 時に今の値で初期化する |
| 読み上げる条件 | 同じ `sessionId` の mount の間に、前の値が `auto` 以外 (`null` を含む) → 今の値が `auto` に変わり、かつ `chosenPermissionMode` が `auto` (Auto の帯が出る) とき、帯の文 (隔離の文を含む) を live region に入れる。今の値が `auto` から外れたら中身を空にする (次の切り替えでまた読む) |
| 起動直後の `null → auto` | **読み上げる**。Auto で起動したセッションは、行が出来た時点 (`meters.permissionMode` が `null`) で mount され、最初の `meter` で `auto` になる。これは「同じセッションの中で Auto に切り替わった」1 回に数える (quickstart V-1.3) |
| 読み上げない | 別のセッションへ切り替えて、そのセッションが既に `auto` (mount 時に `auto` で初期化)。同じ値の再描画。観測が `auto` でも `chosenPermissionMode` が `auto` でない (今の `UnsafeModeBanner` が `role="alert"` で知らせる) |
| 入力 | 隔離の文は `useRunningSessionsView().runtimeAutoMode(runtimeId)` (表示用。今と同じ)。`autoModeAllowed` を使わない |

## §6 確認 (renderer。`src/renderer/src/features/session/AutoModeConfirmation.tsx` を新設)

### §6.1 部品

| 項目 | 規則 |
|---|---|
| 形 | その場の `role="alertdialog"` の枠 (入れ子の modal にしない)。`aria-labelledby` は見出し、`aria-describedby` は本文 |
| 文 | §9 の `AUTO_MODE_CONFIRMATION_LABELS` (名前は `PERMISSION_MODE_NAMES.auto` を渡す)。本文の 1 文目は `autoModeStatus` で選ぶ (`unavailable` → 隔離なし、それ以外 → 隔離を確かめていない) |
| ボタン | 承諾 (`accept(name)` =「Auto にする」) と「取り消す」。開いたら**取り消しに焦点**。Escape は取り消し (外側の Dialog を閉じない: `stopPropagation`) |
| 入力 | `autoModeStatus` (表示用) と `onAccept` / `onCancel` だけ。判定 (出すか) は呼び出し側が §1 の `requiresAutoModeConfirmation` で行う |

### §6.2 起動の設定 (`LaunchDialog.tsx`)

- 選択肢は `SELECTABLE_PERMISSION_MODES` (4 つ)。`isSelectablePermissionMode` を通った値だけを受ける
- 入力の真偽は `selectedRuntime?.capabilities.autoModeAllowed ?? false` (ゲート用)。文の選び分けは `selectedRuntime?.capabilities.autoModeStatus ?? 'undetermined'`
- 状態 `autoConfirm: null | 'select' | 'launch'` と `autoAckRuntimeId: string | null`。`autoAckRuntimeId` は**このダイアログで今の `auto` の選択を承諾した**ことだけを表し、ダイアログの mount ごとに `null` から始める (`lastConfig` の復元・再開の形の初期値・拒否で作り直したダイアログでも `null`。`useState` の初期値)

| 出来事 | 動き |
|---|---|
| `auto` を選び確認が要る | 下書きを変えず `autoConfirm = 'select'` |
| `auto` を選び確認が要らない (`autoModeAllowed` が true。spec U-6) | そのまま `auto` にする (1 操作)。`autoAckRuntimeId` は変えない |
| `'select'` で承諾 | `permissionMode = 'auto'`、`autoAckRuntimeId = 今のランタイム` |
| 取り消し | 何も変えない (選択は前の値に戻って見える) |
| 権限モードを `auto` 以外にした | `autoAckRuntimeId = null` |
| プリセットの適用 | `autoConfirm = null`、`autoAckRuntimeId = null` (プリセットの `auto` は起動を押した時点で確認する。FR-012) |
| ランタイムの変更 | `autoConfirm = null`、`autoAckRuntimeId = null` |
| `refetch` | `autoConfirm = null`。`autoAckRuntimeId` は消さない (下書きは変わらない) |
| 起動を押す | Provider の確認が要れば先にそれ (今のまま)。次に、確認が要り `autoAckRuntimeId !== launchConfig.runtimeId` なら `autoConfirm = 'launch'` で止める。どちらも済んだら `ack = requiresAutoModeConfirmation(...)` を 3 つ目の引数に載せて送る |
| `'launch'` で承諾 | `autoAckRuntimeId` を記録して起動する |

`ack` は確認が要らないときは `false` を送る (main は見ない)。承諾の後に `default` に戻して起動したときも、確認が要らないので `false` になる。

確認を出さない経路 (`autoModeAllowed` が true) では、起動の設定に Auto の説明の文を足さない (AD-065 Decision 3 の「説明を付けない」のまま)。この経路で利用者が読む文は起動後の Auto の帯 (§5.3 / §9) で、隔離されていないと読める文にする。

### §6.3 composer の左の群 (`LivePane.tsx` / `LiveSettingsControls.tsx`)

025 で実行中の選択は composer の左の群 (`LiveComposerSettings` → `LiveSettingsControls`) に移った (research R-08)。

- 選択肢は `SELECTABLE_PERMISSION_MODES`。今の「安全でない今の値は disabled の選択肢で出す」(`LiveSettingsControls.tsx:210`, `:272`) は `isSelectablePermissionMode` の外 (昇格の 2 値と不明) に狭める。`:248` の述語も `isSelectablePermissionMode` に
- 確認の状態は `LivePane` が持ち、確認は**承認カードと同じ列の上側の枠** (`px-4 pt-3`。`LivePane.tsx:311-336` の並び。承認カード・問いのカードの前) に出す。`LiveComposerSettings` に渡す `onSelectPermissionMode` を `LivePane` の判定の関数に替える
- 入力の真偽は `useRunningSessionsView().runtimeAutoModeAllowed(state.config.runtimeId)` (新設。ゲート用。一覧に無ければ false)。文の選び分けは `runtimeAutoMode(state.config.runtimeId)`

| 出来事 | 動き |
|---|---|
| `auto` を選び確認が要る | 要求を送らず確認を開く (select の表示は `meters` の今の値のまま) |
| 承諾 | `session.setPermissionMode('auto', true)`。確認を閉じ、composer の入力へ焦点を戻す |
| 取り消し | 何も送らない。確認を閉じ、composer の入力へ焦点を戻す |
| 確認が要らない (安全 3 値・`autoModeAllowed` が true のランタイムの `auto`。spec U-6) | すぐ `session.setPermissionMode(mode, false)` |
| 確認の間に `liveSettingBlocker('permission-mode', settingsRow)` が非 null になった | 確認を閉じ、送らない (`LivePane` はセッションごとに描くので、切り替えでも閉じる) |

ストアの `setPermissionMode(sessionId, mode, ack)` (`running-session-store.ts:1016-1026`) は capability の `setSessionPermissionMode(sessionId, mode, ack)` を呼ぶ (§5.1 の `chosenPermissionMode` の更新を含む)。`useLiveSession` の `setPermissionMode(mode, ack)` も同じ引数を通す。どちらも `ack` は必須の `boolean` (§6.4 と同じ理由)。

### §6.4 起動・再開の印の通り道 (renderer)

`LaunchDialog` の `ack` は次の順に素通しする。ストアは印を持たない (行の状態に残さない)。

| 段 | 場所 | 変更 |
|---|---|---|
| 1 | `LaunchDialog.tsx` の `LaunchSource` (`:80-97`) | `launch(config, origin, autoModeAcknowledged: boolean)`・`resumeSession?(request, origin, autoModeAcknowledged: boolean)`。起動の関数 (`:553-567`) は新規の起動 (`:566`) と再開のフォームの送信 (`:563`) の両方で 3 つ目を渡す |
| 2 | `LivePane.tsx` の `LaunchDialogContent` / `NewSessionDialog` (`:89-125`) | `onLaunch={view.launch}` / `onResume={view.resume}` と `LaunchSource` の組み立ての型を新しい引数に合わせる (関数をそのまま渡す) |
| 3 | `RunningSessionsProvider.tsx` の `launch` / `resume` (`:81-98`) と `running-sessions-view.ts` の型 (`:42`, `:47`) | `(config, origin, ack)` / `(request, origin, ack)` を受け、ストアの `launch` / `resume` に渡す |
| 4 | `running-session-store.ts` の `launch` (`:840`) / `resume` (`:882`) | `capability().launchSession(config, origin, ack)` / `resumeSession(request, origin, ack)` |

renderer の中の型 (段 1〜4) では `autoModeAcknowledged` を**必須の `boolean`** にする。省略可能にすると、段の 1 つが引数を落としても tsc が見つけない (関数の型は引数の少ない関数を受け入れるが、必須の引数を渡さない**呼び出し**は落とす)。IPC の口 (`Capability` / preload。contracts C-7) だけは省略可能のままにし、main は欠けを「承諾なし」と読む。

## §7 再開の初期値 (`resume-action.ts`)

再開のダイアログの初期値 (`ResumeDialogState.initial`) を組む所で、権限モードを `resumeInitialPermissionMode(...)` に通す (稼働中の行の `config.permissionMode` を写す `:58` が当たる)。過去の行は今どおり起動の既定。

## §8 Constitution と ADR の文 (実装の PR で入れる)

### §8.1 Principle III (1.5.0 → 1.6.0。MINOR)

- **Statement** (`constitution.md:470`) の 1 文目を次に替える:
  「`capabilities.autoModeSafe !== true` のランタイムで `bypassPermissions` を選択可能にしてはならない。**同じランタイムで Auto (`auto`) を選ぶときは、起動・実行中とも毎回、隔離が無いことを書いた明示の確認を挟み、main は確認の印の無い要求を拒否する** (AD-066)。」
  2 文目以降 (3 値・単一の判定関数・`=== false` の注意・`bypassPermissions` の `allowDangerouslySkipPermissions` と明示確認) は変えない
- **Why** (`:472`) の 2 文目「`Win32Runtime` は sandbox を持たないため (PLAN.md §2.1)、UI 上で選べてしまうこと自体が事故経路になる。」を次に**置き換える** (design-gate H-006。残すと改定後の Statement と矛盾する):
  「`Win32Runtime` は sandbox を持たないため (PLAN.md §2.1)、`bypassPermissions` を UI 上で選べてしまうこと自体が事故経路になる。Auto は分類器が操作ごとに許可・拒否するので、隔離が無くても利用者が確認の上で選ぶことは許す。選んだことと隔離されていないことは、動いている間ずっと帯で示す (AD-066)。」
  1 文目と 3 文目 (軸 3 の理由) は変えない
- **Why** の後に「**暫定の受け入れ** (AD-066 / 026 U-6)」の 1 段落を足す: 「`autoModeSafe === true` は、そのランタイムで sandbox が使えることを表し、Closta がそのセッションで sandbox を有効にしたことは表さない。Closta は I-3 まで sandbox を有効にしないので、`autoModeSafe === true` のランタイムで確認を省いた Auto のセッションも隔離されずに動く。利用者はこれを承知のうえで確認を省くことを選んだ (2026-10-31)。この間、Auto の帯は `autoModeSafe` の値によらず隔離されていると読める文を出さない。sandbox を有効にするか、確認を省き続けるかは I-3 で判断し直す。」
- **Examples** (`:474-476`) を次に替える:
  - ✓ Good: 「`Win32Runtime` 選択時、`bypassPermissions` は選択肢に無く、Auto は確認を承諾したときだけ選ばれる」
  - ✓ Good: 「プリセット・前回の設定で入った Auto は、起動を押した時点で確認を出す。これは承諾なしに起動させないための確認で、エラーではない」
  - ✗ Bad: 「`bypassPermissions` を選択可能にしておき、起動時にエラーを出す — 選べる時点で誤操作の余地が残る」(今の Bad の例を `bypassPermissions` に限定する)
  - ✗ Bad: 「Auto を確認なしで選べる (`autoModeSafe !== true` のランタイムで) / main が確認の印を見ない」
  - ✗ Bad: 「`autoModeSafe === true` を『隔離の中で動いている』と表示する — sandbox を使えることと有効にしたことは別」
- **Verification**: Automated を「E2E で `Win32Runtime` 選択時に `acceptEdits` / `bypassPermissions` が選択肢に無く、Auto を選ぶと確認が出て取り消すと前の値のままであること (`e2e/launch-dialog.spec.ts`)。main の単体テストで印の無い `auto` の要求が拒否されること。項目 16 が agents の昇格の値のリテラルを違反にすること」に替える
- **Adoption metadata** (`:467`) の `amended` に `<改定を入れる日> (AD-066)` を足す (Amendment trail の行と同じ日付。SH-010 の日)
- 冒頭 (今の v1.5.0 の Sync Impact Report `:9-27` の前) に Sync Impact Report (v1.6.0) を足す: Version change 1.5.0 → 1.6.0 / Bump rationale (MINOR。適合と判定される状態を広げる。今まで適合していた状態が違反になることは無い) / 改定手順 (1 = AD-066、2 = 026 の PR で architecture-reviewer を交えた人間のレビュー (実施日を書く。マージ前に済んでいること。RK-01)、3 = MINOR、4 = Amendment trail、5 = enumeration) / Modified sections (Principle III の Statement・Why (2 文目の置き換えと暫定の受け入れ)・Examples・Verification) / 受け入れたリスク (`autoModeSafe === true` で確認を省いた Auto は隔離されずに動く。I-3 で判断し直す。026 U-6) / 既存違反の enumeration (III: 0 件。項目 16 ok) / Templates requiring updates (`plan-template.md` の III の行・`docs/glossary.md`・`docs/prompts.md` の I-3・`docs/domains/isolation/charter.md`・AD-066)
- Amendment trail (`:1107` の後) に 1.6.0 の行、frontmatter (`:3`, `:5`) の `version` / `last_amended`、脚注 (`:1119`) を直す
- `.specify/templates/plan-template.md:49` の III の行を「`autoModeSafe !== true` で bypass を選ばせない・Auto は確認と main の印の検査を挟む (3 値。`=== false` では `unknown` が素通りする)。`autoModeSafe === true` を隔離の中と表示しない (I-3 まで sandbox は有効でない)」に直す

### §8.2 AD-066

本 plan で起こした ([docs/decisions/0066-auto-permission-mode-with-confirmation.md](../../docs/decisions/0066-auto-permission-mode-with-confirmation.md))。規則は本書を参照する。

## §9 文言 (UI ラベルのポジティブリスト)

| 置き場 | 名前 | 文 |
|---|---|---|
名前は AD-065 Decision 3 のとおり `PERMISSION_MODE_NAMES` (Claude Code の表記。`auto` = `Auto`) の 1 か所から取り、文の中に直書きしない。下の表の `(name)` は呼び出し側が `PERMISSION_MODE_NAMES.auto` を渡す関数を表す。囲む文は日本語 (research P-13)。

| 置き場 | 名前 | 文 |
|---|---|---|
| `features/chat/labels.ts` | `PERMISSION_MODE_NAMES.auto` | `Auto` (今のまま。AD-065) |
| `features/session/labels.ts` | `PERMISSION_MODE_LABELS` (`:435-439`) | 型を `Record<SelectablePermissionMode, string>` にし、`auto: PERMISSION_MODE_NAMES.auto` を足す。説明は足さない (AD-065 Decision 3) |
| 同 | `LAUNCH_REJECT_LABELS['auto-mode-unconfirmed']` | `(name)` → 「「${name}」の確認が済んでいないので起動しませんでした。権限モードを選び直して確認してください。」 |
| 同 | `LIVE_SETTING_LABELS` の `auto-mode-unconfirmed` | `(name)` → 「「${name}」の確認が済んでいないので変更しませんでした。」 |
| 同 | `AUTO_MODE_CONFIRMATION_LABELS` (新設) | 見出し `(name)`: 「権限モードを「${name}」にしますか」。本文 1 文目: `unavailable` → 「このランタイムには隔離がありません。」 / それ以外 → 「このランタイムの隔離をアプリは確かめておらず、セッションは隔離されずに動きます。」。2 文目: 「分類器が許可した操作は、承認カードを出さずにホストでそのまま実行されます。」。3 文目: 「権限モードはいつでも戻せます。」。承諾 `(name)`: 「${name} にする」。取り消し: 「取り消す」 |
| `features/shell/labels.ts` | `AUTO_MODE_BANNER_LABELS` (新設) | `autoModeBanner(name)`: 「選んだ権限モード「${name}」で動いています。分類器が許可した操作は承認カードなしで実行されます。」。`autoModeRevert`: 「composer の左の権限モードからいつでも戻せます。」。`autoModeIsolation(status)` (Auto の帯の隔離の文。`autoModeStatus` で選ぶ): `unavailable` → 「このランタイムには隔離がありません。」 / `allowed` → 「このランタイムは sandbox を使えますが、アプリはまだ有効にしていないので、このセッションは隔離されていません。」 / `undetermined` → 「アプリはこのランタイムの隔離を確かめておらず、sandbox も有効にしていないので、このセッションは隔離されていません。」。どの値でも「隔離されている」「sandbox の中」と読める文にしない (spec U-6 / FR-008)。`UNSAFE_MODE_BANNER_LABELS` の隔離の 2 文は共有しない (`allowed` を「確かめていません」とだけ書くと、確認を出さない経路で隔離されているかもしれないと読める) |

`UNSAFE_MODE_BANNER_LABELS` の文は変えない (Auto の帯でない、利用者が選んでいない昇格の帯の文。原因を断定しない)。拒否の理由の文言が関数になるとき、今の表 (`LAUNCH_REJECT_LABELS` / `LIVE_SETTING_LABELS`) の形 (文字列の `Record`) に合わせるため、表の値は `PERMISSION_MODE_NAMES.auto` を埋めた文字列にしてよい (表の定義の時点で名前を引く)。

## §10 Constitution 検証と rule fixture

| 対象 | 変更 |
|---|---|
| `scripts/constitution/allowlists.mjs:515` `PERMISSION_MODE_ESCALATION_VALUES` | 変えない (3 値)。注記に「`auto` は許可の 4 値に入るが、agents に直書きさせない (値は main から届く。AD-066)」を足す |
| `allowlists.mjs:522` `SANCTIONED_PERMISSION_MODE_WRAPPER` | `'assertSelectablePermissionMode'`。注記を AD-066 に |
| `allowlists.mjs:481-483` (`QUERY_MUTATION_METHODS` の注記) | 包みの名前を `assertSelectablePermissionMode(` に |
| `scripts/constitution/check.mjs` 項目 16 (`:815` から。権限モードの検査は `:925`・`:985-986` 付近) | 違反の文言の「安全 3 値 {default, plan, dontAsk} のみ」を「許可の 4 値 {default, plan, dontAsk, auto} のみ (`acceptEdits` / `bypassPermissions` は不可。AD-066)」に。検査の形は変えない |
| `tests/rule-fixtures/` | 包みの名前の差し替え 4 つ (`a-direct/sdk-permission-mode-unwrapped`・`b-equivalent/sdk-permission-mode-wrapper-chained`・`b-equivalent/sdk-set-permission-mode-unwrapped`・`b-equivalent/sdk-set-permission-mode-wrapper-escape`)。新設 `a-direct/sdk-set-permission-mode-escalation-literal` (`.setPermissionMode(assertSelectablePermissionMode('bypassPermissions'))` が項目 16 で発火)。`a-direct/sdk-query-escalation-options` は変えない (発火したまま) |
| `tests/rule-fixtures/expected.mjs` (`:280-405` の該当の項目・`:929-931` の `UNDETECTED_NOTES`) | 包みの名前と説明の文を直し、新設の 1 つを足す |

## §11 記録 (完了の PR)

| ファイル | 変更 |
|---|---|
| `docs/glossary.md` | **SafePermissionMode** (`:990-995`): Definition (`:992`) の「起動で選べる」を「安全 3 値。帯の条件に使う。起動・実行中で選べるのは Selectable permission mode」に、Counterexamples (`:994`) の「昇格 3 値は含まない。capability 連動は I-3」に「`auto` は Selectable permission mode に入る (X-10 / AD-066)」を足す。**Selectable permission mode (許可の 4 値)** と **Auto mode confirmation (Auto の確認)** の項を足す。**Live session setting** (`:623-630`。Definition `:625`): 「安全 3 値 (`SafePermissionMode`) の中の遷移だけ」を「許可の 4 値の中。`auto` は確認つき (AD-066)」に。**Unsafe permission mode banner** (`:1412-1424`): 「利用者が選んだ `auto` は Auto の帯 (`AutoModeBanner`) で、本帯は出さない」を足す。**autoModeSafe** (`:69-77`): 「Auto は false でも確認つきで選べる (AD-066)」を足す。**LaunchInput** の `LaunchQueryOptions` の行 (`:587`) と **SessionLaunchConfig** の項 (`:1111`) の `SafePermissionMode` を `SelectablePermissionMode` に。**FailureReason** の `resume-failed` の行 (`:426`) の「再開の最初の `init` の権限モードが安全 3 値の外」を「安全 3 値の外で、起動で頼んだ値とも違う (AD-066 Decision 5)」に。**Launch preflight reason** (`:572-581`) に `auto-mode-unconfirmed` を足す。**autoModeSafe** の Domain (`:75`「`runtime`（表明）/ `isolation`（ゲート）」) と **Unsafe permission mode banner** の Domain (`:1420`「ポリシーとゲートは `isolation` (I-3)」) に「Auto の確認の要否の判定 (`requiresAutoModeConfirmation`) と main の印の検査は X-10 で `session` に暫定で置く (I-3 で `isolation` へ移す。AD-066)。`bypassPermissions` のゲートと、`autoModeSafe === true` で確認を省き続けるかの判断は `isolation` (I-3)」を足す。autoModeSafe の項には「true は sandbox を使えるという意味で、Closta が sandbox を有効にしたことではない (I-3 まで有効にしない。026 U-6)」も足す |
| `docs/domains/isolation/charter.md` | In scope「権限モードのゲート」(`:30-31`) を「`capabilities.autoModeSafe !== true` のランタイムで `bypassPermissions` を選択不可にする。Auto は確認つきで選べ、確認の要否の判定 (`requiresAutoModeConfirmation`) と main の印の検査は X-10 では `session` に暫定で置く (I-3 で本 domain へ移す。AD-066)。`autoModeSafe === true` で確認を省き続けるか、sandbox を有効にするかは I-3 で判断し直す (026 U-6)」に (3 値の注意の文は残す)。Journey 2 の手順 3 (`:74`) を「隔離されていないランタイムでは `bypassPermissions` が選べず、Auto は確認と帯つきで選べる」に。業務ルール (`:101`) を「`autoModeSafe !== true` のランタイムで `bypassPermissions` を選択可能にしてはならない。Auto は確認と main の印の検査を挟む (Principle III。AD-066)」に (判定の単一の関数・`=== false`・`dontAsk` の文は残す)。KPI「権限ゲートの正しさ」(`:127`) を「`Win32Runtime` 選択時に bypass が選択肢に無く、Auto を選ぶと確認が出る — 計測経路: Playwright E2E (`e2e/launch-dialog.spec.ts`。026 FE-017)」に。Related Specs (`:145`) に X-10 / 026 (Auto の確認の暫定の持ち主は session) を足し、frontmatter の `related_specs` と `related_adrs` (AD-066) を足す |
| `docs/domains/session/charter.md` | 業務ルール `:188-190` の「X-4 時点では安全 3 値だけを提示する」を「起動・実行中とも許可の 4 値 (安全 3 値と `auto`)。`auto` は隔離の無いランタイムで確認つき (X-10 / AD-066)。capability に連動する昇格モード (`acceptEdits` / `bypassPermissions`) は I-3」に。Open Questions `:390-392` の「Auto モードの指定は I-3」に「→ X-10 で `auto` を先に出した (AD-066)」を足す。X-6 の項の「(安全 3 値の中)」はそのまま (023 の記録)。Out of scope の「コンテナの起動・破棄と権限モードのゲート → `isolation` domain」(`:85`) に「(Auto の確認の要否の判定と main の印の検査は X-10 で session に暫定で置く。I-3 で isolation へ移す。AD-066)」を注記する。Related ADRs に AD-066、Related Specs に X-10 / 026 の項を足す。frontmatter の `related_adrs` / `related_specs` |
| `docs/domains/_overview.md` | feature の一覧 (X-8 / X-9 の行 `:72-73` の後) に X-10 の行を足す。M4 の行 (`:143`) は変えない (隔離の中で Auto / bypass を回す目標は I-3 のまま) |
| `docs/roadmap.md` | X-10 の行 (`:356`) に完了の記録。I-3 の行 (`:422`) の C-001 の申し送り (「X-10 からの申し送り (026 U-6 …)」: sandbox を有効にするか、true のランタイムで確認を省き続けるかを I-3 で判断し直す・暫定の判定を `isolation` へ移す) は design-gate の修正 (2026-10-31) で**書き込み済み**。完了の PR では変えない (他の注記と義務の文も変えない) |
| `docs/prompts.md` | I-3 のプロンプト (`:349`) の「autoModeSafe が false のランタイムで Auto と bypassPermissions を選択不可にし」を「`bypassPermissions` を選択不可にし (Auto は X-10 で確認つきで選べる。`autoModeSafe === true` のランタイムでは X-10 は確認を省いているが sandbox は有効でない。sandbox を有効にするか、確認を省き続けるかを判断し直す。026 U-6 / AD-066)」に直す (新しい Principle III と食い違うプロンプトを残さない) |
| `docs/ui-coverage.md` | `:220` (`set_permission_mode`) の備考に「`auto` を含む許可の 4 値。隔離の無いランタイムでは確認つき (X-10 / 026)」。`:56` (`status`) と `:205` (`meter`) の割当の列の `UnsafeModeBanner` の後に `AutoModeBanner` を足し (書式は `実装済み: <部品> / … (実行中)` のまま。項目 21 の書式の検査で確かめる)、`:56` の備考の「安全 3 値の外のときの警告の帯」に「利用者が選んだ `auto` のときは Auto の帯 (026)」を足す。`:53` (`init`) の備考の「表示は権限モードの行と警告の帯」に「と Auto の帯」を足す |
| `.specify/memory/constitution.md` / `.specify/templates/plan-template.md` | §8.1 |
