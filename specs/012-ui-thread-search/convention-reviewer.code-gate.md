# convention-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: convention-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: code-gate iteration 3 (iter 2 の MF-001 について、人間が選択肢 (a) を選んだ後の再実行)

## 初回読了 viewpoint

- FR/SC:
  - 今回の増分 (`737e118`) は 012 の FR/SC を実装していません。触ったのは spec 003 の SC-003 (`specs/003-ui-transcript-rendering/spec.md:238`、同時にマウントする DOM の数) のテストで、変えたのは timeout だけです。012 の SC-003 (`spec.md:335`) は palette で、別物です
  - FR-001〜FR-018 / SC-005〜SC-008: iter 2 から変わっていません (iter 2 の指摘はすべて持ち越し)
  - SC-005 (`schemaVersion` の名前) / SC-006 (IPC の命名) / SC-007 (constitution-check が exit 0): 今回の lint-agent の JSON でも成り立っています
- touched files に当たる charter / Confirmation:
  - ui charter In scope (U-5): M-002 の根拠。iter 2 から変わっていません
  - AD-038 D2 / D4: e2e が ESLint の対象外であること (L-007)。iter 2 から変わっていません
  - 今回の増分 (テストの timeout) は、どの charter / Confirmation にも当たりません
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:8
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage の各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 — 今回の増分と F の各指摘について、テストによる保護、書き方の慣習との一致、lint の抑止が増えていないことを確かめました (下の「H の確認」)

## スコープ要約

対象は `7bdb271..737e118` の差分で、scope は 97 ファイルです。iter 2 (96 ファイル) からの増分は `src/renderer/src/features/chat/virtualization.test.tsx` の 1 ファイルです。

- コミット `737e118` は 2 点だけを変えています。テストのすぐ上に理由のコメントを 1 行足しました (`:104`)。`it(...)` の第 3 引数に `20_000` を足しました (`:124`)
- assertion (マウント数の比較・`< 100`) は変えていません

lint-agent の JSON は 7 コマンドで、どれも `exit_code: 0`、`violations: []` でした。したがって、CONV-1 由来の指摘も、exit code 由来の Critical もありません。

- 循環依存は dependency-cruiser (387 modules / 1894 dependencies) が exit 0 で確かめています
- 今回の増分は import を変えていないので、madge は実行していません
- 1 テストごとの timeout の書き方 `}, 20_000)` は既存の書き方と同じです (`tests/ui-coverage/item21.test.ts:120,132` の `}, 120_000)` / `}, 60_000)`)

増分から来る新しい指摘は 1 件です (L-008、Low: 指摘の ID の参照先が残らない)。iter 2 の 10 件は、どれも直されていません。該当のファイルは iter 3 で変わっていないので、Grep で同じ行番号にあることを確かめました。

## Findings

### [Medium] IME の変換中の判定とモーダルの判定が 4 ファイルに 7 か所コピーされている (M-001) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - 変換中かの判定 `isComposing || keyCode === 229` は 5 か所にあります
    - `src/renderer/src/features/chat/ConversationSearchProvider.tsx:44,166`
    - `src/renderer/src/features/shell/CommandPalette.tsx:34`
    - `src/renderer/src/features/session-list/SessionListScreen.tsx:806`
    - `src/renderer/src/components/assistant-ui/elements/command-palette.tsx:126`
  - モーダルの判定 `document.querySelector('[aria-modal="true"]') !== null` は 2 か所にあります: `ConversationSearchProvider.tsx:60` / `CommandPalette.tsx:50`
- **同種事象探索**: `keyCode === 229|aria-modal="true"\]'\) !== null` (src、テストを除く) → コード 7 件 (`command-palette.tsx:27` はコメントなので除外)。共有の helper は 0 件です。
- **リスク/影響**: Principle VIII の規則と FR-006 のモーダルの判定が、1 つの規則として存在しません。1 か所でも直し漏れがあると、palette・会話内検索・Thread search の挙動が分かれます。
- **推奨アクション**:
  - `src/renderer/src/lib/keyboard-guards.ts` に `isComposingKey` と `isModalDialogOpen` を置き、7 か所すべてをそこから import してください
  - `lib/` は strictness を戻す一覧に足します (`eslint.config.mjs` の `lib/safe-url.ts` と同じ扱い)
- **根拠**: CONV-3、Principle VIII、spec FR-003 / FR-006
- **scope 根拠**: 7 か所すべてが touched files の中です

### [Medium] `SessionListScreen.tsx` が 1427 行あり、ui が持つ Thread search の部品が session の module に入っている (M-002) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `SessionListScreen.tsx` は 1427 行です。`narrowToTerms` / `openByDefault` / `isComposingKey` / `PastSearchField` を同じファイルに持っています
  - ui charter (`docs/domains/ui/charter.md:55-56`) は、一致の規則と検索欄・絞り込みを ui に割り当てています
  - `src/main/app/e2e-capability.ts` は 619 行で、本 PR で 500 行を超えました
- **同種事象探索**: touched files のうち 500 行を超えるもの → 5 件 (`SessionListScreen.tsx` 1427 / `thread.aui.tsx` 1202 / `LaunchDialog.tsx` 755 / `running-session-store.ts` 650 / `e2e-capability.ts` 619)。`virtualization.test.tsx` は 138 行で、増分による変化はありません。
- **リスク/影響**: 検索の機能を広げるたびにこのファイルが伸びます。また、charter が ui に割り当てた部品が誰の持ち物かを、module の構成から読み取れません。
- **推奨アクション**:
  - `PastSearchField` と `narrowToTerms` を `features/search/` に移してください
  - `isComposingKey` は M-001 の共有の helper に置き換えてください
  - `e2e-capability.ts` の固定の索引は `src/main/app/e2e-session-index.ts` に分けられます
- **根拠**: CONV-3 (1 ファイル 500 行超は warning)、ui charter In scope (U-5)、plan Structure Decision
- **scope 根拠**: touched files の中で移せます

### [Medium] spec の Key Entities の名前 (`version` / 「本文の位置」) が、実装と data-model (`schemaVersion` / `occurrence`) と食い違っている (M-003) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `specs/012-ui-thread-search/spec.md:320` は `{ version, days: … }` のままです。実装 (`LaunchUsageRecord.schemaVersion`)、data-model §4、glossary は `schemaVersion` です
  - `spec.md:317` は「本文の位置」のままです。実装と data-model §2 は `occurrence` です
- **同種事象探索**: `\{ version, days|本文の位置` (`spec.md`) → 2 件 (`:317` / `:320`)。
- **リスク/影響**: SC-005 の固定のキー集合のテストは、このキー名に依存しています。spec を正として読む人が読み違えます (CONV-6 のリネーム漏れ)。
- **推奨アクション**: Key Entities の 2 行を、data-model §2 / §4 を正本として指す参照の形に直してください。コードは変えません。
- **根拠**: CONV-6、Principle XIV、design-gate M-14 / analyze I2 (持ち越し)
- **scope 根拠**: 本 spec のディレクトリの中の文面だけで直せます

### [Low] 本番で参照されない export と、古い名前を指す注記 (L-001) (scope: feature)

- **観察**:
  - `ConversationSearchState` (`src/renderer/src/features/chat/conversation-search.ts:39`) は、src 全体で参照が 0 件です
  - `src/renderer/src/features/shell/CenterPane.tsx:33` の注記は、本番では使われない `ChatScreen` を指しています
- **同種事象探索**: `\bConversationSearchState\b` (src、テストを除く) → 1 件 (定義だけ)。
- **リスク/影響**: 状態の型が 2 つあり、data-model に書かれた名前の型のほうが使われていません。参照されない export を見つける検出器もありません。
- **推奨アクション**:
  - `ConversationSearchState` を消すか、`ConversationSearchController` に寄せてください
  - 注記は `ChatScreenBody` に直してください
- **根拠**: CONV-5 / CONV-6
- **scope 根拠**: touched files の中です

### [Low] `errnoCode` が同じ名前で 3 か所にあり、返り値の契約が違う (L-002) (scope: feature)

- **観察**:
  - `src/main/infra/settings/launch-usage-store.ts:77` は `string | undefined` を返します
  - `src/main/app/launch-usage-service.ts:46` は `string` を返します
  - 既存の `src/main/infra/settings/preset-store.ts:54` は `string | undefined` を返します
- **同種事象探索**: `function errnoCode` → 3 件 (うち本 PR で新しく足したものが 2 件)。
- **リスク/影響**: 同じ名前で意味が違うので取り違えやすくなります。ログを浄化する正規表現 (Principle V) も 3 か所に分かれています。
- **推奨アクション**: `src/main/infra/settings/` に `errnoCodeOf(error): string | undefined` を 1 つ置いてください。service はその結果を `?? 'unknown'` で受けます。
- **根拠**: CONV-3、Principle V
- **scope 根拠**: 新しく足した 2 件は touched files の中です

### [Low] data-model §4 の service の状態の名前がコードに出てこない (L-003) (scope: feature)

- **観察**:
  - data-model は `storeNewerVersion` / `readFailed` と名指しています (`specs/012-ui-thread-search/data-model.md:254-256,276`)
  - 実装は `state: 'unloaded' | 'loaded' | 'newer-version'` です (`launch-usage-service.ts:55`)
- **同種事象探索**: `storeNewerVersion|readFailed` (data-model) → 4 件。`launch-usage-service.ts` には 0 件です。
- **リスク/影響**: data-model の名前でコードを探しても見つかりません。
- **推奨アクション**: data-model と実装の名前を、どちらかに寄せてそろえてください。
- **根拠**: CONV-6
- **scope 根拠**: touched files と本 spec の data-model の中です

### [Low] ストアの `launch` の `origin` が任意で、省くと黙って `'manual'` になる (L-004) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/running-session-store.ts:366` は `async launch(config, folderLabel = null, origin = 'manual')` です
  - data-model §4 と tasks FE-040 は、起動元を必須としています
- **同種事象探索**: `origin = 'manual'` (src、テストを除く) → 1 件。本番の呼び出しは `RunningSessionsProvider.tsx:71` の 1 件で、起動元を渡しています。
- **リスク/影響**: 後から足した呼び出しが起動元を省いても型エラーになりません。その分、KPI の「再利用率」が `manual` 側に傾きます。
- **推奨アクション**: `origin: LaunchOrigin` を必須にしてください。
- **根拠**: CONV-6
- **scope 根拠**: touched files の中です

### [Low] 名前が衝突していて、別名を付けないと取り違える (L-005) (scope: feature)

- **観察**:
  - `export function CommandPalette` が 2 つあります (`components/assistant-ui/elements/command-palette.tsx:67` / `features/shell/CommandPalette.tsx:66`)
  - `ConversationSearch` という名前で、3 つの別物が近いパスにあります
  - `folderNameOf` が 2 つの署名で使われています
- **同種事象探索**: `export function CommandPalette` → 2 件。
- **リスク/影響**: test と source の対応を、名前から誤って読みます。
- **推奨アクション**: 次のように改名してください。
  - feature 側を `CommandPaletteDialog` に
  - test を `ConversationSearchProvider.test.tsx` に
  - local の関数を `sectionFolderName` に
- **根拠**: CONV-2 / CONV-6
- **scope 根拠**: touched files の中です

### [Low] 「純関数」とされた `palette-commands.ts` が zustand のストアを import している (L-006) (scope: feature)

- **観察**:
  - plan (`specs/012-ui-thread-search/plan.md:195`) は「純関数」と書いています
  - 実際の `src/renderer/src/features/shell/palette-commands.ts` は `:20` / `:21-27` でストアを import しています
- **同種事象探索**: `palette-commands.ts` の `@/stores/` の import → 2 件。
- **リスク/影響**: 純関数の単体テストが、ストアの module まで巻き込みます。
- **推奨アクション**: `createPaletteEffects` を `palette-effects.ts` か `CommandPalette.tsx` に移してください。
- **根拠**: CONV-3
- **scope 根拠**: touched files の中です

### [Low] E2E の共有の手順がコピーされたままで、`e2e/support/` に寄っていない (L-007) (scope: feature)

- **観察**: iter 2 から変わっていません。
  - `launchAnother` が 2 か所にあります: `e2e/multi-session.spec.ts:28` / `e2e/sidebar-screenshot.spec.ts:28`
  - FontFace の注入が 2 か所にあります: `e2e/composer-screenshot.spec.ts:42` / `e2e/sidebar-screenshot.spec.ts:71`
- **同種事象探索**: `async function launchAnother|new FontFace\(` (e2e) → 4 件 / 3 ファイル。
- **リスク/影響**: 基準画像の比較 2 本が、どちらもフォントの注入を前提にしています。コピーの片方だけを直すと、片方の比較が壊れます。`e2e/` は ESLint の対象外なので、重複を拾う仕組みもありません。
- **推奨アクション**:
  - `launchAnother(page)` を `e2e/support/launch.ts` に移してください
  - フォントの注入は `applyBundledJapaneseFont(page, rootSelector)` として `e2e/support/` に移してください
- **根拠**: CONV-3、AD-038 D4
- **scope 根拠**: touched files の中です

### [Low] 新しいコメントが指す `012 code-gate MF-001` は、リポジトリに残る記録から消える。同じファイルの `SC-003` は 012 の SC-003 と読み違えやすい (L-008) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/virtualization.test.tsx:104` のコメントは、根拠として `012 code-gate MF-001` を挙げています
  - MF の ID は iteration ごとに振り直す番号です (`.claude/skills/cl-code-gate/SKILL.md:219` の雛形は毎回 `MF-001` から始まる)
  - 各 iteration の記録は `code-gate.md.iter<N>` に、最終版は `code-gate.md` に保存されます (`SKILL.md:361`)
  - `.gitignore:87-88` は `specs/**/*.iter[0-9]*` と `specs/**/*-gate.md.[0-9]*` を追跡から外しています
  - 今 MF-001 を持っている追跡対象は `specs/012-ui-thread-search/code-gate.md:26` と `.gate-verdict-code.json:22` (`must_fix_findings[]`) の 2 つだけで、どちらも今回の iter 3 で上書きされます
  - 上書きの後も残る `iter_history[]` (`.gate-verdict-code.json:622-635`) は件数しか持たず、`mf_id` を持ちません
  - 同じファイルのテスト名 `(SC-003)` (`:105`) と見出し (`:13`) は、spec 003 の SC-003 (`specs/003-ui-transcript-rendering/spec.md:238`) を接頭辞なしで指しています。一方 012 の SC-003 は palette です (`specs/012-ui-thread-search/spec.md:335`)。今回のコメントが同じファイルに `012` の参照を持ち込んだため、接頭辞の無い `SC-003` は 012 のものと読まれやすくなりました
- **同種事象探索**: `\bMF-\d+` (src) → 6 件
  - 今回の 1 件: `virtualization.test.tsx:104`
  - 既存の 5 件: `src/main/infra/settings/preset-store.test.ts:74` / `src/main/app/preset-service.test.ts:110` / `src/renderer/src/features/folder-runtime-resolution/ResolutionScreen.tsx:159,213` / `src/main/app/folder-service.test.ts:34`
  - iteration まで書く先例もあります: `src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx:247` (`code-gate iteration 1 / a11y H-006`)
- **リスク/影響**: iter 3 が通ると、`MF-001` を引いて理由を確かめる先が、clone 先に残りません。ただし、コメントの本文 (時間ではなくマウント数で判定する / 単独で約 2s・負荷下で約 6s) だけで理由は読めます。このため実害は参照先が切れることに限られ、Low とします。
- **推奨アクション** (最小案から順に):
  1. コードは変えません。iter 3 の `code-gate.md` の Iteration history に、「iter 2 MF-001 = 仮想化のテストの timeout、人間の判断で (a) を選び `737e118` で解消」を 1 行残してください (gate 側の記録で済みます)
  2. コメントも直すなら、`012 code-gate iter 2 MF-001` と iteration まで書いてください (`WorkspaceFoldersScreen.tsx:247` の先例どおり)
  3. 任意: テスト名と見出しの `SC-003` を `003 SC-003` にしてください
- **根拠**: CONV-6 (識別子・参照の整合)、`.gitignore:79` の「round / iter を跨いで必要な情報は、追跡される最終版の中に持たせる」
- **scope 根拠**: `virtualization.test.tsx` は touched files です。案 1 は本 spec の code-gate.md の中で直せます

## H の確認 (自分の担当範囲のテスト / regression / observability)

- **今回の増分が判定を緩めていないか**:
  - assertion は 3 つとも残っています (`toBeGreaterThan(0)` / `toBe(smallRows)` / `toBeLessThan(100)`、`:120-123`)
  - 変えたのは時間の上限だけです。このテストは初めから時間を判定していません (`:104` のコメント、`:13-18` の見出し)
  - したがって SC-003 (003) の DOM の数の検査は変わっていません
- **timeout の書き方の慣習**:
  - `vitest.config.ts` に `testTimeout` / `hookTimeout` はありません (`*.config.*` を検索して 0 件)。そのため既定の 5000ms が全体に掛かり、上限を上げたのはこの 1 テストだけです
  - 1 テストごとに第 3 引数で上限を指定する書き方は既存と同じです (`tests/ui-coverage/item21.test.ts:120,132`)
  - 数値を `_` で区切る書き方 (`20_000`) も既存と同じです (`perf/real-sessions.spec.ts:93` の `60_000`)
- **上限を上げたことで見えなくなるもの**: 描画のコストが後退しても、20s までは、このテストの timeout には出なくなります。iter 2 の A/B 計測では、本 feature による後退は否定されています (`specs/012-ui-thread-search/code-gate.md:30`、平均 約1543ms 対 約1586ms)。transcript の描画時間を合否にする検査が vitest に無いことは、テストの戦略の問題で、F の担当外です。
- **lint の抑止が増えていないか**: `eslint_suppressed_messages: 3` は、どれも既存のものです (`src/renderer/src/components/file.tsx:166` / `src/renderer/src/hooks/use-attachment-src.ts:17` / `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:352`)。diff の追加行と削除行に `eslint-disable` は 0 件でした (`^[+-].*eslint-disable`)。
- **lint hookup**:
  - ESLint は project 全体 (`.`) に掛かり、exit 0 でした。scope の 97 ファイルのうち 73 ファイルを lint しています
  - `virtualization.test.tsx` は ESLint の対象で、`tsconfig.web.json` の型検査も exit 0 です
  - `e2e/**` と `perf/**` が ESLint の対象外なのは前からの gap で、`typecheck:e2e` / `typecheck:perf` が exit 0 です
- **リネーム漏れ・循環依存**: 今回の増分は識別子も import も変えていません。dependency-cruiser は exit 0 です。
- **観測点**: timeout で落ちたときは、vitest が `Test timed out in 20000ms` とテスト名を出します。上限を上げた理由はコメントにあり、ログから原因を追えます。
- **CI での実行は未確認**: HEAD `737e118` で CI の全件実行が通ったかは確かめていません。Bash は CONV-4 に限られるため `gh` を使っていません。全件実行の結果は、この後の test track が一次情報です。

## 担当外の観察 (指摘にはしない。振り分けのための記録)

- **同じ種類の timeout がまた起きうる** (test track の担当): `LivePane.test.tsx:119` と `SessionListScreen.test.tsx:735` (単独で 3354ms = 上限の 67%) は、既定の 5000ms のままです (`code-gate.md:36`)。全体の判断 (選択肢 (c)) は 012 の範囲外と記録されています。
- **lint-agent の内訳の数字**:
  - `scope_files_not_eslint_targets_breakdown` は「md 18」と書いていますが、scope の実数は 16 本です
  - 内訳を足すと 18+1+1+5+1 = 26 で、`scope_files_not_eslint_targets: 24` と合いません。実数 (16) で足すと 24 になります
  - exit code と violations には影響しません
- **iter 2 で挙げた担当外の観察** (quickstart-results V-4 の記述の食い違い、`e2e/*.spec.ts` がすべて流れることを確かめる検査が無いこと): 該当のファイルは iter 3 で変わっていないので、そのまま残っています。

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
| L-006 | `@/stores/` の import (`palette-commands.ts`) | 2 | `palette-commands.ts:20,21` |
| L-007 | `async function launchAnother\|new FontFace\(` (e2e) | 4 | `multi-session.spec.ts:28` / `sidebar-screenshot.spec.ts:28,71` / `composer-screenshot.spec.ts:42` |
| L-008 | `\bMF-\d+` (src) | 6 | `virtualization.test.tsx:104` / `preset-store.test.ts:74` / `preset-service.test.ts:110` / `ResolutionScreen.tsx:159,213` / `folder-service.test.ts:34` |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 8
- Iteration inheritance (iter 2 → iter 3): resolved from 2: 0 / unresolved: 10 (M-001〜M-003 / L-001〜L-007。severity は同じ。新しい事実は無い) / new: 1 (L-008)

<details>
<summary>lint-agent の stdout JSON (invoker から受け取ったもの。本 reviewer は lint を実行していない)</summary>

- 7 コマンド (lint / typecheck x2 / depcruise / check:constitution / typecheck:e2e / typecheck:perf) すべて `exit_code: 0`
- `violations: []`、`violation_count_by_severity: {error: 0, warning: 0, info: 0}`
- `eslint_suppressed_messages: 3` (すべて既存の `eslint-disable`)
- depcruise: no dependency violations found (387 modules, 1894 dependencies cruised)
- check:constitution: 21 items: ok 20 / violations 0 / no target 1 (#5 pending)
- test:rules は実行していない (code-gate の規則)

CONV-1 の翻訳結果:

- `violations[]` は 0 件で、7 コマンドすべてが `exit_code: 0` でした。lint 由来の finding と、exit code 由来の Critical はありません。
- 「ESLint の対象外が 24 件」を scope で数え直すと、.md 16・verify.yml 1・main.css 1・e2e 5・perf 1 で、合計 24 です。breakdown の「md 18」は書き誤りで、判定には影響しません。
- 抑止された 3 件は、どれも既存の `eslint-disable` です。diff はこれを 1 件も足していません。

</details>

Lint は実行していません。Bash は 1 回も使っていません (CONV-4 の madge も、import の変更が無いので不要でした)。
