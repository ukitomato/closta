# architecture-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md

## 初回読了 viewpoint

- 影響を受ける FR/SC:
  - FR-001 / FR-002 / FR-003: supervisor の形と本文経路。AD-023 §6、AD-034 §1、AD-036 §1-§3、Principle VII / IX に関わる
  - FR-004: 状態の要約とバッチ化。AD-031 Decision 2 と Principle IX Exceptions に関わる
  - FR-005 / FR-006: 上限 10 と X-4 経路の再利用。AD-041 に関わる
  - FR-007: 制御の宛先と requestId。AD-034 §1 / AD-036 §2 に関わる
  - FR-008〜FR-011: renderer の保持と一覧。X-1 FR-017 の継承と ui domain の境界に関わる
  - FR-012〜FR-014: 失敗の閉じ込めと寿命。AD-036 §3 の kill 所有、AD-018 に関わる
  - FR-015 / FR-016: AD-043 と glossary。AD-031 と Principle XIV に関わる
  - SC-001〜SC-010: 全件。特に SC-002 (構造検査)、SC-003 (E2E)、SC-004 (要約)、SC-005 (宛先)、SC-008 (孤児)、SC-009 (単独起動)
- touched files に該当する charter / Confirmation:
  - session charter: Scope「セッション supervisor (utilityProcess 分離、semaphore 制御、IPC バッチ化)」、業務ルール「stream の逐次パースは supervisor」、KPI「並列時の滑らかさ」、Journey 3、Key concepts の supervisor
  - _overview.md の Cross-domain invariants VII / IX
  - AD-023 §1 (レイヤ表のプロセスと寿命) / §5 (Service に規則を書かない) / §6 (per-session) / §7
  - AD-034 §1 (main は本文を JSON.parse も deserialize もしない) / §5 (構造検査で担保し、自動証明が未構築であることを隠さない)
  - AD-036 §1 / §2 / §3 (kill ハンドルは agents が持つ) / Confirmation (check:constitution 3/7/14/15)
  - AD-030 §5 (経路選択は transport 1 モジュールに閉じる)
  - AD-031 (訂正節に決定の変更を書かない)
  - Constitution Principle VII / IX / XIV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲 (requestId の乱数化と pid kill の安全性は A/B 側で見る)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:2 Medium:5 Low:3
- D. Constitution / ADR drift: Critical:0 High:4 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲 (コメントの古い記述は C の不変条件の記述ずれとして L-001 で扱う)
- G. optional reviewer 範囲: 該当なし: 永続化スキーマの変更なし。UI の element 選定は ui / ux 側
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:2 Low:0

## スコープ要約

X-1 / X-4 では、main がセッションごとに agents の `utilityProcess` を fork していた。本 feature はこれを次の形に作り替える。

- supervisor は単一の `utilityProcess` とし、その中に調停役スレッドとセッションごとの `worker_threads` を置く
- 単一セッション不変 (`session-active`) を外し、上限 10 の semaphore (`session-limit`) にする
- 状態の要約だけを supervisor→main→renderer でバッチ化する
- renderer はセッション単位のストアと一覧 UI を持つ
- AD-043 を起票して AD-023 §6 / AD-036 §1 を読み替える計画である

利用者が決めた 5 点 (単一 supervisor + worker_threads / 上限 10 固定・超過は拒否 / 要約のみ main 経由 / 全本文を renderer で保持 / 同一フォルダは警告して許可) は前提として扱った。指摘はその範囲内に限る。

AD-043 はまだ存在しない (`docs/decisions/0043*` は 0 件、`docs/` 内の `AD-043` 参照も 0 件)。そのため、ADR の内容は plan.md の「ADR」節 (plan.md:192-204) を草稿として照合した。contracts/ と data-model.md もこの feature には無い。

## Findings

### [High] AD-043 の読み替え対象が足りない。AD-023 §1 の寿命と AD-036 §3 の kill 所有を、名指しせずに変える設計になっている (H-001) (scope: feature)

- **観察**:
  - spec.md:199-203 (FR-015) と plan.md:197 (Decision 1) が挙げる読み替え対象は、AD-023 §6 と AD-036 §1 の 2 つだけである。
  - plan.md:202 (Decision 6)「最初の起動要求で遅延起動し、アプリ終了まで常駐する」は、次の 2 箇所と正面から食い違う。どちらも accepted ADR の Decision 本文である。
    - `docs/decisions/0023-application-architecture.md:195`: レイヤ表の agents 行が「寿命: セッション開始〜終了」
    - 同 `:201`:「`agents` だけが別プロセスで、しかもセッションと寿命を共にする」
  - plan.md:159 (`reap.ts`) と plan.md:201 (Decision 5) は、main/infra が pid で `wsl.exe` を `process.kill` する経路を足す。これは次の決定を変える。
    - `0036-single-session-launch-process-and-live-stream.md:96-101`:「kill ハンドルは agents が保持する。app が持てるのは agents utilityProcess のハンドル」「強制終了は renderer→main→agents の制御 IPC で発行し、agents が kill する」
    - 同 Consequences `:198`:「kill ハンドルの所有者が agents に一意化」
- **同種事象探索**:
  - `Grep "寿命|セッションと寿命" docs/decisions/0023-*.md` で 2 件 (`0023:195`, `0023:201`)
  - `Grep "kill ハンドル" docs/decisions/0036-*.md` で 2 件 (`0036:96`, `0036:198`)
  - `Grep "AD-043|0043" docs/` で 0 件 (ADR は未起票)
- **リスク/影響**:
  - 中身は AD-043 の Decision 5 / 6 が決めている。ただし読み替え対象として名指ししていない。このため後から読む人と reviewer は、AD-023 §1 と AD-036 §3 を有効な決定として読み、実装を ADR drift と判定する。
  - X-1 の pr-gate がまさにこの読み違いを起こした。008 の申し送り #15 でも、AD-041 の読み替えが同じ型の問題を後追いで解いている。
- **推奨アクション**:
  - AD-043 Decision 1 と spec FR-015 の読み替え一覧に、次を足す。
    - (a) AD-023 §1 のレイヤ表 agents 行 (寿命) と「セッションと寿命を共にする」の文
    - (b) AD-036 §3 の「kill ハンドルは agents が保持する」と Consequences の「一意化」。主たる kill 経路は agents のまま残し、main の pid 回収は supervisor 異常終了時の補助経路として限定する旨を書く
  - あわせて Constitution Principle IX の Good example「supervisor がパース済みの構造体を MessagePort で直送する」が、文字列中継 (plan.md:151) で事実上変わる点も、AD-043 か Constitution の PATCH で扱う (H-003 と同じ件)。
- **根拠**: AD-031 (決定の変更は後続 ADR に置く) / AD-036 §8 が確立した調停形式 / AD-023 §1・AD-036 §3
- **scope 根拠**: spec FR-015 と plan の ADR 節 (本 feature の touched files) で直せる

### [High] AD-043 を「design-gate 通過で accepted」にすると、SH-000 と R-01 による書き直しの前提と両立しない (H-002) (scope: feature)

- **観察**:
  - plan.md:194 は AD-043 を「status: proposed → design-gate 通過で accepted」としている。
  - 一方、plan.md:220 (R-01) は「Worker で query() が動かなければ『supervisor + セッションごとの子プロセス』に切り替える。AD-043 は起票前なので書き直せる」とする。
  - tasks.md:11 (SH-000) は「AD-043 Decision 2 の形 (中継 / 直送) を確定する」とし、tasks.md:16 は「(1) が成立しなければ以降に進まない」とする。tasks.md:125 では SH-000 は実装フェーズの最初の task であり、design-gate より後に走る。
- **同種事象探索**: `Grep "起票前|design-gate 通過で accepted|SH-000" specs/009-*/` で 3 箇所 (`plan.md:194`, `plan.md:220`, `tasks.md:11`)
- **リスク/影響**:
  - design-gate の通過で accepted にした後に SH-000(1) が失敗すると、Decision 1 (worker_threads) を差し替える必要が出る。accepted ADR の決定を変えることになるので、AD-031 の下では in-place の書き直しができない。
  - 「起票前なので書き直せる」という前提がここで崩れる。
  - Decision 2 の分岐 (中継か直送か) は、AD-034 §4 に「決定 (実装) の in-place 追記」という先例があるので許容範囲である。しかし Decision 1 の差し替えは訂正ではなく決定の変更にあたる。
- **推奨アクション**: 次のいずれかを plan と tasks に明記する。
  - (a) AD-043 は SH-000(1)(2)(4) の実測結果が出るまで proposed に留め、accepted への昇格を SH-000 の後に置く
  - (b) R-01 が発火した場合は AD-043 を書き直さず、AD-044 で supersede すると書き換える
  - 利用者の memory「Investigation is not implementation」に照らすなら (a) が自然である。その場合は SH-000 を design-gate の再開条件として扱う。
- **根拠**: AD-031 / Constitution 改定手順 1
- **scope 根拠**: plan.md / tasks.md の記述で直せる

### [High] SC-002 と SH-010 の「調停役スレッドに JSON.parse が 0 件」は、line プロトコルでは満たせないか、満たしても意味を持たない。check.mjs に Principle IX の検査項目はそもそも無い (H-003) (scope: feature)

- **観察**:
  - plan.md:213 と tasks.md:109 は「`check.mjs` の Principle IX の検査に、`supervisor.ts` / `supervisor-core.ts` で `JSON.parse` が 0 件であることを加える」としている。
  - しかし `Grep "JSON\.parse|'IX'" scripts/constitution/check.mjs` は 0 件である。Principle IX の検査項目は存在しない。
  - さらに plan.md:141 では、調停役スレッドは `transport` (文字列 1 行単位。`src/agents/transport.ts:25-32`) で launch / control を受ける。行のデコードには `JSON.parse` が要る。既存の line プロトコルでも、デコードは `src/agents/protocol.ts:193` / `:256` で `JSON.parse` している。
  - 帰結は 2 通りある。
    - (i) 調停役が制御行をパースできず、検査が実装不能になる
    - (ii) パースを `protocol.ts` 側へ追い出せば検査は 0 件を返す。ところがこれは AD-031 が名指しした盲点「コードの置き場を見るだけで、どのプロセスで評価されるかを見ていない」をそのまま再生産する
  - main 側も、Electron 経路では `status-batch` / `spawned` の行を受けて `JSON.parse` する。plan はこれを Principle IX の Exceptions、つまり AD-031 Decision 2 の「本文を運ばないメタデータ」に当てはまるとは述べていない。行長の上限も定めていない。
- **同種事象探索**:
  - `Grep "JSON\.parse" src/agents/protocol.ts` で 2 件 (`protocol.ts:193`, `:256`)
  - `Grep "JSON\.parse|'IX'" scripts/constitution/check.mjs` で 0 件
- **リスク/影響**:
  - SC-002 の計測経路が機能しない。Principle IX について「機械検証あり」と誤って読める形が増える。
  - AD-034 §5 は「自動証明の未構築を隠さない」と定めている。これに反する方向である。
- **推奨アクション**:
  - 検査の対象を「本文 (`kind: 'event'` の payload) を `JSON.parse` / decode しない」に絞る。制御行のデコードは許可されるものとして明記する。
  - 検査は新しい項目番号で check.mjs に足し、`tests/rule-fixtures/expected.mjs` に発火確認を追加する。
  - Constitution Principle IX の Verification の「現状の制約」を PATCH し、worker→調停役→port という経路と、検査が置き場しか見ないという限界を書く task を SH-090 に足す (AD-034 / v1.2.6 の先例と同じ形)。
  - main が要約の行をパースすることについては、AD-031 Decision 2 の適用であると plan に書く。あわせてパース前の行長上限を `session-status-relay` / spawner の受信側に定める。
- **根拠**: Constitution Principle IX (Verification と現状の制約) / AD-031 / AD-034 §5 / AD-024 #6
- **scope 根拠**: plan の機械強制表と tasks SH-010 / SH-090 で直せる

### [High] FR-002「調停役は本文を deserialize しない」は、plan の既定の形 (worker→調停役の文字列中継) と食い違う (H-004) (scope: feature)

- **観察**:
  - spec.md:151 (FR-002) は、調停役スレッドが「本文をパースも deserialize もせず、不透明な値として中継する」と定める。
  - plan.md:151 では、worker が `parentPort.postMessage({ kind: 'event', payload: JSON.stringify(event) })` で調停役へ送る。plan.md:34 は、port を Worker に渡せない場合 (「渡せないと見込む」) に調停役が中継すると想定している。
  - postMessage を受け取ると、受け手のスレッドで structured clone deserialize が起きる。AD-034 §1 (`0034:36-38`) は、この受信そのものを「structured clone deserialize で main を固める」と呼んでいる。
  - SC-002 (spec.md:237) が調停役について数えるのは「パース 0 件」だけである。FR-002 の「deserialize しない」とは計測の範囲が揃っていない。
- **同種事象探索**: `Grep "deserialize" specs/009-*/spec.md` で 3 件 (`spec.md:151`, `spec.md:237`, `spec.md:90`)
- **リスク/影響**:
  - 見込みどおりの中継の形になると、FR-002 を文面どおりには満たせない。
  - pr-gate で「FR-002 違反」と「SC-002 は緑」が同時に成り立つ。gate の判定が割れる。
- **推奨アクション**: FR-002 を「調停役は本文を JSON として解釈しない (文字列の受信と転送のみ)」に改め、文字列の複製コストを許容する根拠を書く。根拠は 1 メッセージの大きさが `BODY_MAX_BYTES` (`src/domain/session/sanitize-body.ts:12`) で有界であることと、R-02 である。SC-002 も同じ語で揃える。
- **根拠**: AD-034 §1 の語彙 / spec FR-002 と SC-002 の整合
- **scope 根拠**: spec.md の文言修正で直せる

### [High] 本文を port に流すか transport の行に埋めるかの判定基準が無い。port の無い launch が来ると、本文が main を通る経路が開く (H-005) (scope: feature)

- **観察**:
  - plan.md:143 は「worker からの本文はそのセッションの port へ。stdio 経路では `{"kind":"event",...,"payload"}` の 1 行として書く」とだけ書いている。
  - plan.md:141 では、`transport.onMessage(line, ports)` の `ports` は parentPort 経路でも 0 本になりうる。
  - 判定が「transport の種類」によるのか「port の有無」によるのかが書かれていない。「port が無ければ行で書く」と実装されると、Electron 下 (parentPort 経路) で port の欠けた launch が来たときに、本文が `transport.write` を通って main へ流れる。main はそこで本文を deserialize し、さらに JSON.parse する。
  - 既存の `src/agents/sdk-agent-session.ts:503-506` は、port の無い launch を `exitCode = 1` で拒否している。この防御を引き継ぐことが plan に書かれていない。
- **同種事象探索**: `Grep "ports\[0\]|port === null" src/agents/sdk-agent-session.ts` で 2 件 (`:503`, `:504`)
- **リスク/影響**: FR-003、AD-034 §1、AD-036 §2 (main は本文のデータ経路に乗らない) が、実装しだいで構造的に破れる。AD-030 §5 の「本体は経路を知らない」とも緊張関係にある。
- **推奨アクション**: plan の agents 節に次の 3 点を明記し、BE-005 / BE-013 のテストに負例を 1 件足す。
  - (a) 本文の行埋めは stdio 経路でだけ行う
  - (b) parentPort 経路で port の無い launch は拒否し、worker を起こさない
  - (c) この判定は transport が公開する経路種別で行い、port の有無からは推測しない
- **根拠**: AD-034 §1 / AD-036 §2 / AD-030 §5 / spec FR-003
- **scope 根拠**: plan agents 節と tasks BE-005 / BE-013 で直せる

### [High] X-1 の「unmount で kill する」不変条件 (孤児防止) の移し先が無い。FR-008 (表示していないセッションも動き続ける) と衝突する (H-006) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/useLiveSession.ts:187-196` は、SessionScreen の unmount 時に稼働中のセッションを `killSession` する (X-1 pr-gate C-001 / FR-017。「これが無いと supervisor が孤児化」)。`reset` (`:288-293`) も kill する。
  - plan.md:185 は `useLiveSession(sessionId)` に変えて store から読むとだけ書く。plan.md:181-182 は port listener を store に移すと書く。どちらも、この unmount→kill を外すのか、どこへ移すのかに触れていない。
  - spec FR-008 / US-2 AC2 は、表示を切り替えても裏で動き続けることを求める。
  - SessionScreen 自体の unmount (ui store による画面遷移。`src/renderer/src/stores/ui.ts:34`) のときに全セッションを止めるのか残すのかも、spec と plan のどちらにも書かれていない。
- **同種事象探索**: `Grep "killSession" src/renderer/src/features/session/useLiveSession.ts` で 3 件 (`:192`, `:271`, `:293`)
- **リスク/影響**: どちらに転んでも不具合になる。
  - unmount→kill を残すと、切り替えや画面遷移で裏のセッションが止まる (US-2 が破綻する)
  - 黙って外すと、X-1 で塞いだ孤児と再起動不能の経路が再び開く
- **推奨アクション**:
  - spec の Edge Cases に「SessionScreen から離れたときのセッションの扱い」を足す。
  - plan の renderer 節に、unmount→kill を撤去し、寿命は store と main の `dispose` に一本化すると明記する。
  - FE-013 に「切り替えと画面遷移では kill が呼ばれない」「閉じると kill される」の回帰テストを足す。
- **根拠**: X-1 FR-017 / pr-gate C-001 の継承 / spec FR-008・FR-011
- **scope 根拠**: spec と plan の renderer 節、FE-002 / FE-013 で直せる

### [High] E2E の stub が main 内で単一セッション不変を複製している。SC-001 / SC-003 / SC-006 の E2E は supervisor にも上限にも届かない (H-007) (scope: feature)

- **観察**:
  - `src/main/app/e2e-capability.ts:240-306` は、E2E 用に launch service ごと置き換えている。合成ストリームを main で作り、`active.size > 0` で `session-active` を返す (`:302-303`、「real の launch-service と同型」)。
  - plan.md:190 は「`e2e/` に stub supervisor (fake `query()`) を使った」と書く。しかし既存の E2E 経路は supervisor を経由しない。stub supervisor を差し込む task も無い。
  - BE-008 (tasks.md:45) は e2e-capability に label / onSessionStatus を足すとしか書いていない。SH-011 (tasks.md:110) の書き換え対象にも `e2e-capability.ts` の `session-active` は含まれない。
- **同種事象探索**: `Grep "session-active" src/` で 9 件 (`e2e-capability.ts:303`, `agent-session.ts:69`, `session-launch-service.ts:91`, `session-launch-service.test.ts:74,79`, `labels.test.ts:43,44`, `labels.ts:11,31`, `useLiveSession.ts:27`)。SH-011 / BE-001 / FE-004 の対象に入っていないのは `e2e-capability.ts:303` である
- **リスク/影響**:
  - SH-020 の「11 本目の拒否」E2E は、本物の semaphore ではなく stub の複製ロジックを検証することになる。
  - FE-020 の負荷 (SC-003) は worker / 調停役 / 要約バッチを通らない。charter KPI「並列時の滑らかさ」の計測経路が設計の実体に届かない。
  - 上限の規則が 2 箇所に分かれ、片方だけが更新されて drift する。
- **推奨アクション**:
  - e2e-capability の上限判定を、本物の `session-launch-service` を fake の spawner で包む形にする。少なくとも domain の `canReserve` を共有し、規則の正本を 1 つにする。
  - SC-003 の E2E が通る経路 (main の stub か、stub supervisor か) を plan に明記し、経路を作る task を足す。
  - 届かない部分 (worker の分離など) は「quickstart が唯一の実測根拠」と SC-003 に正直に書く。
- **根拠**: Principle XI / SC-001・SC-003 の計測経路 / 規則の正本は 1 箇所 (AGENTS memory)
- **scope 根拠**: tasks BE-008 / SH-011 / SH-020 / FE-020 で直せる

### [Medium] 要約のフィールドが spec (3 つ) と plan (4 つ) で食い違う (M-001) (scope: feature)

- **観察**:
  - spec.md:157 (FR-004) と spec.md:215 (Key Entities) は、要約を「sessionId・run-state・失敗の理由キーだけ」と定める。
  - plan.md:129 の型は `claudeAlive: boolean` を加えた 4 フィールドである。plan.md:12 も同じ形をとる。
- **同種事象探索**: `Grep "claudeAlive" specs/009-*/spec.md` で 0 件。plan.md では 10 件以上
- **リスク/影響**: SC-004 の「要約 DTO の全フィールド走査」テストを spec と plan のどちらに合わせて書くかが決まらない。`claudeAlive` は上限の判定 (FR-005) に必須なので、spec 側の「だけ」が誤りである。
- **推奨アクション**: FR-004 と Key Entities に `claudeAlive` (会話由来ではない真偽値) を足す。
- **根拠**: spec と plan の整合 / FR-005
- **scope 根拠**: spec.md の修正で直せる

### [Medium] 「終端」の定義が FR-004、plan の畳み込み、domain の TERMINAL_STATES で 3 通りある (M-002) (scope: feature)

- **観察**:
  - spec.md:159 は「終端状態 (`error` / `done`) と理由キーは畳んでも失われない」とする。
  - plan.md:131 の `coalesceSummaries` が上書きから守るのは `error` と `claudeAlive: false` だけである。
  - `src/domain/session/run-state.ts:23` の `TERMINAL_STATES` は `['error','done']` である。ところが同 `:106-108` では `done → running` の遷移があり、X-1 の時点で既に矛盾を含んでいる。
  - spec 自身も FR-005 (spec.md:164) では `done` を「次のプロンプト待ち」と説明している。
- **同種事象探索**: `Grep "TERMINAL_STATES|isTerminal" src/domain/session/run-state.ts` で 3 件 (`:23`, `:61`, `:71-72`)
- **リスク/影響**: SC-004 の「最終状態が一致する」の判定基準が決まらない。`done` を終端として固定すると、次のターンの `running` が一覧で消える。
- **推奨アクション**:
  - spec FR-004 の終端を「`error` と `claudeAlive: false`」に改める。
  - glossary の SessionRunState に、`done` は終端ではない (応答完了) と書く。
  - `TERMINAL_STATES` の扱いを plan の domain 節で決める。変えないなら、要約の畳み込みは `isTerminal` を使わないと明記する。
- **根拠**: 業務不変条件の一意性 / Principle XIV
- **scope 根拠**: spec と plan と glossary (SH-002) で直せる

### [Medium] `launching` を上限に数える規則 (FR-005) が、plan の `claudeAlive` の初期値に依存したまま書かれていない (M-003) (scope: feature)

- **観察**:
  - spec.md:164 は「`launching` から…を数える」と定める。
  - plan.md:170 は「成功なら registry に入れて `reserved -= 1`」とする。plan.md:126-127 は、生存数を `claudeAlive` フラグで数える。
  - registry に入れた時点の `claudeAlive` の初期値が書かれていない。worker が `wsl.exe` を spawn する前は、子プロセスはまだ存在しない。
- **同種事象探索**: `Grep "reserved -= 1|claudeAlive" specs/009-*/plan.md` で、初期値の記述は 0 件
- **リスク/影響**: 初期値が `false` で実装されると、`launching` の間は枠が空く。その間に起動要求が連続すると 10 本を超え、SC-001 に反する。
- **推奨アクション**:
  - plan の main/app 節に「registry に入れるときは `claudeAlive: true` (予約から生存へ移すだけ) とし、`false` に倒すのは要約・worker の異常終了・supervisor の異常終了だけ」と明記する。
  - BE-007 の単体テストに、`launching` 中の 11 本目の拒否を足す。
- **根拠**: spec FR-005 / SC-001
- **scope 根拠**: plan と BE-007 で直せる

### [Medium] supervisor 異常終了時の合成規則と pid 回収を Service に直接書く設計になっている (AD-023 §5) (M-004) (scope: feature)

- **観察**:
  - plan.md:172 では、`session-launch-service` が「生存中の全セッションに `supervisor-exited` を合成し、`reapProcesses` を呼ぶ」。
  - AD-023 §5 (`0023:307-309`) は「Service にビジネス規則を書かない。インタフェースを注入され、domain の純粋関数を呼ぶだけ」と定める。
  - `.dependency-cruiser.js:251-263` の `services-not-to-io` は core モジュールしか見ない。そのため Service が infra の `reap.ts` を直接 import しても検出されない。
- **同種事象探索**: `Grep "services-not-to-io" .dependency-cruiser.js` で 1 件 (`:223`)。`session-launch-service` は `from` に含まれている (`:253`)
- **リスク/影響**: Service が肥大化する。合成規則が worker 側 (`supervisor-core`) と main 側の 2 箇所に分かれて drift する。
- **推奨アクション**:
  - 合成規則は `domain/session/status-summary.ts` に純粋関数 (例: `synthesizeExit(sessionIds, reasonKey)`) として置き、supervisor-core と Service の両方から呼ぶ。
  - `reapProcesses` は `SessionLaunchServiceDeps` に注入し、composition-root で結線すると plan に明記する。
- **根拠**: AD-023 §5 / §7
- **scope 根拠**: plan の domain 節と main/app 節で直せる

### [Medium] 「要約」「一覧」が既存の canonical な語 (SessionSummary / セッション一覧) と衝突する (M-005) (scope: feature)

- **観察**:
  - `docs/glossary.md:574-585` には既に **SessionSummary (セッション要約行)** がある。R-2 の列挙一覧の 1 行を指す語である。
  - spec.md:215 は「状態の要約 (SessionStatusSummary)」を新設し、plan.md:181 は renderer の store フィールドを `summaries` と名付けている。
  - charter Journey 1 (`charter.md:68`) の「セッション一覧」は列挙の画面である。一方 spec の FR-009 は「稼働中セッションの一覧」を指す。
  - SH-002 (tasks.md:21) が手当てする衝突は「上限」の語だけである。
- **同種事象探索**: `Grep "SessionSummary|要約行" docs/glossary.md` で 1 件 (`:574`)
- **リスク/影響**: Principle XIV の同義異語にあたる。store の `summaries` と R-2 の `SessionSummary` がコード上で取り違えられる。
- **推奨アクション**:
  - SH-002 に「SessionStatusSummary と SessionSummary の区別」と「稼働中セッション一覧と (列挙の) セッション一覧の区別」を Counterexamples として足す。
  - store のフィールド名は `statuses` など、衝突しない名前にする。
- **根拠**: Principle XIV
- **scope 根拠**: SH-002 と plan renderer 節で直せる

### [Medium] 一覧の element 選定を plan が行っており、spec FR-009 と charter の Out of scope (ui domain の領分) と食い違う (M-006) (scope: feature)

- **観察**:
  - plan.md:50 (XIII 行) は「assistant-ui の ThreadList 系 primitive を候補とし」と書き、element を選んでいる。
  - これは次の 3 箇所が「element 選定は ui の領分」としていることと食い違う。
    - spec.md:185 (FR-009)「見た目と UI element の選定は `ui` domain の領分」
    - spec.md:230 (Assumptions)
    - `charter.md:50` (Out of scope「監視ビューの見た目と element 選定 → ui」)
- **同種事象探索**: `Grep "ThreadList" specs/009-*/` で 1 件 (`plan.md:50`)
- **リスク/影響**: domain の境界があいまいになる。ThreadList は assistant-ui の thread runtime (AD-023 の `useExternalStoreRuntime`) と結びつくので、選んだ時点で ui 側の設計判断を先取りする。
- **推奨アクション**: plan で「暫定の element。最終の選定は ui domain (AD-019 の在庫照合) が持つ」と明記する。XIII の Exceptions の書式 (候補名と不適合理由) を FE-011 の完了条件に入れる。
- **根拠**: session charter の Out of scope / Principle XIII
- **scope 根拠**: plan の記述で直せる

### [Medium] (H) before-quit の登録場所の事実誤認と、dispose の非同期化が波及するファイルの漏れ (M-007) (scope: feature)

- **観察**:
  - plan.md:177 と tasks.md:96 (BE-021) は「`composition-root.ts` の `before-quit` を `preventDefault` にする」としている。しかし `before-quit` が登録されているのは `src/main/index.ts:69` (E2E の stub) と `:118` (本番) である。
  - `composition-root.ts:383` の `dispose` は、3 つの同期関数の和 (`enumerator.dispose() + transcripts.dispose() + launchService.dispose()`) を返す。
  - `e2e-capability.ts:124` / `:328` も `dispose(): number` である。
- **同種事象探索**: `Grep "before-quit|dispose\(" src/main` で、本件に関わるのは `index.ts:69,118,127`、`composition-root.ts:383`、`e2e-capability.ts:124,328`、`session-launch-service.ts:75,118` である
- **リスク/影響**:
  - `dispose` の型が `Promise<number>` に変わると、合算する式と E2E の stub が壊れる。
  - `preventDefault` → `app.quit()` で `before-quit` がもう一度発火するので、再入を防ぐ guard が無いとループするか二重に dispose する。
  - FR-014 / SC-008 の順序の assert が、実際に変わる場所 (index.ts) を外して書かれる。
- **推奨アクション**:
  - BE-021 の対象に `src/main/index.ts` / `composition-root.ts:383` / `e2e-capability.ts` を明記する。
  - 再入 guard と、enumerator / transcripts の同期 dispose との順序を plan に書く。
- **根拠**: X-1 FR-017 の regression / AD-030 Consequences (before-quit で終了させる)
- **scope 根拠**: tasks BE-021 で直せる

### [Medium] (H) BE-010 の「main の IPC ハンドラで、別セッションの requestId が効かない」というテストは、本文経路を main に通さない設計では main で判定できない (M-008) (scope: feature)

- **観察**:
  - tasks.md:69 (BE-010) と spec.md:242 (SC-005) は、別セッションの requestId の拒否を「preload をスタブせず main の IPC ハンドラを直接呼ぶ単体」で確かめるとしている。
  - しかし `permission-request` は本文の port で worker→renderer に直接届く (FR-003)。main は requestId を知らない。
  - plan.md:154 も、判定場所を worker の pending (「pending に無ければ何もしない」) としている。
- **同種事象探索**: `Grep "requestId" specs/009-*/tasks.md` で 2 件 (`tasks.md:39`, `tasks.md:69`)
- **リスク/影響**: テストを文面どおり main で成り立たせようとすると、main に requestId の台帳を持たせることになる。そのためには permission-request を main 経由で流す必要があり、AD-034 §1 / AD-036 §2 を破る方向に誘導される。
- **推奨アクション**: SC-005 / BE-010 の requestId に関する負例は、supervisor と worker の宛先解決の単体 (BE-023 側) へ移す。main の単体に残すのは sessionId の負例だけにする。
- **根拠**: AD-034 §1 / AD-036 §2
- **scope 根拠**: spec SC-005 の計測経路と tasks BE-010 で直せる

### [Low] 単一セッション不変を前提にしたコメントと契約文書が 15 ファイルにあるが、SH-091 は 3 ファイルしか挙げていない (L-001) (scope: feature)

- **観察**: SH-091 (tasks.md:115) の対象は `session-spawner.ts` / `session-launch-service.ts` / `useLiveSession.ts` だけである。実際には次の箇所にも単一セッション不変や per-session の記述が残る。
  - `src/domain/capability.ts:110,117`: preload の契約文書で「単一セッション不変を検証」
  - `src/domain/session/launch-gate.ts:14`
  - `src/domain/session/run-state.ts:2,5,18-21,56`: `isActive` の存在理由
  - `src/main/app/session-ipc.ts:51,133`
  - `src/main/app/composition-root.ts:216-219,259-262`
  - `src/main/app/e2e-capability.ts:240,302`
  - `src/agents/sdk-agent-session.ts:40,403`
  - `src/renderer/src/features/session/SessionScreen.tsx:34,233`
  - `src/renderer/src/stores/ui.ts:34`
- **同種事象探索**: `Grep "単一セッション|per-session" src/` で 15 ファイル
- **リスク/影響**: 契約文書 (`capability.ts`) に古い不変条件が残る。`isActive` が使われないまま残る。
- **推奨アクション**: SH-091 の対象を上の列挙で置き換える。`isActive` は削除するか、用途を改めて名前を付け直すかを BE-001 で決める。
- **根拠**: Principle XIV / 規則の正本は 1 箇所
- **scope 根拠**: tasks SH-091 で直せる

### [Low] charter の追随範囲が足りない (L-002) (scope: feature)

- **観察**: SH-090 (tasks.md:112) は Related Specs / Related ADRs と末尾の 1 行を更新するとしている。次が含まれていない。
  - charter の frontmatter (`charter.md:7-17` の `related_adrs` / `related_specs`)
  - Key concepts の supervisor の定義 (`charter.md:103`。glossary と同じ更新が要る)
  - 本 feature が依拠する AD-023 / AD-034 は、charter の Related ADRs に載っていない
- **同種事象探索**: `Grep "related_adrs|supervisor" docs/domains/session/charter.md` で 3 件 (`:7`, `:61`, `:103`)
- **推奨アクション**: SH-090 に frontmatter と Key concepts を足す。
- **根拠**: charter の SSoT 同期
- **scope 根拠**: SH-090 で直せる

### [Low] supervisor 異常終了時の合成要約は窓の外で送られる。SC-004「窓 1 つあたり 1 回以下」の例外が書かれていない (L-003) (scope: feature)

- **観察**: plan.md:175 は「合成した要約 (supervisor-exited) も同じ経路で送る」としている。一方「main は再バッチしない」とも書いている。このため異常終了の瞬間に、supervisor の窓とは別の送信が 1 回起きうる。
- **同種事象探索**: `Grep "再バッチしない|合成した要約" specs/009-*/plan.md` で 1 件 (`plan.md:175`)
- **推奨アクション**: SC-004 に「supervisor の異常終了の合成は 1 回の追加送信を許す」と書くか、relay で 1 窓分まとめるかを決める。
- **根拠**: SC-004 の計測可能性
- **scope 根拠**: spec SC-004 か plan で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `寿命\|セッションと寿命` in 0023 / `kill ハンドル` in 0036 / `AD-043\|0043` in docs | 2 / 2 / 0 | 0023:195, 0023:201 / 0036:96, 0036:198 |
| H-002 | `起票前\|design-gate 通過で accepted\|SH-000` in specs/009 | 3 | plan.md:194, plan.md:220, tasks.md:11 |
| H-003 | `JSON\.parse` in src/agents/protocol.ts / `JSON\.parse\|'IX'` in check.mjs | 2 / 0 | protocol.ts:193, protocol.ts:256 |
| H-004 | `deserialize` in spec.md | 3 | spec.md:90, 151, 237 |
| H-005 | `ports\[0\]\|port === null` in sdk-agent-session.ts | 2 | sdk-agent-session.ts:503, 504 |
| H-006 | `killSession` in useLiveSession.ts | 3 | useLiveSession.ts:192, 271, 293 |
| H-007 | `session-active` in src/ | 9 | e2e-capability.ts:303, agent-session.ts:69, session-launch-service.ts:91, session-launch-service.test.ts:74,79, labels.test.ts:43,44, labels.ts:11,31, useLiveSession.ts:27 |
| M-004 | `services-not-to-io` in .dependency-cruiser.js | 1 | .dependency-cruiser.js:223 (from: :253) |
| M-005 | `SessionSummary\|要約行` in glossary | 1 | glossary.md:574 |
| M-007 | `before-quit\|dispose\(` in src/main (関連分) | 7 | index.ts:69,118,127, composition-root.ts:383, e2e-capability.ts:124,328, session-launch-service.ts:118 |
| L-001 | `単一セッション\|per-session` in src/ | 15 files | 本文に列挙 |

## Verdict

- Critical: 0
- High: 7 (D: H-001 / H-002 / H-003 / H-005、C: H-004 / H-006、H: H-007)
- Medium: 8
- Low: 3

Critical を 0 とした理由を記録しておく。AD-023 §1 と AD-036 §3 の食い違い (H-001) は、草稿の AD-043 が Decision 5 / 6 で中身を決めており、欠けているのは読み替え対象の名指しである。調停の手段が無いわけではないので、High とした。ただし H-002 が解決されないまま AD-043 を accepted にすると、R-01 が発火した時点で accepted ADR の決定を in-place で書き換えることになる。その場合は Critical 相当の ADR drift になる。
