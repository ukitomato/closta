# /spec-gate scan — subcommand body

> Loaded by `skills/spec-gate/SKILL.md` (dispatcher) when the first argument is `scan`.

このプロジェクトの **tech stack / monorepo 構造 / build/test/lint コマンド / CI 設定 / 既存 docs** を scan し、`docs/discovery.md` (Project Profile) を起草する。`/spec-gate bootstrap` の前提となる成果物を出力する。Brownfield repo では `/spec-gate migrate` の Phase 1 でも本 subcommand の出力が再利用される。

## Inputs

- `$ARGUMENTS` (subcommand 抜き残り): `--force` (既存 `docs/discovery.md` を上書き) のみ

## Phase 0: Preconditions

1. `.specify/` ディレクトリ存在を確認 (なければ halt with "Run `specify init` first")
2. cwd が project root であることを確認 (`.git/` または `package.json` 等の root marker 存在)
3. `${CLAUDE_SKILL_DIR}/references/subagents/discovery-scanner.md` が存在することを確認 (skill 自体の整合性チェック)
4. `docs/discovery.md` 既存判定:
   - 存在せず → 続行
   - 存在 + `--force` あり → 続行 (上書き予定)
   - 存在 + `--force` なし → AskUserQuestion で「上書き / 既存を保持して終了 / merge」を選択

## Phase 1: SubAgent 配置

`discovery-scanner` を `.claude/agents/` に Write:

1. `.claude/agents/` ディレクトリを `mkdir -p` で作成
2. `${CLAUDE_SKILL_DIR}/references/subagents/discovery-scanner.md` を Read
3. `.claude/agents/discovery-scanner.md` に Write (既存があれば上書き — `gh skill update` で content drift があれば反映される)
4. 同様に `${CLAUDE_SKILL_DIR}/references/subagents/reviewer-base.md` も Write (discovery-scanner は `reviewer-base.md` を Read する)

## Phase 2: discovery-scanner 起動

`Agent` ツールで `discovery-scanner` を invoke する。clean-context isolation を遵守 (dispatcher / 本 body の会話履歴を渡さない):

```
Agent tool invocation:
  subagent_type: "discovery-scanner"
  description: "Scan project tech stack and produce Project Profile draft"
  prompt: |
    Scan the project at the current working directory and produce a Project Profile draft
    according to your initialization instructions. Return the full draft in markdown,
    no commentary outside the draft itself.

    The draft will be written to docs/discovery.md by the invoker after user approval.
```

subagent 出力 (Project Profile draft) を tool result として受け取る。

## Phase 3: ユーザ承認 (AskUserQuestion)

draft をユーザに提示し、以下の選択肢を AskUserQuestion で確認:

- **採用**: そのまま `docs/discovery.md` に Write
- **編集**: ユーザがインラインで修正提案 (主にディレクトリ責務 / KPI 推定の修正)
- **再 scan**: 引数指定や手動 hint を加えて再起動
- **キャンセル**: 終了 (file は書かない)

採用 / 編集後の content には frontmatter:

```yaml
---
status: needs-human-review
generated_by: /spec-gate scan
generated_at: <ISO 8601>
---
```

を冒頭に付与する。

## Phase 4: 書き出し

`docs/discovery.md` に Write。既存があれば:

- `--force` 指定時: 既存を `docs/discovery.md.bak.<ts>` に退避してから上書き
- AskUserQuestion で merge 選択時: 既存と新 draft の diff を表示 + AskUserQuestion で各 section の採用を確認

## Phase 5: 完了通知

```
✓ /spec-gate scan 完了
  - 出力: docs/discovery.md (status: needs-human-review)
  - 検出 tech stack: <要約 1-2 行>
  - 次のアクション:
      1. docs/discovery.md を人間レビュー (特に推定セクション)
      2. レビュー完了後、/spec-gate bootstrap で workflow wrapper を配置
```

## Idempotency

- 再実行時に `--force` なしなら AskUserQuestion で上書き確認
- 既存 `docs/discovery.md` の `status: active` (手動レビュー済) を尊重 (上書き前に明示確認)

## Failure modes

- `.specify/` 不在 → halt with `specify init` 案内
- subagent 起動失敗 (timeout / model error) → retry 1 回、失敗時は halt
- 出力が空 / 極端に短い → AskUserQuestion で「再 scan / 手動入力 / halt」を選択
- file write 権限なし → halt + 案内

## Acceptance criteria

1. `docs/discovery.md` が存在し、`status: needs-human-review` frontmatter を持つ
2. ファイル内に "Tech Stack" / "Build / Test / Lint" / "Directory Map" の主要 section が含まれる
3. `.claude/agents/discovery-scanner.md` と `.claude/agents/reviewer-base.md` が存在する
4. discovery-scanner subagent が clean-context で起動された (dispatcher / 本 body の context が渡されていないことをログで確認可能)
