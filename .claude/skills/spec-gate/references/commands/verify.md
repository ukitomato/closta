# /spec-gate verify — subcommand body

> Loaded by `skills/spec-gate/SKILL.md` (dispatcher) when the first argument is `verify`.

開発 ready 検証 + 整合性チェック。`/spec-gate bootstrap` 完了後 / `/spec-gate migrate` 完了後 / 任意のタイミングで実行可能。問題の早期発見と「品質が低い状態で開発を始めない」ためのゲート。`docs/verify-report.md` を出力する。

## Inputs

- `$ARGUMENTS` (subcommand 抜き残り):
  - `--phase <N>` (1-5): 特定 phase だけ実行
  - `--strict`: warning も `fail` 扱い
  - `--prefix <name>`: 検証対象 prefix を明示 (省略時は `.claude/skills/<prefix>-spec/` の存在から自動検出)

## Phase 0: Preconditions

1. `.specify/` 存在確認
2. prefix を検出:
   - `--prefix` flag があれば使用
   - 無ければ `.claude/skills/<prefix>-spec/` を `ls` して prefix を抽出
   - 0 件 → halt with "/spec-gate bootstrap を先に実行してください"
   - 複数候補 → AskUserQuestion で選択
3. `--phase` flag に応じて phase 1-5 のうち実行対象を確定

## Phase 1: 構造検証 (Existence Check)

「必要な file / dir が揃っているか」の純粋なチェック。

```bash
# 必須 file / dir リスト (チェック対象、Wave 4 で expanded)
REQUIRED:
  .specify/memory/constitution.md (or constitution.draft.md)
  .specify/templates/spec-gate/  (bootstrap が配置済)
  .specify/scripts/spec-resolve.sh  (実行可能)
  .specify/scripts/status-transition.sh  (実行可能)
  .specify/scripts/gate-common.sh  (実行可能、Wave 0 新規)
  .specify/.agents-registry.yaml  (Wave 0 新規)
  .specify/.id-registry.json  (Wave 0 新規)
  docs/discovery.md
  docs/domains/  (1+ subdirectory)
  docs/glossary.md
  .claude/skills/<prefix>-{spec,plan,tasks,design-gate,implement,code-gate,pr-gate,done,add-reviewer}/SKILL.md  (9個)
  .claude/agents/{reviewer-base,security-reviewer,architecture-reviewer,po-reviewer,convention-reviewer}.md  (5個 generic)
  .claude/agents/{implementer,lint-agent,test-agent}.md  (3個 actor、Wave 0 新規)
```

各項目について:
- 存在しなければ `fail` (Phase 1 fail = report 全体 fail)
- 存在するが `status: needs-human-review` のまま → `warning`
- `status: active` → `pass`

verification report の Phase 1 section に結果を記録 (table 形式)。

## Phase 2: 整合性検証 (Cross-Reference Consistency)

frontmatter / 参照関係の妥当性チェック。

### 2.1 spec frontmatter validity

`specs/*/spec.md` の全件:
- `spec_id` が valid 形式 (`^[0-9]{3}-[a-z-]+$` or `^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[A-Z]+-[a-z-]+$` or `^rev-[0-9]{3}-[A-Z]+-[a-z-]+$`)
- `domain` が `docs/domains/<value>/charter.md` に対応する実 domain
- `status` が valid な enum 値 (drafting / planning / tasking / implementing / reviewing / completed / migrated)
- `targets` が valid (frontend / backend / both / null)
- (reverse spec の場合) `bf_ids` / `sf_ids` が空配列でない

### 2.2 bf_ids / sf_ids の code references

reverse spec (`specs/rev-*/`) の `bf_ids` / `sf_ids` で参照されているコードが実存:

```bash
# 例: bf_ids: ["BF-001"], spec body で "lib/auth/login.py:42" を引用しているなら
grep -rn 'BF-001' <referenced files>
```

存在しなければ `warning` (コードがリファクタされた可能性)、5+ 件で `fail`。

### 2.3 reverse spec ↔ charter の対応

全 `specs/rev-*/` に対し:
- `frontmatter.domain` の charter `docs/domains/<domain>/charter.md` が存在
- 不在なら `fail` (charter が削除されたか domain が未承認)

### 2.4 reviewers.yml ↔ `.claude/agents/` の一致

`.specify/spec-gate/reviewers.yml` の entry と `.claude/agents/*.md` の実在ファイルが一致:
- registry にあるが agent file なし → `fail` (broken registry)
- agent file はあるが registry に未登録 → `warning` (手動配置の可能性)

### 2.5 `.specify/.agents-registry.yaml` ↔ `.claude/agents/` の一致 (Wave 4 新規)

```bash
source .specify/scripts/gate-common.sh
gate_common::registry_load   # 18 agent name を返す
# 各 agent について registry_assert_agent を実行
```

- registered だが `.claude/agents/<name>.md` 不在 → `fail`
- `.claude/agents/<name>.md` あるが registry 未登録 → **explicit note 必須** (resolves B-3 medium):
  - "Unregistered agents (N): <list>" を verify-report に記載
  - "意図的に未登録 (brownfield specialist 等)" の場合は `reviewers.yml` 側に `intentionally_unregistered: <reason>` の comment を要求

## Phase 3: 過不足検証 (Gap Analysis)

「あるべきもの」と「現状」の差分を semantic に判定 (LLM 判断含む)。

### 3.1 Constitution Principle ↔ Reviewer Owner Matrix の覆い

`.specify/memory/constitution.md` の各 Principle を Read し、その Principle が要求する観点が現状の reviewer 構成で十分カバーされているかを LLM が判定:

例:
- Principle "All endpoints follow OpenAPI" あり、かつ project に `openapi.yaml` ある → `openapi-contract-reviewer` 未採用なら `warning` + 提案 ("/spec-gate-add-reviewer openapi-contract-reviewer --from-template" を案内)
- Principle "Database migrations must be reversible" あり → `database-reviewer` 未採用なら `warning`
- Principle "Accessibility: WCAG 2.1 AA" あり → `a11y-reviewer` 未採用なら `warning`

検出された gap は `verify-report.md` の "Reviewer Coverage Gaps" section に列挙。

### 3.2 Charter scope ↔ Constitution Principle

各 charter の Mission / Scope を Read し、Constitution Principle で関連する Principle が存在するかを LLM が判定:
- e.g., charter で "user authentication" が中心 mission なのに、Constitution に auth 関連 Principle なし → `warning` + Constitution amendment を提案

### 3.3 Glossary 用語の使用状況 (全用語スキャン、resolves B-3 medium)

`docs/glossary.md` の **全 Canonical Terms + Candidate Terms** (旧仕様の 8/30 サンプリングではなく全用語) に対し:

```bash
for term in $(awk '/^### / {print $2}' docs/glossary.md); do
  count=$(grep -rc "$term" lib/ src/ apps/ packages/ 2>/dev/null | awk -F: '{s+=$2} END {print s}')
  echo "$term: $count"
done
```

各用語について:
- 0 件のコード参照 → `warning` (未使用、削除候補)
- Candidate Terms section にあって 5+ コード参照 → `warning` (canonical 昇格候補)

verify-report の "Glossary Usage Gaps" section に **全用語の参照件数 table** を必ず含める ("8/30 sampled" の旧 metric は廃止)。

### 3.4 Reverse spec `confidence` 分布 (Wave 4 新規)

`specs/rev-*/spec.md` frontmatter の `confidence` 値分布を集計:

- `high`: 件数
- `medium`: 件数
- `low`: 件数

`low` 比率が 50% を超える場合は `warning` (constitution-drafter の入力品質に懸念)。

### 3.5 NON-NEGOTIABLE Principle 採用時の Critical 違反件数 enumeration (NEW、resolves B-3 blocker / B-5)

`.specify/memory/constitution.{md,draft.md}` の全 NON-NEGOTIABLE Principle に対し:

```bash
for principle in <each NON-NEGOTIABLE>; do
  pattern=$(get_bad_pattern_grep_metadata "$principle")
  count=$(bash -c "$pattern" | wc -l)
  paths=$(bash -c "$pattern" | head -10)
  emit_to_report principle:$principle, existing_violations:$count, paths:$paths
done
```

**Hard gate**: いずれかの NON-NEGOTIABLE Principle で `existing_violations > 0` なら `overall_status: fail` (warning では不十分、resolves B-3 blocker)。

判定 table を verify-report に必須記録:

```markdown
## Phase 3.5: NON-NEGOTIABLE Principle 採用時の Critical 違反件数

| Principle | existing_violations | violation_threshold | verdict | paths (top 5) |
|---|---|---|---|---|
| I | 4 | 0 | **fail** | apps/functions/src/stripe/connect.js:181, ...:241, ... |
| II | 0 | 0 | pass | (none) |
| XI | 7 | 0 | **fail** | apps/mobile/lib/data/services/review_completion_service_impl.dart:17, ... |
| **Total fail** | **2 Principle** | — | — | — |
```

採用 metadata 不在の NON-NEGOTIABLE Principle (旧仕様で書かれた Principle) は `warning` + "adoption_metadata 追加を推奨" 案内。

## Phase 4: 開発 Ready チェック (Dry-Run)

`docs/discovery.md` 記載の build / test / lint コマンドを Bash で dry-run 実行:

### 4.1 Build / Test / Lint コマンドの存在確認

```bash
# 例
which pnpm && pnpm --version
which pytest && pytest --version
which flutter && flutter --version
```

`docs/discovery.md` の "Build / Test / Lint" section から取得したコマンドが存在しなければ `warning`。

### 4.2 Lint dry-run

実際に lint コマンドを実行 (read-only mode):
```bash
pnpm lint --max-warnings 0 --silent 2>&1 | head -20
ruff check . --statistics 2>&1 | head -10
flutter analyze --no-fatal-warnings 2>&1 | head -20
```

exit code 非ゼロ → `warning` (既存コードの lint 違反、新規開発の参考情報として記録)。

### 4.3 Entry point 確認

主要 entry point の存在 (project 種別に応じて):
- `package.json` の `scripts.dev` / `scripts.start` 存在
- Python: `pyproject.toml` の `[project.scripts]` または `main.py`
- Flutter: `lib/main.dart`
- Go: `main.go` または `cmd/<name>/main.go`

不在なら `warning`。

### 4.4 `.specify/scripts/` の実行可能性

```bash
[ -x .specify/scripts/spec-resolve.sh ] && echo "spec-resolve.sh OK" || echo "FAIL: not executable"
[ -x .specify/scripts/status-transition.sh ] && echo "status-transition.sh OK" || echo "FAIL: not executable"
[ -x .specify/scripts/gate-common.sh ] && echo "gate-common.sh OK" || echo "FAIL: not executable"
bash .specify/scripts/gate-common.sh version >/dev/null && echo "gate-common version OK" || echo "FAIL: smoke test"
```

非実行可能 → `fail` (`chmod +x` で修正可能なので修正案内も出す)。

### 4.5 Environment / secrets チェック

- `.env.example` の存在
- 環境変数 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 等の hardcode 検出 (`grep -rE 'sk-[a-zA-Z0-9]{32,}'`)
- 検出されれば `fail` (secret leak)

### 4.5b: Orchestration runtime check (Wave 4、resolves B-3 high)

monorepo orchestration tool (`go-task/task`, `nx`, `turbo`, `lerna`) が `Taskfile.yml` / `nx.json` / `turbo.json` / `lerna.json` から検出された場合、その実体 binary が `which` で存在するか確認:

- `Taskfile.yml` あり、`task` 未インストール → **`fail` (dev-ready: fail)** (resolves B-3 high の warning 止まり問題)
- `nx.json` あり、`nx` 未インストール → fail
- `turbo.json` あり、`turbo` 未インストール → fail

monorepo の主要 entry が機能不全 → dev-ready を保証できないため fail。

### 4.6: Static file 404 check (Wave 4 新規、resolves B-8 blocker)

外部 service redirect URL / OAuth callback / Stripe Connect onboarding return URL 等の **静的ファイルの物理存在** を確認:

```bash
# 例: Stripe Connect onboarding return URL の指す path
# `apps/functions/src/stripe/connect.js` を Grep し
#   returnUrl: 'https://menteech.com/stripe/onboarding-complete'
# のような URL を抽出し、対応する static file の存在を確認

for url in $(extract_return_urls); do
  path=$(url_to_local_path "$url")  # e.g., sites/homepage/stripe/onboarding-complete.html
  if [ ! -f "$path" ]; then
    echo "fail: $url → $path (file missing)"
  fi
done
```

検出パターン:
- Stripe Connect: `returnUrl` / `refreshUrl` flags
- OAuth callback: `redirect_uri` / `callback_url`
- 設定 file 内の HTTPS path

不在 → **`fail`** (UX が成立しない、resolves B-8 Stripe 404 問題)。

verify-report の "Phase 4.6: Static URL existence check" に table 出力。

## Phase 5: レポート出力

`docs/verify-report.md` に Markdown で書き出し:

```markdown
---
generated_by: /spec-gate verify
generated_at: <ISO 8601>
prefix: <prefix>
strict_mode: <true|false>
overall_status: <ready | warning | fail>
---

# Verify Report: <project-name>

## Summary

| Phase | Verdict | Count of issues |
|---|---|---|
| 1. Structure | pass / warning / fail | <n> |
| 2. Consistency | pass / warning / fail | <n> |
| 3. Gap Analysis | pass / warning / fail | <n> |
| 4. Dev Ready | pass / warning / fail | <n> |

**Overall status**: <ready | warning | fail>

## Phase 1: Structure

(table of required files/dirs, status, path)

## Phase 2: Consistency

(per-issue details with severity)

## Phase 3: Gap Analysis

### Reviewer Coverage Gaps
- ...

### Charter ↔ Constitution Gaps
- ...

### Glossary Usage Gaps
- ...

## Phase 4: Dev Ready

- Build/Test/Lint commands: <status>
- Lint dry-run: <output summary>
- Entry points: <status>
- Helper scripts: <status>
- Secrets check: <status>

## Recommended actions

(prioritized list of fixes, with copy-paste commands when possible)
- [ ] Run `/<prefix>-add-reviewer openapi-contract-reviewer --from-template` to fill OpenAPI gap
- [ ] Update `docs/domains/auth/charter.md` status from `needs-human-review` to `active`
- [ ] `chmod +x .specify/scripts/spec-resolve.sh`
...
```

## Overall status の決定 (Wave 4 で hardening)

- **ready**: 全 phase が `pass` (warning も無し)
- **warning**: 1+ warning、ただし fail なし。`--strict` モードでは **warning も fail に escalate される** (resolves item 22)
- **fail**: 以下のいずれかで決定:
  - Phase 1 / 2 で `fail` 検出
  - **Phase 3.5 で NON-NEGOTIABLE Principle existing_violations > 0** (resolves B-3 blocker、warning に降格しない)
  - Phase 4.5b で orchestration runtime missing (resolves B-3 high)
  - Phase 4.6 で static URL 404 (resolves B-8 blocker)
  - Phase 4.5 で secret leak

`--strict` モード: warning も fail として overall_status を fail に escalate (resolves item 22 / Wave 4)。

## Idempotency

- 既存 `docs/verify-report.md` は毎回上書き (履歴は git で追える前提)
- `--phase <N>` で部分実行した場合、その phase だけの report を生成 (他 phase は前回値を引継ぎ)

## Failure modes

- prefix 検出不能 → AskUserQuestion で明示指定要求
- `docs/discovery.md` 不在 → Phase 4 を skip して報告
- Lint コマンド未インストール → Phase 4.1 warning、Phase 4.2 skip
- subagent 起動不要 (本 subcommand は subagent を使わない、本体 LLM が直接判定)

## Acceptance criteria

1. `docs/verify-report.md` が存在し、5 phase の verdict が記録
2. `overall_status` が ready / warning / fail のいずれかで明記
3. Recommended actions section に具体的な修正コマンド or 案内が記載
4. `--strict` モードで warning も fail にエスカレートされる
5. `--phase 3` のような部分実行が動作する
6. Phase 2.5 で agent registry validation が走り unregistered list を出す
7. Phase 3.3 で全 glossary 用語の grep が実行され (8/30 サンプリングなし)、結果 table が含まれる
8. Phase 3.5 で NON-NEGOTIABLE Principle の existing_violations が enumerate され、`> 0` あれば overall_status: fail
9. Phase 4.5b で orchestration runtime (`task` 等) 不在を fail として記録
10. Phase 4.6 で external service return URL の静的 file 存在チェックを実行
