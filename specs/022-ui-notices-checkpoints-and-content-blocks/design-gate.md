# Design Gate: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-22T00:00:00+09:00
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 2    | 4      | 6   |
| po-reviewer                | 0        | 1    | 6      | 3   |
| architecture-reviewer      | 0        | 5    | 4      | 2   |
| security-reviewer          | 0        | 0    | 1      | 3   |
| platform-boundary-reviewer | 0        | 0    | 0      | 0   |
| **Total (dedup)**          | **0**    | 7    | 10     | 13  |

**Status**: PASS
**Next**: status: tasking → implementing 昇格、/cl-implement 起動可能。ただし AD-050 により High 7 件はこの round で直す (下記)

## Critical (Total: 0)

なし。

## High (Total: 7)

### H-001 — FR-011 / SC-004 の「実行中と過去ログの両方で捨てない」が data-model §2.2 の経路と合わない [origin: po, architecture, analyze] [new]

- **Where**: spec.md:194 (FR-011), spec.md:232 (SC-004), data-model.md:145-148, research.md:135, AD-060:20, :34, :54
- **Issue**: 実行中の user message と過去ログの subagent の user の記録は tool_result だけを読み、他のブロックは黙って消える。FR-011・AD-060 Decision 3・SC-004 はこの例外を前提にしていない
- **Action**: 範囲を「assistant のブロックと過去ログの主ループの user のブロック」に絞って外す経路と理由を書く、または §2.2 の経路にも印を出す。SC-004 / BE-031 / BE-032 のテストに経路ごとの表を入れる (po-reviewer H-001 / architecture-reviewer H-002 / analyze U2)

### H-002 — `convertBlocks` が role を見ないため user/thinking・user/tool_use などが `unsupported-block` にならない [origin: analyze] [new]

- **Where**: data-model.md §0, §2.2, §4.2; tasks.md BE-031; AD-060 Decision 4; src/domain/session/transcript.ts:169-253
- **Issue**: BE-031 と AD-060 D4 は user の thinking / tool_use を印にすると書くが、role 非依存の switch では thinking / tool-call part になる
- **Action**: §2.2 で role を見るか (user の許可一覧) を 1 箇所で決め、§4.2・AD-060 D4・BE-031 を揃える (analyze I1)

### H-003 — Constitution 改定の人間レビューが merge 前に保証されていない [origin: analyze] [new]

- **Where**: plan.md ADR 節, tasks.md SH-010, constitution.md:343-354
- **Issue**: 改定手順は architecture-reviewer の owner を交えた人間レビューを要求するが、SH-010 に merge 前の確認が無い。夜間の merge 方針で人間レビュー無しに入りうる
- **Action**: SH-010 / `/cl-done` に人間承認の記録を条件として足すか、Constitution の改定を PR から切り出す (analyze C1)

### H-004 — Constitution v1.4.1 を PATCH とする分類が版の付け方の表から導けない [origin: architecture] [new]

- **Where**: plan.md:234, constitution.md:1049-1055, :804-811, AD-060:28, :48
- **Issue**: Verification の照合範囲を足す改定は 1052「指針の実質的な拡張 = MINOR」に当たる
- **Action**: v1.5.0 に改めるか、PATCH の理由を明記する (architecture-reviewer H-001)

### H-005 — session の契約を広げるのに session charter と `_overview.md` への記録が無い [origin: architecture] [new]

- **Where**: plan.md:101, docs/domains/session/charter.md:165-167, :303-310, :336, docs/domains/_overview.md:106-126, data-model.md §5, tasks.md SH-010
- **Issue**: `SYSTEM_EVENT_CATEGORIES` と `TRANSCRIPT_PART_FIELDS` を広げ、`file` part の `text` を消す (互換を壊す) のに、記録不要としている
- **Action**: §5 と SH-010 に session charter と `_overview.md` の更新を足し、plan.md:101 を取り消す (architecture-reviewer H-003)

### H-006 — `active_goal` は `SDKMessage` の外で、`case 'active_goal'` はそのままでは型が通らない [origin: architecture] [new]

- **Where**: data-model.md:42, src/agents/sdk-agent-session.ts:830, :837, :958, sdk.d.ts:8820, docs/ui-coverage.md:92, plan.md:62
- **Issue**: TS2678 になり、実行時に yield されるかも未確認。plan は「未確定の技術事項: なし」
- **Action**: plan の Risks に RK を足し、型ガード (cast 禁止)・届かないときの対応表の書き方・quickstart V-1 での記録を決める (architecture-reviewer H-004)

### H-007 — Principle XIII の候補比較が Sources だけで、F 節の Web search と自作要素の候補を見ていない [origin: architecture, analyze] [new]

- **Where**: tasks.md FE-001, FE-030, FE-031, SH-010, docs/ui-coverage.md:363, data-model.md §4.3
- **Issue**: F 節の Web search の `未使用` の理由を本 feature が変える。ServerToolCall / UnsupportedBlockMark の候補比較の記録が無い
- **Action**: FE-001 の比較対象に Web search と既存要素の候補を足し、PR 説明に載せる手順を足す。§4.3 に Web search の更新を足す (architecture-reviewer H-005 / analyze C2)

## Medium / Low

AD-050 により直さず、本出力に残す。

### Medium (10)

- M-001 用語「知らせ」が glossary の Informational notice と衝突、「知らせの類」の範囲が 6 / 7 / 12 種でずれる、「知らないブロック」の名付け [po M-004 / analyze T1 / architecture M-003]
- M-002 `files_persisted` の失敗が複数あるとき 2 件目以降の理由が出ないことが FR-004 に無い [po M-003 / analyze U3]
- M-003 SC-004 のテストが経路の手前で捨てられる分を検出できない、型の絞り込みの typecheck 手順が無い [po M-006 / architecture H-T1]
- M-004 検索の結果 0 件の表示が未定 [po M-001]
- M-005 読み上げの対象が spec と data-model で違う [po M-002]
- M-006 毎ターン届く行で transcript が読みにくくなることへの手当てが無い [po M-005]
- M-007 過去ログの refusal / reset の id に `fallbackId` を使うかが未定 [analyze U1]
- M-008 `@anthropic-ai/sdk` が lockfile だけで動く経路を版の照合の invariant が見落としている [architecture M-001]
- M-009 AD-060 が proposed のままでも BE-050 に進める [architecture M-002]
- M-010 `files_persisted` / `document` の filename に `pathTail` を通さない [security M-001]

### Low (13)

- analyze: A1 (renderer の scheme 判定の大文字小文字), I2 (research と data-model の件数), I3 (plan の status コメントが古い), I4 (SH-011 / SH-012 の順序), I5 (SH-011 が後で作られる quickstart-results.md を読む)
- po: L-001 (`http://` がファイル扱い), L-002 (印と mirror_error に次の行動の案内が無い), L-003 (知らないブロックの集計の観測点が無い)
- architecture: L-001 (XSS 境界の ADR 帰属), L-002 (Principle XII の `amended` 更新)
- security: L-001 (Sources の URL を伏せ字なしで href に), L-002 (guard が server-tool-call の形を再検査しない), L-003 (`target="_blank"` を必須として assert していない)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
