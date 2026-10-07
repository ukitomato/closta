# security-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07
**Reviewer**: security-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-018 / SC-008: Round 1 から Round 2 の差分の本体。サイドバーの基準画像の E2E を CI の e2e job に足し、基準画像 1 枚をコミットした。security で見るのは次の 3 点
    - CI の権限と秘密が増えていないか
    - 基準画像に会話や設定の由来の情報が写っていないか (AD-038 D5)
    - E2E が本番の CSP を緩めていないか (AD-038 D4)
  - FR-001 (placeholder の文言): 固定の文字列リテラルを差し替えただけ (`src/renderer/src/features/session-list/labels.ts:155`)。外部由来の値は入らない
  - FR-001〜FR-013 / SC-005 / SC-006 (Round 1 で見た攻撃面): 起動の IPC の `origin`、`closta:getLaunchUsage`、`launch-usage.json`、renderer が外部由来の文字列を描く箇所。delta (9d98c39..a4c37a8) はどれも変えていない。Round 1 の判定がそのまま当てはまる
- touched files に該当する charter / Confirmation:
  - AD-038 の Confirmation (`C:\dev\closta\docs\decisions\0038-e2e-screenshot-harness.md:111-119`)。該当は `.github/workflows/verify.yml:171-172`、`e2e/sidebar-screenshot.spec.ts:84-97`、`e2e/sidebar-screenshot.spec.ts-snapshots/sidebar-past-sessions-win32.png`
    - :114 「CI env/secrets に real 資格情報が無い」
    - :116-117 「ホストを永続的に変えない」
    - :119 「基準画像に会話/config 由来情報が含まれない」
  - AD-038 D4 「本番 CSP をテストで緩めない」(`0038-e2e-screenshot-harness.md:73-77`)
  - Constitution Principle V (`C:\dev\closta\.specify\memory\constitution.md:501`) と Principle VI (`:537`)
  - ui charter の CSP 基線 (`C:\dev\closta\docs\domains\ui\charter.md:60-67`)。`protocol.ts` / `window.ts` は delta に含まれない
  - AD-023 のセキュリティ要件。`ipc.ts` / `session-ipc.ts` / `preload/index.ts` は delta に含まれない (Round 1 の L-002 の前提は変わらない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0 (delta の workflow は秘密を参照しない。`permissions: contents: read` と `pull_request` のトリガは変わっていない。window の hardening・preload・IPC の登録は変わっていない)
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0 (delta は外部由来の値を新しい sink に流さない。E2E は CSP を回避しない。`setBypassCSP|addStyleTag|addScriptTag` はコード中に 0 件で、コメントにだけある)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。security の観点では、AD-038 D3 / D4 / D5 と Confirmation に対する drift は観察されない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 基準画像の人による承認の運用 (AD-038 D5 の「人間 deferred」) は security の範囲外。delta に永続化スキーマの変更は無い
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:2 (Round 1 の L-001 / L-002 が未解消。どちらも実装は正しく、今の振る舞いを固定する回帰テストが無いだけ)

## スコープ要約

Round 2 の delta (`9d98c39..a4c37a8`。gate の成果物は除く) には 7 つのファイルが入っている。

- `.github/workflows/verify.yml`: e2e のステップを 1 つ追加
- `e2e/sidebar-screenshot.spec.ts`: 撮る前に、区画のスクロールの領域を送る
- 基準画像の PNG 1 枚
- `session-list/labels.ts`: placeholder の文言
- `vitest.config.ts`: `testTimeout` を 20s に
- `data-model.md` / `quickstart-results.md`: 記録

security の観点で確かめた事実は次のとおり。

- **workflow**
  - 足したステップは `pnpm exec playwright test e2e/sidebar-screenshot.spec.ts -c playwright.config.ts` の 1 行だけである (`verify.yml:171-172`)。`env:` も `secrets.` も足していない
  - workflow 全体で `secrets.|pull_request_target|GITHUB_TOKEN|write-all` は 0 件。トリガは `push` (main) と `pull_request` (`:15-18`)。権限は `contents: read` (`:25-26`)
  - フォントを OS に登録するなど、ホストを永続的に変える命令は足していない (AD-038 D4 / Principle VI)
  - 失敗時に artifact を上げるステップ (`:176-182`) は main に前からあり、本 PR のものではない
- **基準画像**: PNG を目で確かめた
  - 写っている値は E2E の偽の capability の固定の値だけで、`src/main/app/e2e-capability.ts:140-147,486` と一致する
    - 題: 「ログイン画面の API 修正 v2」「テストを 3 段の並列に分ける」「README を日本語で整える」
    - グループの見出し: 「E2E Project」
    - その他: ブランチ `feature/login-v2`、タグ `review`、「2 KB」
  - ホストのパス・ユーザ名・会話の本文・設定の値は写っていない。AD-038 の Confirmation (`:119`) を満たす
- **E2E の spec**
  - 足した `groups.evaluate` (`sidebar-screenshot.spec.ts:85-94`) は、計算済みのスタイルを読んで `scrollTop` を送るだけである。本番のコードの経路には入らない
  - CSP を回避する API (`setBypassCSP`) は使っていない。フォントは前からの FontFace + CSSOM の方法 (`:70-80`) のままで、AD-038 D4 のとおりである
- **renderer**: placeholder は固定の文字列リテラル (`labels.ts:155`) で、外部由来の値は混ざらない
- **`vitest.config.ts`**: 上限の時間を変えただけで、security には関係しない
- **Round 1 の指摘**: L-001 / L-002 が指すファイルは delta で変わっていない。HEAD `a4c37a8` で Grep し直し、どちらも未解消であることを確かめた (下の Findings)

## Findings

### [Low] palette の候補の文言・補足が HTML を含んでも要素にならないことを固定するテストが無い (L-001) (scope: feature)

- **Status in this round**: unresolved (Round 1 の L-001 を引き継ぐ。delta で直されていない)
- **観察**:
  - palette の過去の候補は、外部由来の値を文言と補足に使う。`label` は `rowTitleText(row.title, …)`、`detail` は `groupLabelOf(section.group, folderName, row.session)` である (`C:\dev\closta\src\renderer\src\features\shell\palette-commands.ts:217-218`)。稼働中の候補の `label` は、作業フォルダの表示名である (`:186`)
  - 取り込んだ element は、どれも React のテキストとして描く (`C:\dev\closta\src\renderer\src\components\assistant-ui\elements\command-palette.tsx:213,216,227`。delta で変わっていない)。今の実装に注入の経路は無い
  - HEAD `a4c37a8` で `src/renderer/src/features/shell` を `onerror|<img|pwned` で Grep すると 2 件で、どちらも `AppShell.test.tsx:62,422` (中央のヘッダの題) である。`CommandPalette.test.tsx` と `palette-commands.test.ts` には 0 件
- **同種事象探索**: `onerror|<img|pwned` (`src/renderer/src/features/shell`) で 2 件 (`AppShell.test.tsx:62,422`)。palette のテストでは 0 件
- **リスク/影響**: palette の element は registry から写したものである。後で一致した箇所を強調するために HTML を組む形に変えても、型検査・lint・Vitest のどれも落ちない。palette は Ctrl+K でどの面からも開き、会話由来の `summary` / `firstPrompt` を出す。今は実害の経路が無いので Low とする
- **推奨アクション**: `CommandPalette.test.tsx` に 1 ケース足す。`summary` (と登録フォルダの表示名) を `<img src=x onerror="window.__pwned=1">` にした過去の行を、語で候補に出す。そのうえで次の 3 点を見る。形は `SessionListScreen.test.tsx:1886-1897` / `AppShell.test.tsx:416-423` と同じでよい
  - palette の中の `img` 要素が 0 件
  - option のテキストに字面がそのまま出る
  - `window.__pwned` が `undefined`
- **根拠**: CWE-79、OWASP ASVS V5.3.3、design-gate M-22
- **scope 根拠**: 本 PR の touched file `src/renderer/src/features/shell/CommandPalette.test.tsx` で直せる

### [Low] 新チャネルを含む invoke 系のチャネルがすべて `handle()` (送信元の検査) を通って登録されることを、機械で確かめる手段が無い (L-002) (scope: feature)

- **Status in this round**: unresolved (Round 1 の L-002 を引き継ぐ。delta で直されていない)
- **観察**:
  - 実装は正しい。`handle()` は `isTrustedSender(event.senderFrame)` を前置きにしている (`C:\dev\closta\src\main\app\ipc.ts:177`)。`getLaunchUsage` も `handle(IPC_CHANNELS.getLaunchUsage, …)` で登録している (`ipc.ts:339`)
  - HEAD `a4c37a8` で、`ipcMain.handle(` の実体は `ipc.ts:176` の 1 件だけである
  - `registerIpcHandlers` は定義の `ipc.ts:182` と、呼び出しの `src/main/index.ts:102,126` だけで、テストからの呼び出しは 0 件
  - `capability.test.ts` が固定するのは `IPC_CHANNELS` の集合だけで、登録の経路は見ない
- **同種事象探索**:
  - `ipcMain\.handle\(` (`src`): 1 件 (`src/main/app/ipc.ts:176`)
  - `registerIpcHandlers` (`src`): 4 件 (import の `index.ts:8`、呼び出しの `index.ts:102,126`、定義の `ipc.ts:182`)。テストは 0 件
- **リスク/影響**: 今は穴が無い。しかし後続の feature が `ipcMain.handle(IPC_CHANNELS.x, …)` と直接書いても、型検査・lint・Constitution 検証・Vitest のどれも落ちない。その場合、別 origin の frame からの呼び出しを弾かない口が 1 つできる。仮定の将来の経路なので Low とする
- **推奨アクション**: `capability.test.ts` の集合の固定と組にして、`src/main/app/` に構造のテストを 1 つ足す。方法は次のどちらか
  - (a) `ipc.ts` の source を読み、次の 2 点を見る
    - `ipcMain.handle(` が 1 回だけ現れる
    - invoke 系の `IPC_CHANNELS` のキーが、すべて `handle(IPC_CHANNELS.<key>` の形で現れる
  - (b) `vi.mock('electron')` で `ipcMain.handle` を捕まえる。`registerIpcHandlers` の後に、各チャネルを `isTrustedSender` が偽になる `senderFrame` で呼び、`rejected` で reject することを見る
- **根拠**: AD-023 のセキュリティ要件「main 側で送信元とペイロードをすべて未信頼として検証する」、`ipc.ts:66-71`、design-gate M-23
- **scope 根拠**: 本 PR が足したチャネルの登録の固定であり、`src/main/app/` に新しいテストを足せば直る

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `onerror\|<img\|pwned` (`src/renderer/src/features/shell`) | 2 | AppShell.test.tsx:62, AppShell.test.tsx:422 (palette のテストは 0) |
| L-002 | `ipcMain\.handle\(` (`src`) | 1 | src/main/app/ipc.ts:176 |
| L-002 | `registerIpcHandlers` (`src`) | 4 | src/main/index.ts:8,102,126, src/main/app/ipc.ts:182 (テストは 0) |
| (delta の確認) | `secrets\.\|pull_request_target\|GITHUB_TOKEN\|write-all\|permissions:` (`.github/workflows`) | 1 | verify.yml:25 (`permissions:` の宣言だけ。値は `contents: read`) |
| (delta の確認) | `setBypassCSP\|bypassCSP\|addStyleTag\|addScriptTag` (`e2e`) | 5 | composer-screenshot.spec.ts:12,35, README.md:23,51, support/launch.ts:23 (どれもコメント。使う箇所は 0) |
| (delta の確認) | 基準画像の文字列 (`e2e-capability.ts`) | 5 | e2e-capability.ts:109,140,141,145,147,486 (画像に写る文字列はすべて固定の偽の値) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
- Round inheritance: resolved from 1: 0 / unresolved: 2 (L-001, L-002) / new: 0
