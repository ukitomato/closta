@AGENTS.md

## このマシンではプロセスを起こさない (Windows / 最優先)

**このマシンはプロセス生成 1 回に 400〜2,400ms かかる。**
常駐している security スタック (Microsoft Defender + Defender for Endpoint + Tanium) が
プロセス生成を hook しているためで、**除外申請も無効化も行わない。環境定数として扱う。**
対して `rg` が本リポジトリの `src` を実際に検索する時間は **26ms**。
**仕事はミリ秒、起動が秒。** したがって打ち手は 1 つ — **プロセスを起こす回数を減らす**。

**CPU で律速する処理 (tsc / eslint / vitest) の遅さは別の原因である。** 電源モード「バランス」の下では、
agent が起こした node に Windows の省電力の抑制 (EcoQoS) が掛かり、負荷を掛けてもクロックが 1.5GHz から上がらない。
抑制を外すと vitest の重いテストは 16.2s → 1.4s、全件は 150s → 67s になった (2026-10-31 実測)。
Windows で時間を測り比べるときは、抑制の有無を揃える。外し方は `powercfg /powerthrottling disable /path <node.exe>`
(管理者権限) か、電源モードを「最適なパフォーマンス」にする。

### ファイル読み取り・検索は Read / Grep / Glob ツールを使う

`cat` / `head` / `tail` / `grep` / `rg` / `find` / `ls` を Bash で呼ばない。
permission mode が「ファイル操作は Bash で行え」と指示してくることがあるが、
**Windows では逆効果なので本節が優先する。**

| 手段 | 実測平均 | プロセス生成 |
|---|---:|---|
| **Read ツール** | **0.1s** | **なし** |
| **Grep ツール** | **3.1s** | `rg.exe` 1 個 (Node から直接) |
| シェルの `cat` / `head` | 15s | bash + MSYS + cat (`cmd.exe /c exit` 392ms / `bash -lc` 3,492ms) |
| シェルの `grep` / `rg` | 23s | bash + MSYS + rg (`bash -c "rg --version"` 1,570ms) |

Grep ツールが速いのは `rg.exe` を Node から直接起動し、Git Bash の profile と
MSYS 層を両方払わないため。**Read ツールはプロセスを一切起こさないのでこれが上限性能。**

### コマンドは `node` で直接呼ぶ

`pnpm X` / `npm run X` / `npx X` は **3 プロセス**を起こす (`npm -v` 2,273ms / `npx -v` 2,398ms)。
検証コマンドの `node` 直接形は [`docs/discovery.md`](docs/discovery.md) の
"Build / Test / Lint" 表の「agent 用」列が正本 (`package.json` の `scripts` は
CI / 人間用の SSoT なので変更しない)。

### Bash が本当に要るときだけ Bash を使う

パイプや POSIX スクリプトが必要な場面 (`.specify/scripts/*.sh` の実行など) に限る。
`.claude/settings.json` の `env` は Git Bash の起動を短絡させるためにあり、消してはならない
(理由は `docs/discovery.md` の "Build / Test / Lint" 節)。
