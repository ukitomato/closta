# Quickstart の結果: 会話の境界と tool の専用表示の第 2 弾 (O-6)

記録日: 2026-10-14 (SH-013。implementer が自動で確かめられる分)。基準は impl_base `0f6fe33`。

## 自動の検証

| 項目 | 結果 |
|---|---|
| lint (`eslint --cache .`) | 0 件 (SH-012 で手書きの element の一覧に足した `file-result-tree.tsx` / `task-tool.aui.tsx` の戻り値の型を足した) |
| 型検査 `tsconfig.node.json` / `tsconfig.web.json` | exit 0 / 0 |
| E2E の型検査 `e2e/tsconfig.json` | exit 0 |
| 依存グラフ (`dependency-cruise src`) | 違反 0 (451 modules) |
| Constitution 検証 (`scripts/constitution/check.mjs`) | 違反 0 (ok 20 / 検査対象なし 1)。項目 12 / 16 / 21 とも ok |
| rule fixture の照合 (`scripts/rules/run.mjs`) | exit 0 |
| Vitest 全件 | 165 files / 3056 tests passed |

E2E (要ビルド) と基準画像は CI の e2e job で通す。ToolFallback の見出しの日本語化などで基準画像が変われば CI の artifact から取り直す。

## V-1 境界の差分 (SC-005)

- `src/main` / `src/preload` の差分は 0 ファイル。IPC の型の置き場 (`src/shared` / `src/domain/ipc`) の差分も 0
- `SESSION_EVENT_KINDS` / `TRANSCRIPT_PART_FIELDS` / `toPermissionResult` / `AGENT_SDK_ALLOWED_CALLS` / `QUERY_OPTION_KEYS` を足し引きする差分は 0 (`git diff` の `+` / `-` の行にこれらの定義の変更が無い)。`PermissionRequest` は固定テスト (フィールドの集合) が足されただけで、型は変えていない
- `METER_UPDATE_TYPES` は 8 → 9 (`retraction` の 1 つだけ)。固定テストも 9 に直っている
- `QUERY_MUTATION_METHODS` に `readFile` が足された (21 → 22)。`src/agents` に `.readFile(` は 0 件 (plan RK-09)
- `AGENT_SDK_ALLOWED_CALLS` と `QUERY_OPTION_KEYS` の差分は 0

## V-2 対応表 (SC-004)

項目 21 の出力: `行: A 39 / A' 4 / B 10 / C 45 / D 12 / E 38 / F 127`、`後続: I-3(M4) 2 [Tier A 1], O-10(M3) 4 [Tier A 3], O-11(M3) 16 [Tier A 3], X-6(M2) 4`、`M3 の完了の条件の残り: 6`。

- 割当先が O-6 の行は 0 (書き換え前は 30 行・Tier A 14)
- D 節に O-11 の Tier A 3 行 (`general-hooks` / `late-backgrounded-task` / `subagent-nesting-live`) が立ち、M3 の完了の条件の残りは O-10 の 3 行と合わせて 6

## V-3 実機の目視 (利用者。本番ビルド)

**未確認** (利用者の作業)。確かめられなかった項目は roadmap の O-6 の行に残した (`quickstart V-3 のうち、O-6 の PR までに確かめていない項目`):

- `/compact` の `compact_result` と `compact_boundary` の届く順・過去ログの境界
- `/clear` と plan モードの終了での境界・`/clear` の後に過去ログの一覧で会話が分かれるか (X-6 へ)
- `Glob` / `Grep` の結果の text の形 (FE-020 の fixture の元)
- 「結果待ち」「結果不明」の見え方・読み上げ (ナレーター)・承認拒否や中断の後の tool の結果が `is_error` で届くか
- `informational` の `level` ごとの頻度・`tool_use_id` 付きの頻度
- モデルの拒否の起き方 (起こせなければ「未確認」)
- 過去ログに `informational` / 拒否 / 会話の作り直しが残るか・取り消された応答が残るか・残った本文に伏せ字が当たっているか (O-11 の過去ログの変換の材料)
