# Tasks: Thread 検索と探す操作 (O-3)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md) / [quickstart.md](./quickstart.md)

**記法**: `[BE]` domain / main / preload、`[FE]` renderer、`[SH]` 横断 (docs・規則・E2E・検証)。行末の `[P]` は、同じ節の中で他のタスクと並行に進めてよいもの (別のファイルで、同じ節の未完了のタスクに依らない。implementer は `[P]` でも直列に進める)。targets=both の Backend / Frontend / Shared の区分はタグと末尾の索引 (`Backend Tasks (index)` ほか) で示す (User Story ごとの節を保つため)。

**規則の正本**: 振る舞いの正本は spec の FR / SC、一致の規則・検索の状態と強調・palette の操作・記録の形と読み込みの扱い・文言・区画の並び・E2E の固定データの正本は data-model、方式の理由は research。本書は作業単位とテストの観点だけを書く。テストは spec の SC が計測経路として名指すので各タスクに含める。

**着手の条件**: design-gate の PASS (status `implementing`)。AD-045 の accepted と spec の U-1〜U-6 の承認 (2026-10-05)、O-7 (spec 013) のマージ (PR #13) は済み。

**順序の制約**: SH-002 (直書きの基準線) → コードの変更。SH-003 (element の照合) → FE-024 / FE-031。FE-001 (正規化) → FE-002 → US-1 / US-3。BE-043 (capability の型) → FE-040 / FE-041。SH-040〜SH-042 (記録) は最後、SH-043 (検証) はその後。

## 先行

- [x] **SH-001** [SH] **glossary を追随させる** (Principle XIV。spec FR-016): `docs/glossary.md` に、セッションの検索 (element 名は Thread search)、会話内検索、Command palette、起動元 (`preset` / `manual`)、起動の利用記録 (`LaunchUsage`。Counterexamples に「ローカル利用ログ」「再利用率の記録」) を足す。大きいファイルなので足す位置を Grep で決めてから Read する [P]
  - 「起動元」の数え方は spec FR-009 / data-model §4「renderer の起動元」を正本として引く。「前回の設定を変えずに起動し直した起動は、その設定と組の起動元を引き継ぐ」の 1 文を入れる
  - 既存の Launch notice (`glossary.md:428`) の「起動の初期値 (`launch.lastConfig`) は含まない」を「起動の初期値 (`launch.lastConfig` と `launch.lastOrigin`) は含まない」に直す
- [x] **SH-002** [SH] **直書きの基準線を数える** (AD-045:35。plan「文言と i18n」): コードを変える前に、`src/renderer/src` のコンポーネント (`*.tsx`。テストを除く) の中の日本語の直書きの件数を数え、数え方 (Grep の式と対象のファイルの範囲) と件数を AD-045 の `## Confirmation` に書く。AD-045 の Consequences が定める追記で、他の字面は変えない [P]
- [x] **SH-003** [SH] **element を取り込んで照合する** (Principle XIII。research R-04 / plan RK-01): SH-002 の後に `npx assistant-ui@latest add elements-command-palette elements-conversation-search` で取り込み、research R-04 の採る条件 (a)〜(e) で照合する (観点に本番の CSP `style-src 'self'` の下で動くことと、(e) の命令の id から DOM の id・セレクタを組まないこと)。新しい npm の依存を足さない (plan Technical Context)
  - 採るなら見た目の部品として `components/assistant-ui/elements/` に置き、手を入れたら `eslint.config.mjs:557-599` の手書きの element の一覧に足す。conversation-search のスクロールバーの一致の印は出さない
  - 採らないなら取り込んだファイルを消し、FE-024 / FE-031 は Radix の Dialog (`components/ui/dialog`) と既存の Button で作る
  - thread-search は使わない (research R-04)。照合の結果の正本は PR の説明で、research R-04 と対応表の F 節の備考 (SH-041) は写し

## 土台 (共有の純関数・面の状態・composer の文言)

- [x] **FE-001** [FE] `src/renderer/src/features/search/text-search.ts` (+ `text-search.test.ts`。新設) — data-model §1「正規化」の 4 段と `normalizeForSearch` / `normalizeWithMap` / `toTerms` / `matchesAllTerms`。検索語から `RegExp` を組まない [P]
  - テスト (SC-001): 全角 / 半角・大文字 / 小文字・半角カナと半角の濁点 (`ｶﾞ` → `ガ`)・TAB / 改行 / U+3000 の圧縮・C0 / DEL / C1 / 双方向制御 / ゼロ幅の除去・複数語の AND・`null` のフィールド・空白だけの語で絞り込まない・`.*` / `(a+)+` / `[` を含む語を字面で扱う・`normalizeForSearch(s) === normalizeWithMap(s).text`・`㍿` / `İ` / U+FDFA / 合字を含む文字列で `sourceStart` / `sourceEnd` が書記素の境界を指す
- [x] **FE-002** [FE] `src/renderer/src/features/search/session-search.ts` (+ test。新設) — data-model §1「Thread search の対象」と「palette のセッションの候補」の稼働中の対象。グループの見出しは `features/session-list/group-label.ts` の `groupLabelOf` を使い、新しい導出を作らない。行ごとの正規化したフィールドは索引とフォルダの表示名が変わったときだけ作り直す形にする
  - テスト: 登録フォルダの表示名・保留の所在・未登録の見出し・`cwdDisplay`・`customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` で一致、`cwd.value` にだけある語で一致しない (Principle I)、`null` のフィールドを持つ行が落ちない、稼働中の行が作業フォルダの表示名とランタイムの表示名で一致
- [x] **FE-003** [FE] `src/renderer/src/stores/ui.ts` (+ `ui.test.ts`) — `paletteOpen` / `setPaletteOpen` (data-model §3)、`conversationSearchRequest` (単調増加) / `requestConversationSearch` (data-model §2)、`watchedIdOf` の条件に `!paletteOpen`。`RunningSessionList.tsx:156` の呼び出しに値を渡す (`SessionAttentionAnnouncer.tsx:28` は state をそのまま渡すので型が通ることだけ確かめる)。テスト: palette を開いている間の `watchedIdOf` が null、要求の値が呼ぶたびに増える [P]
- [x] **FE-004** [FE] **composer の名前と placeholder を日本語にする** (spec FR-014。research R-06): `components/assistant-ui/elements/thread.aui.tsx:580,585` を `features/chat/labels.ts` の `composerInput` / `composerPlaceholder` (data-model §5) から取る。`ComposerPrimitive.Input` は差し替えない (AD-037)。先に `Message input` / `Send a message` を Grep で全件取り、E2E (`e2e/support/launch.ts:59`・`e2e/multi-session.spec.ts`・`e2e/launch-dialog.spec.ts`)・component テスト (`ChatScreen.test.tsx`・`AppShell.test.tsx`)・`perf/real-sessions.spec.ts:93,200` (文字列だけ。perf は実行しない) の locator を 0 件まで直す。他のボタンの英語の名前は直さない (plan RK-08)。`composer-fullwidth` の基準画像が CI で変わったら CI の artifact から取り直し、理由を `quickstart-results.md` に書く [P]

## US-1 — セッション一覧を絞り込んで目当てのセッションを開く (P1)

**Goal**: Thread search と過去の区画の並び (spec FR-001 / FR-002 / FR-017 / FR-018)。

**Independent Test**: 一覧の component テスト (絞り込み・件数・空の結果・解除・ランドマーク・ツールチップ) と、サイドバーの領域の E2E (基準画像と高さ)。

- [x] **BE-010** [BE] `src/main/app/e2e-capability.ts` — data-model §7「固定の索引」。`listSessions` / `refreshSessions` (`:393-394`) が `emptySessionIndex` の代わりに固定の索引を返す。先に `e2e/` を Grep し、既存の E2E が過去の一覧の空を前提にしていないことと、固定データの題が既存の locator (起動・composer・稼働中の行) と重ならないことを確かめる (plan RK-07)。会話の本文・設定の値・資格情報を含めない (AD-038 / H-3) [P]
- [x] **FE-010** [FE] `src/renderer/src/features/session-list/SessionListScreen.tsx` / `labels.ts` — Thread search (data-model §1「Thread search の状態」「Thread search の空の状態」・§5 の `session-list/labels.ts` の行)
  - 先に区画の開閉の既存のテスト (未登録は既定で畳む・`aria-expanded`) を流し、同じ振る舞いのまま開閉の状態を `Section` (`:203-204`) から `SessionListScreen` に上げる (plan RK-10)
  - 検索欄・件数 (`role="status"`)・消すボタン、絞り込みの順 (`visible` の導出 `:787-797` の最後に語。`rowKeys` と `sessions` の順と長さを保つ)、検索中は一致のある区画を開いて描く、`search-empty` を空の表示の優先順位 (`:843-858`) の 2 番目に、入力の Enter / Esc の扱い (変換中は何もしない・`preventDefault` しない)
- [x] **FE-011** [FE] `SessionListScreen.tsx` / `features/shell/Sidebar.tsx` / `components/assistant-ui/elements/thread-list.aui.tsx` — 過去の区画の並び (data-model §6): 見出しと検索欄だけを固定し、取得時刻・「列挙の結果」・絞り込み・空の状態・グループをスクロールの領域に入れる (`Sidebar.tsx:140-151` の包みは高さを渡すだけにする。6rem と上限 `:135` は変えない)。`Outcomes` の 1 行の要約 (`outcomesAllOk`)、グループを `div role="group"` + `aria-labelledby` (h3) に (見出しと開閉の中身の id は `Section` の `useId()` から作り、区画の鍵から作らない。data-model §6)、過去の行に `renderTooltip` (`rowTitleText` をテキストで)。`thread-list.aui.tsx:38` の注記を plan の申し送り #21 のとおりに直す
- [x] **FE-012** [FE] テスト — `SessionListScreen.test.tsx` と `AppShell.test.tsx`
  - US-1 AC1〜AC4 / AC6: 一致した行だけが残り一致の無いグループの見出しが出ない・件数、未登録の畳まれたグループも検索中に出て語を消すと畳みに戻る、全角 / 半角の違いで一致、`search-empty` の文言と解除で語・所在・フォルダが既定に戻る (取得中でも出る)、Esc で解除して開閉が保たれる、変換中の Enter / Esc で解除しない (`isComposing` / 229)、所在の絞り込みとの AND、`filtered-out` の文言とボタンが変わらない
  - US-1 AC7 / SC-008 の component の部分: 過去の区画のグループのランドマークが 0 で `role="group"` の名前が h3、過去の行のツールチップがフォーカスで出る、`<img src=x onerror=...>` を含む題で `img` 要素が 0、`coverage` が complete のとき「列挙の結果」が 1 行・それ以外は今の行
  - 区画の鍵が外部の値を含む場合 (data-model §2「外部由来の値と DOM の id・セレクタ」): 未登録の区画のパスに空白・`"`・`]`・`:` を含むテストのデータで、`role="group"` の名前が h3 の文字列で引ける、開閉のボタンの `aria-controls` と `aria-labelledby` が実在の要素を指す (`document.getElementById` が null でない)、DOM の id に区画の鍵の文字列が出ない
  - US-1 AC5 (`AppShell.test.tsx`): 語と結果が、中央の切り替えとサイドバーの畳み・開きで保たれる
  - vitest-axe の違反 0
- [x] **SH-010** [SH] `e2e/sidebar-screenshot.spec.ts` (新設) — data-model §7「基準画像」「高さの確認」の 2 ケース (FR-018 / SC-008)。撮影は内容の大きさを固定し、同梱フォントを `composer-screenshot.spec.ts:38-49` と同じ方法で当て、`[data-testid="past-sessions"]` を撮って取得時刻の `role="status"` を mask する。高さは既定のウィンドウのまま 10 本を起動して compact にする (`multi-session.spec.ts:203` の手順)。基準画像は本機で作らず CI の e2e job の artifact から取る。`node node_modules/typescript/bin/tsc --noEmit -p e2e/tsconfig.json` が通る

## US-2 — 開いている会話の中を検索して該当箇所に移る (P1)

**Goal**: 会話内検索 (spec FR-003〜FR-005)。

**Independent Test**: 走査と強調の純関数の単体、transcript を描いた形の component テスト、`e2e/ime.spec.ts` の 1 ケース。

- [x] **FE-020** [FE] `src/renderer/src/features/chat/conversation-search.ts` (+ test。新設) — data-model §2「状態」「走査」「移動」の純関数の部分 (`SearchableMessage` の作り方・語全体の出現・`WeakMap` の cache・変わった object だけの走査・呼び出しを数えられる形・`current` の維持と消えたときの規則・次 / 前と端の折り返し) [P]
  - テスト (SC-002): 語の変化で全件の走査が 1 回、メッセージの追加・本文の伸び・送り直しで変わったメッセージだけを走査、`current` が同じキーを指し続ける、消えたら前・前が無ければ最初、tool の入力・結果・Reasoning・data part・システムイベントの行に一致しない (FR-004)、添付のファイル名と圧縮の境界の text part は対象、正規化した語が空なら 0 件、1,000 メッセージの走査の時間を参考値として出力 (合否に使わない)
- [x] **FE-021** [FE] `src/renderer/src/features/chat/search-highlight.ts` (+ test。新設) / `src/renderer/src/assets/main.css` — data-model §2「強調」。登録先 (`CSS.highlights`) を注入できる形にし、`::highlight(closta-search)` / `::highlight(closta-search-current)` は `main.css` に既存のテーマのトークンで置く (実行時に `<style>` も `style` 属性も足さない) [P]
  - テスト (jsdom で作った `Range` を検査): text node をまたぐ出現、`㍿` / `İ` / U+FDFA / 合字 / ゼロ幅 / 双方向制御を含む本文で例外が出ず元の一致の範囲に掛かる (US-2 AC8)、範囲外の位置を飛ばす、描画に k 番目が無いとき現在の強調を出さない、強調の前後で DOM が変わらない、hits の id が `a"],[data-message-id="b` や `"` `\` `]` `,` 改行を含んでも例外が出ず、その id のメッセージだけに掛かる (id が `b` のメッセージに掛からない。data-model §2「メッセージの要素の引き方」)
- [x] **FE-022** [FE] `src/renderer/src/features/chat/transcript-context.ts` / `components/assistant-ui/elements/thread.aui.tsx` — navigator (data-model §2「移動」): 仮想パス (`:316-342`) と非仮想パス (`:214-217`) の両方で `scrollToMessage(id): boolean` を登録し、移るときに `stickyRef` を切る。メッセージの root (`:715,1007` 付近) に `data-message-id`、text part の描画 (assistant の `MarkdownText` `:771`・user の本文) の外側に `data-search-text`。要素は `transcript-context.ts` の `findMessageElement(root, id)` (固定のセレクタで集めて `dataset.messageId === id` で照合) で引き、id を CSS セレクタの文字列に埋め込まない (data-model §2「メッセージの要素の引き方」)。テスト: 41 件以上 (仮想) で範囲の外の id へ移ると描かれる、40 件以下 (非仮想) で `scrollIntoView` が呼ばれる、知らない id で `false`、移った後に下端への追従が止まる、両方のパスで id が `"` `\` `]` `,` 改行を含んでも例外が出ずその id のメッセージへ移る、id が `a"],[data-message-id="b` のメッセージへ移ると id が `b` のメッセージではなくそのメッセージが画面に入る [P]
- [x] **FE-023** [FE] `src/renderer/src/features/session/RunningSessionsProvider.tsx` / `running-sessions-view.ts` — `RunningSessionsView.revealMessage(id)`: `useLiveRuntime` の窓 (`RunningSessionsProvider.tsx:126-137`) をそのメッセージまで広げる (「さらに表示」と同じ操作。research R-03 / plan RK-04)。テスト: 窓の外の id で窓が広がり、窓の中の id・知らない id で変わらない [P]
- [x] **FE-024** [FE] `src/renderer/src/features/chat/useConversationSearch.ts` / `ConversationSearchProvider.tsx` / `ConversationSearchBar.tsx` (新設) / `labels.ts` — data-model §2「移動」「開く・閉じる・キー」と §5 の `chat/labels.ts` の行: provider は `messages` と `reveal` を props だけで受け、`features/session` / `features/shell` を import しない (data-model §2「本文の供給元」)、150ms の間引き、語の変化で最初の一致へ、`scrollToMessage` が `false` で props の `reveal` があれば (稼働中) `reveal(id)` の後の描画でもう一度、Ctrl+F (`window` の capture)、`conversationSearchRequest` の購読 (要求を受けたらバーを開き (開いていればそのまま)、入力欄へフォーカスを移す。data-model §3「閉じた後のフォーカス」の `chat:search`)、検索のバーの Enter / Shift+Enter / Esc の IME のガード、件数と位置、0 件の `EmptyState` (`searchNone` / `searchNoneHint`)、閉じたら強調を 2 つとも消す。SH-003 で conversation-search を採ったならその部品で描く
- [x] **FE-025** [FE] `src/renderer/src/features/shell/CenterPane.tsx` / `CenterHeader.tsx` / `src/renderer/src/features/chat/ChatScreen.tsx` — data-model §2「本文の供給元」: provider は `CenterPane` に置かず、子の `RunningCenter` / `PastCenter` がそれぞれの中で中央のヘッダと本体を包む (`CenterEmpty` には置かない)。`key` も子が付ける (稼働中は `live.sessionId`・過去は `selectedRowKey`)。`PastCenter` は先頭 (`key` の外) で `useTranscript()` を 1 回呼んで provider と本体に渡す (`ChatScreen` を取得と本体に分けて本体を export。単体の `ChatScreen` は今のまま動く)。`RunningCenter` は表示中のセッションのストアの `messages` (全件) と `reveal` (= `RunningSessionsView.revealMessage`) を props で渡す。`CenterHeader` に検索のボタン (`searchOpen`)
- [x] **FE-026** [FE] テスト — `src/renderer/src/features/chat/ConversationSearch.test.tsx` (新設。中央を描いた形)
  - US-2 AC1〜AC7: 件数と n / m・最初の一致へ移って強調、次 / 前と端で反対の端へ、仮想化の範囲の外の一致へ移って描かれる、閉じた Tool group / Reasoning の中だけの語で 0 件と FR-008 の空の状態、実行中のメッセージの追加とストリーミングで件数が増えても `current` とスクロールが変わらない、閉じると強調が消えスクロール位置はそのまま、変換中の Enter / Shift+Enter / Esc で移らず閉じない
  - id に `"` `\` `]` やセレクタの断片 (`a"],[data-message-id="b`) を含むメッセージがある transcript で、検索・移動・強調が例外を出さず (error boundary に届かない)、現在の一致の強調と移動先がその id のメッセージに掛かる (spec Edge Cases)
  - 窓の外の一致で `revealMessage` が呼ばれて移る、composer にフォーカスがあっても変換中でなければ Ctrl+F で開く、`[aria-modal="true"]` の要素が開いている間の Ctrl+F で開かず `preventDefault` されない、セッションの切り替えと中央の未選択で閉じる、過去の transcript の取得が 1 本 (port が 2 つ開かない)、`ChatScreen.test.tsx` / `ChatScreen.o2.test.tsx` の既存の観点が通る、vitest-axe の違反 0
- [x] **SH-020** [SH] `e2e/ime.spec.ts` — 「検索のバーで変換中に Enter を押しても次の一致へ移らず、変換が確定できる」を 1 ケース足す (SC-002)。既存の 3 ケースが緑のまま

## US-3 — キーボードだけで操作を呼び出す (P2)

**Goal**: Command palette (spec FR-006 / FR-007)。

**Independent Test**: 候補の純関数の単体、palette の component テスト (vitest-axe)、`e2e/ime.spec.ts` の 1 ケース。

- [x] **FE-030** [FE] `src/renderer/src/features/shell/palette-commands.ts` (+ test。新設) / `labels.ts` — data-model §3「操作の表」と §5 の `shell/labels.ts` の行: 操作の表 (id・文言・使える条件・実行)、候補の組み立て (操作は文言を `matchesAllTerms`、セッションは FE-002 の対象、語が空なら操作だけ、操作 → 稼働中 → 過去、最大 50 件、種別を添える。稼働中と過去は結ばない。research R-07)。テスト: 並びと 50 件の上限、語が空のとき操作だけ、`chat:*` が中央に会話が無いとき出ない、密度の操作の文言が次の値、同じ会話の稼働中と過去が両方出る、FR-002 の正規化で一致、`rowKey` に NUL・`"`・`]`・`:` を含む過去の行でも候補が 1 件ずつ出て、実行がその `rowKey` で `select` を呼ぶ [P]
- [x] **FE-031** [FE] `src/renderer/src/features/shell/CommandPalette.tsx` (新設) / `AppShell.tsx` — data-model §3「開閉・キー・フォーカス」: Radix の Dialog (SH-003 で command-palette を採ったなら見た目はその部品)、combobox / listbox、Ctrl+K (`window` の capture)、↑↓ / Enter / Esc の IME のガード、外の押下で閉じる、候補の DOM の id は `useId()` と添字から作り現在の候補を添字で持つ (外部の値を id・IDREF・セレクタに入れない。data-model §3)、閉じた後のフォーカスと実行の順 (Enter で操作を覚えて閉じ、`onCloseAutoFocus` で `useDialogReturnFocus` で戻す → 実行 → 操作ごとの行き先。data-model §3「閉じた後のフォーカス」。セッションの候補の行き先のために `AppShell` の `focusCenter` を shell の中で共有する)、セッションの候補は session のストアの選択の操作だけを呼ぶ (focus を書かない)、0 件の `EmptyState` (`paletteNone` / `paletteNoneHint`)。`AppShell` の `ShellLayout` (`RunningSessionsProvider` の内側) にマウントする
- [x] **FE-032** [FE] テスト — `src/renderer/src/features/shell/CommandPalette.test.tsx` (新設) と `AppShell.test.tsx`
  - US-3 AC1〜AC6: Ctrl+K で開いて入力欄にフォーカス、モーダルのダイアログ (起動・設定・確認・画像) の間は開かない、語で操作とセッションが候補に出る、↑↓ Enter で閉じて実行する、Esc / 外の押下で閉じて開く前の要素へ戻る (元が消えていればサイドバーの「新規起動」)、composer にフォーカスがあっても変換中でなければ開き・変換中の Ctrl+K で開かず `preventDefault` されない、0 件の文言
  - セッションの候補で中央が切り替わる (稼働中・過去。focus は `useShellFocus` が書く)、選んだ行が消えていたら中央は空の状態、palette を開いている間は `watchedId` が null (選ばれていたセッションの承認待ちも読み上げる)、「会話内を検索」で検索のバーが開く / 開いていれば入力欄にフォーカスだけ、palette を開いている間の Ctrl+F で検索が開かない、vitest-axe の違反 0 (SC-003)
  - 閉じた後の `document.activeElement` (data-model §3「閉じた後のフォーカス」の表の各行): Esc・外の押下で開く前の要素、開く前の要素が消えていればサイドバーの「新規起動」、「会話内を検索」で検索のバーの入力欄 (バーが閉じていたとき・開いていたとき)、セッションの候補 (稼働中・過去・消えた行) で中央の `main`、サイドバーを畳む操作で開く前の要素がサイドバーの中なら畳んだ帯、密度の切り替えで開く前の要素、新規起動で起動ダイアログの初期のフォーカスに移り、起動ダイアログを閉じると palette を開く前の要素へ戻る。操作の実行 (`select`・`requestConversationSearch` など) が palette の内容が外れた後に呼ばれる
  - 外部の値を含む候補: `sessionId` と `targetKey` に `"` `]` `:` `\` `#` と空白を含む過去の行で、↑↓ のたびに `aria-activedescendant` が実在の option を指す (`document.getElementById(値)` が null でない)、Enter でその行の `rowKey` が `select` に渡る、DOM の id に `rowKey` の文字列が出ない、例外が出ない
- [x] **SH-030** [SH] `e2e/ime.spec.ts` — 「composer で変換中に Ctrl+K を押しても palette が開かず、変換が確定できる」を 1 ケース足す (SC-003)

## US-4 — プリセットがどれだけ使われているかが分かる (P2)

**Goal**: 再利用率の計測経路 (spec FR-009〜FR-013)。

**Independent Test**: domain の純関数・store・service・`handleLaunchSession` の単体、起動ダイアログとプリセットの欄の component テスト。

- [x] **BE-040** [BE] `src/domain/session/launch-usage.ts` (+ test。新設) — data-model §4「型と純関数」・`LaunchUsageSummaryDTO`・「入れないもの」の許可したキーだけを出す書き出し [P]
  - テスト: `checkLaunchOrigin` が `'toString'` / `'Preset'` / `null` / 数値を通さない、`parseLocalDayKey` が `2026-13-45` / `2026-02-29` を拒み `2028-02-29` を通す、`toLocalDayKey` が時差で UTC の日をまたぐ、回数が `Number.isSafeInteger` の外にならない、`prune` が鍵の数で残す (今日の鍵と、ほかの新しい順の 89 個。91 個目から古い日を消す。日付の順と字面の順が同じ)、時計の先跳び (跳ぶ前の 30 日分を持つ記録に、跳んだ先の 2 つの日で `addLaunch` → `prune` を 3 回つなげても跳ぶ前の日がすべて残り、時計を戻した日の `sum30` に跳ぶ前の回数が出る)、`sum30` (今日を含む 30 暦日・未来の鍵を数えない)、時計が戻ったらその日に足す (90 個の鍵がすべてそれより新しくても今日の鍵が残る)、書き出しのキーが固定の集合 (SC-005)
- [x] **BE-041** [BE] `src/main/infra/settings/launch-usage-store.ts` (+ test。新設) — `createLaunchUsageStore(userDataDir: HostPath, now, fs?)`。パスは `hostPathOps.join`、`electron` を import しない、一時ファイルからの置き換えと `.bak` は `preset-store.ts:59-181` と同じ構え。data-model §4「読み込みの結果」の表の各行
  - テスト (fs を差し替える): 表の各行 (ENOENT・最上位の形の崩れ・版の欠落 / 1 未満・日単位の不正でその日だけ飛ばして退避・将来版で退避して書かない・読めない・退避の失敗で書かない)、rename の失敗で `.tmp` が残らない、書いたファイルのキーが固定の集合 (SC-005)
- [x] **BE-042** [BE] `src/main/app/launch-usage-service.ts` (+ test。新設) / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` — data-model §4「書き込み」「ログ」: 1 本の Promise の鎖で直列化 (`preset-service.ts:54-58`)、読み込みの状態 (`:60-81` と同じ形)、成功してからメモリを差し替える、`record(origin)` は reject しない、今日は注入の `now()` と `localOffsetMinutes`。`services-not-to-io` の `from` (`:252-256`) と `WSL_FREE_DIRECTORIES` (`:480-502`) に実名を足す (plan「機械強制の変更」)
  - テスト: 並行の 2 回で 2 増える、書き込みの失敗で回数が増えず次の成功で 1 だけ増える、注入の `now()` を先に跳ばして `record` を 2 つの日で 2 回以上呼んでも、書いたファイルに跳ぶ前の日が残る (spec Edge Cases)、`readFailed` の後の操作で読み直す、読み込み済みは再読しない、読めないと記録無しを `getLaunchUsage` で区別する、将来版で書かない、`console.warn` の引数にパスと値が出ない
- [x] **BE-043** [BE] `src/domain/capability.ts` (+ `capability.test.ts`。新設) / `src/preload/index.ts` / `src/main/app/session-ipc.ts` (+ test) / `ipc.ts` / `composition-root.ts` / `e2e-capability.ts` / `src/renderer/src/test-support/capability.ts` — data-model §4「起動の IPC と読み出し」・「E2E」: `launchSession(config, origin)`・`getLaunchUsage()`・`IPC_CHANNELS.getLaunchUsage`、`handleLaunchSession` の起動元の検証と `launching` のときだけ await せずに記録、`handleGetLaunchUsage`、`SessionIpcDeps` と `IpcDependencies` (`ipc.ts:77`) に 2 つ、`ipc.ts` はチャネルの登録 (`handle()` を通す) と port の transfer だけ、composition root の配線 (`userData` と時差)、E2E の配線のメモリ内の fake、renderer の stub (型検査を割らないよう同じタスクで直す)
  - テスト (`session-ipc.test.ts`。SC-005): 起動元が preset / manual / 欠落 / 未知のどれでも `deps.launchSession` が `config` だけで 1 回呼ばれ拒否されない、preset / manual だけを記録する、起動ゲートの拒否と起動の失敗は記録しない、`recordLaunchUsage` が reject しても同期で投げても結果が `launching`、`handleGetLaunchUsage` が DTO だけを返す
  - テスト (`capability.test.ts`。SC-006): `IPC_CHANNELS` の集合を固定する (今の集合 + `getLaunchUsage` の 1 つ)
- [x] **FE-040** [FE] 起動元の経路 — `src/renderer/src/features/session/running-session-types.ts` / `running-session-store.ts` (+ test) / `running-sessions-view.ts` / `RunningSessionsProvider.tsx` / `LaunchDialog.tsx` (+ test) / `LivePane.tsx` — data-model §4「renderer の起動元」: `LaunchState.lastOrigin` と `LiveSessionState.launchOrigin`、`launch(config, folderLabel, origin)`、失敗したセッションを閉じたらその起動元を戻す (`running-session-store.ts:553-559` と同じ規則)、`LaunchSource` に `lastOrigin` と `launch(config, origin)`、`LaunchDialog` が「このダイアログで適用したか」と「軸を手で変えたか」(軸の変更の口 `update` `:305-320` を通ったか。依存解決の自動の reset は数えない) を持ち、適用したら `preset`、適用せずに軸を手で変えたら `manual`、どちらも無ければ初期値を出した設定と組の `lastOrigin` (前回の設定が無ければ `manual`。経路を問わない) にする (`applyPreset` `:323-327`・`launch` `:347-355`・初期値 `:178-180`)、`NewSessionDialog` (`LivePane.tsx:56-91`) が `lastOrigin` を渡す
  - テスト (US-4 AC1 / AC2 / AC6 / AC7 / AC8): 起動元の表の各行 (適用して起動・適用後に軸を変えて起動・前回の設定が無いダイアログで適用せずに起動 (`manual`)・拒否で作り直したダイアログ・失敗したセッションを閉じて開いたダイアログ・受け付けの後に開き直したダイアログ・起動せずに閉じた後に開き直したダイアログ・前回の設定を初期値に出したダイアログで適用せずに軸を手で変えて起動 (`manual`)。前回の設定を初期値のまま起動する行は、前回が `preset` なら `preset`、`manual` なら `manual`)、プリセットを適用して起動 → 受け付け → 開き直して初期値のまま起動で `preset` が 2 回届く (AC7)、preset で起動 → 開き直して軸を 1 つ変えて起動で `manual` (AC8)、preset → 開き直して軸を変えて `manual` → 開き直して初期値のまま `manual` (引き継ぐのは直前の起動元) → 開き直して適用して `preset` の並び、軸を変えてから元に戻した起動は `manual`、依存解決の自動の reset だけでは `manual` にならない、告知を消しても (`dismissLaunchNotice`) `lastOrigin` が残る、capability の `launchSession` に起動元が届く、`SessionLaunchConfig` が起動元で変わらない
- [x] **FE-041** [FE] `src/renderer/src/features/session/useLaunchUsage.ts` (新設) / `PresetPanel.tsx` (+ test) / `labels.ts` — data-model §4「表示」と §5 の `session/labels.ts` の行: 欄を描いたときに 1 回読む、読み込み中・回数・記録無しの `EmptyState` (`usageEmpty` / `usageEmptyHint`)・読めないの `EmptyState` (`usageUnreadable` / `usageUnreadableHint`)。テスト (US-4 AC4): 4 つの表示、invoke が投げたら読めないの表示、vitest-axe の違反 0 [P]

## Polish / 記録

- [x] **SH-040** [SH] **roadmap ほかを追随させる** (spec FR-016): plan の「上流からの申し送り」表の行 #1・#4〜#10・#12 (`_overview.md` と `PLAN.md`)・#23・#26・#28・#31 を、その表の「処理」列のとおりに直す (`docs/roadmap.md`・`docs/domains/_overview.md`・`PLAN.md`・`docs/prompts.md`・`specs/010-session-monitoring-view/quickstart-results.md:66`)。roadmap の O-8 / O-9 の行は spec の「本 feature の位置づけ」の 2 つの項目と FR-016 の 3 つめの項目 (O-9 の `createdAt` の注記) のとおりに書き、`#o3-kpi-smoothness` のアンカーを O-8 の行へ移す [P]
- [x] **SH-041** [SH] **charter・対応表・discovery を追随させる** (spec FR-015 / FR-016): ui charter (申し送り #12 の Related Specs・U-5 の例外・「面の状態」の例外に palette のセッションの候補の実行)、session charter (#13・#14・起動の利用記録の置き場 (U-5)・起動の IPC の入力の起動元 (U-2))、`docs/ui-coverage.md` の F 節 (#22。SH-003 の結論を写し、使い道の書式を凡例に足す。A〜E 節は変えない)、`docs/discovery.md` (`launch-usage.json` の置き場と消し方)、`specs/013-ui-app-shell/spec.md` (#19。混ぜない) [P]
- [x] **SH-042** [SH] **Constitution XV を改める** (spec FR-014 / U-3。申し送り #20): `.specify/memory/constitution.md` の XV を AD-045 Decision 2 に合わせて MINOR で改め (v1.3.0 → v1.4.0)、Sync Impact Report と Amendment trail を書く。大きいファイルなので XV と Amendment の節を Grep で特定してから Read する。改定手順 2 の人間のレビュー (architecture-reviewer を交える) は PR で受ける (利用者に残す) [P]
- [x] **SH-043** [SH] **検証** — `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で、lint・型検査 2 本 (`tsc --noEmit -p tsconfig.node.json` / `-p tsconfig.web.json`)・E2E の型検査 (`-p e2e/tsconfig.json`)・依存グラフ・Constitution 検証 (項目 21 を含む)・Vitest の全件を通す。E2E (要ビルド) と基準画像は CI の e2e job で通す。quickstart V-1 / V-2 を確かめて `quickstart-results.md` に記録する。V-3 (実機の目視。本番ビルド) は利用者に残す

## Backend Tasks (index)

domain / main / preload に属するタスク: BE-010 (E2E の固定の索引) / BE-040〜BE-043 (起動の利用記録の domain・store・service・IPC と配線)。DB migration は無い (永続化は `launch-usage.json` 1 つ)。

## Frontend Tasks (index)

renderer に属するタスク: FE-001〜FE-004 (土台) / FE-010〜FE-012 (Thread search と過去の区画の並び) / FE-020〜FE-026 (会話内検索) / FE-030〜FE-032 (Command palette) / FE-040〜FE-041 (起動元とプリセットの欄)。

## Shared Tasks (index)

docs・規則・E2E・検証: SH-001〜SH-003 (先行) / SH-010・SH-020・SH-030 (E2E) / SH-040〜SH-043 (記録と検証)。API contract に相当するのは IPC の 1 チャネルと起動の引数 1 つで、形の正本は data-model §4 (contracts/ は作らない)。

## 依存と順序

1. **先行** (SH-001〜SH-003) → **土台** (FE-001〜FE-004)。SH-002 はコードを変える前。FE-002 は FE-001 の後
2. **US-1 / US-2 / US-3 / US-4** は土台の後ならどの順でもよい。本書の順 (P1 → P2) に進める
   - US-3 は土台 (FE-002 / FE-003) だけに依る。「会話内を検索」の操作は US-2 が無くても要求の値を上げるだけで壊れない
   - US-4 は BE-040 → BE-041 → BE-042 → BE-043 → FE-040 / FE-041 (Backend を先に)
3. **Polish** (SH-040〜SH-042) は全 US の後。SH-041 の F 節は SH-003 の結論を写す。SH-043 が最後
4. 節の中の並行の例 (`[P]`): 土台 = FE-001 / FE-003 / FE-004、US-1 = BE-010 と FE-010、US-2 = FE-020 / FE-021 / FE-022 / FE-023、US-3 = FE-030、US-4 = BE-040 と FE-041 (BE-043 の後)、Polish = SH-040 / SH-041 / SH-042

## 実装の進め方

- 本 feature は 1 つの PR で出す (FR-014 の Constitution の改定・FR-015 の対応表・SC-007 が同じ PR を求める)。節ごとに止めて確かめる
- 最初の区切りは先行 + 土台 + US-1 (Thread search。過去の区画で目当てを絞れる)。次に US-2 (会話内検索)、US-3 (palette)、US-4 (再利用率) の順に積み、各節の Independent Test が緑であることを確かめてから次へ進む
