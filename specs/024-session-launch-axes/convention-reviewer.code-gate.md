# convention-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (024)

**Run**: 2026-10-30
**Reviewer**: convention-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1 (code-gate iter 1)

## 初回読了 viewpoint

- FR/SC: 本 diff が実装・影響する FR は FR-001〜FR-017。SC は SC-001〜SC-008 (SC-009 は実機で対象外)。このうち F が見るのは、新設 2 ファイルの命名と配置 (plan の Project Structure)、FR-015 の `LAUNCH_CONFIG_KEYS` / `isValidLaunchConfig` 周りの識別子、FR-016 / FR-017 の記録の置き場所。
- touched files に該当する charter / Confirmation:
  - `docs/domains/session/charter.md` の In scope (起動設定の解決・プリセット) の範囲内。
  - Constitution I / II / VII の配置規則 (domain / agents / main / renderer の分離) には depcruise と `check:constitution` が効く。両方 exit 0、違反 0。
  - 新設ファイルの命名は features/session の既存規約と一致する。PascalCase が component、kebab-case が純関数 (`LaunchDialog.tsx` と `resume-action.ts` の組と同じ)。
- lint-agent の JSON は受領済み。`exit_code` 0 (eslint / tsc ×2 / depcruise / check:constitution の 5 コマンドすべて 0)。error 0 件、warning 333 件。**exit_code 非ゼロ起因の Critical は無い。** JSON に無い違反は作っていない。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の Owner 範囲 (depcruise / check:constitution は exit 0 だったので F の入力としてのみ確認)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の Owner 範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:4
- G. optional reviewer 範囲: 該当なし: F の Owner 範囲外 (database / a11y / ux / ui-coverage の各 reviewer が担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

diff は spec 024 の 3 軸 (追加ディレクトリ / 上限 / セッション名) を domain / agents / main / renderer に通す変更。新設は renderer の `LaunchExtraAxes.tsx` と `launch-extra-axes.ts` の 2 ファイルだけで、plan の Structure Decision どおり。ファイル名と配置の規約違反は観察されなかった。lint / typecheck / depcruise / constitution は error 0。観察した F の問題は次の 4 点。

1. prettier の warning が実体のある整形違反として残っている。
2. 500 行超のファイルがさらに膨らんだ。
3. 実装済みの機能について「後で足す」旨の古いコメントが残っている。
4. 同一定数の重複と、作業ツリーの CRLF。

## Findings

### [Medium] prettier/prettier の整形違反が新規コードに約 90 件残っている (M-001) (scope: feature)

- **観察**: lint-agent JSON の `grouped_violations`。
  - `src/renderer/src/features/session/LaunchDialog.tsx` 48 件
  - `src/renderer/src/features/session/LaunchExtraAxes.tsx` 28 件
  - `src/main/app/launch-preparation.test.ts` 6 件
  - `src/renderer/src/features/session/LaunchDialog.test.tsx` 2 件
  - `src/renderer/src/features/session/LaunchDialog.resume.test.tsx` 2 件
  - `validate.test.ts` / `preset-record.test.ts` / `session-ipc.ts` / `labels.test.ts` / `running-session-types.ts` / `OverviewTab.tsx` 各 1 件
  - `launch-config.ts` の CRLF 以外の 1 件 (multi-line condition)
- **実コードで確認した箇所**:
  - `LaunchExtraAxes.tsx:4347-4375` (diff 行) は `{props.showSessionName !== false && (` の直下の `<div>` が 1 段浅く、JSX の括弧内インデントがずれている。
  - `LaunchDialog.tsx:4154-4199` (diff 行) は `<LaunchExtraAxes` の props が 4 空白余分に深い。
- **同種事象探索**: lint-agent JSON の `prettier/prettier` 12 グループ (CRLF 分を除く実質 約 90 件)。
- **リスク/影響**: `eslint.config.mjs` では `@electron-toolkit/eslint-config-prettier` の `prettier/prettier: 'warn'` が効いている (`node_modules/@electron-toolkit/eslint-config-prettier/index.js:10`)。そのため CI の `pnpm lint` は落ちないが、警告が積み上がり、他の warning が埋もれる。
- **推奨アクション**: `node node_modules/prettier/bin/prettier.cjs --write` を上記 11 ファイルに掛ける。意味は変わらない。
- **根拠**: CONV-1 (warning は Medium)。
- **scope 根拠**: touched files。

### [Medium] 500 行超のファイルがさらに膨らんだ (M-002) (scope: feature)

- **観察**: 現在の行数 (変更前は `2bba8f8~1` の行数)。
  - `src/renderer/src/features/session/LaunchDialog.tsx` 1101 行 (変更前 895 行、**+206 行**)
  - `src/agents/sdk-agent-session.ts` 1115 行 (変更前 1078 行、+37)
  - `src/agents/session-core.ts` 739 行 (変更前 671 行、+68)
  - `src/main/app/validate.ts` 534 行 (変更前 527 行、+7)
- **同種事象探索**: 本 diff が触れた非 test の `src` 4 ファイルが該当 (上記)。いずれも 024 の前から 500 行超。
- **リスク/影響**: CONV-3 の目安 (1 ファイル 500 行超は warning) を超えている。特に `LaunchDialog.tsx` は 024 だけで 2 割以上増えた。plan は軸の部品を `LaunchExtraAxes.tsx` に切り出して緩和したが、state・解釈・DTO の hook は `LaunchDialog` に残った。
- **推奨アクション**:
  - `useAdditionalDirectoryResolutions` (`LaunchDialog.tsx` diff 3974-4006) と `DirectoryEntry` を、`launch-extra-axes.ts` か別の hook ファイルに移す。
  - 上限・名前の入力 state 3 本と解釈を hook にまとめる。
  - ただし AD-050 により gate では直さない。マイルストーン末の棚卸しに回す。
- **根拠**: CONV-3。
- **scope 根拠**: touched files。

### [Low] 実装済みの機能に「後で足す」旨の古いコメントが残っている (L-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/LaunchExtraAxes.tsx:6` に「いまは追加ディレクトリだけ (上限と名前は US-2 / US-3)」とあるが、同ファイルは上限 2 欄と名前欄を既に描いている (diff 4307-4375)。
  - `src/renderer/src/features/session/launch-extra-axes.ts:2` に「入力の解釈は US-2 / US-3 で足す」とあるが、同ファイルは `parseMaxTurnsInput` / `parseMaxBudgetInput` / `parseSessionNameInput` を実装済み。
  - `src/renderer/src/features/session/LaunchDialog.tsx` の `EMPTY_DRAFT` のコメント (diff 3959) に「起動ダイアログの部品は US-1〜US-3 で足す」とあるが、実装済み。
- **同種事象探索**: Grep `US-2 / US-3|いまは追加ディレクトリだけ|は US-[0-9] で足す` を `src` に実行して 2 件 (上記の 2 ファイル)。`LaunchDialog.tsx` の 1 件は別の言い回しで、diff 内で確認。
- **リスク/影響**: CONV-6 の実装と文書の食い違い。読み手が未実装と誤解する。
- **推奨アクション**: 3 箇所のコメントを現状に合わせる。
- **根拠**: CONV-6。
- **scope 根拠**: touched files。

### [Low] 同一内容の定数の重複と、実質 1 箇所でしか使われない export (L-002) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/LaunchExtraAxes.tsx` に `selectClass` (diff 4266) と `inputClass` (diff 4301) がある。どちらも `'border-border bg-background rounded-md border px-2 py-1.5 text-sm'` で全く同じ文字列。
  - 同じ文字列の `selectClass` が `LaunchDialog.tsx` にもある (diff 4008)。
  - `AdditionalDirectoryItem` と `DirectoryChoiceFolder` は export されているが、定義ファイル内の使用しかない (Grep 件数 2 件ずつ)。
- **同種事象探索**: Grep `rounded-md border px-2 py-1.5 text-sm` で、`LaunchDialog.tsx` と `LaunchExtraAxes.tsx` (2 定義) を確認。
- **推奨アクション**: クラス定数を 1 つにして共有するか、`LaunchExtraAxes` の 2 つを 1 つにする。未使用 export は外す。
- **根拠**: CONV-3 / CONV-5。
- **scope 根拠**: touched files。

### [Low] `launch-config.ts` が作業ツリーで CRLF になっている (L-003) (scope: feature)

- **観察**:
  - lint-agent は `src/domain/session/launch-config.ts` に `prettier/prettier` を 244 件出した (243 件が CR)。
  - `git ls-files --eol` は `i/lf w/crlf attr/text=auto eol=lf`。作業ツリーだけ CRLF で、index と他の全ファイルは LF。
  - Grep `\r$` は 247 行すべてに一致。
  - `.gitattributes` が `* text=auto eol=lf` なので、コミットと CI の checkout では LF に正規化される (`git status` は clean)。
- **同種事象探索**: `git ls-files --eol -- src` で `i/lf w/lf` 以外のファイルは 1 件 (本ファイルのみ)。
- **リスク/影響**: 本機の lint だけが 243 件の warning を出す。CI では出ない。メモリの「CI red on main」の CRLF の件とは経路が違い、配信には届かない。
- **推奨アクション**: 作業ツリーを LF に直すだけでよい (prettier `--write`)。
- **根拠**: CONV-1。
- **scope 根拠**: 作業ツリーの状態であり、コミットされる内容ではない。

### [Low] `.vitest/` が untracked のまま `.gitignore` に無い (L-004) (scope: system)

- **観察**: gitStatus の `?? .vitest/`。`.gitignore` に `vitest` の記述は無い (Grep 0 件)。
- **リスク/影響**: `git add -A` でキャッシュを誤コミットする恐れがある。この diff の範囲外。
- **推奨アクション**: `.gitignore` に `.vitest/` を足す (別途)。
- **根拠**: CONV-3。
- **scope 根拠**: touched files の外。

### [Low] H: 整形・命名の規約を機械的に落とす仕組みが無い (L-005) (scope: system)

- **観察**: `prettier/prettier` が `warn` のため (`index.js:10`)、本 diff の整形違反 (M-001) は CI を通る。
- **推奨アクション**: マイルストーン棚卸しで、`--max-warnings` か `prettier --check` を CI に足すかを検討する。
- **根拠**: CONV-1。
- **scope 根拠**: 別 spec / 別 ADR で扱う領域。

## 同種事象探索 cascade summary

Critical は 0 件のため、cascade の対象は無い。参考として High 以下の探索結果を並べる。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | lint-agent JSON `prettier/prettier` | 12 グループ (約 90 件、CRLF 除く) | `LaunchDialog.tsx`, `LaunchExtraAxes.tsx` ほか 9 ファイル |
| M-002 | 変更前後の行数比較 | 4 | `LaunchDialog.tsx` 1101, `sdk-agent-session.ts` 1115, `session-core.ts` 739, `validate.ts` 534 |
| L-001 | `US-2 / US-3\|いまは追加ディレクトリだけ\|は US-[0-9] で足す` (`src`) | 2 (+ diff 内 1) | `LaunchExtraAxes.tsx:6`, `launch-extra-axes.ts:2`, `LaunchDialog.tsx` の `EMPTY_DRAFT` 内 |
| L-002 | `rounded-md border px-2 py-1.5 text-sm` | 3 定義 | `LaunchDialog.tsx`, `LaunchExtraAxes.tsx` ×2 |
| L-003 | `git ls-files --eol -- src` で `w/lf` 以外 | 1 | `src/domain/session/launch-config.ts` |

## Lint 生出力 (lint-agent JSON の要約)

- `exit_code`: 0 (5 コマンドすべて 0)
- `violation_count_by_severity`: error 0 / warning 333 / info 0
- `detectors_run`: eslint, typecheck, depcruise, check:constitution
- `detectors_not_run`: test:rules (code-gate の規則で除外)
- `typecheck`: 0 errors
- `depcruise`: 0 violations (572 modules)
- `check:constitution`: ok 20 / 違反 0 / 検査対象なし 1
- `grouped_violations`: `prettier/prettier` が 12 グループ。`launch-config.ts` の 244 件 (243 件が CRLF) は L-003 に、残りの約 90 件は M-001 に集約した。

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 5
