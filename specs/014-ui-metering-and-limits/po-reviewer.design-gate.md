# po-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-07T00:00:00+09:00 (design-gate)
**Reviewer**: po-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-019、SC-001〜SC-007 (US-1 = FR-001/002・SC-001、US-2 = FR-003/004/006/007、US-3 = FR-005/008/009/017、US-4 = FR-010〜013、記録 = FR-014〜016・SC-005/006、預かった義務 = FR-017〜019・SC-007、負荷 = SC-004)
- touched files に該当する charter / Confirmation:
  - ui charter の KPI「表示網羅」(docs/domains/ui/charter.md:159-161) → FR-014 / SC-005
  - ui charter の Tier A 必須 (charter.md:46, :139-140) → ui-coverage.md:48,52,53,77 の Tier A の行
  - session charter の KPI「並列時の滑らかさ」(docs/domains/session/charter.md:145-147) → SC-004 / O-8 (c)
  - AD-047 Confirmation (SC-001 / SC-002 / SC-006、X-5 の状態通知の全フィールドの走査)
  - AD-046 Decision 6 (置き場所の語)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:8 Low:6
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 各 optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

O-4 の設計を O-7・O-3 の後の main に載せ直した版をレビューした。範囲は spec、plan、tasks、data-model、research、quickstart。中身は 4 つ。1 つ目は失敗の理由を 8 つのキーに分けること (US-1)。2 つ目は `meter` とシステムイベントの行で、レート制限・再試行・使用量・進み具合を出すこと (US-2〜US-4)。3 つ目は O-7 と system-scope から預かった義務 (タブのキー操作、切り出し、消えるボタンのフォーカス、Provider の表記)。4 つ目は対応表の書き換え。R1 の po の指摘 13 件のうち 12 件は手当て済みである。残った問題は次のとおり。

- 実機の形を確かめる手順が、書かれたとおりには実行できない
- Quota banner の文言の組み合わせが状態と合わない。解除の時刻を過ぎた後の扱いが無い
- 2026-10-07 に直した判断に AC が追随していない
- SDK の列挙のうち §1 で扱いが決まっていない値がある
- オフライン (API 到達不可) の edge case が無い

## Findings

### [High] 実機の形を確かめる手順 (quickstart V-4 #1 / #4) を実行する手段が無く、V-4 #3 の結果に行き先が無い (H-001) (scope: feature)

- **観察**:
  - quickstart.md:28 は V-4 #1 で「届いた result と assistant のメッセージの形 (subtype / `api_error_status` / `error`) を記録する」と求める。quickstart.md:31 は #4 で「`utilization` と `resetsAt` の実際の単位を記録する」と求める
  - ところが設計は、これらの生の値をどこにも出さない
    - data-model.md:25: HTTP の状態は文言に入れない。`failure` は理由のキーだけ
    - data-model.md:78-79: `utilization` / `resetsAt` は正規化した値だけを運ぶ
    - spec.md:198 (FR-007)
  - `src/agents/` の非テストのファイルで、`console.` / logger の呼び出しは 0 件 (Grep)。アプリに debug の経路も無い (`src` で `DEBUG` / `stream-json` を Grep すると、該当は文言の 1 件だけ)
  - quickstart は別の手段 (CLI など) も書いていない
  - V-4 の合否と、その結果の扱い
    - quickstart.md:22: V-4 は「自動の合否に含めない」
    - tasks.md:9: 「実装を止めない」
    - tasks.md:149 (SH-014): data-model の直しに回すのは V-4 #1 / #4 / #5 の結果だけ。#3 (コンテキストの推定と `/context` の差が ±10% 以内。quickstart.md:30) は回さない
    - plan.md:279 (RK-08): 「±10% を超えたら式を見直す」と書くが、誰がどの記録で直すかが無い
- **同種事象探索**:
  - `記録する` (quickstart.md) で 2 件 (quickstart.md:28, :31)
  - `V-4 #3` の後追い (plan / tasks) は plan.md:279 の 1 件だけで、tasks.md:149 には無い
- **リスク/影響**: US-1 (P1) の「認証の失敗とレート制限を区別する」も US-3 (P1) の「コンテキストの余裕」も、実機で誰も観察していない形を前提にしている (plan.md:277 RK-06 / :278 RK-07 / :279 RK-08)。SC-001〜SC-003 は合成の fixture だけで測るので、前提が違っていても全部緑のまま完了する。前提を確かめる唯一の手順が、書かれたとおりには実行できない
- **推奨アクション**:
  1. quickstart V-4 #1 / #4 に、生の形を取る手段を書く。たとえば、同じランタイムと Provider で `claude -p --output-format stream-json --verbose` を走らせ、result / assistant / `rate_limit_event` の行から数と列挙だけを控える
  2. SH-014 の後追いの対象に V-4 #3 を足す。±10% を超えたときの直し先 (data-model §2 の式) と記録の置き場 (`quickstart-results.md` → roadmap) を書く
  3. V-4 の結果が出るまで `completed` にしないか、出なかったときの扱い (roadmap に残す) を tasks か spec に書く
- **根拠**: PO-2 (計測経路) / Principle XI
- **scope 根拠**: quickstart.md / tasks.md / plan.md の文面で直せる

### [Medium] Quota banner の文言の組み合わせが状態と合わない (M-001) (scope: feature)

- **観察**:
  - (a) data-model.md:158-159 の表は、`allowed_warning` に `quotaWarning` (+ `quotaReset`)、`rejected` に `quotaRejected` だけを当てる。一方 spec.md:115 (US-2 AC2) は `rejected` で「解除の時刻まで待つことを案内する」と書く。FE-020 のテスト (tasks.md:77) は、時刻を出すかを決めていない
  - (b) data-model.md:162 と spec.md:161 は、`resetsAt` が無いときに状態によらず「しばらく待ってから」を出す。これは `quotaWait` で、文言は「しばらく待ってから送ってください。」(data-model.md:230)。`allowed_warning` はまだ送れる状態なので、送るのを止める案内は誤りになる
  - (c) 429 で失敗したセッション (spec.md:95) は、spec.md:171 のとおり最後の値を残す。すると FailureBanner の「しばらく待ってから起動し直してください」(data-model.md:210) と、帯の「…送ってください」が同時に出る。失敗したセッションにはもう送れない
- **同種事象探索**: `quotaWait|quotaReset|quotaRejected` で 3 件 (data-model.md:158, :159, :230)。`quotaWait` を使う条件を書いた行は 0 件
- **リスク/影響**: 同じ出来事に対して、帯と失敗の表示が逆の操作を案内する。US-2 の Why (spec.md:108。止まって見えて中断・再起動してしまう) を、別の形で再現してしまう
- **推奨アクション**:
  - §4 の表を「status × `resetsAtSec` の有無」の 4 マスにする
    - warning + 時刻あり: `quotaWarning` + `quotaReset`
    - warning + 時刻なし: `quotaWarning` だけ
    - rejected + 時刻あり: `quotaRejected` + `quotaReset`
    - rejected + 時刻なし: `quotaRejected` + `quotaWait`
  - セッションの失敗・終了の後は、`quotaWait` を出さないか「起動し直す」の案内に揃える
  - FE-020 のテストに、この 4 マスと「失敗の後」の場合を足す
- **根拠**: PO-3 / PO-6
- **scope 根拠**: data-model §4 / §5、spec の Edge Cases、tasks FE-020

### [Medium] 解除の時刻を過ぎた後の帯の扱いが無い (M-002) (scope: feature)

- **観察**: 帯は `rateLimit.status` だけで決まり、消えるのは `allowed` の event が届いたときだけ (spec.md:116 AC3 / data-model.md:155-163)。`resetsAt` を過ぎた後の規則は無い。`過ぎ|経過した|期限` を Grep しても、該当する規則は 0 件。FE-020 のテスト (tasks.md:77) にも、この観点は無い
- **同種事象探索**: `過ぎ|過去の時刻|経過した|期限|stale` (spec_dir の 6 文書) で 0 件 (quickstart.md:28 の「期限切れの API キー」は別の話)
- **リスク/影響**: 待機中のセッションには新しい event が来ないので、14:00 を過ぎても「14:00 にリセットされます」が残る。rejected なら `role="alert"` の「上限に達しました」も残る。使える状態なのに使わない判断を招く
- **推奨アクション**: 解除の時刻を過ぎたら帯を消す (または「解除の時刻を過ぎました」に変える) 規則を §4 と Edge Cases に足す。偽の時計を使った component テストを FE-020 に足す
- **根拠**: PO-4
- **scope 根拠**: data-model §4 / spec の Edge Cases / tasks FE-020

### [Medium] AC が 2026-10-07 の FR / data-model の判断に追随しておらず、SC-003 が AC を参照するので計測がぶれる (M-003) (scope: feature)

- **観察**:
  - (a) US-4 AC1 (spec.md:150) は「概要のタブの権限モードが今のモードになる」と書く。一方 FR-010 (spec.md:207) と data-model.md:168 は、「起動時の権限モード」の行は変えず、違うときだけ「現在の権限モード」の行を足すとする
  - (b) US-4 AC4 (spec.md:154) は「When Reasoning の表示を見る」、FR-012 (spec.md:209) は「Reasoning の表示に」と書く。一方 data-model.md:196 と research R-07 は、viewport の footer の composer の上に出すとする。Reasoning の part はまだ無いので、そこには出せない
  - (c) US-3 AC1 (spec.md:132) は「聞かれずに拒否された操作の件数」と書く。一方 data-model.md:180-181 は 2 行 (聞かれずに / SDK の記録) を出す
  - SC-003 (spec.md:260) は「US-2〜US-4 の AC のとおり」を合否にする
- **同種事象探索**: `Reasoning の表示` (spec) で 2 件 (spec.md:154, :209)。`概要` (US-4 の AC) で 1 件 (spec.md:150)
- **リスク/影響**: AC を正にしてテストを書くと、FR / data-model と逆の結果を期待することになる。(a) では、起動時の行が書き換わることを検査してしまう
- **推奨アクション**: US-4 AC1 / AC4、FR-012、US-3 AC1 を、FR-010 / data-model §4 / R-07 / R-08 に合わせて書き直す
- **根拠**: PO-3
- **scope 根拠**: spec.md の文面

### [Medium] `SDKAssistantMessageError` の 13 値のうち 6 値の扱いが §1 に無く、状態が無いときは再ログインの導線に倒れる (M-004) (scope: feature)

- **観察**:
  - data-model.md:13-22 の §1 は、`SDKAssistantMessageError` の 13 値 (sdk.d.ts:3411) のうち 7 値にしか行を持たない
  - 残りの 6 値は「`lastAssistantError` がそれ以外」(data-model.md:22) に入る: `overloaded` / `invalid_request` / `model_not_found` / `server_error` / `unknown` / `max_output_tokens`
  - この 6 値で `apiErrorStatus` が無いと `provider-error` になる。その文言は「Provider の認証/接続でエラー…ログイン状態やクレジットを確認」(src/renderer/src/features/session/labels.ts:31-32) で、ボタンも再ログイン向けの「閉じて起動し直す」になる
- **同種事象探索**: `overloaded|model_not_found|server_error|invalid_request|max_output_tokens` (spec_dir の 6 文書) で 0 件
- **リスク/影響**: US-1 が直そうとする「関係ない失敗で再ログインを案内する」(spec.md:88) が、この 6 値では残る。とくに `model_not_found` の次の操作は「起動の設定でモデルを選び直す」で、再ログインでも、待つことでもない。Bedrock の inference profile の pin (docs/glossary.md:561) で起こりうる
- **推奨アクション**:
  - §1 に 6 値の扱いを書く。たとえば `overloaded` / `server_error` は `api-error`。`model_not_found` は文言に「モデルの設定を確かめる」を添える。`unknown` / `max_output_tokens` は `provider-error` に倒すと明記する
  - キーを足すと AD-047 Decision 1 の 8 つの範囲を超えるので、文言で吸収するか、ADR の扱いを決める
  - BE-011 の fixture に 6 値を足す
- **根拠**: PO-4 / PO-1
- **scope 根拠**: data-model §1 / tasks BE-011 (キーを足す場合は AD-047 の範囲外)

### [Medium] API 到達不可・オフラインの edge case が無い。再試行の行は列挙の `error` と数だけの `no_response` を捨てる (M-005) (scope: feature)

- **観察**:
  - data-model.md:5 は、X-1 が `provider-error` にまとめたものとして「API 到達不可」を挙げる。しかし §1 の表 (data-model.md:13-22) にも、spec の Edge Cases (spec.md:159-171) にも、到達不可・オフラインの扱いが無い
  - 再試行の行は `api_retry` の `error` と `no_response` を読まない (data-model.md:66 / spec.md:162 / FR-007 spec.md:198)
  - しかし `error` は `SDKAssistantMessageError` の列挙である (sdk.d.ts:3324)。§1 が「文字列を含まない」として assistant の側では運んでいるのと同じ型である (data-model.md:9)
  - `no_response` は `{ waited_ms, retry_wait_ms }` の数だけで、最初の 1 バイトの待ちの超過を示す (sdk.d.ts:3325-3331)
- **同種事象探索**: `オフライン|ネットワーク|no_response|到達` で 4 件。到達不可・オフラインの扱いとしては data-model.md:5 の 1 件だけで、`no_response` の 3 件 (data-model.md:66 / research.md:46 / tasks.md:75) はどれも「読まない」側の記述
- **リスク/影響**: ネットワークの切断や無応答での再試行は `error_status` が null なので、行には「n/m 回目・待ち時間」しか出ない。利用者は原因 (無応答・過負荷・レート制限) を区別できない。U-2 の「数・真偽・列挙を運ぶ」の範囲で運べる値を、「エラーの中身」と取り違えて捨てている
- **推奨アクション**:
  - `api-retry` の `detail` に、`AssistantErrorKey` と `no_response` の有無 (真偽) の 2 欄を足す (data-model §3 の符号化、BE-020 / FE-021)
  - 到達不可・オフラインの edge case を spec に 1 行書き、§1 のどの行に落ちるかを明記する
  - FR-007 と spec.md:162 の「エラーの中身」を「エラーの文字列」に直す
- **根拠**: PO-4
- **scope 根拠**: spec / data-model §2・§3 / tasks

### [Medium] 実機の形を待つ間の手当てがログインだけで、RK-06 が挙げる課金のエラーの手当てが無い (M-006) (scope: feature)

- **観察**:
  - plan.md:277 (RK-06) は、「認証切れ・課金のエラー」の両方を実機で未観察とする
  - 手当ては、`execution-error` / `api-error` の文言に「ログイン状態を確かめ」を添えることだけである (data-model.md:20-21, :207, :211)
  - `billing` になるのは、assistant の列挙 `billing_error` / `account_on_hold` が来たときだけ (data-model.md:14)
  - 今の `provider-error` は、すべての失敗で「クレジットを確認」を案内している (labels.ts:31-32)
  - V-4 にも課金の行が無い (quickstart.md:26-37)
- **同種事象探索**: `クレジット` (data-model §5) で 1 件 (data-model.md:209 の `billing` だけ)
- **リスク/影響**: 課金の失敗が、列挙なしの `api_error_status` だけで届く形なら `api-error` になる。そうなると、R1 (arch H-001) で守ると決めた「クレジットを確認」の案内が消える (AC3a の前提が崩れる。既存の振る舞いの regression)
- **推奨アクション**: `execution-error` / `api-error` の文言に「ログイン状態やクレジット」を添え、今の `provider-error` と同じ範囲を案内する。RK-06 の手当ての欄に課金を書く。FE-010 のテストに文言の観点を足す
- **根拠**: PO-4 / H (regression)
- **scope 根拠**: data-model §5 / plan RK-06

### [Medium] 安全 3 値の外の権限モードの警告の帯に次の操作が無く、セッションの終了後も `role="alert"` で残る (M-007) (scope: feature)

- **観察**:
  - 警告の帯の文言 (data-model.md:232) は「承認なしで操作が走ることがあります。」で終わり、次の操作が無い。spec.md:151 (AC1a) の Then も、帯と文言の強さだけである
  - FailureBanner には「error 状態は必ず理由と次操作を出す」規則がある (src/renderer/src/features/session/LivePane.tsx:139)
  - spec.md:171 で終了・失敗の後も値が残るので、終わったセッションにも警告の帯が出続ける。FE-040 のテスト (tasks.md:106) に、終了後の観点は無い
- **同種事象探索**: `unsafeModeBanner|警告の帯` (spec / data-model / tasks) で 10 件。spec.md:70 (U-6) は判断の記述で、他は表示の条件・文言・置き場・テスト・glossary への追加の記述。次の操作を書いた行は 0 件
- **リスク/影響**: P1 (Principle III) の表示が、利用者を警告するだけで何をすればよいかを示さない。終わったセッションでは誤った警告になる
- **推奨アクション**: 文言か帯に、止める操作 (サイドバーの「中断」「終了」) を足す。終了・失敗の後は帯を消すか、文言を変える。FE-040 にそのテストを足す
- **根拠**: PO-6 / Principle III
- **scope 根拠**: data-model §4 / §5 / tasks FE-040

### [Medium] US-4 は P2 だが Tier A の `status` を含み、Why の文意が逆になっている (M-008) (scope: feature)

- **観察**:
  - spec.md:37 は、`status` を O-4 の Tier A 5 行に数える。ui-coverage.md:52 は `status` を「承認とコンテキストに直結するので Tier A」とする
  - US-4 (spec.md:140) は P2 で、P1 扱いは AC1a だけである。`status` から来る AC1 (権限モードの変化) と AC2 (圧縮) は P2 のまま
  - Why (spec.md:144) は「US-1〜US-3 が無くても致命的ではない」と、US-4 ではなく US-1〜US-3 を主語にしている
- **追加事実** (R1 L-002 からの格上げ): ui-coverage.md:52 の Tier A の根拠と、spec.md:144 の文意の破綻
- **同種事象探索**: `Priority: P2` (spec) で 1 件 (spec.md:140)
- **リスク/影響**: ui charter は Tier A を「必須」とし (charter.md:139-140)、SC-005 は Tier A の `status` の行の実装を要する。それでも US-4 は後回しにできると読める。P1 と P2 の区別が、何を意味するのか分からない
- **推奨アクション**: US-4 の AC1 / AC2 (Tier A) を P1 に、AC3〜AC5 (Tier B) を P2 に分けるか、Story を分ける。Why の文を直す。1 つの PR で出す (tasks.md:177) なら、P は順序だけを表すと書く
- **根拠**: PO-5 / ui charter の Key concepts (Tier A)
- **scope 根拠**: spec.md の文面

### [Low] 最初のターンの間は中央のヘッダの目盛りが出ないのに、AC2 は assistant の応答で出るとしている。閾値と空の状態の文言もずれている (L-001) (scope: feature)

- **観察**:
  - US-3 AC2 (spec.md:133) は、「assistant の応答が届いた」ときに目盛りが出るとする。しかし主モデルの `contextWindow` は `lastTurn.models` (result) から取るので (data-model.md:188-190)、最初の result が届くまでコンテキストの目盛りは出ない
  - 閾値は、AC2 が「80% を超えると」、data-model.md:189 が `ratio >= 0.8` で、80% ちょうどの扱いが違う
  - `usageAwaitFirst` の「最初の応答の後に出ます」(data-model.md:227) は、実際には result の後に出る。応答が画面に見えているのに、まだ出ない
- **推奨アクション**: AC2 の Given を「最初のターンが終わった後」に、閾値を「80% 以上」に、文言を「最初のターンが終わると出ます」に直す
- **根拠**: PO-3

### [Low] 使用量のタブの「累計」の数え直しの範囲が項目ごとに違うのに、注記は一律である (L-002) (scope: feature)

- **観察**: `/clear` と再開のとき、費用とトークンは 0 に戻るが、`turns` と `deniedIds` は減らない (data-model.md:103)。それなのに `usageEstimateNote` は「再開と /clear で 0 から数え直します」と一律に書く (data-model.md:226)
- **推奨アクション**: 注記を「費用とトークンは …」に限定するか、項目ごとに書く
- **根拠**: PO-3

### [Low] 中央のヘッダの費用には注記が無く、使用量のタブを開く入口も無い (L-003) (scope: feature)

- **観察**:
  - spec.md:126 は「費用は Provider の課金に直結する」と書く。しかし SDK は `total_cost_usd` を "An estimate, not a billing statement" としている (sdk.d.ts:5285)
  - 注記 `usageEstimateNote` は使用量のタブにしか無い (data-model.md:176)。中央のヘッダの費用 (data-model.md:190) は、`aria-label` / `title` で「推定」と伝えるだけである
  - 右のペインは既定で畳まれている (glossary.md:911) のに、ヘッダの目盛りから使用量のタブを開く入口が無い
- **推奨アクション**: Why を「費用の目安が見える」に直す。ヘッダの費用を押すと使用量のタブを開く (`setPanelTab` をシェルの中で書くだけ) か、`title` に注記の全文を出す
- **根拠**: PO-1 / PO-6

### [Low] FR-019 の行き先に、続けて承認が来る場合の扱いが無い。「さらに表示」の行き先と名前が合わない (L-004) (scope: feature)

- **観察**:
  - 承認カードを押した後はフォーカスを composer に移す (data-model.md:264)。しかし次の `permission-request` は `pending` を置き換えて新しいカードを出す (src/renderer/src/features/session/running-session-store.ts:303-311)。そのときフォーカスは composer にあり、新しいカードには移らない
  - 「さらに表示」の最後の押下 (data-model.md:267) は古いメッセージを読むための操作なのに、行き先が下端の composer になっている
  - FR-019 は「表示を増やす」(spec.md:239) と書くが、UI の文言は「さらに表示」である (labels.ts:156)
- **推奨アクション**: 続けて承認が来る場合の行き先を §8 に書く。「さらに表示」の行き先を composer にする理由を書くか、行き先を変える。FR-019 の名前を UI の文言に揃える
- **根拠**: PO-6

### [Low] FR-017〜FR-019 に受け手と AC が無い。tasks.md:177 の根拠が SC-007 の文面と合わない (L-005) (scope: feature)

- **観察**: FR-017〜FR-019 (spec.md:230-241) には User Story も Given-When-Then も無く、SC-007 でまとめて測る。tasks.md:177 は「SC-007 が同じ PR を求める」とするが、SC-007 (spec.md:263) の文面にその要求は無い
- **推奨アクション**: 「義務の扱い」の表に、受け手 (キーボードの利用者・支援技術の利用者) と価値の列を足す。tasks.md:177 の根拠を FR-014 / FR-016 に直す
- **根拠**: PO-1 / PO-5

### [Low] 同じアカウントの他のセッションに帯を出さないことが Out of Scope に無い (L-006) (scope: feature)

- **観察**: 帯はセッションごとで (data-model.md:163 / spec.md:118 AC5)、その理由は data-model にしか無い。Out of Scope (spec.md:274-280) には書かれていない。R1 M-005 の推奨の残りである
- **推奨アクション**: Out of Scope に 1 行足す
- **根拠**: PO-4

### [Medium] (H) 失敗の分類が汎用の理由に倒れたとき、その形を後から知る観測点が無い (M-009) (scope: feature)

- **観察**: 知らない形は `provider-error` に倒れる (data-model.md:22)。`src/agents/` に log の呼び出しは 0 件である。分類の入力 (subtype・`api_error_status`・`AssistantErrorKey`) は数と列挙なので U-5 の「文字列」には当たらないが、どこにも残らない
- **リスク/影響** (PO-7 サポート / 運用): 利用者が「Provider エラー」と報告しても、どの形で届いたかを確かめられない。RK-05 (SDK の版で値が増える) も、tsc の `Equal<…>` でしか検出できない。実行時に知らない値が来たことは見えない
- **推奨アクション**: 分類の入力を数と列挙だけで観測できる点を 1 つ置く (例: 開発ビルドだけの診断の出力)。Principle V / U-5 に触れない範囲であることを書く。置かないなら、理由を plan の Risks に書く
- **根拠**: PO-7 / H (observability)

### [Low] (H) KPI「並列時の滑らかさ」を、計量を流した状態で測る経路が無い (L-007) (scope: system)

- **観察**: session charter の KPI (charter.md:145-147) は E2E (10 本 × 20 件/秒) で測る。しかし本 feature は E2E で計量を流さない (plan.md:22, :247)。SC-004 が測るのは、セッションスレッドの流量の上限だけ。O-8 (c) への申し送り (plan.md:155) も、基準が変わったことを書くだけである
- **推奨アクション**: renderer の単体で、10 セッション分の `meter` を流しても表示中の Thread の描画回数が増えないことを測る。または roadmap の O-8 の行に「計量を含めて測る」と書く
- **根拠**: H (regression)
- **scope 根拠**: KPI の実機計測の持ち主は O-8

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `記録する` (quickstart.md) / `V-4 #3` の後追い (plan, tasks) / `console\.\|logger\|log\(` (src/agents の非テスト) | 2 / 1 / 0 | quickstart.md:28, :31 / plan.md:279 (tasks.md:149 に #3 なし) / 0 件 |
| M-001 | `quotaWait\|quotaReset\|quotaRejected` | 3 | data-model.md:158, :159, :230 |
| M-002 | `過ぎ\|過去の時刻\|経過した\|期限\|stale` | 0 (該当する規則) | — |
| M-003 | `Reasoning の表示` / US-4 の AC の `概要` | 2 / 1 | spec.md:154, :209 / spec.md:150 |
| M-004 | `overloaded\|model_not_found\|server_error\|invalid_request\|max_output_tokens` | 0 | — (sdk.d.ts:3411 に 13 値) |
| M-005 | `オフライン\|ネットワーク\|no_response\|到達` | 4 (到達不可の扱いは 1) | data-model.md:5 (到達不可) / data-model.md:66, research.md:46, tasks.md:75 (`no_response` は読まない側) |
| M-007 | `unsafeModeBanner\|警告の帯` (spec / data-model / tasks) | 10 | spec.md:70, :151, :169, :207 / data-model.md:151, :169, :232 / tasks.md:15, :97, :106 (:105 は長い行で省略。tasks.md:157 も該当) |

## Verdict

- Critical: 0
- High: 1
- Medium: 9
- Low: 7
- Round inheritance: resolved from R1: 12 (H-001 / H-002 / H-003 / M-001 / M-002 / M-003 / M-004 / M-005 / M-006 / M-007 / M-008 / L-001。H-003・M-004・M-005・M-007 は一部が残り、新しい H-001 / M-006 / L-006 / L-002 として出した) / unresolved: 1 (R1 L-002。追加事実をつけて M-008 に格上げ) / new: 16

参照したファイル:
- C:\dev\closta\specs\014-ui-metering-and-limits\spec.md
- C:\dev\closta\specs\014-ui-metering-and-limits\plan.md
- C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md
- C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md
- C:\dev\closta\specs\014-ui-metering-and-limits\research.md
- C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md
- C:\dev\closta\docs\domains\ui\charter.md
- C:\dev\closta\docs\domains\session\charter.md
- C:\dev\closta\docs\glossary.md
- C:\dev\closta\docs\ui-coverage.md
- C:\dev\closta\docs\decisions\0047-session-meter-and-failure-reasons.md
- C:\dev\closta\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts
- C:\dev\closta\src\renderer\src\features\session\LivePane.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\renderer\src\features\session\running-session-store.ts
