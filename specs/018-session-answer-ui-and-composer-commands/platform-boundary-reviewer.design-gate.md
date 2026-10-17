# platform-boundary-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-17T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - 影響あり: FR-003 / FR-004 / SC-002。承認の応答の境界と、項目 16 の backstop が対象
  - 影響あり: FR-005 / SC-010。query の options のキーと、`onUserDialog` を載せないことが対象
  - 影響あり: FR-007。URL を開く経路が対象
  - 範囲外: FR-001 / FR-002 / FR-006 / FR-008〜FR-017 と SC-001 / SC-003〜SC-009。session / ui の振る舞いで、PB の観点に関わらない
- touched files に該当する charter / Confirmation:
  - runtime / isolation の charter は該当なし。`src/main/infra/runtime/`・capabilities・isolation に触れない (plan.md:41-64)
  - Principle III の判定 (`isAutoModeAllowed`) は触らない
  - AD-052 Confirmation (docs/decisions/0052-ask-user-question-answer-projection.md:43 / :62) と AD-053 Confirmation (`QUERY_OPTION_KEYS` の 9 キーの pin) は、PB-7 として F で見た
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter の Out of scope に踏み込む箇所が無い。plan.md:41-64 の層ごとの変更は runtime / isolation のファイルを含まない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 2 で変わったのは主に次の点で、本 reviewer の観点 (PB-1〜PB-7) に関わる設計は round 1 から変わっていない。

- Elicitation の form / URL の応答の規則が整った (data-model.md:141-167)
- 述語を domain に置き、3 段で共有するようにした (data-model.md:128)
- renderer の送る前の確かめが入った

前の round の 5 件 (Medium 3 / Low 2) は、次の 3 点がどれも round 1 のままである。

- 項目 16 の backstop の範囲: research.md:76 / plan.md:201 / tasks.md:28
- 静的な検査の記述: spec.md:218 / plan.md:197 / data-model.md:76
- `toAskUserQuestionResult(decision, rawInput)` の引数: data-model.md:54

AD-050 により Medium / Low は gate では直さないので、残っていること自体は想定どおりである。各件は unresolved from prev とし、行番号を引き直した。新しい指摘は無い。

各観点の結論:

- **PB-1 (パス型の消失)**: 該当なし。IPC を新しく通る値に `HostPath` / `RuntimePath` が無い。対象は回答の文字列・Elicitation の `content`・`ElicitationPrompt`・`openUrl` / `displayUrl` で、URL は `new URL()` で解釈するだけである (data-model.md:105-107)
- **PB-2 (ランタイムの単一インスタンスの仮定)**: 該当なし。registry はセッションスレッドごとに作られる (data-model.md:179)。module スコープに足すのは定数 `ELICITATION_MAX_PENDING` / `SUPPORTED_DIALOG_KINDS` だけである
- **PB-3 (`capabilities` の虚偽表明)**: 該当なし。`capabilities` の生成と表明に触れない
- **PB-4 (権限ゲートの迂回)**:
  - 権限モードを注入する経路は増えない
  - `boundDecisionScope` を通した後に分ける形は変わらない (data-model.md:66)
  - `updatedPermissions` は出さない (data-model.md:75)
  - Elicitation の `accept` は registry が持つ要求の形で決まり、権限には作用しない (data-model.md:160-165)
  - 穴は `updatedInput` の出口を守る検査にあり、M-001 / M-002 のとおり
- **PB-5 (多段パス変換の欠落)**: パスの変換は該当なし。同じ類型として、URL のネットワーク名前空間の越境を L-002 に残す
- **PB-6 (実質的な永続環境の構築)**: 該当なし。ファイル・ボリューム・ディストロ・ホームディレクトリへの書き込みは無く、回答と入力は永続化しない (tasks.md:99)
- **PB-7 (lint ルール自体の網羅性)**: M-001 / M-002 / M-003 / L-001

## Findings

### [Medium] 項目 16 の新しい backstop は `src/agents/` しか見ず、`updatedInput` の型と組み立てを置く domain が検査の外にある (M-001) (scope: feature) — unresolved from prev

- **観察**:
  - 検査の範囲は今も `AGENT_SDK_IMPORT_DIRECTORIES` (`src/agents/`) に限られる (research.md:76 / plan.md:201 / tasks.md:28)
  - 型 `AskUserQuestionResult` / `CanUseToolResult` と関数 `toAskUserQuestionResult` は domain に置く (data-model.md:18-19 / :54)。agents は戻り値をそのまま SDK に渡すので、domain が `updatedPermissions` を返しても agents には綴りが現れない
  - research.md:78 は「domain にも検査を広げる」案を、例外が要るという理由で退けている。domain の側を守るのは pin テストに任せている
  - 「`updatedPermissions` は src の非テストのコードに 0 件」は、quickstart.md:17 / tasks.md:95 (SH-013 の V-1) の手の確認のままで、CI では強制されない
  - AD-052 Decision 4 (d) (0052:43) も `AGENT_SDK_IMPORT_DIRECTORIES` を範囲にしているので、ADR drift ではない
- **同種事象探索**: `toPermissionResult|updatedInput|updatedPermissions` を `scripts/**`・`tests/rule-fixtures/**`・`eslint.config.mjs` で検索した。scripts に当たったのは注記の 3 件だけで、検査は 0 件 (check.mjs:779 / :938・allowlists.mjs:385)
- **リスク/影響**: `updatedPermissions` は昇格の値である。それを返せる層が domain なのに、CI は domain を見ていない。pin テストが守るのは既存の関数の出力だけで、domain に足された新しい関数は検出しない
- **推奨アクション**:
  - `updatedPermissions` は `src/agents/` と `src/domain/` の非テストのコードで 0 件 (例外なし) にする
  - `updatedInput` は `src/domain/` では `src/domain/session/agent-session.ts` の 1 ファイルだけを実名で許す
  - R-10 の Alternatives の退け方を直し、V-1 の手の確認を CI の検査に置き換える
- **根拠**: AD-052 Decision 4 (d) / Consequences (0052:48) / Constitution Principle III / Principle I の「ディレクトリ単位の除外を使わない」と同じ考え方
- **scope 根拠**: touched files (check.mjs / tests/rule-fixtures) に含まれる

### [Medium] 「全 return が `toPermissionResult` を通す」の静的な検査は存在しないが、spec・plan・data-model は今もそれを直す対象にしている。tasks は実行時の pin で固定すると書いていて食い違う。射影の関数は tool 名を受け取らない (M-002) (scope: feature) — unresolved from prev

- **観察**:
  - 直す対象を「静的な検査」と書く箇所が 3 つある
    - spec.md:218 (FR-004): 「`createCanUseTool` の『全 return は `toPermissionResult` を通す』の静的な検査は、射影の関数を通す形も認めるように直す」
    - plan.md:197: 同じ対象を `session-core.test.ts:248-270` と名指す
    - data-model.md:76: 「`session-core.test.ts:248-270` の静的な検査を 2 つの関数を認める形に直す」
  - 実物の src/agents/session-core.test.ts:248 は、`it('全 return が toPermissionResult 経由で {behavior, message} のみ', …)` という実行時のキーの検査で、ソースを読まない
  - tasks.md:27 (BE-011) は「今のまま通し、…出力のキーの検査で固定する」と書き、上の 3 文書と食い違う
  - `toAskUserQuestionResult(decision, rawInput)` は今も tool 名を引数に取らない (data-model.md:54)。「`AskUserQuestion` だけ」という条件 (AD-052 Decision 1) は agents の呼び出し側の分岐 (data-model.md:66) に懸かる
  - BE-011 に似た名前 (`mcp__x__AskUserQuestion` ほか) の agents の負の fixture はある。一方、domain の関数が自分で条件を守る形にはなっていない
  - 戻り値の型を union にする (research.md:23) と、余分なプロパティの型エラーで止まっていた全部の tool の分岐の歯止めも消える
- **同種事象探索**: `toPermissionResult` を `scripts/**`・`tests/rule-fixtures/**`・`src/agents/*.test.ts`・`eslint.config.mjs` で検索した
  - 静的な検査は 0 件で、当たったのは scripts の注記 3 件 (check.mjs:779 / :938・allowlists.mjs:385) だけ
  - テストは実行時のもの 1 件 (session-core.test.ts:248)
- **リスク/影響**:
  - implementer が存在しない検査を探すか、plan と tasks のどちらに従うかで迷う
  - tool 名の分岐を誤ると、`updatedInput` が別の tool に出る。誤りの例は、無害化の後の名前で比べる、`endsWith` で比べる、など。これを止めるのは agents の単体テストだけになる
- **推奨アクション**:
  - `toAskUserQuestionResult(decision, rawToolName, rawInput)` に改め、関数の中で `rawToolName !== ASK_USER_QUESTION_TOOL_NAME` なら `toPermissionResult(decision)` を返す
  - domain の pin テストに、似た名前の負の fixture を足す
  - spec.md:218 / plan.md:197 / data-model.md:76 の「静的な検査」の記述を、tasks.md:27 の実行時の pin に揃える
- **根拠**: AD-052 Decision 1 / Decision 4 / Constitution Principle III
- **scope 根拠**: spec / plan / data-model と BE-010 / BE-011 の範囲で直せる

### [Medium] 新しい backstop の違反の fixture は `updatedInput` の 1 つだけで、`updatedPermissions` と迂回の形には、発火の確認も検出漏れの記録も無い (M-003) (scope: feature) — unresolved from prev

- **観察**:
  - tasks.md:28 (BE-012) は今も「違反の fixture は 1 つの綴りだけを含め」とし、作るのは `b-equivalent/sdk-updated-input.ts.fixture` だけである。SH-013 (tasks.md:95) の確認も `sdk-updated-input` が発火することだけを見る
  - 検査の正規表現の形も書かれていない。書かれていないのは、識別子の境界・引用符のキー・計算されたキー・shorthand である
  - 既存の項目 16 は、形ごとに fixture を持ち、検出しない形は `UNDETECTED_NOTES` に書く (tests/rule-fixtures/expected.mjs。round 1 で確認)
- **同種事象探索**: `updatedInput|updatedPermissions` を `tests/rule-fixtures/**` で検索して 0 件
- **リスク/影響**:
  - 検査の半分 (`updatedPermissions`) が実際に発火するかを CI が確かめない
  - `['updated' + 'Input']` のような迂回の形について、検出しないのが既知の限界なのか見落としなのかを区別できない
- **推奨アクション**:
  - `sdk-updated-permissions.ts.fixture` を足す
  - 引用符のキー・計算されたキー・shorthand の fixture を足すか、検出しない形を `UNDETECTED_NOTES` に書き、代替を M-002 の domain の pin とする
  - BE-012 に正規表現の形を書く
- **根拠**: AD-052 Decision 4 (d) / Principle VI の Verification の考え方 (検査したから通ったのかを区別する)
- **scope 根拠**: touched files (tests/rule-fixtures) の中で直せる

### [Low] `onUserDialog` / `supportedDialogKinds` を options に載せないことを CI で守るのが、`QUERY_OPTION_KEYS` の単体の pin だけである (L-001) (scope: feature) — unresolved from prev

- **観察**:
  - CI で守るのは BE-021 のテスト (tasks.md:46) と plan.md:196 で、残りは SH-013 の V-1 の手の確認 (tasks.md:95) である
  - plan の「機械強制の変更」(plan.md:194-203) に、項目 16 の `QUERY_ESCALATION_OPTION_KEYS` (allowlists.mjs:397-404) への追加が無い
- **推奨アクション**:
  - 2 つのキーを `QUERY_ESCALATION_OPTION_KEYS` に足し、V-1 の手の確認を CI の検査に置き換える
  - 種類を足すときは、AD-053 Decision 4 が求める後続の ADR で外す
- **根拠**: AD-053 Decision 4 / Confirmation
- **scope 根拠**: allowlists.mjs は plan の機械強制の変更の範囲

### [Low] URL の Elicitation は、ランタイムの中の MCP サーバーが出した URL をホストのブラウザで開く。この名前空間の越境が記録されていない (L-002) (scope: system) — unresolved from prev

- **観察**:
  - URL の検査は http(s) と長さだけである (data-model.md:105)。リンクを押すとホストで開き、同時に `accept` を返す (plan.md:186 / tasks.md:55)
  - URL を出すのはランタイムの中 (WSL、将来は DockerRuntime のコンテナ) の MCP サーバーである。`http://localhost:<port>/…` は、出した側と開く側でネットワークの名前空間が違う
  - `localhost|名前空間|isolation|I-3|ホストのブラウザ` で docs/decisions/0053-elicitation-callback-and-user-dialog.md を検索して 0 件
- **リスク/影響**: DockerRuntime が未実装なので、今は実害が無い。I-1〜I-3 で隔離の境界を設計するときに、ホストへの作用の経路として見落とされうる
- **推奨アクション**:
  - AD-053 の Consequences か isolation charter の Open Questions に 1 行残す
  - 内容は「URL の Elicitation はランタイムの名前空間の URL をホストで開く。隔離の中での扱いと localhost の解釈は I-3 で決める」
- **根拠**: AD-003 / AD-012 / isolation charter の Mission
- **scope 根拠**: isolation domain の設計 (I-3) の領域で、touched files の外

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `toPermissionResult\|updatedInput\|updatedPermissions` in scripts/** , tests/rule-fixtures/** , eslint.config.mjs | 3 (注記のみ。検査 0) | scripts/constitution/check.mjs:779, :938 / scripts/constitution/allowlists.mjs:385 |
| M-001 | `静的な検査\|updatedPermissions\|AGENT_SDK_IMPORT_DIRECTORIES\|src/domain/` in spec/plan/research/quickstart | 範囲の記述 3 | research.md:76, :78 / plan.md:201 / quickstart.md:17 |
| M-002 | `toPermissionResult` in src/agents/*.test.ts | 1 (実行時) | src/agents/session-core.test.ts:248 |
| M-002 | 「静的な検査」の記述 | 3 | spec.md:218 / plan.md:197 / data-model.md:76 (対して tasks.md:27 は実行時) |
| M-003 | `updatedInput\|updatedPermissions` in tests/rule-fixtures/** | 0 | — |
| L-001 | `QUERY_ESCALATION_OPTION_KEYS` in plan.md | 0 | — (allowlists.mjs:397-404) |
| L-002 | `localhost\|名前空間\|isolation\|I-3\|ホストのブラウザ` in docs/decisions/0053-elicitation-callback-and-user-dialog.md | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 2
- Round inheritance: resolved from 1: 0 / unresolved: 5 (M-001 / M-002 / M-003 / L-001 / L-002) / new: 0
