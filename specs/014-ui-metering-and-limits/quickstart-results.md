# Quickstart Results: 計量と制限の表示 (O-4)

手順は [quickstart.md](./quickstart.md)。合否の定義は spec の SC が正本。

## 自動の検証 (SH-014) — 2026-10-09 (Polish の SH-010・SH-012・SH-013 の後の値)

`docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で、1 本ずつ直列に流した。

- ESLint (`--cache .`): 0 件
- 型検査: node (`tsconfig.node.json`) / web (`tsconfig.web.json`) / e2e (`e2e/tsconfig.json`) の 3 本とも 0 件
- dependency-cruiser: 違反 0 (411 modules / 2093 dependencies)
- Constitution 検証 (`node scripts/constitution/check.mjs`): **ok 20 / 違反 0 / 検査対象なし 1** (#5 は R-1 からの pending)
  - 項目 14 (Agent SDK の呼び出しの許可リスト): ok。許可は `listSessions` / `getSessionMessages` / `query` のまま
  - 項目 16 (権限ゲートの正の構成): ok。`src/agents/` に昇格値の綴りは無い (例外を足していない)
  - 項目 21 (対応表): ok。下の V-2
- 全件 `vitest run`: **144 files / 2604 tests passed** (通しのテスト `tests/meter/meter-through.test.tsx` の 3 件を含む)
- E2E (要ビルド) と基準画像は本機では流していない。O-4 は E2E の spec を足しておらず、基準画像も取り直していない。判定は CI の e2e job に任せる
  (本機では未確認)
- **SH-011 の `eslint.config.mjs` (2026-10-09 の追記)**: `tool-result-marks.tsx` は tasks が名指した Tier A の一覧 (:582-598) に足すと ESLint が
  1 件落ちた (実測。この一覧は `react-refresh/only-export-components` を戻し、`tool-result-marks.tsx` は component でない `isTruncatedArgs` を
  export する)。2026-10-09 の決定 (案 (b)) で、`thread.aui.tsx` と同じ hooks の番人だけを戻す block (`react-hooks/exhaustive-deps` /
  `react-hooks/refs` / `no-empty`) に入れた。`isTruncatedArgs` は動かさず、`eslint-disable` も使わない。足した後の ESLint (`--cache .`) は 0 件。
  `--print-config` でこの 3 つが error で効くことを、cache を使わない 1 ファイルの実行で 0 件であることを確かめた

## V-1 境界の差分 (SC-006) — 2026-10-09

変更はまだコミットしていないので、`git diff main...HEAD` の代わりに main との merge-base (`44ce810`) と作業ツリーの差分を読んだ
(未追跡のファイルは `git status --porcelain --untracked-files=all` で見た)。

- `src/main`・`src/preload`・`src/domain/capability.ts`・`src/domain/session/status-update.ts` の差分は 0。未追跡のファイルも 0 — **OK**
  (IPC のチャネル・preload・main は変わらない。`meter` は port だけを通る。状態通知の型も変わらない)
- `src/agents/session-core.ts` の差分に `QUERY_OPTION_KEYS` の行は無い。`scripts/constitution/allowlists.mjs`
  (`AGENT_SDK_ALLOWED_CALLS` / `PERMISSION_MODE_ESCALATION_VALUES`) と `.dependency-cruiser.js` の差分は 0 — **OK**
- `src/domain/session/transcript-dto.ts` の差分は、`SYSTEM_EVENT_CATEGORIES` の 3 つ (`api-retry` / `compaction` / `permission-mode`)・
  `SYSTEM_EVENT_STATUSES` の 3 つ (`retrying` / `compacting` / `changed`)・コメントだけ。`TRANSCRIPT_PART_FIELDS` の行は差分に無い — **OK**
- `SESSION_EVENT_KINDS` の追加は `meter` の 1 つだけ。`LAUNCH_FAILURE_REASONS` の追加は data-model §1 の 8 つ (`max-turns` / `max-budget` /
  `structured-output-retries` / `execution-error` / `auth-failed` / `billing` / `rate-limited` / `api-error`) だけ。どちらも固定テストが値で見る — **OK**

## V-2 対応表 (SC-005) — 2026-10-09

- `node scripts/constitution/check.mjs` の項目 21 が ok — **OK**
- 出力の行は A 39 / A' 4 / B 10 / C 45 / D 9 / E 38 / F 127 (D 節に `meter` の行を足して 8 → 9。A・C・E 節の行の集合は変わらない)
- 後続の件数は `I-3(M4) 2 [Tier A 1], O-5(M3) 21 [Tier A 5], O-6(M3) 30 [Tier A 14], X-6(M2) 4` で、**O-4 が無い** — **OK**
- M3 の完了の条件の残り (Tier A の後続で割当先が M3) は **24 → 19**。O-4 の Tier A 5 行 (A 節の `result` / `status` / `api_retry` /
  `rate_limit_event` を `実装済み`、E 節の `get_context_usage` を `表示不要`) が消え、残りは O-5 の 5 と O-6 の 14 — **OK**
  (24 は O-3 の後の値。[012 quickstart-results](../012-ui-thread-search/quickstart-results.md))

## V-3 「プロバイダ」の表記 (SC-007) — 2026-10-09

- Grep で `プロバイダ` を `src/renderer` と `e2e` で探し、0 件 (文言の表 `labels.ts` とテストの期待値を含む) — **OK**

## V-4 実機の目視 (利用者) — 未実施

V-4 は本番ビルドでの利用者の作業で、agent は行わない。2026-10-09 の時点で 10 項目のどれも確かめていない。完了の PR までに確かめられなかった
項目は roadmap の O-4 の行に残した (SH-013)。形は quickstart の「形の控え方」で、アプリの外の CLI から数と列挙だけを控える。

| # | 見ること | 結果 |
|---|---|---|
| 1 | 認証切れで「認証または権限のエラー」と再ログインの導線。result と assistant の形 (subtype / `api_error_status` / `error`) | 未確認 |
| 2 | 使用量のタブと中央のヘッダの目盛りが動く。Bedrock / API キーの Provider で Quota banner が出ない。`modelUsage` のキーの形 (alias・`[1m]`) | 未確認 |
| 3 | 中央のヘッダのコンテキストの割合と `/context` の差が ±10% 以内 | 未確認 |
| 4 | Quota banner の種類・割合・解除の時刻。`utilization` と `resetsAt` の単位 | 未確認 |
| 5 | 権限モードの変化の行と「概要」の「現在の権限モード」。変化の行が `status` と `init` のどちらで出たか | 未確認 |
| 6 | tool の経過時間と「思考中 約 N トークン」 | 未確認 |
| 7 | 「コンテキストの圧縮」の行が「圧縮中」から成功 / 失敗に書き換わる | 未確認 |
| 8 | task の行に種類が残ったまま進み具合が増える | 未確認 |
| 9 | 右のペインのタブを ←/→・Home / End で移る | 未確認 |
| 10 | 「許可」と稼働中の行の「閉じる」の後のフォーカスの行き先 | 未確認 |

結果の直し先 (直すかは利用者の確認の後に決める。tasks SH-014):

- #1 (失敗の形) → data-model §1 の表と暫定の文言 (plan RK-06)
- #2 (`modelUsage` のキーの形) → data-model §2 の `modelId` と §4 の主モデルの照合 (plan RK-15)
- #3 (`/context` との差が ±10% を超えた) → data-model §2 の `contextTokensOf` と §4 の主モデルの照合 (plan RK-08)
- #4 (`utilization` / `resetsAt` の単位) → data-model §2 の値の検証 (plan RK-07)
- #5 (`status` と `init` の順) → data-model §2 / §3 の権限モードの比較 (plan RK-09)
