# platform-boundary-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-02T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004 / SC-001: 強調・件数・live region (renderer 内。境界への影響なし)
  - FR-005〜FR-007 / SC-002: 経過時間・直近の活動・**枠の使用数** (FR-007 は main の上限判定と食い違いうる)
  - FR-008 / FR-009 / SC-003: compact / comfortable (compact でランタイムを行から外す → isolation charter の可視性と関係する)
  - **FR-010 / SC-006**: renderer で閉じる・main / supervisor / IPC の差分 0
  - **FR-011 / SC-004**: 監視ビューの全情報 (強調を含む) を出した状態での E2E
  - **FR-012 / SC-005**: `perf/` 実機計測 (実アプリ・`CLOSTA_E2E` なし・WSL 内の実 `claude` 10 本)
  - FR-013: 記録の追随 (直接の影響なし)
- touched files に該当する charter / Confirmation:
  - `docs/domains/isolation/charter.md` Journey 2 / 不変条件「隔離状態は一目で分かること」/ KPI「隔離の可視性」(対象が「セッション一覧」)
  - AD-038 D2 (e2e を src のグラフから分離。`not-to-test` の prefix) / D3 (credential-free) / Confirmation
  - AD-043 Decision 3 (枠は予約から `claudeAlive` の終わりまで) / Decision 5 残余 / Confirmation (孤児 0 は「`wsl.exe` と WSL 内 `claude`」で観測)
  - Constitution Principle VI Verification (検証範囲は `src/` に限らない。除外はファイル単位で行う。AD-024 #5)
  - `scripts/constitution/allowlists.mjs` `SCAN_ROOTS` / `.dependency-cruiser.js` `not-to-test` / `eslint.config.mjs` ignores
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。申し送りとして、`perf/` は実資格情報が載った未パッケージの実アプリを Playwright の制御下 (デバッグポート付き) で起こす。この面は A 観点で見ること
- B. 入力検証 / injection / CSP / 暗号: 該当なし: 直近の活動の plain text 化 (XSS 境界) は security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:2 Low:1

### 固有観点 (PB-1〜PB-7)

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: 該当なし。本 feature は新しい IPC・永続化・設定ファイルを持たない (data-model §3)。直近の活動に出る tool 入力 (`argsText` / `pending.input`) には、ランタイム名前空間のパス文字列が含まれうる。ただし表示用の plain text に畳むだけで、再 branding もパス解決もしない (data-model §2 `toActivityLine`)。live region の文も作業フォルダの「表示名」を使い、パスではない
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。追加するストアの値 (`statusSince` / `density`) のキーは sessionId か、全体で 1 つの表示状態であり、「現在のランタイム」を保持しない。perf はランタイムを表示名 (`CLOSTA_PERF_RUNTIME`) で選ぶ。WSL のディストロ名は一意なので、現時点で衝突しない
- **PB-3 (`capabilities` の虚偽表明)**: 該当なし。`capabilities` の表明・判定に触れない
- **PB-4 (権限ゲートの迂回)**: 該当なし (確認済み)。実機計測は UI の起動ダイアログを通る。選べるのは `SAFE_PERMISSION_MODES` (`default` / `plan` / `dontAsk`、`src/domain/session/launch-config.ts:21-25`) だけで、境界では `assertSafePermissionMode` が値を再確認する。perf が capability を直接叩いても Auto / bypass は通らない。承認カードへの自動応答は M-002 の推奨に含めた
- **PB-5 (多段パス変換の欠落)**: 該当なし。パス変換を行わない (Docker endpoint にも触れない)
- **PB-6 (実質的な永続環境の構築)**: L-002 / M-002 を参照。実機計測はディストロ・パッケージ・設定を変えない。ただし実 `claude` が残す transcript と、プロセスの残留の扱いが手順に書かれていない
- **PB-7 (lint ルール自体の網羅性)**: M-003 を参照。新設の `perf/` は、check.mjs・depcruise・constitution の lint のいずれの走査範囲にも入らない

## スコープ要約

O-1 は、X-5 の稼働中セッション一覧 (`RunningSessionList.tsx` / `thread-list.aui.tsx`) を renderer の中だけで監視ビューに拡張する。強調・承認待ちの件数・経過時間・直近の活動・枠の使用数・compact / comfortable を足す。IPC・状態通知・main・supervisor は変えないと主張している (FR-010 / SC-006)。加えて次の 2 つを置く。

- X-5 SC-003 の E2E を、監視ビューの全情報を出した状態で流す (FR-011)
- `perf/real-sessions.spec.ts` + `playwright.perf.config.ts` を新設し、`CLOSTA_E2E` なしで実アプリを起動して WSL の実 `claude` 10 本で計測する (FR-012)

本レビューの論点は 4 つ。

1. renderer で閉じるという主張は、FR-011 の E2E と両立するか
2. 実機計測は、Principle VI (永続環境) と、AD-038 D3 / AD-043 のプロセス境界を侵さないか
3. 枠の数え方は、main の判定 (`countOccupying` + `reserved`) と合うか
4. 新設ディレクトリは、機械強制の走査範囲に入るか

結論として、renderer 側のロジック (`statusSince` / 導出の純関数 / 間引き) は IPC・main を変えずに実現できる。ただし FR-011 の「強調」を E2E で出すには main 側の stub を変える必要があり、FR-010 / SC-006 と両立しない (H-001)。

## Findings

### [High] FR-011 の「強調」込みの E2E は、main 側の stub を変えない限り実現できず、FR-010 / SC-006 (main の差分 0) と両立しない。tasks は強調を黙って落としている (H-001) (scope: feature)

- **観察**:
  - `specs/010-session-monitoring-view/spec.md:183` (FR-011) は、E2E を「comfortable で監視ビューの全情報 (**経過時間・直近の活動・強調**) を出した状態」で流すと定める。同 `:223` (SC-004) も「全情報を出した状態」と書く
  - 一方で、同 `:177-178` (FR-010) と `:225` (SC-006) は「main と supervisor のコードの差分が 0 件」を要求する
  - E2E の stub は main 側のコード (`src/main/app/e2e-capability.ts`) である。stub が流すのは text の assistant メッセージだけ (`:128` / `:172` / `:187`)。`permission-request`・`tool-call` の part・`awaiting_permission` / `error` の状態は 1 件も出さない
  - そのため、承認待ち・失敗の強調、承認待ちの件数、tool の直近の活動 (FR-006 の 1・2 番目の分岐) は E2E の負荷の中で描画されない
  - `tasks.md:75` (SH-031) の assert は「経過時間と直近の活動が出ていること」だけで、強調を含まない。FR-011 の要件が tasks で黙って縮んでいる
- **同種事象探索**: `awaiting_permission|state: 'error'|'error'` を `src/main/app/e2e-capability.ts` で検索 → 0 件。`permission-request|tool-call` を同ファイルで検索 → 0 件 (text 以外を出す経路は無い)
- **リスク/影響**: 解き方は 2 つしかなく、どちらを選んでも spec のどこかが偽になる。
  - (a) stub を拡張する → `src/main/` に差分が出て、SC-006 が満たせない。renderer で閉じるという主張も崩れる
  - (b) stub を変えない → FR-011 / SC-004 の「強調込みの負荷」は未計測のまま緑になる

  強調の行は帯・アイコン・live region を伴う。負荷の中での再描画コストは、最も見たい部分である。
- **推奨アクション**: どちらかに決めて spec を揃える。
  - (1) FR-011 / SC-004 から「強調」を外し、「経過時間・直近の活動 (text の分岐)」に限定する。強調と tool の分岐の描画コストは、component テストと SC-005 の実機計測で見ると書き換える
  - (2) `e2e-capability.ts` を変えるなら、FR-010 / SC-006 の「main のコードの差分 0」を「本番の composition (`createComposition`) と IPC・preload・supervisor の差分 0。E2E の stub (`!app.isPackaged && CLOSTA_E2E`) は除く」に書き直す。stub の拡張は AD-038 D3 の stub 契約 (`IpcDependencies` の形を変えない) の範囲に収める
  - どちらを選んでも、SH-031 の assert を FR-011 と一致させる
- **根拠**: spec FR-010 / FR-011 / SC-004 / SC-006、AD-038 D3 (stub 注入は main 側の 1 分岐)
- **scope 根拠**: feature の spec / tasks の文面上の不整合

### [Medium] 枠の使用数を domain の単一の locus (`countOccupying`) を使わずに再実装しており、renderer が知っている起動要求中の予約も数えない (M-004) (scope: feature)

- **観察**:
  - main は `countOccupying(registry.values()) + reserved` で判定する (`src/main/app/session-launch-service.ts:124` / `:189-190`、`src/domain/session/concurrency.ts:19-33`)。domain 側の注記は「FR-005 の中核規則を domain に置く」(`concurrency.ts:16-17`)
  - plan の `slotUsage` は `viewOf(state, id).ended === false` を数え直す (`specs/010-session-monitoring-view/data-model.md:42`)。`ended` は `status?.claudeAlive === false` (`src/renderer/src/features/session/session-view.ts:47`) なので値は一致する。しかし同じ規則の判定箇所が 2 つになる
  - renderer は、起動要求の応答を待つ間を `launch.phase === 'launching'` として保持している (`running-session-store.ts:235-242`)。main の `reserved` に当たる値だが、`slotUsage` はこれを数えない。spec `:133` の Edge Case はこの食い違いを「瞬間的」と許容しているだけである
- **同種事象探索**: `MAX_CONCURRENT_SESSIONS` を `src/` で検索 → 4 件 (`labels.ts:2,35`、`concurrency.ts:13,32`)。`countOccupying|canReserve` → main で 2 箇所 (`session-launch-service.ts:12,124,189`)。renderer 側の使用は 0 件 (本 feature で初めて renderer が数える)
- **リスク/影響**: 9 本稼働中に 1 本を起動している間、表示は「9/10」で、FR-007 の上限の案内も出ない。その間に 2 本目を起動すると、main は `session-limit` で拒否する。また、枠の定義 (glossary の Concurrency limit) が後で変わったとき、renderer 側の判定だけが置き去りになる
- **推奨アクション**:
  - `slotUsage` を `countOccupying(order.map((id) => ({ claudeAlive: statuses[id]?.claudeAlive ?? true })))` で組む。`launch.phase === 'launching'` なら +1 する (main の `reserved` に揃える)
  - data-model §2 の `slotUsage` の定義をそのように書き換え、SH-003 の観点に「起動要求中は +1」を足す
  - spec Edge Case `:133` は、「残る食い違いは再読み込み直後と、`claude` の終わりの通知が届くまでに限る」と狭める
- **根拠**: AD-043 Decision 3、`concurrency.ts` の locus 規則、spec FR-007
- **scope 根拠**: renderer の導出 (data-model / SH-003) で直せる。owner の重なり: 業務不変条件として architecture-reviewer とも関わる。呼び出し側の明示依頼により本 reviewer が扱った

### [Medium] compact の行の表示項目を固定したことが、isolation charter の「隔離状態は一目で分かること」(対象: セッション一覧) と将来衝突する (M-005) (scope: feature)

- **観察**:
  - `spec.md:170-172` (FR-008) は、compact の行を「状態・作業フォルダの表示名・経過時間」に固定し、ランタイムを含む他の情報はフォーカスかポインタでだけ読めるとする。`research.md:39` は、それを `title` / `aria-describedby` に退避すると決めている
  - isolation charter `docs/domains/isolation/charter.md:71-72` (Journey 2) は「ユーザがセッション一覧を見る → 隔離されているセッションにはバッジが付き、bypassPermissions のものは視覚的に区別される」と定める
  - 同 `:118` の不変条件は「隔離状態は一目で分かること。推測する必要があってはならない」、`:127` の KPI は「隔離状態が表示されないセッションが 0」である
  - 隔離バッジは未実装 (I-x) なので、現時点の違反ではない。しかし spec は「セッション一覧」の compact の 1 行に出すものを列挙して閉じており、隔離状態の置き場を残していない。Out of Scope (`:236-246`) にも言及がない
- **同種事象探索**: `隔離|isolation|バッジ` を `specs/010-session-monitoring-view/` で検索 → 0 件
- **リスク/影響**: I-x で隔離バッジを入れるとき、O-1 の FR-008 (compact の項目の固定) を書き換える必要が出る。あるいは compact でバッジがフォーカス時の説明に押し込まれ、KPI「隔離の可視性」を満たさない実装が FR-008 準拠として通る
- **推奨アクション**: FR-008 の compact の項に次の注記を 1 行足す。「compact で行から外してよいのはランタイム名・起動時刻・直近の活動であり、**隔離状態 (isolation charter Journey 2 のバッジ。I-x で導入) は compact でも行に出す**」。あわせて SH-090 の roadmap の I 行 (隔離バッジを持つ feature) に「O-1 の compact の行に隔離バッジの枠を出す」を申し送る
- **根拠**: `docs/domains/isolation/charter.md:71-72,118,127`、Constitution Principle III Manual (隔離状態の可視性)
- **scope 根拠**: spec FR-008 の文面で直せる

### [Medium] 実機計測が「実アプリ」で動いたことの保証が、env の不在にしか依存していない (M-001) (scope: feature)

- **観察**:
  - `research.md:49` と `tasks.md:76` は、実アプリを `CLOSTA_E2E` を渡さずに起動するとだけ定める
  - 既存の起動ヘルパ `e2e/support/launch.ts:29-33` は `env: { ...process.env, CLOSTA_E2E: '1' }` で親の env を丸ごと継承する
  - perf の起動を同じ形 (`...process.env`) で書いた場合、手元のシェルに `CLOSTA_E2E=1` が残っていると stub の composition が起動する。stub は `!app.isPackaged` の条件を満たすので有効になる
  - その場合、偽の supervisor 接続で計測した値が「実 `claude` 10 本」の値として quickstart-results に記録される。stub の起動経路も 10 本の起動と 30 秒の打鍵を完走するため、計測は失敗しない
- **同種事象探索**: `CLOSTA_E2E` を `e2e/` で検索 → 起動ヘルパ 1 件 (`e2e/support/launch.ts:31`)。spec・plan・tasks に「stub でないことの確認」の記述は 0 件
- **リスク/影響**: SC-005 (charter KPI の実機計測) が偽の緑で閉じる。X-5 から繰り越した計測が二度空振りする
- **推奨アクション**: SH-032 に次の 2 点を足す。
  - (1) perf の起動では、env から `CLOSTA_E2E` を**明示的に削除**する
  - (2) 起動後、本物の composition であることを assert する。例: `CLOSTA_PERF_RUNTIME` のランタイムが一覧にあり、stub が seed するフォルダ・ランタイムの名前が無いこと

  結果の出力には「composition: real」を含める。
- **根拠**: AD-038 D3 (stub の注入は `!app.isPackaged && CLOSTA_E2E` で決まる)、spec FR-012 / SC-005
- **scope 根拠**: feature の tasks (SH-032) で直せる

### [Medium] 実機計測の後始末とプロセス残留の確認が、AD-043 の観測条件より弱い (M-002) (scope: feature)

- **観察**:
  - `quickstart.md:32` (V-3 の 5) は「終了後、`wsl.exe` が残っていないこと」を、正常に終わった後に、ホスト側だけで確かめる
  - AD-043 Confirmation (`docs/decisions/0043-...md:117`) は、孤児 0 を「`wsl.exe` と **WSL 内 `claude`** の数が起動前に戻った」ことで観測している
  - AD-043 Decision 5 の残余 (`:76`) は「ツール実行中に Worker だけが落ちた場合」に孤児が残りうるとして、X-6 に送っている
  - 本計測は、10 本が Glob / Read を**繰り返し続けている**状態 (`research.md:50`。終わりの条件の記述が無い) で窓を閉じる。perf spec の timeout、途中で失敗したときの後始末 (アプリ経由で全セッションを kill してから `app.close()`) も、手順に無い
  - 無効になった回 (spec `:135` / `quickstart.md:33`) の後の確認も、手順に無い
  - 承認を要するプロンプトに差し替えた場合 (`CLOSTA_PERF_PROMPT`) に、perf が承認カードへ応答しないこと (Principle III のゲートを自動で通らないこと) も明記されていない
- **同種事象探索**: `wsl.exe|孤児|後始末|teardown|timeout` を `specs/010-session-monitoring-view/` で検索 → 1 件 (`quickstart.md:32`。ホスト側・正常に終わった後のみ)
- **リスク/影響**: 強制終了 (Playwright のタイムアウト) の後に WSL 内の `claude` が残った場合、利用者のトークンを消費し続ける。AD-043 の「回収経路を持たない」という前提が成り立たない形を、確認しないまま見逃す
- **推奨アクション**: SH-032 と quickstart V-3 に次を足す。
  - perf spec の `finally` で、アプリの操作 (一覧の強制終了) で全セッションを止めてから `app.close()` する
  - test の timeout を明示する
  - 既定のプロンプトに繰り返しの上限回数を入れる
  - 承認待ちに入ったセッションがあった回は無効とし、perf は承認カードに応答しない
  - V-3 の 5 を「各回 (無効になった回を含む) の後に、ホストの `wsl.exe` と WSL 内の `claude` の数が起動前に戻ること」に改める
  - この確認を perf spec の中で自動化するなら、M-003 のとおり check.mjs の走査範囲の外になる点に注意する
- **根拠**: AD-043 Decision 5 / Confirmation、X-5 SC-008、Constitution Principle III
- **scope 根拠**: feature の quickstart / tasks で直せる

### [Medium] 新設の `perf/` が、check.mjs・depcruise の `not-to-test`・constitution の lint のいずれの走査範囲にも入らない (M-003) (scope: feature)

- **観察**:
  - `plan.md:161` は「`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/` は変更しない」とする
  - しかし `scripts/constitution/allowlists.mjs:12` は `SCAN_ROOTS = ['src', 'scripts']` で、`perf/` と `playwright.perf.config.ts` は Principle VI の項目 1〜7 (プロセス起動・`wsl.exe` の引数・特権コマンド) の走査対象にならない
  - `.dependency-cruiser.js:140-141` の `not-to-test` は prefix が `^(specs|tests|e2e)` である。AD-038 D2 が e2e について塞いだ src からの逆流入を、`perf/` については塞がない
  - `eslint.config.mjs:172-179` の ignores は `e2e/**` と `playwright.config.ts` を外すだけなので、`perf/**` と `playwright.perf.config.ts` は base の lint には掛かる。constitution のルール (`no-restricted-imports` ほか) は `files: ['src/**']` 限定 (`:428`) なので掛からない。e2e とは扱いが異なり、その差は plan に記録されていない
  - Constitution Principle VI の Verification は「検証範囲は `src/` に限らない (AD-024 #5)」と定めている。`perf/` は、本リポジトリで唯一、実資格情報で実 WSL・実 `claude` を動かす自動化コードである
- **同種事象探索**: `perf` を `scripts/constitution/allowlists.mjs` / `.dependency-cruiser.js` / `eslint.config.mjs` で検索 → 0 件。`e2e` → 3 件 (`.dependency-cruiser.js:138-141`、`eslint.config.mjs:169-177`)。e2e にも SCAN_ROOTS は掛かっていない (AD-038 D4 が死角として明記済み)
- **リスク/影響**: M-002 の後始末で perf に `wsl.exe` の直接呼び出しやプロセスの列挙を足しても、check.mjs 項目 2 / 3 / 7 は検出しない。AD-038 D4 は e2e の同種の死角を「死角」と明記して roadmap に owner 付きで登録したが、本 plan は「既存の規則で覆われる」としており、事実と異なる
- **推奨アクション**:
  - (1) `.dependency-cruiser.js` の `not-to-test` を `^(specs|tests|e2e|perf)` に拡張する (AD-038 D2 と同じ形)
  - (2) `SCAN_ROOTS` に `perf` を足す。足さないなら、plan の「機械強制の変更」表に `perf/` が check.mjs の死角であることを明記し、AD-038 D4 の roadmap 項目に `perf/` を併記する
  - (3) `playwright.perf.config.ts` / `perf/**` を lint の対象とするか e2e と同じく ignore するかを決め、表に記録する
  - plan `:161` の「上流 grep 0 件」は、走査範囲の網羅性の根拠にならない (grep したのは rule の中のモジュール名である)
- **根拠**: Constitution Principle VI Verification (AD-024 #5)、AD-038 D2 / D4、`allowlists.mjs:47-56` (ディレクトリを走査範囲の外に置かない)
- **scope 根拠**: feature の plan の「機械強制の変更」表と、同 PR の設定変更で直せる

### [Low] 実機計測の設定が CI で走らないことは慣行でしか守られていない (L-001) (scope: feature)

- **観察**:
  - CI は spec を名指しして `-c playwright.config.ts` で走らせる (`.github/workflows/verify.yml:139-159`)。`testDir: './e2e'` (`playwright.config.ts:16`) で perf から分離されている
  - しかし `playwright.perf.config.ts` が CI で読まれないことを止める機構は無い。plan は AD-038 D3 の「CI 経路の外に置く」を根拠にしている (`plan.md:67`)
- **同種事象探索**: `perf` を `.github/workflows/verify.yml` で検索 → 0 件
- **リスク/影響**: 将来 workflow に足された場合、CI に実資格情報を要する実行が入る (AD-038 D3 / Principle V)。現時点の実害は無い
- **推奨アクション**: `playwright.perf.config.ts` の冒頭に `if (process.env.CI) throw new Error('perf は CI で走らせない (AD-038 D3)')` を置く (1 行の機械ガード)
- **根拠**: AD-038 D3 / Confirmation
- **scope 根拠**: feature の新設ファイルで直せる

### [Low] 実機計測が利用者の WSL 内に実 transcript を残すことが手順に書かれていない (L-002) (scope: feature)

- **観察**:
  - `quickstart.md:8` は「登録済みの作業フォルダ」で計測するとし、3 回 (無効になった回を含めればそれ以上) × 10 本の実セッションを起動する
  - 実 `claude` は WSL 内の `~/.claude/projects/<encoded-cwd>/` に transcript を書く。これらは R-2 のセッション一覧に並ぶ
  - アプリがこれを消すことは Principle X (正本はアプリ外) に反するので、消さないのが正しい。ただし手順はこの副作用を利用者に伝えていない
- **同種事象探索**: `transcript|履歴|projects` を `specs/010-session-monitoring-view/quickstart.md` で検索 → 0 件
- **リスク/影響**: Principle VI の違反ではない (`claude` 自身の状態であり、アプリは環境を構築しない)。計測後、利用者の日常のフォルダのセッション一覧に 30 件以上の計測用セッションが混ざる
- **推奨アクション**: quickstart V-3 の前提に次の 2 点を足す。
  - 計測専用の使い捨てリポジトリを作業フォルダに使うことを推奨する
  - 計測で作られた transcript はアプリが消さないこと (Principle X)
- **根拠**: Constitution Principle VI / X
- **scope 根拠**: feature の quickstart で直せる

### [Low] SC-006 (境界が変わらない) の計測経路が差分レビューだけで、data-model §3 が挙げる preload が SC から抜けている (L-003) (scope: feature)

- **観察**:
  - `spec.md:225` (SC-006) の計測経路は「差分レビュー (変更が renderer と docs に閉じること)」で、対象は「IPC のチャネル一覧・状態通知のフィールド・main と supervisor のコード」である
  - `data-model.md:54` は「preload の capability」も変えないものとして挙げている。SC-006 には preload と `src/domain/` の明示が無い
- **同種事象探索**: `preload` を `specs/010-session-monitoring-view/spec.md` で検索 → 0 件
- **リスク/影響**: H-001 のように main 側を変える誘因があるのに、機械的な確認が無い
- **推奨アクション**: quickstart に次の機械確認を足し、SC-006 の対象に preload と domain を明記する。
  - `git diff --name-only <base>...HEAD -- src/main src/preload src/agents src/domain` が 0 件であること
  - H-001 で (2) を選ぶ場合は、例外を `src/main/app/e2e-capability.ts` の 1 ファイルに限ると明記する
- **根拠**: spec FR-010 / SC-006、data-model §3
- **scope 根拠**: feature の spec / quickstart で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `awaiting_permission\|state: 'error'\|'error'` / `permission-request\|tool-call` in `src/main/app/e2e-capability.ts` | 0 / 0 | (text のみ: `e2e-capability.ts:128,172,187`) |
| M-004 | `MAX_CONCURRENT_SESSIONS` in `src/`、`countOccupying\|canReserve` in `src/` | 4 / 3 | `labels.ts:2,35`、`concurrency.ts:13,19,31`、`session-launch-service.ts:12,124,189` |
| M-005 | `隔離\|isolation\|バッジ` in `specs/010-session-monitoring-view/` | 0 | — |
| M-001 | `CLOSTA_E2E` in `e2e/` | 1 | `e2e/support/launch.ts:31` |
| M-002 | `wsl.exe\|孤児\|後始末\|teardown\|timeout` in `specs/010-session-monitoring-view/` | 1 | `quickstart.md:32` |
| M-003 | `perf` in `allowlists.mjs` / `.dependency-cruiser.js` / `eslint.config.mjs` | 0 | (参考: `e2e` は `.dependency-cruiser.js:138-141`、`eslint.config.mjs:169-177`) |
| L-001 | `perf` in `.github/workflows/verify.yml` | 0 | — |
| L-002 | `transcript\|履歴\|projects` in `quickstart.md` | 0 | — |
| L-003 | `preload` in `spec.md` | 0 | — |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 3
