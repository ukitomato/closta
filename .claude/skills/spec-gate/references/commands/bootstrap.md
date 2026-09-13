# /spec-gate bootstrap — subcommand body

> Loaded by `skills/spec-gate/SKILL.md` (dispatcher) when the first argument is `bootstrap`.

`docs/discovery.md` (`/spec-gate scan` の出力) を読み、**9 daily workflow wrapper** + **4 generic reviewer subagent + reviewer-base** を配置する。tech stack に応じて optional reviewer (database / a11y / api-performance / openapi-contract / ux) の追加採用を AskUserQuestion でユーザに提案し、選択結果に基づいて `.claude/agents/` に追加配置する。最後に Constitution の draft scaffold を起草し、AGENTS.md / CLAUDE.md にプロジェクト向け section を merge する。

## Inputs

- `$ARGUMENTS` (subcommand 抜き残り):
  - `--prefix <name>` (optional): namespace prefix (`^[a-z][a-z0-9-]{0,15}$`)
  - `--force` (optional): 既存 wrapper / subagent を上書き
  - `--lang ja|en` (optional): 生成テンプレートの言語 (default: `ja`)

## Phase 0: Preconditions

1. `.specify/` 存在確認
2. `docs/discovery.md` 存在確認 (なければ halt with "Run `/spec-gate scan` first")
3. `.claude/skills/<existing-prefix>-*` の有無を確認:
   - 既存配置なし → 新規 install として続行
   - 既存配置あり + `--force` なし → AskUserQuestion で「上書き / 既存 prefix を維持して終了 / 別 prefix で並存」を選択
4. `${CLAUDE_SKILL_DIR}/references/` 配下の必要 file をすべて Read 可能であることを確認 (skill 整合性チェック)

## Phase 1: Prefix 確定 (AskUserQuestion)

1. `--prefix` flag があれば validation:
   - `^[a-z][a-z0-9-]{0,15}$` に違反 → halt + 再入力要求
2. flag なしの場合、候補を以下の順で生成:
   - `package.json` の `name` (scope 除去、kebab-case 正規化)
   - `pyproject.toml` の `[project].name`
   - `pubspec.yaml` の `name`
   - `Cargo.toml` の `[package].name`
   - `go.mod` の module path 末尾
   - cwd の basename
   - default: `spec-gate`
3. AskUserQuestion で 4 候補 (default + 2 自動抽出 + 自由入力) を提示
4. ユーザ確定値を `$PREFIX` として記録

## Phase 2: Generic reviewer + actor SubAgent 配置 (4 reviewer + base + 3 actor)

`.claude/agents/` ディレクトリを `mkdir -p`。以下 **8 ファイル** を `${CLAUDE_SKILL_DIR}/references/subagents/` から `.claude/agents/` に Write:

**Reviewer (4 + base)**:

- `reviewer-base.md` (共通 Adversary フレームワーク、他 reviewer が `Read` で参照する基盤)
- `security-reviewer.md`
- `architecture-reviewer.md`
- `po-reviewer.md`
- `convention-reviewer.md`

**Actor (3 新規、resolves C-1-a)**:

- `implementer.md` (code-gate auto-fix loop の中核 actor)
- `lint-agent.md` (project lint 実行 dedicated subagent)
- `test-agent.md` (project test 実行 dedicated subagent)

既存があれば `--force` なしならば AskUserQuestion で上書き確認。

## Phase 3: Reviewer 構成提案 (AskUserQuestion、★ MVP 新規 phase)

`docs/discovery.md` を Read し、tech stack section から構成提案を生成する。

### 3.1 自動推定 — 各 optional reviewer の推奨判定

以下のヒューリスティクスで `docs/discovery.md` を解析し、各 optional reviewer の "推奨度" を決定:

| Optional reviewer | 推奨条件 (discovery.md 内のキーワード or 構造) |
|---|---|
| `database-reviewer` | PostgreSQL / MySQL / SQLite / Supabase / Prisma / Alembic / migration / RLS の言及あり、または `migrations/` `db/` ディレクトリあり |
| `a11y-reviewer` | UI 系 framework (Vue/React/Svelte/Flutter/Astro) 言及あり、または `**/*.{vue,tsx,jsx,dart,svelte}` 多数 |
| `api-performance-reviewer` | API server framework (FastAPI/Express/Spring/Django/Rails/Echo/Gin) 言及あり、または `endpoints/` `routes/` `controllers/` あり |
| `openapi-contract-reviewer` | `openapi.yaml` / `openapi.json` / `swagger.yaml` / `contracts/*.yaml` の存在 |
| `ux-reviewer` | a11y-reviewer と同じ条件 (UI 系) — a11y と ux は近接観点 |

各 reviewer に対し:
- 推奨条件を満たす → "適切" 構成に含める
- 満たさない → "適切" には含めない (個別追加は "カスタム" で可能)

### 3.2 構成プリセット提示 (AskUserQuestion)

ユーザに以下 4 オプションを提示:

```
プロジェクトの tech stack を検出しました:
  - <主要 framework 1>
  - <主要 framework 2>
  - <DB / インフラ>

レビュアー構成を選択してください:

  最少 (minimum)  : 4 generic reviewer のみ (security, architecture, po, convention)
                    軽量。新規プロジェクト / プロトタイピング向け

  適切 (recommended) ← おすすめ: 4 generic + tech stack に応じた optional
                    自動推奨: <database, a11y, api-performance...>

  最大 (maximum)  : 4 generic + 全 5 optional reviewer
                    包括的レビュー。エンタープライズ品質向け

  カスタム (custom) : 各 optional reviewer を個別に on/off
```

### 3.3 選択結果に応じた optional reviewer 配置

ユーザ選択 (default は "適切"):

- **最少**: 何もしない (Phase 2 で配置済 4 reviewer のみ)
- **適切**: 3.1 で推奨判定された optional のみ `.claude/agents/<name>.md` として配置
- **最大**: 全 5 optional を配置
- **カスタム**: 各 optional ごとに on/off の AskUserQuestion を続けて、選択された optional のみ配置

各 optional は `${CLAUDE_SKILL_DIR}/references/reviewers-optional/<name>-reviewer-body.md` を Read し、`.claude/agents/<name>-reviewer.md` として Write。

### 3.4 reviewers.yml registry 登録

採用した optional reviewer を `.specify/spec-gate/reviewers.yml` に entry として記録:

```yaml
reviewers:
  - name: <reviewer-name>
    enabled: true
    scope: feature | system | both
    auto_invoke_patterns:
      - <pattern, optional>
    gates: [code-gate, pr-gate]
    source: bootstrap-recommended | bootstrap-maximum | bootstrap-custom
```

`auto_invoke_patterns` は reviewer の性質から default 設定:
- database-reviewer: `**/migrations/**`, `*.sql`, `**/schema.prisma`
- a11y-reviewer / ux-reviewer: `**/*.tsx`, `**/*.jsx`, `**/*.vue`, `**/*.dart`, `**/*.html`
- api-performance-reviewer: `**/api/**`, `**/routes/**`, `**/controllers/**`
- openapi-contract-reviewer: `**/openapi.yaml`, `**/*.openapi.yaml`, `**/contracts/*.yaml`

## Phase 4: Wrapper 配置 (9 個、`{{prefix}}` 置換付き)

`${CLAUDE_SKILL_DIR}/references/wrappers/` 配下の 9 ファイル (spec / plan / tasks / design-gate / implement / code-gate / pr-gate / done / add-reviewer) を順に処理:

1. ファイル `<name>.md` を Read
2. 本文中の `{{prefix}}` placeholder を Phase 1 で確定した `$PREFIX` で置換
3. `.claude/skills/<prefix>-<name>/SKILL.md` として Write (parent dir は `mkdir -p`)
4. 既存があれば `--force` なしならば AskUserQuestion で上書き確認

## Phase 5: 補助ファイル配置

1. **docs templates**:
   - `${CLAUDE_SKILL_DIR}/references/docs-templates/*.md` → `.specify/templates/spec-gate/`
   - `mkdir -p .specify/templates/spec-gate/`
2. **memory templates merge** (`scripts/merge-memory.sh` 相当を Bash で実装):
   - `${CLAUDE_SKILL_DIR}/references/memory/AGENTS.md` → fence-marker (`<!-- BEGIN spec-gate -->` / `<!-- END spec-gate -->`) で `AGENTS.md` に追記。既存マーカーがあれば内部を replace
   - 同様に `CLAUDE.md` 処理
3. **lang resources**: `${CLAUDE_SKILL_DIR}/references/lang/*.json` → `.specify/templates/spec-gate/lang/`
4. **helper scripts** (`chmod +x` 付与):
   - `${CLAUDE_SKILL_DIR}/scripts/spec-resolve.sh` → `.specify/scripts/spec-resolve.sh`
   - `${CLAUDE_SKILL_DIR}/scripts/status-transition.sh` → `.specify/scripts/status-transition.sh`
   - `${CLAUDE_SKILL_DIR}/scripts/gate-common.sh` → `.specify/scripts/gate-common.sh` (NEW、Wave 0)
5. **registry files** (resolves C-1-b / C-5-b):
   - `${CLAUDE_SKILL_DIR}/references/agents-registry.template.yaml` → `.specify/.agents-registry.yaml`
   - `${CLAUDE_SKILL_DIR}/references/id-registry.template.json` → `.specify/.id-registry.json` (まだ無ければ)
6. **gate-common smoke test** (Phase 5 末尾):
   - `bash .specify/scripts/gate-common.sh version` が 1 を返すこと
   - `bash .specify/scripts/gate-common.sh registry-load` が agent name を 1 件以上返すこと

## Phase 6: Constitution scaffold 起草 (fence-marker aware、resolves E-3)

本 Phase は `BOOTSTRAP_SECTION` fence marker **の内側のみ** に書き込む。migrate Phase 4 (constitution-drafter) が後で `MIGRATE_SECTION` 側に書き込むため、両者は並存可能。

1. `${CLAUDE_SKILL_DIR}/references/docs-templates/constitution-template.md` を Read (fence markers 付き template)
2. `docs/discovery.md` を Read し、tech stack section を解析
3. tech stack に応じた Principle 候補を template の **`BOOTSTRAP_SECTION_START principle=I`** ... **`BOOTSTRAP_SECTION_END principle=I`** の内側に注入 (LLM が文章生成):

   | Stack 検出 | 起草する Principle (例) |
   |---|---|
   | FastAPI + SQLAlchemy | "BE layering = endpoints → service → repository, repository は ORM 直接公開を禁止" |
   | Vue 3 + Pinia | "FE separation = core (composables/types) / business (stores) / components" |
   | Flutter + Riverpod | "MVHR (Model / View / Handler / Riverpod). View は build メソッド外で provider を読まない" |
   | Next.js App Router | "Server / Client boundary = `'use client'` directive は最上位コンポーネントで 1 回のみ" |
   | Go + Chi/Echo | "Handler thin / Service fat / Repository に DB query 隔離" |
   | Django | "Model / View / Form の責務分離、business logic は services モジュールへ" |
   | Spring Boot | "@Controller → @Service → @Repository、@RestController は HTTP layer のみ" |
   | Common (どの stack でも) | "Secrets via environment variables, never hardcoded"<br>"Test coverage: endpoint / critical UI flow / business logic must have tests" |

4. 起草結果を `.specify/memory/constitution.draft.md` として Write、frontmatter:

   ```yaml
   ---
   status: draft
   needs-human-review: true
   generated_by: /spec-gate bootstrap
   generated_at: <ISO 8601>
   stack_detected: <要約>
   ---
   ```

5. 既存 `.specify/memory/constitution.md` (`status: active`) がある場合は draft を別 file にして既存を保護 (上書きしない)。**既存 draft が存在する場合は `.bak.<TS>` でバックアップを取った上で BOOTSTRAP_SECTION のみを置換** (MIGRATE_SECTION 内容は保全、R-11 対策)

## Phase 7: 残置 marker 検証

```bash
grep -rE '\{\{[a-z_]+\}\}' .claude/skills/${PREFIX}-* 2>/dev/null
```

1 件でも `{{...}}` marker が残っていれば halt + 報告 (Phase 4 の置換漏れを検出)。

## Phase 8: 完了 summary

```
✓ /spec-gate bootstrap 完了

  Prefix:        <$PREFIX>
  Wrappers (9):  /<prefix>-{spec,plan,tasks,design-gate,implement,code-gate,pr-gate,done,add-reviewer}
  Generic reviewer (4 + base): security, architecture, po, convention, reviewer-base
  Optional reviewer adopted: <list> (e.g., database, a11y, ...)
  Constitution scaffold: .specify/memory/constitution.draft.md (status: draft)
  Memory updated: AGENTS.md, CLAUDE.md

  次のアクション:
    Greenfield:
      1. docs/domains/<name>/charter.md を手動作成
         (template: .specify/templates/spec-gate/domain-charter-template.md)
      2. /speckit.constitution で constitution.draft.md を finalize
      3. /<prefix>-spec "[<domain>] <feature description>" で最初の feature を起案

    Brownfield:
      1. /spec-gate migrate を実行して Charter / Spec を逆生成
      2. その後 /speckit.constitution で finalize
      3. /spec-gate verify で品質検証

    導入後の検証 (両方共通):
      /spec-gate verify で構造 / 整合 / 過不足 / 開発 ready をチェック
```

## Idempotency

- 再実行時 (--force なし): AskUserQuestion で各 phase の上書き / merge / skip を選択
- prefix 変更時: 既存 `<old-prefix>-*` を rename or 並存させるか AskUserQuestion で確認
- Constitution は既存 `status: active` を尊重し、draft で上書きしない

## Failure modes

- `docs/discovery.md` 不在 → halt with `/spec-gate scan` 案内
- prefix validation 失敗 → AskUserQuestion で再入力
- `{{prefix}}` 残置検出 → halt + どのファイルに残置があるか報告
- file write 権限不足 → halt + 該当 path 表示
- subagent body の copy 失敗 → 該当 reviewer を skip + warning、続行

## Acceptance criteria

1. `.claude/skills/<prefix>-{spec,plan,tasks,design-gate,implement,code-gate,pr-gate,done,add-reviewer}/SKILL.md` が 9 個すべて存在
2. `.claude/agents/{reviewer-base, security-reviewer, architecture-reviewer, po-reviewer, convention-reviewer}.md` が 5 個存在
3. `.claude/agents/{implementer, lint-agent, test-agent}.md` が 3 個存在 (Wave 0 新規 actor、resolves C-1-a)
4. Phase 3 で採用した optional reviewer が `.claude/agents/` に追加配置されている
5. `.specify/memory/constitution.draft.md` が `status: draft` で存在 + BOOTSTRAP_SECTION / MIGRATE_SECTION fence markers が両方含まれる (既存 active がなければ)
6. `AGENTS.md` / `CLAUDE.md` に `<!-- BEGIN spec-gate -->` fence が 1 個ずつ存在
7. `.specify/spec-gate/reviewers.yml` registry が存在し、採用 reviewer の entry が記載
8. `.specify/.agents-registry.yaml` が存在し、18 agent (5 reviewer + 5 brownfield specialist + 3 actor + 5 optional) を列挙
9. `.specify/.id-registry.json` が存在 (bf_next: 1, sf_*_next: 1)
10. `.specify/scripts/{spec-resolve,status-transition,gate-common}.sh` が実行可能 (`-x`)
11. 全 wrapper SKILL.md 内に `{{prefix}}` placeholder が残っていない
12. `bash .specify/scripts/gate-common.sh version` が 1 を返す (smoke test)
