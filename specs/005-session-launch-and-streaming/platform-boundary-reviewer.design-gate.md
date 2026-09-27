# Track E — platform-boundary-reviewer

**Run**: 2026-09-25 · **Gate**: design · **Verdict**: Critical 2 / High 3 / Medium 4 / Low 1

SDK 型は実体 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (0.3.270) を一次情報として照合。

## viewpoint coverage
- A/B: 該当なし (security owner)
- C 業務不変条件/Charter drift: 該当なし (WSL argv=infra/runtime、sandbox/autoModeSafe は X-4/I-* へ正しく繰り越し)
- D Constitution/ADR drift: Critical 2 / High 2 / Medium 3 / Low 1
- F 命名/module/lint hookup: High 1 / Medium 1
- H テスト/observability: High 1 / Medium 2

## Findings

### [Critical] C-001 — WSL-free / spawn-free な agents 起動は SDK の実 API では成立が示されていない (scope: feature)
- **Where**: data-model.md:131 / contracts C-7 (70-72) / plan A-4 (74)「agents は RuntimeLaunchSpec を SDK に渡すのみで wsl.exe も spawn API も持たない」 vs sdk.d.ts:2288 `spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess`
- **Issue**: `spawnClaudeCodeProcess` は**値でなくコールバック**。doc (2270-2285)「this function is called instead of the default local spawn … return myVMProcess」= 実装者自身が spawn して返す契約で、用途に VMs/containers/**remote environments** (WSL) を明示。`query()` は `AGENT_SDK_IMPORT_DIRECTORIES=['src/agents/']` に限られ agents で走る → コールバックも agents 内評価。関数はプロセス境界を越えられず `agents-not-to-infra` で infra から供給不可 → WSL 起動を spawnClaudeCodeProcess で行う限り agents が `child_process.spawn(wsl.exe…)` を持つ → check.mjs 項目 7 (agents は PROCESS_SPAWN_MODULES 外) 違反、引数リテラルなら項目 3/15 (WSL_FREE_DIRECTORIES に src/agents/) 違反。FR-004/Principle VII/SH-上流4 が崩れる。`pathToClaudeCodeExecutable` (文字列) だけでは `wsl.exe -d <distro> -- claude` の前置を注入する保証なし。plan 自身が「最大の設計リスク」と認めた配線 (plan.md:181-183) が未解決
- **Action**: 「値を渡す」でなく WSL 起動 spawn がどのプロセスで起きるかを design で確定 (最小案含む):
  1. agents 内 spawnClaudeCodeProcess で spawn する前提を受け入れ、`src/agents/sdk-agent-session.ts` を PROCESS_SPAWN_MODULES に追加、RuntimeLaunchSpec argv をデータで受けても wsl.exe リテラルは agents に置かない (項目 3/15 fixture で保証)。FR-004 を「リテラルを持たない (値で受ける)」に厳密化し spawn は Principle VII 対象外 (child_process は electron/native でない) を ADR SH-001 に明記
  2. spawn を app (session-spawner) に置き、SDK に起動済み stdio を渡せるか SPIKE で実証してから採る (実証前は investigation≠implementation)
  いずれも SH-001 で「wsl.exe を spawn する実プロセスと handle 所有者」を図で固定。research R-03 の「実装で再確認」に丸投げしない
- 根拠: Principle VII/VI / AD-018 Context・§4・Consequences / sdk.d.ts:2288

### [Critical] C-002 — `Query.setPermissionMode` が型ロック済み `default` を実行時に回避でき SC-006(a)/FR-013/Principle III を破る (scope: feature)
- **Where**: data-model.md:32-38 (`permissionMode:'default'` 型固定「auto/bypass を型で塞ぐ」) / SC-006(a) (311-312「auto/bypassPermissions を渡す経路が存在しない」) vs sdk.d.ts:2632 `setPermissionMode(mode: PermissionMode)` は Query メソッドで 6 値 (2327) 全受理。doc「Only available in streaming input mode」= X-1 は AsyncIterable/stdin 開放 (FR-011) でまさに該当。agents は interrupt() のため Query ハンドルを保持
- **Issue**: 型で塞いだのは**起動時初期オプション 1 点のみ**。起動後 `setPermissionMode('auto')` (分類器自動承認) / `('acceptEdits')` を呼べば隔離境界の無い WSL で無人自動実行が成立。`bypassPermissions` は allowDangerouslySkipPermissions を要すが `auto`/`acceptEdits` は不要。check.mjs 項目 14 は named import の呼び出し形のみで `handle.setPermissionMode(` の**レシーバ付きメソッド呼び出し**を正規表現 (682) が構造的に検出不能。SC-006(a) の「0 件経路」が SDK 契約と矛盾
- **Action**: (1) contracts C-4「呼んではならない API」に `setPermissionMode` (と Query 面の危険メソッド) を明記。(2) A-5/SH-010 の binding denylist を Query 戻り値メソッド面へ拡張、または `sdk-agent-session.ts` を「setPermissionMode を呼ばない」fixture+専用検査で守る (項目 14 が method を見られないためこれが唯一の歯止め)。(3) SC-006(a) を「初期オプション+実行時 setPermissionMode 双方で auto/bypass/acceptEdits/dontAsk への遷移経路 0 件」に強化し不到達テストを追加
- 根拠: Principle III / AD-020 §3 / sdk.d.ts:2327/2632

### [High] H-001 — 起動ゲートに「フォルダ所在ディストロ ↔ 選択ランタイムのディストロ」一致検査が無い (scope: feature)
- **Where**: contracts C-1:11 (launch 検証は VerifiedRunning/登録済みのみ、folder.Location.distro と runtime distro の一致を要求せず) / BE-030。AD-025 §1 `isNamespaceConsistent` / §2 `isSameDistro`。specs/005 に参照 0 件
- **Issue**: Ubuntu 登録フォルダを Debian ランタイムに起動でき、cwd が別 FS 名前空間で解決 → 別 distro で走る/transcript が別 distro に書かれる。branded type は IPC (string ID) で名前空間を失う (PB-1、tsc で防げない)
- **Action**: launch ゲート (BE-030/C-1) に `isNamespaceConsistent` + `isSameDistro` 完全一致を必須検査に。SC-002 に「所在不一致 launch が 0 件で拒否」を追加

### [High] H-002 — kill ハンドルの所有者が app と agents で食い違い wsl.exe 孤児のリスクが残る (scope: feature) [security H-002 と dedup]
- **Where**: plan.md:135 / data-model.md:24 / C-6「app が保持する spawn ハンドル」 vs AD-018 Consequences「supervisor(=agents) が wsl.exe ハンドルを保持し kill」
- **Issue**: SDK が wsl.exe を spawn するのは query() を呼ぶ agents 内 → app が持てるのは agents utilityProcess のハンドルで wsl.exe のそれでない。wsl.exe は agents の**孫**。Windows は親 kill が子孫を自動回収しない (Job Object 記載無し) → app が agents を kill しても wsl.exe 孤児化。FR-017/SC-005/SC-010 の「孤児 0」達成不能
- **Action**: 「wsl.exe を spawn する実プロセス」と「handle を kill する主体」を SH-001 で一致 (AD-018 なら agents 保持、main からの kill 制御に応じる)。app-only kill なら Job Object/detached group で孫まで確実に。SC-005/010 を孫プロセス到達まで含む形に

### [High] H-003 — 項目14/A-5 の binding denylist が Query オブジェクトのメソッド面を対象にしていない (scope: feature) [C-002 と対]
- **Where**: A-5 (plan.md:75/SH-010) は「SDK 書き込み系 API の alias/dynamic import」を塞ぐが、X-1 は初めて Query 戻り値を保持し `setPermissionMode`/`supportedCommands`(2757)/`mcpServerStatus`(2775) が生える。項目 14 (check.mjs:618-695) は named import の呼び出し形のみで戻り値メソッドを見ない。書き込み系はスタンドアロン関数なので named import 検査で拾えるが `setPermissionMode` は Query メソッドで拾えない
- **Action**: SH-010 のスコープに「Query 戻り値の危険メソッド (最低 setPermissionMode)」を明記、alias fixture 1 件または binding denylist を Query 面へ拡張。捕まらない残余は UNDETECTED_NOTES に nextFeature つき記録

### [Medium] M-001 — 起動 argv builder の WSL_CALLER_MODULES (項目3) / 項目2 引数許可の扱いが tasks に無い (scope: feature) [architecture M-001 と dedup]
- BE-002「infra/runtime が wsl.exe argv 構築」 vs WSL_CALLER_MODULES=['wsl-cli.ts'] 単一固定。SH-007 は PROCESS_SPAWN_MODULES/WSL_FREE_DIRECTORIES のみ。新規ファイルに書くと項目 3 違反、wsl-cli.ts 相乗りは起動と検出が混在。起動引数 `-d`/`--`/`--cd`/`-u`/`--exec` は WSL_ALLOWED_ARGS に既存 (項目 2 追加不要)
- **Action**: argv builder のファイルを確定し新設なら WSL_CALLER_MODULES に ADR 付き実名追加、wsl-cli.ts 再利用なら rationale 明記。tasks に該当タスク追加

### [Medium] M-002 — spawn ハンドル / port レジストリが単数記述で単一インスタンス前提を焼き込む恐れ (scope: feature)
- data-model.md:24 / C-6 が spawn ハンドルを単数記述。IPC は sessionId 鍵で設計済みなのに保持構造が単数だと X-5 (10 並列) で制御プレーン作り直し (PB-2)
- **Action**: spawn ハンドルと port を sessionId 鍵の registry(Map) で表現。「単一セッションに限る」は状態機械の対象数制約であり保持構造まで単数にしない旨明記

### [Medium] M-003 — 起動 cwd の HostPath→RuntimePath 変換の帰属が未指定 (scope: feature)
- data-model §3/C-3 は DTO/port に UNC/生パスを載せないとするが、spawn の cwd (`wsl.exe --cd <path>`) に渡す RuntimePath をどこで branded 変換するか記述無し。registry 永続化で branded が string に潰れる (PB-1)
- **Action**: 「cwd は選択ランタイム distro 名前空間の RuntimePath を domain のパス API 経由で生成し HostPath/UNC を spawn argv・SessionEvent に出さない」を C-3 に明記。SC-008 の DTO 走査に spawn argv の cwd も含める

### [Medium] M-004 — `capability` スコープの承認が SDK の allow ルール付与に広がる余地 (scope: feature)
- data-model §5 `scope:'capability'`。SDK `PermissionResult` (2349-2361) は `updatedPermissions?: PermissionUpdate[]`、`PermissionUpdate` (2368-) は `addRules/behavior:'allow'/destination`。ruleContent 無しの広いルール (tool の allow-all) を 1 クリック付与でき実質部分 bypass。capability の粒度上限を design が定めていない
- **Action**: `scope:'capability'`→PermissionUpdate の写像に上限 (当該 tool_use_id/具体 ruleContent に限る、destination を session に限る) を明記。SC-004 に「capability が allow-all に広がらない」assert

### [Low] L-001 — `CLAUDE_CONFIG_DIR` の起動経路での扱いが「実装で確認」に留まる (scope: feature) [architecture L-002 と dedup]
- data-model §7 (115) は綴りの名前空間を保留。host 名前空間値を入れると WSL 内 claude が transcript を誤解決 (PB-1 の env 越境)
- **Action**: C-5 で CLAUDE_CONFIG_DIR を含めるか、含めるなら値が distro RuntimePath であることを明記。SC-006(b) に値の名前空間チェック

## H観点メモ (owner 範囲)
- SC-006(a) は初期オプションのみ検証し実行時 setPermissionMode 不到達を検証しない。項目 14 も method を見られない → 不到達テスト+fixture を SH-020/SH-010 に追加要 (C-002 と対)
- SC-005/010 の kill レイヤ fake は wsl.exe が agents の孫として残るケース (親 kill 非伝播) を踏めない → quickstart SH-022 で孫プロセス到達まで観察明記 (H-002 と対)
- agents が spawn しない/wsl.exe リテラルを持たないことを**肯定的に**示す fixture が test:rules に無い (C-001/H-003 と対)。FailureReason (data-model §6) の網羅は良好

## Verdict
Critical 2 / High 3 / Medium 4 / Low 1。最重要トラックで Critical 2 件。C-001 (spawnClaudeCodeProcess はコールバックで WSL 起動 spawn は agents で走る。「値を渡すのみ」は SDK 契約と AD-018 実証機構に反し、plan 自身が最大リスクと認めた配線が未解決) と C-002 (Query.setPermissionMode で型ロック回避、項目 14 検出不能、SC-006(a) が SDK 契約と矛盾し Principle III を破る)。いずれも SH-001(ADR) と contracts/data-model/tasks の修正で design-gate 内に閉じられる。
