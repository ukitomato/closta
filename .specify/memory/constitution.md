---
status: active
version: 1.1.0
ratified: 2026-09-13
last_amended: 2026-09-13
generated_by: /speckit.constitution (素材: /spec-gate bootstrap Phase 6 の draft)
---

<!--
Sync Impact Report
- Version change: (draft 0.1.0) → 1.0.0
- Ratified: 2026-09-13  /  Last amended: 2026-09-13
- Bump rationale: MAJOR。初回批准。draft から active への昇格であり、
  Principle の追加・削除ではなく governance の確立にあたる

Modified principles (draft からの変更):
- Principle VI (永続環境を構築・変更しない) — 検証条件を文字列 grep から
  モジュール境界ベースに書き換え。`wsl:<distro>` endpoint では
  `['wsl.exe','-d',distro,'--','docker','run',...]` の引数配列になり
  リテラル `docker run` が現れずすり抜けるため (AD-012)
- 全 Principle — 本文中の feature 参照を新 ID に更新 (F-002 → R-2 など)

Added sections:
- Governance (Spec Kit 要件。改定手順・準拠レビュー・優先順位を明文化)

Removed sections:
- 起草上の注記 (draft 専用。NON-NEGOTIABLE / Standard の振り分けは本昇格をもって承認された)

Resolved on ratification:
- NON-NEGOTIABLE (I〜VIII) / Standard (IX〜XIII) の振り分けを承認
- Domains: runtime / session / provider / isolation / ui の 5 つを確定
  (docs/domains/_overview.md)

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — Constitution Check に実際のゲートを記載
- ✅ docs/domains/*/charter.md — Principle 番号への参照は整合済み
- ✅ docs/roadmap.md — pre-flight P-2 を完了に更新
- ⚠ CI — Principle VIII の Automated 検証 (日本語スクリーンショット比較) は CI 未構築のため実行不能

Deferred (TODO):
- TODO(mirror-retention): transcript ミラーの保持期限・削除経路が未定義。
  Principle 候補として `## 未解決の Principle 候補` に記載
- TODO(license): 配布物のライセンス表記が未整備。同上

Section ownership:
- BOOTSTRAP_SECTION_START / _END は greenfield 起源 (人間 + speckit.constitution) が所有
- MIGRATE_SECTION_START / _END は migrate Phase 4 (constitution-drafter) が所有
- 両方並存可能。merge は section ごと、相互上書きしない
- 本プロジェクトは greenfield のため MIGRATE_SECTION は空のまま維持される見込み
-->

# Constitution

このプロジェクトの **不変原則 (Principles)** の SSoT。`status: active` の Principle は accepted ADR と同等の権威を持ち、違反は `architecture-reviewer` が Critical / High で指摘する。

素材は `PLAN.md` §8「Constitution Principle 候補」(P-1〜P-13)。PLAN.md は本 Constitution の
**入力**であり、両者が食い違う場合は Constitution を正とする (PLAN.md 側を追随させる)。

domain の定義は [docs/domains/_overview.md](../../docs/domains/_overview.md)、
ADR は [docs/decisions/](../../docs/decisions/)、用語は [docs/glossary.md](../../docs/glossary.md) を参照。

## 改定手順

新規 Principle 追加 / 既存 Principle の変更 / 削除には以下が必要:

1. ADR (`docs/decisions/<NNNN>-...md`) で議論を記録
2. `architecture-reviewer` の owner を交えた人間レビュー
3. version を SemVer で上げる (Principle 追加 = MINOR、削除 / 後方非互換 = MAJOR、表現修正 = PATCH)
4. Amendment trail に entry を追記
5. **既存違反 enumeration**: NON-NEGOTIABLE 採用 / 強化時は `## Existing violations` table を生成し、件数 > 0 なら `/spec-gate verify` Phase 3.5 で `overall_status: fail` 判定

## NON-NEGOTIABLE Principles

> 違反は Critical。CI で自動検証されていない場合でも、reviewer が指摘した時点で `/cl-code-gate` / `/cl-pr-gate` が PASS させない。

### Principle I: パス操作は `runtime.path` を経由する (PLAN.md P-1)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rnE "from ['\"](node:)?path['\"]" src/ --exclude-dir=runtime`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=I -->
**Statement**: アプリケーションコードは `node:path` / `path` を直接 import してはならない。パス操作はすべて `runtime.path` を経由する。

**Why**: AD-004 により `HostPath` と `RuntimePath` は branded type で名前空間が分離されている。`WslRuntime` では `C:\Users\y\p` と `/home/y/p` が同時に存在し、どちらの名前空間のパスかを型で追跡できなければ transcript ディレクトリ (`<config-dir>/projects/<encoded-cwd>/`) の解決が壊れる。開発ホストが Windows 11 + WSL2 であるため、この状況は R-2 の時点で日常的に発生する (PLAN.md §10.1)。

**Examples**:
- ✓ Good: `runtime.path.join(cwd, 'projects')` — ランタイムの名前空間で解決される
- ✗ Bad: `import path from 'node:path'; path.join(hostPath, runtimePath)` — 2 つの名前空間を混在させる

**Verification**:
- Automated: ESLint `no-restricted-imports` が `runtime/` 配下以外での `node:path` / `path` の import を error にする
- Manual: `architecture-reviewer` / `platform-boundary-reviewer` がパス生成箇所を確認する
<!-- BOOTSTRAP_SECTION_END principle=I -->

<!-- MIGRATE_SECTION_START principle=I -->
<!-- MIGRATE_SECTION_END principle=I -->

### Principle II: プラットフォーム分岐は `AgentRuntime` 実装の内側に閉じる (PLAN.md P-2)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rn "process.platform" src/ --exclude-dir=runtime | grep -v "platform-ok"`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=II -->
**Statement**: `process.platform` などによるプラットフォーム分岐を `runtime/` の外に書いてはならない。posix / win32 の差は各 `AgentRuntime` 実装が内部で吸収する。

**Why**: AD-003 はランタイム抽象を**トランスポート軸**で切っており (Direct / WSL / Win32 / Docker)、プラットフォーム軸は持たない。UI やサービス層に `process.platform` が漏れると、`DockerRuntime` のようにホスト OS とランタイム OS が一致しないケースで誤った分岐を選ぶ。

**Examples**:
- ✓ Good: `runtime.capabilities.autoModeSafe` で振る舞いを決める
- ✗ Bad: `if (process.platform === 'win32') { /* sandbox なし扱い */ }` — Docker 経由なら成立しない

**Verification**:
- Automated: `grep -rn "process.platform" src/ --exclude-dir=runtime | grep -v "platform-ok"` が空であること
- Manual: `platform-boundary-reviewer`

**例外の書き方**: Electron 自身のホスト OS 規約（macOS の `window-all-closed` で
`app.quit()` しない、Linux でのみ `BrowserWindow` に `icon` を渡す）は、
**ランタイム選択ではなくホスト OS のアプリ規約**であり、本 Principle の対象外である。
これらは除去できないため、**`process.platform` と同じ行の末尾**に
`// platform-ok: <理由>` を書く。前の行に書くと grep が拾えず例外にならない。
注記のない `process.platform` は違反として扱う。

**注記が正直かどうかは `platform-boundary-reviewer` が判定する。**
「ホスト OS 規約」と書いてランタイム分岐を隠す行為は、grep では検出できないため
人間とレビュアーの責任範囲に残る。
<!-- BOOTSTRAP_SECTION_END principle=II -->

<!-- MIGRATE_SECTION_START principle=II -->
<!-- MIGRATE_SECTION_END principle=II -->

### Principle III: 権限モードの選択肢はランタイムの capability に従う (PLAN.md P-3)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: (grep での機械判定が困難。E2E で検証する。補助 grep: `grep -rn "permissionMode" src/ | grep -v "capabilities"`)
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=III -->
**Statement**: `capabilities.autoModeSafe === false` のランタイムで Auto / `bypassPermissions` を選択可能にしてはならない。`bypassPermissions` の選択には `allowDangerouslySkipPermissions: true` と明示確認を要求する。

**Why**: 隔離境界のない環境で無人実行を許すと、ファイルツール・MCP サーバ・hook がホストに対して無制限に動作する。`Win32Runtime` は sandbox を持たないため (PLAN.md §2.1)、UI 上で選べてしまうこと自体が事故経路になる。軸 3 (Docker サンドボックス) が存在する理由でもある。

**Examples**:
- ✓ Good: `Win32Runtime` 選択時、権限モードの Auto / bypass が `disabled` になる
- ✗ Bad: 選択は可能にしておき、起動時にエラーを出す — 選べる時点で誤操作の余地が残る

**Verification**:
- Automated: E2E で `Win32Runtime` 選択時に Auto / bypass が disabled であることを確認する
- Manual: `security-reviewer` / `ux-reviewer` (隔離状態の可視性、PLAN.md §6.4)
<!-- BOOTSTRAP_SECTION_END principle=III -->

<!-- MIGRATE_SECTION_START principle=III -->
<!-- MIGRATE_SECTION_END principle=III -->

### Principle IV: Claude Code との通信は Agent SDK 経由に限定する (PLAN.md P-4)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rnE "stream-json|\"type\":\s*\"(assistant|tool_use)\"" src/`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=IV -->
**Statement**: stream-json を自前でパースしてはならない。Claude Code との通信は `@anthropic-ai/claude-agent-sdk` の `query()` (V1 形式) を経由する。セッションの読み書きは `listSessions()` / `getSessionMessages()` / `getSessionInfo()` / `renameSession()` / `tagSession()` を使い、JSONL の自前パースを行わない。

**Why**: AD-002 のとおり stream-json の control protocol は SDK の**実装詳細**であり、バージョン間で変更されうる。自前パースは追随責任を自分で負うことを意味する。CLI レベルの制御が必要な場合は `pathToClaudeCodeExecutable` / `spawnClaudeCodeProcess` / `extraArgs` で足りる (AD-002)。セッションの正本は Claude Code 側にある (AD-007、Principle X)。

**Examples**:
- ✓ Good: `query({ prompt: asyncIterable, options })` の yield を型で受ける
- ✗ Bad: 子プロセスの stdout を行分割して `JSON.parse` し、`type` フィールドで分岐する

**Verification**:
- Automated: `src/` 内に stream-json のパース実装が存在しないこと
- Manual: `architecture-reviewer`
<!-- BOOTSTRAP_SECTION_END principle=IV -->

<!-- MIGRATE_SECTION_START principle=IV -->
<!-- MIGRATE_SECTION_END principle=IV -->

### Principle V: 長期資格情報を永続化しない (PLAN.md P-5)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rniE "(api_?key|oauth_?token|secret|password|aws_secret_access_key)\s*(TEXT|BLOB|VARCHAR)" src/` および `grep -rnE "console\.(log|error|warn)\([^)]*\benv\b" src/`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=V -->
**Statement**: API キー・OAuth トークン・AWS 長期キーを SQLite / 設定ファイル / プリセットに書いてはならない。永続化が必要なものは Electron `safeStorage` 経由で OS キーチェーンに預け、参照キーのみを保持する。一時資格情報はメモリ上のみで扱い、有効期限を監視する。ログへの混入も禁止する。

**Why**: AD-011 のとおり、資格情報の解決は可能な限り Claude Code に委譲する設計になっている (`apiKeyHelper` / `awsCredentialExport` / `awsAuthRefresh`)。アプリが秘密のライフサイクルに関与するほど漏洩面が広がる。`aws-assume-role` を選んだ場合も STS の一時資格情報のみを扱い、`RoleSessionName` にアプリ名とセッション ID を含めて CloudTrail で追跡可能にする (PLAN.md §5.2)。

**Examples**:
- ✓ Good: SQLite には `credential_ref TEXT` のみを持ち、実体は `safeStorage.decryptString()` で取り出す
- ✗ Bad: `ProviderProfile` をプリセットとして保存する際に `ANTHROPIC_API_KEY` の値を同梱する
- ✗ Bad: セッション起動時に `logger.debug('env', options.env)` を呼ぶ

**Verification**:
- Automated: SQLite スキーマに秘密値カラムが存在しないこと。ログ出力に `env` をそのまま渡す箇所がないこと
- Manual: `security-reviewer` (資格情報の取り扱い)、`database-reviewer` (スキーマ)
<!-- BOOTSTRAP_SECTION_END principle=V -->

<!-- MIGRATE_SECTION_START principle=V -->
<!-- MIGRATE_SECTION_END principle=V -->

### Principle VI: 永続環境を構築・変更しない (PLAN.md P-8)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: 文字列リテラル一致では不十分なため、**モジュール境界**で縛る。
  1. `grep -rnE "['\"](sudo|apt|apt-get)['\"]" src/` — 引数配列での構成も捕捉する
  2. `grep -rn -- "--import" src/` — `wsl --import` の検出
  3. `grep -rnE "['\"]docker(\.exe)?['\"]" src/ --exclude-dir=isolation` — docker CLI を
     名指してよいのは `isolation` 配下のみ
  4. `grep -rnE "['\"]build['\"]" src/isolation/` — docker サブコマンドとしての `build` の不在
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=VI -->
**Statement**: OS 設定の書き換え、パッケージのインストール、WSL ディストロの作成、Docker イメージのビルド、特権を要する操作を行ってはならない。**セッションに紐づく使い捨てコンテナの起動・破棄は例外**として認める。

**Why**: AD-008 が境界を定めている。アプリは「一覧を取得し提示する」「存在を確認し手順を案内する」側に立ち、環境の構築は利用者に委ねる。これにより利用者側の前提を最小限に保てる (PLAN.md §13.3)。一方で「使い捨てコンテナのライフサイクル管理」を放棄すると軸 3 が成立しないため、ここだけを明示的な例外とする。推奨 Dockerfile は**ドキュメントとして同梱**するが、アプリがビルドすることはない (PLAN.md §6.5)。

**Examples**:
- ✓ Good: 指定イメージの存在を確認し、無ければ推奨 Dockerfile とビルド手順を案内する
- ✓ Good (例外): セッション開始時に `docker run` で使い捨てコンテナを起動し、終了時に破棄する
- ✗ Bad: `docker build` を呼ぶ / `/etc/wsl.conf` を編集する / bubblewrap を導入する

**Verification**:
- Automated: 上記 4 つの grep がいずれも空であること
- **注意**: 単純な `grep "docker build"` / `grep "docker run"` では不十分である。
  AD-012 の `wsl:<distro>` endpoint ではコマンドが
  `['wsl.exe', '-d', distro, '--', 'docker', 'run', ...]` のような**引数配列**で構成され、
  リテラル `docker run` が現れないためすり抜ける。
  そのため「docker CLI を名指せるモジュールを 1 つに限定し、その内側でサブコマンドを検査する」
  という形に変えてある
- Manual: `security-reviewer` (環境非干渉)、`platform-boundary-reviewer`
<!-- BOOTSTRAP_SECTION_END principle=VI -->

<!-- MIGRATE_SECTION_START principle=VI -->
<!-- MIGRATE_SECTION_END principle=VI -->

### Principle VII: supervisor は Electron に依存しない (PLAN.md P-9)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rnE "from ['\"]electron['\"]" src/supervisor/` および `grep -rnE "require\(['\"](better-sqlite3|node-pty)['\"]\)" src/supervisor/`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=VII -->
**Statement**: supervisor は Electron API に依存してはならず、**ネイティブモジュールにも依存してはならない**。`node dist/supervisor.js` として単独起動でき、標準入出力経由でプロトコルを話せる形を保つ。SQLite アクセスは main process 側に置く。

**Why**: AD-010 の目的は (1) Electron を立てずにテストできること、(2) AD-001 (Electron 採用) の後戻り可能性の担保。ネイティブ依存を持たせない理由は、Electron 同梱 Node とホスト Node で `NODE_MODULE_VERSION` が異なるため、`better-sqlite3` のような依存があると 2 種類のビルドが必要になり単独起動可能性が実質的に失われるからである (AD-013)。

**Examples**:
- ✓ Good: supervisor はプロトコル配管に徹し、永続化要求を main process に転送する
- ✗ Bad: `import { utilityProcess } from 'electron'` を supervisor 内に書く
- ✗ Bad: supervisor が `better-sqlite3` で sessionStore を直接書く

**Verification**:
- Automated: ESLint が `supervisor/` 配下での `electron` import を error にする。ネイティブモジュールの import も同様に禁止する
- Manual: `architecture-reviewer`、`platform-boundary-reviewer`
<!-- BOOTSTRAP_SECTION_END principle=VII -->

<!-- MIGRATE_SECTION_START principle=VII -->
<!-- MIGRATE_SECTION_END principle=VII -->

### Principle VIII: 日本語環境で破綻しない (PLAN.md P-13)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rnE "onKeyDown|key === 'Enter'" src/ | grep -v "isComposing"` (composer の IME ガード漏れ検出)
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=VIII -->
**Statement**: IME 変換確定時の誤送信、フォント崩れ、全角混在時のレイアウト崩れを許容しない。composer は変換確定の Enter を送信として扱ってはならない。

**Why**: PLAN.md §1.3 は「UI は機能の付随物ではなく、採否を決める要素である」と規定し、「日本語が崩れる UI は、機能が揃っていても使われない」と述べている。AD-001 で Electron を選んだ理由の一つが、`isComposing` と `compositionend` / `keydown` の発火順序がブラウザエンジン間で異なり、2 エンジン分の検証コストを受け入れられないことだった。§13.2 で WSLg を使わない理由もこの Principle である。つまり本 Principle は複数のアーキテクチャ決定の根拠になっている。

**Examples**:
- ✓ Good: `if (e.nativeEvent.isComposing) return;` を Enter ハンドラの先頭に置く
- ✗ Bad: `compositionend` の直後に届く Enter を送信として処理する
- ✗ Bad: 等幅フォント指定で全角文字の桁幅が崩れる terminal block

**Verification**:
- Automated: composer の IME テストケースが E2E に存在すること。日本語を含むスクリーンショット比較が CI に存在すること
- Manual: `ux-reviewer`、`a11y-reviewer`
- **現状の制約**: CI が未構築のため Automated 側は実行不能。SPIKE-4 (X-2 の前) の結果と CI 構築時期を合わせて再確認すること
<!-- BOOTSTRAP_SECTION_END principle=VIII -->

<!-- MIGRATE_SECTION_START principle=VIII -->
<!-- MIGRATE_SECTION_END principle=VIII -->

## Standard Principles

> 違反は High / Medium。`should` 形式。

### Principle IX: main process をブロックしない (PLAN.md P-6)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rn "JSON.parse" src/ --exclude-dir=supervisor | grep -iE "chunk|stdout|stream|line"`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=IX -->
**Statement**: stream の逐次パースは supervisor (`utilityProcess`) 側で行うべきであり、main process で行うべきではない。

**Why**: AD-006 のとおり tool_result が数 MB になることがあり、main process で `JSON.parse` するとウィンドウが固まる。10 セッション並列を想定する以上 (X-5)、1 セッションの巨大な tool_result が全体を止める構造は許容できない。

**Examples**:
- ✓ Good: supervisor がパース済みの構造体を MessagePort で renderer に直送する
- ✗ Bad: main process が stdout chunk を受けて `JSON.parse` してから renderer へ転送する

**Exceptions**: 設定ファイルのような小さく境界の明確な JSON の同期読み込みは対象外。

**Verification**:
- Automated: supervisor 外に stream の `JSON.parse` 処理が存在しないこと
- Manual: `architecture-reviewer`
<!-- BOOTSTRAP_SECTION_END principle=IX -->

<!-- MIGRATE_SECTION_START principle=IX -->
<!-- MIGRATE_SECTION_END principle=IX -->

### Principle X: セッションの正本はアプリ外にある (PLAN.md P-7)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: (構造的判断のため grep 不可。ユニットテストで検証)
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=X -->
**Statement**: アプリのストアはキャッシュまたはインデックスとして扱うべきであり、正本として扱うべきではない。矛盾したときは Claude Code 側を正とする。

**Why**: AD-007。セッションは Claude Code が `<config-dir>/projects/<encoded-cwd>/<uuid>.jsonl` に永続化しており、アプリの外で `claude` CLI から直接操作されうる。アプリ側を正本にすると、CLI で続きを進めたセッションと齟齬が生じる。`DockerRuntime` ではコンテナ内に JSONL が閉じるため `sessionStore` アダプタでホスト側 SQLite にミラーするが、これはキャッシュであってミラー側を正本に昇格させない。

**Examples**:
- ✓ Good: `listSessions()` の再取得結果でキャッシュを上書きする
- ✗ Bad: ローカル SQLite の更新時刻が新しいことを理由に SDK の結果を捨てる

**Exceptions**: `DockerRuntime` のミラーは、コンテナ破棄後は唯一の残存コピーになる。この場合に限りミラーを読み取り専用の履歴として扱ってよい。

**Verification**:
- Automated: セッション一覧の再取得でキャッシュが上書きされること (ユニットテスト)
- Manual: `architecture-reviewer`、`database-reviewer`
<!-- BOOTSTRAP_SECTION_END principle=X -->

<!-- MIGRATE_SECTION_START principle=X -->
<!-- MIGRATE_SECTION_END principle=X -->

### Principle XI: 各 feature は単体で動作確認可能な垂直スライスとする (PLAN.md P-10)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: (spec の受け入れ条件を読む必要があるため grep 不可)
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=XI -->
**Statement**: 各 feature は単体で動作確認できる垂直スライスであるべきで、層だけを横に作る feature を切ってはならない。

**Why**: PLAN.md §10 は 1 feature = 1 branch = 1 spec と定め、M1 を 3 feature に抑えて「最短で見栄えの判断材料を出す」構成にしている。層単位で切ると M1 の終わりまで何も見えず、UI の方向性を確定できない。

**Examples**:
- ✓ Good: R-3「transcript の基本表示」— 過去ログを実際に画面で読める
- ✗ Bad: 「SQLite スキーマ定義のみ」— 観測可能な振る舞いがない

**Exceptions**: R-1 のような基盤 feature は UI を持たないが、パス変換のユニットテストという観測可能な振る舞いを持つ。

**Verification**:
- Automated: なし
- Manual: 各 spec の受け入れ条件に観測可能な振る舞いが 1 つ以上含まれること (`po-reviewer`)
<!-- BOOTSTRAP_SECTION_END principle=XI -->

<!-- MIGRATE_SECTION_START principle=XI -->
<!-- MIGRATE_SECTION_END principle=XI -->

### Principle XII: Claude Code が emit する情報に未表示のものを残さない (PLAN.md P-11)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0 (ただし対象は UI 系 feature の完了時点。開発途上の未割当は違反としない)
- `bad_pattern_grep`: `grep -nE "^\|.*\|\s*(未割当|TBD|—)\s*\|" docs/ui-coverage.md`
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=XII -->
**Statement**: SDK のメッセージ型・tool 名・システムイベントの対応表を `docs/ui-coverage.md` に維持し、各項目に表示実装を割り当てるべきである。未割当が残っている間、UI 系 feature を `completed` にしてはならない。

**Why**: PLAN.md §4.1 は UI 完成を「Claude Code が emit する情報のうち、専用表示を持たないものをゼロにする」と定義している。対応表がなければ「完成」を判定できず、軸 1 が検証不能な目標になる。

**Examples**:
- ✓ Good: 新しい tool に対応する際、`docs/ui-coverage.md` の行追加を同一 PR に含める
- ✗ Bad: 実装だけ入れて対応表を後で更新する

**Exceptions**: Tier C (Voice 系 / Generative 22 要素 / Image generation 等) は対象外と明記した上で表に残す。

**Verification**:
- Automated: `docs/ui-coverage.md` の対応表に未割当行が存在しないこと
- Manual: `ui-coverage-reviewer` (未配置。`/cl-add-reviewer` で追加予定)、`ux-reviewer`
<!-- BOOTSTRAP_SECTION_END principle=XII -->

<!-- MIGRATE_SECTION_START principle=XII -->
<!-- MIGRATE_SECTION_END principle=XII -->

### Principle XIII: assistant-ui の element と design system を優先する (PLAN.md P-12)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rnE "--color-|colors:\s*\{|spacing:\s*\{" src/ tailwind.config.*` (独自トークン追加の検出)
- `adoption_date`: 2026-09-13

<!-- BOOTSTRAP_SECTION_START principle=XIII -->
**Statement**: 同等の element が存在する UI を自作すべきではない。独自のカラートークン・スペーシングスケールを追加すべきではない。

**Why**: PLAN.md §4.5。assistant-ui は 143 の element を持ち、design system に乗ることで一貫性と保守コストの両方が得られる。独自トークンを増やすと、assistant-ui のバージョン更新時に見た目が割れる。

**Examples**:
- ✓ Good: Tool fallback AUI をカスタマイズして Bash 用の Terminal block に寄せる
- ✗ Bad: 既存の Code diff element を無視して自前の diff ビューを書く

**Exceptions**: 対応する element が存在しない場合は自作してよい。その場合 PR 説明に「対応する element が存在しないこと」を記載する。

**Verification**:
- Automated: なし
- Manual: 自作コンポーネント追加時、対応する element が存在しないことを PR 説明に記載すること (`convention-reviewer` / `ux-reviewer`)
<!-- BOOTSTRAP_SECTION_END principle=XIII -->

<!-- MIGRATE_SECTION_START principle=XIII -->
<!-- MIGRATE_SECTION_END principle=XIII -->

## Glossary 関連 Principle

### Principle XIV: Ubiquitous Language

<!-- BOOTSTRAP_SECTION_START principle=XIV -->
`docs/glossary.md` の **Canonical Terms** section に記載の用語を code / spec / UI で一貫使用する。同義異語は禁止 (Candidate Terms section の用語は使用前に canonical 昇格レビュー必須)。新規用語は glossary 追記 + reviewer 確認後に code 投入。

初期の canonical 候補は `PLAN.md` 付録A の 11 語: Closta / セッション / Provider / ランタイム / capabilities / SessionLaunchConfig / Element / Tier A-C / HostPath / RuntimePath。`docs/glossary.md` は未作成のため、glossary 作成時に付録A を一次素材とする。
<!-- BOOTSTRAP_SECTION_END principle=XIV -->

<!-- MIGRATE_SECTION_START principle=XIV -->
<!-- MIGRATE_SECTION_END principle=XIV -->

### Principle XV: Multi-language consistency

<!-- BOOTSTRAP_SECTION_START principle=XV -->
日本語 / 英語の使い分けルール:

- **Code identifiers**: 英語のみ
- **UI labels**: 日本語を第一言語とする。i18n リソース化の要否は M3 (O-1〜O-3) までに判断する
- **Documentation / spec**: 日本語を SSoT とする (PLAN.md / Constitution / spec がすべて日本語であるため)
- **Commit message**: 英語。件名 1 行の最小限の表現とし、attribution 行を付けない
<!-- BOOTSTRAP_SECTION_END principle=XV -->

<!-- MIGRATE_SECTION_START principle=XV -->
<!-- MIGRATE_SECTION_END principle=XV -->

## Domain-specific Principles

各 domain (`docs/domains/<name>/charter.md`) で固有の Principle がある場合、charter 側で記述し、本ファイルからリンクする。

現時点で `docs/domains/` は未作成。PLAN.md §10 の feature バックログから想定される domain 候補は `runtime` / `session` / `provider` / `ui` / `container`。

## 未解決の Principle 候補 (人間レビュー対象)

`/spec-gate scan` が blocking と判定した requirement_gap 由来。PLAN.md §8 には存在しないため、採否を人間が決める必要がある。

1. **セッション transcript ミラーの保持期限と削除経路** — AD-007 / §6.3 が会話全文をホスト側 SQLite にミラーすると宣言しているが、保持期限・削除 UI・エクスポート・第三者送信の有無がいずれも未記述。Principle V (資格情報) の隣に置く候補。
2. **配布物のライセンス表記** — D-1 (M5) で Windows インストーラを配布する計画に対し、`LICENSE` / `NOTICE` が不在。Electron / node-pty / better-sqlite3 / xterm.js 等の再配布は帰属表示義務を伴う。

## Existing violations summary

本プロジェクトはソースコード 0 行の greenfield であるため、全 Principle の `existing_violations` は 0 である。実測による enumeration は最初の実装 feature (R-1) の完了後に行う。

<!-- MIGRATE_SECTION_START existing-violations-summary -->
| Principle | existing_violations | bad_pattern_grep | paths |
|---|---|---|---|
<!-- MIGRATE_SECTION_END existing-violations-summary -->

## Governance

### 優先順位

本 Constitution は他のすべての慣行に優先する。`status: active` の Principle は
accepted ADR と同等の権威を持つ。Principle と ADR が食い違う場合は Constitution を正とし、
ADR 側を追随させるか、Constitution の改定手続きを踏む。

`PLAN.md` は本 Constitution の入力であって上位文書ではない。

### 準拠レビュー

- すべての PR は `/cl-code-gate` と `/cl-pr-gate` を通過すること
- NON-NEGOTIABLE Principle への違反は **Critical** として扱い、gate を PASS させない。
  CI で自動検証されていない場合でも、reviewer が指摘した時点で同様とする
- Standard Principle への違反は **High / Medium**。`Exceptions` に該当する場合は
  PR 説明に理由を記載する
- 複雑さは正当化を要する。`plan.md` の Complexity Tracking に記録すること

### 改定

改定手順は本文書冒頭の「改定手順」節に定める。要約すると、
ADR での議論記録 → `architecture-reviewer` を交えた人間レビュー → SemVer でのバージョン更新 →
Amendment trail への追記 → 既存違反の enumeration、の 5 段階である。

### バージョニング方針

| 変更 | bump |
|---|---|
| Principle の削除、後方非互換な再定義 | MAJOR |
| Principle の追加、指針の実質的な拡張 | MINOR |
| 表現の修正、誤記の訂正、非意味的な refinement | PATCH |

### Amendment trail

| version | date | 変更 |
|---|---|---|
| 1.0.0 | 2026-09-13 | 初回批准。PLAN.md §8 の P-1〜P-13 を素材に 15 Principle を確立 |
| 1.1.0 | 2026-09-13 | Principle II の検証条件に `platform-ok:` 注記による例外を追加。Electron 公式テンプレートの `window-all-closed` / `icon` 分岐は除去不能であり、元の grep はどの Electron アプリでも達成できなかった (AD-023) |

## References

- 素材: [PLAN.md §8](../../PLAN.md) — Constitution Principle 候補 P-1〜P-13
- Domain Charter: [docs/domains/](../../docs/domains/)
- ADRs: [docs/decisions/](../../docs/decisions/)
- Glossary: [docs/glossary.md](../../docs/glossary.md)
- Section ownership 仕様: 本ファイル冒頭 `Sync Impact Report` コメントを参照

---

**Version**: 1.1.0 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-09-13
