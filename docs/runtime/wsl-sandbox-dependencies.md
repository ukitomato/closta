# WSL2 で sandbox を有効にする

Closta は **WSL2 の中で Claude Code を無人実行 (Auto / `bypassPermissions`) するための
隔離境界**を、ディストロ側の `bubblewrap` と `socat` に依存して判定します。

このどちらかが欠けていると、Closta はランタイム一覧に「**無人実行 不可**」と表示します。
これは Closta の不具合ではなく、**そのディストロに隔離境界が無い**という事実の表明です。

> **Closta はこれらを自動で導入しません。** パッケージの導入は特権操作であり、
> アプリは利用者の環境を変更しません
> ([AD-008](../decisions/0008-no-persistent-environment-provisioning.md) /
> Constitution Principle VI)。以下の手順は**利用者が実行するもの**です。

判定の根拠は
[AD-015 §8](../decisions/0015-wsl-access-strategy.md) にあります。

---

## 判定の 4 項目

Closta は実行中の WSL2 ディストロに対して、次の 4 つをすべて満たしたときだけ
`sandbox: bubblewrap` と表明します。

| # | 確認 | 満たさないときの表示 |
|---|---|---|
| 1 | `bwrap` が存在する | 不足依存に **bubblewrap** が出る |
| 2 | `socat` が存在する | 不足依存に **socat** が出る |
| 3 | 非特権 user namespace の作成が制限されていない | 「user namespace の作成が制限されています」 |
| 4 | 実際に user namespace を作成できる | 同上 |

**1 と 2 は「あるかどうか」だけでは足りません。**
解決されたパスが**そのディストロの Windows マウント配下**だった場合、Closta は不在として扱います。
WSL は既定で Windows 側の `PATH` を Linux 側に追加するため、`command -v socat` が
Windows 用の実行ファイルを返すことがあります。それは Linux 側の隔離境界には使えません。

---

## bubblewrap

<a id="bubblewrap"></a>

ファイルシステムを隔離する非特権 sandbox ツールです。Claude Code の sandbox の中核です。

WSL ディストロの中で、そのディストロのパッケージマネージャから導入してください。

- Debian / Ubuntu 系: パッケージ名は `bubblewrap`
- Fedora / RHEL 系: パッケージ名は `bubblewrap`
- Arch 系: パッケージ名は `bubblewrap`
- Alpine: パッケージ名は `bubblewrap`

導入後、ディストロ内で `command -v bwrap` が `/usr/bin/bwrap` のような
**Linux 側のパス**を返すことを確認してください。
`/mnt/` 配下のパスが返る場合は Windows 側の実行ファイルを見ています。

導入したら Closta の**「再検出」**を押してください。
Closta は自動で再判定しません
([FR-010](../../specs/001-runtime-folder-registration-runtime-detection/spec.md))。

## socat

<a id="socat"></a>

sandbox のプロキシへネットワークトラフィックを中継するリレーです。
**bubblewrap だけでは足りません** — sandbox 内からの通信経路がこれに依存します。

パッケージ名はいずれのディストリビューションでも `socat` です。

同じく `command -v socat` が Linux 側のパスを返すことを確認し、
導入後に Closta の「再検出」を押してください。

---

## user namespace の制限 (項目 3 / 4)

<a id="userns"></a>

**Ubuntu 24.04 以降は、既定の AppArmor ポリシーが bubblewrap の user namespace 作成を妨げます。**

ディストロ内で次の値を確認できます。

- `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` が `1` → 制限あり
- 同ファイルが存在しない、または `0` → 制限なし

制限を解除するには `/etc/apparmor.d/` にプロファイルを追加する必要があり、
**これは特権操作です。Closta は行いません。**
解除するかどうかはディストロの管理方針として判断してください。

制限を外せない場合、そのディストロでの無人実行は成立しません。
**隔離境界が要る作業は、Closta の Docker ランタイム (軸 3) を使ってください。**

---

## seccomp フィルタ (任意)

<a id="seccomp"></a>

`@anthropic-ai/sandbox-runtime` が提供する seccomp フィルタは
UNIX ドメインソケットの遮断を追加するものです。**任意の依存**であり、
無くても sandbox は動作します。

R-1 の Closta はこの有無を**判定しません**。一覧には常に「未判定」と表示されます
([FR-006](../../specs/001-runtime-folder-registration-runtime-detection/spec.md))。
「不在」ではなく「未判定」と出るのは、判定していないものを
「ない」と表明しないためです (Principle III / FR-003)。

---

## 確認と再検出

1. ディストロ内で依存を導入する
2. Closta のランタイム一覧で**「再検出」**を押す
3. 対象ランタイムの表示が「無人実行 可」に変わることを確認する

変わらない場合は、上の「判定の 4 項目」のどこで止まっているかが一覧に表示されます。
不足依存が空で「無人実行 不可」のままなら、項目 3 / 4 の user namespace 側です。
