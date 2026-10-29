# Data Model: 権限モードの Auto (起動と実行中)

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Contracts**: [contracts/ipc-auto-permission-mode.md](./contracts/ipc-auto-permission-mode.md)

本書が規則の正本である。plan・tasks・ADR (AD-066) は本書を参照し、規則を書き写さない。

## §0 変えないもの

- `acceptEdits` / `bypassPermissions` へ移る経路は、起動・実行中とも 0 件のまま (FR-004)。項目 16 の昇格の値の文字列リテラルの禁止 (`PERMISSION_MODE_ESCALATION_VALUES` の 3 値) も残す
- `isAutoModeAllowed` / `autoModeStatus` / `deriveAutoModeSafe` / `fixedCapabilities` と DTO の不変条件 (`autoModeAllowed` をゲートに、`autoModeStatus` を表示に使う)
- `IPC_CHANNELS` の数と並び。`SessionControl` の種類 (8)。`QUERY_MUTATION_METHODS` (20)。`QUERY_OPTION_KEYS`。`SessionEvent` の種類。`SessionLaunchConfig` のキー
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
| **`requiresAutoModeConfirmation(mode, autoModeAllowed: boolean)`** (新設) | `mode === 'auto' && autoModeAllowed !== true` | main の印の検査 (§4)・renderer の確認 (§6) |
| **`resumeInitialPermissionMode(mode: SelectablePermissionMode): SafePermissionMode`** (新設) | `mode === 'auto' ? 'default' : mode` | 再開の初期値 (§7) |

- `isValidLaunchConfig` の最後を `isSelectablePermissionMode(c.permissionMode)` にする
- 型を `SelectablePermissionMode` に広げる所: `SessionLaunchConfig.permissionMode`・`LaunchDraft.permissionMode` (`launch-resolution.ts`)・`LaunchQueryOptions.permissionMode` (`agent-session.ts:129`)・`SessionControl` の `set-permission-mode` の `mode` (`:321-325`)・`AgentSession.setPermissionMode` (`:349`)・`Capability.setSessionPermissionMode` の `mode` (`capability.ts:223`)・`session-core.ts` (`:133`, `:156`, `:195`)・`live-signals.ts` (`:201`, `:246`)・`session-launch-service.ts` の `setPermissionMode`・`CenterHeaderLive` の `configPermissionMode` / `onSelectPermissionMode`・`running-session-store.ts` の `setPermissionMode`・renderer の文言の `Record` (§9)
- `sdk-agent-session.ts:116` の型の検査 (`safeModeIsSdkMode`) を「`SelectablePermissionMode` が SDK の `PermissionMode` の部分集合」に直す

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
| `decodeLaunchOptions` (`sdk-agent-session.ts:312`, `:323`) | `isSafePermissionMode` / `assertSafePermissionMode` | `isSelectablePermissionMode` / `assertSelectablePermissionMode` |
| `buildQueryOptions` の `permissionMode:` (`:842`) | `assertSafePermissionMode(launchOptions.permissionMode)` | `assertSelectablePermissionMode(...)` |
| 制御シンクの `set-permission-mode` (`:760-768`) | `.setPermissionMode(assertSafePermissionMode(mode))` | `.setPermissionMode(assertSelectablePermissionMode(mode))`。成功で `signals.onPermissionModeApplied(mode)` は今のまま |
| decoder の `set-permission-mode` (`session-core.ts:489`) | `isSafePermissionMode(mode)` | `isSelectablePermissionMode(mode)` |
| `session-core.ts:195` | `assertSafePermissionMode(deps.permissionMode)` | `assertSelectablePermissionMode(...)` |

agents は確認の印を受けず、見ない。`'auto'` の文字列を agents のファイルに書かない (項目 16 の P1 が落とす)。

### §3.2 再開の init の検査 (`sdk-agent-session.ts:930-938`)

最初の `init` で、再開 (`launchOptions.resume !== undefined`) のときに次のどちらでもなければ `fail('resume-failed')`:

1. `isSafePermissionMode(init.permissionMode)`
2. `init.permissionMode === launchOptions.permissionMode` (起動で頼んだ値。`auto` で頼んだ再開が `auto` で戻るのはこちら)

`default` で頼んだ再開が `auto` で戻る・`bypassPermissions` / `acceptEdits` / 不明な値で戻るのは今どおり失敗 (research P-5)。

## §4 main (確認の印の検査)

### §4.1 IPC の印 (contracts C-1〜C-3)

- 3 つの口の 3 つ目の引数 `autoModeAcknowledged`。`args[2] === true` だけを承諾とし、他の値はすべて「承諾なし」(起動・変更そのものは拒否しない)
- `checkSetPermissionModeArgs` (`validate.ts:437-441`) は `args.length` が 2 または 3、`isValidSessionId(args[0])`、`isSelectablePermissionMode(args[1])` を求める (3 つ目の型は問わない)
- `checkLaunchConfig` / `checkResumeRequest` / `checkPreset` は `isValidLaunchConfig` を通るので、許可の 4 値に自動で広がる

### §4.2 判定 (`src/main/app/session-launch-service.ts` だけ)

新しい必須の依存 `autoModeAllowed(runtimeId: string): boolean`。composition-root は `runtimes.snapshot()` から記述子を引いて `isAutoModeAllowed(descriptor.capabilities)` を返し、見つからなければ `false`。e2e は `knownRuntimes` から同じ関数で作る。

| 操作 | 判定の位置 | 確認が要るのに印が無い |
|---|---|---|
| `launch(config, ack)` | `startSession` の先頭 (`disposing` の検査の直後、枠の予約の前。同期) | `{ status: 'rejected', reason: 'auto-mode-unconfirmed' }`。`prepareLaunch` を呼ばない |
| `resume(config, resolved, ack)` | 同じ (`already-running` / `conversation-running` の判定の後、`startSession` の中) | 同じ。`resume-service` は `ack` を素通しする |
| `setPermissionMode(sessionId, mode, ack)` | `liveSettingBlocker` の判定の後、`requestControl` の前。ランタイムは `Entry.axes.runtimeId` | `{ ok: false, reason: 'auto-mode-unconfirmed' }`。制御を送らない |

「確認が要る」は `requiresAutoModeConfirmation(mode, deps.autoModeAllowed(runtimeId))` (§1)。安全 3 値・隔離のあるランタイムの `auto` は印を見ない。

### §4.3 プリセット (`src/main/infra/settings/`)

- `PRESET_SCHEMA_VERSION` を 2 にする
- 読み込み: `schemaVersion` が 1 または 2 なら今の述語 (`isValidLaunchConfig`。§1 で 4 値に広がる) で受ける。2 より大きければ `schema-version-unknown`、それ以外は `parse-failed` (今と同じ形)
- 書き出し: 2
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
| `mode === 'auto' && chosen === 'auto'` | **`AutoModeBanner`** (新設) |
| 上に当たらず、`mode !== null && !isSafePermissionMode(mode)` | `UnsafeModeBanner` (今のまま) |
| それ以外 | 出さない |

並びは今と同じ位置 (権限モードの帯 → Quota banner → 会話内検索のバー)。2 つの帯が同時に出ることは無い。

### §5.3 `AutoModeBanner`

| 項目 | 規則 |
|---|---|
| 視覚の帯 | `role="note"`、`data-testid="auto-mode-banner"`、amber の色 (`text-amber-700 dark:text-amber-400`。破壊的な赤にしない)。文は §9 の `autoModeBanner` + 隔離の文 (今の `isolationSentence(autoModeStatus)`) + `autoModeRevert` |
| 読み上げ | 帯の中に `sr-only` の `role="status"` (`aria-live="polite"`) を置く。前の観測の値を `useRef` で持ち、**描いている間に `auto` 以外 → `auto` に変わったときだけ** 帯の文 (隔離の文を含む) を入れる。mount の時点で既に `auto` なら入れない |
| 入力 | 隔離の文は `useRunningSessionsView().runtimeAutoMode(runtimeId)` (表示用。今と同じ)。`autoModeAllowed` を使わない |

## §6 確認 (renderer。`src/renderer/src/features/session/AutoModeConfirmation.tsx` を新設)

### §6.1 部品

| 項目 | 規則 |
|---|---|
| 形 | その場の `role="alertdialog"` の枠 (入れ子の modal にしない)。`aria-labelledby` は見出し、`aria-describedby` は本文 |
| 文 | §9 の `AUTO_MODE_CONFIRMATION_LABELS`。本文の 1 文目は `autoModeStatus` で選ぶ (`unavailable` → 隔離なし、それ以外 → 隔離を確かめていない) |
| ボタン | 「自動で判断にする」(承諾) と「取り消す」。開いたら**取り消しに焦点**。Escape は取り消し (外側の Dialog を閉じない: `stopPropagation`) |
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

### §6.3 中央のヘッダ (`CenterHeader.tsx` / `LiveSettingsControls.tsx`)

- 選択肢は `SELECTABLE_PERMISSION_MODES`。今の「安全でない今の値は disabled の選択肢で出す」は `isSelectablePermissionMode` の外 (昇格の 2 値と不明) に狭める
- 確認の状態は `CenterHeader` が持ち、確認は**ヘッダの行の下・`LiveSettingError` の上**に出す
- 入力の真偽は `useRunningSessionsView().runtimeAutoModeAllowed(live.runtimeId)` (新設。ゲート用。一覧に無ければ false)

| 出来事 | 動き |
|---|---|
| `auto` を選び確認が要る | 要求を送らず確認を開く |
| 承諾 | `live.onSelectPermissionMode('auto', true)` |
| 取り消し | 何も送らない (表示は `meters` の今の値のまま) |
| 確認が要らない (安全 3 値・隔離のあるランタイムの `auto`) | すぐ `onSelectPermissionMode(mode, false)` |
| 確認の間に `liveSettingBlocker(...)` が非 null になった・`sessionId` が変わった | 確認を閉じ、送らない |

ストアの `setPermissionMode(sessionId, mode, ack)` は capability の `setSessionPermissionMode(sessionId, mode, ack)` を呼ぶ (§5.1 の `chosenPermissionMode` の更新を含む)。

## §7 再開の初期値 (`resume-action.ts`)

再開のダイアログの初期値 (`ResumeDialogState.initial`) を組む所で、権限モードを `resumeInitialPermissionMode(...)` に通す (稼働中の行の `config.permissionMode` を写す `:55-59` が当たる)。過去の行は今どおり起動の既定。

## §8 Constitution と ADR の文 (実装の PR で入れる)

### §8.1 Principle III (1.4.0 → 1.5.0。MINOR)

- **Statement** (`constitution.md:450`) の 1 文目を次に替える:
  「`capabilities.autoModeSafe !== true` のランタイムで `bypassPermissions` を選択可能にしてはならない。**同じランタイムで Auto (`auto`) を選ぶときは、起動・実行中とも毎回、隔離が無いことを書いた明示の確認を挟み、main は確認の印の無い要求を拒否する** (AD-066)。」
  2 文目以降 (3 値・単一の判定関数・`=== false` の注意・`bypassPermissions` の `allowDangerouslySkipPermissions` と明示確認) は変えない
- **Why** の後に 1 文: 「Auto は分類器が操作ごとに許可・拒否するので、隔離が無くても利用者が確認の上で選ぶことは許す。選んだことと隔離の状態は動いている間ずっと帯で示す (AD-066)」
- **Examples**: Good を「`Win32Runtime` 選択時、`bypassPermissions` は選択肢に無く、Auto は確認を承諾したときだけ選ばれる」に、Bad に「Auto を確認なしで選べる / main が確認の印を見ない」を足す
- **Verification**: Automated を「E2E で `Win32Runtime` 選択時に `acceptEdits` / `bypassPermissions` が選択肢に無く、Auto を選ぶと確認が出て取り消すと前の値のままであること (`e2e/launch-dialog.spec.ts`)。main の単体テストで印の無い `auto` の要求が拒否されること。項目 16 が agents の昇格の値のリテラルを違反にすること」に替える
- **Adoption metadata** の `amended` に `2026-10-29 (AD-066)` を足す
- 冒頭に Sync Impact Report (v1.5.0) を足す: Version change 1.4.0 → 1.5.0 / Bump rationale (MINOR。適合と判定される状態を広げる。今まで適合していた状態が違反になることは無い) / 改定手順 (1 = AD-066、2 = 026 の PR で architecture-reviewer を交えた人間のレビュー (未了。利用者に残す)、3 = MINOR、4 = Amendment trail、5 = enumeration) / Modified sections (Principle III の Statement・Why・Examples・Verification) / 既存違反の enumeration (III: 0 件。項目 16 ok) / Templates requiring updates (`plan-template.md` の III の行・`docs/glossary.md`・AD-066)
- Amendment trail に 1.5.0 の行、frontmatter の `version` / `last_amended`、脚注を直す
- `.specify/templates/plan-template.md:49` の III の行を「`autoModeSafe !== true` で bypass を選ばせない・Auto は確認と main の印の検査を挟む (3 値。`=== false` では `unknown` が素通りする)」に直す

### §8.2 AD-066

本 plan で起こした ([docs/decisions/0066-auto-permission-mode-with-confirmation.md](../../docs/decisions/0066-auto-permission-mode-with-confirmation.md))。規則は本書を参照する。

## §9 文言 (UI ラベルのポジティブリスト)

| 置き場 | 名前 | 文 |
|---|---|---|
| `features/chat/labels.ts` | `PERMISSION_MODE_NAMES.auto` | `自動で判断` (今のまま。025 が表記を揃える) |
| `features/session/labels.ts` | `PERMISSION_MODE_LABELS` / `PERMISSION_MODE_DESCRIPTIONS` | 型を `Record<SelectablePermissionMode, string>` に。`auto` の説明: 「承認カードを出さずに、Claude Code の分類器が操作ごとに許可・拒否します。判断できない操作は承認カードで聞きます。」 |
| 同 | `LAUNCH_REJECT_LABELS['auto-mode-unconfirmed']` | 「「自動で判断」を確認していないので起動しませんでした。権限モードを選び直して確認してください。」 |
| 同 | `LIVE_SETTING_LABELS` の `auto-mode-unconfirmed` | 「「自動で判断」を確認していないので変更しませんでした。」 |
| 同 | `AUTO_MODE_CONFIRMATION_LABELS` (新設) | 見出し: 「権限モードを「自動で判断」にしますか」。本文 1 文目: `unavailable` → 「このランタイムには隔離がありません。」 / それ以外 → 「このランタイムの隔離をアプリは確かめていません。」。2 文目: 「分類器が許可した操作は、承認カードを出さずにホストでそのまま実行されます。」。3 文目: 「権限モードはいつでも戻せます。」。承諾: 「自動で判断にする」。取り消し: 「取り消す」 |
| `features/shell/labels.ts` | `AUTO_MODE_BANNER_LABELS` (新設) | `autoModeBanner`: 「選んだ権限モード「自動で判断」で動いています。分類器が許可した操作は承認カードなしで実行されます。」。`autoModeRevert`: 「ヘッダの権限モードからいつでも戻せます。」。隔離の文は今の `UNSAFE_MODE_BANNER_LABELS` の `unsafeModeNoIsolation` / `unsafeModeIsolationUnverified` を共有する |

`UNSAFE_MODE_BANNER_LABELS` の文は変えない。

## §10 Constitution 検証と rule fixture

| 対象 | 変更 |
|---|---|
| `scripts/constitution/allowlists.mjs:515` `PERMISSION_MODE_ESCALATION_VALUES` | 変えない (3 値)。注記に「`auto` は許可の 4 値に入るが、agents に直書きさせない (値は main から届く。AD-066)」を足す |
| `allowlists.mjs:522` `SANCTIONED_PERMISSION_MODE_WRAPPER` | `'assertSelectablePermissionMode'`。注記を AD-066 に |
| `allowlists.mjs:481-483` (`QUERY_MUTATION_METHODS` の注記) | 包みの名前を `assertSelectablePermissionMode(` に |
| `scripts/constitution/check.mjs` 項目 16 (`:917-1003`) | 違反の文言の「安全 3 値 {default, plan, dontAsk} のみ」を「許可の 4 値 {default, plan, dontAsk, auto} のみ (`acceptEdits` / `bypassPermissions` は不可。AD-066)」に。検査の形は変えない |
| `tests/rule-fixtures/` | 包みの名前の差し替え 4 つ (`a-direct/sdk-permission-mode-unwrapped`・`b-equivalent/sdk-permission-mode-wrapper-chained`・`b-equivalent/sdk-set-permission-mode-unwrapped`・`b-equivalent/sdk-set-permission-mode-wrapper-escape`)。新設 `a-direct/sdk-set-permission-mode-escalation-literal` (`.setPermissionMode(assertSelectablePermissionMode('bypassPermissions'))` が項目 16 で発火)。`a-direct/sdk-query-escalation-options` は変えない (発火したまま) |
| `tests/rule-fixtures/expected.mjs` (`:280-405` の該当の項目・`:929-931` の `UNDETECTED_NOTES`) | 包みの名前と説明の文を直し、新設の 1 つを足す |

## §11 記録 (完了の PR)

| ファイル | 変更 |
|---|---|
| `docs/glossary.md` | **SafePermissionMode** (`:980`): 「起動で選べる」を「安全 3 値。帯の条件に使う。起動・実行中で選べるのは Selectable permission mode」に。**Selectable permission mode (許可の 4 値)** と **Auto mode confirmation (Auto の確認)** を足す。**SessionControl** (`:615` 付近の Live session setting の定義): 「安全 3 値の中の遷移だけ」を「許可の 4 値の中。`auto` は確認つき (AD-066)」に。**Unsafe permission mode banner** (`:1398`): 「利用者が選んだ `auto` は Auto の帯 (`AutoModeBanner`) で、本帯は出さない」を足す。**autoModeSafe** (`:61`): 「無人実行 (Auto / `bypassPermissions`) を許してよいか」に「Auto は false でも確認つきで選べる (AD-066)」を足す。`LaunchQueryOptions` の項 (`:577`) と **SessionLaunchConfig** の項 (`:1098`) の `SafePermissionMode` を `SelectablePermissionMode` に |
| `docs/domains/session/charter.md` | `:186-188` の「X-4 時点では安全 3 値だけを提示する」を「起動・実行中とも許可の 4 値 (安全 3 値と `auto`)。`auto` は隔離の無いランタイムで確認つき (X-10 / AD-066)。capability に連動する昇格モード (`acceptEdits` / `bypassPermissions`) は I-3」に。`:353` の X-6 の項の「(安全 3 値の中)」はそのまま (023 の記録)。X-10 の項を足す。frontmatter の `related_adrs` に AD-066、`related_specs` に 026 |
| `docs/roadmap.md` | X-10 の行 (`:356`) に完了の記録。I-3 の行 (`:419`) は今の注記のまま |
| `docs/ui-coverage.md` | `:219` (`set_permission_mode`) の備考に「`auto` を含む許可の 4 値。隔離の無いランタイムでは確認つき (X-10 / 026)」。`:55` (`status`) と `:204` (`meter`) の割当の列の `UnsafeModeBanner` の後に `AutoModeBanner` を足し (書式は `実装済み: <部品> / … (実行中)` のまま。項目 21 の書式の検査で確かめる)、`:55` の備考の「安全 3 値の外のときの警告の帯」に「利用者が選んだ `auto` のときは Auto の帯 (026)」を足す。`:52` (`init`) の備考の「表示は権限モードの行と警告の帯」に「と Auto の帯」を足す |
| `.specify/memory/constitution.md` / `.specify/templates/plan-template.md` | §8.1 |
