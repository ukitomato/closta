# Design Gate: 計量と制限の表示 (O-4)

**Run**: 2026-10-08T01:29:11+09:00 (Round 3。status=implementing からの再レビュー)
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [design-gate.md.20261007T184052](./design-gate.md.20261007T184052) (Round 2。Critical 0 / High 6)
**Warn**: re-run on status=implementing

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 1    | 11     | 18  |
| po-reviewer                | 0        | 0    | 9      | 10  |
| architecture-reviewer      | 0        | 0    | 5      | 6   |
| security-reviewer          | 0        | 0    | 2      | 4   |
| platform-boundary-reviewer | 0        | 0    | 1      | 4   |
| **Total (dedup)**          | **0**    | 1    | 16     | 32  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 0        | 6    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 1    |

前回の High 6 件 (HG-01〜HG-06) は、全トラックが resolved と判定した。今回の High 1 件 (HG-01) は、前回の Medium MG-01 (間引きの鍵の寿命) が残ったもので、analyze が High に格上げした (security / architecture は Medium のまま)。前回の Medium 14 件は、どれも手当てされずに残っている (下の Medium の表の prev 列)。R2 の後の修正が High だけを対象にしたためである。

cascade_enforce による降格は 0 件。viewpoint の欠落は 0 件 (reviewer 4 トラック)。

**Status**: PASS (Critical 0)
**Next**: status は implementing のまま (再レビューのため動かさない)。`/cl-implement` の前に、HG-01 を `Agent(designer)` で手当てすることを勧める。今のテストの観点では、65 個目以降の経過時間が出ない実装でも緑で通る。Medium のうち 2 件は人間の判断が要る:
- MG-11: AD-047 の訂正 #3 の根拠を「2026-10-08 の利用者の判断 (書き誤り)」として書くか、#3 だけを後続の ADR に分けるか
- MG-09: `runtimeAutoMode` と `PERMISSION_MODE_LABELS` の出所の変更が U-1 の承認の外なら、利用者の確認に回すか

## Critical (Total: 0)

なし。

## High (dedup 後 1 件)

| ID | 内容 | 出所 | Where | Action | prev |
|---|---|---|---|---|---|
| HG-01 | 間引きの鍵 (tool / task) の上限 64 に、鍵を外す条件が無い。取り消しは保留を捨てるだけで枠を空けず、task の鍵は `finish()` まで残る。上限が埋まると、以後の tool の経過時間 (FR-012) と task の進み具合 (FR-013) が黙って出なくなる。BE-041 のテストは「65 個目を捨てる」だけで、壊れた実装も緑になる。renderer の `toolElapsed` (古いものから落とす) と方針が揃わない。保留から送る順と `task_id` の形の検証も無い。FR-013「task ごとの状態を持たない」の字面とも食い違う | analyze U2 (High) / sec M-001 / arch M-202 / analyze I5 | data-model.md:110-113,127,142 / tasks.md:50,110-111 (BE-041) / spec.md:212,263 / plan.md:28,244 | §2 に鍵の寿命を書く (例: 保留が無く、最後の送信から 1 秒を過ぎた鍵は外す。tool の鍵は tool の結果と result の取り消しで外す)。保留から送る順を書く。`task_id` に `^[A-Za-z0-9_-]{1,128}$` を当てる。FR-013 を「task の状態を持たない (間引きの 1 秒以内の保留は除く)」と言い換える。BE-041 に次のテストを足す: 鍵が休んだ後に 65 個目が通る / 取り消しで枠が空く / 20 件を超える鍵も最後には送られる / 形の外れた `task_id` では送らない | unresolved from prev (R2 MG-01。Medium → High) |

## Medium (dedup 後 16 件)

| ID | 内容 | 出所 | Where | prev |
|---|---|---|---|---|
| MG-01 | Quota banner の文言の組み合わせが状態と合わない。(a) `rejected` に待つ案内の文言が当たらず、AC2 と食い違う。(b) `resetsAtSec` が無いと、`allowed_warning` でも「しばらく待ってから送ってください」が出る。(c) 失敗したセッションで、FailureBanner の「起動し直す」と逆の操作を案内する。(d) `utilizationPct` が null のときの注意の文言が無い (`quotaWarning` は `{n}` を必ず使う) | po M-001 / analyze U4 / po L-008 | data-model.md:158-165,242 / spec.md:117,163,173 / tasks.md:77 (FE-020) / research.md:44 | R2 MG-07 (+ new (d)) |
| MG-02 | 解除の時刻を過ぎた後の Quota banner の扱いが無い。待機中は event が来ないので、過去の時刻と「上限に達しました」が残る | po M-002 / analyze E1 | data-model.md:156-167 / spec.md:118 / tasks.md:77 (FE-020) | R2 MG-02 |
| MG-03 | AC が FR / data-model に追随していない。(a) US-4 AC1「概要の権限モードが今のモードになる」は、FR-010 (起動時の行は残し、現在の行を足す) と食い違う。(b) US-4 AC4 / FR-012 の「Reasoning の表示に」は、設計 (transcript の末尾の思考の印) と食い違う。(c) US-3 AC1 / FR-008 は拒否の件数を 1 項目とするが、設計は 2 行。SC-003 が AC を基準にするので、計測がぶれる | po M-003 / analyze I3 / analyze I7 | spec.md:134,152,156,204,209,211,262 / data-model.md:171,187-188,208 / research.md:85 / tasks.md:119 | R2 MG-04 |
| MG-04 | 失敗の理由の分類に漏れがあり、暫定の文言が regression を起こす。(a) `SDKAssistantMessageError` の 13 値のうち 6 値 (`overloaded` / `invalid_request` / `model_not_found` / `server_error` / `unknown` / `max_output_tokens`) の扱いが §1 に無く、`provider-error` (再ログインの導線) に倒れる。(b) 実機の形を待つ間の `execution-error` / `api-error` の文言にクレジットの案内が無い。今の `provider-error` の「クレジットを確認」が消えうる (AC3a に反する) | po M-004 / po M-006 / analyze C2 | data-model.md:11-24,219,223 / plan.md:287 (RK-06) / tasks.md BE-011・FE-011 / sdk.d.ts:3411 / src/renderer/src/features/session/labels.ts:31-32 | R2 MG-08 / MG-10 |
| MG-05 | API 到達不可・オフラインの edge case が無い。`api_retry` の `error` は列挙で、`no_response` は数だけなのに、§2 はどちらも読まない。`error_status` が null の行は、接続の失敗と区別できない | po M-005 / analyze E4 | spec.md:164,200 / data-model.md:5,69,139,230 / sdk.d.ts:3315-3331 | R2 MG-09 |
| MG-06 | 権限モードの警告の帯に次の操作が無い。セッションの終了・失敗の後も `role="alert"` で残る | po M-007 / analyze E5 | data-model.md:172-177,244 / spec.md:153,173 / tasks.md:106 (FE-040) | R2 MG-11 |
| MG-07 | US-4 は P2 だが、Tier A の `status` (AC1 / AC2) を含む。Why の主語も US-1〜US-3 になっている | po M-008 / analyze I8 | spec.md:37,142-146 / docs/ui-coverage.md:52 | R2 MG-12 |
| MG-08 | 終了・失敗の後の「最後の値を残す」を、進行中の表示にも当てている。`turn` が来ない終わり方 (クラッシュ・終了・0 に倒した result) では、「思考中 約 N トークン」と tool の経過時間が止まったまま残る | po M-010 | spec.md:173 / data-model.md:105,113,126-127,207-208 / research.md:85 / tasks.md:50,116,120 (FE-004 / FE-043 / FE-044) | new |
| MG-09 | U-1 の承認の範囲より広く、session のコードに手を入れる。対象は FR-018、FR-019 の `focus-handoff`、`RunningSessionsView.runtimeAutoMode`、`PERMISSION_MODE_LABELS` の出所。plan はそれを全部 U-1 の例外と書いている。ui charter の In scope と session charter の記録にも漏れがある | arch M-201 / analyze I4 | plan.md:43,78,213,235 / spec.md:55-56,66 / tasks.md:105,128,143-144 (SH-013) / docs/domains/ui/charter.md:53-59 | R2 MG-05 |
| MG-10 | 「ターン」が 2 つの数を指す。SDK の往復の数と、アプリが受けた result の数である (Principle XIV) | arch M-203 / analyze T3 | data-model.md:185,216,224,237 / spec.md:32,126,134,165,182,204 / docs/glossary.md:184 / tasks.md:15 (SH-001) | R2 MG-13 |
| MG-11 | AD-047 の訂正 #3 は、昇格値の綴りの置き場を renderer の表示名に広げる。その根拠「採択の時点で設計に既にあった」が、記録と合わない。R1 の字面は「domain だけ」で、renderer の表は 2026-10-07 の R-15 が決めた。AD-031 の「何を書いたか」で読むと決定の変更に見え、pr-gate で同じ指摘が繰り返される | arch M-204 | plan.md:252,258,263 / research.md:146-151 / tasks.md:148 (SH-013) / docs/decisions/0047-session-meter-and-failure-reasons.md:37 / design-gate.md.20261004T063000:29 | new |
| MG-12 | 警告の帯の隔離の文言 (R2 HG-06 の手当て) は、isolation の可視化ポリシーにあたる。それなのに isolation charter に記録が無い。I-3 が `SAFE_SANDBOX_KINDS` を移すと文言の意味が黙って変わり、I-2 の隔離バッジと食い違いうる | arch M-205 | data-model.md:172-176,245 / plan.md:213 / tasks.md:105-106,145 / docs/domains/isolation/charter.md:41,119 | new |
| MG-13 | `tool-registry.aui.tsx:36` が tool 名を、prototype を持つ object から引いている。`constructor` などの名前で描画が例外を投げ、ErrorBoundary が無いので renderer 全体が落ちる (scope: system。FE-043 で取り込むのが安い) | sec M-002 | src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx:22,36 / tasks.md:115 (FE-043) | R2 MG-14 |
| MG-14 | quickstart「形の控え方」が、アプリの起動と条件を揃えていない。(1) `CLAUDE_CONFIG_DIR` に画面の host パスを写すと、別の設定ディレクトリになる。(2) `--permission-mode` を渡さないので、安全 3 値のゲートの外で tool が動きうる。(3) `--exec` でなく login shell を通るので、`.bashrc` の鍵や別の claude が効く。(4) API キーをコマンドラインに書くと、シェルの履歴に残る | pb M-001 / sec L-004 | quickstart.md:39-54 (:43,44,52) / src/domain/provider/types.ts:98,114,153 / docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md:76-84,116-118,177 | new |
| MG-15 | 最初のターンの間は目盛りが出ないのに、US-3 AC2 は assistant の応答で出るとしている。`contextUsed` があって `lastTurn` が無いときの振る舞いも無い。閾値 (超える / 以上) と `usageAwaitFirst` の文言もずれる | analyze U1 / po L-001 | spec.md:135 / data-model.md:201-202,239 / tasks.md:90-91 (FE-032) | R2 MG-03 |
| MG-16 | 圧縮の行は `compact_result` でしか閉じない。結果が来なければ「圧縮中」のまま残る | analyze E2 | data-model.md:140,146 / tasks.md BE-042 | R2 MG-06 |

## Low (dedup 後 32 件)

- LG-01 FR-019: 承認が続けて来たときのフォーカスの行き先が無い。「さらに表示」の行き先と呼び名も合わない (po L-004 / analyze E3 / analyze T1)
- LG-02 `modelId` の userinfo の正規表現 `/^[^/]*:[^/]*@/` が、パスワードに `/` を含む形を通す。評価の順も書かれていない (sec L-003 / analyze U5)
- LG-03 主モデルの照合が、assistant の `message.model` と `init` の `model` を読まない。モデルの切り替えも Edge Cases に無い (po L-010 / analyze U6)
- LG-04 glossary に足す語の一覧に、「思考の印」「目盛り」「使用量のタブ」と `PermissionModeKey` (観測した権限モード) が無い。FR-016 と SH-001 の列挙も揃っていない (analyze T2 / arch L-205)
- analyze:
  - I6: SC-007 の計測範囲が 3 通りある
  - C1: FR-030 への参照が残る
  - S1: 行番号のずれ
  - S2: SC と Decision の並び
  - A1: 承認済みのものに [ASSUMED] が残る
  - U3: `openRetryRowId` の消し方
  - A2: SC-004 の件数の対象
  - I9: AD-047 の状態が spec の中で proposed と accepted に食い違う
  - I10: FR-016 に roadmap の I-2 が無い
  - I11: FE-032 の本文で照合の段が抜けている
  - S3: `ToolResultMarks` の呼び出しの件数
- po:
  - L-002: 累計の注記
  - L-003: ヘッダの費用の注記と、使用量のタブの入口
  - L-005: FR-017〜019 の受け手と AC
  - L-006: 他のセッションに帯を出さないことを Out of Scope に書く
  - L-007: KPI「並列時の滑らかさ」の計測 (system)
  - L-009: `/context` と比べる手順への参照が誤っており、手順も無い
- arch:
  - L-201: glossary の Quota banner と SH-002 の順序
  - L-202: session の labels が chat に依存する。ui charter の記録
  - L-203: 自作率の照合の候補
  - L-204: U-2 と plan.md:266 に訂正前の字面が残る
  - L-206: AD-047 の本文を書き換えていないことを確かめる手順が無い
- sec:
  - L-001: `system-event.ts:117` の prototype のキー
  - L-002: SH-002 に、source の安全と lockfile の差分の確認が無い
- pb:
  - L-004: `init` に `permissionMode` が無いときの扱い
  - L-001: 項目 16 は引用符の 2 形しか見ない (system)
  - L-002: `dispose()` の後の `on*` の扱いと、異常終了の経路のテスト
  - L-003: 昇格の観測を記録しないことを I-3 に申し送っていない

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
