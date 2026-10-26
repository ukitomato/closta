---
scope: default + adr-drift
---

# architecture-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26T00:00:00Z
**Reviewer**: architecture-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: 1 (pr-gate、mode: default + ADR-drift、base main / head 4a16540)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 と SC-001〜SC-009 は全部この PR の対象。本 reviewer に主に関係するもの:
  - FR-002 / FR-012 (`toNoticeRow` を実行中と過去ログで共有)
  - FR-011 (印を出す経路の範囲)
  - FR-013 / FR-014 (B 節の照合)
  - FR-016 / FR-017 (charter・`_overview`・glossary・roadmap に記録する)
  - SC-004 / SC-006 / SC-007
- touched files に該当する charter / Confirmation:
  - ui charter: Mission、業務ルール (XII / XIII)、KPI「表示網羅」
  - session charter: 「`system` の分岐」の項と Related Specs
  - `_overview.md`: domain 配置の例外の項と Cross-domain invariants の表 (行 181-182)
  - AD-060 Confirmation の 2 項 (項目 21 の B 節の照合と fixture・経路ごとの表)
  - 関連する accepted ADR: AD-044 Decision 4 (AD-060 が読み替える)、AD-049 Decision 3 / 6、AD-034、AD-045、AD-041 (g) / AD-059 (`QUERY_OPTION_KEYS`)、AD-053 Decision 6、AD-056 Decision 1
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:3
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (lint-agent の違反は 0)
- G. optional reviewer 範囲: 該当なし: ui-coverage / a11y / ux の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-12 は Tier B の知らせ 7 種 (`notification` ほか) と `files_persisted` をシステムイベントの行にする。O-6 / O-10 の行の組み立ては domain の `notice-rows.ts` の `toNoticeRow` に移し、実行中と過去ログで共有する。ほかに次を足す:
- `server_tool_use` と結果のブロックの part `server-tool-call` と Sources
- `user/document` の File 表示
- 知らないブロックの印 `unsupported-block`
- 対応表 B 節 (33 行) の機械照合 (AD-060)

レイヤを見た結果は次のとおり:
- 依存の向きは agents → domain と renderer → domain だけ。domain の新しい 2 ファイルは domain の中しか import しない。
- 動かしていないもの: `QUERY_OPTION_KEYS`、`SessionEvent` の種類、`METER_UPDATE_TYPES`、IPC / preload / main。
- 既存の accepted ADR は in-place で書き換えていない。diff で触れた ADR は新設の 0060 だけ。

指摘の中心は次の 3 点:
1. session の契約を広げた決定 (category 13 → 20、part 2 つ、`file` の形) の根拠として AD-060 を挙げているが、AD-060 の Decision にはその決定が書かれていない。
2. `@anthropic-ai/sdk` の版を合わせる規則が、domain をまたぐ不変条件の表に入っていない。
3. Constitution の改定の持ち越しに、持ち主の feature がない。

## Findings

### [High] category の集合を変えるには ADR が要るが、根拠に挙げた AD-060 にその決定が無い (H-001) (scope: feature)

- **観察**:
  - `src/domain/session/system-event.test.ts:376` の固定テストは「集合を変えるには ADR が要る: AD-053 / AD-056 / AD-060」と書いている。
  - `docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md:30-35` の Decision 1〜4 にあるのは、B 節の照合・`@anthropic-ai/sdk` の版・`unsupported-block`・`表示不要` の扱いだけである。
  - Decision に無いもの:
    - 知らせの category 7 つ (`notification` / `local-command-output` / `tool-use-summary` / `active-goal` / `mirror-error` / `memory-recall` / `files-persisted`)
    - part `server-tool-call`
    - `file` の part の形の変更 (`text` を消して `mediaType`)
    - agents の `system` の subtype 5 つと最上位の `tool_use_summary` / `active_goal` の分岐
  - 前例はどれも ADR の Decision に書いている。O-10 の `elicitation` の category は AD-053 Decision 6 (`docs/decisions/0053-elicitation-callback-and-user-dialog.md:43`)、O-11 の `backgrounded-task` は AD-056 にある。
  - AD-060 の決定ではないのに AD-060 を根拠に挙げている箇所:
    - `src/domain/session/transcript-dto.ts:98`
    - `src/domain/session/notice-rows.ts:8`
    - `src/agents/sdk-agent-session.ts:968`
    - `docs/domains/_overview.md` の O-12 の例外の項
    - session charter の Related Specs の O-12
- **同種事象探索**: Grep `AD-060` in `src` で 4 件 (`src/agents/sdk-agent-session.ts:968`、`src/domain/session/notice-rows.ts:8`、`src/domain/session/system-event.test.ts:376`、`src/domain/session/transcript-dto.ts:98`)。Grep `ADR が要る` in `src` で 20 件。プロジェクト全体の規約である (例: `src/domain/session/meter.test.ts:165`、`src/agents/session-core.test.ts:209`)。
- **リスク/影響**: 「集合を変えるには ADR が要る」という不変条件を、中身の無い引用で満たした形になっている。後から category を広げた理由を追う人が AD-060 を開いても、知らせの行を足した決定も、選ばなかった案 (U-2 の右のペイン・`meter`) も見つからない。session の契約を広げた根拠が spec の U-1〜U-6 にしか無い。
- **推奨アクション**: AD-060 は accepted なので決定を書き足さない。小さな後続の ADR (例: AD-061) を起こし、次を Decision として書く:
  - category 7 つ
  - `server-tool-call` の part と実行中の対応づけ (記憶の上限 256)
  - `file` の形の変更
  - agents の分岐の追加 (U-2 / U-4 / U-5 / U-6 / U-13)
  - Confirmation は既存の固定テスト

  そのうえで上の 4 箇所と `_overview.md`・session charter の引用を新しい ADR に付け替え、ui / session charter の `related_adrs` に足す。夜間の規則では推奨案で accepted にしてよい。
- **根拠**: 固定テストの規約「集合を変えるには ADR が要る」(`system-event.test.ts:376` ほか 20 件)。前例 AD-053 Decision 6 / AD-056。Constitution Principle XIV (根拠をたどれること)。
- **scope 根拠**: touched files (`system-event.test.ts`・`transcript-dto.ts`・`notice-rows.ts`・`sdk-agent-session.ts`・`_overview.md`・session charter) の中で直せる。

### [Medium] `@anthropic-ai/sdk` の版の照合が、domain をまたぐ不変条件の表に無い。どの PR の lockfile の変更でも項目 21 が落ちうる (M-001) (scope: feature)

- **観察**:
  - `docs/domains/_overview.md:182` の不変条件は「SDK (`@anthropic-ai/claude-agent-sdk`) の版を上げる PR は、同じ PR で `docs/ui-coverage.md` を直す」だけである。
  - 一方 AD-060 Decision 2 は `@anthropic-ai/sdk` の版も照合する。`scripts/constitution/check.mjs:1348-1350` が読み、`scripts/ui-coverage/coverage.mjs` の `checkCoverage` が対応表の版と合わなければ違反にする。
  - `@anthropic-ai/sdk` は直接の依存ではない。`package.json:30` は Agent SDK だけを持ち、`node_modules/@anthropic-ai/claude-agent-sdk/package.json:55` は peer を `">=0.93.0"` と広い範囲で持つ。peer は pnpm が自動で入れ、`pnpm-workspace.yaml:10` は `nodeLinker: hoisted`。
  - AD-060 Decision 2 の手順は「Agent SDK を上げる PR は、peer の版が変わったら」に限られる。Agent SDK を上げずに lockfile だけで peer の版が動く経路が書かれていない。
- **リスク/影響**: 別の domain の PR (依存を足す・lockfile を作り直す) で `@anthropic-ai/sdk` の版が動くと、その PR の CI が項目 21 で落ちる。直す責任 (`docs/ui-coverage.md` の B 節) が、どの domain の PR にも生じうる。黙って通る経路ではない (落ちるので気づける) ため Medium。
- **推奨アクション**: `_overview.md:182` の行を「Agent SDK とその peer の `@anthropic-ai/sdk` の版が変わる PR (lockfile だけの変更を含む) は、同じ PR で対応表を直す」に広げる。`docs/ui-coverage.md` の凡例「SDK を上げたときの手順」にも、lockfile だけで peer が動く場合を書く。版を固定するかは AD-060 Decision 2 (「依存に直接足さない」) を変えずに決められる。
- **根拠**: AD-060 Decision 2 / Consequences。`_overview.md` の Cross-domain invariants (XII)。
- **scope 根拠**: `_overview.md` と `docs/ui-coverage.md` は touched files。

### [Medium] Constitution XII の改定 (v1.5.0) を持ち越した先に、持ち主の feature が無い (M-002) (scope: system)

- **観察**: Grep `v1\.5\.0` in `docs` で 3 件。
  - `docs/roadmap.md:387` (O-12 の行の結論)
  - `docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md:28`、`:48`

  持ち越しの記録は O-12 自身の行だけである。O-12 は完了の PR の後に `completed` になる。roadmap の system-scope の項目 (`docs/roadmap.md:143-302`) にも登録が無い。
- **リスク/影響**: 項目 21 は Constitution の字面 (A・C・E 節) より広く照合したままになる。字面を直す改定 (改定手順 2 の人間レビュー) を誰が持つかが決まっていない。宛先の無い宿題が残る。
- **推奨アクション**: roadmap の system-scope (「E2E / 検証基盤 feature」の節など) に「Principle XII の Verification を A・B・C・E 節に改める (v1.5.0。AD-060。持ち主 = 利用者のレビューを伴う単独の PR)」を 1 行足す。AD-060 Consequences の「持ち越しは roadmap の O-12 の行」は事実誤認の訂正ではなく置き場の変更になるので、ADR は直さず roadmap 側だけで足りる。
- **根拠**: Constitution「改定手順」2。spec U-12。
- **scope 根拠**: roadmap の system-scope の運用の問題で、本 feature の範囲の外でも扱える。

### [Low] ui の feature が session の契約を広げる例外が、前例と違い利用者の承認なしで記録されている (L-001) (scope: feature)

- **観察**:
  - `docs/domains/_overview.md` の O-12 の項 (diff の `:110`) は「夜間の規則で推奨案を採用した」と書く。
  - 前例 (O-4 / O-5 / O-6 / O-11。`_overview.md:109`、`:112`、`:123-125`) はどれも「利用者が承認」。
  - AGENTS.md は domain の分割を人間の承認が必須の事項としている。
  - domain の割当 (`ui`) は変わっていない。2026-10-21 の夜間の規則は推奨案での採用を認めている。
- **推奨アクション**: マージ後の棚卸しで利用者の確認を取り、「2026-xx に利用者が確認」と追記する。それまでは今の記録のままでよい。
- **根拠**: AGENTS.md「AskUserQuestion gated 確定」。`_overview.md` の前例。

### [Low] AD-060 Decision 1 の「import から型のファイルを決める」が、固定のパスと specifier の照合で実装されている (L-002) (scope: feature)

- **観察**:
  - `scripts/constitution/check.mjs:1348-1350` は `.d.mts` のパスを固定で持つ。
  - `scripts/ui-coverage/coverage.mjs` の `CONTENT_SIDES` は、許される specifier の一覧と照合するだけである。import の specifier からファイルを解決はしていない。
  - specifier が変われば違反にするので、結果は AD-060 と同じになる (`tests/ui-coverage/coverage.test.ts:615`)。
- **推奨アクション**: AD-060 の後続の ADR を起こすとき (H-001) に、Decision 1 の書き方を実装に合わせる。または coverage.mjs のコメントに「specifier の一覧とパスの対応表で解決する」と書く。
- **根拠**: AD-060 Decision 1。

### [Low] glossary の英語と日本語の見出しがずれている。新しい概念 Sources / サーバー側の tool が未登録 (L-003) (scope: feature)

- **観察**:
  - `docs/glossary.md:720` 付近の見出しは「Notice row（知らせの類）」。row は行で、類は種類の総称なので、指すものが違う。
  - spec の Key Entities (`spec.md:221`) は「知らせの行」で、`notice-rows.ts` / `toNoticeRow` も「行」の意味で使っている。
  - spec の Key Entities にある「Sources」と、クライアントの `WebSearch` と区別すべき「サーバー側の tool」(`server-tool-call`) は glossary に無い。plan の実装方針には「クライアントの `WebSearch` と混ぜない」とある。
  - frontmatter の `total_terms: 104` は、見出しの数 (Grep `^#### \*\*` で 122) と合わない。以前からずれている。
- **推奨アクション**: 見出しを「Notice row（知らせの行）」にし、Definition に「総称を知らせの類と呼ぶ」と書く。「Server tool call（サーバー側の tool）」と「Sources」の 2 項を足す (反例: クライアントの `WebSearch` / `WebTool`)。`total_terms` を数え直す。
- **根拠**: Constitution Principle XIV。

### [Low] AD-060 の `deciders: ukitomato` が、夜間の規則で accepted にした事実と合っていない (L-004) (scope: feature)

- **観察**: `docs/decisions/0060-content-block-verification-and-unsupported-block-mark.md:5` は `deciders: ukitomato`、本文 `:13` は「夜間の規則で推奨案を採用し … accepted とした」。利用者自身は判断していない。
- **推奨アクション**: マージの前なら、frontmatter に注記 (例: `deciders: ukitomato (夜間の規則。未確認)`) を足すのが最小。マージ後は訂正の節 (AD-031) で事実を書く。
- **根拠**: AD-031 (事実の訂正の扱い)。

### [Low] SC-004 の B 節の表が単体テストに固定で書かれ、SDK から読んだ集合と結ばれていない (L-005) (scope: feature)

- **観察**: `src/domain/session/content-blocks.server.test.ts:15-51` は B 節の 33 種を固定の配列で持つ。項目 21 が SDK から読む集合 (`parseContentBlockTypes`) とは結ばれていない。SDK を上げてブロックが増えると、項目 21 は落ちる (検出できる) が、SC-004 の「どのブロックも専用の表示か印になる」のテストには新しい種類が入らない。
- **推奨アクション**: テストの中で `parseContentBlockTypes` に `node_modules` の 3 ファイルを渡して集合を得て、固定の配列と一致することを 1 件で確かめる。こうすれば SDK を上げたとき、このテストも同じ PR で直すことになる。
- **根拠**: AD-060 Confirmation の 2 項目め。H の観点 (指摘を検出できるテストがあるか)。

## H (テスト / regression) の所見

- 既存の振る舞いが壊れていない根拠は 3 つ:
  - `src/agents/live-signals.o6.test.ts` は追記だけで、O-6 / O-10 の既存の期待を変えていない (plan RK-02 の確認)。
  - 固定テスト (`QUERY_OPTION_KEYS`) の diff は 0。
  - test-agent は全件の 3953 件が通過、lint-agent の違反は 0 (`.gate-verdict-code.json`)。
- 印を出す経路と出さない経路のテスト:
  - 主ループの assistant / user (`content-blocks.server.test.ts:78-123`)
  - subagent の user (`transcript.server-blocks.test.ts:115`)
  - 実行中の user (`sdk-agent-session.test.ts:857`)
- AD-060 Confirmation の fixture (足りない・余る・版・入力が無い・型が読めない・参照が変わった) は `tests/ui-coverage/coverage.test.ts:548-632` にそろっている。
- 観測点: 知らせの行は `message` なので `receivedMessages` に数える (roadmap の O-8 の (c) に追記済み)。障害の観測点は新しく足していない。
- H-001 は文書と ADR の不整合なので、テストでは検出できない (固定テストの文字列が ADR を名指すだけ)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `AD-060` in `src` | 4 | src/agents/sdk-agent-session.ts:968, src/domain/session/notice-rows.ts:8, src/domain/session/system-event.test.ts:376, src/domain/session/transcript-dto.ts:98 |
| H-001 | `ADR が要る` in `src` | 20 | src/domain/session/system-event.test.ts:376, src/domain/session/meter.test.ts:165, src/agents/session-core.test.ts:209 ほか (同じ規約がプロジェクト全体にある) |
| M-001 | `@anthropic-ai\|nodeLinker` in package.json / pnpm-workspace.yaml | 2 | package.json:30, pnpm-workspace.yaml:10 |
| M-002 | `v1\.5\.0` in `docs` | 3 | docs/roadmap.md:387, docs/decisions/0060-…md:28, :48 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 5
