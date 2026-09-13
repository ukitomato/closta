---
status: accepted
date: 2026-09-13
id: AD-015
deciders: ukitomato
tags: [runtime, wsl, performance]
supersedes: []
superseded-by: []
---

# AD-015: WSL の検出・ファイルアクセス・プロセス起動の方式

## Context

SPIKE-8（ランタイム検出とパス変換の確定）の結果。R-1 の前提となる。

主開発ホストは Windows 11 + WSL2 で、日常のセッションは WSL ディストロ内に存在する。
Windows 側の Electron から WSL 内の `~/.claude/projects` をどう読み、どうプロセスを起動するかを
実測に基づいて決める必要があった。

計測環境: WSL 2.7.3.0 / kernel 6.6.114.1-microsoft-standard-WSL2 / Ubuntu-26.04（systemd 有効）。
`~/.claude/projects` に 709 個の JSONL が存在する実データで測定した。

## 測定結果

`Measure-Command`（PowerShell）による中央値。Git Bash 経由の計測はシェル自身の
プロセスオーバーヘッドで汚染されるため採用しない。

| 操作 | 所要 |
|---|---|
| baseline: `cmd /c exit`（このマシンのプロセス起動の床） | **384 ms** |
| `wsl.exe -d <distro> -- true`（no-op） | **1,573 ms** |
| `wsl.exe` 経由で 709 JSONL を `find` | **1,472 ms** |
| `\\wsl.localhost` で 709 JSONL を再帰列挙 | **964 ms** |
| `\\wsl.localhost` でディレクトリ一覧のみ | **22 ms** |
| 単一ファイル読み: `\\wsl.localhost` | **32 ms** |
| 単一ファイル読み: `wsl.exe -- cat` | **1,622 ms** |
| legacy UNC `\\wsl$\` で再帰列挙 | 999 ms（`\\wsl.localhost` とほぼ同じ） |

**支配要因は `wsl.exe` の固定起動コスト（約 1.5 秒、baseline に対して +1.2 秒）である。**
no-op と 709 ファイルの `find` がほぼ同値であることから、ディストロ内の I/O 自体は
実質無料だと分かる。

## Decision

### 1. WSL 内のファイル読み取りは `\\wsl.localhost\<distro>\...` で直接行う

`wsl.exe` は使わない。単一ファイル読みで **50 倍**（32 ms vs 1,622 ms）、
再帰列挙でも **1.5 倍**速い。浅いディレクトリ列挙は 22 ms で、体感上は即時である。

legacy の `\\wsl$\` も同等の性能だが、新しい `\\wsl.localhost\` を使う。

### 2. `wsl.exe` はプロセス起動にのみ使う

セッションの `claude` プロセス起動は `wsl.exe -d <distro> -- ...` で行う。
このとき 1.5 秒はセッションあたり 1 回の固定費であり許容できる。

**`wsl.exe` をループ内で呼んではならない。** 18 セッションを個別に `wsl.exe` で読むと
27 秒かかる。複数の情報が要るときは 1 回の呼び出しにまとめる。

### 3. 検出結果はキャッシュし、明示操作でのみ再検出する

docker endpoint の検出はディストロごとに約 1.7 秒かかる。4 ディストロを毎回走査すると
7 秒近くになるため、起動時に 1 回だけ走査して結果を保持する。
再検出はユーザの明示操作（更新ボタン）と、ディストロの起動/停止検知時に限る。

### 4. `WSL_UTF8=1` を必ず設定する

`wsl.exe` **自身**の出力（`--list`、`--version`、エラーメッセージ）は既定で **UTF-16LE** である。

```
$ wsl.exe -l -q | xxd
00000000: 5500 6200 7500 6e00 7400 7500 2d00 3200  U.b.u.n.t.u.-.2.
```

`WSL_UTF8=1` を環境変数に設定すると UTF-8 になる。改行は CRLF のままなので別途処理する。

**ディストロ内で実行したコマンドの stdout は影響を受けず、raw UTF-8 でパススルーされる。**
これは検証済みで、`{"type":"assistant","text":"あ"}` が UTF-8 のまま通ることを確認した。
**したがって stream-json は WSL 経由でも壊れない**（AD-002 / SPIKE-5 の前提が成立する）。

### 5. Windows パスを引数で渡すときはフォワードスラッシュか `WSLENV` を使う

`wsl.exe -- <cmd> 'C:\dev\closta'` は **バックスラッシュが消える**。

| 渡し方 | 結果 |
|---|---|
| `wslpath -a 'C:\dev\closta'` | `wslpath: C:devclosta` — 失敗 |
| `wslpath -a 'C:\\dev\\closta'`（二重化） | 同上 — 失敗 |
| `wslpath -a 'C:/dev/closta'` | `/mnt/c/dev/closta` — **成功** |
| `WSLENV=P/w P='C:\dev\closta'` + `wslpath -a "$P"` | `/mnt/c/dev/closta/` — **成功** |

### 6. パス変換の正本は `mount` 出力とする

`/mnt/` は `/etc/wsl.conf` の `[automount] root` で変更できるため、決め打ちしてはならない。
計測環境の `wsl.conf` には `[boot] systemd=true` と `[user] default=...` しかなく
既定の `/mnt/` だったが、他環境で変わりうる。

```
C:\ on /mnt/c type 9p (rw,...,path=C:\;...,symlinkroot=/mnt/,...)
```

`mount` 出力の `path=` と マウント先から実際の対応を得るのが最も確実である。
`wslpath` も使えるが、**1 回の呼び出しに 1.5 秒かかるため変換ごとには呼べない**。
起動時に 1 回マッピングを取得し、以後はホスト側で計算する。

### 7. `claude` はログインシェルの PATH にしかない

```
wsl.exe -d Ubuntu-26.04 -- command -v claude          → 見つからない
wsl.exe -d Ubuntu-26.04 -- bash -lc 'command -v claude' → /home/<user>/.local/bin/claude
```

`spawnClaudeCodeProcess` で WSL を噛ませる際は、**`bash -lc` を経由するか実行パスを
明示的に解決する**必要がある。実行パスの解決は起動時に 1 回行い、
`pathToClaudeCodeExecutable` に渡す形が望ましい（`bash -lc` はプロファイル読み込み分だけ遅い）。

### 8. sandbox capability の判定基準

| ランタイム | 判定 | 根拠 |
|---|---|---|
| `Win32Runtime` | `sandbox: 'none'`, `autoModeSafe: false` | **公式に「Native Windows is not supported」と明記**。Windows では WSL2 内で動かすのが前提 |
| `WslRuntime`（WSL1） | `sandbox: 'none'`, `autoModeSafe: false` | WSL1 は必要な名前空間機能を持たない |
| `WslRuntime`（WSL2） | 下記の実地判定による | |
| `DockerRuntime` | `sandbox: 'container'`, `autoModeSafe: true` | コンテナ境界がプロセス全体を覆う |

### WSL2 の判定手順

公式ドキュメントが必要条件を明示している。Linux / WSL2 の sandbox は
**`bubblewrap` と `socat` の 2 つを必須依存**とする。

- `bubblewrap` — ファイルシステム隔離を強制する非特権 sandbox ツール
- **`socat` — sandbox プロキシへネットワークトラフィックを中継するリレー**

`ripgrep` はネイティブバイナリに同梱される。seccomp フィルタ
（`npm install -g @anthropic-ai/sandbox-runtime`）は**任意**で、
UNIX ドメインソケットのブロックを追加するもの。

判定は以下の順で行う。**存在確認だけでは不十分**で、userns は実地テストが要る。

| # | 確認 | 判定 |
|---|---|---|
| 1 | `command -v bwrap` | 不在 → `sandbox: 'none'` |
| 2 | `command -v socat` | 不在 → `sandbox: 'none'` |
| 3 | `sysctl kernel.apparmor_restrict_unprivileged_userns` | `1` → 制限あり。`0` またはキー不在 → 問題なし |
| 4 | `unshare --user --map-root-user true` | 失敗 → `sandbox: 'none'` |
| 5 | seccomp フィルタの有無 | 任意。不在でも sandbox は動く |

Ubuntu 24.04 以降は既定の AppArmor ポリシーが bubblewrap の userns 作成を妨げる。
解除には `/etc/apparmor.d/bwrap` プロファイルの追加が要るが、**これは特権操作であり
アプリは行わない**（Principle VI）。案内にとどめる。

### 計測環境（Ubuntu-26.04）の結果

**初回測定時（2026-09-13 午前）は `socat` が不在で `sandbox: 'none'` と判定された。**
`sudo apt-get install bubblewrap socat` の実施後に再測定し、利用可能に変わったことを確認した。
この経緯自体が「必須依存を presence check する意味」の実例なので記録しておく。

| 確認 | 導入前 | 導入後 |
|---|---|---|
| `bwrap` | `/usr/bin/bwrap` | `/usr/bin/bwrap` (0.11.1) |
| `socat` | **ABSENT** | `/usr/bin/socat` |
| `apparmor_restrict_unprivileged_userns` | キー不在（制限なし） | 同左 |
| `unshare --user --map-root-user true` | OK | OK |
| seccomp フィルタ（任意） | 未導入 | 未導入 |
| **判定** | **`sandbox: 'none'`** | **`sandbox: 'bubblewrap'`** |

### 実地検証（presence check だけでは不十分なため）

導入後、`bwrap` が実際に隔離を効かせられることを確認した。

| 検証 | 結果 |
|---|---|
| `--unshare-all` で PID 名前空間が分離される | OK（内部 pid = 2） |
| `--tmpfs /tmp` でホストの `/tmp` が見えない | OK（0 entries） |
| UTS 名前空間が分離される | OK（hostname が変化） |
| `--ro-bind /` で `/usr` への書き込みが拒否される | OK |
| `--tmpfs $HOME` で HOME がマスクされる | OK（0 entries） |
| `--unshare-net` で外部 TCP に到達できない | OK（遮断） |
| 対照群: 隔離なしでは同じ接続が成功する | OK（遮断が本物であることの裏付け） |
| `socat` が TCP で待ち受けて接続を受け付ける | OK |

**対照群を取っているのが要点である。** ネットワーク遮断の確認は、そもそも外部に出られない
環境では偽陽性になる。隔離なしで同じ接続が成功することを併せて確認して初めて意味を持つ。

### 残る制約

**seccomp フィルタ（`@anthropic-ai/sandbox-runtime`）は未導入のまま。** これは任意依存で、
UNIX ドメインソケットのブロックを追加するもの。無くても sandbox は動作するが、
UNIX ソケット経由の抜け道は塞がれない。`capabilities` では「sandbox あり、ただし
UNIX ソケット遮断なし」を区別できる形にしておくことが望ましい。

**アプリはこれらを導入しない**（Principle VI）。不在を `capabilities` に反映し、
`sudo apt-get install bubblewrap socat` を案内するにとどめる。

**それでも軸 3（Docker サンドボックス）の価値は変わらない。** 初期状態の Ubuntu-26.04 で
必須依存が欠けていた事実が示すとおり、**利用者のディストロが sandbox 可能である保証はない**。
準備されていない環境で無人実行を安全に回す経路はコンテナ境界しか残らない
（[AD-008](0008-no-persistent-environment-provisioning.md)）。

## Consequences

- R-1 の実装では **`\\wsl.localhost` 経由の fs アクセスが主経路**になる。Node の `fs` は
  UNC パスを扱えるため追加の依存は不要
- `HostPath` → `RuntimePath` の変換は、起動時に取得したマウントマッピングを使って
  **ホスト側で計算する**。`wslpath` を変換ごとに呼ぶ設計は性能上成立しない
- ランタイム検出結果のキャッシュが必須になる。キャッシュのキーには
  ディストロ名と endpoint を含める（[AD-003](0003-runtime-abstraction-by-transport.md) の
  複数インスタンス原則）
- `WSL_UTF8=1` の設定漏れは、ディストロ名が文字化けして検出が丸ごと失敗する形で現れる。
  R-1 のユニットテストに UTF-16LE 入力のデコードケースを含めること
- `capabilities` の判定は実地テストを伴うため、検出に時間がかかる。
  非同期に行い、判定完了まで危険な権限モードを選択不可にしておく（安全側に倒す）

## Open Questions

- [ ] 停止中のディストロを検出のために起動してよいか。`wsl.exe -d <stopped>` は
      ディストロを起動してしまう。利用者の意図しない起動は避けるべきで、
      停止中は `capabilities: unknown` として扱い、選択時に初めて判定する案がある
- [ ] `\\wsl.localhost` は WSL サービスが停止していると使えない。フォールバックが要るか
- [ ] 本測定は 1 ホストの結果である。`wsl.exe` の 1.5 秒が一般的な値か、
      この環境固有（Defender / wsl-vpnkit の影響）かは未確認

## References

- SPIKE-8（PLAN.md §11）
- [AD-003](0003-runtime-abstraction-by-transport.md) — ランタイム抽象はトランスポート軸で切る
- [AD-004](0004-branded-path-types.md) — パスは branded type で名前空間を分離する
- [AD-012](0012-docker-control-via-cli.md) — docker endpoint（検出コストの根拠）
- [Configure the sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing) —
  sandbox の必須依存 (`bubblewrap` / `socat`)、AppArmor の制約、Native Windows 非対応
- `docs/domains/runtime/charter.md`
