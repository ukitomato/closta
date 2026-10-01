# architecture-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 2

**Run**: 2026-09-30
**Reviewer**: architecture-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017、SC-001〜SC-010 をすべて読んだ。本トラックが主に照合したのは FR-004 / FR-005 / FR-006 / FR-012 / FR-013 / FR-014 / FR-015 / FR-017 と SC-002 / SC-005 / SC-007 / SC-009
- touched files に該当する charter / Confirmation:
  - session charter (Scope・業務ルール・KPI)、provider charter (L32 / L93-95 / Related Specs)
  - _overview の依存関係と Feature 帰属、glossary (LaunchInput / Preset / Model catalog / Cross-boundary)
  - AD-015 §2 / §5 / §7、AD-036 §3 / §4 P1 / §5 / §6 / §8
  - AD-040 Decision 3 と Consequences L69
  - 005 の contracts C-4 / C-5、data-model §7 / §8、X-1 SC-006(a)(b)(c)
  - Constitution Principle III / V / VI (項目 2 / 6) と L845
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲 (model ID の文字種や `--exec` のシェル展開の是非を含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲。レイヤ配置の妥当性は C / D に含めた
- G. optional reviewer 範囲: 該当なし: presets.json のスキーマ互換は database-reviewer の owner (ARCH-6 の除外規定)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

round 2 の bundle は round 1 の指摘を次の形で取り込んでいる。

- AD-041 の決定範囲を (a)〜(h) に広げた。
- aws-assume-role helper の生成を X-7 へ、KPI 計測を O-3 へ繰り越した。
- env は実名の `WSLENV` で配送し、起動 argv は `wsl.exe --exec` にする。
- main の起動ゲートで依存解決を再評価する。

人間が決めた事項 (WSLENV の実名生成、X-7 / O-3 / X-6 への繰越、SH-000 を前提とした `--exec`) は確定扱いとし、蒸し返していない。本 round で見たのは次の 3 点である。

- 変更した決定が、影響を受けるすべての accepted ADR と先行 feature の SSoT (005 contracts / data-model / SC) に、読み替えとして届いているか
- 新しい純粋関数の置き場が、レイヤ規則と domain 間の依存方向に沿っているか
- 繰越先が charter / _overview に反映されているか

## Round 1 status

| ID | status | evidence path:line |
|---|---|---|
| C-001 | resolved | spec.md:194, spec.md:319, plan.md:233, tasks.md:17, tasks.md:53 |
| H-001 | resolved | spec.md:225-230, plan.md:160-164, plan.md:231, spec.md:295-297, tasks.md:187 |
| H-002 | resolved (X-7 へ繰越) | spec.md:39-42, plan.md:53, plan.md:146, docs/roadmap.md:189 |
| H-003 | resolved (X-7 へ繰越) | spec.md:265, spec.md:332 |
| H-004 | resolved | spec.md:199, spec.md:280, plan.md:195, tasks.md:63 |
| M-001 | resolved | spec.md:223, plan.md:201, tasks.md:142-145 |
| M-002 | resolved | tasks.md:19-22 |
| M-003 | resolved | plan.md:132, tasks.md:168 |
| M-004 | resolved (残りは L-102) | tasks.md:158-161, spec.md:336-340 |
| M-005 | resolved (O-3 へ繰越。残りは L-101) | spec.md:339, plan.md:138, tasks.md:166 |
| M-006 | resolved (置き場について新たに M-103) | plan.md:160-164 |
| M-007 | resolved | plan.md:173, tasks.md:53 |
| M-008 | resolved | spec.md:292-297, tasks.md:186-188 |
| L-001 | resolved | tasks.md:164 |
| L-002 | resolved | tasks.md:165 |
| L-003 | resolved | tasks.md:32 |
| L-004 | resolved | plan.md:143, tasks.md:157 |
| L-005 | unresolved (一部。helper の寿命は X-7 繰越で消えたが、束ね方は残る) | plan.md:226-235 |

## Findings

### [High] AD-041 が上書きするのは X-1 SC-006(a) だけで、SC-006(b)(c) と env の正本 (005 contracts C-5 / data-model §7) が偽のまま残る (H-101) (scope: feature) [new]

- **観察**:
  - X-4 は wsl.exe の spawn env に `WSLENV` と導出資格情報 (`ANTHROPIC_API_KEY` / `AWS_PROFILE` / `CLAUDE_CONFIG_DIR` など) を載せる (spec.md:225-228、plan.md:160-164 / 231)。
  - ところが X-1 の SC-006(b) は、`child_process.spawn` に渡る**最終 env**について 3 点を assert している (`specs/005-session-launch-and-streaming/spec.md:403-406`)。
    - キー集合が許可リストと完全一致する
    - `WSLENV` と資格情報系パターンが 0 件である
    - (c) 資格情報の注入が 0 件である
  - 同じ規則は `specs/005-.../contracts/session-launch.md:90-93` (C-5。「`CLAUDE_CONFIG_DIR` は起動 env に含めない」を含む) と `data-model.md:180-184` (§7。正本と明記) にもある。
  - AD-041 の範囲は (b) で「SC-006(a) の `dontAsk` 禁止」を上書きし (spec.md:186 / 318、plan.md:228)、(e) で AD-036 §6 を読み替える。しかし SC-006(b)(c)、C-5、data-model §7 の読み替えはどこにも書かれていない。
  - SH-001 が pointer を足すのも C-4 だけである (tasks.md:17、plan.md:233)。
- **同種事象探索**:
  - X-1 側で「最終 env に WSLENV / 資格情報が 0」と定めた正本は 4 件ある。`specs/005-.../spec.md:403`、`contracts/session-launch.md:91`、`data-model.md:180`、`docs/decisions/0036-...md:170`。
  - このうち 008 の tasks / plan が AD-041 の読み替えや pointer の対象にしているのは 0036 の 1 件だけである。
- **リスク/影響**:
  - round 1 C-001 の C-4 と同じ種類の問題で、上書き後も先行 feature の SSoT が逆の規則を正本として主張し続ける。
  - 005 contracts C-5 を正本として参照する X-5 などの後続が「資格情報を env に載せてはならない」と読み、X-4 の配線を違反として扱うか、逆に巻き戻す経路になる。
  - AD-036 §3 (`0036:84-87`) は SC-006(b) を「実 spawn 点の env の assert」の根拠にしているので、ADR 本文の中でも参照が食い違う。
- **推奨アクション**:
  - AD-041 (b) を「X-1 SC-006(a) と (b)(c) の env 部分」を上書きする形に広げる。(b) は「passthrough キーは許可リストと完全一致、導出キーは `composeLaunchEnv` の実名規則、`WSLENV` はアプリ生成分だけ」、(c) は「資格情報の注入は wsl.exe spawn env に限り、fork env と argv では 0」に読み替える。
  - SH-001 に、005 contracts C-5 と data-model §7 へ AD-041 (e) への pointer を足す作業を加える (C-4 と同じ扱い)。
  - SH-020 には、改める X-1 のテストを実名で書く。`launch-spec.test.ts:29` は passthrough 限定として存続させ、spec.env の完全一致 assert は X-4 の形に置き換える。
- **根拠**: AD-031 (決定の変更は後続 ADR に置き、先行の正本を偽のまま残さない)、AD-036 §3 / §6、005 contracts C-5
- **scope 根拠**: AD-041 は本 feature で起票するので、範囲の追記で直せる

### [Medium] AD-041 (f) の読み替え対象が AD-015 §5/§7 だけで、`--` 形を決めた AD-015 §2 / AD-036 §3 / data-model §8 が挙がっていない。R-01 の代替案が項目 6 の変更を伴うことも書かれていない (M-101) (scope: feature) [new]

- **観察**:
  - plan.md:232 と spec.md:318 は、(f) の整合相手を「AD-015 §5/§7」としている。
  - しかし `wsl.exe -d <distro> -- ...` という起動形を**決定**として書いているのは次の 3 箇所である。
    - `docs/decisions/0015-wsl-access-strategy.md:55` (§2)
    - `docs/decisions/0036-...md:90` (§3。prefixArgs `['--cd', spec.cwd, '-d', distro, '--']`)
    - `specs/005-.../data-model.md:202` (§8)
  - さらに R-01 の代替案 `--exec /bin/sh -lc 'exec "$0" "$@"' <claudePath>` (plan.md:258) は、ディストロ内で固定のスクリプト文字列を実行する。これは Constitution Principle VI 項目 6 (`constitution.md:461`) の「定義済みの内容と一致」の対象であり、`DISTRO_SCRIPT_CONSTANTS` への登録 (ADR 要) が要る。一方で plan は「項目 6 / DISTRO_SCRIPT_CONSTANTS は変更しない」と書いている (plan.md:53 / 146 / 245)。
- **同種事象探索**: `'--'\]` を src で検索すると 4 件ある (`src/main/infra/runtime/launch-spec.ts:102`、`launch-spec.test.ts:68`、`src/agents/session-core.test.ts:141`、`src/domain/session/agent-session.ts:84` のコメント)。これに ADR / data-model の決定記述 3 件 (0015:55、0036:90、005 data-model.md:202) が加わる
- **リスク/影響**:
  - AD-036 §8 が確立した「読み替え先を節番号で明示する」調停形式 (`0036:181-193`) から外れる。§3 と §2 は「`--` 形」を決定として残したまま、実装だけが `--exec` になる。
  - SH-000 が不成立で代替案を採った場合、AD-041 が accepted 後に Principle VI の許可リスト追加を黙って含むことになる。
- **推奨アクション**:
  - (f) の読み替え対象に AD-015 §2、AD-036 §3 (prefixArgs)、005 data-model §8 を明記する。
  - 代替案 1 を採る場合は、「固定リテラルを項目 6 に登録する (ADR 根拠 = AD-041 (f))」ことを (f) の分岐として事前に書く。
  - `agent-session.ts:84` のコメントの更新を SH-010 か BE-009 に足す。
- **根拠**: AD-031、AD-036 §8 の調停形式、Constitution Principle VI 項目 6 (`allowlist_source` の追加には ADR を要する)

### [Medium] `composeLaunchEnv` (WSLENV の生成) を `domain/session` に置くと、WSL トランスポート固有の env 規則が session domain に入り、env 方針の locus が 2 層に割れる (M-103) (scope: feature) [new]

- **観察**:
  - plan.md:160-164 と tasks.md:71-72 は、`domain/session/launch-env.ts` に「導出キーに `/u` を付けて `WSLENV` を作る」「base の `WSLENV` を捨てる」を置く。
  - 一方、passthrough の denylist は `infra/runtime/launch-spec.ts` に残る (plan.md:184)。
  - `specs/005-.../data-model.md:171` は §7 の見出しを「起動 env の許可リスト (`infra`)」としている。AD-036 §3 / §8 (`0036:77-80`, `188-193`) は WSL 固有の前置・env・`--cd` を、`infra/runtime` が作る `RuntimeLaunchSpec` から与えるとしている。
  - さらに `src/domain/session/` は `WSL_FREE_DIRECTORIES` (項目 15) の対象である (`scripts/constitution/allowlists.mjs:424`)。項目 15 が機械的に拾うのは `wsl.exe` / wsl-cli だけで、`WSLENV` の語は検出されない。しかし「session のレイヤは WSL の実行面を知らない」という趣旨には反する。
- **同種事象探索**:
  - 現状、`WSLENV` を扱う非テストのコードは infra/runtime (`launch-spec.ts:30`、`wsl-cli.ts:47`) と、denylist を注入で受ける `domain/provider/derive-env.ts:40` だけである。domain/session には 0 件。
  - `src/domain/session/` は `allowlists.mjs:424` で WSL-free 指定されている。
- **リスク/影響**:
  - I-1 (DockerRuntime は `-e`) や X-6 (Win32 直接起動) で env の配送形が変わるたびに、session domain を触ることになる。AD-003 のトランスポート抽象が守る変更の局所性が崩れる。
  - env の規則 (denylist と実名の WSLENV) が 2 つの層に分かれ、どちらが正本か曖昧になる。
- **推奨アクション**: `composeLaunchEnv` を `src/main/infra/runtime/launch-spec.ts` (既に I/O を持たない純粋関数のモジュール) に置き、`buildRuntimeLaunchSpec` がそれを呼ぶ形にする。SC-007 は Electron なしで単体計測できるまま保てる。domain/session に残してよいのは、導出キー名の述語 (`^[A-Z_][A-Z0-9_]*$`) のようにトランスポートに依存しないものだけにする。
- **根拠**: AD-036 §3 / §8、005 data-model §7、AD-003、`allowlists.mjs:421-424` (項目 15 の趣旨)

### [Medium] `isValidModelId` / `isValidEffortLevels` を session domain に置いて provider の write/read 検証から使わせると、provider から session への逆向きの依存になる (M-104) (scope: feature) [new]

- **観察**:
  - plan.md:154-155 と tasks.md:26-27 は、`domain/session/launch-config.ts` にモデル ID と effort の述語を置く。
  - それを `checkProviderPatch` と `provider-record` (`src/main/infra/settings/provider-record.ts`) が使う (plan.md:193、tasks.md:70 BE-008)。
  - しかしモデルカタログは provider domain の概念である。glossary の Model catalog は Domain: `provider` (`docs/glossary.md:333-337`)、provider charter の Scope は「モデルカタログの保持」(`docs/domains/provider/charter.md:32`)。
  - _overview の依存関係は「`provider` は `runtime` に依存する」「`session` は `runtime` と `provider` に依存する」である (`docs/domains/_overview.md:111-114`)。
- **同種事象探索**: 現在、`src/domain/provider` から `@domain/session` への import は 0 件、`src/domain/session` から `@domain/provider` への import も 0 件
- **リスク/影響**:
  - provider から session への最初の依存辺が、カタログ検証という provider 固有の規則で作られてしまう。
  - eslint boundaries / depcruise は domain 間の方向を見ていないので、機械的に検出されない。
  - X-7 (provider domain) が同じ述語を拡張しようとすると、session domain を変更することになる。
- **推奨アクション**: `isValidModelId` / `isValidEffortLevels` と `EffortLevel` を `domain/provider` (例: `model-catalog.ts`) に置き、`domain/session/launch-config.ts` の `isValidLaunchConfig` はそれを import する (session から provider への順方向)。SH-004 / SH-005 のファイル割り当てをこの形に直す。
- **根拠**: _overview の依存関係、glossary の Model catalog、provider charter の Scope、ARCH-4 / ARCH-5

### [Medium] 繰越先 X-6 / X-7 が charter と _overview に反映されない。provider charter は「helper 生成は X-4 に帰属」のまま残る (M-105) (scope: feature) [new]

- **観察**:
  - `docs/domains/provider/charter.md:94-95` は「アプリによる helper スクリプト生成 (RoleSessionName 埋め込み) は X-4 の起動統合に帰属」としている。
  - 本 feature はこれを X-7 へ繰り越す (spec.md:39、docs/roadmap.md:189)。
  - roadmap には X-6 / X-7 の行が足されたが (`docs/roadmap.md:188-189`)、`docs/domains/_overview.md:47-64` の Feature 帰属表には X-6 / X-7 がない。
  - FR-017 と AD-042 は provider のデータモデル (`ModelEntry.supportedEffortLevels` / `awsCredentialExportPath: RuntimePath`) を変えるが、provider charter の Related Specs (`charter.md:117-124`) に 008 がない。
  - SH-014 の対象は session charter と roadmap だけである (tasks.md:163-167)。
- **同種事象探索**: 「X-4 の起動統合に帰属」は provider charter に 1 件 (L94)。_overview で X-6 / X-7 を挙げている箇所は 0 件
- **リスク/影響**:
  - X-4 の完了後、provider charter が「X-4 で済んだはず」と誤読される。Constitution v1.2.3 が戒めた「持ち主のいない延期」と同じ形である。
  - X-7 は provider domain の feature なのに、domain の SSoT に存在しない。
- **推奨アクション**: SH-014 に次の 3 点を足す。
  - provider charter L94 の宛先を X-7 に直す
  - provider charter の Related Specs に 008 (FR-017 / AD-042) を足す
  - _overview の Feature 帰属表に X-6 (`session`) と X-7 (`provider`) の行を足す
- **根拠**: ARCH-2、_overview の Feature 帰属、Constitution v1.2.3 の Amendment trail

### [Medium] (H) `WSL_ALLOWED_ARGS` に `--exec` を「足す」という記述は事実と違う。しかも項目 2 は `launch-spec.ts` を検査しないので、`--exec` 形に機械的な歯止めがない (M-102) (scope: feature) [new]

- **観察**:
  - plan.md:144 / 244 と tasks.md:75 (BE-009) は、`WSL_ALLOWED_ARGS` に `--exec` を足すとしている。
  - しかし `--exec` は既に `scripts/constitution/allowlists.mjs:178` にある。
  - 項目 2 (`scripts/constitution/check.mjs:157-179`) が走査するのは `WSL_CALLER_MODULES` (`allowlists.mjs:186` = `wsl-cli.ts` の 1 ファイル) だけで、起動 argv を組む `src/main/infra/runtime/launch-spec.ts:102` の `'--'` / `'--cd'` / `'-d'` は検査されていない。
  - したがって SC-009 の「argv がシェルを経由しない」は `buildRuntimeLaunchSpec` の単体テストだけが守り、`--` 形への退行を検出する静的 backstop はない。
- **同種事象探索**: `'--exec'` は allowlists.mjs に 1 件 (L178)。`WSL_CALLER_MODULES` の要素は 1 件 (L186)
- **リスク/影響**:
  - plan の「機械強制の変更」節が、実在しない変更を強制の根拠として数えている。
  - 実測 A で `$(...)` の展開が確認された `--` 形への退行が、lint / check:constitution を通ってしまう。
- **推奨アクション**:
  - plan.md:144 / 244 と BE-009 の「足す」を削り、「既存」と書き直す。
  - `--exec` を強制したいなら、`launch-spec.ts` の prefixArgs 末尾が `--exec` であることを pin する単体テストを SC-009 の計測経路に明記する。
  - あるいは項目 2 の走査対象に `launch-spec.ts` を足し、`--` を禁じる (後者は allowlist の変更で ADR 要。AD-041 (f) に含める)。
- **根拠**: Constitution Principle VI 項目 2、AD-027 (効いていないルールを数えない)

### [Low] session charter の KPI「再利用率」の行に、繰越先 O-3 への注記がない (L-101) (scope: feature) [new]

- **観察**: SH-014 は roadmap の O-3 行に義務を登録するが (tasks.md:166)、`docs/domains/session/charter.md:128` の計測経路は「ローカル利用ログ」のまま残る
- **推奨アクション**: SH-014 の session charter 更新に「計測経路は O-3 が作る (X-4 では未計測)」の 1 行を足す

### [Low] 「プリセットの共有・エクスポート/インポート → 将来」だけが feature ID を持たない (L-102) (scope: feature) [new]

- **観察**: spec.md:340。他の繰越先は X-6 / X-7 / I-3 / O-3 と ID で指名されている
- **推奨アクション**: roadmap の既存 ID を指名するか、「持ち主未定。M2 完了後に roadmap へ登録」と明記する

### [Low] AD-041 が 8 つの決定を 1 本に束ねている (L-005) (scope: feature) [unresolved from prev]

- **観察**: plan.md:226-235。(a)(b)(g) は権限ゲート、(e) は資格情報の配送、(f) は WSL 起動形、(d)(h) は帰属の付け替えである。読み替え先は AD-015 / AD-017 / AD-025 / AD-036 / AD-040 / X-1 SC にまたがる
- **推奨アクション**: 分割しない場合は、(a)〜(h) を節見出しにする。各節の冒頭に「読み替える ADR §」を固定の書式で置き、`allowlists.mjs` のコメントや 005 contracts の pointer から節単位で辿れるようにする

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | X-1 側の「最終 env に WSLENV / 資格情報 0」の正本 (`WSLENV` in specs/005, docs/decisions/0036) | 4 | specs/005-session-launch-and-streaming/spec.md:403, specs/005-session-launch-and-streaming/contracts/session-launch.md:91, specs/005-session-launch-and-streaming/data-model.md:180, docs/decisions/0036-single-session-launch-process-and-live-stream.md:170 |
| M-101 | `'--'\]` (src) | 4 | src/main/infra/runtime/launch-spec.ts:102, src/main/infra/runtime/launch-spec.test.ts:68, src/agents/session-core.test.ts:141, src/domain/session/agent-session.ts:84 |
| M-101 | `--` 形を定める決定記述 | 3 | docs/decisions/0015-wsl-access-strategy.md:55, docs/decisions/0036-single-session-launch-process-and-live-stream.md:90, specs/005-session-launch-and-streaming/data-model.md:202 |
| M-102 | `'--exec'` (scripts/constitution) | 1 | scripts/constitution/allowlists.mjs:178 |
| M-103 | `WSL_FREE_DIRECTORIES` の `src/domain/session/` | 1 | scripts/constitution/allowlists.mjs:424 |
| M-104 | `@domain/session` in src/domain/provider | 0 | — |
| M-105 | 「X-4 の起動統合に帰属」 (docs/domains) | 1 | docs/domains/provider/charter.md:94 |

## Verdict

- Critical: 0
- High: 1
- Medium: 5
- Low: 3
- Round inheritance: resolved from 1: 17 / unresolved: 1 (L-005) / new: 8
