# Design Gate: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-09-30
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 3    | 10     | 4   |
| po-reviewer                | 0        | 4    | 8      | 3   |
| architecture-reviewer      | 1        | 4    | 8      | 5   |
| security-reviewer          | 0        | 4    | 6      | 5   |
| platform-boundary-reviewer | 0 (1 → cascade 降格) | 3 | 6 | 4 |
| **Total (dedup)**          | **1**    | 11   | 26     | 15  |

**Status**: FIX_REQUIRED
**Next**: Critical を解消し、High の設計判断 (H-01 / H-03 / H-04) を plan / ADR に反映してから `/cl-design --spec-dir specs/008-session-launch-settings-dialog-and-presets --from gate`

## Critical (Total: 1)

### C-001 — AD-036 §4 P1 の query() options キー集合に `model` / `effort` を足す決定が、どの ADR の範囲にも入っていない [origin: architecture C-001, analyze A1] [new]

- **Where**: plan.md:119, plan.md:140, tasks.md:9 (SH-001), tasks.md:22 (BE-003), spec.md:171 / 正本 docs/decisions/0036:137-138, specs/005-.../contracts/session-launch.md:57-63 (C-4), 0040:69
- **Issue**: P1 はキー集合を固定し「他キーを一切含めない」と決めている。`settings` 1 キーの追加にも AD-040 が必要だった。AD-041 の範囲 (a)-(f) は model / effort と permissionMode 値域の P1 変更を含まず、AD-040:69「permissionMode 'default' 固定」の読み替えも無い
- **Why critical**: accepted ADR の Decision を後続 ADR なしに実装で書き換えることになる (AD-031)
- **Action**: AD-041 に (g) を追加する (P1 に model / effort を追加、escalation-neutral の根拠、permissionMode 値域 = 安全 3 値、AD-040:69 の読み替え)。C-4 の正本に AD-041 への pointer を置く (SH-001 / SH-014)。自己参照テストを pin テストに替える (arch M-007)

## High (Total: 11)

### H-01 — 導出 env が wsl.exe を越えて WSL 内の claude に届かない [origin: platform-boundary C-001 (cascade 降格), architecture H-001, security H-001, analyze A2]
- **Where**: spec.md:87,111,127,160,163 (FR-005 / FR-012 / SC-006 / SC-009), plan.md:128, tasks.md:25 (BE-006) / launch-spec.ts:30,102, sdk-agent-session.ts:281, derive-env.ts:47-82
- **Issue**: env は wsl.exe の Windows 側 env になるだけで、`WSLENV` が無いと distro に渡らない。`WSLENV` は AD-036 §6 の denylist で落とされる。さらに `LAUNCH_ENV_DENY_PATTERN` は curated キー (ANTHROPIC_API_KEY / *_TOKEN / AWS_*) にも一致する。**platform-boundary がこのマシンで実測済み** (WSLENV なし → `unset`、`WSLENV=X/u` → `reached`)。このままだと config-dir / api-key / oauth / aws-profile / extraEnv がすべて黙って no-op になり、distro 既定の資格情報で起動する
- **Action**: AD-041 (または別 ADR) で transport を決める。候補: infra が curated キー名だけで `WSLENV` を生成し (`/u` のみで `/p`・`/l` は使わない)、denylist は「親 env から継承した WSLENV」に限定する。秘密は helper に寄せる案 (sec H-001 ii) も比較する。argv に `env K=V` は置かない (CWE-214)。SC-006 / SC-009 には、distro 内の値を観測する統合・実機 leg を足す (arch M-008, PB M-006)。fork env は curated base のまま固定する (sec M-003)

### H-02 — FR-006 の fail-safe を main の起動ゲートが強制していない [origin: architecture H-004, security M-002, analyze A3]
- **Where**: plan.md:127,128,134, tasks.md:24,25,30,42
- **Action**: `prepareLaunch(config)` で main の facts を使って `resolveLaunchAxes` を再評価する。reset があれば、理由キーで拒否するか既定値で起動して通知するかを決めて明記する。SC-002 の計測に main ゲートの単体を足す

### H-03 — aws-assume-role の helper パラメータ (roleArn / region / profile) が Provider のデータモデルに無い [origin: architecture H-003, security H-003(1), platform-boundary M-005]
- **Where**: tasks.md:60 (BE-031), types.ts:55-56, dto.ts:33, validate.ts:296-297, spec.md:178
- **Action**: 次の 3 つから選ぶ。(1) CredentialRef に非秘密メタを足す provider 側の変更を X-4 の範囲に明記する (charter 追随、AD-042 記録、IPC / record で write-read 対称の allowlist)。(2) helper 生成を後続の provider feature へ繰り越し、X-4 は X-3 の helperPath 方式に留める。(3) helperPath と生成の関係を data model で定める

### H-04 — helper を項目 6 に登録する設計が、3 点検査と Principle VI の Verification 文言に構造的に合わない [origin: architecture H-002, platform-boundary H-002, security H-003(2)(3)]
- **Where**: plan.md:124,146, tasks.md:67 (SH-011), check.mjs:282-320, allowlists.mjs:474-485, constitution.md:461
- **Action**: helper 本体は置換なしの固定リテラルにする。パラメータは `settings.awsCredentialExport` の argv (引用し、eval しない) で渡す。項目 6 には file sink 用の (ii') を追加する。SH-011 の「置換部の扱いを合わせる」を削る。Claude Code が awsCredentialExport をシェル経由で実行するかは実機で確認する

### H-05 — userData 上の helper の完全性 (symlink / TOCTOU / 上書き競合 / 寿命) が設計されていない [origin: security H-004, platform-boundary M-004, architecture L-005]
- **Where**: plan.md:124,153,156 (R-01 / R-04), tasks.md:32,60
- **Action**: `userData/helpers/` に一意 temp → rename で書く。ファイル名の id を `^[0-9a-f]{32}$` で照合する。起動は `/bin/sh '<RuntimePath>'` で行う。Provider 削除時に helper を消す。同じユーザーの WSL プロセスによる改竄は残存リスクとして AD-041 に記録する。X-5 の義務を記録する (H-04 の固定ファイル + argv 案を採れば大半は解消する)

### H-06 — `wsl.exe ... --` の後ろはシェルに解釈されるのに、model ID の検証が制御文字の拒否だけ [origin: security H-002]
- **Where**: launch-spec.ts:102, session-core.ts:181, validate.ts:277, plan.md:127
- **Action**: model ID / inferenceProfileId に文字種の allowlist 述語を作り、validate / provider-record / checkLaunchConfig の 3 箇所で共有する。effort は enum 照合にする。`--exec` 化するか、「`--` 以降はメタ文字なし」を assert するかを AD-041 で決める (PB と共同)

### H-07 — helper パスが namespace を失っており、変換に失敗するとユーザー指定パスへ fail-open する [origin: platform-boundary H-001]
- **Where**: types.ts:121, derive-env.ts:70, reachability.ts:29, tasks.md:61 (BE-032)
- **Action**: `awsCredentialExportPath: RuntimePath` にし、`??` fallback を撤去して fail-closed にする。ユーザー指定の helperPath は WSL runtime 上で分類・変換する

### H-08 — charter KPI「再利用率」に SC も計測経路も無い [origin: po H-001, architecture M-005]
- **Action**: 起動イベントに `origin: preset|manual` を記録する SC とタスクを置く。または計測を明示的に繰り越し、繰越先の ID を書く

### H-09 — folder / runtime 軸の「既定」が意味を持たない。削除済み・停止中の軸での起動を止める規定が無い [origin: po H-002, analyze A9, security L-004]
- **Action**: folder / runtime は既定値を持たない (必須) と定める。preset apply で消えた軸は起動不可として通知する。既定を表す sentinel は `'default'` 文字列ではなく null などにする

### H-10 — provider が「既定」に戻ったときの env 経路が未定義で、誤った資格情報で黙って起動しうる [origin: po H-003, analyze A9]
- **Action**: provider = 既定の意味 (X-1 の curated base のみ) を FR に明記する。reset で既定に落ちた場合は起動前に確認させる

### H-11 — R-01 のフォールバック (helper の /mnt/c 実行不成立時) が spec に無い。SC-007 に実機観測が無い [origin: po H-004, analyze A12]
- **Action**: spec の Assumptions / Out of Scope に、R-01 不成立時の繰越を条件付きで書く。SC-007 の計測経路に quickstart の実機観測を足す (stdout は記録しない。sec L-002)

## Medium (Total: 26)

| ID | 概要 | origin |
|---|---|---|
| M-01 | main→agents の launch メッセージと decoder を新フィールドに拡張し、再検証・未知キーの破棄・settings の backslash 検査を行う | sec M-001, PB M-002, analyze A4 |
| M-02 | fork env に curated 資格情報を入れない (spec.env にだけ合流させる) | sec M-003 |
| M-03 | plan モードの ExitPlanMode 遷移先を Confirmation で確認する | sec M-004 |
| M-04 | preset の読み取り側の検証を checkLaunchConfig と同じ述語で行う (supportedEffortLevels の enum・重複・上限も) | sec M-005, PB L-003 |
| M-05 | SH-020 に負例を列挙する (メタ文字 / decoder / main 再解決 / fork env / preset 昇格拒否 / helper traversal) | sec M-006 |
| M-06 | QUERY_OPTION_KEYS の pin テスト | arch M-007 |
| M-07 | SC-006 / 007 / 009 に distro 内観測 leg を足す | arch M-008, PB M-006 |
| M-08 | SC-008 (越境警告) の UI テスト | po, analyze A7 |
| M-09 | resolveConfigDirRuntimePath を `runtimePathOps.fromHost` / `fromUnc` + isSameDistro で作る (3 つ目の変換実装を作らない) | arch M-001, PB M-001 |
| M-10 | glossary の LaunchInput / SafePermissionMode / Preset / 越境警告 (Cross-boundary の派生語) | arch M-002, analyze A13 |
| M-11 | Constitution L845 (項目 5 は X-4) の PATCH 追随の持ち主を決める | arch M-003 |
| M-12 | nextFeature / Out of Scope の繰越先に具体的な feature ID を書く | arch M-004, PB L-001, po (limit / session name の宛先) |
| M-13 | env 合流を純粋関数に切り出し、helper 生成を service 注入点にする (SC-009 を単体で測れるように) | arch M-006 |
| M-14 | 項目 16 の `permissionMode:` backstop について、型位置を除外し shorthand を検出する | PB M-003 |
| M-15 | principle-v-unknown-shape-secret を付け替える理由の矛盾 (preset 名・モデル手入力・role params) | PB M-005, sec L-001 |
| M-16 | タスク ID の衝突 (X-3 の FE-010 / BE-013 / BE-020) | po M-001, analyze A5 |
| M-17 | SH-002 (AD-042) を BE-031 / 032 の前提に置く | analyze A6 |
| M-18 | resolveFolderRuntime のシグネチャを IPC DTO に合わせる | analyze A8 |
| M-19 | supportedEffortLevels が無いときに提示する effort の既定 | analyze A10 |
| M-20 | folder↔runtime の distro 不一致を依存グラフに入れる | analyze A11 |
| M-21 | Constitution Check に VIII / XIII を追加する | analyze A14 |
| M-22 | dontAsk の AC (承認カードが出ず拒否されることの観測) | po |
| M-23 | 起動失敗時の出口と理由キー (LaunchFailureReason の拡張、値を message に含めない) | po, sec L-005 |
| M-24 | 空状態と preset 名の検証 (isValidDisplayName) | po, sec L-001 |
| M-25 | カタログ切替の E2E | po |
| M-26 | renderer の単体テスト (ダイアログ / PresetPanel) | po |

## Low (Total: 15)

sec L-002 (quickstart で stdout を記録しない) / sec L-003 (新 IPC は `handle()` 経由、remove は既知 id と完全一致) / arch L-001 (charter 業務ルールに安全 3 値のみと追記) / arch L-002 (roadmap X-4 行の AD-017 を I-1 へ) / arch L-003 (EffortLevel / SafePermissionMode と SDK 型の一致 assert) / arch L-004 + PB L-002 (「'default' 固定」の文言更新) / PB L-004 (Principle VI の残余: aws cache、helper cleanup、/bin/sh 起動) / po Low 3 件 / analyze A15-A18。詳細は各 raw output を参照。

## Dedup log (要約)

- C-001 ← arch C-001 + analyze A1 (key: AD-036 §4 P1 / plan.md:119)
- H-01 ← PB C-001 + arch H-001 + sec H-001 + analyze A2 (key: FR-005 / plan.md:128)
- H-02 ← arch H-004 + sec M-002 + analyze A3 (key: FR-006)
- H-03 ← arch H-003 + sec H-003 + PB M-005 (key: tasks.md:60)
- H-04 ← arch H-002 + PB H-002 (key: SH-011 / Principle VI 項目 6)
- H-05 ← sec H-004 + PB M-004 + arch L-005 (key: plan.md:156 R-04)
- H-08 ← po H-001 + arch M-005 (key: charter KPI 再利用率)
- H-09/H-10 ← po H-002/H-003 + analyze A9 + sec L-004 (key: 軸の「既定」)
- H-11 ← po H-004 + analyze A12 (key: R-01)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md) (C-001 は cascade_enforce で High に降格。実機 probe の裏付けがあるので H-01 として最優先で扱う)
