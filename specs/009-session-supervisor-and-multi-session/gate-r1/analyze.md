## Specification Analysis Report — `specs/009-session-supervisor-and-multi-session/` (Track A / analyze)

対象: spec.md / plan.md / tasks.md / checklists/requirements.md
参照: constitution.md、session charter、glossary、ADR (0006 / 0010 / 0018 / 0023 / 0030 / 0034 / 0036 / 0041)、005 / 008 spec、`scripts/constitution/check.mjs`・`allowlists.mjs`、`eslint.config.mjs`、関連ソース (`run-state.ts` / `sdk-agent-session.ts` / `session-ipc.ts` / `session-launch-service.ts`)
`.specify/extensions.yml` の hook 確認と、スクリプトの実行は指示どおり行っていない。

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency | HIGH | spec.md FR-004 (L157)・Key Entities (L215)・SC-004 / plan.md domain 節 (L129)・renderer 節 (L188) | spec は「要約に載せるのは sessionId・run-state・理由キー**だけ**」と書いている。一方 plan の `SessionStatusSummary` は `claudeAlive` を持ち、renderer がそれを「閉じる」可否 (US-2 AC6) と同一フォルダ警告の集合に使っている。spec と plan が直接食い違っている | spec の FR-004 / Key Entities / SC-004 に `claudeAlive` (boolean。会話由来ではない) を明記する。`done` が 2 つの意味を持つ以上、renderer にはこのフラグが要る |
| I2 | Inconsistency | HIGH | spec.md FR-004 (L159)・SC-004 / plan.md `coalesceSummaries` (L131) / `run-state.ts:106-108` | spec は「終端状態 (`error` / `done`) は畳んでも失われない」と書いている。plan が後続の非終端で上書きしないのは `error` と `claudeAlive:false` だけである。実装では `done` に send-prompt が来ると `running` へ遷移するので、spec のとおりに実装すると `done` が古いまま残る | spec を「`error` と理由キー、`claude` の終了 (`claudeAlive:false`) は失われない」に直す。`done` の扱い (最新に畳んでよい) を明記する |
| U1 | Underspecification | HIGH | spec.md FR-005 (L164)・Edge Cases L132 / plan.md L127・L170-171・L131 | 枠の計上が「`claude` の生存」と「`launching` から数える」の 2 つで定義されている。plan では registry に入れた時点で `reserved -= 1` になるが、wsl.exe の spawn 報告より前の `claudeAlive` の初期値が決まっていない。初期値を false にすると、`coalesceSummaries` の「false を上書きしない」規則で false のまま固定されうる。そうなると launching 中のセッションが枠から外れ、11 本目が通る (SC-001 違反) | registry のフラグを「枠を占有中」の意味で定義し、登録時点で true、`claude` の exit か終端でだけ false にする。畳み込み規則は「true→false の遷移を保持する」とする。BE-007 / SH-004 に「launching 中 (spawn 前) は計上される」境界テストを足す |
| I3 | Inconsistency | HIGH | spec.md FR-002 (L151) / plan.md agents 節 (L143, L151) / AD-034 §1 | FR-002 は「調停役スレッドは本文をパースも **deserialize も**しない」と書いている。しかし plan の中継形では、worker が `parentPort.postMessage({kind:'event', payload:string})` で送るので、調停役スレッドでの structured clone deserialize (文字列のコピー) は避けられない。stdio 経路では payload を JSON 行に埋め込むため、エスケープ処理も調停役側に掛かる | FR-002 / SC-002 を「`JSON.parse` も構造の復元もしない (文字列としての clone コピーは許容。上限は X-1 の累積バイト上限)」に直す。または SH-000 (2) の直送形を必須にする。コピーの費用は SC-003 の数 MB ケースで測る |
| I4 | Inconsistency | HIGH | spec.md SC-002 / plan.md 機械強制表 (L213) / tasks.md BE-013・SH-010 | 「`supervisor.ts` / `supervisor-core.ts` に `JSON.parse` 0 件」という検査は 2 方向に破綻する。supervisor.ts は transport から文字列行で届く launch / control (AD-030 §5) を decode しなければならないので、検査が落ちる。逆に decode を別モジュール (例: `agents/protocol.ts`) へ移すと、検査は形の上だけ通る (AD-031 が記録した弱点と同じ形) | control の decode をどこに置くかを plan で決める。本文は branded な不透明型 (例: `OpaqueBody`) として型で縛り、「本文が `JSON.parse` に渡らない」ことをテストで示す。grep 検査の限界は SC-002 に正直に書く |
| K1 | Constitution / 計測経路 | HIGH | spec.md SC-009 (L246) / constitution Principle VII Verification / check.mjs (項目 1〜17) | SC-009 が書く「`check:constitution` の Principle VII 項目 (electron / ネイティブ import の禁止)」は存在しない。Principle VII の正本は `eslint.config.mjs` の許可行列と、`.dependency-cruiser.js` の `agents-not-to-electron` / `agents-not-to-native` である。このままでは計測できない受け入れ条件になっている | 計測経路を `lint` + `depcruise` (+ 単独起動の Vitest) に直す |
| I5 | Inconsistency | HIGH | plan.md ADR 節 (L194)・R-01 (L220)・Technical Context「未確認」 / spec.md Assumptions L228 / tasks.md SH-000・SH-001 | plan は AD-043 を「design-gate 通過で accepted」としている。しかし成立性 (Worker 内で `query()` / spawn が動くか、port を Worker へ transfer できるか) を確かめる SH-000 は gate の後に走る。R-01 は「(1) が成立しなければ AD-043 を書き直す」と書いており、accepted ADR は不変 (FR-015) という前提と衝突する。加えて spec Assumption は「plan の冒頭で実測する」と書いているのに、plan は実測していない | SH-000 を design-gate PASS の前に spike として実施する。それが無理なら、AD-043 は SH-001 (SH-000 の後) で accepted にする、と plan を直す。spec Assumption の文言も実際の手順に揃える |
| K2 | Constitution / 機械強制 | MEDIUM | plan.md 機械強制表 L213 / tasks.md SH-010 | 「`check.mjs` の Principle IX の検査に加える」と書いているが、check.mjs に IX の項目は無い。実際には新しい項目 18 を作る作業であり、`tests/rule-fixtures/expected.mjs` (test:rules) の更新と、根拠となる ADR の記載が要る | SH-010 を「項目 18 の新設 + 期待表の更新 + AD-043 を根拠として記載」に書き直す |
| I6 | ADR 引用 | MEDIUM | spec.md 位置づけ (L37) / plan.md AD-043 Decision 1 (L197) / AD-023 §6 (L311-325) | AD-023 §6 が per-session を選んだ根拠は、パースのブロックだけではない。クラッシュ隔離 (Electron の "crash prone components") と、AD-010 の単独起動がセッションと 1:1 で自然になる点も挙げている。spec と AD-043 は前者 1 つだけを読み替えている | AD-043 で §6 の 3 根拠をすべて扱う。クラッシュ隔離を失う代償は US-4 / Consequences と結びつける |
| I7 | Inconsistency / Coverage | MEDIUM | spec.md FR-007・SC-005 / plan.md L154 / tasks.md BE-010・BE-002 / `session-ipc.ts:201-202` | spec は requestId の不正を「拒否する」と書くが、plan は worker で「何もしない」としている。main は requestId を検証しない (既存コメントのとおり)。にもかかわらず BE-010 が requestId の負例と `randomUUID` 由来の単体を main の IPC 側 (`session-ipc.ts`) に置いている。肝心のロジックは BE-002 にあり、BE-002 にはテストが挙がっていない | requestId の負例と乱数性のテストを BE-002 (session-core / sdk-agent-session) に移す。「拒否」の観測形 (SDK に何も効かない / 通知の有無) を spec か plan で決める |
| I8 | Ambiguity | MEDIUM | spec.md FR-005 L164「停止 (強制終了)」/ US-2 AC5・FR-011「停止 = 中断 / 強制終了」/ US-1 AC2「止めれば起動できる」 | 「停止」の意味が箇所によって違う。中断だけでは `claude` が生きたままなので枠は空かない。それなのに `session-limit` の導線は「止めれば起動できる」と案内する | 枠を解放するのは強制終了か `error` だけ、と明記する。`session-limit` の文言と導線もそれに合わせる (FE-003 / FE-004) |
| I9 | Inconsistency | MEDIUM | spec.md FR-015 L203 / plan.md 申し送り #19-#22・L203 | spec は許可リストの「登録先の付け替え」を AD-043 の根拠で行うと書いている。plan は「名前を維持し、コメントと標準モジュールの許可だけを変える」としている | spec の文言を plan の実際の作業 (付け替えなし・コメント更新・`node:worker_threads` / `node:crypto` の許可) に揃える |
| U2 | Underspecification | MEDIUM | spec.md Edge Cases L138 / plan.md `launch` の手順 (L170) / tasks.md BE-007 | plan の launch 手順は「予約 → prepareLaunch → registry に登録」で終わっている。その後の supervisor の fork / launch が失敗したときに registry から外して枠を返す手順が書かれておらず、BE-007 のテスト一覧にも無い | 手順とテストに「fork 失敗時の枠の解放 + 理由付きの拒否」を足す |
| C1 | Coverage | MEDIUM | spec.md SC-006 (同一フォルダ警告) / tasks.md FE-003・FE-013・SH-020 | SC-006 は同一フォルダの警告と「起動は有効のまま」を計測対象にしているが、FE-013 にも SH-020 にもテスト項目が無い | FE-013 に component テストとして足す |
| C2 | Coverage | MEDIUM | spec.md FR-003 L152 / X-1 SC-007 (データ経路からの制御発行) / tasks.md BE-005・BE-013 | 中継形では port1 を supervisor が持つ。supervisor が port から入ってくるメッセージを受理しないことを保証するタスクもテストも無い | BE-005 に「port の inbound を無視する」を、BE-013 にその負例を足す |
| U3 | Underspecification | MEDIUM | tasks.md BE-012 / plan.md E2E (L190) / constitution VIII の `e2e-capability` (`CLOSTA_E2E`) | fake `query()` の差し込み口を「entry の引数」で受けるとし、詳細は「SH-000 (4) の結果で決める」としている。しかし SH-000 (4) はビルド成果物の解決を確かめる項目であり、差し込み口とは関係しない。Electron 下の E2E で stub supervisor をどう差し込むかも未定である。本番で無効化されることの保証 (security) が無い | plan で差し込み方式を決める。既存の `!app.isPackaged && CLOSTA_E2E` に倣うか、引数方式なら本番 entry で無効になる理由を書く |
| T1 | Terminology | MEDIUM | glossary `AgentSession` (L40-47)・`SessionEvent` (L532)・`FailureReason (起動系)` (L271「9 種」) / tasks.md SH-002 | BE-001 で `stop()` を削除し、BE-002 で worker_threads 化するので、glossary の `AgentSession` の定義 (stop / module worker / parentPort 制御) が古くなる。`supervisor-exited` を足すと理由キーは 10 種になる。SH-002 の対象にこれらが入っていない | SH-002 に AgentSession / SessionEvent (中継の経路) / FailureReason の件数を足す |
| T2 | Terminology | MEDIUM | spec.md Key Entities L215 / glossary `SessionSummary（セッション要約行）` (L574) | 新しく入る「状態の要約 (SessionStatusSummary)」は、既存の canonical な「セッション要約行 (SessionSummary。R-2 の一覧行)」と名前が紛らわしい | SH-002 で Counterexamples に両者の違いを書く。名前を変える (例: `SessionStatusUpdate`) ことも検討する |
| C3 | Coverage | LOW | spec.md SC-004「要約 DTO の全フィールド走査」/ tasks.md SH-004・BE-011 | 会話由来の文字列が要約に 0 件であることを確かめる全フィールド走査が、タスクに明記されていない | SH-004 の単体に足す |
| C4 | Coverage | LOW | spec.md US-4 AC1 (`wsl.exe` の異常終了) / US-1 AC6 (承認待ちが他を止めない) / tasks.md BE-023 | BE-023 が扱うのは Worker の例外だけである。`wsl.exe` の異常終了と、承認待ちセッションの独立性を確かめるテストが無い | BE-023 にケースを足す |
| U4 | Ambiguity | LOW | plan.md L143 | stdio 経路の「payload は文字列のまま埋め込む」が、JSON 文字列としてエスケープするのか、生の JSON を埋め込むのか読み取れない | 行の形式を例示して決める |
| U5 | Underspecification | LOW | plan.md L176・L188 | LaunchDialog は稼働中セッションの folderId の集合を要るが、handshake の `label` が持つのは `{folderName, runtimeLabel, startedAt}` だけである | `label` (または registry の DTO) に folderId を足す |
| T3 | Terminology | LOW | spec「セッション専用スレッド / セッションスレッド」・plan「worker thread / Worker / supervisor entry = 調停役スレッド」・glossary「module worker」 | スレッドの呼び名が文書ごとに揺れている (plan 申し送り #6 の統一方針が守られていない) | 本文では「調停役スレッド / セッションスレッド」に統一し、Worker は実装語として括弧で添える |
| T4 | Terminology | LOW | charter Key concepts L103・Scope L44 / tasks.md SH-090 | charter の supervisor の定義行が SH-090 の更新対象に入っていない | SH-090 に足す |
| O1 | Ordering | LOW | tasks.md 依存と順序 #7・SH-010 / BE-002・BE-005 | eslint で `node:worker_threads` / `node:crypto` を許可する作業がコードの後に置かれているため、実装中は lint が赤になる | eslint の許可部分だけを SH-003 / SH-004 と同じ先行段に移す |
| K3 | Constitution Check | LOW | plan.md Constitution Check 表 | I / II / X / XII の行が無い。XII は UI 系 feature の完了条件なので、該当しない理由を明記すべきである | 4 行を足す (N/A とその理由) |
| S1 | Underspecification (Principle V 周辺) | LOW | plan.md Constitution Check V 行 / X-1 SC-006(b) | 1 つのプロセスに全セッションの導出 env (Provider の資格情報) が同居する。Worker 間で env を分離すること (`SHARE_ENV` を使わない・`process.env` に書かない) が明記されていない。X-1 SC-006(b) の spawn 点 (`fork` + `spawn`) に Worker への message 受け渡しが加わる | V 行に分離の規則を書く。SC-006(b) の負例テストを新しい経路に向け直す (SH-011) |
| L1 | Duplication / 文書整合 | LOW | checklists/requirements.md L36 / spec.md Assumptions | checklist は [ASSUMED] を 4 件と数えているが、spec には 5 件ある (UI element の選定が漏れている) | 件数を直す |
| L2 | ADR 引用 | LOW | spec.md Dependencies L255-262 / plan.md (AD-030 §5 を使用) | plan が根拠に使う AD-030 (transport 1 モジュール・常駐プロセス・落ちたら作り直す) が spec の関連 ADR に無い | spec の Dependencies に AD-030 を足す |

**ADR 引用の確認結果 (問題なし)**: AD-006 (utilityProcess)、AD-010 Decision (`node dist/supervisor.js`・標準入出力・ネイティブ非依存)、AD-018 §3 / Consequences (kill ハンドルは supervisor が持つ)、AD-023 §6 / Open Question (100ms・背圧)、AD-030 §5 (経路選択を `transport.ts` に閉じる)、AD-034 §1 (port transfer・一方向)、AD-036 §1 / §2 / §3、AD-041 は、いずれも引用した節が実在し、主張と内容が合っている。X-1 の FR-002 / 007 / 010 / 015 / 016 / 017 / 019 / 020 / SC-005 / SC-011、X-4 の US-1 AC7 と Edge Cases L171 の `session-active` も実在する。AD-043 は未使用の番号で、衝突は無い。plan の「確認済みの事実」(`run-state.ts:71/106`、`sdk-agent-session.ts:481`) もソースと一致した。

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 単一 supervisor + スレッド / 単独起動 | ✅ | BE-002, BE-003, BE-005, BE-006, BE-012 | 成立性は SH-000 次第 (I5) |
| FR-002 スレッド内パース / 調停役は解釈しない | ✅ | BE-002, BE-005, BE-013 | I3 / I4 |
| FR-003 本文は port で直送・一方向 | ✅ (一部) | BE-005, BE-006, FE-001, BE-013 | inbound の無視が未カバー (C2) |
| FR-004 要約のバッチ化・検証 | ✅ | SH-004, BE-004, BE-011, BE-008 | I1 / I2 |
| FR-005 上限 10・原子的予約・`session-limit` | ✅ | SH-003, BE-001, BE-007 | U1 / U2 / I8 |
| FR-006 X-4 経路の再利用・同一フォルダ警告 | ✅ | FE-003, FE-001, SH-011 | 警告のテストが無い (C1) |
| FR-007 宛先・requestId | ✅ | BE-002, BE-004, BE-010 | テストの置き場がずれている (I7) |
| FR-008 全 port 保持・表示中を待たせない | ✅ | FE-001, FE-012, FE-020 | |
| FR-009 一覧 UI | ✅ | FE-011, FE-012, FE-004 | |
| FR-010 入力の分離 | ✅ | FE-010, FE-002, FE-013 | |
| FR-011 停止・閉じる | ✅ | FE-011, FE-001 | I8 |
| FR-012 失敗の閉じ込め | ✅ | BE-004, BE-023, FE-030 | C4 |
| FR-013 supervisor の異常終了・pid 回収・起こし直し | ✅ | BE-020, BE-022, BE-006 | |
| FR-014 終了時の順序 | ✅ | BE-021 | |
| FR-015 AD-043 | ✅ | SH-001 | I5 / I6 / I9 |
| FR-016 glossary / docs | ✅ (一部) | SH-002, SH-090, FE-004, SH-091 | T1 / T2 / T4 |
| SC-001 | ✅ | BE-007, SH-020 | U1 |
| SC-002 | ✅ | BE-013, SH-010 | I4 / K2 |
| SC-003 | ✅ | FE-020, SH-022 | |
| SC-004 | ✅ (一部) | SH-004, BE-004, BE-011 | C3 |
| SC-005 | ✅ | BE-010, BE-004 | I7 |
| SC-006 | ✅ (一部) | FE-013, SH-020 | C1 |
| SC-007 | ✅ | BE-020, BE-023 | |
| SC-008 | ✅ | BE-021, BE-022, SH-022 | |
| SC-009 | ✅ | BE-012 | 計測経路の誤り (K1) |
| SC-010 | ✅ | SH-011, SH-021 | |

**Constitution Alignment Issues**: NON-NEGOTIABLE (I〜VIII) の MUST に違反する箇所は見つからなかった。CRITICAL は 0 件。ただし計測経路の誤りが 1 件 (K1: Principle VII の検査が check.mjs にあるとしている)、機械強制の前提の誤りが 1 件 (K2: Principle IX の既存項目が無い)、Constitution Check の欠行がある (K3)。Principle IX (Standard) については、FR-002 の「deserialize もしない」が中継形と両立しない (I3)。

**Unmapped Tasks**: 無し。SH-021 / SH-022 / SH-091 は横断的な検証・追随作業で、FR-016 / SC-003 / SC-008 / SC-010 に紐づく。

### Metrics

- Total Requirements: 26 (FR 16 + SC 10)
- Total Tasks: 38 (SH 12 / BE 16 / FE 10)
- Coverage %: 100% (タスクが 1 件以上ある要件 26/26。うち一部カバーが 5 件: FR-003 / FR-006 / FR-016 / SC-004 / SC-006)
- Ambiguity Count: 3 (I8, U3, U4)
- Duplication Count: 1 (L1)
- Critical Issues Count: 0 (HIGH 7 / MEDIUM 11 / LOW 10)
