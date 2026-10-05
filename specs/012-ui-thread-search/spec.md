---
spec_id: 012-ui-thread-search
feature_id: O-3
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: implementing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: Thread 検索と探す操作 (O-3)

**Feature Branch**: `012-ui-thread-search`

**Created**: 2026-10-04 (夜間の自走で起案。夜間に仮採用した判断は **2026-10-05 に利用者が推奨案どおり承認した** — 下の「判断」を参照)

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[ui] O-3 (roadmap M3 の順 12、domain: ui、依存: O-2): セッションを横断して探せるようにする。Thread search、会話内検索、conversation map、message timing、活動の heat graph、command palette、empty state。義務 (X-4 から): session charter KPI「再利用率」の計測経路 (起動元 preset / manual のローカル利用ログ。AD-041 (h))。義務 (O-1 から): (1) UI ラベルの i18n リソース化の判断 (Constitution Principle XV の期限 M3。target-finder.ts の 2 本を含める) (2) session charter KPI「並列時の滑らかさ」の実機計測の宿題 (roadmap O-3 の行の (a)〜(d))。表示の追加は docs/ui-coverage.md の行を同じ PR で直す (Constitution XII / AD-044)。" --targets both

## Summary

セッションが増えても、目当てのセッションと会話の箇所にすぐ辿り着けるようにする。

- **Thread search**: セッション一覧を、題・要約・最初のプロンプト・ブランチ・タグ・作業フォルダの表示名で絞り込む。
- **会話内検索**: 開いている transcript の本文を検索し、一致した箇所へ移る。
- **Command palette**: キーボードだけで、セッションを開く・新規起動・設定の項目・会話内検索などを呼び出す。
- **Empty state**: 検索の結果・palette の候補・再利用率の記録が空のとき、なぜ空かと次の操作を示す (シェルの空の状態は O-7)。

**O-7 (アプリのシェル。[spec 013](../013-ui-app-shell/spec.md)) の上に作る。** 置き場所は O-7 の語彙 (AD-046 Decision 6) で書く: Thread search はサイドバーの過去のセッションの区画、会話内検索は中央のヘッダ、Command palette はアプリ全体のダイアログ、再利用率は起動ダイアログのプリセットの欄。
- **再利用率の計測経路** (X-4 からの義務): 起動がプリセット経由か手動かを、日ごとの回数だけローカルに記録し、プリセットの欄に直近 30 日の内訳を出す。
- **i18n リソース化の判断** (O-1 からの義務 (1)): 判断を ADR (proposed) に記録する。

**なぜ今**: M3 の達成状態は「10 セッションを俯瞰できる」である。O-1 で稼働中の一覧、O-2 で表示の網羅を作ったが、過去のセッションが増えると目当てを探す手段が無い。Principle XV の i18n の判断の期限は M3 で、session charter の KPI「再利用率」は計測経路が無いまま (AD-041 (h))。

## 本 feature の位置づけ

- **範囲を分ける (U-1)。** 入力の表示 7 種と義務 3 つを 1 spec に入れると FR 20 を超える。本 feature は「探す」(Thread search・会話内検索・Command palette・Empty state) と義務 (X-4) と義務 (O-1) (1) に絞り、残りを 2 つの後続 feature に分けて roadmap に登録する (FR-016):
  - **O-8 (新規・M3・domain `session`)**: 並列時の滑らかさの実機計測 — 義務 (O-1 から) (2) の (a)〜(d) をそのまま移す。(a) は perf の出力の許可リスト (O-1 SC-005) の変更で利用者の承認が要り、(d) の実機計測ハーネスの ADR を先に起こす必要があり、計測そのものは実機でしか行えない。「探す」と独立に進められる
  - **O-9 (新規・M3・domain `ui`)**: 会話の時間と活動の可視化 — conversation map・message timing・活動の heat graph (と、対応表 F 節で O-3 に預けた Activity graph / Trace waterfall の判断)。message timing はメッセージの時刻 (`createdAt`。今は過去ログ・実行中とも `null`) を agents / domain の変換で埋める必要があり、session の変換の契約に触れる
- **domain は `ui`、ただし session の起動の経路を 1 か所広げる (U-2)。** 再利用率の記録には「この起動がプリセット経由か」を renderer から main に渡す必要がある。起動の IPC の入力に起動元 (`preset` / `manual`) を 1 つ足し、main の永続化層に日ごとの回数を書く。KPI の持ち主は session charter で、計測経路を O-3 が作るのは AD-041 (h) の指名による
- **検索は renderer の中で行う。** Thread search は一覧に既にある要約行 (`SessionSummaryDTO`) を絞り込むだけで、transcript の本文を横断して読まない (本文の横断検索は下の Out of Scope)。会話内検索は開いている transcript (renderer が持つメッセージ) だけを見る。新しい IPC のチャネル・preload の関数は足さない (再利用率の読み出しを除く。FR-013)
- **i18n はリソース化しない (U-3)。** 判断を ADR (proposed) に記録し、利用者が accepted にした後で Constitution XV の字面を改める。`running-session-store.ts` の切り出しは「i18n リソース化の前に済ませる」とされていたが、リソース化しないので本 feature の前提ではない (持ち主は roadmap の記録のまま)

## 判断 (2026-10-04 の夜間の自走で仮採用し、2026-10-05 に利用者が承認)

AGENTS.md が人間の承認を要求する判断と、domain をまたぐ判断を、推奨案で仮に採用した。利用者は下の表の「仮採用した案」と AD-045 を 2026-10-05 に推奨案どおり承認した。

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | O-3 の範囲の分割 (domain の分解に当たる) | 「探す」+ 義務 (X-4) + 義務 (O-1) (1) を O-3 に残し、義務 (O-1) (2) を O-8 (`session`)、conversation map / message timing / heat graph を O-9 (`ui`) に分ける | 全部を O-3 に入れる (FR 20 を超える) / perf だけ分ける |
| U-2 | ui の feature が session の起動の IPC の入力を広げてよいか | 起動元 (`preset` / `manual`) の 1 フィールドだけを足す。値は列挙の 2 値で、main は未知の値を記録しない (起動は拒否しない。FR-010) | 再利用率を renderer の中だけで数える (再起動で消え、KPI の計測経路にならない) |
| U-3 | Principle XV の i18n リソース化 (Constitution Principle の採否) | リソース化しない。日本語単一を維持し、ADR (AD-045、proposed) に再検討の条件を書く。**AD-045 の accepted を /cl-implement の着手の条件にする**。Constitution XV の改定は MINOR (AD-045 Decision 2 の「直書きを新たに増やさない」は指針の拡張) で、本 feature の PR に含める | リソース化する (全 feature の文言を移す大きな作業になり、`running-session-store.ts` の切り出しが先に要る) |
| U-4 | 起動の利用記録の置き場と保持 | ユーザデータディレクトリの JSON 1 つに、日ごとの回数だけを 90 日分持つ (FR-012) | 起動ごとの行を追記するログ (時刻・プリセット名が残る) |
| U-5 | ui の feature が session の操作 UI (過去のセッションの区画の検索欄・起動ダイアログのプリセットの欄) と session の domain / main のモジュール (`domain/session/launch-usage.ts`・起動の IPC の検証・store) を変えてよいか | O-3 (ui) が持つ。Thread search は session の一覧の上に ui が載せる例外として ui charter に 1 行、起動の利用記録は session の永続化層に置くと session charter に 1 行書く (FR-016) | US-4 の main 側と PresetPanel を session の作業として切り出す |
| U-6 | KPI「再利用率」の数え方と文言 (session の KPI の定義を変える) | 「プリセットを適用した起動」と「適用しない起動」の 2 値で数える。適用した後に軸を変えてもプリセット、拒否の後に前回の設定で起動し直してもプリセット (起動元を戻す)。session charter の KPI の文言を「プリセットを適用した起動が、適用しない起動を上回る」に改める | 3 値 (`preset` / `preset-modified` / `manual`) で数え、KPI の文言の「全軸を手で選ぶ起動」を `manual` に当てる |

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

- Q: どこまで入れるか → A: U-1 のとおり。「探す」に絞る
- Q: Thread search は transcript の本文まで探すか → A: 探さない。要約行のフィールドだけを絞り込む。本文の横断検索は全セッションの transcript を読み直すことになり、列挙と取得の経路 (R-2 / R-3) の負荷の判断が要る [ASSUMED]
- Q: 「プリセット経由の起動」とは → A: 起動ダイアログでプリセットを適用してから起動したもの。適用した後に軸を変えてもプリセット経由に数える [ASSUMED]
- Q: 再利用率をどこで読むか → A: プリセットの欄に直近 30 日の内訳 (プリセット N 回 / 手動 M 回) を出す [ASSUMED]

## User Scenarios & Testing

### User Story 1 - セッション一覧を絞り込んで目当てのセッションを開く (Priority: P1)

利用者はサイドバーの過去のセッションの区画で語を入力し、題・要約・最初のプロンプト・ブランチ・タグ・グループの見出し (作業フォルダの表示名など) のどれかに一致するセッションだけを見る。一致したセッションを開く。

**Why this priority**: 「探す」の中心である。セッションが数十を超えると、フォルダの見出しを開いて目で追う今のやり方では目当てに辿り着けない。

**Independent Test**: 一覧の component テストで、入力に応じた絞り込み・件数・空の結果・解除を確かめる。

**Acceptance Scenarios**:

1. **Given** 複数のフォルダにセッションがある、**When** 検索欄に語を入れる、**Then** 一致するセッションだけが、フォルダの見出しの下に残る。一致の無いフォルダの見出しは出ない。一致した件数が出る。既定で畳まれているグループ (未登録) も、検索中は一致した行を出す
2. **Given** 語が全角 / 半角・大文字 / 小文字だけ違う、**When** 検索する、**Then** 一致する (正規化の正本は FR-002)
3. **Given** 一致するセッションが無い、**When** 結果を見る、**Then** data-model §5 の検索の 0 件の文言 (読み込み済みの範囲で一致が無い) と、語と絞り込みをすべて解除する操作が出る (FR-008)。押すと一覧が戻る
4. **Given** 絞り込んだ状態、**When** 語を消す・Esc を押す、**Then** 元の一覧に戻る。開閉していたフォルダの状態は保たれる (検索中に開いて見せた畳まれたグループは元の畳んだ状態に戻る)
5. **Given** 絞り込んだ状態、**When** 行を選んで中央が切り替わる・サイドバーを畳んで開く、**Then** 語と結果は保たれる
6. **Given** IME で変換中、**When** Enter / Esc を押す、**Then** 変換の確定・取り消しとして扱われ、検索の確定や解除にならない (Principle VIII)

---

### User Story 2 - 開いている会話の中を検索して該当箇所に移る (Priority: P1)

利用者は開いている transcript (過去ログ・実行中のどちらも) で語を検索し、一致した箇所を順に辿る。

**Why this priority**: 長いセッションで「どこでその判断をしたか」を探す手段が無い。transcript は仮想化されていて、ブラウザの検索では画面外の本文に届かない。

**Independent Test**: transcript の component テストで、一致の件数・移動・強調・仮想化された範囲の外への移動を確かめる。

**Acceptance Scenarios**:

1. **Given** transcript を開いている、**When** 会話内検索を開いて語を入れる、**Then** 一致の件数と現在の位置 (n / m) が出て、最初の一致の位置まで transcript が動き、一致した語が強調される
2. **Given** 一致が複数ある、**When** 次 / 前に移る (Enter / Shift+Enter かボタン)、**Then** 順に移り、端で反対の端に戻る
3. **Given** 一致した箇所が仮想化で描かれていない範囲にある、**When** そこへ移る、**Then** その箇所が描かれて画面に入る
4. **Given** 一致が閉じた Tool group や Reasoning の中の本文にある、**When** 検索する、**Then** 検索の対象にしない (対象の正本は FR-004)。一致が 0 なら FR-008 の空の結果を出す
5. **Given** 実行中のセッションで検索している、**When** 新しいメッセージが届く・表示中のメッセージの本文がストリーミングで伸びる、**Then** 件数は更新されるが、現在の位置 (同じ一致) とスクロールは奪われない
6. **Given** 検索を閉じる、**When** transcript を見る、**Then** 強調が消え、スクロール位置はそのまま
7. **Given** 検索のバーで IME の変換中、**When** Enter / Shift+Enter / Esc を押す、**Then** 変換の確定・取り消しとして扱われ、次 / 前への移動や検索を閉じる操作にならない (Principle VIII)
8. **Given** 本文に長さの変わる文字 (`㍿`・`İ`・合字・ゼロ幅・双方向制御) が含まれる、**When** 検索して強調する、**Then** 例外は出ず、強調は元の本文の一致した範囲に掛かる (FR-005)

---

### User Story 3 - キーボードだけで操作を呼び出す (Priority: P2)

利用者は Command palette を開き、語で操作やセッションを選んで実行する。

**Why this priority**: セッションを開く・新規起動・設定の項目・検索の呼び出しが、サイドバー・中央のヘッダ・設定のダイアログに分かれている。US-1 / US-2 が無くても価値はあるが、それらの入口を 1 つにまとめるので P2 とする。

**Independent Test**: Command palette の component テストで、開閉・絞り込み・キーボード操作・実行・フォーカスの戻りを確かめる。

**Acceptance Scenarios**:

1. **Given** アプリのどの面でも (モーダルのダイアログが開いていない)、**When** Ctrl+K を押す、**Then** Command palette が開き、入力欄にフォーカスが移る。モーダルのダイアログ (起動・設定・確認・画像) が開いている間は開かない
2. **Given** palette が開いている、**When** 語を入れる、**Then** 操作 (FR-007 の一覧) と、FR-002 の規則で一致したセッションが候補に出る
3. **Given** 候補がある、**When** 上下キーで選んで Enter を押す、**Then** その操作が実行され palette が閉じる
4. **Given** palette が開いている、**When** Esc を押す・外を押す、**Then** 閉じて、開く前の要素にフォーカスが戻る
5. **Given** composer で IME の変換中、**When** Ctrl+K を押す、**Then** palette は開かず、変換は壊れない (Principle VIII)
6. **Given** 候補が 0、**When** 見る、**Then** 「一致する操作はありません」が出る

---

### User Story 4 - プリセットがどれだけ使われているかが分かる (Priority: P2)

利用者 (と製品の作り手) は、起動がプリセットを適用したものか、適用しないものかの直近 30 日の内訳を見て、session charter の KPI「再利用率」を判定する (KPI の文言をこの数え方に合わせる。U-6)。

**Why this priority**: X-4 から渡された義務である。KPI が計測経路を持たないまま M3 を閉じられない。

**Independent Test**: 記録の store の単体 (書き込み・集計・保持期限・壊れたファイル) と、起動の IPC の検証の単体、プリセットの欄の component テストで確かめる。

**Acceptance Scenarios**:

1. **Given** プリセットを適用して起動した、**When** 起動が受け付けられる、**Then** その日の「プリセット」の回数が 1 増える
2. **Given** プリセットを適用せずに起動した、**When** 起動が受け付けられる、**Then** その日の「手動」の回数が 1 増える
3. **Given** 起動が拒否・失敗した (起動ゲートでの拒否)、**When** 記録を見る、**Then** 回数は増えない
4. **Given** 記録がある、**When** プリセットの欄を見る、**Then** 直近 30 日のプリセット / 手動の回数が出る。記録が無いときは「まだ記録がありません」、読めないときは「記録を読めません」と出る
5. **Given** 記録のファイルが壊れている・読めない、**When** 起動する、**Then** 起動は妨げられない。壊れていれば退避して新しく始まり、将来版なら書き換えない (FR-012)
6. **Given** プリセットを適用して起動し、拒否された、**When** ダイアログに戻った前回の設定のまま起動し直す、**Then** その起動もプリセットとして数える (起動元を前回の設定と一緒に戻す)

---

### Edge Cases

- 一覧の要約行のフィールドが `null` (題が無い・要約が無い) → そのフィールドは一致の対象にならないだけで、行は落ちない
- 検索語が空白だけ → 絞り込まない (元の一覧)
- 検索語や本文に制御文字・双方向制御文字・HTML が含まれる → 強調は DOM を書き換えずに掛け、HTML として解釈しない (`dangerouslySetInnerHTML` を使わない)。検索語の正規化で制御文字を除く
- 非常に長い transcript (数千メッセージ) で検索する → 入力のたびに全文を走査しない (FR-005 の間引き)
- 会話内検索の一致が、ストリーミング中で本文が増えている最中のメッセージにある → 本文が変わったメッセージを走査し直して件数を更新し、現在の位置は同じ一致 (メッセージの id と出現の順) を指し続ける (data-model §2)
- 一覧は段階取得で、まだ読み込んでいない行は検索されない → 0 件の文言で「読み込み済みの範囲」と示す
- 稼働中のセッションと同じ id の過去の行がある → palette の候補は稼働中の 1 件にまとめる
- Command palette からセッションを開いたが、そのセッションが一覧から消えていた → サイドバーで消えた行を選んだときと同じ (O-7: 選択が外れ、中央は空の状態)
- Ctrl+K / Ctrl+F が composer のテキスト入力中に押された → IME の変換中でなければ palette / 検索を開く。変換中は何もしない (`preventDefault` もしない)
- モーダルのダイアログが開いている・palette が開いている間に Ctrl+F → 何もしない。palette から「会話内検索」を実行したときに検索のバーが開いていれば、入力欄にフォーカスを移すだけ
- 起動元の値が未知・欠けている (古い renderer・改ざん) → 起動は拒否せず、記録だけを行わない (起動の可否と計測を結び付けない)
- 日付の境界はローカルの暦日で数える。時計が戻った (日付が過去になった) → その日の回数に足す。時計が先に跳んだ → 刈り込みの基準は「記録の最も新しい日」と「今日」の早い方 (data-model §4)。先の日付の鍵は 30 日の合計に入らない
- 記録の書き込みが失敗した (ディスク満杯など) → 起動は成功のまま。その 1 回は捨てる (成功してからメモリを差し替える)。理由キーと errno のコードだけを main のログに出す
- E2E (偽の supervisor) で起動する → 記録はメモリ内の fake に入り、ファイルに書かない (AD-038)

## Requirements

### Functional Requirements

#### Thread search (US-1)

- **FR-001**: サイドバーの過去のセッションの区画 (O-7) は、区画の見出しの下に検索欄を持ち、入力した語に一致するセッションだけを出さなければならない。
  - 対象は要約行の `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` と、**行が属するグループの見出しとして画面が描く文字列** (登録フォルダは表示名、未登録は見出しの導出の結果)。正本は data-model §1。パス (`cwd.value`) を直接の対象にしない (名前空間を混ぜない)。transcript の本文は読まない。読み込み済みの行だけを探す
  - 一致の無いグループ (フォルダ / 保留 / 未登録) は見出しごと出さない。一致の件数を出す。既定で畳まれているグループも、検索中は一致した行を出す (語を消すと元の開閉に戻る)
  - 既存の所在・フォルダの絞り込み (R-2 FR-040) と AND で組み合わせ、同じく IPC を往復させない。一致 0 件は新しい空の状態 `search-empty` (既存の `filtered-out` より優先) で、語と絞り込みをすべて解除する操作を持つ。既存の `filtered-out` の文言とボタンは変えない
  - 語を消す・Esc で解除する。語と結果は、中央の切り替え・サイドバーの畳みでも保たれる (アプリの再起動では消える)
  - 検索欄の Enter / Esc は IME の変換中に反応しない
- **FR-002**: 一致の規則は 1 か所 (renderer の純関数) に置き、Thread search と Command palette のセッションの候補で共有しなければならない。
  - 正規化: NFKC・小文字化・制御文字の除去・空白の圧縮。語を空白で区切り、すべての語がどれかのフィールドに部分一致したら一致 (AND)
  - 一致は正規化した文字列への字面の部分一致 (`includes` / `indexOf`) に限る。検索語から `RegExp` を組まない
  - 並びは一覧の既存の並びを保つ (一致の度合いで並べ替えない) [ASSUMED]

#### 会話内検索 (US-2)

- **FR-003**: transcript は会話内検索を持たなければならない。
  - 置き場: 中央のヘッダ (O-7) に検索のボタン、開くと中央のヘッダの下に検索のバー
  - 開く: 検索のボタンと Ctrl+F (中央に会話を出しているとき)。閉じる: Esc と閉じるボタン
  - 一致の件数と現在の位置 (n / m) を出し、次 / 前 (Enter / Shift+Enter とボタン) で移る。端では反対の端に戻る。検索のバーの Enter / Shift+Enter / Esc は IME の変換中に反応しない (Principle VIII)
  - 移った箇所は、仮想化で描かれていなくても描かせて画面に入れる。一致した語を強調する
  - 過去ログと実行中のどちらでも使える。本文の供給元 (過去ログの transcript と稼働中のセッションのメッセージ) と hook の入力の正本は data-model §2。セッションを切り替えると検索は閉じる
- **FR-004**: 会話内検索の対象は、user / assistant のメッセージの `text` part の本文に限らなければならない。tool の入力・結果、Reasoning、システムイベントの行は対象にしない [ASSUMED — 閉じた要素を開かずに強調できないため。対象を広げるかは O-9 で再検討]
- **FR-005**: 会話内検索は、入力のたびに全文を同期で走査してはならない。
  - 入力は 150ms 間引いてから走査する [ASSUMED]
  - 実行中に届いたメッセージと、本文が変わったメッセージ (ストリーミング・送り直し) は走査し直して件数を更新するが、現在の位置 (同じ一致) とスクロールを奪わない (R-3 のアンカリングを壊さない)
  - 強調は描かれた本文の DOM を書き換えずに掛ける (CSS Custom Highlight API。research R-03)。HTML を組まない。Range の位置は正規化の前の本文の位置に写したものだけを使い、範囲外の位置では強調を飛ばす (例外を出さない)。`::highlight()` の規則はバンドルされる CSS に置き、既存のテーマのトークンを使う (実行時に `<style>` を足さない。本番の CSP `style-src 'self'`)

#### Command palette (US-3)

- **FR-006**: アプリは Command palette を持たなければならない。
  - Ctrl+K で開き、Esc・外の押下で閉じる。閉じたら開く前の要素にフォーカスを戻す
  - 入力・候補の一覧は combobox / listbox の役割を持ち、上下キーで選び Enter で実行する
  - IME の変換中は開かない・確定しない (Principle VIII。X-2 の `isComposing` の扱いを継ぐ)。変換中のキーに `preventDefault` しない
  - モーダルのダイアログ (`aria-modal`) が開いている間は開かない
- **FR-007**: palette の候補は、次の操作と、FR-002 で一致したセッション (一覧と稼働中の一覧の両方) でなければならない。
  - 操作: 新規起動 (起動ダイアログを開く)、設定の各項目を開く (O-7 の設定のダイアログの 4 項目)、サイドバー / 右のペインの畳み・開き、会話内検索を開く (中央に会話を出しているとき)、transcript の情報密度の切り替え (同)
  - セッションの候補を実行すると、サイドバーで行を選んだのと同じになる (O-7 の focus の書き手を通る)
  - 操作の一覧は 1 か所 (renderer の表) に置き、操作の名前は日本語の文言の表から取る
  - 候補は最大 50 件 [ASSUMED]。操作を先、セッションを後に並べる。稼働中と同じ id の過去の行は稼働中の 1 件にまとめる

#### Empty state (US-1〜US-4)

- **FR-008**: 本 feature が足す次の空の状態は、なぜ空かと次の操作を Empty state の部品で示さなければならない。
  - Thread search の一致が 0 (`search-empty`。語と絞り込みをすべて解除する)
  - 会話内検索の一致が 0
  - Command palette の候補が 0
  - 起動の利用記録が無い / 読めない (2 つは文言を分ける)
  - 部品は既存の element `EmptyState` (`components/assistant-ui/elements/empty-state.tsx`)。新しい文言の正本は data-model の文言の表
  - シェルの空の状態 (中央の未選択・稼働中の区画の 0 件・右のペインの未選択) は O-7 が持つ。一覧の既存の空の表示は O-7 で区画に置かれたものをそのまま使う

#### 再利用率の計測経路 (US-4)

- **FR-009**: 起動ダイアログは、起動の要求に起動元 (`preset` / `manual`) を付けなければならない。
  - そのダイアログでプリセットを適用してから起動したら `preset`、それ以外は `manual`。適用した後に軸を変えても `preset` (U-6)
  - 拒否・失敗の後にダイアログが前回の設定を戻すときは、起動元も一緒に戻す (稼働中のストアの起動の状態に `lastOrigin`)
  - renderer の経路: 起動ダイアログ → 起動の面 (O-7 の `NewSessionDialog`) → 稼働中のストアの `launch(config, folderLabel, origin)` → capability の `launchSession(config, origin)`。正本は plan
  - 起動元は計測にだけ使い、起動の可否・起動の設定 (`SessionLaunchConfig`) に影響させない
- **FR-010**: main は起動元を、起動の要求の未信頼入力として検証しなければならない。
  - 値は `value === 'preset' || value === 'manual'` の厳密比較で受け付ける。欠けている・未知の値なら、起動は通常どおり扱い、記録だけを行わない
  - 起動ゲートで拒否された・起動に失敗した要求は記録しない。起動が受け付けられた時点で 1 回だけ、await せずに記録する
  - 検証と記録の判定は electron に依存しない層 (`session-ipc.ts` の `handleLaunchSession`) に置き、`ipc.ts` は port の transfer だけを持つ (既存の分担)。どの起動元でも、起動の service に渡る設定と引数は同じ
  - E2E の配線では、記録はメモリ内の fake に入れ、ファイルに書かない (AD-038)
- **FR-011**: 記録の内容は、ローカルの暦日ごとの `preset` / `manual` の回数だけでなければならない。
  - セッション id・プリセットの id と名前・フォルダ・ランタイム・Provider・モデル・時刻 (日より細かいもの)・環境変数は記録しない (Principle V。構造上入らない形にする)
  - アプリの外に送らない
- **FR-012**: 記録の置き場と保持は次のとおりにしなければならない。
  - ユーザデータディレクトリの JSON ファイル 1 つ (`launch-usage.json`)。書式の版を持つ。書き込みは既存の settings の store と同じく一時ファイルからの置き換えで行い、失敗したら一時ファイルを消す
  - 書き込みのたびに 90 日より前の日を消す (保持期限 90 日) [ASSUMED]。基準は時計の先跳びに耐える形 (data-model §4)
  - 読み込みの結果ごとの扱い (壊れた・日単位の不正・将来版・読めない・退避の失敗) は既存の settings の store に合わせる。正本は data-model §4。要点: 将来版は書き換えない、日単位の不正はその日だけ飛ばす、退避に失敗したら書かない、読めないときは次の操作で読み直す
  - 書き込みは成功してからメモリを差し替える (失敗した 1 回は捨てる)。書き込みの失敗は起動の結果を変えない。読み込みと書き込みの失敗は、理由キーと errno のコードだけを main のログに出す (値とパスは出さない)
- **FR-013**: プリセットの欄は、直近 30 日のプリセット / 手動の回数を出さなければならない。
  - 読み出しは main への IPC の 1 つ (引数を取らない)。返すのは集計済みの 2 つの回数と集計の日数、または「読めない」。renderer に日ごとの記録を渡さない。形の正本は data-model §4
  - 記録が無いとき・読めないときは FR-008 の Empty state を出す
  - session charter の KPI「再利用率」の計測経路をこの表示と FR-012 のファイルにする

#### 判断と記録の追随

- **FR-014**: Principle XV の i18n リソース化の判断を ADR (AD-045、**proposed**) に記録しなければならない (U-3)。
  - 判断: リソース化しない。UI の文言は日本語単一で、feature ごとの文言の表 (`labels.ts` など) に置く。コンポーネントへの直書きを新たに増やさない
  - `target-finder.ts` の `候補 #N` / `名前 (#N)` の 2 本は、infra が作る日本語の例外として据え置く理由と、リソース化を再検討するときに移す先を書く
  - 再検討の条件 (英語の UI の要求が出たとき・D-1 の配布の前) を書く
  - **AD-045 の accepted を /cl-implement の着手の条件にする。** Constitution XV の改定は MINOR (Decision 2 の規則を XV に足す) で、本 feature の PR に含める (改定手順 2 の人間のレビューと 4 の Amendment trail)。直書きの基準線 (今ある直書きの件数) を AD-045 に記録する
- **FR-015**: 表示の追加を `docs/ui-coverage.md` に同じ PR で反映しなければならない (Constitution XII / AD-044)。
  - F 節の Thread search / Conversation search / Command palette / Empty state の使い道を本 feature の表示にする (Empty state は既に使っているので、その使用も書く。使い道の書式は対応表の凡例に足す)
  - F 節で O-3 に預けた Activity graph / Heat graph / Message timing / Trace waterfall の備考を O-9 に付け替える
  - A〜E 節の行は増えない (本 feature は SDK が emit する情報の表示を足さない)
- **FR-016**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。
  - roadmap: O-3 の行を本 feature の範囲に直し、義務 (O-1 から) (2) を新しい **O-8** (並列時の滑らかさの実機計測。M3・`session`・依存 O-1) に、conversation map / message timing / heat graph と本文の横断検索の要否を新しい **O-9** (会話の時間と活動の可視化。M3・`ui`・依存 O-3) に移す。system-scope の「実機計測ハーネス (`perf/`) の ADR 化」の「O-3 が持つ」を O-8 に直す。`_overview.md` の Feature 帰属の表と M3 の範囲、`docs/prompts.md` の O-3 のプロンプトも直す
  - roadmap の O-9 の行に「`createdAt` を埋める変換の変更は session の契約の拡張を伴う。持ち主の確認は O-9 の design で session charter と合わせて行う」と注記する
  - session charter: KPI「再利用率」の文言を U-6 の数え方に改め、計測経路 (FR-012 / FR-013) を書く。起動の利用記録は session の永続化層に置く (U-5)。KPI「並列時の滑らかさ」の持ち主を O-8 に。起動の IPC の入力の起動元 (U-2)
  - ui charter: Related Specs に O-3。Thread search は session の一覧の上に ui が載せる例外 (U-5) で、本文の横断検索をしない
  - glossary: セッションの検索 (element 名は Thread search)、会話内検索、Command palette、起動元 (preset / manual)、起動の利用記録 (`LaunchUsage`。「ローカル利用ログ」「再利用率の記録」は Counterexamples)
  - O-7 の申し送り「稼働中と過去を 1 つの一覧に混ぜるかの再検討」(013 spec の Clarifications / Out of Scope) を閉じる: 混ぜない。palette が両方を候補にし、Thread search は過去の区画にある。013 の記述に結論を書く
  - discovery: `launch-usage.json` の置き場と消し方 (ファイルを消せば記録は消える)

### Key Entities

- **検索語の一致規則**: 正規化と AND の部分一致。Thread search と palette で共有する純関数
- **会話内検索の状態**: 語・一致の一覧 (メッセージの id と本文の位置)・現在の位置。renderer の表示状態で、永続化しない
- **Command palette の操作**: id・文言のキー・使える条件・実行。renderer の表
- **起動元 (LaunchOrigin)**: `preset` / `manual`。起動の要求に付く計測用の値
- **起動の利用記録 (LaunchUsage)**: `{ version, days: { "YYYY-MM-DD": { preset, manual } } }`。90 日分

### Assumptions / Clarifications

- **[承認済み U-1〜U-6]** 上の「判断」の表 (2026-10-05)
- **[ASSUMED]** Thread search は要約行のフィールドだけを対象にする (本文の横断検索は Out of Scope)
- **[ASSUMED]** 会話内検索の対象は `text` part だけ (FR-004)。間引きは 150ms
- **[ASSUMED]** プリセットを適用した後に軸を変えた起動もプリセット経由に数える (FR-009)
- **[ASSUMED]** 保持期限 90 日、表示は直近 30 日、palette の候補は 50 件まで
- Ctrl+K / Ctrl+F はアプリの既存の割り当てと衝突しない (2026-10-04 に確認。window / document の keydown は画像ダイアログのフォーカストラップ 1 件だけ)

## Success Criteria

- **SC-001**: **一覧を絞り込める。** US-1 の AC1〜AC6 のとおりになり、FR-002 の正規化の各規則 (全角 / 半角・大文字 / 小文字・制御文字・複数語の AND) が一致の純関数の単体で通る。計測経路: 一致の純関数の単体 + 一覧の component テスト
- **SC-002**: **会話の中を辿れる。** US-2 の AC1〜AC8 のとおりになり、仮想化の範囲の外の一致へ移れる。走査の構造の条件: 入力 1 回あたりの全件の走査は間引きの後の 1 回以下、メッセージの追加・本文の変化では変わったメッセージだけを走査する (走査の関数の呼び出しの回数で判定)。1,000 メッセージの走査の時間は参考値として出力する (合否に使わない)。IME の変換中のキーで移動しない (`e2e/ime.spec.ts` に 1 ケース)。計測経路: 走査の純関数の単体 + transcript の component テスト + E2E
- **SC-003**: **palette で操作できる。** US-3 の AC1〜AC6 のとおりになり、axe の違反 0 (combobox / listbox の役割、フォーカスの戻り)。IME の変換中の Ctrl+K で開かず変換が確定できる。計測経路: palette の component テスト (vitest-axe) + `e2e/ime.spec.ts` に 1 ケース
- **SC-004**: **空の状態が次の操作を示す。** FR-008 の 4 つの状態で Empty state の部品が出て、なぜ空かを示す。Thread search の一致 0 は語を消す操作を持つ。計測経路: 各部品の component テスト
- **SC-005**: **再利用率が記録され、KPI を判定でき、秘密を含まない。** US-4 の AC1〜AC6 のとおりになり、表示した 2 つの回数で session charter の KPI の不等式 (U-6 の文言) を判定できる。記録のファイルのキーが FR-011 の集合 (版・日付・2 つの回数) の外に 0 件。どの起動元 (preset / manual / 欠落 / 未知) でも起動の service に同じ引数で 1 回だけ渡り、拒否されない。data-model §4 の読み込みの結果ごとの扱いがそのとおりになる。計測経路: domain の純関数と store / service の単体 (固定のキー集合・将来版・日単位の不正・退避の失敗・時計の先跳び・一時ファイルの後始末) + `handleLaunchSession` の単体 + プリセットの欄の component テスト
- **SC-006**: **境界を広げすぎない。** 追加の IPC のチャネルは FR-013 の読み出しの 1 つだけで、起動の IPC の入力の追加は起動元の 1 フィールドだけ。`SessionLaunchConfig`・`SessionEvent` の種類・query の options のキーの差分が 0。計測経路: `git diff` (quickstart。`IPC_CHANNELS` の差分が 1 件) + 本 feature で足す `IPC_CHANNELS` の集合の固定テスト (今はチャネルの集合を固定するテストが無い)
- **SC-007**: **記録が追随する。** ADR (AD-045) が accepted で、Constitution XV が AD-045 に合わせて改められ (MINOR。Amendment trail)、Constitution 検証の項目 21 (対応表) が通り、roadmap に O-8 / O-9 があり、O-3 の行に義務 (O-1 から) (2) が残っていない。計測経路: `node scripts/constitution/check.mjs` + quickstart の確認

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表と F 節の element の分類、transcript の情報密度 (palette の操作) を継承する
- **R-2 / R-3** ([002](../002-session-cross-folder-session-enumeration/spec.md) / [003](../003-ui-transcript-rendering/spec.md)): 一覧の要約行 (`SessionSummaryDTO`。本文を含まない FR-044)、transcript の仮想化とアンカリングを継承する
- **X-2** ([006](../006-ui-japanese-ime-composer/spec.md)): IME の変換中の扱い (`isComposing`) を継承する
- **X-4** ([008](../008-session-launch-settings-dialog-and-presets/spec.md)): 起動ダイアログ・プリセット・settings の store の書き込み方 (一時ファイルからの置き換え・`.bak`) を継承する。AD-041 (h) が再利用率の計測経路を O-3 に指名した
- **O-1** ([010](../010-session-monitoring-view/spec.md)): 稼働中の一覧 (palette の候補)
- **O-7** ([013](../013-ui-app-shell/spec.md)): シェルの面と置き場所の語彙 (AD-046。proposed)、面の状態 (focus の書き手・設定のダイアログ)、シェルの空の状態。**O-7 が先にマージされてから実装する**

## Out of Scope

- transcript の本文を横断する検索 (全セッションの本文を読む) → **O-9** で要否を判断する (列挙と取得の負荷の判断を伴う。O-9 は会話の時間の情報 (`createdAt`) を変換で埋めるので、本文の取得の経路を同じ feature で見る)
- conversation map・message timing・活動の heat graph・Activity graph・Trace waterfall → **O-9**
- 並列時の滑らかさの実機計測 (perf の出力の許可リスト・負荷の作り方・行の切り替えの計測・実機計測ハーネスの ADR) → **O-8**
- i18n リソース化の実施 (判断はリソース化しない。FR-014)
- `running-session-store.ts` / `RunningSessionList.tsx` の切り出し → 持ち主は roadmap の記録のまま
- Command palette からのセッションの操作 (停止・名前の変更など) → X-6
- 再利用率の記録を消す UI (ファイルを消せば消える。discovery に書く)
