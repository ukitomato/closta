# po-reviewer Review: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 3

## 初回読了 viewpoint

- 対象の FR/SC: FR-001〜FR-016 / SC-001〜SC-010 / US-1〜US-4 (AC は計 22) / Edge Cases 15 件 / Out of Scope 10 件 / Assumptions ([USER 決定] 9 件 / [ASSUMED] 5 件)。今回の観点で重いのは FR-004 / FR-009 / FR-010 / FR-011 / FR-014、SC-003 / SC-004 / SC-006 / SC-008。
- 本 feature に関係する charter と Confirmation: session charter の Journey 3 (charter.md:84) と KPI「並列時の滑らかさ」(charter.md:123) / X-1 の FR-016 / 計画中の AD-043 の Confirmation (plan.md:258-260) / 既存コード: run-state.ts:69-115、window.ts:47 (`autoHideMenuBar: true`)。src 配下の `Menu|setMenu(|removeMenu` は 0 件
- A. 認可 / 認証 / secret 管理: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: po-reviewer の担当外 (security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- D. Constitution / ADR drift: 該当なし: po-reviewer の担当外 (architecture-reviewer が担当)
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:3 Low:3
- F. 命名 / module / lint hookup: 該当なし: po-reviewer の担当外 (convention-reviewer が担当)
- G. optional reviewer 範囲: 該当なし: po-reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R2 を受けた改訂で、一覧の状態の導出 (FR-009)、終了済みでの composer 無効化とキュー取り消し (FR-010)、`end-forced` の表示と終了中の二度押し防止、`launching` の強制終了 (FR-011)、renderer の再読み込み・クラッシュで全セッション停止 (FR-014)、SC-003 の負荷の `BODY_MAX_BYTES` 化、閉じた後の選択解除、枠の残り数の O-1 送りに対応した。[USER 決定] 9 件と Out of Scope の意図的な判断は前提として尊重する。H-001 は R2 で私が推奨した最小案 (a) から派生した穴である。

### R2 指摘の判定

| R2 ID | 内容 | 判定 | 根拠 |
|---|---|---|---|
| H-001 (R2-H-02) | `done` の二義性 | resolved | spec.md:88, :215, :220 / plan.md:233, :236, :238 / tasks.md:97。導出の優先順位に新しい穴 (新規 M-002) |
| H-002 (R2-H-03) | renderer の再読み込みで見えない枠 | resolved | spec.md:151, :239, :334 / plan.md:216, :222, :285 / tasks.md:136 / SC-008。解消策から新しい穴 (新規 H-001) |
| M-001 (R2-M-01) | SC-003 の 5MB | resolved | spec.md:291 / plan.md:243, :280 / tasks.md:121。Assumptions に古い文言 (新規 L-001) |
| M-002 (R2-M-02) | 強制終了に落ちたことが示されない | resolved | spec.md:92, :222 / plan.md:153, :185, :238, :241 / tasks.md:45, :98 |
| M-003 (R2-M-03) | `launching` で取れる操作が無い | resolved | spec.md:93, :152, :223 / plan.md:239 / tasks.md:91, :98 |
| M-004 | 新規指摘を検出するテストが無い | resolved | tasks.md:43, :97-98, :136 |
| L-001 | 閉じた後の選択の移り先 | resolved | spec.md:94, :224 / plan.md:234 |
| L-002 | 枠の残り数の表示 | resolved | spec.md:333 |

## Findings

### [High] 本番でも Ctrl+R / F5 による再読み込みが効く。1 回のキー操作で最大 10 本のセッションが確認も強制終了の警告も無く kill され、一覧と表示中の本文が消える (H-001) (scope: feature) — new (R2 H-002 の解消策から派生)

- **観察**:
  - spec.md:151 / :239 (FR-014) と plan.md:222 は、主フレームが再読み込みされたら `killAll()` で全セッションに kill を送ると定める。plan.md:285 (R-07) は「意図した挙動 (開発時のリロードを含む)」とし、本番で再読み込みが起きる経路を検討していない。
  - window.ts:47 は `autoHideMenuBar: true` だけで、src 配下で `Menu|setMenu(|removeMenu` は 0 件。Electron は、アプリがメニューを設定しないときに既定のメニューを作り、View → Reload (CmdOrCtrl+R) / Force Reload の accelerator はメニューバーを隠しても効く (Electron の既定の挙動についての reviewer の知識で、リポジトリ内の観察ではない)。
  - kill は X-1 FR-016 の強制終了の警告の対象なのに、確認も警告も出ない。応答待ちのセッションにも `end` ではなく `kill` が送られる (plan.md:216)。再読み込みの後は一覧が空から始まり、何本が止まったかは示されない。
- **同種事象探索**: specs/009 配下の `reload|リロード|再読み込み|Ctrl\+R|accelerator` で 9 件。accelerator を抑止する規定、再読み込み時の確認・事後通知の規定は 0 件。
- **リスク/影響**: Journey 3 の最中に、誤ったキー操作 1 回で全セッションが強制終了される。X-1 FR-016 の警告の保証がこの経路だけ黙って外れる。
- **推奨アクション** (最小案を先に):
  - (a) 本番ビルドでは再読み込みの accelerator を無効にする (例: `Menu.setApplicationMenu(null)`、または `before-input-event` で Ctrl+R / F5 / Ctrl+Shift+R を握りつぶす。開発時は残してよい)。単体で固定する。残るのは renderer のクラッシュだけになる。
  - (b) 再読み込み・クラッシュ時の止め方を状態で分ける (`done` / `interrupted` は `end`、それ以外は `kill`)。
  - (c) 再読み込みの後、空の一覧に「N 本のセッションを停止しました」と示す。
  - R-07 の「意図した挙動」は (a) の後は「開発時とクラッシュに限る」に書き直す。
- **根拠**: PO-4 / PO-6 / X-1 FR-016 / charter Journey 3
- **scope 根拠**: spec の FR-014 / Edge Cases と plan の main/app 節で直接直せる

### [Medium] SC-004 / FR-004 の「窓 1 つあたり 1 回以下 (例外は supervisor の異常終了の合成だけ)」が、plan の即時送信 (`child-exited` による生存フラグの false、Worker 異常終了時の `process-crashed` の合成) と両立しない (M-001) (scope: feature) — new

- **観察**: spec.md:183-184 / :294 が窓の外で送ってよいと認めるのは supervisor の異常終了の合成 1 回だけ。plan.md:173 は `child-exited` で生存フラグ false の通知を即時に送り、plan.md:176 は Worker の異常終了で `process-crashed` を合成する。plan.md:281 (R-03) は「枠の解放は即時の `child-exited` で反映する」。relay (plan.md:218) は「バッチ 1 つにつき 1 回」で、即時の false を renderer へいつ届けるかが書かれていない。
- **同種事象探索**: `即時|窓の外|窓 1 つあたり` で 7 件 (spec.md:184, :294 / plan.md:173, :176, :218, :281 / tasks.md:57)。
- **リスク/影響**: plan どおりの実装が SC-004 に落ちるか、SC が計測できない文面になる。
- **推奨アクション**: (a) FR-004 と SC-004 の例外に「`claude` の終了と、スレッドの異常終了の合成」を足す。または (b) 即時のイベントは main 内の枠の解放だけに使い、renderer へは次の窓で送ると plan に書き、R-03 を「main の枠の解放は即時、一覧の反映は最大 100ms 遅れる」と書き分ける。採った方を BE-013 の観点に反映する。
- **根拠**: PO-2
- **scope 根拠**: spec の FR-004 / SC-004 と plan で直接直せる

### [Medium] plan の一覧ラベル導出「`ended` → 終了済み」が「失敗」を飲み込む。`error` のセッションは必ず生存フラグが false になるので、US-2 AC1 の「失敗」がどの行にも出なくなる (M-002) (scope: feature) — new

- **観察**: US-2 AC1 は「失敗」と「終了済み」を別々に挙げるが、FR-009 が出し分けを定めているのは `done` だけ。plan.md:233 は `ended` を run-state より優先しているように読める。`error` に達したセッションは生存フラグが false になる (FR-012 / plan.md:173, :176)。supervisor の異常終了でも同じ。その結果 `process-crashed` / `supervisor-exited` / `provider-error` の行が「終了済み」と出うる。
- **同種事象探索**: `終了済み` で 9 件。いずれも `error` との優先順位を定めていない。
- **推奨アクション**: FR-009 に優先順位を 1 行足す (「`error` は生存フラグによらず『失敗』(理由キーつき)。それ以外で生存フラグが false なら『終了済み』。`done` かつ true は『応答待ち』」)。plan を同じ順で書き直し、FE-013 に観点を足す。
- **根拠**: PO-3 / PO-6
- **scope 根拠**: spec の FR-009、plan の renderer 節、FE-013 で直接直せる

### [Medium] 「終了」の処理中 (`ending`、最大 3 秒) に composer が有効なまま。その間に送ったプロンプトの行き先が決まっていない (M-003) (scope: feature) — new

- **観察**: plan.md:236 の `isDisabled` は `runState === 'error' || ended` で、`ending` は終了ボタンの無効化にしか使われていない。セッションスレッドの `end` はキューを閉じて `query()` を終わらせる一方、renderer の状態機械は `done` で `send-prompt` を受けると `running` に進む。終了の処理中に送られたプロンプトの扱いが書かれていない。
- **同種事象探索**: `ending` で 3 件。composer や送信待ちキューとの関係を定めた行は 0 件。
- **推奨アクション**: FR-010 か FR-011 に「終了の処理中は composer を無効にし、送信待ちキューは保留する (`claude` が終われば取り消す)」を足す。`isDisabled` に `ending` を含め、FE-013 に負例を足す。
- **根拠**: PO-4 / FR-010 の趣旨
- **scope 根拠**: spec の FR-010 / FR-011、plan の renderer 節、FE-013 で直接直せる

### [Medium] 今回の新規指摘を検出するテストが tasks に無い (M-004) (scope: feature) [H] — new

- **観察**: 本番設定で再読み込みの accelerator が効かないこと・再読み込み時の止め方 / `child-exited` の即時通知と SC-004 の関係 / `error` かつ生存フラグ false の行のラベル / 終了の処理中の送信、を確かめるテスト観点が無い。
- **推奨アクション**: BE-021 / BE-013 / FE-013 に足す。SH-022 に「本番ビルドで Ctrl+R を押しても再読み込みされない」を 1 行足す。
- **根拠**: H

### [Low] Assumptions に「うち 1 本に 5MB の tool_result」が残り、SC-003 の負荷と食い違う (L-001) (scope: feature) — new

- **観察**: spec.md:277 ([ASSUMED]) は「うち 1 本に 5MB の tool_result」と書くが、SC-003 本体と plan / tasks は `BODY_MAX_BYTES` の part に改められている。
- **推奨アクション**: spec.md:277 を揃えるか、SC-003 への参照形にする。

### [Low] 再読み込み直後の窓 (kill の完了まで最大 3 秒) の扱いが無い。止めたセッションの状態通知が新しい renderer に届いたときの扱いも決まっていない (L-002) (scope: feature) — new

- **観察**: 「再読み込み後の一覧は空から始まる」が、枠が空くのは生存フラグが false になってから。plan.md:232 の「`onSessionStatus` は一覧の行だけを更新する」は、行の無い sessionId の通知を捨てるのか行を作るのかを決めていない。
- **推奨アクション**: renderer は起動要求を出していない sessionId の状態通知を捨てる、と plan に 1 行足す。再読み込み直後の拒否文言との矛盾は H-001 の (c) とあわせて扱う。

### [Low] US-1 AC2 の「ダイアログは入力を保ったまま戻る」を検査するテスト観点が無い (L-003) (scope: feature) [H] — new

- **観察**: FE-003 が挙げるのは「文言・導線」だけで、FE-013 にも観点が無い。
- **推奨アクション**: FE-003 に「`session-limit` で拒否された後も、ダイアログの選択とプロンプトが保たれる」を足すか、X-4 の該当テストを参照形で示す。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `reload\|リロード\|再読み込み\|Ctrl\+R\|accelerator` (specs/009 *.md、gate-r* を除く) | 9 | spec.md:150, :151, :239, :301-303, :334 / plan.md:216, :222, :285 / tasks.md:136, :174 |
| H-001 (補助) | `\bMenu\b\|setMenu\(\|removeMenu` (src) | 0 | — |
| M-001 | `即時\|窓の外\|窓 1 つあたり` | 7 | spec.md:184, :294 / plan.md:173, :176, :218, :281 / tasks.md:57 |
| M-002 | `終了済み` | 9 | spec.md:88, :92, :215 / plan.md:233 / tasks.md:80, :97 |
| M-003 | `ending` | 3 | plan.md:227, :238 / tasks.md:91 |

Critical は無いので、cascade_enforce の対象になる指摘はありません。

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 3
- Round inheritance: resolved from 2: 8 / unresolved: 0 / new: 8
