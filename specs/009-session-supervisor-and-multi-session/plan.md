# Implementation Plan: supervisor 分離とマルチセッション (X-5)

**Branch**: `009-session-supervisor-and-multi-session` | **Date**: 2026-10-01 (design-gate R1・R2 反映) | **Spec**: [spec.md](./spec.md)

## Summary

X-1 / X-4 は、main がセッションごとに agents の `utilityProcess` (`sdk-agent-session.ts`) を fork し、`active.size > 0` で 2 本目を `session-active` で拒否している。これを次の形に作り替える。

- main は **supervisor (`utilityProcess`) を 1 つだけ**起こし、起動・制御・状態通知をこの 1 本と多重化してやり取りする。
- supervisor の**調停役スレッド** (`src/agents/supervisor.ts`) が、セッションごとに**セッションスレッド** (`worker_threads` の Worker。`sdk-agent-session.ts` を流用) を起こす。SDK `query()` と stream のパースはセッションスレッドで行う。
- 本文はセッションスレッドが**文字列に直列化**し、調停役スレッドは JSON として解釈せずに transport が用意した**本文の出口** (Electron 経路ではセッション専用の port、標準入出力経路では行) へ渡す。renderer が復元する。
- 状態通知 (sessionId / run-state / 理由キー / `claudeAlive`) は調停役スレッドが **100ms 窓でまとめ、セッションごとに最新へ畳んで** main へ送る。main は domain の受信規則で検証し、受理したものだけを renderer へ 1 回で転送する。
- main の起動調停は**上限 10 の semaphore** に変わる。上限判定と枠の予約は `await` の前に同期で行う。
- renderer は**セッション単位のストア**を持ち、稼働中セッションの一覧・切り替え・終了の最小 UI を加える。起動は X-4 の `LaunchDialog` をそのまま使う。

本作り替えは AD-023 §1・§6 / AD-036 §1・§3 を読み替える **AD-043** を起票して行う (spec FR-015)。**AD-043 は SH-000 の実測が揃うまで proposed のまま**にする (2026-10-01 accepted)。AD-030 §5 (本体は経路を知らない) は読み替えず、守る — 経路ごとの分岐は transport の内側に置く。

## Technical Context

- **Stack**: Electron 39 / electron-vite 5 / React 19 / TypeScript / zustand 5 / Vitest / Playwright + Electron (AD-038) / `@anthropic-ai/claude-agent-sdk` (docs/discovery.md)
- **レイヤ** (AD-023): `domain` (純粋) / `agents` (Electron 非依存・SDK 保持 = supervisor の実体) / `main/infra` (OS 境界) / `main/app` (合成・IPC) / `renderer`
- **既存の起点**:
  - `src/main/app/session-launch-service.ts` — 単一セッション不変 (`active.size > 0`) と制御ルーティング。`dispose(): number` (同期)
  - `src/main/app/session-spawner.ts` — per-session fork + `MessageChannelMain` の port transfer。fork は `stdio: 'ignore'`
  - `src/main/app/e2e-capability.ts:240-306` — E2E 用に launch service ごと差し替え、main 内で `active.size > 0` → `session-active` を複製している
  - `src/main/index.ts:69` (E2E) / `:118` (本番) — `before-quit` の登録先。`composition-root.ts:383` の `dispose` は 3 つの同期 dispose の和
  - `src/agents/sdk-agent-session.ts` — 1 プロセス = 1 セッションの SDK 入口。`process.parentPort` で launch / control を受け、kill で `process.exit(0)` する。port の無い launch は `exitCode = 1` で拒否 (`:503-507`)。本文は構造体のまま `port.postMessage(event)` (`:313`)。**素の `node` 起動では何もしない** (本 feature で解消する)
  - `src/agents/transport.ts` — parentPort / stdio の経路選択 (AD-030 §5)。「本体は経路を知らない」(`:6`)。文字列 1 行単位で、port を運ばない。`onClosed` は stdio 側だけが実装を持つ
  - `src/agents/protocol.ts:193,256` — 既存の行デコーダ (列挙用)
  - `src/renderer/src/features/session/useLiveSession.ts:174-181` — port を `window` message の origin / source 検証つきで受け、handshake 前の port を**単一スロット**に待避する。`:187-196` — unmount で kill (X-1 pr-gate C-001)
  - `src/renderer/src/features/session/SessionScreen.tsx:140,165` — composer の無効化とキューの終端判定を `runState === 'error' || killed` で行う (X-1 pr-gate po H-001 / H-401)
- **確認済みの事実**:
  - X-1 の `done` は「応答完了・次のプロンプト待ち」と「kill 後」の両方を表す (`run-state.ts:71` / `:106`)。`TERMINAL_STATES` は `['error','done']` (`:23`)。上限は run-state でなく `claudeAlive` で数える (spec FR-005)
  - terminal error では worker は `wsl.exe` を kill するが自身は exit しない (`sdk-agent-session.ts:481`)
  - 本文の上限は part ごとに `BODY_MAX_BYTES = 200_000` (`sanitize-body.ts:12`、`live-message.ts:46-56`)。`user` の tool_result は live 表示に載らない (`sdk-agent-session.ts:466`)
  - X-1 quickstart V-8: アプリ終了で `wsl.exe` / WSL 内 `claude` は全て消えた (孤児 0)。**supervisor だけが異常終了した場合と、Worker から spawn した子の挙動は未測定**
  - Node の `ChildProcess` はプロセス生成時刻を公開しない。Windows で得るにはプロセスの起動かネイティブ API が要る
- **未確認 (SH-000 で実測する。AD-043 の accepted 化の条件)**:
  1. utilityProcess の中の Worker で、SDK `query()` (実 `claude`) と `child_process.spawn` が動くか
  2. utilityProcess が受け取った port (`MessagePortMain`) を Worker の `transferList` に渡せるか (渡せないと見込む)
  3. supervisor を `taskkill /F` で落としたとき、配下の `wsl.exe` と WSL 内 `claude` が残るか。Worker を `terminate()` したとき、その Worker が spawn した `wsl.exe` が残るか。Worker の `resourceLimits` 超過時に同じく残るか
  4. electron-vite で supervisor entry と worker entry を `?modulePath` で別ファイルに出せるか。ビルド成果物の supervisor を `node` で起動し、worker のパスを引数で渡して動くか

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス名前空間) | ✅ | パスを新たに組み立てない。worker entry のパスは main が `?modulePath` (バンドラの解決) で得て supervisor の起動引数に渡す。agents はパス文字列を作らない |
| II (プラットフォーム差を infra に閉じる) | ✅ | supervisor 異常終了時の回収 (作る場合) は `infra/runtime` に置き、WslRuntime 専用であることを名前・registry の `reapable`・ADR に書く (AD-018 の実測範囲)。プロセス情報を OS に問い合わせない |
| III (権限ゲート) | ✅ | `buildQueryOptions` の正の構成 (P1-P3) と安全 3 値は変えない。セッションスレッドに移すのは配線だけ。標準入出力経路の launch も同じ decoder を通る |
| IV (SDK 経由) | ✅ | `query()` を呼ぶのは `sdk-agent-session.ts` だけのまま (`AGENT_SDK_ALLOWED_CALLS`) |
| V (資格情報非永続) | ✅ | 導出 env は `RuntimeLaunchSpec.env` として Worker に**最初の message** で値渡しし、`wsl.exe` の spawn env にだけ載る。Worker は `env` オプション未指定 (supervisor の curated base の複製) で起こし、`SHARE_ENV` を使わない。調停役スレッドは spec を Worker に渡した後に参照を保持しない。標準入出力経路で受信行を echo しない。supervisor の fork env は curated base のまま (X-4 FR-013)。状態通知に env も本文も載せない |
| VI (永続環境を構築しない) | ✅ | ディストロにもデータ域にも何も書かない。新たな子プロセスの起動元を増やさない (`PROCESS_SPAWN_MODULES` の追加なし) |
| VII (supervisor Electron 非依存) | ✅ (要強化) | 調停役スレッドとセッションスレッドは `electron` を import しない。**単独起動を初めて実体化する** — 標準入出力経路で起動・制御・状態通知・本文が往復でき、標準入力を閉じると全セッションを止めて終了する。SC-009 の単体 + lint + depcruise + **ビルド出力の検査** + quickstart で固定する |
| VIII (日本語環境) | ✅ | composer の IME ガード・下書き・送信待ちキュー (X-2) をセッション単位に分けるだけで、挙動は変えない。2 ペイン化に伴う基準画像の差分は AD-038 D5 の承認手順に従う (SH-011) |
| IX (main をブロックしない) | ✅ (ADR + Constitution PATCH) | 本文は port で renderer へ直送し、main は持たない。調停役スレッドは本文を JSON として解釈しない (文字列コピーのみ。part ごとに `BODY_MAX_BYTES` で有界)。main が行をパースするのは状態通知などのメタデータに限る (AD-031 §2)。Good example (パース済みの構造体を直送) からの逸脱と検査の限界を PATCH で書く (SH-092) |
| X (正本は Claude Code) | ✅ | 新たな永続化を持たない。renderer の保持はキャッシュ |
| XI (観測可能な垂直スライス) | ✅ | 2 本起動 → 切り替え → 終了を E2E で観測できる。supervisor 内部は単体 + quickstart で観測する |
| XII (ui-coverage) | N/A | 新しい SDK メッセージ型・tool の表示を足さない (既存の transcript 表示を再利用)。対応表の持ち主は O-2 |
| XIII (element 優先) | ✅ | 一覧の element は `ui` domain が既存 element の在庫照合 (AD-019) で選ぶ。本 plan は候補を決めない。独自 element を新設する場合は XIII の Exceptions の書式 (候補名と不適合理由) を FE-011 の完了条件にする |
| XIV (glossary) | ✅ | spec FR-016 の用語・区別を SH-002 で追随させる |
| XV (UI ラベルは ui) | ✅ | 新しい理由キー・状態ラベル・強制終了に落ちた通知の訳文は `labels.ts` に置く |

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- Scope (本 feature に関わる行): 「セッション supervisor (`utilityProcess` 分離、semaphore 制御、IPC バッチ化)」「セッション状態の管理 (idle / running / awaiting_permission / error) と監視ビュー」(監視ビューは O-1)
- 業務ルール: stream の逐次パースは supervisor で行い main をブロックしない (Principle IX)。プリセットに長期資格情報を含めない (X-4 を継承)
- KPI: 「並列時の滑らかさ — 10 セッション同時実行で UI の入力応答が保たれる (手動検証 + フレーム計測)」を SC-003 が担う
- User Journey 3 (10 セッションを並列で差配する) の最小形を担う

### Related ADRs

- [AD-006](../../docs/decisions/0006-supervisor-in-utility-process.md) — supervisor は `utilityProcess`: accepted — 数 MB の `JSON.parse` で main を固めないため分離する
- [AD-010](../../docs/decisions/0010-supervisor-runs-standalone.md) — supervisor は単独起動可能: accepted — Electron / ネイティブに依存せず `node` で起動し標準入出力で話す
- [AD-018](../../docs/decisions/0018-wsl-process-control.md) — WSL プロセス制御: accepted — 中断は stdin 越しの control_request、強制終了は `wsl.exe` の kill。docker 経由の kill 伝播は未測定
- [AD-023](../../docs/decisions/0023-application-architecture.md) — アプリケーション構成: accepted — §1 agents の寿命はセッションと同じ / §3 interface の例示 / §5 Service に規則を書かない / §6 agents は per-session プロセス。**§1・§6 を AD-043 で読み替える** (§3 の `stop()` の例示は X-5 で古くなる旨を AD-043 に注記)
- [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) — 列挙は常駐 1 プロセス: accepted — §5 経路選択を `transport` 1 モジュールに閉じ、本体は経路を知らない。**本 feature は守る** (本文の出口も transport が作る)
- [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) — ADR の訂正と Principle IX の範囲: accepted — §1 決定の変更は後続 ADR / §2 メタデータの行パースは IX の範囲外、検査は置き場しか見ない
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — transcript の読み取り経路: accepted — 本文は port transfer で main を通さない
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — 単一セッション起動とライブストリーム: accepted — §1 per-session `utilityProcess` / §2 port は一方向 / §3 kill ハンドルは agents。**§1・§3 を AD-043 で読み替える**
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — E2E とスクリーンショット: accepted — D3 E2E の差し込み口の二重ゲート / D5 基準画像の更新は PR で承認
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — X-4 の起動設定を X-1 の起動ゲートに載せる: accepted — 起動前段・env 配送・`--exec` をそのまま使う
- **AD-043 (本 feature で起票。proposed → SH-000 後に accepted。2026-10-01 accepted)** — 単一 supervisor + セッションスレッドと同時実行数の上限 (下の `## ADR`)

### Glossary excerpt

- **supervisor**: セッションのプロセスとストリームを持つ `utilityProcess`。実体のディレクトリは `src/agents/`。Electron API にもネイティブモジュールにも依存しない。`node dist/supervisor.js` で単独起動できる (本 feature で「単一プロセス + 調停役スレッド + セッションスレッド」と、worker のパスを引数で渡す起動形に更新)
- **SessionRunState**: 単一セッションの状態機械。7 状態。単一セッション不変 (`isActive`) は registry 側で判定する (本 feature で注記を更新)
- **SessionSummary (セッション要約行)**: R-2 の列挙一覧の 1 行。本 feature の状態通知とは別物
- **Message queue**: 中断で still_queued 維持、error/killed 終端で cancelled (本 feature で「`claude` の終了で cancelled」を足す)
- **SessionLaunchConfig**: セッション起動時に選択される設定の組。X-4 は前 6 軸を実装する
- **Approval card**: 単発承認と capability 付与を区別する承認 UI (状態は `session`、見た目は `ui`)

## 上流からの申し送り

実行したコマンドと件数:

```bash
grep -rn -E "009-session-supervisor|X-5" docs/ .specify/ tests/ specs/ \
  --include='*.md' --include='*.mjs' --include='*.js' --include='*.yaml' --include='*.yml' | grep -v '^specs/009'
# → 51 件
grep -rn -E "sdk-agent-session|session-spawner|session-launch-service" scripts/ eslint.config.mjs .dependency-cruiser.js
# → 8 件 (実名リスト方式のルール)
```

| # | 出典 (行) | 申し送りの内容 | 処理 |
|---|---|---|---|
| 1 | docs/discovery.md:84 | supervisor は「absent (X-5 で入る)」 | **本 feature** — SH-090 で present に改める |
| 2 | charter:163 / _overview.md:57,94 / roadmap.md:182,188,207,224 / prompts.md:203 | X-5 の行・依存関係 (X-6 / O-1 / I-1 が X-5 に依存) | **本 feature** — charter / roadmap の X-5 行を SH-090 で更新。依存先の行は変えない |
| 3 | constitution.md:567 | Principle IX の Why に「10 セッション並列 (X-5)」 | 該当なし (根拠の記述であり義務ではない)。Verification の「現状の制約」と Good example の扱いは SH-092 で事実追随する |
| 4 | 001 plan:83 / 002 plan:18 | 「utilityProcess は X-5」「supervisor の分離 (X-5)」 | 該当なし (過去 feature の範囲の記述。完了済み spec は変更しない) |
| 5 | 002 platform-boundary-reviewer:124 | Principle VII を「lint が緑だから守られている」で満たした扱いにしない | **本 feature** — 単独起動を実体化し、単体 + ビルド出力の検査 + quickstart で固定する (BE-012 / SH-022) |
| 6 | 005 arch design-gate:40 / round2:20 / spec:45 | 「実行単位」を canonical `supervisor` に統一 / X-5 で分離・多重化される | **本 feature** — glossary (SH-002)・コード内コメント (SH-091)。用語は `supervisor` / 調停役スレッド / セッションスレッドに統一し、Worker は実装語として括弧で添える |
| 7 | 005 arch pr-gate round2 M-002 | `AgentSession.stop()` と `kill` が対応しない (follow-up は X-5 前) | **本 feature** — `stop()` を削除し、`AgentSession` の操作語彙を `SessionControl` (send-prompt / respond-permission / interrupt / end / kill) と起動に揃える (BE-001) |
| 8 | 005 arch pr-gate round2 M-003 | dispose の kill 順序 | **本 feature** — X-1 V-8 は per-session プロセスでの実測であり、単一 supervisor + Worker では前提が変わる (Worker の子は supervisor の子になる)。`dispose` を非同期化する (kill → 全 `claudeAlive:false` か期限 → supervisor 終了。BE-021) |
| 9 | 005 contracts session-launch:116 / data-model:113,244 / spec:339-340 | sessionId 鍵の registry を X-5 で作り直さずに使う | **本 feature** — registry を流用し、世代 (BE-007)・枠の占有 (BE-008)・異常終了 (BE-020) を足す |
| 10 | 005 platform-boundary design-gate:50 / pr-gate round1:30 | 単一インスタンス仮定を sessionId 鍵 Map で X-5 一般化 | **本 feature** — #9 と同じ |
| 11 | 005 platform-boundary pr-gate round2 L-001 | `MAX_QUEUED_PROMPTS` が最古を無通知 drop (背圧本設計は X-5) | **据え置き**。spec の背圧はセッション間の分離 (FR-002) と状態通知のバッチであり、1 セッション内のプロンプト件数は対象外。renderer の送信待ちキュー (X-2) が件数を絞っている。roadmap の X-6 行に「worker 内キュー超過の通知」を 1 行足す (SH-090) |
| 12 | 005 security pr-gate (round1-5) L-001 / quickstart-results:133 / 008 plan:130 / 008 spec:406 | `requestId` の予測不能化 (X-5) | **本 feature** — spec FR-007。`perm-${seq}` を `globalThis.crypto.randomUUID()` に替える (BE-002。`node:crypto` の import 許可は要らない) |
| 13 | 005 spec:205,451,482 | 多重・semaphore・IPC バッチ化・背圧設計は X-5 | **本 feature** (背圧は #11 と I-1 へ)。AD-023 Open Question の `SessionStore.append` 背圧は I-1 |
| 14 | 006 data-model:15 / 006 spec:274,401 | composer の sessionId 鍵・thread 切替時の下書き保持は X-5 以降 | **本 feature** — spec FR-010 (FE-010) |
| 15 | 008 arch design-gate:97,146 / gate-r2 arch:83 | X-4 の配線を違反と読む後続 | 該当なし (AD-041 (b)(e)(f) で読み替え済み。本 feature は X-4 の起動前段・spec 構築を変更せずに使う) |
| 16 | 008 gate-r1 platform-boundary M-004 | provider ごとの helper ファイル上書きは X-5 で壊れる | 該当なし (helper 生成は X-7 へ繰り越し済み。008 plan:121) |
| 17 | 008 gate-r1 po:96 | 上限 (コスト・ターン数) をプリセットに保存したい | 該当なし (起動設定の「上限」軸は X-6。同時実行数の上限とは別物 — glossary で語を分ける。SH-002) |
| 18 | 008 po pr-gate round1:189 | X-6 は X-5 に依存 | 該当なし (roadmap の依存関係の確認であり義務ではない) |
| 19 | scripts/constitution/allowlists.mjs:231-243 (`PROCESS_SPAWN_MODULES`) | `session-spawner.ts` / `sdk-agent-session.ts` を実名で登録 | **本 feature** — 登録名は維持し、コメントを「単一 supervisor の fork」「セッションスレッドの spawn」に改める。調停役スレッド `src/agents/supervisor.ts` は Worker を起こすが子プロセスは起こさないので登録しない (SH-010) |
| 20 | allowlists.mjs:319 (`AGENT_SDK_ALLOWED_CALLS`) | `query` を呼ぶのは `sdk-agent-session.ts` | 変更なし |
| 21 | allowlists.mjs:441-444 (WSL を名指さない app モジュール) | `session-launch-service.ts` / `session-spawner.ts` | 変更なし。新設の `session-status-relay.ts` を足す (SH-010) |
| 22 | eslint.config.mjs:108 (`AGENT_SESSION_SPAWN_FILE`) | spawn 例外を `sdk-agent-session.ts` 1 ファイルに限定 | 変更なし。Node 標準モジュールの許可に `node:worker_threads` (`supervisor.ts` / `sdk-agent-session.ts`) を足す (SH-005。実装前に入れる) |

## 実装方針 (レイヤ別)

### domain

- **`domain/session/concurrency.ts` (新設)**: `MAX_CONCURRENT_SESSIONS = 10`。
  - `canReserve(occupyingCount, reservedCount): boolean` — `occupying + reserved < 10`
  - 枠を占める数は registry の `claudeAlive` で数える (run-state を見ない。spec FR-005)
- **`domain/session/status-update.ts` (新設)**: 状態通知。名前は R-2 の `SessionSummary` と衝突させない。
  - 型 `SessionStatusUpdate = { sessionId: string; state: SessionRunState; reasonKey: LaunchFailureReason | null; claudeAlive: boolean }`。**会話由来の文字列を持たない**
  - `isSessionStatusUpdate(value)` — 形の述語 (sessionId は UUID 形、state / reasonKey は enum、claudeAlive は boolean)
  - `coalesceUpdates(batch)` — 同じ sessionId は最後の通知に畳む。ただし `state: 'error'` と理由キー、`claudeAlive: false` は後続で上書きしない。`done` は終端として扱わない (`isTerminal` を使わない)
  - **`acceptBatch(registrySnapshot, generation, batch) → { accepted, next }`** — 受信規則の唯一の正本。形・現行世代・registry に在る sessionId を確かめ、`claudeAlive` は true→false の一方向だけを適用する。`accepted` は単調性を適用した後の値 (registry と renderer に同じ値が届く)
  - `synthesizeExit(sessionIds, reasonKey)` — supervisor / スレッドの異常終了時の通知を作る。調停役スレッドと main の Service の両方が呼ぶ (規則を 1 箇所に置く。AD-023 §5)
- ~~**`domain/session/pid.ts` (新設)**: `isAcceptablePid(pid, excluded: readonly number[]): boolean`~~ (**実装時の変更**: SH-000 (3) で孤児が残らず pid による回収を作らないため、作らなかった) — `Number.isSafeInteger(pid) && pid > 0` かつ excluded (自プロセス・supervisor) に含まれない。調停役スレッドと main の回収の両方が呼ぶ
- **`domain/session/agent-session.ts` (変更)**:
  - `SessionLaunchRejectReason` から `session-active` を外し、`session-limit` / `shutting-down` を足す
  - `LaunchFailureReason` に `supervisor-exited` を足す (10 種)。スレッドの例外とメモリ上限超過は既存の `process-crashed` を使う
  - `SessionControl` に `{ kind: 'end' }` を足す (穏当な終了。spec FR-011)
  - `SessionEvent` に `{ kind: 'end-forced' }` を足す (終了が期限切れで強制終了に落ちた)
  - `AgentSession` interface の `stop()` を削除し、操作語彙を `SessionControl` と一致させる (申し送り #7)
- **`domain/session/run-state.ts`**: 状態機械は変えない (**実装時の変更**: `fail` を `done` からも受ける — 応答待ちの間の `claude` の異常終了を `error` にするため。SH-022 で発見。spec FR-015 / AD-043 Decision 3 で X-1 data-model §4 を読み替える)。`end` は `kill` と同じ遷移 (→ `done`) とし、`claude` が終わったかどうかは `claudeAlive` で区別する。`isActive` は使い道が無くなるので削除する (BE-001)

### agents (supervisor)

- **`src/agents/supervisor-protocol.ts` (新設)**: 調停役スレッドが扱う**メッセージのエンコード / デコード**を置く唯一の場所。
  - `decodeSupervisorRequest(line)` — main (または標準入出力) からの `launch { sessionId, spec, options }` / `control { sessionId, control }` だけを受け付ける。kind は enum、sessionId は UUID 述語、control は既存の `decodeControl` 相当で検証する。**本文 (`event`) の kind は受け付けない**
  - `decodeWorkerMessage(value)` — セッションスレッドからの構造化メッセージ (`status` / `child-exited` / `ended`。**実装時の変更**: `spawning` / `spawned` は SH-000 (3) により持たない) を検証する。`event` は `{ kind: 'event', payload: string }` の**形だけ**を確かめ、payload の中身を読まない
  - `encodeSupervisorEvent(...)` — `status-batch` / `thread-ended` / `event` (標準入出力経路の本文行。**実装時の変更**: `spawned` / `child-exited` は main へ送らず、`child-exited` は状態通知の生存フラグ false の即時送信になった) を `JSON.stringify` で 1 行にする。**文字列連結で組まない** (本文の改行・引用符で行を偽造させない)
- **`src/agents/transport.ts` (変更)**: **経路種別は公開しない** (AD-030 §5 を守る)。代わりに、launch を受けたときの**本文の出口**を transport が作る。
  - `onMessage(listener: (line, ports) => void)` — parent-port 経路では受信 port を渡す。stdio 経路の `ports` は常に空
  - `openBodySink(ports, toLine): BodySink | null` — parent-port 経路では port がちょうど 1 本なら port へ `postMessage(payload)` する sink を返し、無ければ `null`。stdio 経路では `toLine(payload)` の結果を 1 行書く sink を返す。`BodySink.post(payload: OpaqueBody)` / `close()`
  - 既存の列挙 (`enumerate-sessions.ts`) の呼び出しを壊さない
- **`src/agents/supervisor-core.ts` (新設・純粋)**: `runSupervisor({ transport, createWorker, timer, exit })` (**実装時の変更**: `killPid` / `selfPid` は SH-000 (3) により持たない。標準入力が閉じたときの終了のために `exit` を受ける) の本体。SDK も `worker_threads` も import しない (fake の transport / Worker / 時計で単体を書く)。**経路を知らない**。
  - `launch` → `transport.openBodySink(ports, toLine)` が `null` なら拒否し Worker を起こさない → `createWorker(workerEntryPath)` → **最初の message で spec / options を渡し、以後 spec の参照を持たない**。`workerData` は使わない
  - `control { sessionId }` は宛先表で該当 Worker にだけ渡す。未知の sessionId は捨てる
  - Worker からのメッセージは `decodeWorkerMessage` を通し、**Worker インスタンスに割り当てた sessionId で付け直す** (Worker が名乗る sessionId は使わない)
  - 本文 (`event`) は `OpaqueBody` のまま `sink.post(payload)` する。**`JSON.parse` しない**。port からの inbound は登録しない (一方向。AD-036 §2。sink は送信専用)
  - 状態通知はバッチャに入れ、100ms 窓ごとに `coalesceUpdates` を通して `status-batch` を 1 行送る。セッションスレッドが送る `claudeAlive` は常に true であり、**false にするのは調停役スレッドだけ** (下の 3 つ)
  - `child-exited` を受けたら `claudeAlive: false` を記録する (renderer への送り方は R3-M-01 の決着に従う)
  - **Worker の終了の判定は `ended` を受け取ったかどうかで行う** (run-state の「終端」では判定しない):
    - `ended` を受けた後の終了は正常終了
    - `ended` 未着の終了は異常終了。`synthesizeExit([id], 'process-crashed')` を送る
    - **どちらの場合も**、その時点でまだ `claudeAlive: true` なら false にする (R3-H-03。Worker が終われば子は残らない — SH-000 (3a)(3d))。最後に `thread-ended` を送る
  - **pid による回収は持たない** (SH-000 (3) で、Worker の terminate・メモリ上限超過・supervisor の kill / 強制終了のいずれでも孤児が残らなかった)。`spawned` / `spawning` / `killPid` の帳簿は作らない
  - `transport.onClosed` (標準入出力経路で親が消えた) で、全 Worker に kill を送り、子の exit (期限 3 秒) を待って自らも終了する
  - 例外や破棄した値の中身はログに出さない。出してよいのは理由キーと件数だけ
- **`src/agents/supervisor.ts` (新設・supervisor entry)**: `runSupervisor` に本物の `createTransport()` / `new Worker(path, { resourceLimits })` (env 未指定・`SHARE_ENV` 不使用。`resourceLimits.maxOldGenerationSizeMb` は 1024 [ASSUMED]) / タイマ / `process.exit` を渡すだけ (**実装時の変更**: `process.kill` / `process.pid` は SH-000 (3) により渡さない)。worker entry のパスは**起動引数** (`--worker-entry=<abs>`。位置に依存しない。SH-000 (4a)。必須) で受ける — main は `?modulePath` で得たバンドル済みのパスだけを渡す (IPC・env・利用者入力から決まらない)。単独起動では利用者が明示的に渡す
- **`src/agents/sdk-agent-session.ts` (変更・セッションスレッド)**:
  - 入口を `process.parentPort` から `worker_threads.parentPort` に替える。1 Worker = 1 セッションは変えない
  - 本文は `parentPort.postMessage({ kind: 'event', payload: JSON.stringify(event) })` で送る (直列化はセッションスレッドで行う)
  - `state` / `failure` を出すたびに状態通知 (`claudeAlive: true`) を送る。子の `exit` で即時に `{ kind: 'child-exited' }` を送る (**実装時の変更**: `spawning` / `spawned` は SH-000 (3) により送らない。終了処理の外での子の終了は `process-crashed` の失敗にする — SH-022 で発見)
  - `process.on('uncaughtException' / 'unhandledRejection')` で、保持している子を kill し、`failure` を送ってから `ended` を送って終わる (FR-012)。この経路は `ended` を送るので調停役は正常終了と扱うが、run-state は `error` になる
  - `end`: 状態が `done` / `interrupted` のときだけ受け付ける。プロンプトキューを閉じて SDK の `query()` を終わらせ、子の exit を待つ (期限 3 秒 [ASSUMED])。期限を過ぎたら `{ kind: 'end-forced' }` を本文に流してから kill に落ちる。それ以外の状態では何もしない
  - kill は `process.exit(0)` をやめ、子の kill → 子の exit 待ち (期限 3 秒) → `{ kind: 'ended' }` を送る。調停役スレッドが `worker.terminate()` する
  - terminal error (`provider-error` / `stream-protocol-error`) と launch のデコード失敗でも、終端の通知を送った後に `{ kind: 'ended' }` を送って終わる (Worker を残さない)
  - 承認往復の純粋部分 (`requestId` の生成器と pending の照合) を `session-core.ts` に切り出す。生成器は `globalThis.crypto.randomUUID()` を注入する。pending に無い・応答済みの `requestId` の決定は SDK のコールバックを解決しない
- **SH-000 の結果による分岐** (AD-043 の Decision を、proposed のうちに選んだ分岐の文へ書き換える。SH-001):
  - (2) port を Worker に渡せた場合は直送にする。このとき本文は**構造体のまま** `port.postMessage(event)` で送り (X-1 と同じ。文字列化の理由は中継を通さないことで消える)、調停役スレッドの本文中継を外す。renderer のデコーダは値 (`unknown`) を検証する形にしておき、中継の分岐では先に `JSON.parse` してから同じ検証に通す。直送の分岐では `sdk-agent-session.ts` もセッション port に listener を登録しないことを構造検査に加える
  - (3) supervisor を落としても `wsl.exe` が残らない場合は、main 側の回収経路 (`reap-wsl-launchers`) を作らない。Worker の `terminate()` で子が残らない場合は、調停役スレッドの `killPid` と `spawning` の帳簿も外す (`killPid` を外したときは、項目 19 の登録先も 0 件になる)

### main/infra — **作らない** (SH-000 (3c): supervisor を強制終了しても孤児が残らなかった。以下は記録として残す)

- **`main/infra/runtime/reap-wsl-launchers.ts` (条件付き新設)**: `reapWslLaunchers(pids): number` — supervisor の異常終了時に、記録済みの `wsl.exe` を止める。止められなかった数を返す。**WslRuntime 専用** (AD-018 の実測範囲。docker 経由は成り立たない)
  - 受け付ける pid は `isAcceptablePid(pid, [process.pid, supervisorPid])` を満たし、registry の `reapable: true` のエントリの最初の 1 件で、現行世代の supervisor から届いたものに限る
  - `child-exited` (即時) を受けた pid は記録から外す
  - **生成時刻による本人確認は行わない** (Node に API が無く、OS への問い合わせはプロセスの起動かネイティブ API を要し Principle VI / VII に当たる)。誤 kill の残余は「supervisor の異常終了から回収までの間に、記録済みの pid が再利用される場合」であり、即時の `child-exited` と世代の照合で窓を狭めたうえで AD-043 に残余として記録する
  - `session-launch-service` に deps として注入する (Service が infra を直接 import しない)

### main/app

- **`session-spawner.ts` (変更)**: per-session fork をやめ、**supervisor 接続** (`SupervisorConnection`) にする。
  - 最初の `launch` で supervisor を fork し (遅延起動)、アプリ終了まで常駐させる。fork env は curated base のまま、`stdio: 'ignore'` を維持する。起動引数に worker entry のパス (`?modulePath`) を渡す
  - `stdio: 'ignore'` で parentPort だけを購読する理由: utilityProcess の下では parentPort が必ず存在する (transport は parent-port 経路を選ぶ)。stdout を開くと、標準入出力経路の本文行が main に流れる経路を作ることになる (Principle V / IX)。AD-030 §5 訂正の「両方を購読する」は列挙のように両経路が実際に使われうるプロセスの規則であり、ここでは片方の経路が構造的に使われない
  - fork は 1 本に直列化する (fork 中の 2 件目の launch は同じ fork を待つ)。fork のたびに**世代番号**を発行する
  - `launch(sessionId, spec, options, env)` (**実装時の変更**: 引数の形) → `MessageChannelMain` を作り、port1 と launch を supervisor へ、port2 を返す
  - `onStatusBatch` / `onThreadEnded` / `onExit` を世代番号付きで公開する (**実装時の変更**: `onSpawned` / `onChildExited` は SH-000 (3) により持たない)
  - supervisor からの行は、パース前に長さの上限 (64 KiB [ASSUMED]) を掛ける。状態通知と pid だけのメタデータであり、本文は運ばない (AD-031 §2)
- **`session-launch-service.ts` (変更)**: 単一セッション不変を semaphore に置き換える。
  - registry: `sessionId → { label, folderId, claudeAlive, threadAlive, generation, reapable, pid? }` と `reserved` 数。`reapable` は起動前段の結果 (WslRuntime で起動したか) から決める
  - `launch`: 終了処理中なら `shutting-down` で拒否 → 同期区間で `canReserve` → `reserved += 1` → `await prepareLaunch` → 失敗なら `reserved -= 1` で拒否 → supervisor 接続の `launch` (fork 失敗なら `reserved -= 1` で `launch-failed`) → registry に `claudeAlive: true` / `threadAlive: true` で登録して `reserved -= 1`。上限超過は `session-limit` (プロセスもスレッドも起こさない)
  - `status-batch` は `acceptBatch` で registry を更新し、`accepted` だけを relay に渡す。`thread-ended` で `threadAlive: false` にする
  - supervisor の exit: その世代の全エントリに `synthesizeExit(ids, 'supervisor-exited')` を作って relay へ流し、`reapWslLaunchers` が注入されていれば `reapable` のエントリの pid で呼ぶ。終了コード・世代・セッション数・回収できなかった数を main のログに 1 行出す (会話由来の文字列と env は出さない)
  - `control`: sessionId が registry に在り、`threadAlive: true` の場合だけ送る (X-1 と同じ `false` 返し)
  - **`killAll()`**: 全セッションに kill を送る (supervisor は止めない)。renderer の再読み込み・クラッシュ時に呼ぶ
  - `dispose(): Promise<number>`: 1 回だけ走る (2 回目は同じ Promise を返す)。全セッションに kill を送り、全 `claudeAlive: false` か期限 (3 秒) まで待ってから supervisor を kill する。残った pid は `reapWslLaunchers` (注入されていれば)
- **`session-status-relay.ts` (新設)**: launch-service が受理した `accepted` を、`webContents.send(IPC_CHANNELS.sessionStatus, updates)` で**バッチ 1 つにつき 1 回**送る。検証は持たない (受信規則は `acceptBatch` だけ)。main は再バッチしない。supervisor の異常終了の合成は窓の外で 1 回送る (spec FR-004)
- **`session-ipc.ts` / `ipc.ts` / `validate.ts` (変更)**: `end` 制御を受け付ける。`respondPermission` の `requestId` は UUID 述語で検証する
  - **実装時の変更**: 当初は launch の handshake に一覧用の表示情報 (`label: { folderName, runtimeLabel, startedAt }`) を足し main が解決する案だったが、**renderer が起動設定 (`folderId` / `runtimeId`) を保持し、既存のフォルダ / ランタイム一覧 (`useFolders` / `useRuntimes`) から表示名を引き、起動時刻は handshake を受けた時刻**にした。handshake の DTO・preload・検証の面を増やさずに済み、会話由来でない値だけで決まる点は同じ (spec FR-004 の「main と renderer が起動設定から解決する」の範囲内)。登録解除されたフォルダは id のまま出る
- **`composition-root.ts` / `src/main/index.ts` / `e2e-capability.ts` (変更)**:
  - `dispose` を `Promise<number>` にし、`index.ts:118` (本番) と `:69` (E2E) の `before-quit` で `preventDefault` → 全体期限 (5 秒 [ASSUMED]) 付きの `Promise.race` → `app.quit()`。`quitting` フラグで 2 回目の `before-quit` は素通しする。enumerator / transcripts の同期 dispose は supervisor の後に呼ぶ
  - 主ウィンドウの `webContents` の `render-process-gone` と、確定した文書の入れ替わり (`did-navigate`) で `launchService.killAll()` を呼ぶ (spec FR-014)。取り消されうる `did-start-navigation` は使わない。`window.ts` の `will-navigate` は同一 origin を含めて全遷移を拒否する (design-gate R3-H-02)。本番ビルドの再読み込み accelerator は `@electron-toolkit/utils` の `watchWindowShortcuts` が無効にする (R3-H-01。SH-022 で実機確認)
- **E2E 経路 (`e2e-capability.ts` の作り替え)**: launch service ごとの差し替えをやめ、**本物の `createSessionLaunchService` に fake の `SupervisorConnection`** を渡す。fake は main 内で合成の本文を port に流し、状態通知を出す (既存の stub と同じ `!app.isPackaged && CLOSTA_E2E === '1'` の二重ゲートの内側)。上限の規則は本物と共有するので、`session-active` の複製は消える

### renderer

- **`features/session/running-session-store.ts` (新設・zustand vanilla)** (**実装時の変更**: 名前を glossary の Running session list に合わせ、`sessionStore` (I-1) / SDK の `SessionStore` (AD-021) との同名を避けた。寿命・注入は `running-session-context.ts`、表示用の純関数は `session-view.ts`): `sessionId → LiveSessionState` (X-1 の `LiveSession` の中身 + `folderId` + `draft` + 送信待ちキュー + `ending`) と、一覧用の `statuses`・`selectedId`。
  - **port の受け渡し**: `window` message の origin / source の検証は X-1 の形 (`useLiveSession.ts:174`) のまま store に移す。handshake 前に届いた port は `Map<sessionId, MessagePort>` に待避し、`launchSession` の handshake が返した sessionId とだけ結び付ける。起動要求を出していない sessionId・閉じた sessionId の port は `close()` して捨てる
  - 本文は `decodeSessionEvent(value)` を通す (中継の分岐では先に `JSON.parse` を try で囲む。`kind` を enum で検証する。失敗したら破棄し、他のセッションに影響させない)
  - **表示中のセッション以外の更新は、表示中の Thread を再描画させない** (selector をセッション単位に切る)
  - port が close / error になっても、そのセッションの transcript は消さない
  - `onSessionStatus` は一覧の行だけを更新する
  - **`ended = statuses[id].claudeAlive === false` を導出する**。一覧のラベル (`done` かつ `!ended` → 応答待ち / `ended` → 終了済み)、操作の出し分けはこの値で行う。composer の無効化と送信待ちキューの取り消しは `error || ended || killed || ending` で行う (R3-H-04)。ローカルの `killed` は「強制終了しました」の文言と、終了の通知が届くまでの即時の無効化に使う
  - **表示中セッションの描画コストを件数に依存させない** (実装時に追加。SC-003 の実測で判明): assistant-ui の ThreadClient はメッセージ配列が変わるたびに全件の MessageClient を作り直すため、(1) assistant-ui に渡すのは末尾 100 件の窓 (`MESSAGE_WINDOW`。省略分は「さらに表示」で辿れ、本文は store に全件残す) / (2) 仮想化の行キーと高さのキャッシュをメッセージ id に (`thread.aui.tsx` の `getItemKey`) / (3) 下書きは再描画を起こさない保持 (`getDraft` / `setDraft`) / (4) composer を memo 化して本文の更新で自動リサイズを走らせない / (5) 一覧の行は使うフィールドだけを選ぶ
  - **送信待ちキューの完了 trigger (busy の立上り / 立下り) はストアが状態の変化で駆動する** — 表示していないセッションでも、応答の完了で積んだ入力が送られ、終端では取り消しになる (FR-010)
  - 起動に成功したら行を足して `selectedId` にする。閉じると行と保持を消し、表示中の行なら `selectedId` を外す
- **`useLiveSession.ts` (変更)**: `useLiveSession(sessionId)` に変え、store から 1 セッション分を読む。送信・承認・中断・終了・kill は引数の sessionId に向ける (送信時点の表示中セッション。FR-010)。**unmount→kill と reset→kill を撤去する** — セッションの寿命は store と main (`dispose` / `killAll`) に一本化する (spec FR-008)
- **`SessionScreen.tsx` (変更)**: 一覧 + 表示中セッションの 2 ペイン。既存の Thread / 承認カード / FailureBanner は表示中セッションに対して描く。composer の `isDisabled` は `runState === 'error' || ended`、送信待ちキューの終端判定 (`terminal`) にも `ended` を含め、`notifyCancelled` にする
- **`SessionList.tsx` (新設) — assistant-ui の ThreadList で組む** (Principle XIII。実装時に独自 list から載せ替えた): R-2 のセッション一覧と同じく `thread-list.aui.tsx` の `ThreadListRoot` / `ThreadListItemsByKey` と `ExternalStoreThreadListAdapter` (`running-thread-list.ts`: `threadId` = `selectedId` / `onSwitchToThread` = 切り替え / `onSwitchToNewThread` = 新規起動) を使う。`SessionScreen` はランタイムを 1 つにし、表示中セッションの本文・状態・キューと `adapters.threadList` を渡す (adapter の `threadId` が変わると assistant-ui がスレッドを作り直すので、下書きの復元は切り替わった後に行う)。`thread-list.aui.tsx` には R-2 に影響しない差分だけを足した (`renderActions` と、R-2 が外していた `ThreadListNew` の復元)。行 = 表題 (フォルダ表示名)・ランタイム・起動時刻 (秒まで)・状態ラベル、操作は行の Trigger の外に置く。「閉じる」は `onDelete` に割り当てない (正本の削除ではない。Principle X)。訳文は `labels.ts`
  - 終了: `(done | interrupted) && !ended`。`ending` の間は押せない
  - 停止: `launching` / `awaiting_permission` は強制終了、`running` は中断と強制終了 (**実装時の変更**: 承認待ちの中断は出さない — X-1 は中断を `running` だけに出し、承認待ちは承認カードの「拒否」で止める。pr-gate R1 po M-003)
  - 終了は最初のプロンプト待ち (起動済み・未送信の `launching`。行の状態は「プロンプト待ち」) にも出す (**実装時の変更**: pr-gate R1 po H-001)
  - 閉じる: `ended`
  - `end-forced` を受けたら、行 (と表示中なら FailureBanner) に「強制終了に落ちた」旨を示す
- **`LaunchDialog.tsx` (変更)**: store の `!ended` のセッションの `folderId` 集合を受け、同じ登録フォルダを選ぶと警告を出す (起動はブロックしない)。`session-limit` の拒否文言は「応答待ちのセッションを終了する (または強制終了する) と起動できる。中断だけでは空かない」
- **E2E / 計測** (`e2e/multi-session.spec.ts`): 上の E2E 経路で、2 本の起動 → 切り替え → 送信 (SC-006)、11 本目の拒否 (SC-001)、10 本の負荷 (SC-003 の定義どおり。上限いっぱいの part は `BODY_MAX_BYTES`)

## ADR

> **SH-000 の結果 (2026-10-01、[quickstart-results.md](./quickstart-results.md))**: (1) 成立 / (2) 不成立 → Decision 2 は中継の分岐 / (3) 孤児なし → Decision 5 は「回収経路を作らない」 / (4a) argv の位置を測定済み、(4b) ビルドと asar は BE-006 / BE-007 で測る。SH-001 で Decision 2 / 5 をこの分岐の文に書き換える。

**AD-043: 単一 supervisor + セッションスレッドと同時実行数の上限** (status: proposed → **2026-10-01 accepted**。**SH-000 の実測 4 項目が揃い、Decision 2 / 5 を選んだ分岐の文に書き換えた時点で accepted**。採らなかった分岐は Considered options に移す。(1) が成立しなければ proposed のまま書き直して利用者に諮る)

- **Decision**:
  1. supervisor は単一の `utilityProcess` とし、セッションごとに `worker_threads` の Worker (セッションスレッド) を起こす。読み替えるのは AD-023 §1 (agents の寿命はセッションと同じ → supervisor は常駐、セッションスレッドがセッションと寿命を共にする) と §6 (per-session プロセス)、AD-036 §1。§6 の 3 根拠の扱い: パースの分離は Worker で満たす / **プロセス単位のクラッシュ隔離は失い、その代償を US-4 で扱う** (Worker の `resourceLimits` でメモリ超過だけはスレッド単位に閉じ込める) / 単独起動は supervisor 1 プロセスの単位になる。AD-030 §5 (本体は経路を知らない) は読み替えない — 本文の出口も transport が作る。AD-023 §3 の `AgentSession` の例示 (`stop()`) は古くなる旨を注記する
  2. 本文の形 (SH-000 (2) の結果で一方に確定する): 中継の分岐では、セッションスレッドが文字列に直列化し、調停役スレッドは `OpaqueBody` として transport の本文の出口へ渡す (文字列コピーは許容。part ごとに `BODY_MAX_BYTES` で有界)。直送の分岐では、構造体のまま port へ送る。どちらの分岐でも調停役スレッドは本文を JSON として解釈しない。制御行と Worker メッセージのデコードは `supervisor-protocol.ts` に限り、本文の中身を読まない
  3. 同時実行数は 10 に固定し、枠は予約から `claude` の終了まで占める。超過は `session-limit` で拒否する。`session-active` を廃止する (X-1 FR-019 / SC-011、X-4 US-1 AC7 の読み替え)。応答待ち・中断済みのセッションに穏当な「終了」を足す
  4. 状態通知だけを supervisor→main→renderer で運び、supervisor の 100ms 窓でバッチ化する。sessionId は送信元の Worker で付け、`claudeAlive` を false にするのは調停役スレッドと main だけとする。main の受信規則は domain の `acceptBatch` 1 つ (世代・単調性)。本文の経路は AD-034 / AD-036 §2 のまま
  5. kill の主体 (AD-036 §3。SH-000 (3) の結果で一方に確定する): 主たる経路は変えない (セッションスレッドが保持する子を kill する)。足すのは異常終了時の回収経路だけで、どちらも SH-000 (3) で孤児が残る場合に限って作る。Worker の異常終了 (`ended` 未着) では、調停役スレッドが記録済みの pid を**その場で**止める。supervisor の異常終了では、main が `reapable` なエントリの pid を止める。pid は `isAcceptablePid` で検証し、即時の `child-exited` で記録から外し、世代を照合する。**生成時刻による本人確認は行わない** (取得にプロセスの起動かネイティブ API を要するため)。pid 再利用による誤 kill の残余を記録する。回収は WslRuntime 専用 (AD-018)
  6. supervisor は最初の起動要求で遅延起動し、アプリ終了まで常駐する。異常終了後は次の起動要求で 1 本だけ起こし直す。単独起動の形は `node <supervisor> --worker-entry=<worker>` で、worker entry のパスは必須の起動引数とする (main は `?modulePath` のパスだけを渡す)。Principle VII Statement / AD-010 の字面 (`node dist/supervisor.js`) との差は SH-092 の PATCH 案で諮る
  7. Worker は env 未指定で起こし、`SHARE_ENV` を使わない。資格情報を含む spec は最初の message でだけ渡す。Worker には `resourceLimits` を指定する
- **Consequences**: メモリは Node 1 プロセス + Worker × N。supervisor のネイティブクラッシュで全セッションが落ちる (US-4 で理由付きに示す)。`check.mjs` の許可リストは名前を維持し、新しい検査項目 (調停役スレッドの `JSON.parse` / pid 指定 kill の置き場 / `SHARE_ENV` と Worker の `env`) を足す。Constitution Principle IX の Good example「パース済みの構造体を MessagePort で直送」は中継の分岐で事実上変わるので、Verification の現状の制約と Example の扱いを PATCH する
- **Confirmation**:
  - accepted の条件 (SH-001 で書く): SH-000 の実測 4 項目 (値と `quickstart-results.md` の参照) と、Decision 2 / 5 で採った分岐
  - 実装後に追記する (訂正節ではなく「実装の確認」として日付つきで): SC-002 の構造検査、SC-009 の単体・ビルド出力の検査・quickstart、quickstart の孤児 0

## 機械強制の変更

| 対象 | 変更 | 根拠 |
|---|---|---|
| `eslint.config.mjs` Node 標準モジュールの許可 | `node:worker_threads` を `src/agents/supervisor.ts` / `sdk-agent-session.ts` に許可 (`boundaries/files` と `no-restricted-imports` の 2 表記を揃える)。**実装前に入れる (SH-005)** | 申し送り #22 |
| `scripts/constitution/allowlists.mjs` `PROCESS_SPAWN_MODULES` | 登録名は維持。コメントを単一 supervisor / セッションスレッドに更新。新しい登録はしない | 申し送り #19 / Principle VI |
| 同 WSL を名指さない app モジュール | `src/main/app/session-status-relay.ts` を追加 | 申し送り #21 |
| `check.mjs` **項目 18 (新設)** — 調停役スレッドの本文非解釈 | `src/agents/supervisor.ts` / `supervisor-core.ts` (調停役スレッドのモジュールのうち `supervisor-protocol.ts` 以外の全部) で `JSON` の `parse` への**参照**が 0 件。呼び出しでなく参照で数える (`JSON.parse` / `JSON['parse']` / `const { parse } = JSON` / `Reflect.apply(JSON.parse …)`)。違反 fixture 4 形 + `tests/rule-fixtures/expected.mjs`。`UNDETECTED_NOTES` に「置き場を見るだけで、どのスレッドで評価されるかは見ない」「多段の別名代入は拾わない」を記録 | SC-002 / AD-031 §2 |
| `check.mjs` **項目 19 (新設)** — pid 指定 kill の置き場 | `process` の `kill` への**参照** (`process.kill` / `process['kill']` / `const { kill } = process` / `.call` / 参照渡し) を書けるモジュールの許可リスト。SH-000 の結果で `supervisor.ts` / `reap-wsl-launchers.ts` を実名登録する (作らなければ 0 件。**実装時の結果**: 0 件で新設。`node:process` からの import 形も数える)。違反 fixture 4 形 | AD-043 Decision 5 |
| `check.mjs` **項目 20 (新設)** — Worker の env | `src/` で `SHARE_ENV` が 0 件、かつ `new Worker(` の第 2 引数に `env` キーが無い。違反 fixture 2 形。式で組んだ options は拾えないので `UNDETECTED_NOTES` に記録 | AD-043 Decision 7 / Principle V |
| ビルド出力の検査 (SH-022) | supervisor と worker のチャンク、およびそれらが静的に読む全チャンクの `require` / `import` に `electron` 0 件・外部依存は SDK だけ、を件数で `quickstart-results.md` に記録する。ビルド後にしか走らないので check:constitution の項目にはしない | SC-009 / `.dependency-cruiser.js:183-189` の代替証拠 |
| `.dependency-cruiser.js` | 変更しない。agents の Node 標準モジュール禁止が import 文の層だけであること (`require()` / `getBuiltinModule` を agents で見ない) は既存の穴として `UNDETECTED_NOTES` に記録する (scope: system) | 既存の穴 |

## Risks / 未確定

| # | リスク | 対処 |
|---|---|---|
| R-01 | Worker 内で SDK `query()` / `child_process.spawn` が動かない (SH-000 (1)) | 実装に進まない。AD-043 は proposed のまま書き直し、「supervisor + セッションごとの子プロセス」に切り替えるかを利用者に諮る |
| R-02 | 文字列の中継と renderer の `JSON.parse` が重い | part ごとに `BODY_MAX_BYTES` で有界で、tool_result は live 表示に載らない。SC-003 の E2E で上限いっぱいの part を流す。5MB の SDK 出力のパースはセッションスレッドの負荷として SC-007 の単体と quickstart で見る |
| R-03 | 100ms の窓で、状態の反映が最大 100ms 遅れる | 許容。枠の解放は即時の `child-exited` で反映する。テストでは窓を注入する |
| R-04 | before-quit の非同期化で終了が最大 5 秒遅れる | 期限で打ち切って supervisor を kill する。終了中の表示は出さない (5 秒以内のため。出す場合は `ui` に申し送る) |
| R-05 | 終了したセッションを閉じないと、renderer の保持が増え続ける | 上限は設けない (spec Out of Scope。意図的な判断)。枠を占めるセッションは 10 で頭打ち。`error` 後の Worker は終わらせるので supervisor 側には残らない |
| R-06 | Worker の `terminate()` や supervisor の異常終了で子が残る (SH-000 (3)) | 残る場合だけ pid による回収経路を作る (AD-043 Decision 5)。生成時刻の本人確認ができないため、pid の検証・即時の exit 通知・世代の照合で窓を狭め、残余を ADR に記録する |
| R-07 | renderer の再読み込みで全セッションが止まる (開発時のリロードを含む) | 意図した挙動 (spec FR-014)。繋ぎ直しは持たない (Out of Scope) |

## Project Structure

```text
src/
├─ domain/session/
│  ├─ concurrency.ts            # 新設: 上限 10 と枠の判定
│  ├─ status-update.ts          # 新設: 状態通知・検証・畳み込み・受信規則 (acceptBatch)・異常終了の合成
│  ├─ (pid.ts は作らない — SH-000 (3))
│  ├─ agent-session.ts          # 変更: session-limit / shutting-down / supervisor-exited / end / end-forced / stop() 削除
│  └─ run-state.ts              # 変更: isActive 削除、fail を done からも受ける (実装時の変更)
├─ agents/
│  ├─ supervisor.ts             # 新設: supervisor entry (結線のみ)
│  ├─ supervisor-core.ts        # 新設: 調停役スレッドの本体 (純粋・経路を知らない)
│  ├─ supervisor-protocol.ts    # 新設: 制御行と Worker メッセージのエンコード / デコード
│  ├─ sdk-agent-session.ts      # 変更: セッションスレッド化・本文の直列化・end・異常終了処理
│  ├─ session-core.ts           # 変更: 承認往復の純粋部分 (requestId 生成器の注入)
│  └─ transport.ts              # 変更: parent-port 経路で port を運ぶ・本文の出口 (openBodySink)
├─ main/
│  ├─ index.ts                  # 変更: before-quit の非同期化と再入ガード
│  ├─ infra/runtime/reap-wsl-launchers.ts  # 条件付き新設 (SH-000 (3) で孤児が残る場合)
│  └─ app/
│     ├─ session-spawner.ts         # 変更: 単一 supervisor 接続 (直列 fork・世代)
│     ├─ session-launch-service.ts  # 変更: semaphore / 枠の占有 / 世代 / killAll / 非同期 dispose
│     ├─ session-status-relay.ts    # 新設: 受理済みの状態通知の転送
│     ├─ e2e-capability.ts          # 変更: 本物の起動調停 + fake の supervisor 接続
│     └─ session-ipc.ts / ipc.ts / validate.ts / composition-root.ts
├─ preload/index.ts             # 変更: onSessionStatus / endSession を capability に追加
└─ renderer/src/features/session/
   ├─ running-session-store.ts / running-session-context.ts / session-view.ts  # 新設
   ├─ session-event-decoder.ts  # 新設: 本文の復元と検証
   ├─ RunningSessionList.tsx / useRunningThreadList.ts  # 新設
   ├─ useLiveSession.ts / SessionScreen.tsx / LaunchDialog.tsx / labels.ts  # 変更
e2e/
├─ multi-session.spec.ts        # 新設: 2 本の切り替え / 11 本目の拒否 / 10 本の負荷
└─ support/launch.ts / launch-dialog.spec.ts / composer-screenshot.spec.ts  # 変更 (SH-011)
scripts/constitution/           # 変更: 項目 18〜20 / allowlists
tests/rule-fixtures/            # 変更: 項目 18〜20 の違反 fixture と期待表
docs/
├─ decisions/0043-single-supervisor-session-threads-and-session-limit.md
├─ glossary.md / domains/session/charter.md / roadmap.md / discovery.md
└─ (.specify/memory/constitution.md — Principle IX / VII の事実追随を PATCH。人間の承認後)
```
