# Research: 起動中のセッションの UI の手直し (O-13)

**Spec**: [spec.md](spec.md) / **Plan**: [plan.md](plan.md) / **ADR**: [AD-065](../../docs/decisions/0065-live-model-list-and-claude-code-permission-mode-names.md)

designer agent は Agent ツールを持たないので、調べた結果を本書に直接書く。各節は Decision / Rationale / Alternatives の順に書き、根拠は `path:line` で示す (2026-10-29 の作業ツリー)。

---

## R-01 `Query.supportedModels()` の形と呼べる条件

**Decision**: 既定の Provider のセッションで、最初の応答の後に `supportedModels()` を 1 回呼ぶ。renderer が選択を出すときに main に要求する (pull)。返り値の `ModelInfo[]` は `{ id: value, displayName, supportedEffortLevels }` に写し、モデルカタログの検査 (`isValidModelEntry`) を通す。

**Rationale**:
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2763` は `supportedModels(): Promise<ModelInfo[]>` と定義している。`ModelInfo` (`sdk.d.ts:1276`) は次のフィールドを持つ
  - `value` / `displayName` / `description`
  - 任意の `resolvedModel` / `supportsEffort` / `supportedEffortLevels?: ('low'|'medium'|'high'|'xhigh'|'max')[]`
  - 任意の `supportsAdaptiveThinking` / `supportsFastMode` / `supportsAutoMode`
- `value` は `setModel(model)` にそのまま渡せる値である (SDK の型の説明「Model identifier to use in API calls」)
- 呼ぶのは Claude Code への control request で、`system/init` の後でないと答えが無い。023 の「最初の応答の後に変更できます」(`liveSettingBlocker` の `launching` → `not-ready`。`src/domain/session/live-settings.ts:37`) と同じ条件で閉じれば、spec の Edge Cases (最初の応答の前は呼ばない) を満たす
- 写した先を `ModelEntry` の形にすると、023 の `switchableModels(models, effort)` (`src/domain/provider/model-catalog.ts`) と `isValidModelEntry` の id の文字種 (`/^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]*$/`) をそのまま使える。`sonnet[1m]` のような値も通る
- `supportedEffortLevels` の値の集合は SDK と Closta の `EffortLevel` で同じ 5 値である。外れた値が来たら `isValidModelEntry` が項目ごと落とす

**Alternatives**:
- `init` の直後に必ず呼んで push する: 一覧を見ないセッション (Provider のカタログを持つもの) でも呼ぶことになる (AD-065 Alternatives)
- `initializationResult()` の `models` を使う: 023 では分類だけで中身を確かめていない。版によって入っているかが分からない。`supportedModels()` は目的の API である

## R-02 一覧の要求と結果の経路

**Decision**: 次の 4 つを足す。
- `SessionControl` の `{ kind: 'list-models', requestId }`
- supervisor の WorkerMessage `{ kind: 'models-result', requestId, models: ModelEntryLike[] | null }`
- `SupervisorEvent` のデコーダの `models-result`
- main の `SupervisorConnection.onModelsResult`

main は 023 の `pending` の表 (`session-launch-service.ts:524` `requestControl`) と同じ形の待ちを持つが、`changing` は立てない。期限は `CONTROL_RESULT_TIMEOUT_MS` (10 秒) を共用する。

**Rationale**:
- 023 の `control-result` は「要求の id と成否だけ」を運ぶ (`src/agents/supervisor-protocol.ts`)。一覧は値を運ぶので別の種類にする。`control-result` に任意のフィールドを足すと、成否だけのデコーダと、値の検査の要るデコーダが混ざる
- `changing` を立てないのは、一覧の取得は設定を変えないからである。立てると、取得の間は権限モードの変更が `busy` で拒まれる
- 調停役スレッドは中身を解釈せず即座に中継する。一覧は小さい (64 件 × 短い文字列) ので、`BODY_MAX_BYTES` の窓には載せない。main は受け取りの側でもう一度検査する (Principle IX: main で JSON の stream を解かない。届くのは構造化複製の値)

**Alternatives**:
- `SessionEvent` (data plane) に載せて renderer が直接受ける: main の `setModel` の検証が「最後に受け取った一覧」を持てない (FR-006)
- 新しい短命のプロセスで `query()` を起こして聞く: 起動の env と Provider を合わせ直す必要がある。動いているセッションが答える値と食い違いうる

## R-03 権限モードの Claude Code の表記

**Decision**: Claude Code 2.1.312 の CLI の権限モードの表の `title` を使う。

| 値 | `title` (採る) | `shortTitle` | 
|---|---|---|
| `default` | `Manual` | `Manual` |
| `plan` | `Plan` | `Plan` |
| `acceptEdits` | `Accept edits` | `Accept` |
| `bypassPermissions` | `Bypass Permissions` | `Bypass` |
| `dontAsk` | `Don't Ask` | `DontAsk` |
| `auto` | `Auto` | `Auto` |

`unknown` は Closta の値なので、日本語の「不明なモード」のまま残す。

**Rationale**:
- 照合したのは、利用者の環境の `claude` (`~/.local/bin/claude.exe`、`--version` は 2.1.312) に埋め込まれた表である。各モードは `{ title, shortTitle, indicator }` を持つ。`shortTitle` の `DontAsk` は語の区切りが無く読みにくい。`title` は選択と帯のどちらでも読める
- SDK の設定の型には「`manual` は `default` の別名として受け付ける」とある。CLI が `default` を `Manual` と出すことと合う
- 名前の表は `features/chat/labels.ts:373` の `PERMISSION_MODE_NAMES` 1 か所にある。`features/session/labels.ts:427` の `PERMISSION_MODE_LABELS` はそこから取っている。読む側 (帯 `CenterBanners.tsx:94`・「概要」`OverviewTab.tsx:112`・選択 `LiveSettingsControls.tsx:232`・transcript の行 `SYSTEM_EVENT_LABELS`) は変えなくてよい (FR-009 は今も満たしている)
- 説明 `PERMISSION_MODE_DESCRIPTIONS` (`features/session/labels.ts:461`) を読むのは `LaunchDialog.tsx:765` だけである

**Alternatives**:
- VS Code 拡張の表記: 利用者が退けた (spec Clarifications)
- `indicator` (`manual mode` …): 小文字の状態表示で、選択の項目の名前ではない

## R-04 Esc で生成を止める

**Decision**: 新しい keydown の処理を足さない。assistant-ui の `ComposerPrimitive.Input` の `cancelOnEscape` (既定 true) で止める。止まることと止まらないことは単体と E2E で固定する。

**Rationale**:
- `node_modules/@assistant-ui/react/dist/primitives/composer/ComposerInput.js` の `useEscapeKeydown` は次の順で動く
  - 対象が textarea の中で、かつ `!e.isComposing` のときだけ動く
  - トリガーのポップオーバー (コマンドの候補) が先に Esc を受ける
  - 残ったときに `canCancel` なら `composer.cancel()` を呼ぶ
- スレッドの composer の `canCancel` は `capabilities.cancel && thread.isRunning` である。`cancel()` は `runtime.cancelRun()` を呼び、Closta では `onCancel: session.interrupt()` (`RunningSessionsProvider.tsx`) に届く
- これで FR-012 / FR-013 の条件は揃う。composer にフォーカスがある・変換中でない・候補が開いていない・生成中、の 4 つである。AD-037 (`docs/decisions/0037-japanese-ime-composer-behavior.md:69` の `useEscapeKeydown` の `isComposing` 無視、`:87` の「`onKeyDown` 未上書き」) とも合う
- 承認カード・ダイアログ・選ぶ画面にフォーカスがあるときは、対象が textarea の外なので発火しない (FR-013)
- 実機でまだ効いていないように見えたのは、停止ボタンにフォーカスが移った状態で Esc を押した場合か、そもそも試していない場合と考えられる。原因の切り分けは quickstart V-4 で行う

**Alternatives**:
- `onKeyDown` を足して `interrupt()` を呼ぶ: ライブラリの判定 (候補・変換中・実行中) を二重に持つ。AD-037 の「自前ガードを新設しない」に反する
- **代替の最小案**: 単体で「ライブラリでは止まらない」と分かった場合だけ、`Composer` の `ComposerPrimitive.Input` に `onKeyDown` を足す。ライブラリは `composeEventHandlers` で消費側の handler の後に自分の処理を差し込むので、ガードは残る (AD-037 :87)。条件は `key === 'Escape' && !nativeEvent.isComposing && isRunning`。tasks では先に単体を書き、落ちたときだけこの形をとる

## R-05 停止ボタンの見た目

**Decision**: 停止ボタンの variant は `outline` にする (`default` から変える)。大きさ (`size-7`)・丸 (`rounded-full`)・場所 (送信ボタンと同じ位置) は変えない。

**Rationale**:
- `src/renderer/src/components/ui/button.tsx` の variant は `default` / `destructive` / `outline` / `secondary` / `ghost` / `link` の 6 つ。送信ボタン (待機中) は `default` (強調色の塗り) である
- `ghost` は枠も背景も無い。生成中に送信ボタンが消えた後、その位置にボタンがあると分かりにくくなる。`outline` は枠でボタンと分かり、塗りが無いので送信より弱い
- spec の [ASSUMED] (`outline` か `ghost`) の範囲内で決める
- アイコン (`SquareIcon`) と `aria-label` (`COMPOSER_LABELS.stop`) は変えない

**Alternatives**: `ghost` (上記の理由で退ける)、`secondary` (灰色の塗りで `default` との差が小さい)

## R-06 モデルと権限モードの選択の置き場所

**Decision**: `ComposerExtensions` に `settings?: ReactNode` を足し、`ComposerAction` の左の群 (添付のボタンの右) に描く。LivePane が `LiveSettingsControls` を渡す。中央のヘッダからは `LiveSettingsSlot` を外し、`EditableSessionTitle` と `LiveSettingError` は残す。

**Rationale**:
- `thread.aui.tsx:784` の `ComposerAction` は、左に `ComposerAddAttachment`、右に音声入力・送信・停止を並べる。左の群に選択を足しても、入力欄 (`ComposerPrimitive.Input`) にも IME のガードにも触れない (FR-003)
- `ComposerExtensions` (`features/chat/composer-extensions-context.ts`) は O-10 が composer に外から足すために作った口である (`commands` / `retryTextFor`)。同じ口に足せば、`thread.aui.tsx` は描く場所を持つだけで済み、セッションの知識を持たない
- 選択の部品 (`LiveSettingsControls`) は native の `<select>` と `useConfirmedSelect` (キー操作は Enter か blur で確定) を持つ。023 pr-gate R1 H-003 / WCAG 3.2.2 で決めた形なので、そのまま移す
- 確定の後に composer の入力へフォーカスを戻すのは、`focus-handoff.ts` の `handOffFocusToComposer` を使う (O-4 FR-019 の既存の関数)
- composer の幅が狭いとき入力欄を押しつぶさないよう、`ComposerAction` は 1 行の flex のまま選択の側を `min-w-0` + `truncate` + `max-w-*` で縮める。入力欄は `ComposerAction` の上の行なので、選択が幅を取っても入力欄の幅は変わらない
- 押せない理由は今も選択の横に 1 行で見える (`LiveSettingsControls.tsx:162`)。composer の下の段では幅を取るので、理由の行は選択の群の下に回す (`flex-wrap`)

**Alternatives**:
- registry の Composer model picker / Model selector の element を取り込む: 選べるのはモデルだけである。安全 3 値の権限モードと、023 の確定の規則 (キー操作で通過した値ごとに変えない) を持たない。Principle XIII の照合の結果は「未使用」のまま、置き場所の文言だけを直す (plan「設計後の見直し」)
- composer の上 (入力欄の上) に帯として置く: 入力欄との間に要素が増え、O-10 の候補のポップオーバーの位置と重なる

## R-07 右のパネルのタブ

**Decision**: タブの並び (`RightPanel.tsx` の tablist) を次のようにする。
- 並び: `flex min-w-0 flex-1 gap-1 overflow-x-auto` にして、スクロールバーを細くする
- 各タブ: `shrink-0 whitespace-nowrap`
- 選んだタブとフォーカスの移ったタブ: `scrollIntoView({ block: 'nearest', inline: 'nearest' })` で見える位置に寄せる

名前は省略しない。

**Rationale**:
- 5 つのタブ (`panel-tabs.ts`: 概要 / 使用量 / 構成 / 会話の地図 / 背景の task) は `text-xs px-2` で幅 320px (`SHELL_WIDTHS.panel`) に入りきらない。今は `flex-1` の中で縮んで折り返している
- 横スクロールにすると名前は全部 1 行で読める。←/→/Home/End の roving tabindex (`RightPanel.tsx`) で隠れたタブにも届き、選ぶと見える位置に来る (US-4 AC1)
- 省略しないので、US-4 AC3 (省略された名前をポインタと読み上げで分かる) は当たらない。FR-014 の「省略された名前は…」は条件つきの要求なので満たす
- ペインの幅の可変化はしない (U-6)

**Alternatives**: 省略 + ツールチップ。「会話の地図」「背景の task」が数文字に切れ、どのタブかが読めない。ツールチップはキーボードの利用者に出にくい

## R-08 使用量のタブの値の崩れ

**Decision**: `UsageTab.tsx` の `Items` を次のようにする。
- 格子: `dl` を `grid-cols-[minmax(0,1fr)_auto]` にする (ラベルは縮んで改行してよい、値は縮まない)
- 値の `dd`: `whitespace-nowrap tabular-nums text-end`
- トークンの内訳: `dd` の中に入れ子にしている `Items` を、親の行と別の全幅の行 (`col-span-2`) に出す

**Rationale**:
- 今は `dl grid grid-cols-[auto_1fr]` で、`dd` が `min-w-0 break-words` である。長いラベル (「拒否された操作の合計 (SDK の記録)」「キャッシュの読み込み」) が `auto` の列を広げ、値の列が細くなって数字の途中で折れる
- トークンの内訳は値の `dd` の中にさらに `dl` を入れている。内側の格子が外側の値の列の幅に押し込まれるのが、崩れの直接の原因である
- spec の FR-015 は「長いラベルの側を省略・改行してよい」としているので、ラベルの側を縮める

**Alternatives**: 値を省略 (`truncate`) する。数字の桁が欠けると誤読になる

## R-09 `/resume` の候補と横取り

**Decision**: アプリのコマンドの表を `features/chat/app-commands.ts` に置き、次の 3 つを持たせる。
- 表 `APP_COMMANDS = [{ name: 'resume', kind: 'app' }]`
- 判定 `parseAppCommand(text): 'resume' | null` (前後の空白を除いて `/^\/resume(\s|$)/`。引数は捨てる)
- 合成 `mergeCommandCandidates(app, reported)` (同名の Claude Code のコマンドを落として app を残す)

候補は `ComposerExtensions.commands` にこれを合成したものを渡す。送信の横取りは `composer-queue-adapter.ts` の `createCappedAdapter` に `intercept?: (text: string) => boolean` を足して、steer / enqueue の前で行う。`RunningSessionsProvider` の `onNew` の経路でも同じ `intercept` を通す。

**Rationale**:
- `/` の候補は `Unstable_TriggerPopover.Directive` で、選ぶと `/{name} ` が入る (`slash-commands.ts` の `slashFormatter`)。選んでも送らない (glossary「Slash command candidates」)。AC2 の「候補から選ぶ・Enter」は、選んで入った `/resume ` を Enter で送ると読む。送信を横取りすれば候補の部品は変えずに済む
- `Unstable_TriggerPopover.Action` (選んだら実行) は 1 つのポップオーバーに 1 つの振る舞いしか持てない。Claude Code のコマンドの Directive と混ぜられない
- 送信は、実行中なら queue adapter の steer / enqueue を通り、待機中なら runtime の `onNew` を通る (`RunningSessionsProvider.tsx` / `running-session-store.ts:645` `createQueue`)。両方の入口で同じ純関数を通せば、どちらの状態でも Claude Code に送られない (FR-017)
- 送信で composer の入力は空になるので、閉じた後に `/resume` は残らない (US-5 AC5)
- 候補の見分け (FR-016) は、候補の説明の欄に「アプリのコマンド」と出す。`SlashCommandSource` の `description` を使い、`argumentHint` は空にする
- `ComposerCommandRoot` は候補が空のとき描かない (`composer-extensions.tsx`)。アプリのコマンドが常にあるので、稼働中のセッションでは meters が届く前から候補が出る

**Alternatives**:
- `Composer` の `onKeyDown` で Enter を見て横取りする: AD-037 の「`onKeyDown` 未上書き」に反し、変換中の Enter の判定を二重に持つ
- 候補を選んだ瞬間に開く (`Action`): 上記の理由で Directive と共存できない。また、Enter で送る経路 (候補を使わずに打つ) を別に塞ぐ必要が残る

## R-10 `/resume` の選ぶ画面

**Decision**: `features/session/ResumePickerDialog.tsx` を足す。中身は次のとおり。
- 部品: `Dialog` に、O-3 が registry から取った `CommandPalette` の表示 (`components/assistant-ui/elements/command-palette.tsx`) を入れる
- 候補: セッションの索引 (`useSessionsStore((s) => s.index)`) のうち、`kind: 'folder'` で `folderId === live.config.folderId` のグループの過去のセッション。並びはグループの順 (過去の一覧と同じ新しい順)
- 題: `sessionTitle` / `rowTitleText` (`features/session-list/rows.ts`)
- 選んだ後: `resolvePastResume(targetKey, sessionId)` を呼ぶ
  - ok なら閉じて、`PastResumeBar` と同じ `openResume` + `setLaunchOpen(true)` に進む
  - ok でなければ理由 (`RESUME_UNAVAILABLE_LABELS`) を画面の中に出す

`PastResumeBar` と同じ処理は `features/session/past-resume.ts` の `startPastResume` に抜き出して共有する。

**Rationale**:
- `CommandPalette` の表示は、検索の入力・候補の一覧・矢印キー・Enter・空の状態を持つ (`features/shell/CommandPalette.tsx` が Dialog の中で使っている形)。キーボードだけで選べ、閉じたらフォーカスを戻す (`useDialogReturnFocus`)。FR-018 の要求に合い、新しい部品を作らずに済む (Principle XIII)
- 「同じフォルダ」は `SessionGroupDTO` の `folderId` で引ける (`src/domain/session/dto.ts`)。過去の一覧と同じ索引を読むので、新しい IPC は要らない
- 再開の判定と起動はサイドバーの過去の行と同じ経路 (`resolvePastResume` → `openResume` → 再開ダイアログ) に限る (FR-018)。抜き出すのは `PastResumeBar.tsx` で `store.openResume({ source: { kind: 'past', targetKey, conversationId }, fixed, initial: null, initialOrigin: 'manual', replaces: null })` と `setLaunchOpen(true)` を呼ぶ部分である
- 索引の読み込み中・不完全 (`SessionIndexDTO.complete === false`) は「読み込み中」と出し、「無い」と断定しない (X-4 po M-102 の規則と同じ)
- 今のセッション自身も過去の一覧に出ることがある。renderer は会話の id を持たない (main だけが持つ。AD-059) ので除けない。選べば `resolvePastResume` の判定に任せる

**Alternatives**: サイドバーの過去の区画にフォーカスを移すだけ。利用者が退けた (spec Clarifications)

## R-11 Principle XIII の照合 (registry の element)

**Decision**: 新しい element は取り込まない。使うのは次のものである。
- 選択: 既存の native `<select>`
- 停止: 既存の `Button` の `outline`
- 選ぶ画面: 既存の `Dialog` + `CommandPalette` の表示

`docs/ui-coverage.md` F 節の Composer model picker (:284)・Model selector (:338)・Settings (:359) の 3 行は、「未使用」の割当のまま、置き場所の文言を「中央のヘッダ」から「composer の周り」に書き直す。

**Rationale**: R-06 の Alternatives のとおり、registry の element はモデルだけの選択で、安全 3 値の権限モードと 023 の確定の規則を持たない。Principle XIII の Exceptions の書き方 (PR に理由を書く) に従い、理由は plan と PR に書く

## R-12 基準画像への影響

**Decision**: composer の基準画像 (`e2e/composer-screenshot.spec.ts`) は変わる見込みである。待機中の composer の左の群に選択が出るためで、停止ボタンは生成中しか出ない。取り直しは CI の artifact から行い、理由を PR に書く (spec 本 feature の位置づけ / SC-007)。

**Rationale**: 本機のスクリーンショットは揺れ、CI は画面が狭い (memory「CI red on main」)
