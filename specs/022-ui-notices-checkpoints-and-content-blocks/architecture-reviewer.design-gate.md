# architecture-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

- Run: design-gate / round 1 / no previous gate findings
- Reviewer: architecture-reviewer (viewpoint C / D owner)
- Spec: specs/022-ui-notices-checkpoints-and-content-blocks (spec.md, plan.md, tasks.md, data-model.md, research.md, quickstart.md)
- Inputs: constitution (all Principles), ui charter, session charter, `_overview.md`, glossary, AD-044 / AD-047 / AD-049 / AD-056 / AD-060, `docs/ui-coverage.md`, Agent SDK 0.3.270 `sdk.d.ts`, `src/agents/sdk-agent-session.ts`, `src/agents/live-signals.ts`

## 初回読了 viewpoint

- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。L-001 の ADR 帰属の誤りだけ見た
- B. 性能 / 資源: 該当なし: 新しい常駐処理やループは無い
- C. 業務不変条件 / Charter drift: Critical:0 High:2 Medium:2 Low:0 (H-002, H-003, M-001, M-003)
- D. Constitution / ADR drift: Critical:0 High:3 Medium:1 Low:2 (H-001, H-004, H-005, M-002, L-001, L-002)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。FR-011 と AD-060 の文言のずれは H-002 で扱う
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: DB スキーマも永続化も変わらない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0 (H-T1)。BE-010 で `live-signals.test.ts` の既存の期待を保つ (RK-02)、項目 21 の B 節に fixture 6 種がある点は守られている

## スコープ要約

- 新しい domain ファイル 2 つ: `notice-rows.ts` (`toNoticeRow`) と `content-blocks.ts`
- `SYSTEM_EVENT_CATEGORIES` 13 → 20、`TRANSCRIPT_PART_FIELDS` の part 7 → 9 (`server-tool-call` / `unsupported-block`)。`file` part は `{filename, mediaType}` に変わり `text` が消える
- agents 側: system subtype 5 個と top-level の `active_goal` の分岐
- 対応表の B 節を `@anthropic-ai/sdk` 0.125.0 の union と機械照合 (AD-060、proposed)
- Constitution v1.4.1 で Principle XII の Verification を「A・B・C・E 節」に改める
- 変えないもの: `QUERY_OPTION_KEYS`、`SessionEvent` の種類、`AGENT_SDK_ALLOWED_CALLS`、`METER_UPDATE_TYPES`、`src/main`、`src/preload`

## Findings

### [High] H-001 Constitution v1.4.1 を PATCH とする分類が、版の付け方の表から導けない (scope: feature)

- **観察**: plan.md:234 は v1.4.1 を PATCH とし `constitution.md:1055` (「Verification の『現状の制約』を事実に追随させる = PATCH」) を根拠にする。今回は Principle XII Verification (constitution.md:804-811) の Automated の照合範囲を足す (B 節 33 行と `@anthropic-ai/sdk` の版)。これは constitution.md:1052「指針の実質的な拡張 = MINOR」に当たる。AD-060:28 は「事実追随 = PATCH」、AD-060:48 の「適合が違反になることは無い」は MINOR/MAJOR を分ける論拠で PATCH の根拠にならない
- **同種事象探索**: constitution.md:1049-1055 で照合範囲を広げる改定を PATCH とする行 0 件
- **リスク/影響**: 版番号は付け直さないので誤分類は後から直せず、誤った前例になる
- **推奨アクション**: v1.5.0 (MINOR) に改める。PATCH のままなら 1055 に当たる理由を plan.md と AD-060 に明記。plan.md:234 の引用を表の原文に揃える
- **根拠**: constitution.md:1049-1055, :804-811 / plan.md:234 / AD-060:28, :48

### [High] H-002 FR-011 と AD-060 Decision 3 の「実行中と過去ログの両方」が、data-model §2.2 の経路と合わない (scope: feature)

- **観察**: spec.md FR-011 (:194) と AD-060 Decision 3 (:34) は専用の表示を持たないブロックを「実行中と過去ログの両方で」印にすると定める。data-model.md §2.2 (:145-148) では実行中の user message と過去ログの subagent の user の記録は tool_result だけを読む。AD-060 Context (:20) の「黙って捨てている」状態が一部の経路に残る。SC-004 と AD-060 Confirmation (:54) もこの例外を前提にしていない
- **同種事象探索**: data-model.md の tool_result だけを読む経路 2 件 (§2.2)。`live-message.ts` と `transcript.ts` で user 側の扱いが非対称
- **リスク/影響**: FR / ADR の文言どおりに検証すると実装は不合格。実装に合わせると ADR の Decision を事実上縮める
- **推奨アクション**: (a) FR-011・AD-060 Decision 3・SC-004 の範囲を「assistant のブロックと過去ログの主ループの user のブロック」に絞り、外す経路と理由を書く (O-11 U-11 の前例)、または (b) §2.2 の経路にも既定の分岐で印を出す。SC-004 のテストの表にも同じ範囲を書く
- **根拠**: spec.md:194 / data-model.md:145-148 / AD-060:20, :34, :54

### [High] H-003 session の契約を広げるのに、session charter と `_overview.md` への記録が無い (scope: feature)

- **観察**: plan.md:101 は session の契約は変わらないので記録不要とする。しかし `SYSTEM_EVENT_CATEGORIES` に 7 個、`TRANSCRIPT_PART_FIELDS` に 2 part を足し、`file` part から `text` を消す (互換を壊す)。agents に subtype 5 個と `active_goal` を足す。O-5 / O-6 / O-10 は category 追加を session charter に記録した (:303-310, :336)。session charter:165-167 の「`SessionEvent` の種類・`TRANSCRIPT_PART_FIELDS` は変えない」が事実と合わなくなる。`_overview.md`:106-126 に O-12 の行が無い。data-model §5 と SH-010 に両文書が含まれていない
- **同種事象探索**: docs 配下の `TRANSCRIPT_PART_FIELDS`「変えない」3 件 (session charter:167、AD-047:36、AD-048:53)。直すのは session charter:167 だけ
- **リスク/影響**: cross-domain invariant の SSoT が実態と食い違い、後続の reviewer が誤った前提を持つ
- **推奨アクション**: data-model §5 と SH-010 に session charter (O-12 の契約拡張の節と :165-167 の更新) と `_overview.md` (O-12 の行) を足す。plan.md:101 の「記録は要らない」を取り消す
- **根拠**: plan.md:101 / session charter:165-167, :303-310, :336 / `_overview.md`:106-126 / data-model.md §5

### [High] H-004 `active_goal` は `SDKMessage` に含まれず、data-model §1.1 の `case 'active_goal'` はそのままでは型が通らない (scope: feature)

- **観察**: data-model.md:42 は `sdk-agent-session.ts` の `switch (message.type)` に `case 'active_goal'` を足すとする。対象 (sdk-agent-session.ts:830, :837) の型は `SDKMessage`。`sdk.d.ts`:8820 は `StdoutMessage = SDKMessage | SDKActiveGoalMessage | ...` で、`SDKActiveGoalMessage` は `SDKMessage` の外。`docs/ui-coverage.md`:92 も A' 節 (SDKMessage の外) に置く。case に書くと TS2678。`query()` の iterator が実行時に yield するかも未確認なのに、plan.md:62 は「未確定の技術事項: なし」
- **同種事象探索**: `SDKActiveGoalMessage` は `StdoutMessage` の 1 箇所だけ。switch は `conversation_reset` の後が `default:` (:958)。A' 節の型を switch で受ける前例 0 件
- **リスク/影響**: 場当たりの cast で Principle IV の型の境界が弱まる。実行時に届かなければ目標の行は出ない
- **推奨アクション**: plan.md の Risks に RK を足し、型の絞り込み (`default` 内で `unknown` として調べる型ガード、cast 禁止)、届かないときの対応表の経路の書き方、quickstart V-1 の 5 での記録方法を決める。plan.md:62 の「なし」を改める
- **根拠**: data-model.md:42 / sdk-agent-session.ts:830, :837, :958 / sdk.d.ts:8820 / ui-coverage.md:92 / plan.md:62

### [High] H-005 FE-001 の候補比較が registry の Sources だけで、F 節の Web search を見ていない (Principle XIII) (scope: feature)

- **観察**: tasks.md FE-001 と plan.md は web_search の結果の表示を registry の Sources とだけ比べる。`docs/ui-coverage.md`:363 の F 節の Web search (Tier A、`未使用`) の理由は「結果は text で、Sources は作っていない」で、本 feature はこの前提を変える。UnsupportedBlockMark も既存要素との比較記録が無い。data-model §4.3 の F 節の更新行にも Web search が無い
- **同種事象探索**: F 節で本 feature の前提に依存する `未使用` の行 1 件 (Web search :363)。Checkpoints (:250) と Inline citation (:293) は spec で扱われている
- **リスク/影響**: F 節の理由が事実と合わなくなり、項目 21 は割当の文言の真偽を検査しないので機械で見つからない。Principle XIII を満たさない
- **推奨アクション**: FE-001 の比較対象に F 節の Web search と UnsupportedBlockMark の既存要素の候補を足す。data-model §4.3 に Web search の割当の変更 (または理由の更新) を足す
- **根拠**: tasks.md FE-001 / ui-coverage.md:363, :250, :293 / constitution Principle XIII

### [Medium] M-001 版の照合の invariant が Agent SDK を上げる場合しか扱わず、`@anthropic-ai/sdk` が lockfile だけで動く経路を見落としている (scope: feature)

- **観察**: `_overview.md`:181、`docs/discovery.md`、AD-060 Decision 2 (:33) は「Agent SDK を上げる PR」を対象にする。Agent SDK の peer の範囲は `">=0.93.0"` (claude-agent-sdk/package.json:55) で、lockfile 更新だけで `@anthropic-ai/sdk` が上がり項目 21 が落ちうる
- **推奨アクション**: invariant と AD-060 Decision 2 を「Agent SDK または `@anthropic-ai/sdk` の解決後の版が変わる PR」に広げる
- **根拠**: `_overview.md`:181 / AD-060:33 / package.json:55

### [Medium] M-002 AD-060 が proposed のままでも B 節照合の実装 (BE-050) に進める (scope: feature)

- **観察**: SH-010 は AD-060 が proposed のままなら利用者に戻すとするが、実装の開始は design-gate の PASS だけが条件。AD-044 Decision 4 (accepted) は B 節を機械照合しないと決めている
- **推奨アクション**: BE-050 (と Constitution の改定タスク) の前提に「AD-060 が accepted」を足す
- **根拠**: tasks.md SH-010, BE-050 / AD-044 Decision 4 / AD-060 status: proposed

### [Medium] M-003 glossary との用語の衝突と、名付けのずれ (scope: feature)

- **観察**: glossary.md:514 の「Informational notice（知らせ）」は `informational` だけを指すが、spec は「知らせの類」を Notice row の総称に使う。status の token `notice` も別の意味。「知らないブロック」は未知の意味だが `unsupported-block` は型が分かっている `mcp_tool_use` なども覆う。Informational notice の項の Domain 行も更新が要る
- **推奨アクション**: 総称を別の語に分けるか、glossary に両方の項を立てて区別を書く。「知らないブロック」は「表示に対応していないブロック (の印)」にする (quickstart V-3 の 3 と同じ)
- **根拠**: glossary.md:514, :1176 / AD-060:11 / quickstart.md:37

### [Medium] H-T1 捨てる経路と型の絞り込みを固定するテストが無い (scope: feature)

- **観察**: 実行中の user message の tool_result 以外のブロック (H-002) を固定する単体テストが無い。`active_goal` の分岐 (H-004) を typecheck で確かめる手順が無い
- **推奨アクション**: H-002 / H-004 の結論に合わせて BE の単体テストと verify の typecheck の確認を tasks.md に足す
- **根拠**: tasks.md / data-model.md:145-148, :42

### [Low] L-001 markdown の XSS 境界の根拠に AD-034 を挙げているのは帰属の誤り (scope: feature)

- **観察**: spec.md:82, :247 は「markdown の XSS 境界 (AD-034)」と書くが、定めているのは AD-049 Decision 4 と AD-035 Decision 6 (specs 005 / 006 からの既存の書き方)
- **推奨アクション**: 参照を直す。既存 spec の一括修正は棚卸し

### [Low] L-002 Principle XII の Adoption metadata `amended` の更新が data-model §5 に無い (scope: feature)

- **推奨アクション**: §5 と SH 系のタスクに足す (H-001 で版を直すならその版で)

## 同種事象探索 cascade summary

| Finding | 探索 | 件数 | 補足 |
|---|---|---|---|
| H-001 | constitution.md:1049-1055 で照合範囲を広げる改定を PATCH とする行 | 0 | 1052 (MINOR) が該当 |
| H-002 | data-model の tool_result だけを読む経路 | 2 | §2.2 の実行中と過去ログの subagent |
| H-003 | docs 配下で `TRANSCRIPT_PART_FIELDS` を「変えない」とする記述 | 3 | 直すのは session charter:167 だけ |
| H-004 | A' 節の型を `SDKMessage` の switch で受けている前例 | 0 | `SDKActiveGoalMessage` は `StdoutMessage` の 1 箇所だけ |
| H-005 | F 節で本 feature の前提に依存する `未使用` の行 | 1 | Web search (:363) |
| M-001 | `@anthropic-ai/sdk` の版に言及する invariant | 0 | |
| M-002 | AD-060 の status を条件にするタスク | 1 | SH-010 だけ |
| M-003 | glossary の「知らせ」と `notice` の衝突 | 3 | :514、総称、status の token |

## Verdict

- Critical: 0
- High: 5 (H-001, H-002, H-003, H-004, H-005)
- Medium: 4 (M-001, M-002, M-003, H-T1)
- Low: 2 (L-001, L-002)
