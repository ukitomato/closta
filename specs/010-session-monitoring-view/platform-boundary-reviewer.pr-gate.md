# platform-boundary-reviewer Review: セッション監視ビュー (O-1) — pr-gate Round 1 (system scope)

**Run**: 2026-10-03
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 1 (pr-gate, base 949ad1b … HEAD 0ba910f)

**結論**: Critical / High / Medium はなく、Low が 1 件ある (perf の後始末の観測性)。code-gate での自分の track の指摘は、すべて十分に直されたか roadmap に記録されているので、再指摘しない。

## 初回読了 viewpoint

- FR / SC:
  - **FR-010 / SC-006 (境界を変えない)**: `pr-gate-r1.diff` の diff のヘッダを見ると、`src/main`、`src/preload`、`src/agents`、`src/domain` の下に変更はない。
  - **FR-011 / SC-004**: `e2e/multi-session.spec.ts` と `e2e/support/input-probe.ts`。probe は中身を変えずに切り出されている (しきい値も p95 の式も同じ)。
  - **FR-012 / SC-005**: `perf/real-sessions.spec.ts`、`playwright.perf.config.ts`、`perf/tsconfig.json`、`verify.yml` の `typecheck (perf)` の step。
  - **FR-001〜FR-009**: renderer のストア、導出、表示だけを変える。
- touched file に当てはまる Charter と Confirmation:
  - AD-003: 複数のランタイムから 1 つを選ぶこと。触れるのは perf のハーネスだけ。
  - AD-004: branded path。`folderLabel` は表示名でしかない。
  - AD-012: 当てはまらない。
  - AD-038 D2/D3: perf/ は類推で src のグラフの外に置かれ、CI で流す経路の外にある。
  - AD-043: main に差分がないので、単一 supervisor の構成は変わらない。
  - Constitution Principle I、II、III、VI、VII。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (直近の活動の文字列の無害化も含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-1 は X-5 の稼働中セッション一覧を、renderer の中だけで監視ビューに変える。あわせて、WSL 上で実際の `claude` を 10 本動かし入力の滑らかさを測る実機の perf ハーネス (`perf/` と `playwright.perf.config.ts`) を足す。機械的な強制に触れる変更は次だけである。
- depcruise の `not-to-test` に `perf` を足した
- ESLint の ignores に `perf/**` と `playwright.perf.config.ts` を足した
- perf を型検査する CI の step を足した (流しはしない)

### code-gate の指摘とその扱い

| 指摘 | 今の状態 | 再指摘するか |
|---|---|---|
| M-001 (perf がプロセスを起こすことを機械的に止めるものがない) | `docs/roadmap.md` の system-scope の項目に記録された (diff L347-357)。つなぎの案として ESLint の `no-restricted-imports` のブロックも書かれている。ESLint のコメントも現状と合うようになった (`eslint.config.mjs`、diff L655-657)。 | しない |
| L-001、今の CL-08 (ランタイムを部分一致で選ぶ) | 十分に直された。PB-2 を参照。 | しない |
| L-002、今の CL-09 (権限モードを確かめていない) | 十分に直された。PB-4 を参照。 | しない |
| L-003、今の CL-10 (`not-to-test` の違反サンプルがない) | roadmap に記録された。 | しない |

### 依頼された観点

**1. depcruise の `not-to-test` に `perf` を足したこと (`.dependency-cruiser.js:141-142`)**
- depcruise が走査するのは `src` だけである (`package.json:15`、`depcruise src`)。したがって `from.pathNot` が意味を持つのは src 側だけで、この規則の役目は `to.path` で src→perf の import を捕まえることにある。
- src の中の import はリポジトリのルートからの相対パス (`perf/...`) に解決されるので、`^perf` の一致は効く。
- `doNotFollow` は `node_modules` だけ、`exclude` は asset の query だけなので、perf をグラフから外すものはない。
- ルートにある `playwright.perf.config.ts` はこの規則の対象外である。`playwright.config.ts` もすでに同じで、src からそれを import する箇所はなく、import しても意味を持ちえないので、指摘しない。
- 一致しすぎ (`^perf` は `performance/` にも一致する) と違反サンプルがないことは、L-003 / CL-10 として指摘済み。

**2. perf ハーネスでのランタイムの選び方**
- ランタイムの選択肢の文言は `distroName ?? id` に `（停止中）` を付けたものである (`src/renderer/src/features/session/LaunchDialog.tsx:491-492`)。
- `（停止中）` は `running` 以外のすべての状態で付くので、`probing` や未知の状態も含む。判定は安全側に倒れる。
- `optionIndex` は完全一致を優先し、部分一致が 2 件以上なら `*-ambiguous` で止める。そのあと停止中の判定が `runtime-stopped` で止める (`perf/real-sessions.spec.ts:76-83,106`)。
- 停止中のディストロは文言に必ず接尾辞が付くので、完全一致になることはない。
- ランタイムが 1 つしかないと仮定している箇所は見つからなかった。

**3. 権限モード**
- `pressLaunch` は、10 回の起動のそれぞれの直前に、`aria-label="権限モード"` の select (`LaunchDialog.tsx:592`) を読む。値が `default` でなければ止まる (`perf/real-sessions.spec.ts:87-89`)。
- 確認はクリックの直前に行うので、前回の起動の設定を復元して持ち越された Auto モードがすり抜けることはない。
- perf ハーネスは承認カードにも応答しない。

**4. 後始末と kill のフォールバック**
- `current.process().kill()` (`perf/real-sessions.spec.ts:155`) が対象にするのは、このテストが起動した Electron のプロセスの PID だけである。
- `taskkill /IM`、`wsl --terminate`、`wsl --shutdown` はないので、ほかのプロセスやほかのディストロには触れない。
- 穴が 1 つ残る。下の Low の指摘を参照。

**5. renderer が IPC、preload、capability に触れていないか**
- 追加された行に `window.api`、`ipcRenderer`、`preload`、`autoModeSafe`、`HostPath`、`RuntimePath`、`localStorage`、`process.platform` は 1 回も現れない。
- `capability` が現れるのはテストだけである (`stubCapability`、`SESSION_PORT_MESSAGE`)。
- `folderLabel` は `folderName(config.folderId)` (`SessionScreen.tsx:117`) から取った表示名である。使うのは読み上げだけで、パスの解決、IPC、保存には使わない。
- 密度は永続化されない。

### PB-1〜PB-7

- **PB-1**: 該当なし: IPC や永続化の境界をまたぐパスはない。`folderLabel` は表示用の文字列。
- **PB-2**: 該当なし: renderer に、現在のランタイムを持つモジュールスコープの変数は足されていない。新しく足した `activityTimers`、`statusSince`、`activity` は、ストアのクロージャの中で `sessionId` をキーにしている。perf ハーネスのランタイムの選び方は上に書いたとおり。
- **PB-3**: 該当なし: capability を宣言するコードに触れる差分はない。
- **PB-4**: 該当なし: 権限モードを選ぶ入口は足されていない。`selectNextAwaiting` は表示するセッションを切り替えるだけである。perf ハーネスは起動のたびに直前で `default` を確かめる。
- **PB-5**: 該当なし: パスの変換も endpoint も関わらない。
- **PB-6**: 該当なし: volume、`--restart`、パッケージのインストール、`~/.bashrc` への書き込みはない。`outputDir` は `%TEMP%/closta-perf-results` で、Playwright が実行のたびに消すので、永続環境の構築には当たらない。
- **PB-7**: 該当なし (新規): perf が ESLint と SCAN_ROOTS に守られていないこと (M-001) と、違反サンプルがないこと (L-003) は、どちらも roadmap に記録済み。depcruise の規則は、上に書いたとおり書かれたとおりに効く。

## Findings

### [Low] perf の後始末が kill にフォールバックしても何も残らないので、WSL に `claude` が残っていないか確かめるべきだと操作者にわからない (L-001) (scope: feature)

- **観察**:
  - `afterEach` の `catch` (`perf/real-sessions.spec.ts:154-156`) は `current.process().kill()` を呼び、何も出力しない。
  - この 1 つの `catch` が、別々の 3 つの失敗を受ける。
    - セッションを強制終了させる `page.evaluate` の失敗
    - `close-timeout`
    - `close()` からの例外
  - どの場合も `close()` を飛ばして、プロセスを直接 kill する。
  - この呼び出しが終わらせるのは Electron の main の PID だけで、プロセスツリー全体ではない。
  - セッションは `utilityProcess.fork` で起こした utility process の中で動き (`src/main/app/session-spawner.ts:65`)、その utility process が `wsl.exe` を起こす。
- **推測 (観測していない)**: main のプロセスが kill されると、utility process が起こした `wsl.exe` と、WSL の中の `claude` が生き残る可能性がある。そうなると token を使い、ファイルを読み続ける。確かめてはいない。
- **同種事象探索**: `perf/` と `e2e/` を `process\(\)\.kill\(\)` で Grep。探した範囲では 1 件: `perf/real-sessions.spec.ts:155`。
- **リスク / 影響**:
  - kill (PID 1 つ) を使うかどうかは好みの問題である。どちらにしても、ほかのプロセスには触れない。
  - 問題は、フォールバックが起きた実行が、出力の上では普通の実行とまったく同じに見えることである。流した人には、WSL を `ps` で確かめに行くきっかけがない。
  - これが動くのは利用者が明示的に頼んだときだけで、しかも失敗の経路だけである。
- **推奨修正**:
  - `catch` の中で、`console.log('[O-1 SC-005] teardown=killed')` のような 1 行を出す。理由のキーだけにして、本文は出さない。
  - `quickstart.md` の V-3 の手順と `docs/discovery.md` の perf の行に、この行が出たら `ps` でディストロにプロセスが残っていないか確かめる、という手順を足す。
  - 3 つの失敗の原因を分けるかどうかは任意。
- **根拠**:
  - Constitution Principle VI: 後に残る副作用を残さない。
  - 失敗の経路の観測性 (H)。
- **scope 根拠**: touched file の `perf/real-sessions.spec.ts` と `docs/discovery.md` の中で直せる。

## H (テストと退行) の注記

- **境界の退行**: `src/main`、`src/preload`、`src/agents`、`src/domain` の下に差分はないので、SC-006 を満たしている。
- **CL-08 / CL-09 で足したガードは、実際のアプリに対して一度も動かしていない**:
  - 曖昧さ、停止中、権限モードの確認は Iteration 2 (2026-10-03) で足された。
  - `quickstart-results.md` にある最後の実機の実行は、2026-10-02 の V-3 である。
  - 新しいガードは CI で型検査されただけである。
  - どれも閉じる側に倒れる (誤判定すれば throw する) ので、誤った結果で悪い実行が通ることはない。指摘にはしない。
- **`CLOSTA_E2E=1` で止まる経路は確かめていない**。これは `quickstart-results.md:64` 自身が記録している。これも閉じる側に倒れる。
- **後始末の観測性**: L-001 を参照。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `process\(\)\.kill\(\)` (perf/、e2e/) | 1 (perf) | perf/real-sessions.spec.ts:155 |
| (確認) | 追加行を `window\.(api\|electron)\|ipcRenderer\|preload\|capabilit\|autoModeSafe\|permissionMode\|HostPath\|RuntimePath\|localStorage\|process\.platform` | 7 (すべてテスト) | diff L1365, L1370, L1460, L2514, L2519, L2541, L3329 |
| (確認) | `exclude\|doNotFollow\|includeOnly` (.dependency-cruiser.js) | 2 (どちらも perf を外さない) | .dependency-cruiser.js:326,334 |

## Verdict

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 1 |

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
