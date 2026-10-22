# Quickstart results: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Spec**: [spec.md](./spec.md) | **Quickstart**: [quickstart.md](./quickstart.md)

記録日: 2026-10-23。夜間の自走 (利用者の方針) のため、実機の確認 (実 `claude` の起動・画面の目視) は行っていない。V-1〜V-5 は「未実施」で、利用者の実機に残る (spec「合否の扱い」)。対応表 (`docs/ui-coverage.md`) の A 節の経路は、実機で「行で残る」と確かめるまで `(実行中)` のままにした (data-model §4.4)。

| 項目 | 結果 | 記録 |
|---|---|---|
| V-0 前提 | 確認済み (2026-10-23) | verify 相当を直列で実行: lint 0 errors (警告 21 件はこの枝で触れていないファイルの prettier の整形のみ)・型検査 `tsconfig.node.json` / `tsconfig.web.json` / `e2e/tsconfig.json` が 0・dependency-cruiser 違反 0 (543 modules / 2929 dependencies)・Constitution 検証の項目 21 が ok (出力の行: A 39 / A' 4 / B 33 / C 45 / D 12 / E 38 / F 128、照合済み A B C E、割当先が O-12 の行 0)・Vitest 全件 218 files / 3953 passed。`node_modules/@anthropic-ai/sdk/package.json` の版 0.125.0 が対応表の冒頭の `SDK: \`@anthropic-ai/sdk\`` の行と同じ。開発ビルドでの起動は未実施 |
| V-1 知らせの類が実行中に届くか | **未実施** | 実機が要る。届く見込み: `notification` / `local_command_output` / `memory_recall` / `tool_use_summary`。`active_goal` は `SDKMessage` の型の外で、`query()` の反復が返すかは未確認 (plan RK-11)。`mirror_error` は SessionStore を使わない今の構成では届かない見込み。割当は `実装済み` のまま (spec Assumptions) |
| V-2 Checkpoints (`files_persisted`) が届くか | **未実施** | 実機が要る。届く条件は未確認 |
| V-3 サーバー側の tool のブロックが届くか | **未実施** | 実機が要る。`server_tool_use` が主ループに現れるか・subagent の中に現れたとき結果が子の中の孤児で出るかは未確認。stub の単体と component テストでは確認済み (SC-003 / SC-004) |
| V-4 過去ログに行が残るか | **未実施** | 実機が要る。変換は実装済みで、判別子が読めれば行・読めなければ伏せ字つきの本文 (単体で確認済み。SC-005)。実データでどちらになるかは未確認なので、対応表の A 節の経路は `(実行中)` のまま、備考に「過去ログの変換は実装済み。実データに残るかは 022 quickstart V-4」と書いた |
| V-5 文書 (`user/document`) | **未実施** | 実機が要る。`document` が過去ログに残るかは未確認。対応表の B 節 `user/document` の経路は `過去ログ` (File の変換は実装済み) |
| V-6 境界 (SC-007) | 確認済み (2026-10-23) | `src/main/`・`src/preload/`・`scripts/constitution/allowlists.mjs`・`src/agents/session-core.ts`・`src/domain/session/meter.ts` の差分は 0 行。`QUERY_OPTION_KEYS` / `AGENT_SDK_ALLOWED_CALLS` / `METER_UPDATE_TYPES` / `SESSION_EVENT_KINDS` の定義行の差分は 0。`SYSTEM_EVENT_CATEGORIES` は 13 → 20、`TRANSCRIPT_PART_FIELDS` の種類は 7 → 9 (`server-tool-call` / `unsupported-block`) と `file` のフィールド (`text` を消して `mediaType`) だけが変わった。`.specify/memory/constitution.md` の差分は 0 (spec U-12) |

## roadmap の O-12 の行に残す未確認の項目

V-1〜V-5 の全部 (実機で届くか・残るか)。Constitution Principle XII の Verification の「A・B・C・E 節」への改定 (v1.5.0。MINOR) も持ち越し (U-12)。

## PR の説明に載せること

`/cl-done` に渡す PR の説明の下書き。

### Principle XIII の Exceptions (registry との照合。FE-001)

- **ServerToolCall** (自作): registry の Web search は取り込まない。結果の 3 つの形 (Sources の一覧 / エラー / 結果の位置の印) と信頼の印 (`__serverTool`) の振り分けが registry に無い。取り込み済みの `ToolFallback` / `tool-display-frame` / `ToolResultMarks` の枠を使う
- **Sources の一覧** (自作。ServerToolCall の中): registry の Sources の source が repo にも `node_modules` にも無く、registry の CLI は実行しない規則なので、(1) リンクの開き方と独自の取得・プレビューが無いこと (2) http(s) 以外の URL をリンクにしないこと (3) 文言に英語の既定が出ないこと、の 3 条件を読んで確かめられなかった。3 つとも確かめられない element は取り込まない
- **UnsupportedBlockMark** (自作): 取り込み済みの `ToolFallback` は tool-call 専用で、data part の 1 行に合わない。種類の名前だけの 1 行の `<p>`
- `components/file.tsx` は変更なし (`sourceType: 'id'` と名前の補いで英語の既定を出さない)

### 概要

- 知らせの類 7 種 (`notification` / `local_command_output` / `tool_use_summary` / `active_goal` / `mirror_error` / `memory_recall` / `files_persisted`) をシステムイベントの行で出す。O-6 / O-10 の行の組み立ては domain の `toNoticeRow` に寄せ、過去ログも同じ関数で行にする (判別子が読めないときは今の伏せ字つきの本文)
- 過去ログの `user/document` を File element で名前と種類だけ出す
- `server_tool_use` と結果のブロックを ServerToolCall (Sources・エラー・印) で、専用の表示を持たないブロックを種類の名前の印で出す
- 対応表の B 節 (33 行) を項目 21 が `@anthropic-ai/sdk` の型と機械照合する (AD-060)
- `src/main/`・`src/preload/`・`QUERY_OPTION_KEYS`・`AGENT_SDK_ALLOWED_CALLS`・`METER_UPDATE_TYPES`・`SESSION_EVENT_KINDS` は変えない

### 未確認

- 実機の確認 (V-1〜V-5) は未実施
- Constitution v1.5.0 (Principle XII の Verification を「A・B・C・E 節」に) は持ち越し (U-12)
- E2E (要ビルド) と基準画像は CI の e2e job で通す。composer / sidebar の基準画像 2 件は本機の揺れで落ちる既知の状態
