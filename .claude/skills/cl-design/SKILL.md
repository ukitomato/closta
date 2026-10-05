---
name: cl-design
description: Design フェーズ全体を 1 コマンドで完走する。`/cl-spec` → `/cl-plan` → `/cl-tasks` → `/cl-design-gate` を自動チェーンし、design-gate PASS で status を implementing に昇格する。
argument-hint: <description>
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# cl-design

Design フェーズ (spec → plan → tasks → design-gate) を **1 コマンドで完走**するラッパー。
各ステップは既存スキルに委譲し、本 wrapper は **チェーンと状態管理**のみを担う。

本 skill は main で動く。`/cl-plan` / `/cl-tasks` は designer の fork、`/cl-design-gate` は background の fork で動き、main に戻るのは各段の完了通知だけである。**本 skill が plan.md / tasks.md / reviewer 出力の本文を Read してはならない** — 分岐に要るのは完了通知と verdict JSON だけで、本文を読むと fork にした意味がなくなる。

## When to invoke

- 新規 feature の設計を最初から一気に通したいとき
- `/cl-spec` → `/cl-plan` → `/cl-tasks` → `/cl-design-gate` を個別に叩くのを省略したいとき

## Inputs

- `<description>`: 自然言語の feature 説明 (必須)
- `--domain <name>` (optional): domain 確定を skip
- `--targets frontend|backend|both` (optional): targets 確定を skip
- `--spec-dir <dir>` (optional): 既存 spec を再利用して plan 以降から開始
- `--from plan|tasks|gate` (optional): チェーンの開始ステップを指定 (`--spec-dir` 必須)

`<description>` と `--spec-dir` の同時指定は禁止 (halt)。

## Steps

### Phase 0: 引数検証

1. `<description>` または `--spec-dir` のいずれか一方のみを確認
2. `--from` 指定がある場合は `--spec-dir` の存在を確認
3. `.specify/` ディレクトリ + git repo の存在を `gate_common::phase0_check_repo` で確認
4. **`--from plan` かつ spec.md の status が `tasking` 以降** の場合、**AskUserQuestion** で確認する:
   「plan.md を再生成すると tasks.md が stale になります。tasks.md も同時に削除して再生成しますか? (yes=両方再生成 / no=abort)」
   yes の場合は Phase 2 の `/cl-plan` に `--force` を渡す (fork の `/cl-plan` は人間に聞けないため、確認はここで済ませる)。no の場合は halt する

### 各段の共通処理: NEEDS_INPUT

`/cl-plan` / `/cl-tasks` は人間に質問できない。各段のあとに `<spec_dir>/.needs-input.md` があれば (完了通知が `NEEDS_INPUT:` 行のときも同じ) 次の順で処理する:

1. ファイルの各 Q を **AskUserQuestion** で利用者に聞く (選択肢はファイルに書かれたものを使う)
2. 回答を同じファイルの `回答:` 欄に書く
3. その段から連鎖を再開する (`--from <段>` と同じ)。designer は回答を反映し終えたらファイルを消す

### Phase 1: /cl-spec (description 指定時のみ)

`--spec-dir` 指定時はこのフェーズをスキップ。

```
/cl-spec <description> [--domain <name>] [--targets <enum>]
```

- 完了後、`spec_dir` を取得 (完了通知の "spec dir:" 行から抽出)
- `[auto-domain:]`, `[auto-targets:]`, `[ASSUMED:]` ラベルを収集してサマリに転記
- **AskUserQuestion が発生する可能性**: domain が僅差で複数候補の場合のみ

### Phase 2: /cl-plan

`--from tasks|gate` 指定時はスキップ。

```
/cl-plan <spec_dir> [--force]
```

- `--force` は Phase 0 step 4 で利用者が yes と答えたときだけ付ける
- status が `planning` に遷移したことを spec.md で確認してから次へ

### Phase 3: /cl-tasks

`--from gate` 指定時はスキップ。

```
/cl-tasks <spec_dir>
```

- status が `tasking` に遷移したことを確認してから次へ

### Phase 4: /cl-design-gate

前回 `<spec_dir>/design-gate.md` が存在する場合、`/cl-design-gate` はその Critical / High findings を引き継いで "resolved / unresolved / new" を追跡する (design-gate SKILL.md の Phase 1 context 引継ぎ規定に基づく)。

```
/cl-design-gate <spec_dir>
```

design-gate は background の fork で走る。起動したらターンを終え、完了通知が届いてから `<spec_dir>/.gate-verdict-design.json` の `verdict` で分岐する。

- design-gate が **PASS** → Phase 5 へ
- design-gate が **FIX_REQUIRED** → 完了通知を表示して **halt**:
  ```
  ✗ /cl-design Design Gate FIX_REQUIRED
    - critical: <N> 件 (<C-001, C-002, ...>)
    - 修正: Agent(designer) に <spec_dir>/design-gate.md と上の Critical ID を渡して直させる
    - 修正後: /cl-design --spec-dir <spec_dir> --from gate
  ```
  Critical ID は design-gate.md の `### C-NNN` 見出しを Grep で拾う (本文は読まない)
- design-gate が **ERROR** → 同様に halt

### Phase 5: 完了通知

```
✓ /cl-design 完了
  - spec dir: <spec_dir>
  - domain: <domain> [auto / user-selected]
  - targets: <targets> [auto / user-selected]
  - assumed clarifications: <N> 件
  - design-gate: PASS (critical=0)
  - status: implementing
  - 次のアクション: /clear してから /cl-implement <spec_dir>
```

実装は新しい context で始める (設計の対話を実装に持ち込まない)。引き継ぎはすべて spec_dir のファイルで足りる。

## Idempotency

- `--from plan|tasks|gate` で中断後の再開が可能
- 各ステップは既存スキルの idempotency に依存 (plan/tasks は自動上書き)

## Failure modes

- `<description>` も `--spec-dir` も未指定 → halt + 使い方を提示
- `/cl-spec` で domain 確定に AskUserQuestion が必要 → そこで一時停止、回答後に自動再開
- `/cl-plan` / `/cl-tasks` が `NEEDS_INPUT` → 上の「各段の共通処理」で質問し、その段から再開
- `/cl-design-gate` FIX_REQUIRED → halt。designer で修正後、再開は `--from gate`
- いずれかのステップで status 遷移が確認できない → halt with "前ステップが完了していません"

## Acceptance criteria

1. `--from` なしで実行した場合、spec.md / plan.md / tasks.md / design-gate.md がすべて生成されている
2. spec.md frontmatter `status` が `implementing` に遷移している
3. `<spec_dir>/.gate-verdict-design.json` の verdict が `PASS`
4. design-gate FIX_REQUIRED 時は status が `tasking` のまま
5. 完了通知に auto-resolved 項目 (domain / targets / assumed) がすべて列挙されている
