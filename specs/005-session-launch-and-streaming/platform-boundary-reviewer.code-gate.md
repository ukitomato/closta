# platform-boundary-reviewer Review (code-gate iter 5): X-1
**Verdict**: Critical 0 / High 0 / Medium 1 / Low 2
## 初回読了 viewpoint
- A. 認可 / 認証 / secret / hardening: 該当なし: security-reviewer owner (env 透過遮断は構造的に閉鎖確認)
- B. 入力検証 / injection: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:1 (M-501 env 実装忠実性 / L-501 CWE-426 帰結)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. lint ルール網羅性 (PB-7): Critical:0 High:0 Medium:0 Low:1 (L-502 定数重複)
- G. optional reviewer 範囲: 該当なし
- H. テスト / coverage: Critical:0 High:0 Medium:0 Low:0
## Round 4 解消確認
- M-201 (検出 env test) RESOLVED (wsl-cli.test.ts が buildDetectionEnv を 5 ケース固定)。
- L-002 (allowlist 非対称) core RESOLVED (検出も allowlist に。PATH/WSLENV 両点遮断)。M-101/M-001 閉鎖確認。
## PB-1〜PB-7: 新規侵食なし (PB-4 権限ゲート堅牢・fixture #16 発火担保)。
## Findings
### [Medium] env allowlist ビルダが 3〜4 重複し照合セマンティクスが分裂 (M-501)
- config-dir の buildWorkerEnv は case-insensitive + 正準化、buildDetectionEnv/buildLaunchEnv は case-sensitive exact。3 定数 (DETECTION/LAUNCH/ENUMERATION) 同値だが独立で同期 assert なし。実機 process.env は case-insensitive proxy のため現実害なし。plain object を渡すと取り落としうる latent fragility。
- Fix: 1 純関数 (case-insensitive) に一本化、または 3 定数 deepEqual test + case-insensitive 走査採用。
### [Low] 検出の裸名フォールバックのコメント失効・dead branch (L-501)
- PATH 除去済のため裸名 wsl.exe は ENOENT。起動側は fail-closed throw。検出側もコメント訂正 or fail-closed に。SystemRoot 常在で発火せず実害なし。
### [Low] WSL_FREE_DIRECTORIES に session-ipc.ts 重複行 (L-502) — 無害だが正本の重複。削除推奨。
## 同種事象探索
| ID | query | 件数 | path |
|---|---|---|---|
| M-501 | env allowlist ビルダ | 4 | wsl-cli.ts:56 / launch-spec.ts:24 / config-dir.ts:66,110,134 |
| L-502 | session-ipc.ts in WSL_FREE_DIRECTORIES | 2 (重複) | allowlists.mjs:395,406 |
## Verdict
Critical 0 / High 0 / Medium 1 / Low 2。Round 4 の M-201/L-002 解消。新規は L-002 残余 + 定数重複。viewpoint A-H 完備。
