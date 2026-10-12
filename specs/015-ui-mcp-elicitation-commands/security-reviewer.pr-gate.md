# security-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11
**Reviewer**: security-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001 (MCP の見出し、過去ログの tool 名の無害化)、FR-002 (URI の要約)、FR-003 (`Object.hasOwn` を使う 2 段の振り分け)、FR-004 / FR-005 (承認カード、AskUserQuestion は読み取り専用)、FR-006 (結果は平文)、FR-007 / FR-008 (未信頼の構成を `meter` で運ぶ)、FR-010 (`output` / `error` の文字列を通さない)、FR-011 (P3 / `keyof Query`)、SC-001 / SC-002 / SC-005
- touched files に該当する charter / Confirmation: ui charter、AD-048 Decision 2 / 3 / 5、AD-036 Decision 4、AD-047 Decision 2、AD-035 Decision 1
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

scope (`.pr-gate-scope.txt`、79 files) は Round 1 から変わっていない。diff は今回も `src/main`、`src/preload`、`package.json`、lockfile に触れていない (`^diff --git a/(package|pnpm|src/main|src/preload|electron)` で 0 件)。そのため SEC-2 / 3 / 4 / 5 / 7 / 8 に新しい経路は無い。diff の実装コードに `dangerouslySetInnerHTML` / `innerHTML` / `openExternal` / `window.open` / `eval(` / `new Function` / `href=` の新しい使用は無い。ヒットしたのは spec 文書とテストの `not.toContain(LEAK)` だけ。

Round 1 以降でセキュリティに関わる変更は 1 件だけ見つけた。MD-01 への対応で、開いた行が無いまま届いた `auth_status` の失敗と `plugin_install` の結果を、新しい経路で行にするようになった (`src/agents/live-signals.ts:456-460`、`:489-505`)。この経路を確かめた結果は次のとおり。
- 読むのは `error` の有無だけで、その文字列は運ばない。`detail` は `''` (`:458`)
- プラグインの名前は、今回も `isReportName` の検査を通る (`:490`)
- 文字列が漏れないことはテストで確かめられている (`src/agents/live-signals.test.ts:1649-1660`。`MARK` を含む `error` を渡し、`not.toContain(MARK)` を確認する)

FR-010 / U-4 に退行は無い。`session-init-report.ts:15-18` の許可リストも同じまま残っている (`cwd` / `apiKeySource` / `betas` / `capabilities` を読まない)。

Round 1 の 4 件 (LW-13 から LW-16) は、どれもコードに手が入っていない。

## Findings

### [Low] AskUserQuestion の入力にある `answers` を、出所を確かめないまま「選ばれた回答」として強調する。実行中の経路でも同じ (L-001) (scope: feature) [unresolved from Round 1: L-001 / LW-13]

- **観察**: `src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx:109-115` は、入力の `answers` を過去ログか実行中かを区別せずに `Map` に入れる。`:186-194` と `:206-212` で、それを `ASK_USER_QUESTION_LABELS.selectedAnswer` (「選ばれた回答」、`src/renderer/src/features/chat/labels.ts:216`) として強調する。data-model.md:44 は強調を「(過去ログ)」に限っているが、実装は区別しない。Round 1 から変更は無い。
- **同種事象探索**: `answers` で実装 1 件 (ask-user-question.aui.tsx:110)。テスト側は ask-user-question.aui.test.tsx:106, :133, :140, :148, :172 で、すべて過去ログの fixture
- **リスク/影響**: モデル (プロンプトインジェクションを受けたものを含む) が、利用者の選んでいない選択肢を「選ばれた回答」と見せられる (CWE-451)。権限の判断には使われない表示なので Low
- **推奨アクション**: 実行中 (`result === undefined` または status が running) は強調しない。あるいは文言を「入力に含まれる回答」に変える
- **根拠**: CWE-451、data-model §1
- **scope 根拠**: touched file `ask-user-question.aui.tsx`

### [Low] URI の要約で、host の秘密の検査が「英数字 20 文字以上の連続」と `mayCarrySecret` だけで、文字種の allowlist が無い (L-002) (scope: feature) [unresolved from Round 1: L-002 / LW-14]

- **観察**: `src/renderer/src/features/chat/mcp-tool-name.ts:174-176` の `isPresentableHost` は、今回も長さ、`LONG_ALNUM_RUN` (`:170`)、`mayCarrySecret` だけを見る。WHATWG URL は特殊でない scheme の host を不透明な文字列として扱い、`%` を含んでも通す。そのため、`-` / `_` で区切った token や `%` で符号化した token は host としてそのまま見出しに出る (`:201-202`)。最後のパスの要素は `FILE_NAME_SHAPE` (`:172`) で `%` を落とすが、`-` / `_` で区切った token は通す。
- **同種事象探索**: `LONG_ALNUM_RUN` で 3 件 (mcp-tool-name.ts:170, :175, :179)
- **リスク/影響**: URI の authority に置かれた資格情報が transcript の見出しに出うる (CWE-200)。画面に出るだけなので Low
- **推奨アクション**: host に `^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$` の allowlist を足す。`[A-Za-z0-9_-]{32,}` の連続も落とす
- **根拠**: research R-07、spec Q3 (a)、CWE-200
- **scope 根拠**: touched file `mcp-tool-name.ts`

### [Low] スラッシュコマンドの説明を、出所が `init-report` に替わった後も古い `commands` から名前で引く (L-003) (scope: feature) [unresolved from Round 1: L-003 / LW-15]

- **観察**: `src/renderer/src/features/session/running-session-store.ts:199`, `:203`, `:215-229` に変更は無い。名前の集合は `slashCommandSource` の出所から取るが、説明は最新の `commands` から名前で引く。
- **同種事象探索**: `slashCommandSource` で 5 件 (running-session-store.ts:199, :203, :215, :227, :229)
- **リスク/影響**: 出所の違う同名のコマンドに古い説明が付く (CWE-451)。無害化した平文を表示するだけなので Low
- **推奨アクション**: 出所が替わったら、次の `commands` が届くまで説明を出さない。この方針を採らないなら、残るリスクとして data-model §2 に記録する
- **根拠**: CWE-451
- **scope 根拠**: touched file `running-session-store.ts`

### [Low] H: L-001 と L-002 を検出する負例テストが無い (L-004) (scope: feature) [unresolved from Round 1: L-004 / LW-16]

- **観察**: `ask-user-question.aui.test.tsx` の `answers` の fixture は 5 件とも過去ログの形で、実行中の状態で `answers` を持つ負例が無い。`mcp-tool-name.test.ts` の host の負例は、今回も英数字の長い連続と `mayCarrySecret` の形だけ。
  一方、今回の MD-01 対応 (開いた行が無いまま届く auth の失敗) は、漏れないことまでテストされている (`live-signals.test.ts:1636-1660`)。新しい経路が既存の FR-010 を壊していない根拠になる。
- **同種事象探索**: `answers` を含む test fixture 5 件 (ask-user-question.aui.test.tsx:106, :133, :140, :148, :172)。どれも実行中の負例ではない
- **推奨アクション**: L-001 と L-002 の負例を足す
- **scope 根拠**: touched files のテスト

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `answers` | 1 (実装) | src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.tsx:110 |
| L-002 | `LONG_ALNUM_RUN` | 3 | src/renderer/src/features/chat/mcp-tool-name.ts:170, :175, :179 |
| L-003 | `slashCommandSource` | 5 | src/renderer/src/features/session/running-session-store.ts:199, :203, :215, :227, :229 |
| L-004 | test の `answers` | 5 | src/renderer/src/components/assistant-ui/elements/ask-user-question.aui.test.tsx:106, :133, :140, :148, :172 |
| (scope 確認) | `^diff --git a/(package\|pnpm\|src/main\|src/preload\|electron)` | 0 | - |
| (SEC-6 確認) | `dangerouslySetInnerHTML\|innerHTML\|openExternal\|window\.open\|eval\(\|new Function\|href=` | 0 (実装。spec 文書とテストの `not.toContain` を除く) | - |
| (MD-01 経路の FR-010 確認) | `output\|error` in live-signals.ts | 文字列を読む箇所 0 (`:455` は有無だけ) | src/agents/live-signals.ts:455-460 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
- Round inheritance: resolved from 1: 0 / unresolved: 4 (L-001 = LW-13、L-002 = LW-14、L-003 = LW-15、L-004 = LW-16) / new: 0
