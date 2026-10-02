# Tasks: セッション監視ビュー (O-1)

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md) / [data-model.md](./data-model.md) / [research.md](./research.md)

**記法**: `[FE]` renderer / `[SH]` 横断 (docs・規則・E2E・計測・検証)。`[P]` は同じ節の中で他と並行に進めてよいもの。

**規則の正本**: 振る舞いの正本は spec の FR / SC、値と導出の正本は data-model、方式の理由は research である。本書は作業単位とテストの観点だけを書き、規則を書き写さない。

**順序の制約**: SH-001 (glossary) → reviewer の確認 → コード。SH-033 (実機計測) は pr-gate の前 (spec FR-012 の完了条件。**2026-10-02 に改訂** — 有効な回 0 件で利用者が SC-005 を閉じた。spec FR-012 の改訂の行)。

## Shared Tasks (先行: 用語・規則・ストア・導出)

- [x] **SH-001** [SH] **glossary を追随させる** (Principle XIV。spec FR-013 / plan「記録の追随」)。`docs/glossary.md` の Canonical Terms に、英語見出しと識別子の対応 (Monitoring view / Recent activity `Activity` / Density `density` / Slot usage `slotUsage` / Status since `statusSince` / Immersive view) を書き、Running session list の定義に「監視ビューは本一覧を拡張したもの。session の操作 UI」を足す。Counterexamples: 直近の活動は状態通知に載らない / 枠の使用数は Concurrency limit の現在値の表示であり上限そのものではない。**reviewer (architecture-reviewer) の確認を経てから SH-002 以降のコードに進む**
- [x] **SH-005** [SH] [P] **`perf/` の分離を先に入れる** (plan「機械強制の変更」): `eslint.config.mjs` の ignores に `perf/**` と `playwright.perf.config.ts` / `.dependency-cruiser.js` の `not-to-test` の prefix に `perf`。`perf/tsconfig.json` と verify.yml の型検査の step は SH-032 と同じ変更で入れる (include が空だと落ちる)
- [x] **SH-002** [SH] `running-session-types.ts` — `statusSince` / `activity` / `receivedMessages` / `density`、`LiveSessionState.folderLabel` を足す (data-model §1)。SH-001 の後
- [x] **SH-003** [SH] `session-view.ts` — `deriveActivity` / `toActivityLine` / `formatElapsed` / `slotUsage` / `attentionCounts` / `nextAwaiting` / `announcements` + 単体 (`session-view.test.ts`。SC-001 / SC-002)。観点:
  - `deriveActivity`: data-model §2 の表の 5 行それぞれ / 承認要求が他より優先される / 応答中でなければ末尾が tool の呼び出しでも tool を返さない / 送信直後 (末尾が user) はプロンプトの先頭行 / reply は part を連結せず、最初に空でない行を出した part で止まる / `text` が非文字列の part を飛ばす (`undefined` という文字列を出さない) / 承認の `input` が空でも tool 名は残る / 末尾 1 件より前を見ない
  - `toActivityLine`: 非文字列・`undefined` で例外を投げず `''` / 先頭が空行のときは最初の空でない行 / CR・U+2028・U+2029 で行が分かれる / U+202E などの双方向制御文字が消える / タブと連続空白の畳み込み / 80 コードポイントでの切り詰めと `…` / サロゲートペアを割らない / HTML・マークダウンの文字列がそのまま文字列として返る / **走査の上界**: 200KB の 1 行目が短い本文で処理が 1 行目に閉じる・先頭に空行や空白の行が 200KB 続く入力と 200KB の text part が 20 個の reply で、走査が先頭 4,096 コードユニットに閉じて `''` になる
  - `formatElapsed`: 59 秒・60 秒・59 分・60 分・数時間の境界 / 負の値は 0 秒
  - `slotUsage`: domain の `countOccupying` と同じ結果になる / `launching` / `done` / `interrupted` / 生存中の `error` / 強制終了を押したがまだ生存中を数え、生存フラグ false を数えない / 起動要求中 (`launch.phase === 'launching'`) は +1
  - `attentionCounts`: 承認待ちと失敗の数
  - `nextAwaiting`: 表示中を除いた最古 / 表示中が列に無いときも最古 / 表示中だけ・0 本なら `null` / 同時刻は `order` の順
  - `announcements`: 見ていないセッションが承認待ち・失敗に**入った**ときだけ文を返す / `watchedId` が `null` (セッション画面以外) なら選ばれていたセッションの遷移も文になる / 同じ更新の 2 本は 1 つの文 / 状態が変わらない・応答中 ⇄ 応答待ち・見ているセッションの遷移では `null` / `folderLabel` が `null` なら固定の代替語で文が壊れない / 文に会話由来の文字列が入る経路が無い (引数に取らない)
  - **実装時の変更 (テストの置き場)**: O-1 で足した観点は既存の `session-view.test.ts` に混ぜず、`session-view.monitor.test.ts` に分けた (X-5 の観点と O-1 の監視ビューの観点を分けて読めるようにするため)。SH-004 / FE-003 / FE-012 / FE-022 も同じ形 (`running-session-store.monitor.test.ts` / `RunningSessionList.monitor.test.tsx`)。`SessionAttentionAnnouncer` と `SessionNavBadge` のテストは、一覧と同じ状態の組み立てを使うため `RunningSessionList.monitor.test.tsx` に同居させた (code-gate convention M-001)
- [x] **SH-004** [SH] `running-session-store.ts` — 状態に入った時刻の記録・直近の活動の間引き・受信件数・表示名の写し・`setDensity`・`selectNextAwaiting` + 単体 (`running-session-store.test.ts`。fake の時計とタイマ)。観点:
  - port の `state`・状態通知のバッチ・終了 / 強制終了の操作のいずれで行の状態が変わっても `statusSince` が更新される / 変わらない更新では `statusSince` の参照が変わらない / **状態通知のバッチで 2 本が変わっても `statusSince` の参照の変化は 1 回**
  - `done` の応答待ち → 生存フラグ false (終了済み) で時刻が更新される
  - 起動の受付でその時点の `rowStatus` と表示名 (`folderLabel`) が入る。handshake より先に状態通知 (`ready`) が届いていた場合も `launching` で上書きしない
  - 直近の活動: 500ms の間に `message` を 20 回流しても `activity` の書き込みは先頭 1 回 + trailing 1 回で、最後の値が残る / 承認に応じた・強制終了した・`failure` が届いた・状態通知だけで行の状態が変わった後、間引きの間隔の内に承認の表示や tool の表示が消える / 値が等しければ書かない
  - `receivedMessages` は port の `message` ごとに 1 増え、他の更新では変わらない
  - `close` で `statusSince` / `activity` が消え、間引きのタイマが止まる
  - `selectNextAwaiting` が `nextAwaiting` の結果を表示中にし、`null` なら何もしない
  - 密度は切り替え・起動・終了・閉じるを通して保たれる (FR-009)
  - **実装時の変更 (ファイルの大きさ)**: 派生値の追跡と間引き (`trackDerived` / `scheduleActivity` ほか) を足して `running-session-store.ts` が 587 行になり、500 行の目安を超えた。別モジュール (`running-session-monitor.ts` など) への切り出しは、O-2 で派生値が増える前に行う宿題として残す (code-gate convention M-002。本 feature では見送った)

## US-1 — 承認待ちと失敗を見逃さない (P1)

**Goal**: 表示中かどうか・どの画面にいるかにかかわらず承認待ちと失敗に気づけ、承認待ちの件数から 1 操作で移れ、遷移が支援技術に 1 回だけ伝わる (spec US-1 / FR-001〜FR-004)。

**Independent Test**: 一覧・ナビ・live region・セッション画面の component テスト (spec US-1 Independent Test)。

- [x] **FE-001** [FE] `thread-list.aui.tsx` — 行の Root に付ける `data-*` 属性を解決する関数を context で受ける口を足す (plan renderer 一覧節)。session の語彙を element に書かない。R-2 の一覧は渡さないので現状のまま
  - **実装時の変更**: Root への属性の口は作らなかった。element の行 (Root) は meta の更新で再描画されないため、Root に付けた状態の属性は古くなる。強調の印 (`data-attention`) と行の状態 (`data-row-status`) は `RunningSessionList.tsx` が meta の中の状態の要素に付ける。element に足したのは密度 (`density`) とツールチップ (`renderTooltip`) の口だけ
- [x] **FE-002** [FE] `RunningSessionList.tsx` + `labels.ts` + `components/ui/badge.tsx` (shadcn の公式 CLI で導入) — 見出しの承認待ちの件数ボタン (`selectNextAwaiting`。移れる先が無ければ押せず理由を説明に出す)・失敗の件数 (押せない表示)・承認待ち / 失敗の行の強調 (アイコン + 文言。色だけに頼らない)・失敗の行の理由キーの文言・`data-row-status` (FE-001 の実装時の変更のとおり、行の Root ではなく状態の要素に付けた)。独自のカラー / スペーシングのトークンを足さない (Principle XIII)
- [x] **FE-004** [FE] `SessionAttentionAnnouncer.tsx` / `SessionNavBadge.tsx` (新設) + `App.tsx` + `SessionScreen.tsx` + `labels.ts` — `App` の寿命の polite な live region (画面の状態と `selectedId` から見ているセッションを決め、`announcements` の結果を空にしてから書く。表示名はストアの `folderLabel` だけ)・ナビの「セッション起動」の件数 (承認待ちと失敗を別々に。0 件は出さない。accessible name「承認待ち N 件」「失敗 N 件」)・`App` は差し込むだけ (冒頭コメントを改める)・`SessionScreen` は起動時に表示名を渡す
- [x] **FE-003** [FE] `RunningSessionList.test.tsx` / `SessionAttentionAnnouncer.test.tsx` / `SessionNavBadge.test.tsx` / `SessionScreen.test.tsx` — 観点 (SC-001):
  - 表示中以外が承認待ちになると、その行が強調され (アイコンの accessible な文言を含む)、見出しとナビの件数が 1 になり、行の並びは変わらない
  - 承認待ちが 2 本のとき、件数を押すと先に承認待ちになった方へ移り、**その承認カードが描画され**、もう一度押すと次へ移る / 表示中しか承認待ちが無ければボタンが押せず、理由が読める
  - 件数を押した直後に移り先の承認待ちが解けても例外にならない
  - 承認に応じて応答中へ戻ると、強調が消え件数が減る
  - 失敗の行は承認待ちと別の印で、理由キーの文言が出る / 見出しとナビの失敗の件数が失敗の本数と一致し、見出しのものは押せない
  - live region の文は承認待ち・失敗に入ったときに 1 回だけ変わり、見ているセッションの遷移・応答中 ⇄ 応答待ちでは変わらない / 同じ状態通知のバッチの 2 本は 1 つの文 / 同じ文が続いても書き換わる / 承認要求の tool 名・入力・本文の文字列が live region の textContent に含まれない / 表示名が引けないときも文が壊れない
  - セッション画面以外を表示している間に、**選ばれていたセッション**を含めて承認待ち・失敗になると、ナビの件数が出て live region に文が入る

## US-2 — 各セッションが何をしているか一覧で分かる (P1)

**Goal**: 各行に経過時間と直近の活動が出て、見出しに枠の使用数が出る (spec US-2 / FR-005〜FR-007)。

**Independent Test**: 導出の単体 (SH-003) + ストアの単体 (SH-004) + 一覧の component テスト。

- [x] **FE-010** [FE] `useSessionClock.ts` + 単体 — 1 秒の時計を持つ小さな store とフック。セッション画面がマウントされている間だけ動く (fake timers)
- [x] **FE-011** [FE] `RunningSessionList.tsx` + `labels.ts` — 経過時間の子 `ElapsedTime` (時計と `statusSince[id].at` だけを読む)・直近の活動 (`activity[id]` を選ぶ。kind ごとの前置きと会話由来の部分を別の要素で出し、状態の文言の要素と分ける)・見出しの枠の使用数 (`slotUsage`)・上限時の空け方の案内 (X-5 の `session-limit` の文言を再利用。新規起動の導線は無効にしない)・観測点 (`receivedMessages` だけを購読する視覚的に隠した要素の `data-received-messages`)。`useRowFacts` は本文の配列・メッセージのオブジェクト・時計を選ばない。冒頭コメントの「監視ビューは O-1 の領分」を改める (plan 申し送り #21)
- [x] **FE-012** [FE] `RunningSessionList.test.tsx` — 観点 (SC-002 / SC-006):
  - 経過時間が時計の進みで更新される / 状態が変わると 0 から数え直す
  - 承認待ち・応答中で末尾が tool の呼び出し・送信直後・応答待ちの各行に、対応する前置きと直近の活動が出る
  - `<script>` や `**太字**`・改行・長い文字列を含む本文で、直近の活動が 1 行の文字列として出て、要素として描画されるもの (`script` / `strong` など) が 0 件
  - 枠の使用数が 8/10 の形で出て、終了済みを数えず起動要求中を数える / 10/10 で空け方の案内が出て、新規起動の導線は押せる
  - **行本体の描画回数** (React Profiler の `onRender`): 状態を変えずに本文を 500ms の間に 20 回更新したとき、各行本体の描画が 3 回以下で、最後の値が出る / 時計が進んでも行本体は再描画されない (経過時間の子だけが再描画される) / 表示していないセッションの本文の更新で、他の行が再描画されない / 本文の到着で一覧の Root が再描画されない (`data-received-messages` の要素だけが更新される)

## US-3 — 情報密度を切り替えて 10 本を 1 画面に収める (P2)

**Goal**: compact / comfortable を切り替えられ、compact で 10 行が 1 画面に収まり、全角の長い表示名でも崩れない (spec US-3 / FR-008 / FR-009)。

**Independent Test**: 一覧の component テスト + E2E (spec US-3 Independent Test)。

- [x] **FE-020** [FE] `thread-list.aui.tsx` — 行の密度を受ける口 (context) と compact の形 (操作を同じ段に横並び。折り返さない。表示名は切り詰め) を足す (research R-06)。口を使わないとき (R-2) は現状のまま
- [x] **FE-021** [FE] `RunningSessionList.tsx` + `labels.ts` — 見出しの密度の切り替え (導入済みの `Button` + `aria-pressed`)・compact の行 (状態・作業フォルダの表示名・経過時間 + 操作のアイコンボタン。accessible name は X-5 の操作の文言)・compact で外した情報 (ランタイム・起動時刻・直近の活動) を導入済みの Tooltip とフォーカス時の説明 (`aria-describedby`) で読めるようにする。将来の隔離バッジの置き場を行の中に残す (spec FR-008)
  - **pr-gate R1 で補った点**: 隔離バッジの置き場は compact の分岐に注記として置いた (状態の印の前。I-2 が置く。architecture L-001)。compact の失敗の行は印の横に短い理由を出し、全文と終了の告知 (強制終了 / 強制停止) はツールチップと読み上げに出す (po M-002)
- [x] **FE-022** [FE] `RunningSessionList.test.tsx` — 観点 (SC-003 の component 側): compact の行に状態・表示名・経過時間と操作が出て、ランタイム・起動時刻・直近の活動が説明として読める / compact でも US-1 の強調・件数・live region が同じに出る / 密度は切り替え・新規起動・表示の切り替えで保たれる
- [x] **FE-023** [FE] R-2 のセッション一覧の既存テストを回帰として流す (`thread-list.aui.tsx` の変更が波及しないこと。plan RK-05)

## US-4 — 実 `claude` 10 本が応答を流す中でも入力が滑らか (P2。範囲から削らない)

**Goal**: 監視ビュー込みで X-5 SC-003 の閾値を保ち、実 `claude` 10 本の実機計測を記録する (spec US-4 / FR-011 / FR-012)。

**Independent Test**: E2E + 実機計測の手順 (spec US-4 Independent Test)。

- [x] **SH-030** [SH] `e2e/support/input-probe.ts` — `e2e/multi-session.spec.ts` の計測の仕込みと集計を切り出す (plan E2E 節)。E2E の挙動と閾値は変えない
- [x] **SH-031** [SH] `e2e/multi-session.spec.ts` — SC-003 のテストを、comfortable で経過時間と直近の活動 (本文の分岐) が出ていることを assert してから流す (SC-004。強調は含めない — USER 決定)。compact で 10 本の行がすべて一覧の可視領域に収まり、各行で `scrollWidth <= clientWidth`、操作のボタンの boundingBox が行の内側にあることのテストを足す (SC-003。既定のウィンドウサイズ)。`src/main/app/e2e-capability.ts` は変えない
- [x] **SH-032** [SH] `perf/real-sessions.spec.ts` + `playwright.perf.config.ts` + `perf/tsconfig.json` + verify.yml の型検査の step — 実機計測 (research R-07 / quickstart V-3)。観点:
  - 安全柵: config は `CI` で例外 / spec は `CI`・`CLOSTA_E2E` の設定、`CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` の未設定で**失敗** (skip にしない) / 起動の env から `CLOSTA_E2E` を取り除く / 起動後に本物の composition であることを確かめ、結果に `composition: real` を出す / perf は子プロセスを自ら起こさない (`child_process` や `wsl.exe` を使わない) / `app.evaluate` を使わない
  - 観測: 判定は `page.evaluate` で一覧の `data-row-status` と `data-received-messages` の値だけを返す関数の `expect.poll` で行う (locator の待機を使わない。失敗時の出力に要素の HTML を出さない) / 窓の中のメッセージ数は窓の始まりと終わりの累計の差
  - 成果物: `trace` / `screenshot` / `video` は off、**失敗時の error-context (aria snapshot) も off** (`PLAYWRIGHT_NO_COPY_PROMPT=1`。pr-gate R1 security H-001)、reporter は `list`、`outputDir` は gitignore 済みの場所
  - 負荷: 10 本を起動して既定のプロンプト (繰り返しの上限つき。`CLOSTA_PERF_PROMPT` で差し替え可) を送る / 10 本が応答中になってから 30 秒打鍵する
  - 有効な回: 窓の始まりと終わりで 10 本が応答中、承認待ち・応答待ち・失敗が 0 本、窓の中のメッセージ数が下限以上 (spec FR-012)。満たさなければ無効として理由キーだけを出す。承認カードには応答しない
  - 出力: spec SC-005 の許可リストの項目だけ。env・本文を出さない
  - 後始末: test の timeout を明示 / **`afterEach` (または fixture の teardown)** で、一覧の強制終了の操作で全セッションを止める → `app.close()` → 期限を超えたら `app.process().kill()`。hook の timeout を別に明示する
- [x] **SH-033** [SH] **実機計測を行い記録する** (SC-005。**pr-gate の前に済ませる完了条件**)。**担当は利用者 (または利用者が明示的に指示した回の agent)**。quickstart V-3 の手順で有効な回を 3 回得て、spec SC-005 の許可リストの項目だけを `quickstart-results.md` に書く。無効の回は理由キーを書く。E2E (SH-031) の値も並べる。有効な回が 3 回そろうまで `/cl-pr-gate` / `/cl-done` に進まない。有効な回で閾値を割った場合は feature を止め、原因を切り分けて記録し、利用者が判断する (閾値も有効な回の下限も黙って緩めない。変えるときは利用者に諮り、変えた値と理由を記録する)
  - **実施結果 (2026-10-02)**: 利用者の指示で agent が 7 回計測。有効な回は得られず (実 claude が窓の途中で応答を終える)、**利用者判断で締めた**。手順を直した後の 4 回は入力遅延 p95 13.6〜14.9ms・long task 0 件。詳細と残す宿題は quickstart-results の V-3

## Polish — 記録の追随と検証

- [x] **SH-090** [SH] **docs を追随させる** (spec FR-013 / plan「記録の追随」)
  - session charter: Out of scope の「監視ビューの見た目と element 選定 → ui」を「承認カードと transcript の見た目・element 選定 → ui。稼働中セッション一覧 (監視ビュー) は session の操作 UI」に改める (USER 決定)・Journey 3 の読み替え・KPI「並列時の滑らかさ」の計測経路 (E2E + `perf/` の実機手順)・Related Specs に O-1・末尾の「X-6 / O-1 は未着手」を「X-6 は未着手」に・Open Questions に「Hook / Background task の状態管理は session に含めない (O-1 で判断。表示の割当と状態の持ち主は O-2)」と「終了済みセッションの件数の上限は持たない (O-1 で再検討した結論)」
  - ui charter: In scope の密度の分担 (一覧の行は O-1、transcript は O-2)・Journey 4 の読み替えの注記・Open Questions に Hook / Background task の持ち主の判断 (O-2)
  - `_overview.md`: 「帰属の判断根拠」に Hook / Background task の 1 行
  - roadmap: O-1 行の状態 / O-2 行に申し送り (Hook / Background task の表示の割当と状態の持ち主、Tool group の既定 open 化 (AD-035)、transcript の情報密度の切替、直近の活動の tool ごとの整形) / O-3 行に i18n リソース化の判断 (Principle XV の期限 M3) / I-2 行に compact の行の隔離バッジ / **新しい system-scope の項目**「`e2e/` / `perf/` が check.mjs の `SCAN_ROOTS` の外にある。足すか足さない理由を ADR で決める」(AD-038 D4 の項目とは別) / renderer の `dangerouslySetInnerHTML` を lint で禁じる提案 (system scope)
  - discovery.md: "Build / Test / Lint" 表に実機計測の行 (人間用。agent 用の列は「利用者の明示的な指示があるときだけ実行する」)・環境変数 3 つと既定値・CI に載せない旨
- [x] **SH-091** [SH] 日本語スクリーンショット比較 (`e2e/composer-screenshot.spec.ts`) を流し、差分が出たら基準画像を更新して AD-038 D5 の承認を PR で求める (plan RK-04)
- [x] **SH-092** [SH] [P] 型検査 (`tsc --noEmit`。src と e2e / perf)・lint・depcruise・単体・E2E を流す (コマンドは discovery.md の agent 用の列)。**`git diff --name-only main...HEAD -- src/main src/preload src/agents src/domain` が 0 件**、**`.github/workflows/verify.yml` に perf の実行 (`playwright.perf`) が 0 件** (型検査の step だけ) であることを確かめる (SC-006 / quickstart V-5)
- [x] **SH-093** [SH] [P] quickstart V-4 の目視 (承認待ちの強調と移動・別画面でのナビの件数と読み上げ・compact の操作・全角の長い表示名の compact の行・ナレーターでの読み上げ) を行い、`quickstart-results.md` に記録する
  - **実施時の変更**: ナレーターでの読み上げの目視は利用者判断でスコープ外にした (2026-10-02)。読み上げの中身は component テストで固定し、実際の聞こえ方は pr-gate の a11y-reviewer の観点に残す

## pr-gate Round 1 の対応 (2026-10-03。利用者が直す範囲を決めた)

- [x] **PR-01** [SH] H-01: `playwright.perf.config.ts` で `PLAYWRIGHT_NO_COPY_PROMPT=1` (error-context を止める)。research R-07 / SH-032 の成果物に error-context を足し、残っていた `%TEMP%\closta-perf-results\` の削除を quickstart-results に記録
- [x] **PR-02** [SH] H-02 / M-03 / M-04: KPI「並列時の滑らかさ」の宿題を roadmap の O-3 の「義務 (O-1 から)」に登録し、charter と quickstart-results から指す。roadmap の O-1 の行を今の状態に直す。quickstart-results の行の切り替えの記述を観測に書き直し、E2E の long task 33 件の評価を V-3 の結論に足す
- [x] **PR-03** [SH] M-01: FR-012 の完了条件の下に改訂の行を足し、plan / quickstart / tasks から指す
- [x] **PR-04** [FE] M-02 / L-03 / L-04 / L-06: compact の失敗の短い理由と終了の告知 (`RunningSessionList.tsx`)・押せない理由の区別 (`labels.ts`)・不可視の書式文字の除去 (`session-view.ts`)・隔離バッジの置き場の注記。テスト: compact の失敗 / 終了の告知、表示中だけが承認待ちのときの理由、不可視文字。E2E: compact の幅の測定に強制終了と終了済みの行を混ぜる (失敗の行は E2E の偽 supervisor が流さないので作れない。FR-010)
- [x] **PR-05** [FE] M-05: 件数を押した直後に承認待ちが解けたときのテスト、3 本での行ごとの再描画の分離のテスト (`RunningSessionList.monitor.test.tsx`)
- [x] **PR-06** [SH] M-06 / M-07 / L-05 / L-10: quickstart V-3 に outputDir の確認と `teardown=killed` のときの `ps` の確認を足す。perf の判定を `perf/run-judgement.ts` の純関数に切り出して Vitest で固定 (下限の検証・`probe-missing`・`minMessages` / `thresholdOverridden` を記録。SC-005 の許可リストに 1 項目)。例外の文を理由キーと件数だけにする。後始末が kill に落ちたら 1 行出す
- [x] **PR-07** [SH] L-01 / L-02 / L-08 / L-09: quickstart-results の本数の幅と V-5 の再確認、plan の時刻の源の注記、plan / research の「実装時の変更」
- [x] **PR-08** [SH] M-08 / L-07: roadmap に回す (実機計測ハーネスの ADR 化を system-scope の項目に、行の状態の型の置き場を O-2 の前の store の切り出しの項目に)
