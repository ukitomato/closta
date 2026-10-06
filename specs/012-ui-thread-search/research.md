# Research: Thread 検索と探す操作 (O-3)

調べた日: 2026-10-06。O-7 (PR #13) をマージした後の main のコードを読み直した。2026-10-04 の版 (O-7 の前の main の行番号) は使わない。

## R-01 範囲の分割 (spec U-1。2026-10-05 に承認)

- **Decision**: O-3 は「探す」(Thread search・会話内検索・Command palette・Empty state) と、義務 (X-4 から) の再利用率の計測経路、義務 (O-1 から) (1) の i18n の判断、義務 (O-7 から) (i)〜(iv) に絞る。義務 (O-1 から) (2) は O-8 (`session`)、conversation map / message timing / heat graph と本文の横断検索の要否は O-9 (`ui`) に移す
- **Rationale**:
  - 入力の全部を入れると FR が 20 を超える。表示 7 種のうち 3 種 (map / timing / heat graph) は時刻が要るが、メッセージの `createdAt` は過去ログ・実行中とも `null` で、agents / domain の変換を変える必要がある。「探す」は renderer の中で閉じる
  - 義務 (2) は (a) が利用者の承認を要し、(d) が ADR を要り、計測は実機でしかできない。「探す」と依存が無い
- **Alternatives**: 全部を入れる (FR 超過・実機でしか閉じられない義務で spec ごと止まる) / perf だけ分ける (map / timing / heat graph の変換の変更が残り FR 超過)

## R-02 Thread search の一致の規則と状態の置き場

- 事実:
  - 所在・フォルダの絞り込みは renderer の中で、IPC を往復させない (`SessionListScreen.tsx:787-797` の `visible`。所在は `narrowToLocation` `:699-717`)
  - 行が属するグループの表示を返す関数は O-7 で `group-label.ts:40-55` の `groupLabelOf` に切り出され、中央のヘッダ (`CenterPane.tsx:145-154`) と「概要」が共有している
  - 区画の開閉は `Section` の中の `useState` (`SessionListScreen.tsx:203-204`)。絞り込みで区画が描かれなくなると開閉の状態が消える (今の所在の絞り込みでもそうなる)
  - `SessionListScreen` はサイドバーに常にマウントされ、サイドバーを畳んでも `hidden` で残る (`Sidebar.tsx:114`。O-7 pr-gate R2 ux M-103)
  - `SessionListScreen` は「element 内蔵の日付グルーピングと検索を使わない」と定めている (`SessionListScreen.tsx:54`)
- **Decision**:
  - 正規化・語・一致の純関数を `features/search/text-search.ts` に置く。Thread search・palette・会話内検索が同じ正規化を使う (data-model §1)
  - **正規化は書記素ごとに行う** (`Intl.Segmenter` の `grapheme`)。半角カナと半角の濁点 (`ｶﾞ` = U+FF76 U+FF9E) は 2 code point で、code point ごとの NFKC では `ガ` に合成されない。U+FF9E は Grapheme_Extend なので 1 書記素にまとまり、書記素ごとの NFKC で `ガ` になる。会話内検索の位置の表 (data-model §2) も書記素の境界で作れ、強調が書記素を割らない
  - 対象のフィールドの組み立ては `features/search/session-search.ts`。グループの見出しの文字列は `groupLabelOf` を使い、新しい導出を作らない。`cwd.value` を直接は読まない (未登録グループの見出しは `groupLabelOf` が返す表示用の文字列として入る)
  - 検索語から `RegExp` を組まない (ReDoS を避ける。字面の `includes` / `indexOf` だけ)
  - **語は `SessionListScreen` の local state に置く** (所在・フォルダの絞り込みと同じ置き場)。常にマウントされているので、中央の切り替え・サイドバーの畳みで消えない (spec FR-001)。`stores/ui.ts` (面の状態) にも `stores/sessions.ts` (一覧の取得の状態) にも置かない
  - **区画の開閉の状態を `SessionListScreen` に上げ、区画の鍵 (`SessionSection.key`) で持つ**。検索中は畳まれた区画も開いて描き、状態は書き換えない。語を消すと元の開閉で描く (US-1 AC1 / AC4)。所在の絞り込みで開閉が消える今の挙動も同時に直る
- **Rationale**: 一覧の DTO は renderer にある。NFKC で全角 / 半角の英数とカナの揺れを吸収できる (Principle VIII)
- **Alternatives**: main で検索する (IPC が要り、既存の絞り込みと揃わない) / あいまい一致 (並びが変わる) / 語を `stores/sessions.ts` に置く (2026-10-04 の版。区画が常にマウントされる O-7 の後は要らない)

## R-03 会話内検索と仮想化・窓・強調

- 事実:
  - transcript は 40 件を超えると仮想化する (`thread.aui.tsx:170,181`)。仮想パスは自前のスクローラで `useVirtualizer` (`:316-333`)、行のキーはメッセージの id (`:318`)、最下部への追従は `stickyRef` (`:297`) と `jumpToBottom` の `scrollToIndex` (`:335-342`)。非仮想パスは `ThreadPrimitive.Viewport` の autoScroll (`:214-217`)
  - index / id で移る公開の口は無い。メッセージの要素は `data-role` だけを持ち、id の属性が無い (`:715,1007`)
  - メッセージの id は文字種を検証していない外部由来の値である。過去ログは JSONL の `uuid` を空でない文字列かだけで受け (`transcript.ts:173,279`)、実行中は SDK の `uuid` (`live-message.ts:76`) と合成の id (`system-event.ts:122,135` の `hook:` / `task:`、`live-tool-results.ts:54` の `result:`)。renderer の本番コードに `CSS.escape` は 0 件
  - **実行中は assistant-ui に末尾の窓 (`MESSAGE_WINDOW` = 100。`session-view.ts:460`) だけを渡す** (`RunningSessionsProvider.tsx:126-137`)。窓の外は「さらに表示」(`showMore`) で広げる。ストアは全件を持つ。実行中のストアはメッセージを id で差し替え、変わらないメッセージは同じ object のまま (`running-session-store.ts:102-111` の `upsertMessage`)
  - 過去ログの本文は `ChatScreen` の中の `useTranscript()` が取る (`ChatScreen.tsx:77`)。取得は port を開くので、2 か所で呼ぶと取得が 2 本走る
  - assistant の text part は `MarkdownText` で描く (`thread.aui.tsx:771`)。変換は添付のファイル名と圧縮の境界も text part にする (`convert.ts:75,78`)
- **Decision**:
  - **件数は本文のデータで数える**。単位は「text part の中の出現 1 つ」。描かれていないメッセージも数えられる。正規化した本文はメッセージの object ごとに `WeakMap` に覚え、語が変わったときは `indexOf` だけを回す。本文が変わったメッセージ (object が変わったもの) だけを正規化し直す (data-model §2。SC-002 の「変わったメッセージだけを走査する」)
  - **移動は id で行う**。transcript の context に navigator を足し、`thread.aui.tsx` が `scrollToMessage(id): boolean` を登録する。仮想パスは `virtualizer.scrollToIndex(index, { align: 'center' })` の後、要素が描かれたら `scrollIntoView({ block: 'center' })` で合わせ直す (可変の高さで目標に止まらないことがある)。非仮想パスは、描かれた `[data-message-id]` の要素から `dataset.messageId === id` のものを探して `scrollIntoView`。**id を CSS セレクタの文字列に埋め込まない** (`"` `\` `]` を含む id で `querySelector` が投げ、`a"],[data-message-id="b` のような id はセレクタの結合として別のメッセージに当たる。2026-10-06 の design-gate R2 H-03。CWE-74 / CWE-20)。セレクタは固定の `'[data-message-id]'` だけを使い、id は `dataset` の厳密比較で照合する。強調の対象の引き方も同じ (data-model §2「メッセージの要素の引き方」)。**移るときに最下部への追従を切る** (`stickyRef = false`。非仮想パスは最下部を離れると `Viewport` が追従しない)。R-3 のアンカリング (利用者が上にいる間は追従しない) と同じ扱い
  - **実行中で窓の外のメッセージに移るときは、窓をそのメッセージまで広げる** (`RunningSessionsView` に `revealMessage(id)` を足す)。「さらに表示」と同じ窓の操作で、広げるのは利用者の移動の操作のときだけ。広げた分の assistant-ui の再構築の費用は「さらに表示」と同じ (X-5 SC-003 の窓の理由は保つ)
  - **強調は CSS Custom Highlight API** (`CSS.highlights` と `Range`) で、描かれた DOM の text node に掛ける。DOM を書き換えない・HTML を組まないので、markdown の描画と XSS 境界 (R-3 FR-020) に触れない。Electron 39 (Chromium) で使える。jsdom は `CSS.highlights` を持たないので、登録先を差し替えられる形にし、テストは作った `Range` (どの text node のどこか) を検査する
  - 強調の位置は描画の DOM の文字列から求める (本文の markdown の記号は描画で消える)。DOM の文字列を §1 の正規化に通し、**正規化後の位置 → 元の書記素の範囲 → (text node, offset)** の 2 段で写す。範囲外の位置は飛ばす (例外を出さない。2026-10-04 の design-gate R1 security H-001)
  - 本文の出現数と描画の出現数がずれたときは、描画の中で写せた出現だけを強調する。現在の一致は「そのメッセージの中の k 番目」で引き、描画に k 番目が無ければ強調せずメッセージだけを画面に入れる
  - `::highlight()` の規則はバンドルされる CSS (`assets/main.css`) に置き、既存のテーマのトークンを使う。本番の CSP は `style-src 'self'` で、実行時に足した `<style>` は本番でだけ落ちる
  - 過去ログは `PastCenter` が `useTranscript()` を 1 回だけ呼び、結果を検索の供給元と transcript の本体に渡す (`ChatScreen` を「取得」と「本体」に分ける)。単体で描く `ChatScreen` (O-2 の component テスト) は今のまま使える
- **Alternatives**: 本文を区切って `<mark>` を差し込む (`MarkdownText` の内側を変える必要があり、markdown の構文を壊す) / `webContents.findInPage` (仮想化の外に届かず main を経由する) / 窓を常に全件にする (X-5 SC-003 の理由で窓を入れたので戻せない) / id を `CSS.escape` でエスケープしてセレクタに埋める (エスケープの漏れが 1 か所でもあれば同じ欠陥になる。照合を `dataset` の比較 1 つに揃えるほうが確かめやすい) / メッセージの root の ref callback で `Map<id, HTMLElement>` を navigator に登録する (登録と解除の管理が仮想化の描画と絡む。描かれた要素は高々 40 件か仮想化の窓の分なので、回して比べる費用は小さい)

## R-04 Element (Principle XIII)

- 事実: registry (`.claude/skills/elements/references/catalog.md:79,83,88,89`、`standalone-elements.md:1455-1476,1677-1707`) に次がある。どれも props だけで動き、runtime を読まない (standalone)
  - `elements-command-palette` (`CommandPalette`: `commands` / `query` / `activeId` / `onQueryChange` / `onActiveChange` / `onRun`。命令は `group` と `keys` を持つ)。`activeId` (命令の id) を DOM の id やセレクタに使うかは、source を取り込むまで分からない
  - `elements-conversation-search` (`ConversationSearch`: `query` / `hits` (前後の文と位置) / `activeIndex` / `onQueryChange` / `onStep`。スクロールバーに一致の印を出す)
  - `elements-thread-search` (`ThreadSearch`: pinned を先に、時刻でまとめた一覧)
  - `EmptyState` は取り込み済み (`components/assistant-ui/elements/empty-state.tsx`)
- **Decision**:
  - command-palette と conversation-search を実装の最初に取り込み (`npx assistant-ui@latest add elements-command-palette elements-conversation-search`)、中身を確かめる。**採る条件**: (a) palette の入力と候補が combobox / listbox の役割を持つか、持たせられる (b) 文言を外から渡せるか、コピーした中で文言の表に差し替えられる (c) 変換中のキーで動かない形にできる (d) 実行時に `<style>` を足さない (e) 命令・候補の id (外部由来の値を含む。`session:past:<rowKey>`) から DOM の id・IDREF・セレクタを組まない。組んでいるなら、取り込んだ中で `useId()` と添字の方式に差し替えられる (data-model §2「外部由来の値と DOM の id・セレクタ」)。満たせば見た目の部品として使い、外側 (Dialog・キー・状態・走査) は features に置く。満たせない (直す量が中身の大半になる) ときは既存の Radix の Dialog (`components/ui/dialog`) と Button で作り、理由を対応表の F 節の備考に書く
  - conversation-search の「スクロールバーの一致の印」は、仮想化で描かれていない範囲の高さを知らないので、使うなら印は出さない (位置は本文の並びの比で近似しない)
  - 取り込んだ element に手を入れたら、`eslint.config.mjs` の手書きの element の一覧 (`:557-599`) に足す (`thread.aui.tsx` と同方針)
  - **thread-search は使わない**。時刻のまとまりと pinned を前提にし、R-2 の登録フォルダのまとまり (FR-022) と合わない。過去の区画に検索欄だけを足す。F 節の行は `未使用` と理由を書く (spec FR-015 の「使い道を本 feature の表示にする」は、使わない理由を本 feature の結論として書くことで満たす)
  - キー: Ctrl+K / Ctrl+F は `window` の keydown (capture) で受ける。`event.isComposing` か `keyCode === 229`、または `[aria-modal="true"]` の要素が開いているときは何もしない (`preventDefault` もしない)。既存の keydown の購読は画像ダイアログのフォーカストラップ 1 件 (`components/image.tsx:298`) だけで、Electron の既定のメニューにも Ctrl+K / Ctrl+F の accelerator は無い (`window.ts:48` は `autoHideMenuBar` だけ)
- **Alternatives**: `cmdk` のライブラリを足す (依存が増える。element に同等がある)

## R-05 再利用率の記録

- 事実 (O-7 の後の main):
  - 起動の口: capability の `launchSession(config)` (`capability.ts:122`)、チャネルの表 (`:199-239`)、preload (`preload/index.ts:58`)。main は `ipc.ts:164-172` の `handle()` で送信元を検査し、`:282-291` で `handleLaunchSession` を呼んで `launching` のときだけ port を渡す。形の検査は `session-ipc.ts:137-144`。`IpcDependencies` (`ipc.ts:77`) は `SessionIpcDeps` (`session-ipc.ts:35-65`) と別に宣言されていて、構造で渡している
  - preset の store は一時ファイルからの置き換えと `.bak` の退避を持つ (`preset-store.ts:59-181`)。直列化と読み込みの状態は service (`preset-service.ts:45-137`。`serialize` `:54-58`・`ensureLoaded` `:60-81`)。配線は `composition-root.ts:296-297,333`、E2E は `e2e-capability.ts:412-433`
  - renderer の起動の経路: シェルの `LaunchDialogHost` (`LaunchDialogHost.tsx:28-87`) → `LaunchDialogContent` / `NewSessionDialog` (`LivePane.tsx:56-91`) → X-4 の `LaunchDialog` (`applyPreset` `:323-327`・`launch` `:347-355`・`PresetPanel` `:395-399`。起動の口の型 `LaunchSource` `:53-61`) → `RunningSessionsView.launch` (`RunningSessionsProvider.tsx:68-72`・`running-sessions-view.ts:25`) → ストアの `launch(config, folderLabel)` (`running-session-store.ts:356-418`) → capability の `launchSession(config)`
  - `LaunchDialog` の下書きの初期値は、`launch.lastConfig` があればそれ (`LaunchDialog.tsx:178-180`)。`lastConfig` は起動の開始で入り、受け付けられても消えない。失敗したセッションを閉じたときは、そのセッションの設定に替わる (`running-session-store.ts:553-559`)
- **Decision**:
  - capability の `launchSession(config, origin)` に第 2 引数 `origin: LaunchOrigin` を足す。`SessionLaunchConfig` は変えない (起動の設定と計測を分ける)
  - main は `session-ipc.ts` の `handleLaunchSession` で、起動元を `checkLaunchOrigin` (domain の厳密比較) で検証し、結果が `launching` のときだけ `deps.recordLaunchUsage(origin)` を await せずに呼ぶ。`ipc.ts` は ipcMain に依存して Vitest で読めないので、検証と委譲を置かない (`session-ipc.ts:20-32` の分担)。`recordLaunchUsage` は reject しない (service が握ってログに出す)
  - 記録は `src/main/infra/settings/launch-usage-store.ts` (store) と `src/main/app/launch-usage-service.ts` (直列化・日付・読み込みの状態)。足す・刈り込む・合計する・暦日を作るのは `src/domain/session/launch-usage.ts` の純関数
  - 読み込みの結果ごとの扱いは既存の settings の store に合わせる (将来版で書かない・日単位の不正を飛ばす・退避に失敗したら書かない・読めないときは読み直す。2026-10-04 の design-gate R1 database-reviewer)
  - 読み出しは新しいチャネル `closta:getLaunchUsage` が集計済みの値を返す (data-model §4)
  - 日付は main が `now()` とローカルの時差からローカルの暦日 (`YYYY-MM-DD`) を作る。renderer の時計を信じない
  - renderer は「このダイアログでプリセットを適用したか」と「このダイアログで軸を手で変えたか」を `LaunchDialog` が持つ。ダイアログが前回の設定 (`lastConfig`) を初期値に出すときは、経路 (拒否・失敗・受け付けの後・起動せずに閉じた後) を問わず、ストアの起動元 (`lastOrigin`) を初期の起動元にする。初期の起動元を使うのは、適用も軸の変更もせずに起動したときだけで、適用せずに軸を手で変えたら `manual` (data-model §4「renderer の起動元」)。`lastConfig` は受け付けの後も残って次のダイアログの初期値になるので、受け付けの後だけ `manual` にすると、同じプリセットを続けて使う起動ほど「適用しない」に数えられ、KPI が系統的に傾く (2026-10-06 の design-gate R2 H-02)。逆に、軸を変えても引き継ぐと、`lastConfig` は 1 回のアプリの起動の中で null に戻らない (`running-session-store.ts:97,362,556`) ので、1 度プリセットを適用した後の起動はアプリを閉じるまで全部 `preset` になり、KPI が逆向きに傾く (2026-10-06 の design-gate R3 H-04。利用者が選択)。失敗したセッションを閉じたときの起動元はそのセッションの起動元にするため、稼働中のセッションの状態に起動元を持たせる (`lastConfig` と同じ規則)
  - 刈り込みは暦の日数ではなく鍵の数で行う (今日の鍵と、ほかの新しい順の 89 個。data-model §4)。暦の日数を基準にすると、時計が先に跳んだ後の書き込みで跳ぶ前の日がまとめて消える。基準日を `min(today, 記録の中の最も新しい日)` にしても、書き込みは `addLaunch` → `prune` の順なので基準日は常に today で、足す前の最も新しい日を基準にしても、跳んだ先の日が記録に入った後の 2 回目の書き込みで基準が跳ぶ (2026-10-06 の design-gate R2 H-01)
  - 実名リスト方式の規則: 新しい service を `.dependency-cruiser.js` の `services-not-to-io` (`:252-256`) と `allowlists.mjs` の `WSL_FREE_DIRECTORIES` (`:480-502`) に足す。store は `src/main/infra/settings/` に置くので `SECRET_LITERAL_SCAN_DIRS` (`:452`) に自然に入る
- **Rationale**: 日ごとの回数だけなら、秘密や識別子が構造上入らない (Principle V)。ファイルは最大 90 キーで大きくならない
- **Alternatives**: 起動ごとの行の追記 (時刻・プリセット名が残り、刈り込みと秘密の検査が要る) / renderer の localStorage (main の永続化の規則の外。database-reviewer の観点の外になる) / `SessionLaunchConfig` に起動元を足す (起動の設定と計測が混ざり、プリセットに保存される) / 刈り込みを暦の日数で行い、跳んだと見たら止める (跳んだ先の日が最も新しい日になった後の書き込みで止まらない) / 最後に刈り込んだ日をファイルに持つ (FR-011 のキー集合の外になる)

## R-06 i18n の判断 (spec U-3。2026-10-05 に accepted)

- **Decision**: リソース化しない。[AD-045](../../docs/decisions/0045-ui-labels-no-i18n-resources.md) (accepted)。Constitution XV (`constitution.md:849`) を本 feature の PR で MINOR で改める (v1.3.0 → v1.4.0。改定手順 2 / 4)
- 事実: UI の文言は feature ごとの `labels.ts` にある。`target-finder.ts` が `候補 #N` / `名前 (#N)` を作る (AD-045 Decision 3)
- composer の名前と placeholder (`thread.aui.tsx:580,585`) は英語。locator は E2E (`e2e/support/launch.ts:59`・`e2e/multi-session.spec.ts:53,68,71,80,84,120,141`・`e2e/launch-dialog.spec.ts:108,140`)、component テスト (`ChatScreen.test.tsx:115,264,271`・`AppShell.test.tsx:999,1002`)、実機計測 (`perf/real-sessions.spec.ts:93,200`) にある
- **Decision (composer)**: 名前と placeholder を `features/chat/labels.ts` の文言の表から取る (elements が import してよい features は `features/chat` だけ。`labels.ts:6-7`)。locator を同じ PR で直す。**perf の locator も文字列だけ直す** — perf を実行せず、安全柵・出力・実行の条件を変えないので、実機計測ハーネスの ADR の条件 (perf の安全柵・出力を変える) には当たらない (O-7 が perf の手順を直したときと同じ。013 plan の Technical Context)。直さないと O-8 が perf を流したときに入力欄を見つけられない
- composer の基準画像 (`composer-fullwidth`) は、撮る前に本文を入れる (`composer-screenshot.spec.ts:32`) ので placeholder は写らず、名前は画像に出ない。変わらない見込みで、変わったら CI の artifact から取り直す
- 他のボタンの英語の名前 (`Send message`・`Stop generating`・`Scroll to bottom` など) は直さない (roadmap の system-scope (7) が名指すのは名前と placeholder だけ)。持ち主を roadmap に書く (plan RK-08)
- **Alternatives**: AD-045 の Alternatives

## R-07 Command palette の候補と、稼働中と過去の id

- 事実: 稼働中のセッションの id はアプリが振る UUID (`session-launch-service.ts:81-82,200` の `newSessionId`) で、`query()` に渡していない (`sdk-agent-session.ts:507`)。過去の行の `sessionId` は Claude Code のセッションの id。`SessionEvent` にも Claude Code のセッションの id を運ぶ種類が無い (`agent-session.ts:168-179`)。実行中のセッションの記録は過去の一覧にも別の id の行として載る
- **Decision**: palette は稼働中と過去の候補を両方出し、種別 (稼働中 / 過去) を添える。同じ会話の 2 つの候補は結ばない。spec FR-007 と Edge Cases の「同じ id の過去の行は稼働中の 1 件にまとめる」を、この事実に合わせて直した (結ぶには session の契約を広げる必要があり、spec の境界 (SC-006・U-2) の外)
- **Alternatives**: id を比べる (名前空間が違い、常に一致しない規則になる) / Claude Code のセッションの id を `SessionEvent` で運ぶ (session の契約の拡張。O-3 の範囲外)

## R-08 E2E の固定データと基準画像 (FR-018 / SC-008)

- 事実: E2E の偽の capability は空の一覧を返す (`e2e-capability.ts:61-63,393-394`)。基準画像は composer の 1 枚で、同梱フォントを FontFace と CSSOM で入れて撮る (`composer-screenshot.spec.ts:38-49`)。CI のランナーは画面が 768px で、ウィンドウが画面に合わせて縮む (013 quickstart-results)
- **Decision**:
  - E2E の偽の capability の `listSessions` / `refreshSessions` が固定の索引を返す (data-model §7)。合成の題と表示用の値だけで、会話の本文・設定の値を含めない (AD-038 / H-3)
  - 行に時刻を出さない (`createdAt: null`、題を持たせて識別子と時刻の代替表示を出さない)。取得時刻の行はタイムゾーンで表記が変わるので、撮るときに mask する
  - 撮る前に主ウィンドウの内容の大きさを固定する (CI の画面に収まる大きさ。例 1000×700)。サイドバーの幅は固定 (280px) なので、高さを固定すれば区画の大きさが CI と本機で揃う
  - 対象は過去のセッションの区画 (`[data-testid="past-sessions"]`)。基準画像は CI の artifact から取る (本機の描画は揺れる)
  - SC-008 の高さは別の E2E で、既定のウィンドウのまま、偽の supervisor で 10 本を起動して監視ビューの密度を compact にし、過去の区画の見出しと検索欄の矩形が区画の中にあること、区画の中をスクロールして最初の行に届くことを確かめる
- **Alternatives**: 全画面を撮る (O-4〜O-6 が右のペインと中央のヘッダを変えるたびに取り直しになる。spec Clarifications 2026-10-06 (iii)) / 一覧の component テストだけで見る (jsdom は幅と高さを測れない)
