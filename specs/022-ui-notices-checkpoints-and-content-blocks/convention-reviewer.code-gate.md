# convention-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-23
**Reviewer**: convention-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC (本 diff が実装するもの):
  - FR-001〜006: `src/domain/session/notice-rows.ts`、`src/agents/live-signals.ts`、`src/agents/sdk-agent-session.ts`
  - FR-007〜009、FR-011: `src/domain/session/content-blocks.ts`、`src/domain/session/live-message.ts`、`src/agents/live-tool-results.ts`、`server-tool-call.aui.tsx`、`unsupported-block-mark.tsx`
  - FR-010: `documentPart`
  - FR-012: `transcript.ts` の system 分岐
  - FR-013/014: `scripts/ui-coverage/coverage.mjs`
  - FR-015〜017: docs
  - SC-001〜SC-006 は各テストで計測する。
- touched files に該当する charter / Confirmation:
  - `docs/domains/ui/charter.md`
  - `docs/domains/session/charter.md`
  - AD-060。
  - `.specify/memory/constitution.md` に命名規約の Principle は無い (Grep で `命名|naming|kebab|PascalCase` が 0 件)。そのため CONV-2 は既存のファイル名の慣習と照らして判定した。
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の owner 外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: convention-reviewer の owner 外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: convention-reviewer の owner 外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: convention-reviewer の owner 外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: convention-reviewer の owner 外 (po-reviewer)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:4
- G. optional reviewer 範囲: 該当なし: convention-reviewer の owner 外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (下記「H の根拠」)

## スコープ要約

53 ファイルが touched で、うち 45 ファイルが lint 対象。lint-agent の JSON を受け取った。5 コマンドすべてが `exit_code` 0、`violations[]` は空、error/warning/info は 0 件で、CONV-1 の finding は 0 件。`project_totals` の 21 warnings は全件 scope 外なので扱わない。lint コマンドは自分では実行していない。

新設ファイルは次のとおり。
- domain: `notice-rows.ts` (339 行)、`content-blocks.ts` (222 行)
- agents: 既存の `live-tool-results.ts` に追記
- renderer: `server-tool-call.aui.tsx`、`unsupported-block-mark.tsx`

配置は既存のレイヤ規則に沿っている。
- domain は純粋関数で、SDK・Electron・agents を import しない。依存グラフ検査は 543 modules で違反 0。
- renderer の element は `elements/` 配下にある。
- `eslint.config.mjs:610-612` に新 element 2 つが登録済み。
- `sdk-agent-session.ts` の差分に `as` の cast は無い。`active_goal` は型ガード (`asRecord(message)?.type === 'active_goal'`) で受けている (RK-11 のとおり)。

## Findings

### [Medium] 500 行超のファイルが 2 つ新たに増えた (M-001) (scope: feature)

- **観察**:
  - `src/agents/live-tool-results.ts` は全 560 行。差分は +147 行で、変更前は約 413 行だった (500 行を跨いだ)。
  - `src/renderer/src/features/chat/labels.ts` は全 615 行。差分は +126/-2 で、変更前は約 491 行だった (500 行を跨いだ)。
  - どちらも CONV-3 の「1 ファイル 500 行超は warning」に新たに該当する。
  - `thread.aui.tsx` (1644 行) と `sdk-agent-session.ts` (1031 行) は元から超過していて、増分は小さい (+98 / +19)。
- **同種事象探索**: `wc -l` で今回の touched の src を確認し、500 行超は `live-signals.ts` (784)・`sdk-agent-session.ts` (1031)・`live-tool-results.ts` (560)・`thread.aui.tsx` (1644)・`labels.ts` (615) の 5 件。うち今回跨いだのは 2 件。`live-signals.ts` は差分が -89 行で縮んでいる。
- **リスク/影響**: 保守性の低下。単一責任の面では、`live-tool-results.ts` は server-tool-call の記憶と `applyServerResults` を別 module にできる。`labels.ts` は 7 つの category 分の文言を別ファイルにできる。
- **推奨アクション**: gate では直さず、マイルストーン終了時の棚卸しで扱う (AD-050)。
- **根拠**: CONV-3

### [Low] plan / data-model の `noticeRecordOf` が実装に無い (L-001) (scope: feature)

- **観察**:
  - `specs/022-.../data-model.md:43-45` と `plan.md:52,198` は `noticeRecordOf(message)` という名前の関数を規定している。実装は `src/domain/session/transcript.ts:323` にインラインの `{ type: 'system', ...asRecord(rec.message) }` で入っている。
  - data-model §1.1 は「`message.type` が文字列なら上書きしない」と書く。インラインのスプレッドは、`message.type` が文字列以外 (例: 数値) のときその値で `'system'` を上書きし、`toNoticeRow` が `null` を返して従来の経路に落ちる。
  - 実データでこの入力が出る見込みは薄い。
- **同種事象探索**: `noticeRecordOf` を Grep して、`src` で 0 件、`specs` で 4 件 (`tasks.md:70`、`plan.md:52,198,302`、`data-model.md:43,45`)。
- **推奨アクション**: 名前付き関数にして仕様と一致させるか、仕様側を「インライン」に直す (CONV-6)。
- **根拠**: CONV-6

### [Low] 新設 module の export が外部から使われていない (L-002) (scope: feature)

- **観察**:
  - `notice-rows.ts:28` の `NOTICE_NAME_LIST_MAX_ITEMS` と、`content-blocks.ts` の次の export は、自ファイル以外の非テストコードから import されていない。
    - `DOCUMENT_NAME_MAX_CODE_POINTS` (`:12`)
    - `WEB_SOURCES_MAX` (`:15`)
    - `WEB_SOURCE_TITLE_MAX_CODE_POINTS` (`:16`)
    - `WEB_SOURCE_URL_MAX_BYTES` (`:19`)
    - `ServerToolCallPart`
    - `isServerResultBlock`
    - `serverToolUsePart`
    - `placeServerResult`
  - ESLint の unused-vars は export に対して発火しない。renderer の `transcript-guard.ts:76` は定数 20 をコメントで同期しているだけで、import していない。
- **同種事象探索**: 上記の識別子で `src` を Grep した。非テストの外部参照は `unsupportedBlockPart` (`transcript.ts:190`) と `documentPart`・`safeStringify` のみ。
- **推奨アクション**: 外部で使わない export を外す。
- **根拠**: CONV-5

### [Low] テストファイルの接尾辞が不揃い (L-003) (scope: feature)

- **観察**:
  - 新設テストに次の 3 種の命名が混在している。
    - `*.server.test.ts` (`content-blocks.server.test.ts`、`live-tool-results.server.test.ts`)
    - `*.server-blocks.test.ts` (`transcript.server-blocks.test.ts`)
    - `*.aui.test.tsx`
  - `.server` は「サーバー側の tool」の意だが、vitest の environment 名のように読める。
  - `.fe020` / `.fe002` / `.o2` / `.o6` は先行の例 (`nested-render.fe001.test.tsx`、`ChatScreen.o2.test.tsx`) と同じ作法で問題ない。
- **同種事象探索**: `src/**/*.{fe,o,aui,server}*.test.ts*` で 19 件。
- **推奨アクション**: `.server` と `.server-blocks` のどちらかに揃える。
- **根拠**: CONV-2

### [Low] 未追跡の `.vitest/` が .gitignore に無い (L-004) (scope: system)

- **観察**: `git status` に `?? .vitest/` (`.vitest/json/output.json`) が出ている。`.gitignore` に `vitest` の記載は無く (Grep で 0 件)、レポーターの出力がコミットに混ざりうる。
- **推奨アクション**: `.gitignore` に `.vitest/` を足す。
- **根拠**: CONV-2 / CONV-3

### [Low] 元から重複している `asRecord` が新設ファイルでも増えた (L-005) (scope: feature)

- **観察**: `asRecord` は `src` に 13 か所あり、新設の `notice-rows.ts:30` と `content-blocks.ts:30` がそれぞれ独自に持つ。既存の慣習に従っているので重大ではない。
- **推奨アクション**: マイルストーン後の整理で共通化を検討する。
- **根拠**: CONV-5

### H の根拠 (担当範囲のテスト / regression / 観測点)

- 新設・変更した module はすべて対応する単体テストを持つ。
  - 対象: `notice-rows`、`content-blocks`、`transcript` の system 分岐、`live-signals`、`live-tool-results`、`sdk-agent-session`、`convert`、`labels`、`activity-bins` / `turns`、`conversation-search`。
  - 各ファイルにテストファイルがある (scope file 12〜53 行目)。
  - 加えて component テスト、`tests/ui-coverage/{coverage,item21}.test.ts`、`check:constitution` (項目 21 を含み ok 20 / violations 0) がある。
- 既存の regression の根拠:
  - `live-signals.ts` から `notice-rows.ts` への O-6 / O-10 の行の移設は、tasks.md の BE-010 で「`live-signals.test.ts` が書き換えずに通る」と規定されている。その証跡は diff 内に見当たらない (`live-signals.test.ts` は scope に無く、`live-signals.o6.test.ts` が新設)。これは lint の領域外で、test-agent の結果で確認される。
  - 型検査 2 本と depcruise は緑。
- 命名の整合を機械的に守る仕組みは、lint (eslint・depcruise・check:constitution) と上記テストの範囲にある。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `wc -l` で touched の src を確認 (500 行超) | 5 件 (うち新規に跨いだのは 2 件) | `src/agents/live-tool-results.ts` (560)、`src/renderer/src/features/chat/labels.ts` (615) |
| L-001 | `noticeRecordOf` | src 0 件 / specs 4 件 | `specs/022-.../tasks.md:70`、`plan.md:52,198,302`、`data-model.md:43,45` |
| L-002 | `NOTICE_NAME_LIST_MAX_ITEMS\|DOCUMENT_NAME_MAX_CODE_POINTS\|WEB_SOURCE_*\|isServerResultBlock` ほか | 非テストの外部参照 0 件 | `src/domain/session/notice-rows.ts:28`、`src/domain/session/content-blocks.ts:12,15,16,19` |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5

lint の `exit_code` はすべて 0 で、CONV-1 の Critical は 0 件。
