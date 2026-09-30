---
spec_id: 007-provider-registration-and-reachability
feature_id: X-3
domain: provider
domain_selected_by: auto
targets: both
targets_selected_by: user
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: Provider 登録と到達可能性判定 (X-3)

**Feature Branch**: `007-provider-registration-and-reachability`

**Created**: 2026-09-29

**Status**: frontmatter の `status:` を正とする

**Input**: User description: "[provider] Claude Enterprise / Amazon Bedrock ほかを認証方式ごとに登録できる Provider として一般化し、検出候補を提示して明示操作で登録する。選んだ Provider からセッション起動時の env を導出し、選んだランタイムから到達できる Provider だけを選択肢に出す。秘密はアプリに持たず Claude Code に委譲する。" `--targets frontend,backend`

## 本 feature の位置づけ

X-3 は M2「走らせられる」の feature であり、`provider` domain の**最初の feature**である
(charter Related Specs は「未着手。X-3 が本 domain に属する」)。**Closta の軸 2 (Provider 抽象) の
中核**であり、charter Mission そのもの — 「Claude Enterprise / Amazon Bedrock ほかを、認証方式ごとに
登録可能な Provider として一般化し、セッション起動時の実行環境を導出する」を満たす。

**なぜ今**: X-1 (spec 005) で「**既定** Provider・固定 env」で WSL 内の 1 セッションを起こせるようになった
([docs/roadmap.md](../../docs/roadmap.md) M2)。X-1 は資格情報を解決 / 注入 / 永続化せず、認証をランタイム内
Claude Code の既定機構に委ねた (X-1 FR-006 / [AD-011](../../docs/decisions/0011-delegate-credential-resolution.md))。
X-3 はその Provider を「**認証方式つきで登録できる値**」に一般化し ([AD-005](../../docs/decisions/0005-provider-as-registrable-value.md))、
セッション起動時の env とモデル候補を導出する。X-4 (起動設定ダイアログ・軸の依存解決) の前提になる。

**前提 SPIKE-7 は完了済み** ([AD-039](../../docs/decisions/0039-credential-delegation-verified.md)。2026-09-29 accepted)。
委譲は SDK 0.3.270 で成立し、helper 設定は per-session `settings` で渡せ、`Options.env` は置換であり、
`aws-assume-role` のみアプリが一時資格を扱うことが型 + 公式ドキュメントで確認された。**大きな未知が解消済み**
であるため、本 spec の起票に AskUserQuestion を要する設計分岐 (アーキ選択・ドメイン境界・コア価値) は生じない。

**本 feature は「何を満たすか」を定める。** 検出の I/O 境界・`ProviderProfile` の永続化手段・env 導出関数の
配線・到達可能性判定の実装方式は [plan.md](plan.md) / [tasks.md](tasks.md) とコードで決める。
**規則の正本は 1 箇所に置き、spec は参照形で書く** — 9 種 `CredentialSource` × 委譲マトリクスの正本は
[AD-039](../../docs/decisions/0039-credential-delegation-verified.md) §3、`ProviderProfile` 型の正本は
AD-005、`env` 置換・spread 必須の正本は AD-039 D3 / AD-005 Consequences である。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 検出候補を提示し、明示操作で Provider を登録する (Priority: P1)

利用者は初回、ホストにある**認証の痕跡**を提示される — config ディレクトリ候補・`~/.aws/config` の
プロファイル・既存の環境変数。システムは**自動では登録しない**。利用者が使うものを選び、表示名を付け、
認証方式 (`CredentialSource`) を決めて `ProviderProfile` として登録する。

**Why this priority**: charter Journey 1 の中核であり、Provider が登録されていなければ US-2 の起動時導出が
始まらない。**自動登録しないこと**は charter の不変条件 (「登録は常に利用者の明示操作を要する」) であり、
秘密を勝手にアプリへ取り込まないという軸 2 の設計上の要である。

**Independent Test**: 検出レイヤ (ファイルアクセス / env 読み取り) を fake に差し替え、config ディレクトリ /
AWS プロファイル / env passthrough の各候補が**提示のみ**され、明示操作を経たものだけが `ProviderProfile` として
登録されることを domain / infra / renderer の単体テストで確認する。**自動登録 0 件**を assert する。

**Acceptance Scenarios**:

1. **Given** ホストに config ディレクトリ候補・`~/.aws/config` プロファイル・認証系 env が在る、
   **When** 検出を実行する、**Then** それらが**候補として一覧提示**され、**1 件も自動登録されない**
2. **Given** 提示された候補、**When** 利用者が 1 つを選び表示名と `CredentialSource` を決めて登録する、
   **Then** `ProviderProfile` が 1 件登録される (秘密の実体はアプリに保存されない。US-2/FR-004)
3. **Given** 候補が 1 件も検出されない (痕跡が無いホスト)、**When** 検出結果を見る、**Then** 空状態を
   空白にせず「手動で登録する」導線を示す
4. **Given** `api-key` / `oauth-token` 方式で登録する、**When** 秘密値を入力する、**Then** 秘密の実体は
   `safeStorage` に預けられ、`ProviderProfile` は**参照キーのみ**を持つ (JSON にも SQLite にも秘密値を書かない)
5. **Given** 既登録の Provider と一致する候補が検出される、**When** 候補一覧を見る、**Then** 既登録である旨が
   示され、二重登録の導線を出さない (重複を区別する。FR-002)
6. **Given** `safeStorage` が利用不可な環境 (キーチェーン無効)、**When** `api-key` / `oauth-token` で登録
   しようとする、**Then** 登録が拒否され理由が示される (秘密を平文で保持しない。FR-004 / Principle V)

---

### User Story 2 - 起動時に env を導出し、到達可能性で選択肢を絞る (Priority: P1)

利用者がランタイムを選ぶと、**そのランタイムから到達できる Provider だけ**が起動の選択肢に出る
(コンテナ内からホストの `~/.claude` は見えない)。選んだ Provider から**セッション起動 env** が導出され、
Provider を選ぶと**モデルカタログ**が切り替わる (Bedrock は inference profile ID で pin)。

**Why this priority**: charter Journey 2 の中核であり、軸 2 が「走らせられる」に接続する点である。
X-1 が既定 env で起こしていたセッションを、X-3 が **Provider から導出した env** で起こせるようにする。
到達可能性で絞らないと、到達できない config-dir Provider を選んで起動が沈黙失敗する。

**Independent Test**: `ProviderProfile → env` 導出の**純粋関数**の単体テスト (置換なので curated base を
spread する / `WSLENV` と資格情報系パターンが混じらない / helper 方式は inline `settings` を返す) と、
Provider × ランタイムの到達可能性判定 (runtime の `Reachability` を再利用) の単体テストで確認する。
**到達できない Provider が選択肢に 0 件**を単体で assert する。**この判定を消費する起動選択 UI (到達可能性で
絞ったリスト表示・Provider 選択に連動したカタログ表示) と、その上で走る E2E は X-4 に帰属する** — X-3 は判定
エンジン (`assessReachability`/`splitByReachability`)・env 導出・`listReachableProviders` IPC をバックエンドとして
提供するところまで (Out of Scope 参照)。

**Acceptance Scenarios**:

1. **Given** 登録済み Provider が複数在り、あるランタイムを選ぶ、**When** 起動の選択肢を見る、
   **Then** そのランタイムから**到達できる Provider だけ**が出る (到達できないものは 0 件で除外され、
   除外された Provider に `Reachability` 値 (`unreachable` / `blocked` / 所在不特定) が理由キーとして付与される)
2. **Given** 到達できる Provider を選ぶ、**When** 起動 env を導出する、**Then** Provider 由来の変数と
   Claude Code が要る基盤変数 (`PATH` / `HOME` 等) が明示的に含まれた env が組まれる (`Options.env` は
   置換なので `process.env` 継承に頼らず spread する。AD-039 D3 / AD-005)
3. **Given** `api-key-helper` / `aws-credential-export` 方式の Provider を選ぶ、**When** 起動設定を導出する、
   **Then** helper パスが**per-session の inline `settings`** として渡され、グローバル `~/.claude/settings.json` を
   汚さない (AD-039 D2)
4. **Given** Provider を切り替える、**When** モデルカタログを見る、**Then** その Provider のモデル集合に
   切り替わる (Bedrock は inference profile ID で pin されており alias 運用しない)
5. **Given** 導出した env、**When** 走査する、**Then** **passthrough 許可リストに `WSLENV` と資格情報系
   パターンが 0 件**である (正本は X-1 contracts C-5。方式固有の実名 curated 注入は別勘定 — FR-009)

---

### User Story 3 - 一時資格の期限を監視し、期限切れを明示する (Priority: P2) — **N/A (R-02: awsCredentialExport 化)**

> **R-02 決定 (2026-09-29) により本 US は N/A。** `aws-assume-role` を awsCredentialExport 化したため、期限監視・
> 警告・再取得は **Claude Code** が所有し、アプリは一時資格の実体も期限監視も持たない (FR-006 / research R-02)。
> 以下の記述は「直接 AssumeRole ブランチ」を採った場合の内容として残す (本 feature では実装しない)。

`aws-assume-role` 方式の Provider でセッションを実行中、システムは有効期限が近づくと**期限前に警告**する。
実行中に期限切れになった場合、**UI に明示**される。`aws-assume-role` は**アプリが一時資格を扱う唯一の例外**
であり、一時資格情報はメモリ上のみで扱い、SQLite にもファイルにも書かない。

**Why this priority**: charter Journey 3 に対応する。9 方式のうち 8 方式は Claude Code が期限切れ再取得を所有し
アプリは関与しないが (AD-039 §3)、`aws-assume-role` のみアプリが STS `AssumeRole` で一時資格を取り env に注入する
ため、期限監視の持ち主がアプリになる。ただし US-1 / US-2 が満たされて初めて意味を持つため P2 とする。

**Independent Test**: STS `AssumeRole` レイヤと時計を差し替え、期限前警告の閾値・実行中期限切れの検知が
起き、一時資格が**メモリのみ** (永続層・ログに現れない) であることを単体テストで確認する。

**Acceptance Scenarios**:

1. **Given** `aws-assume-role` の Provider で実行中、有効期限が近づく、**When** 閾値に達する、
   **Then** 期限前警告が示される
2. **Given** 実行中に一時資格が期限切れになった、**When** 状態を見る、**Then** 期限切れが UI に明示され、
   次の操作の導線が示される (再取得ロジックそのものは Claude Code / 利用者に委ねる)
3. **Given** `aws-assume-role` で `AssumeRole` を行う、**When** 監査経路を確認する、**Then**
   `RoleSessionName` にアプリ名 + セッション ID が含まれ CloudTrail で追跡できる (charter 既定 / AD-011)
4. **Given** 一時資格を保持している、**When** 永続層 (JSON / SQLite) とログを走査する、**Then**
   一時資格の実体が**どこにも書かれていない** (メモリのみ)

---

### User Story 4 - Provider を編集・削除し、同一 backend を複数登録する (Priority: P2)

利用者は登録済み `ProviderProfile` を編集・削除でき、**同一 backend を複数登録**できる
(本番用 Bedrock と検証用 Bedrock、会社アカウントと個人アカウントの Enterprise)。各 Provider は
モデルカタログを保持する (Bedrock は inference profile ID で pin)。

**Why this priority**: charter Scope の「同一バックエンドの複数登録を許す」を満たす。CRUD が無いと
検証用構成を並べて使い分けられない。US-1 の登録が前提であるため P2 とする。

**Independent Test**: `ProviderProfile` ストアの CRUD (同一 backend 複数登録・編集・削除) と、
削除時に `safeStorage` 参照キーが解放されることを infra / renderer の単体テストで確認する。

**Acceptance Scenarios**:

1. **Given** 本番用と検証用の 2 つの Bedrock を登録する、**When** 一覧を見る、**Then** 同一 backend でも
   別 Provider として区別されて並ぶ (表示名で識別できる)
2. **Given** 登録済み Provider、**When** 表示名 / config ディレクトリ / モデルカタログを編集する、
   **Then** 変更が反映される (`api-key` / `oauth-token` の秘密は再入力時のみ `safeStorage` を更新する)
3. **Given** 登録済み Provider を削除する、**When** 削除する、**Then** `ProviderProfile` が消え、
   紐づく `safeStorage` 参照キーが解放される (秘密の実体が残らない)

---

### Edge Cases

- 検出候補が実在するが**登録済みと重複**する — 二重登録を促さず、既登録である旨を示す
- `~/.aws/config` に多数のプロファイルが在る — 提示するが自動登録しない (charter 不変条件)
- `~/.aws/config` が破損 / 解析不能 (不正 INI・異常 charset・異常プロファイル名)、または**読み取り不能
  (権限不足・I/O エラー)** — その候補をスキップし、他候補の提示は継続し、理由を示す (検出全体を沈黙失敗で
  空にしない。SC-009。po L-102)
- 実行中セッションが使用中の Provider を編集 / 削除しようとする — env は起動時スナップショットのため実行中
  セッションには影響させない (再導出時の参照切れを防ぐ)。起動そのものは `session` domain / X-4 の関心のため、
  実行時の影響範囲の確定はそちらへ送る (Out of Scope)
- config ディレクトリ候補がホストに在るが、選んだランタイムから**到達できない** — 起動の選択肢に出さず、
  「このランタイムからは届かない」と示す (`unreachable` と `blocked` を区別する。Reachability)
- コンテナ内ランタイムからホストの `~/.claude` を参照する Provider を選ぼうとする — 到達不可として除外
- `api-key` 方式で `safeStorage` が利用不可な環境 (キーチェーン無効) — 秘密を平文で持たず、登録を拒否して理由を示す
- `aws-assume-role` の `AssumeRole` が失敗する / 権限不足 — セッションに閉じた失敗として示し、アプリを落とさない
- 一時資格が起動時点で既に期限切れ — 起動前に検知して理由を示す
- Provider の `extraEnv` に `WSLENV` や資格情報系パターンを入れようとする — 許可リストで弾く (FR-009)
- `vertex` / `foundry` の Provider — **登録のみ**を許し、到達可能性判定・env 導出の検証対象にしない (charter)
- ログ・エラー・クラッシュレポートに env / 秘密が混じる経路 — 理由キー・Provider id 等のメタのみ出す
- 空状態 — 検出候補ゼロ / 登録ゼロ / 到達できる Provider ゼロ。いずれも導線を示す

## Requirements _(mandatory)_

### Functional Requirements

**番号は追加順、並びは主題順である。重複は無い。規則の正本は 1 箇所に置き参照する。**

#### 登録 / 検出

- **FR-001**: システムは `ProviderProfile` の **CRUD** を提供し、**同一 backend の複数登録を許さ**なければ
  ならない (本番用 / 検証用 Bedrock 等)。`ProviderProfile` は `id` / `displayName` / `backend`
  (`anthropic` | `bedrock` | `vertex` | `foundry`) / `configDir?` / `credential` / `models` / `extraEnv?` を持つ
  (型の正本は [AD-005](../../docs/decisions/0005-provider-as-registrable-value.md))
- **FR-002**: システムは認証の痕跡 — **config ディレクトリ候補・`~/.aws/config` のプロファイル・既存の
  環境変数** — を検出し**候補として提示**しなければならない。**自動登録してはならない** — 登録は常に利用者の
  明示操作を要する (charter 不変条件)。検出結果からの登録は表示名と `CredentialSource` の確定を伴う。
  **`DetectedCandidate` は env の変数名・存在・所在といったメタのみを運び、env の秘密「値」を IPC 越しに
  renderer へ運んではならない** (提示に必要なのは変数名であり値ではない。env-passthrough は AD-039 §3 で
  「秘密なし・親環境が所有」。値が renderer 状態 / devtools / クラッシュダンプに残留する経路を作らない。Principle V)
- **FR-003**: システムは **9 種の `CredentialSource`** (`config-dir` / `in-app-login` / `api-key-helper` /
  `api-key` / `oauth-token` / `aws-profile` / `aws-credential-export` / `aws-assume-role` / `env-passthrough`) を
  扱わなければならない。各方式の**委譲メカニズム・アプリが保持するもの・期限切れ再取得の所有者**の正本は
  [AD-039](../../docs/decisions/0039-credential-delegation-verified.md) §3 の 9×委譲マトリクスとし、本 spec は
  参照する (規則を再掲しない)

#### 秘密の取り扱い (Principle V)

- **FR-004**: システムは**長期資格情報を永続化してはならない**。永続化が必要な `api-key` / `oauth-token` の
  秘密値は `safeStorage` (OS キーチェーン) に預け、`ProviderProfile` は**参照キーのみ**を持たなければならない
  (JSON 設定・SQLite スキーマに秘密値カラムを持たない。Principle V / charter 不変条件)。**`extraEnv` は秘密を
  入れる場所ではない** — 登録 / 更新の**永続前に `extraEnv` の値をスキャン**し、秘密らしい形 (`sk-` / `AIza` /
  `ghp-` / 長大トークン / AWS キー形) に一致する値は**登録を拒否**しなければならない (無害なキー名の下に秘密値が
  平文 JSON へ焼き込まれるのを防ぐ。秘密は必ず `api-key` / `oauth-token` の `safeStorage` 経路へ誘導する)
- **FR-005**: `api-key-helper` / `aws-credential-export` の helper パスは、セッション起動のたびに
  **per-session の inline `settings`** (`Options.settings`) として渡し、グローバル `~/.claude/settings.json` を
  **書き換えてはならない** ([AD-039](../../docs/decisions/0039-credential-delegation-verified.md) D2)。
  **helper を運ぶ `settings` は `{ apiKeyHelper?, awsCredentialExport? }` の 2 キー限定の制約付き射影
  (`HelperSettings` 型) でなければならず、`permissions` / `permissionMode` / `env` / その他の `Settings` キーを
  含んではならない** — X-1 の [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §4 P1 が
  `settings` を昇格レバーとして締め出した趣旨を維持したまま helper 委譲の 1 経路だけを検証済みで通す
  ([AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md))。`query()` に渡す直前に
  キー集合 ⊆ `{apiKeyHelper, awsCredentialExport}` を明示述語で assert する (`as` キャスト禁止・逸脱は throw)。
  helper の呼び出しタイミング・期限切れ再取得は Claude Code が所有する (アプリはパスを持つのみ)
- **FR-006** (**R-02 決定: awsCredentialExport 化**): `aws-assume-role` は、`AssumeRole` して一時資格を JSON 出力する
  **helper スクリプトのパス**を `settings.awsCredentialExport` で渡さなければならない。**アプリは一時資格の実体を
  持たず** (メモリにも永続層にも書かない)、**期限監視・cache・再取得は Claude Code** が所有する (他 8 方式と同じ
  委譲形に収束。research R-02)。**X-3 では helper スクリプトのパスをユーザ入力として受け取る** (登録時に検証し
  `settings.awsCredentialExport` に載せるところまで)。**`RoleSessionName` (アプリ名 + セッション ID) を仕込んだ
  helper スクリプトの生成をアプリが行う要件は、helper を実際に起動へ配線する X-4 (起動統合) に帰属する** (AD-039 D4。
  それまで CloudTrail 追跡は helper 実装者の責務)。**`@aws-sdk/client-sts` 等の AWS SDK をアプリ本体に入れない**
  (helper スクリプトが AWS CLI/SDK を使うかは helper の実装事項)
- **FR-007**: システムは **`env` / 秘密の実体をログ・エラー・クラッシュレポートに出力してはならない**
  (理由キー・Provider id・sessionId 等のメタのみ。Principle V / charter 不変条件)

#### env 導出

- **FR-008**: システムは選ばれた `ProviderProfile` から**セッション起動 env を導出する純粋関数**を持たなければ
  ならない。`Options.env` は subprocess 環境を**置換**する (マージではない) ため、Provider 由来の変数だけでなく
  Claude Code が要る基盤変数 (`PATH` / `HOME` 等) を**明示的に含めた curated base を spread** しなければならない
  ([AD-039](../../docs/decisions/0039-credential-delegation-verified.md) D3 / AD-005 Consequences)。
  導出は (a) `env` マップ、(b) 必要なら制約付き `settings` (`HelperSettings`。FR-005) の 2 つを生成する。
  **純粋関数は I/O を持たない** — `safeStorage` 復号値・`aws-assume-role` の STS 一時資格は `infra` が解決し、
  復号済みの値として純粋関数に**引数で渡す** (純粋関数が `safeStorage` / STS / ファイルを呼ばない。Principle VII /
  [AD-023](../../docs/decisions/0023-application-architecture.md) §3/§7。seam は data-model が正本)。
  **`config-dir` 方式で `env.CLAUDE_CONFIG_DIR` に載せる値は、選択ランタイムの `RuntimePath` へ変換してから
  注入**しなければならない — 素の `HostPath` を載せると WSL 内 `claude` が POSIX として解釈できず委譲経路が
  沈黙失敗する (AD-036 §6 の申し送り「含めるなら distro RuntimePath であることを検証する」/ Principle I /
  [AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) の名前空間変換)
- **FR-009**: env 導出は **2 経路を型で分離**しなければならない — (a) **passthrough 許可リスト** (curated base の
  実名集合。X-1 の許可リスト枠組みを継承。正本は X-1 contracts C-5 / [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §6) と、
  (b) **方式固有の curated 実名注入**。**passthrough 許可リストに `WSLENV` と資格情報系パターン
  (`ANTHROPIC_API_KEY` / `AWS_*` / `*_TOKEN` / `*_SECRET` / `*_KEY`) を含めてはならない** — WSL は `WSLENV`
  列挙変数を WSL 内へ透過するため秘密の透過経路になる (Principle V)。(b) の方式固有 curated 注入は
  **実名でのみ**行う: `api-key` = `ANTHROPIC_API_KEY` / `oauth-token` = `CLAUDE_CODE_OAUTH_TOKEN` /
  `aws-profile` = `AWS_PROFILE` (+ `AWS_REGION` / Bedrock は `CLAUDE_CODE_USE_BEDROCK`) の実名固定集合であり、
  汎用パターンでの透過を作らない。**`api-key-helper` / `aws-credential-export` / `aws-assume-role` は env に秘密を
  載せず、`settings` (`HelperSettings` の `apiKeyHelper` / `awsCredentialExport`) で helper パスを渡す**
  (R-02: `aws-assume-role` も awsCredentialExport 化。アプリが一時資格を env に実名注入する経路は持たない。FR-006 /
  [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md))。**`extraEnv` の導出時の扱い**: `extraEnv` は
  passthrough 許可リスト (a) に含まれる KEY のみ導出 env に通し、**`WSLENV` と資格情報系パターンの KEY は導出時に
  除外**する (persist 前の値スキャン FR-004 とは別に、導出時に KEY denylist を適用。security H-101。無害キー名の下の
  WSLENV 再導入を塞ぐ)

#### モデル

- **FR-010**: システムは Provider ごとの**モデルカタログを保持**し、Provider 切り替えでカタログを差し替え
  なければならない。**Bedrock は inference profile ID で pin** し、alias 運用をしない (charter 不変条件)。
  モデル候補の**動的取得は本 feature に含まない** (SPIKE-6。カタログは静的保持)

#### 到達可能性

- **FR-011**: システムは **Provider × ランタイムの到達可能性を判定**しなければならない。`config-dir` 系
  Provider の到達可能性は、`env.CLAUDE_CONFIG_DIR` の指す先へ**ランタイムが到達できるか**で決まり、runtime domain の
  **`Reachability` (3 値: `reachable` / `unreachable` / `blocked`) を再利用**する (AD-039 §5。判定の実装は本 feature)。
  **判定入力は `configDir` (`HostPath` / UNC) から所在 (`Location`) を導出してから** runtime の `PathMapping` /
  `Reachability` に載せる ([AD-025](../../docs/decisions/0025-workspace-folder-carries-location.md) の
  「所在が分からなければ到達可能性は決められない」。素の文字列を判定に食わせない)。**所在を特定できない
  (`unknown-location` / `opaque-unc` に落ちる) 場合は非 `reachable` (`unreachable` か `blocked`) に写像**して
  安全側に倒す。`blocked` (今は届かないが解消手順がある) と `unreachable` (届かない) を区別する
- **FR-012**: システムは**到達できる Provider だけ**を起動の選択肢に出さなければならない (コンテナ内から
  ホストの `~/.claude` は不可視。charter Journey 2)。除外した Provider は理由 (到達不可 / blocked) が分かる形で扱う。
  **X-3 は `listReachableProviders` IPC が到達可能な集合と除外理由のみを返すところまで**、選択肢への**表示 (UI surface) は
  X-4** に帰属する (US-2 Independent Test / Out of Scope 参照)

#### 期限

- **FR-013** — **N/A (R-02: awsCredentialExport 化。期限監視は Claude Code へ委譲)**。以下は直接 AssumeRole
  ブランチを採った場合の要件として残す (本 feature では実装しない): システムは `aws-assume-role` の一時資格の**有効期限を監視**し、**期限前に警告**し、
  **実行中の期限切れを UI に明示**しなければならない (charter Journey 3)。**期限前警告の閾値は既定
  `Expiration` の 5 分前**とする (AD-039 §2 の Claude Code awsCredentialExport cache 挙動に揃える。閾値は
  data-model が正本。将来設定可能にするかは X-4 判断)。起動時点で既に期限切れの一時資格は起動前に検知して
  理由を示す。期限切れ時の**再取得ロジックは実装しない** (Claude Code / 利用者に委ねる。charter Out of scope)。
  **本 FR / US-3 / SC-008 は「直接 `AssumeRole` ブランチ」を前提とする** — research R-02 で `awsCredentialExport` 化
  (期限監視を Claude Code に委譲) を採る場合、`aws-assume-role` の期限監視も他 8 方式同様 Claude Code が所有し
  US-3 / SC-008 は N/A になる (どちらのブランチでも受け入れ条件が閉じる。po M-101)

#### 用語

- **FR-014**: 本 feature で導入・変更する用語は [docs/glossary.md](../../docs/glossary.md) に反映しなければ
  ならない (Principle XIV)。`CredentialSource` / `ProviderProfile` / `Model catalog` / `Reachability` /
  `DetectedCandidate` を canonical に揃え、`CredentialSource` は**参照キー**として持ち日本語 UI への**訳出は `ui`** が
  行う (Principle XV。code identifier は英語)

### Key Entities

- **ProviderProfile**: `Provider` の実体 (charter / AD-005 型)。`id` / `displayName` / `backend` /
  `configDir?` (`CLAUDE_CONFIG_DIR`。`HostPath | WslUncPath` — WSL 内 config は UNC 名前空間。AD-025 §2) /
  `credential` (`CredentialRef` = AD-005 の `CredentialSource` を非秘密の参照付きに精緻化。data-model §2) /
  `models` (`ModelCatalogRef`) / `extraEnv?`。**秘密の実体を持たず**、`api-key` / `oauth-token` は `safeStorage`
  参照キーを持つ (FR-004)
- **CredentialSource**: 認証方式。**9 種**。各方式の委譲・保持・再取得所有者の正本は AD-039 §3。
  参照キーであり訳出は `ui` (FR-014)
- **ModelCatalog (Model catalog)**: Provider ごとに使えるモデルの集合。**Bedrock は inference profile ID で pin**。
  静的保持 (動的取得は SPIKE-6)
- **DetectedCandidate (検出候補)**: 検出で得た**登録前の候補**。`config dir` / `aws profile` / `env passthrough` の
  3 由来を持つ。**提示のみで自動登録しない** (FR-002)。登録済みとの重複を区別する。**env の秘密「値」を持たず、
  変数名・存在・所在のメタのみを運ぶ** (FR-002)
- **Reachability**: runtime domain から**再利用**する 3 値 (`reachable` / `unreachable` / `blocked`)。
  Provider × ランタイムの到達可能性判定に使う。判定入力は `configDir` から導出した所在 (`Location`) (FR-011)
- **導出 env (DerivedLaunchEnv)**: `ProviderProfile` と `infra` が解決した秘密/一時資格 (引数) から導出する
  `{ env, settings? }`。`settings?` は **`HelperSettings` (`{ apiKeyHelper?, awsCredentialExport? }` の 2 キー
  限定)** であり `Settings` 全体を組めない (C-001 / AD-040)。curated base を spread し、passthrough 許可リストに
  `WSLENV` / 資格情報パターンを含まない (FR-008 / FR-009)
- **一時資格 (assume-role 専用)** — **N/A (R-02: awsCredentialExport 化)**。直接 AssumeRole ブランチを採る場合のみの姿:
  `aws-assume-role` でアプリが扱う一時資格情報 (メモリのみ・非永続・期限監視付き。`RoleSessionName` にアプリ名 +
  セッション ID)。**現行は helper スクリプト側が一時資格を扱い、アプリは実体も期限監視も持たない** (FR-006 / research R-02。
  期限監視は Claude Code へ委譲)。X-3 は helper パスを載せるまで (US-3/FR-013 と同じ N/A 扱い。Principle V「一時資格を
  アプリに持たない」を保つ)

## Success Criteria _(mandatory)_

**各 SC は計測経路を必須とする。計測経路を持たない SC は作らない。**

- **SC-001**: 検出候補が**自動登録される件数が 0** である。config ディレクトリ / AWS プロファイル /
  env passthrough の候補は提示のみされ、`ProviderProfile` の登録は必ず利用者の明示操作を経る。計測経路:
  検出レイヤ (ファイルアクセス / env 読み取り) を差し替えた単体テストで、検出→提示のみで登録 0 件を assert する
- **SC-002**: **秘密値がどこにも永続化されない**。JSON 設定・SQLite スキーマに秘密値カラムが **0**、
  ログ・エラー・クラッシュレポートへの `env` / 秘密の出力が **0** である (`api-key` / `oauth-token` は
  `safeStorage` 参照キーのみ)。計測経路: 永続化スキーマとログ出力の静的検査 + security-reviewer + 保持構造の走査
- **SC-003**: **env 導出が安全である**。導出 env が curated base を **spread** して組まれ (置換なので継承に
  頼らない)、**passthrough 許可リストに `WSLENV` と資格情報系パターンが 0 件** (方式固有の実名 curated 注入は
  別勘定。FR-009)、かつ **`config-dir` 方式の `CLAUDE_CONFIG_DIR` が `RuntimePath` 名前空間で組まれる (素の
  `HostPath` を素通ししない)**。計測経路: `ProviderProfile → env` 導出の**純粋関数**の単体テスト (負例 =
  `process.env` を素通ししない / `WSLENV`・資格情報 fake を passthrough に入れない / WSL ランタイムの
  `CLAUDE_CONFIG_DIR` が HostPath でないことを assert)
- **SC-004**: **到達できない Provider が起動の選択肢に 0 件**である。到達可能性判定が runtime の `Reachability` を
  再利用し、`unreachable` / `blocked` および**所在を特定できない (`unknown-location` / `opaque-unc`) Provider が
  選択肢から除外される** (fail-closed。判定不能を楽観側に倒さない)。計測経路: Provider × ランタイムの
  到達可能性判定の純粋関数の単体テスト (境界値。`reachable`/`unreachable`/`blocked`/所在不特定 の各分岐。
  ホスト config dir が WSL の `PathMapping` で**実際に変換できるときだけ** `reachable` である fail-closed も含む)。
  **「到達不可 Provider が起動の選択肢に 0 件」を画面上で確かめる E2E は、到達可能性を消費する起動選択 UI を持つ
  X-4 に帰属する** — X-3 は判定エンジン (`assessReachability`/`splitByReachability`) と `listReachableProviders` IPC + 単体テスト
  まで (Out of Scope 参照)
- **SC-005** — **N/A (R-02: awsCredentialExport 化)**。アプリは一時資格の実体を持たず期限監視もしないため、
  本 SC は計測対象を失う (FR-006 / research R-02)。代わりに「`aws-assume-role` の登録が `settings.awsCredentialExport`
  の helper パスのみを持ち一時資格の実体を持たない」は SC-002 (秘密非永続) が包含する
- **SC-006**: **helper 設定が per-session で渡り、global を汚さず、昇格キーを含まない**。`api-key-helper` /
  `aws-credential-export` の導出が **inline `settings`** を生成し、グローバル `~/.claude/settings.json` への
  書き込みが **0**、かつ **導出 `settings` のキー集合 ⊆ `{apiKeyHelper, awsCredentialExport}`
  (`permissions` / `permissionMode` / `env` が現れれば fail)** である (C-001 / [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md))。
  計測経路: helper 方式の導出関数の単体テスト (出力が `HelperSettings` 型に閉じ 2 キー以外を含まないこと +
  filesystem 書き込みが起きないことの assert) + `check.mjs` 項目 16 の違反 fixture (3 キー目の混入を検出)
- **SC-007**: **Bedrock のモデルが inference profile ID で pin される**。`ModelEntry.inferenceProfileId` を型で保持し
  永続レコード検証を通過し、alias 運用に落ちない (X-3 は型と `provider-record` の round-trip まで)。計測経路:
  モデルカタログの保持構造 (`ModelEntry` 型 + `provider-record` の round-trip) の単体テスト。**カタログを画面へ
  投入し Provider 切り替えで差し替える UI とその単体テストは X-4 の catalog 面 (FE-010 系) に帰属する**
- **SC-008** — **N/A (R-02: awsCredentialExport 化)**。期限監視を Claude Code に委譲したため、アプリ側の
  期限前警告・実行中期限切れ表示は本 feature の対象外になった (FR-006 / research R-02)
- **SC-009**: **検出が取りこぼさない** (charter KPI「検出の網羅」)。計測経路は 2 段に分ける: **(a) 正規化・
  破損スキップの網羅 = Vitest** (検出レイヤを差し替え、期待集合との一致・破損/読み取り不能候補のスキップと他候補
  継続を assert。fake が期待集合を定義するため normalize 層の網羅を測る)、**(b) 実ホストのスキャン網羅 =
  quickstart SH-022 の判定表 (手動)** (実スキャンが config ディレクトリ / AWS プロファイルを取りこぼさないか。
  charter が計測経路を「手動検証」とする本旨。fake では測れない旨を明示)
- **SC-010**: **Provider CRUD と同一 backend 複数登録が成立する**。本番用 / 検証用の 2 つの Bedrock を別
  Provider として登録・一覧・編集・削除でき、削除時に紐づく `safeStorage` 参照キーが解放される。計測経路:
  `ProviderProfile` ストアの CRUD 単体テスト (同一 backend 複数登録の識別 + 削除時の参照キー解放を assert)

## Assumptions

`[USER]` は起案時に人間が確定したもの、`[ASSUMED]` は SPIKE-7 の結果を本 spec で自動採用したものである。

- **[USER]** targets = `both` (frontend / backend の両方に触れる)。domain = `provider` は description の
  `[provider]` プレフィックスから自動確定した (`domain_selected_by: auto`。charter 実在)
- **[ASSUMED]** 委譲設計 (AD-005 / AD-011 / charter Scope) は**変更不要でそのまま成立する** —
  SDK 0.3.270 で委譲に必要な拡張点 (`settings` / `env` / helper 3 種 / `settingSources` / `managedSettings`) が
  すべて実在する ([AD-039](../../docs/decisions/0039-credential-delegation-verified.md) Decision 1)
- **[確定]** helper 設定は **per-session の制約付き inline `settings`** (`HelperSettings` = 2 キー限定) で渡す
  (グローバル settings.json を汚さない。AD-039 D2)。X-1 の AD-036 §4 P1 が `settings` を昇格レバーとして
  締め出していたため、**[AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) で調停**し
  昇格面 (permissions/permissionMode/env) を維持したまま helper 2 キーだけを通す (design-gate Round 1 の C-001 対応)。
  代償として `--settings` は当該 invocation にのみ効くため、**セッション起動のたびにアプリが Provider から
  `settings` を導出して渡す**設計とする (AD-039 Consequences)
- **[ASSUMED]** `Options.env` は置換であり **curated base を spread** する (AD-039 D3 / AD-005)。ログに `env` を
  素で出さない
- **[ASSUMED]** `aws-assume-role` はアプリが一時資格を扱う**唯一の例外**として隔離する (AD-039 D4)。
  **`aws-assume-role` を `awsCredentialExport` 化する** (一時資格を JSON 出力する helper スクリプト化し、
  期限監視を Claude Code の cache-until-`Expiration` に寄せる) 選択肢の採否は **plan / 実装で判断する**
  (AD-039 Open Question。持ち主 = X-3)
- **[ASSUMED]** helper の live 実発火回数・TTL 実測は SPIKE-7 で未実施 (型 + 公式ドキュメントまで)。
  X-3 実装時に **stub helper で 1 度観測して裏取りする** (AD-039 Open Question)
- **[ASSUMED]** `managedSettings` による precedence の厳密順位は本 feature では確定しない (企業ロックダウンは
  X-3 か enterprise 対応時に持ち越す。AD-039 Consequences)
- **[ASSUMED]** charter KPI「委譲率」(アプリが秘密を保持しない方式の割合) は**運用集計型の継続 KPI**であり、
  単発 feature の acceptance bar (SC) の対象外とする。本 feature は推奨方式 (`api-key-helper` /
  `aws-credential-export`) を登録 UI で提示することで委譲率向上に寄与する (charter 業務ルール)

## Out of Scope

- **軸どうしの依存解決を伴う起動設定ダイアログとプリセット** → **X-4**。**X-3 が持つ UI 面**は、**登録・検出提示・
  編集・削除の登録管理 UI** までとする (`ProviderScreen`)。**到達可能性でフィルタした Provider リストの表示 (US-2 の
  起動選択面) と Provider 選択に連動したモデルカタログ表示は X-4 に帰属する** — X-3 は到達可能性判定エンジン
  (`assessReachability`/`splitByReachability`)・env 導出 (`deriveLaunchEnv`)・`listReachableProviders` IPC を**バックエンド
  として提供**し、それを消費する起動選択 UI は X-4 が足す。**X-4 が足すもの**はさらに、effort / 権限モードを含む
  **全軸のプリセット化**と、「上流の軸を変えたとき下流を既定に戻す**依存解決**」、および `aws-assume-role` の
  **RoleSessionName 付き helper スクリプト生成**と helper の起動配線 (FR-006 参照)。SC-004 の E2E (到達不可 Provider が
  選択肢に 0 件) は **X-4 の起動選択 UI** 上で走る (帰属を確定)
- **`vertex` / `foundry`** — **登録のみ**を許し、到達可能性判定・env 導出・helper 委譲の**検証対象にしない**
  (charter。`gcpAuthRefresh` を含む本格対応は将来)
- **モデル候補の動的取得** → **SPIKE-6**。本 feature はモデルカタログを静的保持する
- **ログインフローの実装・期限切れ再取得ロジック** → Claude Code に委譲する (`/login` / 401 対応 / helper の
  再実行は Claude Code が所有。AD-039 §2。`aws-assume-role` の期限**監視**のみ本 feature)
- **`sessionStore` / SQLite 永続化** → **I-1**。本 feature の `ProviderProfile` 永続化は R-1 と同じ JSON 設定層に
  載せ、秘密は `safeStorage` 参照キーのみとする (SQLite スキーマは持たない)
- **セッション列挙への Provider 由来 config ディレクトリの合流** (`EnumerationTarget.origin` に `'provider'` を
  加える集合差し替え) → `session` domain / 後続 feature。本 feature は `ProviderProfile` の `configDir` を**値として
  供給する**ところまで (R-2 contracts C の申し送り。集合差し替えだけで済む形を壊さない)

## Dependencies

- **X-1 完了済み** (spec 005) — 単一セッション起動と**起動 env の許可リスト枠組み** (X-1 FR-006 /
  `buildLaunchEnv` / `WSLENV`・資格情報 denylist)。本 feature の FR-008 / FR-009 はこの枠組みを**継承**する
  ([AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md))
- **SPIKE-7 完了済み** → [AD-039](../../docs/decisions/0039-credential-delegation-verified.md) (accepted 2026-09-29)。
  委譲マトリクス (§3) / `env` 置換 (D3) / per-session `settings` (D2) / `aws-assume-role` 隔離 (D4) /
  到達可能性の `settingSources`・`CLAUDE_CONFIG_DIR` (§5) の根拠
- **AD-005 accepted** — `ProviderProfile` 型と「Provider は認証方式を含む登録可能な値」。FR-001 の型の正本
- **AD-011 accepted** — 資格情報の解決は Claude Code に委譲。FR-004〜FR-007 の設計原則
- **[AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) proposed (本 feature で起票)** —
  AD-036 §4 P1 (query options allowlist が `settings` を締め出す) と AD-039 D2 (helper = inline settings) の調停。
  `settings` を `{apiKeyHelper, awsCredentialExport}` 2 キー限定の制約付き射影として許し昇格面を維持。FR-005 / SC-006 の根拠。
  design-gate 通過で accepted へ昇格
- **R-1 完了済み** — runtime domain の `Reachability` / `RuntimeDescriptor` / `PathMapping` / `WorkspaceFolder` の
  所在。FR-011 の到達可能性判定はこれを再利用する。`infra/secrets/` は R-1 が electron import の例外枠として
  予約済み ([AD-023](../../docs/decisions/0023-application-architecture.md) §8) — 本 feature が最初の `.ts` を置く
- **機械強制の申し送り** — `.dependency-cruiser.js` の `services-not-to-io` が
  「X-3 の `ProviderService` を作るときは `from` に実名を足す」と明記 (AD-027 Consequences)。plan で処理を割り当てる
