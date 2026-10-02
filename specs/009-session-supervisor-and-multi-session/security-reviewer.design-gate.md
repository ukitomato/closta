# security-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md (plan.md / tasks.md と bundle でレビュー)
**Round**: 3

## 初回読了 viewpoint

**本 PR が実装・影響する FR/SC**
- FR-001 / FR-003: transport が本文の出口を作る。port は一方向。
- FR-004: sessionId は Worker インスタンスで付け直す。世代と単調性は `acceptBatch` で確かめる。
- FR-005: 上限 10。予約は同期区間で行う。
- FR-007: requestId を UUID にし、発行したスレッドに束縛する。
- FR-008 / FR-010: renderer は全セッションの port を保持する。port は `Map` に待避する。
- FR-012 / FR-013: pid を検証して回収する。生成時刻による本人確認は行わない ([ASSUMED])。
- FR-014: renderer の再読み込みとクラッシュで全セッションを止める (`killAll`)。終了処理は 1 回だけ走り、全体に期限を持つ。
- SC-002 / SC-004 / SC-005 / SC-006 / SC-007 / SC-008 / SC-009

**touched files に該当する charter / Confirmation**
- session charter 業務ルール: 逐次パースは supervisor で行う。プリセットに長期資格情報を含めない。
- AD-036 §2 (port は一方向) / AD-034 §1 (port transfer)。
- AD-023 のセキュリティ要件: `src/main/app/window.ts:64-83` の `setWindowOpenHandler` と `will-navigate`。preload は capability を 1 つだけ公開する (`src/preload/index.ts:14-31`)。
- Constitution Principle V (env・本文をログや状態通知に載せない)。
- AD-043 (proposed) Decision 5 / 7。

**viewpoint 別の集計**
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:1 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲 (枠の計数・glossary 追随は C の担当)
- D. Constitution / ADR drift: 該当なし: AD-043 の読み替えの妥当性と Principle IX / VII の PATCH は architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: 永続化スキーマ・WCAG・i18n は変わらず、自分の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。前回の M-001〜M-004 / L-001 はテストの受け皿まで含めて解消を確認した。今回の H-001 と M-001 を検出するテストが BE-021 に無いこと、`killAll` の契機と件数のログ規定が無いことは、各推奨アクションに含めた。

## スコープ要約

R2 の自分の指摘 5 件は、すべて plan / spec / tasks に受け皿ができた (`isAcceptablePid` の共有、本人確認をしない理由と残余の記録、port 待避の `Map` 化、Worker の `resourceLimits`、直送分岐の構造検査)。R3 の新規指摘は、R2-H-03 の解消策として足された「renderer の再読み込み・クラッシュで `killAll`」の周りに集中している。

**H-001** (検知契機の選び方): 会話由来の markdown リンクを 1 回クリックするだけで、全セッションが kill される経路が既存コードとの組み合わせで成立する。
**M-001** (起動途中の要求): 再読み込みの時点で起動途中だった要求は `killAll` を逃れ、完了後は新しいページからは見えないまま枠を占め続ける。

## Findings

### [High] `killAll` の検知契機 `did-start-navigation` と、既存のナビゲーション規則の組み合わせで、会話由来のリンク 1 クリックが全セッションの強制終了になる (H-001) (scope: feature) — new

- **観察**:
  - `plan.md:222` は、`render-process-gone` と「`did-start-navigation` のうち main frame の同一文書でないもの」で `killAll()` を呼ぶと書く。
  - `src/renderer/src/lib/safe-url.ts:38-39` は会話由来 markdown の `a` の href で、scheme の無い相対 URL を常に許可する。
  - `src/renderer/src/components/markdown-text.tsx:153-161` の `a` は `target` を持たない。クリックはトップレベル遷移になる。
  - `src/main/app/window.ts:70-83` の `will-navigate` は、`allowedOrigins()` に含まれる origin への遷移を許可する。相対 href は配信元 origin に解決されるので通る。
  - その結果、文書が入れ替わり、`did-start-navigation` が発火して全セッションに kill が送られる。
  - 外部 https リンクは `will-navigate` で取り消されるが、Chromium では `DidStartNavigation` が NavigationThrottle より先に評価されるため、取り消される遷移でも `did-start-navigation` が先に発火しうる (要実測)。
- **同種事象探索**: `did-start-navigation|render-process-gone` を src/main で 0 件 (新設経路)、plan では 1 件 (`plan.md:222`)。`will-navigate|setWindowOpenHandler` は 2 件 (`window.ts:64`, `:70`)。会話由来の `a` の描画は 1 件 (`markdown-text.tsx:153`)、相対 URL の許可は 1 件 (`safe-url.ts:39`)。
- **リスク/影響**: assistant 出力は外部由来で、プロンプトインジェクションで相対リンクを含む応答を作らせることもできる。1 回のクリックで最大 10 本の `claude` が強制終了される (X-1 FR-016 の破損警告の対象)。X-1 では影響が 1 本だけだったが、X-5 では全セッションに広がる。実害は利用者のクリックを要するので High とする。
- **推奨アクション**:
  1. renderer は SPA であり正当な文書遷移を持たない。`will-navigate` は**同一 origin を含めて全遷移を `preventDefault`** し、http(s) なら `openExternalIfHttp` に回す。再読み込みは `will-navigate` を発火しないので影響を受けない。`window.ts` を plan の touched files に加える。
  2. 会話由来の `a` の相対 href を落とす (アンカー `#` だけ残す) か、`target="_blank"` を付けて `setWindowOpenHandler` に寄せる。どちらにするかは ui domain と調整する。
  3. `killAll` の検知契機は、「取り消されうる遷移の開始」ではなく「確定した文書の入れ替わり」にする (`did-navigate` (main frame) / `render-process-gone` / preload が起動時に送る page epoch)。
  4. BE-021 に負例を 2 つ足す (取り消された遷移では `killAll` が呼ばれない / 同一 origin の相対遷移が拒否される)。
  5. `killAll` に契機 (reload / crash) と件数だけを出すログ 1 行を規定する。
- **根拠**: SEC-5、AD-023 セキュリティ要件 (遷移拒否)、FR-014、X-1 FR-016、CWE-400。
- **scope 根拠**: plan main/app 節 (`index.ts` / `window.ts`) と BE-021 で直接修正できる。

### [Medium] renderer の再読み込み時点で起動途中 (予約済み・`prepareLaunch` 待ち) の要求が `killAll` を逃れ、新しいページからは見えないまま枠を占め続ける (M-001) (scope: feature) — new

- **観察**: launch は同期区間で予約 → `await prepareLaunch` → supervisor 接続の `launch` → registry に登録、の順で進む (`plan.md:212`)。`killAll()` は「全セッションに kill を送る」とだけ書き、`reserved` 中の要求を打ち切る規定が無い (`plan.md:216`)。起動完了後、`ipc.ts:284` の `event.sender.postMessage` が port を新しいページへ送り、新しいページは「起動要求を出していない sessionId の port」として close する。セッションは registry に `claudeAlive: true` で残り、枠を 1 つ占める。
- **同種事象探索**: `killAll` を plan / tasks で 3 件 (`plan.md:216`, `:222`, `tasks.md:136`)。いずれも予約中の要求に触れていない。
- **リスク/影響**: 見えない `claude` が導出 env を持ったまま常駐し、再読み込みを繰り返すと見えない枠が溜まる (CWE-772)。競合が要るので Medium。
- **推奨アクション**: launch-service に renderer の epoch (または `killAll` の世代) を持たせ、予約時に記録し、`prepareLaunch` / fork から戻った時点で epoch が変わっていたら登録せずに kill する (fork 前なら枠を戻して拒否)。BE-021 に単体を足す。
- **根拠**: FR-014、FR-005、CWE-772、SEC-4。
- **scope 根拠**: plan main/app 節と BE-021 で直接修正できる。

### [Low] 調停役スレッドの `isAcceptablePid` の除外集合に親プロセス (main) の pid が無い (L-001) (scope: feature) — new

- **観察**: `plan.md:173` は `isAcceptablePid(pid, [selfPid])` で supervisor 自身だけを除外する。main 側 (`plan.md:196`) は `[process.pid, supervisorPid]` を除外している。Worker が誤って親の pid を報告すると、Electron main が落ちる。
- **推奨アクション**: `runSupervisor` の deps に `parentPid` (`process.ppid`) を足し、除外集合に含める。BE-005 の負例に親の pid を加える。
- **根拠**: CWE-283、AD-043 Decision 5。

### [Low] spec の [ASSUMED] の残余記述が、supervisor の異常終了時の回収だけを対象にしており、Worker 異常終了時の `killPid` 経路の残余を含まない (L-002) (scope: feature) — new

- **観察**: `spec.md:279` の [ASSUMED] は supervisor の異常終了時の回収だけを主語にしている。Worker 異常終了時に調停役スレッドが本人確認なしで kill する経路 (`plan.md:176`、Decision 5) は spec の Assumptions に現れない。判断そのものは尊重する。
- **推奨アクション**: `spec.md:279` の主語を、両方の回収経路 (いずれも作る場合) に広げる。
- **根拠**: FR-012 / FR-013、AD-043 Decision 5。

### [Low] renderer の port 待避で「起動要求を出していない sessionId」をいつ判定するかが未定義 (L-003) (scope: feature) — R2 M-002 の解消策の細部

- **観察**: handshake 前に届いた port は届いた時点ではどれも「未知の sessionId」に見え、「未要求」と確定できるのは要求中の launch がすべて応答を返した後だけ。確定の時点と、待避の上限・掃除の契機が書かれていない。
- **推奨アクション**: 「待避した port は、要求中の launch が 0 件になった時点で、handshake の sessionId と一致しないものを close する。待避の件数は要求中の launch の件数を超えない」を足す。FE-013 に「要求中の launch が無いときに届いた port は即 close」を足す。
- **根拠**: SEC-4、CWE-345、FR-008。

### [Low] 新設の `endSession` IPC の負例テストが BE-010 の列挙に無い (L-004) (scope: feature) — new

- **観察**: BE-010 の負例は、どのハンドラで試すかが特定されていない。既存の `handleKillSession` 等と同じ `isValidSessionId` 検証が `handleEndSession` にもあることを固定するテストの記述が無い。
- **推奨アクション**: BE-010 に「`handleEndSession` を直接呼び、UUID でない sessionId・未知・`threadAlive: false` では supervisor 接続に何も届かない」を明記する。
- **根拠**: SEC-4、SC-005。

## 前 Round 指摘の判定

| R2 ID | 判定 | 根拠 |
|---|---|---|
| M-001 調停役の `killPid` 経路に pid の検証が無い | resolved (除外集合の細部は今回の L-001) | `plan.md:148`, `:173`, `:176`, `:254`, `tasks.md:27`, `:58`, `:141` |
| M-002 renderer の port 待避が 1 枠 | resolved (判定時点の細部は今回の L-003) | `plan.md:228`, `tasks.md:77`, `:95`, `spec.md:299` |
| M-003 Worker に `resourceLimits` が無い | resolved | `plan.md:179`, `:250`, `:256`, `spec.md:278`, `:300`, `tasks.md:14`, `:62`, `:139` |
| M-004 本人確認データの入手経路が無い | resolved ([ASSUMED] として残余を記録。記述範囲の不足は今回の L-002) | `spec.md:279`, `plan.md:37`, `:198`, `:254`, `:284` |
| L-001 直送分岐の port inbound 検査 | resolved | `plan.md:190`, `tasks.md:117` |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `did-start-navigation\|render-process-gone` (src/main) / plan | 0 / 1 | plan.md:222 |
| H-001 | `will-navigate\|setWindowOpenHandler` (src/main) | 2 | src/main/app/window.ts:64, :70 |
| H-001 | markdown `a` 描画 / 相対 URL の許可 | 1 / 1 | markdown-text.tsx:153 / safe-url.ts:39 |
| M-001 | `killAll` (plan / tasks) | 3 | plan.md:216, :222, tasks.md:136 |
| L-001 | `isAcceptablePid` (plan) | 4 | plan.md:148, :173, :196, :254 |
| L-002 | `本人確認` (spec / plan) | 1 / 3 | spec.md:279 / plan.md:176, :198, :254 |
| L-003 | `Map<sessionId, MessagePort>` | 2 | plan.md:228, tasks.md:77 |
| L-004 | `isValidSessionId` (session-ipc.ts) / `endSession` の検証 | 5 / 0 | session-ipc.ts:91, :193, :209, :224, :233 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 4
- Round inheritance: resolved from R2: 5 / unresolved: 0 / new: 6
