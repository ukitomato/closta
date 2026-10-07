# po-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07 (時刻は取得していない。正確なのは日付だけ)
**Reviewer**: po-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - 本 Round の差分 (9d98c39..a4c37a8) が触るもの:
    - FR-018 / SC-008: CI のステップ、撮る前のスクロール、基準画像
    - FR-001: 検索欄の placeholder (data-model §5 の文言)
  - Round 1 から引き継ぐもの: US-1〜US-4 の FR-001〜FR-018 / SC-001〜SC-008。Round 1 の指摘の対象で、本 Round の差分はそのコードを変えていない
- touched files に該当する charter / Confirmation:
  - ui charter の KPI「日本語の健全性」: 日本語を含むスクリーンショット比較が CI に存在する (`docs/domains/ui/charter.md:162-163`)
  - ui charter In scope の O-3 の例外 (`:53-59`)
  - AD-038 D5 (`docs/decisions/0038-e2e-screenshot-harness.md:85-88`): 初回の基準画像の見た目が妥当かは人が判断する。判断は後に回してよく、quickstart に記録する
  - AD-038 Confirmation (`:111`)
  - Constitution VIII (B) (`.specify/memory/constitution.md:641`): 残るのは人の最終 aesthetic 承認 (rubber-stamp) だけで、機能を止める条件ではない
  - O-7 から預かった義務 (iii) (`spec.md:59`)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の Owner 範囲。AD-038 D5 は M-006 の根拠として引くだけで、drift の判定はしない
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:5 Low:7
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の Owner 範囲
- G. optional reviewer 範囲: 該当なし: po-reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:2

## スコープ要約

本 Round の差分は 9 ファイル (gate の成果物は除く):
- `verify.yml` に 1 ステップ
- `e2e/sidebar-screenshot.spec.ts` に撮る前のスクロールと、写る範囲の assert
- 基準画像 1 枚
- placeholder の短縮 (`session-list/labels.ts` / data-model §5)
- quickstart-results の訂正と V-4
- Vitest の timeout 20s (`vitest.config.ts`)
- touched-files

**Round 1 の C-001 は解消した。** 根拠は次のとおり。
- CI が spec を流す:
  - `verify.yml:171-172` に「e2e (サイドバーの過去のセッションの区画)」がある
  - Glob `e2e/**/*.spec.ts` は 5 件、`playwright test` の行も 5 件 (`verify.yml:139,145,159,164,172`)。CI から流れない spec は 0 件
- 基準画像がある:
  - Glob で `e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png` を確認した
  - Read で見えた範囲 (観察であり、承認ではない):
    - 区画の見出し「過去のセッション」
    - 検索欄。placeholder「題・ブランチ・フォルダなど」は欄の中に収まっている
    - グループの見出し「E2E Project / 同じ所在 / 3 件」
    - 行 3 件。題・`e2e` の札・「WSL（由来の所在から判定）」・ブランチ・タグ・大きさが出ている
    - 右端にスクロールバー、下端に次のグループの枠の上端
  - FR-018 が対象とする 4 つ (見出し・検索欄・グループの見出し・行) はすべて写っている
- spec が、写る範囲を撮る前に確かめる: `sidebar-screenshot.spec.ts:96-97` が、最初のグループの見出しと最初の行が欠けずに見えることを `toBeInViewport({ ratio: 1 })` で確かめる。Round 1 の後の最初の artifact は、見出しまでで行が写っていなかった。この不足を spec 自身が検出できるようになった
- HEAD で緑 (invoker の CI の観察): run 37565959731 (a4c37a8) で 6 つの e2e ステップがすべて success。基準画像の入った最初の run は 37553390941
- `quickstart-results.md:19-22` は「CI の e2e job で通す」が事実と違ったことを訂正した

残った問題:
- 基準画像を人が目で見る判断 (D5) の置き場が無い: M-006
- 記録の文が、今のリポジトリの状態と逆になった: L-008
- 高さの E2E が AC7 の前提を確かめない: L-009 (新規)
- Round 1 の Medium 5 件と Low 7 件: 対象のファイルが本 Round で変わっておらず、すべて未解消

既存の振る舞いを壊していない根拠:
- CI (invoker の観察): HEAD の verify (node 24) は success、e2e の 6 ステップもすべて success
- placeholder の変更を固定する component テストは無い (`getByPlaceholder|searchPlaceholder` を src で探すと、テストは 0 件)。いまは基準画像の比較がこれを守る
- Vitest の timeout を 20s にした変更は、私の Owner 範囲 (SC の判定) に影響しない。SC-002 は走査の関数の呼び出し回数で判定し、時間は参考値として出すだけ (`spec.md:334`)

## Findings

### [Medium] サイドバーの基準画像は人の目を通らないまま、CI の描画を基準にしている。目視は記録先の無い「朝に利用者が確かめる項目」に送られ、quickstart.md に承認の手順が無い (M-006) (scope: feature) [new]

- **観察**:
  - `specs/012-ui-thread-search/quickstart-results.md:90-93` の記録:
    - run 37546036334 の actual を「main が確かめ」てコミットした
    - 承認は、利用者の事前の指示「承認 OK としてマージして次に進めたい」で扱った
    - 「画像そのものの目視は朝に利用者が確かめる項目に残す」
  - 「朝に利用者が確かめる項目」の置き場は無い:
    - `朝` でリポジトリの `*.md` を探すと 7 件。012 は `quickstart-results.md:93` の 1 件だけ
    - 残りは 010 の gate の記録。010 では同じ形 (記録先の無い「朝の確認項目」) が po M-101 (Medium) として指摘されていた (`specs/010-session-monitoring-view/pr-gate.md:53`)
  - 手順の正本 `specs/012-ui-thread-search/quickstart.md` に、基準画像を承認する段が無い (`基準画像` で 0 件。V-1〜V-3 だけ)
    - 先例は `specs/006-ui-japanese-ime-composer/quickstart.md:25-26` と `specs/013-ui-app-shell/quickstart.md:24`。どちらも承認の段を持つ
    - design-gate の M-27 (`design-gate.md:85`) が同じ欠落を unresolved のまま残した
    - pr-gate R1 C-001 の推奨 3「quickstart に承認の行を足す」(`pr-gate.md:34`) も手が付いていない
  - 記録どうしが食い違う:
    - V-4 の見出しは「— 未実施」(`quickstart-results.md:74`)、本文の最後は「承認済みとして扱った」(`:92-93`)
    - `.github/workflows/verify.yml:168-169` は「actual を利用者が承認してから commit する」と書くが、実際は目視の前にコミットした
- **同種事象探索**: `基準画像` (`specs/**/quickstart.md`) で 4 件 (006 quickstart.md:25,26,49 / 013 quickstart.md:24)。012 の quickstart.md は 0 件
- **リスク/影響**:
  - SC-008 の後半「日本語の並びを画像で守る」は、人が基準画像を妥当と判断して初めて意味を持つ。今の判定は CI の描画を CI の描画と比べているだけである
  - 目視をしないまま PR が閉じても、止めるものが無い。V-4 は quickstart-results に「未実施」と残るだけで、/cl-done の前提にも roadmap にも現れない
  - 目視で直すべき点が見つかったときの取り直しの手順も無い
  - Constitution:641 が人の承認を機能を止める条件にしていないので、High にはしない
- **推奨アクション**:
  1. quickstart.md に V-4 を足す。内容は次の 3 つ:
     - `e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png` を開いて見る
     - 区画の見出し・検索欄 (placeholder が切れない)・グループの見出し・行の日本語の並び (全角の行送り・折返し・字幅の揃い) を承認し、quickstart-results に記録する
     - 直すときは、CI のステップが落ちた回の artifact から取り直す
  2. quickstart-results の V-4 を 2 行に分け、見出しの「未実施」が何を指すかを明らかにする
     - 「コミット: 済 (ddc052e。run 37546036334 の actual)」
     - 「利用者の目視: 未実施 (事前の承認の指示だけ)」
  3. 目視の行き先を 1 か所に決める。例: PR の説明のチェックリスト、または /cl-done の前に確かめる項目として quickstart-results の冒頭。「朝に利用者が確かめる項目」と書き続けるなら、その一覧の置き場を作る
- **根拠**: PO-2 / PO-3 / base H / AD-038 D5 (`0038:85-88`) / Constitution VIII (B) (`constitution.md:641`) / design-gate M-27
- **scope 根拠**: feature。`quickstart.md` / `quickstart-results.md` と verify.yml のコメントで閉じる

### [Medium] 将来版のファイルでも「次に起動ダイアログを開いたときに読み直します」と出るが、読み直しは起きない (M-001) (scope: feature) [unresolved from R1]

- **観察**: Round 1 と同じ。HEAD でも次のとおりで、本 Round の差分はこれらのファイルを変えていない
  - 文言は `src/renderer/src/features/session/labels.ts:485`
  - `src/renderer/src/features/session/PresetPanel.tsx:218` が、将来版と読めないを区別せず同じヒントを出す
  - 読み直すのは `src/main/app/launch-usage-service.ts:65` の `unloaded` のときだけ
- **同種事象探索**: `usageUnreadableHint` (`src/renderer/src/features`) で 2 件 (`session/labels.ts:485` / `PresetPanel.tsx:218`)
- **リスク/影響 / 推奨アクション**: Round 1 のとおり (`po-reviewer.pr-gate.round1.md:107-122`)。pr-gate R1 では Medium #1 に dedup された
- **根拠**: PO-4 / PO-6 / US-4 AC4・AC5 / FR-012
- **scope 根拠**: feature

### [Medium] 過去ログの取得中と取得の失敗の間も会話内検索が開き、「一致する箇所はありません」と出る (M-002) (scope: feature) [unresolved from R1]

- **観察**: `src/renderer/src/features/shell/CenterPane.tsx:175` は provider に `transcript.messages` だけを渡す (`transcript.status` を渡す箇所は 0 件)。`ConversationSearchBar.tsx:50-60` は取得の状態を見ない
- **同種事象探索**: `transcript\.(messages|status)` (CenterPane.tsx) で 1 件 (`:175`)
- **リスク/影響 / 推奨アクション**: Round 1 のとおり (`po-reviewer.pr-gate.round1.md:124-140`)。pr-gate R1 Medium #2
- **根拠**: PO-4 / PO-6 / FR-008
- **scope 根拠**: feature

### [Medium] Command palette は画面に入口が無い。Ctrl+F も見える手がかりが無い (M-003) (scope: feature) [unresolved from R1]

- **観察**: 本番のコードで palette を開くのは `src/renderer/src/features/shell/CommandPalette.tsx:83` の 1 か所だけ。`ConversationSearchBar.tsx:78` の `aria-keyshortcuts` は支援技術向けで、目で見える表記は無い
- **同種事象探索**: `setPaletteOpen\(true\)|aria-keyshortcuts` (`src/renderer/src`) で 4 件。本番 2 件 (`CommandPalette.tsx:83` / `ConversationSearchBar.tsx:78`)、テスト 2 件 (`stores/ui.test.ts:61,71`)
- **リスク/影響 / 推奨アクション**: Round 1 のとおり (`po-reviewer.pr-gate.round1.md:142-158`)。pr-gate R1 Medium #4
- **根拠**: PO-6 / PO-1 / US-3 Why
- **scope 根拠**: feature

### [Medium] 会話内検索の 0 件の文言が、検索の対象の範囲 (tool の入出力と Reasoning を除く) を示さない (M-004) (scope: feature) [unresolved from R1]

- **観察**:
  - 会話内検索の文言 `src/renderer/src/features/chat/labels.ts:102-103` は範囲を示さない
  - 対照: Thread search の文言は範囲を示す。本 Round の差分で行がずれ、今は `src/renderer/src/features/session-list/labels.ts:212`
- **同種事象探索**: 会話内検索の 0 件の文言のうち、範囲を示すもの 0 件 (`chat/labels.ts:102-103`)
- **リスク/影響 / 推奨アクション**: Round 1 のとおり (`po-reviewer.pr-gate.round1.md:160-175`)。pr-gate R1 Medium #3
- **根拠**: PO-4 / PO-6 / FR-004・FR-008 / SC-004
- **scope 根拠**: feature

### [Medium] (H) US-4 を renderer → preload → main と通しで確かめるテストが無く、起動元の欠落・未知が main のログに残らない (M-005) (scope: feature) [unresolved from R1]

- **観察**:
  - preload のテストは 0 件 (Glob `src/preload/**/*.test.*`)
  - `src/main/app/session-ipc.ts:161-163` は起動元の欠落・未知をログに出さない
  - 本 Round の e2e の差分は US-4 に触れていない
- **同種事象探索**: Glob `src/preload/**/*.test.*` で 0 件
- **リスク/影響 / 推奨アクション**: Round 1 のとおり (`po-reviewer.pr-gate.round1.md:177-197`)。pr-gate R1 Medium #15
- **根拠**: base H / PO-2 / SC-005
- **scope 根拠**: feature

### [Low] quickstart-results と verify.yml のコメントが「基準画像はまだコミットしていない・ステップは落ちる」と書いたままで、コミットの後に CI が通ったこと (V-4 が自ら求める記録) が無い (L-008) (scope: feature) [new]

- **観察**:
  - 今の状態と逆のことを書いている 4 か所:
    - `specs/012-ui-thread-search/quickstart-results.md:23-24`「基準画像をコミットするまでこのステップは落ちる。…(下の V-4。未了)」
    - `quickstart-results.md:76-77`「基準画像 … はまだコミットしていない。… コミットするまで基準画像が無くて落ちる」
    - `.github/workflows/verify.yml:169-170`「commit するまで本ステップは基準画像が無くて落ちる」
  - 事実:
    - 基準画像はリポジトリにある (Glob で確認)
    - invoker の CI の観察では、run 37553390941 (ddc052e) と 37565959731 (a4c37a8 = HEAD) でこのステップが success
  - 記録の不足:
    - V-4 の「記録すること」(`quickstart-results.md:81-82`) は、コミットの後の CI でこのステップ (基準画像と高さの 2 ケース) が通ったことの記録を求める
    - spec dir を 2 つの run の番号で探すと 0 件
- **同種事象探索**: `コミットするまで|まだコミットしていない|commit するまで|未了` (quickstart-results.md・verify.yml) で 6 件
  - 基準画像に関するもの 4 件: `verify.yml:169` / `quickstart-results.md:24,76,77`
  - 残りの 2 件 (`:29` / `:50`) は別の事柄
- **リスク/影響**:
  - SC-008 の「FR-018 の基準画像の比較が CI で通る」の証跡が、spec の記録に無い
  - Round 1 の C-001 は、記録が事実より楽観的だったことを指摘した。今度は事実より悲観的で、朝に V-4 を読む利用者は基準画像を取り直す必要があると誤解しうる
- **推奨アクション**:
  - 上の 4 か所を事実に合わせる (「ddc052e でコミットした」)
  - V-4 に「コミットの後の CI: run 37553390941 (ddc052e) と 37565959731 (a4c37a8) で 2 ケースとも success」を足す
  - verify.yml のコメントは、いつ読んでも正しい手順の形にする (例:「基準画像を取り直すときは、このステップが落ちた回の artifact から取り、利用者の承認の後にコミットする」)
- **根拠**: PO-2 (計測の経路とその記録) / Round 1 C-001 の推奨 4
- **scope 根拠**: feature

### [Low] (H) 高さの確認の E2E が、AC7 の前提 (稼働中の区画が上限まで伸び、過去の区画が最小の高さまで縮んだ) が成り立ったことを確かめない (L-009) (scope: feature) [new]

- **観察**:
  - `e2e/sidebar-screenshot.spec.ts:107-147` の流れ: 既定のウィンドウで 10 本を起動して compact にし、見出しと検索欄が区画の中にあること、最初の行にスクロールで届くことを確かめる
  - 前提の assert が無い:
    - 過去の区画が最小の高さ (6rem。`spec.md:91,221`) まで縮んだこと
    - 稼働中の一覧がスクロールする (上限に達した) こと
    - `最小|上限|6rem|min-h|clientHeight|scrollHeight` で sidebar-screenshot.spec.ts は 0 件
  - 先例: `e2e/multi-session.spec.ts:233` は `list.scrollHeight > list.clientHeight` で、一覧がスクロールすることを確かめている
- **同種事象探索**: 上の式で `e2e/sidebar-screenshot.spec.ts` に 0 件
- **リスク/影響**:
  - 次のどれかが変わると、過去の区画が縮まなくなってもこのテストは緑のまま通る。そのとき SC-008 の前半 (縮んでも探せる) はどこでも判定されない
    - CI の画面の高さ
    - compact の行の高さ
    - 稼働中の区画の上限 (O-4〜O-6 がシェルを変える)
  - 今の CI でこの前提が成り立っているかも、記録からは分からない
- **推奨アクション**: 見出しと検索欄を確かめる前に、次の 2 つを assert する
  - 過去の区画の高さが最小の高さ (1px の丸めを許す) か、区画の中身が `scrollHeight > clientHeight` であること
  - 稼働中の一覧がスクロールすること
- **根拠**: base H (指摘を検出できるテスト) / PO-3 (AC の Given を確かめる)
- **scope 根拠**: feature

### [Low] AC / SC と画面の文言の語が揃っていない (L-001) (scope: feature) [unresolved from R1]

- **観察**:
  - AC は「手動」(`spec.md:175,177,180,181`)、画面は「適用なし」(`session/labels.ts:477-478`)
  - SC-004 は「語を消す操作」(`spec.md:336`)、実装は「検索と絞り込みをすべて解除する」(`session-list/labels.ts:214`。本 Round で行がずれた)
- **同種事象探索**: `手動` (spec.md の Clarifications と US-4) で 5 件 (`spec.md:87,175,177,180,181`)
- **推奨アクション**: Round 1 のとおり
- **根拠**: PO-3
- **scope 根拠**: feature

### [Low] 記録が 31 日より前の日にだけあるときも「まだ記録がありません。」と出る (L-002) (scope: feature) [unresolved from R1]

- **観察**: `PresetPanel.tsx:220-224` / `session/labels.ts:481`。変わっていない
- **同種事象探索**: `usageEmpty` で 4 件 (`session/labels.ts:481,482` / `PresetPanel.tsx:222,223`)
- **推奨アクション**: Round 1 のとおり。pr-gate R1 Low #13
- **根拠**: PO-3
- **scope 根拠**: feature

### [Low] palette は候補を 50 件で切ったことを示さず、0 件の文言は「操作」としか言わない (L-003) (scope: feature) [unresolved from R1]

- **観察**: `palette-commands.ts:98,236-239` / `shell/labels.ts:55`。変わっていない
- **同種事象探索**: `PALETTE_MAX_CANDIDATES` で 6 件 (`palette-commands.ts:39,98,226,236,238,239`)
- **推奨アクション**: Round 1 のとおり。pr-gate R1 Medium #5 / Low #23
- **根拠**: PO-4 / PO-3
- **scope 根拠**: feature

### [Low] US-3 の価値を確かめる観測が quickstart V-3 に無い (L-004) (scope: feature) [unresolved from R1]

- **観察**: `quickstart.md:29-36`。palette に触れるのは `:31` の IME の 1 行だけ
- **同種事象探索**: `Ctrl\+K` (quickstart.md) で 1 件 (`:31`)
- **推奨アクション**: Round 1 のとおり
- **根拠**: PO-1
- **scope 根拠**: feature

### [Low] Thread search の件数が範囲を示さない。索引が null の間は「0 件が一致」と読み上げる (L-005) (scope: feature) [unresolved from R1]

- **観察**: `SessionListScreen.tsx:1131` / `session-list/labels.ts:208` (本 Round で行がずれた)
- **同種事象探索**: `searchCount` で 2 件 (`session-list/labels.ts:208` / `SessionListScreen.tsx:1131`)
- **推奨アクション**: Round 1 のとおり。pr-gate R1 Medium #6
- **根拠**: PO-4
- **scope 根拠**: feature

### [Low] 所在がすべて読めないときに語を入れると、`search-empty` が `all-unlisted` を隠す (L-006) (scope: feature) [unresolved from R1]

- **観察**: 判定の順は `SessionListScreen.tsx:1094` (search-empty) → `:1096` (filtered-out) → `:1100` (all-unlisted)。変わっていない
- **同種事象探索**: `'search-empty'` (SessionListScreen.tsx) で 3 件 (`:702,1094,1321`)
- **推奨アクション**: Round 1 のとおり
- **根拠**: PO-4 / PO-6
- **scope 根拠**: feature

### [Low] (H) E2E の偽の capability が過去の一覧に 6 行を返すようになったことが、O-8 の「基準の変化」に記録されていない (L-007) (scope: feature) [unresolved from R1]

- **観察**: roadmap に記録が無い (下の式で 0 件)
- **同種事象探索**: `固定の索引|BE-010|e2eSessionIndex|偽の capability` (`docs/roadmap.md`) で 0 件
- **推奨アクション**: Round 1 のとおり
- **根拠**: base H (比較の基準の維持)
- **scope 根拠**: feature

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-006 | `基準画像` (specs/**/quickstart.md) | 4 | 006 quickstart.md:25,26,49 / 013 quickstart.md:24。012 quickstart.md は 0 件。参考: `朝` (*.md) の 012 の当たりは quickstart-results.md:93 だけ。先例は 010 pr-gate.md:53 |
| M-001 | `usageUnreadableHint` (src/renderer/src/features) | 2 | session/labels.ts:485 / PresetPanel.tsx:218 |
| M-002 | `transcript\.(messages\|status)` (shell/CenterPane.tsx) | 1 | CenterPane.tsx:175 |
| M-003 | `setPaletteOpen\(true\)\|aria-keyshortcuts` (src/renderer/src) | 4 | CommandPalette.tsx:83 / ConversationSearchBar.tsx:78 / stores/ui.test.ts:61,71 |
| M-004 | 会話内検索の 0 件の文言のうち範囲を示すもの (chat/labels.ts) | 0 | chat/labels.ts:102-103。参考: session-list/labels.ts:212 |
| M-005 | Glob `src/preload/**/*.test.*` | 0 | src/preload/index.ts:59 / session-ipc.ts:161-163 |
| L-008 | `コミットするまで\|まだコミットしていない\|commit するまで\|未了` (quickstart-results.md・verify.yml) | 6 | 基準画像に関するもの: verify.yml:169 / quickstart-results.md:24,76,77。別の事柄: quickstart-results.md:29,50。参考: run 番号 `37553390941\|37565959731` は spec dir に 0 件 |
| L-009 | `最小\|上限\|6rem\|min-h\|clientHeight\|scrollHeight` (e2e/sidebar-screenshot.spec.ts) | 0 | e2e/sidebar-screenshot.spec.ts:107-147。先例: e2e/multi-session.spec.ts:233 |
| L-001 | `手動` (spec.md の Clarifications と US-4) | 5 | spec.md:87,175,177,180,181 |
| L-002 | `usageEmpty` (session/labels.ts・PresetPanel.tsx) | 4 | session/labels.ts:481,482 / PresetPanel.tsx:222,223 |
| L-003 | `PALETTE_MAX_CANDIDATES` (palette-commands.ts) | 6 | palette-commands.ts:39,98,226,236,238,239 |
| L-004 | `Ctrl\+K` (quickstart.md の V-3) | 1 | quickstart.md:31 |
| L-005 | `searchCount` (session-list/labels.ts・SessionListScreen.tsx) | 2 | session-list/labels.ts:208 / SessionListScreen.tsx:1131 |
| L-006 | `'search-empty'` (SessionListScreen.tsx) | 3 | SessionListScreen.tsx:702,1094,1321 |
| L-007 | `固定の索引\|BE-010\|e2eSessionIndex\|偽の capability` (docs/roadmap.md) | 0 | docs/roadmap.md |

## Verdict

- Critical: 0
- High: 0
- Medium: 6
- Low: 9
- Round inheritance: resolved from 1: 1 (C-001) / unresolved: 12 (M-001〜M-005・L-001〜L-007) / new: 3 (M-006・L-008・L-009)

補足:
- 未解消の 12 件の重大度は Round 1 から変えていない
- pr-gate R1 の dedup 先:
  - Medium: M-001 → #1 / M-002 → #2 / M-004 → #3 / M-003 → #4 / M-005 → #15
  - Low: L-003 → Medium #5 と Low #23 / L-005 → Medium #6 / L-002 → Low #13 / L-001 → #12 / L-004 → #14 / L-006 → #15 / L-007 → #16
