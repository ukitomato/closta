# po-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09
**Reviewer**: po-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

## 初回読了 viewpoint

- FR/SC (本 PR で実装・影響されるもの):
  - US-1 = FR-001 / FR-002 / SC-001 (`session-core.ts` の `classifyResultFailure`、`session/labels.ts`、`LivePane.tsx` の FailureBanner、`RunningSessionRow.tsx`)
  - US-2 = FR-003 / FR-004 / FR-006 / FR-007 (`live-signals.ts`、`quota-banner.ts`、`CenterBanners.tsx`、`SystemEventRow`)
  - US-3 = FR-005 / FR-008 / FR-009 / FR-017 (`running-session-store.ts` の `meters`、`UsageTab.tsx`、`ContextCostMeter.tsx`、`RightPanel.tsx`)
  - US-4 = FR-010〜FR-013 (`CenterBanners.tsx` の権限モードの警告の帯、`OverviewTab.tsx`、`thread.aui.tsx`、`tool-result-marks.tsx`、`meter-throttle.ts`)
  - 記録 = FR-014〜FR-016 / SC-005 / SC-006。預かった義務 = FR-017〜FR-019 / SC-007。負荷 = SC-004。SC-003 は US-2〜US-4 の AC を合否の基準にしている (spec.md:264)
- touched files に当たる charter / Confirmation:
  - ui charter KPI「表示網羅」(docs/domains/ui/charter.md:160-162) → SC-005 / docs/ui-coverage.md
  - ui charter 業務ルール「隔離状態は一目で分かること」(charter.md:156) → 権限モードの警告の帯の隔離の文言 (暫定)
  - ui charter Related Specs の O-4 の項 (charter.md:228-233)
  - AD-047 Confirmation (docs/decisions/0047-session-meter-and-failure-reasons.md:57-60) → SC-001 / SC-002 / SC-006
  - session charter (U-1。失敗の理由のキー・`meter`・稼働中のストアの `meters`)
- 読んだ ADR: AD-047 は全文 (訂正節を含む)。それ以外の accepted ADR は、plan の Related ADRs の要約だけを参照した。D は本 reviewer の担当外
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:5 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

pr-gate Round 1 (base main / merge-base 44ce810、HEAD fc3a5fc、88 files、+10825/-895)。code-gate は PASS (Medium 3 / Low 11。PO の観点は「pr-gate 専任」で未レビュー)。PO の観点で、spec の US / AC / SC / Edge Cases と、実装・テストを突き合わせた。

design-gate R3 で直った PO 由来の指摘は 2 つ。Quota banner の文の組み合わせ (MG-01) と、解除の時刻の後に帯を消すこと (MG-02) で、どちらも実装とテストで確かめられた (quota-banner.ts:37-74 / CenterBanners.test.tsx:177-256)。

残っている Medium は MG-03 / MG-04 / MG-06 / MG-08 / MG-15 の 5 つ。これらは今回、実装とテストで事実として観察できた。テストが AC と逆の振る舞いを固定している箇所もある。

V-4 (実機) は 10 項目すべて未実施 (quickstart-results.md:52-68)。

## Findings

### [Medium] 終了・失敗の後も「思考中 約 N トークン」(点滅) と tool の経過時間が止まったまま残る (M-001) (scope: feature)

- **観察**:
  - 進行中の値を消す経路は 2 つだけ: `turn` の meter (running-session-store.ts:163-172) と、主ループの assistant (running-session-store.ts:193-202)。`failure` の分岐は `failureReason` と `pending` しか書かない (running-session-store.ts:324-327)
  - result が届かない終わり方では `turn` が来ない: 強制終了 (sdk-agent-session.ts:511-521)・子の異常終了 (:444)・stream の例外 (:620)。`finish()` は保留を捨てるだけで、消す event は送らない (:378-394)。0 に倒した result も `turn` を送らない (live-signals.ts:185-188)
  - 表示側は終端かどうかを見ていない
    - `LiveThinkingIndicator` は `tokens !== null` なら描く (thread.aui.tsx:570-580)。印は `animate-pulse` と `ShimmerLabel` で、動いて見える (thinking-indicator.tsx:26-35)
    - `ToolResultMarks` は結果の無い tool で経過時間を出し続ける (tool-result-marks.tsx:49)
  - 同じペインに `TranscriptSettledContext` (ended / errored のとき true) があり (LivePane.tsx:222-226)、システムイベントの行はこれを見て「結果不明」で描く (thread.aui.tsx:1101)。進行中の 2 つの印だけがこれを見ていない
  - spec.md:175「終了・失敗した後の計量 → 最後の値を残す」を、累計の値にも進行中の値にも同じように当てている
  - テストが無い: LivePane.progress.test.tsx:147-358 に終端のケースが無い。running-session-store.test.ts:775-787 は失敗の後の `lastTurn` だけを見ている
- **同種事象探索**: `useLiveThinkingTokens|useLiveToolElapsed` で 2 件 (thread.aui.tsx:571 / tool-result-marks.tsx:49)。どちらも終端を見ない。`thinkingTokens: null` で 2 件 (running-session-store.ts:170, :201)。どちらも終端ではない契機
- **リスク/影響**: 強制終了・異常終了の後、FailureBanner / EndNotice と同じ画面に、点滅する「思考中」と止まった「45秒」が残る。動いているように見えるので、US-4 の Why「待ち時間の見積もり」(spec.md:146) を誤らせる。design-gate R3 の MG-08 (po M-010) で指摘したが、手当てされていない
- **推奨アクション**:
  - 最小案: 印を出す 2 か所で、`useTranscriptSettled()` が true なら null を返す (thread.aui.tsx:570 / transcript-context.ts:56-79)
    - 別の案: `LivePane.tsx:142` で、`session.ended || errored` なら `progress` に null を渡す
  - spec.md:175 と data-model §2「renderer の保持」で、累計 (`lastTurn` / `contextUsed`) と進行中 (`thinkingTokens` / `toolElapsed`) を分けて書く
  - LivePane.progress.test.tsx に「強制終了 / failure の後に、思考の印と経過時間が消える」を足す
- **根拠**: PO-4 / PO-6、spec US-4 Why
- **scope 根拠**: touched files (LivePane.tsx / thread.aui.tsx / tool-result-marks.tsx / spec.md) の中で直せる

### [Medium] 権限モードの警告の帯が、終端のセッションでも `role="alert"` のまま「承認なしで操作が走ることがあります」と出る。次の操作も無い (M-002) (scope: feature)

- **観察**:
  - `CenterBanners` は `terminal` を Quota banner にだけ渡している (CenterBanners.tsx:42-43)。`UnsafeModeBanner` は、モードが安全 3 値の外なら終端でも出す (:65-66)。`role="alert"` は固定 (:88)
  - 文言 (shell/labels.ts:152-153) は、失敗・終了したセッションでは事実と合わない。止める操作 (中断 / 強制終了) への案内も無い
  - 同じファイルの Quota banner は、終端で `role="status"` に下げ、送る案内を外している (quota-banner.ts:64-71)。2 つの帯で扱いが揃っていない
  - テスト (CenterBanners.test.tsx:451-553) に終端のケースが無い。design-gate R3 の MG-06 で指摘したが、手当てされていない
- **同種事象探索**: `role="alert"|role={view.role}` を features/shell で探して 2 件 (CenterBanners.tsx:88 は固定、:151 は終端を見る)
- **リスク/影響**: P1 扱いの AC1a (Principle III) の表示が、終わったセッションで誤った警告を出し続ける。FailureBanner の alert と重なる。動いているセッションでも、何をすればよいかを示さない
- **推奨アクション**:
  - `terminal` を `UnsafeModeBanner` にも渡す。終端では帯を消すか、`role="status"` で過去形の文言にする (data-model §4 / §5)
  - 非終端の文言に、止める操作 (サイドバーの「中断」「強制終了」) を 1 文足す
  - CenterBanners.test.tsx に、failure の後の観点を足す
- **根拠**: PO-4 / PO-6、Principle III
- **scope 根拠**: touched files (CenterBanners.tsx / shell/labels.ts / data-model.md) の中で直せる

### [Medium] 最初のターンが終わるまで、中央のヘッダの目盛り (コンテキスト・費用) が一切出ない。US-3 AC2 と食い違い、テストが実装側を固定している (M-003) (scope: feature)

- **観察**:
  - `ContextCostMeter` は `lastTurn === null` なら何も描かない (ContextCostMeter.tsx:34-35)。`contextUsed` があってもコンテキストを出さないことを、テストが固定している (ContextCostMeter.test.tsx:132)
  - agents は最初のターンの間も、主ループの assistant ごとに `context` を送っている (live-signals.ts:206-211)。値は renderer に届いているのに出していない
  - US-3 AC2 (spec.md:135) の Given は「assistant の応答が届いた」で、閾値は「80% を超えると」。実装は 80% 以上で注意の見た目にする (ContextCostMeter.tsx:115)
  - 使用量のタブは、最初のターンの間ずっと「最初の応答の後に出ます。」(shell/labels.ts:191 / UsageTab.tsx:48-49) を出す。応答が届いていても文言が変わらない
  - design-gate R3 の MG-15 で指摘したが、手当てされていない
- **同種事象探索**: `lastTurn === null` を features/shell で探して 2 件 (ContextCostMeter.tsx:35 / UsageTab.tsx:48)
- **リスク/影響**: Claude Code は 1 つのプロンプトで長い agent loop を回すのが普通で、最初のターンの途中で自動の圧縮が走りうる。US-3 の Why (spec.md:128「コンテキストが尽きると圧縮が走って文脈を失う」) がいちばん効く場面で、目盛りが出ない。SC-003 は「AC のとおり」を合否にする。AC2 を基準にすれば不合格、テストを基準にすれば合格で、判定が定まらない
- **推奨アクション** (どちらにするかは人間が決める):
  - (a) 作り変えない最小案: AC2 の Given を「最初のターンが終わった後」に、閾値を「80% 以上」に、`usageAwaitFirst` を「最初のターンが終わると出ます。」に直す (spec / data-model §5)
  - (b) 価値を取る案: `lastTurn` が無い間は、割合の代わりにトークン数 (`contextUsed`) だけを出す。運ぶ値は増えない
- **根拠**: PO-2 / PO-3、spec US-3 Why
- **scope 根拠**: spec.md / data-model.md / ContextCostMeter.tsx の中で直せる

### [Medium] ほかの AC 3 つも FR / 実装に追随しておらず、SC-003 の基準がぶれる (M-004) (scope: feature)

- **観察**:
  - US-4 AC1 (spec.md:152) は「『概要』のタブの権限モードが今のモードになる」と書く。実装は「起動時の権限モード」の行を残し、違うときだけ「現在の権限モード」の行を足す (OverviewTab.tsx:102-113)。これは FR-010 (spec.md:211) のとおり
  - US-4 AC4 (spec.md:156) と FR-012 (spec.md:213) は「Reasoning の表示に」と書く。実装は viewport の footer の composer の上に出す (thread.aui.tsx:269 / :552)。コメント (thread.aui.tsx:563) も「Reasoning の part は無い」と認めている
  - US-3 AC1 (spec.md:134) は拒否の件数を 1 つと書く。実装は 2 行 (UsageTab.tsx:129-133)
  - design-gate R3 の MG-03 で指摘したが、手当てされていない
- **同種事象探索**: spec の `Reasoning の表示` で 2 件 (spec.md:156, :213)。US-4 の AC の「概要」で 1 件 (spec.md:152)。拒否の件数で 1 件 (spec.md:134)
- **リスク/影響**: AC から受け入れテストを書くと、FR と実装の逆を期待する。とくに AC1 は、起動時の行が書き換わることを検査することになる
- **推奨アクション**: spec の 4 か所 (US-4 AC1 / AC4 / FR-012 / US-3 AC1) を、FR-010・data-model §4・research R-07 / R-08 に合わせて書き直す。コードは変えない
- **根拠**: PO-3
- **scope 根拠**: spec.md の文面だけ

### [Medium] 分類の表に無い失敗で、誤った次の操作を案内する。チームの fixture の「再試行を使い切った過負荷」も、再ログインの導線に倒れる (M-005) (scope: feature)

- **観察**:
  - `classifyResultFailure` (session-core.ts:403-417) は、`overloaded` / `server_error` / `model_not_found` / `invalid_request` / `max_output_tokens` / `unknown` を読まない。HTTP の状態が無ければ `provider-error` になる。テストもこれを固定している (session-core.test.ts:463-472)
  - `provider-error` の文言は「Provider の認証/接続でエラー…ログイン状態やクレジットを確認」(session/labels.ts:36-37) で、再ログインの導線も出る (labels.ts:113-115 / LivePane.tsx:327)
  - **追加事実**: live-signals.test.ts:437-443 は、「再試行を使い切った後の合成のエラー」を次の形でモデル化している: `api_retry` × 10 (529) → 主ループの assistant `error: 'overloaded'` → result `subtype: 'success', is_error: true` (`api_error_status` なし)。この形は `provider-error` になる。SDK の型でも `api_error_status` は省略可能である (sdk.d.ts:5354)
  - HTTP の状態があるとき、400 (invalid_request) と 404 (model_not_found) は `api-error` になる (session-core.test.ts:421)。文言は「しばらく待ってから起動し直してください」(labels.ts:55-56) で、待っても直らない失敗に「待つ」を案内する
  - クレジットの案内が減った:
    - O-4 の前は、どの result の失敗も「クレジットを確認」を案内していた
    - 今は `execution-error` / `api-error` の文言 (labels.ts:47-48, :55-56) にクレジットが無い
    - `billing` になるのは、assistant の列挙が `billing_error` / `account_on_hold` のときだけ (session-core.ts:407)
    - 実機の形は誰も観察していない (plan.md:290 RK-06)
  - design-gate R3 の MG-04 で指摘したが、手当てされていない
- **同種事象探索**: `overloaded|model_not_found|server_error|invalid_request` を src で探して 12 件。分類の規則の中は 0 件で、列挙の定義 (meter.ts:57-60) とテストの fixture (session-core.test.ts:464-467, :504 / live-signals.test.ts:379, :440 / LivePane.o2.test.tsx:494) だけ
- **リスク/影響**: US-1 が直す対象 (spec.md:90「関係ない失敗で再ログインを案内してしまう」) が、過負荷というよくある場面で残る。AC3 の「状態が無いときは汎用」(spec.md:98) どおりではあるが、assistant の `error` は既に読んでいて、5xx と同じ意味を持つ列挙を捨てている。V-4 #1 でこの形が確かめられれば、High に当たる
- **推奨アクション**:
  - data-model §1 に行を 1 つ足し、`overloaded` / `server_error` は `api-error` にする (AD-047 Decision 1 の 8 キーの中で収まる)
  - 4xx (400 / 404 / 413) と `model_not_found` / `invalid_request` は、「待つ」でなく「起動の設定 (モデル) を見直す」と案内する。キーを足すと AD-047 に触れるので、文言の分岐で収める
  - `execution-error` / `api-error` の文言を「ログイン状態やクレジット」に広げる
  - session-core.test.ts:463-472 の期待値を直す
- **根拠**: PO-4 / PO-1、H (regression)
- **scope 根拠**: data-model §1 / session-core.ts / session/labels.ts の中で直せる

### [Medium] (H) V-4 は 10 項目すべて未確認で、US-1 の分類と RK-06 / 07 / 08 / 15 の前提を実データで一度も見ていない。本番で後から知る観測点も無い (M-006) (scope: feature)

- **観察**:
  - quickstart-results.md:52-68 で、V-4 の 10 項目はすべて「未確認」
  - SC-001〜SC-004 の計測経路は fixture の単体と component テストだけで (spec.md:262-265)、実機の形が想定と違っても緑のまま通る
  - RK-14 (plan.md:298) のとおり、`provider-error` に倒れた失敗と decoder が捨てた `meter` を、アプリの中で後から知る手段が無い
  - roadmap:361 に未確認の項目と判断の保留を記録してあるが、期限も合否の扱いも無い
- **同種事象探索**: quickstart-results.md の `未確認` で 10 件 (:59-68)
- **リスク/影響**: SC はすべて PASS するが、US-1 (P1) の価値 (理由ごとの次の操作) と US-3 の割合の正しさ (±10%) は、実機で 1 回も観測されていない。M-005 の形が本番で起きても、利用者の報告でしか分からない
- **推奨アクション**:
  - 最低限 V-4 #1 (失敗の形の控え) と #4 (単位) を `/cl-done` の前に行う
  - 行わないなら、PR の説明に「未検証の前提」(data-model §1 の表、`utilization` / `resetsAt` の単位、主モデルの照合) と、確かめる期限・持ち主を書く
- **根拠**: PO-2 (計測経路)、PO-7 (サポートの視点)、H
- **scope 根拠**: quickstart-results.md / PR の説明 / roadmap の O-4 の行

### [Low] 「再ログインの導線」が利用者には区別できない (L-001) (scope: feature)

- **観察**:
  - 導線の違いはボタン名だけで、「閉じて起動し直す」と「閉じて再起動」(LivePane.tsx:327) は日本語として同じ意味である。押したときの処理も同じ `onClose`
  - SC-001 の「再ログインの導線」は、このボタン名の差で測られている (LivePane.failure.test.tsx:190-191, :196-209)
  - 一方、`execution-error` / `api-error` の全文は「ログイン状態を確かめ」を含む (session/labels.ts:47-48, :55-56)。`isReloginFailure` が false でも、文ではログインを案内している
- **推奨アクション**: 再ログインのボタン名を「ログインを確かめて起動し直す」などにして、差を利用者に見えるようにする。または、SC-001 の導線の定義を全文の案内に置き換える
- **根拠**: PO-3 / PO-6

### [Low] 「ターン数」が同じ画面で 2 つの数を指す (L-002) (scope: feature)

- **観察**: 使用量のタブの「ターン数」(shell/labels.ts:185) は、アプリが受けた result の数である (live-signals.ts:149)。一方、失敗の文言「ターン数の上限に達したため止まりました」(session/labels.ts:44) は SDK の agent loop の往復の数を指す。1 つのプロンプトで上限に達すると、「ターン数 1」と「ターン数の上限に達した」が並ぶ
- **推奨アクション**: タブの項目名を「受けたターン (プロンプト) の数」などに変えるか、`max-turns` の文言を「エージェントの往復の上限」に変える (用語の正本の判断は architecture の MG-10 と合わせる)
- **根拠**: PO-3

### [Low] 推定の注記「再開と /clear で 0 から数え直します」が、数え直さない項目にも当たる (L-003) (scope: feature)

- **観察**: `usageEstimateNote` (shell/labels.ts:189) は使用量のタブの全体に添えてある。しかし `turns` (live-signals.ts:149) と拒否の合計の元になる `deniedIds` (live-signals.ts:151) は、run の closure にあって減らない
- **推奨アクション**: 注記を「費用とトークンは、再開と /clear で 0 から数え直します。」に限る
- **根拠**: PO-3

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `useLiveThinkingTokens\|useLiveToolElapsed` / `thinkingTokens: null` | 2 | thread.aui.tsx:571, tool-result-marks.tsx:49 / running-session-store.ts:170, :201 |
| M-002 | `role="alert"\|role={view.role}` (features/shell) | 2 | CenterBanners.tsx:88 (終端を見ない), :151 (終端を見る) |
| M-003 | `lastTurn === null` (features/shell) | 2 | ContextCostMeter.tsx:35, UsageTab.tsx:48 |
| M-004 | spec の `Reasoning の表示` / US-4 の AC の「概要」/ 拒否の件数 | 4 | spec.md:156, :213 / :152 / :134 |
| M-005 | `overloaded\|model_not_found\|server_error\|invalid_request` (src) | 12 | meter.ts:57-60, session-core.test.ts:464-467, :504, live-signals.test.ts:379, :440, LivePane.o2.test.tsx:494 (分類の規則の中は 0) |
| M-006 | `未確認` (quickstart-results.md) | 10 | quickstart-results.md:59-68 |

## Verdict

- Critical: 0
- High: 0
- Medium: 6
- Low: 3
