# Research: 起動設定の残りの軸 (024)

**Date**: 2026-10-29 (`/cl-plan`) | **Spec**: [spec.md](./spec.md) | **作業ツリー**: 7f6ef94 (main の 023 完了の上)

本ファイルは plan の段の調査と実装の選択 (P-1〜P-12) の正本である。規則の形は [data-model.md](./data-model.md) に置く。P-n は 2026-10-29 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用した。

## R-01 SDK の 4 つの option (0.3.270)

**事実** (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` と `sdk.mjs`):

| option | sdk.d.ts | SDK が `claude` に渡す経路 (`sdk.mjs`) |
|---|---|---|
| `additionalDirectories?: string[]` | `:1413-1416`「Additional directories Claude can access beyond the current working directory. Paths should be absolute.」 | CLI 引数 `--add-dir <path>` を 1 件ずつ (`sdk.mjs:121`) |
| `maxTurns?: number` | `:1779-1783` | CLI 引数 `--max-turns` (`sdk.mjs:121`) |
| `maxBudgetUsd?: number` | `:1784-1788`「The query will stop if this budget is exceeded, returning an `error_max_budget_usd` result.」 | CLI 引数 `--max-budget-usd` (`sdk.mjs:121`) |
| `title?: string` | `:2258-2266`「Custom title for a new session … When resuming via `resume` or `continue`, the resumed session's persisted title takes precedence」 | **CLI 引数ではない。** 初期化の control request の `title` (`sdk.mjs:221`。stdin の JSON) |

- `--add-dir` / `--max-turns` / `--max-budget-usd` は SDK が `spawnClaudeCodeProcess` に渡す `options.args` に入る。Closta の `composeClaudeSpawn` (`src/agents/session-core.ts:540-559`) は `options.args` を配列のまま並べ、WSL は `wsl.exe … --exec` (AD-041 (f)。シェルを通らない)、Win32 は `claude.exe` の直接の起動 (AD-058) に渡す。作業フォルダの `--cd` と同じ経路で、シェル補間は起きない
- `title` は stdin の JSON で届くので、argv の文字コードの問題 (WSL の引数の変換) を通らない。spec Assumptions の 3 つ目 (「`title` の日本語は WSL の起動の引数を通る」) は前提が違うので直した (plan「設計後の見直し」1)
- `taskBudget` (`:1789-1796`) は `@alpha` でベータの header を伴う。`maxThinkingTokens` (`:1771-1778`) は deprecated。どちらも使わない (spec U-4)
- settings の `permissions.additionalDirectories` (`:6274-6277`。設定ファイルの側) は使わない。`settings` は AD-040 の 2 キーの射影のままで、追加ディレクトリを settings の経路に載せない

**決定**: 4 つとも `query()` の options のトップレベルのキーで渡す (AD-064 Decision 1)。

## R-02 `additionalDirectories` は何を広げるか (escalation の評価)

- `additionalDirectories` は「作業ディレクトリの外で Claude が扱える範囲」を広げる。Claude Code の権限の判定では、作業ディレクトリ (と追加ディレクトリ) の中の読み取りは承認なしで通り、外は承認を求める。したがって追加ディレクトリは **承認なしで読める範囲**を広げる
- 書き込み (Edit / Write / Bash) は今どおり権限モードと `canUseTool` で決まる。安全 3 値 (`default` / `plan` / `dontAsk`) のどれでも、追加ディレクトリの中の書き込みが承認なしで通るようにはならない (`acceptEdits` は安全 3 値の外)。tool の集合・env・MCP サーバーも変わらない
- したがって AD-041 (g) の「escalation-neutral (権限面・tool 集合・env を変えない)」には厳密には当たらない。読み取りの範囲が広がる分を、次の 2 つの条件で閉じる (AD-064 Decision 2):
  1. 値は **登録済みの作業フォルダ** (R-1 / R-2 で利用者が明示的に登録した場所) に限る。renderer は folder id だけを送る
  2. パスは **main が** 選択ランタイムの名前空間に変換した値だけ。agents は形を再検査し、renderer 由来の文字列は通らない
- 登録済みのフォルダは作業フォルダに選べば同じ範囲を承認なしで読めるので、追加ディレクトリは「利用者が既に Closta に見せてよいと決めた場所」の外へ範囲を広げない

**決定 (P-1)**: AD-041 (g) を AD-064 で読み替える。読み替えの範囲は `additionalDirectories` の 1 キーで、`maxTurns` / `maxBudgetUsd` (止めるだけ) と `title` (表示の値) は escalation-neutral のまま足す。

## R-03 名前を `SessionLaunchConfig` に入れるか

spec Key Entities が plan に預けた点。

| 案 | 影響 |
|---|---|
| (a) `SessionLaunchConfig` に `sessionName` を足し、プリセットの config の型を名前を除いた形 (`PresetLaunchConfig`) にする | `launchSession(config, origin)` / `resumeSession` の引数の形は変わらない。renderer の `lastConfig` (失敗・拒否で戻ったときの復元) と「やり直す」(021 FR-009。`store.close` → `lastConfig`) が名前を含めて戻る (spec FR-012) |
| (b) 起動の要求の別の欄 (`launchSession(config, origin, name)`) にする | preload・capability・e2e の capability・`LaunchSource.launch` の形が変わる。`lastConfig` とは別に名前の保持と復元の経路が要る |

**決定 (P-2)**: (a)。glossary の SessionLaunchConfig は既に「セッション名」を軸に数えている (`docs/glossary.md:1095-1096`)。プリセットの config は `Omit<SessionLaunchConfig, 'sessionName'>` で、IPC の `checkPreset` と永続層が同じ述語 (`isValidPresetConfig`) を使う (FR-011)。再開の要求の `config.sessionName` は `null` に限る (main の `checkResumeRequest` が拒否する。FR-012)。

## R-04 新しい軸の値の形

**決定 (P-3)**:

- キーは `additionalDirectoryIds: readonly string[]`・`maxTurns: number | null`・`maxBudgetUsd: number | null`・`sessionName: string | null`。**4 つとも必須のキー** (欠けたら形の外)。今の 6 軸と同じく「既定」を `null` (配列は空) で表し、キーの有無で表さない (`isValidLaunchConfig` の今の規則。`src/domain/session/launch-config.ts:81-92`)
- 追加ディレクトリの上限は 10 (spec U-2)。id は今の `isIdString` (`launch-config.ts:68-75`)。重複と `folderId` と同じ id は形の外 (spec SC-001 の「作業フォルダ自身」は形の検証で拒否する)
- ターン数は 1〜1000 の整数 (`Number.isInteger`)。費用は 0.01〜1000 で、`Number(v.toFixed(2)) === v` (小数 2 桁まで。`0.07` のような浮動小数の誤差でも通る。`0.005` は落ちる)。`NaN` / `Infinity` / 文字列は `typeof` と `Number.isFinite` で落ちる
- 名前は 023 の `normalizeSessionName` (`src/domain/session/live-settings.ts:83-90`) を通り、**通した値と同じ文字列**であること (trim 済み・1〜100 文字・制御文字と行の区切りなし)。空の入力は renderer が `null` にする
- 述語は `launch-config.ts` に置く (IPC・永続層・agents の decoder が同じ述語を呼ぶ今の構え。新しい domain のモジュールは作らない)

## R-05 追加ディレクトリの依存解決

今の `resolveLaunchAxes` (`src/domain/session/launch-resolution.ts:82-163`) は作業フォルダ ↔ ランタイムの不一致を blocker にし、越境は判定しない (正本は解決結果 DTO の `boundary`。`:78-79`・pr-gate C-001)。

| 項目の状態 | 判定の場所 | 扱い |
|---|---|---|
| 登録が解除された (facts の folders に無い) | domain | 外して通知 (`unregistered`) |
| 作業フォルダと同じ id (プリセットの適用・作業フォルダの選び直しで生じる) | domain | 外して通知 (`same-as-folder`) |
| WSL のフォルダで、ランタイムが別のディストロか Win32 (facts の `distroName` が違う。Win32 は `null`) | domain | 外して通知 (`unreachable`) |
| 解決結果 DTO が `unreachable` / `blocked` (`probe-failed`) (Windows のフォルダで PathMapping に当たらないなど) | renderer が DTO から facts の `unreachableFolderIds` に入れる | 外して通知 (`unreachable`) |
| 解決結果 DTO の取得中・`blocked` (`capabilities-not-probed`) | renderer | 起動を保留する (作業フォルダと同じ。`LaunchDialog.tsx:317-340`) |
| 解決結果 DTO の `boundary === 'cross'` | renderer | 作業フォルダと同じ越境の警告 (AD-016)。起動は止めない |
| DTO の取得 (IPC) の失敗 | renderer | 「判定できません」と注記して起動を許す (作業フォルダと同じ)。main の起動ゲートが変換できなければ拒否する |

**決定 (P-4)**:

- `resolveLaunchAxes` に追加ディレクトリの段を足し、外した項目は既存の `AxisReset` と別の `directoryResets` (folder id と理由) で返す。`AxisReset` は軸ごとに 1 つで、表示名を持たない (`AXIS_RESET_LABELS` は理由で引く) ため、項目ごとの通知 (フォルダの表示名を含む) を同じ型に入れると既存の通知の重複の判定 (`axis` と `reason` の組) が崩れる
- フォルダかランタイムが未選択の間は、`same-as-folder` / `unreachable` を判定しない (判定の材料が無い。`unregistered` だけを見る)
- 外した項目は下書きに書き戻さない (今の model / effort の reset と同じく、解決した値 `resolution.draft` を使う)。ランタイムを戻すと項目も戻る。通知は外れている間だけ出る
- main の起動ゲート (R-06) は facts に `unreachableFolderIds` を渡さず、変換の結果で判定する

## R-06 main の起動ゲートでの変換

今の作業フォルダの変換は、WSL は `composition-root.ts:557-563` の `resolveCwd` (WSL のフォルダはそのまま、Windows のフォルダは PathMapping の最長一致)、Win32 は `resolveFolderRuntime` の `runtimePath` (`launch-preparation.ts:126-134`) である。`resolveFolderRuntime` (`src/domain/workspace/resolution.ts:215-217`) の第 3 段は、WSL のフォルダは `folder.path.value`、Windows のフォルダは `runtimePathOps.fromHost` (同じ PathMapping) で、`resolveCwd` と同じ値を返す。

**決定 (P-5)**:

- 追加ディレクトリは WSL / Win32 の両方で `resolveFolderRuntime({ folder, runtime })` の `runtimePath.value` に変換する。`reachability !== 'reachable'`・`runtimePath === null`・名前空間の不一致 (WSL はそのランタイムの id、Win32 は `host`) は `invalid-config` で拒否する (起動を止める。renderer は FR-002 で既に外しているので、ここに来るのは改ざんか、ダイアログの後の登録解除・ランタイムの変化)
- 依存解決の再評価 (`launch-preparation.ts:116-123` / `:201-224`) で `directoryResets` が 1 つでもあれば `invalid-config` (今の model / effort の reset と同じ。main は黙って外さない)
- 変換は WSL / Win32 の 2 つの段に 1 つずつ書かず、`launch-preparation.ts` の中の 1 つの関数にする (2 つの段から呼ぶ)。新しいモジュールは作らない (WSL_FREE_DIRECTORIES / services-not-to-io の実名の列に足すものが無い)
- 変換した値は `LaunchQueryOptions.additionalDirectories` に、0 件ならキーを載せない

## R-07 agents の再検査

`decodeLaunchOptions` (`src/agents/sdk-agent-session.ts:309-329`) は main と同じ述語で再検証し未知のキーを捨てる。`buildQueryOptions` (`session-core.ts:183-208`) は値を assert し直す。

**決定 (P-6)**:

- `LaunchQueryOptions` に `additionalDirectories?` / `maxTurns?` / `maxBudgetUsd?` / `title?` を足す
- パスの形の述語 `isLaunchDirectoryValue(kind, value)` を domain (`agent-session.ts`。`LaunchQueryOptions` の隣) に置く。`posix` (WSL): `/` で始まる・バックスラッシュなし・`.` / `..` の成分なし・制御文字なし・4096 文字以下 (`makeRuntimePath` の規則。namespace を agents は持たないので値の規則だけを写す)。`windows` (Win32): `makeHostPath(value)` が通り正規化した値が同じ (ドライブ付きの絶対パス)
- `decodeLaunch` は spec の種類 (`isWin32LaunchSpec`) に合わせて `kind` を選んで全件を検査する (WSL の起動に Windows のパスが混ざらない)。配列でない・0 件・11 件以上・重複は拒否 (起動しない)
- `buildQueryOptions` は件数・重複・どちらかの形・上限の範囲・名前の規則を assert し直し、外れれば throw する。値はメッセージに入れない (パスと名前をログに出さない)。4 キーは値があるときだけ載せる (`resume` と同じ条件つきの spread)
- `QUERY_OPTION_KEYS` は 12 → 16。pin テスト (`session-core.test.ts:209-234`) をリテラルで直す

## R-08 プリセットの版 2

今の store (`src/main/infra/settings/preset-store.ts`) は `schemaVersion` が現行より大きければ `schema-version-unknown` で退避、それ以外の不一致は `parse-failed` で退避する (`:113-121`)。レコードはキーの allowlist で検証する (`preset-record.ts:18`, `:32`)。AD-042 Decision 4 の「今後の規則」(`docs/decisions/0042-…md:60`) は「既存レコードが旧版の検証で拒否されるような変更 … を行う feature は、schemaVersion を上げ、版ごとの読み替え関数を store の内側に置く。X-6 (起動設定の軸の追加) … がこれに当たる」とする。

**決定 (P-7)**:

- `PRESET_SCHEMA_VERSION` を 2 にする。読める版は 1 と 2。版 1 のファイルは版 1 のレコードの規則 (今の 6 キー。`isValidPresetConfigV1`) で読み、新しい軸を既定 (`additionalDirectoryIds: []`・上限 `null`) で補う。版 2 は `isValidPresetConfig` (9 キー。名前を含まない) で読む
- 読み替えは `preset-record.ts` の `toPresetRecord(value, version)` の中に置く (store の内側。AD-042 の規則)。版 1 のファイルを読んだだけでは書き戻さず、次の保存で版 2 になる。版 1 のファイルは退避しない (全件を読めているので失う経路が無い)
- 版 2 を旧版のアプリが読むと `schema-version-unknown` で退避される (今の規則)。黙って欠けない (spec U-7 の (c) を採らない理由)
- 名前を持つ版 2 のレコード (`config.sessionName`) はキーの allowlist の外として読まない (`invalid-record`)。IPC の `checkPreset` も同じ述語で拒否する (write/read 対称)

## R-09 再開の形

今の再開の形 (`LaunchDialog.tsx:203-214`, `:298-307`, `:394-409`) は、引き継ぐ 3 軸を `fixed`、選び直せる 3 軸を `initial` (稼働中の行は元の値・過去の行は `null` = 既定) から作る (`running-session-types.ts:196-211`・`resume-action.ts:46-62`)。

**決定 (P-8)**:

- `ResumeDialogState.initial` を選び直せる 6 軸 (model / effort / 権限モード / 追加ディレクトリ / ターン数 / 費用) に広げる。稼働中の行は `config` の値、過去の行は `null` (既定)
- 再開の形では名前の部品を出さず、送る `config.sessionName` は `null`。プリセットの適用は選び直せる 6 軸に当てる (引き継ぐ 3 軸は変えない)
- 追加ディレクトリは引き継がない軸なので、再開でも依存解決 (R-05) を通す。作業フォルダは `fixed.folderId` を使う
- main の `checkResumeRequest` は `config.sessionName !== null` を拒否する (`invalid-config`)。`resume-service` の 3 軸の照合は変えない
- 「やり直す」は `store.close` で `lastConfig` (名前を含む) に戻る今の経路のまま (R-03)

## R-10 起動の名前の表示

023 は名前を main の registry (`session-launch-service.ts:221-222` の `name`) と renderer のストア (`running-session-types.ts:107-108`) に持ち、改名の IPC の戻り値で renderer に返す。

**決定 (P-9)**:

- main は `startSession` で registry の `name` を `config.sessionName` で初期化する (`session-launch-service.ts:445-457`。今は `null` 固定)。再開の起動は `config.sessionName` が `null` なので `null` のまま
- renderer は起動の受け付け (`launching` の handshake) で `LiveSessionState.name` を起動の `config.sessionName` で初期化する。main から名前を返す IPC は足さない (renderer は自分が送った値を知っている。IPC の形を変えない)
- 稼働中の行の題と中央のヘッダは今の `name` の表示 (023 §8.3) のまま。023 の改名はこの値を上書きする
- 名前を `deps.log` に出さない。起動設定を丸ごとログに出す経路は今も無い (`logRejection` は理由のキーだけ。`launch-preparation.ts:87-88`)

## R-11 起動ダイアログの部品

`LaunchDialog.tsx` は 900 行ある。

**決定 (P-10)**:

- 新しい 3 軸の部品は `LaunchExtraAxes.tsx` (新設) に切り出し、`LaunchDialog` は下書き・入力の文字列・解決の結果を渡す。数値の入力の文字列の解釈と選択肢の組み立ては純関数の `launch-extra-axes.ts` (新設) に置き、表でテストする
- 上限は `<input type="text" inputMode="numeric|decimal">` の文字列を持ち、解釈できなければ起動を押せず範囲の文言を出す (`aria-invalid` と `aria-describedby`)。空は「上限なし」
- 追加ディレクトリは「フォルダを追加」の select (作業フォルダの選択肢と同じ並びから、作業フォルダ自身と選択済みを除く) と、選んだ項目の一覧 (表示名と「外す」) で組む。10 件で select を無効にする。パスの入力欄・参照のダイアログは置かない (FR-001)
- 名前は `<input type="text">`。プレースホルダは「自動で付ける」。IME の変換中の Enter で起動しない (023 の名前の入力と同じ `isComposing` の扱い)
- 追加ディレクトリの解決結果 DTO は、今の `useFolderRuntimeResolution` (`LaunchDialog.tsx:163-193`) を複数の id に広げた hook で取る (同じ版のキー `runtimeRevision`)。IPC は増えない (`resolveFolderRuntime` は main のメモリだけを見る。`folder-service.ts:412`)
- Principle XIII: assistant-ui の element に起動の設定の部品は無い (023 で Model selector / Composer model picker / Settings を照合済み。`docs/ui-coverage.md:284`, `:338`, `:359`)。今の起動ダイアログと同じ素の form 部品と `Button` で組む

## R-12 rule fixture `ui-path-concat` の付け替え

`tests/rule-fixtures/expected.mjs:776-805` の `ui-path-concat` は「追加ディレクトリのパス入力を renderer に足す X-6」で「IPC へ渡す `PathDTO` は capability 戻り値由来の参照に限る」を型で強制するとしていた。

**決定 (P-11)**:

- 024 は追加ディレクトリを folder id で選び、renderer にパスの値を作らないので当たらない。`howToClose` に「024 で確かめた: 当たらない (追加ディレクトリは登録フォルダの id で選び、パスの入力を足さない)」を足す
- `nextFeature` は `X-6` のまま。X-6 の後続に残る「providers.json・presets.json の退避ファイルの一覧・復元の UI」が、renderer から退避ファイルを名指す (パスか不透明 id か) 次の機会である。その feature で「退避ファイルは main が返した不透明 id で名指す」を決めれば同じ理由で閉じる

## R-13 上流からの申し送りの照合で見つけた点

- spec の「判断の一覧」の ADR の行が挙げる「AD-059 の「6 軸の形は変えない」」は AD-059 の本文に無い。出所は glossary の SessionLaunchConfig (`docs/glossary.md:1100`。X-9 が書いた) と `src/domain/session/resume.ts:16` のコメントである。spec を直した (plan「設計後の見直し」2)
- AD-062 Consequences (`docs/decisions/0062-…md:45`) の「`SessionLaunchConfig` は変わらない」は 023 の範囲の記述で、本 feature の変更と矛盾しない。accepted の本文は直さない (AD-031)。AD-064 の「読み替える箇所」に挙げる
- session charter の Journey 2 の手順 3 (`docs/domains/session/charter.md:110`「X-4 時点で上限は未対応。X-6 が扱う」) と Journey 4 の手順 2 (`:133-134`「モデル / effort / 権限モード / 上限は選び直せる」) は本 feature で実装になる。完了の PR で注記を直す (FR-017)
- 021 spec Out of Scope (`specs/021-session-resume/spec.md:255`「起動設定の上限の軸は X-6 が持つ」) は本 feature の FR-012 で受ける (021 の文書は直さない)

## R-14 実機で確かめること (契約を変えない)

- `additionalDirectories` の WSL の POSIX のパス・Win32 のドライブのパスで、追加ディレクトリのファイルを承認なしで読めるか (quickstart V-1)。読めなくても起動は成り立ち、利用者に返す (plan RK-02)
- `maxTurns` / `maxBudgetUsd` の数え方 (プロンプトごとか、セッションを通してか。再開で前の費用を含むか) と、上限で止まった後の振る舞い (次のプロンプトを送れるか) (quickstart V-2 / V-5)
- `title` が `system/init` の前に transcript の custom-title に書かれるか。過去の一覧に出るか (023 RK-06 と同じ。quickstart V-3)
