# platform-boundary-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06 (pr-gate R2、system scope の track)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-016 / SC-008 (`listRuntimes` を待つ間も `loading`。取得時刻 0 の通知を受けない)、FR-007 (`dismissLaunchNotice`)、FR-006 (`watchedId` が `launchOpen` も見る。境界には関わらない)、FR-011 (E2E と perf は変わっていない)
- touched files に該当する charter / Confirmation: runtime charter の KPI「検出の所要時間」(:129) と判定バッチの余裕が薄いという注記 (:209)、`wsl-detector.ts:40-48` の C-1、`runtime-store.ts:28`、R-2 の `ipc-session-list.md:60`、glossary.md:36-37、Constitution Principle II / III、AD-003。AD-004 / AD-012 の領域に差分はない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R1 の後の修正のうち境界に関わるのは、`useSessions.ts` の `setLoading(true)` と取得時刻 0 の除外、`reviewers.yml` の `src/main/index.ts`、`index.ts` の注記、`dismissLaunchNotice`。main の差分は注記だけ。IPC・preload・`protocol.ts`・`runtime-store.ts`・`session-service.ts`・`eslint.config.mjs` は差分なし。

### R1 の指摘ごとの判定

| R1 ID | 判定 | 根拠 (観察) |
|---|---|---|
| M-001 | **unresolved** (system に移した) | `runtime-store.ts:114-124` は不変。roadmap の (3) に記録はあるが、R1 の推奨テスト (c) が抜けている |
| M-002 | **resolved** | `reviewers.yml:159` に `"src/main/index.ts"`。`glob_to_re` で完全一致することを確かめた |
| L-001 | **resolved** | `RunningSessionsProvider.tsx:106` は「assistant-ui の runtime は 1 つ」。同じ種類の残りは L-102 |
| L-002 | **partially** | 注記は事実どおりになった。V-3 に `probe-batch` の計測は足されていない |
| L-003 | **unresolved** (system に移した) | roadmap の (5) に記録 |
| L-004 | **partially** | renderer の側は塞がった。main の側は roadmap の (4) に移した |

### R2 の修正の検証 (指摘にはしない事実)

- **取得時刻 0 の除外は、正しい通知を落とさない**: `fetchedAt` が書き換わるのは `commit` (`session-service.ts:551`) だけで値は `Date.now()`。値が 0 になるのは最初の commit より前の snapshot だけで、セッションを持たない。判定の完了による `onRuntimesChanged` は最初の commit の後なら 0 でなく受けられ、前に届いた分はその後の commit の regroup に反映される。最初の取得が IPC で失敗した後の 0 の通知を落とすのはむしろ正しい。E2E の capability は `Date.now()` を使う
- **`loading` の立て方は FR-016 の順序と矛盾しない**: 起動の直後に検出より先に列挙できた唯一の入口 (見出しのボタン) は閉じた。最初の描画と passive effect のあいだの 1 フレームは busy にならないが、実際に押せる経路は観察していない
- **`dismissLaunchNotice` は権限のゲートに触れない**: 消すのは告知だけで、`lastConfig` の `permissionMode` は安全 3 値の型

## Findings

### [Medium] `listRuntimes` の待ちが「検出の完了を待つ」ではなく「検出をもう 1 本起こす」になっている (M-001) (scope: system)

- **観察**: R1 と同じ。R2 で見えたこと: roadmap の (3) が写したのは R1 の推奨テストの (a)(b) だけで、**(c)「`probeAll` の後に解決した `list()` が判定の結果を消さない」が抜けている**。遅れて終わった `detect()` は `byId` を丸ごと置き換え (`runtime-store.ts:86`)、`list()` の経路は `notify()` を呼ばないので、main の判定の基準は「判定中」のまま残り、renderer の表示と食い違いうる (安全側には倒れる。実機では未観察)
- **同種事象探索**: `listRuntimes\(` 3 件、`useRuntimes()` の呼び出し元 5 件、`if (!detected) await detect()` 3 件、並行の `list()` のテスト 0 件
- **推奨アクション**: `runtime-store.ts` で single-flight にし (a)(b)(c) のテストを足す (system)。**この PR でできること**: roadmap の (3) に (c) を 1 文で書き足す
- **根拠**: runtime charter Journey 1 と不変条件、`wsl-detector.ts:40-48`、`runtime-store.ts:28`
- **scope 根拠**: 直す場所は touched files の外。roadmap の追記だけは feature で直せる

### [Low] V-3 に起動時の `probe-batch` の計測がない (L-002) (scope: feature)

- **推奨アクション**: roadmap の (3) に「single-flight を入れたら、過去の区画をマウントした状態で起動時の `probe-batch` を測る」と 1 文足し、quickstart-results に「未計測」と明記する
- **根拠**: runtime charter の KPI「検出の所要時間」と :209

### [Low] Constitution 検証の項目 8 は `navigator.*` を見ない (L-003) (scope: system)

- **推奨アクション**: roadmap の (5) に記録済み。項目 8 の持ち主に送る

### [Low] main は今も、初回の取得の前に取得時刻 0 の索引を publish する (L-004) (scope: system)

- **推奨アクション**: roadmap の (4) のとおり main の側で `!loaded` のときは publish しない。テストを足す

### [Low] renderer の除外の条件「取得時刻 0 = 未取得」が契約に書かれておらず、main のテストでも固定されていない (L-101) (scope: feature)

- **観察**: `useSessions.ts:93` の `if (next.fetchedAt === 0) return` は main の内部の初期値 `let fetchedAt = 0` (`session-service.ts:189`) に依存する。DTO の文書 (`dto.ts:132-133`) と R-2 の契約に 0 の意味は無く、取得前の snapshot が 0 であることを固定するテストも 0 件。IPC の境界を越える暗黙の前提で、(4) を直す人が変えると除外は警告なしに効かなくなる
- **推奨アクション**: roadmap の (4) に「main で `!loaded` の publish を止めたら `useSessions.ts` の除外を消すか、残すなら『取得時刻 0 = 未取得』を `SessionIndexDTO.fetchedAt` の文書に書く。`session-service.test.ts` で固定する」を書き足す。`useSessions.ts` の注記に生産側の行 `session-service.ts:189` を書く
- **根拠**: R-2 FR-034、`ipc-session-list.md:60`

### [Low] O-7 で足した文書に、どちらの runtime かを書いていない「runtime」が残る (L-102) (scope: feature)

- **観察**: `docs/ui-coverage.md:338` の「1 つの runtime の thread list」「2 つの runtime の一覧」と、写し元の `research.md:45` (3 か所) は assistant-ui の runtime であることを書いていない。glossary.md:36-37 の規則に反する
- **推奨アクション**: 「assistant-ui の runtime」と明記する
- **根拠**: glossary の `AgentRuntime` の Counterexamples、AD-003

### 観点ごとの該当なし

- PB-1: パスの扱いの差分なし。PB-2: 指摘は M-001 と L-102 だけ。PB-3: `capabilities` の扱いの差分なし。PB-4: `dismissLaunchNotice` は告知を消すだけ。PB-5: パスの変換の差分なし。PB-6: 永続化と依存の追加なし。PB-7: M-002 は解消、L-003 は残る。規則は緩んでいない

### H の実質

- R2 の新しいテスト (`SessionListScreen.test.tsx:1154-1188`) は待っている間の `aria-busy`・busy のボタンで列挙しないこと・値 0 の通知で取得中が外れないことを固定する
- L-101 と M-001 を検出できる main 側のテストは 0 件
- SC-008 の実機の目視 (V-3 #2) は 2026-10-05 に OK。PR の CI の e2e の合否はまだ記録されていない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `listRuntimes\(` (renderer、テスト以外) | 3 | useRuntimes.ts:50,96; useSessions.ts:85 |
| M-001 | `useRuntimes\(\)` | 5 | RunningSessionsProvider.tsx:42; LaunchDialog.tsx:174; WorkspaceFoldersScreen.tsx:324; ResolutionScreen.tsx:152; RuntimeListScreen.tsx:161 |
| L-003 | `navigator` (scripts/constitution) | 0 | — |
| L-004 | 取得前に発火しうる `publish()` | 2 | session-service.ts:770,781 |
| L-101 | `fetchedAt === 0\|fetchedAt = 0` (src、テスト以外) | 2 (契約での定義は 0) | useSessions.ts:93; session-service.ts:189 |
| L-102 | どちらか明記のない `runtime の` | 2 + 3 | ui-coverage.md:338; research.md:45 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 5
- Round inheritance: resolved from 1: 2 (M-002 / L-001) / unresolved: 4 (M-001 / L-003 は未対応。L-002 / L-004 は一部だけ対応) / new: 2 (L-101 / L-102)

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
