---
name: cl-plan
description: spec.md から plan.md を起草する。Domain Context (charter + 関連 ADR + glossary 抜粋) を auto-fill し、status を drafting → planning に遷移させる。
argument-hint: [spec_dir] [--force]
allowed-tools: Read Write Edit Bash Glob Grep
context: fork
agent: designer
background: false
---

# cl-plan

spec.md から plan.md を起草する。`/speckit.plan` を内部委譲しつつ、本 wrapper は以下を担当する:

- **spec_dir 解決** — 引数 or 現在 branch 名から spec ディレクトリを特定
- **Domain Context auto-fill** — `docs/domains/<domain>/charter.md` の Mission/Scope/業務ルール、関連 ADR (`docs/decisions/`)、`docs/glossary.md` の関連用語を plan.md の "Domain Context" section に注入
- **Status 遷移** — `drafting → planning`

## 実行モデル

- 本 skill は `designer` agent の fork で動く。呼び出し元の会話は見えず、入力は引数とファイルだけである
- **人間には質問できない。** 判断が要る点は designer の規則どおり `<spec_dir>/.needs-input.md` に書き、`NEEDS_INPUT` で返す
- **最終メッセージは Phase 6 の完了通知 (または halt 理由) だけにする**

## When to invoke

- `/cl-spec` で spec.md を起草した直後
- `spec.md` の `[NEEDS CLARIFICATION]` がすべて解消された後 (clarify 未完了でも実行可能だが warning)

## Inputs

- `<spec_dir>` (optional): 対象 spec のディレクトリ (例: `specs/001-auth-login/` または `specs/2026-05-17-1030-AUT-login/`)
  - 省略時は `.specify/scripts/spec-resolve.sh` で現在 branch 名から推定 (`feature/<spec_id>` パターン)
- `--force` (optional): status が `tasking` 以降でも plan.md を再生成する (tasks.md を削除する)

## Steps

### Phase 0: spec_dir resolution

1. 引数があればそれを使用、なければ `bash .specify/scripts/spec-resolve.sh` で branch 名から spec_id を抽出
2. `<spec_dir>/spec.md` が存在することを確認 (なければ halt)
3. frontmatter から `spec_id`, `domain`, `targets`, `status` を読み取る
4. `status` の扱い:
   - `drafting` → 正常、そのまま続行
   - `planning` → plan.md を **自動上書き** し、完了通知に `[warn: plan.md re-generated]` を記録する
   - `tasking` 以降 → tasks.md が無効化される副作用がある:
     - `--force` なし → halt with "plan.md を再生成すると tasks.md が stale になります。tasks.md も削除して再生成するなら --force を付けて再実行してください"
     - `--force` あり → tasks.md を削除してから plan.md を上書きし、status を `planning` に降格させる

### Phase 1: Domain Context 素材を収集

1. **Charter**: `docs/domains/<domain>/charter.md` を Read
   - Mission, Scope, User Journey の見出しと冒頭段落を抽出
2. **関連 ADR**: `docs/decisions/` 配下を Glob し、frontmatter `affected_domains:` または `tags:` に当該 domain が含まれるものを Grep で抽出
   - Title, status (accepted/proposed/superseded), 1 文サマリを収集
3. **Glossary**: `docs/glossary.md` を Read し、spec.md 本文中に出現する用語に絞って抜粋
4. **上流からの申し送りの棚卸し (必須)**: 本 feature を名指している上流の記述を
   **grep で機械的に洗い出す**。人手の棚卸しは漏れる。

   ```bash
   # **`spec_id` である。`feature_id` という frontmatter key は存在しない。**
   # 空文字のまま grep すると全行がヒットし、棚卸しをしたつもりで何も見ていない状態になる。
   spec_id=$(awk '/^spec_id:/{print $2}' "<spec_dir>/spec.md")
   [ -n "$spec_id" ] || { echo "spec_id を frontmatter から取得できません"; exit 2; }
   grep -rn "$spec_id" docs/ .specify/ tests/ specs/ --include='*.md' --include='*.mjs' --include='*.js' --include='*.yaml' --include='*.yml'
   ```

   加えて、本 feature が**新設する主要モジュール名**でも grep する。
   `.dependency-cruiser.js` / `eslint.config.mjs` / `scripts/constitution/allowlists.mjs` は
   **実名リスト方式のルールを持ち、新しいモジュールを作る feature に追加義務を課している**
   ことがあるため、必ず対象に含める。

   ヒット全件を plan の「上流からの申し送り」節に列挙する。「該当なし」と判断したものも
   理由つきで残す (記録形式は Acceptance criteria #5)。

step 1-3 はすべて missing でも続行可能 (warning 表示)。**step 4 は skip しない。**

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
✓ /cl-plan 完了
  - spec dir: <spec_dir>
  - plan.md: 生成 + Domain Context 注入
  - status: drafting → planning
  - 次のアクション: /cl-tasks <spec_dir>
```

## Idempotency

- status=planning で既存 plan.md がある場合: 自動上書き (完了通知に warn 記録)
- status=tasking 以降: `--force` があれば tasks.md 削除 + plan.md 再生成、なければ halt
- Domain Context section が既に埋まっている場合: 上書きせず差分のみ追加 (Edit で diff merge)

## Failure modes

- spec.md が存在しない → halt with "`/cl-spec` を先に実行してください"
- Charter missing → warning 表示後 placeholder のみで続行
- ADR fetch 失敗 → "Related ADRs" を空セクションで埋めて続行
- `/speckit.plan` delegation 失敗 → エラーメッセージ + status は変更しない

## Acceptance criteria

1. `<spec_dir>/plan.md` が存在
2. plan.md に "Domain Context" section が存在し、Charter reference が記載されている
3. spec.md frontmatter の `status` が `planning` に更新されている
4. `[NEEDS CLARIFICATION]` placeholder が plan.md に残っていない (LLM が assumption で埋めることは禁止)
5. **Phase 1 step 4 の grep を実行し、ヒット全件に処理を割り当てた節が plan.md にある。**
   実行したコマンドと総ヒット件数を節の冒頭に記す (後から再現できる形にする)
