---
spec_id: 004-ui-tier-a-tool-display
feature_id: R-4
domain: ui
domain_selected_by: auto
targets: both
targets_selected_by: user
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: Tier A tool 表示 (R-4)

**Feature Branch**: `004-ui-tier-a-tool-display`

**Created**: 2026-09-25

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[ui] 過去ログから再現可能な Tier A の tool 表示を実装する。Bash の Terminal block、Edit/Write の Code diff、TodoWrite の Todo list、Task の Subagent list、ExitPlanMode の Agent plan、thinking の Reasoning、連続 tool の Tool group。"

## 本 feature の位置づけ

R-4 は M1「読める」の **4 番目 (最終) の feature** であり、**`ui` domain の 2 本目**である。
R-3 (transcript の基本表示) の出力 — transcript 取得経路 (`getSessionMessages` + `MessageChannelMain` port)・
`TranscriptMessageDTO` / `tool-call` part・`thread.aui.tsx` の描画・本文サニタイザ・XSS 境界・仮想化 —
を入力として受け取り、**過去ログの各 tool 実行に種別ごとの専用表示を与える**。

R-3 は「専用表示を持たない (未定義の) tool はすべて fallback で示す」ことを条件にしていた
([R-3 spec.md](../003-ui-transcript-rendering/spec.md) FR-008 / [R-3 data-model.md](../003-ui-transcript-rendering/data-model.md) §3)。
**R-4 はその fallback を、Claude Code の一次概念に直結する tool 種別について専用表示に置き換える** —
Bash → Terminal block、Edit / Write / MultiEdit → Code diff、TodoWrite → Todo list、
Task → Subagent 表示、ExitPlanMode → Agent plan。thinking の Reasoning と連続 tool の Tool group は
**R-3 で実装済み**であり、R-4 は Tier A 適合の確認と専用表示との共存保証を担う。

**本 feature は読み取り専用である。** セッションを起動せず、送信せず、config に書き込まない。
composer の送信経路は R-3 のまま閉じたまま (`isDisabled: true`) とする。live のツール実行
(行単位ストリーム・permission 承認カード・中断) は **X-1**、日本語 composer は **X-2** が担う。

**本 feature は M1「読める」の最終 feature であり、tool 表示まで含めた判断材料を提示する。**
R-3 の見栄え一次判断に続き、tool 表示の見栄えを実機 rubric で評価できる形を用意し記録する。
**軸 1 (UI 完成度) の正式な方針確定は、R-3 実機一次判断 (roadmap の R-4 前提。現状未実施) の記入と
あわせた別ステップで行う** — 本 feature の done-gate は「判断材料の提示と判定表の記録」までとし、
「M1 完了 / 軸 1 確定」自体を done の合否条件にはしない (R-3 の SC-010 と同じ控えめな基準。
design-gate C-001 の人間承認で positioning 緩和を確定)。

**Tier A の「完全化」は本 feature の目的ではない。** `docs/ui-coverage.md` の確立と Tier A 完全化は
**O-2** の責務である ([docs/domains/_overview.md](../../docs/domains/_overview.md))。R-4 が扱うのは
ユーザ入力が名指した **7 種**であり、それ以外の tool (Read / Glob / Grep / WebSearch / MCP ほか) は
R-3 の fallback のまま残す。R-4 は「未表示情報ゼロ」を主張しない (それは Principle XII の O-2 の到達点)。

**本 spec は「何を満たすか」を定める。** element の選定・自作の要否・args パースの結線・
subagent 入れ子の変換方式といった実装方式は [plan.md](plan.md) / [tasks.md](tasks.md) とコードで決める。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 過去ログの tool 実行を種別ごとの専用表示で読む (Priority: P1)

R-3 で fallback (tool 名・入力・結果) にまとめて出ていた tool 実行が、種別ごとの専用表示になる。
Bash は端末風のブロックにコマンドと出力が並び、Edit / Write は変更が差分として、
TodoWrite はチェックリストとして、ExitPlanMode は計画として読める。thinking は Reasoning に、
連続した tool は Tool group に畳まれ (R-3 実装済み)、その中でも専用表示が成立する。

**Why this priority**: `ui` charter の Journey 1 step 3「tool 実行は種類ごとの専用表示で現れる
(Bash は行単位ストリーム + exit status、Edit は hunk 単位の diff、TodoWrite はチェックリスト)」
そのものであり、PLAN.md §4.2 の Tier A 必須要素に直結する。M1「読める」の判断材料がここで出そろう。

**Independent Test**: 各 tool 種別を含む実データ (または fixture) の transcript を開き、Bash が Terminal block、
Edit / Write が Code diff、TodoWrite が Todo list、ExitPlanMode が Agent plan で描画され、
未対応 tool のみ fallback で残ることを確かめる。セッションの起動を伴わず検証できる。

**Acceptance Scenarios**:

1. **Given** Bash tool 実行を含む過去セッション、**When** transcript を開く、
   **Then** **コマンドと捕捉済み出力が端末風のブロック**で示され、成否 (isError / 結果中の情報) が
   欠落なく分かる (**live の行単位ストリームは対象外** — 過去ログの完了済み出力を静的に示す)
2. **Given** Edit / Write / MultiEdit を含む過去セッション、**When** transcript を開く、
   **Then** 対象ファイルと変更が **hunk 単位の差分**で示され、**変更前/後の文字列が
   生 HTML やスクリプトとして実行されない** (会話由来の untrusted text として扱う)
3. **Given** TodoWrite を含む過去セッション、**When** transcript を開く、
   **Then** 各 Todo の内容と状態 (pending / in_progress / completed) が**視覚的に区別できる**リストになる
4. **Given** ExitPlanMode を含む過去セッション、**When** transcript を開く、
   **Then** 計画が **Agent plan 表示 (plain text)** で示される (生 HTML 非描画・`javascript:` は inert。markdown 整形は tracked debt。AD-035 D6)
5. **Given** 専用表示を持たない tool (Read / Grep / MCP 等) が混じる、**When** transcript を見る、
   **Then** それらは **R-3 の fallback 表示のまま**現れ、欠落しない (Tier A 完全化は O-2)
6. **Given** thinking と連続 tool を含む過去セッション、**When** transcript を見る、
   **Then** thinking は **Reasoning** (R-3)、連続 tool は **Tool group** (R-3) で畳まれ、
   **Tool group 内でも専用表示が成立**する (専用表示が Tool group の畳み込みを壊さない)

---

### User Story 2 - subagent (Task) の入れ子を親子関係で読む (Priority: P1)

Task で起動された subagent の**呼び出し**(種別・依頼) と、その配下で subagent が行った作業
(メッセージ・tool 実行) が、親 Task の下に**入れ子**で読める。R-3 が subagent メッセージを
フラットな fallback に落としていたのを解消し、どの作業がどの subagent に属するかが分かる。

**Why this priority**: PLAN.md §4.2 の Tier A「Task (subagent) → Subagent list, Agent handoff」であり、
[R-3 data-model.md](../003-ui-transcript-rendering/data-model.md) §3 が「subagent (`parent_agent_id != null`) の
ネスト表示は R-4」と明示的に本 feature へ申し送っている。マルチエージェント transcript の可読性の核。

**Independent Test**: 親参照 id を持つ subagent メッセージ (実 key は R-02 で確定) を含む実データ (または fixture) を開き、
それらが親 Task の下に記録順で入れ子表示され、対応する Task を持たない subagent メッセージも
欠落せずフラットに示されることを、同じ transcript を SDK で直接取得した結果と件数・順序・役割で突き合わせる。

**Acceptance Scenarios**:

1. **Given** Task 実行とその配下の subagent メッセージ (親参照 id で Task に対応。実 key は R-02 で確定) を含む transcript、
   **When** 開く、**Then** subagent の作業が**親 Task の下に入れ子**で記録順に並び、
   件数・順序・役割が SDK 由来と一致し、**欠落も二重表示もない**
2. **Given** 対応する Task (親) を持たない孤児 subagent メッセージ、**When** 開く、
   **Then** 捨てずに**フラットに (fallback で) 示す** (欠落禁止)
3. **Given** subagent がさらに subagent を起動した多段ネスト、**When** 開く、
   **Then** 階層が保たれるか、**一定の深さで打ち切って「以降は省略」と明示**する (捏造・欠落をしない)

---

### User Story 3 - 大きい・壊れた・未応答の tool でも表示が破綻しない (Priority: P2)

専用表示は、実データに現れる不完全・敵対的・巨大な入力でも破綻しない。壊れた args、
未応答の tool_use、孤児 tool_result、巨大な tool_result / diff / plan、会話由来の危険な内容が
あっても、クラッシュせず、専用表示か fallback のどちらかで欠落なく示され、main process を固めない。

**Why this priority**: 過去ログは編集不能で、途中で途切れたターン・巨大出力・敵対的内容が実在する。
R-3 が固めた堅牢性 (本文サニタイザ・巨大 result 切り詰め・main をデータ経路から外す・XSS 境界) を
専用表示でも回帰させないことがユーザ価値。P1 (基本の専用表示) が先で、堅牢性は P2。

**Independent Test**: 壊れた args JSON / result=null / 孤児 tool_result / 数 MB の result /
未対応 tool 名 / 敵対的 markdown を含む fixture を与え、各専用表示がクラッシュせず、
専用表示または fallback で欠落なく描画され、巨大本文が main のデータ経路に現れないことを確かめる。

**Acceptance Scenarios**:

1. **Given** args JSON が壊れている / 想定フィールドを欠く tool 実行、**When** 描画する、
   **Then** 専用表示はクラッシュせず、**生 argsText の fallback に安全退避**する
2. **Given** 応答前に途切れた tool_use (`result` なし) / 孤児 tool_result、**When** 描画する、
   **Then** result 無しの専用表示または単独 fallback で**欠落なく**示す
3. **Given** 巨大な tool_result / 巨大な diff / 長大な plan、**When** 描画する、
   **Then** R-3 の上限で**切り詰め + 折りたたみ**表示になり、**本文が main process のデータ経路に現れない**
4. **Given** Edit の変更前/後・plan・Bash 出力に生 HTML / `javascript:` リンク / 双方向制御文字が含まれる、
   **When** 描画する、**Then** スクリプト実行・表示偽装・レイアウト破壊が起きない (R-3 の境界を維持)

---

### Edge Cases

- **出力の無い Bash / 非ゼロ終了の Bash** — 出力なしを示し、成否を捏造しない
- **MultiEdit の多数 hunk / 巨大 diff** — 全 hunk を示すか上限で折りたたみ、欠落させない
- **TodoWrite の空配列 / 未知の status 値** — 空リストを示し、未知 status は生値で示して落とさない
- **Task に result が無い (過去ログの途中終了)** — 呼び出しのみ示し、結果の捏造をしない
- **多段 subagent (subagent がさらに subagent を起動)** — 階層保持か明示的な深さ打ち切り (US-2 AC-3)
- **親参照はあるが対応する Task が無い subagent メッセージ** — 孤児としてフラット fallback (欠落禁止)
- **循環 / 自己参照の親参照** (A→B→A や自分を親に指す) — visited-set で検出し当該枝を打ち切って孤児 fallback に落とす
  (無限ループ・二重展開を起こさない)
- **一意でない / 複数の Task に一致する親参照 id** — 最初の一致に attach するか孤児 fallback とし、二重 attach しない
- **ExitPlanMode の巨大 plan / 敵対的 markdown** — 切り詰め + R-3 の XSS 境界を通す
- **未対応 tool 名 / 壊れた args** — fallback へ安全退避 (US-3 AC-1)
- **専用表示が Tool group / Reasoning グループの内側に来る** — 畳み込みを壊さない (US-1 AC-6)
- **同一 toolName の大文字小文字・別名** — 既知集合との照合を明示し、外れたら fallback (捏造マッチしない)

## Requirements _(mandatory)_

### Functional Requirements

**専用表示 (frontend)**

- **FR-001**: Bash の `tool_use` を **Terminal block 表示**にする。args のコマンドと、`result` の
  捕捉済み出力を**等幅・改行保持**で示し、成否 (`isError` と結果中の情報) を欠落なく示す。
  **live の行単位ストリームは対象外** (過去ログの完了済み出力を静的に再現する。行単位ストリームと
  exit status のリアルタイム表示は X-1)
- **FR-002**: Edit / Write / MultiEdit の `tool_use` を **Code diff 表示**にする。対象ファイルと
  変更を **hunk 単位**で示す。**変更前/後の文字列は会話由来の untrusted text として扱い、
  プレーンテキストで描画する** (生 HTML / markdown / スクリプトを実行しない)
- **FR-003**: TodoWrite の `tool_use` を **Todo list 表示**にする。各 Todo の内容と状態
  (pending / in_progress / completed) を視覚的に区別する
- **FR-004**: Task の `tool_use` を **Subagent 表示**にする。`subagent_type`・依頼内容・最終結果を示す
- **FR-005**: Task 配下の subagent メッセージ (**親参照 id**で当該 Task に対応するもの。対応づけの実 key
  (`parent_tool_use_id` / `parent_agent_id`) は research R-02 で sdk.d.ts + 実データから確定する) を
  **親 Task の下に入れ子**で記録順に示す。対応する Task を持たない subagent メッセージは
  **フラット (fallback) で欠落なく**示す。多段ネストは階層保持か明示的な深さ打ち切りとする (捏造・欠落禁止)
- **FR-006**: ExitPlanMode の `tool_use` を **Agent plan 表示**にする。plan は会話由来の untrusted テキストとして
  **plain text (whitespace-pre-wrap) で示す** — React の escape により生 HTML は描画されず `javascript:` 等も inert text になる
  (AD-035 Decision 6。`MarkdownText` は text-part context 依存で任意文字列を安全に受けられないため独自 markdown 経路を作らない)。
  **markdown 書式の整形 (見出し/箇条書き) は本 feature では行わず roadmap の tracked debt とする** (design-gate PR-H-3)
- **FR-007**: thinking の **Reasoning 表示**と連続 tool の **Tool group** (どちらも R-3 実装済み) を継続し、
  R-4 の専用表示が **Tool group / Reasoning グループの畳み込みと共存**することを保証する
  (専用表示が畳み込みを壊さない)
- **FR-008**: 専用表示を持たない tool (Read / Glob / Grep / WebSearch / MCP ほか) は **R-3 の fallback のまま**
  残す。**R-4 は Tier A の完全化を主張しない** (`docs/ui-coverage.md` の確立と完全化は O-2)。
  R-4 が扱う範囲で表示先の未割当を作らない

**変換 / データ (backend — subagent 入れ子のため)**

- **FR-009**: 各 tool の入力 (`argsText`) の構造化パースは **untrusted 入力として narrowing** し、
  パース失敗・フィールド欠落時は**生 `argsText` の fallback に安全退避**する (専用表示をクラッシュさせない)
- **FR-010**: subagent の親子対応づけは `domain` の**純粋関数**で、**親参照 id (実 key は R-02 で確定)** と Task の
  `tool_use` id を鍵に行い、**I/O を持たずモックなしでテスト**できること。位置ではなく id で対応づける
  (Principle IX / R-3 の変換方針を継承)
- **FR-011**: `TranscriptMessageDTO` / `TranscriptPartDTO` を subagent 入れ子を表現できる形に拡張し、
  **`TRANSCRIPT_PART_FIELDS` / schema 検査に載せる** (逐語を運ぶフィールドの固定を維持。増えたら検査が落ちる)。
  本文は引き続き `MessageChannelMain` の port で運び、main を経路に置かない (Principle IX / R-3 継承)
- **FR-012**: tool の**入力 (argsText) と出力 (result) の双方**の会話由来文字列を **R-3 の本文サニタイザ
  (`sanitizeBody`。双方向制御文字・C1 除去 + バイト上限) に通す**。R-3 は `argsText` にこれを適用していない
  (`text`/`thinking`/`result` のみ) ため、**R-4 は `domain` で argsText にも `sanitizeBody` + バイト上限を適用する**。
  argsText は port2 経由で renderer に届き main を通らない (Principle IX 維持) が、5 専用表示の主コンテンツが argsText 由来の
  ため、**bidi による表示偽装と巨大 args の renderer DoS** を防ぐ。生 HTML 描画・URL allowlist 逸脱も再導入しない
  (R-3 の XSS / URL 境界を回帰させない。[data-model.md](data-model.md) §6 / design-gate H-1)

**制約 (共有)**

- **FR-013**: assistant-ui の element と design system に乗る。**Terminal block / Code diff / Agent plan /
  Todo list / Subagent の各表示は候補 element を実名で照合**し、不適合の場合のみ自作する。自作時は
  **照合した候補名と不適合理由**を PR 説明に記載する (Principle XIII)。独自トークン・スペーシングスケールを追加しない
- **FR-014**: 日本語 (全角混在)・絵文字・コードを含む tool 入出力で**フォント崩れ・レイアウト崩れを
  起こさない**。等幅表示の全角桁が崩れない (Principle VIII)。UI ラベルは日本語を第一言語とする (Principle XV)
- **FR-015**: composer の送信経路は閉じたまま (`isDisabled: true`) とする。本 feature は過去ログの表示であり
  送信しない (R-3 FR-014 を継承。`ChatScreen.test.tsx` の回帰前提を維持)
- **FR-016**: R-4 が扱う **tool 名と content ブロック種別すべてに表示先を割り当て**、[data-model.md](data-model.md) に
  割り当て表として記録する。`docs/ui-coverage.md` は O-2 で作る。**その不在中、Principle XII の自動検証は
  vacuous であり、本 feature の未割当ゼロは data-model の割り当て表 + レビューでのみ担保される** —
  この scope 解釈 (R-3 が design-gate 承認を得たものの継続) は design-gate の人間承認を要する
- **FR-017**: 巨大な入力/出力は上限で扱う。**result 由来 (Bash 出力 / Task 結果)** は byte 上限で切り詰め表示、
  **diff の行数**は上限で折りたたむ (「… 残り N 行を省略」)、**subagent 入れ子の件数**も上限で折りたたむ。
  **args 由来 (Write content / Edit old-new / plan)** が byte 上限を超えると argsText の JSON が壊れるため専用表示は成立せず
  **fallback に安全退避**する (欠落なし。design-gate PR-M-3)。いずれも**本文を main process のデータ経路に置かない**
  (Principle IX / R-3 の port 経路と SC-007 の構造を維持)
- **FR-018**: 未応答の `tool_use` (`result` が `null`)・孤児 `tool_result`・壊れた args を**欠落させず**、
  専用表示 (result 無し) または fallback で示す

### Key Entities _(include if feature involves data)_

- **tool-call part** (既存。[transcript-dto.ts](../../src/domain/session/transcript-dto.ts) の `TranscriptPartDTO`):
  `toolCallId` / `toolName` / `argsText` (入力の JSON 文字列) / `result` (サニタイズ済み tool_result 本文。未応答は `null`) /
  `isError`。**R-4 の専用表示の入力**。argsText は untrusted としてパースする
- **各 tool の args 形** (renderer で narrowing する外部形): Bash=`command`、Edit=`file_path`/`old_string`/`new_string`、
  Write=`file_path`/`content`、MultiEdit=`file_path`/`edits[]`、TodoWrite=`todos[]` (`content`/`status`/`activeForm`)、
  Task=`subagent_type`/`description`/`prompt`、ExitPlanMode=`plan`。**Claude Code / SDK 由来の外部形**であり、
  形が変わりうる前提で narrowing する ([data-model.md](data-model.md) §2)
- **Subagent group** (新規。glossary の canonical 語): Task の `tool-call` part と、その配下の subagent メッセージ
  (**親参照 id で対応づく。実 key は R-02 で確定**) の入れ子。対応づけは `domain` の純粋関数 (FR-010)
- **DTO 拡張** (新規): subagent 入れ子を表現するフィールド。`TRANSCRIPT_PART_FIELDS` / schema 検査に載せる (FR-011)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 実データ (または各種別を含む fixture) の過去セッションで、**Bash が Terminal block、
  Edit / Write / MultiEdit が Code diff、TodoWrite が Todo list、ExitPlanMode が Agent plan** で描画され、
  専用表示を持たない tool のみ fallback で残る (計測経路: fixture Vitest + quickstart 実機)
- **SC-002**: Code diff で **file_path と hunk が示され**、変更前/後の文字列が **生 HTML / スクリプトとして
  実行も描画もされない** (計測経路: negative test Vitest)
- **SC-003**: TodoWrite の各 Todo の status (pending / in_progress / completed) が **status ごとに区別可能な
  DOM マーカーで描画**され、未知 status も生値で欠落しない (計測経路: fixture Vitest)。**視覚的な差異の確認は
  quickstart 実機** (jsdom はレイアウトを持たない。SC-006/SC-007 と同じ書き分け)
- **SC-004**: Task 配下の subagent メッセージが**親の下に入れ子**で並び、同じ transcript を SDK で
  直接取得した結果と**件数・順序・役割が一致**し、欠落・二重表示が **0**。孤児 subagent はフラットで欠落なし
  (計測経路: `domain` 変換 Vitest + quickstart 実機)
- **SC-005**: **壊れた args JSON・未応答 tool_use・孤児 tool_result・未対応 tool 名**で専用表示が
  **クラッシュせず fallback に安全退避**する (計測経路: fixture Vitest)
- **SC-006**: 巨大な tool_result / 巨大な diff が**上限で切り詰め・折りたたまれ**、**本文が main process の
  データ経路に現れない** (R-3 SC-007 の構造を維持) (計測経路: port transfer の構造検査 + 手動レビュー + Vitest)
- **SC-007**: 日本語・全角混在・絵文字・コードを含む tool 入出力で、**サニタイザが改行/タブを保持**する
  (計測経路: Vitest)。**視覚的なレイアウト崩れの確認は quickstart の実機** (jsdom はレイアウトを持たない。R-3 SC-006 と同じ書き分け)
- **SC-008**: R-4 が扱う **tool 名・content ブロック種別すべてに表示先が割り当てられ**、[data-model.md](data-model.md) に
  記録されている。DTO の逐語フィールドが schema 検査に載っている (計測経路: 割り当て表 + レビュー + schema Vitest)
- **SC-009**: subagent の対応づけが **id ベースで隣接に依存しない** — 親 Task が子より前に現れる SDK の記録順を前提に、
  親 Task と subagent メッセージが**隣接していなくても** id で入れ子になる (計測経路: `domain` 変換 Vitest)。
  **「任意の並べ替えで不変」ではなく隣接非依存に narrowing** した (子が親より前に来る full reorder では孤児化する。design-gate PR-H-2)
- **SC-010** (見栄えの判断材料の提示): 実機で各専用表示 (Terminal / Code diff / Todo / Subagent / Agent plan) を
  **判定 rubric の各観点で OK/NG を記録できる形**を用意し、tool 表示まで含めた軸 1 の**判断材料を提示**する。
  rubric は少なくとも (a) Terminal block が Claude Code TUI と同等以上に読める、(b) Code diff の hunk が
  追える、(c) Todo / Subagent / Agent plan が欠落なく構造を示す、(d) 日本語・全角で崩れない、を含む。
  **判定表が `quickstart-results.md` に記録済みであることを done の必須項目**とする (実機操作の実施と OK/NG 判断は
  人間 deferred。記録の有無は機械確認可能)。**「M1 完了 / 軸 1 方針確定」自体は本 feature の done-gate 合否条件にしない** —
  R-3 の SC-010 と同じ控えめな基準とし、軸 1 の正式な確定は R-3 実機一次判断 (roadmap の R-4 前提。現状未実施) の
  記入とあわせた**別ステップ** (roadmap に tracked) で行う。計測経路: quickstart + 機械確認 (design-gate C-001 の positioning 緩和)

## Assumptions

- **[ASSUMED: live 実行は対象外]** 過去ログは完了済みのため、Terminal block の行単位ストリーム・
  permission 承認カード・中断は本 feature の対象外。R-4 は**過去ログから再現可能な**静的表示に限る。
  live 実行の配線は X-1、日本語 composer は X-2 (ユーザ入力「過去ログから再現可能な」に対応)
- **[ASSUMED: 対象 tool は 7 種]** ユーザ入力が名指した Bash / Edit・Write / TodoWrite / Task /
  ExitPlanMode / thinking / 連続 tool に限る。Read / Glob / Grep (File tree)・WebSearch / WebFetch・
  MCP・承認カードほかの Tier A 残要素は **O-2 / X-1 以降**。R-4 で fallback のまま残す
- **[ASSUMED: File 表示は据え置き]** R-3 の `convert.ts` が `file` part を `📎 filename` の text に
  落としている点 (「File element への完全対応は R-4 / O-2 に譲る」) は、ユーザ入力に無いため **O-2** に送る。
  R-4 は tool 表示に集中する
- **[ASSUMED: Reasoning / Tool group は確認のみ]** thinking の Reasoning と連続 tool の Tool group は
  R-3 で実装済み。R-4 は Tier A 適合の確認と専用表示との共存 (FR-007) を担い、作り直さない
- **[ASSUMED: 多段 subagent の深さ]** subagent がさらに subagent を起動する多段ネストは、
  一定の深さで打ち切り「以降は省略」と明示する方式を既定とする (無制限ネストの描画コストを避ける。
  深さの具体値は data-model §4 (SSoT) で定数化する)
- **[ASSUMED: args の narrowing 場所]** tool args (`argsText`) の構造化パースは、DTO の本文経路を
  増やさないため **renderer 側 (R-3 の `convert.ts` の `parseArgs` と同様)** で untrusted narrowing する。
  subagent の親子対応づけ (件数・順序に関わる構造) のみ `domain` の純粋関数に置く (FR-010)

## Dependencies

- **R-3 (transcript の基本表示)** の FR/SC を継承する — transcript 取得経路
  (`getSessionMessages` + `MessageChannelMain` port)・`TranscriptMessageDTO` / `tool-call` part・
  `thread.aui.tsx` の描画と `part.toolUI ?? ToolFallback` の分岐・本文サニタイザ・**XSS / URL 境界**・
  仮想化。**R-4 はこれらを回帰させない**
- **R-3 の実機一次判断** ([docs/roadmap.md](../../docs/roadmap.md) の「R-4 着手の前提」) —
  `quickstart-results.md` の rubric-a/b (markdown ハイライト / 日本語行送り) を実機で埋め「一次判断」結論を記す。
  **実機操作のため人間 deferred**。いずれかが NG なら charter「見た目の判断を先送りしない」に従い別 task を起票する。
  本 spec はこの前提の**存在**を記録するが、R-4 の設計自体は R-3 の描画基盤 (実在) に依存する
- 参照 ADR: [AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md) (element 実在。§4.2 の Tier A 35 要素は実在) /
  [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) (SDK メッセージ型の**分母**。
  **`parent_agent_id` の出所は AD-020 ではなく sdk.d.ts 0.3.270 / R-3 data-model §1**。実 key は R-02 で確定) /
  [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) (Elements 導入コスト。`.aui.tsx` 固定) /
  [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) (取得経路とプロセス境界。port で main を外す) /
  [AD-023](../../docs/decisions/0023-application-architecture.md) (5 レイヤ / `useExternalStoreRuntime` / MessagePort)
- **PLAN.md §4.2** の Tier A 表 (Claude Code 概念 ↔ assistant-ui Element の対応)

## targets 変更の記録

ユーザ入力は `--targets frontend` だったが、**Task 配下の subagent メッセージの入れ子表示** (US-2) には
親子対応づけを `domain` の変換 (`transcript.ts`) に足し `TranscriptMessageDTO` を拡張する必要があるため、
**AskUserQuestion で targets を `both` に確定**した (`targets_selected_by: user`)。
BE (subagent グルーピングの純粋関数 + DTO 拡張 + schema) / FE (5 種の専用表示 + 入れ子描画 + tool-UI 登録) /
SH (割り当て表・element 照合・ADR・glossary・docs) の 3 系統に分ける。

**5 種の専用表示そのもの (Bash / Edit・Write / TodoWrite / Task の呼び出しカード / ExitPlanMode) は
renderer 単独で成立する** (既存 DTO の `toolName` / `argsText` / `result` から描画)。`both` に上がる理由は
**subagent 入れ子の 1 点**に限られる。frontend 最小案 (入れ子を fallback に残す) はユーザが棄却した
(AskUserQuestion: 「ネスト描画まで含める / both に昇格」)。
