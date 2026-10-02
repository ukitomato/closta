---
spec_id: 009-session-supervisor-and-multi-session
feature_id: X-5
domain: session
domain_selected_by: auto
targets: both
targets_selected_by: user
status: reviewing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: supervisor 分離とマルチセッション (X-5)

**Feature Branch**: `009-session-supervisor-and-multi-session`

**Created**: 2026-10-01

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[session] supervisor 分離とマルチセッション (X-5): セッションのプロセスとストリームを Electron 非依存の supervisor (utilityProcess) に集約し、X-1 の単一セッション不変条件 (session-active で拒否) を外して複数セッションを並行に起動・切り替え・停止できるようにする。同時実行数の上限 (semaphore) と、上限超過時の扱いを決める。stream の逐次パースは supervisor で行い main をブロックしない (Principle IX)。supervisor→main→renderer の IPC はバッチ化する。supervisor 単独起動 (AD-010 / Principle VII) を維持する。renderer は稼働中セッションの一覧と切り替えの最小 UI まで (監視ビューは O-1)。X-4 の起動設定ダイアログとプリセットはそのまま各セッションの起動に使う"

## Summary

複数のセッションを**並行に起動し、一覧から切り替え、個別に終了・停止できる**ようにする。

- セッションのプロセスとストリームを、**1 つの supervisor (`utilityProcess`) に集約**する。supervisor は**調停役スレッド**と、セッションごとの**セッションスレッド**からなる。
- X-1 の単一セッション不変条件 (`session-active` で拒否) を外し、**同時実行数の上限を 10 に固定**する。上限を超えた起動は理由キー `session-limit` で拒否する。
- 本文は従来どおり **main を通さず** supervisor から renderer へ直接送る (Principle IX)。main を経由するのは一覧に要る**状態通知だけ**で、これをバッチ化する。
- renderer には稼働中セッションの**一覧と切り替えの最小 UI** を置く。起動には X-4 の起動設定ダイアログとプリセットをそのまま使う。

**なぜ今**: charter Mission の出発点は「並行して走らせたセッションの所在が分からない」である。X-1 で 1 本起動でき、X-4 で起動条件を選べるようになった。X-5 はそれを**複数本**に広げ、M2「起動条件を選んで複数セッションを回せる」を閉じる。O-1 (監視ビュー) の前提でもある。

## 本 feature の位置づけ

X-1 は supervisor を **per-session の `utilityProcess`** として実装した ([AD-023](../../docs/decisions/0023-application-architecture.md) §1・§6 / [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §1)。本 feature はこれを **単一 supervisor + セッションスレッド**に作り替える (USER 決定 2026-10-01)。

AD-023 §6 が per-session プロセスを選んだ根拠は 3 つあり、本 feature での扱いは次のとおり。

| AD-023 §6 の根拠 | 本 feature での扱い |
|---|---|
| 1 スレッドで全セッションを捌くと、5MB のパース中に他のセッションが止まる | セッションスレッドに分けるので満たす (FR-002) |
| クラッシュ隔離 | **スレッド単位の例外は隔離できるが、プロセス単位の隔離は失う**。supervisor の OOM / ネイティブクラッシュは全セッションに及ぶ。その代償を US-4 で理由付きに示し、`wsl.exe` を残さない |
| 単独起動がセッションと 1:1 で自然 | 単独起動の単位は supervisor 1 プロセスになる。標準入出力で複数セッションを扱う (FR-001) |

この読み替えは本 feature で起票する **AD-043** で行う (FR-015)。**AD-043 は SH-000 (成立性の実測) の結果が出るまで proposed に留める** (USER 決定 2026-10-01)。実測が成立しなければ、実装に進まず利用者に諮る。

継承する規則の正本は先行 feature / ADR に置き、本 spec は参照形で書く (`## Dependencies`)。

## User Scenarios & Testing

### User Story 1 - 複数のセッションを並行に起動する (Priority: P1)

利用者は、セッションが稼働している最中でも X-4 の起動設定ダイアログから新しいセッションを起動できる。各セッションは独立に応答をストリーミングし、承認を求め、中断できる。同時に動かせるのは 10 本までで、11 本目は理由付きで拒否される。

**Why this priority**: charter Journey 3「10 セッションを並列で差配する」の前提であり、M2 の完了判定がここを通る。単一セッション不変を外さない限り、他の Story は意味を持たない。

**Independent Test**:

- fake の supervisor 接続を注入した起動調停の単体で、10 本まで起動でき、11 本目が `session-limit` で拒否されることを確認する。同時に届いた起動要求でも上限を超えないことを確認する。
- E2E (本物の起動調停 + fake の supervisor 接続) で、2 セッションが並行にストリーミングされることを確認する。

**Acceptance Scenarios**:

1. **Given** セッションが 1 本稼働中、**When** 起動設定ダイアログから別のセッションを起動する、**Then** 2 本目が起動し、両方が独立に応答をストリーミングする (`session-active` で拒否されない)
2. **Given** 上限を占めるセッションが 10 本、**When** 11 本目を起動しようとする、**Then** 理由キー `session-limit` で拒否され、プロセスもスレッドも起こされない。ダイアログは入力を保ったまま戻り、「応答待ちのセッションを終了する (または強制終了する) と起動できる」ことが示される。中断だけでは枠は空かない
3. **Given** 上限を占めるセッションが 9 本、**When** 起動要求が 2 件ほぼ同時に届く、**Then** 1 件だけが起動し、もう 1 件は `session-limit` で拒否される
4. **Given** あるセッションの `claude` が終わった (`error` / 終了 / 強制終了)、**When** 枠を数える、**Then** そのセッションは上限に数えられず、新しい起動ができる。応答を終えて次のプロンプトを待つセッション (`done`) と中断したセッション (`interrupted`) は `claude` が生きているので数える
5. **Given** 稼働中のセッションと同じ作業フォルダを選ぶ、**When** 起動設定ダイアログを見る、**Then** 同一フォルダで稼働中のセッションがあることが警告され、起動はブロックされない
6. **Given** 2 本が稼働中、**When** 一方で承認を求められ、もう一方は応答を続ける、**Then** 承認待ちのセッションだけが止まり、もう一方のストリームは止まらない

---

### User Story 2 - 稼働中のセッションを一覧し、切り替え、終了・停止する (Priority: P1)

利用者は稼働中のセッションを一覧で見て、1 つを選んで表示を切り替える。表示していないセッションも裏で動き続け、切り替えた時点で最新の内容が見える。各セッションは一覧から個別に終了・停止できる。

**Why this priority**: 並行に起動できても、どれが何をしているか見えず、切り替えられなければ使えない。charter Journey 3 の「1 つを選んで没入ビューに切り替え、対応後に一覧へ戻る」の最小形である。状態の強調表示や密度切替は O-1 が担う。

**Independent Test**:

- renderer の単体 / component テストで、一覧の表示・切り替え・セッションごとの入力の分離・終了の可否を確認する。
- E2E で、2 セッションを起動して切り替え、裏で届いた応答が切り替え後に見えることを 1 本確認する。

**Acceptance Scenarios**:

1. **Given** 3 本が稼働中、**When** 一覧を見る、**Then** 各行に作業フォルダの表示名・ランタイム・起動時刻・状態 (起動中 / プロンプト待ち / 応答中 / 承認待ち / 中断 / 応答待ち / 終了中 / 失敗 / 終了済み) が出て、表示中のセッションが分かる。応答待ちと終了済みは見分けられる
2. **Given** セッション A を表示中に B が応答を受け取った、**When** B に切り替える、**Then** B の transcript が最新の状態で表示される (取りこぼしも重複も無い)
3. **Given** A の composer に下書きを入力した状態、**When** B に切り替えて戻る、**Then** A の下書きは残っており、B の composer には現れない
4. **Given** B を表示中、**When** プロンプトを送る、**Then** B にだけ届く。承認カードの決定も、そのカードを出したセッションにだけ届く
5. **Given** 応答待ちまたは中断済みのセッションの行、**When** 終了を選ぶ、**Then** そのセッションの `claude` が正常に終わり、枠が空き、行は「終了済み」になって composer は無効になる。破損の警告は出ない。途中出力は残る。期限内に終わらなかった場合は、強制終了に落ちたことが示される。終了の処理中は行が「終了中」になり、強制終了へ切り替えられる
   - **Given** プロンプト待ち (起動済みで一度も送信していない) のセッションの行、**When** 終了を選ぶ、**Then** 期限を待たずにそのセッションの `claude` が止まり、枠が空き、行は「終了済み」になる。破損の警告は出ない (最初のプロンプトの前は会話の履歴がまだ書かれていない [ASSUMED]。入力を閉じても終わらないことは実 claude で確認した — quickstart-results)
6. **Given** 起動中 (状態通知の前) または応答中のセッションの行、**When** 停止を選ぶ、**Then** X-1 の中断 / 強制終了の規則で止まる (状態通知の前の起動中と承認待ちは強制終了だけ。中断は応答中だけ。強制終了の警告を含む)。他のセッションは影響を受けない
7. **Given** `claude` が終わったセッションの行、**When** 閉じる、**Then** 一覧と renderer の保持から消える。表示中の行だった場合は選択が外れる。閉じるまでは内容を読める
8. **Given** 一覧の行が 0 件、**When** 一覧を見る、**Then** 空であることと、新規起動の導線が示される

---

### User Story 3 - 10 本並行でも UI が固まらない (Priority: P2)

10 本のセッションが同時に大量の応答を流しても、表示中のセッションの入力と描画は滑らかに保たれる。本文のパースはセッションスレッドで行い、main も調停役スレッドも本文を JSON として解釈しない。一覧に要る状態通知はまとめて届く。

**Why this priority**: charter KPI「並列時の滑らかさ」を担う。US-1 / US-2 が動けば価値は出るので P2 とするが、supervisor の集約と IPC のバッチ化は本 Story で検証する。

**Independent Test**:

- バッチ化の単体 (fake timers) で、セッション数によらず main→renderer の状態送信が窓 1 つあたり 1 回に収まることを確認する。
- 本文の経路の構造検査と単体で、main と調停役スレッドが本文を解釈しないことを確認する。
- E2E で renderer の long task と入力遅延を計測する。supervisor 内の分離 (スレッド間で止め合わないこと) は supervisor の単体と quickstart で確認する。

**Acceptance Scenarios**:

1. **Given** 10 本が同時にストリーミング中、**When** 表示中のセッションの composer に入力する、**Then** 入力の反映が遅れない (SC-003 の閾値)
2. **Given** 1 本のセッションスレッドが数 MB の SDK 出力 (巨大な tool_result) を受け取ってパースする、**When** 他の 9 本が応答を流している、**Then** 他の 9 本のストリームは止まらない
3. **Given** 10 本の状態が短時間に何度も変わる、**When** renderer の一覧を見る、**Then** 状態はまとめて届き、各セッションの最終状態が一覧と一致する
4. **Given** supervisor を Electron なしで起動する、**When** 起動要求と制御を標準入出力で送る、**Then** 2 セッションが起動し、状態通知と本文が行で返り、終了できる。標準入力が閉じると supervisor は全セッションを止めて終了する (AD-010 / Principle VII)

---

### User Story 4 - 失敗を閉じ込め、プロセスを残さない (Priority: P2)

1 本のセッションが壊れても、他のセッションは動き続ける。supervisor 自体が落ちた場合は、全セッションが理由付きの失敗として示され、`wsl.exe` を孤児として残さない。次の起動で supervisor は起こし直される。アプリを終了すると、すべてのセッションと supervisor が終わる。

**Why this priority**: 1 プロセスに集約した代償 (supervisor の異常終了が全セッションに及ぶ) を正直に扱う Story である。正常系 (US-1〜US-3) が成り立って初めて意味を持つので P2 とする。

**Independent Test**:

- 調停役スレッドの単体 (fake の Worker) で、1 スレッドの異常終了がそのセッションだけを `error` にし、そのセッションの `wsl.exe` に kill が届くことを確認する。
- fake の supervisor 接続で exit を与えた起動調停の単体で、全セッションが `supervisor-exited` になり、次の起動で supervisor が起こし直されることを確認する。
- 孤児が残らないことは quickstart の実機観測で確認する (fake では孫プロセスを踏めない)。

**Acceptance Scenarios**:

1. **Given** 3 本が稼働中、**When** 1 本のスレッドが例外で終わる (または `wsl.exe` が異常終了する)、**Then** そのセッションだけが理由付きの `error` になり、そのセッションの `wsl.exe` は残らず、他の 2 本は応答を続ける
2. **Given** 3 本が稼働中、**When** supervisor プロセスが異常終了する、**Then** 3 本とも理由キー `supervisor-exited` の `error` になり、それまでの出力は renderer で読める。`wsl.exe` は残らない
3. **Given** supervisor が異常終了した後、**When** 新しいセッションを起動する、**Then** supervisor が起こし直されて起動する。失敗したセッションが自動で再開されることは無い
4. **Given** 複数のセッションが稼働中、**When** アプリを終了する (またはウィンドウを閉じる)、**Then** すべてのセッションと supervisor が終了し、`wsl.exe` も UNC ハンドルも残らない

---

### Edge Cases

- 起動直後 (`launching`。`wsl.exe` を起こす前) に上限に達した状態で、別の起動要求が届く → `launching` も上限に数えるので拒否される
- 起動要求が上限判定を通った後、起動前段 (`prepareLaunch`) または supervisor の起動 (fork) で失敗する → 枠は解放され、理由付きで拒否される
- supervisor が異常終了した直後に起動要求が 2 件届く → supervisor は 1 つだけ起こし直す
- 起動要求を送った後、最初の状態通知より前に supervisor が落ちる → そのセッションも `supervisor-exited` になり、枠は解放される
- アプリの終了処理中に起動要求が届く → 理由キー `shutting-down` で拒否する
- 表示中のセッションが失敗した → 表示は切り替わらず、そのセッションの失敗理由を示す
- 表示していないセッションが承認を求めている → 一覧の状態が `awaiting_permission` になる。目立たせる表示は O-1
- セッション画面から別の画面へ移る → 稼働中のセッションは止めない。戻ると一覧に残っている。止めるのは利用者の終了・停止、アプリの終了、renderer の再読み込み・クラッシュだけ
- renderer が再読み込み・クラッシュする → main が全セッションを止める (FR-014)。再読み込み後の一覧は空から始まる
- 起動が `launching` のまま進まない → 行に停止 (強制終了) を出す。利用者が枠を空けられる
- 稼働中のセッションの Provider やプリセットが編集・削除される → 稼働中のセッションには影響しない (X-4 の規則を継承)
- 同一フォルダで並行に動くセッションが同じファイルを書き換える → アプリは調停しない。起動前の警告 (US-1 AC5) までとする
- 同じ場所を指す別の登録フォルダ (ホストパス登録と UNC 登録など) → 警告は登録フォルダの同一性で判定するので出ない。起動は止めないので、この限界は許容する
- 状態通知に、未知の sessionId・別の supervisor 世代のもの・形の崩れた値が含まれる → main はそれを捨てる (supervisor からの入力も検証する)
- `claude` が終わったセッションが一覧に溜まる → 上限には数えない。閉じるまで残す。件数の上限は設けない (意図的な判断。O-1 で再検討)

## Requirements

### Functional Requirements

#### supervisor の形

- **FR-001**: セッションのプロセスとストリームは、**1 つの supervisor (`utilityProcess`)** が持たなければならない。supervisor は調停役スレッドと、セッションごとのセッションスレッドからなる。
  - supervisor は Electron API にもネイティブモジュールにも依存してはならず、**`node <entry>` で単独起動し、標準入出力で起動・制御・状態通知・本文を往復できる**形を保つ (Principle VII / [AD-010](../../docs/decisions/0010-supervisor-runs-standalone.md))。標準入力が閉じたら、全セッションを止めて終了する。
  - 経路の選択と、経路ごとの本文の出し先 (port か行か) の判定は既存の `transport` に閉じる。**supervisor の本体は経路を知らない** ([AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) §5)。
  - `wsl.exe` の文字列リテラルを持たないこと、起動 argv と env を値として受け取ることは X-1 / X-4 の規則を継承する。
- **FR-002**: 各セッションの SDK `query()` の実行と stream の逐次パースは、**そのセッションのスレッドで**行わなければならない。調停役スレッドは、**本文を JSON として解釈せず (構造を復元せず)、不透明な文字列として中継する**。
  - スレッド間の受け渡しで文字列のコピーは起きる。これは許容する。本文の各 part は X-1 の本文上限 (`BODY_MAX_BYTES`) で有界である (tool_result は live 表示に載らない)。
  - 1 セッションの巨大な本文が、他のセッションのストリームを止めてはならない (AD-023 §6 の懸念をスレッド単位で満たす)。
- **FR-003**: 本文 (`SessionEvent`) は、**セッションごとの port で supervisor から renderer へ直接**送らなければならない。main は本文のデータ経路に乗らない (X-1 FR-007 / [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) §1 を継承)。
  - port は一方向 (supervisor→renderer) のままとし、supervisor は port から何も受理しない。
  - 本文を行に埋めて送るのは**標準入出力経路だけ**とする。Electron 経路で port の無い起動要求は拒否する。この判定は `transport` が行う (FR-001)。

#### 状態通知とバッチ化

- **FR-004**: 一覧に要る**状態通知**は、supervisor→main→renderer の経路で送り、**バッチ化**しなければならない。
  - 状態通知に載せるのは sessionId・run-state・失敗の理由キー・`claude` の生存フラグだけとし、**会話由来の文字列を載せない**。一覧の表示名 (作業フォルダ・ランタイム・起動時刻) は main と renderer が起動設定から解決する。
  - sessionId は、調停役スレッドが**送信元のセッションスレッド**から付ける。セッションスレッドが名乗る値は使わない。
  - 生存フラグを false にするのは調停役スレッドと main だけとする。セッションスレッドの送る生存フラグは常に true (「まだ終わっていない」) であり、spawn 前も true である。
  - main は状態通知を未信頼の入力として形を検証し、未知の sessionId・別の supervisor 世代のもの・形の崩れた値を捨てる。main での行のパースは本文を運ばないメタデータに限る ([AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) §2)。
  - バッチは一定の窓 (100ms。[ASSUMED]) でまとめ、同じセッションの通知は最新のものに畳む。**`error` とその理由キー、`claude` の生存フラグの false は、畳んでも後続で上書きされない**。`done` は終端として扱わず、後続の `running` で上書きしてよい。
  - supervisor の異常終了を main が合成した通知は、窓の外で 1 回送ってよい。
  - **生存フラグの false (`child-exited`・スレッドの終了・異常終了の合成) は窓を待たずに即時に送る** (design-gate R3-M-01)。枠の解放と composer の無効化を窓の分だけ遅らせない。即時送信はそのとき溜まっている通知をまとめて 1 回で送る。

#### 並行起動と上限

- **FR-005**: X-1 の単一セッション不変条件 (FR-019 / SC-011) を外し、**同時実行数の上限を 10 に固定**しなければならない。
  - 上限に数えるのは、**枠を占めるセッション**とする。枠は起動要求の予約で占め、`claude` が終わるまで占め続ける。`claude` が終わったと見なすのは次の 4 つだけである。run-state では判定しない — X-1 の `done` は「応答完了・次のプロンプト待ち」と「強制終了後」の両方を表すためである。
    - `wsl.exe` の終了通知
    - `wsl.exe` を起こす前のセッションスレッドの終了
    - `wsl.exe` を起こした後のセッションスレッドの異常終了 (回収の手段を実行した後。回収できなかった場合は件数を記録する)
    - supervisor の異常終了
  - 上限の判定と枠の予約は main で**原子的に**行う。同時に届いた起動要求でも上限を超えない。起動前段や supervisor の起動で失敗した要求の枠は解放する。
  - 上限を超えた起動は、**プロセスもスレッドも起こさずに**理由キー `session-limit` で拒否する。理由キー `session-active` は廃止する。
- **FR-006**: 各セッションの起動は **X-4 の起動設定ダイアログ・プリセット・起動前段 (依存解決の再評価・起動ゲート・env 導出) をそのまま**使わなければならない。新たな起動設定の経路を作らない。
  - 起動設定は起動ごとのスナップショットであり、セッション間で共有しない。
  - 枠を占めているセッションと同じ登録フォルダを選んだときは、ダイアログに**警告を出し、起動はブロックしない** (USER 決定 2026-10-01)。
  - 起動に成功したセッションを表示中にする。

#### 制御の宛先

- **FR-007**: 制御要求 (プロンプト送信・承認の決定・中断・終了・強制終了) は、**sessionId を鍵に該当セッションだけへ**届けなければならない。
  - main は sessionId が既知かつセッションスレッドが生存中であることを検証し、そうでなければ拒否する (X-1 FR-010 を継承)。
  - 承認要求の `requestId` は**暗号論的乱数から生成**し (X-1 pr-gate sec L-001 の繰越)、発行したセッションスレッドに束縛する。別のセッションの `requestId`、未知の `requestId`、既に応答済みの `requestId` に対する決定は、**セッションに何の効果も及ぼさない** (SDK のコールバックを解決しない)。

#### renderer (一覧と切り替えの最小 UI)

- **FR-008**: renderer は、**枠を占める全セッションの port を繋いだまま**、セッションごとの transcript 状態を保持しなければならない (USER 決定 2026-10-01)。
  - 表示していないセッションの更新が、表示中のセッションの入力と描画を待たせてはならない。
  - port が閉じても、そのセッションの transcript は保持したままにする。
  - セッションの寿命は、画面の表示・非表示と切り離す。画面の切り替えや遷移でセッションを止めない (X-1 の「画面を離れたら kill」を撤去する。孤児の防止はアプリ終了時の後始末 FR-014 が担う)。
- **FR-009**: renderer は**稼働中セッションの一覧**を持たなければならない。
  - 各行は作業フォルダの表示名・ランタイム・起動時刻・状態を示し、表示中の行が分かる。行を選ぶと表示を切り替える。
  - 行の状態は run-state と生存フラグの組から決める。とくに `done` は、生存フラグが true なら「応答待ち」、false なら「終了済み」と出し分ける。優先順は `error` (失敗) → 生存フラグ false (終了済み) → run-state とする (design-gate R3)。
  - 一覧から新規起動 (X-4 のダイアログを開く) と、行ごとの終了・停止・閉じるができる。
  - 一覧の行が 0 件のときは空状態と新規起動の導線を示す。
  - 状態の強調表示・情報密度の切替・監視ビューは持たない (O-1)。見た目と UI element の選定は `ui` domain の領分とする。
- **FR-010**: 入力はセッションごとに分離しなければならない。composer の下書き・送信待ちキュー (X-2)・承認カードは、それを持つセッションに束縛する。送信は**送信した時点で表示中のセッション**に届き、切り替えで下書きが別のセッションへ移ってはならない。
  - `claude` が終わったセッション (生存フラグが false) では composer を無効にし、送信待ちキューの項目は取り消し (`cancelled`) にする。送っても拒否されるだけの状態を作らない (X-1 pr-gate po H-001 の継承)。
  - 終了・強制終了を押した時点から (生存フラグが false になる前でも) 同じく composer を無効にし、キューを取り消しにする (design-gate R3-H-04)。セッションスレッドは終了・強制終了を受けた後の送信・承認・中断を無視する。
- **FR-011**: 終わらせ方は次の 3 つとする (USER 決定 2026-10-01)。
  - **終了 (穏当。制御 `end`)**: 生存フラグが true で、応答待ち (`done`)・中断済み (`interrupted`)・**最初のプロンプト待ち** (起動済みで一度も送信していない `launching`。一覧では「プロンプト待ち」) のセッションだけに出す (最初のプロンプト待ちは実装時の pr-gate R1 po H-001 で追加。claude は最初のプロンプトまで何もしないため、使っていないセッションを破損警告付きの強制終了でしか片付けられない形を避ける)。プロンプトの入力を閉じて `claude` を正常終了させる。破損の警告は出さない。終了の処理中は終了を再び押せない (行は「終了中」)。期限内に終わらなければ強制終了に落とし、**強制終了に落ちたことを示す** (X-1 FR-016 の警告の趣旨を黙って外さない)。終了の処理中も強制終了は出す (押した直後に応答中へ移ってセッションスレッドが終了を受けなかった場合も、止める手段を失わせない。pr-gate R2 po M-104)。
    - **最初のプロンプト待ちの終了は期限を待たずに子を止める。** 最初のプロンプトの前は、入力を閉じても `claude` は自分から終わらない (実 claude で、期限切れで強制終了に落ちることを確認した)。この時点の `claude` は会話の履歴 (JSONL) をまだ書いていないので [ASSUMED — ファイル単位では未確認。quickstart-results「実機で見つかって直した不具合」3。`claude` の版が変わったら確かめ直す]、止めても壊れるものが無く、破損の警告 (`end-forced`) は出さない (pr-gate R1 po H-001 / R2 po M-101 / R3 po L-202)。終了を受け付ける状態の規則は domain の `canEnd` 1 か所に置く。
  - **停止**: 起動中 (`launching`) と応答中 (`running` / `awaiting_permission`) のセッションに、X-1 の中断 / 強制終了の規則 (FR-015 / FR-016。強制終了の警告を含む) をセッションごとに適用する。`launching` と `awaiting_permission` では強制終了を出し、中断は `running` だけに出す (承認待ちは承認カードの「拒否」でツールを止める — X-1 の中断の規則の継承)。中断だけでは枠は空かない。
  - **閉じる**: `claude` が終わったセッションの行を、一覧と renderer の保持から外す。利用者が閉じるまで行は残す。表示中の行を閉じたら、選択を外す。

#### 失敗と寿命

- **FR-012**: 1 セッションの失敗 (スレッドの例外・`wsl.exe` の異常終了・stream / プロトコル異常・Provider エラー) は、**そのセッションの理由付き `error` に閉じ込め**なければならない。
  - 他のセッションに波及させない (X-1 FR-020 の理由キーを継承)。
  - スレッドが異常終了したときも、そのセッションの `wsl.exe` を残してはならない。
  - `error` に達したセッションスレッドは、終端の通知を送った後に終わらせる。
- **FR-013**: supervisor プロセスが異常終了したときは、その supervisor で動いていた全セッションを理由キー **`supervisor-exited`** の `error` にしなければならない。
  - `wsl.exe` を孤児として残してはならない (X-1 FR-017 の要求を supervisor の異常終了にも広げる)。実現手段は SH-000 の実測で決める (plan)。
  - 次の起動要求で supervisor を 1 つだけ起こし直す。失敗したセッションを自動で再開しない (再開は X-6)。
  - main は異常終了の原因を追える記録 (終了コード・その時点のセッション数・回収できなかった数) を残す。会話由来の文字列と env は記録しない。
- **FR-014**: window close / before-quit では、全セッションの `wsl.exe` を終了させてから supervisor を終了させなければならない。
  - 孤児プロセス・孤児 UNC ハンドルを残さない (X-1 FR-017 を複数セッションに広げる)。
  - 終了処理は全体に期限を持ち、期限を過ぎたら残りを強制的に終える。終了処理は 1 回だけ走る。
  - renderer が再読み込み・クラッシュしたときは、main は全セッションを止める (renderer の保持と port が失われ、利用者から見えないまま枠を占めるセッションを残さない)。supervisor は止めない。

#### ADR / 用語

- **FR-015**: 本 feature の作り替えを **AD-043** として起票し、次を読み替える (accepted ADR は immutable なので本文を変えない)。
  - [AD-023](../../docs/decisions/0023-application-architecture.md) §1 (レイヤ表の agents の寿命「セッション開始〜終了」)・§6 (`agents` はセッションごとに 1 プロセス。根拠 3 つの扱いは「本 feature の位置づけ」の表のとおり)
  - [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §1 (実行単位は per-session の `utilityProcess`)・§3 (kill ハンドルは agents が保持する。主たる kill 経路は変えず、スレッドや supervisor の異常終了時の回収経路だけを足す)
  - X-1 の FR-002 / FR-019 / SC-011 (単一セッション不変) と、X-4 の US-1 AC7・Edge Cases の `session-active`
  - X-1 の data-model §4 の状態機械 (実装時に追加): `fail` は `error` 以外のすべての状態 (`done` を含む) から `error` へ進む。応答待ちの間の `claude` の異常終了を `error` にするため (SH-022 で発見。pr-gate R1 architecture M-002)
  - [AD-006](../../docs/decisions/0006-supervisor-in-utility-process.md) Consequences の「supervisor 外に stream の `JSON.parse` が存在しないこと」(実装時に追加): 禁じる対象は main (と調停役スレッド) での stream の解釈で、renderer が中継された本文を復元することは許す (pr-gate R1 architecture H-001)
  - AD-043 は SH-000 の実測が揃うまで proposed に留め、揃った時点で accepted にする (2026-10-01 accepted)
- **FR-016**: 導入・変更した用語を glossary に反映する (Principle XIV)。あわせて次を追随させる。
  - `supervisor` / `AgentSession` / `SessionRunState` / `SessionControl` (`end`) / `SessionEvent` (中継の経路・強制終了に落ちた通知) / Message queue (`claude` の終了で取り消し) / 起動系の理由キーの件数の定義
  - 新しい用語: 調停役スレッド / セッションスレッド / 同時実行数の上限 / 状態通知 / 稼働中セッション一覧 / `session-limit` / `supervisor-exited` / `shutting-down` / 生存フラグ (`claudeAlive`) / supervisor の世代 (実装時に追加。pr-gate R1 architecture L-004)
  - 既存の語との区別: 状態通知と SessionSummary (セッション要約行)、稼働中セッション一覧と (列挙の) セッション一覧、同時実行数の上限と起動設定の「上限」軸
  - UI ラベルの訳出は `ui` に置く (Principle XV)
  - session charter (frontmatter・Key concepts・Related Specs / ADRs) と roadmap の X-5 行、Constitution Principle IX の「現状の制約」(事実の追随)

### Key Entities

- **supervisor**: セッションのプロセスとストリームを持つ単一の `utilityProcess`。調停役スレッドとセッションスレッドからなる。Electron 非依存で単独起動できる
- **調停役スレッド**: supervisor の主スレッド。main (または標準入出力) との制御のやり取り、セッションスレッドの起動と終了、状態通知のバッチ化、本文の中継を受け持つ。本文を JSON として解釈しない
- **セッションスレッド**: 1 セッションの `query()` 実行・stream パース・`wsl.exe` の spawn ハンドルを持つスレッド。X-1 の `sdk-agent-session` worker の役割を引き継ぐ
- **セッション registry**: main が持つ sessionId → セッション (表示名・状態・枠の占有・supervisor の世代) の対応。上限の判定と制御の宛先解決に使う
- **状態通知 (SessionStatusUpdate)**: sessionId・run-state・失敗の理由キー・`claude` の生存フラグだけを持つ、一覧用の小さな値。会話由来の文字列を含まない。R-2 の SessionSummary (セッション要約行) とは別物
- **同時実行数の上限**: 10 に固定した semaphore。枠を占めるセッション (`claude` が終わっていないもの。`done` / `interrupted` を含む) を数える
- **SessionRunState / SessionEvent / PermissionRequest / PermissionDecision**: X-1 の型を継承する (再定義しない)。制御に「終了 (`end`)」を、本文のイベントに「終了が強制終了に落ちた」通知を 1 種ずつ足す

### Assumptions / Clarifications

- **[USER 決定 2026-10-01]** supervisor は**単一の `utilityProcess` + セッションスレッド**とする。AD-023 §1・§6 / AD-036 §1・§3 を AD-043 で読み替える (FR-001 / FR-015)
- **[USER 決定 2026-10-01]** 同時実行数の上限は **10 に固定**し、超過は `session-limit` で**拒否**する。待ち行列も設定変更も持たない (FR-005)
- **[USER 決定 2026-10-01]** main を経由してバッチ化するのは**状態通知だけ**とし、本文は port で renderer へ直接送る (FR-003 / FR-004)
- **[USER 決定 2026-10-01]** 表示していないセッションも含め、**全セッションの本文を renderer で保持**する (FR-008)
- **[USER 決定 2026-10-01]** 同一作業フォルダの並行起動は**許可し、起動前に警告**する (FR-006)
- **[USER 決定 2026-10-01 design-gate R1]** 応答待ち・中断済みのセッションに、破損警告の無い**「終了」**を足す (FR-011)
- **[USER 決定 2026-10-01 design-gate R1]** supervisor の異常終了時の `wsl.exe` の回収手段は **SH-000 の実測で決める**。孤児が残らなければ main 側の回収経路は作らない (FR-013)
- **[USER 決定 2026-10-01 design-gate R1]** E2E は**本物の起動調停 + fake の supervisor 接続**で組む。supervisor 内部 (スレッド・中継) は単体と quickstart で確かめる (SC-001 / SC-003 / SC-006)
- **[USER 決定 2026-10-01 design-gate R1]** AD-043 は **SH-000 の後に accepted** にする (FR-015)
- **[ASSUMED]** 状態通知のバッチ窓は 100ms とする (AD-023 Open Question の 100ms と揃える)。値は plan で調整してよい
- **[ASSUMED]** SC-003 の閾値と負荷 (入力反映 p95 50ms・long task の最大 100ms 未満 (件数は記録のみ。SC-003 本文) / 30 秒、各セッション 20 件/秒 × 1KB、うち 1 本に上限いっぱい (`BODY_MAX_BYTES`) の part。renderer に届く本文は agents が `BODY_MAX_BYTES` で切り詰めるため、5MB の tool_result は supervisor 内の分離 (SC-003 末尾・SC-007) で見る) は、RAIL モデルの応答目安と AD-018 の実測規模から置いた初期値である
- **[ASSUMED]** 終了・停止・終了処理の待ち時間の期限 (セッションごと 3 秒、終了処理全体 5 秒) と、セッションスレッドのメモリ上限 (1 本あたり 1GB) は初期値である。SH-000 と quickstart の観測で調整する
- **[ASSUMED]** supervisor の異常終了時の回収 (作る場合) は、pid の検証・即時の終了通知・世代の照合で誤 kill を防ぐ。Windows でプロセスの生成時刻を得るにはプロセスの起動かネイティブ API が要るため、生成時刻による本人確認は行わない。pid 再利用による誤 kill の残余は AD-043 に記録する
- **[ASSUMED]** 一覧の起動時刻は秒まで出す。一覧と切り替えの UI element の選定・配置・ラベル訳出は `ui` domain の領分とする (本 spec は「何を示し、どう切り替えるか」まで)

## Success Criteria

- **SC-001**: **並行起動ができ、上限を超えない。** 2 本以上が独立にストリーミングし、11 本目は `session-limit` で拒否されてプロセスもスレッドも起こされない (0 件)。同時に届いた起動要求でも、`launching` 中のセッションがあっても、枠を占めるセッションが 10 を超えない。`claude` が終わったセッションは数えず、`done` / `interrupted` は数える。起動前段・supervisor の起動の失敗では枠が戻る。計測経路:
  - fake の supervisor 接続を注入した起動調停の単体
  - E2E (本物の起動調停 + fake の supervisor 接続。2 セッションの並行ストリーミングと 11 本目の拒否)
- **SC-002**: **main と調停役スレッドが本文を解釈しない。** main での本文の `JSON.parse` / structured clone deserialize が 0 件で、調停役スレッドでの本文の `JSON.parse` も 0 件。計測経路:
  - port transfer の構造検査 (main が本文 port を保持しない)
  - 本文を不透明な文字列型で運び、調停役スレッドのモジュールに `JSON.parse` が無いことを検査する新しい検査項目 (制御行のデコードは専用モジュールに置き、そのデコーダが本文を受け付けないことを単体で固定する)
  - 手動レビュー。**検査は置き場を見るだけで、どのスレッドで評価されるかの自動証明 (到達集合検査) は未構築である** (AD-031 §2 / AD-034 と同じ留保)
- **SC-003**: **10 本並行でも表示中のセッションが滑らか。** renderer が受ける負荷として、10 本がそれぞれ 20 件/秒・1 件 1KB の本文を 30 秒流し、うち 1 本は上限いっぱい (`BODY_MAX_BYTES`) の part を持つメッセージを 1 回流す間に、composer の入力遅延が p95 50ms 以下で、renderer の long task の最大が 100ms 未満 ([ASSUMED])。50ms 超の long task の件数は合否に使わず、毎回記録する。当初の「long task 0 件」(と一時的に置いた「5 件以下」) は、実装後の実測で 50ms をわずかに超える散発が実行ごとに 0〜10 件と揺れ (値は実測の正本である quickstart-results の SC-003 節を参照)、本機の常駐セキュリティによる揺れと区別できなかったため置き換えた (利用者判断 2026-10-01。実測は quickstart-results)。入力遅延は `keydown` の timeStamp から、composer の値が反映された後の最初の `requestAnimationFrame` までとする。計測経路:
  - E2E (本物の起動調停 + fake の supervisor 接続で上の負荷を流す。PerformanceObserver の `longtask` と上の入力遅延を計測。上限いっぱいの part が計測の窓の中で届いたことも確かめる — pr-gate R2 po M-102)。**E2E は renderer と main の経路を測る。supervisor 内のスレッド分離は通らない**
  - supervisor 内の分離 (1 本のセッションスレッドが 5MB の SDK 出力をパースする間も、他のスレッドの本文が流れる) は SC-007 の単体と、quickstart の実機観測が根拠である — 実機で行ったのは、10 本稼働中に 1 本が巨大な出力 (Bash の `seq 1 300000`) を流している間の別の 1 本への送信 (1.4〜1.9 秒で応答) である。10 本が同時に応答を流す中での入力の実機観測は行っていない (charter KPI「並列時の滑らかさ」の実機側の計測は O-1 の監視ビューと合わせて行う。pr-gate R1 po M-002)
- **SC-004**: **状態通知がバッチで届き、最終状態が一致する。** セッション数によらず、main→renderer の状態送信は窓 1 つあたり 1 回以下 (supervisor の異常終了の合成 1 回と、生存フラグの false による即時送信を除く。FR-004) で、`error` と理由キー、生存フラグの false が失われない。状態通知に会話由来の文字列が 0 件。他のセッションを名乗る通知・別世代の通知・生存フラグの false→true は反映されない。計測経路: バッチ化と畳み込みの単体 (fake timers / 10 セッション分の連続遷移) + 状態通知の全フィールド走査 + main の受信検証の単体
- **SC-005**: **制御が別のセッションに届かない。** セッション A 宛ての送信・決定・中断・終了・強制終了が B に届く経路が 0 件。未知 / 終了済みの sessionId は main で拒否される。別セッション・未知・応答済みの `requestId` の決定は SDK のコールバックを解決しない。`requestId` は暗号論的乱数から作られる。計測経路:
  - main の IPC ハンドラを preload をスタブせず直接呼ぶ単体 (sessionId の負例)
  - 調停役スレッドの宛先解決の単体
  - セッションスレッドの承認往復の単体 (`requestId` の生成器と pending の照合を純粋部分に切り出して、負例と乱数源を確かめる)
- **SC-006**: **切り替えで内容と入力が保たれ、終わり方が見える。** 裏で届いた応答が切り替え後に取りこぼし・重複なく見え、下書きと送信待ちキューはセッションごとに保たれ、送信は表示中のセッションにだけ届く。並行起動で port が handshake より先に逆順で届いても、各 port は自分のセッションにだけ繋がる。画面の切り替え・遷移では kill が送られず、port が閉じても transcript は残る。応答待ちと終了済みが別の表示になり、終了済みでは composer が無効でキューは取り消しになる。終了・停止・閉じるは状態に応じてだけ出る (状態通知の前の起動中と承認待ちは強制終了だけ、プロンプト待ちは終了と強制終了、終了中は強制終了)。強制終了に落ちた終了はその旨が示される。同一フォルダのセッションがあると警告が出て、起動は有効のまま。計測経路: renderer の単体 / component テスト + E2E 1 本 (2 セッションの起動 → 切り替え → 送信)
- **SC-007**: **失敗が閉じ込められる。** 1 スレッドの例外 (応答待ち中を含む)・メモリ上限超過・`wsl.exe` だけの異常終了で、そのセッションだけが理由付き `error` になり、そのセッションの `wsl.exe` に kill が届き、他のセッションの本文と状態通知は流れ続ける。強制終了後の正常なスレッド終了は異常終了と判定されない。承認待ちのセッションがあっても、1 本が巨大な出力をパースしていても、他は止まらない。supervisor の異常終了では、その世代の全セッションが `supervisor-exited` になり、次の起動で supervisor が 1 つだけ起こし直される。アプリは例外で落ちない。計測経路: 調停役スレッドの単体 (fake の Worker) + fake の supervisor 接続で exit を与えた起動調停の単体
- **SC-008**: **プロセスを残さない。** アプリ終了・ウィンドウを閉じる・renderer の再読み込み・スレッドの異常終了・supervisor の異常終了のいずれでも、`wsl.exe` の残存が 0 件 (アプリ終了・ウィンドウを閉じるでは supervisor も 0 件)。終了処理は 1 回だけ走り、期限内に終わる。計測経路:
  - 終了処理の単体 (全セッションの kill → supervisor の終了の順序、再入しないこと、期限で打ち切ること) と、renderer の再読み込み検知で全セッションに kill が送られる単体
  - **実機観測が唯一の実測根拠** (fake では孫プロセスを踏めない。X-1 SC-005 と同じ留保)。アプリ終了・再読み込み・supervisor の異常終了・`wsl.exe` の停止は quickstart で観測する。スレッドの異常終了 (Worker の終了) は本番ビルドで誘発する手段が無いので、SH-000 (3) の試作での実測を根拠とする
- **SC-009**: **supervisor が単独起動できる。** ビルドした supervisor を Electron なしで `node` で起動し、標準入出力で 2 セッションを起動 → 状態通知と本文を受け取る → 終了でき、標準入力を閉じると終了する。計測経路:
  - 調停役スレッドの処理を標準入出力の transport (fake) と fake の Worker で動かす単体
  - `lint` (ESLint boundaries) と `depcruise` (`agents-not-to-electron` / `agents-not-to-native`) が緑
  - ビルド出力の検査: supervisor と worker のチャンク、およびそれらが静的に読む全チャンクの `require` / `import` に `electron` が 0 件で、外部依存が SDK だけであること (depcruise は外部パッケージ経由の到達を見ないため、`.dependency-cruiser.js` の限界注記が定める代替証拠)
  - quickstart で、ビルド成果物を `node` で起動する実機確認 (R-2 SH-094 と同じ形)。素の `node` では `require('electron')` が例外にならないので、起動できたことは electron 非依存の証明にならない — 上のビルド出力の検査と組で根拠にする
- **SC-010**: **X-4 の起動経路が回帰しない。** 各セッションの起動が X-4 のダイアログ・プリセット・起動前段を通り、X-1 / X-4 の既存テスト (単一セッション不変を前提にしたものは本 feature の規則へ書き換える) が緑。計測経路: 既存テストスイート + 書き換えたテストの差分レビュー

## Dependencies

- **X-1** ([005](../005-session-launch-and-streaming/spec.md)): 起動・ストリーミング・承認往復・中断 / 強制終了・理由キー・env の許可リスト・XSS 境界・Principle IX の担保方式を**継承**する。FR-002 (per-session プロセス) / FR-019 / SC-011 (単一セッション不変) は本 feature が AD-043 で読み替える
- **X-2** ([006](../006-ui-japanese-ime-composer/spec.md)): composer の IME ガード・送信待ちキュー・下書き復元を継承し、セッションごとに分離する (FR-010)
- **X-4** ([008](../008-session-launch-settings-dialog-and-presets/spec.md)): 起動設定ダイアログ・プリセット・依存解決・起動前段・env の WSL 配送・`--exec` を**そのまま**使う。`session-active` の拒否は本 feature で `session-limit` に置き換わる
- **AD-043 (本 feature で起票する調停 ADR)** の決定範囲: FR-015 のとおり
- 関連 ADR:
  - [AD-006](../../docs/decisions/0006-supervisor-in-utility-process.md) (supervisor は `utilityProcess`)
  - [AD-010](../../docs/decisions/0010-supervisor-runs-standalone.md) (単独起動)
  - [AD-018](../../docs/decisions/0018-wsl-process-control.md) (中断・kill・stdin)
  - [AD-023](../../docs/decisions/0023-application-architecture.md) §1・§6 / Open Question (寿命 / per-session / 背圧)
  - [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) §5 (経路の選択は transport に閉じる)
  - [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) §2 (Principle IX の適用範囲と検証の限界)
  - [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) §1 (port transfer)
  - [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) (単一セッション起動)
  - [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (X-4 の起動ゲート)

## Out of Scope

- **監視ビュー** (状態の強調表示・承認待ちを目立たせる・compact / comfortable の密度切替・一覧 ⇄ 没入の往復) → **O-1**
- **上限の設定変更・上限超過時の待ち行列** → 持たない (USER 決定)。必要になれば O-1 以降で再検討する
- **終了したセッションの保持件数の上限・自動で閉じる** → 持たない (意図的な判断)。O-1 で再検討する
- **枠を占める本数 (例: 8/10) の常時表示** → O-1 (監視ビュー)。本 feature では上限に当たったときの拒否文言で示す
- **renderer の再読み込み後に稼働中のセッションへ繋ぎ直す** → 持たない。再読み込み時は全セッションを止める (FR-014)
- **fork / resume / rename / tag / delete、失敗したセッションの再開** → **X-6**
- **`SessionStore.append` の背圧設計** (AD-023 Open Question の 100ms バッチ転送) → **I-1** (`sessionStore` を持つ feature)
- **同一フォルダで並行に動くセッションのファイル競合の調停** → 持たない。起動前の警告まで
- **Win32Runtime 直接起動・Docker 内起動** → X-6 / I-*。supervisor 異常終了時の回収は WslRuntime ([AD-018](../../docs/decisions/0018-wsl-process-control.md) の実測) に限って成り立つ
- **transcript / tool 出力の描画・承認カードの見た目・一覧の element 選定** → `ui` domain (本 domain はデータを供給するまで)
