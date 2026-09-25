# convention-reviewer Review (code-gate): transcript の基本表示 (R-3)

**Run**: 2026-09-24
**Reviewer**: convention-reviewer (viewpoint F owner)
**Gate**: code-gate
**lint 入力**: lint-agent JSON (exit_code 0 / 全検出器 exit 0 / violations 0) を受領。二重実行せず

## 初回読了 viewpoint

- A. 認可 / 認証 / secret: 該当なし (security-reviewer 所掌)
- B. 入力検証 / injection / CSP: 該当なし (security-reviewer 所掌)
- C. 業務不変条件 / Charter drift: 該当なし (architecture-reviewer 所掌)
- D. Constitution / ADR drift: 該当なし (architecture-reviewer 所掌)
- E. User Story / SC / AC / UX: 該当なし (po-reviewer 所掌)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:3
- G. optional reviewer 範囲: 該当なし (owner 外)
- H. テスト / coverage / regression: Critical:0 High:0 Medium:1 Low:1 (M-002/M-003 の H 面。composer 送信閉塞の回帰は良好)

命名規則は 5 レイヤ一貫 (domain/agents/main-app=kebab、renderer 画面=PascalCase、hook=camelCase、component/lib=kebab)。tsconfig include/paths は新規ファイルを漏れなく覆う (除外漏れ 0)。循環 0。

## Findings

### [Medium] M-001 — 手書きの XSS 境界 safe-url.ts を lint 緩和ゾーン `renderer/src/lib/` に置いている [scope: feature]
- **Where**: `src/renderer/src/lib/safe-url.ts` / `safe-url.test.ts` (`GENERATED_FILES` glob `lib/**`)
- **Issue**: `eslint.config.mjs` の CLI 生成物緩和で prettier / explicit-return-type / no-empty 等が off になり、手書きのセキュリティコードが低基準で検査される
- **Resolution (invoker)**: **FIXED** — `eslint.config.mjs` に safe-url.ts/test への strictness 復帰 override を追加 (prettier/prettier / explicit-function-return-type / no-empty を error に戻す。Principle XIII の「除外はファイル単位の明示リスト」と同方針)

### [Medium] M-002 — 仮想化の中核ロジックを生成物扱いの thread.aui.tsx に置き exhaustive-deps を失っている [scope: feature]
- **Where**: `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` の `VirtualThreadRoot` (SC-002/003/004 の実装本体)
- **Issue**: `GENERATED_FILES` (`components/**`) 該当で `react-hooks/exhaustive-deps` が off。回帰核の依存配列 staleness を lint で守れない
- **Resolution (invoker)**: **FIXED** — `eslint.config.mjs` に thread.aui.tsx への `react-hooks/exhaustive-deps: error` override を追加 (依存配列の番人を戻す。lint 再実行で 0 errors 確認済み)

### [Medium] M-003 — transcript 失敗の reasonKey が backend で組み立てられ port まで運ばれるが useTranscript で捨てられている (dead data) [scope: feature]
- **Where**: `useTranscript.ts` (旧: reasonKey を読まず setStatus('failed') に畳む) / `transcript-dto.ts:50-62` / `ChatScreen.tsx`
- **Issue**: 5 モジュールを跨ぐ reasonKey 配線が renderer 端で無効化。US-1 AC-4「理由つき失敗表示」に影響 (AC 判定は po へ委譲)
- **Resolution (invoker)**: **FIXED (option a: 配線)** — `useTranscript` が `reasonKey` を状態保持し `TranscriptView` で公開、`ChatScreen` が `transcriptFailureDetail(reasonKey)` で理由別文言を `ErrorState` に出す。dead data 解消。`useTranscript.test.tsx` に reasonKey 到達の assert 追加

### [Low] L-001 — transcript 失敗理由に R-2 の列挙語彙 enumeration-failed を流用 [scope: feature]
- **Issue**: `enumeration-failed` は R-2 の列挙語彙 (UI 訳「列挙に失敗しました」)。transcript は列挙ではない
- **Resolution (invoker)**: **PARTIAL** — `ChatScreen` の `transcriptFailureDetail` が `enumeration-failed` を「履歴を読み込めませんでした」に写し「列挙」文言を出さない (表示症状を解消)。**値レベルの transcript 専用 `FailureReason` 追加は R-2 由来の型のため architecture と調整する follow-up** (reviewer 指示どおり code-gate で型拡張しない)

### [Low] L-002 — transcript-dto.ts の doc コメントが実装と食い違う [scope: feature]
- **Resolution (invoker)**: **FIXED** — コメントを `features/chat/convert.ts` の `toThreadMessage` に更新

### [Low] L-003 — features/chat が features/session-list の内部 (rows.ts) を跨いで import [scope: feature]
- **Where**: `useTranscript.ts:8` (`@/features/session-list/rows` の `buildSessionRows`)
- **Issue**: feature 境界を跨ぐ内部依存。動作はするが将来のリファクタで壊れやすい (Low)
- **Resolution (invoker)**: **DEFERRED** — `buildSessionRows` の共有場所への昇格は session-list feature を触る refactor でトレードオフあり。reviewer も「現状維持でも動作」と Low 判定。follow-up として記録 (選択→session 解決の共有化)

## Verdict
- Critical: 0 / High: 0 / Medium: 3 / Low: 3
- must_fix: 0 (lint exit 0)。Medium/Low のうち L-003 を除き invoker が修正済み
