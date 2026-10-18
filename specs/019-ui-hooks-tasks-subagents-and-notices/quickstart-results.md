# Quickstart results: Hook・背景の task・実行中の subagent の表示 (O-11)

記録日: 2026-10-19 (SH-013。implementer)。

## V-0 境界の差分 (SC-004)

| 項目 | 結果 | 根拠 |
|---|---|---|
| `src/main` / `src/preload` の差分 | 0 | `git diff --stat 8b0dfd3 -- src/main src/preload` が空 |
| `QUERY_OPTION_KEYS` | `includeHookEvents` / `forwardSubagentText` の 2 つが増えた | `git diff 8b0dfd3 -- src/agents/session-core.ts`。`session-core.test.ts` の固定テストが通る |
| `AGENT_SDK_ALLOWED_CALLS` | `listSubagents` / `getSubagentMessages` の 2 つが増えた (3 → 5) | `scripts/constitution/allowlists.mjs`。項目 14 が ok (許可 5 件) |
| 2 つの API の呼び出しの場所 | `AGENT_SDK_CALL_FILES` が `src/agents/read-transcript.ts` だけに制限 | 項目 14 が ok |
| `Query` のメソッドの呼び出し | `interrupt` だけ | 項目 16 が ok |
| `SESSION_EVENT_KINDS` / `SessionControl` / `TRANSCRIPT_PART_FIELDS` / `TRANSCRIPT_MESSAGE_FIELDS` / `PermissionRequest` / `toPermissionResult` | 差分 0 | 型の固定テスト (Vitest 全件 190 files / 3449 tests passed) |
| `METER_UPDATE_TYPES` (9 → 10) / `SYSTEM_EVENT_CATEGORIES` (12 → 13) / `PANEL_TABS` (4 → 5) | それぞれ 1 つだけ増えた | `meter.test.ts` / `system-event.test.ts` / `panel-tabs.test.ts` の固定テスト |

自動の検証 (すべて exit 0): lint (0 errors / 25 warnings。prettier の整形のみ)・型検査 2 本 (node / web)・E2E の型検査・依存グラフ (違反 0)・Constitution 検証 (21 件 ok 20 / 違反 0 / 検査対象なし 1)・Vitest 全件。rule fixture の照合 (`scripts/rules/run.mjs`) は discovery.md の取り決めで agent が実行しない。E2E (要ビルド) と基準画像は CI の e2e job で通す。

## V-0b 対応表 (SC-005)

項目 21 は ok。出力: `後続: I-3(M4) 2 / O-11(M3) 3 [Tier A 3] / O-12(M3) 11 / X-6(M2) 4`、M3 の完了の条件の残り 3。**割当先が O-11 の行が 0 にならない**: D 節の 3 行 (general-hooks / late-backgrounded-task / subagent-nesting-live) は V-1 / V-3 / V-4 の記録が無いので `後続: O-11` のまま (spec FR-012 / plan RK-06)。O-12 の行は 11 行が数えられている。

## V-1〜V-7 (実機の目視。本番ビルド)

未実施 (利用者の作業)。完了の PR の条件は V-1 / V-3 / V-4 が「届いた」の記録。
