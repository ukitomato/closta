# Tasks: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[BE]` domain / agents / scripts、`[FE]` renderer、`[SH]` 横断。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いは spec の FR / SC、行・本文の伏せ字・取り消し・tool の見出しと中身・File tree の作り方・結果の状態・読み上げ・文言・対応表の書き換え先は data-model、方式の理由は research。

**着手の条件**: **O-7 (013)・O-4 (014)・O-5 (015) がマージされ、AD-046 / AD-047 / AD-048 / AD-049 が accepted になり、spec の U-1〜U-6 を利用者が承認するまで /cl-implement に入らない。**

**順序の制約**: SH-001 → コード。SH-002 / FE-001 → FE-020〜FE-023 (照合と provider の確認の結果で表示の作りを決める)。BE-001 → BE / FE の他。SH-010 は最後。

## Shared Tasks (先行)

- [ ] **SH-001** [SH] glossary — 会話の境界 (既存の「セッションの境界」との関係)、取り消し (retraction。Counterexample「O-4 の保留の取り消しとは別物」)、結果待ち / 結果不明、O-11、圧縮の境界 / コンパクション境界 / Compaction boundary の同義の整理、System event row の定義の拡張 (category の追加)、Hook の定義の Counterexamples (O-6 → O-11、`informational` の本文の例外)、読み上げの対象を「見ているセッション」に
- [ ] **SH-002** [SH] [P] element の照合 — registry の File tree / Tool call / Web search / Todo list / Compaction boundary を実名で照合。不採用の条件: 本番の CSP の下で動かない・外部への取得 (favicon など) がある・CSP を緩める必要がある。結果の正本は PR の説明
- [ ] **FE-001** [FE] [P] 確認 — `TextMessagePartProvider` の中で `MarkdownText` が描け、`safeUrlTransform` が効くこと (research R-06)。描けなければ U-4 を plain text に戻す (RK-06)
- [ ] **BE-001** [BE] domain (+ test) — `transcript-dto.ts` の category 4 つと status 6 つ、`system-event.ts` の `isTerminalSystemEventStatus`、`secret-redaction.ts` (新設。data-model §1 の伏せ字。各パターンの fixture と、括弧・引用符を含む普通の文が変わらない fixture)、O-4 の `meter.ts` の `retraction` と検証 (id の形・1〜128 件)。固定テスト: `MeterUpdate` の種類の集合、`PermissionRequest` のフィールドの集合、`toPermissionResult` の出力の形、`transcript-schema.test.ts` の category / status

## US-1 — 会話の区切りと止まった理由が分かる (P1)

- [ ] **BE-010** [BE] `sdk-agent-session.ts` / O-4 の `live-system-rows.ts` / `live-tool-results.ts` (+ test) — 4 つの category の行 (値の照合は `Object.hasOwn`、行の id の形の検査)、`supersedes` と `retracted_message_uuids` から `retraction` (128 件ごとに分ける)、`retract`。テスト: data-model §1 の読まないフィールドの目印が出力に 0 件、伏せ字の目印 (`Bearer`・URL の資格情報・`AKIA`・JWT・`token=`) が出力に 0 件、伏せ字の前の本文をログに書かない、`constructor` / `__proto__` / `"retry local"` の値、1 秒に 21 件の `meter` の後でも `retraction` が届く、`finish` の直前の `retraction` が捨てられない、取り消した後に結果が届いても同じ id の `message` も結果だけのメッセージも送らない、SDK の `uuid` と送る id が一致する、過去ログの変換に足していない (回帰)、domain の divider の生成が 1 か所
- [ ] **FE-010** [FE] `session-event-decoder.ts` と `running-session-store.ts` (+ test) — `retraction` の検証 (配列でない・0 件・129 件で捨てる、形の合わない id は 1 件ずつ)、同じセッションの `messages` から外す (冪等・知らない id・閉じたセッション)、外した id の後の `message` を足さない、隠れた古いメッセージの件数、表示位置を保つ。port → decoder → ストアを通すテスト
- [ ] **FE-011** [FE] `compaction-boundary.tsx` と `SystemEventRow` (4 つの category。本 feature の category は `detail` を折り返す) と `convert.ts` の divider の写し。テスト: US-1 の AC1〜AC6 (過去ログの divider は数を省く)、`SystemEventRow` の title (011 pr-gate a11y L-201)、「SDK が知らない状態」の文言と matcher (ux L-101 / L-104)、圧縮の行と境界の順

## US-2 — ファイル・検索・Web・計画の tool が何をしたかが分かる (P1)

- [ ] **FE-020** [FE] [P] `file-tool.aui.tsx` と `pathTail` の共通化 — `Read` / `Glob` / `Grep` (data-model §2)。テスト: パスを本文のまま出す (WSL・Windows 形式・UNC の 3 つの fixture で `argsText` と同じ値)、renderer に UNC の綴りが無い (項目 12)、File tree の作り方 (注記・0 件で text・200 件・1,024 コードポイント)、`__proto__/x`・`constructor/prototype/y`・`toString` の行で `({}).children === undefined`、`pattern` を正規表現にしない、中身は既定で畳む、エラー・空の結果
- [ ] **FE-021** [FE] [P] `web-tool.aui.tsx` — `WebFetch` / `WebSearch` (O-5 の URI の要約を共有)。テスト: クエリ・資格情報・フラグメントが見出しに 0 件、webhook の形の URL (`/services/T…/B…/<secret>`) で見出しに秘密の要素が出ない、scheme の無い `user:pass@host/p`・`javascript:`・`data:` で「URL」、見出しがリンクでない、中身の URL に伏せ字
- [ ] **FE-022** [FE] [P] `task-tool.aui.tsx` — `TaskCreate` / `TaskUpdate` (TodoList の 1 項目)・`TaskGet` / `TaskList` (text)。テスト: 状態の対応・知らない値・`subject` の無い `TaskUpdate`、TodoWrite と Task 系のエラー (`isError`) の印 (011 pr-gate po H-001)
- [ ] **FE-023** [FE] `tool-registry.aui.tsx` に 9 つ、`agent-plan.aui.tsx` を `TextMessagePartProvider` + `MarkdownText` と「原文」に。テスト: US-2 の AC1〜AC7 (過去ログと実行中の fixture)、入力が正しいとき 9 つが ToolFallback に落ちない、Agent plan に `ChatScreen.test.tsx` の XSS の fixture 一式とリモート画像・`data:image/svg+xml`・`<img onerror>`・`file:` / `vbscript:` (href は http(s) か相対だけ)、`<!-- hidden -->` が「原文」で見える、`@assistant-ui/react-markdown` の import が `markdown-text.tsx` だけ (固定テスト)

## US-3 — tool の結果を待っているか、来なかったかが分かる (P2)

- [ ] **FE-030** [FE] `tool-result-state.ts` (+ test。新設) と thread の context — data-model §3 の表。fixture: 並列の tool の結果が 1 つずつ・まとめて届く、中断の後、応答待ち (`done`) の間、承認待ち、前のターン、O-2 の 256 件の上限で結果が別のメッセージに入った tool
- [ ] **FE-031** [FE] data-model §3 に列挙したすべての表示に状態の印、ToolFallback の見出しの日本語化、密度の説明と成功の ✓ のコントラスト (011 pr-gate a11y L-001 / L-202)
- [ ] **FE-032** [FE] `TranscriptAnnouncer.tsx` (新設) — data-model §4。テスト: US-3 の AC1〜AC4、1 秒に 1 回以下 (偽の時計)、最初の描画・セッションの切り替え・過去ログ・「さらに表示」で読まない、セッションの終わりの一斉の結果不明を読まない、読み上げの文に `content` / 説明 / `prompt` / パスの目印が 0 件、知らない tool 名を「tool」と読む、vitest-axe の違反 0

## 境界の検査

- [ ] **BE-040** [BE] `scripts/constitution/allowlists.mjs` の `QUERY_MUTATION_METHODS` に `readFile` / `backgroundTasks` / `reloadOutputStyles` (FR-018)、`tests/rule-fixtures/sdk-query-task-control.ts.fixture` と期待表。項目 16 が発火すること

## Polish / 記録

- [ ] **SH-010** [SH] 対応表と記録 (FR-014〜FR-017) — `docs/ui-coverage.md` を data-model §5 のとおりに (D 節の 3 行を含む)。項目 21 で割当先が O-6 の行が 0。roadmap に O-11 の行 (範囲・依存・domain・ADR の義務 (FR-015)) と O-6 の行 (範囲・依存の列を O-4 / O-5 / O-7 に)、O-3 (O-8) の義務 (c) の注記 (本 feature の行は数え、`retraction` は数えない)、X-6 の行に「/clear の後の会話の id」(V-3 の記録)。`_overview.md` (Feature 帰属の表に O-11・:94 / :96 の判断根拠・:108 の M3 の列)、ui charter (Related Specs・Open Questions の持ち主を O-11 に)、session charter (U-6: agents の分岐・`meter` の `retraction`・稼働中のストアからの削除の規則)、`docs/prompts.md` (O-11)、O-4 data-model §2 の検証の表に `messageIds` の行、AD-047 の Consequences に AD-049 への参照。`transcript.ts:207` の日本語の label: AD-045 が accepted なら例外の一覧に、そうでなければ roadmap の O-3 の義務に
- [ ] **SH-011** [SH] 検証 — `docs/discovery.md` の agent 用の列で typecheck / lint / test / E2E。V-1 / V-2。V-3 (実機) は利用者に残す
