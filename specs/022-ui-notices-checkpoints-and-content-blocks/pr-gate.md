# PR Gate Round 1: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26
**Base**: main (head 4a16540)
**Diff stat**: +6213 -238 over 73 files
**Reviewers**: security-reviewer, architecture-reviewer (default + ADR-drift), po-reviewer, ux-reviewer, a11y-reviewer, platform-boundary-reviewer, ui-coverage-reviewer (7 並列)
**Skipped reviewers**: database-reviewer — auto_invoke_patterns に一致する変更ファイルが無い (変更 73 件 / pattern 5 件)
**Round inheritance**: Round 1 のため前 round なし
**Rule verification**: `node scripts/rules/run.mjs` を単独で実行。期待表と 74 件一致、exit 0 (機械検証で捕まらない経路 9 件は既知の追跡対象で変化なし)

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 2 | 0 | 2 | 2 | 0 |
| Medium   | 12 | 0 | 12 | 12 | 0 |
| Low      | 17 | 0 | 17 | 17 | 0 |

(件数は reviewer 間の dedup 後。dedup 前は High 2 / Medium 16 / Low 22)

**Status**: PASS (Critical=0)
**Next**:
  PASS → High 2 件は AGENTS.md / AD-050 に従いこの round で直す (Agent(implementer, mode: fix) に H-001 / H-002 を渡す → /cl-code-gate)。High を確かめるためだけの round は回さない。その後 /cl-done
  Medium / Low は直さず、マイルストーン末の棚卸しで扱う

## Critical (Round 1)

なし。

## High (Round 1)

### H-001 — 同じ key の notification の 2 回目以降の high / immediate が読み上げられない (US-1 AC5) [origin: po]
- **Where**: src/renderer/src/features/chat/transcript-announcements.ts:57-62, :72-75; src/renderer/src/features/chat/TranscriptAnnouncer.tsx:66-73; src/domain/session/notice-rows.ts:187-191
- **Issue**: 読み上げの鍵 `row:${messageId}:notification` が本文も回数も含まないため、同じ key で合成された行が書き換わっても `seenRef` で弾かれる
- **Suggested fix**: 鍵に行の書き換えが分かる値 (detail か回数) を含める。TranscriptAnnouncer.test.tsx に「同じ key の high が 2 回届くと 2 回読む」「high の後に同じ本文の low が届いても読まない」を足す
- **Status in this round**: new

### H-002 — category の集合を広げた決定の根拠に AD-060 を挙げているが、AD-060 の Decision に無い [origin: architecture]
- **Where**: src/domain/session/system-event.test.ts:376; src/domain/session/transcript-dto.ts:98; src/domain/session/notice-rows.ts:8; src/agents/sdk-agent-session.ts:968; docs/domains/_overview.md (O-12 の例外の項); docs/domains/session/charter.md (Related Specs)
- **Issue**: 知らせの category 7 つ・part `server-tool-call`・`file` の形の変更・agents の分岐追加は「集合を変えるには ADR が要る」の対象だが、AD-060 Decision 1〜4 に書かれていない (前例 AD-053 Decision 6 / AD-056)
- **Suggested fix**: AD-060 は accepted なので書き足さず、後続 ADR (AD-061) を起こしてこれらを Decision に書き、上記の引用を付け替える。ui / session charter の related_adrs に追加
- **Status in this round**: new

## Medium (Round 1) — 直さない。棚卸しで扱う

| ID | 内容 | Where | origin |
|---|---|---|---|
| M-001 | files_persisted が全件失敗でも見出しが「ファイルを保存しました」。全件失敗の fixture も無い | labels.ts:56, :269-276; notice-rows.ts:255-271 | a11y M-002 / po M-001, M-003 / ux M-001, H-M1 |
| M-002 | files_persisted / document の名前が pathTail を通らず、絶対パスが DOM に届きうる (design-gate M-010 からの持ち越し) | notice-rows.ts:247, :272; content-blocks.ts:66-74 | security M-001 |
| M-003 | Sources のリンクのタイトルが truncate され title も無い | server-tool-call.aui.tsx:84, :89 | a11y M-001 / ux L-003 |
| M-004 | files_persisted の名前の列が保存と失敗を区別しない | notice-rows.ts:272; thread.aui.tsx:1408-1423 | po M-002 |
| M-005 | 形の壊れた http(s) URL が死んだリンクになり、見出しが "URL" になる | server-tool-call.aui.tsx:45-47, :70-72; content-blocks.ts:119-125 | ux M-002 |
| M-006 | 失敗表示に利用者向けの文言と案内が無い (error_code の生表示、mirror-error に guidance 無し) | labels.ts:422-423, :54; thread.aui.tsx:1294-1304 | ux M-003 / po L-002 |
| M-007 | ui-coverage: 割当 `表示不要` なのに経路 `過去ログ` の行が 11 行 | docs/ui-coverage.md:126-128, 130-137 | ui-coverage M-001 |
| M-008 | ui-coverage: Tier B の tool 結果ブロック 8 行に Tier B の理由が無い | docs/ui-coverage.md:110-118 | ui-coverage M-002 |
| M-009 | Tier A の assistant/text の citations を落とし、Inline citation が持ち主無しで未使用 | docs/ui-coverage.md:105, :318 | ui-coverage M-003 |
| M-010 | local_command_output が 120 コードポイント 1 行に潰れる。informational との Tier の不整合 | docs/ui-coverage.md:60, :85; notice-rows.ts:303-311 | ui-coverage M-004 / ux L-001 |
| M-011 | `@anthropic-ai/sdk` の版の照合が Cross-domain invariants の表に無い (lockfile だけの変更で項目 21 が落ちる) | docs/domains/_overview.md:182 | architecture M-001 |
| M-012 | Constitution XII の改定 (v1.5.0) の持ち越し先に持ち主の feature が無い (scope: system) | docs/roadmap.md:387 | architecture M-002 |

## Low (Round 1) — 直さない

security L-001 (Sources URL の userinfo), security L-002 (isWebSource が scheme を再検査しない), a11y L-001 (新しい窓で開く手がかり), a11y L-002 (冗長な title), a11y L-003 / ux L-005 (知らないブロックの印の情報量), a11y L-004 (keyboard テスト), po L-001 (タイトルも host も空の Sources 項目), ux L-002 (「ほか N 件」の重複), ux L-004 (mirror-error の Badge 二重), ui-coverage L-001 (経路の凡例), ui-coverage L-002 (`Sources` は実在しない component 名), ui-coverage L-003 (out-of-scope), architecture L-001 (domain 例外の利用者承認), architecture L-002 (AD-060 Decision 1 の書き方), architecture L-003 (glossary), architecture L-004 (AD-060 deciders), architecture L-005 (SC-004 の表が SDK の集合と結ばれていない)。詳細は raw output を参照。

## Suppressed by code-gate

なし (code-gate の must_fix_findings は 0 件)。

## Track raw outputs

- [security-reviewer.pr-gate.md](./security-reviewer.pr-gate.md) — C0 H0 M1 L2
- [architecture-reviewer.pr-gate.md](./architecture-reviewer.pr-gate.md) — C0 H1 M2 L5
- [po-reviewer.pr-gate.md](./po-reviewer.pr-gate.md) — C0 H1 M3 L2
- [ux-reviewer.pr-gate.md](./ux-reviewer.pr-gate.md) — C0 H0 M3 L5
- [a11y-reviewer.pr-gate.md](./a11y-reviewer.pr-gate.md) — C0 H0 M2 L4
- [platform-boundary-reviewer.pr-gate.md](./platform-boundary-reviewer.pr-gate.md) — C0 H0 M0 L0
- [ui-coverage-reviewer.pr-gate.md](./ui-coverage-reviewer.pr-gate.md) — C0 H0 M4 L3

cascade_enforce: 全 7 件で降格 0。viewpoint_coverage_check: 全 7 件で A-H 欠落なし。
