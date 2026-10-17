# convention-reviewer Review: 017 ui-conversation-time-and-activity (code-gate iter 3)

**Run**: 2026-10-17
**Reviewer**: convention-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: code-gate iteration 3
**Scope**: 未コミット差分 (pr-gate R1 の修正分 + iter 2 の fix: `ConversationSearch.test.tsx` に waitFor を追加)。9 ファイル。

## 初回読了 viewpoint

- FR/SC: SC-002 / U-8、SC-003 / US-2 AC3、US-2 AC1 / AC2、pr-gate H-001。spec.md / plan.md / tasks.md は全文を読んでおらず、diff・scope・touched-files.txt と Grep で確認できる範囲の判断。
- charter / Confirmation: ui charter と AD-051 は docs 3 件の記述整合の範囲でだけ見た。convention 観点の指摘は無い。
- lint-agent JSON (CONV-1): exit_code 0、violations 0 件、eslint 0 error / 0 warning、tsc_node / tsc_web errors 0。Critical 0。
  - suppressed 1 件 (`ConversationMapTab.tsx:230` `react-hooks/incompatible-library`) は diff 外の既存 inline disable。228 行目に理由コメントあり。finding にしない。
  - iter 1 にあった depcruise と check:constitution は今回の detectors に無い。
- A. 認可 / 認証 / secret 管理: 該当なし: owner 範囲外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner 範囲外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: owner 範囲外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: owner 範囲外 (architecture-reviewer)
- E. User Story / SC / AC / UX: 該当なし: owner 範囲外 (po-reviewer)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: convention-reviewer は optional reviewer 範囲を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (F の担当範囲に限る)
  - `publish` prop は `MessageTimeLabel.test.tsx` の新規テストが false → true → false の遷移で固定している。
  - `store.clear` / `store.current` / `createCenterConversationStore` / `withReceivedAt` は実在する。リネーム漏れは無い。
  - `ConversationSearch.test.tsx:321` の `waitFor` は同ファイル 318 行目と同じ呼び方で、typecheck と eslint を通っている。
  - 既存の振る舞いを壊す変更は diff 上見当たらない。

## スコープ要約

1. `ConversationTimeProvider` に `publish?: boolean` (default true) を追加。
2. `CenterPane` の過去ログ側で `transcript.status` が ready / empty のときだけ publish。
3. `ConversationMapTab` の行に `group/row` と hover / current 時の文字色。
4. テスト 3 本追加。
5. `ConversationSearch.test.tsx` の `scrolledIds` 検証を `waitFor` で包んだ。
6. docs 3 件の追記と `touched-files.txt` への追記。

命名・配置・import 順に問題なし。新規ファイル無し。ファイル規模はいずれも 500 行未満。CONV-4 の循環依存は madge 未実行だが、新たな依存方向は無い。

## Findings

### [Low] touched-files.txt の追記分に重複行がある (L-001) (scope: feature)

- **観察**: `touched-files.txt:57-63` と `:65` が既存行 (32 / 47 / 49 / 48 / 37 / 7 / 6 / 29) と重複。新規は 64 行目の `quickstart-results.md` だけ。追記分は未ソート。
- **同種事象探索**: 追記 9 行中、重複 8 件。
- **リスク/影響**: 機械処理への実害なし (scope 計算で畳まれる)。
- **推奨アクション**: 57〜63 行目と 65 行目を削除。
- **根拠**: CONV-3。Low のため gate では直さない (AD-050)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (Critical なし) | - | - | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- lint-agent: exit_code 0。lint 起因の finding は 0 件。
