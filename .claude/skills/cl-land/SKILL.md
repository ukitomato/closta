---
name: cl-land
description: 夜間の自走の成果を朝に着地させる。台帳 .specify/night/<date>.md を要約し、night/<date> を push して PR を 1 本作り、マージ後に main で全 spec を completed にする。利用者がいるときだけ実行する。
argument-hint: [ledger path] | --after-merge
allowed-tools: Read Write Edit Bash Glob Grep AskUserQuestion
---

# cl-land

`/cl-night` が積んだ枝を 1 本の PR にする。規則の正本は `docs/ai-workflow/night-run.md` の「朝」の節。

## 入力

- `[ledger]`: 省略時は `.specify/night/current` が指す台帳
- `--after-merge`: PR がマージされた後の後始末 (Phase 3) だけを行う

## Phase 1: 要約

台帳を Read し、次の表を表示する (gate の出力の本文は読まない):

| spec | gate (design / code / pr) | 判断 (推奨案で採ったもの) | 未実施 | 状態 |
|---|---|---|---|---|

`STOP` があれば、その理由と「朝に人が決めること」を表の下に出す。`done` になっていない spec は PR に含めない — 枝の上で最後の `done` の `end:` より後ろに commit があれば、その扱い (別の枝に移すか、捨てるか) を **AskUserQuestion** で聞く。

## Phase 2: push と PR

1. 推奨案で採った判断を覆すものがあるかを **AskUserQuestion** で 1 回だけ聞く (選択肢: すべて採用 / 覆すものがある)。覆すものがあれば、どれをどう直すかを聞き、直す作業は別の PR にする (この PR には入れない)
2. `git push -u origin night/<date>` (単独のコマンドで)
3. `gh pr create --base main --head night/<date>`。本文は spec ごとの節:
   ```markdown
   ## Summary
   夜間の自走 <date>: <spec 数> 本

   ## <spec_dir> — <spec.md の title>
   - commits: <start>..<end>
   - gates: design PASS R<N> / code PASS iter<N> / pr PASS R<N> (Critical 0)
   - 判断 (推奨案): <台帳の判断>
   - 未実施 (実機): <台帳の未実施>

   ## Merge
   merge commit で入れる (squash にすると spec ごとの commit の境界が消える)
   ```
4. PR の URL を表示し、「マージしたら `/cl-land --after-merge`」と案内して終了する

## Phase 3: マージ後 (`--after-merge`)

1. `gh pr view <PR> --json state,mergeCommit` で merged を確かめる。merged でなければ止める
2. `git switch main` → `git pull --ff-only`
3. 台帳の `done` の spec ごとに `bash .specify/scripts/status-transition.sh --gate-transition <spec_dir> pr reviewing completed`
4. `docs(workflow): mark night <date> specs completed` で commit し、`git push`
5. `.specify/night/current` を消す (台帳は残す)

## 完了通知

```
✓ /cl-land <PR 作成 | 完了>
  - PR: <url>
  - specs: <N> 本 (<spec, ...>)
  - 次: <マージして /cl-land --after-merge | なし>
```
