# Design Gate: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-09T23:40:49+09:00 (Round 2)
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous gate**: [design-gate.md.20261009T234045](./design-gate.md.20261009T234045) (Round 1, 2026-10-04)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 1 | 3 | 9 |
| po-reviewer | 0 | 1 | 5 | 3 |
| architecture-reviewer | 0 | 0 | 3 | 6 |
| security-reviewer | 0 | 0 | 3 | 3 |
| platform-boundary-reviewer | 0 | 1 | 1 | 1 |
| **Total (dedup)** | **0** | 3 | 12 | 19 |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 6    |
| Unresolved from prev | 0        | 1    |
| New in this run      | 0        | 2    |

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。**ただし `/cl-implement` の前に次の 2 点が要る** — (1) `.needs-input.md` Q1〜Q3 の利用者の回答 (plan RK-01 は「O-5 は design-gate で止める」としている。M-03)、(2) High 3 件の designer による手当て。

## Critical (Total: 0)

なし。

## High (dedup 後 3 件)

### H-01 — MCP の tool / `AskUserQuestion` を専用の表示に移すと、結果待ち・承認待ち・中断・経過時間の状態の印が消える恐れがあり、AC とテストが無い [origin: po, analyze] [new]

- **Where**: spec.md:105-112 (US-1 AC1〜AC8) / data-model.md:28 (§1 中身) / tasks.md:44, :46 (FE-012 / FE-013)
- **Issue**: 今の ToolFallback は `incomplete` / `requires-action` / cancelled / 経過時間を出す (`tool-fallback.aui.tsx:97-98,113,142,294-302`、`tool-result-marks.tsx:49`)。新しい表示の定義にはそれが無い。SC-001 の計測経路でも検出されない (O-4 の振る舞いの退行)
- **Action**: US-1 に状態の印の AC を 1 つ足し、data-model §1 に「状態の印は ToolFallback / `ToolResultMarks` と同じ」と書き、FE-012 / FE-013 に 3 状態の fixture を足す
- **Raw**: po H-001、analyze L9 (経過時間)

### H-02 — スラッシュコマンドの一覧が `init-report` と `commands` の後勝ちで、名前だけの `init-report` が説明と `argumentHint` を消す。FE-021 のテストがこれを固定する [origin: analyze, po] [new]

- **Where**: data-model.md:50, :52, :85, :95 (§2 / §3) / spec.md:129 (US-2 AC4), :191 (FR-008) / tasks.md:31, :61 (FE-001 / FE-021) / `sdk-agent-session.ts:310`
- **Issue**: 最初の `init-report` は必ず送られ (基準が無い)、`commands_changed` の後にも MCP の状態だけの変化で送り直されて一覧が名前だけに戻る。§3 が約束する説明と argumentHint がほぼ出ない
- **Action**: 合流の規則を決める (後勝ちは名前の集合だけ、説明と hint は最新の `commands` から名前で引く、など)。§2 / §3 / AC4 / FE-001 / FE-021 を直し、「`commands` の後に MCP の状態だけ違う `init-report`」のテストを足す
- **Raw**: analyze F1 (High)、po M-001

### H-03 — 17 個に広げた P3 の denylist にも `reloadOutputStyles` / `backgroundTasks` が残る。pin テストの注記が足すことにも ADR を求め、SDK の版上げで増えたメソッドも黙って通る [origin: platform-boundary] [unresolved from prev H-05]

- **Where**: tasks.md:82 (BE-040) / spec.md:236 (SC-005) / quickstart.md:9 / `sdk.d.ts:2611-2972` / `check.mjs:917-924` / `allowlists.mjs:419-427`
- **Issue**: AD-036 §4 P3 (`interrupt` だけ) を守ったと読めるが、実際の歯止めは列挙した名前だけ
- **Action**: BE-040 に 2 つ足す (ADR 不要)、pin の注記を「外すには ADR」に直す、`keyof Query` の網羅を `Equal<Exclude<…>, never>` で固定する型テストを置き、SC-005 の計測経路に書く
- **Raw**: platform-boundary H-101

## Medium (dedup 後 12 件)

| ID | 内容 | 出所 | 前回 |
|---|---|---|---|
| M-01 | 過去ログは `knownServers` が空なので推定の印が常に付き、AC5「実行中と同じ形」と FE-012「同じ DOM」に反する | analyze F2 / arch L-105 | new |
| M-02 | `PanelTab.attention?: (sessionId) => boolean` は静的な表の関数で、context で注入するストアに届かず購読もしない。`(meters) => boolean` にして `RightPanel` が `useSessionMeters` で購読する | analyze C1 / arch M-101 | new |
| M-03 | 着手の条件の食い違い。tasks.md:9 は design-gate PASS だけ、`.needs-input.md` / plan RK-01 は Q1〜Q3 の回答まで止める。Q1〜Q3 は未承認 | analyze G1 / po M-004 | new |
| M-04 | 注意の印が畳んだ帯にしか出ず、ペインを開いて別のタブを見ている間は気付けない | po M-002 | new |
| M-05 | `needs-auth` / `failed` の案内のあと、今のセッションのまま直るか (再接続しない U-2) が書かれていない | po M-003 | new |
| M-06 | decoder が `init-report` / `commands` を捨てても「最初のターンの後に出ます」が出続け、観測点が無い | po M-005 | new |
| M-07 | AD-047 に足す「訂正」節は AD-031 の訂正 (事実誤認) に当たらない。誤った記述は AD-048:28 の側 | arch M-102 | new |
| M-08 | タブの id `config` / `ConfigTab` / `config*` の文言キーが `RunningSession.config` (SessionLaunchConfig) と衝突 | arch M-103 | unresolved (R1 M-007) |
| M-09 | 承認カードの補助見出しが、前方一致するサーバーが複数でも最長一致に確定して推定の印を付けない (CWE-451) | security M-101 | new |
| M-10 | URI の要約が host を無条件に出す。独自 scheme の authority に置いた秘密が見出しに出る (CWE-200) | security M-102 | new |
| M-11 | `commands` / `init-report` を間引かず流量の上限も無い。交互に変わると 64KB の送信が続く。末尾で必ず送る合流にする (CWE-400) | security M-103 | new |
| M-12 | P3 はドット呼び出しだけを見る。計算キーの形を塞がず、`UNDETECTED_NOTES` の記録も無い | platform-boundary M-101 | new |

## Low (dedup 後 19 件)

| ID | 内容 | 出所 |
|---|---|---|
| L-01 | Edge Cases の「ほか N 件」(一覧ごと) と data-model の集計 1 つの `omitted` | analyze L1 (unresolved) |
| L-02 | FR-014「固定テストを直す」→「足す」 | analyze L2 / arch L-106 |
| L-03 | BE-010 のパス `src/agents/live-message.ts` → `src/domain/session/live-message.ts` | analyze L3 (security も採点外で指摘) |
| L-04 | dedup の基準の置き場 (`run()` か `createLiveSignals` か) の食い違い | analyze L4 |
| L-05 | BE-020 の「BE-040」が O-4 の task と本 spec の BE-040 で衝突 | analyze L5 |
| L-06 | research R-08「#16〜#18」→「#17 / #18」 | analyze L6 |
| L-07 | plan の新しいモジュールの数 6 → 5 | analyze L7 |
| L-08 | FR-001 に FR-002 の例外を書く | analyze L8 |
| L-09 | 「最初のターンの後に出ます」→「最初のターンが始まると出ます」 | po L-001 |
| L-10 | 承認カードが出ない権限モードと拒否後の流れを quickstart V-3 で確かめる | po L-002 |
| L-11 | Q2 の不利益を spec の「義務の扱い」に書く | po L-003 |
| L-12 | O-10 の domain の決定を `_overview.md` に AD-048 参照つきで記録 | arch L-101 |
| L-13 | ui charter の slash commands の行に O-10 との分担を書く | arch L-102 |
| L-14 | ui / session charter の `related_adrs` / `related_specs` / Related ADRs の追随 | arch L-103 |
| L-15 | `LiveProgressSource` の「値は数だけ」の docblock を直すタスク | arch L-104 |
| L-16 | 過去ログの `answers` の出所を確かめるまで「選ばれた回答」と言わない | security L-101 |
| L-17 | SH-002 の `assistant-ui@latest` の版を固定し、取り込んだ差分を Grep で確かめる | security L-102 |
| L-18 | FE-014 / BE-020 のテストが M-09 / M-11 の振る舞いを固定、FE-010 に host の負例が無い | security L-103 |
| L-19 | 名前の allowlist が `/` を通し、絶対パスの形の名前が出る | platform-boundary L-101 |

## Dedup log

| merged | key |
|---|---|
| analyze F1 + po M-001 | data-model §2 / §3 後勝ち・FR-008 |
| po H-001 + analyze L9 | FE-012 tool の状態 / 経過時間 |
| analyze C1 + arch M-101 | data-model.md:102 `attention` |
| analyze G1 + po M-004 | `.needs-input.md` Q1〜Q3 / tasks.md:9 |
| analyze F2 + arch L-105 | US-1 AC5 / FE-012 同じ DOM |
| analyze L2 + arch L-106 | FR-014 (spec.md:209) |

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
