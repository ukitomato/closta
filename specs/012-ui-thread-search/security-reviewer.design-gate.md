# security-reviewer Review: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-06
**Reviewer**: security-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 4 (前 Round = `C:\dev\closta\specs\012-ui-thread-search\design-gate.md.20261006T212011` (R3) と、R3 の security の raw output `C:\dev\closta\specs\012-ui-thread-search\security-reviewer.design-gate.md`)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-017: renderer の中での絞り込み。外部由来の要約行 (`customTitle` / `summary` / `firstPrompt`) を正規化して照合し、過去の行のツールチップに出す (B)
  - FR-003〜FR-005: transcript の本文を走査し、id でメッセージへ移り、CSS Custom Highlight で強調する。本番の CSP `style-src 'self'` が前提 (B)
  - FR-006 / FR-007: palette。外部由来のセッションの題と、外部由来の値を含む候補の id (`session:past:<rowKey>`) を扱う。registry の element を取り込む (B / SEC-8)
  - FR-009〜FR-013: 起動 IPC の第 2 引数 `origin`、新チャネル `closta:getLaunchUsage`、`launch-usage.json` の永続化とログ (A / B)
  - SC-005 / SC-006: キー集合の固定、IPC 面の固定 (A / H)
  - FR-014〜FR-016 / FR-018 / SC-007 / SC-008: 文書・文言・基準画像。security への影響はない
- touched files に該当する charter / Confirmation:
  - AD-023 のセキュリティ要件 (`C:\dev\closta\docs\decisions\0023-application-architecture.md:152-161`): 単一の capability を公開し、main が送信元とペイロードをすべて未信頼として検証する。該当箇所は `C:\dev\closta\src\preload\index.ts:34-87` と `C:\dev\closta\src\main\app\ipc.ts:164-172`
  - ui charter の CSP 基線 (`C:\dev\closta\docs\domains\ui\charter.md:53-60`)
  - Constitution Principle V (長期資格情報を永続化しない・ログに入れない。`C:\dev\closta\.specify\memory\constitution.md:463,473`)
  - AD-038 D3: E2E の fake は合成条件のときだけ有効になる (`C:\dev\closta\src\main\index.ts:100` の `!app.isPackaged && process.env.CLOSTA_E2E === '1'`)
  - R-3 FR-020 の XSS 境界: 生の HTML を描かない
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:3
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:2 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-023 のセキュリティ要件と AD-041 の起動ゲートに対する drift は観察されない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: `launch-usage.json` の永続化スキーマは database-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1 (M-002 / L-004。他の指摘のテストの穴は各指摘の推奨アクションに含めた)

## スコープ要約

R3 から R4 で design が変わったのは 3 点。
- H-04: 起動元を引き継ぐのは「適用せず、軸も手で変えずに起動したとき」だけにした (data-model §4「renderer の起動元」、`C:\dev\closta\specs\012-ui-thread-search\data-model.md:243-256`)
- M-13: 数える単位を「受け付けた起動の要求」にした (spec FR-010、`C:\dev\closta\specs\012-ui-thread-search\spec.md:271`)
- M-01: KPI の判定の期間を直近 30 日に決めた (data-model.md:263)

3 点とも、計測の正しさについての変更である。新しい信頼境界や IPC 面は増えていない。攻撃面は R3 と同じ次の 3 つ。
1. 起動 IPC の第 2 引数 `origin`。main が厳密比較で検証し、起動の可否には使わない
2. 引数を取らない `closta:getLaunchUsage`。集計済みの DTO だけを返す
3. 日ごとの回数だけを持つ `launch-usage.json`

既存の防御は R3 から変わっていない。
- window の hardening (`C:\dev\closta\src\main\app\window.ts:53-55`): `sandbox` / `contextIsolation` / `nodeIntegration` を明示している
- `setWindowOpenHandler` は deny を返し、http(s) だけを OS へ渡す (`window.ts:31-39,65-68`)
- `will-navigate` はすべて拒否する (`window.ts:76-81`)
- preload は生の `ipcRenderer` を渡さない (`C:\dev\closta\src\preload\index.ts:16-19,124-129`)
- `ipcMain.handle(` は `handle()` の中の 1 か所だけ (`ipc.ts:168`)

R3 の security の指摘 6 件 (gate M-22・M-23・M-25・L-12・L-21・L-22) は、design の該当箇所が 1 つも変わっていない。全件を unresolved として持ち越し、severity は据え置く (追加事実なし)。R3 の gate の Next は、M-25 を利用者の判断なしに同じ fix で直せるとしていたが、手が付いていない。新しい指摘は Low 1 件 (L-004)。

## Findings

### [Medium] registry の element を採る条件に「外部由来の文字列を HTML として描かない」が無く、palette と検索のバーに注入のテストも無い (M-001) (scope: feature) [unresolved from prev (R3 M-001 / gate M-22)]

- **観察**:
  - 採る条件は (a)〜(d) のまま。見ているのは役割・文言・IME・実行時の `<style>` だけである (`C:\dev\closta\specs\012-ui-thread-search\research.md:59`、`C:\dev\closta\specs\012-ui-thread-search\tasks.md:17` の SH-003)
  - palette の候補は外部由来の `rowTitleText` を出す (`C:\dev\closta\specs\012-ui-thread-search\data-model.md:173`)
  - conversation-search の element は、transcript の本文の断片 (`before` / `match` / `after`) を受けて描く形である (`C:\dev\closta\.claude\skills\elements\references\standalone-elements.md:1688`)
  - どちらの element の source も repo に無い。Glob `components/assistant-ui/elements/{command-palette,conversation-search}*.tsx` は 0 件
  - 注入のテスト (`<img src=x onerror=...>` を含む題で `img` が 0 件) は、今も FE-012 (`tasks.md:44`) にしか無い。FE-032 (`tasks.md:77-79`) と FE-026 (`tasks.md:63-66`) には無い
  - `C:\dev\closta\specs\012-ui-thread-search\spec.md:189` の「`dangerouslySetInnerHTML` を使わない」は強調についての Edge Case で、element を採るときの照合の観点には入っていない
- **同種事象探索**:
  - `onerror|innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|outerHTML` (012 の設計文書 6 つ): 2 件 (spec.md:189 と tasks.md:44)。採る条件とテストの側は 0 件
  - renderer の本番コードで同じ式: 0 件。規約のコメント `C:\dev\closta\src\renderer\src\features\provider\ProviderScreen.tsx:27` と、テスト `pending-queue-notice.test.tsx:38` だけ
  - `eslint.config.mjs` の `no-danger`: 0 件
- **リスク/影響**: コピーした element が一致を強調するために HTML を組む形だと、会話由来の題や本文を通して renderer で XSS が成立する。renderer は単一の capability に届くので、起動や承認の IPC を任意に呼べる。実装はまだ観察できないので Medium のままにする
- **推奨アクション**:
  - research R-04 と SH-003 の採る条件に (e) を足す: 「候補の文言と hit の断片を React のテキストとして描く。取り込んだファイルに `dangerouslySetInnerHTML` / `innerHTML` / `outerHTML` / `insertAdjacentHTML` が 0 件」。照合の結果は PR の説明に書く
  - FE-032 にテストを足す: `<img src=x onerror=...>` と双方向制御を含む題のセッションを候補に出し、`img` 要素が 0 件であることを見る。conversation-search を採るなら、FE-026 にも本文の断片で同じ観点を足す
  - (任意。system) `react/no-danger` を renderer 全体に掛ける
- **根拠**: CWE-79、OWASP ASVS V5.3.3、ui charter の CSP 基線、Principle XIII (element を採るときの照合)
- **scope 根拠**: research R-04 と tasks SH-003 / FE-026 / FE-032 で直せる。lint 規則の追加だけは system

### [Medium] palette の候補の id が外部由来の値と `:`・NUL を含むのに、「外部の値を CSS セレクタや DOM の id に入れない」規則が §3 / §6 に及んでいない (M-003) (scope: feature) [unresolved from prev (R3 M-003 / gate M-25)]

- **観察**:
  - 候補の id の書式は `session:running:<id>` / `session:past:<rowKey>` (`C:\dev\closta\specs\012-ui-thread-search\data-model.md:172-173`)
  - `rowKey` は `${targetKey}\u0000${sessionId}` で、NUL を含む (`C:\dev\closta\src\domain\session\summary.ts:59`)
  - 過去の行の `sessionId` が列挙の境界で受ける検査は、空でない・長さの上限・制御文字なしの 3 つだけ (`C:\dev\closta\src\agents\protocol.ts:152-165`)。`"` `]` `:` `\` `#` は通る
  - palette の入力は `aria-activedescendant` を使う combobox である (`data-model.md:184`)。ところが、候補の DOM の id の作り方と、現在の候補を引いて画面に入れる方法は今も定められていない
  - 取り込む候補の registry element は `activeId` と `onRun` を受ける (`C:\dev\closta\specs\012-ui-thread-search\research.md:54`、`standalone-elements.md:1471,1474`)。その id を DOM の id やセレクタに使うかは、source が無いので観察できない
  - §2 の規則 (`data-model.md:136`) は、メッセージの id だけを対象にした書き方のまま
  - §6 のグループは `aria-labelledby=見出しの h3` (`data-model.md:328,333`) で、id の作り方を書いていない。今のコードは外部由来の区画の鍵から id を作る (`C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx:208-209,231,240`)。gate はこの点を analyze U9 と M-25 に集約した
- **同種事象探索**:
  - `useId|aria-activedescendant|DOM の id|IDREF|条件 \(f\)` (012 の設計文書 6 つ): 1 件 (`data-model.md:184` の `aria-activedescendant` の列挙だけ)。規則の側は 0 件
  - renderer の本番コードで要素を引く箇所 `getElementById\(|querySelector|closest\(|\.matches\(`: 7 件。どれも定数か固定のセレクタで、外部の値を入れる箇所は 0 件
    - `C:\dev\closta\src\renderer\src\main.tsx:7`
    - `C:\dev\closta\src\renderer\src\features\shell\AppShell.tsx:80`
    - `C:\dev\closta\src\renderer\src\features\shell\RightPanel.tsx:48`
    - `C:\dev\closta\src\renderer\src\components\image.tsx:284`
    - `C:\dev\closta\src\renderer\src\features\shell\CenterPane.tsx:46`
    - `C:\dev\closta\src\renderer\src\features\shell\useDialogReturnFocus.ts:54` (`ShellAnchor` の定数の union)
    - `C:\dev\closta\src\renderer\src\features\shell\useFocusRescue.ts:53`
  - palette は、外部由来の値を DOM の id やセレクタに入れる最初の例になりうる
- **リスク/影響**:
  - 書式そのものが `:` を含む。そのため `querySelector('#' + id)` は、悪意の無いデータでも `SyntaxError` を投げる。palette はどの面からでも Ctrl+K で開くので、描画か effect の中で投げると error boundary まで伝わり、palette かシェルの表示が落ちうる
  - 細工した `sessionId` (`"],[data-x="` など) がセレクタの結合として解釈されると、`aria-activedescendant` の指す候補と Enter で実行する候補がずれ、別のセッションを開きうる
  - 影響は「どのセッションを開くか」に限られ、権限の昇格には届かない。設計がセレクタへの埋め込みを書いているわけではなく規則が欠けているだけなので、Medium のままにする
- **推奨アクション**:
  - data-model §3「開閉・キー・フォーカス」に次の 3 点を書く
    - 候補の DOM の id は `useId()` の接頭辞と並びの添字から作る (例 `${prefix}-opt-${index}`)。候補の id (`session:past:<rowKey>`) は DOM の属性にもセレクタにも入れない
    - 現在の候補は添字か ref で持ち、画面に入れるのも ref か添字由来の id で行う
    - §2 の「外部由来の値を CSS セレクタの文字列に埋め込まない」を §2・§3・§6 で共有すると書く
  - §6 のグループの `aria-labelledby` も `useId()` と添字から作る、と書く (gate M-25 の analyze 側の手当てと同じ変更)
  - SH-003 / research R-04 の採る条件に (f) を足す: 「command の id から DOM の id やセレクタを組まない。組むなら、取り込んだ中で添字の方式に差し替える」
  - FE-030 / FE-032 にテストを足す。`sessionId` と `targetKey` に `"` `]` `:` `\` `#` を含む過去の行で、次の 3 点を見る
    - ↑↓ のたびに `aria-activedescendant` の値が実在する要素を指す (`document.getElementById(値)` が null でない)
    - Enter でその行の `rowKey` が `select` に渡る
    - 例外が出ない
  - FE-012 に、空白と `"` を含む区画の鍵でグループの名前が引けるテストを足す
  - cascade の修正の対象: `data-model.md:172,173,184,328,333`、`research.md:54,59`、`tasks.md:17,41,44,75,76,78`
- **根拠**: CWE-74、CWE-20、OWASP ASVS V5.3。R2 H-03 (gate。メッセージの id のセレクタへの埋め込み) と同じ類型
- **scope 根拠**: data-model §3 / §6 と tasks SH-003 / FE-011 / FE-012 / FE-030〜FE-032 の touched files で直せる

### [Medium] 新チャネル `closta:getLaunchUsage` が送信元の検査 (`handle()`) を通ることを自動で確かめる手段が無い (M-002) (scope: feature) [unresolved from prev (R3 M-002 / gate M-23)。R1 M-003 から 4 Round 続けて未解消]

- **観察**:
  - 送信元の検査は `C:\dev\closta\src\main\app\ipc.ts:164-172` の `handle()` に集まっている。`ipcMain.handle(` の呼び出しは `ipc.ts:168` の 1 か所だけ
  - 新チャネルの登録を確かめる手段は、quickstart V-1 の目視 (`C:\dev\closta\specs\012-ui-thread-search\quickstart.md:11`) と BE-043 の文面 (`tasks.md:94` の「`handle()` を通す」) だけである
  - BE-043 のテスト (`tasks.md:95-96`) は `session-ipc.ts` の単体と `IPC_CHANNELS` の集合の固定だけで、登録の経路を見ない
- **同種事象探索**:
  - `ipcMain\.(handle|on)\(` (src): 1 件 (`ipc.ts:168`)
  - `registerIpcHandlers` のテスト: 0 件。呼び出しは `C:\dev\closta\src\main\index.ts:102,126` だけ
  - `handle\(\) を通|senderFrame|信頼できない送信元` (012 の設計文書): テストの側は 0 件
- **リスク/影響**: 実装で `ipcMain.handle(IPC_CHANNELS.getLaunchUsage, …)` と直接書いても、型検査・lint・Constitution 検証・Vitest のどれも落ちない。その場合、別 origin の frame からの呼び出しを弾かない口が 1 つできる (`ipc.ts:66-69` のコメントにある「1 つ書き忘れた時点で穴になる」)。返すのは回数だけなので実害は小さいが、以後のチャネルの前例になる。追加事実は無く、Round を重ねても severity は上げない
- **推奨アクション**: BE-043 に構造のテストを 1 つ足し、SC-006 の集合の固定と組にする。方法は次のどちらか
  - (a) `ipc.ts` の source を読み、`ipcMain.handle(` が 1 回だけで、invoke 系の `IPC_CHANNELS` (`*Port` / `*Changed` / `sessionStatus` を除く) がすべて `handle(IPC_CHANNELS.<key>` で登録されていることを見る
  - (b) `vi.mock('electron')` で `ipcMain.handle` を捕まえ、`registerIpcHandlers` の後に各チャネルを信頼できない `senderFrame` で呼び、`rejected` になることを見る
- **根拠**: AD-023 のセキュリティ要件「main 側で送信元とペイロードをすべて未信頼として検証する」(`0023-application-architecture.md:160`)、`ipc.ts:66-69`
- **scope 根拠**: BE-043 の touched files (`capability.test.ts` と、新しく足す ipc の構造のテスト) で直せる

### [Low] `handleGetLaunchUsage` が reject しない (失敗はすべて `unreadable` で返す) ことが定められていない (L-001) (scope: feature) [unresolved from prev (R3 L-001 / gate L-21)]

- **観察**:
  - `C:\dev\closta\specs\012-ui-thread-search\data-model.md:239` は「renderer は invoke の失敗 (例外) も `unreadable` として描く」としており、main から例外が届く前提のままである
  - 「reject しない」と書かれているのは `record(origin)` だけ (`data-model.md:225`)
  - 手本の store は、退避の `writeFile` の失敗を捕まえずに投げる (`C:\dev\closta\src\main\infra\settings\preset-store.ts:76`)。Node の fs のエラーの message はパスを含む
  - BE-043 のテストは「`handleGetLaunchUsage` が DTO だけを返す」(`tasks.md:95`) だけ
- **同種事象探索**:
  - `reject しない|resolve する` (012 の設計文書): 2 件 (`data-model.md:225` と `research.md:75`)。どちらも `record` の話で、`getLaunchUsage` の側は 0 件
  - `preset-store.ts` の `throw` と、捕まえない `writeFile`: `:70,:76,:177`
- **リスク/影響**: ipcMain.handle が reject すると、元の例外の message が renderer の reject の message に入る。そこに Windows のユーザ名を含む userData のパスが入りうる。renderer はそれを表示しないので、影響は小さい
- **推奨アクション**:
  - data-model §4「起動の IPC と読み出し」に「`handleGetLaunchUsage` は reject しない。service の例外は握り、`{ status: 'unreadable' }` を返す」と書く
  - BE-043 に「service が投げても `unreadable` で resolve する」テストを足す
- **根拠**: CWE-209、SEC-4 (ハンドラの例外を renderer に返さない)
- **scope 根拠**: data-model §4 と BE-043 の touched files で直せる

### [Low] SH-003 の `npx assistant-ui@latest add` の後に、依存が増えていないことを確かめる手順が無い (L-002) (scope: feature) [unresolved from prev (R3 L-002 / gate L-12)]

- **観察**:
  - `C:\dev\closta\specs\012-ui-thread-search\tasks.md:17` は、`@latest` の CLI で取り込み、「新しい npm の依存を足さない」とだけ書く
  - `C:\dev\closta\specs\012-ui-thread-search\plan.md:20` は「依存を足すなら取り込みのときに確かめる」とするが、確かめる手順 (`package.json` と lockfile の差分) は無い
  - `@latest` の CLI を使う手順自体は repo の既存の取り込みと同じ形 (`.claude/skills/elements/SKILL.md` ほか 40 ファイル) なので、ここでは指摘しない
- **同種事象探索**: `package\.json|lockfile|pnpm-lock` (012 の設計文書): 0 件
- **リスク/影響**: registry の CLI が element の依存を自動で入れると、plan の制約が黙って破られる。入った依存が `postinstall` を持っていれば、開発機と CI で実行されうる
- **推奨アクション**:
  - SH-003 に「取り込みの直後に `package.json` と lockfile の差分が 0 であることを確かめる。差分があれば戻し、element の source だけを残すか、採らない」と書く
  - 取り込んだファイルの import が既存の依存だけであることも確かめる
- **根拠**: SEC-8 (新規依存と install script)、CWE-1357
- **scope 根拠**: tasks SH-003 の手順で直せる

### [Low] BE-042 が「`preset-service.ts:60-81` と同じ形」と指す範囲に、退避先のパスをログに出す行が今も含まれる (L-003) (scope: feature) [unresolved from prev (R3 L-003 / gate L-22)]

- **観察**:
  - `C:\dev\closta\specs\012-ui-thread-search\tasks.md:92` (BE-042) は「読み込みの状態 (`:60-81` と同じ形)」のまま
  - その範囲の `C:\dev\closta\src\main\app\preset-service.ts:77-79` は、`backup=${result.backupPath?.value ?? 'none'}` で退避先のパスを `console.warn` に出す
  - data-model §4「ログ」(`data-model.md:267`) は「値・パス・退避先のパスは出さない」とする
- **同種事象探索**: `backupPath\?\.value|backup=` (src/main): 1 件 (`preset-service.ts:78`)
- **リスク/影響**: 手本どおりに写すと、BE-042 のテスト「`console.warn` の引数にパスと値が出ない」が赤になって手戻りになる。テストを緩めて通すと、ユーザ名を含むパスがログに残る (Principle V の「ログへの混入」の趣旨に近い)
- **推奨アクション**: BE-042 の参照を「`:60-81` と同じ形。ただし `:77-79` の退避先のパスは出さず、理由キーと件数だけ (data-model §4「ログ」)」と書き直す
- **根拠**: Constitution Principle V (`constitution.md:473` の「ログへの混入も禁止する」)、data-model §4「ログ」
- **scope 根拠**: tasks BE-042 の文面で直せる。preset-service 自身のログは本 feature の範囲外 (system)

### [Low] 起動の設定の形の検査で拒否された要求 (`invalid-config`) を記録しないことを確かめるテストが無い (L-004) (scope: feature) [new]

- **観察**:
  - 今の `handleLaunchSession` は、`checkLaunchConfig(config)` が偽なら起動の service を呼ばずに `{ status: 'rejected', reason: 'invalid-config' }` を返す (`C:\dev\closta\src\main\app\session-ipc.ts:141-143`)。この拒否は IPC の境界での形の検査で、AD-041 の起動ゲート (service の中) とは別の経路である
  - 本 feature はこの関数の中に、起動元の検証と「`launching` のときだけ記録」を足す (`data-model.md:223,230`、research.md:75)
  - spec が記録しないと名指すのは、「起動ゲートで拒否された・起動に失敗した要求」だけ (`spec.md:176` の AC3、`spec.md:271` の FR-010)
  - BE-043 のテスト (`tasks.md:95`) も「起動ゲートの拒否と起動の失敗は記録しない」だけで、形の検査の拒否 (`invalid-config`) を名指さない
- **同種事象探索**: `invalid-config` (012 の設計文書 6 つ): 0 件。`checkLaunchConfig` (同): 1 件 (`data-model.md:230`。検証の順の記述で、記録しない条件としては書いていない)
- **リスク/影響**: 実装で起動元の記録を形の検査より前に置いても、BE-043 の今の観点では落ちない。その場合、形の崩れた起動要求 (古い renderer・改ざん) が、起動されないまま `preset` / `manual` の回数を増やせる。影響は計測の値だけで、起動の可否と権限には及ばない (起動元は起動の service に渡らない)
- **推奨アクション**: BE-043 の `session-ipc.test.ts` の観点に「`checkLaunchConfig` が拒否する config と `origin: 'preset'` の組で、`deps.launchSession` も `recordLaunchUsage` も呼ばれず、結果が `invalid-config`」を 1 つ足す。spec FR-010 の「記録しない」の列挙に、形の検査の拒否を足してもよい
- **根拠**: SEC-4 (未信頼の入力を検証してから副作用を起こす)、CWE-20
- **scope 根拠**: tasks BE-043 のテストの観点 (と spec FR-010 の 1 語) で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `onerror\|innerHTML\|dangerouslySetInnerHTML\|insertAdjacentHTML\|outerHTML` (012 の設計文書) | 2 | spec.md:189 (強調の Edge Case), tasks.md:44 (FE-012 だけ) |
| M-001 | 同 (src/renderer/src) | 0 (本番) | コメント ProviderScreen.tsx:27、テスト pending-queue-notice.test.tsx:38 |
| M-001 | `no-danger` (eslint.config.mjs) | 0 | - |
| M-001 | Glob `elements/{command-palette,conversation-search}*.tsx` | 0 | source は repo に無い |
| M-003 | `useId\|aria-activedescendant\|DOM の id\|IDREF\|条件 \(f\)` (012 の設計文書) | 1 | data-model.md:184 (列挙だけ。規則は 0 件) |
| M-003 | `getElementById\(\|querySelector\|closest\(\|\.matches\(` (src/renderer/src、テストを除く) | 7 | main.tsx:7, AppShell.tsx:80, RightPanel.tsx:48, image.tsx:284, CenterPane.tsx:46, useDialogReturnFocus.ts:54, useFocusRescue.ts:53 (どれも定数か固定のセレクタ) |
| M-003 | `aria-labelledby\|useId\|id=\{` (SessionListScreen.tsx) | 3 | SessionListScreen.tsx:231, :240, :283 (id は :208-209 で `section.key` から作る) |
| M-003 | `sessionRowKey` の定義 / 列挙の sessionId の検査 | 2 | src/domain/session/summary.ts:59 (NUL 区切り), src/agents/protocol.ts:152-165 (空・長さ・制御文字だけ) |
| M-002 | `ipcMain\.(handle\|on)\(` (src) | 1 | src/main/app/ipc.ts:168 |
| M-002 | `registerIpcHandlers` (src) | 0 (テスト) | 呼び出しは src/main/index.ts:102,126 だけ |
| L-001 | `reject しない\|resolve する` (012 の設計文書) | 2 | data-model.md:225 / research.md:75 (どちらも record の話) |
| L-001 | `writeFile\|throw` (preset-store.ts) | 3 | src/main/infra/settings/preset-store.ts:70,76,177 |
| L-002 | `package\.json\|lockfile\|pnpm-lock` (012 の設計文書) | 0 | - |
| L-003 | `backupPath\?\.value\|backup=` (src/main) | 1 | src/main/app/preset-service.ts:78 |
| L-004 | `invalid-config` (012 の設計文書) | 0 | - |
| L-004 | `checkLaunchConfig\(` (session-ipc.ts) | 2 | src/main/app/session-ipc.ts:142 (起動), :164 (プリセットの保存) |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 4
- Round inheritance: resolved from 3: 0 / unresolved: 6 (R3 M-001・M-003・M-002・L-001・L-002・L-003 = gate M-22・M-25・M-23・L-21・L-12・L-22。どれも severity は据え置き、追加事実なし。M-002 は R1 M-003 から 4 Round 続けて未解消) / new: 1 (L-004)

関係するファイル:
- `C:\dev\closta\specs\012-ui-thread-search\data-model.md`
- `C:\dev\closta\specs\012-ui-thread-search\tasks.md`
- `C:\dev\closta\specs\012-ui-thread-search\research.md`
- `C:\dev\closta\specs\012-ui-thread-search\spec.md`
- `C:\dev\closta\specs\012-ui-thread-search\plan.md`
- `C:\dev\closta\specs\012-ui-thread-search\quickstart.md`
- `C:\dev\closta\src\main\app\ipc.ts`
- `C:\dev\closta\src\main\app\session-ipc.ts`
- `C:\dev\closta\src\main\app\preset-service.ts`
- `C:\dev\closta\src\main\infra\settings\preset-store.ts`
- `C:\dev\closta\src\preload\index.ts`
- `C:\dev\closta\src\domain\session\summary.ts`
- `C:\dev\closta\src\agents\protocol.ts`
- `C:\dev\closta\src\renderer\src\features\session-list\SessionListScreen.tsx`
