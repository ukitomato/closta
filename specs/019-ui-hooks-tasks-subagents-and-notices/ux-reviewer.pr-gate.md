# ux-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Reviewer**: ux-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: UI に関わるのは FR-002 / FR-003 (Hook の行と読み上げ)、FR-004 / FR-005 / FR-006 (背景の task の行とタブ)、FR-008 / FR-009 / FR-011 (subagent の入れ子の描画)、SC-001〜SC-003 です。
- touched files に該当する charter / Confirmation:
  - docs/domains/ui/charter.md の UI 文言は日本語を第一言語にする規則 (Principle XV) と、O-11 の項。
  - AD-056 Decision 2 / 3 / 5 (背景 task のタブ、TodoList は作らない、Agent handoff は使わない)。
  - data-model §1.3 / §2.5 / §3.3。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (empty / error state / i18n / 一貫性): Critical:0 High:0 Medium:2 Low:4
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

UI に関わる変更を見ました。対象は次のファイルです。
- 背景の task のタブ (`BackgroundTasksTab.tsx`) と `labels.ts`。
- Hook の行に付ける、名前を伏せた Hook の通し番号 (`masked-hook-ordinals.ts`) と、「背景に移した」の印 (`thread.aui.tsx` の `SystemEventRow`)。
- 一般の Hook の読み上げ (`transcript-announcements.ts`)。
- 入れ子の描画 (`subagent.aui.tsx`、`tool-registry.aui.tsx`)。

タブの空・未着・動いていない状態は、それぞれ別の文言で出し分けられています。Hook の読み上げは失敗・取り消しだけに絞られています。入れ子の中の tool は主ループと同じ表示になります。Critical / High に当たるものは観察できませんでした。UX-1 (empty state)、UX-2 (error state)、UX-3 (loading state)、UX-5 (confirmation) は本 PR の対象外です。背景 task のタブは読み取り専用で、破壊的操作がないためです。以下は Medium / Low の指摘です。

## Findings

### [Medium] 実行中の subagent の入れ子は、子が 50 件を超えると最新の活動が見えなくなる (M-001) (scope: feature)

- **観察**:
  - `src/renderer/src/components/assistant-ui/elements/subagent.aui.tsx:47` の `VISUAL_MAX_CHILDREN = 50` が、`:179` で `messages.slice(0, 50)` として先頭から 50 件だけを出します。
  - 残りは `:194` の「（以降 N 件を省略）」の 1 行になります。展開の手段はありません。
  - agents 側の上限は 500 件です (`src/agents/live-tool-results.ts:35`)。そのため 51〜500 件目の子は DTO には入りますが、描画では常に隠れます。
  - data-model.md:199 は「子の数 `VISUAL_MAX_CHILDREN` (50) のまま」と決めています。つまり設計どおりの挙動です。
- **同種事象探索**: `VISUAL_MAX_CHILDREN|以降 .* 件を省略` で 3 件 (`subagent.aui.tsx:47,179,194`、`data-model.md:199`)。
- **リスク/影響**:
  - US-3 の目的は実行中の subagent が何をしているかを読めることです。
  - assistant の発話が 50 を超える長い subagent では、今やっていること (末尾) が見えなくなり、先頭の 50 件だけが固定で出ます。
  - 描画だけの上限なので、U-10 が最新の子を残す方式を退けた理由 (送り直しの形が変わる) は当たりません。末尾 N 件を出す方式でも DTO は変わりません。
  - 省略の案内は件数だけで、どちらの端が省かれたかを言っていません。
- **推奨アクション**:
  - 実行中は末尾の 50 件を出し、「先頭の N 件を省略」と案内する。
  - または展開するボタンを付ける。
  - 判断が不要なら O-12 以降の棚卸しに回す。AD-050 により本 gate では直さない。
- **根拠**: spec US-3 / AC1、UX-7 (情報の出し方)
- **scope 根拠**: touched file (`subagent.aui.tsx`)。ただし設計 (data-model §3.3) が許容した挙動。

### [Medium] 入れ子の既定は「畳む」のはずが、実装は常に展開され、専用の tool 表示がそのまま並ぶ (M-002) (scope: feature)

- **観察**:
  - spec の Clarifications と data-model.md:204 は「既定の開閉は今の Subagent の表示の既定 (畳む) のまま」と書いています。
  - しかし `subagent.aui.tsx:245` の `SubagentBody` は無条件に描かれます。Subagent 全体にも `SubagentBody` にも、開閉する仕組み (Collapsible / defaultOpen) がありません (`subagent.aui.test.tsx` にも開閉のテストなし)。
  - 今回の変更で、入れ子の tool-call が `renderNested` 経由で TerminalBlock / CodeDiff / FileTool などの専用表示になります (`subagent.aui.tsx:82-89`)。実行中は、これらが主ループの transcript に展開されたまま積み上がります。
- **同種事象探索**: `Collapsible|defaultOpen` を `tool-registry.aui.tsx` と `subagent.aui.test.tsx` で探して 0 件。`畳む` と `開閉` も `subagent.aui.test.tsx` で 0 件。
- **リスク/影響**:
  - 前提としていた「畳む」が成り立っていません。そのため、長い subagent が 1 つあるだけで transcript の縦幅が大きく伸び、親の会話の流れが読みにくくなります。
  - spec の記述と実装が食い違っています。
- **推奨アクション**:
  - 入れ子の本体を既定で畳む (件数つきの見出しで開閉)。
  - または spec / data-model の「畳む」を実装に合わせて直す。
- **根拠**: spec Clarifications (入れ子の既定の開閉)、UX-7
- **scope 根拠**: touched file。

### [Low] 入れ子の子に role が生の英字で出る (L-001) (scope: feature)

- **観察**:
  - `subagent.aui.tsx:185-187` が `{message.role}` をそのまま出します。CSS の `uppercase` により、実行中の入れ子の子ごとに「ASSISTANT」と表示されます。
  - この行は既存のコードで diff の対象外です。ただし今回の実行中の入れ子で全 subagent に出るようになります。
- **同種事象探索**: `message.role` を `subagent.aui.tsx` で探して 1 件 (`:186`)。
- **リスク/影響**: UI の文言は日本語を第一言語にする規則 (Principle XV) に合いません。内部の語が漏れています。
- **推奨アクション**: 「サブエージェント」などの固定の日本語ラベルにする。
- **根拠**: UX-6、Principle XV

### [Low] 同じ概念の表記が揺れている (L-002) (scope: feature)

- **観察**:
  - 行の見出しは英字の「Background task」です (`src/renderer/src/features/chat/labels.ts:32,48`)。
  - 同じものを右のペインのタブは「背景の task」と呼びます (`src/renderer/src/features/shell/labels.ts:50`)。
  - 種類の表では「その他の task」(新規、`chat/labels.ts:314`) と既存の「MCP のタスク」(`:313`) が「task」と「タスク」で揺れています。
- **同種事象探索**: `Background task` を `chat/labels.ts` で探して 2 件 (`:32`、`:48`)。`タスク` を `chat/labels.ts` で探して 1 件 (`:313`)。
- **リスク/影響**: 軽微な一貫性の問題です。
- **推奨アクション**: 表記を glossary に揃える。
- **根拠**: UX-9

### [Low] タブの「未着」と「動いていない」の文言が実装寄り・やや不親切 (L-003) (scope: feature)

- **観察**:
  - 稼働中で一覧が未着のとき、タブは「背景の task の一覧はまだ届いていません。」と出します (`shell/labels.ts:263`)。
  - 未選択のときも、過去ログのときも、同じ「セッションは動いていません。」だけです (`:265`)。
- **同種事象探索**: `awaiting|notRunning` を `BackgroundTasksTab.tsx` で探して 4 件 (`:37-38`、`:73-74`)。
- **リスク/影響**:
  - 「届いていません」は内部の都合を言っており、何を待てばよいか分かりません。
  - 未選択と過去ログで次の手が示されません。
- **推奨アクション**:
  - 未着: 「実行中の背景 task はまだ報告されていません」のような言い方にする。
  - 未選択・過去: 「実行中のセッションを選ぶと表示されます」と添える。
- **根拠**: UX-1 (空の理由と次のアクション)

### [Low] 子の切り詰めの印が「（切り詰め）」だけで意味が通じない (L-004) (scope: feature)

- **観察**:
  - 子が 500 件に当たると (U-10)、親に `TOOL_RESULT_LABELS.truncated` = 「（切り詰め）」が出ます (`chat/labels.ts:352`)。
  - この文言の定義は「args か結果が上限で切り詰められたとき」です。子の欠落とは別の意味です。
- **同種事象探索**: `truncated: '（切り詰め）'` で 1 件。
- **リスク/影響**: 利用者は、subagent の以後の活動が足されていないことに気づけません。
- **推奨アクション**: 子の切り詰めには「以降の活動は表示していません」を添える。
- **根拠**: UX-2 / UX-7

## 同種事象探索 cascade summary

Critical を申告していないため、cascade の対象はありません。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `VISUAL_MAX_CHILDREN` | 3 | `subagent.aui.tsx:47`、`:179`、`data-model.md:199` |
| M-002 | `Collapsible|defaultOpen` | 0 | `tool-registry.aui.tsx`、`subagent.aui.test.tsx` |
| L-001 | `message.role` | 1 | `subagent.aui.tsx:186` |
| L-002 | `Background task` | 2 | `chat/labels.ts:32`、`:48` |

## H 観点の補足

- **Medium (テストの穴)**:
  - `subagent.aui.test.tsx` に、子 50 件超の入れ子で何が隠れるかを確かめるテストがありません。
  - 実行中の入れ子が長くなったときの表示 (M-001) は、固定されていません。
  - 「入れ子は既定で畳む」(M-002) を確かめるテストもありません。
- 既存の振る舞いを壊していない根拠:
  - code-gate は 3449 件すべて通過しています (`.gate-verdict-code.json`)。
  - タブ、Hook の読み上げ (成功は 0 件、失敗・取り消しだけ読む)、名前を伏せた Hook の通し番号、truncated の印は専用のテストがあります。
  - `BackgroundTasksTab.test.tsx:151` には axe の確認があります。
- 観測点:
  - この UI 層に障害時のログや指標は見当たりません。
  - ただし、表示の欠落は DTO の `truncated` で外から検出できます。

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Round inheritance: N/A (round 1)
