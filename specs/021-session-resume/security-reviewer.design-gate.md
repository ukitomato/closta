# security-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/021-session-resume/spec.md

## 初回読了 viewpoint

- FR/SC: FR-003 (会話の id の UUID 検査・永続化しない・ログに出さない), FR-004 (`resume` option と 3 か所の UUID 検査), FR-005 (過去の行の Provider の推定), FR-006 / FR-008 (引き継ぐ 3 軸を main で照合), FR-011 (同じ会話の判定を main で), FR-012 / FR-013 (それまでの会話を AD-034 の経路で読む), FR-014 (起動ゲートを通す), SC-002 (UUID でない値を main と agents で拒否), SC-006
- touched files に該当する charter / Confirmation: session charter の業務ルール「再開時、フォルダ / ランタイム / Provider は引き継ぐ」(`charter.md:182`), Constitution III (安全 3 値の権限モード) / V (資格情報を永続化しない), AD-041 (a) / (g) の Confirmation (`QUERY_OPTION_KEYS` の pin), AD-034 (取得プロセスと port), AD-059 (proposed) の Confirmation
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:1 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が owner (Principle III は H-001 でセキュリティの面からだけ扱う)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が owner
- G. optional reviewer 範囲: 該当なし: security reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:0 Low:0 (H-001 の再開後の権限モードを確かめるテストと実機の項目が無い。それ以外の境界: UUID の負例 (BE-003 / BE-011)、ログに id を出さない Grep テスト (BE-004 / BE-005 / BE-006 / BE-014)、送り元の検査 (BE-014) はテストの観点が tasks に書かれている)

## スコープ要約

Agent SDK の `resume` で会話を続ける設計の bundle (spec / plan / research / data-model / contracts C-1〜C-6 / quickstart / tasks / AD-059 draft)。まだ diff は無い。セキュリティに効く面は次のとおり。(1) renderer から来る `conversationId` / `targetKey` / `sessionId` が `--resume <id>` として `claude` の argv (WSL は `wsl.exe --exec`、Win32 は `claude.exe`) に入る。(2) IPC が 4 本増える (renderer → main が 3 本、main → renderer が 1 本)。(3) supervisor の protocol に message が 1 種類増える。(4) 過去の区画の行は CLI で作った会話でもよく、その再開時に資格情報と権限の扱いがどうなるか。

既存の作業ツリーと照合した結果。
- `isValidSessionId` は厳密な UUID の正規表現 (`src/domain/validation.ts:177-181`) なので、空白・引用符・`-` で始まる値・パス区切りは構造的に弾かれる。
- 送り元の検査は、全 handler を `handle()` で包む形で既にある (`src/main/app/ipc.ts:178-186`)。
- E2E の capability は `!app.isPackaged && CLOSTA_E2E==='1'` でゲートされている (`src/main/index.ts:103`)。

設計の意図どおり実装されれば、argv injection、path traversal、renderer による軸の差し替え (main の 3 軸照合)、任意の会話 id の再開 (列挙のキャッシュにある行に限る。data-model §3.2) は塞がっている。

## Findings

### [High] 「resume は escalation-neutral」の前提を確かめる経路が無い。CLI で昇格モードで作った過去の会話を再開したときの権限モードを、検査も実機確認もしていない (H-001) (scope: feature)

- **観察**:
  - 過去の区画の行は `~/.claude/projects` を列挙した結果で、Closta の外 (端末の `claude`。昇格の権限モードでもよい) で作った会話も含む。spec Edge Cases がこれを前提にしている (`specs/021-session-resume/spec.md:163`)。
  - `research.md:15` は「`resume` は transcript を読み込んで会話を続けるだけで、権限モード・tool の集合・env・MCP サーバーを変えない」と言い切る。根拠は `sdk.d.ts` の 1 行の説明だけで、CLI が再開時に元のセッションのモードや session 単位の許可を戻さないことの確認は無い。
  - 起動側は `assertSafePermissionMode` で安全 3 値を渡す (`src/agents/sdk-agent-session.ts:798`)。一方 `init` の `permissionMode` は表示の行に流すだけ (`src/agents/live-signals.ts:437-445`, `:776`)。要求したモードと違っても失敗にしない。
  - quickstart V-1〜V-7 (`specs/021-session-resume/quickstart.md`) に、再開後の権限モードを確かめる項目が無い。
  - tasks の BE-003 / BE-004 にも、再開の起動の `init` の `permissionMode` を見るテストが無い。
- **同種事象探索**:
  - `permissionMode|権限モード` を `specs/021-session-resume/quickstart.md` で検索して 0 件。
  - 同じ語を `specs/021-session-resume/tasks.md` で検索して 2 件 (`:28` は `buildQueryOptions` の assert が `resume` の有無で変わらないことのテスト、`:55` はダイアログの選択肢)。どちらも再開後の実効モードを見ていない。
- **リスク/影響**: CLI が `--resume` のときに transcript 側のモードや許可規則を `--permission-mode` より優先すると、利用者の起動設定とは無関係に昇格した会話が Closta の中で動く。昇格モードでは `canUseTool` の承認カードが出ないので、Constitution III (権限モードは capability に従う / 安全 3 値) を迂回する経路になる。設計の段階では実害を観察できないので High に留める。
- **推奨アクション**:
  1. quickstart に V を 1 つ足す。端末で `claude --permission-mode acceptEdits` (と、環境で許されるなら bypass の相当) で 1 ターン話した会話を、過去の区画から `default` で再開する。`init` の `permissionMode` と承認カードが出ることを記録する。
  2. 多重の防御として、BE-004 に条件を足す。再開の起動で、`init` の `permissionMode` が `launchOptions.permissionMode` と違い、かつ安全 3 値の外であれば、その時点で `query` を中断して失敗にする (fail closed。理由のキーは既存のものか `resume-failed`)。BE-004 のテストに「再開で `init` が安全 3 値の外のモードを報告したら失敗にする」を足す。
  3. 確かめた結果を research R-01 の「escalation-neutral の根拠」に追記する。
- **根拠**: Constitution Principle III, AD-041 (a), CWE-269 (権限管理の不備)
- **scope 根拠**: feature の touched files (`sdk-agent-session.ts`・quickstart・research) で直せる

### [Medium] 過去の行の再開で、資格情報 (アカウント / 組織) が元の会話と違うまま、利用者に知らせずに続く (M-001) (scope: feature)

- **観察**:
  - data-model §3.1 段 3 (`specs/021-session-resume/data-model.md:153-156`) は、候補が 0 で `origin: 'default'` なら Provider なしにする。research R-05 の「引き継がないもの」(`research.md:68`) と AD-059 Consequences (`docs/decisions/0059-...md:45`) は、元の会話が API キーなどの Provider で既定の config ディレクトリに書かれていた場合に、既定の資格情報で再開されることを認めている。
  - それでも再開の形のダイアログ (§9.3) は Provider を「表示だけ」で出し、元の Provider が分からないことを示さない。spec FR-005 と US-3 は「Provider は引き継ぐ」と書いており、利用者は引き継がれたと読む。
- **リスク/影響**: 業務用の API キー / 組織で作った会話の文脈 (コード片や機密を含みうる) が、個人の既定のログインなど別のアカウントへ送られる。課金先とデータの扱いの規約も変わる。利用者はそれを知る手段が無い。
- **推奨アクション**: 過去の行から開いた再開の形のダイアログで `providerId === null` のときに注記を 1 行出す (例「元の会話の Provider は記録から分かりません。既定の config ディレクトリの資格情報で再開します」)。文言は `labels.ts` に置き、FE-011 / FE-030 のテストに 1 件足す。または spec FR-005 の「引き継ぐ」を、過去の行については「config ディレクトリから推定する」と書き直し、US-3 の Independent Test に含める。
- **根拠**: Constitution V の趣旨 (資格情報の境界), session charter `:182`
- **scope 根拠**: feature のダイアログと文言で直せる

### [Low] C-1 は「送り元が外れたら `{ ok: false, reason: 'source-unknown' }`」と書くが、既存の `handle()` は送り元が外れると throw する (L-001) (scope: feature)

- **観察**: `specs/021-session-resume/contracts/ipc-session-resume.md:23` は送り元の検査と `checkPastResumeQuery` の外れを同じ戻り値にまとめている。既存の `src/main/app/ipc.ts:183` は、信頼できない送り元に内容の無い `Error('rejected')` を投げ、どのチャネルがあるかを教えない方針。
- **推奨アクション**: C-1 / C-2 / C-3 の「main の検証」を「送り元は `handle()` の共通の拒否 (throw)、述語の外れは表の戻り値」と書き分ける。送り元の拒否を戻り値にすると、既存の方針 (チャネルの存在を教えない) と食い違う。
- **根拠**: 既存の `handle()` の方針, CWE-200

### [Low] `sessionResumable` の payload の形が data-model と contracts で食い違う (L-002) (scope: feature)

- **観察**: data-model §1.4 (`data-model.md:70`) は `{ sessionId }` を 1 回送ると書く。contracts C-4 (`contracts/ipc-session-resume.md:59`, `:66`) は `readonly string[]` を受け、preload は配列であることを確かめてから渡すと書く。
- **リスク/影響**: data-model のとおりに main を実装すると、preload の検査 (配列でなければ渡さない) で全件が捨てられ、「再開」が出ない。境界の検証の形が 1 つに決まっていない。
- **推奨アクション**: どちらかの形に揃える。既存の `sessionStatus` の配列の形に合わせるなら、data-model §1.4 を「`[sessionId]` を送る」に直す。BE-014 のテストに、main の送出の形と preload の検査の往復を 1 件足す。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `permissionMode\|権限モード` in `specs/021-session-resume/quickstart.md` | 0 | - |
| H-001 | `permissionMode\|権限モード` in `specs/021-session-resume/tasks.md` | 2 | `tasks.md:28`, `tasks.md:55` (再開後の実効モードの検査ではない) |
| H-001 | `observePermissionMode` in `src/agents/live-signals.ts` | 3 | `live-signals.ts:437`, `:453`, `:776` (表示だけで fail closed ではない) |
| M-001 | `Provider なし\|providerId: null` in data-model / research / AD-059 | 3 | `data-model.md:155`, `research.md:68`, `0059-...md:45` |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 2
