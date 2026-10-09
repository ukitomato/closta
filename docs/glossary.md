---
status: needs-human-review
last_updated: 2026-10-08
generated_by: human (PLAN.md 付録A + §3〜§7 を素材に起草。X-1 で AgentSession 系 8 語を追記。O-2 で 5 語を追記。O-7 で Shell を追記。O-3 で 5 語を追記。O-4 で 4 語を追記)
total_terms: 96
---

# Glossary (Ubiquitous Language)

このプロジェクトで使用する **Domain 用語** の SSoT。すべての spec / code / UI / docs で
本 glossary 記載の用語を一貫使用する（Constitution Principle XIV）。

新規用語は本ファイルへ追記後、`architecture-reviewer` / `po-reviewer` が drift を検出する。

## Conventions

- **Canonical**: コード識別子は英語（Principle XV）。本 glossary の見出しは canonical な英語表記とする
- **日本語表記**: ドキュメントと UI では日本語を第一言語とするため、対応する日本語表記を併記する
- **Domain**: 主に使われる domain。複数にまたがるものは "Cross-domain"

## Canonical Terms

### A

#### **AgentRuntime**

- **Definition**: Claude Code プロセスを起動する場所と方法を表す**インタフェース**。
  `descriptor` (検出された事実) と `path` (ランタイム名前空間のパス操作) を持つ。
  シングルトンではない。`DirectRuntime` / `WslRuntime` / `Win32Runtime` / `DockerRuntime` の 4 実装を持つ
- **Counterexamples (型)**: 検出結果そのものは `RuntimeDescriptor` である。
  「検出結果から生成される値」と書くと両者が同じものに読める
- **日本語表記**: ランタイム
- **Domain**: `runtime`
- **Counterexamples**: 「プラットフォーム」（posix / win32）は軸として持たない。
  ホストが Windows でもコンテナ内は Linux でありうるため。
  assistant-ui の runtime (`useExternalStoreRuntime` などの会話の状態の層。`AssistantRuntimeProvider`) ではない — renderer の文書で
  「runtime」と書くときはどちらかを明記する (O-7)
- **Ref**: [AD-003](decisions/0003-runtime-abstraction-by-transport.md)

#### **AgentSession**

- **Definition**: 稼働中の 1 セッションの**操作面の概念 interface** (X-1)。`start(input)` で起動 + stream し、
  `sendPrompt` / `respondPermission` / `interrupt` / `end` / `kill` を持つ (操作語彙は `SessionControl` と一致させる。
  X-5 で `stop()` を削除)。**宣言は `domain`**。**実装はクラスでなく `agents` の セッションスレッド
  (`sdk-agent-session.ts` を `worker_threads` の Worker として起こしたもの)** が、調停役スレッド経由の制御 +
  本文 (`SessionEvent`) のメッセージプロトコルで実現する (`query()` を呼ぶ唯一の場所。X-5 / AD-043)
- **日本語表記**: セッション (型名は原語のまま)
- **Domain**: `session` (宣言) / `agents` (実装 = セッションスレッド)
- **Note**: [AD-023](decisions/0023-application-architecture.md) §3 の例示 (`stop()`) は X-5 で古くなった (AD-043 Decision 1)
- **Counterexamples**: `Session` (Claude Code の 1 会話・永続実体) とは別。あちらは会話ログ、
  こちらは稼働中プロセスの操作面。プロセス実体は **supervisor** を参照
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) / [AD-023](decisions/0023-application-architecture.md) §3

#### **Approval card**

- **Definition**: `canUseTool` の permission 要求に応答する UI。単発承認と capability 付与を区別する
- **日本語表記**: 承認カード
- **Domain**: `ui`（状態は `session` が持つ）

#### **autoModeSafe**

- **Definition**: そのランタイムで無人実行（Auto / `bypassPermissions`）を許してよいかを示す
  `capabilities` の一項目。**3 値** (`true` / `false` / `unknown`) を取る
- **判定の唯一の経路**: `isAutoModeAllowed()`。条件は `=== false` ではなく **`!== true`** である。
  `unknown` は JavaScript で truthy なので、生の値で真偽判定すると未確認のランタイムが安全側に倒れない
- **Domain**: `runtime`（表明）/ `isolation`（ゲート）
- **Ref**: Constitution Principle III / [AD-024](decisions/0024-constitution-verification-paths.md) #13

#### **Axis resolution（依存解決）**

- **Definition**: 起動軸の上流 (folder ↔ runtime → provider → model → effort) を変えたときに、無効になった下流を再計算する処理。
  - 無効な provider / model / effort は既定に戻して通知する。provider の reset は起動前に確認する。
  - folder / runtime の不備は blocker にする。
  - 純粋関数 `resolveLaunchAxes` を renderer と main の起動ゲートの両方が呼ぶ。
- **日本語表記**: 依存解決
- **Domain**: `session`
- **Ref**: [008 spec](../specs/008-session-launch-settings-dialog-and-presets/spec.md) FR-006 / FR-007

### B

#### **Background task（バックグラウンドタスク）**

- **Definition**: Claude Code が背景で走らせる task (SDK の `task_started` で `is_backgrounded: true`)。O-2 は
  transcript に **task ごとに 1 行**のシステムイベントの行として出し、状態 (実行中・完了・失敗など) を同じ行で書き換える
- **日本語表記**: バックグラウンドタスク
- **Domain**: 外部概念 (SDK)。表示は `ui`。**状態の一覧は持たない** (session も ui も task の状態の表を保持しない。
  1 行の状態は transcript のメッセージの中にだけある。O-2 USER 決定 2026-10-03)
- **Counterexamples**: 前景の task (`is_backgrounded` が true でない。subagent の呼び出しなど) は行にしない — 既存の表示
  (Subagent・tool の結果) がある。実行中の task の一覧 (`background_tasks_changed`) は O-6 で要否を判断する
- **Ref**: [011 spec](../specs/011-ui-coverage/spec.md) FR-008 / FR-009

#### **Browse session**

- **Definition**: WSL 側のフォルダを列挙するために、実行状態の確認 (`VerifiedRunning`) を
  再利用する期間。**上限 30 秒**。1 回のブラウズ操作ごとに `wsl.exe` を呼び直さないためにある
- **日本語表記**: ブラウズセッション
- **Domain**: `runtime`
- **Counterexamples**: `Session` (Claude Code の 1 会話) とは**別概念**である。
  UI 文言では「フォルダを参照している間」であることが分かる表現を使い、単に「セッション」と書かない

### C

#### **capabilities**

- **Definition**: `AgentRuntime` が提供する能力。`sandbox` の種別と `autoModeSafe` の可否に加え、
  `probeState` (未実施 / 実施中 / 実施済み / 失敗) / `seccompFilter` /
  `missingDependencies` / `probedAt` を持つ
- **Counterexamples**: 項目の欠落を「問題なし」と読まない。実地判定を経ていない状態は
  `probeState` が表し、`autoModeSafe` は `unknown` になる
- **Domain**: `runtime`

#### **Closta**

- **Definition**: 本プロダクトの名称。cloister（回廊）の縮約による造語。
  中庭を囲んで独立した房が並び中央から全体を見渡せる構造に由来し、
  隔離・俯瞰・差配の 3 要素を 1 語に含む
- **Domain**: Cross-domain
- **Ref**: [AD-014](decisions/0014-product-name-closta.md)

#### **Cross-boundary**

- **Definition**: 作業フォルダの所在とランタイムが別のファイルシステムにまたがる状態。
  `C:\dev\x` を WSL から `/mnt/c/dev/x` として使う形が典型である。
  変換自体は成立するが I/O が桁で遅くなるため、選択時に明示する。
  起動設定ダイアログが越境の組み合わせで出す警告を**越境警告**と呼ぶ (閾値なし。起動はブロックしない。X-4)
- **日本語表記**: 越境 / 越境警告
- **Domain**: `runtime` (判定) / `ui` (表示)
- **Ref**: [AD-016](decisions/0016-cross-filesystem-performance-cliff.md)

#### **CwdOrigin（作業ディレクトリの出自）**

- **Definition**: セッションに記録された作業ディレクトリの**値の形**から判定した名前空間と所在。
  `host` / `wsl-from-unc` / `wsl-inherited` / `unknown-location` / `undetected-distro` / `absent`
  の 6 値
- **日本語表記**: 作業ディレクトリの出自
- **Domain**: `session`
- **Counterexamples**: **由来 config ディレクトリの所在と混同しない。**
  **指示代名詞で書かない** — 「前者 / 後者」はどちらを指すか決まらず、
  この区別は本 feature で**最も誤りやすい**ものとして Principle XIV の対象に挙げられている
  (plan.md)。実名で書く。
  - **由来 config ディレクトリの所在** (`EnumerationTarget.location`) =
    「履歴が**どこに保存されているか**」。**アプリが選ぶ** (FR-009)
  - **`CwdOrigin` の所在** = 「セッションが**どこで動いたか**」。
    **記録された値から判定する** (FR-016)

  **この 2 つは一致しない。** 実測でホスト側の 1 つの config ディレクトリに
  3 形式（Windows / POSIX / UNC）が混在した。
  正本は [data-model.md](../specs/002-session-cross-folder-session-enumeration/data-model.md) §4 の表である
- **Ref**: [AD-029](decisions/0029-session-cwd-origin-classification.md)

#### **Composer**

- **Definition**: メッセージ入力欄。assistant-ui の `ComposerPrimitive.Input` を用い、変換確定の Enter を送信に
  しない (IME の二重ガードは assistant-ui 側。**自前ガードを新設しない**)。実行中の入力積み (Message queue) と
  下書き (Draft) を持つ (X-2)
- **日本語表記**: コンポーザ / 入力欄
- **Domain**: `ui`
- **Counterexamples**: `ComposerPrimitive.Input` を独自 `<textarea>` に差し替えない (既存 IME ガードを殺すため。AD-037 D1)
- **Ref**: [AD-037](decisions/0037-japanese-ime-composer-behavior.md)

#### **CredentialSource**

- **Definition**: Provider の認証方式。9 種類あり、それぞれ「アプリが秘密を持つか」が定義されている。
  推奨は `api-key-helper` と `aws-credential-export`
- **Domain**: `provider`
- **Ref**: [AD-011](decisions/0011-delegate-credential-resolution.md)

#### **CredentialRef**

- **Definition**: `CredentialSource` を**非秘密の参照**で精緻化した判別 union (X-3。data-model §2)。
  `api-key`/`oauth-token` は `safeStorage` 参照キー (`secretRefKey` = 暗号化 ciphertext)、helper 系は helper パス、
  `aws-profile` は profile 名のみを持つ。**秘密の実体はどのメンバにも現れない** (Principle V)。`CredentialSource`
  が「どの方式か」の enum であるのに対し、`CredentialRef` は「その方式の非秘密メタ」を担う
- **Domain**: `provider`
- **Counterexamples**: `CredentialSource`（方式の enum）/ 平文秘密（`CredentialRef` は持たない。値は safeStorage へ）
- **Ref**: [AD-005](decisions/0005-provider-as-registrable-value.md) / [007 spec](../specs/007-provider-registration-and-reachability/spec.md)

#### **Concurrency limit（同時実行数の上限）**

- **Definition**: 同時に動かせるセッションの上限 (X-5)。**10 に固定**。枠は起動要求の予約で占め、`claude` が
  終わるまで占め続ける (応答待ちの `done` と中断済みも数える)。超過した起動は `session-limit` で拒否する
- **日本語表記**: 同時実行数の上限
- **Domain**: `session`
- **Counterexamples**: **SessionLaunchConfig の「上限」軸 (コスト・ターン数。X-6) とは別物**
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 3

#### **Coordinator thread（調停役スレッド）**

- **Definition**: supervisor の主スレッド (X-5)。main (または標準入出力) との制御のやり取り、セッションスレッドの
  起動と終了、状態通知のバッチ化、本文の中継を受け持つ。**本文を JSON として解釈しない**。経路 (Electron /
  標準入出力) を知らず、本文の出口は transport が作る
- **日本語表記**: 調停役スレッド
- **Domain**: `session` / `agents`
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 1・2

#### **Command palette（コマンドパレット）**

- **Definition**: Ctrl+K で開く、アプリ全体のモーダルのダイアログ (O-3)。語で操作とセッションを絞り込み、キーボードだけで実行する。
  - 操作は 1 か所の表 (`features/shell/palette-commands.ts`) に置く: 新規起動・設定の各項目・サイドバー / 右のペインの畳み・開き・会話内検索・transcript の情報密度の切り替え。
  - セッションの候補は、セッションの検索 (Thread search) と同じ一致の規則で一致した稼働中と過去のセッション。種別 (稼働中 / 過去) を添える。
  - シェルの部品 (`features/shell/CommandPalette.tsx`) で、開いている間は「見ているセッション」(`watchedId`) を null にする。
- **日本語表記**: コマンドパレット (ダイアログの名前は「コマンド」)
- **Domain**: `ui`
- **Counterexamples**: セッションの候補の実行は session のストアの選択の操作 (`select` / `sessions.select`) を呼ぶだけで、中央の `focus` を書かない
  (書くのはシェルの `useShellFocus`。例外は [ui charter](domains/ui/charter.md) の「面の状態」)。同じ会話の稼働中と過去の候補を 1 つに結ばない —
  稼働中の id はアプリが振る値で、過去の行の `sessionId` (Claude Code のセッションの id) とは名前空間が違う
- **Ref**: [012 spec](../specs/012-ui-thread-search/spec.md) FR-006 / FR-007 / [data-model](../specs/012-ui-thread-search/data-model.md) §3

#### **Conversation search（会話内検索）**

- **Definition**: 中央に出している会話 (過去ログ・実行中) の transcript の本文を語で検索し、一致した箇所へ移る機能 (O-3)。
  - 中央のヘッダの検索のボタンと Ctrl+F で開き、中央のヘッダの下に検索のバーを出す。一致の件数と現在の位置 (n / m) を出し、次 / 前で移る。
  - 対象は user / assistant のメッセージの `text` part の本文だけ。仮想化で描かれていない範囲の一致にも移る。
  - 強調は CSS Custom Highlight API で、描かれた DOM を書き換えずに掛ける。
- **日本語表記**: 会話内検索
- **Domain**: `ui`
- **Counterexamples**: **セッションの検索 (Thread search) とは別** — あちらは一覧の要約行を絞り込み、transcript の本文を読まない。
  tool の入力・結果・Reasoning・システムイベントの行は対象にしない。ブラウザの検索 (`findInPage`) ではない (仮想化の外に届かない)
- **Ref**: [012 spec](../specs/012-ui-thread-search/spec.md) FR-003〜FR-005 / [data-model](../specs/012-ui-thread-search/data-model.md) §2

#### **Context usage estimate（コンテキストの使用量の推定）**

- **Definition**: 実行中のセッションのコンテキストがどれだけ埋まっているかの推定 (O-4)。主ループの最後の assistant のメッセージ
  (1 回の API 呼び出し) の入力側の usage (入力 + キャッシュの読み込み + キャッシュの作成) を、result の `modelUsage` の主モデルの
  `contextWindow` で割る。中央のヘッダの目盛りに割合で出す (element 名は Context display)。80% で注意の見た目、100% を超えたら「100% 以上」
- **日本語表記**: コンテキストの使用量の推定
- **Domain**: `ui` (表示)。材料の運び方は `session` (Meter の `context` と `turn`)
- **Counterexamples**: Claude Code の `/context` の値そのものではない — 制御要求 `get_context_usage` を呼ばず、カテゴリ別の内訳は出さない。
  result の `usage` (ターン内の往復の合算でありうる) は使わない。subagent の文脈は入らない。主モデルの照合の規則の正本は 014 data-model §4
- **Ref**: [AD-047](decisions/0047-session-meter-and-failure-reasons.md) Decision 4 / [014 data-model](../specs/014-ui-metering-and-limits/data-model.md) §2 / §4

### D

#### **Density（情報密度）**

- **Definition**: 監視ビュー (稼働中セッション一覧) の行の表示の詰め方 (O-1)。`comfortable` (X-5 の行の情報に経過時間と
  直近の活動を足す) と `compact` (状態・作業フォルダの表示名・経過時間と行の操作を 1 行に並べる) の 2 値。
  識別子は `density`。renderer の表示状態であり永続化しない (既定は `comfortable`)
- **日本語表記**: 情報密度
- **Domain**: `session` (監視ビューは session の操作 UI)
- **Counterexamples**: transcript の表示の密度 (Transcript density。O-2 の `ui`) とは別の値で、切り替えも別。`compact` でも隔離バッジ (Isolation badge。I-x) は行に残す
- **Ref**: [010 spec](../specs/010-session-monitoring-view/spec.md) FR-008 / FR-009

#### **DetectedCandidate（検出候補）**

- **Definition**: 検出で得た**登録前の候補** (X-3)。`config dir` / `aws profile` / `env passthrough` の 3 由来を持つ。
  **提示のみで自動登録しない**。**env の秘密「値」を持たず、変数名・存在・所在のメタのみを運ぶ**
- **日本語表記**: 検出候補
- **Domain**: `provider`（検出 I/O は `infra`、正規化は `domain` の純粋関数）
- **Counterexamples**: `ProviderProfile`（登録後の実体）とは別。候補は登録の明示操作を経て初めて `ProviderProfile` になる
- **Ref**: [007 spec](../specs/007-provider-registration-and-reachability/spec.md) / charter Journey 1

#### **DerivedLaunchEnv（導出 env）**

- **Definition**: `ProviderProfile` と `infra` が解決した値から導出する `{ env, forwardKeys, settings? }` (X-3 / X-4)。
  - `env` は curated base を spread したもの。passthrough (curated base と extraEnv) には資格情報 denylist を掛ける。
  - `forwardKeys` は WSL へ転送するキー (X-4)。中身は方式固有の実名キー、採用した extraEnv、env-passthrough の実名 allowlist で、curated base のキーは含まない。
  - `settings` は **`HelperSettings` (`{ apiKeyHelper?, awsCredentialExport? }` の 2 キー限定)** であり、`Settings` 全体は組めない。
- **日本語表記**: 導出 env（型名は原語のまま）
- **Domain**: `provider`（`deriveLaunchEnv` は純粋関数。I/O は `infra` が解決し引数で渡す）
- **Counterexamples**:
  - `RuntimeLaunchSpec.env`（起動 spawn の最終 env）とは別物である。
  - X-4 は導出 env を `composeLaunchEnv` で `RuntimeLaunchSpec.env` に合流させ、`forwardKeys` から `WSLENV` を生成する。
  - `Options.env` は、AD-036 §3 の custom spawn の下では無視される。
- **Ref**: [AD-040](decisions/0040-provider-settings-constrained-projection.md) / [AD-039](decisions/0039-credential-delegation-verified.md) D3 / [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (b)(e)

#### **Disposable container**

- **Definition**: セッションに紐づき、終了時に破棄されるコンテナ。
  「永続環境を構築しない」という原則の**唯一の例外**として管理対象になる
- **日本語表記**: 使い捨てコンテナ
- **Domain**: `isolation`
- **Counterexamples**: 永続コンテナ、Docker **イメージ**。いずれも管理対象外
- **Ref**: [AD-008](decisions/0008-no-persistent-environment-provisioning.md)

#### **Draft（下書き）**

- **Definition**: composer の未送信の入力テキスト。**メモリ内限定**で保持し、Thread 再構成をまたいで復元する
  (X-2 / FR-007)。送信・明示クリアで空になる
- **日本語表記**: 下書き
- **Domain**: `ui`
- **Counterexamples**: 永続層・IPC 境界・ログに出さない (会話由来ペイロード。Principle V / FR-008)。
  アプリ再起動をまたぐ永続復元は本 feature 外
- **Ref**: [AD-037](decisions/0037-japanese-ime-composer-behavior.md) D2

### E

#### **Element**

- **Definition**: assistant-ui が提供する UI 部品。202 種（2026-09-13 確認）
- **Domain**: `ui`
- **Counterexamples**: 自作コンポーネント。同等の element が存在する場合は自作しない（Principle XIII）
- **Note (R-4)**: Tier A の tool 専用表示名 **Terminal block / Code diff / Todo list / Agent plan** は
  PLAN.md §4.2 由来の Element 名 (canonical) であり、R-4 で `.aui.tsx` として実装した (登録名は
  registry の `elements-terminal-block` / `-code-diff` / `-todo-list` / `-agent-plan`。[AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md))。
  Subagent の入れ子は **Subagent group** を参照

#### **EnumerationTarget（列挙対象）**

- **Definition**: セッション列挙の対象となる**所在と config ディレクトリの組**。
  不透明な `key` / 所在 / config ディレクトリ（所在の名前空間）/ 由来 / 表示用ラベルを持つ
- **日本語表記**: 列挙対象
- **Domain**: `session`
- **Counterexamples**: 1 つの所在に**複数**ありうる（ディストロ内の複数ユーザ分）。
  「所在ごとに 1 つ」ではない。R-2 は所在ごとの既定のみを対象にし、
  複数 Provider 分は X-3 で集合を差し替える
- **表示用ラベルの規則**: 候補集合の中で**一意かつ非空**にする（FR-052）。
  正規化で空になった候補は `候補 #n`、同じ表示になる候補は `名前 (#n)` とし、
  **序数は `targetKey` の序数と同じ**。一意化は生成後の集合に対して閉じている
  （生成名が実在の候補名と一致する場合はさらに序数を足す）
- **Ref**: [AD-028](decisions/0028-session-enumeration-process-and-unc-handoff.md)

#### **Coverage（索引をどこまで信じてよいか）**

- **Definition**: セッション索引について**件数と空状態を断言してよいか**を表す 3 値。
  `pending`（まだ出そろっていない）/ `partial`（出そろったが読めない所在か
  打ち切った所在がある）/ `complete`（全部読めた）
- **日本語表記**: 索引の網羅度
- **Domain**: `session`（判定は `ui` の純粋関数。境界は渡らない）
- **Counterexamples**: `SessionIndexDTO.complete` と**同じではない**。
  あちらは「**全所在を試した**」であり、失敗があっても真になる。
  `complete` を「全部読めた」と読むのが Round 1〜3 の欠陥の根だった
- **Ref**: `src/renderer/src/features/session-list/labels.ts`

#### **opaque-unc（解析できない UNC 形）**

- **Definition**: 区切り 2 本以上で始まるが、実測された 2 綴り
  （`\\wsl.localhost\` / `\\wsl$\`）として解析できない値の形。
  **所在も表示値も持たない**（`unknown-location` に落ちる）
- **日本語表記**: 解析できない UNC 形
- **Domain**: `runtime`（`RawPathShape` の 1 値）
- **Counterexamples**: 「UNC ではない」ことを意味しない。
  `\\?\C:\dev` のようなデバイス名前空間接頭辞もここに入るが、
  これはサーバ名も共有名も持たないので FR-042 の対象ではない。
  **表示値を落とすのは「構造が読めない」からであって「UNC だから」ではない**
- **Ref**: [AD-032](decisions/0032-unc-shape-classification-by-separator-count.md)

#### **endpoint**

- **Definition**: `DockerRuntime` が docker CLI に到達する経路。
  `host`（Docker Desktop / ネイティブ）と `wsl:<distro>`（WSL 内 Docker Engine）がある。
  後者は `WslRuntime` の上に `DockerRuntime` が乗る合成になる
- **Domain**: `runtime` / `isolation`
- **Ref**: [AD-012](decisions/0012-docker-control-via-cli.md)

#### **End（終了。穏当な終了）**

- **Definition**: 応答待ち (`done`)・中断済み (`interrupted`)・最初のプロンプト待ち (起動済みで一度も送信していない `launching`) で
  `claude` が生きているセッションに出す操作 (X-5。受け付ける状態の規則は domain の `canEnd`)。最初のプロンプト待ちでは、入力を閉じても
  `claude` が自分から終わらないので期限を待たずに子を止める (会話の履歴がまだ無いので破損の警告は出さない)。それ以外は
  制御 `end` で、プロンプトの入力を閉じて `claude` を正常終了させる。破損の警告は出さない。期限内に終わらなければ
  強制終了に落とし、その旨を `end-forced` で示す
- **日本語表記**: 終了 (操作を指すときは「終了 (穏当)」か `end` を添え、`claude` の終了・アプリの終了と区別する)
- **Domain**: `session` / 表示は `ui`
- **Counterexamples**: 強制終了 (`kill`。途中出力と JSONL の非破損を保証しない) とも、中断 (`interrupt`。`claude` は
  生きたまま枠も空かない) とも別
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 3

### F

#### **FailureReason (起動とターンの失敗)**

- **Definition**: セッションの起動・実行と、実行中のターンの失敗の**理由キー**。18 種 (X-1 の 10 種に O-4 が 8 種を足した)。
  参照キーであり**訳出は `ui`** (Principle XV)。起動の拒否理由には別に `session-limit` / `shutting-down` (X-5) がある
  - 起動と実行の失敗 (X-1): `distro-not-running` / `not-verified-running` / `distro-mismatch` / `claude-not-found` /
    `launch-failed` / `process-crashed` / `stream-protocol-error` / `provider-error` / `interrupt-unavailable` /
    `supervisor-exited`。`supervisor-exited` は X-5 で追加 (supervisor の異常終了でその supervisor の全セッションに付く)。
    セッションスレッドの例外とメモリ上限超過は `process-crashed`
  - ターンの失敗 (O-4): SDK のエラーの result を agents の `classifyResultFailure` が次の 8 つに分ける。どれにも当たらない失敗
    (状態が無い・知らない subtype) は今の `provider-error` (汎用)。条件と評価の順の正本は 014 data-model §1
    - `auth-failed` (認証または権限のエラー) / `billing` (請求またはアカウントの問題) / `rate-limited` (レート制限) /
      `api-error` (API がエラーを返した)
    - `max-turns` (ターン数の上限) / `max-budget` (費用の上限) / `structured-output-retries` (構造化出力の再試行の上限) /
      `execution-error` (実行中のエラー)
  - 再ログインの導線を出すのは `auth-failed` と `provider-error` だけ (`isReloginFailure`)。`rate-limited` は待つことを案内する
- **日本語表記**: 失敗理由 (起動とターンの失敗)
- **Domain**: `session`/`infra` (保持) / `agents` (ターンの失敗の分類) / `ui` (訳出)
- **Counterexamples**: 列挙/transcript 読み取りの `FailureReason` (`@domain/session/target`) とは**別概念**。
  型名の衝突を避け `LaunchFailureReason` として分ける (`@domain/session/agent-session`)。
  ターンの失敗の理由を細かくしても終わり方は変えない — セッションは「失敗」になり、黙って完了にしない (X-1 FR-020 / US-4 AC6)。
  失敗の文字列 (`errors`) と HTTP の状態は運ばない
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) / [AD-047](decisions/0047-session-meter-and-failure-reasons.md) Decision 1 / [014 data-model](../specs/014-ui-metering-and-limits/data-model.md) §1

#### **Forward keys（転送キー）**

- **Definition**: `DerivedLaunchEnv.forwardKeys`。WSL 内の claude へ `WSLENV` (`/u`) で転送する env キーの明示集合。
  - 中身は方式固有の実名キー、採用した extraEnv、env-passthrough の実名 allowlist。
  - curated base のキー (`SystemRoot`/`windir`/`TEMP`/`TMP`) と `WSL_UTF8` は含まない。
- **日本語表記**: 転送キー
- **Domain**: `provider` (導出) / `runtime` (`WSLENV` 生成は infra/runtime)
- **Counterexamples**:
  - 「env のキー全部」ではない。
  - 列挙されないキーは wsl.exe の env にあっても WSL に届かない。
- **Ref**: [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e)

#### **Forbidden forward key（転送禁止キー）**

- **Definition**: extraEnv のキーとして登録・転送してはならない env キーの集合。
  - 対象は次の 3 種類。
    - 実行を乗っ取るもの: `PATH` / `NODE_OPTIONS` / `LD_*` / `TMPDIR` / `GIT_*` / `PAGER` / `EDITOR` / `PYTHON*` / `SSH_ASKPASS` / `NPM_CONFIG_*` など。既知の代表例を塞ぐ denylist であり、クラスを原理的に閉じるものではない
    - transport の制御キー: `WSLENV` / `WSL_UTF8` / curated base
    - 導出が制御するキー: `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_*` / `ANTHROPIC_*`。例外は `ANTHROPIC_BASE_URL`
  - 照合は大文字小文字を区別しない。
  - env-passthrough の varNames はこの集合では縛らず、別の実名 allowlist で縛る。
  - 起動時の最終検査 (`composeLaunchEnv`) では、導出が正当に出す方式固有の実名キーと passthrough allowlist をこの集合から除く。
- **日本語表記**: 転送禁止キー
- **Domain**: `provider`
- **Counterexamples**:
  - `LAUNCH_ENV_DENY_PATTERN` (passthrough の資格情報 denylist) とは別物で、役割も分担している。
- **Ref**: [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e) 2・3

### H

#### **Hook（フック）**

- **Definition**: Claude Code の設定で、セッションのイベント (SessionStart・PreToolUse など) に合わせて走るコマンド。
  SDK は `hook_started` / `hook_progress` / `hook_response` を emit する。O-2 は開始と応答を **1 つの Hook につき 1 行**の
  システムイベントの行 (名前と結果) にし、**出力本文 (stdout / stderr / output) と終了コードは出さない**
- **日本語表記**: フック
- **Domain**: 外部概念 (SDK)。表示は `ui`
- **Counterexamples**: SDK は既定では SessionStart / Setup の Hook だけを emit する。PreToolUse などの Hook を出すには
  query の options (`includeHookEvents`) が要り、そのキー集合は AD-041 (g) で固定されている (一般の Hook の表示は O-6)
- **Ref**: [011 spec](../specs/011-ui-coverage/spec.md) FR-008

#### **HostPath**

- **Definition**: Electron プロセスから見たパス。Windows ではドライブレター形式。
  branded type として `RuntimePath` と型レベルで分離される
- **Domain**: `runtime`
- **Ref**: [AD-004](decisions/0004-branded-path-types.md)

### I

#### **Immersive view（没入ビュー）**

- **Definition**: charter Journey 3 の「1 つを選んで没入ビューに切り替える」の没入ビュー。O-7 以降は、シェルの
  **中央の本体の実行中の Chat** (X-5 の transcript と composer) を指す (O-1 ではセッション画面の表示中セッションのペイン)。新しい画面ではない
- **日本語表記**: 没入ビュー
- **Domain**: `session`
- **Counterexamples**: 監視ビュー (Monitoring view) とは対になる語。監視ビューで行を選ぶと、没入ビューの内容が切り替わる
- **Ref**: [010 spec](../specs/010-session-monitoring-view/spec.md) Key Entities

#### **Isolation badge**

- **Definition**: セッションが隔離境界の内側で動いていることを示す表示。
  `bypassPermissions` で動作中のものは視覚的に区別される
- **日本語表記**: 隔離バッジ
- **Domain**: `isolation`（判定）/ `ui`（表示）

### L

#### **Launch axis（起動軸）**

- **Definition**: 起動設定ダイアログで選ぶ軸。作業フォルダ / ランタイム / Provider / モデル / effort / 権限モードの 6 つ (X-4)
- **日本語表記**: 起動軸
- **Domain**: `session`
- **Ref**: [008 spec](../specs/008-session-launch-settings-dialog-and-presets/spec.md) FR-001

#### **Launch blocker（起動不可）**

- **Definition**: 依存解決 (`resolveLaunchAxes`) が返す、起動を止める理由キー (`LaunchBlocker`)。
  - 値は `folder-unselected` / `folder-missing` / `runtime-unselected` / `runtime-missing` / `runtime-stopped` / `distro-mismatch`。
  - 自動では直さず、次の一手を示して起動ボタンを無効にする。
- **日本語表記**: 起動不可
- **Domain**: `session`
- **Counterexamples**: 軸の reset (既定に戻して通知するもの) とは別物である。越境は警告であり、blocker ではない。
- **Ref**: [008 spec](../specs/008-session-launch-settings-dialog-and-presets/spec.md) FR-006

#### **Launch notice（起動の告知）**

- **Definition**: 起動ダイアログに出す、直前の拒否の理由 (`launch.rejectReason`) と前回の失敗 (`launch.previousFailure`)。
  - 起動せずにダイアログを閉じたとき・中央に出していない失敗したセッションを閉じたときは、古くなるので消す (`dismissLaunchNotice`。呼ぶのは ui のシェル)。
  - 起動の初期値 (`launch.lastConfig` と `launch.lastOrigin`) は含まない (告知を消しても残る)。
- **日本語表記**: 起動の告知
- **Domain**: `session` (保持) / `ui` (消す時機を決める)
- **Counterexamples**: 稼働中の行の失敗の表示 (`FailureBanner` / 行の状態の印) は告知ではない。そちらはセッションを閉じるまで残る。
- **Ref**: [013 data-model](../specs/013-ui-app-shell/data-model.md) §1 (O-7 pr-gate R3 architecture L-203)

#### **Launch preflight reason（起動前段の拒否理由）**

- **Definition**: main の起動前段が起動を拒否するときの理由キー (`LaunchPreflightReason`)。
  - 値は `invalid-config` / `provider-unavailable` / `needs-confirmation`。
  - X-1 の `LaunchFailureReason` と調停由来の理由とあわせて `SessionLaunchRejectReason` を成す。
  - 参照キーであり、訳出は `ui` が行う (Principle XV)。
- **日本語表記**: 起動前段の拒否理由
- **Domain**: `session` (保持) / `ui` (訳出)
- **Ref**: [008 spec](../specs/008-session-launch-settings-dialog-and-presets/spec.md) US-1 AC7

#### **LaunchInput**

- **Definition**: セッション起動の検証済み入力 (X-1 / X-4)。次の要素を持つ。
  - 作業フォルダ / 実行中確認済みの `WslRuntime` / `VerifiedRunning`
  - `options: LaunchQueryOptions`。中身は `permissionMode: SafePermissionMode` と、任意の `model` / `effort` / `settings`
  - 依存解決と main の再検証を通った `SessionLaunchConfig` から作る。
- **日本語表記**: 起動入力 (型名は原語のまま)
- **Domain**: `session`
- **Counterexamples**:
  - `SessionLaunchConfig` (renderer が選ぶ起動設定) とは別物である。
  - `permissionMode` を 6 値ユニオンにしない。昇格 3 値 (`acceptEdits`/`auto`/`bypassPermissions`) は型で持てない (正の構成)。
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) / [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (a)(g)

#### **LaunchOrigin（起動元）**

- **Definition**: 起動の要求に付く計測用の値 (O-3)。`preset` / `manual` の 2 値。数え方の正本は
  [012 spec](../specs/012-ui-thread-search/spec.md) FR-009 と [data-model](../specs/012-ui-thread-search/data-model.md) §4「renderer の起動元」で、要点は次のとおり。
  - 起動ダイアログでプリセットを適用した後の起動は `preset` (適用した後に軸を変えても `preset`)。適用せずに軸を手で変えた起動は `manual`。
  - 適用も軸の手での変更もしていなければ、ダイアログが初期値に出した設定と組の起動元 (`launch.lastOrigin`。前回の設定が無ければ `manual`)。
  - 前回の設定を変えずに起動し直した起動は、その設定と組の起動元を引き継ぐ。
  - main は厳密比較 (`checkLaunchOrigin`) で検証する。欠けている・未知の値でも起動は拒否せず、記録だけを行わない。
- **日本語表記**: 起動元 (UI 文言は「プリセットを適用」/「適用なし」)
- **Domain**: `session`
- **Counterexamples**: `SessionLaunchConfig` の軸ではない — 起動の可否・起動の設定・権限モードに影響させず、プリセットにも保存しない。
  1 度適用した起動元を、アプリを閉じるまでの起動に付けて回らない (引き継ぐのは初期値の設定のまま起動したときだけ)
- **Ref**: [012 spec](../specs/012-ui-thread-search/spec.md) FR-009 / FR-010 / [data-model](../specs/012-ui-thread-search/data-model.md) §4

#### **LaunchUsage（起動の利用記録）**

- **Definition**: 起動元ごとの起動の回数を、ローカルの暦日ごとに持つ記録 (O-3)。
  - ユーザデータディレクトリの `launch-usage.json` 1 つに `{ schemaVersion, days: { "YYYY-MM-DD": { preset, manual } } }` を 90 日分 (鍵の数) 持つ。
  - 起動が受け付けられたとき (`launching`) だけ 1 回足す。数える単位は受け付けた起動の要求。
  - 起動ダイアログのプリセットの欄が直近 30 日の 2 つの回数を出し、session charter の KPI「再利用率」の計測経路になる。
- **日本語表記**: 起動の利用記録
- **Domain**: `session` (永続化層)
- **Counterexamples**: **「ローカル利用ログ」「再利用率の記録」と呼ばない。** 起動ごとの行を追記するログではなく、日ごとの 2 つの回数しか持たない —
  セッション id・プリセットの id と名前・フォルダ・ランタイム・Provider・モデル・日より細かい時刻を記録しない (Principle V)。
  再利用率そのものではなく、その判定の材料である
- **Ref**: [012 spec](../specs/012-ui-thread-search/spec.md) FR-011〜FR-013 / [data-model](../specs/012-ui-thread-search/data-model.md) §4

#### **Location**

- **Definition**: 作業フォルダが**どのファイルシステムにあるか**。
  `{ kind: 'windows' }` または `{ kind: 'wsl', distroName }` を取る
- **日本語表記**: 所在
- **Domain**: `runtime`
- **Counterexamples**: ランタイムではない。同じ所在のフォルダを複数のランタイムから使いうる。
  パスでもない — 同じ `/home/y/p` が `Ubuntu` と `Debian` の両方に存在しうるため、
  パスだけでは所在が決まらない
- **Ref**: [AD-025](decisions/0025-workspace-folder-carries-location.md)

### M

#### **message mapping（メッセージ変換）**

- **Definition**: `SessionMessage[]` → `ThreadMessageLike[]` の**純粋変換**（tool_use ↔ tool_result の
  id 対応づけ・孤児 fallback・system サブ種別の実名割り当てを含む）。**`src/domain/session/` の共有層**に置き、
  I/O を持たない（`ui` からも取得プロセスからも呼べる）
- **日本語表記**: メッセージ変換
- **Domain**: `session`（共有 domain。**assistant-ui を import しない** — DTO 止まり）
- **Counterexamples**: **表示状態（TranscriptView。`ui`）とは別。** 変換は規則、TranscriptView は画面状態。
  DTO → assistant-ui の `ThreadMessageLike` への写しは `ui`（`convert.ts`）が行う
- **Ref**: [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)

#### **Message queue（実行中積み）**

- **Definition**: `running` / `awaiting_permission` 中に積む未送信入力。assistant-ui の native queue
  (`createMessageQueue` / `ExternalThreadQueueAdapter`) が renderer 側の**単一 locus**として保持し、現ターン完了後に
  同一セッションの**次ターン**として送る (X-2 / FR-004・FR-005)。中断で still_queued 維持、error/killed 終端で cancelled。
  X-5 以降は**セッションごと**に保ち、`claude` の終了 (生存フラグ false。終了・強制終了を要求した時点を含む) でも cancelled
- **日本語表記**: メッセージキュー / 実行中積み
- **Domain**: `ui`
- **Counterexamples**: **message mapping (メッセージ変換) とは別物** — こちらは入力欄の積み、あちらは表示への変換。
  `interrupt`→steer はしない (次ターン送信に限る。FR-005)
- **Ref**: [AD-037](decisions/0037-japanese-ime-composer-behavior.md) D2

#### **Meter（計量）**

- **Definition**: 実行中のセッションの「どれだけ使ったか・何に止められたか・今何をしているか」の最新の値 (O-4)。
  `SessionEvent` の種類 `meter` でセッションスレッドから renderer に届き、稼働中のストアの `meters` にセッションごとの最新の値として持つ。
  - 種類 (`type`) は 6 つ: `turn` (費用の累計・ターン数・モデルごとのトークン・拒否の件数) / `context` (コンテキストの使用量の推定の材料) /
    `rate-limit` / `permission-mode` / `thinking` (思考のトークン数) / `tool-elapsed` (tool の経過時間)
  - **運ぶのは数・真偽・列挙・モデルの id・形を検証した tool の id だけ**。会話由来の文字列・エラー文・パスを運ばない
  - 高頻度のもの (思考・tool の経過時間・task の進み具合) はセッションスレッドで鍵ごとに 1 秒に 1 回まで間引く
- **日本語表記**: 計量
- **Domain**: `session` (契約と保持) / 表示は `ui`
- **Counterexamples**: transcript の行ではない (API の再試行・圧縮・権限モードの変化はシステムイベントの行で運ぶ)。
  状態通知 (`SessionStatusUpdate`) に載せない (main を経由しない)。永続化しない — セッションを閉じたら捨て、起動の設定・プリセットに
  書き戻さない。観測点 `receivedMessages` (O-1) に数えない。費用は推定で、請求額ではない
- **Ref**: [AD-047](decisions/0047-session-meter-and-failure-reasons.md) Decision 2 / [014 data-model](../specs/014-ui-metering-and-limits/data-model.md) §2

#### **Monitoring view（監視ビュー）**

- **Definition**: 稼働中セッション一覧 (Running session list) を拡張したもの (O-1)。承認待ち・失敗の強調、
  承認待ちと失敗の件数、枠の使用数、各行の経過時間と直近の活動、情報密度の切り替えを持つ。**新しい画面ではなく**、
  シェル (O-7) のサイドバーの稼働中の区画に置く。session の操作 UI (行の形と強調の出し方は session が決める)。
  **コード識別子は `RunningSessionList` のまま (改名しない)**。監視ビューは O-1 の機能群 (強調・件数・枠の使用数・経過時間・
  直近の活動・密度) を備えた稼働中セッション一覧の呼び名である
- **日本語表記**: 監視ビュー
- **Domain**: `session`
- **Counterexamples**: R-2 の (列挙の) セッション一覧とは別物。全面の監視画面 (カード / グリッド) ではない。
  コードの `RunningSessionsView` (`features/session/running-sessions-view.ts`) は監視ビューではない — 稼働中のセッションを
  シェルの面 (中央・右のペイン) に渡す値 (選択中のセッション・本文の窓・表示名の解決・起動の関数) である (O-7)
- **Ref**: [010 spec](../specs/010-session-monitoring-view/spec.md)

#### **Model catalog**

- **Definition**: Provider ごとに使えるモデルの集合。Bedrock は inference profile ID で pin する
  - 各モデルは任意の `supportedEffortLevels` を持つ (X-4。手入力の静的データで、起動前の effort 選択肢の正本)
- **日本語表記**: モデルカタログ
- **Domain**: `provider`
- **Ref**: [AD-042](decisions/0042-provider-type-refinement-and-d4-lapse.md) Decision 1

### P

#### **PathMapping**

- **Definition**: 2 つの名前空間の間の**接頭辞の対応**。`C:\` ↔ `/mnt/c` の形を取る。
  実地判定の成否とは独立しており、**変換できるかどうかの鍵はこれの有無**である
- **日本語表記**: パスマッピング
- **Domain**: `runtime`
- **Ref**: [AD-015](decisions/0015-wsl-access-strategy.md) / [AD-025](decisions/0025-workspace-folder-carries-location.md)

#### **Pending match（対応づけ保留）**

- **Definition**: 変換材料（`PathMapping`）が無いため、セッションと登録フォルダの対応を
  決められない状態。理由は R-1 の `BlockedReason` と同じ 3 値
  （`distro-not-running` / `capabilities-not-probed` / `probe-failed`）
- **日本語表記**: 対応づけ保留
- **Domain**: `session`
- **Counterexamples**: R-1 が `unreachable` に分類する `path-not-mapped` を**含めない** —
  含めると「解消手順がある」と「対応が無い」が同居する。
  「未登録」「所在不明」とも別である

#### **PermissionRequest / PermissionDecision**

- **Definition**: `canUseTool` の権限往復 (X-1)。`PermissionRequest` は `requestId` / サニタイズ済み `toolName` /
  サニタイズ済み `input` / `scope` (`once` | `capability`)。`PermissionDecision` は `requestId` / `outcome`
  (`allow` | `deny`) / `scope` / 任意 `message`。main が明示述語で enum 検証する (`as` 禁止)
- **日本語表記**: 権限要求 / 権限決定
- **Domain**: `session`
- **Counterexamples**: **`PermissionResult` (SDK 型) と混ぜない。** `PermissionDecision → PermissionResult` の写像は
  純関数 `toPermissionResult` に切り出し、出力を `{behavior, message}` に固定する — `updatedPermissions` /
  `updatedInput` を出さない (正の構成 P2。承認カードが唯一の承認経路)
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) §4 / [AD-020](decisions/0020-sdk-emitted-message-inventory.md)

#### **Preset**

- **Definition**: 名前付きで保存された `SessionLaunchConfig`。**資格情報の値は含まない** (Provider は id 参照)。
  名前は trim + NFC で同名を判定する。上限は 100 件。適用後の無効な軸は依存解決で扱う
- **日本語表記**: プリセット
- **Domain**: `session`
- **Ref**: [008 spec](../specs/008-session-launch-settings-dialog-and-presets/spec.md) FR-009〜011

#### **Provider**

- **Definition**: 認証方式・設定ディレクトリ・モデルカタログを含む**登録可能なエンティティ**。
  コード上の列挙ではなくアプリに登録される値であり、同一バックエンドを複数登録できる
- **日本語表記**: Provider (英字のまま。カタカナの「プロバイダ」は使わない)
- **Domain**: `provider`
- **Counterexamples**: 汎用語としての "Provider"（DI コンテナの provider 等）。
  本プロジェクトでは常に上記の意味で使う
- **Ref**: [AD-005](decisions/0005-provider-as-registrable-value.md)

#### **ProviderProfile**

- **Definition**: `Provider` の実体を表す型。`id` / `displayName` / `backend` / `configDir` / `credential` /
  `models` / `extraEnv` を持つ (`id` / `displayName` が同一 backend 複数登録の識別鍵。型の正本は AD-005)
- **Domain**: `provider`
- **Ref**: [AD-005](decisions/0005-provider-as-registrable-value.md)

### Q

#### **Quota banner**

- **Definition**: 中央のヘッダの下 (ヘッダの行と会話内検索のバーの間) に出す、表示中の稼働中セッションのレート制限の帯 (O-4)。
  SDK の `rate_limit_event` の最新の状態で決める: `allowed_warning` で注意 (`role="status"`)、`rejected` で警告 (`role="alert"`)、
  `allowed` に戻ると消える。制限の種類 (5 時間・7 日など)・使用率・解除の時刻を出す。
  解除の時刻を過ぎると、次の event を待たずに消える。送信できない終端 (失敗・終了済み・強制終了・終了処理中) のセッションでは、
  `rejected` でも `role="status"` に下げ、送る案内 (「待ってから送ってください」) を出さない
- **日本語表記**: Quota banner (element 名のまま)
- **Domain**: `ui` (表示)。値の保持は `session` (Meter の `rate-limit`)
- **Counterexamples**: 帯はセッションごと (届いた event はそのセッションのもので、他のセッションに当てはめない)。過去のセッションには出さない。
  `rate_limit_event` は claude.ai のサブスクリプションでだけ届き、API キー・Bedrock の Provider では出ない。429 で失敗したときの
  失敗の理由 (`rate-limited`) の文言は帯を参照しない。権限モードの警告の帯 (Unsafe permission mode banner) とは別で、並びはその後ろ
- **Ref**: [AD-047](decisions/0047-session-meter-and-failure-reasons.md) Decision 2 / [014 spec](../specs/014-ui-metering-and-limits/spec.md) FR-006 / [data-model](../specs/014-ui-metering-and-limits/data-model.md) §4

### R

#### **Recent activity（直近の活動）**

- **Definition**: 監視ビューの各行に出す 1 行の plain text (O-1)。renderer が保持する本文と承認要求から導く —
  承認を求めている tool 名と入力の先頭 / 応答中に呼び出した tool 名と入力の先頭 / 送ったプロンプトの先頭行 /
  最後の応答の先頭行。識別子は `Activity` (kind は `approval` / `tool` / `prompt` / `reply`。`deriveActivity` が導き、
  ストアが間引いて `activity` に持つ)
- **日本語表記**: 直近の活動
- **Domain**: `session`
- **Counterexamples**: **状態通知 (SessionStatusUpdate) には載らない** — 状態通知は会話由来の文字列を持たない。
  会話由来の逐語なので `toActivityLine` を通した plain text としてだけ描画し、支援技術への自動の通知 (live region) にも入れない
- **Ref**: [010 spec](../specs/010-session-monitoring-view/spec.md) FR-006

#### **Reachability**

- **Definition**: あるランタイムからある作業フォルダに**到達できるか**を表す 3 値 —
  `reachable` / `unreachable` / `blocked`
- **日本語表記**: 到達可能性
- **Domain**: `runtime`
- **Counterexamples**: `blocked` を `unreachable` と混ぜない。前者は
  「今は届かないが解消手順がある」(停止中のディストロなど) であり、
  利用者に示すべき次の操作が違う
- **Ref**: [AD-025](decisions/0025-workspace-folder-carries-location.md)

#### **RuntimeDescriptor**

- **Definition**: 検出で得られた**ランタイムの事実**を表す値。識別子 / 表示名 /
  種別 / 実行状態 / `capabilities` / `PathMapping` / 検出時刻を持つ
- **日本語表記**: ランタイム記述子
- **Domain**: `runtime`
- **Counterexamples**: `AgentRuntime` はインタフェースであり、これはその `descriptor` にあたる値である

#### **RuntimeLaunchSpec**

- **Definition**: agents を WSL-free に保つための**起動指示の値** (X-1)。WSL 内 claude の実行パス /
  起動コマンド (`WSL_BINARY`) / 接頭引数 (X-4 以降は `['--cd', cwd, '-d', distro, '--exec']`。シェルを経由しない) /
  env (`composeLaunchEnv` の結果。X-4) を持つ。
  `wsl.exe` の argv/リテラルは `infra/runtime` に閉じ、agents は**値**として受け取る
- **日本語表記**: 起動指示 (型名は原語のまま)
- **Domain**: `session` (型宣言) / `infra/runtime` (構築)
- **Counterexamples**: agents はこの `command` の文字列リテラルを持たない (`WSL_FREE_DIRECTORIES`)。
  cwd はホスト `spawn` の `cwd` に渡さず `--cd` 引数で運ぶ (多段変換を潰さない。H-03)
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) §3・§8 / [AD-018](decisions/0018-wsl-process-control.md) / [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (f)

#### **RuntimePath**

- **Definition**: ランタイム内部から見たパス。現状は常に POSIX 形式。
  WSL 内 Docker Engine を使う構成では `HostPath` → WSL の `RuntimePath` → コンテナ内の
  `RuntimePath` と 2 段になる
- **Domain**: `runtime`
- **Ref**: [AD-004](decisions/0004-branded-path-types.md)

#### **Running session list（稼働中セッション一覧）**

- **Definition**: renderer が持つ、この起動で開いたセッションの一覧 (X-5)。各行は **SessionRowStatus (行の状態)** を示す。
  `claude` が終わったセッションの行も、利用者が閉じるまで残る。O-1 で**監視ビュー**に拡張した (session の操作 UI)
- **日本語表記**: 稼働中セッション一覧
- **Domain**: `session` (状態と一覧の操作 UI。O-1 で見た目の持ち主を ui から移した) / `ui` (承認カード・transcript・共有 element `thread-list.aui.tsx`)
- **Counterexamples**: **R-2 の (列挙の) セッション一覧とは別物** — あちらは config ディレクトリの過去のセッションを
  列挙した一覧 (SessionSummary の集まり)
- **Ref**: [spec 009](../specs/009-session-supervisor-and-multi-session/spec.md) FR-009 / [010 spec](../specs/010-session-monitoring-view/spec.md) FR-013

### S

#### **SafePermissionMode**

- **Definition**: 起動で選べる権限モード。`default` / `plan` / `dontAsk` の 3 値 (AD-020 の危険度表で「安全」のもの)。`assertSafePermissionMode` が実行時に閉じる
- **Domain**: `session`
- **Counterexamples**: 昇格 3 値 (`acceptEdits` / `auto` / `bypassPermissions`) は含まない。capability 連動は I-3
- **Ref**: [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (a)

#### **Session**

- **Definition**: Claude Code の 1 会話。UUID で識別され
  `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化される。
  **正本は Claude Code 側にあり**、アプリのストアはキャッシュ / インデックスである
- **日本語表記**: セッション
- **Domain**: `session`
- **Ref**: [AD-007](decisions/0007-session-source-of-truth-is-claude-code.md)
- **Note**: **一覧（R-2）が扱うのは要約とメタデータのみ**。本文の取得は **R-3 で追加済み**
  （`getSessionMessages` 経由。変換は **message mapping**、表示状態は **TranscriptView** を参照）

#### **SessionEvent**

- **Definition**: `agents → renderer` の**一方向データ** (data plane。X-1)。`message` (逐次/完了メッセージ) /
  `state` / `permission-request` / `permission-denied` / `interrupt-receipt` / `failure` / `end-forced` (X-5。
  終了が期限切れで強制終了に落ちた) の判別 union。`MessageChannelMain` の port で届き、**main は本文を保持・
  deserialize しない** (Principle IX)。X-5 以降はセッションスレッドが文字列化し、**調停役スレッドが JSON として
  解釈せずに** port へ中継する (AD-043 Decision 2)。renderer が復元して形を検証する。中継中の文字列は型 `OpaqueBody`
  (branded string) で運び、中身を解釈する関数に渡す経路を作らない
- **日本語表記**: セッションイベント (型名は原語のまま)
- **Domain**: `session`
- **Counterexamples**: **制御はここに載せない** — 制御 (`SessionControl`) は control plane の検証済み IPC を通す。
  状態機械の入力 `SessionAction` とも別型 (描画データと遷移入力を混同しない)
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) / [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)

#### **SessionControl**

- **Definition**: `renderer → main` の**制御要求** (control plane。X-1)。`send-prompt` / `respond-permission` /
  `interrupt` / `end` / `kill` の判別 union (`end` は X-5。応答待ち・中断済み・最初のプロンプト待ちのセッションの `claude` を
  終わらせる穏当な「終了」。最初のプロンプト待ちは期限を待たずに止める)。**renderer → main の検証済み IPC のみが発行できる** (data plane から発行しない)。起動 (launch) は含まない
- **日本語表記**: セッション制御
- **Domain**: `session`
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) / contracts C-1

#### **SessionRunState**

- **Definition**: 単一セッションの**状態機械** (X-1)。7 状態
  (`idle` / `launching` / `running` / `awaiting_permission` / `interrupted` / `error` / `done`)。
  遷移は純関数 `nextState(state, action)`。`launching` は launch invoke〜最初のプロンプト後の初 stream の窓
- **日本語表記**: セッション実行状態
- **Domain**: `session`
- **Counterexamples**: 描画用 `SessionEvent` とは別型。**`done` は「応答完了・次のプロンプト待ち」と「強制終了後」の
  両方を表す** — `claude` が終わったかどうかは run-state では判定せず、状態通知の生存フラグで判定する (X-5)。
  状態通知の畳み込みでは `done` を終端として扱わない。応答待ちの `done` で `claude` が異常終了したら `error` に進む
  (X-5 / FR-012)。X-1 の単一セッション不変は X-5 で廃止し、同時実行数の上限
  (registry の生存フラグで数える) に置き換えた (AD-043)
- **Ref**: [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md)

#### **SessionMessage（セッションメッセージ）**

- **Definition**: `getSessionMessages` が過去 transcript から返す **SDK 由来の外部型**。
  `type`（`user` / `assistant` / `system`）/ `uuid` / `session_id` / `message`（本文。`unknown`）/
  `parent_tool_use_id` / `parent_agent_id` を持つ。**アプリの内部型ではない** — 境界で
  `ThreadMessageLike` へ変換する（**message mapping**）
- **日本語表記**: セッションメッセージ（型名は原語のまま）
- **Domain**: `session`（**外部型**。`@anthropic-ai/claude-agent-sdk` の `sdk.d.ts` が正本）
- **Counterexamples**: **`message` フィールドを検証せずに描画しない。** 会話由来の逐語であり、
  本文サニタイズと URL allowlist を通す（[AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)）。
  **`tool_use.input`（argsText）も同様にサニタイズを通す** — R-4 の tool 専用表示の主コンテンツが argsText 由来
  （[AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md)）
- **Note**: `parent_tool_use_id` は **Subagent** の一次リンク鍵（R-4 が入れ子表示に使う）
- **Ref**: [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md) / [AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md)

#### **SessionSummary（セッション要約行）**

- **Definition**: セッション一覧の 1 行。識別子 / 要約 / 最終更新 / 作成時刻 / 作業ディレクトリ /
  git ブランチ / タグ / 由来（対話・programmatic・worktree）/ 由来列挙対象を持つ。
  **transcript の本文を含まない**
- **日本語表記**: セッション要約行
- **Domain**: `session`
- **Counterexamples**: **`summary` / `firstPrompt` / `customTitle` を「要約だから安全」と扱わない。**
  SDK の定義上これらは会話由来の**逐語文字列**を含みうる（`firstPrompt` は
  "First meaningful user prompt in the session."）。IPC 境界を越える前に
  切り詰めと制御文字の除去を通す。**X-5 の状態通知 (SessionStatusUpdate) とは別物**
- **Ref**: [AD-007](decisions/0007-session-source-of-truth-is-claude-code.md) / [AD-029](decisions/0029-session-cwd-origin-classification.md)

#### **Subagent（サブエージェント）**

- **Definition**: subagent の tool (実行時の名前は `Agent`。旧名 `Task`。SDK 0.3.270 の入力型は `AgentInput`) で起動される
  副エージェント。Subagent の専用表示は両方の名前に当てる (O-2 FR-010)。過去ログでは配下メッセージが **`parent_tool_use_id`**
  （起動した Task の `tool_use.id`。一次リンク鍵）で親 Task に対応づく。多段時は `parent_agent_id`（親 subagent の
  agentId）が連鎖鍵。R-4 は親 Task の下に**入れ子**表示する
- **日本語表記**: サブエージェント
- **Domain**: `session`（外部概念。`SessionMessage` の親参照フィールド由来）/ 表示は `ui`
- **Counterexamples**: `parent_agent_id` を一次リンク鍵にしない（それは多段連鎖用で depth-1 では null）。
  一次鍵は `parent_tool_use_id`（[AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md) / research R-02）
- **Ref**: [AD-020](decisions/0020-sdk-emitted-message-inventory.md) / [AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md)

#### **Subagent group（サブエージェント入れ子）**

- **Definition**: Task の tool-call part と、その配下 subagent メッセージの**入れ子構造**。`domain` の純粋関数
  （`toTranscriptMessages`）が id で対応づけ、DTO の `tool-call.children` に積む。canonical はこの語に統一する
  （spec Key Entities / DTO フィールド名を揃える）
- **日本語表記**: サブエージェント入れ子
- **Domain**: `ui`（表示構造）
- **Ref**: [AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md)

#### **SessionLaunchConfig**

- **Definition**: セッション起動時に選択される設定の組。作業フォルダ / ランタイム / Provider /
  モデル / effort / 権限モード / sandbox / 追加ディレクトリ / 上限 / セッション名。
  三本の軸が交わる点であり日常操作の入口。
  **X-4 は前 6 軸を実装する。** folder / runtime は必須で、provider / model / effort は `null` = 既定、権限モードは `SafePermissionMode`。
  sandbox は I-3、追加ディレクトリ / 上限 / セッション名は X-6 が扱う
- **Domain**: `session`
- **Ref**: [008 spec](../specs/008-session-launch-settings-dialog-and-presets/spec.md) / [AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md)

#### **sessionStore**

- **Definition**: コンテナ内に閉じた JSONL をホスト側 SQLite にミラーするアダプタ。
  キャッシュであり、ミラー側を正本に昇格させない
- **Domain**: `isolation`
- **Open**: 保持期限・削除経路が未定義（AD-007 の blocking gap）

#### **supervisor**

- **Definition**: セッションのプロセスとストリームを持つ**単一の** `utilityProcess` (X-5 から)。
  主スレッドの**調停役スレッド**と、セッションごとの**セッションスレッド** (`worker_threads`) からなる。
  **実体のディレクトリは `src/agents/`** である (AD-023 のレイヤ構成)。
  **Electron API にもネイティブモジュールにも依存しない**。単独起動の形は
  `node <supervisor entry> --worker-entry=<worker entry の絶対パス>` (AD-043 Decision 6。AD-010 の
  `node dist/supervisor.js` は例示)。最初の起動要求で起こし、アプリ終了まで常駐する
- **Domain**: `session`
- **Counterexamples**: X-1 / X-4 の「セッションごとの `utilityProcess`」は X-5 で廃止した
- **Ref**: [AD-006](decisions/0006-supervisor-in-utility-process.md) / [AD-010](decisions/0010-supervisor-runs-standalone.md) / [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md)

#### **Session thread（セッションスレッド）**

- **Definition**: supervisor の中で 1 セッションを受け持つ `worker_threads` の Worker (X-5)。SDK `query()` の実行・
  stream のパース・`wsl.exe` の spawn ハンドルを持ち、本文を文字列化して調停役スレッドへ送る。
  実体は `src/agents/sdk-agent-session.ts`
- **日本語表記**: セッションスレッド (実装語として Worker を括弧で添えてよい)
- **Domain**: `session` / `agents`
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md)

#### **SessionStatusUpdate（状態通知）**

- **Definition**: 一覧に要る状態だけを運ぶ小さな値 (X-5)。sessionId / run-state / 失敗の理由キー /
  `claude` の生存フラグ。supervisor→main→renderer の経路で 100ms 窓にまとめて送る。**会話由来の文字列を含まない**
- **日本語表記**: 状態通知
- **Domain**: `session`
- **Counterexamples**: **SessionSummary (セッション要約行) とは別物** — あちらは R-2 の列挙一覧の 1 行 (過去の
  セッション)、こちらは稼働中セッションの状態。生存フラグは true→false の一方向にしか変わらない
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 4

#### **claudeAlive（生存フラグ）**

- **Definition**: セッションの `claude` (`wsl.exe` の子) がまだ生きているか (X-5)。状態通知のフィールドの 1 つで、
  **枠 (同時実行数の上限) はこの値で数え、run-state では数えない**。false にするのは調停役スレッド (子の exit・
  スレッドの終了) と main (supervisor の異常終了の合成) だけで、セッションスレッドが送る値は常に true
- **日本語表記**: 生存フラグ
- **Domain**: `session`
- **Counterexamples**: run-state の `done` とは別 — `done` は「応答待ち (生存)」と「終わった後」の両方を表す。
  true→false の一方向にしか変わらない (main の受信規則 `acceptBatch` が単調性を掛ける)
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 3・4

#### **Slot usage（枠の使用数）**

- **Definition**: 監視ビューの見出しに出す「枠を占めるセッションの本数 / 上限」(例: 8/10。O-1)。数え方は main の上限判定と
  同じ domain の `countOccupying` (生存フラグで数える) に、起動要求の応答を待っている 1 件を足す。識別子は `slotUsage`
- **日本語表記**: 枠の使用数
- **Domain**: `session`
- **Counterexamples**: 同時実行数の上限 (Concurrency limit) そのものではなく、その現在値の表示である。起動の可否は main が判定する
- **Ref**: [010 spec](../specs/010-session-monitoring-view/spec.md) FR-007

#### **SessionRowStatus（行の状態）**

- **Definition**: 稼働中セッション一覧の各行が示す状態 (X-5)。run-state と生存フラグの組から `rowStatus` が導く 9 値 —
  `launching` (起動中) / `ready` (プロンプト待ち) / `running` (応答中) / `awaiting` (承認待ち) / `interrupted` (中断) /
  `waiting` (応答待ち) / `ending` (終了中) / `failed` (失敗) / `ended` (終了済み)。優先順は失敗 → 終了済み → 終了中 → run-state
- **日本語表記**: 行の状態
- **Domain**: `session`
- **Counterexamples**: SessionRunState (7 状態) とは別の型。`awaiting` は `awaiting_permission`、`failed` は `error` に対応し、
  `done` は生存フラグで `waiting` と `ended` に分かれる
- **Ref**: [spec 009](../specs/009-session-supervisor-and-multi-session/spec.md) FR-009 / [010 spec](../specs/010-session-monitoring-view/spec.md) data-model §1

#### **Status since（状態に入った時刻）**

- **Definition**: 行の状態 (SessionRowStatus) が変わったのを renderer のストアが観測した時刻 (O-1)。状態通知・本文・利用者の操作
  (終了・強制終了) のどれで変わっても記録する。経過時間の起点、承認待ちの件数から移る順、支援技術への通知の検出に使う。
  識別子は `statusSince` (行の状態と時刻の組)。renderer の保持の中だけにある
- **日本語表記**: 状態に入った時刻
- **Domain**: `session`
- **Counterexamples**: 状態通知の時刻ではない (状態通知は時刻を持たない)。起動時刻 (`startedAt`) とも別 — ただし最初の値は起動の受付時刻
- **Ref**: [010 spec](../specs/010-session-monitoring-view/spec.md) FR-005

#### **Supervisor generation（supervisor の世代）**

- **Definition**: main が supervisor を fork するたびに進める番号 (X-5)。状態通知・スレッドの終了・異常終了の合成に付け、
  **前の世代の残骸を新しい世代のセッションに付けない**ために照合する
- **日本語表記**: supervisor の世代
- **Domain**: `session`
- **Counterexamples**: セッション ID とは別 — 1 世代に複数のセッションが属し、supervisor の異常終了はその世代の全セッションを `supervisor-exited` にする
- **Ref**: [AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 1・4

#### **System event row（システムイベントの行）**

- **Definition**: transcript の中で Hook / Background task などの出来事を **1 つにつき 1 行**で示す表示 (O-2)。DTO は
  `TranscriptPartDTO` の `system-event`。同じ出来事の後続のイベントは同じ行に合成する (`mergeSystemEvent`)。
  行を作れるのは Hook の開始・応答、task の開始と、下の O-4 の 3 つの category の出来事だけで、行の無い id への更新は捨てる。
  終わりの来ない行は、セッションの終了・失敗の後と過去ログで「結果不明」と描く
  - O-4 で、実行中のセッションだけの category を 3 つ足した: API の再試行 (`api-retry`。同じターンの再試行は 1 行を書き換える)・
    コンテキストの圧縮 (`compaction`。圧縮中 → 成功 / 失敗)・権限モード (`permission-mode`。権限モードが変わったことを 1 行)。
    行の組み立ては agents に置き、過去ログの変換には足さない
  - O-4 で、task の行に進み具合 (トークン・tool の回数・経過時間) を同じ行の更新として足した。task の種類は残す
- **日本語表記**: システムイベントの行
- **Domain**: `ui` (表示)。経路 (agents での変換) は session
- **Counterexamples**: assistant の発話ではない — コピーなどの操作や応答中の印を付けない。状態の一覧 (task の表) ではない —
  task の進み具合も行の更新で、task の状態を持たない (AD-044 Decision 6)。
  agents の `post` の kind `event` (セッションスレッドの通知の種類) とも別物。計量 (Meter) とも別 — あちらは行ではなく最新の値
- **Ref**: [011 spec](../specs/011-ui-coverage/spec.md) FR-009 / [data-model](../specs/011-ui-coverage/data-model.md) §2 / [014 data-model](../specs/014-ui-metering-and-limits/data-model.md) §3

#### **Shell（シェル）**

- **Definition**: アプリの面の配置と遷移 (O-7)。上部のタブを持たず、次の面と領域からなる。**後続 feature は表示の置き場所をこの語で書く** (AD-046 Decision 6):
  - **サイドバー** (Sidebar): 左の面 (`nav` のランドマーク)。上から「新規起動」・**稼働中の区画**・**過去のセッションの区画**・「設定」。畳むと帯になる
    - **稼働中の区画** (Running section): 監視ビュー (`RunningSessionList`) を置く区画。見出しに注意の件数の印
    - **過去のセッションの区画** (Past sessions section): R-2 の一覧 (`SessionListScreen` の一覧の部分) を置く区画
  - **中央のヘッダ** (Center header): 中央の上端。表示中のセッションの題・フォルダ・状態と transcript の密度の切り替え。稼働中と過去で同じ部品 (`features/shell/CenterHeader.tsx`)
  - **中央の本体** (Center body): 中央の会話 (`main` のランドマーク。中央の全体は `features/shell/CenterPane.tsx`)。稼働中なら実行中の Chat (`features/session/LivePane.tsx`)、過去なら過去ログの transcript (`ChatScreen`)、未選択なら空の状態
  - **右のペインのタブ** (Panel tab): 右の面 (名前付きの `complementary`) のタブ。1 か所の表 (`panel-tabs.ts`) に登録する。既定で畳む
  - **設定のダイアログ** (Settings dialog): ランタイム・作業フォルダ・Provider・組み合わせの画面とテーマを開く全面のダイアログ
- **日本語表記**: シェル
- **Domain**: `ui` (サイドバーの区画の中身は session)
- **Counterexamples**: 面の状態 (`focus`・設定・畳み) は `stores/ui.ts` の 1 か所にあり、session のコンポーネントは書かない
  (例外は [ui charter](domains/ui/charter.md) の「面の状態」)。
  画面の ID (`SCREENS`) は O-7 で無くなった。「見ているセッション」(`watchedId`) は `focus` から導く (中央に稼働中の会話を出していて、
  設定のダイアログも起動ダイアログも開いていないときの選択中のセッション。定義の正本は 013 data-model §1 の `watchedIdOf`。
  O-7 pr-gate R2 architecture M-102)。`focus` は中央にどちらの側を出すかであり、キーボードのフォーカス
  (DOM のフォーカス) ではない。コードの "Pane" (`CenterPane` / `LivePane`) は面の語の「ペイン」(右のペイン。コードは `RightPanel`) ではない。
  OS のシェル (Bash・ログインシェル・`--exec` でシェルを経由しない・transcript の `local_bash`「シェルのコマンド」) とは別 —
  紛れうる文書ではアプリの面を「アプリのシェル」と書く (O-7 pr-gate R1 architecture L-001)
- **Ref**: [AD-046](decisions/0046-app-shell-layout.md) / [013 spec](../specs/013-ui-app-shell/spec.md) / data-model §1

### T

#### **Thread search（セッションの検索）**

- **Definition**: サイドバーの過去のセッションの区画の検索欄で、一覧の要約行を語で絞り込む機能 (O-3)。element 名は Thread search。
  - 対象は要約行の `customTitle` / `summary` / `firstPrompt` / `gitBranch` / `tag` / `cwdDisplay` と、行が属するグループの見出しとして画面が描く文字列。
  - 正規化 (NFKC・小文字化・制御文字の除去・空白の圧縮) と語の AND の部分一致の規則は 1 か所 (`features/search/text-search.ts`) に置き、Command palette のセッションの候補と共有する。
  - 所在・フォルダの絞り込みと AND で組み合わせる。読み込み済みの行だけを探す。
- **日本語表記**: セッションの検索
- **Domain**: `ui` (session の一覧の上に ui が載せる例外。[ui charter](domains/ui/charter.md))
- **Counterexamples**: **transcript の本文を横断して読まない** (本文の横断検索は O-9 で要否を判断する)。会話内検索 (Conversation search) とは別。
  パス (`cwd.value`) を直接の対象にしない。検索語から `RegExp` を組まない (字面の部分一致だけ)。registry の `elements-thread-search` (時刻のまとまりと pinned を前提にする) は使わない
- **Ref**: [012 spec](../specs/012-ui-thread-search/spec.md) FR-001 / FR-002 / [data-model](../specs/012-ui-thread-search/data-model.md) §1

#### **Tier A / B / C**

- **Definition**: Element の実装優先度。A は Claude Code の一次概念に直結する必須、
  B は体験を押し上げるもの、C は対象外（Voice 系 / Generative 群など）。
  **ui-coverage 対応表の行の Tier** (O-2) も同じ 3 値で、Claude Code の一次概念 (会話・tool の実行と結果・承認・中断・
  コンテキスト・費用と制限・セッションの境界) に直結し、利用者が見ないと判断を誤る行を A、無くても判断を誤らない行を B、
  対象外を C とする (正本は AD-044)
- **Domain**: `ui`

#### **Tool group（tool のまとまり）**

- **Definition**: transcript で連続する tool の呼び出しをまとめて畳める element (R-3)。R-4 の専用表示はこの内側に出る。
  O-2 で、transcript の情報密度が comfortable のとき既定で開き、compact のとき既定で閉じる (AD-035 Trade-off への回答)
- **日本語表記**: tool のまとまり
- **Domain**: `ui`

#### **Transcript density（transcript の情報密度）**

- **Definition**: transcript の表示の詰め方 (O-2)。`comfortable` (Tool group を開く) と `compact` (Tool group と Reasoning を
  閉じ、間隔を詰める) の 2 値。識別子は `transcriptDensity`。renderer の表示状態であり永続化しない (既定は `comfortable`)
- **日本語表記**: transcript の情報密度
- **Domain**: `ui`
- **Counterexamples**: 監視ビューの行の Density (O-1。`density`。session) とは別の値で、切り替えも別の位置・文言
- **Ref**: [011 spec](../specs/011-ui-coverage/spec.md) FR-012 / FR-013

#### **transcript**

- **Definition**: セッションの会話ログ。`<config-dir>/projects/<encoded-cwd>/` 配下の JSONL に永続化される。
  `encoded-cwd` は作業ディレクトリの非英数字を `-` に置換したもの
- **Note**: **`encoded-cwd` をアプリ側で再現しない**（R-2 の `[ASSUMED]`）。
  作業ディレクトリはセッションのメタデータから読む。
  **一覧（R-2）は本文を取得も転送もしない** — 取得は **R-3 で追加済み**（`getSessionMessages`。本文は
  `MessageChannelMain` の port で取得プロセス→renderer を直通し main を経路から外す。[AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)）
- **Domain**: `session`

#### **TranscriptView（transcript 表示）**

- **Definition**: 選んだセッションの過去メッセージを **assistant-ui で仮想化描画する画面状態**（R-3）。
  取得（loading / ready / empty / failed）と再取得、選択切替時の stale 破棄を持つ。
  **本文そのものは保持の主体ではない** — `useExternalStoreRuntime` の `messages` に流し込む表示状態である
- **日本語表記**: transcript 表示
- **Domain**: `ui`
- **Counterexamples**: **transcript（本文の永続実体）とは別**。あちらは `session` domain の会話ログ、
  こちらはそれを描画する `ui` の状態
- **Ref**: [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md) / [AD-033](decisions/0033-assistant-ui-elements-introduction-cost.md)

### U

#### **Unregistered folder（未登録フォルダ）**

- **Definition**: セッション一覧のうち、**登録フォルダに対応しない**作業ディレクトリごとの
  まとまり。その場で作業フォルダとして登録する導線を持つ
- **日本語表記**: 未登録フォルダ
- **Domain**: `session`
- **Counterexamples**: **「対応づけ保留」と混ぜない。** 未登録は「決めた結果として対応が無い」、
  保留は「今は決められない」である。保留を未登録として見せると、
  **登録済みのフォルダに対して再登録を促す**ことになる。
  また未登録の作業ディレクトリに対して**実在確認は行わない**
  （任意パスの存在を問い合わせる経路を作らない）

#### **Unknown location（所在不明）**

- **Definition**: 作業ディレクトリの記録から**どのディストロか特定できない**状態。
  ホスト側の config ディレクトリに POSIX 形式の値が現れた場合がこれにあたる
- **日本語表記**: 所在不明
- **Domain**: `session`
- **Counterexamples**: **「未検出の所在」と混ぜない。** 前者は「どのディストロか分からない」、
  後者は「どのディストロかは分かるが、そのディストロが今ない」（UNC 形式にディストロ名が
  埋め込まれている場合）である。利用者に示すべき次の操作が違う。
  **所在不明を推測で埋めない** — 同じ `/home/y/p` は複数のディストロに存在しうる
- **Ref**: [AD-029](decisions/0029-session-cwd-origin-classification.md)

#### **Unsafe permission mode banner（権限モードの警告の帯）**

- **Definition**: 実行中のセッションの権限モードが安全 3 値 (SafePermissionMode) の外 (昇格値と不明なモード) になったのを観測したとき、
  中央のヘッダの下に出す `role="alert"` の帯 (O-4。AD-041 の「昇格経路 0 件」の逸脱の信号)。観測するのは SDK の `status` と各ターンの
  `init` の `permissionMode`。原因を断定せず、強制 (中断・失敗にする) はしない (強制の要否の持ち主は I-3)。並びは警告の帯 → Quota banner →
  会話内検索のバー
  - 隔離の文言は暫定で、セッションの隔離状態ではなくランタイムの `autoModeStatus` から導く (`unavailable` は「隔離がありません」、それ以外は「このセッションの隔離をアプリは確かめていません」。Isolation badge (I-2) が定義されたら置き換える)
- **日本語表記**: 権限モードの警告の帯
- **Domain**: `ui` (表示)。判定は `session` の `isSafePermissionMode`、ポリシーとゲートは `isolation` (I-3)
- **Counterexamples**: 起動の設定・プリセットの権限モードは変えない (書き戻さない)。`autoModeAllowed` (ゲート用) を表示に使わない。
  `allowed` のランタイムでも、隔離されていると読める文言にしない
- **Ref**: [AD-047](decisions/0047-session-meter-and-failure-reasons.md) Decision 5 / [014 data-model](../specs/014-ui-metering-and-limits/data-model.md) §4

#### **ui-coverage 対応表**

- **Definition**: `docs/ui-coverage.md`。SDK のメッセージ型・中身のブロック・tool・アプリが作る経路・制御要求と
  表示実装の対応表 (O-2)。各行は**割当**を 3 種類のどれかで持つ: **実装済み** (element と経路。ToolFallback だけで実装済みに
  できるのは Tier B / C の行)、**後続** (roadmap に実在し、完了していない feature の ID)、**表示不要** (理由)。
  **未割当行がある間、UI 系 feature を `completed` にしない**。SDK の型定義と機械で照合する (Constitution 検証の項目 21)
- **Domain**: `ui`
- **Counterexamples**: 「後続」は未割当ではない (roadmap に実在し、完了していない feature の ID に限る)。M3 の完了の条件は「Tier A の後続のうち、
  割当先が M3 の feature の行が 0」(AD-044)。他 domain の一覧画面の値 (`SDKSessionInfo` など) は行にしない
- **Ref**: Constitution Principle XII / AD-044 / [011 spec](../specs/011-ui-coverage/spec.md)

### W

#### **WorkspaceFolder**

- **Definition**: 登録された作業フォルダ。**所在 (`Location`) を必ず伴う**。
  重複判定の鍵は (所在, 正規化済みパス) の組である
- **日本語表記**: 作業フォルダ
- **Domain**: `runtime`
- **Counterexamples**: 「パス」ではない。パスだけで登録すると所在が失われ、
  越境判定も到達可能性も決められなくなる
- **Ref**: [AD-025](decisions/0025-workspace-folder-carries-location.md)

#### **WslUncPath**

- **Definition**: Windows 側から WSL のファイルシステムを指す UNC 形式のパス
  (`\\wsl.localhost\<distro>\...`)。`HostPath` / `RuntimePath` に次ぐ**第 3 の名前空間**であり、
  識別子はディストロ粒度で持つ (`unc:<distro>`)
- **Domain**: `runtime`
- **Counterexamples**: 登録・永続化・IPC が渡すパスの形ではない。
  **UNC 形式は `infra` の内側に閉じる**
- **Ref**: [AD-025](decisions/0025-workspace-folder-carries-location.md)

## Detected synonyms (要統一)

| Concept | 使われている表記 | Proposed canonical | 備考 |
|---|---|---|---|
| AgentRuntime | 「ランタイム」「Runtime」「実行環境」 | `AgentRuntime`（コード）/ ランタイム（日本語文） | 「実行環境」は Provider の意味でも使われうるため避ける |
| 稼働中セッション一覧 | 「監視ビュー」「稼働中セッション一覧」「一覧」「サイドバー」 | `RunningSessionList`（コード）/ 監視ビュー（charter Journey と O-1 以降の文書）/ 稼働中（UI 文言。サイドバーの区画の見出し） | 同じ 1 つの部品を指す。O-7 以降「サイドバー」はシェルの左の面の名前で、監視ビューはその中の**稼働中の区画**に置く (Shell を参照)。監視ビューを「サイドバー」と呼ばない |
| Disposable container | 「使い捨てコンテナ」「コンテナ」 | `Disposable container` / 使い捨てコンテナ | 単に「コンテナ」と書くとイメージと紛れる |
| Isolation | 「隔離」「サンドボックス」 | 隔離（境界全般）/ sandbox（OS 組み込み機構に限定） | Seatbelt / bubblewrap を指すときのみ sandbox |
| Location | 「所在」「ロケーション」「置き場所」 | `Location`（コード）/ 所在（日本語文） | 「置き場所」はパスの意味にも読めるため避ける |
| supervisor | 「supervisor」「agents」 | `supervisor`（役割）/ `src/agents/`（実体のディレクトリ） | 役割名とディレクトリ名が一致しない。どちらを指しているかを明示する |
| Provider | 「Provider」「プロバイダ」 | `Provider`（コード・日本語文・UI の文言とも英字） | カタカナの「プロバイダ」は使わない。O-4 で UI の文言と docs を英字に揃える (014 research R-13) |

## Generic words excluded

以下の汎用語は本 glossary に含めない（本プロジェクト固有の意味を持つ場合を除く）。

```
User, Manager, Service, Handler, Helper, Util, Tool, Component, Module
Item, List, Data, Info, Detail, Result, Response, Request, Config, Setting, Option
Type, Status, State, Mode, Kind, Flag, Value, Key, Name, Id, Code
```

**例外**: `Provider` は汎用語だが、本プロジェクトでは §5 の定義に固定された domain 用語として扱う。
