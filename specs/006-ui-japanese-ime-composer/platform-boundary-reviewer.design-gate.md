# Design Gate — Track E (platform-boundary-reviewer)

**Run**: 2026-09-27 · read-only

## 初回読了 viewpoint
- FR/SC: FR-004/005 (queue capability / session.send 再利用) / FR-008 (下書きメモリ限定) / FR-009-011 (E2E ハーネス + CI + 日本語フォント) / SC-001 / SC-006。
- A. 認可/認証/secret/プロセス hardening: 該当なし (security owner)
- B. 入力検証/injection/XSS/CSP: 該当なし (security owner)
- C. Charter/Glossary drift: 該当なし (runtime/isolation charter 非 touch)
- D. Constitution/ADR drift: Critical:0 High:1 Medium:0 Low:0
- E: 該当なし (po owner)
- F. 命名/module/lint hookup: Critical:0 High:0 Medium:1 Low:1
- G: 該当なし
- H. テスト/coverage/regression: Critical:0 High:1 Medium:0 Low:0

## スコープ要約
本 reviewer 対象は runtime/isolation 境界。本 feature はそこを直接触れないため findings は「新規テスト基盤 (Playwright/E2E) の lint/検証ルール網羅性」「E2E ハーネスと CI provisioning の Principle VI 境界」「有効 composer 到達性のテスト戦略」に集中。パス型消失 (PB-1)・ランタイム単一インスタンス (PB-2)・多段パス変換 (PB-5)・権限ゲート迂回 (PB-4) は対象なし。

## Findings

### [High] FR-011 の日本語フォント provisioning が Principle VI の機械検証の死角に落ちる (H-001)
- 観察: FR-011/Edge case (spec.md:198)/research R-04 が「CI で日本語フォントを用意」とする。Constitution VI 検証スコープ (constitution.md:441-444) は「CI 定義を含める」と宣言するが実体 allowlists.mjs:12 の SCAN_ROOTS=['src','scripts']、SCAN_FILES (18-24) に .github/workflows/verify.yml を含まない。
- リスク: 本 feature は初めて CI ジョブに環境 provisioning (Electron 起動+日本語フォント) を持ち込む。実装者が choco/apt/sudo でフォント導入すると VI (NON-NEGOTIABLE) 違反だが check.mjs 項目 1 は verify.yml を走査せず機械検証が緑のまま通過。
- Action: (a) FR-011 を「リポジトリ同梱フォント (e2e/ に .ttf commit し Playwright に明示指定) のみ。パッケージマネージャ install を禁じる」と明記。(b) CI provisioning が要るなら SCAN_FILES に verify.yml を追加 (system-scope 後続)。(c) VI が Manual でしか守られない領域であることを plan Constitution Check VI 行に明記。
- 根拠: Principle VI / Verification スコープ (441-448) / PB-6。

### [High] IME E2E が「有効 live composer」に到達する手段が research/plan に無い (H-002)
- 観察: SC-001 は「有効な live composer」で isComposing 中 Enter が届かないことを計測。AD-037 §5 は「有効 composer に対する IME E2E は無い (X-1〜X-2 の窓)」と明記し isDisabled:true 前提の ChatScreen.test.tsx とは別物と強調。有効 composer は active phase かつ稼働セッション存在時のみ。research R-05 は CDP composition 注入は書くが windows-latest CI (WSL/Docker/claude CLI 不在) で active phase 到達をどう成立させるか未定義。
- リスク: 空白を埋めないと (i) isDisabled:true の無効 composer をテストして自明に通す偽の緑、または (ii) fake ランタイム/セッション注入機構が未設計のまま実装突入。前者は SC-006 形骸化。
- Action: research (R-04/R-05) に「E2E が有効 composer に到達する手段」を明記 (a: E2E 専用 fake runtime/session 注入フック、b: preload/main stub の packaged build)。T006/T016 に前提タスク追加。
- 根拠: Principle VIII Verification / AD-037 §5・D3。

### [Medium] e2e の depcruise scope 編入が global ルールを活性化させ not-to-test の prefix に穴を残す (M-001)
- 観察: depcruise は `dependency-cruise.mjs src` で src のみ起点。T002/SH-conf1 は「e2e を scope 編入・src グラフに混ぜない・既存ルールを壊さない」とするが手段未確定。.dependency-cruiser.js の多くは from:{} 全対象で、e2e を起点に足すと path-module-only-from-path-api 等が e2e に誤発火。not-to-test の prefix は ^(specs|tests) 固定で e2e を含まない。
- Action: e2e は src とは別 depcruise 実行 (別 config/別起点) にし src グラフに混ぜない。同一グラフなら global ルールを緩めず e2e/ を各ルールの pathNot 例外に。not-to-test を ^(specs|tests|e2e) に拡張。T002 の受け入れ条件に明文化。

### [Low] eslint base 設定が新設 e2e/ にも適用され react-refresh 系の誤ノイズ (L-001)
- 観察: eslint.config.mjs の ignores に e2e/ 不含、base が **/*.{ts,tsx} に react-hooks/react-refresh を掛ける。
- Action: T002 で e2e/** の明示 override (react-refresh/react-hooks off、Playwright 向けのみ) を追加。base 緩和でなくファイル単位 override。

## 固有観点の該当なし明示
- PB-1 (パス型消失): 該当なし (下書き/queue はメモリ限定・境界非越え)。
- PB-2 (単一インスタンス): 該当なし。
- PB-3 (capability 虚偽表明): 該当なし。FR-004 の「message queue capability」は assistant-ui UI 側 capability で AgentRuntime.capabilities (autoModeSafe/sandbox) とは別物。research R-02 が「実ソースで確認、非対応なら feature 側で代替」と正直に hedge。ただし「capability」語の非 AgentRuntime 流用は Principle XIV = architecture owner に委ねる。
- PB-4 (権限ゲート迂回): 該当なし (composer は permissionMode に触れない)。
- PB-5 (多段パス変換): 該当なし。
- viewpoint 4 (queue dispatch の session 境界迂回): 該当なし。FR-005/plan IV 行が「X-1 の session.send 再利用、新設なし」と明記。補足: 積んだ項目への byte 長上限 (FR-003) は session.send 側担保前提で C-3 は byte 長に触れず — po/architecture の完全性確認に委ねる。

## 同種事象探索 cascade summary
| 指摘 | Grep/手段 | 該当 | path:line |
|---|---|---|---|
| H-001 | SCAN_FILES/SCAN_ROOTS の CI workflow 走査対象性 | verify.yml 0 件 | allowlists.mjs:12,18-24 |
| H-002 | research/plan の「有効 composer 到達」記述 | 0 件 | research.md:42-69; 0037:130 |
| M-001 | depcruise 起点と global from:{} の e2e 適用性 | not-to-test に e2e 不含 | discovery.md:145; .dependency-cruiser.js:139-142,273-280 |

## Verdict
Critical: 0 / High: 2 / Medium: 1 / Low: 1
