# convention-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: convention-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 3 (code-gate iteration 3。HEAD 397d5f1。前回の出力 `specs/012-ui-thread-search/convention-reviewer.code-gate.md` は HEAD 737e118 を見たものです。ファイルの見出しは iteration 3 ですが、invoker は iter 2 と呼んでいます)

## 初回読了 viewpoint

- FR/SC:
  - 今回の増分 (737e118 の差し戻しと 397d5f1) は、012 の FR を実装していません。変えたのは vitest の 2 つの project の `testTimeout` だけです (`vitest.config.ts:21-22,46,75`)。効くのは SC-001〜SC-006 / SC-008 の計測経路のうち、vitest の単体テストと component テストの時間の上限だけです。assertion は変わっていません
  - spec 003 の SC-003 (`virtualization.test.tsx`。同時にマウントされる DOM の数) は、base 7bdb271 と同じ内容に戻りました。このファイルは diff にありません
  - FR-001〜FR-018 / SC-001〜SC-008 の実装は iter 2 から変わっていません。iter 2 の指摘はすべて持ち越しです
  - SC-005 (`schemaVersion` の名前) / SC-006 (IPC の命名) / SC-007 (constitution-check が exit 0) は、今回の lint-agent の JSON でも成り立っています
- touched files に当たる charter / Confirmation:
  - ui charter の In scope (U-5、`docs/domains/ui/charter.md:53-59`): M-002 の根拠です
  - ui charter の KPI「スクロールの安定」(`:164-167`、R-3 の Vitest による暫定代替): このテストは base と同じになりました。変わったのは時間の上限だけで、全体共通の 20s になりました
  - AD-038 D2 / D4 (`docs/decisions/0038-e2e-screenshot-harness.md:42,70`): L-007 の根拠です
  - 増分に当たる ADR はありません (`docs/decisions` で `testTimeout` を検索して 0 件)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:8
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage の各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 — 増分と F の各指摘について、テストによる保護、lint hookup、抑止の増減、観測点を確かめました (下の「H の確認」)

## スコープ要約

対象は `7bdb271..397d5f1` の差分で、scope は 97 ファイルです。前回 (737e118) からの変化は次の 2 点です。

- `src/renderer/src/features/chat/virtualization.test.tsx` を差し戻しました。per-test の `20_000` とコメントを外し、base と同じ内容に戻したので、diff と scope から外れました
- `vitest.config.ts` を足しました:
  - 定数 `TEST_TIMEOUT_MS = 20_000` と、その理由のコメントを 1 行置いています (`:21-22`)
  - node と renderer の両 project に `testTimeout: TEST_TIMEOUT_MS` を置いています (`:46` / `:75`)

lint-agent の JSON は 7 コマンドで、どれも `exit_code: 0`、`violations: []` でした。したがって、CONV-1 由来の指摘も、exit code 由来の Critical もありません。

- `vitest.config.ts` は ESLint の対象です。`eslint.config.mjs:174-183` の ignores に無く、`:196` の `**/*.{ts,tsx}` に当たります
- 型検査では、`tsconfig.node.json:5` の `vitest.config.*` に当たります
- 増分は import を変えていません。dependency-cruiser も exit 0 だったので、madge は実行していません

新しい指摘はありません。L-008 は、問題の箇所が `virtualization.test.tsx:104` から `vitest.config.ts:21` に移りました。前回挙げた点のうち `SC-003` の読み違いは、差し戻しで解消しています。iter 2 の M-001〜M-003 / L-001〜L-007 は直っていません。該当のファイルは今回変わっていないので、Grep で同じ行にあることを確かめ直しました。

## Findings

### [Medium] IME の変換中の判定とモーダルの判定が 4 ファイルに 7 か所コピーされている (M-001) (scope: feature)

- **観察**: iter 2 から変わっていません (Grep で確かめ直しました)。
  - 変換中かの判定 `isComposing || keyCode === 229` は 5 か所にあります
    - `src/renderer/src/features/chat/ConversationSearchProvider.tsx:44,166`
    - `src/renderer/src/features/shell/CommandPalette.tsx:34`
    - `src/renderer/src/features/session-list/SessionListScreen.tsx:806`
    - `src/renderer/src/components/assistant-ui/elements/command-palette.tsx:126`
  - モーダルの判定 `document.querySelector('[aria-modal="true"]') !== null` は 2 か所にあります: `ConversationSearchProvider.tsx:60` / `CommandPalette.tsx:50`
- **同種事象探索**: `keyCode === 229|aria-modal="true"\]'\) !== null` (src、テストを除く) で、コードは 7 件でした (`command-palette.tsx:27` はコメントなので除いています)。共有の helper は 0 件です。
- **リスク/影響**:
  - Principle VIII の規則と、FR-006 のモーダルの判定が、それぞれ 1 か所にまとまっていません
  - 1 か所でも直し漏れがあると、palette・会話内検索・Thread search の挙動が分かれます
- **推奨アクション**:
  - `src/renderer/src/lib/keyboard-guards.ts` に `isComposingKey` と `isModalDialogOpen` を置き、7 か所すべてをそこから import してください
  - `lib/` に置くので、厳格さのルールを戻す一覧にこのファイルを足してください (`eslint.config.mjs:550` の `lib/safe-url.ts` と同じ扱い)
- **根拠**: CONV-3、Principle VIII、spec FR-003 / FR-006
- **scope 根拠**: 7 か所すべてが touched files の中です

### [Medium] `SessionListScreen.tsx` が 1427 行あり、ui が持つ Thread search の部品が session の module に入っている (M-002) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `SessionListScreen.tsx` は 1427 行です。`narrowToTerms` / `isComposingKey` / `PastSearchField` を同じファイルに持っています
  - ui charter (`docs/domains/ui/charter.md:55-56`) は、一致の規則と検索欄・絞り込みを ui に割り当てています
  - `src/main/app/e2e-capability.ts` は 619 行で、本 PR で 500 行を超えました
- **同種事象探索**: touched files のうち 500 行を超えるものは 5 件です。
  - `SessionListScreen.tsx` 1427 行
  - `thread.aui.tsx` 1202 行
  - `LaunchDialog.tsx` 755 行
  - `running-session-store.ts` 650 行
  - `e2e-capability.ts` 619 行
  - 増分の `vitest.config.ts` は 82 行です
- **リスク/影響**:
  - 検索の機能を広げるたびに、このファイルが伸びます
  - charter が ui に割り当てた部品が誰の持ち物かを、module の構成から読み取れません
- **推奨アクション**:
  - `PastSearchField` と `narrowToTerms` を `features/search/` に移してください
  - `isComposingKey` は M-001 の共有の helper に置き換えてください
  - `e2e-capability.ts` の固定の索引は `src/main/app/e2e-session-index.ts` に分けられます
- **根拠**: CONV-3 (1 ファイルが 500 行を超えたら warning)、ui charter の In scope (U-5)、plan の Structure Decision (`plan.md:303`)
- **scope 根拠**: touched files の中で移せます

### [Medium] spec の Key Entities の名前 (`version` / 「本文の位置」) が、実装と data-model (`schemaVersion` / `occurrence`) と食い違っている (M-003) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `specs/012-ui-thread-search/spec.md:320` は `{ version, days: … }` のままです。実装、data-model §4 (`data-model.md:232`)、glossary は `schemaVersion` です
  - `spec.md:317` は「本文の位置」のままです。実装と data-model §2 (`data-model.md:89`) は `occurrence` です
- **同種事象探索**: `\{ version, days|本文の位置` (`spec.md`) で 2 件です (`:317` / `:320`)。
- **リスク/影響**:
  - SC-005 の固定のキー集合のテストは、このキー名に依存しています
  - spec を正として読む人が読み違えます (CONV-6 のリネーム漏れ)
- **推奨アクション**: Key Entities の 2 行を、data-model §2 / §4 を正本として指す参照の形に直してください。コードは変えません。
- **根拠**: CONV-6、Principle XIV、design-gate M-14 / analyze I2 からの持ち越し
- **scope 根拠**: 本 spec のディレクトリの中の文面だけで直せます

### [Low] 本番で参照されない export と、古い名前を指す注記 (L-001) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `ConversationSearchState` (`src/renderer/src/features/chat/conversation-search.ts:39`) は、src 全体で参照が 0 件です
  - `src/renderer/src/features/shell/CenterPane.tsx:33` の注記は `ChatScreen` を指しています。実際に使われているのは `ChatScreenBody` です (`:5`)
- **同種事象探索**: `\bConversationSearchState\b` (src、テストを除く) で 1 件 (定義だけ) です。
- **リスク/影響**:
  - 状態の型が 2 つあり、data-model §2 (`data-model.md:91`) に書かれた名前の型のほうが使われていません
  - 参照されない export を見つける検出器もありません
- **推奨アクション**:
  - `ConversationSearchState` を消すか、`ConversationSearchController` に寄せてください
  - 注記は `ChatScreenBody` に直してください
- **根拠**: CONV-5 / CONV-6
- **scope 根拠**: touched files の中です

### [Low] `errnoCode` が同じ名前で 3 か所にあり、返り値の契約が違う (L-002) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `src/main/infra/settings/launch-usage-store.ts:77` は `string | undefined` を返します
  - `src/main/app/launch-usage-service.ts:46` は `string` を返します
  - 既存の `src/main/infra/settings/preset-store.ts:54` は `string | undefined` を返します
- **同種事象探索**: `function errnoCode` で 3 件です。うち 2 件は本 PR で新しく足したものです。
- **リスク/影響**:
  - 同じ名前で意味が違うので、取り違えやすくなります
  - ログを浄化する正規表現 (Principle V) も 3 か所に分かれています
- **推奨アクション**: `src/main/infra/settings/` に `errnoCodeOf(error): string | undefined` を 1 つ置いてください。service はその結果を `?? 'unknown'` で受けます。
- **根拠**: CONV-3、Principle V
- **scope 根拠**: 新しく足した 2 件は touched files の中です

### [Low] data-model §4 の service の状態の名前がコードに出てこない (L-003) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - data-model は `storeNewerVersion` / `readFailed` と名指しています (`specs/012-ui-thread-search/data-model.md:254-256,276`)
  - 実装は `state: 'unloaded' | 'loaded' | 'newer-version'` です (`launch-usage-service.ts:55`)
- **同種事象探索**: `storeNewerVersion|readFailed` は data-model に 4 件あり、`launch-usage-service.ts` には 0 件です。
- **リスク/影響**: data-model の名前でコードを探しても見つかりません。
- **推奨アクション**: data-model と実装のどちらかに寄せて、名前をそろえてください。
- **根拠**: CONV-6
- **scope 根拠**: touched files と、本 spec の data-model の中です

### [Low] ストアの `launch` の `origin` が任意で、省くと黙って `'manual'` になる (L-004) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `src/renderer/src/features/session/running-session-store.ts:366` は `async launch(config, folderLabel = null, origin = 'manual')` です
  - data-model §4 (`data-model.md:295-296`) と tasks FE-040 は、起動元を必須としています
- **同種事象探索**: `origin = 'manual'` (src、テストを除く) で 1 件です。本番の呼び出しは `RunningSessionsProvider.tsx:71` の 1 件だけで、そこは起動元を渡しています。
- **リスク/影響**: 後から足した呼び出しが起動元を省いても、型エラーになりません。その分、KPI の「再利用率」が `manual` 側に傾きます。
- **推奨アクション**: `origin: LaunchOrigin` を必須の引数にしてください。
- **根拠**: CONV-6
- **scope 根拠**: touched files の中です

### [Low] 名前が衝突していて、別名を付けないと取り違える (L-005) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `export function CommandPalette` が 2 つあります: `components/assistant-ui/elements/command-palette.tsx:67` / `features/shell/CommandPalette.tsx:66`
  - `ConversationSearch` という名前で、3 つの別物が近いパスにあります: element の `conversation-search.tsx:30`、test の `features/chat/ConversationSearch.test.tsx`、純関数の `features/chat/conversation-search.ts`
  - `folderNameOf` が 2 つの署名で使われています: `SessionListScreen.tsx:1015` は `(section) => …`、`CommandPalette.tsx:220` / `palette-commands.ts:94` は `(folderId) => …`
- **同種事象探索**: `export function CommandPalette` で 2 件です。
- **リスク/影響**: test と source の対応を、名前から誤って読みます。
- **推奨アクション**: 次のように改名してください。
  - feature 側を `CommandPaletteDialog` に
  - test を `ConversationSearchProvider.test.tsx` に
  - local の関数を `sectionFolderName` に
- **根拠**: CONV-2 / CONV-6
- **scope 根拠**: touched files の中です

### [Low] 「純関数」とされた `palette-commands.ts` が zustand のストアを import している (L-006) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - plan (`specs/012-ui-thread-search/plan.md:195`) は「純関数」と書いています
  - 実際の `src/renderer/src/features/shell/palette-commands.ts` は、`:20` (`@/stores/sessions`) と `:21-27` (`@/stores/ui`) でストアを import しています
- **同種事象探索**: `palette-commands.ts` の中の `@/stores/` の import で 2 件です。
- **リスク/影響**: 純関数の単体テストが、ストアの module まで巻き込みます。
- **推奨アクション**: `createPaletteEffects` を `palette-effects.ts` か `CommandPalette.tsx` に移してください。
- **根拠**: CONV-3
- **scope 根拠**: touched files の中です

### [Low] E2E の共有の手順がコピーされたままで、`e2e/support/` に寄っていない (L-007) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `launchAnother` が 2 か所にあります: `e2e/multi-session.spec.ts:28` / `e2e/sidebar-screenshot.spec.ts:28`
  - FontFace の注入が 2 か所にあります: `e2e/composer-screenshot.spec.ts:42` / `e2e/sidebar-screenshot.spec.ts:71`
- **同種事象探索**: `async function launchAnother|new FontFace\(` (e2e) で、3 ファイルに 4 件です。
- **リスク/影響**:
  - 基準画像の比較 2 本が、どちらもフォントの注入を前提にしています。コピーの片方だけを直すと、片方の比較が壊れます
  - `e2e/` は ESLint の対象外 (`eslint.config.mjs:179`) なので、重複を拾う仕組みもありません
- **推奨アクション**:
  - `launchAnother(page)` を `e2e/support/launch.ts` に移してください
  - フォントの注入は `applyBundledJapaneseFont(page, rootSelector)` として `e2e/support/` に移してください
- **根拠**: CONV-3、AD-038 D4
- **scope 根拠**: touched files の中です

### [Low] `vitest.config.ts:21` が根拠に挙げる `012 code-gate MF-001` は、追跡される記録から消える。ルートに置かない理由もファイルに残らない (L-008) (scope: feature)

- **観察**:
  - 前回 `virtualization.test.tsx:104` にあった根拠 `012 code-gate MF-001` は、差し戻しで消えました。同じ参照が `vitest.config.ts:21` のコメントに移っています
  - MF の ID は iteration ごとに振り直す番号です。`.claude/skills/cl-code-gate/SKILL.md:219` の雛形は、毎回 `MF-001` から始まります
  - 各 iteration の記録は `code-gate.md.iter<N>` に、最終版は `code-gate.md` に保存されます (`SKILL.md:361`)
  - `.gitignore:87-88` は `specs/**/*.iter[0-9]*` と `specs/**/*-gate.md.[0-9]*` を追跡から外しています
  - いま MF-001 を持っている追跡対象は 2 つだけで、どちらも iter 3 で上書きされます: `specs/012-ui-thread-search/code-gate.md:15,26` と `.gate-verdict-code.json:22`
  - 上書きの後も残る `iter_history[]` (`.gate-verdict-code.json:622-635`) は件数しか持たず、`mf_id` を持ちません
  - iter 3 で新しい MUST_FIX が出れば、それも `MF-001` と振られます。同じ ID が別の事象を指すことになります
  - ルートの `test` に置かず、定数を両 project に置いた理由は、implementer の action log (`specs/012-ui-thread-search/code-gate.md.iter3.implementer.json:17`) にしか書かれていません。この log も `.gitignore:87` で追跡の外です
    - 理由の中身: インラインの project は、`extends: true` が無いとルートの設定を継ぎません (`node_modules/vitest/dist/chunks/plugin.d.BbcoZhuj.d.ts:4494` で確認)
  - 前回の L-008 のうち、`virtualization.test.tsx` の `SC-003` が 012 の SC-003 (palette) と読み違えられる点は解消しました。差し戻しで、このファイルから `012` の参照が消えたためです
- **同種事象探索**: `MF-\d+` を、src / tests / e2e / perf の ts・tsx とルートの `*.{ts,mjs,js}` で探して 6 件です。
  - 今回の 1 件: `vitest.config.ts:21`
  - 既存の 5 件: `src/main/infra/settings/preset-store.test.ts:74` / `src/main/app/preset-service.test.ts:110` / `src/main/app/folder-service.test.ts:34` / `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:159,213`
  - iteration まで書いた先例もあります: `src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx:247` (`code-gate iteration 1 / a11y H-006`)
- **リスク/影響**:
  - `vitest.config.ts` はプロジェクト全体の設定で、012 の後も残ります。clone した先で `MF-001` を引いても、理由の記録にたどり着けません
  - ルートに置かない理由が書かれていないので、後で `testTimeout` をルートの `test` に「整理」すると、黙って 5s に戻ります。そうなると、負荷の下の timeout がまた出ます。ただし `pool: 'threads'` も同じ形で両 project に並んでいる (`:45` / `:74`) ので、形は既存と同じです
  - コメントの本文 (判定は時間に依らない / 全件実行の負荷の下でだけ 5s を超える / 単独では pass する) だけで、上限を上げた理由は読めます。実害は参照先が切れることに限られるので、Low とします
- **推奨アクション** (最小案から順に):
  1. コードは変えません。iter 3 の `code-gate.md` の Iteration history に、次の 1 行を残してください: 「iter 2 MF-001 = 全件実行で 5000ms の timeout を超えた。人間の判断で (c) を選び、397d5f1 で両 project の testTimeout を 20s にした」
  2. コメントも直すなら、`012 code-gate iter 2 MF-001` と iteration まで書いてください (`WorkspaceFoldersScreen.tsx:247` の先例どおり)
  3. 任意: 同じコメントに「インラインの project はルートの `test` を継がない (`extends: true` が無いため) ので、project ごとに置く」と 1 句足してください
- **根拠**: CONV-6 (識別子と参照の整合)、`.gitignore:79` の「round / iter を跨いで必要な情報は、追跡される最終版の中に持たせる」
- **scope 根拠**: `vitest.config.ts` は touched files です。案 1 は、本 spec の `code-gate.md` の中で直せます

## H の確認 (自分の担当範囲のテスト / regression / observability)

- **増分が判定を緩めていないか**:
  - `virtualization.test.tsx` は base 7bdb271 と同じ内容です (diff にありません)
  - 3 つの assertion はそのまま残っています: `toBeGreaterThan(0)` / `toBe(smallRows)` / `toBeLessThan(100)` (`:119,120,122`)
  - 変わったのは時間の上限だけで、それも per-test の指定から project 共通の値に移っています
- **timeout の書き方の慣習**:
  - 名前 `TEST_TIMEOUT_MS` は、既存の `*_TIMEOUT_MS` と同じ形です (`src/main/infra/runtime/wsl-cli.ts:75,78` / `src/agents/sdk-agent-session.ts:87` / `src/main/index.ts:24`)
  - 値 `20_000` の書き方も、既存と同じです (`wsl-cli.ts:78` の `PROBE_TIMEOUT_MS = 20_000`)
  - per-test の上限として残るのは `tests/ui-coverage/item21.test.ts:120,132` (`120_000` / `60_000`) だけです。per-test の指定が project の値より優先され、どちらも 20s を上回るので、今回の変更でこの 2 本の上限は変わりません
- **上限を上げたことで見えなくなるもの**:
  - 前回は 1 テストだけでしたが、今回は 132 ファイルすべてで、20s 未満の後退が timeout として出なくなりました
  - 追跡される記録の A/B 計測は、virtualization のテストの分しかありません (`specs/012-ui-thread-search/code-gate.md:30`)
  - コメントの「012 の前後で差は無い」は、LivePane と SessionListScreen については、追跡される記録に計測がありません。`LivePane.tsx` と `SessionListScreen.tsx` は本 diff の scope の中です。agents の 2 ファイル (`live-tool-results` / `sdk-agent-session`) は diff の外です
  - これはテストの戦略の判断で、F の担当外です。下の「担当外の観察」に回します
- **lint hookup**:
  - ESLint は project 全体 (`.`) に掛かり、exit 0 でした。scope 97 ファイルのうち 73 ファイルを lint しています。その中に `vitest.config.ts` も入っています (数え直して確かめました)
  - 型検査は `tsconfig.node.json:5` の `vitest.config.*` を通して、`tsc -p tsconfig.node.json` の対象です (exit 0)
  - `e2e/**` と `perf/**` が ESLint の対象外なのは、前からある gap です。`typecheck:e2e` / `typecheck:perf` は exit 0 です
- **lint の抑止が増えていないか**:
  - 抑止された message は 3 件で、どれも既存のものです。`eslint-disable` のコメントがある行は `thread.aui.tsx:352` / `file.tsx:166` / `use-attachment-src.ts:17` です。lint-agent の行番号 (353 / 167 / 18) は、抑止された message の行です
  - diff の追加行と削除行のうち、ソースに `eslint-disable` は 0 件です。`^[+-].*eslint-disable` に当たったのは、前回の本 reviewer の md の 3 行だけでした
- **リネーム漏れ・循環依存**: 増分は識別子も import も変えていません。`vitest.config.ts` の import は 2 行とも、std → 3rd party の順のままです。dependency-cruiser は exit 0 です。
- **観測点**: timeout で落ちたときは、vitest が `Test timed out in 20000ms` とテスト名を出します。値は `TEST_TIMEOUT_MS` の 1 か所にあり、理由はその直上のコメントにあります。
- **CI での実行は未確認**:
  - `verify.yml` の test のステップは同じ `vitest.config.ts` を使うので、CI にも 20s が掛かります
  - implementer の全件実行 (2266/2266、exit 0、`code-gate.md.iter3.implementer.json:25`) は自己申告です。この iteration の test track の結果が一次情報です
  - Bash は CONV-4 の用途に限られるので、`gh` は使っていません

## 担当外の観察 (指摘にはしない。振り分けのための記録)

- **範囲の判断** (architecture / po の担当):
  - `code-gate.md:36` は選択肢 (c) を「012 の範囲の外」としていましたが、397d5f1 で 012 の中に入れています
  - `plan.md:269-301` の Project Structure に、`vitest.config.ts` は載っていません
- **記録への追記** (test track / 記録の持ち主の担当): `docs/discovery.md:147` のユニットテストの行は `pool: 'threads'` を書いていますが、20s の共通の timeout は書いていません。どちらも本機の事情による設定です。
- **`hookTimeout` は既定の 10s のまま** (test track の担当):
  - コメントの「上限を 20s にする」は、テスト本体の上限のことです。`beforeEach` / `afterEach` は対象外です
  - hook の timeout は、今のところ報告がありません
- **コメントの「012 の前後で差は無い」の根拠** (test track の担当): 追跡される記録の A/B 計測は virtualization の分だけです。LivePane と SessionListScreen には計測がありません (上の H)。
- **`touched-files.txt`**:
  - `:99` に `virtualization.test.tsx` が残っています。diff にはありませんが、scope は `comm` で落ちるので影響はありません
  - `:94-100` は追記された行で、重複が 2 件あります: `e2e/sidebar-screenshot.spec.ts` (`:16` / `:96`) と `session-list/labels.ts` (`:76` / `:97`)
  - `.claude/agents/implementer.md:39` は、整列と重複の排除を `/cl-implement` に任せています。したがって規則違反ではなく、scope にも影響しません
- **lint-agent の内訳の数字**:
  - `eslint_not_linted_reason` の「md / yml / css (19 件)」は、scope の実数では 18 件です (md 16 / yml 1 / css 1)
  - 18 + e2e 5 + perf 1 = 24 で、`eslint_not_linted_in_scope: 24` と合います
  - 判定には影響しません
- **前回の担当外の観察**:
  - 「`LivePane.test.tsx:119` / `SessionListScreen.test.tsx:735` は既定の 5000ms のまま」は、今回の共通の 20s で当たらなくなりました
  - quickstart-results V-4 の記述の食い違いと、「`e2e/*.spec.ts` がすべて流れることを確かめる検査が無い」は、該当のファイルが変わっていないので、そのまま残っています

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `keyCode === 229\|aria-modal="true"\]'\) !== null` (src、テストを除く) | 7 (コード) | `ConversationSearchProvider.tsx:44,60,166` / `CommandPalette.tsx:34,50` / `SessionListScreen.tsx:806` / `command-palette.tsx:126` |
| M-002 | touched files のうち 500 行超 | 5 | `SessionListScreen.tsx` (1427) / `thread.aui.tsx` (1202) / `LaunchDialog.tsx` (755) / `running-session-store.ts` (650) / `e2e-capability.ts` (619) |
| M-003 | `\{ version, days\|本文の位置` (`spec.md`) | 2 | `spec.md:317` / `spec.md:320` |
| L-001 | `\bConversationSearchState\b` (src、テストを除く) | 1 (定義のみ) | `conversation-search.ts:39` |
| L-002 | `function errnoCode` | 3 | `launch-usage-store.ts:77` / `launch-usage-service.ts:46` / `preset-store.ts:54` |
| L-003 | `storeNewerVersion\|readFailed` (data-model) | 4 | `data-model.md:254,255,256,276` |
| L-004 | `origin = 'manual'` (src、テストを除く) | 1 | `running-session-store.ts:366` |
| L-005 | `export function CommandPalette` | 2 | `command-palette.tsx:67` / `features/shell/CommandPalette.tsx:66` |
| L-006 | `@/stores/` の import (`palette-commands.ts`) | 2 | `palette-commands.ts:20,21-27` |
| L-007 | `async function launchAnother\|new FontFace\(` (e2e) | 4 | `multi-session.spec.ts:28` / `sidebar-screenshot.spec.ts:28,71` / `composer-screenshot.spec.ts:42` |
| L-008 | `MF-\d+` (src / tests / e2e / perf と root の設定) | 6 | `vitest.config.ts:21` / `preset-store.test.ts:74` / `preset-service.test.ts:110` / `folder-service.test.ts:34` / `ResolutionScreen.tsx:159,213` |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 8
- Round inheritance (前回の 737e118 → 今回の 397d5f1):
  - resolved: 0
  - unresolved: 11 (M-001〜M-003 / L-001〜L-008。severity は同じで、新しい事実はありません。L-008 は箇所が `virtualization.test.tsx:104` から `vitest.config.ts:21` に移り、`SC-003` の読み違いの部分は解消しました)
  - new: 0

<details>
<summary>lint-agent の stdout JSON (invoker から受け取ったもの。本 reviewer は lint を実行していない)</summary>

CONV-1 の翻訳結果:

- `violations[]` は 0 件で、7 コマンドすべてが `exit_code: 0` でした。lint 由来の finding と、exit code 由来の Critical はありません
- 抑止された 3 件は、どれも既存の `eslint-disable` です。diff はこれを 1 件も足していません
- 「ESLint の対象外が 24 件」は、scope で数え直しても 24 件 (md 16 / yml 1 / css 1 / e2e 5 / perf 1) です。reason の「19 件」は書き誤りで、判定には影響しません

(JSON 本体は `.gate-verdict-code.json` の `tracks.lint-agent` に要約を記録している)

</details>

lint は実行していません。Bash も 1 回も使っていません。CONV-4 の madge は、import の変更が無いので不要でした。
