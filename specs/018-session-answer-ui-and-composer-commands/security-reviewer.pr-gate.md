# security-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18T00:00:00Z
**Reviewer**: security-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (AskUserQuestion の回答の射影と承認の応答の境界)、FR-005〜FR-011 (onElicitation・elicitation-request・respond-elicitation・入力を残さない・URL を開く経路)、FR-012〜FR-015 (composer。入力は自分の側の文字列だけで、信頼境界は越えない)、SC-002 / SC-003 / SC-004 / SC-010 が本 reviewer の対象
- touched files に該当する charter / Confirmation: session charter (SessionEvent / SessionControl の種類、PermissionDecision の拡張)、AD-052 (updatedInput は元の入力 + answers だけ)、AD-053 Decision 3 (入力を永続化しない・ログに出さない)、AD-053 Decision 5 (URL は既存の `openExternalIfHttp` の経路だけ。URL を開く IPC を作らない)、AD-023 (BrowserWindow の hardening。本 PR では変更なし)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-053 Decision 5 の「URL を開く IPC を作らない」は B の観点で守られていることを確かめた)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

本 PR で信頼境界を越える経路が 2 つ増えた。1 つは `respondPermission` に省略可の 5 つめの引数 `answers` が加わったこと、もう 1 つは IPC チャネル `respondElicitation` の新設と、SDK の `onElicitation` 経由で未信頼の `ElicitationRequest` を renderer に運ぶ `elicitation-request` イベントである。以下を確かめた。

- **preload**: `src/preload/index.ts:61-71`。チャネルは 1 つずつ固定で、汎用のパススルーは無い
- **main**: `src/main/app/ipc.ts:310` は既存の `handle()` ラッパーを通るので `isTrustedSender` が効く。`src/main/app/session-ipc.ts:263-312` は検証してから送る。`src/main/app/validate.ts:402-426` は domain の述語に委ねる
- **agents**: 回答の射影は `src/domain/session/agent-session.ts:595-640`。Elicitation の registry・照合・`decodeElicitationResponse` は `src/agents/session-core.ts`
- **domain**: 要求の写し、受け口での再検査、`content` の述語は `src/domain/session/elicitation.ts`
- **renderer の URL**: `src/renderer/src/features/session/ElicitationCard.tsx:239-249` の `<a target="_blank">` から、`src/main/app/window.ts:65-68` の `setWindowOpenHandler`、`openExternalIfHttp` (window.ts:31-39) の順に流れる。http(s) 以外は main で弾かれる

BrowserWindow の `webPreferences`・CSP・ナビゲーションの方針は本 PR で変わっていない。

## Findings

### [Low] URL の Elicitation のカードの表示用 URL は 300 コードポイントで切られるが、開く URL は 2,048 文字まで通る (L-001) (scope: feature)

- **観察**: `src/domain/session/elicitation.ts:178` で、表示用の URL は `oneLineRedacted(text, 300)` で作られる。一方 `elicitation.ts:179` の開く URL (`openUrl`) は `ELICITATION_URL_MAX_LENGTH = 2048` (`elicitation.ts:31`) まで通る。カード (`ElicitationCard.tsx:234-248`) は切り詰めた表示用 URL と、`parsed.host` (`elicitation.ts:191`) をリンクの名前に出す
- **同種事象探索**: `oneLineRedacted\(text, 300\)|ELICITATION_URL_MAX_LENGTH` で 3 件 (`src/domain/session/elicitation.ts:31`, `:178`, `:179`)。他の URL 表示経路への波及は無い
- **リスク/影響**: 長い URL では、パスやクエリの後半 (リダイレクト先のパラメータなど) を利用者が開く前に確かめられない。ただし host は URL パーサーが正規化した値 (IDN は punycode、userinfo は伏せた上で除外) をリンクに出す。`https://trusted@evil` の形でも `evil` が host として見えるので、送り先を偽る経路は無い。防御を厚くする提案の範囲に留まる
- **推奨アクション**: 切ったときは末尾に省略の印を付ける。または開く URL の長さの上限を表示の上限と揃える。どちらも必須ではない
- **根拠**: CWE-451 (UI の誤表示)。spec の Edge Cases (「host を強調」)
- **scope 根拠**: 本 PR の touched file (`src/domain/session/elicitation.ts`) で直せる

### [Low] form の文字列の項目の `format` (email / uri / date / date-time) を送る前に照合していない (L-002) (scope: feature)

- **観察**: `src/domain/session/elicitation.ts:359-369` の `matchesField` は、`string` の項目について長さ・必須・`minLength` / `maxLength` だけを見て、`format` は見ない。renderer (`ElicitationCard.tsx:148-156`) は `type="email"` / `type="url"` を付けるが、`form` 要素を使わないため、ブラウザの制約検証が送信を止めない
- **同種事象探索**: `field.format|STRING_FORMATS` で 6 件 (`src/domain/session/elicitation.ts:43`, `:273`, `:457`, `:466`, `src/renderer/src/features/session/ElicitationCard.tsx:152`, `:154`)。照合の分岐 (`matchesField`) で `format` を参照する箇所は 0 件
- **リスク/影響**: スキーマが宣言した形に合わない文字列が MCP サーバーに `accept` で届く。値の型・長さ・キーの集合は 3 段の検証 (renderer・main・agents) で守られているので、アプリの側に injection の経路は無い。影響は受け取ったサーバーの側の検証の負担に限られる
- **推奨アクション**: `matchesField` で `format` ごとの軽い検査を足す (`uri` は `new URL` が通るか、`date` は `YYYY-MM-DD` の形か)。または data-model に「`format` は表示のヒントだけで照合しない」と書いておく
- **根拠**: OWASP ASVS V5.1 (入力の形の検証)
- **scope 根拠**: 本 PR の touched file で直せる

## H. テスト / coverage / observability / regression (担当範囲)

- **main の入力検証の負例**: `src/main/app/session-ipc.test.ts:6690-6776` に負例がある。`answers` は空白だけ・5 件・数を含む・0 件・配列でない・null。`content` は 33 キー・`__proto__`・入れ子の object・配列・null・NaN・1,001 コードポイント。ほかに非 UUID・列挙の外の `action`。どれも「制御を送らない」ことを確かめている。`decline` / `cancel` に付いた `content` が捨てられることも目印 (`MARK`) で確かめている
- **URL の scheme**: `src/domain/session/elicitation.test.ts:80-81` で、`javascript:` と `file:` は開く URL にならない。`elicitation.test.ts:330` では、renderer の受け口が `file:` の開く URL を破棄する。main の `openExternalIfHttp` (`window.ts:31-39`) は本 PR で変わらず、最終防御として残る
- **入力を残さない (SC-004)**: `tests/elicitation/elicitation-through.test.tsx:148-175` で、目印の値が console の全メソッド・ストア・イベント・DOM・設定の保存に 0 件で、SDK への戻り値にだけ届くことを確かめている。本番コードの `console.*` を探したところ、制御・応答・content を出す箇所は 0 件だった
- **送り元の検証**: `respondElicitation` は既存の `handle()` (`src/main/app/ipc.ts:173-178`) を通るので、`isTrustedSender` の既存のテスト (`validate.test.ts:91-109`) がそのまま当たる。新しいチャネルは登録の経路を共有しているので、迂回の余地は無い
- **観測点**: 検証に落ちた IPC は黙って捨てられ (仕様 U-9)、log に出ない。「main で落ちるのは renderer の不具合のときだけ」という前提は、domain の同じ述語を使っていることと component テストで支えられている。セキュリティ上の観測点の欠落とまでは言えない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `oneLineRedacted\(text, 300\)\|ELICITATION_URL_MAX_LENGTH` | 3 | src/domain/session/elicitation.ts:31, :178, :179 |
| L-002 | `field.format\|STRING_FORMATS` (`matchesField` での参照) | 6 (照合での参照 0) | src/domain/session/elicitation.ts:43, :273, :457, :466; src/renderer/src/features/session/ElicitationCard.tsx:152, :154 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
