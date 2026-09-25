---
status: needs-human-review
last_updated: 2026-09-15
generated_by: human (PLAN.md 付録A + §3〜§7 を素材に起草)
total_terms: 31
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
  ホストが Windows でもコンテナ内は Linux でありうるため
- **Ref**: [AD-003](decisions/0003-runtime-abstraction-by-transport.md)

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

### B

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
  変換自体は成立するが I/O が桁で遅くなるため、選択時に明示する
- **日本語表記**: 越境
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

#### **CredentialSource**

- **Definition**: Provider の認証方式。9 種類あり、それぞれ「アプリが秘密を持つか」が定義されている。
  推奨は `api-key-helper` と `aws-credential-export`
- **Domain**: `provider`
- **Ref**: [AD-011](decisions/0011-delegate-credential-resolution.md)

### D

#### **Disposable container**

- **Definition**: セッションに紐づき、終了時に破棄されるコンテナ。
  「永続環境を構築しない」という原則の**唯一の例外**として管理対象になる
- **日本語表記**: 使い捨てコンテナ
- **Domain**: `isolation`
- **Counterexamples**: 永続コンテナ、Docker **イメージ**。いずれも管理対象外
- **Ref**: [AD-008](decisions/0008-no-persistent-environment-provisioning.md)

### E

#### **Element**

- **Definition**: assistant-ui が提供する UI 部品。202 種（2026-09-13 確認）
- **Domain**: `ui`
- **Counterexamples**: 自作コンポーネント。同等の element が存在する場合は自作しない（Principle XIII）

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

### H

#### **HostPath**

- **Definition**: Electron プロセスから見たパス。Windows ではドライブレター形式。
  branded type として `RuntimePath` と型レベルで分離される
- **Domain**: `runtime`
- **Ref**: [AD-004](decisions/0004-branded-path-types.md)

### I

#### **Isolation badge**

- **Definition**: セッションが隔離境界の内側で動いていることを示す表示。
  `bypassPermissions` で動作中のものは視覚的に区別される
- **日本語表記**: 隔離バッジ
- **Domain**: `isolation`（判定）/ `ui`（表示）

### L

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

#### **Model catalog**

- **Definition**: Provider ごとに使えるモデルの集合。Bedrock は inference profile ID で pin する
- **日本語表記**: モデルカタログ
- **Domain**: `provider`

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

#### **Preset**

- **Definition**: 名前付きで保存された `SessionLaunchConfig`。**資格情報の値は含まない**
- **日本語表記**: プリセット
- **Domain**: `session`

#### **Provider**

- **Definition**: 認証方式・設定ディレクトリ・モデルカタログを含む**登録可能なエンティティ**。
  コード上の列挙ではなくアプリに登録される値であり、同一バックエンドを複数登録できる
- **Domain**: `provider`
- **Counterexamples**: 汎用語としての "Provider"（DI コンテナの provider 等）。
  本プロジェクトでは常に上記の意味で使う
- **Ref**: [AD-005](decisions/0005-provider-as-registrable-value.md)

#### **ProviderProfile**

- **Definition**: `Provider` の実体を表す型。`backend` / `configDir` / `credential` / `models` / `extraEnv` を持つ
- **Domain**: `provider`

### R

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

#### **RuntimePath**

- **Definition**: ランタイム内部から見たパス。現状は常に POSIX 形式。
  WSL 内 Docker Engine を使う構成では `HostPath` → WSL の `RuntimePath` → コンテナ内の
  `RuntimePath` と 2 段になる
- **Domain**: `runtime`
- **Ref**: [AD-004](decisions/0004-branded-path-types.md)

### S

#### **Session**

- **Definition**: Claude Code の 1 会話。UUID で識別され
  `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化される。
  **正本は Claude Code 側にあり**、アプリのストアはキャッシュ / インデックスである
- **日本語表記**: セッション
- **Domain**: `session`
- **Ref**: [AD-007](decisions/0007-session-source-of-truth-is-claude-code.md)
- **Note**: **一覧（R-2）が扱うのは要約とメタデータのみ**。本文の取得は **R-3 で追加済み**
  （`getSessionMessages` 経由。変換は **message mapping**、表示状態は **TranscriptView** を参照）

#### **SessionMessage（セッションメッセージ）**

- **Definition**: `getSessionMessages` が過去 transcript から返す **SDK 由来の外部型**。
  `type`（`user` / `assistant` / `system`）/ `uuid` / `session_id` / `message`（本文。`unknown`）/
  `parent_tool_use_id` / `parent_agent_id` を持つ。**アプリの内部型ではない** — 境界で
  `ThreadMessageLike` へ変換する（**message mapping**）
- **日本語表記**: セッションメッセージ（型名は原語のまま）
- **Domain**: `session`（**外部型**。`@anthropic-ai/claude-agent-sdk` の `sdk.d.ts` が正本）
- **Counterexamples**: **`message` フィールドを検証せずに描画しない。** 会話由来の逐語であり、
  本文サニタイズと URL allowlist を通す（[AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)）
- **Ref**: [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)

#### **SessionSummary（セッション要約行）**

- **Definition**: セッション一覧の 1 行。識別子 / 要約 / 最終更新 / 作成時刻 / 作業ディレクトリ /
  git ブランチ / タグ / 由来（対話・programmatic・worktree）/ 由来列挙対象を持つ。
  **transcript の本文を含まない**
- **日本語表記**: セッション要約行
- **Domain**: `session`
- **Counterexamples**: **`summary` / `firstPrompt` / `customTitle` を「要約だから安全」と扱わない。**
  SDK の定義上これらは会話由来の**逐語文字列**を含みうる（`firstPrompt` は
  "First meaningful user prompt in the session."）。IPC 境界を越える前に
  切り詰めと制御文字の除去を通す
- **Ref**: [AD-007](decisions/0007-session-source-of-truth-is-claude-code.md) / [AD-029](decisions/0029-session-cwd-origin-classification.md)

#### **SessionLaunchConfig**

- **Definition**: セッション起動時に選択される設定の組。作業フォルダ / ランタイム / Provider /
  モデル / effort / 権限モード / sandbox / 追加ディレクトリ / 上限 / セッション名。
  三本の軸が交わる点であり日常操作の入口
- **Domain**: `session`

#### **sessionStore**

- **Definition**: コンテナ内に閉じた JSONL をホスト側 SQLite にミラーするアダプタ。
  キャッシュであり、ミラー側を正本に昇格させない
- **Domain**: `isolation`
- **Open**: 保持期限・削除経路が未定義（AD-007 の blocking gap）

#### **supervisor**

- **Definition**: セッションのプロセスとストリームを持つ `utilityProcess`。
  **実体のディレクトリは `src/agents/`** である (AD-023 のレイヤ構成)。
  **Electron API にもネイティブモジュールにも依存しない**。`node dist/supervisor.js` で単独起動できる
- **Domain**: `session`
- **Ref**: [AD-006](decisions/0006-supervisor-in-utility-process.md) / [AD-010](decisions/0010-supervisor-runs-standalone.md)

### T

#### **Tier A / B / C**

- **Definition**: Element の実装優先度。A は Claude Code の一次概念に直結する必須、
  B は体験を押し上げるもの、C は対象外（Voice 系 / Generative 群など）
- **Domain**: `ui`

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

#### **ui-coverage 対応表**

- **Definition**: `docs/ui-coverage.md`。SDK のメッセージ型・tool 名・システムイベントと
  表示実装の対応表。**未割当行がある間、UI 系 feature を `completed` にしない**
- **Domain**: `ui`
- **Ref**: Constitution Principle XII

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
| Disposable container | 「使い捨てコンテナ」「コンテナ」 | `Disposable container` / 使い捨てコンテナ | 単に「コンテナ」と書くとイメージと紛れる |
| Isolation | 「隔離」「サンドボックス」 | 隔離（境界全般）/ sandbox（OS 組み込み機構に限定） | Seatbelt / bubblewrap を指すときのみ sandbox |
| Location | 「所在」「ロケーション」「置き場所」 | `Location`（コード）/ 所在（日本語文） | 「置き場所」はパスの意味にも読めるため避ける |
| supervisor | 「supervisor」「agents」 | `supervisor`（役割）/ `src/agents/`（実体のディレクトリ） | 役割名とディレクトリ名が一致しない。どちらを指しているかを明示する |

## Generic words excluded

以下の汎用語は本 glossary に含めない（本プロジェクト固有の意味を持つ場合を除く）。

```
User, Manager, Service, Handler, Helper, Util, Tool, Component, Module
Item, List, Data, Info, Detail, Result, Response, Request, Config, Setting, Option
Type, Status, State, Mode, Kind, Flag, Value, Key, Name, Id, Code
```

**例外**: `Provider` は汎用語だが、本プロジェクトでは §5 の定義に固定された domain 用語として扱う。
