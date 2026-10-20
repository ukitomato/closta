---
spec_id: 020-session-win32-direct-launch
feature_id: X-8
domain: session
domain_selected_by: user
targets: both
targets_selected_by: auto
status: reviewing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: Win32Runtime の直接起動 (X-8)

**Feature Branch**: `020-session-win32-direct-launch`

**Created**: 2026-10-19

**Status**: frontmatter の `status:` を正とする

**Input**: roadmap M3 の順 21 の X-8 の行 (範囲の正本)。2026-10-19 に X-6 から切り出した (AD-041 (h) が X-6 に指名した「Win32Runtime の直接起動 (X-1 research R-05 / plan B-4)」)。domain は roadmap の行のとおり `session` (2026-10-19 に利用者が承認)。

## Summary

Windows の作業フォルダ (例 `C:\dev\closta`) を `Win32Runtime` で起動し、ホストの `claude.exe` と Closta から会話できるようにする。今は起動の経路が 3 層 (起動ダイアログの選択肢・main の起動の準備・agents の起動の値の検査) で `WslRuntime` に固定されていて、`Win32Runtime` は検出されるだけで選べない。

- **起動**: 起動ダイアログで `Win32Runtime` を選べるようにし、作業フォルダを cwd にして `claude.exe` を直接起動する。ストリーミング・承認カード・中断・閉じる・10 本の上限は WSL の起動と同じに動く
- **claude の場所**: 検出のときに `claude.exe` を自動で探し、設定で上書きできる。起動できない形 (`.cmd` / `.ps1` の shim) しか無いときは理由と直し方を出して起動を拒否する
- **止める**: 強制終了・閉じる・アプリの終了で、`claude.exe` とその子 (Bash tool のシェルなど) をプロセス木ごと止める
- **環境**: Windows 用の環境変数の許可リストで起動し、Provider の導出 env をその上に重ねる。Provider の config ディレクトリの到達可能性の判定と、起動の導出を同じ規則にそろえる

Closta で Closta を開発できるようにする 2 本の 1 本目 (2 本目は X-9 の resume)。

## 判断の一覧 (2026-10-19 に利用者が承認)

| 判断 | 1 行の要約 | 記録 |
|---|---|---|
| U-1 | `claude.exe` は検出のときに自動で探し、設定で上書きできる。shim しか無ければ案内して拒否する | FR-004〜FR-007 |
| U-2 | 強制終了・閉じる・アプリの終了でプロセス木ごと止める | FR-010〜FR-012、ADR |
| U-3 | WSL の中の作業フォルダ (`\\wsl$\...` / `\\wsl.localhost\...`) × `Win32Runtime` は到達不可のまま | FR-003、Out of Scope |
| U-4 | 起動の env は Windows 用の許可リスト。資格情報の denylist は今と同じに当て、Provider の導出 env を重ねる | FR-008 / FR-009、ADR |
| ADR | AD-058 (proposed。plan で起草): Win32 の起動の契約 (AD-036 §3 の読み替え — cwd の渡し方・`prefixArgs` なし・Windows の env) と、プロセス木の停止 (AD-018 §3 / AD-043 Decision 5 の読み替え — 停止の実装と spawn の許可リスト)。1 つにするか 2 つに分けるかは plan で決める | `docs/decisions/` |

## 本 feature の位置づけ

- **session の feature で、runtime の境界に触れる。** `Win32Runtime` の descriptor に claude の実行パスを足し、Windows 用の起動と停止の値の組み立てを `src/main/infra/runtime/` に置く (プラットフォーム分岐はこの中に閉じる。agents は渡された値を実行するだけ。Principle II)。runtime charter の Related Specs にも記録する
- **WSL の起動の規則を変えない。** `wsl.exe --exec` 形・`WSLENV` の配送・WSL の env の許可リストはそのまま。Windows の起動は別の組み立てで、起動の値 (`RuntimeLaunchSpec`) をランタイムの種類で分ける
- **権限モードは安全 3 値のまま** (`default` / `plan` / `dontAsk`。AD-041 (a))。`Win32Runtime` は `autoModeSafe: false` を表明していて、昇格モードは I-3 の範囲

### 義務の扱い

| 義務 (roadmap の X-8 の行・AD-041 (h)・AD-025) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| `Win32Runtime` でホストの `claude` を直接起動する (X-1 research R-05 / plan B-4) | 扱う | US-1 / FR-001〜FR-003 |
| AD-025「X-1 へ」: 所在 WSL × `Win32Runtime` の到達不可は未検証の安全側の既定 | 扱う (到達不可のまま。U-3) | FR-003、Out of Scope |
| WSL の `--exec` 形の claudePath の判定 (AD-041 記録 2) | 扱わない (X-6。WSL の問題) | roadmap の X-6 の行 |
| resume と失敗したセッションの再開 | 扱わない (X-9) | roadmap の X-9 の行 |
| 孤児が残らないことの確認 (AD-018 §3 / AD-043 Decision 5 は wsl.exe でだけ実測) | 扱う (Windows のプロセス木の停止を作り、実機で観測する。U-2) | US-3 / FR-010〜FR-012、SC-004 |

## Clarifications

### Session 2026-10-19

- Q: `claude.exe` の場所の解決 → A: 自動で探し、設定で上書きできる (U-1)
- Q: 強制終了したときの子プロセス → A: プロセス木ごと止める (U-2)
- Q: WSL の中の作業フォルダ × `Win32Runtime` → A: 到達不可のまま (U-3)
- Q: 起動の env → A: Windows 用の許可リスト (U-4)
- Q: shim しか見つからないときの文言 → A: 「Claude Code の native 版 (claude.exe) が見つかりません。npm 版 (claude.cmd) からは起動できません。native 版を入れるか、設定で claude.exe の場所を指定してください」 [ASSUMED: エラーメッセージ文言]
- Q: 起動ダイアログでのランタイムの並び → A: 今の並びの先頭に `Win32Runtime` (表示名「Windows (ホスト)」)、続けて WSL のディストロ [ASSUMED: UI ラベル・ソート順]
- Q: プロセス木の停止を待つ時間 → A: 止める要求から 5 秒で終わらなければ失敗として記録し、閉じる操作そのものは進める [ASSUMED: タイムアウト秒数]

## User Scenarios & Testing

### User Story 1 - Windows の作業フォルダで Claude Code と会話できる (Priority: P1)

利用者は `C:\dev\closta` を作業フォルダに選び、ランタイムに `Win32Runtime` を選んで起動する。WSL の起動と同じく、応答がストリーミングで出て、承認カードで応じ、中断し、閉じられる。

**Why this priority**: Closta で Closta を開発できるようにする本題。これが無いと Windows のリポジトリは WSL 越し (`/mnt/c`) でしか触れない。

**Independent Test**: `Win32Runtime` と Windows の作業フォルダでセッションを起動し、1 ターンのやり取り・承認・中断ができることを確かめる。

**Acceptance Scenarios**:

1. **Given** `claude.exe` が見つかった `Win32Runtime` と Windows の作業フォルダ、**When** 起動ダイアログを開く、**Then** ランタイムの選択肢に `Win32Runtime` が出て選べる
2. **Given** 上の組み合わせ、**When** 起動してプロンプトを送る、**Then** 応答がストリーミングで出て、`claude` の作業ディレクトリは選んだ作業フォルダである
3. **Given** 実行中の Win32 のセッション、**When** tool の承認の要求が来る、**Then** 承認カードが出て、許可・拒否が `claude` に届く
4. **Given** 実行中の Win32 のセッション、**When** 中断する、**Then** WSL の起動と同じく途中出力が残り、次のプロンプトを送れる
5. **Given** Win32 と WSL のセッションが合わせて 10 本動いている、**When** 11 本目を起動する、**Then** 今と同じく `session-limit` で拒否される
6. **Given** WSL の中の作業フォルダ、**When** `Win32Runtime` を選ぼうとする、**Then** 今と同じく到達不可と理由が出て起動できない

---

### User Story 2 - claude の場所が自動で見つかり、見つからないときに直し方が分かる (Priority: P1)

利用者は何も設定せずに `Win32Runtime` で起動できる。見つからないとき・起動できない形しか無いときは、理由と直し方が分かり、設定で場所を指定して直せる。

**Why this priority**: 場所が解決できないと US-1 が始まらない。Windows の Claude Code は native 版と npm 版があり、npm 版の shim は `shell: false` の spawn では起動できない。

**Independent Test**: native 版がある・shim だけ・何も無い・設定で上書き、の 4 つの状態でランタイム一覧と起動ダイアログの表示を確かめる。

**Acceptance Scenarios**:

1. **Given** native 版の `claude.exe` が既知の場所か PATH にある、**When** ランタイムを検出する、**Then** `Win32Runtime` は claude が見つかった状態になり、起動できる
2. **Given** `claude.cmd` / `claude.ps1` だけがある、**When** 検出する、**Then** 「npm 版からは起動できない」理由と直し方が出て、起動は拒否される
3. **Given** どこにも無い、**When** 検出する、**Then** 「見つからない」理由と直し方が出て、起動は拒否される (今の `claude-not-found` と同じ扱い)
4. **Given** 設定で `claude.exe` の場所を指定した、**When** 検出し直す、**Then** 指定した場所が自動の探索より優先され、その場所が使えない (無い・`.exe` でない) ときは理由が出る

---

### User Story 3 - 止めたセッションのプロセスが残らない (Priority: P2)

利用者が強制終了・閉じる・アプリの終了をしたとき、`claude.exe` と、それが起こした子 (Bash tool のシェル・背景の task など) がすべて止まる。

**Why this priority**: Windows では親を kill しても子は止まらない。残ったプロセスはファイルを掴み、作業フォルダのビルドやテストを壊す。

**Independent Test**: 背景の task を走らせたセッションを強制終了・閉じる・アプリの終了で止め、プロセスの一覧に `claude.exe` とその子が残らないことを確かめる。

**Acceptance Scenarios**:

1. **Given** Bash tool で長く走るコマンドを実行中の Win32 のセッション、**When** 強制終了する、**Then** `claude.exe` とそのコマンドのプロセスが止まる
2. **Given** 背景の task が動いている Win32 のセッション、**When** 閉じる、**Then** 背景の task のプロセスも止まる
3. **Given** Win32 のセッションが動いている、**When** アプリを終了する、**Then** `claude.exe` とその子が残らない
4. **Given** プロセス木の停止が 5 秒で終わらない、**When** 閉じる、**Then** 閉じる操作は進み、停止の失敗が記録される

---

### User Story 4 - Provider が Win32 の起動でも使える (Priority: P2)

利用者が登録した Provider のうち、Win32 で到達可能と表示されるものは、Win32 の起動でもそのまま使える。到達可能と出たのに起動で失敗することが無い。

**Why this priority**: 今は Provider の到達可能性の判定 (ホストの config ディレクトリ × Win32 は到達可能) と起動の導出 (`kind !== 'wsl'` で到達不可) が食い違い、到達可能と出た Provider が起動で `provider-unavailable` になる。

**Independent Test**: ホストの config ディレクトリの Provider と、環境変数の方式の Provider で Win32 の起動を行い、導出 env が `claude.exe` に届くことを確かめる。

**Acceptance Scenarios**:

1. **Given** ホストの config ディレクトリ (`%USERPROFILE%\.claude` など) の Provider、**When** Win32 で起動する、**Then** その config ディレクトリが `claude.exe` に渡る
2. **Given** WSL の config ディレクトリ (UNC) の Provider、**When** 起動ダイアログで `Win32Runtime` を選ぶ、**Then** 今と同じく到達不可で選べない
3. **Given** helper の方式 (`apiKeyHelper` / aws 系) の Provider、**When** `Win32Runtime` を選ぶ、**Then** 今と同じく到達不可で選べない (Out of Scope)
4. **Given** Win32 で起動した、**When** 起動の env を調べる、**Then** 許可リストの外のキーと資格情報の denylist に当たるキーは渡らず、`WSLENV` / `WSL_UTF8` も無い

### Edge Cases

- `claude.exe` の場所がランタイムの検出の後に変わった (更新・アンインストール) — 起動のときに見つからなければ今の `claude-not-found` と同じく拒否する。検出し直しで直る
- 設定で指定した場所が UNC (`\\wsl$\...` のバイナリ) — 起動できない形として拒否する (WSL のバイナリは WslRuntime で起動する)
- 作業フォルダのパスに空白・日本語が入る (`C:\Users\山田 太郎\repo`) — cwd としてそのまま渡り、引数にシェルの解釈を挟まない
- 作業フォルダが別のドライブ (`D:\`) やネットワークドライブ — Windows の作業フォルダとして同じに扱う (ネットワークドライブの到達可能性は今の判定のまま)
- 強制終了とプロセスの自然な終了が重なる — 停止は 2 回目を無害に扱う
- Win32 と WSL のセッションが混ざる監視ビュー — 行の形は今のまま。ランタイムの表示名で見分ける
- 起動ダイアログのプリセットが `Win32Runtime` を指す — 今のプリセットの規則 (ランタイムの id で保存) で保存・適用できる

## Requirements

### Functional Requirements

#### 起動 (US-1)

- **FR-001**: 起動ダイアログは、claude が見つかった `Win32Runtime` を起動先の選択肢に出さなければならない。claude が見つからない・使えない `Win32Runtime` は理由つきで選べない形で出す
- **FR-002**: main の起動の準備と起動ゲートは、`Win32Runtime` を起動の対象として受け付け、Windows の作業フォルダの HostPath を cwd にして `claude.exe` を直接起動しなければならない (`wsl.exe` を経由しない)。引数はシェルを通さず配列で渡す。起動の値 (`RuntimeLaunchSpec`) をランタイムの種類で分け、agents の起動の値の検査は種類ごとの規則で行う (WSL の規則は変えない)
- **FR-003**: 作業フォルダとランタイムの解決は今の判定表に従う — Windows の作業フォルダ × `Win32Runtime` は到達可能、WSL の中の作業フォルダ × `Win32Runtime` は到達不可 (U-3)
- **FR-013**: ストリーミング・承認カード・中断・閉じる・同時実行数の上限 (10)・状態通知・監視ビューの行は、WSL の起動と同じ経路で動かなければならない (X-1 / X-5 / O-1 の規則を継ぐ)

#### claude の場所 (US-2)

- **FR-004**: ランタイムの検出は、`Win32Runtime` の claude の実行パスを 1 回解決して descriptor に持たなければならない (AD-018 §4 と同じく起動のたびに探さない)。探す順は、設定の上書き → native installer の既知の場所 → PATH
- **FR-005**: 実行パスとして採るのは、拡張子が `.exe` の実在するファイルの絶対パスだけでなければならない。`.cmd` / `.bat` / `.ps1` の shim だけが見つかったときは、起動できない理由 (npm 版) として区別する
- **FR-006**: 利用者は設定で `claude.exe` の場所を指定・解除できなければならない。指定は永続化し、資格情報を含まない。指定した場所が FR-005 を満たさないときは理由を出し、自動の探索に戻らない (指定の誤りを黙って隠さない)
- **FR-007**: claude が見つからない・shim だけ・指定が使えない、のそれぞれで、ランタイム一覧と起動ダイアログに理由と直し方を出さなければならない。起動は拒否する (起動の失敗の理由のキーは今の `claude-not-found` を使うか足すかを plan で決める)

#### 環境 (US-4)

- **FR-008**: Win32 の起動の env は、Windows 用の許可リストのキーだけを親の env から拾って組まなければならない。許可リストは少なくとも claude.exe の動作に要るもの (PATH・PATHEXT・SystemRoot・windir・TEMP・TMP・USERPROFILE・APPDATA・LOCALAPPDATA・HOMEDRIVE・HOMEPATH・ComSpec・ProgramFiles 系・`CLAUDE_CODE_GIT_BASH_PATH`) を含み、正本は plan / ADR に 1 つだけ置く。資格情報の denylist (`LAUNCH_ENV_DENY_PATTERN`) は WSL と同じに当て、`WSLENV` / `WSL_UTF8` は入れない (U-4)
- **FR-009**: Provider の導出 env は、許可リストの base の上に重ねて渡さなければならない。Provider の config ディレクトリの到達可能性の判定と、起動の導出 (`CLAUDE_CONFIG_DIR` の値) は同じ関数で決める (判定で到達可能な組み合わせが起動で失敗しない)。Win32 で導出 env の値に制御文字があれば今と同じく拒否する

#### 止める (US-3)

- **FR-010**: Win32 のセッションの強制終了と閉じる操作は、`claude.exe` とその子孫のプロセスをすべて止めなければならない (U-2)。中断 (`interrupt()`) は今と同じでプロセスを止めない
- **FR-011**: アプリの正常な終了 (main からの全セッションの停止と supervisor の正常な shutdown)・renderer の再読み込み・セッションスレッドの JS の例外でも、Win32 のセッションのプロセス木 (`claude.exe` と子孫) が残ってはならない。Worker の異常終了 (`terminate()`・メモリ上限超過)・supervisor / main の異常終了 (外からの kill を含む)・停止の期限切れ (FR-012) は best-effort で、子孫が残らないことを保証しない。終わり方ごとの保証の範囲の正本は AD-058 Decision 3 の表
- **FR-012**: プロセス木の停止が一定時間 (5 秒) で終わらないときは、閉じる操作を止めずに失敗を記録しなければならない。記録にパス・コマンドの文字列・env の値を出さない

#### 境界の検査・記録

- **FR-014**: プラットフォームの分岐と、Windows の起動・停止の値 (実行ファイル・cwd・env・コンソール窓の扱い・停止のコマンドと引数) の組み立ては `src/main/infra/runtime/` に閉じなければならない (Principle II)。agents (セッションスレッド) は `RuntimeLaunchSpec` で渡された値を検査して実行するだけで、プラットフォームを判定せず、Windows 固有の値をリテラルで持たない。新しい spawn の経路 (停止の実装が外部のコマンドを使うなら) は Constitution 検証の spawn の許可リストと ESLint の例外に、理由つきで足す
- **FR-015**: Win32 の起動の契約とプロセス木の停止の決定は ADR (AD-058 から。proposed) に書き、session charter と runtime charter の Related Specs / Related ADRs に記録しなければならない。完了の PR で roadmap の X-8 の行に結論を書く
- **FR-016**: WSL の起動の振る舞い (`wsl.exe --exec` 形・`WSLENV`・WSL の env の許可リスト・`assertNoBackslash`) を変えてはならない。今の WSL の起動のテストはそのまま通る

### Key Entities

- **Win32Runtime の descriptor**: 今の descriptor に claude の実行パス (HostPath。DTO には出さない) と、見つからない・shim だけ・指定が使えない、の状態を足したもの
- **claude の場所の指定**: 利用者が設定で指定する `claude.exe` の絶対パス。ランタイムの設定として永続化する (保存先は plan で決める)
- **Win32 の起動の値**: `RuntimeLaunchSpec` の Windows 版。実行ファイルは `claude.exe` の絶対パス、cwd は作業フォルダの HostPath、env は FR-008 / FR-009 の組み合わせ。前置きの引数は持たない

### Assumptions

- 主開発ホストの Claude Code は native installer で入れる (npm 版を Win32 で起動する方法は作らない)
- Win32 で起動した `claude.exe` のセッションの記録はホストの config ディレクトリに書かれ、今のセッション列挙 (R-2 のホストの対象) と過去ログの読み取りで読める。読めることは quickstart で確かめる
- Windows の Claude Code は Git Bash を要る。見つけるための env (PATH / `CLAUDE_CODE_GIT_BASH_PATH`) は FR-008 の許可リストで渡す。Git Bash が無い環境の案内は Claude Code 自身の出すエラーに任せる

## Success Criteria

### Measurable Outcomes

- **SC-001**: Windows の作業フォルダ × `Win32Runtime` で起動・1 ターン・承認・中断・閉じるが通る — 計測経路: 起動の準備と起動の値の組み立ての単体テスト (Win32 の組み合わせの表) + quickstart V-1 の実機 (本番ビルドで `C:\dev\closta` を起動)。合否: 両方が通ること。V-1 は `/cl-done` の前に必須 (確かめずに完了にしない)
- **SC-002**: claude の場所の 4 つの状態 (native・shim だけ・無い・設定の上書き) で検出の結果と表示が FR-004〜FR-007 のとおりになる — 計測経路: 探索の単体テスト (偽のファイルシステム) + 起動ダイアログ・ランタイム一覧のコンポーネントテスト
- **SC-003**: Win32 の起動の env が許可リストのキーと Provider の導出 env だけからなり、denylist のキー・`WSLENV`・`WSL_UTF8` が 0 件 — 計測経路: env の組み立ての単体テスト (pin テストで許可リストを固定)
- **SC-004**: 強制終了・閉じる・アプリの終了の 3 つで、止める要求から 5 秒以内に、そのセッションの `claude.exe` とその子孫が 0 件になる — 計測経路: 偽の子プロセスでの順序と引数のテスト (停止のコマンドを `claude.exe` が生きている間に正しい引数で起こし、その後に abort と stdin の close を行う) + quickstart V-3 の実機 (Bash tool の長いコマンドと背景の task を走らせて止め、プロセスの一覧で数える)。合否: 単体は順序と引数だけを確かめ、0 件と 5 秒の条件は V-3 で決める。V-3 は `/cl-done` の前に必須 (確かめずに完了にしない)
- **SC-005**: Provider の到達可能性の判定と起動の導出が、ランタイムの種類 × config ディレクトリの形の全組み合わせで一致する — 計測経路: 判定と導出を同じ表で回す単体テスト
- **SC-006**: WSL の起動の既存のテストと Constitution 検証が変更なしで通る — 計測経路: `docs/discovery.md` の verify (CI と同じコマンド)

## Dependencies

- X-1 (005) の起動の契約 (AD-036 §3) と承認の経路を継ぐ。Win32 の分だけを AD-058 で読み替える
- X-4 (008) の起動の設定・依存解決・プリセット (AD-041) を継ぐ。権限モードは安全 3 値
- X-5 (009) の単一 supervisor・セッションスレッド・上限 10 (AD-043) を継ぐ
- R-1 (001) の `Win32Runtime` の検出・パス API・作業フォルダとランタイムの解決 (AD-025) を継ぐ
- R-2 (002) のホストの config ディレクトリの列挙を継ぐ

## Out of Scope

- WSL の中の作業フォルダ × `Win32Runtime` (UNC の cwd) — 到達不可のまま (U-3)
- npm 版 (`claude.cmd`) を Win32 で起動すること (shell を挟む・node で `cli.js` を起動する)
- helper の方式 (`apiKeyHelper` / aws 系) の Provider を Win32 で使うこと — 到達不可のまま (helper のパスの形と実行方式は X-7 の範囲と合わせて扱う)
- 昇格の権限モード (auto / bypassPermissions) と capability の連動 — I-3
- resume・失敗したセッションの再開 — X-9
- fork・セッション名・追加ディレクトリ・上限の軸、WSL の claudePath の形の判定 — X-6
- macOS / Linux の `DirectRuntime` — OPT-mac
