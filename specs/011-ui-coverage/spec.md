---
spec_id: 011-ui-coverage
feature_id: O-2
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: reviewing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: ui-coverage 対応表の確立 (O-2)

**Feature Branch**: `011-ui-coverage`

**Created**: 2026-10-03 (design-gate R1 の指摘を反映)

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "O-2 (roadmap M3 の順 11、domain: ui、依存: O-1): docs/ui-coverage.md の確立 (SDK が emit する 39 型から機械的に導出する。AD-020) と Tier B/C の再棚卸し。O-1 からの義務 4 件 ((1) Hook / Background task の表示の割当と状態の持ち主 (2) Tool group の既定 open 化 (3) transcript の情報密度の切替 (4) 直近の活動の tool ごとの整形) と P-4 (ui-coverage-reviewer の追加)、X-1 からの申し送り (承認カード・聞かれずに拒否された操作) を含める。"

## Summary

Claude Code (Agent SDK) が emit する情報と、その表示の対応表 **`docs/ui-coverage.md`** を作り、Constitution Principle XII を検証できる状態にする。

- 対応表の行は **SDK の型定義から機械的に導く** (AD-020 Decision 1)。メッセージ型 39 種、tool の入力型、制御要求を行にし、各行に表示の割当を書く。**型が増えた・減った・割当が空、のどれでも CI が落ちる**。
- 各行の割当は 3 種類のどれかにする: (a) 実装済みの表示、(b) roadmap にある後続 feature の ID、(c) 表示不要と理由。未割当は残さない。この読み方は ADR と Constitution XII の改定 (MINOR) で正本にする (USER 決定 2026-10-03)。
- 実行中のセッションで今は捨てている **tool の結果** と、**Hook / Background task のシステムイベント** を transcript に出す (O-1 の義務 (1))。
- transcript の**情報密度** (compact / comfortable) を切り替えられるようにし、Tool group の既定の開閉を密度で決める (O-1 の義務 (2)(3))。
- 監視ビューの直近の活動を **tool ごとに要点だけ** にする (O-1 の義務 (4))。
- 対応表の判断を要する点を見る **`ui-coverage-reviewer`** を足す (P-4)。

**なぜ今**: M3 の達成状態は「未表示情報がゼロ」である。対応表が無い間は Principle XII が検証できず、どの UI 系 feature も「未表示が無い」ことを示せない (roadmap「O-2 で対応表そのものを成果物にする」)。調査 (2026-10-03) では、39 型のうち表示に届いているのは 4 型 (assistant / result の成否 / permission_denied / 過去ログの compact_boundary) だけで、実行中は tool の結果も捨てている。

## 本 feature の位置づけ

- **作り変えない。** 表示の実装は「割当を決めること」と、O-1 の義務・利用者が範囲に入れた 2 つ (実行中の tool の結果、Hook / Background task) に限る。残りの表示は、対応表で後続 feature (O-4 / O-5 / O-6。いずれも domain `ui`) に割り当てる。
- **domain は `ui`、ただし session の経路を 1 か所広げる。** 実行中のシステムイベントと tool の結果は agents の層で捨てられているので、**会話由来の文字列を無害化して既存の `message` の経路で通す**。`SessionEvent` の種類・IPC・preload・main は増やさない。Hook / Background task の状態は保持しない (実行中の task の一覧は作らない。1 つの task の行は transcript のメッセージの中で書き換える) ので、状態の持ち主の domain は要らない。
- **Hook は SDK が既定で出すもの (SessionStart / Setup) だけを表示する。** PreToolUse などの Hook を出すには query の options (`includeHookEvents`) を足す必要があり、その集合は AD-041 (g) で固定されている。一般の Hook は対応表で後続 (O-6) に割り当て、ADR が要ることを書く (USER 決定 2026-10-03)。
- **Principle XII の「割当」の読み方**: 後続 feature の ID を書いた行は割当済みとみなす。ただし ID は roadmap に実在するものに限り、機械検査で確かめる。後続の行が残っていても本 feature は completed にできる。M3 の「未表示ゼロ」までの残り (Tier A の後続の行) は別に数える (FR-003)。

## Clarifications

### Session 2026-10-03

- Q: O-2 はどこまで表示を実装するか → A: 対応表・機械検査・reviewer・O-1 の義務 4 件と割当の確定。表示の実装は後続 feature に分ける
- Q: 実行中のシステムイベント (Hook / Background task) をどう分担するか → A: session は無害化して通す経路だけを足し (状態は保持しない)、ui が transcript の行として描く。実行中の一覧は作らない
- Q: 実行中の tool の結果を本 feature で扱うか → A: 扱う
- Q: Constitution XII / XIII を改めるか → A: 改める。ADR (AD-044) を起こして利用者が accepted にし、版は MINOR (v1.3.0) とする (design-gate R1 の指摘を受けて PATCH から改めた)
- Q: 後続 feature をどう置くか → A: M3 に O-4 (計量と制限)、O-5 (MCP・Elicitation・プラグイン・コマンド)、O-6 (会話の境界と tool の専用表示の第 2 弾) を足す。domain はいずれも `ui` (SDK が emit する情報の表示。MCP サーバーの追加・削除などの操作画面は含めない)。Permission grant は I-3 のまま
- Q: roadmap が「O-2 の前」に置いた store / 一覧の切り出しをどうするか → A: 持ち主を「store に派生値を足すか行を触る次の feature」に付け替える
- Q: ToolFallback だけで出る tool の行は「実装済み」か → A: Tier B / C の行に限る。Tier A の行は専用表示か後続 feature の ID を要る
- Q: (design-gate R1) Hook はどこまで出すか → A: 既定で出る SessionStart / Setup だけ。`includeHookEvents` は足さない
- Q: (design-gate R1) 名前を持たない task の更新で、1 つの task を 1 行に保つには → A: renderer が同じ id の行に合成する (状態は transcript のメッセージの中にだけある)。行の無い id の更新は捨てる

## User Scenarios & Testing

### User Story 1 - SDK が emit する情報のどれが、どこに表示されるかが分かる (Priority: P1)

開発者 (この製品の作り手) は `docs/ui-coverage.md` を見るだけで、SDK が emit するメッセージ型・tool・制御要求・アプリが作る経路のそれぞれについて、表示がどこにあるか、どの feature が受け持つか、なぜ表示しないかが分かる。SDK を上げて型が増えると、CI が「対応表に無い型がある」で落ちる。

**Why this priority**: Principle XII の検証の土台であり、M3 の「未表示ゼロ」を判定する唯一の手段である。これが無いと他の US の範囲も決められない。

**Independent Test**: 対応表の検査を、現在の SDK と対応表に対して流して通ること、わざと崩した入力でそれぞれ理由を示して落ちることを確かめる。

**Acceptance Scenarios**:

1. **Given** 現在の SDK (0.3.270) と対応表、**When** 検査を流す、**Then** 通る。出力に節ごとの行の数と、割当の種類 × Tier の件数、後続 feature の ID ごとの件数が出る
2. **Given** SDK の型定義に対応表に無いメッセージ型がある (型が増えた)、**When** 検査を流す、**Then** その型の名前を示して落ちる。対応表にあって SDK に無い型 (型が減った) でも同様に落ちる
3. **Given** 対応表のある行の割当が空・「未割当」・roadmap に無い feature ID のどれか、**When** 検査を流す、**Then** その行を示して落ちる
4. **Given** 対応表、**When** X-1 の承認カードと「聞かれずに拒否された操作」の行を見る、**Then** どちらも実装済みの表示として割り当てられている (X-1 からの申し送り)
5. **Given** 新しいメッセージ型の表示を足す PR、**When** pr-gate が走る、**Then** `ui-coverage-reviewer` が起動し、対応表の行の更新が同じ PR に含まれているかを見る

---

### User Story 2 - 実行中のセッションで tool の結果とシステムイベントが見える (Priority: P1)

利用者は実行中のセッションで、tool を呼んだ結果 (Bash の出力、Edit の結果など) と、セッションの開始時の Hook・Background task の開始と終了を、transcript の中で見られる。今は呼び出しだけが出て結果が出ず、Hook と Background task は何も出ない。

**Why this priority**: 対応表で最も大きい欠けである。tool の結果が見えないと、承認した操作が何をしたかを実行中に確かめられない (charter Journey 2)。Hook と Background task は O-1 から渡された義務 (1) である。

**Independent Test**: agents の変換の単体 (SDK のメッセージ → `SessionEvent`) と、renderer の component テスト (イベント → transcript の表示) で確かめる。実 `claude` での見え方は目視 (quickstart V-4) で確かめる。

**Acceptance Scenarios**:

1. **Given** 実行中のセッションで `Bash` の呼び出しが出ている、**When** その結果が届く、**Then** 同じ呼び出しの表示 (Terminal block) に出力が出る。過去ログで同じセッションを開いたときと同じ形である
2. **Given** tool の結果がエラー、または本文の上限を超えて切り詰められた、**When** 届く、**Then** エラーであること・切り詰めたことが呼び出しの表示に出る
3. **Given** SessionStart / Setup の Hook が設定されている、**When** セッションを起動する、**Then** Hook の名前 (または Hook の種類) と結果 (成功・失敗・取り消し) が 1 行で出る。Hook の出力本文は出さない。PreToolUse などの Hook は本 feature では出ない (対応表で後続に割り当てる)
4. **Given** 背景で始まった task (Background task) が始まり、状態が変わり、終わる、**When** transcript を見る、**Then** task ごとに 1 行が出て、状態 (実行中→完了・失敗など) が同じ行で書き換わる。進捗の要約は出さず、実行中の task の一覧も出さない
5. **Given** 過去ログに同じ Hook / Background task のシステムメッセージが残っている、**When** 過去ログを開く、**Then** 実行中と同じ形で出る (残っているかは実データで確かめ、残っていなければ対応表の経路を「実行中のみ」と書く)
6. **Given** Hook / task の行の終わり (応答・完了の通知) が来ないままセッションが終了・失敗した、または過去ログに終わりが無い、**When** transcript を見る、**Then** その行は「結果不明」として出る (「実行中」のまま残らない)
7. **Given** subagent の呼び出し (SDK の tool 名が `Agent` でも `Task` でも)、**When** 表示する、**Then** Subagent の専用表示になる (fallback にならない)

---

### User Story 3 - transcript の情報密度を切り替える (Priority: P2)

利用者は transcript を、tool の中身まで読む comfortable と、会話の流れを追う compact で切り替えられる。comfortable では Tool group が開いた状態で出る。

**Why this priority**: O-1 から渡された義務 (2)(3) である。R-4 の専用表示は既定で閉じた Tool group の内側にあり、開かないと見えない (AD-035 Trade-off)。US-1 / US-2 が無くても価値はあるが、表示の量を増やす US-2 と組で効くので P2 とする。

**Independent Test**: transcript の component テストで、切り替えと各密度の Tool group の開閉を確かめる。

**Acceptance Scenarios**:

1. **Given** 既定の状態で transcript を開く、**When** tool の呼び出しを含む応答を見る、**Then** comfortable で、Tool group は開いて専用表示が見える
2. **Given** comfortable、**When** compact に切り替える、**Then** Tool group と Reasoning は閉じ、メッセージの間隔が詰まる。開けば中身は同じに見える
3. **Given** 密度を切り替えた、**When** 別のセッションに切り替える・過去ログを開く、**Then** 選んだ密度は保たれる
4. **Given** 利用者が個々の Tool group を開閉した、**When** 新しいメッセージが届く・ストリーミングが進む、**Then** 利用者の開閉は保たれる。密度を切り替えたときは、すべての Tool group が新しい密度の既定に戻る
5. **Given** セッション画面、**When** 密度の切り替えを見る、**Then** transcript の密度の切り替えは監視ビューの行の密度と別の位置・文言で、どちらに効くかが分かる

---

### User Story 4 - 監視ビューの直近の活動が tool ごとに要点だけを出す (Priority: P3)

利用者は監視ビューの行で、各セッションがどのファイルを触っているか、どのコマンドを実行しているかを、tool の入力をそのまま読まずに分かる。

**Why this priority**: O-1 から渡された義務 (4) である。今は tool 名と入力の先頭 1 行を出しており、読みにくく、入力の先頭に秘密 (トークンなど) が出うる。監視ビュー自体は O-1 で動いているので P3 とする。

**Independent Test**: 直近の活動を作る純関数の単体で確かめる。

**Acceptance Scenarios**:

1. **Given** 最後の活動が `Edit` / `Write` / `Read` の呼び出し、**When** 行を見る、**Then** tool 名と対象のファイル名 (パスの末尾だけ) が出る
2. **Given** 最後の活動が `Bash` の呼び出し、**When** 行を見る、**Then** tool 名とコマンドの名前だけが出る (引数・環境変数の代入は出さない)
3. **Given** 整形の規則が無い tool、**When** 行を見る、**Then** tool 名だけが出る (入力は出さない)
4. **Given** 承認待ち、**When** 行を見る、**Then** 同じ規則で整形した要点が出る
5. **Given** 最後のメッセージが Hook / task の行か結果だけのメッセージ、**When** 行を見る、**Then** それより前の活動が保たれる (直近の活動が空にならない)

---

### Edge Cases

- SDK の型が増えたが表示はまだ要らない → 対応表に「表示不要: 理由」か後続 feature の ID で行を足せば CI は通る。型を足さずに CI を通す経路は無い。SDK を上げたときの手順は対応表の冒頭に書く
- 対応表の後続 feature の ID が roadmap から消えた (feature の統合・改名) → 検査が落ちる。対応表の行を付け替える
- 検査の入力 (SDK の型定義・対応表・roadmap) のどれかが無い → 「検査対象なし」で通さず、違反として落ちる
- tool の結果が呼び出しより先に届く、または対応する呼び出しが見つからない → 過去ログと同じく、結果だけの表示に倒す (落とさない)
- tool の結果が非常に大きい (数 MB の出力) → 本文の上限 (`BODY_MAX_BYTES`) で切り詰め、切り詰めたことが分かる
- tool の結果やシステムイベントの文字列に制御文字・双方向制御文字・HTML が含まれる → 既存の本文と同じ無害化 (`sanitizeBody`) を通し、テキストとしてだけ描く
- Hook の出力や Background task の説明に秘密が含まれうる → Hook は出力本文を出さない。task の説明は会話由来の文字列として扱い、1 行に正規化して切り詰め、状態の文言と見た目で区別する
- Hook が失敗した → 失敗の行に、Hook の設定と Claude Code のログを確かめるよう案内する文言を添える (出力本文は出さない)
- task の更新が、行の無い task (開始を見ていない・前景の・transcript から隠すよう SDK が指定した task) に届く → 説明を含む更新でも行を作らず捨てる
- 状態を持たない task の更新 (背景への移動・経過時間の更新だけなど) → 行の状態を変えない
- 過去ログを開いた時点で外の端末でまだ動いている task → 記録に終わりが無いので「結果不明 (記録に終わりが無い)」と出る
- task の説明がコマンドの文字列で、代入や秘密の形を含む → 説明を出さず task の種類だけで描く
- SDK が知らない subtype のシステムメッセージを送る → 通す経路の許可リストに無いものは捨てる (SDK の注記「知らない型と subtype は無視する」に従う)
- 密度を切り替えた瞬間にストリーミング中 → スクロール位置を奪わない (R-3 のアンカリングを壊さない)
- 直近の活動の tool 入力が JSON として読めない・必要なフィールドが無い・代入の値にクォートやバックスラッシュがある → tool 名だけを出す

## Requirements

### Functional Requirements

#### 対応表と機械検査 (US-1)

- **FR-001**: `docs/ui-coverage.md` を作り、次を行にしなければならない。
  - `SDKMessage` の全メンバー (SDK 0.3.270 で 39 種)。メンバー 1 つにつき 1 行とし、メンバーの中の subtype は備考に書く。`SDKMessage` の外で stdout に現れる型 (`SDKActiveGoalMessage` など) は別の小節に置く
  - tool の入力型 (`sdk-tools.d.ts` の `ToolInputSchemas` の各メンバー) と、それに対応する実行時の tool 名
  - SDK の制御要求 (`control_request` の subtype。AD-020 Decision 1 の「control 経路」)
  - メッセージの中身のブロック (assistant: `text` / `thinking` / `redacted_thinking` / `tool_use` / `server_tool_use` など、user: `tool_result` / `image` / `document`)。過去ログと実行中で扱いが違うものは両方を書く
  - アプリが SDK の callback や制御から作る表示の経路 (承認要求 `canUseTool` など)。X-1 の承認カードと「聞かれずに拒否された操作」を含む
  - 対応表には調べた SDK のバージョンと、SDK を上げたときの手順を書く
  - 他 domain の一覧画面に出る値 (`SDKSessionInfo` の各フィールドなど) は行にしない (ui charter Out of scope。理由を対応表に書く)
  - **決定 (割当の 3 種類と後続 ID の読み方、Tier の決め方、機械照合する節、M3 の完了の条件) の正本は AD-044、書式の詳細 (列・値の綴り・SDK を上げたときの手順) の正本は対応表の凡例**。食い違ったら AD-044 を正とする
- **FR-002**: 各行は、表示の割当を次の 3 種類のどれかで持たなければならない。空・「未割当」・「TBD」・「—」は割当ではない。
  - **実装済み**: 表示を担うコンポーネント (element) と、実行中 / 過去ログのどちらで出るか。汎用の表示 (ToolFallback など) だけで出る行を実装済みにできるのは Tier B / C の行に限る
  - **後続 feature**: roadmap に実在する feature の ID
  - **表示不要**: 理由 (内部制御・重複など)。Tier C の行は「表示不要: Tier C (理由)」と書く
  - 各行に Tier (A / B / C) を書く。行の Tier の決め方 (Claude Code の一次概念に直結するか) は glossary と対応表の凡例に書く
- **FR-003**: 対応表を検査し、CI で流さなければならない。次のどれかで失敗する。
  - SDK の型定義にある型・tool・制御要求の行が無い / 対応表にあって型定義に無い行がある
  - 割当が FR-002 の 3 種類のどれでもない / 後続 feature の ID が roadmap に無い / ToolFallback だけで実装済みの行が Tier A
  - 対応表の SDK のバージョンが入っている SDK と違う / 検査の入力のファイルが無い・読めた名前が極端に少ない
  - 後続 feature の ID として有効なのは roadmap の feature の表の ID だけで、完了済みの feature の ID は違反にする
  - 失敗の出力は該当する行と理由を示す。通ったときの出力に、節ごとの行の数、割当の種類 × Tier の件数、後続 feature の ID ごとの件数とその milestone を出す。**M3 の完了の条件は「Tier A の後続のうち、割当先が M3 の feature の行が 0」** (M4 以降の feature に割り当てた Tier A の行 (Permission grant → I-3 など) は M3 の条件に数えない)
- **FR-004**: 本 feature で割り当てる後続 feature を roadmap に登録しなければならない。持ち主のいない延期を残さない (AD-028 §5)。
  - M3 に **O-4** (計量と制限: 費用と使用量・レート制限・API の再試行・コンテキストの使用量・task の進捗)、**O-5** (MCP・Elicitation・プラグイン・コマンド: Server panel・Elicitation form・`AskUserQuestion` など)、**O-6** (会話の境界と tool の専用表示の第 2 弾: 圧縮・ファイル・Checkpoints・モデルの拒否・通知・`Read` / `Glob` / `Grep`・Web search / fetch・Agent plan の markdown・実行中の subagent の入れ子・一般の Hook (`includeHookEvents` の ADR を含む)・実行中の Background task の一覧の要否・前景から背景に移った task の行・B 節 (中身のブロック) の機械照合) の 3 行を足す。domain はいずれも `ui`。Permission grant は I-3 のまま
  - 元の O-2 のプロンプト (docs/prompts.md) が名指した 8 つの表示は、それぞれの行の割当先として現れる
- **FR-005**: element 側の Tier B / C の再棚卸し (AD-019 で未分類の 59 要素) を行い、結果を対応表の文書に element の分類として記録しなければならない。charter と AD-019 の Open Questions に答える
- **FR-006**: `ui-coverage-reviewer` を `/cl-add-reviewer` で追加しなければならない (P-4)。
  - 観点は判断を要するもの (新しい型・tool・ブロックの表示を足す PR に対応表の更新が同じ PR で含まれているか、割当の種類と Tier が妥当か、後続 feature への割当が持ち主の範囲に合うか) に限り、FR-003 の機械検査と同じことを見ない
  - 起動するのは pr-gate だけ。reviewers.yml・agent registry (`invoked_by: pr-gate`)・cl-pr-gate の候補の一覧・reviewer の担当表に組み込み、実際に起動されるようにする

#### 実行中の tool の結果とシステムイベント (US-2)

- **FR-007**: 実行中のセッションで、SDK の `user` メッセージに含まれる tool の結果を renderer に届け、対応する tool の呼び出しの表示に出さなければならない。表示の形は過去ログ (R-3 / R-4) と同じにし、エラーと切り詰めを示す。あわせて、実行中の経路で捨てている `redacted_thinking` を過去ログと同じ扱い (Reasoning) にそろえる
- **FR-008**: 実行中のセッションで、次の 5 つのシステムメッセージを変換して renderer に届けなければならない: `hook_started` / `hook_response` / `task_started` / `task_updated` / `task_notification`。
  - 通すフィールドの正本は data-model §2。**Hook の出力本文・終了コード、task の prompt・要約・出力ファイル・更新の説明は通さない**
  - task は背景で始まった task (`is_backgrounded` が true で、ambient でも transcript から隠すものでもない) だけを変換する。前景の task (subagent の呼び出しなど) は既存の表示がある
  - 会話由来の文字列は既存の本文と同じ無害化を通す。状態通知 (`SessionStatusUpdate`) には載せない (X-5 FR-004)
  - `hook_progress` / `task_progress` / `background_tasks_changed` と、許可リストに無い型・subtype は通さない (対応表で表示不要か後続に割り当てる)
  - query の options は変えない (`includeHookEvents` を足さない。AD-041 (g))。したがって Hook は SessionStart / Setup のものだけが届く
- **FR-009**: transcript は、FR-008 のイベントを会話の流れの中の 1 行として描かなければならない (Hook: 名前と結果、task: 説明と状態)。
  - 1 つの Hook / task は 1 行とし、同じ Hook / task の後続のイベントは同じ行に合成する (名前や状態の無い更新は前の値を保つ)。行を作れるのは Hook の開始・応答と task の開始だけで、行の無い Hook / task への更新は捨てる。過去ログも同じ規則
  - 行は assistant の発話と見分けられる形で描き、コピーなどの操作や応答中の印を付けない
  - セッションが終了・失敗した後、または過去ログの終わりで、終わりの来ていない行は「結果不明」として描く
  - 実行中の task の一覧 (状態の保持) は作らない
- **FR-010**: Subagent の専用表示は、実行時の tool 名が `Agent` でも `Task` でも当たらなければならない (SDK 0.3.270 の入力型は `AgentInput`)。対応表の tool の行も実行時の名前で書く
- **FR-011**: FR-007 / FR-008 で足す経路は、既存の `message` の経路 (port) を使い、main を経由しない (AD-034 / AD-043)。`SessionEvent` の種類・IPC のチャネル・preload・調停役スレッドのプロトコルは増やさない

#### transcript の情報密度 (US-3)

- **FR-012**: transcript は compact / comfortable の 2 つの情報密度を持ち、利用者が切り替えられなければならない。既定は comfortable [ASSUMED]。
  - comfortable: Tool group と専用表示を開いた状態で出す (AD-035 Trade-off の「既定 open 化」への回答)。Reasoning は既存の既定のまま
  - compact: Tool group と Reasoning を閉じた状態で出し、メッセージの間隔を詰める
  - 利用者が個々に開閉したものは、新しいメッセージ・ストリーミングでは上書きしない。密度を切り替えたときは新しい密度の既定に戻す
  - 切り替えは監視ビューの行の密度 (O-1) と別の位置・文言にし、どちらに効くかが分かるようにする
- **FR-013**: 選んだ密度は、セッションの切り替えと過去ログ / 実行中の行き来を通して保たなければならない。アプリの再起動では既定に戻る [ASSUMED — 永続化は持たない]。監視ビューの行の密度とは別の設定である

#### 直近の活動の tool ごとの整形 (US-4)

- **FR-014**: 監視ビューの直近の活動は、tool の入力から tool ごとの要点だけを出さなければならない。
  - ファイルを扱う tool (`Read` / `Edit` / `Write` / `MultiEdit` / `NotebookEdit`): パスの末尾 (ファイル名) だけ
  - `Bash`: コマンドの名前だけ (先頭の環境変数の代入を飛ばし、パスは末尾だけ)。代入の値にクォートやバックスラッシュがある、または名前が安全な文字だけで書けないときは出さない
  - `Agent` / `Task`: subagent の種類
  - 規則の無い tool・入力が読めないとき: tool 名だけ (入力は出さない)
  - 承認待ちの行も同じ規則で整形する
  - 直近の活動は、Hook / task の行と結果だけのメッセージを読み飛ばして、それより前の活動から導く (O-1 FR-006 を保つ)
  - 規則の正本は data-model §4 と `session-view.ts`。session charter に記録する (監視ビューは session の操作 UI なので、ui の対応表には置かない)

#### 記録の追随

- **FR-015**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。
  - glossary: ui-coverage 対応表 (割当の 3 種類と行の Tier の決め方)、transcript の情報密度 (監視ビューの行の密度と区別)、システムイベントの行、Subagent (`Agent` / `Task`)
  - ui charter: Open Questions (Tier B/C の再棚卸し、§4.2 の暫定、Hook / Background task の持ち主、Tier C の転用) を閉じる。KPI「表示網羅」の計測経路を FR-003 の検査と ui-coverage-reviewer にし、M3 の完了の条件 (Tier A の後続の行が 0) を足す。Related Specs に O-2
  - session charter: Hook / Background task の状態を保持しないこと (tool の結果の対応づけはセッションスレッドの中で一時的に持つ)、直近の活動の読み飛ばしと整形の規則
  - `_overview.md`: 帰属の判断根拠 (Hook / Background task の結論)、Feature 帰属の表 (O-2 の題、O-4 / O-5 / O-6)、M3 の範囲 (O-1〜O-6)。roadmap と `_overview.md` の M3 の達成状態「未表示情報がゼロ」に「AD-044 の M3 の完了の条件で判定する」と注記する
  - roadmap: O-2 の行、O-4 / O-5 / O-6 の行、P-4 を完了に、store / 一覧の切り出しの持ち主の付け替え、O-2 の題の「Tier A 完全化」を今の範囲に (`docs/prompts.md` も)
  - O-1 の観測点 `receivedMessages` が tool の結果の送り直しと Hook / task の行も数えるようになったことを、010 の data-model と roadmap の O-3 の義務 (2) に注記する
  - AD-019 / AD-020 の Open Questions への回答は AD-044 に記録する。accepted の本文は変えない
- **FR-016**: Constitution の Principle XII と XIII を改めなければならない (USER 決定 2026-10-03)。
  - 先に ADR (AD-044) を起こし、利用者が accepted にする (Constitution の改定手順 1)
  - 版は MINOR (v1.3.0。後続 feature の ID を割当とみなすのは指針の実質的な拡張。これまで適合していた状態が違反になることは無く、MAJOR に当たらない理由を Sync Impact Report と AD-044 に書く)
  - XII の Adoption metadata: `violation_threshold` を「項目 21 は CI で常に違反にする。後続 ID の行は違反にしない。UI 系 feature の completed の判定は M3 の完了の条件による」に、`existing_violations` を項目 21 の初回の結果にそろえる (強化に当たるので既存違反の enumeration を Sync Impact Report に書く)
  - SDK の版を上げる PR は domain を問わず対応表を同じ PR で直すことを、AD-044 の Consequences と discovery の手順に書く
  - XII: Automated を FR-003 の検査に、Manual を配置済みの `ui-coverage-reviewer` に改め、「roadmap に実在する後続 feature の ID を書いた行は割当済み」と、M3 の完了の条件を明記する。`bad_pattern_grep` は割当の列だけを見る形にする
  - XIII: 「未分類 59 要素」など、FR-005 の再棚卸しで変わる記述を結果に合わせる (数には確認日を併記する。AD-019 D3)
  - plan のテンプレートの XII の検査の行を追随させる

### Key Entities

- **ui-coverage 対応表**: `docs/ui-coverage.md`。行 = SDK のメッセージ型 / ブロック / tool / アプリが作る経路 / 制御要求。列 = 識別子・Tier・割当 (3 種類)・経路 (実行中 / 過去ログ)・備考。SDK のバージョンを持つ。書式の正本は凡例と AD-044
- **割当 (Assignment)**: 実装済み (element と経路) / 後続 feature (roadmap の ID) / 表示不要 (理由) のどれか
- **システムイベントの行**: transcript の中で Hook / Background task を 1 行で示す表示。同じ Hook / task の後続で書き換わり、状態の一覧は持たない
- **transcript の情報密度**: compact / comfortable。renderer の表示状態であり、永続化しない。監視ビューの行の密度とは別

### Assumptions / Clarifications

- **[USER 決定 2026-10-03]** O-2 は対応表・機械検査・reviewer・O-1 の義務 4 件と割当の確定までとし、表示の実装は後続 feature に分ける
- **[USER 決定 2026-10-03]** 後続 feature の ID を書いた行は Principle XII の「割当」とみなす (ID は roadmap に実在するものに限る)。ADR (AD-044) を起こし、Constitution を MINOR (v1.3.0) で改める (FR-016)
- **[USER 決定 2026-10-03]** Hook / Background task は、session が無害化して通す経路だけを持ち、ui が transcript の行として描く。状態は保持せず、持ち主の domain は要らない (O-1 の判断「session は状態管理を含めない」を維持)。1 つの task の行は renderer が同じ id で合成する
- **[USER 決定 2026-10-03]** Hook は SDK が既定で出す SessionStart / Setup のものだけを表示する。`includeHookEvents` は足さない (一般の Hook は O-6)
- **[USER 決定 2026-10-03]** 実行中の tool の結果を本 feature で扱う
- **[USER 決定 2026-10-03]** 後続 feature として M3 に O-4 / O-5 / O-6 (domain `ui`) を足す (FR-004)
- **[USER 決定 2026-10-03]** store / 一覧の切り出しは本 feature で行わず、持ち主を付け替える
- **[USER 決定 2026-10-03]** 汎用の表示 (ToolFallback) だけの行を実装済みにできるのは Tier B / C に限る (FR-002)
- **[ASSUMED]** transcript の密度の既定は comfortable で、永続化しない。既定で Tool group を開くのは AD-035 Trade-off (専用表示が既定で畳まれて見えない) への回答であり、実機の見え方は quickstart V-4 で利用者が確かめる
- **[ASSUMED]** 過去ログ (`getSessionMessages` の `includeSystemMessages: true`) に Hook / Background task のシステムメッセージが残るかは実データ (quickstart V-4) で確かめる。確かめるまで、対応表の経路は「実行中」とし、備考に「過去ログは未確認 (V-4)」と書く
- **[ASSUMED]** 実行時の subagent の tool 名は `Agent` か `Task` か未確認。両方を当てる (V-4 で記録する)
- **[ASSUMED]** `hook_name` がコマンドの文字列を含むと V-4 で分かったら、名前の代わりに Hook の種類 (`hook_event`) を出す
- **[ASSUMED]** task の行は背景で始まった task だけにする (前景の task と後から背景に移った task は行にしない。後者は O-6)。送り直し 1 回の結果の合計は 1MB まで (data-model §3)
- **[設計判断 2026-10-03 design-gate R2]** M3 の完了の条件は「Tier A の後続のうち、割当先が M3 の feature の行が 0」。利用者が AD-044 を accepted にするときに確かめる

## Success Criteria

- **SC-001**: **対応表が SDK と一致し、未割当が 0。** 現在の SDK に対して検査が通り、対応表の全行が FR-002 の 3 種類のどれかを持つ。検査の出力に、割当の種類 × Tier と後続 feature の ID ごとの件数が出る。計測経路: Constitution 検証の項目 21 (CI)
- **SC-002**: **検査が外れを捕まえる。** FR-003 の失敗の条件のそれぞれについて、わざと崩した入力で検査が該当する行を示して落ち、Constitution 検証の項目 21 が違反として終了コードを非 0 にする。計測経路: 検査の単体テスト (違反のサンプル) + 項目 21 の発火のテスト
- **SC-003**: **実行中の tool の結果とシステムイベントが出る。** FR-007〜FR-010 の各経路と US-2 の AC について、SDK のメッセージから transcript の表示までが AC のとおりになり、data-model §2 の許可リストの外のフィールドの値・無害化されていない文字列が `SessionEvent` と DOM に 0 件。計測経路: agents の変換の単体 (SDK のメッセージの fixture → `SessionEvent`) + renderer の component テスト。実 `claude` での見え方 (Hook の名前の中身、過去ログに残るか、tool 名) は quickstart V-4 で利用者が確かめ、自動の合否には含めない
- **SC-004**: **境界を広げない。** IPC のチャネル・preload・main・調停役スレッドのモジュール・状態通知のフィールド・query の options のキー・`SessionEvent` の種類の差分が 0 件で、追加の経路は既存の `message` の port だけを通る。計測経路: `git diff` (quickstart V-3) + X-5 の状態通知の全フィールド走査 + options のキーと `SESSION_EVENT_KINDS` の固定テスト
- **SC-005**: **密度の切り替えが効き、保たれる。** US-3 の AC1〜AC5 のとおりになり、既存の transcript のテストと仮想化のテストが既定の密度で通る。計測経路: transcript の component テスト
- **SC-006**: **直近の活動が要点だけを出す。** FR-014 の各規則について data-model §4 の出力になり、FR-014 で出すと決めた値以外の入力の値 (引数・代入の値) が出力に 0 件。Hook / task の行が末尾にあっても直近の活動が保たれる。計測経路: 純関数の単体
- **SC-007**: **reviewer が組み込まれる。** `ui-coverage-reviewer` が reviewers.yml と agent registry に登録され、対応表か表示の実装を触る差分で pr-gate に起動される。計測経路: `reviewers_filter` の出力 (quickstart V-5)

## Dependencies

- **O-1** ([010](../010-session-monitoring-view/spec.md)): 義務 4 件の出所。監視ビューの直近の活動 (`deriveActivity`。FR-006) と密度の扱い、観測点 `receivedMessages` を継承する
- **R-3 / R-4** ([003](../003-ui-transcript-rendering/spec.md) / [004](../004-ui-tier-a-tool-display/spec.md)): 過去ログの変換 (`toTranscriptMessages`)・専用表示・Tool group・DTO の台帳 (003 SC-009 / `TRANSCRIPT_PART_FIELDS`) を継承する
- **X-1 / X-5**: `SessionEvent` と本文の port、本文の上限と無害化 (`sanitizeBody` / `BODY_MAX_BYTES`)、状態通知に会話由来の文字列を載せない規則 (X-5 FR-004) を継承する
- **AD-019 / AD-020 / AD-034 / AD-035 / AD-041 (g) / AD-043**: element の実在、SDK の型の調査、本文の経路、Tool group の既定、query の options のキー集合、セッションスレッドと調停役の分担

## Out of Scope

- 対応表で後続 feature に割り当てた表示の実装 → O-4 / O-5 / O-6 / I-3
- 一般の Hook (PreToolUse など) の表示と、そのための `includeHookEvents` の ADR → O-6
- 実行中の Background task の一覧 → O-6 で要否を判断し、要るなら持ち主の domain を人間に諮る
- 承認カードの capability 付与 (`scope: 'capability'`) → I-3
- SDK の制御要求 (`control_request`) の操作の UI → 対応表には行を持つ (FR-001) が、操作の実装は対象外
- `running-session-store.ts` / `RunningSessionList.tsx` の切り出しと行の状態の型の移動 → 持ち主を付け替える (FR-015)
- 直近の活動の不可視文字の残り (roadmap の記録) → `sanitizeBody` の集合は変えない。持ち主は roadmap の記録のまま
- PLAN.md §4.2 の Tier A 表の書き換え → 対応表が正本になるので、§4.2 は参照に置き換える注記だけ
