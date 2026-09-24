---
status: active
version: 1.2.6
ratified: 2026-09-13
last_amended: 2026-09-24
generated_by: /speckit.constitution (素材: /spec-gate bootstrap Phase 6 の draft)
---

<!--
Sync Impact Report (v1.2.6)
- Version change: 1.2.5 → 1.2.6
- Last amended: 2026-09-24
- Bump rationale: PATCH。Principle IX の「現状の制約」に R-3 (AD-034) の事実追記のみ。
  statement も指針も変えていない (バージョニング方針表「Verification の現状の制約の事実追随は PATCH」)

Modified sections:
- Principle IX (Verification 現状の制約) — R-3 が transcript 本文を `MessageChannelMain` の
  port transfer で取得プロセス↔renderer 直通で運び main を本文経路から外したことを追記。
  **到達集合検査は依然未構築**であることを明記し「解決済み」とは書かない (AD-034 / R-3 SH-062)。
  到達集合検査の持ち主 feature を docs/roadmap.md に登録した (R-3 SH-062b)

Templates requiring updates:
- ✅ docs/decisions/0034-transcript-read-path-and-process-boundary.md — 本 PATCH の根拠 ADR (accepted)
-->

<!--
Sync Impact Report (v1.2.5)
- Version change: 1.2.4 → 1.2.5
- Last amended: 2026-09-23
- Bump rationale: PATCH。バージョニング方針表に Governance 行と Verification 行を足し、
  v1.2.4 の判定根拠を表から導ける形にした。Principle の増減も指針の変更も無い
  (pr-gate Round 4 / M4-12 / A3-007)

Modified sections:
- バージョニング方針 — **Governance への規則追加は MINOR**、
  **Verification の「現状の制約」の事実追随は PATCH** の 2 行を追加。
  v1.2.4 は改定手順に新規則を足しながら表に該当行が無く、PATCH の妥当性を導けなかった。
  版番号は遡って振り直さない (既に参照されており trail が壊れる)

Sync Impact Report (v1.2.4)
- Version change: 1.2.3 → 1.2.4
- Last amended: 2026-09-23
- Bump rationale: PATCH として発行した。**本表の現在の行に照らすと MINOR 相当である**
  (Governance への規則追加)。判定基準が当時の表に無かったことが原因で、
  v1.2.5 で表の側を直した。版番号は振り直さない

Modified sections:
- Governance / 改定手順 — **ADR の in-place 訂正の規則**を追加 (AD-031)。
  事実誤認の訂正は日付つき「訂正」節として in-place、決定の変更は後続 ADR。
  AD-028 §2 の immutability 宣言を読み替える
- Principle IX (Verification) — **「`bad_pattern_grep` はパースコードの置き場を見るだけで、
  どのプロセスで走るかは見ていない」**を明記。R-2 の列挙応答は main でパースされるが
  検査は 0 件を返す。`existing_violations: 0` は遵守の証拠ではない

Follow-up (pr-gate Round 4 で判明 / AD-031 に訂正節を追加済み):
- AD-031 が許容根拠に挙げた「`TEXT_MAX_BYTES` で縛られている」は**事実でない**
  (`src/agents/` に 0 件)。許容根拠は「本文を運ばない」の 1 本
- AD-031 が「先例 5 件すべてが事実誤認の訂正」とした分類は誤り。
  AD-028 の訂正節は規則そのものを差し替えている。
  規則を「**訂正節に決定の変更を書いてはならない**」に言い換えた
- Principle IX 再評価の持ち主を `docs/roadmap.md` の R-3 行に登録した

Sync Impact Report (v1.2.3)
- Version change: 1.2.2 → 1.2.3
- Last amended: 2026-09-17
- Bump rationale: PATCH。Principle VIII の Automated 検証の**延期先**を事実に改めるのみ。
  指針そのものは変えていない (AD-028 §5)

Modified principles:
- Principle VIII (日本語環境で破綻しない) — Automated の延期先から **R-2 を外した**。
  R-2 (セッション列挙) は読み取り専用であり composer の送信経路を開けないため
  (A) の発動条件を満たさず、目標レイアウト ADR が未採択のため (B) の基準画像は
  撮り直しが確定する。**延期先を空にしない** — 「M4 完了後に再検討する」とし、
  E2E 基盤の持ち主 feature を `docs/roadmap.md` に登録する

Templates requiring updates:
- ✅ docs/decisions/0028-session-enumeration-process-and-unc-handoff.md §5 —
     AD-024 #18 の読み替えの根拠 (AD-024 は immutable なので本文は変更しない)
- ✅ docs/domains/session/charter.md — KPI「列挙の網羅」の計測経路に同じ留保を付ける
- ⚠ docs/roadmap.md — E2E 基盤の持ち主 feature は **M4 完了後に決める** (未登録)
-->


<!--
Sync Impact Report (v1.2.2)
- Version change: 1.2.1 → 1.2.2
- Last amended: 2026-09-16
- Bump rationale: PATCH。Principle VIII の Verification の「現状の制約」に書いた
  事実誤認の訂正のみ。指針そのものは変えていない (AD-024 #18 の訂正)

Modified principles:
- Principle VIII (日本語環境で破綻しない) — Automated (A) を載せない根拠を
  「composer が無いため対象が無い」から「composer は描画されるが
  `isDisabled: true` で送信経路を閉じている」に改めた。
  `bad_pattern_grep` が送信経路 (`@assistant-ui/react` の内側) を構造的に
  見られないため `existing_violations: 0` が遵守を意味しないことを明記した

Templates requiring updates:
- ✅ docs/decisions/0024-constitution-verification-paths.md — #18 と
     「Principle VIII の Automated 検証を R-1 でどこまで載せるか」を訂正
- ✅ src/renderer/src/features/chat/ChatScreen.test.tsx — 前提を固定する回帰テスト
-->

<!--
Sync Impact Report (v1.2.1)
- Version change: 1.2.0 → 1.2.1
- Last amended: 2026-09-15
- Bump rationale: PATCH。Principle VIII の Verification の「現状の制約」の表現修正のみ。
  指針そのものは変えていない (AD-024 #18)

Modified principles:
- Principle VIII (日本語環境で破綻しない) — 「CI が未構築のため Automated 側は実行不能」を
  実体に改めた。CI は SH-022 で構築済みであり、この理由はもう成り立たない。
  内訳は (A) composer が無いため**対象が無い**、
  (B) スクリーンショット比較は R-2 の E2E 基盤に相乗りする、の 2 つである

Templates requiring updates:
- ✅ docs/decisions/0024-constitution-verification-paths.md — #18 と
     「Principle VIII の Automated 検証を R-1 でどこまで載せるか」を追記し、
     同名の Open Question を閉じた
- ✅ .github/workflows/verify.yml — CI 本体 (SH-022)
-->

<!--
Sync Impact Report (v1.2.0)
- Version change: 1.1.0 → 1.2.0
- Last amended: 2026-09-15
- Bump rationale: MINOR。Principle の追加・削除ではなく、検証条件と本文の実体合わせ。
  ただし #13 (III) / #14 (I) は NON-NEGOTIABLE の改定にあたるため既存違反 enumeration を伴う
- 根拠: docs/decisions/0024-constitution-verification-paths.md (AD-024。17 項目)

Modified principles (v1.1.0 からの変更):
- I   — Statement を「domain が公開するパス API を経由」に改め、Automated の正本を
        lint + グラフ検証へ移し、ディレクトリ除外を許可ファイル方式に変えた (#7 / #14)
- II  — 許可ディレクトリを実名で限定し、Automated の正本を検証スクリプトへ移した。
        例外注記に「整形器が動かさない位置に置く」を補った (#8)
- III — `autoModeSafe === false` を `!== true` に改め、判定を単一関数に定めた (#13)
- V   — 設定ファイル (JSON / YAML) の永続化スキーマを検証対象に加えた (#9)
- VI  — 許可リストの正本を検証スクリプト内の定数に移し、検証スコープに
        `scripts/` とビルド構成を加え、報告を 3 状態にした (#3 / #4 / #5)
- VII — 対象ディレクトリを `src/supervisor/` から `src/agents/` に直し、
        import / require 両形式と推移的到達をグラフ検証で見る形にした (#1 / #2)
- IX  — `--exclude-dir=supervisor` を `src/agents/` に読み替えた (#6)
- XI  — Exceptions の「基盤 feature は UI を持たない」を「観測可能な振る舞いが
        1 つ以上あれば足りる」に改めた (#15)
- XIII — `bad_pattern_grep` が `--` 始まりで実行不能だった点を修正し、標準テーマの写しを
        ファイル単位の除外リストにした。Exceptions を「候補を実名で照合したうえで不適合」に改めた (#10 / #11)
- XIV — 「glossary は未作成」を削り現行 glossary を正本にした (#16)
- XV  — 表層文書 (README / LICENSE / NOTICE 等) を英語 SSoT とする Exceptions を追加した (#12)

Modified sections:
- Domain-specific Principles — 「docs/domains/ は未作成」を事実に合わせた
- 未解決の Principle 候補 #2 — 自プロジェクトの LICENSE を解消済みとし、
  残余 (第三者依存の NOTICE) を D-1 の着手条件に限定した (#17)
- Existing violations summary — R-1 Phase 2 完了時点の実測値に置き換えた

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — Constitution Check の表記を追随させた (#14)
- ✅ PLAN.md — P-1 に追随メモを入れ、正本が Constitution であることを明記した (#14)
- ✅ .claude/agents/platform-boundary-reviewer.md — PB-4 の条件式と
     Principle VII のディレクトリ名、lint の穴の見方を追随させた (#13 / #1 / #2)
- ✅ .specify/spec-gate/reviewers.yml — database-reviewer に設定層を追加し、
     platform-boundary-reviewer の発火パスを実在するものに直した (#9 / #1 / #6)
- ✅ docs/domains/isolation/charter.md — 権限ゲートの条件式を `!== true` に直した (#13)
- ✅ CI — `.github/workflows/verify.yml` を SH-022 で構築した。
     Principle VIII の Automated をどこまで載せるかは **v1.2.1 (AD-024 #18)** で決着
-->

<!--
Sync Impact Report (v1.0.0)
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

1. ADR (`docs/decisions/<NNNN>-...md`) で議論を記録。
   **accepted な ADR の扱いは
   [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md)
   に従う** — 採択当日 / 実装時に判明した**事実誤認の訂正**は日付つきの「訂正」節として
   in-place で書いてよい。**決定そのものの変更は後続 ADR に置く**
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
- `bad_pattern_grep`: (補助。正本は lint + グラフ検証。
  `grep -rnE "from ['\"](node:)?path['\"]" src/ | grep -v "src/domain/runtime/path-api.ts"`)
- `adoption_date`: 2026-09-13
- `amended`: 2026-09-15 (AD-024 #7 / #14)

<!-- BOOTSTRAP_SECTION_START principle=I -->
**Statement**: アプリケーションコードは `node:path` / `path` を直接 import してはならない。パス操作は `domain` が公開するパス API を経由する。ランタイム名前空間の操作は `AgentRuntime.path` として公開し、**ホスト名前空間の操作と接頭辞照合は同モジュール群の別の公開面**とする。標準モジュールを直接 import してよいのは実装ファイル 1 つに限る (AD-024 #14)。

**Why**: AD-004 により `HostPath` と `RuntimePath` は branded type で名前空間が分離されている。`WslRuntime` では `C:\Users\y\p` と `/home/y/p` が同時に存在し、どちらの名前空間のパスかを型で追跡できなければ transcript ディレクトリ (`<config-dir>/projects/<encoded-cwd>/`) の解決が壊れる。開発ホストが Windows 11 + WSL2 であるため、この状況は R-2 の時点で日常的に発生する (PLAN.md §10.1)。

**Examples**:
- ✓ Good: `runtime.path.join(cwd, 'projects')` — ランタイムの名前空間で解決される
- ✗ Bad: `import path from 'node:path'; path.join(hostPath, runtimePath)` — 2 つの名前空間を混在させる

**Verification**:
- Automated (正本): `eslint.config.mjs` の `no-restricted-imports` と `boundaries/dependencies` が
  **許可ファイル 1 つ** (`src/domain/runtime/path-api.ts`) 以外での import を error にする。
  `.dependency-cruiser.js` の `path-module-only-from-path-api` が `require()` 形式も塞ぐ
- Manual: `architecture-reviewer` / `platform-boundary-reviewer` がパス生成箇所を確認する
- **ディレクトリ単位の除外は使わない** (AD-024 #7)。`src/domain/runtime/` 配下すべてが免除されてしまう
<!-- BOOTSTRAP_SECTION_END principle=I -->

<!-- MIGRATE_SECTION_START principle=I -->
<!-- MIGRATE_SECTION_END principle=I -->

### Principle II: プラットフォーム分岐は `AgentRuntime` 実装の内側に閉じる (PLAN.md P-2)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: (補助。正本は `scripts/constitution/check.mjs` 項目 8。`grep -rn "process.platform" src/ | grep -v "src/main/infra/runtime/" | grep -v "platform-ok"`)
- `adoption_date`: 2026-09-13
- `amended`: 2026-09-15 (AD-024 #8)

<!-- BOOTSTRAP_SECTION_START principle=II -->
**Statement**: `process.platform` などによるプラットフォーム分岐を `runtime/` の外に書いてはならない。posix / win32 の差は各 `AgentRuntime` 実装が内部で吸収する。

**Why**: AD-003 はランタイム抽象を**トランスポート軸**で切っており (Direct / WSL / Win32 / Docker)、プラットフォーム軸は持たない。UI やサービス層に `process.platform` が漏れると、`DockerRuntime` のようにホスト OS とランタイム OS が一致しないケースで誤った分岐を選ぶ。

**Examples**:
- ✓ Good: `runtime.capabilities.autoModeSafe` で振る舞いを決める
- ✗ Bad: `if (process.platform === 'win32') { /* sandbox なし扱い */ }` — Docker 経由なら成立しない

**Verification**:
- Automated (正本): `scripts/constitution/check.mjs` 項目 8。**許可ディレクトリを実名で限定**する
  (`scripts/constitution/allowlists.mjs` の `PLATFORM_BRANCH_DIRS`)。
  検査対象は識別子の直接参照だけでなく、**等価な API** (`os.platform()` / `os.type()`) と
  **構文変形** (分割代入・ブラケット記法) を含む
- Manual: `platform-boundary-reviewer`

**例外の書き方**: Electron 自身のホスト OS 規約（macOS の `window-all-closed` で
`app.quit()` しない、Linux でのみ `BrowserWindow` に `icon` を渡す）は、
**ランタイム選択ではなくホスト OS のアプリ規約**であり、本 Principle の対象外である。
これらは除去できないため、**`process.platform` と同じ行の末尾**に
`// platform-ok: <理由>` を書く。前の行に書くと grep が拾えず例外にならない。
注記のない `process.platform` は違反として扱う。

**判定をいったん変数に受け、その行に注記を置く。** `if` の条件式に直接書くと
prettier が注記を次の行へ送り、「同じ行」という条件を満たさなくなる
(R-1 実装時に実測。AD-024)。

```ts
const isMac = process.platform === 'darwin' // platform-ok: <理由>
if (!isMac) { ... }
```

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
- `amended`: 2026-09-15 (AD-024 #13)

<!-- BOOTSTRAP_SECTION_START principle=III -->
**Statement**: `capabilities.autoModeSafe !== true` のランタイムで Auto / `bypassPermissions` を選択可能にしてはならない。**`autoModeSafe` は 3 値 (`true` / `false` / `unknown`) であり、判定は単一の関数に集約する** (`isAutoModeAllowed`)。`=== false` と書くと判定中 (`unknown`) が素通りする (AD-024 #13)。`bypassPermissions` の選択には `allowDangerouslySkipPermissions: true` と明示確認を要求する。

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
- `amended`: 2026-09-15 (AD-024 #9)

<!-- BOOTSTRAP_SECTION_START principle=V -->
**Statement**: API キー・OAuth トークン・AWS 長期キーを SQLite / 設定ファイル / プリセットに書いてはならない。永続化が必要なものは Electron `safeStorage` 経由で OS キーチェーンに預け、参照キーのみを保持する。一時資格情報はメモリ上のみで扱い、有効期限を監視する。ログへの混入も禁止する。

**Why**: AD-011 のとおり、資格情報の解決は可能な限り Claude Code に委譲する設計になっている (`apiKeyHelper` / `awsCredentialExport` / `awsAuthRefresh`)。アプリが秘密のライフサイクルに関与するほど漏洩面が広がる。`aws-assume-role` を選んだ場合も STS の一時資格情報のみを扱い、`RoleSessionName` にアプリ名とセッション ID を含めて CloudTrail で追跡可能にする (PLAN.md §5.2)。

**Examples**:
- ✓ Good: SQLite には `credential_ref TEXT` のみを持ち、実体は `safeStorage.decryptString()` で取り出す
- ✗ Bad: `ProviderProfile` をプリセットとして保存する際に `ANTHROPIC_API_KEY` の値を同梱する
- ✗ Bad: セッション起動時に `logger.debug('env', options.env)` を呼ぶ

**Verification**:
- Automated: SQLite スキーマに秘密値カラムが存在しないこと。ログ出力に `env` をそのまま渡す箇所がないこと。
  **SQL のカラム型だけに依存しない** — 設定ファイル (JSON / YAML) の永続化スキーマも対象に含める
  (AD-024 #9)。R-1 の永続化は JSON であり、SQL を見る検証では届かない
- Manual: `security-reviewer` (資格情報の取り扱い)、`database-reviewer` (スキーマ**と設定層**)
<!-- BOOTSTRAP_SECTION_END principle=V -->

<!-- MIGRATE_SECTION_START principle=V -->
<!-- MIGRATE_SECTION_END principle=V -->

### Principle VI: 永続環境を構築・変更しない (PLAN.md P-8)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: (補助。**正本は `scripts/constitution/check.mjs` 項目 1 〜 7 / 9**。AD-024 #3 / #4 / #5)
- `allowlist_source`: `scripts/constitution/allowlists.mjs` — **正本。追加には ADR を要する**
- `amended`: 2026-09-15 (AD-024 #3 / #4 / #5)
- 旧条件 (参考。文字列リテラル一致では不十分なため、**モジュール境界**で縛る):
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
- Automated (正本): `scripts/constitution/check.mjs`。許可リストは
  `scripts/constitution/allowlists.mjs` に置き、**追加には ADR を要する** (FR-041)。
  検証項目は research R-08 の 11 項目で、Principle VI に対応するのは次の 8 つ。

  | # | 内容 |
  |---|---|
  | 1 | 特権コマンド文字列の不在 (**Linux / Windows 両方**。引数配列も捕捉) |
  | 2 | `wsl.exe` に渡す引数が**許可リスト**内であること |
  | 3 | `wsl.exe` を名指せるモジュールの許可リスト |
  | 4 | docker CLI を名指せるモジュールの許可リスト |
  | 5 | 許可モジュール内にイメージ構築サブコマンドが無いこと |
  | 6 | ディストロ内で実行するスクリプトが定義済みの内容と一致すること (3 点検査) |
  | 7 | プロセス起動 API を使えるモジュールの許可リスト |
  | 9 | **OS へのプロトコル関連付け API の呼び出しの不在** |

- **検証スコープは `src/` に限らない** (AD-024 #5)。`scripts/` とビルド構成
  (`package.json` の scripts / CI 定義 / パッケージング設定) を含める。
  **除外はファイル単位の明示リスト**とし、ディレクトリ単位で除外してはならない —
  そこに後から実行可能コードが増えたときに検証が構造的に届かなくなる
- **結果は 3 状態で報告する** — `ok` / `violation` / **`pending` (検査対象がまだ存在しない)**。
  `pending` を `ok` に混ぜると「まだ書いていないから通った」と「検証したから通った」が
  区別できなくなる
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
- `bad_pattern_grep`: (補助。正本は lint + グラフ検証。**対象ディレクトリは `src/agents/`**。
  `grep -rnE "from ['\"]electron['\"]" src/agents/` および
  `grep -rnE "(require|import)\(?['\"](better-sqlite3|node-pty|keytar)['\"]" src/agents/`)
- `adoption_date`: 2026-09-13
- `amended`: 2026-09-15 (AD-024 #1 / #2)

<!-- BOOTSTRAP_SECTION_START principle=VII -->
**Statement**: supervisor は Electron API に依存してはならず、**ネイティブモジュールにも依存してはならない**。`node dist/supervisor.js` として単独起動でき、標準入出力経由でプロトコルを話せる形を保つ。SQLite アクセスは main process 側に置く。

**Why**: AD-010 の目的は (1) Electron を立てずにテストできること、(2) AD-001 (Electron 採用) の後戻り可能性の担保。ネイティブ依存を持たせない理由は、Electron 同梱 Node とホスト Node で `NODE_MODULE_VERSION` が異なるため、`better-sqlite3` のような依存があると 2 種類のビルドが必要になり単独起動可能性が実質的に失われるからである (AD-013)。

**Examples**:
- ✓ Good: supervisor はプロトコル配管に徹し、永続化要求を main process に転送する
- ✗ Bad: `import { utilityProcess } from 'electron'` を supervisor 内に書く
- ✗ Bad: supervisor が `better-sqlite3` で sessionStore を直接書く

**Verification**:
- Automated (正本): `eslint.config.mjs` の許可行列が `src/agents/` から `electron` と
  ネイティブモジュールへの**直接** import を error にする。
  `.dependency-cruiser.js` の `agents-not-to-electron` / `agents-not-to-native` が
  **推移的な到達**と `require()` 形式を塞ぐ (AD-024 #1 / #2)
- **ディレクトリ名は `src/agents/` である** — AD-023 が supervisor をこのパスに置いた。
  `src/supervisor/` を検査する条件は**常に空を返して常に合格する**ため意味を持たない
- **`require()` 形式と等価 API も対象**。`process.getBuiltinModule()` は import として現れないため
  グラフ検証側で捕捉する
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
- `amended`: 2026-09-15 (AD-024 #18) / 2026-09-16 (同 #18 の訂正)

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
- **現状の制約 (2026-09-16 / AD-024 #18)**: CI は `.github/workflows/verify.yml` として構築済みだが、**Automated の 2 項目はどちらも載っていない**。CI が緑であることは本 Principle について何も示さない
  - (A) composer の IME テストケース — **送信経路を閉じている**。R-1 の `ChatScreen` は `Thread` を mount するので **composer は描画される**。「対象が無い」のではなく、送信経路を `isDisabled: true` で閉じることで検証していない送信経路を残さない形にした。この前提は `src/renderer/src/features/chat/ChatScreen.test.tsx` が守る。composer を開けるときに IME テストを同時に載せる
  - (B) 日本語を含むスクリーンショット比較 — **延期**。目標レイアウトの ADR が accepted になり、かつ Electron を CI で起動する E2E 基盤が揃った時点で載せる。片方だけで撮ると基準画像が撮り直しになる
  - **`bad_pattern_grep` は本 Principle の番人ではない。** 送信は `@assistant-ui/react` の内側で起きるため、`isComposing` ガードがリポジトリに 1 件も無くても 0 件を返す。`existing_violations: 0` は「守られている」ことを意味しない
  - **延期先は R-2 ではない** (v1.2.3 / [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5)。R-2 は読み取り専用で composer の送信経路を開けないため (A) の発動条件 (`isDisabled: true` を外す変更) を満たさず、目標レイアウトの ADR が未採択のため (B) は撮り直しが確定する。**M4 完了後に再検討し、E2E 基盤の持ち主 feature を `docs/roadmap.md` に登録する。** それまで本 Principle を守るのは Manual の 2 者と上記のテスト 1 本だけである。SPIKE-4 (X-2 の前) の結果と合わせて再確認すること
<!-- BOOTSTRAP_SECTION_END principle=VIII -->

<!-- MIGRATE_SECTION_START principle=VIII -->
<!-- MIGRATE_SECTION_END principle=VIII -->

## Standard Principles

> 違反は High / Medium。`should` 形式。

### Principle IX: main process をブロックしない (PLAN.md P-6)

**Adoption metadata**:
- `existing_violations`: 0
- `violation_threshold`: 0
- `bad_pattern_grep`: `grep -rn "JSON.parse" src/ | grep -v "src/agents/" | grep -iE "chunk|stdout|stream|line"`
- `adoption_date`: 2026-09-13
- `amended`: 2026-09-15 (AD-024 #6), 2026-09-23 (AD-031), 2026-09-24 (AD-034)

<!-- BOOTSTRAP_SECTION_START principle=IX -->
**Statement**: stream の逐次パースは supervisor (`utilityProcess`。**実体は `src/agents/`**) 側で行うべきであり、main process で行うべきではない。

**Why**: AD-006 のとおり tool_result が数 MB になることがあり、main process で `JSON.parse` するとウィンドウが固まる。10 セッション並列を想定する以上 (X-5)、1 セッションの巨大な tool_result が全体を止める構造は許容できない。

**Examples**:
- ✓ Good: supervisor がパース済みの構造体を MessagePort で renderer に直送する
- ✗ Bad: main process が stdout chunk を受けて `JSON.parse` してから renderer へ転送する

**Exceptions**: 設定ファイルのような小さく境界の明確な JSON の同期読み込みは対象外。

**Verification**:
- Automated: `src/agents/` の外に stream の `JSON.parse` 処理が存在しないこと (AD-024 #6)。
  `agents → infra` の到達禁止は `.dependency-cruiser.js` の `agents-not-to-infra` が見る
- Manual: `architecture-reviewer`

**現状の制約** ([AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md)):
`bad_pattern_grep` が見るのは**パースするコードの置き場**であり、
**そのコードがどのプロセスで評価されるかは見ていない**。
`src/agents/protocol.ts` に置いた `decodeResponse` は
main process の `session-enumerator.ts` からも呼ばれるが、除外パターン
(`grep -v "src/agents/"`) に当たるため検出されない。
したがって **`existing_violations: 0` は本 Principle の遵守を示さない。**

R-2 (セッション列挙) はこの経路で応答 1 行を main でパースする。
本文を運ばない列挙結果のメタデータに限られるため許容したが、
**R-3 が transcript 本文を運ぶ時点で再評価する** (AD-031 Decision 2)。
塞ぐには `composition-root` からの到達集合を依存グラフから導く検査が要る。

**2026-09-24 (R-3 / [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md))**:
R-3 は transcript 本文を `MessageChannelMain` の port transfer で取得プロセス↔renderer 直通で運び、
**main を本文のデータ経路から外した** (`JSON.parse` も structured clone deserialize も main で起こさない)。
R-2 が残した「本文を運ぶ時点で再評価する」宿題に構造的な解を与えた。
**ただし到達集合検査 (composition-root から main で評価されるモジュールを導く自動検査) は依然として
未構築である** — SC-007 は port transfer の構造検査 + 手動レビューで担保しており、
`existing_violations: 0` は本 Principle の自動証明を意味しない。
到達集合検査の持ち主 feature を `docs/roadmap.md` に登録した (R-3 SH-062b)。
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
- `amended`: 2026-09-15 (AD-024 #15)

<!-- BOOTSTRAP_SECTION_START principle=XI -->
**Statement**: 各 feature は単体で動作確認できる垂直スライスであるべきで、層だけを横に作る feature を切ってはならない。

**Why**: PLAN.md §10 は 1 feature = 1 branch = 1 spec と定め、M1 を 3 feature に抑えて「最短で見栄えの判断材料を出す」構成にしている。層単位で切ると M1 の終わりまで何も見えず、UI の方向性を確定できない。

**Examples**:
- ✓ Good: R-3「transcript の基本表示」— 過去ログを実際に画面で読める
- ✗ Bad: 「SQLite スキーマ定義のみ」— 観測可能な振る舞いがない

**Exceptions**: 基盤 feature が UI を持つ場合を含め、**観測可能な振る舞いが 1 つ以上あれば足りる** (AD-024 #15)。
ユニットテストだけでもよい。R-1 は基盤 feature でありながら renderer の 3 画面を持つため、
改定前の「基盤 feature は UI を持たない」という記述の反例になっていた。

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
- `bad_pattern_grep`: `grep -rnE -e "--color-" -e "colors:\s*\{" -e "spacing:\s*\{" src/ --include=*.css`
  (独自トークン追加の検出。**`-e` が必要** — パターンが `--` で始まるため、無いと
  `grep: unknown option` で失敗する。`tailwind.config.*` は Tailwind v4 では存在しない)
- `theme_baseline_exclusions`: `src/renderer/src/assets/main.css` — CLI 生成の標準テーマの写し。
  **除外はファイル単位の明示リストとする**
- `adoption_date`: 2026-09-13
- `amended`: 2026-09-15 (AD-024 #10 / #11)

<!-- BOOTSTRAP_SECTION_START principle=XIII -->
**Statement**: 同等の element が存在する UI を自作すべきではない。独自のカラートークン・スペーシングスケールを追加すべきではない。

**Why**: PLAN.md §4.5。assistant-ui は 143 の element を持ち、design system に乗ることで一貫性と保守コストの両方が得られる。独自トークンを増やすと、assistant-ui のバージョン更新時に見た目が割れる。

**Examples**:
- ✓ Good: Tool fallback AUI をカスタマイズして Bash 用の Terminal block に寄せる
- ✗ Bad: 既存の Code diff element を無視して自前の diff ビューを書く

**Exceptions**: 対応する element が存在しない**か、候補を実名で照合したうえで不適合である**場合は
自作してよい (AD-024 #11)。その場合 PR 説明に**照合した候補名と不適合理由**を記載する。
「存在しない」とだけ書く形は採らない — AD-019 は 59 要素が未分類と明記しており、
**不在の確認は構造的に未完了**であるため、断定が根拠を持たない。

**Verification**:
- Automated: 上記 `bad_pattern_grep` が、**標準テーマの写しを除いた追加分**について空であること。
  除外は `theme_baseline_exclusions` のファイル単位リストに限る
- Manual: 自作コンポーネント追加時、**照合した候補名と不適合理由**を PR 説明に記載すること
  (`convention-reviewer` / `ux-reviewer`)
<!-- BOOTSTRAP_SECTION_END principle=XIII -->

<!-- MIGRATE_SECTION_START principle=XIII -->
<!-- MIGRATE_SECTION_END principle=XIII -->

## Glossary 関連 Principle

### Principle XIV: Ubiquitous Language

<!-- BOOTSTRAP_SECTION_START principle=XIV -->
`docs/glossary.md` の **Canonical Terms** section に記載の用語を code / spec / UI で一貫使用する。同義異語は禁止 (Candidate Terms section の用語は使用前に canonical 昇格レビュー必須)。新規用語は glossary 追記 + reviewer 確認後に code 投入。

canonical terms の正本は [docs/glossary.md](../../docs/glossary.md) である (AD-024 #16)。
`PLAN.md` 付録 A の 11 語 (Closta / セッション / Provider / ランタイム / capabilities /
SessionLaunchConfig / Element / Tier A-C / HostPath / RuntimePath) はその一次素材であり、
現行 glossary に取り込まれている。**付録 A を参照先として扱わない。**
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

**Exceptions** (AD-024 #12): **リポジトリ表層文書は英語を SSoT とする。**
`README.md` / `LICENSE` / `NOTICE` / `CONTRIBUTING.md` / GitHub のテンプレートが該当する。
外部 OSS としての体裁を最初のコミットから持たせるためであり (`docs/prompts.md`)、
「Documentation は日本語を SSoT」の逸脱ではなく**表層と内部を分けた規約**である。
内部文書 (`PLAN.md` / Constitution / `docs/` / `specs/`) は日本語を SSoT とする。
<!-- BOOTSTRAP_SECTION_END principle=XV -->

<!-- MIGRATE_SECTION_START principle=XV -->
<!-- MIGRATE_SECTION_END principle=XV -->

## Domain-specific Principles

各 domain (`docs/domains/<name>/charter.md`) で固有の Principle がある場合、charter 側で記述し、本ファイルからリンクする。

`docs/domains/` は作成済みで、`runtime` / `session` / `provider` / `isolation` / `ui` の 5 domain がある
([docs/domains/_overview.md](../../docs/domains/_overview.md))。

## 未解決の Principle 候補 (人間レビュー対象)

`/spec-gate scan` が blocking と判定した requirement_gap 由来。PLAN.md §8 には存在しないため、採否を人間が決める必要がある。

1. **セッション transcript ミラーの保持期限と削除経路** — AD-007 / §6.3 が会話全文をホスト側 SQLite にミラーすると宣言しているが、保持期限・削除 UI・エクスポート・第三者送信の有無がいずれも未記述。Principle V (資格情報) の隣に置く候補。
2. **配布物のライセンス表記** — **自プロジェクトの `LICENSE` は R-1 で追加済みであり解消した** (AD-024 #17)。
   残余は**第三者依存の `NOTICE`** に限る。Electron / node-pty / better-sqlite3 / xterm.js 等の
   再配布は帰属表示義務を伴うため、**D-1 (M5。Windows インストーラの配布) の着手条件**として扱う。
   R-1 〜 R-4 の時点では配布物が無いため候補のまま保持する。

## Existing violations summary

<!-- BOOTSTRAP_SECTION_START existing-violations-summary -->

**v1.2.1 時点の enumeration (2026-09-15)。** R-1 の US-1 〜 US-4 完了時に、
**AD-024 で改定した後の条件で**全検証を実行した (SH-023)。
AD-024 #13 / #14 は NON-NEGOTIABLE (III / I) の改定にあたるため enumeration を伴う。

| 検証 | 結果 |
|---|---|
| `pnpm lint` (ESLint + `boundaries` + `no-restricted-imports`) | 違反 **0** |
| `pnpm typecheck` (node / web の 2 project) | エラー **0** |
| `pnpm depcruise` (推移的 / 循環 / `require()`) | 違反 **0** (114 modules / 395 dependencies) |
| `pnpm check:constitution` (R-08 の 11 項目) | 違反 **0** (ok **10** / 検査対象なし **1**) |
| `pnpm test` | 11 files / **213 passed** |
| `pnpm test:rules` (違反サンプル 20 件の発火確認) | 期待表と**全件一致** ⚠ **この行は偽だった (下記訂正)** |

**「違反 0」だけでは足りない。** ルールが 1 件も一致していない状態と区別がつかないためである
(AD-025 で「書いてあるのに効いていないルール」を実測で 5 件見つけた)。
`pnpm test:rules` が、違反サンプルを検査対象へ展開して
**期待した検出器が実際に発火すること**を毎回確かめる。

**ただし「全件一致」の範囲を正確に読むこと。** 照合されるのは期待表が**宣言した**検出器と規則だけである。
`check.mjs` の 11 項目のうち発火確認があるのは **5 項目**、`pending` **1 項目**、**確認なし 5 項目**である
(pr-gate Round 2 / platform-boundary H-005)。**「全件一致」は宣言した期待が満たされたことを示すのであって、
検証項目の全数が確かめられたことを示さない。** Principle VIII の Verification が持つ
「CI が緑であることは本 Principle について何も示さない」と同じ形の留保が、ここにも要る。

#### 訂正: 上表の `pnpm test:rules` 行は当時から偽だった (2026-09-16 / AD-027)

上表は「期待表と**全件一致**」と記録しているが、**その一致には偽の 1 行が含まれていた**。
`wsl-args-array` が期待していた項目 `#1` は、`check.mjs` が全 11 項目の見出しを
**状態に関わらず必ず印字する**ため構造的に常に満たされていた — 項目 1 は特権コマンド
**文字列**の検査であり、当該サンプルの `--import` を実際には見ていない
(pr-gate Round 1 の Critical C-001)。

[AD-027](../../docs/decisions/0027-rule-firing-verification-and-service-io-rule.md) で
(a) 違反サンプルを **1 件ずつ展開**して検証する形に改め、(b) `#N` を `[VIOLATE] #N` の形で照合し、
(c) `wsl-args-array` の期待を `['#3']` に訂正した。

**上表の数値そのものは 2026-09-15 時点の実測として正しい**ので書き換えない (監査の跡を残す)。
AD-027 後の実測は下表である。

#### AD-027 後の enumeration (2026-09-16)

| 検証 | 結果 |
|---|---|
| `pnpm lint` | 違反 **0** |
| `pnpm typecheck` (node / web の 2 project) | エラー **0** |
| `pnpm depcruise` | 違反 **0** (118 modules / 416 dependencies) |
| `pnpm check:constitution` (11 項目) | 違反 **0** (ok **10** / 検査対象なし **1**) |
| `pnpm test` | 15 files / **264 passed** |
| `pnpm test:rules` (違反サンプル **21 件**) | 期待表と**全件一致**。ただし被覆範囲は上記の留保どおり |

**本節の改定は Principle と Verification のいずれにも触れていない**ため版を上げていない。
Principle VIII の adoption metadata (`existing_violations: 0` が実測と合わない点。
pr-gate Round 2 / architecture H-001 + a11y N-003) は**別の改定として扱う** — そちらは
metadata の変更を伴うため PATCH 改定 (v1.2.3) が要る。

### 検査対象なし (1 項目)

**「検査対象なし」は合格ではない。** 対象が実装された時点で再実行する。

| 項目 | 待ち |
|---|---|
| 5 (イメージ構築サブコマンド) | docker を名指せるモジュールが 0 件 (R-1 の設計どおり。X-4 で対象が生じる) |

v1.2.0 時点で `pending` だった項目 2 (`wsl.exe` の引数) と項目 6 (ディストロ内スクリプト) は、
`wsl-cli.ts` / `probe-script.ts` の実装により **`ok` に変わった**。

### 機械検証で捕まらない残余 (2 件)

SC-017 の追跡対象。**列挙せずに「全数検出」と言わない。**
理由と代替手段は `tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES` を正本とする。

| 経路 | 何が代わりに守るか |
|---|---|
| `ui` でのパス文字列の連結 | IPC が返す型を `PathDTO` に固定。連結文字列は名前空間を持たず `isValidPathDTO` で落ちる |
| 実行中確認済みの値を別ディストロへ流用 | 値が対象ディストロ識別子を持ち、`infra` の入口が `checkVerified` で一致を検証する |

### Principle VIII

**Automated は 2 項目とも載っていない。CI が緑であることは本 Principle について何も示さない。**
(A) は composer が**描画されたうえで送信経路を `isDisabled: true` で閉じて**おり、
(B) のスクリーンショット比較は **M4 完了後に再検討する** (AD-024 #18 を
[AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5 が読み替えた。
延期先だった R-2 は読み取り専用であり E2E 基盤を作らない)。
`existing_violations: 0` は `bad_pattern_grep` が送信経路 (`@assistant-ui/react` の内側) を
見られないことの結果であって、遵守の証拠ではない。守るのは Manual の 2 者
(`ux-reviewer` / `a11y-reviewer`) と `ChatScreen.test.tsx` の 2 ケースである。

<!-- BOOTSTRAP_SECTION_END existing-violations-summary -->

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
| **Governance (改定手順・検証の運用規則) への規則の追加** | **MINOR** |
| 表現の修正、誤記の訂正、非意味的な refinement | PATCH |
| **Verification の「現状の制約」を事実に追随させる** | **PATCH** |

**Governance の行を v1.2.4 の後に追加した** (pr-gate Round 4 / M4-12)。
v1.2.4 は改定手順に新しい規則 (ADR の in-place 訂正) を足したが、
当時の表は Principle の増減しか行を持たず、**PATCH の妥当性を表から導けなかった**。
本表の行に照らすと v1.2.4 は MINOR 相当である。
**版番号は遡って振り直さない** — 既に参照されており、
振り直すと Amendment trail の参照が壊れる。判定基準の側を明示する。

### Amendment trail

| version | date | 変更 |
|---|---|---|
| 1.0.0 | 2026-09-13 | 初回批准。PLAN.md §8 の P-1〜P-13 を素材に 15 Principle を確立 |
| 1.1.0 | 2026-09-13 | Principle II の検証条件に `platform-ok:` 注記による例外を追加。Electron 公式テンプレートの `window-all-closed` / `icon` 分岐は除去不能であり、元の grep はどの Electron アプリでも達成できなかった (AD-023) |
| 1.2.0 | 2026-09-15 | [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) の 17 項目。検証条件が実在しないディレクトリを指していた箇所 (#1 / #6 の `src/supervisor/` ほか) を AD-023 のレイヤ構成に合わせ、**Automated の正本を grep から lint + グラフ検証 + 検証スクリプトに移した** (#2 / #7 / #8)。許可リストの正本を `scripts/constitution/allowlists.mjs` に置き追加に ADR を要する形にした (#3 / #4)。検証スコープにビルド構成を追加 (#5)。設定層を Principle V の対象に追加 (#9)。Principle XIII の `bad_pattern_grep` が `--` 始まりで実行不能だった点を修正し標準テーマの写しを除外リスト化 (#10 / #11)。表層文書の英語 Exceptions を追加 (#12)。**NON-NEGOTIABLE の改定 2 件** — III を `autoModeSafe !== true` に (#13)、I の Statement を `domain` のパス API 経由に (#14)。XI の Exceptions / XIV の本文 / 未解決候補 #2 を R-1 完了後の事実に追随 (#15 / #16 / #17) |
| 1.2.1 | 2026-09-15 | [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) #18。Principle VIII の Verification の「現状の制約」を実体に改めた。CI は SH-022 で構築したので「CI が未構築のため実行不能」はもう成り立たない。Automated の 2 項目は **(A) composer が無いため対象が無い / (B) スクリーンショット比較は R-2 の E2E 基盤に相乗りする** であり、**CI が緑であることは本 Principle について何も示さない**ことを明記した |
| 1.2.2 | 2026-09-16 | [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) #18 の**訂正**。v1.2.1 が (A) の根拠に書いた「R-1 に composer が無い」は事実ではない。`ChatScreen` は `Thread` を mount しており composer は描画される。根拠を「送信経路を `isDisabled: true` で閉じている」に改め、その前提を `ChatScreen.test.tsx` で固定した。あわせて **`bad_pattern_grep` が送信経路を見られない**こと (`existing_violations: 0` は遵守の証拠ではない) を明記した |
| 1.2.3 | 2026-09-17 | [AD-028](../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5。Principle VIII の Automated 検証の**延期先から R-2 を外した**。R-2 (セッション列挙) は読み取り専用で composer の送信経路を開けないため (A) の発動条件を満たさず、目標レイアウト ADR が未採択のため (B) は撮り直しが確定する。**延期先を空にせず「M4 完了後に再検討し、持ち主 feature を roadmap に登録する」とした** — 持ち主のいない延期は、次に本 Principle を見る人が「R-2 で載ったはず」と誤読する形で残る |
| 1.2.4 | 2026-09-23 | [AD-031](../../docs/decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md)。**改定手順に ADR の in-place 訂正の規則を置いた** — 事実誤認の訂正は日付つきの「訂正」節として in-place、決定の変更は後続 ADR。AD-028 §2 の immutability 宣言を読み替える (先例 5 件がすべて訂正であり決定の変更ではなかった)。あわせて **Principle IX の Verification に「`bad_pattern_grep` はパースコードの置き場を見るだけで、どのプロセスで走るかは見ていない」を明記した** — R-2 の列挙応答は main でパースされるが検査は 0 件を返す。`existing_violations: 0` は遵守の証拠ではない |
| 1.2.5 | 2026-09-23 | バージョニング方針表に **Governance への規則追加 = MINOR** と **Verification の事実追随 = PATCH** の 2 行を追加した (pr-gate Round 4 / M4-12)。v1.2.4 は改定手順に新規則を足しながら表に該当行が無く、**PATCH の妥当性を表から導けなかった**。本表に照らすと v1.2.4 は MINOR 相当だが、**版番号は遡って振り直さない** — 既に参照されており Amendment trail の参照が壊れる |

## References

- 素材: [PLAN.md §8](../../PLAN.md) — Constitution Principle 候補 P-1〜P-13
- Domain Charter: [docs/domains/](../../docs/domains/)
- ADRs: [docs/decisions/](../../docs/decisions/)
- Glossary: [docs/glossary.md](../../docs/glossary.md)
- Section ownership 仕様: 本ファイル冒頭 `Sync Impact Report` コメントを参照

---

**Version**: 1.2.5 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-09-23
