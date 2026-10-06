# Data Model: Thread 検索と探す操作 (O-3)

各規則の正本は本ファイルの節。spec / plan / tasks は節を参照する。置き場所の語は AD-046 Decision 6 (サイドバー・過去のセッションの区画・中央のヘッダ・中央の本体)。

## §1 検索語の一致 (`features/search/text-search.ts` / `features/search/session-search.ts`)

`src/domain/session/match.ts` (cwd とフォルダの対応づけ) と名前がぶつからないよう、ファイル名に `search` を付ける。

### 正規化 (`text-search.ts`。Thread search・palette・会話内検索で共有)

| 段 | 規則 |
|---|---|
| 書記素 | `Intl.Segmenter(undefined, { granularity: 'grapheme' })` で書記素に分け、書記素ごとに次の段を当てる (半角カナと半角の濁点を 1 文字に合成するため。research R-02) |
| NFKC → 小文字 | `g.normalize('NFKC').toLowerCase()` |
| 空白 | 空白類 (`/\s/u` に当たる文字。TAB・改行・U+3000 を含む) は空白 1 つとして扱う。連なりは 1 つにまとめ、先頭と末尾を落とす |
| 除去 | 空白類を除く C0 (U+0000-001F)・DEL・C1 (U+0080-009F)・双方向制御 (U+061C, U+200E-200F, U+202A-202E, U+2066-2069)・ゼロ幅 (U+200B-200D, U+2060, U+FEFF) を除く |

```ts
normalizeForSearch(text: string): string
/** 正規化後の各 UTF-16 位置が、元の文字列のどの書記素 [start, end) から来たか (§2 の強調が使う)。 */
normalizeWithMap(text: string): {
  readonly text: string
  readonly sourceStart: readonly number[]   // text.length と同じ長さ
  readonly sourceEnd: readonly number[]
}
toTerms(query: string): readonly string[]   // 正規化して空白で区切る。空なら []
matchesAllTerms(fields: readonly (string | null)[], terms: readonly string[]): boolean
```

- `normalizeForSearch(s) === normalizeWithMap(s).text` (同じ規則を 2 つ持たない)
- 一致は**正規化した文字列への字面の部分一致** (`includes` / `indexOf`)。検索語から `RegExp` を組まない
- `matchesAllTerms`: すべての語が、正規化したどれかのフィールドに部分一致したら一致 (AND)。`null` のフィールドは対象外。語が空なら常に一致 (絞り込まない)

### Thread search の対象 (`session-search.ts`)

| 対象 | 値 |
|---|---|
| 要約行のフィールド | `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` |
| 行が属するグループの見出しの文字列 | `groupLabelOf(group, folderName, session)` (`group-label.ts`。O-7 で中央のヘッダと「概要」が共有する関数)。登録フォルダは表示名 (`folderLabels.nameOf`)、保留は所在、未登録は表示用のパス、不明は行の表示用の文字列 |

- `cwd.value` (PathDTO) を直接は読まない (Principle I。未登録の見出しは `groupLabelOf` が返す表示用の文字列として入る)
- transcript の本文は読まない。読み込み済みの行だけを探す (段階取得の続きは探さない)
- 行ごとの正規化したフィールドは、一覧の索引 (`buildSessionRows` の結果) とフォルダの表示名が変わったときだけ作り直す (入力のたびに正規化しない)

### 並び

一覧の既存の並び (グループの種別の順・グループの中の行の順) を保つ。一致の度合いで並べ替えない。

### palette のセッションの候補

| 種別 | 対象 | 出所 |
|---|---|---|
| 稼働中 | 作業フォルダの表示名・ランタイムの表示名 | 稼働中のストア (`order` / `sessions`) と `RunningSessionsView` の `folderName` / `runtimeName` |
| 過去 | Thread search と同じ (上の表) | `stores/sessions.ts` の索引を `buildSessionRows` に通したもの |

稼働中と過去の候補は結ばない (id の名前空間が違う。research R-07)。

### Thread search の状態 (過去のセッションの区画。`SessionListScreen`)

- **語は `SessionListScreen` の local state** (所在・フォルダの絞り込みと同じ置き場)。区画は常にマウントされている (サイドバーを畳んでも `hidden`) ので、中央の切り替え・サイドバーの畳みで保たれ、アプリの再起動で消える。`stores/ui.ts` にも `stores/sessions.ts` にも置かない (spec FR-001)
- **区画の開閉の状態を `SessionListScreen` に上げる**。区画の鍵 (`SessionSection.key`) の集合で「既定から反転した区画」を持つ (未登録は既定で畳む)。検索中 (語が空でない) は、一致した行のある区画をすべて開いて描く。状態は書き換えないので、語を消すと元の開閉で描く (US-1 AC1 / AC4)
- 絞り込みの順: フォルダの絞り込み → 所在の絞り込み (`narrowToLocation`) → 検索語 (区画の中の行を同じ添字で削り、0 件の区画は見出しごと出さない。`rowKeys` と `sessions` の順と長さの一致を保つ)
- 入力: 値の変化で絞り込む (変換中の未確定の文字列でも絞り込む)。Enter は何もしない (確定の操作は要らない。IME の確定の Enter を奪わないため `preventDefault` しない)。Esc は変換中でなければ語を消す (`event.isComposing` / `keyCode === 229` のときは何もしない)
- 件数: 語があるときは一致した行の件数を入力欄の下に出す (`role="status"` / `aria-live="polite"`)

### Thread search の空の状態

一覧の空の表示の優先順位 (`SessionListScreen.tsx:843-858`) に `search-empty` を足す。

| 順 | 状態 | 条件 |
|---|---|---|
| 1 | `no-folders` | 今のまま |
| 2 | **`search-empty`** (新) | 語が空でなく、絞り込みの結果の区画が 0 |
| 3 | `filtered-out` | 今のまま (語が空のときだけ届く) |
| 4〜 | `all-unlisted` / `some-unlisted` / `no-sessions` | 今のまま |

`search-empty` の操作は「検索と絞り込みをすべて解除する」(語・所在・フォルダを既定に戻す)。既存の `filtered-out` の文言とボタンは変えない。取得中 (先頭ページ) でも出す (文言が「読み込み済み」と範囲を示す)。

## §2 会話内検索 (renderer の表示状態。永続化しない)

### 状態

```ts
interface SearchableMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly texts: readonly string[]          // text part の本文だけ (spec FR-004)
}
interface SearchHit { readonly messageId: string; readonly occurrence: number }   // メッセージの中の出現の順 (0 から)
type SearchHitKey = SearchHit
interface ConversationSearchState {
  readonly open: boolean
  readonly query: string                      // 入力のまま
  readonly hits: readonly SearchHit[]         // メッセージの並び → 出現の順
  readonly current: SearchHitKey | null       // hits が空なら null
}
```

- `SearchableMessage` は `ThreadMessageLike` から作る: role が `user` / `assistant` で、システムイベントの行 (`isSystemEventMessage`) でないもの。part は `type: 'text'` だけ (tool の入力・結果・Reasoning・data part を除く)。変換が text part にした添付のファイル名と圧縮の境界 (`convert.ts:75,78`) は描かれる本文なので対象に入る
- 会話内検索の語は**語全体** (`normalizeForSearch(query)`) の出現を数える (Thread search の AND にしない。出現の位置を数えるため)。正規化した語が空なら一致は 0 で、空の状態も出さない

### 本文の供給元

| 中央 | 供給元 |
|---|---|
| 過去 | `PastCenter` が呼ぶ `useTranscript()` の `messages` (1 回だけ呼び、transcript の本体にも同じ値を渡す) |
| 稼働中 | 表示中の稼働中のセッションのストアの `messages` (全件。窓で切る前) |

- **provider は `CenterPane` には置かず、その子の `RunningCenter` / `PastCenter` がそれぞれの中に置く。** 本文は子が持つ (過去は `PastCenter` が呼ぶ `useTranscript()`、稼働中は `RunningCenter` が読む稼働中のストア)。React では値が子から親へ渡らないので、`CenterPane` に置くと provider が本文を受け取れない (`CenterPane.tsx:60-66, :135-168`)。2 つの子は、それぞれ中央のヘッダ (`CenterHeader`) と中央の本体 (`LivePane` / transcript の本体) を `ConversationSearchProvider` で包む。会話を出していないとき (`CenterEmpty`) は provider をマウントしない
- provider の `key` も 2 つの子が付ける。稼働中は `live.sessionId`、過去は `selectedRowKey`。セッションを切り替えると作り直され、検索は閉じる (spec FR-003)。過去の取得 (`useTranscript()`) は `key` の外 (`PastCenter` の先頭) で呼ぶので、作り直しても取得は増えない
- provider は入力を props だけで受ける。`messages` (上の表の供給元) と、稼働中だけ `reveal(id)` (窓をそのメッセージまで広げる操作。`RunningCenter` が `RunningSessionsView.revealMessage` を渡し、`PastCenter` は渡さない)。provider (`features/chat`) は `features/session` も `features/shell` も import しない
- 中央のヘッダ (`CenterHeader`) は検索のボタンを持ち、開くと中央のヘッダの下に検索のバーを出す

### 走査 (`features/chat/conversation-search.ts`。純関数)

- 入力から 150ms 間引いてから走査する。走査は間引きの後に 1 回
- 正規化した本文はメッセージの object ごとに `WeakMap` に覚える。語が変わったときは覚えた正規化の本文に `indexOf` を回すだけ
- メッセージの配列が変わったら、object が変わったメッセージ (追加・ストリーミングで伸びた・送り直し) だけを正規化し直し、そのメッセージの hits を置き換える。過去ログの再取得は全 object が変わるので全件を走査し直す
- 走査の関数の呼び出しは数えられる形にする (SC-002 の判定: 入力 1 回あたりの全件の走査は間引きの後の 1 回以下、メッセージの追加・本文の変化では変わったメッセージだけ)
- `current` は `SearchHitKey` で持つ。走査し直しても同じキーが残っていれば指し続け、スクロールもしない (US-2 AC5)。消えたら一番近い前の一致へ、前が無ければ最初の一致へ

### 移動

- 語が変わって走査したら `current` を最初の一致にし、そこへ移る (US-2 AC1)
- 次 / 前で `current` を動かす。端では反対の端へ戻る
- 移るたびに navigator の `scrollToMessage(id)` を呼ぶ。navigator は transcript の context (`features/chat/transcript-context.ts`) にあり、`thread.aui.tsx` が登録する:
  - 仮想パス: id から index を引き (assistant-ui に渡したメッセージの配列を `===` で引く) `virtualizer.scrollToIndex(index, { align: 'center' })`。要素が描かれたら、下の「メッセージの要素の引き方」で引いた要素の `scrollIntoView({ block: 'center' })` で合わせ直す
  - 非仮想パス: 下の「メッセージの要素の引き方」で引いた要素の `scrollIntoView({ block: 'center' })`
  - どちらも移るときに最下部への追従を切る (`stickyRef = false`)。検索を閉じても追従は戻さない (スクロール位置はそのまま。US-2 AC6)
  - id が assistant-ui に渡したメッセージに無ければ `false` を返す
- `false` が返り、provider が `reveal` を受けている (中央が稼働中) なら `reveal(id)` で窓をそのメッセージまで広げ、次の描画の後にもう一度 `scrollToMessage` を呼ぶ (research R-03。`reveal` の出所は上の「本文の供給元」)
- `thread.aui.tsx` はメッセージの root に `data-message-id` を、text part の描画 (assistant の `MarkdownText`・user の本文) の外側に `data-search-text` を付ける (強調の対象を text part に限るため)。`data-message-id` の値は React の属性として渡す

### メッセージの要素の引き方 (移動と強調で共有)

メッセージの id は外部由来の値で、文字種を検証していない (過去ログは JSONL の `uuid`、実行中は SDK の `uuid` と `hook:` / `task:` / `result:` の合成の id。research R-03)。`"` `\` `]` を含む id をセレクタに埋めると `querySelector` が投げ、`a"],[data-message-id="b` のような id はセレクタの結合として別のメッセージに当たる。

- **id を CSS セレクタの文字列に埋め込まない** (下の「外部由来の値と DOM の id・セレクタ」をメッセージの id に当てたもの)。`querySelector` / `querySelectorAll` / `closest` / `matches` に渡すのは固定の文字列 (`'[data-message-id]'` / `'[data-search-text]'`) だけにする。`CSS.escape` を通して組むこともしない (照合の方法を下の 1 つに揃える)
- 1 つの要素を引く: transcript のスクローラの中の `querySelectorAll('[data-message-id]')` を並びの順に回し、`el.dataset.messageId === id` の最初の要素を返す。無ければ `null`。この関数 (`findMessageElement(root, id)`) を `transcript-context.ts` に 1 つ置き、navigator の 2 つのパスが使う
- 強調の対象を引く: 同じ `querySelectorAll('[data-message-id]')` を回し、`dataset.messageId` が hits の `messageId` の `Set` にある要素だけを取る

### 外部由来の値と DOM の id・セレクタ (§2・§3・§6 で共有)

次の値は、どれも外部由来の値として扱う。

- メッセージの id (上の節)
- 区画の鍵 (`SessionSection.key`)。未登録の区画の鍵は `cwdKey` (`JSON.stringify([namespace, path])`) を含み、パスの空白をそのまま持つ
- 行の鍵 (`rowKey` = `${targetKey}\u0000${sessionId}`)。NUL を含む (`summary.ts:59`)
- 過去の行の `sessionId`。列挙の境界の検査は、空でない・長さの上限・制御文字なしの 3 つだけで、`"` `]` `:` `\` `#` と空白は通る (`protocol.ts:152-165`)
- palette の候補の id (`session:running:<id>` / `session:past:<rowKey>`。§3)

規則は次の 3 つ。

- **DOM の `id` と IDREF の属性 (`aria-labelledby` / `aria-controls` / `aria-activedescendant` / `aria-describedby` / `htmlFor`) に外部の値を入れない。** DOM の id は、部品ごとの `useId()` の値を接頭辞にし、並びの添字か固定の語を付けて作る (例 `${prefix}-heading`・`${prefix}-opt-${index}`)。IDREFS は空白区切りなので、空白を含む値を入れると参照が途中で切れる
- **CSS セレクタの文字列には、外部の値も `useId()` の値も入れない。** `useId()` の書式は React の版で変わり、`:` を含む版がある。要素は ref で持つか、固定のセレクタで集めて `dataset` の厳密比較で照合する (上の「メッセージの要素の引き方」)。id で引くなら `document.getElementById` を使う
- 外部の値を DOM に載せてよいのは 2 つだけ: 照合のための `data-*` 属性の値 (React の属性として渡す) と、テキストとして描く中身。React の `key` は DOM に出ないので、外部の値を使ってよい

### 強調 (`features/chat/search-highlight.ts`)

- 対象: 描かれているメッセージの要素のうち hits のあるもの (上の「メッセージの要素の引き方」で引く) の、`[data-search-text]` の中の text node
- `[data-search-text]` ごとに text node を順に連結した文字列を `normalizeWithMap` に通し、正規化した語の出現を探す。出現の位置を `sourceStart` / `sourceEnd` で元の書記素の範囲に、累積の長さで (text node, offset) に写して `Range` を作る。`0 <= offset <= node.length` を満たさない位置は飛ばす (例外を出さない)。text node をまたぐ出現も同じ表で扱える
- メッセージの中の出現の順 (`[data-search-text]` の並び → 出現の並び) で数え、`current` の `occurrence` 番目を `closta-search-current`、ほかを `closta-search` に入れる。描画に `occurrence` 番目が無ければ現在の強調は出さない (メッセージは画面に入る)
- 掛け直し: hits・`current` が変わったとき、描かれた DOM が変わったとき (transcript のスクローラの subtree の `MutationObserver`。アニメーションのフレームに 1 回にまとめる)
- 登録先 (`CSS.highlights`) は差し替えられる形にする (jsdom は持たない)
- `::highlight(closta-search)` / `::highlight(closta-search-current)` の規則は `assets/main.css` に置き、既存のテーマのトークン (`--accent` / `--primary` など) を使う。実行時に `<style>` や `style` 属性を足さない
- HTML を組まない。DOM を書き換えない

### 開く・閉じる・キー

- 開く: 中央のヘッダの検索のボタン、Ctrl+F、palette の「会話内を検索」。開いていれば入力欄にフォーカスを移すだけ
- Ctrl+F は provider が `window` の keydown (capture) で受ける (provider は会話を出しているときだけマウントされる)。`event.isComposing` / `keyCode === 229`、`[aria-modal="true"]` の要素が開いている (palette を含む) ときは何もしない (`preventDefault` もしない)。受けたときだけ `preventDefault`
- palette からの要求は `stores/ui.ts` の `conversationSearchRequest` (単調増加の値。palette が上げる) を provider が購読して受ける
- 検索のバーの Enter / Shift+Enter (次 / 前) と Esc (閉じる) は、変換中は何もしない
- 閉じる: Esc・閉じるボタン・セッションの切り替え・中央が未選択になったとき。閉じたら強調を 2 つとも消す。スクロール位置はそのまま

## §3 Command palette (`features/shell/CommandPalette.tsx` / `features/shell/palette-commands.ts`)

シェルの部品として置く (palette は複数の feature のストアを読み、操作を呼ぶ。シェル → 各 feature の向きを保つ)。

### 操作の表 (`palette-commands.ts`)

| id | 文言 (§5) | 使える条件 | 実行 |
|---|---|---|---|
| `launch:open` | 新しいセッションを起動 | 常に | `setLaunchOpen(true)` |
| `settings:<section>` | 設定: {項目の名前} (`SETTINGS_SECTION_LABELS` の 4 項目) | 常に | `openSettings(section)` |
| `shell:sidebar` | サイドバーを畳む / サイドバーを開く (今の状態の反対) | 常に | `setSidebarCollapsed(!collapsed)` |
| `shell:panel` | 詳細を畳む / 詳細を開く | 常に | `setPanelCollapsed(!collapsed)` |
| `chat:search` | 会話内を検索 | 中央に会話を出しているとき (`CenterPane` の `shown` が `running` / `past`) | `requestConversationSearch()` (§2) |
| `chat:density` | transcript を「{次の密度の文言}」にする | 同上 | `setTranscriptDensity(次の値)` |
| `session:running:<id>` | 作業フォルダの表示名 (補足: ランタイム・起動の時刻。種別: 稼働中) | §1 で一致 | 稼働中のストアの `select(id)` |
| `session:past:<rowKey>` | 行の題 (`rowTitleText`。補足: グループの表示。種別: 過去) | §1 で一致 | `useSessionsStore.getState().select(rowKey)` |

- 表の id は、候補を区別するための表の中の鍵である (React の `key` にも使ってよい)。外部由来の値を含むので、DOM の id・IDREF・セレクタには入れない (§2「外部由来の値と DOM の id・セレクタ」)。DOM の id の作り方は下の「開閉・キー・フォーカス」
- 操作の候補は、操作の文言を §1 の `matchesAllTerms` に通して絞る。語が空のときは操作だけを出す (セッションの候補は出さない)
- 並び: 操作 → 稼働中のセッション → 過去のセッション。合わせて最大 50 件 [ASSUMED]
- セッションの候補の実行は、サイドバーで行を選んだのと同じ。palette は session のストアの選択の操作を呼ぶだけで、中央の `focus` はシェル (`useShellFocus`) が選択の通知 (`selectionSeq`) から決める。palette は `focus` を書かない (ui charter の「面の状態」に例外として書く)。選んだ行が一覧から消えていたら O-7 の規則のとおり中央は空の状態になる
- 文言は `features/shell/labels.ts` の表から取る

### 開閉・キー・フォーカス

- `stores/ui.ts` に `paletteOpen: boolean` と `setPaletteOpen` を足す。`watchedIdOf` の条件に `!paletteOpen` を足す (palette は全面の overlay で中央を覆う。013 data-model §1 の起動ダイアログと同じ扱い)。`watchedIdOf` を組む呼び出し (`RunningSessionList.tsx:154-156` / `SessionAttentionAnnouncer.tsx:28`) に値を渡す
- Ctrl+K は `CommandPalette` が `window` の keydown (capture) で受ける。`event.isComposing` / `keyCode === 229`、または `[aria-modal="true"]` の要素が開いているときは何もしない (`preventDefault` もしない)。palette を開いている間の Ctrl+K も何もしない
- palette はモーダルのダイアログ (Radix の Dialog。名前は `PALETTE_LABELS.title`)。入力は combobox (`aria-controls` / `aria-activedescendant` / `aria-expanded`)、候補は listbox / option。↑↓ で選び、Enter で閉じて実行する (実行の時点は下の「閉じた後のフォーカスと、操作を実行する時点」)。Esc と外の押下で閉じる (起動・設定のダイアログと違い、外の押下でも閉じる。捨てる入力が無い)。↑↓ / Enter / Esc は変換中は何もしない
- **候補の DOM の id は、外部の値から作らない** (§2「外部由来の値と DOM の id・セレクタ」)。`CommandPalette` の `useId()` を接頭辞にし、listbox は `${prefix}-list`、option は並びの添字で `${prefix}-opt-${index}` とする
  - 現在の候補は添字で持つ。`aria-activedescendant` はその添字の option の id を指す。語が変わったら先頭に戻す
  - 現在の候補を画面に入れるのは、option の ref の `scrollIntoView({ block: 'nearest' })` で行う。セレクタでは引かない
  - Enter は、現在の添字の候補 (表の行) を実行する。`aria-activedescendant` が指す候補と実行する候補は、同じ添字から決まる

### 閉じた後のフォーカスと、操作を実行する時点 (US-3 AC3 / AC4)

palette は、Enter で選んだ操作を覚えてから閉じる (`setPaletteOpen(false)`)。**操作は閉じる前には実行しない。** 閉じる途中の palette のフォーカスの管理と、操作が動かすフォーカスを競わせないためである。Dialog の `onCloseAutoFocus` は内容が外れた後に呼ばれる。その中で次の順に行う。

1. `useDialogReturnFocus` (`paletteOpen` で開閉を見る。戻り先の印は `new-session`) で、開く前の要素へ戻す。元が消えていれば (`focusLost`)、サイドバーの「新規起動」へ戻す
2. 覚えた操作があれば実行する
3. 下の表の行き先へ移す。「1 のまま」の行は動かさない

| 閉じ方 / 実行した操作 | 閉じた後のフォーカス |
|---|---|
| Esc・外の押下 (実行なし) | 開く前の要素 (1 のまま) |
| `launch:open` / `settings:<section>` | 開いたダイアログの初期のフォーカス (各ダイアログの規則)。ダイアログは 1 の後に開くので、そのダイアログの `useDialogReturnFocus` は palette を開く前の要素を「開いた元」として覚える。そのダイアログを閉じると、そこへ戻る |
| `shell:sidebar` / `shell:panel` | 1 のまま。開く前の要素が畳んだ面の中にあったら、その面の `useFocusRescue` が畳んだ帯へ移す (O-7 の規則のまま) |
| `chat:search` | 検索のバーの入力欄。provider が要求 (`conversationSearchRequest`) を受け、バーを開いて (開いていればそのまま) 入力欄へ移す (§2「開く・閉じる・キー」) |
| `chat:density` | 1 のまま |
| `session:running:*` / `session:past:*` | 中央 (`main`)。選択で中央の中身が入れ替わり、開く前の要素 (前の会話の composer など) が消えうる。そのため、スキップリンクと同じ `focusCenter` (`AppShell.tsx:79-91`。shell の中で共有する) で中央へ移す。選んだ行が消えていて中央が空の状態になったときも同じ |

## §4 起動の利用記録 (`LaunchUsage`。`launch-usage.json`)

置き場: ユーザデータディレクトリ。store は `createLaunchUsageStore(userDataDir: HostPath, now, fs?)` で、本体・一時ファイル・`.bak` のパスは `hostPathOps.join` で組む (`preset-store.ts` と同じ。AD-004 / AD-023 §8)。

```json
{ "schemaVersion": 1, "days": { "2026-10-04": { "preset": 3, "manual": 1 } } }
```

### 型と純関数 (`src/domain/session/launch-usage.ts`)

- `LaunchOrigin = 'preset' | 'manual'`。`checkLaunchOrigin(value: unknown): LaunchOrigin | null` は `value === 'preset' || value === 'manual'` の厳密比較で、それ以外は `null`
- `LocalDayKey` (brand)。作れるのは `toLocalDayKey(epochMs, offsetMinutes)` と、読み込みの検証 `parseLocalDayKey(s)` (`/^\d{4}-\d{2}-\d{2}$/` かつ暦として正しい日。閏年を含む) だけ
- `addLaunch(usage, day, origin)`・`prune(usage, today)`・`sum30(usage, today)` は純関数。回数は `Number.isSafeInteger(n) && n >= 0`
- **刈り込みは暦の日数ではなく鍵の数で行う。** `prune(usage, today)` は、`today` の鍵と、それ以外の鍵を日付の新しい順に 89 個残し (合わせて 90 日分。spec U-4)、ほかを消す。日付の順は `YYYY-MM-DD` の字面の順と同じ。書き込みは `addLaunch` → `prune` の順なので、今足した日 (`today`) は必ず残る
  - 理由: 記録だけからは「時計が先に跳んだ」と「長く使わなかった」を区別できない。暦の日数で消す規則は、跳んだ先の日が記録に入った後の書き込みで、跳ぶ前の日をまとめて消す (基準日を `min(today, 記録の中の最も新しい日)` にしても、跳んだ先の日が最も新しい日になるので、2 回目の書き込みで基準が跳ぶ。research R-05)
  - 時計が先に跳んでいる間に何回書いても、跳ぶ前の日は一度に消えない。鍵が 90 個を超えた分だけ、古い日から消える。時計が戻れば、残った跳ぶ前の日がそのまま 30 日の合計に入る
  - 引き換え: 使う日が疎らなら、90 暦日より前の日も残る。中身は日付と 2 つの回数だけで (spec FR-011)、ファイルは最大 90 キー
- 30 日の合計は `today` を含む 30 暦日 (`today - 29` 〜 `today`)。未来の日の鍵は入らない
- 時計が戻って今日が記録の日より前になったら、その (過去の) 今日の回数に足す (今日の鍵は刈り込みで消えない)

### 読み込みの結果 (store が返し、service が状態にする)

| 結果 | 扱い | service の状態 |
|---|---|---|
| ENOENT | 空 | 読み込み済み |
| 最上位の形が崩れている (parse の失敗・オブジェクトでない・`days` が無いかオブジェクトでない)・版が欠けている / 数値でない / 1 未満 | `.bak` に退避して空から | 読み込み済み |
| 日単位の不正 (鍵が暦日でない・値のキーが `preset` / `manual` の外・回数が不正) | その日だけ飛ばし、残りを読む。飛ばした日があれば退避する | 読み込み済み |
| 将来版 (`schemaVersion` が数値で 1 より大きい) | 退避し、**書き込まない** (`record()` は捨てる) | `storeNewerVersion` |
| 読めない (ENOENT 以外の I/O の失敗) | 書き込まない | `readFailed`。次の `record()` / `getLaunchUsage()` で読み直す |
| 退避 (`.bak`) の書き込みの失敗 | 読み込みを失敗として扱い、書き込まない | `readFailed` (読み直す) |

- 読み込み済みになったら同じプロセスで再読しない (`.bak` を何度も作らない)。プロセスをまたぐ重複は X-6 の預かり
- `.bak` の名前は `launch-usage.json.<now>.bak`

### 書き込み (`src/main/app/launch-usage-service.ts`)

- 起動が受け付けられたとき (`launching`) だけ。数える単位は受け付けた起動の要求 1 回で、受け付けた後にセッションが失敗し、閉じて開いたダイアログから再試行した起動は別の 1 回に数える (design-gate R3 M-13。2026-10-06 に利用者が選択。spec FR-010)。`addLaunch` → `prune` → 一時ファイル (`launch-usage.json.<now>.<seq>.tmp`) に書いて置き換え。失敗したら一時ファイルを消す (`preset-store.ts` と同じ)
- **書き込みが成功してからメモリを差し替える** (失敗した 1 回は捨てる)。service が 1 本の Promise の鎖で直列化する (`preset-service.ts` の `serialize` と同じ形)
- `record(origin)` は reject しない (失敗は握ってログに出す)。`handleLaunchSession` は await しない。書き込みの失敗は起動の結果を変えない
- 今日はローカルの暦日: service に注入する `now()` と `localOffsetMinutes(epochMs)` (composition root が `-new Date(ms).getTimezoneOffset()` を渡す) から `toLocalDayKey` で作る

### 起動の IPC と読み出し

- `launchSession(config, origin)`: preload は 2 つの引数をそのまま invoke に渡す。main の `handleLaunchSession` が `checkLaunchConfig(args[0])` に加えて `checkLaunchOrigin(args[1])` を見る。起動元が欠けている・未知でも起動は通常どおり扱い、記録だけを行わない。どの起動元でも、起動の service (`deps.launchSession`) に渡るのは `config` だけで、1 回だけ呼ばれる
- `getLaunchUsage()` (引数を取らない) → `LaunchUsageSummaryDTO`:

```ts
type LaunchUsageSummaryDTO =
  | { readonly status: 'ok'; readonly preset: number; readonly manual: number; readonly days: 30 }
  | { readonly status: 'unreadable' }        // storeNewerVersion / readFailed
```

- 日ごとの記録を renderer に渡さない。renderer は invoke の失敗 (例外) も `unreadable` として描く

### renderer の起動元

| 場面 | 起動元 |
|---|---|
| このダイアログでプリセットを「適用」した後の起動 (適用した後に軸を変えても) | `preset` |
| 前回の設定 (`launch.lastConfig`) を初期値に出したダイアログで、適用せず、軸も手で変えずに起動する。経路は問わない: 拒否 (`launch.phase === 'rejected'`) で作り直された・起動が受け付けられた後に開き直した・起動せずに閉じた後に開き直した | `launch.lastOrigin` (無ければ `manual`) |
| 失敗したセッションを閉じて (`launch.previousFailure` が立つ) 開いたダイアログが、そのセッションの設定を初期値に出し、適用せず、軸も手で変えずに起動する | `launch.lastOrigin` (= 閉じたセッションの起動元) |
| 前回の設定を初期値に出したダイアログで、適用せずに軸を手で変えて起動する。経路は問わない (拒否の後に軸を直して再試行した起動も含む) | `manual` |
| 前回の設定が無い (`launch.lastConfig === null`。空の下書き) ダイアログで、適用せずに起動する | `manual` |

- **起動元は、初期値の設定のまま起動したときだけ引き継ぐ。** `LaunchDialog` は「このダイアログで適用したか」と「このダイアログで軸を手で変えたか」を持つ。起動元は、適用したら `preset`、適用せずに軸を手で変えたら `manual`、どちらも無ければ初期値を出した設定と組の起動元 (`lastOrigin`) にする。U-6 の「拒否の後に前回の設定で起動し直してもプリセット (起動元を戻す)」と同じ規則を、前回の設定を初期値に出すすべての経路に当てる (同じプリセットを続けて使う起動を `manual` に数えない。design-gate R2 H-02)。軸を変えた起動には当てない (1 度適用した起動元を、アプリを閉じるまでの起動に付けて回らない。design-gate R3 H-04。2026-10-06 に利用者が選択)。起動が受け付けられるたびに 1 回だけ数える規則 (spec FR-010) は変えない
  - 「手で変えた」は、軸の変更の口 (`update`。`LaunchDialog.tsx:305-320`) を通ったかで決める。変えてから元に戻しても「変えた」に数える。依存解決による自動の reset (`resolveLaunchAxes` の resets) は数えない。プリセットの適用 (`applyPreset`) は「適用した」に数え、「手で変えた」には数えない
  - 2 つの印はダイアログの状態 (`useState`) で、ダイアログを作り直すと消える (拒否・失敗で作り直したダイアログも初めから。`LivePane.tsx:55`)
  - 引き換え: 拒否の後に軸を直して再試行した起動は `manual` になる。U-6 の「前回の設定で起動し直す」の外にあるので、U-6 とは矛盾しない。軸を変えずに解ける拒否 (同時実行数の上限・終了処理中など。`agent-session.ts:72-79`) の再試行は引き継ぐ
- ストア (`running-session-store.ts`): `LaunchState` に `lastOrigin: LaunchOrigin | null` を足す。`launch(config, folderLabel, origin)` は起動の開始で `lastConfig` と一緒に `lastOrigin` を入れ、受け付けられても消さない (`lastConfig` と同じ。`running-session-store.ts:57,362`)。告知を消しても (`dismissLaunchNotice`。`running-session-store.ts:436-446`) 残す。`lastOrigin` は起動の初期値の片方で、起動の告知 (Launch notice) に含めない (`lastConfig` と同じ)。稼働中のセッションの状態 (`LiveSessionState`) に `launchOrigin` を持たせ、失敗したセッションを閉じたときは `lastConfig` と同じく、そのセッションの起動元を `lastOrigin` に戻す
- 起動の口の型: `LaunchSource` に `lastOrigin` を足し、`launch(config, origin)` にする。`RunningSessionsView.launch(config, origin)` → `store.launch(config, folderLabel, origin)` → `capability().launchSession(config, origin)`
- 起動元は計測にだけ使う。起動の可否・`SessionLaunchConfig`・権限モードに影響させない

### 表示 (プリセットの欄。`PresetPanel`)

- 欄を描いたとき (起動ダイアログを開いたとき) に `getLaunchUsage()` を 1 回呼ぶ
- 読み込み中は `usageLoading`、`ok` で 2 つとも 0 は Empty state (`usageEmpty`)、`ok` は `usageCounts`、`unreadable` は Empty state (`usageUnreadable`)
- session charter の KPI「再利用率」は、表示した 2 つの回数で「プリセットを適用した起動 > 適用しない起動」を判定する (U-6)。判定の期間はプリセットの欄の直近 30 日 (`sum30`) で、最低件数と判定の時期は持たない。数える単位は受け付けた起動の要求 (§4「書き込み」) (design-gate R3 M-01。2026-10-06 に利用者が選択。spec FR-016)

### ログ

読み込みの結果 (退避・将来版・読めない) と書き込みの失敗を、`[launch-usage-store]` の接頭辞で、理由キーと errno のコードだけ `console.warn` に出す。値・パス・退避先のパスは出さない (Principle V)。

### 入れないもの

セッション id・プリセットの id と名前・フォルダ・ランタイム・Provider・モデル・時刻 (日より細かいもの)・環境変数 (spec FR-011)。書き出しは許可したキー (`schemaVersion` / `days` / 日付 / `preset` / `manual`) しか出さない関数を通し、固定のキー集合のテストで守る。

### E2E

E2E の配線 (`e2e-capability.ts`) の `recordLaunchUsage` はメモリ内の fake で、ファイルに書かない。`getLaunchUsage` は fake の値を同じ純関数 (`sum30`) で集計して返す (AD-038)。

## §5 新しい文言 (正本。各 `labels.ts` に置く)

| 置き場 | キー | 文言 |
|---|---|---|
| `session-list/labels.ts` | `searchLabel` | セッションを検索 |
| 同 | `searchPlaceholder` | 題・ブランチ・フォルダなどで探す |
| 同 | `searchCount(n)` | {n} 件が一致 |
| 同 | `searchClear` | 検索を消す |
| 同 | `searchEmpty` | 読み込み済みのセッションに一致するものはありません。 |
| 同 | `searchEmptyReset` | 検索と絞り込みをすべて解除する |
| 同 | `outcomesAllOk(n)` | 列挙の結果: {n} 件の対象をすべて読めました |
| `chat/labels.ts` | `composerInput` | メッセージ (composer の入力欄の名前。今の `Message input`) |
| 同 | `composerPlaceholder` | メッセージを入力 (今の `Send a message...`) |
| 同 | `searchOpen` | 会話内を検索 (中央のヘッダのボタンと入力欄の名前) |
| 同 | `searchPlaceholder` | 語を入力 |
| 同 | `searchPosition(i, n)` | {i} / {n} 件 |
| 同 | `searchNone` | 一致する箇所はありません。 |
| 同 | `searchNoneHint` | 語を変えるか、検索を閉じてください。 |
| 同 | `searchNext` / `searchPrev` / `searchClose` | 次へ / 前へ / 検索を閉じる |
| `shell/labels.ts` | `paletteTitle` | コマンド |
| 同 | `paletteInput` | 操作やセッションを探す (入力欄の名前と placeholder) |
| 同 | `paletteNone` | 一致する操作はありません。 |
| 同 | `paletteNoneHint` | 語を変えるか、Esc で閉じてください。 |
| 同 | `paletteGroupActions` / `paletteGroupSessions` | 操作 / セッション |
| 同 | `paletteKindRunning` / `paletteKindPast` | 稼働中 / 過去 |
| 同 | `paletteLaunch` | 新しいセッションを起動 |
| 同 | `paletteSettings(label)` | 設定: {label} |
| 同 | `paletteChatSearch` | 会話内を検索 |
| 同 | `paletteDensity(label)` | transcript を「{label}」にする ({label} は `TRANSCRIPT_DENSITY_LABELS` の次の値の文言) |
| `session/labels.ts` | `usageTitle` | 直近 30 日の起動 |
| 同 | `usageCounts(p, m)` | プリセットを適用 {p} 回 / 適用なし {m} 回 |
| 同 | `usageLoading` | 記録を読み込み中… |
| 同 | `usageEmpty` | まだ記録がありません。 |
| 同 | `usageEmptyHint` | 起動すると、プリセットを適用したかどうかを日ごとに数えます。 |
| 同 | `usageUnreadable` | 記録を読めません。 |
| 同 | `usageUnreadableHint` | 次に起動ダイアログを開いたときに読み直します。 |

- `usageCounts` の「プリセットを適用」は、起動元が `preset` の回数である。語は session charter の KPI の文言 (U-6) と同じにする。前回の設定を変えずに起動し直した起動は、前回の起動元のまま入る。数え方の正本は §4「renderer の起動元」で、glossary の「起動元」と session charter の計測経路の注記も同じ規則を引く (spec FR-016)
- サイドバーと palette の畳み / 開くの文言は `SHELL_LABELS` の既存のキー (`collapseSidebar` など) を使う
- 既存の空の文言 (`SessionListScreen` の 5 つ・稼働中の区画・transcript の 2 つ・シェルの空の状態) は変えない。`search-empty` は新しい状態で、`filtered-out` を変えない

## §6 過去のセッションの区画の並び (spec FR-017。013 data-model §3 の残した判断と受け入れた判断への回答)

```
section[data-testid=past-sessions] (サイドバーの過去の区画のランドマークはこの 1 つ。名前は h2)
├─ h2「過去のセッション」                 … 固定 (Sidebar.tsx)
├─ 検索欄 (と件数・消すボタン)            … 固定 (SessionListScreen の上端)
└─ スクロールする領域 (flex-1 / overflow-y-auto)
   ├─ 取得時刻と「全件を取り直す」
   ├─「列挙の結果」(coverage が complete なら 1 行の要約、それ以外は今の行)
   ├─ 所在とフォルダの絞り込み
   ├─ 空の状態 (1 つだけ)
   └─ グループ (div role="group" aria-labelledby=見出しの h3 の id。id は useId() から) × N
```

- 過去の区画の最小の高さ (6rem) と稼働中の区画の上限 (`max-h-[calc(100%-6rem)]`。`Sidebar.tsx:135`) は変えない (O-1 SC-003)。検索欄は高さ 2rem (`h-8`) に収め、6rem の中に見出しと検索欄を置いてスクロールの領域を残す
- 「列挙の結果」の要約: `coverageOf(index) === 'complete'` (全部を試し、失敗と打ち切りが無い) のときだけ `outcomesAllOk(n)` の 1 行にする (`n` は対象の数)。失敗・打ち切り・取得中は今の `Outcomes` (所在ごとの行と「取り直す」「続きを取る」)
- グループ (フォルダ / 保留 / 未登録 / 不明) は `section` をやめ `div role="group"` にする。名前は今と同じ見出しの h3 (`aria-labelledby`)
- 見出しの id と、未登録の区画の開閉ボタンの `aria-controls` が指す中身の id は、区画の鍵 (`section.key`) から作らない。今は `section-heading-${section.key}` / `section-panel-${section.key}` で作っている (`SessionListScreen.tsx:208-209`)。これを `Section` の中の `useId()` を接頭辞にした `${prefix}-heading` / `${prefix}-panel` に替える (§2「外部由来の値と DOM の id・セレクタ」)。未登録の区画の鍵はパスを含むので、パスに空白があると `aria-labelledby` の参照が途中で切れる
- 過去の行に `renderTooltip` を渡す。中身は行の題の全文 (`rowTitleText`) をテキストとして描く (HTML として解釈しない)。稼働中の行と同じ部品 (`thread-list.aui.tsx:272` の Tooltip)

## §7 E2E の固定データと基準画像 (spec FR-018 / SC-008)

### 固定の索引 (`e2e-capability.ts`)

`listSessions` / `refreshSessions` が次を返す (今の空の索引 `emptySessionIndex` を置き換える)。

| グループ | 中身 |
|---|---|
| `folder` (E2E の登録フォルダ `fakeFolderDto`) | 3 行。題に日本語と英数字の混ざった合成の文 (`customTitle` か `summary`)。1 行はブランチとタグを持つ |
| `folder` (`fakeWinFolderDto`) | 1 行 |
| `unregistered` | 2 行 (既定で畳む。検索で開いて見せる確認に使う) |

- `outcomes` は全部 `ok` で `complete: true` (「列挙の結果」が 1 行の要約になる)
- 行の `createdAt` は `null` (行に時刻を出さない)。題を必ず持たせ、識別子と時刻の代替表示を出さない。`fetchedAt` は固定の値
- 会話の本文・設定の値・資格情報を含めない (AD-038 / H-3)。`fileSize` は固定の値

### 基準画像 (`e2e/sidebar-screenshot.spec.ts`。新設)

- 撮る前に主ウィンドウの内容の大きさを固定する (CI の画面に収まる大きさ)。サイドバーの幅は固定 (280px) なので、区画の大きさが CI と本機で揃う
- 同梱フォントを `composer-screenshot.spec.ts` と同じ方法 (FontFace + CSSOM) で区画の要素に当てる
- 対象は `[data-testid="past-sessions"]`。取得時刻の行 (`role="status"`) は mask する (表記がタイムゾーンで変わる)
- 基準画像は CI の artifact から取る (本機の描画は揺れる。013 quickstart-results)

### 高さの確認 (SC-008)

既定のウィンドウのまま、偽の supervisor で 10 本を起動して監視ビューの密度を compact にし、過去の区画の見出しと検索欄の矩形が区画の中にあること、区画の中をスクロールして最初の行に届くことを確かめる。
