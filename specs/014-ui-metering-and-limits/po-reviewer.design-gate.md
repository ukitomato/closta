# po-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-08T00:00:00+09:00 (design-gate)
**Reviewer**: po-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-019、SC-001〜SC-007。対応は次のとおり。
  - US-1 = FR-001 / FR-002・SC-001
  - US-2 = FR-003 / FR-004 / FR-006 / FR-007
  - US-3 = FR-005 / FR-008 / FR-009 / FR-017
  - US-4 = FR-010〜FR-013
  - 記録 = FR-014〜FR-016・SC-005 / SC-006
  - 預かった義務 = FR-017〜FR-019・SC-007
  - 負荷 = SC-004
  - SC-003 は US-2〜US-4 の AC を合否の基準にしている
- touched files に該当する charter / Confirmation:
  - ui charter の KPI「表示網羅」(docs/domains/ui/charter.md:159-161) → FR-014 / SC-005
  - ui charter の「Tier A は必須」(charter.md:46, :139-140) と AD-044 Decision 2 (docs/decisions/0044-ui-coverage-assignment.md:44。Tier A は「利用者が見ないと判断を誤るもの」) → docs/ui-coverage.md:48, :52, :53, :77 の Tier A の行
  - session charter の KPI「並列時の滑らかさ」(docs/domains/session/charter.md:145-147) → SC-004 / roadmap O-8 (c)
  - AD-047 Confirmation (docs/decisions/0047-session-meter-and-failure-reasons.md:57-60。SC-001 / SC-002 / SC-006、X-5 の状態通知の全フィールドの走査)
  - AD-046 Decision 6 (置き場所の語。0046:34)
  - Constitution Principle III (.specify/memory/constitution.md:440-460) → US-4 AC1a
- 読んだ ADR: AD-047 は全文。AD-044 / AD-046 は Decision と Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:9 Low:9
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R2 の後に直した版をレビューした。対象は spec、plan、tasks、data-model、research、quickstart。R2 から変わった主な点は次のとおり。

- U-3 の字面を直し、AD-047 に訂正節を足す方針を記録した (spec.md:73 / plan.md:250-266)
- `modelId` の検証を `isValidModelId` に一本化し、主モデルの照合を 3 段にした (data-model.md:85, :195-200)
- `init` の `permissionMode` を読むようにした (data-model.md:67)
- 隔離の文言を「確かめていない」に直した (data-model.md:172-176)
- 実機の形をアプリの外で控える手順を quickstart に足した (quickstart.md:39-54)
- 診断の観測点を足さない理由を RK-14 に書いた (plan.md:295)

po の R2 の指摘 17 件のうち、2 件は直った (H-001・M-009)。残りの 15 件は字面が変わっていない。gate の High だけを直し、Medium と Low の手当てに入っていないことによる。新しく見つけた問題は 4 件。

- 終了・失敗の後に「進行中」の表示 (思考中・tool の経過時間) が残る
- `utilization` が無いときの Quota banner の文言が決まっていない
- `/context` と比べる手順への参照が誤っており、比べる手順も無い
- 主モデルの照合が、セッションの実際のモデルを読んでいない

## 前 Round から直ったもの

- **R2 H-001 (直った)**: 次の 3 点で手当てされた
  - quickstart.md:39-54 に、アプリの外の CLI (`claude -p … --output-format stream-json --verbose`) で数と列挙だけを控える手順が入った
  - SH-014 の直し先に #3 が入った (tasks.md:153)
  - 確かめられなかった項目を roadmap に残す扱いが書かれた (quickstart.md:24 / tasks.md:156)
  - #3 の手順の残りの穴は新しい L-009 で扱う
- **R2 M-009 (直った)**: plan.md:295 (RK-14) に「本 feature では足さない」と理由 (Principle V / 範囲) が書かれた。roadmap に判断を残すことも書かれた (SH-013。tasks.md:145)

## Findings

### [Medium] Quota banner の文言の組み合わせが状態と合わない (M-001) (scope: feature) — unresolved from prev

- **観察**:
  - (a) 文言の当て方が状態ごとに 1 つしか無い
    - data-model.md:161-162 は、`allowed_warning` に `quotaWarning` (+ `quotaReset`)、`rejected` に `quotaRejected` だけを当てる
    - spec.md:117 (US-2 AC2) は、`rejected` のとき「解除の時刻まで待つことを案内する」と書く
    - `quotaRejected` の文言は「{種類}の上限に達しました。」だけで (data-model.md:242)、時刻も待つ案内も含まない
  - (b) `resetsAt` が無いときの文言が状態によらない
    - data-model.md:165 と spec.md:163 は、`resetsAtSec` が無いと状態によらず「しばらく待ってから」を出す。これは `quotaWait`「しばらく待ってから送ってください。」である (data-model.md:242)
    - `allowed_warning` はまだ送れる状態なので、送るのを止める案内は誤りになる
  - (c) 失敗の表示と逆の操作を案内する
    - 429 で失敗したセッションも、spec.md:173 のとおり最後の値を残す
    - すると FailureBanner の「しばらく待ってから**起動し直して**ください」(data-model.md:222) と、帯の「…**送って**ください」が同時に出る
  - FE-020 のテスト (tasks.md:77) は「`rejected` で … 待つ案内」「`resetsAtSec` が null で『しばらく待ってから』」と書くだけで、状態との組み合わせを決めていない
- **同種事象探索**: `quotaWait|quotaReset|quotaRejected|quotaWarning` で 3 件 (data-model.md:161, :162, :242)。`quotaWait` を出す条件を書いた行は 0 件
- **リスク/影響**: 同じ出来事に対して、帯と失敗の表示が逆の操作を案内する。US-2 の Why (spec.md:110。止まって見えて中断・再起動してしまう) を、別の形で再現する
- **推奨アクション**:
  - §4 の表を「status × `resetsAtSec` の有無」の 4 マスにする
    - warning + 時刻あり: `quotaWarning` + `quotaReset`
    - warning + 時刻なし: `quotaWarning` だけ
    - rejected + 時刻あり: `quotaRejected` + `quotaReset`
    - rejected + 時刻なし: `quotaRejected` + `quotaWait`
  - セッションの失敗・終了の後は、`quotaWait` を出さないか、「起動し直す」に揃える
  - FE-020 に、この 4 マスと「失敗の後」のテストを足す
- **根拠**: PO-3 / PO-6
- **scope 根拠**: data-model §4 / §5、spec の Edge Cases、tasks FE-020

### [Medium] 解除の時刻を過ぎた後の帯の扱いが無い (M-002) (scope: feature) — unresolved from prev

- **観察**:
  - 帯は `rateLimit.status` だけで決まり、消えるのは `allowed` の event が届いたときだけである (spec.md:118 AC3 / data-model.md:158-166)
  - `resetsAt` を過ぎた後の規則は無い。FE-020 (tasks.md:77) にもこの観点は無い
- **同種事象探索**: `過ぎ|経過した|期限|stale` (spec_dir の 6 文書) で 1 件 (quickstart.md:28 の「期限切れの API キー」で、別の話)。該当する規則は 0 件
- **リスク/影響**: 待機中のセッションには新しい event が来ない。そのため 14:00 を過ぎても「14:00 にリセットされます」が残り、rejected なら `role="alert"` の「上限に達しました」も残る。使える状態なのに、使わない判断を招く
- **推奨アクション**: 解除の時刻を過ぎたら帯を消すか、「解除の時刻を過ぎました」に変える。この規則を §4 と Edge Cases に足し、偽の時計の component テストを FE-020 に足す
- **根拠**: PO-4
- **scope 根拠**: data-model §4 / spec の Edge Cases / tasks FE-020

### [Medium] AC が FR / data-model の判断に追随しておらず、SC-003 が AC を参照するので計測がぶれる (M-003) (scope: feature) — unresolved from prev

- **観察**:
  - (a) 「概要」の権限モードの扱いが食い違う
    - US-4 AC1 (spec.md:152) は「『概要』のタブの権限モードが今のモードになる」と書く
    - FR-010 (spec.md:209) と data-model.md:171 は、「起動時の権限モード」の行は変えず、違うときだけ「現在の権限モード」の行を足すとする
  - (b) 思考のトークン数の置き場が食い違う
    - US-4 AC4 (spec.md:156) は「When Reasoning の表示を見る」、FR-012 (spec.md:211) は「Reasoning の表示に」と書く
    - 一方 data-model.md:208 と research.md:85 は、viewport の footer の composer の上に出すとする。Reasoning の part はまだ無いので、そこには出せない
    - tasks.md:119 は「Reasoning の表示の語彙で」と言い換えて辻褄を合わせているが、spec の字面はそのままである
  - (c) 拒否の件数の行数が食い違う
    - US-3 AC1 (spec.md:134) は「聞かれずに拒否された操作の件数」と書く
    - data-model.md:187-188 は 2 行 (聞かれずに / SDK の記録) を出す
  - SC-003 (spec.md:262) は「US-2〜US-4 の AC のとおり」を合否にしている
- **同種事象探索**: `Reasoning の表示` (spec) で 2 件 (spec.md:156, :211)。US-4 の AC の `概要` で 1 件 (spec.md:152)
- **リスク/影響**: AC を正にしてテストを書くと、FR / data-model と逆の結果を期待することになる。(a) では、起動時の行が書き換わることを検査してしまう
- **推奨アクション**: 次の 4 か所を、FR-010 / data-model §4 / research R-07 / R-08 に合わせて書き直す
  - US-4 AC1: 起動時の行は残し、「現在の権限モード」の行が出る
  - US-4 AC4 と FR-012: 「実行中の transcript の末尾に」
  - US-3 AC1: 拒否の 2 行
- **根拠**: PO-3
- **scope 根拠**: spec.md の文面

### [Medium] `SDKAssistantMessageError` の 13 値のうち 6 値の扱いが §1 に無く、状態が無いときは再ログインの導線に倒れる (M-004) (scope: feature) — unresolved from prev

- **観察**:
  - data-model.md:13-22 の §1 は、13 値 (node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3411) のうち 7 値にしか行を持たない
  - 残りの 6 値 `overloaded` / `invalid_request` / `model_not_found` / `server_error` / `unknown` / `max_output_tokens` は、「`lastAssistantError` がそれ以外」(data-model.md:22) で `provider-error` に入る
  - `provider-error` の文言は「Provider の認証/接続でエラー…ログイン状態やクレジットを確認」(src/renderer/src/features/session/labels.ts:31-32) である。再ログインの導線も出る (data-model.md:24 / labels.ts:80-82)
- **同種事象探索**: `overloaded|model_not_found|server_error` (spec_dir の 6 文書) で 0 件
- **リスク/影響**: US-1 が直そうとする「関係ない失敗で再ログインを案内する」(spec.md:90) が、この 6 値では残る。とくに `model_not_found` の次の操作は「起動の設定でモデルを選び直す」で、再ログインでも待つことでもない
- **推奨アクション**:
  - §1 に 6 値の扱いを書く。`overloaded` / `server_error` は `api-error` とし、AD-047 Decision 1 の 8 キーの範囲で収める。`model_not_found` は文言で「モデルの設定を確かめる」を添える。`unknown` / `max_output_tokens` は `provider-error` に倒すと明記する
  - BE-011 の fixture に 6 値を足す
- **根拠**: PO-4 / PO-1
- **scope 根拠**: data-model §1 / tasks BE-011

### [Medium] API 到達不可・オフラインの edge case が無い。再試行の行は列挙の `error` と数だけの `no_response` を捨てている (M-005) (scope: feature) — unresolved from prev

- **観察**:
  - data-model.md:5 は、X-1 が `provider-error` にまとめたものとして「API 到達不可」を挙げる。しかし §1 の表 (data-model.md:13-22) にも、spec の Edge Cases (spec.md:163-173) にも、到達不可の扱いが無い
  - 再試行の行は `error` と `no_response` を読まない (data-model.md:69)
  - しかし、どちらも文字列ではない
    - `error` は `SDKAssistantMessageError` の列挙である (sdk.d.ts:3324)。§1 が assistant の側で運んでいるのと同じ型である
    - `no_response` は `{ waited_ms, retry_wait_ms }` の数だけで、最初の 1 バイトの待ちが時間切れになったことを示す (sdk.d.ts:3325-3331)
  - spec.md:164 と FR-007 (spec.md:200) は、これを「エラーの中身」として出さないとしている
- **同種事象探索**: `オフライン|ネットワーク|no_response|到達` で 3 件 (data-model.md:5 / :69、research.md:47) と tasks.md:75。到達不可の扱いを決めた行は 0 件
- **リスク/影響**: 無応答・過負荷・レート制限による再試行は、行の上で区別できない (`error_status` が null なら「n/m 回目・待ち時間」しか出ない)。U-2 の「数・真偽・列挙を運ぶ」の範囲で運べる値を捨てている
- **推奨アクション**:
  - `api-retry` の `detail` に、`AssistantErrorKey` と `no_response` の有無 (真偽) を足す (data-model §3 / BE-020 / FE-021)
  - 到達不可の edge case を spec に 1 行書き、§1 のどの行に落ちるかを明記する
  - spec.md:164 / FR-007 の「エラーの中身」を「エラーの文字列」に直す
- **根拠**: PO-4
- **scope 根拠**: spec / data-model §2・§3 / tasks

### [Medium] 実機の形を待つ間の暫定の文言にログインしか無く、RK-06 が挙げる課金の手当てが無い (M-006) (scope: feature) — unresolved from prev

- **観察**:
  - plan.md:287 (RK-06) は、「認証切れ・課金のエラー」の両方を未観察とする
  - しかし手当ては「ログイン状態も確かめる」だけである (`execution-error` data-model.md:219 / `api-error` :223)
  - `billing` になるのは、assistant の列挙 `billing_error` / `account_on_hold` が来たときだけである (data-model.md:14)
  - 今の `provider-error` は、すべての失敗で「クレジットを確認」を案内している (labels.ts:31-32)
  - quickstart V-4 (quickstart.md:26-37) にも課金の行が無い
- **同種事象探索**: `クレジット` (spec_dir の 6 文書) で 4 件。暫定の文言 (data-model.md:219, :223) の中には 0 件
- **リスク/影響**: 課金の失敗が列挙なしの `api_error_status` だけで届く形なら、`api-error` か `execution-error` になる。その場合、AC3a (spec.md:99) が「保つ」とした「クレジットを確認」の案内が消える。既存の振る舞いの regression である
- **推奨アクション**:
  - `execution-error` / `api-error` の文言を「ログイン状態やクレジット」に広げる
  - RK-06 の手当ての欄に課金を書く
  - FE-011 に文言の観点を足す
- **根拠**: PO-4 / H (regression)
- **scope 根拠**: data-model §5 / plan RK-06

### [Medium] 安全 3 値の外の権限モードの警告の帯に次の操作が無く、終了後も `role="alert"` で残る (M-007) (scope: feature) — unresolved from prev

- **観察**:
  - 文言 (data-model.md:244) は「承認なしで操作が走ることがあります。」で終わり、次の操作が無い。AC1a (spec.md:153) の Then も、帯と文言の強さだけである
  - FailureBanner には「error 状態は必ず理由と次操作を出す」規則がある (src/renderer/src/features/session/LivePane.tsx:139)
  - spec.md:173 で終了・失敗の後も値が残るので、終わったセッションにも `role="alert"` の帯が出続ける。FE-040 のテスト (tasks.md:106) に、終了後の観点は無い
- **同種事象探索**: `unsafeModeBanner|警告の帯` (spec_dir の 6 文書) で 26 件 (spec 4 / plan 10 / tasks 7 / data-model 3 / research 1 / quickstart 1)。次の操作か終了後の扱いを書いた行は 0 件
- **リスク/影響**: P1 (Principle III) の表示が、警告するだけで何をすればよいかを示さない。終わったセッションでは誤った警告になる
- **推奨アクション**:
  - 文言か帯に、止める操作 (サイドバーの「中断」「終了」) を足す
  - 終了・失敗の後は、帯を消すか文言を変える
  - FE-040 に終了後のテストを足す
- **根拠**: PO-6 / Principle III
- **scope 根拠**: data-model §4 / §5 / tasks FE-040

### [Medium] US-4 は P2 だが Tier A の `status` を含み、Why の文意が逆になっている (M-008) (scope: feature) — unresolved from prev

- **観察**:
  - spec.md:37 は、`status` を O-4 の Tier A 5 行に数える。docs/ui-coverage.md:52 は `status` を「承認とコンテキストに直結するので Tier A」とする
  - US-4 は P2 で (spec.md:142)、P1 扱いは AC1a だけである。`status` から来る AC1 (権限モードの変化) と AC2 (圧縮) は P2 のまま
  - Why (spec.md:146) は「US-1〜US-3 が無くても致命的ではない」と、US-4 ではなく US-1〜US-3 を主語にしている
- **同種事象探索**: `Priority: P` (spec) で 4 件 (spec.md:86, :106, :124, :142)。P2 は :142 だけ
- **リスク/影響**:
  - ui charter は Tier A を「必須」とする (charter.md:46, :139-140)
  - AD-044 Decision 2 も Tier A を「見ないと判断を誤るもの」とする (0044:44)
  - それでも US-4 は後回しにできると読める
- **推奨アクション**:
  - US-4 の AC1 / AC2 (Tier A) を P1 にし、AC3〜AC5 (Tier B) を P2 にする
  - Why の文を直す
  - 1 つの PR で出す (tasks.md:184) なら、P は順序だけを表すと書く
- **根拠**: PO-5 / ui charter の Key concepts (Tier A)
- **scope 根拠**: spec.md の文面

### [Medium] 終了・失敗の後に「最後の値を残す」を一律に当てるので、進行中の表示 (思考中・tool の経過時間) が止まったまま残る (M-010) (scope: feature) — new

- **観察**:
  - spec.md:173 と tasks.md:50 は、終了・失敗の後も `close()` まで計量の最後の値を残すとする
  - 思考の値と tool の経過時間が消えるのは、次の場合だけである
    - `thinkingTokens`: 主ループの assistant の `message` か、`turn` の meter が来たとき (data-model.md:126)
    - `toolElapsed`: `turn` が来たとき (data-model.md:127)
  - `turn` を送らない場合がある
    - result が届かないまま終わる (クラッシュ・「終了」で止めた)
    - 0 に倒した result (data-model.md:105)
  - その場合でも、セッションスレッドは `finish()` で保留を捨てるだけである (data-model.md:113)。renderer の値は消えない
  - その結果、実行中の transcript の末尾に「思考中 約 N トークン」(data-model.md:208) が残る。結果の無い tool の見出しにも、止まった経過時間 (data-model.md:207) が残る
  - research.md:85 は「result で消える」と書くが、renderer が消すのは `turn` で、0 に倒した result では `turn` が来ない
  - 欠けているテスト
    - FE-044 (tasks.md:120) の観点は「主ループの assistant のメッセージと `turn` で消える」だけである
    - FE-043 (tasks.md:116) の観点は「結果が届くと消える」だけである
    - どちらにも、終了・失敗の後の観点が無い
- **同種事象探索**: `最後の値|null に戻す|で消える` で 5 件 (spec.md:173 / data-model.md:126 / tasks.md:50, :120 / research.md:85)。終了・失敗で進行中の値を消すと書いた行は 0 件。同じ型の問題として M-001 (c) (Quota banner) と M-007 (警告の帯) がある
- **リスク/影響**: 止まったセッションが「思考中」「12 秒」と、まだ動いているように見える。US-4 の Why「待ち時間の見積もり」(spec.md:146) を誤らせ、利用者は待つか止めるかの判断を誤る
- **推奨アクション**:
  - 規則を分ける。累計の値 (`lastTurn`・`contextUsed`) は終了・失敗の後も残す。進行中の値 (`thinkingTokens`・`toolElapsed`) はセッションの終了・失敗で消す
  - この区別を spec.md:173 と data-model §2「renderer の保持」に書く
  - FE-004 / FE-043 / FE-044 に、終了・失敗の後に印が消えるテストを足す
- **根拠**: PO-4 / PO-6
- **scope 根拠**: spec の Edge Cases / data-model §2 / tasks FE-004・FE-043・FE-044

### [Low] 最初のターンの間は中央のヘッダの目盛りが出ないのに、AC2 は assistant の応答で出るとしている。閾値と空の状態の文言もずれている (L-001) (scope: feature) — unresolved from prev

- **観察**:
  - US-3 AC2 (spec.md:135) は、「assistant の応答が届いた」ときに目盛りが出るとする。しかし `contextWindow` も費用も `lastTurn` (result) から取るので (data-model.md:201-202)、最初の result まで何も出ない
  - 閾値は、AC2 が「80% を超えると」、data-model.md:201 が `ratio >= 0.8` で食い違う
  - `usageAwaitFirst`「最初の応答の後に出ます。」(data-model.md:239) は、実際には result の後に出る
- **推奨アクション**: 次の 3 つを直す
  - AC2 の Given を「最初のターンが終わった後」に
  - 閾値を「80% 以上」に
  - 文言を「最初のターンが終わると出ます。」に
- **根拠**: PO-3

### [Low] 使用量のタブの「累計」の数え直しの範囲が項目ごとに違うのに、注記は一律である (L-002) (scope: feature) — unresolved from prev

- **観察**: `/clear` と再開のとき、費用とトークンは 0 に戻るが、`turns` と `deniedIds` は減らない (data-model.md:106)。それなのに `usageEstimateNote` は「再開と /clear で 0 から数え直します。」と一律に書く (data-model.md:238)
- **推奨アクション**: 注記の対象を「費用とトークンは …」に限るか、項目ごとに書く
- **根拠**: PO-3

### [Low] 中央のヘッダの費用には注記が無く、使用量のタブを開く入口も無い。Why の「課金に直結」は SDK の説明と合わない (L-003) (scope: feature) — unresolved from prev

- **観察**:
  - spec.md:128 は「費用は Provider の課金に直結する」と書く。しかし SDK は `total_cost_usd` を推定であって請求ではないとしている (research.md:36)
  - 注記 `usageEstimateNote` は使用量のタブにしか無い (data-model.md:183)。ヘッダは `aria-label` / `title` で「推定」と伝えるだけである (data-model.md:203)
  - 右のペインは既定で畳まれている (AD-046 Decision 4。0046:28) のに、ヘッダの目盛りから使用量のタブを開く入口が無い
- **推奨アクション**:
  - Why を「費用の目安が見える」に直す
  - 次のどちらかを足す
    - ヘッダの費用を押すと使用量のタブを開く (シェルの中で `setPanelTab` を呼ぶだけ)
    - `title` に注記の全文を出す
- **根拠**: PO-1 / PO-6

### [Low] FR-019 の行き先に、続けて承認が来る場合の扱いが無い。「さらに表示」の行き先と呼び名が合わない (L-004) (scope: feature) — unresolved from prev

- **観察**:
  - 承認カードを押した後は、フォーカスを composer に移す (data-model.md:276)
  - しかし次の `permission-request` は `pending` を置き換えて、新しいカードを出す (src/renderer/src/features/session/running-session-store.ts:303-311)。そのとき、フォーカスは新しいカードに移らない
  - 「さらに表示」の最後の押下は古いメッセージを読む操作なのに、行き先が下端の composer になっている (data-model.md:279)
  - FR-019 (spec.md:241) は「表示を増やす」と書くが、UI の文言は「さらに表示」である (labels.ts:156)
- **推奨アクション**:
  - 続けて承認が来る場合の行き先を §8 に書く
  - 「さらに表示」の行き先を composer にする理由を書くか、行き先を変える
  - FR-019 の呼び名を UI の文言に揃える
- **根拠**: PO-6

### [Low] FR-017〜FR-019 に受け手と AC が無い。tasks.md:184 の根拠が SC-007 の文面と合わない (L-005) (scope: feature) — unresolved from prev

- **観察**: FR-017〜FR-019 (spec.md:232-243) には User Story も Given-When-Then も無く、SC-007 (spec.md:265) でまとめて測る。tasks.md:184 は「SC-007 が同じ PR を求める」とするが、SC-007 の文面にその要求は無い
- **推奨アクション**:
  - 「義務の扱い」の表 (spec.md:50-58) に、受け手 (キーボードの利用者・支援技術の利用者) と価値の列を足す
  - tasks.md:184 の根拠を FR-014 / FR-016 だけにする
- **根拠**: PO-1 / PO-5

### [Low] 同じアカウントの他のセッションに帯を出さないことが Out of Scope に無い (L-006) (scope: feature) — unresolved from prev

- **観察**: 帯はセッションごとで、その理由は data-model.md:166 にしか無い (spec.md:120 AC5)。Out of Scope (spec.md:276-282) には書かれていない
- **推奨アクション**: Out of Scope に 1 行足す。例: 「同じ Provider の他の稼働中のセッションに帯を広げること (event はセッションごとで、renderer は当てはまるかを知らない)」
- **根拠**: PO-4

### [Low] Quota banner の注意の文言が、`utilization` が無いときに組めない (L-008) (scope: feature) — new

- **観察**:
  - data-model.md:165 は、`utilizationPct` が null なら割合を出さないとする。FE-020 のテストも「`utilizationPct` が null で割合なし」とする (tasks.md:77)
  - しかし注意の文言 `quotaWarning` は「{種類}の利用が {n}% に達しました。」(data-model.md:242) の 1 つで、`{n}` を必ず使う。割合の無い形の文言のキーが無い
  - `utilization` は省略可能である (research.md:44)
- **推奨アクション**:
  - §5 に、割合の無い注意の文言を足す。例: `quotaWarningNoPct`「{種類}の上限に近づいています。」
  - §4 の条件と FE-020 のテストに、この文言を書く
- **根拠**: PO-3

### [Low] コンテキストの推定を `/context` と比べる手順への参照が誤っており、比べる手順も無い (L-009) (scope: feature) — new

- **観察**:
  - spec.md:81 (Clarifications) は「実機で `/context` と比べる (quickstart V-3)」と書く。しかし V-3 は「プロバイダ」の表記の確認で (quickstart.md:18)、比べるのは V-4 #3 (quickstart.md:30) である
  - V-4 #3 は「Claude Code の `/context` を見る」とだけ書き、アプリが動かしている同じセッションの `/context` をどこで見るかが無い。候補はアプリの composer か、CLI で再開する形である
  - 「形の控え方」は #1 / #2 / #4 だけを対象にしている (quickstart.md:39)
  - この比較は、RK-08 (plan.md:289) の ±10% の判定の唯一の計測経路である
- **推奨アクション**:
  - spec.md:81 の参照を「quickstart V-4 #3」に直す
  - V-4 #3 に、同じセッションの `/context` を見る手順を 1 行書く
- **根拠**: PO-2 (計測経路)

### [Low] 主モデルの照合が起動の設定と出力トークン数に頼り、セッションの実際のモデルを読まない (L-010) (scope: feature) — new

- **観察**:
  - 主モデルは 3 段で照合する: 起動の設定のモデル id と `modelUsage` のキーの一致、`[…]` を外した一致、出力トークン最多の行 (data-model.md:195-200)
  - 起動の設定のモデルは省略できる。省略すると Claude Code の既定になる (src/agents/session-core.ts:97-98)。その場合は、いつも 3 段目の推測になる
  - 一方、実際のモデルの id は手元のメッセージにある
    - 主ループの assistant の `message` に `model` がある (sdk.d.ts:3342-3344)
    - `init` にも `model` がある
  - しかし許可リストは、assistant で `usage` と `error` だけを読み (data-model.md:64)、`init` の `model` を「読まない」としている (data-model.md:67)。モデルの id は AD-047 Decision 2 が運んでよいとする値で、パスでも会話でもない
- **リスク/影響**: subagent の多いセッションで、3 段目が subagent のモデルを選ぶことがある。そうなると、別の `contextWindow` で割って割合を誤る (200k と 1M なら 5 倍)。US-3 (P1) の価値「コンテキストの余裕が分かる」と、80% の注意 (US-3 AC2) が狂う。セッションの途中でモデルが変わる場合 (それが起こりうるなら) も Edge Cases (spec.md:167) に無い
- **推奨アクション**:
  - 主ループの最後の assistant の `message.model` か `init` の `model` を `modelId` の検証に通し、照合の第 1 段にする
  - 起動の設定と出力トークン最多は、その後の段に下げる
  - 採らないなら、理由を RK-15 に書く
- **根拠**: PO-4
- **scope 根拠**: data-model §2 の許可リスト / §4 の照合

### [Low] (H) KPI「並列時の滑らかさ」を、計量を流した状態で測る経路が無い (L-007) (scope: system) — unresolved from prev

- **観察**:
  - session charter の KPI (docs/domains/session/charter.md:145-147) は、E2E (10 本 × 20 件/秒) と実機で測る
  - 本 feature は E2E で計量を流さない (plan.md:22, :248)。SC-004 (spec.md:263) が測るのは、セッションスレッドの流量の上限だけである
  - O-8 (c) への申し送り (plan.md:155) も、`receivedMessages` の基準が変わったことを書くだけである
- **推奨アクション**: 次のどちらかを足す
  - renderer の単体で、10 セッション分の `meter` を流しても、表示中の Thread の描画回数が増えないことを測る
  - roadmap の O-8 の行に「計量を含めて測る」と書く
- **根拠**: H (regression)
- **scope 根拠**: KPI の実機計測の持ち主は O-8

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `quotaWait\|quotaReset\|quotaRejected\|quotaWarning` | 3 | data-model.md:161, :162, :242 (`quotaWait` を出す条件は 0) |
| M-002 | `過ぎ\|経過した\|期限\|stale` | 1 (該当する規則 0) | quickstart.md:28 (別の話) |
| M-003 | `Reasoning の表示` (spec) / US-4 の AC の `概要` | 2 / 1 | spec.md:156, :211 / spec.md:152 |
| M-004 | `overloaded\|model_not_found\|server_error` | 0 | — (sdk.d.ts:3411 に 13 値) |
| M-005 | `オフライン\|ネットワーク\|no_response\|到達` | 4 (到達不可の扱いを決めた行 0) | data-model.md:5, :69 / research.md:47 / tasks.md:75 |
| M-006 | `クレジット` | 4 (暫定の文言の中は 0) | plan.md:169 / data-model.md:5, :221 / spec.md:66, :99 |
| M-007 | `unsafeModeBanner\|警告の帯` | 26 (次の操作・終了後の扱いを書いた行 0) | spec 4 / plan 10 / tasks 7 / data-model 3 / research 1 / quickstart 1 |
| M-008 | `Priority: P` | 4 | spec.md:86, :106, :124, :142 |
| M-010 | `最後の値\|null に戻す\|で消える` | 5 (終了・失敗で進行中の値を消す規則 0) | spec.md:173 / data-model.md:126 / tasks.md:50, :120 / research.md:85 |
| L-009 | `/context` | 5 (spec_dir の設計文書) | spec.md:68, :81 / research.md:64 / quickstart.md:30 / plan.md:289 / tasks.md:153 |

## Verdict

- Critical: 0
- High: 0
- Medium: 9
- Low: 10
- Round inheritance: resolved from R2: 2 (H-001 / M-009) / unresolved: 15 (M-001〜M-008、L-001〜L-007。どれも Severity は R2 のまま) / new: 4 (M-010 / L-008 / L-009 / L-010)

参照したファイル:
- C:\dev\closta\specs\014-ui-metering-and-limits\spec.md
- C:\dev\closta\specs\014-ui-metering-and-limits\plan.md
- C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md
- C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md
- C:\dev\closta\specs\014-ui-metering-and-limits\research.md
- C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md
- C:\dev\closta\specs\014-ui-metering-and-limits\design-gate.md.20261007T184052
- C:\dev\closta\docs\domains\ui\charter.md
- C:\dev\closta\docs\domains\session\charter.md
- C:\dev\closta\docs\domains\_overview.md
- C:\dev\closta\docs\ui-coverage.md
- C:\dev\closta\docs\decisions\0047-session-meter-and-failure-reasons.md
- C:\dev\closta\docs\decisions\0044-ui-coverage-assignment.md
- C:\dev\closta\docs\decisions\0046-app-shell-layout.md
- C:\dev\closta\.specify\memory\constitution.md
- C:\dev\closta\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts
- C:\dev\closta\src\agents\session-core.ts
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\renderer\src\features\session\LivePane.tsx
- C:\dev\closta\src\renderer\src\features\session\running-session-store.ts
