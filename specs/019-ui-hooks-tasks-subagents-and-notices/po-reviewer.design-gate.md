# po-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-17
**Reviewer**: po-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-003 (US-1 一般の Hook)、FR-004〜FR-006 (US-2 背景の task とタブ)、FR-007〜FR-011 (US-3 subagent の入れ子)、FR-012〜FR-016 (対応表・境界の検査・roadmap・ADR・記録)。SC-001〜SC-005
- 該当する charter / Confirmation: ui charter の KPI「表示網羅」(項目 21 と M3 完了の条件)、業務ルール Principle XII / XIII、Scope「右のペインのタブ」「Subagent」、Open Question (task の一覧の要否、`charter.md:260-262`)
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の範囲外 (security-reviewer が見る)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の範囲外 (security-reviewer が見る)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の範囲外 (architecture-reviewer が見る)
- D. Constitution / ADR drift: 該当なし: po-reviewer の範囲外 (U-3 / U-7 の gated 承認を含め architecture-reviewer が見る)
- E. User Story / SC / AC / UX: Critical:0 High:3 Medium:3 Low:2
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の範囲外 (convention-reviewer が見る)
- G. optional reviewer 範囲: 該当なし: po-reviewer の範囲外 (ux / a11y / ui-coverage reviewer が見る)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

ui domain の feature O-11。User Story は P1 が 3 本。(1) PreToolUse などの一般の Hook の行を出す (`includeHookEvents`)。(2) 後から背景に移った task の行、シェルの task のコマンド名、右のペインの「背景の task」タブ (`meter` の種類 `background-tasks`)。(3) 実行中の subagent の入れ子 (`forwardSubagentText`) と過去ログの入れ子 (`listSubagents` / `getSubagentMessages`)。完了の PR で対応表の Tier A 3 行を `実装済み` にし、M3 の完了の条件の残りを 0 にする。Tier B は O-12 に送る。U-1〜U-8 と AD-054〜056 は未承認 (夜間の仮採用) で、実装は承認の後に始める。

## Findings

### [High] subagent に帰属する system メッセージの扱いが spec と data-model で食い違っている (H-001) (scope: feature)

- **観察**: `spec.md:175` (Edge Cases) は「`parent_tool_use_id` を持つものは**入れ子だけに描く**」と書いている。一方 `data-model.md:154` は「`compact_boundary` だけ divider にし、**他は捨てる**」と書き、`research.md:69` と `tasks.md:81` (BE-031) も「捨てる」で実装を指示している。spec は「描く」、data-model と tasks は「消す」で、真逆になっている。捨てる側には subagent の中で走った `hook_started` / `hook_response`、`informational`、拒否 (refusal) も入るので、FR-002 (一般の Hook を描く) とも合わない。帰属つきで Hook の行が来た場合、US-1 の「tool の前後に走った Hook が分かる」が subagent の tool で成り立たない
- **同種事象探索**: `入れ子だけ|他は捨てる` を spec_dir で検索して 3 件 (`spec.md:175`、`data-model.md:154`、`research.md:69`)。tasks.md の BE-031 (`tasks.md:81`) も「他は捨てる」
- **リスク/影響**: 実装者は data-model を正本として扱う (`data-model.md:5`) ので、spec の AC / Edge Case に反する実装がテストつきで通ってしまう。SDK 0.3.270 の型には帰属が無く (RK-11 / research R-09) 今は起きない経路だが、規則は「来たとき」のために書かれている。来たときに Hook・知らせ・拒否が黙って消え、Principle XII の「未表示を残さない」に反する
- **推奨アクション**: どちらかに揃える。(a) spec Edge Case を「入れ子の中では `compact_boundary` の divider だけを描き、他は描かない (O-12 / 後続へ)」に直し、Out of Scope に入れる。または (b) data-model §3.1 を「Hook / task の行は親の `children` に system-event の part として入れる」に直し、BE-031 にテストを足す。どちらでも、subagent の中の Hook の扱いを US-1 の AC に 1 行足す
- **根拠**: PO-4 (異常系の明示)、PO-3 (AC とテストの 1:1)、Principle XII
- **scope 根拠**: spec / data-model / tasks の中で直せる

### [High] 実行中の入れ子が上限に当たると、subagent の「今の」活動が見えなくなり、そのことが Edge Cases に書かれていない (H-002) (scope: feature)

- **観察**: `data-model.md:150-151` は、1 つの tool-call の子が 500 件、または根の送り直しが 1,000,000 バイトを超えたら「以後足さず、親の `truncated` を立てる」としている。根には入れ子の tool の結果 (Read の中身など) も入るので、大きなファイルを数回 Read する subagent や、並列の subagent を持つターンでは 1 MB にすぐ届く。上限の後に足されなくなるのは**新しい**子のほうで、US-3 の Why である「実行中の subagent が何をしているかが分かる」(`spec.md:148-152`) が、長く動く subagent ほど成り立たない。spec の Edge Cases (`spec.md:166-177`) と Out of Scope (`spec.md:243-250`) には書かれていない。RK-04 (`plan.md:263`) は IPC の量しか扱っていない
- **同種事象探索**: `truncated|1,000,000|RESEND_RESULT_MAX_BYTES` を spec_dir で検索して 6 件 (`plan.md:37`、`data-model.md:150`、`data-model.md:151`、`research.md:61`、`research.md:64`、`tasks.md:80`)。spec.md には 0 件
- **リスク/影響**: 一番見たい長い subagent の実行中に、入れ子が止まったように見える。利用者は止まったと思って中断・再送しかねず、US-1 の Why で挙げている誤解がそのまま起きる。1 秒ごとにどの程度で上限に届くかの見積もりも無い
- **推奨アクション**: spec の Edge Cases に「入れ子が上限に達したときの見え方」を明記し、利用者に見える形を AC にする (例: 親の Subagent の表示に「以降は省略」と件数を出す)。あわせて、上限の後も最新の子を残す方式 (古い子の結果本文を落とす、根の送り直しから入れ子の tool の結果本文を外す、など) の要否を判断する。残すのが無理なら Out of Scope に理由を書く。FE-031 の component テストに `truncated` の表示を足す (今は BE-030 の agents の単体だけ)
- **根拠**: PO-4 (リソース枯渇の明示がない漏れは High 以上)、PO-1 (US-3 の benefit)
- **scope 根拠**: spec / data-model / tasks の中で直せる

### [High] FR-012 / SC-005 は Tier A 3 行を無条件に `実装済み` にするが、実データで届くかは検証されないまま完了できる (H-003) (scope: feature)

- **観察**: FR-012 (`spec.md:205`) は「D 節の 3 行を `実装済み`」と無条件に要求している。SC-005 (`spec.md:231`) の合否は項目 21 (対応表の文面の照合) と「quickstart で記録する」だけ。一方 RK-06 (`plan.md:265`) は、`task_updated` の `patch.is_backgrounded` が実データで届かなければ late-backgrounded-task を「SDK の版の待ちとして利用者に返す (M3 の完了の条件に関わる)」と書いている。RK-11 (`plan.md:270`) も、AC3 (入れ子の divider) が実行中に成り立たない可能性を認めている。ところが tasks では V-1〜V-7 を「利用者に残し、実装を止めない」(`tasks.md:9`、`tasks.md:102`) とし、SH-011 (`tasks.md:100`) は経路の書き分けだけを V-2 に条件づけて、`実装済み` そのものは条件にしていない
- **同種事象探索**: `RK-06|実装済み` を spec / plan / tasks で目視で確認した。条件づけは `plan.md:265` と `plan.md:270` にあり、`spec.md:205` と `tasks.md:100` には無い
- **リスク/影響**: charter の KPI「表示網羅 / M3 の完了の条件」(`charter.md:167-169`) が、実際に表示されるかではなく対応表の文面で 0 になる。届かない経路を `実装済み` にすると、M3 の完了が誤って宣言される。SC-005 は boolean で評価できるが、測っているのは表の文面で、利用者に見えるかではない
- **推奨アクション**: FR-012 に「V-3 で `patch.is_backgrounded` が届かないと記録された場合、late-backgrounded-task は `実装済み` にせず RK-06 のとおり利用者に返す」を、SC-005 に「V-3 / V-4 の記録が『届いた』であること、または未確認の行を `実装済み` にしないこと」を足す。SH-011 の書き換えの条件にも V-3 / V-4 の記録を入れる
- **根拠**: PO-2 (SC の計測経路が成果を測っていない)、ui charter の KPI、AD-044 (M3 の完了の条件)
- **scope 根拠**: spec / tasks の中で直せる

### [Medium] 「背景の task」タブの空の状態と「動いていない」の定義が曖昧 (M-001) (scope: feature)

- **観察**: 「動いていない」の書き方が文書ごとに違う。US-2 AC4 (`spec.md:143`) は「終了・失敗したセッション」、`data-model.md:125` は「動いていないセッション」、`tasks.md:70` は「動いていない・過去・未選択」。プロセスは生きていてターンの合間で待っている状態 (背景の task が一番意味を持つとき) をどれに入れるかが決まっていない。また、起動してから最初の `background_tasks_changed` が来るまでの `null` の状態について、本文に何を出すかが data-model §2.5 に無い (見出しの件数を出さないことだけ。`data-model.md:123`)
- **推奨アクション**: 「動いていない」= プロセスの状態が終了・失敗・過去、と定義し、ターン待ちは一覧を出すことを AC4 に明記する。`null` と 0 件の本文の文言を data-model §2.5 に足す
- **根拠**: PO-3 (主観語・曖昧語)、PO-4 (empty state)

### [Medium] 一般の Hook の行が tool ごとに増え、transcript が読みにくくなる問題の判断が先送りになっている (M-002) (scope: feature)

- **観察**: Edge Cases (`spec.md:168`) は「1 行ずつ出す (まとめない)」。RK-03 (`plan.md:262`) は、密度の切り替えに入るかを V-1 で確かめ、要るなら利用者に返す、としている。PreToolUse / PostToolUse の両方を設定すると、tool 1 回につき 2〜4 行が増える。AC と SC には、読みやすさの基準も密度の切り替えとの関係も無い
- **推奨アクション**: compact の密度で一般の成功した Hook を畳む・隠すかを US-1 の AC に決めておく。決めないなら Out of Scope に「Hook の行の密度の制御は後続」と明記する
- **根拠**: PO-6 (UX flow)、PO-4

### [Medium] 過去ログを開く時間が延びることに SC や受け入れの基準が無い (M-003) (scope: feature)

- **観察**: 過去ログを開くたびに `getSubagentMessages` を最大 32 件直列で呼ぶ (`data-model.md:167`、`plan.md:223`)。RK-09 (`plan.md:268`) と V-6 は「時間を記録する」だけで、許容できる上限が無い。Journey 1 (`charter.md:112-118`) の「過去セッションを読む」体験が悪くなっても、合否で検出できない
- **推奨アクション**: SC に「subagent が 10 件以上のセッションで、開くまでの時間の増分が N 秒以内」などの基準を足す。または、入れ子の本文を遅れて取りに行く (先に主の transcript を出す) 方式の要否を判断する
- **根拠**: PO-2、PO-7 (利用者の体験の視点)

### [Medium] 過去ログの subagent の読み出しの失敗が黙って捨てられ、原因を追う観測点が無い (M-004) (scope: feature)

- **観察**: `data-model.md:166-167` は、`listSubagents` が失敗したら 0 件、`getSubagentMessages` の失敗は捕まえて捨てる、としている。ログや計測の記述は無い。利用者には「subagent が本文を持たない」と「読み出しに失敗した」の区別がつかず、開発側も V-6 の不具合を診断できない (H 観点: observability)
- **推奨アクション**: 取得プロセスで失敗の件数と種類 (本文は除く) を診断ログに残すことを data-model §3.2 に足し、BE-033 のテストで、失敗時にログが 1 件出ることを固定する
- **根拠**: PO-7 (運用・サポートの視点)、reviewer-base H の観測点

### [Low] US-2 AC2 の「シェル」と data-model の「シェルのコマンド」の文言が違う (L-001) (scope: feature)

- **観察**: `spec.md:141` は「名前が取れなければ『シェル』だけ」、`data-model.md:91` は `taskTypeLabel('local_bash')` =「シェルのコマンド」としている。plan (`plan.md:323`) でずれを認めたが、spec の AC は直っていない
- **推奨アクション**: AC2 の文言を「シェルのコマンド」に揃える

### [Low] User Story がすべて P1 (L-002) (scope: feature)

- **観察**: US-1〜US-3 がすべて P1 (`spec.md:113` / `:130` / `:148`)。Tier A の M3 の完了の条件に直結する、という理由は書かれている。ただし MVP の順 (`tasks.md:128`) が実質的な優先度になっているのに、spec の優先度に反映されていない
- **推奨アクション**: US-3 の過去ログ側 (AC4) を P2 にするなど、優先度で切れる単位を示す。そのままにするなら理由を 1 行書く

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `入れ子だけ\|他は捨てる` (spec_dir) | 3 (+ tasks の BE-031) | spec.md:175, data-model.md:154, research.md:69, tasks.md:81 |
| H-002 | `truncated\|1,000,000\|RESEND_RESULT_MAX_BYTES` (spec_dir) | 6 (spec.md は 0) | plan.md:37, data-model.md:150, data-model.md:151, research.md:61, research.md:64, tasks.md:80 |
| H-003 | 目視 (FR-012 / SC-005 / RK-06 / RK-11 / SH-011) | 5 | spec.md:205, spec.md:231, plan.md:265, plan.md:270, tasks.md:100 |

## Verdict

- Critical: 0
- High: 3
- Medium: 4
- Low: 2
