# PR Gate Round 1: transcript の基本表示 (R-3)

**Run**: 2026-09-24
**Base**: 6d64049 (R-3 feature diff。fa11dad=R-2 の上に f5d499d AD-033 spike + ae3d7e5 実装)
**Diff stat**: 70 files over 6d64049...ae3d7e5
**Reviewers**: security-reviewer, architecture-reviewer, po-reviewer, platform-boundary-reviewer (4 並列)
**起動しなかった reviewer**: database-reviewer / ux-reviewer / a11y-reviewer (auto_invoke_patterns 不一致。reviewers.yml が SSoT)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 4 | 0 | 4 | 4 | 0 |
| Medium   | 6 | 0 | 6 | 6 | 0 |
| Low      | 8 | 0 | 8 | 8 | 0 |

**Status**: PASS (Critical = 0)
**Next**: PASS → /cl-done (ただし下記 High/Medium の対処を推奨)

全 4 reviewer が **Critical 0**。pr-gate は pure hard gate であり Critical=0 で done を許可する。High/Medium/Low は done を妨げないが、shipping artifact の正直性 (SC-001 過大表示・Constitution trail) と実 defect (svg imageUrl・同時上限迂回) を含むため対処を推奨する。

## High (Round 1)

### H-001 — Constitution v1.2.6 の Amendment trail 行 / footer version が未更新 [origin: architecture]
- Where: `.specify/memory/constitution.md:908,920`
- frontmatter/Principle IX/Sync Impact は 1.2.6 だが trail・footer が 1.2.5。SH-062 未達・SSoT 自己矛盾
- Status: new

### H-002 — SC-010 (主目的) の done 要件が「空 rubric 表の存在」に矮小化、実機一次判断が R-4 前に期限なく未実施 [origin: po]
- Where: `spec.md:256-261` / `quickstart-results.md` / `roadmap.md`
- Status: new

### H-003 — quickstart-results.md が SC-001 を「自動検証 PASS」と過大表示 (SDK 等価性は V-1 実機 pending) [origin: po]
- Where: `quickstart-results.md:14` / `ChatScreen.test.tsx:112` (describe 名誤称)
- Status: new

### H-004 — shell.openExternal が main 側でスキーム allowlist を持たない [origin: security, scope: system]
- Where: `src/main/app/window.ts:48,64` (R-1 由来)。R-3 が敵対的リンク描画を新規導入し到達性を上げた
- Status: new (system scope。R-3 touched 外だが R-3 が到達性を上げた)

## Medium (Round 1)

- **M-001** [security] domain imageUrl が image/svg+xml を許可 (safe-url の SVG 除外と矛盾) — `transcript.ts:81-92`
- **M-002** [security] 同時取得上限が requestToken 再利用で迂回 (CWE-400) — `transcript-service.ts:87,105-119`
- **M-003** [architecture] enumeration-failed の transcript 流用 (1 値 2 意味。Principle XIV)。判定=transcript 専用 FailureReason 値を新設すべき — `target.ts` ほか
- **M-004** [po] SC-002/SC-004 (位置飛び=KPI) に自動計測なし、再実装 auto-follow が無テスト — `spec.md:234-240` / `thread.aui.tsx:296-358`
- **M-005** [po] rubric 機械確認が意味的に空虚 (未実施/NG も通す) — `tests/spec-artifacts/r3-quickstart-rubric.test.ts`
- **M-006** [platform-boundary] transcript-service/spawner が WSL_FREE_DIRECTORIES 対象外 (「wsl.exe 0」の穴) — `allowlists.mjs:339-348`

## Low (Round 1)

- **L-001** [security] preload postMessage targetOrigin '*' / 受信側 origin 未検証
- **L-002** [security] requestToken に長さ上限なし
- **L-003** [security] safe-url の mailto コメント誤読
- **L-004** [architecture] AD-034 §4 の spawn 決定が ADR 未追記 + 申し送り 2 box 未チェック
- **L-005** [po] SC-003「定数倍以内」の境界が spec 未定義
- **L-006** [po] ErrorState の retrying が常に false (dead prop)
- **L-007** [platform-boundary] markdown-text.tsx が strictness 復帰 override に無い
- **L-008** [platform-boundary] alias fixture コメントが実在しない UNDETECTED_NOTES キーを指す

## dedup / suppress

- code-gate verdict の must_fix は 0 件のため suppress 対象なし
- code-gate の H-001 (SDK alias) / platform-L-001 (marker) は FIXED を pr-gate reviewer が実質確認 (残余は L-008 のコメント誤記のみ)
- multi-reviewer dedup: conv-L-001 (code-gate) の型スライスは architecture M-003 が引き取り (重複計上せず)

## Track raw outputs

- `security-reviewer.pr-gate.round1.md` / `architecture-reviewer.pr-gate.round1.md` / `po-reviewer.pr-gate.round1.md` / `platform-boundary-reviewer.pr-gate.round1.md`

## Round 1 findings の対処 (invoker。pr-gate PASS 後、ユーザ選択「High + 主要 Med/Low を直して done」)

verdict は Round 1 時点で PASS (Critical 0) 確定。以下は非 Critical だが出荷 artifact の正直性・実 defect のため修正した。再検証はすべて green (lint 0 / typecheck node+web 0 / depcruise 0 / check:constitution ok14・違反0 / test 全通過 / test:rules 期待表一致)。

**High**
- H-001 (Constitution trail/footer) — **FIXED**: Amendment trail に 1.2.6 行追加、footer を 1.2.6 / 2026-09-24 に更新
- H-002 (SC-010 done 要件 / R-4 gate) — **FIXED**: roadmap に「実機一次判断 (rubric-a/b) を R-4 着手の前提」、spec に機械確認の限界を明記
- H-003 (SC-001 過大表示) — **FIXED**: quickstart-results.md の SC-001 を unit / SDK 等価性 (V-1 実機 pending) に分割、describe 名を「変換済みメッセージ描画」に訂正
- H-004 (openExternal system scope) — **FIXED**: `window.ts` に http(s) 限定ガード `openExternalIfHttp` を追加 (renderer フィルタと独立の最終防御)

**Medium**
- M-001 (svg imageUrl) — **FIXED**: domain `imageUrl` を gif/jpeg/png/webp に限定、svg 除外の domain negative test 追加
- M-002 (同時上限 token 迂回) — **FIXED**: `transcript-service.ts` の上限キーを main 採番の内部 id に変更、同一 token 再利用の回帰テスト追加
- M-003 (enumeration-failed 流用) — **FIXED**: `FailureReason` に `transcript-read-failed` を新設、transcript 経路の汎用 catch-all を差し替え (labels.ts 3 Record + ChatScreen map 更新)
- M-004 (SC-002/004 自動計測なし) — **FIXED (正直化)**: spec の計測経路を「Vitest=マウント数、位置飛びは実機」に。stickyRef の jsdom unit test は低価値のため follow-up (FE-043 の既存判断と整合)
- M-005 (rubric test 空虚) — **FIXED (明記)**: spec に「機械確認は骨格のみ、判断結果は gate しない」と限界を明記 + R-4 前 gate を roadmap に
- M-006 (WSL_FREE 穴) — **FIXED**: `WSL_FREE_DIRECTORIES` に transcript-service.ts / transcript-spawner.ts を追加 (項目15 が緑)

**Low**
- L-001 (postMessage origin) — **FIXED**: preload の targetOrigin を自 origin に、useTranscript が origin/source 検証
- L-002 (requestToken 長さ) — **FIXED**: `MAX_REQUEST_TOKEN_LENGTH=128` + `isValidRequestToken` を validation に、session-ipc が検証
- L-003 (safe-url mailto コメント) — **FIXED**
- L-004 (AD-034 §4) — **FIXED**: spawn 主体の決定 (新設 transcript-spawner) を ADR に追記、申し送り 2 box をチェック
- L-005 (SC-003 境界) — **FIXED**: spec に「200/3,000 件で同数要求」を明記
- L-006 (retrying dead prop) — **FIXED**: ErrorState の retryingLabel を除去
- L-007 (markdown-text override) — **DEFERRED**: Low・実害なし (urlTransform を守る lint ルールは元々無い)。full strictness は scaffold ノイズを生むため見送り。GENERATED_FILES の粒度設計は convention と別途
- L-008 (alias fixture コメントのキー) — **FIXED**

対処後の追加テスト: svg 除外 (transcript.test.ts) / 同一 token 上限 (transcript-service.test.ts) / requestToken 上限・妥当 (session-ipc.test.ts)。
