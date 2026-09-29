# Design Gate — Track D (security-reviewer)

**Run**: 2026-09-27 · read-only

## 初回読了 viewpoint
- FR/SC: security 観点で重い経路 = FR-004/005/006 (queue→次ターン送信、IPC 再利用) / FR-007/008 (下書きメモリ保持・境界非越え) / FR-009/010/011 (新規 CI E2E)。Principle V = FR-008。
- A. 認可/認証/secret/境界 hardening: Critical:0 High:1 Medium:0 Low:1
- B. 入力検証/injection/XSS/CSP: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件/Charter drift: 該当なし (architecture owner)
- D. Constitution/ADR drift: 該当なし (AD-034/037/036 と整合)
- E. User Story/SC/AC/UX: 該当なし (po owner)
- F. 命名/module/lint hookup: 該当なし (convention owner)
- G. optional reviewer 範囲: 該当なし
- H. テスト/coverage/observability/regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約
queue 送信経路は X-1 の検証済み sendPrompt (main で UUID+非空+バイト長上限検証。session-ipc.ts:134,141-142) を再利用し新規未検証 IPC は無い。下書き/queue は data-model/tasks でメモリ内限定・境界非越えと規定。既存 session feature にログ出力 0 件、main handleSendPrompt も text 非ログ。主要指摘は新規 CI E2E ハーネスの資格情報境界が設計文書で未定義。

## Findings

### [High] IME E2E / 日本語スクリーンショットの新規 CI ハーネスの資格情報境界が未定義 (H-001)
- 観察: research R-04/R-05 は E2E を _electron.launch でアプリ起動とする。SC-001 は有効 (isDisabled:false) な active phase の live 状態を要し、それには launchSession 成功 = 実行中 WSL runtime と Claude Code 認証が要る。spec/plan/research/quickstart/data-model のどこにも E2E がこの状態を real な資格情報なしで到達する方法 (capability/session 層 stub) の記述が無い。
- 同種事象探索: credential/secret/token/auth/認証/env in specs/006 = 1 件 (plan.md:159 下書き文脈、E2E 無関係) → E2E ハーネスの資格情報記述 実質 0 件。
- リスク: 沈黙により実装が「CI に real 資格情報を注入して live 起動」に流れると (1) CI に長期資格情報を持ち込む面 (Principle V の趣旨違反)、(2) 基準画像が config dir/実会話を巻き込む、(3) 外部 API 実接続の不安定・コスト。stub 前提なら安全だが未文書化でブレる。
- Action: research R-04/R-05 (or 新規 ADR) に「capability 層 (window.closta = launchSession/sendPrompt) を stub し real 認証・WSL・外部 API なしで有効 composer 到達」を明記。既存 src/renderer/src/test-support/capability.ts を E2E でも使える形に。real 資格情報を CI env/secrets に置かないことを FR-011 の非機能条件に固定。基準画像が会話/config を含まないことをガバナンスに追加。
- 根拠: Principle V / AD-037 D3 / CWE-798 / OWASP CI/CD SEC。

### [Medium] plan の Principle V「ログ走査 (会話由来文字列混入 0)」検証を実装する task/自動検査が無い (M-001)
- 観察: plan.md:159 は Principle V 検証を「ログ走査」と宣言。data-model/tasks は下書き/queue を「ログ・永続層・IPC に出さない」と設計制約に書くが検出する自動検査 task が tasks に無い。T026 の check:constitution の V 自動検査は SQLite 秘密カラム/env ログのみで会話由来テキストのログ混入を見ない。queue の error/interrupt 経路 (FR-006) は新規例外・状態遷移を持ち込む。
- 同種事象探索: console.*/logger. in features/session = 0 件 (現状混入なし → Medium)。
- Action: (a) queue/draft slice (T004/T021) に「例外・状態遷移で text を console/Error に含めない」テストを 1 件、または (b) plan.md:159 の「ログ走査」を実行する task を追加。plan の宣言と tasks の実体を一致させる。

### [Low] queue/draft の新規表示面 (QueueItemPrimitive) に対するエスケープ回帰テストが無い (L-001)
- 観察: T014 は queue を QueueItemPrimitive で表示 = 新規ユーザ制御テキスト表示面。現状 React 自動エスケープで実害低だが、AD-034「生 HTML 非描画」境界を新規表示面で固定する回帰テストが tasks に無い。
- Action: T011/T020 に「HTML/markdown 風メタ文字を含む queue/draft がリテラル表示され DOM に要素注入されない」assert を 1 件。根拠 AD-034/CWE-79。

### [Low] 新規 devDependency Playwright の postinstall / ブラウザ取得の供給網管理が未指定 (L-002)
- 観察: T001 は Playwright を追加。E2E は _electron.launch でアプリ同梱 Chromium を使うため独立ブラウザ取得は本来不要だが plan/research が触れていない。
- Action: research R-04 に「_electron.launch はアプリの Electron/Chromium を使い playwright install の独立ブラウザ取得はしない (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD 相当)」と lockfile pin を明記。根拠 Principle VI 周辺 / OWASP A06。

## スコープ注記 (owner 外)
- queue の double-queue 意味論 (agents か renderer が still_queued/cancelled を所有するか) の整合は architecture-reviewer (C/D) owner に引き継ぐ。security 面では新規 IPC を作らず既存 sendPrompt 検証を通るため A/B 指摘にしない。

## 同種事象探索 cascade summary
| 指摘 | Grep | 該当 | path:line |
|---|---|---|---|
| H-001 | credential/secret/token/auth/env (specs/006) | 1 (E2E 無関係) | plan.md:159 |
| H-001 | stub/fake/mock/launchSession/capability (research) | 4 (launch stub 0) | research.md:13,15,23,69 |
| M-001 | console.*/logger. (features/session) | 0 | (現状混入なし) |
| L-001 | dangerouslySetInnerHTML/innerHTML/QueueItemPrimitive (src/renderer) | 0 | (未実装) |

## Verdict
Critical: 0 / High: 1 / Medium: 1 / Low: 2
