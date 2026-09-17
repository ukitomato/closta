---
status: accepted
date: 2026-09-17
id: AD-029
deciders: ukitomato
tags: [session, domain-model, path]
supersedes: []
superseded-by: []
---

# AD-029: セッションの作業ディレクトリの所在は値の形から判定し、特定できないものは推測しない

## Context

[AD-025](0025-workspace-folder-carries-location.md) は**作業フォルダ**について
「所在を伴う値として登録する。パス文字列から推測しない」と決めた。
登録はアプリが行うので、所在を先に選ばせることで構造的に決定可能にできた。

**セッションの作業ディレクトリは事情が違う。** アプリ外の `claude` が記録した値であり、
アプリは形を選べない。R-2 は当初「由来 config ディレクトリの所在の名前空間で
書かれている」と暗黙に仮定して設計していた。

**実測がこの仮定を反証した。**

## 実測 (R-2 の Phase 0 / research R-02)

作業ディレクトリの形を由来 config ディレクトリごとに分類した。

| 由来 config ディレクトリ | Windows 形式 | POSIX 形式 | UNC 形式 | 不在 |
| --- | --- | --- | --- | --- |
| ホスト既定 (43 件) | 30 | 6 | **7** | 0 |
| `wsl:Ubuntu-26.04` (269 件) | 0 | 268 | 0 | **1** |

**ホスト側の 1 つの config ディレクトリに 3 形式が同時に現れた。**
`\\wsl.localhost\Ubuntu-26.04\home\<user>\ags\ags-platform` のように
UNC 形式で記録されたものが 7 件あり、POSIX 形式も 6 件ある。
小文字のドライブレター (`c:\dev\...`) も混ざっていた。

加えて 3 綴り (`\\wsl.localhost\` / `\\wsl$\` / `//wsl.localhost/`) がいずれも
実際に成立することを確認した。**利用者がその時入力した綴りのまま記録される。**

## Decision

### 1. 由来 config ディレクトリの所在から名前空間を推定しない

**値の形から判定する。** 判定は `domain` の純粋関数 1 箇所に集約し、6 つの出自に落とす。

| 出自 | 条件 | 所在 |
| --- | --- | --- |
| `host` | ドライブレター始まり | `windows` |
| `wsl-from-unc` | UNC 形式 かつ ディストロが検出済み | **UNC に埋め込まれたディストロ名**で特定 |
| `wsl-inherited` | POSIX 形式 かつ 由来 config の所在が `wsl:<D>` | `wsl:<D>` を継承 |
| `unknown-location` | POSIX 形式 かつ 由来 config の所在が `windows` | **特定しない** |
| `undetected-distro` | UNC 形式 かつ ディストロが未検出 | 特定できるが今ない |
| `absent` | 値が無い | — |

### 2. 特定できないものは推測しない。`undetected-distro` と `unknown-location` を混ぜない

`unknown-location` を推測で埋めないのは、**同じ `/home/y/p` が複数のディストロに
存在しうる**ためである (AD-025 の「パスとして登録すると所在が失われる」と同じ理由)。
1 つのディストロに帰属させると、別のディストロの登録フォルダにセッションが紛れ込む。

`undetected-distro` は「**どのディストロかは分かるが、そのディストロが今ない**」であり、
`unknown-location` は「**どのディストロか分からない**」である。
利用者に示すべきことが違うので別の出自として扱う。

### 3. UNC の解析はパス API に 1 つ関数を足して行う

`makeWslUncPath(namespace, raw)` は名前空間識別子を**必須引数**として要求するため、
**生文字列からディストロ名を得る手段が無ければ呼べない。**
R-1 にはその手段が無かった。

`src/domain/runtime/path-api.ts` に `parseWslUncPath(raw)` を追加する。
**パス操作の標準モジュールを import してよい唯一の実装ファイル**であり、
ファイル数は増えないので Principle I に抵触しない。

- 3 綴りをすべて受理し、**正規形は常に `UNC_PREFIX` に寄せる**
  (2 つの綴りを値として持ち回ると、同じディレクトリを指す値が等価判定で不一致になる)
- **接頭辞の大小は問わない** (UNC のホスト名は大小を区別しない)
- **ディストロ名の大小は区別する** — 検出結果の表記と完全一致で照合する (AD-025 §2)

判定関数は UNC の綴りに関する知識を持たない。**文字列操作で接頭辞を剥がさない** —
剥がす実装は R-1 の gate が繰り返し塞いだ「境界での再 branding」と同じ形になる。

### 4. 判定関数は `ui` から到達できない。これは意図した性質である

判定関数はパス API に依存し、パス API は `node:path` を import する。
`.dependency-cruiser.js` の `ui-not-to-core` (**推移的**到達の禁止) が
renderer からの import を error にする。

**制約ではなく望ましい性質として扱う** — `ui` が判定関数経由で
名前空間つきパス値を合成する経路が構造的に存在しなくなる。
renderer は DTO の `originKind` (参照キー) を読んで表示を分岐する。

AD-025 §4 は「`ui → domain` は型と副作用のない純粋関数まで」と定めているが、
これは `ui` が `domain` の**すべて**の純粋関数を呼べるという意味ではない。
`domain` の純粋性は推移的到達の禁止で守られており、
パス API に依存する関数はその網の外側 (= `ui` から届かない側) に落ちる。

### 5. 表示用の値に UNC 接頭辞を載せない

所在が特定できない出自 (`unknown-location` / `undetected-distro`) は
`PathDTO` を作れない — `namespace` を埋められないためであり、
埋めると「所在を推測しない」を DTO の形で破ることになる。

かわりに**表示専用の文字列**を渡す。**UNC 接頭辞を含めない。**
`undetected-distro` は変換後の POSIX パスを表示に使う。

「表示専用だから」という理由で UNC を境界に出すと、
AD-025 の「UNC は `infra` の内側」が文面上だけの規則になる。
表示用の生値を運ぶフィールドは **DTO 全体で 1 種類 (`cwdDisplay`) に統一する** —
`SessionSummaryDTO` と `SessionGroupDTO` の両方に同じ規則を掛ける
(片方だけ直すと、塞いだ穴の隣に同じ穴が開いたまま残る)。

## Consequences

- 対応づけは**セッションの所在をランタイム識別子として扱い**、
  R-1 の `resolveFolderRuntime()` を変換エンジンとして再利用する。
  越境判定と到達可能性の表を 2 つ持たない
- 「保留」の理由は R-1 の `BlockedReason` を**そのまま使う**。
  別の型として定義すると、R-1 が `unreachable` に分類している `path-not-mapped` を
  取り込む誤りが起きる (design-gate round 1 で実際に起きた)
- **作業ディレクトリは config ディレクトリ由来 = アプリ外のプロセスが書いた未信頼入力である。**
  R-1 が renderer 発の値に掛けている拘束 (制御文字 / 長さ / 文字種) を、
  方向が逆になったからといって外さない。抽出したディストロ名は
  **抽出直後に `isValidDistroName()` を通す**
- ホスト側の履歴に POSIX 形式が現れる限り、「所在不明」グループは**常に存在しうる**。
  空になる前提で UI を作らない
- 行の同一性は `(targetKey, sessionId)` の組で定義する。
  同一 UUID が 2 つの config ディレクトリに現れうる (履歴のコピー)

## Open Questions

- [ ] `//wsl.localhost/<D>/...` が由来 config `wsl:<D>` 側に現れた場合、
      現行の判定順序では UNC として解析されるため `wsl-from-unc` になる。
      実測では観測していない。観測されたら判定表に行を足すか検討する
- [ ] worktree 由来と programmatic 由来の**取得手段**。`SDKSessionInfo` に区別子が無く、
      `includeProgrammatic: false` での 2 回目の列挙との差分を採るとプロセス起動が 2 倍になる。
      R-2 の実装中に決める

## References

- [AD-025](0025-workspace-folder-carries-location.md) — 所在を伴う値 / 3 名前空間 / UNC は `infra` の内側
- [AD-004](0004-branded-path-types.md) — パスは branded type で名前空間を分離する
- [AD-021](0021-session-store-and-enumeration.md) — `listSessions()` の契約
- [AD-015](0015-wsl-access-strategy.md) — UNC 経路の実測
- `specs/002-session-cross-folder-session-enumeration/research.md` R-02 — 3 形式混在の実測
