# Quickstart Results: MCP・プラグイン・コマンドの表示 (O-5)

手順は [quickstart.md](./quickstart.md)。合否の定義は spec の SC が正本。

## 自動の検証 (SH-014) — 2026-10-10 (Polish の SH-010〜SH-013 の後の値)

`docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で、1 本ずつ直列に流した。

- ESLint (`--cache .`): 0 件 (SH-011 で手書きの element の一覧に足した `mcp-tool-call.aui.tsx` / `ask-user-question.aui.tsx` を含む)
- 型検査: node (`tsconfig.node.json`) / web (`tsconfig.web.json`) / e2e (`e2e/tsconfig.json`) の 3 本とも 0 件
  (`sdk-agent-session.ts` の `keyof Query` の網羅・入力型の代入可能性・`McpStatusKey` の `Equal<…>` を含む)
- dependency-cruiser: 違反 0 (423 modules / 2192 dependencies)
- Constitution 検証 (`node scripts/constitution/check.mjs`): **ok 20 / 違反 0 / 検査対象なし 1** (#5 は R-1 からの pending)
  - 項目 14 (Agent SDK の呼び出しの許可リスト): ok。許可は `listSessions` / `getSessionMessages` / `query` のまま
  - 項目 16 (権限ゲートの正の構成): ok
  - 項目 21 (対応表): ok。下の V-2
- rule fixture の照合 (`node scripts/rules/run.mjs`): exit 0 (BE-040 の 3 本の fixture を含む。`UNDETECTED_NOTES` の記録を出力)
- 全件 `vitest run`: **151 files / 2812 tests passed**
- E2E (要ビルド) と基準画像は本機では流していない。O-5 は composer と既存の画面を変えず、E2E の spec を足さず、基準画像も取り直していない ([Q2])。
  判定は CI の e2e job に任せる (本機では未確認)

## V-1 境界の差分 (SC-005) — 2026-10-10

変更はまだコミットしていないので、実装の起点 (`946c47d`) と作業ツリーの差分を読んだ。

- `src/main`・`src/preload`・`src/domain/capability.ts`・`src/domain/session/status-update.ts`・`.dependency-cruiser.js` の差分は 0。
  `src/main` / `src/preload` の未追跡のファイルも 0 — **OK** (IPC・preload・main は変わらない)
- `src/domain/session/agent-session.ts` (`toPermissionResult`・`SESSION_EVENT_KINDS`) と `src/agents/session-core.ts` (`QUERY_OPTION_KEYS`) の差分は 0 — **OK**
- `scripts/constitution/allowlists.mjs` の差分は `QUERY_MUTATION_METHODS` の 13 の追加 (6 → 19) とその注記だけ。`AGENT_SDK_ALLOWED_CALLS` は変わらない — **OK**
- `src/domain/session/transcript-dto.ts` の差分は `SYSTEM_EVENT_CATEGORIES` の `auth` / `plugin`・`SYSTEM_EVENT_STATUSES` の `authenticating`・
  `detail` の注記だけ。`TRANSCRIPT_PART_FIELDS` の行は差分に無い — **OK**
- `src/agents/sdk-agent-session.ts` の `Query` のメソッドの呼び出しは `queryHandle?.interrupt()` だけ (Grep) — **OK**

## V-2 対応表 (SC-004) — 2026-10-10

- `node scripts/constitution/check.mjs` の項目 21 が ok — **OK**
- 出力の行は A 39 / A' 4 / B 10 / C 45 / D 9 / E 38 / F 127 (行の集合は変わらない)
- 後続の件数は `I-3(M4) 2 [Tier A 1], O-10(M3) 4 [Tier A 3], O-6(M3) 30 [Tier A 14], X-6(M2) 4` で、**O-5 が無く、O-10 が 4** — **OK**
- M3 の完了の条件の残り (Tier A の後続で割当先が M3) は **19 → 17**。O-5 の Tier A 5 行 (`auth_status` / `McpInput` を `実装済み`、
  `elicitation_complete` / `AskUserQuestion` / `elicitation` を `後続: O-10`) のうち 2 行が消え、残りは O-10 の 3 と O-6 の 14 — **OK**
  (19 は O-4 の後の値。[014 quickstart-results](../014-ui-metering-and-limits/quickstart-results.md))

## V-3 実機の目視 — 未確認 (利用者の作業。本番ビルド)

確かめられなかった項目 (最初のターンの `pending`・`needs-auth` の案内と `CLAUDE_CONFIG_DIR` (plan RK-05)・`AskUserQuestion` を許可したときの
tool_result の中身 (O-10 の材料)) は roadmap の O-5 の行に残した (SH-012)。
