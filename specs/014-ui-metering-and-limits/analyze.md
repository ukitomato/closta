## Specification Analysis Report — 014-ui-metering-and-limits (Track A / design-gate R3。2026-10-08 の版)

対象: spec.md / plan.md / tasks.md / data-model.md / research.md / quickstart.md。照合先: constitution v1.4.0、ui charter、_overview、glossary、AD-047 (と plan が引く AD-031 / AD-041 / AD-044 / AD-046)、前回の design-gate.md.20261007T184052 (R2) と前回の analyze.md。コードの事実も照合した: `model-catalog.ts:26-35`、`system-event.ts:47`、`launch-config.ts:19-29`、`runtime/dto.ts:55-57`、`runtime/capabilities.ts:149`、`check.mjs:827-916`、`session/labels.ts:20-83`、`tool-registry.aui.tsx:36`、`<ToolResultMarks` の呼び出し 7 か所、`sdk.d.ts` (:3315-3334 / :3411 / :5465-5492 / :5651-5686)、`ui-coverage.md` の `後続: O-4` の 10 行。読むだけでファイルは書いていない。`.specify/extensions.yml` に `before_analyze` / `after_analyze` の hook は無い。

| ID | Category | Severity | Location(s) | Summary | Recommendation | 前回 |
|---|---|---|---|---|---|---|
| U2 | Underspec (間引き) | HIGH | data-model §2「間引きと後始末」(L110-113)・「renderer の保持」`toolElapsed` (L127) / BE-041 (tasks L110-111) / SC-004 (spec L263) / FR-012・FR-013 | 「同時に追う鍵は 64 まで。超えた新しい鍵は捨てる」とあるが、鍵を外す条件が無い。取り消しは「保留を捨てる」とだけ書き、枠を空けるとは書いていない。task の鍵は `finish()` まで外れない。字面どおりに作ると、セッションの 65 個目以降の tool / task の経過時間と進み具合が何も知らせずに出なくなる (FR-012 / FR-013 が満たされない)。BE-041 のテストは「65 個目の鍵を捨てる」だけを固定し、外す側を固定しないので、壊れた実装でも緑になる。renderer の `toolElapsed` は逆に「古いものから落とす」で、2 つの層の方針も揃っていない。保留が 20 件を超えたときに送る順 (公平性) と、`task_id` の形の検証も無い | 鍵の寿命を §2 に書く (tool の鍵は `tool_result` と result で外す・task の鍵は一定時間更新が無ければ外す・送った後に 1 間隔の値が無ければ外す、など)。保留から送る順 (古い順か巡回) を書く。BE-041 に「先の鍵が外れた後の 65 個目は受ける」「20 件を超える鍵も最後にはすべて送られる」を足す。renderer の 64 の方針を agents と同じ向きにするか、違う理由を書く | 前回から未解決 (R2 analyze U2 / MG-01 = sec M-001・arch M-102。Medium から格上げ: 性能の属性が曖昧で、字面どおりの実装をテストが通してしまうため) |
| U1 | Underspec / AC と導出が合わない | MEDIUM | spec US-3 AC2 (L135) と data-model §4「目盛り」(L201-202) / FE-032 (tasks L90-91) | AC2 は「assistant の応答が届いた」ら割合と費用の目盛りが出て、「80% を超えると」注意とする。しかし `contextWindow` も費用も `lastTurn` (result) からしか得られないので、最初のターンは result まで割合が出ない。`contextUsed` があって `lastTurn` が無いときの振る舞いは §4 に明示が無く、FE-032 のテストにも無い。閾値も、AC2 の「超える」と §4 の `ratio >= 0.8` でずれる | AC2 の Given を「最初の result の後 (以降は主ループの assistant ごとに更新)」に直し、閾値の書き方を揃える。§4 と FE-032 に「`contextUsed` あり・`lastTurn` 無し → コンテキストの目盛りを出さない」を足す | 前回から未解決 (U1 / MG-03) |
| I3 | Inconsistency (置き場所) | MEDIUM | spec FR-012 (L211)・US-4 AC4 (L156)・SC-003 (L262) と research R-07 (L85) / data-model §4「進み具合」(L208) / FE-044 | spec は思考のトークン数を「Reasoning の表示に」出すとする。設計は viewport の footer の composer の上に、Reasoning の語彙で出す (Reasoning の part はまだ無いため) | FR-012・AC4・SC-003 を「実行中の transcript の末尾の思考の印 (Reasoning の語彙)」に直す | 前回から未解決 (I3 / MG-04 の一部) |
| I7 | Inconsistency (AC と FR / data-model) | MEDIUM | (a) spec US-4 AC1 (L152) と FR-010 (L209) / data-model §4 (L171) / FE-041。(b) spec US-3 AC1 (L134)・FR-008 (L204) と data-model §4 (L187-188) / research R-08 / FE-031 | (a) AC1 は「『概要』のタブの権限モードが今のモードになる」とする。FR-010 は「起動時の権限モード」の行を起動時の値のまま残し、違うときだけ「現在の権限モード」の行を足す。(b) AC1 と FR-008 は拒否の件数を 1 項目 (聞かれずに) とするが、設計は 2 行 (聞かれずに / SDK の記録)。SC-003 は AC を計測の基準にするので、どちらで測るかがぶれる | US-4 AC1 を FR-010 の書き方に揃える。US-3 AC1 と FR-008 を 2 行に揃える | 前回から未解決 (MG-04 = po M-003 の残り) |
| E1 | Edge case | MEDIUM | data-model §4「Quota banner」(L156-167) / FE-020 | 帯が消えるのは `allowed` の event が届いたときだけ。`rejected` のまま `resetsAtSec` を過ぎると、過去の時刻を示した「上限に達しました」が次の要求まで残る | 解除の時刻を過ぎたときの扱い (帯を消す / 「解除の時刻を過ぎました」に変える) を決め、FE-020 にテストを足す | 前回から未解決 (E1 / MG-02) |
| U4 | Underspec (文言の組み合わせ) | MEDIUM | data-model §4 Quota banner の表 (L158-162)・L165 / §5 `quota*` (L242) / spec US-2 AC2 (L117) / FE-020 | 状態ごとにどの文言を並べるかが、表と本文で分かれている。`rejected` の行は `quotaRejected` だけで、AC2 の「解除の時刻まで待つことを案内」に当たる `quotaReset` / `quotaWait` が表に無い。一方 L165 は `resetsAtSec` が null なら「しばらく待ってから」を出すとしており、`allowed_warning` (注意だけ) でも送るのを控えさせる案内になりうる。失敗したセッションでは、帯の「送ってください」と FailureBanner の「起動し直してください」が別の操作を案内する | 状態 × `resetsAtSec` の有無の組ごとに、並べる文言を §4 の表に書く。セッションが失敗・終了した後の帯の扱い (出さない / 文言を変える) を決める | 前回から未解決 (MG-07 = po M-001) |
| E2 | Edge case | MEDIUM | data-model §3 `compaction` (L140)・L146 / BE-042 | 圧縮の行は `compact_result` (省略可能。R-02) でしか閉じない。結果が来ないまま `status` が null / `requesting` に戻ると、セッションが続く間「圧縮中」のまま残る。L146 の「結果不明」の規則は終了したときの話で、稼働中は効かない。次の圧縮も開いたままの行に吸収される | 次の非 `compacting` の `status`、または主ループの assistant で閉じる規則 (結果不明) を決める。BE-042 にテストを足し、V-4 #7 で実機の形を記録する | 前回から未解決 (E2 / MG-06) |
| I4 | Inconsistency (charter) | MEDIUM | plan「Domain charter の整合」(L78) / FR-016 (L227) / SH-013 (tasks L143-144) と ui charter In scope (L53-59) | U-1 の例外 (ui の feature が session の契約と操作 UI を変える) は session charter と AD-047 にだけ記録され、ui charter は Related Specs に足すだけ。O-3 の前例は例外を ui charter の In scope に書いた。session のコードの変更も U-1 の文面より広い (`runtimeAutoMode` の追加・`PERMISSION_MODE_LABELS` の出所の変更・`LivePane` からの context の供給)。plan の例外の列挙にこれらが無い | ui charter の In scope (observability 系の表示の項) に O-4 の U-1 の例外を 1 行足す (SH-013)。plan の例外の列挙と session charter の記録に上の 3 つを足す (FR-018 / FR-019 は「義務の扱い」の表を根拠として引く) | 前回から未解決 (I4 / MG-05) |
| C2 | Coverage (失敗の形) | MEDIUM | data-model §1 (L11-22) / §5 (L219, L223) / BE-011 / sdk.d.ts:3411 | `SDKAssistantMessageError` の 13 値のうち 6 値 (`overloaded` / `invalid_request` / `model_not_found` / `server_error` / `unknown` / `max_output_tokens`) が §1 の表に無い。subtype が `success` で `is_error: true`、状態の無い result にこれらが付くと `provider-error` になり、再ログインを案内する (US-1 が直したい誤案内そのもの)。また、今の `provider-error` の文言にある「クレジット」の案内が消えうる。課金の失敗が `billing_error` を伴わずに `error_during_execution` か状態つきで届くと、`execution-error` / `api-error` の文言 (ログインの案内だけ) になる | 6 値の行き先を §1 に書く (例: `overloaded` / `server_error` → `api-error`、`model_not_found` / `invalid_request` → 設定を見直す案内、`max_output_tokens` → `execution-error`)。実機の形を確かめるまでの暫定の文言に「クレジット」を添えるかを決める。BE-011 の fixture に足す | 前回から未解決 (MG-08 / MG-10 = po M-004・M-006) |
| E4 | Edge case (接続の失敗) | MEDIUM | spec Edge Cases (L164) / data-model §2 (L69)・§3 `api-retry` (L139)・§5 `retryDetail` (L230) / sdk.d.ts:3315-3331 | `api_retry` の `error` は列挙 (`SDKAssistantMessageError`。sdk.d.ts:3324) で、文字列の「中身」ではない。それでも spec は「中身は出さない」とし、§2 は `error` と `no_response` を読まない。`error_status` が null (応答の無い接続の失敗。sdk.d.ts:3315) のとき、行は HTTP の部分を省くだけで、接続の失敗やタイムアウトと区別できない。API 到達不可・オフラインの edge case が spec に無い | 列挙の `error` と `no_response` の有無 (真偽) を許可リストに入れるかを決める (どちらも列挙・真偽で AD-047 Decision 2 の範囲)。入れないなら、`error_status` が null の行に「接続の失敗」と出すかを §5 に書く。spec の Edge Cases に到達不可・オフラインを足す | 前回から未解決 (MG-09 = po M-005。列挙であるという事実を追加) |
| E5 | Edge case (警告の帯) | MEDIUM | data-model §4「権限モード」(L172-177) / spec AC1a (L153)・Edge (L173) / FE-040 | 権限モードの警告の帯に、利用者が次に取れる操作 (中断・終了・概要で確かめる) が無い。終了・失敗の後も `meters.permissionMode` は残る (Edge「最後の値を残す」) ので、`role="alert"` の帯が出続ける | 帯に次の操作 (導線か案内文) を足すかを決める。終了・失敗の後は帯を出さないか `role` を下げる規則を §4 に書き、FE-040 にテストを足す | 前回から未解決 (MG-11 = po M-007) |
| T3 | Terminology (Principle XIV) | MEDIUM | data-model §4 (L185)・§5 `max-turns` (L216) / spec FR-001 (L182)・US-3 AC1 (L134) / glossary.md:184 / ui-coverage.md:48 | 「ターン数」が 2 つの数を指す。使用量のタブの「ターン数」はアプリが受けた result の数 (R-08)。`max-turns` の文言「ターン数の上限」は SDK の往復の数 (`max_turns` / `num_turns`)。glossary:184 の X-6 の「ターン数」も SDK の値。同じ画面に別の意味で並ぶ | glossary に「ターン」の定義と、往復との区別を足す (SH-001)。`max-turns` の文言か使用量のタブの項目名のどちらかを言い換える | 前回から未解決 (MG-13 = arch M-103) |
| I5 | Inconsistency (書き方) | LOW | spec FR-013 (L212) と data-model §2 の間引きの鍵 `task:<taskId>` (L110) | 間引きの緩衝 (鍵ごとの最新値) は「task ごとの状態を持たない」に反すると読めてしまう | FR-013 か §2 に「間引きの緩衝は task の状態 (種類・一覧) ではない」と 1 行書く | 前回から未解決 (I5) |
| T1 | Terminology | LOW | spec FR-019 (L241)「表示を増やす」と data-model §8 (L279)・FE-050「さらに表示」 | 同じ操作に 2 つの呼び名がある | spec を「さらに表示」に揃える | 前回から未解決 (T1 / LG-01) |
| I6 | Inconsistency (計測範囲) | LOW | SC-007 (L265) / quickstart V-3 (L20) / FE-051 (tasks L130) / FR-016 (L225) | 計測の範囲が 3 通りある (文言の表 / 文言の表とテストの期待値 / `src/renderer` と `e2e` の全体)。`features/provider/useProviders.ts:153` のコメントの「プロバイダ」が FE-051 の対象に無く、FE-051 の完了の条件を満たせない。FR-016 は、該当が 0 件の `provider/labels.ts` を対象に挙げている | 範囲を 1 つに決める。FE-051 の対象に `useProviders.ts:153` を足し、FR-016 の `provider/labels.ts` を直す | 前回から未解決 (I6) |
| C1 | Coverage (残り) | LOW | BE-011 (tasks L60) / FE-010 (L62) / plan の申し送り #20 | 存在しない「FR-030」への参照が BE-011 の対象の外に残る: `session-core.test.ts:379` の describe と、`session/labels.ts:80` の `isReloginFailure` のコメント | BE-011 / FE-010 の対象に足す | 前回から未解決 (C1) |
| S1 | Style (行番号) | LOW | research R-01 / R-11 / R-12、plan、tasks FE-001 / FE-002 / FE-003 / FE-030 / SH-011 | 同じ範囲を文書ごとに違う行番号で引いている: AppShell.test の setup `:43-303` と `:59-303`、`session-view.monitor.test.ts` `:342-380` と `:345-380`、eslint の一覧 `:582-598` と `:582-589`、reviewers.yml `:42-64,92-114` と `:54-64/:104-114`、派生値 `:173-248` と `:189-248` | tasks に「Grep で引き直す」があるので実害は小さい。揃える | 前回から未解決 (S1) |
| S2 | Style (順序) | LOW | spec の SC の並び (L264-266: SC-005 → SC-007 → SC-006)、AD-047 の Decision の並び (1, 2, 3, 5, 4) | 番号の順に並んでいない | spec を並べ直す。AD-047 は訂正節を足すときに検討する (本文は書き換えない) | 前回から未解決 (S2) |
| A1 | Ambiguity (承認の状態) | LOW | spec Clarifications (L79)・Assumptions (L254) | 承認済みの U-5 (`errors` を出さない) と、accepted の AD-047 Decision 2 (1 秒に 1 回) に [ASSUMED] が残っている | 承認済みのものから [ASSUMED] を外し、未承認の仮定だけを並べる | 前回から未解決 (A1) |
| U3 | Underspec | LOW | data-model §3 `api-retry` (L139)・L144 / BE-020 | assistant で `succeeded` に閉じたとき `openRetryRowId` を消すかが書かれていない。消さないと主ループの assistant ごとに `succeeded` の更新が流れ、`receivedMessages` に数えられる | 閉じたら消すと明記し、同じターンの後の再試行を同じ行に合成する AC4 との関係も書く | 前回から未解決 (U3) |
| E3 | Edge case | LOW | data-model §8 (L276) / FE-050 | 承認の要求が続けて来たとき、「許可」の後にフォーカスが composer に移り、次の承認カードを飛ばす | 次の pending があればそのカードへ移すか、composer で良い理由を §8 に書く | 前回から未解決 (E3 / LG-01) |
| T2 | Terminology | LOW | data-model §4 / research R-07 / SH-001 (tasks L15) / FR-016 (L222) | 「思考の印」「目盛り」「使用量のタブ」が glossary に足す語の一覧に無い。FR-016 の glossary の列挙には、SH-001 と plan にある「権限モードの警告の帯」が無い | SH-001 と FR-016 の列挙を揃える。3 語は足すか、既存の語の言い換えで済むと書く | 前回から未解決 (T2) |
| A2 | Ambiguity | LOW | spec SC-004 (L263) | 「セッションあたり 1 秒に 20 件以下」がすべての event を指すのか、間引きの対象の合計なのかが spec に無い (plan L26 と data-model L111 は後者) | SC-004 に「間引きの対象の合計」と書く | 前回から未解決 (A2) |
| I8 | Inconsistency (優先度) | LOW | spec US-4 (L142-146)・L37 | US-4 は P2 だが、Tier A の `status` (権限モードの変化・圧縮) を含む。「なぜ今」は Tier A を理由に挙げている。AC1a だけが P1。1 つの PR で出すので実害は小さい | US-4 の Why に Tier A の扱いを 1 行書くか、AC1 / AC2 を P1 にする | 前回から未解決 (MG-12) |
| I9 | Inconsistency (ADR の状態) | LOW | spec の判断の表 U-1 (L66)「AD-047 (proposed)」と L42 / L62 / AD-047 frontmatter `status: accepted` | 同じ spec の中で AD-047 の状態が食い違う | U-1 の行を「2026-10-05 に accepted」に直す | 新規 |
| I10 | Inconsistency (記録の追随) | LOW | spec FR-016 (L224, L228) と plan「記録の追随」(L237) / SH-013 (tasks L145) | FR-016 の roadmap の項目は I-3 だけで、plan と SH-013 が足す I-2 の行 (隔離の文言が暫定であること) が無い。「roadmap: O-4 の行」の箇条が 2 つある | FR-016 に I-2 を足し、重複した箇条を 1 つにする | 新規 |
| I11 | Inconsistency (タスクの書き方) | LOW | tasks FE-032 の本文 (L90) と同じタスクのテスト (L91) / data-model §4 (L195-198) | 本文の主モデルの規則が 2 段 (一致 → 出力トークン最多) で、末尾の `[…]` を外して照合する段が抜けている | 本文を §4 の参照にする | 新規 (HG-03 の手当ての残り) |
| S3 | Style (件数) | LOW | plan「レイヤ」(L47)「呼び出し側 6 か所」と tasks FE-043 (L115) / コード (`<ToolResultMarks` は 6 ファイルに 7 か所。subagent に 2 か所) | 件数の書き方がずれる | plan を「6 ファイル 7 か所」に直す | 新規 |
| U5 | Underspec (検証の規則) | LOW | data-model §2 `modelId` (L85) / BE-001 (tasks L39) | scheme の無い userinfo を落とす `/^[^/]*:[^/]*@/` は、パスワードに `/` を含む形 (`u:p/q@h`) を通す。`isValidModelId` は `/` を許す | `:` の後ろのどこかに `@` があれば落とす (`/:[^@]*@/`。Bedrock の ARN と Vertex の `model@date` は通る) か、残る形を BE-001 の fixture で固定する | 新規 (HG-03 の手当ての残り) |
| U6 | Underspec (主モデル) | LOW | data-model §2 の `init` の行 (L67)・§4 主モデルの照合 (L195-200) / plan RK-15 | 主モデルは起動の設定のモデル id で照合するので、セッションの中でモデルが変わる (`/model` など) と、前のモデルの行の `contextWindow` で割り続ける。`init` は各ターンの `model` を運ぶ (sdk.d.ts:5480) が、§2 は `model` を読まない | `init` の `model` (`isValidModelId` と §2 の追加条件で検証する) を照合の第 1 候補にするかを決める。読まないなら、Edge Cases にモデルの切り替えの扱いを書く | 新規 |

### 前回 (R2) の Critical / High の扱い

前回の Critical は 0 件。High は 6 件 (HG-01〜HG-06。前回の analyze の D1 = HG-03、I1 = HG-04、I2 = HG-01 #1)。**6 件とも解決した**。

| 前回 ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| HG-01 (arch H-101 / analyze I2 / sec L-004) | AD-047 Decision 4 / Consequences (Context display の材料) と Decision 2 (tool の id) の書き方が設計と食い違う | **前回から解決** | plan の ADR 節 (L252-263) に差を 3 つ並べた。2026-10-08 に利用者が訂正として扱うと決めた (AD-031)。SH-013 (tasks L148) で AD-047 に日付つきの訂正節を足す。spec の U-3 (L68, L73)・FR-015 (L220)・data-model L55・research R-04 (L64) を直した。残り: AD-047 の本文の訂正は実装の PR (SH-013) で行う。#2 を決定の変更ではなく訂正とみなす判断は人間が記録した (最終の確認は architecture-reviewer) |
| HG-02 (po H-001 / sec M-002 / arch M-104) | 実機の形を確かめる手段が無い・V-4 #3 の結果の行き先が無い・本番で観測できない | **前回から解決** | quickstart に「形の控え方」(L39-54。アプリの外の CLI で数と列挙だけを控え、出力をリポジトリに置かない) を足した。SH-014 に #1〜#5 の直し先 (L151-156。#3 を含む) を書いた。RK-14 (L295) で、アプリの中の観測点を足さない理由と roadmap への記録を決めた |
| HG-03 (analyze D1 / sec L-002) | `modelId` の規則が `isValidModelId` より狭い / `u:p@h/m` を通す | **前回から解決** | data-model §2 (L85) の正本を `isValidModelId` にし、`meter.ts` の条件は 3 つだけ足す形にした。§4 (L195-200) に照合の 3 段を書いた。BE-001 (L39) に `[1m]`・`_`・ARN・Vertex を通し `u:p@h/m` を落とす fixture、SC-002 (L261) に追記、RK-15 を足した。残り: U5・I11 (LOW、新規) |
| HG-04 (analyze I1) | AD-047 Decision 5「昇格値は domain だけ」と、renderer の `PERMISSION_MODE_NAMES` | **前回から解決** | plan の ADR 節 #3 (L258, L263) を利用者が訂正と決めた (2026-10-08)。research R-15 (L151) と SH-013 (L148) にも書いた。`src/agents/` には置かず、項目 16 に例外を足さない |
| HG-05 (pb H-001) | 権限モードを `status` からしか読まず、`init` を読まない | **前回から解決** | data-model §2 (L67) に `init` の行を足した (読むのは `permissionMode` だけで、`cwd` などを読まない)。§3 (L141) は先に観測した方で 1 回だけ行を作る。spec US-4 AC1 (L152) / Edge (L171)、RK-09 (L290)、BE-040 (L103-104) のテスト (`init` だけでの変化・重複しない・他のフィールドに目印の値) を直した。各ターンの最初に `init` が届くことを sdk.d.ts:5480 で確かめた |
| HG-06 (pb H-002。R1 pb M-001 からの格上げ) | 隔離の文言がランタイムの能力をセッションの隔離状態として扱う | **前回から解決** | data-model §4 (L172-176) で `allowed` / `undetermined` を「このセッションの隔離をアプリは確かめていません」、`unavailable` だけを「隔離がありません」にした。§5 (L245)・spec AC1a (L153)・FE-040 (L105-106) のテスト・SH-001・SH-013 (I-2 / I-3) を直した。`AutoModeStatus` の 3 値 (`capabilities.ts:149`) と `autoModeAllowed` を表示に使わない不変条件 (`dto.ts:44-57`) にも合う |

### 前回 (R2) の Medium / Low の扱い

- 前回の analyze の I2 (MEDIUM) は HG-01 #1 と一緒に解決した (前回から解決)。
- 未解決のもの (上の表の「前回」列): MG-01 → U2 (High に格上げ)、MG-02 → E1、MG-03 → U1、MG-04 → I3 + I7、MG-05 → I4、MG-06 → E2、MG-07 → U4、MG-08 / MG-10 → C2、MG-09 → E4、MG-11 → E5、MG-12 → I8、MG-13 → T3、LG-01 → E3 / T1。前回の analyze の LOW (I5・T1・I6・C1・S1・S2・A1・U3・E3・T2・A2) は 11 件とも手当てが無く、同じ ID で残した。
- MG-14 (`tool-registry.aui.tsx:36` が prototype を持つ object から tool 名を引く。system scope) は、コードがそのままで tasks にも無い。security-reviewer の範囲なので、analyze は再判定しない。
- 他のトラックの Low (po L-002〜L-007、arch L-101〜L-103、sec L-001 / L-003、pb L-001〜L-003) は、analyze では再判定していない。

### Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 失敗の理由の分類 | Yes | BE-011, BE-012 | C2 |
| FR-002 理由のキーと文言・導線 | Yes | BE-010, FE-010, FE-011 | C2, C1 |
| FR-003 `meter` | Yes | BE-001, BE-002, BE-004, BE-020, BE-030, BE-040, BE-042, FE-004 | U2, U5 |
| FR-004 行の経路 | Yes | BE-003, BE-020, BE-040, BE-042 | E2, U3 |
| FR-005 稼働中のストアの `meters` | Yes | FE-004 | |
| FR-006 Quota banner | Yes | FE-005, FE-020 | E1, U4 |
| FR-007 再試行の行 | Yes | BE-020, FE-021 | E4 |
| FR-008 使用量のタブ | Yes | FE-031 | I7, T3 |
| FR-009 目盛り | Yes | BE-030, FE-005, FE-032 | U1, I11, U6 |
| FR-010 権限モード | Yes | BE-040, FE-040, FE-041, FE-042 | I7, E5 |
| FR-011 圧縮 | Yes | BE-042, FE-042 | E2 |
| FR-012 経過時間・思考 | Yes | BE-041, BE-042, FE-043, FE-044 | I3, U2 |
| FR-013 task の進み具合 | Yes | BE-003, BE-041, BE-042, FE-042 | U2, I5 |
| FR-014 対応表 | Yes | SH-012 | |
| FR-015 ADR・固定テスト | Yes | BE-002, BE-010, SH-013 | |
| FR-016 記録の追随 | Yes | SH-001, SH-013, FE-051 | I4, I6, I10, T2, T3 |
| FR-017 タブのキー操作とテストの分割 | Yes | FE-030, FE-031 | |
| FR-018 切り出し | Yes | FE-001, FE-002, FE-003 | |
| FR-019 消えるボタンのフォーカス | Yes | FE-050 | E3, T1 |
| SC-001 | Yes | BE-011, FE-010, FE-011 | C2 |
| SC-002 | Yes | BE-001, BE-020, BE-030, BE-040, BE-042, SH-010 | U5 |
| SC-003 | Yes | FE-011, FE-020, FE-021, FE-031, FE-032, FE-040〜FE-044 | I3, I7 |
| SC-004 | Yes | BE-041, BE-042 | U2, A2 |
| SC-005 | Yes | SH-012, SH-014 | |
| SC-006 | Yes | BE-002, BE-010, SH-014 (V-1) | |
| SC-007 | Yes | FE-001〜FE-003, FE-030, FE-050, FE-051 | I6 |

### Constitution Alignment Issues

MUST (I〜VIII) への違反は無い。
- III: 権限モードの選択肢は増やさず、起動の設定とプリセットに書き戻さない。安全 3 値の外を観測したら警告の帯を出すだけ (判定は `isSafePermissionMode`。`launch-config.ts:27`)。
- IV: SDK の呼び出しと query の options のキーの差分は 0。quickstart の `claude -p --output-format stream-json` はアプリの外で人が行う手順で、アプリのコードに stream の解析を足さない (quickstart L41)。
- V: 許可リストで、秘密・パス・会話由来の文字列を運ばない。`init` から読むのは `permissionMode` だけ。`modelId` は `isValidModelId` と追加の 3 条件で検証する (U5 は防御を重ねる観点の LOW)。
- VII: 新しい agents のモジュールは SDK にも Electron にも依存しない。
- 項目 16 (`check.mjs:874-916`): 名前 `launchPermissionMode` と参照 `message.permissionMode` は、`:893` / `:911` / `:843-844` の正規表現に掛からない (大文字小文字を区別する。比較の `===` は `(?![=>])` で外れる)。ただし `:876` は `'auto'` の部分文字列を一致で探すので、`src/agents/` の非テストのファイルには、権限モードと関係の無い `'auto'` も書けない (BE-004 / BE-040 の実装時の注意)。

Standard (IX〜XV): XII は SH-012 を同じ PR で行う。XIII は SH-002 が表示の前にある。XIV は SH-001 がコードの前にあるが、T3 (「ターン数」の 2 つの意味) は XIV の drift (Medium)。XV は文言を `labels.ts` に置く。

AD-031 (Constitution の改定手順 1): AD-047 の 3 つの差は、利用者が 2026-10-08 に「訂正」として扱うと決めた。根拠は「3 つとも採択の時点で設計に既にあった」(plan L252)。#2 (運ぶ値に tool の id を含む) と #3 (「domain だけ」→「`src/agents/` に置かない」) が、事実誤認の訂正であって決定の変更でないかは人間の判断として記録されている。訂正節には、採択の時点の設計 (data-model §2 / §5) を根拠として書くことを勧める。ADR の drift の最終判断は architecture-reviewer の範囲。

### Unmapped Tasks

無い。FR / SC に直接は対応しない次の 4 件も、それぞれ根拠がある。
- SH-002: Principle XIII の照合
- SH-011: plan「機械強制の変更」
- SH-014: 自動の検証と quickstart V-1〜V-3 の記録
- FE-005: FR-006 / FR-009 / FR-010 の受け口

### Metrics

- Total Requirements: 26 (FR 19 / SC 7)
- Total Tasks: 38 (BE 12 / FE 19 / SH 7)
- Coverage: 100% (26/26)
- Ambiguity / Underspec Count: 8 (U1, U2, U3, U4, U5, U6, A1, A2)
- Duplication Count: 0 (前回の D1 は解決)
- Critical Issues Count: **0** / High 1 / Medium 11 / Low 18 (計 30)
- 前回の Critical / High: 前回から解決 6 (HG-01〜HG-06) / 前回から未解決 0。今回の High 1 件 (U2) は前回の Medium (MG-01) を格上げしたもので、新規の High は 0

### Next Actions

- CRITICAL は 0 件で、gate を止める指摘は無い。
- `/cl-implement` の前に HIGH の U2 を `Agent(designer)` で直すことを勧める。data-model §2 に鍵の寿命と、保留から送る順を書き、BE-041 に「外れた後の 65 個目は受ける」「20 件を超える鍵も最後にはすべて送られる」のテストを足す。今のテストの観点のままだと、65 個目以降が出ない実装が緑で通る。
- MEDIUM の 11 件は、spec / data-model / tasks の追記で済む。
  - 書き方を揃えるだけのもの: U1 (AC2 の Given と閾値)、I3 (FR-012 / AC4 / SC-003)、I7 (US-4 AC1・US-3 AC1・FR-008)、I4 (ui charter の In scope に 1 行・plan の例外の列挙)
  - 振る舞いを決めるもの: E1 (解除の時刻の後の帯)、U4 (帯の文言の組み合わせ)、E2 (閉じない圧縮の行)、C2 (6 つの列挙の行き先・暫定の文言のクレジットの案内)、E4 (`api_retry` の列挙 `error` と接続の失敗)、E5 (警告の帯の次の操作と終了後)、T3 (「ターン」の定義を glossary に)
- LOW の 18 件は実装の中で拾える (C1 と I6 は BE-011 / FE-010 / FE-051 の対象に足すだけ。I9〜I11・S3 は文面の直し)。
- 直した後は `/cl-design --spec-dir specs/014-ui-metering-and-limits --from gate` で再開する。

上位 N 件の具体的な直し方 (差分の案) が要るときは、依頼があれば出す (自動では適用しない)。
