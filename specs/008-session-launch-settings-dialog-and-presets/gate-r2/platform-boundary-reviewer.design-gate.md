# platform-boundary-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 2

**Run**: 2026-09-30
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 2

## 初回読了 viewpoint

本 bundle が影響する FR / SC:
- FR-001 (WSL 限定の起動)
- FR-004 / SC-005 (安全 3 値)
- FR-005 (launch メッセージと decoder)
- FR-012 / SC-006 (config-dir の RuntimePath)
- FR-013 / SC-007 (WSLENV の生成、`--exec`)
- FR-014 (helperPath の分類)
- FR-002 / SC-001 (到達可能性)
- SC-009 (argv がシェルを経由しない)

該当する charter / Confirmation:
- runtime charter L39「起動契約」
- AD-003 (transport 軸)
- AD-004 (変換段数)
- AD-036 §3 / §6 / L90 (`--` 形)
- AD-015 §5
- Constitution I / III / VI (項目 2 / 6 / 16) / VII

- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer。H-101 の CWE-426 面は platform の実行ファイル解決として扱い、secret 面は委ねる
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer。`--exec` によるシェル展開の除去は SC-009 に入っている
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:0
- D. Constitution / ADR drift: Critical:1 High:1 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

round 1 の指摘 (env が wsl.exe を越えない / helper の名前空間 / 項目 6 の構造) は、次の 3 つで閉じられた。
- アプリが実名キーから `WSLENV` を生成する (`/u` のみ)
- `wsl.exe --exec` に切り替える
- helper 生成を X-7 へ繰り越す

ただし「導出キーの実名」という集合の定義が、X-3 の実装と噛み合っていない。X-3 の `DerivedLaunchEnv.env` は curated base (TEMP / TMP / SystemRoot / windir / WSL_UTF8) を既に含んでいる。そのため、Windows 名前空間のパス値が WSL 内の `claude` に届く。これを実機で確認した。

## Round 1 status

| ID | status | evidence path:line |
|---|---|---|
| C-001 (機械的に High へ降格済み) env が wsl.exe を越えない | resolved (ただし新規 C-101 を派生) | spec.md:225-230 / plan.md:160-163 / tasks.md:71-75 |
| H-001 helper パスの名前空間喪失と fail-open | resolved (判定側との乖離が新規 M-101 に残る) | spec.md:231-234 / plan.md:168,202 / tasks.md:146-148 |
| H-002 項目 6 の 3 点検査が構造的に不成立 | resolved (helper 生成を X-7 へ繰り越し、項目 6 は変更しない) | spec.md:39-42 / plan.md:146,245 |
| M-001 configDir の変換実装が判定と別 | resolved | plan.md:201 / tasks.md:142-145 |
| M-002 agents decoder の新フィールド | resolved (env は範囲外のまま。H-101 で扱う) | spec.md:192 / tasks.md:55-60 |
| M-003 項目 16 backstop の誤検知と shorthand | resolved | plan.md:240-243 / tasks.md:153-157 |
| M-004 helper の上書き競合 | resolved (繰り越しにより消滅) | spec.md:332 |
| M-005 principle-v-unknown-shape-secret の根拠 | resolved | plan.md:124 |
| M-006 SC の計測が導出値の単体だけ | resolved (quickstart に distro 内観測を追加) | tasks.md:183-189 |
| L-001 / L-002 / L-003 / L-004 | resolved | tasks.md:158-161,157 / spec.md:217 / plan.md:229 |

## Findings

### [Critical] WSLENV の「導出キーの実名」に curated base の TEMP / TMP が含まれ、Windows パスが WSL 内 claude の tmpdir になる (C-101) (scope: feature) [new]

- **観察**:
  - plan.md:160-163 / tasks.md:72 は `composeLaunchEnv(curatedBase, derived)` を定める。内容は「`WSLENV` は `derived` のキーの実名に `/u`」「キーは `^[A-Z_][A-Z0-9_]*$`」。
  - しかし `derived` の供給元である X-3 `deriveLaunchEnv` は、`const env = { ...curatedBase }` から組み立てている (src/domain/provider/derive-env.ts:38)。curatedBase は `providers.deriveEnv` が `curatedBaseEnv()` = `buildLaunchEnv(process.env)` で注入する (src/main/app/provider-service.ts:285, src/main/app/composition-root.ts:285)。
  - その中身は `SystemRoot` / `windir` / `TEMP` / `TMP` / `WSL_UTF8` である (src/main/infra/runtime/launch-spec.ts:24,47)。
  - `TEMP` / `TMP` / `WSL_UTF8` は名前規則を通るので、`WSLENV` に列挙される。`SystemRoot` / `windir` は小文字を含むので規則に落ちるが、落ちたときに捨てるのか起動を拒否するのかは未定義である。
  - **実機で確認した** (Ubuntu-26.04):
    - `TMP='C:\Users\probe\AppData\Local\Temp' WSLENV=TMP/u wsl.exe --exec /bin/sh -c 'printf %s "$TMP"'` の結果は `TMP=C:\Users\probe\AppData\Local\Temp` で、値が変換されずに届いた。
    - 同じ条件で `wsl.exe --cd /tmp --exec /usr/bin/node -e` を実行し、`os.tmpdir()` を見た。結果は `{"tmpdir":"C:\\Users\\probe\\AppData\\Local\\Temp","isAbsolute":false,"resolved":"/tmp/C:\\Users\\probe\\AppData\\Local\\Temp"}` だった。
- **同種事象探索**: 導出 env に curated base が混入する経路を探した。クエリは `\.\.\.curatedBase|curatedBaseEnv|LAUNCH_ENV_ALLOWLIST =|導出キーの実名|キーの実名` で、7 件あった。
  - derive-env.ts:38
  - provider-service.ts:285
  - composition-root.ts:285
  - launch-spec.ts:24
  - plan.md:161
  - tasks.md:72
  - spec.md:227
- **リスク/影響**:
  - Node は `TMPDIR || TMP || TEMP` の順に tmpdir を決めるので、WSL 内 claude の tmpdir が相対パスになる。そのパスは起動 cwd (= 利用者の作業フォルダ) を基準に解決される。
  - その結果、作業フォルダ配下に `C:\Users\...\Temp` という名前のディレクトリが作られる。shell snapshot などの一時ファイルが利用者のリポジトリに書き込まれ、git に混入しうる。
  - Principle I の名前空間喪失が、実際に誤ったディレクトリを解決する経路である。
  - SC-007 の単体テスト (「WSLENV = 導出キーの実名だけ」) は、この集合を正と見なすので緑のまま通る。
- **推奨アクション**:
  1. WSLENV に載せるキー集合を型で分離する。
     - `DerivedLaunchEnv` に `injectedKeys` (方式固有の実名キー + extraEnv の採用キー) を持たせる。
     - または `composeLaunchEnv` が `derived.env` から `curatedBase` と同名のキーを必ず差し引く。
  2. `LAUNCH_ENV_ALLOWLIST` と `WSL_UTF8` を「WSLENV に決して載せないキー」として明示する。そのうえで、名前規則に落ちたキーは捨てずに起動を拒否する (fail-closed)。
  3. SC-007 の単体テストに負の assert を足す。WSLENV に TEMP / TMP / SystemRoot / windir / WSL_UTF8 が 0 件であること。
  4. quickstart SH-023 に「distro 内の `printenv TMP TEMP` が空」を足す。
  5. cascade 7 箇所のうち、plan.md:161 / tasks.md:72 / spec.md:227 の文言を「方式が注入したキー + extraEnv の採用キー」に直す。
- **根拠**: Principle I / AD-004 (値は選択ランタイムの名前空間で渡す) / AD-036 §6 (「Windows→WSL 起動に必要な最小の実名許可リスト」) / runtime charter L39「起動契約」
- **scope 根拠**: FR-013 / BE-009 が本 feature で新設する配送経路そのものである

### [High] extraEnv が curated base のキー (SystemRoot / windir / PATH / WSL_UTF8) を上書きでき、wsl.exe の絶対パス解決が利用者の値に依存する (H-101) (scope: feature) [new]

- **観察**:
  - extraEnv の KEY 検証は非空・長さ・制御文字だけである (src/main/app/validate.ts:246-252)。導出時に除外されるのは denylist と `CLAUDE_CONFIG_DIR` だけである (derive-env.ts:44-48)。
  - このため `SystemRoot` / `windir` / `PATH` / `WSL_UTF8` は extraEnv から curated base を上書きできる。
  - X-4 はこの合流 env を `buildRuntimeLaunchSpec` に渡す (plan.md:183, tasks.md:66)。`resolveWslCommand` は `env.SystemRoot ?? env.windir` から wsl.exe を解決する (launch-spec.ts:65)。
  - X-1 は `buildLaunchEnv(process.env)` だけを渡していたので、この経路は X-4 で初めて生じる (composition-root.ts:250)。
  - agents の decoder は env のキーと値を検査せずに通す (src/agents/sdk-agent-session.ts:176-181)。
- **リスク/影響**:
  - extraEnv に `SystemRoot=<任意ディレクトリ>` を入れると `<任意>\System32\wsl.exe` が spawn される。X-1 pr-gate M-001 が塞いだ CWE-426 が退行する。
  - `PATH` を extraEnv に入れて WSLENV `/u` で透過させると、WSL 内の PATH が Windows 形式の値で置き換わる。`#!/usr/bin/env node` 形式の claude は起動できなくなる。
- **推奨アクション**:
  1. curated base と同名のキー、および `PATH` を extraEnv の KEY denylist に加える。IPC (validate) / provider-record / deriveEnv の 3 箇所で同じ述語を使う (write/read 対称)。
  2. `resolveWslCommand` には合流前の curated base を渡す。`buildRuntimeLaunchSpec` の引数を `baseEnv` と `launchEnv` に分ける。
  3. agents の decoder に二重層を足す。WSLENV の各要素が `/u` フラグだけを持ち、env に実在し、curated base のキーでないこと。
- **根拠**: AD-036 §6 / CWE-426 / X-1 pr-gate platform-boundary M-001

### [Medium] helperPath の分類が起動時だけにあり、到達可能性の判定 (assessReachability) と一致しない (M-101) (scope: feature) [new]

- **観察**:
  - FR-014 / BE-031 (tasks.md:146-148) は、分類できない helperPath を起動時に拒否する。
  - 一方 `assessReachability` は、config-dir 以外の方式を無条件に `reachable` と判定する (src/domain/provider/reachability.ts:29)。
  - ダイアログ (FR-002) と main の依存解決 (FR-006) はこの判定を facts にする。したがって「選択肢には出るが起動すると必ず拒否される Provider」が生じる。
  - SC-001 は到達可能性の関数で計測されるので、この乖離を検出できない。
- **推奨アクション**: helperPath の分類関数を domain に置き、`assessReachability` と `prepareLaunch` の両方から呼ぶ。判定する関数と実行する関数を同一にする (round 1 M-001 と同じ構え)。
- **根拠**: Principle I / FR-002 / FR-006

### [Medium] composeLaunchEnv (WSLENV の符号化) が domain/session に置かれ、WslRuntime の transport 詳細が session に漏れる (M-103) (scope: feature) [new]

- **観察**:
  - plan.md:160 は `domain/session/launch-env.ts` を新設し、WSLENV を生成させる。
  - WSLENV は WslRuntime の transport (`wsl.exe`) に固有の env 配送形式である。DockerRuntime (`-e`) や Win32Runtime (直接 env) では形式が異なる (AD-003)。
  - 起動契約は runtime charter の In scope である (docs/domains/runtime/charter.md:39)。
- **推奨アクション**:
  - WSLENV の生成は `infra/runtime/launch-spec.ts` の WSL 分岐に置く。
  - session に残してよいのは、transport に中立な「注入キー集合」の算出までとする。
  - 純粋関数なので、infra に置いても Electron なしで単体テストできる。
- **根拠**: AD-003 / runtime charter L39

### [Medium] 項目 2 (wsl 引数の許可リスト) の走査対象に launch-spec.ts が入っておらず、`--exec` を足すという plan の記述は空振りする (M-102) (scope: feature) [new]

- **観察**:
  - 項目 2 が走査するのは `WSL_CALLER_MODULES` = `wsl-cli.ts` だけである (scripts/constitution/allowlists.mjs:186, check.mjs:158-169)。起動 argv を組む launch-spec.ts:102 は走査されない。
  - `--exec` は既に許可リストにある (allowlists.mjs:178)。したがって plan.md:144,244 / tasks.md:75 の「`WSL_ALLOWED_ARGS` に `--exec` を足す」は何も変えない。
  - 起動 argv に `-u root` を足しても検出されない。R-01 の代替案 `--exec /bin/sh -lc 'exec "$0" "$@"'` (plan.md:258) も同じで、項目 2 にも項目 6 (stdin 書き込みだけを見る) にも掛からないシェル本文になる。
- **推奨アクション**:
  - 項目 2 の走査対象に launch-spec.ts を加える。
  - 起動 argv では `-u` / `--user` を不許可にする。
  - R-01 の代替案を採るなら、そのシェル本文を `DISTRO_SCRIPT_CONSTANTS` の管理下に置くことを tasks に書く。
  - `-u root` を入れた違反 fixture を足す。
- **根拠**: PB-7 / Principle VI 項目 2

### [Medium] SC-007 の検査基準が曖昧な「導出キー」集合を基準にしており、C-101 / H-101 を検出できない (M-104) (scope: feature) [new]

- **観察**: SH-020 (tasks.md:173) と SC-007 (spec.md:296) の assert は「WSLENV = 導出キーの実名だけ」である。基準が C-101 の誤った集合そのものなので、テストは緑のまま通る。quickstart も「導出キーが見える」ことだけを確認する (tasks.md:187)。
- **推奨アクション**:
  - base のキーが WSLENV に現れない負例を足す。
  - extraEnv による `SystemRoot` 上書きを拒否する負例を足す。
  - distro 内の `printenv TMP` が空であることを確認する。
- **根拠**: Principle XI / AD-036 §6

### [Low] UNC configDir の同一 distro 判定が、判定側は `===`、実行側は `isSameDistro` と別の比較になる (L-101) (scope: feature) [new]

判定側は reachability.ts:51 の `distro === runtime.distroName`、実行側は plan.md:201 / tasks.md:144 の `isSameDistro(ns, runtime.id)` である。綴りの正規化 (X-3 PB-L-001) を扱うなら、両方を `isSameDistro` に揃える。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-101 | `\.\.\.curatedBase\|curatedBaseEnv\|LAUNCH_ENV_ALLOWLIST =\|導出キーの実名\|キーの実名` | 7 | src/domain/provider/derive-env.ts:38 / src/main/app/provider-service.ts:285 / src/main/app/composition-root.ts:285 / src/main/infra/runtime/launch-spec.ts:24 / specs/008-session-launch-settings-dialog-and-presets/plan.md:161 / tasks.md:72 / spec.md:227 |
| H-101 | `SystemRoot\|isValidExtraEnv\|DERIVATION_CONTROLLED_KEYS` (src, テスト除く) | 5 | src/main/infra/runtime/launch-spec.ts:24,65 / src/main/app/validate.ts:246 / src/domain/provider/derive-env.ts:32,46 |
| M-102 | `WSL_CALLER_MODULES =\|'--exec'` in scripts/constitution | 2 | scripts/constitution/allowlists.mjs:178,186 |

## Verdict

- Critical: 1
- High: 1
- Medium: 4
- Low: 1
- Round inheritance: resolved from 1: 13 / unresolved: 0 / new: 7

補足: C-101 は round 1 の High を格上げしたものではない。round 1 の修正で新設された WSLENV 生成に対する新規指摘である。追加事実として、実機 probe で TMP がそのまま届くこと、WSL 内 Node の `os.tmpdir()` が cwd 基準の相対パスになることを確認した。
