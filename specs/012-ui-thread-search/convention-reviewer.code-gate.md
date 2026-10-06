# convention-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: convention-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: Thread search の module 配置 (`features/search/`・`SessionListScreen.tsx`)
  - FR-003〜FR-005: 会話内検索の module 群 (`features/chat/conversation-search.ts` / `useConversationSearch.ts` / `ConversationSearchProvider.tsx` / `ConversationSearchBar.tsx` / `search-highlight.ts` / `transcript-context.ts`)
  - FR-006 / FR-007: palette (`features/shell/CommandPalette.tsx` / `palette-commands.ts` / element `command-palette.tsx`)
  - FR-009〜FR-013: 起動の利用記録 (`domain/session/launch-usage.ts` / `infra/settings/launch-usage-store.ts` / `app/launch-usage-service.ts`)。実名リスト (`services-not-to-io`・`WSL_FREE_DIRECTORIES`) に載っているかも見た
  - FR-014: composer のリネームが全部終わっているか
  - FR-016: glossary の用語がコードの識別子と合っているか
  - FR-018: `e2e/sidebar-screenshot.spec.ts`
  - SC-005: 書き出すキーの名前 (`schemaVersion`)
  - SC-006: IPC チャネルの命名
  - SC-007: constitution-check が exit 0
- touched files に当たる charter / Confirmation:
  - ui charter の In scope (O-3 の例外 U-5、`docs/domains/ui/charter.md:53-59`): 「一致の規則 (`features/search/`) と検索欄・絞り込みは本 domain が持ち」→ 配置の判断に使った (M-002)
  - ui charter の「面の状態」(`:180-189`): palette は session ストアの選択の操作を呼ぶだけ
  - AD-033 Decision 1: runtime 接続型は `.aui.tsx`、props で動く standalone は `.tsx`。新しい element の `command-palette.tsx` / `conversation-search.tsx` は standalone なので、`.tsx` は規約どおり
  - AD-023 §5/§7 と AD-025 §9: 実名列挙の規則 (`.dependency-cruiser.js:252-256` / `allowlists.mjs:498-503`) に `launch-usage-service` が足されている
  - AD-038 D2: `e2e/` は src のグラフの外 (lint の対象外)
  - AD-045 Confirmation: 直書きの基準線は ux-reviewer の担当なので判定しない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`checkLaunchOrigin`・セレクタに id を埋め込まない点などは担当外)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (M-002 は charter の文面を配置の判断の根拠に使っただけ。drift の判定はしていない)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:7
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage の各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 — F の各指摘を検出・保護するテストがあるかと、リネーム漏れ・循環が無いことを実地で確かめた (詳細は下の「H の確認」)

## スコープ要約

code-gate iteration 1 の作業ツリーの差分 (base `73ebbc0`、93 ファイル) が対象です。新しい renderer の module は約 15、main/domain は 3、element は 2 (registry から取り込んで手を入れたもの)、E2E は 1 です。

lint-agent の JSON は 7 コマンドで、どれも `exit_code: 0`、`violations: []` でした。したがって CONV-1 由来の指摘と、exit code 由来の Critical はありません。循環依存は lint-agent の dependency-cruiser (`no-circular` は severity error、387 modules) が exit 0 で確かめ済みなので、madge などは自分で実行していません (二重の実行とプロセスの起動を避けるため)。

命名の規則 (component は PascalCase、module は kebab-case、hook は `useX.ts`、main は `*-service.ts` / `*-store.ts`) は新しいファイルすべてで揃っています。import の順 (external → `@domain` → `@/` → 相対) も既存の慣習どおりです。指摘は 4 種類あります。

- 同じ判定のコピーが複数ある (IME / modal / errno)
- 500 行を超えるファイルがさらに伸びた
- spec / data-model の名前とコードの名前がずれている
- 名前が衝突している・参照されない export がある

## Findings

### [Medium] IME の変換中の判定とモーダルの判定が 4 ファイルに 7 か所コピーされている (M-001) (scope: feature)

- **観察**: 変換中かの判定 `isComposing || keyCode === 229` を、同じ名前 `isComposingKey` の関数 3 つと inline 2 か所で書いています。
  - `ConversationSearchProvider.tsx:43-45` (native event)
  - `CommandPalette.tsx:33-35` (native event)
  - `SessionListScreen.tsx:805-807` (React event)
  - inline: `ConversationSearchProvider.tsx:166` と element の `command-palette.tsx:126`

  FR-006 / FR-003 の「モーダルのダイアログが開いている間は開かない」を決める `modalDialogOpen()` も、同じ中身で 2 か所にあります (`ConversationSearchProvider.tsx:59-61` / `CommandPalette.tsx:49-51`)。
- **同種事象探索**:
  - `keyCode === 229` (src、テストを除く): コードは 5 件 / 4 ファイル (`command-palette.tsx:27` はコメントなので除外)
  - `aria-modal="true"\]') !== null`: 2 件
  - 本 PR より前からある共有の helper: 0 件 (`isComposing` を判定する module は無い)
- **リスク/影響**: Principle VIII (NON-NEGOTIABLE) の規則と FR-006 のモーダルの判定が、1 つの規則として存在していません。将来 `key === 'Process'` を足す、`[aria-modal]` の判定を Radix に合わせて変える、といった変更は 5 か所と 2 か所に同時に入れる必要があり、1 か所でも漏れれば palette・会話内検索・Thread search の挙動が分かれます。各コピーにテストはありますが、コピー同士がずれたことを検出するテストはありません。
- **推奨アクション**: `src/renderer/src/lib/keyboard-guards.ts` (手書き) に `isComposingKey(event: KeyboardEvent | React.KeyboardEvent): boolean` と `isModalDialogOpen(doc = document): boolean` を 1 つずつ置き、上の 7 か所をそこから import する形に置き換えてください。element の `command-palette.tsx` はすでに `@/lib/utils` を import しているので、同じ経路で使えます。`lib/` は `GENERATED_FILES` に入るので、`lib/safe-url.ts` と同じく `eslint.config.mjs:549-556` の strictness を戻す一覧に足してください。テストは helper の単体を 1 本にまとめ、既存の component テストはそのまま残します。
- **根拠**: CONV-3 (単一責任・module 分割)、Principle VIII、spec FR-006 / FR-003
- **scope 根拠**: 7 か所すべてが本 PR で足された touched files にある

### [Medium] `SessionListScreen.tsx` が 1427 行になった (+約 284 行)。ui が持つ Thread search の部品が session の module の中にある (M-002) (scope: feature)

- **観察**: `SessionListScreen.tsx` は本 PR の前が約 1143 行 (最後の hunk `-870,274`) で、今は 1427 行です。CONV-3 の 500 行の警告をすでに超えていたファイルに、次のものを同じファイルの中に足しています。
  - `narrowToTerms` (`:781`)
  - `openByDefault` (`:800`)
  - `isComposingKey` (`:805`)
  - `PastSearchField` (`:814-882`)
  - 開閉の状態 (`toggled`) と検索の state

  一方、ui charter (`docs/domains/ui/charter.md:55-56`) は「一致の規則 (`features/search/`) と検索欄・絞り込みは本 domain (ui) が持ち、一覧の中身・行の形・取得は session のまま」と書いています。
- **同種事象探索**: touched files のうち 500 行を超えるもの (行数):
  - `SessionListScreen.tsx` 1427 (+約 284)
  - `thread.aui.tsx` 1202 (+約 95。手を入れた element)
  - `LaunchDialog.tsx` 755 (+約 22)
  - `running-session-store.ts` 650 (+約 15)
  - `e2e-capability.ts` 619 (+約 166。**本 PR で 500 行を超えた**。固定の索引 `e2eSessionIndex` `:285-384` が約 140 行)
- **リスク/影響**: 1 ファイルの責務が、一覧の描画・空の状態の優先順位・所在とフォルダの絞り込み・Thread search の入力と絞り込み・区画の開閉にまで広がり、O-9 (本文の横断検索の要否) などで検索を広げるたびにこのファイルが伸びます。charter が ui に割り当てた部品が session の module の中にあるので、持ち主を module から読み取れません。
- **推奨アクション**:
  - `PastSearchField` と `narrowToTerms` を `features/search/` (ui) に移してください (例: `features/search/PastSearchField.tsx`・`features/search/past-section-filter.ts`)。`SessionListScreen` は import して使うだけにします。
  - `isComposingKey` は M-001 の共有の helper に置き換えます。
  - `e2e-capability.ts` の `e2ePastRow` / `e2eSessionIndex` は `src/main/app/e2e-session-index.ts` に分けられます。その場合、新しい app の module は `scripts/constitution/allowlists.mjs` の `WSL_FREE_DIRECTORIES` (app の module を実名で列挙している) に足すかを決める必要があります。
  - `LaunchDialog.tsx` / `running-session-store.ts` / `thread.aui.tsx` は増分が小さく、切り出しの持ち主が roadmap の記録にあるので、本 PR では対象にしません。
- **根拠**: CONV-3 (1 ファイル 500 行超は warning)、ui charter In scope (U-5)、plan Structure Decision (`features/search/` は検索の共有の置き場)
- **scope 根拠**: touched files の中で移せる

### [Medium] spec の Key Entities の名前 (`version` / 「本文の位置」) が実装と data-model (`schemaVersion` / `occurrence`) と食い違ったまま (M-003) (scope: feature)

- **観察**:
  - `spec.md:320` は起動の利用記録を `{ version, days: … }` と書いています。実装は `schemaVersion` です (`launch-usage.ts:31` の `LAUNCH_USAGE_SCHEMA_VERSION`、`:65` の `LaunchUsageRecord.schemaVersion`、`launch-usage-store.ts:157` の `parsed.schemaVersion`)。data-model (`:232`)、glossary (`docs/glossary.md:499`)、discovery も `schemaVersion` です。
  - `spec.md:317` は会話内検索の一致を「メッセージの id と本文の位置」と書いています。実装は `occurrence` (出現の順。`conversation-search.ts:30-33`) で、data-model §2 (`:89`) と同じです。
  - design-gate の M-14 と analyze の I2 が同じ食い違いを指摘し、`unresolved` のまま残っています。
- **同種事象探索**: `\{ version, days|schemaVersion` (specs/012) → spec は `version` が 1 件 (`spec.md:320`)。それ以外 (data-model 3 件、レビューの記録) と src はすべて `schemaVersion`。
- **リスク/影響**: SC-005 の「固定のキー集合のテスト」は、このキーの名前に依存しています。spec を正として読む reviewer や後続 feature が `version` と読むと、テストの期待や移行の設計を誤ります (CONV-6 のリネーム漏れ)。
- **推奨アクション**: spec の Key Entities の 2 行を、形を繰り返さずに data-model §2 / §4 を正本として指す書き方に直してください (design-gate M-14 の推奨と同じ)。コードは変えません。
- **根拠**: CONV-6、Principle XIV、design-gate M-14 / analyze I2 (前の gate から持ち越し。severity も同じ)
- **scope 根拠**: 本 spec のディレクトリの中の文面で直せる

### [Low] 本番で参照されない export と、古い名前を指す注記 (L-001) (scope: feature)

- **観察**:
  - `ConversationSearchState` (`conversation-search.ts:39-47`) は data-model §2 の型をそのまま写したものですが、src 全体 (テストを含む) で参照が 0 件です。実際の状態の型は `ConversationSearchController` (`useConversationSearch.ts:47-64`。`term` / `position` / `navigation` を持つ) です。
  - `ChatScreen` (`ChatScreen.tsx:72`) は `CenterPane` が `ChatScreenBody` に切り替えた後、本番の参照が 0 件になりました (テストだけが使う。plan が残すと決めたもの)。それなのに `CenterPane.tsx:33` の注記はまだ `ChatScreen` を指しています。
- **同種事象探索**: `\bConversationSearchState\b` → 1 件 (定義だけ)。`\bChatScreen\b[^.B]` (テストを除く) → 定義 1 件、注記 3 件 (`CenterPane.tsx:33`・`transcript-context.ts:12`・`thread.aui.tsx:765`)、本番の import 0 件。
- **リスク/影響**: 型が 2 つあり、spec にある名前のほうが使われていません。data-model を見て `ConversationSearchState` を直しても、挙動は何も変わりません。参照されない export を検出する検出器は無いので (`noUnusedLocals` と `@typescript-eslint/no-unused-vars` は local だけ、dependency-cruiser の `no-orphans` は module 単位)、このまま残ります。
- **推奨アクション**: `ConversationSearchState` を消すか、`ConversationSearchController` が `ConversationSearchState` を extends する形にして名前を 1 つに寄せてください。data-model §2 の型名は実装の名前に合わせます。`CenterPane.tsx:33` は `ChatScreenBody` に直してください。
- **根拠**: CONV-5 / CONV-6
- **scope 根拠**: touched files の中

### [Low] `errnoCode` が同じ名前で 3 か所にあり、返り値の契約が違う (L-002) (scope: feature)

- **観察**:
  - `launch-usage-store.ts:77-80` は `string | undefined` を返します。
  - `launch-usage-service.ts:46-49` は同じ名前で `string` を返し、当てはまらなければ `'unknown'` を返します。
  - 前からある `preset-store.ts:54-57` は `string | undefined` です。
  - どれも Principle V のログの浄化 (errno の形 `/^[A-Z][A-Z0-9_]*$/` だけをログに出す) の正規表現を、それぞれのファイルで持っています。
- **同種事象探索**: `function errnoCode` → 3 件 (本 PR の新規 2 件)。
- **リスク/影響**: 同じ名前で意味が違うので、取り違えやすくなっています。浄化の正規表現を 1 か所で直しても、ほかのコピーには届きません。
- **推奨アクション**: `src/main/infra/settings/` に `errnoCodeOf(error): string | undefined` を 1 つ置き、service は `?? 'unknown'` で受ける形にそろえてください。preset-store も同じ関数に寄せられます。
- **根拠**: CONV-3、Principle V (ログに値・パスを出さない)
- **scope 根拠**: 新規の 2 件は touched files の中。preset-store は寄せてもよい既存の 1 件

### [Low] data-model §4 の service の状態の名前がコードに出てこない (L-003) (scope: feature)

- **観察**:
  - data-model §4 の表 (`data-model.md:249-256`) は service の状態を `storeNewerVersion` / `readFailed` と名指しています。兄弟の service も `storeNewerVersion` という名前を使っています (`preset-service.ts:49`・`provider-service.ts:117`)。
  - 実装は `state: 'unloaded' | 'loaded' | 'newer-version'` (`launch-usage-service.ts:55`) で、`readFailed` は `unloaded` の中に畳まれています。
  - テストの題 (`launch-usage-service.test.ts:157`「読めない (readFailed) の後は…」) は、存在しない識別子を指しています。
  - 将来版を表す名前が層ごとに違います。store の結果は `kind: 'newer-version'` (`launch-usage-store.ts:50`)、ログの理由キーは `schema-version-unknown` (`launch-usage-service.ts:76`) です。preset-store は将来版を `reasonKeys` の `'schema-version-unknown'` で返しており、shape も違います。
- **同種事象探索**: `storeNewerVersion|readFailed|newer-version|'unloaded'` (src/main) → launch-usage 系 9 件、preset / provider 系 17 件。
- **リスク/影響**: data-model の表と兄弟の service を手がかりにコードを探しても見つかりません。「preset-store と同じ構え」と書かれていますが、結果の shape が違います。
- **推奨アクション**: data-model §4 の「service の状態」列を実装の値 (`unloaded` (読み直す) / `loaded` / `newer-version`) に直すか、実装を data-model の名前に寄せるか、どちらかにそろえてください。テストの題も同じ名前にします。
- **根拠**: CONV-6
- **scope 根拠**: touched files と本 spec の data-model の中

### [Low] ストアの `launch` の `origin` が任意で、省くと黙って `'manual'` になる (data-model の署名との差) (L-004) (scope: feature)

- **観察**:
  - `running-session-store.ts:56-61` は `launch(config, folderLabel?, origin?)` で、`:366` が `origin = 'manual'` を既定にしています。
  - data-model §4 (`:295-296`) と tasks FE-040 は `launch(config, folderLabel, origin)` と書いており、起動元は必須です。
- **同種事象探索**:
  - 本番の呼び出し: 1 件 (`RunningSessionsProvider.tsx:71`。起動元を渡している)
  - テストの呼び出し: 36 件 / 12 ファイル (既定に頼っている)
- **リスク/影響**: 計測の値なので、後から足した呼び出しが起動元を省いても型の誤りにならず、`manual` として記録されて KPI「再利用率」が傾きます。
- **推奨アクション**: `origin: LaunchOrigin` を必須にしてください。テストは `'manual'` を明示して渡すか、テスト用の helper で包みます。
- **根拠**: CONV-6 (spec の署名と実装の一致)
- **scope 根拠**: touched files の中

### [Low] 名前が衝突していて、別名・取り違えが要る (L-005) (scope: feature)

- **観察**:
  - `CommandPalette` という名前の export が 2 つあります (element `command-palette.tsx:67` と `features/shell/CommandPalette.tsx:66`)。feature 側は element を `CommandPaletteView` という別名で import しています (`CommandPalette.tsx:3-6`)。
  - `PaletteCommand` 型は element の `command-palette.tsx:30` にあります。`palette-commands.ts` は `PaletteAction` / `PaletteCandidate` を export していて、`PaletteCommand` を持ちません。
  - 「ConversationSearch」の名前で、3 つの別物が近いパスにあります。
    - element の `ConversationSearch` (`conversation-search.tsx:30`)
    - 走査の module `features/chat/conversation-search.ts`
    - `features/chat/ConversationSearch.test.tsx` (中身は Provider / Bar / CenterPane のテストで、`ConversationSearch.tsx` という source は無い)
  - `ConversationSearchBar.tsx` は `ConversationSearchButton` (`:66`) も export しています。
  - `folderNameOf` が 2 つの署名で使われています: `SessionListScreen.tsx:1015` は `(section)` を取り、`session-search.ts:27` の `FolderNameOf` と `CommandPalette.tsx:220` は `(folderId)` を取ります。
- **同種事象探索**: `export function CommandPalette` → 2 件。`ConversationSearch` という名前のファイルと export → 3 種類。`folderNameOf` の宣言 → 3 件 (署名は 2 種類)。
- **リスク/影響**: `vitest related` や人が、test と source の対応を名前から誤って読みます。grep で目当てに届くまでの手間も増えます。
- **推奨アクション**:
  - feature 側を `CommandPaletteDialog` に改名して別名を無くす。
  - test を `ConversationSearchProvider.test.tsx` (または既存の慣習の振る舞いの名前、例 `conversation-search-ui.test.tsx`) に改名する。
  - `SessionListScreen` の local の関数を `sectionFolderName` に改名する。
- **根拠**: CONV-2 / CONV-6
- **scope 根拠**: touched files の中

### [Low] 「純関数」とされた `palette-commands.ts` が zustand のストアを import している (L-006) (scope: feature)

- **観察**: plan (`plan.md:195`) と tasks FE-030 は `palette-commands.ts` を「操作の表と候補の組み立て。純関数」としています。実際には `useSessionsStore` / `useUiStore` を import し (`palette-commands.ts:20-27`)、本物のストアにつないだ `createPaletteEffects` (`:291-305`) を同じ module に持っています。
- **同種事象探索**: `features/shell/palette-commands.ts` の `@/stores/` の import → 2 件。
- **リスク/影響**: 純関数の単体テスト (`palette-commands.test.ts`) がストアの module を巻き込み、module の境界 (表と組み立て / 配線) が plan の記述と合いません。
- **推奨アクション**: `createPaletteEffects` を `CommandPalette.tsx` か `palette-effects.ts` に移し、`palette-commands.ts` を表・組み立て・`runPaletteAction` (注入された `PaletteEffects` を呼ぶだけ) に限ってください。
- **根拠**: CONV-3
- **scope 根拠**: touched files の中

### [Low] E2E の共有の手順がコピーされ、`e2e/support/` に寄っていない (L-007) (scope: feature)

- **観察**:
  - `launchAnother` は `e2e/multi-session.spec.ts:28-36` と `e2e/sidebar-screenshot.spec.ts:27-35` で中身が同じです。
  - 同梱フォントを FontFace + CSSOM で当てる処理 (AD-038 の CSP を壊さない注入) は、`composer-screenshot.spec.ts:42` と `sidebar-screenshot.spec.ts:70` の 2 か所にあります。
  - 共有の置き場 `e2e/support/launch.ts` はすでにあります (`openLaunchDialog` / `reachActiveComposer` / `runningRows`)。
- **同種事象探索**: `async function launchAnother|new FontFace\(` (e2e) → 4 件 / 3 ファイル。
- **リスク/影響**: フォントの注入は、過去に実走で直した経緯がある手順です (`docs/discovery.md:236-237`)。コピーのどちらかだけを直すと、基準画像の比較が片方だけ壊れます。`e2e/` は eslint の対象外なので (`eslint.config.mjs:169-181`)、重複を拾う仕組みもありません。
- **推奨アクション**: `launchAnother(page)` と `applyBundledJapaneseFont(page, rootSelector)` を `e2e/support/launch.ts` (またはフォント用の `e2e/support/fonts.ts`) に移し、3 つの spec から import してください。
- **根拠**: CONV-3、AD-038
- **scope 根拠**: touched files (`e2e/sidebar-screenshot.spec.ts` / `e2e/multi-session.spec.ts`) の中。`composer-screenshot.spec.ts` は寄せてもよい既存のファイル

## H の確認 (自分の担当範囲のテスト / regression / observability)

- **M-001**: 各コピーには個別のテストがあります (`isComposing|keyCode: 229` の出現: `SessionListScreen.test.tsx` 4・`CommandPalette.test.tsx` 8・`ConversationSearch.test.tsx` 7、ほかに `e2e/ime.spec.ts` に 2 ケースを追加)。ただし、コピー同士がずれたことを検出するテストはありません。共有化した後は helper の単体テストが 1 本で規則を守ります。
- **M-002**: `SessionListScreen.test.tsx` に本 PR で約 338 行が足されており、切り出しはこのテストに守られて行えます。
- **リネーム漏れ**: 次の検索がどれも 0 件で、リネームは完了しています (FR-014 / FR-017)。
  - `Message input|Send a message` (src / e2e / perf)
  - 旧 id の `section-heading-|section-panel-` (src / e2e / perf)
- **循環依存**: dependency-cruiser の `no-circular` (severity error) が 387 modules / 1894 dependencies で exit 0 です。`features/search/session-search.ts` は `features/session-list/{group-label,rows}` を、`SessionListScreen.tsx` は `features/search/session-search` を import しますが、module 単位の循環にはなっていません。
- **生成物への手書きの変更**: `components/ui/dialog.tsx` に足した `aria-modal="true"` (再生成で消えうる手書きの変更) は、テストが守っています (`AppShell.test.tsx:1348,1363`・`CommandPalette.test.tsx:321`)。同じ前例の `button.tsx` と同じく strictness の一覧には入れていませんが、消えればテストが落ちます。
- **lint hookup**: `services-not-to-io` (`.dependency-cruiser.js:254`)・`WSL_FREE_DIRECTORIES` (`allowlists.mjs:502`)・新しい element の strictness の一覧 (`eslint.config.mjs:600-615`) に足されていることを確かめました。`launch-usage-store.ts` は `SECRET_LITERAL_SCAN_DIRS` にディレクトリ単位で入っています。
- **検出できていない範囲 (前からの gap、system scope)**:
  - 参照されない export を検出する規則はありません (L-001)。
  - `e2e/**` と `perf/**` は eslint の対象外で、型検査だけです。前からの gap で、`eslint.config.mjs:169-172` が roadmap に記録済みなので、新しい指摘にはしません。新しい `e2e/sidebar-screenshot.spec.ts` もこの範囲に入ります。
- **observability**: ログの接頭辞 `[launch-usage-store]` は、前例の `[preset-store]` (`preset-service.ts:66`) と同じ形です。
- **担当外の観察 (指摘にはしない)**: `sidebar-past-sessions` の基準画像はまだ置かれていません (`e2e/**/*.png` は composer の 1 枚だけ)。FR-018 の手順どおり CI の artifact から取る前提です。
- **lint-agent の observation について**: `thread.aui.tsx:353` の `eslint-disable-next-line react-hooks/incompatible-library` は、直前の `:350-351` に理由の注記があり、本 PR の差分にも含まれません。指摘にはしません。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `keyCode === 229` (src、テストを除く) | 5 (コード) | `ConversationSearchProvider.tsx:44,166` / `CommandPalette.tsx:34` / `SessionListScreen.tsx:806` / `command-palette.tsx:126` |
| M-001 | `aria-modal="true"\]') !== null` | 2 | `ConversationSearchProvider.tsx:60` / `CommandPalette.tsx:50` |
| M-002 | touched files の行数が 500 超 | 5 | `SessionListScreen.tsx` (1427) / `thread.aui.tsx` (1202) / `LaunchDialog.tsx` (755) / `running-session-store.ts` (650) / `e2e-capability.ts` (619) |
| M-003 | `\{ version, days\|schemaVersion` (specs/012 *.md) | spec 1 / data-model 3 | `spec.md:320` / `data-model.md:232,254,311` |
| L-001 | `\bConversationSearchState\b` | 1 (定義のみ) | `conversation-search.ts:39` |
| L-001 | `\bChatScreen\b[^.B]` (テストを除く) | 定義 1・注記 3・本番の import 0 | `ChatScreen.tsx:72` / `CenterPane.tsx:33` |
| L-002 | `function errnoCode` | 3 | `launch-usage-store.ts:77` / `launch-usage-service.ts:46` / `preset-store.ts:54` |
| L-003 | `storeNewerVersion\|readFailed\|newer-version\|'unloaded'` (src/main) | 26 | `launch-usage-service.ts:55,76` / `launch-usage-service.test.ts:157` / `launch-usage-store.ts:50` / `preset-service.ts:49` / `provider-service.ts:117` |
| L-004 | `\.launch\(` (src/renderer、テストを除く) / テストの `store.launch(` 系 | 本番 2 (うちストアを呼ぶのは 1) / テスト 36 | `RunningSessionsProvider.tsx:71` / `running-session-store.ts:366` |
| L-005 | `export function CommandPalette` / `folderNameOf` | 2 / 3 | `command-palette.tsx:67` / `features/shell/CommandPalette.tsx:66` / `SessionListScreen.tsx:1015` / `CommandPalette.tsx:220` / `session-search.ts:27` |
| L-006 | `@/stores/` の import (`palette-commands.ts`) | 2 | `palette-commands.ts:20,21` |
| L-007 | `async function launchAnother\|new FontFace\(` (e2e) | 4 | `multi-session.spec.ts:28` / `sidebar-screenshot.spec.ts:27,70` / `composer-screenshot.spec.ts:42` |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 7

<details>
<summary>lint-agent の stdout JSON (invoker から受け取ったもの。本 reviewer は lint を実行していない)</summary>

```json
{
  "detectors": ["eslint", "tsc:node", "tsc:web", "dependency-cruiser", "constitution-check", "tsc:e2e", "tsc:perf"],
  "commands": [
    {"detector": "eslint", "command": "node node_modules/eslint/bin/eslint.js --cache --no-warn-ignored --format json -o <scratchpad>/eslint.json <78 lintable files from scope list>", "exit_code": 0, "scope": "touched-files", "note": "72 files linted. e2e/* (5) and perf/real-sessions.spec.ts are ignored by eslint.config.mjs. 14 .md and 1 .css are not lint targets"},
    {"detector": "tsc:node", "command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false --pretty false", "exit_code": 0, "scope": "project"},
    {"detector": "tsc:web", "command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false --pretty false", "exit_code": 0, "scope": "project"},
    {"detector": "dependency-cruiser", "command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src", "exit_code": 0, "scope": "project", "summary": "no dependency violations found (387 modules, 1894 dependencies cruised)"},
    {"detector": "constitution-check", "command": "node scripts/constitution/check.mjs", "exit_code": 0, "scope": "project", "summary": "21 items: ok 20 / violations 0 / nothing to check 1 (#5). 368 files checked"},
    {"detector": "tsc:e2e", "command": "node node_modules/typescript/bin/tsc --noEmit -p e2e/tsconfig.json --pretty false", "exit_code": 0, "scope": "project"},
    {"detector": "tsc:perf", "command": "node node_modules/typescript/bin/tsc --noEmit -p perf/tsconfig.json --pretty false", "exit_code": 0, "scope": "project"}
  ],
  "exit_code": 0,
  "scope": "touched-files",
  "touched_count": 93,
  "violations": [],
  "violation_count_by_severity": {"error": 0, "warning": 0, "info": 0},
  "observations": [
    {"detector": "constitution-check", "item": "#5", "status": "pending", "message": "No module in the allowlist can name docker, so there is nothing to check (as designed for R-1). Not a violation"},
    {"detector": "eslint", "path": "src/renderer/src/components/assistant-ui/elements/thread.aui.tsx", "line": 353, "col": 23, "rule": "react-hooks/incompatible-library", "original_severity": "warning", "message": "Silenced in the source with eslint-disable-next-line (justification empty). Not a violation"}
  ]
}
```

CONV-1 の翻訳結果: `violations[]` は 0 件で、7 コマンドすべてが `exit_code: 0` でした。lint 由来の finding と、exit code 由来の Critical はありません。

</details>
