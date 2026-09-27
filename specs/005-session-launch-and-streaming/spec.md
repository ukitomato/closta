---
spec_id: 005-session-launch-and-streaming
feature_id: X-1
domain: session
domain_selected_by: user
targets: both
targets_selected_by: user
status: completed
bf_ids: []
sf_ids: []
linear: null
status_note: design-gate PASS (2026-09-26。R1 C3→R2 C1→R3 C1→R4 C0)。権限昇格面 denylist を正の構成に反転し class 閉鎖、R4 (platform+security) が SDK 実型で確認。tasking→implementing 昇格。AD-036 accepted。次: /cl-implement
---

# Feature Specification: 単一セッション起動とストリーミング (X-1)

**Feature Branch**: `005-session-launch-and-streaming`

**Created**: 2026-09-25

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[session] WSL ディストロ内で Claude Code のセッションを起動し、応答をストリーミング表示する。canUseTool の permission 要求に承認カードで応答でき、実行中の中断と途中出力の保持ができること。Provider は既定のものを使い、起動条件の選択 UI は含めない。"

## 本 feature の位置づけ

X-1 は M2「走らせられる」の**最初の feature**であり、`session` domain の 3 本目
(R-2 セッション列挙に続く) である。**Closta が初めてプロセスを起こす feature** である —
R-1 は Agent SDK を依存として入れただけ、R-2 は読み取り専用の列挙、R-3 / R-4 は過去 transcript の
表示であり、いずれも `claude` を起動していない ([docs/roadmap.md](../../docs/roadmap.md) M1 の進捗)。

`session` charter の Journey 2 step 4「起動する。応答がストリーミングで表示され、
permission 要求には承認で応じる」に対応する。**起動の入口は R-1 の「組み合わせ選択」UI
(作業フォルダ + ランタイムの指定。`docs/domains/_overview.md` の R-1 定義) を再利用**し、
選んだ folder + 実行中 WslRuntime で launch する (charter Journey 2 の step 4)。
**軸どうしの依存解決を伴う起動設定ダイアログとプリセット (Journey 2 の step 2-3。Provider / モデル /
effort / 権限モードの選択と依存解決) は含まない** — それは X-4 が担う。本 feature は
**既定の Provider・固定の安全な権限モード (`default`) で、WSL ディストロ内の 1 セッションを起動して回す**
最小の垂直スライスである (Principle XI)。プロセス形態・live stream の port transfer・`canUseTool` 往復・
権限モードの実行時固定は [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md)
で確定した (design-gate Round 1 の Critical 3 件への対応)。

**用語**: 本 spec は起動 + stream を担う per-session の `utilityProcess` を glossary の canonical
**`supervisor`** (「セッションのプロセスとストリームを持つ `utilityProcess`。実体は `src/agents/`」) と呼ぶ。
単一セッション段階での supervisor であり、X-5 で分離・多重化される。SH-004 で用語を `supervisor` に統一済み
(Principle XIV。同義異語を増やさない)。

**本 feature は「何を満たすか」を定める。** 起動を行う supervisor の形、live stream を renderer へ運ぶ
チャネルの実装手段、`canUseTool` 往復の配線といった実装方式は [plan.md](plan.md) /
[tasks.md](tasks.md) とコードで決める。前提となる中断機構・stdin・kill の疎通は SPIKE-5 で
実証済みであり ([AD-018](../../docs/decisions/0018-wsl-process-control.md))、本 spec はその上に立つ。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - WSL ディストロ内でセッションを起動し応答をストリーミングで読む (Priority: P1)

利用者は登録済みの作業フォルダと、そのフォルダを開ける**実行中の WSL ランタイム**を選び、
最初のプロンプトを送る。セッションがそのディストロ内で起動し、Claude Code の応答が
**逐次 (トークン / チャンク単位)** に transcript 表示へ流れ込む。tool 呼び出し・thinking・
テキストは R-3 / R-4 の表示基盤にそのまま乗る。

**Why this priority**: `session` charter Journey 2 の中核であり、M2「走らせられる」の完了判定が
ここを通る。R-1〜R-4 で積んだ検出・列挙・表示の基盤が**初めて生きた応答に接続される**点で、
プロダクトの分水嶺になる。

**Independent Test**: 実行中の WSL ディストロを持つ開発ホストで作業フォルダを選び、
短いプロンプト (例: 「1 から 3 まで数えて」) を送って応答が逐次描画されることを確認する。
SDK 境界 (`query()`) を fake に差し替えた agents / renderer 単体テストで、
逐次イベントが順序どおり描画状態へ反映されることを検証する。

**Acceptance Scenarios**:

1. **Given** 登録フォルダと実行中の WslRuntime が選択導線に出ている (R-1 の組み合わせ選択 UI の再利用)、
   **When** 作業フォルダと実行中ランタイムの両方を選ぶ、**Then** launch が可能になり発火できる
2. **Given** 作業フォルダまたはランタイムが未選択、**When** launch しようとする、
   **Then** 発火せず、何を選べばよいかのガードが示される
3. **Given** 実行中確認済みの WslRuntime と登録フォルダを選び済み、**When** 最初のプロンプトを送る、
   **Then** そのディストロ内でセッションが起動し、応答が**全完了を待たず逐次**に描画される
4. **Given** 応答の生成中、**When** 描画を見る、**Then** テキストが少しずつ伸び、tool 呼び出しは
   R-4 の Tier A 表示、thinking は Reasoning 表示に流れ込む (表示は R-3 / R-4 の再利用)
5. **Given** 応答が完了した、**When** 続けて次のプロンプトを送る、**Then** **同一セッション**の
   続きとして扱われ、新しい起動を伴わない (stdin を開いたまま保つ)
6. **Given** 応答に数 MB の tool_result が含まれる、**When** 描画する、
   **Then** ウィンドウが固まらない (本文のパースが main を通らない)
7. **Given** 日本語・絵文字・非 ASCII を含む応答、**When** 描画する、
   **Then** 文字化け・切れなく表示される
8. **Given** 応答本文に markdown / リンク / 生 HTML 片が含まれる、**When** 描画する、
   **Then** 生 HTML は描画されず、リンクは allowlist を通ったものに限られる (R-3 の XSS 境界を継承)

---

### User Story 2 - permission 要求に承認カードで応える (Priority: P1)

セッションが tool を使おうとして許可を求めると (`canUseTool`)、**承認カード**が現れる。
利用者が許可 / 拒否を選ぶと、その決定が稼働中のセッションに反映され、tool が実行または拒否される。
事前承認や deny ルールにより**聞かれずに拒否された**操作も、何が拒否されたかが分かる形で示される。

**Why this priority**: 起動しただけでは「回せる」に達しない。tool 実行の可否を利用者が握れて初めて
安全に走らせられる。承認の往復は charter Journey 2 step 4 の一部であり、
`auto` / `dontAsk` を含む権限モード体系 (X-4 / M4) の土台になる。

**Independent Test**: `canUseTool` コールバックを fake で発火させ、承認カードが描画され、
利用者の許可 / 拒否が **main 検証済み経路**を通ってセッションへ返り、SDK 側のコールバックが
対応する結果で解決することを、agents / renderer / IPC ハンドラの単体テストで確認する。

**Acceptance Scenarios**:

1. **Given** セッションが tool の許可を求めた、**When** 承認カードで「許可」を選ぶ、
   **Then** その決定がセッションに届き、tool が実行される
2. **Given** 承認カードが出ている、**When** 「拒否」を選ぶ、**Then** tool は実行されず、
   拒否がセッションに反映される
3. **Given** 承認待ちのセッション、**When** 状態を見る、**Then** `awaiting_permission` として示され、
   何の tool を何の入力で求めているかが分かる (tool 入力は R-4 と同じサニタイズを通す)
4. **Given** `dontAsk` / deny ルール由来で**聞かれずに拒否された**操作 (`SDKPermissionDeniedMessage`)、
   **When** 描画する、**Then** 何が拒否されたかが承認カードと**対の経路**で示される
5. **Given** 承認カードの決定、**When** その決定が境界を渡る、**Then** **main の検証を経る** —
   データ経路 (stream の port) から許可/拒否を発行する経路は存在しない
6. **Given** 単発承認と capability 付与、**When** 承認カードを見る、**Then** 両者が区別される
   (glossary の Approval card 定義: 単発承認と capability 付与を区別する)

---

### User Story 3 - 実行中に中断し、途中出力を保つ (Priority: P1)

利用者は生成の途中でセッションを**中断**できる。中断しても**それまでの出力は残り**、
同じセッションで続けられる。応答しない・プロトコルが壊れた等で中断が効かないときの最終手段として
**強制終了**があり、中断とは別操作として提示される。強制終了は途中出力の保全を保証しない。

**Why this priority**: 長い応答や誤った方向に進んだ生成を止められないと実用に耐えない。
中断が「途中出力を残す」ことは AD-018 が SPIKE-5 で実証した前提であり、本 feature の受け入れ条件に
直接含まれる。中断と強制終了の 2 操作は AD-018 の Consequences が `ui` に課した責務である。

**Independent Test**: SDK の `interrupt()` を fake にして、中断後に途中までのイベントが表示状態に
残ることと、同一セッションで次のプロンプトを送れることを確認する。強制終了経路は
プロセス kill レイヤを差し替えて、ハンドルが確実に kill され孤児が残らないことを確認する。

**Acceptance Scenarios**:

1. **Given** 生成中のセッション、**When** 「中断」を選ぶ、**Then** 生成が止まり、
   **それまでの出力が残る**
2. **Given** 中断したセッション、**When** 次のプロンプトを送る、**Then** 同一セッションの続きとして
   処理される (新規起動を伴わない)
3. **Given** 中断が効かない (応答なし / プロトコル破損)、**When** 「強制終了」を選ぶ、
   **Then** `wsl.exe` プロセスが kill され、**孤児プロセスが残らない**
4. **Given** 強制終了を選ぼうとする、**When** 確認する、**Then** 「途中出力の保全と JSONL の
   非破損を保証しない」旨が警告として示される (AD-018 Open Question)
5. **Given** 中断で取り消されたキュー内メッセージがある、**When** 状態を見る、
   **Then** 何が残り何が消えたかを提示できる素材 (`still_queued` / `cancelled`) が保持される
   (表示の詳細度は plan で決める。message queue の本格表示は X-2)
6. **Given** ウィンドウを閉じる / アプリを終了する、**When** 稼働中セッションがある、
   **Then** supervisorが確実に終了し、UNC ハンドルを掴んだ孤児を残さない

---

### User Story 4 - 起動できない / 実行中の失敗を理由つきに知る (Priority: P2)

停止中のディストロ、`claude` の不在、起動の失敗、supervisorのクラッシュ、stream の異常 —
セッションが成立しない条件について、**失敗はセッション内に閉じ**、理由と次の操作が示される。
アプリは例外で落ちない。

**Why this priority**: 起動系は失敗経路が多く、黙って無反応になると「壊れた」に見える。
network / プロセスの世界に踏み込む最初の feature であるため、失敗の見せ方をここで確立する。
ただし正常系 (US-1〜US-3) が満たされて初めて意味を持つため P2 とする。

**Independent Test**: プロセス起動レイヤとファイルアクセスレイヤを差し替え、
停止中 / `claude` 不在 / 起動失敗 / クラッシュ / stream 異常 の各条件を与えて、
セッションが理由キーつきの `error` になり、アプリが例外を投げないことを確認する。

**Acceptance Scenarios**:

1. **Given** 所在ディストロが停止中、**When** 起動しようとする、**Then** 起動されず、
   「停止中のため起動できない」と理由つきに示され、起動 (再検出) の導線が添えられる
2. **Given** 実行中確認 (`VerifiedRunning`) の無い所在、**When** 起動要求を受ける、**Then** 拒否される
3. **Given** ディストロ内に `claude` が見つからない、**When** 起動する、
   **Then** 「実行パスが解決できない」として理由つきに示される (起動失敗と区別する)
4. **Given** supervisorが起動後にクラッシュした、**When** 結果を受け取る、
   **Then** そのセッションが `error` になり、それまでの出力が残る (他に波及しない)
5. **Given** stream が途中で壊れた / プロトコルが不正、**When** 受け取る、
   **Then** セッションが理由つき `error` になり、アプリが例外で落ちない
6. **Given** 起動は成功したが **Provider が未ログイン / 認証切れ / クレジット不足 / rate limit /
   API 到達不可**を返す、**When** 結果を受け取る、**Then** `provider-error` として理由つきに示され、
   **黙って `done` に見せない**。再ログイン等の次の操作の導線が示される (crash と区別する)
7. **Given** 選んだ作業フォルダの所在ディストロと選択ランタイムのディストロが不一致、**When** 起動しようとする、
   **Then** 拒否され、理由が示される
8. **Given** いずれの失敗でも、**When** 表示する、**Then** 空白の画面にせず、理由と次の操作を示す

---

### Edge Cases

- 所在ディストロが起動要求の直前に停止した — 確認から起動までの窓は消せないため、
  起動発行は `VerifiedRunning` に対してのみ行い、失敗はセッション内に閉じる
- `claude` がログインシェルの PATH にしか無い — 実行パスを起動時に 1 回解決する (AD-018 §4 / AD-015)
- 応答に数 MB / 数十 MB の tool_result が含まれる — main を本文経路から外し、逐次描画を止めない
- 生成中にウィンドウを閉じる / アプリを終了する — supervisorを確実に kill し孤児を残さない
- 中断の control_request が届かない (プロトコル破損) — 強制終了 (kill) に落とす
- 強制終了時に書きかけの JSONL transcript が壊れる可能性 — 警告文に含める (AD-018 Open Question)
- 応答本文に生 HTML / `javascript:` リンク / 制御文字 / 双方向制御文字が混じる — XSS 境界と正規化を通す
- IME 変換確定の Enter が送信として扱われる誤り — `isComposing` ガードで防ぐ (Principle VIII)
- permission 要求と中断が同時に起きる — 状態機械で `awaiting_permission` と中断要求の競合を扱う
- `interrupt_receipt_v1` capability が古い CLI で使えない — init message の `capabilities` で確認し、
  使えなければ強制終了に落とす (AD-018 Open Question)
- 起動直後にプロンプトを送らずに閉じる — 起こしたsupervisorを残さない
- 同じ作業フォルダで 2 回起動しようとする / 稼働・launching 中に再度 launch する —
  本 feature は単一セッションに限り、新たな launch を拒否する (多重は X-5)
- 起動は成功したが Provider が未ログイン / 認証切れ / クレジット不足 / rate limit / API 到達不可を返す —
  `provider-error` として封じ込め、crash と区別する (SDK は error message で返す。AD-020)
- 選んだフォルダの所在ディストロと選択ランタイムのディストロが食い違う — 起動前ゲートで拒否する
- `running` 中に次のプロンプトを送る — 最小の in-memory キューに積む (中断時の `still_queued`/`cancelled` の素)
- 空 / 空白のみ / 巨大なプロンプトを送ろうとする — 空は送信不能、巨大はバイト長上限で扱う
- 空状態 — まだ起動していない / 応答が空 / 失敗のみ。いずれも導線を示す

## Requirements _(mandatory)_

### Functional Requirements

**番号は追加順、並びは主題順である。重複は無い。**

#### 起動の経路とsupervisor

- **FR-001**: セッションの起動・stream・中断は **Agent SDK の `query()` (V1 形式、
  `AsyncIterable<SDKUserMessage>` prompt)** を通して行わなければならない。stream-json の自前パースを
  行ってはならない (Principle IV / [AD-002](../../docs/decisions/0002-use-agent-sdk-not-cli.md) /
  [AD-018](../../docs/decisions/0018-wsl-process-control.md) §2)
- **FR-002**: 起動・stream・中断を担うsupervisorは `agents` の **セッションごとに 1 プロセス**
  (`utilityProcess`) としなければならない。1 プロセスで複数セッションを捌いてはならない
  ([AD-023](../../docs/decisions/0023-application-architecture.md) §6。数 MB のパースが他セッションを止める)
- **FR-003**: 起動は **WSL ディストロ内**に限り、**実行中確認済み (`VerifiedRunning`) の WslRuntime に
  対してのみ**発行しなければならない。停止中・未確認の所在に対して起動・UNC アクセス・プロセス起動を
  発行してはならない (R-1 の `VerifiedRunning` 契約 / SC-005 と同じ拘束)。**加えて、選んだ作業フォルダの
  所在ディストロと選択ランタイムのディストロが一致すること (`isNamespaceConsistent` / `isSameDistro`
  完全一致。[AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) §1/§2) を検証し、
  不一致は拒否**しなければならない — 別 distro で走る / transcript が別 distro に書かれるのを防ぐ。
  Win32 直接起動・Docker 内起動は本 feature に含まない
- **FR-004**: supervisorは **Electron API とネイティブモジュールに依存してはならず**、
  `node <entry>` として単独起動できる形を保つ (Principle VII /
  [AD-010](../../docs/decisions/0010-supervisor-runs-standalone.md))。
  **起動の spawn は SDK の `spawnClaudeCodeProcess` コールバック内でsupervisorが行う**
  (SDK 実型上コールバックであるため。sdk.d.ts:2288 / [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §3)。
  したがってsupervisorは spawn API (`child_process`) を持つが、`child_process` は Electron でも
  ネイティブモジュールでもないため Principle VII に反しない。ただしsupervisorは
  **`wsl.exe` の文字列リテラルを持ってはならない** — 起動コマンド・接頭引数・`claude` 実行パス・cwd の
  RuntimePath は `infra/runtime` が `RuntimeLaunchSpec` という値として構築し (リテラルは
  `WSL_CALLER_MODULES` に閉じる)、app 経由で値として渡す (FR-005 / AD-036 §3)
- **FR-005**: `claude` の実行パスは**起動時に 1 回解決**して `pathToClaudeCodeExecutable` に渡さなければ
  ならない。ラッパーを噛ませる場合も**スクリプト自体をパイプから読ませて stdin を潰してはならない**
  (AD-018 §4 / [AD-015](../../docs/decisions/0015-wsl-access-strategy.md))
- **FR-006**: supervisorに渡す環境変数は**明示した許可リスト (実名集合。正本は data-model §7 /
  contracts C-5) のみ**とし、親プロセスの環境を**継承してはならない**。
  **`WSLENV` と資格情報系パターン (`ANTHROPIC_API_KEY` / `AWS_*` / `*_TOKEN` / `*_SECRET` / `*_KEY`) を
  許可リストに含めてはならない** — WSL は `WSLENV` 列挙変数を WSL 内へ透過するため、秘密がアプリを通って
  `claude` に渡る経路になる (Principle V / AD-011 / [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §6)。
  資格情報を注入・永続化してはならず、**会話由来ペイロード (env / プロンプト本文 / tool 入力 / stream 本文 /
  permission 要求) をログ・エラー・クラッシュレポートに出力してはならない** (理由キー・sessionId・requestId
  等のメタのみ)。**Provider は既定**とし、認証はランタイム内の Claude Code の既定機構に委ねる
  (AD-011。Provider 登録は X-3)

#### ストリーミングとプロセス境界

- **FR-007**: stream イベントの逐次パースは `agents` で行い、**main process でパース・structured clone
  deserialize を起こしてはならない**。本文は `MessageChannelMain` の port transfer で
  **agents ↔ renderer 直通**とし、main を本文のデータ経路から外さなければならない
  (Principle IX / [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) §1)
- **FR-008**: 応答は**逐次 (トークン / チャンク単位)** に描画へ反映しなければならない。
  全応答の完了を待たせてはならない
- **FR-009**: 描画は **R-3 / R-4 の transcript 表示基盤 (`useExternalStoreRuntime` / message mapping /
  Tier A tool 表示) を再利用**しなければならない。**XSS 境界 (生 HTML 非描画・URL allowlist・
  argsText サニタイズ) を回帰させてはならない** (AD-034 / [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) /
  [docs/roadmap.md](../../docs/roadmap.md) M2 申し送り)。会話由来文字列は境界を越える前に
  正規化 (制御文字・双方向制御文字の除去、バイト長上限での切り詰め) を通さなければならない。
  **逐次 (streaming / partial) 経路では、サニタイズを取得プロセス側で「完結メッセージ単位」に適用**し
  (チャンク境界で双方向制御文字・サロゲートペアを分割して除去漏れを起こさない)、**バイト長上限は
  メッセージ累積で効かせ**なければならない (delta ごとの上限では累積が無制限になり renderer メモリ枯渇を
  招く)。**新規の markdown レンダラ (Streamdown 等) を採用する場合も URL allowlist を deny-by-default で
  配線し raw HTML を無効にする** — 満たせなければ採用しない (research R-01)

#### 制御経路 (control plane)

- **FR-010**: 起動・プロンプト送信・承認応答・中断・強制終了の制御要求は **renderer → main の
  検証済み IPC** を経由し、main が送信元とペイロードを**すべて未信頼として検証**しなければならない。
  新設 IPC は preload の**単一 capability** に追加する。**データ経路 (stream の port) から制御要求を
  発行させてはならない** (AD-023 のセキュリティ要件 / AD-034 §1 の「main 検証の迂回を作らない」)
- **FR-011**: `query()` には `AsyncIterable` の prompt を渡し **stdin を開いたまま保た**なければ
  ならない。閉じると interrupt と `canUseTool` 応答の経路が失われる。stdin への書き込みは **LF で終端**する
  (CRLF にしない。AD-018 §2 / §5)

#### permission (承認カード)

- **FR-012**: システムは `canUseTool` の permission 要求を**承認カード**として提示し、利用者の
  許可 / 拒否の決定を**稼働中セッションに反映**しなければならない。決定は FR-010 の検証済み経路で返す。
  承認カードは**単発承認と capability 付与を区別**する (状態は `session`、見た目は `ui`。glossary の Approval card)。
  **決定 (`PermissionDecision`) の `outcome` / `scope` は main が明示述語で enum 検証し (`as` キャスト禁止)、
  決定の `scope` が要求 (`PermissionRequest.scope`) の範囲を超えてはならない** (`once` 要求に `capability`
  決定を受理しない)。**capability 付与は当該セッション寿命の in-memory 適用に限り**、SDK の allow ルール
  (`addRules` の allow-all) へ広げず、永続化・プリセット反映を行わない (それは X-4)。
  **承認カードに表示する `toolName` と tool 入力 (argsText) は境界を越える前にサニタイズ**する
  (双方向制御文字・C0/C1 除去 + 長さ上限 + plain text 表示。MCP サーバ由来の tool 名で表示偽装させない。
  FR-009 / [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) §6)
- **FR-013**: 権限モードは**選択 UI を持たず、安全な既定 (`default`) に固定**しなければならない。
  `auto` / `bypassPermissions` / `acceptEdits` / `dontAsk` を選べる経路を**起動時も実行時も**
  作ってはならない。**権限ゲートは「正の構成 (allowlist)」で守る** — denylist で個別 SDK API を追わない
  (SDK の permission/settings 面は広大で禁止列挙は必ず漏れる。contracts C-4 が正本): (P1) `query()` options の
  キー集合を `{permissionMode:'default', canUseTool, spawnClaudeCodeProcess, pathToClaudeCodeExecutable,
  abortController}` の完全部分集合に固定し (`abortController` は cancellation 専用の operational key。
  escalation-neutral)、他キー (`settings` / `extraArgs` / `allowedTools` / `disallowedTools` /
  `permissionPromptToolName` / `allowDangerouslySkipPermissions` 等) を一切含めない、(P2) `canUseTool` の応答
  (`PermissionResult`) を `{behavior, message}` の完全部分集合に固定し `updatedPermissions` (全 6 variant) と
  `updatedInput` を一切出力しない (capability 付与はアプリ内 in-memory 状態で実現)、(P3) `Query` メソッドは
  `interrupt()` のみ呼ぶ (`setPermissionMode` / `setMcpPermissionModeOverride` / `applyFlagSettings` /
  `updateSettings` 等の mutation を呼ばない) (Principle III /
  [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) §3 / [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §4/§5。`dontAsk` は危険モードに含めないが本 feature では選択させない)
- **FR-014**: 事前承認や deny ルールにより**聞かれずに拒否された**操作 (`SDKPermissionDeniedMessage`) を
  提示しなければならない。承認カードと**対の経路**で「何が拒否されたか」を示す (AD-020 §4)

#### 中断・強制終了・寿命

- **FR-015**: 中断は SDK の `interrupt()` (stdin 越しの control_request) を用い、**OS signal に
  頼ってはならない**。中断後も**途中出力を保持**し、同一セッションで継続できなければならない (AD-018 §1)
- **FR-016**: 強制終了は `wsl.exe` プロセスの kill とし、中断とは**別操作**として提示しなければならない。
  強制終了では**途中出力の保全と JSONL の非破損を保証しない**旨を警告する (AD-018 §3 / Open Question)
- **FR-017**: システムはsupervisorのハンドルを保持して kill でき、**window close / before-quit で
  確実に終了**させ、**孤児プロセス・孤児 UNC ハンドルを残してはならない** (AD-018 Consequences /
  AD-030 §Consequences)

#### 入力・状態・失敗

- **FR-018**: プロンプト入力は最小構成とし、**IME 変換確定の Enter を送信として扱ってはならない**
  (`isComposing` ガード)。全角混在でレイアウトを崩してはならない (Principle VIII。
  full な IME 硬化・message queue・下書き復元・スクリーンショット比較は X-2)。**「全角混在でレイアウトが
  崩れない」の視覚検証は本 feature の合否対象外**とし X-2 / E2E 基盤に残す (視覚検証はスクリーンショット比較を
  要し当 feature で測れないため。SC-009 と整合。C-003)。**空 / 空白のみのプロンプトは送信不能**とし、
  outbound プロンプトにもバイト長上限を課す (無意味な起動・往復と巨大入力による stdin/UI の詰まりを防ぐ)
- **FR-019**: システムは単一セッションの状態 (`idle` / `launching` / `running` / `awaiting_permission` /
  `interrupted` / `error` / `done` の 7 状態) を保持し UI に反映しなければならない。**単一セッションに限る** —
  `launching` または非終端 (`running`/`awaiting_permission`/`interrupted`) のセッションが在るとき新たな launch を
  拒否し、`error`/`done`/kill 後は再 launch を許す (単一セッション不変)。
  **`running` および `awaiting_permission` 中のプロンプト送信は最小の in-memory キューに積む** (これにより
  中断時の `still_queued` / `cancelled` が空振りしない。message queue の本格表示は X-2)。保持構造
  (spawn ハンドル / port) は将来の複数セッション (X-5) で作り直さずに済むよう **sessionId 鍵の registry** で表す
  (複数並列・supervisor 分離・背圧設計は X-5)
- **FR-020**: 起動不能・実行中の失敗 (停止中 / 所在不一致 / `claude` 不在 / 起動失敗 / クラッシュ /
  stream・プロトコル異常 / **Provider・認証・API の実行時エラー**) は**理由キー**として保持し、理由と
  次の操作を示さなければならない。**「起動は成功したが Provider/API がエラーを返す」失敗** (未ログイン /
  認証切れ / クレジット不足 / rate limit / API 到達不可) は `provider-error` として保持する — SDK では
  crash でなく `SDKResultMessage`(error) 等で返り (AD-020)、黙って `done` に見せてはならない。
  pre-launch の到達可能性判定は X-3 の責務、**実行中に返る API/認証エラーの表示と理由キーは本 feature**の責務。
  失敗はセッション内に閉じ、**アプリを例外で落としてはならない**。本 feature で導入・変更する用語は
  [docs/glossary.md](../../docs/glossary.md) に反映する (Principle XIV)

### Key Entities

- **AgentSession (稼働セッション)**: 単一の稼働中セッションの操作面。インタフェースは `domain` が宣言する
  (`start(config): AsyncIterable<SessionEvent>` / `interrupt()` / `stop()`。AD-023 §3)。
  状態機械・supervisorのプロセスハンドル・stream の port を持つ。**実装はクラスでなく `agents` の module worker
  (`sdk-agent-session.ts`)** が parentPort 制御 + port `SessionEvent` のメッセージプロトコルで実現する
  (`read-transcript` / `enumerate-sessions` と同じ構え。クラス `SdkAgentSession` は存在しない)
- **LaunchInput (最小起動入力)**: 本 feature が使う `SessionLaunchConfig` の部分集合 —
  作業フォルダ・実行中確認済み WslRuntime descriptor・**固定の permissionMode (`default`)**・最小 env。
  **軸選択 UI とプリセットは持たない** (全体は X-4)
- **SessionEvent (セッションイベント)**: `agents → renderer` の一方向データ。stream のメッセージ
  (`SDKMessage` 由来 DTO)・permission 要求・状態遷移・失敗理由。transcript 本文と同じ正規化を通す
- **PermissionRequest / PermissionDecision**: `canUseTool` 由来の要求 (tool 名 / 入力 / 単発か
  capability か) と、利用者の許可 / 拒否。決定は main 検証済み経路のみを通る
- **SessionControl (制御要求)**: `launch` / `send-prompt` / `respondPermission` (`outcome: allow|deny` /
  `scope: once|capability`) / `interrupt` / `kill` の 5 種。renderer → main 検証済み IPC のみが発行できる
  (契約は contracts C-1 が正本。spec Key Entities はそれに追随する)
- **SessionRunState**: `idle` / `launching` / `running` / `awaiting_permission` / `interrupted` / `error` /
  `done` の **7 状態**と、`error` に付随する理由キー。`launching` は launch invoke〜初 stream/ready の窓を表し、
  単一セッション不変の判定に使う (data-model §4)

## Success Criteria _(mandatory)_

- **SC-001**: 実行中の WSL ディストロ内でセッションが起動し、応答が**逐次描画**される
  (全完了を待たない)。計測経路: 実機 quickstart + SDK 境界 (`query()`) を fake にした agents / renderer
  単体テストで、逐次イベントが順序どおり表示状態へ反映されることを assert する
- **SC-002**: 起動・UNC アクセス・プロセス起動のいずれも、**実行中確認済み (`VerifiedRunning`) の
  WslRuntime に対してのみ**発行される。停止中・未確認の所在に対する発行が **0 件**である。
  **加えて、所在ディストロが不一致な launch (folder distro ≠ runtime distro) が 0 件で拒否される。**
  計測経路: プロセス起動レイヤとファイルアクセスレイヤを差し替えた Vitest で発行 0 件を assert する
  (**発行側の行為で定義する** — 確認から起動までの窓は消せない。R-2 の SC-002 と同じ) +
  launch ゲートの純粋関数 (`isNamespaceConsistent`) の単体テスト
- **SC-003**: main が stream 本文のデータ経路に乗らない。本文の `JSON.parse` / structured clone
  deserialize が main で **0 件**である。計測経路: port transfer の構造検査 (main が本文 port を
  受け取らない) + 呼び出し形の走査 + 手動レビュー (AD-034 の担保方式に倣う。到達集合検査は未構築)
- **SC-004**: 承認カードで許可 / 拒否が**稼働中セッションに反映**され、tool が実行 / 拒否される。
  聞かれずに拒否された操作も対の経路で提示される。決定は **main 検証を経る** (未検証経路 0 件)。
  **決定の `outcome`/`scope` が enum 検証され、`once` 要求に `capability` 決定が受理されず、
  capability 付与が allow-all に広がらない** (負例を含む)。計測経路: `canUseTool` を fake にした
  agents 単体 + renderer 単体 + main IPC ハンドラ直接呼び (不正 outcome / scope 格上げの負例)
- **SC-005**: 中断で生成が止まり**途中出力が残り**、同一セッションで継続できる。**強制終了が
  別操作として存在**し、警告つきである。**強制終了は agents が保持する `SpawnedProcess` (`wsl.exe`) を
  kill する** (AD-018 Consequences / AD-036 §3)。計測経路: `interrupt()` とプロセス kill レイヤを
  差し替えた Vitest (kill ハンドルの呼び出しと spawn ハンドルの解放を assert) + quickstart。
  **実プロセスの孤児不在 (`wsl.exe` が agents の孫として残らない) は fake では踏めず quickstart V-8 が
  唯一の実測根拠である**旨を明示する (保証粒度を正直に記す)
- **SC-006**: 起動オプションの組み立てが安全である。(a) permissionMode が `default` に固定され、
  **初期オプションと実行時 `setPermissionMode` の双方**で `auto` / `bypassPermissions` / `acceptEdits` /
  `dontAsk` への遷移経路が **0 件** (`sdk-agent-session.ts` が `setPermissionMode` /
  `canUseTool` 応答の `updatedPermissions` 全 union・allowedTools 等の起動 options への昇格経路 0 件の
  不到達テストを含む) — **具体的には (P1) 構成した `query()` options のキー集合 ⊆ allowlist、(P2)
  `toPermissionResult` 出力のキー集合 ⊆ {behavior, message} (`updatedPermissions`/`updatedInput` が現れれば fail。
  全 variant を列挙せず正の構成で閉じる)、(P3) Query メソッドは interrupt のみ、を assert する**、
  (b) supervisorに渡す (utilityProcess.fork と agents の child_process.spawn の**両 spawn 点**の) 環境変数の
  キー集合が許可リストと**完全一致**し許可リスト外が 0 件、かつ **`WSLENV` と資格情報系パターンが
  許可リストに 0 件**、(c) 資格情報の注入と、**会話由来ペイロード (env / プロンプト / argsText / stream 本文 /
  permission 要求) のログ混入が 0 件**。計測経路: 起動オプション / env を組み立てる純粋関数の単体テスト
  (**プロセスを起こさずに測れる形に分離する**) + 呼び出し形とログ出力の走査 + Query メソッド/updatedPermissions
  不到達テスト。**(b) は「builder の出力」でなく「実際に `child_process.spawn` / `utilityProcess.fork` に渡る
  最終 env」を測る** — 汚染された `SpawnOptions.env` (`WSLENV`/資格情報入り fake) を agents コールバックに渡し、
  spawn に渡る env が `spec.env` のみ (options.env/process.env を素通し・マージしない) であることを負例で assert する
- **SC-007**: 制御 IPC の**未信頼入力が検証で拒否される**。最低でも 送信元不一致 / 停止中・未確認の
  所在への起動 / 未知のセッション識別子 / データ経路 (port) からの制御発行 / 不正な permission 決定
  を含む。計測経路: preload をスタブせず main 側ハンドラを直接呼ぶ単体テスト
- **SC-008**: **XSS 境界が回帰しない**。live stream 経路でも生 HTML が描画されず、URL allowlist と
  会話由来文字列の正規化 (制御文字・双方向制御文字の除去、バイト長上限での切り詰め) が効き、
  **`toolName` / argsText も正規化される**。計測経路: 変換 / サニタイズ関数の単体テスト (境界値を全数) +
  境界を渡る DTO の全文字列走査 (`toolName` を含む) + **render 経路の component テスト** (承認カードと
  live 描画で `javascript:` / `vbscript:` / `file:` リンクと生 HTML 片が無害化される。チャンク境界で
  分割された双方向制御文字・サロゲートが除去される。累積バイト上限が効く) — データ側走査だけに依存しない
- **SC-009**: **IME 変換確定の Enter が送信にならない** (Principle VIII の最小担保。FR-018)。
  計測経路: composer の `isComposing` ガードの単体 / component テスト (jsdom で boolean 評価可能)。
  **「全角混在でレイアウトが崩れない」の視覚検証はスクリーンショット比較を要するため本 feature の合否対象外**
  とし、**X-2 (日本語 composer) / E2E 基盤 feature の SC に移す** (Constitution VIII 現状の制約。
  合否条件を測定不能な clause で汚さない)
- **SC-011**: **単一セッション不変条件が守られる** (FR-019)。`launching` または非終端
  (`running`/`awaiting_permission`/`interrupted`) のセッションが在るとき 2 回目の launch 発行が **0 件で拒否**され、
  `error`/`done`/kill 到達後は再 launch が**成功**する (失敗からの recovery)。計測経路: registry 状態を与えた
  launch 検証ハンドラ (BE-007) の Vitest = SH-020(d)
- **SC-010**: 失敗が**理由つきに封じ込められる**。停止中 / 所在不一致 / `claude` 不在 / 起動失敗 /
  クラッシュ / stream・プロトコル異常 / **Provider・認証・API エラー (`provider-error`)** の各条件で、
  セッションが理由キーつき `error` になり、アプリが例外を投げず、他へ波及しない。
  **window close / before-quit で kill ハンドルが呼ばれ before-quit フックが登録されている** (Vitest)。
  **残存プロセス 0 件の実測は quickstart V-8 が根拠** (fake では孫プロセスを踏めない旨を明示)。
  計測経路: プロセス起動レイヤとファイルアクセスレイヤを差し替えた Vitest + quickstart

## Assumptions

`[USER]` は起案時に人間が確定したもの、`[ASSUMED]` は本 spec で自動採用したもの。

- **[USER]** Provider は既定 = ランタイム内の Claude Code の既定認証に委ねる。X-1 は資格情報を
  解決 / 注入 / 永続化しない (AD-011)。Provider 登録と到達可能性判定は X-3
- **[USER]** 起動条件の**選択 UI を含めない**。permissionMode は `default` に固定する。
  ランタイム / Provider / モデル / effort / 権限モードの軸選択とプリセットは X-4
- **[USER]** 起動は **WSL ディストロ内に限る**。Win32 直接起動と Docker 内起動は本 feature 外
  (X-4 / I-*)
- **[ASSUMED]** プロンプト入力は**最小構成 + `isComposing` ガードのみ**。X-1 が composer の送信経路を
  開く (R-1 の `isDisabled: true` を外す) ため Constitution Principle VIII (A) の発動条件に当たる。
  full な IME 硬化・message queue・下書き復元・日本語スクリーンショット比較は **X-2** に残し、
  **SPIKE-4 (X-2 前) の結果と合わせて再確認**する (Constitution VIII 現状の制約 / roadmap M2)
- **[ASSUMED]** **単一セッションに限る**。supervisor の `utilityProcess` 分離・10 並列・semaphore・
  IPC バッチ化・背圧設計 (AD-023 Open Question) は **X-5**
- **[ASSUMED]** 中断は途中出力を残し同一セッションで継続する。**forkSession / 軸を選び直す再開 /
  rename / tag / delete は本 feature 外** (charter Journey 4 の一部は X-4 以降)。
  `still_queued` / `cancelled` の uuid は保持するが、message queue の本格表示は X-2
- **[ASSUMED]** live streaming の markdown は R-3 の `MarkdownText` (`smooth`) を再利用する。
  **Streamdown** (未完 markdown の構文修復 / CJK の分割耐性) の採否は plan / 実装で判断する。
  **採否に関わらず XSS 境界 (生 HTML 非描画・URL allowlist) を回帰させない** (roadmap M2 申し送り / research R-04)
- **[ASSUMED]** ストリーミングに `SDKPartialAssistantMessage` (`--include-partial-messages`) を使うか、
  `SDKAssistantMessage` の逐次更新で足りるかは plan / 実装で決める (AD-020 Open Question)
- **[確定]** supervisorのプロセス形態は AD-023 §6 の **per-session (セッション寿命)** である。
  新規性は寿命でなく「per-session 長寿命 + AD-034 の port transfer + control-plane inbound +
  `canUseTool` 往復」の組み合わせ。**WSL 起動の spawn は SDK の `spawnClaudeCodeProcess` コールバック内で
  supervisorが行い** (SDK 実型で確認)、supervisorは spawn API を持つが `wsl.exe` リテラルと Electron/native を
  持たない。**[AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) で確定
  (proposed。design-gate Round 2 で accepted へ)**
- **[ASSUMED]** 強制終了時の JSONL 破損可能性 (AD-018 Open Question) は未検証。警告文で明示し、
  実機での挙動は quickstart に記録する
- **[ASSUMED]** `interrupt_receipt_v1` capability の利用可否は init message の `capabilities` で確認し、
  使えなければ強制終了に落とす (AD-018 Open Question)
- **[ASSUMED]** SPIKE-3 (`claude` の実メモリ = idle 225MB / 並列でも変わらず。AD-001 追記) を前提に、
  supervisor 1 プロセスあたりの追加コストは Node 約 50MB と見積もる (AD-023 §6)

## Out of Scope

- **軸どうしの依存解決を伴う起動設定ダイアログとプリセット** (Provider / モデル / effort /
  権限モードの選択と、上流を変えたとき下流を既定に戻す依存解決) → X-4。
  **作業フォルダ + ランタイムの最小指定 (R-1 の組み合わせ選択 UI の再利用) は本 feature に含む** —
  起動の入口であり、これが無いと US-1 が開始できない。本 feature は既定の Provider・固定 `default` モードのみ
- **Provider の登録・認証方式・到達可能性判定・資格情報の解決** → X-3。本 feature は既定に委ねる
- **full な日本語 composer** (IME の E2E ガード検証・message queue・下書き復元・
  スクリーンショット比較) → X-2。本 feature は最小入力 + `isComposing` ガードまで
- **supervisor 分離とマルチセッション** (10 並列・semaphore・IPC バッチ化・背圧設計) → X-5。
  本 feature は単一セッション
- **セッション監視ビュー** (状態一覧・密度切替・承認待ちの強調・一覧 ⇄ 没入の往復) → O-1
- **forkSession / 軸を選び直す再開 / rename / tag / delete** → X-4 以降
- **ui-coverage 対応表の完成と Tier A 完全化** → O-2。本 feature は R-3 / R-4 の既存表示を再利用する
- **Docker / コンテナ内起動・sandbox capability ゲート** → I-*
- **Win32Runtime での直接起動と `autoModeSafe` の E2E ゲート** → 軸選択が生じる X-4。
  本 feature は WSL 内・固定 `default` モードのため危険モードの選択面を持たない
- **transcript ミラー・SQLite 永続化** (`sessionStore`) → I-1。本 feature は永続化しない
- **E2E 基盤 (CI で Electron を起動する仕組み) と日本語スクリーンショット比較** → M4 完了後の
  E2E / 検証基盤 feature (roadmap)。SC-009 の full な担保はそこに残す
- **Principle IX の到達集合検査** (composition-root からの自動証明) → 同上。本 feature は port transfer の
  構造検査 + 手動レビューで暫定担保する (AD-034 と同じ扱い)

## Dependencies

- **R-1 完了済み** — `VerifiedRunning` / `WslRuntime` / `RuntimeDescriptor` / `PathMapping` /
  パス API / 単一 capability の IPC / `claude` 実行パス解決の材料。
  FR-003 / FR-005 / FR-006 / FR-010 の前提 ([docs/roadmap.md](../../docs/roadmap.md))
- **R-2 完了済み** — `agents` プロセス基盤・`transport.ts` の `parentPort` adapter・
  環境変数の許可リスト・プロセス起動許可モジュールの枠組み (`PROCESS_SPAWN_MODULES`)・
  `check.mjs` 項目 7 / SDK 呼び出し許可リスト (`AGENT_SDK_ALLOWED_CALLS`)。FR-002 / FR-006 の前提
- **R-3 完了済み** — transcript 表示基盤 (`useExternalStoreRuntime` / message mapping /
  `MessageChannelMain` の port transfer / XSS 境界) と `transcript-spawner.ts` の先例。
  FR-007 / FR-009 の前提 ([AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md))
- **R-4 完了済み** — Tier A tool 表示 (Terminal / Code diff / Todo / Subagent / Agent plan / Reasoning)。
  稼働中の tool 呼び出しの表示に再利用する。FR-009 の前提
  ([AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md))
- **SPIKE-5 完了済み** → [AD-018](../../docs/decisions/0018-wsl-process-control.md)。
  中断 = stdin 越し control_request、stdin を開いたまま保つ、強制終了 = `wsl.exe` kill、LF 終端。
  FR-001 / FR-011 / FR-015 / FR-016 / FR-017 の根拠
- **SPIKE-3 完了済み** → [AD-001](../../docs/decisions/0001-adopt-electron-over-tauri.md) 追記
  (`claude` idle 225MB / 並列でも変わらず)。FR-002 のコスト見積もりの根拠
- **AD-002 / AD-020 / AD-023 / AD-011 / AD-030** — SDK V1 / 権限モード 6 値と
  `SDKPermissionDeniedMessage` / レイヤ構成と per-session プロセス / 資格情報委譲 / 環境変数許可リスト
- **[AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) 起票済み (proposed)** —
  per-session のsupervisor形態、live stream を `MessageChannelMain` の port transfer で運ぶ形、
  `canUseTool` 往復の main 検証済み経路、**agents 内 `spawnClaudeCodeProcess` での WSL 起動と
  agents の WSL-free 維持**、権限モードの実行時固定 (`setPermissionMode` 禁止)、起動 env の許可リストと
  WSLENV/資格情報 denylist、所在一致ゲート。`PROCESS_SPAWN_MODULES` (`sdk-agent-session.ts`) /
  `AGENT_SDK_ALLOWED_CALLS` (`query`) / `WSL_CALLER_MODULES` (argv builder) への追加は本 ADR を根拠に行う
  (Principle VI / AD-034 §3 / §4 と同じガバナンス)。design-gate Round 2 通過で accepted へ昇格
