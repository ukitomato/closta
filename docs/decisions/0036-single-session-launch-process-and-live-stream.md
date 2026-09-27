---
id: AD-036
title: 単一セッション起動のプロセス形態・live stream の port transfer・canUseTool 往復と権限モードの実行時固定
status: accepted
date: 2026-09-25
deciders: [ukitomato]
tags: [session, architecture, ipc, principle-i, principle-iii, principle-v, principle-vi, principle-vii, principle-ix, process-boundary]
supersedes: []
superseded-by: []
related: [AD-002, AD-011, AD-018, AD-020, AD-023, AD-025, AD-030, AD-034]
---

# AD-036: 単一セッション起動のプロセス形態と live stream / canUseTool / 権限モード

> **status: accepted (2026-09-26)。** X-1 (spec `005-session-launch-and-streaming`) の SH-001 として起票。
> design-gate R1 の Critical 3 件を閉じるために起票し、R2 (C-101 canUseTool.setMode) / R3 (C-201 settings 系) で
> 権限昇格面の denylist が同一クラスの列挙漏れを 3 度露見させたため、**denylist を正の構成 (allowlist。§4 の P1-P3) に反転**した。
> design-gate R4 (platform-boundary + security の focused 確認) で権限昇格クラスと env 境界の閉鎖を SDK 0.3.270 実型で確認し、
> 全トラック Critical 0 (PASS) を得て accepted へ昇格した (`.gate-verdict-design.json`)。

## Context

X-1 は Closta が初めて `claude` プロセスを起こし、live stream を描画し、`canUseTool` の権限往復を扱う。
design-gate Round 1 で以下の Critical が出た。いずれも「SDK の実型を確認せず設計を確定と記述した」ことが根。

- **C-001** (platform-boundary ⊕ architecture): 「agents は `spawnClaudeCodeProcess` に値を渡すのみで
  spawn API も `wsl.exe` も持たない」と記述したが、SDK 実型
  (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2288`) では
  `spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess` は**コールバック**であり、
  実装者が spawn して `SpawnedProcess` を返す契約 (doc の例 2278-2285 は「VM/container/remote 用に
  自前 spawn」)。`query()` は `AGENT_SDK_IMPORT_DIRECTORIES=['src/agents/']` に限られ agents で走るため、
  コールバックも agents 内で評価される → WSL 起動を担う限り agents が `child_process.spawn` を持つ。
- **C-002** (po): 起動 entry point (folder+runtime 選択→launch) の scope 記述が US-1 / FR-003 / contracts C-1 と
  矛盾し、起動導線の所有者が不在。
- **C-003** (platform-boundary): `Query.setPermissionMode(mode)` (sdk.d.ts:2632) は 6 値
  (`sdk.d.ts:2327`。`auto` 含む) を受け、streaming input mode で実行時に呼べる。
  `permissionMode: 'default'` の**型固定は起動時 1 点のみ**を守り、実行時変更を防げない。
  check.mjs 項目 14 は named import の呼び出し形のみで Query のメソッド呼び出しを検出しない。

## Decision

### 1. 実行単位は per-session の `utilityProcess` (agents)。新しいのは寿命でなく「組み合わせ」

寿命は AD-023 §6 が最初に定義した per-session そのものである。AD-034 §2 が数えた「第 3 の形態
(per-request 短命)」とは別軸で、**新規性は per-session の長寿命プロセスに AD-034 の
`MessageChannelMain` port transfer + control-plane inbound (`send-prompt` / `grant` / `deny` /
`interrupt` / `kill`) + `canUseTool` 往復を組み合わせた点**にある。「第 4 の形態」とは呼ばない。

### 2. live stream は port transfer で agents↔renderer 直通、制御は main 検証済み IPC

AD-034 §1 の形を per-session に一般化する。

- main が `MessageChannelMain` を作り port1 を agents へ / port2 を renderer へ transfer。
  stream 本文 (`SessionEvent` DTO) は agents↔renderer 直通で流し、main は本文を保持・`JSON.parse`・
  deserialize しない (Principle IX)。
- **port2 は一方向 (agents→renderer)。renderer からの inbound を agents は受理しない。**
  制御要求 (承認 grant/deny・interrupt・kill・send-prompt) は必ず renderer→main の検証済み IPC を通す
  (main 検証の迂回を作らない。AD-034 §1)。
- renderer への port 受け渡しは R-3 と同じく `window.postMessage` + 専用 marker + セッション固有 token で
  照合する (MessagePort は contextBridge を越えられない。`capability.ts` の `TRANSCRIPT_PORT_MESSAGE` に倣う)。

### 3. WSL 起動の spawn は agents 内の `spawnClaudeCodeProcess` コールバックで行う。ただし agents は `wsl.exe` リテラルを持たない

**SDK 契約に従う (作り変えない最小案)。** `spawnClaudeCodeProcess` はコールバックであり、
agents がその中で `child_process.spawn` を呼ぶ。したがって:

- **`src/agents/sdk-agent-session.ts` を `PROCESS_SPAWN_MODULES` に追加する** (Principle VI: spawn 許可の
  追加は ADR を要する。本 ADR がその根拠)。check.mjs 項目 7 を満たす。

  > **訂正 (2026-09-26。AD-031 の in-place 訂正)**: 本 §は当初 check.mjs の `PROCESS_SPAWN_MODULES` 追加のみを
  > 挙げていたが、実装で **`eslint.config.mjs` の spawn 制限 (`MSG_SPAWN`「プロセス起動は `src/main/infra/runtime/`
  > のみ (FR-036)」) も同じ緩和が要る**ことが判明した (AD-030 §5 が記録した「起動層を infra へ移すと agents を
  > import できない」緊張の帰結)。したがって `child_process` の import と core spawn source への到達を
  > **`src/agents/sdk-agent-session.ts` の 1 ファイルに限って許可**する (`boundaries/files` に category を足し、
  > `no-restricted-imports` に file 別 override を足す)。spawn の許可は infra/runtime + 本 ADR がゲートする
  > agents の session worker **1 ファイル**に限定し、FR-036 の趣旨 (spawn 主体を実名で数える) は保つ。
- **agents は `wsl.exe` の文字列リテラルを持たない。** 起動コマンド (`command: 'wsl.exe'`) と接頭引数
  (`-d <distro> --`)・`claude` の実行パス・cwd の RuntimePath は、**`infra/runtime` が `RuntimeLaunchSpec`
  という値として構築**し (`wsl.exe` リテラルは `WSL_CALLER_MODULES` の内側に閉じる)、app が spawn 時に
  agents へ data として渡す (`agents→infra` の import は AD-023 §7 が禁じるため値渡しで解く)。
  agents はコールバックで受け取った SDK の `SpawnOptions` (`{command, args, cwd, env, signal}`) の `args` を使い
  `RuntimeLaunchSpec` と合成して `child_process.spawn(spec.command, [...spec.prefixArgs, ...], {...})` する。
  → check.mjs 項目 3 / 15 (`WSL_FREE_DIRECTORIES` の `src/agents/`) は「リテラルを持たない」ことで満たす。
- **spawn に渡す `env` は `RuntimeLaunchSpec.env` のみから構成する** — SDK 提供の `SpawnOptions.env` (必須。
  sdk.d.ts:2780) や agents の `process.env` を spread / マージしない (H-01/H-102)。混ぜると agents utilityProcess が
  継承した親環境の `WSLENV` や資格情報が許可リストを迂回し WSL 内 `claude` へ透過する (既存先例 `wsl-cli.ts:87`
  の `{...process.env}` を持ち込まない)。実 spawn 点の env は SC-006(b) が「合成後の最終 env」に対して assert する。
- **cwd (RuntimePath) は `child_process.spawn` のホスト `cwd` オプションに渡さない** — Windows CreateProcess に
  ホスト非存在パスを渡すと ENOENT / 誤解決になる。WSL 内の作業ディレクトリは `prefixArgs` の
  `['--cd', spec.cwd, '-d', distro, '--']` (`--cd` は `WSL_ALLOWED_ARGS` に既存) で渡し、ホスト `cwd` は
  HostPath か未指定にする (AD-004 の多段変換を 1 ホップに潰さない。H-03)。
- **FR-004 / Principle VII は保つ。** agents は Electron API・ネイティブモジュールに依存しない
  (`child_process` は node 標準であり electron / native ではない)。`node <entry>` の単独起動性も
  spawn の有無と独立に保たれる。**「agents は何も spawn しない」から「agents は spawn するが
  wsl.exe リテラルと Electron/native を持たない」へ、Principle VII の解釈を厳密化する。**
- **kill ハンドルは agents が保持する** (AD-018 Consequences「supervisor は `wsl.exe` プロセスの
  ハンドルを保持し kill できる必要がある」)。app が持てるのは agents utilityProcess のハンドルであり、
  `wsl.exe` はコールバックが返す `SpawnedProcess` として **agents が保持**する。強制終了は
  renderer→main→agents の制御 IPC で発行し、agents が `SpawnedProcess` を kill する。
  Windows の親 kill 非伝播に対しては、agents が保持する `SpawnedProcess` を直接 kill することで孤児を防ぐ
  (AD-018 は `wsl.exe` kill で WSL 内子プロセスが消え孤児が残らないことを実測済み)。
- **cwd / claude パスの RuntimePath 生成は `infra/runtime` が `domain` のパス API 経由で行い**
  (`RuntimeLaunchSpec` が RuntimePath を運ぶ)、**agents はその値を `--cd` 引数に渡すのみで再変換しない** (二重変換を作らない。
  変換主体を infra に一意化。C-002)。agents は HostPath / UNC が spawn argv・`SessionEvent` に漏れないことの
  検証だけを担う (`agents→domain` は許可。Principle I / AD-025)。
  > **訂正 (2026-09-27, in-place / AD-031)**: **cwd (HostPath→RuntimePath) の変換 locus は実装上 `composition-root` (app) である。**
  > 変換に runtime の `PathMapping` 状態が要るため結線層 (composition) が `domain` のパス API 経由で行い、`infra/runtime` の
  > `buildRuntimeLaunchSpec` は変換済み RuntimePath 文字列を受け取るだけにした (launch-spec.ts のヘッダ参照)。上記「infra/runtime が
  > 生成」は locus の記述違いで、核心不変条件 (単一 locus・agents は完成 RuntimePath を値で受け再変換しない・二重変換なし・
  > domain パス API 経由) は保たれている。Principle I 違反はない。決定の変更ではなく実装で判明した locus の事実訂正なので
  > 後続 ADR は不要 (pr-gate arch M-002)。plan.md の Constitution Check Principle I 行も composition-root へ追随。
- **`claude` 実行パスは検出時に解決する** (AD-018 §4「起動時 1 回解決」の実装。X-1 実装時に確定)。
  既存の probe (`PROBE_SCRIPT` / `runProbe`) に `printf 'claude=%s\n' "$(command -v claude || printf '')"` を
  1 行足し、絶対パスのときだけ `WslRuntimeDescriptor.claudePath` (RuntimePath 文字列。IPC/DTO には出さない) に
  載せる。**`command -v` は既存の許可形**であり check.mjs 項目 6 の形の制約に収まる。新しい `wsl.exe` の呼び出し
  引数 (launch-time の別 probe) を作らないため項目 2 の `WSL_ALLOWED_ARGS` も `PROCESS_SPAWN_MODULES` も増やさない。
  不在時は空文字列 → ホスト側で `claude-not-found` に倒す。**裸名 `claude` で起動しない** — `PATH` を渡さず絶対パスで
  起動する規則 (data-model §8 L-102 / CWE-426) と整合させるため、解決できないランタイムは起動を許さない。
  > **PROBE_SCRIPT の変更 (定数変更) は本 ADR がその根拠である** (probe-script.ts の「内容の変更には ADR を要する」)。

**採らなかった案**: (a) `pathToClaudeCodeExecutable` (文字列) だけで WSL 前置を注入する —
SDK は既定 spawn で `executable` (node 等) を前置するため `wsl.exe -d <distro> -- claude` の形を
文字列設定だけで注入できる保証がない。(b) spawn を app (session-spawner) に出す — spawn 関数は
structured-clone 不可で IPC 越しに渡せず、`spawnClaudeCodeProcess` は query() を呼ぶ agents で評価される以上
app に置けない。

### 4. `AGENT_SDK_ALLOWED_CALLS` に `query` を追加。権限昇格面を**全数**封鎖する

- `AGENT_SDK_ALLOWED_CALLS` に **`query` を追加** (呼び出し形で判定。Principle VI: ADR 要。本 ADR)。`interrupt()` は許可。
- **Principle III の実行時保証は「正の構成 (allowlist)」で守る。denylist で個別 API を追わない。**
  SDK の permission/settings API 面は広大 (`setPermissionMode` / `canUseTool` 応答の `updatedPermissions` 6 variant /
  `updatedInput` / options `settings`・`extraArgs`・`allowedTools`・`disallowedTools`・`permissionPromptToolName`・
  `allowDangerouslySkipPermissions` / `applyFlagSettings` / `setMcpPermissionModeOverride` / `updateSettings` …)
  であり、design-gate R1→R2→R3 で**禁止列挙が 3 度漏れた** (setPermissionMode → updatedPermissions.setMode →
  settings/applyFlagSettings/extraArgs)。`allowlists.mjs` 冒頭「禁止側を列挙しない — 列挙漏れが必ず生じる」規範に従い、
  **正の構成 3 点**で class ごと閉じる (contracts C-4 が正本):
  - **(P1)** `query()` options のキー集合を `{permissionMode:'default', canUseTool, spawnClaudeCodeProcess,
    pathToClaudeCodeExecutable, abortController}` の完全部分集合に固定 (他キー = settings/extraArgs/allowedTools 等を一切含めない)。
    > **訂正 (2026-09-26。X-1 code-gate M-002/convention M-001)**: 実装が `abortController` を 5 つ目のキーとして持つ。
    > **cancellation 専用の operational key** であり permission/settings 面を変えない (中断・kill 時の abort 伝播に要る。
    > escalation-neutral)。permission 系 4 キーと役割を分けて数え、allowlist を 5 キーに確定する。
  - **(P2)** `toPermissionResult` の出力を `{behavior, message}` の完全部分集合に固定
    (`updatedPermissions` 全 6 variant と `updatedInput` を一切出力しない)。capability 付与はアプリ内 in-memory 状態で実現
  - **(P3)** `Query` メソッドは `interrupt()` のみ呼ぶ (setPermissionMode / setMcpPermissionModeOverride /
    applyFlagSettings / updateSettings 等の mutation を呼ばない)
- **参考 (SDK 実型。正の構成が締め出す対象。0.3.270 で確認)**: `setPermissionMode`:2632 / `PermissionResult`:2349-2361 /
  `PermissionUpdate` 6 variant:2368-2395 / `updatedInput`:2351 / `settings`:2061 (`Settings.permissions.defaultMode`:6265) /
  `extraArgs`:1552 / `allowedTools`:1459 / `disallowedTools`:1479 / `permissionPromptToolName`:1861 /
  `allowDangerouslySkipPermissions`:1856 / `applyFlagSettings`:2705 / `setMcpPermissionModeOverride`:2649 (3 値 tighten-only) /
  `updateSettings`:2718。**旧稿の `setMcpServerPermissionMode` は SDK 非実在の綴り誤りで訂正した (H-02)。**
- **検証 (SC-006(a) / SH-010)**: (a) 構成した options のキー集合 ⊆ P1 allowlist、(b) `toPermissionResult` 出力の
  キー集合 ⊆ {behavior, message}、(c) `sdk-agent-session.ts` で `interrupt` 以外の Query メソッド呼び出しと
  allowlist 外キーを持つ options リテラルが現れないことの静的検査 + fixture。項目 14 は `.method()` を見ないため
  この allowlist 検査が唯一の機械的歯止め。捕まらない残余は `UNDETECTED_NOTES` に `nextFeature` つき記録。

### 5. permissionMode は起動時 `default` 固定かつ実行時も変更しない

- 起動時: `LaunchInput.permissionMode: 'default'` リテラル型で `auto` / `bypassPermissions` /
  `acceptEdits` / `dontAsk` を渡す経路を型で塞ぐ (Principle III / AD-020 §3)。
- 実行時: 決定 4 の全数封鎖 (setPermissionMode / updatedPermissions.setMode / addRules allow-all /
  allowedTools 等 / allowDangerouslySkipPermissions / setMcpPermissionModeOverride) により `default` を
  無人モードへ昇格させる経路を持たない。**SC-006(a) を「初期オプションと実行時の全昇格面
  (`setPermissionMode` + `canUseTool` 応答の `updatedPermissions` 全 union + 起動 options の tool 制約) で
  `auto`/`bypass`/`acceptEdits`/`dontAsk` への遷移経路が 0 件」に強化**する。

### 6. 起動 env は明示許可リスト。WSLENV と資格情報系を denylist

- `RuntimeLaunchSpec` に渡す env は **Windows→WSL 起動に必要な最小の実名許可リスト**とし正本を
  data-model §7 / contracts C-5 に置く。親環境を継承しない。
- **`WSLENV` と資格情報系パターン (`ANTHROPIC_API_KEY` / `AWS_*` / `*_TOKEN` / `*_SECRET` / `*_KEY`) を
  denylist に置き、許可リストに現れないことを SC-006 で assert** する (WSL は WSLENV 列挙変数を
  WSL 内へ透過するため。AD-011 / Principle V)。`CLAUDE_CONFIG_DIR` は既定 Provider に委ねる本 feature では
  起動 env に含めない (含める必要が生じたら distro RuntimePath であることを検証する)。

### 7. 起動ゲートは所在ディストロの一致を検証する

`session.launch` は VerifiedRunning の WslRuntime に加え、**folder の所在ディストロと選択ランタイムの
ディストロが一致すること** (`isNamespaceConsistent` / `isSameDistro` 完全一致。AD-025 §1/§2) を検証する。
不一致は拒否する (別 distro で走る / transcript が別 distro に書かれるのを防ぐ)。

### 8. AD-023 §7 Consequences (「起動 argv 構築は agents」) との明示的調停

AD-023 §7 Consequences は「起動 (argv 構築) は `agents`、境界には `RuntimeDescriptor` という値を置く」とした。
本 ADR はこれを**読み替える** — Constitution **Principle VI** の機械強制 (`WSL_CALLER_MODULES` /
`WSL_FREE_DIRECTORIES` = check.mjs 項目 3/15。agents に `wsl.exe` リテラルを許さない) が、WSL 固有 argv
(`command:'wsl.exe'` / 接頭引数) の構築を agents に置くことを禁じるためである
(`wsl.exe` はコマンド文字列であり Electron API でもネイティブモジュールでもないため Principle VII の対象ではない。
VII は agents の electron/native 非依存・単独起動性を縛る別の Principle である。M-001 訂正)。したがって **WSL 固有 argv の構築を `infra/runtime` へ移し、境界値を
`RuntimeDescriptor` から `RuntimeLaunchSpec` に一般化する** (agents は値を受け SDK コールバック内で spawn する)。
Governance の優先順位 (Constitution > ADR) に従い、AD-023 は immutable なので本文は変えず、本 ADR を
読み替えの根拠とする (AD-025 §3 が AD-004/AD-023 に、AD-030 §3/§4 が AD-021/AD-028 に、AD-034 §2 が
AD-023 §6 に対して確立した調停形式に倣う)。argv の**汎用**部分 (SDK が渡す `SpawnOptions.args`) は agents が
そのまま使い、WSL 固有の前置と env と cwd の `--cd` だけを `RuntimeLaunchSpec` から与える。

## Consequences

### 良くなること
- WSL 起動の spawn 主体・kill ハンドルの所有者が agents に一意化し、AD-018 Consequences と整合する。
- agents は spawn するが `wsl.exe` リテラルと Electron/native を持たないため、Principle VII / VI の機械検証
  (項目 3/7/15) をすべて満たす配線が確定する。
- 権限モードの実行時昇格経路が塞がれ、Principle III が起動時と実行時の双方で守られる。

### 代償 / リスク
- **agents が初めて `child_process.spawn` を持つ。** Principle VII の解釈を「spawn しない」から
  「Electron/native に依存しない・単独起動できる」へ厳密化する必要がある (本 ADR で明記)。
- check.mjs 項目 14 が Query メソッドを見られない穴は、専用 fixture + binding denylist で塞ぐが、
  到達集合検査と同じく「機械証明の限界」が残る (`UNDETECTED_NOTES` に記録)。
- 起動 spawn は ~2.7s の起動費 (AD-030 実測)。単一セッションの起動 1 回のため許容 (体感は quickstart に記録)。

### 申し送り
- [x] design-gate で Critical 0 を確認して status を accepted に昇格する (R4 PASS。2026-09-26)。
- [ ] `AGENT_SDK_ALLOWED_CALLS` への `query` 追加 / `PROCESS_SPAWN_MODULES` への `sdk-agent-session.ts` 追加 /
      `WSL_CALLER_MODULES` への argv builder 追加は本 ADR を根拠に実装フェーズで行う (SH-006/007)。
- [ ] session charter L149 / Related Specs の追随 (SH-005)。

## Confirmation

- SDK 型は `@anthropic-ai/claude-agent-sdk` 0.3.270 の `sdk.d.ts` で確認
  (`spawnClaudeCodeProcess`:2288 / `SpawnOptions`:8772・env は 2780 で必須 / `SpawnedProcess`:8720 /
  `setPermissionMode`:2632 / `PermissionMode`:2327 (6 値) / `PermissionResult.updatedPermissions`:2349-2361 /
  `PermissionUpdate` の `type:'setMode'`:2368-2386 / `allowedTools`:1459 / `disallowedTools`:1479 /
  `permissionPromptToolName`:1861 / `allowDangerouslySkipPermissions`:1856 /
  `setMcpPermissionModeOverride`:2649 (`'default'|'auto'|null` の 3 値 tighten-only))。
  **旧稿が禁止対象に挙げた `setMcpServerPermissionMode` は SDK に実在せず (綴り誤り)、実在名
  `setMcpPermissionModeOverride` に訂正した (Round 2 platform-boundary H-02)。**
- design-gate で全トラック Critical 0 (PASS) を確認済み (R4。`.gate-verdict-design.json`)。
- 実装時に check:constitution 項目 3/7/14/15 が緑であること、SC-006 の env / 権限モード不到達テスト、
  port transfer の本文非経由の構造検査が通ることを確認する。

## References

- [AD-018](0018-wsl-process-control.md) §3・§4・Consequences (WSL kill / spawnClaudeCodeProcess / handle 保持)
- [AD-023](0023-application-architecture.md) §3・§6・§7 (interface は domain / per-session / 依存規則)
- [AD-034](0034-transcript-read-path-and-process-boundary.md) §1 (port transfer / main 検証の迂回防止)
- [AD-030](0030-enumeration-runs-in-one-resident-process.md) (起動費 / 孤児回収の先例)
- [AD-020](0020-sdk-emitted-message-inventory.md) §3 (PermissionMode 6 値 / dontAsk 安全)
- [AD-011](0011-delegate-credential-resolution.md) (資格情報委譲) / [AD-025](0025-workspace-folder-carries-location.md) §1/§2 (所在一致)
- `@anthropic-ai/claude-agent-sdk` 0.3.270 `sdk.d.ts`
