---
spec_id: 025-ui-live-session-fixes
feature_id: O-13
domain: ui
domain_selected_by: auto
targets: both
targets_selected_by: auto
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 起動中のセッションの UI の手直し (O-13)

**Feature Branch**: `025-ui-live-session-fixes`

**Created**: 2026-10-29 (利用者と対話して起案。判断は下の「判断の一覧」)

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap「M3: 差配できる」の O-13 の行 (範囲の正本)。2026-10-29 に利用者が実機で報告した問題 6 つ。依存の O-12 (022) と X-6 の最初の分割 (023) は main にマージ済み。

## Summary

動いているセッションを操作する画面の、実機で見つかった使いにくさを直す。

- **composer の周りで設定を選ぶ**: モデルと権限モードの選択を中央のヘッダから composer の周りに移す。名前の変更はヘッダに残す
- **既定の Provider でもモデルを変えられる**: Provider を選ばずに起動したセッションでも、Claude Code が選べると答えたモデルに切り替えられる
- **権限モードの名前は Claude Code と同じ**: 名前を Claude Code の表記にそろえ、Claude Code の版を上げるたびに追従する
- **停止は控えめに**: 停止ボタンを送信ボタンより目立たない見た目にし、Esc でも止められるようにする
- **右のパネルが崩れない**: 幅 320px のままで、タブの文字が折り返さず、使用量の値が崩れない
- **`/resume` が効く**: composer の `/resume` で同じフォルダの過去のセッションを選び、X-9 の再開ダイアログに進む

## 判断の一覧 (2026-10-29 利用者が回答)

| 判断 | 1 行の要約 | 記録 |
|---|---|---|
| U-1 | 本 spec は roadmap の O-13 の行の 6 項目だけを扱う。左のサイドバーの再設計とサブエージェントの枠は扱わない (モック → ADR → spec で別に扱う) | 「義務の扱い」 |
| U-2 | モデルと権限モードの選択は composer の周りに置く。023 U-7 (中央のヘッダに置く) を見直す。名前の変更は中央のヘッダに残す | FR-001〜FR-003 |
| U-3 | 既定の Provider のセッションのモデルの一覧は、動いている Claude Code に Agent SDK の `Query.supportedModels()` で聞く。今は使っていない API なので ADR で AD-036 の許可を読み替える | FR-005〜FR-007 |
| U-4 | 権限モードの名前は Claude Code の表記をそのまま使う (英語)。説明も付けない。Claude Code の表記に追従し続けるため。Principle XV (UI の文言は日本語が第一言語) の例外を ADR で起こす | FR-008〜FR-010 |
| U-5 | 停止ボタンは送信ボタンより目立たない見た目にする。Esc で止める操作を足す。ただし composer にフォーカスがあり、日本語入力の変換中でないときだけ | FR-011〜FR-013 |
| U-6 | 右のパネルの幅の可変化は入れない (013 data-model §2 / research R-04 の判断のまま)。320px の中で崩れない形にする | FR-014〜FR-015 |
| U-7 | `/resume` は、今のセッションと同じフォルダの過去のセッションを選ぶ画面を開く。選んだら X-9 の再開の流れ (021) に進む | FR-016〜FR-018 |
| ADR | plan で起こす: (a) `Query.supportedModels()` を許す AD-036 の読み替え (U-3) (b) 権限モードの名前の Principle XV の例外 (U-4。Constitution の Exceptions の改定を伴うかは plan で決める) | `docs/decisions/` |

## Clarifications

### Session 2026-10-29

- Q: 権限モードの表記はどれに合わせるか → A: Claude Code の CLI の表記 (VS Code 拡張の表記・日本語訳は採らない)
- Q: Principle XV とどう両立させるか → A: 英語名だけにする。Claude Code に追従し続けるため。説明も付けない (U-4)
- Q: 既定の Provider のモデルの一覧の出どころ → A: `Query.supportedModels()` で Claude Code に聞く (固定の別名の一覧は採らない。U-3)
- Q: `/resume` で何を開くか → A: 同じフォルダの過去のセッションを選ぶ画面 (サイドバーへの移動だけの案は採らない。U-7)
- Q: Esc で止める操作を足すか → A: 足す。変換中は止めない (U-5)
- Q: roadmap の行 → A: O-13 として M3 に足す。M3 の完了の条件に数えない

## 本 feature の位置づけ

- **ui の feature で、renderer (composer・中央のヘッダ・右のパネル・文言の表)・main (検証済み IPC)・agents (セッションスレッドの `supportedModels`) に触れる** (targets は both)
- **選べる値の範囲は変えない。** 権限モードは AD-062 の安全 3 値 (`default` / `plan` / `dontAsk`) のまま。変えるのは名前の表記と置き場所だけ。Auto / `bypassPermissions` は M4 の I-3 に残る
- **日本語入力の composer の挙動を壊さない。** AD-037 の IME の扱いと O-10 で閉じた focus の扱い (018 FR-014) を保つ。基準画像 (`e2e/composer-screenshot.spec.ts`) が変わる場合は、CI の artifact から取り直す
- **User Story が 5 本で目安の 4 を超える。** 6 項目はどれも小さく、同じ画面の手直しとして 1 回で確かめたいので分けない

### 義務の扱い

| 義務 (roadmap の O-13 の行ほか) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| (1) 停止ボタンと Esc | 扱う | US-3、FR-011〜FR-013 |
| (2) 権限モードの名前を Claude Code にそろえる | 扱う | US-1、FR-008〜FR-010 |
| (3) 右のパネルの崩れ | 扱う | US-4、FR-014〜FR-015 |
| (4) モデルと権限モードの選択を composer の周りへ | 扱う | US-1、FR-001〜FR-004 |
| (5) 既定の Provider のモデルの切り替え (023 U-10 で X-6 の後続に残した項目) | 扱う | US-2、FR-005〜FR-007 |
| (6) `/resume` | 扱う | US-5、FR-016〜FR-018 |
| `docs/ui-coverage.md` F 節の Composer model picker / Settings の行 (023 U-7 で「未使用」) | 扱う。割当を本 spec の実装に合わせて書き直す | FR-004 |
| 左のサイドバーの再設計・サブエージェントの枠 | 扱わない (理由: UI の再設計で、モック → ADR → spec で別に扱う) | roadmap の O-13 の行 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - composer の周りでモデルと権限モードを選ぶ (Priority: P1)

利用者は、プロンプトを書きながら、その場でモデルと権限モードを確かめて切り替えたい。今は中央のヘッダにあり、目線が離れる。権限モードの名前もアプリ独自で、Claude Code で覚えた名前と結びつかない。

**Why this priority**: 毎ターン目にする操作で、実機で最初に戸惑った点だから。

**Independent Test**: 動いているセッションを開き、composer の周りの選択でモデルと権限モードを変え、次のターンに効くことを確かめる。

**Acceptance Scenarios**:

1. **Given** モデルのカタログを持つ Provider で動いているセッション、**When** composer の周りのモデルの選択で別のモデルを選ぶ、**Then** 次の応答からそのモデルで動き、選択の表示がそのモデルになる
2. **Given** 動いているセッション、**When** composer の周りの権限モードの選択を開く、**Then** 安全 3 値だけが Claude Code と同じ名前で並び、選ぶと切り替わる
3. **Given** 動いているセッション、**When** 中央のヘッダを見る、**Then** モデルと権限モードの選択は無く、名前の変更はある
4. **Given** 選択が押せない状態 (起動中・Claude Code が動いていない・変更中。023 の理由のまま)、**When** composer の周りの選択を見る、**Then** 理由つきで押せない形で出る
5. **Given** composer で日本語を変換中、**When** 選択を操作せずに入力を続ける、**Then** 変換と確定の挙動は今と同じ (AD-037)
6. **Given** 権限モードが安全 3 値の外 (Claude Code 自身が移った)、**When** 警告の帯 (O-4) を見る、**Then** 帯の権限モードの名前も Claude Code と同じ表記になる

---

### User Story 2 - 既定の Provider のセッションでもモデルを変える (Priority: P1)

利用者は、Provider を選ばずに起動したセッションでもモデルを変えたい。今は「この Provider にはモデルの一覧がありません」で押せない。

**Why this priority**: Provider を登録せずに使う利用者にとって、モデルを変える手段が無いから。

**Independent Test**: Provider を選ばずにセッションを起動し、最初の応答の後に composer の周りのモデルの選択を開き、Claude Code の一覧から選んで切り替わることを確かめる。

**Acceptance Scenarios**:

1. **Given** 既定の Provider で動いているセッション (最初の応答の後)、**When** モデルの選択を開く、**Then** 動いている Claude Code が選べると答えたモデルが並ぶ
2. **Given** 同じセッション、**When** 一覧のモデルを選ぶ、**Then** 次の応答からそのモデルで動く
3. **Given** Claude Code が一覧を返さない・空・失敗した、**When** モデルの選択を見る、**Then** 理由つきで押せない形で出る (セッションは止まらない)
4. **Given** モデルのカタログを持つ Provider のセッション、**When** モデルの選択を開く、**Then** 一覧は今と同じ Provider のカタログから出る (023 FR-005〜FR-007 のまま)

---

### User Story 3 - 停止は控えめに、Esc でも止める (Priority: P2)

利用者は、生成中に停止ボタンを誤って押したくない。停止はたまにしか使わない操作だが、今は送信ボタンと同じ強調色で一番目立つ。

**Why this priority**: 誤って押すと作業が中断するが、機能は今も動いているから。

**Independent Test**: 生成中の composer を見て、停止ボタンが送信ボタンより目立たないことと、Esc で止まることを確かめる。

**Acceptance Scenarios**:

1. **Given** 生成中、**When** composer を見る、**Then** 停止ボタンは送信ボタン (待機中) より目立たない見た目で、同じ場所に出る
2. **Given** 生成中で composer にフォーカスがある、**When** 変換中でない状態で Esc を押す、**Then** 生成が止まる
3. **Given** 生成中で日本語を変換中、**When** Esc を押す、**Then** 変換が取り消されるだけで、生成は止まらない
4. **Given** 生成していない、**When** composer で Esc を押す、**Then** 何も止まらず、入力も消えない

---

### User Story 4 - 右のパネルが崩れない (Priority: P2)

利用者は、右のパネルを開いたとき、タブの名前と使用量を崩れずに読みたい。今は幅 320px にタブ 5 つが入らず文字が折り返し、使用量のトークンの値が崩れる。

**Why this priority**: 読めないわけではないが、毎回目に入る崩れだから。

**Independent Test**: 右のパネルを開き、各タブの名前が 1 行で読めることと、使用量のタブで長いラベルと大きな値でも値が崩れないことを確かめる。

**Acceptance Scenarios**:

1. **Given** 右のパネルを開いた (幅 320px)、**When** タブの並びを見る、**Then** どのタブの名前も折り返さず、全部のタブに届ける (一部が隠れるなら、隠れたタブにも操作で届く)
2. **Given** 使用量のタブ、**When** トークンの値が 7 桁以上・モデル別の内訳が複数ある、**Then** 値は途中で折り返さず、ラベルと値の対応が崩れない
3. **Given** タブの名前が省略された、**When** その名前にポインタを当てる・読み上げる、**Then** 省略されていない名前が分かる

---

### User Story 5 - `/resume` で過去のセッションを選んで再開する (Priority: P3)

利用者は、Claude Code の CLI と同じく、composer で `/resume` と打って過去のセッションを再開したい。今は候補に出ず、プロンプトとして送られてしまう。

**Why this priority**: サイドバーの過去の一覧から再開する経路はすでにあるから。

**Independent Test**: 動いているセッションの composer で `/resume` を打ち、同じフォルダの過去のセッションを選ぶ画面が開き、選ぶと X-9 の再開ダイアログに進むことを確かめる。

**Acceptance Scenarios**:

1. **Given** composer で `/` を打った、**When** 候補を見る、**Then** `/resume` が候補に出る (Claude Code が報告するコマンドと区別できる)
2. **Given** composer に `/resume` だけを入力した、**When** 送信する (候補から選ぶ・Enter)、**Then** プロンプトとしては送られず、今のセッションと同じフォルダの過去のセッションを選ぶ画面が開く
3. **Given** 選ぶ画面、**When** 過去のセッションを選ぶ、**Then** X-9 の再開の流れ (サイドバーの過去の行から再開するのと同じ判定とダイアログ) に進む
4. **Given** 同じフォルダに過去のセッションが無い、**When** 選ぶ画面を開く、**Then** 無いことが分かる表示が出る
5. **Given** 選ぶ画面、**When** 何も選ばずに閉じる、**Then** composer に戻り、入力していた `/resume` は消えている

---

### Edge Cases

- モデルの選択を composer の周りに移しても、composer の幅が狭いときに入力欄が押しつぶされない (選択は省略表示にできる)
- `supportedModels()` の答えが、起動の effort を満たさないモデルを含むとき: Provider のカタログと同じく effort で絞る (023 の `switchableModels` の規則)
- effort で絞った結果が 0 件のとき: 「一覧を返さなかった」とは出さず、起動の effort が効くモデルが一覧に無いことを理由に押せない形にする (Claude Code が空の一覧を返したときと理由を分ける。FR-007)
- `supportedModels()` は最初の応答の前は呼ばない (023 の「最初の応答の後に変更できます」のまま)
- `/resume` に引数が付いた (`/resume abc`): 引数は使わず、選ぶ画面を開く
- Claude Code 自身が `/resume` をコマンドとして報告するようになった: アプリの `/resume` を優先し、候補を 2 つ出さない
- Esc が他の画面 (承認カード・ダイアログ・選ぶ画面) で使われているとき: その画面の Esc を優先し、生成は止めない
- 権限モードの名前を Claude Code の版を上げて変えたとき: 名前の表は 1 か所で、`docs/ui-coverage.md` の SDK の版を上げる手順で見直す

## Requirements *(mandatory)*

### Functional Requirements

**composer の周りの選択 (US-1)**

- **FR-001**: モデルと権限モードの選択は composer の周りに置き、中央のヘッダから外さなければならない (MUST)。名前の変更は中央のヘッダに残す
- **FR-002**: 選択の押せる条件・押せない理由・切り替えの処理は 023 のもの (`live-settings.ts` の判定と `setModel` / `setPermissionMode` の経路) をそのまま使わなければならない (MUST)。新しい条件を足すのは FR-005〜FR-007 だけ
- **FR-003**: 選択を composer の周りに置いても、composer の IME の挙動 (AD-037)・送信の挙動・focus の扱い (018 FR-014) を変えてはならない (MUST NOT)。選択を操作した後のフォーカスは composer の入力に戻す
- **FR-004**: `docs/ui-coverage.md` F 節の Composer model picker と Settings の行を、本 spec の実装に合わせて書き直さなければならない (MUST)。registry の element を取り込むかは plan で決める (Principle XIII の照合)

**既定の Provider のモデル (US-2)**

- **FR-005**: 既定の Provider (null) のセッションでは、最初の応答の後に動いている Claude Code に `Query.supportedModels()` で一覧を聞き、それをモデルの選択の候補にしなければならない (MUST)
- **FR-006**: 一覧から選べるのは、Claude Code が答えたモデルを起動の effort で絞った値だけでなければならない (MUST)。main の検証は、そのセッションで最後に受け取った一覧に含まれる値だけを通す
- **FR-007**: 一覧の取得が失敗・空・期限切れのときは、モデルの選択を理由つきで押せない形にし、セッションは止めてはならない (MUST NOT)

**権限モードの名前 (US-1)**

- **FR-008**: 権限モードの名前は Claude Code の表記と同じ文字列にしなければならない (MUST)。説明は付けない。Closta 独自の日本語の名前と説明を外す
- **FR-009**: 名前の表は 1 か所 (今の `PERMISSION_MODE_NAMES`) に置き、起動ダイアログ・composer の周りの選択・警告の帯 (O-4) はそこから読まなければならない (MUST)
- **FR-010**: 名前の表に、合わせた Claude Code の版を記録し、Claude Code / Agent SDK の版を上げる手順 (`docs/ui-coverage.md`) で見直す項目にしなければならない (MUST)

**停止 (US-3)**

- **FR-011**: 停止ボタンは送信ボタン (待機中) より目立たない見た目にしなければならない (MUST)。場所は今と同じ。見た目は registry の Button の variant から選ぶ
- **FR-012**: 生成中に composer にフォーカスがあり、日本語入力の変換中でないとき、Esc で生成を止めなければならない (MUST)
- **FR-013**: 変換中の Esc・生成していないときの Esc・他の画面 (承認カード・ダイアログ・選ぶ画面) が受けた Esc では、生成を止めてはならない (MUST NOT)

**右のパネル (US-4)**

- **FR-014**: 右のパネルのタブの名前は、幅 320px で折り返してはならない (MUST NOT)。入りきらないときも全部のタブに操作で届き、省略された名前は ポインタと読み上げで分からなければならない (MUST)
- **FR-015**: 使用量のタブのトークンの値は、途中で折り返さず、ラベルと値の対応が崩れてはならない (MUST NOT)。長いラベルの側を省略・改行してよい

**`/resume` (US-5)**

- **FR-016**: composer のコマンドの候補に、アプリのコマンドとして `/resume` を出さなければならない (MUST)。Claude Code が報告するコマンドと見分けがつき、同名が報告されても候補は 1 つにする
- **FR-017**: composer の入力が `/resume` (引数の有無を問わない) で送信されたとき、プロンプトとして Claude Code に送ってはならない (MUST NOT)。今のセッションと同じフォルダの過去のセッションを選ぶ画面を開く
- **FR-018**: 選ぶ画面で選んだ過去のセッションは、X-9 の再開の流れ (サイドバーの過去の行から再開するのと同じ `resolvePastResume` の判定と再開ダイアログ) に進めなければならない (MUST)。選ぶ画面は日本語の文言で、キーボードだけで選べ、閉じたら composer に戻す

### Key Entities

- **モデルの候補**: セッションごとに、Provider のカタログ (023) か、Claude Code が `supportedModels()` で答えた一覧の、どちらか一方。どちらの由来かを持つ
- **権限モードの名前の表**: 権限モードの値 → Claude Code の表記の名前。合わせた Claude Code の版を持つ
- **アプリのコマンド**: composer の候補のうち、Claude Code に送らずアプリが処理するもの。本 spec では `/resume` だけ

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 動いているセッションのモデルと権限モードを、composer の周りの選択から切り替えられる。E2E で選択が composer の領域にあり中央のヘッダに無いことと、切り替えの IPC が呼ばれることを確かめる (US-1 AC1〜AC3)
- **SC-002**: 既定の Provider のセッションで、`supportedModels()` の一覧からモデルを切り替えられる。単体で一覧の取得・effort の絞り込み・main の検証・失敗時の押せない理由を確かめ、実機で 1 回切り替える (US-2)
- **SC-003**: 起動ダイアログ・composer の周りの選択・警告の帯の権限モードの名前が、名前の表の Claude Code の表記と一致する。単体で表の参照元が 1 か所であることを確かめる (FR-008〜FR-009)
- **SC-004**: 生成中に Esc で止まり、変換中の Esc では止まらない。E2E で composition イベントを含めて確かめる (US-3 AC2〜AC4)。停止ボタンの variant が送信ボタンと違う
- **SC-005**: 幅 320px の右のパネルで、タブの名前が 1 行に収まり、使用量の値が折り返さない。E2E でタブの要素の高さが 1 行分であることと、値の要素が折り返していないことを確かめる (US-4)
- **SC-006**: `/resume` を送信すると Claude Code に送られず選ぶ画面が開き、選ぶと再開ダイアログが開く。E2E で確かめる (US-5)
- **SC-007**: composer の基準画像の比較と IME の E2E (X-2) が通る。基準画像を変える場合は理由を PR に書き、CI の artifact から取る

## Assumptions

- `Query.supportedModels()` は Agent SDK の現行版で、動いているセッションから呼べる (`sdk-agent-session.ts` の `QueryUnusedReadMethod` に名前がある)。返り値の形は plan で確かめる
- [ASSUMED: 停止ボタンの見た目は registry の Button の `outline` か `ghost` から plan で選ぶ。送信ボタンより目立たないことだけを要求とする]
- [ASSUMED: 右のパネルのタブは、横スクロールか省略 + ツールチップのどちらかを plan で選ぶ。幅の可変化はしない]
- [ASSUMED: `/resume` の選ぶ画面の並びは、過去の一覧と同じく新しい順]
- 左のサイドバーの再設計 (B) で右のパネルやサブエージェントの置き場所が変わる可能性がある。本 spec の右のパネルの手直しは、今の 320px のペインに対する最小の修正にとどめる

## Out of Scope

- 左のサイドバー (セッション一覧・稼働中) の再設計、サブエージェントの枠
- 右のパネルの幅の可変化
- 権限モードの選べる値の追加 (`acceptEdits` / `auto` / `bypassPermissions`。M4 の I-3)
- `/resume` 以外のアプリのコマンド (`/model` / `/permissions` など)
- 024 (起動設定の拡張軸)
