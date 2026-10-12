# po-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-10
**Reviewer**: po-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-006 / SC-001 (US-1: MCP の tool、`AskUserQuestion`、承認カード、状態の印 AC9)、FR-007〜FR-009 / SC-002・SC-003 (US-2: 構成のタブ、合流の規則、帯の印)、FR-010 / SC-003 (US-3: auth / plugin の行)、FR-011 / SC-005 (項目 16 の P3)、FR-012〜FR-015 / SC-004 (対応表・roadmap・記録)
- 該当する charter / Confirmation: ui charter の Mission と KPI「表示網羅」(charter.md:158-162)、In scope の composer の slash commands (:50)、右のペインのタブ (:70-77)、Journey 2 の承認カード (:113-118)、Open Questions の Tier C (:253-254)。AD-048 Decision 1〜5、AD-047 Decision 2、AD-046 (タブの表)、AD-036 Decision 4 / §4 P3、AD-035 Decision 1
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:4 Low:4
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux-reviewer / a11y-reviewer / ui-coverage-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0 (M-005 を E と重ねて数えた。H-001 の手当てについては、FE-012 / FE-013 に状態の 3 つの fixture があるので、退行を検出するテストはある)

## スコープ要約

commit a894690 で R2 の H-01〜H-03 と M-03 を直した後の bundle (spec / plan / tasks / data-model / research / quickstart) を見た。R2 で po が出した指摘のうち 3 件は直っている。
- H-001: US-1 AC9 (spec.md:113)、data-model §1「状態の印」(data-model.md:29)、FE-012 / FE-013 の状態の 3 つの fixture (tasks.md:48, :50) が入った
- M-001: 合流の規則 (data-model.md:88-94)、FR-008、AC4、FE-001 / FE-021 のテストが入った
- M-004: 着手の条件が 2 つになった (tasks.md:9-11)

一方、R2 の Medium 3 件 (M-002 / M-003 / M-005) と Low 3 件は文書が変わっておらず、残っている。新しい指摘は 2 件ある。1 件は、gate の R2 M-01 (analyze / arch が出した) が AC の testability として残っていること。もう 1 件は、合流の規則の初期条件に穴があること。

## Findings

### [Medium] 注意の印が畳んだ帯にしか出ない。右のペインを開いて「概要」や「使用量」を見ている間は、`failed` / `needs-auth` に気付けない (M-002) (scope: feature) — unresolved from prev (R2 po M-002 / gate M-04)

- **観察**: 印を出す場所は今も畳んだ帯だけである (data-model.md:111 の「畳んだ帯 (`RightPanel.tsx` の 40px の帯) は `attention` が true のタブのアイコンに印を出す」)。US-2 AC5 も「右のペインを畳んでいる」場合だけを扱う (spec.md:131)。FE-020 のテストも帯だけを見る (tasks.md:63)。ペインを開いているときの tablist の「構成」のタブについての記述は無い
- **同種事象探索**: `data-attention|注意の印` を spec / data-model / tasks で検索した。開いた tablist に印を出すと書いた箇所は 0 件
- **リスク/影響**: US-2 の Why は「`failed` / `needs-auth` に気付く手段が無い」である (spec.md:121)。ペインを開いて別のタブを見ている利用者には、その手段が無いまま残る
- **推奨アクション**: data-model §3 に「開いた tablist の『構成』のタブにも、選択していないときは同じ印を出す」を足す。出さないなら、その理由を書く。AC5 を「畳んでいる、または別のタブを選んでいる」に広げ、`RightPanel.tabs.test.tsx` に開いた状態を確かめる観点を足す
- **根拠**: PO-6、US-2 の Why
- **scope 根拠**: data-model §3、US-2 AC5、FE-020 の範囲

### [Medium] `needs-auth` / `failed` の案内に従った後、今のセッションのまま直るのかが書かれていない。アプリは再接続しない (U-2) (M-003) (scope: feature) — unresolved from prev (R2 po M-003 / gate M-05)

- **観察**: 案内の文言は変わっていない (data-model.md:109, :162-163)。直らないときの出口 (セッションを起動し直す、など) も書かれていない。quickstart V-3 (quickstart.md:20) の「案内どおりに認証して直るか」は記録の項目で、結果が出たときに誰がどう反映するかが無い。SH-014 (tasks.md:107) が roadmap に残す未確認の項目は「`needs-auth` の案内と `CLAUDE_CONFIG_DIR`」だけである。U-2 で `reconnectMcpServer` を呼ばない (spec.md:73) ので、今のセッションのまま直るかは実機で確かめていない推測である
- **同種事象探索**: `起動し直|再起動|次のセッション` を spec / data-model / quickstart で検索して 0 件
- **リスク/影響**: 回復の流れの出口がはっきりしない。案内どおりに認証しても印が消えないと、利用者は案内が間違っていると受け取る
- **推奨アクション**: `mcpNeedsAuth` / `mcpFailed` に「直らないときはセッションを起動し直してください」を添える (文言はポジティブリストの範囲)。V-3 に「同じセッションの次のターンで状態が変わるか」を明記し、結果を roadmap に残す項目に足す
- **根拠**: PO-6 (回復の流れ)
- **scope 根拠**: data-model §3 / §6、quickstart、SH-014 の範囲

### [Medium] decoder が `init-report` / `commands` を捨てると、タブに「最初のターンの後に出ます」が出続ける。捨てたことを示す観測点も無い (M-005) (scope: feature) — unresolved from prev (R2 po M-005 / gate M-06)

- **観察**: `initReport` が無いときの文言は今も `configAwaitFirst` である (data-model.md:110, :159)。decoder は形が合わないと null を返す (tasks.md:31, :35)。捨てた回数や log は data-model / tasks のどこにも定めていない。`omitted` が数えるのは、要素を落としたときだけである (data-model.md:106)
- **同種事象探索**: `log|ログ|観測|捨てた` を data-model / tasks で、構成の decoder の文脈に絞って検索して 0 件
- **リスク/影響**: SDK の版上げで `init` の形が変わると、タブはずっと誤った空の状態のままになる。開発者には原因を追う手掛かりが無い (H: observability)
- **推奨アクション**: decoder が捨てた回数を `meters` か既存の観測点に残す。1 回以上捨てたら、空の文言を「構成を読めませんでした」に切り替える。FE-001 / FE-021 に、その観点のテストを足す
- **根拠**: PO-4 (異常な入力)、PO-7 (開発者の視点)、reviewer-base H
- **scope 根拠**: data-model §2 / §3 / §6、FE-001 / FE-021 の範囲

### [Medium] US-1 AC5「過去ログでも実行中と同じ形」と FE-012 の「同じ DOM」が、data-model §1 の過去ログの `knownServers` が空という規則と両立しない。AC をそのままテストに落とせない (M-006) (scope: feature) — new (po として新しい。gate R2 M-01 (origin analyze / arch) は unresolved のまま)

- **観察**: 過去ログでは `knownServers` が空である (data-model.md:9, :12「過去ログ (`ChatScreen`) は購読元が null で空」)。空のときは最初の `__` で分け、`inferred: true` になる (data-model.md:19、spec.md:108 の AC4「構成が無い…ときは…推定の印」)。したがって `mcp__github__create_issue` は、過去ログでは推定の印が付き、実行中は付かない。一方 AC5 (spec.md:109) は「実行中と同じ形で出る」とし、FE-012 のテスト (tasks.md:48) は「過去ログと実行中の fixture で同じ DOM」とする
- **同種事象探索**: `同じ DOM|実行中と同じ形|過去ログ.*空` で 4 件 (spec.md:109、tasks.md:48、data-model.md:9, :12)
- **リスク/影響**: テストを書く人が、AC と data-model のどちらかを破ることになる。過去ログのすべての MCP の呼び出しに「サーバー名は推定」が付くことが利用者に意図された形なのかも決まっていない (Journey 1 の読みやすさ)
- **推奨アクション**: どちらかに決める。(a) AC5 を「サーバー名の推定の印を除き、実行中と同じ形」に直し、FE-012 の比較から推定の印を外す。(b) 過去ログでは `__` を 1 つしか含まない名前に印を付けない、と data-model §1 に足す
- **根拠**: PO-3 (AC testability)、ui charter Journey 1
- **scope 根拠**: spec US-1、data-model §1、FE-012 の範囲

### [Low] 「最初のターンの後に出ます」は事実と合わない。`init` はターンの開始時に届く (L-001) (scope: feature) — unresolved from prev (R2 po L-001 / gate L-09)

- **観察**: data-model.md:110 と :159 の文言、research.md:18 の「at the start of each turn」
- **推奨アクション**: 「最初のターンが始まると出ます」に直す

### [Low] 承認カードが出ない権限モードの場合と、拒否した後の流れが確かめられていない (L-002) (scope: feature) — unresolved from prev (R2 po L-002 / gate L-10)

- **観察**: 注記は承認カードにしか出ない (spec.md:112, :166)。quickstart V-3 の `AskUserQuestion` の項目 (quickstart.md:23) は、tool_result の中身を記録するだけである。権限モードによってカードが出るかどうかと、拒否した後に Claude がどう進むかは、確かめる項目に入っていない
- **推奨アクション**: V-3 に上の 2 点を記録する項目を足す

### [Low] Q2 (composer をめぐる system-scope の 2 項目を入れない) の不利益が、spec の「義務の扱い」に書かれていない (L-003) (scope: feature) — unresolved from prev (R2 po L-003 / gate L-11)

- **観察**: 不利益は `.needs-input.md:16` にだけ書かれている (「O-5 で右のペインを開いたまま会話を見る場面が増えるので、フォーカスの奪取の害は O-5 の後に大きくなる」)。spec.md:59-60 には入れない理由しかない
- **推奨アクション**: 該当の行に、不利益を 1 文足す

### [Low] 合流の規則が「`commands` が最初の `init-report` より先に届く」場合を定めていない。直前の `initReport` が無ければ出所が `init-report` に変わり、`commands` だけにある名前が一覧から消える (L-004) (scope: feature) — new

- **観察**: data-model.md:90 は「直前の `initReport` が無いときだけ出所を `init-report` にする」とし、その時点で `commands` が既にあるかを見ていない。FE-001 / FE-021 のテスト (tasks.md:35, :65) にも、この順序は無い。実際にこの順序で届くかどうかは確かめていない (SDK の挙動は推測)
- **推奨アクション**: 規則 1 に「`commands` を既に受けているなら、最初の `init-report` でも名前の集合が `commands` と同じときは出所を変えない」などと書くか、この順序は起こらない根拠を書く。FE-001 にこの順序の観点を足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-002 | `data-attention\|注意の印` (開いた tablist の文脈) | 0 | 対比: data-model.md:111 / spec.md:131 / tasks.md:63 |
| M-003 | `起動し直\|再起動\|次のセッション` | 0 | — |
| M-005 | `log\|ログ\|観測\|捨てた` (decoder の文脈) | 0 | — |
| M-006 | `同じ DOM\|実行中と同じ形\|過去ログ.*空` | 4 | spec.md:109 / tasks.md:48 / data-model.md:9,12 |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 4
- Round inheritance: resolved from 2: 3 (H-001, M-001, M-004) / unresolved: 6 (M-002, M-003, M-005, L-001, L-002, L-003) / new: 2 (M-006 (gate M-01 が残ったもの), L-004)
