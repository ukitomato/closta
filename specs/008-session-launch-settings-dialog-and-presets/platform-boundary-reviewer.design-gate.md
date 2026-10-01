# platform-boundary-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 3

## 初回読了 viewpoint

- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer。passthrough 値の秘密面は委ねる。M-203 は名前空間の面だけを扱う
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer。`--exec` 化によるシェル展開の除去は SC-009 に入っている
- C. 業務不変条件 / Charter drift: 該当なし: WSLENV の生成は `infra/runtime/launch-spec.ts` に移った (plan.md:193-203)。runtime charter L39 の起動契約の範囲に収まり、runtime / isolation charter の Out of scope 侵犯は無い
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (SC-007 の負の assert は、base キー 0 件 / base WSLENV 0 件 / SystemRoot 上書き無効化で揃った (tasks.md:209-213)。quickstart も `printenv TMP TEMP` が空であることを確認する (tasks.md:231)。残る穴は M-203 / L-201 の推奨アクションで、テストケースとして扱う)

## Round 2 status

| ID | status | evidence path:line |
|---|---|---|
| C-101 curated base の TEMP / TMP が WSLENV に載る | resolved | spec.md:237-243 / plan.md:162,194-199 / tasks.md:83,87,210 |
| H-101 extraEnv が SystemRoot / PATH を上書きする | resolved (大文字綴りの抜けが新規 L-201 に残る) | spec.md:244-249 / plan.md:155,200-201 / tasks.md:35,88,213 |
| M-101 helperPath の分類が到達可能性判定と一致しない | resolved | spec.md:258 / plan.md:158-160 / tasks.md:166-171 |
| M-102 項目 2 が launch-spec.ts を走査しない | unresolved (pin テストは入った。違反 fixture は検出器が無いまま。下の M-102 を参照) | plan.md:288-293 / tasks.md:183-186 |
| M-103 WSLENV の生成が domain/session にある | resolved | plan.md:193-203 / tasks.md:81,86-89 |
| M-104 SC-007 の基準が曖昧な集合になっている | resolved | spec.md:322-330 / tasks.md:209-213,231 |
| L-101 同一 distro 判定の `===` と isSameDistro の不一致 | resolved | plan.md:223 / tasks.md:164,171 (src/domain/runtime/namespace.ts:126 に `isSameDistro` が実在する) |

## Findings

### [Medium] 起動 argv の「`-u root` 違反 fixture」には発火する検出器が無い (M-102) (scope: feature) [unresolved from prev]

- **観察**:
  - SH-011 (tasks.md:183-186) と plan.md:290-292 は 2 つを足す。`buildRuntimeLaunchSpec` の pin テストと、「違反 fixture: `-u root` を含む起動 argv」である。
  - ところが項目 2 の走査対象は `WSL_CALLER_MODULES` = `wsl-cli.ts` だけである (scripts/constitution/allowlists.mjs:186, check.mjs:158,169)。
  - 仮に launch-spec.ts を走査対象に加えても、`-u` / `--user` は `WSL_ALLOWED_ARGS` に入っている (allowlists.mjs:176-177)。`root` は `-` で始まらないので検査されない (check.mjs:172)。つまり項目 2 は `-u root` を構造的に検出できない。
  - 項目 3 が発火するのは `wsl.exe` のリテラルを名指したときだけである (check.mjs:195)。launch-spec.ts は `resolveWslBinary` を import して使い、リテラルを持たない (launch-spec.ts:3,65)。
  - 期待表は `detectors` に実際の検出器を書く規約である (tests/rule-fixtures/expected.mjs:16-25)。そのため、この fixture を `constitution` で書けば test:rules が落ちる。fixture に `wsl.exe` リテラルを足して `#3` で満たせば、pr-gate Round 1 C-001 (expected.mjs:190-195) と同じ「別の規則で誤って満たされる」形になる。
- **同種事象探索**: `'-u'|'--user'|違反 fixture: \`-u root\`` を検索し、4 件あった。allowlists.mjs:176,177 / plan.md:292 / tasks.md:185。
- **リスク/影響**:
  - 期待表が嘘になるか、SH-021 (test:rules 全緑) が構造的に達成できない。
  - 起動 argv の退行 (`-u root` の追加 / `--exec` から `--` への戻り) を守るのは、実質的に pin テストだけになる。
- **推奨アクション**:
  - 案 1: 違反 fixture を削り、退行検出は pin テストに一本化する。
  - 案 2: fixture を `detectors: ['none']` で登録し、UNDETECTED_NOTES に `nextFeature` と howToClose を書く。
  - 案 3: 機械検出を置くなら、項目 3 の名指し許可とは別の「起動 argv モジュール」リストを新設する。そこでは `-u` / `--user` を不許可にし、`--exec` の存在を要求する。この判断は SH-011 どおり AD-041 (f) に記録する。
- **根拠**: PB-7 / Principle VI 項目 2 / expected.mjs の detector 規約

### [Medium] SH-000 不成立時の代替 (固定リテラルを項目 6 に登録する) は、現行の項目 6 の検査と構造的に噛み合わない (M-201) (scope: feature) [new]

- **観察**:
  - spec.md:295 / plan.md:310-312 は、`--exec /bin/sh -c '<固定リテラル>' <claudePath> ...` の固定リテラルを `DISTRO_SCRIPT_CONSTANTS` に登録すると定める。
  - 項目 6 の (ii) は、全ソースの `.stdin.write/end(<id>)` を集め、**各 entry について、全 writer の識別子がその entry の識別子と一致すること**を要求する (check.mjs:304-319)。
    - 2 つ目の entry を足すと、既存の `PROBE_SCRIPT` の writer が新しい entry に対する違反になる。
    - argv の `-c` で使う新定数には stdin writer が無いので、「標準入力へ書く箇所が見つからない」違反も出る (check.mjs:311-312)。
  - (iii) は各行が `DISTRO_SCRIPT_ALLOWED_FORMS` のどれかを含むことを要求する (check.mjs:328-333)。`exec "$0" "$@"` の形はどの許可形にも当たらない (allowlists.mjs:474-482)。
  - さらに、argv 経由で `-c` に渡す式が定数の識別子そのものであることを見る検査は、どこにも無い。
- **同種事象探索**: `項目 6 に登録|DISTRO_SCRIPT_CONSTANTS\`\) に登録` を検索し、2 件あった。spec.md:295 / plan.md:311。
- **リスク/影響**:
  - SH-000 が不成立なら、分岐は即座に check:constitution を赤にする。
  - それを回避するために項目 6 を緩めると、round 1 の H-002 と同じ「検査が形だけ残る」状態になる。
  - これは人間の決定「`--exec` は SH-000 に従う」の分岐先であり、その決定自体を覆すものではない。分岐を実行する機構が欠けている。
- **推奨アクション**:
  - AD-041 (f) の分岐に、項目 6 の改修を含めて書く。改修の中身は 3 つ。
    - entry ごとに入口の種類 (`stdin` / `argv-c`) を持たせる。
    - (ii) の照合を入口の種類ごとに行う。
    - `-c` の直後の引数が定数の識別子そのものであることを検査する。
  - あわせて `exec "$0" "$@"` の形を許可形に加える。
  - この分岐を採る場合は、tasks に対応する SH を立てる。
- **根拠**: Principle VI 項目 6 / PB-7 / round 1 H-002

### [Medium] env-passthrough の値は Windows 名前空間のまま `/u` で転送され、名前の denylist が TMPDIR を含まない (M-203) (scope: feature) [new]

- **観察**:
  - X-4 は env-passthrough の varNames の値を、アプリ自身の process.env から取る (spec.md:247 / plan.md:164,205 / tasks.md:91)。そしてパス変換なしの `/u` で転送する (spec.md:242)。
  - varNames は検出由来 (src/main/infra/provider/detect.ts:80-86) のほか、利用者が自由入力できる (src/renderer/src/features/provider/ProviderScreen.tsx:64)。
  - 値が Windows 名前空間のパスである変数は、企業環境では典型的である。例: `NODE_EXTRA_CA_CERTS` / `AWS_SHARED_CREDENTIALS_FILE` / `AWS_CONFIG_FILE` / `SSL_CERT_FILE`。
  - 転送禁止キー (spec.md:245 / tasks.md:35) は `TEMP` / `TMP` を「curated base と同名」で含む。しかし Node の tmpdir が最優先で読む `TMPDIR` を含まない (src にも言及 0 件)。
  - このため extraEnv または passthrough の `TMPDIR=C:\...` で、round 2 C-101 と同じ事象 (作業フォルダ基準の相対 tmpdir) が再現する。
- **同種事象探索**: `TMPDIR|passthroughValues` を検索した (specs/008 の spec/plan/tasks と src)。計 9 件あり、`TMPDIR` は 0 件だった。plan.md:164,179,205,280,324,327 / tasks.md:23,39,85。
- **リスク/影響**:
  - Principle I の名前空間喪失である。
    - TMPDIR では利用者のリポジトリ配下へ書き込む経路になる (round 2 C-101 と同じ実害)。
    - それ以外のパス変数では、WSL 内 claude が cwd 基準の相対パスとして読みにいき、沈黙失敗する (CA 証明書が効かない、など)。
  - 利用者の構成に依存するので Medium とした。
- **推奨アクション**:
  1. `isForbiddenForwardKey` に `TMPDIR` を足す (Node の tmpdir の 3 キーを揃える)。
  2. passthrough 値と extraEnv 値に名前空間の検査を掛け、Windows パスの形 (`^[A-Za-z]:[\\/]` / `^\\\\`) なら起動を拒否する (`invalid-config`)。PathMapping での自動変換はしない (値の意味をアプリは知らない)。
  3. SH-020 に負例を足す。`TMPDIR` を含む extraEnv の拒否、Windows パス値の passthrough の拒否。
  4. AD-041 (e) の残存リスクに「passthrough 値は Windows 名前空間」と記録する。
- **根拠**: Principle I / AD-004 / AD-041 (e) / round 2 C-101 の実測

### [Low] 転送禁止キーの「curated base と同名」が大文字小文字を区別する比較だと、`SYSTEMROOT` / `WINDIR` が抜ける (L-201) (scope: feature) [new]

- **観察**:
  - 名前規則 `^[A-Z_][A-Z0-9_]*$` は `SystemRoot` / `windir` を落とす。一方 `SYSTEMROOT` / `WINDIR` は通す。
  - 「同名」を大文字小文字を区別する比較で実装すると、この 2 つは禁止に当たらず forwardKeys に入る (spec.md:243-245 / plan.md:155)。
  - Windows の env は大文字小文字を区別しない。Node の `child_process` は Windows で、キーを辞書順に並べてから大文字小文字を無視して重複を除き、先頭を残す。`SYSTEMROOT` は `SystemRoot` より前に並ぶので、wsl.exe の spawn env では利用者の値が勝つ。
  - wsl.exe の絶対パス解決は `baseEnv` を使うので、CWE-426 は再発しない (plan.md:201)。影響は、base キーを転送しないという不変条件の名目上の破れと、wsl.exe 自身の `SystemRoot` の差し替えに留まる。
  - 既存の `LAUNCH_ENV_DENY_PATTERN` は `/i` で書かれている (launch-spec.ts:30)。新しい述語だけが区別すると非対称になる。
- **推奨アクション**:
  - `isForbiddenForwardKey` の base 同名判定を、大文字に揃えてから比較する形で定義する。
  - SH-020 に `SYSTEMROOT` / `WINDIR` / `Temp` の負例を足す。
- **根拠**: Principle II (プラットフォーム差を infra に閉じる) / AD-041 (e)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-102 | `'-u'\|'--user'\|違反 fixture: \`-u root\`` | 4 | scripts/constitution/allowlists.mjs:176 / scripts/constitution/allowlists.mjs:177 / specs/008-session-launch-settings-dialog-and-presets/plan.md:292 / specs/008-session-launch-settings-dialog-and-presets/tasks.md:185 |
| M-201 | `項目 6 に登録\|DISTRO_SCRIPT_CONSTANTS\`\) に登録` | 2 | specs/008-session-launch-settings-dialog-and-presets/spec.md:295 / specs/008-session-launch-settings-dialog-and-presets/plan.md:311 |
| M-203 | `TMPDIR\|passthroughValues` (specs/008 spec/plan/tasks + src) | 9 | plan.md:164 / plan.md:179 / plan.md:205 / plan.md:280 / plan.md:324 / plan.md:327 / tasks.md:23 / tasks.md:39 / tasks.md:85 |
| L-201 | `curated base と同名` | 2 | specs/008-session-launch-settings-dialog-and-presets/spec.md:245 / specs/008-session-launch-settings-dialog-and-presets/tasks.md:35 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 1
- Round inheritance: resolved from 2: 6 (C-101 / H-101 / M-101 / M-103 / M-104 / L-101) / unresolved: 1 (M-102) / new: 3 (M-201 / M-203 / L-201)

補足: round 2 の Critical C-101 と High H-101 は spec / plan / tasks の 3 面で閉じた。C-101 は forwardKeys を明示集合にし、base キーを転送しないことで閉じた。H-101 は wsl.exe の解決に baseEnv を使い、転送禁止キーの述語を 3 箇所で共有することで閉じた。今回は wsl.exe の probe を実行していない。新規指摘はいずれも Critical ではなく、`check.mjs` / `expected.mjs` / `launch-spec.ts` / `derive-env.ts` の静的な読解で確定した。

関連ファイル:
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\spec.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\plan.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\tasks.md
- C:\dev\closta\scripts\constitution\check.mjs
- C:\dev\closta\scripts\constitution\allowlists.mjs
- C:\dev\closta\tests\rule-fixtures\expected.mjs
- C:\dev\closta\src\main\infra\runtime\launch-spec.ts
- C:\dev\closta\src\domain\provider\derive-env.ts
- C:\dev\closta\src\main\infra\provider\detect.ts
