# platform-boundary-reviewer Review (code-gate): transcript の基本表示 (R-3)

**Run**: 2026-09-24
**Reviewer**: platform-boundary-reviewer
**Gate**: code-gate
**発火理由**: `scripts/constitution/allowlists.mjs` が `scripts/constitution/**` に一致

## 初回読了 viewpoint

- A. 認可 / 認証 / secret: 該当なし (security-reviewer 所掌)
- B. 入力検証 / injection / XSS / CSP: 該当なし (security-reviewer 所掌)
- C. Charter drift (runtime/isolation Out of scope): Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift (I/II/III/VI/VII/IX + AD-003/004/012/034): Critical:0 High:1 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし (po-reviewer 所掌)
- F. lint ルール網羅性: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし (owner 外)
- H. テスト / regression: 該当なし (env レース回帰 BE-027b / 同時取得 kill / dispose あり。良好)

## 健全性の実観察 (Critical 0 の根拠)

- Principle IX: 本文変換 `toTranscriptMessages` (JSON.stringify 含む) の呼び出しは `src/agents/read-transcript.ts` のみ。main (ipc.ts/transcript-service.ts) は `TranscriptHandshakeDTO` を型としてのみ import。SC-007 構造を満たす
- env レース: `buildTranscriptEnv` は許可リスト env + `CLAUDE_CONFIG_DIR` を spawn 時固定。共有可変 env 無し。BE-027b が Ubuntu/Debian の踏み合わないことを守る
- Principle VII: `read-transcript.ts` は electron/native を import せず `process.parentPort` を構造的取得
- Principle I/VI: `node:path` は path-api.ts の 1 件のみ。transcript-spawner.ts は PROCESS_SPAWN_MODULES に正しく追加
- パス型: renderer は `targetKey` (不透明) のみ送る。port frame にパス無し
- inbound 制御閉塞: read-transcript は初回1件のみ処理、port は outbound 専用

## Findings

### [High] H-001 — SDK 書き込み系 API の alias/dynamic-import バイパス対策が未実施 (AD-034 §3 / C-4 M-008) [scope: feature]
- **Where**: `scripts/constitution/check.mjs:679-686` (呼び出し形正規表現のみ) / `tests/rule-fixtures/expected.mjs` (直接呼び出し fixture のみ、alias fixture 無し、UNDETECTED_NOTES に SDK 項目無し)
- **Issue**: 項目14 は許可外 binding の `renameSession(` 形のみ検出。`const r = renameSession; r()` を素通しするのに、denylist も alias fixture も UNDETECTED_NOTES 明記も無い
- **Why**: AD-034 §3 / contracts C-4 (M-008) / SH-061 が「denylist を足す **か** alias fixture + UNDETECTED_NOTES 明記」を必須 deliverable と規定。第一防御 (書き込み IPC 不在=FR-001) は成立のため実害は defense-in-depth 層、cascade で High 上限
- **Resolution (invoker)**: **FIXED** — `tests/rule-fixtures/a-direct/sdk-forbidden-call-alias.ts.fixture` を追加 (`detectors: ['none']`)、`expected.mjs` の FIXTURES に登録、`UNDETECTED_NOTES['sdk-write-alias']` に why/mitigatedBy/nextFeature (X-1: binding denylist) を明記

### [Low] L-001 — `read-transcript.ts:43` の `platform-ok:` 注記が分岐と別行 [scope: feature]
- **Where**: `src/agents/read-transcript.ts:43`
- **Issue**: `platform-ok:` が `process.parentPort` 参照と別行のコメントに置かれ、項目8 の対象外の式に付いている
- **Resolution (invoker)**: **FIXED** — `platform-ok:` を外し通常コメントに変更 (項目8 の対象式でないことを明記)

## Verdict
- Critical: 0 / High: 1 / Medium: 0 / Low: 1
- must_fix: 0 (reviewer High は SHOULD_FIX。gate は PASS)。High/Low とも invoker が修正済み
