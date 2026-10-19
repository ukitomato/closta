# a11y-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Reviewer**: a11y-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC (a11y に関係するもの): FR-003 (Hook の見た目と読み上げ)、FR-006 (背景の task のタブ。タブのキーボード操作は AD-047/AD-046 継承)、FR-009 / FR-011 (入れ子の描画)、SC-002 (タブの vitest-axe 違反 0)、US-1 AC4 (失敗・取り消しだけ読み上げ)
- 該当する charter / Confirmation: ui charter「日本語で破綻しない」(Principle VIII)、「assistant-ui の design system に乗る」(Principle XIII)。右のペインのタブは WAI-ARIA Tabs pattern (AD-046 / O-4 引き継ぎ)
- vendored primitive (exclude_patterns): `reasoning.aui.tsx` などの registry 複製は指摘対象にしていない
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外
- C. 業務不変条件 / Charter drift: 該当なし: a11y-reviewer の担当外
- D. Constitution / ADR drift: 該当なし: a11y-reviewer の担当外
- E. User Story / SC / AC / UX: 該当なし: a11y-reviewer の担当外
- F. 命名 / module / lint hookup: 該当なし: a11y-reviewer の担当外
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:0 Medium:1 Low:2
- H. テスト / coverage / observability / regression: High:0 Medium:0 Low:1

## スコープ要約

UI の変更は次のとおり。
- `BackgroundTasksTab.tsx` (新設) と `panel-tabs.ts` への 5 つ目のタブ追加。
- `thread.aui.tsx` の `SystemEventRow` に、一般の Hook の attention tone、伏せた Hook の見出し、`backgrounded-task` の印を追加。
- `transcript-announcements.ts` の読み上げ条件 (一般の Hook は失敗・取り消しだけ)。
- `subagent.aui.tsx` の入れ子描画 (markdown、Reasoning、`TranscriptBoundary`、registry 経由の tool)。
- `markdown-body.tsx` (新設)。

確認できた良い点は次のとおり。
- 状態は色だけで伝えていない。失敗・取り消しは `Badge` の文言 (`thread.aui.tsx:1307-1315`) と attention tone の併用で、アイコンは `aria-hidden`。
- 新しい行の fade-in には `motion-reduce:animate-none` が付いている (`thread.aui.tsx:1255`)。
- 新タブは既存の `role=tablist` / `tab` / `tabpanel`、roving tabindex、矢印・Home・End の仕組みに乗る (`RightPanel.tsx:143-196`)。`RightPanel.tabs.test.tsx` が 5 タブの循環・Home・End を固定している。
- 畳んだ帯のボタンは `aria-label` と `title` を持つ (`RightPanel.tsx:121-122`)。
- 一覧は `ul` / `li`、見出しは他のタブと同じ `h3`。操作ボタンは無く、テストでも固定している。
- `muted-foreground` の light/dark の値は既存トークンのままで、本 PR で変えていない (`main.css:98,137`)。

code-gate の `must_fix_findings` は空で、suppress 対象は無い。

## Findings

### [Medium] 右のペインのタブ帯に 5 つ目のタブが入り、既定幅 320px で収まらない可能性 (M-001) (scope: feature)

- **観察**: `panel-tabs.ts` の diff (`.pr-gate.diff:8665-8672`) で 5 つ目のタブ「背景の task」を足した。タブの帯は `className="flex flex-1 gap-1"` で、折り返しも横スクロールも指定が無い (`RightPanel.tsx:142-147`)。各タブは `px-2 py-1 text-xs` のボタンで、帯の幅は `w-80` (320px。`shell-layout.ts:13`) から余白と開閉ボタンを引いた残り。
- **見積り (実測ではない)**: 12px の全角を前提にした算術では、5 タブの内容幅 (約 285px) と gap の合計が利用できる幅 (約 265px) を超える。flex の既定の縮小により「背景の task」「会話の地図」などが行内で折り返し、帯が 2 行以上に伸びる可能性がある。「構成」に注意の印が付くと、さらに 12px 増える。実測は quickstart の実機確認で行う。
- **同種事象探索**: `rg "role=\"tablist\"" src/renderer/src/features/shell` で 1 件 (`RightPanel.tsx:143`)。タブの幅を検査するテストは jsdom のため存在しない。
- **リスク/影響**: タブ名が折り返すと、選択中タブの表示 (`font-semibold`) との区別や押す対象の見た目が崩れる。WCAG 1.4.4 / 1.4.10 に近い論点 (文字拡大時の破綻) だが、タブは到達可能なままなので Critical / High ではない。
- **推奨アクション**: quickstart の実機確認で 320px の見え方を記録する。必要なら `whitespace-nowrap` と `overflow-x-auto` を帯に付けるなど、別 spec か完了後の棚卸しで扱う。
- **根拠**: WCAG 2.1 1.4.4 / 1.4.10。ui charter「日本語で破綻しない」。
- **scope 根拠**: `panel-tabs.ts` は touched file。`RightPanel.tsx` は未変更だが、本 PR でタブ数が増えたことが原因。

### [Low] 背景の task の一覧の更新が支援技術に伝わらない (L-001) (scope: feature)

- **観察**: `BackgroundTasksTab.tsx:67-88` の見出しの件数と `ul` は、`meter` で置き換わっても `aria-live` も `role=status` も無い。transcript 側の `TranscriptAnnouncer` も `background-tasks` の `meter` は読まない。
- **同種事象探索**: `rg "aria-live|role=\"status\"" src/renderer/src/features/shell` で 0 件。他のタブ (UsageTab・InitReportTab) も同じ作りで一貫している。
- **リスク/影響**: 利用者がタブを開いたまま task が増減しても通知されない。ただしパネルは利用者が見に行く内容で、終了は transcript の行と読み上げ (failed 等) が担う。WCAG 4.1.3 の「状態メッセージ」の範囲外と読める。
- **推奨アクション**: 不要。要望が出たら見出しの件数だけ `role=status` にする案がある。
- **根拠**: WCAG 4.1.3。

### [Low] 切り詰めた task 名の全文が `title` だけで、キーボードでは読めない (L-002) (scope: feature)

- **観察**: `BackgroundTasksTab.tsx:102-106` の名前 `<span className="… truncate" title={name}>`。
- **同種事象探索**: `rg "truncate.*title=|title=\{name\}" src/renderer/src` で `BackgroundTasksTab.tsx:103` と `thread.aui.tsx:1287`、`:1302`、`:1320` の計 4 件。`thread.aui.tsx` の 3 件は pr-gate R2 a11y M-002 で `title` を採用した既存方針。
- **リスク/影響**: シェルの task は名前だけが見分ける手がかりで、320px のパネルでは長い名前が切れる。`title` はキーボード操作の利用者には出ない。
- **推奨アクション**: 既存方針と揃っているので本 PR では直さない。棚卸しで `truncate` をやめて折り返す案を検討する。
- **根拠**: WCAG 1.4.13 / 2.1.1 (`title` 依存)。

### [Low] axe の `color-contrast` を無効にしているため、新しい行・タブのコントラストは自動検証されない (L-003 / H) (scope: feature)

- **観察**: `BackgroundTasksTab.test.tsx` の AXE_RULES と `markdown-body.test.tsx` の AXE_RULES は `color-contrast: { enabled: false }` (`.pr-gate.diff:8262`, `:6627`)。jsdom ではコントラストを計算できないため。
- **同種事象探索**: `rg "color-contrast" src --glob "*.test.tsx"` は、本 PR 以外の既存 axe テストにも同じ指定がある (既存の慣行)。
- **リスク/影響**: 本 PR は新しい色を足さず既存トークンの組み合わせ (`muted-foreground`、`text-foreground`、destructive の `Badge`) だけを使うので、実害は観察されない。コントラストの回帰は E2E / スクリーンショットの目視に依存する。
- **推奨アクション**: 現状維持。コントラストは E2E 基準画像 (CI の artifact) の目視で担保する。
- **根拠**: WCAG 1.4.3。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade の必須対象は無し。参考として Medium / Low の探索結果を載せる。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `role="tablist"` (shell) | 1 | `src/renderer/src/features/shell/RightPanel.tsx:143` |
| L-001 | `aria-live` / `role="status"` (shell) | 0 | - |
| L-002 | `truncate` と `title` | 4 | `BackgroundTasksTab.tsx:103`、`thread.aui.tsx:1287`、`:1302`、`:1320` |
| L-003 | `color-contrast` を無効にした axe テスト | 本 PR で 2 ファイル | `BackgroundTasksTab.test.tsx`、`markdown-body.test.tsx` |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
- Round inheritance: new: 4 (round 1)
