# security-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**実施日時**: 2026-10-01T00:00:00+09:00
**レビュアー**: security-reviewer
**対象 spec**: specs/009-session-supervisor-and-multi-session/spec.md (plan.md / tasks.md と bundle でレビュー)
**Round**: 2

## 初回読了 viewpoint

**影響を受ける FR/SC**
- FR-001 / FR-002: 単一 supervisor。調停役は本文を解釈しない。
- FR-003: port は一方向で、supervisor は port から何も受理しない。
- FR-004: 状態通知の sessionId は送信元のスレッドから付ける。main は世代と単調性を検証する。
- FR-005: 上限 10。
- FR-007: requestId を暗号論的乱数で作り、発行したスレッドに束縛する。
- FR-008: renderer は全セッションの port を繋いだまま保持する。
- FR-012 / FR-013: 失敗の閉じ込め、supervisor-exited、孤児回収 (SH-000 の結果次第)。
- FR-014: 終了処理は 1 回だけ走り、全体に期限を持つ。
- SC-002 / SC-004 / SC-005 / SC-007 / SC-008 / SC-009

**touched files に該当する charter / Confirmation**
- session charter の業務ルール (逐次パースは supervisor で行う。プリセットに長期資格情報を含めない)
- AD-036 §2 (port は一方向) / AD-036 §6 (env は許可リスト)
- AD-034 §1 / AD-041 (e) (資格情報は wsl.exe の spawn env にだけ載せる)
- Constitution Principle V (ログに混ぜない、漏洩面を広げない)
- AD-043 Decision 5 / 7 (proposed): pid の検証と本人確認、`SHARE_ENV` の禁止

**viewpoint 別の集計**
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:3 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (枠の計数規則と glossary 追随は C owner)
- D. Constitution / ADR drift: 該当なし: AD-043 による読み替えの妥当性と Principle IX の PATCH は architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: 永続化スキーマ・WCAG・i18n は変わらず、自分の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。H の観点で見た結果は次のとおり。
  - 前回の M-006 (requestId の検証が main の単体に置かれていた問題) は BE-002 / SC-005 の計測経路の分割で resolved。
  - 観測点は FR-013 / BE-020 のログ 1 行で埋まった。
  - 残るテストの欠落は M-001 (BE-022 に pid の負例が無い) と M-002 (FE-013 に並行起動で port が先着する負例が無い) の推奨アクションに含めた。
  - 既存回帰の根拠は SH-011 (単一セッション不変を前提にしたテストの書き換え理由をテスト名に残す) が担う。

## スコープ要約

R1 の指摘を受けて、セキュリティ関連の規則が 3 つのファイルに書き足された。

**plan.md**
- 制御行の decoder を `supervisor-protocol.ts` に新設した (`event` の kind は受け付けない。行は `JSON.stringify` で組む)。
- Worker 由来メッセージの sessionId を、Worker インスタンスで付け直す。
- 世代番号を持たせ、`claudeAlive` は true→false の一方向だけにした。
- Worker は env 未指定で起こし、`SHARE_ENV` を禁止した (項目 20)。spec は最初の message でだけ渡し、以後は保持しない。
- fork は `stdio: 'ignore'` を維持する。ログに出すのは理由キーと件数だけ。
- main の pid 回収 (`reap-wsl-launchers.ts`) は条件付きにした。pid を検証し、kill の前に本人確認をする。
- before-quit に再入ガードと全体期限 5 秒を付けた。
- E2E は本物の起動調停と fake の supervisor 接続で組み、二重ゲートの内側に置いた。
- requestId は UUID 述語で検証する。renderer の本文は decoder を通す。

**spec.md**: FR-004 / FR-007 / FR-014 に上記の規則が入った。

**tasks.md**: BE-002 / BE-004 / BE-005 / BE-013 / BE-014 / BE-021 / BE-023 に負例のテストが入った。

R1 の自分の High 2 件のうち、H-002 は完全に解消した。H-001 は main 側の回収経路では解消したが、**調停役スレッド側に新しく置かれた `killPid` 経路**に同じ検証が適用されていない。R2 の新規指摘は 3 つ。
- renderer で、port の受け渡しの待避が 1 枠しか無い問題 (並行起動で顕在化する)。
- Worker 単位のメモリ上限が無く、1 セッションの OOM が全セッションに及ぶ問題。
- 本人確認に使うデータの入手経路が無い問題。

## Findings

### [Medium] 調停役スレッドの `killPid` 経路に、main の回収経路と同じ pid の検証と本人確認が規定されていない (M-001) (scope: feature) — unresolved from prev (R1 H-001 の残余。main 側は解消したので High から降格)

- **観察**:
  - main 側の回収 (`plan.md:185-187`) には 3 つの規則がある: pid が `Number.isSafeInteger(pid) && pid > 0` / `process.pid` でも supervisor の pid でもない / kill の前に本人確認。
  - 一方 `plan.md:164` の調停役スレッドの規則は「`child-exited` を受けていない場合に限り **記録した pid を `killPid` で止めてから** false にする」だけである。Worker から届く `{ kind: 'spawned', pid }` (`plan.md:171`) の pid の形を検証する規則が無い。`plan.md:159` の envelope 検証は「`kind` は enum、`payload` は string」だけで、`spawned` の `pid` には触れていない。
  - AD-043 Decision 5 (`plan.md:233`) は「pid は検証し、kill 前に本人確認をする」と経路を区別せずに書く。しかし agents 節にも BE-022 (`tasks.md:124-127`) にも、この規則の受け皿が無い。
  - BE-023 (`tasks.md:130`) にある `0` / 負値 / 非整数 / `process.pid` の負例は main 側のものだけである。
- **同種事象探索**: `process\.kill\(` を `src/` で検索すると 0 件 (新設経路)。plan.md の `killPid` は 3 件 (`plan.md:156`, `:164`, `:180`) あり、どれにも pid の検証規則が無い。
- **リスク/影響**:
  - Windows の libuv では `process.kill(0)` が呼び出したプロセス自身を対象にする。このため Worker が誤った `pid: 0` を報告すると、supervisor 自身が落ちて全セッションが `supervisor-exited` になる。
  - Worker が死ぬ直前に子が終わっていた場合、`child-exited` の送信が間に合わずに失われうる。Windows は pid を早く再利用するので、無関係なプロセスを TerminateProcess する窓が残る。
  - この経路は SH-000 (3) で「Worker の `terminate()` で子が残る」と分かった場合に限って作る (`plan.md:180`)。そのため Medium とする。
- **推奨アクション**:
  1. pid を受理する述語 (`isAcceptablePid(pid, selfPid, ...)`) を domain に置き、main の回収と調停役の `killPid` の両方から呼ぶ。
  2. supervisor-core で `spawned` を受けるときの条件を plan agents 節に足す (安全な正の整数 / `process.pid` ではない / その Worker で初回)。
  3. 本人確認 (M-004) が成り立たない場合に、調停役の `killPid` をどう扱うかを AD-043 Decision 5 に明記する。
  4. BE-022 に負例を足す (`pid` が `0` / 負値 / 非整数 / `process.pid` / 2 回目の `spawned` で `killPid` が呼ばれない)。
- **根拠**: CWE-20 / CWE-283、AD-043 Decision 5、FR-012。
- **scope 根拠**: plan agents 節と BE-005 / BE-022 で直接修正できる。

### [Medium] renderer の port 受け渡しの待避が 1 枠で、sessionId を鍵にした束縛がない (M-002) (scope: feature) — new

- **観察**:
  - 現行の `src/renderer/src/features/session/useLiveSession.ts:179-181` は、handshake 前に届いた port を `bufferedRef.current = { sessionId, port }` の**単一スロット**に退避する。`useLiveSession.ts:203` のコメントは「別 sessionId の残りは照合で弾かれ無害」と書く。単一セッション不変があったので成立していた前提である。
  - plan renderer 節 (`plan.md:212-217`) と FE-001 (`tasks.md:66`) は「各セッションの port listener は store に書き込む」と書くだけで、handshake より先に届いた port を sessionId を鍵に待避すること、起動要求を出していない sessionId の port を close して捨てることが規定されていない。
  - FE-013 (`tasks.md:82-87`) にも、並行起動で port が先に届く場合の負例が無い。
  - 起点の `window` message の origin / source 検証 (`useLiveSession.ts:174`) は良い前例なので、維持する必要がある。
- **同種事象探索**: `SESSION_PORT_MESSAGE|bufferedRef` を `src/renderer` で検索すると、受信側は `useLiveSession.ts:174-181` の 1 箇所だけ。transcript 側の `useTranscript.ts:103-104` は requestToken で照合している。
- **リスク/影響**: 2 件の起動が同時に進むと、待避スロットが上書きされ、先に起動したセッションの port が失われる。実装によっては別セッションの transcript に port が繋がる。閉じた後の遅延 port を受理すると、保持から消えたセッションの本文が再び溜まる。
- **推奨アクション**: store の待避を `Map<sessionId, MessagePort>` にし、handshake が返した sessionId とだけ結び付ける。未要求・閉じ済みの sessionId の port は `close()` して捨てる。origin / source の検証は既存の形のまま store 側に移す。FE-013 に負例 2 つ (逆順の先着 port / 閉じたセッションの port)。
- **根拠**: SEC-4、CWE-345、FR-008 / FR-010、AD-036 §2。
- **scope 根拠**: FE-001 / FE-013 で直接修正できる。

### [Medium] Worker に `resourceLimits` が無く、1 セッションの OOM が supervisor 全体 (全セッション) に及ぶ (M-003) (scope: feature) — new

- **観察**: spec の位置づけの表 (`spec.md:44`) と AD-043 Consequences (`plan.md:236`) は「supervisor の OOM / ネイティブクラッシュで全セッションが落ちる」を代償として受け入れている。ところが `plan.md:167` / BE-006 (`tasks.md:55`) の `new Worker(path)` には、メモリ上限の指定が無い。SDK 内部のバッファは有界でない。
- **同種事象探索**: `resourceLimits|crashReporter` を `src/` で検索すると 0 件 (新設経路)。
- **リスク/影響**: 1 つの Worker のヒープが膨らむとプロセス全体の V8 上限に達しうる。Worker 単位で上限を掛けると、超過は `ERR_WORKER_OUT_OF_MEMORY` として Worker の `error` / `exit` になり、既存の `process-crashed` 経路に閉じ込められる。防御の提案なので Medium。
- **推奨アクション**: plan agents 節と AD-043 Decision 7 に「Worker は `resourceLimits` を指定して起こす」を足す (値は [ASSUMED]、SH-000 / SH-022 で調整)。BE-022 に OOM 相当の `error` を与える負例を含める。
- **根拠**: CWE-400 / CWE-770、FR-012、AD-023 §6 の根拠 2 の部分回復。
- **scope 根拠**: plan agents 節と BE-006 / BE-022 で直接修正できる。

### [Medium] 本人確認に使う「image 名とプロセス生成時刻」の入手経路が設計に無い (M-004) (scope: feature) — new

- **観察**: `plan.md:187` は「spawn 時に受けた image 名とプロセス生成時刻と照合。照合できなければ kill せず」と書く。しかし Worker→調停役→main の `spawned` は pid しか運ばない (`plan.md:155`, `:171`)。Node には子プロセスの生成時刻を得る API が無い。agents からは native を使えない。main/infra で取るにはプロセス生成か native module が要るが、その置き場も Principle II の扱いも書かれていない。
- **同種事象探索**: plan.md の `生成時刻|image` は 1 件 (`plan.md:187`)。`spawned` の定義 2 件はどちらも pid だけを運ぶ。
- **リスク/影響**: 規則は fail-safe なので、入手経路が無いまま実装すると、回収が一切効かず FR-013 が成り立たないか、実装者が照合を外して誤 kill の窓が戻る。BE-023 が要るのは SH-000 (3) で孤児が残る場合に限られるので Medium。
- **推奨アクション**: 本人確認の手段を SH-000 (3) の実測項目に加え、AD-043 の Confirmation に記録する。手段が無い場合の代替案 (image 名と親 pid の照合に弱める / 回収を諦めて quickstart の観測に留める) も同じ節に書く。
- **根拠**: CWE-283、FR-013、AD-043 Decision 5、Principle II。
- **scope 根拠**: plan main/infra 節、SH-000、BE-023 で直接修正できる。

### [Low] SH-000 (2) で port を Worker へ直送する分岐を採った場合、セッションスレッドが port の inbound を登録しないことが構造検査の対象外になる (L-001) (scope: feature) — new (R1 L-004 は調停役側で resolved)

- **観察**: BE-014 (`tasks.md:104`) の検査対象は `supervisor.ts` / `supervisor-core.ts` だけである。`plan.md:179` の直送分岐では、port を持つのは `sdk-agent-session.ts` になる。現行の `sdk-agent-session.ts` はデータ port に listener を登録していない (現状クリーン)。
- **同種事象探索**: `on\('message'|onmessage` を `src/agents/sdk-agent-session.ts` で検索すると 1 件 (`:500`。parentPort 側)。
- **推奨アクション**: BE-014 の対象に「直送分岐を採った場合は `sdk-agent-session.ts` も、セッション port に listener を登録しない」を条件付きで足す。
- **根拠**: AD-036 §2、FR-003。
- **scope 根拠**: BE-014 で直接修正できる。

## 前 Round 指摘の判定

| R1 ID | 判定 | 根拠 |
|---|---|---|
| H-001 pid kill の検証と本人確認 | **一部 resolved** (main 側)。残りは M-001 / M-004 | `plan.md:185-187`, `tasks.md:130`, 項目 19 (`plan.md:247`) |
| H-002 sessionId の束縛・世代・単調性 | resolved | `spec.md:177-178`, `plan.md:142`, `:159`, `:194-201`, `tasks.md:49`, `:103`, `:120` |
| M-001 調停役の受信行 decoder | resolved | `plan.md:153-155`, `:246`, `tasks.md:46` |
| M-002 資格情報の同居 | resolved | `plan.md:50`, `:158`, `:167`, `:235`, `:248`, `tasks.md:52`, `:55` |
| M-003 ログ・stderr への混入 | resolved | `plan.md:166`, `:193`, `:202`, `spec.md:225`, `tasks.md:54`, `:103`, `:122` |
| M-004 fake の差し込み口 | resolved | `plan.md:167`, `:208`, `tasks.md:102` |
| M-005 before-quit の再入と期限 | resolved | `spec.md:228`, `plan.md:204`, `:207`, `tasks.md:123` |
| M-006 requestId 検証の置き場 | resolved | `spec.md:283-286`, `plan.md:176`, `tasks.md:44`, `:91` |
| L-001 renderer の本文 decoder | resolved | `plan.md:213`, `tasks.md:66`, `:87` |
| L-002 envelope の JSON.stringify | resolved | `plan.md:155`, `tasks.md:46` |
| L-003 requestId の UUID 述語 | resolved | `plan.md:206`, `tasks.md:62`, `:91` |
| L-004 port の一方向性の構造検査 | resolved (調停役側)。直送分岐の残りは L-001 | `plan.md:161`, `tasks.md:104` |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `process\.kill\(` (src/) / `killPid` (plan.md) | 0 / 3 | plan.md:156, :164, :180 |
| M-002 | `SESSION_PORT_MESSAGE\|bufferedRef` (src/renderer) | 1 箇所 | src/renderer/src/features/session/useLiveSession.ts:174-181 (照合の前例は useTranscript.ts:103-104) |
| M-003 | `resourceLimits\|crashReporter` (src/) | 0 | — |
| M-004 | `生成時刻\|image` / `spawned` (plan.md) | 1 / 2 | plan.md:187 / :155, :171 |
| L-001 | `on\('message'\|onmessage` (src/agents/sdk-agent-session.ts) | 1 | src/agents/sdk-agent-session.ts:500 |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 1
- Round inheritance: resolved from R1: 11 / unresolved: 1 (H-001 の残り = M-001、High→Medium) / new: 4 (M-002, M-003, M-004, L-001)
