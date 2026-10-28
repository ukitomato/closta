# security-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-27
**Reviewer**: security-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001/FR-002 (権限モードの値を main と agents で検証する。項目 16 の包みの検査)、FR-005/FR-006 (モデルをカタログの値に閉じる。引数なしでは呼ばない)、FR-009/FR-010/FR-011/FR-012 (名前の検証。名前をログに出さない。main の registry で受け付けを判定する。env を固定した短命の子で `renameSession` を呼ぶ。`dir` を渡さない)、FR-017 (allowlist の変更)。SC-001/SC-002/SC-003/SC-004 が security の計測経路。
- touched files に該当する charter / Confirmation: AD-062 Decision 1/4/5 と Confirmation (項目 14/16 の fixture、SC-001/003/004 の単体テスト)、AD-034 決定 2 (env 固定の短命プロセス)・決定 3 (書き込み系 API の読み替え)、AD-041 (a) (安全 3 値と `assertSafePermissionMode`)、Constitution III/IV/V/VI/VII、送り元の検査 (`src/main/app/validate.ts:67` `isTrustedSender`、`src/main/app/ipc.ts:197-205` `handle()` の wrapper)。
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:0 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (AD-062 は 3 層の検証を一貫して書いており、security 面で ADR drift は見つからなかった)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

renderer → main に新しい IPC を 3 つ足す (`setSessionPermissionMode` / `setSessionModel` / `renameSession`)。main → supervisor → セッションスレッドに `control-result` を足し、`Query.setPermissionMode` / `setModel` を許可する。env を固定した短命の `utilityProcess` (`src/agents/rename-session.ts`) から SDK の `renameSession()` で transcript に custom-title を追記する。これは本プロジェクトで最初の書き込み系 SDK API で、AD-034 決定 3 の第一の担保 (書き込みを起こす IPC が無い) を崩す。

設計上の主な防御は次のとおり:
- 権限モードは型・main の述語・decoder・`assertSafePermissionMode`・項目 16 の 4 重で閉じる。
- モデルは main がカタログと照合し、decoder が `isValidModelId` を通す。`inferenceProfileId` も `src/domain/provider/model-catalog.ts:63` で同じ述語を通る。
- 改名の会話の id は renderer から受け取らず、main の registry から取る。この id は `src/agents/sdk-agent-session.ts:911` で UUID の形を検査済み。
- 子の env は `buildTranscriptEnv` (最小の許可リスト + `CLAUDE_CONFIG_DIR`。`src/main/infra/session/config-dir.ts:134-139`)。stdio は `ignore`、shell は使わない。
- 名前と例外の文字列をログに出さない。
- 項目 14 に値の import と動的 import の検査を足す。

path traversal・コマンド組み立て・secret の新しい露出は、文面上は見つからなかった。

## Findings

### [High] 新しい 3 つの IPC の送り元の検査の置き場所が、契約と plan の文面で既存コードと食い違う (H-001) (scope: feature)

- **観察**:
  - `contracts/ipc-live-session-settings.md:28` は「送り元の検査 (`isTrustedSender`) に外れた要求は今の handler と同じく捨てる (`invalid-value` を返す)」と書く。`tasks.md:50` (BE-010) も「handler は送り元の検査 → 述語 → service で、戻り値を返す (送り元が信頼できなければ `invalid-value`)」と書き、BE-020 (`tasks.md:63`) と BE-035 (`tasks.md:86-87`) がこれを引き継ぐ。
  - 実際の送り元の検査は、`src/main/app/ipc.ts:197-205` の `handle()` wrapper が全 channel に一律でかけている。外れた要求は `throw new Error('rejected')` で拒否する (`invalid-value` は返さない)。`session-ipc.ts` の handler (`handleInterruptSession` ほか) は `event` を受け取らず、`ipc.ts:384-394` で wrapper 経由で登録されている。
  - plan の「レイヤごとの変更」(`plan.md:62`) と tasks の対象ファイルには、登録の場所 `src/main/app/ipc.ts` が 1 回も出てこない。
  - BE-010 と BE-035 は「handler の送り元の拒否」を `session-ipc.test.ts` で確かめるとしている。しかし `session-ipc.ts` の関数は送り元を見ないので、このテストはその場所では書けない。
- **同種事象探索**: `ipcMain\.handle` (src/scripts/tests) は 1 件 (`src/main/app/ipc.ts:201`。wrapper の中だけ)。scripts/ に `ipcMain` を検査する規則は 0 件で、「必ず wrapper 経由で登録する」は機械では強制されていない。契約側で同じ書き方をしている箇所は `contracts/ipc-live-session-settings.md:28` と `tasks.md:50`、`:63` (「BE-010 と同じ形」)、`:86-87` の 4 箇所。
- **リスク/影響**: 「送り元が外れたら `invalid-value` を返す」を文字どおりに実装しようとすると、implementer は throw する `handle()` wrapper を通さず、`ipcMain.handle` を直接書くか wrapper の外で独自に検査することになりうる。その場合、本 PR で初めて足す書き込み系 IPC (`renameSession`) と権限モードの IPC が送り元の検査の外に出るおそれがある。別 origin の frame や iframe から呼べる経路で、CWE-346 に当たる。現時点では実害は観察されていないので High が上限。
- **推奨アクション**:
  - contracts C 共通節の送り元の行を「`ipc.ts` の `handle()` wrapper で登録する。送り元が外れた要求は既存どおり `rejected` で throw し、`LiveSettingResult` を返さない」に直す。
  - plan の「レイヤごとの変更」表と BE-010 / BE-020 / BE-035 の対象ファイルに `src/main/app/ipc.ts` (`handle(IPC_CHANNELS.setSessionPermissionMode, …)` ほか 3 つ) を足す。
  - 送り元の拒否のテストは、`session-ipc.test.ts` ではなく wrapper の既存テスト、または 3 channel が wrapper 経由で登録されていることを確かめるテストに置く。
- **根拠**: SEC-4 (`event.senderFrame` の検証)、`src/main/app/validate.ts:57-72`、CWE-346。
- **scope 根拠**: 本 feature の contracts / plan / tasks の文面で直せる。

### [Medium] 権限モード・モデルの変更の失敗が main の log に一切残らない (M-001) (scope: feature) [H]

- **観察**: `data-model.md:56` (§3.2) は「reject の理由は送らない・ログに出さない」と書く。§4.2 (`data-model.md:85-92`) の `rejected` / `timeout` / `session-ended` には、main 側でログを出す規定が無い。改名の側には §6.1 の 7 (`data-model.md:145`) で `[session] rename ok` / `rename failed` という固定文字列の観測点がある。
- **リスク/影響**: 権限モードの切り替えが拒否されたり期限を過ぎたりしても、利用者の 1 行表示が消えた後には痕跡が残らない。権限の境界に関わる操作の失敗を後から追えない。
- **推奨アクション**: main の待ちの表 (BE-008) で、解いたときに `[session] live-setting <kind> <reason>` (kind と理由のキーだけ。値・sessionId・例外の文字列は出さない) を 1 行出すと data-model §4.2 に書き、BE-008 のテストで「本文・値の目印が 0 件」と一緒に確かめる。
- **根拠**: reviewer-base H (observability)。
- **scope 根拠**: data-model §4.2 と BE-008 で直せる。

### [Medium] 改名の受け付けの判定と子の追記の間に、新しいターンが始まりうる (TOCTOU)。それを確かめるテストが無い (M-002) (scope: feature) [H]

- **観察**:
  - §5.1 / §6.1 の 2 (`data-model.md:140`) は、要求の時点の状態 (`done` / `interrupted`) で受け付けて `changing` を立てる。そのあと子の起動 (本機では 0.4〜2.4 秒。`plan.md:38`) と `renameSession` の `O_APPEND` が続く。
  - `changing` が止めるのは設定の変更 3 つだけで (`data-model.md:107`, `:197`)、`sendPrompt` (composer からの送信) は止めない。
  - そのため、受け付けてから追記するまでの窓で利用者が送信すると、`claude` の追記と `renameSession` の追記が同じ JSONL で重なりうる。U-6 / RK-03 が守ろうとしている不変条件が崩れる。
- **リスク/影響**: transcript の整合性 (integrity) が損なわれ、特に UNC 越しで壊れるおそれがある (`research.md:101`)。単体テスト (BE-034) は要求の時点の状態だけを見るので、この窓は検出されない。
- **推奨アクション**: 次のどちらかを data-model に書く。(a) 名前の変更中 (`changing === 'name'`) は `sendPrompt` を `busy` で拒否し、BE-034 か送信の handler のテストで確かめる。(b) この窓を RK-03 の範囲として明記し、quickstart V-5 に「改名の直後に送信する」手順を足す。判断の正本は architecture-reviewer (C) と重なるので、dedup の対象。
- **根拠**: reviewer-base H (既存の regression)、CWE-367。
- **scope 根拠**: data-model §5.1 / §6.1 と tasks BE-034 で直せる。

### [Low] 名前の規則が書式文字 (`\p{Cf}`。U+202E などの bidi override・ゼロ幅) を除いていない (L-001) (scope: feature)

- **観察**: `data-model.md:132` (§5.3) が除くのは `\n` / `\r` / `\p{Cc}` / U+2028 / U+2029 だけ。
- **リスク/影響**: 名前は transcript に残り、過去の一覧や CLI の `/resume` で表示される。表示の順序を偽装した名前 (Trojan Source 型) を付けられる。ただし入力するのは利用者本人で、React はテキストとして描くので XSS にはならない。
- **推奨アクション**: `\p{Cf}` (少なくとも U+202A〜U+202E と U+2066〜U+2069) も null にする行を §5.3 と BE-003 のテストの表に足すか、除かない理由を 1 文書く。
- **根拠**: SEC-6、CWE-1007。
- **scope 根拠**: data-model §5.3 で直せる。

### [Low] 動的 import の検査が、パッケージ名をそのまま書いた形しか見ない (L-002) (scope: feature)

- **観察**: `plan.md:228` は「`src.code.includes(AGENT_SDK_PACKAGE)` の分岐の中で `import\s*\(` / `require\s*\(` の引数にパッケージ名があるか」を見るとしている。
- **リスク/影響**: 文字列の連結や `createRequire` で import したファイルは、そもそもこの分岐に入らない。書き込み系 API を呼ぶにはこうした意図的な回避が要るので、Low とする。
- **推奨アクション**: 限界として `UNDETECTED_NOTES` に 1 項目足す (検出しない形の記録)。
- **根拠**: AD-062 Decision 5 (defense-in-depth)。
- **scope 根拠**: 本 feature の rule fixture で記録できる。

### [Low] 承認待ちのまま `plan` に切り替えても、残った承認カードを承認すれば書き込みの tool が実行される (L-003) (scope: feature)

- **観察**: Edge Cases (`spec.md:152`) は「承認カードは残り、利用者の応答は今どおり返る」と書く。一方 SC-009 (`spec.md:223`) は「`plan` に切り替えると書き込みの tool が実行されない」と書く。
- **リスク/影響**: どちらも利用者が明示的に承認した操作なので、権限の昇格には当たらない。ただし quickstart V-1 の判定がこの場合と食い違いうる。
- **推奨アクション**: SC-009 / quickstart に「切り替えの前に出ていた承認カードは対象外」と 1 文足す。
- **根拠**: SEC (権限モードの意味)、AD-020。
- **scope 根拠**: spec / quickstart の文面で直せる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `ipcMain\.handle` (src/scripts/tests) | 1 | src/main/app/ipc.ts:201 |
| H-001 | `ipcMain` (scripts/) | 0 | - |
| H-001 | 契約側の「送り元 → invalid-value」の書き方 | 4 | contracts/ipc-live-session-settings.md:28, tasks.md:50, tasks.md:63, tasks.md:86-87 |
| M-001 | data-model §4.2 のログの規定 | 0 | data-model.md:85-92 |
| M-002 | `changing` が送信を止める規定 | 0 | data-model.md:107, :140, :197 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 3
