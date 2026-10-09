# po-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-09
**Reviewer**: po-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-006 / SC-001 (US-1: MCP の tool・AskUserQuestion・承認カード)、FR-007〜FR-009 / SC-002・SC-003 (US-2: 構成のタブ・帯の印)、FR-010 / SC-003 (US-3: auth / plugin の行)、FR-011 / SC-005 (項目 16 の P3)、FR-012〜FR-015 / SC-004 (対応表・roadmap・記録)
- 該当する charter / Confirmation: ui charter Mission・KPI「表示網羅」(charter.md:160-162)、In scope の composer の slash commands (:50)、Journey 2 の承認カード (:113-118)、右のペインのタブ (:70-77)、Open Questions の Tier C (:253-254)。AD-048 Decision 1〜5、AD-047 Decision 2、AD-046 (タブの表)、AD-036 Decision 4 / §4 P3
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:4 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux-reviewer / a11y-reviewer / ui-coverage-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

main (faafe91) に載せ直した O-5 の design (spec / plan / tasks / data-model / research / quickstart) を見た。R1 の po の指摘 (H-001〜H-003、M-001〜M-007、L-001〜L-004) は spec の AC6〜AC8 (US-1)、AC5〜AC7 (US-2)、U-4〜U-6、data-model §3 / §6、quickstart V-3 で手当てされている。今回の新しい指摘は 3 種類ある。(1) MCP の tool を ToolFallback から専用の表示に移すと、今出ている tool の状態 (結果待ち・承認待ち・中断) を失う恐れがあり、それを確かめる AC とテストが無い。(2) 構成のタブの一覧が 2 つの出所の後勝ちで、出所によって表示の中身が変わる。(3) 回復の流れと着手の条件の文面が食い違っている。

## Findings

### [High] MCP の tool と `AskUserQuestion` を ToolFallback から専用の表示に移すのに、結果待ち・承認待ち・中断の状態の AC とテストが無い。今の表示から状態が消えても SC-001 では検出されない (H-001) (scope: feature)

- **観察**: 今の ToolFallback は tool の状態ごとに見た目を変えている。`incomplete` と `requires-action` にアイコンを割り当て (`src/renderer/src/components/assistant-ui/elements/tool-fallback.aui.tsx:97-98`)、中断 (`status.reason === "cancelled"`) を見分け (:142, :294-302, :704-705)、経過時間を出す (:113)。O-4 の経過時間は `ToolResultMarks` の `pending` が true のときだけ出る (`tool-result-marks.tsx:49`)。一方 spec の US-1 AC1〜AC8 (`spec.md:105-112`) と data-model §1「中身」(`data-model.md:28`) が定めるのは、入力・結果・エラー・切り詰めだけである。FE-012 / FE-013 のテストの観点 (`tasks.md:44`, `:46`) にも結果待ち・承認待ち・中断の状態が無い
- **同種事象探索**: `中断|cancelled|incomplete|結果待ち|経過時間|requires-action` を spec / plan / tasks / data-model / quickstart で検索して、tool の状態としての出現は 0 件 (plan.md:29 の「経過時間と同じ」は購読の形の話)
- **リスク/影響**: MCP の tool は Tier A で、呼び出しはすべて新しい表示に移る。結果が来ない長い MCP の呼び出しで「動いているのか止まったのか」が分からなくなる。中断した呼び出しが成功と同じ見た目になる。どちらも O-4 で入れた振る舞いの退行だが、SC-001 の計測経路 (名前の純関数・component テスト) では捕まらない
- **推奨アクション**: US-1 に AC を 1 つ足す。「**Given** 結果がまだ無い MCP の tool (実行中) / 承認待ち / 中断された呼び出し、**When** 見る、**Then** ToolFallback と同じ状態の印 (経過時間・承認待ち・中断) が出る」。`AskUserQuestion` の読み取り専用の表示にも同じものを足す。data-model §1「中身」に「状態の印は ToolFallback / `ToolResultMarks` と同じ」と書き、FE-012 / FE-013 のテストに 3 つの状態の fixture を足す
- **根拠**: PO-4 (異常系)、PO-3、ui charter Journey 2 (:113-118)
- **scope 根拠**: spec の US-1 と data-model §1、tasks の FE-012 / FE-013 の範囲

### [Medium] スラッシュコマンドの一覧が `init-report` と `commands` の後勝ちなので、次のターンの `init` で説明と `argumentHint` が消える。しかも消えるかどうかが、無関係な変化 (MCP の状態など) で決まる (M-001) (scope: feature)

- **観察**: スラッシュコマンドの一覧は `init-report.slashCommands` (名前だけ。`data-model.md:50`) と `commands` (名前・説明・`argumentHint`。:52) の後勝ちである (:85、spec FR-008 `spec.md:191`、US-2 AC4 `spec.md:129`)。ところがタブの節は「名前・`argumentHint`・説明」を出すと定めていて (`data-model.md:95`)、出所が `init-report` のときに何を出すかが無い。さらに `init-report` は値の全体が前回と違うときだけ送られる (`data-model.md:79`)。MCP サーバーの状態が 1 つ変わっただけで `init-report` が送られ直し、コマンドの一覧が名前だけに戻る
- **同種事象探索**: `後勝ち|後に届いた` で 4 件 (spec.md:129, :191、data-model.md:85、tasks.md:31, :61)。どれも出所による表示の違いには触れていない
- **リスク/影響**: 一覧の中身がターンごとに増えたり減ったりし、利用者からは理由が見えない。AC4 の「置き換わる」は満たしたまま、情報が減る
- **推奨アクション**: 次のどちらかに決めて data-model §2 / §3 と US-2 AC4 に書く。(a) 名前が同じものは `commands` の説明を残し、`init-report` は名前の集合だけを更新する。(b) 出所が `init-report` のときは説明の列を出さない、と表示の形として明記する。FE-021 のテストに「`commands` の後に、MCP の状態だけが違う `init-report` が来る」場合を足す
- **根拠**: PO-3 / PO-6
- **scope 根拠**: data-model §2 / §3 と US-2 の範囲

### [Medium] 注意の印は畳んだ帯にしか出ない。右のペインを開いて「概要」や「使用量」を見ている間は、MCP の `failed` / `needs-auth` に気付けない (M-002) (scope: feature)

- **観察**: data-model §3 は「畳んだ帯 (`RightPanel.tsx` の 40px の帯) は `attention` が true のタブのアイコンに印を出す」とだけ書いている (`data-model.md:102`)。AC5 も畳んだときだけを扱う (`spec.md:130`)。ペインを開いているときのタブは別の描画で (`src/renderer/src/features/shell/RightPanel.tsx:98-129` の `role="tab"`)、そこへの印の扱いは書かれていない。FE-020 のテスト (`tasks.md:59`) も帯だけを見る
- **同種事象探索**: `data-attention|注意の印` で 6 件 (spec.md:127, :130、data-model.md:99, :102、tasks.md:58, :59)。開いたときのタブを扱うものは 0 件
- **リスク/影響**: US-2 の Why (`spec.md:120`) は「`failed` / `needs-auth` に気付く手段が無い」ことである。ペインを開いて別のタブを見ている利用者は、気付く手段が無いまま残る
- **推奨アクション**: data-model §3 に「開いたときの tablist の『構成』のタブにも同じ印を出す (選択中でないとき)」を足すか、出さない理由を書く。US-2 AC5 を「畳んでいる、または別のタブを選んでいる」に広げ、`RightPanel.tabs.test.tsx` に開いた状態の観点を足す
- **根拠**: PO-6、US-2 の Why
- **scope 根拠**: data-model §3 と FE-020 の範囲

### [Medium] `needs-auth` / `failed` の案内のあとに、今のセッションが直るのかが書かれていない。アプリは再接続しない (U-2) ので、直るには起動し直しが要る可能性がある (M-003) (scope: feature)

- **観察**: 案内の文言は「このセッションを起動した環境で claude を開き、/mcp で認証してください…」である (`data-model.md:100`, `:153-154`)。U-2 でアプリは `reconnectMcpServer` を呼ばない (`spec.md:73`)。状態はターンの開始時点の値なので、案内に従ったあとも、実行中のセッションの MCP サーバーが接続し直されるとは限らない。plan RK-05 (`plan.md:174`) と quickstart V-3 (`quickstart.md:20`) は `CLAUDE_CONFIG_DIR` の違いだけを確かめる項目で、「今のセッションのまま直るか」は確かめない。今のセッションのまま直らないという点は、実機では確かめていない推測である
- **同種事象探索**: `起動し直|再起動|次のセッション` を spec / data-model / quickstart で検索して 0 件
- **リスク/影響**: 回復の流れの出口がはっきりしない。案内どおりに認証しても印が消えず、利用者は案内が間違っていると受け取る
- **推奨アクション**: quickstart V-3 に「認証のあと、同じセッションの次のターンで状態が変わるか」を記録する項目を足す。案内の文言には「直らないときはセッションを起動し直してください」を添える (文言はポジティブリストの範囲)
- **根拠**: PO-6 (回復の流れ)、R1 M-003 の残り
- **scope 根拠**: data-model §3 / §6 と quickstart の範囲

### [Medium] 着手の条件が文書によって食い違っている。tasks は「design-gate の PASS」だけを条件にしているが、spec / plan / `.needs-input.md` は「Q1〜Q3 の回答まで design-gate で止める」としている (M-004) (scope: feature)

- **観察**: `tasks.md:9` は着手の条件を「design-gate の PASS (status `implementing`)」とし、Q1〜Q3 は「A 以外の回答なら直す」としか書いていない。一方 `.needs-input.md:10`, `:18`, `:28` の 3 問はどれも「O-5 は design-gate で止める」とし、`plan.md:170` (RK-01) も同じである
- **同種事象探索**: `design-gate で止める` で 4 件 (.needs-input.md:10, :18, :28、plan.md:170)。tasks.md には 0 件
- **リスク/影響**: gate が PASS すると status は `implementing` に進む。tasks だけを読む implementer は、未承認の 3 点 (Q3 は監視ビューに印を出さないという UX の判断を含む) が決まる前に実装を始めてしまう
- **推奨アクション**: `tasks.md:9` の着手の条件に「`.needs-input.md` Q1〜Q3 の回答 (利用者)」を足す。plan RK-01 と字面を揃える
- **根拠**: PO-5 (判断の採否)、AGENTS.md の gate の原則
- **scope 根拠**: tasks.md の範囲

### [Medium] 構成の decoder が値を捨てたとき、タブには「最初のターンの後に出ます」が出続ける。原因を追うための観測点も無い (M-005) (scope: feature)

- **観察**: `initReport` が無いときの表示は「最初のターンの後に出ます」(`data-model.md:101`, `:150`) である。decoder は形が合わないと null を返し (`tasks.md:27`, `:31`)、捨てられた `init-report` は保持されない。捨てたことを示す log や計数は data-model / tasks のどこにも無い。省いた数 (`omitted`) が出るのは、要素を落としたときだけである
- **同種事象探索**: `log|ログ|観測` を data-model / tasks で検索して、構成の decoder に当たるもの 0 件 (tasks.md:57 は emit の文字列の検査)
- **リスク/影響**: SDK の版が上がって形が変わったときに、構成のタブが何ターン経っても「最初のターンの後に出ます」のままになる。利用者には誤った空の状態が見え、開発者には原因の手掛かりが無い (H: observability)
- **推奨アクション**: decoder が `init-report` / `commands` を捨てた回数を、稼働中のストアか既存の観測点 (O-4 の decoder の扱い) に残す。1 回以上捨てたら、タブの空の文言を「構成を読めませんでした」に切り替える。FE-001 / FE-021 にその観点のテストを足す
- **根拠**: PO-4 (異常系の入力)、PO-7 (開発者の視点)、reviewer-base H
- **scope 根拠**: data-model §2 / §3 と FE-001 / FE-021 の範囲

### [Low] 「最初のターンの後に出ます」は事実と合わない。`init` はターンの開始時に届く (L-001) (scope: feature)

- **観察**: `data-model.md:150` の文言と、`research.md:18` の「Session metadata the CLI emits at the start of each turn」
- **推奨アクション**: 「最初のターンが始まると出ます」に直す

### [Low] 承認カードが出ない場面 (権限モードによっては `canUseTool` が呼ばれない可能性) と、拒否したあとの流れが Edge Cases に無い (L-002) (scope: feature)

- **観察**: 注記は承認カードにしか出ない (`spec.md:112`, `:165`)。権限モードによってカードが出ないかどうかは、SDK の挙動を確かめていない推測である。拒否したあと、本文で答えるには実行中に composer に積むことになり、Claude がそれを読む前に推測で進む恐れがある
- **推奨アクション**: quickstart V-3 の `AskUserQuestion` の項目に「権限モードを替えたとき承認カードが出るか」と「拒否したあと Claude がどう進むか」を記録する項目を足す

### [Low] Q2 (composer をめぐる system-scope の 2 項目を入れない) の不利益が spec の「義務の扱い」に書かれていない (L-003) (scope: feature)

- **観察**: `.needs-input.md:16` には「O-5 のあとは、右のペインを開いたまま会話を見る場面が増えるので、フォーカスの奪取の害が大きくなる」とある。spec の「義務の扱い」(`spec.md:59-60`) には入れない理由だけが書かれ、この不利益が書かれていない
- **推奨アクション**: 「義務の扱い」の該当行に不利益を 1 文足し、利用者が Q2 を判断する材料を spec の側にも残す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `中断\|cancelled\|incomplete\|結果待ち\|経過時間\|requires-action` (spec dir の 5 文書) | 0 (tool の状態として) | 対比: tool-fallback.aui.tsx:97-98,113,142,294-302,704-705 / tool-result-marks.tsx:49 |
| M-001 | `後勝ち\|後に届いた` | 4 | spec.md:129,191 / data-model.md:85 / tasks.md:31,61 |
| M-002 | `data-attention\|注意の印` | 6 | spec.md:127,130 / data-model.md:99,102 / tasks.md:58,59 |
| M-003 | `起動し直\|再起動\|次のセッション` | 0 | — |
| M-004 | `design-gate で止める` | 4 | .needs-input.md:10,18,28 / plan.md:170 (tasks.md には 0) |
| M-005 | `log\|ログ\|観測` (decoder の文脈) | 0 | — |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 3
- Round inheritance: resolved from 1: 14 (H-001〜H-003、M-001〜M-007、L-001〜L-004。M-003 は一部が新しい M-003 に残る) / unresolved: 0 / new: 9
