# Design Gate: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-10T00:01:12+09:00 (Round 3)
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous gate**: [design-gate.md.20261010T000109](./design-gate.md.20261010T000109)
**Entry status**: implementing (re-run) `[warn: re-run on status=implementing]`

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 12     | 20  |
| po-reviewer                | 0        | 0    | 4      | 4   |
| architecture-reviewer      | 0        | 0    | 4      | 7   |
| security-reviewer          | 0        | 0    | 3      | 4   |
| platform-boundary-reviewer | 0        | 0    | 2      | 2   |
| **Total (dedup)**          | **0**    | 0    | 13     | 25  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 3    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 0    |

前回の H-01 (状態の印) / H-02 (スラッシュコマンドの後勝ち) / H-03 (P3 の denylist) と M-03 (着手の条件) は全トラックで resolved と判定された。

**Status**: PASS
**Next**: Critical=0。入口 status が `implementing` の再レビューのため status は据置。ただし tasks.md:9-11 の着手の条件 2 (`.needs-input.md` Q1〜Q3 の利用者承認) は未充足 (analyze 指摘)。Medium のうち M-01 / M-08 / M-09 / M-10 / M-11 / M-12 はテストの期待値に効くため、実装前の `Agent(designer)` での手当てを推奨。

## Critical (Total: 0)

なし。

## High (Total: 0)

なし。

## Medium (Total: 13)

### M-01 — 過去ログでも実行中と同じ形 (AC5 / FE-012「同じ DOM」) と、過去ログの `knownServers` が空という規則が両立しない [origin: analyze, po, architecture] [unresolved from prev M-01]

- **Where**: spec.md:108-109 (AC4 / AC5)、data-model.md:9-12, :19、tasks.md:48 (FE-012)
- **Issue**: 過去ログでは `mcp__a__b` 系の名前が常に推定の印付きになり、AC5 と FE-012 をそのままテストに落とせない
- **Action**: AC5 を「推定の印だけが違ってよい」(部品と見出しの構造の一致) にするか、過去ログでは印を付けない規則を data-model §1 に書く。FE-012 の観点を分ける

### M-02 — `PanelTab.attention?: (sessionId) => boolean` が context 注入のストアに届かず購読もしない [origin: analyze, architecture] [unresolved from prev]

- **Where**: data-model.md:111、tasks.md:62 (FE-020)、plan.md:149、`running-session-context.ts:17-21`、`panel-tabs.ts:26-42`
- **Action**: `attention?: (meters: SessionMeters | undefined) => boolean` の純関数にし、`RightPanel.tsx` が `useSessionMeters` で購読する。FE-020 のテストを context のストアに `init-report` を流す形にする

### M-03 — 注意の印が畳んだ帯にしか出ない [origin: analyze M-04, po M-002] [unresolved from prev M-04]

- **Where**: spec.md:121, :131 (US-2 AC5)、data-model.md:111、tasks.md:63 (FE-020)
- **Action**: 開いた tablist の「構成」のタブにも印を出すか、出さない理由を spec に書く。AC5 とテストを広げる

### M-04 — `needs-auth` / `failed` の案内に従った後、今のセッションのまま直るかが書かれていない [origin: analyze M-05, po M-003] [unresolved from prev M-05]

- **Where**: data-model.md:109, :162-163、spec.md:73 (U-2)、quickstart.md:20、tasks.md:107 (SH-014)
- **Action**: 文言に「直らないときはセッションを起動し直す」を添え、V-3 に「同じセッションの次のターンで状態が変わるか」を明記し roadmap の未確認項目に足す

### M-05 — decoder が `init-report` / `commands` を捨てると空の文言が出続け、観測点も無い [origin: analyze M-06, po M-005] [unresolved from prev M-06]

- **Where**: data-model.md:106, :110, :159、tasks.md:31, :35 (BE-001 / FE-001)
- **Action**: 捨てた回数を観測点に残し、捨てた後の表示 (「構成を読めませんでした」等) を決める。FE-001 / FE-021 にテストを足す

### M-06 — AD-047 に足す「訂正」節は AD-031 の訂正 (事実誤認) に当たらない。誤りは AD-048:28 側 [origin: analyze M-07, architecture M-102] [unresolved from prev M-07]

- **Where**: spec.md:210 (FR-014)、plan.md:155、tasks.md:106 (SH-013)、AD-031:99-107、AD-048:28、.needs-input.md:6-8
- **Action**: Q1 の回答に添えて、(A') AD-048 に訂正節を足し AD-047 は触らない、または (A'') AD-047 側は「記録」の見出しにする。FR-014 / plan / SH-013 の文言を揃える

### M-07 — タブの識別子 `config` / `ConfigTab` / `config*` が `RunningSession.config` (SessionLaunchConfig) と衝突 [origin: analyze M-08, architecture M-103] [unresolved from prev M-08]

- **Where**: data-model.md:96, :157-159, :165、plan.md:149, :222、tasks.md:62, :64、`running-session-types.ts:58`
- **Action**: `init-report` / `InitReportTab.tsx` / `initReport*` に改める (画面の文言「構成」は据置)。Constitution XIV

### M-08 — 前方一致するサーバーが複数あっても最長一致で確定し推定の印を付けない (CWE-451) [origin: analyze M-09, security M-101] [unresolved from prev M-09]

- **Where**: data-model.md:18、spec.md:108 (AC4)、tasks.md:45 (FE-010)、tasks.md:52 (FE-014)
- **Action**: 2 つ以上が前方一致したら長さに関わらず `inferred: true`。FE-010 / FE-014 の期待値を直す

### M-09 — URI の要約が host を無条件に出す (CWE-200) [origin: analyze M-10, security M-102] [unresolved from prev M-10]

- **Where**: data-model.md:26-27、research.md:62、tasks.md:45 (FE-010)
- **Action**: host にも `mayCarrySecret` 等の検査を掛け、外れたら `protocol` だけ出す。FE-010 に host の負例を足す

### M-10 — `init-report` / `commands` に流量の上限が無い (CWE-400) [origin: analyze M-11, security M-103] [unresolved from prev M-11]

- **Where**: spec.md:164, :189、data-model.md:80、tasks.md:60-61 (BE-020)、plan.md:10, :130、AD-048 Decision 3
- **Action**: `meter-throttle.ts` を使わない trailing emit の合流を `live-signals.ts` に置く (AD-048 に反しない)。BE-020 / SH-020 のテストを替える。採らないなら plan の Risks に明記

### M-11 — P3 はドット呼び出しの形しか見ず、計算キーを塞がず `UNDETECTED_NOTES` への記録も無い [origin: analyze M-12, platform-boundary M-201] [unresolved from prev M-12]

- **Where**: tasks.md:86 (BE-040)、research R-06、`check.mjs:917-924`
- **Action**: P3 に計算キーの形を足し fixture を置く。分割代入と `.call` は `UNDETECTED_NOTES` に記録する

### M-12 — 型の網羅の変更系 union と `QUERY_MUTATION_METHODS` (JS) を機械でつなぐ検査が無い [origin: platform-boundary M-202, architecture M-201] [new]

- **Where**: tasks.md:86 (BE-040)、research.md:55、quickstart.md:7, :9、`allowlists.mjs:420-427`、`check.mjs:51, :918`、`tsconfig.node.json:3-11`
- **Issue**: union に足して配列に足し忘れると tsc も pin テストも緑のまま項目 16 が見逃す。H-03 の隙間が移っただけ
- **Action**: pin テストが `sdk-agent-session.ts` のソースから union のリテラルを抜いて `QUERY_MUTATION_METHODS` と集合一致を確かめる (または SDK を import しない `as const` 配列を正本にする)。SC-005 の計測経路に書く

### M-13 — スラッシュコマンドの名前の書式 (`init.slash_commands` と `commands` の先頭 `/`) が揃うか決まっていない [origin: analyze N-01] [new]

- **Where**: data-model.md:90-94、spec.md:192 (FR-008)、tasks.md:34-35 (FE-001)、`sdk.d.ts:5504`, `:8698`
- **Issue**: 書式が違えば説明の引き当てが黙って失敗し H-02 が戻る。テストは同じ書式の fixture なので気付けない
- **Action**: 先頭の `/` を 1 つ外して比べる等の規則を data-model §2 に書き、FE-001 / FE-021 に「`init` に `/a`、`commands` に `a`」の fixture を足す。V-3 で `init` の書式を確かめる

## Low (Total: 25)

| ID | Summary | Where | Origin | Prev |
|---|---|---|---|---|
| L-01 | 「ほか N 件」の単位 (一覧ごと vs 全体 1 つの `omitted`) がずれる | spec.md:160、data-model.md:76, :106 | analyze L-01 | unresolved |
| L-02 | FR-014「固定テストを直す」→「足す」 | spec.md:210、plan.md:133 | analyze L-02, arch L-106 | unresolved |
| L-03 | BE-010 のパス `src/agents/live-message.ts` は誤り (`src/domain/session/`) | tasks.md:43、spec.md:47 | analyze L-03 | unresolved |
| L-04 | 送るかの判定の置き場が `run()` closure と `createLiveSignals` closure で違う | data-model.md:80、tasks.md:60 | analyze L-04 | unresolved |
| L-05 | 「BE-040 の `init` の観点」が O-4 の ID と衝突 | tasks.md:61 | analyze L-05 | unresolved |
| L-06 | research の「#16〜#18」は「#17 / #18」 | research.md:73 | analyze L-06 | unresolved |
| L-07 | 新しいモジュールは 6 ではなく 5 | plan.md:33 | analyze L-07 | unresolved |
| L-08 | FR-001「値を見出しに出さない」と FR-002 の URI の要約がぶつかる | spec.md:176, :179 | analyze L-08 | unresolved |
| L-09 | 「最初のターンの後に出ます」→「始まると出ます」 | data-model.md:110, :159 | analyze L-09, po L-001 | unresolved |
| L-10 | 承認カードが出ない権限モードと拒否後の流れを V-3 で確かめていない | quickstart.md:23 | analyze L-10, po L-002 | unresolved |
| L-11 | Q2 の不利益が spec の「義務の扱い」に無い | spec.md:59-60 | analyze L-11, po L-003 | unresolved |
| L-12 | O-10 の domain の決定を AD-048 Decision 1 への参照つきで記録する箇所が無い | tasks.md:101 (SH-012) | arch L-101 (analyze は resolved と判定) | unresolved |
| L-13 | ui charter :50 の slash commands の分担を O-3 の先例の形で書いていない | tasks.md:104 (SH-013) | arch L-102 (analyze は resolved と判定) | unresolved |
| L-14 | ui / session charter の `related_adrs`・Related ADRs・`related_specs` の追随漏れ | tasks.md:104-105 | analyze L-14, arch L-103 | unresolved |
| L-15 | `transcript-context.ts:32`「値は数だけ」の docblock 修正が FE-011 に無い | tasks.md:46 | analyze L-15, arch L-104 | unresolved |
| L-16 | 過去ログの `answers` を出所未確認のまま「選ばれた回答」と表示 | data-model.md:168、spec.md:111 | analyze L-16, sec L-101 | unresolved |
| L-17 | SH-002 の `npx assistant-ui@latest` の版固定と差分確認の手順が無い | tasks.md:20 | analyze L-17, sec L-102 | unresolved |
| L-18 | テストが M-08 / M-10 の今の振る舞いを固定、host の負例も無い | tasks.md:45, :52, :61 | analyze L-18, sec L-103 | unresolved |
| L-19 | 名前の allowlist が絶対パスの形を通す | data-model.md:71、tasks.md:31 | analyze L-19, pb L-201 | unresolved |
| L-20 | AC4「同じ長さで複数に一致」は名前の重なりでしか起きず、重なりの規則が無い | spec.md:108、data-model.md:18 | analyze N-02 | new |
| L-21 | BE-040 は BE-020 / BE-031 と同じ `sdk-agent-session.ts:91-108` を触るのに「独立」 | tasks.md:86, :60, :75, :128 | analyze N-03 | new |
| L-22 | `commands` が最初の `init-report` より先に届く順序を合流の規則が定めていない | data-model.md:90、tasks.md:35, :65 | po L-004 | new |
| L-23 | 出所の違う同名コマンドに古い `commands` の説明が付きうる (CWE-451) | data-model.md:91, :94、spec.md:130, :192 | sec L-104 | new |
| L-24 | 「呼ばない読み取り」9 個の呼び出しに自動検査が無いのに SC-005 が自動だけで満たすように読める | spec.md:237、quickstart.md:9 | pb L-202 | new |
| L-25 | FE-001 の「同じファイルに置く」がどのファイルか決まらない | tasks.md:34 | arch L-201 | new |

## Dedup log (要約)

| Merged | Key |
|---|---|
| analyze M-01, po M-006, arch L-105 | FE-012 / spec.md:109 |
| analyze M-02, arch M-101 | data-model.md:111 |
| analyze M-04, po M-002 | spec.md:131 (US-2 AC5) |
| analyze M-05, po M-003 | data-model.md:109 |
| analyze M-06, po M-005 | data-model.md:110 |
| analyze M-07, arch M-102 | FR-014 |
| analyze M-08, arch M-103 | data-model.md:96 / Principle XIV |
| analyze M-09, sec M-101 | data-model.md:18 |
| analyze M-10, sec M-102 | data-model.md:26-27 |
| analyze M-11, sec M-103 | data-model.md:80 / FR-007 |
| analyze M-12, pb M-201 | tasks.md:86 (BE-040) |
| pb M-202, arch M-201 | tasks.md:86 (BE-040) / QUERY_MUTATION_METHODS |
| analyze L-02, arch L-106 | spec.md:210 |
| analyze L-09, po L-001 | data-model.md:110 |
| analyze L-10, po L-002 | quickstart.md:23 |
| analyze L-11, po L-003 | spec.md:59-60 |
| analyze L-14, arch L-103 | tasks.md:104-105 |
| analyze L-15, arch L-104 | transcript-context.ts:32 |
| analyze L-16, sec L-101 | data-model.md:168 |
| analyze L-17, sec L-102 | tasks.md:20 |
| analyze L-18, sec L-103 | tasks.md:45, :52, :61 |
| analyze L-19, pb L-201 | data-model.md:71 |

## Enforcement

- viewpoint coverage: 4 reviewer トラックとも A-H 欠落なし (analyze は適用外)
- cascade demotions: 0 (Critical 申告なし)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
