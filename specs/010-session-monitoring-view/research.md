# Research: セッション監視ビュー (O-1)

spec の決定を実装に落とすときに選んだ点を記録する。各項目は Decision / Rationale / Alternatives considered の形で書く。値と導出の正本は [data-model.md](./data-model.md) であり、ここでは理由だけを書く。

## R-01 状態に入った時刻をどこで記録するか

- **Decision**: renderer のストア (`running-session-store.ts`) で、**行の状態 (`rowStatus`) が変わったとき**に時刻を記録する。port の `state` イベント・状態通知のバッチ・利用者の操作 (終了・強制終了) のいずれで変わっても、ストアの更新の後で `rowStatus(viewOf(state, id))` を前の値と比べる。起動の受付時も、固定値 (`launching`) ではなくその時点の `rowStatus` を評価して入れる
- **Rationale**: 利用者に見えている状態 (行のラベル) と経過時間の起点を一致させる。run-state だけを見ると `done` の応答待ち → 終了済み (生存フラグ false) の遷移で時刻が更新されない。起動の受付 (`launch` は `patch` を通らない) より先に状態通知が届くことがある (`running-session-store.ts` は `inFlight > 0` の間、未知の sessionId の状態通知も受ける) ので、固定値にすると行と食い違う
- **Alternatives considered**: (a) supervisor の状態通知に時刻を載せる — 状態通知のフィールドを変えない (spec FR-010) ので採らない。(b) run-state の遷移だけで記録する — 上の理由で採らない

## R-02 直近の活動の導き方

- **Decision**: メッセージ配列の**末尾 1 件**と承認要求 (`pending`) だけを見て、文字列の走査量にも上界 (先頭 4,096 コードユニット) を置く純関数 `deriveActivity` を `session-view.ts` に置く。末尾が利用者のプロンプト (送信直後) ならその先頭行を出す。tool の入力は `argsText` の先頭をそのまま使い、JSON として解釈しない。文字列の正規化は domain の `sanitizeBody` を行単位で再利用する
- **Rationale**: 計算量を件数に依存させない (X-5 SC-003 の対策と同じ方針)。live 表示には tool の結果が載らない (X-5 plan「user の tool_result は live 表示に載らない」) ので、実行中かどうかは判定できず、判定しない (spec FR-006)。送信直後を空にすると、最初の応答が返るまで何を頼んだセッションかが行から分からない (design-gate po L-002)。renderer の decoder は part のフィールドの型を検証しないので、入力を `unknown` で受けて非文字列を空に倒す (`normalize.ts` の pr-gate の教訓と同じ。design-gate security M-003)
- **Alternatives considered**: (a) tool ごとに対象 (`Edit` の `file_path` など) を `tool-args.ts` で取り出す — 見やすいが、tool ごとの分岐が増え、JSON の解釈が更新ごとに走る。tool の入力の先頭に秘密 (トークンなど) が出うる点と合わせて、O-2 の ui-coverage で tool ごとの表示を決めるときに再検討する (spec Out of Scope)。(b) 本文全体を検索する — 件数に比例するので採らない。(c) 「最後の text part」だけを出す — 複数の text part を持つメッセージで本文の冒頭が出ない

## R-03 行の更新頻度の抑え方

- **Decision**: 2 つの仕組みで抑える
  1. **経過時間**: 1 秒ごとの時計を zustand の小さな store に 1 つだけ置き、**経過時間の表示だけを受け持つ行の子コンポーネント**が selector で `formatElapsed` の結果 (表記の文字列) を選ぶ。表記が変わらなければその子も再描画されず、行本体は時計を購読しないので再描画されない (context で配ると、読むコンポーネントは毎秒再描画される。design-gate R2 architecture L-103)。セッション画面が表示されていないときは時計を止める (ナビの件数は時計を使わない)
  2. **直近の活動**: **間引きを購読の手前に置く**。ストアが `activity[sessionId]` を持ち、`deriveActivity` の入力 (メッセージ・承認要求・行の状態) が変わりうる更新の後 (`statusSince` を見直すのと同じ位置) で「書き込み予定」を立て、セッションごとに 500ms の間隔で `deriveActivity` の結果を書く (最後の値は trailing で必ず書く。値が等しければ書かない)。行は `activity[id]` の値 1 つだけを選ぶ。承認に応じた・強制終了した・失敗が届いたときも `pending` が消えるので、この位置で拾える (design-gate R2 analyze N3 / architecture L-101)
- **Rationale**: 本文の更新は X-5 SC-003 の負荷で 10 本 × 20 件/秒 = 200 件/秒になる。行がメッセージのオブジェクトを選ぶと、upsert のたびに参照が変わって行が再描画される。行の中のフックで表示値を遅らせても再描画の回数は減らない (design-gate analyze C1 / architecture H-003)。X-5 quickstart-results の切り分けでは、long task は表示中のセッション自身の描画と打鍵が重なったときに出るので、裏の行の再描画を確実に減らす
- **Alternatives considered**: (a) 行ごとに `setInterval` — 10 本の時計がずれて再描画が分散しない。(b) `requestIdleCallback` で更新 — 負荷が続くと更新されないまま古い表示が残る。(c) 行の中の `useThrottledValue` — 上の理由で再描画が減らない

## R-04 承認待ちの件数からの移動先

- **Decision**: 「表示中を除く承認待ちのうち、承認待ちになった時刻 (R-01) が最も早いもの」へ移る。移れる先が無いときはボタンを押せない状態にする
- **Rationale**: 長く待たせているセッションから応じる。B に移った後にもう一度押すと、B を除いた最古の C に移る (spec US-1 AC2)。表示中のセッションが承認待ちの列にあるか無いかで規則が分かれない (design-gate po M-001)。押しても何も起きない状態を作らない (po M-002)
- **Alternatives considered**: (a) 表示中の次から循環 — 表示中が列に無いときの起点が定まらず、列にあるときは最古を後回しにする。(b) 行の並び順 (起動順) — 長く待っているものが後回しになる

## R-05 支援技術への通知

- **Decision**: polite な live region を**アプリ全体で 1 つ** (`App` の寿命) 置き、**見ていないセッション** (セッション画面が表示されていて、かつ選ばれているもの以外。セッション画面以外を開いている間は選ばれていたものも含む) が承認待ち・失敗に**入った**ときだけ文を書き込む。同じ更新で複数が遷移したら 1 つの文にまとめる (ストアは 1 回の更新の中の `statusSince` の変化を `setState` 1 回にまとめる)。書き込みのたびに内容を空にしてから入れ、同じ文が続いても読み上げられるようにする。文は作業フォルダの表示名と固定の文言だけで組む
  - **表示名の供給元**: 起動の受付時に、`SessionScreen` が引いた作業フォルダの表示名をストアの各セッション (`folderLabel`) に写す。Announcer は IPC を持たず、ストアだけを読む。引けなかったときは固定の代替語を使う (design-gate R2 architecture M-101)
  - 「見ている」かどうかは、画面の状態 (`stores/ui` の `screen`) と `selectedId` の組で決める (design-gate R2 po H-101 / analyze N2)
- **Rationale**: 行ごとに live region を置くと 10 個が同時に読み上げを競う (R-2 の骨組みで a11y H-001 として指摘された形)。セッション画面以外を開いている間も通知する (USER 決定 2026-10-02 design-gate H-04)。状態通知は 100ms の窓でまとめて届くので、複数の遷移が 1 回の更新で来る (design-gate po M-004)。会話由来の文字列を自動で読み上げない (design-gate security L-002)
- **Alternatives considered**: `role="alert"` — 割り込みが強く、10 本では作業を妨げる

## R-06 compact の行の形と element の口

- **Decision**: compact の行は 1 行に「状態のアイコンと文言・作業フォルダの表示名 (切り詰め)・経過時間」と、行の操作をアイコンのボタン (accessible name は X-5 の操作の文言) で並べる。ランタイム・起動時刻・直近の活動は、導入済みの **Tooltip** (`components/ui/tooltip.tsx`。ポインタとキーボードのフォーカスで出る) と、フォーカス時に読まれる説明 (`aria-describedby` の視覚的に隠した文) で示す。将来の隔離バッジ (I-x) の置き場を行の中に残す。comfortable は X-5 の縦積みの形に経過時間と直近の活動を足す
  - `thread-list.aui.tsx` (R-2 と共有する element) には **session の語彙を持ち込まない**。行の密度と、行の Root に付ける `data-*` 属性 (強調の印・行の状態 `data-row-status`) を解決する関数を context で受ける口 (`RowMetaContext` と同じ形) だけを足し、値は `RunningSessionList.tsx` が決める
  - **Principle XIII の候補の照合** (design-gate R2 architecture L-105):
    - 密度の 2 値の切り替え: 候補 shadcn ToggleGroup (未導入)。2 値の切り替えは導入済みの `Button` + `aria-pressed` で足り、新しい element を足す理由が無いので採らない
    - 件数のバッジ: 候補 shadcn Badge (未導入)。採る。公式の CLI (`shadcn add badge`) で導入し、独自のトークンを足さない
    - compact で外した情報: 候補 Tooltip (導入済み)。採る。`title` 属性はキーボードのフォーカスや触れた操作で出ないので使わない
- **Rationale**: サイドバーの幅は 256px (`SessionScreen.tsx` の `w-64`)、既定のウィンドウの高さは 760px (`window.ts`)。X-5 の縦積みの行 (表題の段 + 操作の段) は 1 行あたり約 70px あり、10 行で一覧の高さを超える。操作を同じ段に置けば 1 行 32px 前後になり、10 行が収まる。element は「体裁だけを持つ」と自ら宣言している (`thread-list.aui.tsx:36-40`。design-gate architecture L-001)。隔離状態は「一目で分かること」が isolation charter の不変条件である (design-gate platform-boundary M-005)
- **Alternatives considered**: (a) compact では操作を隠し、行を選んだ先で操作する — spec FR-008 (どちらの密度でも操作を出す) に反する。(b) 「…」メニューに畳む — 1 操作増える。終了・強制終了は頻繁に使う
- **`ui` domain への申し送り**: element の選定と見た目は `ui` の領分である。本 plan はアイコンの種類を決めない。独自 element を新設しない

## R-07 実機計測の置き場・負荷の作り方・安全柵

- **Decision**:
  - **置き場**: 計測の spec を **`perf/real-sessions.spec.ts`**、設定を **`playwright.perf.config.ts`** (`testDir: './perf'`) に置く。`e2e/` の外に置くので、CI の e2e job (spec を名指しで実行) にも、全体実行 (`testDir: './e2e'`) にも載らない。AD-038 D2 が `e2e/` に掛けた分離 (eslint の ignores・depcruise の `not-to-test`・専用の型検査) を `perf/` にも同じ形で掛ける (plan「機械強制の変更」)
  - **共有**: 計測の仕込み (long task と入力遅延) は `e2e/multi-session.spec.ts` から **`e2e/support/input-probe.ts`** に切り出し、E2E と実機計測で同じ定義を使う。perf は renderer の `page.evaluate` だけを使い、main の文脈 (`app.evaluate`) を使わない
  - **安全柵**: `playwright.perf.config.ts` は読み込み時に `CI` が設定されていれば例外で止まる。spec の先頭で `CI`・`CLOSTA_E2E` の設定や `CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` の未設定を見つけたら **skip ではなく失敗**で止める (計測していないのに緑に見える状態を作らない)。起動の env からは `CLOSTA_E2E` を明示的に取り除き、起動後に本物の composition であること (E2E stub が seed するフォルダ・ランタイムが無く、指定したランタイムがある) を確かめる
  - **観測点**: 判定に使うのは一覧の `data-row-status` (各行の状態) と `data-received-messages` (全セッションの受信メッセージの累計) だけ (data-model §1)。これらは会話由来の値を含まない。本番の composition にストアを晒す global は作らない (design-gate R2 architecture H-101 / po H-102)。窓の中のメッセージ数は、窓の始まりと終わりの累計の差とする
  - **成果物**: `trace` / `screenshot` / `video` は `off`、reporter は `list`、`outputDir` は gitignore 済みの場所。状態の判定は locator の待機ではなく、`page.evaluate` で `data-*` の値だけを配列にして返す関数の `expect.poll` で行う (locator の timeout 時の call log に要素の HTML の抜粋を出さない。design-gate R2 security L-009)。結果は数値と理由キーだけを annotation と標準出力に出す。perf は子プロセスを自ら起こさない (Playwright 経由でアプリを起動するだけ)
  - **負荷**: 負荷は**メッセージの数**で作る。live 表示は SDK のメッセージ単位で更新され、チャンク単位では更新されない (`live-message.ts` の注記) ので、長い文章を 1 つ書かせても更新は 1 回である。既定のプロンプトは「読み取り専用の tool (Glob / Read) を回数の上限つきで小刻みに繰り返し、そのたびに 1 行で報告する」もので、既定の権限モードで承認を要さない。プロンプトは環境変数で差し替えられる。作業フォルダは秘密を含まない使い捨てのリポジトリ (例: 本リポジトリの clone) を使う
  - **有効な回**: 計測の窓は 30 秒。窓の始まりと終わりで 10 本の行の状態を確かめ、窓の全期間で 10 本が応答中で、窓の中で届いたメッセージ数が下限以上 (spec FR-012) の回だけを有効とする。承認待ちに入ったセッションがあれば無効とし、承認カードには応答しない。**2 点の確認で全期間を代表できる理由**: 計測は承認に応じず追加の送信もしないので、窓の途中で応答中を外れたセッション (応答待ち・承認待ち・失敗) は応答中に戻らず、終わりの時点でも応答中ではない
  - **後始末**: test の timeout を明示する。後始末は test 本体の `finally` ではなく **`afterEach` (または `ElectronApplication` を返す fixture の teardown)** に置く (Playwright は test 本体のタイムアウトで本体の `finally` を待たない。design-gate R2 platform-boundary M-002)。teardown は 3 段: 一覧の強制終了の操作で全セッションを止める → `app.close()` (main の `dispose()` が `claude` の終わりを待つ) → 期限を超えたら `app.process().kill()`。hook の timeout は test の timeout とは別に明示する。各回 (無効の回を含む) の後に、ホストの `wsl.exe` と WSL 内の `claude` の数が起動前に戻ったことを人が確かめる (AD-043 Confirmation と同じ観測)。残っていたら WSL 内の該当プロセスを止め、AD-043 Decision 5 の残余として X-6 に記録する
  - **機械強制**: `playwright.perf.config.ts` も `perf/tsconfig.json` の型検査に含める (CI のガードを持つファイルを静的検査の外に置かない)。`perf/` が check.mjs の走査範囲 (`SCAN_ROOTS`) の外にあることは、AD-038 D4 (verify.yml が `SCAN_FILES` に無いという別の死角) とは別の死角として roadmap に system-scope の項目で記録する (走査範囲の変更は ADR を要する。`allowlists.mjs:4`)
- **Rationale**: 実 `claude` のトークンと WSL・登録済みの Provider を要するので CI に載せない (spec FR-012)。計測の定義を 1 箇所に置き、E2E と実機の値を比べられるようにする。環境に `CLOSTA_E2E` が残っていると E2E stub で走り、偽の値が「実機の値」として記録される (design-gate platform-boundary M-001)。会話の本文や作業フォルダのファイル内容がコミットされる記録に混ざる経路を、書き手の注意ではなく設定で塞ぐ (security M-001)
- **Alternatives considered**: (a) DevTools の Performance 記録を人が読む — 再現性が下がる (USER 決定で不採用)。(b) `e2e/` に置いて `test.skip` で外す — CI の全体実行で読み込まれ、`CLOSTA_E2E` の前提と混ざる
- **副作用**: 実 `claude` は WSL 内に会話の履歴 (transcript) を書き、R-2 のセッション一覧に並ぶ。アプリはこれを消さない (Principle X)。計測専用の使い捨てリポジトリを使うのはこのためでもある

## R-08 i18n リソース化の判断 (Constitution の「M3 (O-1〜O-3) までに判断する」)

- **Decision**: 本 feature では判断しない。新しい文言は既存の `labels.ts` に置く (X-5 と同じ形)。判断の持ち主は M3 の最後の feature (O-3) とし、roadmap の O-3 行に申し送る
- **Rationale**: O-1 は文言を十数個足すだけで、リソース化の要否を決める材料 (画面全体の文言の量・言語の切替の要否) を持たない。判断の期限 (M3 まで) は守られる
- **Alternatives considered**: O-1 でリソース化する — renderer 全体に及び、本 feature の範囲 (サイドバーの拡張) を超える

## R-09 ナビの承認待ちの件数 (USER 決定 2026-10-02 design-gate H-04)

- **Decision**: グローバルのナビ (`App.tsx` のヘッダ) の「セッション起動」ボタンに、承認待ちの件数と失敗の件数を別々に出す (失敗は design-gate R2 の USER 決定)。件数は稼働中セッションのストア (`App` の寿命で張られている) から `attentionCounts` で導く。0 件のものは出さない。色だけに頼らず、件数の数字と accessible name (「承認待ち N 件」「失敗 N 件」) を伴う。件数の部品 `SessionNavBadge` は session feature が export し、`App` は「セッション起動」の行にそれを差し込むだけにする (App シェルは「画面の切り替えとテーマだけを持つ」と宣言しているため。design-gate R2 architecture L-102)。ナビの件数は表示だけで、押したときはセッション画面に切り替わるだけ (承認待ちへの移動はセッション画面の見出しの件数が担う)
- **Rationale**: 強調と件数がサイドバーにしか無いと、過去セッションの一覧などを開いている間に承認待ちや失敗を見逃す。ストアは既に `App` の寿命なので、renderer の中で閉じたまま (IPC を変えずに) 出せる
- **Alternatives considered**: (a) 「セッション画面以外では通知しない」と範囲外にする — 利用者が不採用とした。(b) OS の通知 — spec Out of Scope
