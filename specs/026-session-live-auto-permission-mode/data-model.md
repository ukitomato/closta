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
| **`requiresAutoModeConfirmation(mode, autoModeAllowed: boolean)`** (新設) | `isAutoPermissionMode(mode) && autoModeAllowed !== true` | main の印の検査 (§4)・renderer の確認 (§6) |
| **`resumeInitialPermissionMode(mode: SelectablePermissionMode): SafePermissionMode`** (新設) | `auto` なら `'default'`、他はそのまま | 再開の初期値 (§7) |

- `hasValidBaseAxes` の最後 (`launch-config.ts:181`) を `isSelectablePermissionMode(c.permissionMode)` にする。版 1 のプリセット・版 2 / 3 のプリセット・起動の 3 つの述語が共有するので、3 つとも許可の 4 値に広がる (版 1 / 2 のファイルに `auto` は書かれていないので、読み込みの結果は変わらない)
- 型を `SelectablePermissionMode` に広げる所: `SessionLaunchConfig.permissionMode` (`launch-config.ts:60`)・`LaunchDraft.permissionMode` (`launch-resolution.ts:26`)・`LaunchQueryOptions.permissionMode` (`agent-session.ts:130`)・`SessionControl` の `set-permission-mode` の `mode` (`:360`)・`AgentSession.setPermissionMode` (`:387`)・`Capability.setSessionPermissionMode` の `mode` (`capability.ts:227`)・`session-core.ts` (`:145`, `:176`)・`live-signals.ts` (`:201`, `:246`)・`session-launch-service.ts` (`:141`, `:206`)・`ipc.ts:158`・`session-ipc.ts:80`・`validate.ts:441`・`LiveComposerSettings` の `configPermissionMode` / `onSelectPermissionMode` (`LivePane.tsx:420`, `:429`)・`LiveSettingsControls` の `onSelectPermissionMode` (`:37`, `:241`)・`useLiveSession.ts` (`:54`, `:108`)・`running-session-store.ts` の `setPermissionMode` (`:129`)・renderer の文言の `Record` (§9)
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

「確認が要る」は `requiresAutoModeConfirmation(mode, deps.autoModeAllowed(runtimeId))` (§1)。安全 3 値・隔離のあるランタイムの `auto` は印を見ない。

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

### §5.3 `AutoModeBanner`

| 項目 | 規則 |
|---|---|
| 視覚の帯 | `role="note"`、`data-testid="auto-mode-banner"`、amber の色 (`text-amber-700 dark:text-amber-400`。破壊的な赤にしない)。文は §9 の `autoModeBanner(PERMISSION_MODE_NAMES.auto)` + 隔離の文 (今の `UnsafeModeBanner` と同じ選び方) + `autoModeRevert` |
| 読み上げ | 帯の中に `sr-only` の `role="status"` (`aria-live="polite"`) を置く。前の観測の値を `useRef` で持ち、**描いている間に `auto` 以外 → `auto` に変わったときだけ** 帯の文 (隔離の文を含む) を入れる。mount の時点で既に `auto` なら入れない |
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
- 状態 `autoConfirm: null | 'select' | 'launch'` と `autoAckRuntimeId: string | null`

| 出来事 | 動き |
|---|---|
| `auto` を選び確認が要る | 下書きを変えず `autoConfirm = 'select'` |
| `auto` を選び確認が要らない | そのまま `auto` にする (1 操作) |
| `'select'` で承諾 | `permissionMode = 'auto'`、`autoAckRuntimeId = 今のランタイム` |
| 取り消し | 何も変えない (選択は前の値に戻って見える) |
| 起動を押す | Provider の確認が要れば先にそれ (今のまま)。次に、確認が要り `autoAckRuntimeId !== launchConfig.runtimeId` なら `autoConfirm = 'launch'` で止める。どちらも済んだら `ack = requiresAutoModeConfirmation(...)` を 3 つ目の引数に載せて送る |
| `'launch'` で承諾 | `autoAckRuntimeId` を記録して起動する |
| プリセットの適用・ランタイムの変更・`refetch` | `autoConfirm = null`。`autoAckRuntimeId` は消さない (起動の時点で今のランタイムと照らす) |

`ack` は確認が要らないときは `false` を送る (main は見ない)。

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
| 確認が要らない (安全 3 値・隔離のあるランタイムの `auto`) | すぐ `session.setPermissionMode(mode, false)` |
| 確認の間に `liveSettingBlocker('permission-mode', settingsRow)` が非 null になった | 確認を閉じ、送らない (`LivePane` はセッションごとに描くので、切り替えでも閉じる) |

ストアの `setPermissionMode(sessionId, mode, ack)` (`running-session-store.ts:1016-1026`) は capability の `setSessionPermissionMode(sessionId, mode, ack)` を呼ぶ (§5.1 の `chosenPermissionMode` の更新を含む)。`useLiveSession` の `setPermissionMode(mode, ack)` も同じ引数を通す。

### §6.4 起動・再開の印の通り道 (renderer)

`LaunchDialog` の `ack` は `RunningSessionsView.launch(config, origin, ack)` / `.resume(request, origin, ack)` (`running-sessions-view.ts:42`, `:47`) → ストアの `launch` / `resume` → `capability().launchSession(config, origin, ack)` (`running-session-store.ts:840`) / `resumeSession(request, origin, ack)` (`:882`) と素通しする。ストアは印を持たない (行の状態に残さない)。

## §7 再開の初期値 (`resume-action.ts`)

再開のダイアログの初期値 (`ResumeDialogState.initial`) を組む所で、権限モードを `resumeInitialPermissionMode(...)` に通す (稼働中の行の `config.permissionMode` を写す `:58` が当たる)。過去の行は今どおり起動の既定。

## §8 Constitution と ADR の文 (実装の PR で入れる)

### §8.1 Principle III (1.5.0 → 1.6.0。MINOR)

- **Statement** (`constitution.md:470`) の 1 文目を次に替える:
  「`capabilities.autoModeSafe !== true` のランタイムで `bypassPermissions` を選択可能にしてはならない。**同じランタイムで Auto (`auto`) を選ぶときは、起動・実行中とも毎回、隔離が無いことを書いた明示の確認を挟み、main は確認の印の無い要求を拒否する** (AD-066)。」
  2 文目以降 (3 値・単一の判定関数・`=== false` の注意・`bypassPermissions` の `allowDangerouslySkipPermissions` と明示確認) は変えない
- **Why** の後に 1 文: 「Auto は分類器が操作ごとに許可・拒否するので、隔離が無くても利用者が確認の上で選ぶことは許す。選んだことと隔離の状態は動いている間ずっと帯で示す (AD-066)」
- **Examples**: Good を「`Win32Runtime` 選択時、`bypassPermissions` は選択肢に無く、Auto は確認を承諾したときだけ選ばれる」に、Bad に「Auto を確認なしで選べる / main が確認の印を見ない」を足す
- **Verification**: Automated を「E2E で `Win32Runtime` 選択時に `acceptEdits` / `bypassPermissions` が選択肢に無く、Auto を選ぶと確認が出て取り消すと前の値のままであること (`e2e/launch-dialog.spec.ts`)。main の単体テストで印の無い `auto` の要求が拒否されること。項目 16 が agents の昇格の値のリテラルを違反にすること」に替える
- **Adoption metadata** (`:467`) の `amended` に `2026-10-29 (AD-066)` を足す
- 冒頭 (今の v1.5.0 の Sync Impact Report `:9-27` の前) に Sync Impact Report (v1.6.0) を足す: Version change 1.5.0 → 1.6.0 / Bump rationale (MINOR。適合と判定される状態を広げる。今まで適合していた状態が違反になることは無い) / 改定手順 (1 = AD-066、2 = 026 の PR で architecture-reviewer を交えた人間のレビュー (未了。利用者に残す)、3 = MINOR、4 = Amendment trail、5 = enumeration) / Modified sections (Principle III の Statement・Why・Examples・Verification) / 既存違反の enumeration (III: 0 件。項目 16 ok) / Templates requiring updates (`plan-template.md` の III の行・`docs/glossary.md`・`docs/prompts.md` の I-3・AD-066)
- Amendment trail (`:1107` の後) に 1.6.0 の行、frontmatter (`:3`, `:5`) の `version` / `last_amended`、脚注 (`:1119`) を直す
- `.specify/templates/plan-template.md:49` の III の行を「`autoModeSafe !== true` で bypass を選ばせない・Auto は確認と main の印の検査を挟む (3 値。`=== false` では `unknown` が素通りする)」に直す

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
| 同 | `AUTO_MODE_CONFIRMATION_LABELS` (新設) | 見出し `(name)`: 「権限モードを「${name}」にしますか」。本文 1 文目: `unavailable` → 「このランタイムには隔離がありません。」 / それ以外 → 「このランタイムの隔離をアプリは確かめていません。」。2 文目: 「分類器が許可した操作は、承認カードを出さずにホストでそのまま実行されます。」。3 文目: 「権限モードはいつでも戻せます。」。承諾 `(name)`: 「${name} にする」。取り消し: 「取り消す」 |
| `features/shell/labels.ts` | `AUTO_MODE_BANNER_LABELS` (新設) | `autoModeBanner(name)`: 「選んだ権限モード「${name}」で動いています。分類器が許可した操作は承認カードなしで実行されます。」。`autoModeRevert`: 「composer の左の権限モードからいつでも戻せます。」。隔離の文は今の `UNSAFE_MODE_BANNER_LABELS` の隔離の 2 文を共有する |

`UNSAFE_MODE_BANNER_LABELS` の文は変えない。拒否の理由の文言が関数になるとき、今の表 (`LAUNCH_REJECT_LABELS` / `LIVE_SETTING_LABELS`) の形 (文字列の `Record`) に合わせるため、表の値は `PERMISSION_MODE_NAMES.auto` を埋めた文字列にしてよい (表の定義の時点で名前を引く)。

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
| `docs/glossary.md` | **SafePermissionMode** (`:990-995`): Definition (`:992`) の「起動で選べる」を「安全 3 値。帯の条件に使う。起動・実行中で選べるのは Selectable permission mode」に、Counterexamples (`:994`) の「昇格 3 値は含まない。capability 連動は I-3」に「`auto` は Selectable permission mode に入る (X-10 / AD-066)」を足す。**Selectable permission mode (許可の 4 値)** と **Auto mode confirmation (Auto の確認)** の項を足す。**Live session setting** (`:623-630`。Definition `:625`): 「安全 3 値 (`SafePermissionMode`) の中の遷移だけ」を「許可の 4 値の中。`auto` は確認つき (AD-066)」に。**Unsafe permission mode banner** (`:1412-1424`): 「利用者が選んだ `auto` は Auto の帯 (`AutoModeBanner`) で、本帯は出さない」を足す。**autoModeSafe** (`:69-77`): 「Auto は false でも確認つきで選べる (AD-066)」を足す。**LaunchInput** の `LaunchQueryOptions` の行 (`:587`) と **SessionLaunchConfig** の項 (`:1111`) の `SafePermissionMode` を `SelectablePermissionMode` に。**FailureReason** の `resume-failed` の行 (`:426`) の「再開の最初の `init` の権限モードが安全 3 値の外」を「安全 3 値の外で、起動で頼んだ値とも違う (AD-066 Decision 5)」に。**Launch preflight reason** (`:572-581`) に `auto-mode-unconfirmed` を足す |
| `docs/domains/session/charter.md` | 業務ルール `:188-190` の「X-4 時点では安全 3 値だけを提示する」を「起動・実行中とも許可の 4 値 (安全 3 値と `auto`)。`auto` は隔離の無いランタイムで確認つき (X-10 / AD-066)。capability に連動する昇格モード (`acceptEdits` / `bypassPermissions`) は I-3」に。Open Questions `:390-392` の「Auto モードの指定は I-3」に「→ X-10 で `auto` を先に出した (AD-066)」を足す。X-6 の項の「(安全 3 値の中)」はそのまま (023 の記録)。Related ADRs に AD-066、Related Specs に X-10 / 026 の項を足す。frontmatter の `related_adrs` / `related_specs` |
| `docs/domains/_overview.md` | feature の一覧 (X-8 / X-9 の行 `:72-73` の後) に X-10 の行を足す。M4 の行 (`:143`) は変えない (隔離の中で Auto / bypass を回す目標は I-3 のまま) |
| `docs/roadmap.md` | X-10 の行 (`:356`) に完了の記録。I-3 の行 (`:422`) は今の注記のまま |
| `docs/prompts.md` | I-3 のプロンプト (`:349`) の「autoModeSafe が false のランタイムで Auto と bypassPermissions を選択不可にし」を「`bypassPermissions` を選択不可にし (Auto は X-10 で確認つきで選べる。隔離が分かったランタイムで確認を省くかを判断する)」に直す (新しい Principle III と食い違うプロンプトを残さない) |
| `docs/ui-coverage.md` | `:220` (`set_permission_mode`) の備考に「`auto` を含む許可の 4 値。隔離の無いランタイムでは確認つき (X-10 / 026)」。`:56` (`status`) と `:205` (`meter`) の割当の列の `UnsafeModeBanner` の後に `AutoModeBanner` を足し (書式は `実装済み: <部品> / … (実行中)` のまま。項目 21 の書式の検査で確かめる)、`:56` の備考の「安全 3 値の外のときの警告の帯」に「利用者が選んだ `auto` のときは Auto の帯 (026)」を足す。`:53` (`init`) の備考の「表示は権限モードの行と警告の帯」に「と Auto の帯」を足す |
| `.specify/memory/constitution.md` / `.specify/templates/plan-template.md` | §8.1 |
