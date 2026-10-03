# Data Model: Tier A tool 表示 (R-4)

[spec.md](spec.md) / [plan.md](plan.md) の Phase 1 成果物。**tool 種別ごとの表示への割り当て**と、
**subagent 入れ子の DTO 表現**を定義する。実装コード (`transcript.ts` / `transcript-dto.ts` /
renderer の各 `.aui.tsx`) がこの表を正本とする。

## §1 入力 (R-3 から継承。変更しない)

R-4 は新たに SDK を呼ばない。入力は R-3 の取得経路が渡す [`TranscriptMessageDTO`](../../src/domain/session/transcript-dto.ts) で、
`tool-call` part が `toolCallId` / `toolName` / `argsText` (入力の JSON 文字列) / `result` (サニタイズ済み) /
`isError` を持つ。subagent 入れ子のために `SessionMessageLike.parent_agent_id` /
`parent_tool_use_id` (既に宣言済み。現状未使用) を**変換で使う** (§4)。

## §2 各 tool の args / result の narrowing 表 (renderer。FR-009)

**この表が narrowing の正本である。** `argsText` を `JSON.parse` し、下の主フィールドを検査する。
**欠落・型不一致・パース失敗は生 `argsText` の fallback へ安全退避**する (SC-005)。値は Claude Code / SDK 由来の
外部形であり、**形が変わりうる前提**で narrowing する (research R-03 で実名裏取り)。

| toolName | 主フィールド (args) | result | 専用表示 | untrusted 扱い |
| --- | --- | --- | --- | --- |
| `Bash` | `command: string` (任意 `description`) | 捕捉済み出力 (文字列) | Terminal block | command / output を**プレーンテキスト**。exit code は result に有れば示し無ければ捏造しない (`isError` で成否) |
| `Edit` | `file_path` / `old_string` / `new_string` (任意 `replace_all`) | 適用結果 | Code diff (1 hunk) | old/new は**プレーンテキスト**で描画 (生 HTML/markdown/script 不可) |
| `Write` | `file_path` / `content` | 適用結果 | Code diff (全行 add) | content は**プレーンテキスト** |
| `MultiEdit` | `file_path` / `edits[]` (`old_string`/`new_string`) | 適用結果 | Code diff (複数 hunk) | 各 edit を**プレーンテキスト** |
| `TodoWrite` | `todos[]` (`content` / `status` / `activeForm`) | 確認 | Todo list | `status` を既知集合 (pending/in_progress/completed) に照合、外れは生値で示す |
| `Task` | `subagent_type` / `description` / `prompt` | subagent 最終 text | Subagent | prompt/description は sanitize 済み本文として扱う |
| `ExitPlanMode` | `plan: string` (会話由来テキスト) | 承認/却下 | Agent plan | plan は**プレーンテキスト**で描画 (React escape。生 HTML 非描画・`javascript:` inert)。markdown 整形は tracked debt (§6 / AD-035 D6) |
| 上記以外 | — | — | **ToolFallback (R-3)** | R-4 で専用化しない (O-2 / X-1)。割り当て漏れではない |

**サニタイズと大きさの上限** (design-gate H-1。R-3 の `sanitizeBody` は `argsText` に未適用だったため R-4 で足す):
- **`argsText` は `domain` (`transcript.ts`) で `sanitizeBody` (双方向制御文字・C1 除去) + バイト上限を通す** —
  R-3 は `text`/`thinking`/`result` にのみ適用していた。5 専用表示の主コンテンツ (command / old-new / content / plan / prompt) が
  argsText 由来のため、**bidi 表示偽装 (Trojan Source) と巨大 args の renderer DoS** を防ぐ。切り詰めフラグを DTO/表示に伝える
- Bash 出力 / Task 結果 = R-3 の `result` (既に `TOOL_RESULT_MAX_BYTES` で切り詰め済み)。renderer で再取得しない
- diff の行数が多い場合 = **`MAX_DIFF_ROWS` (=200) で折りたたむ**「… 残り N 行を省略」(code-diff.aui.tsx。FR-017)
- **argsText が byte 上限を超えて切り詰められると JSON が壊れる** — `parse*Args` が `null` を返し専用表示は成立せず
  **fallback に安全退避**する (Write の巨大 content / Edit の巨大 old-new / 巨大 plan。欠落なし。design-gate PR-M-3)。
  したがって「切り詰め済みだが有効な巨大 argsText」は実際には現れにくい。**`truncated` フラグは argsText 切り詰め (`transcript.ts:221`) と
  result 切り詰め (`:238`) の論理和**であり、code-diff の「（切り詰め）」バッジは主に **result 側の切り詰め**を示す信号として点灯する
  (Edit/Write の巨大 result。code-diff は result 本体を描かないが「元データが切り詰められた」事実だけを示す)。argsText 側の切り詰めは
  上記のとおり fallback に退避するため、バッジではなく fallback で現れる (po-reviewer PR-L1)
- **argsText は port2 経由で renderer に届き main を通らない** (Principle IX 維持)。ただし巨大 args が renderer の
  `JSON.parse`/描画をブロックしないよう、上記 byte 上限を**取得プロセス側 (parse 前)** で先に効かせる (platform-boundary M-001 / security H-002)

## §3 表示先の割り当て表 (Principle XII の暫定台帳。FR-016 / SC-008)

> **2026-10-03 追記 (O-2)**: この暫定台帳の正本は [`docs/ui-coverage.md`](../../docs/ui-coverage.md) に移った。下で O-2 に送った行は、対応表で O-4 / O-5 / O-6 に割り当てた。

**この表が R-4 が扱う範囲の割り当ての正本である。** `docs/ui-coverage.md` は **O-2** で作る。
**その不在中、Principle XII の自動検証 (未割当行 grep) はファイル不在で vacuously pass する** —
本 feature の未割当ゼロは**この表 + レビュー**でのみ担保される。この scope 解釈 (R-3 が design-gate 承認済み) の
**継続は design-gate の人間承認を要する**。

### R-4 が専用表示を与える (7 種)

| Claude Code 概念 | toolName / block | 表示先 (R-4) | 備考 |
| --- | --- | --- | --- |
| Bash | `tool_use` name=`Bash` | **Terminal block** (`terminal-block.aui.tsx`) | 行単位 live ストリームは X-1 |
| Edit / Write / MultiEdit | `tool_use` name=`Edit`/`Write`/`MultiEdit` | **Code diff** (`code-diff.aui.tsx`) | hunk 単位 |
| TodoWrite | `tool_use` name=`TodoWrite` | **Todo list** (`todo-list.aui.tsx`) | status 区別 |
| Task | `tool_use` name=`Task` | **Subagent** (`subagent.aui.tsx`) | 呼び出しカード |
| Task 配下メッセージ | 親参照 id あり (実 key は R-02) | **Subagent 入れ子** (`subagent.aui.tsx` 再帰 / convert) | §4 |
| ExitPlanMode | `tool_use` name=`ExitPlanMode` | **Agent plan** (`agent-plan.aui.tsx`) | plan は**プレーンテキスト** (§6 / AD-035 D6) |
| thinking / redacted_thinking | block `thinking` | **Reasoning** (R-3 `reasoning.aui.tsx`) | R-3 実装済み。共存を確認 (FR-007) |
| 連続 tool_use | 隣接 `tool-call` | **Tool group** (R-3 `tool-group.aui.tsx`) | R-3 実装済み。専用表示と共存 (FR-007) |

### R-4 が fallback のまま残す (O-2 / X-1 以降に送る。割り当て漏れではない)

| Claude Code 概念 | 現状の表示先 | 送り先 |
| --- | --- | --- |
| Read / Glob / Grep | ToolFallback (R-3) | File tree は O-2 |
| WebSearch / WebFetch | ToolFallback (R-3) | O-2 |
| MCP tool / MCP elicitation | ToolFallback (R-3) | O-2 |
| canUseTool (承認) | 表示対象外 (過去ログに承認 UI は無い) | live 承認カードは X-1 |
| `file` part (document) | R-3 の `📎 filename` text | File element は O-2 |
| compact boundary (`divider`) | R-3 の最小区切り | 専用 element は O-2 |
| その他の未知 tool | ToolFallback (R-3) | — |

**実装時の義務**: R-4 が拾う `toolName` を `tool-registry.aui.tsx` の 1 箇所に集め、**上表の 5 tool 種
(Bash / Edit・Write・MultiEdit / TodoWrite / Task / ExitPlanMode) と 1:1 で照合**する。
**thinking (Reasoning) と連続 tool (Tool group) は toolName ではなく R-3 の grouping が担うため registry の対象外**。
未対応 toolName が fallback に落ちることをテストで固定する (割り当て漏れと fallback を区別する。design-gate M-2)。

## §4 subagent 入れ子の対応づけ (US-2 / SC-004 / SC-009。最も誤りやすい)

現 `transcript.ts` は `parent_agent_id` / `parent_tool_use_id` を**宣言だけして使わず**、メッセージを
flat に出す。R-4 は親子を対応づけて入れ子にする。

**この §4 が subagent 対応づけと深さ打ち切りルール・値の SSoT である** (design-gate L-2。他成果物は参照形)。

**規則** (research R-02 で実 key を確定してから実装):
- **id で対応づける** (**隣接非依存**)。Task の `tool_use.id` と subagent 配下メッセージの
  親参照 (`parent_tool_use_id` = 起動した Task の tool_use.id。R-02 で確定) を鍵にする。**親 Task が子より前に現れる
  SDK 記録順を前提**とし、親子が隣接していなくても id で入れ子になる (design-gate PR-H-2)
- 対応する Task (親) を**持たない** subagent メッセージ (孤児) は捨てず**フラット (fallback) で示す** (欠落禁止)
- **循環 / 自己参照の検出** (design-gate M-1): 親参照が循環する (A→B→A / 自分を親に指す) 場合、**visited-set で検出し
  当該枝を打ち切って孤児 fallback に落とす**。深さ打ち切りだけに頼らず、`domain` のグルーピング**走査時**に循環を止める
  (取得プロセスが cycle で固まらない・同一メッセージを複数枝に二重展開しない)
- **一意でない親参照 id** (design-gate L-4): 同一 id の Task が複数 / 親参照が複数 Task に一致する場合、
  **最初の一致に attach するか孤児 fallback とし、二重 attach しない** (SC-004 の二重表示 0)
- **多段ネストの深さ打ち切りは 2 段構え** (design-gate PR-M-2):
  - **domain** — `MAX_SUBAGENT_DEPTH` (=8) を超えるネストは欠落させず **top-level に平坦化**して深さ・port2 ペイロードを有界化する
    (病的入力対策の容量境界)。捏造・欠落しない
  - **renderer** — `VISUAL_MAX_DEPTH` (=3) を超える入れ子は **「以降 N 件を省略」と明示**する (視覚的打ち切り。AC-3)。
    加えて 1 階層の子件数を `VISUAL_MAX_CHILDREN` (=50) で折りたたむ (PR-M-1)
- 対応づけは **`domain` の純粋関数内で閉じる** (I/O なし。モックなしでテスト)
- **id ベースで隣接に依存しない** — 親 Task が子より前に現れる記録順を前提に、隣接していなくても入れ子になる (SC-009。
  **「任意並べ替えで不変」ではない**: 子が親より前に来る full reorder では孤児化する。design-gate PR-H-2)

## §5 DTO の入れ子拡張 (FR-011)

`transcript-dto.ts` を subagent 入れ子を表現できる形に拡張する。**逐語を運ぶフィールドを固定**し
`TRANSCRIPT_PART_FIELDS` / `transcript-schema.test.ts` に載せる (増えたら検査が落ちる。R-3 の方針を継承)。

**表現の候補** (ADR / 実装で 1 つに確定):
- (a) `tool-call` part (Task) に `children: readonly TranscriptMessageDTO[]` を足し、subagent の
  メッセージ列を入れ子に持つ
- (b) `TranscriptMessageDTO` に `depth: number` / `parentId: string | null` を足し、renderer が
  インデントで表現する

**判断基準**: (a) は木構造が DTO に閉じ renderer が再帰描画するだけで済む。(b) は flat 配列のまま
描画側でグルーピングが要る。**仮想化 (R-3) との相性**を考え、`children` を持つと仮想行の高さ計算に影響するため、
**深いネストの折りたたみと仮想化の両立**を実装で確認する。確定した表現を **schema 検査に載せる**。

### glossary へ追加 (§UL)

| 用語 | 定義 | Domain |
| --- | --- | --- |
| **Subagent (サブエージェント)** | Task tool で起動される副エージェント。過去ログでは配下メッセージが**親参照 id** (実 key は R-02 で確定) で親 Task に対応づく。親 Task の下に入れ子表示する (R-4) | `session` 共有 (外部概念) / 表示は `ui` |
| **Subagent group (サブエージェント入れ子)** | Task の tool-call part と、その配下 subagent メッセージの入れ子構造 (canonical。spec Key Entities / DTO フィールド名をこの語に揃える。design-gate ARCH-L-001) | `ui` |

- 既存の **Element** / **Tier A/B/C** は既存定義を使う。**「Tier A 完全化は O-2」**の注記と齟齬させない
- **TranscriptView** (R-3 で追加) の定義に「tool 種別ごとの専用表示 (R-4)」を 1 行足す

## §6 XSS / サニタイズ (R-3 から継承。回帰させない。FR-012)

R-4 は R-3 の境界を**再利用する**が、**`argsText` への `sanitizeBody` 適用は R-4 で新たに足す** (R-3 は
`text`/`thinking`/`result` にのみ適用しており argsText は素通しだった。design-gate H-1)。

- **本文サニタイザ** (`sanitize-body.ts`) を通した `result` / text / **`argsText` (R-4 で追加)** を表示する
  (改行/タブ保持・双方向制御文字/C1 除去 + バイト上限)。5 専用表示の主コンテンツが argsText 由来のため必須
- **Agent plan の plan は plain text (whitespace-pre-wrap) で描画する** (AD-035 Decision 6 / design-gate PR-H-3)。
  `MarkdownText`/`MarkdownTextPrimitive` は text part context 依存で任意文字列を安全に受けられないため
  **独自 markdown 経路を作らない**。plain text のため生 HTML は描画されず `javascript:` 等のリンクも inert text になり
  URL allowlist は自明に満たす。**markdown 書式の整形は roadmap の tracked debt** (SEC-M-001 の resolution も ADR で plain-text に変更)
- **URL allowlist** — 本文中のリンク (text part の markdown) は R-3 の `safe-url.ts` の allowlist を通す (R-3 経路。R-4 で回帰させない)
- **Edit/Write/MultiEdit の old/new・Bash の command/output・plan は markdown ではなくプレーンテキスト**で描画する
  (会話由来の untrusted text。diff/terminal/plan に markdown 解釈・HTML 描画を持ち込まない)
- CSP を最終防御線に保つ (AD-024/AD-025 §7)
