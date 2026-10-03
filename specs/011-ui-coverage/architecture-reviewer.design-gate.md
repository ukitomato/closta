# architecture-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: architecture-reviewer (default mode + `scope: adr-drift`)
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-007 (本 feature が実装または影響するもの)
- touched files に該当する charter / Confirmation: ui charter (Scope、業務ルール、KPI「表示網羅」、Open Questions :180-195)、session charter (Open Questions :218-220)、`_overview.md` (Feature 帰属 :60-62、帰属の判断根拠 :85-89、M3 :100)、Constitution XII / XIII / XIV と改定手順 (:284-296)、AD-019 D2 / D3、AD-020 D1 / D2 / Open Questions、AD-034 D1、AD-035 D1 / D4 / Trade-off、AD-036 §4 P1 と AD-041 (g)、AD-043 D2、AD-027、AD-028 §5、AD-031
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:3 Medium:3 Low:2
- D. Constitution / ADR drift: Critical:1 High:2 Medium:4 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (C-001 は AC3 の成否に効くが軸は ADR drift)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (M-006 はレイヤの向きとして D で出す)
- G. optional reviewer 範囲: 該当なし: 永続化スキーマの変更なし
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

対応表 (6 節、A / C / E 節を機械照合)、`coverage.mjs` と項目 21、ui-coverage-reviewer。session の契約を 1 か所広げる (tool_result で同じ id の `message` を送り直す、Hook / task は `event` part の `role: 'system'` のメッセージ)。transcript の密度、直近の活動の整形、Constitution XII / XIII の PATCH v1.2.10、roadmap に O-4〜O-6。plan は ADR を起こさないとしている。

## Findings

### [Critical] Hook のイベントは query の options に `includeHookEvents` が無いと出ない。キー集合は accepted ADR で固定されており、US-2 AC3 は ADR drift なしには満たせない (C-001) (scope: feature)

- **観察**: `sdk.d.ts:1722-1731` — `hook_started` / `hook_progress` / `hook_response` は `includeHookEvents: true` のときだけ全 hook event で出る (既定 false。SessionStart と Setup は常に出る)。`session-core.ts:46-55` の `QUERY_OPTION_KEYS` にこのキーは無く、`:44` は「集合を変えるには ADR が要る」、`session-core.test.ts:191` がリテラルで固定。根拠は AD-036 §4 P1 を読み替えた AD-041 (g) (`0041:125-131`)。spec US-2 AC3 / FR-008 / quickstart V-4-2 は一般の Hook を求め、plan の Constitution Check IV は「分岐を足すだけ」、ADR 節は「起票しない」
- **同種事象探索**: `includeHookEvents` を全体 (node_modules 除く) で 0 件。`QUERY_OPTION_KEYS` の定義は 1 件
- **リスク/影響**: 今の設計では PreToolUse などの Hook は実行中に 1 件も出ず AC3 / V-4-2 は通らない。キーを足すと AD-036 P1 / AD-041 (g) に反する
- **推奨アクション** (人間に諮る): (a) AC3 / FR-008 / V-4-2 を既定で出る Hook (SessionStart / Setup) に限り、他は `後続: <ID>` (理由: `includeHookEvents` の追加には ADR が要る)。(b) `includeHookEvents` を足す後続 ADR (escalation-neutral の検討と `hook_progress` の stdout / stderr の面の評価)。どちらでも research に「SDK が既定で何を出すか」の節
- **根拠**: AD-036 §4 P1、AD-041 (g)、Constitution 改定手順 / Governance

### [High] `role: 'system'` のメッセージに data part を載せると assistant-ui の変換が例外を投げる (H-001) (scope: feature)

- **観察**: data-model §2 は Hook / task を `{ role: 'system', parts: [event] }`、plan / FE-010 は `event` を data part にする。`@assistant-ui/core/src/runtime/utils/thread-message-like.ts:269-273` は system ロールで content が text 1 つでなければ `throw new Error("System messages must have exactly one text message part.")`。今の divider は text 1 つなので通る。`thread.aui.tsx:471` の `SystemMessage` は data part の分岐を持たない
- **リスク/影響**: Hook / task の行が 1 件届いただけで transcript の変換が落ち、実行中も過去ログも描けなくなる
- **推奨アクション**: (i) event のメッセージを `role: 'assistant'` の data part にする、(ii) system のまま text 1 つに直列化して描く、のどちらか。FE-012 に system ロールの制約を固定するテスト。SH-002 にこの制約を入れる
- **根拠**: Principle XIII、AD-035 D1

### [High] task_updated / task_notification だけでは行を作れない。利用者が決めた「状態を保持しない」と両立しない (H-002) (scope: feature)

- **観察**: `SDKTaskUpdatedMessage` は「Clients merge into their local task map.」で `patch.description` は任意。`SDKTaskNotificationMessage` は description も task_type も持たない。renderer の `upsertMessage` は同じ id のメッセージを丸ごと差し替える。agents が task_id ごとに name / detail / skip を覚えないと 2 通目で名前が `''` になり、`skip_transcript` で隠した task も task_updated で現れる
- **リスク/影響**: 実装が黙って session 側に上限なしの task の表を持つ (USER 決定と session charter からの drift) か、行が名前を失い隠すべき task が漏れる
- **推奨アクション**: (a) renderer の upsert で前の値と合わせる (event の part を差分として合成。状態は transcript の配列の中にだけある)、(b) agents が上限つき・セッション寿命の最小の表 (task_id → name / detail / skip) を持つ。(b) なら「状態を保持しない」の範囲を「一覧や集計を持たない」に言い換え、charter に書く前に人間に確かめる。BE-024 に「task_updated だけが来たとき」「skip した task の task_updated」
- **根拠**: session charter :218-220、`_overview.md:88-89`、spec の USER 決定

### [High] system メッセージが末尾に来ると、監視ビューの直近の活動が消える (session domain の不変条件の regression) (H-003) (scope: feature)

- **観察**: `deriveActivity` (`session-view.ts:239-267`) は末尾 1 件だけを見て、assistant / user 以外なら `null`。本 feature は新しい id の system メッセージを末尾に足す (PreToolUse / PostToolUse の Hook は tool のたびに出うる)。`result:<id>` の新しいメッセージも末尾に来る
- **リスク/影響**: O-1 FR-006「直近の活動」を ui の feature が壊す (domain をまたぐ regression)
- **推奨アクション**: FE-030 に「末尾から遡り、`role: 'system'` (event) と結果だけのメッセージを読み飛ばす」。FE-031 にテスト。session charter に規則を記録
- **根拠**: O-1 spec FR-006、`_overview.md` の帰属の判断根拠、Constitution XI

### [High] Constitution の Principle を変えるのに ADR を起こさない (改定手順 1 に反する) (H-004) (scope: feature)

- **観察**: plan の ADR 節は「起票しない」。改定手順 (`constitution.md:286-288`) は既存 Principle の変更に「1. ADR で議論を記録」を求める。改定は XII の判定の意味 (後続 ID も割当) に及ぶ。これまでの Principle の改定はすべて ADR を挙げる (v1.2.5 は方針表の変更)
- **リスク/影響**: M3 の完了判定と今後の UI 系 feature の completed 判定を左右する決定の置き場が、feature 完了後に保守されない data-model と PATCH 行だけになる
- **推奨アクション**: PATCH v1.2.10 という版はそのままでよい。ADR を 1 本 (proposed → 人間が accepted) 起こし、割当の 3 種類と後続 ID の読み方、対応表の節の構成と機械照合の範囲、ToolFallback と Tier の規則、AD-019 / AD-020 の Open Questions への回答を記録する。SH-090 の前に。Sync Impact Report に方針表のどの行で PATCH かを書く
- **根拠**: Constitution 改定手順 1・3、Governance、AD-031

### [High] O-4 / O-5 / O-6 の domain が決まっておらず、`_overview.md` の Feature 帰属表と Milestone 表が更新の対象から漏れている (H-005) (scope: feature)

- **観察**: FR-004 / R-11 は domain を書いていない。roadmap の M3 表と `_overview.md` の帰属表は domain 列を持ち、`_overview.md:100` の M3 は O-1〜O-3。O-5 の Server panel・プラグイン・コマンドは ui charter の Out of scope「他 domain の操作 UI」に当たりうる。O-4 の費用とレート制限は provider / session との境界に触れる。AGENTS.md は domain decomposition を人間の承認とする
- **推奨アクション**: O-4 / O-5 / O-6 の domain を人間に確かめ FR-004 に書く。FR-015 / SH-091 に `_overview.md` の帰属表 (3 行) と Milestone 表 (M3 = O-1〜O-6) を足す。prompts.md に行を足すかを決める
- **根拠**: AGENTS.md、ui charter の Out of scope、`_overview.md`

### [Medium] Constitution XII の `bad_pattern_grep` が、経路の列の `—` を違反として拾う (M-001) (scope: feature)

- **推奨アクション**: 経路の列の空値を `なし` にするか、PATCH で grep を割当の列に限る

### [Medium] Tier (element の実装優先度) を SDK の行に広げているが、決め方がどこにも無い (M-002) (scope: feature)

- **観察**: glossary / ui charter の Tier は element の優先度。FR-002 は SDK の行に Tier を付け判定に使う (ToolFallback の可否、Tier C の対象外) が基準が無い
- **リスク/影響**: Tier A の tool を B と書くだけで ToolFallback のまま通る抜け道
- **推奨アクション**: SH-001 で glossary の Tier に「対応表の行の Tier」の定義と決め方を足す。data-model §1 に「Tier C の行は `表示不要: Tier C (<理由>)`」。reviewer の観点に Tier の妥当性

### [Medium] FR-014 が session の整形の規則を ui の対応表から参照させており、FR-001 の除外の理由と食い違う (M-003) (scope: feature)

- **推奨アクション**: FR-014 の最後の文を「規則の正本は data-model §4 / `session-view.ts`。session charter に記録する」に。対応表の tool の行には参照を置かない

### [Medium] 対応表の書式の正本を spec の中 (data-model §1) に置いている (M-004) (scope: feature)

- **推奨アクション**: 書式の正本を `docs/ui-coverage.md` の凡例 (ADR を起こすならその ADR) に移し、data-model §1 は参照の形に。`coverage.mjs` の冒頭から凡例を指す

### [Medium] 実行中の Background task の一覧の持ち主が、spec と research で食い違う (M-005) (scope: feature)

- **推奨アクション**: FR-004 の O-6 の範囲と spec の Out of Scope を「O-6 で要否を判断。要るなら持ち主の domain を人間に諮る」にそろえる

### [Medium] transcript の文言 (ui) を `features/session/labels.ts` に置こうとしている (M-006) (scope: feature)

- **観察**: 描画は `components/.../thread.aui.tsx` で過去ログと共有。今の elements が import する features は `features/chat/tool-args` だけ
- **推奨アクション**: 文言は `features/chat` の側 (`features/chat/labels.ts` など) か `thread.aui.tsx` の近くに置く

### [Medium] B 節 (中身のブロック) を手で維持するが、型の集合は SDK が import している型から取れる (M-007) (scope: feature)

- **観察**: `sdk.d.ts:1` が `@anthropic-ai/sdk` の `BetaMessage` を import し、content block の union はそこに型として定義されている
- **推奨アクション**: B 節の識別子の集合を取る parse を足す。足さないなら R-01 の理由を事実に合わせ、凡例に「B 節は機械照合の外」と明記する

### [Medium] 送り直しで O-1 の実機計測の観測点 `receivedMessages` の意味が変わる (M-008) (scope: feature)

- **推奨アクション**: 送り直しを数えるかを data-model に書き、数えるなら O-3 の義務の行と 010 data-model に注記

### [Medium] 項目 21 の配線 (check.mjs → violations(21) → 終了コード) を発火で確かめる検査が無い (M-009) (scope: feature)

- **推奨アクション**: (a) 崩した対応表で check.mjs を呼び `[VIOLATE] #21` と非 0 の終了コードを確かめるテスト、(b) 確かめないなら `UNDETECTED_NOTES` に持ち主つきで記録
- **根拠**: AD-027 Decision 2

### [Low] Subagent の定義が `Task` 固定、Hook / Background task / Tool group が glossary に無い (L-001)

### [Low] `TranscriptMessageDTO.id` の意味が「SDK の uuid」から変わる (L-002)

- **推奨アクション**: BE-001 で注記を直し、合成した id の名前空間の一覧を data-model §2 に置く

### [Low] 行の単位の定義が FR-001 と Assumptions で食い違う (L-003)

### [Low] reviewers.yml の発火パターンの案に、実在しないパスと漏れがある (L-004)

- **観察**: 「SDK の `package.json` の版の変更」は node_modules 側で diff に現れない (出るのはルートの `package.json` / `pnpm-lock.yaml`)。`tool-result.ts`・`scripts/ui-coverage/**`・`session-view.ts` が無い。gates は pr-gate だけなのに cl-code-gate の候補にも足す

## ADR-drift 節

| ADR | 照合 | 結果 |
|---|---|---|
| AD-036 §4 P1 / AD-041 (g) | query の options のキー集合 | **drift の危険 (C-001)** |
| AD-020 D1 | 機械で導く / 版の記録 / control 経路 | A / C / E 節。B 節は趣旨に届かない (M-007) |
| AD-020 D2 | §4.2 を暫定にし O-2 で引き直す | 従っている |
| AD-020 Open Questions | 表示不要の欄 / Hook・BG の持ち主 / Partial | 回答を記録し本文は変えない (AD-031 に従う) |
| AD-019 D2 / D3 | Tier B / C の再棚卸し / 数に確認日 | 従っている (XIII の「143」の書き換えに確認日の併記を) |
| AD-034 D1 | 本文は port、変換は domain の純関数 | 従っている |
| AD-035 D1 / D4 / D6 / Trade-off | ToolFallback / 台帳 / 無害化 / 既定は閉 | 従っている。Trade-off への回答であり決定の変更ではない |
| AD-043 D2 / D4 | 本文の中継、main は状態通知だけ | 従っている |
| AD-027 | 発火の確認 | 項目 21 の発火確認が無い (M-009) |
| AD-028 §5 / AD-031 | 持ち主のいない延期 / in-place の訂正 | 一覧の延期先が食い違う (M-005)。本文は書き換えない |
| Constitution の改定手順 | Principle の変更は ADR | **ADR 無しで XII を変える (H-004)** |

accepted ADR の in-place の書き換えの計画は 0 件。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `includeHookEvents` (node_modules を除く) / `QUERY_OPTION_KEYS` の定義 | 0 / 1 | sdk.d.ts:1731 / session-core.ts:46 (pin: session-core.test.ts:191) |
| H-001 | `System messages must have` (`@assistant-ui`) | 1 | thread-message-like.ts:272 |
| H-002 | spec 011 での task_id の保持 | 0 | data-model.md:73 は tool 用だけ |
| H-003 | 末尾 1 件と role の分岐 | 3 | session-view.ts:249, :251, :262 |
| H-004 | Amendment trail で ADR 参照の無い行 | 1 | constitution.md:982 (v1.2.5。Principle の変更ではない) |
| H-005 | O-4 / O-5 / O-6 の domain | 0 | _overview.md:100 の M3 = O-1〜O-3 |
| M-001 | 判定に `—` を使う箇所 | 4 | data-model.md:22, :25, :26, constitution.md:717 |
| M-006 | `components/` → `features/` の import | 5 | すべて `features/chat` |
| M-007 | 知らないブロックを捨てる箇所 | 2 | live-message.ts:65, transcript.ts:263-270 |
| M-008 | `receivedMessages` | 9 ファイル | running-session-store.ts:259 ほか |

## Verdict

- Critical: 1
- High: 5
- Medium: 9
- Low: 4
