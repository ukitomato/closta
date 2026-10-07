# a11y-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: a11y-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-017: 過去のセッションの区画に関わる。検索欄、件数の `role="status"`、グループの `role="group"` と h3、過去の行のツールチップ (`SessionListScreen.tsx` / `thread-list.aui.tsx`)。Round 2 では placeholder の文言だけが変わった (`session-list/labels.ts:206`)
  - FR-003 / FR-005: 会話内検索のバーと `::highlight()` (`conversation-search.tsx` / `main.css`)。Round 2 の差分では変わっていない
  - FR-006 / FR-007: Command palette の combobox / listbox と `aria-activedescendant` (`command-palette.tsx` / `CommandPalette.tsx`)。Round 2 の差分では変わっていない
  - FR-014: composer の名前と placeholder の日本語化 (`thread.aui.tsx:649-656`)。変わっていない
  - FR-018 / SC-008: サイドバーの基準画像と高さの E2E。Round 2 で、CI のステップ・スクロールの位置合わせ・基準画像の 3 つが入った (`verify.yml:171-172`・`sidebar-screenshot.spec.ts:82-97`・`sidebar-past-sessions-win32.png`)
  - SC-003: palette の axe 違反 0
- touched files に該当する charter / Confirmation:
  - ui charter の業務ルール「assistant-ui の design system に乗り、独自のトークンを増やさない」(`ui/charter.md:148`)。Principle XIII
  - Constitution Principle VIII の Verification で、Manual の検証者に a11y-reviewer が入っている (`constitution.md:638,1013`)。対象は日本語のスクリーンショット比較と、Round 2 で入った基準画像の目視
  - AD-038 Confirmation「基準画像に会話/config 由来情報が含まれない」(`0038-e2e-screenshot-harness.md:119`)。基準画像を目視して確かめた。写っているのは合成の題・ブランチ・タグだけだった
  - AD-045 Confirmation (文言は `labels.ts` に置く)。Round 2 の placeholder の変更はこれに従っている
  - AD-037 (IME の二重ガード)。対象の 4 か所は Round 1 から変わっていない
- A. 認可 / 認証 / secret 管理: 該当なし: a11y-reviewer の担当外 (security-reviewer が持つ)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y-reviewer の担当外 (security-reviewer が持つ)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が持つ
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が持つ (a11y の観点で、accepted ADR の Decision / Confirmation に反するものは見つからなかった)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が持つ
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が持つ
- G. optional reviewer 範囲: Critical:0 High:1 Medium:4 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:2

## スコープ要約

Round 1 から Round 2 への差分 (9d98c39..a4c37a8。gate の成果物を除く) は、pr-gate R1 の C-001 (サイドバーの基準画像の E2E が CI で流れていない) を閉じるためのものだった。次の 6 点が入った。
- `verify.yml` に、サイドバーの E2E のステップを 1 つ足した
- `sidebar-screenshot.spec.ts` で、撮る前に区画のスクロールをグループの並びの上端まで送り、h3 と最初の行が見えることを確かめるようにした
- CI の artifact から取った基準画像をコミットした
- 過去の区画の検索欄の placeholder を 16 字から 13 字に縮めた (280px で切れていたため)
- vitest の上限を 20s にした
- 記録 (data-model / quickstart-results / touched-files) を直した

a11y の対象の UI ファイル (`command-palette.tsx`・`conversation-search.tsx`・`CommandPalette.tsx`・`SessionListScreen.tsx`・`thread.aui.tsx`・`thread-list.aui.tsx`・`main.css`) は 1 つも変わっていない。code-gate iter 3 の verdict の sha が、Round 1 の pr-gate の verdict と全部一致する。HEAD で Read と Grep を掛け、Round 1 の指摘の行が残っていることを確かめた。

したがって Round 1 の a11y の指摘 12 件 (High 1 / Medium 5 / Low 6) はすべて未解決で持ち越す。Round 1 で R1 の pr-gate が直すよう求めたのは C-001 だけで、a11y の High は直す対象になっていなかった。

Round 2 の差分から新しい指摘が 1 件ある (L-007。基準画像が、基準を下回る placeholder の色を固定した)。L-006 には追加事実が 1 つある (重大度は変えない)。

Round 1 の Verdict 行の Low 5 は、本文 6 件の数え違いだった。本 Round では本文の件数に合わせた。

## Findings

### [High] palette の現在の候補の指標が背景の 6% の濃淡 (1.14:1) だけで、入力欄も outline-none。ダイアログの中に見えるフォーカス指標が無い (H-001) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)。重大度は変えない (追加事実なし)
- **観察** (HEAD で確かめ直した):
  - 現在の候補を区別する手がかりは `src/renderer/src/components/assistant-ui/elements/command-palette.tsx:205` の `bg-foreground/[0.06]` だけである。hover は `:207` の `hover:bg-foreground/[0.03]`
  - 入力欄は `:166` で `outline-none` になっていて、代わりの指標が無い。option は `:259` で `tabIndex={-1}` なので、DOM のフォーカスは combobox の input に残る (`:163` の `aria-activedescendant`)
  - Round 1 の計算では、下地の `floating` に対し light が 1.14:1、dark が 1.16:1 である。Windows の Contrast themes (forced colors) では背景色が置き換わり、指標が消える
- **同種事象探索**:
  - Grep `bg-foreground/\[0\.0\d\]` (`src/renderer/src`) で 11 件 (6 ファイル)。Round 1 の「12 件」は数え違いで、列挙した 11 件は同じ
  - 状態の指標に使っているのは `command-palette.tsx:205` の 1 件だけ。残りは hover か下地 (`command-palette.tsx:207`・`surfaces.tsx` 3 件・`WorkspaceFoldersScreen.tsx` 1 件)、vendored (`data-table.tsx` 3 件・`file-tree.tsx` 1 件)、仮実装 (`ResolutionScreen.tsx` 1 件)
- **リスク/影響**:
  - 晴眼のキーボード利用者は、↑↓ で選んだ候補を見分けられない。Enter で意図しない操作 (セッションを開く・サイドバーを畳むなど) が走りうる
  - US-3「キーボードだけで操作を呼び出す」の中核が損なわれる
- **推奨アクション**: 既存のトークンだけで、背景色に依らない 3:1 以上の指標を足す。
  ```tsx
  // command-palette.tsx:202-209
  selected
    ? "bg-accent font-medium outline-2 -outline-offset-2 outline-ring" // --ring は白に対し 4.83:1
    : onRun ? "hover:bg-foreground/[0.03]" : undefined,
  ```
  - outline は forced colors のモードでも残る
  - 本リポジトリの先例: `thread-list.aui.tsx:352-369` と `SessionListScreen.tsx:1232-1238`
- **根拠**: WCAG 2.1 SC 2.4.7 (AA)、SC 1.4.11 (AA)、WAI-ARIA APG Combobox、ui charter の業務ルール (`ui/charter.md:148`)
- **scope 根拠**: `command-palette.tsx` は本 PR が取り込んで手を入れた element で、touched files にある。

### [Medium] 新しい UI の文字のコントラストが 4.5:1 に届かない (placeholder・palette のグループ名・種別の札) (M-001) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
  - Round 2 で過去の区画の検索欄の placeholder の文言は変わった (`src/renderer/src/features/session-list/labels.ts:206`)。色の指定 (`SessionListScreen.tsx:853`) は変わっていない
  - この状態が基準画像に写った (L-007)
- **観察** (HEAD で確かめた。比は Round 1 の計算。light が既定のテーマ):
  - `command-palette.tsx:166` の `placeholder:text-foreground/30`: 2.04:1
  - `command-palette.tsx:195` のグループ名 `text-foreground/25`: 1.79:1
  - `command-palette.tsx:173` の esc の案内 `text-foreground/35`: 2.33:1
  - `command-palette.tsx:221-227` の種別の札「稼働中 / 過去」: 4.44:1。現在の候補の上では 3.90:1
  - `conversation-search.tsx:83` の `placeholder:text-foreground/30`: 2.04:1
  - `SessionListScreen.tsx:853` の `bg-input` と `placeholder:text-muted-foreground` の組: 3.81:1
  - `thread.aui.tsx:651` の `placeholder:text-muted-foreground/60`: 2.32:1
- **同種事象探索**:
  - Grep `placeholder:text-` (`src/renderer/src`) で 6 件
    - 基準を下回る 4 件: `command-palette.tsx:166`・`conversation-search.tsx:83`・`SessionListScreen.tsx:853`・`thread.aui.tsx:651`
    - 満たす 2 件 (vendored): `components/ui/input.tsx:10`・`components/ui/textarea.tsx:9`
  - Grep `text-foreground/(2|3)\d\b` の対象 6 件は Round 1 から変わっていない
- **リスク/影響**:
  - 弱視の利用者は、palette の入力欄の唯一の見える名前 (2.04:1) と、種別の札を読みにくい
  - vitest-axe は `color-contrast` を切っているので、テストでは検出されない
- **推奨アクション**:
  - `command-palette.tsx:166` と `conversation-search.tsx:83` を `placeholder:text-muted-foreground` にする
  - `command-palette.tsx:195` を `text-muted-foreground` にする
  - 種別の札は `field` の下地を外す
  - `SessionListScreen.tsx:853` は shadcn の `Input` と同じ下地 (`bg-transparent dark:bg-input/30`) にする。light で 4.83:1 になる。**基準画像の承認の前に決める (L-007)**
  - `thread.aui.tsx:651` の `/60` を外す
- **根拠**: WCAG 2.1 SC 1.4.3 (AA)
- **scope 根拠**: 列挙したファイルはすべて touched files にある。

### [Medium] 会話内検索の入力欄にフォーカスの指標が無い (outline-none で、囲みに focus-within も無い) (M-002) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**:
  - 入力欄は `src/renderer/src/components/assistant-ui/elements/conversation-search.tsx:83` で `outline-none` になっていて、代わりの指標が無い
  - 囲み (`:62-67`) は `paper` のままで、フォーカスで変わる指定が無い
  - 同じバーのボタン (`:99,108,120`) は `ghostButton` の `focus-visible:ring` を持つ。過去の区画の検索欄は `SessionListScreen.tsx:853` で `focus-visible:ring-[3px]` を持つ
- **同種事象探索**: Grep `outline-none` (`components/ui` を除く) で、代わりの指標が無い入力欄は Round 1 と同じ 2 件 (`conversation-search.tsx:83`・`command-palette.tsx:166`)。後者は H-001 で扱う。
- **リスク/影響**: Tab で入力欄に戻ったとき、晴眼のキーボード利用者には指標がキャレットだけしか見えない。
- **推奨アクション**: 囲みに `focus-within:ring-1 focus-within:ring-ring` を足す。
- **根拠**: WCAG 2.1 SC 2.4.7 (AA)
- **scope 根拠**: touched files の element である。

### [Medium] palette は候補の件数も 0 件も読み上げない (他の 2 つの検索は role="status" で読み上げる) (M-003) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**:
  - palette の 2 ファイル (`command-palette.tsx`・`CommandPalette.tsx`) に `aria-live` も `role="status"` も無い
  - 0 件の表示 (`command-palette.tsx:283-285`) は live region ではない
  - 他の 2 つの検索は件数を `role="status" aria-live="polite"` で読み上げる (`conversation-search.tsx:85-91`・`SessionListScreen.tsx:873-879`)
- **同種事象探索**: Grep `aria-live` (`src/renderer/src`) で、本番の属性は 7 件 (`WorkspaceFoldersScreen.tsx:484,595,610`・`conversation-search.tsx:87`・`SessionListScreen.tsx:875,1163`・`SessionAttentionAnnouncer.tsx:41`)。palette は 0 件。
- **リスク/影響**: スクリーンリーダーの利用者には、候補が何件になったか、0 件になったかが伝わらない。
- **推奨アクション**:
  - `PaletteBody` に、常にマウントする sr-only の `<p role="status" aria-live="polite">` を置く
  - 中身は、語が空でなければ「{n} 件の候補」、0 件なら `paletteNone`
  - 文言は `PALETTE_LABELS` に置く (AD-045)
- **根拠**: WCAG 2.1 SC 4.1.3 (AA)
- **scope 根拠**: `CommandPalette.tsx` は本 PR の新設で、touched files にある。

### [Medium] Windows の Contrast themes (forced colors) で、新しいフォーカス指標と選択の指標が消える。renderer に forced-colors の扱いが 0 件 (M-005) (scope: system)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**:
  - Grep `forced-colors` (`src/renderer/src`) で 0 件
  - forced colors のモードでは box-shadow が強制で外れる。そのため、`ring` で描く指標 (`SessionListScreen.tsx:853`、`surfaces.tsx:20` の `ghostButton`) と、背景色だけの指標 (`command-palette.tsx:205`) が消える
- **同種事象探索**: Grep `forced-colors|forced-color` で 0 件。e2e でも Grep `emulateMedia|forcedColors` で 0 件。
- **リスク/影響**: 対象のプラットフォームは Windows 11 である。Contrast themes を使う利用者は、Tab で移った先が見えない。
- **推奨アクション**:
  - バンドルされる `main.css` の層の外に `@media (forced-colors: active) { :focus-visible { outline: 2px solid CanvasText; outline-offset: 2px; } }` を置く
  - 本 PR で扱わないなら、roadmap に持ち主を書く
- **根拠**: WCAG 2.1 SC 2.4.7 (AA)、CSS Color Adjustment Module Level 1
- **scope 根拠**: 原因は renderer 全体の focus ring の書き方 (前からあるもの) で、本 PR の新しい UI がそれを継いでいる。

### [Low] 会話内検索の現在以外の一致の強調が下地に対し 1.29:1 (light) / 1.89:1 (dark) (L-001) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**: `src/renderer/src/assets/main.css:159-162` の `::highlight(closta-search)` は `color-mix(in oklab, var(--chart-4) 45%, transparent)` で描く。現在の一致 (`:164-167`) は前景と背景の反転で区別できる。
- **同種事象探索**: Grep `::highlight` で 2 件 (`main.css:159,164`)。
- **リスク/影響**: 弱視の利用者は、現在以外の一致を見落としうる。
- **推奨アクション**: `text-decoration: underline` を足すか、混ぜる割合を上げる。
- **根拠**: WCAG 2.1 SC 1.4.11 (参考)、SC 1.4.1
- **scope 根拠**: `main.css` は touched files にある。

### [Low] 会話内検索の移動のたびに長い距離を smooth scroll し、prefers-reduced-motion で止まらない (L-002) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**: `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:223,512` が無条件に `scroll-smooth` を指定している。navigator の `scrollIntoView` と `scrollToIndex` はこれを継ぐ。
- **同種事象探索**: Grep `scroll-smooth|scroll-behavior|reduced-motion` で 2 件 (`thread.aui.tsx:223,512`)。`motion-reduce:` による打ち消しは 0 件。
- **リスク/影響**: 前庭障害のある利用者に、操作のたびに大きな動きが出る。
- **推奨アクション**: 2 か所を `motion-safe:scroll-smooth` にする。
- **根拠**: WCAG 2.1 SC 2.3.3 (AAA)
- **scope 根拠**: touched files にある。

### [Low] 過去の行のツールチップが、行の名前と同じ文を aria-describedby で再び読ませる (L-003) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**: `src/renderer/src/features/session-list/SessionListScreen.tsx:945-948` の `renderTooltip` は、切り詰めていない行にも題の全文を渡す。Trigger の名前にはすでに題が入っている (`thread-list.aui.tsx:308-318`)。
- **同種事象探索**: Grep `renderTooltip` で、渡しているのは `SessionListScreen.tsx:333,1417` の 2 件。
- **リスク/影響**: 読み上げが冗長になる。機能は損なわれない。
- **推奨アクション**: 題が切り詰められたときだけツールチップを渡す。そうしないなら、冗長を受け入れる理由を注記に書く。
- **根拠**: WCAG 2.1 SC 4.1.2
- **scope 根拠**: touched files にある。

### [Low] 会話内検索では、スクリーンリーダーの利用者が一致の中身を得られない (件数と位置しか読まれない) (L-004) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**: 読み上げは `conversation-search.tsx:85-91` の status 「{i} / {n} 件」だけである。強調 (CSS Custom Highlight) はアクセシビリティツリーに出ない。
- **同種事象探索**: 該当は会話内検索の 1 か所だけ。
- **リスク/影響**: 支援技術の利用者は、どの文に当たったかを、入力欄を離れて transcript を辿らないと知れない。
- **推奨アクション**: status に、現在の一致の役割と前後の数語を sr-only で足す。O-9 で扱うなら roadmap に書く。
- **根拠**: WCAG 2.1 SC 1.3.1 / 4.1.3 (参考)
- **scope 根拠**: touched files にある。

### [Low] Thread search の検索欄と件数の live region が aria-busy の中にある (L-005) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)
- **観察**: `src/renderer/src/features/session-list/SessionListScreen.tsx:1113` で、画面の全体の `div` が `aria-busy={sessions.loading}` を持つ。その内側に検索欄と件数の `role="status"` (`:873-879`) がある。
- **同種事象探索**: Grep `aria-busy` (`SessionListScreen.tsx`) で、属性は `:1113` の 1 件 (`:1149` はコメント)。
- **リスク/影響**: WSL の取得の間に打った語の件数の読み上げが遅れうる。
- **推奨アクション**: `aria-busy` を一覧のスクロールの領域に移し、検索欄を外に出す。
- **根拠**: WAI-ARIA 1.2 `aria-busy`
- **scope 根拠**: touched files にある。

### [Medium] (H) コントラストとフォーカスの見えを確かめる経路が、自動にも手順にも無い (M-004) (scope: feature)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)。下に Round 2 の観察を足した
- **観察**:
  - vitest-axe の 4 本はすべて `color-contrast` を切っている (`CommandPalette.test.tsx:315`・`ConversationSearch.test.tsx:622,628`・`SessionListScreen.test.tsx:1961`・`PresetPanel.test.tsx:144`)
  - quickstart の V-3 (`specs/012-ui-thread-search/quickstart.md:29-36`) に、palette の現在の候補の見え・placeholder のコントラスト・入力欄のフォーカスの見え・Contrast themes の項目が無い。Round 2 でも変わっていない
  - Round 2 で CI に入ったスクリーンショット比較は 2 本 (`composer-screenshot.spec.ts:53`・`sidebar-screenshot.spec.ts:99`)。どちらもフォーカスした状態と forced colors の状態を撮らない (Grep `emulateMedia|forcedColors` で 0 件。`focus()` を呼ぶのは `ime.spec.ts` と `multi-session.spec.ts` だけ)
- **同種事象探索**: Grep `axe\(|toHaveNoViolations` (対象の 4 つのテスト) で 8 件。どれも `color-contrast` を切っている。
- **リスク/影響**: H-001 / M-001 / M-002 / M-005 を直しても、退行を CI でも人の手順でも捕まえられない。
- **推奨アクション**:
  - V-3 に「palette で ↑↓ の現在の候補が見分けられる」「各入力欄にフォーカスの指標が出る」「Windows の Contrast themes で同じ 2 点」を足す
  - Round 2 で CI に載った `sidebar-screenshot.spec.ts` は、安く足せる置き場である。そこに、検索欄にフォーカスした状態のケースを足せる
  - forced colors を Playwright の `page.emulateMedia({ forcedColors: 'active' })` で撮るケースも候補になる。ただし Electron の page で効くかは本 reviewer は確かめていない
  - E2E で axe-core (`node_modules/axe-core`) を注入し、`color-contrast` を有効にして流す案は Round 1 のまま
- **根拠**: Constitution Principle VIII の Verification (Manual の検証者に a11y-reviewer。`constitution.md:638`)、Principle XI
- **scope 根拠**: `quickstart.md` と `e2e/` は本 PR の範囲で直せる。

### [Low] (H) 本 PR が手を入れた 2 つの element と、名前の文言の表が、a11y / ux reviewer の起動条件に入っていない (L-006) (scope: system)

- **Round 2 の状態**: Round 1 から持ち越し (未解決)。追加事実が 1 つある (重大度は変えない)
- **観察**:
  - `.specify/spec-gate/reviewers.yml:52-53` は「新しい手書きの element を足したらここにも足す」と定めている
  - しかし a11y-reviewer の `auto_invoke_patterns` (`:42-64`) にも ux-reviewer の (`:92-114`) にも、`command-palette.tsx` / `conversation-search.tsx` が無い
  - **追加事実 (Round 2)**: Round 2 の renderer の変更は `src/renderer/src/features/session-list/labels.ts` の 1 ファイルだけだった (検索欄の placeholder。同じ表に、名前の `searchLabel` と、消すボタンの名前の `searchClear` もある)
    - 両 reviewer の patterns のうち、文言の表は `features/shell/labels.ts` の 1 つだけ (`:49,99`)
    - `features/session-list/**/*.tsx` は `.ts` に当たらない
    - したがって、この Round 2 と同じ「名前と placeholder の文言だけを変える PR」は、単独では a11y / ux reviewer を起こさない
    - 本 PR で起動したのは、main...HEAD の差分が `thread-list.aui.tsx` に当たったからである
- **同種事象探索**:
  - Grep `command-palette|conversation-search` (`reviewers.yml`) で 0 件
  - Grep `labels\.ts` (`reviewers.yml`) で 4 件。`shell/labels.ts` が 3 件 (`:49,99,197`)、`:190` は ui-coverage の除外の理由の注記
- **リスク/影響**: H-001 / M-001 / M-002 を直した後の退行と、accessible name の文言の退行が、pr-gate の a11y の観点から外れる。
- **推奨アクション**: a11y-reviewer と ux-reviewer の `auto_invoke_patterns` に、次の 4 つを足す。
  - element 2 つ (`command-palette.tsx`・`conversation-search.tsx`)
  - 名前の文言の表 (`features/session-list/labels.ts`・`features/chat/labels.ts`)
- **根拠**: `reviewers.yml:52-53` の規則、AGENTS.md「reviewer の発火条件の正本は reviewers.yml」
- **scope 根拠**: `reviewers.yml` は touched files の外にある。

### [Low] (H) 新しい基準画像が、基準を下回る検索欄の placeholder の色を固定した。直す時期を利用者が画像を目視する前に決めないと、承認が 2 回要る (L-007) (scope: feature)

- **Round 2 の状態**: new (Round 2 の差分による)
- **観察**:
  - Round 2 でコミットした `e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png` を Read で目視した。区画の見出しの下に、灰の下地に灰の placeholder「題・ブランチ・フォルダなど」が写っている
  - その色は M-001 の `src/renderer/src/features/session-list/SessionListScreen.tsx:853` (`bg-input` と `placeholder:text-muted-foreground`。light で 3.81:1) である
  - 比較は `e2e/sidebar-screenshot.spec.ts:99` の `toHaveScreenshot` で行う。CI では `.github/workflows/verify.yml:171-172` で毎回走る。invoker が観察した run 37565959731 で緑だった
  - 利用者による画像の目視は終わっていない (`specs/012-ui-thread-search/quickstart-results.md:92-93`「画像そのものの目視は朝に利用者が確かめる項目に残す」)
  - AD-038 D5 と V-4 では、基準画像を取り直すには CI の artifact と利用者の承認が要る (`quickstart-results.md:74-81`)
- **同種事象探索**: Grep `toHaveScreenshot` (`e2e`) で 2 件。
  - `composer-screenshot.spec.ts:53` は、撮る前に入力欄に文字を入れる (`:32` の `composer.fill`)。placeholder (`thread.aui.tsx:651`) は写らない
  - 本 PR の a11y の指摘の箇所が基準画像に写るのは、サイドバーの `:853` の 1 件だけ
- **リスク/影響**:
  - M-001 の `:853` を merge の後に直すと、基準画像が変わる。CI の artifact からの取り直しと利用者の承認がもう 1 回要る
  - 取り直しの手間が「直さない理由」になり、基準を下回る色が画像で固定されやすい
- **推奨アクション**:
  - 利用者が朝に基準画像を目視する前に、M-001 の `:853` の扱いを決める
  - 直すなら本 PR で直し (shadcn の `Input` と同じ `bg-transparent dark:bg-input/30`)、取り直した画像を 1 回だけ承認する
  - 直さないなら、roadmap に持ち主と「直すときは `sidebar-past-sessions-win32.png` を取り直す」を書く
- **根拠**: WCAG 2.1 SC 1.4.3 (AA)、AD-038 D5、Constitution Principle VIII の Verification (Manual の検証者に a11y-reviewer)
- **scope 根拠**: `SessionListScreen.tsx`・基準画像・`quickstart-results.md` は、すべて touched files にある。

## H. テスト / regression の根拠 (担当範囲の実質記入)

- **既存の振る舞いを壊していない根拠 (観察)**:
  - Round 2 の差分は、a11y の対象の UI ファイルを変えていない (sha が一致する)。Round 1 で確かめた次の根拠は、そのまま有効である
    - palette のフォーカスの戻りと axe の構造の違反 0 (`CommandPalette.test.tsx:437-474`)
    - 2 つの検索の件数の `role="status"` (`ConversationSearch.test.tsx:264,313`・`SessionListScreen.test.tsx:1724`)
    - IME の変換中のキー (`CommandPalette.test.tsx:425-433` ほか)
  - Round 2 で入った E2E は、a11y の構造の退行も見張る
    - `sidebar-screenshot.spec.ts:96` は、グループの見出しが `heading level 3` であることを確かめる (FR-017 の h3)
    - `:124` は、検索欄が `searchbox` の役割と名前「セッションを検索」を持つことを確かめる
  - invoker の CI の証拠では、run 37565959731 で e2e の 6 ステップがすべて緑だった (IME の変換確定・日本語スクリーンショット・サイドバーを含む)
  - Principle VIII の Manual の確認として、基準画像を目視した
    - placeholder は切れずに収まっている
    - 全角の括弧・題・グループの見出し「E2E Project / 同じ所在 / 3 件」に、欠け・重なり・桁ずれは見当たらない
    - ただし画像は E2E の同梱フォント (Noto Sans JP) で描いている。本番のフォント (`main.css:45` の `system-ui, 'Segoe UI', 'Yu Gothic UI', …`) で placeholder が収まるかは、quickstart の V-3 の目視に任される (V-3 にその項目は無い)
- **検出できていないもの**: H-001 / M-001 / M-002 / M-005 (色・フォーカスの見え・forced colors)。手当ては M-004 と L-007 に書いた。
- **観測点**: a11y の観点で足すべき log / metric は無い (表示の問題で、実行時のエラーの経路ではない)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `bg-foreground/\[0\.0\d\]` (src/renderer/src) | 11 | command-palette.tsx:205 (状態の指標)・:207 / surfaces.tsx (3) / WorkspaceFoldersScreen.tsx (1) / data-table.tsx (3)・file-tree.tsx (1) (vendored) / ResolutionScreen.tsx (1) (仮実装) |
| M-001 | `placeholder:text-` (src/renderer/src) | 6 | command-palette.tsx:166 / conversation-search.tsx:83 / SessionListScreen.tsx:853 / thread.aui.tsx:651 (満たす: ui/input.tsx:10・ui/textarea.tsx:9) |
| M-002 | `outline-none` (components/ui を除く) | 2 | conversation-search.tsx:83 / command-palette.tsx:166 (代わりの指標が無い入力欄。残りは Round 1 の列挙と同じ) |
| M-003 | `aria-live` (src/renderer/src、本番の属性) | 7 | WorkspaceFoldersScreen.tsx:484,595,610 / conversation-search.tsx:87 / SessionListScreen.tsx:875,1163 / SessionAttentionAnnouncer.tsx:41 (palette は 0) |
| M-005 | `forced-colors\|forced-color` (src/renderer/src) | 0 | — |
| L-001 | `::highlight` (src/renderer/src/assets) | 2 | main.css:159,164 |
| L-002 | `scroll-smooth\|scroll-behavior\|reduced-motion` | 2 | thread.aui.tsx:223,512 |
| L-003 | `renderTooltip` (渡す側) | 2 | SessionListScreen.tsx:333,1417 |
| L-004 | 会話内検索の status | 1 | conversation-search.tsx:85-91 |
| L-005 | `aria-busy` (SessionListScreen.tsx、属性) | 1 | SessionListScreen.tsx:1113 |
| M-004 | `axe\(\|toHaveNoViolations` (対象のテスト 4 本) | 8 | CommandPalette.test.tsx:315,444,456,473 / ConversationSearch.test.tsx:622,628 / SessionListScreen.test.tsx:1961-1969 / PresetPanel.test.tsx:144,244 |
| M-004 | `emulateMedia\|forcedColors` (e2e) | 0 | — |
| L-006 | `command-palette\|conversation-search` (reviewers.yml) | 0 | — |
| L-006 | `labels\.ts` (reviewers.yml) | 4 | reviewers.yml:49,99,197 (shell/labels.ts) / :190 (注記) |
| L-007 | `toHaveScreenshot` (e2e) | 2 | composer-screenshot.spec.ts:53 (placeholder は写らない) / sidebar-screenshot.spec.ts:99 (SessionListScreen.tsx:853 が写る) |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 7
- Round inheritance: resolved from 1: 0 / unresolved: 12 / new: 1 (L-007)
