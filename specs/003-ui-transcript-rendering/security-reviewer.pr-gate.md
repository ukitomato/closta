# security-reviewer Review (pr-gate Round 1): transcript の基本表示 (R-3)

**Run**: 2026-09-24 / **Base**: 6d64049...ae3d7e5 (70 files)

## 初回読了 viewpoint

- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:1 Medium:1 Low:2
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし (architecture-reviewer owner)
- D. Constitution / ADR drift: 該当なし (architecture-reviewer owner)
- E. User Story / SC / AC / UX: 該当なし (po-reviewer owner)
- F. 命名 / module / lint hookup: 該当なし (convention-reviewer owner)
- G. optional reviewer 範囲: 該当なし (owner 外)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:1

## 健全性の実観察 (Critical 0 の根拠)

BrowserWindow hardening (sandbox/contextIsolation/nodeIntegration:false)・CSP (default-src 'none' / img-src 'self' data: / unsafe-eval 全面禁止)・入力検証 (UUID/既知集合/senderFrame)・本文サニタイザ・main 非経由 port transfer (outbound 専用)・preload 単一 capability・env allowlist・秘密非漏洩 (reasonKey は bounded、本文を log/error に含めない) はいずれも観察上正しい。生 HTML 描画経路なし (rehype-raw / dangerouslySetInnerHTML 0 件)。

## Findings

### [High] S-H-001 — shell.openExternal が main 側でスキーム allowlist を持たない (scope: system)
- Where: `src/main/app/window.ts:48,64` (R-1 由来)
- Issue: R-3 が会話由来 markdown リンクを初描画。openExternal のスキーム検証が renderer の safe-url のみに依存。data:image href が openExternal に到達しうる
- Why: main のプロセス境界が renderer フィルタに依存 (CWE-749)。defense-in-depth のため High 上限
- Fix: window.ts の openExternal 前に http(s) 限定ガード。**scope=system (window.ts は R-3 touched 外)**

### [Medium] S-M-001 — domain imageUrl が image/svg+xml を許可し safe-url ポリシーと矛盾 (scope: feature)
- Where: `src/domain/session/transcript.ts:81-92` (imageUrl) vs `src/renderer/src/lib/safe-url.ts:18` (SVG 除外)
- Issue: SDK image block 経路だけが data:image/svg+xml を通す。img 描画は現状 script 非実行だが将来経路/ポリシー不整合
- Fix: imageUrl を gif/jpeg/png/webp に揃え svg を null に。domain に svg 除外の negative test

### [Medium] S-M-002 — 同時取得上限が renderer 供給の requestToken キーで token 再利用で迂回 (scope: feature)
- Where: `src/main/app/transcript-service.ts:87,105-119`
- Issue: active Map が requestToken キー。同一 token 連打で size が増えず上限ガード不発。上書き旧 worker が dispose kill から漏れる (CWE-400)
- Fix: 上限キーを main 採番の内部 id に。同一 token 再利用の回帰テスト追加

### [Low] S-L-001 — preload postMessage が targetOrigin '*'、受信側 origin/source 未検証 (scope: feature)
- Where: `src/preload/index.ts:75` / `src/renderer/src/features/chat/useTranscript.ts:101`
- Fix: targetOrigin=window.location.origin、event.source===window 検証 (現状悪用不可の defense-in-depth)

### [Low] S-L-002 — getTranscript の requestToken に長さ上限なし (scope: feature)
- Where: `src/main/app/session-ipc.ts:58`
- Fix: validation.ts に実名の上限 (例 128) を追加し検証

### [Low] S-L-003 — safeUrlTransform の未知スキーム分岐コメントが mailto の扱いを誤読させる (scope: feature)
- Where: `src/renderer/src/lib/safe-url.ts:47`
- Fix: コメントを「http(s)/相対/data:画像 以外はすべて除去 (mailto 含む)」に

## Verdict
- Critical: 0 / High: 1 (system, defense-in-depth) / Medium: 2 / Low: 3
- pr-gate hard gate の Critical は 0。上記は defense-in-depth・一貫性・テスト穴
