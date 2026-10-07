# Design Gate: 計量と制限の表示 (O-4)

**Run**: 2026-10-07T18:40:52+09:00 (Round 2。2026-10-07 の再開後の版)
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [design-gate.md.20261004T063000](./design-gate.md.20261004T063000) (Round 1。Critical 0 / High 7)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 2    | 7      | 11  |
| po-reviewer                | 0        | 1    | 9      | 7   |
| architecture-reviewer      | 0        | 1    | 4      | 3   |
| security-reviewer          | 0        | 0    | 3      | 4   |
| platform-boundary-reviewer | 0        | 2    | 0      | 3   |
| **Total (dedup)**          | **0**    | 6    | 14     | 22  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 7    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 6    |

前回の High 7 件 (H-01〜H-07) は、全トラックが resolved と判定した。今回の High 6 件のうち 2 件は、前回の Medium が残って格上げされたものである。HG-02 は R1 sec M-006 の残り、HG-06 は R1 pb M-001 に追加事実がついたもの。

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。High 6 件は `/cl-implement` の前に `Agent(designer)` で手当てすることを勧める。このうち 2 件は人間の判断が要る:
- HG-04: AD-047 Decision 5 の字面を訂正節で直すか、後続の ADR を起こすか
- HG-01 (b): `toolUseId` を運ぶことを訂正として扱うか、決定の変更として扱うか

## Critical (Total: 0)

なし。cascade_enforce による降格も 0 件。

## High (dedup 後 6 件)

| ID | 内容 | 出所 | Where | Action | prev |
|---|---|---|---|---|---|
| HG-01 | accepted の AD-047 の字面が設計と食い違う。Decision 4 / Consequences は Context display の材料を result の `usage` とするが、設計は主ループの assistant の入力側の usage を使う。Decision 2 は運ぶ値を「数・真偽・列挙・モデルの id」に限るが、`tool-elapsed` は `toolUseId` を運ぶ。plan は ADR の本文を直さないと決めている | arch H-101 / analyze I2 / sec L-004 | AD-047:35,38,48 / spec.md:43,68,188 / plan.md:12,253,255,256 / data-model.md:43,62-63 / tasks.md:148 | AD-031 Decision 1 に従い、AD-047 に日付つきの訂正節を足す。spec / plan の字面を直し、SH-013 の「本文は変えない」を改める。(b) の `toolUseId` を決定の変更とみなすなら後続の ADR にする (人間が判断) | new |
| HG-02 | 実機の形を確かめる手順 (quickstart V-4 #1 / #4) に、生の値を取る手段が無い。設計は subtype / `api_error_status` / `error` / 単位をどこにも出さず、agents に記録の出力は 0 件。V-4 #3 の結果にも行き先が無い。本番でも、`provider-error` に倒れた形を後から知る観測点が無い | po H-001 / sec M-002 / arch M-104 / po M-009 | quickstart.md:28,31 / plan.md:277-279 (RK-06〜08) / tasks.md:149 (SH-014) / data-model.md:22,25 | quickstart にアプリの外で取る手順を書く。例: 同じ Provider で `claude -p --output-format stream-json --verbose` を走らせ、許可リストの数と列挙だけを控える。SH-014 の後追いに V-4 #3 を足す。アプリの中の診断の経路は、足すか、足さない理由を Risks に書くかを決める | new (R1 sec M-006 の残り) |
| HG-03 | `modelId` の規則 `^[A-Za-z0-9.:@/-]{1,128}$` が既存の `isValidModelId` より狭く、`[1m]` 付きや `_` を含む id を落とす。主モデルが落ちると、別のモデルの `contextWindow` で割って割合を誤る。逆向きの穴もあり、scheme の無い userinfo の形 `u:p@h/m` は通る | analyze D1 / sec L-002 | data-model.md:82,188 / BE-001 / FE-032 / src/domain/provider/model-catalog.ts:26 | 正本を `isValidModelId` に一本化し、`//`・`mayCarrySecret`・`:` の後ろの `@` を落とす条件を `meter.ts` に置く。`[1m]` と `u:p@h/m` の fixture を足し、起動設定の id と `modelUsage` の key の照合規則を §4 に書く | new |
| HG-04 | AD-047 Decision 5 は「昇格値のリテラルは domain だけに置く」と書く。一方で設計は renderer の `features/chat/labels.ts` に `acceptEdits` / `bypassPermissions` / `auto` を key にした表示名の表を置く。plan の ADR 節はこの差に触れていない | analyze I1 | AD-047:37 / data-model.md:56,220 / plan.md:263 / research R-15 / FE-040 | 利用者が判断する。(a) ADR の意図が「`src/agents/` に置かない」なら字面の誤りとして訂正節で直す。(b) 決定の変更なら後続の ADR を起こす。少なくとも plan の ADR 節に差と扱いを 1 行書く | new |
| HG-05 | U-6 の警告の帯 (AC1a / P1) が権限モードを `status` の省略可能な `permissionMode` だけから読み、SDK がターンごとに必ず送る `system/init` の `permissionMode` を読まない。起動の直後から昇格しているセッションや、`status` を伴わない変化を検知できない | pb H-001 | data-model.md:65 / plan.md:280 (RK-09) / quickstart.md:32 / docs/ui-coverage.md:49 / sdk.d.ts:5467-5503 | 許可リストに `system`/`init` の `permissionMode` だけを読む行を足す (`cwd` などのパスは読まない)。RK-09 を「init と status の両方で比べる」に直す。BE-040 に重複しないテストを足す | new |
| HG-06 | 警告の帯の隔離の文言が、ランタイムの能力 (`autoModeStatus`) をセッションの隔離状態として扱う。アプリはセッションで sandbox を有効にする経路を持たないのに、主な開発ホストでは `allowed` になり「隔離がありません」が出ない。isolation charter :119 と runtime charter :113-114 に反する | pb H-002 | data-model.md:169,233 / spec.md:70,151 / tasks.md:105-106 (FE-040) / src/agents/session-core.ts:46-55 | `allowed` / `undetermined` のどちらでも「このセッションの隔離をアプリは確かめていません」を出す。FE-040 のテストを直し、roadmap の I-2 / I-3 に暫定であることを書く (SH-013) | unresolved from prev (R1 pb M-001 → 格上げ) |

## Medium (dedup 後 14 件)

| ID | 内容 | 出所 | Where |
|---|---|---|---|
| MG-01 | 間引きの鍵の上限 64 に、鍵を外す条件が無い (task の鍵は `finish()` まで外れない)。上限が埋まると、tool の経過時間と task の進み具合が黙って出なくなる。保留から送る順 (公平性) と `task_id` の形の検証も無い。FR-013「task ごとの状態を持たない」の字面とも食い違う | analyze U2 / sec M-001 / arch M-102 / analyze I5 | data-model.md:107-110,139 / tasks.md:110-111 (BE-041) / spec.md:210 |
| MG-02 | `resetsAt` を過ぎた後の Quota banner の扱いが無い。「上限に達しました」が次の event まで残る | po M-002 / analyze E1 | data-model.md:153-164 / spec Edge Cases / FE-020 |
| MG-03 | US-3 AC2 は「assistant の応答」で目盛りが出るとするが、`contextWindow` と費用は result からしか得られず、最初のターンは出ない。閾値 (超える / 以上) と `usageAwaitFirst` の文言もずれている | analyze U1 / po L-001 | spec.md:133 / data-model.md:188-190,227 / FE-032 |
| MG-04 | AC が 2026-10-07 の FR / data-model の判断に追随していない。US-4 AC1 の権限モードの行、US-4 AC4 / FR-012 の「Reasoning の表示に」、US-3 AC1 の拒否の件数の行数。SC-003 が AC を参照するので計測がぶれる | po M-003 / analyze I3 | spec.md:132,150,154,209,260 / data-model.md:168,180-181,196 / research R-07 |
| MG-05 | session のコードへの変更が U-1 の承認の字面より広い (FR-018 / FR-019 / `runtimeAutoMode` / `PERMISSION_MODE_LABELS`)。plan はそれを全部 U-1 の例外と書いている。ui charter の In scope と session charter の記録にも漏れがある | arch M-101 / analyze I4 | plan.md:78,235 / spec.md:66 / tasks.md:143-144 (SH-013) |
| MG-06 | 圧縮の行は `compact_result` でしか閉じない。結果が来なければ、ずっと「圧縮中」のまま残る | analyze E2 | data-model.md:137 / BE-042 |
| MG-07 | Quota banner の文言の組み合わせが状態と合わない。`allowed_warning` で `quotaWait` (送るのを止める案内) が出る。失敗したセッションでは FailureBanner と逆の操作を案内する | po M-001 | data-model.md:158-162,230 / spec.md:115,161,171 / FE-020 |
| MG-08 | `SDKAssistantMessageError` の 13 値のうち 6 値 (`overloaded` / `model_not_found` など) の扱いが §1 に無く、再ログインの導線に倒れる | po M-004 | data-model.md:13-22 / BE-011 |
| MG-09 | API 到達不可・オフラインの edge case が無い。再試行の行は、列挙の `error` と数だけの `no_response` を捨てている | po M-005 | data-model.md:5,66 / spec.md:162,198 |
| MG-10 | 実機の形を待つ間の暫定の文言にログインしか無く、課金の手当てが無い。「クレジットを確認」の案内が消えうる (regression) | po M-006 | data-model.md:20-21,207,211 / plan.md:277 |
| MG-11 | 権限モードの警告の帯に次の操作が無い。セッションの終了後も `role="alert"` で残る | po M-007 | data-model.md:232 / spec.md:151,171 / FE-040 |
| MG-12 | US-4 は P2 だが Tier A の `status` を含む。Why の文意も逆になっている | po M-008 | spec.md:37,140,144 |
| MG-13 | 「ターン数」が SDK の往復の数 (`max-turns`) とアプリが受けた result の数の両方を指す (Principle XIV) | arch M-103 | data-model.md:178,204,212,225 / spec.md:163,180,202 / glossary.md:184 |
| MG-14 | `tool-registry.aui.tsx:36` が tool 名を prototype を持つ object から引く。`constructor` などの名前で描画が例外を投げ、ErrorBoundary が無いので renderer 全体が落ちる (scope: system。FE-043 で取り込むのが安い) | sec M-003 | src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx:36 |

## Low (dedup 後 22 件)

- LG-01 FR-019: 承認が続けて来たときのフォーカスの行き先と、「さらに表示」の行き先・呼び名 (po L-004 / analyze E3 / analyze T1)
- analyze: I6 (SC-007 の計測範囲が 3 通り)、C1 (FR-030 への参照が残る)、S1 (行番号のずれ)、S2 (SC / Decision の並び)、A1 (承認済みのものに残る [ASSUMED])、U3 (`openRetryRowId` の消し方)、T2 (新しい語が glossary の一覧に無い)、A2 (SC-004 の件数の対象)
- po: L-002 (累計の注記)、L-003 (ヘッダの費用の注記と使用量のタブの入口)、L-005 (FR-017〜019 の受け手と AC)、L-006 (他のセッションに帯を出さないことを Out of Scope に書く)、L-007 (KPI「並列時の滑らかさ」の計測。system)
- arch: L-101 (glossary の Quota banner と SH-002 の順序)、L-102 (session の labels が chat に依存する。charter の記録)、L-103 (自作率の照合の候補)
- sec: L-001 (`system-event.ts:117` の prototype のキー)、L-003 (SH-002 に安全の観点が無い)
- pb: L-001 (項目 16 は引用符の 2 形しか見ない。system)、L-002 (`dispose()` の後の呼び出し)、L-003 (昇格の観測を記録しない。I-3 への申し送り)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
