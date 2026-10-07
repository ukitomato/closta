# architecture-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-07T00:00:00+09:00 (design-gate。2026-10-07 の再開後の版)
**Reviewer**: architecture-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 2 (前回 = 2026-10-04 の R1。`design-gate.md.20261004T063000` / `architecture-reviewer.design-gate.md`)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-019 / SC-001〜SC-007 すべて (本 reviewer が主に見たもの: FR-003 / FR-004 / FR-009 / FR-010 / FR-013 / FR-014 / FR-016 / FR-018 / FR-019、SC-002 / SC-004 / SC-005 / SC-006)
- 該当する charter と Confirmation: ui charter (Scope :44-77、Out of scope :86-93、KPI :157-168、Cross-domain :170-189)、session charter (Out of scope :56-66、Cross-domain :181-192、Related Specs :206-243)、`_overview.md` (帰属 :100-105、Cross-domain invariants :140-167)、AD-047 の Decision 1〜5 と Confirmation、AD-044 Decision 1/2/3/6、AD-046 Decision 4/6 と Consequences :43、AD-043 Decision 2/4/6、AD-041 (a)(g) と Consequences、AD-036 §2/§5、AD-034 §1、AD-031 Decision 1、AD-037 D1、AD-045 Decision 2、AD-019 D1、AD-020 §3、AD-023 §7。Constitution IV / V / VIII〜XV (I / II / III / VI / VII の実装上の遵守は platform-boundary-reviewer の担当なので除外)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (`meter` の値の検証・CSP は security-reviewer)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:3 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲 (`tests/meter/` の型検査の範囲などの lint hookup も同じ)
- G. optional reviewer 範囲: 該当なし: ui-coverage / a11y / ux reviewer の担当範囲 (AD-044 の解釈は D で見た)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-7 と O-3 の後の main に載せ直した design (spec / plan / data-model / research / quickstart / tasks) を見た。AD-047 (accepted) に照らすと、次の部分は今の文書で受け入れた決定どおりになっている: 失敗の理由のキーの追加、`meter` の種類 1 つ、行の経路 (O-2 の system-event)、制御要求を呼ばないこと、昇格を観測したときに強制しないこと。前回の R1 の 14 件はすべて解消している。

新たに見つかったものは次のとおり。

- **AD-047 の Decision 2 / Decision 4 の字面が、委ねた先の data-model §2 と食い違っている。** plan はこれを自覚したうえで、ADR の側を直さないと決めている。
- **ui の feature が session のコードに入れる変更の範囲**が、U-1 の承認の字面と charter の記録の両方より広い。
- **task の進み具合を状態なしで流す設計で、間引きの鍵の寿命が決まっていない。**
- **「ターン」に 2 つの意味がある。**
- **失敗の形を観測する手段が無い。**

ARCH-6 (config / env) は該当なし (新しい env のキー・feature flag・設定ファイルは無い)。ARCH-5 は `_overview.md` の cross-domain invariants の IX / X / XII の行と照合し、違反は無かった (`meter` は port を通り main を経由しない。永続化しない。対応表は同じ PR で直す)。

## Findings

### [High] AD-047 (accepted) の Decision 2 / 4 の字面が設計と食い違っているのに、ADR の側を直さないと決めている。spec の中でも食い違いが残っている (H-101) (scope: feature)

- **観察**:
  - **Decision 4** (`docs/decisions/0047-session-meter-and-failure-reasons.md:38`) は「毎ターンの `result` の値 (`total_cost_usd` / `modelUsage` / `usage` / `contextWindow`) から … Context display (推定) を出す」と書く。Consequences (`:48`) も「Context display は result の推定で実装済み」である。
    - 設計は、主ループの assistant の `message.usage` の入力側から `context` を出す (`data-model.md:62`)。result の `usage` は「読まないフィールド」に入れている (`data-model.md:63`)。Clarifications (`spec.md:79`) と FR-009 (`spec.md:203`) も同じである。
    - FR-014 (`spec.md:216`) は、対応表の備考に「assistant の usage と result の contextWindow の推定」と書くよう求める。この備考は AD-047 の Consequences の字面と食い違うことになる。
  - **spec の中の食い違い**: `spec.md:43` (位置づけ) と `spec.md:68` (U-3) は、今も「result の `usage`」「result の推定」と書いている。
  - **Decision 2** (`AD-047:35`) は、運ぶ値を「数・真偽・列挙・モデルの id だけ」とする。ところが `data-model.md:43` の `tool-elapsed` は `toolUseId: string` を運ぶ。FR-003 (`spec.md:188`) と `plan.md:12` / `:255` も、閉じた列挙のまま書いている。
  - **plan の扱い**: `plan.md:253` は Decision 4 の食い違いを認めたうえで、`plan.md:256` で「AD-047 の本文は書き換えない」としている。tasks の SH-013 (`tasks.md:148`) も「本文は変えない」である。
  - **採択の前から設計に入っていた事実**:
    - assistant の usage への切り替えは、2026-10-04 の R1 の後に入った (`design-gate.md.20261004T063000:31` の H-05)。AD-047 の accepted は 2026-10-05 (`AD-047:24`) で、ADR はその時点で既に設計と合っていなかった。
    - `toolUseId` も、R1 の security の指摘 (同じディレクトリの security-reviewer の出力。M-002) に既に現れていた。
- **同種事象探索**:
  - result の usage を Context display の材料と書く字面: 4 件 (AD-047:38 / AD-047:48 / spec.md:43 / spec.md:68)。正しい側の字面は research.md:37,62 / spec.md:79 / data-model.md:62-63 / tasks.md:87
  - 運ぶ値の閉じた列挙「数・真偽・列挙・モデルの id」: 4 件 (AD-047:35 / spec.md:188 / plan.md:12 / plan.md:255)。`toolUseId` を運ぶ種類は data-model.md:43 の 1 つ
- **リスク/影響**:
  - accepted ADR の決定の字面と、ADR が許可リストの正本として委ねた data-model §2 が矛盾したまま実装に入る。
  - pr-gate の ADR-drift モードと ui-coverage-reviewer は、対応表の備考 (AD-047 Decision 4 を根拠に Tier A の `get_context_usage` を `表示不要` にする) を ADR と照合する。字面が食い違っている限り、毎 round 同じ指摘が出る。
  - 後から AD-047 を読む人は、Context display が result の `usage` から出ていると誤読する。result の `usage` はターン内の往復の合算なので、コンテキストの大きさにはならない (R-02)。
  - 決定の読み替えを plan.md にだけ書く形は、改定手順 1 / AD-031 の「置き場は ADR」に反する。
- **推奨アクション**:
  1. AD-047 に、日付つきの「訂正」節を AD-031 Decision 1 に従って足す。中身は次の 3 点。
     - (a) Decision 4 と Consequences の Context display の材料は、主ループの assistant の 1 回の API 呼び出しの入力側の usage と、result の `modelUsage[].contextWindow` である。result の `usage` は読まない (data-model §2)
     - (b) Decision 2 の運ぶ値には、形を検証した tool の id (`tool-elapsed` の `toolUseId`。data-model §2 :43 / :81) が含まれる
     - (c) 「決定 (制御要求を呼ばない・会話由来の文字列を運ばない) は変えない」と明記する

     どちらも採択の時点で設計に既にあった事実なので、AD-031 の「読み手が同じ決定に至るか」の基準では訂正にあたる。ただし (b) を「運ぶ値の種類を広げる決定の変更」と人間が判断するなら、(b) だけを後続 ADR に置く。
  2. `spec.md:43` / `:68` を assistant の usage の字面に、`spec.md:188` / `plan.md:12` / `:255` を「数・真偽・列挙・モデルの id・形を検証した tool の id」に直す。
  3. `plan.md:256` と `tasks.md:148` の「本文は変えない」を「訂正節を足す。決定は変えない」に改め、SH-013 の作業に入れる。
- **根拠**: AD-031 Decision 1 と訂正 2 / Constitution 改定手順 1 / AD-047 Decision 2・4 / ARCH-3
- **scope 根拠**: AD-047 は本 feature が起こした ADR で、訂正節の追加と spec / plan / tasks の修正は本 feature の文書で閉じる

### [Medium] U-1 の承認の範囲より広く session のコードに手を入れるのに、plan が全部を「U-1 で承認された例外」と書いている。ui charter と session charter の記録にも漏れがある (M-101) (scope: feature)

- **観察**:
  - `plan.md:78` は「監視ビューの行の短い理由・稼働中のストアの `meters`・**行と派生値の切り出し**に手を入れるのは U-1 で承認された例外」と書く。一方、U-1 の字面 (`spec.md:66`。2026-10-05 に承認) が対象にするのは、session の契約と「監視ビューの行の短い理由と再ログインの導線・稼働中のストアの `meters`」だけである。
  - 本 feature は、U-1 の外の session のコードにも次の手を入れる。
    - FR-018 の切り出し (`spec.md:234-237`。FE-001〜FE-003)
    - FR-019 のフォーカスの移動: `features/session/focus-handoff.ts` の新設、`LivePane` / `RunningSessionRow` の押下の処理、`data-live-pane`、見出しの `tabIndex` (`data-model.md:259-267`。FE-050)
    - session の view の新しい API `RunningSessionsView.runtimeAutoMode` (`plan.md:43` / `:213`。FE-040)
    - 起動ダイアログの `PERMISSION_MODE_LABELS` を chat の表から取る形 (`research.md:148`)
  - FR-018 / FR-019 の持ち主の根拠は、roadmap の system-scope の記録 (`roadmap.md:205-217` / `:240-248`。spec の「義務の扱い」の表) であって、U-1 ではない。
  - **session charter の記録**: SH-013 (`tasks.md:143`) が足すのは、キー・`meter`・`meters`・FR-018 だけである。先例の O-3 (ui) の項目 (session charter `:233-240`) は、`revealMessage` などストアと view に足したものを 1 つずつ挙げている。
  - **ui charter の記録**: SH-013 (`tasks.md:144`) は Related Specs と Provider の表記だけである。先例の O-3 は、例外 (U-5) を ui charter の In scope (`:54-59`) に書いている。Out of scope の「他 domain の操作 UI」(`:86-93`) は、O-4 の後に事実と合わなくなる。
- **同種事象探索**:
  - `U-1 で承認|U-1 の範囲`: 3 件 (plan.md:78 / plan.md:235 / tasks.md:143)
  - session の側に足す API `runtimeAutoMode`: 3 件 (plan.md:43 / plan.md:213 / tasks.md:105)
- **リスク/影響**:
  - domain をまたぐ変更の承認の範囲 (AGENTS.md の「domain の分割は人間が承認する」) が、実際の変更より狭く読める。
  - charter は domain の境界の正本である。そこに例外が載らないので、次の feature が「ui は session の操作 UI を触らない」と読む。
- **推奨アクション**:
  1. `plan.md:78` の根拠を 2 つに分ける。U-1 = 契約・行の短い理由と導線・`meters`。spec の「義務の扱い」(roadmap の system-scope の持ち主の記録) = FR-018 / FR-019。`runtimeAutoMode` と `PERMISSION_MODE_LABELS` の取り方も実名で挙げる。夜間の自走で足した範囲なら [ASSUMED] として利用者の確認に回す。
  2. SH-013 の session charter の項目に、FR-019 (session の部品が消える前にフォーカスを移す・印 2 つ)・`RunningSessionsView.runtimeAutoMode`・`PERMISSION_MODE_LABELS` の出所を足す。
  3. SH-013 の ui charter の In scope に、O-3 と同じ形で「O-4 の例外 (U-1。2026-10-05 承認)」の段落を足す。
- **根拠**: AGENTS.md「gate の原則」(domain の分割は人間が承認) / ui charter Out of scope / session charter の O-3 (ui) の記録の先例 / ARCH-2
- **scope 根拠**: plan / tasks と、SH-013 が触る 2 つの charter で閉じる

### [Medium] task の進み具合を状態なしで流す設計で、間引きの鍵 `task:<taskId>` の寿命が決まっていない。行の無い task の更新も鍵・流量・renderer の更新を消費する (M-102) (scope: feature)

- **観察**:
  - FR-013 (`spec.md:210`) は「task ごとの状態をセッションスレッドにも renderer にも持たない (AD-044 Decision 6)」と書く。
  - 一方で間引き (`data-model.md:107-110`) は、鍵 `task:<taskId>` ごとに保留の値を持つ。また「同時に追う鍵 (tool と task) は 64 まで。超えた新しい鍵の更新は捨てる」とする。取り消しの規則は tool の鍵 (tool の結果・result)・思考・`finish()` にしか無く、**task の鍵を忘れる規則が無い**。
  - セッションスレッドは、どの task に行があるかを知らない (R1 の H-002 の手当てで、id の集合を持たない形にした)。O-2 が行を作るのは `is_backgrounded === true` の task だけである (`src/domain/session/system-event.ts:129`)。ところが `task_progress` は前景の subagent の tool ごとにも届く (`research.md:67`)。したがって、行の無い task の更新も次を消費する。
    - 鍵の上限 64
    - セッションあたり 20 件/秒の枠 (`data-model.md:108`)
    - renderer の更新: 合成の結果が null でも `receivedMessages + 1`・`syncQueue`・`trackDerived` が走る (`running-session-store.ts:286-301`)
- **同種事象探索**: `task:<taskId>|同時に追う鍵`: 3 件 (data-model.md:107 / data-model.md:109 / tasks.md:110)。BE-041 のテスト (`tasks.md:111`) は「65 個目の鍵を捨てる」だけで、鍵を忘れる規則のテストは 0 件
- **リスク/影響**:
  - 鍵を取り消しまで持ち続ける実装を取ると、subagent を多く使う長いセッションで、異なる task の id が 64 に達した後の背景の task の進み具合 (US-4 AC5) が、セッションの終わりまで黙って止まる。
  - FR-013 の字面と data-model §2 が食い違ったまま実装に入る。
- **推奨アクション**:
  1. data-model §2 に鍵の寿命を書く。例:「保留があるか、最後の送信から 1 秒以内の鍵だけを追い、それ以外は忘れる」。こうすれば task の始まりや終わりの状態を持たずに済む。
  2. FR-013 を「task の状態 (実行中・完了など) の表を持たない。間引きの 1 秒以内の保留は除く」と言い換える。
  3. 行の無い task の更新が流れること、20 件/秒の枠を他の鍵と共有することを data-model §2 に書く (枠を分けるならその規則も書く)。
  4. BE-041 に次のテストを足す。
     - 64 個の鍵が 1 秒以上静かになった後は、新しい鍵が通る
     - 行の無い task の更新が多くても、`tool-elapsed` が届く
- **根拠**: AD-044 Decision 6 (`AD-044:84`) / AD-047 Decision 3 / spec FR-013
- **scope 根拠**: data-model §2 と tasks の BE-041 で閉じる

### [Medium] 「ターン」に 2 つの意味がある。同じ feature の UI の文言で「ターン数」がモデルとの往復の数と、アプリが受けた result の数の両方を指す (M-103) (scope: feature)

- **観察**:
  - `max-turns` の文言「ターン数の上限に達したため止まりました」(`data-model.md:204`) と短い理由「ターン上限」(`:212`) は、SDK の `error_max_turns` を受ける。この上限は `num_turns`、つまり「1 ターンの中のモデルの往復の数」(`research.md:38`) に対するものである。
  - 一方、使用量のタブの「ターン数」(`data-model.md:178` / `:225`) は、アプリが受けた result の数である (`research.md:89`)。
  - spec の中でも同じ語が混ざっている。
    - Edge Cases (`spec.md:163`) の「費用もターン数も 0」は `num_turns` の意味
    - FR-001 (`spec.md:180`) の「ターン数の上限」は往復の意味
    - US-3 / FR-008 (`spec.md:132` / `:202`) の「ターン数」はアプリの数
  - glossary は既に「ターン数」を X-6 の上限の軸 (SDK の maxTurns) の意味で使っている (`docs/glossary.md:184`)。「Turn / ターン」の項目は無い (glossary の「ターン」の出現は :184 と Message queue の :536-542 だけ)。SH-001 (`tasks.md:15`) が足す用語にも入っていない。
- **同種事象探索**: `ターン数|ターン上限` (014 の文書): 18 件。意味が衝突しているのは次の 3 組。
  - data-model.md:204,212 (往復) と :178,225 (result の数)
  - spec.md:163,180 (往復) と :32,124,132,202 (result の数)
  - glossary.md:184 (往復)
- **リスク/影響**: 利用者は、失敗の理由の「ターン数の上限」と使用量のタブの「ターン数」を同じ数だと読む。使用量のタブのターン数が上限に遠いのに「ターン数の上限で止まった」と出る。Principle XIV の、同じ語を同じ概念に使う規則に反する。
- **推奨アクション**:
  1. SH-001 に「Turn (ターン)」を足す。定義は「プロンプト 1 つから、その `result` まで」(`turn.turns` が数える単位)。Counterexamples に「SDK の `num_turns` / `maxTurns` / `error_max_turns` が数えるのはモデルとの往復 (往復の数)」と書く。
  2. `max-turns` の全文と短い理由を往復の語に改める (例:「モデルとの往復の回数の上限に達したため止まりました」/「往復上限」)。`spec.md:163` / `:180` も同じ語にそろえる。
  3. glossary :184 の X-6 の軸も、往復の語か注記で区別する。
- **根拠**: Constitution Principle XIV / ARCH-7
- **scope 根拠**: glossary (SH-001) と data-model §5 の文言の表で閉じる

### [Medium] 失敗の理由を実機の形で直す手順 (RK-06 / quickstart V-4 #1) に、形を観測する手段が無い (M-104) (scope: feature)

- **観察**:
  - RK-06 (`plan.md:277`) は「認証切れ・課金のエラーの実際の形を誰も観察していない」とし、手当てを quickstart V-4 #1 (`quickstart.md:28`) に置く。V-4 #1 は「届いた result と assistant のメッセージの形 (subtype / `api_error_status` / `error`) を記録する」ことを求める。
  - ところが設計には、その形を観測する経路が無い。
    - 失敗のイベントは理由のキーだけを運び、HTTP の状態を文言に入れない (`data-model.md:25`)
    - `errors` は運ばない (U-5)
    - agents に記録の出力は無い (`console\.|stderr|log\(` を `src/agents` の非テストで検索して 0 件)
    - Worker の標準出力は読み捨てる (`AD-043:80` の Decision 6)
    - 過去ログは範囲外 (`spec.md:277`)
  - 本番でも、知らない形が `provider-error` に落ちたとき、data-model §1 を直す材料が残らない。
- **同種事象探索**: agents の記録の出力 0 件 / V-4 で形の記録を求める手順 1 件 (quickstart.md:28)。#4 (`utilization` / `resetsAt` の単位) は Quota banner に値が出るので観測できる
- **リスク/影響**:
  - RK-06 の手当て (暫定の文言を外すかの判断・data-model §1 の修正) の前提になる観測が、手順として実行できない。
  - SC-001 の fixture は、推測の形のまま固定される。
- **推奨アクション**: 最小案は、quickstart V-4 #1 にアプリの外での取り方を書くことである。
  - 同じ認証の状態で、distro の中から `claude -p "<prompt>" --output-format stream-json --verbose` を走らせる。
  - result の `subtype` / `is_error` / `api_error_status` と、assistant の `error` の値だけを記録する。`errors` / `result` の文字列は貼らない。
  - SH-014 の「V-4 #1 の結果で data-model §1 を直すか」の判断の入力を、この記録にする。
  - アプリの中に診断の経路を足すなら、運ぶ値と出す条件の設計が要るので別に扱う。
- **根拠**: H (observability) / AD-047 Decision 1 (知らないものは `provider-error`) / plan RK-06
- **scope 根拠**: quickstart と tasks の SH-014 で閉じる

### [Low] glossary に足す「Quota banner」が、registry の element を採るかの判断 (SH-002) より前に書かれ、element と自作の部品のどちらを指すかが決まらない (L-101) (scope: feature)

- **観察**:
  - SH-001 (`tasks.md:15`) は、SH-002 (`tasks.md:16-18`) が registry の `elements-quota-banner` を採るかを決める前に、glossary に「Quota banner」を足す。
  - 採らなければ、帯は既存の `Badge` などで組んだシェルの部品になる (`research.md:109`)。
  - 先例の Thread search (`docs/glossary.md:936`) は、Counterexamples に「registry の `elements-thread-search` は使わない」と書いている。
- **同種事象探索**: element 名を表示の名前として使う新しい用語は 1 件 (Quota banner。SH-001 の一覧)。Context display / Cost meter は glossary に足さない
- **リスク/影響**: 対応表の `実装済み: <element>` の element 名と、glossary の用語が別のものを指しうる。
- **推奨アクション**: glossary の Quota banner は置き場所と役割 (中央のヘッダの下の帯) で定義する。SH-002 の結論の後に「registry の element を使う / 使わない」を Counterexamples に足す (SH-012 と同じ PR で)。
- **根拠**: Principle XIV / ARCH-7
- **scope 根拠**: glossary の 1 項目

### [Low] session の起動ダイアログの文言の表が、ui (chat) の文言の表に依存するようになる。ui charter の「依存される domain」の記録が追随しない (L-102) (scope: feature)

- **観察**:
  - R-15 (`research.md:148`) は、`features/session/labels.ts` の `PERMISSION_MODE_LABELS` を `features/chat/labels.ts` の `PERMISSION_MODE_NAMES` から取る形にする。`session/labels.ts` は今は domain だけを import している (`session/labels.ts:1-6`)。
  - ui charter (`:173`) は「依存される domain: なし (最上層)。ただし `stores/ui.ts` は他 domain の操作 UI が読む」と書く。
  - なお session から chat への import は既に 3 か所ある (`LivePane.tsx:11` / `running-session-store.ts:11` / `session-event-decoder.ts:8`)。charter の記述は O-4 の前から事実と合っていない。
- **同種事象探索**: `from '@/features/chat` (features/session、非テスト): 3 件 (上記)。O-4 で 4 件目 (labels)
- **リスク/影響**: 起動ダイアログ (X-4。session) の文言の持ち主が ui の表に移ったことが、charter から読めない。renderer の feature 間の向きは機械で強制していない (`roadmap.md:187-188` の (6))。
- **推奨アクション**: SH-013 で ui charter の Cross-domain dependencies に、session の操作 UI が `features/chat` を読むこと (convert / transcript-guard / transcript-context と、O-4 からの `PERMISSION_MODE_NAMES`) を足す。roadmap の (6) にも、O-4 で増えた 1 件を注記する。
- **根拠**: AD-023 §7 (依存の向き) / ui charter Cross-domain dependencies / ARCH-4
- **scope 根拠**: 新しい import の記録は本 feature で閉じる。前からある 3 件の記述の追随は system scope

### [Low] KPI「自作率」の計測経路の材料 (照合した候補名) が、新しい自作の部品の一部で作られない (L-103) (scope: feature)

- **観察**:
  - ui charter の KPI「自作率」(`:168`) は、PR の説明を計測経路にする。
  - 照合の作業 (R-09 `research.md:100-107` / SH-002 `tasks.md:16-18`) が対象にするのは、Cost meter / Quota banner / Context display / Context breakdown / Job progress / Thinking indicator だけである。
  - 次の新しい自作の表示は、照合する候補が書かれていない。
    - 権限モードの警告の帯 (`CenterBanners`。FE-040)
    - task の行の進み具合と tool の経過時間の印 (FE-042 / FE-043)
  - AD-019 (`:33` / `:39`) には、Agent status / Error state などの候補がある。
- **同種事象探索**: 照合の対象を列挙した表 1 件 (research R-09)。警告の帯の候補 0 件
- **リスク/影響**: Principle XIII の Exceptions (照合した候補名と不適合の理由) の記録が PR に揃わず、KPI が 100% にならない。
- **推奨アクション**: SH-002 に、警告の帯と進み具合の印の候補 (Error state・Agent status など) の照合を足す。結果を PR の説明と F 節の備考に書く。
- **根拠**: ui charter KPI「自作率」/ Constitution XIII Exceptions / ARCH-2
- **scope 根拠**: SH-002 の作業の範囲

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `` `result`[^\n]{0,60}`usage`\|result の推定\|result の値で足りる\|result の `usage` `` (014 の文書 + AD-047) | 4 (古い字面) | AD-047:38 / AD-047:48 / spec.md:43 / spec.md:68 (正しい字面: research.md:37,62 / spec.md:79 / data-model.md:62-63 / tasks.md:87。自覚を示す字面: research.md:63 / plan.md:253) |
| H-101 | `モデルの id` (閉じた列挙) | 4 | AD-047:35 / spec.md:188 / plan.md:12 / plan.md:255 (`toolUseId` は data-model.md:43) |
| M-101 | `U-1 で承認\|U-1 の範囲` | 3 | plan.md:78 / plan.md:235 / tasks.md:143 |
| M-101 | `runtimeAutoMode` | 3 | plan.md:43 / plan.md:213 / tasks.md:105 |
| M-102 | `task:<taskId>\|同時に追う鍵` | 3 | data-model.md:107 / data-model.md:109 / tasks.md:110 |
| M-103 | `ターン数\|ターン上限` (014 の文書) | 18 | 衝突: data-model.md:178,204,212,225 / spec.md:32,124,132,163,180,202 / glossary.md:184 |
| M-104 | `console\.\|stderr\|log\(` (src/agents の非テスト) | 0 | — (V-4 の手順は quickstart.md:28) |
| L-101 | glossary に足す element 名 | 1 | tasks.md:15 (先例 glossary.md:936) |
| L-102 | `from '@/features/chat` (features/session の非テスト) | 3 | LivePane.tsx:11 / running-session-store.ts:11 / session-event-decoder.ts:8 (+ research.md:148 で 1 件増える) |
| L-103 | 照合の対象の表 | 1 | research.md:100-107 |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 3
- Round inheritance: R1 からの解消 14 (H-001 / H-002 / M-001〜M-008 / L-001〜L-004) / 未解消 0 / 新規 8 (H-101 / M-101〜M-104 / L-101〜L-103)。M-101 は R1 の M-001 の解消の後、2026-10-07 の再開で範囲が広がった分。M-102 は R1 の H-002 の手当て (状態を持たない形) から生じた別の論点
