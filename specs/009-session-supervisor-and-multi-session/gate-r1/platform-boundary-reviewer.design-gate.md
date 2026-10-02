# platform-boundary-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md (+ plan.md / tasks.md)

## 初回読了 viewpoint

- FR/SC: この bundle で実装・影響を受けるのは FR-001〜FR-016 / SC-001〜SC-010 の全件。本 reviewer の担当スライスに直接かかるのは次のとおり。
  - FR-001 / SC-009 (Principle VII・単独起動)
  - FR-002 / FR-003 / SC-002 (本文の経路と、それを検査する規則)
  - FR-005 (`claude` の生存で数える上限)
  - FR-012 / FR-013 / FR-014 / SC-007 / SC-008 (`wsl.exe` の孤児化とプロセス制御)
  - FR-006 (同一フォルダ警告の照合キー)
  - FR-015 (許可リストの付け替え)
- touched files に該当する charter / Confirmation:
  - session charter (supervisor / semaphore / IPC バッチ化の Scope 行)
  - runtime charter の Out of scope「セッションの列挙・起動・監視 → session」(`docs/domains/runtime/charter.md:51`)
  - AD-003 Decision Outcome「インスタンスは複数存在しうる」
  - AD-010 Decision (`node dist/supervisor.js`)
  - AD-018 Consequences (supervisor が `wsl.exe` のハンドルを保持する / docker 経由の kill 伝播は未測定)
  - AD-036 §3 (kill ハンドルの所有者は agents)。これは architecture-reviewer の所管 ADR なので、参照にとどめる
  - Constitution Principle I / II / VI / VII の Verification 節 (eslint.config.mjs / .dependency-cruiser.js / scripts/constitution/check.mjs)
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer。pid を未信頼入力として扱う観点は H-001 の中で、プラットフォーム境界の側から扱った
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer。`requestId` の乱数化 (FR-007) は本 reviewer の担当外
- C. 業務不変条件 / Charter drift: 該当なし: isolation charter には触れていない。runtime charter の Out of scope 侵犯は AD-003 と切り離せないので M-003 にまとめ、D に計上した
- D. Constitution / ADR drift: Critical:0 High:2 Medium:4 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1 (加えて、H-001 / H-002 / M-004 / M-005 を検出するテストが tasks に無い点を各指摘の推奨アクションに含めた)

## スコープ要約

X-1 / X-4 の per-session `utilityProcess` を、単一 supervisor (`utilityProcess`) + セッションごとの `worker_threads` に作り替える feature である。本 reviewer は次の点を中心に見た。

- Principle VII の単独起動 (stdio 経路) が実体化できるか
- `process.kill` を使う `reap.ts` の新設と、それを縛る規則があるか
- 複数インスタンス / 再 fork 時の参照の残り方
- 子プロセスの実在と上限計数がずれないか
- 新しい lint 許可 (`worker_threads` / `crypto`) と、Principle IX の検査を拡張する案の効き目

PB-3 (capabilities)・PB-4 (権限ゲート)・PB-5 (多段変換)・PB-6 (永続環境) は、次の理由で該当なしとした。

- PB-3 該当なし: `capabilities` の算出にも表明にも変更がない。
- PB-4 該当なし: 各起動は X-4 の `prepareLaunch` を通る (FR-006)。worker 側の `decodeLaunchOptions` が安全 3 値以外を拒否する (`src/agents/sdk-agent-session.ts:196-213`)。stdio 単独起動の経路から来る launch もこの decoder を通るので、昇格経路は増えない。supervisor が異常終了しても自動再開はしないので (FR-013)、再検証を飛ばす再入口もない。
- PB-5 該当なし: `RuntimeLaunchSpec` (`--cd` の RuntimePath / prefixArgs) は値のまま中継され、変換段数は変わらない。docker endpoint はこの feature の範囲外である。
- PB-6 該当なし: 名前付きボリューム・`--restart`・ディストロへの書き込み・設定ファイルの生成はどれも無い。常駐する supervisor はプロセスであって、永続環境ではない。

## Findings

### [High] `process.kill(pid)` を「既存規則の範囲内」としているが、その規則は存在しない。しかも pid は未検証の入力で、再利用の窓もある (H-001) (scope: feature)

- **観察**:
  - `plan.md:214` は「`process.kill` を持つ。infra/runtime 配下なので既存の規則 (プロセス操作は infra/runtime) の範囲内」と書く。しかし既存規則が縛っているのは import 文と呼び出し形だけである。
    - ESLint が禁じているのは `child_process` / `os` / `process` モジュールの **import** だけ (`eslint.config.mjs:50-56`)。`process` はグローバルなので import が現れない。
    - check.mjs 項目 7 の `SPAWN_CALL_PATTERNS` (`scripts/constitution/check.mjs:101-113`) に `kill` は含まれない。
    - したがって `process.kill(pid)` は、`src/agents/` や `src/main/app/` を含むどのレイヤに書いても検出されない。
  - pid は supervisor からの `{"kind":"spawned","sessionId","pid"}` で届く (`plan.md:146`)。main は `status-batch` を未信頼入力として検証するが (`plan.md:175`)、`spawned` の検証規則はどこにも書かれていない。
  - 「`exit` を通知された pid は記録から外す」(`plan.md:159`) の通知経路が明示されていない。`claudeAlive: false` は 100ms 窓でまとめる要約で運ぶ (`plan.md:144` / `:152`)。そのため、子の exit から通知が届くまでの間に supervisor が落ちると、main は死んだ pid を記録したまま `process.kill` する。Windows は pid を再利用するので、無関係な利用者プロセスを止める経路になる。
  - AD-036 §3 は「kill ハンドルは agents が保持する。app が持てるのは agents utilityProcess のハンドル」と決めている (`docs/decisions/0036-...md:96-101`)。spec FR-015 の読み替えリスト (`spec.md:199-203`) に §3 は入っていない。ADR drift の判定は architecture-reviewer に委ねるが、本 reviewer からは「プロセス制御の主体が main に移る」ことが機械的にも文書上も固定されていない点を指摘する。
- **同種事象探索**:
  - `process\.kill` を src (テストを除く) で検索 → 0 件。採用されれば初出であり、前例の規則が無い。
  - `\.kill\(` → 10 件。いずれも自分が生成した子のハンドルに対する kill である (sdk-agent-session.ts:319 / wsl-cli.ts:152 / enumerator-spawner.ts:105 / transcript-spawner.ts:70 / session-spawner.ts:76 / session-launch-service.ts:123 / session-enumerator.ts:312 / transcript-service.ts:113,134 / SessionScreen.tsx:306 (UI 操作))。
  - 「任意の pid を kill する」形はこの feature が初めて持ち込む。
- **リスク/影響**:
  - pid 再利用による誤 kill。
  - 将来、どのレイヤからでも pid kill が書ける状態のまま「強制されている」と記録されること。
  - supervisor のバグや改竄で任意の pid を kill させられる面ができること。
- **推奨アクション**:
  1. check.mjs に「pid 指定 kill (`process\s*\.\s*kill\s*\(`) を書けるモジュールの許可リスト」項目を新設する。`reap.ts` 1 件を実名で登録し、違反 fixture を足す (SH-010)。plan の「機械強制の変更」表の `reap.ts` 行を「既存規則の範囲内」から「新設項目」に書き換える。
  2. `spawned` の受信検証を plan に明記し、BE-011 / BE-020 の単体に負例を足す。条件: pid は正の整数 / sessionId は registry に在り、まだ pid を持っていない / 自プロセスの pid / supervisor の pid ではない。
  3. 子の exit は即時の個別メッセージ (`{"kind":"child-exited","sessionId","pid"}`) で送り、バッチに載せない。記録から外す処理は、この通知で行う。
  4. AD-043 の Decision 5 に「AD-036 §3 / AD-018 Consequences の kill 主体を、supervisor 異常終了時に限って main に広げる」と明示する。読み替え対象を FR-015 に追記する。
  5. `reapProcesses` は `session-launch-service` に deps として注入する。調停クラスは I/O を自分で取りに行かない (`.dependency-cruiser.js:223-243` の趣旨)。BE-020 の単体はこの注入で書く。
- **根拠**: Constitution Principle VI (プロセス起動 API を実名で数える趣旨。項目 7) / Principle VII Verification / AD-018 Consequences / AD-036 §3
- **scope 根拠**: `reap.ts` / `allowlists.mjs` / `check.mjs` / AD-043 はいずれもこの feature の touched files

### [High] worker の異常終了時に `claudeAlive: false` を合成するが、`wsl.exe` の実在と一致せず、kill する主体もいない。spawn しなかったセッションは逆に枠を返さない (H-002) (scope: feature)

- **観察**:
  - `plan.md:145`: worker の `exit` / `error` で `{ state: 'error', reasonKey: 'process-crashed', claudeAlive: false }` を**合成**する。この時点で worker が spawn した `wsl.exe` を誰が kill するかが書かれていない。
    - `worker.terminate()` / スレッドの例外で子プロセスが自動的に止まる保証は無い。
    - supervisor.ts はプロセス操作を持たない設計である (`plan.md:116`)。
    - main の `reapProcesses` は supervisor 異常終了のときだけ呼ばれる (`plan.md:172`)。
  - その結果、`claude` が生きたまま枠が解放される。FR-005「`claude` のプロセスが生きているセッションを数える」(`spec.md:164`) を plan の合成規則が直接破る。プロセスはアプリ終了まで残る。
  - SC-008 の孤児 0 の対象は「アプリ終了・ウィンドウを閉じる・supervisor の異常終了」だけで (`spec.md:245`)、**スレッドの異常終了 (US-4 AC1 / FR-012) が抜けている**。
  - 逆向きの穴もある。現行の worker は launch のデコードに失敗すると `process.exitCode = 1; return` で抜け、listener が残るので生き続ける (`src/agents/sdk-agent-session.ts:504-507`)。worker 化した後も同じ構えなら、子を spawn しないまま exit もしない。`claudeAlive` は「子の exit」でしか false にならないので (`plan.md:152`)、枠が supervisor の再起動まで戻らない。
- **同種事象探索**: `claudeAlive` の扱いを plan.md / tasks.md で検索 → 7 件 (`plan.md:12`, `:127`, `:131`, `:145`, `:152`, `:169-171`, `:174`。tasks.md BE-002 / BE-004 / BE-007)。このうち「子の実在」から導くのは `:152` だけで、`:145` は合成。未 spawn のケースを扱う行は 0 件。
- **リスク/影響**:
  - スレッド例外のたびに `wsl.exe` と WSL 内の `claude` が残り、しかも上限に数えられない。11 本以上が実際に動きうる。
  - デコード失敗のたびに枠が 1 つずつ失われ、最終的に `session-limit` で起動できなくなる。
- **推奨アクション**:
  1. supervisor が worker の exit を検知したら、`spawned` で記録済みのそのセッションの pid を main が回収する経路を足す。`process-crashed` の要約を受けた main が `reapProcesses([pid])` を呼ぶ形でよい (H-001 の検証つき)。
  2. 合成する要約では `claudeAlive` を `false` にしない。回収の成否 (または「pid 未記録 = 未 spawn」) を確かめた上で false にする。
  3. デコード失敗時は worker が `{ kind: 'ended' }` を送り、supervisor が `terminate` して終端を合成する。`claudeAlive` は未 spawn として false にする。
  4. SC-008 の対象に「スレッドの異常終了」を足す。BE-023 に「1 Worker の例外で、その Worker の子に kill が届く」こと、BE-007 に「未 spawn の起動失敗で枠が戻る」ことの単体を足す。
- **根拠**: spec FR-005 / FR-012 / FR-013 (X-1 FR-017 の拡張) / AD-018 Consequences (supervisor は `wsl.exe` のハンドルを保持し kill できる必要がある)
- **scope 根拠**: `sdk-agent-session.ts` / `supervisor.ts` / `supervisor-core.ts` / `session-launch-service.ts` / spec SC-008 はいずれも touched files

### [Medium] SH-010 が拡張するとしている「check.mjs の Principle IX の検査」は存在しない。提案の grep は不変条件を表現できない (M-001) (scope: feature)

- **観察**:
  - `plan.md:213` と tasks SH-010 は「`check.mjs` の Principle IX の検査に…加える」とする。しかし `scripts/constitution/` に `Principle IX` / `JSON.parse` を扱う項目は無い (検査は項目 1〜17)。Principle IX の Automated は `bad_pattern_grep` だけである (`.specify/memory/constitution.md:560`, `:576`)。
  - 提案の検査は「`supervisor.ts` / `supervisor-core.ts` に `JSON.parse` が 0 件」だが、supervisor は main からの制御行をパースせざるを得ない (parentPort 経路の transport は文字列 1 行単位で、非文字列を捨てる `src/agents/transport.ts:110`。launch / control も行で届く `plan.md:141-147`)。
  - そのため、パースを `protocol.ts` などの別ファイルへ移した時点で検査は形だけ緑になる。既存の `decodeRequest` / `decodeResponse` は `src/agents/protocol.ts:193,256` で `JSON.parse` している。
  - FR-002 は「パースも **deserialize も**しない」(`spec.md:151`)。一方、中継方式では Worker→調停役の `postMessage` で本文文字列の structured clone deserialize が調停役スレッドで必ず起きる。grep はこれを原理的に見られない。
- **同種事象探索**: `Principle IX|JSON\.parse|structuredClone` を `scripts/constitution` で検索 → 0 件。
- **リスク/影響**: 「検査を足した」と記録されても、FR-002 / SC-002 の担保にならない。AD-031 が記録した「置き場を見る検査は評価されるプロセスを見ない」問題を再生産する。
- **推奨アクション**:
  - SH-010 の文言を「新項目 (項目 18) を新設する」に改め、rule fixture (`tests/rule-fixtures/expected.mjs`) に違反例と `UNDETECTED_NOTES` を足す。
  - 検査対象を「ファイル内の `JSON.parse` 0 件」から型と構造に変える。たとえば本文を `OpaqueBody` (branded string) 型で運び、supervisor.ts / supervisor-core.ts から decode 系関数へ渡す経路が無いことを tsc と構造検査で縛る。制御行のデコードは別モジュール (例: `supervisor-protocol.ts`) に分け、本文の kind をデコード対象に含めないことを単体で固定する。
  - FR-002 の「deserialize もせず」と中継方式の食い違いは、(a) FR-002 を「パースしない (O(n) のコピーは許容)」に改める、(b) SH-000 (2) の直送方式に倒す、のどちらかで解消する (文言の判定は architecture-reviewer に委ねる)。
- **根拠**: Constitution Principle IX Verification / AD-031 / AD-024 #2 (正本は scripts/constitution)
- **scope 根拠**: plan の機械強制表 / tasks SH-010 / BE-013

### [Medium] 単独起動の entry と worker の解決方法が未確定で、Principle VII と Principle I が両立する条件が書かれていない (M-002) (scope: feature)

- **観察**:
  - plan の Glossary 抜粋は `node dist/supervisor.js` のまま (`plan.md:79`。AD-010 Decision / Constitution VII Statement も同じ)。しかし agents は main ビルドの `?modulePath` チャンクとして出力され (`electron.vite.config.ts:15-19`)、実際の出力はハッシュ付きの `out/main/<name>-<hash>.js` である (`specs/002-.../quickstart-results.md:21`)。
  - BE-012 (SC-009) の「`node <supervisor entry>` を Vitest で起こす」が、ビルド成果物 (ハッシュ名の探索と事前ビルドが要る) とソース (Worker が `.ts` を読むには execArgv でローダを渡す必要がある) のどちらを起動するのか決まっていない (tasks BE-012 は SH-000 (4) に委ねている)。
  - supervisor から worker のパスを解決する手段も未定である (`plan.md:142`「`sdk-agent-session` の出力パス」)。agents では `node:path` が禁止されている (`eslint.config.mjs:126-133`)。文字列連結や `new URL(..., import.meta.url)` で組むと、Principle I の import 検査をすり抜ける。
- **同種事象探索**: `node dist/supervisor` を glossary で検索 → 1 件 (`docs/glossary.md:628`)。`out/main/[a-z-]+` を specs で検索 → 5 件。いずれも `-<hash>`/`-*` 形 (002 tasks.md:45 / quickstart-results.md:14,21,117,398)。
- **リスク/影響**: SC-009 が CI で安定して走らない。あるいは単独起動の確認が手動に退行する。worker パスの手組みは、規則に掛からないパス生成の前例になる。
- **推奨アクション**:
  - AD-043 に、単独起動の entry の実名形を記録する (例: supervisor だけ `entryFileNames` を固定する、またはテストが glob で探索する)。
  - BE-012 は「ビルド成果物を `node` で起こす」と決める。ソースからではないので、AD-010 の目的 (Electron なしで出荷物が動く) に直結する。
  - worker パスは `?modulePath` (バンドラの解決) に限り、手組みのパス文字列を禁止する旨を plan に書く。
  - glossary 更新 (SH-002) で `dist/supervisor.js` を実態に合わせる。Constitution の文言については architecture-reviewer に申し送る。
- **根拠**: Constitution Principle VII Statement / Principle I / AD-010 Decision
- **scope 根拠**: plan Technical Context の未確認 (4) / BE-012 / SH-002

### [Medium] `reapProcesses(pids)` を汎用の pid kill として `infra/runtime` に置くと、AD-003 のトランスポート軸に反する (M-003) (scope: feature)

- **観察**:
  - 「ホスト側ランチャーの pid を kill すればランタイム側の `claude` も消える」が成り立つのは、AD-018 が実測した `wsl.exe` だけである (`docs/decisions/0018-wsl-process-control.md:46-55`, `:100-103`)。docker 経由の kill 伝播は未測定と明記されている (同 `:135-136`)。
  - AD-003 は `DockerRuntime` (`docker exec -i`) を並ぶ実装として定めている (`docs/decisions/0003-...md:23-33`)。docker CLI の pid を kill してもコンテナ内のプロセスが止まる保証は無い。
  - plan は `reap.ts` をランタイム非依存の関数として定義している (`plan.md:159`)。
  - 置き場の `infra/runtime/` の責務について、runtime charter は「セッションの列挙・起動・監視 → session domain」を Out of scope としている (`docs/domains/runtime/charter.md:51`)。孤児回収はセッションのライフサイクルに属する。
- **同種事象探索**: `reap` を src で検索 → 0 件 (新設)。plan.md では `reap` が 6 件 (`:146`, `:159`, `:172`, `:174`, `:214`, `:240`)。
- **リスク/影響**: I-* で DockerRuntime を足したとき、supervisor 異常終了の回収が黙って効かなくなる。
- **推奨アクション**: AD-043 の Decision 5 に「pid kill による回収は WslRuntime (AD-018 実測) に限って有効」と限定を書く。回収手段はランタイムの起動契約側 (`RuntimeLaunchSpec` / runtime descriptor) が表明する形 (例: `reap: 'host-pid'`) にし、未表明のランタイムでは回収不能を理由付きで記録する。関数名も WSL 前提が分かるものにする。
- **根拠**: AD-003 Decision / Decision Outcome / AD-018 Consequences / runtime charter Out of scope
- **scope 根拠**: `reap.ts` / AD-043 は touched files

### [Medium] supervisor インスタンスの世代を registry が持たず、再 fork の前後で参照が混ざる (M-004) (scope: feature)

- **観察**:
  - supervisor は exit 後の次の launch で fork し直す (`plan.md:167`)。
  - registry は `sessionId → { label, claudeAlive, pids, threadAlive }` で (`plan.md:169`)、どの supervisor インスタンスに属するかを持たない。
  - supervisor 異常終了時は「生存中の全セッション」に `supervisor-exited` を合成し、記録された pid を回収する (`plan.md:172`)。
  - `prepareLaunch` の `await` 中に旧インスタンスが落ちた場合、旧インスタンス宛ての遅延メッセージ (status-batch / spawned) が届いた場合、新旧が並存する時間がある場合に、どのセッション・どの pid を対象にするかが規則として書かれていない。
- **同種事象探索**: `fork し直|起こし直` を plan.md / tasks.md で検索 → 4 件 (`plan.md:167`, `:201`, tasks BE-006, BE-020)。世代 / インスタンス識別子に触れる行は 0 件。
- **リスク/影響**:
  - 新しい supervisor で動いているセッションに誤って `supervisor-exited` を付ける。
  - 旧インスタンスの pid を新インスタンスの通知で消し損ねる (H-001 の誤 kill と結びつく)。
- **推奨アクション**:
  - `SupervisorConnection` が fork のたびに世代番号を発行し、`onStatusBatch` / `onSpawned` / `onExit` に添えて渡す。
  - registry の各エントリに世代を記録し、合成と回収は「落ちた世代のエントリ」に限る。
  - 古い世代のメッセージは捨てる。
  - BE-020 の単体に「exit と同時に新規 launch が進行中」のケースを足す。
- **根拠**: AD-003 Decision Outcome (インスタンスは値として扱い、消えたインスタンスへの参照を残さない) / PB-2
- **scope 根拠**: `session-spawner.ts` / `session-launch-service.ts` は touched files

### [Medium] stdio 単独起動の経路で `transport.onClosed` の扱いが無く、親が消えても worker と子が残る (M-005) (scope: feature)

- **観察**:
  - transport は `onClosed` を「孤児として残らないための唯一の合図」と定義し (`src/agents/transport.ts:30`)、stdio 側だけが実装を持つ (`:88-90`)。
  - plan の supervisor 節 (`plan.md:140-147`) と tasks BE-005 / BE-012 には、`onClosed` で全セッションを kill して終了する規則が無い。
  - parentPort 経路では Electron が回収するが (`transport.ts:117-124`)、この feature で初めて実体化する stdio 経路には同じ保証が無い。
- **同種事象探索**: `onClosed` を plan.md / tasks.md で検索 → 0 件。src では `transport.ts` の 4 箇所 (`:31`, `:81`, `:96-97`, `:117`)。
- **リスク/影響**: 単独起動 (診断・テスト・将来の非 Electron ホスト) で親が落ちると、supervisor・Worker・実 `claude` が残る。
- **推奨アクション**: supervisor は `onClosed` で全 worker に kill を送り、子の exit 待ち (期限つき) の後に自らも終了する。BE-012 に「stdin を閉じると supervisor プロセスが終了する」を足す。
- **根拠**: Principle VII / AD-010 / AD-030 §5 (経路の選択は transport に閉じる)
- **scope 根拠**: `supervisor.ts` / BE-012 は touched files

### [Medium] E2E の stub は main 内の合成 stream なので、supervisor / worker / relay / semaphore を通らない (M-006) (scope: feature)

- **観察**:
  - 既存の E2E capability は `IpcDependencies` ごと差し替え、main 内の `MessageChannelMain` から合成イベントを出している (`src/main/app/e2e-capability.ts:65-119`, `:127-130`)。
  - plan / tasks の E2E (SH-020 の「11 本目の拒否」、FE-020 の「stub 10 本」) は「stub supervisor (fake `query()`)」と書くが (`plan.md:190`)、`e2e-capability.ts` を作り替えるタスクが無い。
  - 現行の stub のまま E2E を書くと、上限判定は stub 側の registry を、負荷は main 内の発火を測ることになる。supervisor / worker / `session-launch-service` の経路は測られない。
  - `E2eCapability.dispose(): number` は同期であり (`e2e-capability.ts:124`)、BE-021 で非同期化する `dispose` と型が合わなくなる。
- **同種事象探索**: `e2e-capability` を tasks.md で検索 → 1 件 (BE-008 の「IPC の 5 面」の列挙のみ)。stub の作り替えに触れる行は 0 件。
- **リスク/影響**: SC-001 / SC-003 / SC-006 の E2E が緑でも、プラットフォーム境界 (プロセス・スレッド・port 中継) を一度も通っていない可能性がある。
- **推奨アクション**: 次のどちらを採るかを tasks に明記する。いずれの場合も BE-021 に `E2eCapability.dispose` の非同期化を含める。
  - (a) E2E capability を「本物の supervisor + fake `query()` の worker」で組む
  - (b) 現行 stub のままにし、SC-001 / SC-003 の E2E の計測範囲は renderer だけと明記する。supervisor 経路は BE-012 / BE-023 に寄せる
- **根拠**: Principle XI (観測可能な垂直スライス) / Principle VII (Electron 抜きの検証経路)
- **scope 根拠**: `e2e-capability.ts` / tasks SH-020 / FE-020 / BE-021

### [Low] 同一フォルダ警告を folderId で照合すると、同じ RuntimePath に解決される別登録を見逃す (L-001) (scope: feature)

- **観察**:
  - 警告は「稼働中セッション (`claudeAlive`) の folderId 集合」で判定する (`plan.md:188`)。
  - folderId と runtimeId は別の軸であり (`src/domain/session/launch-config.ts:51-52`)、登録フォルダは HostPath / UNC のどちらでも持てる (`src/domain/workspace/resolution.ts:167`、`src/domain/session/cwd-origin.ts:97`)。
  - そのため、ホストパス登録と `\\wsl$\...\mnt\c\...` の UNC 登録が同じ RuntimePath を指していても、folderId が異なれば警告が出ない。
  - launch の handshake に足す `label` は `{ folderName, runtimeLabel, startedAt }` で (`plan.md:176`)、renderer が folderId 集合を作る元がない。
- **同種事象探索**: `folderId` を plan.md で検索 → 1 件 (`:188`)。
- **リスク/影響**: 警告は起動を止めないので実害は限定的だが、FR-006 の「同じ作業フォルダ」の意味が名前空間ごとに変わってしまう。
- **推奨アクション**: 照合キーを「runtimeId + 解決済み RuntimePath (cwd)」にするか、folderId 照合の限界を spec の Edge Cases に記録する。handshake か registry の公開面に照合キーを含める。
- **根拠**: AD-004 (名前空間の分離) / PB-1
- **scope 根拠**: `LaunchDialog.tsx` / `session-ipc.ts` は touched files

### [Low] before-quit の非同期化で再入を防ぐ規則が無い。X-1 の V-8 実測との関係も書かれていない (L-002) (scope: feature)

- **観察**:
  - BE-021 は `before-quit` で `preventDefault` してから完了後に `app.quit()` する (`plan.md:177`, tasks BE-021)。`app.quit()` は `before-quit` を再発火させるので、ガードが無いと dispose がループするか二重に走る。
  - X-1 の V-8 は「アプリ終了で `wsl.exe` / WSL 内の `claude` が全て消え、async before-quit は不要」と実測している (`specs/005-.../quickstart-results.md:24`, `:70-72`)。plan の申し送り #8 (`plan.md:105`) はこの結論に触れていない。
- **同種事象探索**: `before-quit` を plan.md / tasks.md で検索 → 4 件 (`plan.md:174`, `:177`, tasks BE-021, spec FR-014)。再入ガードに触れる行は 0 件。
- **リスク/影響**: アプリが閉じない、または dispose が二重に走る回帰。
- **推奨アクション**: BE-021 に再入ガード (dispose 済みフラグ) と、その単体を足す。V-8 の結論と単一 supervisor 化で前提が変わる理由を申し送り #8 に 1 行書く。
- **根拠**: FR-014 / X-1 V-8
- **scope 根拠**: `composition-root.ts` は touched files

### [Low] agents に `worker_threads` / `crypto` を許可しても、その許可は import 文の層でしか効かない (L-003) (scope: system)

- **観察**:
  - agents の Node 標準モジュール禁止は ESLint boundaries の policy (3) だけが担う (`eslint.config.mjs:312-316`)。`boundaries/dependency-nodes` の設定は無く、既定は import 文だけで、`require()` も `process.getBuiltinModule()` も見ない。
  - `.dependency-cruiser.js` は `getBuiltinModule` を検出するが (`:329`)、`agents → core` を禁じる規則を持たない (`domain-not-to-io` / `ui-not-to-core` のみ。`:209-221`, `:290-298`)。
  - plan は「`supervisor-core.ts` は `worker_threads` を import しない」ことをテストできる形の前提にしているが (`plan.md:148`)、強制されるのは import 文だけである。
- **同種事象探索**: `dependency-nodes` を eslint.config.mjs で検索 → 0 件。`agents-not-to-core` を .dependency-cruiser.js で検索 → 0 件。
- **リスク/影響**: 既存の穴である。この feature で agents に許可する標準モジュールが増えることで、穴を通る経路が広がる。
- **推奨アクション**:
  - depcruise に `agents-not-to-core` (到達あり。`child_process` / `worker_threads` / `crypto` は許可ファイルに限る) を足すか、残余として `UNDETECTED_NOTES` に記録する。
  - `node:crypto` の import は `globalThis.crypto.randomUUID()` にすれば許可自体が要らない。採否を SH-010 で判断する。
  - file category の追加 (`supervisor.ts` 用) を `boundaries/files` と `no-restricted-imports` の 2 表記で揃える。
- **根拠**: Constitution Principle VII Verification (`require()` 形式と等価 API も対象) / AD-024 #2
- **scope 根拠**: 既存の lint 構成の穴であり、この feature の範囲を越える

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `process\.kill` (src, テスト除く) | 0 | — (初出) |
| H-001 | `\.kill\(` (src, テスト除く) | 10 | sdk-agent-session.ts:319 / wsl-cli.ts:152 / enumerator-spawner.ts:105 / transcript-spawner.ts:70 / session-spawner.ts:76 / session-launch-service.ts:123 / session-enumerator.ts:312 / transcript-service.ts:113,134 / SessionScreen.tsx:306 |
| H-002 | `claudeAlive` (plan/tasks) | 7 | plan.md:12,127,131,145,152,169-171,174 |
| M-001 | `Principle IX\|JSON\.parse\|structuredClone` (scripts/constitution) | 0 | — |
| M-002 | `node dist/supervisor` (glossary) | 1 | docs/glossary.md:628 |
| M-002 | `out/main/[a-z-]+` (specs) | 5 | 002 tasks.md:45 / quickstart-results.md:14,21,117,398 |
| M-003 | `reap` (plan) | 6 | plan.md:146,159,172,174,214,240 |
| M-004 | `fork し直\|起こし直` (plan/tasks) | 4 | plan.md:167,201 / tasks BE-006, BE-020 |
| M-005 | `onClosed` (plan/tasks) | 0 | — |
| M-006 | `e2e-capability` (tasks) | 1 | tasks BE-008 |
| L-001 | `folderId` (plan) | 1 | plan.md:188 |
| L-002 | `before-quit` (plan/tasks/spec) | 4 | plan.md:174,177 / tasks BE-021 / spec FR-014 |
| L-003 | `dependency-nodes` (eslint) / `agents-not-to-core` (depcruise) | 0 / 0 | — |

## Verdict

- Critical: 0
- High: 2
- Medium: 6
- Low: 3
