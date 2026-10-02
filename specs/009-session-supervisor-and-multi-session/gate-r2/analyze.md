## 仕様分析レポート — `specs/009-session-supervisor-and-multi-session/`（Track A / analyze、Round 2）

対象: spec.md / plan.md / tasks.md / checklists/requirements.md
参照した資料: constitution.md v1.2.7、session charter、glossary、ADR 0006 / 0010 / 0018 / 0023 / 0030 / 0031 / 0034 / 0036 / 0041、005 / 008 spec、`check.mjs`・`allowlists.mjs`・`eslint.config.mjs`、`transport.ts`・`sdk-agent-session.ts`・`run-state.ts`・`sanitize-body.ts`・`live-message.ts`・`session-spawner.ts`・`session-launch-service.ts`・`e2e-capability.ts`・`composition-root.ts`・`index.ts`。
読み取り専用で実施した。スクリプトは実行していない。

### 結論

- **CRITICAL は 0 件。HIGH は 2 件で、どちらも今回の改訂で新たに生じたもの。**
  1. **N1**: 調停役スレッドの本体（`supervisor-core`）が経路の種類（stdio か parent-port か）を見て分岐する設計になった。これは AD-030 §5「本体は経路を知らない」と食い違うが、AD-043 の読み替え一覧に AD-030 §5 が入っていない。
  2. **N2**: Worker が終了したときの判定条件「終端に達していなければ」が曖昧なまま残っている。`run-state.ts` は `done` を終端に含めたまま変えないため、`done` 中にスレッドが落ちると `error` が出ない (US-4 AC1 違反)。定義を逆にすると、強制終了した後の正常な Worker 終了が `process-crashed` と誤判定される。
- **前回の HIGH 16 件のうち、15 件は解消、1 件（DG-H-03）はほぼ解消で残りが MEDIUM 1 件。** 前回の analyze の HIGH 7 件はすべて解消した。
- **カバレッジは 100%。** ただし一部しか覆っていない要件が 3 件ある（SC-005 / SC-007 / FR-016）。

### 指摘一覧

| ID | 区分 | 重大度 | 箇所 | 内容 | 推奨 | 前回との関係 |
|----|------|--------|------|------|------|------|
| N1 | ADR とのずれ | HIGH | plan.md L157・L177 / spec.md FR-001 L164 / AD-030 §5 L157-158 / `transport.ts` L6-7 | AD-030 §5 は「本体は行を読み、行を書くだけ。経路を知らない」と決めている（AD-031 §2 もこの性質を前提にしている）。plan は DG-H-11 を直すために `transport.kind` を公開して `supervisor-core` に分岐させた。これは accepted な決定の変更にあたるが、AD-043 Decision と spec FR-015 の読み替え一覧に AD-030 §5 が無い。spec FR-001 は逆に AD-030 §5 を守るべき制約として引いている。 | (a) AD-043 の読み替え対象に AD-030 §5 を明記し、spec FR-001 / FR-015 の引用も合わせる。(b) 本体が経路を知らない形にする (transport に `sendBody(sessionId, payload)` を持たせる等)。 | 新規 |
| N2 | 矛盾 | HIGH | plan.md L164・L149 / `run-state.ts:23,71-72` / spec US-4 AC1・FR-012 | plan の Worker 終了処理は、まだ定義の無い「終端」という語で条件を書いている。`isTerminal` で読むと `done` 中にスレッドが落ちても `error` が出ない。`isTerminal` を使わずに読むと、kill → `ended` → `terminate()` という正常な経路が `process-crashed` と誤判定される。 | 条件を **`ended` を受け取ったかどうか**で書く（`ended` 未着の Worker 終了 = 異常終了）。BE-022 に「`done` 中の Worker 例外で `process-crashed` が出る」「kill 後の正常終了では出ない」を足す。 | 新規（DG-H-02 の修正から派生） |
| N3 | 仕様の不足 | MEDIUM | plan.md L142・L171・L200 / spec FR-005 | セッションスレッドが spawn 前（`launching`）に送る状態通知に載せる `claudeAlive` の値が決まっていない。spawn 前を正直に false と送ると、一方向規則によって枠が早く空き、DG-H-03 が再発する。 | 状態通知の `claudeAlive` は「終わっていない」という意味で spawn 前は true と明記する。false にできるのは調停役スレッドだけ（`child-exited` か Worker 終了のとき）にする。 | 前回 HIGH（DG-H-03）の残り |
| N4 | 矛盾 | MEDIUM | spec FR-005 L185 / plan L164・L180 | plan は spawn 後に Worker が異常終了した場合、`killPid` を送った後に（`wsl.exe` の終了を確かめずに）`claudeAlive:false` にする。これは spec の 3 条件のどれにも当たらない 4 つ目の経路である。 | spec FR-005 に「spawn 後のスレッド異常終了（回収手段を実行した後）」を足すか、plan 側で `wsl.exe` の終了を待ってから false にする。 | 新規 |
| N5 | 仕様の不足 | MEDIUM | plan.md L199・L203 / spec FR-007 L196 | main は「スレッドが生存中」を制御の条件にしているが、スレッドの終了を main に伝えるメッセージの種類が無い。`threadAlive` を何から更新するのかが決まっていない。 | スレッド終了の通知を足すか、`threadAlive` を状態通知から導く規則を plan に書く。BE-010 の負例に「スレッド終了後の制御は拒否される」を入れる。 | 新規 |
| N6 | 実現性 / 矛盾 | MEDIUM | plan.md L187 / L171 / AD-043 Decision 5 / Principle VI | 本人確認に使う「image 名とプロセス生成時刻」が `spawned` メッセージに入っていない。Node の `ChildProcess` には生成時刻を得る API が無く、Windows で得るには `tasklist` / PowerShell の起動かネイティブモジュールが要る。前者は `PROCESS_SPAWN_MODULES` への追加（ADR 必須）、後者は Principle VII 違反になりうる。 | BE-023 を作る場合の照合手段を決める。spawn しない手段が無ければ、照合をやめて「即時の `child-exited` と世代照合だけ」で受け入れる残余として AD-043 に書く。 | 前回 HIGH（DG-H-08）の残り |
| N7 | 曖昧さ | MEDIUM | spec SC-003 L279 / US-3 AC2 / FR-002 L167 / `sanitize-body.ts:12,15` / `live-message.ts:46-56` / `sdk-agent-session.ts:466` | 本文の上限は part ごとに 200KB であり、1 メッセージを丸ごと縛ってはいない。live 経路は tool_result を renderer へ送らないので、E2E で 5MB の本文を流すと実経路に存在しない負荷を測ることになる。5MB を 1 回パースする負荷が実際にかかるのはセッションスレッドである。 | 5MB を「セッションスレッドが受ける SDK の生データ」と定義し BE-022 / quickstart の計測対象にする。E2E の負荷は実際に届きうる大きさで定義し直す。FR-002 は「part ごとに `BODY_MAX_BYTES` で有界」に直す。 | 新規（DG-H-15 の修正から派生） |
| N8 | 仕様の不足 | MEDIUM | spec FR-011 L212 / US-2 AC5・AC6 / plan L173・L219 | (a) spec は「終了」を `done` / `interrupted` に限るが、plan は `idle` も受け付ける。(b) SessionList が「終了」を出す条件に `claudeAlive:true` が無い。(c) `launching`（と `idle`）の行には終了・停止・閉じるのどれも出ない。 | 「終了」の条件を「`done`/`interrupted` かつ `claudeAlive:true`」に統一し、`idle` の扱いを揃える。`launching` に「停止（強制終了）」を出すかを spec で決める。 | 新規（DG-H-14 の修正から派生） |
| N9 | カバレッジ / 矛盾 | MEDIUM | spec SC-005 L285 / tasks BE-005・BE-011 | BE-005 が確かめるのは受信方向の sessionId の付け直しだけで、main から来た制御がその sessionId の Worker だけに届くこと（送信方向）を確かめるテストが無い。BE-011 は「main→supervisor→セッションスレッドまで通す結線テスト」と書きながら fake の supervisor 接続を使うと書いており自己矛盾している。 | BE-005 に「`control{sessionId:A}` が Worker A にだけ届き、未知の sessionId は捨てられる」を足す。BE-011 の範囲を明記し直す。 | 新規 |
| N10 | カバレッジ | MEDIUM | spec US-4 AC1・SC-007 / tasks BE-022 | `wsl.exe` だけが異常終了したとき（スレッドは生きている）に、そのセッションだけが `process-crashed` になり他が続くことを確かめるテストがまだ無い。 | BE-002 か BE-022 に足す。 | 前回 MEDIUM（DG-M-12）の残り |
| N11 | 用語 | MEDIUM | spec FR-016 L238 / tasks SH-002 / glossary `SessionControl`・`SessionEvent` / plan 申し送り #7 | (a) `SessionControl` に `end` を足すのに glossary の更新対象に `SessionControl` が無い。(b) `SessionEvent` の経路が更新対象に無い。(c) plan #7 は `SessionControl` の語彙に `launch` を含めているが、`launch` は `SessionControl` に含まれない。 | SH-002 に `SessionControl`（`end`）と `SessionEvent`（中継の経路）を足す。plan #7 から `launch` を外す。 | 前回 MEDIUM（DG-M-15）の残り |
| N12 | 曖昧さ | MEDIUM | spec FR-009 L205・L208 / US-2 AC7・AC8 / Edge Cases L155 | 「稼働中セッション一覧」には閉じるまで `claude` が終わったセッションの行も残る。AC8 の空状態が、行が 0 件のときなのか `claudeAlive:true` が 0 件のときなのか決まっていない。 | 空状態の条件を「行が 0 件」と明記する。名前の「稼働中」も SH-002 で注記する。 | 新規 |
| L1 | ID の整合 | LOW | plan.md 申し送り #9 L116 | registry の作業は tasks では BE-008 であり、BE-007 は spawner である。 | 「BE-007（世代）/ BE-008（枠の占有）/ BE-020」に直す。 | 新規 |
| L2 | ID の整合 | LOW | tasks SH-003 / SH-004 | ID の接頭辞は SH なのにタグが `[BE]` になっている。 | タグを `[SH]` にするか、BE の ID に振り直す。 | 新規 |
| L3 | 相互参照 | LOW | spec SC-003 L281 | 「SC-007 の単体（1 スレッドの巨大な本文の間も…）」と書いているが、SC-007 の本文に巨大な本文のケースは無い（BE-022 にはある）。 | SC-007 に足すか参照先を BE-022 に直す。 | 新規 |
| L4 | ADR の引用 | LOW | AD-023 §3 L243-247 / tasks BE-001 | `stop()` を削除するが、AD-023 §3 の例示がその interface 形を載せたまま残る。 | AD-043 か glossary の更新で「例示は X-5 で古くなった」と一言触れる。 | 新規 |
| L5 | Constitution の事実の追随 | LOW | Principle VII Statement / Principle IX Examples / tasks SH-092 | SH-092 が PATCH するのは IX の「現状の制約」だけで、単独起動の実際の形と IX の Good example が古いまま残る。 | SH-092 の PATCH 案に VII Statement の起動形と IX Example の注記を含めるかを人間の承認の場で一緒に諮る。 | 新規 |
| L6 | 順序 | LOW | tasks の依存と順序 #7 / SH-011 | BE-008 / BE-001 を変えた時点で既存の SC-011 / `session-active` のテストが赤になり、SH-011 まで赤のまま続く。 | SH-011 の書き換えを BE-001 / BE-008 と同じ段に置く。 | 新規 |
| L7 | カバレッジ | LOW | spec FR-006 L189 | 「起動設定は起動ごとのスナップショットであり、セッション間で共有しない」を確かめるテストが明記されていない。 | FE-013 か BE-008 に 1 観点足す。 | 新規 |
| L8 | 用語 | LOW | spec 全体 | 「終了」が 3 つの意味で使われている (穏当な操作 / `claude` の終了 / アプリの終了処理)。 | 操作を指すときは「終了（穏当）」か `end` を添える。 | 新規 |
| L9 | 整合 | LOW | plan.md ADR 節 / Confirmation | accepted にする条件と、Confirmation に並べた項目（実装後に揃うもの）の時点がずれる。 | Confirmation を「accepted の条件（SH-000）」と「実装後に追記するもの」に分ける。 | 新規 |

**ADR 引用の確認結果（問題なし）**: AD-006、AD-010、AD-018 Decision 3、AD-023 §1・§5・§6・Open Question、AD-030 §5（実在する。ただし N1 のとおり読み替えが漏れている）、AD-031 §1・§2、AD-034 §1、AD-036 §1 / §2 / §3、AD-041、X-1 の FR-002 / 007 / 010 / 015 / 016 / 017 / 019 / 020、SC-005 / 006 / 007 / 011、X-4 の US-1 AC7・Edge Cases L171・FR-013。AD-043 は未使用の番号、check.mjs の項目 18〜20 も未使用。plan のファイル・行の参照はソースと一致した。

### 前回の指摘の状況

| ID | 状況 |
|---|---|
| DG-H-01 | 解消 |
| DG-H-02 | 解消（N2 が派生） |
| DG-H-03 | ほぼ解消（N3 が残る） |
| DG-H-04 | 解消 |
| DG-H-05 | 解消 |
| DG-H-06 | 解消（L9 は軽微） |
| DG-H-07 | 解消（AD-030 §5 が新たに漏れた → N1） |
| DG-H-08 | 解消（N6 が残る） |
| DG-H-09 | 解消 |
| DG-H-10 | 解消 |
| DG-H-11 | 解消（N1 が派生） |
| DG-H-12 | 解消 |
| DG-H-13 | 解消 |
| DG-H-14 | 解消（N8 が派生） |
| DG-H-15 | 解消（N7 が派生） |
| DG-H-16 | 解消 |

前回の analyze の HIGH 7 件はすべて解消。前回の MEDIUM 17 件中、解消 15・一部解消 2（M-12 → N10、M-15 → N11）。前回の LOW（analyze 分）はすべて解消。

### カバレッジ

| 要件 | タスクの有無 | タスク ID | 備考 |
|---|---|---|---|
| FR-001 | あり | BE-003, BE-005, BE-006, BE-012, SH-005 | N1 |
| FR-002 | あり | BE-002, BE-005, BE-014, SH-010 | N7 |
| FR-003 | あり | BE-005, BE-007, BE-014, FE-001 | |
| FR-004 | あり | SH-004, BE-005, BE-007, BE-013 | N3 |
| FR-005 | あり | SH-003, BE-001, BE-008 | N4 |
| FR-006 | あり | FE-001, FE-003, FE-013, SH-011 | L7 |
| FR-007 | あり | BE-002, BE-005, BE-009, BE-010 | N5、N9 |
| FR-008 | あり | FE-001, FE-002, FE-012, FE-013 | |
| FR-009 | あり | FE-011, FE-012, FE-004, BE-009 | N12 |
| FR-010 | あり | FE-010, FE-002, FE-013 | |
| FR-011 | あり | BE-001, BE-002, BE-011, FE-011 | N8 |
| FR-012 | あり | BE-002, BE-022, FE-030 | N2、N10 |
| FR-013 | あり | BE-020, BE-023, BE-007, FE-030 | N6 |
| FR-014 | あり | BE-021, SH-022 | |
| FR-015 | あり | SH-001 | N1 |
| FR-016 | あり（一部） | SH-002, SH-090, SH-091, SH-092, FE-004 | N11 |
| SC-001 | あり | BE-008, SH-020 | |
| SC-002 | あり | BE-004, BE-014, SH-010 | |
| SC-003 | あり | FE-020, BE-022, SH-022 | N7 |
| SC-004 | あり | SH-004, BE-005, BE-013 | |
| SC-005 | あり（一部） | BE-002, BE-010, BE-005 | N9 |
| SC-006 | あり | FE-013, SH-020 | |
| SC-007 | あり（一部） | BE-020, BE-022 | N10 |
| SC-008 | あり | BE-021, BE-022, SH-022 | |
| SC-009 | あり | BE-012, SH-021, SH-022 | |
| SC-010 | あり | SH-011, SH-021 | |

**Constitution との整合**: NON-NEGOTIABLE（I〜VIII）の MUST に違反する箇所は無く、CRITICAL は 0 件。Constitution Check の表は 15 行すべてそろっている。

### 数値

- 要件数: 26（FR 16 + SC 10）
- タスク数: 42（SH 14 / BE 18 / FE 10）
- カバレッジ: 100%（一部カバーは 3 件: FR-016 / SC-005 / SC-007）
- 曖昧さ: 4 件（N7、N8、N12、L8）
- 重複: 0 件
- 重大度別: CRITICAL 0 / HIGH 2 / MEDIUM 10 / LOW 9
