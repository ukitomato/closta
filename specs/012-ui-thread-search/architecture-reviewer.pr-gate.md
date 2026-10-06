---
reviewer: architecture-reviewer
gate: pr-gate
round: 1
scope: default+adr-drift
---

# architecture-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00 (pr-gate Round 1。base `7bdb271` / HEAD `9d98c39`)
**Reviewer**: architecture-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Mode**: default + ADR-drift。ARCH-3 の照合は「ADR-drift 照合」の節に分けて書いた

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: Thread search と過去の区画の並び (`features/search/`・`SessionListScreen.tsx`)
  - FR-003〜FR-005: 会話内検索 (`features/chat/*`・`CenterPane.tsx` の provider・`RunningSessionsView.revealMessage`)
  - FR-006 / FR-007: Command palette (`features/shell/CommandPalette.tsx`・`palette-commands.ts`・`stores/ui.ts` の `paletteOpen`)
  - FR-008: Empty state
  - FR-009〜FR-013: 起動元と起動の利用記録。経路は domain `launch-usage.ts` → infra store → app service → `session-ipc.ts` → preload / renderer
  - FR-014: AD-045・Constitution XV v1.4.0・composer の文言
  - FR-015: ui-coverage F 節
  - FR-016: roadmap / charter 2 つ / glossary / _overview / prompts / discovery / 013 spec
  - FR-018: サイドバーの基準画像の E2E
  - SC-001〜SC-008 は全件読んだ。本 reviewer が主に照合したのは SC-005 / SC-006 / SC-007 / SC-008
- touched files に該当する charter / Confirmation:
  - ui charter: In scope の O-3 の例外 (:53-59)、KPI「日本語の健全性」(:162-163)、Cross-domain dependencies と「面の状態」(:170-189)、Related ADRs (:191-197)
  - session charter: KPI「再利用率」(:165-179)、Cross-domain dependencies (:181-192)、Related Specs の O-3 (:233-241)
  - `_overview.md`: 帰属の判断根拠 (:82-105)、依存関係 (:124-138)、Cross-domain invariants (:140-156)
  - glossary: Command palette (:196)、Conversation search (:209)、Launch notice (:449)、LaunchOrigin (:482)、LaunchUsage (:496)、Shell (:903-923)、Thread search (:927)
  - Constitution: 改定手順 (:343-355)、VIII Verification (:636-642)、XIII (:817-850)、XIV (:857-866)、XV (:871-900)、バージョニング方針と Amendment trail (:1047-1081)
  - ADR の Confirmation: AD-045 (:45-54)、AD-038 (:109-119)、AD-046 (:52-55)、AD-033 (:126-131)、AD-044 (:105-109)、AD-041 (h) (:148)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の領域
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の領域。起動元の厳密比較と DTO の射影は、ARCH-5 (cross-domain) の観点でだけ照合した
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:3 Low:4
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:4
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の領域。H-001 は SC-008 の計測経路にも当たるが、本 reviewer は CI 構成と AD-038 の drift として出す
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の領域。Thread search の部品の module 配置は code-gate の CONV-M-002 が持つので再指摘しない。M-001 は domain の依存の向きと charter の記述だけを見る
- G. optional reviewer 範囲: 該当なし: 永続化スキーマは database-reviewer、F 節の判断は ui-coverage-reviewer、直書きの判定は ux-reviewer の領域。直書きの件数を測り直した事実だけを H に書いた
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:1 Low:1

## スコープ要約

本 PR は O-3 の実装で、114 files を変える。
- renderer: `features/search/` (新設)・会話内検索・Command palette・過去の区画を変える
- main: 起動元の検証と、起動の利用記録の domain / infra / app を足す
- docs: Constitution v1.4.0 (XV)・AD-045 (新規。accepted)・charter 2 つ・glossary・roadmap・_overview・ui-coverage を変える

code-gate は PASS (must_fix 0) である。

design-gate R4 で本 reviewer が出した Medium 8 / Low 6 の手当てを diff で照合した。
- 解消:
  - M-105 の (b): `revealMessage` は shell が props で注入する。`ConversationSearchProvider.tsx:63-72`、`CenterPane.tsx:93-97`
  - M-103 の Constitution 側: XV に Exceptions と Verification が入った
  - L-301: glossary の起動元 (:482) と Launch notice (:452)、session charter の注記 (:174-176)
- 部分解消:
  - M-101: ui charter に palette の `select` が入った。残り 3 か所は未 → M-002
  - M-103: reviewer の側が未 → M-003
- 未解消: M-102 (→ M-005)、M-104 (→ M-004)、M-105 の (a) (→ M-001)、M-106 (→ M-006)、M-107 (→ L-008)、L-101〜L-105
- 格上げ: M-201 (基準画像の承認の手順) は、実装で事実が増えたので High に上げた (H-001)。増えた事実は次の 2 つ
  - CI がその spec を流さない
  - 基準画像が commit されていない

## Constitution 改定 (v1.3.0 → v1.4.0。Principle XV) の照合 — 改定手順 2 への入力

照合の結果を事実だけで書く。承認ではない。改定手順 2 の判断は利用者に残る。

| 照合の項目 | 結果 |
|---|---|
| 手順 1 (ADR) | AD-045 は `status: accepted` (`0045:2`)。UI labels の文 (constitution.md:877-881) は AD-045 Consequences の文案 (`0045:34`) と一致する |
| Decision 3 の例外 | XV の Exceptions に `target-finder.ts` の 2 本がある (constitution.md:891-893) |
| Verification | Automated は無し、Manual は ux-reviewer と基準線 331 行 (constitution.md:895-899)。ただし ux-reviewer の定義と発火条件が新しい規則に合っていない → M-003 |
| 手順 3 (SemVer) | MINOR。方針表の「指針の実質的な拡張」の行 (constitution.md:1052) に当たる。規則は「新たに増やさない」なので、既存の直書きは違反に変わらない。MAJOR の行には当たらない |
| 手順 4 (Amendment trail) | 1.4.0 の行がある (constitution.md:1081) |
| 手順 5 (enumeration) | XV は Standard なので必須ではない。0 件と基準線を記録している (constitution.md:27-29) |
| 基準線の再計測 | AD-045 Confirmation の式 (`0045:51`) で、HEAD の `src/renderer/src` の `*.tsx` を Grep (count) した。`*.test.tsx` を除いた合計は **331** で、基準線と同じ値 |
| 基準線の置き場 | accepted ADR の Confirmation に in-place で追記している → M-004 |
| Templates | plan-template の XV の行、roadmap の D-1 の行 (roadmap.md:385) |

## ADR-drift 照合 (ARCH-3)

accepted の ADR は 46 本ある。読んだ範囲は次のとおり。
- 全文: AD-019 / 023 / 031 / 033 / 036 / 038 / 041 / 044 / 045 / 046
- 節: AD-024 (#18 の訂正節)・AD-034 (§1 / §4)・AD-037 (D1〜D3)
- 残り: 本 PR の概念 (palette・検索・IPC チャネル・userData・文言の表・基準画像・verify.yml) で `docs/decisions` を Grep した。接点は AD-014:42 (「検索」の一般用法)、AD-024 / AD-033 / AD-037 に出る過去の feature のパス、AD-046 の 3 行 (:42, :50, :62) だけである

| ADR | 本 PR の接点 | 結果 |
|---|---|---|
| AD-023 §5 / §7 / §8 | launch-usage を domain・infra・app に分けた。store は electron を import しない。service は I/O を注入で受ける | drift なし。根拠は `launch-usage-store.ts:1-19`・`launch-usage-service.ts:29-34`・`.dependency-cruiser.js:254`。Consequences の「ui の内部構成は M3 で肥大したら再検討」は M-001 |
| AD-025 §7 / §9 | `::highlight()` をバンドルされる CSS に置いた (`main.css:151-167`)。実名列挙に名前を足した | drift なし |
| AD-027 | 実名列挙の規則を変えた。発火の確認は CI の `test:rules` (`verify.yml:81-82`) が行う | drift なし。code-gate では `test:rules` を流していない |
| AD-031 | AD-045 Confirmation への in-place の追記 | M-004 |
| AD-033 実測結果 §1 | standalone の element を 2 つ採った | L-001 |
| AD-034 §1 | 過去ログの取得は `PastCenter` の 1 回だけ (`CenterPane.tsx:151-155`)。検索は renderer の中で行う | drift なし |
| AD-036 / AD-041 | `launchSession(config, origin)`。起動の service に渡るのは `config` だけ (`session-ipc.ts:155-165`)。AD-041 (h) の指名を履行した | drift なし |
| AD-037 D1 | window の capture で受ける Ctrl+F が、composer の keydown を先に受ける | 「回帰は E2E で固定する」の範囲に Ctrl+F が入っていない → M-006 |
| AD-038 D3 / D5 / Confirmation | E2E の固定の索引 (`e2e-capability.ts:76,115`)。記録はメモリ内の fake。新しい基準画像 | D5 と Confirmation に対して H-001 |
| AD-044 Decision 5 | 使い道の書式を凡例に移した | drift なし。妥当性の判断は ui-coverage-reviewer |
| AD-045 | 新規 (accepted)。Decision 1〜4 を XV と roadmap の D-1 の行に反映した | M-003 (Verification の配線)・M-004 (置き場) |
| AD-046 Decision 4 / 6・Alternatives・訂正 | palette (全面のモーダル)・置き場所の語・「稼働中と過去を混ぜるか」の再検討の閉じ方 | L-002 / L-006 / L-009。運用上の正本である ui charter「面の状態」の記述は M-002 |

ADR の**決定**を in-place で書き換えた差分は 0 件である。本 PR が `docs/decisions/` で変えるのは、新規の AD-045 だけである。

## Findings

### [High] サイドバーの基準画像の E2E (`e2e/sidebar-screenshot.spec.ts`) が CI に配線されておらず、基準画像も commit されていない。FR-018 / SC-008 の E2E と、AD-038 D5 の基準画像の手続きに実行経路が無い (H-001) (scope: feature)

- **観察**:
  - `.github/workflows/verify.yml:113-164` の e2e job は、spec を実名で 4 本だけ流す (`:139` ime / `:145` composer-screenshot / `:159` launch-dialog / `:164` multi-session)
    - `e2e/*.spec.ts` は 5 本ある。配線されていないのは `sidebar-screenshot.spec.ts` だけ
    - verify.yml は本 PR の touched files に無い
  - `e2e/sidebar-screenshot.spec.ts` の中身:
    - `:81` で `toHaveScreenshot('sidebar-past-sessions.png')` を呼ぶ
    - `:89-129` は SC-008 の高さの確認
  - 基準画像:
    - `e2e/**/*.png` は `composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` の 1 件だけで、sidebar の基準画像は無い
    - `playwright.config.ts:15-27` に `updateSnapshots` の指定は無い
  - 計画は成り立たない:
    - 計画は「基準画像は CI の artifact から取る」(spec.md:311 / tasks.md:50 の SH-010)
    - CI がこの spec を流さないので、artifact ができない。artifact が上がるのも失敗したときだけ (`verify.yml:168-174`)
  - 記録は、CI で流れる前提で書かれている:
    - `quickstart-results.md:18-19` の「CI の e2e job で通す」
    - `docs/roadmap.md:133`
    - `verify.yml:141-143` 自身が「承認済み基準画像 (`e2e/**/*.png`) が commit 済みであることが前提」と書いている
  - quickstart.md:29-36 に、基準画像を人が見て承認する行が無い。AD-038 D5 (`0038:85-88`) は「quickstart に記録する」と定める
- **同種事象探索**:
  - `playwright test` を `.github/workflows` で検索: 4 件 (verify.yml:139,145,159,164)
  - Glob `e2e/*.spec.ts`: 5 件。配線されていないのは 1 件 (`sidebar-screenshot.spec.ts`)
  - Glob `e2e/**/*.png`: 1 件 (composer のみ)
  - `toHaveScreenshot\(` を e2e で検索: 2 件 (`composer-screenshot.spec.ts:53` / `sidebar-screenshot.spec.ts:81`)
- **リスク/影響**:
  - SC-008 の「FR-018 の基準画像の比較が CI で通る」と高さの確認は、CI が緑でも一度も実行されない
  - 本プロジェクトが繰り返し塞いできた「検査が 0 件なのに緑」と同じ形である (AD-024 #18 / AD-025)
  - ui charter の KPI「日本語の健全性」(:162-163) の計測経路にも、O-3 の分が載っていない
  - 開発者が discovery.md:150 の「(全)」の手順を手元で流すと、手元の描画で基準画像が書き出される。手元の描画は揺れるので本機では基準画像を作らない、と定めた規則 (`sidebar-screenshot.spec.ts:17`) に反するものが、そのまま commit されうる
- **推奨アクション**:
  1. verify.yml の e2e job に 1 ステップ足す: `pnpm exec playwright test e2e/sidebar-screenshot.spec.ts -c playwright.config.ts`。1 検証 1 ステップの規則 (discovery.md:270) に従う
  2. 1 回 CI を流し、失敗時の artifact から `sidebar-past-sessions-win32.png` を取る
  3. 利用者が見て承認し、quickstart と quickstart-results に記録してから `e2e/sidebar-screenshot.spec.ts-snapshots/` に commit する (AD-038 D5)。quickstart に承認の行を足す
  4. 再発を防ぐ手段を system-scope に登録する。`e2e/*.spec.ts` がすべて verify.yml に現れることを確かめる構造の検査か、`check.mjs` の項目である
- **根拠**: AD-038 D5 / Confirmation (`0038:111`)、Constitution VIII Verification (constitution.md:637)、ui charter KPI「日本語の健全性」、spec FR-018 / SC-008、ARCH-6
- **scope 根拠**: verify.yml・quickstart・基準画像はどれも本 feature の PR で直せる

### [Medium] session の操作 UI (`features/session-list`) が ui の `features/search/` を import し、`features/search/` も session-list を import する。domain の依存の向きが双方向になったが、`_overview.md` と charter 2 つの依存の記述が変わっていない (M-001) (scope: feature) [design-gate M-21 / arch M-105 (a) を引き継ぐ]

- **観察**:
  - 依存の向き:
    - `features/search/session-search.ts:3-4` → `features/session-list/group-label` / `rows`
    - `features/session-list/SessionListScreen.tsx:21-26` → `features/search/session-search` / `text-search`
  - 検索欄の部品 `PastSearchField` は session の module の中にある (`SessionListScreen.tsx:814`)。一方、ui charter:54-56 は「一致の規則 (`features/search/`) と検索欄・絞り込みは本 domain (ui) が持ち」と書く
  - 依存の記述:
    - `_overview.md:126-138` は ui を最上層、session の依存先を runtime と provider だけとしている
    - ui charter:173 は「依存される domain: なし (最上層)」
    - session charter:183 は「依存する domain: runtime, provider」
    - 本 PR はこの 3 ファイルを変えたが、上の行は変えていない
  - (b) の chat → session は props の注入で解消した (`CenterPane.tsx:96`)
- **同種事象探索**:
  - `from '@/features/session-list/` を `features/search` (テストを除く) で検索: 2 件 (session-search.ts:3,4)
  - `from '@/features/search/` を `features/session-list` で検索: 2 件 (SessionListScreen.tsx:25,26)
  - ほかに `features/search` を import するもの: chat 3 件 (conversation-search.ts:3 / search-highlight.ts:1 / useConversationSearch.ts:12)、shell 3 件 (CommandPalette.tsx:9 / palette-commands.ts:9,10)
- **リスク/影響**:
  - 共有の土台が、その利用者の 1 つに依存している。モジュール単位の循環にはならないので、depcruise の `no-circular` は拾わない
  - roadmap の system-scope (6) は feature 間の向きを機械で強制する予定である。入れるときに、この向きのために規則を緩めることになる
  - charter が「ui が持つ」と書く検索欄が session の module にあるので、変更の持ち主を charter から決められない
- **推奨アクション**: 次のどちらかを採る。
  - (a) コードを直す: `features/search/` には他の feature を import しない `text-search.ts` だけを残す。行の対象 (`createPastSearchIndexer` / `pastRowMatches`) は `features/session-list/` に、稼働中の対象は `features/shell/palette-commands.ts` に移す
  - (b) 記述を直す: `_overview.md` の依存関係・ui charter:173・session charter:183 に「session の操作 UI (過去の一覧) が ui の一致の規則を使う (O-3 / U-5)」を書き、ui charter:54-56 の「検索欄は ui が持つ」を実際の置き場に合わせる
  - module の置き場そのものは code-gate の CONV-M-002 と合わせて決める
- **根拠**: `_overview.md` 依存関係、ui / session charter の Cross-domain dependencies、AD-023 Consequences (`0023:380-381`)、ARCH-4 / ARCH-5
- **scope 根拠**: `_overview.md` と charter 2 つは本 PR の touched files である

### [Medium] ui と session の境界の集合 (逆向きの呼び出しと、読む面の状態) が、charter 2 つと glossary の間で食い違い、どれもコードと合っていない (M-002) (scope: feature) [design-gate M-16 / arch M-101 を部分的に引き継ぐ]

- **観察**:
  - (i) 逆向きの呼び出し:
    - ui charter:185 は「シェルが session のストアの操作を呼ぶのは次の 2 つだけ」(`dismissLaunchNotice` と palette の `select` / `sessions.select`) と書く
    - 実際には `RunningCenter` (shell) も、session の `RunningSessionsView.revealMessage` を会話内検索に渡して呼ばせる (`CenterPane.tsx:96`)
    - `revealMessage` は session の provider が持つ窓の状態を書き換える (`RunningSessionsProvider.tsx:156-170`)
  - (ii) session charter:186 の逆向きの呼び出しは `dismissLaunchNotice` の 1 つだけで、ui charter:185-189 (2 つ) と食い違う。palette の `select` と `revealMessage` は Related Specs (:238-239) にだけある
  - (iii) 読む面の状態:
    - `watchedIdOf` は `paletteOpen` も読むようになった (`stores/ui.ts:132-144`)
    - ui charter:174 と glossary:917-918 は「focus と設定・起動ダイアログの開閉」のまま
    - glossary:918 は定義の正本を「013 data-model §1 の `watchedIdOf`」と指したままである
    - 新しい glossary の Command palette の項 (:201) だけが palette の扱いを書いている
- **同種事象探索**:
  - `revealMessage` を docs で検索: 2 件 (session charter:238 / roadmap:259)。ui charter は 0 件
  - `dismissLaunchNotice|sessions\.select` を docs/domains で検索: 5 件。逆向きの集合を書いた行は session charter:186 (1 つ) と ui charter:186,188 (2 つ)
  - `watchedId|見ているセッション` を docs で検索: 定義の行は glossary:201,917-918 / ui charter:174 / session charter:184。このうち palette を含むのは glossary:201 だけ
- **リスク/影響**:
  - AD-046 の訂正節 (`0046:69-72`) は、境界の集合の運用上の正本を ui charter「面の状態」に置いた。その正本が実装より 1 つ少ない
  - 次に境界を広げる feature (O-4〜O-6) が「2 つだけ」を前提に読む
  - Principle XIV の canonical な定義 (Shell の `watchedId`) が、実装と食い違ったまま残る
- **推奨アクション**:
  - ui charter:185-189 に (3) を足す: 「会話内検索の窓の外への移動 (`RunningSessionsView.revealMessage`)。shell の `RunningCenter` が chat の provider に props で渡す」
  - ui charter:174 の読む集合に `paletteOpen` を足す
  - session charter:184-186 を ui charter と同じ集合に揃える (読む集合に `paletteOpen`、逆向きの呼び出しに `select` / `sessions.select` / `revealMessage`)
  - glossary:917-918 の条件に palette を足し、正本の参照先を ui charter「面の状態」(または 012 data-model §3) に直す
- **根拠**: Principle XIV、AD-046 の訂正節、ui charter Cross-domain dependencies、ARCH-5 / ARCH-7
- **scope 根拠**: charter 2 つと glossary は本 PR の touched files である

### [Medium] Constitution XV の Verification が名指す Manual の検証者 (ux-reviewer) が、新しい規則に合わせて定義も発火条件も直されていない (M-003) (scope: feature) [design-gate M-20 / arch M-103 を部分的に引き継ぐ]

- **観察**:
  - constitution.md:895-899 は「Manual: `ux-reviewer` の i18n の観点が『新たに増やさない』を見る。基準線は AD-045 の Confirmation」と定める
  - ux-reviewer の定義は、リソース化を前提にしたままである:
    - `.claude/agents/ux-reviewer.md:15` は読む対象に「i18n リソース (`locales/*.json` / `i18n/`)」を挙げる
    - UX-6 (:49-53) は「i18n key の命名規約が一貫しているか」を見る
    - どちらも、XV の「リソース化しない」と前提が逆である
  - 発火条件 (`.specify/spec-gate/reviewers.yml:89-124`) が、基準線を数えた範囲を覆っていない:
    - 設定の画面のうち 3 つ (runtime-list / workspace-folders / folder-runtime-resolution) はコメントアウトされている (:115-117)
    - `features/provider` は 0 件
    - この 5 ファイル (ResolutionScreen 26 / WorkspaceFoldersScreen 61 / RuntimeListScreen 39 / ProviderScreen 27 / ModelCatalogEditor 11) に、HEAD の 331 行のうち 164 行がある
  - 本 PR で手を入れた element 2 つ (`command-palette.tsx` / `conversation-search.tsx`) について:
    - eslint の手書きの element の一覧には足した (eslint.config.mjs の O-3 の override)
    - reviewers.yml の「新しい手書きの element を足したらここにも足す」(:102-103) は履行していない
  - reviewers.yml と ux-reviewer.md は touched files に無い。直さない理由も書かれていない
- **同種事象探索**:
  - `i18n` を ux-reviewer.md で検索: 3 件 (:3, :15, :49)
  - `features/provider` を reviewers.yml で検索: 0 件
  - `command-palette|conversation-search` を reviewers.yml で検索: 0 件
  - コメントアウトされた設定の画面: 3 行 (:115-117)
- **リスク/影響**:
  - 改定した日から、XV の Verification は約半分の範囲で起動しない
  - 起動したときも、i18n key の観点で見ることになる。AD-024 が塞いできた「書いてあるのに効いていないルール」の形である
- **推奨アクション**:
  - UX-6 を「文言は feature の文言の表に置き、直書きを新たに増やさない (AD-045)。基準線の式で件数を数え、増えた行を差分で見る」に書き換え、:15 の対象を `labels.ts` に直す
  - reviewers.yml の ux-reviewer に `command-palette.tsx` / `conversation-search.tsx` を足す
  - 設定の 4 画面と provider を入れるかを決める。入れないなら、XV の Verification に「設定の画面は対象外」と範囲を書く
- **根拠**: Constitution XV Verification、AD-045 Decision 2、AD-024 (検証経路の実体合わせ)、reviewers.yml:102-103
- **scope 根拠**: XV の改定は本 PR の範囲であり、その検証経路の配線も同じ PR で直せる

### [Medium] AD-045 の基準線を accepted の後に `## Confirmation` へ in-place で書き足したが、AD-031 の in-place の規則 (日付つきの「訂正」節だけ) の外にある。「記録」節の明文化にも持ち主がいない (M-004) (scope: feature / 一部 system) [design-gate M-17 / arch M-104 を引き継ぐ]

- **観察**:
  - 追記の内容:
    - `0045:49` は「直書きの基準線 (Consequences の追記。2026-10-07…): 331 行」を、Confirmation の箇条として足している
    - AD-045 は 2026-10-05 に accepted になった (`0045:23`)
  - 規則との関係:
    - AD-031 Decision 1 (`0031:99-100`) が in-place で認めるのは、事実誤認の訂正だけである
    - Constitution 改定手順 1 (constitution.md:347-351) は AD-031 に従うと定める
    - 今回の追記は訂正でも決定の変更でもない (Consequences が予告した記録)
  - 先例と持ち主:
    - AD-041:31 は同じ種類の追記を「記録」節に分け、その扱いの明文化を system follow-up とした
    - roadmap にその登録は無い
  - 依存: XV の Verification (constitution.md:897-899) は、この追記を基準線として参照する
- **同種事象探索**:
  - accepted ADR の、訂正以外の in-place の追記: 4 件 (`0034:95` 決定の追記 / `0041:172` 記録 / `0046:70` 追記 / `0045:49` 本件)。規則に根拠を持つものは 0 件
  - roadmap で `記録」節|「記録」|AD-031 で明文化|再採択` を検索: 0 件
- **リスク/影響**:
  - drift の判定の基準 (Confirmation) が、規則の無い形で後から増える先例が 4 件目になる
  - Constitution の Verification が、その形の節に依存する
- **推奨アクション**:
  - feature: `0045:49-54` を Confirmation の箇条から外す。Confirmation の後ろに `## 記録 (2026-10-07 / O-3 SH-002)` の節を立てて移し、XV の参照先 (constitution.md:897) をその節に直す
  - system: AD-041:31 の follow-up (「記録」節と、未マージの ADR の再採択の扱い) を、roadmap の system-scope に持ち主つきで登録する (AD-028 §5)
- **根拠**: AD-031 Decision 1 と訂正節、Constitution 改定手順 1、AD-041:31、AD-028 §5
- **scope 根拠**: 節の形は本 PR で直せる。AD-031 の明文化は system の範囲

### [Medium] perf の実機計測 (`perf/real-sessions.spec.ts`) の起動が、KPI「再利用率」の記録 (`launch-usage.json`) に入る。どの記録にもその扱いが無い (M-005) (scope: feature) [design-gate M-19 / arch M-102 を引き継ぐ]

- **観察**:
  - perf の起動のしかた:
    - perf は `CLOSTA_E2E` を拒んで取り除き (`real-sessions.spec.ts:12,166,179-185`)、本物の composition で起動する
    - 1 回の計測で 10 本起動する (`:34` の `SESSIONS = 10`)
    - ユーザデータディレクトリを分ける指定は無い (src に `setPath(` は 0 件)
  - 本物の composition では、受け付けた起動がすべて記録される (`composition-root.ts:308,353` → `session-ipc.ts:163`)
  - session charter の KPI「再利用率」の注記 (:165-179)・discovery の `launch-usage.json` の節・roadmap の O-8 の行に、perf の扱いが無い。記録から外すと書いてあるのは E2E の偽の capability だけである (session charter:179)
- **同種事象探索**:
  - `setPath\(|user-data-dir` を src で検索: 0 件
  - `perf` を session charter の KPI「再利用率」の節 (:165-179) で検索: 0 件
  - `CLOSTA_E2E` を `perf/real-sessions.spec.ts` で検索: 起動と env の行が 5 か所 (:12, :23-24, :166, :179-182)
- **リスク/影響**:
  - O-8 は perf を繰り返し流す feature である。1 回あたり 10 本の起動が、直近 30 日の 2 つの回数に混ざる
  - 判定は最低件数を持たないと決めたので (session charter:170-171)、混ざった数がそのまま KPI の判定に効く
- **推奨アクション**: roadmap の O-8 の行と session charter の注記に、次のどちらかを書く。
  - O-8 は計測用のユーザデータディレクトリを分けてから perf を流す
  - perf の後に、記録の該当の日を判定から除く手順を discovery に置く
- **根拠**: session charter KPI「再利用率」、AD-041 (h)、ARCH-2 / ARCH-6
- **scope 根拠**: roadmap / session charter / discovery は本 PR の touched files である

### [Medium] composer で変換中に Ctrl+F を押したときの IME の回帰を見る E2E が無い。Ctrl+K と Ctrl+F の判定は別々の写しなので、Ctrl+K の E2E では覆えない (M-006) (scope: feature) [design-gate M-18 / arch M-106 を引き継ぐ]

- **観察**:
  - Ctrl+F は会話内検索の provider が window の capture で受け、独自の `isComposingKey` で判定する (`ConversationSearchProvider.tsx:43-45,143-152`)
  - Ctrl+K の判定は別の写しである (`CommandPalette.tsx:34`)
  - E2E の範囲:
    - IME の E2E に足したのは、検索のバーの Enter (`ime.spec.ts:119-175`。バーはボタンで開く) と、composer で変換中の Ctrl+K (`:182-223`) の 2 つ
    - `Control+F` を押す E2E は 0 件
  - plan の RK-06 (plan.md:247) は、jsdom は発火の順を再現しないので E2E で確かめる、としている
- **同種事象探索**:
  - `Control\+[FfKk]` を e2e で検索: 1 件 (ime.spec.ts:223 の Ctrl+K)
  - `keyCode === 229` を renderer の非テストのファイルで検索: 6 件 (command-palette.tsx:126 / ConversationSearchProvider.tsx:44,166 / SessionListScreen.tsx:806 / CommandPalette.tsx:34。もう 1 件は command-palette.tsx:27 のコメント)。写しの重複は code-gate の CONV-M-001 が扱う
- **リスク/影響**:
  - Principle VIII は NON-NEGOTIABLE である。Ctrl+F の写しを誤る (229 の見落とし・`preventDefault` の位置) と、composer の変換を壊しても CI は緑のままになる
  - AD-037 D1 の「回帰は E2E で固定する」の範囲から、新しく composer の keydown を先に受ける受け手が 1 つ外れている
- **推奨アクション**:
  - `ime.spec.ts` に「composer で変換中に Ctrl+F を押しても検索のバーが開かず、変換が確定できる」を 1 ケース足す。Ctrl+K のケース (:183-223) と同じ CDP の手順で書ける
  - 足さないなら、plan の RK-06 に AD-037 D1 からの逸脱として理由を書く
- **根拠**: Constitution VIII Verification (A)、AD-037 D1 (`0037:134-140`)
- **scope 根拠**: `e2e/ime.spec.ts` は touched files である

### [Low] AD-033 の実測結果 §1 は「standalone は採らない」と書くが、本 PR は standalone の element を 2 つ採り、その関係をどこにも書いていない (L-001) (scope: system) [design-gate L-20 / arch L-104 を引き継ぐ]

- **観察**:
  - `0033:50` は「AD-019 の問い (2) の答え: `.aui.tsx` runtime 接続型を採用済み。standalone は採らない」と書く
  - 本 PR は registry の standalone の element 2 つを取り込んだ (`components/assistant-ui/elements/command-palette.tsx` / `conversation-search.tsx`)
  - research.md:53 は standalone であると書くだけで、AD-033 との関係を書いていない。plan.md:91 の AD-033 の行は、仮想化の根拠としてだけ挙げている
  - AD-033 の Decision 節 (§1〜§3) は R-3 の transcript の形を決めたもので、`.aui` でない element の先例は既に複数ある
- **同種事象探索**:
  - `standalone は採らない` を docs で検索: 1 件 (`0033:50`)
  - `AD-033` を research.md で検索: 0 件
  - `.aui` でない element のファイル: 10 件 (data-table / file-tree / loading-state / reasoning.tsx / empty-state / error-state / surfaces / tool-result-marks / conversation-search / command-palette)。このうち 2 件が本 PR の新規
- **推奨アクション**:
  - feature: research R-04 と ui-coverage F 節の備考に 1 文足す。「AD-033 §1 の答えは Thread を runtime につなぐ部分のもので、props で動く部品は先例 (empty-state.tsx ほか) として採っている」
  - system: AD-033 の文の範囲を後続の文書でどう読むかを決める
- **根拠**: AD-033 実測結果 §1、AD-019 (`0019:55-57`)、Principle XIII
- **scope 根拠**: AD-033 の文と、既存の 8 件の実践の食い違いは本 PR より前からある

### [Low] palette は新しい全面のモーダルだが、AD-046 Decision 4 の「モーダル (設定・起動・承認) の間は外部コンテンツを隠す」の列挙に入る道筋が無い (L-002) (scope: feature) [design-gate L-19 / arch L-103 を引き継ぐ]

- **観察**:
  - palette は Radix のモーダルで、`aria-modal="true"` を持つ (`components/ui/dialog.tsx:69`)
  - `0046:30` の列挙を写した roadmap:395 (OPT-panel) と prompts.md:340 に、palette は無い
- **同種事象探索**: `設定・起動・承認` を docs で検索: 3 件 (`0046:30` / roadmap:395 / prompts.md:340)。palette の注記は 0 件
- **推奨アクション**: roadmap:395 と prompts.md:340 に「palette (O-3) も含める。判定は `[aria-modal="true"]`」と注記する
- **根拠**: AD-046 Decision 4
- **scope 根拠**: roadmap / prompts は touched files である

### [Low] ui charter の Related ADRs と frontmatter の `related_adrs` に、ui の決定である AD-045 が無い (L-003) (scope: feature) [new]

- **観察**:
  - ui charter の frontmatter (:7-15) と Related ADRs (:191-197) に `0045` が無い
  - 言及は Related Specs (:224-225) の 1 か所だけである
  - AD-045 の tags は `[ui, i18n, constitution]` で、Decision 2 は ui の全 feature の文言の置き場を決める
- **同種事象探索**: `0045` を ui charter で検索: 1 件 (:225)。frontmatter と Related ADRs では 0 件
- **推奨アクション**: frontmatter と Related ADRs に AD-045 を足す (「UI の文言を i18n リソース化しない。文言は feature の文言の表に置く」)
- **根拠**: ui charter の運用、ARCH-2
- **scope 根拠**: ui charter は touched files である

### [Low] `_overview.md` の「帰属の判断根拠」に、O-3 (ui の feature が session のモジュールを変える。U-5) と O-8 (`session`) の理由が無い (L-004) (scope: feature) [design-gate L-17 / arch L-101 を引き継ぐ]

- **観察**: 本 PR は `_overview.md` の Feature 帰属の表 (:60-70) と M3 の範囲 (:116) だけを変えた。帰属の判断根拠 (:82-105) は変えていない
- **同種事象探索**: `_overview.md:82-105` の項目は 8 件。O-3 / O-8 の帰属を述べる項目は 0 件 (O-7 の項目の中に「O-3 の前に置く」の言及が 1 件 (:105))
- **推奨アクション**: 帰属の判断根拠に 2 行足す
  - 「O-3 は `ui`。session の操作 UI・起動の IPC・起動の利用記録に手を入れるのは U-5 の例外 (2026-10-05 承認)」
  - 「O-8 は `session`。KPI の持ち主が session charter」
- **根拠**: `_overview.md` の運用、AGENTS.md (domain の分解は人間が承認する)
- **scope 根拠**: `_overview.md` は touched files である

### [Low] spec と research が、glossary の Counterexamples に入れた語「再利用率の記録」を使っている (L-005) (scope: feature) [new]

- **観察**:
  - glossary:504 は、LaunchUsage を「ローカル利用ログ」「再利用率の記録」と呼ばない、と定めた
  - spec.md:33 (Summary)、:47 (位置づけ)、:360 (Out of Scope) と research.md:78 (R-05 の見出し) は「再利用率の記録」を使っている
- **同種事象探索**: `再利用率の記録` を 012 の spec / research で検索: 4 件 (spec.md:33,47,360 / research.md:78)。completed の 008 にも「ローカル利用ログ」が 3 件あるが、記録なので直す対象ではない
- **推奨アクション**: 4 か所を「起動の利用記録」に直す
- **根拠**: Principle XIV (同義異語の禁止)、ARCH-7
- **scope 根拠**: spec / research は本 feature の文書である

### [Low] glossary の Shell の「中央のヘッダ」の定義に、本 PR で足した会話内検索のボタンと検索のバーが無い (L-006) (scope: feature) [design-gate L-18 / arch L-102 を部分的に引き継ぐ]

- **観察**:
  - glossary:909 の中央のヘッダは「題・フォルダ・状態と transcript の密度の切り替え」のままである
  - `CenterHeader.tsx:16,36,71` は、検索のボタンを行に置き、ヘッダの下に検索のバーを描く
  - ui-coverage F 節は「中央のヘッダの会話内検索のバー」と書いている
- **同種事象探索**: `検索` を glossary の Shell の項 (:903-923) で検索: 0 件
- **推奨アクション**: glossary:909 に「会話内検索のボタンと、その下の検索のバー (O-3)」を足す
- **根拠**: AD-046 Decision 6 (glossary の正本をこの語の集合に揃える)、Principle XIV
- **scope 根拠**: glossary は touched files である

### [Low] `main.css` は Principle XIII の除外のファイル (標準テーマの写し) だが、本 PR がテーマの外の規則 (`::highlight()`) を足した。冒頭の「そのまま写したもの」が事実と合わなくなった (L-007) (scope: feature) [design-gate L-14 を引き継ぐ]

- **観察**:
  - constitution.md:825-826 は、`main.css` を「CLI 生成の標準テーマの写し」としてファイル単位で除外する
  - `main.css:1-12` は「そのまま写したものであり、独自トークンの追加ではない」と書く
  - 本 PR は `:151-167` に `::highlight()` の 2 規則を足した。使っているのは既存のトークン (`--chart-4` / `--primary` ほか) だけで、今の時点で独自トークンの追加ではない
- **同種事象探索**: main.css の中の、テーマの写しでない追加の注記: 2 件 (:104 の a11y H-008 の追加 (既存) / :151 の O-3 の追加)
- **リスク/影響**: 除外がファイル単位なので、同じファイルに後から独自トークンを足しても `bad_pattern_grep` が見ない範囲が広がる
- **推奨アクション**: 次のどちらかを採る
  - `::highlight()` を別の CSS ファイルに移す
  - 冒頭の注記に「写しの後に足した規則 (:104・:151) は既存のトークンだけを使う」と書き、XIII の除外の説明と合わせる
- **根拠**: Constitution XIII (`theme_baseline_exclusions`)
- **scope 根拠**: main.css は touched files である

### [Low] 会話内検索の 1,000 メッセージの走査の時間が、テストの console に出るだけで、どの記録にも残らない (L-008) (scope: feature) [design-gate M-09 / arch M-107 を引き継ぎ、Low にした]

- **観察**:
  - `conversation-search.test.ts:223-240` は時間を参考値として出すだけで、合否に使わない (SC-002 の定めどおり)
  - `quickstart-results.md` に値が無い。想定の規模は数千メッセージである (plan.md:28)
- **同種事象探索**: `1,000` を quickstart-results.md で検索: 0 件
- **推奨アクション**: SH-043 の値として、初回 (正規化を含む) と語の変化の時間を quickstart-results に 1 行書く。V-3 の実機の目視で数千メッセージの初回の検索を見る行を足す
- **根拠**: AD-034 §1 の趣旨 (描画スレッドを重い処理で塞がない)、ui charter KPI「スクロールの安定」
- **scope 根拠**: quickstart(-results) は本 feature の文書である
- **Low にした理由**: 合否に使わないことは spec で決めてある。観測点の欠けだけが残る

### [Low] AD-046 の Alternatives「稼働中と過去を混ぜるかは O-3 の Thread search の後に再検討」を、completed の 013 spec の中で閉じた。運用上の正本 (ui charter) には結論が無い (L-009) (scope: feature) [design-gate L-07 / arch L-105 を引き継ぐ]

- **観察**:
  - 結論「混ぜない」は 013 spec (diff の :58 と :261) と 012 spec FR-016 にだけある
  - ui charter・roadmap・glossary には「混ぜ」の結論が 0 件
  - V-3 の 50 件以上の行 (quickstart.md:34) は、まだ実施していない
- **同種事象探索**: `混ぜ` を docs で検索して、本件に当たるのは `0046:50` の 1 件だけ
- **推奨アクション**: ui charter の Cross-domain dependencies か Open Questions に、結論と日付を 1 行書く。013 には参照だけを残す
- **根拠**: AD-046 Alternatives・訂正節 (`0046:69`)
- **scope 根拠**: ui charter は touched files である

## H. テスト / coverage / observability / regression (本 reviewer の担当範囲)

- 指摘を検出できるテスト:
  - H-001 は、テストが CI で流れないこと自体が問題である
  - M-006 は、E2E の 1 ケースで検出できる
  - M-001 / M-002 / M-004 / M-005 は文書と構成の drift で、検出するテストは無い。M-001 は roadmap の system-scope (6) の feature 間の向きの規則が入れば検出できる
- 既存の振る舞いを壊していないと言える根拠:
  - code-gate の lint track: depcruise・check:constitution (ok 20)・tsc 4 本が violations 0
  - vitest: 2266 passed
  - AD-024 #18 の composer の番人 (`ChatScreen.test.tsx` の 2 ケース) は、文言の表の定数に置き換わったまま残っている (diff の ChatScreen.test.tsx:262-276)
  - 実名列挙の規則の発火の確認は、CI の `test:rules` (`verify.yml:81-82`) が流す
  - XV の基準線の式で HEAD を数えると 331 で、基準線と同じ値
- 観測点:
  - 起動の利用記録の失敗は、理由キーと errno のコードだけを `console.warn` に出す (`launch-usage-service.ts:67,73,76,82,107`)
  - perf 由来の起動 (M-005) を見分ける観測点は無い

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `playwright test` (.github/workflows) / Glob `e2e/*.spec.ts` / Glob `e2e/**/*.png` / `toHaveScreenshot\(` (e2e) | 4 / 5 (未配線 1) / 1 / 2 | verify.yml:139,145,159,164 / e2e/sidebar-screenshot.spec.ts / composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png / composer-screenshot.spec.ts:53, sidebar-screenshot.spec.ts:81 |
| M-001 | `from '@/features/session-list/` (features/search) / `from '@/features/search/` (features/session-list) / features/search の他の importer | 2 / 2 / 6 | session-search.ts:3,4 / SessionListScreen.tsx:25,26 / conversation-search.ts:3, search-highlight.ts:1, useConversationSearch.ts:12, CommandPalette.tsx:9, palette-commands.ts:9,10 |
| M-002 | `revealMessage` (docs) / `dismissLaunchNotice\|sessions\.select` (docs/domains) / `watchedId\|見ているセッション` の定義の行 | 2 (ui charter 0) / 5 / 5 (palette を含むのは 1) | session charter:238, roadmap:259 / ui charter:186,188, session charter:186,225,239 / glossary:201,917-918, ui charter:174, session charter:184 |
| M-003 | `i18n` (ux-reviewer.md) / `features/provider` (reviewers.yml) / `command-palette\|conversation-search` (reviewers.yml) / コメントアウトされた設定の画面 | 3 / 0 / 0 / 3 | ux-reviewer.md:3,15,49 / — / — / reviewers.yml:115-117 |
| M-004 | accepted ADR の訂正以外の in-place 追記 / `記録」節\|「記録」\|AD-031 で明文化\|再採択` (roadmap) | 4 / 0 | 0034:95, 0041:172, 0046:70, 0045:49 / — |
| M-005 | `setPath\(\|user-data-dir` (src) / `perf` (session charter :165-179) / `CLOSTA_E2E` (perf/real-sessions.spec.ts) | 0 / 0 / 5 か所 | — / — / real-sessions.spec.ts:12,23-24,166,179-182 |
| M-006 | `Control\+[FfKk]` (e2e) / `keyCode === 229` (renderer の非テスト) | 1 / 6 | ime.spec.ts:223 / command-palette.tsx:27,126, ConversationSearchProvider.tsx:44,166, SessionListScreen.tsx:806, CommandPalette.tsx:34 |
| L-001 | `standalone は採らない` (docs) / `AD-033` (research.md) / `.aui` でない element のファイル | 1 / 0 / 10 (新規 2) | 0033:50 / — / components/assistant-ui/elements/* |
| L-002 | `設定・起動・承認` (docs) | 3 (palette の注記 0) | 0046:30, roadmap:395, prompts.md:340 |
| L-003 | `0045` (ui charter) | 1 (frontmatter と Related ADRs は 0) | ui charter:225 |
| L-004 | `_overview.md` の帰属の判断根拠の項目 | 8 (O-3 / O-8 の項目は 0) | _overview.md:82-105 |
| L-005 | `再利用率の記録` (012 spec / research) | 4 | spec.md:33,47,360, research.md:78 |
| L-006 | `検索` (glossary の Shell の項) | 0 | glossary.md:903-923 |
| L-007 | main.css の中の、テーマの写しでない追加の注記 | 2 | main.css:104,151 |
| L-008 | `1,000` (quickstart-results.md) | 0 | — |
| L-009 | `混ぜ` (docs。本件に当たるもの) | 1 | 0046:50 |

## Verdict

- Critical: 0
- High: 1
- Medium: 6
- Low: 9

関連ファイル (絶対パス):
- C:\dev\closta\.github\workflows\verify.yml
- C:\dev\closta\e2e\sidebar-screenshot.spec.ts
- C:\dev\closta\e2e\ime.spec.ts
- C:\dev\closta\docs\domains\ui\charter.md
- C:\dev\closta\docs\domains\session\charter.md
- C:\dev\closta\docs\domains\_overview.md
- C:\dev\closta\docs\glossary.md
- C:\dev\closta\docs\decisions\0045-ui-labels-no-i18n-resources.md
- C:\dev\closta\.specify\memory\constitution.md
- C:\dev\closta\.claude\agents\ux-reviewer.md
- C:\dev\closta\.specify\spec-gate\reviewers.yml
- C:\dev\closta\src\renderer\src\features\search\session-search.ts
- C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx
- C:\dev\closta\src\renderer\src\features\shell\CenterPane.tsx
- C:\dev\closta\src\renderer\src\stores\ui.ts
- C:\dev\closta\perf\real-sessions.spec.ts
