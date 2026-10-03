# platform-boundary-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (design-gate)

R1 の 6 件はすべて解消。新しい指摘は Medium 1 / Low 2。

## 初回読了 viewpoint

- FR/SC: FR-003 / SC-001 / SC-002 (項目 21 と照合の自己完結性。PB-7)、FR-007 / FR-008 / FR-011 / SC-003 / SC-004 (agents の分岐・結果待ちの Map・境界の計測。PB-2、AD-043)、FR-014 / SC-006 (パスの末尾。PB-1)、FR-006 / SC-007
- touched files に該当する charter / Confirmation: AD-043 Decision 2、AD-034 Decision 1、AD-041 (g)、Principle I / IV / VII。runtime / isolation の charter と AD-003 / AD-004 / AD-012 は該当しない
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:1
- G. optional reviewer 範囲: 該当なし: 担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

送り直しの境界と上限 (`run()` の closure、256 件、約 100MB、`post` の kind の固定)、境界の計測 (V-3 と SH-092 に調停役スレッドの 4 モジュール。実在を確認)、項目 21 は pending を持たない、E2E は回帰の確認だけ、が入った。`post` の kind の現行の値 (`status` / `event` / `ended` / `child-exited`) と options のキーの固定 (`session-core.test.ts:191`) を確かめた。

## 固有観点

- **PB-1**: 該当なし (パス型を生成・復元・永続化しない。`summarizeToolInput` は表示用の末尾。`output_file` は読まない)
- **PB-2**: 結果待ちの Map は `run()` の closure。renderer の合成は sessionId ごとの store の中。合成 id の衝突は 1 セッションの中に限られる
- **PB-3**: 該当なし
- **PB-4**: 該当なし (options のキーを変えない。新しい分岐は `canUseTool` に戻らない。項目 16 が引き続き見る)
- **PB-5**: 該当なし
- **PB-6**: 該当なし (element の再棚卸しは web の読み取りだけ)
- **PB-7**: 項目 21 の照合の自己参照 (M-101) と、入力のパスを差し替える口 (L-102)

## Findings

### [Medium] 照合の正解 (対応表の A・C・E 節) を、照合する parse 自身の出力から起こすので、parse の取りこぼしが恒久的に検出されない (M-101) (scope: feature)

- **観察**: SH-011 は A・C・E 節の行を BE-010 の parse の出力から起こし、項目 21 は同じ parse の結果と対応表を比べる。parse が取りこぼすと対応表も同じだけ欠け、集合は一致する。歯止め (「極端に少ない」・抜粋の fixture・V-1.3 の目視) はどれも parse から独立していない。E 節は「約 45」で比べる数が無い
- **同種事象探索**: `極端に少ない|約 45|parse の出力から起こす` で 5 件 (spec.md:172、plan.md:131、plan.md:179、research.md:17、tasks.md:34)
- **リスク/影響**: 初版で取りこぼした型は一度も行に現れず、SDK を上げても通り続ける
- **推奨アクション**: BE-011 に、devDependency の `typescript` のコンパイラ API でインストール済みの `sdk.d.ts` / `sdk-tools.d.ts` から集合を列挙し、`coverage.mjs` の regex の parse と一致することを確かめるテストを足す (`coverage.mjs` は依存なしのまま)。「極端に少ない」を具体的な下限にし、E 節の実数を research と quickstart に記録する
- **根拠**: AD-020 Decision 1、`check.mjs:8-15` (検証の 3 状態)、PB-7

### [Low] FR-011 の「`SessionEvent` の種類を増やさない」に計測の経路が無い (L-101) (scope: feature)

- **観察**: `SESSION_EVENT_KINDS` (`agent-session.ts:181`) は V-3 の diff の外で、固定するテストが無い。調停役は payload を不透明に中継するので、kind を足しても main / preload の差分は出ない
- **推奨アクション**: `[...SESSION_EVENT_KINDS].sort()` を 7 値と比べる固定テスト。SC-004 の計測に「`SessionEvent` の種類」を足す

### [Low] 項目 21 の入力のパスを差し替える口が、CI の ok を別の入力に向けうる (L-102) (scope: feature)

- **観察**: 今の `check.mjs` は `process.env` / `process.argv` を読まない。差し替えの口は新しい入口で、通ったときの出力に読んだ入力が出ない
- **推奨アクション**: 差し替えは引数の形に限る (環境変数は読まない)。差し替えたときは note に読んだパスを出す。BE-012 に「差し替え無しで実の 5 ファイルを読む」

## R1 指摘の判定

| R1 ID | 判定 |
|---|---|
| M-001 (RK-02 の E2E) | resolved |
| M-002 (V-3 に調停役) | resolved (同種の残りは L-101) |
| M-003 (pending) | resolved (照合の自己参照は M-101) |
| L-001 / L-002 / L-003 | resolved |

## 他の owner への申し送り (指摘数には含めない)

- `local_bash` の task の `description` にコマンドの文字列がそのまま入りうる (data-model は `description` を読む)。task 側に `hook_name` と同じ手当てが無い → security
- 結果の本文の上限の書き方: data-model は `sanitizeBody` (`BODY_MAX_BYTES`)、過去ログは `TOOL_RESULT_MAX_BYTES` (`transcript.ts:232`)。値はどちらも 200,000。共通化で揃える → convention

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `極端に少ない\|約 45\|parse の出力から起こす` | 5 | spec.md:172、plan.md:131、plan.md:179、research.md:17、tasks.md:34 |
| L-101 | `SESSION_EVENT_KINDS` | 3 | agent-session.ts:181、session-event-decoder.ts:3、:60 |
| L-102 | `process\.env\.\|process\.argv` (check.mjs) / `入力のパスを差し替える口` | 1 / 2 | check.mjs:1215 (コメント) / plan.md:129、tasks.md:32 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 2
- Round inheritance: resolved from 1: 6 / unresolved: 0 / new: 3
