# po-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00 (時刻は取得していない。日付だけが正確)
**Reviewer**: po-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC:
  - US-1: FR-001 / FR-002 / FR-017 / FR-018 → SC-001 / SC-008
  - US-2: FR-003〜FR-005 → SC-002
  - US-3: FR-006 / FR-007 → SC-003
  - Empty state: FR-008 → SC-004
  - US-4: FR-009〜FR-013 → SC-005 / SC-006
  - 記録の追随: FR-014〜FR-016 → SC-007
  - 本 PR は FR-001〜FR-018 をすべて実装の対象にしている (code-gate の `fr_coverage` は 18 件とも covered)
- touched files に該当する charter / Confirmation:
  - ui charter: In scope の O-3 の例外 (`docs/domains/ui/charter.md:53-59`) と「面の状態」(2) (`:180-189`)
  - session charter: KPI「再利用率」と計測経路の注記 (`docs/domains/session/charter.md:165-179`)、Cross-domain の起動元 (`:187-189`)
  - AD-038 Confirmation「verify.yml に日本語スクリーンショット比較ジョブが存在し緑」(`docs/decisions/0038-e2e-screenshot-harness.md:111`) と D5 (`:85-88`)。FR-018 の基準画像に当たる
  - AD-041 (h) (計測経路を O-3 に指名)
  - AD-045 Confirmation (`docs/decisions/0045-ui-labels-no-i18n-resources.md:45-54`)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲 (KPI の判定の可否は E の SC の計測可能性として扱う)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の Owner 範囲 (AD-038 は C-001 の根拠として引くだけ)
- E. User Story / SC / AC / UX: Critical:1 High:0 Medium:4 Low:6
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の Owner 範囲
- G. optional reviewer 範囲: 該当なし: po-reviewer は optional reviewer ではない (空の状態の文言は、UX flow の入口と出口に限って E で扱う)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

diff は main...HEAD (merge-base 7bdb271 / HEAD 9d98c39。114 files) で、範囲は 3 つ:
- 4 つの User Story (Thread search・会話内検索・Command palette・再利用率) の実装と、その component / 単体 / E2E のテスト
- 記録の追随 (charter 2 つ・glossary・roadmap・ui-coverage・Constitution XV・AD-045)
- O-7 から預かった過去の区画の並び

見た点:
- 各 SC の計測経路が実際に動くか
- AC のとおりにコードが振る舞うか
- design-gate R4 で po が残した Medium 5 件と Low 9 件が、実装で解消されたか

design-gate の po の指摘の行方 (実装で確かめた):
- 解消: M-004 (会話内検索を閉じた後のフォーカス)
  - `ConversationSearchProvider.tsx:125-131` が開く前の要素へ戻し、消えていれば検索のボタンへ戻す
  - `ConversationSearch.test.tsx` にフォーカスの assert が 6 件ある
- 解消: L-008 (SC-005 と US-4 の Independent Test に起動ダイアログの component テストが入った。`spec.md:170,337`)
- 解消: L-009 (quickstart V-2 に KPI の注記 4 点が入った。`quickstart.md:21-25`)
- 解消: design-gate L-35 (形の不正な起動設定を記録しないテストがある。`session-ipc.test.ts:525`)
- 一部だけ解消: M-005 (入口の手がかり)。下の M-003
- 未解消のまま実装に入った (下の各指摘):
  - M-002 → M-001
  - M-003 → M-002
  - M-006 → M-005
  - L-001〜L-007 → L-001〜L-007 (番号は本 Round で振り直した)

本 Round で新しく見つけたもの:
- **C-001**: FR-018 / SC-008 の E2E は CI で一度も実行されない
- **M-004**: 会話内検索の 0 件の文言が、対象の範囲を示さない

既存の振る舞いを壊していない根拠:
- Vitest 2266 件は緑 (`quickstart-results.md:17`)
- E2E は本機で流していない (`quickstart-results.md:18-19`)。CI の結果は PR の上でしか見えないので、本レビューでは確かめていない

## Findings

### [Critical] FR-018 / SC-008 の E2E (`e2e/sidebar-screenshot.spec.ts`) は CI のどのステップからも実行されず、基準画像もコミットされていない。SC-008 は判定できないまま CI が緑になる (C-001) (scope: feature)

- **観察**:
  - CI の e2e job は spec のファイルを 1 本ずつ名指しで流す。名指しは 4 本だけ: `.github/workflows/verify.yml:139` (ime)、`:145` (composer-screenshot)、`:159` (launch-dialog)、`:164` (multi-session)
  - `e2e/sidebar-screenshot.spec.ts` を流すステップは無い。本 diff は `.github/` を変えていない (`.pr-gate.diff` に `diff --git a/.github` は 0 件)
  - `package.json:17` の `test` は `vitest run` で、Playwright を起こさない
  - 新しい spec には 2 つのテストがある:
    - 基準画像の比較: `e2e/sidebar-screenshot.spec.ts:81` の `toHaveScreenshot('sidebar-past-sessions.png')`
    - 高さの確認: `:89-128`
  - 基準画像のファイルは無い。`e2e/**/*.png` は `composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` の 1 件だけである
  - SC-008 (`spec.md:340`) の計測経路は「E2E (高さと基準画像)」と「FR-018 の基準画像の比較が CI で通る」である。FR-018 (`spec.md:309-312`) と SH-010 (`tasks.md:50`) は、基準画像を「CI の e2e job の artifact から取る」と決めている
  - artifact が上がるのは、CI のステップが失敗したときだけである (`verify.yml:168-169` の `if: failure()`)。ステップが無いので、この取得の手順は始まりようがない
  - 設計の文書 (specs/012 の `*.md`) に `verify.yml` は 0 件で、CI に配線するタスクが無い
  - quickstart-results は「CI の e2e job で通す」と書いているが (`quickstart-results.md:18-19`)、事実と違う
- **同種事象探索**: 次の 2 つで突き合わせた
  - `playwright test e2e/` (`.github/workflows/verify.yml`): 4 件 (`:139,145,159,164`)
  - `e2e/*.spec.ts` の Glob: 5 件
  - 突き合わせの結果: CI から実行されない E2E の spec は **1 件** (`e2e/sidebar-screenshot.spec.ts`)。ほかの SC (SC-002 / SC-003) が計測経路にした `e2e/ime.spec.ts` は CI で流れている
- **リスク/影響**:
  - SC-008 の E2E の部分 (稼働中 10 行・compact で、見出しと検索欄が見え、スクロールで行に届く) と FR-018 の基準画像は、どこでも判定されない
  - それでも CI は緑で、quickstart-results は「CI で通す」と書いたままなので、この PR は SC-008 を満たしたものとして completed に進みうる (偽の緑)
  - O-7 から預かった義務 (iii)「サイドバーの領域の基準画像を足す」が、果たされないまま閉じる。O-7 の義務 (i) (過去の区画が縮んでも見出しと検索欄が見える) を回帰から守る仕組みも無い
  - 重大度の根拠: po-reviewer の PO-2 (SC の計測不能)。仮定の将来の経路ではなく、今のリポジトリで観察できる事実である
- **推奨アクション**:
  1. `verify.yml` の e2e job に、次のステップを足す (composer-screenshot と同じ形):
     ```yaml
     - name: e2e (サイドバーの過去のセッションの区画)
       run: pnpm exec playwright test e2e/sidebar-screenshot.spec.ts -c playwright.config.ts
     ```
  2. 最初の実行は基準画像が無いので落ちる。`e2e-test-results` の artifact から `sidebar-past-sessions-win32.png` を取り、`e2e/sidebar-screenshot.spec.ts-snapshots/` にコミットする
  3. AD-038 D5 のとおり、人が見た目を承認したことを `quickstart-results.md` に記録する (全角の行送り・折り返し・グループの見出し)
  4. `quickstart-results.md:18-19` を事実に合わせる (CI のステップ名と、基準画像のコミットの日付)
  5. 再発の防止: tasks の SH-043 (検証) に「新しく足した E2E の spec が `verify.yml` から流れることを確かめる」を足す
- **根拠**: PO-2 / base H / spec SC-008・FR-018 / AD-038 D5・Confirmation (`docs/decisions/0038-e2e-screenshot-harness.md:85-88,111`) / 013 から預かった義務 (iii)
- **scope 根拠**: feature。FR-018 の成果物であり、`verify.yml` に 1 ステップ足し、基準画像を 1 枚コミットすれば本 PR の中で閉じる

<!-- gate-common: demoted Critical → High (no cascade evidence) finding=FR-018 -->
<!-- invoker (pr-gate R1): 上の降格を取り消した。cascade_enforce は見出しの最初の `[A-Z]+-\d+` (一行サマリの中の FR-018) を指摘 ID として拾い、reviewer-base.md:142 の書式で宣言された ID (C-001) を見ていない。cascade summary の C-001 の行は件数 1 (整数) で、関数自身の規則 (verified_in_table) では確認済みに当たる。invoker も verify.yml の playwright の行 4 本と Glob e2e/**/*.png 1 件で観察を確かめた。関数の不具合は pr-gate.md の system follow-up に記録した -->

### [Medium] 将来版のファイルでも「次に起動ダイアログを開いたときに読み直します」と出るが、読み直しは起きず、記録は黙って止まる (M-001) (scope: feature)

- **観察**:
  - 将来版を読むと、service は状態を `'newer-version'` にする (`src/main/app/launch-usage-service.ts:75-79`)
  - `ensureLoaded` が読み直すのは `state === 'unloaded'` のときだけである (`:65`)。将来版のファイルは書き換えない (`launch-usage-store.ts:158-159`) ので、アプリを起動し直しても同じ将来版のままになる
  - renderer の表示では、将来版も読めないも同じ `unreadable` になり (`PresetPanel.tsx:215-219`)、ヒントはどちらも `usageUnreadableHint`「次に起動ダイアログを開いたときに読み直します。」(`src/renderer/src/features/session/labels.ts:485`) である
  - 消し方は `docs/discovery.md:367` にあるが、画面からは辿れない
- **同種事象探索**: `usageUnreadableHint|newer-version|storeNewerVersion` (src) で 4 件 (`labels.ts:485` / `PresetPanel.tsx:218` / `launch-usage-service.ts:55,75-78` / `launch-usage-store.ts:50,159`)。renderer で 2 つを区別する分岐は 0 件
- **リスク/影響**:
  - 画面の約束が事実と違う。版を下げて使う利用者には、KPI の計測経路が止まったまま、回復の手段 (アプリを上げる・ファイルを消す) が示されない
  - design-gate R4 の M-02 / po M-002 が、そのまま実装に入った
- **推奨アクション**: 次のどちらかにし、`PresetPanel.test.tsx` に将来版の行を足す
  - `LaunchUsageSummaryDTO` の `unreadable` に理由 (`newer-version` / `read-failed`) を持たせ、将来版では「新しい版のアプリが書いた記録のため読めません。アプリを更新するか、記録のファイルを消してください」のように出す
  - ヒントを両方に当てはまる文に改める
- **根拠**: PO-4 / PO-6 / spec US-4 AC4・AC5 / FR-012
- **scope 根拠**: feature。`session/labels.ts`・`PresetPanel.tsx` (と DTO) で直せる

### [Medium] 過去ログの取得中と取得の失敗の間に会話内検索を開くと、「一致する箇所はありません。語を変えるか、検索を閉じてください。」と出る (M-002) (scope: feature)

- **観察**:
  - `PastCenter` は、取得の状態に関わらず `transcript.messages` を provider に渡す (`src/renderer/src/features/shell/CenterPane.tsx:155,175`)
  - `useTranscript` の `messages` の初期値は `[]` で、`status` は `idle` / `loading` / `failed` を取る (`useTranscript.ts:68-69`)
  - 検索のバーは、語があって件数が 0 なら空の状態を出す (`ConversationSearchBar.tsx:50-60`)。取得の状態を見ない。検索のボタンも、常に押せる
  - `ConversationSearch.test.tsx` の transcript は `status: 'ready'` だけで (`:42,225,274`)、取得中・失敗のケースは 0 件
- **同種事象探索**: `loading|failed|status` (`ConversationSearch.test.tsx`) で 9 件。どれも取得中・失敗の検索を確かめるものではない。provider に取得の状態を渡す箇所は 0 件
- **リスク/影響**:
  - 取得に失敗した会話に「一致は無い」と答え、次の操作を「語を変える」と案内してしまう。回復の操作 (取り直す) は本体の側にしか無い
  - 取得中に入れた語の件数が、0 から急に増える
  - design-gate R4 の M-03 / po M-003 が未着手のまま
- **推奨アクション**: 次のどちらかにし、US-2 に AC を 1 つ、`ConversationSearch.test.tsx` に取得中・失敗の 2 ケースを足す
  - `PastCenter` から provider に `status` を渡し、`loading` / `failed` の間は空の状態の代わりに「会話を読み込んでいます…」「会話を読み込めなかったため検索できません」を出す
  - その間は検索のボタンを無効にする
- **根拠**: PO-4 / PO-6 / spec FR-008 (なぜ空かを示す)
- **scope 根拠**: feature

### [Medium] Command palette は画面に入口が無く、Ctrl+K を知らない利用者には届かない。Ctrl+F も、画面に見える手がかりが無い (M-003) (scope: feature)

- **観察**:
  - 本番のコードで palette を開くのは、Ctrl+K の keydown の 1 か所だけである (`src/renderer/src/features/shell/CommandPalette.tsx:79-89`)。`setPaletteOpen(true)` は本番のコードに `:83` の 1 件だけで、ほかは `stores/ui.test.ts:61,71`
  - サイドバーにも中央のヘッダにも、palette を開くボタンやショートカットの表記は無い (`shell/labels.ts:52-65` にそのためのキーが無い)
  - 検索のボタンには `aria-keyshortcuts="Control+F"` が付いた (`ConversationSearchBar.tsx:78`) が、`title` は「会話内を検索」だけで (`:77`)、見える人にはショートカットが分からない
  - US-3 の Why は「入口を 1 つにまとめる」(`spec.md:149`)
- **同種事象探索**: `setPaletteOpen\(true\)|Control\+K|Ctrl\+K|aria-keyshortcuts` (`src/renderer/src`) で、本番のコードは 2 件 (`CommandPalette.tsx:83` / `ConversationSearchBar.tsx:78`)。palette の見える入口は 0 件
- **リスク/影響**:
  - P2 の Story の価値が、ショートカットを知っている利用者にしか届かない
  - US-3 を価値の点から確かめる観測 (L-004) も無い
  - design-gate R4 の M-05 は、Ctrl+F の支援技術向けだけ解消した
- **推奨アクション**:
  - 検索のボタンの `title` を「会話内を検索 (Ctrl+F)」にする
  - palette には、サイドバーの上端に「コマンド (Ctrl+K)」のボタンを足す (`aria-keyshortcuts="Control+K"`)。足さないなら、理由と持ち主を spec の Out of Scope に書く
- **根拠**: PO-6 / PO-1 / spec US-3 Why
- **scope 根拠**: feature

### [Medium] 会話内検索の 0 件の文言が対象の範囲 (tool の入出力・Reasoning を除く) を示さないので、tool の出力にある語を探した利用者は「無い」と誤解する (M-004) (scope: feature) [new]

- **観察**:
  - 走査の対象は `text` part だけである (`src/renderer/src/features/chat/conversation-search.ts:63`。spec FR-004 は [ASSUMED]。`spec.md:233`)
  - 0 件の文言は「一致する箇所はありません。」と「語を変えるか、検索を閉じてください。」で (`src/renderer/src/features/chat/labels.ts:102-103`)、範囲を言わない
  - 対照: Thread search の 0 件の文言は「読み込み済みのセッションに…」と範囲を示す (`src/renderer/src/features/session-list/labels.ts:208`)
  - FR-008 は「なぜ空か」を示すことを求めている (`spec.md:255`)
- **同種事象探索**: 空の状態の文言で範囲を示す語 (`読み込み済み|対象|除く`) を labels で探した。Thread search は 1 件 (`session-list/labels.ts:208`)、会話内検索は 0 件
- **リスク/影響**:
  - Claude Code の transcript は、tool の入出力 (Bash のコマンド・ファイルのパス・エラーの文) が大きな部分を占める。「どこでそのファイルを触ったか」を探す US-2 の典型の使い方で、利用者は誤って「無い」と結論する
  - [ASSUMED] の範囲の判断を O-9 に送るなら、その間の誤解を文言で防ぐ必要がある
- **推奨アクション**:
  - `searchNone` を「会話の本文 (tool の入出力と Reasoning を除く) に一致する箇所はありません。」にし、data-model §5 の正本も合わせる
  - バーの placeholder にも範囲を短く示すことを検討する
- **根拠**: PO-4 / PO-6 / spec FR-004・FR-008 / SC-004
- **scope 根拠**: feature。`chat/labels.ts` と data-model §5 で直せる

### [Medium] (H) US-4 を renderer → preload → main と通しで確かめるテストが無く、起動元の欠落・未知も main のログに残らない (M-005) (scope: feature)

- **観察**:
  - preload は起動元を 2 つめの引数で渡すようになった (`src/preload/index.ts:59`)。ただし、これを確かめるテストは無い (`src/preload/**/*.test.*` は 0 件)
  - E2E に US-4 のケースは無い (`e2e/` を `launch-usage|プリセットを適用|getLaunchUsage|origin` で探して、関係するものは 0 件。当たった 1 件 `launch-dialog.spec.ts:115` は X-4 の既存のテストの題)
  - E2E の fake (`e2e-capability.ts:593-597`) は配線されたが、それを読むテストが無い
  - main は起動元の欠落・未知を「記録しない」と扱い、何もログに出さない (`src/main/app/session-ipc.ts:161-163`)
- **同種事象探索**: 次の 2 つ
  - `src/preload/**/*.test.*`: 0 件
  - `e2e/` の上の式: US-4 の E2E は 0 件
- **リスク/影響**:
  - preload の 1 行が将来戻っても、型検査・単体・component はすべて緑のまま (引数の少ない arrow は代入規則で通る。design-gate R4 の追加事実)、プリセットの欄は「まだ記録がありません」になる
  - その症状は「起動していない」と区別できず、原因も残らない。AD-041 (h) が預けた計測経路が黙って止まる
  - 今は preload が正しいので、実害ではなくカバレッジの穴にとどまる (Medium に据え置く)
- **推奨アクション**:
  - `e2e/launch-dialog.spec.ts` に 1 ケース足す: プリセットを適用して起動 → ダイアログを開き直す → 「プリセットを適用 1 回 / 適用なし 0 回」が出る
  - E2E を足さないなら、次の 2 つの両方を入れる
    - preload の構造のテスト (第 2 引数を invoke に渡す)
    - `handleLaunchSession` が欠落・未知を理由キー (`origin-missing` / `origin-unknown`) だけで `console.warn` に出すこと
- **根拠**: base H (検出できるテスト・観測点) / PO-2 / SC-005
- **scope 根拠**: feature

### [Low] AC / SC と画面の文言の語が揃っていない (「手動」と「適用なし」、SC-004 の「語を消す操作」) (L-001) (scope: feature)

- **観察**:
  - US-4 AC2 は「手動」(`spec.md:175`。ほかに AC4・AC8 も同じ語)。画面の文言は「適用なし」(`src/renderer/src/features/session/labels.ts:477-478`)
  - SC-004 は「語を消す操作」(`spec.md:336`)。実装と FR-008 は「検索と絞り込みをすべて解除する」(`session-list/labels.ts:210`、`spec.md:256`)
  - AC3 (`spec.md:176`) に、受け付けた後に失敗して再試行した起動は別の 1 回に数える (FR-010) ことが無い
- **同種事象探索**: `手動` (spec.md の US-4) で 5 件 / `語を消す操作` で 1 件
- **推奨アクション**:
  - AC の語を画面の文言に揃える
  - SC-004 を「語と絞り込みをすべて解除する操作」にする
  - AC3 の後に「受け付けた後に失敗して再試行した起動は 2 回に数える」を足す
- **根拠**: PO-3

### [Low] 記録が 31 日より前の日にだけあるときも「まだ記録がありません。」と出る (L-002) (scope: feature)

- **観察**:
  - `ok` で 2 つの回数がどちらも 0 のときは、`usageEmpty`「まだ記録がありません。」を出す (`PresetPanel.tsx:220-224`、`session/labels.ts:481`)
  - 刈り込みは鍵の数で行うので、使う日が疎らなら 30 日より前の記録も残る (data-model §4)
- **同種事象探索**: `usageEmpty` (src) で 3 件 (`labels.ts:481-482` / `PresetPanel.tsx:222-223`)
- **推奨アクション**: 文言を「直近 30 日の起動はありません。」にする
- **根拠**: PO-3

### [Low] palette は候補を 50 件で切ったことを示さない。0 件の文言が「操作」だけを言い、セッションの候補も探したことが伝わらない (L-003) (scope: feature)

- **観察**:
  - 上限は `PALETTE_MAX_CANDIDATES = 50` で、切るだけである (`palette-commands.ts:98,236-239`)。`shell/labels.ts:52-65` に、切ったことを示すキーが無い
  - `paletteNone` は「一致する操作はありません。」(`:55`) で、セッションの候補も探したことに触れない
  - 過去の一覧は数百件ある (`plan.md:28`)
- **同種事象探索**: `PALETTE_MAX_CANDIDATES` で 4 件 (`palette-commands.ts:39,98,226,236-239`)
- **推奨アクション**:
  - 切ったときは「ほか N 件。語を足して絞り込んでください」を 1 行出す
  - 0 件の文言を「一致する操作やセッションはありません。」にする (US-3 AC6 の字面も合わせる)
- **根拠**: PO-4 / PO-3

### [Low] US-3 の価値を確かめる観測が quickstart V-3 に無い (L-004) (scope: feature)

- **観察**: V-3 (`quickstart.md:29-36`) にある palette の確認は IME の 1 行 (`:31`) だけである。US-1 には価値の観測 (`:34`) がある
- **同種事象探索**: `palette|Ctrl\+K` (quickstart.md) で 1 件 (`:31`)
- **推奨アクション**: V-3 に「サイドバーと設定を開かずに、palette から目当てのセッションを開き、設定の項目を開けたか」を足す
- **根拠**: PO-1

### [Low] Thread search の件数が範囲を示さない。最初の取得の間に語を入れると、空の状態は出ずに「0 件が一致」だけが読み上げられる (L-005) (scope: feature)

- **観察**:
  - 件数は `searchCount(matchedCount)`「{n} 件が一致」で (`SessionListScreen.tsx:1131`、`session-list/labels.ts:204`)、段階取得の途中でも「読み込み済みの範囲」を言わない
  - 索引が `null` (最初の取得の間) のとき、`buildSessionRows` は空を返す (`rows.ts:86`)。その間は `emptyNotice` が `null` なので空の状態は出ず (`SessionListScreen.tsx:1087`)、live region (`:873-879`) は「0 件が一致」を読み上げる
- **同種事象探索**: `searchCount` (src) で 2 件 (`labels.ts:204` / `SessionListScreen.tsx:1131`)
- **推奨アクション**:
  - 索引が `null` の間は件数を出さない
  - `coverage` が `complete` でないときは、件数に「(読み込み済みの範囲)」を添える
- **根拠**: PO-4

### [Low] 所在がすべて読めないときに語を入れると、`search-empty` が `all-unlisted` を隠し、出口が「解除」になる (L-006) (scope: feature)

- **観察**:
  - `search-empty` は 2 番目、`all-unlisted` は 5 番目に判定する (`SessionListScreen.tsx:1094,1100`)
  - 登録フォルダの区画は行が 0 件でも作られるので、語を入れれば区画が 0 になり `search-empty` が出る
  - 既存の `filtered-out` も、同じく `all-unlisted` より先に判定する (`:1096`)。前例には揃っている
- **同種事象探索**: `search-empty` (`SessionListScreen.tsx`) で 3 件 (`:702,1094,1321`)
- **推奨アクション**: 次のどちらかにする
  - `total === 0` のときは `search-empty` を飛ばして、索引の状態を出す
  - 前例に揃えたまま、data-model §1 の空の状態の表に「受け入れた判断」として理由を 1 行書いて閉じる
- **根拠**: PO-4 / PO-6

### [Low] (H) E2E の偽の capability が過去の一覧に 6 行を返すようになったことが、O-8 に送る「基準の変化」に記録されていない (L-007) (scope: feature)

- **観察**:
  - BE-010 で、E2E の過去の一覧は空から固定の索引 (6 行) になった (`src/main/app/e2e-capability.ts`。`e2e/sidebar-screenshot.spec.ts:13`)
  - roadmap を `固定の索引|過去の一覧に|BE-010|6 行|e2eSessionIndex|偽の capability|固定データ` で探して 0 件。O-8 の行に並ぶ基準の変化は、検索欄の描画だけである (`docs/roadmap.md:345,349` の「検索欄」)
- **同種事象探索**: 上の式で `docs/roadmap.md` に 0 件
- **リスク/影響**: `e2e/multi-session.spec.ts` の負荷計測 (long task の件数) の比較の基準が、記録の無いまま変わる。O-8 がその件数を比べるときに原因を取り違える
- **推奨アクション**: roadmap の O-8 の行に「O-3 で E2E の偽の capability が過去の一覧に 6 行を返すようになった (BE-010)」を足す
- **根拠**: base H (比較の基準の維持)

## 同種事象探索 cascade summary

件数の列は、その行の検索に当たった行の数 (整数 1 つ)。ほかの数と補足は path:line の列に移した。指摘の本文と重大度は変えていない。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | Glob `e2e/*.spec.ts` と `playwright test e2e/` (`.github/workflows/verify.yml`) を突き合わせ、CI から実行されない spec を数えた | 1 | e2e/sidebar-screenshot.spec.ts:81,89。参考: CI が流すのは verify.yml:139,145,159,164 の 4 本だけ。Glob `e2e/**/*.png` に sidebar の基準画像は無い (あるのは e2e/composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png だけ)。`.pr-gate.diff` に `.github` の差分は無い。specs/012 の *.md に `verify.yml` は無い |
| M-001 | `usageUnreadableHint\|newer-version\|storeNewerVersion` (src。Read で確認) | 7 | session/labels.ts:485 / PresetPanel.tsx:218 / launch-usage-service.ts:55,75,78 / launch-usage-store.ts:50,159。参考: renderer で将来版と読めないを区別する分岐は無い |
| M-002 | `loading\|failed\|status` (ConversationSearch.test.tsx) | 9 | ConversationSearch.test.tsx:42,213,214,225,235,264,274,284,285。参考: どれも取得中・失敗の検索のケースではない。CenterPane.tsx:155,175 / useTranscript.ts:68-69 / ConversationSearchBar.tsx:50-60 |
| M-003 | `setPaletteOpen\(true\)\|aria-keyshortcuts` (src/renderer/src。*.test.* を除く) | 2 | CommandPalette.tsx:83 / ConversationSearchBar.tsx:78。参考: palette を開く見える入口は無い (shell/labels.ts:52-65) |
| M-004 | 会話内検索の 0 件の文言 (`searchNone\|searchNoneHint`。chat/labels.ts) のうち、対象の範囲を示すもの | 0 | chat/labels.ts:102-103 / conversation-search.ts:63。参考: Thread search の文言は範囲を示す (session-list/labels.ts:208) |
| M-005 | Glob `src/preload/**/*.test.*` | 0 | src/preload/index.ts:59 / session-ipc.ts:161-163 / e2e-capability.ts:593-597。参考: `e2e/` を `launch-usage\|プリセットを適用\|getLaunchUsage\|origin` で探すと US-4 に関係する当たりは無い (当たった e2e/launch-dialog.spec.ts:115 は既存の題) |
| L-001 | `手動` (spec.md の Clarifications と US-4) | 5 | spec.md:87,175,177,180,181。参考: 画面の文言は session/labels.ts:477-478、SC-004 の「語を消す操作」は spec.md:336、AC3 は spec.md:176 |
| L-002 | `usageEmpty` (session/labels.ts・PresetPanel.tsx) | 4 | session/labels.ts:481,482 / PresetPanel.tsx:222,223 |
| L-003 | `PALETTE_MAX_CANDIDATES` (palette-commands.ts) | 6 | palette-commands.ts:39,98,226,236,238,239。参考: 0 件の文言は shell/labels.ts:55 |
| L-004 | `Ctrl\+K` (quickstart.md の V-3) | 1 | quickstart.md:31 |
| L-005 | `searchCount` (session-list/labels.ts・SessionListScreen.tsx) | 2 | session-list/labels.ts:204 / SessionListScreen.tsx:1131。参考: rows.ts:86 / SessionListScreen.tsx:873-879,1087 |
| L-006 | `search-empty` (SessionListScreen.tsx) | 4 | SessionListScreen.tsx:702,1027,1094,1321。参考: 判定の順は :1096,1100 |
| L-007 | `固定の索引\|過去の一覧に\|BE-010\|6 行\|e2eSessionIndex\|偽の capability\|固定データ` (docs/roadmap.md) | 0 | docs/roadmap.md:345,349 (O-8 の行に並ぶ基準の変化は「検索欄」だけ) |

<!-- invoker note: 上の表は po-reviewer が invoker の依頼 (件数の列を整数 1 つに) に応じて返し直したもの。初回の返り値の表は件数の列が複合表記で、cascade_enforce が読めなかった。指摘の本文と重大度は初回の返り値のまま -->

## Verdict

- Critical: 1
- High: 0
- Medium: 5
- Low: 7

参考 (pr-gate R1 のため Round inheritance の行は書かない。design-gate R4 の po の指摘との対応):
- 解消: 2 件 (M-004・L-008)。L-009 は quickstart V-2 で解消。design-gate L-35 も解消
- 一部だけ解消: M-005 → 本 Round の M-003
- 未解消: design-gate の po の指摘からは、次の 9 件が実装に入った
  - M-002 → M-001
  - M-003 → M-002
  - M-006 → M-005
  - L-001〜L-007 → 本 Round の L-001〜L-007
- 新規: 2 件 (C-001・M-004)

### 関連ファイル

- C:\dev\closta\.github\workflows\verify.yml
- C:\dev\closta\e2e\sidebar-screenshot.spec.ts
- C:\dev\closta\playwright.config.ts
- C:\dev\closta\specs\012-ui-thread-search\spec.md
- C:\dev\closta\specs\012-ui-thread-search\quickstart.md
- C:\dev\closta\specs\012-ui-thread-search\quickstart-results.md
- C:\dev\closta\specs\012-ui-thread-search\tasks.md
- C:\dev\closta\src\main\app\launch-usage-service.ts
- C:\dev\closta\src\main\infra\settings\launch-usage-store.ts
- C:\dev\closta\src\main\app\session-ipc.ts
- C:\dev\closta\src\preload\index.ts
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\renderer\src\features\session\PresetPanel.tsx
- C:\dev\closta\src\renderer\src\features\shell\CenterPane.tsx
- C:\dev\closta\src\renderer\src\features\shell\CommandPalette.tsx
- C:\dev\closta\src\renderer\src\features\shell\palette-commands.ts
- C:\dev\closta\src\renderer\src\features\shell\labels.ts
- C:\dev\closta\src\renderer\src\features\chat\ConversationSearchBar.tsx
- C:\dev\closta\src\renderer\src\features\chat\ConversationSearchProvider.tsx
- C:\dev\closta\src\renderer\src\features\chat\conversation-search.ts
- C:\dev\closta\src\renderer\src\features\chat\labels.ts
- C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx
- C:\dev\closta\src\renderer\src\features\session-list\labels.ts
- C:\dev\closta\docs\roadmap.md
- C:\dev\closta\docs\decisions\0038-e2e-screenshot-harness.md
