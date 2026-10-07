---
spec_id: 014-ui-metering-and-limits
feature_id: O-4
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: implementing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 計量と制限の表示 (O-4)

**Feature Branch**: `014-ui-metering-and-limits`

**Created**: 2026-10-04 (夜間の自走で起案。夜間に仮採用した判断は **2026-10-05 に利用者が推奨案どおり承認した** — 下の「判断」を参照)

**Status**: frontmatter の `status:` を正とする

**Reopened**: 2026-10-07 (夜間の自走)。O-7 の設計段階の上で書いた design を main (O-7・O-3 の完了の後) に載せ直し、O-7 の実装 (PR #13)・O-3 の実装 (PR #14)・roadmap の O-4 の行 (順 14) と system-scope の持ち主の記録に合わせて直した。plan 以降は作り直す

**Input**: User description: "[ui] O-4 (roadmap M3 の順 13、domain: ui、依存: O-2): SDK が emit する計量と制限の情報を表示する。対象は docs/ui-coverage.md で「後続: O-4」の行で、範囲は roadmap の O-4 の行の「対応表の割当 (O-2 から)」に従う (result の失敗の理由・費用・使用量・ターン数・permission_denials、rate_limit_event (Quota banner)、api_retry、status (権限モードの変化・圧縮中・圧縮の失敗)、thinking_tokens、tool_progress、Context display、Cost meter、task_progress)。完了の PR で対象の行を実装済み / 表示不要に書き換え、Constitution 検証の項目 21 の M3 の残りを減らす。" --targets both

## Summary

実行中のセッションで、Claude Code が知らせている「どれだけ使ったか」「何に止められたか」「今何をしているか」を見えるようにする。

- **失敗の理由**: ターンが失敗したとき、理由 (認証・レート制限・API のエラー・実行中のエラーなど) を区別して出す。今は全部「Provider の認証/接続」と出る
- **制限と再試行**: レート制限に近づいた・超えたことを中央のヘッダの下の帯 (Quota banner) で、API の再試行を transcript の行で知らせる
- **使用量**: 費用・トークン・ターン数・コンテキストの使用量の推定を、右のペインの「使用量」のタブと中央のヘッダの小さな目盛りで出す
- **進み具合**: 権限モードの変化・コンテキストの圧縮 (中・失敗)・tool の経過時間・思考のトークン数・背景の task の進み具合を出す

完了の PR で `docs/ui-coverage.md` の `後続: O-4` の行 (Tier A 5 行・Tier B 5 行) を `実装済み` / `表示不要` に書き換える。

**なぜ今**: M3 の達成状態「未表示情報がゼロ」の残りのうち、O-4 の行には Tier A が 5 行ある (result・status・api_retry・rate_limit_event・get_context_usage)。とくに失敗の理由は、今は認証の失敗とレート制限と実行中のエラーを区別できず、利用者が次に何をすればよいか分からない。

## 本 feature の位置づけ

- **O-7 (アプリのシェル。[spec 013](../013-ui-app-shell/spec.md)。PR #13 で完了) の上に置き場所を書く。** 置き場所の語彙は AD-046 Decision 6 (中央のヘッダ・中央の本体・右のペインのタブ)。面の状態の書き手の規則は ui charter の「面の状態」に従う。中央のヘッダには O-3 の会話内検索のボタンが並ぶ
- **session の契約を広げる (U-1)。** SDK のメッセージは agents (セッションスレッド) で変換されて renderer に届く。理由の区別と計量を届けるには、session の契約 (`LaunchFailureReason` の集合・`SessionEvent` の種類) を広げる必要がある。決定は ADR (AD-047。2026-10-05 に accepted) に記録した
- **制御要求を新たに呼ばない。** Cost meter は毎ターンの `result` が運ぶ値 (`total_cost_usd` / `modelUsage`) から出す。Context display は、主ループの最後の assistant のメッセージの入力側の `usage` を、`result` の `modelUsage` の `contextWindow` で割って出す (Clarifications / data-model §2 / §4。`result` の `usage` はターン内の往復の合算でありうるので使わない)。`get_context_usage` / `get_session_cost` / `get_usage` を呼ばないので、Agent SDK の呼び出しの許可リスト (Constitution 検証の項目 14) と query の options のキー (AD-041 (g)) は変えない (U-3)
- **過去ログは対象にしない。** 計量と制限は実行中のセッションの情報である。過去ログ (`getSessionMessages`) に `result` などが残るかは対応表の経路で「実行中」とする

### 義務の扱い

roadmap が O-4 に預けた義務 (O-4 の行と、system-scope の持ち主の記録で O-4 に当たるもの) の扱いの正本はこの表である。

| 義務 (roadmap の記録) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| O-7 から: 右のペインのタブのテストを `AppShell.test.tsx` に追記せず、共通の setup を `test-support/` に出して分ける (code-gate convention M-008) | 入れる | FR-017 |
| O-7 から: 2 つ目のタブを足すときに tablist に矢印キーと roving tabindex を入れる (pr-gate R1 a11y M-004) | 入れる (「使用量」が 2 つ目のタブ) | FR-017 |
| O-2 から: 対応表の `後続: O-4` の行 (失敗の理由・計量・制限・進み具合) | 入れる | US-1〜US-4 / FR-001〜FR-014 |
| system-scope「`running-session-store.ts` の切り出しと、行の状態の型の置き場」(1)〜(3) (持ち主 = store に派生値を足すか、監視ビューの行を触る次の feature) | 入れる | FR-018。O-4 は稼働中のストアに `meters` を足し (FR-005)、監視ビューの行の短い理由と再ログインの導線を変える (FR-002 / U-1) ので両方に当たる |
| system-scope「押したボタンが自分ごと消えると、フォーカスが body に落ちる」(O-7 pr-gate R2 (2)。持ち主 = 監視ビューの行を触る次の feature。切り出しの (3) とあわせる) | 入れる | FR-019 |
| system-scope「Provider」と「プロバイダ」の表記の揺れ (O-7 pr-gate R2 (3)。持ち主 = provider の文言を次に触る feature) | 入れる | FR-016。O-4 は失敗の理由の文言 (「Provider の認証/接続」など。`session/labels.ts`) を書き換える。glossary の表記 `Provider` に揃える |
| system-scope の composer のフォーカスの奪取 (持ち主 = O-5 と X-6 の早いほう)・`runtime-store.ts` の single-flight (持ち主 = 次に `runtime-store.ts` を触る feature)・直近の活動の不可視文字 (持ち主 = 次に `sanitizeBody` か直近の活動を触る feature) | 当たらない | O-4 は composer・`runtime-store.ts`・`sanitizeBody`・直近の活動の導出を変えない |

## 判断 (2026-10-04 の夜間の自走で仮採用し、2026-10-05 に利用者が承認)

利用者は下の表の「仮採用した案」と AD-047 を 2026-10-05 に推奨案どおり承認した。

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | ui の feature が session の契約 (失敗の理由のキー・`SessionEvent` の種類) と session の操作 UI (監視ビューの行の短い理由と再ログインの導線・稼働中のストアの `meters`) を変えてよいか (domain をまたぐ)。X-1 FR-020 / US-4 AC6 (クレジット不足・rate limit などは `provider-error`) の読み替えを含む | 変える。O-4 (ui) が持ち、session charter に記録する。決定と読み替えは AD-047 (proposed) | session の feature (X-6 など) に切り出し、O-4 はその後に表示だけを作る |
| U-2 | 計量の運び方 | `SessionEvent` に種類 `meter` を 1 つ足し、数と列挙の値だけを運ぶ (会話由来の文字列を運ばない)。transcript の行になるもの (API の再試行・圧縮・権限モードの変化) は O-2 のシステムイベントの行の経路 (`message`) で運ぶ | 状態通知 (`SessionStatusUpdate`) に載せる (main を経由し、X-5 FR-004 の「状態通知に会話由来を載せない」の検査の範囲が広がる) / 全部をシステムイベントの行にする (計量は行ではない) |
| U-3 | 制御要求 `get_context_usage` / `get_session_cost` / `get_usage` | 呼ばない。対応表の 3 行は `表示不要` と理由 (毎ターンの result と主ループの assistant の値で足りる・カテゴリ別の内訳は Claude Code の `/context` で見られる) にする。Tier A の `get_context_usage` を表示不要にするのは、Context display を推定 (主ループの最後の assistant の入力側の usage を result の `contextWindow` で割る) で実装済みにするため | 呼ぶ (Constitution 検証の項目 14 の許可リストの追加に ADR が要る。カテゴリ別の内訳を出せる) |
| U-5 | 失敗の文字列 (`errors`。roadmap の O-4 の行が挙げる) を出すか | 出さない。CLI のエラー文にパスや秘密が含まれうる。理由のキーで区別する (data-model §1) | sanitize して 1 行で出す |
| U-6 | 実行中に権限モードが安全 3 値の外になったのを観測したとき (AD-041 の「昇格経路 0 件」の逸脱の信号) | 警告の帯 (`role="alert"`) で知らせ、隔離の無いランタイムでは文言を強める。強制 (中断・失敗にする) はしない。強制の持ち主は I-3 (権限モードのゲート) とし、roadmap の I-3 の行に書く | 隔離の無いランタイムでは中断する (理由のキー `permission-escalated`) |
| U-4 | 失敗の後の扱い | 今と同じく、エラーの result でセッションを「失敗」にする (X-1 FR-020 / US-4 AC6 を保つ)。理由のキーを細かくするだけで、終わり方は変えない | ターンの失敗だけでセッションを続ける (session の状態遷移の変更。別 feature) |

U-3 の字面は 2026-10-08 に、Context display の材料の書き誤り (「result の値」「result の推定」) を直した。決定 (制御要求を呼ばない) は変えない。利用者が訂正として扱うと決め、AD-047 にも同じ訂正節を足す (plan の ADR 節。design-gate R2 HG-01)。

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

- Q: 失敗の理由の文字列 (`errors`) を出すか → A: 出さない。理由のキーだけを運ぶ (CLI のエラー文に秘密やパスが含まれうる) [ASSUMED]
- Q: 費用は何を出すか → A: `total_cost_usd` (セッションの累計の推定)。「推定であり請求ではない」と添える [ASSUMED]
- Q: コンテキストの使用量の推定 → A: 最後の assistant のメッセージ (1 回の API 呼び出し) の `usage` の入力 (入力 + キャッシュの読み込み + キャッシュの作成) を、result の `modelUsage` の主モデルの `contextWindow` で割る。result の `usage` はターン内の往復の合算でありうるので使わない (design-gate R1)。推定と明示し、実機で `/context` と比べる (quickstart V-3) [ASSUMED]
- Q: レート制限の帯を出す条件 → A: `status` が `allowed_warning` か `rejected` のとき。`allowed` に戻ったら消す [ASSUMED]

## User Scenarios & Testing

### User Story 1 - ターンが失敗した理由が分かる (Priority: P1)

利用者は、実行中のセッションが失敗したとき、それが認証の失敗か、レート制限か、API のエラーか、実行中のエラーかを知り、次の操作 (再ログイン・待つ・起動し直す) を選べる。

**Why this priority**: 今は全部「Provider の認証/接続でエラー」と出て、レート制限でも再ログインを案内してしまう。

**Independent Test**: agents の分類の純関数の単体 (SDK の result の fixture → 理由のキー) と、失敗の表示の component テスト。

**Acceptance Scenarios**:

1. **Given** result が `is_error: true` で `api_error_status` が 401 / 403、**When** 届く、**Then** セッションは失敗になり、理由は「認証の失敗」で再ログインを案内する
2. **Given** `api_error_status` が 429、**When** 届く、**Then** 理由は「レート制限」で、待つことを案内する (再ログインを案内しない)
3. **Given** `api_error_status` がそれ以外 (5xx など)、**When** 届く、**Then** 理由は「API のエラー」。状態が無いときは AC6 と同じく汎用の理由 (条件の正本は data-model §1)
3a. **Given** 同じターンの assistant のメッセージの `error` が `billing_error`、**When** result が失敗で届く、**Then** 理由は「請求・アカウント」で、クレジットとアカウントを確かめる案内が出る (今の「クレジットを確認」の案内を保つ)
4. **Given** subtype が `error_during_execution` / `error_max_turns` / `error_max_budget_usd` / `error_max_structured_output_retries`、**When** 届く、**Then** それぞれ区別した理由が出る
5. **Given** どの失敗でも、**When** 表示する、**Then** 黙って完了にならない (X-1 FR-020 / US-4 AC6)。監視ビューの行の短い理由・読み上げも同じ理由になる
6. **Given** 知らない subtype の result、**When** 届く、**Then** 今と同じ `provider-error` (汎用) に倒す

---

### User Story 2 - 制限と再試行が分かる (Priority: P1)

利用者は、レート制限に近づいた・超えたこと、API の再試行が起きていることを、表示中のセッションで知る。

**Why this priority**: 制限に当たると応答が止まって見えるが、理由が出ないので中断や再起動をしてしまう。

**Independent Test**: agents の変換の単体と、Quota banner・再試行の行の component テスト。

**Acceptance Scenarios**:

1. **Given** `rate_limit_event` の `status` が `allowed_warning`、**When** 届く、**Then** 中央のヘッダの下に注意の帯が出て、制限の種類 (5 時間・7 日など)・使用率・解除の時刻が出る
2. **Given** `status` が `rejected`、**When** 届く、**Then** 帯は警告の見た目になり、解除の時刻まで待つことを案内する
3. **Given** 帯が出ている、**When** `status` が `allowed` の event が届く、**Then** 帯が消える
4. **Given** `api_retry` が届く、**When** transcript を見る、**Then** 「API を再試行中 (n / m 回目、HTTP の状態、待ち時間)」の 1 行が出て、同じターンの再試行は同じ行で書き換わる
5. **Given** 別のセッションを表示している、**When** 稼働中のセッションがレート制限を受ける、**Then** そのセッションを表示したときに帯が出る (帯はセッションごと)

---

### User Story 3 - 使用量とコンテキストの余裕が分かる (Priority: P1)

利用者は、表示中のセッションの費用・トークン・ターン数と、コンテキストの使用量の推定を見る。

**Why this priority**: コンテキストが尽きると圧縮が走って文脈を失う。費用は Provider の課金に直結する。どちらも今は見る場所が無い。

**Independent Test**: 計量の導出の純関数の単体と、右のペインのタブ・中央のヘッダの目盛りの component テスト。

**Acceptance Scenarios**:

1. **Given** 表示中のセッションでターンが終わった (result)、**When** 右のペインの「使用量」のタブを見る、**Then** このセッションの累計の費用 (推定)・入力 / 出力 / キャッシュのトークン・ターン数・モデルごとの内訳・聞かれずに拒否された操作の件数が出る
2. **Given** assistant の応答が届いた、**When** 中央のヘッダを見る (右のペインを畳んでいても)、**Then** コンテキストの使用量の推定 (割合) と費用の累計 (推定) の小さな目盛りが出て、80% を超えると注意の見た目、100% を超えたら「100% 以上」になる
3. **Given** まだ result が届いていない、**When** 見る、**Then** 「最初の応答の後に出ます」の空の状態
4. **Given** 値はセッションをまたいで混ざらない、**When** 別のセッションに切り替える、**Then** そのセッションの値が出る
5. **Given** 過去のセッションを表示している、**When** 「使用量」のタブを見る、**Then** 「実行中のセッションだけ」の空の状態 (タブは出すが値は無い)

---

### User Story 4 - 実行中の進み具合が分かる (Priority: P2)

利用者は、権限モードが変わったこと・コンテキストの圧縮が走っている / 失敗したこと・tool がどれだけ走っているか・思考にどれだけ使っているか・背景の task の進み具合を見る。

**Why this priority**: 承認の判断 (権限モード) と待ち時間の見積もりに要るが、US-1〜US-3 が無くても致命的ではない。

**Independent Test**: agents の変換の単体と component テスト。

**Acceptance Scenarios**:

1. **Given** `status` か、各ターンの最初の `init` の `permissionMode` が、前に観測したモード (最初は起動の設定) と違う (ExitPlanMode の後など)、**When** 届く、**Then** transcript に「権限モードが {モード} に変わりました」の 1 行が出て、「概要」のタブ (O-7) の権限モードが今のモードになる (起動の設定・プリセットには書き戻さない)
1a. **Given** 今のモードが安全 3 値の外 (`acceptEdits` / `bypassPermissions` / `auto` など)、**When** 中央を見る、**Then** 中央のヘッダの下に警告の帯 (`role="alert"`) が出て、隔離の無いランタイムでは文言が強まる。それ以外 (隔離の仕組みのあるランタイム・未確定) では、このセッションの隔離をアプリが確かめていないことを添え、隔離されていると読める文言にしない (data-model §4) (U-6。**この AC は P1 として扱い、US-4 の他の AC と分けて後回しにしない** — Principle III)
2. **Given** `status` が圧縮中 (`compacting`)、**When** 届く、**Then** transcript に「コンテキストを圧縮中」の行が出て、終わると成功 / 失敗に書き換わる。失敗の理由の文字列 (`compact_error`) は出さない
3. **Given** tool が走っている (`tool_progress`)、**When** tool の表示を見る、**Then** 経過時間 (秒) が出て更新される (1 秒に 1 回まで)
4. **Given** 思考中 (`thinking_tokens`)、**When** Reasoning の表示を見る、**Then** 「思考中 約 N トークン」が出る (推定)
5. **Given** 背景の task (O-2 の task の行) の `task_progress`、**When** 届く、**Then** その行に使ったトークン・tool の回数・経過時間が出る。行の無い task への進み具合は捨てる (状態を持たない。AD-044 Decision 6)。要約 (`summary`)・説明は出さない (O-2 の扱いを保つ)

---

### Edge Cases

- `rate_limit_event` が `resetsAt` を持たない → 解除の時刻を出さず「しばらく待ってから」とだけ出す
- `api_retry` の `error` の中身 → 出さない。HTTP の状態 (数) と回数だけ
- 起動時のエラーの result (費用もターン数も 0) → 前の値を上書きしない (条件の正本は data-model §2)。`/clear`・再開で累計が 0 から数え直される → そのまま出す (推定と数え直しを添える)
- 429 で失敗したが `rate_limit_event` が届かない Provider (API キー・Bedrock) → 帯は出ず、失敗の文言は「しばらく待ってから」(帯を参照しない)
- `modelUsage` に複数のモデル (subagent・圧縮) → 内訳はモデルごと。コンテキストの推定は主モデル (起動の設定のモデル、無ければ出力トークンの最も多いモデル。照合の規則の正本は data-model §4) で出す
- `contextWindow` が 0 か無い → コンテキストの目盛りを出さない
- `tool_progress` / `thinking_tokens` が大量に届く → セッションスレッドで間引く (tool ごと・思考ごとに 1 秒に 1 回まで)。renderer の負荷 (O-1 の並列時の滑らかさ) を上げない
- 表示中でないセッションの計量 → ストアに最新の値だけを持ち、表示しない (行の数を増やさない)
- `status` か `init` の `permissionMode` が安全 3 値の外 (起動の直後からを含む) → 原因を断定せず「アプリが選んでいない権限モード」の警告の帯 (U-6 / data-model §4)。アプリはそのモードを選ばせない (Principle III)
- tool の結果・assistant の応答・セッションの終了の後に、間引いて保留した経過時間や思考の値を送らない (data-model §2 の取り消し)
- セッションが終了・失敗した後の計量 → 最後の値を残す (読み取り専用)

## Requirements

### Functional Requirements

#### 失敗の理由 (US-1)

- **FR-001**: agents は、エラーの result を理由のキーに分類しなければならない。
  - キーと条件の正本は data-model §1 (認証の失敗・レート制限・API のエラー・実行中のエラー・ターン数の上限・予算の上限・構造化出力の再試行の上限、知らないものは `provider-error`)
  - `classifyResult` の「`subtype === 'success'` かつ `is_error === false` のときだけ完了」は変えない (X-1 FR-020 / US-4 AC6)。分類は失敗の理由を細かくするだけ
  - 失敗の文字列 (`errors` / `result` の本文) は運ばない
- **FR-002**: `LaunchFailureReason` に FR-001 の理由を足し、renderer の全文・短い理由・読み上げの文言を足さなければならない (data-model §5)。再ログインの導線を出す理由の正本は data-model §1 (`auth-failed` と汎用の `provider-error`)

#### 計量の運び方 (US-2〜US-4)

- **FR-003**: セッションスレッドは、計量を `SessionEvent` の新しい種類 `meter` で renderer に届けなければならない (U-2。AD-047)。
  - 運ぶ値は data-model §2 の許可リストに限る (数・真偽・列挙・モデルの id・形を検証した tool の id)。会話由来の文字列・エラー文・パスを運ばない
  - 状態通知 (`SessionStatusUpdate`) には載せない (X-5 FR-004)。既存の port (AD-034 / AD-043) を通り、main を経由しない
  - 値の検証 (数の範囲と単位・id の形・列挙・件数の上限) と、間引き・取り消し・上限の正本は data-model §2。agents と decoder で同じ定数を使う
  - 行の id の連番と権限モードの比較の基準は、セッションスレッドの `run()` の closure に持つ
- **FR-004**: transcript の行になる出来事 (API の再試行・圧縮の開始と結果・権限モードの変化・背景の task の進み具合) は、O-2 のシステムイベントの行の経路で届けなければならない。種類の追加と通すフィールドの正本は data-model §3。1 つの出来事は 1 行で、同じ出来事の続きは同じ行に合成する (O-2 FR-009 の規則)。行の組み立ては agents に置き、過去ログの変換 (`toSystemEventMessage`) には足さない
- **FR-005**: renderer は、稼働中のセッションごとに計量の最新の値を持たなければならない (稼働中のストア)。永続化しない。セッションを閉じたら捨てる (`close()` の削除の列挙に入れる)。起動の設定・プリセットに書き戻さない

#### 制限と再試行 (US-2)

- **FR-006**: 中央のヘッダの下に Quota banner を出さなければならない。表示の条件・文言・見た目は data-model §4。表示中のセッションの最新の `rate_limit_event` で決める
- **FR-007**: API の再試行は transcript の 1 行 (回数・最大回数・HTTP の状態・待ち時間) で出さなければならない。エラーの中身は出さない

#### 使用量 (US-3)

- **FR-008**: 右のペインに「使用量」のタブ (O-7 のタブの表に 1 行) を足さなければならない。項目と導出の正本は data-model §4 (費用の推定・トークン・ターン数・モデルごとの内訳・聞かれずに拒否された操作の件数)。稼働中のセッションだけで値を出し、過去と未選択は空の状態
- **FR-009**: 中央のヘッダにコンテキストの使用量の推定と費用の累計の推定の目盛りを出さなければならない。コンテキストは最後の assistant のメッセージ (1 回の API 呼び出し) の入力のトークンを主モデルの `contextWindow` で割る。導出・閾値・100% 超の表示の正本は data-model §4。推定であることを支援技術にも伝える

#### 進み具合 (US-4)

- **FR-010**: 権限モードの変化は、transcript の行に出し、「概要」のタブ (O-7) に今のモードを出さなければならない (中央のヘッダには常設しない。O-7 data-model §5 の「重ねない」を保つ)。O-7 の「起動時の権限モード」の行は起動時の値のまま残し、今のモードが起動時と違うときだけ「現在の権限モード」の行を足す [ASSUMED — O-7 data-model §5 が「起動時の」を実行中に変わりうる軸にだけ付け、実行中の変化を O-4 に預けた形に合わせる]。今のモードが安全 3 値の外のときは、中央のヘッダの下に警告の帯を出す (U-6)。判定は domain の `isSafePermissionMode`、文言の正本は data-model §4 / §5。強制はしない (持ち主は I-3)
- **FR-011**: 圧縮中・圧縮の成功・失敗を transcript の 1 行で出さなければならない (`compact_error` の文字列は出さない)
- **FR-012**: 実行中の tool の表示に経過時間を、Reasoning の表示に思考のトークン数の推定を出さなければならない
- **FR-013**: 背景の task の行 (O-2) に、`task_progress` の数 (トークン・tool の回数・経過時間) を、行の更新 (`opens: false`) として出さなければならない。task の状態 (種類・実行中か・一覧) をセッションスレッドにも renderer にも持たない (AD-044 Decision 6)。間引きの鍵 (1 秒以内の保留の値と時刻。保留が無ければ 1 秒を過ぎて外れる。data-model §2) は task の状態に含めない。要約・説明・最後の tool 名は出さない

#### 対応表と記録 (完了の条件)

- **FR-014**: 完了の PR で `docs/ui-coverage.md` の `後続: O-4` の行をすべて書き換えなければならない (Constitution XII / AD-044)。
  - A 節の `result` / `status` / `api_retry` / `rate_limit_event` / `tool_progress` / `task_progress` / `thinking_tokens` → `実装済み: <element> (実行中)`。経路は「実行中」
  - E 節の `get_context_usage` / `get_session_cost` / `get_usage` → `表示不要: <理由>` (U-3)。Tier A の `get_context_usage` の備考に「Context display は assistant の usage と result の contextWindow の推定で実装済み (経路: 実行中)」「カテゴリ別の内訳は出さない」「AD-047 Decision 4」(AD-044 Decision 2)。`result` の行の備考に「`errors` は出さない (U-5)」
  - 項目 21 の出力で、割当先が O-4 の Tier A の行が 0 になる
- **FR-015**: 決定を ADR (AD-047。2026-10-05 に accepted) に記録しなければならない: 失敗の理由のキーの拡張、`meter` の種類と許可リスト、制御要求を呼ばないこと。AD-047 の字面と設計の差 3 つ (Context display の材料・運ぶ値の tool の id・昇格値の綴りの置き場) は、AD-047 に日付つきの訂正節を足して直す (AD-031 Decision 1。2026-10-08 に利用者が訂正として扱うと決めた。項目は plan の ADR 節)。`SESSION_EVENT_KINDS` と `LAUNCH_FAILURE_REASONS` の固定テストを直す
- **FR-016**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。
  - glossary: 計量 (meter)、Quota banner、コンテキストの使用量の推定、失敗の理由の各キー。「FailureReason (起動系)」を「起動とターンの失敗」に改め件数を直す。「システムイベントの行」の定義に新しい category を足す
  - session charter: 失敗の理由のキーと `meter`、監視ビューの行の短い理由と再ログインの導線、稼働中のストアの `meters` を記録する (U-1)。KPI の計測には使わない
  - roadmap: O-4 の行 (`ResultTermination` は広げず `errors` を運ばない差を記録)、O-6 の行 (圧縮の行と境界の element の統合の判断)、O-8 の行の (c) (`receivedMessages` の基準の変化)、I-3 の行 (権限モードの昇格を観測したときの強制の要否。U-6)。上の「義務の扱い」で入れた system-scope の 3 項目 (切り出し・消えるボタンのフォーカス・Provider の表記) に結論を書く
  - 「Provider」と「プロバイダ」の表記を glossary の `Provider` に揃える (`shell/labels.ts` の設定の項目名・`session/labels.ts`・`provider/labels.ts`。E2E の locator を同じ PR で直す)
  - 005 の正本 (FR-020 / US-4 AC6 / data-model §6) に AD-047 への参照を置く
  - ui charter: Related Specs に O-4
  - roadmap: O-4 の行、`_overview.md`

#### O-7 と system-scope から預かった義務 (義務の扱いの表)

- **FR-017**: 右のペインのタブの表に「使用量」を足すとき、tablist は WAI-ARIA APG の Tabs pattern に従わなければならない。
  - ←/→ で隣のタブ、Home / End で端のタブへ移り、選ばれているタブだけが Tab 順に入る (roving tabindex)。フォーカスの移動で選択も移す (自動の選択) [ASSUMED — パネルの中身はすぐ描けるので APG の推奨のとおり]
  - 表示できないタブ (`availableFor`) は矢印キーの移動の対象にもしない
  - タブのテストは `features/shell/AppShell.test.tsx` に足さない。共通の setup を `test-support/` に出し、タブの表のテストを別のファイルにする (O-7 code-gate convention M-008)
- **FR-018**: `meters` を足す前に、稼働中のストアと監視ビューの行を roadmap の system-scope の記録 (1)〜(3) のとおりに分けなければならない。振る舞いは変えない (既存のテストは書き換えずに通る。例外は (2) が戻り値を変える `announcements` の単体だけで、名前の組の検査に直す — plan で確定。research R-11)。
  - (1) 派生値の追跡と間引き (`trackDerived` / `scheduleActivity`) を `running-session-store.ts` から小さなモジュール (`running-session-monitor.ts` など) に出す
  - (2) `SessionRowStatus` と `Elapsed` の型を文言の表 (`labels.ts`) から出し、labels 側は `Record<SessionRowStatus, string>` で検査する。`announcements` は表示名の組を返し、文は呼び出し側が組む
  - (3) `RunningSessionList.tsx` の行の部品 (`RowStatusBadge` / `ElapsedTime` / `RowActivity` / `SessionRowMeta` / `RowTooltip`) を `RunningSessionRow.tsx` などに出す。O-4 の短い理由と再ログインの導線は切り出した後の部品に足す
- **FR-019**: 押したボタンが自分ごと消えたとき、フォーカスを body に落としてはならない (WCAG 2.4.3。roadmap の system-scope の O-7 pr-gate R2 (2))。
  - 行き先: サイドバーの稼働中の行の「閉じる」→ 隣の行の Trigger か稼働中の区画の見出し。承認カードの「許可」「拒否」・キューの拒否の告知の「閉じる」・積んだ入力の「キューから削除」・「表示を増やす」の最後の押下 → composer
  - 直し方 (各部品で消える前に移すか、シェルの 1 か所で拾うか) の正本は plan。シェルで拾うなら `focusout` は使わない (roadmap の記録の理由)
  - O-7 の `useFocusRescue` (中央の中身の切り替え) の規則は変えない

### Key Entities

- **失敗の理由のキー**: `LaunchFailureReason` の拡張。正本は data-model §1
- **計量 (Meter)**: `SessionEvent` の `meter`。セッションごとの最新の値 (費用・トークン・ターン・コンテキストの推定・レート制限・権限モード・思考のトークン・tool の経過時間)。正本は data-model §2
- **Quota banner**: 中央のヘッダの下の帯。表示中のセッションのレート制限の状態

### Assumptions / Clarifications

- **[承認済み U-1〜U-6]** 上の「判断」の表 (2026-10-05)
- **[ASSUMED]** 失敗の文字列は出さない。費用は `total_cost_usd`。コンテキストの推定の式。帯の条件。間引きは 1 秒に 1 回
- **[ASSUMED]** (2026-10-07 の再開) タブはフォーカスの移動で選択も移す (FR-017)。「概要」の「現在の権限モード」の行は起動時と違うときだけ出す (FR-010)
- 過去ログの `result` などは対象にしない (対応表の経路は「実行中」)

## Success Criteria

- **SC-001**: **失敗の理由が区別される。** data-model §1 の表の各行の fixture が、対応する理由のキーになり、どの失敗も完了にならない (X-1 FR-020 / US-4 AC6)。再ログインの導線は data-model §1 のとおりに出る。計測経路: 分類の純関数の単体 + 失敗の表示の component テスト
- **SC-002**: **計量が届き、会話由来の文字列を運ばない。** SDK のメッセージの fixture から `meter` と システムイベントの行までが data-model §2 / §3 のとおりになり、許可リストの外のフィールドの値が `SessionEvent` と DOM に 0 件 (fixture → port → decoder → ストア → DOM を 1 本通すテストで、2 つのセッションの値が混ざらないことも)。値の検証の外れ (`__proto__`・長い id・URL と scheme の無い userinfo の資格情報の形の modelId・`resetsAt: 1e300`) で例外が出ず落ち、起動の設定が受け付ける形の modelId (`[1m]` 付き・`_` を含む) は落ちない。状態通知のフィールドの差分 0。計測経路: agents の変換の単体 + X-5 の状態通知の全フィールドの走査
- **SC-003**: **制限・使用量・進み具合が出る。** US-2〜US-4 の AC のとおりになる。計測経路: renderer の component テスト (Quota banner・使用量のタブ・目盛り・再試行と圧縮と権限モードの行・tool の経過時間・Reasoning・task の行)
- **SC-004**: **負荷を上げない。** 1 つの tool・思考・task あたり 1 秒に 1 件以下、セッションあたり 1 秒に 20 件以下。tool の結果・assistant・終了の後に保留の送信が 0 件 (`ended` の後の `event` が 0 件)。上限で値を黙って失わない: 休んだ鍵と取り消した鍵は同時に追う上限 (64) を空けるので、長いセッションの 65 個目以降の tool / task にも値が届き、20 件を超えた保留もどの鍵も 4 秒以内に送られる (data-model §2)。計測経路: agents の単体 (偽の時計。並列の tool N 個の合計の流量を含む)。E2E (偽の supervisor) は計量を流さないので計測経路にしない
- **SC-005**: **対応表の O-4 の行が無くなる。** 項目 21 が通り、出力で割当先が O-4 の行が 0、M3 の完了の条件の残りから O-4 の Tier A 5 行が消える。計測経路: `node scripts/constitution/check.mjs`
- **SC-007**: **預かった義務が閉じる。** タブの表で ←/→・Home / End が隣と端のタブへ移り、選ばれたタブだけが `tabIndex=0` で vitest-axe の違反 0 (FR-017)。タブのテストが `AppShell.test.tsx` の外にある。FR-018 の切り出しの前後で既存のテストを書き換えずに通る (`announcements` の単体を除く)。FR-019 の各行き先で、押した後のフォーカスが body でない (「承認待ちで『許可』を押した後、composer にフォーカスがある」を含む)。「プロバイダ」の表記が renderer の文言の表に 0 件。計測経路: タブの表と各部品の component テスト + `git diff` (quickstart)
- **SC-006**: **境界の変更が ADR のとおり。** `SessionEvent` の種類の追加は `meter` の 1 つ、`LaunchFailureReason` の追加は data-model §1 のとおり、Agent SDK の呼び出しの許可リスト・query の options のキー・IPC のチャネル・preload の差分が 0。計測経路: 固定テスト + `git diff` (quickstart)

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表、システムイベントの行の経路と合成の規則 (`system-event`)、task の行
- **O-7** ([013](../013-ui-app-shell/spec.md)。PR #13 で完了): 中央のヘッダ (`CenterHeader`)・右のペインのタブの表 (`panel-tabs.ts`)・「概要」のタブ・面の状態 (AD-046。accepted。正本は ui charter の「面の状態」)
- **O-3** ([012](../012-ui-thread-search/spec.md)。PR #14 で完了): 中央のヘッダの会話内検索のボタン、Command palette の操作の表 (面の畳み)、モーダルの判定 (`DialogContent` の `aria-modal`)
- **X-1 / X-5** (005 / 009): `classifyResult` と FR-030、`SessionEvent` と port、状態通知に会話由来を載せない規則 (X-5 FR-004)
- **O-1** (010): 監視ビューの行の短い理由と読み上げ

## Out of Scope

- 制御要求 `get_context_usage` / `get_session_cost` / `get_usage` の呼び出し (U-3)。カテゴリ別のコンテキストの内訳・プランの全窓の利用率の一覧
- 過去ログの計量 (`result` が過去ログに残るかの確認を含む)
- 失敗の後にセッションを続けること (U-4)
- 監視ビューの行にレート制限・再試行の印を出すこと → 出さない (判断)。行の密度は O-1 で詰めてあり、レート制限で失敗したセッションは失敗の短い理由 (FR-002) で行に出る。制限に近づいた注意は、そのセッションを表示したときの帯で足りる
- 費用の予算・警告の設定
