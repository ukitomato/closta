---
spec_id: 008-session-launch-settings-dialog-and-presets
feature_id: X-4
domain: session
domain_selected_by: auto
targets: both
targets_selected_by: user
status: completed
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: 起動設定ダイアログとプリセット (X-4)

**Feature Branch**: `008-session-launch-settings-dialog-and-presets`

**Created**: 2026-09-30

**Status**: frontmatter の `status:` を正とする

## Summary

セッション起動の軸を **1 つのダイアログで選び**、その組み合わせを**名前付きプリセット**として保存・再適用できるようにする。軸は 作業フォルダ / ランタイム / Provider / モデル / effort / 権限モード の 6 つ。Provider は到達可能性で、effort はモデルの対応値で絞る。**上流の軸を変えて無効になった下流は既定に戻し、通知する** (依存解決)。作業フォルダとランタイムがファイルシステム境界を越える組み合わせでは警告を出す。

**権限モードは安全な 3 値 (`default` / `plan` / `dontAsk`) に限る。** X-1 の「`default` 固定」(AD-036 §5) を安全 3 値の allowlist に広げる調停 ADR (AD-041) を起票し、昇格モードは引き続き締め出す。

X-3 が backend として用意した `deriveEnv` / `listReachableProviders` / helper `settings` 制約 (AD-040) を、X-1 の単一セッション起動に**初めて実配線する**。そのために、**導出 env を WSL 内の `claude` まで届ける経路** (アプリが実名キーだけで `WSLENV` を生成する) と、**起動 argv をシェルに解釈させない形** (`wsl.exe --exec`) を AD-041 で定める。

**なぜ今**: X-1 で「既定 env・固定条件」の 1 セッションを起こせるようになり、X-3 で Provider を認証方式つきの値に一般化した。X-4 はそれらを、**利用者が軸で選んで起動できる UI** に束ねる。「同じ起動条件を毎回打ち直す」という charter Mission の課題に答えるものであり、X-5 (マルチセッション差配) の前提でもある。

## 本 feature の位置づけ

X-3 は Out of Scope で、次の 2 つを X-4 帰属と確定させた。本 feature はそれを取り込み、起動軸のプリセット化と依存解決を加える。

- 到達可能性で絞った Provider 選択 (X-3 FE-010)
- モデルカタログの切替 (X-3 FE-010 のカタログ面 / X-3 SC-007)

**aws-assume-role の helper 生成 (X-3 BE-020 の X-4 帰属分) は X-7 へ繰り越す** (USER 決定 2026-09-30)。理由は 2 つある。

- 生成に要る roleArn / region / profile が Provider のデータモデルに無く、provider domain の登録スキーマ変更を伴う。
- パラメータ付き helper は `check.mjs` 項目 6 (Principle VI) の 3 点検査と構造的に合わない。

継承する規則の正本は先行 feature / ADR に置き、本 spec は参照形で書く。

## User Scenarios & Testing

### User Story 1 - 軸を選んでセッションを起動する (Priority: P1)

利用者は起動設定ダイアログで 作業フォルダ → ランタイム → Provider → モデル → effort → 権限モード を選び、起動する。選択肢は上流の選択に連動して絞られる。

- ランタイムを選ぶと、そのランタイムから**到達できる Provider だけ**が出る。
- Provider を選ぶと**モデルカタログ**が切り替わる。
- モデルを選ぶと、そのモデルが**対応する effort だけ**が出る。
- 権限モードは安全な 3 値から選ぶ。

依存解決 (上流変更 → 下流を既定へ戻して通知) は本 Story の一部である。

**Why this priority**: charter Journey 2 の中核であり、X-1 の起動を「利用者が条件を選べる起動」へ引き上げる。これが無いと X-3 の backend (到達可能性・env 導出) が利用者に届かない。

**Independent Test**:

- 依存解決の純粋関数の単体テスト。
- 選んだ config で X-1 の launch が呼ばれることを fake launcher で確認する。
- 除外理由の表示・リセット通知・安全 3 値だけが出ることを renderer 単体で確認する。

**Acceptance Scenarios**:

1. **Given** 登録済み Provider が複数あり、ランタイムを選ぶ。**When** Provider 選択肢を見る。**Then** そのランタイムから到達できる Provider だけが出て、除外されたものには理由 (到達不可 / blocked) が付く (X-3 `listReachableProviders` を消費)
2. **Given** Provider を選ぶ。**When** モデル選択肢を見る。**Then** その Provider のモデルカタログに切り替わる (Bedrock は inference profile ID で pin)
3. **Given** モデルを選ぶ。**When** effort と権限モードの選択肢を見る。**Then** 次のとおりになる。
   - effort はそのモデルのカタログ項目が持つ対応 effort だけが出る。
   - 権限モードは `default` / `plan` / `dontAsk` の 3 値だけが出る (昇格モードは出ない。[AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md))。
4. **Given** Provider を選んだ状態でランタイムを別 distro に変える (またはモデルを変える)。**When** 下流を再評価する。**Then** 無効になった下流 (到達不可の Provider / カタログ外モデル / 非対応 effort) は既定に戻り、UI に戻した理由が通知される
5. **Given** 全軸を選ぶ。**When** 起動する。**Then** X-3 の導出 env と `settings` (AD-040 の 2 キー射影) で X-1 の単一セッション起動が呼ばれ、応答がストリーミング表示される
6. **Given** `dontAsk` を選ぶ。**When** ダイアログと起動後の挙動を見る。**Then** 次のとおりになる。
   - 選択時に「承認カードは出ず、事前承認の無い操作は拒否される」ことが説明される。
   - 起動後、事前承認の無い tool は承認カードを出さずに拒否され、拒否が理由付きで transcript に表示される ([AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) §4)。
7. **Given** 起動が拒否・失敗する。**When** 利用者が結果を見る。**Then** 理由キーに対応する文言が表示され、ダイアログは入力を保ったまま戻る (値そのもの — パス・モデル ID — は理由に含めない)。失敗の種類と理由キーの対応は次のとおり。
   - Provider の env 導出が null (config-dir の変換不能を含む) → `provider-unavailable`
   - helperPath を分類できない → 到達可能性の判定で除外される。起動時に選択済みだった場合は、FR-006 の reset になり `needs-confirmation`
   - main の再検証で無効な軸 → `invalid-config`
   - 確認が要る reset がある → `needs-confirmation`
   - 既に 1 セッション実行中 → `session-active`
   - 最初の応答より前に SDK / claude が起動を拒否・終了した (誤った effort など) → 既存の `launch-failed`

   起動の流れは X-1 と同じで、最初のプロンプトを送った時点で起動する。起動が**確立**したと判定するのは、SDK の `system/init` メッセージを受信した時点とする。
   - ダイアログは起動ボタンで閉じ、起動設定を保持する。
   - 確立前に失敗した場合 (`launch-failed` を含む)、または確立前に利用者が中断した場合は、保持した設定でダイアログを開き直し、理由を示す。
   - 確立後の失敗は X-1 の実行中セッションの扱いに従う。

### User Story 2 - プリセットを保存・適用する (Priority: P1)

利用者は軸の組み合わせを名前付きプリセットとして保存し、次回はプリセットを選ぶだけで全軸を復元する。**プリセットに長期資格情報の値を含めない** (Principle V)。Provider は id 参照で持つ。

**Why this priority**: charter Mission「同じ起動条件を毎回打ち直している」への直接の答え。

**Independent Test**:

- 保存 → 再読込 → 適用のラウンドトリップを永続層 (JSON) の単体で確認する。
- **秘密値がプリセット JSON に現れない**ことを assert する。
- 保存 → 適用 → リセット通知 → 起動を E2E で 1 本確認する。

**Acceptance Scenarios**:

1. **Given** 軸を選んだ状態。**When** 名前を付けて保存する。**Then** プリセットが 1 件保存され、次回起動時に一覧へ出る。同名があれば上書きを確認し、承認時だけ上書きする
2. **Given** 保存済みプリセット。**When** 適用する。**Then** 全軸が復元される。適用後に無効な軸があれば FR-006 の規則で扱う
   - provider / model / effort が無効なら既定へ戻して通知する。
   - フォルダ・ランタイムが無効なら未選択にして起動を不可にする。
3. **Given** プリセット適用、またはダイアログでの上流変更によって **Provider 軸が既定に戻った**。**When** 起動する。**Then** 起動前に確認を求める。
   - 確認の文言は「既定 Provider では distro の claude の既定資格情報が使われる」ことを伝える。
   - 承認すれば既定 Provider で起動する。拒否すればダイアログに戻り、Provider 軸は未確定のままにする (利用者が意図しない資格情報・課金先で黙って起動させない)。
4. **Given** プリセット JSON。**When** 走査する。**Then** **秘密値・secretRefKey・helper の実体が現れない** (Principle V)

### User Story 3 - 越境警告と依存解決の境界 (Priority: P2)

作業フォルダとランタイムがファイルシステム境界を越える組み合わせ (ホストのフォルダを WSL ランタイムで開く等) では**警告を出す** (性能崖。[AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md))。依存解決の境界値を網羅的に固める。

**Why this priority**: 依存解決の本体は US-1 (P1) にある。本 Story は、越境警告 (AD-016 の受け入れ条件) と境界値の網羅を担う。P1 の起動が成り立ってから意味を持つので P2 とする。

**Independent Test**:

- 越境の組み合わせで警告が出て、起動ボタンが有効のままであることを renderer 単体で確認する。
- 依存解決の境界値 (folder↔runtime の distro 不一致を含む) を純粋関数の単体で確認する。

**Acceptance Scenarios**:

1. **Given** ホスト作業フォルダ + WSL ランタイム (または Windows マウント配下の WSL フォルダ)。**When** 組み合わせを見る。**Then** 越境警告が出て、起動はブロックされない (閾値なし。判定は既存の解決結果 DTO の `boundary: 'cross'` を消費)
2. **Given** WSL フォルダ (distro A) を選んだ状態でランタイムを distro B に変える。**When** 組み合わせを再評価する。**Then** その組み合わせは起動不可として理由が示される (起動時の `distro-mismatch` 失敗に初めて出会う経路が無い)
3. **Given** 上流変更で下流が既定に戻った。**When** 起動する。**Then** model / effort は戻った値で起動する。Provider は US-2 AC3 の確認を経る。無効値のまま起動される経路は無い (main の起動ゲートでも再検証する)

### User Story 4 - 導出 env と config-dir の実起動配線 (Priority: P2)

X-3 が backend まで用意した導出 env を**実起動の WSL 内 `claude` まで届ける**。env の中身は、api-key / oauth-token の秘密、aws-profile、config-dir の `CLAUDE_CONFIG_DIR`、extraEnv である。

- config-dir Provider は、選択ランタイムの `RuntimePath` へ変換して注入する (X-3 の `resolveConfigDirRuntimePath` stub を実装)。
- helper 系 Provider (api-key-helper / aws-credential-export / aws-assume-role) のユーザ供給 helperPath は、選択ランタイムの名前空間で解決できるものだけを使う。

**Why this priority**: X-3 は launch 配線を次の状態で残した。本 Story はこれを閉じる。

- deriveEnv が非公開
- resolveConfigDirRuntimePath が null
- **env が wsl.exe を越えない** (design-gate で実測)

env の配送 (FR-013) 自体は US-1 に含まれる (BE-009)。本 Story が担うのは config-dir の RuntimePath 解決と helperPath の分類で、これらが無くても api-key / aws-profile / 既定 Provider では起動できる。そのため P2 とする。

**Independent Test**:

- `resolveConfigDirRuntimePath` の変換可/不能を単体で確認する。
- WSLENV 生成の純粋関数 (実名キーだけを列挙する / 親 env の WSLENV を捨てる) を単体で確認する。
- **distro 内から見た値**を quickstart の実機観測で確認する。

**Acceptance Scenarios**:

1. **Given** config-dir Provider + 到達可能なランタイム。**When** 起動する。**Then** WSL 内の `claude` から見た `CLAUDE_CONFIG_DIR` が、選択ランタイムの `RuntimePath` になる。起動したセッションの transcript は、選んだ config dir 配下に書かれる
2. **Given** config-dir Provider + 変換不能な組み合わせ。**When** 起動を試みる。**Then** deriveEnv が fail-closed で null を返し、理由付きで起動が拒否される (既定 config dir を黙って掴む経路が無い)
3. **Given** api-key / aws-profile Provider。**When** 起動する。**Then** 導出したキーが WSL 内の `claude` から見える。親プロセスの `WSLENV` や denylist に当たる passthrough キーは届かない
4. **Given** helper 系 Provider の helperPath が Windows 形式 (`C:\...`) または UNC。**When** 起動を試みる。**Then** 名前空間を失った文字列は渡さない。
   - HostPath は PathMapping で選択ランタイムの RuntimePath に変換して使う。
   - UNC (同じ distro のものも含む) と変換できないパスは、その Provider を到達不可として選択肢から除外する。

### Edge Cases

- 適用したプリセットの Provider が削除済み → Provider を既定へ戻し、起動前に確認する (US-2 AC3)
- 適用したプリセットのフォルダ / ランタイムが削除済み、またはランタイムが停止中 → 未選択にして起動を不可にし、理由を示す (「既定」は無い)。停止中の場合は、次の一手として「distro を起動してから再評価ボタンを押す」ことを示す (アプリは distro を起動しない)
- プリセットが将来版スキーマ → X-3 provider-store と同型に退避する (上書きしない)
- 越境する組み合わせを利用者が承知で選ぶ → 警告は出すが起動は許す (AD-016 は性能崖を「製品仕様として扱う」。禁止ではない)
- 実行中セッションの Provider が編集・削除される → **実行中セッションには影響しない** (env / settings は起動時のスナップショット)。変更は次の起動から効く
- Provider のモデルカタログが空、またはカタログ項目に `supportedEffortLevels` が無い → その軸は「既定」のみ
- 登録フォルダ 0 件 / 実行中の WSL ランタイム 0 件 / 到達できる Provider 0 件 / プリセット 0 件 → 空状態であることと次の一手 (登録画面への導線) を示す。Provider 0 件なら既定 Provider だけで起動できる
- 既に 1 セッション実行中 → 起動は単一セッション規則で拒否され、理由が示される (X-1 の規則を維持)

## Requirements

### Functional Requirements

#### 起動設定ダイアログ (軸選択)

- **FR-001**: システムは 作業フォルダ / ランタイム / Provider / モデル / effort / 権限モード を選ぶ**起動設定ダイアログ**を持たなければならない。
  - 軸は依存順 (folder ↔ runtime → provider → model → effort) に評価する。
  - 起動できるランタイムは X-1 と同じく WSL ランタイムに限る。
  - **作業フォルダとランタイムは必須**であり「既定」を持たない。
  - provider / model / effort は「既定 (指定しない)」を取れる。既定は値の型で表し、文字列 `'default'` を id として使わない。
  - 権限モードの既定は `default` とする。
  - effort の値は SDK `EffortLevel` のうち、選択モデルのカタログ項目が持つ**対応 effort** に限る。対応 effort が無ければ「既定」のみを出す。SDK の `supportedEffortLevels` は稼働中の `Query` からしか得られないため、起動前はカタログの静的データを正とする。
- **FR-002**: ランタイム選択に連動して、**到達できる Provider だけ**を選択肢に出し、除外は理由キー付きで示す (X-3 `listReachableProviders` を消費)
- **FR-003**: Provider 選択に連動して**モデルカタログを切り替える**。
  - Bedrock は inference profile ID で pin する (X-3 の `ModelCatalogRef` を消費)。
  - モデル軸は常に「既定」とカタログ項目を出す。
- **FR-017**: プロバイダ画面で、Provider の**モデルカタログを手入力で追加・編集・削除**できなければならない。
  - 編集項目はモデル ID / 表示名 / inference profile ID / 対応 effort。
  - `ModelEntry` に任意の `supportedEffortLevels` を足す。
  - モデル ID と inference profile ID は**文字種の allowlist 述語** (英数と `._:/@-[]`、先頭 `-` 禁止) で、effort は `EffortLevel` の enum (重複なし・5 件以下) で検証する。
  - これらの述語を IPC 形状検証 / 永続層検証 / 起動設定検証で**共有する** (X-3 SEC-M-001 の write/read 対称)。
- **FR-004**: 権限モードの選択肢は**安全な 3 値 (`default` / `plan` / `dontAsk`) に限る** ([AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) の危険度表で「安全」のもの)。
  - X-1 の「`permissionMode` は `default` 固定」([AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §5) を、AD-041 で安全 3 値の allowlist に広げる。
  - **昇格モード (`acceptEdits` / `auto` / `bypassPermissions`) は、型と `check.mjs` 項目 16 で締め出したままにする。**
  - capability に連動して昇格モードを出す設計は **I-3** に帰属する (Principle III)。
  - AD-041 は X-1 SC-006(a) の「`dontAsk` への経路 0」を明示的に上書きし、`plan` → ExitPlanMode 承認後の遷移先が昇格しないことを Confirmation に含める。

#### 起動の配線 (X-1 の再利用)

- **FR-005**: 起動は **X-1 の単一セッション起動を再利用**する (新たな launch 経路を作らない)。
  - 起動 IPC の引数は、検証済みの起動設定オブジェクトとする。
  - `settings` / model / effort / 権限モードは、main→agents の launch メッセージに明示フィールドとして載せる。agents の decoder は同じ述語で再検証し、未知キーを捨てる。
  - 上の 4 つは `query()` 時に渡し、`Query.setModel()` / `setPermissionMode()` は使わない (check.mjs 項目 16)。
  - `query()` options のキー集合 (AD-036 §4 P1) に `model` / `effort` を足すことを AD-041 で決める。
  - `settings` は `query()` 直前に 2 キー assert を掛ける (X-3 contracts C-4)。
- **FR-006**: 上流の軸を変えたとき、無効になった下流の値を**既定に戻し UI で通知**しなければならない (charter 不変条件)。
  - folder↔runtime の distro 不一致、存在しない・停止中のフォルダやランタイムは、既定に戻さず**起動不可**にする。
  - Provider が既定に戻った場合は、起動前に確認を求める。
  - **main の起動ゲートでも、最新の facts で同じ依存解決を再評価し**、無効な軸が残っていれば理由キーで拒否する。renderer の善意に依存しない fail-safe とする。
- **FR-007**: 依存解決は**純粋関数**で行い、I/O を持たない。
  - 処理は「上流の値 → 下流の有効集合を再計算 → 無効なら既定 + 通知フラグ / 起動不可フラグ」。
  - renderer と main は同じ関数を呼ぶ。
- **FR-008**: 作業フォルダとランタイムがファイルシステム境界を越える組み合わせでは警告を出す。
  - [AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md) を参照形で消費する。**閾値を置かず、越境は常に警告する。**
  - 判定は既存の解決結果 DTO (`boundary`) を消費し、規則を再定義しない。
  - **警告は起動をブロックしない。**
  - 警告とは別に、同じ DTO の**到達可能性**に応じて起動を止めることがある。この扱いはダイアログが先回りして行い、main は最終的に同じ組み合わせを拒否する (pr-gate R2・R3)。
    - DTO の取得中、および `blocked` のうちランタイムの能力確認前のものは、起動を保留する。
    - `unreachable`、および `blocked` のうち能力確認が失敗したものは、起動不可にする。
    - `blocked` のうちランタイムが停止しているものは、FR-006 の起動不可で扱う。

#### プリセット

- **FR-009**: システムは軸の組み合わせを名前付き**プリセット**として保存・一覧・適用・削除できなければならない。
  - JSON で永続化する。X-3 provider-store と同型の構え (上書き前の退避) をとる。
  - 名前は表示名と同じ述語 (非空・長さ上限・制御文字なし。日本語可) で検証する。この述語は domain に置き、IPC と永続層で共有する。
  - 同名の判定は正規化後の文字列 (前後の空白を除き、NFC に揃えたもの) で行う。同名の保存は、上書き確認のうえで更新する。
  - 件数の上限は 100 件とする。上限に達したら、理由キー付きで保存を拒否し、削除を促す。
  - 保存できるのは folder と runtime が選択済みの config に限る。
  - 一覧は更新日時の降順に並べる。
- **FR-010**: **プリセットに長期資格情報の値・secretRefKey・helper の実体を含めてはならない** (Principle V)。
  - Provider は **id 参照**で持つ。
  - 読み取り時は、キーの allowlist に加えて**起動設定と同じ述語**で値を検証する (write/read 対称)。
- **FR-011**: プリセットを適用した後に無効な軸があれば、FR-006 の依存解決で扱う (プリセットが起動を壊さない)

#### env の配送と config-dir (X-3 繰越)

- **FR-012**: `config-dir` Provider の `CLAUDE_CONFIG_DIR` を、**選択ランタイムの `RuntimePath` へ変換**して注入しなければならない (X-3 の `resolveConfigDirRuntimePath` を実装)。
  - 変換は domain のパス API で行う。host は `fromHost`、UNC は `fromUnc` + 選択ランタイムとの同一 distro 照合。
  - 実変換できないときは null を返し、X-3 deriveEnv の fail-closed に倒す。
- **FR-013**: 導出 env を **WSL 内の `claude` まで届けなければならない**。
  - 起動 env は「curated base (X-1) + 導出 env」の合流とする。
  - **WSL へ転送するキー (`forwardKeys`)** は導出が明示的に返す集合だけとする。中身は次の 3 種類。
    - 方式固有の実名キー (`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` / `AWS_PROFILE` / `AWS_REGION` / `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CONFIG_DIR`)
    - 採用した extraEnv のキー
    - env-passthrough の varNames
  - **curated base のキー (`SystemRoot` / `windir` / `TEMP` / `TMP`) と `WSL_UTF8` は決して転送しない**。design-gate の実測で、`TMP` を転送すると WSL 内の tmpdir が作業フォルダ基準の相対パスになった。
  - アプリが `forwardKeys` から `WSLENV` を生成する。フラグは `/u` だけを使う (パス変換フラグは使わない。値は既に RuntimePath)。
  - `forwardKeys` の中に名前規則 (`^[A-Z_][A-Z0-9_]*$`) に反するキー、または下の転送禁止キーがあれば、捨てずに**起動を拒否**する (`invalid-config`)。
  - extraEnv のキーには、**転送禁止キー**の denylist を掛ける。
    - 対象は以下。照合は**大文字小文字を区別しない**。
      - curated base と同名のキー (集合は infra の `LAUNCH_ENV_ALLOWLIST` から注入し、domain に複製しない)
      - `WSL_UTF8` / `WSLENV`
      - `PATH` / `HOME` / `SHELL`
      - `TMPDIR`
      - `NODE_OPTIONS` / `NODE_PATH` / `LD_*`
      - `BASH_ENV` / `ENV` / `PROMPT_COMMAND` / `IFS` / `PS4`
      - `CLAUDE_CONFIG_DIR`
      - `CLAUDE_CODE_*` / `ANTHROPIC_*` の prefix 全体 (例外として `ANTHROPIC_BASE_URL` だけを実名で許可する)
    - 方式固有キーは導出の注入経路からだけ出す。extraEnv が方式固有キーと衝突したら拒否する。
    - 同じ述語を IPC / provider-record / 起動時の 3 箇所で共有する。
  - extraEnv の値が Windows パスの形 (`^[A-Za-z]:[\\/]` / `^\\\\`) なら、起動を拒否する (`invalid-config`。値の意味をアプリは知らないので変換しない)。
  - **env-passthrough の varNames は実名 allowlist に限る** (USER 決定 2026-09-30 design-gate R3)。
    - allowlist は、検出候補の資格情報名 (`CREDENTIAL_ENV_NAMES`) から `CLAUDE_CONFIG_DIR` を除いたもの。
    - 値は infra がアプリ自身の process.env から取り、方式固有キーと同じ扱い (資格情報 denylist の対象外) で注入する。
    - allowlist の述語は、IPC / provider-record / 導出の 3 箇所で共有する。
    - これは X-3 FR-009 (b)「方式固有注入は実名固定集合」を、実名 allowlist の範囲で広げる読み替えであり、AD-041 (e) に記録する。
  - 親プロセスの env 由来の `WSLENV` は引き続き含めない。資格情報系の denylist は passthrough (curated base と extraEnv) にだけ掛ける (AD-036 §6 の範囲を AD-041 (e) で調停する)。
  - wsl.exe の絶対パス解決には、**合流前の curated base** を使う。
  - **utilityProcess の fork env は curated base のまま**とし、導出 env を入れない。
  - 起動 argv は **`wsl.exe --exec`** にして、シェルを経由させない (design-gate の実測で、`--` 以降は `$(...)` が展開された)。
- **FR-014**: 起動に渡す値に、制御文字と名前空間を失ったパスを通さない (X-3 SEC-L-201 繰越)。
  - helper 系 3 方式 (api-key-helper / aws-credential-export / aws-assume-role) の helperPath を、選択ランタイムの名前空間で分類する。
    - POSIX 絶対パスはそのまま使う。
    - HostPath は PathMapping で変換する。
    - それ以外は拒否する。
  - 分類後の RuntimePath は、文字種の allowlist (`^/[A-Za-z0-9._/+@-]+$`) で照合する。外れれば理由キーで拒否する (空白・括弧・引用符を含むパスは X-4 では使えない)。
  - 分類関数は domain に 1 つだけ置き、**到達可能性判定と起動の両方が同じ関数を呼ぶ**。選択肢には出るが起動で必ず拒否される Provider を作らない。
  - 導出 env の値には、write/read 対称の制御文字拒否を掛ける。

#### 用語 / 継承

- **FR-015**: 導入/変更した用語 (起動軸 / 依存解決 / 越境警告 = Cross-boundary の派生 / SafePermissionMode / Preset) を glossary に反映する (Principle XIV)。あわせて次を追随させる。
  - `LaunchInput` の定義 (安全 3 値・model / effort)
  - `SessionLaunchConfig` の「X-4 は 6 軸」
  - UI ラベルの訳出は `ui` に置く (Principle XV)。
  - session charter の Related Specs と業務ルール (X-4 時点は安全 3 値のみ。上限は X-6)
  - roadmap (X-4 行の「権限モード 6 値」「AD-017」)
- **FR-016**: env 導出・到達可能性・settings 制約の規則は **X-3 の FR を継承**し、再定義しない。例外が 2 つあり、どちらも AD-041 (e) で読み替える。
  - FR-013 の env-passthrough 実名 allowlist (X-3 FR-009 (b) の拡張)。
  - 転送禁止キー (X-3 の `DERIVATION_CONTROLLED_KEYS` を包含する)。起動・ストリーミング・承認往復は **X-1 の FR を継承**する (`## Dependencies` 参照)

### Key Entities

- **SessionLaunchConfig**: 起動時に選択される軸の組。glossary の定義のうち本 feature は 6 軸 (folderId / runtimeId / providerId / modelId / effort / permissionMode) を扱う。folderId / runtimeId は必須で、それ以外は「既定」を取り得る
- **プリセット (Preset)**: 名前付きで保存された `SessionLaunchConfig`。**資格情報の値を含まない** (Provider は id 参照)
- **起動軸の依存グラフ**: folder ↔ runtime → provider → model → effort の依存順 (権限モードは安全 3 値の独立軸)。上流変更で下流を再解決する純粋関数の入出力
- **越境警告**: 作業領域とランタイムの越境を示すメタ (AD-016。glossary の Cross-boundary)
- **起動 env**: curated base + 導出 env の合流と、`forwardKeys` (導出が明示的に返す転送キー) から生成した `WSLENV`
- **DerivedLaunchEnv / HelperSettings**: X-3 の型を消費する (再定義しない)

### Assumptions / Clarifications

- **[USER 決定 2026-09-30]** 権限モードは安全 3 値 (`default`/`plan`/`dontAsk`) のみとし、AD-036 §5 を広げる調停 ADR を起票する。昇格モードの capability 連動は I-3 (FR-004)
- **[USER 決定 2026-09-30]** 範囲はコアのみ。次の項目は後続へ明示的に繰り越す (Out of Scope)。
  - 追加ディレクトリ軸 (X-6)
  - capability スコープ承認の永続化 (I-3)
  - Win32Runtime 直接起動 (X-6)
  - 退避 UI (X-6)
- **[USER 決定 2026-09-30]** モデルは「既定」+ プロバイダ画面での手入力編集 (FR-017)。backend ごとの組込みカタログは持たない (モデル ID の陳腐化を避ける)
- **[USER 決定 2026-09-30 design-gate]** env の配送は「アプリが実名キーだけで `WSLENV` を生成する」(FR-013)
- **[USER 決定 2026-09-30 design-gate]** aws-assume-role helper の生成は **X-7 へ繰り越す**。X-4 の aws-assume-role は X-3 のユーザ供給 helperPath 方式 (`awsCredentialExport`) のまま起動する
- **[ASSUMED]** 権限モードの 6 値と危険度は [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) (SPIKE-6) を正本とする。effort の値は SDK 型 `EffortLevel` を正本とする
- **[ASSUMED]** プリセットの永続先は X-3 と同じ `userData` 配下の JSON (`presets.json`) とする。スキーマ版管理・退避は X-3 provider-store と同型
- **[ASSUMED]** ダイアログの UI element 選定・見た目・ラベル訳出は `ui` domain の領分とする (本 spec は「何の軸をどの順で解決するか」まで)
- **[USER 決定 2026-09-30 design-gate R3]** env-passthrough Provider は X-4 で実配線する。varNames は実名 allowlist に限り、値はアプリの process.env から取る (FR-013)
- **[USER pr-gate R1]** X-4 では read 側の検証を強めた。対象は extraEnv の転送禁止キー、extraEnv のキー数の上限、varNames の allowlist、モデル ID の文字種、モデルカタログの root キーである。これに反する既存の providers.json レコードは、X-3 の provider-store と同じく退避したうえで読み込まない。
  - 件数・理由キー (`invalid-record` など)・退避パスをログに出す。値と名前は出さない。
  - ProviderScreen に 1 行だけ表示する。レコード単位なら件数を出す。ファイル全体 (parse 失敗 / 将来版) なら「保存ファイルを読み込めなかった」と出し、件数は出さない。
  - この表示が出るのは、次に providers.json を書き換えて再起動するまでの間である。それ以降の手がかりは `.bak` だけになる。
  - 退避ファイルの一覧と復元の UI は X-6 で扱う。
  - 初期の製品なので、移行処理は持たない。
  - 当初は design-gate R3 の [ASSUMED]「ログのみ。UI は X-6」だった。これを利用者が pr-gate R1 で上の形に決めた ([AD-042](../../docs/decisions/0042-provider-type-refinement-and-d4-lapse.md) Decision 4)
- **[条件 design-gate R2]** SH-000 で `--exec` が成立しなかった場合、代替は「`--exec /bin/sh -c '<固定リテラル>' <claudePath> ...`」(位置引数を引用し、`eval` しない) だけとする。
  - その固定リテラルは `check.mjs` 項目 6 に登録する。
  - 項目 6 は現状 stdin への書き込みしか照合しないので、次の改修を伴う。
    - entry ごとに入口の種類 (`stdin` / `argv-c`) を持たせ、入口ごとに照合する。
    - `-c` の直後の引数が定数の識別子そのものであることを検査する。
  - 登録と改修はどちらも AD-041 (f) の分岐として記録する。「`--` を維持してメタ文字なしを assert」は採らない (`--settings` の JSON が必ず `"{}` を含むため)
- **[実測 2026-09-30 design-gate]** Node `spawn` (shell なし) で `wsl.exe` を起動して確かめた。
  - `-- printf '%s' '<json with $(echo X)>'` では `$(...)` が展開され、バックスラッシュが消えた。
  - `--exec` では引数がそのまま届いた。
  - `WSLENV=K/u` + `--exec` で env が届いた。
  - `--exec` では login shell の PATH が効かない (claude は絶対パスで起動する。X-1 は解決済みの絶対パスを持つ)。

## Success Criteria

- **SC-001**: **到達できない Provider が起動の選択肢に 0 件**であり、Provider を切り替えるとモデル選択肢が差し替わる。計測経路: 依存解決の純粋関数の単体 + E2E (到達不可 Provider が出ない / Provider 切替でカタログが変わる)
- **SC-002**: **上流の軸を変えると、無効な下流が既定に戻って通知される。無効値のまま起動される経路が 0 件。** 計測経路:
  - 依存解決の純粋関数の単体 (上流変更 → 既定 + 通知 / folder↔runtime 不一致 → 起動不可)
  - **main 起動ゲートの単体** (無効な model / effort / 不一致を含む config は理由キーで拒否)
  - E2E (charter KPI「依存解決の正しさ」)
- **SC-003**: **プリセットに秘密値が現れない。** プリセット JSON 上の api-key 平文 / secretRefKey / helper 実体が 0 件。計測経路: プリセット永続層の単体 (ラウンドトリップで秘密非混入を assert) + `check.mjs` 項目 17 の走査範囲 (`infra/settings/`)
- **SC-004**: **プリセットのラウンドトリップが軸を保ち、読み取り側の検証が書き込み側と一致する。** 計測経路:
  - 永続層の単体 (保存 → 読込 → 適用で全軸が復元される)
  - `checkPreset` と preset-record の境界値テスト (昇格モード・不正 id を両者が同じく拒否)
  - プリセットの保存・適用の E2E 1 本
- **SC-005**: **昇格モードが起動経路に 0 件。** 権限モードの選択肢と `query()` に渡る値が `{default, plan, dontAsk}` に閉じる。計測経路:
  - `buildQueryOptions` の単体 (安全 3 値外は throw)
  - agents の launch decoder の負例
  - `QUERY_OPTION_KEYS` を AD-041 の集合に固定する pin テスト
  - `check.mjs` 項目 16 の違反 fixture (assert を通らない `permissionMode` / shorthand)
- **SC-006**: **WSL 内の `claude` から見た `CLAUDE_CONFIG_DIR` が、選択ランタイムの RuntimePath になる**。変換不能なら起動が拒否される。計測経路:
  - `resolveConfigDirRuntimePath` + deriveEnv の単体
  - quickstart の実機観測 (起動したセッションの transcript が、選んだ config dir 配下に書かれる)
- **SC-007**: **`forwardKeys` だけが WSL 内の `claude` に届き、それ以外は届かない。** 計測経路:
  - 起動 env を組み立てる純粋関数の単体。次を assert する。
    - `WSLENV` の各要素 = `forwardKeys` の各キー + `/u`
    - curated base のキーと `WSL_UTF8` が 0
    - 親 env の `WSLENV` が 0
    - 転送禁止キーを含む extraEnv は拒否される
    - extraEnv の `SystemRoot` 上書きは wsl.exe の解決に効かない
  - `prepareLaunch` の単体 (fork env に導出キーが 0)
  - quickstart で、同じ spawn 経路から distro 内の値を観測する (`forwardKeys` は見え、`TMP` / `TEMP` は空)
- **SC-008**: **越境する組み合わせで警告が出て、起動はブロックされない。** 計測経路: renderer 単体 (cross → 警告表示 / 起動ボタンは有効)
- **SC-009**: **起動が X-1 の launch を再利用し、起動 argv がシェルを経由しない。** 計測経路:
  - 起動が X-1 の launch service を呼ぶことを fake で確認する単体
  - `buildRuntimeLaunchSpec` の単体 (`--exec` 形 / シェルメタ文字を含む model ID が argv に届いても展開されないことの実機 leg を quickstart に置く)
- **SC-010**: **モデルカタログの手入力編集が reload で消えず、不正なモデル ID は両側で拒否される。** IPC 形状検証を通った `models` (対応 effort 含む) は、必ず永続層の検証も通る。計測経路: `checkProviderDraft` / `checkProviderPatch` と `provider-record` の境界値テスト (同一入力で両者の判定が一致。メタ文字を含む ID は両者とも拒否)

## Dependencies

- **X-1** ([005](../005-session-launch-and-streaming/spec.md)): 単一セッション起動・ストリーミング・承認往復・env 許可リスト枠組み (FR-006) を**継承**する。X-4 は launch を再利用し、新経路を作らない
- **X-3** ([007](../007-provider-registration-and-reachability/spec.md)): 次を**消費**する。
  - `deriveEnv` / `listReachableProviders` / `assessReachability` / `HelperSettings` (AD-040) / モデルカタログ型
  - X-3 が X-4 帰属と確定させた X-3 FE-010 (Provider 選択 UI・カタログ面) / config-dir 配線を、ここで実装する
  - X-3 BE-020 の helper 生成は X-7 へ繰り越す
- **isolation**: 権限モードの capability 判定 (Principle III)。本 domain で再定義しない
- **AD-041 (本 feature で起票する調停 ADR)** の決定範囲:
  - (a) AD-036 §5 の `default` 固定を安全 3 値の allowlist に広げる。
  - (b) X-1 SC-006(a) の `dontAsk` 禁止と、SC-006(b)(c) / 005 contracts C-5 / data-model §7 の「最終 env に `WSLENV`・資格情報 0」を読み替える。
    - passthrough は許可リストと完全一致させる。
    - 転送キーは `forwardKeys` の規則に従い、`WSLENV` はアプリが生成したものだけとする。
    - 資格情報の注入は wsl.exe の spawn env に限り、fork env と argv では 0 とする。
  - (c) 昇格モードの capability 連動を I-3 へ回す。
  - (d) AD-017 / AD-025 の作業領域軸の帰属を X-4 から I-1 へ付け替える。
  - (e) env の配送 (実名 `WSLENV` 生成)。読み替えの範囲は次のとおり。
    - AD-036 §6 を passthrough の denylist に限定する。
    - X-3 FR-009 (a)(b)、007 contracts C-5、AD-039 調査結果 §3 の env-passthrough を、実名 allowlist の転送として読み替える。
    - 2 つの denylist の役割分担を書く。`LAUNCH_ENV_DENY_PATTERN` は passthrough の資格情報を、転送禁止キーは実行の乗っ取りと transport の制御キーを担う。
  - (f) 起動 argv を `--exec` にする。読み替える箇所は AD-015 §2 / §5 / §7、AD-036 §3 (prefixArgs)、005 data-model §8。
  - (g) AD-036 §4 P1 に `model` / `effort` を足す (AD-040 の Consequence「`default` リテラル固定」を読み替える)。
  - (h) 繰越先の指名 (X-6 / X-7 / I-3 / O-3)。
- 関連 ADR:
  - [AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md) (越境警告)
  - [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) (権限モード・effort の列挙)
  - [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) §4-§6 (起動の権限ゲートと env)
  - [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) (settings 制約)

## Out of Scope

- **transcript / tool 出力の描画・承認カードの見た目・監視ビューの element 選定** → `ui` domain (本 domain はデータ供給まで)
- **マルチセッションの並列差配・supervisor 分離・`requestId` の予測不能化** → **X-5**
- **Provider の登録・認証方式の管理** → `provider` domain (X-3。X-4 は登録済み Provider を id 参照で消費する)
- **aws-assume-role helper の生成 (`RoleSessionName` によるCloudTrail 追跡)** → **X-7** (USER 決定。X-4 は X-3 のユーザ供給 helperPath で起動する)
- **コンテナ起動・権限モードのゲート実体** → `isolation` domain
- **昇格モード (`acceptEdits`/`auto`/`bypassPermissions`) の capability 連動提示**、および**承認カードの `scope: 'capability'` の永続化とプリセット反映** (X-1 FR-012 の繰越) → **I-3**
- **コンテナの作業領域戦略軸** ([AD-017](../../docs/decisions/0017-container-workspace-strategy.md) の clone-ephemeral / bind) → **I-1**
- **glossary の `SessionLaunchConfig` の残りの軸**、**Win32Runtime での直接起動**、**fork / resume / rename / tag / delete**、**providers.json / presets.json の退避・版不一致の UI 通知** → **X-6**
  - 残りの軸は、追加ディレクトリ / 上限 / セッション名 (sandbox は I-3)。
  - Win32Runtime 直接起動は X-1 research R-05 / plan B-4 の繰越。
- **charter KPI「再利用率」の計測 (ローカル利用ログ)** → **O-3** (Thread 検索と observability)。本 feature は計測基盤を持たないため、KPI の計測経路は O-3 が作る
- **プリセットの共有・エクスポート/インポート** → 持ち主未定。M2 の完了時に roadmap の Optional scope へ登録するかを判断する (本 feature はローカル保存のみ)
