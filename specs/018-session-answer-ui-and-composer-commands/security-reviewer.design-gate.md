# security-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-17T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (AskUserQuestion の射影と main の検証)、FR-005〜FR-011 (Elicitation の要求と応答、URL、保持しないこと)、FR-012 (コマンドの候補を平文で出す)、FR-015、SC-002 / SC-003 / SC-004 / SC-010
- 該当する charter / Confirmation: AD-052 Confirmation (SC-001/002、項目 16 の backstop)、AD-053 Confirmation (SC-003/004/010、Decision 5「URL を開く IPC を作らない」)、AD-036 Decision 2 (control plane は検証済みの IPC だけ)、Constitution Principle V (ログと永続化に出さない)、session charter (未信頼の文字列の区分)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:3 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 1 の High 2 件は両方とも解消した。

- **H-001 (URL への accept と空の form)**: mode ごとの規則に分けた。
  - main は `content` の省略と 0〜32 キーを許す (`data-model.md:137-139`、`contracts/session-answer-boundary.md:12,18-23`)
  - agents は registry の形で `accept` を分ける (`data-model.md:160-165`、C-5' `contracts/session-answer-boundary.md:72-81`)。開ける URL なら content を捨てて accept、`openUrl: null` と `fields: null` は decline
  - 正例と負例は BE-021 / BE-024 / FE-023 に入った (`tasks.md:46,52,59`)
- **H-002 (IPC の戻り値)**: 案 (b) を採った。戻り値は `Promise<void>` のまま (`contracts/session-answer-boundary.md:14`、`data-model.md:128`)。述語は domain に置き、renderer・main・agents が同じ関数を呼ぶ (U-9)。新しい handler は `ipc.ts` の `handle()` で登録すると明記された (`contracts/session-answer-boundary.md:15`、`tasks.md:51`)

Medium として残るものがある。

- スキーマの初期値と表示名の無害化 (M-001)
- 項目のキーの規則が agents の写しの側では揃っていない (M-002 の一部)
- renderer の decoder が URL の scheme を確かめ直さない (M-003)
- `openExternalIfHttp` に単体テストが無い (M-004)

既存の防御 (`window.ts:65-66` の `setWindowOpenHandler` から `openExternalIfHttp`、preload が個別のメソッドだけを公開すること) は Round 1 から変わっていない。

## Findings

### [Medium] Elicitation のスキーマの `default` (文字列) と表示名 (`enumNames` / `oneOf[].title`) に、無害化と長さの上限が定義されていない (M-001) (scope: feature) — unresolved from prev

- **観察**:
  - `data-model.md:115` は string の `default` を「(文字列)」とだけ書いている
  - `data-model.md:118` は列挙の表示名を「表示名」とだけ書き、変換を定めていない
  - 共通の `label` / `description` には `toOneLineText → redactSecrets` を通す (`:120`) が、この 2 つは対象外のまま
  - Grep `enumNames|default.*toOneLineText` (spec_dir) で、規則の記述は 0 件 (`data-model.md:118` の型の記述だけ)
- **リスク/影響**:
  - MCP サーバー (未信頼) から来る長さに上限の無い文字列が、入力欄の初期値と選択肢の名前になる。制御文字・bidi の上書き・秘密らしい値がそのまま DOM に入る
  - FE-020 の decoder は「§2 の型と上限」を確かめるが、§2 に上限が無いので確かめられない
  - H-002 が (b) で直ったので、セッションが固まる経路は消えた。1,000 コードポイントを超える初期値は renderer の事前検査で `invalid` になるだけである
- **推奨アクション**:
  - `default` (文字列) は `toOneLineText(raw, ANSWER_MAX_CODE_POINTS)` を通し、`maxLength` があればそれでも切る。伏せ字は掛けない
  - 表示名は `toOneLineText(…, 200) → redactSecrets` を通す
  - BE-020 のテストに、長すぎる `default` と制御文字を含む表示名を足す
- **根拠**: AD-036 Decision 2、OWASP ASVS V5.1
- **scope 根拠**: data-model §2

### [Medium] 項目のキーの規則が agents の写し (§2) と main の述語 (§3) で揃っていない。renderer の form の値の組み立て方も決まっていない (M-002) (scope: feature) — partially resolved from prev

- **観察**:
  - main の `isElicitationContent` は `__proto__` / `constructor` / `prototype` を外すようになり、テストも決まった (`data-model.md:137`、`tasks.md:44,52`)。ここは解消した
  - 一方 §2 の写しの規則 (`data-model.md:120`) は `^[A-Za-z0-9_.-]{1,64}$` のままで、この 3 つの名前を部分集合の内に入れる
  - BE-020 のテスト「`__proto__` / `constructor` の項目名」(`tasks.md:44`) は `toElicitationPrompt` の期待値 (`fields: null` か、写すか) を書いていない
  - renderer が `content` を組み立てる規則 (`data-model.md:141-150`) に、`Object.fromEntries` か原型を持たないオブジェクトを使うという記述が無い
- **リスク/影響**:
  - 項目名が `constructor` の form は描かれるが、送るたびに renderer の事前検査で `invalid` になる。必須の項目なら、何を入れても答えられない
  - renderer の state を `obj[key] = v` で組むと、`__proto__` のキーで値が消える
  - グローバルな原型の汚染には至らない
- **推奨アクション**:
  - §2 の項目の `key` にも「`__proto__` / `constructor` / `prototype` は部分集合の外 (`fields: null`)」を足し、§3 の述語と同じ規則にする。BE-020 の期待値は「`fields: null`」にする
  - §3「form の値の組み立て」に「`Object.fromEntries` で組む」を 1 行足す
- **根拠**: CWE-1321
- **scope 根拠**: data-model §2 / §3

### [Medium] renderer の decoder が `elicitation-request` の `openUrl` の scheme を確かめ直すと書かれていない (M-003) (scope: feature) — unresolved from prev

- **観察**:
  - FE-020 (`tasks.md:53`) と contracts C-2' (`contracts/session-answer-boundary.md:50`) の decoder の検査は「型と上限」だけである
  - FE-021 (`tasks.md:55`) は `<a href={openUrl} target="_blank">` で描く
  - Grep `safe-url` (spec_dir) は 0 件だった。renderer にあるリンクの第一の防御 (`src/renderer/src/lib/safe-url.ts`、`window.ts:24-30` の注記) を、この経路は通らない
- **リスク/影響**: 守りは agents の http(s) の検査と main の `openExternalIfHttp` の 2 層だけになる。多層防御の提案なので Medium とする
- **推奨アクション**:
  - FE-020 の decoder で `openUrl` に `safe-url.ts` の述語を掛け、外れたら `openUrl: null` にする
  - `javascript:` / `file:` の負例をテストに足す
- **根拠**: CWE-749
- **scope 根拠**: FE-020 / contracts C-2'

### [Medium] (H) 新しいリンクの経路が頼る `setWindowOpenHandler` → `openExternalIfHttp` に単体テストが無い。タスクは条件つきのまま (M-004) (scope: feature) — unresolved from prev

- **観察**:
  - `openExternalIfHttp` は `src/main/app/window.ts:31` にある export されていない関数で、呼び出しは `:66` (`setWindowOpenHandler`) と `:80` である
  - `navigation-policy.ts` が export するのは `decideNavigation` だけ (`:17`)
  - FE-021 (`tasks.md:56`) と RK-08 (`plan.md:222`) は「確かめ、無ければ足す」の条件つきのままである。しかも renderer のタスクが main のファイルを触る
- **リスク/影響**: MCP サーバーが決める URL を OS に渡す経路の最終の防御が、テストで固定されていない
- **推奨アクション**:
  - BE-024 か独立した BE タスクで、判定の純関数を `navigation-policy.ts` に移して export する
  - `file:` / `javascript:` / `smb:` / カスタム scheme / 解釈できない URL を OS に渡さないこと、http(s) は渡すことを単体テストで固定する
  - 「無ければ足す」を確定のタスクにする
- **根拠**: AD-053 Decision 5
- **scope 根拠**: 本 feature で新しくこの経路を使う

### [Low] URL の伏せ字が、OAuth の `code` などクエリの秘密を覆わない (L-001) (scope: system) — unresolved from prev

- **観察**:
  - `src/domain/session/secret-redaction.ts:113-116` が伏せるクエリの名前に、`code` / `otp` は入っていない
  - 開く URL (`href`) を伏せないことは spec で受け入れ済みである
- **推奨アクション**: 棚卸しで扱う。正本は O-6 の `redactSecrets`

### [Low] form の文字列の入力欄に `spellCheck={false}` / `autoComplete="off"` の指定が無い (L-002) (scope: feature) — unresolved from prev

- **観察**: Grep `spellCheck|autoComplete` (spec_dir) は 0 件だった。RK-10 は `type="password"` を使わないと決めている
- **推奨アクション**: FE-021 の文字列の入力欄に、この 2 つの属性を付ける
- **根拠**: Principle V

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `enumNames\|default.*toOneLineText` (spec_dir) | 1 (型の記述だけ。規則は 0 件) | data-model.md:118 |
| M-002 | `__proto__` (spec_dir) | 7 | data-model.md:52, :77, :137, contracts/session-answer-boundary.md:22, tasks.md:25, :44, :52 (§2 の `:120` には無い) |
| M-003 | `safe-url` (spec_dir) | 0 | — |
| M-004 | `openExternalIfHttp\|setWindowOpenHandler\|export function` (src/main/app の window.ts と navigation-policy*.ts) | 4 | window.ts:31, :65-66, :80, navigation-policy.ts:17 |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 2
- Round inheritance: resolved from 1: 2 (H-001, H-002) / unresolved: 6 (M-001, M-002 (一部は解消), M-003, M-004, L-001, L-002) / new: 0
