# architecture-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-04
**Reviewer**: architecture-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-005: 会話の境界 (compact_boundary / conversation_reset / model_refusal_* / informational) の行と取り消し (`meter` の `retraction`)
  - FR-006〜FR-010: Read / Glob / Grep / WebFetch / WebSearch / Task* の専用表示、Agent plan の markdown、registry への登録
  - FR-011〜FR-013: tool の結果の状態 (結果待ち・承認待ち・結果不明)、TranscriptAnnouncer、ToolFallback の見出しの日本語化
  - FR-014〜FR-017: 対応表の書き換え、O-11 の登録、AD-049、glossary と charter
  - SC-001〜SC-005 (SC-005 = 境界の差分 0)
- touched files に該当する charter / Confirmation:
  - ui charter: Scope (tool 出力の専用表示 / ui-coverage の維持)、KPI「表示網羅」、Open Questions (task の一覧の要否は O-6)、Journey 1
  - session charter: Scope「本 domain はデータを供給するところまで」と、Open Questions の O-2 の結論 (agents は Hook / task を無害化して message の経路で通すだけ)
  - _overview.md: Feature 帰属、XII の cross-domain invariant、M3 の行
  - accepted ADR の Confirmation:
    - AD-035: ChatScreen.test の XSS 境界と「未登録は fallback に落ちる」、項目 14
    - AD-044: 項目 21 と M3 の件数
    - AD-041 (g): QUERY_OPTION_KEYS の pin テスト
    - AD-036 §4: P3 (Query のメソッドは interrupt だけ) の静的検査
    - AD-032: classifyRawPath の変異テスト
  - proposed の ADR: AD-047 / AD-048 の Confirmation (固定テスト・meter の検証)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲。informational の本文の秘密については、M-004 で決定の記録の正確さだけを扱った
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲。MarkdownText の XSS 境界の方式については、H-001 で ADR の読み替えの観点だけを扱った
- C. 業務不変条件 / Charter drift: Critical:0 High:2 Medium:5 Low:2
- D. Constitution / ADR drift: Critical:0 High:4 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲。L-002 のファイルの指し違いは、レイヤの記述の正確さとして D に数えた
- G. optional reviewer 範囲: 該当なし: 対応表の割当の妥当性 (ui-coverage-reviewer)・読み上げの WCAG (a11y-reviewer)・空の状態 (ux-reviewer) は見ていない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

本 spec は O-6 を Tier A 14 行と表示の状態に絞り、残りを新しい O-11 に送る。spec 一式で決めていることは次のとおり。

- 境界の行は O-4 の `live-system-rows.ts` (agents) で組む
- 拒否の取り消しは O-4 の `meter` に種類 `retraction` を足して運ぶ
- 過去ログの divider は renderer で Compaction boundary に写す
- 9 つの tool の表示は O-5 の 2 段の registry に足す
- Agent plan は MarkdownText で描く (AD-035 D6 の変更)
- 決定は AD-049 (proposed) に記録する

レイヤの大枠は守っている。SessionEvent の種類・options のキー・SDK の呼び出し・IPC・main は不変で、本文は port を通る (AD-034 / AD-043 / AD-041 (g) との齟齬は無い)。

一方で次の問題を確かめた。

- accepted ADR の決定の変更の書き方: AD-035 D6 を「Trade-off」と呼び替えている。AD-044 D4 / D6 を名指していない
- 実在しない契約に依る規則: 承認の要求に `toolUseId` が無い
- renderer から届かない規則の引用: AD-032 の唯一の入口
- O-11 に送る範囲: accepted の AD-036 §4 P3 と、同じスタックの AD-048 D2 が禁じる操作を含んでいる
- session の契約を ui の feature が広げるのに、未承認の判断にも session charter にも載せていない

前回の design-gate は無い (Round 1)。

## Findings

### [High] AD-035 D6 (accepted) の「決定」を「Trade-off の将来課題の実施」と呼び替えて覆し、D6 が plain text を選んだ技術上の前提に答えていない (H-001) (scope: feature)

- **観察**:
  - `docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md:86-87` — D6 の**決定の本文**。「ExitPlanMode の plan は `MarkdownText` が text-part context 依存で任意文字列を安全に受けられないため plain text (whitespace-pre-wrap) で描画する (… rich markdown 化は plan を text part 化する将来課題)」。:98 の Trade-off はその帰結である
  - `docs/decisions/0049-boundaries-retraction-and-o11-split.md:21`・`:30` — 「Trade-off の『将来課題』をここで実施する (AD-035 の本文は変えない)」
  - `spec.md:55` (U-4) と `spec.md:167` (FR-016) — 「AD-035 D6 の Trade-off の読み替え」
  - コード: `src/renderer/src/components/markdown-text.tsx:41-61` の `MarkdownTextImpl` は本文を props で受けず、part の context から `MarkdownTextPrimitive` で描く。`agent-plan.aui.tsx:16-17` も同じ制約を記録している
  - spec / plan / research のどこにも「plan の文字列をどうやって text part の context で MarkdownText に渡すか」が無い (`spec.md:154` FR-009、`plan.md:80`、`tasks.md:30`)
- **同種事象探索**: 016 一式と AD-049 で `MarkdownText` → 7 件 (spec.md:55, :154, :195 / plan.md:10, :80 / tasks.md:30 / AD-049:30)。いずれも D6 の前提に触れていない
- **リスク/影響**:
  - AD-031 と Constitution の改定手順 1 は「決定の変更は後続 ADR、読み替える決定を明示」を求める (先例: AD-041:29 と AD-048:26-30 の「読み替える箇所」節)。AD-049 は D6 の決定を変えるのに「Trade-off」と書いており、読み替える決定を名指していない
  - D6 が挙げた前提条件 (plan を text part 化する) に答えが無い。実装時に MarkdownText を迂回する独自の markdown 経路 (R-3 FR-020 の XSS 境界の外) を作る余地が残る
- **推奨アクション**:
  - AD-049 に「読み替える箇所: AD-035 Decision 6 (plain text で描く) とその Trade-off」の節を置く
  - Decision 4 に方式を書く。例: plan の文字列を text part の context で包み、既存の `MarkdownText` をそのまま通す。新しい描画口を作らない。具体は security track と合わせる
  - spec U-4 / FR-016 の「Trade-off の読み替え」を「Decision 6 の読み替え」に直す
  - research に方式の確認 (R-06) を足す。根拠として roadmap.md:258 が既に「Agent plan の markdown (AD-035 D6)」を O-6 に割り当てていることを引く
  - FE-023 のテストに「Agent plan が R-3 の MarkdownText 以外の markdown 描画口を使わない」ことの固定を足す
- **根拠**: AD-035 Decision 6 / AD-031 / Constitution 改定手順 1
- **scope 根拠**: AD-049 と spec / plan / tasks は本 feature の成果物

### [High] `retraction` を AD-047 の `meter` に載せる設計は、`meter` の定義 (計量・最新の値) と上限・後始末の規則に反し、取り消しが黙って捨てられうる (H-002) (scope: feature)

- **観察**:
  - `meter` の定義と規則:
    - `0047-session-meter-and-failure-reasons.md:20` — 「計量はトランスクリプトのメッセージでも状態でもない」
    - 同 `:35` (Decision 2) — 「数・真偽・列挙・モデルの id だけを運ぶ」
    - `specs/014-ui-metering-and-limits/data-model.md:81` — 「セッションあたりの `meter` と間引きの対象の行の合計は 1 秒に 20 件まで (超えた分は捨てる。最新の値は次の境で送る)」
    - 同 `:83` — `finish()` で保留を全部捨てる
    - 同 `:92-99` — renderer は `meters` に最新の値として持つ
  - 同じことをした O-5 の扱い: AD-048 は `meter` を広げるときに「読み替える箇所」で AD-047 Decision 2 を名指した (`0048-…md:28`)。さらに `init-report` / `commands` を「上限に掛けない」と明記した (`0048-…md:36`、`015 data-model.md:76`)
  - 本 spec 側: `016 data-model.md:17` と `AD-049:28,35` は `retraction` の上限・間引き・`finish` の扱いを書いていない。AD-049 には読み替える箇所の節が無い
  - SDK は取り消しを 1 回限りの出来事としている (`sdk.d.ts:5044` 「remove these messages from transcript state on receipt」)
  - 復活の経路:
    - `running-session-store.ts:94-103` の `upsertMessage` は、知らない id のメッセージを末尾に足す
    - agents は tool の結果が届くと、同じ id で assistant のメッセージを送り直す (`sdk-agent-session.ts:516-525`)
    - `plan.md:96` (RK-02) は agents 側の追跡を「既存の経路のまま」とする
- **同種事象探索**: `retraction|取り消し` → 016 一式 22 件 + AD-049 4 件 (spec.md:53, :127, :147, :167, :183 / data-model.md:17, :76 / plan.md:9, :17, :19, :43, :78, :88, :96, :104, :107 / research.md:25, :28 / tasks.md:7, :17, :21, :22 / AD-049:11, :28, :35, :41)。このほか、同じ「取り消し」の語が O-4 では保留の破棄という別の概念で使われている (014 data-model.md:83)
- **リスク/影響**:
  - 上限の超過 (並列の tool_progress など) や `finish` の直前で `retraction` が捨てられると、拒否された応答が会話に残る。U-2 の目的と SDK の指示に反する
  - 「最新の値」の意味のまま実装すると、2 回目の拒否が 1 回目を上書きしうる
  - 取り消した後に agents が同じ id で送り直すと、末尾に復活する
  - AD-047 は proposed なので Critical には上げない
- **推奨アクション**:
  - AD-049 に「読み替える箇所: AD-047 Decision 2 (meter の中身に message の id の列を足す) と O-4 data-model §2 の上限・後始末」を置く
  - data-model §1 に、`retraction` は次のように扱うと明記する (AD-048 の init-report と同じ形)
    - 上限と間引きの対象にしない
    - `finish` で捨てない
    - 最新の値として畳まず、届いた順に全部当てる
  - Alternatives に「SessionEvent の新しい種類 `retraction`」を挙げ、退けた理由を書く
  - AD-047 の Consequences に AD-049 への参照を足すタスクを置く (AD-048:28 の先例)
  - 復活の防ぎ方を決める。案は 2 つ: agents の tool の結果の追跡から取り消した id を外す / renderer が取り消し済みの id を覚えて、後の同じ id の upsert を捨てる
  - BE-010 / FE-010 に次のテストを足す
    - 上限を超える負荷の下でも `retraction` が届く
    - `finish` の直前の `retraction` が捨てられない
    - 取り消し後に同じ id が送り直されても復活しない
- **根拠**: AD-047 Decision 2 / 014 data-model §2 / AD-048 の「読み替える箇所」の先例 / sdk.d.ts:5044
- **scope 根拠**: AD-049 と data-model §1 は本 feature の成果物

### [High] data-model §3 の「承認待ち」の判定が、承認の要求に存在しない `toolUseId` に依っている。session の契約の変更が要るのに、plan・tasks・ADR・未承認の判断のどれにも無い (H-003) (scope: feature)

- **観察**:
  - `data-model.md:52` — 「承認待ち (表示中のセッションの承認の要求の `toolUseId` が一致)」。`spec.md:134` と `spec.md:159` (FR-011) もこれに依る
  - 今の承認の要求に `toolUseId` は無い:
    - `src/domain/session/agent-session.ts:137-146` の `PermissionRequest` は `requestId` / `toolName` / `input` / `scope` だけ
    - `session-event-decoder.ts:31-37` もこの 4 つだけを検証する
    - `running-session-store.ts:285-291` の `pending` も同じ 4 つ
    - `sdk-agent-session.ts:367-381` の `createCanUseTool` は toolUseId を運ばない
  - SDK は canUseTool の options で `toolUseID` を渡している (`sdk.d.ts:256-258`)
  - plan のファイル一覧 (`plan.md:16-19`) と SC-005 (`spec.md:187`) には、agent-session.ts・decoder・canUseTool の変更が無い
- **同種事象探索**: `toolUseId` を `src/domain/session/agent-session.ts` で → 0 件。016 一式で `toolUseId|承認待ち` → 7 件 (data-model.md:52, :68, :79 / spec.md:134, :159, :160, :173)
- **リスク/影響**:
  - 規則のままでは実装できない。toolName と input の照合で代えると、並列の同じ名前の tool で誤判定する
  - 正しく直すと、ui の feature が session の契約を変えることになる (X-1 の permission-request の形、data-model §5)。domain の境界の判断 (AGENTS.md: 人間の承認) と、X-1 の契約の読み替えが要る
- **推奨アクション**: 次のどちらかに決める
  - (a) 契約を変える場合
    - 未承認の判断に U-6 を足す
    - `PermissionRequest.toolUseId` の追加 (domain・agents の canUseTool・decoder・store の `pending`・固定テスト) を plan と tasks に入れる
    - AD-049 に X-1 の契約の読み替えとして記録し、session charter にも記録する
  - (b) 契約を変えない場合
    - data-model §3 から承認待ちの行を消す (承認カードが別にある前提で、結果待ちだけにする)
    - spec.md:134 の Edge case と、文言 (data-model.md:79) を合わせて直す
- **根拠**: session charter の Scope「`canUseTool` の permission 往復の配管」/ X-1 data-model §5 / AGENTS.md (domain の判断は人間が承認する)
- **scope 根拠**: data-model §3 は本 feature の成果物。直し方によっては session の契約に波及する

### [High] Read の全体のパスに「R-2 FR-042 の規則で UNC の接頭辞を出さない」を当てるが、その規則の唯一の入口 `classifyRawPath` は renderer から届かない。renderer で書けば AD-032 (accepted) の「唯一の入口・正本は 1 箇所」に反する二重実装になる (H-004) (scope: feature)

- **観察**:
  - 本 spec の該当箇所: `spec.md:130`、`spec.md:196`、`data-model.md:33`、`plan.md:26` (Principle I ✅ の根拠)、`tasks.md:27` (FE-020。renderer の `file-tool.aui.tsx`)
  - AD-032 の決定:
    - `0032-…md:62` — 「`classifyRawPath(raw)` を唯一の入口とし」
    - 同 `:82-86` — 解析できない UNC は表示値を持たせない。「2 セグメント落とす」規則を当てると共有名が残る (文字を落とす方式を退けた)
    - 同 `:127-130` — 正本は 1 箇所
  - `_overview.md:49` — 「UNC の綴りに関する知識を 1 箇所に集めるため」
  - renderer からは届かない:
    - `src/domain/runtime/path-api.ts:1` は `import path from 'node:path'`。`classifyRawPath` は同ファイルの `:177`
    - `.dependency-cruiser.js:302-309` の `ui-not-to-core` が、renderer から Node 標準モジュールへの推移的な到達を禁じる
  - FR-042 の対象: `specs/002…/spec.md:365` FR-042 は「UNC 形式のパスを IPC 境界に出してはならない」で、アプリ自身のパスの値の規則。境界で守られている (`SessionListScreen.tsx:139`)。会話由来の argsText は今も ToolFallback で生の JSON として出ている
  - 先例: `session-view.ts:252-256` の `pathTail` は、ファイル名だけを出して UNC の判定をしない
- **同種事象探索**: 016 一式で `UNC|FR-042|classifyRawPath` → 5 件 (spec.md:130, :196 / data-model.md:33 / plan.md:26 / tasks.md:27)。`src/renderer` で `wsl\.localhost|wsl\$|\bUNC\b` → 実装 0 件 (コメントだけ: SessionListScreen.tsx:139、useSessions.ts:21)。FE-020 が renderer に最初の UNC の判定を持ち込む
- **リスク/影響**:
  - 「接頭辞を出さない」は文字を落とす方式で、AD-032 が退けた方式そのものである。renderer に 2 つ目の UNC の分類器ができ、綴りの知識が 2 箇所に割れる (AD-032 の Round 1〜4 の再演)
  - Constitution Check の Principle I ✅ が、FR-042 の誤読 (アプリのパスの規則を会話由来の文字列に当てる) を根拠にしている
- **推奨アクション**: data-model §2 で次のどれかに決め、Edge case・plan の Principle I の行・FE-020 を合わせて直す
  - (a) 全体のパスは会話由来の表示用の文字列とし、FR-042 を引かない (Principle I の根拠は「パスとして解釈・解決しない」)
  - (b) 見出しと同じく末尾だけを出す (pathTail の先例)
  - (c) UNC の判定が要るなら、agents / domain の変換で `classifyRawPath` を通す (DTO を変えない制約の下での運び方の設計が要る)
  - あわせて、renderer に UNC の綴りを書かないことを FE-020 のテストで固定する
- **根拠**: AD-032 Decision 1・2・6 / Principle I / R-2 FR-042 / `.dependency-cruiser.js` の ui-not-to-core
- **scope 根拠**: data-model §2・plan・tasks は本 feature の成果物

### [High] O-11 に送る範囲に、accepted の AD-036 §4 P3・AD-035 D3 と、同じスタックの AD-048 D2 が禁じる操作が入っているのに、FR-015 の ADR の義務に挙がっていない (H-005) (scope: feature)

- **観察**:
  - 送る範囲:
    - `data-model.md:97` — E 節の `rewind_files` / `stop_task` / `background_tasks` / `get_hooks_listing` を `後続: O-11` にする
    - `spec.md:38,40`、`AD-049:27`
  - `spec.md:166` (FR-015) の ADR の義務は、`includeHookEvents` (AD-041 (g)) と `getSubagentMessages` の許可リストだけ
  - 禁じている側:
    - `0036-…md:144-145` (accepted) の P3 — 「`Query` メソッドは `interrupt()` のみ呼ぶ」
    - `sdk.d.ts:2871` (`rewindFiles`)・`:2947` (`stopTask`)・`:2962` (`backgroundTasks`) は `Query` のメソッドである
    - `0048-…md:35` (proposed、同じスタック) の D2 — `rewindFiles` / `stopTask` を `QUERY_MUTATION_METHODS` の禁止に足す
    - `0035-…md:54` (accepted) の D3 — 「`getSubagentMessages(...)` は使わない」
  - O-5 の同型の E 節の行は `表示不要` (`015 data-model.md:129-130`)
- **同種事象探索**: 016 と AD-049 で `stop_task|rewind_files|background_tasks|get_hooks_listing|getSubagentMessages|Checkpoints` → 14 件 (data-model.md:91, :96, :97, :98 / spec.md:22, :37, :38, :39, :40, :52, :166, :200 / AD-049:15, :27)。どれも AD-036 §4 P3・AD-048 D2・AD-035 D3 を名指していない
- **リスク/影響**:
  - O-11 が範囲を満たすには accepted ADR の読み替えが要るのに、その義務が残らない (持ち主のいない延期。AD-028 §5 / AD-044 Consequences)
  - AD-048 と AD-049 を一緒に承認すると、E 節の操作系の行の扱いが割れる。O-5 では「操作しない (表示不要)」、O-11 では「後続 (表示を実装)」になる
  - O-11 の domain を `ui` に固定しているが、ADR の義務はすべて session の境界 (options・SDK の呼び出しの許可リスト・Query のメソッド) にある。O-5 は同型の O-10 で domain を利用者に諮った (`015 spec.md:53`)
- **推奨アクション**: 次のどちらかを選び、あわせて U-1 に O-11 の domain (ui / session) を選択肢として出す
  - FR-015 と AD-049 Decision 1 の ADR の義務に、AD-036 §4 P3 (stopTask / rewindFiles / backgroundTasks)・AD-048 D2・AD-035 D3 の読み替えを足す
  - E 節の 4 行を O-5 と同じく `表示不要: アプリは task・チェックポイントを操作しない (AD-036 §4 P3 / AD-048)` にして O-11 から外す (U-1 の代案として示す)
- **根拠**: AD-036 §4 P3 / AD-035 Decision 3 / AD-048 Decision 2 / AD-044 Consequences / AD-028 §5
- **scope 根拠**: FR-015 と data-model §5 と AD-049 は本 feature の成果物

### [High] ui の feature が session の契約と稼働中のストアの意味を変えるのに、未承認の判断にも session charter の記録にも載っていない (H-006) (scope: feature)

- **観察**:
  - 本 spec 側:
    - `spec.md:52-56` の U-1〜U-5 は、session の契約の変更を判断として挙げていない
    - `spec.md:168` (FR-017) と `tasks.md:40` (SH-010) の記録先に session charter が無い (`plan.md:110` のファイル一覧には `docs/domains/{ui,session}/charter.md` があり、食い違う)
  - session charter 側:
    - `session/charter.md:56` — 「本 domain はデータを供給するところまで」
    - 同 `:224-226` — 本 domain が持つのは「Hook / Background task のシステムメッセージを無害化して既存の message の経路で通すことだけ」
  - 本 spec が session の側に足すもの:
    - agents のセッションスレッドに、system の 4 つの subtype と最上位の `conversation_reset`
    - message の id の列を運ぶ `meter` の種類
    - 稼働中のストア (`features/session/running-session-store.ts`) のメッセージの削除
  - 先例:
    - O-4 は同じ種類の変更を U-1 として利用者に諮った (`014 spec.md:50`)
    - O-5 は session charter と roadmap の O-3 (O-8) の義務 (c) の注記を FR に入れた (`015 spec.md:190, :192`)
    - 新しい行は `receivedMessages` に数えられる (014 data-model.md:102 / roadmap.md:255 の (c))
- **同種事象探索**: 016 の spec / plan / tasks / data-model / research / quickstart で `session charter|session/charter|domains/{ui,session}` → 1 件 (plan.md:110)。FR-017 / SH-010 には 0 件
- **リスク/影響**:
  - 利用者が U-1〜U-5 を承認しても、session の契約の拡張 (`meter` の中身の拡大・ストアからの削除) を承認したことにはならない (AGENTS.md: domain の判断は人間)
  - 取り消しで O-1 の監視ビューの直近の活動 (deriveActivity) が変わる
  - 行が増えて `receivedMessages` の基準が変わるのに、KPI「並列時の滑らかさ」の比較の注記が無い
- **推奨アクション**:
  - U-6「ui の feature が session の契約 (`meter` の `retraction`・ストアからの削除・system の subtype の追加) を広げてよいか」を足す (O-4 U-1 の形)
  - FR-017 / SH-010 に次を足す
    - session charter (`retraction` と稼働中のストアの削除の規則)
    - roadmap の O-3 (O-8) の義務 (c) の注記 (新しい行は数え、`retraction` は数えない)
- **根拠**: AGENTS.md / session charter の Scope と Open Questions / O-4 U-1 の先例 / roadmap の O-3 の義務 (c)
- **scope 根拠**: spec の未承認の判断の表と FR-017 は本 feature の成果物

### [Medium] AD-049 は AD-044 (accepted) の Decision 4 (B 節の照合は O-6) と Decision 6 の回答 (task の一覧の要否は O-6) を O-11 に移すのに、AD-044 を名指さない。古い参照の書き換えも FR-017 から漏れている (M-001) (scope: feature)

- **観察**:
  - AD-044 の該当箇所:
    - `0044-…md:66` — B 節は「O-6 に割り当てる」
    - 同 `:84` — 「実行中の task の一覧の要否は O-6 で判断し」
  - AD-049 側:
    - `AD-049:17-21` — 「先行の決定に触れる」の列挙は 3 点 (SDK・O-2・AD-035)
    - AD-049 で `AD-044` → 0 件
    - `plan.md:71` は「AD-044 の本文は変えず roadmap と charter に記録」としている (本文を変えないこと自体は正しい)
  - FR-017 が扱っていない古い参照:
    - `_overview.md:94` — 「実行中の task の一覧の要否は O-6 で判断」
    - `_overview.md:96` — 「O-4 / O-5 / O-6 は ui」
    - `_overview.md:108` — M3 の行が「O-1〜O-6」
    - `docs/ui-coverage.md:93` — B 節の説明「照合は O-6」
    - `docs/glossary.md:375` — 「一般の Hook の表示は O-6」
- **同種事象探索**: `O-6` を `docs/decisions` で → AD-044 の 4 件 (:19, :66, :84, :103) と AD-046 の 3 件。AD-049 は AD-044 を 0 件参照する
- **リスク/影響**: AD-044 を読む人は、B 節の照合の持ち主が O-6 のままだと読む。O-6 の完了後は、完了した feature を指し続ける。AD-049 が後続 ADR として辿れない
- **推奨アクション**:
  - AD-049 に「読み替える箇所: AD-044 Decision 4 の B 行・Decision 6 の task の一覧の回答」を置く
  - FR-017 に、上の _overview.md:94 / :96 / :108、ui-coverage.md:93、glossary.md:375 の書き換えを足す
- **根拠**: AD-031 (決定の変更は後続 ADR) / AD-044
- **scope 根拠**: AD-049 と FR-017 は本 feature の成果物

### [Medium] data-model §1 の行が O-2 の行の不変条件と噛み合っていない (opens の列が無い・informational の 300 コードポイントと上限 120・status に level を混ぜる) (M-002) (scope: feature)

- **観察**:
  - `opens` が無い:
    - `data-model.md:7-13` の表に `opens` (行を作れるか) の列が無い
    - `system-event.ts:178` の合成は、前の行が無く `opens` が false なら捨てる
    - O-4 の同じ表には「作る (opens)」の列がある (`014 data-model.md:108`)
  - 300 と 120 の食い違い:
    - `data-model.md:13,15` — informational の content を 300 コードポイントで `detail` に入れる
    - `system-event.ts:25` — `SYSTEM_EVENT_NAME_MAX_CODE_POINTS = 120`
    - `research.md:27` — 本 spec 自身が「detail は 120 コードポイントで切り詰める」と書いている
  - status の混用:
    - `data-model.md:13,18` — `SystemEventStatus` に `info` / `notice` / `suggestion` / `warning` を足し、`stopped` (今は task の状態。`transcript-dto.ts:76`) を知らせの停止にも使う
    - `transcript-dto.ts:65` — この型は「Hook / task の状態の理由キー」
- **同種事象探索**: `opens` を 016 data-model で → 0 件。`300` → data-model.md:13 と spec.md:54 の 2 件。いずれも O-2 の上限との関係を書いていない
- **リスク/影響**:
  - 行を作るかが実装者任せになる
  - 300 と 120 の食い違いが、O-2 の契約 (011 data-model §2) の変更なのか、別の関数なのかが分からない
  - status に見た目の段階が混ざり、`isTerminalSystemEventStatus` (終わりを表す状態) の意味が崩れる。`stopped` が 2 義になる
- **推奨アクション**:
  - §1 に opens の列を足す (全 category で true。同じ `tool_use_id` の 2 回目も true で合成する)
  - detail の上限を 120 に揃えるか、O-2 の契約の変更として 011 data-model §2 と glossary に記録する
  - level を status の外 (detail・別の category) に置く案と比べて決める
- **根拠**: O-2 data-model §2 / glossary「System event row」
- **scope 根拠**: data-model §1 は本 feature の成果物

### [Medium] 過去ログでも `informational` が届く根拠があるのに捨てたままで、Journey 1 に穴を残す。「過去ログに取り消しの印は無い」も未確認 (M-003) (scope: feature)

- **観察**:
  - 過去ログに届く根拠:
    - `src/agents/read-transcript.ts:70` は `getSessionMessages(…, { includeSystemMessages: true })` で取得している
    - `sdk.d.ts:820-822` — 「include system messages (e.g., compact boundaries, informational notices)」
  - 今の変換は捨てている: `transcript.ts:181-208` は Hook / task と圧縮だけを扱い、残りは `:277` (`if (parts.length === 0) continue`) で捨てる
  - 本 spec 側:
    - `data-model.md:89` — informational は「(実行中)」
    - `spec.md:53` (U-2) と `AD-049:36` — 「取り消しの印は記録に無い」。research R-03 (`research.md:17-23`) は過去ログでの有無を調べていない
  - ui charter の Journey 1 (`ui/charter.md:87-94`) は「過去セッションを読む」
- **同種事象探索**: 016 一式で `過去ログ` の記述は、どれも includeSystemMessages の根拠に触れていない (spec.md:53 / data-model.md:16 / AD-049:28, :36)
- **リスク/影響**:
  - Tier A の理由 (止まった理由が分からないと判断を誤る) は、過去ログを読むときも同じである
  - 過去ログに `model_refusal_fallback` が残るなら、取り消しを過去ログの変換にも当てられる。そうなれば AD-049 Consequences の「実行中と過去ログで見え方が違う」は要らなくなりうる
- **推奨アクション**:
  - research に「過去ログに informational / model_refusal_* / conversation_reset が残るか」を足し、quickstart V-3 の記録項目にする
  - 残るなら O-2 と同じく domain の純関数で両方の経路に当て、経路を「両方」にする。残らないなら根拠を書く
- **根拠**: ui charter Journey 1 / Principle XII の趣旨
- **scope 根拠**: research と data-model §5 は本 feature の成果物

### [Medium] AD-049 Decision 3 は O-2 の「Hook の出力本文を出さない」を「フィールドの話で変えない」と言い換えるが、informational の content は Hook の出力 (block reason) そのものである (M-004) (scope: feature)

- **観察**:
  - informational の content の中身:
    - `sdk.d.ts:4853` — 「hook feedback (e.g. a UserPromptSubmit hook's block reason), slash-command output」
    - `docs/ui-coverage.md:77` も同じ説明
  - 本 spec 側: `AD-049:29`
  - O-2 の規則と理由:
    - `specs/011-ui-coverage/spec.md:142` — 「Hook の出力や Background task の説明に秘密が含まれうる → Hook は出力本文を出さない」
    - `docs/glossary.md:369-371` — Hook の定義に「出力本文 … は出さない」
  - `mayCarrySecret` の契約: `system-event.ts:43-46` は「コマンドの文字列として … Hook の名前 `hook_name` に使う」
- **同種事象探索**: 016 一式で `mayCarrySecret` → spec.md:54 / data-model.md:15 / tasks.md:21 の 3 件。どれも自然文に当てる妥当性に触れていない
- **リスク/影響**:
  - 決定の変更を「変えない」と記録している。O-2 の理由はデータの種類 (Hook の出力) に掛かっており、フィールド名には掛かっていない
  - glossary の Hook の定義も変わるのに、FR-017 に無い
  - コマンド用に作った述語を、契約の外の自然文に使う
- **推奨アクション**:
  - Decision 3 を「O-2 の規則の例外として、informational の content を条件付きで出す」と書き直す
  - 読み替える箇所に、011 spec の Edge case と glossary の Hook を挙げる
  - 自然文への `mayCarrySecret` の適用は security track と決め、docstring の契約を広げるか、別の述語にする
- **根拠**: AD-031 / 011 spec の Edge case / glossary の Hook
- **scope 根拠**: AD-049 と FR-017 は本 feature の成果物

### [Medium] `conversation_reset` の `new_conversation_id` を捨てるが、SDK は「新しい id の下に transcript を作り直し、題をリセットせよ」と言っている。session (X-6) への申し送りが無い (M-005) (scope: feature)

- **観察**:
  - SDK の指示: `sdk.d.ts:4747` — 「mount a fresh transcript under new_conversation_id and reset any cached session title」
  - 本 spec 側:
    - `data-model.md:10` — 読まないフィールドに `new_conversation_id`
    - `tasks.md:21` — 出力に 0 件のテスト
    - `research.md:20`
  - アプリは今 SDK の session_id を追っていない (`src` で `session_id|sdkSessionId` → 0 件)
  - session charter の Scope (再開・分岐) と AD-041 (h) の X-6 (fork / resume)
  - `quickstart.md:16-17` — 「過去ログで同じセッションを開き」
- **同種事象探索**: `new_conversation_id` を 016 で → data-model.md:10 / research.md:20 / tasks.md:21 の 3 件。どれも捨てる根拠と session への影響を書いていない
- **リスク/影響**: /clear の後に Claude Code の会話の id が変わるなら、次がずれる。ui が session の識別の信号を黙って捨てている
  - 稼働中のセッションから開く過去ログ
  - X-6 の再開・分岐の対象
- **推奨アクション**:
  - research と quickstart V-3 で、/clear の後の `session_id` と JSONL の扱いを確かめる
  - 結果を session (X-6) への申し送りとして roadmap と session charter に記録する
  - O-6 は境界の表示のままでよいが、捨てる根拠を書く
- **根拠**: session charter の Scope / AD-041 (h)
- **scope 根拠**: research と data-model §1 は本 feature の成果物

### [Medium] AD-045 (O-3 の proposed。ブランチ 012、未マージ) を前提にした作業が、このスタックと Dependencies に無い。Constitution Check の i18n の行を Principle VIII に置いている (M-006) (scope: feature)

- **観察**:
  - AD-045 を前提にした箇所: `tasks.md:40` (SH-010) — 「AD-045 の例外の一覧に `transcript.ts:207`」。`plan.md:29, :74` と `data-model.md:16` も同じ
  - AD-045 はこのスタックに無い:
    - Glob `docs/decisions/0045-*` → 0 件
    - `0046-…md:21` — AD-045 は O-3 のブランチ `012-ui-thread-search` (未マージ) にある
    - `spec.md:189-196` の Dependencies と、`tasks.md:9` の着手の条件に O-3 / AD-045 が無い
  - Principle の取り違え: Principle VIII (`constitution.md:599`) は IME・フォント・全角の崩れの規則。i18n は Principle XV (`constitution.md:849`)
- **同種事象探索**: `AD-045` を repo で → 016 の 4 件 (tasks.md:40 / plan.md:29, :74 / data-model.md:16) と 013 のレビューの記録。ADR のファイルは 0 件
- **リスク/影響**: SH-010 は、このスタックに無いファイルを書き換える前提になっている。AD-045 が却下されたり番号が変わったりすると、記録先が無くなる
- **推奨アクション**:
  - Dependencies と着手の条件に O-3 (AD-045) を足す。または記録先を「AD-045 が accepted なら例外の一覧、そうでなければ roadmap の O-3 の義務 (1)」にする
  - Constitution Check の i18n の行を XV に移す。VIII の行は、新しい表示の全角と日本語のファイル名の崩れ (80 コードポイントの切り詰めなど) を見る内容にする
- **根拠**: Principle VIII / XV
- **scope 根拠**: plan と tasks は本 feature の成果物

### [Medium] glossary の更新の範囲が足りず、既存の語と衝突する (M-007) (scope: feature)

- **観察**:
  - 予定している glossary の更新は 3 語だけ (`tasks.md:15` SH-001 / `spec.md:168` FR-017): 会話の境界、結果待ち / 結果不明、O-11
  - 更新が要るのに入っていない既存の語:
    - `docs/glossary.md:825-835` — System event row の定義は「Hook / Background task を 1 つにつき 1 行」(O-4 は定義に category を足すとした。`014 spec.md:204`)
    - `docs/glossary.md:369-376` — Hook の定義。M-004 の例外と O-11 への移動が要る
  - 衝突する語:
    - 「取り消し」: O-4 は保留の破棄の意味で使う (`014 data-model.md:83`)
    - 読み上げの対象: O-7 は「見ているセッション (`watchedId`)」と定めた (`013 data-model.md:40`、AD-046 Consequences)。本 spec は「表示中のセッション」(`spec.md:65, :160`、`data-model.md:60`)
    - 圧縮の境界: コードは「コンパクション境界」(`transcript.ts:205`、`transcript-dto.ts:43`)
- **同種事象探索**: glossary で `コンパクション|Compaction|圧縮|見ているセッション|表示中のセッション` → 0 件
- **リスク/影響**: 同じ語が別の概念を指す、または別の語が同じ概念を指す (Principle XIV の同義異語)
- **推奨アクション**: SH-001 に次を足す
  - System event row の定義の拡張
  - Hook の Counterexamples の書き換え (O-6 → O-11、informational の例外)
  - 「取り消し (retraction)」の項 (O-4 の保留の取り消しとの区別を Counterexample に)
  - 読み上げの対象を `watchedId` に揃える
  - 圧縮の境界 / コンパクション境界 / Compaction boundary の同義の整理
- **根拠**: Principle XIV
- **scope 根拠**: SH-001 は本 feature の作業

### [Medium] 取り消しの経路に実データの確認と観測点が無い (M-008) (scope: feature)

- **観察**:
  - `data-model.md:17` — id の形を `^[A-Za-z0-9-]{1,64}$` に限る
  - `sdk.d.ts:5044` — 「multi-block messages carry per-block derived uuids」。派生した uuid の形は書かれていない
  - `live-message.ts:76` — 稼働中のメッセージの id は `msg.uuid`
  - `quickstart.md:14-23` の V-3 に、拒否・informational・取り消しの確認が無い。`plan.md:88` は単体テストだけ
  - 正規表現に落ちた id の件数を出す観測点が無い
- **同種事象探索**: 016 quickstart で `拒否|refusal|informational` → 0 件
- **リスク/影響**: 派生した id の形が正規表現に合わない、またはストアの id と一致しないと、取り消しが黙って効かない。検出する手段も無い
- **推奨アクション**:
  - research で派生した id の形を確かめる
  - ストアの id と一致することを fixture で固定する
  - 落ちた件数がわかるようにする (行の `retracted=<n>` と外した数が等しいことをテストで固定する)
  - quickstart に、拒否が起きたときの記録項目を足す (起こせなければ「未確認」と書く)
- **根拠**: Principle XI / H 観点
- **scope 根拠**: research・quickstart・tasks は本 feature の成果物

### [Low] plan の積み方の記述が 015 を抜いている (L-001) (scope: feature)

- **観察**: `plan.md:3` は「`014` → `013` の上、実装は O-7 と O-4 のマージの後」とする。`spec.md:16`、`plan.md:5`、`tasks.md:9` は 015 (O-5) を含む
- **同種事象探索**: 016 で `015-ui-mcp` → spec.md:16 の 1 件
- **リスク/影響**: 着手の条件の読み違い
- **推奨アクション**: plan.md:3 を「015 → 014 → 013 の上。O-7・O-4・O-5 のマージの後」に直す
- **根拠**: 一貫性
- **scope 根拠**: plan.md は本 feature の成果物

### [Low] category と status の置き場所を `system-event.ts` と書いているが、正本は `transcript-dto.ts` である (L-002) (scope: feature)

- **観察**:
  - `plan.md:17` と `tasks.md:17` (BE-001) は `system-event.ts` を指す
  - 列挙は `transcript-dto.ts:62-79` にある。renderer の `transcript-guard.ts:35-36` もここから照合表を作る
  - O-5 は正しく `transcript-dto.ts:62` を指している (`015 data-model.md:110`)
- **同種事象探索**: `SYSTEM_EVENT_CATEGORIES` → transcript-dto.ts:62 / transcript-guard.ts:2, :35
- **リスク/影響**: DTO の契約のファイル (`TRANSCRIPT_PART_FIELDS` と同じファイル) を変えることが plan から読めない。SC-005 の差分の確認の範囲を誤読しうる
- **推奨アクション**: plan と BE-001 を `transcript-dto.ts` (列挙) と `system-event.ts` (終わりの判定) に分けて書く
- **根拠**: AD-034 (DTO の契約)
- **scope 根拠**: plan と tasks は本 feature の成果物

### [Low] Tier A の element Inline citation を持ち主なしの「未使用」にする (L-003) (scope: feature)

- **観察**: `data-model.md:100` は Inline citation (`ui-coverage.md:282`。F 節で Tier A) を `未使用` とする。`ui/charter.md:43` は「Tier A 必須」
- **同種事象探索**: F 節で Tier A かつ未使用の行 → Agent handoff (:228) は後続の持ち主 (O-6 → O-11) がある。Inline citation だけ持ち主なしになる
- **リスク/影響**: charter の「Tier A 必須」と食い違ったまま記録が残る
- **推奨アクション**: F 節の Tier を見直す (B へ) か、後続の持ち主を書く
- **根拠**: ui charter の Scope / AD-019
- **scope 根拠**: data-model §5 は本 feature の成果物

### [Low] renderer が `divider` を一律に Compaction boundary に写すが、DTO の divider は汎用の区切りの型である (L-004) (scope: feature)

- **観察**:
  - `data-model.md:16` と FR-001 は、renderer が `divider` を Compaction boundary に写すとする
  - `transcript-dto.ts:43` の divider は「コンパクション境界などの最小の区切り」
  - `subagent.aui.tsx:101-102` も divider を描く
- **同種事象探索**: domain で divider を作る箇所は `transcript.ts:207` の 1 件
- **リスク/影響**: 将来ほかの区切りが divider を使うと、圧縮と誤表示する
- **推奨アクション**: 「divider を作るのは圧縮だけ」を data-model に明記し、domain の生成箇所が 1 つであることをテストで固定する
- **根拠**: DTO の契約 (AD-034)
- **scope 根拠**: data-model §1 は本 feature の成果物

## Critical が 0 件である根拠

Critical の候補になった accepted ADR は 4 つあり、いずれも Critical の要件を満たさなかった。

- **AD-035 D6** (H-001)
  - 変更は後続 ADR の AD-049 を通している
  - 実装は AD-049 が accepted になるまで止まる (`tasks.md:9`)
  - roadmap.md:258 が既に「Agent plan の markdown (AD-035 D6)」を O-6 に割り当てている
  - 無自覚な drift ではなく、変更の書き方の問題である
- **AD-032** (H-004): spec の文言は「R-2 の規則を使う」で、明示的に逆の設計を採ってはいない (二重実装は実装時に起きうる)
- **AD-036 §4 P3** (H-005): O-6 自身は Query のメソッドを呼ばない (SC-005)。矛盾は O-11 に登録する範囲の側にある
- **その他**: 次の ADR の Decision Outcome と spec / plan の矛盾は、文面上 0 件
  - AD-041 (g): options のキーの差分 0 (SC-005)
  - AD-034 / AD-043: 行は message の経路、`retraction` は port 上の `meter`、main を通らない
  - AD-044: 割当の書式 (Decision 1) と M3 の条件 (Decision 3) に従っている

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `MarkdownText` (016 一式 + AD-049) | 7 | spec.md:55, :154, :195 / plan.md:10, :80 / tasks.md:30 / AD-049:30 |
| H-002 | `retraction\|取り消し` (016 一式 + AD-049 + 014 data-model) | 27 | spec.md:53, :127, :147, :167, :183 / data-model.md:17, :76 / plan.md:9, :17, :19, :43, :78, :88, :96, :104, :107 / research.md:25, :28 / tasks.md:7, :17, :21, :22 / AD-049:11, :28, :35, :41 / 014 data-model.md:83 (同じ語の別概念) |
| H-003 | `toolUseId` (src/domain/session/agent-session.ts) / `toolUseId\|承認待ち` (016) | 0 / 7 | — / data-model.md:52, :68, :79 / spec.md:134, :159, :160, :173 |
| H-004 | `UNC\|FR-042\|classifyRawPath` (016) / `wsl\.localhost\|wsl\$\|\bUNC\b` (src/renderer の実装) | 5 / 0 | spec.md:130, :196 / data-model.md:33 / plan.md:26 / tasks.md:27 / (コメントだけ: SessionListScreen.tsx:139, useSessions.ts:21) |
| H-005 | `stop_task\|rewind_files\|background_tasks\|get_hooks_listing\|getSubagentMessages\|Checkpoints` (016 + AD-049) | 14 | data-model.md:91, :96, :97, :98 / spec.md:22, :37, :38, :39, :40, :52, :166, :200 / AD-049:15, :27 |
| H-006 | `session charter\|session/charter\|domains/\{ui,session\}` (016) | 1 | plan.md:110 (FR-017 / SH-010 には 0) |
| M-001 | `AD-044` (AD-049) / `O-6` (docs/decisions) | 0 / 7 | — / AD-044:19, :66, :84, :103 / AD-046:19, :43, :48 |
| M-006 | `AD-045` (repo) / Glob `docs/decisions/0045-*` | 4 (016) / 0 | tasks.md:40 / plan.md:29, :74 / data-model.md:16 |

## Verdict

- Critical: 0
- High: 6
- Medium: 8
- Low: 4
