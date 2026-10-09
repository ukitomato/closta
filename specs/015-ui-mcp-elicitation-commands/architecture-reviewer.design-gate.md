# architecture-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-09 (design-gate R2)
**Reviewer**: architecture-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-015、SC-001〜SC-005、US-1 AC1〜AC8、US-2 AC1〜AC7、US-3 AC1〜AC5、Edge Cases、U-1〜U-7、`.needs-input.md` Q1〜Q3、Out of Scope
- touched files に該当する charter / Confirmation: ui charter (:47-77 In scope・:171-190 Cross-domain・:236-254 Open Questions)、session charter (:129-137・:217・:254-257)、`_overview.md` (:47-68・:100-104・:115-119・:143-159)、glossary (Meter :565-578・System event row :943-958・Shell :960-979)、Constitution III / IV / VIII / IX / X / XII / XIII / XIV / XV、AD-031 Decision 1、AD-035 Decision 1、AD-036 Decision 4 / §4 P3、AD-041 (e)(g)、AD-044、AD-046 Decision 4、AD-047 Decision 2 と訂正節 (:62-89)、AD-048 Decision 1〜5 / Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:4
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (AC5 とテストの食い違いは H の L-105 で扱う)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (用語の衝突は Ubiquitous Language の観点で M-103 として C に入れた)
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-7 / O-3 / O-4 のマージ後の main に載せ直した design (spec・plan・tasks・data-model・research・quickstart) をレビューした。R1 の High 2 件 (構成の重複抑止・印と契約の両立) は解消している。根拠の AD-036 §4 P3 への付け替え、AD-048 の未信頼の文字列と 2 段の登録、O-10 の domain、過去ログの tool 名の無害化、SC の計測経路も直っている。accepted ADR の決定を書き換える提案は無く、NON-NEGOTIABLE の違反も見つからない。残る問題は 3 つ。(1) 畳んだ帯の注意の印 (`PanelTab.attention`) の形が、稼働中のストアを context で注入する今の規則と両立しない。(2) AD-047 に足す「訂正」節が AD-031 の訂正の区分に当たらない。(3) R1 M-007 の名前の衝突がタブの id と部品の名前に残っている。

## Findings

### [Medium] `PanelTab.attention?: (sessionId) => boolean` は静的なタブの表の関数で、context で注入する稼働中のストアに届かず、値の変化も購読しない (M-101) (scope: feature)

- **観察**: data-model.md:102 と tasks.md:58 (FE-020) は、タブの表 (`panel-tabs.ts`) に `attention?: (sessionId: string) => boolean` を足すとしている。値は「表示中の稼働中のセッションの `initReport` に `failed` / `needs-auth` があるか」。`PANEL_TABS` (`src/renderer/src/features/shell/panel-tabs.ts:26-42`) はモジュールの定数の配列で、React の外にある。一方で稼働中のストアは `src/renderer/src/features/session/running-session-context.ts:18` の規則により「`stores/` に置かない。vanilla の `createStore` を React context で注入し、テストが別のストアを差し込めるようにする」とされ、読む側は `useRunningSessionStoreApi()` (:28-30) から取る。静的な関数がストアに届く経路は、モジュールのシングルトン `runningSessionStore` (:21) を直接 import することだけで、これは :18 の注入の規則を破る。しかも `getState()` で読むので購読せず、`init-report` が届いても畳んだ帯が描き直されない
- **同種事象探索**: `attention` (spec dir) で 4 件。data-model.md:102 / tasks.md:58 / plan.md:149 / spec.md:130 (US-2 AC5)。`runningSessionStore` をコンポーネントの外から読む既存のコード: 0 件 (`running-session-context.ts:21,26` の定義と既定値だけ)
- **リスク/影響**: US-2 AC5 (畳んだ帯の印) が設計のままでは実装できない。実装者がシングルトンを読むと、FE-020 のテスト「別のセッションの状態で出ない」は context で差し込んだストアを見ないので、何を確かめているのか分からなくなる
- **推奨アクション**: 表の行には純関数 `attention?: (meters: SessionMeters | undefined) => boolean` を置き、購読は `RightPanel.tsx` の側で `useSessionMeters` (表示中のセッションだけ) から行って、その値を関数に渡す。data-model §3 の型と FE-020 の記述を同じ形に直す。テストは context で差し込んだストアに `init-report` を流し、帯の印が描き直されることを確かめる
- **根拠**: AD-046 Decision 4 (1 か所の表)、`running-session-context.ts:17-18` (寿命と注入の規則)、Constitution XI (US-2 AC5 を画面で観測できること)
- **scope 根拠**: data-model §3 / tasks FE-020 で直せる

### [Medium] AD-047 に足す「訂正」節は AD-031 の訂正 (事実誤認) に当たらず、誤った記述は AD-048 の側にある (M-102) (scope: feature)

- **観察**: spec.md:209 (FR-014)、plan.md:155、tasks.md:102 (SH-013) は、AD-047 に見出し「訂正: AD-048 への参照」の節を足し、AD-031 Decision 1 を根拠にするとしている。しかし AD-047 の本文に事実誤認は無く、参照が欠けているだけである。事実と食い違っているのは AD-048:28 の「AD-047 は proposed のうちに Consequences に本 ADR への参照を足す」で、これは実際には行われなかった。AD-031 Decision 1 の表 (0031:104-107) は訂正を「事実誤認の訂正 (数値・経路・前提の誤り)」に限っている。決定を含まない追記には、AD-041:31 の「記録」節という先例がある (この扱いを AD-031 で明文化する件は system follow-up とされている)
- **同種事象探索**: `訂正: AD-048\|AD-047 に日付つきの訂正節\|proposed のうちに` で 5 件。spec.md:209 / plan.md:155 / tasks.md:102 / AD-048:28 / `.needs-input.md`:6-8
- **リスク/影響**: 訂正節の区分 (読み手が同じ決定に至る事実誤認の訂正) が「参照の追加」にまで広がり、AD-031 の判定基準が緩む。AD-048:28 の誤った記述も残る
- **推奨アクション** (Q1 の回答に添える): (A') AD-048 に日付つきの訂正節を足す。中身は「:28 の『AD-047 は proposed のうちに参照を足す』は行われなかった。AD-047 → AD-048 は glossary の Meter と session charter から辿る」。AD-047 は触らない。または (A'') AD-047 に節を足すなら、見出しを「記録: AD-048 による Decision 2 の読み替え (2026-10-xx)」にして、AD-041:31 と同じく決定を含まない記録だと明記する。どちらの場合も FR-014・plan ADR 節・SH-013 の字面を揃える
- **根拠**: AD-031 Decision 1 と訂正 2 (「訂正節に何を書いたか」で判定する)、AD-041:31
- **scope 根拠**: 本 PR の docs 変更 (SH-013) で直せる。Q1 (未承認) の選択肢に関わる

### [Medium] 構成のタブのコード識別子 `config` / `ConfigTab` / `config*` の文言キーが、同じ稼働中のビューの `RunningSession.config` (SessionLaunchConfig) と衝突する (R1 M-007 の残り) (M-103) (scope: feature)

- **観察**: R1 M-007 の手当てで、meter の種類は `init-report`、型は `SessionInitReport` に変わった。しかしタブは `PanelTabId` に `config` (data-model.md:87、tasks.md:58)、部品は `ConfigTab.tsx` (plan.md:149,222、tasks.md:60)、文言キーは `configTab` / `configTimepoint` / `configLiveOnly` / `configAwaitFirst` / `configOmitted` (data-model.md:148-156) のままである。稼働中のセッションの型には `readonly config: SessionLaunchConfig` (`src/renderer/src/features/session/running-session-types.ts:58`) があり、隣の「概要」のタブ (`OverviewTab.tsx`) はこの `config` (起動時の設定) を描いている。glossary に足す Counterexample (tasks.md:15 SH-001「`SessionLaunchConfig` とは別物」) と、コードの名前が逆の方向を指す
- **同種事象探索**: `ConfigTab\|configTab\|'config'` (spec dir) で 6 件 (data-model.md:87,148,150,156 / plan.md:149,222 / tasks.md:58,60)。既存の `\bconfig\b` (SessionLaunchConfig の意味) は running-session-types.ts:58,84
- **リスク/影響**: 読み手は `ConfigTab` を `RunningSession.config` (起動時の設定) の表示と取り違える。モデルの見出しを「起動時のモデル」と「Claude Code が報告したモデル」に分けた意図 (spec Clarifications 5 つ目) がコードで崩れる (Principle XIV)
- **推奨アクション**: タブの id を `init-report` (または `reported`) に、部品を `InitReportTab.tsx` に、文言キーを `initReport*` に揃える。表示の文言「構成」は変えない。data-model §3 / §6、tasks FE-020 / FE-021、plan の Project Structure を同じ名前に直す
- **根拠**: Constitution XIV、glossary SessionLaunchConfig (:845)、R1 M-007
- **scope 根拠**: 新設する識別子の名前なので本 feature で直せる

### [Low] AD-048 Decision 1 の「O-10 の domain は利用者が決める (仮採用は session)」が accepted の本文に残り、決まった結果を辿る記録の場所が書かれていない (L-101) (scope: feature)

- **観察**: AD-048:34 は domain の決定を利用者に委ねている。spec.md:72 (U-1) は 2026-10-05 に session と承認した。FR-014 は AD-048 の本文を変えないとし、決まった結果は FR-015 で `_overview.md` の帰属の判断根拠に書くことになっている
- **推奨アクション**: `_overview.md` の帰属の判断根拠 (SH-012) に「AD-048 Decision 1 が利用者に委ねた O-10 の domain を、U-1 (2026-10-05) で session に決めた」と、ADR への参照つきで書く。ADR の改変は不要
- **根拠**: AD-048 Decision 1、Constitution XIV

### [Low] ui charter の In scope「composer (slash commands)」の持ち主を session の feature (O-10) に付け替えるのに、持ち主の分担を O-3 の例外と同じ形で書いていない (L-102) (scope: feature)

- **観察**: FR-015 (spec.md:212) と SH-013 (tasks.md:100) は「In scope の composer の slash commands の持ち主を O-10 に」とだけ書く。U-1 (spec.md:72) は「O-10 の domain は session、表示の部品は ui が持つ」とし、U-6 (:77) は IME の扱い (Principle VIII) を O-10 で設計するとしている。ui charter には、他 domain の feature との分担を明記した先例として O-3 の例外 (charter :55-60) がある
- **推奨アクション**: ui charter の該当の行に「O-10 (session。U-1 / U-6) の中で、候補の部品と IME の扱い (Principle VIII の E2E を含む) は本 domain が持つ」と、分担を 1 文で書く
- **根拠**: ui charter :50 / :55-60、Principle VIII

### [Low] ui / session charter の Related ADRs と frontmatter (`related_adrs` / `related_specs`) の追随が FR-015 / SH-013 から漏れている (L-103) (scope: feature)

- **観察**: ui charter の frontmatter `related_adrs` (:7-15) に AD-047 も AD-048 も無く、`related_specs` (:16-23) に 015 が無い。session charter の `related_adrs` (:18) と Related ADRs (:217) にも AD-048 が無い。SH-013 (tasks.md:100-101) が挙げるのは Related Specs だけである
- **推奨アクション**: SH-013 に、両 charter の frontmatter と Related ADRs への AD-048 の追加 (ui には AD-047 も) を足す

### [Low] `LiveProgressSource` の規則「値は数だけ」に、文字列の一覧 `mcpServerNames()` を足す変更が記録されない (L-104) (scope: feature)

- **観察**: `src/renderer/src/features/chat/transcript-context.ts:30-32` の docblock は「値は数だけ」と定めている。FE-011 (tasks.md:42) と research R-05 は、ここに `mcpServerNames(): readonly string[]` を足す
- **推奨アクション**: FE-011 で docblock の規則を「数と、`init-report` の形の検査を通ったサーバー名 (data-model §2)」に直すことをタスクに書く
- **根拠**: AD-048 Decision 3

### [Low] spec FR-014「`METER_UPDATE_TYPES` の固定テストを直す」の誤りを、plan の申し送り #14 で読み替えたまま spec に残している (L-106) (scope: feature)

- **観察**: spec.md:209 は「直す」と書く。plan.md:133 / data-model.md:80 / tasks.md:29 は「足す」と読み替える
- **推奨アクション**: spec は SSoT なので、FR-014 の字面を「足す」に直す

### [Low] US-1 AC5「過去ログは実行中と同じ形」と FE-012 のテスト「過去ログと実行中で同じ DOM」が、data-model §1 (過去ログではサーバー名の一覧が空) と食い違う (L-105) (scope: feature) [H]

- **観察**: data-model.md:9-12 では、過去ログの `knownServers` は空である。そのため `mcp__a__b__c` は、実行中 (構成に `a__b` がある場合) は `a__b › c`、過去ログでは `a › b__c` に推定の印が付く。tasks.md:44 (FE-012) は「過去ログと実行中の fixture で同じ DOM」を求めている
- **推奨アクション**: FE-012 の観点を「`__` を含まない名前で同じ DOM。曖昧な名前は、過去ログでは推定の印になる」に分け、AC5 の「同じ形」を部品と見出しの構造の一致と読む旨を data-model §1 に書く

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `attention` (spec dir) / コンポーネント外からの `runningSessionStore` の読み取り | 4 / 0 | data-model.md:102 / tasks.md:58 / plan.md:149 / spec.md:130 / running-session-context.ts:18,21,26 |
| M-102 | `訂正: AD-048\|AD-047 に日付つきの訂正節\|proposed のうちに` | 5 | spec.md:209 / plan.md:155 / tasks.md:102 / AD-048:28 / .needs-input.md:6-8 |
| M-103 | `ConfigTab\|configTab\|'config'` / `\bconfig\b` (running-session-types) | 6 / 2 | data-model.md:87,148,150,156 / plan.md:149,222 / tasks.md:58,60 / running-session-types.ts:58,84 |
| L-101 | `利用者が決める` (AD-048) | 1 | AD-048:34 |
| L-102 | `slash commands` (ui charter / spec) | 3 | charter.md:50 / spec.md:77,212 |
| L-103 | `related_adrs` / `AD-048` (charters) | 0 (AD-048) | ui charter.md:7-23 / session charter.md:18,217 |
| L-104 | `値は数だけ` | 1 | transcript-context.ts:32 |
| L-105 | `同じ DOM\|knownServers` | 2 | tasks.md:44 / data-model.md:9 |
| L-106 | `固定テストを直す` | 1 | spec.md:209 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 6
- Round inheritance: resolved from R1: 16 (H-001 / H-002 / M-001〜M-006 / M-008 / M-009 / L-001〜L-006) / unresolved: 1 (M-007 の残りを M-103 として引き継いだ) / new: 8 (M-101 / M-102 / L-101〜L-106)
