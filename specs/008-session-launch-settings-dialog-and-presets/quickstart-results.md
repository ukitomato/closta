# Quickstart results: 起動設定ダイアログとプリセット (X-4)

## SH-000 — 実機確認 (2026-09-30, Ubuntu-26.04, Claude Code 2.1.285)

確認はすべて Node `spawnSync` (shell なし) で行った。env は curated base (`SystemRoot` / `windir` / `TEMP` / `TMP` / `WSL_UTF8`) だけを渡している。

| # | 形 | 結果 |
|---|---|---|
| 0 | `bash -lc 'command -v claude'` (X-1 の probe と同じ) | `/home/<user>/.local/bin/claude`。ファイルは **ELF (native バイナリ)** で、shebang ではない |
| 1 | `wsl.exe --cd /tmp -d D --exec <claudePath> --version` | `2.1.285 (Claude Code)` / exit 0 → **`--exec` 形は成立する** (login PATH は不要) |
| 2 | 同じ起動を `--` 形で (X-1 の現行) | 同じ出力 / exit 0 |
| 3 | `--exec printf '%s\|%s\n' '<json with $(echo PWNED)>' 'claude-sonnet-4-5[1m]'` | JSON と `[1m]` が**原文どおり**に届いた (`$(...)` は展開されず、glob 展開も無い) |
| 4 | `--exec /usr/bin/env` + `WSLENV=CLOSTA_FWD/u` | `CLOSTA_FWD=reached`。**`TMP` / `TEMP` は現れない** (列挙したキーだけが届く) |

**AD-041 (f) の結論**: `--exec` 形を採る。R-01 の代替 (`/bin/sh -c` 固定リテラル + 項目 6 の改修) は不要である。

**付記**: WSL 内の `PATH` には、interop (`appendWindowsPath`) が Windows の PATH を `/mnt/c/...` 形で追加している。これは WSL の既定動作で、X-4 が転送するものではない。`PATH` は転送禁止キーであり、アプリからは渡さない。

## SH-023 — 実機記録 (2026-09-30, 利用者操作。Ubuntu-26.04 / Claude Code 2.1.285 / Provider = 既定)

| # | 確認 | 結果 |
|---|---|---|
| 1 | 起動設定ダイアログ (フォルダ → ランタイム → 起動) から起動し、プロンプトに応答が返る | **OK** (後述の不具合 B-2 を修正した後) |
| 2 | 既定 Provider で distro 内の env を観測 (`printenv \| grep -E '^(ANTHROPIC\|AWS_PROFILE\|CLAUDE_CONFIG_DIR\|TMP\|TEMP)' \| cut -d= -f1`。キー名のみ) | **OK**: `TMP` / `TEMP` は現れない (curated base を転送しない。design-gate R2 C-101 の実機確認)。アプリは既定 Provider では何も転送しない。現れた `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_OPUS_MODEL` は distro 側の設定由来で、アプリの転送キーではない |
| 3 | `dontAsk` (事前承認のみ) で「README.md を作って」 | **OK**: 承認カードは出ず、「自動的に拒否された操作: Write — … don't ask mode …」が表示された (US-1 AC6) |
| 4 | 作業フォルダ登録 (WSL → home) | **OK** (後述の不具合 B-1 を修正した後) |

プリセットの保存・適用は E2E (SH-022) で確認した。越境警告は、SC-008 の計測経路である renderer の単体テスト (`LaunchDialog.test.tsx`) で確認した。E2E の stub は解決結果 DTO を返さないため、E2E では越境警告を観測できない。

## SH-023 追補 — pr-gate R1 後の実機記録 (2026-10-01, 利用者が操作。Ubuntu-26.04 / Claude Code 2.1.285)

pr-gate R1 (architecture H-002 / po H-005 / security H-001) で、実機での確認が足りないと指摘された。その残りのうち、API key を使わずに確認できる範囲を記録する。

| # | 確認 | 結果 |
|---|---|---|
| 5 | `plan` (計画のみ) で起動し、「README.md を作って」と依頼する。ExitPlanMode の承認カードを承認した後に Write を試みる | **OK**: Write は承認カードを経由するか拒否された。承認なしにファイルが作られることはなかった (モードの昇格なし。AD-041 Confirmation) |
| 6 | `--exec` で起動した応答の途中で強制終了し、WSL 内の `pgrep -af claude \| wc -l` を起動前と比べる | **OK**: 件数が起動前に戻った (孤児なし。AD-041 (f) / AD-018 §3) |
| 7 | config-dir Provider (`~/.claude-x4`。既存のログイン状態を複製したもの) で起動し、Bash tool で `printenv \| cut -d= -f1` を実行して `CLAUDE_CONFIG_DIR` / `TMP` / `TEMP` / `WSLENV` を絞り込む (キー名のみ) | **OK**: `CLAUDE_CONFIG_DIR` は現れ、`TMP` / `TEMP` は現れない。空でない `forwardKeys` が `WSLENV` 経由で distro 内に届く経路を、端から端まで観測した (SC-007 の実機 leg) |
| 8 | 同じ起動の transcript の置き場所 (`ls -t ~/.claude-x4/projects/*/`) | **OK**: 選んだ config dir の配下に、いまのセッションの `.jsonl` があった (SC-006) |

検証用の `~/.claude-x4` (ログイン状態の複製) は、確認後に削除してよいと利用者に伝えた。

**繰り越し ([USER] pr-gate R1 / 2026-10-01)**: 次の 3 点は、利用者が API key を持っておらず実施できない。そのため、利用者の判断で繰り越す。担当は、資格情報まわりの登録欄を増やす X-7 の quickstart とする。

- api-key / oauth-token / aws-profile / env-passthrough の各方式に固有の `forwardKeys` を、distro 内で観測すること
- Bash tool から秘密 env が見えるかどうか (キー名のみを記録する。AD-041 (e) の残存リスクとして受け入れ済み)
- helper (`apiKeyHelper` / `awsCredentialExport`) をシェル経由で実行する方式

**これらを繰り越しても判断が変わらない理由**: 転送の仕組み (`WSLENV` に `/u` で実名キーを列挙する) は方式によらず同じで、その経路は #7 で端から端まで観測した。方式ごとに違うのは、キー名の集合と、値を作る段だけである。値を作る段とは、api-key / oauth-token では safeStorage の復号、env-passthrough ではアプリの process.env からの取得を指す。どちらも単体テスト (derive-env / provider-service / composeLaunchEnv) で固定している。

### quickstart で見つかった既存の不具合 (X-4 の範囲外。修正済み)

- **B-1 (R-1 由来)**: 作業フォルダのブラウズで子フォルダへ移動すると「読み込み中」で固まる。`useFolders.move` がブラウズトークンを `setBrowse` の updater 内で外側の変数に書き出して使っていたが、React 19 は updater の同期実行を保証しない。遅延するとトークン null で早期 return し、後から `loading: true` だけが反映された。→ トークンを ref で持つ形に修正。
- **B-2 (X-1 由来)**: 起動後に最初のプロンプトを送っても「応答中」のまま進まず、入力が「実行後に送信予定」に積まれる。X-1 は「claude は初回プロンプトまで無出力」の実測を前提に、最初のメッセージで `launching → running` にしていたが、claude 2.1.285 は起動直後に `system/commands_changed` を出す。そのため turn が無いのに busy になり、初回プロンプトが積まれてデッドロックした。→ agents は最初のプロンプト送信後のメッセージでだけ `ready` に遷移する。あわせて `launching` の表示を「準備完了 — プロンプトを送ると始まります」に変えた。
- 切り分けの実測: SDK `query()` + `spawnClaudeCodeProcess` (`--exec` / `--` × `/tmp` / 作業フォルダ) はいずれも `system/init` → `assistant` → `result/success` で正常。WSL の起動形と stdin は原因でない。

**SH-000 から SH-023 に回した 2 点**: 次の 2 点は、どちらも上の「繰り越し」で X-7 の quickstart に回した。
- helper のシェル実行方式
- Bash tool から秘密 env が見えるか
