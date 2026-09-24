# Quickstart / 検証ガイド: セッション列挙 (R-2)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-16

実機でしか確認できない項目を手順化する。Vitest で閉じる項目はここに書かない
(どのテストが何を担うかは [contracts/session-enumeration.md](contracts/session-enumeration.md)
の「テスト戦略」)。

## 前提

- Windows 11 + WSL2。**ディストロが 2 つ以上**あり、**1 つを停止させておける**こと
- 少なくとも 1 つのディストロで Claude Code を使った履歴があること
  (`\\wsl.localhost\<D>\home\<user>\.claude\projects` が存在する)
- Windows 側にも履歴があること (`%USERPROFILE%\.claude\projects`)
- R-1 の US-1 〜 US-3 が動作すること (ランタイム一覧 / フォルダ登録 / 組み合わせ解決)

**履歴が片方にしかない場合、SC-005 の出自 6 パターンのうち実機で踏めるものが減る。**
その場合は Vitest のフィクスチャで代替し、quickstart 側は「踏めなかった行」を記録する。

## セットアップ

```powershell
pnpm install
pnpm dev
```

SC-008 の計測は **温まった dev サーバ**で行う (R-1 の quickstart と同じ)。
初回起動は Vite の依存最適化を含むため、**2 回目以降の値**を採る。

---

## V-1: 登録フォルダを横断して一覧される (US-1)

1. R-1 の画面で、**所在 `windows` のフォルダ**と**実行中ディストロ内のフォルダ**を 1 つずつ登録する
2. セッション一覧を開く

**確認**:

- [ ] 両方の所在のセッションが同じ画面に並ぶ
- [ ] 各行に要約・最終更新時刻が出る。要約が空の行も**識別可能**である (FR-047)
- [ ] 日本語・絵文字を含む要約が**切れずに**表示される (SC-009)
- [ ] **取得時刻**が表示される (FR-034)
- [ ] worktree 由来 / programmatic 由来が**区別して**示される (FR-029)
- [ ] 一覧を閉じて開き直すと**再走査されない** (SC-008 の 100 ミリ秒)

**SC-001 の突き合わせ** — 同じ config ディレクトリを SDK から直接読み、識別子集合を比較する。

```powershell
$env:CLAUDE_CONFIG_DIR = '\\wsl.localhost\<D>\home\<user>\.claude'
node -e "const s=await import('file:///<repo>/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs'); const a=await s.listSessions(); console.log(a.length); console.log(a.slice(0,3).map(x=>x.sessionId).join(' '))"
```

- [ ] 件数が一覧の総数 (全グループの合計) と一致する
- [ ] 抜き出した識別子が一覧に存在する

---

## V-2: 未登録フォルダが見つかる (US-2)

1. 登録していない作業ディレクトリの履歴があることを確認する
2. セッション一覧を開く

**確認**:

- [ ] 「未登録フォルダ」が作業ディレクトリごとにまとまって現れる
- [ ] 既定で**畳まれている** (US-2 AC-5)
- [ ] 登録の導線を押すと、**所在とパスが初期値として入った** R-1 の登録操作が開く
- [ ] 押すまでは**何も登録されない** (FR-026)
- [ ] 登録後に再取得すると、そのグループが**登録フォルダ側へ移る**
- [ ] 作業ディレクトリ不明のセッションが**別グループとして残る** (実測では 269 件中 1 件存在した)
- [ ] 不明の理由 (記録なし / 所在不明) が**区別して**示される (FR-028)

---

## V-3: 出自の 6 パターン (SC-005)

実機で踏めるものを確認し、踏めなかった行を記録する。
**ホスト側 config ディレクトリには 3 形式が混在しうる** ([research.md](research.md) R-02)。

| # | 出自 | 作り方 | 確認 |
| --- | --- | --- | --- |
| 1 | `host` | Windows 側で `claude` を使う | 所在 `windows` の登録フォルダに対応づく |
| 2 | `wsl-from-unc` | Windows 側から `\\wsl.localhost\<D>\...` を cwd にして `claude` を使う | **ディストロ `<D>` の登録フォルダに対応づく** |
| 3 | `undetected-distro` | #2 の履歴を残したままディストロを改名 / 削除する | 「未検出の所在」として示される |
| 4 | `wsl-inherited` | ディストロ内で `claude` を使う | そのディストロの登録フォルダに対応づく |
| 5 | `unknown-location` | ホスト側 config に POSIX 形式の cwd がある状態 | **所在不明**として示される。どのディストロにも帰属しない |
| 6 | `absent` | — (既存履歴に現れる) | 「作業フォルダ不明」に入る |

- [ ] #5 が**どのディストロの登録フォルダにも入っていない** (最重要。推測で埋めていないこと)
- [ ] 越境 (`/mnt/c/...` が所在 `windows` の登録フォルダに対応) が**越境として示される** (FR-023)

---

## V-4: 列挙できない所在 (US-3 / SC-002 / SC-007)

1. **ディストロを 1 つ停止させる**: `wsl --terminate <D>`
2. 停止前の `wsl -l -v` の出力を保存する
3. アプリで再取得する
4. 再度 `wsl -l -v` を取り、**実行状態が変わっていないこと**を確認する

**確認**:

- [ ] 停止中の所在が「停止中のため未列挙」として示され、**起動と再検出の導線**がある
- [ ] `wsl -l -v` の前後で**停止中ディストロが `Stopped` のまま**
      (**SC-002 の補助確認。主判定は Vitest 側の「発行 0 回」である** —
      停止中への UNC アクセスが起動を引き起こすかを測っていないため、
      実行状態が不変でも発行 0 件は導けない。[research.md](research.md) R-08)
- [ ] **停止中の所在に対して列挙プロセスが起動されていない** —
      タスクマネージャ / `Get-Process node` で、再取得の前後に子プロセスが増えないことを見る
      (FR-008 の 3 入口のうち「起動」を踏む確認。C-006)
- [ ] **実行中の所在の一覧は失われていない** (SC-007)
- [ ] `wsl --shutdown` した状態で再取得すると、Windows 側の一覧だけが出て**例外が出ない**
- [ ] Claude Code を使っていないディストロが「履歴なし」として示され、**失敗と区別される**

**停止中の所在を直接叩く** (SC-002 の後半) — 開発者ツールから:

```js
await window.closta.fetchMoreSessions('<停止中ディストロの targetKey>', 0)
```

- [ ] 拒否され、`wsl -l -v` の実行状態が変わらない

---

## V-5: 読み取り専用であること (SC-004 / SC-014)

```powershell
$p = '\\wsl.localhost\<D>\home\<user>\.claude'
$before = Get-ChildItem $p -Recurse -File -EA SilentlyContinue |
  Select-Object FullName, Length, LastWriteTimeUtc
# ここでアプリの一覧を開き、再取得も 1 回行う
$after = Get-ChildItem $p -Recurse -File -EA SilentlyContinue |
  Select-Object FullName, Length, LastWriteTimeUtc
(Compare-Object $before $after -Property FullName, Length, LastWriteTimeUtc).Count
```

- [ ] 差分が **0** (実測では 8,487 ファイルで 0)
- [ ] アプリの `userData` 配下と OS の一時ディレクトリにセッション由来のファイルが
      **増えていない** (SC-014)

**この比較は書き込みしか見ない。** 本文を読む SDK API
(`getSessionMessages` / `getSubagentMessages` ほか。contracts C-4 の表 2) の呼び出しは
**読み取りなので差分に現れない** — そちらは SH-081 の許可リスト検査
(「SDK から呼ぶのは `listSessions` の 1 件だけ」) が担う。
**この注記が無いと「前後比較が 0 だったので読み取り専用である」と誤って結論できる。**

---

## V-6: 性能 (SC-008)

開発ビルドの計測ログを見る (R-1 の `measure` と同じ経路)。

- [ ] 先頭 50 件の描画: **2 秒以内**
- [ ] 1 所在あたりの全件取得完了: **10 秒以内** (実測の参考値: 269 件で約 0.9 秒 + プロセス起動約 0.3 秒)
- [ ] キャッシュヒット時の再表示: **100 ミリ秒以内**
- [ ] 先頭ページ表示中は**グループ件数を確定値として見せていない** ([data-model.md](data-model.md) §7)

---

## V-7: `wsl.exe` を呼んでいないこと (SC-003)

1. 一覧を開く前にプロセス監視を開始する

```powershell
Get-Process wsl -EA SilentlyContinue | Select-Object Id, StartTime
```

2. 一覧を開き、再取得も行う
3. 新しい `wsl.exe` プロセスが**増えていない**ことを確認する

- [ ] 列挙と探索で `wsl.exe` が起動されない
- [ ] R-1 の実行状態確認 (`refreshRuntimes` 相当) 以外に `wsl.exe` の起動がない

**注**: R-1 の経路は `wsl.exe` を使う。**R-2 が新たに呼んでいないこと**が確認対象である。

---

## V-8: 空状態 (SC-013)

| 条件 | 作り方 |
| --- | --- |
| **登録フォルダ単位のセッション 0 件** | **履歴の無いフォルダを 1 つ登録する** |
| 登録フォルダ 0 件 | すべて登録解除する |
| セッション 0 件 | 履歴の無いディストロだけを所在に持つ状態にする |
| 全所在が未列挙 | `wsl --shutdown` + Windows 側の履歴を一時退避 |
| 絞り込み結果 0 件 | 該当しない絞り込みを適用する |

- [ ] **5 条件**すべてで**空白の画面にならず**、次の操作への導線が出る
- [ ] **履歴の無いフォルダを 3 件登録した状態で、`folder` グループが 3 件現れる** (FR-051 / SC-013)。
      **セッションが 0 件でもフォルダが画面から消えない**

---

## トラブルシューティング

| 症状 | 確認 |
| --- | --- |
| WSL 側のセッションが 0 件になる | `\\wsl.localhost\<D>\home\<user>\.claude` が存在するか。ホームが `/home/<user>` 以外にないか (FR-011 の候補探索) |
| 一覧が空で失敗も出ない | 列挙対象の探索で候補が 0 件になっていないか。`no-history` と `failed` の取り違えを疑う (FR-012) |
| WSL のセッションが「所在不明」に入る | 由来 config ディレクトリの所在が正しく渡っているか (`wsl-inherited` の判定は由来の所在に依存する。[data-model.md](data-model.md) §2 #5) |
| ホスト側の POSIX cwd がどこかのディストロに入っている | **FR-018 違反**。所在を推測している |
| 一覧を開くと UI が固まる | 列挙が main process で走っていないか (FR-005 / Principle IX) |
| 停止中ディストロが起動してしまう | 実行中確認済みの値のゲートを通らずに UNC 経路を発行していないか (FR-008 / SC-002) |
| 件数が SDK 直接呼び出しと合わない | `includeWorktrees` / `includeProgrammatic` の既定 (いずれも「含む」) を変えていないか (FR-029) |
