# architecture-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:00:00Z
**Reviewer**: architecture-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Modes**: default + ADR-drift (`scope: adr-drift` を含む)
**Round**: 2

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-015 と SC-001〜SC-005 を実装している。R1 の後に手が入ったのは FR-010 (MD-01: `auth_status` / `plugin_install` の開いた行が無いときの扱い)、FR-011 / SC-005 (MD-10: P3 の集合を 19 から 21 に)、ui の注意の印 (MD-02)
- touched files に当たる charter / Confirmation: AD-048 の Confirmation (SC-002 / SC-005、O-10 の行)、AD-047 Decision 4 (制御要求を呼ばない)、AD-036 §4 P3、AD-031 Decision 1 (訂正節)、Constitution Principle VI (allowlists の正本)、`tests/rule-fixtures/expected.mjs` の `nextFeature` 必須規則、roadmap の system-scope 節 (:295-303)。AD-047 / `_overview.md` / 両 charter / glossary の sha は R1 と同じで、変わっていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

R1 の後に変わったファイルは roadmap、ui-coverage、allowlists.mjs、live-signals(.test)、sdk-agent-session.ts、RightPanel(.tabs.test)、InitReportTab.test、LivePane.o2.test、query-mutation-methods.test、meter-through.test、expected.mjs、data-model §4 である。

**MD-10 は直っている。**
- `getContextUsage` と `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` が `QueryMutationMethod` と `QUERY_MUTATION_METHODS` に移った (21 個)。場所: `src/agents/sdk-agent-session.ts:164-165`、`scripts/constitution/allowlists.mjs:454-455`
- pin テストも 21 個に直った (`tests/docs/query-mutation-methods.test.ts:42-44,64-66`)
- `close` は `promptQueue.close()` と綴りが衝突する、という理由がコード・注記・UNDETECTED_NOTES・roadmap に書いてある (`sdk-agent-session.ts:139`、`allowlists.mjs:429`、`expected.mjs:872-874`、`roadmap.md:299-300`)

**R1 と変わらず成り立っていること。**
- `Query` のメソッドの呼び出しは `interrupt` だけ (`sdk-agent-session.ts:543`)
- accepted の ADR (AD-047 / AD-048) の決定は書き換えられていない
- Constitution に `QUERY_MUTATION_METHODS` の個数を書いた箇所は無い
- 新しいレイヤ依存は既存と同じ形 (shell が session を読む) だけ

**R1 の指摘のうち 3 件は手が入っていない。** 新しい指摘が 1 件ある。MD-10 の修正が設計文書に反映されておらず、文書側に「19 / 9」が残っている。

## Findings

### [Medium] 「項目 16 の持ち主」「項目 14 の持ち主」がまだどの feature にもなっておらず、`nextFeature` 必須の規則が形だけのまま (M-002) (scope: feature) [unresolved, = MD-11]

- **観察**: `tests/rule-fixtures/expected.mjs:877` は今も `nextFeature: 'system scope (項目 16 の持ち主。O-5 SH-012 で roadmap の system scope に記録)'` で、feature ID を持たない。`docs/roadmap.md:301` (「項目 16 の持ち主に送る」) と `:303` (「項目 14 の持ち主に送る」) も、持ち主が誰かを書いていない。R1 との違いは 1 つだけ: `mitigatedBy` に「間接の呼び出しは code-gate の platform-boundary-reviewer が agents の差分で確認する」(`expected.mjs:876`) が足された。これは当面の見張りであり、塞ぐ feature の指名ではない。項目 16 の作り直しの義務は I-3 が、項目 14 の binding の追跡は X-6 が、すでに持っている (R1 で確認した `expected.mjs` の該当箇所)
- **同種事象探索**: `nextFeature: 'system|項目 16 の持ち主|項目 14 の持ち主` で 4 件。`tests/rule-fixtures/expected.mjs:877`、`docs/roadmap.md:301`、`docs/roadmap.md:303`、`docs/decisions/0048-session-config-display-and-answer-ui-split.md:35` (AD-048 の字面は roadmap 側で解決すれば足りる)。spec.md:64 / :214 と plan.md:175 も「項目 16 の持ち主」と書く
- **リスク/影響**: どの feature の design でも拾われない申し送りになる。P3 の正の形への置き換えも、項目 14 の死角も宛先が無い
- **推奨アクション** (最小案): `expected.mjs:877` の `nextFeature` を `'I-3'` にする。`roadmap.md:301` を「持ち主 = I-3」、`:303` を「持ち主 = X-6」に直し、roadmap の I-3 / X-6 の行にも 1 行ずつ足す。別の持ち主にするなら利用者に聞く
- **根拠**: `tests/rule-fixtures/expected.mjs` の `nextFeature` 必須規則 (SC-017)、Constitution の Existing violations summary、AD-036 §4 P3
- **scope 根拠**: touched files (`expected.mjs` / `docs/roadmap.md`) の中で直せる

### [Low] 「`QUERY_MUTATION_METHODS` に足すのは ADR 不要」という一般則を、ADR ではなくコードのコメントで決めたまま (L-001) (scope: feature) [unresolved, = LW-19]

- **観察**: `scripts/constitution/allowlists.mjs:426,432` と `tests/docs/query-mutation-methods.test.ts:15,39` が今も「ADR は要らない / ADR 不要」と書く。一方、`allowlists.mjs:4` と `scripts/constitution/check.mjs:6` は「追加には ADR を要する」と書く。同じファイルの冒頭と注記が食い違っている。R1 の後に足した `getContextUsage` / `usage_EXPERIMENTAL…` は AD-047 Decision 4 を根拠にしている (`allowlists.mjs:427-429`)。根拠を ADR に置く書き方はこれで実際に示されたが、一般則の文言は残った
- **同種事象探索**: `ADR は要らない|ADR 不要` で 4 件。`allowlists.mjs:426`、`allowlists.mjs:432`、`query-mutation-methods.test.ts:15`、`query-mutation-methods.test.ts:39`
- **リスク/影響**: Constitution Principle VI と食い違う規則がコメントにだけある。後続の feature が他の定数にも同じ扱いを広げうる
- **推奨アクション**: 4 か所を「AD-036 §4 P3 (`interrupt` だけ) を根拠に足す。外すには ADR が要る」のように根拠の ADR を名指す形に直す。一般則として残すなら、人間の承認を得て Constitution を改定する (MINOR)
- **根拠**: Constitution Principle VI、改定手順、AD-036 §4 P3
- **scope 根拠**: touched files の中で直せる

### [Low] AD-048 の本文に、採択の後に事実でなくなった記述が 2 つ残っている (L-002) (scope: feature) [unresolved, = LW-20]

- **観察**: `docs/decisions/0048-session-config-display-and-answer-ui-split.md:28` は「AD-047 は proposed のうちに Consequences に本 ADR への参照を足す」と書く。実際に参照が足されたのは AD-047 の訂正節である。`:34` は「O-10 の domain は利用者が決める (仮採用は session)」と書くが、2026-10-05 に session で承認済み (spec U-1)。AD-048 の末尾に訂正節は無い (`:55-58` で終わる)
- **同種事象探索**: `利用者が決める|proposed のうちに` を AD-048 で検索して 2 件 (`:28` / `:34`)
- **リスク/影響**: AD-048 だけを読む後続 (O-10 の design) が、domain をまだ決まっていないと読むか、AD-047 側の参照を見つけられない
- **推奨アクション**: AD-031 Decision 1 に従い、AD-048 の末尾に日付つきの「訂正」節を足して上の 2 点の事実だけを書く (決定は変えない)。spec FR-014 に「訂正節は足してよい」と 1 句足す
- **根拠**: AD-031 Decision 1、AD-048、spec U-1 / FR-014
- **scope 根拠**: AD-048 は本 feature で入る ADR

### [Low] MD-10 の修正 (19 から 21、呼ばない読み取りは 9 から 7) が設計文書に反映されず、spec / plan / research / quickstart / tasks がまだ「19 / 9」と書いている (L-003) (scope: feature) [new]

- **観察**: 実装は `QUERY_MUTATION_METHODS` が 21 個、`QueryUnusedReadMethod` が 7 個である (`sdk-agent-session.ts:144-173`、`allowlists.mjs:434-456`、`query-mutation-methods.test.ts:65`)。roadmap も直っている (`docs/roadmap.md:298-299`: 「6 → 21」「呼ばない読み取り 7 個」)。設計文書は古いまま:
  - `spec.md:214` FR-011 は足すメソッドを「AD-048 Decision 2 の 11 個と `reloadOutputStyles` / `backgroundTasks`」とし、AD-047 D4 の 2 個が入っていない
  - `plan.md:12` は「13 広げ」と書く
  - `research.md:61` は `getContextUsage` / `usage_EXPERIMENTAL…` を「読み取りか後始末」の 9 個に数え、`research.md:63` の Decision は「6 → 19」「19 個の union」「上の 9 個の union」と書く
  - 検証の手順である `quickstart.md:7` (「13 増えて 19」) と `quickstart.md:9` (「変更系 19・呼ばない読み取り 9」) も古い
  - `tasks.md:89` も「6 → 19」「9 個」と書く
  - `quickstart-results.md:29` (「6 → 19」) は R1 より前の実行記録である
- **同種事象探索**: `6 → 19|19 個|9 個|13 増えて 19|13 広げ` を spec_dir の設計文書で検索した。該当は `spec.md:214`、`plan.md:12`、`plan.md:160`、`research.md:61`、`research.md:63`、`quickstart.md:7`、`quickstart.md:9`、`tasks.md:89`、`quickstart-results.md:29`。`docs/` と Constitution では 0 件 (roadmap は 21 / 7 に直っている)
- **リスク/影響**: 締め付ける向きの修正なので実害は無い。ただし、quickstart V-1 をそのとおりに確かめる人は 19 / 9 を期待して食い違いを NG と読む。また research R-06 の分類の基準 (「accepted の ADR が呼ばないと決めたものは denylist」) が設計の正本に残らない
- **推奨アクション**: FR-011 に「AD-047 Decision 4 が呼ばないと決めた `getContextUsage` / `usage_EXPERIMENTAL…`」を足す。plan.md:12 / :160、research.md:61 / :63、quickstart.md:7 / :9、tasks.md:89 の数を 21 / 7 に直し、research R-06 には分類の基準と `close` を外した理由 (綴りの衝突) を 1 文足す。quickstart-results.md は実行記録なので、書き換えずに追記で注記する
- **根拠**: AD-047 Decision 4、AD-036 §4 P3、spec FR-011 / SC-005
- **scope 根拠**: すべて spec_dir の touched files で直せる

### H の所見 (指摘なし)

- **M-002 / L-001 / L-002 / L-003**: いずれも文書の指摘で、テストでは検出できない。`nextFeature` が feature ID の形かを確かめる検査は無い (`expected.mjs` の規則は必須かどうかしか見ない)
- **MD-10 の修正の回帰**: pin テスト (21 個、union と配列の集合一致、0 件抽出なら失敗) と `keyof Query` の型の網羅 (`sdk-agent-session.ts:175-176`) が固定している。src の `Query` のメソッド呼び出しは `interrupt` の 1 件だけ (`sdk-agent-session.ts:543`。他の `.interrupt(` は renderer の store のもの)。code-gate iter 2 の結果: lint / typecheck / depcruise / check:constitution の違反 0、テスト 2820 件 pass
- **観測点**: 新しい log は無い。decoder が捨てた `meter` を知る手段が無いことは R1 と同じ (LW-18 / AD-043 Decision 6)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-002 | `nextFeature: 'system\|項目 16 の持ち主\|項目 14 の持ち主` | 4 | tests/rule-fixtures/expected.mjs:877, docs/roadmap.md:301, docs/roadmap.md:303, docs/decisions/0048-session-config-display-and-answer-ui-split.md:35 |
| L-001 | `ADR は要らない\|ADR 不要` | 4 | scripts/constitution/allowlists.mjs:426, :432, tests/docs/query-mutation-methods.test.ts:15, :39 |
| L-002 | `利用者が決める\|proposed のうちに` (AD-048) | 2 | docs/decisions/0048-session-config-display-and-answer-ui-split.md:28, :34 |
| L-003 | `6 → 19\|19 個\|9 個\|13 増えて 19\|13 広げ` (spec_dir の設計文書) | 9 | spec.md:214, plan.md:12, plan.md:160, research.md:61, research.md:63, quickstart.md:7, quickstart.md:9, tasks.md:89, quickstart-results.md:29 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
- Round inheritance: R1 の 4 件のうち resolved 1 (M-001 = MD-10) / unresolved 3 (M-002 = MD-11、L-001 = LW-19、L-002 = LW-20) / new 1 (L-003)
