# Design Gate Round 1: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Spec**: specs/011-ui-coverage/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer (default + adr-drift), security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 1 | 2 | 12 | 10 |
| po-reviewer | 1 | 4 | 6 | 4 |
| architecture-reviewer | 1 | 5 | 9 | 4 |
| security-reviewer | 0 | 1 | 4 | 4 |
| platform-boundary-reviewer | 0 | 0 | 3 | 3 |
| **Total (dedup)** | **3** | **8** | **22** | **14** |

cascade の降格 0 件、A–H の欠落 0 件 (reviewer の 4 トラック)。

**Status**: FIX_REQUIRED
**Next**: Critical 3 件を直してから `/cl-design --spec-dir specs/011-ui-coverage --from gate`。DC-1 と DC-3、DH-2、DH-4 は人間の判断が要る

## Critical (Total: 3)

### DC-1 — Hook のイベントは `includeHookEvents` が無いと SessionStart / Setup しか出ない。キー集合は AD-041 (g) で固定 [origin: architecture C-001 + security H-001]

- **Where**: spec US-2 AC3 / FR-008、quickstart V-4-2、plan Constitution Check IV と ADR 節
- **Issue**: `sdk.d.ts:1722-1731`。`QUERY_OPTION_KEYS` (`session-core.ts:46-55`) は ADR なしに変えられない (AD-036 §4 P1 / AD-041 (g))
- **Action**: (a) Hook の表示を既定で出る SessionStart / Setup に限り、他の Hook は後続に、(b) キーを足す後続 ADR を起こす。人間の判断

### DC-2 — FR-008 の届ける subtype (8 つ) と、設計の変換する subtype (5 つ) が逆 [origin: po C-001 + analyze I1 + security M-003]

- **Where**: spec FR-008 vs research R-04 / data-model §2 / tasks BE-024。`exit_code` も research と data-model で食い違う (analyze I3 / po M-003)
- **Action**: FR-008 を 5 つに直し、`hook_progress` / `task_progress` / `background_tasks_changed` は対応表で割り当てると書く。フィールドの正本は data-model §2。`exit_code` は通さない

### DC-3 — Constitution XII / XIII を ADR なしで改める (改定手順 1 に反する)。版の上げ方の根拠も無い [origin: analyze C1 + C2 + architecture H-004]

- **Where**: plan の ADR 節、research R-10、spec FR-016、tasks SH-090、constitution.md:284-296・:956-962
- **Action**: ADR を 1 本起こし (割当の 3 種類と後続 ID の読み方、対応表の節と機械照合の範囲、ToolFallback と Tier、AD-019 / AD-020 の Open Questions への回答)、人間が accepted にする。版 (PATCH / MINOR) の根拠を Sync Impact Report に書く

## High (Total: 8)

| ID | origin | 要旨 | 対応 |
|---|---|---|---|
| DH-1 | architecture H-001 | `role: 'system'` に data part を載せると assistant-ui が例外を投げる (`thread-message-like.ts:269-273`) | event のメッセージを `role: 'assistant'` の data part にするか、system の text 1 つにする |
| DH-2 | architecture H-002 + security L-003 + platform 申し送り | task_updated / task_notification は名前を持たず、`skip_transcript` の task が漏れる。「状態を保持しない」と両立しない | renderer の upsert で event part を合成するか、agents が上限つきの最小の表を持つ (後者なら言い換えを人間に確認) |
| DH-3 | architecture H-003 | system メッセージが末尾に来ると監視ビューの直近の活動が消える (O-1 FR-006 の regression) | `deriveActivity` が event と結果だけのメッセージを読み飛ばす。テストと session charter |
| DH-4 | architecture H-005 + analyze U2 | O-4 / O-5 / O-6 の domain が未決。`_overview.md` の帰属表と M3 が追随の対象外 | domain を人間に確認し FR-004 に。SH-091 に `_overview.md` |
| DH-5 | po H-001 + analyze I2 | US-2 AC4「1 行ずつ」「進み」が 1 task 1 行の設計と食い違う | AC4 を書き直す |
| DH-6 | po H-002 + analyze I4 + architecture M-005 | `background_tasks_changed` / `task_progress` の割当先が O-4 / O-6 の範囲に無く、spec の Out of Scope とも食い違う | FR-004 の O-4 / O-6 の範囲に明記し、Out of Scope をそろえる |
| DH-7 | po H-003 | 中断・終了・過去ログの欠けで Hook / task の行が「開始」「実行中」のまま残る | Edge Case と AC。終わりの来ない行は「結果不明」として描く |
| DH-8 | po H-004 | 後続 ID も割当とすると KPI「表示網羅」は O-2 で 0 になり、M3 の「未表示ゼロ」までの残りを測れない | 項目 21 の出力に割当の種類 × Tier と後続 ID 別の件数。charter の KPI か roadmap M3 に「Tier A の `後続` が 0」 |

## Medium (Total: 22)

| ID | origin | 要旨 |
|---|---|---|
| DM-1 | po M-001 + analyze I6 | FR-012「利用者の開閉を上書きしない」と `key={density}` の作り直し |
| DM-2 | po M-002 | V-4 前の対応表の経路の書き方と SC-003 の判定 |
| DM-3 | po M-003 | Hook の失敗を利用者が調べる手段 |
| DM-4 | po M-004 + analyze I7 + architecture M-001 | 経路の列の `—` が XII の `bad_pattern_grep` に当たる |
| DM-5 | po M-005 | 既定 comfortable の根拠、監視ビューの密度と見分ける文言 |
| DM-6 | po M-006 + analyze G1 | 既定で開くと既存の R-4 テスト (`expandToolGroups`) とスクロールの安定が回帰しうる |
| DM-7 | security M-001 | 過去ログの経路に frame の decoder が無い。labels の参照キーの検証 |
| DM-8 | security M-002 | `Bash` の要点がクォートした値の断片を出す |
| DM-9 | security M-004 + platform M-001 | RK-02 の手当ての E2E は送り直しを通らない。送り直しの合計の上限 |
| DM-10 | platform M-002 | SC-004 の計測が調停役スレッドのモジュールを含まない |
| DM-11 | platform M-003 | 項目 21 の pending が広い |
| DM-12 | architecture M-002 | 対応表の行の Tier の決め方が無い |
| DM-13 | architecture M-003 + po L-002 + analyze U3 | FR-014 の「対応表から参照」が session の規則を ui の文書に置く |
| DM-14 | architecture M-004 | 対応表の書式の正本が data-model (feature の中) |
| DM-15 | architecture M-006 | transcript の文言を session の `labels.ts` に置く |
| DM-16 | architecture M-007 | B 節は `@anthropic-ai/sdk` の型から機械照合できる |
| DM-17 | architecture M-008 + platform L-002 | `receivedMessages` の意味が変わる |
| DM-18 | architecture M-009 | 項目 21 の配線の発火確認 |
| DM-19 | analyze I5 + architecture L-004 | reviewer の code-gate の範囲と `invoked_by`、発火パターンのパス |
| DM-20 | analyze I8 | A 節の「union の外」の行が「余分な行」で落ちる |
| DM-21 | analyze U1 | 「SC-009 の台帳」が本 spec に無い (003 の SC) |
| DM-22 | analyze G2 + D1 | 実行中の結果の切り詰めのテスト / plan の Constitution Check に VIII が無い |

## Low (Total: 14)

analyze I9 / I10 / I11 / U4 / T1 / T2 / A1 / A2 / R1、po L-001 / L-003 / L-004、security L-001 / L-002 / L-004、platform L-001 / L-003、architecture L-001 / L-002 / L-003 (重複をまとめて 14 件)。各トラックの raw を参照。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
