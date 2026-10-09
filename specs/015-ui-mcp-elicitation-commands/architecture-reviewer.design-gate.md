# architecture-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-10 (design-gate R3)
**Reviewer**: architecture-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-015、SC-001〜SC-005、US-1 AC1〜AC9、US-2 AC1〜AC7、US-3 AC1〜AC5、Edge Cases、U-1〜U-7、`.needs-input.md` Q1〜Q3、Out of Scope
- 該当する charter / Confirmation: ui charter (:7-23 frontmatter、:50 In scope の composer、:192-199 Related ADRs、:253-254 Open Questions)、session charter (:18 related_adrs、:134-136 Meter、:217 Related ADRs)、`_overview.md` (:65、:100-104、:143-159)、glossary (Meter / SessionLaunchConfig)、Constitution XI / XII / XIII / XIV / XV、AD-031 Decision 1 と訂正 2、AD-035 Decision 1、AD-036 §4 P3 (:144-145)、AD-041 (e)(g)、AD-044、AD-046 Decision 4 (:28)、AD-047 Decision 2 と既存の訂正節 (:62-89)、AD-048 (:28) と Decision 1〜5 / Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:4
- D. Constitution / ADR drift: Critical:0 High:0 Medium:3 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (用語の衝突は Ubiquitous Language の観点で M-103 として C に入れた)
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R2 の後のコミット a894690 は H-01〜H-03 と M-03 に手を入れた (US-1 AC9 と data-model §1 の状態の印、data-model §2 の合流の規則、P3 の denylist を 19 個に広げ `keyof Query` の網羅性を型で固定、tasks.md:9-11 の着手の条件)。これらは accepted の ADR の決定を書き換えておらず、NON-NEGOTIABLE の Principle に反するものも無い。AD-036 §4 P3 は「`interrupt()` のみ呼ぶ」(0036:144) なので、`reloadOutputStyles` / `backgroundTasks` を足すのは P3 の範囲内の締め付けで ADR は要らない。

一方、R2 の architecture の指摘 9 件 (M-101〜M-103、L-101〜L-106) はどれも直っていない。H-03 の手当てで新しい問題が 1 つ出た (M-201)。

## Findings

### [Medium] `PanelTab.attention?: (sessionId) => boolean` はモジュールの定数の表に置く関数で、context で注入する稼働中のストアに届かず、値の変化も購読しない (M-101) (scope: feature) [unresolved from prev R2 M-101 / gate M-02]

- **観察**: data-model.md:111 と tasks.md:62 (FE-020) は R2 と同じく `attention?: (sessionId: string) => boolean` を足すとしている。`PANEL_TABS` (`src/renderer/src/features/shell/panel-tabs.ts:26-42`) は React の外にあるモジュールの定数。稼働中のストアは `running-session-context.ts:18` で「vanilla の `createStore` を React context で注入し、テストが別のストアを差し込めるようにする」と決められ、読む側は `useRunningSessionStoreApi()` (:28-30) を使う。表の関数がストアに届くにはシングルトン `runningSessionStore` (:21) を直接 import するしかなく、注入の規則に反するうえ、購読しないので `init-report` が届いても畳んだ帯が描き直されない
- **同種事象探索**: `attention` (spec dir) で 4 件 (data-model.md:111 / tasks.md:62 / plan.md:149 / spec.md:131)。コンポーネントの外から `runningSessionStore` を読む既存のコードは 0 件
- **リスク/影響**: US-2 AC5 が設計どおりには実装できない。FE-020 のテストは context で差し込んだストアを見るので、実装がシングルトンを読んでいても見逃す
- **推奨アクション**: 表の行には純関数 `attention?: (meters: SessionMeters | undefined) => boolean` を置く。購読は `RightPanel.tsx` が既存の `useSessionMeters` で行い、得た値を関数に渡す。data-model §3 と FE-020 を同じ形に直し、テストは context で差し込んだストアに `init-report` を流して帯が描き直されることを確かめる
- **根拠**: AD-046 Decision 4、`running-session-context.ts:17-18`、Constitution XI
- **scope 根拠**: data-model §3 / tasks FE-020 で直せる

### [Medium] AD-047 に足す予定の「訂正」節は、AD-031 のいう訂正 (事実誤認) に当たらない。事実と食い違っているのは AD-048:28 のほう (M-102) (scope: feature) [unresolved from prev R2 M-102 / gate M-07]

- **観察**: spec.md:210 (FR-014)、plan.md:155、tasks.md:106 (SH-013) がいずれも AD-047 に「訂正: AD-048 への参照」の節を足すとしており、R2 から変わっていない。AD-031 Decision 1 の表 (0031:104-107) は訂正を「事実誤認の訂正 (数値・経路・前提の誤り)」に限っている。AD-047 の本文に誤りは無い。行われなかったことを「行う」と書いているのは AD-048:28。AD-047 には既に訂正 2 (0047:74-77) があり、そこへ読み替えを訂正として足すと、後続 ADR による決定の読み替えを訂正の区分で記録することになる
- **同種事象探索**: `訂正: AD-048|日付つきの訂正節|proposed のうちに` で 5 件 (spec.md:210 / plan.md:155 / tasks.md:106 / AD-048:28 / .needs-input.md:6-8)
- **リスク/影響**: 訂正の区分が「参照の追加」や「読み替えの記録」にまで広がり、AD-031 の判定基準が緩む。AD-048:28 の事実と違う記述も残る
- **推奨アクション** (Q1 の回答に添える): (A') AD-048 に日付つきの訂正節を足す (「:28 の『proposed のうちに参照を足す』は行われなかった。AD-047 から AD-048 へは glossary の Meter と session charter から辿る」)。AD-047 は触らない。(A'') AD-047 に足すなら、見出しを「記録: AD-048 による Decision 2 の読み替え」とし、決定を含まない記録 (AD-041:31 の先例) と明記する。どちらでも FR-014・plan の ADR 節・SH-013 の文言を揃える
- **根拠**: AD-031 Decision 1 と訂正 2、AD-047:62-77
- **scope 根拠**: SH-013 で直せる

### [Medium] 構成のタブのコード識別子 `config` / `ConfigTab` / `config*` の文言キーが、`RunningSession.config` (SessionLaunchConfig) とぶつかる (M-103) (scope: feature) [unresolved from prev R2 M-103 / gate M-08]

- **観察**: data-model.md:96 (`PanelTabId` に `config`)、:157-159 / :165 (`configTab` / `configTimepoint` / `configLiveOnly` / `configAwaitFirst` / `configOmitted`)、plan.md:149 / :222 (`ConfigTab.tsx`)、tasks.md:62 / :64 で、R2 から変わっていない。`running-session-types.ts:58` の `readonly config: SessionLaunchConfig` は起動の設定で、隣の「概要」のタブがそれを描いている。SH-001 で glossary に足す Counterexample (「`SessionLaunchConfig` とは別物」) とコードの名前が逆を指す
- **同種事象探索**: `ConfigTab|configTab|'config'` (spec dir) で 8 件
- **リスク/影響**: Principle XIV の同義異語にあたる
- **推奨アクション**: タブの id を `init-report`、部品を `InitReportTab.tsx`、文言キーを `initReport*` にする。画面の文言「構成」は変えない。data-model §3 / §6、plan の Project Structure、FE-020 / FE-021 を直す
- **根拠**: Constitution XIV、glossary SessionLaunchConfig

### [Medium] `Query` の変更系の 19 個の名前が `allowlists.mjs`・pin テスト・`sdk-agent-session.ts` の型の union の 3 か所に別々に書かれ、型の union と検出器の集合をつなぐ検査が無い (M-201) (scope: feature) [new]

- **観察**: tasks.md:86 (BE-040) と research.md:55 (2) は、`keyof Query` の網羅性の型に「変更系 (19 個の union。pin テストと同じ名前)」を手で書くとする。検出器が読むのは `allowlists.mjs:420-427` の配列で (`check.mjs:918`)、pin テストもその配列を固定するだけ。union に分類しても配列に足し忘れると tsc も pin テストも通り、検出器は見逃す
- **同種事象探索**: `19 個の union|pin テストと同じ名前|QUERY_MUTATION_METHODS` で 7 件 (tasks.md:86 / research.md:55 / quickstart.md:7,9 / allowlists.mjs:420 / check.mjs:51,918)
- **リスク/影響**: H-03 の隙間が (型の union) と (検出器の配列) の間に移っただけになっている
- **推奨アクション**: pin テストが `sdk-agent-session.ts` のソースから変更系の union の文字列リテラルを読み取り、`QUERY_MUTATION_METHODS` と集合で一致することを確かめる。BE-040 の確かめに「union に 1 つ足して配列に足さないと pin テストが落ちる」を加え、SC-005 の計測経路に書く
- **根拠**: AD-036 §4 P3、AD-048 Decision 2、規則の正本は 1 か所という原則
- **scope 根拠**: BE-040 で直せる。platform-boundary の領域と重なるので gate の dedup で統合してよい

### [Low] AD-048 Decision 1 が利用者に委ねた O-10 の domain について、決まった結果を ADR への参照つきで記録する箇所が無い (L-101) (scope: feature) [unresolved from prev R2 L-101 / gate L-12]

- **観察**: SH-012 (tasks.md:101) には「O-10 の domain の理由」とだけある。AD-048:34 に対する U-1 (spec.md:72) の結論として記録する形になっていない
- **推奨アクション**: `_overview.md` に「AD-048 Decision 1 が委ねた O-10 の domain を U-1 (2026-10-05) で session に決めた」と ADR への参照つきで書くことを SH-012 に明記する

### [Low] ui charter の In scope「slash commands」の持ち主を O-10 に移すのに、ui と session の分担を O-3 の例外と同じ形で書いていない (L-102) (scope: feature) [unresolved from prev R2 L-102 / gate L-13]

- **観察**: SH-013 (tasks.md:104) は「持ち主を O-10 に」としか書いていない。U-1 (spec.md:72) は「表示の部品は ui が持つ」、U-6 (:77) は IME の扱い (Principle VIII) を O-10 に送っている。charter の :55-60 に O-3 の先例がある
- **推奨アクション**: charter :50 に「O-10 (session。U-1 / U-6) の中で、候補の部品と IME の扱い (Principle VIII の E2E を含む) は本 domain が持つ」を足す

### [Low] ui / session charter の `related_adrs`・Related ADRs と ui charter の `related_specs` の追随が SH-013 から漏れている (L-103) (scope: feature) [unresolved from prev R2 L-103 / gate L-14]

- **観察**: ui charter の `related_adrs` (:7-15) と Related ADRs (:192-199) に AD-047 も AD-048 も無い。`related_specs` (:16-23) に 015 も無い。session charter の `related_adrs` (:18) と Related ADRs (:217) にも AD-048 が無い。SH-013 (tasks.md:104-105) が挙げるのは Related Specs だけ
- **推奨アクション**: SH-013 に両 charter の frontmatter と Related ADRs の追随を足す

### [Low] `LiveProgressSource` の docblock「値は数だけ」に、文字列の一覧 `mcpServerNames()` を足すのに規則を直すタスクが無い (L-104) (scope: feature) [unresolved from prev R2 L-104 / gate L-15]

- **観察**: `transcript-context.ts:32` は「値は数だけ」。FE-011 (tasks.md:46) は同じ interface に `mcpServerNames(): readonly string[]` を足すが docblock を直すとは書いていない
- **推奨アクション**: FE-011 に docblock の修正を足す

### [Low] FR-014「`METER_UPDATE_TYPES` の固定テストを直す」の誤りが、plan 申し送り #14 で「足す」と読み替えたまま spec に残っている (L-106) (scope: feature) [unresolved from prev R2 L-106 / gate L-02]

- **観察**: spec.md:210 は「直す」。plan.md:133 / data-model.md:81 / tasks.md:33 は「足す」
- **推奨アクション**: FR-014 の文言を「足す」に直し、plan #14 の読み替えを消す

### [Low] FE-001 の「一覧を組む純関数を同じファイルに置く」の「同じファイル」が、対象の 3 ファイルのどれか決まらない (L-201) (scope: feature) [new]

- **観察**: tasks.md:34 (FE-001) は対象を `running-session-types.ts` / `running-session-store.ts` / `session-event-decoder.ts` と並べたうえで「同じファイルに置き、FE-021 が使う」と書く。data-model §2 も置き場を決めていない
- **推奨アクション**: 置き場を `features/session/useSessionMeters.ts` の隣と明記する。合流の規則の正本は data-model §2 のまま参照する

### [Low] US-1 AC5「過去ログは実行中と同じ形」と FE-012 のテスト「同じ DOM」が、data-model §1 (過去ログではサーバー名の一覧が空) と食い違う (L-105) (scope: feature) [H] [unresolved from prev R2 L-105 / gate M-01]

- **観察**: data-model.md:9-12 では過去ログの `knownServers` は空。tasks.md:48 は「過去ログと実行中の fixture で同じ DOM」を求める。`mcp__a__b__c` は実行中なら `a__b › c`、過去ログでは `a › b__c` に推定の印が付くので同じ DOM にならない
- **推奨アクション**: FE-012 の観点を「`__` を含まない名前では同じ DOM」「曖昧な名前は過去ログで推定の印が付く」の 2 つに分ける。AC5 の「同じ形」は部品と見出しの構造の一致だと data-model §1 に書く

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `attention` / 外からの `runningSessionStore` 読み取り | 4 / 0 | data-model.md:111 / tasks.md:62 / plan.md:149 / spec.md:131 |
| M-102 | `訂正: AD-048\|日付つきの訂正節\|proposed のうちに` | 5 | spec.md:210 / plan.md:155 / tasks.md:106 / AD-048:28 / .needs-input.md:6-8 |
| M-103 | `ConfigTab\|configTab\|'config'` | 8 | data-model.md:96,157,158,159,165 / plan.md:149,222 / tasks.md:62,64 |
| M-201 | `19 個の union\|pin テストと同じ名前\|QUERY_MUTATION_METHODS` | 7 | tasks.md:86 / research.md:55 / quickstart.md:7,9 / allowlists.mjs:420 / check.mjs:51,918 |
| L-101 | `利用者が決める` / `O-10 の domain` | 1 / 1 | AD-048:34 / tasks.md:101 |
| L-102 | `slash commands` | 4 | ui charter.md:50 / spec.md:77,213 / tasks.md:104 |
| L-103 | `AD-048` (charters) | 0 | — |
| L-104 | `値は数だけ` | 1 | transcript-context.ts:32 |
| L-105 | `同じ DOM\|knownServers` | 2 | tasks.md:48 / data-model.md:9 |
| L-106 | `固定テストを直す` | 1 | spec.md:210 |
| L-201 | `同じファイルに置き` | 1 | tasks.md:34 |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 7
- Round inheritance: resolved from R2: 0 / unresolved: 9 (M-101 / M-102 / M-103 / L-101〜L-106) / new: 2 (M-201 / L-201)
