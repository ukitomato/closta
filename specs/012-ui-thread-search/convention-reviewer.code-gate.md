# convention-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: convention-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Gate**: code-gate iteration 2 (pr-gate round 1 の修正 `9d98c39..ddc052e` の後に再実行)

## 初回読了 viewpoint

- FR/SC:
  - FR-018 / SC-008: 今回の差分の中心。`verify.yml` に E2E のステップを 1 つ足した。`e2e/sidebar-screenshot.spec.ts` は撮る前に区画のスクロールを送るようになった。基準画像 `sidebar-past-sessions-win32.png` も足した
  - FR-001 / FR-008: `session-list/labels.ts` の `searchPlaceholder` を短くした (data-model §5 `:322` と同じ値)
  - FR-002〜FR-007 / FR-009〜FR-014 / FR-016 / FR-017: iter 1 から変わっていない (iter 1 の指摘は全部持ち越し)
  - SC-005 (`schemaVersion` の名前) / SC-006 (IPC の命名) / SC-007 (constitution-check が exit 0): 今回の lint-agent の JSON でも成り立っている
- touched files に当たる charter / Confirmation:
  - AD-038 D2: `e2e/` は src のグラフの外にあり、ESLint の対象外。型検査 (`tsc -p e2e/tsconfig.json`) だけが守る
  - AD-038 D4 / D5: 同梱フォントを FontFace + CSSOM で当てる。基準画像は承認してからコミットする。承認の判定は担当外で、ここでは名前と置き場所だけを見た
  - ui charter In scope (U-5): 配置の判断 (M-002) の根拠。iter 1 から変わっていない
  - AD-023 §5/§7 / AD-025 §9: 実名で列挙する規則。iter 1 で足されたことを確かめた。今回の差分は触れていない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (E2E のフォント注入の CSP の扱いも担当外)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-038 D5 の承認の手続きも担当外)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (placeholder の文言の良し悪しは ux-reviewer の担当)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:7
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage の各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 — 今回の差分と F の各指摘について、検出・保護するテストがあるか、リネーム漏れと循環が無いかを確かめた (下の「H の確認」)

## スコープ要約

対象は `7bdb271..ddc052e` の差分です。scope は 96 ファイルで、`touched-files.txt` との共通部分です。iter 1 からの増分は pr-gate R1 C-001 の修正で、次の 5 つです。

- `verify.yml` の e2e job の最後にステップを 1 つ足した
- `sidebar-screenshot.spec.ts` が撮る前に区画のスクロールを送り、`toBeInViewport({ ratio: 1 })` で確かめるようになった
- 基準画像 `e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png` を足した
- `PAST_SESSIONS_LABELS.searchPlaceholder` を 16 字から 13 字にした
- spec_dir の data-model §5 / §7 と quickstart-results V-4 を書き直した

lint-agent の JSON は 7 コマンドで、どれも `exit_code: 0`、`violations: []` でした。今回の ESLint は project 全体 (`.`) に掛かっています。したがって CONV-1 由来の指摘と、exit code 由来の Critical はありません。循環依存は dependency-cruiser の `no-circular` (387 modules / 1894 dependencies) が exit 0 で確かめています。今回の差分は src の import を変えていないので、madge は自分で実行していません。

増分の命名と配置は既存の慣習どおりです。

- 基準画像は Playwright の `{name}-{platform}.png` の形で、`composer-fullwidth-win32.png` と同じです
- CI のステップ名は「e2e (<日本語>)」の形で、1 検証 1 ステップの規則どおりです
- import の順は `node:` → `@playwright/test` → `./support` です

増分から来る新しい F の指摘はありません。iter 1 の 10 件は、どれも直されないまま残っています。今回修正で触れたファイル (`sidebar-screenshot.spec.ts`) にある L-007 も含みます。

## Findings

### [Medium] IME の変換中の判定とモーダルの判定が 4 ファイルに 7 か所コピーされている (M-001) (scope: feature)

- **観察**: iter 1 から変わっていません。
  - 変換中かの判定 `isComposing || keyCode === 229`: `ConversationSearchProvider.tsx:44,166` / `CommandPalette.tsx:34` / `SessionListScreen.tsx:806` / element の `command-palette.tsx:126`
  - モーダルの判定 `document.querySelector('[aria-modal="true"]') !== null`: `ConversationSearchProvider.tsx:60` / `CommandPalette.tsx:50`
- **同種事象探索**: `keyCode === 229|aria-modal="true"\]'\) !== null` (src、テストを除く) → コード 7 件 (`command-palette.tsx:27` はコメントなので除外)。共有の helper は 0 件。
- **リスク/影響**: Principle VIII の規則と FR-006 のモーダルの判定が、1 つの規則として存在しません。判定を変えるときに 1 か所でも漏れれば、palette・会話内検索・Thread search の挙動が分かれます。
- **推奨アクション**: `src/renderer/src/lib/keyboard-guards.ts` に `isComposingKey` と `isModalDialogOpen` を置き、上の 7 か所をそこから import してください。`lib/` は strictness を戻す一覧 (`eslint.config.mjs` の `lib/safe-url.ts` と同じ扱い) に足します。
- **根拠**: CONV-3、Principle VIII、spec FR-003 / FR-006
- **scope 根拠**: 7 か所すべてが touched files の中

### [Medium] `SessionListScreen.tsx` が 1427 行。ui が持つ Thread search の部品が session の module の中にある (M-002) (scope: feature)

- **観察**: iter 1 から変わっていません。
  - `SessionListScreen.tsx` は 1427 行 (`:1427` が末尾) です。`narrowToTerms` / `openByDefault` / `isComposingKey` / `PastSearchField` を同じファイルに持っています。
  - ui charter (`docs/domains/ui/charter.md:55-56`) は、一致の規則と検索欄・絞り込みを ui に割り当てています。
  - `e2e-capability.ts` は 619 行 (`:619` が末尾) で、本 PR で 500 行を超えました。
- **同種事象探索**: touched files のうち 500 行を超えるもの → 5 件 (`SessionListScreen.tsx` 1427 / `thread.aui.tsx` 1202 / `LaunchDialog.tsx` 755 / `running-session-store.ts` 650 / `e2e-capability.ts` 619)。
- **リスク/影響**: 検索を広げるたびに、このファイルが伸びます (O-9 など)。charter が ui に割り当てた部品の持ち主を、module から読み取れません。
- **推奨アクション**:
  - `PastSearchField` と `narrowToTerms` を `features/search/` に移してください。
  - `isComposingKey` は M-001 の共有の helper に置き換えます。
  - `e2e-capability.ts` の固定の索引は `src/main/app/e2e-session-index.ts` に分けられます。分けた場合は、`WSL_FREE_DIRECTORIES` に足すかを決めてください。
- **根拠**: CONV-3 (1 ファイル 500 行超は warning)、ui charter In scope (U-5)、plan Structure Decision
- **scope 根拠**: touched files の中で移せる

### [Medium] spec の Key Entities の名前 (`version` / 「本文の位置」) が実装・data-model (`schemaVersion` / `occurrence`) と食い違ったまま (M-003) (scope: feature)

- **観察**: 今回の修正は data-model / quickstart-results を書き直しましたが、spec.md は直していません。
  - `spec.md:320` は今も `{ version, days: … }` です。実装 (`launch-usage.ts` の `LaunchUsageRecord.schemaVersion`)、data-model §4、glossary は `schemaVersion` です。
  - `spec.md:317` は今も「メッセージの id と本文の位置」です。実装と data-model §2 は `occurrence` (出現の順) です。
- **同種事象探索**: `\{ version, days|本文の位置` (`spec.md`) → 2 件 (`:317` / `:320`)。src と data-model は `schemaVersion` / `occurrence` だけです。
- **リスク/影響**: SC-005 の固定のキー集合のテストは、このキーの名前に依存しています。spec を正として読む人が `version` と読み違えます (CONV-6 のリネーム漏れ)。
- **推奨アクション**: Key Entities の 2 行を、data-model §2 / §4 を正本として指す参照の形に直してください。コードは変えません。
- **根拠**: CONV-6、Principle XIV、design-gate M-14 / analyze I2 (持ち越し。severity は同じ)
- **scope 根拠**: 本 spec のディレクトリの中の文面で直せる

### [Low] 本番で参照されない export と、古い名前を指す注記 (L-001) (scope: feature)

- **観察**:
  - `ConversationSearchState` (`conversation-search.ts:39`) は、src 全体で参照が 0 件です。
  - `CenterPane.tsx:33` の注記は、今も本番で使われない `ChatScreen` を指しています (本番は `ChatScreenBody`)。
- **同種事象探索**: `\bConversationSearchState\b` (src、テストを除く) → 1 件 (定義だけ)。
- **リスク/影響**: 状態の型が 2 つあり、data-model に書かれた名前のほうが使われていません。参照されない export を検出する検出器もありません。
- **推奨アクション**: 次の 2 点を直してください。
  - `ConversationSearchState` を消すか、`ConversationSearchController` に寄せる
  - 注記を `ChatScreenBody` に直す
- **根拠**: CONV-5 / CONV-6
- **scope 根拠**: touched files の中

### [Low] `errnoCode` が同じ名前で 3 か所にあり、返り値の契約が違う (L-002) (scope: feature)

- **観察**: 同じ名前で返り値が 2 種類あります。
  - `launch-usage-store.ts:77`: `string | undefined` を返す
  - `launch-usage-service.ts:46`: `string` を返す (当てはまらなければ `'unknown'`)
  - `preset-store.ts:54` (既存): `string | undefined` を返す
- **同種事象探索**: `function errnoCode` → 3 件 (本 PR の新規 2 件)。
- **リスク/影響**: 同じ名前で意味が違うので、取り違えやすくなっています。Principle V のログの浄化の正規表現も、3 か所に分かれています。
- **推奨アクション**: `src/main/infra/settings/` に `errnoCodeOf(error): string | undefined` を 1 つ置き、service は `?? 'unknown'` で受けてください。
- **根拠**: CONV-3、Principle V
- **scope 根拠**: 新規の 2 件は touched files の中

### [Low] data-model §4 の service の状態の名前がコードに出てこない (L-003) (scope: feature)

- **観察**: data-model §4 の表 (`data-model.md:254-256`) と DTO の注記 (`:276`) は、`storeNewerVersion` / `readFailed` と名指しています。実装は `state: 'unloaded' | 'loaded' | 'newer-version'` (`launch-usage-service.ts:55`) です。
- **同種事象探索**: `storeNewerVersion|readFailed` (data-model) → 4 件 (`:254,255,256,276`)。`launch-usage-service.ts` には 0 件です。
- **リスク/影響**: data-model の名前でコードを探しても見つかりません。
- **推奨アクション**: data-model の「service の状態」列を実装の値に合わせるか、実装を data-model の名前に寄せるか、どちらかにそろえてください。テストの題もその名前にします。
- **根拠**: CONV-6
- **scope 根拠**: touched files と本 spec の data-model の中

### [Low] ストアの `launch` の `origin` が任意で、省くと黙って `'manual'` になる (L-004) (scope: feature)

- **観察**: `running-session-store.ts:366` は `async launch(config, folderLabel = null, origin = 'manual')` です。data-model §4 と tasks FE-040 は `launch(config, folderLabel, origin)` と書いており、起動元は必須です。
- **同種事象探索**: `origin = 'manual'` (src、テストを除く) → 1 件。本番の呼び出しは `RunningSessionsProvider.tsx:71` の 1 件で、起動元を渡しています。
- **リスク/影響**: 後から足した呼び出しが起動元を省いても型の誤りにならず、KPI「再利用率」が `manual` 側に傾きます。
- **推奨アクション**: `origin: LaunchOrigin` を必須にしてください。テストは値を明示して渡します。
- **根拠**: CONV-6
- **scope 根拠**: touched files の中

### [Low] 名前が衝突していて、別名・取り違えが要る (L-005) (scope: feature)

- **観察**:
  - `export function CommandPalette` が 2 つあります (`command-palette.tsx:67` / `features/shell/CommandPalette.tsx:66`)。
  - `ConversationSearch` の名前で、3 つの別物が近いパスにあります (element / 走査の module / test のファイル)。
  - `folderNameOf` が 2 つの署名で使われています。
- **同種事象探索**: `export function CommandPalette` → 2 件。
- **リスク/影響**: test と source の対応を、名前から誤って読みます。
- **推奨アクション**:
  - feature 側を `CommandPaletteDialog` に改名する。
  - test を `ConversationSearchProvider.test.tsx` に改名する。
  - local の関数を `sectionFolderName` に改名する。
- **根拠**: CONV-2 / CONV-6
- **scope 根拠**: touched files の中

### [Low] 「純関数」とされた `palette-commands.ts` が zustand のストアを import している (L-006) (scope: feature)

- **観察**: plan (`plan.md:195`) は「純関数」と書いています。実際の `palette-commands.ts` は、`useSessionsStore` (`:20`) と `useUiStore` (`:21-27`) を import しています。
- **同種事象探索**: `palette-commands.ts` の `@/stores/` の import → 2 件 (`:20` / `:21`)。
- **リスク/影響**: 純関数の単体テストがストアの module を巻き込み、plan の module の境界と合いません。
- **推奨アクション**: `createPaletteEffects` を `palette-effects.ts` か `CommandPalette.tsx` に移してください。
- **根拠**: CONV-3
- **scope 根拠**: touched files の中

### [Low] E2E の共有の手順がコピーされ、`e2e/support/` に寄っていない (L-007) (scope: feature)

- **観察**: 今回の修正は `sidebar-screenshot.spec.ts` に手を入れましたが、コピーは残っています。
  - `launchAnother` が `e2e/multi-session.spec.ts:28` と `e2e/sidebar-screenshot.spec.ts:28-36` で同じ中身です。
  - 同梱フォントの FontFace + CSSOM の注入が、`composer-screenshot.spec.ts:41-49` と `sidebar-screenshot.spec.ts:70-80` の 2 か所にあります。
  - 共有の置き場 `e2e/support/launch.ts` はすでにあります。
- **同種事象探索**: `async function launchAnother|new FontFace\(` (e2e) → 4 件 / 3 ファイル (`multi-session.spec.ts:28` / `sidebar-screenshot.spec.ts:28,71` / `composer-screenshot.spec.ts:42`)。
- **リスク/影響**: 基準画像の比較が 2 本になり、フォントの注入はどちらの比較の前提にもなりました。コピーの片方だけを直すと、片方の比較が壊れます。`e2e/` は ESLint の対象外なので、重複を拾う仕組みもありません。
- **推奨アクション**: 次の 2 つを `e2e/support/` に移し、3 つの spec から import してください。
  - `launchAnother(page)` → `launch.ts`
  - `applyBundledJapaneseFont(page, rootSelector)` → `launch.ts`、またはフォント用の `fonts.ts`
- **根拠**: CONV-3、AD-038 D4
- **scope 根拠**: touched files (`e2e/sidebar-screenshot.spec.ts` / `e2e/multi-session.spec.ts`) の中

## H の確認 (自分の担当範囲のテスト / regression / observability)

- **今回の差分の保護**:
  - `searchPlaceholder` の文字列を固定する component テストはありません (`searchPlaceholder|などで探す` をテストで検索して 0 件)。守るのは、今回足した基準画像だけです。
  - quickstart-results `:90-91` は、基準画像を新しい placeholder の後の CI run 37546036334 の actual から取ったと書いています。
  - 「全角 14 字まで」の長さの制約 (`labels.ts:203-204`) は、テストでは守られていません。字数を増やすと画像の比較で落ちる、という間接の保護だけです。
- **E2E の locator が実在の要素を指すか**: 新しい locator `[data-slot="aui_thread-list-root"]` は `thread-list.aui.tsx:119` に、`[data-testid="past-sessions"]` は `Sidebar.tsx:144` にあります。`tsc -p e2e/tsconfig.json` は exit 0 です。
- **リネーム漏れ**: 次の検索が 0 件で、FR-014 / FR-017 のリネームは完了したままです。
  - `Message input|Send a message|section-heading-|section-panel-` (src / e2e / perf)
- **循環依存**: dependency-cruiser の `no-circular` が exit 0 です。今回の差分は src の import を変えていません。
- **lint hookup**: 今回の ESLint は project 全体に掛かり、exit 0 でした (iter 1 は touched files だけ)。`e2e/**` と `perf/**` が ESLint の対象外なのは前からの gap で、`eslint.config.mjs` が roadmap に記録済みです。
- **観測点**: 区画のスクロールの領域が見つからないとき、E2E は日本語のメッセージで投げます (`sidebar-screenshot.spec.ts:90`)。CI の失敗のログで原因を特定できます。
- **CI での実行は未確認**: HEAD `ddc052e` (基準画像のコミットの後) で、CI のこのステップが通ったかは確かめていません。Bash は CONV-4 に限られるため、`gh` を使っていません。quickstart-results V-4 の「記録すること」(`:81-82`) にも、通った記録はまだありません。

## 担当外の観察 (指摘にはしない。振り分けのための記録)

- **quickstart-results V-4 の記述が食い違っている** (po-reviewer / architecture-reviewer の担当):
  - 節の見出し (`quickstart-results.md:74`) は「未実施」です。
  - `:76-77` は「基準画像はまだコミットしていない。コミットするまで落ちる」と書いています。
  - `:90-93` は「コミットした」「承認済みとして扱った」と書いています。
  - `verify.yml:169-170` の注記「commit するまで本ステップは基準画像が無くて落ちる」も、コミットの前の状態を書いたままです。
- **基準画像が code-gate の scope に入っていない**: `sidebar-past-sessions-win32.png` は `touched-files.txt` に無いので、diff との共通部分 (`.code-gate-scope.txt`) から外れています。画像の中身の承認は reviewer の担当外 (AD-038 D5 の人間の承認) なので、実害はありません。
- **再発防止の検査がまだ無い**: pr-gate R1 の system follow-up「`e2e/*.spec.ts` がすべて verify.yml から流れることを確かめる検査」は、roadmap にまだありません (`docs/roadmap.md` を `e2e/\*\.spec` で検索して 0 件)。workflow の lint (actionlint など) もリポジトリにありません。検査の穴なので PB-7 (platform-boundary-reviewer) の担当です。今の `e2e/*.spec.ts` は 5 本とも verify.yml に現れることを確かめました (`:139,145,159,164,172`)。
- **lint-agent の note の内訳の数字**: 「19 .md files」は、scope の実数では 16 本です (合計 24 件は合っています)。exit code と violations には影響しません。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `keyCode === 229\|aria-modal="true"\]'\) !== null` (src、テストを除く) | 7 (コード) | `ConversationSearchProvider.tsx:44,60,166` / `CommandPalette.tsx:34,50` / `SessionListScreen.tsx:806` / `command-palette.tsx:126` |
| M-002 | touched files の行数が 500 超 | 5 | `SessionListScreen.tsx` (1427) / `thread.aui.tsx` (1202) / `LaunchDialog.tsx` (755) / `running-session-store.ts` (650) / `e2e-capability.ts` (619) |
| M-003 | `\{ version, days\|本文の位置` (`spec.md`) | 2 | `spec.md:317` / `spec.md:320` |
| L-001 | `\bConversationSearchState\b` (src、テストを除く) | 1 (定義のみ) | `conversation-search.ts:39` |
| L-002 | `function errnoCode` | 3 | `launch-usage-store.ts:77` / `launch-usage-service.ts:46` / `preset-store.ts:54` |
| L-003 | `storeNewerVersion\|readFailed` (data-model) | 4 | `data-model.md:254,255,256,276` |
| L-004 | `origin = 'manual'` (src、テストを除く) | 1 | `running-session-store.ts:366` |
| L-005 | `export function CommandPalette` | 2 | `command-palette.tsx:67` / `features/shell/CommandPalette.tsx:66` |
| L-006 | `@/stores/` の import (`palette-commands.ts`) | 2 | `palette-commands.ts:20,21` |
| L-007 | `async function launchAnother\|new FontFace\(` (e2e) | 4 | `multi-session.spec.ts:28` / `sidebar-screenshot.spec.ts:28,71` / `composer-screenshot.spec.ts:42` |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 7
- Iteration inheritance (iter 1 → iter 2): resolved from 1: 0 / unresolved: 10 (M-001〜M-003 / L-001〜L-007。severity は同じ。新しい事実は無い) / new: 0

<details>
<summary>lint-agent の stdout JSON (invoker から受け取ったもの。本 reviewer は lint を実行していない)</summary>

```json
{
  "command": "node node_modules/eslint/bin/eslint.js --cache --format json -o <scratchpad>/eslint.json .",
  "commands": [
    {"command": "node node_modules/eslint/bin/eslint.js --cache --format json -o <scratchpad>/eslint.json .", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --composite false", "exit_code": 0},
    {"command": "node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src", "exit_code": 0},
    {"command": "node scripts/constitution/check.mjs", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p e2e/tsconfig.json", "exit_code": 0},
    {"command": "node node_modules/typescript/bin/tsc --noEmit -p perf/tsconfig.json", "exit_code": 0}
  ],
  "detectors": ["lint", "typecheck", "depcruise", "check:constitution", "typecheck:e2e", "typecheck:perf"],
  "exit_code": 0,
  "duration_ms": 187548,
  "scope": "touched-files",
  "touched_count": 96,
  "violations": [],
  "violation_count_by_severity": {"error": 0, "warning": 0, "info": 0},
  "note": "Every detector ran project-wide (ESLint on . / depcruise on src / tsc per project / check.mjs on 368 files). Scope filtering against .code-gate-scope.txt only applies to ESLint. ESLint: 376 files reported, 72 of the 96 scope files linted; the other 24 are not ESLint targets (19 .md files, .github/workflows/verify.yml, src/renderer/src/assets/main.css, 5 e2e/ files, perf/real-sessions.spec.ts). All 4 tsc projects printed no diagnostics. depcruise: 'no dependency violations found (387 modules, 1894 dependencies cruised)'. check:constitution: 21 items, ok 20 / 0 violations / 1 pending (#5, image-build subcommands: 0 modules can name docker, so nothing to check)."
}
```

CONV-1 の翻訳結果:

- `violations[]` は 0 件で、7 コマンドすべてが `exit_code: 0` でした。lint 由来の finding と、exit code 由来の Critical はありません。
- 「24 件は ESLint の対象外」の内訳を scope で数え直しました。.md 16・verify.yml 1・main.css 1・e2e 5・perf 1 で、合計 24 件は note と同じです。note の「19 .md」は書き誤りで、判定には影響しません。

</details>
