# /spec-gate migrate — subcommand body

> Loaded by `skills/spec-gate/SKILL.md` (dispatcher) when the first argument is `migrate`.

既存リポジトリを **Spec-Driven Gating Workflow** に乗せるための 5-phase orchestrator。各 phase で brownfield specialist subagent を clean-context で起動し、その出力を AskUserQuestion でユーザに承認させながら、最終的に `docs/discovery.md` / `docs/domains/<name>/charter.md` / `specs/rev-*/{spec,plan,tasks}.md` / `.specify/memory/constitution.draft.md` / `docs/glossary.md` を produce する。

## Wave 4 revisions (vs v0.1.0)

| 改善点 | 該当 defect |
|---|---|
| Phase 4 finalize で **NON-NEGOTIABLE Principle 採用時の Critical 違反件数 AskUserQuestion gate を必須化** | B-5 / C-7-d |
| Phase 間 snapshot (`.specify/.migrate-snapshots/phase-N-post/`) + `--rollback-to <N>` | C-7-c |
| discovery quality floor で **"do not migrate" exit hatch** | C-7-b |
| `.migrate-progress.json` を **live update** (`--mark-done <action-id>`) | B-9 medium |
| 各 phase に `input_sha` / `output_artifacts[].sha` | B-9 low |
| Phase 0 で `.specify/.id-registry.json` を install (spec-reverser が使う) | C-5-b |

## When to invoke

- Brownfield repo に Spec-Driven Gating Workflow を **初導入** する 1 回目
- 一部 domain だけ追加で migrate する時 (`--domains <list>`)
- 中断後の再開 (`--resume-from <phase>`)
- 失敗 phase の rollback (`--rollback-to <N>`)

Greenfield (新規 repo) では本 skill は不要。`/{{prefix}}-spec` から直接開始可能。

## Inputs / Flags

| Flag | 効果 |
|---|---|
| (none) | Phase 1-5 全実行 |
| `--no-reverse` | Phase 3 (Spec Reverse) を skip |
| `--no-constitution` | Phase 4 (Constitution Draft) を skip |
| `--domains a,b,c` | 指定した domain だけ Phase 2-3 を実行 |
| `--resume-from <N>` | Phase N から再開 (1-5) |
| `--rollback-to <N>` | Phase N+1 以降の artifact + progress を破棄、Phase N 完了時点に戻す (resolves C-7-c) |
| `--mark-done <action-id>` | `.migrate-progress.json` の next_actions[id] を `status: done` に更新 (resolves B-9 medium) |
| `--force` | 既存 `docs/discovery.md` 等を上書き |
| `--quality-floor <N>` (default 3) | discovery quality score の最低閾値、未満で abort 推奨 (resolves C-7-b) |

## Steps

### Phase 0: Preconditions + SubAgent 配置 + registry install

1. `.specify/` ディレクトリ存在を確認 (なければ "Run `specify init` first" で halt)
2. `.claude/skills/<existing-prefix>-spec/` 存在を確認 (なければ "/spec-gate bootstrap を先に実行してください" で halt)
3. **brownfield specialist SubAgent を `.claude/agents/` に Write** (bootstrap で配置されていない 5 agents を補完):
   - `discovery-scanner.md`, `charter-drafter.md`, `spec-reverser.md`, `constitution-drafter.md`, `glossary-extractor.md`
   - `reviewer-base.md` (bootstrap 配置済の想定、無ければ Write)
4. **agents registry validation**:
   ```bash
   source .specify/scripts/gate-common.sh
   gate_common::registry_assert_agent discovery-scanner || halt
   gate_common::registry_assert_agent charter-drafter || halt
   gate_common::registry_assert_agent spec-reverser || halt
   gate_common::registry_assert_agent constitution-drafter || halt
   gate_common::registry_assert_agent glossary-extractor || halt
   ```
5. **ID registry install** (resolves C-5-b):
   - `.specify/.id-registry.json` が無ければ `${CLAUDE_SKILL_DIR}/references/id-registry.template.json` から install
6. **`.specify/.migrate-snapshots/`** ディレクトリを `mkdir -p` (Phase rollback 用)
7. `.git/` がない場合は warning (commit history が読めないため Phase 1, 3 で機能制限)
8. `--resume-from` 指定があれば該当 phase の前 phase 成果物が存在することを確認
9. `--rollback-to <N>` 指定がある場合:
   - `.specify/.migrate-snapshots/phase-<N>-post/` を Read
   - Phase N+1 以降の artifact (`docs/glossary.md` / `.specify/memory/constitution.draft.md` 等) を削除
   - `.migrate-progress.json` の completed phases を切り詰め
   - 完了通知後 halt (実 migrate は別 invoke)

### Phase 1: Surface Scan + quality floor check

> Skip 条件: `--resume-from >= 2`

1. `discovery-scanner` subagent を Agent ツールで起動
2. tool result で受け取った draft を Read
3. **Quality floor check (resolves C-7-b)**:
   - draft の `## Project quality score` セクションを parse、`score` を取得
   - `score < --quality-floor (default 3)` なら AskUserQuestion で "Quality score (X/6) は migrate 推奨閾値未満です。続行しますか? (a) 続行 (b) abort"
   - abort 選択時は halt with "low quality 対応後に再 migrate を推奨"
4. **AskUserQuestion** で draft をユーザに提示し、承認 / 編集 / 拒否を選択
5. 承認後 `docs/discovery.md` を Write
6. **Snapshot**: `cp docs/discovery.md .specify/.migrate-snapshots/phase-1-post/discovery.md`
7. **Progress 更新**: `.specify/.migrate-progress.json` に Phase 1 完了 entry を append + `input_sha` / `output_artifacts[].sha` 計算
8. 完了通知: "Phase 1 完了。検出 tech stack: <list>。次に進みます (Phase 2)"

### Phase 2: Domain Charter Reverse

> Skip 条件: `--resume-from >= 3`

1. `charter-drafter` subagent を Agent ツールで起動 (context: Phase 1 の `docs/discovery.md`)
2. proposed domains 一覧を確認、各 domain の **precedence tie-break 結果** を Read (charter-drafter が "tie-break needed" でマーク)
3. **precedence disagree → mandatory AskUserQuestion** (resolves C-5-c):
   - 各 disagree domain で 候補境界 (dir / URL / DB) を提示、ユーザが採用境界を選ぶ
4. **各 domain について AskUserQuestion**:
   - "domain `<name>` を採用するか? (yes / modify name / merge / discard)"
   - "in/out scope の境界は妥当か?"
   - "業務ルール (3-tag) の妥当性"
5. **各 CDI について `owner: undecided` のもののみ AskUserQuestion**: owner を確定
6. 承認後 `docs/domains/<name>/charter.md` を Write (status: needs-human-review)
7. `docs/domains/_overview.md` に cross-domain invariants (owner 確定済) を draft
8. **Snapshot**: `cp -r docs/domains/ .specify/.migrate-snapshots/phase-2-post/`
9. **Progress 更新**
10. 完了通知

### Phase 3: Spec Reverse

> Skip 条件: `--no-reverse` または `--resume-from >= 4`

1. 各 confirmed domain について feature 単位で `spec-reverser` を起動
2. invoker が feature の bounding box を渡す
3. `spec-reverser` が spec/plan/tasks draft + ID candidates を返す
4. **ID registry atomic update** (resolves C-5-b):
   - `.specify/.id-registry.json` を Read
   - spec-reverser の `bf_ids candidate` 件数だけ `bf_next` を increment、allocated map に entry 追加
   - atomic write back (`flock` 経由)
5. **各 feature ごとに AskUserQuestion**:
   - "domain 帰属で正しいか?"
   - "confidence: <level> 判定は妥当か?"
   - "観察 vs aspiration の区別は正しいか?"
   - "Open Questions の priority マーキングは妥当か?"
6. 承認後 `specs/rev-<NNN>-<DOMSHORT>-<feature-slug>/{spec,plan,tasks}.md` を Write
7. **rev-001 dual-path conflict 等の cross-cutting issue は当 Phase で AskUserQuestion で resolution を取る** (R-13 carry-over 対策)
8. **Snapshot**: `cp -r specs/rev-* .specify/.migrate-snapshots/phase-3-post/`
9. **Progress 更新** (confidence 集計: high N / medium N / low N)
10. 完了通知

### Phase 4: Constitution Draft (Principle 採用 gate、resolves B-5 / C-7-d)

> Skip 条件: `--no-constitution` または `--resume-from >= 5`

1. `constitution-drafter` subagent を起動 (context: discovery + charters + **`confidence: high` の reverse spec のみ**)
2. tool result で Principle 案 + **`Existing violations summary` table** + adoption metadata を受け取る
3. 既存 `.specify/memory/constitution.draft.md` が存在:
   - bootstrap-generated (BOOTSTRAP_SECTION のみ含む) → `.bak.<TS>` 保存後、MIGRATE_SECTION を additive merge
   - 既存 MIGRATE_SECTION あり → AskUserQuestion で "上書き / merge / skip"
4. **各 Principle ごとに AskUserQuestion** (resolves B-5 / C-7-d):

   NON-NEGOTIABLE Principle で `existing_violations > 0` のとき以下を必ず提示:

   > "Principle <I> ("<name>") を採用すると **<X> 件** の既存 Critical 違反が発生します。
   >  bad_pattern_grep: `<query>`
   >  Paths (top 5): <list>
   >
   >  選択肢:
   >    (a) 採用し違反は別 spec で順次解消 → `.specify/deferred-violations.md` に list
   >    (b) スコープ縮小 (Standard / "should" 形式に降格)
   >    (c) 採用 skip
   >    (d) 後で検討 (status: pending-review として draft に残す)
   >    (e) 違反一覧を `.specify/deferred-violations.md` として保存 + 採用 (a と等価)"

   通常 Principle / `existing_violations == 0` の NON-NEGOTIABLE は単純な yes/no AskUserQuestion。

5. 承認した Principle のみで `.specify/memory/constitution.draft.md` の MIGRATE_SECTION 内容を Write
6. `## Existing violations summary` table を MIGRATE_SECTION_START existing-violations-summary fence 内に挿入
7. (a)/(e) 選択時は `.specify/deferred-violations.md` を生成
8. **Snapshot**: `cp .specify/memory/constitution.draft.md .specify/.migrate-snapshots/phase-4-post/`
9. **Progress 更新**: 採用 Principle 数 + 違反 enumeration 結果を記録
10. 完了通知

### Phase 5: Glossary Extraction

> Skip 条件: なし

1. `glossary-extractor` subagent を起動
2. tool result で Canonical / Candidate / Synonyms / Polysemy / Open Questions を受け取る
3. **Open Questions ratio > 30% → warning emit** (resolves B-2 high):
   > "Glossary draft has X% open questions, exceeding 30% threshold. Recommend human review before accepting as SSoT."
4. **同義異語 / 多言語混在の各 group ごとに AskUserQuestion**
5. **Polysemy group は AskUserQuestion で「意図的層別命名か?」を確認** (B-2 high の Rating/review 問題回避)
6. 既存 `docs/glossary.md` があれば差分のみ追記、なければ新規 Write
7. **Snapshot**: `cp docs/glossary.md .specify/.migrate-snapshots/phase-5-post/`
8. **Progress 更新**
9. 完了通知

### Phase 6: Final summary + verify 推奨

```
✓ /spec-gate migrate 完了

  Phase 1 (Scan): docs/discovery.md (quality score: <N>/6)
  Phase 2 (Charter): docs/domains/<list>/charter.md (<N> domains, <K> CDIs)
  Phase 3 (Spec Reverse): specs/rev-*/{spec,plan,tasks}.md (<N> features)
                          confidence: high=<H> medium=<M> low=<L>
  Phase 4 (Constitution): .specify/memory/constitution.draft.md
                          - Principle adopted: <list>
                          - Existing violations summary: <X> entries
                          - Deferred violations: .specify/deferred-violations.md (if any)
  Phase 5 (Glossary): docs/glossary.md
                      - Canonical: <C>, Candidate: <P>, Open Questions ratio: <%>

  次のアクション (.migrate-progress.json の next_actions[] に live update 可能):
    1. /spec-gate verify --strict で品質検証 (必須推奨)
    2. 全 charter を人間レビューして status を active に
    3. constitution.draft.md を /speckit.constitution で finalize
    4. Reverse spec (specs/rev-*/) の `status: migrated, needs_human_review: true` を順次レビュー
    5. 新規 feature 開発時は /<prefix>-spec から開始
  
  Progress 確認: cat .specify/.migrate-progress.json
  Action 完了報告: /spec-gate migrate --mark-done <action-id>
```

## `.migrate-progress.json` schema (live updatable、resolves B-9)

```json
{
  "version": 2,
  "started_at": "<ISO>",
  "phases": [
    {
      "phase": 1,
      "name": "Surface Scan",
      "status": "completed",
      "started_at": "<ISO>",
      "completed_at": "<ISO>",
      "input_sha": "<sha256 of discovery-scanner input context>",
      "output_artifacts": [
        {"path": "docs/discovery.md", "sha": "<git blob sha>"}
      ]
    },
    {...}
  ],
  "next_actions": [
    {
      "id": "verify",
      "label": "/spec-gate verify --strict で品質検証",
      "status": "pending|in-progress|done",
      "priority": "blocking"
    },
    {
      "id": "review-charter",
      "label": "全 charter (14) を人間レビュー → status を active に",
      "status": "pending",
      "priority": "blocking",
      "items_done": 0,
      "items_total": 14
    }
  ]
}
```

`--mark-done <action-id>` で `next_actions[id].status = "done"` に更新可能 (resolves B-9 medium)。

## Idempotency + rollback

- 各 phase 完了後に `.specify/.migrate-snapshots/phase-<N>-post/` に成果物 snapshot
- `--resume-from <N>`: Phase N から再開、それ以前は再利用
- `--rollback-to <N>`: Phase N+1 以降の artifact + progress を破棄
- `--force` で全 phase の確認 prompt を skip

## Failure modes

- subagent timeout → 分割して再起動を AskUserQuestion で提案
- Quality score < threshold → abort 推奨 (resolves C-7-b)
- AskUserQuestion でユーザが domain を 0 件承認 → halt
- spec-reverser の confidence が Low ばかり → AskUserQuestion で "Phase 3 を skip しますか?"
- Phase 4 で全 Principle が `existing_violations > 0` → AskUserQuestion gate で個別判断
- agent registry validation 失敗 → halt with bootstrap 再実行案内

## Acceptance criteria

各 phase 完了時:

1. Phase 1: `docs/discovery.md` 存在、tech stack section に少なくとも 1 件、quality score >= threshold
2. Phase 2: `docs/domains/<name>/charter.md` が少なくとも 1 件、各 charter に Mission / Scope / 業務ルール section が **最小 5 行** floor、全 CDI に `owner:` 必須
3. Phase 3 (skip でなければ): `specs/rev-*/spec.md` が 1 件以上、frontmatter `status: migrated`, `story_type: observed`, `confidence: low|medium|high`, `bf_ids`, `sf_ids` (registry 経由で global unique)
4. Phase 4 (skip でなければ): `.specify/memory/constitution.draft.md` 存在、Principle が 1 件以上、各 NON-NEGOTIABLE Principle に adoption metadata + existing_violations 集計が含まれる
5. Phase 5: `docs/glossary.md` 存在、`## Canonical Terms` と `## Candidate Terms (要 verification)` が別 section、`## Synonyms` と `## Polysemy` が別表
6. `.specify/.migrate-progress.json` v2 schema (next_actions[] が object 形式) + 各 phase に input_sha / output_artifacts[].sha
7. `.specify/.migrate-snapshots/phase-<N>-post/` が 5 phase 分存在
8. `.specify/.id-registry.json` が install 済 + spec-reverser の使用後 allocated map が更新されている
9. `(推定)` マーカーが全 artifact に 0 件
