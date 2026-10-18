# architecture-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Gate**: pr-gate / Round 1 / scope: feature / modes: default + adr-drift

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (AskUserQuestion の射影・pin) / FR-005〜FR-011 (onElicitation・elicitation-request・respond-elicitation・保持の破棄・elicitation_complete・承認待ちの状態) / FR-012〜FR-015 (コマンドの候補・名前・フォーカス・編集して再試行) / FR-016 (ui-coverage) / FR-017 (glossary・charter・roadmap・005 pointer)。SC-001〜SC-010 はすべて本 PR が対象
- touched files に当たる charter / Confirmation:
  - session charter (Related Specs の O-10・Related ADRs・業務ルール III/IV/V/IX/X)
  - ui charter (composer の slash commands の持ち主)
  - `_overview.md` の Cross-domain invariants (III / IV / V / VII / IX / X / XII)
  - AD-052 の Decision 1〜4 と Confirmation (SC-001 / SC-002・項目 16 の backstop)
  - AD-053 の Decision 1〜6 と Confirmation (SC-003 / SC-004 / SC-010)
  - AD-036 Decision 2 / 4 (P2)。AD-041 (g)。AD-037 (IME のガードはライブラリ側)。AD-043 Decision 6 (agents の記録の出力 0)。AD-045 Decision 2 (文言の表)。AD-031 (in-place 訂正の規則)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲 (main の述語は domain の関数への委譲であることだけ D の観点で確認した)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲 (lint / depcruise / check:constitution は code-gate で 0 違反)
- G. optional reviewer 範囲: 該当なし: architecture-reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

本 PR は session の境界を広げる。AD-052 で `AskUserQuestion` の許可に限って `updatedInput` を返す (domain の `toAskUserQuestionResult` / `projectAskUserQuestionAnswer`)。AD-053 で `onElicitation` を `QUERY_OPTION_KEYS` に足し (9)、`SessionEvent` の `elicitation-request` (9)、`SessionControl` の `respond-elicitation`、IPC の `respondElicitation` を足す。renderer 側は承認カードの答える部品・問いのカード・composer のコマンドの候補・「編集して再試行」を足す。記録 (glossary・2 つの charter・`_overview`・roadmap・ui-coverage・005 の pointer) と、項目 16 の `updatedInput` / `updatedPermissions` の backstop も含む。

D の照合結果。
- 守られている (確認済み): 経路は一方向の port と、main が検証する IPC のまま (AD-036 Decision 2)。`Query` のメソッドは `interrupt` だけ。`onUserDialog` / `supportedDialogKinds` は src の非テストのコードに 0 件。URL は `target="_blank"` の経路で開く (AD-053 Decision 5)。検証の述語は domain に 1 つで、main の `validate.ts` は委譲するだけ。agents の新しいコードに `console` / logger は 0 件 (AD-043 Decision 6)。他の accepted ADR を in-place で書き換えた跡は無い (diff の `docs/decisions/` は新規の 0052 / 0053 の 2 ファイルだけ)
- drift: accepted ADR の Decision の字面と食い違う実装が 2 箇所ある (H-001 / M-001)
- C の drift: FR-017 が名指した charter の追随が一部抜けている (H-002)

## Findings

### [High] AD-053 Decision 3 は「中断 (`signal`) で renderer の保持を捨てる」と決めたが、実装と spec U-10 は SDK 側の中断でカードと入力を残す (H-001) (scope: feature)

- **観察**:
  - `docs/decisions/0053-elicitation-callback-and-user-dialog.md:40` (accepted 2026-10-17) は「応答した時点・**中断 (`signal`)**・セッションの終了で **renderer と agents の保持を捨てる**」と書く
  - 実装は agents 側だけを捨てる。`src/agents/session-core.ts` の `createOnElicitation` は abort で `registry.drop` してから `cancel` を返し、`onAborted` は `resumeIfIdle` だけを呼ぶ (diff 5159-5171)。renderer への通知は無い
  - renderer の `running-session-store.ts` は、`state` が `interrupted` / `error` / `done` になったとき、または応答・failure・kill・close のときにしか `elicitations` を外さない (`specs/018-.../data-model.md:193-194`)
  - したがってターンが続いたまま SDK 側で中断された問いは、カードが残る。利用者はそこに入力でき、その値は component の state に残り、押すと IPC と main を通って agents に届いてから捨てられる
  - spec はこれを U-10 (`spec.md:97`) と FR-009 の後段 (`spec.md:229`) で「既知の限界」と決めている。ただし U-10 は design-gate R2 で足されたもので、architecture の design-gate (`architecture-reviewer.design-gate.md:19`) は ADR が proposed の段階で見ており、Decision 3 とは照合していない
- **同種事象探索**: 次の 3 つのクエリで探した。
  - `中断 \(\`signal\`\)` を docs/decisions と specs/018 で: 3 件 (`0053:40`・`spec.md:229`・`data-model.md:182`)
  - AD-053 の `renderer と agents の保持を捨てる`: 1 件 (`0053:40`)
  - SDK の中断を renderer に知らせる経路: 0 件 (`onAborted` の呼び出し先は `resumeIfIdle` だけ。`sdk-agent-session.ts:514-522`)
- **リスク/影響**: accepted ADR の Decision の字面と実装の振る舞いが食い違っている。次に `request_user_dialog` を足すなど AD-053 を読み替える feature は、Decision 3 を「renderer も signal で捨てる」と読み、今の実装を違反と取るか、U-10 を ADR の外の例外として探し直すことになる。Decision 3 の趣旨は「入力を持ち続けない」なので、SDK が待つのをやめた問いに入力させ続ける今の振る舞いは、趣旨の側から見ても後退である
- **推奨アクション**: どちらか 1 つを選ぶ (作り変えない最小案は (a))。
  - (a) U-10 を AD-053 の決定の側に入れる。Decision 3 の文言を in-place で変えるのは AD-031 で禁じられているので、「Decision 3 の『中断 (`signal`)』は agents の保持にだけ当たる。renderer は SDK 側の中断を知らない (U-10)」を記録する短い後続 ADR を起こす (読み替えの表 1 行と Consequences の既知の限界だけで足りる)。spec FR-009 / data-model §4 の U-10 の行からその ADR を参照する
  - (b) ADR のとおり renderer も捨てる。U-10 で退けた案 (`state` が `awaiting_permission` を出たら外す、または既存のイベントに cancel を載せる) を採ることになり、`SESSION_EVENT_KINDS` の契約の議論が要る
- **根拠**: AD-053 Decision 3。AD-031 (決定の変更は訂正節ではなく後続 ADR)。Constitution「改定手順」1
- **scope 根拠**: touched files (`docs/decisions/0053-*.md` は本 PR の新規ファイル・`session-core.ts`・`running-session-store.ts`) の中で直せる

### [High] FR-017 / SH-010 が名指した session charter の Related ADRs と ui charter の related_specs に AD-052 / AD-053 / 018 が無い (H-002) (scope: feature)

- **観察**:
  - spec FR-017 (`spec.md:243`) は「session charter (Related Specs・**Related ADRs に AD-052 / AD-053**・…)」を求める。tasks SH-010 (`tasks.md:87-88`) は `[x]` で、「Related ADRs に AD-052 / AD-053」と「ui charter の frontmatter の `related_specs` に 018」を挙げている
  - AD-052 Consequences (`0052:50`) と AD-053 Consequences (`0053:48`) も「session charter に記録する」と決めている
  - 実際の状態は次のとおり。
    - `docs/domains/session/charter.md:227-240` (Related ADRs) は AD-051 で終わる。AD-052 / AD-053 が無い
    - 同じファイルの frontmatter の `related_adrs` (`:7-19`) と `related_specs` (`:20-31`) にも 0052 / 0053 / 018 が無い。本文に出てくるのは Related Specs の O-10 の項 (`:307-316`) だけ
    - `docs/domains/ui/charter.md:22-32` の `related_specs` に `specs/018-...` が無い (`related_adrs` の 0052 / 0053 は足してある。`:20-21`)
- **同種事象探索**: 次の 2 つのクエリで探した。
  - `0052|0053|AD-052|AD-053|018-session` を session charter で: 2 件 (`:307`・`:310`。どちらも Related Specs)
  - `018-session` を ui charter で: 0 件
- **リスク/影響**: charter の Related ADRs は、reviewer と後続の design が境界の ADR を引く入口である (AGENTS.md の References)。session の契約 (`SessionEvent` 9 種・`SessionControl`・`PermissionDecision.answers`) を広げた 2 つの ADR がこの入口から引けない。spec の要件 (FR-017) と、完了にしたタスク (SH-010) が満たされていない
- **推奨アクション**:
  - `docs/domains/session/charter.md` の Related ADRs (`:240` の後) に AD-052 / AD-053 を 1 行ずつ足す (「O-10。session の契約の拡張」の形で、AD-047 / AD-049 / AD-051 の行に揃える)
  - 同じファイルの frontmatter の `related_adrs` に 0052 / 0053、`related_specs` に 018 を足す
  - `docs/domains/ui/charter.md` の frontmatter の `related_specs` に `specs/018-session-answer-ui-and-composer-commands/spec.md` を足す
- **根拠**: spec FR-017。AD-052 / AD-053 Consequences。Constitution Principle XIV
- **scope 根拠**: touched files (2 つの charter) の中で直せる

### [Medium] AD-052 Decision 1 は「回答の無い許可は今の `toPermissionResult` のまま」としたが、実装は拒否に替える (M-001) (scope: feature)

- **観察**:
  - `docs/decisions/0052-ask-user-question-answer-projection.md:36` は「拒否・**回答の無い許可**・他の tool の出力は今の `toPermissionResult` のまま」と書く。字面どおりなら `{behavior: 'allow'}` になる
  - `src/domain/session/agent-session.ts:379-381` は `answers === undefined` の許可を `outcome: 'deny', message: '回答がありません'` に替える。正本は `data-model.md:59`、pin は `src/domain/session/agent-session.test.ts:179`
- **同種事象探索**: `回答がありません` を src で検索して 1 件 (`agent-session.ts:380`)。ADR の `回答の無い許可` は 1 件 (`0052:36`)
- **リスク/影響**: 安全側への逸脱で、実害は無い。今の renderer の答える部品は `answers` 付きの許可しか送らない (`ApprovalCard.tsx:75-78`)。ただ ADR の字面と data-model・テストの振る舞いが逆なので、読み替えるときに誤読の元になる
- **推奨アクション**: H-001 で後続 ADR を起こすなら、同じ ADR に「回答の無い `AskUserQuestion` の許可は拒否にする (data-model §1)」を 1 行入れる。起こさないなら、data-model §1 の該当行に「AD-052 Decision 1 の字面 (許可のまま) より狭めた。理由: US-1 AC3」と注記する
- **根拠**: AD-052 Decision 1
- **scope 根拠**: touched files の中で直せる

### [Medium] 2 つの ADR drift を検出する仕組みが無く、テストが ADR の字面と逆の振る舞いを固定している (M-002) (scope: feature)

- **観察**:
  - H-001 の「SDK 側の中断の後にカードが残る」は、`session-core.elicitation.test.ts` の「`settle` が false を返す」テストが既知の限界として固定している。ADR Decision 3 との照合はどのテストにも無い
  - M-001 も同じ形で、`agent-session.test.ts:179` が拒否の振る舞いを pin している
- **同種事象探索**: 該当なし (テストと ADR の字面の照合は機械化されていない)
- **リスク/影響**: テストは通るが、ADR を正本として読む人には逸脱が見えない。既存の振る舞いが壊れていないと言える根拠は次の 3 つで、これらは十分にある。
  - 承認の経路の回帰: 他の tool の出力キー ⊆ `{behavior, message}` の pin
  - `QUERY_OPTION_KEYS` / `SESSION_EVENT_KINDS` / IPC のチャネルの集合の固定テスト
  - 項目 16 の `sdk-updated-input` の fixture
- **推奨アクション**: H-001 / M-001 で記録を直すときに、該当するテストの `it` の名前か注記コメントから、記録先 (後続 ADR または data-model の注記) を参照させる
- **根拠**: AD-052 / AD-053 Confirmation
- **scope 根拠**: touched files のテストの中で直せる

### [Low] `agent-session.ts` の P2 の doc comment が AD-052 の前の字面のまま (L-001) (scope: feature)

- **観察**: 古い文言が 2 箇所に残っている。
  - `src/domain/session/agent-session.ts:278-282`: 「`updatedInput` を**型として持たない**」
  - 同じファイルの `:289-292`: 「`PermissionDecision → PermissionResultLike` の**唯一の**写像」「`canUseTool` の全 return はこの関数を通し」
  - 同じファイルの `:300-307` には `AskUserQuestionResult.updatedInput` と `CanUseToolResult` があり、`session-core.ts` の doc はすでに「`toPermissionResult` か `toAskUserQuestionResult`」に直してある (diff 5009-5011)
- **同種事象探索**: `唯一の写像|全 return はこの関数` を src で検索して 1 件 (`agent-session.ts:289-292`)
- **リスク/影響**: P2 の境界の説明が、型の実体と食い違っている
- **推奨アクション**: 2 つのコメントを「`AskUserQuestion` の許可だけは `toAskUserQuestionResult` (AD-052)」に揃える
- **根拠**: AD-052 Consequences (「P2 の『型として updatedInput を持たない』は … に弱まる」)
- **scope 根拠**: touched file

### [Low] glossary の新しい 2 語が Q の節に入り、`total_terms` が実数と合わない (L-002) (scope: feature)

- **観察**:
  - `docs/glossary.md:753` (Elicitation card) と `:762` (Slash command candidates) が `### Q` の節 (`:737`) の中にある。アルファベット順なら E と S に置く
  - `:5` の `total_terms: 104` は、`#### **` の見出しの実数 (111) と合わない。この差は本 PR の前からあり、本 PR で 2 つ増えた
- **同種事象探索**: `#### \*\*(Elicitation card|Slash command candidates)` で 2 件
- **リスク/影響**: 用語の引きにくさが増す。正しさへの影響は無い
- **推奨アクション**: 2 語を E / S の節に移す。`total_terms` を実数に直す
- **根拠**: Constitution Principle XIV
- **scope 根拠**: touched file

### [Low] 005 data-model の pointer が `updatedInput` の根拠に AD-053 も挙げている (L-003) (scope: feature)

- **観察**: `specs/005-session-launch-and-streaming/data-model.md` の追記 (diff 563-565) は、「`AskUserQuestion` の許可だけ `updatedInput` …」の根拠に AD-052 と AD-053 を並べている。`updatedInput` を決めたのは AD-052 だけで、AD-053 は `onElicitation` の ADR である
- **同種事象探索**: 005 の 2 ファイルの追記で 2 件。contracts の方 (diff 548-551) は 2 つの ADR を正しく分けて書いている
- **推奨アクション**: data-model の pointer を contracts と同じ書き分けにする
- **根拠**: AD-052 / AD-053
- **scope 根拠**: touched file

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `中断 \(\`signal\`\)` (docs/decisions・specs/018) | 3 | docs/decisions/0053-elicitation-callback-and-user-dialog.md:40 / specs/018-.../spec.md:229 / specs/018-.../data-model.md:182 |
| H-001 | SDK の中断を renderer に知らせる経路 (`onAborted` の呼び出し先) | 0 | src/agents/sdk-agent-session.ts:514-522 (`resumeIfIdle` だけ) |
| H-002 | `0052\|0053\|AD-052\|AD-053\|018-session` (session charter) | 2 | docs/domains/session/charter.md:307 / :310 (Related ADRs と frontmatter には 0 件) |
| H-002 | `018-session` (ui charter) | 0 | docs/domains/ui/charter.md:22-32 |
| M-001 | `回答がありません` (src) | 1 | src/domain/session/agent-session.ts:380 |
| L-001 | `唯一の写像\|全 return はこの関数` (src) | 1 | src/domain/session/agent-session.ts:289-292 |
| L-002 | `#### \*\*(Elicitation card\|Slash command candidates)` | 2 | docs/glossary.md:753 / :762 |

## Verdict

- Critical: 0
- High: 2
- Medium: 2
- Low: 3
