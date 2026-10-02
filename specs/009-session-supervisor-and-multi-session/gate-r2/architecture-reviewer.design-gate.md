# architecture-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-003: supervisor の形、本文の経路、transport。AD-010 / AD-030 §5 / AD-034 §1 / AD-036 §1-§3 / Principle VII・IX に関わる
  - FR-004: 状態通知、バッチ化、main での検証。AD-031 §2 / AD-023 §5 に関わる
  - FR-005 / FR-006: 上限 10 と枠の判定 (`claudeAlive`)。X-4 経路を再利用する
  - FR-007: 制御の宛先と `requestId` の束縛
  - FR-008〜FR-011: renderer の保持、一覧、入力の分離、終了・停止・閉じる。X-1 FR-017 と X-2 の Message queue を継承する
  - FR-012〜FR-014: 失敗の閉じ込め、supervisor の異常終了、終了処理
  - FR-015 / FR-016: AD-043 の読み替え範囲、glossary、Constitution IX の PATCH
  - SC-001〜SC-010: 全件。特に SC-002 (項目 18)、SC-004 (受信検証)、SC-006 (切り替え)、SC-009 (単独起動)、SC-010 (回帰)
- touched files に該当する charter / Confirmation:
  - session charter: Scope「セッション supervisor (utilityProcess 分離、semaphore 制御、IPC バッチ化)」、業務ルール「stream の逐次パースは supervisor」、KPI「並列時の滑らかさ」、Journey 3、Key concepts の supervisor
  - _overview.md の Cross-domain invariants VII / IX
  - AD-023 §1 / §5 / §6 / §7、AD-030 §5 (訂正節を含む)、AD-031 §1 / §2、AD-034 §1 / §5、AD-036 §1 / §2 / §3、AD-038 D3 / D5、AD-010 Decision
  - Constitution Principle VII (Statement)、IX (Examples と現状の制約)、XIV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲 (pid kill の本人確認と `requestId` の乱数化は A/B 側で見る)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:3 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: 永続化スキーマの変更なし。一覧の element 選定は ui 側
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R1 を受けた改訂版の spec / plan / tasks を bundle で見た。対象は次の作り替えである。

- 単一 supervisor (`utilityProcess`) の中に調停役スレッドとセッションスレッド (`worker_threads`) を置く
- 上限 10 の semaphore (枠は `claudeAlive` で数える)
- 状態通知だけを main 経由でバッチ化する
- renderer はセッション単位のストアと一覧を持つ
- 穏当な「終了」を足す
- AD-043 は proposed で起票し、SH-000 の後に accepted にする

利用者の決定事項は前提として扱い、指摘はその範囲内に限った。AD-043 は未起票のままである。plan.md:224-237 を草稿として照合した。

### R1 の自分の指摘の判定

| R1 ID | 判定 | 根拠 |
|---|---|---|
| H-001 (読み替え対象の不足) | resolved | spec.md:233-234 (FR-015) と plan.md:229・233 が AD-023 §1・§6 / AD-036 §1・§3 を名指ししている。§6 の 3 根拠の扱いも spec.md:41-45 にある |
| H-002 (accepted の時期) | resolved | spec.md:47・236、plan.md:226、tasks.md:17・160。ただし accepted 時の Decision 本文の書き方に新しい問題がある (M-102) |
| H-003 (項目 18 / IX 検査) | resolved | plan.md:246 で項目 18 を新設。制御行のデコーダは supervisor-protocol.ts に分離し、UNDETECTED_NOTES に記録する。SH-092 で PATCH する。main 側は AD-031 §2 と 64 KiB の行長上限を明記した |
| H-004 (deserialize の文言) | resolved | spec.md:166-167 (FR-002) と SC-002 が「JSON として解釈しない」に揃った |
| H-005 (port / 行の判定) | resolved だが、推奨 (c) が AD-030 §5 との新しい drift を生んだ (H-101) | plan.md:157-158 |
| H-006 (unmount→kill) | resolved | spec.md:150・204、plan.md:218、tasks.md:67・84 |
| H-007 (E2E stub の複製) | resolved | plan.md:208、spec.md:280 |
| M-001 〜 M-008 | すべて resolved | spec FR-004 / FR-005、plan の domain 節・main/app 節、SH-002、XIII 行、BE-021、BE-010 |
| L-001 〜 L-003 | すべて resolved | tasks.md:147、tasks.md:144、spec.md:180 |

## Findings

### [High] supervisor-core が transport の経路種別 (`kind`) を見て分岐する設計は、AD-030 §5 の「本体は経路を知らない」と transport.ts の不変条件に反する。AD-043 の読み替え対象にも入っていない (H-101) (scope: feature) — new (R1 H-005 推奨 (c) が誘発)

- **観察**:
  - plan.md:157 は「経路は `transport` が公開する**経路種別** (`kind: 'stdio' | 'parent-port'`) で判断する」とし、plan.md:160 では本文を port へ送るか行に埋めるかを supervisor-core がこの種別で切り替える。plan.md:177 と BE-003 は transport.ts に `kind` を公開させる。
  - accepted の AD-030 (`0030:157-158`) は「本体は『行を読み、行を書く』だけにする。経路を知らない」「経路の選択は `src/agents/transport.ts` の 1 モジュールに閉じる」と定める。AD-031 (`:135`) もこの性質を守るべき前提として引いている。
  - 実装側も同じ不変条件を持つ (`src/agents/transport.ts:6`「本体は経路を知らない」/ `:77`「本体が呼ぶのは `createTransport()` だけ」)。
  - spec FR-001 は「経路の選択は既存の `transport` に閉じる (AD-030 §5)」と準拠を宣言しているが、AD-043 Decision 1 の読み替え対象にも FR-015 にも AD-030 §5 は無い。
- **同種事象探索**: `経路を知らない|経路種別|transport\.kind|kind: 'stdio'` で 7 件 (規範側: `0030:157`、`transport.ts:6`、`enumerate-sessions.ts:18`、`enumerator-spawner.ts:35` / 本 feature 側: `plan.md:157`、`plan.md:177`、`tasks.md:45`)。
- **リスク/影響**: AD-043 が accepted になった時点で、AD-030 §5 に反する設計が根拠を持たないまま残る。AD-030 §5 がこの性質を求めた理由は、経路ごとに振る舞いが分かれると stdio 側の確認が緑のまま parent-port 側だけが壊れることにある (`0030:172-175`)。この設計では SC-009 (stdio) が緑でも Electron 経路の本文送出は検証されない。これは R1 で私が H-005 (c) として推奨した形である。
- **推奨アクション**:
  - (a) 推奨。分岐を transport.ts の内側に戻す。transport に「launch を受けたときの本文の出口」を作る関数 (例: `transport.openBodySink(ports): BodySink | null`) を持たせる。parent-port 経路では port 1 本を要求し、無ければ `null`。stdio 経路では行に書く sink を返す。supervisor-core は `null` なら拒否し、sink があれば `sink.post(payload)` を呼ぶだけにして、経路の種別を見ない。BE-003 の単体で経路ごとの sink の振る舞いを固定する。
  - (b) 種別を見る形を残すなら、AD-043 Decision 1 と spec FR-015 の読み替え対象に AD-030 §5 を足し、FR-001 の文言も改める。
- **根拠**: AD-030 §5 / AD-031 §1・§2 / Principle VII
- **scope 根拠**: plan の agents 節、BE-003 / BE-005、AD-043 の草稿で直せる

### [High] `done` の二義性が renderer に残る。「終了」や `claude` の自発的な終了の後も composer が有効のままで、送れば拒否される行き止まりと、送信待ちキューの扱いの未定義が生じる (H-102) (scope: feature) — new

- **観察**:
  - plan.md:149 は「`end` は `kill` と同じ遷移 (→ `done`) とし、`claude` が終わったかどうかは `claudeAlive` で区別する」とする。
  - 現行の renderer が終端を判定する材料は、run-state とローカルの `killed` フラグだけである (`SessionScreen.tsx:140` の `isDisabled`、`:165` の `terminal`。立ち下がり先が terminal なら `notifyCancelled`、そうでなければ `notifyIdle`。`:136-139` は X-1 pr-gate po H-001 / H-401 の dead-end をこの無効化で塞いだと記録している)。
  - plan の renderer 節と FE-001 / FE-002 / FE-013 は、この判定を `claudeAlive` に切り替えることに触れていない。そのため「終了」や `done` 中の `child-exited` で `done` + `claudeAlive: false` になっても composer は有効のまま残り、送信は main で拒否される。
  - glossary の Message queue (`docs/glossary.md:397`) は「中断で still_queued 維持、error/killed 終端で cancelled」と定めており、`interrupted` で積まれていた項目を「終了」したときの disposition は定まっていない。
- **同種事象探索**: `killed` を renderer の session 配下で検索して 6 件 (`SessionScreen.tsx:140`, `:165`, `:189`, `:286`, `useLiveSession.ts:57`, `:115`)。`claudeAlive` を composer / queue の判定に使う記述は plan に 0 件。
- **リスク/影響**: X-1 pr-gate で塞いだ dead-end が「終了」によって再発する。`claude` が終わったという概念を main と renderer が別々の判定で持つことになり、Principle XIV にも反する。
- **推奨アクション**: plan の renderer 節に、`ended = statuses[id].claudeAlive === false` を導出し `isDisabled` と `terminal` に含める (キューは `notifyCancelled`)、ローカルの `killed` は文言の出し分けにだけ残すか統合する、と明記する。FE-013 に「終了の後に composer が無効になり、キューは cancelled」「`done` 中の `child-exited` でも同じ」を足す。SH-002 で glossary の Message queue の終端 disposition に「終了 / `claude` の終了」を足す。
- **根拠**: X-1 pr-gate po H-001 / H-401 / Principle XIV / spec FR-005・FR-011
- **scope 根拠**: plan の renderer 節、FE-002 / FE-013、SH-002 で直せる

### [Medium] Principle IX の Good example「パース済みの構造体を MessagePort で直送」から離れる扱いが「現状の制約」の PATCH だけになっている。SH-000 (2) で直送に分岐したときの本文の形も決まっていない (M-101) (scope: feature) — new

- **観察**: `constitution.md:570` の Good example は「supervisor がパース済みの構造体を MessagePort で renderer に直送する」で、X-1 の実装はこの形 (`sdk-agent-session.ts:313`)。plan は本文を文字列化して renderer で `JSON.parse` する。plan.md:236 と SH-092 の対象は「現状の制約」だけで、Example 本文の扱いは決まっていない。SH-000 (2) で直送に分岐した場合に文字列化を続けるのかも書かれていない (中継が無いなら文字列化の理由は消える)。
- **同種事象探索**: `MessagePort|パース済みの構造体` を constitution.md で検索して 1 件 (`:570`)。plan では `Good example` が 1 件 (`plan.md:236`)。
- **リスク/影響**: 正本の実装が Good example に従わない状態が例外の記録なしに残り、次の reviewer が IX drift として繰り返し挙げる。
- **推奨アクション**: SH-092 の PATCH 案に Good example の扱いを含める。AD-043 Decision 2 に、SH-000 (2) の両方の分岐での本文の形と renderer デコーダの扱いを書く。
- **根拠**: Constitution Principle IX / AD-031 §2 / 改定手順 2
- **scope 根拠**: SH-092 と AD-043 の草稿で直せる

### [Medium] AD-043 の Decision 2 / 5 が「SH-000 で決める」という条件分岐のまま accepted になる。分岐の結果を Confirmation にだけ書くと、Decision 節から決定が読めない (M-102) (scope: feature) — new

- **観察**: plan.md:230 (Decision 2) と plan.md:233 (Decision 5) は条件付きの書き方である。SH-001 は「SH-000 の 4 項目と採った分岐を Confirmation に書いた時点で accepted にする」とし、Decision 本文を選ばれた分岐に書き換える工程が無い。
- **同種事象探索**: `SH-000 \(2\)|SH-000 \(3\)` を plan.md で検索して 5 件 (`:179`, `:180`, `:182`, `:230`, `:233`)。
- **リスク/影響**: accepted の後に書き換えると決定の変更を in-place で行うことになり AD-031 に反する。書き換えなければ Decision 節は決定を述べない ADR として残る。
- **推奨アクション**: SH-001 に「proposed のうちに Decision 2 / 5 を選ばれた分岐の文に書き換え、採らなかった分岐は Considered options に移す。そのうえで accepted にする」を足す。
- **根拠**: AD-031 §1 と訂正節
- **scope 根拠**: tasks SH-001 と plan の ADR 節で直せる

### [Medium] 状態通知の検証が session-launch-service と session-status-relay の 2 箇所に分かれており、relay には `claudeAlive` の単調性の検査が無い (M-103) (scope: feature) — new

- **観察**: plan.md:201 は launch-service が `mergeIntoRegistry` で反映し、別世代・未知 sessionId を捨てるとする。plan.md:205 と BE-013 は relay が別に検証して renderer へ送るとする。単調性は `mergeIntoRegistry` の側にしかなく、relay がバッチをそのまま転送すると、registry は false のまま renderer には true が届く。SC-004 は「生存フラグの false→true は反映されない」を求めている。
- **同種事象探索**: `現行世代|registry に在る|registry に無い` を plan.md で検索して 3 件 (`:185`, `:201`, `:205`)。
- **リスク/影響**: 同じ受信規則を 2 箇所に書き AD-023 §5 に照らして drift しやすい。renderer の一覧 (と H-102 の `ended`) が registry と食い違う。
- **推奨アクション**: 受信の規則を domain の 1 関数 (例: `acceptBatch(registrySnapshot, generation, batch) → { accepted, nextRegistry }`) にまとめる。launch-service は registry を更新し、単調性を適用した後の `accepted` だけを relay に渡す。relay は転送と回数の制御だけを持つ。BE-013 に false→true が renderer に届かない負例を足す。
- **根拠**: AD-023 §5 / SC-004
- **scope 根拠**: plan の domain 節と main/app 節、BE-008 / BE-013 で直せる

### [Medium] (H) 既存の Principle VIII の E2E (基準画像比較と、位置で select を拾う起動補助) への波及が SH-011 で名指しされていない (M-104) (scope: feature) — new

- **観察**: SessionScreen を 2 ペインにすると、`e2e/composer-screenshot.spec.ts:52-53` の基準画像比較に差分が出うる (基準画像の更新は AD-038 D5 で PR の承認が要る。Principle VIII Automated (B) の正本)。`e2e/support/launch.ts:51-52` は `page.locator('select').first()` / `.nth(1)` で select を拾い、一覧の導線が加わるとずれうる。SH-011 は「`e2e-capability` を使う E2E」と包括的に書くだけである。
- **同種事象探索**: e2e/ で `toHaveScreenshot|locator\('select'\)` を検索して 4 件 (`composer-screenshot.spec.ts:53`, `launch-dialog.spec.ts:22,23`, `support/launch.ts:51,52`)。
- **リスク/影響**: NON-NEGOTIABLE Principle VIII の自動検証が赤になるか、基準画像が承認なしに撮り直されて AD-038 D5 を迂回する。
- **推奨アクション**: SH-011 に、`composer-screenshot.spec.ts` の基準画像の差分確認 (更新するなら PR で承認)、`e2e/support/launch.ts` / `launch-dialog.spec.ts` の select を label や role で拾うこと、`ime.spec.ts` の 3 経路が新しい e2e-capability で緑であることを明記する。
- **根拠**: Principle VIII Verification / AD-038 D3・D5 / SC-010
- **scope 根拠**: tasks SH-011 で直せる

### [Low] AD-030 §5 の訂正「親は 2 つの経路の両方を購読する」に対し、supervisor 接続は `stdio: 'ignore'` で parentPort だけを購読する。その理由が書かれていない (L-101) (scope: feature) — new

- **観察**: `0030:168-170` は「親は 2 つの経路の両方を購読する」とする。plan.md:193 は `stdio: 'ignore'` を維持する (既存の `session-spawner.ts:42` も同じ)。列挙の `enumerator-spawner.ts:51` は `stdio: 'pipe'` で両方を購読している。
- **同種事象探索**: src/main で `stdio` を検索し 3 件 (`enumerator-spawner.ts:51`, `session-spawner.ts:42`, `transcript-spawner.ts:43`)。
- **推奨アクション**: plan の session-spawner 節に、片方の経路だけを購読してよい理由 (utilityProcess の下では parentPort が必ず存在する / stdout を開くと本文が漏れる経路を作る) を 1 行書く。supervisor 側で parentPort が見つからないときの guard を置くかも決める。
- **根拠**: AD-030 §5 訂正
- **scope 根拠**: plan の main/app 節で直せる

### [Low] 単独起動の形が `node dist/supervisor.js <worker-path>` に変わる。Principle VII の Statement と AD-010 の Decision の字面との差を、glossary だけで追随させている (L-102) (scope: feature) — new

- **観察**: plan.md:167 は worker entry のパスを `process.argv[2]` で受ける。`constitution.md:496` と `0010:21` は「`node dist/supervisor.js` として単独起動」と書いており、SH-002 は glossary だけを更新する。
- **同種事象探索**: `node dist/supervisor.js` を docs と constitution で検索して 3 件 (`constitution.md:496`, `0010:21`, `glossary.md:628`)。
- **推奨アクション**: worker entry を同じ出力ディレクトリの既定名で解決して引数を省略可能にし字面を保つか、引数が必須であることを AD-043 Decision 6 に書き SH-092 の PATCH 案に VII の Statement の追随を含める。
- **根拠**: Principle VII / AD-010
- **scope 根拠**: plan の agents 節と SH-092 で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `経路を知らない\|経路種別\|transport\.kind\|kind: 'stdio'` | 7 | 0030:157, transport.ts:6, enumerate-sessions.ts:18, enumerator-spawner.ts:35, plan.md:157, plan.md:177, tasks.md:45 |
| H-102 | `killed` (renderer/features/session) | 6 | SessionScreen.tsx:140,165,189,286, useLiveSession.ts:57,115 |
| M-101 | `MessagePort\|パース済みの構造体` (constitution) / `Good example` (plan) | 1 / 1 | constitution.md:570 / plan.md:236 |
| M-102 | `SH-000 \(2\)\|SH-000 \(3\)` (plan) | 5 | plan.md:179,180,182,230,233 |
| M-103 | `現行世代\|registry に在る\|registry に無い` (plan) | 3 | plan.md:185,201,205 |
| M-104 | `toHaveScreenshot\|locator\('select'\)` (e2e) | 4 | composer-screenshot.spec.ts:53, launch-dialog.spec.ts:22,23, support/launch.ts:51,52 |
| L-101 | `stdio` (src/main) | 3 | enumerator-spawner.ts:51, session-spawner.ts:42, transcript-spawner.ts:43 |
| L-102 | `node dist/supervisor.js` | 3 | constitution.md:496, 0010:21, glossary.md:628 |

## Verdict

- Critical: 0
- High: 2 (D: H-101、C: H-102)
- Medium: 4 (D: M-101 / M-102 / M-103、H: M-104)
- Low: 2 (D: L-101、C: L-102)
- Round inheritance: resolved from R1: 18 / unresolved: 0 / new: 8

Critical を 0 とした理由: H-101 は accepted の AD-030 §5 の性質に反する設計を plan が採っている点で Critical の候補になるが、AD-030 §5 の文面が直接縛っているのは列挙の本体であり、supervisor への適用は spec FR-001 の宣言によること、調停の手段が明確にあることから High とした。どちらも行わないまま AD-043 を accepted にした場合は Critical 相当の ADR drift になる。
