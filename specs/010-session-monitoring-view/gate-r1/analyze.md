## 仕様分析レポート — 010-session-monitoring-view (O-1) / design-gate Track A (analyze)

対象: `specs/010-session-monitoring-view/` の spec.md / plan.md / tasks.md / data-model.md / research.md / quickstart.md / checklists/requirements.md
参照: constitution.md、session charter、_overview.md、glossary.md、AD-020 / 0034 / 0035 / 0038 / 0043、009 spec。加えて構造上の主張を確かめるため、`eslint.config.mjs` / `.dependency-cruiser.js` / `e2e/tsconfig.json` / `.github/workflows/verify.yml` / `RunningSessionList.tsx` / `session-view.ts` / `running-session-store.ts` / `agent-session.ts` を読んだ。
読み取りのみで実施し、ファイルは変更していない。`.specify/extensions.yml` のフックは確認していない(スクリプト実行は不要との指示に従った)。

### 指摘一覧

| ID | 分類 | 重大度 | 箇所 | 内容 | 推奨 |
|----|------|--------|------|------|------|
| C1 | 矛盾(性能の設計) | HIGH | tasks.md:49 (FE-011) / research.md:21 (R-03 2.) / plan.md:133 / spec.md:161, 179, 225 (FR-006・FR-010・SC-006) / tasks.md:55 (FE-012 の 5 点目) | SC-006 は「本文の更新で間引きを超えて再描画しないこと」を求めているが、計画の作りでは満たせない。<br>・FE-011 は `useRowFacts` で「末尾 1 件と `pending`」を `useShallow` で選ぶ。<br>・末尾メッセージは upsert のたびに参照が変わるので、行はメッセージごとに再描画される(負荷時は 1 本あたり 20 回/秒)。<br>・`useThrottledValue` は再描画が起きた後の行の中で表示値を間引くだけで、再描画そのものは減らない。<br>・R-03 は「`deriveActivity` の結果(文字列)を selector で選ぶ」としており FE-011 と食い違う。ただ R-03 の形でも、導出した値が変わるたびに再描画される。 | ・間引きを購読より前に置く。例: 一定間隔で更新されるスナップショットの購読、または直近の活動だけを描く子コンポーネントへの分離。<br>・R-03 と FE-011 の書き方をそろえる。<br>・FE-012 の測り方を「1 行の描画回数が毎秒 N 回以下」のように数値で決める(SC-006 の検証手段を固める)。 |
| I1 | 不整合 | MEDIUM | spec.md:159 (FR-006 の 3.)・spec.md:84 (US-2 AC3) / data-model.md:23-26 | 直近の活動の「本文」分岐が spec と data-model で一致しない。<br>・spec は「最後の assistant 本文の先頭 1 行」。data-model は「末尾の assistant メッセージの**最後の** text part」で、末尾が user なら `null` とする。<br>・ユーザがプロンプトを送った直後(末尾が user)は、spec では直前の assistant 本文を出すが、data-model では空になる。<br>・`toActivityLine` は改行を空白に畳んで 80 文字で切るので、結果は「先頭 1 行」ではなく「本文全体を 1 行に畳んだ先頭 80 文字」になる。 | spec と data-model のどちらかに合わせる。決める点は 3 つ: 末尾が user のとき・複数ある text part のどれを使うか・「先頭 1 行」が何を指すか。tasks の SH-003 の観点も合わせて直す。 |
| I2 | 不整合(機械による強制) | MEDIUM | plan.md:144, 159-162 / AD-038 D2 / eslint.config.mjs:172-179 / .dependency-cruiser.js:140-141 / e2e/tsconfig.json:4 / verify.yml:150 | 計画は「eslint / depcruise は変更しない」とするが、新設の `perf/` と `playwright.perf.config.ts` は AD-038 D2 の分離の外に出る。<br>・`eslint --cache .` の無視対象は `e2e/**` と `playwright.config.ts` だけなので、`perf/` とその config は src 用の基本設定で lint される。<br>・`not-to-test` の prefix `^(specs\|tests\|e2e)` に `perf` が無く、src→perf の逆向きの import を防げない。<br>・`e2e/tsconfig.json` の include は e2e 配下だけ。CI の型検査も `-p e2e/tsconfig.json` だけで、どうやって perf を含めるかが未決(「別 tsconfig か include を広げる」)。 | 機械強制の表に次の 3 点を足す: eslint の ignores に `perf/**`・`playwright.perf.config.ts`、depcruise の prefix に `perf`、型検査の方式と verify.yml の step。あわせて SH-032 に作業として書く。 |
| I3 | 不整合・曖昧 | MEDIUM | spec.md:119 (US-4 AC2)・spec.md:185 (FR-012)・spec.md:224 (SC-005 の「応答の長さ」) / research.md:50 (R-07) | spec は「実 `claude` 10 本に**長い応答**を流させる」と書く。一方 R-07 は「長い文章 1 つでは更新が 1 回しかない」として、負荷を**メッセージ数**(小刻みな tool 呼び出し)で作ると決めている。SC-005 が記録する計測条件にもメッセージ数が無い。 | spec の言い方を「多数のメッセージを継続的に流す応答」に改め、SC-005 の計測条件に「計測窓の中のメッセージ数」を足す(SH-033 には既にある)。 |
| I4 | 不整合 | MEDIUM | spec.md:187 (FR-012)・spec.md:135 (Edge Cases) / research.md:51 / tasks.md:76 (SH-032) / quickstart.md:31 | 実機計測を無効にする条件がずれている。<br>・spec と quickstart は「計測の**途中で**失敗したセッションがあれば無効」。<br>・R-07 と SH-032 は「計測窓の**前に**失敗したセッションがあれば無効」で、窓の中での失敗を検出しない。 | SH-032 に「窓の中で失敗・終了したセッションがあれば無効」を足す(窓の終わりでも状態を確かめる)。 |
| I5 | 識別子の参照誤り | MEDIUM | spec.md:147 (FR-002) | 「承認待ちになった時刻は … とする (FR-004 と同じ)」とあるが、状態に入った時刻を定義しているのは FR-005。FR-004 は live region の要件。 | 参照を `FR-005` に直す。 |
| G1 | カバレッジの欠落 | MEDIUM | spec.md:183 (FR-011)・spec.md:223 (SC-004) / tasks.md:75 (SH-031) | FR-011 は「全情報(経過時間・直近の活動・**強調**)を出した状態」で負荷 E2E を流すと定めるが、SH-031 は経過時間と直近の活動しか assert しない。負荷中に承認待ちや失敗の行(強調)を作る仕込みがない。 | SH-031 に、負荷中の 1 本を承認待ちにする(fake の capability から permission-request を流す)仕込みと、強調の assert を足す。stub で作れないなら、FR-011 を「強調を除く」と書き換える。 |
| U1 | 規定不足 | MEDIUM | data-model.md:48-50 / plan.md:132 / spec.md:149 (FR-004)・spec.md:220 (SC-001「1 遷移 1 回」) | `announcement(prev, next, selectedId, folderName)` は 1 文しか返さない。<br>・同じストア更新(状態通知のバッチ)で複数のセッションが承認待ちや失敗に入ると、読み上げが 1 つしか残らない。<br>・同じ文が続くと(B が承認待ち→解消→再び承認待ち)、live region の内容が変わらず読み上げられない。<br>どちらも SC-001 の「1 遷移 1 回」を破りうる。 | 返り値を複数の文(または連結した 1 文)にし、同じ文が続くときの扱いを data-model と R-05 に書く。FE-003 にこの 2 ケースを足す。 |
| K1 | Constitution(順序) | MEDIUM | tasks.md:11-12 (SH-001 [P]・SH-002 [P]) / constitution.md:781 (Principle XIV) | Principle XIV は「新規用語は glossary 追記 + reviewer 確認の後にコードへ入れる」と定める。SH-001 は本文で「コード投入前」と書きながら、コード作業の SH-002 と同じ `[P]` を付けている。 | SH-001 の `[P]` を外すか、SH-002 以降を SH-001 の完了に依存させる。 |
| K2 | Constitution(原則名の誤り) | LOW | spec.md:196 (FR-013) / plan.md:50 | Principle XV の名前は「Multi-language consistency」で、中身は「UI ラベルは日本語を第一にし、i18n リソース化の要否は M3 までに判断」。「UI ラベルの訳出は `ui` に置く」という規定は XV に無い。しかも実際の置き場所は `features/session/labels.ts`。009 の書き方をそのまま引き継いだドリフト。 | 表記を「XV (UI ラベルは日本語が第一・i18n の判断は M3 まで)」に直す。期限内に O-3 へ回す判断(R-08)はこのままでよい。 |
| A1 | ADR の引用 | LOW | plan.md:68, 155 | 「状態通知に会話由来の文字列を載せない (AD-043 Decision 4)」について。Decision 4 は運ぶフィールドを並べているだけで、この文言そのものの正本は X-5 FR-004。 | 「AD-043 Decision 4 / X-5 FR-004」と両方を併記する。 |
| T1 | 用語のドリフト | LOW | data-model.md:19 / research.md:13 (R-02) | 「表示中のメッセージ配列」は各セッションの live 表示の配列を指している。しかし spec 全体では「表示中」は選択中のセッションの意味で使われている。「選択中のセッションだけで導出する」と誤読されうる。 | 「各セッションの live 表示のメッセージ配列」と言い換える。 |
| T2 | 用語・ID の衝突 | LOW | plan.md:164-173 (Risks R-01〜R-06) / research.md (R-01〜R-08) / tasks.md:66 (「plan R-05」) | plan のリスク ID と research の決定 ID が同じ `R-0n` 形式で、ロードマップの R-2 / R-3 / R-4 ともまぎれる。例えば FE-023 の「plan R-05」は research R-05(live region)と混同しうる。 | plan のリスクを `RK-0n` などに改名する。 |
| T3 | 用語 | LOW | spec.md:37 (「没入ビュー」) | 「没入ビュー」は charter Journey 3 由来の語だが glossary に無く、FR-013 の追加リストにも入っていない。 | glossary に追加する(Running session list と transcript 画面の関係として)か、使わない。 |
| U2 | 規定不足 | LOW | data-model.md:46 (`nextAwaiting`) | 選択中のセッションが承認待ちの列に無いとき(承認に応じた直後など)に何を返すかが書かれていない。先頭を返す想定と読めるが明記がない。 | 「選択中が列に無ければ先頭を返す」と明記し、SH-003 の観点に足す。 |
| G2 | カバレッジ | LOW | spec.md:225 (SC-006「差分レビュー」) | 「IPC・main・supervisor の差分が 0 件」を確かめる作業がタスクに無い(SH-092 はテストを流すだけ)。 | SH-092 に「`src/main`・`src/agents`・`src/preload`・IPC の型の差分が 0 件」の確認を足す。 |
| G3 | カバレッジ | LOW | spec.md:126 (Edge Case: 移る直前に承認待ちでなくなる) / data-model.md:42 (`error` で生存フラグ true でも枠に数える) | 2 つのエッジケースに対応するテスト観点がない: 件数を押した直後に承認待ちが解けた場合と、`slotUsage` で `error` かつ生存中を数える場合。 | FE-003 と SH-003 に 1 観点ずつ足す。 |
| U3 | 曖昧 | LOW | spec.md:184 (FR-012「1 度実施」) / spec.md:224 (SC-005「3 回」) | 「1 度」と「3 回」が並んでいる。1 回の計測機会の中で 3 回測る意味と思われるが、読み手によって割れる。 | FR-012 を「1 回の計測機会で 3 回測り記録する」と書く。 |
| Q1 | チェックリスト | LOW | checklists/requirements.md:9, 30 | 「実装の詳細を含まない」に印が付いているが、spec には `RunningSessionList`・`SessionStatusUpdate`・`e2e/multi-session.spec.ts`・「純関数」・「polite な live region」がある。Notes で理由は説明されている。 | Notes に、どの語を例外として扱うかを列挙するだけでよい。 |

### FR / SC とタスクの対応表

| 要件 | タスクあり | タスク ID | 備考 |
|---|---|---|---|
| FR-001 承認待ちの強調・並びを変えない | ✅ | FE-001, FE-002, FE-003 | |
| FR-002 件数と早い順の移動 | ✅ | SH-003, SH-004, FE-002, FE-003 | I5(参照誤り)・U2 |
| FR-003 失敗の強調と理由 | ✅ | FE-002, FE-003 | |
| FR-004 live region | ✅ | SH-003, FE-002, FE-003, SH-093 | U1 |
| FR-005 経過時間 | ✅ | SH-003, SH-004, FE-011, FE-012 | |
| FR-006 直近の活動 | ✅ | SH-003, FE-010, FE-011, FE-012 | I1・C1 |
| FR-007 枠の使用数・上限時の案内 | ✅ | SH-003, FE-011, FE-012 | G3 |
| FR-008 compact / comfortable | ✅ | FE-020, FE-021, FE-022, FE-023, SH-031 | |
| FR-009 密度を保つ | ✅ | SH-002, SH-004, FE-022 | |
| FR-010 renderer の中で閉じる | ✅ | FE-011, FE-012, SH-092 | C1・G2 |
| FR-011 監視ビュー込みの E2E | ✅(一部) | SH-030, SH-031 | G1(強調が抜けている) |
| FR-012 実機計測 | ✅ | SH-032, SH-033, SH-090 | I2・I3・I4 |
| FR-013 記録の追随 | ✅ | SH-001, SH-090 | K1・T3 |
| SC-001 | ✅ | FE-003 | U1 |
| SC-002 | ✅ | SH-003, FE-012 | |
| SC-003 | ✅ | SH-031, FE-022, SH-004 | |
| SC-004 | ✅(一部) | SH-031 | G1 |
| SC-005 | ✅ | SH-032, SH-033 | I3・I4 |
| SC-006 | ✅(一部) | FE-012, SH-092 | C1・G2 |

### Constitution との整合

- CRITICAL(MUST 違反)はない。
- K1(XIV の順序)は MEDIUM、K2(XV の原則名の誤り)は LOW。
- plan の Constitution Check の原則名と判定は、XV の名前以外すべて正しい(I〜XIV を実物と照合した)。
- XV の「i18n の判断は M3 まで」を O-3 に回す判断は、O-3 が M3 に含まれるので期限内。
- AD-020 Consequences(Hook / Background task は O-1 着手時に判断)、AD-035 Consequences(Tool group の既定 open 化は O-1 候補)、AD-038 D3 / D5 の引用はどれも本文と一致する。
- accepted の ADR の本文を変えない方針(charter と roadmap に記録する)も守られている。

### 要件に紐づかないタスク

なし。FE-023 は plan のリスク R-05 の回帰、SH-091 は Principle VIII と AD-038 D5、SH-092 は全体の検証に当たる。

### 識別子の整合(確認結果)

- spec の FR-001〜013 と SC-001〜006 は欠番・重複がない。
- plan が参照するタスク ID(SH-001, SH-030〜033, SH-090, SH-091, FE-011)はすべて tasks.md にある。
- research の R-01〜R-08、quickstart の V-1〜V-4、data-model の §1・§2 は参照先がすべて実在する。
- 009 の FR-004 / 005 / 008 / 009 / 011 / 014、SC-003 / 008 の引用は中身と一致する。
- `SessionRowStatus` の 9 値、`PermissionRequest.toolName` / `input`(サニタイズ済み)、既定のウィンドウ 1100×760、サイドバー `w-64` はコードの実物と一致する。

### 数値

- 要件の総数: 19(FR 13 + SC 6)
- タスクの総数: 22(SH 12 / FE 10)
- カバレッジ: 100%(タスクが 1 つ以上ある要件 19/19。うち一部カバーが 3 件: FR-011 / SC-004 / SC-006)
- 曖昧: 3 件(I3, U3, U2)
- 重複: 0 件
- 重大度別の件数: CRITICAL 0 / HIGH 1 / MEDIUM 7 / LOW 10

### 次の対応

- CRITICAL はない。HIGH の C1 は、SC-006 が設計どおりでは満たせないという問題なので、実装の前に plan / research R-03 / tasks FE-011・FE-012 を直す。
- MEDIUM の直し先:
  - I1, U1: data-model と spec FR-006 / FR-004 を手で直す。
  - I2, I4, G1, K1: plan の「機械強制の変更」と tasks の SH-031・SH-032・SH-001 を手で直す。
  - I3, I5: spec の FR-002 / FR-012 / US-4 AC2 / SC-005 の文言を直す(`/cl-spec` での見直しでもよい)。
- LOW はその場で直すか、そのまま進めてよい。
