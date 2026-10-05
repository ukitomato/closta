# Tasks: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents / scripts、`[FE]` renderer、`[SH]` 横断。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いは spec の FR / SC、行・本文の伏せ字・取り消し・tool の見出しと中身・File tree の作り方・結果の状態・読み上げ・文言・対応表の書き換え先は data-model、方式の理由は research。

**着手の条件**: **O-7 (013)・O-4 (014)・O-5 (015) がマージされるまで /cl-implement に入らない。** AD-046 / AD-047 / AD-048 / AD-049 の accepted と spec の U-1〜U-7 の承認は 2026-10-05 に済み。

**順序の制約**: SH-001 → コード。SH-002 / FE-001 → FE-020〜FE-023 (照合と provider の確認の結果で表示の作りを決める。FE-001 が失敗したら U-4 を plain text に戻し、FR-009・data-model §5 の ExitPlanMode の行・AD-049 Decision 4 を取り下げる)。BE-001 → BE / FE の他。SH-010 は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] glossary — 会話の境界 (既存の「セッションの境界」との関係) と TranscriptBoundary (圧縮の境界 / コンパクション境界 / Compaction boundary の同義の整理)、取り消し (retraction。Counterexample「O-4 の保留の取り消しとは別物」)、結果待ち / 結果不明、O-11、System event row の定義の拡張 (category の追加)、Hook の定義の Counterexamples (O-6 → O-11、`informational` の本文の例外)、Background task の Counterexamples (:87 の「O-6」→ O-11)、WslUncPath の Counterexamples (会話の本文の UNC の綴りは WslUncPath ではない)、計量 (meter) の定義 (「セッションの付随情報の経路 (計量・構成・取り消し)」に)、知らせ (出所を見分けない)、読み上げの対象を「見ているセッション」に
- [ ] **SH-002** [SH] [P] element の照合 — registry の File tree / Tool call / Web search / Todo list / Day separator を実名で照合 (区切りの element は registry に無いので TranscriptBoundary を作る理由を PR に書く)。不採用・作り替えの条件: 本番の CSP の下で動かない・外部への取得 (favicon など) がある・CSP を緩める必要がある・意味が違う (File tree は差分の要約)・項目の操作を無効にできない。結果の正本は PR の説明
- [ ] **FE-001** [FE] [P] 確認 — `TextMessagePartProvider` の中で `MarkdownText` が描け、`safeUrlTransform` が効くこと (research R-06)。描けなければ U-4 を plain text に戻す (RK-06)
- [ ] **BE-001** [BE] domain (+ test) — `transcript-dto.ts` の category 4 つと status 6 つ (説明の直し)、`system-event.ts` の `isTerminalSystemEventStatus`、`secret-redaction.ts` (新設。data-model §1 の伏せ字の表と fixture の正本の全部。`secret-scan.ts` の接頭辞の集合を含む固定テスト。4 KB の敵対的な入力が 50 ms 以内)、O-4 の `meter.ts` の `retraction` と検証 (id の形・1〜128 件)。固定テスト: `MeterUpdate` の種類の集合、`PermissionRequest` のフィールドの集合、`toPermissionResult` の出力の形、`transcript-schema.test.ts` の category / status

## US-1 — 会話の区切りと止まった理由が分かる (P1)

- [ ] **BE-010** [BE] `sdk-agent-session.ts` / O-4 の `live-system-rows.ts` / `live-tool-results.ts` / `transcript.ts` (+ test) — 4 つの category の行 (値の照合は `Object.hasOwn`、行の id の形の検査)、`supersedes` と `retracted_message_uuids` から `retraction` (128 件ごとに分ける)、`retract`、過去ログの `system` の text の part に `redactSecrets`。テスト: data-model §1 の読まないフィールドの目印が出力に 0 件、伏せ字の目印 (`Bearer`・URL の資格情報・`AKIA`・JWT・`token=`) が実行中の出力と過去ログの DTO (`informational`・`local_command_output`・拒否の 4 つの subtype) に 0 件、伏せ字の前の本文をログに書かない、`constructor` / `__proto__` / `"retry local"` の値、1 秒に 21 件の `meter` の後でも `retraction` が届く、`finish` の直前の `retraction` が捨てられない、取り消した後に結果が届いても同じ id の `message` も結果だけのメッセージも送らない、SDK の `uuid` と送る id が一致する、過去ログの変換に行を足していない (回帰)、domain の divider の生成が 1 か所。開発用のログに指示の件数・形で落とした件数・当たらなかった件数を数だけ残す
- [ ] **FE-010** [FE] `session-event-decoder.ts` と `running-session-store.ts` (+ test) — `retraction` の検証 (配列でない・0 件・129 件で捨てる、形の合わない id は 1 件ずつ)、同じセッションの `messages` から外す (冪等・知らない id・閉じたセッション)、外した id の後の `message` を足さない、`close()` で記憶を消す、隠れた古いメッセージの件数、表示位置を保つ、外した後に `trackDerived` を通す (直近の活動に取り消した tool が出ない)、O-4 の `toolElapsed` から取り消した `toolUseId` を消す、承認の要求 (`pending`) は残る。port → decoder → ストアを通すテスト
- [ ] **FE-011** [FE] `transcript-boundary.tsx` (新設) と `SystemEventRow` (4 つの category。本 feature の category は `detail` を折り返す) と `convert.ts` の divider の写し。テスト: US-1 の AC1〜AC6 (過去ログの divider は数を省く)、同じ `tool_use_id` の知らせが 1 行にまとまる、拒否の分類の訳 (知らない値は出ない)、`SystemEventRow` の title (011 pr-gate a11y L-201)、「SDK が知らない状態」の文言と matcher (ux L-101 / L-104)、圧縮の行と境界の順

## US-2 — ファイル・検索・Web・計画の tool が何をしたかが分かる (P1)

- [ ] **FE-020** [FE] [P] `file-tool.aui.tsx` と `features/chat/path-tail.ts` (新設。`session-view.ts` から使う) と写して変えた File tree — `Read` / `Glob` / `Grep` (data-model §2)。テスト: パスを本文のまま出す (WSL・Windows 形式・UNC の 3 つの fixture で `argsText` と同じ値)、renderer に UNC の綴りが無い (項目 12)、`pathTail` の末尾の区切り、File tree の作り方 (注記・0 件で text・200 件・1,024 コードポイント・相対パスの直下のファイル)、切り詰めると同じになる 2 行が両方出る (key は添字)、`__proto__/x`・`constructor/prototype/y`・`toString` の行で `({}).children === undefined`、`pattern` を正規表現にしない、見出しの自由文に伏せ字、項目に操作が無い、中身は既定で畳む、エラー・空の結果、`output_mode` の訳
- [ ] **FE-021** [FE] [P] `web-tool.aui.tsx` — `WebFetch` / `WebSearch`。テスト: 見出しが host だけ (パス・クエリ・資格情報・フラグメントが 0 件)、webhook の形の URL (`/services/T…/B…/<secret>`・`/api/webhooks/1/abc`) で見出しにも中身にも秘密の要素が出ない、scheme の無い `user:pass@host/p`・`javascript:`・`data:` で「URL」、見出しがリンクでない、`query` に伏せ字
- [ ] **FE-022** [FE] [P] `task-tool.aui.tsx` — `TaskCreate` / `TaskUpdate` (TodoList の 1 項目)・`TaskGet` / `TaskList` (text)。テスト: 状態の対応・知らない値・`subject` の無い `TaskUpdate`・`status` の無い `TaskUpdate` (見出しだけ)・`TaskCreate` の結果の text にタスクの id が見える、TodoWrite と Task 系のエラー (`isError`) の印 (011 pr-gate po H-001)
- [ ] **FE-023** [FE] `tool-registry.aui.tsx` に 9 つ、`agent-plan.aui.tsx` を `TextMessagePartProvider` + `MarkdownText` と「原文」に。テスト: US-2 の AC1〜AC7 (過去ログと実行中の fixture)、入力が正しいとき 9 つが ToolFallback に落ちない、Agent plan に `ChatScreen.test.tsx` の XSS の fixture 一式とリモート画像・`data:image/svg+xml`・`<img onerror>`・`file:` / `vbscript:` (href は http(s) か相対だけ)、`<!-- hidden -->` で「表示されない部分」の印が出て「原文」で見える、他の tool の結果が markdown で描かれない。固定テスト: `@assistant-ui/react-markdown` の import が `markdown-text.tsx` だけ、`TextMessagePartProvider` の import が `agent-plan.aui.tsx` だけ

## US-3 — tool の結果を待っているか、来なかったかが分かる (P2)

- [ ] **FE-030** [FE] `tool-result-state.ts` (+ test。新設) と thread の context — data-model §3 の表。fixture: 並列の tool の結果が 1 つずつ・まとめて届く、中断の後、応答待ち (`done`) の間、承認待ち、前のターン、O-2 の 256 件の上限で結果が別のメッセージに入った tool (「結果は別に表示」)
- [ ] **FE-031** [FE] data-model §3 に列挙したすべての表示に状態の印。ToolFallback を含む状態のアイコンを `toolResultState` から決める (assistant-ui の part の状態を使わない)。ToolFallback の見出しと状態の文言 (Cancelled / Error) の日本語化。密度の説明と成功の ✓ のコントラスト (011 pr-gate a11y L-001 / L-202)。テスト: 応答中のターンで前のメッセージの tool に ⚠ が出ない
- [ ] **FE-032** [FE] `TranscriptAnnouncer.tsx` (新設) — data-model §4。テスト: US-3 の AC1〜AC4、Hook / task の行が新しく終わったときの読み上げ、1 秒に 1 回以下 (偽の時計)、最初の描画・セッションの切り替え・過去ログ・「さらに表示」で読まない、セッションの終わりの一斉の結果不明を読まない、読み上げの文に `content` / 説明 / `prompt` / パス / Hook 名の目印が 0 件、知らない tool 名を「tool」と読む、vitest-axe の違反 0

## 境界の検査

- [ ] **BE-040** [BE] `scripts/constitution/allowlists.mjs` の `QUERY_MUTATION_METHODS` に `readFile` / `backgroundTasks` / `reloadOutputStyles` (FR-018)。`QUERY_MUTATION_METHODS` の集合の固定テスト (O-5 の 11 を含む完全な集合。変えるには ADR が要ると注記)。`tests/rule-fixtures/b-equivalent/` にメソッドごとの違反の fixture (他の #16 の綴りを含めない) と期待表。既存の `sdk-query-mutation-method.ts.fixture` の昇格値のリテラルを `'default'` に替える。`sdk-agent-session.ts` の `queryHandle` の型を `Pick<Query, 'interrupt'> & AsyncIterable<SDKMessage>` に絞る (ブラケット・参照の形を型で塞ぐ)

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-014〜FR-017) — `docs/ui-coverage.md` を data-model §5 のとおりに (D 節の説明と 3 行、経路の列を含む)。項目 21 で割当先が O-6 の行が 0。roadmap:
  - O-11 の行 (範囲・依存・domain・ADR の義務 (FR-015))、O-6 の行 (範囲・依存の列を O-4 / O-5 / O-7 に)
  - O-10 の行に拒否の後の「編集して再試行」(`refused_user_message_uuid`)
  - O-5 の行に「MCP resource の URI の要約の見出しに最後のパスの要素を出さない (O-6 design-gate R2 H-01 と同じ見直し)」
  - O-7 の行に「監視ビューの密度の見出し (O-2 pr-gate ux L-103)」
  - O-3 (O-8) の義務 (c) の注記 (本 feature の行は数え、`retraction` は数えない)
  - X-6 の行に「/clear の後の会話の id」(V-3 で確かめた結果。確かめていなければ「未確認」)
  - system scope の記録: `react/no-danger` の lint、項目 8 の `navigator.*`、AD-019 の Tier A と F 節の照合の検査、`cascade_enforce` が本文の最初の ID を拾う誤り (O-6 design-gate R1)
  - `_overview.md` (Feature 帰属の表に O-11・:65 / :94 / :96 の説明と判断根拠・:108 の M3 の列)、ui charter (Related Specs・Open Questions の持ち主を O-11 に)、session charter (U-6: agents の分岐・`meter` の `retraction`・稼働中のストアからの削除の規則)、`docs/prompts.md` (O-11)、O-4 data-model §2 の検証の表に `messageIds` の行、AD-047 の Consequences に AD-049 への参照、`tests/rule-fixtures/expected.mjs` の `ui-path-concat` の mitigatedBy に「O-2 / O-6 は本文のパスを表示のためだけに切る。名前空間を持つ値を作らず、IPC に戻さない」。`transcript.ts:207` の日本語の label: AD-045 が accepted なら例外の一覧に、そうでなければ roadmap の O-3 の義務に
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。V-1 / V-2。V-3 (実機) は利用者に残す
