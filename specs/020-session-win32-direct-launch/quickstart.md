# Quickstart: Win32Runtime の直接起動の実機確認 (X-8)

**Spec**: [spec.md](./spec.md) | **Data model**: [data-model.md](./data-model.md)

自動テストで確かめられない点を実機で確かめる手順。結果は roadmap の X-8 の行の結論 (FR-015) と PR の本文に書く。
**V-1 (SC-001) と V-3 (SC-004) は `/cl-done` の前に必須** (SC の合否を決める。tasks SH-012)。残りは記録で、確かめられなければ roadmap に残す。
プロセスの数え方は `tasklist /FI "IMAGENAME eq <名前>"` (または タスク マネージャーの「詳細」)。

## 前提

- Windows 11。Claude Code の native 版がホストに入っている (`%USERPROFILE%\.local\bin\claude.exe`)
- ホストの作業フォルダ `C:\dev\closta` が登録済み
- アプリは `docs/discovery.md` の手順で起動する

## V-0 claude.exe の場所

1. ランタイム一覧を開く。「Windows (ホスト)」のカードに「claude.exe あり」が出る
2. 記録: native の導入先 (既知の場所か PATH のどの要素か)

## V-1 起動と対話 (SC-001。必須)

1. 「新しいセッション」でフォルダ `C:\dev\closta`、ランタイム「Windows (ホスト)」を選んで起動する
2. ターンを 1 つ回す (応答が流れる)
3. ファイルを書く指示で承認が出て、承認すると進む
4. 長い応答の途中で中断する
5. 「閉じる」で閉じる
6. 期待: どれも WSL のセッションと同じに動く。`claude.exe` が 0 個に戻る

## V-2 claude の 4 つの状態 (SC-002)

| 状態の作り方 | 期待 |
|---|---|
| そのまま | `found`。起動できる |
| `claude.exe` の名前を一時的に変え、npm 版 (`claude.cmd`) だけを PATH に置いて再検出 | `shim-only`。選択肢が無効で、npm 版の文言が出る |
| `claude.exe` も `claude.cmd` も無い状態で再検出 | `not-found` |
| 「claude.exe を選ぶ」で `.exe` でないファイルを選ぶ | `rejected` の文言。保存されない |
| 存在する `claude.exe` を選ぶ | `found`・「指定を解除」が出る |
| 指定したファイルの名前を変えて再検出 | `override-invalid`。自動の探索に戻らない |
| 「指定を解除」 | 自動の探索の結果に戻る |

最後に名前を元に戻す。

## V-3 プロセス木の停止 (SC-004 / FR-010。必須)

1. セッションで、長く走る Bash のコマンド (例: `ping -n 120 127.0.0.1`) を走らせ、別に背景の task を 1 つ起こす
2. 走っている間に `claude.exe`・`bash.exe`・`ping.exe` の数を記録する
3. 次の 3 つで、それぞれ止める (毎回 1〜2 からやり直す):
   - 強制終了
   - 「閉じる」
   - アプリの終了
4. 期待 (SC-004 の合否): 止める操作から 5 秒以内に、そのセッションの `claude.exe` と子孫が 0 個になる。他のセッションのプロセスは残る
5. 記録: 3 つの止め方それぞれの、0 個になるまでのおよその秒数と残ったプロセスの名前 (`quickstart-results.md`)

## V-4 libuv の job の確認 (RK-02)

1. V-3 の 1 の状態を作る
2. タスク マネージャーで supervisor の utility プロセスを外から終わらせる
3. 記録: `claude.exe` が止まるか、子孫 (`bash.exe` / `ping.exe`) が残るか。残るのは保証しない終わり方 (data-model §9.4) であり、記録だけする

## V-5 穏当な終了と子孫 (RK-03)

1. 背景の task を 1 つ起こした状態で、「終える」(穏当な終了) を選ぶ
2. 記録: claude が自分から終わったあとに子孫が残るか

## V-6 コンソール窓 (SC-001 / R-12)

起動・ツールの実行・停止の間に、コンソールの窓が一瞬でも出ないことを目で確かめる。

## V-7 transcript と Provider の config ディレクトリ (FR-009)

1. V-1 のセッションの transcript が、ホストの `%USERPROFILE%\.claude\projects\` の下に作られ、セッション一覧の列挙に出る
2. ホストの config ディレクトリ (`C:\Users\<u>\.claude-alt` など) を持つ Provider を選んで起動し、その Provider の設定で動く

## V-8 env (SC-003)

1. セッションで `set` を走らせる (Bash なら `env`)
2. 期待: `WSLENV` / `WSL_UTF8` が無い。許可リスト (data-model §6.1) の外の親の env (例: 親で一時的に足した `CLOSTA_PROBE=1`) が無い

## V-9 WSL の回帰 (SC-006)

所在 WSL の作業フォルダを WSL のランタイムで起動し、V-1 の 2〜5 を回す。今と同じに動く。
所在 WSL のフォルダで「Windows (ホスト)」を選ぶと、起動前の到達不能の表示で止まる (US-1 AC6)。
