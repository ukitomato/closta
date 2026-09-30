# Code Gate: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Spec**: specs/007-provider-registration-and-reachability/
**Diff scope**: 42 files (base: 0bc897c) / **Tracks**: lint-agent, test-agent, convention-reviewer, database-reviewer, platform-boundary-reviewer

## Verdict

| Severity | iter1 (初回 review) | iter2 (fix 後) | Where |
|---|---|---|---|
| MUST_FIX | 0 | 0 | — (lint error 0 / test failure 0 / reviewer Critical 0) |
| High (SHOULD_FIX) | 3 | 0 | 全 3 件 fix 済み |
| Medium | 5 | 2 (deferred) | DB-M-002 / DB-M-003 |
| Low | 6 | 4 (deferred) | DB-L-001 / PB-L-001 / PB-L-002 / CONV-L-002 |

**Status**: PASS (must_fix=0)。機械検証は初回から PASS。User 判断で High 3 + 型/些末 Low を code-gate で fix し再検証。

## 機械検証 (iter2、fix 後)

- lint: 0 errors / 0 warnings (`--fix` 済み) — exit 0
- typecheck: node / web とも exit 0
- depcruise: no violations (251 modules, 1052 deps) — exit 0
- check:constitution: ok 16 / 違反 0 / pending 1 (#5 docker 未使用は設計どおり) — exit 0
- test: **1108 passed / 71 files / 0 failed** (+6 = 退避 3 + PB-H-001 2 + PB-H-002 1) — exit 0
- test:rules: 32/32 一致 — exit 0

## 対応状況 (User 判断: 3 High + 型/些末を fix)

### 修正済み (8 件)

- **DB-H-001 (High)** — `provider-store` に folder-store 準拠の**上書き前退避**を実装。parse 失敗/非オブジェクト→退避+`parse-failed`、未知 schemaVersion→退避+`schema-version-unknown`、一部破損 (skipped>0)→退避。`ProviderLoadResult.backupPath` 追加、`now` 注入。破損 or 将来版ファイルを開いた後の save() が既存 Provider を復旧不能に消す退行を解消。
- **DB-M-001 (Medium)** — reasonKey を `parse-failed`/`schema-version-unknown`/`invalid-record` に分離 (`ProviderLoadIssue`)。version-skew を退避+非上書き分岐へ接続。
- **DB-M-004 (Medium)** — 退避回帰テスト 3 件追加 (parse 失敗で原文が `.bak` に保全 / 未知版で全件破棄しない / 一部破損で読めた分復元)。
- **PB-H-001 (High)** — `deriveLaunchEnv` の extraEnv passthrough から `CLAUDE_CONFIG_DIR` を締め出す (`DERIVATION_CONTROLLED_KEYS`)。素の HostPath が RuntimePath 変換を迂回する穴を塞ぐ。負例 2 件 (非 config-dir + extraEnv / config-dir + resolved 未解決 + extraEnv)。
- **PB-H-002 (High)** — `deriveEnv` 先頭で `assessReachability(profile, runtime) !== 'reachable'` なら null。interface doc / contract C-1 の「到達不可は null」を実装。到達不可 config-dir の沈黙フォールバックを断つ。負例 1 件 (win32 × WSL config dir → null)。
- **PB-M-001 (Medium)** — `ResolvedCredential.configDirRuntimePath` を `string` → branded `RuntimePath`。`resolveConfigDirRuntimePath` の戻りも `RuntimePath | null`。data-model §4 との乖離を解消し、HostPath.value 取り違えを tsc が検出できるように。
- **CONV-L-001 (Low)** — plan.md / tasks.md の `normalizeDetectedCandidate` を実装に合わせ複数形へ。
- **CONV-L-003 (Low)** — 実体を得た `infra/secrets/` の vestigial `.gitkeep` を削除。

### Deferred (pr-gate / X-4 で対応。6 件)

- **DB-M-002 (Medium)** — extraEnv が無制約 `Record<string,string>` 袋。**設計判断**: spec FR-004 (値スキャン) + FR-009 (KEY denylist) の多層防御が既に設計済み。allowlist 型化 or 明文化は X-4 の自由入力 UI 追加時に IPC 境界検証 (`checkProviderDraft`) と併せて判断。
- **DB-M-003 (Medium)** — 固定 temp 名の並行 save 競合。main は概ね single-thread 主導で確率低。temp 名一意化 or mutex は pr-gate で再評価。
- **DB-L-001 (Low)** — rename 前 fsync 無し。**system scope** (folder-store も同様)。横断修正が適切。
- **PB-L-001 (Low)** — reachability の distro exact 比較 (canonical 化せず)。fail-closed で安全側。UI が configDir を収集しないため現 live path なし → X-4。
- **PB-L-002 (Low)** — check.mjs 項目 17 の走査が derive-env/provider-service を含まない。best-effort backstop。X-4 で走査範囲拡張を判断。
- **CONV-L-002 (Low)** — infra/provider の `detect.ts`/`detector.ts` 命名。強制でない。

## 起動しなかった reviewer

- a11y-reviewer: `gates=['pr-gate']` に code-gate が無い
- ux-reviewer: `gates=['pr-gate']` に code-gate が無い

security / architecture / po reviewer は code-gate では起動しない (pr-gate 専任。overlap 排除)。

各 reviewer の raw output: `database-reviewer.code-gate.md` / `platform-boundary-reviewer.code-gate.md` / `convention-reviewer.code-gate.md`。
