# ui-coverage-reviewer Review: Feature Specification: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/012-ui-thread-search/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-015: 対応表の F 節 (Command palette / Conversation search / Thread search / Empty state の使い道、Activity graph / Heat graph / Message timing / Trace waterfall の備考を O-9 へ、使い道の書式を凡例へ)。A〜E 節は差分 0 と宣言している
  - FR-008 / SC-004: 4 つの空の状態 (F 節 Empty state の使い道の根拠)
  - FR-001 / FR-017 / FR-018 / SC-008: Round 2 の差分の中心 (サイドバーの基準画像・placeholder の文言)。SDK の emit ではないので、対応表の対象外であることだけを確かめた
  - FR-003〜FR-007: `thread.aui.tsx` の text part と palette の候補 (UC-1 / UC-6。Round 2 では変わっていない)
  - SC-007: 項目 21 が通る (Round 2 の HEAD の CI で check:constitution が緑。下の H)
- touched files に該当する charter / Confirmation:
  - ui charter In scope「`docs/ui-coverage.md` の維持」、シェルの部品の規則 (`docs/domains/ui/charter.md:69-76`)
  - ui charter Out of scope「他 domain の操作 UI」と U-5 の例外 (`charter.md:54-59` / `:86-93`)。過去のセッションの区画の placeholder と基準画像はここに当たる
  - AD-044 Decision 1〜5 / Confirmation、Constitution XII の Verification Manual (ui-coverage-reviewer)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。本 reviewer は対応表の判断だけを見る
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (会話由来の文字列の無害化は security の範囲)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (対応表の対象の範囲 (UC-6) だけを G で見た)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。Round 2 の差分は Principle XII / AD-044 の条文に触れていない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

Round 2 の差分 (9d98c39..a4c37a8、gate の成果物を除く) は R1 C-001 の修正だけで、変わったのは次のファイル。
- `.github/workflows/verify.yml`: e2e のステップを足した
- `e2e/sidebar-screenshot.spec.ts`: 撮る前に区画をスクロールする
- 基準画像 1 枚
- `src/renderer/src/features/session-list/labels.ts`: placeholder を「題・ブランチ・フォルダなど」にした
- `vitest.config.ts`: testTimeout を 20s にした
- 012 の data-model / quickstart-results / touched-files

`docs/ui-coverage.md` は Round 2 で変わっていない。根拠は 2 つ。
- R1 の pr verdict と code-gate iter 3 の verdict で sha が同じ (`bae73f6`)
- 差分の diff に `ui-coverage` が 0 件

SDK のメッセージを変換・描画するモジュールも差分に無い。`claude-agent-sdk|convert\.ts|tool-registry|thread\.aui|src/agents/|src/domain/(transcript|live|system)` を差分の diff に掛けて 0 件。

R1 の 3 件の根拠になったファイルも sha が R1 と同じで、変わっていない。
- `command-palette.tsx` c8ab03a
- `conversation-search.tsx` 0aeceb7
- `thread.aui.tsx` 62d2b38
- `palette-commands.ts` 8ae5110

このため R1 の Low 3 件は未解決のまま持ち越す。severity は変えない。Round 2 の差分に起因する新しい指摘は無い。code-gate の `must_fix_findings` は空なので、suppress の対象も無い。

### 固有観点 (UC-1〜UC-7。Round 2 の差分について)

- **UC-1**: 該当なし: Round 2 の差分に、SDK の emit を新しく描く変更が無い (上の Grep で 0 件)。placeholder の文言は session の操作 UI (過去のセッションの区画) の中の文言で、対応表の行に当たらない。F 節 Thread search の備考 (`docs/ui-coverage.md:344`) は今も実装と一致する。過去の区画に検索欄だけを足した形のままで、Round 2 で変わったのは文言だけ。
- **UC-2**: 該当なし: `package.json` / `pnpm-lock.yaml` は scope (`.pr-gate-scope.txt`) に無い。差分の中の `claude-agent-sdk` は 0 件。
- **UC-3**: 該当なし: 割当の差分は 0。`後続: O-3` は 0 件で、同じ PR で表示を実装しながら `後続` に残した行も無い。
- **UC-4**: 該当なし: Tier の差分は 0。
- **UC-5**: 該当なし: `後続` の行の差分は 0。O-9 の範囲 (`docs/roadmap.md:350`) と、F 節で付け替えた 4 行 (`docs/ui-coverage.md:231,283,305,353`) は R1 から変わらず一致している。
- **UC-6**: 該当なし (Round 2 の差分について): 基準画像が写すのは、過去のセッションの区画のグループの見出しと行 (SDKSessionInfo の値) である。これは session の操作 UI で、凡例の「行にしないもの」(`docs/ui-coverage.md:28`) の理由 (1) に当たるので、行は要らない。palette の側の列挙の欠けは R1 の L-002 で持ち越す。
- **UC-7**: 該当なし: spec の status は `reviewing` (`spec.md:8`)。roadmap の O-3 の行 (`docs/roadmap.md:345`) も完了を主張していない。M3 の完了も主張していない (quickstart-results の「M3 の完了の条件の残りは 24」は R1 のまま)。

**H の根拠 (本 reviewer の範囲)**:
- invoker が観察した CI run 37565959731 (= Round 2 の HEAD a4c37a8) で verify (node 24) が success。この job には `check:constitution` のステップ (`.github/workflows/verify.yml:72-73`) が入っている。したがって項目 21 (対応表の機械照合) は Round 2 の HEAD で ok と読める。本 reviewer は read-only なので実行していない
- `scripts/constitution/**` と `tests/rule-fixtures/**` は 9d98c39..a4c37a8 で変わっていない (CI evidence)。項目 21 の検査そのものが退行した経路も無い
- B 節 user/text・assistant/text の表示が退行した場合は、R1 で挙げた `ConversationSearch.test.tsx` が捕まえる。Round 2 は `thread.aui.tsx` を変えていないので、退行の経路も無い
- L-001〜L-003 は F 節の備考・凡例・A 節の備考の文で、AD-044 Decision 4 により機械照合の外にある。捕まえるテストが無いのは決定どおりで、テストの欠けとしては挙げない

## Findings

### [Low] 凡例の「取り込んだ element に手を入れたときは何を変えたかを書く」が、O-3 が手を入れた element に揃って当たっていない (L-001) (scope: feature)

- **状態**: Round 1 から未解決 (Round 2 で `docs/ui-coverage.md` は変わっていない)
- **観察**:
  - 規則は `docs/ui-coverage.md:19` にある
  - Command palette の備考 (`docs/ui-coverage.md:248`) は「4 点を直し」としている。しかし element の冒頭の変更点の一覧は `src/renderer/src/components/assistant-ui/elements/command-palette.tsx:16-29` に 5 項目あり、`:28`「候補に補足 (`detail`) と種別 (`kind`) を足し、`keys` を省略できるようにした。入力欄の ref (`inputRef`) を足した」が備考に無い (Round 2 で再読して確かめた)
  - Conversation search の備考 (`:263`) は `conversation-search.tsx:16,18,19` の 3 つの変更 (`onInputKeyDown`・`role="searchbox"`・位置の文の色) を書いていない
  - Thread の行 (`:341`) の備考は空のまま。Composer の行 (`:250`) は「X-2」のまま。O-3 は `thread.aui.tsx` で次の手を入れている
    - user の text part を `UserTextPart` に差し替えた
    - `data-message-id` を足した
    - 会話内検索の navigator を足した
    - composer の名前と placeholder を文言の表から取るようにした
- **同種事象探索**: Grep `から変えた点|O-3` を `src/renderer/src/components/assistant-ui/elements` に掛けて 11 件 / 4 ファイル (R1 と同じ。ファイルの sha が変わっていない)。備考が食い違う、または欠けている F 節の行は `:248`・`:250`・`:263`・`:341` の 4 行
- **リスク/影響**: 規則が「取り込んだ時点の照合」だけを指すのか、後の feature の変更も指すのかが読めない。O-3 自身の適用も揃っていない。表示する情報は変わっていないので、Principle XII の判定には影響しない
- **推奨アクション**: R1 と同じ。次のどちらかに揃える
  - (a) 規則を「取り込んだ feature が取り込んだ時点で変えたこと」に絞り、その後の変更点は element のファイルの冒頭の一覧を正本にすると凡例に書く
  - (b) `:248` / `:263` / `:341` / `:250` に不足分を足す
  - どちらの場合も、PR の説明 (正本) に同じ一覧を載せる
- **根拠**: `docs/ui-coverage.md` 凡例 `:15-19` / AD-044 Decision 5 / Constitution XIII Exceptions
- **scope 根拠**: touched file `docs/ui-coverage.md` の F 節と凡例で直せる

### [Low] 凡例の「行にしないもの」が、O-3 で ui の部品が SDKSessionInfo の値を出す・探すようになった箇所を挙げていない (L-002) (scope: feature)

- **状態**: Round 1 から未解決
- **観察**:
  - `docs/ui-coverage.md:28` が ui の再掲の例として挙げるのは、O-7 の右のペインの「概要」だけである
  - O-3 の Command palette は、過去のセッションの候補を題とグループの見出しで出す (`src/renderer/src/features/shell/palette-commands.ts:217-218`)。palette はシェル (ui の In scope) の部品である
  - Thread search (U-5) の一致の対象は `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` (spec FR-001)
- **同種事象探索**: Grep `SDKSessionInfo|概要` を `docs/ui-coverage.md` に掛けて 3 件 (すべて `:28`)。SDKSessionInfo の値を出す ui の部品は 2 つ。
  - `features/shell/OverviewTab.tsx`: 凡例に列挙済み
  - `features/shell/palette-commands.ts`: 未列挙
- **リスク/影響**: 「行にしない」という結論は、理由 (2) (AD-020 Decision 1 の分母の外) で正しい。ただし palette は理由 (1) (他 domain の操作 UI) に当たらない。凡例が ui の再掲を 1 つずつ挙げる形なので、後の reviewer は palette が判断済みかどうかを凡例から読めない
- **推奨アクション**: R1 と同じ。`:28` に palette の候補と Thread search の一致の対象を足すか、「ui の部品が一覧の行と同じ値を再掲・探索するときも行にしない (理由 2)」と一般化する
- **根拠**: AD-044 Decision 4 末尾 / AD-020 Decision 1 / ui charter Out of scope と U-5
- **scope 根拠**: touched file `docs/ui-coverage.md` の凡例 1 行で直せる

### [Low] A 節の Hook / task の 5 行の備考が、完了した O-2 の quickstart V-4 を確認先として指したまま (L-003) (scope: system)

- **状態**: Round 1 から未解決
- **観察**:
  - `docs/ui-coverage.md:58,60,64,65,66` の備考は「実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す」のまま
  - 一方 `specs/011-ui-coverage/quickstart-results.md:30` は「記録していない。O-6 はこれらを未確認として扱う」としている
  - この確認の持ち主は `docs/roadmap.md:348` (O-6 の「過去ログに Hook・task の行が残るなら対応表の経路を「両方」に」)
- **同種事象探索**: Grep `O-2 quickstart V-4` を `docs/ui-coverage.md` に掛けて 5 件 (Round 2 で再確認)
- **リスク/影響**: 持ち主は roadmap にいる (O-6) ので、持ち主のいない延期ではない。ただ対応表の側からは、経路の列を直す持ち主を辿れない。O-3 が持ち込んだものではない
- **推奨アクション**: R1 と同じ。5 行の文を「実データの過去ログに残るかは未確認 (O-2 quickstart V-4 は未記録)。確かめて経路を直すのは O-6」に置き換える。直さないなら O-6 の design への申し送りに記録する
- **根拠**: AD-028 §5 / AD-044 Consequences
- **scope 根拠**: O-2 由来の既存の記述。直す場所は本 PR の touched file だが、確かめる作業は O-6 の範囲

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `から変えた点\|O-3` in `src/renderer/src/components/assistant-ui/elements` | 11 | command-palette.tsx:16-29 / conversation-search.tsx:8-20 / thread.aui.tsx:274,650,655,788,1085,1099,1107 / docs/ui-coverage.md:248,250,263,341 |
| L-002 | `SDKSessionInfo\|概要` in `docs/ui-coverage.md` | 3 | docs/ui-coverage.md:28 / src/renderer/src/features/shell/palette-commands.ts:217-218 |
| L-003 | `O-2 quickstart V-4` in `docs/ui-coverage.md` | 5 | docs/ui-coverage.md:58,60,64,65,66 / docs/roadmap.md:348 / specs/011-ui-coverage/quickstart-results.md:30 |
| UC-1 / UC-2 (Round 2 差分) | `ui-coverage\|claude-agent-sdk\|convert\.ts\|tool-registry\|thread\.aui\|src/agents/\|src/domain/(transcript\|live\|system)` in `pr-gate-round2-delta.diff` | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: resolved from 1: 0 / unresolved: 3 (L-001 / L-002 / L-003。severity は R1 のまま) / new: 0
