# security-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: security-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: renderer の中で、外部由来の要約行 (`customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag`) を正規化して絞り込み、過去の行のツールチップに出す (B: XSS / ReDoS / DOM の id)
  - FR-003〜FR-005: transcript の本文を走査し、外部由来のメッセージの id でメッセージへ移り、CSS Custom Highlight で強調する。本番の CSP `style-src 'self'` が前提 (B)
  - FR-006 / FR-007: palette。外部由来の題と `rowKey` を含む候補を扱う。registry の element 2 つを取り込んだ (B / SEC-8)
  - FR-009〜FR-013: 起動 IPC の第 2 引数 `origin`、新チャネル `closta:getLaunchUsage`、`launch-usage.json` の永続化とログ (A / B / SEC-1)
  - SC-005 / SC-006: 記録のキー集合の固定と、IPC チャネルの集合の固定 (A / H)
  - FR-014〜FR-016 / FR-018 / SC-007 / SC-008: 文書・文言・基準画像・Constitution XV の改定。security への影響は無い
- touched files に該当する charter / Confirmation:
  - AD-023 のセキュリティ要件 (`C:\dev\closta\docs\decisions\0023-application-architecture.md:152-161`): 単一の capability を公開し、main は送信元とペイロードをすべて未信頼として検証する。該当は `C:\dev\closta\src\preload\index.ts:59,81`、`C:\dev\closta\src\main\app\ipc.ts:172-180,290-299,339-341`、`C:\dev\closta\src\main\app\session-ipc.ts:155-193`
  - ui charter の CSP 基線 (`C:\dev\closta\docs\domains\ui\charter.md:60-67`。AD-025 §7)。`protocol.ts` / `window.ts` は本 diff に含まれない。CSP の字面は変わっていない
  - Constitution Principle V (`C:\dev\closta\.specify\memory\constitution.md:501`。「ログへの混入も禁止する」)。該当は `launch-usage-service.ts` のログ
  - AD-038 D3 (`C:\dev\closta\docs\decisions\0038-e2e-screenshot-harness.md:62-67`。E2E の fake は `!app.isPackaged && CLOSTA_E2E === '1'` のときだけ有効)。`src/main/index.ts` は本 diff に含まれず、ゲートは変わっていない
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0 (新チャネルは `handle()` を通る。資格情報は扱わない。window の hardening は変わっていない)
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0 (起動元は厳密比較で検証している。HTML の sink は 0 件。RegExp は入力から組まない。外部の値を DOM の id やセレクタに入れない。CSP は変わっていない)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-023 のセキュリティ要件と AD-038 D3 に対する drift は観察されない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: `launch-usage.json` の永続化スキーマ (`.bak` の蓄積・fsync) は database-reviewer の担当 (code-gate DB-L-004)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2 (L-001 / L-002。どちらも実装は正しく、今の振る舞いを固定する回帰テストが無いだけ)

## スコープ要約

diff (base `7bdb271`...HEAD `9d98c39`) のうち security の攻撃面になるのは次の 4 つである。

1. 起動 IPC の第 2 引数 `origin`
2. 引数を取らない新チャネル `closta:getLaunchUsage`
3. 日ごとの 2 つの回数だけを持つ `launch-usage.json` と、そのログ
4. renderer が外部由来の文字列を描く箇所: palette の候補、過去の行のツールチップ、会話内検索の強調と移動

**main 側**
- 送信元の検査: `getLaunchUsage` も `handle()` を通して登録している (`ipc.ts:339-341`)。`ipcMain.handle(` が現れるのは `ipc.ts:176` の 1 か所だけ
- 起動元の検証: `checkLaunchOrigin` は厳密比較である (`launch-usage.ts:21-23`)。形の検査 `checkLaunchConfig` が通った後だけ見ており (`session-ipc.ts:160-163`)、起動の service には `config` だけが渡る
- 読み出しの例外: `handleGetLaunchUsage` は例外を握り、`unreadable` を返す (`session-ipc.ts:180-193`)
- ログ: 理由キーと、正規表現で検証した errno のコードだけを出す (`launch-usage-service.ts:46-49,67-107`)
- 保存の形: 書き出しは許可したキーだけを出す関数を通す (`launch-usage.ts:208-216`)。読み込みでは、鍵は `parseLocalDayKey` で、値は `toLaunchDayCounts` で検証する (`launch-usage-store.ts:165-175`)。鍵を暦日の形に限るので `__proto__` 系の鍵は入らない

**renderer 側**
- HTML の sink: `dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML` は本番コードで 0 件
- 外部由来の文字列の描画: palette の element (`command-palette.tsx:213,216,227`)、会話内検索のバー、ツールチップ (`SessionListScreen.tsx:945-947`) は、どれも React のテキストとして描く
- DOM の id: option の id は `useId()` と添字から作る (`command-palette.tsx:104-106`)。グループの id も同じ (`SessionListScreen.tsx:237-239`)
- セレクタ: `querySelector` 系に渡すのは固定の文字列だけである (`transcript-context.ts:34-48`、`search-highlight.ts:163-171`)
- 正規表現: 検索語から `RegExp` を組まない (`text-search.ts:9,131`)
- style: 実行時に `<style>` も `style` 属性も足さない。`::highlight()` はバンドルされる CSS に置いた (`main.css`)

**変わっていない防御**
- window の hardening (`window.ts:53-55`)、`setWindowOpenHandler` / `will-navigate` (`window.ts:65-80`)、CSP (`protocol.ts`)、preload が生の `ipcRenderer` を渡さないこと、`isTrustedSender` は、いずれも diff に含まれない
- `package.json` と lockfile も diff に含まれない。取り込んだ element の import は、既存の依存 (`lucide-react` `package.json:39`・`react`) と repo の中のモジュールだけである

**design-gate (R4) の security の指摘の行方**
- 実装で解消: M-22 (`HTML として描かない` の照合)、M-25 (DOM の id・IDREF・セレクタ)、L-21 (`getLaunchUsage` が reject しない)、L-12 (依存の差分)、L-22 (退避先のパスのログ)、L-35 (`invalid-config` を記録しない)
  - 確認したテスト: `session-ipc.test.ts:525-531,569-578`、`launch-usage-service.test.ts:220-260`、`CommandPalette.test.tsx:666-700`、`SessionListScreen.test.tsx:1886-1897,1937-1939`
- テストの穴だけが残る: M-22 (L-001 として)、M-23 (L-002 として)

## Findings

### [Low] palette の候補の文言・補足が HTML を含んでも要素にならないことを固定するテストが無い (L-001) (scope: feature)

- **観察**:
  - palette の過去の候補は、外部由来の値を文言と補足に使う。`label` は `rowTitleText(row.title, …)`、`detail` は `groupLabelOf(section.group, folderName, row.session)` である (`C:\dev\closta\src\renderer\src\features\shell\palette-commands.ts:217-218`)。稼働中の候補の `label` は、作業フォルダの表示名である (`:186`)
  - 取り込んだ element は、どちらも React のテキストとして描く (`C:\dev\closta\src\renderer\src\components\assistant-ui\elements\command-palette.tsx:213,216,227`)。したがって今の実装に注入の経路は無い
  - しかし palette のテストには、HTML を含む題の行を候補に出すケースが無い (`CommandPalette.test.tsx` と `palette-commands.test.ts` で `onerror|<img|pwned` は 0 件)
  - 同じ観点のテストは、ほかの描画箇所にはある。過去の行のツールチップ (`SessionListScreen.test.tsx:1886-1897`)、中央のヘッダの題 (`AppShell.test.tsx:416-423`)、右のペイン (`AppShell.test.tsx:665-677`)
  - design-gate M-22 は、FE-032 にこのテストを足すよう勧めていた
- **同種事象探索**:
  - `onerror|<img|pwned` (`features/shell` の palette のテスト 2 ファイル): 0 件
  - 同じ式 (renderer の `*.test.tsx`): 8 件。`ChatScreen.test.tsx:221`・`ChatScreen.o2.test.tsx:257`・`ApprovalCard.test.tsx:27`・`AppShell.test.tsx:62`・`SessionListScreen.test.tsx:1887`・`LivePane.o2.test.tsx:360` ほか。palette だけに無い
  - `dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML` (renderer の本番コード): 0 件。コメントの `ProviderScreen.tsx:27` だけ
  - `no-danger|no-unsanitized` (`eslint.config.mjs`): 0 件
- **リスク/影響**: palette の element は registry から写したもので、`eslint.config.mjs:1139-1153` の手書きの一覧に入っている。後で一致の箇所を強調するために HTML を組む形に変えても、型検査・lint・Vitest のどれも落ちない。palette は Ctrl+K でどの面からも開き、会話由来の `summary` / `firstPrompt` を出す。そこで XSS が成立すると、renderer から単一の capability (起動・承認の IPC) に届く。今は実害の経路が無いので Low とする
- **推奨アクション**:
  - `CommandPalette.test.tsx` に 1 ケース足す。`summary` (と登録フォルダの表示名) を `<img src=x onerror="window.__pwned=1">` にした過去の行を、語で候補に出す。そのうえで次の 3 点を見る。`SessionListScreen.test.tsx:1886-1897` と同じ形でよい
    - palette の中の `img` 要素が 0 件
    - option のテキストに字面がそのまま出る
    - `window.__pwned` が `undefined`
  - (任意。scope: system) renderer に `react/no-danger` を掛け、sink を機械で 0 件に保つ
- **根拠**: CWE-79、OWASP ASVS V5.3.3、design-gate M-22 (security M-001)
- **scope 根拠**: 本 PR の touched file `src/renderer/src/features/shell/CommandPalette.test.tsx` で直せる。lint 規則の追加だけが system

### [Low] 新チャネルを含む invoke 系のチャネルがすべて `handle()` (送信元の検査) を通って登録されることを、機械で確かめる手段が無い (L-002) (scope: feature)

- **観察**:
  - 実装は正しい。`getLaunchUsage` は `handle(IPC_CHANNELS.getLaunchUsage, …)` で登録している (`C:\dev\closta\src\main\app\ipc.ts:339-341`)。`handle()` は `isTrustedSender(event.senderFrame)` を前置きにしている (`ipc.ts:172-180`)
  - しかし、それを固定するテストが無い。`capability.test.ts` が新しく固定するのは `IPC_CHANNELS` の名前と値の集合だけである (`C:\dev\closta\src\domain\capability.test.ts:103-112`)。登録の経路は見ない
  - `registerIpcHandlers` を呼ぶテストも 0 件である。呼び出しは `src/main/index.ts:102,126` だけ
  - `ipc.ts:66-71` のコメントは「1 つ書き忘れた時点で穴になる」と書く。design-gate M-23 (R1 から 4 Round) は、構造のテストを足すよう勧めていた
- **同種事象探索**:
  - `ipcMain\.handle` (repo。`node_modules` / `out` / `specs` を除く): 実体は 1 件 (`src/main/app/ipc.ts:176`)。ほかは、コメント (`launch-preparation.ts:135`) と agent の説明文 (`.claude/agents/security-reviewer.md:55`)
  - `registerIpcHandlers` (src): 3 件 (定義 `ipc.ts:182`、呼び出し `src/main/index.ts:102,126`)。テストは 0 件
  - `isTrustedSender` の単体 (`validate.test.ts:91-109`): ある。ただし、各チャネルがそれを通るかは見ない
- **リスク/影響**: 今は穴が無い。後続の feature が `ipcMain.handle(IPC_CHANNELS.x, …)` と直接書いても、型検査・lint・Constitution 検証・Vitest のどれも落ちない。その場合、別 origin の frame からの呼び出しを弾かない口が 1 つできる。本 PR ではチャネルの集合を固定するテストが入り、境界の拡張は検出できるようになった。残るのは登録の経路の検出だけなので、Low とする
- **推奨アクション**: `capability.test.ts` の集合の固定と組にして、構造のテストを 1 つ足す。方法は次のどちらか
  - (a) `ipc.ts` の source を読み、次の 2 点を見る
    - `ipcMain.handle(` が 1 回だけ現れる
    - invoke 系の `IPC_CHANNELS` (`*Port` / `*Changed` / `sessionStatus` を除く) のキーが、すべて `handle(IPC_CHANNELS.<key>` の形で現れる
  - (b) `vi.mock('electron')` で `ipcMain.handle` を捕まえる。`registerIpcHandlers` の後に、各チャネルを `isTrustedSender` が偽になる `senderFrame` で呼び、`rejected` で reject することを見る
- **根拠**: AD-023 のセキュリティ要件「main 側で送信元とペイロードをすべて未信頼として検証する」(`0023-application-architecture.md:160`)、`ipc.ts:66-71`、design-gate M-23
- **scope 根拠**: 本 PR の touched file `src/domain/capability.test.ts` の隣に構造のテストを 1 つ足せば直る (`src/main/app/` の新しいテスト)。直す対象は本 PR が足したチャネルの登録の固定である

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `onerror\|<img\|pwned` (`CommandPalette.test.tsx` / `palette-commands.test.ts`) | 0 | - |
| L-001 | `onerror\|<img` (renderer の `*.test.tsx`) | 8 | ChatScreen.test.tsx:221, ChatScreen.o2.test.tsx:257,264, ApprovalCard.test.tsx:27, AppShell.test.tsx:62, SessionListScreen.test.tsx:1887, LivePane.o2.test.tsx:360 (palette は 0) |
| L-001 | `dangerouslySetInnerHTML\|innerHTML\|outerHTML\|insertAdjacentHTML` (renderer の本番コード) | 0 | コメントの ProviderScreen.tsx:27 だけ |
| L-001 | `no-danger\|no-unsanitized` (eslint.config.mjs) | 0 | - |
| L-002 | `ipcMain\.handle` (repo。node_modules / out / specs を除く) | 1 (実体) | src/main/app/ipc.ts:176 (ほかはコメント launch-preparation.ts:135 と agent の説明文) |
| L-002 | `registerIpcHandlers` (src) | 3 | ipc.ts:182 (定義), src/main/index.ts:102,126 (呼び出し)。テストは 0 |
| (解消の確認) | `querySelector(All)?\(\|closest\(\|\.matches\(\|getElementById\(` (renderer の本番コード) | 8 | main.tsx:7, AppShell.tsx:84, ConversationSearchProvider.tsx:60, search-highlight.ts:168,171, CommandPalette.tsx:50, RightPanel.tsx:48, useFocusRescue.ts:53 (どれも定数か固定のセレクタ。外部の値は 0) |
| (解消の確認) | `new RegExp\|RegExp\(` (renderer の本番コード) | 0 | - |
| (解消の確認) | `style=\{\|\.style\.\|createElement\('style'` (O-3 の renderer のファイル) | 0 | - |
| (解消の確認) | `console\.(log\|warn\|error)` (launch-usage の main 側) | 5 | launch-usage-service.ts:67,73,76,82,107 (どれも理由キーか errno のコードだけ) |
| (解消の確認) | `sk_\|sk-ant\|AIza\|ghp_\|glpat-\|Bearer ` (pr-gate.diff) | 1 | diff:629 (`task_progress` の誤検出。秘密は 0) |
| (解消の確認) | `^\+.*(spawn\|execFile\|child_process\|openExternal\|loadURL\|webPreferences\|Math\.random)` (pr-gate.diff) | 0 (コード) | diff:5227-5228 は design-gate の報告の文中 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2

関係するファイル:
- `C:\dev\closta\src\main\app\ipc.ts`
- `C:\dev\closta\src\main\app\session-ipc.ts`
- `C:\dev\closta\src\main\app\session-ipc.test.ts`
- `C:\dev\closta\src\main\app\launch-usage-service.ts`
- `C:\dev\closta\src\main\app\launch-usage-service.test.ts`
- `C:\dev\closta\src\main\infra\settings\launch-usage-store.ts`
- `C:\dev\closta\src\domain\session\launch-usage.ts`
- `C:\dev\closta\src\domain\capability.test.ts`
- `C:\dev\closta\src\preload\index.ts`
- `C:\dev\closta\src\renderer\src\components\assistant-ui\elements\command-palette.tsx`
- `C:\dev\closta\src\renderer\src\features\shell\palette-commands.ts`
- `C:\dev\closta\src\renderer\src\features\shell\CommandPalette.test.tsx`
- `C:\dev\closta\src\renderer\src\features\chat\transcript-context.ts`
- `C:\dev\closta\src\renderer\src\features\chat\search-highlight.ts`
- `C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx`
- `C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.test.tsx`
