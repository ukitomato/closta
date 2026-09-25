# Design-gate: security-reviewer (R-4)

**Run**: 2026-09-25 · **Verdict**: Critical 0 / High 3 / Medium 3 / Low 1 · Read-only.

核心: R-4 の 5 専用表示の主コンテンツは **`argsText` (tool 入力) 由来**。R-3 の本文サニタイザ `sanitizeBody`
(bidi/C1 除去 + byte 上限) は `text`/`thinking`/`result` にのみ適用され (transcript.ts:163/167/190)、
**`tool_use` の `argsText` は `safeStringify` のみで sanitize も byte cap も通っていない** (transcript.ts:180)。
R-3 では argsText は fallback の `<pre>` 二次情報だったが、R-4 は主表示に昇格させるため R-3 の防御が主コンテンツに届かない。
Critical 0 (データ漏洩/なりすまし/権限昇格/サービス停止に直結する観察なし。主要 2 穴は表示偽装と renderer DoS で High 上限)。
プロセス境界 (Principle IX / AD-034) は clean — DTO 入れ子は port ペイロード内で main を通らない。

## Findings

### SEC-H-001 [High] tool 入力 (argsText) が本文サニタイザを通らず、双方向制御文字が全専用表示に素通し
- **Where**: transcript.ts:180 (`argsText: safeStringify(b.input)`) vs :163/:167/:190 (text/thinking/result は sanitizeBody);
  data-model §6 / contracts C-3・C-4; 要求 spec US-3 AC-4 / FR-012 / SC-002
- **Issue**: 5 表示の主コンテンツ (Bash command / Edit・Write・MultiEdit old-new-content / ExitPlanMode plan / Task prompt-description /
  TodoWrite content) は全て argsText 由来で `sanitizeBody` を通らない。plain text 描画で React が HTML エスケープするため
  script 実行 (SC-002) は防げるが、**bidi override (Trojan Source, CVE-2021-42574) による表示偽装とレイアウト破壊は防げない**。
  US-3 AC-4 は「双方向制御文字で表示偽装・レイアウト破壊が起きない」を明示要求するがデータフローが満たさない。subagent 入れ子内の
  tool-call にも再帰。ExitPlanMode の plan は MarkdownText 経由でも bidi が text node として生存 (react-markdown は制御文字を除去しない)。
- **Action**: argsText 由来の描画値に bidi/C1 除去を適用。最小案 = transcript.ts の argsText を `safeStringify` 後に `sanitizeBody(...).value` へ通す
  (BE-011 が同ファイルを触る)。あるいは renderer の `tool-args.ts` narrowing が各フィールドを返す直前に bidi/C1 除去を掛け contracts C-2/C-3 に明記。
  plan は sanitize 済み文字列を MarkdownText に渡す。CWE-451。害クラスが表示偽装のため High 上限。

### SEC-H-002 [High] argsText に byte 上限がなく、巨大 diff/plan/Write content が port 膨張 + renderer JSON.parse/描画 DoS を招く
- **Where**: transcript.ts:180 (byte cap なし。result は :190 で `TOOL_RESULT_MAX_BYTES`); convert.ts:16-24,37 (argsText を JSON.parse);
  R-4 `tool-args.ts`; 矛盾 plan Principle IX「args は小さい」/ spec FR-017・SC-006 / data-model §2
- **Issue**: Write `content` / Edit・MultiEdit `old_string`・`new_string` / ExitPlanMode `plan` は argsText に丸ごと入り result と違い
  `TOOL_RESULT_MAX_BYTES` で切り詰められない。数 MB の argsText がそのまま port を渡り renderer で (convert.ts + narrowing で複数回) JSON.parse され
  行単位描画される。data-model §2 の「hunk 折りたたみ」は描画段で、前段の byte 転送・JSON.parse は無制限。FR-017 の「切り詰め」(byte 削減) と
  「折りたたみ」(表示隠蔽) は別物で設計は後者しか担保しない。
- **Why**: 会話由来の巨大 args による renderer resource exhaustion (CWE-400)。main は AD-034 port 経路で保護されるが renderer UI がフリーズ。
- **Action**: argsText にも byte 上限を課す。transcript.ts で `safeStringify(b.input)` に `sanitizeBody(..., 上限)` 相当を適用し切り詰めフラグを
  DTO/表示に伝える (BE-010/BE-011)。あるいは narrowing 段で各フィールドを上限 truncate + folding。FR-017/SC-006 の計測に「巨大 args の byte 上限」を含める。

### SEC-H-003 [High] bidi 除去・args byte 上限を検出できるテストが計画に無く、既存 bidi 回帰テストは args 経路を検証しない
- **Where**: tasks FE-021 (tool-args.test は「壊れた/欠落/型不一致/別名→null」のみ) / FE-042 (bidi ケースが「生 HTML 非描画」寄り) /
  SC-002 (HTML/script のみ) / SC-007 (サニタイザ単体) / SC-006 (折りたたみのみ)
- **Issue**: H-001/H-002 を検出する negative test が計画に存在しない。SC-007 は `sanitizeBody` 単体を測るだけで args 経路に繋がっているかを
  保証しない。SC-006 は折りたたみ (表示) を測るだけで byte 上限 (転送/parse 前) を測らない。→ bidi 素通し・args 無制限がグリーンのまま通過しうる。
- **Action**: (1) tool-args.test に「argsText に bidi/C1 → 返り値に制御文字が残らない」ケース。(2) 巨大 argsText → 上限 truncate の単体テスト。
  (3) FE-042 の bidi ケースを Terminal command / diff old-new / plan の各表示で「制御文字が DOM に現れない」を assert。(4) SC-002/006/007 に紐付け。

### SEC-M-001 [Medium] Agent plan の「R-3 の MarkdownText を通す」は再利用不能な context 依存 component を指し、迂回で safe-url / rehype-raw 非採用が失われる恐れ
- **Where**: `markdown-text.tsx:41-60` (MarkdownText は引数を取らず MarkdownTextPrimitive が text part context から読む); contracts C-3; data-model §6
- **Issue**: plan は tool-call part の argsText 内で text part ではない。`MarkdownText` は context 依存で任意文字列を受けられず、
  `agent-plan.aui.tsx` は (a) convert.ts で plan を text part 化して回すか (b) 独自 markdown レンダラが要る。契約は「MarkdownText を通す」とだけ記し
  解決を明示しない。(b) を選ぶと `urlTransform`(javascript:/vbscript:/file: 除去) と rehype-raw 非採用 (生 HTML 非描画) が落ち FR-006/FR-012 の XSS/URL 境界を失う。
- **Action**: 契約 C-3 / research R-01 で「plan は `safeUrlTransform` を渡した MarkdownTextPrimitive を経由し rehype-raw を足さない」を実名固定し独自経路を禁止。
  plan を text part 化する場合その part も `sanitizeBody` を通す (H-001 と整合)。FE-042 に plan の `javascript:` 無害化・生 HTML 非描画テストを追加。CWE-79。

### SEC-M-002 [Medium] subagent 親子対応づけが循環参照で終端する保証が契約に無い
- **Where**: contracts C-1 / data-model §4 / BE-011
- **Issue**: 親子キーは外部由来。A→B→A の循環親参照で深さ打ち切りは縦を制限するが循環検出は明記されず、cutoff 前に同一メッセージを複数枝に
  重複展開してメモリ/DOM を膨らませる余地 (SC-004 の二重表示禁止に抵触)。
- **Action**: C-1 に「訪問済み id 集合で循環を検出し、循環時は当該枝を打ち切って孤児 fallback」を追記、BE-012 に循環入力ケース。CWE-674。
  (po-reviewer M-002 と同一根)

### SEC-M-003 [Medium] narrowing 失敗・fallback 退避の発生を観測する手段が無い
- **Where**: spec FR-009 / SC-005; plan observability 記述なし
- **Issue**: SDK の args 形は「変わりうる前提」だが、narrowing が恒常的に null を返し全 tool が fallback に落ちる劣化 (SDK 形変更) を検知する
  観測点が無い。本文を log しない制約と両立する形で、内容を含まない集計 (narrowing 失敗率) の観測余地を残すべき。
- **Action**: 本文を含まない counter (toolName 別 narrowing 失敗数) の観測点を検討、または quickstart rubric に「専用表示が想定どおり出るか」を含める。

### SEC-L-001 [Low] 新設 domain グルーピング / renderer narrowing が tool 内容を log/error に載せないことを console 以外の経路でも保証する
- **Where**: tasks SH-060 (「本文を渡す console.* は 0」); 新設 transcript.ts グルーピング / tool-args.ts。現状 domain/session に log 0 件
- **Action**: narrowing は throw せず null を返す契約を error 文字列にも拡張し「fallback の reason に argsText/result 本文を含めない」を SH-060 に 1 行追加。Principle V。
