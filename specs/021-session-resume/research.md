# Research: セッションの再開 (resume) (X-9)

**Date**: 2026-10-21 (`/cl-plan`) | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

2026-10-21 の作業ツリー (main 7e13d60 の上) と `@anthropic-ai/claude-agent-sdk` 0.3.270 の型 (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`) で確かめた。research agent は使っていない (designer が自分で調べた)。規則の正本は [data-model.md](./data-model.md) で、ここには決めた理由と退けた案を置く。P-n は plan の段で決めた実装の選択で、P-1〜P-11 は採用 (2026-10-21 夜間の規則で推奨案を採用。plan の「判断の承認」)。

## R-01 SDK の `resume` の option

**調べたこと**: `Options.resume?: string` (`sdk.d.ts:1933-1936`。「Session ID to resume. Loads the conversation history from the specified session.」)。`forkSession` (`:1580-1584`) は「resume したセッションを新しい id に分岐する」、`sessionId` (`:1937-1942`) は「`resume` と同時には使えない (`forkSession` が無いとき)」、`resumeSessionAt` (`:1943-1950`) は途中の地点からの再開、`continue` (`:1465-1469`) は cwd の直近の会話。

**決定**: `resume` だけを `QUERY_OPTION_KEYS` に足す (11 → 12。AD-059 Decision 1)。`forkSession` / `sessionId` / `resumeSessionAt` / `continue` は足さない (spec の Out of Scope。`continue` は会話を名指さないので、同じフォルダの別の会話を拾いうる)。

**argv の経路**: SDK は `resume` を `claude` の引数 (`--resume` と id) として `spawnClaudeCodeProcess` に渡す `options.args` に入れる。`composeClaudeSpawn` (`src/agents/session-core.ts:514`) は SDK が渡した `args` をそのまま後ろに付ける (WSL は `wsl.exe` の `--exec` の後、Win32 は `claude.exe` の引数) ので、**spawn の計画は変えない**。id は UUID の形に検査してあるので、引数に空白・引用符・`-` 始まりの値が入らない (data-model §2)。

**escalation-neutral の根拠**: `resume` は transcript を読み込んで会話を続けるだけで、権限モード・tool の集合・env・MCP サーバーを変えない。権限モードは今どおり `buildQueryOptions` が安全 3 値に assert する。過去の会話で許可した tool の許可 (`once` / `capability`) は Closta の承認カードの経路の値で、transcript から復元されない (承認はセッションスレッドの登録簿が持ち、新しいセッションスレッドは空から始まる)。

**前提の確かめ方 (design-gate H-004 を受けて追記)**: CLI で昇格の権限モード (`--permission-mode acceptEdits` など) で作った会話を再開したとき、元のモードが戻らないことが escalation-neutral の前提である。根拠と経路は 3 つ。

1. **SDK が権限モードを毎回 `claude` の引数に渡す** — SDK 0.3.270 は `permissionMode` があれば `--permission-mode <値>` を argv に足す (`sdk.mjs:121`)。Closta は常に安全 3 値の `permissionMode` を渡す (`buildQueryOptions` の assert) ので、再開でも明示した値で起きる。transcript から権限モードを復元するかは CLI の挙動で、実機で見るまで確かめられない
2. **fail closed の backstop** — セッションスレッドは、再開の起動の最初の `system/init` の `permissionMode` を `isSafePermissionMode` で検査し、外れたら (無いときも) `resume-failed` で失敗にして子を止める (data-model §6.3 の 3・spec FR-017)。今は `init` の `permissionMode` は表示 (`live-signals.ts:437-445` の `observePermissionMode`) に流すだけで強制しない (014 U-6。持ち主は I-3)。新しい起動の扱いはそのまま変えず、再開の起動にだけ足す。昇格の値の綴りは書かない (項目 16)
3. **実機の記録** — quickstart V-9 で、昇格のモードで作った会話を安全 3 値で再開し、実効の権限モード (中央の権限モードの表示と、承認のカードが出ること) を記録する

残る窓: `init` は最初のプロンプトを送った後にしか来ない (R-02) ので、検査はそのターンの最初のメッセージで行う。tool の実行はモデルの応答の後なので窓は短いが 0 ではない (plan RK-10)。

**退けた案**: (a) 起動のたびに `sessionId` の option で Closta の `sessionId` を会話の id にする (U-1 (b)。spec が退けた) — 再開の後に元の行の `sessionId` と新しい行の鍵が衝突する。(b) `continue: true` — 会話を名指せない。

## R-02 会話の id はいつ分かるか

**調べたこと**: `claude` は最初の利用者のメッセージが届くまで何も出力しない (`system/init` も出さない。X-1 の実測。`src/renderer/src/features/session/RunningSessionsProvider.tsx:189-190` の注記)。`SDKSystemMessage` の `init` は `session_id` を持つ。

**決定 (P-1)**: セッションスレッドは、最初の `system/init` の `session_id` を `isValidSessionId` (`src/domain/validation.ts:179`。UUID の正規表現。agents は `@domain/validation` から import 済み) で検査し、通ったら 1 回だけ main に運ぶ (data-model §1)。2 回目以降の `init` (`/clear` の後など) は運ばない — spec の Edge Cases (`/clear` の後は X-6)。

**帰結**: 最初のプロンプトを送る前に失敗・終了した行は会話の id を持たない。U-6 の「やり直す」の対象になる (FR-009)。そもそも transcript が書かれていないので、再開できる会話が無い。

**再開の起動**: `resume` で起動したセッションも最初のプロンプトまで `init` を出さない。そのため main は再開の起動を受け付けた時点で、要求の会話の id を registry に入れる (data-model §1.3)。`init` の `session_id` が要求と違ったら (SDK の挙動が変わった場合)、`init` の値で上書きし、会話の id の値はログに出さずに不一致の事実を 1 行だけ記録する (quickstart V-3 で値が同じであることを確かめる)。

## R-03 会話の id の置き場所

**決定 (P-2)**: main の起動の service (`session-launch-service.ts`) が持つ (U-1)。renderer には「再開できるか」の真偽だけを渡し、id の値は渡さない (data-model §1.4)。

- **registry のエントリ** (`Entry`) に `conversationId: string | null` を足す。同時の再開の判定 (U-5) はこれを見る
- **退避の表** (`ConversationRecord` の Map) を別に持つ — registry は `claudeAlive` と `threadAlive` が両方 false になるとエントリを消す (`session-launch-service.ts:128-138` の `commit`)。終了済み・失敗の行から再開するには、エントリが消えた後も会話の id と元の起動設定の 3 軸が要る
- 退避の表は、その行から再開が受け付けられたとき (U-4 で元の行を閉じる)・`killAll` (renderer の再読み込み。renderer の行も消える) で消す。件数の上限 256 (古いものから捨てる)。renderer の行は利用者が閉じるまで残るので上限が要る。上限を超えて捨てた行の再開は `source-unknown` で拒否する (data-model §3)
- **永続化しない** (Principle X)。アプリを終了すれば消える。終了したアプリの会話は過去の区画から再開する

**退けた案**: (a) renderer のストアに id を持つ — renderer から main に id を送る経路ができ、main がそれを信じるか検証するかの規則が要る (spec FR-011 は「判定は main の registry で行う」)。(b) 状態通知 (`SessionStatusUpdate`) に id を載せる — 状態通知は会話由来の値を持たない契約 (`capability.ts:231-233`) で、キーの集合 (`UPDATE_KEYS`) は supervisor → main の受信規則の一部。

## R-04 同じ会話の 2 本目 (U-5)

**決定 (P-3)**: main で 2 段に判定する (data-model §5)。

1. registry に `claudeAlive: true` で同じ `conversationId` のエントリがあれば起動しない。`already-running` とその行の `sessionId` を返し、renderer はその行を選ぶ (FR-011)
2. 起動の準備 (`await`) の間に同じ会話の要求がもう 1 つ届いたら、2 本目を `conversation-running` で拒否する。判定と予約は `await` の前に同期で行う (同時実行数の上限の予約 `reserved` と同じ形。`session-launch-service.ts:189-191`)

`claudeAlive: false` のエントリ (スレッドの後始末の途中) は同じ会話でも数えない — `claude` はもう transcript に書かない。

**限界**: Closta の外 (端末の `claude --resume`) で動いている会話は見分けられない (spec Edge Cases)。

## R-05 過去の行の軸の解決 (U-3)

**調べたこと**:

- 列挙対象 (`EnumerationTarget`。`src/domain/session/target.ts`) は所在 (`Location`)・config ディレクトリ・`origin`・表示名を持つ。**`origin` は今は常に `'default'`** — ホストは `hostHome/.claude`、WSL は `/home/*/.claude` と `/root/.claude` (`src/main/infra/session/target-finder.ts:216-346`)。Provider の config ディレクトリは列挙しない
- 行と登録フォルダの対応は `matchFolder` (`src/domain/session/match.ts:95-166`) で、**セグメントの境界での前方一致の最長一致**。フォルダの下のディレクトリで動いた会話もそのフォルダに対応づく (`matchedPrefix` が cwd より短い)
- `claude` は再開する会話を `<config-dir>/projects/<cwd を符号化したもの>/<id>.jsonl` で探す (session charter Key concepts)。cwd が 1 文字でも違えば見つからない
- Provider の config ディレクトリをランタイムから見たパスにする関数は `resolveConfigDirPath` (`src/domain/provider/helper-path.ts:76-98`)。`CLAUDE_CONFIG_DIR` を入れるのは資格情報の出所が `config-dir` と `in-app-login` で `configDir` を持つ Provider だけ (`src/domain/provider/derive-env.ts:113-114`)。他の Provider と Provider なしは、ランタイムの既定の config ディレクトリ (`~/.claude`) を使う

**決定 (P-4)**: domain の純関数 `resolvePastResumeAxes` (新設 `src/domain/session/resume.ts`) で決める (data-model §3 の表)。

- **ランタイム** — 列挙対象の所在から: `windows` → `host` (`Win32Runtime`)、`wsl` のディストロ D → `wsl:D`。descriptor が無ければ `runtime-missing`
- **cwd の出自の一致 (design-gate H-001 を受けて追記)** — フォルダは `matchFolder` が cwd の出自の名前空間 (`originLocation` → `locationNamespace`) から決め、ランタイムは列挙対象の所在から決めるので、2 つが別の名前空間を指しうる。実際にホストの config ディレクトリには UNC 形の cwd (`wsl-from-unc`) の行がある (2026-10-21 の実測で 7 件)。それを解くと { WSL のフォルダ × `Win32Runtime` } (起動の時に `invalid-config`) か、`/mnt/c` を経て { ホストのフォルダ × `Win32Runtime` } (cwd が `C:\…` になり、UNC の cwd で符号化した記録が見つからず `resume-failed`) になる。そこで、出自の種類と名前空間が列挙対象の所在と一致する行だけを先へ進める — 所在が `windows` なら出自は `host`、ディストロ D なら出自は `wsl-inherited` で名前空間が `wsl:D` (`isSameNamespace(origin.namespace, runtimeId)`。`runtimeId` は `locationNamespace(target.location)`)。`wsl-from-unc` はどの列挙対象でも一致しない (Win32 の `claude` が UNC の cwd で書いた記録で、どちらのランタイムの `claude` もその cwd の文字列では起きない)。外れたら `location-mismatch` (data-model §3.1 の段 1b)。出自が決まらない (`absent` / `unknown-location` / `undetected-distro`) 行はこの段を素通りし、段 2 の `matchFolder` の `unknown` で拒否する
- **フォルダ** — `matchFolder` が `folder` を返し、**かつ `matchedPrefix` が cwd と完全に一致する**とき、そのフォルダ。フォルダの下のディレクトリなら `cwd-mismatch` (そのディレクトリを作業フォルダとして登録すれば直る)。`unregistered` → `folder-unregistered`、`pending` → `folder-pending`、`unknown` → `location-unknown`
- **Provider** — 資格情報の出所が `config-dir` / `in-app-login` で `configDir` を持つ Provider のうち、`resolveConfigDirPath(configDir, runtime)` が列挙対象の config ディレクトリと同じ (名前空間と値の完全一致) ものを集める。1 つならそれ、2 つ以上なら `provider-ambiguous`。0 のとき、列挙対象が既定の config ディレクトリ (`origin: 'default'`) なら Provider なし、そうでなければ `provider-missing`

**判定の順**: ランタイム → cwd の出自の一致 → フォルダ → Provider (data-model §3.1 の段 1 / 1b / 2 / 3)。

**`provider-missing` に今は届かない**: 列挙対象は常に `'default'` なので、今の列挙では `provider-missing` は起きない (Provider の config ディレクトリの列挙が入ったときに効く)。spec US-1 AC5 は単体テストの表 (列挙対象を `origin` 以外の値で組む) で確かめ、実機では確かめられない — plan RK-03。

**引き継がないもの**: 元の会話で使った Provider が `config-dir` 以外 (API キーなど) で、既定の config ディレクトリに記録が書かれていた場合、再開は Provider なし (既定の資格情報) で起きる。会話は同じ config ディレクトリにあるので見つかるが、資格情報は元と違いうる — plan RK-04。過去の行から元の Provider を知る手段は無い (transcript は Provider を記録しない)。

**WSL の複数のホーム**: 列挙は 1 つのディストロの全ユーザのホームを対象にするが、Closta が起動する `claude` はディストロの既定のユーザで動く (`wsl.exe --exec`)。別のユーザのホームの会話を Provider なしで再開すると、既定のユーザの `~/.claude` を探して見つからず、`resume-failed` になる (R-07)。既定のユーザのホームを Closta は知らない (`WslRuntimeDescriptor` に無い) ので、起動の前には弾けない — plan RK-05。

**退けた案**: (a) 決まらない軸を利用者に選ばせる (U-3 (b)。spec が退けた)。(b) `matchedPrefix` の一致を見ずに対応づくフォルダで再開する — cwd が違うと会話が見つからない (失敗が起動の後に分かる)。(c) フォルダの下のディレクトリの会話は cwd をそのまま使って再開する — 起動の cwd は登録フォルダのパスから作る (`launch-preparation.ts`)。登録フォルダでない cwd での起動は起動ゲート (AD-041) の外になる。

## R-06 再開の要求の型

**調べたこと**: `isValidLaunchConfig` (`src/domain/session/launch-config.ts`) は 6 キーの厳密な許可リストで検査し、プリセット (`checkPreset`) も同じ述語を使う。

**決定 (P-5)**: `SessionLaunchConfig` にキーを足さず、別の型 `SessionResumeRequest` (`{ source, config }`) で包む (data-model §2)。`config` は今の 6 軸の値そのままで、今の `checkLaunchConfig` を通す。キーを足すとプリセットの保存の検査・`presets.json` の形にも会話の id が入りうる。

`source` は 2 通り: `{ kind: 'live', sessionId }` (稼働中の区画の行。Closta の `sessionId`) と `{ kind: 'past', targetKey, conversationId }` (過去の区画の行)。main は `config` の 3 軸 (フォルダ / ランタイム / Provider) が source から解いた値と一致しなければ `invalid-config` で拒否する — renderer が軸を差し替えて送っても再開に使われない (FR-006 / FR-008)。

## R-07 失敗の理由 (transcript が見つからない)

**調べたこと**: `claude --resume <id>` は会話が見つからないと、最初の出力の前にエラーで終わる (Claude Code の CLI の挙動。quickstart V-4 で記録する)。今のセッションスレッドは、終了処理の外で子が終わると `process-crashed` にする (`src/agents/sdk-agent-session.ts:710-721`)。stream が例外で終われば `stream-protocol-error` (`:929-933`)。

**決定 (P-6)**: `LaunchFailureReason` に `resume-failed` を足す (18 → 19。AD-059 Decision 3 が AD-047 Decision 1 の集合を読み替える)。条件: `resume` で起動したセッションで、最初の `system/init` を受ける前に (終了処理の外で) 子が終わった・stream が例外で終わった・stream が例外なく終わった。もう 1 つ、再開の最初の `init` が安全 3 値の外の権限モードを報告したとき (R-01)。文言は data-model §7。

**失敗の箇所の対応づけ (design-gate H-005 を受けて直した)**: 今のコードで失敗の理由を付ける箇所と、再開での扱い (data-model §6.4)。

| 箇所 | 何の経路か | 再開で `init` の前 |
|---|---|---|
| `sdk-agent-session.ts:717` (`child.once('exit')` の `process-crashed`) | 終了処理の外で子 (`claude`) が終わった | `resume-failed` |
| `:932` (`catch` の `stream-protocol-error`) | SDK の stream が例外で終わった (`claude` が非 0 で終わると SDK が投げる) | `resume-failed` |
| `:727` (`fatalSink` の `process-crashed`) | セッションスレッドの JS 例外 (`uncaughtException` など。`main()` が登録) | 変えない (`process-crashed`)。`claude` の終わり方ではなく Closta の内部の不具合なので、「記録が見つからない」と読ませない |
| (新設) `for await` を例外なく抜けた後 (`:928` の後) | stream が例外なく終わった。今は失敗にしない — `finally` の `finish` が `finished` を先に立てると `:717` も失敗にしない | `resume-failed` (再開の起動に限る。新しい起動は今どおり) |

`claude --resume <id>` が会話を見つけられないときに上のどれで終わるかは V-4 で記録する (RK-07)。

**理由**: `process-crashed` (「claude が異常終了しました」) のままだと、利用者は claude の不具合と読み、transcript の削除・別のユーザのホーム (R-05)・config ディレクトリの違いに気付けない。`resume` で起動して `init` の前に終わったら、原因の大半は会話を見つけられないことである。初回の `init` の後の異常終了は今どおり `process-crashed`。

**退けた案**: 今のキーを使う (spec Edge Cases の 2 案のうちの 1 つ) — 上の理由。

## R-08 それまでの会話の読み取り (U-7)

**調べたこと**: 過去ログの読み取りは `transcriptService.getTranscript(sessionId, targetKey, token)` (`src/main/app/transcript-service.ts`) で、`targetKey` を `session-service.ts:741` の `transcriptTarget` で解き (config ディレクトリの env と WSL の実行中の検査)、短命の取得プロセスと renderer を port で直結する (AD-034)。`targetKey` は列挙の結果の既知の値でなければならない。

**決定 (P-7)**: 新しい IPC `getResumedTranscript(sessionId, requestToken)` を足し (contracts C-3)、main が「再開したセッションの会話の id と読む列挙対象」を解いてから今の `getTranscript` の経路に渡す。renderer に会話の id を渡さない (R-03) ので、renderer が `getTranscript` を直接呼べない。port の受け渡しは今の `transcriptPort` のチャネルと `TRANSCRIPT_PORT_MESSAGE` をそのまま使う。

読む列挙対象の決め方 (data-model §8):

- 過去の行から再開した — その行の `targetKey`
- 稼働中の行から再開した — 元の起動設定のランタイムの所在の列挙対象のうち、(1) 列挙のキャッシュにその会話の id を持つもの、(2) 無ければ、Provider が `configDir` を持つときは config ディレクトリが一致するもの、持たないときは既定の config ディレクトリの列挙対象がその所在に 1 つだけならそれ。決まらなければ読み取りの失敗 (FR-013。再開は止めない)

**読む時点**: 再開の起動を受け付けた直後に 1 回。`claude` は最初のプロンプトまで transcript に書かない (R-02) ので、読む間に追記されない。読み取りのプロセスはセッションの `claude` と別 (AD-034) で、同時実行数の上限に数えない (今の過去ログと同じ)。

## R-09 それまでの会話をどこに出すか

**調べたこと**: 中央の実行中の Chat は `useExternalStoreRuntime` に稼働中のストアの `messages` の末尾の窓を渡す (`RunningSessionsProvider.tsx:133-219`)。tool の結果の状態 (`toolResultState`。`src/renderer/src/features/chat/tool-result-state.ts:35-46`) は、実行中でも「最新のターン (最後の利用者のメッセージより後)」でない tool を「結果不明」にする。過去ログの変換は `toThreadMessage` (`features/chat/convert.ts:179`)。

**決定 (P-8)**: それまでの会話を、新しいセッションのストアの `messages` の先頭に入れ、その後ろに区切りの行 (`divider`。「ここから再開」) を 1 つ入れる (data-model §9.3)。

- id の衝突を避けるため、それまでの会話のメッセージの id に接頭辞 (`resumed:`) を付ける。取り消し (`retraction`)・tool の結果の送り直し (同じ id での上書き) は新しいメッセージの id にだけ当たる
- 「読み取り専用」(US-4 AC2): 今の実行中の Chat の利用者のメッセージの操作は、編集 (`onEdit` を渡さないので効かない)・再生成 (`onReload` を渡さないので効かない)・コピーで、それまでの会話にも新しい操作は生じない。拒否で戻した入力の再送 (`retryTextFor`) は接頭辞つきの id に `null` を返す。承認のカード・Elicitation のカードは `pending` から出るので、それまでの会話からは出ない
- tool の結果の状態: それまでの会話は最初の新しいプロンプトの前にあるので、最初のプロンプトを送った後は「最新のターン」に当たらず、結果の無い tool は「結果不明」(過去ログと同じ表示。US-4 AC1)。最初のプロンプトを送る前は `runState` が `launching` で、`running` / `awaiting_permission` でないので同じく「結果不明」
- 窓 (`MESSAGE_WINDOW`) と「さらに表示」・会話内検索・会話の地図は、それまでの会話を含めた `messages` に効く (Principle XII。読める)

**退けた案**: (a) 中央に過去ログの画面 (`ChatScreenBody`) を別に重ねる — スクロールの領域が 2 つになり、composer の位置と会話内検索の範囲が分かれる。(b) SDK の replay (`SDKUserMessageReplay`) に頼る — SDK は `resume` で過去のメッセージを stream に流さない (spec Assumptions)。対応表の `SDKUserMessageReplay` は「表示不要」のまま (`docs/ui-coverage.md:48`)。

## R-10 IPC の面

**決定 (P-9)**: チャネルを 4 つ足す (`IPC_CHANNELS` の固定テスト `src/domain/capability.test.ts:12-60` を直す)。契約は [contracts/ipc-session-resume.md](./contracts/ipc-session-resume.md)。

| チャネル | 向き | 用途 |
|---|---|---|
| `closta:resolvePastResume` | renderer → main | 過去の行の軸を解き、押せるか・理由を返す (C-1) |
| `closta:resumeSession` | renderer → main | 再開の起動 (C-2) |
| `closta:getResumedTranscript` | renderer → main | 再開したセッションのそれまでの会話の読み取りの開始 (C-3)。port は今の `transcriptPort` |
| `closta:sessionResumable` | main → renderer | 稼働中の行が会話の id を持ったことの通知 (C-4) |

**状態通知に載せない理由**: 状態通知 (`SessionStatusUpdate`) は supervisor の窓で束ねた値を main が `acceptBatch` で受理してそのまま中継する (`session-status-relay.ts`。再バッチしない・検証を持たない)。キーを足すと、supervisor → main の受信規則 (`UPDATE_KEYS`) と、main が後から値を足す規則が混ざる。会話の id が分かるのはセッションにつき 1 回なので、別のチャネルの 1 回の通知で足りる。

## R-11 元の行を閉じる (U-4)

**調べたこと**: 稼働中のストアの `close(sessionId)` (`running-session-store.ts:733`) は、失敗した行を閉じると前回の失敗 (`previousFailure`) を立てて起動の告知を残す。シェルは「`launch` が変わり・`previousFailure` が立ち・`order` が減る」組み合わせを失敗した close として読み、起動ダイアログを開く (session charter の O-7 の項。`close` 以外の操作でこの組み合わせを作らない)。

**決定 (P-10)**: 再開で元の行を閉じる操作は `close` を使わず、別の操作 (`replace`。data-model §9.4) にする。元の行を消し、`previousFailure` を立てず、新しい行を選ぶ。`order` は 1 つ減って 1 つ増えるので、シェルの読み方 (失敗した close) に当たらない。

## R-12 起動の利用記録 (KPI「再利用率」)

**決定 (P-11)**: 再開も受け付けた起動の要求 1 回として数え、起動元は今の起動ダイアログの 3 段の規則 (012 data-model §4「renderer の起動元」・`LaunchDialog.tsx:91`) で決める — このダイアログでプリセットを適用したら `preset`、適用せずに選び直せる軸を手で変えたら `manual`、どちらも無ければ初期値の組の起動元。初期値の組の起動元は、稼働中の行からの再開ではその行の `launchOrigin` (`running-session-types.ts:95`)、過去の行からの再開 (`initial: null`。元の起動元を持たない) では `manual` (data-model §9.3)。`resumeSession` に `origin` を今の `launchSession` と同じ形で渡す (contracts C-2)。session charter の KPI の注記「数える単位は、受け付けた起動の要求 1 回」「前回の設定を変えずに起動し直した起動は、前回の起動元に数える」(`charter.md:216-218`) にそのまま当たり、定義を変えない (design-gate H-002 を受けて 2 値から 3 段に直した。2 値だと、プリセットで起動した行を初期値のまま再開した起動が `manual` に偏る)。

## R-13 機械強制の規則への影響

- **項目 16** (`scripts/constitution/check.mjs:787`): options に現れてはならないキー (`QUERY_ESCALATION_OPTION_KEYS`。`allowlists.mjs:422-429`) に `resume` は無い。足さない・外さない
- **項目 14 の SDK の呼び出しの許可** (`AGENT_SDK_ALLOWED_CALLS`。`allowlists.mjs:383-390`): `resume` は `query()` の option で、呼ぶ API は増えない。書き込み系 API (`forkSession` など。`:377-378`) を呼ばない
- **項目 18** (調停役スレッドの本文の検査): 調停役スレッドに足すのは `conversation` の message の中継で、デコーダは `supervisor-protocol.ts` に置く。`supervisor*.ts` の import は増えない (`tests/rule-fixtures/expected.mjs:843` の「import が増える X-6 の時点」に当たらない)
- **項目 15** (`WSL_FREE_DIRECTORIES`。`allowlists.mjs:537-561`): 新設の `src/main/app/resume-service.ts` を実名で足す (`wsl.exe` を名指さない)
- **`.dependency-cruiser.js:254`** (状態を持つ調停の service → I/O の直接依存の禁止): 新設の `resume-service.ts` を実名で足す (I/O を注入で受ける)
- agents の新しいモジュールは作らない (`expected.mjs:905` の「agents にセッション操作のモジュールが増える X-6 の時点」に当たらない)

## R-14 Win32 の記録 (020 V-7 / RK-10 の引き継ぎ)

**調べたこと**: 020 の quickstart V-7 (Win32 で起動したセッションの記録がホストの `~/.claude/projects` に書かれ、列挙と過去ログで読めるか) は実機で未実施 (session charter の X-8 の項)。

**決定**: 本 feature の quickstart V-2 で、Win32 のセッションを 1 つ起こして終わらせ、過去の区画に出ること・過去ログで読めること・そこから再開できることを続けて確かめる (spec SC-007)。読めなければ、Win32 の過去の行からの再開 (SC-001 の 2 通り) が成り立たないので利用者に返す (plan RK-06)。
