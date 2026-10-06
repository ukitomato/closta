# ui-coverage-reviewer Review: Feature Specification: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-07T00:00:00+09:00
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-015 — 対応表の F 節。Command palette / Conversation search / Thread search / Empty state の使い道を決め、Activity graph / Heat graph / Message timing / Trace waterfall の備考を O-9 に付け替え、使い道の書式を凡例に移す。A〜E 節は差分 0 と宣言している
  - FR-008 / SC-004 — 4 つの空の状態に EmptyState を使う (F 節 Empty state の使い道の根拠)
  - FR-003 / FR-004 / FR-005 / SC-002 — 会話内検索。`thread.aui.tsx` の text part の描画と、B 節 user/text・assistant/text の行に関わる
  - FR-006 / FR-007 / SC-003 — Command palette。候補に出す値 (UC-6)
  - FR-001 / FR-002 / FR-017 / SC-001 / SC-008 — Thread search。SDKSessionInfo のフィールドの扱い (UC-6)
  - FR-014 — composer の名前と placeholder (`thread.aui.tsx` の Composer)
  - FR-016 — roadmap の O-8 / O-9 (後続 feature の範囲。UC-5)
  - SC-007 — 項目 21 が通る (`quickstart-results.md:14` の記録)
  - FR-009〜FR-013 / SC-005 / SC-006 — 起動元と起動の利用記録。SDK の emit ではないので、対応表の対象外であることだけを確かめた
- touched files に該当する charter / Confirmation:
  - ui charter の In scope「`docs/ui-coverage.md` の維持」と、シェルの部品の規則 (`docs/domains/ui/charter.md:69-76`) — CenterHeader に会話内検索を足した
  - ui charter の Out of scope「他 domain の操作 UI」と U-5 の例外 (`charter.md:54-59` / `:86-93`) — Thread search と palette の候補
  - AD-044 Decision 1〜5 / Confirmation — 割当の書式・Tier・M3 の条件 (A〜E 節の差分 0、`後続: O-3` は 0 件)
  - AD-046 Decision 6 — F 節の置き場所の語
  - Constitution XII の Manual (ui-coverage-reviewer)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。本 reviewer は対応表の判断だけを見る
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (会話由来の文字列の無害化は security の範囲と agent 定義が定める)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (U-5 の例外の妥当性は見ない。対応表の対象の範囲 (UC-6) だけを G で見た)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。本 PR は Principle XII / AD-044 の条文を変えていない (Constitution の差分は XV だけ)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (eslint の手書きの element の一覧への追加は見ない)
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

本 PR は O-3 の PR である (merge-base 7bdb271 / HEAD 9d98c39、114 files)。対応表の差分は凡例 (使い道の書式の移設と、備考の規則の追加) と F 節の 8 行だけ。A〜E 節・A' 小節・冒頭の SDK の版 (0.3.270) は変わっていない。`package.json` / `pnpm-lock.yaml` は touched files に無い。

SDK のメッセージを変換・描画するモジュールで変わったのは `thread.aui.tsx` だけ。`convert.ts`・`tool-registry.aui.tsx`・`src/agents/`・domain の transcript / live-message / system-event は変わっていない。`thread.aui.tsx` の変更は次の 5 つで、どれも描く情報を足しも減らしもしない。

1. user の text part を library の既定の `Text` から `UserTextPart` に差し替えた。既定が持っていた実行中の印は、user のメッセージでは出ない
2. assistant の text part を `data-search-text` の箱 (`contents`) で包んだ
3. `data-message-id` を足した
4. 会話内検索の navigator を足した
5. composer の名前と placeholder を文言の表から取るようにした

code-gate の `must_fix_findings` は空なので、suppress の対象は無い。

**H の根拠**:
- B 節 user/text・assistant/text の表示が退行すれば、`ConversationSearch.test.tsx` が捕まえる。このテストは実物の Thread を過去 (`setupPast`) と稼働中 (`setupRunning`) の両方で描き、user の本文を検索・強調する (`:299-301`・`:389`・`:467-469`・`:495`・`:537`・`:584-585`)
- F 節に足した 4 つの空の状態は、component テストが testid で見ている (`SessionListScreen.test.tsx` 4・`ConversationSearch.test.tsx` 5・`CommandPalette.test.tsx` 1・`PresetPanel.test.tsx` 6)
- 項目 21 は `quickstart-results.md:14` の記録 (A 39 / A' 4 / B 10 / C 45 / D 8 / E 38 / F 127) で確かめた。本 reviewer は read-only なので実行していない
- F 節は AD-044 Decision 4 で機械照合の外 (書式だけを見る)。そのため L-001 / L-002 を捕まえる検査は無いが、これは決定どおりである

### 固有観点 (UC-1〜UC-7)

- **UC-1**: 該当なし: SDK の emit を新しく描く変更が無い。
  - B 節 user/text の `実装済み: UserMessage (両方)` と assistant/text の `実装済み: MarkdownText (両方)` は正しいまま。過去ログ・実行中とも `thread.aui.tsx` の UserMessage / AssistantMessage を通る
  - 逆向き (`実装済み` にしたのに実装が無い) も無い。A〜E 節の割当の差分は 0
  - D 節 session-state (`CenterHeader の状態`) は、O-3 で `CenterHeaderRow` に分けたが `CenterHeader` の中で描くので、割当は正しい
  - F 節の Empty state の使い道は実装と一致する (`SessionListScreen.tsx:1321` / `ConversationSearchBar.tsx:50-60` / `CommandPalette.tsx:184-189` / `PresetPanel.tsx:215-224`)
  - 備考の写しの欠けは L-001
- **UC-2**: 該当なし: `package.json` / `pnpm-lock.yaml` に差分が無い。diff の中の `claude-agent-sdk` は、ui-coverage.md の hunk の文脈行 1 件 (`.pr-gate.diff:668`) だけ
- **UC-3**: 該当なし: `表示不要` / `実装済み` / `後続` の割当の差分は 0。同じ PR で表示を実装しながら `後続` に残した行も無い (`後続: O-3` は 0 件)
- **UC-4**: 該当なし: Tier の差分は 0 (A〜E 節・F 節とも)
- **UC-5**: 該当なし: `後続` の行の差分は 0。新設の O-8 / O-9 を割当先にした行も 0 件。O-9 の行の範囲 (`docs/roadmap.md:350`) と、F 節で備考を付け替えた 4 行 (`docs/ui-coverage.md:231,283,305,353`) は一致する
- **UC-6**: palette の候補 (ui のシェル) と Thread search (ui の例外 U-5) が SDKSessionInfo の値を出す・探すようになったのに、凡例の「行にしないもの」の列挙は O-7 の「概要」のままである → L-002。
  - 逆向き (SDK の emit を「他 domain の画面」として行から外した) は無い。palette の稼働中の候補の補足はランタイム名と起動の時刻 (`palette-commands.ts:176-182`。アプリの値) で、D 節 session-state などは出していない
- **UC-7**: 該当なし (本 PR の時点):
  - spec の status は reviewing で、completed は merge 後の別コミットで付ける
  - `後続: O-3` の行は 0 件なので、O-3 を completed にする時点で書き換える行は無い
  - M3 の完了は主張していない。quickstart-results の記録は「M3 の完了の条件の残りは 24 (O-2 の後と同じ)」(`.pr-gate.diff:4953`)
  - A 節に残っている古い持ち主の指し先は L-003

## Findings

### [Low] 凡例に足した「取り込んだ element に手を入れたときは何を変えたかを書く」が、O-3 が手を入れた element に揃って当たっていない (L-001) (scope: feature)

- **観察**:
  - 規則は `docs/ui-coverage.md:19` (本 PR で追加): 「取り込んだ element に手を入れたときは、何を変えたか (registry との照合の結果) を書く。照合の正本はその feature の PR の説明で、備考はその写し」
  - **Command palette** の備考 (`docs/ui-coverage.md:248`) は「4 点を直し」としている。しかし element の冒頭の変更点の一覧 (`src/renderer/src/components/assistant-ui/elements/command-palette.tsx:16-29`) は 5 項目ある。備考に無いのは `:28`「候補に補足 (`detail`) と種別 (`kind`) を足し、`keys` を省略できるようにした。入力欄の ref (`inputRef`) を足した」
  - **Conversation search** の備考 (`docs/ui-coverage.md:263`) は次の 3 つを書いていない:
    - `conversation-search.tsx:16` の入力欄のキーの口 (`onInputKeyDown`)
    - `:18` の、入力欄を `role="searchbox"` の text の欄にした変更 (Chromium の search 欄は Esc で値を消すため)
    - `:19` の、位置の文の色の変更
  - **Thread** の行 (`docs/ui-coverage.md:341`) の備考は空のまま。O-3 は `thread.aui.tsx` に次の手を入れている:
    - user の text part を、library の既定の `Text` (`<p style="white-space:pre-line">` と実行中の印。`node_modules/@assistant-ui/react/dist/primitives/message/MessageParts.js:11-17`) から自作の `UserTextPart` (`thread.aui.tsx:1085` / `:1107`) に差し替えた
    - `data-message-id` (`:788` / `:1099`)
    - 会話内検索の navigator (`:274` ほか)
    - composer の名前と placeholder (`:650` / `:655`)。Composer の行 (`docs/ui-coverage.md:250`) の備考も「X-2」のまま
- **同種事象探索**: Grep `から変えた点|O-3` を `src/renderer/src/components/assistant-ui/elements` に掛けて 11 件 / 4 ファイル (command-palette.tsx 1・conversation-search.tsx 1・thread-list.aui.tsx 1・thread.aui.tsx 8)。
  - thread-list.aui.tsx は注記の文だけの変更 (`.pr-gate.diff:8654-8655`) なので、Thread list の行 (`:342`) は対象外
  - 備考が実装の変更点と食い違う、または欠けている F 節の行は `:248`・`:250`・`:263`・`:341` の 4 行
- **リスク/影響**: 規則が「新しく取り込む時点の照合」だけを指すのか、「後の feature が手を入れたとき」も指すのかが読めない。しかも O-3 自身の適用が揃っていない。次に Thread / Composer に手を入れる feature (O-4〜O-6 は transcript を触る) は、備考を書くべきか判断できない。表示する情報は変わっていないので、Principle XII の判定には影響しない
- **推奨アクション**: 次のどちらかに揃える。
  - (a) 規則を「registry から取り込んだ feature が、取り込んだ時点で変えたこと」に絞り、その後の変更点は element のファイルの冒頭の一覧を正本にすると凡例に書く。この場合 `:248` / `:263` は「冒頭の一覧を参照」で足りる
  - (b) 規則はそのままにして、各行に足す:
    - `:248` (Command palette): detail / kind / keys / inputRef
    - `:263` (Conversation search): onInputKeyDown / searchbox / 位置の文の色
    - `:341` (Thread): 「O-3: user の text part を `UserTextPart` に (既定の `Text` の `style` 属性と実行中の印を外し、会話内検索の印 `data-search-text` を付けた)・`data-message-id`・会話内検索の navigator」
    - `:250` (Composer): 「O-3: 名前と placeholder を `COMPOSER_LABELS` から」
  - どちらの場合も、PR の説明 (正本) に同じ一覧を載せる
- **根拠**: `docs/ui-coverage.md` の凡例 (本 PR の `:15-19`) / AD-044 Decision 5 (書式の正本は凡例) / Constitution XIII Exceptions (照合した候補名と不適合理由を PR の説明に書く)
- **scope 根拠**: touched file `docs/ui-coverage.md` の F 節と凡例で直せる

### [Low] 凡例の「行にしないもの」が、O-3 で ui の部品が SDKSessionInfo の値を出す・探すようになった箇所を挙げていない (L-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:28` は、SDKSessionInfo の値を行にしない理由を 2 つ挙げる。(1) ui charter の Out of scope (他 domain の操作 UI)、(2) AD-020 Decision 1 の分母の外。ui の側で同じ値を再掲する例としては、O-7 の右のペインの「概要」だけを挙げている (O-7 pr-gate R2 ui-coverage L-104)。O-3 は、ui の部品で同じ値を扱うようになった:
  - Command palette (シェル。ui の In scope) は、過去のセッションの候補を題 `rowTitleText(row.title, …)` (`src/renderer/src/features/shell/palette-commands.ts:217`) とグループの見出し (`:218`) で出す。題は `customTitle` → `summary` → `firstPrompt` の順に決まる (`src/domain/session/summary.ts:95-104`)
  - Thread search は ui が持つ例外 (`docs/domains/ui/charter.md:54-59`。U-5) で、一致の対象は `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` (spec FR-001)
- **同種事象探索**: Grep `SDKSessionInfo|概要` を `docs/ui-coverage.md` に掛けて 3 件 (すべて `:28`)。
  - SDKSessionInfo の値を出す ui の部品は 2 つ: `features/shell/OverviewTab.tsx` (O-7。凡例に列挙済み) と `features/shell/palette-commands.ts` (O-3。未列挙)
  - Thread search の一致の規則 (`features/search/session-search.ts`) は値を出さず、探すだけ
- **リスク/影響**: 「行にしない」という結論は理由 (2) で正しい。ただし palette は理由 (1) に当たらない。凡例は ui の再掲を 1 つずつ挙げる形にしたので、palette が判断済みかどうかを後の reviewer が凡例から読めない。O-9 (本文の横断検索・message timing) で同じ問いがまた出る
- **推奨アクション**: 次のどちらか。
  - `:28` の O-7 の「概要」の文に「O-3 の Command palette の過去のセッションの候補 (題とグループの見出し) と Thread search の一致の対象も、一覧の行と同じ値の再掲・探索なので行にしない」を足す
  - または列挙をやめ、「ui の部品が一覧の行と同じ値を再掲・探索するときも行にしない (理由 2)」と一般化する
- **根拠**: AD-044 Decision 4 の末尾 (SDKSessionInfo のフィールドは行にしない) / AD-020 Decision 1 / ui charter の Out of scope と U-5 の例外
- **scope 根拠**: touched file `docs/ui-coverage.md` の凡例 1 行で直せる

### [Low] A 節の Hook / task の 5 行の備考が、完了した O-2 の quickstart V-4 を確認先として指したまま (L-003) (scope: system)

- **観察**:
  - `docs/ui-coverage.md:58,60,64,65,66` (SDKHookStartedMessage / SDKHookResponseMessage / SDKTaskNotificationMessage / SDKTaskStartedMessage / SDKTaskUpdatedMessage) の備考は「実データに残るかは O-2 quickstart V-4 で確かめ、残れば経路を「両方」に直す」
  - 一方 `specs/011-ui-coverage/quickstart-results.md:30` は「過去ログの Hook / task の行は記録していない。O-6 はこれらを未確認として扱う」としている
  - 実際にこの確認を持っているのは `docs/roadmap.md:348` の O-6 の行 (「過去ログに Hook・task の行が残るなら対応表の経路を「両方」に」)
- **同種事象探索**: Grep `O-2 quickstart V-4` を `docs/ui-coverage.md` に掛けて 5 件 (`:58`・`:60`・`:64`・`:65`・`:66`)。roadmap で同じ確認を持つのは `docs/roadmap.md:348` (O-6) の 1 か所
- **リスク/影響**: 持ち主は roadmap にいる (O-6) ので、持ち主のいない延期ではない。ただ対応表の側からは、確かめる作業が完了した feature の quickstart に残っているように読める。経路の列 (`実行中`) を直す持ち主を、対応表からは辿れない。O-3 が持ち込んだものではない (O-2 のマージの後からある)
- **推奨アクション**: 5 行の文を「実データの過去ログに残るかは未確認 (O-2 quickstart V-4 は未記録。011 quickstart-results)。確かめて経路を直すのは O-6」に置き換える。本 PR は `docs/ui-coverage.md` を触っているので、同じ PR で直せる。直さないなら O-6 の design への申し送りに記録する
- **根拠**: AD-028 §5 (持ち主のいない延期を残さない) / AD-044 Consequences (後続 feature の範囲を roadmap に書く)
- **scope 根拠**: O-3 の変更が原因ではない、O-2 由来の既存の記述。直す場所は本 PR の touched file だが、確かめる作業そのものは O-6 の範囲

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `から変えた点\|O-3` in `src/renderer/src/components/assistant-ui/elements` | 11 件 / 4 ファイル (食い違う F 節の行は 4) | command-palette.tsx:16-29 / conversation-search.tsx:8-20 / thread.aui.tsx:274,650,655,788,1085,1099,1107 / docs/ui-coverage.md:248,250,263,341 |
| L-002 | `SDKSessionInfo\|概要` in `docs/ui-coverage.md` | 3 件 (1 行) | docs/ui-coverage.md:28 / src/renderer/src/features/shell/palette-commands.ts:217-218 |
| L-003 | `O-2 quickstart V-4` in `docs/ui-coverage.md` | 5 件 | docs/ui-coverage.md:58,60,64,65,66 / docs/roadmap.md:348 / specs/011-ui-coverage/quickstart-results.md:30 |
| UC-3 / UC-5 / UC-7 | `後続: O-3\|後続: O-8\|後続: O-9` in `docs/ui-coverage.md` | 0 件 | — |
| UC-2 | `claude-agent-sdk` in `specs/012-ui-thread-search/.pr-gate.diff` | 1 件 (文脈行) | .pr-gate.diff:668 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
