# architecture-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: 1 (pr-gate。default モードと ADR-drift モードを兼ねる。ADR-drift の観点 = ARCH-3 は下の D 行と M-002 / M-004 に入れた)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-002 / FR-009 / SC-004: `resume-action.ts` の `resumeActionFor`、`PastResumeBar.tsx`
  - FR-003 / SC-002: `sdk-agent-session.ts` の `case 'system'`、`supervisor-protocol.ts` の `conversation`、`session-launch-service.ts` の `onConversation`
  - FR-004 / SC-002: `session-core.ts` の `QUERY_OPTION_KEYS` (12)、`decodeLaunchOptions`、`validate.ts` の `checkResumeRequest`
  - FR-005 / SC-003: `src/domain/session/resume-axes.ts` の `resolvePastResumeAxes`
  - FR-006〜FR-008 / SC-005: `LaunchDialog.tsx`、`resume-service.ts` の 3 軸の照合
  - FR-010 / FR-011 / SC-006: `session-launch-service.ts` の `resume`、`running-session-store.ts` の `replace`、`e2e/session-resume.spec.ts`
  - FR-012 / FR-013 / SC-007: `resume-service.getResumedTranscript`、`running-session-store.ts` の `applyResumed`
  - FR-014: `startSession` の中の 1 か所 (`resumeOf`)
  - FR-015 / FR-016: AD-059、session charter、glossary、ui-coverage、roadmap、_overview
  - FR-017 / SC-009: `sdk-agent-session.ts` の fail closed
  - SC-001 / SC-008: 実機は未実施 (quickstart-results)。ローカルの verify は緑 (code-gate)
- touched files に該当する charter / Confirmation:
  - session charter: Journey 4 (`charter.md:123-130`)、Key concepts の失敗の理由 (`:143`)、Key concepts の `system` の分岐 (`:165-169`)、業務ルールの再開時の軸の引き継ぎ (`:184`)、KPI の再利用率 (`:209-223`)、Related Specs の X-9 の項 (`:346-349`)
  - AD-059 Confirmation: 12 キーの pin、19 理由の pin、2 つの decoder、同じ会話の 2 本目と退避の表、実機の V-1 / V-3 / V-4 / V-9。単体の部分は全部テストがある。実機の部分は未実施
  - AD-041 (g) / AD-036 §4 P1 (キー集合の変更は ADR を通す)、AD-043 Decision 4 / 5、AD-047 Decision 1、AD-034 (読み取りの経路)、AD-038 (e2e capability の写し)、AD-044 (ui-coverage の割当)、AD-031 (accepted ADR の in-place 編集の禁止)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲 (depcruise は 0 件)
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1。各指摘に対するテストの有無は次のとおり:
  - M-001〜M-004 と L-001 / L-002 は文書の drift で、検出するテストは無い (項目 21 は ui-coverage しか見ない)
  - L-003 は Worker だけが落ちて `claude` が残る場合のテストが無い
  - regression の根拠: `commit()` に `if (prev === undefined) continue` が足された (`session-launch-service.ts`)。`acceptBatch` と `applySynthesized` は registry に無い id を作らない (`src/domain/session/status-update.ts:103-104`, `:139-140`) ので、既存の振る舞いは変わらない。`launch` は `startSession` に切り出されたが、既存のテストはそのまま通っている (test-agent 3856 passed)
  - 観測点: `[session] conversation-id-changed` (値を出さない) と `resume-failed`。L-004 を参照

## スコープ要約

本 PR は X-9 (セッションの再開) の実装と記録である。差分は 86 ファイル。
- **agents**: `QUERY_OPTION_KEYS` に `resume` を足した (11 → 12)。最初の `system/init` の `session_id` を `conversation` の message で 1 回送る。`resume-failed` の 3 つの経路と、権限モードの fail closed を足した
- **supervisor protocol**: `conversation` を窓の外で即時に中継する
- **main**: 退避の表 (上限 256)、同じ会話の 2 本目の判定 (`already-running` / `conversation-running`)、状態を持たない `resume-service`、IPC を 4 つ
- **domain**: 型 (`resume.ts`) と純関数 (`resume-axes.ts`) に分けた
- **renderer**: 再開の形の起動ダイアログ、`replace`、それまでの会話の先頭への挿入、過去の行の帯
- **記録**: AD-059 (accepted)、charter / glossary / ui-coverage / roadmap / _overview

Constitution I〜XV と accepted ADR を照合した結果、Critical / High に当たる drift は観察されなかった。accepted ADR の in-place の編集も無い (`docs/decisions/` の変更は 0059 の新設だけ)。

## Findings

### [Medium] session charter の「アプリは SDK の会話の id を追っていない」が、X-9 の後も残っていて事実と食い違う (M-001) (scope: feature)

- **観察**: `docs/domains/session/charter.md:168-169` は今も「`conversation_reset` の `new_conversation_id` は読まない (アプリは SDK の会話の id を追っていない。/clear の後の id の扱いは X-6 に申し送り)」と書いている。本 PR は最初の `init` の `session_id` を追う経路を実装した。経路は `src/agents/sdk-agent-session.ts` の `case 'system'` → `supervisor-core.ts` の `case 'conversation'` → `session-launch-service.ts` の `onConversation`。charter の差分 (`.pr-gate.diff:95-150`) が直したのは Journey 4・`:143`・Related ADRs / Specs だけである。design-gate R1 の architecture M-002 と同じ事実で、未解消のまま実装まで来た
- **同種事象探索**: `会話の id を追っていない` を `docs/domains/session/charter.md` で検索して 1 件 (`:169`)。AD-059 Context (`0059-…md:20`) にも同じ文があるが、こちらは起票の時点の現状の記述で、事実誤認ではない
- **リスク/影響**: X-6 (/clear の後の id) を設計する人が「アプリは会話の id を持たない」を前提に読む
- **推奨アクション**: `:169` の括弧書きを次のように改める。「アプリは最初の `init` の会話の id だけを main のメモリに持つ (X-9 / AD-059 Decision 2)。`new_conversation_id` は読まず、/clear の後の扱いは X-6」
- **根拠**: Principle XIV、session charter の Key concepts、design-gate architecture M-002
- **scope 根拠**: touched files の charter で直せる

### [Medium] `ResumeUnavailableReason` の 9 値の集合を「変えるには ADR が要る (AD-059)」と宣言しているが、AD-059 はこの集合を決めていない (M-002) (scope: feature)

- **観察**: `src/domain/session/resume.ts:22` に「値の集合を変えるには ADR が要る (AD-059)」とあり、`src/domain/session/resume.test.ts:171` の pin も AD-059 を挙げる。しかし AD-059 の Decision 1〜4 と Confirmation (`docs/decisions/0059-…md:36-62`) は、`ResumeUnavailableReason`・9 値・`conversation-running` に一度も触れない。これらの正本は data-model §3 / §10 である。対照的に `LAUNCH_FAILURE_REASONS` の 19 は Decision 3 と Confirmation にあるので、こちらの pin は ADR と対応している
- **同種事象探索**: `ADR が要る` を `src/domain/session` で検索して 7 件。ADR に無い集合を ADR で守ると書いているのは `resume.ts:22` と `resume.test.ts:171` の 2 件。他の 5 件 (AD-047 / AD-049 / AD-053 / AD-056 / AD-058) は該当の ADR に集合が書かれている
- **リスク/影響**: 理由を 1 つ足すとき、改めるべき決定が AD-059 のどこにも無い。後続の作業は「ADR を起こす」か「data-model だけを直す」かで迷う。どちらを選んでも、pin のコメントと ADR が食い違う
- **推奨アクション**: どちらかに揃える
  - (a) pin のコメントを「集合の正本は 021 data-model §3 (ADR の対象外)」に改める
  - (b) AD-059 の後続 ADR か、AD-031 の訂正節で集合を決定として記録する。accepted の Decision に足すのは決定の変更なので、訂正節には書けない。(b) を採るなら後続 ADR になる

  最小の案は (a)
- **根拠**: AD-031 (訂正節に決定の変更を書かない)、AD-036 §4 P1 の「ADR で守る集合」の慣行
- **scope 根拠**: touched files の `resume.ts` / `resume.test.ts` で直せる

### [Medium] _overview / roadmap / charter の X-9 の記録が、先行の X-8 の書き方と違い「完了」「承認済み」と書いて実機の未実施や夜間の採用を落としている (M-003) (scope: feature)

- **観察**:
  - `docs/domains/_overview.md:73` は「完了: 021 / AD-059」とだけ書く。同じ表の X-8 (`:72`) は「マージ済み: 020 … V-1 / V-3 … は未実施で、利用者の実機に残る」と書いている
  - `docs/roadmap.md:386` は「U-1〜U-8 は承認済み」と書く。spec の判断の一覧 (`spec.md:35-47`)・AD-059 (`0059-…md:13`)・plan (`plan.md:11`) はどれも「2026-10-21 夜間の規則で推奨案を採用」としている。X-8 の行 (`roadmap.md:385`) は「利用者が承認済み」と区別して書いている
  - charter の Related Specs の X-9 の項 (`charter.md:349`) は「実装は 021」だけで、実機の確認の条件 (SC-001 / SC-007 V-2 / SC-009 V-9) が未実施であることに触れない。X-8 の項 (`:345`) は触れている
- **同種事象探索**: `完了: 021|U-1〜U-8 は承認済み|実装は \[021\]` で 3 件 (`_overview.md:73`、`roadmap.md:386`、`charter.md:349`)
- **リスク/影響**: 人が承認したかと実機で確かめたかが、domain の一覧と roadmap で読み取れない。AGENTS.md と記憶の夜間の規則は、承認と採用を分けて記録することを前提にしている。spec の「合否の扱い」(`spec.md:234-237`) は、未確認の項目を X-9 の行に残すことを求めている。roadmap の X-9 の行の後半は未実施を列挙しているので、食い違いは主に「承認済み」の語と _overview / charter の 2 か所にある
- **推奨アクション**:
  - `roadmap.md:386` を「U-1〜U-8 は 2026-10-21 の夜間の規則で推奨案を採用 (利用者の承認は未了)」に改める
  - `_overview.md:73` を X-8 と同じ形にする (「マージ済み: 021 / AD-059。quickstart V-1 / V-2 / V-9 は未実施で、利用者の実機に残る」)
  - `charter.md:349` にも同じ留保を 1 文足す
- **根拠**: spec の「合否の扱い」、X-8 の記録の先例、AGENTS.md の gate の原則
- **scope 根拠**: touched files の 3 文書で直せる

### [Medium] AD-059 の「読み替える箇所」が、実装で破った AD-043 Decision 4 (main を経由するのは状態通知だけ・100ms 窓) を名指していない (M-004) (scope: feature)

- **観察**: AD-043 Decision 4 (`docs/decisions/0043-…md:63-65`) は「状態通知 … だけを supervisor→main→renderer で運び、supervisor の 100ms 窓でまとめる」と定める。本 PR はこれに当たる経路を 2 本足した
  - `supervisor-core.ts` の `case 'conversation'` が、窓の外で即時に main へ書く
  - `src/main/index.ts` の `IPC_CHANNELS.sessionResumable` が、supervisor 由来の情報を、状態通知とは別のチャネルで main→renderer に送る

  AD-059 Decision 2 (`0059-…md:37`) はこの決定を本文に書いている。しかし読み替えの表 (`:29`) の AD-043 の行は「message の種類」だけで、Decision 4 の番号も窓の例外も挙げていない。design-gate R1 の architecture M-003 と同じ事実で、AD-059 が accepted になった今も直っていない
- **同種事象探索**: `Decision 4` を `docs/decisions/0059-…md` で検索して、AD-043 の文脈では 0 件 (Decision 4 は AD-059 自身のものだけ)。実装の側では、窓の外で main に送るのが `supervisor-core.ts` の `conversation` の 1 か所、状態通知以外で main→renderer に送るのが `index.ts` の `sessionResumable` の 2 か所 (stub 経路と本番経路)
- **リスク/影響**: 実装は AD-059 Decision 2 に従っているので、accepted ADR に反した実装ではない。ただし AD-043 Decision 4 から例外を引くと AD-059 に辿り着けない。後続の feature (X-6 の fork / rename の通知など) が「main 経由は状態通知だけ」を根拠に設計すると食い違う
- **推奨アクション**: AD-059 は accepted なので、決定は書き換えない。読み替えの表から行が漏れたのは事実の記述の誤りなので、AD-031 の日付つき「訂正」節で次を足す
  - 「読み替える箇所に AD-043 Decision 4 を加える。`conversation` は窓の外で即時に main へ送り、main で止める。renderer へは `sessionResumable` で真偽だけを送る (決定は Decision 2 のとおりで変えない)」

  決定の中身は変えない
- **根拠**: AD-043 Decision 4、AD-031、design-gate architecture M-003
- **scope 根拠**: touched files の AD-059 に訂正節を足せば直せる (決定は変えない)

### [Low] glossary の Conversation id の Definition が「renderer に値を渡さない」と言い切っており、過去の行の経路と食い違う (L-001) (scope: feature)

- **観察**: `docs/glossary.md:242-245` は、会話の id を「最初の `system/init` から取り、main のメモリだけに持つ。… renderer に値を渡さない」と定義する。しかし過去の行では、同じ値を renderer が `SessionSummaryDTO.sessionId` として持っている。renderer はそれを `resolvePastResume(targetKey, conversationId)` と `ResumeSource.past.conversationId` で main に送る (`src/renderer/src/features/shell/CenterPane.tsx` の `PastResumeBar` の props、`src/main/app/validate.ts` の `checkResumeRequest`)。AD-059 Decision 2 の「renderer に値を渡さない」は、稼働中の行の id に限った話である
- **推奨アクション**: Definition を次の 2 文に分ける。「稼働中の行の会話の id は最初の `init` から取り、main のメモリだけに持つ (renderer に渡さない)。過去の行の会話の id は列挙の `SessionSummaryDTO.sessionId` と同じ値」
- **根拠**: Principle XIV、design-gate architecture L-003

### [Low] glossary に `ResumeUnavailableReason` (9 値) と再開の拒否の `conversation-running` / `already-running` が無い (L-002) (scope: feature)

- **観察**: `docs/glossary.md` の Resume (`:912-921`) は「拒否・失敗の理由に `resume-failed` がある」と書く。しかし `resume-failed` は起動の後の失敗の理由 (`LaunchFailureReason`) である。拒否の理由は別のキーで、UI の文言の表 (`labels.ts` の `RESUME_UNAVAILABLE_LABELS`) が引く 9 値と `conversation-running` になる。`ResumeUnavailableReason|conversation-running` で `docs/` を検索すると 0 件
- **推奨アクション**: FailureReason の項と同じ形で、`ResumeUnavailableReason` (参照キー。訳出は `ui`) を足す。Resume の項の「拒否・失敗の理由」を「拒否は `ResumeUnavailableReason` と `conversation-running`、起動の後の失敗は `resume-failed`」に分ける
- **根拠**: Principle XIV / XV (参照キーと訳出の分離)

### [Low] 同じ会話の 2 本目の判定 (AD-059 Decision 4) が `claudeAlive` に頼っており、AD-043 Decision 5 の残余 (Worker だけが落ちると子が残ったまま枠が空く) と重なる (L-003) (scope: system)

- **観察**: `session-launch-service.ts` の `resume()` は、`entry.claudeAlive && entry.conversationId === resolved.conversationId` だけで `already-running` を返す。AD-043 Decision 5 の残余 (`0043-…md:76`) は、ツールの実行中に Worker だけが落ちると、調停役スレッドが子の生存を確かめずに生存フラグを false にするので、`wsl.exe` / `claude` が残ったまま枠が空いて見えうると記録している。この場合、失敗の行に「再開」が出て、同じ transcript に 2 つの `claude` が書きうる (U-5 が避けたい状態)
- **推奨アクション**: X-6 に送ってある AD-043 Decision 5 の観測の項 (roadmap の X-6) に、「残るなら X-9 の U-5 の判定も破れる」と 1 行足す。本 PR で直す必要はない (仮定の経路で、観測されていない)
- **根拠**: AD-043 Decision 5、AD-059 Decision 4、spec U-5

### [Low] `resume-failed` が「記録が見つからない」と「再開の init の権限モードが安全 3 値の外 (fail closed)」の 2 つの原因を 1 つのキーにまとめ、区別できる観測点が無い (L-004) (scope: feature)

- **観察**: `src/agents/sdk-agent-session.ts` の fail closed の分岐 (`fail('resume-failed'); terminated = true`) は、`init` の前に終わる経路 A〜C と同じキーを使う。ログも出さない。文言 (`labels.ts` の `'resume-failed'`) は両方の原因を並べている。quickstart V-4 (見つからない) と V-9 (昇格) の実機の記録は、理由のキーだけでは見分けられない。AD-059 Decision 3 が 1 つのキーにまとめると決めているので、drift ではない
- **推奨アクション**: キーは変えない。fail closed の分岐で値を含まない 1 行 (例 `[session] resume-permission-mode-rejected`) を supervisor のログに出せば、V-9 の切り分けができる。採るかどうかは棚卸しで決める
- **根拠**: AD-059 Decision 3、Constitution の観測性の慣行 (`conversation-id-changed` の先例)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `会話の id を追っていない` in `docs/domains/session/charter.md` | 1 | `docs/domains/session/charter.md:169` |
| M-002 | `ADR が要る` in `src/domain/session` | 7 (うち ADR に集合が無いもの 2) | `src/domain/session/resume.ts:22`, `src/domain/session/resume.test.ts:171` |
| M-003 | `完了: 021\|U-1〜U-8 は承認済み\|実装は \[021\]` in `docs` | 3 | `docs/domains/_overview.md:73`, `docs/roadmap.md:386`, `docs/domains/session/charter.md:349` |
| M-004 | `Decision 4` (AD-043 の文脈) in `docs/decisions/0059-…md` | 0 | 読み替えの表 `0059-…md:29` に AD-043 Decision 4 が無い。実装の側は `src/agents/supervisor-core.ts` の `case 'conversation'`、`src/main/index.ts` の `sessionResumable` 2 か所 |
| L-002 | `ResumeUnavailableReason\|conversation-running` in `docs` | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 4
