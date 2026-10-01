## Specification Analysis Report (Track A: analyze, X-4 / 008, round 2)

CRITICAL は 0 件、HIGH は 2 件です。round 1 の 18 件は 15 件が解消済み、1 件は範囲縮小で消滅、LOW 2 件 (A17 / A18) が未修正で残っています。C-001 の起点だった A1 (§4 P1 への model / effort 追加) は、AD-041 (g) と pin テストで閉じました。H-01 の起点だった A2 (env 配送) も、FR-013 の実名 `WSLENV` 生成・`--exec`・distro 内の実機観測で閉じています。予算はすべて上限内です (FR 17/20、SC 10/10、US 4/4、AC 7/4/3/4 で上限 8)。

新しい HIGH の 2 件は、どちらも `composeLaunchEnv` の入力と既存コードの `DerivedLaunchEnv` の形がずれていることから来ています。
- **B1**: `WSLENV` に列挙するキー集合 (「導出キーの実名」) が定まっていない。
- **B2**: `env-passthrough` Provider の値を WSL へ届ける経路が無い。

`.specify/extensions.yml` の hook はありません。コードに関する主張の多くは実コードと合っていました (`decodeLaunchSpec`・`session-spawner.ts:66`・`:336`・`derive-env.ts:70`・`composition-root.ts:283`・`fromHost` / `fromUnc` / `isSameDistro`・`LAUNCH_ENV_DENY_PATTERN`・resolution DTO の `impact`・`constitution.md:845`)。例外は B6 (`--exec` は許可リストに既にある) と B3 (helperPath の経路) です。

### Round 1 findings status
| ID | status | evidence (path:line) |
|---|---|---|
| A1 (§4 P1 に model/effort) | resolved | spec.md:194,319 (AD-041 (g)) / plan.md:173,233 / tasks.md:50-54 (pin テスト) |
| A2 (env が WSL に届かない / denylist の衝突) | resolved (ただし新規 B1 / B2 あり) | spec.md:225-230 (FR-013) / plan.md:160-164,184 / tasks.md:71-73,187 |
| A3 (main で再検証していない) | resolved | spec.md:199 (FR-006) / plan.md:195 / tasks.md:63 / SC-002 spec.md:280 |
| A4 (worker の decoder) | resolved | spec.md:192 / plan.md:176-178 / tasks.md:55-60 |
| A5 (X-3 の task ID との衝突) | resolved | tasks.md:12 / spec.md:36-37,309-310 |
| A6 (SH-002 を前提に置く) | resolved | tasks.md:18,195 |
| A7 (SC-008 の計測) | resolved | spec.md:298 / tasks.md:133-135 |
| A8 (resolveFolderRuntime のシグネチャ) | resolved | tasks.md:134 / plan.md:210 (DTO を消費する形。resolution.ts:84 に `impact` あり) |
| A9 (folder/runtime/provider の「既定」) | resolved | spec.md:169-170 / plan.md:152,199 / tasks.md:65 |
| A10 (supportedEffortLevels が無いとき) | resolved | spec.md:156,172 / tasks.md:48,129 |
| A11 (folder↔runtime の distro 不一致) | resolved | spec.md:116,197 / tasks.md:47,127 |
| A12 (helper の /mnt/c 実行フォールバック) | resolved (X-7 への繰越で消滅) | spec.md:39-42,265,332。R-01 の意味が変わったため B4 を新規に起こした |
| A13 (glossary の LaunchInput / Cross-boundary) | resolved | tasks.md:19-22 |
| A14 (Constitution VIII / XIII) | resolved | plan.md:55,58 |
| A15 (deriveEnv と deriveLaunchEnv の混用) | resolved | spec 全体で「X-3 deriveEnv」に統一。plan.md:199 は `providers.deriveEnv` |
| A16 (charter drift) | resolved | tasks.md:164 (SH-014) |
| A17 (SH-004/005 が Shared にあり [BE] タグ) | unresolved | tasks.md:23,29 |
| A18 (FR-017 の並び順) | unresolved | spec.md:177 (FR-003 と FR-004 の間) |

### Findings
| ID | Category | Severity | Location(s) | Summary | Recommendation | vs prev |
|---|---|---|---|---|---|---|
| B1 | Inconsistency / underspecified (env 配送) | HIGH | plan.md:160-163 `composeLaunchEnv(curatedBase, derived)`; tasks.md:72; SC-007 spec.md:295-296; 実コード derive-env.ts:38 (`env = { ...curatedBase }`), :44-48 (extraEnv), types.ts:131-134 | `DerivedLaunchEnv.env` は curatedBase の spread (`SystemRoot`/`windir`/`TEMP`/`TMP`) と extraEnv と実名注入を既に合流させた 1 枚である。「derived のキーの実名で `WSLENV`」をそのまま実装すると、Windows パス値の `TEMP` / `SystemRoot` 等まで `/u` で WSL に流れる。逆に除外規則を決めないと、extraEnv (US-4 で配送対象と明記) が落ちるかどうかも決まらない。extraEnv の `PATH` などを転送してよいかも未定。`^[A-Z_][A-Z0-9_]*$` に合わない extraEnv キーを捨てるのか拒否するのかも未定 | `WSLENV` の集合を `keys(derived.env) − keys(curatedBase)` (= 非 denylist の extraEnv + 実名注入) と定義する。または `deriveLaunchEnv` が passthrough と curated を分けて返すよう型を変える (AD-042 に記録)。規則外のキーは「起動拒否 (理由キー)」か「破棄」かを FR-013 に明記する。SC-007 の単体に「curatedBase のキーは `WSLENV` に 0」を足す | new |
| B2 | Coverage gap / fail-open | HIGH | spec 全体 (env-passthrough に言及なし); derive-env.ts:85-87 (「infra が curatedBase に合流済み」); composition-root.ts:285 (`curatedBaseEnv = buildLaunchEnv(process.env)` = 固定 allowlist); reachability.ts:29 (非 config-dir 方式は常に `reachable`); detect.test.ts:61 (varNames = `ANTHROPIC_API_KEY` = denylist に一致) | `env-passthrough` Provider は到達可能として選択肢に出る。しかし varNames の値を起動 env に載せる経路が X-3 にも X-4 にも無い (curatedBase は固定 allowlist で、代表例の `ANTHROPIC_API_KEY` は denylist に当たる)。X-4 で初めて実配線されるため、選ぶと distro 既定の資格情報で黙って起動する。round 1 の H-10 と同じ種類の問題 | X-4 での扱いを決めて FR に書く。(i) passthrough を実装する (値の出所・denylist との関係・`WSLENV` への算入)。(ii) X-4 では `env-passthrough` を起動不可 (理由キー) にして後続へ繰り越す。どちらも `resolveLaunchAxes` の blocker かテストに 1 ケース足す | new |
| B3 | Underspecified task | MEDIUM | tasks.md:146-148 (BE-031); spec FR-014 spec.md:232-233; derive-env.ts:63,66 (`cred.helperPath` を直接 settings へ); provider-service.ts:277 | FR-014 は helper 系 3 方式すべての helperPath を分類すると定めている。一方 BE-031 が触れるのは `:70` の fallback だけである。api-key-helper / aws-credential-export は `resolved` を経由せず `cred.helperPath` を直接 settings に入れているので、分類済みの値を注入する seam が無い | `ResolvedCredential` に 3 方式共通の `helperRuntimePath: RuntimePath` を置く (または各方式ごとに置く)。deriveLaunchEnv の :63/:66/:70 をそれ経由に変える作業を BE-031 に明記する。型の変更は AD-042 (SH-002) の対象に入れる | new |
| B4 | Conditional scope | MEDIUM | plan.md:253-260 (R-01 のフォールバック (b)「`--` を維持し、メタ文字なしを assert」); spec FR-013 spec.md:230, SC-009 spec.md:299-301; plan.md:146,245 (項目 6 / DISTRO_SCRIPT_CONSTANTS は変更しない) | spec は `--exec` を無条件に要求している (FR-013 / SC-009「シェルを経由しない」)。plan の R-01 フォールバック (b) を採ると、この要求と矛盾する。フォールバック (a) の `/bin/sh -lc '<固定スクリプト>'` は新しい distro 実行スクリプト定数になる。そのため「項目 6 は変更しない」と両立するかが未検証 | SH-000 の結果で FR-013 / SC-009 を書き換える条件を spec の Assumptions に書く。または (b) を plan から外す。(a) を採る場合は項目 6 / 項目 2 の扱いを AD-041 (f) に含める | new |
| B5 | Write/read symmetry / layer | MEDIUM | FR-009 spec.md:212, FR-010 :217, SC-004 :285; plan.md:187,192; validate.ts:172 (`isValidDisplayName` は main/app); provider-record.ts:126,147 (`isNonEmptyString` で別実装) | preset 名の読み取り側検証の述語が未定。`isValidDisplayName` は `main/app` にあり、`infra/settings/preset-record` から import するとレイヤ違反になる (AD-023)。provider-record は既に別実装に分かれている。SC-004 の「checkPreset と preset-record が同じく拒否」は、名前については成り立たない | 名前の述語を domain (例: `launch-config.ts` か共通の validation) へ移し、checkPreset と preset-record で共有する。これを SH-004 / BE-011 に明記する | new |
| B6 | Stale plan claim | LOW | plan.md:144,244; tasks.md:75 (BE-009「`WSL_ALLOWED_ARGS` に `--exec` を足す」) vs allowlists.mjs:178 | `--exec` は `WSL_ALLOWED_ARGS` に既にある。項目 2 は変更不要 | 記述を「既存の許可形 `--exec` を使う (項目 2 は変更なし)」に直す | new |
| B7 | Measurement path | LOW | SC-007 spec.md:296「fork env に導出キーが 0」; tasks.md:173 (SH-020 は `composeLaunchEnv` の単体に列挙) | fork env は composition-root (`buildLaunchEnv` のまま) で組まれるので、純粋関数 `composeLaunchEnv` の単体では fork env を測れない | `prepareLaunch` か session-spawner の単体に「fork env に導出キー 0」の assert を置く | new |
| B8 | Coverage (minor) | LOW | tasks.md:70 (BE-008), SC-010 spec.md:302 vs validate.ts:335 (`checkProviderDraft` も `isValidModelCatalog` を使う) | 登録ドラフト側の models 検証が、境界値テストの対象として名前が挙がっていない | BE-008 / SC-010 の対象に `checkProviderDraft` を足す | new |
| A17 | Structure | LOW | tasks.md:23,29 | SH-004/005 が Shared にあり [BE] タグのまま | タグを付け直すか、Backend へ移す | unresolved |
| A18 | Ordering | LOW | spec.md:177 | FR-017 が FR-003 と FR-004 の間にある | 見た目だけの問題。放置してよい | unresolved |

ADR 引用も確認し、問題はありませんでした。
- AD-015 §5 (`WSLENV`・引数) と §7 (`bash -lc` による claude 解決) は plan.md:75 の記述と合っている。
- AD-036 §6 (0036:166-171: `WSLENV` と資格情報系を denylist) は、AD-041 (e) で「passthrough に限定」する調停対象として正しく挙がっている。
- AD-017 / AD-020 / AD-040 は round 1 で確認済みで、変更はない。
- roadmap に X-6 / X-7 の行がある (roadmap.md:188-189)。O-3 への KPI 義務の登録は SH-014 の作業として残っている (roadmap.md:209 は現在「—」)。

### Coverage Summary
| Req | Has task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Y | SH-004, BE-001, BE-002, FE-001 | |
| FR-002 | Y | FE-001, SH-022 | |
| FR-003 | Y | BE-001, FE-001, SH-022 | |
| FR-017 | Y | SH-004, SH-005, BE-008, FE-003 | B8 |
| FR-004 | Y | SH-001, SH-004, BE-003, SH-010 | |
| FR-005 | Y | BE-003, BE-004, BE-005, BE-006, BE-007, FE-002 | |
| FR-006 | Y | BE-001, BE-006, BE-020, FE-001, FE-010 | |
| FR-007 | Y | BE-001 | |
| FR-008 | Y | FE-020 | |
| FR-009 | Y | BE-010, BE-011, BE-012, BE-013, FE-010 | B5 |
| FR-010 | Y | BE-011, SH-020 | B5 |
| FR-011 | Y | BE-012, FE-010 | |
| FR-012 | Y | BE-030 | |
| FR-013 | Y | BE-009, BE-006, SH-000, SH-023 | B1, B2, B4 |
| FR-014 | Partial | BE-031, BE-032 | B3 (api-key-helper / aws-credential-export の経路が無い) |
| FR-015 | Y | SH-003, SH-014, FE-004 | |
| FR-016 | n/a | (継承) | |
| SC-001 | Y | BE-001, SH-020, SH-022 | |
| SC-002 | Y | BE-020, BE-006, SH-020, SH-022 | |
| SC-003 | Y | BE-011, SH-020 | |
| SC-004 | Y | BE-011, BE-013, SH-020, SH-022 | B5 (名前の対称性) |
| SC-005 | Y | BE-003, BE-004, SH-010, SH-020 | |
| SC-006 | Y | BE-030, SH-020, SH-023 | |
| SC-007 | Y | BE-009, SH-020, SH-023 | B1, B7 |
| SC-008 | Y | FE-020 | |
| SC-009 | Y | BE-006, BE-009, SH-020, SH-023 | B4 |
| SC-010 | Y | BE-008, SH-020 | B8 |

どの要件にも対応しないタスクはありません (SH-012 / SH-013 / SH-015 は先行 feature からの繰越義務の記帳)。

### Metrics
- Critical: 0 / High: 2 (B1, B2) / Medium: 3 (B3, B4, B5) / Low: 5 (B6, B7, B8, A17, A18)
- Total requirements: 27 (FR 17 + SC 10)。予算内 (FR ≤ 20, SC ≤ 10, US 4, AC 最大 7 ≤ 8)
- Total tasks: 39
- Coverage: 26 件の buildable 要件がすべてタスクに対応し、名目 100%。FR-014 は部分的 (B3)
- Round 1: 18 件のうち resolved 16 (A12 は消滅を含む)、unresolved 2 (いずれも LOW)
- 次の一手: B1 / B2 を FR-013 と plan の `launch-env.ts` 節で決める (必要なら AD-041 (e) / AD-042 に記録)。B3 は BE-031 の範囲に追記する。B4 は Assumptions に条件付き文言を足す。その後 `/cl-design --spec-dir specs/008-session-launch-settings-dialog-and-presets --from gate` で再実行する。

参照したファイル (すべて C:\dev\closta\ 配下):
- specs/008-session-launch-settings-dialog-and-presets/{spec,plan,tasks}.md
- gate-r1/{design-gate,analyze}.md
- docs/roadmap.md, .specify/memory/constitution.md
- docs/decisions/0015, 0036
- src/domain/provider/{derive-env,types,reachability}.ts
- src/main/app/{provider-service,composition-root,validate,session-ipc,session-spawner}.ts
- src/main/infra/runtime/launch-spec.ts, src/main/infra/settings/provider-record.ts
- src/agents/{session-core,sdk-agent-session}.ts
- scripts/constitution/{allowlists,check}.mjs, .dependency-cruiser.js
