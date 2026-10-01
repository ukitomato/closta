# architecture-reviewer Review: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-09-30
**Reviewer**: architecture-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 と SC-001〜SC-010 のすべてが対象。本トラックの主な照合先は FR-004 / FR-005 / FR-006 / FR-012 / FR-013 / FR-015 / FR-016 と SC-005 / SC-006 / SC-009
- touched files に該当する charter / Confirmation: session charter (Scope・業務ルール・KPI)、provider charter (L35-36 / L93-94)、_overview の Cross-domain invariants (III / V / VI / VII)、AD-036 §4 P1 / §5 / §6 の Confirmation、AD-040 Decision 3/4 と Consequences L69、AD-039 D4、AD-017 Consequences L103、AD-025 §1 L49、AD-016 Consequences L97、AD-005、Constitution Principle VI の Verification 項目 6 と Existing violations の L845
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner 範囲。本トラックでは扱わない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner 範囲 (helper パラメータのシェルメタ文字検証を含む)
- C. 業務不変条件 / Charter drift: Critical:0 High:3 Medium:2 Low:1
- D. Constitution / ADR drift: Critical:1 High:1 Medium:4 Low:4
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner 範囲。レイヤ配置の妥当性は D に含めた
- G. optional reviewer 範囲: 該当なし: presets.json のスキーマ互換は database-reviewer の owner (ARCH-6 の除外規定)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

X-1 の単一セッション起動を 6 軸 (folder / WSL runtime / provider / model / effort / 安全 3 値の permissionMode) の起動設定で動かす拡張。依存解決 (純粋関数)、名前付きプリセット (userData/presets.json)、越境警告 (resolveFolderRuntime を消費)、config-dir の RuntimePath 解決、aws-assume-role helper の userData 生成を含む。ADR は 2 本起票する。AD-041 は AD-036 §5 を安全 3 値へ拡張し、X-1 SC-006(a) を上書きし、AD-017 / AD-025 の作業領域軸を I-1 へ付け替え、helper テンプレートを項目 6 に登録する。AD-042 は AD-005 の型精緻化と AD-039 D4 の失効を記録する。人間の決定そのもの (安全 3 値、I-3 への繰越、helper を userData に置く方針) は尊重し、それが ADR 手続きと機械強制に正しく載っているかを見た。

## Findings

### [Critical] AD-036 §4 P1 の options キー集合に `model` / `effort` を足す決定が、どの ADR の範囲にも入っていない (C-001) (scope: feature)

- **観察**: `specs/008-.../plan.md:119` と `tasks.md:22` (BE-003) で `QUERY_OPTION_KEYS` に `'model'` / `'effort'` を追加する。一方、accepted の `docs/decisions/0036-...md:137-138` (§4 P1) は query() options のキー集合を固定しており、他キーを「一切含めない」としている。同じ固定集合は `specs/005-.../contracts/session-launch.md:57-63` (C-4。`allowlists.mjs:337` が「正本は contracts C-4」と指す) にもある。先例として、`settings` 1 キーを足すだけでも AD-040 が必要だった (`0040-...md:11,50-56`)。ところが AD-041 の決定範囲 (a)〜(f) (`plan.md:140` / `tasks.md:9` / `spec.md:171`) には P1 キー集合の拡張が含まれていない。あわせて、`0040-...md:69` の「`Options.permissionMode: 'default'` リテラル固定のまま」という Consequence も AD-041 で読み替える必要があるが、記載がない
- **同種事象探索**: `QUERY_OPTION_KEYS|'model'` を specs/008 で検索し 2 件 (plan.md:119, tasks.md:22)。P1 の固定集合を述べる正本は 2 件 (0036:137, 005 contracts/session-launch.md:58)。AD-041 の範囲記述は 3 件 (plan.md:140, tasks.md:9, spec.md:171)。どれも model / effort を扱っていない
- **リスク/影響**: accepted ADR の Decision (正の構成 P1) を、後続 ADR なしに実装で書き換えることになる。model / effort は昇格レバーではないが、「P1 の集合を変えるには ADR が要る」は X-1 が design-gate を 3 ラウンドかけて確立した規範である (`0036:130-135`)。加えて C-4 の正本が古いまま残り、`allowlists.mjs` の参照先が事実と合わなくなる
- **推奨アクション**: AD-041 に (g) を追加する。内容は「P1 allowlist に `model` / `effort` を足す。どちらも escalation-neutral である根拠 (sdk.d.ts の Options.model:1818 / effort:1769 の意味) を書き、permissionMode の値域を `{default, plan, dontAsk}` にする」。AD-040:69 の読み替えも明記する。C-4 の正本を AD-041 に移す (または 005 contracts C-4 に AD-041 への pointer を置く) ことを SH-001 / SH-014 に入れる
- **根拠**: AD-036 §4 P1 / AD-040 Decision 3 / Constitution Principle III / AD-031 (決定の変更は後続 ADR)
- **scope 根拠**: AD-041 は本 feature で起票するため、範囲の追記で直せる

### [High] 導出 env (`CLAUDE_CONFIG_DIR` / `ANTHROPIC_API_KEY` / `AWS_PROFILE` 等) を `RuntimeLaunchSpec.env` に合流させても、WSL 内の claude まで届く経路が設計にない (H-001) (scope: feature)

- **観察**: `spec.md:111` (FR-005)、`plan.md:128`、`tasks.md:25` (BE-006) は deriveEnv の env を `RuntimeLaunchSpec.env` に合流させる設計である。しかしその env は Windows 側の wsl.exe プロセスの環境にしかならない (`src/agents/sdk-agent-session.ts:281` の `spawn(plan.command, ..., { env: plan.env })`、`src/main/infra/runtime/launch-spec.ts:101-109`)。Windows→WSL で環境変数を渡す手段は WSLENV であり (`launch-spec.ts:27-30`、`0036:170-172`、`0015:91`)、AD-036 §6 はその WSLENV を denylist に入れている。X-3 の research (`specs/007-.../research.md:25-27`) は「Options.env が WSL 越し claude の環境を置換する」ことを前提にしていたが、AD-036 §3 (`0036:84-87`) により custom spawn は SDK の env を使わない。この矛盾が X-4 に引き継がれている
- **同種事象探索**: WSL 側へ env を届ける必要があるのは、`derive-env.ts:56,60,73-75,82` の 4 方式 (api-key / oauth-token / aws-profile / config-dir) と extraEnv。既存の env 利用者である列挙と transcript は Windows 側で完結しており、WSL 内で env を読む先例は 0 件
- **リスク/影響**: SC-006 (config-dir の CLAUDE_CONFIG_DIR 注入) と US-4 AC-1 は、単体テストでは通るが実機では成り立たない可能性が高い。CLAUDE_CONFIG_DIR が届かなければ、WSL 内 claude はランタイム既定の config dir を黙って使う。これは X-3 が fail-closed で塞いだはずの「別資格情報名前空間を黙って掴む」経路そのものである (`provider-service.ts:262-264`)。直すには WSLENV を開ける (AD-036 §6 の変更になり ADR が要る) か、argv で `env K=V` を前置する (prefixArgs の形と WSL_ALLOWED_ARGS 項目 2 の変更になり、秘密が argv に出る) かのどちらかで、いずれも accepted ADR に触れる
- **推奨アクション**: plan に「WSL への env の届け方」を 1 節設ける。先に SPIKE (quickstart) で「spec.env に置いた変数が WSL 内 claude から見えないこと」を確かめ、採る経路 (例: 非秘密キーだけを WSLENV で渡す、秘密は helper に寄せる) を AD-041 か別 ADR に記録する。SC-006 / SC-009 の計測経路には、WSL 内から見た env の実機観測を足す
- **根拠**: AD-036 §3 / §6、AD-015 §5、Principle V、_overview の cross-domain invariant V (provider / session)
- **scope 根拠**: FR-005 / FR-012 の設計そのものであり本 feature で扱う (platform-boundary と重複しうる)

### [High] helper テンプレートを `DISTRO_SCRIPT_CONSTANTS` に足すと、項目 6 の 3 点検査が構造的に成り立たない。Constitution Principle VI の Verification 文言とも衝突する (H-002) (scope: feature)

- **観察**: `plan.md:124,146` と `tasks.md:67` (SH-011) は、パラメータを埋めた helper を項目 6 に登録するとしている。項目 6 の中身は次のとおり。(ii) 標準入力に書く式が定数の識別子そのものであること。このとき全 writer を全 entry と突き合わせるため、entry が 2 件になると PROBE_SCRIPT の writer が helper entry に対して違反になる (`scripts/constitution/check.mjs:304-320`)。そもそも helper は stdin ではなくファイルに書かれ Claude Code が実行するので、sink の形が違う。(i) 定数は単一リテラルであること (`check.mjs:282-291`)。(iii) 禁止形に `>` がある (`allowlists.mjs:485`)。さらに Constitution の文言は「ディストロ内で実行するスクリプトが**定義済みの内容と一致**すること」(`constitution.md:461`) であり、パラメータ置換後の内容は定義済みの内容と一致しない。SH-011 は「パラメータ置換部の扱いを 3 点検査に合わせる」とだけ書いており、sink の違いと文言の衝突は扱っていない
- **同種事象探索**: `DISTRO_SCRIPT_CONSTANTS` の参照は 2 件 (allowlists.mjs:465, check.mjs:265)。stdin に書く既存 writer は PROBE_SCRIPT の 1 系統のみ
- **リスク/影響**: 許可リストに行を足すだけでは項目 6 が violation になる。逆に通るように検査を緩めれば、NON-NEGOTIABLE Principle VI の検証条件を ADR だけで実質変えることになる。Principle VI 自体の判断については、userData (アプリ自身のデータ域) にアプリが書き、ディストロ内に何も残さない構成であれば「永続環境を構築しない」の趣旨には反しないと読める (`constitution.md:440-442`、`allowlists.mjs:457-460`)。ただしそれを示す機械検証の形が設計されていない
- **推奨アクション**: 項目 6 を「定数テンプレート + 検証済みパラメータ (型付き置換点のみ) + file sink」の変種として別 entry type で設計する。AD-041 には、置換点の文法と sink (userData 限定) を決定として書く。Constitution の Verification 表の項目 6 の文言には PATCH 改定か注記が要るので、その判断を plan の Constitution Check VI 行に書く。違反 fixture (置換点以外の差分、`>` の混入) を test:rules に足す
- **根拠**: Constitution Principle VI Verification 項目 6、改定手順 (NON-NEGOTIABLE の検証変更)、AD-024 #3/#4
- **scope 根拠**: SH-011 / AD-041 (e) の設計範囲

### [High] aws-assume-role の helper 生成に必要なパラメータ (role ARN / region / source profile) が Provider のデータモデルにない。provider domain の登録面を触るタスクもない (H-003) (scope: feature)

- **観察**: `tasks.md:60` (BE-031) は role ARN / region / profile を埋めた helper を生成するとしている。しかし `src/domain/provider/types.ts:55-56` の aws-assume-role の `CredentialRef` が持つのは `helperPath` だけで、`dto.ts:33` も同じである。これらのパラメータを provider-record / validate / 登録 UI に足すタスクはない。AD-042 の範囲も X-3 の型精緻化と supportedEffortLevels だけである (`plan.md:141`)。spec の Out of Scope は「Provider の登録・認証方式の管理 → provider domain (X-3)」としている (`spec.md:178`)。さらに R-01 のフォールバック (`plan.md:153`) では、ユーザが渡す helperPath と生成 helper が同じ source に並存し、意味が二重になる
- **同種事象探索**: `roleArn|helperPath` を src/domain/provider で検索し 4 件 (types.ts:49,54,56 / dto.ts:31-33)。roleArn は 0 件
- **リスク/影響**: BE-031 がパラメータの出所を持たないため実装できない。実装で辻褄を合わせようとすると、session feature が provider の登録スキーマ (永続形) を変えることになり、charter の境界 (session の Out of scope「Provider の登録と認証方式の管理」、`docs/domains/session/charter.md:48`) を越える
- **推奨アクション**: 次の 3 つから選び spec に明記する。(1) aws-assume-role の CredentialRef に非秘密メタ (roleArn / region / sourceProfile) を足す provider 側変更を、明示的に X-4 の範囲とする。provider charter の追随と AD-042 への記録を伴い、database-reviewer の DB-2 対象にもなる。(2) helper 生成を後続の provider feature へ繰り越し、X-4 は X-3 の helperPath 方式に留める。(3) helperPath と生成の関係 (上書きか別 source か) を data model で決める
- **根拠**: session charter の Out of scope、provider charter L93-94、AD-005、ARCH-2
- **scope 根拠**: 本 feature の BE-031 / BE-032 の前提

### [High] FR-006「無効値のまま起動できてはならない」を強制する箇所が renderer と preset apply だけで、main の起動ゲートにない (H-004) (scope: feature)

- **観察**: 依存解決は FE-001 (renderer) と BE-012 (preset-service apply) で呼ばれる (`tasks.md:30,42`)。main 側の `checkLaunchConfig` は「6 軸の形 + 安全 3 値 + 制御文字」だけを見る (`tasks.md:24`、`plan.md:127`)。起動時の `prepareLaunch(config)` (`plan.md:128`) で model がカタログにあるか、effort が対応値かを検証する記述はない (Provider の到達可能性は deriveEnv が `provider-service.ts:254` で強制している)
- **同種事象探索**: `resolveLaunchAxes` の呼び出し予定は 3 件 (plan.md:113,134 / tasks.md:20,30,42)。起動経路 (prepareLaunch / session-launch-service) での呼び出しは 0 件
- **リスク/影響**: charter の業務ルール (`charter.md:113`) と FR-006 の fail-safe が UI 層の善意に依存する。renderer がダイアログを開いた後に Provider を編集するとカタログが変わるので、それと起動との間の競合で、カタログ外のモデルや非対応 effort がそのまま起動に届く (R-02 がその失敗を認めている)
- **推奨アクション**: `prepareLaunch` で main 側の facts (listReachable / カタログ) を使い `resolveLaunchAxes` を再評価する。resets が空でなければ理由キーで拒否するか、既定値で起動して通知する。これを SC-002 の計測経路に「main 起動ゲートの単体」として足す
- **根拠**: session charter の業務ルール、FR-006、SC-002、ARCH-5
- **scope 根拠**: BE-006 の範囲

### [Medium] `resolveConfigDirRuntimePath` を「resolveCwd と同じ prefix-match」で作ると、HostPath→RuntimePath 変換の 3 つ目の実装になる (M-001) (scope: feature)

- **観察**: `tasks.md:59` (BE-030) と `plan.md:21,128`。既存の変換は 2 つある。`composition-root.ts:381-387` の `resolveCwd` は findLongestMatch / applyEntry を使い素の string を返す。`src/domain/workspace/resolution.ts:167` は `runtimePathOps.fromHost` を使い branded な値を返す。ところが deps の型は `RuntimePath | null` を要求している (`provider-service.ts:43-46`)。plan の Constitution Check I 行は「branded のまま渡す」と書いており、string を返す resolveCwd を手本にする記述と食い違う。同一 distro の UNC→RuntimePath 変換も、既存のパス API (parseWslUncPath 系) を使うとは書かれていない
- **同種事象探索**: host→runtime 変換の実装は 2 件 (composition-root.ts:381, resolution.ts:167)。本 plan が 3 件目を足す
- **リスク/影響**: 変換規則が二重、三重に定義され食い違う (AD-025 Alternatives「判定ロジックを複製する — 必ず食い違う」)。Principle I の「domain のパス API 経由」から外れる
- **推奨アクション**: `runtimePathOps.fromHost` と、既存の UNC 解析 API → makeRuntimePath を合成して使うと plan に明記する。できれば resolveCwd も同じ関数に寄せ、変換をまとめる
- **根拠**: Principle I、AD-025 §3、AD-036 §3 の訂正 (単一 locus)

### [Medium] glossary の `LaunchInput` 定義が X-4 の変更後に偽になるが、SH-003 はこれを直す対象に含めていない (M-002) (scope: feature)

- **観察**: `docs/glossary.md:289-295` は `permissionMode: 'default'` (リテラル固定) とし、「モデル・effort は含まない (X-4)」「6 値ユニオンにしない」と書いている。BE-002 (`tasks.md:21`) は LaunchInput に model / effort / SafePermissionMode を足す。SH-003 (`tasks.md:11`) の対象は、起動軸 / 依存解決 / 越境警告の追記と SessionLaunchConfig の注記だけである。既存用語は `Cross-boundary (越境)` (`glossary.md:95-102`) で、「越境警告」はそこから派生する語として登録する必要がある
- **同種事象探索**: `permissionMode: 'default'` を glossary で検索し 1 件 (289-295)
- **推奨アクション**: SH-003 に LaunchInput の更新 (safe 3 値、model / effort、Counterexample に「昇格 3 値を型で持てない」) と `SafePermissionMode` / `Preset` の Ref (AD-041) を足す
- **根拠**: Principle XIV

### [Medium] Constitution L845「項目 5 は X-4 で対象が生じる」を訂正する持ち主がいない (M-003) (scope: out-of-scope)

- **観察**: `constitution.md:845`。plan の申し送り #25 (`plan.md:96`) は「AD-041 に提案を含める (constitution 改定は別手続)」としているが、その手続きのタスクも持ち主もない
- **同種事象探索**: Constitution 内の `X-4` は 1 件 (845)
- **リスク/影響**: X-4 の完了後、Existing violations 表の pending の理由が偽になる。v1.2.3 の「延期先を空にしない」と同じ種類の問題である
- **推奨アクション**: Verification の事実追随 (PATCH) として I-1 宛てに直すタスクを SH-014 に足すか、roadmap に持ち主を登録する
- **根拠**: Constitution バージョニング方針 (事実追随 = PATCH)、v1.2.3 の Amendment trail

### [Medium] `nextFeature` と Out of Scope の繰越先を「後続」とだけ書いており、feature ID を指名していない (M-004) (scope: feature)

- **観察**: `tasks.md:68` (SH-012) と `plan.md:88-90` は、UNDETECTED_NOTES の `nextFeature` を「後続」へ付け替えるとしている。しかし `tests/rule-fixtures/expected.mjs:357-359` は「nextFeature は必須。塞ぐ feature を指名しておけば必ず再訪される」と定めている。spec の Out of Scope (`spec.md:183-187`: capability 承認の永続化、Win32 直接起動、退避 UI、fork/resume) と AD-041 (f) も「後続」だけで、ID がない
- **同種事象探索**: `nextFeature: 'X-4'` は 3 件 (expected.mjs:375,398,420)
- **推奨アクション**: roadmap の既存 ID (O-x / I-x など) を指名するか、roadmap に新しい行を起こしてその ID を書く
- **根拠**: expected.mjs の SC-017 規範、Constitution v1.2.3

### [Medium] charter KPI「再利用率」の計測経路 (ローカル利用ログ) を担うタスクがない (M-005) (scope: feature)

- **観察**: `docs/domains/session/charter.md:128` の計測経路は「ローカル利用ログ」である。spec の US-2 (`spec.md:53`) は KPI 再利用率を対象に挙げるが、SC にもタスクにも「プリセット経由の起動か手選択か」を記録する観測点がない
- **推奨アクション**: 起動イベントに `origin: preset|manual` を残すタスクを置くか (Principle V に反しない形で)、KPI の計測を明示的に後続へ繰り越し、繰越先 ID を書く
- **根拠**: ARCH-2 (KPI 計測経路の欠落)

### [Medium] 起動の組み立て (deriveEnv 合流、helper 生成、config-dir 変換) を composition-root のクロージャに積むと、SC-009 の単体計測が難しくなる (M-006) (scope: feature)

- **観察**: `plan.md:128` と `tasks.md:25,59,61` は、`prepareLaunch` (`composition-root.ts:221-259`) に env 合流と helper 生成 (I/O)、`resolveConfigDirRuntimePath` を追加する。`.dependency-cruiser.js:229-231` によると composition-root は「I/O を解決して渡す」結線層である。一方 SC-009 は「最終 env に WSLENV や資格情報パターンの passthrough が 0」であることを単体で確かめる計測経路を要求している
- **推奨アクション**: env 合流を domain の純粋関数 (例: `mergeLaunchEnv(curated, derived) → env`) に切り出し、helper 生成の呼び出しを session-launch-service の注入点にする。SC-009 の単体は Electron を立てずに書けるようにする
- **根拠**: AD-023 §5/§7、AD-025 §9、services-not-to-io のコメント

### [Medium] (H) P1 allowlist のテストが自己参照になっており、C-001 のようなキー追加を検出できない (M-007) (scope: feature)

- **観察**: `src/agents/session-core.test.ts:27-29` は、options のキーが `QUERY_OPTION_KEYS` に含まれることを assert しているだけである。定数そのものにキーを足せばテストは自動的に通る。BE-003 はこのテストを「更新」するとしている (`tasks.md:22`)
- **推奨アクション**: ADR が承認したキー集合をリテラルで固定する pin テストを足す (`expect([...QUERY_OPTION_KEYS].sort()).toEqual([...AD-041 の集合])`)。こうすれば集合を変えるたびにテストの差分として ADR 参照が現れる

### [Medium] (H) SC-006 / SC-009 の計測経路は deriveEnv の単体止まりで、H-001 (WSL で env が落ちる) を検出できない (M-008) (scope: feature)

- **観察**: `spec.md:160,163` はどちらも単体テストだけである。SH-023 (`tasks.md:74`) は「config-dir Provider で起動」とあるだけで、WSL 内から見た `CLAUDE_CONFIG_DIR` の値を観測する手順がない
- **推奨アクション**: quickstart に「起動したセッションの transcript が、選択した config dir 配下に書かれること」の確認を足す (観測点は既存の R-2 列挙で足りる)

### [Low] session charter の Scope「ランタイム → Provider → モデル → 権限モード」と、X-4 が権限モードを独立軸にしていることの差を charter に記録していない (L-001) (scope: feature)

- **観察**: charter の Scope と業務ルールは `charter.md:36-37,110`。spec の Key Entities (`spec.md:140`) は権限モードを独立軸とし、capability 連動を I-3 に回している。安全 3 値は AD-020 §3 により capability の制約対象外なので Principle III には反しない。ただし FR-015 による charter の追随は Related Specs だけである
- **推奨アクション**: SH-014 で、charter の業務ルールに「X-4 時点では安全 3 値のみ提示し、capability 連動 (昇格モード) は I-3」と追記する

### [Low] roadmap の X-4 行が作業領域戦略 AD-017 を挙げたままで、SH-014 は「6 値」だけを直す (L-002) (scope: feature)

- **観察**: `docs/roadmap.md:181`。`tasks.md:70` の SH-014 はこの行の AD-017 に触れていない
- **推奨アクション**: X-4 行から AD-017 を外し、I-1 行に移す (AD-041 (d) と揃える)

### [Low] `EffortLevel` / `SafePermissionMode` を domain で手書きするが、SDK 型との一致を検査する手段がない (L-003) (scope: feature)

- **観察**: `plan.md:115` は「domain に複製せず型だけ SDK 準拠で定義」と書いているが、実際には手書きの複製になる。domain は SDK を import できない
- **推奨アクション**: agents 側に、型レベルの一致・包含の assert (`EffortLevel` の相互代入、`SafePermissionMode extends PermissionMode`) を 1 つ置く。SDK を更新したとき tsc で検出できる (AD-020 Consequences「バージョンが上がれば型は増減する」)

### [Low] 「'default' 固定」と書いた既存コメントと違反メッセージが古くなる (L-004) (scope: feature)

- **観察**: `allowlists.mjs:378-381`、`check.mjs:809` の違反メッセージ、`session-core.ts:77`。plan は `PERMISSION_MODE_ESCALATION_VALUES` を「変更しない」とするが (`plan.md:105`)、説明文は変わる
- **推奨アクション**: SH-010 で、文言を「安全 3 値。AD-041」に直す

### [Low] AD-041 が性質の違う決定を 1 本に束ねている。helper ファイルの寿命も書かれていない (L-005) (scope: feature)

- **観察**: `plan.md:140`。権限ゲート (III)、Principle VI の許可リスト追加、feature 帰属の付け替え、繰越先の変更が同じ ADR に入っている。helper は Provider ごとに上書きされるが (`plan.md:156`)、削除経路がない
- **推奨アクション**: 少なくとも (e) (Principle VI の許可リスト) は、`allowlists.mjs` のコメントから辿れる節見出しにする。userData の helper の寿命 (Provider を削除したら消す) を決定に含める

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `QUERY_OPTION_KEYS\|'model'` (specs/008) | 2 | plan.md:119, tasks.md:22 |
| C-001 | P1 固定集合の正本 | 2 | docs/decisions/0036-...md:137, specs/005-.../contracts/session-launch.md:58 |
| C-001 | AD-041 範囲記述 (model/effort を含むもの) | 0 / 3 | plan.md:140, tasks.md:9, spec.md:171 |
| H-001 | WSL 内で env を読む先例 / 導出 env キー | 0 / 4 | src/domain/provider/derive-env.ts:56,60,73-75,82 |
| H-002 | `DISTRO_SCRIPT_CONSTANTS` | 2 | scripts/constitution/allowlists.mjs:465, check.mjs:265 |
| H-003 | `roleArn` (src/domain/provider) | 0 | — |
| H-004 | 起動経路での `resolveLaunchAxes` | 0 | — |
| M-001 | host→runtime 変換の実装 | 2 | src/main/app/composition-root.ts:381, src/domain/workspace/resolution.ts:167 |
| M-004 | `nextFeature: 'X-4'` | 3 | tests/rule-fixtures/expected.mjs:375,398,420 |

## Verdict

- Critical: 1
- High: 4
- Medium: 8
- Low: 5
