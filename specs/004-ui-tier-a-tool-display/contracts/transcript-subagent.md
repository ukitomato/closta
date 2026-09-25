# Contract: subagent 入れ子の対応づけと DTO (R-4)

`domain` の変換 (`transcript.ts`) と DTO (`transcript-dto.ts`) の契約。**Task 配下の subagent メッセージを
親子で対応づけ、入れ子で運ぶ**。[data-model.md](../data-model.md) §4 / §5 と 1:1。

## C-1 対応づけ規則 (`transcript.ts` の純粋関数)

- **id ベース**で対応づける (**隣接非依存**。親 Task が子より前に現れる SDK 記録順を前提)。鍵は Task の `tool_use.id` ↔
  subagent 配下メッセージの `parent_tool_use_id` (= 起動した Task の tool_use.id。research R-02 で確定)
- 対応する Task を持たない subagent メッセージ (孤児) は**フラット (fallback) で欠落なく**示す
- **循環 / 自己参照** (A→B→A / 自分を親に指す) は **visited-set で検出し当該枝を打ち切って孤児 fallback** に落とす。
  深さ打ち切りだけに頼らず**グルーピング走査時**に止める (取得プロセスが固まらない・二重展開しない。design-gate M-1)
- **一意でない親参照 id** (同一 id の Task 複数 / 複数一致) は **最初の一致に attach か孤児 fallback、二重 attach しない** (design-gate L-4)
- **多段ネストの深さ打ち切りは 2 段構え** (data-model §4 が SSoT): domain は `MAX_SUBAGENT_DEPTH` (=8) 超過を top-level に平坦化
  (欠落なし・深さ有界化)、renderer は `VISUAL_MAX_DEPTH` (=3) 超過を「以降 N 件省略」と明示 + `VISUAL_MAX_CHILDREN` (=50) で件数折りたたみ
- **I/O を持たない**。モックなしでテスト可能 (FR-010)
- **id ベースで隣接に依存しない** (SC-009。**「任意並べ替えで不変」ではなく**、子が親より前の full reorder では孤児化。design-gate PR-H-2)。
  取得プロセス側で走り main を経路に置かない (AD-034)

## C-2 検証表 (テストが 1:1 で対応する)

| # | 入力 | 期待 | SC |
| --- | --- | --- | --- |
| 1 | Task + 配下 subagent メッセージ (親参照あり) | 親 Task の下に入れ子・記録順・件数/順序/役割一致 | SC-004 |
| 2 | 親を持たない孤児 subagent メッセージ | フラット (fallback)・欠落なし | SC-004 |
| 3 | 多段 subagent (深さ > MAX_SUBAGENT_DEPTH) | domain は top-level に平坦化・欠落なし / renderer は visual「省略」明示 | US-2 AC-3 / PR-M-2 |
| 4 | 親 Task と subagent を非隣接に配置 (間に別メッセージ) | id で入れ子・親子不変 (隣接非依存。親が子より前提) | SC-009 / PR-H-2 |
| 5 | subagent メッセージ内の tool_use / text | 通常の part 変換 + サニタイズ (argsText 含む) を通す (R-3 継承 + H-1) | SC-006/007 |
| 6 | 循環 / 自己参照の親参照 | visited-set で枝打ち切り + 孤児 fallback・二重展開なし・固まらない | M-1 |
| 7 | 一意でない親参照 id (複数一致) | 最初の一致に attach か孤児 fallback・二重 attach なし | L-4 |

## C-3 DTO の入れ子表現 (`transcript-dto.ts`。FR-011)

- subagent 入れ子を表現するフィールドを追加する (data-model §5 の (a) `children` か (b) `depth`/`parentId`。
  **ADR / 実装で 1 つに確定**)。**仮想化 (R-3) と両立**すること (深いネストの高さ計算・折りたたみ)
- 追加フィールドを `TRANSCRIPT_PART_FIELDS` / `TRANSCRIPT_MESSAGE_FIELDS` に載せ、`transcript-schema.test.ts` で
  **逐語を運ぶフィールドの集合を固定**する (増えたら検査が落ちる。SC-008)
- 本文は引き続き `MessageChannelMain` の port で運ぶ (main を経路に置かない。C-1 / SC-006)
- **SC-006 の構造検査は、入れ子拡張後の `TranscriptFrameDTO` (children/depth 含む) が port2 のみを流れ、
  handshake 戻り (`TranscriptHandshakeDTO`) に本文/children が載らないことを assert する** (design-gate M-7)

## C-4 R-3 との整合

- `transcript.ts` の既存の tool_use↔tool_result 対応づけ・text/thinking/image/divider の処理を**壊さない**
  (subagent グルーピングは追加であり置き換えではない)
- `convert.ts` (renderer) は DTO の入れ子を `ThreadMessageLike` の subagent 表示 part へ写す。
  既存の text/reasoning/tool-call/image/file/divider の写しを回帰させない
