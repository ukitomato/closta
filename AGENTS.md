# Spec-Driven Gating Workflow

すべての feature 開発は以下の順序で行う。SKILL の一覧は `/help` または `.claude/skills/cl-*/SKILL.md` を参照。

```
/cl-design <description>    [main]    ─ Design フェーズを 1 コマンドで完走 (下の 4 つを連鎖)
  ├─ /cl-spec               [main]    ─→ specs/<NNN>-<domain>-<slug>/spec.md   (drafting)
  ├─ /cl-plan               [fork]    ─→ plan.md                                (drafting → planning)
  ├─ /cl-tasks              [fork]    ─→ tasks.md                               (planning → tasking)
  └─ /cl-design-gate        [fork:bg] ─[bundle review]
                                        Critical=0 で                           (tasking → implementing)
                                        FIX_REQUIRED なら implementing → tasking に降格
/cl-implement               [main]    ─→ section ごとに implementer [subagent] + code-gate へ auto-chain
/cl-code-gate               [fork:bg] ─[lint / test / convention + auto-fix loop]
                                        PASS で                                 (implementing → reviewing)
/cl-pr-gate                 [fork:bg] ─[adversarial review: multi-round]
                                        Critical=0 で done を許可
/cl-done                    [main]    ─→ PR 提出                                (reviewing → completed)
```

`[main]` = main の context で動く / `[fork]` = 同期の fork / `[fork:bg]` = background の fork / `[subagent]` = Agent ツールで起動する actor。規則は下の「実行モデル (context 管理)」。

夜間に人がいない状態で複数の spec を進めるときは `/cl-night <queue>` (夜) と `/cl-land` (朝) を使う。spec を 1 本の枝 `night/<date>` に push なしで積み、朝に 1 回 push して PR を 1 本作る。規則の正本は [`docs/ai-workflow/night-run.md`](docs/ai-workflow/night-run.md)。

個別に `/cl-spec` / `/cl-plan` / `/cl-tasks` / `/cl-design-gate` を叩くこともできる。
design-gate が FIX_REQUIRED なら status は `tasking` に留まる。`Agent(designer)` で修正したあと `/cl-design --spec-dir <dir> --from gate` で再開する。

新規 reviewer の追加には `/cl-add-reviewer` を使う。

## 実行モデル (context 管理)

本節が正本である。各 SKILL.md の「実行モデル」節はこれを参照する。

- **main の責務は人間との対話と連鎖の制御だけ。** 設計文書・ソース・reviewer 出力の本文を main で読まない。段の受け渡しはファイルで行う
- **fork する skill**:
  - `/cl-plan` / `/cl-tasks` — `agent: designer` の同期 fork
  - `/cl-design-gate` / `/cl-code-gate` / `/cl-pr-gate` — `agent: general-purpose` の background fork。同期の fork では、中で起動した reviewer の結果を受け取れない (fork が先に終わり、報告が main に流れる)。main は gate の完了通知が届いてから次の段に進む
- **戻り値は完了通知だけ。** fork と subagent は、最終メッセージに生出力・diff・findings 本文を含めない
- **reviewer にはパスだけを渡す。** spec・diff・前 round の findings の本文を prompt に貼らない。reviewer は自分で Read する定義で (`reviewer-base.md` の Tier-0)、貼ると並列の reviewer の数だけ同じ本文が重複する。diff は gate がファイルに書き出してパスで渡す (reviewer の多くは Bash を持たない)
- **段の間で確認を求めない。** 連鎖の途中で「進めてよければ…」と turn を終えず、次の段を呼ぶ。止まるのは人の判断が要るとき (AskUserQuestion) と、background の完了通知を待つときだけ
- **`AskUserQuestion` は main でしか使えない。** fork / subagent で判断が要るときは halt する。designer は `<spec_dir>/.needs-input.md` に質問を書いて `NEEDS_INPUT` を返し、`/cl-design` が main で聞く
- **actor は直列に動かす。** 同じ作業ツリーで implementer / designer を並列に起動しない (lint / test のキャッシュが互いに無効化される)。並列にしてよいのは read-only の reviewer だけ
- **作業は委譲し、規則は agent 側に置く。** 実装 → `implementer` の tasks モード、code-gate / pr-gate の指摘 → `implementer` の fix モード、design-gate の指摘 → `designer`。invoker が渡すのはモード名と入力だけで、規則や出力の形を prompt に書かない (正本は各 agent ファイル)
- **fork の中で入力を待つ Bash を書かない。** `cat > file <<EOF` は終端がずれると stdin を待って固まり、fork 内の停止は main から見えない。ファイルは Write で書く

## gate の原則

- **gate 失敗時は status を進めない。** Critical 指摘を解消してから再実行する
- **pr-gate は pure hard gate。** Critical を残したまま `/cl-done` に進む経路は存在しない
- **Medium / Low は直さない。** gate の出力に残し、マイルストーンの終わりの棚卸しで扱う (roadmap の原則)。roadmap や spec に 1 件ずつ転記しない。High はその round で直し、High を確かめるためだけの round は回さない ([AD-050](docs/decisions/0050-gate-finding-handling-and-round-limit.md))
- **design-gate と pr-gate は 3 round まで。** 3 round で Critical が残ったら止めて、人に判断を求める。code-gate の auto-fix loop の上限は別 (cl-code-gate)
- **gate を通ったかの判定は `gate_common::verdict_require_pass` が行う。**
  `verdict_validate` は schema 検査であり、`FIX_REQUIRED` を正当な verdict として exit 0 で通す。
  「次の段に進んでよいか」を `verdict_validate` で判定してはならない
- **AskUserQuestion gated 確定**: domain decomposition と Constitution Principle の採否は必ず人間が承認する
- **night モードの例外**: `/cl-night` の中 (各 skill に `--night` が付いたとき) だけ、上の承認と、NEEDS_INPUT / BLOCKED / gate の FIX_REQUIRED での停止を推奨案で進める。採った判断は台帳に残し、朝の `/cl-land` で人が確かめる。Critical を残して進む経路と 3 round の上限は night モードでも変わらない。詳細は `docs/ai-workflow/night-run.md`
- **自動推論の範囲**: `/cl-spec` は domain / targets を自動推論して自動採用する。domain が僅差のときだけ聞く。採用根拠は `domain_selected_by` / `targets_selected_by` として spec.md frontmatter に残る
- **reviewer の発火条件を skill 側に焼き込まない。** ただし正本は gate で分かれる:
  - **code-gate / pr-gate** — `gate_common::reviewers_filter` が `.specify/spec-gate/reviewers.yml` の `enabled` / `gates` / `auto_invoke_patterns` を適用する
  - **design-gate** — まだ diff が無く file glob が効かないため、`.specify/.agents-registry.yaml` の `invoked_by` で決まる。**reviewers.yml の `gates` は design-gate では読まれない**

## References

- Constitution: `.specify/memory/constitution.md` — プロジェクト全体の不変原則 (NON-NEGOTIABLE)
- Domain Charter: `docs/domains/<name>/charter.md` — 各 domain の mission / scope / User Journey / KPI
- Glossary: `docs/glossary.md` — Ubiquitous Language
- ADRs: `docs/decisions/` (MADR 4.0.0、accepted 後 immutable)
- Build / Test / Lint コマンド: `docs/discovery.md` の "Build / Test / Lint" 表

reviewer subagent はこれらを横断的に参照して drift 検出を行う。
