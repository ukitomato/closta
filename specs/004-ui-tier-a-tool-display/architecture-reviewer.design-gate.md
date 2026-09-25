# Design-gate: architecture-reviewer (R-4)

**Run**: 2026-09-25 · **Verdict**: Critical 0 / High 1 / Medium 2 / Low 1 · Read-only.

**成立を確認**した整合: claim#1 (main を本文経路から外す — subagent グルーピングは取得プロセス側 `transcript.ts` 純関数、
DTO 入れ子は `TranscriptFrameDTO.messages` の内側に閉じ main は port 中継のみ、AD-034 port モデルを破らない) /
claim#4 (layer: 変換=domain, 表示=ui, args narrowing=renderer は AD-023 §1・§7 と整合) /
claim#5 (ADR-to-file は後続 ADR SH-002 で AD-034 の shape を継ぐ、in-place 書換なし) /
claim#2 (Principle XIII 実名照合、FR-013/R-04/C-5) / claim#3 (Principle XII 継続、vacuous 明記 + 人間承認)。drift なし。

## Findings

### ARCH-H-001 [High] argsText が domain で bound も sanitize もされず、plan の Principle IX チェックと FR-012 の前提が事実と食い違う
- **Where**: plan.md L133-138 (IX Check「args は小さい / 巨大なのは result」); spec FR-012 (「tool **入出力**をサニタイズ」);
  transcript.ts:180 (`argsText: safeStringify(b.input)` = sanitize なし・byte 上限なし) vs :163/:167/:190; data-model §2/§6
- **Issue**: R-4 が専用表示を与える Write `content` / Edit・MultiEdit `old_string`/`new_string` / ExitPlanMode `plan` はすべて **args 側**に載る。
  「巨大なのは result」は R-4 対象 tool では成り立たず、diff 本体は**上限なしの argsText**として port2 を渡り renderer で全量 JSON.parse される。
  data-model §6 は「result / text をサニタイズ」としか書かず**入力 (args) を含まない**ため、FR-012 の「入出力」と design が食い違う。
- **リスク**: (1) plan の Principle IX 説明が false premise (main はデータ経路外のまま=claim#1 成立、だが SC-006 の「巨大 diff 切り詰め」が
  取得側でなく display 折りたたみでしか担保されない)。(2) FR-012 が実装不能 (args 由来 command/old-new/plan/todo が bidi/C1 除去を通らない。
  ExitPlanMode plan は sanitize されず MarkdownText へ)。bidi/C1 の実害判定は security-reviewer owner。
- **Action**: (a) transcript.ts で argsText も `sanitizeBody(..., 上限)` を通す (result と同扱い) か、diff 材料を domain で narrow・bound してから DTO に載せる。
  (b) 取らないなら FR-012 を「出力 (result/text) のみサニタイズ」に狭め、args 由来表示の bidi/C1・サイズ上限を data-model に明記し、
  plan IX チェックから「巨大なのは result / args は小さい」を訂正。cascade は argsText 構築点 transcript.ts:180 の 1 箇所。
  (security H-001/H-002 / platform-boundary M-001 と同一根)

### ARCH-M-001 [Medium] plan が AD-020 に「subagent は parent_agent_id で識別される」を帰属させるが AD-020 は述べておらず、research R-02 は key を未確定としている
- **Where**: plan.md L36 (Related ADRs) / L67 (Summary #3 の断定); AD-020 全文 (parent_agent_id / subagent 親子リンクに言及なし);
  research R-02 (key 未確定を明記); 出所は R-3 data-model §1 / AD-034
- **Issue**: (1) accepted ADR (AD-020) に無い主張を ADR 由来として提示する citation drift。(2) plan 本文が自身の research (未確定) と矛盾し、
  実装者が key を確定済みと誤読する。design は contract/data-model で deferral しているため実装自体は安全。
- **Action**: plan L36 を「parent_agent_id は SessionMessage 型 (AD-034 / R-3 data-model §1) 由来。AD-020 は SDK 型棚卸し」に訂正。
  Summary #3 と表の「parent_agent_id で識別」断定を research R-02 の open question と揃える。
  (analyze A-H-1 / A-M-3 と同一根 — spec 側は analyze が High で指摘)

### ARCH-M-002 [Medium] FR-012 の bidi/C1 非回帰を args 由来表示で検証するテストが計画に無い
- **Where**: tasks FE-042 (「双方向制御文字で XSS が起きない」); SC-002 (生 HTML/script まで); sanitize-body.test.ts:25/31 (domain 単体のみ)
- **Issue**: argsText は domain サニタイザを通らないため (H-001)、bidi を含む fixture を args に置いても「クラッシュしない/script 非実行」しか
  検証されず、FR-012 の入力側サニタイズは無検査のまま done し得る。ExitPlanMode plan→MarkdownText で顕在化。
- **Action**: H-001 の修正方針に合わせ (a) args を domain サニタイズするなら transcript.test に args-bidi 除去テスト、
  (b) 出力のみに狭めるなら FR-012 文言と対応 SC を修正し args-derived 表示の残余リスクを data-model に明記。テストで固定できる SC に落とす。
  (security H-003 と同一根)

### ARCH-L-001 [Low] 新規概念「Subagent group」が glossary 追加対象 (Subagent) に含まれず用語が揺れる
- **Where**: spec Key Entities L224 (「Subagent group」定義) vs data-model §5 / SH-062 (glossary 追加は「Subagent」のみ);
  「Subagent 表示 / Subagent 入れ子 / subagent-list / Subagent group」を混用。glossary.md に Subagent / Subagent group 未登録
- **Action**: 「Subagent」に加え入れ子構造を指す語 (例「Subagent 入れ子 / Subagent group」) の canonical を 1 つ決め glossary 登録、
  spec/plan/DTO フィールド名と揃える。Principle XIV。
