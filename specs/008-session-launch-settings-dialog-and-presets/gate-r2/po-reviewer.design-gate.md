# po-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 2

**Run**: 2026-09-30
**Reviewer**: po-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜017 (FR-017 は FR-003 の直後 spec.md:177) / SC-001〜010 (spec.md:277-302)。bundle に contracts/ data-model / quickstart / research は無い
- 関係する charter / Confirmation: session charter の Mission (charter.md:20-24)、Journey 2 (charter.md:72-78)、業務ルール (charter.md:110-113)、KPI「依存解決の正しさ」(charter.md:127)・「再利用率」(charter.md:128。人間の決定により O-3 へ繰越)。AD-016 (越境は警告のみでブロックしない)、AD-020 §4 (dontAsk の拒否表示)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (FR-017 の文字種 allowlist、FR-014 は B に属する)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-041 (a)〜(h) の範囲は人間の決定を反映済み)
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:2 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: po の担当範囲外 (空状態の文言や見た目は ux-reviewer の担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

round 2 の bundle で、次の点が round 1 から変わった。

- env の配送は、アプリが実名キーで `WSLENV` を生成し `--exec` で起動する方式に決まった (FR-013)。
- aws-assume-role の helper 生成は X-7 へ移した (spec.md:39, 332)。
- KPI 再利用率の計測は O-3 へ移した (spec.md:339)。
- folder / runtime は必須軸になり、既定を持たない (FR-001 spec.md:169)。
- Provider が既定に戻ったときは、起動前に確認する (US-2 AC3 / FR-006)。
- 起動失敗時の出口 (US-1 AC7)、dontAsk の AC (US-1 AC6)、空状態 (spec.md:157)、プリセット名の検証と同名上書き (FR-009) が入った。
- renderer 単体 (FE-005) と E2E 3 本 (SH-022) が入った。

round 1 の High 4 件はすべて解消した。残る論点は次の 2 点。

- 新たに入れた「Provider リセット時の確認」が、ダイアログ経路のタスクとテスト、US-3 AC3 に行き渡っていない。
- AC7 のうち「SDK が起動を拒否」の分岐が検証できる形になっていない。

## Round 1 status

| ID | status | evidence path:line |
|---|---|---|
| H-001 (KPI 再利用率に SC・計測経路が無い) | resolved (人間の決定で O-3 へ繰越。roadmap への登録義務あり) | spec.md:339, tasks.md:166, plan.md:138 |
| H-002 (folder / runtime の「既定」が意味を持たない) | resolved | spec.md:169, spec.md:98, spec.md:152, spec.md:197, tasks.md:45-47 |
| H-003 (Provider が既定のとき何で起動するかが無く、確認も無い) | resolved (プリセット経路)。ダイアログ経路の残りは M-101 (new) で扱う | spec.md:99, spec.md:198, tasks.md:65, tasks.md:116 |
| H-004 (R-01 不成立時の代替が無く、SC-007 が単体テストだけ) | resolved (helper 生成を X-7 へ移し、SC-007 を env 配送に置き換えて quickstart で実機観測する) | spec.md:39, spec.md:295-297, spec.md:332, tasks.md:187 |
| M-001 (X-3 の ID と衝突) | resolved | tasks.md:12, spec.md:36-37 |
| M-002 (SC-008 に UI テストが無い) | resolved | spec.md:298, tasks.md:133-135 |
| M-003 (dontAsk の AC) | resolved | spec.md:76-78, tasks.md:87, tasks.md:185 |
| M-004 (起動失敗時の出口) | resolved (SDK 拒否の分岐は M-102 (new) で扱う) | spec.md:79, tasks.md:81 |
| M-005 (空状態 / プリセット名) | resolved | spec.md:157, spec.md:212-213 |
| M-006 (上限 / セッション名の宛先) | resolved | spec.md:336-337, roadmap.md:188 |
| M-007 (renderer 単体 / プリセット E2E) | resolved | tasks.md:89-96, tasks.md:182 |
| M-008 (カタログ切替の E2E) | resolved | spec.md:277, tasks.md:180 |
| L-001 (US-3 の優先度) | resolved | spec.md:106 |
| L-002 (SC-003 の計測経路に人によるレビュー) | resolved | spec.md:282 |
| L-003 (実行中セッションのスナップショット) | resolved | tasks.md:177 |

## Findings

### [Medium] 「Provider が既定に戻ったら起動前に確認する」がダイアログ経路のタスク・文言・テストに無く、US-3 AC3 と食い違う (M-101) (scope: feature) [new]

- **観察**:
  - FR-006 (spec.md:198) は、Provider が既定に戻る場合をすべて「起動前に確認」としている。BE-020 (tasks.md:124) も、ランタイム変更で到達不可になった Provider の既定化を「確認要」としている。一方、ダイアログ本体の FE-001 (tasks.md:78-81) は「reset を通知し、blocker なら起動ボタンを無効」とするだけで、確認の手順が無い。確認を持つのは PresetPanel の FE-010 (tasks.md:116) だけである。
  - 確認で何を見せるかも書かれていない。既定 Provider が「X-1 の curated base のみ」(tasks.md:65) で起動すること、つまり distro 側の claude が持つ資格情報を使うことを伝える文言が無い。FE-004 の文言一覧 (tasks.md:84-88) にも無い。
  - US-3 AC3 (spec.md:117) は「上流変更で下流が既定に戻った → 起動すると戻った値で起動され」としており、Provider の場合に確認を挟むことと矛盾する。
  - US-2 AC3 (spec.md:99) には、利用者が確認を拒んだときの Then が無い。
  - FE-005 (tasks.md:89-96)、SH-020、SH-022 (tasks.md:179-182) のどれにも「Provider reset → 確認 → 承認/拒否」のケースが無い。
  - main 側の `needs-confirmation` (tasks.md:67) は、renderer が既に null を送れば発火しない。したがって確認が実際に効くかは renderer の実装とテストだけで決まる。
- **同種事象探索**: `確認|requiresConfirmation|needs-confirmation` で spec / plan / tasks を検索した。Provider リセット時の確認に当たる記述は spec.md:99, 151, 198、plan.md:158, 195, 197, 220、tasks.md:46, 63, 67, 116, 124 にあり、ダイアログ本体 (FE-001) とテストのタスク (FE-005 / SH-022) には 0 件だった。
- **リスク/影響**: ランタイムを変えると Provider が黙って既定に戻る。利用者は通知を見落とすと、業務用 Provider のつもりで distro 既定の資格情報・課金先のまま起動する。round 1 の H-003 と同じリスクがダイアログ経路に残る。確認の分岐を検証するテストが無いので、実装が抜けても検出できない。
- **推奨アクション**:
  - FE-001 に「provider の reset (`requiresConfirmation`) があれば、起動時に確認する」を足す。FE-004 に確認の文言を足す。文言は、既定 Provider で起動すると distro の claude の既定資格情報が使われることを伝える。
  - US-3 AC3 を「provider 以外の軸は戻った値で起動し、provider は US-2 AC3 の確認を経る」に直す。
  - US-2 AC3 に「拒否したらダイアログに戻り、Provider 軸は未確定のまま」の Then を足す。
  - FE-005 に確認の承認・拒否の 2 ケースを足す。SH-022 のプリセット E2E に、削除済み Provider を含むプリセットのケースを 1 つ足す。
- **根拠**: FR-006 (spec.md:198) / US-2 AC3 (spec.md:99) / US-3 AC3 (spec.md:117) / PO-3・PO-4・PO-6
- **scope 根拠**: spec と tasks の文面で直せる

### [Medium] US-1 AC7 の「SDK が起動を拒否」の分岐に、理由キーの対応と「入力を保って戻る」タイミングが無く、検証できない (M-102) (scope: feature) [new]

- **観察**:
  - US-1 AC7 (spec.md:79) は失敗源を 4 つ挙げ、すべてに「理由キーの文言を表示し、ダイアログは入力を保ったまま戻る」を求めている。4 つは、env 導出が null、main の再検証で無効、実行中セッションあり、SDK の拒否である。
  - 新たに足す理由キーは `invalid-config` / `provider-unavailable` / `needs-confirmation` の 3 つ (tasks.md:67) で、既存に `session-active` (src/main/app/session-launch-service.ts:63) がある。SDK の拒否 (plan.md:261 R-02。手入力した対応 effort が誤っている場合など) が既存の `LaunchFailureReason` (src/domain/session/agent-session.ts:23-32。`launch-failed` / `provider-error` など) のどれに対応するかは、どこにも書かれていない。
  - SDK の拒否は agents 側の `query()` 開始後に起こりうる。その時点でダイアログがまだ開いているのか (入力を保って戻れるのか) は定義されていない。
  - FE-005 (tasks.md:94) は「失敗理由の表示と入力保持」を一般形で書いているだけで、SDK 拒否のケースを持たない。
- **同種事象探索**: `SDK が起動を拒否|R-02|launch-failed|provider-error` で検索し、spec.md:79 と plan.md:261 の 2 件だった。対応する理由キーやテストの記述は 0 件。
- **リスク/影響**: R-02 のとおり、手入力カタログで effort を誤入力するのは起こりうる経路である。SDK が拒否すると、利用者には意味の分からない汎用エラーが出るか、入力が失われて最初から選び直すことになる。AC を 1:1 のテストケースに落とせない。
- **推奨アクション**:
  - AC7 の SDK 拒否の分岐について、どの理由キーに対応するかを明記する (既存の `launch-failed` を使う、または新しいキーを足す)。
  - 失敗を検出した時点でダイアログ (または起動前の入力) に戻れることを明記する。
  - FE-005 に「起動後に SDK が拒否した → 理由の文言 + 入力を復元」の 1 ケースを足す。
- **根拠**: spec.md:79 / plan.md:261 / PO-3・PO-6
- **scope 根拠**: spec と tasks で直せる

### [Low] US-4 を P2 とする理由 (「US-1 は既定 Provider で先に成立する」) が、US-1 AC5 と BE-009 の置き場所に合わない (L-101) (scope: feature) [new]

- **観察**:
  - spec.md:132 は「US-1 の起動が既定 Provider で先に成立するので P2」としている。
  - しかし US-1 AC5 (spec.md:75) は「X-3 の導出 env と settings で起動」を P1 の受け入れ条件にしている。
  - env を distro へ届ける `composeLaunchEnv` と `--exec` 化 (BE-009, tasks.md:71-75) も US-1 に置かれている。
  - US-1 AC5 は fake launcher でしか検証せず、導出 env が distro に届くことの観測は SC-007 (US-4 側) の quickstart にしか無い。
- **リスク/影響**: P1 だけを先に出す判断をした場合、利用者は Provider を選べるのに、env が distro へ届いたことを誰も観測していない状態になる。
- **推奨アクション**: US-4 の優先度の理由を「env の配送は US-1 (BE-009) に含まれ、US-4 は config-dir と helperPath の分類を担う」に直す。あるいは、SC-007 の quickstart leg を US-1 の完了条件に含める。
- **根拠**: PO-5

### [Low] 同名の判定の正規化とプリセット件数の上限が書かれていない (L-102) (scope: feature) [new]

- **観察**: FR-009 (spec.md:212-213) は「表示名と同じ述語」と「同名は上書き確認」を定めている。しかし「同名」をどう判定するかが無い。前後の空白、全角と半角、NFC と NFD (日本語入力で起こる) を同一とみなすかどうかである。`presets.json` の件数上限も無い (BE-011, tasks.md:104)。
- **リスク/影響**: 見た目が同じ名前のプリセットが複数でき、上書き確認をすり抜ける。
- **推奨アクション**: 同名判定の正規化 (trim + NFC など) と件数の上限を FR-009 に書き、`checkPreset` の境界値テストに入れる。
- **根拠**: PO-4

### [Low] 停止中のランタイムが原因の blocker に、次の一手が示されない (L-103) (scope: feature) [new]

- **観察**: 空状態には「次の一手 (登録画面への導線)」がある (spec.md:157)。一方、プリセット適用後にランタイムが停止中だった場合の blocker (spec.md:152) は「理由を示す」だけである。アプリは distro を起動しないため (R-1 の決定。charter.md:125)、利用者が自分で起動するしかない。その手順も、再評価の方法 (再読込か自動検出か) も書かれていない。
- **推奨アクション**: blocker の文言 (FE-004) に「distro を起動してから再評価」の次の一手を入れ、再評価のきっかけ (再読込ボタンなど) を明記する。
- **根拠**: PO-6 (復旧の流れ)

### [Low] (H) 起動の拒否・失敗の理由キーが UI 表示だけで、サポートが原因を追える記録が無い (L-104) (scope: feature) [new]

- **観察**: 起動が拒否されたときの理由キー (tasks.md:67) は message に値を含めない方針で、表示先は UI だけである (tasks.md:81)。拒否の理由をローカルログなどに記録するタスクは、plan.md にも tasks.md にも無い。KPI の計測は O-3 へ移したが、障害の調査は別の用途である。
- **リスク/影響**: 「起動できない」という問い合わせに対し、利用者の画面を見る以外に原因 (provider-unavailable か needs-confirmation か distro-mismatch か) を特定する手段が無い。
- **推奨アクション**: 拒否の理由キー (値は含めない) を既存のログ経路に 1 行出すことを BE-006 に足す。O-3 に委ねるなら、その旨を Out of Scope に書く。
- **根拠**: reviewer-base H (observability) / PO-7

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | 確認\|requiresConfirmation\|needs-confirmation (spec/plan/tasks、Provider リセット関連) | 12 | spec.md:99, spec.md:151, spec.md:198, plan.md:158, plan.md:195, plan.md:197, plan.md:220, tasks.md:46, tasks.md:63, tasks.md:67, tasks.md:116, tasks.md:124 |
| M-102 | SDK が起動を拒否\|R-02 | 2 | spec.md:79, plan.md:261 |

(Critical は 0 件なので、cascade_enforce による降格の対象は無い)

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Round inheritance: resolved from 1: 15 (High 4 / Medium 8 / Low 3) / unresolved: 0 / new: 6
