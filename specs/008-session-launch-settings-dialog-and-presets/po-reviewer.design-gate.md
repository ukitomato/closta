# po-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 3

**Run**: 2026-09-30
**Reviewer**: po-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001〜017 (FR-017 は FR-003 の直後 spec.md:186) / SC-001〜010 (spec.md:304-335)。bundle に contracts/ data-model / quickstart / research は無い
- 関係する charter / Confirmation: session charter の Mission (charter.md:20-24)、Journey 2 (charter.md:72-78)、業務ルール (charter.md:110-113)、KPI「依存解決の正しさ」(charter.md:127)・「再利用率」(charter.md:128。人間の決定で O-3 へ繰越)。AD-016 (越境は警告のみ)、AD-020 §4 (dontAsk の拒否表示)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (FR-013 / FR-014 / FR-017 の述語は B に属する)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-041 (a)〜(h) は人間の決定を反映済み)
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:1 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: po の担当範囲外 (文言や見た目は ux-reviewer の担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

round 3 の bundle では、round 2 の po 指摘 6 件がすべて spec / plan / tasks に反映された。
- Provider リセット時の確認がダイアログ経路にも入った (US-2 AC3、US-3 AC3、FE-001、FE-004、FE-005、SH-022)。
- SDK が拒否したときは `launch-failed` に対応させ、入力は「最初の応答まで保持する」と決めた (spec.md:84-86)。
- US-4 の優先度の理由を直した (spec.md:141)。
- 同名判定の正規化 (trim + NFC) と、件数の上限 100 を入れた (spec.md:222-223)。
- 停止中ランタイムには再評価ボタンを付けた (spec.md:161、tasks.md:97)。
- 拒否の理由キーをログに出すようにした (tasks.md:77、plan.md:224)。

残る論点は 3 つ。いずれも Medium 以下である。
- M-102 を解消するために入れた「起動の確立 = 最初の応答」が、X-1 の起動の流れと噛み合っているかが定義されていない。X-1 では、最初のプロンプトを送った時点で起動する。
- US-4 の拒否経路のうち 2 つについて、理由キーが対応表に無い。
- プリセットの上限に達したときと、無効な config を保存しようとしたときの挙動が無い。

## Round 2 status

| ID | status | evidence path:line |
|---|---|---|
| M-101 (ダイアログ経路の Provider reset 確認 / US-3 AC3 との食い違い / 拒否時の Then) | resolved | spec.md:106-108, spec.md:126, spec.md:160, tasks.md:98, tasks.md:105, tasks.md:113, tasks.md:226, plan.md:237 |
| M-102 (SDK 拒否の理由キーと、入力を保って戻るタイミング) | resolved (理由キーは `launch-failed`、保持期間は「最初の応答まで」)。ただし「最初の応答」の定義は M-201 (new) で扱う | spec.md:84-86, tasks.md:76, tasks.md:99, tasks.md:114 |
| L-101 (US-4 の優先度の理由) | resolved | spec.md:141 |
| L-102 (同名判定の正規化 / 件数の上限) | resolved (上限に達したときの挙動は L-202 (new) で扱う) | spec.md:222-223, tasks.md:31, tasks.md:130 |
| L-103 (停止中ランタイムの blocker に次の一手が無い) | resolved (テストが無い点は L-203 (new) で扱う) | spec.md:161, tasks.md:97, tasks.md:104, plan.md:236 |
| L-104 (拒否の理由キーの記録) | resolved | tasks.md:77, plan.md:224 |

## Findings

### [Medium] 「起動の確立 = 最初の応答を受信」が X-1 の起動の流れ (最初のプロンプト送信で起動) と噛み合っておらず、ダイアログの閉じ方・待ち時間・応答が来ない場合が定義されていない (M-201) (scope: feature) [new]

- **観察**:
  - spec.md:86 は「ダイアログは起動が確立 (最初の応答を受信) するまで入力を保持する」としている。FE-001 (tasks.md:99) と plan.md:238 も同じである。
  - 一方、X-1 では起動の契機がプロンプトの送信である。「最初のプロンプトを送る → そのディストロ内でセッションが起動し、応答が逐次描画される」(specs/005-session-launch-and-streaming/spec.md:77-78)。
  - 本 spec には、次の 3 点が書かれていない。
    1. 最初のプロンプトをダイアログの中で入力するのか、ダイアログを閉じた後に composer で入力するのか。
    2. 「最初の応答」が何を指すのか。SDK の system/init メッセージか、assistant の最初のトークンか。
    3. 応答が来ない場合 (claude が hang する、長く思考する) に、入力をいつまで保持するのか。中断したときに入力を復元するのか。
  - FE-005 (tasks.md:114) の「起動後に SDK が拒否した `launch-failed` のケース」も、この定義が無いため Given 条件 (どの時点で失敗させるか) を 1 つに決められない。
- **同種事象探索**: `最初の応答|確立|timeout|タイムアウト` で 008 の spec/plan/tasks と 005 spec を検索し、008 側で 5 件ヒットした (spec.md:84, spec.md:86, plan.md:238, tasks.md:76, tasks.md:99)。タイムアウトや中断時の扱いは 0 件だった。
- **リスク/影響**:
  - 入力を「最初の応答」まで保持すると、ダイアログがプロンプト入力と長い応答待ちのあいだ開いたままになる。あるいは、閉じてから失敗したときに、どこへ「戻る」のかが分からない。
  - 誤った effort による拒否 (R-02) を、プロンプト送信前に検出できるのか、送信後なのかによって、利用者が見る流れがまったく変わる。
  - AC7 を Given-When-Then の 1 ケースに落とせない (PO-3)。
- **推奨アクション**:
  - US-1 AC7 の注記を、次の 3 点がわかる形に直す。
    1. 確立の判定に使うイベントを 1 つ決める。例えば、SDK の system/init の受信、または assistant の最初のメッセージの受信。
    2. ダイアログが閉じた後に失敗した場合の戻り先を決める。例えば、同じ入力を復元した状態でダイアログを再度開く。
    3. 確立前に利用者が中断したとき、および応答が来ないときの扱いを決める。例えば、中断したら入力を復元して戻る。
  - FE-005 の `launch-failed` のケースを、上で決めた確立イベントの前に失敗させる形で書く。
- **根拠**: spec.md:84-86 / specs/005-session-launch-and-streaming/spec.md:77-78 / plan.md:314 (R-02) / PO-3・PO-6
- **scope 根拠**: spec と tasks の文面で直せる

### [Low] US-4 の 2 つの拒否経路 (config-dir の変換不能 / helperPath の allowlist 外れ) が、AC7 の理由キー対応表に無い (L-201) (scope: feature) [new]

- **観察**:
  - US-4 AC2 (spec.md:152) と AC4 (spec.md:156)、FR-014 (spec.md:257) は「理由付きで起動を拒否」「理由キーで拒否」としか書いていない。
  - US-1 AC7 の対応表 (spec.md:80-84) を見ると、AC2 は「env 導出が null → `provider-unavailable`」に当たると読める。AC4 の helperPath の拒否は、どのキーに当たるか書かれていない。
  - FR-014 は、到達可能性の判定と起動で同じ分類関数を呼ぶと定めている (spec.md:258)。そのため、この Provider は起動時の再評価で「到達不可 → reset → `needs-confirmation`」になる可能性もある。どちらになるかが決まっていない。
- **リスク/影響**: 起動を拒否したときの文言が、実装者によって変わる。テストの期待値も一意に決まらない。
- **推奨アクション**: AC7 の対応表に、次の 2 行を足す。
  - config-dir の変換不能 → `provider-unavailable`
  - helperPath の分類失敗 → 到達可能性の判定で除外され、FR-006 の reset と確認に倒れる (起動時に選択済みだった場合は `needs-confirmation`)
- **根拠**: spec.md:80-84, spec.md:152, spec.md:156, spec.md:257-258 / PO-3

### [Low] プリセットが上限の 100 件に達したとき、および blocker や未確認の reset を含む config を保存しようとしたときの挙動が無い (L-202) (scope: feature) [new]

- **観察**:
  - FR-009 (spec.md:223) と BE-013 (tasks.md:130) は上限を 100 件としている。しかし 101 件目を保存しようとしたときの応答が書かれていない。拒否するのか、そのときの理由キーと文言は何か、が無い。
  - blocker を含む config (フォルダやランタイムが未選択) を保存できるかも、US-2 AC1 (spec.md:102) に書かれていない。未確認の Provider reset を含む config についても同じである。
- **リスク/影響**:
  - 上限に達すると、保存が黙って失敗するか、汎用エラーになるおそれがある。
  - 起動できない config がプリセットとして保存され、適用するたびに blocker になるおそれがある。
- **推奨アクション**:
  - FR-009 に「上限に達したら理由キー付きで保存を拒否し、削除を促す」を足す。
  - あわせて「保存できるのは folder と runtime が選択済みの config に限る (blocker があっても保存するなら、その旨を明記する)」を書く。
  - 上限の境界値 (100 件は保存できる / 101 件目は拒否) を `checkPreset` の単体テストに足す。
- **根拠**: spec.md:102, spec.md:222-223, tasks.md:130 / PO-4

### [Low] (H) 停止中ランタイムの再評価ボタンと、プリセット上限の境界に、検証するテストが無い (L-203) (scope: feature) [new]

- **観察**:
  - 再評価ボタンは Edge Case (spec.md:161) と FE-001 (tasks.md:97) で導入された。しかし FE-005 (tasks.md:108-116) と BE-020 (tasks.md:143-150) には「停止中 → 再評価 → blocker が解ける / 残る」のケースが無い。BE-020 には、停止中ランタイムが blocker になるケースしか無い。
  - プリセット上限の 100 件も、SH-020 (tasks.md:204-221) の単体テストの対象に入っていない。
- **リスク/影響**: round 2 の L-103 と L-102 で入れた復旧の流れと上限は、実装から抜けても検出されない。
- **推奨アクション**:
  - FE-005 に「再評価ボタン → facts を取り直し → blocker の状態が更新される」を 1 ケース足す。
  - SH-020 にプリセット上限の境界値テストを足す (L-202 と一緒に扱う)。
- **根拠**: reviewer-base H / PO-4・PO-6

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-201 | 最初の応答\|確立\|timeout\|タイムアウト (008 spec/plan/tasks + 005 spec) | 5 | spec.md:84, spec.md:86, plan.md:238, tasks.md:76, tasks.md:99 |
| L-201 | 理由付きで起動\|理由キーで拒否 (008 spec/plan/tasks) | 7 | spec.md:152, spec.md:156, spec.md:208, spec.md:257, spec.md:307, plan.md:217, tasks.md:72 |
| L-202 | 100 件\|件数上限 (008 spec/plan/tasks) | 2 | spec.md:223, tasks.md:130 |

Critical は 0 件なので、cascade_enforce で降格される指摘は無い。

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
- Round inheritance: resolved from 2: 6 (Medium 2 / Low 4) / unresolved: 0 / new: 4

対象ファイル:
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\spec.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\plan.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\tasks.md
- C:\dev\closta\specs\005-session-launch-and-streaming\spec.md
- C:\dev\closta\docs\domains\session\charter.md
