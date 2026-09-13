---
name: cl-design
description: Design フェーズ全体を 1 コマンドで完走するラッパー。`/cl-spec` → `/cl-plan` → `/cl-tasks` → `/cl-design-gate` を自動チェーンし、design-gate PASS で status を implementing に昇格して終了する。手動起動のみ。
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep Agent AskUserQuestion
---

# cl-design

Design フェーズ (spec → plan → tasks → design-gate) を **1 コマンドで完走**するラッパー。
各ステップは既存スキルに委譲し、本 wrapper は **チェーンと状態管理**のみを担う。

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
   no の場合は halt する

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
/cl-plan <spec_dir>
```

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

- design-gate が **PASS** → Phase 5 へ
- design-gate が **FIX_REQUIRED** → 完了通知を表示して **halt**:
  ```
  ✗ /cl-design Design Gate FIX_REQUIRED
    - critical: <N> 件
    - design-gate.md を確認し、Critical 指摘を修正後:
      /cl-design --spec-dir <spec_dir> --from gate
  ```
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
  - 次のアクション: /cl-implement <spec_dir>
```

## Idempotency

- `--from plan|tasks|gate` で中断後の再開が可能
- 各ステップは既存スキルの idempotency に依存 (plan/tasks は自動上書き)

## Failure modes

- `<description>` も `--spec-dir` も未指定 → halt + 使い方を提示
- `/cl-spec` で domain 確定に AskUserQuestion が必要 → そこで一時停止、回答後に自動再開
- `/cl-design-gate` FIX_REQUIRED → halt。再開は `--from gate`
- いずれかのステップで status 遷移が確認できない → halt with "前ステップが完了していません"

## Acceptance criteria

1. `--from` なしで実行した場合、spec.md / plan.md / tasks.md / design-gate.md がすべて生成されている
2. spec.md frontmatter `status` が `implementing` に遷移している
3. `<spec_dir>/.gate-verdict-design.json` の verdict が `PASS`
4. design-gate FIX_REQUIRED 時は status が `tasking` のまま
5. 完了通知に auto-resolved 項目 (domain / targets / assumed) がすべて列挙されている
