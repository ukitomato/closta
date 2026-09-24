# platform-boundary-reviewer Review (pr-gate Round 1): transcript の基本表示 (R-3)

**Run**: 2026-09-24 / **Base**: 6d64049...ae3d7e5 (70 files) / **発火**: eslint.config.mjs

## 初回読了 viewpoint

- A. 認可 / 認証 / secret: 該当なし (security-reviewer owner)
- B. 入力検証 / injection / XSS / CSP: 該当なし (security-reviewer owner)
- C. runtime / isolation charter drift: Critical:0 High:0 Medium:0 Low:0 (Out of scope 侵犯なし)
- D. Constitution I/II/III/VI/VII + AD-003/004/012 drift: Critical:0 High:0 Medium:0 Low:0 (実観察で遵守)
- E. User Story / SC / AC / UX: 該当なし (po-reviewer owner)
- F. lint ルール網羅性 (PB-7): Critical:0 High:0 Medium:1 Low:2
- G. optional reviewer 範囲: 該当なし
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (穴は F/M-001 に計上)

## 健全性の実観察 (Critical/High 0 の根拠)

PB-1 パス型 (renderer は targetKey/UUID のみ送信、config dir は main で UNC 解決)、PB-2 単一インスタンス (active/verifiedCache キー分離、env は launch ごと新規)、PB-3/4 権限ゲート (read-only、checkVerified は main 強制)、PB-5 多段変換 (1 ホップ)、PB-6 永続 env (allowlist のみ、PATH なし、書込なし)、PB-7 健全部 (SDK 許可 2 件・書込禁止、transcript-spawner は PROCESS_SPAWN_MODULES 済、read-transcript は electron/native 非 import) いずれも遵守。

## Findings

### [Medium] PB-M-001 — transcript-service.ts / transcript-spawner.ts が WSL_FREE_DIRECTORIES 対象外 (「wsl.exe 0」が transcript 経路で機械検証されない) (scope: feature)
- Where: `scripts/constitution/allowlists.mjs:339-348` (WSL_FREE_DIRECTORIES) / `check.mjs:730` (リスト外は skip)
- Issue: R-3 新設の 2 モジュール (特に spawn 点 transcript-spawner.ts) が項目15 (SC-003/C-7) の検査を素通し。**現状 wsl-free (実在違反でなくカバレッジ穴)**
- Fix: WSL_FREE_DIRECTORIES に 2 モジュールを実名追加 (現状 wsl-free ゆえ新規違反なし)

### [Low] PB-L-001 — markdown-text.tsx (手書き XSS 配線) が strictness 復帰 override に無い (scope: feature)
- Where: `eslint.config.mjs:463,472` (safe-url / thread.aui は復帰済、markdown-text.tsx 対象外)
- Fix: markdown-text.tsx を復帰 override に加えるか緩和を狭める (rule 粒度は convention と重複)

### [Low] PB-L-002 — alias fixture のコメントが実在しない UNDETECTED_NOTES キー sdk-write-alias を指す (scope: feature)
- Where: `tests/rule-fixtures/a-direct/sdk-forbidden-call-alias.ts.fixture:5` (実キーは `sdk-forbidden-call-alias`)
- Issue: H-001 は実質満たされている (機械検査 test:rules は正しく通る)。コメントの案内先のみ誤り
- Fix: コメントの `sdk-write-alias` を `sdk-forbidden-call-alias` に

## Round inheritance
code-gate の H-001 (SDK alias) は FIXED を実質確認 (残余は L-002 のコメント誤記のみ)、platform-L-001 (marker) FIXED 確認。本 Round 新規は M-001 / L-001 / L-002。

## Verdict
- Critical: 0 / High: 0 / Medium: 1 / Low: 2
- AD-034 の 5 決定は実装に忠実。PASS を妨げる Critical/High は 0
