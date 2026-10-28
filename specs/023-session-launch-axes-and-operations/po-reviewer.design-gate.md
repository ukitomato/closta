# po-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-27
**Reviewer**: po-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (US-1 権限モード)、FR-005〜FR-007 (US-2 モデル)、FR-008 (思考量は呼ばない)、FR-009〜FR-012 (US-3 名前)、FR-013〜FR-018 (置き場所・永続化しない・対応表・ADR・記録)、SC-001〜SC-009 (マージの条件は SC-001〜SC-008、SC-009 は実機で未実施でもよい)
- touched files に該当する charter / Confirmation: session charter の Mission (`charter.md:47-53`)、Journey 2 の手順 3 / Journey 4 の手順 2 (`:107`, `:130-131`)、KPI (`:190-216`。本 feature に直接ひも付く KPI は無い)、glossary の SafePermissionMode / SessionControl / Model catalog / Provider
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (名前の規則の UX 面は E で扱う)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:3 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: po-reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

実行中のセッションについて 3 つの操作を足す。権限モードを安全 3 値の中で切り替える (US-1・P1)、同じ Provider のカタログの中でモデルを切り替える (US-2・P1)、`renameSession()` で transcript に custom-title を書いて名前を付ける (US-3・P2)。操作はすべて中央のヘッダに置き、変更した値は永続化しない。`set_max_thinking_tokens` は `表示不要` にする。tasks は「土台 → US-1 → US-2 → US-3 → Polish」の順。マージの条件は単体・component・E2E・Constitution 検証 (SC-001〜SC-008) で、実機の確認 (quickstart V-0〜V-6 / SC-009) は未実施でもマージできる。どの User Story も WHO / WHAT / WHY がそろっている。Why は具体的で、「起動し直すと実行中の文脈と承認待ちを失う」「10 本を並べると自動の題では見分けにくい」と書かれている。MoSCoW (P1 / P1 / P2) は Mission の「差配する」と対応している。

## Findings

### [High] quickstart V-4 が、US-1 AC3 / data-model §5.1 と食い違っている。V-4 は「ターンの実行中はヘッダの 3 つが押せない」と書くが、権限モードとモデルはターンの実行中でも受け付ける設計 (H-001) (scope: feature)

- **観察**: `specs/023-session-launch-axes-and-operations/quickstart.md:39` は「ターンの実行中・最初のプロンプトの前・終わった行で、ヘッダの 3 つが理由つきで押せないことを確かめる (spec US-1 AC5 / US-3 AC3)」と書いている。一方で次の 3 か所は、権限モードとモデルを `running` / `awaiting_permission` でも受け付けると定めている。
  - `spec.md:108` (US-1 AC3)「ターンの実行中、When 権限モードを切り替える、Then ターンは中断されず、切り替えは受け付けられる」
  - `data-model.md:112`「権限モード・モデルは `running` / `awaiting_permission` / `interrupted` / `done` で受ける」
  - `tasks.md:51` (BE-010)「`running` / `awaiting_permission` で受ける」

  V-4 は、ターンの実行中に押せないのが名前の 1 つだけであることを反映していない。さらに、同じ quickstart の V-1 の 5 (`quickstart.md:19`。ターンの実行中に `plan` に切り替える) とも矛盾している。
- **同種事象探索**: `押せない` で specs/023 を検索すると 15 件 (tasks 5・research 2・spec 4・quickstart 2・data-model 2)。ターンの実行中に 3 つとも押せないと書いているのは `quickstart.md:39` の 1 件だけ。spec (`:111`, `:145-146`, `:154`) と data-model (`:195`, `:197`) は §5.1 と合っている
- **リスク/影響**: SC-009 は実機の確認の正本である。手順どおりに V-4 を行うと、正しく実装されていても「失敗」と記録されてしまう。逆に、実装者が V-4 に合わせて権限モードを止めると、US-1 の本題 (止めずに切り替える) が失われる。
- **推奨アクション**: `quickstart.md:39` を種類ごとに分ける。たとえば「最初の応答の前 (`launching`)・終わった行では 3 つとも押せない。ターンの実行中・承認待ちでは『名前を変更』だけが『応答の実行中は名前を変更できません』で押せず、権限モードとモデルは押せる」とする
- **根拠**: PO-3 (AC と検証手順が 1:1 で対応すること)、spec US-1 AC3、data-model §5.1
- **scope 根拠**: 本 feature の quickstart.md の 1 行で直せる

### [High] Provider が「既定 (null)」のセッションでは US-2 (モデルの切り替え) が使えない。この制約が spec と plan に書かれていない。起動の effort で選択肢が 0 になる場合も同じ (H-002) (scope: feature)

- **観察**: `research.md:28` と `data-model.md:120`, `:195` は、Provider が null (既定) のセッションと、起動の effort を満たすモデルが 0 のセッションについて、モデルの選択を押せない形にし、理由を「この Provider にはモデルの一覧がありません」と出すと定めている。tasks FE-020 / BE-020 のテスト (`tasks.md:64-66`) にも含まれている。ところが spec.md には、US-2 の AC (`:125-129`)、Edge Cases (`:150-159`)、Out of Scope (`:239-246`) のどこにもこの制約が無い。plan.md の Summary (`:18`) にも無い。US-2 の Independent Test (`:121`) は「カタログに 2 つ以上のモデルがある」ことを前提にしており、それ以外のセッションで何が起きるかを書いていない。glossary `:714-715` によると、カタログは Provider ごとの手入力の静的データで、`supportedEffortLevels` は任意である。そのため、Provider を登録していない利用者や、`supportedEffortLevels` を入れていない利用者が effort を指定して起動した場合は、US-2 が丸ごと使えない。
- **同種事象探索**: `Provider が null|既定\)` で specs/023 を検索すると 5 件 (`research.md:28`, `data-model.md:120`, `:195`, `tasks.md:64`, `:66`)。spec.md と plan.md は 0 件
- **リスク/影響**: P1 の User Story が、どの利用者に届くのかが spec から読めない。既定の Provider で使っている利用者には、選択がいつも押せない状態で出る。これが意図した除外なのか漏れなのかを、spec の読者が判断できない。PO-4 の「明示なき漏れ」に当たる。
- **推奨アクション**: spec に次の 2 つを足す。
  1. US-2 に AC を足す。たとえば「Given Provider が既定 (null)、または起動の effort を満たすモデルがカタログに無いセッション、When ヘッダの『モデル』を見る、Then 選択は理由つきで押せない」
  2. Out of Scope に「既定の Provider のセッションのモデルの切り替え (カタログを持たないため)」を書き、必要なら X-6 の後続に送る

  あわせて、US-2 の Why (`:119`) の対象範囲を「モデルのカタログを持つ Provider のセッション」と明記する
- **根拠**: PO-4 (明示されない除外は High 以上)、PO-1 (WHO の範囲)
- **scope 根拠**: spec.md の AC と Out of Scope の追記で閉じる

### [Medium] 最初の応答の前 (`launching`) は権限モードとモデルを変えられない。この制約が spec の AC に無い (M-001) (scope: feature)

- **観察**: `data-model.md:106` は、`launching` を `not-ready` (「最初の応答の後に変更できます」) としている。`research.md:39` はその理由を「最初のプロンプトの前に変えたいときは起動ダイアログで選ぶ」と書く。spec US-1 AC5 (`:110`) は「`claude` の起動前の行」と書くが、`launching` は `claude` が既に動いている窓である (`run-state.ts:69-72`)。spec の文面からは、起動の直後、最初のプロンプトの前に `plan` へ切り替えられないことが読み取れない
- **リスク/影響**: US-1 の利用場面「調べ物の間だけ `plan` に切り替え」の入口に当たる操作である。起動した直後に切り替えたい利用者は、押せない理由を見て初めて起動し直しが要ると知る
- **推奨アクション**: US-1 AC5 に「起動の後、最初の応答の前 (`launching`)」を足す。Edge Cases にも「最初のプロンプトの前に変えたいときは起動ダイアログで選ぶ」と書く
- **根拠**: PO-3 / PO-6 (入口の明示)

### [Medium] 期限切れ (`timeout`) を「失敗・元のまま」と表示するが、SDK の側では変更が効いていることがある (M-002) (scope: feature)

- **観察**: `data-model.md:90` で、待ちは 10 秒で `timeout` になる。`:92` で、そのあとに届いた結果は捨てる。FR-004 / FR-007 (`spec.md:170`, `:176`) と FE-020 (`tasks.md:65`) は、失敗のときに「表示を元の値に戻し、1 行で出す」とする。ところが、`setModel` が期限の後で成功した場合、`currentModelId` は成功の戻り値でしか更新されない (contracts C-2 `:43`)。そのため、ヘッダ・概要のタブ・`ContextCostMeter` は古いモデルを出し続ける。権限モードは `onPermissionModeApplied` で `meter` が後から変わる (`data-model.md:52`)。こちらは「変更できませんでした」の 1 行と、変わった値が同時に出る。名前も同じで、期限で子を止めても書き込みが済んでいることがある (`data-model.md:143`)
- **リスク/影響**: 期限切れは「失敗」ではなく「結果が分からない」状態である。それを「元のまま」と言い切るので、表示と実際が食い違う。とくにモデルは費用に関わる
- **推奨アクション**: Edge Cases に期限切れの扱いを書く。たとえば `timeout` のときは、文言を「結果を確認できませんでした」に分ける。あるいはモデルについては、次の `assistant` / `init-report` の `meter` のモデルで `currentModelId` を合わせ直す。どちらを採るかを spec で決める
- **根拠**: PO-4 (異常系の網羅)

### [Medium] quickstart V-1 の 6 は、Claude Code が報告したかどうかを UI で区別できないため測れない (M-003) (scope: feature)

- **観察**: `quickstart.md:20` は「Claude Code が `status` / `init` で新しい権限モードを報告したかを、概要のタブの『現在の権限モード』で記録する」とする。しかし、成功したときはセッションスレッドが自分で `meter` を流す (`data-model.md:61-62`)。そのため概要のタブの値は、報告があってもなくても同じになる。plan RK-04 (`plan.md:284`) はこの記録を当てにしている
- **リスク/影響**: spec Assumptions の 2 つ目 (`spec.md:207`) と RK-04 の確認が、手順の上で成り立たない
- **推奨アクション**: V-1 の 6 で見るものを変える。transcript の JSONL の `permissionMode`、または開発ビルドの `meter` の受信の記録など、報告そのものを観測する。もしくは「記録しない」と明記して、Assumption を「未確認のまま」と書く
- **根拠**: PO-2 (計測経路が実在すること)

### [Medium] (H) 権限モードとモデルの変更の失敗について、原因を追える観測点が無い (M-004) (scope: feature)

- **観察**: `data-model.md:56` は「reject の理由 (例外の文字列) は送らない・ログに出さない」とし、`control-result` は真偽だけを運ぶ (C-4)。main のログとして決まっているのは改名の `[session] rename ok/failed` だけ (`data-model.md:145`) で、権限モードとモデルの変更・拒否・期限切れには main のログの記述が無い
- **リスク/影響**: RK-02 (ターンの実行中の切り替えを SDK が拒否する) が実機で起きても、利用者の報告からは `rejected` / `timeout` / `session-ended` を区別できない。サポートや運用の視点 (PO-7) が欠けている
- **推奨アクション**: 本文を含まない固定のログ行を足す。例: `[session] live-setting <kind> <reason>`。kind と理由のキーだけを出す。値と例外の文字列は出さない
- **根拠**: reviewer-base H (observability)、PO-7

### [Medium] (H) P1 の本題であるターンの実行中の切り替え (US-1 AC3) と、`plan` で書き込みが止まること (AC2) は、実機でしか確かめない。実機は未実施でもマージできる (M-005) (scope: feature)

- **観察**: SC-001〜SC-008 はどれも、偽の `Query` か偽の capability で確かめるもの (`spec.md:215-222`)。AC2 の「次の tool の呼び出しから `plan` で扱われる」と AC3 の「中断されない」は、SC-009 の V-1 (`quickstart.md:17-19`) でしか確かめず、未実施でもマージする (`spec.md:227-228`)。Assumptions (`:206`) は、この振る舞いを SDK の挙動として前提にしている
- **リスク/影響**: US-1 の価値を支える前提が確かめられないままマージされることがある。夜間の規則に沿った判断ではあるが、roadmap に残す未確認の項目として、AC2 / AC3 を名指ししていない
- **推奨アクション**: SH-010 の roadmap の記録 (`tasks.md:99`) に、V-1 の 3 と 5 を「P1 の前提 (US-1 AC2 / AC3)」として明記して残す
- **根拠**: reviewer-base H (既存の振る舞いと前提の根拠)

### [Low] US-1 AC1 の「選択肢は安全 3 値だけ」と、data-model §8.2 の「安全 3 値の外の今の値を先頭に選べない項目で出す」が、文面として合っていない (L-001) (scope: feature)

- **観察**: `spec.md:106` と `data-model.md:194`
- **推奨アクション**: AC1 に「Claude Code が安全 3 値の外を報告したときは、今の値を選べない項目として出す」を足す

### [Low] User Story の benefit が charter の KPI とひも付いていない (L-002) (scope: feature)

- **観察**: US-1〜US-3 の Why (`spec.md:100`, `:119`, `:137`) は Journey 2 / 4 には対応しているが、charter KPI (`charter.md:190-216`) のどれにも対応していない。名前を付けると見分けやすくなる、という価値を測る経路も無い
- **推奨アクション**: 対応する KPI が無いことを spec に 1 文で明記する。KPI を足すかどうかは charter 側の棚卸しで扱う

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `押せない` (specs/023) | 15 (食い違いは 1) | `quickstart.md:39` (spec `:111`, `:145-146`, `:154`、data-model `:195`, `:197` は §5.1 と一致) |
| H-002 | `Provider が null\|既定\)` (specs/023) | 5 (spec.md / plan.md は 0) | `research.md:28`, `data-model.md:120`, `:195`, `tasks.md:64`, `:66` |

## Verdict

- Critical: 0
- High: 2
- Medium: 5
- Low: 2
