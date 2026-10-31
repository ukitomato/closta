# Research: 権限モードの Auto (起動と実行中)

**Spec**: [spec.md](./spec.md) | **Date**: 2026-10-29 (`/cl-plan`)、2026-10-30 に載せ直し | 突き合わせたソースは 026 の枝 (e9dcfb8 = main 85f9856 の上。**025 (#32) と 024 (#33) はマージ済み**) の作業ツリー

本 feature は designer (Agent ツールを持たない) が `/cl-plan` で直接調べた。各節は「問い → 調べたこと → 決定 (P-n) → 退けた案」の順に書く。決定 P-1〜P-13 は plan の段の実装の選択で、spec の U-1〜U-5 (2026-10-29 に利用者が承認) の範囲の中にある。

**2026-10-30 の載せ直し**: 初版 (2026-10-29) は main 7f6ef94 (025 / 024 のマージ前) と突き合わせた。その後 025 (権限モードの選択を composer の左の群へ移し、名前を Claude Code の表記にした。AD-065) と 024 (`presets.json` を版 2 にした。AD-064) がマージされたので、行番号と次の 4 点を今のソースに合わせて直した — (1) 実行中の選択の置き場所 (R-08)、(2) 名前と説明 (AD-065 Decision 3。R-13)、(3) プリセットの版 2 → 3 (R-07)、(4) Constitution の版 1.5.0 → 1.6.0 (R-12)。決定 U-1〜U-5 と P-1〜P-6・P-9〜P-11 の中身は変えていない。

## R-01 SDK が `auto` を受けるか

- `@anthropic-ai/claude-agent-sdk` の `PermissionMode` は `'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'` (`sdk.d.ts:2327`)。説明は「`'auto'` - Use a model classifier to approve/deny permission prompts」(`:2325`)。起動の `permissionMode` と `Query.setPermissionMode(mode: PermissionMode)` の両方が同じ型を受ける
- モデルの情報に `supportsAutoMode?: boolean` (`:1312`)、設定に `disableAutoMode?: 'disable'` (`:8517`) がある。`auto` を使えるかはアカウント・モデル・設定で Claude Code が決める (spec Assumptions の 2 つ目)
- 分類器が判断しない操作は今の `canUseTool` に来る (`:1863-1868` の `'host'` が既定)。承認カードが `auto` で 0 になるとは限らない

**決定 P-1**: SDK の型・オプションは変えずに `auto` を渡す。`allowDangerouslySkipPermissions` は渡さない (`bypassPermissions` 用で、`auto` には要らない)。`auto` が使えない環境の失敗は Claude Code が返す今の失敗の経路で出す (起動の失敗・`control-result` の `rejected`)。SC-005 の記録の文は「承認カードを出さずに」ではなく「分類器が判断した操作は承認カードを出さずに」と読む (quickstart V-3)

## R-02 値の集合の置き場所 (FR-001〜FR-004)

今の閉じ方 (e9dcfb8):

| 段 | 場所 | 今の検査 |
|---|---|---|
| 型 | `src/domain/session/launch-config.ts:21-42` | `SafePermissionMode` / `SAFE_PERMISSION_MODES` / `isSafePermissionMode` / `assertSafePermissionMode` (AD-041 (a)) |
| 起動の設定 | `SessionLaunchConfig.permissionMode` (`:60`) / `hasValidBaseAxes` の最後 (`:181`。`isValidPresetConfigV1`・`isValidPresetConfig`・`isValidLaunchConfig` の 3 つが共有する) | `isSafePermissionMode` |
| 起動の query | `LaunchQueryOptions.permissionMode` (`agent-session.ts:130`)、`decodeLaunchOptions` (`sdk-agent-session.ts:322`, `:348`)、`buildQueryOptions` の呼び出し (`:890`)・`session-core.ts:257` | `assertSafePermissionMode(...)` |
| 実行中 | `SessionControl` の `set-permission-mode` (`agent-session.ts:360`)・`AgentSession.setPermissionMode` (`:387`)、main の `checkSetPermissionModeArgs` (`validate.ts:436-443`)、decoder (`session-core.ts:557`)、制御シンク (`sdk-agent-session.ts:797`) | 同じ述語と `assertSafePermissionMode(...)` |
| backstop | 項目 16 (`check.mjs:815` から。権限モードは `:925`・`:985-986` 付近)、`PERMISSION_MODE_ESCALATION_VALUES` (`allowlists.mjs:515`)、`SANCTIONED_PERMISSION_MODE_WRAPPER` (`:522`) | SDK を持つファイルで昇格の値の文字列リテラルを違反にし、`permissionMode:` の値と `.setPermissionMode(` の引数が包みで始まり閉じることを求める |

**決定 P-2**: 「許可の 4 値」を domain の新しい型 `SelectablePermissionMode` (`SafePermissionMode | 'auto'`) として `launch-config.ts` に置き、述語 `isSelectablePermissionMode` と実行時の包み `assertSelectablePermissionMode` を足す。**起動・実行中の値の検査はすべてこちらに付け替える** (上の表の 4 段)。`SafePermissionMode` と `isSafePermissionMode` は消さずに残し、帯の条件 (安全 3 値の外) と確認の条件 (`auto` か) に使う。`assertSafePermissionMode` は使い手が無くなるので消す (残すと「どちらで包むか」の判断が呼び出しごとに生まれる)

- 退けた案 A: `SafePermissionMode` に `auto` を足す — 「安全」の語が AD-020 の危険度表 (`auto` = 危険) と食い違い、帯の条件 (`!isSafePermissionMode`) が `auto` を見落とす
- 退けた案 B: 実行中だけ広げる — U-2 と FR-001 (起動でも選べる) に反する

## R-03 項目 16 の強さを保つ (FR-004 / SC-002)

- 今の P1 は SDK を持つファイル (`src/agents/`) で昇格の 3 値の文字列リテラルを禁止する。`auto` をリストから外すと、agents が `permissionMode: 'auto'` と直書きできるようになる (包みの検査は `assertSelectablePermissionMode('auto')` を通す)
- agents は `auto` を直書きする必要が無い。値は main から `LaunchQueryOptions` / `SessionControl` で届き、包みを通るだけ。resume の init の検査 (R-05) も起動の値との比較で書ける

**決定 P-3**: `PERMISSION_MODE_ESCALATION_VALUES` は 3 値のまま残す (agents の `'auto'` の直書きは今どおり違反)。`SANCTIONED_PERMISSION_MODE_WRAPPER` を `'assertSelectablePermissionMode'` に替える。違反の文言の「安全 3 値 {default, plan, dontAsk} のみ」を「許可の 4 値 {default, plan, dontAsk, auto} のみ。`acceptEdits` / `bypassPermissions` は不可 (AD-066)」に替える。rule fixture は包みの名前を差し替える 4 つ (`a-direct/sdk-permission-mode-unwrapped`・`b-equivalent/sdk-permission-mode-wrapper-chained`・`b-equivalent/sdk-set-permission-mode-unwrapped`・`b-equivalent/sdk-set-permission-mode-wrapper-escape`) と、新しい 1 つ `a-direct/sdk-set-permission-mode-escalation-literal` (`.setPermissionMode(assertSelectablePermissionMode('bypassPermissions'))` が P1 で発火する) を持つ。`a-direct/sdk-query-escalation-options` (`permissionMode: 'auto'` を含む) は P1 で発火したまま変えない

- 退けた案: 包みを 2 つ (`assertSafePermissionMode` と `assertSelectablePermissionMode`) 許す — 項目 16 の許可の包みが 2 つになり、どちらを使うべきかを検査で表せない

## R-04 確認の判定の入力 (FR-005 / FR-006)

- main: `RuntimeDescriptor.capabilities` → `isAutoModeAllowed(c)` (`capabilities.ts:160`、`c.autoModeSafe === true`)。`dto-mapper.ts:37-38` が DTO の `autoModeAllowed` を同じ関数から作る
- renderer: `RuntimeDTO.capabilities.autoModeAllowed` (ゲート用) と `autoModeStatus` (表示用)。DTO の不変条件で「表示に `autoModeAllowed` を使わない」(`dto.ts`)。`running-sessions-view.ts:31-35` は表示用の `runtimeAutoMode` だけを返す
- Win32Runtime は `fixedCapabilities` (sandbox `none`) で `autoModeSafe` が `false`。判定中 (`unknown`) も `isAutoModeAllowed` は false

**決定 P-4**: 確認が要るかを domain の純関数 `requiresAutoModeConfirmation(mode, autoModeAllowed: boolean)` (`mode === 'auto' && !autoModeAllowed`) 1 つで決め、main と renderer が共有する。引数の真偽は main では `isAutoModeAllowed(descriptor.capabilities)`、renderer では DTO の `autoModeAllowed` (main が `isAutoModeAllowed` から作った値) で、どちらも単一の判定点を通る (FR-006)。ランタイムが一覧に無い・DTO が無いときは false (確認を挟む)。renderer の `running-sessions-view` に `runtimeAutoModeAllowed(runtimeId)` (ゲート用) を足し、注記を「表示には `runtimeAutoMode` を使う。ゲートは `runtimeAutoModeAllowed`」に直す

- 退けた案: renderer で `autoModeStatus === 'allowed'` を見る — 表示用の値をゲートに使うことになり、DTO の不変条件に反する

(`running-sessions-view.ts` は `src/renderer/src/features/session/` にある。`runtimeAutoMode` の注記は `:30-35`)

## R-05 再開の init の検査 (AD-059 Decision 3 / X-9 FR-017)

- `sdk-agent-session.ts:980-990` (判定は `:986`): 最初の `init` で `launchOptions.resume !== undefined && !isSafePermissionMode(initRecord?.permissionMode)` なら `fail('resume-failed')`。再開した会話が昇格のモードで戻ってきたら止める fail-closed の検査
- `auto` を許すと、`auto` で再開を頼んだセッションが `init` で `auto` を報告して落ちる

**決定 P-5**: 条件を「`init` の権限モードが安全 3 値、または起動で頼んだ値 (`launchOptions.permissionMode`) と同じ」なら通す、に替える。`'auto'` の文字列を agents に書かない (P-3)。頼んでいない昇格 (`default` で再開して `auto` が戻る・`bypassPermissions` が戻る) は今どおり `resume-failed`。AD-066 の「読み替える箇所」に AD-059 Decision 3 を載せる

- 退けた案: `isSelectablePermissionMode(init)` で通す — `default` で頼んだ再開が `auto` で戻っても通り、fail-closed が弱まる

## R-06 main が確認の印を必須にする (FR-007 / SC-003)

- 起動は `handleLaunchSession(deps, args)` (`session-ipc.ts:176-200`) → `launchService.launch(config)` (`session-launch-service.ts:553`) → `startSession` (`:492-550`)。再開は `handleResumeSession` (`session-ipc.ts:226-240`) → `resumeService.resume(request)` → `launchService.resume(config, resolved)` (`:555-566`) → `startSession`。実行中は `handleSetSessionPermissionMode` (`session-ipc.ts:398-406`) → `launchService.setPermissionMode(sessionId, mode)` (`:620-626`)。どれも `startSession` / `setPermissionMode` に集まる
- 登録簿の `Entry.axes.runtimeId` (`:517-521`) で実行中のセッションのランタイムが引ける。起動は `config.runtimeId`
- renderer の呼び出しは `running-session-store.ts` の `launch` (`:840`)・`resume` (`:882`)・`setPermissionMode` (`:1016-1026`) の 3 か所に集まる (`RunningSessionsView.launch` / `.resume` も store を通る。`running-sessions-view.ts:42`, `:47`)
- ランタイムの記述子は composition-root の `runtimes.snapshot()`、e2e は `knownRuntimes`

**決定 P-6**: IPC の 3 つの口に 3 つ目の引数 `autoModeAcknowledged` を足す (`launchSession(config, origin, ack)`・`resumeSession(request, origin, ack)`・`setSessionPermissionMode(sessionId, mode, ack)`)。main は **`=== true` だけを承諾とみなし**、他の値 (欠け・`false`・型の違う値) は承諾なしとして扱う (起動そのものは拒否しない。確認が要る要求だけが落ちる)。判定は `session-launch-service` の 2 か所 (`startSession` の先頭と `setPermissionMode`) だけに置き、新しい必須の依存 `autoModeAllowed(runtimeId): boolean` で引く。拒否の理由は新しいキー `auto-mode-unconfirmed` (起動・再開は `LaunchPreflightReason` に、実行中は `LiveSettingFailure` に足す)。agents は印を見ない (値の集合だけを検査する)

- 退けた案 A: `SessionLaunchConfig` に `autoModeAcknowledged` を足す — 設定の形が変わり、プリセット・`lastConfig` に印が残って確認を省く経路になる (FR-012 に反する)
- 退けた案 B: 印の検査を IPC の handler に置く — 3 か所に分かれ、再開の経路 (resume-service を通る) で漏れやすい
- 退けた案 C: renderer の確認だけに頼る — FR-007 に反する

## R-07 プリセットと `schemaVersion` (FR-012 / AD-042)

- **024 (#33) が既に版 2 にした**: `preset-record.ts:27` `PRESET_SCHEMA_VERSION = 2`、`:30` `SUPPORTED_PRESET_SCHEMA_VERSIONS = [1, 2]`。`toPresetRecord(value, version)` が版 1 を前 6 軸の検証と既定の補完で読み替える (`:39` 付近。AD-064 Decision 4)。読み込みは `schemaVersion > PRESET_SCHEMA_VERSION` を `schema-version-unknown`、対応表に無い値を `parse-failed` (`preset-store.ts:119-127`)。値の検査は `isValidPresetConfig` (`launch-config.ts:181` が権限モードを見る)
- AD-042 (`0042-…md:60`) は「enum を拡張する feature は `schemaVersion` を上げ、版ごとの読み替え関数を store の内側に置く」とし、例に「I-3 (権限モードの拡張)」を挙げる
- `launch-usage.json` は起動の設定を持たない (`launch-usage.ts`)。他の store に権限モードは無い

**決定 P-7**: プリセットの `schemaVersion` を **2 → 3** にする (`SUPPORTED_PRESET_SCHEMA_VERSIONS = [1, 2, 3]`)。版 3 は版 2 と同じ形で、権限モードの述語だけが許可の 4 値に広がる。版 1 の読み替え (024) と版 2 は今のまま (中身は安全 3 値なので新しい述語を通る)。書き出しは 3。古い版の Closta (版 2 まで) が 3 を読むと今どおり `schema-version-unknown` で、`auto` を知らない版が `auto` のプリセットを誤読しない。プリセットの読み込みで確認を省かない (起動の前に確認。R-08)

- 退けた案: 版 2 のまま `auto` を受ける — 024 の版 2 を読む Closta (026 の前) が `auto` のプリセットを `parse-failed` で退避し、ファイル全体が読めなくなる (AD-042 の規則に反する)

## R-08 確認の UI の形 (FR-005 / SC-001)

- 起動の設定は Radix の Dialog の中 (`LaunchDialogHost`)。既存の確認 (既定 Provider での起動) は入れ子の modal を避けて、ダイアログの中に `role="alertdialog"` の枠と 2 つのボタンを出す (`LaunchDialog.tsx:1088-1116`)。権限モードの選択は `:877-890`
- **実行中の権限モードの選択は 025 で composer の左の群に移った**: `LivePane.tsx` の `LiveComposerSettings` (`:406-486`) が `LiveSettingsControls` (`useConfirmedSelect`。キーボードは Enter / blur で確定) を描き、`onSelectPermissionMode` は `LivePane` (`:197`, `:210`) から渡る `session.setPermissionMode`。中央のヘッダ (`CenterHeader.tsx:76`) に残るのは失敗の 1 行 (`LiveSettingError`) だけ
- 承認カード・問いのカードは `LivePane` の列の上側 (`:311-336`。`px-4 pt-3` の枠) に出る
- SC-001: 隔離の無いランタイムで 2 操作 (選ぶ・承諾する)、あるランタイムで 1 操作

**決定 P-8**: 確認は 1 つの部品 `AutoModeConfirmation` (`features/session/`) にし、起動の設定とヘッダの両方で使う。既存の Provider の確認と同じく入れ子の modal にせず、その場に `role="alertdialog"` の枠 (見出しの `aria-labelledby`・文の `aria-describedby`・2 つのボタン) を出し、開いたら承諾のボタンではなく**取り消しのボタンに焦点を置く** (Enter の連打で承諾しない)。Escape は取り消し。文言は data-model §6

- 起動の設定: 権限モードの選択で `auto` を選び確認が要るなら、下書きを変えずに確認を開く。承諾で `auto` にし、承諾したランタイムの id を持つ。起動を押した時点で確認が要るのに持っている id が今のランタイムと違う (プリセット・`lastConfig`・ランタイムの変更で `auto` が入った) なら、起動の前に同じ確認を出す。Provider の確認と重なるときは Provider の確認が先
- 実行中 (composer の左の群): `auto` を選び確認が要るなら、要求を送らずに確認を開く。確認の状態は `LivePane` が持ち、**承認カードと同じ列の上側の枠** (`px-4 pt-3`) に出す (composer の行は 1 行の flex で、枠の大きさの部品を置けない)。取り消しでは何も送らず、composer の入力へ焦点を戻す。確認の間に受け付けの条件が外れた (`liveSettingBlocker` が非 null。セッションの終了を含む) ら確認を閉じ、送らない (spec Edge Cases の 1 つ目)。`LivePane` はセッションごとに描き直すので、切り替えで閉じる

- 退けた案 A: Radix の `AlertDialog` を入れ子にする — 起動の設定の Dialog の中で焦点の罠が 2 重になる (既存の Provider の確認が同じ理由で入れ子にしていない)
- 退けた案 B: 実行中の確認を中央のヘッダの `LiveSettingError` の上に出す (初版の案) — 025 で選択が composer の左の群に移り、選んだ場所と確認の場所が画面の上下に離れる。状態も `CenterHeader` と `LivePane` にまたがる

## R-09 帯の文言と読み上げ (FR-008 / SC-004)

- 今の `UnsafeModeBanner` (`CenterBanners.tsx:53-94`) は `meters.permissionMode` が非 null で安全 3 値の外なら `role="alert"` の帯を出す。文言は `UNSAFE_MODE_BANNER_LABELS.unsafeModeBanner(PERMISSION_MODE_NAMES[mode])` + 隔離の文 (`autoModeStatus` から。`shell/labels.ts:157` 付近)。名前は 025 から Claude Code の表記 (`Auto` など。AD-065 Decision 3)
- 「利用者が Closta から選んだ `auto`」かを見分ける値が今は無い。`LiveSession.config.permissionMode` は起動の値で、実行中の変更は書き戻さない (`running-session-store.ts:1016-1026` は `beginSetting` / `endSetting` だけ)
- 成功の `meter` が IPC の結果より先に届くことがある (live-signals の `onPermissionModeApplied` が制御シンクの成功で `meter` を流す)。結果を待ってから「選んだ」を記録すると、その間に `UnsafeModeBanner` (`role="alert"`) が一瞬出て読み上げられる

**決定 P-9**: renderer のストアに `chosenPermissionMode` (利用者が Closta から選んだ今の値) を持つ。初期値は起動の設定の値。実行中の変更は**要求を送る時点で**新しい値にし、失敗 (`ok: false`) で前の値に戻す。帯は次の 2 つに分ける:

| 観測した値 (`meters.permissionMode`) | `chosenPermissionMode` | 出す帯 |
|---|---|---|
| `auto` | `auto` | **Auto の帯** (新設) — 「選んだ」の文言と隔離の文。`role="note"` (alert ではない)。読み上げは別の live region から 1 回 |
| 安全 3 値の外 (`auto` を含む) | それ以外 | 今の `UnsafeModeBanner` のまま (原因を断定しない。`role="alert"`) |
| null・安全 3 値 | — | 出さない |

読み上げ: Auto の帯は視覚の帯 (`role="note"`) と別に `sr-only` の `role="status"` を持ち、**帯を描いている間に観測の値が `auto` 以外から `auto` に変わったときだけ** 文を入れる (前の値は `useRef`)。描いた時点で既に `auto` のとき (別のセッションから切り替えて戻った・再 mount) は読み上げない。1 回の切り替えにつき 1 回 (SC-004)

- 退けた案 A: Auto の帯も `role="alert"` — 利用者が自分で選んだ状態の表示で、セッションを開き直すたびに割り込んで読み上げる (U-5「読み上げは切り替えたときの 1 回だけ」)
- 退けた案 B: 成功の結果を待って `chosenPermissionMode` を変える — 上の一瞬の `UnsafeModeBanner` が出る
- 退けた案 C: main が「選んだ」を持つ — renderer の表示のためだけの値で、main の registry に表示の状態を増やす (023 R-07 と同じ理由)

## R-10 再開の初期値 (spec Edge Cases の 5 つ目)

- `resume-action.ts:55-62` (権限モードは `:58`): 稼働中の行の再開の初期値は `config.permissionMode` を写す。起動が `auto` なら初期値が `auto` になり、spec の「前のセッションが `auto` でも再開の初期値は起動の既定 (今の規則のまま)」と食い違う。spec の「今の規則のまま」は過去の行には当たるが、稼働中の行には当たらない (plan の「設計後の見直し」に書く)

**決定 P-10**: 再開の初期値を組む 1 か所で、権限モードが `auto` なら起動の既定 (`default`。`EMPTY_DRAFT` の値) に置き換える (domain の `resumeInitialPermissionMode`)。安全 3 値は今どおり写す。`auto` を選び直すなら確認が出る

## R-11 E2E の偽の capability (SC-001 / SC-004)

- `e2e-capability.ts:511` 付近: 偽のランタイムはすべて `autoModeAllowed: false, autoModeStatus: 'unavailable'`。ホストは `fixedCapabilities`
- 偽の supervisor の `set-permission-mode` は `meter` の `permission-mode` を流して成功を返す (`:440-441`)。起動 (`:324` の `launch(sessionId)`) は起動の権限モードを流さない
- `e2e/launch-dialog.spec.ts:78-94` は「3 つだけ・`auto` は 0」を確かめている (Principle III の E2E)。Constitution III の Verification の正本

**決定 P-11**: 偽の起動は起動の options の `permissionMode` を `meter` の `permission-mode` として 1 回流す (実機の `init` の代わり)。e2e の起動の service に `autoModeAllowed` (`knownRuntimes` から `isAutoModeAllowed`) を渡す。`launch-dialog.spec.ts` の Principle III の E2E を「4 つ (`acceptEdits` / `bypassPermissions` が無い)・`auto` を選ぶと確認が出て、取り消すと前の値」に書き直す (Constitution III の新しい Verification)。隔離のあるランタイムで確認が出ない (1 操作) ことは renderer の単体テストで確かめる (E2E の偽のランタイムに隔離のあるものが無い)

## R-12 Constitution の改定と ADR の番号

- Principle III の Statement (`constitution.md:470`) は「`autoModeSafe !== true` のランタイムで Auto / `bypassPermissions` を選択可能にしてはならない」。Examples (`:475-476`) と Verification (`:479`) が Win32 で disabled を求める。Adoption metadata の `amended` は `:467`
- 改定手順: ADR → architecture-reviewer を交えた人間のレビュー → SemVer → Amendment trail → 既存違反の enumeration。適合の状態を広げる改定は MINOR (1.3.0 / 1.4.0 / 1.5.0 の先例)
- **Constitution は今 1.5.0** (frontmatter `:3`、Sync Impact Report v1.5.0 `:9-27`、Amendment trail `:1107`、脚注 `:1119`)。025 が AD-065 で Principle XV の Exceptions を足した
- `docs/decisions/` は 0066 まで (0064 = 024、0065 = 025、0066 = 本 feature で起こした)
- roadmap は O-12 の判断で Principle XII の別の改定を別の PR に送っている (版はまだ振られていない)

**決定 P-12**: AD-066 を本 plan で起こした (`docs/decisions/0066-auto-permission-mode-with-confirmation.md`。status は `proposed`。Constitution の改定手順 2 の人間のレビューを PR で受けて accepted にする)。Constitution は実装の PR で **1.5.0 → 1.6.0** (MINOR) に改め、Statement・Why・Examples・Verification・Adoption metadata・Sync Impact Report・Amendment trail・frontmatter・脚注を直す (新しい本文は data-model §8)。版が他の PR (Principle XII の改定) と重なったら、後にマージする方が次の MINOR に振り直す (plan RK-03)

## R-13 025 (AD-065) の名前の規則との整合

- AD-065 Decision 3: 権限モードの名前は Claude Code の CLI の表記をそのまま使い (`auto` = `Auto`)、**説明を付けない**。名前の表は `features/chat/labels.ts` の `PERMISSION_MODE_NAMES` (`:379`) の 1 か所。囲む文は日本語。`PERMISSION_MODE_DESCRIPTIONS` は 025 で外した
- 同 Decision 3 の最後の項「選べる値は変えない: AD-062 の安全 3 値のまま。昇格の値の名前は、帯と transcript の行で読むためだけにある」— 本 feature が `auto` を選べる値にすることと食い違う
- `features/session/labels.ts:435-439` の `PERMISSION_MODE_LABELS` は `Record<SafePermissionMode, string>` で、値は `PERMISSION_MODE_NAMES` から取る

**決定 P-13**: `PERMISSION_MODE_LABELS` を `Record<SelectablePermissionMode, string>` にし、`auto: PERMISSION_MODE_NAMES.auto` を足す (説明は足さない)。確認と Auto の帯の文は名前を引数に取る関数にし、呼び出し側が `PERMISSION_MODE_NAMES.auto` を渡す (名前を文に直書きしない。data-model §9)。AD-065 Decision 3 の「選べる値は変えない」は AD-066 の「読み替える箇所」に載せる。renderer の `'auto'` との比較は domain の述語 `isAutoPermissionMode` を通す (昇格の値の綴りを domain に置く今の形を保つ。`meter.ts:24` の注記・AD-047 Decision 5)

- 退けた案: 確認の文に「自動で判断」(025 の前の日本語の名前) を使う — AD-065 Decision 3 と Constitution 1.5.0 の XV の例外に反する
