# a11y-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: a11y-reviewer
**Spec**: `specs/001-runtime-folder-registration-runtime-detection/spec.md`
**Round**: 2 (code-gate iteration 2)
**Diff scope**: `git diff main...HEAD` (working tree clean)、`src/renderer/` 配下 UI + `src/renderer/index.html`

> **本ファイルの保存経緯**: `a11y-reviewer` は `reviewer-base.md` §5 の read-only 規定により
> `Read` / `Grep` / `Glob` のみを持ち `Write` を持たない。本文は reviewer の最終報告をそのまま
> code-gate が保存したものである。

## 初回読了 viewpoint

- FR/SC: FR-047 (日本語第一言語 / 内部識別子を出さない)、FR-013 / FR-017 / FR-018 / FR-019 (登録 UI の導線)、FR-028 / FR-030 / FR-031 (選択肢と越境案内)、FR-009 (不足依存の導線)、SC-006 / SC-007 / SC-011 / SC-013 / SC-015 が renderer 側の表示要件。a11y 固有の FR / SC は **spec に 1 件も無い** (WCAG への言及なし) — 本レビューは Constitution Principle VIII の Manual 検証者としての立場で行う
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md` (UI 表示)、Constitution **Principle VIII** (日本語環境で破綻しない、Verification の Manual に `a11y-reviewer` を名指し)、**Principle XIII** (独自デザイントークンを足さない) — 配色修正の提案は既存パレット内に収める必要がある
- A. 認可 / 認証 / RLS: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0 — MF-001 の訂正 (Constitution v1.2.2 / AD-024 #18) を再検証し **解消を確認**。新規 drift なし
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の Owner 範囲 (重複指摘は出さない)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の Owner 範囲。ただし a11y lint の未導入は G で扱う
- G. DB / API / **a11y** / perf / OpenAPI / UX state: Critical:0 **High:2 Medium:9 Low:6**
- H. テスト / coverage / observability / regression: Medium:1 Low:1 (自分の owner cat 内: a11y 回帰を止める自動経路、MF-001 回帰テストの実効性)

## スコープ要約

iteration 1 の MUST_FIX 3 件 (MF-001 / MF-006 / MF-007) の再検証と、修正が持ち込んだ新規違反の探索、
および前回 SHOULD_FIX / CONSIDER の残存確認を行った。対象は `src/renderer/index.html`、
`App.tsx`、`features/{runtime-list,workspace-folders,folder-runtime-resolution,chat}/*.tsx`、
`components/assistant-ui/elements/{error-state,loading-state,empty-state,surfaces,thread.aui}.tsx`、
`components/ui/{button,dialog,textarea}.tsx`、`assets/main.css` (design token)。
**3 件はいずれも解消している。** 一方で SF-004 (フォーカス喪失) は修正コメントが解消を宣言しているが
**実際には解消していない**。加えて `lang="ja"` を宣言したことで、`thread.aui.tsx` の英語 UI 文字列が
**WCAG 3.1.2 (Language of Parts, AA) の対象として新たに成立**した。Critical は 0 件。

---

## 1. iteration 1 MUST_FIX の再検証

| ID | 判定 | 根拠 |
|---|---|---|
| **MF-001** | **解消** | `.specify/memory/constitution.md:10-26` (Sync Impact v1.2.2) / `:424` (`amended: 2026-09-16`) / `:440` (「対象が無い」→「送信経路を `isDisabled: true` で閉じている」) / `:442` (`bad_pattern_grep` は番人ではないと明記) / `:702-705` / `:756` / `:768` (Version 1.2.2)。`src/renderer/src/features/chat/ChatScreen.tsx:42` が `isDisabled: true`、`:45-54` の `onNew` が到達時に throw。`ChatScreen.test.tsx:23-45` が 2 本で固定。**事実誤認の訂正・根拠の差し替え・回帰テストの 3 点すべてが揃っている** |
| **MF-006** | **解消** | `src/renderer/index.html:7` が `<html lang="ja">`、`:10` が `<title>Closta</title>`。`:2-6` に lang が必須である理由 (WCAG 3.1.1) がコメントで残っている |
| **MF-007** | **解消** | `ResolutionScreen.tsx:125-131` — `<Button>` 自体が削除され、`blocked` のときだけ `<span>今は使えません</span>` を出す形になった。**`onClick` を後付けするのではなく対話要素をやめる**という、iteration 1 の推奨のうち適切な側が採られている。`features/` 配下に `onClick` 無しの `<Button>` は 0 件 (下記 cascade 表 V-3) |

**新規 a11y 違反の持ち込み**: MF-007 の修正は要素を減らしただけで新規違反なし。MF-001 の修正は
テストの追加のみで UI 変更なし。**MF-006 の修正は 1 件だけ副作用がある** — `lang="ja"` を宣言したことで
`thread.aui.tsx` の英語文字列が言語不一致として顕在化する (M-001)。ただしこれは
「lang が無いほうが良かった」という意味ではない (無指定時は OS 既定音声が日本語本文を読み崩す)。
**正味では改善であり、残りは英語文字列側で塞ぐべきもの**である。

---

## 2. Findings

### [High] フォーカスリングが約 1.5:1 で、キーボード利用者が現在位置を追えない (H-001) (scope: feature)

- **Where**: `src/renderer/src/components/ui/button.tsx:7` (`focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`) / `src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx:432` (表示名 input) / `src/renderer/src/components/ui/dialog.tsx:71` (`focus:ring-ring`) / `src/renderer/src/components/ui/textarea.tsx:9`
- **Issue**: `--ring` は light で `oklch(0.705 0.015 286.067)` (≒ `#a1a1aa`、`main.css:104`)。白背景 (`--background: oklch(1 0 0)`) に対して **`ring/50` は約 1.5:1、不透明の `border-ring` でも約 2.6:1**。どちらも 3:1 に届かない。`outline-none` が併記されているため**ブラウザ既定のフォーカスリングは消えている**
- **Why**: WCAG 2.1 **1.4.11 Non-text Contrast (AA)** はフォーカス表示を含む「状態を示す視覚情報」に 3:1 を課す。本 feature の主要導線 (所在選択 → ブラウズ → 表示名入力 → 登録 / 再検出 / 解除ダイアログ) は**すべて `Button` と `input` の連続**であり、フォーカス位置が見えないとキーボード単独では操作順序を追えない。既定リングを消したうえで代替が不足しているので、**2.4.7 Focus Visible (A) も実質満たしていない**。`features/` 配下の `<Button>` は 15 件、全件がこの 1 つの `cva` を通る (cascade 表 V-1)
- **Suggested fix**: 独自トークンを足さずに済む形が 2 つある。(a) `main.css:104` の `--ring` を既存の `--muted-foreground` 相当の暗さ (`oklch(0.552 …)` ≒ 4.8:1) に寄せる。(b) `button.tsx` の `focus-visible:ring-ring/50` を `focus-visible:ring-foreground/60` に替える。**dark 側 (`main.css:130` の `--ring: oklch(0.552 …)`) も同時に確認すること** — 暗背景では逆に暗すぎる。Principle XIII は「トークンを**足すな**」であって「既存トークンの値を調整するな」ではないため、(a) は Principle 上も採れる

### [High] フォルダ階層を移動するたびフォーカスが `<body>` に落ち、移動先も通知されない (H-002) (scope: feature)

- **Where**: `src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx:392-418` (`entries.map` の `<button>`) / `:341` (現在地の `<p>`) / `:343-351` (「読み込み中も骨格を残す」コメント)
- **Issue**: iteration 1 の SF-004 に対し、`:349-351` で **`aria-busy` を付けてブロック全体の unmount をやめる**修正が入り、コメントは「フォーカスが body に落ちていた」問題を解決したと宣言している。しかし**フォーカスを保持していたのはローディング中だけ**である。`entries` は `key={entry.path.value}` で引かれており、移動が完了して新しい `lastOk` が入った瞬間に**押したボタン自身を含む全 `<li>` が差し替わる**。React は removed node の focus を復元しないので、**activeElement は `<body>` に戻る**。移動先 (`cwd`) はただの `<p>` (`:341`) で live region ではないため、到達先も通知されない
- **Why**: WCAG 2.1 **2.4.3 Focus Order (A)**。US-2 AC-4 が「階層移動ごとに待たされることなく」と求めるブラウズ導線で、キーボード利用者は**1 階層下りるたびにヘッダ → ナビ → 所在ボタン群 → ルートへ/親へ を通り直す**ことになる。深い階層ほど線形にコストが増え、実質ブラウズ不能になる。SC-004 が測っているのは応答時間だけなので、この損失はどの計測経路にも現れない
- **Suggested fix**: 移動完了後に**フォーカスを新しい一覧の先頭項目 (または一覧コンテナの `tabIndex={-1}` なラッパ)** へ移す。`cwd` を出している `:341` の `<p>` を `role="status" aria-live="polite"` にして到達先パスを通知する (`:470` の live region と同じ形が既にある)。ローディング中の骨格保持 (`:349`) はそのまま活かせる

### [Medium] `lang="ja"` の下で英語の可視テキストと accessible name が残っている (M-001) (scope: feature)

- **Where**: `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:237-239` (`<h1>How can I help you today?</h1>`) / `:280` (`placeholder="Send a message..."`) / `:285` (`aria-label="Message input"`) / `:340` (`aria-label="Send message"`) / `:118` (`<span className="sr-only">Loading conversation</span>`) / `:460` (`aria-label="Assistant is working"`) / `src/renderer/src/components/ui/dialog.tsx:74` (`<span className="sr-only">Close</span>`)
- **Issue**: MF-006 の修正で文書言語が `ja` になった。これらの英語文字列には `lang="en"` が無いため、**日本語音声で英語綴りを読み上げる**ことになる (「Message input」→ 日本語 TTS の読み崩し)。`ChatScreen.test.tsx:27` が `findByLabelText('Message input')` で引いていることが、**利用者に見える名前が英語のままである**ことを裏から示している
- **Why**: WCAG 2.1 **3.1.2 Language of Parts (AA)**。あわせて FR-047「UI のラベル・メッセージは日本語を第一言語とする」にも当たる (可視の `<h1>` と placeholder は ux/po 側と重複しうるが、**accessible name と `sr-only` は a11y 固有**なので本レビューで扱う)。ChatScreen は `role="note"` で「入力はできません」と日本語で説明しておきながら、その直下の composer の accessible name だけが英語という**混在**になっている
- **Suggested fix**: 最小修正は 2 段。(a) `dialog.tsx:74` の `sr-only` を「閉じる」にする (Closta 側の部品で、registry 更新との衝突も小さい)。(b) `thread.aui.tsx` は registry の写しなので、`ErrorState` で採った**「prop で受けて既定値は原文のまま」**の手法をそのまま適用する (`error-state.tsx:16-30` に前例と根拠がある)。それが R-1 のスコープ外なら、**少なくとも英語が残る要素に `lang="en"` を付ける**だけで 3.1.2 は満たせる。R-3 で composer を開けるときに (b) を必須化すること

### [Medium] 4 画面のうち 3 画面に `h1` が無く、唯一の `h1` は装飾の英語文 (M-002) (scope: feature)

- **Where**: `src/renderer/src/App.tsx:38` (`<span className="text-sm font-semibold">Closta</span>`) / `RuntimeListScreen.tsx:187` / `WorkspaceFoldersScreen.tsx:256` / `ResolutionScreen.tsx:248` `:273` `:300` (いずれも `<h2>`) / `thread.aui.tsx:237` (アプリ唯一の `<h1>`)
- **Issue**: アプリ名は `<span>` で、各画面の見出しは `<h2>` から始まる。`h1` が存在するのは chat 画面だけで、その内容は `How can I help you today?` — **R-1 では繋がっていない画面の装飾文**である
- **Why**: WCAG 2.1 **1.3.1 Info and Relationships (A)**。スクリーンリーダの見出しジャンプ (H キー / 見出し一覧) が主要なページ内移動手段であり、`h1` 不在は「今どの画面にいるか」を見出しから取れないことを意味する。`RuntimeListScreen.tsx:228` 「一覧に出せなかったディストロ」、`WorkspaceFoldersScreen.tsx:261` 「所在を選んで登録する」、`:509` 「復元できなかった登録が N 件あります」、`ResolutionScreen.tsx:331` 「使えない組み合わせ」は**いずれも見出しとして機能しているのに `<p className="font-medium">`** であり、見出し一覧に 1 つも現れない
- **Suggested fix**: `App.tsx:38` の `Closta` を `<h1>` にする (視覚的サイズは class で据え置ける)。各画面の `<h2>` はそのまま。セクション見出しになっている `<p className="text-sm font-medium">` 4 箇所を `<h3>` にする

### [Medium] ランタイム画面と組み合わせ画面に live region が無い (M-003) (scope: feature)

- **Where**: `RuntimeListScreen.tsx:179` (`GenerationLoader label="ランタイムを検出中"`) / `:124` (`label="判定中"`) / `:148-153` (「判定に失敗しました」) / `ResolutionScreen.tsx:287` (`label="組み合わせを調べています"`)
- **Issue**: iteration 1 の SF-003 は `WorkspaceFoldersScreen` でのみ塞がれた (`:358-359` `:470` `:484-485`)。`GenerationLoader` は `{...props}` を透過するので `role="status" aria-live="polite"` を渡せる設計 (`loading-state.tsx:33-38`) だが、**RuntimeListScreen / ResolutionScreen の 3 箇所は渡していない**。`RuntimeListScreen` の「再検出」は押下後 `refreshing` が立って一覧が差し替わるだけで、完了が通知されない。判定失敗のテキスト (`:148`) も `role="alert"` ではない
- **Why**: WCAG 2.1 **4.1.3 Status Messages (AA)**。FR-010 は再検出を利用者の明示操作に限ると定めており、**押した結果が返ったかどうかが唯一のフィードバック**である。それが通知されないと、非視覚の利用者は再検出を何度も押すか、終わったと誤認する
- **Suggested fix**: 3 箇所に `role="status" aria-live="polite"` を渡す (`WorkspaceFoldersScreen.tsx:484-485` と同じ形)。`RuntimeListScreen.tsx:148` の判定失敗は `role="alert"`。`ResolutionScreen.tsx:270-284` の `ErrorState` は既に `role="alert"` を持つ (`error-state.tsx:66`) ので追加不要

### [Medium] テキスト入力欄の境界が約 1.2:1 で、入力欄と認識できない (M-004) (scope: feature)

- **Where**: `WorkspaceFoldersScreen.tsx:432` (`bg-input border-border`) / `main.css:102-103` (`--border` / `--input` = `oklch(0.92 0.004 286.32)` ≒ `#e4e4e7`)
- **Issue**: 表示名 input は塗り (`bg-input`) も枠線 (`border-border`) も `oklch(0.92)` で、白背景に対して**約 1.2:1**。`components/ui/button.tsx:15` の `outline` variant (`border bg-background`) も同じ `--border` を使う
- **Why**: WCAG 2.1 **1.4.11 Non-text Contrast (AA)** は UI コンポーネントを識別するのに要る視覚情報に 3:1 を課す。SF-005 で可視ラベル (`:428-430`) が付いたので「何の欄か」は伝わるようになったが、「そこが入力できる欄である」ことの手がかりは境界だけであり、それが見えない
- **Suggested fix**: `--input` / `--border` は shadcn 既定値なので**全面変更は影響が広い**。最小案は表示名 input の class に既存トークンで濃い枠 (`border-muted-foreground/40` 相当 ≒ 3:1) を足す 1 行。`outline` Button は隣接する白背景に対して同じ問題を持つので、同じ方針を `button.tsx:15` にも適用するかを**別タスクとして切る**ことを勧める (影響範囲が feature を超える)

### [Medium] `ResolutionScreen` の「同一」バッジが 4.5:1 未満 (SF-001 の残り) (M-005) (scope: feature)

- **Where**: `ResolutionScreen.tsx:53-54` — `cross` でないとき `bg-foreground/[0.06] text-muted-foreground`
- **Issue**: iteration 1 の SF-001 は `WorkspaceFoldersScreen.tsx:75-80` の `ReachabilityBadge` で丁寧に直された (emerald-700 / amber-800 / red-700、`:61-74` に根拠コメントあり)。しかし**同じ形の `BoundaryBadge` (`ResolutionScreen.tsx:46-60`) は直っていない**。`--muted-foreground` (`oklch(0.552)` ≒ `#71717a`) は白地では約 4.84:1 で足りるが、**`bg-foreground/[0.06]` (≒ `#f0f0f0`) の上では約 4.24:1** となり、`text-xs` (12px) に要る 4.5:1 を下回る。越境側 (`text-amber-800` on `bg-amber-500/15` ≒ 6.2:1) は問題ない
- **Why**: WCAG 2.1 **1.4.3 Contrast (Minimum) (AA)**。既定テーマが light なので**起動直後に見える状態が不適合**である。FR-029 / FR-030 が「越境を隠さない」ことを中核に据えている画面で、その対語である「同一」だけが読みにくい
- **Suggested fix**: 背景の淡い網掛けをやめて `paper` 上にそのまま置く (それだけで 4.84:1 になる)、または文字色を `text-foreground/80` にする。`WorkspaceFoldersScreen` で採った「既存パレットの段を選び直すだけ」の方針をそのまま適用できる

### [Medium] `ErrorState` の詳細文が約 2.7:1 (M-006) (scope: feature)

- **Where**: `src/renderer/src/components/assistant-ui/elements/error-state.tsx:78-80` — `text-[13px] text-red-600/60 dark:text-red-400/60`
- **Issue**: title (`:77` `text-red-600`) は白地で約 4.8:1 で足りる。**detail は 60% 透過で約 2.7:1** (13px 通常ウェイト)。`bg-red-500/[0.06]` の下地を考慮すると更にわずかに下がる
- **Why**: WCAG 2.1 **1.4.3 (AA)**。detail は「アプリの再起動を試してください」「再判定を試してください。続く場合は…」など**次に取るべき操作そのもの**を運んでいる (`RuntimeListScreen.tsx:167` / `WorkspaceFoldersScreen.tsx:231` / `ResolutionScreen.tsx:277`)。3 画面すべての回復導線がここに集まる (cascade 表 V-2)
- **Suggested fix**: `/60` を落として `text-red-600 dark:text-red-400` にする (title と同じ段)。registry の写しからの逸脱になるが、この部品は既に `retryLabel` / `retryingLabel` prop で逸脱しており、`:16-30` にその理由と方針が記録されている。**同じ枠に追記する形で残すこと**

### [Medium] ファイル項目が `<button disabled>` として公開され、フォルダとの区別が `aria-hidden` の絵文字と淡色だけ (M-007) (scope: feature)

- **Where**: `WorkspaceFoldersScreen.tsx:398-417` — `disabled={!entry.isDirectory}` / `:413` `<span aria-hidden>{entry.isDirectory ? '📁' : '📄'}</span>`
- **Issue**: iteration 1 の CONSIDER「操作できない項目を `<button disabled>` で公開」がそのまま残っている。ファイルは**操作対象ではない**のにボタンとして公開され、`disabled` でタブ順から外れる。種別の手がかりは (1) `aria-hidden` の絵文字 — 支援技術には届かない、(2) `text-muted-foreground` の淡色 — 色のみ、(3) `disabled` 状態、の 3 つで、**支援技術に届くのは (3) だけ**
- **Why**: WCAG 2.1 **1.4.1 Use of Color (A)** / **1.3.1 (A)**。「押せない項目」と「ファイルである項目」が同じ表現になるため、非視覚の利用者は一覧の意味を取り違える。SC-011 が「日本語・非 ASCII を含むフォルダ名が UI 上でそのまま表示される」ことを求めており、**一覧の読み取り自体が要件**である
- **Suggested fix**: ファイルは `<button>` にせず `<span>` のまま `<li>` に置く。絵文字を残すなら `aria-hidden` を外さずに、`<span className="sr-only">フォルダ</span>` / `ファイル` をテキストで併記する

### [Medium] a11y 回帰を止める自動経路が依然 0 件 (SF-013 未着手) (M-008) (scope: feature)

- **Where**: `eslint.config.mjs` / `package.json` — `jsx-a11y` / `axe` の出現 **0 件** (cascade 表 V-4)
- **Issue**: iteration 1 の SF-013 は未着手。**MF-006 (`<html lang>` 欠落)、SF-005 (`<label>` 無し)、M-007 (`aria-hidden` のみの意味伝達) は、いずれも `eslint-plugin-jsx-a11y` の既定 recommended が検出する類**である
- **Why**: Constitution Principle VIII の Verification が Automated 2 項目とも載っていないことを `constitution.md:439` が明記しており、**本 Principle を守るのは Manual の 2 者とテスト 1 本だけ**という状態が続いている。人手レビューだけが番人である限り、iteration をまたいで同じ級の指摘が再発する (実際 M-002 / M-007 は iteration 1 の CONSIDER からの持ち越し)
- **Suggested fix**: `eslint.config.mjs` に `eslint-plugin-jsx-a11y` の `flat.recommended` を `src/renderer/**` 限定で足す。**AD-025 の「ルールは違反サンプルで発火してから信用する」に従い、まず `index.html` の lang を外して発火することを確かめてから固定する**。R-1 で入れないなら、**塞ぐ feature ID を割り当てて記録する** (SC-017 が未検出経路に対して採っている形と同じ)

### [Medium] 画面切替時にフォーカス移動も通知も無い (M-009) (scope: feature)

- **Where**: `src/renderer/src/App.tsx:39-55` (nav) / `:66-70` (`<main>`)
- **Issue**: `<nav>` / `<main>` の landmark と `aria-current="page"` (`:45`) は適切に置かれている。しかしタブを押すと `<main>` の中身が丸ごと入れ替わるのに、**フォーカスは押したタブに留まり、切替先の内容は通知されない**。スキップリンクも無い
- **Why**: WCAG 2.1 **2.4.3 (A)** / **4.1.3 (AA)**。ブラウズ操作を持たない利用者 (キーボード + 拡大鏡など) は、切替後に「何が起きたか」を知る手段がない。加えて各画面に `h1` が無い (M-002) ため、見出しジャンプでの確認も効かない
- **Suggested fix**: M-002 で `h2` → `h1` を整えたうえで、切替後に `<main>` (または画面の `h1`) へ `tabIndex={-1}` + `focus()` を当てる。1 箇所 (`App.tsx`) で閉じる

### [Low] 無効化された composer と `role="note"` バナーが結ばれていない (L-001) (scope: feature)

- **Where**: `src/renderer/src/features/chat/ChatScreen.tsx:64-75` (`role="note"`) / `:42` (`isDisabled: true`) / `thread.aui.tsx:279-286`
- **Issue**: `role="note"` の使い方自体は正しい (警告でも操作結果でもない常設の説明で、`:62-63` の判断根拠も妥当)。ただし `isDisabled: true` が composer の `<textarea>` を `disabled` にするため**タブ順から外れ**、バナーとの `aria-describedby` 関連付けも無い。キーボードで chat 画面に入った利用者は、**何も focus できない領域に着いて理由を得られない**
- **Why**: WCAG 2.1 4.1.2 の境界事例 (`disabled` 自体は適合)。iteration 1 の SF-002 で `WorkspaceFoldersScreen.tsx:294-302` は「`disabled` にせず `aria-disabled` + `aria-describedby`」という良い形に直っており、**同じ問題に対する扱いが画面間で不揃い**になっている
- **Suggested fix**: バナーに `id` を振り、composer 側に `aria-describedby` を渡す。`thread.aui.tsx` に prop を通す必要があるため、M-001 の (b) と同じ改修にまとめると 1 回で済む。R-1 では**バナーを composer の直前に置いたままでも読み順は成立する**ので優先度は低い

### [Low] `role="alert"` が一覧内で複数同時に mount されうる (L-002) (scope: feature)

- **Where**: `ResolutionScreen.tsx:76` — `boundary: 'cross'` かつ `recommendation === null` の組み合わせごとに `role="alert"`
- **Issue**: この `<div>` は `options.map` の中にあり、**初回描画時に複数が同時に mount されうる**。`role="alert"` は assertive なので、読み上げ中の内容を各件が割り込んで潰し合う
- **Why**: WCAG 4.1.3 の意図 (状態メッセージは利用者の作業を中断しない) に反する。案内取得に失敗した「事実を示す」目的 (`:73` のコメント) は polite で足りる
- **Suggested fix**: `role="alert"` を外し、リストの外に 1 つだけ `role="status" aria-live="polite"` の集約行を置く (「N 件の越境組み合わせで案内を取得できませんでした」)

### [Low] テーマ切替ボタンのラベルが状態か操作か判別できない (L-003) (scope: feature)

- **Where**: `App.tsx:57-63` — `{dark ? 'ライト' : 'ダーク'}`
- **Issue**: 「ライト」が現在のテーマなのか切替先なのかがラベルから決まらない。accessible name もこの 1 語だけで、`aria-pressed` も説明もない
- **Suggested fix**: 「ライトモードに切り替える」のように動詞を含む名前にする (可視文字を短く保ちたいなら `aria-label` で補う)

### [Low] `GenerationLoader` のラベルが約 4.4:1 (L-004) (scope: feature)

- **Where**: `loading-state.tsx:56` (`ShimmerLabel className="text-foreground/55 … text-sm"`) / `error-state.tsx:56`
- **Issue**: `--foreground` (≒ `#09090b`) の 55% を白地に置くと**約 4.4:1** で、14px 通常ウェイトに要る 4.5:1 をわずかに下回る。計算値であり実測ではない点は明記しておく。ドット自体は `aria-hidden` (`loading-state.tsx:40`) なので対象外、`motion-reduce:animate-none` / `motion-reduce:transition-none` は `surfaces.tsx` 全体で一貫して置かれており **H (Motion) は問題なし**
- **Suggested fix**: `/55` → `/70` 程度。registry 写しの共通部品なので、M-006 と同じ「逸脱理由をコメントで残す」枠にまとめる

### [Low] 同一文言のエラーが連続すると live region が再読み上げされない (L-005) (scope: feature)

- **Where**: `WorkspaceFoldersScreen.tsx:470-476`
- **Issue**: 常時マウント + 中身差し替えという形自体は正しい (`:465-469` のコメントどおり)。ただし**同じ失敗を 2 回起こすとテキストが変化せず**、支援技術は変更なしと判断して読み上げない (例: 権限のないディレクトリを続けて 2 回開く)
- **Suggested fix**: エラーに連番 / タイムスタンプを持たせ、再発時に DOM テキストが必ず変わるようにする

### [Low] MF-001 の IME 回帰テストが自明に通る (L-006) (scope: feature / cat H)

- **Where**: `ChatScreen.test.tsx:32-45`
- **Issue**: 2 本目「変換確定直後の Enter が送信経路に届かない」は、**入力が `disabled` である以上 IME ガードの有無にかかわらず通る**。つまりこのテストが実際に固定しているのは 1 本目と同じ「`isDisabled` が効いていること」である
- **Why**: 悪い状態ではない — Constitution v1.2.2 が主張しているのは「送信経路を閉じている」ことであり、テストはその主張を正しく守る。ただし**テスト名が実際より強い保証を約束している**ため、R-2 で composer を開けたときに「もう IME テストがある」と誤読される余地がある
- **Suggested fix**: テスト名を「無効化により Enter が送信経路に届かない」に改め、`:17-19` の申し送り (R-2 で書き換える) を名前側にも反映する

---

## 3. 前回 SHOULD_FIX / CONSIDER の追跡

| iteration 1 ID | 状態 | 根拠 |
|---|---|---|
| SF-001 到達可能性バッジの contrast | **部分解消** | `WorkspaceFoldersScreen.tsx:75-80` は解消。`ResolutionScreen.tsx:53-54` の `BoundaryBadge` が残る → **M-005** |
| SF-002 `disabled` の理由が結ばれていない | **部分解消** | `WorkspaceFoldersScreen.tsx:294-302` が `aria-disabled` + `aria-describedby` に改修済み (良い形)。`ChatScreen` の composer (**L-001**) と `:374` 「親へ」 / `:445` 「ここを登録する」 / `:406` ファイル項目 (**M-007**) は未着手 |
| SF-003 live region 不在 | **部分解消** | `WorkspaceFoldersScreen` のみ (4 箇所)。RuntimeList / Resolution が残る → **M-003** |
| SF-004 移動時のフォーカス喪失 | **未解消 (解消宣言あり)** | → **H-002** |
| SF-005 表示名 input のラベル | **解消** | `WorkspaceFoldersScreen.tsx:427-441` — 可視 `<label htmlFor>` + `aria-describedby` の hint。`:421-426` に理由も記録 |
| SF-013 jsx-a11y / axe 未導入 | **未解消** | → **M-008** |
| CONSIDER `h1` 不在と見出し階層 | **未解消** | → **M-002** |
| CONSIDER 入力欄の非テキスト対比 | **未解消** | → **M-004** |
| CONSIDER フォルダ / ファイルが絵文字と色のみ | **未解消** | → **M-007** |
| CONSIDER `<button disabled>` での公開 | **未解消** | → **M-007** |
| CONSIDER ローダが `tick={0}` で静止 | **未解消 (影響軽微)** | ドットは `aria-hidden` (`loading-state.tsx:40`) なので a11y 上の害はない。`prefers-reduced-motion` 対応は `motion-reduce:*` が全部品で一貫しており **良好** |
| CONSIDER `ErrorState` の `Retry` だけ英語 | **解消** | `error-state.tsx:28-29` の prop 化 + 3 画面すべてで日本語を渡している (`RuntimeListScreen.tsx:169-170` / `WorkspaceFoldersScreen.tsx:232-233` / `ResolutionScreen.tsx:279-280`) |
| CONSIDER タブ切替で状態が全破棄 | ux Owner (重複回避のため本レビューでは扱わない)。a11y 側の残りは **M-009** |

---

## 4. 同種事象探索 cascade summary

Critical は 0 件だが、High 2 件と主要 Medium について同種事象を全数確認した。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `focus-visible:ring-ring\|focus-visible:border-ring\|focus:ring-ring` (`src/renderer/src`) | **4** | `components/ui/button.tsx:7` (features 配下の `<Button>` 15 件が全件経由) / `components/ui/textarea.tsx:9` / `components/ui/dialog.tsx:71` / `features/workspace-folders/WorkspaceFoldersScreen.tsx:432` (+ `components/assistant-ui/elements/attachment.aui.tsx:165`) |
| H-002 | `key=\{.*path\.value` / `entries.map` (`src/renderer/src/features`) | **1** | `features/workspace-folders/WorkspaceFoldersScreen.tsx:398-417` (ブラウズ一覧はこの 1 箇所のみ。他画面に同形の再マウント経路なし) |
| M-001 | `aria-label="[A-Za-z]\|sr-only` (`src/renderer/src`) | **7** | `thread.aui.tsx:118,285,309,324,340,353,460` / `dialog.tsx:74` / `empty-state.tsx:95` (未使用経路) |
| M-003 | `aria-live\|role="status"\|role="alert"` (`src/renderer/src/features`) | **5** (うち 4 件が `workspace-folders`) | `workspace-folders/WorkspaceFoldersScreen.tsx:358,359,470,484,485` / `runtime-list/RuntimeListScreen.tsx:205` / `folder-runtime-resolution/ResolutionScreen.tsx:76`。**RuntimeList のローダ 2 箇所と Resolution のローダ 1 箇所は 0 件** |
| M-006 | `ErrorState` 利用箇所 (`src/renderer/src/features`) | **3** | `RuntimeListScreen.tsx:165-173` / `WorkspaceFoldersScreen.tsx:228-236` / `ResolutionScreen.tsx:274-281` |
| M-008 | `jsx-a11y\|axe\|a11y` (`*.{mjs,json,ts,yml}`) | **0** (`.specify/spec-gate/reviewers.yml:2` の reviewer 名のみ) | 該当なし |
| V-3 (MF-007 再検証) | `<Button` に `onClick` が無い箇所 (`src/renderer/src/features`) | **0** | `ResolutionScreen.tsx:125-131` でボタン自体が削除済み |

---

## Verdict

- Critical: **0**
- High: **2** (H-001 フォーカスリング contrast / H-002 ブラウズ時のフォーカス喪失)
- Medium: **9**
- Low: **6**
- Round inheritance: **resolved from 1: 5** (MF-001 / MF-006 / MF-007 / SF-005 / CONSIDER `Retry` 英語) / **partially resolved: 3** (SF-001 / SF-002 / SF-003) / **unresolved: 6** (SF-004 / SF-013 / CONSIDER 4 件) / **new: 5** (H-001 / M-001 / M-004 / M-009 / L-006)

**iteration 1 の MUST_FIX 3 件はいずれも解消しており、a11y 由来の MUST_FIX 残件は 0。**
修正による新規違反は M-001 (`lang="ja"` 宣言で英語文字列が 3.1.2 の対象として顕在化) のみで、
これは MF-006 の修正を撤回すべき理由にはならない。

H-001 / H-002 は**今回新たに観察したもの (H-002 は「解消済み」と宣言されている箇所の再検証で判明)** であり、
どちらもキーボード単独利用者が R-1 の主要導線を完走できるかに直結する。
severity 判定の禁則 (仮定的な将来経路 / 二重防御) には当たらないが、
「現時点でユーザデータ漏洩・権限昇格・サービス停止に直結」する経路ではないため **Critical にはしていない**。
