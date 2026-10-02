# security-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-004 (読み上げの文に会話由来の文字列を入れない)、FR-006 (直近の活動を 1 行の plain text にし、双方向制御文字と行区切りを除き、HTML として解釈しない)、FR-010 (main / preload / IPC を変えない)、FR-012 (実機計測: 記録と出力に会話由来の文字列と env を入れない)、SC-002、SC-005 (出力してよい項目の許可リスト)、SC-006
- touched files に関係する charter / Confirmation: session charter の KPI「並列時の滑らかさ」の計測経路 (perf/)。AD-038 D2 / D3 (e2e と perf を src のグラフの外に置く。CI は credential を持たない)。AD-043 (状態通知に会話由来の文字列を載せない。本 PR はこれを変えていない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (AD-038 D3 の CI 経路は下の「0 件の確認」で security の観点からだけ見た)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / database の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

renderer だけの変更である。対象は監視ビュー (RunningSessionList の拡張、SessionNavBadge、SessionAttentionAnnouncer、session-view.ts の導出、store の間引き)。これに加えて、実 claude を起動する実機計測のハーネス (perf/real-sessions.spec.ts と playwright.perf.config.ts)、e2e/support/input-probe.ts への切り出し、CI の perf 型検査の追加、docs の更新がある。src/main・src/preload・src/agents・src/domain の差分は 0 件。

### 依頼された点ごとの 0 件の確認

- **dangerouslySetInnerHTML / innerHTML / outerHTML**: diff 全体で、本番コードでの使用は 0 件。見つかったのは roadmap の記述 1 件と、テストで innerHTML を読む 2 件 (RunningSessionList.monitor.test.tsx:227,230) だけ。直近の活動は RowActivity (RunningSessionList.tsx の `{subject}`) で React のテキストノードとして描かれ、前置きは別の span にある。component テストで `<script>` と `<strong>` が要素にならないこと (要素 0 件) を確かめている。
- **sanitizeBody と制御文字・双方向制御文字**: `normalizeLine` (session-view.ts:166-172) は domain の `sanitizeBody` を再利用している。sanitizeBody は C0 (TAB と LF を除く)、DEL、C1、U+061C、U+200E/F、U+202A-202E、U+2066-2069 を除く (src/domain/session/sanitize-body.ts:33-41)。行の区切りは LF / CR / U+2028 / U+2029 で、走査には上限 (4096 / 1024 code unit) がある。サロゲートペアは割らない。正規表現は `/\s+/g` だけなので ReDoS の経路はない。不可視の書式文字は残る (L-001)。
- **Tooltip で全文を出すか**: 出さない。RowTooltip が描くのは store の `activity` (80 コードポイントで切り詰めた後の値) と、ランタイム名・起動時刻・理由キーの訳だけ。本文全体を Tooltip に出す経路は 0 件。
- **live region**: SessionAttentionAnnouncer の文は `announcements()` が組む。材料は `folderLabel` (起動時に写した作業フォルダの表示名) と labels.ts の固定の文言だけで、activity・pending・messages を引数に取らない。テストでも、文に tool 名と入力 (Bash / secret) が含まれないことを確かめている。compact で直近の活動を sr-only で Trigger の中に置いている箇所 (RunningSessionList.tsx の SessionRowMeta) は、フォーカスしたときに読まれるアクセシブルネームであり、自動で読み上げられる live region ではないので FR-004 には反しない。
- **IPC / preload / main**: `ipcMain|ipcRenderer|contextBridge|exposeInMainWorld|shell.openExternal|child_process|spawn(|exec(` を diff で検索すると、コードは 0 件 (roadmap の記述 1 件だけ)。src/main・preload・agents・domain の変更も 0 件。観測点の `data-row-status` (9 値の enum) と `data-received-messages` (数値) は会話由来の値を含まない。ストアを window に出す口も 0 件。
- **perf のガード**: `CI` は設定ファイルの読み込み時に throw する (playwright.perf.config.ts:15-17)。test 本体でも `CI` / `CLOSTA_E2E` / 必須の env が無ければ失敗で止める (perf/real-sessions.spec.ts:161-166)。Electron に渡す env からは CLOSTA_E2E を除き、起動の直前に権限モードが `default` であることも確かめている (:89)。承認カードに応答する経路は 0 件。perf 自身が子プロセスを起こす箇所も 0 件。
- **CI での誤実行**: playwright.config.ts の `testDir` は `./e2e` で、perf/ は拾われない。verify.yml に足したのは `tsc --noEmit -p perf/tsconfig.json` だけで、tsc は設定ファイルを実行しない。CI から perf を実行する経路は 0 件。
- **資格情報と環境変数**: perf は `process.env` を丸ごと Electron に渡す。ただしこれは利用者がアプリを直接起動したときと同じ環境で、新たな露出はない。stdout と annotation に出すのは許可リストの record だけ。例外の文に env の値が混ざる点は L-002 にした。
- **成果物 (trace など)**: trace / screenshot / video は off。しかし、**Playwright 1.63 が失敗時に書く error-context.md (ページの aria snapshot) は止まっておらず、実際に会話由来の文字列が一時ディレクトリに残っている** (H-001)。

## Findings

### [High] perf の失敗時に Playwright が error-context.md にページの aria snapshot を書き、会話由来の文字列が成果物として残る (H-001) (scope: feature)

- **観察**:
  - 流れ:
    - `playwright.perf.config.ts:26-28` は `outputDir: join(tmpdir(), 'closta-perf-results')` と `use: { trace: 'off', screenshot: 'off', video: 'off' }` を設定している。12-13 行目のコメントには「会話の本文や作業フォルダの内容を成果物に残さない」とある。
    - しかし Playwright 1.63 (`node_modules/playwright/package.json:3`) は、テストに error があると `willCloseBrowserContext` → `_takePageSnapshot` で `page.ariaSnapshot({ mode: "ai" })` を取る (`node_modules/playwright/lib/index.js:652-676`)。
    - 取った snapshot を `error-context.md` として outputDir に書く (同 :700-716)。
    - この処理は trace / screenshot の設定とは無関係で、無効にできるのは `PLAYWRIGHT_NO_COPY_PROMPT` だけである (:658)。
  - Electron でも発火する:
    - `ElectronApplication.close()` は `this._context.close()` を呼ぶ (`node_modules/playwright-core/lib/coreBundle.js:63528-63536`)。
    - `BrowserContext.close` は `runBeforeCloseBrowserContext` を呼ぶ (:62626)。
    - perf は afterEach で `current.close()` を呼ぶので (perf/real-sessions.spec.ts:150-153)、失敗した回では snapshot が取られる。
  - perf は無効な回を `expect(reason).toBeNull()` (perf/real-sessions.spec.ts:252) で**意図して失敗させる**。quickstart-results の記録では 7 回すべてが無効だった。
  - **実物を確認した**: `%TEMP%\closta-perf-results\real-sessions-実-claude-10--8a847-示中のセッションの入力が滑らか-O-1-SC-005-\error-context.md` がある。22 行目に `Page snapshot` の見出しがあり、その下に直近の活動の行 (`送信:` が 56・64 行目、`応答:` が 69・77・122・130 行目) が含まれている。中身はこのレポートに転記していない。
- **同種事象探索**:
  - `error-context|PLAYWRIGHT_NO_COPY_PROMPT|outputDir` をリポジトリ (node_modules を除く) で検索した。抑止の設定は 0 件で、outputDir の指定は `playwright.perf.config.ts:26` の 1 件だけ。
  - `closta-perf-results/**/*` で探した実在の成果物は 2 件 (error-context.md と .last-run.json)。
  - e2e の設定 (playwright.config.ts) も同じ仕組みで error-context を書くが、中身は stub の固定文言なので会話由来の実データはない。本指摘の対象外。
- **リスク/影響**:
  - FR-012「記録・出力に会話由来の文字列・env を含めない」と、research R-07・SC-005 の許可リストに、観察できる形で反している。
  - 既定のプロンプトは作業フォルダのファイルを最大 80 件読ませて 1 行ずつ要約させるので、snapshot には利用者のリポジトリの内容の要約、送ったプロンプト、tool の入力の先頭 (直近の活動) が入りうる。
  - 平文の Markdown が OS の一時ディレクトリに次の実行まで残る (Playwright は実行開始時に outputDir を消すが、最後の回の分は残る)。
  - list reporter は端末に `Error Context: <path>` を出すので、場所も知られやすい。
  - 同じユーザのローカルにとどまり外部へ送られる経路ではないため、Critical ではなく High とした。
- **推奨アクション**:
  1. `playwright.perf.config.ts` の先頭 (CI のガードの直後) に `process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'` を置く。設定ファイルは worker でも読み込まれるので、worker にも効く。あわせて 12-13 行目のコメントに「error-context の aria snapshot も止める」と書き足す。
  2. 二重の防御として、afterEach で `current.close()` の前に `page.evaluate` で `document.body.replaceChildren()` を実行し、DOM を空にしてから閉じる案もある。
  3. 既に残っている `%TEMP%\closta-perf-results\` を削除し、quickstart-results にその旨を記録する。
  4. research R-07 と tasks.md:92 の成果物の項目に `error-context` (aria snapshot) を加える。
- **根拠**: spec FR-012 / SC-005、research R-07、Constitution Principle V (会話由来のテキストを境界・ログ・永続層に出さない。running-session-store.ts の注記が引く規則)、CWE-532 / CWE-538
- **scope 根拠**: touched files (`playwright.perf.config.ts` / `perf/real-sessions.spec.ts`) の中で直せる。

### [Medium] perf の成果物と出力の方針 (許可リストだけを出す) を検証する手段が無い (M-001) (scope: feature)

- **観察**: 「成果物に本文を残さない」は playwright.perf.config.ts:12-13 のコメントと research R-07 の文面だけで守られている。perf は CI で実行されず、ESLint の対象外 (eslint.config.mjs:180-182)。H-001 は design-gate R1 / R2 の security レビュー (L-009) でも code-gate でも検出されず、実行後に初めて実物として残った。
- **同種事象探索**: `PLAYWRIGHT_NO_COPY_PROMPT|error-context` を scripts/ と tests/ で検索して 0 件。
- **リスク/影響**: Playwright を上げたときに失敗時の成果物 (error-context・attachment) が増えても気づけない。
- **推奨アクション**: 最小案は、quickstart (V-3) の手順に「実行後に outputDir の下に `.last-run.json` 以外が無いことを確かめる」の 1 行を足すこと。機械化するなら、perf の afterEach の最後で `test.info().outputDir` を走査し、想定外のファイルがあれば失敗させる。
- **根拠**: FR-012、Constitution Principle VI (検証できる形で守る)
- **scope 根拠**: feature (quickstart / perf の中で完結する)

### [Low] 直近の活動の正規化が不可視の書式文字 (ゼロ幅文字・タグ文字) を残す (L-001) (scope: feature)

- **観察**:
  - `normalizeLine` (src/renderer/src/features/session/session-view.ts:166-172) は sanitizeBody と `\s+` で畳む処理しか通さない。
  - sanitizeBody の除去対象 (sanitize-body.ts:33-41) には U+200B-200D、U+2060-2064、U+180E、U+E0000-E007F (タグ文字) が入っていない。U+FEFF は `\s` に含まれるので空白に畳まれる。
  - テスト (session-view.monitor.test.ts:76-79) は U+202E だけを確かめている。
- **同種事象探索**: `200B|2060|E0000` を src で検索すると 0 件。transcript 本文と承認カードも同じ集合なので、本 PR で増えた経路はこの 1 か所。
- **リスク/影響**: 並びを入れ替える文字ではないため、表示を偽装する力は弱い。ただ、80 コードポイントの切り詰めを不可視文字で埋めて意味のある部分を押し出したり、同じに見える別の文字列を作ったりはできる。
- **推奨アクション**: domain を変えない範囲で (FR-010)、`normalizeLine` の中で `/[​-‍⁠-⁤᠎]|[\u{E0000}-\u{E007F}]/gu` を除き、テストを 1 件足す。
- **根拠**: spec FR-006 / Edge Cases (表示偽装の防御)、CWE-451
- **scope 根拠**: feature

### [Low] perf の例外の文が env の値と選択肢の一覧をそのまま出す (L-002) (scope: feature)

- **観察**: perf/real-sessions.spec.ts:80 と :82 (`"${wanted}"` と `候補: ${JSON.stringify(texts)}`)、:106 (`runtime-stopped: "${runtime}"`)、:121-123 (Provider の一覧) が、env (`CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` / `CLOSTA_PERF_MODEL`) の値と作業フォルダの表示名の一覧を例外の文に入れている。これらは端末に出て、H-001 の error-context.md にも書かれる。
- **同種事象探索**: perf/real-sessions.spec.ts の `throw new Error(` は 7 件で、そのうち env の値または一覧を含むものが 5 件 (:80, :82, :106, :121-123 のモデル。Provider は :110 経由)。
- **リスク/影響**: 秘密ではなく、表示名やディストロ名である。ただ SC-005 の「出力は許可リストだけ」と FR-012 の「env を含めない」を文字どおりには満たさない。作業フォルダの表示名に顧客名や案件名が入りうる点も残る。
- **推奨アクション**: 例外の文は理由キー (`folder-not-found` など) と件数だけにし、候補の一覧は出さないか件数だけにする。
- **根拠**: spec FR-012 / SC-005
- **scope 根拠**: feature

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `error-context\|PLAYWRIGHT_NO_COPY_PROMPT\|outputDir` (node_modules 以外) | 抑止 0 / outputDir 1 | playwright.perf.config.ts:26 |
| H-001 | `closta-perf-results/**/*` (実在の成果物) | 2 | %TEMP%\closta-perf-results\…\error-context.md, .last-run.json |
| M-001 | `PLAYWRIGHT_NO_COPY_PROMPT\|error-context` in scripts/, tests/ | 0 | — |
| L-001 | `200B\|2060\|E0000` in src | 0 | — (関係する箇所は session-view.ts:166-172 と sanitize-body.ts:33-41) |
| L-002 | `throw new Error(` in perf/real-sessions.spec.ts | 7 (うち該当 5) | perf/real-sessions.spec.ts:80, :82, :106, :121-123 |
| (0 件の確認) | `dangerouslySetInnerHTML\|innerHTML\|outerHTML` (diff の本番コード) | 0 | テストの読み取り 2 件だけ (RunningSessionList.monitor.test.tsx:227,230) |
| (0 件の確認) | `ipcMain\|ipcRenderer\|contextBridge\|exposeInMainWorld\|shell.openExternal\|child_process\|spawn(\|exec(` (diff) | 0 | roadmap の記述 1 件だけ |
| (0 件の確認) | `+++ b/src/(main\|preload\|agents\|domain)` (diff) | 0 | — |

## H (テスト / regression) の所見

- H-001 を検出できるテストはない (M-001)。
- 直近の活動の XSS 境界 (要素 0 件)、非文字列、CR / U+2028 / U+2029、U+202E、長大な入力の上限、読み上げの文に会話由来の値 (Bash / secret) が 0 件であることは、session-view.monitor.test.ts と RunningSessionList.monitor.test.tsx で確かめられている。
- 境界が変わらないこと (SC-006) は diff の 0 件で確認した。障害時の観測点は、perf では理由キーと record の JSON。

## Verdict

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 (H-001) |
| Medium | 1 (M-001) |
| Low | 2 (L-001, L-002) |

- Critical: 0
- High: 1
- Medium: 1
- Low: 2
