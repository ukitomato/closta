# a11y-reviewer Review: Feature Specification: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: a11y-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

## 初回読了 viewpoint

- FR/SC (本 PR で実装・影響され、a11y の観点に当たるもの):
  - FR-006 / US-2 AC1〜AC3: Quota banner の `role` (status / alert) と文
  - FR-008 / US-3 AC1・AC3〜AC5: 使用量のタブの構造 (`dl`・見出し)
  - FR-009 / US-3 AC2: 目盛り (`role="meter"`)。推定であることを支援技術に伝える。80% で注意の見た目
  - FR-010 / US-4 AC1a: 権限モードの警告の帯 (`role="alert"`)
  - FR-012 / US-4 AC3・AC4: tool の経過時間と思考の印 (live region にしない)
  - FR-017 / SC-007: APG の Tabs pattern (←/→・Home/End・roving tabindex・vitest-axe 0)
  - FR-019 / SC-007: 消えるボタンのフォーカスの行き先 (WCAG 2.4.3)
  - FR-018: 切り出しで振る舞いを変えない (監視ビューの行の読み上げ・sr-only)
- touched files に当たる charter / Confirmation:
  - ui charter「業務ルール」: design system に乗り、独自のトークンを増やさない (Principle XIII)。日本語で破綻しない (VIII)
  - ui charter「面の状態」: focus はシェルだけが書く (FR-019 はフォーカスを移すだけで、面の状態は書かない)
  - AD-046 Decision 4・6: 右のペインのタブの表と置き場所の語
  - AD-047 Confirmation: SC-001 / SC-002 / SC-006 (a11y の範囲外)
  - data-model §4 (帯・目盛り・進み具合の読み上げの規則)、§6 (タブのキーボード操作)、§8 (フォーカスの行き先)
  - reviewers.yml の `exclude_patterns`: `thinking-indicator.tsx` は vendored として外れる。指摘は呼び出し側 (`thread.aui.tsx`) に向ける
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲。a11y の観点では扱わない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲。新しい UI は値をテキストとして描くだけで、a11y の観点は無い
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲。a11y の観点で accepted ADR と食い違う箇所は見当たらない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: Critical:0 High:2 Medium:3 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

pr-gate Round 1。base は main (merge-base 44ce810)、HEAD は fc3a5fc。reviewers.yml の a11y の `auto_invoke_patterns` に当たり、`exclude_patterns` に当たらない UI ファイルを見た。対象は次のとおり。
- shell: `CenterBanners.tsx`・`ContextCostMeter.tsx`・`UsageTab.tsx`・`RightPanel.tsx`・`CenterHeader.tsx`・`CenterPane.tsx`・`OverviewTab.tsx`・`labels.ts`・`panel-tabs.ts`
- session: `LivePane.tsx`・`RunningSessionRow.tsx`・`RunningSessionList.tsx`・`SessionAttentionAnnouncer.tsx`
- elements: `thread.aui.tsx`・`tool-result-marks.tsx` と、その呼び出し側 6 ファイル

`thinking-indicator.tsx` は vendored として除外した。ただし、それを使う `thread.aui.tsx` の `LiveThinkingIndicator` は対象に含めた。

テーマの値は `src/renderer/src/assets/main.css` から取った (Tailwind v4。`bg-x/10` は x を 10% の alpha で `bg-background` に重ねたもの)。コントラスト比は sRGB の相対輝度で手計算した。新しい対話の要素はタブだけで、どれも Tab で届く。キーボードで届かない要素は 0 件。

H の観点で、既存の振る舞いを壊していないと言える根拠は次の 3 つ。
- FR-018: code-gate の test-agent が 2604 件すべて通過。切り出しで既存のテストを書き換えていない (`announcements` の単体を除く)
- FR-017: `RightPanel.tabs.test.tsx` が矢印キー・Home/End・`tabIndex`・出せないタブ・axe を固定している
- FR-019: `LivePane.test.tsx:207-235`・`RunningSessionList.test.tsx`・`pending-queue-notice.test.tsx` が `document.activeElement` を固定している

一方で、**コントラストを機械で見る経路はリポジトリのどこにも無い** (M-004)。

## Findings

### [High] 思考の印のトークン数が背景に対し 2.05:1 (light) / 2.52:1 (dark) で、US-4 AC4 の情報が弱視の利用者に読めない (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:570-580` の `LiveThinkingIndicator` が、US-4 AC4 の本体の値「約 N トークン」(`THINKING_LABELS.tokens`) を `ThinkingIndicator` の `elapsed` の枠に渡している
  - その枠は vendored の `thinking-indicator.tsx:37` で `text-foreground/30` (text-xs)
  - footer の背景は `bg-background` (`thread.aui.tsx:262` / `:549`)
  - light: `#09090b` の 30% を白に重ねると ≒ `#b5b5b6` で **2.05:1**。dark: `#fafafa` の 30% を `#09090b` に重ねて **2.52:1**
  - 「思考中」の文字も root の `text-foreground/55` (`thinking-indicator.tsx:20`) で、light が **4.43:1** (4.5:1 に届かない。shimmer のグラデーションが乗る)
  - 呼び出し側の `className="px-2 text-xs"` は色を上書きしていない
- **同種事象探索**: `text-foreground/(30|35|40|45|50|55)\b` で 22 件。本 PR が新しく画面に出すのは `thinking-indicator.tsx:20,37` の 2 件だけ (呼び出しは `thread.aui.tsx:269` / `:552` の 2 か所)。ほかの 20 件の内訳は次のとおり (本 PR は描画の経路を変えていない)
  - vendored の除外対象 (`data-table.tsx`・`empty-state.tsx`・`file-tree.tsx`・`loading-state.tsx`・`error-state.tsx` のアイコン)
  - O-3 の element (`command-palette.tsx:150,166,173,238`・`conversation-search.tsx:70,83`。placeholder とアイコンが中心)
- **リスク/影響**: WCAG 1.4.3 (AA。通常の文字は 4.5:1)。FR-012 / US-4 AC4 で出すと決めた値が、弱視の利用者には事実上読めない
- **推奨アクション**: vendored の `thinking-indicator.tsx` には手を入れず、呼び出し側だけで直す
  - 例: `className="px-2 text-xs text-muted-foreground [&_.tabular-nums]:text-muted-foreground"`。`text-muted-foreground` は light で 4.83:1。tailwind-merge が root の `text-foreground/55` を置き換え、子孫の選択子が `elapsed` の span の `/30` を上書きする
  - 直した後は、`LivePane.progress.test.tsx` の思考の印のテストに、class が当たっていることの検査を足す
- **根拠**: WCAG 2.1 SC 1.4.3。ui charter の業務ルール (design system のトークン `--muted-foreground` を使う)。reviewers.yml の vendored を直さない規則 (直すのは呼び出し側)
- **scope 根拠**: 呼び出し側 `thread.aui.tsx` は touched file で、a11y の対象。本 PR の中で直せる

### [High] 権限モードの警告の帯と Quota banner (rejected) の文字が light で 3.99:1 になり、AA に届かない (H-002) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/CenterBanners.tsx:90` (`UnsafeModeBanner`。`role="alert"`) と `:157` (Quota banner の `tone === 'warning'`) は `bg-destructive/10 text-destructive ... text-sm` で、太字でない 14px
  - light の `--destructive` は `oklch(0.577 0.245 27.325)` ≒ `#e7000b`。10% を白に重ねた背景は ≒ `rgb(253,230,231)`。コントラスト比は **3.99:1**
  - dark (`#ff6467` を `#09090b` に重ねた背景の上) は 6.25:1 で足りている
  - 同じファイルの注意の帯 (`text-amber-800` を `bg-amber-500/10` に。≒ 6.6:1) と目盛りの注意 (`text-amber-800`) は足りている
- **同種事象探索**: `bg-destructive/10` で 5 件
  - 本 PR が足したもの: `CenterBanners.tsx:90`・`CenterBanners.tsx:157`
  - 既存のもの (本 PR の差分の外): `LivePane.tsx:323` (FailureBanner。同じ class と `text-sm`)、`thread.aui.tsx:795` (ErrorPrimitive。dark は `dark:text-red-200` で直っているが、light は同じ 3.99:1)、`code-diff.aui.tsx:64` (`text-destructive/90` でさらに低い)
- **リスク/影響**: WCAG 1.4.3 (AA) 違反。`unsafeModeBanner` は「承認なしで操作が走ることがあります」という安全の警告 (U-6 / Principle III) で、この PR で最も読ませたい文が AA に届かない
- **推奨アクション**:
  - `CenterBanners.tsx:90` と `:157` の文字色を `text-foreground` にする。警告の見た目は、`border-destructive` と `aria-hidden` のアイコン (例: `TriangleAlertIcon className="text-destructive"`) で残す。これでトークンを増やさず、色だけに頼る表現にもならない
  - 同じ PR の `amber-800` に倣うなら `text-red-700 dark:text-destructive` (≒ 5.4:1) でもよい
  - `LivePane.tsx:323`・`thread.aui.tsx:795`・`code-diff.aui.tsx:64` は既存のもので、本 PR の差分の外。roadmap の system-scope に送るか、同じ PR で揃えるかを決める
- **根拠**: WCAG 2.1 SC 1.4.3。ui charter の業務ルール (design system のトークン)
- **scope 根拠**: `CenterBanners.tsx` は本 PR が新しく足したファイル。既存の 3 件は system scope

### [Medium] Quota banner の `role="status"` は中身ごと差し込まれ、値が変わるたびに `key` で作り直されるので、読み上げが支援技術の組み合わせ次第になる (M-001) (scope: feature)

- **観察**:
  - `CenterBanners.tsx:118-121` は、`rateLimit` が届いて初めて `QuotaBannerOf` を描く。しかも `key={rateLimitKey(rateLimit)}` で、値 (割合・時刻など) が変わるたびに要素ごと作り直す
  - `:150-152` は、その新しい要素に `role={view.role}` を付ける
  - `allowed_warning` (`quota-banner.ts:59`) と、送れない終端の `rejected` (`:71`) は `role="status"`。どちらも「既にある live region の中身が変わる」形にならず、「中身を持った live region が差し込まれる」形になる
  - リポジトリの中では、`SessionAttentionAnnouncer.tsx:45-48` が「live region を常に置き、中身だけを入れ替える」形を research R-05 の理由で採っている
- **同種事象探索**: 条件つきで描く `role="status"` を `role="status"|role=\{` で探し、15 件。本 PR が足したのは `CenterBanners.tsx:151` の 1 件だけ。ほかは既存 (`LivePane.tsx:195,343,410,438`・`LaunchDialog.tsx:548,628`・`PresetPanel.tsx:193` ほか)
- **リスク/影響**: WCAG 4.1.3 の「プログラムで判別できる」は満たしている。ただ、polite の live region は、中身を持って差し込まれたときや作り直されたときに読まれない組み合わせがある (`role="alert"` は差し込みでも読まれるのが通例)。制限に近づいたという注意 (US-2 AC1) と、割合の更新が、スクリーンリーダの利用者に届かない
- **推奨アクション**:
  - `CenterBanners` に、`live` がある間は常に置く sr-only の `role="status"` を 1 つ持たせる。帯が出たとき・文が変わったときに、`SessionAttentionAnnouncer` と同じ形 (`seq` で span を入れ替える) で文を書き込む
  - 見える帯の要素からは `role="status"` を外す (alert は今のまま)
  - テストは、常に置いた live region に文が入ることを固定する
- **根拠**: WCAG 2.1 SC 4.1.3。research R-05 (リポジトリで既に採っている形)
- **scope 根拠**: touched file `CenterBanners.tsx` の中で直せる

### [Medium] 思考の印に読み上げが無く、data-model §4 の「読み上げは出たときの 1 回」と食い違う (M-002) (scope: feature)

- **観察**:
  - data-model.md:234 は「`role="status"` を重ねて毎秒読ませない (見た目だけを更新し、**読み上げは出たときの 1 回**)」と定めている
  - 一方、`thread.aui.tsx:566-569` のコメントは「live region にしない」と書き、実装 (`:570-580`) に読み上げの経路は無い
  - `LivePane.progress.test.tsx:290-292` は、live region が無いことを固定している
  - 結果として、思考中に入ったことを支援技術に知らせる経路が、本 PR の中に 1 つも無い
- **同種事象探索**: `LiveThinkingIndicator` で 3 件 (`thread.aui.tsx:269,552,570`)。tool の経過時間 (`tool-result-marks.tsx:56-60`) は「毎秒読み上げない」だけを決めていて、出たときの読み上げの規定は無いので、食い違いは無い
- **リスク/影響**: WCAG 4.1.3 (待ちの状態・処理の進み具合は status message にあたる)。正本 (data-model) と実装・テストが食い違ったままでは、読み上げを入れるかどうかが決まらない
- **推奨アクション**: 次のどちらかで正本と実装を揃える
  - (a) 出たときに 1 回だけ、固定の文言 (「思考中」。数は入れない) を常に置く polite の live region に書く。M-001 の live region と共有してよい
  - (b) 読み上げないと決めるなら、data-model §4 の字面を直し、理由 (composer の側の実行中の表示で足りるなど) を書く
- **根拠**: WCAG 2.1 SC 4.1.3。data-model §4 (正本)
- **scope 根拠**: `thread.aui.tsx` と data-model は本 PR の範囲

### [Medium] tabpanel が Tab 順に入らず、中身に focusable が無い「概要」「使用量」で APG の Tabs pattern の Tab の動きにならない (M-003) (scope: feature)

- **観察**:
  - `RightPanel.tsx:151-160` の `role="tabpanel"` には `tabIndex` が無い
  - 中身の `OverviewTab` (`dl` だけ) と `UsageTab` (`dl` / `p` / `ul` だけ) には focusable な要素が無い
  - そのため、タブから Tab を押すと、パネルを飛ばして `aside` の外へ出る
  - FR-017 は「tablist は WAI-ARIA APG の Tabs pattern に従わなければならない」と定めている。APG は、パネルの最初の中身が focusable でないとき tabpanel に `tabindex="0"` を置き、Tab で tabpanel に入るとしている
  - 選ばれていないタブの `aria-controls` (`:132`) は、描いていないパネルの id を指している (今の描き方では、選ばれたパネルしか DOM に無い)
- **同種事象探索**: `role="tabpanel"` を shell と session で探し、1 件 (`RightPanel.tsx:153`)
- **リスク/影響**: キーボードだけの利用者は、Tab でパネルの中身に入れない。スクリーンリーダの利用者はフォーカスモードのまま中身を読めず、ブラウズモードに切り替える必要がある。SC-007 の「APG に従う」の範囲が、矢印キーと roving だけで止まっている
- **推奨アクション**:
  - tabpanel に `tabIndex={0}` を足す (focus-visible の指標は既定の outline で足りる)
  - `RightPanel.tabs.test.tsx` に「選んだタブから Tab で tabpanel にフォーカスが入る」を足す
  - `aria-controls` は選ばれたタブにだけ付けるか、パネルを全部描いて `hidden` にする
- **根拠**: WAI-ARIA APG Tabs pattern (Keyboard Interaction の Tab と、Roles/States の tabpanel の tabindex)。spec FR-017
- **scope 根拠**: touched file `RightPanel.tsx` の中で直せる

### [Medium] コントラストを機械で見る経路が無く、H-001 / H-002 が検出されないまま通る (M-004) (scope: feature)

- **観察**:
  - 本 PR の vitest-axe の呼び出しは、すべて `'color-contrast': { enabled: false }` で走っている (jsdom は計算できないため)。例: `CenterBanners.test.tsx:38`・`RightPanel.tabs.test.tsx:134,182`
  - リポジトリ全体では、同じ無効化が 18 件・13 ファイル
  - `e2e/` に axe の呼び出しは 0 件
  - quickstart.md / quickstart-results.md にも、コントラストや読み上げを確かめる手順は 0 件
- **同種事象探索**: `'color-contrast': \{ enabled: false \}` で 18 件・13 ファイル。`axe|color-contrast` で `e2e/` を探して 0 件
- **リスク/影響**: 本 PR が足した帯・目盛り・思考の印のコントラストは、どのテストでも検出できない。H-001 と H-002 は、レビューを通らなければそのまま main に入る
- **推奨アクション**: 次のどちらかを入れる
  - quickstart の V-4 に、light / dark の両方で帯・目盛り・思考の印・tool の経過時間のコントラストを確かめる手順を 1 行足す
  - AD-038 の E2E ハーネス (計量を流さなくても、帯を描く fixture を置ける場面) で、`@axe-core/playwright` の color-contrast をシェルの帯に当てる
- **根拠**: reviewer-base の H の観点 (指摘を検出できるテストの有無)
- **scope 根拠**: quickstart は本 spec の範囲。E2E のハーネスに手を入れる場合は system scope

### [Low] 使用量のタブの見出しが h3 で、右のペインに h2 が無く、見出しの構造では中央の題の下位に見える (L-001) (scope: feature)

- **観察**: `UsageTab.tsx:142-145` の `<h3>モデルごとの内訳</h3>` は `aside` の中の唯一の見出し。DOM の順では、中央の `h2` (`CenterHeader.tsx:98`。セッションの題) の直後の下位の見出しとして読まれる
- **同種事象探索**: `<h[1-6][ >]` で renderer に 17 件。`aside` の中は `UsageTab.tsx:143` の 1 件だけ
- **リスク/影響**: WCAG 1.3.1。見出しで移動する利用者に、内訳がセッションの題の小見出しに見える。`aside` の名前 (「セッションの詳細」) で救われる面はある
- **推奨アクション**: パネルの中の見出しを `h2` にするか、tabpanel の先頭にタブ名の sr-only の `h2` を置き、内訳を `h3` のままにする
- **根拠**: WCAG 2.1 SC 1.3.1
- **scope 根拠**: touched file の中で直せる

### [Low] tool の経過時間が「12秒」だけで、何の時間かを支援技術に伝えていない (L-002) (scope: feature)

- **観察**: `tool-result-marks.tsx:56-60` は `TOOL_RESULT_LABELS.toolElapsed` (`chat/labels.ts:147-148`。`{n}秒` / `{m}分{s}秒`) を、ラベルを付けずに見出しの右端に出している
- **同種事象探索**: `tool-result-elapsed` で 1 件 (呼び出しは 7 か所。`agent-plan`・`code-diff`・`subagent` ×2・`terminal-block`・`todo-list`・`tool-fallback`)
- **リスク/影響**: WCAG 1.3.1 / 2.4.6 (軽微)。読み上げでは「Bash 12秒」となり、経過時間か、タイムアウトか、所要時間かが分からない
- **推奨アクション**: span の前に `<span className="sr-only">経過 </span>` を置くか、文言を「経過 {n}秒」にする (文言は `chat/labels.ts` に置く)
- **根拠**: WCAG 2.1 SC 1.3.1
- **scope 根拠**: touched file の中で直せる

### [Low] 目盛りの 80% 以上の注意が色と太さだけで、`aria-valuetext` にも出ない (L-003) (scope: feature)

- **観察**: `ContextCostMeter.tsx:53-58` は、注意を `text-amber-800 font-medium` と `text-muted-foreground` の違いだけで表している。`aria-valuetext` (`:49`。`contextViewOf` の `text`。`:115-118`) は注意でも同じ文
- **同種事象探索**: `data-tone` で shell に 2 件 (`ContextCostMeter.tsx:52`・`CenterBanners.tsx:153`)。帯の 2 つの見た目は文言も違う (「近づいています」/「達しました」) ので、色だけには頼っていない
- **リスク/影響**: WCAG 1.4.1 (軽微。割合の数は文字で出ているので、情報そのものは失われない)。US-3 AC2 の「注意の見た目」が、色覚特性のある利用者と支援技術の利用者には別の信号として届かない
- **推奨アクション**: 注意のときに `aria-hidden` のアイコン (例: `TriangleAlertIcon`) を添え、`aria-valuetext` に「(注意)」を足す (文言は `CONTEXT_COST_METER_LABELS`)
- **根拠**: WCAG 2.1 SC 1.4.1
- **scope 根拠**: touched file の中で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `text-foreground/(30\|35\|40\|45\|50\|55)\b` (renderer、テストを除く) | 22 | `thinking-indicator.tsx:20,37` (呼び出し `thread.aui.tsx:269,552,570-580`。本 PR の経路 2)。ほかは既存か vendored: `data-table.tsx:39,40,43,55,64,72`・`command-palette.tsx:150,166,173,238`・`conversation-search.tsx:70,83`・`error-state.tsx:91`・`empty-state.tsx:92`・`file-tree.tsx:69,76`・`loading-state.tsx:56`・`surfaces.tsx:20` |
| H-002 | `bg-destructive/10` | 5 | `CenterBanners.tsx:90`・`CenterBanners.tsx:157` (本 PR 2)。既存: `LivePane.tsx:323`・`thread.aui.tsx:795`・`code-diff.aui.tsx:64` |
| M-001 | `role="status"\|role=\{` (features、テストを除く) | 15 | `CenterBanners.tsx:151` (本 PR 1)。既存: `LivePane.tsx:195,343,410,438`・`LaunchDialog.tsx:548,628`・`PresetPanel.tsx:193`・`LaunchDialogHost.tsx:66`・`SessionListScreen.tsx:874,1162`・`WorkspaceFoldersScreen.tsx:483,595,609`・`RuntimeListScreen.tsx:205` |
| M-002 | `LiveThinkingIndicator` | 3 | `thread.aui.tsx:269,552,570` |
| M-003 | `role="tabpanel"` (shell / session) | 1 | `RightPanel.tsx:153` |
| M-004 | `'color-contrast': \{ enabled: false \}` / `e2e/` の `axe\|color-contrast` | 18 | 13 ファイル (`CenterBanners.test.tsx:38`・`RightPanel.tabs.test.tsx:134,182` ほか) / e2e は 0 |
| L-001 | `<h[1-6][ >]` (renderer) | 17 | `UsageTab.tsx:143` (`aside` の中 1) |
| L-002 | `tool-result-elapsed` | 1 | `tool-result-marks.tsx:57` (呼び出し 7) |
| L-003 | `data-tone` (shell) | 2 | `ContextCostMeter.tsx:52`・`CenterBanners.tsx:153` |

## Verdict

- Critical: 0
- High: 2
- Medium: 4
- Low: 3
