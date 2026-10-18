# platform-boundary-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Gate**: pr-gate Round 1 / scope: system

## 初回読了 viewpoint

- FR/SC:
  - 影響あり: FR-003 / FR-004 / SC-002。権限の応答の境界 (`toAskUserQuestionResult`, `boundDecisionScope`) と、項目 16 に足した P2 の綴りの検査
  - 影響あり: FR-005 / SC-010。`onElicitation` を 9 個目のキーとして足したこと。`onUserDialog` / `supportedDialogKinds` は載せていない
  - 影響あり: FR-007 / FR-008。URL をホストのブラウザで開く経路と、IPC `respondElicitation` をセッションごとに振り分けること
  - 範囲外: FR-001 / FR-002 / FR-006 / FR-009〜FR-017、SC-001 / SC-003〜SC-009 (UI・表示・記録の範囲)
- touched files に該当する charter / Confirmation:
  - runtime / isolation の charter: touched files に入っていない。両 charter で `Elicitation|ブラウザ|openExternal|URL` を検索して 0 件
  - Principle III: `autoModeSafe` / `isAutoModeAllowed` の判定は diff に無い。`canUseTool` の scope は `once` に固定されたまま (src/agents/session-core.ts:211, :224)
  - Principle VII: agents が新しく import しているのは domain のモジュールだけ (src/agents/sdk-agent-session.ts:4363-4371)
  - AD-052 Decision 4 (d) / AD-053 Decision 1・4・5 の Confirmation は PB-7 と PB-4 で見た
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

O-10 では次の 4 つが加わった。
- `AskUserQuestion` の許可に限り、`updatedInput` を返す (組み立ては domain の `toAskUserQuestionResult`)
- Elicitation の registry と callback (`run()` の closure の中、`src/agents/sdk-agent-session.ts:4376-4407` diff)
- main の IPC handler `handleRespondElicitation` (sessionId で振り分け)
- 項目 16 の P2 の綴りの検査 (`scripts/constitution/check.mjs` +918-926)

プラットフォーム境界の観点ごとの結果:
- PB-1: パスは IPC を流れない。URL だけがランタイムの名前空間からホストへ渡る → C-L-001
- PB-2: 該当なし。registry は per-run の closure の中にある。renderer のストアは sessionId で区切った `elicitations` を持つ (running-session-store.ts:469-472, :700-709)。コマンドの候補は表示中のセッションの meters から作る (LivePane.tsx:163)。module スコープの可変状態は 0 件
- PB-3: 該当なし。`capabilities` の表明を変えていない
- PB-4: 迂回経路は増えていない (詳細は下の「PB 別の補足」)
- PB-5: 該当なし。パス変換を変えていない
- PB-6: 該当なし。volume / restart / commit / ホストへの書き込みが diff に無い
- PB-7: F-M-001 / F-M-002

code-gate の M-001 / M-003 / L-002 を、round をまたいで残っている指摘として持ち越す。AD-050 により Medium / Low は gate で直さない。

## Findings

### [Medium] 項目 16 の P2 の検査は `AGENT_SDK_IMPORT_DIRECTORIES` (src/agents/) しか見ない。`updatedInput` を組む domain の関数は検査の外にある (M-001) (scope: feature) — unresolved from code-gate M-001
- **観察**: `scripts/constitution/check.mjs:918-926` の `for (const key of ['updatedInput','updatedPermissions'])` は `sdkScope` だけを走査する。一方、組み立ての本体は `src/domain/session/agent-session.ts:390` (`return { behavior: 'allow', updatedInput }`) にある。domain の別の関数が `updatedPermissions` を返すように変わっても、項目 16 は発火しない。現時点で domain の非テストのコードに `updatedPermissions` は 0 件で、実害は無い
- **同種事象探索**: `\bupdated(Input|Permissions)\b` を src の非テストで検索して 9 件 (code-gate と同じ。agent-session.ts:279/:300/:303/:343/:371/:382/:383/:390、session-core.ts:205)
- **リスク/影響**: AD-052 は「`updatedPermissions` は全 tool で 0」と決めた。この不変条件を機械で守るのは単体の pin だけになっている
- **推奨アクション**: P2 の走査対象に `src/domain/` を足し、`updatedInput` は `src/domain/session/agent-session.ts` の 1 ファイルだけを実名で許す。`updatedPermissions` は例外なしにする
- **根拠**: AD-052 Decision 4 (c)(d) / Constitution Principle III
- **scope 根拠**: touched files (check.mjs) で直せる

### [Medium] P2 の違反 fixture は `updatedInput` の 1 つだけ。`updatedPermissions` の発火確認も、文字列の組み立てで迂回する形の UNDETECTED_NOTES も無い (M-002) (scope: feature) — unresolved from code-gate M-003
- **観察**: `tests/rule-fixtures/b-equivalent/sdk-updated-input.ts.fixture` だけがあり、`expected.mjs` に足された行は 1 行。正規表現は `\bupdatedInput\b` を探すので、`obj['updated' + 'Input']` は拾えない。その旨は UNDETECTED_NOTES に書かれていない
- **同種事象探索**: tests/rule-fixtures で `updatedPermissions` を検索して 0 件
- **リスク/影響**: ループの 2 つめのキー (`updatedPermissions`) が実際に発火するかを CI が確かめていない
- **推奨アクション**: `b-equivalent/sdk-updated-permissions.ts.fixture` を足す。組み立て形を拾えないことを UNDETECTED_NOTES に書く
- **根拠**: AD-052 Decision 4 (d) / AD-024
- **scope 根拠**: touched files (tests/rule-fixtures) で直せる

### [Low] URL の Elicitation が、ランタイムの名前空間の URL をホストのブラウザで開く。その越境が runtime / isolation の charter と AD-053 に書かれていない (L-001) (scope: system) — unresolved from code-gate L-002
- **観察**: `src/renderer/src/features/session/ElicitationCard.tsx:239-245` が `target="_blank"` のリンクを出し、`src/main/app/window.ts:65-66` (`setWindowOpenHandler`) → `:31` (`openExternalIfHttp`) でホストの既定のブラウザに渡す。URL を出す MCP サーバーは、ランタイム (WSL ディストロ / docker コンテナ) の中で動く。ランタイムを指す `http://localhost:<port>/callback` のような URL は、ホストでは別の宛先に解決されうる (docker でポートを公開していないコンテナでは届かない)。正しさの問題ではなく「手続きが終わらない」UX 上の制約で、URL の扱いは安全側 (http(s) だけ) に倒れている
- **同種事象探索**: runtime/isolation の charter で `Elicitation|ブラウザ|openExternal|URL` を検索して 0 件。`src/domain/session/elicitation.ts` で `localhost|127\.0\.0\.1|名前空間|ランタイム` を検索して 0 件
- **推奨アクション**: isolation charter の Open Questions に「ランタイムの中の MCP サーバーが出す URL はホストで開く。loopback の URL はランタイムによって届かない」と 1 行書く。docker で loopback が届かない件は、実機で確かめた時点で別の spec にする
- **根拠**: AD-003 (ランタイムは複数・境界は transport) / AD-012 (endpoint の多段)
- **scope 根拠**: touched files の外の charter の追記。本 PR では閉じない

## PB 別の補足 (findings にしない観察)

- PB-4: `respondPermission` の `answers` は検証を通った後、`AskUserQuestion` の完全一致のときだけ `toAskUserQuestionResult` で使われる。それ以外の tool では `toPermissionResult` が捨てる (src/agents/session-core.ts:213, :225)。`boundDecisionScope` は射影より前に効くので、`capability` に昇格する経路は無い (session-core.ts:224)。`respond-elicitation` は権限モードに触れない。`onUserDialog` は options に載っていない
- PB-7: P2 の検査はコメントを除いた `src.code` を見る。AD-052 Decision 4 (d) の「射影の関数の呼び出しの外」より厳しく書かれていて (agents では例外が 0)、取りこぼしの方向ではない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `\bupdated(Input\|Permissions)\b` in src (非テスト) | 9 | agent-session.ts:279, :300, :303, :343, :371, :382, :383, :390 / session-core.ts:205 |
| M-002 | `updatedPermissions` in tests/rule-fixtures | 0 | — |
| L-001 | `Elicitation\|ブラウザ\|openExternal\|URL` in runtime/isolation charter / `localhost\|127\.0\.0\.1\|名前空間\|ランタイム` in elicitation.ts | 0 / 0 | — |
| (PB-2) | `^(let\|const\|var) \w+ = (new Map\|new Set\|\[\]\|\{\}\|null)` in agents / domain/session / main/app の非テスト | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
