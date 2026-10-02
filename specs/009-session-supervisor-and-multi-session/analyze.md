## Specification Analysis Report — `specs/009-session-supervisor-and-multi-session/`（Track A / analyze、Round 3）

対象は spec.md / plan.md / tasks.md / checklists/requirements.md。照合に使った資料: constitution（Principle VII Statement L496、バージョニング方針 L905-913）、session charter、glossary、ADR 0006 / 0010 / 0018 / 0023 / 0030 / 0031 / 0034 / 0036 / 0041、005 / 008 の spec、ソース (`run-state.ts`、`agent-session.ts`、`sdk-agent-session.ts` L300-519、`session-launch-service.ts`、`session-spawner.ts`、`e2e-capability.ts` L240-313、`validate.ts`)。読み取り専用で実施し、スクリプトは実行していない。

### 結論

- **CRITICAL 0 / HIGH 1 / MEDIUM 4 / LOW 6。**
- **前回の HIGH 5 件はすべて解消した。前回の MEDIUM 18 件も主旨はすべて解消した。** ただし修正から新しい穴が 5 件派生している。
- **HIGH は 1 件（A1）。** セッションスレッドが `ended` を送って正常に終わったとき、`child-exited` が来ていなければ `claudeAlive` が false にならず、枠が漏れ続ける。spec FR-005 の条件 2「`wsl.exe` を起こす前のセッションスレッドの終了」を、plan は異常終了のときしか実装していない。
- カバレッジは 100%（形式上）。FR-005 の条件 2 と SC-005 の「終了済みの拒否」は部分カバー。

### 指摘一覧

| ID | Category | Severity | Location(s) | Summary | Recommendation | 前回との関係 |
|----|----------|----------|-------------|---------|----------------|------|
| A1 | 矛盾 / カバレッジ | HIGH | plan L172-176・L184・L186・L213 / spec FR-005 L189-193・Edge Cases L152・US-2 AC6 / tasks BE-008・BE-022 / `sdk-agent-session.ts:412` | plan は「`claudeAlive` を false にするのは `child-exited` か、`ended` が来ないままの Worker 終了だけ」としている。`ended` を受けた後の正常終了で `child-exited` が未着だと false にする経路が無い。該当: (a) launch のデコード失敗、(b) spawn 前の `uncaughtException`、(c) `launching` 中・spawn 前の kill、(d) spawn 後の `uncaughtException` (exit を待たずに `ended`)。どの場合も枠を占め続け、行も終了済みにならず「閉じる」が出ない。Edge Cases「launching のまま → 停止で枠を空けられる」と FR-014 の `killAll` が成り立たない | Worker が終わり方を問わず終了した時点で、まだ `claudeAlive:true` なら、pid 記録済み・`child-exited` 未着なら `killPid`、`spawning` だけなら回収不能を記録、のうえで false を送る。`uncaughtException` の経路も子の exit を待ってから `ended` にする。BE-022 / BE-008 に観点を足す | 新規（R2-H-05 / R2-M-14 の修正から派生） |
| A2 | 仕様の不足 / 矛盾 | MEDIUM | plan L185・L187・L213・L215・R-05 / spec FR-007 L204・FR-012 L231・SC-005 L295 / tasks BE-002・BE-010 | (1)「終了」が期限内に成功した、(2) `done` 中に `claude` が自分で終わった、(3) `wsl.exe` だけが異常終了した、の 3 つで Worker が `ended` を送るかが決まっていない。送らなければ Worker が残り `threadAlive` は true のまま、main は終了済みのセッションへの制御を通す (SC-005 と食い違い、R-05 とも合わない) | セッションスレッドは `child-exited` を受けた後 (`end` の成功を含む) に `ended` を送って終わる、と plan に書く。あるいは main の制御の条件を `threadAlive && claudeAlive` にする。BE-002 / BE-010 に負例を足す | 新規（R2-M-15 の修正から派生） |
| A3 | 矛盾 | MEDIUM | plan L173・L176・L208・L213・R-03 / spec FR-004 L183-184・SC-004 L294 / tasks BE-005・BE-013 | (1) plan は `child-exited` と Worker の異常終了の合成を「即時に送る」とするが、spec が窓の外を認めるのは supervisor の異常終了の合成だけ。(2) main の `onChildExited` / `onThreadEnded` は `acceptBatch` を通らず、世代・未知の sessionId の検査と単調性が効かない | 即時に反映するのは main の registry (枠の解放) だけとし、renderer へは次の `status-batch` で届けると書く。即時のメッセージも domain の受信規則を通す | 新規（R2-M-11 の残り） |
| A4 | ADR とのずれ / 仕様の不足 | MEDIUM | plan L190・L163-165 / AD-030 §5 / tasks BE-003・BE-014 | 直送の分岐を採ると、port を Worker に渡すのは誰か、標準入出力経路で Worker が本文をどこへ出すかが決まっていない。経路の違いを本体が知ることになり AD-030 §5 のずれが再び生じうる | 直送の分岐でも transport が「Worker に渡す出口」を作る形を plan に書く (parent-port では転送できる port、stdio では調停役スレッドが MessageChannel を作って行に中継) | 新規（R2-H-01 の残り） |
| A5 | Constitution との整合 | MEDIUM | plan Decision 6 L255・Principle I 行 L48 / tasks SH-092 / spec FR-016 L253 / constitution L496・L905-913 | Principle VII (NON-NEGOTIABLE) の Statement は `node dist/supervisor.js` で単独起動できることを求める。plan は worker のパスを必須の起動引数にし、SH-092 で PATCH として諮るが、バージョニング方針の PATCH の行は Statement の起動形の変更に当たらない。却下時の代わりの道も無い | 最小案: 起動引数を任意にし、省略時は supervisor entry と同じディレクトリの worker チャンクを使う (Statement を変えずに済む)。改定するなら MINOR 以上に分類し FR-016 に VII を足す | 新規（R2-M-09 の発展） |
| A6 | 用語 | LOW | spec FR-004 L181 / plan L172 | spec は「false にするのは調停役スレッドと main」、plan は「調停役スレッドだけ」 | plan を「supervisor 内では調停役スレッドだけ (main は supervisor の異常終了の合成で行う)」に直す | 新規 |
| A7 | 曖昧さ | LOW | tasks BE-022「5MB 相当の本文」/ spec FR-002 L170・SC-003 L293 | 調停役スレッドを 5MB の「本文」が通ることは無い | 「上限いっぱいの part を連続して流している間も」に直す。5MB の SDK 出力は quickstart に寄せる | R2-M-01 の残り |
| A8 | 仕様の不足 | LOW | plan L155 / `run-state.ts:29-47` | 「`end` は `kill` と同じ遷移」とあるが、`SessionAction` に `end` は無い | 「セッションスレッドは `end` で `transition({kind:'kill'})` を呼ぶ (`SessionAction` は足さない)」と明記する | 新規 |
| A9 | 仕様の不足 | LOW | plan L211-217 / spec FR-011 L224 | main の registry からエントリを消す契機が無い | `thread-ended` と `claudeAlive:false` の両方がそろったとき、または旧世代の supervisor-exited の処理後に消す、と書く | 新規 |
| A10 | カバレッジ | LOW | tasks SH-011・BE-009 / plan L223 / spec SC-010 | E2E 用の fake の `SupervisorConnection` と E2E での `prepareLaunch` / 表示名の解決の差し替えを作るタスクが明示されていない | BE-009 か SH-011 の成果物として名指しする | 新規 |
| A11 | カバレッジ | LOW | spec US-1 AC2 / tasks FE-003・FE-013 | `session-limit` で拒否されたときに入力が保たれることを確かめる観点が無い | FE-013 か FE-003 に 1 観点足す | 新規 |

### 前回の指摘の状況（R2 design-gate）

| ID | 状況 | 備考 |
|---|---|---|
| R2-H-01 | resolved | 中継の分岐は AD-030 §5 を守る形になった。直送の分岐の残りは A4 |
| R2-H-02 | resolved | `ended` を導出し、ラベル・composer・キュー・操作を出し分ける |
| R2-H-03 | resolved | `killAll` を入れた。launching 中・spawn 前は kill しても枠が戻らない (A1) |
| R2-H-04 | resolved | `isAcceptablePid` を両経路で使う。`reapable`、本人確認なしの残余を記録 |
| R2-H-05 | resolved | `ended` の有無で判定。正常終了の側に false にする経路が無い (A1) |
| R2-M-01 | resolved | BE-022 の表現が残る (A7) |
| R2-M-02〜08 | resolved | |
| R2-M-09 | resolved | 版の分類と代わりの道が無い (A5) |
| R2-M-10 | resolved | |
| R2-M-11 | resolved (status-batch について) | 即時のメッセージが規則を通らない (A3) |
| R2-M-12〜13 | resolved | |
| R2-M-14 | resolved (spec 側) | plan が条件 2 を異常終了のときしか実装していない (A1) |
| R2-M-15 | resolved | `end` の成功後に `ended` が出ない点は A2 |
| R2-M-16〜18 | resolved | |

前回の analyze の LOW は L1 / L2 / L3 / L4 / L6 / L7 / L9 が解消、L5 は A5 に発展、L8 は概ね解消。

### Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | あり | BE-003, BE-005, BE-006, BE-012, SH-005, SH-022 | A4, A5 |
| FR-002 | あり | BE-002, BE-005, BE-014, SH-010 | A7 |
| FR-003 | あり | BE-003, BE-005, BE-007, BE-014, FE-001 | A4 |
| FR-004 | あり | SH-004, BE-005, BE-007, BE-008, BE-013 | A3, A6 |
| FR-005 | あり（部分） | SH-003, BE-001, BE-008, BE-022 | A1 |
| FR-006 | あり | FE-001, FE-003, BE-008, FE-013 | A11 |
| FR-007 | あり | BE-002, BE-005, BE-009, BE-010, BE-011 | A2 |
| FR-008 | あり | FE-001, FE-002, FE-012, FE-013 | |
| FR-009 | あり | FE-001, FE-004, FE-011, BE-009 | |
| FR-010 | あり | FE-010, FE-012, FE-013 | |
| FR-011 | あり | BE-001, BE-002, BE-011, FE-011, FE-013 | A1, A8 |
| FR-012 | あり | BE-002, BE-022, FE-030 | A2 |
| FR-013 | あり | BE-020, BE-023, BE-007, FE-030, SH-022 | |
| FR-014 | あり | BE-021, SH-022 | A1 |
| FR-015 | あり | SH-001 | |
| FR-016 | あり | SH-002, SH-090, SH-091, SH-092, FE-004 | A5 |
| SC-001 | あり | SH-003, BE-008, SH-020 | A1 |
| SC-002 | あり | BE-004, BE-014, SH-010 | |
| SC-003 | あり | FE-020, BE-022, SH-022 | A7 |
| SC-004 | あり | SH-004, BE-005, BE-013 | A3 |
| SC-005 | あり（部分） | BE-002, BE-005, BE-010, BE-011 | A2 |
| SC-006 | あり | FE-013, SH-020 | |
| SC-007 | あり | BE-020, BE-022 | |
| SC-008 | あり | BE-021, BE-022, SH-022 | |
| SC-009 | あり | BE-012, SH-021, SH-022 | |
| SC-010 | あり | BE-001, BE-008, FE-002, SH-011, SH-021 | A10 |

**Constitution Alignment Issues**: NON-NEGOTIABLE（I〜VIII）の MUST に、現時点で違反している箇所は無い。Principle VII Statement の字面は改定の承認 (SH-092) を前提にしている (A5)。

**ADR 引用の確認**: 引用先は実在し、plan のソース行の参照は実物と一致した。

### Metrics

- Total Requirements: 26（FR 16 + SC 10）
- Total Tasks: 42（SH 14 / BE 18 / FE 10）
- Coverage: 100%（部分カバーは 2 件: FR-005 / SC-005）
- Ambiguity Count: 3
- Duplication Count: 0
- Critical Issues Count: 0（HIGH 1 / MEDIUM 4 / LOW 6）
