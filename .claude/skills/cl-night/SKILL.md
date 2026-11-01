---
name: cl-night
description: 夜間の自走。キューの spec を 1 本の枝 night/<date> に順に積み、design → implement → code-gate → pr-gate → cl-done --night を push なしで連鎖する。再開位置は台帳 .specify/night/<date>.md の最終行から決まる。
argument-hint: <spec 名 / roadmap ID を空白区切りで> | --resume
allowed-tools: Read Write Edit Bash Glob Grep Agent Skill SendMessage
---

# cl-night

夜間に人がいない状態で、キューの spec を連続で進める。**規則の正本は `docs/ai-workflow/night-run.md`** — 枝の切り方、呼ばないコマンド、判断の扱い、台帳の形、止める条件はそちらに従う。本ファイルは連鎖の手順だけを書く。

本 skill は main で動く。各段の動き方は AGENTS.md の「実行モデル」のとおり (fork / subagent の本文を main で読まない)。

## 入力

- `<queue>`: spec 名 (`specs/<dir>` の dir、`--spec-dir` で再開する既存 spec) か roadmap の ID (`X-7` など。新規の `/cl-design` になる)。左から順に処理する
- `--resume`: `.specify/night/current` の台帳から再開する。引数なしで起動したときも同じ

## Phase 0: 台帳の用意 (冪等)

1. `.specify/night/current` があれば、そこに書かれた台帳を開き Phase 1 へ (再開)
2. 無ければ新しい夜を始める (1 回の bash で):
   ```bash
   d=$(date +%Y-%m-%d)
   git fetch origin main
   git switch -c "night/$d" origin/main
   mkdir -p .specify/night
   echo ".specify/night/$d.md" > .specify/night/current
   ```
   作業ツリーに未コミットの変更があれば枝を切らずに止める (`.vitest/` のような gitignore 済みのものは除く)
3. 台帳を night-run.md の形で書く (branch / base / queue)

## Phase 1: 再開位置を決める

台帳の `## log` の最終行で決める。`STOP` なら何もせず終了する (夜は終わっている)。

| 最終行 | 次にやること |
|---|---|
| (log 無し) | キューの先頭の spec を始める |
| `<spec> done` | キューの次の spec を始める。無ければ `STOP queue-empty` |
| それ以外 | その spec の段を、spec.md の status から再開する (下の表) |

| spec.md の status | 再開の段 |
|---|---|
| (spec 無し) | `/cl-design <roadmap 行>` |
| drafting / planning / tasking | `/cl-design --spec-dir <dir> --from <plan / tasks / gate> --night` |
| implementing | `/cl-implement <dir> --night` (完了済みの section は skip される) |
| reviewing で `.gate-verdict-pr.json` が無いか FIX_REQUIRED | Phase 3 の pr-gate から |
| reviewing で pr-gate PASS | `/cl-done <dir> --night` |

spec を始めるときは、台帳に `## <spec_dir>` の節と `start: <git rev-parse HEAD>` を書いてから最初の段を呼ぶ。

## Phase 2: design → implement

1. `/cl-design ... --night` — NEEDS_INPUT と design-gate FIX_REQUIRED は cl-design が night モードで自動処理する。それでも halt したら Phase 4
2. design-gate PASS の後、設計の成果物を commit する (`docs(<domain>): design <ID>`。push しない)
3. `/cl-implement <dir> --night` — code-gate まで auto-chain する。code-gate の完了通知を待つ

## Phase 3: pr-gate (3 round まで)

1. `/cl-pr-gate <dir> --base <台帳の start>` を起動し、完了通知を待つ
2. verdict で分岐する:
   - PASS で High 0 → 4 へ
   - PASS で High > 0、または FIX_REQUIRED → `Agent(implementer)` を `mode: fix` / `spec_dir` / `round` / `<spec_dir>/pr-gate.md` / finding ID (Critical と High) で起動 → `/cl-code-gate <dir> --base <start>` → 変更を commit → FIX_REQUIRED だったときだけ次の round の pr-gate。High を確かめるためだけの round は回さない (AD-050)
   - Round 3 で Critical が残る → Phase 4 (`STOP gate-round-limit`)
3. implementer が BLOCKED を返したら、推奨案があれば採って台帳の「判断」に書き、もう一度 fix を起動する。無ければ Phase 4
4. `/cl-done <dir> --night` — commit と台帳の `end:` までを行う。台帳の log に `<spec> done` を書き、Phase 1 に戻る

## Phase 4: 止める

night-run.md の「夜を終える条件」に当たったら、台帳の log に `STOP <理由>` を書き、その spec の節に理由と、朝に人が決めることを 1〜3 行で書いて終了する。失敗した spec の上に次の spec を積まない。

## 進め方の規則

- **段の間で turn を終えない。** 待つのは background の完了通知だけで、それ以外で利用者に「進めてよいか」を聞かない (誰もいない)
- 段を 1 つ終えるたびに台帳の log に 1 行書く (`<HH:MM> <spec> <段> <結果>`)。再開はこの行だけを頼りにする
- night-run.md の「夜に呼ばないもの」を呼ばない。commit は単独のコマンドで行い、他と `&&` でつながない
- 判断を推奨案で採ったら、その場で台帳の「判断」に書く (後でまとめて書かない — 途中で止まると失われる)
- `/loop` から呼ばれたときも同じ手順で動く。Phase 0 と Phase 1 が冪等なので、何度呼ばれても続きから進む

## 完了通知

```
✓ /cl-night <進行中 | 終了>
  - ledger: .specify/night/<date>.md
  - done: <spec, ...>
  - stop: <理由 | なし>
  - 朝: /cl-land
```
