# security-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-003 (会話の id の UUID 検査・ログに出さない), FR-004 (`resume` option と、main・agents の両方での UUID 検査), FR-005 / FR-006 / FR-008 (引き継ぐ 3 軸を main で照合), FR-011 (同じ会話の判定を main の registry で), FR-012 / FR-013 (AD-034 の経路での読み取り), FR-014 (起動ゲートを通す), FR-017 (再開の最初の init での権限モードの fail closed), SC-002, SC-006, SC-009
- touched files に該当する charter / Confirmation: session charter の「再開時、フォルダ / ランタイム / Provider は引き継ぐ」, Constitution III (権限モードは安全 3 値) / V (資格情報と識別子をログ・永続化に出さない), AD-041 (a)/(g) の `QUERY_OPTION_KEYS` の pin, AD-034 (本文は port を通り main を通らない), AD-059 (accepted) Decision 1 (12 キー)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer が owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が owner
- G. optional reviewer 範囲: 該当なし: security reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

renderer から main へのチャネルが 3 本 (`resolvePastResume` / `resumeSession` / `getResumedTranscript`)、main から renderer へのチャネルが 1 本 (`sessionResumable`) 増える。supervisor の protocol には `conversation` のメッセージが 1 種類増え、query の options に `resume` が足される (11 → 12)。

境界を順に確かめた結果は次のとおり。ここに挙げた所で指摘は出ていない。

- **UUID の検査**: 会話の id は 6 か所すべてで厳密な UUID の述語 (`isValidSessionId`) を通る。
  - `src/main/app/validate.ts` の `checkResumeRequest` / `checkPastResumeQuery`
  - `src/agents/supervisor-protocol.ts` の `decodeWorkerMessage` / `decodeSupervisorEventForMain`
  - `src/agents/sdk-agent-session.ts:313` の `decodeLaunchOptions`
  - `src/agents/session-core.ts:186` の `buildQueryOptions`。ここは値をエラーメッセージに含めない
  - 負例のテストは `-x` / `--resume` / 前後に余分な文字が付いた UUID / 数値 / 配列を含む
- **キーの許可リスト**: `checkResumeRequest` は `source` / `config` の両方に厳密な許可リストを当てる。`config` は既存の `checkLaunchConfig` を通るので、昇格の権限モードは拒否される (`validate.test.ts` の bypass の負例)。
- **任意の会話 id は再開できない**:
  - 過去の行の再開は、既知の `targetKey` × 列挙のキャッシュにある行に限られる (`src/main/app/session-service.ts` の `pastResumeSource`)
  - 稼働中の行の再開は、main だけが持つレコードから会話の id と 3 軸を引く (`resume-service.ts` の `resolveResumeSource`)
  - renderer が送ってくる 3 軸は照合にしか使わず、ずれたら `invalid-config` になる
- **preload**: 個別のチャネルを呼ぶ関数だけを出す (汎用のパススルーは無い)。`onSessionResumable` は、payload が配列で、各要素が UUID であることを確かめてから listener に渡す。
- **送り元の検査**: 新しい 3 本のハンドラは、既存の `handle()` の送り元の検査を通る。
- **ログ**: 足されたログの行は `'[session] conversation-id-changed'` (`session-launch-service.ts`) の 1 件だけで、値を含まない。supervisor から stdout / stderr に id が出ないことはテストで確かめている。
- **renderer**: `dangerouslySetInnerHTML` / `innerHTML` / `openExternal` の追加は 0 件。
- **E2E の合成プロンプト**: E2E の capability の中にだけある。capability そのものは既存のゲート (`!app.isPackaged && CLOSTA_E2E==='1'`) で閉じている。
- **権限モードの fail closed (FR-017)**: `sdk-agent-session.ts:889-899` が、再開の最初の `init` の権限モードが安全 3 値の外か、無いときに `resume-failed` で止める。このとき子プロセスが kill されることもテストしている (`sdk-agent-session.test.ts:1943-1958`)。

design-gate の H-001 はこの実装で解消した。design-gate の M-001 (過去の行で `providerId === null` のとき、既定の資格情報で再開されることを知らせる注記が無い) は直っていない。ただし Medium は AD-050 により gate では直さないので、新しい指摘としては挙げ直さない。

## Findings

### [Low] 権限モードの fail closed が、最初のプロンプトが `claude` に渡った後に効く (L-001) (scope: feature)

- **観察**:
  - `src/agents/sdk-agent-session.ts:889-899` の検査は、最初の `system/init` を受けた時点で走る。
  - 単体テストの harness (`src/agents/sdk-agent-session.test.ts:1789-1793` の `runPrompt`) は、`send-prompt` を送った後に init が届く順序を前提にしている。つまり昇格した権限モードを検出した時点で、最初のプロンプトはすでに CLI に渡っている (`:748-751` で `promptQueue` に積まれる)。
  - 止める処理は、ループを抜けて finally の `abortController.abort()` から子の kill へ進む。この間は同期的に進むので、モデルの応答 (tool の実行) が先に来る可能性は低い。ただし、それを確かめるテストも実機の確認も無い (V-9 は未実施。`quickstart-results.md:22`)。
- **同種事象探索**: `sdk-agent-session.ts` で `firstInit &&` を検索して 2 件 (`:891` は権限モードの検査、`:902` は会話の id の送出)。権限モードを init の前に検査する経路は 0 件。
- **リスク/影響**: CLI が `--resume` のとき transcript 側の昇格した権限モードを優先する場合、最初のターンの API リクエストが始まった直後に止まる。`canUseTool` の承認カードを経ずに tool が実行されるには、abort より先にモデルの応答が届く必要があり、その窓は狭い。実害は観察していない。
- **推奨アクション**: 実機の V-9 で、昇格した権限モードの会話を再開したときに最初のターンで tool が実行されないことを記録する。必要なら、再開の起動では init を受けて検査を通るまで `promptQueue` を CLI に流さない形を検討する (別の round や別の spec でよい)。
- **根拠**: Constitution III, AD-041 (a), CWE-269
- **scope 根拠**: feature の touched file (`sdk-agent-session.ts`) と quickstart で扱える

### [Low] 「resume は escalation-neutral」の前提を、偽の SDK の上でしか確かめていない (L-002) (scope: feature)

- **観察**:
  - SC-009 の自動の計測経路 (`sdk-agent-session.test.ts:1932-1971`) は、偽の SDK が返す init の値で分岐を見ている。
  - 実際の CLI が再開の起動で init にどの権限モードを報告するかの確認 (V-9) は、`specs/021-session-resume/quickstart-results.md:22` で未実施になっている。
  - spec の「合否の扱い」はこれを実機の確認の条件として許している。ただし fail closed の検査は、init の `permissionMode` が実効の権限モードを正しく報告するという仮定の上にある。
- **同種事象探索**: `quickstart-results.md` で `V-9` を検索して 1 件 (`:22`。未実施)。
- **リスク/影響**: CLI が init には要求どおりの値を報告し、実際には transcript 側の権限モードで動く場合、検査は素通りする。観測点は init の値の 1 つしか無い。
- **推奨アクション**: 利用者の実機で V-9 を行い、結果を research R-01 と roadmap の X-9 の行に書く。マージは止めない (spec の規則のとおり)。
- **根拠**: Constitution III, spec SC-009
- **scope 根拠**: feature の quickstart / research で扱う

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `firstInit &&` in `src/agents/sdk-agent-session.ts` | 2 | `sdk-agent-session.ts:891`, `:902` |
| L-002 | `V-9` in `specs/021-session-resume/quickstart-results.md` | 1 | `quickstart-results.md:22` |
| (全体) | `dangerouslySetInnerHTML\|innerHTML\|openExternal\|console.(log\|error\|warn)` in `.pr-gate.diff` | 3 | `.pr-gate.diff:7651-7653`, `:8783` (いずれもテストの中で、id が出ないことを確かめる assert) |
| (全体) | `^\+.*log\(` in `.pr-gate.diff` | 1 | `session-launch-service.ts` の `'[session] conversation-id-changed'` (値を含まない) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
