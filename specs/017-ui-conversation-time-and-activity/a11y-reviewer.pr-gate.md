# a11y-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17
**Reviewer**: a11y-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: FR-006 / FR-007 (中央の時刻・所要時間: `MessageTimeLabel.tsx`、`thread.aui.tsx:953,1311`)、FR-008〜FR-011 (地図のタブ: `ConversationMapTab.tsx` の `TurnList`)、FR-012 / FR-013 (活動の帯: `ConversationMapTab.tsx` の `ActivityBand`。色はテーマのトークンのみ、矢印キー、名前に範囲と数)、SC-003 / SC-004 (vitest-axe 違反 0)。
- touched files に該当する charter / Confirmation:
  - ui charter「日本語で破綻しない (Principle VIII)」「長大スレッドは仮想化」「独自のカラートークンを増やさない (Principle XIII)」。IME の変換中キー無視 (`ConversationMapTab.tsx:48,122,277`) と仮想化 (`:230`) は満たされている。
  - `src/renderer/src/assets/main.css:104-117` の `--ring` の注記 (フォーカス指標は 3:1 以上、a11y H-008) は引き続き有効。
  - `reviewers.yml` の a11y の対象は `features/shell/**/*.tsx` と `features/chat/**/*.tsx`。`thread.aui.tsx` は手書きの対象。`*.test.tsx` と vendored は除外した。
- A. 認可 / 認証 / secret 管理: 該当なし: a11y reviewer の範囲外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: a11y reviewer の範囲外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: a11y reviewer の範囲外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: a11y reviewer の範囲外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: 該当なし: a11y reviewer の範囲外 (po-reviewer が担当)
- F. 命名 / module / lint hookup: 該当なし: a11y reviewer の範囲外 (convention-reviewer が担当)
- G. optional reviewer 範囲 (WCAG 2.1 AA): Critical:0 High:1 Medium:4 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-9 は 3 つの UI を足している。
- 中央の本体のメッセージに付く時刻と所要時間 (`MessageTimeLabel`)。
- 右のペインの「会話の地図」タブ。仮想化したターンの `<ol>` で、行は roving tabindex の `<button>`。
- 同タブ上端の活動の帯。`role="toolbar"` に区間ごとの `<button>` を置く。

キーボード到達性は良い。roving tabindex、↑↓・PageUp/PageDown・Home/End・Enter/Space、IME の変換中キーの無視、フォーカスのある行を範囲外でも描く処理、行と区間のボタンの名前、`aria-setsize` / `aria-posinset`、タブの既存の Tabs pattern への乗せ方に、構造上の欠陥は見つからなかった。指摘は 3 点に集まる。
1. 地図の行の補助テキストの色対比 (light で AA 未満)。
2. 現在行と濃さの表現が色の薄さに依存していること。
3. 強制カラー (Windows のハイコントラスト) でフォーカスの輪と帯の棒が消えること。

`tests/.../*.test.tsx` の axe は jsdom の制約で `color-contrast` を無効にしているため、これらを検出できない (M-005)。Critical (keyboard 到達不可・text 不可読) は見つからなかった。

## Findings

### [High] 地図の行の補助テキスト (`text-muted-foreground` text-xs) が、hover 行と aria-current 行の背景 (`bg-accent`) の上で light テーマの 4.5:1 を割る (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/ConversationMapTab.tsx:396` の行ボタンは `hover:bg-accent` と `aria-[current=true]:bg-accent` を持つ。
  - その内側の `:406` の span は `text-muted-foreground text-xs` で、時刻・所要時間・tool 数・エラー数・境界の印を出す。
  - `src/renderer/src/assets/main.css:97-99` では light の `--muted-foreground` が oklch(0.552 0.016 285.9) (約 #71717b)、`--accent` が oklch(0.967 0.001 286.4) (約 #f4f4f5)。
  - 相対輝度は約 0.167 と 0.906 で、対比は (0.906+0.05)/(0.167+0.05) = 約 4.40:1。白背景のときの 4.83:1 (`thread.aui.tsx:585` の注記) を下回り、12px の通常テキストに必要な 4.5:1 に届かない。
  - 「最後に地図から移った行」は aria-current で背景が付いたまま残るので、一時的な hover だけの問題ではない。
  - dark は 0.705 対 0.274 で約 5.9:1 となり問題ない。
  - 計算値であり実機の測定ではない。`ConversationMapTab.test.tsx:25` が `color-contrast` を無効にしているため、テストでも検出できない。
- **同種事象探索**: `hover:bg-accent|bg-accent` (`src/renderer/src/features` の `*.tsx`) で 4 件。
  - `ConversationMapTab.tsx:396` (本件)。
  - `RightPanel.tsx:166` と `SettingsDialog.tsx:81` は `text-accent-foreground` と対で使っており問題なし。
  - `SessionListScreen.test.tsx:1079` はコメント。
  - muted-foreground を accent 背景に重ねているのは本件のみ。
- **リスク/影響**: 地図は読み返しの主要な面で、補助テキストに時刻・所要時間・エラー数が載っている。選んだ行や hover 中の行で、低視力の利用者が読みにくくなる (WCAG 1.4.3)。014 pr-gate R1 H-001 (`thread.aui.tsx:585-586`) と同種の指摘で、同じ扱いにする。
- **推奨アクション**: `:396` の行ボタンで、hover と current のときだけ補助行の色を上げる。
  - 例: `hover:[&_span]:text-accent-foreground` 相当を使うか、補助行の span に `group-hover:text-accent-foreground group-aria-[current=true]:text-accent-foreground` を付ける。
  - あるいは current の背景をやめて M-001 の左ボーダー方式にし、`bg-accent` と `text-muted-foreground` の組み合わせ自体を無くす。
- **根拠**: WCAG 2.1 SC 1.4.3 (AA)。014 pr-gate R1 H-001 の前例。
- **scope 根拠**: `ConversationMapTab.tsx` は本 PR の新規ファイル。

### [Medium] 「最後に地図から移った行」の視覚的な印が背景色の差 (約 1.1:1) だけで、hover と区別できない (M-001) (scope: feature)

- **観察**:
  - `ConversationMapTab.tsx:396` の `aria-[current=true]:bg-accent` は `hover:bg-accent` と同じ色で、白 (または dark の背景) に対し 1.1〜1.2:1 しかない。
  - 支援技術には `aria-current` が伝わるが、視覚の利用者には「hover しているだけ」と「現在の行」が見分けられない。
  - 別の画面の選択表現 (`RightPanel.tsx:166`、`SettingsDialog.tsx:81`) は `bg-accent text-accent-foreground font-semibold` の組みで、色以外の差 (太さ) も付けている。
- **同種事象探索**: `aria-\[current=true\]` (`src/renderer/src/features`) で 1 件 (`ConversationMapTab.tsx:396`)。
- **リスク/影響**: WCAG 1.4.1 (色だけに頼らない) と 1.4.11 (状態を示す視覚情報の 3:1)。どの行から中央へ移ったかを見失う。
- **推奨アクション**: current の行に非色の手がかりを足す。例は `aria-[current=true]:border-l-2 aria-[current=true]:border-primary` と `aria-[current=true]:font-semibold`。`--primary` は既存のトークンなので Principle XIII に反しない。
- **根拠**: WCAG 2.1 SC 1.4.1 / 1.4.11。
- **scope 根拠**: feature の touched file。

### [Medium] 活動の帯の濃さ 0・1 の棒が背景に対し 3:1 に届かず、低い活動が見えにくい (M-002) (scope: feature)

- **観察**:
  - `ConversationMapTab.tsx:84-90` の `BIN_BAR_CLASS` は、段 0 が `bg-muted`、段 1 が `bg-primary/25`。
  - light では白に対し約 1.1:1 と約 1.8:1。dark でも約 1.4:1 と約 2.1:1 になる。
  - 棒の高さ (h-1 / h-2 / h-4 / h-6 / h-8) でも段を表しているので、色だけの伝達ではない。ただし最低の 2 段は輪郭が背景に溶ける。
  - 活動のある段 1 (最低の活動) と「活動なし (段 0)」の区別が、低視力では付かない。
- **同種事象探索**: `bg-primary/[0-9]+` (`features/shell`) で、帯の `BIN_BAR_CLASS` 以外に 0 件。
- **リスク/影響**: WCAG 1.4.11 (意味を伝えるグラフィックの 3:1)。区間の活動の有無を判別できない利用者が出る。
- **推奨アクション**: 段 1 を `bg-primary/50` 以上にするか、棒の下端に `border-b border-foreground/50` などの輪郭を足す。段 0 は「何も無い」意味なので、細い線 (h-px の `bg-border` 以上) でよい。
- **根拠**: WCAG 2.1 SC 1.4.11。
- **scope 根拠**: feature の touched file。

### [Medium] 強制カラー (Windows のハイコントラスト) で、帯の棒とフォーカスの輪が消える (M-003) (scope: feature。パターンは system)

- **観察**:
  - 棒は `<span className="... bg-primary/25 ...">` で背景色だけで描かれている (`ConversationMapTab.tsx:176`)。強制カラーでは `background-color` が上書きされ、棒は見えなくなる。
  - フォーカスは `outline-none focus-visible:ring-2` (`:169`、`:396`)。Tailwind v4.3 の `outline-none` は `outline-style: none` で、`ring` は box-shadow である。強制カラーでは box-shadow が描かれないので、フォーカスの印が無くなる。
  - 対象は Windows の Electron。
  - `forced-colors` への対応は `src/renderer/src/components/ui/dialog.tsx` の 1 件しか無い。
- **同種事象探索**: `outline-none|outline-hidden` (`src/renderer/src/**/*.tsx`) で 24 件 (19 ファイル、うち本 PR 由来は `ConversationMapTab.tsx` の 2 件)。`forced-colors` は 1 件。
- **リスク/影響**: WCAG 2.4.7 / 1.4.11。ハイコントラスト利用者が、地図の行や帯のフォーカス位置を見失う。帯そのものが見えない。
- **推奨アクション**: 本 PR の範囲は次の 2 点で足りる。
  - フォーカスは `outline-hidden` (透明な outline が強制カラーで現れる) に替える。
  - 棒には `forced-color-adjust: none` か `forced-colors:bg-[Highlight]` を足すか、棒に `border` を持たせる。
  - 他の 22 箇所は別 spec の system-scope で扱う。
- **根拠**: WCAG 2.1 SC 2.4.7 / 1.4.11。
- **scope 根拠**: 本 PR の追加分 (2 箇所) は feature で直せる。既存のパターン全体は別 spec。

### [Medium] メッセージごとの時刻 (`<time tabIndex={0}>`) が Tab の停止点を 1 メッセージにつき 1 つ増やす (M-004) (scope: feature)

- **観察**:
  - `MessageTimeLabel.tsx:49` は、Tooltip (hover と focus で全体の書式を出す) のためだけに `<time ... tabIndex={0}>` としている。
  - 利用者と assistant のすべてのメッセージに出る (`thread.aui.tsx:953,1311`)。Tab で本体を通る利用者は、メッセージごとに時刻で止まる。
  - 全体の書式は支援技術向けに sr-only (`:51`) で既に伝わっている。Tooltip の目的は、見える利用者のキーボード操作への対応 (WCAG 1.4.13) に限られる。
  - Radix の Tooltip は focus のあいだ `aria-describedby` を付けるので、全体の書式がスクリーンリーダーに二重に読まれる (名前と説明)。
- **同種事象探索**: `tabIndex=\{0\}` (`src/renderer/src/**/*.tsx`) で 4 件 (`MessageTimeLabel.tsx:49`、`image.tsx:332`、`attachment.aui.tsx:170`、コメント `MessageTimeLabel.tsx:21`)。メッセージごとに増えるのは本件だけ。
- **リスク/影響**: 数百メッセージの会話で、Tab が時刻に何度も止まる (WCAG 2.4.3 / 2.1.1 の操作負荷)。
- **推奨アクション**: Tab の停止点にしない。全体の書式は `title` と sr-only で足りる。見える全体の書式が必要なら、メッセージ全体への hover だけで出す。Tooltip を残すなら、`TooltipContent` に `aria-hidden` を付けて二重読みを避ける。
- **根拠**: WCAG 2.1 SC 2.4.3、1.4.13。
- **scope 根拠**: 本 PR の新規ファイル。

### [Medium] 色対比とフォーカス・Tooltip の振る舞いが、どのテストでも確かめられていない (M-005) (scope: feature。観点 H)

- **観察**:
  - `ConversationMapTab.test.tsx:25` と `MessageTimeLabel.test.tsx:33` は、`AXE_RULES` で `color-contrast` を無効にしている。jsdom で計算できないため必要な措置。
  - その代わりの確認 (トークンの組み合わせ表、基準画像、実機の記録) は見当たらない。H-001 / M-002 はここで見逃された。
  - `MessageTimeLabel.test.tsx` に、`time` へのフォーカスで Tooltip が出ることと Escape で閉じることの確認が無い。
  - 帯と行のキーボード操作 (`ConversationMapTab.test.tsx:178,314`) と roving tabindex は十分に確かめられている。既存の振る舞いを壊していない根拠として、全体 3141 件が通っている (`.gate-verdict-code.json`)。
  - 障害時の観測点 (log) は表示の機能には無く、不要と判断した。
- **同種事象探索**: `color-contrast.*enabled: false` (`src`) は 2 件 (上記 2 ファイル)。
- **推奨アクション**: `docs/prompts.md` か quickstart の実機確認に「light / dark で行の補助テキスト・帯の棒の対比と、ハイコントラスト時のフォーカスの輪を目視する」を 1 行足す。
- **根拠**: 観点 H (検出できるテストの有無)。
- **scope 根拠**: feature のテスト。

### [Low] 帯の区間が見える形では説明されない (L-001) (scope: feature)

- `ConversationMapTab.tsx:163` の区間の時刻の範囲と活動の数は `aria-label` だけで、hover の `title` も Tooltip も無い。見える利用者は時刻の範囲を読めない。
- 区間は最大 48 個、`flex-1` で幅は右のペインの幅の 1/48 (約 6px 程度) で、ポインタの的も小さい。
- WCAG 2.1 に AA の目標サイズ基準は無いので Low。`title` を付けるだけで改善する。

### [Low] 行を選んだ後、中央が移ったことが支援技術に伝わらない (L-002) (scope: feature)

- `ConversationMapTab.tsx:267-273` の `activate` は、フォーカスを地図に残す仕様 (FR-010) のため、移動の結果を伝える手段が `aria-current` の更新だけである。
- スクリーンリーダーの利用者は、Enter の後に何が起きたか分からない。短い live region (例: 「中央を 10:00 のターンへ移しました」) があるとよい。

### [Low] 日付つきの短い書式と、支援技術の名前 (全体の書式) が一致しない (L-003) (scope: feature)

- `MessageTimeLabel.tsx:50-51` の見える文字は、過去日で「10/16 10:00」、sr-only の名前は「全体 2026/10/16 10:00:00」で、連続した部分文字列にならない。音声操作で見える文字を言っても指せない (WCAG 2.5.3)。
- 当日分は「10:00」が名前に含まれるので問題ない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `hover:bg-accent\|bg-accent` (features/**/*.tsx) | 4 | ConversationMapTab.tsx:396、RightPanel.tsx:166、SettingsDialog.tsx:81、SessionListScreen.test.tsx:1079 (コメント)。muted-foreground を重ねるのは本件のみ |
| M-001 | `aria-\[current=true\]` (features) | 1 | ConversationMapTab.tsx:396 |
| M-002 | `bg-primary/[0-9]+` (features/shell) | 0 (BIN_BAR_CLASS 以外) | ConversationMapTab.tsx:84-90 |
| M-003 | `outline-none\|outline-hidden` (renderer/**/*.tsx) | 24 (19 ファイル) | 本 PR 分は ConversationMapTab.tsx:169、396。`forced-colors` は dialog.tsx の 1 件 |
| M-004 | `tabIndex=\{0\}` (renderer/**/*.tsx) | 4 | MessageTimeLabel.tsx:21 (コメント)、49、image.tsx:332、attachment.aui.tsx:170 |
| M-005 | `color-contrast.*enabled: false` (src) | 2 | ConversationMapTab.test.tsx:25、MessageTimeLabel.test.tsx:33 |

Critical は申告していない。

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 3
- Round inheritance: 該当なし (Round 1)

(Medium の内訳: M-001〜M-004 は観点 G、M-005 は観点 H。冒頭の A-H 行の集計は G が Medium 4、H が Medium 1。)
