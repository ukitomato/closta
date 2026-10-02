# po-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-010 / US-1〜US-4 (AC 計 22) / Edge Cases 13 件 / Out of Scope 8 件 / Assumptions ([USER 決定] 9 件 / [ASSUMED] 4 件)。今回の観点で特に重いのは FR-005 / FR-008 / FR-009 / FR-011 と SC-003 / SC-006。
- 本 feature の文書に関係する charter と Confirmation:
  - session charter の Mission、Scope「supervisor (semaphore 制御、IPC バッチ化)」、Journey 3、KPI「並列時の滑らかさ」(docs/domains/session/charter.md:22-27, 44, 84-88, 123)
  - X-1 の FR-015 / FR-016 (中断・強制終了の警告) / FR-019 (specs/005-session-launch-and-streaming/spec.md:317-320, 333-340)
  - 計画中の AD-043 の Confirmation (plan.md:237)
  - 既存コードの事実確認: src/domain/session/run-state.ts:71, :106-108 / src/domain/session/sanitize-body.ts:12, :15 / src/agents/sdk-agent-session.ts:172
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:3 Low:2
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲: 該当なし: po-reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R1 を受けて、spec / plan / tasks は次のように改訂されている。
- 応答待ち (`done`) と中断済み (`interrupted`) のセッションに、破損警告を出さない「終了」を足した (FR-011 / US-2 AC5)。
- SC-003 の負荷と入力遅延の計測点を数値で定めた。
- 状態通知に `claude` の生存フラグを入れ、`done` を終端として扱わないことにした (FR-004)。
- 終了済みセッションの保持件数に上限を設けないことを意図的な判断として Out of Scope に書き、`error` 後のスレッドは終わらせることにした (FR-012)。
- 起動・終了・再起動の競合 3 件を Edge Cases に足した。
- 承認待ちの独立性と、port が閉じた後の transcript 保持を SC とテストに入れた。
- supervisor の異常終了をログに記録することにした (FR-013 / BE-020)。

R1 の自分の指摘 (High 2 / Medium 6 / Low 2) は全件、文面上は対応されている。今回は、その改訂で新たに生まれた穴と、R1 で見落としていた穴を挙げる。[USER 決定] 9 件は前提として尊重する。

### R1 指摘の判定

| R1 ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| H-001 (DG-H-14) | `done` の枠を空ける穏当な操作が無い | resolved | spec.md:92 (US-2 AC5) / :211-214 (FR-011) / :67 (US-1 AC2 の導線文言)。tasks.md:42 (BE-002) / :80 (FE-011) |
| H-002 (DG-H-15) | SC-003 の負荷と計測点が数値で決まっていない | resolved | spec.md:279。ただし負荷のうち「5MB」は、R1 で私自身が出した推奨が BODY_MAX_BYTES と矛盾していた。新規の M-001 に回す |
| M-001 (DG-H-01) | 状態通知のフィールドが spec と plan で食い違う | resolved | spec.md:176 / :250 と plan.md:139 が一致 |
| M-002 (DG-H-02) | FR-004 が `done` を終端と呼んでいる | resolved | spec.md:179 / plan.md:141 / tasks.md:24 |
| M-003 (DG-M-14) | 終了済みの蓄積とスレッドの残留に上限が無い | resolved | spec.md:155 / :317 / :221。plan.md:259 |
| M-004 (DG-M-11) | 起動・終了・再起動の競合 | resolved | spec.md:145-147。tasks.md:61 / :119-121 |
| M-005 (DG-M-12) | AC に対応するテストの欠落 | resolved | spec.md:288 / :287。tasks.md:129 / :84 / :134 |
| M-006 (DG-M-13) | supervisor 異常終了の観測点が無い | resolved | spec.md:225。plan.md:202 / tasks.md:122 |
| L-001 | 同一フォルダの行を見分けられない | resolved | spec.md:268 |
| L-002 | 終了待ちの間の表示が無い | resolved | plan.md:259 (R-04) |

## Findings

### [High] 一覧で「応答待ちの `done`」と「`claude` が終わった `done`」が同じ状態に見える。`session-limit` から抜ける唯一の導線で、終了すべき行を見分けられない (H-001) (scope: feature) — new

- **観察**:
  - spec.md:185 (FR-005) は「X-1 の `done` は『応答完了・次のプロンプト待ち』と『強制終了後』の両方を表す」と認め、枠を数える基準を生存フラグに移している。
  - 一方、一覧の行に出すのは run-state だけである。spec.md:88 (US-2 AC1) と spec.md:206 (FR-009) は「状態 (`running` / … / `done` 等)」を示すと書き、生存フラグを表示に使う規定が無い。plan.md:219 も「状態ラベル」だけである。
  - plan.md:149 は「`end` は `kill` と同じ遷移 (→ `done`)」と決めている。このため「終了」後のセッションも `done` と表示される。
  - 状態機械では `done` で `send-prompt` を受けると `running` に戻る (run-state.ts:106-108)。`claude` が終わった `done` のセッションで composer が使えるかどうか、送信したときに何を示すかが spec にも plan にも無い。
  - spec.md:67 (US-1 AC2) の拒否文言は「応答待ちのセッションを終了すると起動できる」と案内するが、10 行の中から応答待ちの行を見分ける手掛かりは行ごとのボタンの違いしか無い。
- **同種事象探索**: `状態ラベル|状態 \(` で spec / plan / tasks を検索すると 3 件 (spec.md:88 / spec.md:206 / plan.md:219)。いずれも生存フラグを表示に使う規定が無い。
- **リスク/影響**: 上限に当たったときの回復手順が利用者に推測を強いる。`claude` が終わったセッションに送信しても拒否されるだけで、理由が示されない可能性がある。
- **推奨アクション**:
  - 一覧の状態表示を「run-state × 生存フラグ」から導く、と FR-009 に 1 行足す (例: `done` かつ生存 true は「応答待ち」、false は「終了済み」)。訳文の正本は `labels.ts`。
  - `claude` が終わったセッションでは composer を無効にする (または送信不可の理由を出す)、と FR-010 か US-2 AC7 に足す。
  - FE-013 に「`done` の行が生存フラグで別のラベルになる」「終了済みのセッションでは送信できない」を足す。
- **根拠**: PO-6 / PO-3 / charter Journey 3
- **scope 根拠**: spec の FR-009 / FR-010 と tasks の FE-004 / FE-013 で直接直せる

### [High] renderer の再読み込みやクラッシュで store と port が消えても、セッションは supervisor に残って枠を占め続ける。一覧は空になり、見えない枠で `session-limit` に当たる (H-002) (scope: feature) — new

- **観察**:
  - spec.md:201-204 (FR-008) で、本文と port を持つのは renderer だけになった。X-1 の「画面を離れたら kill」を撤去し、寿命の後始末はアプリ終了時 (FR-014) だけが担う。plan.md:218 も同じ。
  - renderer プロセスが再読み込みまたはクラッシュ (`render-process-gone`) したときの扱いが無い。`reload|リロード|再読み込み|render-process-gone` を spec / plan / tasks で検索すると 0 件。
  - その場合、main の registry では生存フラグ true のエントリが残り、renderer の store は空になり port も繋ぎ直せない。利用者には空状態が見えるのに、起動すると `session-limit` で拒否される。そのセッションは終了も停止もできず、アプリを終了するまで続く。
  - 全本文を renderer に持つ判断と、終了済みの保持件数に上限を設けない判断が重なり、renderer が落ちる経路は X-1 より起きやすい。
- **同種事象探索**: `reload|リロード|再読み込み|render-process-gone` で 0 件 (specs/009 配下)。X-1 (specs/005) にも該当する規定は無い。
- **リスク/影響**: 利用者から見えないセッションが `claude` (Provider の課金とファイルの書き換え) を動かし続け、枠も占める。回復手段がアプリの再起動しか無い。
- **推奨アクション** (いずれかを Edge Cases に明記し、テストを足す):
  - (a) 最小案: main が renderer の再読み込み・`render-process-gone` を検知したら、全セッションに kill を送る (FR-014 の終了処理と同じ経路)。BE-021 か BE-020 の単体に負例を足す。
  - (b) main の registry から一覧の行を作り直し、本文は失われた旨を示して、終了・強制終了を出せるようにする。
  - (c) 本 feature では扱わないと判断するなら、Out of Scope に理由と再検討先を書く。
- **根拠**: PO-4 / PO-7 / X-1 FR-017 の趣旨
- **scope 根拠**: spec の Edge Cases と FR-008 / FR-014、tasks の BE-020 / BE-021 で直接直せる

### [Medium] SC-003 の「5MB の tool_result」は、本番の経路では renderer に届かない。E2E の負荷と実際の経路がずれている (M-001) (scope: feature) — new (R1 H-002 で私が出した推奨値に起因)

- **観察**: spec.md:279 (SC-003) は「うち 1 本は 5MB の tool_result を 1 回流す」と定め、E2E で計測する (supervisor 内は通らない)。本番ではセッションスレッドが本文を `BODY_MAX_BYTES` / `TOOL_RESULT_MAX_BYTES` = 200,000 バイトに切り詰める (sdk-agent-session.ts:172 / sanitize-body.ts:12, :15)。US-3 AC2 と BE-022 は「上限いっぱい」、plan R-02 は「5MB を流す」と書き、規模が揃っていない。
- **推奨アクション**: renderer が受ける負荷を「1 メッセージ `BODY_MAX_BYTES` (200KB) の tool_result を 1 回」と書き直し、SC-003 を正本にする。5MB のパースで他を止めないことは supervisor 側の SC-007 / BE-022 が担う、と書き分ける。plan R-02 と FE-020 は参照形で追随させる。
- **根拠**: PO-2
- **scope 根拠**: spec の SC-003 / US-3 AC2 と plan の R-02 で直接直せる

### [Medium] 「終了」が期限切れで強制終了に落ちたことが利用者に示されない。X-1 FR-016 の警告の保証が黙って外れる (M-002) (scope: feature) — new

- **観察**: FR-011 は「破損の警告は出さない。期限内に終わらなければ強制終了に落とす」と定める。X-1 FR-016 は強制終了では「途中出力の保全と JSONL の非破損を保証しない」旨を警告すると求める。終了から強制終了に落ちたことを事後に示す規定が無い。終了の処理中の行の表示と、終了ボタンの二度押しの扱いも決まっていない。
- **リスク/影響**: 利用者は穏当に終えたつもりでいるのに、実際には JSONL が壊れたかもしれない状態になる。
- **推奨アクション**: 強制終了に落ちたときは理由キーか注記でその旨を示す、と FR-011 に足す。US-2 AC5 に負例の AC を 1 つ足し、FE-013 で確かめる。終了の処理中は終了ボタンを無効にする。
- **根拠**: PO-4 / PO-6 / X-1 FR-016
- **scope 根拠**: spec の FR-011 / US-2 と tasks の FE-013 / FE-030 で直接直せる

### [Medium] `launching` のまま進まないセッションに、利用者が取れる操作が無い。枠を占めたまま抜けられない (M-003) (scope: feature) — new

- **観察**: `launching` は枠を占める。一方 FR-011 の操作は、終了が `done` / `interrupted` だけ、停止が応答中 (`running` / `awaiting_permission`) だけで、FE-011 も「停止 (応答中のみ)」。`launching` の行には何も出ない。`launching` の期限も無い。状態機械自体は `launching` からの kill を受け付ける (run-state.ts:71)。
- **リスク/影響**: 起動が詰まったセッションが枠を占めたまま残る。
- **推奨アクション**: 停止 (強制終了) を `launching` にも出す、と FR-011 と US-2 AC6 に足す。または `launching` に期限を設けて理由付きの `error` にする。FE-013 の観点に `launching` を加える。
- **根拠**: PO-4 / PO-6
- **scope 根拠**: spec の FR-011 と tasks の FE-011 / FE-013 で直接直せる

### [Medium] 今回の新規指摘 (H-001 / H-002 / M-002 / M-003) を検出するテストが tasks に無い (M-004) (scope: feature) [H] — new

- **観察**: FE-013 の観点は「終了・停止・閉じるが状態に応じてだけ出る」までで、生存フラグでラベルが分かれること / 終了済みのセッションに送信できないこと / 強制終了に落ちたことが示されること / `launching` の行で操作できることを確かめるテストが無い。BE-020 / BE-021 も renderer の再読み込み・クラッシュの負例を持たない。
- **推奨アクション**: 上記のテスト観点を FE-013 と BE-020 / BE-021 に足す。
- **根拠**: H
- **scope 根拠**: tasks で直接直せる

### [Low] 表示中のセッションを閉じた後に何を表示するかが決まっていない (L-001) (scope: feature) — new

- **観察**: US-2 AC7 と plan.md:217 は、閉じると「行と保持を消す」としか書いていない。表示中の行を閉じたときの `selectedId` の移り先が無い。
- **推奨アクション**: 選択の移り先を US-2 AC7 に 1 行足す (例: 選択を外して一覧の空き表示にする)。
- **根拠**: PO-6

### [Low] 枠の残り数が拒否されるまで分からない (L-002) (scope: feature) — new

- **観察**: 一覧にも起動設定ダイアログにも、枠を占める本数 (例: 8/10) の表示が無い。
- **推奨アクション**: 本数の表示を `ui` に申し送るか、持たないと判断したことを O-1 の範囲として Out of Scope に 1 行書く。
- **根拠**: PO-6

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `状態ラベル\|状態 \(` (spec / plan / tasks) | 3 | spec.md:88, spec.md:206, plan.md:219 |
| H-002 | `reload\|リロード\|再読み込み\|render-process-gone` (specs/009) | 0 | — (規定の欠落を確認) |
| M-001 | `上限いっぱい\|5MB` (specs/009 *.md、gate-r1 を除く) | 5 | spec.md:43, :114, :266, :279, plan.md:256, tasks.md:128 |

Critical は無いので、cascade_enforce の対象になる指摘はありません。

## Verdict

- Critical: 0
- High: 2
- Medium: 4
- Low: 2
- Round inheritance: resolved from 1: 10 / unresolved: 0 / new: 8
