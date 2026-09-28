# security-reviewer Review: 日本語 composer (X-2) — pr-gate Round 1

**Run**: 2026-09-29 / **Reviewer**: security-reviewer / **Round**: 1

## viewpoint coverage
- A. 認可/認証/secret/プロセス境界: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証/injection/XSS/CSP/暗号: Critical:0 High:0 Medium:0 Low:0
- C/D: 該当なし: architecture-reviewer owner / E: 該当なし: po-reviewer owner / F: 該当なし: convention owner / G: 該当なし / H: 実質記入(regression 網羅確認)

## 検証済み・問題なし (敵対的確認)
- E2E stub production-inert: `!app.isPackaged && CLOSTA_E2E==='1'` (index.ts:61)。env 単独ゲートなし。単一 capability 境界不変 (preload 未変更、exposeInMainWorld 1 箇所)。real 認証/WSL/spawn 非持ち込み (MessageChannelMain のみ)。
- CSP 非緩和: protocol.ts の CSP 未変更。screenshot は FontFace+CSSOM (font-src data: 許容)、setBypassCSP 不使用。
- 会話由来ペイロード: draft は useState (メモリ内)、IPC/ログ/永続層に出さない。T032 が console 非出力を assert。
- XSS: PendingQueueNotice はリテラル描画 (dangerouslySetInnerHTML 不使用)。pending-queue-notice.test が <script>/<b> 非注入を assert。
- 秘密混入なし: e2e/font/verify.yml/lockfile を秘密パターンで grep 0 件。

## Findings
### [Low] L-001 — E2E stub コードが本番バンドルに inert のまま同梱される (scope: feature)
- ランタイムゲートのため rollup が静的除去できず e2e-capability.ts が packaged out/main に含まれる (到達不能 = production-inert は確認済み)。protocol.ts/origins.ts の dev ゲートと同一の accepted パターン。任意 hardening (electron-vite define で DCE)。非ブロッキング。

## Verdict
- Critical: 0 / High: 0 / Medium: 0 / Low: 1
- security track: PASS (Critical 0 / High 0)。
