# Research: 単一セッション起動とストリーミング (X-1)

前提の SPIKE (SPIKE-5 / SPIKE-3) は完了済みで ADR 化されている。本 feature 固有の調査は
**設計判断の確定**に絞る。新規 SPIKE は無い。

## R-01 表示レンダラ: `MarkdownText` 継続 / Streamdown を live で評価 (B-1)

- **申し送り**: roadmap L172 / R-3 research R-04 / R-3 plan.md:255 が「Streamdown の採否は X-1」とした。
- **判断**: 既定は R-3 が配線済みの `@assistant-ui/react-markdown` の `MarkdownText` (`smooth`) を継続。
  Streamdown (未完 markdown の構文修復 / `@streamdown/cjk` の分割耐性) は **live streaming で真価が出る**ため
  本 feature で評価する。**採用の必須条件 (H-08)**: (a) 実 live ストリームで未完 markdown の崩れ / CJK 分割が
  実測で確認でき、(b1) **URL allowlist を `safe-url.ts` と同等の deny-by-default で配線**し、
  (b2) **raw HTML を無効**にすること。**満たせなければ採用しない** (data 側走査だけでは render 側回帰を
  検出できないため、SC-008 に render 経路の component テストを置く。roadmap M2 申し送り)。
- **既定を継続にする理由**: investigation ≠ implementation。便益が実測で出る前に差し替えない
  (R-3 が同じ判断をした)。採否は plan Phase 0 の結論として tasks に反映する。

## R-02 描画 primitive: `Unstable_MessageById` の再評価 (B-2)

- **申し送り**: R-3 research.md:15「R-3 は静的列なので `MessageByIndex` で足りる。
  X-1 (末尾が伸びる) では `Unstable_MessageById` を再評価」。
- **判断**: live streaming は**末尾メッセージが逐次伸びる**ため、index ベースだと末尾更新のたびに
  再マウントが起きうる。`Unstable_MessageById` (安定 id で参照) を末尾ストリーミング行に使う方針。
  仮想化 (`@tanstack/react-virtual`。AD-033) との併用を実装で確認する。

## R-03 SDK の起動 / canUseTool / interrupt / spawn / 権限モードの実型 (SDK 0.3.270 で確認済み)

**design-gate Round 1 の Critical (C-001/C-003) を受け、`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
(0.3.270) を実際に読んで確定した (推測しない)。**

- `query({ prompt: AsyncIterable<SDKUserMessage>, options })` — V1 形式 (AD-002 / AD-018 §2)。
- `options.canUseTool` — permission コールバック。戻りで allow/deny を返す。`options.permissionMode` は
  `'default'` 固定 (AD-020。6 値のうち安全なもの)。
- `interrupt()` — query 戻り値 (`Query`) のメソッド。stdin 越し control_request (AD-018 §1)。
- **`spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess`** (sdk.d.ts:2288) — **値でなく
  コールバック**。doc の例 (2278-2285) は「default local spawn の代わりに呼ばれ、実装者が spawn して返す」
  (VM/container/**remote** 用)。`SpawnOptions` は `{command, args, cwd, env, signal}` (8772)、
  `SpawnedProcess` は `ChildProcess` が充足 (8720)。→ **WSL 起動の spawn は query 呼び出し元=agents で走る**
  (C-001 の根拠。AD-036 §3 で agents を spawn 主体と確定)。
- **`Query.setPermissionMode(mode: PermissionMode)`** (2632) は 6 値 (`default|acceptEdits|bypassPermissions|
  plan|dontAsk|auto`。2327) を受け、doc「Only available in streaming input mode」= 本 feature で常時有効。
  → **実行時に `default` 型ロックを回避できる** (C-003 の根拠。AD-036 §4/§5 で禁止 API に指定)。
  **実在名は `setMcpPermissionModeOverride` (sdk.d.ts:2649。`'default'|'auto'|null` の 3 値、doc「tighten-only …
  can never widen privilege」= 昇格不能)。旧稿の `setMcpServerPermissionMode` は SDK 非実在の綴り誤りで訂正した
  (Round 2 platform-boundary H-02)**。防御的に呼ばない。
- **`canUseTool` 応答の実型は `PermissionResult` (sdk.d.ts:2349-2361)。`updatedPermissions?: PermissionUpdate[]`
  を持ち、`PermissionUpdate` (2368-2386) に `{type:'setMode', mode, destination}` (6 値でモード直接昇格) と
  `{type:'addRules', behavior, ...}` がある。** → 実行時権限昇格面は `setPermissionMode` だけでなく
  `updatedPermissions.setMode` にも存在する (Round 2 C-101)。起動 options `allowedTools` (1459) /
  `disallowedTools` (1479) / `permissionPromptToolName` (1861) も承認カード迂回レバー。すべて封鎖対象 (contracts C-4)。
- `allowDangerouslySkipPermissions?: boolean` (1856) — `bypassPermissions` の前提。設定しない。
- `pathToClaudeCodeExecutable?: string` (1835) — 単独では `wsl.exe` 前置を注入できない (SDK が既定 spawn で
  `executable` を前置するため)。WSL 起動には `spawnClaudeCodeProcess` が要る。

## R-04 live stream を MessageChannelMain の port transfer で運ぶ (per-session)

- **申し送り**: AD-034 は **per-request 短命**プロセスで transcript を運んだ。live stream は
  **per-session** (セッション寿命) であり、同じ port transfer の形を寿命だけ変えて適用する。
- **判断**: main が `MessageChannelMain` を作り port を agents / renderer に transfer する形 (AD-034 §1) を
  そのまま採る。差分は「1 セッション = 1 プロセスが**生き続けて**逐次 post する」点。
  inbound 封じ込め (port から制御を受けない) は AD-034 と同じく実装 + テストで守る。
- **枠付けの訂正 (design-gate L-001)**: per-session は AD-023 §6 が最初に定義した寿命であり、
  AD-034 §2 が per-request を「第 3 の形態」と数えている。**新しいのは寿命でなく「per-session 長寿命 +
  AD-034 の port transfer + control-plane inbound + `canUseTool` 往復」の組み合わせ**。「第 4 の形態」とは呼ばない。
- **[AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) で確定** (proposed。
  design-gate Round 2 で accepted へ)。

## R-05 Win32 起動は本 feature で発火しない (B-4)

- **申し送り**: AD-025「### X-1 へ」/ R-1 M-002 が「所在 WSL × `Win32Runtime` の未検証仮定」を X-1 に送った。
- **判断**: 本 feature は **WSL ディストロ内起動に限る** (spec Out of Scope)。Win32 直接起動と
  その `autoModeSafe` ゲートは軸選択が生じる **X-4**。したがって M-002 は本 feature では**発火しない**。
  申し送りは X-4 へ繰り越す (research にこの判断を残すことで持ち主不在にしない)。

## R-06 強制終了時の JSONL 破損 (B-3 / AD-018 Open Q)

- **未検証**。`wsl.exe` kill 時に書きかけの JSONL transcript が壊れるかは AD-018 の Open Question のまま。
- **判断**: FR-016 の警告文に「途中出力の保全と JSONL 非破損を保証しない」を含める。
  実機での挙動 (壊れるか) は quickstart V-5 で観察し記録する (合否条件にはしない)。
