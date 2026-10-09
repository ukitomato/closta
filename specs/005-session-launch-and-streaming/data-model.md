# Data Model: 単一セッション起動とストリーミング (X-1)

型・状態機械・DTO の設計。**正本は本ファイルとコードの型定義**。spec.md / contracts は参照する。
実装型は `src/domain/session/` に置き、I/O を持たない (AD-023 §3。`ui` と `agents` から共有)。

## §1 AgentSession (interface — `domain`)

AD-023 §3 の宣言 (`start`/`interrupt`/`stop`) を**土台に拡張**する (§3 は例示であり、本 feature は
`respondPermission` / `sendPrompt` を足し `start` の引数を `LaunchInput` にする)。
**インタフェースは `domain`、実装は `agents`。**

```ts
// domain/session/agent-session.ts
export interface AgentSession {
  start(input: LaunchInput): AsyncIterable<SessionEvent>  // 起動 + stream
  respondPermission(decision: PermissionDecision): void   // canUseTool の応答
  sendPrompt(text: string): void                          // AsyncIterable prompt へ push
  interrupt(): Promise<void>                               // SDK interrupt (control_request)
  stop(): Promise<void>                                    // graceful 停止
}
```

- 実装は `agents` の **module worker** (`agents/sdk-agent-session.ts`。クラスでなく `run()`/`main()`。
  `read-transcript` / `enumerate-sessions` と同じ構え) で、`query({ prompt, options })` を呼ぶ。
  `prompt` は AsyncIterable で**開いたまま保つ** (FR-011)。`options.canUseTool` にコールバックを渡す。
- **`options.spawnClaudeCodeProcess` に WSL 起動の spawn コールバックを渡す** (SDK 実型で
  `(options: SpawnOptions) => SpawnedProcess` のコールバック。sdk.d.ts:2288)。コールバックは
  `RuntimeLaunchSpec` (§8) の値と SDK の `SpawnOptions` を合成して `child_process.spawn` する。
  返る `SpawnedProcess` (`wsl.exe` プロセス) の**ハンドルは supervisor (agents) が保持**し、kill できる
  (AD-018 Consequences / AD-036 §3)。→ `agents/sdk-agent-session.ts` は `PROCESS_SPAWN_MODULES` に入る。
- **権限ゲートは正の構成 (allowlist) で守る** (contracts C-4 P1-P3 が正本): (P1) `query()` options のキー集合を
  `{permissionMode:'default', canUseTool, spawnClaudeCodeProcess, pathToClaudeCodeExecutable, abortController}` の完全部分集合に固定
  (`abortController` は cancellation 専用の operational key。escalation-neutral)、
  (P2) `toPermissionResult` の出力を `{behavior, message}` に固定 (`updatedPermissions`/`updatedInput` を出さない)、
  (P3) **`Query` メソッドは `interrupt()` のみ呼ぶ** (`setPermissionMode` / `setMcpPermissionModeOverride` /
  `applyFlagSettings` / `updateSettings` 等の mutation を呼ばない)。denylist で個別 API を追わない (AD-036 §4。FR-013 / SC-006(a))。
- **強制終了 (kill) は `AgentSession` の graceful 経路とは別**。app が制御 IPC (`session.kill`) を
  agents へ送り、agents が保持する `SpawnedProcess` を kill する (kill 対象は utilityProcess ではなく
  その中の `wsl.exe`。FR-016 / SC-005)。

## §2 LaunchInput (`domain`) — SessionLaunchConfig の最小部分集合

```ts
export interface LaunchInput {
  folder: WorkspaceFolder            // R-1 の登録フォルダ (所在つき)
  runtime: RuntimeDescriptor         // 実行中確認済みの WslRuntime に限る (FR-003)
  permissionMode: 'default'          // 固定。auto/bypass を渡す経路を型で塞ぐ (FR-013)
  // env は infra が組み立てる最小許可リスト (§7)。ここには資格情報を持たない (FR-006)
}
```

- **`permissionMode` は `'default'` リテラル固定型**。`PermissionMode` の 6 値ユニオンにしない —
  型レベルで `auto`/`bypass` を渡せなくする (SC-006 (a))。
- **agents が組む `query()` options のキー集合は正の構成 (allowlist) で固定する** (contracts C-4 P1):
  `{ permissionMode:'default', canUseTool, spawnClaudeCodeProcess, pathToClaudeCodeExecutable, abortController }` の完全部分集合
  (`abortController` は cancellation 専用の operational key)。
  **他キー (`settings` / `extraArgs` / `allowedTools` / `disallowedTools` / `permissionPromptToolName` /
  `allowDangerouslySkipPermissions` / `mcpServers` の escalating 設定 等) を一切含めない** — これらは承認カードや
  権限モードを迂回する昇格レバーであり、denylist で追わず allowlist で締め出す (M-101 / C-201。未知の option も閉じる)。
- 軸選択・プリセット・モデル・effort は本 feature に無い (X-4)。

## §3 SessionEvent (`domain`) — agents → renderer の一方向データ

```ts
export type SessionEvent =
  | { kind: 'message'; message: ThreadMessageLikeDTO }   // 逐次 / 完了メッセージ (R-3 の変換を再利用)
  | { kind: 'state'; state: SessionRunState }            // 状態遷移
  | { kind: 'permission-request'; request: PermissionRequest }
  | { kind: 'permission-denied'; denied: PermissionDeniedInfo } // SDKPermissionDeniedMessage (FR-014)
  | { kind: 'interrupt-receipt'; stillQueued: string[]; cancelled: string[] } // AD-018 §interrupt
  | { kind: 'failure'; reason: FailureReason }           // 理由キー (FR-020)
```

- **本文 (`ThreadMessageLikeDTO`) は R-3 の `message mapping` と同じ変換・同じ正規化を通る** —
  制御文字 / 双方向制御文字の除去、バイト長上限での切り詰め、URL allowlist (FR-009 / SC-008)。
- **逐次 (streaming / partial) のサニタイズは取得プロセス側で「完結メッセージ単位」に適用**する
  (`SDKPartialAssistantMessage` を使う場合は追記後の全体、または境界安全な incremental sanitizer を定義)。
  チャンク境界で双方向制御文字・サロゲートペアを分割して除去漏れを起こさない。
  **バイト長上限はメッセージ累積で効かせる** (delta ごとの上限では累積が無制限になり renderer が枯渇。
  H-06/H-07 / SC-008)。
- **`toolName` (permission-request) も同じサニタイズを通す** — MCP サーバ由来で攻撃者が制御しうるため
  (H-05。§5 参照)。
- **UNC / 生パスを載せない** (B-5 / AD-025)。作業ディレクトリを出す場合は所在の名前空間で表す。
- port 経由でのみ流れる (data plane)。**制御はここに載せない**。

## §4 SessionRunState (`domain`) — 状態機械 (純粋)

```
idle ──launch──▶ launching ──(初 stream/ready)──▶ running ──(応答完了)──▶ done ──sendPrompt──▶ running
  │                  │                              │  ▲                        │
  │                  │(起動失敗/所在不一致)          │  └── respondPermission ──┤
  │                  ▼                    canUseTool ▼                          │
  │                error ◀── (crash / stream 異常 / provider-error) ── awaiting_permission ──deny/grant──▶ running
  │                  ▲                                                          │
  └──────────────────┴──────────────── running ──interrupt──▶ interrupted ──sendPrompt──▶ running
```

- **7 状態**: `idle` / `launching` / `running` / `awaiting_permission` / `interrupted` / `error` / `done`。
  **`launching`** は launch invoke〜初 stream/ready の窓を表す (これが無いと単一セッション不変の判定が
  実装依存になる。N1/M-102)。
- `error` は `FailureReason` (§6) を伴う。**遷移は純粋関数** `nextState(state, action)` で定義しテストする。
  **入力 `action` は control action (launch/sendPrompt/interrupt/kill/grant/deny) と
  agents 由来イベント (ready/complete/canUseTool/crash/stream-error/provider-error) の判別 union**であり、
  データ描画用の `SessionEvent` (§3) とは別型 (N7。混同しない)。
- **`running` および `awaiting_permission` 中の `sendPrompt` は最小 in-memory キューに積む**
  (中断時の `still_queued`/`cancelled` が空振りしないため。承認待ち中の送信も同様に queue。message queue の
  本格表示は X-2。M-003 / C-004)。
- **単一セッションに限る** (FR-019)。**registry (`session-launch-service` の `active`) は「生存 worker プロセス」基準で、
  `active.size > 0` のとき新規 launch を拒否**する (run-state 連動ではない。pr-gate arch M-001)。kill 経路は worker が
  process.exit するため onExit → 除去され再 launch を許すが、**terminal `error`/`done` では worker は exit せず**、
  UI (reset/kill/dispose) の kill 経路が worker を落として初めて onExit → 除去される (C-6。M-102 は kill 経由の回収)。
  UI は error/done 後 entry へ戻る全経路で killSession を発火するため恒久 soft-lock は無い。
  複数セッションの集約 (監視ビュー) は O-1、並列は X-5。

## §5 PermissionRequest / PermissionDecision (`domain`)

```ts
export interface PermissionRequest {
  requestId: string          // 相関鍵 (control plane の応答と突き合わせる)
  toolName: SanitizedText    // MCP 由来で攻撃者制御しうる。双方向/C0/C1 除去 + 長さ上限 + plain 表示 (H-05)
  input: SanitizedToolInput  // R-4 と同じ argsText サニタイズを通す (FR-012 / AD-035)
  scope: 'once' | 'capability'  // 単発承認と capability 付与を区別 (glossary Approval card)
}

export interface PermissionDecision {
  requestId: string
  outcome: 'allow' | 'deny'
  scope: 'once' | 'capability'
}
```

- **main は決定を明示述語で検証する** (`as` キャスト禁止): `outcome ∈ {allow,deny}` / `scope ∈ {once,capability}`
  の enum 検証と、**決定の `scope` が要求の `scope` を超えない** (`once` 要求に `capability` 決定を受理しない)
  (H-04 / SC-004 / SC-007。`validate.ts` の既存 enum/membership 述語に合わせる)。
- **`PermissionDecision → SDK `PermissionResult` の写像は純関数 `toPermissionResult` に切り出し、
  出力キー集合を `{ behavior:'allow'|'deny', message? }` の完全部分集合に固定する** (正の構成。contracts C-4 P2)。
  **`updatedPermissions` (全 6 variant: setMode / addRules / replaceRules / removeRules / addDirectories /
  removeDirectories) と `updatedInput` を一切出力しない** — これらは `canUseTool` 応答からモード昇格・ルール書換・
  承認済み入力の書換を行う経路であり、`setPermissionMode` を呼ばなくても Principle III / FR-012 を破る
  (C-101 / H-201 / L-201 を一括で閉じる。変数を列挙せず「behavior/message 以外を出さない」で締め出す)。
- **`capability` 付与は当該セッション寿命の in-memory 状態**として実現する (同種要求の再問い合わせ抑止をアプリ側で行う)。
  **SDK の `updatedPermissions` には載せない**。永続化・プリセット反映をしない (それは X-4。M-04 / SC-004。**読み替え**: [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (c) により宛先は I-3)。
- `PermissionDeniedInfo` は `SDKPermissionDeniedMessage` 由来 (聞かれずに拒否)。何が拒否されたかを保持 (FR-014)。

## §6 FailureReason (`domain`) — 理由キー (訳出は `ui`)

```ts
export type FailureReason =
  | 'distro-not-running'      // 停止中 (FR-003)
  | 'not-verified-running'    // VerifiedRunning 無し
  | 'distro-mismatch'         // folder 所在 distro ≠ 選択 runtime distro (FR-003 / H-09)
  | 'claude-not-found'        // 実行パス解決不可 (FR-005。起動失敗と区別)
  | 'launch-failed'           // spawn 失敗
  | 'process-crashed'         // 起動後クラッシュ
  | 'stream-protocol-error'   // stream / control protocol 破損
  | 'provider-error'          // 起動後の Provider/認証/API エラー (未ログイン/認証切れ/クレジット/rate/到達不可。FR-020 / H-03)
  | 'interrupt-unavailable'   // interrupt_receipt_v1 が無く強制終了に落ちた (AD-018 Open Q)
```

- `provider-error` は SDK では crash でなく `SDKResultMessage`(error subtype) 等で返る (AD-020)。
  **黙って `done` にせず**この理由キーへ落とす。pre-launch 到達性判定は X-3、実行時エラーの表示は本 feature。
  O-4 で読み替えた — 実行時のエラーの result の理由は `provider-error` に限らず 8 つのキーに分ける (条件の正本は
  [014 data-model §1](../014-ui-metering-and-limits/data-model.md))。終わり方 (黙って `done` にしない) は変えない
  ([AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) Decision 1)
- **`distro-mismatch` の追加に伴い理由キーは 9 種。**
- **監査ログ (任意だが推奨。L-101)**: permission 決定 (outcome/scope/requestId)・launch ゲート判定 (理由キー)・
  kill 発行を、**会話由来ペイロードを含めないメタのみ** (sessionId / requestId / サニタイズ済み toolName /
  outcome / scope / 理由キー) の構造化ログに残す。会話本文・argsText・env は含めない (Principle V と両立)。
- **失敗検知レイヤ (どの段で失敗したか) を、会話ペイロードを含めない構造化ログ**に残す (M-005 / SC-006(c))。

- **理由キーは `session`/`infra` が保持し、日本語訳は `ui`** (R-2 FR-031 と同じ分担。Principle XV)。
- 失敗はセッション内に閉じ、**アプリを例外で落とさない** (FR-020 / SC-010)。

## §7 起動 env の許可リスト (`infra`)

- supervisor に渡す env は**明示許可リスト (実名集合) のみ**。親環境を継承しない (FR-006 / SC-006 (b))。
  **許可リストは実名で完全列挙する** (「例 + 実装時確定」にしない。SC-006(b) の「完全一致」が照合基準を持てる形にする)。
  正本は本 § とする。R-2 の確定済み先例 `ENUMERATION_ENV_ALLOWLIST = ['SystemRoot','windir','TEMP','TMP']`
  (`src/main/infra/session/config-dir.ts`) に倣う。
  **`PATH` は含めない** — wsl.exe を System32 絶対パスで、`claude` を `pathToClaudeCodeExecutable` の絶対パスで起動する
  ため不要であり、WSL interop が Windows `PATH` を WSL 内 PATH へ透過する経路 (攻撃者が prepend しうる) を作らない
  (M-201。config-dir.ts の PATH 除外根拠と同じ)。他に真に必要な変数が判明したら根拠つきで本 § に追記する。
- **denylist (許可リストに現れてはならない)**: `WSLENV` と資格情報系パターン
  (`ANTHROPIC_API_KEY` / `AWS_*` / `*_TOKEN` / `*_SECRET` / `*_KEY`)。WSL は `WSLENV` 列挙変数を
  WSL 内へ透過するため、これらが混ざると秘密がアプリを通って `claude` に渡る (H-01 / AD-036 §6)。
- **`CLAUDE_CONFIG_DIR` は本 feature の起動 env に含めない** — 既定 Provider に委ねるため。
  含める必要が生じたら値が distro RuntimePath であることを検証する (AD-030 §2 は列挙経路限定の記述。L-02)。
- **資格情報を入れない / 会話由来ペイロード (env / プロンプト / argsText / stream 本文 / permission 要求) を
  ログに出さない** (Principle V。SC-006 (c))。
- 組み立ては**純粋関数**にし、プロセスを起こさず単体テストで測る (SC-006)。
- **許可リストと denylist ロジックを 1 つの共有純関数に切り出す** (`buildLaunchEnv` 等)。
  utilityProcess.fork の env (app レイヤ。Electron 概念で infra は electron 非依存のため infra に置けない。AD-023 §8) と
  agents の child_process.spawn の env の**両 spawn 点が同じ共有純関数を呼ぶ**ことで、両点で同一の許可リスト・
  denylist (WSLENV / 資格情報系) を保証する (M-101/M-202。「1 モジュールに一本化」ではなく「denylist は共有純関数、
  builder は 2 点」が正確。tasks BE-002/BE-004 をこれに合わせる)。

> **読み替え (後続 ADR)**: [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (b)(e) により、X-4 以降は次のように変わる。
> - 本 § の許可リストと denylist は、passthrough (curated base) の規則として存続する。
> - wsl.exe の spawn env には、導出の `forwardKeys` (`CLAUDE_CONFIG_DIR` の RuntimePath を含む) と、アプリが生成する `WSLENV` を加える (`composeLaunchEnv`)。
> - fork env は本 § の最小 env のままとする。

## §8 RuntimeLaunchSpec (`infra/runtime`) — agents を WSL-free に保つための値

```ts
// infra/runtime/ が構築する「起動の指示」を表す値。wsl.exe の argv/リテラルはここ (WSL_CALLER_MODULES) に閉じる。
// AD-023 §7 は元来 argv 構築を agents に置いたが Principle VII 強制のため infra へ移す (AD-036 §8 の調停)。
export interface RuntimeLaunchSpec {
  pathToClaudeCodeExecutable: string   // WSL 内 claude の実行パス (RuntimePath)。起動時に 1 回解決 (AD-018 §4 / AD-015)
  command: string                      // 起動コマンド (= 'wsl.exe' の絶対パス)。値。agents はこの文字列リテラルを持たない
  prefixArgs: string[]                 // ['--cd', cwd, '-d', distro, '--'] 等。配列で構成 (シェル補間しない。H-05)
  env: Record<string, string>          // §7 の許可リストで組み立てた最小 env。agents はこれ以外の env を混ぜない
}
```

> **読み替え (後続 ADR)**: [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) により、X-4 以降は次のようになる。
> - prefixArgs は `['--cd', cwd, '-d', distro, '--exec']` (§(f))。
> - env は `composeLaunchEnv` の結果 (§(e))。

- **cwd は `prefixArgs` の `--cd <RuntimePath>` として渡す** (ホスト `child_process.spawn` の `cwd` オプションには
  渡さない)。RuntimePath をホスト cwd に渡すと Windows CreateProcess が ENOENT / 誤解決になる (H-03 / AD-004 の多段変換)。
  RuntimePath (cwd) の生成は **composition-root (app)** が domain のパス API 経由で行い (PathMapping 状態が要るため。
  AD-036 §3 訂正 2026-09-27 / pr-gate arch M-002)、agents は再変換せずそのまま `--cd` に載せる (C-002)。
- **spawn 主体は agents である** (SDK の `spawnClaudeCodeProcess` はコールバックで query 呼び出し元=agents で
  評価される。sdk.d.ts:2288 / AD-036 §3/§8)。agents はこの `RuntimeLaunchSpec` の値と SDK の `SpawnOptions.args` を
  合成し `child_process.spawn(spec.command, [...spec.prefixArgs, ...spec.pathToClaudeCodeExecutable + SDK args], { env: spec.env, shell: false })` する。
  → `agents/sdk-agent-session.ts` は `PROCESS_SPAWN_MODULES` に入る (ADR AD-036)。
- **spawn の `env` は `spec.env` のみから構成する** — SDK 提供の `SpawnOptions.env` (必須。sdk.d.ts:2780) や
  agents の `process.env` を spread / マージしない (H-01/H-102。既存先例 `wsl-cli.ts:87` の `{...process.env}` を
  持ち込まない)。SC-006(b) は「実際に spawn に渡る最終 env」に対して assert する。
- **`shell: false` を明示**し、`command` は System32 の絶対パスで解決する (裸名 PATH 依存を避ける。L-102 / CWE-426)。
- **agents は `wsl.exe` の文字列リテラルを持たない** — `command`/`prefixArgs` は値で受ける
  (`WSL_FREE_DIRECTORIES` / 検証項目 3 を「リテラル不在」で満たす)。**argv は配列で構成し、distro 名・cwd・
  claude パス等の未信頼値をシェル補間しない** (H-05 / CWE-78)。
- app (composition root) が `infra/runtime` から `RuntimeLaunchSpec` を取得し、spawn 時に agents へ
  data として渡す (`agents → infra` の import は AD-023 §7 が禁止。値の受け渡しで解く)。
- **kill ハンドル (`SpawnedProcess`) は agents が保持**する (AD-018 Consequences)。

## §9 IPC / port の境界 (contracts C-1〜C-3 が正)

- 制御 (control plane): renderer → main invoke。preload 単一 capability に追加。main が全検証 (FR-010)。
- データ (data plane): `MessageChannelMain` の port2 を renderer へ transfer。agents → renderer 直通。
  **inbound は受けない** (port から制御を発行させない。AD-034 §1)。
- **renderer への port 受け渡しは R-3 と同じく `window.postMessage` + 専用 marker + セッション固有 token で
  照合**する (MessagePort は contextBridge を越えられない。`capability.ts` の `TRANSCRIPT_PORT_MESSAGE` に倣う。
  renderer は token 照合した message の `ports[0]` のみ受理。M-03 / SC-007)。
- **spawn ハンドルと port の保持は `sessionId` 鍵の registry (Map) で表す** — 単一セッション制約は状態機械の
  対象数の制約であり、保持構造まで単数にしない (X-5 の複数セッションで作り直さないため。M-02 / FR-019)。
