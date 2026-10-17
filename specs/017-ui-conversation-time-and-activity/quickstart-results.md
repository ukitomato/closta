# Quickstart results: 会話の時間と活動の可視化 (O-9)

実施日: 2026-10-17 (agent。V-1 / V-2 のみ。V-3 は利用者の実機)

## V-1 自動の検査

| # | コマンド | 結果 |
|---|---|---|
| 1 | `node node_modules/vitest/vitest.mjs run` | 173 ファイル / 3141 件 pass |
| 2 | `node node_modules/eslint/bin/eslint.js --cache .` | エラー 0 / 警告 0 (US-3 の追加分の prettier 警告 4 件を手で直した) |
| 3 | `tsc --noEmit -p tsconfig.node.json` / `-p tsconfig.web.json` (`--composite false`) / `-p e2e/tsconfig.json` | すべて exit 0 |
| 4 | `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` | 違反 0 (469 modules)。agents に新しい import 行は無い |
| 5 | `node scripts/constitution/check.mjs` | 違反 0。項目 21 ok (F 128 行。後続の割当先に O-9 は無い) |

## V-2 差分と記録

- `git diff main --stat -- src/main src/preload`: 空 (SC-005)
- `TRANSCRIPT_MESSAGE_FIELDS` / `TRANSCRIPT_PART_FIELDS` / `METER_UPDATE_TYPES` の固定テストの期待値: 差分に出ない (変えていない)
- `scripts/` の差分 0、agents の query の options のキー・Agent SDK の呼び出しの許可リスト (項目 14 / 16): 変わらず ok (FR-005)
- `docs/ui-coverage.md`: Message timing / Heat graph / Conversation map = `A SDKAssistantMessage / A SDKUserMessage`、Activity graph / Trace waterfall = `未使用` と理由、A 節の 2 行、手順の 4、冒頭の 128 (SC-006)
- AD-051 は `status: accepted`。Decision 1〜7 と実装 (`transcript-time.ts`・`transcript.ts`・`live-message.ts`・`sdk-agent-session.ts` の受信時刻・`convert.ts` / `message-time.ts` の `metadata.custom.createdAt` / `receivedAt`) は一致。食い違い無し
- glossary・ui charter・session charter・`_overview.md`・`prompts.md`・roadmap を data-model §7 のとおり書き換えた
- registry の照合: SH-002 で element は取り込まず自作 (`elements/` に新規なし)。そのため `eslint.config.mjs` と `reviewers.yml` の実名リストは変えていない (SH-012)
- **未了**: PR の説明に照合の結果 (research R-10 の表) を書く (Principle XIII)。E2E (要ビルド) と基準画像は CI の e2e job

## V-3 実機の目視

未実施 (全 12 項目。持ち主は利用者の実機)。roadmap の O-9 の行に未確認として挙げた: #1 過去ログの `timestamp` の有無 (**AD-051 の Confirmation。U-2 の前提**)・#4 実行中の SDK の `timestamp` の有無・#3 / #12 の見え方・#11 012 の V-3 の絞り込み。#2 / #5〜#10 も未実施。
