---
spec_id: 011-ui-coverage
feature_id: O-2
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: tasking
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: ui-coverage 対応表の確立 (O-2)

**Feature Branch**: `011-ui-coverage`

**Created**: 2026-10-03

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "O-2 (roadmap M3 の順 11、domain: ui、依存: O-1): docs/ui-coverage.md の確立 (SDK が emit する 39 型から機械的に導出する。AD-020) と Tier B/C の再棚卸し。O-1 からの義務 4 件 ((1) Hook / Background task の表示の割当と状態の持ち主 (2) Tool group の既定 open 化 (3) transcript の情報密度の切替 (4) 直近の活動の tool ごとの整形) と P-4 (ui-coverage-reviewer の追加)、X-1 からの申し送り (承認カード・聞かれずに拒否された操作) を含める。"

## Summary

Claude Code (Agent SDK) が emit する情報と、その表示の対応表 **`docs/ui-coverage.md`** を作り、Constitution Principle XII を検証できる状態にする。

- 対応表の行は **SDK の型定義から機械的に導く** (AD-020 Decision 1)。メッセージ型 39 種、tool の入力型、アプリが SDK の callback から作る経路 (承認要求など) を行にし、各行に表示の割当を書く。**型が増えた・減った・割当が空、のどれでも CI が落ちる**。
- 各行の割当は 3 種類のどれかにする: (a) 実装済みの表示、(b) roadmap にある後続 feature の ID、(c) 表示不要と理由。未割当は残さない (USER 決定 2026-10-03)。
- 実行中のセッションで今は捨てている **tool の結果** と、**Hook / Background task のシステムイベント** を transcript に出す (O-1 の義務 (1)。USER 決定 2026-10-03)。
- transcript の**情報密度** (compact / comfortable) を切り替えられるようにし、Tool group の既定の開閉を密度で決める (O-1 の義務 (2)(3))。
- 監視ビューの直近の活動を **tool ごとに要点だけ** にする (O-1 の義務 (4))。
- 対応表の判断を要する点を見る **`ui-coverage-reviewer`** を足す (P-4)。

**なぜ今**: M3 の達成状態は「未表示情報がゼロ」である。対応表が無い間は Principle XII が検証できず、どの UI 系 feature も「未表示が無い」ことを示せない (roadmap「O-2 で対応表そのものを成果物にする」)。調査 (2026-10-03) では、39 型のうち表示に届いているのは 4 型 (assistant / result の成否 / permission_denied / 過去ログの compact_boundary) だけで、実行中は tool の結果も捨てている。

## 本 feature の位置づけ

- **作り変えない。** 表示の実装は「割当を決めること」と、O-1 の義務・利用者が範囲に入れた 2 つ (実行中の tool の結果、Hook / Background task) に限る。残りの表示 (費用と使用量、レート制限、API の再試行、モデルの拒否、コンテキストの圧縮の実行中表示など) は、対応表で後続 feature に割り当てる (USER 決定 2026-10-03)。
- **domain は `ui`、ただし session の契約を 1 か所広げる** (USER 決定 2026-10-03)。実行中のシステムイベントと tool の結果は agents の層で捨てられているので、`SessionEvent` (session domain) に**会話由来の文字列を無害化して通すだけの経路**を足す。状態は保持しない (実行中の Background task の一覧などは作らない) ので、状態の持ち主の domain は要らない。
- **Principle XII の「割当」の読み方** (USER 決定 2026-10-03): 後続 feature の ID を書いた行は割当済みとみなす。ただし ID は roadmap に実在するものに限り、機械検査で確かめる。後続 feature の ID を持つ行が残っていても、本 feature は completed にできる。

## Clarifications

### Session 2026-10-03

- Q: O-2 はどこまで表示を実装するか → A: 対応表・機械検査・reviewer・O-1 の義務 4 件と割当の確定。表示の実装は後続 feature に分ける (各行に後続 feature の ID を書く)
- Q: 実行中のシステムイベント (Hook / Background task) をどう分担するか → A: session は無害化して通す経路だけを足し (状態は保持しない)、ui が transcript の行として描く。実行中の一覧は作らない
- Q: 実行中の tool の結果を本 feature で扱うか → A: 扱う。対応表で最も大きい欠けであり、上と同じ種類の変更である
- Q: Constitution XII / XIII を改めるか → A: 本 feature で PATCH する。XII の Automated を対応表の検査に、Manual を配置済みの reviewer に改め、「roadmap に実在する後続 feature の ID は割当」と明記する。XIII の「未分類 59 要素」の記述を再棚卸しの結果に合わせる
- Q: 後続 feature をどう置くか → A: M3 に 3 行を足す。O-4 (計量と制限)、O-5 (MCP・Elicitation・プラグイン・コマンド)、O-6 (会話の境界と tool の専用表示の第 2 弾)。Permission grant は I-3 のまま
- Q: roadmap が「O-2 の前」に置いた store / 一覧の切り出しをどうするか → A: O-2 は store に派生値を足さないので、持ち主を「store に派生値を足すか行を触る次の feature」に付け替える (理由を roadmap に書く)
- Q: ToolFallback だけで出る tool の行は「実装済み」か → A: Tier B / C の行に限り実装済みとする。Tier A の行は専用表示か後続 feature の ID を要る

## User Scenarios & Testing

### User Story 1 - SDK が emit する情報のどれが、どこに表示されるかが分かる (Priority: P1)

開発者 (この製品の作り手) は `docs/ui-coverage.md` を見るだけで、SDK が emit するメッセージ型・tool・アプリが作る経路のそれぞれについて、表示がどこにあるか、どの feature が受け持つか、なぜ表示しないかが分かる。SDK を上げて型が増えると、CI が「対応表に無い型がある」で落ちる。

**Why this priority**: Principle XII の検証の土台であり、M3 の「未表示ゼロ」を判定する唯一の手段である。これが無いと他の US の範囲も決められない。

**Independent Test**: 対応表の検査スクリプトを、現在の SDK と対応表に対して流して通ること、行を消す・割当を空にする・存在しない feature ID を書く・SDK の型を 1 つ足した写しに対して流すと、それぞれ理由を示して落ちることを確かめる。

**Acceptance Scenarios**:

1. **Given** 現在の SDK (0.3.270) と対応表、**When** 検査スクリプトを流す、**Then** 通る。対応表には SDK のバージョンが書かれている
2. **Given** SDK の型定義に対応表に無いメッセージ型がある (型が増えた)、**When** 検査を流す、**Then** その型の名前を示して落ちる。対応表にあって SDK に無い型 (型が減った) でも同様に落ちる
3. **Given** 対応表のある行の割当が空・「未割当」・roadmap に無い feature ID のどれか、**When** 検査を流す、**Then** その行を示して落ちる
4. **Given** 対応表、**When** X-1 の承認カードと「聞かれずに拒否された操作」の行を見る、**Then** どちらも実装済みの表示として割り当てられている (X-1 からの申し送り)
5. **Given** 新しいメッセージ型の表示を足す PR、**When** pr-gate が走る、**Then** `ui-coverage-reviewer` が起動し、対応表の行の更新が同じ PR に含まれているかを見る

---

### User Story 2 - 実行中のセッションで tool の結果とシステムイベントが見える (Priority: P1)

利用者は実行中のセッションで、tool を呼んだ結果 (Bash の出力、Edit の結果など) と、Hook の実行・Background task の開始と終了を、transcript の中で見られる。今は呼び出しだけが出て結果が出ず、Hook と Background task は何も出ない。

**Why this priority**: 対応表で最も大きい欠けである。tool の結果が見えないと、承認した操作が何をしたかを実行中に確かめられない (charter Journey 2)。Hook と Background task は O-1 から渡された義務 (1) である。

**Independent Test**: agents の変換の単体 (SDK のメッセージ → `SessionEvent`) と、renderer の component テスト (イベント → transcript の表示) で確かめる。実 `claude` での見え方は目視 (quickstart) で確かめる。

**Acceptance Scenarios**:

1. **Given** 実行中のセッションで `Bash` の呼び出しが出ている、**When** その結果が届く、**Then** 同じ呼び出しの表示 (Terminal block) に出力が出る。過去ログで同じセッションを開いたときと同じ形である
2. **Given** tool の結果がエラー、**When** 届く、**Then** エラーであることが呼び出しの表示に出る
3. **Given** 実行中に Hook が始まり、終わる、**When** transcript を見る、**Then** Hook の名前と結果 (成功・失敗) が 1 行で出る。Hook の出力本文は出さない
4. **Given** Background task が始まり、進み、終わる、**When** transcript を見る、**Then** task の説明と状態 (開始・完了・失敗など) が 1 行ずつ出る。実行中の task の一覧は出さない
5. **Given** 過去ログに同じ Hook / Background task のシステムメッセージが残っている、**When** 過去ログを開く、**Then** 実行中と同じ形で出る
6. **Given** subagent の呼び出し (SDK の tool 名が `Agent` でも `Task` でも)、**When** 表示する、**Then** Subagent の専用表示になる (fallback にならない)

---

### User Story 3 - transcript の情報密度を切り替える (Priority: P2)

利用者は transcript を、tool の中身まで読む comfortable と、会話の流れを追う compact で切り替えられる。comfortable では Tool group が開いた状態で出る。

**Why this priority**: O-1 から渡された義務 (2)(3) である。R-4 の専用表示は既定で閉じた Tool group の内側にあり、開かないと見えない (AD-035 Trade-off)。US-1 / US-2 が無くても価値はあるが、表示の量を増やす US-2 と組で効くので P2 とする。

**Independent Test**: transcript の component テストで、切り替えと各密度の Tool group の開閉を確かめる。

**Acceptance Scenarios**:

1. **Given** 既定の状態で transcript を開く、**When** tool の呼び出しを含む応答を見る、**Then** comfortable で、Tool group は開いて専用表示が見える
2. **Given** comfortable、**When** compact に切り替える、**Then** Tool group と Reasoning は閉じ、メッセージの間隔が詰まる。開けば中身は同じに見える
3. **Given** 密度を切り替えた、**When** 別のセッションに切り替える・過去ログを開く、**Then** 選んだ密度は保たれる
4. **Given** 利用者が個々の Tool group を開閉した、**When** 新しいメッセージが届く、**Then** 利用者が開閉したものは密度の既定で上書きされない

---

### User Story 4 - 監視ビューの直近の活動が tool ごとに要点だけを出す (Priority: P3)

利用者は監視ビューの行で、各セッションがどのファイルを触っているか、どのコマンドを実行しているかを、tool の入力をそのまま読まずに分かる。

**Why this priority**: O-1 から渡された義務 (4) である。今は tool 名と入力の先頭 1 行を出しており、読みにくく、入力の先頭に秘密 (トークンなど) が出うる。監視ビュー自体は O-1 で動いているので P3 とする。

**Independent Test**: 直近の活動を作る純関数の単体で確かめる。

**Acceptance Scenarios**:

1. **Given** 最後の活動が `Edit` / `Write` / `Read` の呼び出し、**When** 行を見る、**Then** tool 名と対象のファイル名 (パスの末尾だけ) が出る
2. **Given** 最後の活動が `Bash` の呼び出し、**When** 行を見る、**Then** tool 名とコマンドの先頭の語だけが出る (引数は出さない)
3. **Given** 整形の規則が無い tool、**When** 行を見る、**Then** tool 名だけが出る (入力は出さない)
4. **Given** 承認待ち、**When** 行を見る、**Then** 同じ規則で整形した要点が出る

---

### Edge Cases

- SDK の型が増えたが表示はまだ要らない → 対応表に「表示不要: 理由」か後続 feature の ID で行を足せば CI は通る。型を足さずに CI を通す経路は無い
- 対応表の後続 feature の ID が roadmap から消えた (feature の統合・改名) → 検査が落ちる。対応表の行を付け替える
- tool の結果が呼び出しより先に届く、または対応する呼び出しが見つからない → 過去ログと同じく、結果だけの表示に倒す (落とさない)
- tool の結果が非常に大きい (数 MB の出力) → X-5 の本文の上限 (`BODY_MAX_BYTES`) の規則で切り詰める。切り詰めたことが分かる
- tool の結果やシステムイベントの文字列に制御文字・双方向制御文字・HTML が含まれる → 既存の本文と同じ無害化 (`sanitizeBody`) を通し、テキストとしてだけ描く
- Hook の出力や Background task の説明に秘密が含まれうる → Hook は出力本文を出さない。task の説明は会話由来の文字列として扱い、1 行に正規化して切り詰める
- SDK が知らない subtype のシステムメッセージを送る → 通す経路の許可リストに無いものは捨てる (SDK の注記「知らない型と subtype は無視する」に従う)。対応表の検査は型定義に対して行うので、型定義に現れない subtype は対象外
- 密度を切り替えた瞬間にストリーミング中 → スクロール位置を奪わない (R-3 のアンカリングを壊さない)
- 直近の活動の tool 入力が JSON として読めない・必要なフィールドが無い → tool 名だけを出す

## Requirements

### Functional Requirements

#### 対応表と機械検査 (US-1)

- **FR-001**: `docs/ui-coverage.md` を作り、次を行にしなければならない。
  - `SDKMessage` の全メンバー (SDK 0.3.270 で 39 種)。`type` / `subtype` で区別できる単位を 1 行とする
  - tool の入力型 (`sdk-tools.d.ts` の `ToolInputSchemas` の各メンバー) と、それに対応する実行時の tool 名
  - アプリが SDK の callback や制御から作る表示の経路 (承認要求 `canUseTool` など)。X-1 の承認カードと「聞かれずに拒否された操作」を含む
  - SDK の制御要求 (`control_request` の subtype。AD-020 Decision 1 の「control 経路」) を、UI から Claude Code を操作する経路として行にする。多くは「表示不要: 内部制御」か後続 feature になる
  - メッセージの中身のブロック (assistant: `text` / `thinking` / `redacted_thinking` / `tool_use` / `server_tool_use` など、user: `tool_result` / `image` / `document`)。過去ログと実行中で扱いが違うものは両方を書く
  - 対応表には調べた SDK のバージョンを書く
  - 他 domain の一覧画面に出る値 (`SDKSessionInfo` の各フィールドなど) は行にしない (ui charter Out of scope。理由を対応表に書く)
- **FR-002**: 各行は、表示の割当を次の 3 種類のどれかで持たなければならない。空・「未割当」・「TBD」・「—」は割当ではない。
  - **実装済み**: 表示を担うコンポーネント (element) と、実行中 / 過去ログのどちらで出るか。汎用の表示 (ToolFallback など) だけで出る行を実装済みにできるのは Tier B / C の行に限る
  - **後続 feature**: roadmap に実在する feature の ID
  - **表示不要**: 理由 (内部制御・重複など)
  - あわせて各行に Tier (A / B / C) を書く。Tier C は対象外と明記して表に残す (Principle XII Exceptions)
- **FR-003**: 対応表を検査するスクリプトを用意し、CI で流さなければならない。次のどれかで失敗する: SDK の型定義にある型・tool の行が無い / 対応表にあって型定義に無い行がある / 割当が FR-002 の 3 種類のどれでもない / 後続 feature の ID が roadmap に無い / 対応表の SDK のバージョンが入っている SDK と違う。失敗の出力は該当する行と理由を示す
- **FR-004**: 本 feature で割り当てる後続 feature は roadmap に登録しなければならない。持ち主のいない延期を残さない (AD-028 §5)。
  - M3 に O-4 (計量と制限: 費用と使用量・レート制限・API の再試行・コンテキストの使用量など)、O-5 (MCP・Elicitation・プラグイン・コマンド: Server panel・Elicitation form・`AskUserQuestion` など)、O-6 (会話の境界と tool の専用表示の第 2 弾: 圧縮・ファイル・Checkpoints・モデルの拒否・通知・`Read` / `Glob` / `Grep`・Web search / fetch・Agent plan の markdown・実行中の subagent の入れ子など) の 3 行を足す (USER 決定 2026-10-03)。Permission grant は I-3 のまま
  - 元の O-2 のプロンプト (docs/prompts.md) が名指した 8 つの表示は、それぞれの行の割当先として現れる
- **FR-005**: element 側の Tier B / C の再棚卸し (AD-019 で未分類の 59 要素) を行い、結果を対応表の文書に element の分類として記録しなければならない。charter の Open Questions を閉じる
- **FR-006**: `ui-coverage-reviewer` を `/cl-add-reviewer` で追加しなければならない (P-4)。
  - 観点は判断を要するもの (新しい型・tool・ブロックの表示を足す PR に対応表の更新が同じ PR で含まれているか、割当の種類と Tier が妥当か、後続 feature への割当が持ち主の範囲に合うか) に限り、FR-003 の機械検査と同じことを見ない
  - reviewers.yml と agent registry に加え、gate の候補の一覧 (cl-code-gate / cl-pr-gate) と reviewer の担当表にも組み込み、実際に起動されるようにする

#### 実行中の tool の結果とシステムイベント (US-2)

- **FR-007**: 実行中のセッションで、SDK の `user` メッセージに含まれる tool の結果を renderer に届け、対応する tool の呼び出しの表示に出さなければならない。表示の形は過去ログ (R-3 / R-4) と同じにする。エラーの結果はエラーとして出す。あわせて、実行中の経路で黙って捨てている `redacted_thinking` を過去ログと同じ扱い (Reasoning) にそろえる
- **FR-008**: 実行中のセッションで、次のシステムメッセージを renderer に届けなければならない: Hook (`hook_started` / `hook_progress` / `hook_response`)、Background task (`task_started` / `task_progress` / `task_updated` / `task_notification` / `background_tasks_changed`)。
  - 通すフィールドは型ごとの許可リストに限る (Hook は名前・イベント・結果の種類、task は説明・状態など)。**Hook の出力本文は通さない**
  - 会話由来の文字列は既存の本文と同じ無害化を通す。状態通知 (`SessionStatusUpdate`) には載せない (X-5 FR-004)
  - 許可リストに無い型・subtype は捨てる
- **FR-009**: transcript は、FR-008 のイベントを会話の流れの中の 1 行として描かなければならない (Hook: 名前と結果、task: 説明と状態)。過去ログに同じシステムメッセージがあれば同じ形で描く。実行中の task の一覧 (状態の保持) は作らない
- **FR-010**: Subagent の専用表示は、実行時の tool 名が `Agent` でも `Task` でも当たらなければならない (SDK 0.3.270 の入力型は `AgentInput`)。対応表の tool の行も実行時の名前で書く
- **FR-011**: FR-007 / FR-008 で足す経路は、本文の経路 (port) を使い、main を経由しない (AD-034 / AD-043)。IPC のチャネルと preload は増やさない

#### transcript の情報密度 (US-3)

- **FR-012**: transcript は compact / comfortable の 2 つの情報密度を持ち、利用者が切り替えられなければならない。既定は comfortable [ASSUMED]。
  - comfortable: Tool group と専用表示を開いた状態で出す (AD-035 Trade-off の「既定 open 化」への回答)
  - compact: Tool group と Reasoning を閉じた状態で出し、メッセージの間隔を詰める
  - 利用者が個々に開閉したものは、密度の既定で上書きしない
- **FR-013**: 選んだ密度は、セッションの切り替えと過去ログ / 実行中の行き来を通して保たなければならない。アプリの再起動では既定に戻る [ASSUMED — 永続化は持たない]。監視ビューの行の密度 (O-1) とは別の設定である

#### 直近の活動の tool ごとの整形 (US-4)

- **FR-014**: 監視ビューの直近の活動は、tool の入力から tool ごとの要点だけを出さなければならない。
  - ファイルを扱う tool (`Read` / `Edit` / `Write` / `MultiEdit` / `NotebookEdit` など): パスの末尾 (ファイル名) だけ
  - `Bash`: コマンドの先頭の語だけ
  - 規則の無い tool・入力が読めないとき: tool 名だけ (入力は出さない)
  - 承認待ちの行も同じ規則で整形する。整形の規則は対応表の tool の行と同じ箇所から参照できるようにする

#### 記録の追随

- **FR-015**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。
  - glossary: ui-coverage 対応表の定義に割当の 3 種類を足す、transcript の情報密度
  - ui charter: Open Questions (Tier B/C の再棚卸し、§4.2 の暫定、Hook / Background task の持ち主) を閉じる。KPI「表示網羅」の計測経路を FR-003 の検査と ui-coverage-reviewer にする
  - session charter: `SessionEvent` に足した経路 (状態を保持しないこと) を記録する
  - roadmap: O-2 の行、後続 feature の行 (FR-004)、P-4 を完了に。「O-2 の前」に置かれた store / 一覧の切り出しの持ち主を付け替える (USER 決定 2026-10-03)。O-2 の題の「Tier A 完全化」を今の範囲に直す (`_overview.md`・`docs/prompts.md` も)
  - `_overview.md` の「帰属の判断根拠」に Hook / Background task の結論 (状態を保持しないので持ち主の domain は要らない)
  - AD-020 / AD-019 の Open Questions (表示不要の欄、Hook / Background task の持ち主、Tier C の転用、59 要素) への回答を記録する。ADR は accepted なので本文は変えない
- **FR-016**: Constitution の Principle XII と XIII を PATCH で改めなければならない (USER 決定 2026-10-03)。
  - XII: Automated を FR-003 の検査に、Manual を配置済みの `ui-coverage-reviewer` に改め、「roadmap に実在する後続 feature の ID を書いた行は割当済み」を明記する
  - XIII: 「未分類 59 要素」など、FR-005 の再棚卸しで変わる記述を結果に合わせる
  - plan のテンプレートの XII の検査の行を追随させる

### Key Entities

- **ui-coverage 対応表**: `docs/ui-coverage.md`。行 = SDK のメッセージ型 / tool / アプリが作る経路。列 = 識別子・Tier・割当 (3 種類)・経路 (実行中 / 過去ログ)・備考。SDK のバージョンを持つ
- **割当 (Assignment)**: 実装済み (element と経路) / 後続 feature (roadmap の ID) / 表示不要 (理由) のどれか
- **システムイベントの行**: transcript の中で Hook / Background task を 1 行で示す表示。状態を保持しない
- **transcript の情報密度**: compact / comfortable。renderer の表示状態であり、永続化しない。監視ビューの行の密度とは別

### Assumptions / Clarifications

- **[USER 決定 2026-10-03]** O-2 は対応表・機械検査・reviewer・O-1 の義務 4 件と割当の確定までとし、表示の実装は後続 feature に分ける
- **[USER 決定 2026-10-03]** 後続 feature の ID を書いた行は Principle XII の「割当」とみなす (ID は roadmap に実在するものに限る)
- **[USER 決定 2026-10-03]** Hook / Background task は、session が無害化して通す経路だけを持ち、ui が transcript の行として描く。状態は保持せず、持ち主の domain は要らない (O-1 の判断「session は状態管理を含めない」を維持)
- **[USER 決定 2026-10-03]** 実行中の tool の結果を本 feature で扱う
- **[USER 決定 2026-10-03]** Constitution XII / XIII を本 feature で PATCH する (FR-016)
- **[USER 決定 2026-10-03]** 後続 feature として M3 に O-4 / O-5 / O-6 を足す (FR-004)
- **[USER 決定 2026-10-03]** store / 一覧の切り出しは本 feature で行わず、持ち主を付け替える
- **[USER 決定 2026-10-03]** 汎用の表示 (ToolFallback) だけの行を実装済みにできるのは Tier B / C に限る (FR-002)
- **[ASSUMED]** transcript の密度の既定は comfortable で、永続化しない (O-1 の監視ビューの密度と同じ扱い)
- **[ASSUMED]** 過去ログ (`getSessionMessages` の `includeSystemMessages: true`) に Hook / Background task のシステムメッセージが残るかは実データで確かめる (plan の research)。残らなければ、過去ログ側は「実行中のみ」と対応表に書く
- **[ASSUMED]** 対応表の行の単位は、`SDKMessage` のメンバー 1 つにつき 1 行とする (`SDKResultError` の 4 つの subtype などは 1 行にまとめ、備考で分ける)

## Success Criteria

- **SC-001**: **対応表が SDK と一致し、未割当が 0。** 現在の SDK に対して検査が通り、対応表の全行が FR-002 の 3 種類のどれかを持つ。計測経路: FR-003 の検査スクリプト (CI)
- **SC-002**: **検査が外れを捕まえる。** FR-003 の失敗の条件 5 つのそれぞれについて、わざと崩した入力で検査が該当する行を示して落ちる。計測経路: 検査スクリプトの単体テスト (違反のサンプル)
- **SC-003**: **実行中の tool の結果とシステムイベントが出る。** FR-007〜FR-010 の各経路について、SDK のメッセージから transcript の表示までが期待どおりになり、Hook の出力本文・許可リスト外のフィールド・無害化されていない文字列が `SessionEvent` と DOM に 0 件。計測経路: agents の変換の単体 (SDK のメッセージの fixture → `SessionEvent`) + renderer の component テスト (`SessionEvent` → DOM) + 実機の目視 (quickstart。E2E の偽 supervisor は tool を流さず、流すように変えると main に差分が出る)
- **SC-004**: **境界を広げない。** IPC のチャネル・preload・状態通知のフィールドの差分が 0 件で、追加の経路は本文の port だけを通る。計測経路: `git diff` (quickstart) + X-5 の状態通知の全フィールド走査が緑
- **SC-005**: **密度の切り替えが効き、保たれる。** 2 つの密度の Tool group / Reasoning の開閉、利用者の開閉が上書きされないこと、切り替えの保持が期待どおり。計測経路: transcript の component テスト
- **SC-006**: **直近の活動が要点だけを出す。** FR-014 の各規則について期待の出力になり、tool の入力の引数・秘密の形の文字列が出力に 0 件。計測経路: 純関数の単体
- **SC-007**: **reviewer が組み込まれる。** `ui-coverage-reviewer` が reviewers.yml と agent registry に登録され、対応表か表示の実装を触る差分で pr-gate に起動される。計測経路: `reviewers_filter` の出力 (quickstart)

## Dependencies

- **O-1** ([010](../010-session-monitoring-view/spec.md)): 義務 4 件の出所。監視ビューの直近の活動 (`deriveActivity`) と密度の扱いを継承する
- **R-3 / R-4** ([003](../003-ui-transcript-rendering/spec.md) / [004](../004-ui-tier-a-tool-display/spec.md)): 過去ログの変換 (`toTranscriptMessages`)・専用表示・Tool group を継承する。tool の結果の表示の形は R-4 のまま
- **X-1 / X-5**: `SessionEvent` と本文の port、本文の上限と無害化 (`sanitizeBody` / `BODY_MAX_BYTES`)、状態通知に会話由来の文字列を載せない規則 (X-5 FR-004) を継承する
- **AD-019 / AD-020 / AD-035**: element の実在、SDK の型の調査、Tool group の既定の開閉

## Out of Scope

- 対応表で後続 feature に割り当てた表示の実装 (費用と使用量、レート制限、API の再試行、モデルの拒否、認証の状態、実行中のコンテキストの圧縮、プロンプトの提案など) → 各後続 feature
- 実行中の Background task の一覧 (状態の保持) → 要ると分かったら持ち主の domain を人間に諮る
- 承認カードの capability 付与 (`scope: 'capability'`) → I-3
- SDK の制御要求 (`control_request`) の操作の UI → 対応表には行を持つ (FR-001) が、操作の実装は対象外
- `running-session-store.ts` / `RunningSessionList.tsx` の切り出しと行の状態の型の移動 → 持ち主を付け替える (FR-015)
- 直近の活動の不可視文字の残り (roadmap の記録) → 本 feature の整形 (FR-014) は入力の大半を出さなくなるが、`sanitizeBody` の集合は変えない。持ち主は roadmap の記録のまま
- PLAN.md §4.2 の Tier A 表の書き換え → 対応表が正本になるので、§4.2 は参照に置き換える注記だけ
