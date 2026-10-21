# po-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/021-session-resume/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-008 がすべて本 feature の範囲。E の観点で特に見たもの: FR-001/002/005/006/007/009/010/011/012/013、SC-001/004/005/006/007
- touched files に該当する charter / Confirmation: session charter の Journey 4 (`charter.md:121-128`)、業務ルール「再開時の軸の引き継ぎ」(`:182`)、KPI「再利用率」の計測経路の注記 (`:207-221`)、O-7 の close の読み方 (`:277-279`)。AD-059 (proposed) の Confirmation (V-1 / V-3 / V-4)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (UUID の検査の境界は data-model §1.1 にある)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲 (KPI の計測規則とのずれは E の H-002 として出した)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:6 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: E の範囲外 (empty / error state の文言の細部は ux-reviewer)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

X-9 は、過去の区画の行と、稼働中の区画の終了済み・失敗した行から、Agent SDK の `resume` で会話を再開できるようにする。フォルダ / ランタイム / Provider は元の会話から引き継いで変えられない。モデル / effort / 権限モードは、起動ダイアログの再開の形で選び直せる。再開したセッションの中央には、それまでの会話を読み取り専用で出す。会話の id は main のメモリにだけ持ち、renderer には「再開できるか」の真偽だけを渡す。User Story は 4 本 (P1 が 2・P2 が 2)。SC は単体 / component / E2E の機械検証 7 本と、実機の 6 通り (SC-001) 1 本。本レビューは、User Story の価値、SC の計測可能性、AC のテスト可能性、異常系と回復の流れ、KPI「再利用率」との整合を見た。

## Findings

### [High] SC-001 / SC-007 の合否の規則が文書の間で食い違っている。主目的の達成を確かめないまま完了にできる (H-001) (scope: feature)

- **観察**: `spec.md:222` の SC-001 は「合否: 6 通り全部が通ること。V-1 は `/cl-done` の前に必須 (確かめずに完了にしない。夜間の規則で実機が無いときは「未実施」と書く)」。`quickstart.md:5` は「夜間の規則で実機が無いときは「未実施」と書いてマージし、roadmap の X-9 の行に残す」。`tasks.md:9` も同じ扱い。SC-007 の Win32 の部分 (`spec.md:228`、quickstart V-2) も同じ規則に従う。
- **同種事象探索**: `未実施` を `specs/021-session-resume` で検索すると spec.md:222、quickstart.md:5、tasks.md:9 / :98 / :100 の系統が当たる。SC-001 と SC-007 の 2 つの SC に及ぶ。
- **リスク/影響**: SC-001 は本 feature の価値そのもの (`claude` が前の文脈に答え、同じ transcript に追記される) を確かめる唯一の SC である。機械検証の SC-002〜SC-006 は偽の capability と単体の範囲で、SDK の `resume` が実際に会話を続けるかは確かめない。しかも RK-02 (`init` の id が要求と違う)、RK-06 (Win32 の記録が読めない)、RK-07 (終わり方が §6.4 と合わない) の 3 つは、実機でしか分からないうえに SC-001 の判定を直接変える。「必須・確かめずに完了にしない」と「未実施でマージ」が同じ SC の中に並んでいて、真偽で評価できない。
- **推奨アクション**: SC-001 の合否を 2 段に分けて明文化する。(a) マージの条件 = SC-002〜SC-008 の緑。(b) X-9 を「完了」にする条件 = V-1 の 6 通りと V-2 の実施。実機が無いときは roadmap の X-9 の行を「マージ済み・実機未確認」に留め、completed にしない。spec.md:222 の文言を「`/cl-done` の前に必須」から上の 2 段の形に直し、quickstart.md:5 と tasks.md:9 の文言を揃える。
- **根拠**: PO-2 (boolean-evaluable)。AD-059 Confirmation (V-1 / V-3 / V-4 の実機の記録)。
- **scope 根拠**: spec / quickstart / tasks の文言で直せる。

### [High] 再開の起動元 (KPI「再利用率」) の規則が 012 の「初期値のまま起動したら初期値の起動元を引き継ぐ」に反している (H-002) (scope: feature)

- **観察**: `data-model.md:346` の §9.3「起動元: 今の規則 (プリセットを適用したら `preset`、それ以外は `manual`)」。`research.md:139` (R-12) は「定義を変えない」としている。一方、今の規則の正本 `specs/012-ui-thread-search/data-model.md:291` は「起動元は、適用したら `preset`、適用せずに軸を手で変えたら `manual`、どちらも無ければ初期値を出した設定と組の起動元 (`lastOrigin`) にする。…前回の設定を初期値に出すすべての経路に当てる」と定めている。稼働中の行からの再開は、FR-007 (`spec.md:186`) で元の起動設定を初期値に出す経路にあたる。それなのに §9.3 は「それ以外は manual」と 2 値に縮めている。tasks FE-030 のテスト (`tasks.md:81`) も `preset` / `manual` の 2 通りしか見ていない。
- **同種事象探索**: `起動元` を `specs/021-session-resume` で検索すると data-model.md:346、research.md:139、tasks.md:80-81、contracts C-2 (`ipc-session-resume.md:39`) が当たる。どれも「初期値のまま」の場合を定めていない。
- **リスク/影響**: プリセットで起動したセッションを、初期値のまま再開すると `manual` に数えられる。再開では引き継ぐ 3 軸が固定されるので、プリセットを当て直す動機はほとんど無い。そのため再開が増えるほど `manual` が膨らみ、charter KPI「プリセットを適用した起動が、適用しない起動を上回る」(`charter.md:207`) が系統的に下振れする。012 の design-gate R2 H-02 が「同じプリセットを続けて使う起動を `manual` に数えない」として直した偏りと同じものが、再び入る。
- **推奨アクション**: §9.3 の起動元の行を、012 data-model §4 の 3 段の規則 (適用 → `preset`、手で軸を変えた → `manual`、どちらも無い → 初期値の組の起動元) に揃える。稼働中の行からの再開では、初期値の組の起動元にその行の `launchOrigin` を使う。過去の行からの再開は `initial: null` で、元の起動元を持たないので `manual` とする。この扱いを明記する。FE-030 のテストに「稼働中の行 (`launchOrigin: preset`) から初期値のまま再開すると `preset`」「初期値のモデルを変えると `manual`」を足す。R-12 の「定義を変えない」は、この揃え方で初めて成り立つ。
- **根拠**: PO-7 (KPI の計測経路の整合)。session charter KPI「再利用率」の注記 (`charter.md:216-218`)。012 data-model §4。
- **scope 根拠**: data-model §9.3 と FE-030 で直せる。

### [Medium] P1 の US-1 の AC2 が、P2 の US-4 の機能に依っている。tasks の MVP では US-1 の AC が通らない (M-001) (scope: feature)

- **観察**: `spec.md:101` の US-1 AC2 は「中央にそれまでの会話と、その下に composer が出る」。それまでの会話の表示は US-4 (P2。`spec.md:146-158`) の FR-012 で、実装は FE-040 (US-4 の節)。`tasks.md:127` は「最初の区切り (MVP) は 先行 + 土台 + US-1」としている。引き継ぐ軸を表示だけにするダイアログ (US-3 AC1。P2) も、US-1 の FE-011 で先に作る。
- **リスク/影響**: US-1 の Independent Test と AC が MVP の時点で満たせない。P1 / P2 の区別が「独立に価値を出せる単位」として成り立っていない。
- **推奨アクション**: US-1 AC2 を「新しい稼働中の行が起き、composer が出る」に縮め、それまでの会話の表示は US-4 AC1 に寄せる。または US-4 を P1 に上げ、MVP に FE-040 を入れる。U-7 の理由は「続きを話すには直前の文脈が見えている必要がある」なので、後者の方が価値の判断と合う。

### [Medium] 再開を拒否した後の回復の流れが、理由によっては行き止まりになる (M-002) (scope: feature)

- **観察**: `data-model.md:314` と `tasks.md:57` で、登録の導線は `folder-unregistered` にだけ出す (「他の理由では出ない」をテストで固定している)。ところが `cwd-mismatch` の文言 (`data-model.md:379`) は「そのディレクトリを作業フォルダとして登録してから再開してください」と登録を促している。また帯は「過去の行を選ぶたびに `resolvePastResume` を 1 回」呼ぶだけ (`data-model.md:320`) である。導線から登録した後に答えを取り直すかは書かれていない。
- **リスク/影響**: `cwd-mismatch` の利用者は、登録を促されるのに導線が無い (登録の画面を自分で探すことになる)。`folder-unregistered` の利用者は、登録した直後も帯に古い「押せない」が残りうる。US-1 AC4 の「R-2 の登録の導線が出る」は満たしても、その後の「再開できるようになる」までの流れが spec のどこにも無い。
- **推奨アクション**: `cwd-mismatch` にも登録の導線を出す (初期値は行の cwd)。登録が成功したら、または列挙の結果が変わったら、選択中の行の `resolvePastResume` を取り直すことを §9.2 に足す。AC として「登録の導線から登録すると、帯の「再開」が押せるようになる」を US-1 に足す。

### [Medium] `source-unknown` の文言が稼働中の行からの拒否に合わない (M-003) (scope: feature)

- **観察**: `data-model.md:385` の `source-unknown` の文言は「この会話を再開できません。一覧を再取得してから試してください」。稼働中の行でも、退避の表から捨てられた行 (257 件目・`killAll` の後。§4 `data-model.md:175`) はこの理由で拒否される。
- **リスク/影響**: 稼働中の区画には「再取得」の操作が無いので、利用者は次に何をすればよいか分からない。実際に取れる回復の手段は「過去の区画から同じ会話を選んで再開する」だが、それが示されない。
- **推奨アクション**: `source` の種類で文言を分ける (稼働中の行なら「過去のセッションの一覧から再開してください」)。または文言を両方に通じる形にする。

### [Medium] 過去の区画から再開すると、同じ会話の終了済みの稼働中の行が残り、U-4 の意図 (同じ会話の行を 2 つ残さない) が崩れる (M-004) (scope: feature)

- **観察**: U-4 (`spec.md:78`) の理由は「同じ会話の行が 2 つ並ぶと、どちらが続きか分からない」。しかし FR-010 (`spec.md:192`) と §9.4 の `replaces` は `source: live` のときだけ働く (FR-012 の帯は `replaces: null`。`tasks.md:56`)。終了済みの稼働中の行がある会話を、過去の区画から再開した場合は書かれていない。
- **リスク/影響**: 稼働中の区画に、終了済みの行と新しく再開した行が同じ会話のまま並ぶ。U-4 が避けたかった状態そのものである。
- **推奨アクション**: main の退避の表に、同じ会話の id を持つ稼働中の行のレコードがあれば、その `sessionId` を `replaces` として返す (renderer に id の値は渡さない)。または「過去の区画からの再開では元の行を残す」と範囲外に明記し、AC で固定する。

### [Medium] 「やり直す」の後にダイアログを起動せずに閉じると、失敗の理由が消える (M-005) (scope: feature)

- **観察**: `data-model.md:358` の §9.5 では、「やり直す」は行を閉じてダイアログを開く。一方 session charter (`charter.md:273-274`) では、ダイアログを起動せずに閉じると、シェルが `dismissLaunchNotice` で起動の告知 (前回の失敗) を消す。
- **リスク/影響**: 理由を確かめるために「やり直す」を押してから取り消すと、行も失敗の理由も消える。U-6 の「ダイアログで原因を直してから起動できる」は、原因が見えていることが前提である。
- **推奨アクション**: 「やり直す」のダイアログに失敗の理由を出し続けること、取り消したときの扱い (告知を残すか) を §9.5 に書く。AC を US-2 に 1 つ足す。

### [Medium] US-3 AC4 の「選び直しを求める印」と data-model の「既定に戻して通知」が別の振る舞いになっている (M-006) (scope: feature)

- **観察**: `spec.md:141` の US-3 AC4 は「選び直しを求める印が出る」。FR-007 (`spec.md:186`) は「今のダイアログの規則で選び直しを求める」。これに対し `data-model.md:342` と `tasks.md:80` は「既定に戻して通知する」。charter の業務ルール (`charter.md:183`) も「既定に戻し、UI で通知する」である。
- **リスク/影響**: AC がテストに 1:1 で落ちない。印を出して利用者の選択を待つのか、自動で既定に戻すのか、テストの書き手が決めることになる。
- **推奨アクション**: spec の AC4 と FR-007 を「既定に戻して通知する」に揃える。

### [Medium] `supervisor-exited` の行の再開で、`claude` が残っていたときの同じ会話の 2 本目が扱われていない (M-007) (scope: feature)

- **観察**: US-2 AC2 (`spec.md:120`) は `supervisor-exited` の行の再開を対象にしている。`src/main/app/session-launch-service.ts:31` と `:165` では、supervisor の異常終了で、その世代の全セッションを `synthesizeExit(ids, 'supervisor-exited')` で終了の扱いにする (`claudeAlive` が false になる)。U-5 の判定 (§5 の 4) は `claudeAlive: true` しか見ない。
- **リスク/影響**: supervisor が落ちても `claude` (特に WSL の `wsl.exe` の先) が生き残っていると、U-5 が守ろうとした「同じ transcript に 2 つの `claude` が書く」状態を Closta 自身が作る。ただし `claude` が実際に生き残るかは、本レビューでは確かめていない。
- **推奨アクション**: supervisor の異常終了の後に `claude` が残るかを quickstart の記録事項 (V-7) に足す。残るなら、`supervisor-exited` の行の「再開」に注意を出すか、Edge Cases に明記する。

### [Medium] (H) 過去の区画からの再開の流れを通しで確かめるテストが無い (M-008) (scope: feature)

- **観察**: SC-006 の E2E (`tasks.md:69`) が seed するのは、稼働中の区画の終了済みの行だけ。過去の行から再開する流れ (帯 → ダイアログ → `resumeSession` → 新しい行 → それまでの会話) は、component と単体に分かれて置かれている。これを通しで見るのは実機の V-1 a だけで、その V-1 は H-001 のとおり未実施でマージできる。
- **リスク/影響**: US-1 (P1) の主経路で、部品の間の結線 (FE-012 → FE-011 → FE-010 → FE-040) が崩れても検出できない。
- **推奨アクション**: FE-021 に 4 本目を足す。過去の行を seed し、帯の「再開」→ ダイアログ → 受け付け → 中央に区切りの行、までを流す。

### [Medium] (H) 再開の受け付け・拒否・`resume-failed` を追う観測点が定められていない (M-009) (scope: feature)

- **観察**: main のログについて定めているのは `[session] conversation-id-changed` の 1 行だけ (`data-model.md:63`)。BE-013 のテスト (`tasks.md:49`) も同じ。再開の受け付け、拒否の理由 (`source-unknown` / `invalid-config` / `already-running` / `conversation-running`)、`resume-failed` の発生を、理由のキーだけで記録する規則は無い。
- **リスク/影響**: 利用者から「再開できない」と報告されても、どの段 (軸の解決・3 軸の照合・起動ゲート・`init` の前の終了) で落ちたかをログから切り分けられない。RK-05 / RK-07 の実機の切り分けにも要る。
- **推奨アクション**: 起動の service に `[session] resume outcome=<status> reason=<key> source=<live|past>` の 1 行を足す (会話の id とパスは出さない)。BE-013 のテストで、ログの形と、ログに会話の id の目印が 0 件であることを確かめる。

### [Low] US-2 AC2 の「やり取りは残る」がどこに残るのか曖昧 (L-001) (scope: feature)

- **観察**: `spec.md:120` の「失敗した時点で書かれていたやり取りは残る」は、transcript に残るのか、中央のそれまでの会話に出るのかを決めていない。
- **推奨アクション**: 「再開したセッションの中央のそれまでの会話に、失敗の前のターンが出る」のように、観測できる形に直す。

### [Low] User Story の benefit が charter の KPI に紐付いていない (L-002) (scope: feature)

- **観察**: US-1 / US-2 の Why (`spec.md:94`, `:113`) は具体的だが、charter の KPI (`charter.md:185-221`) のどれにも当たらない。再開がどれだけ使われるか、文脈を渡し直す手間がどれだけ減ったかを測る経路も無い。
- **推奨アクション**: 少なくとも、再開の起動が起動の利用記録 (R-12) に入ることを KPI の注記に書く。そのうえで、再開の利用量を別に見るかをマイルストーンの終わりの棚卸しで判断する。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `未実施` in specs/021-session-resume | 5 | spec.md:222, quickstart.md:5, tasks.md:9, tasks.md:98, tasks.md:100 |
| H-002 | `起動元` in specs/021-session-resume | 4 系統 | data-model.md:346, research.md:139, tasks.md:80-81, contracts/ipc-session-resume.md:39 |
| M-007 | `supervisor-exited\|killAll` in src/main/app/session-launch-service.ts | 8 | :31, :32, :102, :119, :165, :175, :224-226, :233 |

## Verdict

- Critical: 0
- High: 2
- Medium: 9
- Low: 2
