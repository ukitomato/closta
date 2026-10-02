# security-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**実施日時**: 2026-10-01T00:00:00+09:00
**レビュアー**: security-reviewer
**対象 spec**: specs/009-session-supervisor-and-multi-session/spec.md (+ plan.md / tasks.md の bundle。design-gate 初回)

## 初回読了 viewpoint

- 影響を受ける FR/SC:
  - FR-001 / FR-002: 単一 supervisor、セッションごとのスレッド、調停役は本文を解釈しない
  - FR-003: port は一方向で、main を迂回しない
  - FR-004: 状態の要約を未信頼入力として検証する
  - FR-005: semaphore 上限 10
  - FR-007: sessionId による宛先解決、requestId を暗号論的乱数で作りセッションに束縛する
  - FR-012 / FR-013: 失敗の閉じ込め、supervisor-exited、孤児回収
  - FR-014: before-quit
  - SC-002 / SC-004 / SC-005 / SC-007 / SC-008 / SC-009
- touched files に該当する charter / Confirmation:
  - session charter の業務ルール (stream の逐次パースは supervisor で行う、プリセットに長期資格情報を含めない)
  - AD-036 §2: port2 は一方向。制御は main で検証した IPC だけを通す
  - AD-036 §6: env は明示許可リスト。資格情報系は denylist
  - AD-034 §1 / AD-010 / AD-041 (e): 資格情報の注入先は wsl.exe の spawn env だけ
  - Constitution Principle V: ログへの混入を禁止
  - X-1 security pr-gate L-001: requestId の予測を不能にする
- A. 認可 / 認証 / secret 管理: Critical:0 High:2 Medium:3 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:3
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (semaphore の計数規則・glossary 追随は C/D owner へ)
- D. Constitution / ADR drift: 該当なし: AD-043 による AD-023 §6 / AD-036 §1 の読み替えの妥当性は architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: 永続化スキーマ・WCAG・i18n の変更はなく、自分の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

X-1 / X-4 では、セッションごとに `utilityProcess` (`sdk-agent-session.ts`) を起こし、2 本目を `session-active` で拒否していた。本 feature はこれを次のように作り替える。

- **プロセス構成**: 単一の supervisor (`utilityProcess`) にまとめる。中に調停役スレッド (`src/agents/supervisor.ts`) とセッションごとの worker thread を置く。
- **上限**: semaphore で 10 本に固定する。
- **状態の要約**: supervisor→main→renderer の経路で 100ms ごとにバッチ化する。
- **requestId**: `randomUUID()` で作る。
- **孤児回収**: main が記録した pid に `process.kill` する (`reap.ts`)。
- **終了処理**: before-quit を非同期化する。
- **renderer**: セッション単位の store と一覧 UI を持つ。

security 観点で見た新しい攻撃面は次の 3 つ。

1. **main が supervisor 由来の値で OS 上の任意 pid を kill する経路**。新設。
2. **複数セッションの資格情報 (`spec.env`) が 1 プロセスに同居する**。
3. **worker / 調停役 / main の間の多重化メッセージで宛先の束縛が保たれるか**。

preload の追加は `onSessionStatus` 購読 1 本だけ。固定チャンネルの `subscribe` 経由なので、汎用パススルーは増えない。BrowserWindow、ナビゲーション、新規依存はいずれも変わらない。

## 指摘事項

### [High] `reap.ts` の `process.kill(pid)` は supervisor から届いた pid を検証せず、本人確認もせずに kill する設計 (H-001) (scope: feature)

- **観察**:
  - `plan.md:146`: worker が報告した `wsl.exe` の pid を、調停役が `{"kind":"spawned","sessionId","pid"}` で main へ送る。
  - `plan.md:159`: `reapProcesses(pids)` が `process.kill(pid)` を呼ぶ。pid 再利用への対策は「supervisor の生存中に exit を通知された pid は記録から外す」だけ。
  - `plan.md:172` と `plan.md:174`: supervisor の異常終了時と、dispose で 3 秒の期限が切れた後に、残った pid を kill する。
  - spec の Edge Cases (`spec.md:139`) は「supervisor からの入力も検証する」と書く。しかし plan の検証述語は `isSessionStatusSummary` (`plan.md:130`) だけで、`spawned` メッセージの pid を検証する規則がどこにもない。
  - BE-022 (`tasks.md:97`) の単体も「exit を通知された pid を外す規則」しか固めていない。
- **同種事象探索**: `process\.kill\(|SHARE_ENV|new Worker\(` を `src/` で検索して 0 件。新設経路であり、既存の前例・ガードはない。
- **リスク/影響**:
  - **pid の値を検証していない**: Node/libuv の Windows 実装では `process.kill(0)` が自プロセス (main) を対象にする。POSIX では `0` / 負値がプロセスグループや全プロセスへの signal になる。`process.pid` や supervisor 自身の pid が混入した場合も含め、値の検証がないと main 自身を落とす経路になりうる。
  - **pid の再利用**: 窓は 2 つある。
    - 異常終了の直前に起きた wsl.exe の exit 通知は失われうる。状態の要約は 100ms 窓でバッチされるので、その窓内の通知が supervisor と共に消える。
    - dispose の 3 秒待ちの間に、通知が来ないまま exit した pid がある。
  - Windows は pid をすぐに再利用するので、上記の窓で利用者の無関係なプロセス (エディタなど) を TerminateProcess しうる。未保存データの損失につながる。
  - plan は「SH-000 (3) で孤児が出ないと分かっても、防御として残す」と書く。だがこれは、無関係なプロセスを kill しうる経路を防御として常設する判断で、純減にならない可能性がある。
- **推奨アクション**:
  1. main 側の `spawned` 受信に検証を加える。
     - pid は `Number.isSafeInteger(pid) && pid > 0` を満たし、`process.pid` と supervisor の pid のどちらでもないこと。
     - sessionId は registry に在り、そのセッションで未登録の場合に限り受理する (1 セッション 1 pid。上書きしない)。
     - 現行の supervisor 世代から来たものに限る (H-002 と共通)。
  2. kill の前に本人確認を入れる。spawn 時に worker から「image 名 (`spec.command` の basename)」と「プロセス生成時刻」を受け取って記録し、kill 直前に照合する。照合できない環境では kill せず、件数を記録する。
  3. SH-000 (3) で「supervisor が落ちても wsl.exe が残らない」と実測できた場合は、`reap.ts` を作らない選択肢を AD-043 に明記する (最小案)。残す場合は、上記 2 の本人確認を AD-043 の Confirmation に入れる。
  4. BE-022 の単体に `0` / 負値 / 非整数 / `process.pid` / 未知 sessionId / 2 回目の `spawned` の負例を足す。
- **根拠**: CWE-20 (入力検証の欠如)、CWE-283 (所有者を検証しない操作)、spec Edge Cases「supervisor からの入力も検証する」、FR-013。
- **scope 根拠**: plan の main/infra 節と BE-020 / BE-022 で直接修正できる。

### [High] worker 由来メッセージ (要約・pid・本文) の sessionId を、payload でなく送信元 worker で束縛する規則がない (H-002) (scope: feature)

- **観察**:
  - `plan.md:152` は、worker が「`state` / `failure` を出すたびに要約も送る」「子の `exit` で `claudeAlive: false` を送る」と書く。だが要約の `sessionId` を誰が付けるかが書かれていない。worker が自分で sessionId を載せ、調停役がそれを信用するのか、調停役が自分の宛先表から付けるのか。
  - `plan.md:146` の `spawned` も同じ。
  - main 側の扱いも 3 点が規定されていない。
    - `plan.md:171` の「要約を受けたら `claudeAlive` を更新する」で、`false` → `true` への逆戻りを許すかどうか。
    - supervisor を起こし直した後 (`plan.md:167`)、旧世代の supervisor ハンドルから遅れて届いた `status-batch` / `spawned` を捨てるかどうか。
    - `plan.md:172` で合成した `supervisor-exited` / `claudeAlive:false` の後に、旧世代の要約が届いた場合の扱い。
- **同種事象探索**: plan.md の `pid|process\.kill|spawned|claudeAlive|sessionId` が 30 件。そのうち「worker の出自で sessionId を付ける」「claudeAlive を単調にする」「supervisor の世代を照合する」を記述した箇所は 0 件。
- **リスク/影響**:
  - セッション A の worker が B の sessionId を名乗ると、B に起きうることが 3 つある。
    - B が誤って `error` になる。
    - B の枠が解放されて上限 10 を超える。
    - B の pid として誤った値が記録され、H-001 の誤 kill につながる。
  - worker は自前コードだが、未信頼の stream をパースする層でもある。宛先の束縛を payload に依存させるのは「制御のセッション間混線」(SC-005 の精神) を状態側で作る形になる。
  - 旧世代の遅延メッセージで `claudeAlive:true` に戻ると、枠が永久にリークする (自己 DoS)。
- **推奨アクション**:
  1. `supervisor-core.ts` の宛先表で、worker 由来メッセージの sessionId を「その Worker インスタンスに割り当てた sessionId」で上書き・付与する。worker の payload が持つ sessionId は無視するか、不一致なら捨てる。
  2. main の registry では `claudeAlive` / `threadAlive` を単調 (true → false のみ) にする。
  3. `SupervisorConnection` に世代番号を持たせ、`onStatusBatch` / `onSpawned` は現行世代のハンドルから来たものだけを受理する。
  4. BE-004 / BE-020 の単体に負例を足す。
     - 他セッションの sessionId を名乗る worker メッセージが捨てられる。
     - 旧世代のバッチが反映されない。
     - false の後の true が無視される。
- **根拠**: FR-004 (未信頼入力として検証)、FR-007 / SC-005 (宛先の混線 0)、CWE-345 (データの出所を十分に検証していない)。
- **scope 根拠**: plan の agents / main/app 節と BE-004 / BE-007 / BE-020 で直接修正できる。

### [Medium] 調停役スレッドの受信 decode が未規定で、「supervisor.ts に `JSON.parse` 0 件」の検査とも衝突する (M-001) (scope: feature)

- **観察**:
  - `src/agents/transport.ts:27` と `:110`: transport は「1 メッセージ = 1 行 (文字列)」で、文字列以外を無視する。したがって main→supervisor の `launch` / `control` は文字列行として届き、調停役はそれを decode しなければ宛先も判定できない。
  - 一方 `plan.md:213` は「`supervisor.ts` / `supervisor-core.ts` に `JSON.parse` が 0 件」を check.mjs で強制する。
  - 受信行の検証 (kind の enum、sessionId の UUID 形、control の形) をどこで行うかが plan に書かれていない。worker 側には `decodeLaunch` / `decodeControl` (`src/agents/sdk-agent-session.ts:220` / `:249`) がある。
  - 既存の行 decoder は `src/agents/protocol.ts:190` / `:253` に置かれている。
- **同種事象探索**: `JSON\.parse` を `src/agents` で検索して 2 件 (`protocol.ts:193`, `protocol.ts:256`)。どちらも列挙プロトコル用で、supervisor 用の decoder はない。
- **リスク/影響**:
  - 実装者が検査を避けるために、検証なしの別経路 (自作 parse・`as` キャスト) で受信行を扱う誘因が生まれる。
  - 調停役で sessionId を検証しないと、宛先表の鍵に任意文字列が入る。
- **推奨アクション**:
  - `protocol.ts` に `decodeSupervisorRequest(line)` / `encodeSupervisorEvent(...)` を置く。kind の enum、`isValidSessionId`、control は `decodeControl` 相当の述語で検証する。調停役はこれだけを呼ぶ。
  - check.mjs の検査対象を「本文 payload に `JSON.parse` を適用しない」と言い換えるか、制御行の decode が protocol.ts 側にあることを明記する。
  - worker→調停役の envelope についても、`kind` の enum と `payload` が `string` であることを検証する。
- **根拠**: SEC-4 (境界の入口で未信頼入力を検証する)、FR-002、AD-030 §5。
- **scope 根拠**: plan の agents 節と BE-005 / SH-010 で直接修正できる。

### [Medium] 複数セッションの資格情報 (`spec.env`) が 1 プロセスに同居する前提での取り扱い規則がない (M-002) (scope: feature)

- **観察**:
  - X-4 (AD-041 (e)) により、`spec.env` には `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` などの実値が載る (`specs/008-session-launch-settings-dialog-and-presets/spec.md:247`)。
  - X-1 / X-4 では、これはセッション専用プロセスにだけ届いていた。本 feature では異なる Provider の資格情報が同じ supervisor プロセスを通る。
  - plan で該当するのは `plan.md:44` (Principle V) と `plan.md:142` (`workerData` に残さない) の 2 箇所だけ。次の 3 点が書かれていない。
    - `new Worker` の `env` オプションに `spec.env` を渡さないこと、`SHARE_ENV` を使わないこと。
    - 調停役が `launch` の `spec` を Worker に渡した後、参照を保持しないこと (宛先表に spec を入れない)。
    - stdio 経路 (単独起動・テスト) で、`launch` 行の資格情報が stdout / stderr に echo されないこと。
- **同種事象探索**: `SHARE_ENV|new Worker\(` を `src/` で検索して 0 件。新設経路。
- **リスク/影響**:
  - `env: spec.env` や `SHARE_ENV` を使うと、そのセッションの資格情報が worker の `process.env` に入る。SDK や依存が `process.env` を読むと、`composeClaudeSpawn` の「spec.env だけ」(H-01) 以外の経路で使われうる。
  - `SHARE_ENV` は全 Worker と調停役で env を共有するので、セッション間で資格情報が混線する。
- **推奨アクション**: plan の agents 節と AD-043 に以下を明記し、BE-005 の単体で assert する。
  - Worker は `env` 未指定 (supervisor の curated base の複製) で起こす。`SHARE_ENV` は禁止する。
  - spec は最初の message で渡し、調停役は以後保持しない。
  - stdio 経路では、受信行を出力にも log にも echo しない。
  - SH-010 に `SHARE_ENV` を禁止する lint/check を 1 行足すことも検討する。
- **根拠**: Constitution Principle V (一時資格情報はメモリ上のみ、漏洩面を広げない)、AD-036 §6、AD-041 (e)。
- **scope 根拠**: plan の agents 節と BE-005 で直接修正できる。

### [Medium] 会話由来ペイロードや資格情報がログ・stderr に混入しないための規則が新しい経路に書かれていない (M-003) (scope: feature)

- **観察**:
  - 新設する経路で、例外・破棄の扱いが規定されていない。
    - 調停役は worker の `exit` / `error` で終端を合成する (`plan.md:145`)。
    - relay は形の崩れた要約を捨てる (`plan.md:175`)。
    - SH-000 (2) が成立しなかった場合、`messageerror` を扱う。
  - いずれも、例外オブジェクトや破棄した値を log / console に出してよいかが書かれていない。
  - supervisor の fork の `stdio` も plan に書かれていない。現行の `src/main/app/session-spawner.ts:42` は `stdio: 'ignore'` だが、`plan.md:163-167` はこれに触れていない。
  - 既存の worker は「例外に本文断片を載せない」(`src/agents/sdk-agent-session.ts:472`) を守っている。しかし Worker 境界をまたぐ `error` イベントは、SDK 内部の例外の message や stack をそのまま運ぶ。
- **同種事象探索**: `console\.(log|error|warn)` を `src/agents` で検索して 0 件 (現状はクリーン)。main 側の既存ログは `src/main/index.ts:129` の件数だけを出す warn 1 件。
- **リスク/影響**: Worker の `error` の `err.message` には、SDK のパース例外などで本文断片が入りうる。これを調停役や main が log に出すか、stdio を `pipe` / `inherit` にすると、会話内容や (M-002 の経路で) 資格情報がターミナルやログに残る。
- **推奨アクション**: plan に次を明記し、BE-005 / BE-011 の単体で「log が呼ばれない、または理由キーと件数だけ」を assert する。
  - supervisor の fork は `stdio: 'ignore'` を維持する。
  - 調停役と relay は、例外や破棄した値の中身を記録しない。出すのは理由キーと件数だけ。
  - Worker の `error` は理由キー `process-crashed` に変換するだけにする。
- **根拠**: Constitution Principle V (ログへの混入禁止)、CWE-532、X-1 C-3。
- **scope 根拠**: plan の agents / main/app 節で直接修正できる。

### [Medium] fake `query()` の差し込み口 (entry 引数) と E2E の stub 選択が、本番で使えないことを保証する規則がない (M-004) (scope: feature)

- **観察**:
  - BE-012 (`tasks.md:80`) は「fake `query()` の差し込み口は環境変数でなく entry の引数で受ける」とし、本番 entry に fake を混ぜない形を SH-000 (4) に先送りしている。
  - E2E (`plan.md:190`, `tasks.md:116`) は「stub supervisor (fake `query()`)」を使うとするが、Electron 下でそれをどう選ぶかが書かれていない。
  - 既存の E2E stub は `!app.isPackaged && process.env.CLOSTA_E2E === '1'` の二重ゲートを持つ (`src/main/app/e2e-capability.ts:29`, `src/main/index.ts:61`)。env 単独のゲートは禁止されている (origins.ts E-H004)。
- **同種事象探索**: `isPackaged|CLOSTA_E2E` を `src/main/app/e2e-capability.ts` で検索して 1 件 (`:29`)。supervisor 側の同等ゲートは計画になく 0 件。
- **リスク/影響**: 本番の supervisor entry が argv からモジュールパスを受けて `query()` の実装を差し替えると、権限ゲート (Principle III の `buildQueryOptions`) を通らない実装を読み込める口が製品に残る。
- **推奨アクション**:
  - fake `query()` は別の entry ファイル (テスト専用。本番 bundle に含めない) で提供する。本番の `supervisor.ts` は argv / env で実装を差し替えない。
  - E2E で supervisor 経路を使う場合は、既存の `isPackaged` + `CLOSTA_E2E` の二重ゲートの内側で、entry のパスを選ぶ。
  - SH-010 に「本番 entry が差し替え引数を読まない」構造検査を足す。
- **根拠**: AD-038 D3、origins.ts E-H004、Principle III。
- **scope 根拠**: BE-012 / SH-020 / SH-010 で直接修正できる。

### [Medium] before-quit の非同期化に、再入の防止と全体の期限が規定されていない (M-005) (scope: feature)

- **観察**:
  - `plan.md:177` は「`before-quit` で `preventDefault` → 完了後に `app.quit()`」とする。`app.quit()` は `before-quit` をもう一度発火させるので、再入の防止 (dispose 済みフラグ) がないと dispose が二重に走るか、終了がループする。
  - 期限 3 秒 (`plan.md:174`) は「全 `claudeAlive:false` を待つ」部分にしか掛かっていない。`enumerator.dispose()` / `transcripts.dispose()` と合わせた dispose 全体 (`src/main/app/composition-root.ts:383`) が期限内に resolve する保証が書かれていない。
  - 登録先は実際には `src/main/index.ts:118` で、E2E 経路の `src/main/index.ts:69` にも別の登録がある。
- **同種事象探索**: `before-quit` を `src/main` で検索して 3 件 (`src/main/index.ts:69`, `src/main/index.ts:118`, コメント `composition-root.ts:76`)。
- **リスク/影響**:
  - promise が resolve しないと、アプリが終了しない (利用者は Task Manager で落とすことになり、その場合は孤児回収も走らない)。
  - 再入すると kill が二重に送られ、`reapProcesses` も二重に呼ばれる (H-001 の誤 kill の窓を広げる)。
- **推奨アクション**:
  - `quitting` フラグで 2 回目の `before-quit` を素通しする。
  - dispose 全体を `Promise.race([dispose, timeout])` で上限付きにする。
  - 変更対象として `src/main/index.ts` の 2 箇所を BE-021 に列挙する。
  - 単体で「2 回目の before-quit で dispose が呼ばれない」「dispose が resolve しなくても期限で quit する」を assert する。
- **根拠**: FR-014、SC-008、005 arch pr-gate round2 M-003 (申し送り #8)。
- **scope 根拠**: BE-021 で直接修正できる。

### [Low] renderer が本文文字列を `JSON.parse` した後、`as SessionEvent` キャストのままで形を検証しない (L-001) (scope: feature)

- **観察**:
  - 現行の `src/renderer/src/features/session/useLiveSession.ts:165` は `applyEvent(ev.data as SessionEvent)` で、検証なしにキャストしている。
  - 本 feature では本文が文字列になり (`plan.md:11` / `:151`)、renderer に `JSON.parse` が新設される。
- **同種事象探索**: `SESSION_PORT_MESSAGE|isSessionEvent|decodeSessionEvent|onmessage` を `src/renderer` で検索。decoder は 0 件で、キャストは `useLiveSession.ts:165` の 1 件。
- **リスク/影響**:
  - 形の崩れた payload や切り詰められた payload は、`JSON.parse` の例外を捕捉しないとそのセッションの handler を壊す。
  - `Object.assign` 系で合成する実装をすると、`__proto__` キーで対象オブジェクトの prototype が差し替わる。
  - XSS の境界 (worker のサニタイズと React のテキスト描画) は維持される前提なので、Low とする。
- **推奨アクション**: FE-001 で、`JSON.parse` を try で囲み、`kind` を enum で検証する decoder を経由させる。失敗したら破棄する (他のセッションに影響させない)。
- **根拠**: SEC-6、AD-036 §2。
- **scope 根拠**: FE-001 で直接修正できる。

### [Low] stdio 経路の envelope を文字列連結で組むと、本文が行を偽造できる (L-002) (scope: feature)

- **観察**: `plan.md:143` は `{"kind":"event","sessionId",...,"payload":<string>}` の 1 行を書くとする。「payload は文字列のまま埋め込む」の実装手段 (`JSON.stringify` で envelope 全体を作るか、テンプレート連結か) が書かれていない。
- **同種事象探索**: 該当なし (新設経路のため 0 件)。
- **リスク/影響**: 連結で組むと、本文中の改行や引用符で `{"kind":"spawned","pid":...}` や `status-batch` の行を偽造できる。単独起動の利用側 (テスト・診断) に限られるので Low。
- **推奨アクション**: envelope は必ず `JSON.stringify({kind, sessionId, payload})` で作る (payload は二重にエンコードされる) と plan に 1 行足す。BE-012 で改行や引用符を含む payload の往復を assert する。
- **根拠**: CWE-93 / CWE-117。
- **scope 根拠**: BE-005 / BE-012 で直接修正できる。

### [Low] `respondPermission` の requestId の形式検証を UUID に締められる (L-003) (scope: feature)

- **観察**: `src/main/app/session-ipc.ts:210` は requestId を `isValidRequestToken` (非空で上限長以内。`src/domain/validation.ts:192`) で検証している。本 feature で requestId は `randomUUID()` になる (`plan.md:154`)。
- **同種事象探索**: `isValidRequestToken` を `src/main/app/session-ipc.ts` で検索して 2 件 (`:88` transcript、`:210` permission)。
- **推奨アクション**: permission 経路だけ `isValidSessionId` と同じ UUID 述語に替え、不正な形は supervisor まで届けない。kill 経路の `requestId: ''` は内部の resolve 用で、IPC を通らないので影響しない。
- **根拠**: SEC-4、FR-007。
- **scope 根拠**: BE-010 で直接修正できる。

### [Low] port の一方向性 (supervisor がセッション port で受信しない) が構造検査の対象に入っていない (L-004) (scope: feature)

- **観察**: BE-013 (`tasks.md:81`) が見るのは「main が本文 port を保持しない」「`JSON.parse` がない」「文字列のまま port へ渡る」の 3 点。FR-003 / AD-036 §2 の「renderer から制御を受理しない」は検査に入っていない。中継形では調停役が、直送形では worker が port を持つ。
- **同種事象探索**: 該当なし (新設ファイル)。
- **推奨アクション**: BE-013 に「`supervisor.ts` / `sdk-agent-session.ts` がセッション port に `message` listener / `onmessage` を登録しない」を加える。
- **根拠**: AD-036 §2、FR-003。
- **scope 根拠**: BE-013 で直接修正できる。

### [Medium] SC-005 の requestId 検証を main の IPC 単体に置いているが、main は requestId を作らず保持もしないので、検出できない (M-006) (scope: feature)

- **観察**:
  - BE-010 (`tasks.md:69`) は、main の IPC ハンドラを直接呼ぶ単体で「別セッションの `requestId` が効かない」「`requestId` が `randomUUID` 由来であること」を確かめるとする。
  - しかし requestId を作るのも、pending との照合も worker (`src/agents/sdk-agent-session.ts:331` / `:368`, `plan.md:154`) である。main は形しか見ない (`src/main/app/session-ipc.ts:202-203` のコメントのとおり)。
- **同種事象探索**: `nextRequestId|pending` を `src/agents/sdk-agent-session.ts` で検索して 7 件 (`:297`, `:331`, `:340`, `:344`, `:368`, `:370`, `:395`)。どれも worker 内にある。
- **リスク/影響**: main の単体は sessionId のルーティングしか検査できない。requestId の束縛と暗号論的乱数の生成は、テストがあるように見えて、実際には誰も検査しない状態になる (SC-005 の計測経路の空洞化)。
- **推奨アクション**: requestId の生成 (`randomUUID` を注入した生成器) と「pending に無い・応答済み・他セッションの requestId を無視する」は、worker 側の単体 (`createCanUseTool` / 制御シンクの純粋部分を session-core 相当へ切り出す) に移す。BE-010 は sessionId のルーティングの負例に絞る。あわせて次のテストを足す。
  - H-001 / H-002 / M-001 の負例 (pid の検証、sessionId のなりすまし、旧世代メッセージ、受信行の検証)。
  - M-003 の log 非混入。
  - 観測点として、`reapProcesses` の失敗件数と期限切れの件数を、件数だけで warn に出す (既存の `src/main/index.ts:129` の形に倣う)。
- **根拠**: SC-005、reviewer-base の H 規定 (指摘を検出できるテストがあるか)。
- **scope 根拠**: BE-002 / BE-010 / BE-023 で直接修正できる。

## 同種事象の探索結果 (cascade summary)

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `process\.kill\(\|SHARE_ENV\|new Worker\(` (src/) | 0 | 新設経路 (plan.md:159) |
| H-002 | `pid\|process\.kill\|spawned\|claudeAlive\|sessionId` (plan.md) | 30 (束縛・単調性・世代照合の記述は 0) | plan.md:146, :152, :167, :171, :172 |
| M-001 | `JSON\.parse` (src/agents) | 2 | src/agents/protocol.ts:193, :256 |
| M-002 | `SHARE_ENV\|new Worker\(` (src/) | 0 | — |
| M-003 | `console\.(log\|error\|warn)` (src/agents) | 0 | — (main 側 src/main/index.ts:129 は件数のみ) |
| M-004 | `isPackaged\|CLOSTA_E2E` (e2e-capability.ts) | 1 | src/main/app/e2e-capability.ts:29 |
| M-005 | `before-quit` (src/main) | 3 | src/main/index.ts:69, :118, src/main/app/composition-root.ts:76 |
| L-001 | `SESSION_PORT_MESSAGE\|isSessionEvent\|decodeSessionEvent\|onmessage` (src/renderer) | decoder 0 / cast 1 | src/renderer/src/features/session/useLiveSession.ts:165 |
| L-003 | `isValidRequestToken` (session-ipc.ts) | 2 | src/main/app/session-ipc.ts:88, :210 |
| M-006 | `nextRequestId\|pending` (sdk-agent-session.ts) | 7 | src/agents/sdk-agent-session.ts:297, :331, :340, :344, :368, :370, :395 |

## 判定

- Critical: 0
- High: 2
- Medium: 6
- Low: 4
