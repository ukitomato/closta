# 夜間の自走 (night run)

夜間に人がいない状態で spec を連続して進めるときの規則。**本ファイルが正本である。** AGENTS.md・各 SKILL.md・memory はここを参照する。

入口は `/cl-night` (夜)、`/cl-land` (朝)。

## なぜこの形か

- 2026-10-16〜10-28 の 7 夜は、すべて `git push` / `git pull` / `gh pr merge` の権限確認で 00:44〜03:48 に止まり、朝まで 4〜7 時間待った。会社の managed policy がこれらを ask にしており、project / local の allow では上書きできない。迂回はしない
- そこで **夜は push しない**。spec を 1 本の枝に commit だけで積み、朝に 1 回 push して PR を 1 本作る

## 枝と積み方

- 夜の開始時に `git fetch origin main` してから `night/<YYYY-MM-DD>` を `origin/main` から 1 本切る (fetch は managed policy の ask に入っていない)
- キューの spec を **同じ枝に順に積む**。spec ごとに `/cl-design` → `/cl-implement` (→ code-gate → pr-gate) → `/cl-done --night`
- 依存先の spec が同じ枝で pr-gate PASS 済みなら、依存は満たされたとみなす。「依存先が main に入っていない design は起こさない」規則は、別の枝で前倒しした design がずれた教訓であり、同じ枝に直列で積む場合には当たらない
- 失敗した spec の上に次を積まない (後ろの spec が壊れた土台を前提にする)

## 夜に呼ばないもの

- `git push` / `git pull` / `git merge` / `git rebase` / `gh pr *` / `gh api` (書き込み)。`gh` は policy の ask に無いが、auto mode が外部への書き込みとして確認を出す
- `git commit … && git push` のような連結も禁止。push の確認で commit まで止まる
- 実機の項目 (実 claude の起動、Docker、WSL の操作、perf、画面の目視) は実行しない。quickstart-results.md に「未実施」と書いて進める。stub の E2E とビルドは実行してよい

## 判断の扱い

人の承認が要る判断 (ADR の accepted、spec の U-n、domain の分解、Constitution Principle の採否、designer の NEEDS_INPUT、implementer の BLOCKED) は **推奨案で採用して進む**。採った判断は台帳の「判断」欄に 1 行ずつ書き、朝に利用者が一覧で確かめる。覆すときは別の PR で直す。

推奨案が無い (選択肢が対等で、どれを採るかで spec の範囲が変わる) ときだけ、その spec を止める。

昼の対話中はこの節を根拠に承認を省かない。night モードは `/cl-night` の中だけで有効である。

## night モードで変わる skill の動き

各 skill は引数 `--night` でだけ night モードになる。`/cl-night` が各段に付けて呼ぶ。`.specify/night/current` の有無では判定しない (`/cl-land` 前の昼のセッションまで night モードになるため)。

| skill | 昼 | night モード |
|---|---|---|
| `/cl-design` | NEEDS_INPUT は AskUserQuestion。design-gate FIX_REQUIRED で halt | NEEDS_INPUT は推奨案を `回答:` に書いて再開。FIX_REQUIRED は designer で直して `--from gate` を自動で再実行 (3 round まで) |
| `/cl-implement` | BLOCKED で halt。checklist 未完了は確認 | BLOCKED は台帳に書き、残りの section を続ける。checklist 未完了は台帳に書いて続ける |
| `/cl-pr-gate` の後 (main) | FIX_REQUIRED は人が implementer を起動 | implementer fix → code-gate → pr-gate を自動で連鎖 (3 round まで) |
| `/cl-done` | format → commit → push → PR | `--night`: format → commit → 台帳に記録。push と PR は作らない |
| 完了通知 | 「/clear してから次へ」 | 出さない (`/clear` は呼べない。context は自動圧縮と台帳で回す) |

## 台帳 (ledger)

`.specify/night/<YYYY-MM-DD>.md` (gitignore)。再開位置はこのファイルだけで決まる。`.specify/night/current` には今夜の台帳のパスを 1 行で書く (`/cl-night` の再開と `/cl-land` が台帳を見つけるため。`/cl-land` が消す)。

```markdown
# Night <YYYY-MM-DD>

- branch: night/<YYYY-MM-DD>
- base: <origin/main の commit>
- queue: <spec 名 / roadmap 行の ID を順に>

## <spec_dir>

- start: <この spec を始めた時点の HEAD>   ← pr-gate の --base に使う
- end: <cl-done --night の commit>
- design-gate: PASS R<N> (C0 / H<n>)
- code-gate: PASS iter<N> (<tests> pass)
- pr-gate: PASS R<N> (C0 / H<n>)
- 判断: <推奨案で採った判断を 1 行ずつ。U-n / AD-NNN / NEEDS_INPUT Q / BLOCKED の扱い>
- 未実施: <実機の項目>

## log

- <HH:MM> <spec_dir> <段> <結果>   ← 1 段ごとに 1 行。最終行が再開位置
- <HH:MM> STOP <理由>               ← 夜を終えたとき
```

## pr-gate の範囲

2 本目以降の spec は `/cl-pr-gate <spec_dir> --base <台帳の start>` で、その spec の差分だけをレビューする。1 本目は `start` = 枝の base なので同じ形で書ける。code-gate も `--base <start>` を渡す。

## 夜を終える条件

次のどれかで台帳の log に `STOP <理由>` を書き、それ以降の spec を始めない。

- gate が 3 round で Critical を残した
- auto mode が操作を拒否し、代わりの手段が無い (検出の回避になる案は採らない)
- test / build の基盤が壊れ、spec の変更と無関係に赤い
- 推奨案の無い判断に当たった

## status

- 夜の spec は `reviewing` で止める (`/cl-done --night` は status を進めない)
- 朝、マージの後に main で全 spec を `completed` にする commit を 1 本作る

## 朝 (`/cl-land`)

利用者がいる状態で実行する。

1. 台帳の要約 (spec ごとの gate 結果・判断・未実施) を表示する
2. `git push -u origin night/<date>` (確認 1 回)
3. `gh pr create` で PR を 1 本作る。本文は spec ごとの節
4. 利用者がマージする。**merge commit で入れる** (squash にすると spec ごとの commit の境界が消える)
5. main で全 spec を completed にして commit・push する

## 再起動への備え

- Claude Code の更新や再起動で background の fork / subagent は消える。`/cl-night` は台帳の最終行から再開するので、"Resume" か `/cl-night` の再実行 1 回で続きから動く
- `/loop` の中で回すと、プロセスが生きている限り自動で再開する
- fork 内の権限確認は main から見えない。gate が使う bash の形は `.claude/settings.json` で allow してある。新しい形を足したら同じ所に一般形で足す
- managed policy (`~/.claude/remote-settings.json` の `ask`) は project の allow より強い。夜に効いてくるのは次の 2 種で、どちらも上書きできない:
  - `Bash(git push|pull|merge|rebase|clone:*)`・`curl`・`make`・`docker` など — 夜は呼ばない (上の「夜に呼ばないもの」)
  - `Read(**/secrets/**)`・`Read(**/*token*)`・`Read(**/.env*)` — `src/main/infra/secrets/**` や名前に `token` を含むファイルを Read / Grep すると確認で止まる。reviewer がこれらを読む必要のある spec (秘密の保管・認証) は夜のキューに入れない
