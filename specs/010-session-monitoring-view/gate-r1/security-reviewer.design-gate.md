# security-reviewer レビュー: セッション監視ビュー (O-1)

**Run**: 2026-10-02
**Reviewer**: security-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: design-gate 初回

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004 / SC-001: 承認待ち・失敗の強調、件数、live region での通知。live region に入る文字列の出どころを確認した
  - FR-005〜FR-007 / SC-002: 会話由来の文字列 (tool 名・入力の先頭・本文の先頭) を一覧の 1 行に出す。XSS と表示の境界が主な確認対象
  - FR-008 / FR-009 / SC-003: compact 行の `title` / `aria-describedby` に会話由来の文字列が入る
  - FR-010 / SC-006: IPC・状態通知・main・preload を変えないという主張
  - FR-011 / SC-004: 偽の supervisor 接続で流す E2E。CLOSTA_E2E 経路
  - FR-012 / SC-005: 実アプリと実 `claude` 10 本の実機計測 (`perf/`)。資格情報・ログ・CI 境界
  - FR-013: docs の追随。discovery.md に実機計測の行を足す件
- touched files に該当する charter / Confirmation:
  - session charter:124 (資格情報を持たない / Principle V)、KPI「並列時の滑らかさ」:130
  - AD-038 D3 と Confirmation:113-115 (CI env/secrets に実資格情報 0 件、stub は `!app.isPackaged && CLOSTA_E2E` に限る)
  - AD-038 D5 / Confirmation:119 (基準画像に会話由来の情報を含めない。SH-091 で基準画像が変わる可能性あり)
  - AD-043 Decision 4 (状態通知に会話由来の文字列を載せない)、Decision 2 (renderer は受け取った本文の形を検証する)
  - AD-034 (本文は main を通らない)
  - X-5 spec FR-004 / FR-008 / SC-004 (状態通知の全フィールド走査)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:2 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:3
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。セキュリティに関わる ADR (AD-038 D3 / AD-043 D4 / AD-034) について plan の決定との食い違いは見つからなかった (詳細はスコープ要約)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux は optional reviewer の担当 (live region の量と読み上げの UX は対象外。本 reviewer は中に入る文字列の出どころだけを見た)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

renderer だけで閉じる feature である。X-5 の `RunningSessionList` / `thread-list.aui.tsx` を拡張し、ストアに `statusSince` / `density` を足す。会話由来の文字列は「直近の活動」として行の 1 行・`title`・`aria-describedby` に出る。あわせて `perf/real-sessions.spec.ts` を新設し、`CLOSTA_E2E` を付けずに実アプリと実 `claude` 10 本を動かして計測する。

**IPC・状態通知を変えないという主張は、設計の文面上は成り立っている。**
- plan.md:177-194 の Project Structure は renderer・e2e・perf・docs に閉じており、`src/main` / `src/preload` / `src/agents` を含まない。
- data-model.md:52-56 は「変えないもの」として `SessionStatusUpdate`・IPC チャネル・preload capability を挙げている。
- `statusSince` は renderer が状態の遷移を受けた時刻であり、research.md:9 は状態通知に時刻を載せる案を不採用にしている。
- live region の文は research.md:33 で「<作業フォルダの表示名>: 承認待ちになりました」と定められ、data-model.md:48 の `announcement` の引数も `folderName` だけである。会話由来の文字列が live region に入る経路は、設計の文面には無い。
- XSS 境界: data-model.md:28 が React のテキストノードだけで描画し `dangerouslySetInnerHTML` を使わないことを明記している。tasks.md:53 が `<script>` / `**太字**` で要素が 0 件になることをテストする。現時点で実害のある XSS 経路は見つからなかった。

**指摘の中心は実機計測 (perf/) の運用境界**である。CI の外に置く判断そのものは AD-038 D3 と整合している。ただし次の 3 点が設計に書かれていない。
- 結果・失敗時のログ・Playwright の成果物に会話本文が混ざらないようにする強制
- 誤って CI や stub の環境で走らせないための guard
- agent が利用者の同意なしに実行しないための線引き

**owner 外への申し送り**: 実機計測が承認カードを自動で押さないこと (権限ゲートの迂回) は platform-boundary-reviewer (PB-4) の担当のため、本 reviewer は指摘しない。

## Findings

### [Medium] 実機計測の出力・Playwright 成果物・記録ファイルに会話本文やリポジトリ内容が混ざる経路を、設定で塞いでいない (M-001) (scope: feature)

- **観察**:
  - research.md:54 と tasks.md:76 は「結果に env・本文を出さない」と書くが、方法は「spec が出力しない」という書き手の注意だけである。新設の `playwright.perf.config.ts` (plan.md:143) について、`trace` / `screenshot` / `video` / `outputDir` / reporter をどう設定するかの記述が無い。
  - 既存の `playwright.config.ts:15-27` はこれらを明示していない。perf の設定をこれを写して作り、後から `trace: 'retain-on-failure'` などを足すと、DOM スナップショット (transcript 全文・Read したファイルの内容) が `test-results/` に保存される。
  - Playwright は、locator の待機が timeout したときや `toHaveText` が失敗したときの call log に、解決した要素の HTML 断片と受け取ったテキストを標準出力へ出す。perf は 10 行の状態文言の待機 (quickstart.md:29「10 本が応答中になったら」) を行うため、失敗時には行の直近の活動 (会話由来の文字列) が出力に載りうる。
  - tasks.md:77 (SH-033) は、その標準出力と annotation を人が `quickstart-results.md` に写す。このファイルはコミットされる (spec.md:186)。
  - quickstart.md:8 の計測対象フォルダは「読み取りで数十ファイルを辿れるリポジトリ」としか定めていない。秘密を含むリポジトリを選ぶと、Read した内容が上の経路に乗る。
- **同種事象探索**: `trace|screenshot|video|outputDir` を `playwright*.ts` で検索して 0 件 (既存の設定にも明示が無い)。`.gitignore:14-16` で `test-results/` と `playwright-report/` は追跡外になっているが、`quickstart-results.md` は追跡される。
- **リスク/影響**: 会話本文、あるいは利用者リポジトリのファイル内容 (`.env` など) が PR に混入しうる。実害が観察されたわけではない (設計段階) ので High 未満とする。
- **推奨アクション**:
  - plan.md の「E2E と実機計測」節と tasks.md SH-032 に次を明記する。
    - `playwright.perf.config.ts` は `use: { trace: 'off', screenshot: 'off', video: 'off' }`、reporter は `list` だけにする。
    - `outputDir` はリポジトリ外 (OS の一時ディレクトリ) か、gitignore 済みの場所にする。
  - perf spec で失敗を記録するときは理由キーと数値だけを `annotations` に出す。会話由来の文字列を含む locator の `toHaveText` を合否判定に使わない。状態の判定は `data-*` 属性で行う (例: `data-attention` や状態の enum 値を属性にする)。
  - SH-033 / quickstart V-3 で quickstart-results に写す項目を許可リストで定める (p95・long task の最大と件数・メッセージ数・本数・ウィンドウサイズ・プロンプトの識別子)。それ以外を写さないと書く。
  - quickstart.md:8 の計測対象フォルダは「秘密を含まないリポジトリ (例: 本リポジトリの clone)」と指定する。
- **根拠**: Constitution Principle V、AD-038 D5 / Confirmation:119 (基準画像に会話由来の情報を含めないという原則の趣旨)、CWE-532 (ログへの機微情報の出力)
- **scope 根拠**: perf/ と quickstart は本 feature で新設する

### [Medium] 実機計測を「誰が・どの環境で」走らせてよいかに guard が無い (CI・stub 混入・agent による自律実行) (M-002) (scope: feature)

- **観察**:
  - research.md:47 が CI から外れる根拠にしているのは、置き場所 (`testDir` が `./e2e`、CI の job が spec を名指しで実行する。verify.yml:139-159) だけである。perf spec 自身に `process.env.CI` を拒む guard は無い。
  - 既存の `e2e/support/launch.ts:29-33` は `...process.env` をそのまま渡す。perf が同じ形で起動すると、開発者のシェルに `CLOSTA_E2E=1` が残っている場合に stub の composition で動く。偽の supervisor の数値が「実機計測」として記録される。research.md:49 は「CLOSTA_E2E を渡さずに起動する」と書くだけで、環境から受け継ぐ値を消すことを求めていない。
  - plan.md:151 / tasks.md:84 は、discovery.md の Build/Test/Lint 表に実機計測を「人間用・agent 用」の両方で載せる。discovery.md:128 は「agent は agent 用列を使う」と定めている。SH-033 (tasks.md:77) は担当者を指定せずに「3 回行い記録する」としている。このままでは `/cl-implement` などの agent が利用者の同意なしに実 `claude` 10 本を起動しうる。その結果、トークンの消費・登録済み Provider の資格情報の使用・利用者リポジトリの読み取りが起きる。
- **同種事象探索**: `CLOSTA_E2E` を `e2e/` で検索すると、起動 env の組み立ては `e2e/support/launch.ts:31` の 1 件 (`...process.env` を展開)。`playwright.perf|perf/` を `.github/workflows/verify.yml` で検索して 0 件 (現時点では CI に載っていない)。
- **リスク/影響**: (1) 将来 CI の全体実行や設定ファイルの指定を誤ると、実資格情報を要する経路が CI に入り、AD-038 D3 の境界を割る。(2) 計測値が偽になる。(3) 利用者の承認なしに資格情報を使い、課金が発生する。いずれも将来の経路や運用上の経路なので Medium とする。
- **推奨アクション**: SH-032 に次の guard を足す。
  - `perf/real-sessions.spec.ts` の先頭で次のいずれかに当たれば `test.skip` ではなく **fail** で止める。fail にするのは、計測していないのに緑に見える状態を作らないためである。
    - `process.env.CI` が設定されている
    - `CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` が未設定
    - `process.env.CLOSTA_E2E` が設定されている
  - 起動の env では `CLOSTA_E2E` を明示的に削除する (`const { CLOSTA_E2E: _, ...env } = process.env`)。
  - discovery.md の実機計測の行は「agent 用」の列に「agent は実行しない (利用者の明示的な指示があるときに限る)」と書く。SH-033 は担当を「人間 (または利用者が指示した回のみ)」とする。
  - verify.yml に perf が載っていないこと (`playwright.perf` が 0 件) を機械検査に足すかどうかは任意。足すなら Confirmation 相当の 1 行とする。
- **根拠**: AD-038 D3 / Confirmation:113-115、Constitution Principle V、AGENTS.md「AskUserQuestion gated」の趣旨 (利用者の資源を使う判断は人間が行う)
- **scope 根拠**: perf/・discovery.md・tasks.md は本 feature で触る

### [Medium] 直近の活動の導出が、renderer の decoder で型を検証していない part のフィールドを信頼している (M-003) (scope: feature)

- **観察**:
  - data-model.md:23-28 の `deriveActivity` は `pending.toolName` / `pending.input`、tool-call part の `toolName` / `argsText`、text part の `text` を `toActivityLine` に渡す。
  - 一方、renderer の decoder の `isMessage` (`src/renderer/src/features/session/session-event-decoder.ts:28-37`) が検証するのは、`parts` の各要素が `type: string` を持つことだけである。`text` / `toolName` / `argsText` が文字列であることは確かめていない (`isPermissionRequest` は :39-47 で `toolName` / `input` を文字列として検証している)。
  - research.md:14 は「`argsText` は agents の `sanitizeBody` を通った後の値」として、renderer 側での再検証を不要と扱っている。data-model.md:28 の `toActivityLine` は入力を `string` 前提にしており、非文字列のときの扱いを定めていない。
  - 既存の 1 行要約用正規化 `src/domain/session/normalize.ts:79-80` は、入力を `unknown` で受けて非文字列を空に倒す (「非文字列 1 件で一覧全体が落ちていた」pr-gate の教訓:66-68)。`toActivityLine` はこの教訓を引き継いでいない。
- **同種事象探索**: `typeof value.(text|argsText|toolName)` を `src/renderer/src/features/session/session-event-decoder.ts` で検索すると 1 件 (`:43` の PermissionRequest の toolName だけ。message part は 0 件)。
- **リスク/影響**: 形の崩れた part が 1 件届くだけで、`toActivityLine` が `for...of` / `replace` で TypeError を投げうる。一覧の行の描画が落ち、error boundary が無ければサイドバー全体が落ちる。そうなると承認待ちの強調も見えなくなり、FR-001 の「見逃さない」が DoS 的に崩れる。本文の送り手は自前の agents なので、現時点で実害は観察されていない (defense-in-depth)。
- **推奨アクション**:
  - data-model §2 の `toActivityLine` の入力を `unknown` とし、非文字列は空 (`null` の Activity) に倒すと明記する。
  - `toActivityLine` では、双方向制御文字 (`sanitize-body.ts:37-39` / `normalize.ts:41-43` と同じ集合) と U+2028 / U+2029 も除去・空白化する。1 行の表示文脈に入る値として再検証するためである。重複を避けるなら、集合を共有する関数を `domain/session` から再利用する。
  - SH-003 の観点に「`argsText` / `text` / `toolName` が非文字列・undefined でも例外を投げず `null` になる」「U+202E / U+2028 を含む入力が 1 行になり、偽装されない」を足す。
- **根拠**: AD-043 Decision 2 (「renderer は受け取った文字列を復元し、形を検証する」)、X-1 FR-009、CWE-20
- **scope 根拠**: `session-view.ts` の新規関数で直せる。decoder の拡張は不要

### [Low] 会話由来の文字列が、信頼できる UI の文言 (状態・承認待ち) と同じ行に並ぶことによる表示偽装 (L-001) (scope: feature)

- **観察**:
  - spec.md:156-160 / data-model.md:25 の `text` 分岐は、最後の assistant 本文の先頭 1 行をそのまま行に出す。model の出力 (prompt injection されたファイル内容に誘導されうる) が「⚠ 承認待ち」「失敗: …」のような文字列を出すと、`SESSION_ROW_STATUS_LABELS` の状態文言と見分けにくくなる。
  - plan.md:137 は「直近の活動の前置き (「承認を求めています」など)」を labels に置くとするが、`text` / `tool` 分岐にも前置きを付けるか、また会話由来の部分を状態文言から視覚的に分けることは書かれていない。
- **同種事象探索**: 該当なし (新規の表示文脈)
- **リスク/影響**: 強調と件数は状態から決まるので、件数は偽装されない。行の見た目だけが紛らわしくなる (CWE-451)。
- **推奨アクション**: 3 つの kind すべてで、labels 由来の前置き (例:「承認を求めています: 」「実行: 」「本文: 」) を付け、会話由来の部分とは別要素・別の見た目 (muted 系の既存トークン) で出す。どちらの要素も状態文言と同じ要素に入れないことを plan の renderer 一覧節に書く。
- **根拠**: CWE-451、FR-001 (強調は状態から決める)
- **scope 根拠**: RunningSessionList.tsx の行の構成で直せる

### [Low] 「live region に会話由来の文字列を入れない」が spec とテストで固定されていない (L-002) (scope: feature)

- **観察**: research.md:33 / data-model.md:48 では、live region の文は作業フォルダの表示名と固定文言だけになっている。しかし spec FR-004 (spec.md:149) は文の中身を制約していない。tasks.md:40 (FE-003) も、通知の回数は見るが、文に直近の活動が含まれないことは見ない。実装時に「何の承認か」を伝えようとして tool 名や入力を足す誘因がある。
- **同種事象探索**: 該当なし
- **リスク/影響**: 会話由来の文字列が読み上げで自動的に出る (プライバシー・偽装)。共有画面や近くにいる人への露出にもなる。
- **推奨アクション**: FR-004 に「通知の文は作業フォルダの表示名と固定文言だけとし、会話由来の文字列を含めない」と 1 行足す。FE-003 に「承認要求の tool 名・入力の文字列が live region の textContent に含まれない」の assert を足す。
- **根拠**: X-5 FR-004 / AD-043 Decision 4 と同じ方針を renderer 内の自動出力にも適用する
- **scope 根拠**: spec と tasks で直せる

### [Low] 直近の活動に tool 入力 (Bash のコマンドや Edit の差分) の先頭が常時出ることで、トークンなどがサイドバーに露出する (L-003) (scope: feature)

- **観察**: data-model.md:23-24 は、承認待ちと tool 分岐で `pending.input` / `argsText` の先頭 80 文字を出す。たとえば `curl -H "Authorization: Bearer …"`、`export ANTHROPIC_API_KEY=…`、`.env` を対象にした `Edit` の `old_string` は、先頭 80 文字に秘密が入りうる。transcript には元から出る情報だが、本 feature では「表示していない 10 本分」が常時サイドバーに並び、compact では `title` のツールチップにも出る。
- **同種事象探索**: 該当なし (新規の表示文脈)
- **リスク/影響**: 画面共有やスクリーンショットでの露出面が増える。値は会話の中に既にあり、新たな漏洩先 (ディスク・ネットワーク) は無い。
- **推奨アクション**: 今回の feature で直す必要は無い。O-2 の tool ごとの表示 (research.md:15 の (a)) で「対象 (file_path / command の先頭語) だけを出す」形にするときに再検討する、と research R-02 に申し送りを 1 行足す。
- **根拠**: Constitution Principle V (資格情報の露出を最小にする趣旨)、CWE-200
- **scope 根拠**: 記録の追加だけで足りる

### [Low] 実アプリを Playwright で起動する間、main の inspector / CDP ポートが開き、`app.evaluate` で main の文脈に到達できる (L-004) (scope: feature)

- **観察**: Playwright の `_electron.launch` は、main の inspector と remote debugging のポートを localhost に開いてアプリを起動する (`launch.ts:27` の既存の使い方と同じ)。E2E では stub の composition なので問題にならない。perf (research.md:49) では実の composition で、登録済み Provider の資格情報を扱う main が、計測中ずっとデバッグ可能な状態で動く。perf spec が `app.evaluate` (main process で任意コードを実行する) を使えるかどうかは、plan / tasks に書かれていない。
- **同種事象探索**: `app\.evaluate|electronApp\.evaluate` を `e2e/` で検索して 0 件 (既存 E2E は main を evaluate していない)
- **リスク/影響**: 同じユーザ権限のローカルプロセスに限られ、計測中だけの一時的な状態である。perf spec が `app.evaluate` で main の状態 (env・資格情報を含む) を読む形に育つと、M-001 の出力経路に乗る。
- **推奨アクション**: SH-032 に「perf spec は `app.evaluate` (main の文脈) を使わず、renderer の `page.evaluate` で計測の仕込みだけを行う (`e2e/support/input-probe.ts` の範囲)」と 1 行足す。計測が終わったら `app.close()` を `finally` で必ず呼ぶ (既存の `multi-session.spec.ts:207-208` と同じ形)。
- **根拠**: Constitution Principle V、AD-038 D3 の趣旨
- **scope 根拠**: perf/ の新設コードで守れる

### [Low] `dangerouslySetInnerHTML` を禁じる機械強制が無く、XSS 境界がテストと注意書きだけで守られている (L-005) (scope: system)

- **観察**: XSS 境界は data-model.md:28 と tasks.md:53 (FE-012 の `script` / `strong` 0 件) で守られている。一方 `eslint.config.mjs` と `scripts/` に `react/no-danger` / `innerHTML` に当たる規則は無い。
- **同種事象探索**: `dangerouslySetInnerHTML|no-danger|innerHTML` を `eslint.config.mjs` / `scripts/**/*.mjs` / `.dependency-cruiser.js` で検索して 0 件。`src/renderer` の使用は 0 件 (ProviderScreen.tsx:27 と pending-queue-notice.test.tsx:38 は「使わない」旨のコメントだけ)。
- **リスク/影響**: 現時点で実害は無い。会話由来の文字列を表示する箇所が本 feature で増えるため、将来の回帰を lint で止められない。
- **推奨アクション**: 本 feature ではなく system scope として扱う。renderer に `react/no-danger` (または `no-restricted-syntax` で `dangerouslySetInnerHTML` の JSXAttribute を禁止) を足す提案を roadmap に送る。本 feature の FE-012 のテストは維持する。
- **根拠**: OWASP XSS Prevention、Constitution の機械強制の方針
- **scope 根拠**: eslint.config.mjs は本 feature の touched files 外 (plan.md:161 で「変更しない」と宣言済み)

### [Low] セキュリティ上の主張の一部に、それを検出するテストや手順が無い (L-006) (scope: feature) — H

- **観察**:
  - (a) M-003 の非文字列・bidi・U+2028 の入力は、SH-003 の観点 (tasks.md:15) に無い。
  - (b) L-002 の live region に会話由来の文字列を入れないことは、FE-003 (tasks.md:40) で検査されない。
  - (c) M-002 の perf の guard (CI / CLOSTA_E2E / 未設定 env での fail) には、それを確かめる手順が quickstart V-3 (quickstart.md:21-34) に無い。
  - (d) SC-006 の「main・preload・supervisor の差分 0 件」は差分レビューだけで確かめる (spec.md:225)。X-5 の状態通知の全フィールド走査は既存テストとして残るので、AD-043 Decision 4 の回帰は検出できる。
  - (e) 実機計測で無効になった回の理由を、本文を含めずに記録する方法 (理由キーだけを残す) が書かれていない。観測点として不足している。
- **同種事象探索**: 該当なし
- **リスク/影響**: 上の Medium 指摘を直しても、回帰したときに検出できない。
- **推奨アクション**:
  - SH-003 に (a) を、FE-003 に (b) を足す。
  - quickstart V-3 に「`CI=1` を付けて実行すると即座に失敗すること」を確認する手順を 1 行足す。
  - SH-032 に「無効になった回はセッションの行の状態 enum と理由キーだけを annotation に出す」と書く。
  - (d) は現状の手順で足りる。PR の差分で `src/main|src/preload|src/agents` が 0 件であることを pr-gate で確認する、と quickstart に 1 行足すと、手順として明示できる。
- **根拠**: reviewer-base H の規定、Constitution Principle XI
- **scope 根拠**: tasks / quickstart で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `trace\|screenshot\|video\|outputDir` in `playwright*.ts` | 0 | — (既存設定に明示が無い。`.gitignore:14-16` は test-results / playwright-report を除外) |
| M-002 | `CLOSTA_E2E` in `e2e/` (起動 env の組み立て) | 1 | e2e/support/launch.ts:31 |
| M-002 | `playwright.perf\|perf/` in `.github/workflows/verify.yml` | 0 | — |
| M-003 | `typeof value.(text\|argsText\|toolName)` in session-event-decoder.ts | 1 | src/renderer/src/features/session/session-event-decoder.ts:43 (PermissionRequest のみ。message part は 0) |
| L-004 | `app\.evaluate\|electronApp\.evaluate` in `e2e/` | 0 | — |
| L-005 | `dangerouslySetInnerHTML\|no-danger\|innerHTML` in eslint.config.mjs / scripts / .dependency-cruiser.js | 0 | — |
| L-005 | `dangerouslySetInnerHTML\|innerHTML\|outerHTML\|insertAdjacentHTML` in src/renderer | 2 (コメントのみ) | src/renderer/src/features/provider/ProviderScreen.tsx:27, src/renderer/src/features/session/pending-queue-notice.test.tsx:38 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 6
