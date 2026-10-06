# a11y-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T12:00:00+09:00
**Reviewer**: a11y-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-017: 過去のセッションの区画の検索欄・件数の `role="status"`・グループの `role="group"`・過去の行のツールチップ (`SessionListScreen.tsx` / `thread-list.aui.tsx`)
  - FR-003 / FR-005: 会話内検索のバー・中央のヘッダの検索ボタン・`::highlight()` の強調 (`conversation-search.tsx` / `ConversationSearchBar.tsx` / `ConversationSearchProvider.tsx` / `main.css`)
  - FR-006 / FR-007: Command palette (Dialog・combobox / listbox・`aria-activedescendant`・閉じた後のフォーカス) (`CommandPalette.tsx` / `command-palette.tsx`)
  - FR-008: 新しい空の状態 4 つ (`EmptyState`)
  - FR-013: プリセットの欄の回数の表示 (`PresetPanel.tsx`)
  - FR-014: composer の名前と placeholder の日本語化 (WCAG 3.1.2。`thread.aui.tsx:649-656`)
  - SC-003 (palette の axe 違反 0)・SC-004 (空の状態)・SC-008 (ランドマーク 0・フォーカスでツールチップ)
- touched files に該当する charter / Confirmation:
  - ui charter「業務ルール / 不変条件」: assistant-ui の design system に乗り、独自トークンを増やさない (Principle XIII)。日本語で破綻しない (Principle VIII)
  - ui charter「面の状態」: focus はシェル (`useShellFocus`) だけが書く。palette が実行したセッションの候補の行き先は `focusCenter`
  - Constitution Principle VIII の Verification の Manual 検証者が a11y-reviewer (`constitution.md:638`)
  - AD-037 Decision (IME の `isComposing` / 229 のガード)。palette・会話内検索・検索欄のキーの処理が該当する
  - AD-045 Decision 2 (文言は `labels.ts` に置く)。下で勧める sr-only の文言の置き場がこれに当たる
  - AD-046 Confirmation (spec 013 の SC・quickstart V-3 の実機の目視)
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer が持つ)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer が持つ。id を DOM の id やセレクタに入れない件は security の観点)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が持つ
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が持つ (a11y の観点で accepted ADR の Decision に反するものは見つからなかった)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が持つ
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が持つ
- G. optional reviewer 範囲: Critical:0 High:1 Medium:4 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

O-3 は renderer に 3 つの「探す」UI を足し、プリセットの欄に記録の表示を足す。
- Command palette: Radix の Dialog の中に、registry の element に手を入れた `command-palette.tsx` を置く
- 会話内検索: 中央のヘッダのボタンと、その下の検索のバー (`conversation-search.tsx`)。強調は CSS Custom Highlight API で掛ける
- Thread search: 過去のセッションの区画の上端に固定した検索欄
- O-7 の義務として、グループを `div role="group"` にし、過去の行にツールチップを付けた。composer の名前と placeholder も日本語にした

本 reviewer は次を Read で直接確かめた。
- `reviewers.yml` で対象の UI ファイル: CommandPalette / command-palette / conversation-search / ConversationSearchBar / ConversationSearchProvider / CenterHeader / CenterPane / SessionListScreen / Sidebar / PresetPanel / LaunchDialog / thread.aui / thread-list.aui
- テーマのトークン: `main.css`・`surfaces.tsx`

既定のテーマは light である (`stores/ui.ts:118-123` の `toggleTheme`。初期値は `dark: false`)。コントラストの値は、トークンの oklch を sRGB に直し、アルファを合成して計算した。

次のファイルは指摘の対象にしない (`reviewers.yml:68-85` の `exclude_patterns`)。
- `components/ui/dialog.tsx` の `aria-modal` の追加 (vendored の shadcn)
- `empty-state.tsx` (vendored)

IME のガードは 4 か所すべてにあり、どれも `isComposing` と `keyCode === 229` の両方を見る。
- `CommandPalette.tsx:79-84`
- `command-palette.tsx:126`
- `ConversationSearchProvider.tsx:143-147,164-177`
- `SessionListScreen.tsx:1039-1042`

## Findings

### [High] palette の現在の候補の指標が背景の 6% の濃淡 (1.14:1) だけで、入力欄も `outline-none`。ダイアログの中に見えるフォーカス指標が無い (H-001) (scope: feature)

- **観察**:
  - 現在の候補 (`selected`) を他と区別するのは `bg-foreground/[0.06]` の 1 つだけ (`src/renderer/src/components/assistant-ui/elements/command-palette.tsx:202-209`、該当は :205)。枠線・outline・太さ・印のどれも変わらない
  - 下地は `floating` (`surfaces.tsx:9`) = `bg-background`。light は `oklch(1 0 0)` (`main.css:87`)、dark は `--popover` (`main.css:131`)
  - 計算した比: light は 白 vs #f0f0f0 で **1.14:1**、dark は #18181b vs #262628 で **1.16:1**
  - DOM のフォーカスは combobox の input に残る (`aria-activedescendant`)。その input は `outline-none` で、代わりの指標が無い (`command-palette.tsx:166`)
  - option は `tabIndex={-1}` (`:259`)。したがって、キーボード利用者が ↑↓ で動かす「今の位置」を見る手段はこの 1.14:1 の濃淡しかない
  - hover は `hover:bg-foreground/[0.03]` (`:207`) で、hover は現在の候補 (`activeIndex`) を動かさない。指している行と Enter で実行される行が、ほぼ見えない 2 種類の濃淡で並ぶ
  - Windows の Contrast themes (forced colors) では背景色がシステムの色に置き換わる。背景色だけの指標はそこでは完全に消える (plan の Target Platform は Windows 11)
- **同種事象探索**: Grep `bg-foreground/\[0\.0\d\]` を `src/renderer/src` に掛けて 12 件。
  - 状態 (選択・現在) の指標に使っているのは `command-palette.tsx:205` の 1 件だけ
  - 残りは hover か下地: `command-palette.tsx:207`・`surfaces.tsx:11,14,20`・`WorkspaceFoldersScreen.tsx:528`・`data-table.tsx:47,52,55` と `file-tree.tsx:63` (この 2 つは vendored で対象外)
  - `ResolutionScreen.tsx:54` は仮実装の画面で対象外 (`reviewers.yml:65-67`)
  - 先例が 2 つある。どちらも同じ欠陥 (1.04:1) を a11y の High として直している: `thread-list.aui.tsx:352-369` (H-008 / H-202。2px の `bg-foreground` の帯で 19:1 にした) と `SessionListScreen.tsx:1232-1238` (H-003)
- **リスク/影響**:
  - 晴眼のキーボード利用者は、↑↓ で選んだ候補がどれかをほぼ見分けられない。Enter で意図しない操作が走りうる (セッションを開く・サイドバーを畳むなど)
  - palette はキーボード操作のための部品 (US-3「キーボードだけで操作を呼び出す」) なので、中核の用途が損なわれる
- **推奨アクション**: 現在の候補に 3:1 以上の、背景色に依らない指標を足す。既存のトークンだけを使う (Principle XIII)。
  ```tsx
  // command-palette.tsx:202-209
  const className = cn(
    "flex items-center gap-2 rounded-xl px-2 py-1.5 text-start transition-colors",
    selected
      ? "bg-accent font-medium outline-2 -outline-offset-2 outline-ring" // --ring は白に対し 4.83:1 (main.css:117)
      : onRun ? "hover:bg-foreground/[0.03]" : undefined,
  );
  ```
  - outline は forced colors でも残る。`thread-list.aui.tsx:379` と同じ形の `before:` の帯でもよいが、帯も背景色なので forced colors では消える。outline を勧める
  - 直したら、Playwright で現在の候補の矩形の見た目を確かめる手段を足す (M-004)
- **根拠**:
  - WCAG 2.1 SC 2.4.7 Focus Visible (AA)
  - SC 1.4.11 Non-text Contrast (AA。状態の指標は 3:1)
  - WAI-ARIA APG Combobox パターン (`aria-activedescendant` では現在の option の見た目がフォーカスの指標になる)
  - 本リポジトリの先例: `thread-list.aui.tsx:352-369`・`SessionListScreen.tsx:1232-1238`
  - ui charter「業務ルール」(独自トークンを増やさない)
- **scope 根拠**: `command-palette.tsx` は本 PR が取り込んで手を入れた element で、touched files にある (`eslint.config.mjs:601-607` に手書きの element として登録済み)。

### [Medium] 新しい UI の文字のコントラストが 4.5:1 に届かない (placeholder・palette のグループ名・種別の札) (M-001) (scope: feature)

- **観察** (light は既定のテーマ。括弧の中は dark):

  | 箇所 | 指定 | 下地 | 比 |
  |---|---|---|---|
  | palette の入力欄の placeholder (この入力欄の唯一の見える名前。`paletteInput` は aria-label と同じ文言) | `placeholder:text-foreground/30` (`command-palette.tsx:166`) | 白 | **2.04:1** (2.63:1) |
  | palette のグループ名「操作」「セッション」 | `text-foreground/25` 11px (`command-palette.tsx:195`) | 白 | **1.79:1** (2.21:1) |
  | palette の「esc」の案内 | `text-foreground/35` (`:173`) | `field` | 2.33:1 |
  | palette の種別の札「稼働中 / 過去」(FR-007 が稼働中と過去を見分ける唯一の手がかり) | `text-muted-foreground` 11px on `field` (`:221-227`) | #f5f5f5 / 現在の候補では #e7e7e7 | **4.44:1 / 3.90:1** |
  | palette の補足 (`detail`) | `text-muted-foreground` 11px (`:215`) | 現在の候補の #f0f0f0 | 4.24:1 |
  | 会話内検索の placeholder「語を入力」 | `placeholder:text-foreground/30` (`conversation-search.tsx:83`) | `paper` の白 | **2.04:1** (2.63:1) |
  | 過去の区画の検索欄の placeholder | `placeholder:text-muted-foreground` on `bg-input` (`SessionListScreen.tsx:853`) | `--input` = oklch(0.92) #e4e4e7 (`main.css:103`) | **3.81:1** (dark 5.17:1) |
  | composer の placeholder「メッセージを入力」(本 PR は文言を変えた。色は前からのもの) | `placeholder:text-muted-foreground/60` (`thread.aui.tsx:651`) | `--color-card` の白 | 2.32:1 |

- **同種事象探索**:
  - Grep `placeholder:text-[a-z/0-9\-\[\]\.]+` (`src/renderer/src`) で 6 件
    - 基準を満たさない: `command-palette.tsx:166`・`conversation-search.tsx:83`・`SessionListScreen.tsx:853`・`thread.aui.tsx:651`
    - 満たす: `components/ui/input.tsx:10`・`textarea.tsx:9` (vendored。`bg-transparent` なので 4.83:1)
  - Grep `text-foreground/(2|3)\d\b` で 13 件
    - 対象: `command-palette.tsx:150,166,173,195`・`conversation-search.tsx:70,83`
    - 対象外: `empty-state.tsx:92`・`data-table.tsx:39,40,43`・`file-tree.tsx:68,69,76` (vendored)
- **リスク/影響**:
  - 弱視の利用者は palette の入力欄が何をするか (唯一の見える名前が 2.04:1) を読めない
  - グループの区切りと種別の札 (稼働中 / 過去) も読みにくい
  - vitest-axe は `color-contrast` を切っているので、テストでは検出されない (M-004)
- **推奨アクション**:
  - `command-palette.tsx:166` と `conversation-search.tsx:83` を `placeholder:text-muted-foreground` にする (白 4.83:1・dark の popover 6.7:1)
  - `command-palette.tsx:195` を `text-muted-foreground` にする
  - 種別の札は `field` の下地を外すか、`text-foreground/70` 相当にする。H-001 で現在の候補の背景を `bg-accent` にするなら、その上で 4.5:1 になることを確かめる
  - `SessionListScreen.tsx:853` は既存の shadcn の `Input` (`components/ui/input.tsx:10`。`bg-transparent dark:bg-input/30`) と同じ下地にする (Principle XIII の element 優先)
  - composer (`thread.aui.tsx:651`) の `/60` を外すのは同じ PR で直せる (1 語の変更)。前からある色なので、直さないなら持ち主を roadmap に書く
- **根拠**: WCAG 2.1 SC 1.4.3 Contrast (Minimum) (AA。placeholder も情報を運ぶ文字として対象)、SC 1.4.11 (検索のアイコン `:150` / `conversation-search.tsx:70` は装飾の `aria-hidden` なので参考)。
- **scope 根拠**: 表のファイルはすべて touched files にある。composer の色だけは前からあるが、同じ行を本 PR が変えた。

### [Medium] 会話内検索の入力欄にフォーカスの指標が無い (`outline-none`。囲みに `focus-within` も無い) (M-002) (scope: feature)

- **観察**:
  - 入力欄は `outline-none` で、代わりの指標が無い (`conversation-search.tsx:83`)
  - 囲み (`:62-67`) は `paper` (`bg-background border border-border/60`) のままで、`focus-within` の変化も無い
  - バーには、入力欄・前へ・次へ・閉じるの 4 つのフォーカス先がある。ボタンは `ghostButton` の `focus-visible:ring-1 ring-ring` を持つ (`surfaces.tsx:20`) が、入力欄に戻ると指標はキャレットだけになる
  - 同じ PR の過去の区画の検索欄は `focus-visible:ring-[3px]` を持つ (`SessionListScreen.tsx:853`)。同じ種類の欄で扱いが揃っていない
- **同種事象探索**: Grep `outline-none` (`src/renderer/src`。`components/ui` を除く) で 17 件。
  - 入力欄で代わりの指標が無いもの: `conversation-search.tsx:83`・`command-palette.tsx:166` (H-001 で扱う)
  - composer の `thread.aui.tsx:651,1150` は囲みの `focus-within:border-border` (`:646`) が代わりだが、#e4e4e7 と白で 1.27:1。前からのもので本 PR は変えていない (system)
  - 残り: 代わりの指標を持つもの (`thread-list.aui.tsx:289`・`CenterPane.tsx:58`・`surfaces.tsx:20`・`SessionListScreen.tsx:853`・`WorkspaceFoldersScreen.tsx:281,557` は `focus-visible:ring`)、フォーカスを受けない内容の領域 (`tool-fallback.aui.tsx:198`)、vendored のもの (`tool-group.aui.tsx`・`reasoning.tsx`・`attachment.aui.tsx`・`empty-state.tsx`・`error-state.tsx`)
- **リスク/影響**: Tab で入力欄に戻ったとき、晴眼のキーボード利用者には今どこにフォーカスがあるかが見えにくい。
- **推奨アクション**: 囲みに `focus-within:ring-1 focus-within:ring-ring` (または `has-[input:focus-visible]:ring-2`) を足す。トークンは既存の `--ring` (4.83:1)。
- **根拠**: WCAG 2.1 SC 2.4.7 Focus Visible (AA)。
- **scope 根拠**: `conversation-search.tsx` は本 PR が取り込んで手を入れた element (touched)。

### [Medium] palette は候補の件数も 0 件も読み上げない (他の 2 つの検索は `role="status"` で読み上げる) (M-003) (scope: feature)

- **観察**:
  - 0 件の表示は `EmptyState` で出すが、live region ではない (`CommandPalette.tsx:184-189`、`command-palette.tsx:283-285`)
  - palette の中に `role="status"` / `aria-live` が 1 つも無い。Grep `aria-live` で、renderer の本番コードにある 7 件のうち palette の 2 ファイルは 0 件
  - 語を入れると `activeIndex` は 0 に戻る (`CommandPalette.tsx:190-194`)。先頭の候補の id は `${prefix}-opt-0` のまま変わらないので、`aria-activedescendant` が変化せず読み上げが起きないことがある
  - 0 件になると、`aria-expanded="false"` と `aria-activedescendant` が外れるだけ (テストで確かめている: `CommandPalette.test.tsx:466-473`)
  - 同じ PR の他の 2 つの検索は件数を `role="status" aria-live="polite"` で読み上げる (`conversation-search.tsx:85-91`・`SessionListScreen.tsx:873-879`)
- **同種事象探索**: Grep `aria-live` (`src/renderer/src`) で 7 件 (本番 6・テスト 1)。O-3 の検索の UI 3 つのうち、件数の live region が無いのは palette だけ。
- **リスク/影響**: スクリーンリーダーの利用者は、入れた語で候補が何件になったか、0 件になったかが分からない。「一致する操作はありません」は読まれない。
- **推奨アクション**:
  - `PaletteBody` に、常にマウントする sr-only の `<p role="status" aria-live="polite">` を置く
  - 中身は、語が空でなければ「{n} 件の候補」、0 件なら `paletteNone`
  - 文言は `PALETTE_LABELS` に足す (AD-045 Decision 2)
  - 常にマウントして中身だけを差し替えるのは、`SessionListScreen.tsx:869-872` の注記と同じ形
- **根拠**: WCAG 2.1 SC 4.1.3 Status Messages (AA。検索結果の件数は Understanding の典型例)。
- **scope 根拠**: `CommandPalette.tsx` は本 PR の新設 (touched)。

### [Medium] Windows の Contrast themes (forced colors) で、新しいフォーカス指標と選択の指標が消える。renderer に forced-colors の扱いが 0 件 (M-005) (scope: system)

- **観察**:
  - Tailwind は 4.3.3 (`package.json:75`)。v4 の `outline-none` は `outline-style: none`
  - forced colors のモードでは `box-shadow` が `none` に強制されるので、`ring` (box-shadow) の指標は消える
  - 本 PR の UI のうち影響を受けるもの:
    - 過去の区画の検索欄の `focus-visible:ring-[3px] focus-visible:outline-none` (`SessionListScreen.tsx:853`)
    - 会話内検索のボタンの `ghostButton` (`surfaces.tsx:20`。`conversation-search.tsx:99,108,120` で使う)
    - palette の現在の候補の背景色 (H-001)
  - 過去の行の Trigger (`thread-list.aui.tsx:289`) も同じ形。こちらは前からある
- **同種事象探索**: Grep `forced-colors|forced-color` (`src/renderer/src`) で **0 件**。Grep `focus-visible:ring` は上の M-002 の列挙と重なる。
- **リスク/影響**: 対象のプラットフォームは Windows 11 (plan の Technical Context)。Contrast themes を使う利用者には、Tab で移っても今どこにいるかが見えない。
- **推奨アクション**:
  - バンドルされる `main.css` (本 PR が触った) の層の外に、次の規則を置く。層の外の規則は Tailwind の `@layer utilities` に勝つ
    ```css
    @media (forced-colors: active) { :focus-visible { outline: 2px solid CanvasText; outline-offset: 2px; } }
    ```
  - H-001 の outline の指標と合わせれば、palette の現在の候補も残る
  - アプリ全体の基線なので、別の spec で扱うなら roadmap に持ち主を書く
- **根拠**: WCAG 2.1 SC 2.4.7 (AA)、CSS Color Adjustment Module Level 1 (forced colors のモードで強制されるプロパティ)。
- **scope 根拠**: 原因は renderer 全体の focus ring の書き方 (前からあるもの) で、本 PR の新しい UI がそれを継いでいる。

### [Low] 会話内検索の「現在以外の一致」の強調が下地に対し 1.29:1 (light) / 1.89:1 (dark) (L-001) (scope: feature)

- **観察**: `::highlight(closta-search)` は `color-mix(in oklab, var(--chart-4) 45%, transparent)` (`main.css:159-162`)。
  - light: 白の上で #FFDF8C 相当になり、白に対し 1.29:1
  - dark: `--chart-4` が紫 (`main.css:147`) になり、#09090b の上で #512B75 相当。1.89:1
  - 強調の中の文字は 10:1 以上で読める。現在の一致は前景と背景を反転させていて区別できる (`:164-167`)
- **同種事象探索**: Grep `::highlight` (`src/renderer/src`) で 2 件。どちらも `main.css` で、問題は `:159` だけ。
- **リスク/影響**: 弱視の利用者は、現在の一致以外の箇所を見落としうる。厳密な基準違反ではない (1.4.11 を強調に当てるかは解釈が分かれる)。
- **推奨アクション**: `::highlight(closta-search)` に `text-decoration: underline` (`::highlight` で使えるプロパティ) を足し、色以外の手がかりにする。または混ぜる割合を上げる。
- **根拠**: WCAG 2.1 SC 1.4.11 (参考)、SC 1.4.1 Use of Color。
- **scope 根拠**: `main.css` は touched。

### [Low] 会話内検索の移動のたびに長い距離を smooth scroll する。`prefers-reduced-motion` で止める手段が無い (L-002) (scope: feature)

- **観察**:
  - transcript のスクローラは無条件に `scroll-smooth` (`thread.aui.tsx:223,512`)
  - 本 PR の navigator は、Enter のたびに `scrollIntoView({ block: "center" })` と `scrollToIndex` を呼ぶ (`:285,394,400`)
  - behavior を指定しないので CSS の smooth が効き、数千メッセージの間を動きながら移る
- **同種事象探索**: Grep `scroll-smooth|scroll-behavior|reduced-motion` (`src/renderer/src`) で 2 件 (`thread.aui.tsx:223,512`)。`motion-reduce:` による打ち消しは 0 件。
- **リスク/影響**: 前庭障害のある利用者に、操作のたびに大きな動きが出る (SC 2.3.3 は AAA なので Low)。
- **推奨アクション**: 2 か所を `motion-safe:scroll-smooth` にする (または `motion-reduce:scroll-auto` を足す)。
- **根拠**: WCAG 2.1 SC 2.3.3 Animation from Interactions (AAA)。
- **scope 根拠**: `thread.aui.tsx` は touched。

### [Low] 過去の行のツールチップが行の名前と同じ文を `aria-describedby` で再び読ませる (L-003) (scope: feature)

- **観察**:
  - `renderTooltip` は全行に題の全文を返す。切り詰めていない行も同じ (`SessionListScreen.tsx:945-948`)
  - Radix の Tooltip は、開いている間 Trigger に `aria-describedby` を付ける
  - Provider の `delayDuration` は 0 (`components/ui/tooltip.tsx:8`) なので、フォーカスと同時に開く
  - Trigger の名前には題がすでに入っている (`thread-list.aui.tsx:308-318`)。数百行のどれにフォーカスしても、題が 2 回読まれる (`thread-list.aui.tsx:386-392`)
- **同種事象探索**: Grep `renderTooltip` で、渡しているのは `SessionListScreen.tsx:333,1417` と稼働中の一覧 (O-7 の前からの形)。
- **リスク/影響**: スクリーンリーダーの読み上げが冗長になる。機能は損なわれない。
- **推奨アクション**: 題が切り詰められたとき (`scrollWidth > clientWidth`) だけツールチップを渡す。そうしないなら、冗長を受け入れる理由を注記に書く。
- **根拠**: WCAG 2.1 SC 4.1.2 (名前と説明の適切さ)、ARIA の「不要な ARIA を被せない」。
- **scope 根拠**: `SessionListScreen.tsx` / `thread-list.aui.tsx` は touched。

### [Low] 会話内検索では、スクリーンリーダーの利用者が一致の中身を得られない (件数と位置しか読まれない) (L-004) (scope: feature)

- **観察**:
  - 読み上げは `status` の「{i} / {n} 件」だけ (`conversation-search.tsx:85-91`)
  - 強調 (CSS Custom Highlight) はアクセシビリティツリーに出ない
  - フォーカスは入力欄に残る
  - registry の原本にあった一致の前後の文 (`before` / `match` / `after`) は外した (`conversation-search.tsx:12-13`)
- **同種事象探索**: 該当は会話内検索の 1 か所だけ。
- **リスク/影響**: 支援技術の利用者は、どの文に当たったかを知るには入力欄を離れて transcript を辿るしかない。
- **推奨アクション**: `status` に、現在の一致の役割 (user / assistant) と前後の数語を sr-only で足す (文言は `CONVERSATION_SEARCH_LABELS`)。または、移った先のメッセージへフォーカスを移す操作を足す。O-9 で扱うなら roadmap に書く。
- **根拠**: WCAG 2.1 SC 1.3.1 / 4.1.3 (参考)。
- **scope 根拠**: touched の element と provider で直せる。

### [Low] Thread search の検索欄と件数の live region が `aria-busy` の中にある (L-005) (scope: feature)

- **観察**:
  - 画面の全体の `div` が `aria-busy={sessions.loading}` を持つ (`SessionListScreen.tsx:1110-1113`)
  - 本 PR が、その内側に検索欄と件数の `role="status"` を置いた (`:1125-1132`・`:873-879`)
  - 検索は取得中でも使える設計 (data-model §1 の `search-empty`「取得中でも出す」)
- **同種事象探索**: Grep `aria-busy` (`SessionListScreen.tsx`) で `:1113` の 1 件。
- **リスク/影響**: ARIA 1.2 は「busy の領域の live region の通知は busy が外れるまで待つべき」としている。WSL の取得 (実測 1.8 秒以上) の間に打った語の件数の読み上げが遅れうる。読み上げの間は支援技術ごとに違う。
- **推奨アクション**: `aria-busy` を一覧の部分 (スクロールする領域 `:1135`) に移し、検索欄を外に出す。
- **根拠**: WAI-ARIA 1.2 `aria-busy`。
- **scope 根拠**: `SessionListScreen.tsx` は touched。

### [Medium] (H) コントラストとフォーカスの見えを確かめる経路が自動にも手順にも無い (M-004) (scope: feature)

- **観察**:
  - 本 PR の vitest-axe の 4 本は、すべて `color-contrast` を切っている (jsdom は色を計算できない)
    - `CommandPalette.test.tsx:315`
    - `ConversationSearch.test.tsx:622,628`
    - `SessionListScreen.test.tsx:1961`
    - `PresetPanel.test.tsx:144`
  - quickstart V-3 (`quickstart.md:29-36`) に、次の項目が無い: palette の現在の候補の見え、placeholder とグループ名のコントラスト、入力欄のフォーカスの見え、Windows の Contrast themes での見え
  - そのため H-001 / M-001 / M-002 / M-005 を検出するテストも手順も無い
  - V-3 は未実施 (`quickstart-results.md:63-66`)
- **同種事象探索**: Grep `axe\(|toHaveNoViolations` (対象の 4 つのテスト) で 8 件。どれも `color-contrast` を切っている。
- **リスク/影響**: 色とフォーカスの見えの退行は CI でも人手の手順でも捕まらない。直した後に戻っても気づけない。
- **推奨アクション**:
  - V-3 に次の項目を足す: 「palette で ↑↓ の現在の候補が見分けられる」「各入力欄にフォーカスの指標が出る」「Windows の Contrast themes で同じ 2 点」
  - 加えて、E2E (AD-038 のハーネス) で axe-core を `page.addScriptTag` で注入し、palette を開いた状態と検索のバーを開いた状態で `color-contrast` を有効にして流す
  - axe-core は `node_modules/axe-core` にあり (vitest-axe の依存)、新しい npm の依存は要らない
- **根拠**: Constitution Principle VIII の Verification (Manual の検証者に a11y-reviewer。`constitution.md:638`)、Principle XI (観測できる垂直スライス)。
- **scope 根拠**: `quickstart.md` と `e2e/` は本 PR の範囲で直せる。

### [Low] (H) 本 PR が手を入れた 2 つの element が、a11y / ux reviewer の起動条件に入っていない (L-006) (scope: system)

- **観察**:
  - `reviewers.yml:52-53` は「新しい手書きの element を足したらここにも足す」と定めている
  - しかし a11y-reviewer の `auto_invoke_patterns` (`:54-64`) にも ux-reviewer の (`:102-114`) にも、`command-palette.tsx` / `conversation-search.tsx` が無い
  - 同じ 2 ファイルは、本 PR で `eslint.config.mjs:601-607` の手書きの element の一覧には足されている
  - 本 PR では `features/shell/**` などで起動したが、この 2 つの element だけを変える後続の PR では a11y / ux reviewer が起動しない
- **同種事象探索**: Grep `command-palette|conversation-search` (`eslint.config.mjs`・`reviewers.yml`) で 4 件。すべて `eslint.config.mjs` で、`reviewers.yml` は 0 件。
- **リスク/影響**: H-001 / M-001 / M-002 を直した後の退行が、pr-gate の a11y の観点から外れる。
- **推奨アクション**: `reviewers.yml` の a11y-reviewer と ux-reviewer の `auto_invoke_patterns` に、2 つのパスを足す (plan は「reviewers.yml は変えない」としているが、根拠は database-reviewer の起動の話に限られる)。
- **根拠**: `reviewers.yml:52-53` の規則、AGENTS.md「reviewer の発火条件の正本は reviewers.yml」。
- **scope 根拠**: `reviewers.yml` は touched files の外。

## H. テスト / regression の根拠 (担当範囲の実質記入)

- **既存の振る舞いを壊していない根拠 (観察)**:
  - palette の開閉・Esc / 外の押下でのフォーカスの戻り・`aria-activedescendant` が実在の option を指すこと・axe の構造の違反 0 (3 つの状態) は `CommandPalette.test.tsx:437-474` にある
  - 会話内検索の位置の `role="status"` は `ConversationSearch.test.tsx:264,313`、Thread search の件数の `role="status"` は `SessionListScreen.test.tsx:1724`
  - IME の変換中のキーのテストは `CommandPalette.test.tsx:425-433` ほか
  - composer の名前の変更は、E2E の locator と一緒に直してある (`e2e/support/launch.ts` ほか。touched)
- **検出できていないもの**: H-001 / M-001 / M-002 / M-005 (色・フォーカスの見え・forced colors)。M-004 で手当てする。
- **観測点**: a11y の観点で足すべき log / metric は無い (表示の問題で、実行時のエラーの経路ではない)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `bg-foreground/\[0\.0\d\]` (src/renderer/src) | 12 (状態の指標は 1) | command-palette.tsx:205 (状態)・:207 / surfaces.tsx:11,14,20 / WorkspaceFoldersScreen.tsx:528 (hover・下地) / data-table.tsx:47,52,55・file-tree.tsx:63 (vendored) / ResolutionScreen.tsx:54 (仮実装) |
| M-001 | `placeholder:text-[a-z/0-9\-\[\]\.]+` | 6 (基準を下回る 4) | command-palette.tsx:166 / conversation-search.tsx:83 / SessionListScreen.tsx:853 / thread.aui.tsx:651 (満たす: ui/input.tsx:10・ui/textarea.tsx:9) |
| M-001 | `text-foreground/(2\|3)\d\b` | 13 (対象 6) | command-palette.tsx:150,166,173,195 / conversation-search.tsx:70,83 (vendored の 7 件は対象外) |
| M-002 | `outline-none` (components/ui を除く) | 17 (代わりの指標が無い入力欄 2) | conversation-search.tsx:83 / command-palette.tsx:166 (H-001) / thread.aui.tsx:651,1150 (前からの composer。system) |
| M-003 | `aria-live` (src/renderer/src) | 7 (palette 0) | conversation-search.tsx:87 / SessionListScreen.tsx:875,1163 / WorkspaceFoldersScreen.tsx:484,595,610 / SessionAttentionAnnouncer.tsx:41 |
| M-005 | `forced-colors\|forced-color` (src/renderer/src) | 0 | — |
| L-001 | `::highlight` | 2 | main.css:159,164 |
| L-002 | `scroll-smooth\|scroll-behavior\|reduced-motion` | 2 | thread.aui.tsx:223,512 |
| L-003 | `renderTooltip` (渡す側) | 2 (本 PR) | SessionListScreen.tsx:333,1417 |
| L-005 | `aria-busy` (SessionListScreen.tsx) | 1 | SessionListScreen.tsx:1113 |
| M-004 | `axe\(\|toHaveNoViolations` (対象のテスト 4 本) | 8 (どれも color-contrast を切る) | CommandPalette.test.tsx:315,444,456,473 / ConversationSearch.test.tsx:622,628 / SessionListScreen.test.tsx:1961-1969 / PresetPanel.test.tsx:144,244 |
| L-006 | `command-palette\|conversation-search` (eslint.config.mjs・reviewers.yml) | 4 (reviewers.yml は 0) | eslint.config.mjs:601,602,606,607 |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 5
