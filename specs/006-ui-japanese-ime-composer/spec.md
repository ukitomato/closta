---
spec_id: 006-ui-japanese-ime-composer
feature_id: X-2
domain: ui
domain_selected_by: auto
targets: frontend
targets_selected_by: user
status: reviewing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 日本語 composer (X-2)

**Feature Branch**: `006-ui-japanese-ime-composer`

**Created**: 2026-09-27

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[ui] composer が日本語 IME で正しく動作するようにする。変換確定の Enter が送信にならないこと、全角混在でレイアウトが崩れないこと、実行中に次の入力を積めること、下書きが復元されること。IME の E2E テストと日本語を含むスクリーンショット比較を CI に載せる。"

## 本 feature の位置づけ

X-2 は M2「走らせられる」の 2 本目であり、`ui` domain の 5 本目 (R-3 / R-4 に続く) である。
`ui` charter Journey 3「日本語で入力する」(変換確定の Enter で送信されない / 全角混在でも崩れない) と
Journey 2 step 3「実行中に次の入力を積める (message queue)」に対応する。**Constitution Principle VIII
(NON-NEGOTIABLE)「日本語環境で破綻しない」の Automated 検証 2 項目 (composer の IME テスト / 日本語を含む
スクリーンショット比較) の持ち主が本 feature に確定している** ([AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) D3)。

**本 feature の前提は SPIKE-4 で潰してある** ([AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md))。
SPIKE-4 は「日本語 IME の composer 挙動」を 4 つの問い (確定 Enter / 全角レイアウト / 実行中積み / 下書き復元) で
調査し、次を確定した:

- **D1**: assistant-ui の `ComposerPrimitive.Input` が変換確定 Enter を**二重ガード** (keydown の
  `nativeEvent.isComposing` + `compositionRef`) し、React 19 の controlled-value 同期と compositionend の
  drop 復帰まで持つ。prompts.md L184-185 の「assistant-ui が `isComposing` を扱っていない場合、自前ガードを
  spec に含める」条件は**不成立**。→ **X-2 は自前 IME ガードを新設しない (作り変えない最小案)。既存ガードを
  殺さないことを守る。**
- **D2**: 「実行中積み」「下書き復元」は IME 挙動ではなく **runtime capability / composer state の設計事項**。
  現状 external store runtime に queue capability が無く、下書き永続は標準機能に無い。→ **X-2 の実質的な新規設計**。
- **D3**: Principle VIII Automated (A) IME E2E / (B) 日本語スクリーンショット比較の持ち主は X-2。送信経路は
  **X-1 が開いた**ため発動条件を満たす。Automated の**正本は grep でなく E2E + スクリーンショット比較**である
  ([AD-024](../../docs/decisions/0024-constitution-verification-paths.md) #18。`bad_pattern_grep` は番人でない)。

**送信経路は X-1 が開いた。** [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md)
(X-1) が composer の送信経路を初めて本番で開け、`SessionScreen` の `LiveThread` は `isDisabled` を
`runState === 'error' || killed` のときだけ true にする (`SessionScreen.tsx:151`)。R-3 まで `isDisabled: true` で
閉じていた経路が有効になったため、IME 挙動は「描画だけ」でなく「実際に送信される経路」の問題になった。
本 feature は**その有効 composer に対する日本語入力の健全性を確定し、回帰を Automated 検証で恒久的に固定する**。

**本 feature は「何を満たすか」を定める。** queue の dispatch trigger の細部・下書き保持の state 配置・
E2E ハーネスの構成手段といった実装方式は [plan.md](plan.md) / [tasks.md](tasks.md) とコードで決める。

## Clarifications

### Session 2026-09-27

起案時に、実装コスト・成果物・session domain との調整範囲を大きく左右する 2 つの設計分岐 (AD-037 D2 が
「X-2 spec で確定する」とした点) を AskUserQuestion で確定した。それ以外は AD-037 / X-1 に根拠があり [ASSUMED] /
[確定] として Assumptions に記録している。

- Q: 「実行中に次の入力を積める」をどの方式で実現するか (message queue の実現手段と、積んだ入力を claude へ渡す経路) →
  A: assistant-ui の標準 message queue capability を external store runtime に宣言し、積んだ入力を**同一セッションの
  次ターン** (X-1 の AsyncIterable stdin の続き) として送る。**`interrupt`→steer はしない** (作り変えない最小案)。
- Q: 「下書きが復元される」の範囲をどこまでにするか →
  A: `SessionScreen` の phase / `isDisabled` 変化による **Thread 再構成をまたぐメモリ保持のみ**。アプリ再起動・
  永続層をまたぐ復元は本 feature 外 (thread 切替時の保持は単一セッションで未発生のため対象外)。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 日本語 IME で変換確定の Enter が送信にならず、全角混在でレイアウトが崩れない (Priority: P1)

利用者は日本語を入力し、変換候補を確定するために Enter を押す。**送信されない — 変換が確定するだけ**である。
もう一度 Enter を押して初めて送信される。全角・半角が混在した文でも composer のレイアウトが崩れない。

**Why this priority**: `ui` charter の軸 1 は製品の採否を決める。日本語が崩れる / 誤送信する composer は
機能が揃っていても使われない。X-1 で送信経路が開いた以上、日本語入力の健全性は M2「走らせられる」
(「日本語で誤送信しない」= roadmap M2 達成状態) の中核である。roadmap が X-2 を X-1 直後に置いたのは
「日本語入力が壊れたままでは以降の feature を自分で使えない」ためである。

**Independent Test**: 有効な live composer に対し、IME 変換中 (`isComposing`) の Enter が送信経路
(`onNew` / `session.send`) に届かないことを IME E2E で確認する。**idle/既定 composer と `running` + message queue
有効化後 (`isRunning && hasQueue` 分岐。AD-037 §4) の両状態**で確認する (queue 有効化が Enter 分岐を変えるため)。
変換確定後の 2 度目の Enter で送信されること、**変換中のマウス送信でも未確定文字列が送信されないこと** (AC-6) も
確認する。全角混在の入力で composer が基準スクリーンショットと一致することを確認する。加えて **既存の
assistant-ui ガードを消費側が殺していないこと** (onKeyDown で `preventDefault` しない / `submitMode` 既定 /
`Input` 非差し替え) を composer の component / 静的検査で確認する。E2E は capability 層を stub し real 資格情報なしで
有効 composer に到達する (design-gate H-3)。

**Acceptance Scenarios**:

1. **Given** 日本語を入力中で変換候補ウィンドウが出ている (`isComposing === true`)、**When** 確定のため Enter を押す、
   **Then** 送信されず、変換が確定するだけである
2. **Given** 変換が確定した直後、**When** もう一度 Enter を押す、**Then** メッセージが送信される
3. **Given** 全角・半角・絵文字が混在した長文を入力する、**When** composer を見る、**Then** 水平あふれ・桁ずれ・
   要素崩れが起きず、textarea が行数に応じて伸びる (基準スクリーンショットと一致)
4. **Given** 消費側 (Closta の composer 配線) のコード、**When** 検査する、**Then** `onKeyDown` で `preventDefault`
   しておらず、`submitMode` が既定 (`"enter"`) のままで、`ComposerPrimitive.Input` を独自 textarea に差し替えていない
   (既存の二重ガードを殺していない。AD-037 D1)
5. **Given** ブラウザが `compositionend` を落とした状況、**When** 次の入力を行う、**Then** 確定値を失わない
   (assistant-ui の drop 復帰。AD-037 §1。消費側はこれを壊さない)
6. **Given** IME 変換中、**When** 送信ボタンをマウスで押す、**Then** 変換確定が優先され、確定前の未確定文字列が
   そのまま送信されない

---

### User Story 2 - 実行中に次の入力を積める (message queue) (Priority: P1)

セッションが応答を生成している最中 (`running` / `awaiting_permission`) でも、利用者は次の入力を打って
**積んで**おける。積んだ入力は現ターンの完了後に**同一セッションの続き**として送られる。中断したときは、
何が積まれたまま残り、何が取り消されたかが分かる。

**Why this priority**: `ui` charter Journey 2 step 3 が明示する体験であり、X-1 は現状「実行中は Send が Cancel に
差し替わり、次の入力を積めない」(AD-037 §4)。長い応答を待つ間に次の指示を用意できないと、生きたセッションを
差配する体験が成立しない。X-1 が in-memory セッションキューの素 (`still_queued` / `cancelled`) を残しており
(X-1 FR-019)、本 feature がその上に composer 側の message queue を載せる。

**Independent Test**: fake の external store runtime に対し、`running` / `awaiting_permission` 中に入力を送信すると
message queue に積まれ可視化されることを component テストで確認する。現ターン完了後に積んだ項目が同一セッションの
次ターンとして dispatch されること、中断・error・crash 等の各終端で未 dispatch 項目の disposition が定義され
`still_queued` / `cancelled` が提示できること、**表示される queue 状態が実際の dispatch / cancel 結果と一致すること
(単一真実源)** を fake session の単体テストで確認する。

**Acceptance Scenarios**:

1. **Given** セッションが `running`、**When** 次の入力を打って送信する、**Then** その入力は message queue に積まれ、
   積まれていることが利用者に見える (新規起動を伴わない)
2. **Given** 積んだ入力があり現ターンが完了した、**When** 完了を受け取る、**Then** 積んだ入力が**同一セッションの
   次ターン**として送られる (X-1 が開いた AsyncIterable stdin の続き)
3. **Given** `awaiting_permission` (承認待ち) 中、**When** 次の入力を打つ、**Then** message queue に積める
4. **Given** キューに項目がある状態で中断する、**When** 状態を見る、**Then** 何が残り (`still_queued`) 何が消えたか
   (`cancelled`) が提示される (X-1 FR-019 の意味論を継承)
5. **Given** `error` / 強制終了で composer が無効 (`isDisabled`) のとき、**When** 入力を積もうとする、**Then** 積めない
   (積みは非終端の稼働状態に限る)
6. **Given** キューに未 dispatch 項目がある状態で現ターンが `error` / crash / `provider-error` / 強制終了 で終端する
   (composer が `isDisabled`)、**When** 状態を見る、**Then** 未 dispatch 項目が `cancelled` として提示され (永久 stranded に
   しない)、reset / 再 launch で破棄され次セッションへ持ち越されない (誤 dispatch を起こさない。design-gate H-4/R2-M-002)
7. **Given** キューが上限件数に達している、**When** さらに積もうとする、**Then** 積み込みが拒否され理由が提示される
   (最古破棄しない。design-gate R2-M-001)

---

### User Story 3 - 下書きが画面再構成をまたいで復元される (Priority: P2)

利用者が composer に入力しかけたまま、セッションの画面状態が変わった (起動フェーズの遷移や失敗表示への切替) —
それでも**打ちかけの下書きが消えない**。画面が組み直されても、入力していたテキストがそのまま残る。

**Why this priority**: `SessionScreen` は phase (entry/launching/active) や `isDisabled` (error/killed) で Thread を
再構成し、その過程で入力中テキストが失われる (AD-037 §4(ii))。打ちかけを毎回失うのは実用の妨げになる。
ただし正常系 (US-1 / US-2) が満たされて初めて意味を持つため P2 とする。

**Independent Test**: Thread の再構成を誘発する状態遷移 (phase 変化 / `isDisabled` の true→false) を与えても、
composer の下書きテキストが保持されることを component テストで確認する。

**Acceptance Scenarios**:

1. **Given** composer に未送信の下書きを入力中、**When** phase (entry/launching/active) の遷移で Thread が再構成される、
   **Then** 下書きテキストが保持される
2. **Given** composer に未送信の下書きがある、**When** `isDisabled` (error/killed→復帰) の変化で Thread が再構成される、
   **Then** 下書きテキストが保持される
3. **Given** 下書きを送信した / 明示的に消した、**When** 状態を見る、**Then** 下書きは空になる (送信済み内容が
   残り続けない)

---

### User Story 4 - 日本語入力の健全性を Automated 検証として CI に常設する (Priority: P1)

Principle VIII の Automated 2 項目 — composer の IME テストと日本語を含むスクリーンショット比較 — が
**CI に常設され、緑である**。以後、日本語入力の健全性 (US-1) が回帰したら CI が落ちる。

**Why this priority**: Principle VIII は NON-NEGOTIABLE であり、その Automated 検証は現状**どちらも CI に
載っていない** (discovery.md / Constitution VIII 現状の制約)。`bad_pattern_grep` は送信が `@assistant-ui/react` の
内側で起きるため常に 0 件を返し**番人にならない** (AD-024 #18)。X-1 が送信経路を開けた今、検証を grep から
E2E + スクリーンショット比較へ移すことが Principle VIII を実際に守る唯一の道である (AD-037 D3)。US-1 の
振る舞いを恒久的に固定する土台であるため P1。

**Independent Test**: CI (`verify` workflow) に IME E2E ジョブと日本語スクリーンショット比較ジョブが存在し、
通過することを確認する。既存ガードを殺す変更 (US-1 AC-4 に反する差分) を入れると IME E2E が落ちることを確認する。

**Acceptance Scenarios**:

1. **Given** リポジトリの CI、**When** verify workflow を走らせる、**Then** IME 変換確定 Enter が送信にならないことを
   検証する E2E ジョブが実行され通過する
2. **Given** リポジトリの CI、**When** verify workflow を走らせる、**Then** 日本語を含む composer のスクリーンショットを
   基準画像と比較するジョブが実行され通過する
3. **Given** 既存ガードを殺す変更 (`onKeyDown` の `preventDefault` / `submitMode` 上書き / `Input` 差し替え) を入れる、
   **When** CI を走らせる、**Then** IME E2E が落ちる (回帰が検出される)

---

### Edge Cases

- 変換候補ウィンドウ表示中の Enter (`isComposing === true`) — 送信しない (assistant-ui の keydown 一次ガード)
- ブラウザが `compositionend` を落とす — assistant-ui の drop 復帰で確定値を失わない (AD-037 §1)。消費側はこれを壊さない
- **electron 39.8.10 実機で確定 Enter の keydown が `isComposing === true` で来るタイミング** — ソースからは
  断定できず**人間 deferred** (quickstart 目視。単一 Chromium エンジンのため 2 エンジン検証は不要。AD-001)
- 全角混在の**行送り (line-height) と字幅の見え** — フォント/字幅依存でソース・単体テストからは断定できない
  (jsdom はフォントを持たない。AD-024)。日本語スクリーンショット比較で担保し、基準画像の視覚的妥当性判断は
  人間 deferred (R-3 rubric と同じ扱い)
- `running` 中に多数の入力を積む — キューの上限と表示の扱いは plan で決める (無制限に積ませない)
- 中断・`error`・crash・`provider-error`・強制終了でターンが終端 — 未 dispatch のキュー項目は既定で `still_queued` として
  残し、表示を実状態と一致させる (`cancelled` は利用者操作等でのみ生じる。単一真実源 = composer 側。design-gate H-1/H-4)
- IME 変換中にマウスで送信ボタンを押す — 変換確定を優先し未確定文字列を送らない (US-1 AC-6。assistant-ui が同経路を
  抑止するかは research R-05 で確認し、しない場合のみ確定優先の最小処理を足す)
- Thread が error/killed への切替で再構成される最中に入力中 — 下書きを失わない (US-3)
- `error` / 強制終了で composer が `isDisabled` — 積みも不可 (非終端の稼働状態でのみ積める)
- 空 / 空白のみ / 巨大なプロンプト — 空/空白のみは送信不能 (積みも不可)、巨大はバイト長上限 (X-1 FR-018 を継承)
- CI ランナーに日本語フォントが無い — **リポジトリ同梱 .ttf を非永続注入 (`@font-face` / Playwright 注入) で用い、
  OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入 等のホスト永続変更を一切しない** (Principle VI。design-gate H-6/H-101)
- E2E が CI (WSL / claude 不在) で有効 composer に到達 — capability 層を stub し fake runtime / session で active phase を
  作る。real な資格情報を使わない (Principle V。design-gate H-3)

## Requirements _(mandatory)_

### Functional Requirements

**番号は追加順、並びは主題順である。重複は無い。**

#### IME 挙動と入力の最小規律 (Principle VIII)

- **FR-001**: composer は assistant-ui の `ComposerPrimitive.Input` を用い、**変換確定の Enter を送信として
  扱ってはならない**。**自前 IME ガードを新設しない** — assistant-ui の二重ガード (keydown の
  `nativeEvent.isComposing` + `compositionRef`、React 19 の controlled-value 同期、compositionend の drop 復帰) を
  消費側が**殺さない**ことを守る ([AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) D1)。
  具体的には (a) `onKeyDown` で `preventDefault` せず Enter を横取りしない、(b) `submitMode` を既定 (`"enter"`) の
  まま使う、(c) `ComposerPrimitive.Input` を独自 `<textarea>` に差し替えない、(d) **IME 変換中 (`isComposing`) の
  マウス送信ボタン押下でも未確定文字列を送信しない** — assistant-ui が同経路 (マウス submit) を変換中に抑止するかを
  実ソースで確認し (research R-05)、抑止しない場合のみ「確定優先」の最小処理を足す (これは keydown 用の**自前 IME ガード
  新設ではない**。AD-037 D1 の対象は確定 Enter の keydown 経路)。回帰は FR-012 の E2E で固定する (US-1 AC-6 を含む)
- **FR-002**: 全角・半角・絵文字が混在した入力で composer の**レイアウトを崩してはならない** (水平あふれ・桁ずれ・
  要素崩れを起こさない)。行送り (line-height) と全角の見えの最終判断は視覚検証 (FR-010 / 人間 deferred) に委ねる
  (Principle VIII / XV。AD-037 §3)
- **FR-003**: 空 / 空白のみのプロンプトは**送信不能**とし、outbound プロンプトにバイト長上限を課す
  (X-1 FR-018 を継承する。本 feature で新設しない)。**キューに積む項目も enqueue 時に空/空白・バイト長上限を検証し、
  空・超過は積まない** (dispatch 時の遅延失敗を作らない。空扱いと対称。design-gate R2-M-003)

#### 実行中の入力積み (message queue)

- **FR-004**: `running` および `awaiting_permission` 中も composer が入力を受け付け、送信を **message queue に
  積める**ようにしなければならない。実現手段は **message queue capability を external store runtime に宣言する、
  または同等の feature 側 queue で契約 C-3 の振る舞いを満たす**こととし、いずれでも可 (assistant-ui が external
  store runtime で message queue を受けるかは実ソースで確認する。research R-02。要件は「積めて可視化され次ターンに
  送られる」振る舞いであり、特定 API の宣言そのものではない)。**可視化**: 実装検証 (research R-02) で、native queue は
  **実行中の送信を steer lane** に載せ、`ComposerPrimitive.Queue` / `QueueItemPrimitive` の表示ソース (queue lane) には出ない
  ことが判明した。したがって実行中 pending は **native controller の steer lane を読む最小の feature 側 notice
  (`PendingQueueNotice`)** で可視化する (研究 R-02 修正案(a))。full な queue UI を独自 design system で作り直すのではなく
  assistant-ui の native queue controller に乗る (Principle XIII の趣旨を保つ)。実行中に Send を Cancel に差し替える現挙動
  (`thread.aui.tsx`) と両立させる。**キュー件数の上限に達したときは新規の積み込みを拒否し理由を提示する
  (最古破棄はしない)。上限値は plan で確定する** (振る舞いは spec で固定、値のみ plan 委ね。design-gate R2-M-001)
- **FR-005**: 積まれた入力は現ターンの完了後に**同一セッションの次ターン** (X-1 が開いた AsyncIterable stdin の
  続き) として送られなければならない。**新規起動を伴わない**。**`interrupt`→steer は行わない** (現ターンを中断して
  積んだ入力で steer しない。AD-036 の単一 query streaming input に踏み込まない)。**message queue の保持は composer 側
  feature state を単一の真実源 (single locus) とする** — running / awaiting_permission 中は composer 側に積み、完了時に
  先頭 1 件を `session.send` で dispatch する (同時に in-flight となるのは 1 ターン分のみ)。X-1 の in-memory セッション
  キューを**保持層として二重に経由しない** (二重積み・二重 dispatch を作らない。design-gate H-1)。dispatch trigger の
  細部は session domain と調整して plan で確定する ([AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) D2)
- **FR-006**: キュー内の未 dispatch 項目の disposition を**全終端遷移で定義し、表示を実状態と一致**させなければならない。
  **中断 (`interrupt`。セッションは継続可能)** では未 dispatch 項目を `still_queued` として残し、次ターンで dispatch できる。
  **`error` / crash / `provider-error` / 強制終了 (composer が `isDisabled` になる終端)** では未 dispatch 項目を `cancelled`
  にし (**永久 stranded にしない**)、feature-state のキューは reset / 再 launch で**破棄**する (次セッションへ持ち越して
  誤 dispatch しない。Principle VIII。design-gate R2-M-002)。**利用者に見える `still_queued` / `cancelled` は実状態と一致する**
  (単一真実源 = composer 側 feature state。design-gate H-1)。in-flight で dispatch 済みの 1 件の中断結果 (途中出力の保持等) は
  X-1 の interrupt-receipt / `still_queued` / `cancelled` の**意味論を継承**する (X-1 FR-019。本 feature は composer 側 queue の
  保持・表示・次ターン配線を担う)

#### 下書き復元 (draft restore)

- **FR-007**: composer の下書き (未送信の入力テキスト) は、`SessionScreen` の phase (entry/launching/active) 変化・
  `isDisabled` (error/killed) による **Thread 再構成をまたいで保持**されなければならない (AD-037 §4(ii))
- **FR-008**: 下書き保持は**メモリ内 (feature 側 state) に限る**。アプリ再起動・永続層をまたぐ下書き復元は本 feature
  外とする (Out of Scope)。thread 切替時の下書き保持は単一セッション (X-1) では発生しないため対象外 (複数セッションは
  X-5 以降)

#### Principle VIII Automated 検証 (E2E + 日本語スクリーンショット)

- **FR-009**: IME の E2E テスト (変換確定の Enter が送信にならない回帰) を **CI に常設**しなければならない。
  **検証の正本は grep でなく E2E** である ([AD-024](../../docs/decisions/0024-constitution-verification-paths.md) #18 /
  AD-037 D3。`bad_pattern_grep` は本 Principle の番人でない)
- **FR-010**: 日本語を含む composer のスクリーンショット比較 (全角混在レイアウトの基準画像) を **CI に常設**しなければ
  ならない (`ui` charter KPI「日本語の健全性」/ Constitution VIII Automated (B))。**日本語フォントはリポジトリ同梱
  (`e2e/` 配下に .ttf を commit) のみを用い、CI ランナー / ホストへの永続的フォント変更 (OS 登録・`Fonts` ディレクトリ
  複製・`fc-cache`・パッケージマネージャ導入 等) を一切行わない。同梱 .ttf は非永続な注入 (アプリ内 `@font-face` /
  Playwright 側の注入) 経由でのみ用いる** (Principle VI。design-gate H-6/H-101)。基準画像は会話本文・config ディレクトリ
  由来情報を含めてはならない (design-gate H-3)
- **FR-011**: 本 feature は IME E2E / 日本語スクリーンショット比較を載せる**最小ハーネス** (Electron/GUI を CI で
  起動する仕組み + 同梱日本語フォント + 基準画像) を導入し、[docs/roadmap.md](../../docs/roadmap.md) L115-124 の deferred
  「E2E / 検証基盤 feature」から **Principle VIII の 2 項目のみ**を本 feature へ移設する (AD-037 D3)。**スクロール
  安定の E2E 計測と Principle IX 到達集合検査は移設せず deferred feature に残す** (roadmap L122-124。過剰な前倒しを
  しない)。**E2E ハーネスは有効 composer 状態 (active phase・`isDisabled: false`) に real な Claude 認証・WSL・外部 API
  接続なしで到達しなければならない** — capability 層 (`window.closta` = `launchSession` / `sendPrompt`) を stub し fake の
  runtime / session を注入して active phase を決定的に作る (既存 `src/renderer/src/test-support/capability.ts` を活用。
  research R-04/R-05。design-gate H-3)。**real な長期資格情報を CI env / secrets に置かない** (Principle V)。ハーネスの
  技術選定・CI 統合・基準画像ガバナンス・フォント同梱・scope 限定・e2e の lint/depcruise/tsc scope 分離は
  [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) が正本 (本 feature で proposed 起票。design-gate M-1)
- **FR-012**: 既存ガードを殺さないこと (FR-001 の (a)(b)(c)) の回帰を **E2E で固定**しなければならない (US-1 AC-4 に
  反する差分が入ると IME E2E が落ちる)

#### 用語 / glossary

- **FR-013**: 本 feature で導入・確定する用語 (**composer** / **message queue** (実行中積み) / **draft** (下書き)) を
  [docs/glossary.md](../../docs/glossary.md) に反映しなければならない (Principle XIV。同義異語を増やさない)

### Key Entities

- **Composer draft (下書き)**: 未送信の composer 入力テキスト。feature 側 state に保持し、Thread 再構成
  (phase / `isDisabled` 変化) をまたいで復元する。**永続層・IPC 境界には出さない** (メモリ内限定)
- **Message queue item (キュー項目)**: `running` / `awaiting_permission` 中に積まれた未送信入力。**保持の単一真実源は
  assistant-ui native queue controller (steer lane)** — feature 側は controller を単一 locus とし二重キューを作らない
  (design-gate H-1 / research R-02)。現ターン完了後に先頭 1 件が同一セッションの次ターンとして dispatch される。
  中断・error・crash・provider-error・強制終了のいずれの終端でも未 dispatch 項目の disposition (`still_queued` / `cancelled`)
  が定義され、表示は実状態と一致する (X-1 FR-019 の意味論を継承)。表示は steer lane を読む `PendingQueueNotice`
  (実行後に送信予定) / 終端は `CancelledQueueNotice` (取り消された入力)。積み込み拒否理由は `QueueRejectionNotice`
- **IME guard (既存・非所有)**: assistant-ui `ComposerPrimitive.Input` の二重ガード (keydown の
  `nativeEvent.isComposing` + `compositionRef` + React 19 同期 + drop 復帰)。**X-2 は所有せず「殺さない」対象**。
  消費側が `onKeyDown` / `submitMode` / `Input` 差し替えで無効化しないことだけを守る
- **IME E2E / 日本語スクリーンショット基盤**: Principle VIII Automated (A)(B) を CI に載せる最小ハーネス
  (Electron/GUI 起動 + 日本語フォント + 基準画像)。本 feature が導入し、以後の回帰検出の正本になる

## Success Criteria _(mandatory)_

- **SC-001**: **変換確定の Enter が送信にならず、既存の assistant-ui ガードが殺されていない** (Principle VIII の核心。
  FR-001 / FR-012)。計測経路: (a) IME E2E (CI 常設) で `isComposing` 中の Enter が送信経路 (`onNew` / `session.send`) に
  届かず、確定後の 2 度目の Enter で送信されること、(b) composer の component / 静的検査で消費側が `onKeyDown` で
  `preventDefault` せず・`submitMode` 既定・`Input` 非差し替えであること (既存ガード非破壊)。**IME E2E は (i) idle/既定
  composer と (ii) `running` + message queue 有効化後 (`isRunning && hasQueue` 分岐。AD-037 §4) の両状態**で確定 Enter が
  送信経路に届かないことを assert する (queue 有効化が Enter 分岐を変えるため。design-gate H-2)。加えて **(c) IME 変換中の
  マウス送信でも未確定文字列が送信されない** (US-1 AC-6)。既存 `ChatScreen.test.tsx` は `isDisabled: true` 前提であり
  有効 composer の番人ではない (新 IME E2E が番人)
- **SC-002**: **全角混在で composer のレイアウトが崩れない** (FR-002)。計測経路: 日本語を含むスクリーンショット比較
  (CI 常設) が承認済み基準画像と一致する。**行送り・全角の見えの基準画像そのものの視覚的妥当性判断は人間 deferred**
  とし quickstart に記録する (フォント/字幅依存でソース・単体テストからは測れない。R-3 rubric と同じ扱い。合否条件を
  測定不能な clause で汚さない)
- **SC-003**: **`running` / `awaiting_permission` 中に入力を積め、積まれていることが見える** (FR-004)。計測経路:
  fake external store runtime に対し、稼働中の送信が native queue の steer lane に積まれ **`PendingQueueNotice`** で
  可視化されることを component テストで assert する (`queue-behavior.test.tsx` = steer lane 検証 / `pending-queue-notice.test.tsx`
  = 可視化。native queue の steer lane は `QueueItemPrimitive` に出ないため PendingQueueNotice で表示。research R-02)。
  **上限到達で積み込み拒否+理由提示**は `composer-queue-adapter.test.ts` (capped adapter) が assert する (R2-M-001)
- **SC-004**: **積んだ入力が現ターン完了後に同一セッションの次ターンとして送られ、新規起動を伴わない。中断・`error`・
  crash・`provider-error`・強制終了の**すべての終端**で未 dispatch 項目の disposition が定義され、表示される
  `still_queued` / `cancelled` が実状態と一致する** (単一真実源 = composer 側 feature state。FR-005 / FR-006。
  design-gate H-1/H-4)。**interrupt は still_queued を残し、error/killed 終端は cancelled + 再 launch で破棄 (次セッションへの
  持ち越し 0)** (R2-M-002)。`interrupt`→steer が発生しない (負例を含む)。計測経路: fake session の Vitest
  (dispatch trigger / 各終端遷移でのキュー disposition / **表示と実状態の一致 assert** / 終端後の持ち越し 0 / interrupt→steer 0 件)
- **SC-005**: **composer 下書きが Thread 再構成をまたいで保持される** (FR-007)。計測経路: 再構成を誘発する状態遷移
  (phase 変化 / `isDisabled` の true↔false) を与えた component テストで下書きテキストの保持を assert し、送信・明示クリア
  後は空になることも assert する
- **SC-006**: **IME E2E と日本語スクリーンショット比較が CI に存在し通過する** (`ui` charter KPI「日本語の健全性」/
  Principle VIII Automated (A)(B)。FR-009 / FR-010 / FR-011)。計測経路: CI (`verify` workflow) に該当 2 ジョブが存在し
  緑であること。移設対象外 (スクロール安定 E2E / Principle IX 到達集合検査) が本 feature に混入していないことも確認する

## Assumptions

`[USER]` は起案時に人間が確定したもの、`[確定]` は AD-037 が確定したもの、`[ASSUMED]` は本 spec で自動採用したもの、
`[人間 deferred]` は実機目視に委ねるもの。

- **[USER]** 実行中積みは**標準 message queue → 次ターン送信**方式とする (AskUserQuestion 確定)。message queue
  capability を external store runtime に宣言する (または同等の feature 側 queue。振る舞い基準。design-gate L-3/FR-004)、
  積んだ入力を同一セッションの次ターンとして送る。**`interrupt`→steer はしない**
- **[確定/design-gate H-1]** message queue の保持は **composer 側 feature state を単一の真実源**とする。X-1 の in-memory
  セッションキューを保持層として二重に経由しない (二重積み・二重 dispatch を作らない)。表示 `still_queued`/`cancelled` は
  実状態と一致させ、in-flight 1 件の中断結果のみ X-1 の意味論を継承する
- **[確定/design-gate H-4]** 未 dispatch のキュー項目の disposition は interrupt だけでなく **error / crash /
  provider-error / 強制終了 のすべての終端**で定義する (既定 `still_queued` 残置)。予期せぬ dispatch = 誤送信の変種を作らない
- **[確定/design-gate H-3]** E2E は capability 層を stub し fake runtime/session で有効 composer に到達する。**real な長期
  資格情報を CI env/secrets に置かない** (Principle V)。基準画像に会話/config 由来情報を含めない
- **[確定/design-gate H-6]** 日本語フォントは **リポジトリ同梱 (`e2e/` の .ttf) のみ**。CI でパッケージマネージャ導入をしない
  (Principle VI)。check.mjs 項目 1 は verify.yml を走査しないため font provisioning の VI は Manual reviewer + 同梱限定で守る
- **[確定/design-gate M-1]** E2E / スクリーンショット検証ハーネスの技術選定・CI 統合・基準画像ガバナンス・フォント同梱・
  scope 限定・e2e の lint/depcruise/tsc scope 分離は [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) を正本とする
  (本 feature で proposed 起票。design-gate PASS で accepted へ)
- **[USER]** 下書き復元は**画面再構成をまたぐメモリ保持のみ**とする (AskUserQuestion 確定)。アプリ再起動・永続層を
  またぐ復元は本 feature 外
- **[確定]** 自前 IME ガードを新設しない。assistant-ui の二重ガードを殺さないことを守る (AD-037 D1)。prompts.md
  L184-185 の「自前ガードを spec に含める」条件は SPIKE-4 の結果不成立
- **[確定]** Principle VIII Automated (A) IME E2E / (B) 日本語スクリーンショット比較の持ち主は X-2 (AD-037 D3)。
  Automated の正本は grep でなく E2E + スクリーンショット比較 (AD-024 #18)
- **[確定]** 実行中積み・下書き復元は IME 挙動でなく runtime capability / composer state の設計事項 (AD-037 D2)。
  X-1 が in-memory セッションキュー (`still_queued` / `cancelled`) と AsyncIterable stdin を既に持つため、本 feature は
  その上に composer 側 queue と次ターン dispatch を載せる
- **[人間 deferred]** electron 39.8.10 実機での確定 Enter の `isComposing` タイミング目視、および全角混在の行送り・
  折返しの見え。R-3 rubric の一次判断と同じ扱いで quickstart / スクリーンショットに割り当てる (GUI の IME 操作は
  自動化できない / jsdom はフォントを持たない)。単一 Chromium エンジンのため 2 エンジン分の検証は不要 (AD-001)
- **[ASSUMED]** E2E ハーネスの技術は Playwright (discovery.md 宣言スタック / roadmap の「E2E / 検証基盤」)。
  Electron を CI で起動する形は本 feature で最小構築する (現状 Playwright は未導入。discovery.md)
- **[ASSUMED]** message queue の dispatch trigger (完了直後 auto か明示操作か)・キュー上限とその到達時 UX・表示密度は
  plan で session domain と調整して確定する。本 spec は「同一セッションの次ターンとして送る / interrupt→steer しない /
  保持は composer 側単一真実源 / 全終端で disposition 定義」までを固定する
- **[ASSUMED]** composer 表示部品 (`ComposerPrimitive.Queue` / `QueueItemPrimitive`) は assistant-ui の vendored
  registry 複製 (`src/renderer/src/components/assistant-ui/elements/`) をそのまま用い、feature 側の配線 (queue capability
  宣言 / 下書き state) は `src/renderer/src/features/session/` に置く (Principle XIII。registry からの乖離を作らない)

## Out of Scope

- **自前 IME ガードの新設** → 不要 (AD-037 D1。既存ガードを殺さない回帰のみ担う)
- **`interrupt`→steer による実行中入力の steer** → session domain の新規設計 (AD-036 の単一 query streaming に踏み込む)。
  本 feature は「次ターン送信」に限る
- **アプリ再起動・永続層をまたぐ下書きの永続復元** → 本 feature はメモリ保持のみ。永続 (JSON 設定 / SQLite) は
  導入しない
- **thread 切替時の下書き保持** → 単一セッション (X-1) では発生しない。複数セッション (X-5) 以降
- **cancelled になったキュー項目テキストの再編集 / composer への復帰導線** → 本 feature では**提示のみ (再編集不可)**。
  復帰は後続 feature (design-gate R2-L-001)
- **スクロール安定の E2E 計測 / Principle IX 到達集合検査** → roadmap L122-124 の deferred「E2E / 検証基盤 feature」に
  残す。本 feature は E2E ハーネスを導入するが載せるのは Principle VIII の 2 項目のみ (AD-037 D3)
- **slash commands / mentions / attachments / dictation の日本語対応** → `ui` charter の composer scope の残りは後続 feature
- **送信経路・承認カード・中断/強制終了そのもの** → X-1 (本 feature はその上の composer 体験を担う)
- **ui-coverage 対応表の完成** → O-2

## Dependencies

- **X-1 完了 (spec 005)** — 送信経路 (`isDisabled: true` を外した有効 composer。`SessionScreen.tsx:151`)、
  in-memory セッションキュー (`still_queued` / `cancelled`。X-1 FR-019)、AsyncIterable stdin (X-1 FR-011)、
  `LiveThread` の `useExternalStoreRuntime` 配線 (`SessionScreen.tsx:140-167`)。FR-004 / FR-005 / FR-006 / FR-007 の前提
- **R-3 / R-4 完了** — transcript / composer の表示基盤 (`thread.aui.tsx` の `Composer` / `ComposerPrimitive.Input`。
  `useExternalStoreRuntime`)。FR-001 / FR-002 / FR-004 の前提
- **[AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) (本 feature で proposed 起票)** — E2E / スクリーンショット
  検証ハーネスの導入 (Playwright + Electron `_electron.launch` / e2e の src グラフ外配置と lint/depcruise/tsc scope 分離 /
  日本語フォント同梱限定 / 基準画像ガバナンス / capability stub による credential-free 到達 / scope は Principle VIII の
  2 項目に限定)。design-gate M-1 の指摘に基づく。design-gate PASS で accepted へ (X-1 が AD-036 を起票した先例)
- **[AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) (SPIKE-4) accepted** — 本 feature の直接の前提。
  D1 (自前ガード不要・既存ガードを殺さない) / D2 (queue・draft は runtime capability / composer state) /
  D3 (Principle VIII Automated (A)(B) の所有と roadmap L120 からの移設)
- **[AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md)** — 単一 query streaming input。
  queue の次ターン dispatch の調整先 (FR-005)
- **[AD-024](../../docs/decisions/0024-constitution-verification-paths.md) #18** — Principle VIII の Automated の正本を
  grep から E2E + スクリーンショットへ移す / `bad_pattern_grep` は番人でない。FR-009 の根拠
- **[AD-001](../../docs/decisions/0001-adopt-electron-over-tauri.md)** — 単一 Chromium エンジン。確定 Enter の
  実機目視が 2 エンジン分不要である根拠 (人間 deferred の範囲確定)
- **Constitution Principle VIII (NON-NEGOTIABLE)** — 日本語環境で破綻しない (本 feature の主目的)。
  **XV** (i18n) / **XIII** (assistant-ui design system に乗る・自作しない) / **XIV** (用語を glossary に反映)
- **discovery.md** — Playwright は**未導入** (本 feature が導入)。CI は `.github/workflows/verify.yml` (windows-latest)。
  agent 用検証コマンドは discovery.md の「Build / Test / Lint」表が正本
