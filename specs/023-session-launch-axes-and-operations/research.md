# Research: 実行中のセッションの操作 (X-6 の最初の分割)

**Date**: 2026-10-27 (`/cl-plan`) | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本ファイルは plan の段の技術選択 P-1〜P-13 の検討の記録である。どれも 2026-10-27 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で採用した。規則の正本は [data-model.md](./data-model.md) と [contracts/ipc-live-session-settings.md](./contracts/ipc-live-session-settings.md) で、ここには「なぜその形か」だけを書く。調べたのは main 1a7d8b4 の作業ツリーと `node_modules/@anthropic-ai/claude-agent-sdk` 0.3.270 (`sdk.d.ts` / `sdk.mjs`)。

## R-01 SDK の 3 つの API の事実 (sdk.d.ts 0.3.270)

| API | 型 (行) | 事実 | 本 feature の扱い |
|---|---|---|---|
| `Query.setPermissionMode(mode)` | `sdk.d.ts:2632` | `Promise<void>`。「Only available in streaming input mode」。Closta の起動はプロンプトのキュー (`promptQueue`) を渡すストリーミング入力なので使える | 安全 3 値だけで呼ぶ (P-1) |
| `Query.setModel(model?)` | `sdk.d.ts:2659` | `Promise<void>`。引数を省くと既定のモデルに戻る。ストリーミング入力でだけ使える | カタログの値だけで呼び、引数なしでは呼ばない (P-2) |
| `Query.setMaxThinkingTokens(n, display?)` | `sdk.d.ts:2682` | `@deprecated`。起動の `thinking` の option を使えとある。Opus 4.6 では on / off としてだけ効く | 呼ばない (spec U-4)。`QUERY_MUTATION_METHODS` に残す |
| `renameSession(id, title, options?)` | `sdk.d.ts:2985` | `options` は `SessionMutationOptions` (`{ dir?, sessionStore? }`)。`dir` は**プロジェクトのパス** (作業ディレクトリ) で、省くと全プロジェクトを探す | `dir` を渡さない (P-6) |

`sdk.mjs` の `renameSession` の実体 (最小化されたコードを `-o` で読んだ): UUID の形と空でない題を検査し、`{type:"custom-title", customTitle: title.trim(), sessionId}` の 1 行を `<id>.jsonl` に `O_APPEND` で足す。`dir` を渡すと、その値をホストのパスとして正規化してから `projects/<encoded>` を求める。`dir` を省くと、config ディレクトリ (`CLAUDE_CONFIG_DIR`。無ければ `~/.claude`) の `projects/` の下を順に見て、`<id>.jsonl` を持つディレクトリに書く。見つからなければ例外を投げる。

## R-02 (P-1) 権限モードの切り替えの閉じ方

- **採った形**: `SessionControl` に `set-permission-mode` (値は `SafePermissionMode`) を足し、3 段で閉じる。(1) main の述語 `isSafePermissionMode` (FR-001)、(2) セッションスレッドの `decodeSessionControl` の同じ述語、(3) 呼び出しの直前の `assertSafePermissionMode(...)` (FR-002)。項目 16 は `.setPermissionMode(` の引数が `assertSafePermissionMode(` で包まれて閉じていることを、`permissionMode:` の値の検査と同じ `wrapperCallCompletes` で見る (data-model §7)
- **検討した別案**: `setPermissionMode` を `QUERY_MUTATION_METHODS` に残したまま、`sdk-agent-session.ts` だけを例外にする → 項目 16 の P3 の「綴りを見る」形が「ファイルの例外」を持つようになり、例外の中で何を渡しても通る。引数の包みを見る方が、AD-041 (a) の `permissionMode:` の検査と同じ考え方で揃う
- 成功したら、セッションスレッドは live-signals の権限モードの基準を新しい値にして `meter` の `permission-mode` と権限モードの行を出す (`live-signals.ts:414` の `observePermissionMode` と同じ処理。data-model §3.3)。これで renderer の `meters.permissionMode` は「Claude Code の報告と、成功した変更の新しい方」になり、ヘッダは 1 つの値を見るだけで足りる (P-9)

## R-03 (P-2) モデルの値の範囲と運び方

- renderer はカタログの `id` (`ModelEntry.id`) を送る。main はそのセッションの起動の Provider の今のカタログを引き、(a) その `id` があり、(b) 起動の effort が null でなければ、そのモデルの `supportedEffortLevels` に effort が含まれることを確かめる (起動の依存解決 `launch-resolution.ts:130-149` と同じ規則。effort を変えないので、今の effort が効かないモデルへは移さない)。この判定は domain の純関数 `switchableModels(models, effort)` に置き、renderer の選択肢と main の検証が同じ関数を使う (data-model §2)
- main は SDK に渡す値を `sdkModelOf(entry)` (`launch-preparation.ts:95`。`inferenceProfileId ?? id`) で決め、セッションスレッドへはその文字列を送る。セッションスレッドは起動の `model` と同じ文字種の検査 (`isValidModelId`) を `decodeSessionControl` で通す (FR-006)
- Provider が null (既定) のセッションはカタログを持たないので、モデルの選択は理由つきで押せない (data-model §5.2)。起動の model が null (既定) のセッションは、今の値を「既定」と出し、カタログのモデルへの切り替えだけを受ける (既定に戻す口は出さない。spec U-3)
- Provider がカタログを起動の後に編集・削除していたら、main は今のカタログで判定する (無い・Provider が消えた = `invalid-value`)

## R-04 (P-3) 結果の運び方 — main を通す

- `setPermissionMode` / `setModel` の結果 (Promise の成否) は、セッションスレッド → 調停役スレッド → main の経路で返す。WorkerMessage と SupervisorEvent に `control-result` (`requestId` と `ok` だけ) を足し、調停役スレッドは `conversation` (X-9) と同じく窓に入れずに即座に中継する (contracts C-4)
- **本文の port (data plane) で返さない理由**: (1) 変更の受け付けの判定 (同じセッションの変更は 1 つずつ。名前の変更の状態の判定) は main の registry が持つので、main が結果を知る必要がある。(2) 値は `requestId` (UUID) と真偽だけで、会話由来の文字列を含まない (Principle IX の「本文を main に通さない」に当たらない)
- main の起動の service は `requestId` ごとの待ちを持ち、結果・スレッドの終わり (`onThreadEnded`)・supervisor の終わり (`onExit`)・`killAll`・期限 (10 秒。[ASSUMED: 数値デフォルト値]) のどれかで 1 回だけ解く (data-model §4)

## R-05 (P-4) 受け付ける状態

- 権限モード・モデル: registry の行が `claudeAlive` かつ状態が `running` / `awaiting_permission` / `interrupted` / `done` のとき。`launching` は外す — 起動から最初のプロンプトの後の最初の stream までの窓で、`claude` が制御要求を受けられる状態か保証が無い (glossary SessionRunState)。最初のプロンプトの前に変えたいときは起動ダイアログで選ぶ
- 名前: 上に加えて会話の id があり、状態が `done` (応答待ち) か `interrupted` のとき (spec U-6 / FR-010)
- 同じセッションの変更は 1 つずつ (種類を問わない)。前の結果が返るまで、次の要求は `busy` で拒否する (Edge Cases の「連打」。renderer は押せない形にするが、判定は main)

## R-06 (P-5 / P-6) 改名の実行場所と `dir`

- **実行場所**: `renameSession` は `CLAUDE_CONFIG_DIR` を env で読む。列挙 (常駐) と transcript の取得 (短命) と同じく、**env を起動の時点で固定した短命の `utilityProcess`** (`src/agents/rename-session.ts`) で呼ぶ (AD-034 決定 2 の「共有可変 env に相乗りしない」)。セッションスレッド (Worker) で呼ばない理由: Worker は supervisor の env を共有し、`claude` の config ディレクトリ (Provider ごと) と supervisor の env は一致しない
- **`dir` を渡さない (P-6)**: `dir` はプロジェクトのパスで、SDK がホストのパスとして正規化する。WSL の作業ディレクトリ (`/home/...`) はホストのパスではないので、正しい `projects/<encoded>` にならない。`dir` を省くと config ディレクトリの `projects/` の下を探すので、WSL (UNC の config ディレクトリ) でも Win32 でも同じ形で書ける。会話の id は UUID なので別のプロジェクトの同じ名前の JSONL と取り違えない。transcript の取得も `dir` を使っていない (AD-034 決定 2)。spec FR-011 の「`{ dir }`」はこの形に直した (spec の FR-011 / SC-004)
- **列挙対象の決め方**: 稼働中の行の再開でそれまでの会話を読む列挙対象の決め方 (`resume-service.ts:136` の `liveTranscriptTargetKey`。021 data-model §8.1) をそのまま使う。関数を `src/main/app/live-transcript-target.ts` に切り出し、再開と改名の両方から呼ぶ (振る舞いは変えない)。列挙対象から config ディレクトリの env を作るのは `transcriptTarget` (`session-service.ts:756`) と `buildTranscriptEnv` (`config-dir.ts:134`) の今の経路
- 結果は子の `process.parentPort` から `{ ok }` の 1 通で返す。名前は main → 子の 1 通で渡す (100 文字以下。本文ではない)。stdio は `ignore` (UNC を含みうる例外の文字列を捨てる。transcript-spawner と同じ)。期限 10 秒 [ASSUMED: 数値デフォルト値] で止めて `write-failed`

## R-07 (P-7) 名前を持つ場所

- main の registry の行に `name` を持つ (spec FR-012)。renderer へは IPC の戻り値で返し、renderer のストアの行 (`LiveSessionState.name`) に入れる。新しい通知のチャネルは足さない — 名前を変えるのはその renderer 自身で、窓は 1 つしかない
- 権限モード・モデルの今の値は main に持たない。main は判定に要るもの (会話の id・状態・起動の Provider と effort・変更中か) だけを持つ。今の値の表示は renderer の `meters.permissionMode` (R-02) と `currentModelId` (成功した値) で足りる。spec の Key Entities の「registry に今の権限モード・今のモデル」は「main の registry は名前と判定の値、今の値は renderer のストア」に直した (plan の「設計後の見直し」)
- どれも永続化しない (FR-014)。`LiveSessionState.config` (起動の設定。X-9 の再開の初期値) は書き換えない (U-8)

## R-08 (P-8) Constitution 検証の項目 14 / 16 の変更

- 項目 16: `QUERY_MUTATION_METHODS` から `setPermissionMode` / `setModel` を外す (22 → 20)。`sdk-agent-session.ts` の型の分類に `QueryLiveSettingMethod = 'setPermissionMode' | 'setModel'` を足し、網羅の検査 (`:185-188`) に入れる。`tests/docs/query-mutation-methods.test.ts` の固定を 20 にする。`.setPermissionMode(` の引数の包みの検査を足す (R-02)
- 項目 14: `AGENT_SDK_ALLOWED_CALLS` に `renameSession` (5 → 6)、`AGENT_SDK_CALL_FILES` に `renameSession: ['src/agents/rename-session.ts']`
- **書き込み系 API の別名と動的 import (P-8 の 2)**: rule fixture の `UNDETECTED_NOTES['sdk-forbidden-call-alias']` は「書き込み系 API を実際に使う X-6 の時点で、項目 14 に別名の検出を足す」と預けている (`expected.mjs:748-759`)。本 feature は最初に書き込み系 API を使う feature で、AD-034 決定 3 の第一の担保 (「書き込みを起こす IPC が無い」) が `renameSession` の IPC で崩れるので、ここで足す。形は 2 つ: (a) SDK の名前付き import のうち `type` でないもの (値の import) が、許可の名前でなければ違反、呼べるファイルの表に載る名前なら表のファイル以外で違反。(b) SDK のパッケージ名を `import(` / `require(` の引数に書いたら違反。今の値の import は 3 ファイルの許可の名前だけなので、既存のコードは違反にならない (`enumerate-sessions.ts:1` / `read-transcript.ts:1-5` / `sdk-agent-session.ts:1-19` を確かめた)。alias のサンプルは `detectors: ['constitution']` になり、`UNDETECTED_NOTES` から外す
- 既存の違反のサンプル `sdk-forbidden-call` / `sdk-forbidden-call-alias` は `renameSession` を禁止の例に使っているので、`tagSession` に差し替える (AD-034 決定 3 の「差し替えて発火を維持する」と同じ)。`sdk-query-mutation-method` (`setPermissionMode('default')`) は `setMaxThinkingTokens(null)` に差し替える

## R-09 (P-9) renderer の置き場と部品

- 中央のヘッダ (`CenterHeader.tsx`) の `live` の行に、権限モードの選択・モデルの選択・名前の編集を置く (spec U-7)。今のヘッダの注記「操作 (停止・閉じる) は置かない」は、停止・閉じるの操作の置き場 (稼働中の行) を変えないという意味で、設定の変更は別とする (注記を直す)
- 選択は起動ダイアログと同じ native の `<select>` (`LaunchDialog.tsx:748-765`) とラベルの表 (`PERMISSION_MODE_LABELS`・モデルの `displayName`) を使う。registry の element (Model selector / Composer model picker / Settings) は取り込まない (spec U-7。O-10 research SH-002 と同じ結論)
- カタログは `useProviders()` (`features/provider/useProviders.ts`。概要のタブが使っている) から引き、選択肢は domain の `switchableModels` で絞る
- 今の権限モードの表示は `meters.permissionMode ?? config.permissionMode`、今のモデルは `currentModelId ?? config.modelId` (null は「既定」)。`ContextCostMeter` に渡すモデル id も今のモデルにする (主モデルの選び方 `ContextCostMeter.tsx:86-97` は変えない)
- 見出し (`h2`) は `name ?? フォルダ名`。稼働中の行の題も同じ
- 失敗の 1 行はヘッダの下に `role="status"` で出し、次の操作で消す

## R-10 (P-10) 対応表の書き換え

- E 節 (`docs/ui-coverage.md:219-222`):
  - `set_permission_mode` → `実装済み: 中央のヘッダの権限モードの選択 (実行中)`
  - `set_model` → `実装済み: 中央のヘッダのモデルの選択 (実行中)`
  - `rename_session` → `実装済み: 中央のヘッダの「名前を変更」(実行中)`。SDK の `renameSession()` で書く旨を備考に
  - `set_max_thinking_tokens` → `表示不要: SDK が deprecated。思考量は起動時の effort の軸 (AD-041 (g))`
- F 節の Composer model picker (`:284`)・Model selector (`:338`)・Settings (`:359`) の備考に「X-6 (023) で照合した: 実行中のモデルの切り替えは中央のヘッダの選択で実装し、element は取り込まない (023 U-7)」を書く (FR-016)。割当の値 (`未使用`) は変えない
- 項目 21 の出力で `後続: X-6` が 0 になる (SC-007)

## R-11 (P-11) agents の標準モジュールの禁止を依存グラフにも足す

- `UNDETECTED_NOTES['agents-builtin-via-get-builtin-module']` (`expected.mjs:903-909`) は「agents にセッション操作 (fork / resume / rename 等) のモジュールが増える X-6 の時点で、`.dependency-cruiser.js` に `agents-not-to-core` を足す」と預けている。本 feature は `src/agents/rename-session.ts` を足すので当たる
- 足す規則: `from` が `^src/agents/` (`.test.ts` を除く)、`to` が標準モジュール (`core`) のうち `child_process` / `worker_threads` 以外。`child_process` は項目 7 (`PROCESS_SPAWN_MODULES`) が、`worker_threads` は既存の `worker-threads-only-from-entry` (`.dependency-cruiser.js:292-300`) が実名のファイルに縛っている。今の agents の標準モジュールの import は `sdk-agent-session.ts:1-2` と `supervisor.ts:1` の 2 つだけで、どれも除いた 2 つなので既存のコードは違反にならない
- サンプル `agents-builtin-via-get-builtin-module` の `detectors` を `depcruise` にし、`UNDETECTED_NOTES` から外す

## R-12 (P-12) 預けられた他の X-6 の項目のうち、本 feature の変更で当たるかを確かめたもの

| 項目 (`expected.mjs`) | 条件 | 本 feature |
|---|---|---|
| `ui-path-concat` (`:776-788`) | 追加ディレクトリのパス入力を renderer に足す | 当たらない — 名前はパスではなく、パスの入力を足さない。X-6 の後続のまま |
| `coordinator-helper-json-parse` (`:841-846`) | 制御行を足して調停役スレッドの import が増える | 当たらない — `control-result` の decoder は `supervisor-protocol.ts` に置き、`supervisor.ts` / `supervisor-core.ts` の import は増えない (contracts C-4) |
| `supervisor-json-parse-multi-alias` (`:857-862`) | 同上 | 当たらない — 同上 |
| `worker-env-via-expression` (`:882-887`) | Worker の起こし方が増える | 当たらない — Worker を起こす箇所を足さない。改名は Worker ではなく短命の `utilityProcess` |

どれも `nextFeature: 'X-6'` のまま、`howToClose` に「023 で確かめた: 当たらない」を 1 文足す (plan の申し送り #17〜#20)。

## R-13 (P-13) 改名とターンの重なり

- `renameSession` は `claude` が書いている同じ JSONL に 1 行を `O_APPEND` で足す。ローカルのファイルシステムでは 1 回の `write` の追記は他の追記と混ざらないが、WSL の UNC (9P) 越しでの保証は確かめていない
- ターンの実行中は受けない (R-05) ので、`claude` がメッセージを書いている最中と重なる窓は「応答待ちに入った直後に `claude` が後処理の行を書く」場合に限られる。quickstart V-5 で JSONL が壊れないこと (過去の一覧と再開で読めること) を確かめ、壊れたら利用者に返す (plan RK-03)
- 名前の変更の後に Closta の外で同じ会話に名前を付けた場合は、最後の custom-title が効く (Edge Cases)。Closta の稼働中の行の表示は自分の名前のまま (Principle X の「矛盾したら Claude Code を正」は過去の一覧の再取得で満たす)
