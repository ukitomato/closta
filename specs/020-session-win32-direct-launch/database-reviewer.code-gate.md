# database-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: database-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: code-gate iter 2 (reviewing からの再実行)

## 初回読了 viewpoint

- FR/SC: FR-006, FR-004, FR-016, SC-002, SC-006
- 永続化の実体は `src/main/infra/settings/runtime-settings-store.ts` (userData の `runtime-settings.json`)。結線は `composition-root.ts:108-137` / `:368`、保存入口は `win32-claude-path-service.ts:27-36`。契約正本は `data-model.md` §3
- SQL / migration: 該当なし (DB-7)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer 担当。器 (DB-1) は `{schemaVersion, win32ClaudePath}` の 2 キーのみで問題なし
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer 担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer 担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer 担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer 担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer 担当
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:2 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0 (M-002 の H 側記録)

## スコープ要約

前回 round の High 2 件 (H-001 読めない設定を「指定なし」に倒す / H-002 将来版の上書き) は HEAD で解消済み (`composition-root.ts:121-135`、`runtime-settings-store.ts:147-170`)。DB-1〜DB-6 に新規 Critical / High なし。

## Findings

### [Medium] 破損 / 将来版ファイルが残る限り検出ごとに `.bak` が増える (M-001)
- `runtime-settings-store.ts:86-101` の `backupThen` が `parse-failed` / `newer-version` のたびに新規 `.bak` を書く。呼び出し元 `composition-root.ts:122` は状態を持たない
- 推奨: 同内容なら書かない / プロセスごと 1 回。AD-050 により棚卸しで扱う

### [Medium] `override()` の throw 結線にテストがない (M-002)
- `composition-root.ts:121-135` の 3 分岐 (reasonKeys 非空 loaded / newer-version / read-failed) を確かめるテストなし。`composition-root.ts:128` の if を外しても既存テストは通る
- 推奨: electron 非依存の関数に切り出しテスト

### [Low] 将来版ファイルがあると pick / clear が `save-failed` で行き止まり (L-001)
- `runtime-settings-store.ts:163-169`。ダウングレード利用者のみ。対処不要

### [Low] 同版の未知キーを黙って落とす (L-002)
- `runtime-settings-store.ts:171-175`。対処不要

## 同種事象探索 cascade summary

Critical は 0 件のため該当なし。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `backupThen` (infra/settings) | 6 | `runtime-settings-store.ts:86,122,124,128,131,142` |
| M-002 | `runtimeSettings\|RuntimeSettings` (src, store 除く) | 1 ファイル | `composition-root.ts:35,108,122,368` |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
- Round inheritance: resolved 2 (H-001, H-002) / unresolved 4 (M-001, M-002, L-001, L-002; AD-050 により gate では直さない) / new 0
