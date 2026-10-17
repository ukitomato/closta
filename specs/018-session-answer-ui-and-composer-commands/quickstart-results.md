# quickstart-results: O-10 (018)

実施: 2026-10-18 (implementer。SH-013)。コマンドは `docs/discovery.md` の agent 用の列。

## V-1. 境界の差分

- ADR: `docs/decisions/0052-*.md` / `0053-*.md` の frontmatter は `status: accepted`・`date: 2026-10-17` (確認済み)
- `updatedInput` / `updatedPermissions` / `onUserDialog` / `supportedDialogKinds` を src の非テストのコードで Grep: `updatedInput` は `src/domain/session/agent-session.ts` (射影) だけ。`src/agents/session-core.ts:205` と `src/domain/session/elicitation.ts:35` はコメント。agents のコードに綴りは無い
- `QUERY_OPTION_KEYS` 9 / `SESSION_EVENT_KINDS` 9 / `SessionControl` 6 / `IPC_CHANNELS` の増分 / `QUERY_MUTATION_METHODS` 22 / `METER_UPDATE_TYPES` 9 は pin のテスト (BE-020 / BE-021 / BE-024 ほか) で固定され、Vitest 全件が通っている。`git diff main...HEAD` の目視による差分の照合はしていない (未実施)

## V-2. 自動の検証

| 検証 | 結果 |
|---|---|
| tsc `tsconfig.node.json` / `tsconfig.web.json` / `e2e/tsconfig.json` | exit 0 / 0 / 0 |
| eslint | exit 0 (error 0。warning 9919 は CRLF の `prettier/prettier` で既存) |
| dependency-cruiser | 違反なし (483 modules) |
| `scripts/constitution/check.mjs` | ok 20 / 違反 0 / 検査対象なし 1。項目 21 ok。後続に O-10 の行なし。`M3 の完了の条件の残り: 3` (O-11 の 3 行) |
| Vitest 全件 | 181 files / 3340 tests passed |
| `scripts/rules/run.mjs` | 本機で 5 分を超えても終わらず、結果を得ていない (未確認。discovery.md は code-gate では実行しないとしている。CI の job で確かめる) |
| E2E / 基準画像 | CI の e2e の job で確かめる (未実施) |

## V-3. 実機の目視

未実施 (利用者の作業)。確かめられなかった項目は roadmap の O-10 の行に残した。
