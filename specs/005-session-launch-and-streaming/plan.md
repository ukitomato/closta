# Implementation Plan: 単一セッション起動とストリーミング (X-1)

**Spec**: [spec.md](spec.md) · **Spec ID**: `005-session-launch-and-streaming` · **Feature**: X-1 · **Domain**: `session` · **Targets**: both

**Status**: frontmatter (`spec.md`) の `status:` を正とする

本 plan は「どう満たすか」を定める。受け入れ条件 (何を満たすか) は spec.md、実装方式の
詳細は [data-model.md](data-model.md) / [contracts/session-launch.md](contracts/session-launch.md) /
[research.md](research.md) / [quickstart.md](quickstart.md) が持つ。**規則の正本は 1 箇所**とし、
本 plan は参照形で書く。

## Domain Context

### Charter reference

- **Domain**: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- **Mission**: 複数フォルダ・複数ランタイムにまたがる Claude Code のセッションを、一箇所から
  走査・**起動**・監視・差配できるようにする
- **Scope (本 feature が触れる In scope)**: 「セッションの起動、応答のストリーミング、中断」
  「`canUseTool` の permission 往復の配管」。**軸の依存解決 / プリセット / supervisor 分離 /
  監視ビューは触れない** (X-4 / X-5 / O-1)
- **Journey**: Journey 2 step 4「起動する。応答がストリーミングで表示され、permission 要求には
  承認で応じる」に対応。Journey 4 の「中断」は本 feature、「再開 / 分岐」は X-4 以降
- **charter 追随 (本 feature で行う)**: charter L149「X-1 / X-4 / X-5 / O-1 は未着手」の X-1 を外し、
  Related Specs に本 spec を加える (architecture-reviewer が charter drift として見るため)

### Related ADRs

- [AD-018](../../docs/decisions/0018-wsl-process-control.md) — accepted — WSL 越しのプロセス制御。
  中断 = stdin 越し control_request / stdin を開いたまま保つ (AsyncIterable 必須) / 強制終了 = `wsl.exe` kill /
  ラッパーで stdin を潰さない / LF 終端。**本 feature の設計を直接縛る**
- [AD-023](../../docs/decisions/0023-application-architecture.md) — accepted — 5 レイヤ、
  データのみの IPC、MessagePort でストリームを運ぶ、**`agents` はセッションごとに 1 プロセス** (§6)、
  インタフェースは `domain` (§3)、Service に規則を書かない (§5)
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — accepted —
  `MessageChannelMain` の port transfer で main を本文経路から外す。制御要求は main 検証を経る。
  live stream は per-request 短命でなく **per-session** で運ぶため別モデル (本 feature で ADR 起票)
- [AD-002](../../docs/decisions/0002-use-agent-sdk-not-cli.md) — accepted — SDK V1 `query()`。自前パース禁止
- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) — accepted — `PermissionMode` 6 値、
  `dontAsk` は安全、`SDKPermissionDeniedMessage` を Tier A に加える
- [AD-011](../../docs/decisions/0011-delegate-credential-resolution.md) — accepted — 資格情報は
  Claude Code に委譲。本 feature は既定に委ね、資格情報を持たない
- [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) — accepted —
  常駐 + 直列 (R-2)。本 feature は**別形態 (per-session)**。プロセス寿命・孤児回収・
  `parentPort` transport の先例として参照
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — **proposed (本 feature で起票)** —
  per-session プロセス形態 / live stream の port transfer / `spawnClaudeCodeProcess` での WSL 起動 (agents が spawn 主体・
  wsl.exe リテラル不在) / 権限昇格面の全数封鎖 / env denylist / 所在一致ゲート / AD-023 §7 の argv 帰属の調停。
  design-gate Round 2 通過で accepted へ

### Glossary excerpt

- **Session**: Claude Code の 1 会話。正本は Claude Code 側 (Principle X)
- **supervisor**: セッションのプロセスとストリームを持つ `utilityProcess`。実体は `src/agents/`。
  Electron / ネイティブ非依存で単独起動できる
- **Approval card**: `canUseTool` の permission 要求に応答する UI。単発承認と capability 付与を区別する
- **SessionLaunchConfig**: 起動時の設定の組。本 feature は部分集合 (作業フォルダ / WslRuntime /
  固定 `default` モード / 最小 env) のみを使い、軸選択 UI は持たない
- **SessionMessage / message mapping / TranscriptView**: 表示側の再利用。live stream も同じ変換と
  XSS 境界を通る (AD-034 / AD-035)
- **本 feature で glossary に追記する候補**: `AgentSession` (稼働セッション) / `SessionRunState` /
  `PermissionRequest`。Principle XIV に従い code 投入前に追記する

## 上流からの申し送りの棚卸し (必須)

**実行コマンド** (Grep ツール):
`pattern = "X-1|005-session-launch-and-streaming"`, `glob = "*.md"`, リポジトリ全体。
**総ヒット: 約 45 行** (docs / PLAN.md / specs 配下)。以下に**全ヒットへ処理を割り当てる**。
機械強制対象 (`.dependency-cruiser.js` / `allowlists.mjs`) は grep 対象外だったため別途 Read で確認した。

### A. 機械強制の履行義務 (`.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs`)

| # | 申し送りの出所 | 本 feature での処理 | 割当 |
|---|---|---|---|
| A-1 | `.dependency-cruiser.js:232-235` `services-not-to-io` の `from` は `folder-service\|runtime-store\|session-service` 実名。「X-3 / I-2 の Service を作るときは足す」。**R-2 が `session-service.ts` を追加済み** | 本 feature が**新規の調停クラス**を作る場合 (`session-launch-service.ts` 等) は `from` に実名追加 + fixture 1 件。既存 `session-service.ts` を拡張して収める場合は追加不要 (plan Phase 2 で確定) | SH-上流1 |
| A-2 | `allowlists.mjs:315` `AGENT_SDK_ALLOWED_CALLS = ['listSessions','getSessionMessages']`。「追加には ADR を要する」。`X-1 / O-1 / I-1 で正当に使う」明記 | **`query` を追加** (起動)。`interrupt` は query 戻り値のメソッド、`canUseTool` はコールバック option であり呼び出し形の追加要否を実装で確認。**追加は新規 ADR に紐づける** (Principle VI) | SH-上流2 |
| A-3 | `allowlists.mjs:208-232` `PROCESS_SPAWN_MODULES` (enumerator-spawner / transcript-spawner)。「追加には ADR」 | **per-session の spawner (`src/main/app/session-spawner.ts` 等) を実名追加**。常駐 (AD-030) / 短命 (AD-034) と別寿命なので新モジュール。新規 ADR に紐づける | SH-上流3 |
| A-4 | `allowlists.mjs:339-352` `WSL_FREE_DIRECTORIES` に `src/agents/` を含む。**agents は `wsl.exe` を名指さない** | **確定 (AD-036 §3)**: 起動コマンド/argv (wsl.exe を含む) の構築は `infra/runtime/` が `RuntimeLaunchSpec` の**値**として行い app 経由で agents に渡す。**spawn 自体は SDK の `spawnClaudeCodeProcess` コールバックで agents が行う** (SDK 実型がコールバックのため) → `agents/sdk-agent-session.ts` を `PROCESS_SPAWN_MODULES` に追加 (項目7)。agents は `wsl.exe` リテラルを持たない (項目3/15 は「リテラル不在」で満たす)。新 app モジュールは WSL_FREE_DIRECTORIES に実名追加 | SH-上流4 / SH-006/007 |
| A-5 | R-3 `code-gate.md:48` / `platform-boundary-reviewer.code-gate.md:34`: 検証項目 14 (SDK 書き込み系 API) の **binding denylist** は `UNDETECTED_NOTES['sdk-write-alias']` に `nextFeature: X-1` 記録済み | **項目 14 の alias / dynamic import 素通し経路を binding レベル denylist で塞ぐ** (または違反 fixture)。**併せて Query メソッド面 (`setPermissionMode`) を denylist に含める** — 項目14 は named import 呼び出し形のみで `.method()` を見ない (C-003/H-10)。AD-034 §3 / AD-027 規範 | SH-010 |
| A-6 | `allowlists.mjs:186` `WSL_CALLER_MODULES=['wsl-cli.ts']` 単一固定。argv builder を新規ファイルに置くと項目3が違反 (design-gate M-A) | argv builder を既存 `wsl-cli.ts` に収めるなら変更なし、新規 `infra/runtime` モジュールなら `WSL_CALLER_MODULES` に ADR 付き実名追加。SH-007 の対象に含める | SH-007 |

### B. 設計判断の申し送り (ADR / 先行 spec)

| # | 申し送り | 処理 | 割当 |
|---|---|---|---|
| B-1 | roadmap L172 / R-3 `research.md:58` / `plan.md:255`: **Streamdown の採否を X-1 で評価** | research.md R-01 で評価。**XSS 境界を回帰させない**前提。既定は `MarkdownText` 継続、live での便益が実測で確認できれば採用 | research R-01 |
| B-2 | R-3 `research.md:15`: 末尾が伸びるため **`Unstable_MessageById` を再評価** (R-3 は `MessageByIndex`) | research.md R-02 で評価。live streaming の末尾更新に耐える描画 primitive を選ぶ | research R-02 |
| B-3 | R-2 `plan.md:31` / AD-018 Open Q: **`wsl.exe` 強制終了時の JSONL 破損**は起動を伴うため X-1 | FR-016 の警告文に反映。実機挙動を quickstart に記録 (合否外) | quickstart V-5 |
| B-4 | AD-025「### X-1 へ」/ R-1 `architecture-reviewer.round1.md:314` M-002: 所在 WSL × `Win32Runtime` の未検証仮定 | **本 feature は WSL 内起動に限る** (spec Out of Scope)。Win32 直接起動は X-4。research.md に「本 feature では発火しない」と記録 | research R-05 |
| B-5 | `platform-boundary-reviewer.md:108` (R-2): **UNC を DTO / 境界に出す前例を踏襲しない** | 起動系 DTO に UNC / 生パスを載せない。パスは所在の名前空間で表す (AD-025)。contracts C-3 で明示 | contracts C-3 |
| B-6 | convention-reviewer.md:404-405 (R-2): `src/agents/` の登録簿 (`Worker` 等の実体) が SSoT から読めない | 本 feature が `src/agents/` に足すモジュールを discovery / directory map に反映 (code-gate で convention-reviewer が見る) | tasks (Shared) |
| B-7 | convention-reviewer.md:785 `ui-path-concat -> nextFeature: X-1` | `UNDETECTED_NOTES['ui-path-concat']` を確認し、本 feature で該当経路が生じるなら塞ぐ。生じなければ `nextFeature` を後続へ繰り越す理由を記録 | SH-上流6 |

**「該当なし」判断**: PLAN.md のヒット (L691-693 等) は feature 一覧の再掲であり処理不要。
`ux-reviewer.md:22` の "UX-1" は別文脈 (grep の偽陽性)。charter L149 は上記 charter 追随で処理。

## Technical Context

- **Stack** ([docs/discovery.md](../../docs/discovery.md) を正とする): TypeScript 5.9 / Electron 39 /
  electron-vite 5 / React 19 / Tailwind 4 / `@assistant-ui/react` 0.15 / zustand 5 /
  `@anthropic-ai/claude-agent-sdk` 0.3.270 / Vitest 5。**E2E (Playwright) は未導入** (M4 後)
- **Build / Test / Lint** ([docs/discovery.md](../../docs/discovery.md) の "Build / Test / Lint" 表の
  「agent 用」列を正とする): lint = `node node_modules/eslint/bin/eslint.js --cache .` /
  typecheck = 2 project の `tsc --noEmit` / depcruise / `check:constitution` / test = Vitest
- **レイヤ配置** (AD-023):
  - `domain/session/` — `AgentSession` interface / `SessionRunState` の状態機械 (純粋) /
    stream イベント → DTO 変換 (I/O なし。`ui` と `agents` から呼べる)
  - `agents/` — `sdk-agent-session.ts` の **module worker** (以降 `SdkAgentSession` はこの worker の略称。
    クラスではなく `run()`/`main()`。SDK `query()` / stream / `interrupt()` / `canUseTool` コールバック)。
    **Electron / ネイティブ非依存 / `wsl.exe` を名指さない**
  - `infra/runtime/` — WSL 起動 argv の構築 (`RuntimeLaunchSpec` を値として返す。`wsl.exe` はここ)
  - `main/app/` — composition root / per-session spawner / `MessageChannelMain` 配線 / 制御 IPC /
    preload 単一 capability の拡張
  - `renderer/` — composer (最小 + isComposing) / 承認カード / 状態表示。R-3/R-4 の transcript 表示を再利用

## Architecture: 2 面のプロセス境界 (data plane / control plane)

**live stream (高頻度・大容量) と制御 (低頻度・要検証) を分ける。** AD-034 が transcript で確立した形を
per-session に一般化する。詳細は [contracts/session-launch.md](contracts/session-launch.md)。

```
renderer (ui)                         main (app + infra)                    agents (per-session)
────────────                          ──────────────────                    ───────────────────
composer / 承認カード / 状態  ──制御 IPC(検証)──▶  session control handler ──postMessage──▶  SdkAgentSession
   ▲                                     │                                        │  query({prompt:AsyncIterable,
   │                                     │ MessageChannelMain 生成                │        canUseTool, options})
   │                                     │ port1→agents / port2→renderer         │        │
   └──────── SessionEvent (port2 直通) ◀─┼────────────────────────────────────── port1 ◀─┘  逐次 yield を DTO 化
        (main を本文経路から外す)         │ (main は port ハンドル中継のみ)
                                    infra/runtime: RuntimeLaunchSpec (wsl.exe argv) を値で供給
```

- **data plane**: SdkAgentSession が `query()` の yield を DTO 化し、`MessageChannelMain` の port で
  renderer に直送。main は本文を `JSON.parse` / deserialize しない (FR-007 / SC-003)
- **control plane** (contracts C-1 が正本の 5 メソッド): `launch` / `sendPrompt` / `respondPermission`
  (`outcome: allow|deny` / `scope`) / `interrupt` / `kill` は renderer → main の
  検証済み IPC → agents (`postMessage`)。**port から制御要求を発行させない** (FR-010 / SC-007)
- **canUseTool 往復**: SDK のコールバックが agents で発火 → SessionEvent (port) で承認カード表示 →
  利用者の決定は **control plane (main 検証)** で agents に返り、コールバックの Promise を解決する。
  相関は `requestId`。データ経路から grant/deny を受けない (AD-034 §1 の迂回防止)
- **stdin/中断**: `query()` に AsyncIterable prompt を渡し**開いたまま保つ** (FR-011)。`interrupt()` は
  query 戻り値のメソッド (stdin 越し control_request)。**強制終了は renderer→main→agents の制御 IPC で発行し、
  agents が保持する `SpawnedProcess` (wsl.exe) を直接 kill する** (app が OS kill するのは utilityProcess ハンドルのみで、
  それだけでは Windows の親 kill 非伝播により孫 wsl.exe が孤児化する。contracts C-6 / data-model §1 / AD-036 §3・§6 /
  AD-018 Consequences。arch/platform H-402) (FR-016/17)

## Constitution Check

| Principle | 本 feature での遵守 | 検証 |
|---|---|---|
| **IV** (SDK 経由) | `query()` V1 のみ。stream-json 自前パース無し | `AGENT_SDK_ALLOWED_CALLS` に `query` 追加 (SH-上流2)。呼び出し形検査 |
| **VII** (supervisor は Electron/native 非依存) | `agents` の `SdkAgentSession` は SDK と `parentPort` transport のみ。`node <entry>` で単独起動可 | depcruise `agents-not-to-electron/native/infra`。単独起動テスト |
| **IX** (main をブロックしない) | stream 本文は port transfer で agents↔renderer 直通。main 非経路 | 構造検査 (SC-003) + 手動レビュー。到達集合検査は未構築 (AD-034 §5 と同じ限界。持ち主は E2E 基盤 feature) |
| **V** (資格情報を永続化しない) | 資格情報を持たず既定に委ねる。env は最小許可リスト、親環境非継承、ログに env を出さない | env 組み立て純粋関数のテスト (SC-006) + ログ走査 |
| **III** (権限モードは capability に従う) | permissionMode を `default` 固定。`auto`/`bypass` を渡す経路無し。`dontAsk` は制限しない (AD-020 §3) | 起動オプション純粋関数のテスト (SC-006) |
| **II** (プラットフォーム分岐は runtime 内) | WSL 起動 argv は `infra/runtime/` のみ。agents / app に `process.platform` を書かない | `check.mjs` 項目 8 (`PLATFORM_BRANCH_DIRS`) |
| **VI** (永続環境を構築しない / spawn 許可) | 新 spawner を `PROCESS_SPAWN_MODULES` に実名追加 (ADR)。ディストロ内に何も導入しない | `check.mjs` 項目 1/3/7。**agents は `wsl.exe` を名指さない** (`WSL_FREE_DIRECTORIES`。SH-上流4) |
| **VIII** (日本語で破綻しない) | composer の送信経路を開くので `isComposing` ガードを載せる。full 検証は X-2 | isComposing ガードの component テスト (SC-009)。E2E は X-2 / E2E 基盤 |
| **X** (正本はアプリ外) | 起動結果の正本は Claude Code 側の JSONL。アプリは表示状態のみ持つ | — (構造的。永続化しない) |
| **XI** (垂直スライス) | 「起動して応答が流れ、承認・中断できる」観測可能な振る舞いを持つ | po-reviewer |
| **XIII** (element 優先) | 承認カードは assistant-ui の Approval 系 element を照合。無ければ候補名と不適合理由を PR に記載 | ux/convention-reviewer |
| **I** (パス操作は domain のパス API 経由) | cwd の HostPath→RuntimePath 変換は **`composition-root` (app) が** `domain` のパス API 経由で行い (PathMapping 状態が要るため。AD-036 §3 訂正 2026-09-27 / pr-gate arch M-002)、agents は `RuntimeLaunchSpec` の値を `--cd` に渡すのみで再変換しない (変換主体を単一 locus に一意化。argv/command 構築は infra/runtime の launch-spec.ts が担う=§8)。agents は HostPath/UNC が argv・SessionEvent に漏れないことの検証のみ担う。起動系 DTO/port/argv に UNC・生パスを出さない。**変換 locus の一意化は機械証明できず手動レビュー + 型設計で担保** (agents は完成 RuntimePath を string として受ける。arch M-003) | depcruise `path-module-only-from-path-api` / SC-008 / 手動レビュー |
| **XII** (emit 情報に未表示を残さない) | 本 feature は承認カード (permission-request) と「聞かれずに拒否」(SDKPermissionDeniedMessage) の**新規 emit→表示**を導入するが、いずれも本 feature 内で表示実装を持つ (未割当を残さない)。`docs/ui-coverage.md` 対応表そのものの確立は O-2 (Principle XII 検証基盤が O-2 まで存在しない。roadmap)。**本 feature の 2 経路を O-2 の ui-coverage 対象として繰り越す申し送りを roadmap/tasks (SH-005) に残す** (持ち主不在にしない。AD-031)。X-1 は `session` domain であり pr-gate 通過後 `completed` にしてよい (未割当を残さないため)。**XII の Automated ゲート (ui-coverage.md の未割当行検査) は同ファイルが O-2 まで不在のため X-1 では不活性 — completed 可否は新規 2 経路 (permission-request / SDKPermissionDeniedMessage) と X-1 が live で新たに流す型 (SDKResultMessage error / init capabilities / partial 等) の表示を pr-gate の手動確認 (ux/architecture) で担保する** (「緑 ≠ 遵守」の明示。arch L-002。AD-034 §5 規範) | ui-coverage-reviewer (O-2) / architecture (C-004/L-002) |
| **XIV** (Ubiquitous Language) | `AgentSession` / `SessionRunState` / `PermissionRequest` / **`PermissionDecision` / `SessionEvent` / `RuntimeLaunchSpec`** を glossary に追記済み。「実行単位」表記は canonical `supervisor` に統一済み (SH-004。M-B/M-C) | architecture/po-reviewer |
| **XV** (Multi-language) | UI ラベルは日本語第一 (FR-020 系。承認カード/失敗表示)、失敗理由キーの訳出は `ui`。code identifier は英語。i18n リソース化は M3 判断 | (drift check) |

**新規 ADR (本 feature で起票)**: (1) per-session supervisor の形態と live stream の `MessageChannelMain`
port transfer、(2) `canUseTool` 往復の main 検証済み経路、(3) `AGENT_SDK_ALLOWED_CALLS` への `query` 追加と
`PROCESS_SPAWN_MODULES` への spawner 追加、(4) 起動 argv を `infra/runtime` が値で供給し agents を
WSL-free に保つ配線。**design-gate で「蒸し返し」ではなく ADR 起票として扱う** (PLAN.md §3 の運用)。

## Phases

### Phase 0: Research ([research.md](research.md))
Streamdown 採否 (R-01) / 描画 primitive (`Unstable_MessageById`。R-02) / SDK の起動・
`canUseTool`・`interrupt` の型確認 (R-03) / port transfer を live に使う設計 (R-04) /
Win32 起動が本 feature で発火しないことの確認 (R-05)。**SPIKE-5/3 は完了済み**であり新規 SPIKE は無い。

### Phase 1: Data model & contracts ([data-model.md](data-model.md) / [contracts/session-launch.md](contracts/session-launch.md))
`AgentSession` interface / `SessionRunState` 状態機械 / `SessionEvent` DTO / `PermissionRequest`・
`PermissionDecision` / `SessionControl` / `RuntimeLaunchSpec`。IPC 契約 (制御 invoke 群 + port ハンドシェイク)、
副作用禁止表 / 呼んではならない API 表 (C-4)、env 許可リスト (C-5)。

### Phase 2: 実装 (tasks.md が正)
BE (agents / infra / app) → FE (renderer) → Shared (allowlist / ADR / charter / glossary / quickstart)。
**A-1 (services-not-to-io) の要否をここで確定**する — 新規調停クラスなら実名 + fixture。

### Phase 3: 検証
Vitest (SC-001〜SC-010 の計測経路) + 機械検証 (lint / typecheck / depcruise / check:constitution /
test:rules) + quickstart 実機 (逐次描画 / 承認往復 / 中断・強制終了 / 失敗封じ込め)。

## Complexity / risks

- **agents の WSL 起動配線** (SH-上流4) — design-gate Round 1 で「`spawnClaudeCodeProcess` は
  コールバックであり agents が spawn する」と判明 (C-001)。**AD-036 §3 で解決**: agents は spawn 主体だが
  `wsl.exe` リテラルを持たず (値で受ける)、Electron/native 非依存を保つ。`sdk-agent-session.ts` を
  `PROCESS_SPAWN_MODULES` に追加。kill ハンドルも agents が保持 (H-02 解決)
- **権限モードの実行時昇格** — `Query.setPermissionMode` が型ロックを回避 (C-003)。**AD-036 §4/§5 で解決**:
  `setPermissionMode` を禁止 API に指定し、項目14 の穴を Query メソッド面 denylist + 不到達テストで塞ぐ
- **live stream の port transfer を per-session で使うのは初** (AD-034 は per-request)。
  inbound 封じ込め (port から制御を受けない) を実装 + テストで守る
- **Principle VIII の送信経路開放**。最小 isComposing ガードで満たし、full は X-2 に明示的に残す。
  security/ux-reviewer が「送信経路を開けたのにガード不足」を見る想定 → FR-018 / SC-009 で先回り
- **強制終了時の JSONL 破損** (AD-018 Open Q) は未検証。警告 + quickstart 記録で扱う

## Post-design re-check (design-gate 前の自己点検)

- [ ] FR ↔ SC ↔ Acceptance の対応に欠落が無い
- [ ] 上流申し送り (A-1〜A-5 / B-1〜B-7) 全件に割当先がある
- [ ] 新規 ADR の起票予定を Dependencies と本 Check に明記した
- [ ] charter L149 / Related Specs の追随を tasks に含めた
