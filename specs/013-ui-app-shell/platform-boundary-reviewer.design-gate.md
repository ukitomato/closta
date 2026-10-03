# platform-boundary-reviewer レビュー: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/013-ui-app-shell/spec.md

## 初回読了 viewpoint

- 影響する FR/SC: FR-001〜FR-004 (サイドバーの常時マウント)、FR-009 (`seedFolderDraft`)、FR-010、FR-014 / FR-015、SC-001〜SC-003
- 該当 charter / Confirmation: runtime / isolation charter (過去の区画の常時マウントが、ランタイム検出と R-2 の列挙の起動順序の前提に触れる)、AD-004 (`cwdDisplay`)、AD-003 / AD-012 は該当しない、AD-046 の Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- F. 命名 / module / lint hookup: 該当なし: `features/shell/` は boundaries の `ui` (`eslint.config.mjs:254`) と名前空間リテラル禁止 (`:485`) に入る。`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/**` は `App.tsx` / `stores/ui.ts` / `SessionScreen.tsx` を名指ししていない (0 件)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- G. optional reviewer 範囲: 該当なし
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

renderer だけの再構成。権限モードの選択肢は `isSafePermissionMode` (`launch-config.ts:21-29`) と main の起動ゲートで閉じており、起動ダイアログのモーダル化で Principle III の迂回は生じない。ただし過去の区画をアプリの寿命で常時マウントすると「ランタイム検出より前にセッション列挙を走らせない」順序に触れる。

## Findings

### [High] 過去のセッションの区画を常時マウントすると、ランタイム検出より前にセッション列挙が走る (H-001) (scope: feature)

- **観察**: `useSessions.ts:71-77` は初回の `listSessions()` をマウント時に発行し、コメントで「起動時に取らないのは、ランタイム検出より先に実行状態の確認が走ると停止中の所在が『未検出』として並ぶため」。`main/index.ts:190` は起動時に `runtimes.list().then(() => runtimes.probeAll())`、`:192-196`「セッション一覧は起動直後に取らない。一覧を開いたときに取る」。`session-service.ts:405-417` は WSL の所在を runtime-store の snapshot から作り、検出前は空。`:505` で `loaded = true`、`:632` 以降キャッシュ。`:773-782` の `onRuntimesChanged` は `regroup()` だけで再列挙しない。UNC の cwd は検出済みの集合と照合 (`:213-218`)。spec は過去の区画を「中身を変えずに置く」(spec.md:154、data-model.md:45、plan.md:24) ので App の起動直後にマウントされる。どこにも記述が無い
- **同種事象探索**: `listSessions|refreshSessions|fetchMoreSessions` (src/renderer/src) 3 件、マウント時の自動発行は `useSessions.ts:60` の 1 件。`useRuntimes.ts:49` / `useFolderLabels.ts:37` はプロセスを起こさない
- **リスク/影響**: 起動直後の過去の区画で WSL 所在のセッションが欠けるか「未検出のディストロ」として並び、キャッシュに残る。起動経路に UNC I/O の子プロセスが乗り `probeAll` と競合。E2E は `e2e-capability.ts:393` で空の index なので検出できない
- **推奨アクション**: Edge Case と FR を足し、(1) 初回取得を `listRuntimes()` の解決後に直列化 (2) 最初に展開・フォーカスされたときに初回取得 (3) main で検出の完了を待つ (targets を外れる) のどれか。`useSessions.ts:71-76` と `main/index.ts:192-196` のコメントを直し、plan に RK、FE-011 に component テスト
- **根拠**: AD-003、R-2 の C-7 (`session-service.ts:103-104,114`)

### [Medium] 「概要」の過去のセッションの項目の出所が誤っている。稼働中のランタイム名も fallback 規則を引き継いでいない (M-001) (scope: feature)

- **観察**: `cwdDisplay` は `undetected-distro` / `unknown-location` でだけ非 null (`SessionListScreen.tsx:384-392`)。「値の無い項目は出さない」と組み合わさり、登録フォルダ配下ではフォルダの行が黙って消える。所在 (名前空間) は DTO に無く `targetKey` → `location` で求める (`:675-690`)。稼働中のランタイムは `SessionScreen.tsx:74-81` の `runtimeName` の規則 (読み込み中は空・引けなければ fallback) を書いていない
- **同種事象探索**: `cwdDisplay` (src/renderer/src、テスト除く) 2 件 (`SessionListScreen.tsx:142,392`)。単独のフォルダとして使う箇所 0
- **推奨アクション**: past のフォルダ = 行が属するグループの表示 (一覧の見出しと同じ関数)。past の所在 = `locationLabelOf` / `locationIndexOf` を共有。running のランタイム = `runtimeName` を共有。FE-040 / FE-042 に観点
- **根拠**: AD-004、spec US-4 AC2

### [Medium] 起動順序と名前空間の表示について、回帰を検出するテストの経路が無い (M-002) (scope: feature)

- **観察**: component テストは capability を stub、E2E の `listSessions` は常に空 (`e2e-capability.ts:393`)
- **推奨アクション**: FE-011 に「`listRuntimes` の解決前 (または展開前) に `listSessions` を呼ばない」テスト。quickstart V-3 に「WSL を実行中にして起動し、取り直さずに過去の区画にその所在のセッションが出る」。FE-042 に M-001 の観点
- **根拠**: Principle XI

### [Low] plan / research の「runtime の provider」が glossary の `AgentRuntime` (ランタイム) と衝突する (L-001) (scope: feature)

- **観察**: plan.md:12,23,101、research.md:22-26、AD-046 Consequences 2 点目
- **推奨アクション**: 「assistant-ui の runtime (`AssistantRuntimeProvider`)」と明記。glossary の `AgentRuntime` の Counterexamples に 1 行
- **根拠**: AD-003、Principle XIV

### 観点ごとの該当なし

PB-1 (`seedFolderDraft` の DTO は運ぶだけ)、PB-2 (選択の id は 2 つのストア。用語の芽は L-001)、PB-3 (capabilities を扱わない)、PB-4 (起動ダイアログの中身と起動ゲートは不変)、PB-5 (パス変換なし)、PB-6 (永続化なし)、PB-7 (F 行)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `listSessions\|refreshSessions\|fetchMoreSessions` (src/renderer/src) | 3 (自動発行は 1) | useSessions.ts:60,84,94 |
| M-001 | `cwdDisplay` (src/renderer/src、テスト除く) | 2 | SessionListScreen.tsx:142,392 |
| M-002 | `listSessions` (e2e/、e2e-capability.ts) | 1 | e2e-capability.ts:393 |
| L-001 | `runtime の provider` | 5 | plan.md:12,23,101; research.md:22-26; 0046:35 |

## Verdict

- Critical: 0 / High: 1 / Medium: 2 / Low: 1
