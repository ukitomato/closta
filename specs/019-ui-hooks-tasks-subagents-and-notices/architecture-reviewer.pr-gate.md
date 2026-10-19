# architecture-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Mode**: pr-gate round 1 (通常モード + ADR-drift モード ARCH-3)

## 初回読了 viewpoint

- FR/SC: この PR が実装するか影響するもの
  - FR-001 / FR-007 (`QUERY_OPTION_KEYS` に 2 キー追加)
  - FR-002 / FR-003 (一般の Hook)
  - FR-004 / FR-005 / FR-006 (後から背景に移った task・`background-tasks` meter・タブ)
  - FR-008〜FR-011 (実行中と過去ログの入れ子)
  - FR-012 (対応表) / FR-013 (項目 14 / pin テスト) / FR-014 (roadmap) / FR-015 (charter) / FR-016 (glossary・_overview・prompts)
  - SC-001〜SC-005
- touched files に該当する charter / Confirmation
  - ui charter: 業務ルール (Principle XII で completed にしない) と KPI「表示網羅」
  - session charter: O-11 の項と Open Questions の Hook / Background task
  - `_overview.md`: Cross-domain invariants の XII 行
  - AD-054 / AD-055 / AD-056 の Confirmation
  - 読み替え元の AD-035 D3/D5、AD-041 (g)、AD-044 D6、AD-047 D2、AD-049 D1/D6、AD-036 §4 P1/P3
  - in-place 訂正の規則 AD-031
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:4 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:4 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲 (lint は code-gate で検査済み)
- G. optional reviewer 範囲: 該当なし: ui-coverage / a11y / ux / database の各 reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

この PR は O-11 の完了の PR として出されている。中身は 3 つの ADR の新設、session と ui の charter・glossary・roadmap・対応表の更新、agents の入れ子と前景の task の記憶、domain の切り出し (`command-name.ts` / `path-tail.ts` / `foreground-tasks.ts`)、renderer のタブと入れ子の描画である。

ADR-drift の観点では、既存の accepted ADR (AD-035 / AD-036 / AD-041 / AD-044 / AD-047 / AD-049) の本文を書き換えた差分は 0 件で、決定の変更はすべて新しい ADR の「読み替える箇所」に置かれている。`Query` の呼び出しは `interrupt` のまま、IPC・preload・main の差分も 0 で、AD-036 §4 P3 は守られている。

ただし対応表の D 節の Tier A 3 行は `後続: O-11` のまま残っており、spec 自身が「完了の PR を出さない」と定めた状態にある。

## Findings

### [High] D 節の Tier A 3 行が `後続: O-11` のまま。O-11 を完了にすると Principle XII と項目 21 に反する (H-001) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:181-183` の general-hooks / late-backgrounded-task / subagent-nesting-live は `後続: O-11` のまま。
  - `specs/019-.../quickstart-results.md:21` には「割当先が O-11 の行が 0 にならない」「M3 の完了の条件の残り 3」とあり、V-1〜V-7 は未実施 (同 :25)。
  - spec FR-012 / SC-005 は「記録が無い行は `後続: O-11` のまま完了の PR を出さずに利用者に返す」と定めている。
- **同種事象探索**: `後続: O-11` を `docs/ui-coverage.md` で検索して 3 件 (:181 / :182 / :183)。他の節に残りは無い。
- **リスク/影響**:
  - Principle XII (AD-044 D1) は、`後続` の ID を「完了していない feature」に限っている。
  - このまま `/cl-done` で reviewing → completed に進めると、O-11 が完了した feature になり、項目 21 が 3 行を違反として落とす。
  - ui charter の業務ルール「未割当がある間 completed にしない」と KPI「表示網羅」(M3 の完了の条件の残り 0) も満たされない。
  - pr-gate の Critical が 0 でも、この状態で PR を出すことは spec の FR-012 に反する。
- **推奨アクション**:
  - `/cl-done` に進まず利用者に返す。利用者が実機で V-1 / V-3 / V-4 を記録し、「届いた」の行だけ `実装済み` に書き換えてから進める。
  - 「届かない」行がある場合は、その行の割当を見直す判断 (後続の ID か `表示不要`) を利用者に諮る。
  - agent はこの High を直せない (人間の実機作業が必要)。
- **根拠**: Constitution Principle XII / AD-044 Decision 1・3 / ui charter「業務ルール」「KPI」/ spec FR-012・SC-005
- **scope 根拠**: この feature の完了条件そのもの

### [Medium] session charter の Open Questions が「実行中の task の一覧は持たない」のままで、AD-056 と食い違う (M-001) (scope: feature)

- **観察**:
  - `docs/domains/session/charter.md:359-362` は、session が持つ状態を「無害化して通すことだけ」「実行中の task の一覧は持たない」「一時的に持つのは tool の結果の対応だけ (上限 256)」と書いている。
  - AD-056 の「読み替える箇所」と Decision 2 では、一覧の保持は session の契約 (`meter` の種類 `background-tasks`・`meters`) に置かれている。agents は前景の task の記憶 (256 件) を持つ (`src/domain/session/foreground-tasks.ts:18`、`src/agents/sdk-agent-session.ts:389`)。
  - 同じ charter の :311 の O-11 の項は更新されているが、Open Questions の答えは更新されていない。
- **同種事象探索**: `実行中の task の一覧` / `状態は保持` を docs/domains で検索して 3 件。ui charter :278-281 は追記済み。`_overview.md:227-232` も追記済み。session charter :360 だけが未更新。
- **リスク/影響**: charter (SSoT) の中で、session の責務について 2 つの記述が矛盾する。後の feature が「session は状態を持たない」を根拠に設計を誤りうる。
- **推奨アクション**: :358-362 の後ろに「O-11 の結論 (USER 決定 2026-10-17)」を足す。内容は AD-056 Decision 2 の保持の置き場と、セッションスレッドの前景の task の記憶 (上限 256・永続化しない) で、ui charter :280 と同じ形にする。
- **根拠**: AD-056「読み替える箇所」の 2〜3 行目 / spec FR-015
- **scope 根拠**: touched file (session charter) の中

### [Medium] glossary で Background task の Ref が新しい項に付け替わっている。日本語表記も UI の文言と違う (M-002) (scope: feature)

- **観察**:
  - Ref の付け替え: `docs/glossary.md:91-101` の Background task から `- **Ref**: [011 spec] FR-008 / FR-009` が消えている。その行は `:123` の Late-backgrounded task の 2 本目の Ref として残っている (diff :358-359。新しい 2 項を元の Counterexamples と Ref の間に挟んだため)。
  - 日本語表記: `:95` の Background task の日本語表記は「バックグラウンドタスク」。この PR が足した UI 文言はすべて「背景の task」(`src/renderer/src/features/shell/labels.ts:50,259-263`) で、新しい項 (:108 / :119) も同じ。renderer に「バックグラウンド」は 0 件。
- **同種事象探索**:
  - Ref が 2 本ある項は `:122-123` の 1 件。
  - `バックグラウンド` を `src/renderer/src` (テストを除く) で検索して 0 件。
- **リスク/影響**: Principle XIV の同義異語にあたる (同じ概念を glossary と UI で別の語にしている)。011 spec への参照が別の概念に付いている。
- **推奨アクション**:
  - `:123` の Ref を Background task の項の末尾 (:101 の後) に戻す。
  - Background task の日本語表記を「背景の task」に揃えるか、両方を併記して canonical をどちらかに決める。
- **根拠**: Constitution Principle XIV / spec FR-016
- **scope 根拠**: touched file (glossary)

### [Medium] AD-056 Decision 1 の「どれも Tier B の行なので」は事実と違う (M-003) (scope: feature)

- **観察**:
  - `docs/decisions/0056-...md:35` は、O-12 に送る項目に「O-6 の行 (`informational`・拒否・会話の作り直し) と O-10 の行 (`elicitation_complete`) の過去ログの変換」を含めた上で、「どれも Tier B の行なので、M3 の完了の条件に数えない」と書いている。
  - `docs/ui-coverage.md:56 / :79 / :83 / :84` では、`model_refusal_*`・`elicitation_complete`・`informational`・`conversation_reset` はすべて Tier A (割当は `実装済み (実行中)`) である。
  - roadmap の O-12 の行は「Tier B と、実行中の経路で `実装済み` の行の過去ログの経路だけなので」と正しく書いている (diff :487)。
- **同種事象探索**: `どれも Tier B` を docs で検索して 1 件 (AD-056:35)。spec :59 と roadmap :495 は正しい書き方をしている。
- **リスク/影響**: M3 の完了の条件から外す根拠を、ADR が誤った事実の上に置いている。結論 (`後続` の行ではないので数えない) は正しいが、後で読む人が Tier A の過去ログの経路を Tier B と取り違える。
- **推奨アクション**: マージ前なので Decision 1 の字面を roadmap と同じ「Tier B の行と、実行中の経路で `実装済み` の Tier A の行の過去ログの経路だけなので」に直す。マージ後なら AD-031 の訂正節で直す。
- **根拠**: AD-044 Decision 3 / AD-031
- **scope 根拠**: この PR が新設した ADR

### [Medium] AD-054 の Confirmation が項目 16 の仕組みを誤って書いている (M-004) (scope: feature)

- **観察**:
  - `docs/decisions/0054-...md:52` は「項目 16 の options の検査が 2 キーを許し、他の allowlist 外キーでは今どおり発火する」と書いている。
  - 実際の項目 16 は denylist (`scripts/constitution/allowlists.mjs:418-425` の `QUERY_ESCALATION_OPTION_KEYS` の 6 キー。`check.mjs:835`) で、allowlist の外のキーでは発火しない。
  - scripts に `includeHookEvents` / `forwardSubagentText` の出現は 0 件。allowlist の役は `session-core.test.ts` の pin テストが担っている。
- **同種事象探索**: `includeHookEvents|forwardSubagentText|onElicitation` を scripts で検索して 0 件。
- **リスク/影響**: Confirmation の 2 項目めが検証できない形で書かれている。読み手は、キーの追加漏れを項目 16 が捕まえると誤解する。
- **推奨アクション**: 2 項目めを「項目 16 の昇格キーの denylist (`QUERY_ESCALATION_OPTION_KEYS`) は変えず、2 キーはそこに含まれない。キー集合の固定は pin テストが担う」に直す (マージ前の直接修正)。
- **根拠**: AD-054 Confirmation / AD-036 §4 P1
- **scope 根拠**: この PR が新設した ADR

### [Medium] ADR の決定の中身が、利用者の承認 (2026-10-17) の後 (2026-10-18) に足されている (M-005) (scope: feature)

- **観察**:
  - spec :18 は「2026-10-17 に利用者が U-1〜U-11 と AD-054〜056 を承認した」、spec :20 は「2026-10-18 に main に rebase し…O-10 の `elicitation_complete` の過去ログの変換の送り先」を直したと書いている。
  - AD-056 :13 には「承認の記録の前に…Decision 1 に O-10 の `elicitation_complete` の行の過去ログの変換を…足した」とある。
  - `plan.md:267` は「決定の中身は承認されたものと同じ」と書いているが、O-10 が O-11 に預けた義務を O-12 に送るのは新しい範囲の判断である。
- **同種事象探索**: `承認の記録の前に` / `accepted の前に` を検索して 2 件 (AD-056:13 / plan.md:267)。AD-054 の和集合の直し (11 キー) は AD-054 Decision 4 の機械的な適用なので対象外。
- **リスク/影響**: accepted の ADR の Decision に、利用者が見ていない範囲の判断が入ったまま「2026-10-17 に承認」と記録される。範囲の分割は AGENTS.md の domain 分解ほど厳しい gated 事項ではないが、承認の記録の正しさに関わる。
- **推奨アクション**: `/cl-done` の前に、AD-056 Decision 1 の `elicitation_complete` の追加 (O-12 への送り) について利用者の確認を取り、確認の日付を AD-056 の前置きに残す。
- **根拠**: AD-031 (accepted 後の決定の変更は後続 ADR) / AGENTS.md「gate の原則」
- **scope 根拠**: この PR が新設した ADR

### [Medium] U-10 の「以後の子を足さない」(欠落) が ADR に記録されず、AD-035 の「欠落は起こさない」と並ぶ (M-006) (scope: feature)

- **観察**:
  - `src/agents/live-tool-results.ts:373-374 / :386-389` は、上限 (子 500 件・根 1 MB) に当たった後の子と、その tool の結果を `kind: 'none'` で捨てる。
  - AD-035 Decision 3 / 5 は入れ子について「欠落は起こさない」「欠落なし」と定め、深さの超過も孤児も平坦化で残している。
  - U-10 は spec と data-model §3.1 にしか無く、AD-054 / AD-055 の「読み替える箇所」には AD-035 Decision 5 の欠落の規則の読み替えが無い。
- **同種事象探索**: 「欠落」を AD-054/055/056 で検索して 0 件。spec の U-10 と data-model §3.1 にだけある。
- **リスク/影響**: 実行中の表示で subagent の後半が見えなくなる。切り詰めの印は出るが、accepted の ADR の不変条件と食い違ったまま、根拠が spec の判断だけになる。後の feature が AD-035 を正として「欠落なし」を前提にしうる。
- **推奨アクション**: AD-055 (または AD-054) の「読み替える箇所」に「AD-035 Decision 5 の欠落なし → 実行中の入れ子は上限の後の子を足さず、切り詰めの印を出す (U-10)」を 1 行足す (マージ前の直接修正)。
- **根拠**: AD-035 Decision 3 / 5、AD-031
- **scope 根拠**: この PR が新設した ADR と agents のコード

### [Medium] FR-015 の charter への記録が欠けている (M-007) (scope: feature)

- **観察**:
  - `docs/domains/session/charter.md:7-22` の `related_adrs` に AD-054 / AD-055 / AD-056 が無い (diff は related_specs だけを足した)。
  - `docs/domains/ui/charter.md:220-269` の Related Specs には O-4 / O-5 / O-6 / O-9 の項があるが、O-11 の項が無い (「残り」の行に名前があるだけ)。session の契約を広げたことと 3 つの ADR は、ui charter の本文では Open Questions :280 の AD-056 にしか書かれていない。
- **同種事象探索**: `0054|0055|0056` を docs/domains で検索して、ui charter の frontmatter に 3 件、session charter の本文 :268-270 に 3 件。session charter の frontmatter には 0 件。
- **リスク/影響**: charter の frontmatter で ADR を引く reviewer や skill (Tier-0 の読了) が、session の境界を広げた ADR を見落とす。
- **推奨アクション**:
  - session charter の `related_adrs` に 3 件を足す。
  - ui charter の Related Specs に O-11 の項を足す。O-6 の項と同じ形で、範囲・session の契約の拡張 (`meter` の `background-tasks`・入れ子・options・許可リスト)・AD-054〜056 を書く。
- **根拠**: spec FR-015 / AD-056 Decision 2「session charter に記録する」
- **scope 根拠**: touched file

### [Low] 深さの上限を超えたときの扱いが、実行中 (平坦化) と過去ログ (捨てる) で違う (L-001) (scope: feature)

- **観察**:
  - 実行中は深さの超過を `orphan` として主ループに平らに出す (`src/agents/live-tool-results.ts` の `nest` の `position.path.length > MAX_SUBAGENT_DEPTH`)。
  - 過去ログは列を捨てる (`src/domain/session/transcript.ts:392`。テストは `transcript.test.ts:634`)。
  - data-model :151 と :185 はこの違いをそのまま書いている。
- **リスク/影響**: FR-011 (実行中と過去ログで同じ入れ子の形)、および AD-055 Decision 3 が継ぐ AD-035 Decision 5 (深さの超過は平坦化) と字面がずれる。病的な深さの入力に限られる。
- **推奨アクション**: どちらかに揃えるか、AD-055 Decision 3 に「過去ログの列は深さの超過で読まない」と明記する。

### [Low] glossary の frontmatter の数と並び順 (L-002) (scope: feature)

- **観察**:
  - `docs/glossary.md:5` の `total_terms: 104` に対し、実数は 115 (`#### **` の数)。この PR で 4 語増えた (前からのずれも含む)。`generated_by` に O-11 の追記が無い。
  - Late-backgrounded task (:114) が「### B」節に置かれている。
- **推奨アクション**: 数を直し、L 節に移す。

### [Low] roadmap の O-11 の行の題が `_overview.md` / glossary と違う (L-003) (scope: feature)

- **観察**:
  - `docs/roadmap.md:384` の題は「Hook・背景の task・実行中の subagent と知らせの類の表示」のまま。
  - `_overview.md` (diff :221) と glossary の O-11 の項は、「と知らせの類」を外した題に直している。
- **推奨アクション**: FR-014 (O-11 の行を範囲に合わせて直す) に従って題を揃える。

### [Low] `read-transcript.ts` の `run` をテストのためだけに export した (L-004) (scope: feature)

- **観察**: `src/agents/read-transcript.ts:104` の `export async function run`。import しているのは `read-transcript.test.ts:15` だけ。
- **推奨アクション**: 取得プロセスの入口と同じモジュールの公開面を広げない形 (分けたモジュールに置くなど) を検討する。急ぎではない。

### [Medium] H: 上の charter / glossary / ADR の字面の不整合を捕まえる検査が無い (M-008 / H) (scope: system)

- **観察**: M-001〜M-005 と M-007 は文書の不整合で、項目 21・pin テスト・Vitest のどれにも掛からない。コードの側は確かめてある:
  - AD-055 の Confirmation は fixture 4 件 (`tests/rule-fixtures/a-direct/sdk-*`) と `read-transcript.test.ts:53-92` で検証されている。
  - AD-054 の pin テストは `session-core.test.ts` にある。
  - AD-056 の `METER_UPDATE_TYPES` の固定は `meter.test.ts` にある。
  - 既存の振る舞いが壊れていないことは、code-gate の全件 3449 passed と、`SESSION_EVENT_KINDS` / `TRANSCRIPT_PART_FIELDS` の固定テストの差分 0 (quickstart-results V-0) で言える。
- **推奨アクション**: 文書の整合はこの reviewer の手での確認が当面の唯一の検査。今は直さない (AD-050)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `後続: O-11` in docs/ui-coverage.md | 3 | docs/ui-coverage.md:181 / :182 / :183 |
| M-001 | `実行中の task の一覧\|状態は保持` in docs/domains | 3 | session/charter.md:360 (未更新) / ui/charter.md:278-281 / _overview.md:227-232 |
| M-002 | Ref が重複している項 / `バックグラウンド` in src/renderer/src (テスト除く) | 1 / 0 | docs/glossary.md:122-123 / — |
| M-003 | `どれも Tier B` in docs | 1 | docs/decisions/0056-...md:35 |
| M-004 | `includeHookEvents\|forwardSubagentText\|onElicitation` in scripts | 0 | — (項目 16 は denylist。allowlists.mjs:418-425) |
| M-005 | `承認の記録の前に\|accepted の前に` | 2 | docs/decisions/0056-...md:13 / plan.md:267 |
| M-006 | 「欠落」in AD-054/055/056 | 0 | (U-10 は spec / data-model §3.1 だけ) |
| M-007 | `0054\|0055\|0056` in docs/domains | 6 | ui/charter.md frontmatter :22-24 / session/charter.md:268-270 (frontmatter 0) |

## Verdict

- Critical: 0
- High: 1
- Medium: 8
- Low: 4

H-001 は、利用者が実機で V-1 / V-3 / V-4 を記録しないと直せない。それまで `/cl-done` (completed への遷移) には進めない。
