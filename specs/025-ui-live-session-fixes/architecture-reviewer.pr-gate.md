# architecture-reviewer Review: 起動中のセッションの UI の手直し (O-13)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Mode**: pr-gate (default + ADR-drift)

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-018 (US-1〜US-5) をすべて実装している。SC-001〜SC-007 にも影響がある。本 reviewer が主に見たのは FR-002 / FR-005〜FR-007 (AD-062 / AD-065 の経路)、FR-008〜FR-010 (Principle XV の例外)、FR-004 (ui-coverage の割当)
- touched files に該当する charter / Confirmation:
  - ui charter `docs/domains/ui/charter.md`: Related ADRs / Specs、O-13 の結論の行
  - AD-065 Confirmation (全 6 項目): session-launch-service / sdk-agent-session / labels の単体、Constitution の 3 か所
  - AD-062 Decision 2 / 6 (読み替え)
  - AD-036 §4 P3 (読み替え)
  - AD-037 (`onKeyDown` に手を入れない)
  - AD-046 Decision 6 (置き場所の語彙)
  - AD-045 (Principle XV の Exceptions の先例)
  - Constitution「改定手順」:363-375、Principle XV の Exceptions
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。AD-065 Confirmation のテストは揃っている (`src/main/app/session-launch-service.test.ts:1131-1320`、`src/agents/session-core.test.ts:4208` 相当、`src/renderer/src/features/chat/labels.test.ts`)。ログは件数だけを出す。H-001 は文書と手続きの問題なので、テストでは検出できない

## スコープ要約

- 既定の Provider のセッションで、`Query.supportedModels()` からモデルの一覧を取る経路 (renderer → main の `listSessionModels` → `SessionControl` の `list-models` → `models-result`) を足した
- `setModel` は `Entry.liveModels` を effort で絞った集合と照合する
- 権限モードの名前を Claude Code の CLI の表記にした。これに合わせて Constitution Principle XV の Exceptions を改めた (v1.4.0 → v1.5.0、AD-065 Decision 3 / 4)
- 選択を中央のヘッダから composer の左の群に移した。`LiveSettingsControls` は shell から session へ移した
- 停止ボタンを `outline` にし、Esc で止まるようにした
- 右のペインのタブを横スクロールにし、使用量の格子を直した
- `/resume` をアプリのコマンドとして足した

実装は AD-065 Decision 1 / 2 とよく合っている (`queryHandle` の `Pick` に `supportedModels`、`QueryLiveReadMethod`、Provider null かつ `changing` を見ない `liveSettingBlocker`、世代 / requestId の照合と `session-ended` での解決、`QUERY_MUTATION_METHODS` は 20 のまま)。レイヤの向きも崩れていない。

主な問題は Constitution の改定手順 2 (人間のレビュー) の記録が実態と食い違っていること。

## Findings

### [High] Constitution・roadmap には改定手順 2 を「名前の表と同じ別の PR」で受けると書いてあるが、実際には本 PR に両方が入っており、AD-065 Decision 4 とも tasks の分割条件とも食い違う (H-001) (scope: feature)

- **観察**:
  - `.specify/memory/constitution.md:15-16` (Sync Impact Report v1.5.0) は「2 = 名前の表 (`PERMISSION_MODE_NAMES`) の差分と同じ別の PR で人間のレビューを受ける (025 RK-08)」と書いている。Amendment trail の `.specify/memory/constitution.md:1107` も同様
  - `docs/roadmap.md:388` (O-13 の結論) は「(2) の権限モードの名前の表は Constitution Principle XV の Exceptions と同じ別の PR (人間のレビュー待ち。RK-08)」と書きながら、「6 項目はすべて実装した」とも書いている
  - 実際には、本 PR (base main / head 8c9f442) が Constitution の差分 (`.pr-gate.diff:1-64`) と名前の表の変更 (`src/renderer/src/features/chat/labels.ts:364-390`、`.pr-gate.diff:6038-6055`) の両方を持っている。`specs/025-ui-live-session-fixes/quickstart-results.md:26` も「両方とも同じ PR に入れる … 人間のレビューは朝に」と記録している
  - accepted の AD-065 Decision 4 (`docs/decisions/0065-…md:51`) は「2 = O-13 の PR で architecture-reviewer を交えた人間のレビュー (AD-045 の先例どおり PR の中で行う)」としている
  - `specs/025-ui-live-session-fixes/tasks.md:126` (SH-011) と `:154` は「夜間の規則で PR をマージするときは … 同じ別の PR に分け、人間のレビューを待つ」としている。本 PR は分割していないので、この規則では本 PR 自体が人間のレビューを待つ PR になる
- **同種事象探索**: `RK-08|別の PR|人間のレビュー` で 6 件: `.specify/memory/constitution.md:15`、`:1107`、`docs/roadmap.md:388`、`specs/025-ui-live-session-fixes/tasks.md:126`、`:154`、`quickstart-results.md:26`。正しく書けているのは quickstart-results の 1 件だけ
- **リスク/影響**:
  - Constitution に、実際には起きない手続き (別の PR) が改定の根拠として残る
  - 夜間の自走の規則 (pr-gate Critical 0 でマージ可) のままでは、本 PR は人間のレビューを経ずに main に入りうる。その場合 Constitution の改定手順 2 (constitution.md:372) を満たさないまま v1.5.0 が成立する
- **推奨アクション**:
  1. `.specify/memory/constitution.md:15-16` と `:1107` を、AD-065 Decision 4 どおり「O-13 の PR (025) の中で、architecture-reviewer を交えた人間のレビューを受ける」に直す
  2. `docs/roadmap.md:388` を「同じ PR。マージは人間のレビューの後」に直す
  3. `tasks.md:154` の分割の前提を実際の選択に合わせる
  4. 本 PR のマージ条件に「利用者が Constitution の差分を承認したこと」を明記し、夜間の自動マージの対象から外す
- **根拠**: Constitution「改定手順」2 (`.specify/memory/constitution.md:372`)、AD-065 Decision 4、AGENTS.md「Constitution Principle の採否は必ず人間が承認する」
- **scope 根拠**: 食い違っている 4 ファイルはすべて本 PR の touched files

### [Medium] AD-046 Decision 6 の置き場所の語彙に無い「composer の周り」「右のパネル」を、対応表と charter が置き場所の語として使っている (M-001) (scope: feature)

- **観察**: AD-046 Decision 6 (`docs/decisions/0046-app-shell-layout.md:34`) の語彙は「サイドバー / 中央のヘッダ / 中央の本体 / 右のペインのタブ / 設定のダイアログ」。`docs/ui-coverage.md:220`, `:221`, `:228`, `:285`, `:339`, `:360` は「composer の周りの選択」、`docs/domains/ui/charter.md:276` は「composer の周りへ移動」「右のパネルのタブ」と書いている
- **同種事象探索**: `composer の周り` 13 件 (docs 8 / src 5)、`右のパネル` 6 件
- **リスク/影響**: Principle XIV と AD-046 から外れる。実害は無い
- **推奨アクション**: SSoT の文書 (ui-coverage・charter) を「中央の本体の composer (左の群)」「右のペインのタブ」に揃える
- **根拠**: AD-046 Decision 6、Constitution Principle XIV

### [Low] glossary の frontmatter `total_terms` が実数と合わない (L-001) (scope: feature)

- **観察**: `docs/glossary.md:5` は `total_terms: 104` のまま。差の大部分は本 PR より前から
- **同種事象探索**: `^total_terms` で 1 件
- **推奨アクション**: 棚卸しで数え直す
- **根拠**: Principle XIV

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `RK-08\|別の PR\|人間のレビュー` | 6 | .specify/memory/constitution.md:15, :1107, docs/roadmap.md:388, specs/025-ui-live-session-fixes/tasks.md:126, :154, quickstart-results.md:26 |
| M-001 | `composer の周り` / `右のパネル` | 13 / 6 | docs/ui-coverage.md:220,221,228,285,339,360; docs/domains/ui/charter.md:276; docs/roadmap.md:388; ほか src / e2e |
| L-001 | `^total_terms` | 1 | docs/glossary.md:5 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 1
