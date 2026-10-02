# po-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-010。US-1〜US-4 (AC 計 24)、Edge Cases 9 件、Out of Scope 7 件、Assumptions ([USER 決定] 5 件 / [ASSUMED] 5 件) が対象。今回の観点で特に重いのは FR-004 / FR-005 / FR-009 / FR-011 / FR-013 / FR-014 と SC-001 / SC-003 / SC-004 / SC-007。
- 本 feature の文書に関係する charter と Confirmation:
  - session charter の Mission、Scope「supervisor (semaphore 制御、IPC バッチ化)」、Journey 3、KPI「並列時の滑らかさ」(docs/domains/session/charter.md:22-27, 44, 84-88, 123)
  - roadmap M2 の達成状態「起動条件を選んで複数セッションを回せる」(docs/roadmap.md:174)
  - X-1 FR-016 (強制終了の警告) と FR-019 (`done` 後の再 launch を許可) (specs/005-session-launch-and-streaming/spec.md:319-320, 333-336)
  - 計画中の AD-043 の Confirmation (plan.md:204)
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:4 Low:2
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲: 該当なし: po-reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

X-1 は per-session の utilityProcess で、2 本目の起動を `session-active` で拒否していた。本 feature はこれを次の形に変える。
- 単一の supervisor (utilityProcess) の中で、セッションごとに worker thread を起こす。同時実行の上限は 10 で、`claude` が生きているセッションを数える。超過は `session-limit` で拒否する。
- 状態の要約だけを supervisor→main→renderer の経路で 100ms ごとにまとめて送る。本文は port で renderer へ直接送る。
- renderer に一覧・切り替え・停止・閉じるの最小 UI を置き、セッションごとの store を持つ。
- supervisor が異常終了したら全セッションを `supervisor-exited` にし、pid で `wsl.exe` を回収する。終了処理は非同期にする。

起票予定の AD-043 で AD-023 §6 / AD-036 §1 を読み替える。tasks は SH-000 の実機確認を先に行い、US-1〜US-4 の順で BE / FE に分けている。[USER 決定] 5 件 (単一 supervisor + スレッド / 上限 10 で拒否 / バッチ化は要約だけ / renderer が全本文を保持 / 同一フォルダは警告) は前提として尊重し、その範囲内の欠陥だけを挙げる。

## Findings

### [High] 応答待ちの `done` セッションは上限に数えるのに、枠を空ける穏当な操作が無い。上限に達すると「警告付きの強制終了」しか道が無い (H-001) (scope: feature)

- **観察**:
  - spec.md:59 (US-1 AC4) / spec.md:164 (FR-005) / spec.md:216: 応答を終えて次のプロンプトを待つ `done` は `claude` が生きているので上限に数える。
  - spec.md:83 (US-2 AC6) / spec.md:187 (FR-011): 「閉じる」は `claude` が終わったセッション (`error` / 強制終了後) だけ。
  - spec.md:82 (US-2 AC5) / FR-011: 停止の手段は X-1 の中断 / 強制終了だけ。
  - X-1 FR-015 (specs/005-session-launch-and-streaming/spec.md:317-318): 中断した後も同じセッションで続けられる。つまり中断では `claude` は終わらず、枠は空かない。
  - X-1 FR-016 (同 :319-320): 強制終了は「途中出力の保全と JSONL の非破損を保証しない」旨の警告付き。
  - 結果として、使い終わって `done` で止まっているセッションの枠を空けるには、破損警告付きの強制終了しか無い。
  - 通常の使い方では、セッションは 1 回応答すれば `done` で残り続ける。上限 10 は実質「開いたセッションの累計 10 本」になり、11 本目を起動するたびに強制終了 (破損警告付き) が必要になる。
  - US-1 AC2 (spec.md:57) の「稼働中のセッションを止めれば起動できることが示される」の「止める」が中断なのか強制終了なのか、どちらとも決まっていない。利用者が中断しても枠は空かず、`session-limit` のまま拒否される。
  - X-1 FR-019 (005 spec.md:335-336) では `done` 後の再 launch を許していた。本 feature で `done` の扱いが変わったのに、「穏当に終える」経路は補われていない。
- **同種事象探索**: `閉じる|強制終了|中断` を spec.md / plan.md / tasks.md で検索すると、終わらせ方の規定は次の 4 箇所。いずれも「`done` を穏当に終える」操作を定義していない。
  - spec.md:82, spec.md:83, spec.md:187
  - tasks.md:63 (FE-011)
- **リスク/影響**:
  - Journey 3「10 セッションを並列で差配する」を続けて回すたびに、破壊的な警告を受け入れる操作が必須になる。
  - 警告が出ること自体が常態化し、本当に危険な強制終了 (running 中) の警告が無視されやすくなる。
  - M2「複数セッションを回せる」(roadmap.md:174) を実用レベルで満たしているとは言えない。
- **推奨アクション** (次のいずれか):
  - (a) 最小案: `done` / `interrupted` のセッションに「終了 (穏当)」を足す。SDK の query を終える、または stdin を閉じて `claude` の正常終了を待つ。破損警告は出さない。FR-011 と US-2 AC5 / AC6 に追記し、FE-011 / BE-002 に task を足す。
  - (b) 最低限の修正: 中断では枠が空かないこと、`done` を終えるには強制終了が要り警告が出ることを、spec の Edge Cases と US-1 AC2 の導線文言に明記する。強制終了の警告を `done` 中は弱める (書き込み中の応答が無いため) かどうかも決める。
  - US-1 AC2 の「止める」を「強制終了 (または (a) の終了) で `claude` が終わる」と具体化する。
- **根拠**: charter Journey 3 (docs/domains/session/charter.md:84-88) / X-1 FR-015・FR-016・FR-019 / PO-4・PO-6
- **scope 根拠**: spec の FR-005 / FR-011 と tasks の FE-011 / BE-002 で直接直せる

### [High] SC-003 の負荷条件「高頻度」「数 MB」が数値で決まっておらず、合否が再現できない (H-002) (scope: feature)

- **観察**:
  - spec.md:238 (SC-003): 「stub 10 本がそれぞれ**高頻度に**応答を流す 30 秒間」「1 本の**数 MB**の本文」。
  - plan.md:190 と tasks.md:85 (FE-020) も「高頻度」「数 MB」のままで、レート (events/sec)、1 event のバイト数、tool_result のサイズが無い。
  - 閾値 (long task 50ms / p95 50ms / 30 秒) は数値になっているが、負荷側が決まっていない。stub のレートを下げれば必ず PASS できる。
  - 「入力から描画への反映」の計測起点と終点 (keydown→次フレーム? input event→paint?) も spec では決まっていない。plan.md:190 は「`input` から次フレームまで」と書いているが、spec 側に正本が無い。
- **同種事象探索**: `高頻度|数 MB|数MB` で 4 件。spec.md:103, spec.md:238, plan.md:190, tasks.md:85
- **リスク/影響**: charter KPI「並列時の滑らかさ」(charter.md:123) を担う唯一の SC が、計測条件次第で通過する。KPI の担保として機能しない。
- **推奨アクション**:
  - SC-003 に負荷の定義を足す。例: 各 stub が 20 events/s・1 event 1KB の text delta を 30 秒流し、うち 1 本は 5MB の tool_result を 1 回流す。値は [ASSUMED] でよい。5MB は AD-018 の SPIKE 実績値と揃える。
  - 入力遅延の起点と終点 (例: `keydown` の timeStamp から次の `requestAnimationFrame` まで) を SC か plan のどちらか 1 箇所を正本にして定める。
  - FE-020 は参照形で追随させる。
- **根拠**: PO-2 (measurable / boolean-evaluable) / charter KPI
- **scope 根拠**: spec の SC-003、plan、tasks の FE-020 で直接直せる

### [Medium] 状態の要約に何を載せるかが spec と plan で食い違っている (M-001) (scope: feature)

- **観察**:
  - spec.md:157 (FR-004) / spec.md:215 (Key Entities): 要約に載せるのは「sessionId・run-state・失敗の理由キー**だけ**」。
  - plan.md:12 / plan.md:129: 型に `claudeAlive: boolean` を加えている。
  - SC-004 (spec.md:241) の計測経路は「要約 DTO の全フィールド走査」で、DTO の正本が spec と plan のどちらにあるかで判定が変わる。
- **リスク/影響**: 実装とテストを spec に合わせると、上限の計算 (FR-005) に必要な `claudeAlive` を運べない。plan に合わせると spec の「だけ」に違反する。
- **推奨アクション**: spec の FR-004 と Key Entities を「sessionId・run-state・理由キー・`claude` 生存フラグ」に改める。会話由来の文字列を載せない、という制約はそのまま残す。
- **根拠**: PO-3 (AC testability)
- **scope 根拠**: spec の FR-004 で直接直せる

### [Medium] FR-004 が `done` を「終端状態」と呼んでおり、FR-005 の定義と矛盾する。畳み込みの合否が決まらない (M-002) (scope: feature)

- **観察**:
  - spec.md:159: 「終端状態 (`error` / `done`) と理由キーは畳んでも失われない」。
  - spec.md:164 (FR-005): `done` は次のプロンプトで再び `running` になり得る、生存中の状態と定義している。
  - plan.md:131 の `coalesceSummaries` は、上書きしない対象を `error` と `claudeAlive: false` だけにしており、`done` は外している。
  - 同じ窓の中で `done`→`running` と遷移したときに `done` が残るべきかどうかについて、spec と plan で合否が逆になる。
- **推奨アクション**: FR-004 の「終端状態」を「`error` と `claude` の終了 (`claudeAlive: false`)」に改め、`done` を除く。SH-004 の境界値テストもこの定義に揃える。
- **根拠**: PO-3
- **scope 根拠**: spec の FR-004 で直接直せる

### [Medium] 終了済みセッションの蓄積とスレッドの残留に上限が無い。plan R-05 の「上限 10 で頭打ち」は事実と異なる (M-003) (scope: feature)

- **観察**:
  - spec.md:140 (Edge Cases): 終了したセッションは上限に数えず、閉じるまで残す。
  - plan.md:224 (R-05): 「上限 10 で頭打ち」。終了済みは上限外なので、renderer の保持 (FR-008 の全本文) は利用者が閉じない限り際限なく増える。
  - plan.md:30: 「terminal error では worker は `wsl.exe` を kill するが自身は exit しない」。
  - plan.md:153 / BE-002 は kill 経路でしか `ended`→`terminate()` を定義していない。`error` で終わったセッションの Worker (V8 isolate) が supervisor 内に残り続けるかどうかが決まっていない。
- **リスク/影響**: 長時間使うと renderer と supervisor のメモリが単調に増える。Edge case のリソース枯渇 (PO-4) が spec にも plan にも扱われていない。
- **推奨アクション**:
  - R-05 を訂正する。
  - 次のいずれかを spec の Edge Cases に明記する。(a) 終了済みの保持件数に上限を設け、古いものから自動で閉じる。(b) 保持に上限を設けないことを意図的な判断として Out of Scope に書く。
  - plan に「`error` に達した Worker は終端の要約を送った後に `terminate()` する」を足し、BE-002 / BE-023 でテストする。
- **根拠**: PO-4 (リソース枯渇)
- **scope 根拠**: plan R-05 と tasks の BE-002 で直接直せる

### [Medium] 起動・終了・再起動が重なったときの競合が Edge Cases に無い (M-004) (scope: feature)

- **観察**: spec.md:132-140 の Edge Cases は、`launching` 中の上限、`prepareLaunch` の失敗、fork の失敗は扱っている。次の 3 つは spec / plan / tasks のどれにも無い。
  - (1) before-quit の待ち時間 (plan.md:174 の最大 3 秒) の間に起動要求が届いたときの扱い
  - (2) supervisor が異常終了した後、起動要求が 2 件同時に届いたときに supervisor を二重に fork しないこと (plan.md:167「次の launch で fork し直す」)
  - (3) launch を送ってから最初の要約が届くまでの間に supervisor が落ちたとき、そのセッションが `supervisor-exited` に含まれ、枠が解放されること
- **リスク/影響**: (1) は終了処理中に孤児プロセスを作る経路になる。(2) は supervisor が 2 本立ち、片方が管理外になる経路になる。(3) は枠が永久に予約されたまま漏れる経路になる。いずれも SC-001 / SC-008 の合否に直結する。
- **推奨アクション**: 3 件を Edge Cases に足して期待する挙動を定める。(1) は `session-limit` とは別の理由キーで拒否、または無視。(2) は fork を 1 本に直列化。(3) は `supervisor-exited` に含めて枠を解放。BE-007 / BE-020 / BE-021 の単体テストに負例を足す。
- **根拠**: PO-4 (同時実行・race condition)
- **scope 根拠**: spec の Edge Cases と tasks の BE-007 / BE-020 / BE-021 で直接直せる

### [Medium] US-1 AC6 と US-4 AC2 の一部に対応する SC / task が無い (M-005) (scope: feature) [H]

- **観察**:
  - US-1 AC6 (spec.md:61「一方が承認待ちでも、もう一方のストリームは止まらない」) を検証する SC も task も無い。SC-001 は並行ストリーミングだけ、BE-023 は例外系だけを見ている。
  - US-4 AC2 (spec.md:124) の「それまでの出力は読める」(supervisor が落ちて port が閉じた後も、renderer の保持が消えないこと) が、SC-007 (spec.md:244) の計測経路にも FE-030 (tasks.md:102) にも無い。
- **リスク/影響**: AC があるのに検出するテストが無く、regression を検出できない。
- **推奨アクション**:
  - BE-023 か SH-020 に「セッション A が `awaiting_permission` の間も B の本文が流れ続ける」を足す。
  - FE-013 / FE-030 に「port が close / error になっても該当セッションの transcript が store に残る」を足す。
  - SC-001 と SC-007 の計測経路にそれぞれ 1 行加える。
- **根拠**: PO-3 / H (テスト戦略)
- **scope 根拠**: tasks で直接直せる

### [Medium] supervisor が異常終了したとき、原因を特定する観測点が無い (M-006) (scope: feature) [H]

- **観察**:
  - FR-013 (spec.md:192-194) と plan.md:172 は、supervisor の exit を全セッションの `supervisor-exited` に変換することだけを定めている。
  - exit code / signal、直前の Worker 数、`reapProcesses` が止められなかった pid の数 (plan.md:159 で戻り値として返す) を記録する先 (main の log 等) が spec / plan / tasks のどこにも無い。
  - plan の Consequences (plan.md:203) は「OOM / ネイティブクラッシュで全セッションが落ちる」と認めているのに、利用者やサポートが原因を区別する手段が無い。
- **リスク/影響**: 「全セッションが同時に落ちた」という最も影響の大きい障害の原因を後から追えない。運用とサポートの視点 (PO-7) が抜けている。
- **推奨アクション**: plan の main/app 節に、supervisor の exit 時に exit code / signal / 稼働数 / 回収できなかった pid 数を main の log に 1 行出す、と足す。会話由来の文字列と env は載せない。BE-020 の単体テストで log の呼び出しを assert する。
- **根拠**: PO-7 / H (observability)
- **scope 根拠**: plan と tasks の BE-020 で直接直せる

### [Low] 同じフォルダで並行するセッションを一覧の行で見分けられない場合がある (L-001) (scope: feature)

- **観察**:
  - spec.md:78 / spec.md:182: 行に出すのはフォルダ表示名・ランタイム・起動時刻・状態だけ。
  - 同一フォルダでの並行起動は許可されている (FR-006)。同じフォルダ・同じランタイムで近い時刻に起動すると、行がほぼ同一になる。
  - 起動時刻の表示精度も決まっていない。
- **推奨アクション**: 起動時刻を秒まで出すか、行の補助情報 (例: 最初のプロンプトの先頭。これは renderer が持つ transcript から作り、要約には載せない) を `ui` に申し送る。O-1 に送るなら Out of Scope に 1 行書く。
- **根拠**: PO-6

### [Low] アプリ終了の最大 3 秒の待ちの間、利用者に何も示さない (L-002) (scope: feature)

- **観察**: plan.md:174 / plan.md:223 (R-04) で終了が最大 3 秒遅れるが、その間の表示 (終了中であることの表示) が spec / plan に無い。
- **推奨アクション**: 「終了中」の表示を出すか、出さないと判断したことを R-04 に明記する。
- **根拠**: PO-6

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `閉じる\|強制終了\|中断` (spec / plan / tasks) | 4 | specs/009-session-supervisor-and-multi-session/spec.md:82, :83, :187; tasks.md:63 |
| H-002 | `高頻度\|数 MB\|数MB` | 4 | spec.md:103, spec.md:238, plan.md:190, tasks.md:85 |

Critical は無いので、cascade_enforce の対象になる指摘はありません。

## Verdict

- Critical: 0
- High: 2
- Medium: 6
- Low: 2
