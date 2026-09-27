# Tasks: 単一セッション起動とストリーミング (X-1)

**Spec**: [spec.md](spec.md) · [plan.md](plan.md) · [data-model.md](data-model.md) ·
[contracts/session-launch.md](contracts/session-launch.md)

**Status**: frontmatter (`spec.md`) の `status:` を正とする

## 規約

- タスク ID: `SH-` (Shared) / `BE-` (Backend: agents / infra / app) / `FE-` (Frontend: renderer)。
- `[P]` = 同 phase 内で他タスクとファイル競合せず並列実行可能。
- 各タスクに対応する FR / SC / 上流申し送り (A-*/B-*) を付す。
- User Story 単位で独立検証可能に並べる (Principle XI)。US-1 だけ実装しても「**安全ゲート込みで** folder+runtime を
  選び起動して応答が流れる」MVP になる (launch 検証ハンドラ BE-007 は US-1 に含む。安全不変条件 FR-003/SC-002 を
  US-1 で閉じる。po C-001)。

---

## Phase 0: Foundation (Shared・多くが blocking)

- **SH-001** [Shared] **新規 ADR を起票** — (1) per-session 実行単位の形態、(2) live stream を
  `MessageChannelMain` の port transfer で運ぶ (常駐 AD-030 / 短命 AD-034 に続く per-session)、
  (3) `canUseTool` 往復の main 検証済み経路、(4) `AGENT_SDK_ALLOWED_CALLS` への `query` 追加と
  `PROCESS_SPAWN_MODULES` への spawner 追加の根拠、(5) 起動 argv を `infra/runtime` が値で供給し
  `agents` を WSL-free に保つ配線。**status: proposed**。design-gate 通過を accepted の条件にする。
  (A-2/A-3/A-4 の allowlist 追加はこの ADR に紐づく。Principle VI) **[blocking]**
- **SH-002** ✅ [Shared][P] `domain/session/` に型定義 — `AgentSession` interface / `LaunchInput` /
  `SessionEvent` / `SessionRunState` (7 状態) / `PermissionRequest` / `PermissionDecision` /
  **`PermissionDeniedInfo` / `SanitizedText` / `SanitizedToolInput`** / `FailureReason` (9 種) /
  `RuntimeLaunchSpec` (data-model §1-8)。I/O を持たない (N4)
- **SH-003** ✅ [Shared][P] `SessionRunState` の遷移純粋関数 **`nextState(state, action)`** (param 名は `action`。
  action は control action + agents 由来イベントの判別 union で `SessionEvent` とは別型。N-A/N7) + 単体テスト
  (data-model §4)
- **SH-004** ✅ [Shared][P] glossary に `AgentSession` / `SessionRunState` / `PermissionRequest` /
  `PermissionDecision` / `SessionEvent` / `RuntimeLaunchSpec` / **`LaunchInput` / `SessionControl` /
  `FailureReason`** を追記 (C-006)。**「実行単位」は canonical `supervisor` へ置換する** (概念差が示せないため
  同義異語を増やさない。glossary Detected synonyms に従う。architecture C-003)。spec/plan/data-model/contracts の
  「実行単位」表記も `supervisor` / per-session の `utilityProcess` に統一 (Principle XIV。code 投入前)
- **SH-005** ✅ [Shared][P] charter 追随 — L149 の「X-1 … は未着手」から X-1 を外し、Related Specs に本 spec を追加。
  **`docs/discovery.md` の directory map に本 feature が `src/agents/`・`src/main/app/` に足すモジュールを反映**
  (convention-reviewer の drift 対策。analyze C2/B-6)。**`docs/roadmap.md` に「X-1 が新設する承認カード
  (permission-request) / 聞かれずに拒否 (SDKPermissionDeniedMessage) の 2 経路を O-2 の ui-coverage 対象に
  繰り越す」申し送りを残す** (持ち主不在にしない。architecture C-004 / AD-031)

---

## US-1 — WSL ディストロ内で起動し応答をストリーミングで読む (P1)

**独立検証**: SDK 境界 (`query()`) を fake にした agents/renderer 単体 + 実機で逐次描画を確認。

- **BE-001** ✅ [BE] `agents/sdk-agent-session.ts` — `query({ prompt: AsyncIterable, options })` V1 で起動し、
  **stdin を開いたまま保つ**。yield を逐次 `SessionEvent` に変換 (FR-001/008/011, SC-001)
- **BE-002** ✅ [BE][P] `infra/runtime/` — `RuntimeLaunchSpec` 構築 (`wsl.exe` argv + `claude` 実行パスを
  起動時 1 回解決)。**`wsl.exe` の文字列はここに閉じる** (FR-005, SH-上流4/C-7)。**claude パスは PROBE_SCRIPT
  拡張で検出時解決** (`command -v claude` → `descriptor.claudePath`。AD-036 に記録。DTO 非漏出)
- **BE-003** ✅ [BE] `main/app/session-spawner.ts` — per-session `utilityProcess` を spawn し、
  `new MessageChannelMain()` の port1 を agents / port2 を renderer へ transfer (FR-002/007, SC-003)
- **BE-004** ✅ [BE][P] **共有純粋関数 `buildLaunchEnv`** — 実名許可リスト (PATH 除外) + WSLENV/資格情報 denylist を
  適用して env を組み立てる。**utilityProcess.fork の env (app レイヤ) と agents の child_process.spawn の env の
  両 spawn 点が同じ共有純関数を呼ぶ** (fork env は Electron 概念で infra 非依存のため builder は 2 点だが denylist は
  共有。M-101/M-202)。親環境非継承・資格情報/ログ混入なし (FR-006, SC-006(b)(c))
- **BE-005** ✅ [BE] agents の yield→DTO 変換で **R-3 の message mapping + 正規化 (制御文字/双方向除去・
  長さ上限) + XSS 境界 (URL allowlist・生 HTML 非描画)** を通す (FR-009, SC-008)
- **FE-001** ✅ [FE] `renderer/` — port2 の `SessionEvent` を `useExternalStoreRuntime` の messages に
  流し込む配線。R-3/R-4 の transcript 表示を再利用 (FR-008/009, SC-001)。**`Unstable_MessageById` を
  末尾ストリーミング行に使う** (research R-02)。**`launching` 状態 (~2.7s の起動窓) を起動中として表示し
  画面を空白/無反応にしない** (FR-019 の UI 反映。po E-102)。起動窓のキャンセルは window close 経由のみ (Edge Case)
- **FE-002** ✅ [FE] `renderer/` — 最小 composer (プロンプト入力 + 送信)。R-3 の `isDisabled: true` を外す
  (FR-018 の送信経路開放。IME ガードは FE-040。空/空白送信不能 + 長さ上限)
- **FE-003** ✅ [FE] `renderer/` — **起動 entry point**: R-1 の組み合わせ選択 UI (作業フォルダ + 実行中 WslRuntime) を
  再利用し `session.launch({folderId, runtimeId})` を発火する導線。未選択・停止中・所在不一致は launch 前に
  ガード表示 (C-002 解決。US-1 の入口。SC-001)
- **BE-006** ✅ [BE] `main/app/` — `session.sendPrompt` IPC ハンドラ (送信元 + sessionId 検証、空/空白拒否 +
  長さ上限 + 正規化、agents へ postMessage → AsyncIterable push)。running/awaiting_permission 中は in-memory queue
  (analyze C1 / M-004 / C-004)
- **BE-007** ✅ [BE] `main/app/` — **`session.launch` の main 側検証ハンドラ本体** (US-1 の安全ゲート。po C-001)。
  folderId/runtimeId を解決し **VerifiedRunning + 所在 distro 一致 (`isNamespaceConsistent`/`isSameDistro`) +
  registration + 単一セッション不変 (launching/非終端が在れば拒否)** を明示述語で検証し、通過時のみ spawner (BE-003) を
  起動オーケストレーションする。**FR-003 / SC-002 を紐付け** (安全不変条件を US-1 に含める。無検証で初回 launch させない)
- **SH-006** ✅ [Shared] `AGENT_SDK_ALLOWED_CALLS` に `query` を追加 + 違反/許可 fixture 更新
  (A-2。ADR SH-001=AD-036 に紐づけ)。**`.interrupt()` が呼び出し形検査 (項目14/AGENT_SDK_ALLOWED_CALLS) に
  掛かるか実装前に確定**し、掛かるなら許可側に明記する (N6)
- **SH-007** ✅ [Shared] `PROCESS_SPAWN_MODULES` に **`src/agents/sdk-agent-session.ts`** (spawn 主体) と
  `session-spawner.ts` を追加、`WSL_FREE_DIRECTORIES` に app 新モジュールを実名追加、**argv builder が新規なら
  `WSL_CALLER_MODULES` に実名追加** (A-3/A-4/A-6。ADR AD-036 に紐づけ)

---

## US-2 — permission 要求に承認カードで応える (P1)

**独立検証**: `canUseTool` を fake で発火 → 承認カード → 決定が main 検証経路を通り Promise 解決。

- **BE-010** ✅ [BE] `agents/sdk-agent-session.ts` — `options.canUseTool` コールバックで `permission-request`
  SessionEvent を発行し Promise を `requestId` で保留。**`PermissionDecision → PermissionResult` 写像は純関数
  `toPermissionResult` に切り出し、出力キー集合を `{behavior, message}` に固定する** (`updatedPermissions` 全 variant・
  `updatedInput` を出さない。正の構成。denylist 表現にしない。C-101/C-201/M-401)。**canUseTool の全 return は
  `toPermissionResult(...)` のみを通す** (インライン構築禁止。H-401)。BE-012 と同一ファイル (N5)
- **BE-011** ✅ [BE] `main/app/` — `session.respondPermission` IPC ハンドラ。送信元 + sessionId + requestId を
  検証 (awaiting 中の要求と一致) し agents へ `postMessage`。**`outcome`/`scope` を明示述語で enum 検証
  (`as` 禁止)、`once` 要求に `capability` 決定を受理しない**。**データ経路 (port) から grant/deny を受けない**
  (FR-010/012, SC-004/007, H-04)
- **BE-012** ✅ [BE] `agents/sdk-agent-session.ts` — `SDKPermissionDeniedMessage` → `permission-denied` SessionEvent
  (FR-014)。**BE-010 と同一ファイルのため [P] を外す** (analyze P1)
- **BE-013** ✅ [BE][P] `main/app/` + `agents/` — 権限ゲートの**正の構成** (contracts C-4 P1-P3): `query()` options を
  allowlist キーのみで構成する builder、`toPermissionResult` を `{behavior, message}` のみ返す純関数
  (`updatedPermissions`/`updatedInput` を出さない)、`Query` は `interrupt()` のみ呼ぶ。`permissionMode:'default'` は
  リテラル固定型。capability 付与はアプリ内 in-memory 状態で実現 (C-101/C-201/M-101, FR-013, SC-006(a))
- **FE-010** ✅ [FE] `renderer/` — 承認カード UI。assistant-ui の Approval 系 element を照合 (無ければ
  候補名 + 不適合理由を PR に記載。Principle XIII)。単発/capability を区別し、**`toolName` と tool 入力を
  サニタイズして plain text 表示** (MCP 由来の表示偽装を防ぐ。H-05/H-06。FR-012)
- **FE-011** ✅ [FE][P] `renderer/` — 「聞かれずに拒否された」操作の表示 (FR-014)

---

## US-3 — 実行中に中断し、途中出力を保つ (P1)

**独立検証**: `interrupt()` とプロセス kill レイヤを差し替え、途中出力保持と孤児 0 を確認。

- **BE-020** ✅ [BE] `agents/` — `interrupt()` (query 戻り値のメソッド) を配線し、`interrupt-receipt`
  (`still_queued`/`cancelled`) を SessionEvent に載せる。`interrupt_receipt_v1` を init で確認 (FR-015)
- **BE-021** ✅ [BE] `main/app/` + `agents/` — `session.interrupt` / `session.kill` IPC ハンドラ。**kill は
  renderer→main→agents の制御 IPC で発行し、agents が保持する `SpawnedProcess` (wsl.exe) を直接 kill する**
  (app が OS kill するのは utilityProcess ハンドルのみで、それだけでは Windows 親 kill 非伝播により孫 wsl.exe が
  孤児化する。contracts C-6 / AD-036 §3・§6 / AD-018。H-402)。中断 (interrupt) とは別経路 (FR-015/016)
- **BE-022** ✅ [BE] `main/app/` — window close / before-quit で確実に kill し、孤児プロセス・孤児 UNC ハンドルを
  残さない (FR-017, SC-005/010)。**dispose() に `launchService.dispose()` を合流** (既存 before-quit 経路)
- **FE-020** ✅ [FE] `renderer/` — 「中断」「強制終了」の 2 操作 UI。強制終了に**警告** (途中出力の保全と
  JSONL 非破損を保証しない) (FR-016)
- **FE-021** ✅ [FE][P] `renderer/` — 中断後の途中出力を保持し、同一セッションで継続送信できる (FR-015)

---

## US-4 — 起動できない / 実行中の失敗を理由つきに知る (P2)

**独立検証**: プロセス起動 / ファイルアクセスレイヤを差し替え、各失敗条件で理由つき error を確認。

- **BE-030** ✅ [BE] `main/app/` — **失敗理由キーの網羅・区別・表示**。安全ゲートの検証自体は US-1 の BE-007 が持つ
  (po C-001)。BE-030 は BE-007 の拒否結果と実行時失敗を `FailureReason` **9 種** (`distro-not-running` /
  `not-verified-running` / `distro-mismatch` / `claude-not-found` / `launch-failed` / `process-crashed` /
  `stream-protocol-error` / `provider-error` / `interrupt-unavailable`) に分類し理由と次操作を返す。
  **`interrupt-unavailable` の emit owner は BE-020** (interrupt_receipt_v1 不在で強制終了へ落ちた検知)、BE-030 は
  受けて分類・表示 (N-C。列挙 9 種を data-model §6 と一致させる) (FR-020, SC-002/010)
- **BE-031** ✅ [BE] `agents`/`app` — crash / stream・protocol 異常、および **起動後の Provider/認証/API エラーを
  `provider-error` に分類** (SDK は error message で返す。黙って done にしない。H-03)。`failure` SessionEvent にし
  **例外を main/renderer に伝播させない**。失敗検知レイヤを会話ペイロード除外の構造化ログに残す (FR-020, SC-010, M-05)
- **FE-030** ✅ [FE] `renderer/` — 失敗の理由表示 + 次の操作導線 (`provider-error` は再ログイン導線)。
  空状態 (未起動 / 応答なし / 失敗のみ) を空白にしない (FR-020, SC-010)

---

## 横断 (Principle VIII / defense-in-depth)

- **FE-040** [FE] composer の `isComposing` ガード + component テスト (FR-018, SC-009。変換確定 Enter が
  送信にならないことに限定)。**全角混在のレイアウト視覚検証と full な IME E2E / スクリーンショット比較は
  X-2 / E2E 基盤に残す** (SC-009 の合否対象外。C-003。SC-009 の claim に視覚検証を含めない)
  - **amend (pr-gate R2 / po E-201)**: X-1 の composer は assistant-ui `ComposerPrimitive.Input` を再利用し
    IME (composition 中 Enter 非送信) を**ライブラリに委譲**する (自前 composer を作らない。Principle XIII)。
    X-1 が担保するのは onNew の空/空白/バイト長ガード (session-ipc.test で計測)。**isComposing の component テストは
    X-2 (IME/E2E 基盤) へ移す** — 自前ガードを持たないため単体テストはライブラリ内部の検証になり、spec の
    「視覚検証は X-2」方針と整合する。SC-009 の X-1 合否は「送信経路を開き空/空白/長さを弾く」までとする
- **SH-010** ✅ [Shared] **正の構成 (allowlist) の静的検査 + fixture** (contracts C-4 P1-P3。denylist で個別 API を
  追わない): (a) `sdk-agent-session.ts` が組む `query()` options のキー集合 ⊆ P1 allowlist
  (`permissionMode/canUseTool/spawnClaudeCodeProcess/pathToClaudeCodeExecutable`)、(b) `toPermissionResult` の出力
  キー集合 ⊆ {behavior, message} (`updatedPermissions`/`updatedInput` を出さない)、(c) Query メソッド呼び出しが
  `interrupt` のみ (他 mutation なし)、(d) **検査は「純関数の出力」でなく「実際に `query()` に渡る値・`canUseTool` の
  全 return 経路」に固定する** (H-401): `query()` の実引数は builder の識別子出力のみ (spread/merge/別変数への追加
  キーを禁止)、`canUseTool` の返り値は `toPermissionResult(...)` 呼び出し 1 本のみ (インライン `PermissionResult`
  リテラル構築を禁止) を静的強制、または canUseTool を薄いラッパで包み返り値を必ず allowlist フィルタに通す型設計。
  項目14 は `.method()` / options リテラルを見ないため、この allowlist 検査 + 違反 fixture が唯一の機械的歯止め。
  SDK 書き込み系 API の alias/dynamic import 素通し (A-5) も fixture で塞ぎ、捕まらない残余は `UNDETECTED_NOTES` に
  `nextFeature` つき記録 (AD-034 §3 / AD-027)
- **SH-011** ✅ [Shared][P] `UNDETECTED_NOTES['ui-path-concat']` を確認。本 feature で該当経路が生じれば塞ぎ、
  生じなければ `nextFeature` 繰り越しの理由を記録 (B-7)

---

## Phase 3: 検証 (Shared)

- **SH-020** ✅ [Shared] SC-001〜SC-010 の Vitest を書く — SDK/プロセス起動/ファイルアクセス/`interrupt()`/
  `canUseTool` を差し替えた単体、env・起動オプション・状態遷移 (`nextState`。**FR-019 の 7 状態**)・
  `isNamespaceConsistent` の純粋関数、DTO 全文字列走査 (`toolName` 含む)、port transfer の構造検査、
  IPC ハンドラ直接呼び (不正 outcome/scope 格上げ、他 token の port 拒否の負例)。**追加**:
  (a) **正の構成 (allowlist) の assert** — (P1) 構成した `query()` options のキー集合 ⊆ allowlist、
  (P2) `toPermissionResult` 出力のキー集合 ⊆ {behavior, message} (`updatedPermissions` 全 variant・`updatedInput` が
  現れれば fail。変数を列挙せず正の構成で閉じる)、(P3) Query メソッドは interrupt のみ (C-101/C-201/H-201/L-201/M-101)。
  **すり抜け負例 (M-402)**: (i) `canUseTool` が `updatedPermissions`/`updatedInput` を含む結果を返そうとしても
  境界を越えられない/検査で fail する、(ii) `query()` に allowlist 外キーを混ぜた options を渡すと検査が fail する、
  (iii) 合成後 argv が `--dangerously-skip-permissions`/`--permission-mode` 等を含まない (L-404)、を負例で assert、
  (b) **`node <entry>` で agents を単独起動でき、SDK fake でも起動フローが agents 内 spawn を持つが `wsl.exe`
  リテラルを持たず Electron 非依存であることを肯定的に示す構造テスト + 単独起動 smoke** (FR-004/FR-019 を明示。C3/M-D)、
  (c) **render 経路 component テスト** (承認カード/live 描画の `javascript:`/生 HTML 無害化、チャンク境界 bidi、
  累積上限。H-06/H-07/M-05)、(d) 連続 launch でプロセスが 1 個を超えない + **終了後は再 launch できる** (M-02/M-102)、
  (e) **実 spawn 点の env テスト** — 汚染 `SpawnOptions.env` (WSLENV/資格情報 fake) を渡し spawn に渡る最終 env が
  `spec.env` のみ (許可リスト完全一致・denylist 0) であることを負例で assert (H-01/H-102/M-102)
  - **到達状況**: (a) P1/P2/P3 assert = `session-core.test.ts` (options キー ⊆ allowlist / `toPermissionResult` ⊆ {behavior,message} / argv に昇格フラグ無し) + check.mjs 項目 16 backstop、(c) render XSS = `ApprovalCard.test.tsx` + `live-message.test.ts` (bidi 除去。**チャンク境界/累積上限は AD-020 のメッセージ単位更新で構造的に N/A** — delta 単位を採らない)、(d) 単一セッション不変 = `session-launch-service.test.ts`、(e) 両 spawn 点 env = `session-core.test.ts` (child_process.spawn 側) + `launch-spec.test.ts` (`buildLaunchEnv`) で緑。**(b) `node <entry>` 単独起動 smoke は build + 実機を要するため SH-022 に合流** (全テスト 964 件 green)
- **SH-021** ✅ [Shared] 機械検証を通す — lint / typecheck (2 project) / depcruise / check:constitution / test。
  **check.mjs 項目 7 (agents が `PROCESS_SPAWN_MODULES` に入り緑) / 項目 3・15 (agents に `wsl.exe` リテラル無し) /
  項目 14 (Query メソッド denylist) が緑**であること。`services-not-to-io` の要否を確定 (**A-1**: 新規調停クラスを
  作るなら `from` に実名 + fixture、既存 `session-service.ts` 拡張なら不要)。`WSL_CALLER_MODULES` の要否を確定 (A-6)
- **SH-022** [Shared] quickstart V-1〜V-12 を実機で記録 (`quickstart-results.md`)。実機操作は人間 deferred、
  判定表の記録は done 必須。**孫プロセス (`wsl.exe`/`claude`) の孤児不在を V-8 で確認** (fake では踏めない。H-02)、
  `provider-error` (V-11) を確認、強制終了時の JSONL 破損を観察 (合否外。B-3)

---

## Backend Tasks (index)

`agents` / `infra` / `main/app` に属するタスク: BE-001〜BE-007 / BE-010〜BE-013 / BE-020〜BE-022 /
BE-030〜BE-031。SDK 呼び出しと **spawn (spawnClaudeCodeProcess コールバック)** は `agents`、
`wsl.exe` argv/リテラルは `infra/runtime`、IPC/port 配線・launch 検証ハンドラ (BE-007)・composition は `main/app`。

## Frontend Tasks (index)

`renderer` に属するタスク: FE-001〜FE-003 / FE-010〜FE-011 / FE-020〜FE-021 / FE-030 / FE-040。
R-3/R-4 の transcript 表示・assistant-ui を再利用し、**起動 entry point (FE-003)**・承認カード・
2 操作 UI・失敗表示・最小 composer を足す。

## Shared Tasks (index)

DB migration は無い (永続化しない)。共有は **型 / 純粋関数 / ADR / 機械強制の許可リスト / glossary /
charter / 検証** に相当する: SH-001〜SH-007 / SH-010〜SH-011 / SH-020〜SH-022。
API contract に相当するのは IPC 契約 ([contracts/session-launch.md](contracts/session-launch.md) C-1〜C-7)。

## Dependencies / 実行順

1. **SH-001 (ADR) が先行** — allowlist 追加 (SH-006/007) の根拠。design-gate 通過で accepted。
2. SH-002〜SH-005 は SH-001 と並行可 (型/純粋関数/docs)。
3. US-1 (BE-001〜007 / FE-001〜003 / SH-006〜007) → US-2 → US-3 → US-4 の順に垂直スライスを積む。
   FE-003 (entry point) / BE-006 (sendPrompt) / **BE-007 (launch 検証ハンドラ = 安全ゲート)** は US-1 の
   入口・往路・安全不変条件であり US-1 に含む。US 内の `[P]` は並列可。US-1 完了時点で
   「**安全ゲート込みで** folder+runtime を選び起動して応答が流れる」MVP。
4. FE-040 (IME) は FE-002 の後。SH-010/011 は US-1 の allowlist 変更後。
5. Phase 3 (SH-020〜022) は各 US 実装後。SH-021 の全件テストは最終 iteration。
