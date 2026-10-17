# convention-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18
**Reviewer**: convention-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Gate**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC: FR-012 / FR-013 (labels 表に集約)、FR-005 / FR-006 / FR-008 (`elicitation.ts` 新設)、FR-001 / FR-003 (`agent-session.ts`)、FR-016 / FR-017 (`reviewers.yml`)、SC-009 / SC-010 (lint / depcruise)
- touched files に該当する charter / Confirmation: session charter (domain は SDK を import しない / agents は Electron を import しない — depcruise exit 0)、ui charter (composer 部品は `features/chat`)、AD-045 (labels 表)、AD-037 (自前 keydown ガードなし)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:3
- G. optional reviewer 範囲: 該当なし: convention-reviewer の範囲外
- H. テスト / coverage / observability / regression: High:0 Medium:1 Low:0 (M-001 の重複定数の同値を固定するテストが無い)

## スコープ要約

lint-agent の JSON 受領済み。6 コマンドすべて exit_code 0 で exit_code 起因の Critical は 0 件。warning 9,920 件はすべて `prettier/prettier` で、9,891 件は CRLF の `Delete ␍`、実質 28 件。`__rulecheck__` の no-orphans は `.gitignore:71` で除外済み。plan の識別子名と実装は一致。新規 export で呼び元なしは `SUPPORTED_DIALOG_KINDS` (FR-005 の pin 用、意図どおり)。`console` / `eslint-disable` / `as any` / TODO は新規本番コードに 0 件。

## Findings

### [Medium] 同じ定数とヘルパーが domain の 2 ファイルに複製され、同値を固定するテストが無い (M-001) (scope: feature)
- **観察**: `elicitation.ts:18` の `ANSWER_MAX_CODE_POINTS = 1000` は `agent-session.ts:314` の複製。`codePointLength` (elicitation.ts:113 / agent-session.ts:316)、`isPlainRecord` (:117 / :320) も重複
- **同種事象探索**: `ANSWER_MAX_CODE_POINTS` 2 定義、`codePointLength|isPlainRecord` 各 2 件
- **リスク/影響**: spec U-9 の「同じ述語を使う」が静かに割れうる
- **推奨アクション**: 共通の小モジュールに 1 つだけ置くか、`agent-session.ts` が `elicitation.ts` から import する (循環にならない)。または同値 pin テスト
- **根拠**: CONV-3 / CONV-5 / spec U-9

### [Medium] 500 行を超えたモジュールが 3 つ (M-002) (scope: feature)
- **観察**: `session-core.ts` 430→614、`elicitation.ts` 新規 542、`LivePane.tsx` 501→567。既存超過も伸長 (`thread.aui.tsx` 1524, `running-session-store.ts` 852, `live-signals.ts` 857, `sdk-agent-session.ts` 782)
- **同種事象探索**: 500 行超 12 ファイル、本 diff で新たに超過 3 件
- **推奨アクション**: `createElicitationRegistry` / `createOnElicitation` の切り出し等。AD-050 によりマイルストーン末の棚卸しでよい
- **根拠**: CONV-3

### [Medium] 実質の prettier 違反 28 件が CRLF の 9,891 件に埋もれている (M-003) (scope: feature)
- **観察**: elicitation.ts:278,345 / elicitation.test.ts (8) / ElicitationCard.tsx:162,193,203,227 / ElicitationCard.test.tsx (4) / session-core.elicitation.test.ts:226 / LivePane.tsx:289 / LivePane.o2.test.tsx:1094 / running-session-store.ts:704 / session-event-decoder.test.ts (4) / useLiveSession.ts:39 / elicitation-through.test.tsx:85。CRLF 22 ファイルは index が `i/lf`、`eol=lf` でコミット時に正規化
- **同種事象探索**: CRLF 以外の `prettier/prettier` 28 件
- **推奨アクション**: 対象ファイルに `prettier --write`
- **根拠**: CONV-1 (warning は Medium)

### [Low] `agent-session.ts:277-282` の旧設計コメントが AD-052 の現状と矛盾 (L-001) (scope: feature)
- **観察**: 「`updatedInput` を型として持たない」と書くが `:300-304` の `AskUserQuestionResult` は持つ。`:288-292` の「全 return はこの関数を通す」も同様
- **同種事象探索**: `updatedInput` in src/domain で旧コメント 1 件
- **推奨アクション**: 注記を AD-052 に合わせる
- **根拠**: CONV-6

### [Low] `composer-extensions.tsx` が kebab-case で React component を export (L-002) (scope: feature)
- **観察**: `features/chat` の component .tsx は PascalCase。`ask-user-question-args.ts` / `composer-extensions-context.ts` は plan の Project Structure に無い
- **同種事象探索**: kebab-case の非テスト .tsx 1 件
- **推奨アクション**: リネームか plan への追記
- **根拠**: CONV-2 / CONV-6

### [Low] `.vitest/` が未追跡かつ未 ignore (L-003) (scope: system)
- **観察**: `.vitest/json/output.json`。`.gitignore` に記載 0 件
- **推奨アクション**: `.gitignore` に `.vitest/` を足す
- **根拠**: CONV-3

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `ANSWER_MAX_CODE_POINTS` | 2 | agent-session.ts:314 / elicitation.ts:18 |
| M-002 | 行数 count | 3 | session-core.ts / elicitation.ts / LivePane.tsx |
| M-003 | prettier (CRLF 以外) | 28 | 上記 |
| L-001 | `updatedInput` (domain) | 1 | agent-session.ts:279 |
| L-002 | kebab-case .tsx | 1 | composer-extensions.tsx |
| L-003 | `\.vitest` (.gitignore) | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
