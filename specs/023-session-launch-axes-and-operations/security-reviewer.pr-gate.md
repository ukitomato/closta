# security-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28
**Reviewer**: security-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002: 権限モードは main の述語と agents の assert で安全 3 値に閉じ、項目 16 が包みを検査する。
  - FR-005 / FR-006: モデルはカタログの値と文字種に閉じる。
  - FR-009 / FR-010 / FR-011 / FR-012: 名前の規則、main の registry での受け付け判定、プロンプトの保留、env を固定した短命の子で `renameSession` を呼ぶこと。
  - FR-017: allowlist の変更。
  - security の計測経路は SC-001 / SC-002 / SC-003 / SC-004。
- touched files に該当する charter / Confirmation:
  - AD-062 Decision 1 / 4 / 5
  - AD-063 (`rename-spawner.test.ts` を `PROCESS_SPAWN_MODULES` に足す)
  - AD-034 決定 2 (env 固定の短命プロセス)
  - AD-041 (a) (`assertSafePermissionMode`)
  - Constitution IV / V / VII
  - `src/main/app/ipc.ts:206-214` の `handle()` wrapper (`isTrustedSender`)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (security 面で AD-062 / AD-034 からの drift は見つからなかった)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

renderer → main に IPC を 3 つ足した (`setSessionPermissionMode` / `setSessionModel` / `renameSession`)。

- **preload**: 3 つとも固定 channel の個別関数で露出している (`src/preload/index.ts:85-90`)。汎用のパススルーは無い。
- **送り元の検査**: main 側は 3 つとも `handle()` wrapper で登録しており (`src/main/app/ipc.ts:397-411`)、`isTrustedSender` を通る。design-gate の H-001 は解消している。
- **入力検証**: 3 段で閉じている。
  - 1 段目: `validate.ts:437-460`。引数の数、UUID、安全 3 値、`isValidModelId`、`normalizeSessionName` を見る。
  - 2 段目: service。カタログの照合 (`session-launch-service.ts:550-570`) と状態の判定 (`liveSettingBlocker`) を行う。
  - 3 段目: agents の decoder (`session-core.ts:487-496`) と `assertSafePermissionMode` の包み (`sdk-agent-session.ts:766`)。
- **改名**:
  - 会話の id は renderer から受け取らず、main の registry から取る (UUID の形は検査済み)。
  - 子は `utilityProcess.fork` で起こし、`buildTranscriptEnv` (許可リスト + `CLAUDE_CONFIG_DIR`)、`stdio: 'ignore'` で動く。shell は使わない。
  - 子の側でも `decodeRenameRequest` がキー集合・UUID・名前の規則を確かめ直す (`rename-session.ts:43-53`)。
  - 期限 10 秒、同時上限 10、`dispose` は composition-root の合計に足されている (`composition-root.ts:544`)。
- **ログ**: 名前・会話の id・config ディレクトリをログに出さない (固定文字列だけ)。
- **renderer**: 名前は React のテキスト / `title` 属性で描いている。`dangerouslySetInnerHTML` は 0 件。
- **名前の文字**: `\p{Cc}` を拒否しているので、ESC (ANSI エスケープ) と C1 制御文字は transcript / CLI 表示に入らない。

## Findings

### [Medium] 権限モード・モデルの変更の失敗が main の log に残らない (design-gate M-001 の持ち越し) (M-001) (scope: feature) [H]

- **観察**:
  - `src/main/app/session-launch-service.ts:302-309` の `settle` と、`:345-350` の `onControlResult` は、`rejected` / `timeout` / `session-ended` で解くときに `deps.log` を呼ばない。
  - 改名の側は `src/main/app/session-rename-service.ts:81` で `[session] rename ok|failed` を出している。
- **同種事象探索**: `live-setting|\[session\] (set|control)` を src/main で検索して、ログの行は 0 件。
- **リスク/影響**: 権限の境界に関わる操作 (権限モードの切り替え) が拒否されたり期限を過ぎたりしても、後から追えない。
- **推奨アクション**: `settle` で `[session] live-setting <kind> <reason>` (キーだけ。値と sessionId は出さない) を 1 行出す。
- **根拠**: reviewer-base H (observability)。
- **scope 根拠**: `session-launch-service.ts` の中で直せる。

### [Low] 名前の規則が書式文字 (`\p{Cf}`。U+202E などの bidi override・ゼロ幅) を除いていない (design-gate L-001 の持ち越し) (L-001) (scope: feature)

- **観察**: `src/domain/session/live-settings.ts:82` は `/[\p{Cc}  ]/u` だけを拒否する。
- **リスク/影響**:
  - transcript の custom-title として残り、過去の一覧や CLI の `/resume` で表示の順序を偽装できる (Trojan Source 型)。
  - 入力するのは利用者本人で、React はテキストとして描くので XSS にはならない。
- **推奨アクション**: U+202A〜U+202E と U+2066〜U+2069 (または `\p{Cf}`) も拒否するか、除かない理由を 1 文書く。
- **根拠**: SEC-6、CWE-1007。
- **scope 根拠**: domain の 1 行で直せる。

### [Low] 改名中に保留するプロンプトの数に上限が無い (L-002) (scope: feature)

- **観察**: `src/main/app/session-launch-service.ts:494-498` は `changing === 'name'` の間、`send-prompt` を `heldPrompts` に無制限に足す。`endChange` (`:291-299`) はそれをまとめてセッションスレッドへ送る。
- **リスク/影響**:
  - 送り元は trusted sender に限られ、保留は最長でも改名の期限 + 解決の時間なので、実害は小さい。
  - ただし renderer の不具合 (連続送信) が起きると、メモリとセッションスレッドのキューにまとめて流れ込む。
- **推奨アクション**: 保留の上限 (たとえばセッションスレッドのキューの上限と同じ値) を置き、超えた分は捨ててログのキーを出す。または限界として記録する。
- **根拠**: CWE-770。
- **scope 根拠**: `session-launch-service.ts` で直せる。

### [Low] 新しい 3 channel が `handle()` wrapper で登録されていることを確かめるテストが無い (L-003) (scope: feature) [H]

- **観察**:
  - 登録は `src/main/app/ipc.ts:397-411` で wrapper を通っている (観察上は正しい)。
  - しかし `ipc.ts` は electron を import するのでテストから読み込まれない。`isTrustedSender` の参照はテストで `validate.test.ts` の既存分だけ。
  - 将来 `ipcMain.handle` を直接書いた形を検出する規則もテストも無い。
- **同種事象探索**: `ipcMain\.handle` を src で検索して 1 件 (`ipc.ts:210`。wrapper の中だけ)。
- **リスク/影響**: 送り元の検査の外れは、現時点では起きていない。回帰したときに検出する経路が無い。
- **推奨アクション**: `check.mjs` に「`ipcMain.handle` は `ipc.ts` の wrapper の中だけ」の項目を足すか、限界として `UNDETECTED_NOTES` に記録する。
- **根拠**: SEC-4、CWE-346。
- **scope 根拠**: 本 PR の `scripts/constitution` で扱える。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `live-setting\|\[session\] (set\|control)` (src/main) | 0 | - |
| L-001 | `FORBIDDEN_NAME_CHARS` | 1 | src/domain/session/live-settings.ts:82 |
| L-002 | `heldPrompts` への追加 | 1 | src/main/app/session-launch-service.ts:495 |
| L-003 | `ipcMain\.handle` (src) | 1 | src/main/app/ipc.ts:210 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
