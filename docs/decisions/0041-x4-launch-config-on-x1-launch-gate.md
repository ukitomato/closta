---
status: accepted
date: 2026-09-30
readopted: 2026-10-01
id: AD-041
deciders: ukitomato
tags: [session, provider, runtime, security, sdk]
supersedes: []
superseded-by: []
---

# AD-041: X-4 の起動設定を X-1 の起動ゲートに載せる（権限モード安全 3 値・env の WSL 配送・`--exec`）

## Context

X-4（[spec 008](../../specs/008-session-launch-settings-dialog-and-presets/spec.md)）は、X-1 の単一セッション起動を検証済みの起動設定で動かし、X-3 の導出 env を初めて実起動に配線する。このとき、次の 3 つが accepted の決定とぶつかる。

1. X-1 の起動ゲートは `permissionMode: 'default'` 固定である。query options のキー集合も固定されている（[AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P1 / §5）。
2. **導出 env は wsl.exe を越えない。** WSL は、`WSLENV` に列挙した変数しか distro 内へ渡さない。その `WSLENV` を AD-036 §6 が denylist に入れている。design-gate R1 の実測では、`WSLENV` が無いと値は `unset`、あると `reached` だった。
3. **`wsl.exe ... --` の後ろは、シェルに展開される。** design-gate R1 の実測で、`$(echo X)` が実行され、`\` が消えた。X-4 はこの経路に、利用者由来の model ID と `--settings` の JSON を初めて流す。

design-gate を 3 round 回し（[design-gate.md](../../specs/008-session-launch-settings-dialog-and-presets/design-gate.md)）、人間が次の 4 点を決めた。

- 権限モードは安全 3 値だけにする。
- env は実名キーの `WSLENV` で配送する。
- helper の生成は X-7 へ繰り越す。
- env-passthrough は実名 allowlist の範囲で実装する。

本 ADR はこれらを、先行 ADR と先行 feature の正本の読み替えとして記録する。節は (a)〜(h) で構成し、各節の冒頭に**読み替える箇所**を置く。

**採択の経緯**: 2026-09-30 に採択した。その後、実装の code-gate と pr-gate (Round 1・2) の指摘を受けて、決定者が 2026-10-01 に再採択した。本 ADR は main に入る前のものなので、決定の変更は Decision 本文に畳み込んだ。対象は (e) 2・3、(f) の読み替え対象、(h) である。実装後に確認した事実は、末尾の「記録」節に分けて置く。これは [AD-031](0031-adr-in-place-corrections-and-principle-ix-scope.md) の「訂正」節ではなく、決定を含まない事実の記録である。未マージの ADR を再採択することと「記録」節の扱いを AD-031 で明文化する件は、system follow-up とする。

## Decision

### (a) 起動の権限モードを安全 3 値の allowlist にする

**読み替える箇所**: AD-036 §5 / AD-040 Consequences「`permissionMode` は `'default'` リテラル固定」

`query()` に渡す `permissionMode` を `{default, plan, dontAsk}`（[AD-020](0020-sdk-emitted-message-inventory.md) の危険度表で「安全」のもの）に広げる。

- 型 `SafePermissionMode` と実行時の `assertSafePermissionMode` で閉じる。一次ゲートは `buildQueryOptions` である。
- 昇格値 (`acceptEdits` / `auto` / `bypassPermissions`) は `check.mjs` 項目 16 で引き続き検出する。
- 項目 16 には backstop を足す。値位置の `permissionMode:` と shorthand の `{ permissionMode }` が `assertSafePermissionMode(` を通らなければ、違反にする。

### (b) X-1 SC-006 と env の正本を読み替える

**読み替える箇所**: X-1 SC-006(a)(b)(c) / 005 contracts C-5 / 005 data-model §7

- SC-006(a) の「`dontAsk` への経路 0」を上書きする（`dontAsk` は (a) の安全 3 値に入る）。
- 最終 env の規則を次のように読み替える。
  - passthrough（curated base）は、許可リストと完全一致させる。
  - 転送キーは (e) の `forwardKeys` に限る。
  - `WSLENV` は、アプリが生成したものだけにする。
  - 資格情報の注入は wsl.exe の spawn env に限る。fork env と argv では 0 のままにする。
- テストの扱い:
  - `launch-spec.test.ts` の passthrough の assert は存続させる。
  - spec.env の完全一致の assert は、X-4 の形に置き換える。

### (c) 昇格モードと capability スコープ承認は I-3 に回す

**読み替える箇所**: X-1 FR-012 / plan B-4 / Constitution Principle III

- ランタイム capability に連動して昇格モードを提示する設計は **I-3** に帰属させる。承認カードの `scope: 'capability'` の永続化も同じく I-3 である。
- 前方注記: I-3 が昇格モードを足したら、プリセットを適用するたびに、適用先ランタイムの capability で再検証する。

### (d) 作業領域戦略の軸を I-1 に付け替える

**読み替える箇所**: [AD-017](0017-container-workspace-strategy.md) Consequences / [AD-025](0025-workspace-folder-carries-location.md) §1 / constitution.md の Existing violations（項目 5 の「X-4」）

コンテナの作業領域戦略（clone-ephemeral / bind）の軸は、コンテナ専用である。X-4 ではなく **I-1**（DockerRuntime）で扱う。

### (e) 導出 env を WSL へ配送する

**読み替える箇所**: AD-036 §6 / X-3 FR-009 (a)(b) / 007 contracts C-5 / [AD-039](0039-credential-delegation-verified.md) 調査結果 §3（env-passthrough）

1. `deriveLaunchEnv` は、`env` とは別に **`forwardKeys`**（WSL へ転送するキー）を返す。
   - 含めるもの: 方式固有の実名キー、採用した extraEnv のキー、env-passthrough の varNames。
   - **curated base のキー（`SystemRoot` / `windir` / `TEMP` / `TMP`）と `WSL_UTF8` は含めない。** 実測では、`TMP` を転送すると WSL 内の Node の `os.tmpdir()` が作業フォルダ基準の相対パスになった。
2. infra/runtime の `composeLaunchEnv` が、`forwardKeys` の各キーに `/u` を付けて `WSLENV` を生成する。
   - パス変換フラグは使わない。値は既に RuntimePath である。
   - base 側の `WSLENV` は捨てる。
   - 名前規則（`^[A-Z_][A-Z0-9_]*$`）または転送禁止キーに違反したら、捨てずに起動を拒否する。
   - この最終検査では、方式固有の実名キーと passthrough allowlist を転送禁止キーから除く。これらは `deriveLaunchEnv` が正当に出すキーだが、prefix deny（`ANTHROPIC_*` / `CLAUDE_CODE_*`）や `CLAUDE_CONFIG_DIR` に当たる。実名集合は domain に置き、導出側と共有する。
   - 値に制御文字があれば起動を拒否する。
3. denylist を 2 つに分け、役割を分担させる。
   - `LAUNCH_ENV_DENY_PATTERN`（infra）は、passthrough（curated base と extraEnv）の資格情報パターンを担う。AD-036 §6 の範囲を passthrough に限定する。
   - **転送禁止キー**（domain）は、実行の乗っ取りと transport の制御キーを担う。
     - 対象:
       - transport 固有のキー（infra から注入する）
       - 実名: `PATH` / `HOME` / `SHELL` / `TMPDIR` / `NODE_OPTIONS` / `NODE_PATH` / `BASH_ENV` / `ENV` / `PROMPT_COMMAND` / `IFS` / `PS4` / `CLAUDE_CONFIG_DIR` / `PAGER` / `MANPAGER` / `SYSTEMD_PAGER` / `LESSOPEN` / `LESSCLOSE` / `EDITOR` / `VISUAL` / `BROWSER` / `SSH_ASKPASS` / `SSH_ASKPASS_REQUIRE` / `SUDO_ASKPASS` / `PERLLIB` / `JAVA_TOOL_OPTIONS` / `_JAVA_OPTIONS` / `NODE_TLS_REJECT_UNAUTHORIZED`
       - prefix: `LD_` / `CLAUDE_CODE_` / `ANTHROPIC_` / `GIT_` / `PYTHON` / `PERL5` / `RUBY` / `BUN_` / `NPM_CONFIG_`
     - 例外として、`ANTHROPIC_BASE_URL` だけを実名で許可する。
     - `NODE_EXTRA_CA_CERTS` は禁止しない。この変数は信頼アンカーを**足す**だけで、検証を外さない。企業の TLS 検査 proxy の配下では、claude に企業 CA を渡す唯一の経路になる（`--exec` は login shell を通らないため）。
     - 照合は大文字小文字を区別しない。
     - Claude Code に新しい env が増えても既定で通さないよう、prefix 単位で deny し、許可は実名で持つ。
     - **denylist は既知の代表例を塞ぐもので、「承認済みコマンドの子プロセスにコマンドを実行させる」キーのクラスを原理的に閉じるものではない。** extraEnv を名前の allowlist に切り替えるかは、X-7 で検討する ((h))。
     - extraEnv のキー数は 32 までとする（総量に上界を置くため）。
   - 登録時の検証（IPC / providers.json の read）は transport の和集合で行い、起動時の `composeLaunchEnv` は transport ごとに行う。判定の述語は composition-root から注入する。provider-record / validate は transport の実装を直接 import しない。I-1 で transport が増えたら、和集合の作り方を見直す ((h))。
4. **env-passthrough の varNames は、実名 allowlist に限る。** allowlist は、検出候補の資格情報名から `CLAUDE_CONFIG_DIR` を除いたものである。
   - 値は、アプリ自身の process.env から取る。
   - 方式固有キーと同じ扱い（資格情報 denylist の対象外）で転送する。
   - これは X-3 FR-009 (b)「方式固有注入は実名固定集合」を、実名 allowlist の範囲で広げる読み替えである。AD-039 §3 の「env-passthrough は秘密なし」は事実と合わないので、[AD-042](0042-provider-type-refinement-and-d4-lapse.md) で訂正する。
5. wsl.exe の絶対パス解決には、**合流前の curated base** を使う。extraEnv で `SystemRoot` を差し替えても、解決に効かない。
6. utilityProcess の fork env は、curated base のままにする。

**残存リスク**:

- wsl.exe の spawn env は、Windows 側の同じユーザーのプロセスから見える。argv（CWE-214）や fork env より狭いが、api-key を env で渡す方式に内在する露出である。
- WSL 内の claude の子プロセス（Bash tool）は、秘密 env を継承する。`dontAsk` の事前承認済み Bash からも読める。
- `ANTHROPIC_BASE_URL` は利用者が登録した値として許す。資格情報と同じ起動に載ることは受け入れる。

### (f) 起動 argv を `wsl.exe --exec` にする

**読み替える箇所**: [AD-015](0015-wsl-access-strategy.md) §2 / §5 / §7 / AD-036 §3（prefixArgs）/ 005 data-model §8 / [AD-018](0018-wsl-process-control.md) §3 / §4（「kill で孤児が残らない」「stdin がそのまま渡る」は `--` 形での実測である。`--exec` 形での再観測は末尾の「記録」を参照）

- prefixArgs を `['--cd', cwd, '-d', distro, '--exec']` にする。
  - claude は、起動前 probe（`bash -lc 'command -v claude'`、AD-015 §7 のまま）で解決した絶対パスで起動する。
  - SH-000 の実測で確認した（[quickstart-results.md](../../specs/008-session-launch-settings-dialog-and-presets/quickstart-results.md)）。claude は native ELF で、`--exec` で起動できる。JSON と `[1m]` は原文どおり届く。
- `--exec` は、既に `WSL_ALLOWED_ARGS` の許可形である。
- 項目 2 の走査対象（wsl-cli.ts）は広げない。起動 argv の退行検出は、`buildRuntimeLaunchSpec` の pin テストに一本化する。
  - pin テストの内容: 末尾が `--exec` で、`--` / `-u` / `--user` を含まない。
  - 項目 2 は `-u root` を構造的に検出できないので、違反 fixture は置かない。
- SH-000 が成立したので、R-01 の代替（`/bin/sh -c` の固定リテラルと項目 6 の改修）は採らない。

### (g) query options のキー集合に `model` / `effort` を足す

**読み替える箇所**: AD-036 §4 P1 / 005 contracts C-4

- `QUERY_OPTION_KEYS` を次の集合に固定する: `{permissionMode, canUseTool, pathToClaudeCodeExecutable, spawnClaudeCodeProcess, abortController, settings, model, effort}`。
- `model` / `effort` は escalation-neutral である。モデルの選択と思考量を変えるだけで、権限面・tool 集合・env を変えない（sdk.d.ts の `Options.model` / `Options.effort`）。
- 集合は pin テストでリテラルに固定する。

### (h) 繰越先を指名する

- X-6: 次の項目を引き受ける。
  - 追加ディレクトリ / 上限 / セッション名の軸
  - Win32Runtime の直接起動（X-1 research R-05 / plan B-4）
  - fork / resume / rename / tag / delete
  - store 退避ファイルの一覧と復元 UI（件数の表示は X-4。AD-042 Decision 4）
  - 同じ内容の `.bak` を重複して作らないこと
  - claudePath の形の判定（shebang 形の案内。記録 2）
- X-7: 次の項目を引き受ける。
  - aws-assume-role helper の生成（X-3 BE-020 のうち X-4 に帰属する分）
  - POSIX helperPath に所属 distro を持たせる登録スキーマ変更（AD-042 Consequences）
  - extraEnv を名前の allowlist にするかの検討（(e) 3）
  - api-key 系の方式に固有の実機観測（記録 3）
- I-3: 昇格モードと capability スコープ承認
- O-3: charter KPI「再利用率」の計測経路
- I-1: 次の項目を引き受ける。
  - 作業領域戦略の軸（(d)）
  - 転送禁止キーの登録時検証を、transport の和集合として作り直すこと（(e) 3）

## Consequences

- AD-036 は immutable である。本 ADR は §3 / §4 P1 / §5 / §6 を**追記的に読み替える**のであり、wholesale の supersede ではない。AD-040 の 2 キー射影は変更せずに維持する。
- 先行 feature の正本には、本 ADR の該当節への pointer を置く。対象は 005 contracts C-4 / C-5、data-model §7 / §8、007 contracts C-5 である。
- `plan` → ExitPlanMode の承認後にモードが昇格しないことを、次の Confirmation で確認する。昇格経路は 0 件を維持する。

## Confirmation

- `buildQueryOptions` の単体テスト: 安全 3 値の外は throw する。`QUERY_OPTION_KEYS` の pin テストが (g) の集合と一致する。
- 項目 16 の違反 fixture（assert を通らない値位置 / shorthand）が発火し、型宣言では発火しない。
- `composeLaunchEnv` の単体テスト:
  - `WSLENV` = `forwardKeys` + `/u` だけである。
  - base キーと `WSL_UTF8` が 0 件である。
  - 転送禁止キーは拒否される（大文字小文字違いを含む）。
  - `SystemRoot` の上書きは wsl.exe の解決に効かない。
- `buildRuntimeLaunchSpec` の pin テスト: 末尾が `--exec` で、`--` / `-u` を含まない。
- ExitPlanMode: SDK 0.3.270 の `toPermissionResult` は `updatedPermissions` を返さない（P2）。したがって、`plan` からの承認でモードは昇格しない。これを agents の単体テストで確認し、quickstart で `plan` 起動の実機観測を記録する。
- quickstart で、distro 内の `forwardKeys` が見えること、`TMP` / `TEMP` が空であることを観測する。

## 記録 (実装後に確認した事実。2026-09-30〜10-01)

決定ではなく、実装と実機観測で確かめた事実と残存リスクを記録する (AD-031 の「訂正」節ではない。上の「採択の経緯」を参照)。

1. **(e) の残存リスク**: `ANTHROPIC_BASE_URL` の値は変換しない。Windows 側の loopback（`http://localhost:…`）を指す値は、WSL2 の NAT モードでは WSL 自身の loopback を指す。そのため接続できず、provider-error になる。利用者には mirrored networking か host の IP を指定してもらう（パスの `/u` と同じく、値の意味をアプリは解釈しない）。(code-gate iter1 platform-boundary L-002)
2. **(f) の残存リスク**: `--exec` は login PATH を通さない。したがって claudePath は、それ単体で exec できる必要がある（native installer の ELF）。
   - 失敗する例: nvm / volta / fnm 配下の npm グローバル導入では、claudePath が `#!/usr/bin/env node` のスクリプトになる。`env` が node を見つけられず、起動に失敗する。
   - この失敗は、probe は成功しているのに `launch-failed` になり、理由を区別できない。SH-000 の実測は native 導入の 1 環境だけである。
   - probe の段で claudePath の形を判定する処理は X-6 に繰り越す ((h))。(code-gate iter1 platform-boundary M-003)
3. **Confirmation の実施状況** (2026-10-01): quickstart で次を実機で観測した ([quickstart-results.md](../../specs/008-session-launch-settings-dialog-and-presets/quickstart-results.md) SH-023 追補 #5〜#8)。
   - `plan` → ExitPlanMode の承認後に昇格しないこと
   - `--exec` で起動したプロセスを kill した後に、孤児が残らないこと (AD-018 §3 の `--exec` 形での再観測)
   - config-dir Provider で、distro 内に `forwardKeys` が見え、`TMP` / `TEMP` が空であること

   決定者の判断で、次の 3 点は X-7 の quickstart へ繰り越した ((h))。API key が手元に無いためである。
   - api-key 系の方式に固有の観測
   - Bash tool から秘密 env が見えるかの確認
   - helper (`apiKeyHelper` / `awsCredentialExport`) をシェル経由で実行する方式の観測

## References

- [AD-015](0015-wsl-access-strategy.md) / [AD-020](0020-sdk-emitted-message-inventory.md) / [AD-036](0036-single-session-launch-process-and-live-stream.md) / [AD-039](0039-credential-delegation-verified.md) / [AD-040](0040-provider-settings-constrained-projection.md) / [AD-042](0042-provider-type-refinement-and-d4-lapse.md)
- [spec 008](../../specs/008-session-launch-settings-dialog-and-presets/spec.md) / [design-gate](../../specs/008-session-launch-settings-dialog-and-presets/design-gate.md) / [quickstart-results](../../specs/008-session-launch-settings-dialog-and-presets/quickstart-results.md)
