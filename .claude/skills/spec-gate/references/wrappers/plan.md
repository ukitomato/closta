---
name: {{prefix}}-plan
description: spec.md から plan.md を起草する wrapper。`/speckit.plan` を内部委譲しつつ、Domain Context (charter + 関連 ADR + glossary 抜粋) の auto-fill を本 wrapper が担当する。status は drafting → planning に遷移。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep AskUserQuestion
---

# {{prefix}}-plan

spec.md から plan.md を起草する。`/speckit.plan` を内部委譲しつつ、本 wrapper は以下を担当する:

- **spec_dir 解決** — 引数 or 現在 branch 名から spec ディレクトリを特定
- **Domain Context auto-fill** — `docs/domains/<domain>/charter.md` の Mission/Scope/業務ルール、関連 ADR (`docs/decisions/`)、`docs/glossary.md` の関連用語を plan.md の "Domain Context" section に注入
- **Status 遷移** — `drafting → planning`

## When to invoke

- `/{{prefix}}-spec` で spec.md を起草した直後
- `spec.md` の `[NEEDS CLARIFICATION]` がすべて解消された後 (clarify 未完了でも実行可能だが warning)

## Inputs

- `<spec_dir>` (optional): 対象 spec のディレクトリ (例: `specs/001-auth-login/` または `specs/2026-05-17-1030-AUT-login/`)
  - 省略時は `.specify/scripts/spec-resolve.sh` で現在 branch 名から推定 (`feature/<spec_id>` パターン)

## Steps

### Phase 0: spec_dir resolution

1. 引数があればそれを使用、なければ `bash .specify/scripts/spec-resolve.sh` で branch 名から spec_id を抽出
2. `<spec_dir>/spec.md` が存在することを確認 (なければ halt)
3. frontmatter から `spec_id`, `domain`, `targets`, `status` を読み取る
4. `status` が `drafting` 以外 (planning / tasking 等) なら AskUserQuestion で「既に進行済の plan.md を上書きしますか?」を確認

### Phase 1: Domain Context 素材を収集

1. **Charter**: `docs/domains/<domain>/charter.md` を Read
   - Mission, Scope, User Journey の見出しと冒頭段落を抽出
2. **関連 ADR**: `docs/decisions/` 配下を Glob し、frontmatter `affected_domains:` または `tags:` に当該 domain が含まれるものを Grep で抽出
   - Title, status (accepted/proposed/superseded), 1 文サマリを収集
3. **Glossary**: `docs/glossary.md` を Read し、spec.md 本文中に出現する用語に絞って抜粋

すべて missing でも続行可能 (warning 表示)。

### Phase 2: `/speckit.plan` delegation

`/speckit.plan <spec_dir>` を起動。SpecKit が `<spec_dir>/plan.md` を生成する。

### Phase 3: Domain Context section の auto-fill

生成された `plan.md` に "Domain Context" section が placeholder として存在することを確認。Edit で以下を注入:

```markdown
## Domain Context

### Charter reference
- Domain: `<domain>` ([docs/domains/<domain>/charter.md](../../docs/domains/<domain>/charter.md))
- Mission: <抽出した Mission 1 文>
- Scope: <Scope 抜粋>

### Related ADRs
- [ADR-XXXX](../../docs/decisions/XXXX-...md) — <title>: <status> — <1 文サマリ>
- ...

### Glossary excerpt
- **<term>**: <定義>
- ...
```

placeholder section が存在しない場合は、生成 plan.md の冒頭 (`# Plan` の直下) に挿入。

### Phase 4: Language / Style verification (warning only)

- 生成 plan.md の言語が `lang/<lang>.json` の想定に合うか軽くチェック (日本語/英語のミスマッチを grep ベースで検出)
- ミスマッチ時は warning として表示 (halt しない)

### Phase 5: Status 遷移

`spec.md` の frontmatter `status:` を `drafting` → `planning` に Edit。

### Phase 6: 完了通知

```
✓ /{{prefix}}-plan 完了
  - spec dir: <spec_dir>
  - plan.md: 生成 + Domain Context 注入
  - status: drafting → planning
  - 次のアクション: /{{prefix}}-tasks <spec_dir>
```

## Idempotency

- 既存 plan.md がある場合: `--force` 必須 or AskUserQuestion で確認
- Domain Context section が既に埋まっている場合: 上書きせず差分のみ追加 (Edit で diff merge)
- status が既に `planning` 以降: AskUserQuestion で確認

## Failure modes

- spec.md が存在しない → halt with "`/{{prefix}}-spec` を先に実行してください"
- Charter missing → warning 表示後 placeholder のみで続行
- ADR fetch 失敗 → "Related ADRs" を空セクションで埋めて続行
- `/speckit.plan` delegation 失敗 → エラーメッセージ + status は変更しない

## Acceptance criteria

1. `<spec_dir>/plan.md` が存在
2. plan.md に "Domain Context" section が存在し、Charter reference が記載されている
3. spec.md frontmatter の `status` が `planning` に更新されている
4. `[NEEDS CLARIFICATION]` placeholder が plan.md に残っていない (LLM が assumption で埋めることは禁止)
