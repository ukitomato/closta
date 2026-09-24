---
spec_id: 003-ui-transcript-rendering
feature_id: R-3
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: reviewing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: transcript の基本表示 (R-3)

**Feature Branch**: `003-ui-transcript-rendering`

**Created**: 2026-09-24

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[ui] 選んだセッションの transcript を assistant-ui で表示する。markdown 本文、streaming text、scroll anchor、未定義ツールの fallback 表示を実装し、数千メッセージでも仮想化でスクロールが破綻しないこと。この時点で UI の見栄えを判断できることを受け入れ条件に含める。"

## 本 feature の位置づけ

R-3 は M1「読める」の 3 番目の feature であり、**`ui` domain の最初の feature** である。
R-2 の出力 — セッション一覧・選択状態・`src/agents/` の SDK 境界・単一 capability の IPC・
`normalize` (露出面制御) — を入力として受け取り、選んだセッションの
**過去 transcript を実データで画面に表示する**。

**本 feature の完了時点で軸 1 (UI 完成度) の方針を一次確定する** ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md)
の domain-specific Principle「見た目の判断を先送りしない」)。M1 完了判定
「WSL 内の過去セッションを Windows の assistant-ui で読める」がここを通る。

**本 feature は読み取り専用である。** セッションを起動せず、改名・削除せず、
config ディレクトリに書き込まない。起動とストリーミングの配管は X-1、日本語 composer は X-2、
種別ごとの専用 tool 表示 (Terminal / Code diff / Todo ほか) は R-4 が担う。

**導入コストは SPIKE-2 で払い済み** ([AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md))。
assistant-ui Elements は R-1 で導入され、`.aui.tsx` runtime 接続型 + `useExternalStoreRuntime` で
固定されている。markdown 本文 / streaming text / scroll anchor / 未定義 tool の fallback は
**表示部品として既に実在する**。**R-3 の残コストは「仮想化の追加」と「transcript データ配線」の 2 点**である。

**本 spec は「何を満たすか」を定める。** 変換関数の内部構造・仮想化ライブラリの結線・
取得プロセスの寿命といった実装方式は [plan.md](plan.md) / [tasks.md](tasks.md) とコードで決める。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 選んだセッションの過去 transcript を読む (Priority: P1)

R-2 の一覧でセッションを選ぶと、その会話が画面に表示される。markdown は整形され、
コードはハイライトされる。tool 実行は表示として現れ (本 feature では種別を問わず fallback 表示)、
user と assistant のやり取りが記録順に並ぶ。表示されるのは**実データ**であり、
サンプルやプレースホルダではない。

**Why this priority**: `ui` charter の Journey 1「過去セッションを読む」そのものであり、
M1「読める」の完了判定がここを通る。R-4 (Tier A tool 表示) の土台でもある。

**Independent Test**: 実データを持つ開発ホストで、R-2 の一覧から 1 セッションを選び、
同じ `sessionId` に対して SDK を直接呼んで得たメッセージ列と、画面に並んだメッセージの
件数・順序・役割が一致することを確かめる。セッションの起動を伴わずに検証できる。

**Acceptance Scenarios**:

1. **Given** 履歴のあるセッションを選ぶ、**When** transcript が開く、
   **Then** user / assistant のメッセージが**記録順**に並び、markdown が整形されコードがハイライトされる
2. **Given** 選んだセッションに**専用表示を持たない tool** の実行が含まれる、**When** transcript を見る、
   **Then** その tool は **fallback 表示** (tool 名・入力・結果) で欠落なく現れる
3. **Given** WSL ディストロ内 (実行中) のセッションを選ぶ、**When** transcript が開く、
   **Then** **ディストロを起動せず**に Windows 側から読み込まれ、同じ画面で表示される
4. **Given** 選んだセッションのメッセージ取得に失敗する (ファイル不在・所在が停止中)、
   **When** transcript を開く、**Then** 理由つきの失敗表示になり、再試行の導線があり、他の操作を妨げない
5. **Given** transcript を表示している状態で一覧の選択を別セッションに変える、**When** 切り替える、
   **Then** 表示が新しいセッションの内容に置き換わる。**先の選択の取得応答が遅れて到着しても
   現在の表示を上書きしない** (前の内容が混ざらない)

---

### User Story 2 - 数千メッセージでもスクロールが破綻しない (Priority: P1)

セッションの会話が数千メッセージに及んでも、スクロールが安定し、アプリが固まらない。
長大スレッドは仮想化され、全メッセージが一度に DOM へ載らない。
スクロール中に位置が突然飛んだり、内容の測定確定で位置が奪われたりしない。

**Why this priority**: `ui` charter の業務ルール「長大スレッドは仮想化する。
スクロールアンカリングを壊さない」と KPI「スクロールの安定」に直結する。
ユーザ入力の受け入れ条件そのもの ("数千メッセージでも仮想化でスクロールが破綻しないこと")。

**Independent Test**: 数千メッセージ規模の transcript (実データまたは大量 fixture) を開き、
同時にマウントされる DOM ノード数が総メッセージ数に比例せず一定範囲に収まること、
スクロール操作で位置飛びが起きないことを測る。

**Acceptance Scenarios**:

1. **Given** 3,000 件超のメッセージを持つ transcript、**When** 開いてスクロールする、
   **Then** 同時マウント DOM ノード数が総件数に依存せず一定範囲に収まり、位置飛びが起きない
2. **Given** 仮想化された長大スレッド、**When** 高さの異なるメッセージ (コードブロック・長い tool 出力) を
   スクロールで通過する、**Then** 測定確定によるスクロール位置のジャンプが起きない
3. **Given** transcript を最下部で見ている、**When** 末尾に近い位置を保つ、
   **Then** 最下部への追従 (auto-follow) とスクロール最下部ボタンが仮想化上でも機能する

---

### User Story 3 - 実行中を見据えた表示の頑健性 (streaming text) (Priority: P2)

メッセージ本文が逐次伸びていっても、表示が破綻しない。未完の markdown 構文
(閉じていないコードフェンス等) でレイアウトが壊れず、伸長中にスクロール位置が奪われない。
本 feature でも **大きい tool_result の段階描画・折りたたみ展開**で内容が増える場面があり、
そこで位置が奪われないことが R-3 のユーザ価値である。加えて実行中セッション (X-1) が使う
表示経路をここで用意し、頑健性を検証しておく。

**Why this priority**: R-3 のユーザにも効く (大きい tool_result の描画/展開) が、live のストリーム源接続は
X-1 が行うため P2 とする。

**Independent Test**: メッセージのテキストを段階的に伸ばす store 更新を与え、
表示が逐次反映され、未完 markdown で崩れず、スクロール位置が保たれることを確かめる。

**Acceptance Scenarios**:

1. **Given** あるメッセージ本文が段階的に伸びる、**When** 逐次描画される、
   **Then** テキストが伸びるにつれ表示が更新され、未完の markdown 構文でレイアウトが崩れない
2. **Given** 伸長中のメッセージ (または折りたたみ展開) を表示中、**When** 内容が増える、
   **Then** 見ている位置が奪われない (scroll anchor が保たれる)

---

### Edge Cases

- **メッセージ 0 件のセッション** — 空状態を示す (fallback 応答を捏造しない)
- **取得失敗** — セッションファイル不在・所在が停止中・権限拒否を、R-2 と同じ理由区分で示し、再試行導線を出す
- **未知の content ブロック / 未定義 tool** — fallback で示し、欠落させない (専用表示は R-4 / O-2)
- **非常に大きい単一 tool_result (数 MB)** — 表示を切り詰め・折りたたみ、main process で materialize しない (Principle IX)
- **コンパクション境界** (`SDKCompactBoundaryMessage`) — 最小の区切り表示か、明示的な表示対象外として記録
- **選択なし** — transcript 領域は誘導文を出し、送信経路は開けない
- **選択切替の非同期レース** — 取得が in-flight のまま別セッションへ切替、遅れて届いた旧応答は破棄する
- **並行取得の env 汚染** — 取得プロセスの config ディレクトリ指定が他の取得/列挙と混線しない
- **敵対的な本文** — 会話由来 markdown に生 HTML / `javascript:` リンク / 双方向制御文字が含まれても、
  スクリプト実行・表示偽装・レイアウト破壊を起こさない
- **subagent メッセージ** (`parent_agent_id` あり) — 本 feature は主セッションの表示を対象とし、
  ネスト表示は R-4 に送る (混じる場合は欠落させず fallback でフラットに示す)

## Requirements _(mandatory)_

### Functional Requirements

**取得 (読み取り専用 / backend)**

- **FR-001**: システムは選ばれたセッションの過去メッセージを**読み取り専用**で取得しなければならない
  (起動・改名・削除・config への書き込みをしない)。**読み取り専用の第一義的な担保は「書き込みを起こす
  IPC メソッドが存在しないこと」**とし、加えて SDK 呼び出し許可で書き込み系 API を禁じる
- **FR-002**: メッセージ取得は Agent SDK の `getSessionMessages()` を経由し、JSONL の自前パースをしない
  (Constitution Principle IV)。SDK を呼ぶのは `agents` レイヤに限る
- **FR-003**: main process を transcript 本文 (数 MB になりうる `tool_result`) の**データ経路に置いてはならない**。
  本文の `JSON.parse` も structured clone の deserialize も main で起こさない。取得プロセスと renderer を
  `MessageChannelMain` の port transfer で直結し、main は port ハンドルの中継のみを行う
  (Principle IX / [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2 /
  [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) /
  [AD-023](../../docs/decisions/0023-application-architecture.md) 「ストリームは MessagePort で運ぶ」)
- **FR-004**: 取得した `SessionMessage` 列を assistant-ui の `ThreadMessageLike` 列へ変換する処理は
  **I/O を持たない純粋関数**として `domain` に置き、モックなしでテストできること
- **FR-005**: transcript 取得 IPC は**単一 capability に追加**し、入力を検証層で validate する
  (FR-017)。生の `ipcRenderer` を renderer へ渡さない。**取得対象を指定/変更できる制御 port を renderer に渡さない** —
  データ受信用の port2 は main が宛先検証のうえ transfer するが、取得要求 (sessionId/targetKey) の発行は必ず
  `getTranscript` invoke を通し main の検証を経る (main 検証を迂回する未仲介 port を作らない)
- **FR-006**: 取得の config ディレクトリ指定は**取得ごとに他の取得・列挙と混線しない**方式で渡す。
  複数所在をまたぐ本 feature で、ある取得が別ディストロの config を読む混線を起こさないこと

**表示 (frontend)**

- **FR-007**: user / assistant のテキストを **markdown** として整形表示する (コードのハイライトを含む)
- **FR-008**: assistant の thinking を reasoning 表示に、tool 実行を tool 表示に割り当てる。
  **専用表示を持たない (未定義の) tool は fallback 表示** (tool 名・入力・結果) で示す。
  種別ごとの専用 tool 表示は R-4 の範囲であり、本 feature はすべて fallback で足りることを条件とする
- **FR-009**: メッセージは**記録順** (時系列) に並ぶ
- **FR-010**: **streaming text** — メッセージ本文が逐次伸びても (大きい tool_result の段階描画・折りたたみ展開を含む)、
  レイアウトが崩れず、未完の markdown 構文で表示が破綻しないこと。live のストリーム源接続は X-1 が行う
- **FR-011**: **scroll anchor** — 仮想化の測定確定・内容の伸長・初期表示ジャンプで
  スクロール位置が奪われないこと。最下部追従と「最下部へ」操作が仮想化上でも機能すること
- **FR-012**: 数千メッセージの transcript を**仮想化**して描画し、全メッセージの DOM ノードを
  一度にマウントしないこと。同時マウント数が総メッセージ数に依存しないこと
- **FR-013**: R-2 の一覧で選んだセッションの transcript を表示する (選択状態は R-2 の store が持つ)。
  選択なし・選択切替・読み込み中・空・失敗の各状態の表示を定める
  (R-1/R-2 の loading / empty / error element を使う)。**選択切替後、先の選択の取得応答が遅れて
  到着しても現在の表示を上書きしない** (request token / 選択 epoch の突合で破棄する)

**制約 (共有)**

- **FR-014**: composer の送信経路は閉じたまま (`isDisabled`) とする。本 feature は過去ログの表示であり
  送信しない。送信は X-1、IME ガードと E2E は X-2 が載せる
  (Principle VIII / [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) #18。
  `ChatScreen.test.tsx` の回帰前提を維持する)
- **FR-015**: assistant-ui の element と design system に乗る。独自トークン・スペーシングスケールを
  追加しない。同等 element がある UI を自作しない (Principle XIII)。仮想化のための再配線は
  公式の `ThreadPrimitive.ViewportProvider` + `MessageByIndex` / `Unstable_MessageById` を使う
- **FR-016**: 日本語 (全角混在)・絵文字・コードを含む transcript でフォント崩れ・レイアウト崩れを
  起こさない (Principle VIII)。会話由来文字列は境界を越える前に **transcript 本文用のサニタイザ**を通す —
  **改行・タブは保持**し、双方向制御文字・C1・危険な C0 を除去し、本文相応の上限で扱う
  (R-2 の 1 行要約用 `normalize` (改行除去・512B) を本文にそのまま流用しない。[data-model.md](data-model.md) の本文サニタイザ節)
- **FR-017**: 追加する IPC メソッドの入力検証を検証層に集約し、不正入力を拒否する。
  **`sessionId` は UUID 形式への一致を必須**とし (path traversal を防ぐ)、`targetKey` は既知集合に閉じる。
  検証対象の各項目を [contracts/](contracts/) の検証表に列挙する
- **FR-018**: コンパクション境界 (`SDKCompactBoundaryMessage`) を最小の区切り表示で示すか、
  明示的に表示対象外として記録する (AD-020: R-3 で必ず出会う)
- **FR-019**: 本 feature が表示する `SessionMessage` の種別と content ブロック種別**すべてに表示先を
  割り当て**、[data-model.md](data-model.md) に割り当て表として記録する
  (`docs/ui-coverage.md` は O-2 で作る。**その不在中、Principle XII の自動検証は vacuous であり、
  本 feature の未割当ゼロは data-model の割り当て表 + レビューでのみ担保される** — この scope 解釈は人間承認を要する)
- **FR-020**: 会話由来 markdown の表示は**生 HTML を描画しない** (raw HTML を有効化しない)。
  リンク URL は `http(s)` / 相対に、**画像 URL は `data:`(画像 MIME) / 相対のみ**に allowlist する
  (実 CSP `img-src 'self' data:` と一致させ http(s) リモート画像を除外)。`javascript:` / `vbscript:` /
  `file:` 等を除去する。CSP を XSS の最終防御線として保つ (AD-024/AD-025 §7)。
  transcript 本文・tool_result の中身を log / error message / renderer への理由文字列に含めない

### Key Entities _(include if feature involves data)_

- **SessionMessage**: SDK が過去 transcript から返す 1 メッセージ (`@anthropic-ai/claude-agent-sdk` 0.3.270 の
  `sdk.d.ts` で確認済み — 詳細は [data-model.md](data-model.md) §1)。
  `type` (user/assistant/system) / `uuid` / `session_id` / `message` (API の content ブロック列。型は `unknown`) /
  `parent_tool_use_id` / `parent_agent_id` を持つ **SDK 由来の外部型**。
  **本文はここに含まれ、境界を越える前に本文サニタイザを通す**
- **ThreadMessageLike**: assistant-ui runtime (`useExternalStoreRuntime`) に流し込む表示用メッセージ形。
  `SessionMessage` からの**変換先**。変換は `domain` の純粋関数 (FR-004)
- **選択されたセッション**: R-2 の store が持つ選択 (`sessionId` と由来所在 / `targetKey`)。本 feature の入力
- **transcript 取得結果**: 取得したメッセージ列と、読み込み状態 (loading / empty / ready / failed + 理由)。
  正本は Claude Code 側にあり、アプリ側はキャッシュ (Principle X)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 実データの過去セッション (WSL 内を含む) を画面に表示でき、同じ `sessionId` に SDK を
  直接呼んで得たメッセージ列と、画面のメッセージの**件数・順序・役割が一致**する。
  選択切替後に旧応答が届いても現在表示が保たれる (計測経路: quickstart 実機 + Vitest)
- **SC-002**: 3,000 件超のメッセージを持つ transcript で、**スクロール中のスクロール位置飛びが 0 件**であり、
  仮想化により描画される。**計測経路: Vitest は「仮想化されること (マウント数一定)」までを測り、位置飛び 0 の実体験は
  quickstart V-5 (実機)** (jsdom はレイアウトを持たず位置飛びを機械検証できない。SC-006 と同じ書き分け。pr-gate P-M-001)。
  初期表示時間の定量目標は research の実測課題とし、実測値を `quickstart-results.md` に記録する (SC の合否には含めない)
- **SC-003**: 仮想化により**同時マウント DOM ノード数が総メッセージ数に依存せず**一定範囲に収まる —
  総件数が N 倍でも同時マウント数が定数倍以内 (計測経路: 件数を変えた fixture でマウント数を比較する Vitest。
  **`virtualization.test.tsx` は 200 件と 3,000 件で同時マウント数が一致することを要求する** = 総件数非依存。pr-gate P-L-001)
- **SC-004**: 内容の逐次伸長中・測定確定時・初期ジャンプ時に**スクロール位置飛びが 0 件**である
  (計測経路: **位置飛び 0 の実体験は quickstart V-6 (実機)**。Vitest は measureElement/stickyRef の分岐までで
  位置飛びそのものは jsdom で測れない。pr-gate P-M-001)
- **SC-005**: 専用表示を持たない tool が**fallback で欠落なく**示され、未知の content ブロックも
  欠落しない。未閉鎖コードフェンス等の未完 markdown で**描画がクラッシュ・破綻しない** (計測経路: fixture Vitest)
- **SC-006**: 日本語・全角混在・絵文字・コードを含む transcript で、**本文サニタイザが改行/タブを保持し
  双方向/C1 制御文字を除去する** (計測経路: Vitest)。**視覚的なレイアウト崩れの確認は quickstart V-7 の実機**
  (jsdom の Vitest ではレイアウト計算が走らないため視覚崩れは検出できない。視覚回帰基盤は X-2 に申し送る)
- **SC-007**: transcript 本文が **main process のデータ経路上に現れない** — main が本文を保持・
  `JSON.parse`・structured clone deserialize しない構造であること。読み取り専用で config 書き込み 0 件・
  セッション起動 0 件 (計測経路: **port transfer の構造検査 + 手動レビュー + Vitest**。
  **依存グラフによる「main で評価されない」の自動証明は現状存在しない** — AD-031 が名指す composition-root
  到達集合検査は未構築であり、その持ち主 feature を roadmap に登録する)
- **SC-008**: `getTranscript` の入力検証で **`sessionId` の非 UUID / path traversal 文字列が拒否**され、
  会話由来 markdown の **XSS payload (生 HTML / `javascript:` リンク / `<img onerror>`) でスクリプト実行も
  生 HTML 描画も起きない** (計測経路: negative test Vitest)
- **SC-009**: 本 feature が表示する `SessionMessage` / content ブロックの種別**すべてに表示先が
  割り当てられ**、[data-model.md](data-model.md) に記録されている (計測経路: 割り当て表 + レビュー)
- **SC-010** (見栄えの一次判断): 実機で過去セッションを表示し、**判定 rubric の各観点で OK/NG を記録**して
  軸 1 の方向性を一次判断できる。rubric は少なくとも (a) markdown 見出し/リスト/コードブロックの
  ハイライトが Claude Code TUI と同等以上、(b) 日本語全角混在行で行送り・折返しが破綻しない、
  (c) fallback tool 表示が tool 名/入力/結果を欠落なく示す、(d) 数千件でスクロールが破綻しない、を含む。
  **判定表が `quickstart-results.md` に記録済みであることを done の必須項目**とする (実機操作の実施自体は
  人間 deferred だが、記録の有無は機械確認可能。ユーザ入力の受け入れ条件。計測経路: quickstart V-9)。
  **機械確認 (`tests/spec-artifacts/r3-quickstart-rubric.test.ts`) は判定表の骨格 (rubric-a〜d 行の存在と判定値) のみを
  検査し、判断の実施・結果 (OK/NG) は gate しない** (pr-gate P-M-002。全観点が `未実施` でも通る)。
  **実機での視覚的一次判断 (とくに rubric-a/b) の実施は roadmap で R-4 着手の前提として追跡する** (pr-gate H-002)

## Assumptions

- **[ASSUMED: streaming の live 源]** 過去ログは完結済みのため本 feature に live のストリーム源は無い。
  streaming text (FR-010) は**表示経路の頑健性**を逐次 store 更新 / fixture で検証し、
  live 接続は X-1 が行う。R-3 のユーザ価値は大きい tool_result の段階描画・折りたたみ展開に効く
- **[ASSUMED: subagent 表示]** `parent_agent_id` を持つ subagent メッセージのネスト表示は **R-4** の範囲。
  本 feature は主セッションのメッセージを対象とする (subagent が混じる場合は fallback でフラットに示し欠落させない)
- **[ASSUMED: コンパクション境界]** 専用 element は O-2。本 feature は最小の区切り表示に留める
- **[ASSUMED: 取得の単位と実行単位]** 選択セッションの全件取得を基本とし、`getSessionMessages` の
  `limit` / `offset` で段階取得しうる。取得は **target ごとに `CLAUDE_CONFIG_DIR` を起動時固定した
  専用 (短命) プロセス**で行い、共有可変 env の並行レースを避ける (FR-006)。実行単位の詳細は plan/ADR で確定
- **[ASSUMED: 大きい tool_result]** 本文サニタイザで**バイト長上限を超える tool_result を切り詰め + 折りたたみ表示**とする
- **[ASSUMED: 表示密度]** compact / comfortable の密度切替は O-1 の範囲。本 feature は既定の 1 密度で足りる

## Dependencies

- **R-2 (セッション列挙)** の FR/SC を継承する — セッション一覧・選択状態・`src/agents/` の SDK 境界・
  単一 capability の IPC・loading/empty/error 表示。**`normalize` は 1 行要約用であり本文にはそのまま使わない** (FR-016)
- **R-1** の path API / loading・empty・error element / 5 レイヤ構成と依存規則
- 前提 SPIKE: **SPIKE-2 完了** ([AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md)) /
  **SPIKE-14 完了** ([AD-019](../../docs/decisions/0019-assistant-ui-element-inventory.md))
- 参照 ADR: [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) (SDK メッセージ型) /
  [AD-021](../../docs/decisions/0021-session-store-and-enumeration.md) (`listSessions` の config dir 挙動。
  `getSessionMessages` は sdk.d.ts で別途確認 — data-model §1) /
  [AD-023](../../docs/decisions/0023-application-architecture.md) (`useExternalStoreRuntime` / MessagePort / 5 レイヤ) /
  [AD-030](../../docs/decisions/0030-enumeration-runs-in-one-resident-process.md) (列挙の常駐単一プロセスと直列化) /
  [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) (Principle IX 再評価と到達集合検査の宿題)

## targets 変更の記録

ユーザ入力は `--targets frontend` だったが、実データ表示に読み取り専用の backend 経路
(`getSessionMessages` + IPC + 取得プロセス) が要るため、**AskUserQuestion で targets を `both` に確定**した
(`targets_selected_by: user`)。BE (取得経路) / FE (表示・仮想化) / SH (許可リスト・ADR・docs) の 3 系統に分ける。
