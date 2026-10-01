# architecture-reviewer Review: 起動設定ダイアログとプリセット (X-4) — round 3

**Run**: 2026-09-30
**Reviewer**: architecture-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 と SC-001〜SC-010 をすべて読んだ。本トラックが主に照合したのは次のとおり。
  - FR: FR-004 / FR-005 / FR-009 / FR-010 / FR-012 / FR-013 / FR-014 / FR-015 / FR-016 / FR-017
  - SC: SC-005 / SC-007 / SC-009 / SC-010
- touched files に該当する charter / Confirmation:
  - session charter (Scope / 業務ルール / KPI L127-128 / Related Specs L144-151)
  - provider charter (L94)
  - _overview の Feature 帰属 (L47-64) と依存関係 (L111-115)
  - glossary: DerivedLaunchEnv L163-172 / RuntimeLaunchSpec L415-424 / LaunchInput / Preset
  - AD-015 §2 / §5 / §7
  - AD-036 §3 / §4 P1 / §5 / §6 / §8
  - AD-039 調査結果 §3 と Decision 3
  - AD-040 Decision 3 と Consequence L69
  - 005: contracts C-4 / C-5、data-model §7 / §8、SC-006
  - 007: FR-009 / FR-016、contracts C-5 (provider-registration.md:53-57)
  - Constitution: Principle V / VI (項目 2 / 6 / 15)、L834 / L845
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲 (env-passthrough で秘密を転送することの是非そのものは security が見る。本トラックは SSoT drift だけを扱う)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲 (model ID / helperPath の文字種、`--exec` のシェル展開を含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:1 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲。レイヤ配置は D に含めた
- G. optional reviewer 範囲: 該当なし: presets.json のスキーマ互換は database-reviewer の owner (ARCH-6 の除外規定)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

round 3 の bundle は、round 2 の指摘を次のように取り込んでいる。

- AD-041 (b) を X-1 SC-006(a)(b)(c)、005 contracts C-5、data-model §7 まで広げた。
- (f) の読み替え先に AD-015 §2、AD-036 §3、005 data-model §8 を加えた。
- `composeLaunchEnv` を infra/runtime へ移した。
- モデルカタログの述語を domain/provider へ移した。
- 繰越先 (X-6 / X-7 / O-3) を charter / _overview / roadmap に反映するタスクを足した。
- `--exec` を「既存の許可形」と書き直し、pin テストを置いた。

人間の決定は確定扱いとし、蒸し返していない。対象は、forwardKeys から /u で WSLENV を配送すること、`--exec` を SH-000 の結果に従わせること、helper 生成の X-7 への繰越、KPI の O-3 への繰越、X-6 である。

本 round で新たに見たのは次の 2 点である。

- round 2 で追加された「env-passthrough の実配線」(spec.md:294 は [ASSUMED]、USER 決定ではない) が、X-3 の SSoT とどう整合するか
- 移動した述語の置き場と、既存 SSoT の記述 (glossary / コードコメント / 先行 contracts) が追随しているか

## Round 2 status

| ID | status | evidence path:line |
|---|---|---|
| H-101 | unresolved (一部。AD-041 (b) の範囲は直った。005 の SSoT への pointer は C-4 だけで、C-5 / data-model §7 / §8 は残る → M-201) | spec.md:347-350, plan.md:252-257, tasks.md:22 |
| M-101 | resolved | spec.md:354, spec.md:295, plan.md:269-273, plan.md:310-313, tasks.md:90 |
| M-102 | resolved | plan.md:144, plan.md:288-293, tasks.md:183-186 |
| M-103 | resolved (述語の置き場について新たに M-203) | plan.md:193-203, tasks.md:81-89 |
| M-104 | resolved | plan.md:151-153, tasks.md:33-34 |
| M-105 | resolved | tasks.md:198-199 |
| L-101 | resolved | tasks.md:196 |
| L-102 | resolved | spec.md:376 |
| L-005 | resolved | plan.md:277 |

## Findings

### [High] env-passthrough の varNames を WSL へ転送すると X-3 FR-009 / 007 contracts C-5 の決定が覆るが、AD-041 がそれを読み替えていない。FR-016 の「継承し再定義しない」とも矛盾する (H-201) (scope: feature) [new]

- **観察**:
  - FR-013 は env-passthrough を次のように扱う (spec.md:240-248)。
    - varNames を `forwardKeys` に入れる。
    - その値は「アプリ自身の process.env から取り、方式固有キーと同じ扱いで注入する」。
    - 「資格情報系の denylist は passthrough (curated base と extraEnv) にだけ掛ける」。つまり varNames は資格情報 denylist の対象外になる。
  - plan.md:162-164 と tasks.md:83-85 も同じ形である。
  - varNames の実体は、資格情報系の env 名である。
    - 検出は `CREDENTIAL_ENV_NAMES` (`src/main/infra/provider/detector.ts:22` = `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` …) から varNames を作る (`detect.ts:84`)。
    - `validate.test.ts:482` は `varNames: ['ANTHROPIC_API_KEY']` を正当とする。
  - X-3 はこれを逆の形で決めている。
    - `specs/007-.../spec.md:260-265` (FR-009): 「passthrough 許可リストに `WSLENV` と資格情報系パターンを含めてはならない」「(b) の方式固有注入は実名固定集合であり、汎用パターンでの透過を作らない」。
    - `contracts/provider-registration.md:55-57` (C-5): 資格情報パターンを含まない。AWS 変数を WSLENV で届けない。
    - `src/domain/provider/derive-env.ts:85-86`: 「非 denylist 変数は infra が denylist 適用のうえ curatedBase に合流済み」。
    - `docs/glossary.md:165-166` (DerivedLaunchEnv): passthrough に資格情報パターンを含めない。
  - AD-041 の範囲 (spec.md:345-356、plan.md:250-277) が読み替えているのは、005 と AD-015 / AD-036 / AD-040 である。007 FR-009 / 007 C-5 は 0 件。
  - FR-016 (spec.md:269) は「env 導出…の規則は X-3 の FR を継承し、再定義しない」と宣言しており、FR-013 と文面上矛盾する。
  - AD-039 調査結果 §3 の表 (`0039:96`) も env-passthrough を「秘密なし」としている。この実体とは合わない。
- **同種事象探索**:
  - X-3 側で「env-passthrough / 汎用名を資格情報として透過しない」と定めた記述は 5 件ある。
    - `specs/007-provider-registration-and-reachability/spec.md:260`
    - `specs/007-provider-registration-and-reachability/spec.md:264`
    - `specs/007-provider-registration-and-reachability/contracts/provider-registration.md:55`
    - `src/domain/provider/derive-env.ts:86`
    - `docs/glossary.md:166`
  - 008 の spec / plan / tasks が `FR-009` (X-3) か `provider-registration` を AD-041 の読み替え対象に挙げている箇所は 0 件 (Grep `FR-009|provider-registration`。ヒットは 008 自身の FR-009 = プリセットだけ)。
- **リスク/影響**:
  - round 2 の H-101 と同じ種類の問題で、上書き後も先行 feature の SSoT が逆の規則を正本として主張し続ける。
  - X-3 FR-009 を正本として参照する後続 (X-5 / X-7 / security の pr-gate) は、X-4 の配線を違反と読むか、巻き戻す経路になる。
  - env-passthrough の実配線は [ASSUMED] (spec.md:294) である。人間が確定した「forwardKeys から /u で配送する」は配送の仕組みの決定であり、「資格情報名の varNames を資格情報 denylist の対象外にする」までは含んでいない。ADR に記録しないと、この境界が誰の決定なのか辿れない。
- **推奨アクション**:
  - AD-041 (b) か (e) に「X-3 FR-009 (a)(b) の区分を次のように読み替える」ことを明記する。
    - env-passthrough の varNames は (b) 相当の転送キーとして扱う。
    - 資格情報 denylist は curated base と extraEnv にだけ掛ける。
    - `isForbiddenForwardKey` だけを varNames に掛ける。
  - あわせて、007 contracts C-5 (L55 / L57)、glossary の DerivedLaunchEnv L165-166、derive-env.ts:86 のコメントを追随対象として SH-001 / SH-003 / BE-009 に列挙する。
  - AD-039 調査結果 §3 の「秘密なし」は事実誤認である。AD-031 の訂正節か、AD-042 の記録に回す。
  - FR-016 に「FR-013 の env-passthrough は AD-041 で X-3 FR-009 を読み替える例外」と 1 行足し、自己矛盾を解消する。
  - 採否そのもの (資格情報名を転送してよいか) は security トラックと人間の判断に委ねる。本指摘は SSoT の整合だけを求める。
- **根拠**: AD-031 (決定の変更は後続 ADR に置く)、AD-036 §8 の調停形式、007 FR-009 / contracts C-5、spec.md:269 (FR-016)、ARCH-3 / ARCH-5
- **scope 根拠**: AD-041 は本 feature で起票するので、範囲の追記で直せる

### [Medium] AD-041 (b)(f) は 005 C-5 / data-model §7 / §8 を読み替えると宣言したが、そこへ pointer を置くタスクは C-4 だけである (M-201) (scope: feature) [unresolved from prev] (H-101 の残り)

- **観察**:
  - spec.md:347 と plan.md:252 は (b) の対象に「005 contracts C-5 / data-model §7」を挙げ、spec.md:354 と plan.md:271 は (f) の対象に「005 data-model §8」を挙げている。
  - しかし SH-001 (tasks.md:22) は「005 contracts C-4 に AD-041 への pointer を足す」だけである。
  - 005 側の記述は偽のまま残る。
    - `specs/005-.../contracts/session-launch.md:90-92`: WSLENV・資格情報 0 / 完全一致
    - `data-model.md:180-181`: denylist
    - `data-model.md:203`: `env` は §7 の最小 env
  - `src/domain/session/agent-session.ts:86` の doc comment も「§7 の許可リスト (…WSLENV/資格情報 denylist) で組み立てた最小 env」のまま残る。BE-009 が更新するのは :84 だけである (tasks.md:90)。
  - 書き換える X-1 のテストは、plan.md:257 で `launch-spec.test.ts:29` だけが名指しされている。`session-core.test.ts:141` (prefixArgs 末尾 `'--'` の fixture) と `:163-168` (argv の完全一致 assert) は挙がっていない。
- **同種事象探索**: 005 側で AD-041 の読み替え対象になり、pointer が要る記述は 4 件ある。
  - `specs/005-session-launch-and-streaming/contracts/session-launch.md:90`
  - `specs/005-session-launch-and-streaming/data-model.md:180`
  - `specs/005-session-launch-and-streaming/data-model.md:203`
  - `src/domain/session/agent-session.ts:86`
  - このうちタスクで扱われているのは 0 件
- **リスク/影響**: 005 contracts / data-model は「正本」を名乗っており (data-model.md:171、contracts:90「正本は data-model §7」)、読み手は pointer が無い限り X-1 の規則を現行と解釈する。
- **推奨アクション**:
  - SH-001 を「005 contracts C-4 / C-5、data-model §7 / §8 に AD-041 の該当節 ((b) / (e) / (f)) への pointer を足す」に広げる。
  - BE-009 のコメント更新に `agent-session.ts:86` を加える。
  - SH-011 か SH-020 に、書き換える X-1 テスト `session-core.test.ts:141` / `:163-168` を実名で足す。
- **根拠**: AD-031、AD-036 §8、005 contracts C-5 / data-model §7 §8

### [Medium] glossary の DerivedLaunchEnv / RuntimeLaunchSpec が X-4 の決定に反する定義のまま残り、新しい概念 (forwardKeys / 転送禁止キー / curated base) が未登録である (M-202) (scope: feature) [new]

- **観察**:
  - 定義が決定に反したまま残る 2 項目:
    - `docs/glossary.md:165-166` (DerivedLaunchEnv): 「passthrough 許可リストに `WSLENV`・資格情報パターンを含めない」。forwardKeys がない。
    - `docs/glossary.md:418` (RuntimeLaunchSpec): 接頭引数を `['--cd', cwd, '-d', distro, '--']` と定義している。
  - SH-003 (tasks.md:24-27) と FR-015 (spec.md:263-268) の更新対象は、起動軸 / 依存解決 / 越境警告 / SafePermissionMode / Preset / LaunchInput / SessionLaunchConfig だけで、この 2 項目を含まない。
  - `forwardKeys` (転送キー)、「転送禁止キー」、「curated base」は spec / plan の中核語である (spec.md:237-249, 277)。しかし glossary には見出しがない (Grep `curated|forward|転送` で見出し 0 件。本文に DerivedLaunchEnv の「curated base」が 1 回出るだけ)。
- **同種事象探索**: glossary で X-4 後に偽になる定義は 2 件 (`docs/glossary.md:166`、`docs/glossary.md:418`)。新規概念で未登録のものは 3 件 (forwardKeys / 転送禁止キー / curated base)
- **リスク/影響**:
  - Principle XIV の Ubiquitous Language が実装と食い違う。
  - `RuntimeLaunchSpec` の定義を正として `--` 形を書く後続 (X-5 / X-6) が、SH-011 の pin テストとぶつかる。
- **推奨アクション**: SH-003 に次の 3 点を足す。
  - DerivedLaunchEnv に `forwardKeys` と AD-041 (b)(e) の読み替えを追記する
  - RuntimeLaunchSpec の接頭引数を `--exec` 形に改め、Ref に AD-041 (f) を足す
  - 「転送キー (forwardKeys)」「転送禁止キー」を新規見出しで登録する。curated base は X-1 由来の用語なので、DerivedLaunchEnv 内の説明で足りるなら見出しは不要
- **根拠**: Constitution Principle XIV、ARCH-7

### [Medium] 転送禁止キーの述語を domain/provider にリテラルで置くと、X-3 が決めた「denylist は infra の SSoT を注入し、domain に複製しない」と食い違う。env の denylist が 2 系統・2 層に分かれる (M-203) (scope: feature) [new]

- **観察**:
  - plan.md:154-157 と tasks.md:35 は、`domain/provider/forward-env.ts` に `isForbiddenForwardKey` を置く。述語には `WSLENV` / `WSL_UTF8` / `SystemRoot` / `windir` などを実名で持つ。
  - 一方、資格情報系の denylist `LAUNCH_ENV_DENY_PATTERN` は infra/runtime に残る (`src/main/infra/runtime/launch-spec.ts:30`、plan.md:203)。
  - X-3 の `derive-env.ts:8-10` / `:20` は、denylist 述語について次の方針を明文化している。
    - SSoT は X-1 の `LAUNCH_ENV_DENY_PATTERN` で、app が注入する。
    - 文字列パターンを本モジュールに複製しない。
  - `WSLENV` は両方の denylist に入る。
  - `WSLENV` / `WSL_UTF8` / `SystemRoot` は WSL / Windows トランスポートに固有の名前である。domain/provider は項目 15 の `WSL_FREE_DIRECTORIES` の対象外なので、機械的には検出されない (`scripts/constitution/allowlists.mjs:421-438`)。
- **同種事象探索**: env キーの denylist 定義は、現状 1 件 (`src/main/infra/runtime/launch-spec.ts:30`)。X-4 後は `domain/provider/forward-env.ts` が加わって 2 件になる。`WSLENV` を名指す非テストのコードは現状 `launch-spec.ts:30` と `wsl-cli.ts:47` で、domain/provider は 0 件 (コメントの `derive-env.ts:40` を除く)
- **リスク/影響**:
  - どちらの denylist がどのキーを持つかの正本が曖昧になる。I-1 (Docker `-e`) や X-6 (Win32 直接起動) で transport が変わると、domain/provider のリテラルを直すことになり、M-103 で解いた locus の問題が provider 側に移るだけになる。
  - derive-env.ts のヘッダが宣言する方針が偽になる。
- **推奨アクション**:
  - AD-041 (e) に 2 つの denylist の役割分担を明記する。
    - `LAUNCH_ENV_DENY_PATTERN` = passthrough の資格情報 denylist (infra)
    - `isForbiddenForwardKey` = 実行の乗っ取りと transport 制御キーの denylist (domain。3 箇所で共有するため)
  - `derive-env.ts:8-10` のヘッダを追随させる。
  - transport 固有のキー (`WSLENV` / `WSL_UTF8` / `SystemRoot` / `windir`) だけは infra から集合として注入する形にすると、domain のリテラルは transport に依存しないものだけで済む (任意)。
- **根拠**: AD-003 (トランスポート抽象)、AD-036 §8、`derive-env.ts:8-10` (X-3 の決定)、ARCH-4

### [Low] 新規の app モジュール `preset-service.ts` を WSL_FREE_DIRECTORIES に入れるかどうかの判断が書かれていない (L-201) (scope: feature) [new]

- **観察**:
  - `allowlists.mjs:416-419` は、app モジュールを実名で列挙している理由として「新しいファイルが黙って対象外にならないよう、追加時に判断を強制される」を挙げる。
  - X-1 の起動系 app モジュールは列挙済みである (`allowlists.mjs:434-437`)。
  - plan.md:142-146 の規則ファイルの表と SH-010 / SH-011 は、`preset-service.ts` の扱いに触れていない。
- **推奨アクション**: plan の規則ファイルの表に `WSL_FREE_DIRECTORIES` の行を足し、`preset-service.ts` を足す (wsl.exe を名指さないため) か、足さない理由を 1 行書く。

### [Low] 「項目 6 / DISTRO_SCRIPT_CONSTANTS は変更しない」が無条件に書かれていて、R-01 の分岐 (固定リテラルを項目 6 に登録する) と食い違う (L-202) (scope: feature) [new]

- **観察**:
  - 無条件に「変更しない」と書いている箇所: plan.md:53 (Constitution Check VI)、plan.md:146、plan.md:294。
  - 分岐 (SH-000 不成立なら項目 6 に登録する) を書いている箇所: plan.md:310-312、spec.md:295。
- **推奨アクション**: 3 箇所を「SH-000 が成立すれば変更しない。不成立なら AD-041 (f) の分岐に従い登録する」に揃える。Constitution Check VI の判定も「✅ (条件付きで ADR 要)」にする。
- **根拠**: Constitution Principle VI 項目 6 (allowlist の追加には ADR が要る)

### [Low] SH-015 の「PATCH + Amendment trail」は constitution.md:834 と合わず、根拠 ADR も挙がっていない (L-203) (scope: feature) [new]

- **観察**:
  - SH-015 (tasks.md:203) は L845 の宛先の修正を「事実追随 = PATCH。Amendment trail に 1 行」とする。
  - しかし L845 は検証結果の節 (「検査対象なし」表) の中にある。同じ節の `constitution.md:834` は「本節の改定は Principle と Verification のいずれにも触れていないため版を上げていない」としている。
  - 過去の PATCH は根拠 ADR を名指ししている (例: `constitution.md:28`、`:47`)。SH-015 には根拠がない。
- **推奨アクション**: SH-015 で次の 2 点を明記する。
  - 版を上げるかどうか (L834 の先例に倣えば上げない)
  - 根拠 ADR (AD-041 (d) の I-1 付け替え)

### [Low] (H) 変更後の規則を固定するテストが、env-passthrough の資格情報名と X-1 の `'--'` fixture について計画されていない (L-204) (scope: feature) [new]

- **観察**:
  - `derive-env.test.ts:28 / :40 / :119` の env-passthrough のケースは、どれも `varNames: []` である。資格情報名の varNames がどう扱われるかを固定するテストはない。
  - SH-020 (tasks.md:215) にあるのは正例 (varNames が forwardKeys に入る) だけで、H-201 で決める境界 (資格情報 denylist の対象外、`isForbiddenForwardKey` だけを掛ける) の負例・pin がない。
  - `session-core.test.ts:141` / `:163-168` は `'--'` 形の argv を固定している。X-4 後もこれが通ったままだと、SH-011 の pin テストと矛盾する fixture が agents 側に残る。
- **推奨アクション**: SH-020 に次の 2 点を足す。
  - `varNames: ['ANTHROPIC_API_KEY', 'PATH']` を与えると、前者は forwardKeys に入り、後者は拒否される (またはこの規則を AD-041 で決めた形にする)。
  - `session-core.test.ts` の prefixArgs fixture を `--exec` 形に改める。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-201 | X-3 側で env-passthrough / 汎用名を資格情報として透過しないと定めた記述 (`passthrough` in specs/007, derive-env.ts, glossary) | 5 | specs/007-provider-registration-and-reachability/spec.md:260, specs/007-provider-registration-and-reachability/spec.md:264, specs/007-provider-registration-and-reachability/contracts/provider-registration.md:55, src/domain/provider/derive-env.ts:86, docs/glossary.md:166 |
| H-201 | `FR-009\|provider-registration` (008 の AD-041 読み替え範囲) | 0 | — |
| M-201 | 005 の SSoT で pointer が要る記述 (`WSLENV\|§7\|§8` in specs/005 + agent-session.ts) | 4 | specs/005-session-launch-and-streaming/contracts/session-launch.md:90, specs/005-session-launch-and-streaming/data-model.md:180, specs/005-session-launch-and-streaming/data-model.md:203, src/domain/session/agent-session.ts:86 |
| M-202 | glossary で X-4 後に偽になる定義 (`WSLENV\|'--'` in docs/glossary.md) | 2 | docs/glossary.md:166, docs/glossary.md:418 |
| M-203 | env キーの denylist 定義 (`LAUNCH_ENV_DENY_PATTERN =` in src) | 1 | src/main/infra/runtime/launch-spec.ts:30 |
| L-201 | `WSL_FREE_DIRECTORIES` の app モジュール列挙 | 1 | scripts/constitution/allowlists.mjs:421 |
| L-202 | 「項目 6 / DISTRO_SCRIPT_CONSTANTS 変更しない」の無条件記述 | 3 | specs/008-session-launch-settings-dialog-and-presets/plan.md:53, specs/008-session-launch-settings-dialog-and-presets/plan.md:146, specs/008-session-launch-settings-dialog-and-presets/plan.md:294 |
| L-204 | `'--'\]` を含む X-1 テストの prefixArgs fixture (src/agents) | 1 | src/agents/session-core.test.ts:141 |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 4
- Round inheritance: resolved from 2: 8 / unresolved: 1 (H-101 → M-201) / new: 7
