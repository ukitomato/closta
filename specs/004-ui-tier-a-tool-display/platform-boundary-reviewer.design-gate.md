# Design-gate: platform-boundary-reviewer (R-4)

**Run**: 2026-09-25 · **Verdict**: Critical 0 / High 0 / Medium 2 / Low 0 · Read-only.

R-4 は本 reviewer の遠点 (path 型消失・単一インスタンス・多段パス・grep 不可視永続化・容量境界) について
**概ね clean**。Q1 (DTO 入れ子が本文を main へ押し戻すか) = NO / Q3 (機構が担保できない境界の虚偽表明) = NO /
Q4 (多段パス・単一インスタンス・不可視永続化の新規導入) = なし、を観察で確定。変換 `toTranscriptMessages` は
`src/agents/read-transcript.ts:74` のみで実行され main は呼ばない (grep 確認)。plan は AD-031 の到達集合未証明を
正直に再掲しており「解決済み」と書いていない。

## Findings

### PB-M-001 [Medium] 「argsText は小さい」前提が Edit/Write/MultiEdit/ExitPlanMode で不成立
- **Where**: plan.md Principle IX 節 (「renderer の args パースは小さい argsText に限り」); data-model §2;
  `src/domain/session/transcript.ts:181` (`argsText: safeStringify(b.input)` = 無切り詰め。`TOOL_RESULT_MAX_BYTES` は
  result のみ :190)
- **Issue**: Write の `content` / Edit・MultiEdit の `old_string`/`new_string` / ExitPlanMode の `plan` は数 MB になりうる。
  contracts の `parseEditArgs`/`parseWriteArgs`/`parseMultiEditArgs`/`parsePlanArgs` はこの大きな argsText を `JSON.parse` する。
  **main / Principle IX 違反ではない** (argsText は port2 → renderer で解析、main を通らない) が、巨大 valid args の
  `JSON.parse` は renderer 描画スレッドをブロックしうる。SC-005 は parse **失敗**時の退避のみ検証し、大きい valid args の
  parse コストは対象外。FR-017 の折りたたみは parse 後の display 側でしか効かない。
- **Action**: plan/data-model の「argsText は小さい」を「argsText は tool により大きくなりうるが port2 経由・renderer 解析のため
  **main は影響しない**」に正直化 (main-boundary の正当化は保てる)。加えて `tool-args.ts` に args サイズ上限を設け超過時は
  fallback (先頭切り詰め) へ退避させるか、render-thread ブロックの許容を quickstart 実機計測で確認する task を US-3 に足す。
  (security H-002 と同一根)

### PB-M-002 [Medium] `toTranscriptMessages` の実行プロセス局所性を縛る lint/depcruise 規則が無く、R-4 が同関数の重量・本文入れ子を増やす
- **Where**: `.dependency-cruiser.js` (main→domain の import 禁止規則なし。domain は下位共有層); AD-031 (到達集合未構築);
  AD-034 §5; tasks BE-011 / SH-060 / SC-006
- **Issue**: 現在 `toTranscriptMessages` は `src/agents/read-transcript.ts:74` のみが呼び main は呼ばない (clean)。
  だが R-4 が subagent 親子グルーピング (全走査 + 木構築) と `children[]` 入れ子本文を足すため、将来 main から import された
  場合の blast radius が拡大する。捕捉する構造検査 (composition-root 到達集合) は未構築で R-4 も新設しない (plan で PATCH 不要と判断)。
  SC-006 の「port transfer 構造検査」が R-4 の**新しい入れ子 DTO 形**を対象に更新される保証が tasks に明示されていない。
- **Action**: (1) SC-006 / SH-060 の構造検査を「入れ子拡張後の `TranscriptFrameDTO` (children/depth 含む) が port2 のみを流れ、
  handshake 戻り (`transcript-service.ts:128`) に本文/children が載らない」ことを assert する形へ拡張し、BE 回帰テストに 1 ケース追加。
  (2) 到達集合検査は R-3 が roadmap に持ち主登録済み — R-4 で変換が重くなった事実を 1 行追記し優先度材料を残す。
  defense-in-depth かつ既知・登録済みのため Medium 上限。
