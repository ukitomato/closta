# platform-boundary-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-05 (pr-gate R1、system scope の track)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/013-ui-app-shell/spec.md

## 初回読了 viewpoint

- FR/SC: FR-016 / SC-008 (過去の区画の初回の取得はランタイムの一覧の後)、FR-001 / FR-002 (サイドバーの常時マウント)、FR-004 (`RunningSessionsProvider` をシェル全体に)、FR-007、FR-009 (`seedFolderDraft`)、FR-011 (E2E と perf のハーネス)、FR-015
- touched files に該当する charter / Confirmation: runtime charter (Journey 1、不変条件、KPI「検出の所要時間」:129)、`wsl-detector.ts:44-48` の C-1 呼び出し回数の契約、AD-038 Confirmation :113-115 (production-inert)、AD-046 Consequences :40、Constitution Principle I / II / III / VI / VII。AD-003 / AD-004 / AD-012 にパス変換・endpoint の変更はない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

renderer の再構成。main の差分は `src/main/index.ts:192-198` の注記だけ。IPC・preload・`protocol.ts`・`e2e-capability.ts` は scope に無い。境界に触れるのは (1) 過去の区画と `RunningSessionsProvider` がアプリの起動直後からマウントされランタイム検出と同じ時間帯に IPC を発行する、(2) `useSessions.ts:79-90` が `listRuntimes()` の解決を待ってから `listSessions()` を呼ぶ (FR-016)、(3) E2E と perf の起動の入口を `openLaunchDialog` に揃えた、の 3 点。

design-gate R1 の自分の指摘の引き継ぎ: H-001 は renderer 側で塞がった (`listRuntimes` の解決の時点で `runtime-store` の `byId` は埋まっている。`runtime-store.ts:84-93,114-124`)。ただし残りが 2 つ (M-001 / L-004)。M-001 は解消 (`group-label.ts` を共有)。M-002 は半分だけ解消 (component テストは足されたが main 側の前提を固定するテストが無く、V-3 は未実施)。L-001 は解消 (glossary.md:36-37。ただし移した注記に 1 件残る → L-001)。

## Findings

### [Medium] `listRuntimes` の待ちが「検出の完了を待つ」ではなく「検出をもう 1 本起こす」になっている。起動時の検出の本数が mount される呼び出し元の数に比例する (M-001) (scope: system)

- **観察**: `runtime-store.ts:114-124` の `list()` は `if (detected)` を await の前に見て、`detected = true` は `detect()` の完了後 (:92) に立つ。進行中の検出を束ねる仕組み (single-flight) が無い。起動時、main が `index.ts:190` で検出 A を起こし、同じ時間帯に O-7 で起動時にマウントされるようになった 2 つの呼び出し元 (`RunningSessionsProvider.tsx:42` → `useRuntimes.ts:49-50`、`useSessions.ts:80-81`) が `listRuntimes` を発行し、それぞれが `detect()` を走らせる (`detector.list()` 1 回で wsl.exe を並列に 3 本)。起動時の wsl.exe は O-7 以前の 6 本から最大 9 本に増える。畳んだサイドバーは `SessionListScreen` を描かないので、検出中に畳む・開くを繰り返すとそのたびに検出が増える (`wsl-detector.ts:48`「利用者の操作回数にも比例させてはならない (FR-010)」と `runtime-store.ts:28`「未検出なら 1 回だけ検出する」に反する)。後から終わった検出が `probeAll` の置き換えより後に着くと判定の結果が判定前の値に戻りうる (安全側に倒れるが、起動は `capabilities-not-probed` で止まる。実機では観察していない)
- **同種事象探索**: `listRuntimes\(` (renderer、テスト以外) 3 件 (起動時は 2 件)。`if (!detected) await detect()` 形 3 件 (runtime-store.ts:120-122、:136、:185)。並行の `list()` のテストは 0 件
- **リスク/影響**: 起動経路の wsl.exe が 1.5 倍になり runtime charter の KPI (一覧 3,000 ms / 判定バッチ 4,000 ms) を圧迫する。まれに判定の結果が消える
- **推奨アクション**: `runtime-store.ts` で進行中の検出を 1 本に束ねる (`detecting ??= detect().finally(...)`)。`runtime-store.test.ts` に (a) 並行の `list()` で検出 1 回、(b) `list()` の後の `snapshot()` が WSL の descriptor を含む (FR-016 の main 側の前提)、(c) `probeAll` の後に解決した `list()` が判定の結果を消さない、を足す。feature 側の変更は要らない
- **根拠**: runtime charter Journey 1 / 不変条件、`wsl-detector.ts:40-48`、`runtime-store.ts:28`
- **scope 根拠**: 直す場所は touched files の外の `src/main/app/runtime-store.ts`。この PR の新しい呼び出しが顕在化させた既存の欠陥

### [Medium] platform-boundary-reviewer の発火条件に `src/main/index.ts` が無い。そのため、この reviewer の design-gate High (H-001) を閉じる差分が code-gate で一度も見られなかった (M-002) (scope: feature)

- **観察**: `reviewers.yml:146-154` の発火条件は `src/main/app/**` を含むが `src/main/index.ts` を含まない。code-gate はこの reviewer を「一致する変更ファイルが無い」で起動しなかった (`code-gate.md:31`)。今回の起動は `eslint.config.mjs` の注記の 1 行による偶然。`src/main/index.ts` には起動時の検出の結線 (:190)、AD-038 の production-inert の門 (:100)、Principle II の例外注記 `platform-ok:` (:210。注記の正直さは本 reviewer が判定する。constitution.md:404) がある
- **同種事象探索**: `platform-ok:` (src) 7 件。発火条件の外は `src/main/index.ts:210` の 1 件
- **推奨アクション**: `reviewers.yml` の platform-boundary-reviewer の `auto_invoke_patterns` に `"src/main/index.ts"` を足す。renderer 側の結線 (`useSessions.ts`、`features/runtime-list/**`) を入れるかは owner の判断
- **根拠**: AGENTS.md、Constitution Principle II、PB-7
- **scope 根拠**: `reviewers.yml` は touched file

### [Low] 移した注記の「ランタイムは 1 つ」が、この PR で足した glossary の規則に反する (L-001) (scope: feature)

- **観察**: `RunningSessionsProvider.tsx:106` の「**ランタイムは 1 つ**」は assistant-ui の runtime を指すが、glossary が `AgentRuntime` の日本語表記として定める「ランタイム」と同じ語。glossary.md:36-37 は「renderer の文書で runtime と書くときはどちらかを明記する」と定めた
- **推奨アクション**: 「assistant-ui の runtime は 1 つ」と明記する
- **根拠**: glossary `AgentRuntime` の Counterexamples、AD-003

### [Low] `index.ts` の注記「main の起動経路に UNC I/O を伴う子プロセスを乗せない」は字面の上でしか成り立たず、判定バッチとの重なりを隠している (L-002) (scope: feature)

- **観察**: FR-016 の同期点は検出の完了で `probeAll` の開始と同じ時刻 (`index.ts:190`)。起動のたびに過去の区画の初回の列挙が判定バッチと重なる (O-7 以前は利用者が一覧を開くまで起きなかった)。判定バッチの予算 (runtime charter:129「4,000 ms」) を確かめる手順が V-3 に無い
- **推奨アクション**: 注記を「起動の直後に renderer が列挙を起こし、判定バッチと重なる (AD-046)」と事実どおりに書く。quickstart V-3 に「過去の区画が開いた状態で起動し、`probe-batch` の計測値が 4,000 ms 以内」を足す
- **根拠**: runtime charter KPI「検出の所要時間」

### [Low] Constitution 検証の項目 8 は `navigator.*` を見ない (L-003) (scope: system)

- **観察**: `PLATFORM_BRANCH_PATTERNS` (`allowlists.mjs:564-579`) は `process.*` と `os.*` だけ。renderer で使えるプラットフォーム判定は実質 `navigator.*` だけで、シェルはショートカットの表示 (Cmd / Ctrl) のような分岐が最初に現れやすい
- **同種事象探索**: `navigator\.(platform|userAgent|userAgentData)` (src) 0 件、scripts/constitution 0 件。既出: 001 R1 M-004、016 design-gate R2 L-105 (どちらも未対応)
- **推奨アクション**: 項目 8 に `navigator.(platform|userAgent|userAgentData)` を足し、rule-fixtures にサンプルを 1 件 (項目 8 の持ち主に送る)
- **根拠**: Principle II の Verification、PB-7

### [Low] FR-016 の後も、判定バッチの通知が初回の取得の完了前に「未取得の索引」(取得時刻 0) を renderer に配る (L-004) (scope: system)

- **観察**: `composition-root.ts:198` → `session-service.ts:773-782` は `loaded` を見ずに regroup して publish し、取得前の snapshot は `{ groups: [], outcomes: [], fetchedAt: 0, complete: false }`。O-7 で `useSessions.ts:86` の購読が起動直後から張られ、`probeAll` は起動直後に 2 回通知する。renderer の `setIndex` が `loading` を false にし、ヘッダに「取得時刻 1970/01/01 …」が出る (空状態の断言は `coverage === 'pending'` で抑えられている)
- **同種事象探索**: `publish()` (session-service.ts) 6 件。`loaded` を見ずに取得前に発火しうるのは `onFoldersChanged` (:770) と `onRuntimesChanged` (:781) の 2 件。テスト 0 件
- **推奨アクション**: `onRuntimesChanged` / `onFoldersChanged` は `!loaded` のとき publish しない。`session-service.test.ts` にテストを足す
- **根拠**: AD-046 Consequences :40、R-2 FR-034

### 観点ごとの該当なし

- PB-1: `FolderDraftSeed.path` は `PathDTO` を運ぶだけ。概要は所在を `locationLabelOf` / `locationIndexOf` で引き、パスを組み立てない
- PB-2: シェルの store は UI の状態だけ (L-001 の語の問題を除く)
- PB-3: `capabilities` を扱う差分が無い
- PB-4: 起動で選べるのは安全な 3 値だけで、型の段階で昇格モードを持たない (`launch-config.ts:19-29`)。modal にしても「閉じて起動し直す」で `lastConfig` を戻しても昇格の経路はできない
- PB-5: パス変換の差分が無い
- PB-6: 永続化が無い。`vitest-axe` は devDependency だけ
- PB-7: `features/shell/` は `ui` 要素・`no-restricted-imports`・名前空間リテラルの禁止に乗っている。`eslint.config.mjs` の差分は注記 1 行で規則は緩んでいない。renderer から `electron` / main / preload への import は 0 件
- perf の安全柵: 壊れていない (`e2e/support/launch.ts` のトップレベルは import と関数宣言だけで、`CLOSTA_E2E` を立てるのは `launchApp` の子プロセスの env だけ。perf は `openLaunchDialog` しか import しない)
- E2E の production-inert: 壊れていない (差分は locator だけ)

### H の実質

- M-001 を検出できるテストが無い (並行の `list()` と `list()` の解決後の `snapshot()`)
- SC-008 の実機の半分 (V-3) は未実施
- E2E は 11 passed で、落ちた 1 件は基準画像の 1px の差

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `listRuntimes\(` (renderer、テスト以外) | 3 (起動時は 2) | useRuntimes.ts:50,96; useSessions.ts:81 |
| M-001 | `if (!detected) await detect()` 形 (runtime-store.ts) | 3 | runtime-store.ts:120-122,136,185 |
| M-002 | `platform-ok:` (src) | 7 (発火条件の外は 1) | src/main/index.ts:210 |
| L-001 | `ランタイムは 1 つ` (src) | 1 | RunningSessionsProvider.tsx:106 |
| L-002 | `UNC I/O` (src/main/index.ts) | 1 | index.ts:197 |
| L-003 | `navigator\.(platform\|userAgent\|userAgentData)` | 0 / 0 | allowlists.mjs:564-579 に無い |
| L-004 | `publish()` (session-service.ts。取得前に発火しうるもの) | 6 (うち 2) | session-service.ts:770,781 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4

(invoker 注: 保存の際に観察の文を要約した箇所がある。ID・severity・file:line・根拠は原文のまま)
