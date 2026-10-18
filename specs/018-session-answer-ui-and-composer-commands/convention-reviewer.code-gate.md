# convention-reviewer Review: O-10 Claude Code からの問いに答える UI と composer のコマンドの候補 (018)

**Run**: 2026-10-18
**Reviewer**: convention-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: code-gate iter 2

## 初回読了 viewpoint

- FR/SC: この diff が触るのは次の 4 件。Elicitation カードの項目ごとの理由 (data-model §3, U-6(e)/U-9)、AskUserQuestion の「未回答」の印、composer の候補が 0 件のときに popover を開かない matcher (SC-006 / US-3)、E2E の候補の正の対照 (SC-001 / SC-006)。
- touched files に該当する charter / Confirmation: session charter と ui charter (関連 ADR と spec の追記のみ)。AD-052 / AD-053 / AD-057 (proposed) は charter への追記が済んでいる。
- lint-agent JSON は受領した。exit_code は 0 で、5 コマンドとも 0 だった (eslint / tsc node / tsc web / depcruise / check:constitution)。非ゼロのコマンドは無いので、exit code 由来の Critical は 0 件。
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の owner 外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: convention-reviewer の owner 外
- C. 業務不変条件 / Charter drift: 該当なし: convention-reviewer の owner 外
- D. Constitution / ADR drift: 該当なし: convention-reviewer の owner 外 (check:constitution は 20 ok / 0 violations)
- E. User Story / SC / AC / UX: 該当なし: convention-reviewer の owner 外
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:4
- G. optional reviewer 範囲: 該当なし: convention-reviewer の owner 外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

H の内訳:
- F の指摘を検出する仕組みは lint (prettier/prettier) と depcruise。どちらも CI の lint で走る。
- `createSlashMatcher` は `LivePane.composer.test.tsx` の 0 件ケースと e2e/ime.spec.ts の正の対照で検証されている。
- `slashMatcher` は既存の `slash-commands.test.ts` が従来どおり検証している。
- 既存の振る舞いは壊れていない。`slashMatcher` の export と呼び出しは残っている (`createSlashMatcher` が内部で呼ぶ)。`slashFormatter` と `searchSlashCommands` も変更されていない。

## スコープ要約

touched files は 11 本で、docs 3 本、E2E 1 本、main の E2E stub 1 本、renderer 5 本、テスト 1 本。lint / typecheck / depcruise / constitution check はすべて exit 0 で、error は 0 件。warning は prettier/prettier の 712 件だけだった。構造面では、新規の module や配置の変更は無い。命名は既存の規則に従っている (`createSlashMatcher` は `createSlashCommandAdapter` と対、`unansweredMark` / `fieldRequired` / `fieldInvalid` は labels.ts の既存形)。dead code も無い。

## Findings

### [Medium] ElicitationCard.tsx で新しい `<div elicitation-body>` の中身が再インデントされていない (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/ElicitationCard.tsx:257` で `<div className="max-h-[50dvh] overflow-y-auto" data-slot="elicitation-body">` を足した。その内側の 258〜338 行は元のインデント (6 スペース) のままで、`</div>` は 339 行にある。prettier は内側を 8 スペースにするので、prettier/prettier に違反する。
- lint-agent JSON はこのファイルに prettier/prettier の warning を 80 件挙げ、メッセージは「Delete `␍`」だった。しかし `git ls-files --eol` では作業コピーは `w/lf` で CR は 0 件だった。80 件の実体は CRLF ではなく、上記のインデントと、既存の 100 桁超の行 (235, 247, 273) と考えられる。
- **同種事象探索**: `\r$` を `src` の touched files に Grep して 1 件 (e2e-capability.ts のみ)。ElicitationCard.tsx は CR 0 件。
- **リスク/影響**: prettier/prettier は warning 扱いのため gate は止まらない。ただし format を走らせると差分が一気に出る。
- **推奨アクション**: `node node_modules/prettier/bin/prettier.cjs --write src/renderer/src/features/session/ElicitationCard.tsx`。
- **根拠**: `.prettierrc.yaml` (printWidth: 100)、eslint.config.mjs の prettier 設定。
- **scope 根拠**: touched file の新規追加行が起点。

### [Low] src/main/app/e2e-capability.ts の作業コピーが CRLF (L-001) (scope: feature)

- **観察**: `git ls-files --eol` の結果は `i/lf w/crlf attr/text=auto eol=lf`。632 行すべてが CR 付きで、lint の warning 632 件はこれ。`.gitattributes` が `eol=lf` を固定しているため、コミットと CI の checkout では LF になる。
- **リスク/影響**: ローカルの lint の warning 件数が膨らむだけで、CI への影響は無い。
- **推奨アクション**: 任意。LF に戻す。
- **同種事象探索**: 他の touched src に CR は 0 件。

### [Low] 未追跡の `.vitest/` が .gitignore に無い (L-002) (scope: feature)

- **観察**: git status の `?? .vitest/`。`git check-ignore -v .vitest` もマッチしなかった。
- **リスク/影響**: `git add -A` でキャッシュの類が混入しうる。
- **推奨アクション**: `.gitignore` に `.vitest/` を足すか、コミット時に除外する。

### [Low] ADR 番号が 0053 から 0057 に飛んでいる (L-003) (scope: out-of-scope)

- **観察**: `docs/decisions/` は 0053 の次が 0057。`AD-054` 〜 `AD-056` の参照は 0 件。019 ブランチ側の予約番号の可能性がある。
- **推奨アクション**: 019 側の予約であれば対応不要。そうでなければ AD-057 に理由を 1 行足す。

### [Low] src/main/app/e2e-capability.ts が 500 行を超えている (L-004) (scope: feature)

- **観察**: 632 行 (CONV-3 の warning 閾値は 500 行)。今回の diff は +9 行で、元から超過していた。
- **推奨アクション**: 今回の対象外。分割は別の spec で扱う。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade summary の対象行は無い。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (M-001 参考) | `\r$` を touched src に | 1 | src/main/app/e2e-capability.ts |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 4
- 補足: 循環依存の検査は lint-agent の depcruise (exit 0) に依拠した。
