# Contracts: 単一セッション起動とストリーミング (X-1)

IPC / プロセス境界の契約。**この表が守りたい性質の正本**。SC はここの各行を参照する。

## C-1 制御 IPC (control plane) — renderer → main invoke

preload の**単一 capability** に追加する (FR-010)。main が送信元とペイロードを未信頼として検証する。

| メソッド | 引数 | 返り | 検証 (main 側) |
|---|---|---|---|
| `session.launch` | `{ folderId, runtimeId }` | `{ sessionId }` or `failure` | runtime が**実行中確認済み (VerifiedRunning) の WslRuntime**。folder が登録済み。**folder 所在 distro == runtime distro** (`isNamespaceConsistent`/`isSameDistro`。H-09)。**既に active/launching なら拒否** (単一セッション不変。M-02)。停止中/未確認/不一致は拒否 |
| `session.sendPrompt` | `{ sessionId, text }` | `void` | sessionId が既知の稼働セッション。**text は空/空白のみを拒否・バイト長上限**・正規化 (M-04) |
| `session.respondPermission` | `{ sessionId, requestId, outcome, scope }` | `void` | sessionId + requestId が**awaiting 中の要求と一致**。**`outcome ∈ {allow,deny}` / `scope ∈ {once,capability}` を明示述語で検証 (`as` 禁止)**。**決定 scope が要求 scope を超えない** (`once` 要求に `capability` を受理しない。H-04)。データ経路からの発行を受けない |
| `session.interrupt` | `{ sessionId }` | `void` | sessionId が既知 |
| `session.kill` | `{ sessionId }` | `void` | sessionId が既知。**強制終了は別メソッド** (中断と混ぜない。FR-016) |

- **送信元検証**: `event.senderFrame` を検証 (R-1 の単一 capability と同じ拘束)。
- **未知 sessionId / 停止中・不一致 runtime / 不正 outcome・scope 格上げ / データ経路からの制御 は拒否** (SC-007)。

## C-2 データ port (data plane) — agents → renderer 直通

- main が `new MessageChannelMain()` を作り、**port1 を agents へ / port2 を renderer へ transfer** する。
- agents は `query()` の yield を `SessionEvent` (data-model §3) に変換し **port1 に post** する。
- **main は本文を保持・`JSON.parse`・deserialize しない** (FR-007 / SC-003)。port ハンドルの中継のみ。
- **port2 は一方向 (agents → renderer)**。renderer からの inbound を agents は受理しない。
  取得/制御は必ず C-1 の invoke を通す (AD-034 §1 の迂回防止)。
- **renderer への port2 受け渡しは `window.postMessage` + 専用 marker + セッション固有 token で照合**する
  (MessagePort は contextBridge を越えられない。R-3 の `TRANSCRIPT_PORT_MESSAGE` に倣う)。
  renderer は token 照合した message の `ports[0]` のみ受理し、他 token/marker の port を受理しない (M-03 / SC-007)。

## C-3 境界を渡してはならない形 (SC-008 / B-5)

| 禁止 | 理由 |
|---|---|
| SDK クライアント / コールバック / `AbortSignal` / `File` を IPC・port に載せる | structured-clone 不可 / セキュリティ (AD-023) |
| **UNC 形式・生の作業ディレクトリ文字列**を DTO / port / IPC に出す | AD-025「UNC は infra の内側」。R-2 の前例を踏襲しない (B-5)。所在の名前空間で表す |
| 会話由来文字列を**正規化前**に境界へ出す | XSS / 制御文字 (FR-009)。切り詰め・制御文字除去・URL allowlist を通す |
| 生 HTML の描画 | R-3 の XSS 境界を継承 (AD-034)。live でも回帰させない |

## C-4 SDK 呼び出しの契約 (Principle IV / allowlists.mjs)

**呼んでよい API** (呼び出し形で判定):

| API | 用途 | 追加 |
|---|---|---|
| `query()` | セッション起動 + stream | `AGENT_SDK_ALLOWED_CALLS` に **`query` を追加** (ADR 要。SH-上流2) |
| `.interrupt()` | 中断 (query 戻り値のメソッド) | 呼び出し形の追加要否を実装で確認 |
| `canUseTool` (option) | permission コールバック | 呼び出しでなく option。検査対象外だが AD-020 §3 の安全モードを守る |

**権限ゲートは「正の構成 (allowlist)」で守る。denylist で個別 API を追わない。**
SDK の permission/settings API 面は広大 (`setPermissionMode` / `canUseTool` 応答の `updatedPermissions` 6 variant /
`updatedInput` / 起動 options `settings`・`extraArgs`・`allowedTools`・`disallowedTools`・`permissionPromptToolName`・
`allowDangerouslySkipPermissions` / `Query.applyFlagSettings` / `setMcpPermissionModeOverride` / `updateSettings` …)
であり、**「これらを呼ばない」という禁止列挙は必ず漏れる** (design-gate R1→R2→R3 で列挙漏れが 3 度露見。
`allowlists.mjs` 冒頭の「禁止側を列挙しない」規範と同じ)。したがって**正の構成で閉じる**:

**(P1) `query()` に渡す options は固定 allowlist から構成する。** agents が組む options オブジェクトのキー集合は
**`{ permissionMode:'default', canUseTool, spawnClaudeCodeProcess, pathToClaudeCodeExecutable, abortController }`
の完全部分集合**とし、それ以外のキー (`settings` / `extraArgs` / `allowedTools` / `disallowedTools` /
`permissionPromptToolName` / `allowDangerouslySkipPermissions` / `mcpServers` の escalating 設定 等) を
**一切含めない**。**`abortController` は cancellation 専用の operational key** であり permission/settings 面を
変えない (中断・kill 時の abort 伝播に要る。escalation-neutral)。permission 系の 4 キーと役割を分けて数える。
prompt は AsyncIterable。→ 未知の起動時昇格 option も構造的に締め出す。

**(P2) `canUseTool` の応答 (`PermissionResult`) は `{ behavior:'allow'|'deny', message? }` の完全部分集合に固定する。**
`toPermissionResult` 純関数の出力キー集合を `{behavior, message}` に限り、**`updatedPermissions` (6 variant すべて:
setMode / addRules / replaceRules / removeRules / addDirectories / removeDirectories) と `updatedInput` を
一切出力しない**。→ 承認カードを唯一の承認経路とし (FR-012)、モード昇格・ルール書換・入力書換の全経路を締め出す
(C-101 / H-201 / L-201 を一括で閉じる)。capability 付与は「当該セッション寿命の in-memory で同種要求の再問い合わせを抑止」
の**アプリ内状態**として実現し、SDK の `updatedPermissions` には**載せない**。

**(P3) `query()` 戻り値 `Query` のメソッドは `interrupt()` のみ呼ぶ。** `setPermissionMode` /
`setMcpPermissionModeOverride` / `applyFlagSettings` / `updateSettings` その他の mutation メソッドを呼ばない。

**呼んではならない書き込み系 API** (本 feature の scope 外。参考): `renameSession` / `tagSession` /
`deleteSession` / `forkSession` / `importSessionToStore` / `updateSettings` (設定ファイルへ書く。Principle VI)。
stream-json の自前 `JSON.parse` も禁止 (Principle IV/IX)。

**検証 (SC-006(a) / SH-010)** — 正の構成を allowlist で assert する (denylist の網羅に依存しない):
- 構成した `query()` options の**キー集合 ⊆ P1 の allowlist** (余分なキーがあれば fail)。
- `toPermissionResult` の出力**キー集合 ⊆ {behavior, message}** (`updatedPermissions`/`updatedInput` が現れれば fail。
  全 variant を列挙せずに閉じる)。
- 静的検査: `sdk-agent-session.ts` (Query を保持する唯一のモジュール) で `interrupt` 以外の Query メソッド呼び出しと
  `query(` に上記 allowlist 外のキーを持つ options リテラルが**現れないこと**。項目 14 は named import の
  呼び出し形のみで `.method()` を見ないため、この allowlist 検査 + fixture が唯一の機械的歯止め。
  捕まらない残余は `UNDETECTED_NOTES` に `nextFeature` つき記録 (AD-034 §3 / AD-027)。

## C-5 起動プロセスの env 契約 (Principle V / SC-006 / H-01)

- supervisor に渡す env のキー集合 = **明示許可リスト (実名。正本は data-model §7) と完全一致**。親環境を継承しない。
- **denylist**: `WSLENV` と資格情報系パターン (`ANTHROPIC_API_KEY` / `AWS_*` / `*_TOKEN` / `*_SECRET` / `*_KEY`)
  が許可リストに **0 件** (WSL が WSLENV 列挙変数を透過するため。AD-036 §6)。
- `CLAUDE_CONFIG_DIR` は起動 env に含めない (既定 Provider に委ねる。含めるなら distro RuntimePath を検証)。
- 資格情報を含めない。**env・プロンプト・argsText・stream 本文・permission 要求をログに出力しない**
  (会話由来ペイロード全般。M-01/M-05)。組み立ては純粋関数 (プロセスを起こさず測る)。

## C-6 プロセス寿命の契約 (FR-017 / SC-005 / SC-010 / H-02)

- supervisor は**セッション寿命** (per-session。AD-023 §6)。
- **kill ハンドルは agents が保持する。** `wsl.exe` は agents の `spawnClaudeCodeProcess` コールバックが返す
  `SpawnedProcess` であり (AD-018 Consequences / AD-036 §3)、app が持つのは agents utilityProcess のハンドル。
  強制終了は app→agents の制御 IPC (`session.kill`) で発行し、**agents が `SpawnedProcess` (`wsl.exe`) を直接 kill**
  する — Windows の親 kill は孫 (`wsl.exe`) に伝播しないため、agents utilityProcess の kill だけでは孤児が残る。
- **window close / before-quit で確実に kill** し、孤児プロセス・孤児 UNC ハンドルを残さない (AD-030 の先例)。
- app は spawn ハンドル / port を **`sessionId` 鍵の registry (Map)** で保持する (M-02。X-5 の複数化に耐える)。
- **単一セッション不変の判定は「registry に `launching` または非終端 (`running`/`awaiting_permission`/
  `interrupted`) の entry が在るか」で行う** (sessionId は launch の戻り値なので個別 id では判定できない)。
  **`error`/`done`/kill 到達後は registry entry を除去し再 launch を許す** (M-102。恒久ブロック/消し忘れを防ぐ)。
- クラッシュ検知時はそのセッションを `error` にし、例外を main/renderer に伝播させない。

## C-7 WSL 起動の spawn 主体と `wsl.exe` リテラルの帰属 (AD-036 §3 / 検証項目 3・7・15)

- **spawn 主体は agents** (`spawnClaudeCodeProcess` はコールバックで query 呼び出し元=agents で評価。sdk.d.ts:2288)。
  `agents/sdk-agent-session.ts` を **`PROCESS_SPAWN_MODULES` に追加**する (項目 7。ADR AD-036)。
- **`src/agents/` は `wsl.exe` の文字列リテラルを持たない** (`WSL_FREE_DIRECTORIES` / 項目 3・15 を
  「リテラル不在」で満たす)。起動コマンド (`'wsl.exe'`)・接頭引数・claude パス・cwd は `infra/runtime` が
  `RuntimeLaunchSpec` (data-model §8) として供給し、app 経由で agents に**値として**渡す。
- **argv builder のファイルを確定する** (M-A): 既存 `wsl-cli.ts` に収めるなら `WSL_CALLER_MODULES` 変更なし、
  新規 `infra/runtime` モジュールに置くなら `WSL_CALLER_MODULES` に**実名追加** (項目 3。ADR AD-036 に紐づけ)。
- 本 feature が `src/main/app/` に足す起動系モジュール (session-spawner 等) は `WSL_FREE_DIRECTORIES` に
  **実名追加**する (session 系の先例に倣う。黙って対象外にしない)。
- **FR-004 / Principle VII は保つ**: agents は Electron/native に依存せず (`child_process` は node 標準)、
  `node <entry>` の単独起動性を保つ。「agents は spawn しない」を「Electron/native 非依存・単独起動」へ厳密化 (AD-036 §3)。
