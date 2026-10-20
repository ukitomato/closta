# platform-boundary-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-20
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-003 と FR-013 (起動), FR-004〜FR-007 (claude.exe の場所), FR-008 / FR-009 (env と Provider), FR-010〜FR-012 (プロセス木の停止), FR-014 (Principle II の封じ込めと spawn の許可リスト), FR-015, FR-016 (WSL を変えない)。SC-001〜SC-006
- touched files に該当する charter / Confirmation:
  - runtime charter: 不変条件 (capabilities を正直に表明する / Principle I・II・VI・VII)、`## Related ADRs` `:148`、`## Related Specs` `:163`、frontmatter `:7` / `:17`
  - isolation charter: Out of scope
  - AD-003 (Win32 は `autoModeSafe: false`、プラットフォーム差は実装の内側)
  - AD-004 (branded path)
  - AD-043 Decision 5
  - AD-058 (proposed) Decision 1〜7 と Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:2
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 1 の指摘を、修正後の bundle で確かめた。対象は spec.md、data-model.md、research.md、tasks.md、plan.md、AD-058。

- 前 round の自分の H-001 (gate の H-004) は直っている。§6.1 に Provider が上書きしてよい 4 キーを足し、§6.4 で `assessReachability` に transport の禁止キーの述語を注入した。tasks の BE-040 / BE-041 / FE-040 のテストもこの決定に合わせて直っている
- M-003 の decoder の部分、M-004、L-002 も直っている
- まだ直っていないもの:
  - M-001: `configDirRuntimePath` の型を広げる (data-model.md:317、research.md:164)
  - M-002: `distro-mismatch` の条件を緩める (data-model.md:297)。BE-012 のテストが、緩めた振る舞いをそのまま固定するようになった
  - L-001: plan.md:111 と tasks.md:91 の行番号が入れ替わったまま
- 新しく、Low を 1 件足した

`makeForbiddenForwardKey` はキーを大文字にして比べる (`src/domain/provider/forward-env.ts:110-113`)。このため、大文字のキー名 (`SYSTEMROOT` / `COMSPEC`) で Win32 の混在綴りのキーを上書きする経路は無いことを確かめた。

## 固有観点

- **PB-1 (パス型が境界で失われる)**: M-001 が残る。ほかの経路は問題なし。
  - `Win32LaunchSpec.cwd` は §7 の段 2 で `runtimePath.namespace === 'host'` を確かめた値で、agents の decoder が `makeHostPath` で再び確かめる (data-model.md:199)
  - `runtime-settings.json` の値は、locator で `classifyClaudeExecutable` を通る
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。
  - `Win32Runtime` の id は `'host'` で 1 つに固定されている。AD-003 が複数のインスタンスを認めているのは WSL / Docker だけ
  - 新しい述語 `isTransportForbiddenKey(kind, key)` はランタイムの種類で引く。`RuntimeDescriptor['kind']` は `'win32' | 'wsl'` だけ (`src/domain/runtime/descriptor.ts:31`, `:40`)
- **PB-3 (capabilities の虚偽表明)**: 該当なし。
  - Reachability の食い違い (前 round の H-001) は §6.4 と §8 の extraEnv の表で直り、判定と起動が同じ述語 (`isWin32ForbiddenKey`) を使う
  - `claudeStatus` は失敗を安全側に倒し、facts に入れるのは `found` のときだけ。どちらも前 round のまま
- **PB-4 (権限ゲートの迂回)**: 該当なし。
  - 権限モードの型は今も `SafePermissionMode` の 3 値。Win32 を選んだときの選択肢は FE-010 / FE-011 (tasks.md:43-44) が component テストと E2E で確かめる
  - プリセットから Auto / bypass が入り込む経路は、型の上に無い
- **PB-5 (多段パス変換の欠落)**: 該当なし。Win32 は恒等で、変換はゼロ段。
  - `stop.command` は合成前の `baseEnv` の `SystemRoot` から組む。`SystemRoot` は Win32 の transport のキーなので、Provider から上書きできない (§6.2。BE-011 のテストで `SystemRoot` の上書きが throw)
- **PB-6 (実質的な永続環境の構築)**: 該当なし。書くのは userData の `runtime-settings.json` だけ。taskkill は自分の子だけを止める。PATH・インストール・シェルの設定には書かない
- **PB-7 (lint ルール自体の網羅性)**: L-002。agents の decoder の固定 (data-model.md:204-205) で、実害の面は閉じた。残るのは静的な規則の穴だけ

## Findings

### [Medium] `configDirRuntimePath` を `HostPath | RuntimePath` に広げると、「WSL に HostPath を載せない」を tsc で守れなくなる (M-001) (scope: feature) [unresolved from prev]

- **観察**:
  - data-model.md:317 は「戻りの型を `{ ok: true; path: HostPath | RuntimePath }` に広げ、`ResolvedCredential.configDirRuntimePath` の型も同じに広げる (名前は変えない)」のままである
  - research.md:164 と tasks.md:81 (BE-040) も同じ
  - 前 round の推奨は「型を判別できる形にする」か「WSL の `composeLaunchEnv` に網を足す」だった。bundle にはどちらも無い
  - `src/domain/provider/derive-env.ts:112-114` は `.value` をそのまま `CLAUDE_CONFIG_DIR` に入れる
- **同種事象探索**: `configDirRuntimePath|resolveConfigDirPath` を src で検索して 13 件 (前 round と同じ。`src/domain/provider/types.ts:153`, `derive-env.ts:113-114`, `provider-service.ts:293`, `:298`, `:300`, `:332`, `reachability.ts:55`, `helper-path.ts:75` ほか)
- **リスク/影響**: AD-004 が branded type で防いでいた取り違えが、union 型に隠れる。WSL の起動に Windows のパスの `CLAUDE_CONFIG_DIR` が載らないことを守るのは、`resolveConfigDirPath` の分岐の正しさだけになる
- **推奨アクション**: 戻りの型を `{ kind: 'wsl'; path: RuntimePath } | { kind: 'win32'; path: HostPath }` にする。それが重ければ、WSL の `composeLaunchEnv` (`src/main/infra/runtime/launch-spec.ts:90-119`) に「`CLAUDE_CONFIG_DIR` の値が `isWindowsPathValue` なら throw」を足し、BE-040 にそのテストを足す
- **根拠**: AD-004。Constitution Principle I
- **scope 根拠**: data-model §8 と BE-040

### [Medium] `distro-mismatch` の条件を緩め、BE-012 のテストがそれを固定する (M-002) (scope: feature) [unresolved from prev]

- **観察**:
  - data-model.md:297 は `distro-mismatch` を「`folder.distroName !== null && runtime.distroName !== null && 不一致`」のときだけにしている
  - tasks.md:41 (BE-012) のテストは「`distroName: null` の facts で出ない」を固定する
  - 今の条件 (`src/domain/session/launch-resolution.ts:105-110`) のまま型だけを `string | null` に広げても、Win32 の facts (`distroName: null`) で問題は起きない。所在 WSL のフォルダは正しく `distro-mismatch` で止まる
- **リスク/影響**: U-3 / FR-003 の到達不可を、renderer と main が共有する純関数が表明しなくなる。止める層は main §7 の段 2 と、renderer の `folderRuntimeUnreachable` の 2 つに減る
- **推奨アクション**: 比較の式は今のまま (`folder.distroName !== null && folder.distroName !== runtime.distroName`) にして、型だけを広げる。BE-012 のテストは「所在 WSL のフォルダ × `distroName: null` の facts で `distro-mismatch`」に替える
- **根拠**: spec FR-003 / U-3。runtime charter の「到達できないフォルダは選択肢に現れない」
- **scope 根拠**: data-model §7 と BE-012

### [Medium] M-001 / M-002 の境界を守るテストが bundle に無い (M-003) (scope: feature) [new]

- **観察**:
  - BE-040 (tasks.md:82) は Win32 × ホストの configDir で `CLAUDE_CONFIG_DIR` が HostPath になることを確かめる。しかし、WSL のどの行でも `CLAUDE_CONFIG_DIR` が Windows のパスにならないことは確かめない
  - BE-012 (tasks.md:41) は、所在 WSL × Win32 の拒否を `prepareLaunch` の段 2 でしか確かめない。`resolveLaunchAxes` の層のテストは、拒否しない側を固定している
- **リスク/影響**: union 型にしたことと、domain の層で拒否しなくなったことによる退行を、CI で検出できない
- **推奨アクション**: BE-040 の SC-005 の表の WSL の行に「`CLAUDE_CONFIG_DIR` が `isWindowsPathValue` でない」の列を足す。M-002 を直すなら、BE-012 の `resolveLaunchAxes` のテストを拒否の側に替える
- **根拠**: AD-004、FR-003
- **scope 根拠**: tasks BE-012 / BE-040

### [Low] runtime charter の行番号が入れ替わったままで、frontmatter を更新する項目も無い (L-001) (scope: feature) [unresolved from prev]

- **観察**:
  - plan.md:111 と tasks.md:91 は「Related Specs `:148`、Related ADRs `:163`」と書いている。実際は `docs/domains/runtime/charter.md:148` が `## Related ADRs`、`:163` が `## Related Specs` である
  - SH-010 は、runtime charter の frontmatter (`:7` `related_adrs` / `:17` `related_specs`) を更新しない
- **推奨アクション**: 行番号を直し、runtime charter の frontmatter に AD-058 と 020 を足す項目を SH-010 に加える
- **根拠**: FR-015
- **scope 根拠**: SH-010

### [Low] 項目 19 と項目 1 が「pid を外部コマンドに渡して止める」経路を静的に見られない (L-002) (scope: feature) [unresolved from prev, downgraded]

前 round の M-003 の残りである。

- **観察**: data-model.md:204-205 で、agents の decoder は `stop.command` の末尾の名前を `taskkill.exe` に、`argsBeforePid` を `WIN32_TREE_STOP_ARGS` との完全一致に固定した。これで前 round の Medium の実害の面は閉じた。一方で、research.md:242 と SH-011 (tasks.md:95) は注記を直すだけである。`taskkill` を名指してよいモジュールを縛る規則は、今も無い
- **同種事象探索**: `taskkill` を scripts/constitution で検索して 0 件
- **推奨アクション**: `WSL_CALLER_MODULES` にならって、`taskkill` を綴ってよいファイルを `win32-launch.ts` に限る許可リストを AD-058 の Confirmation に足す。または、足さない理由を AD-058 に 1 行書く
- **根拠**: Constitution Principle VI / AD-043 Decision 5 / PB-7
- **scope 根拠**: AD-058 Confirmation、SH-011

### [Low] decoder が `stop.command` のディレクトリを `System32` に固定しない (L-003) (scope: feature) [new]

- **観察**: data-model.md:204 の検査は「`makeHostPath` が通り、末尾の名前が `taskkill.exe`」だけである。組み立ての側は `SystemRoot\System32\taskkill.exe` に固定している (data-model.md:181)。しかし、たとえば `C:\Users\u\AppData\Local\Temp\taskkill.exe` も decoder を通る
- **リスク/影響**: main から agents への経路は信頼できるので、今の実害は無い。多重の防御の面で、組み立ての規則と検査の規則がずれている
- **推奨アクション**: decoder で、親のディレクトリの末尾の名前が `System32` (大文字小文字を区別しない) であることも見る。または、ずれを許す理由を §5.2 に書く
- **根拠**: AD-058 Decision 1 / 3 (絶対パスで起こす。CWE-426 の趣旨)
- **scope 根拠**: data-model §5.2 / BE-010

### 前 round から直ったもの

| 前 round の ID | 状態 | 根拠 |
|---|---|---|
| H-001 (extraEnv の proxy の衝突) | resolved from prev | data-model.md:234-238 (上書きしてよい 4 キー)、:268-278 (§6.4 の述語の注入)、:319-326 (SC-005 の extraEnv の行)。AD-058 Decision 5。BE-040 / BE-041 / FE-040 |
| M-003 (decoder が `stop.command` / 引数を固定しない) | decoder の部分は resolved from prev。残りは L-002 に Low として残す | data-model.md:137, :204-205。BE-010 の正例と負例 |
| M-004 (BE-041 の例が登録で既に拒否されるキー) | resolved from prev | tasks.md:83 は `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` / `USERNAME` / `NUMBER_OF_PROCESSORS` に替わった |
| L-002 (`windowsHide` を agents に直接書く) | resolved from prev | data-model.md:150-154 (`Win32LaunchSpec.windowsHide`)、:338、AD-058 Decision 1 |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `configDirRuntimePath\|resolveConfigDirPath` (src) | 13 | src/domain/provider/types.ts:153; derive-env.ts:113-114; provider-service.ts:293, :298, :300, :332; reachability.ts:55; helper-path.ts:75 ほか |
| L-002 | `taskkill` (scripts/constitution) | 0 | — |
| (確認) | `makeForbiddenForwardKey\|toUpperCase` (src/domain/provider/forward-env.ts) | 3 | forward-env.ts:107, :110, :113 (大文字にして比べるので、大文字の綴りで上書きする経路は無い) |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
- Round inheritance: resolved from 1: 4 (H-001 / M-004 / L-002 / M-003 の decoder の部分) / unresolved: 4 (M-001 / M-002 / L-001 / M-003 の残りを Low に下げた L-002) / new: 2 (M-003 / L-003)
