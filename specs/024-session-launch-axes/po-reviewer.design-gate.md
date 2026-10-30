# po-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/024-session-launch-axes/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-003 (追加ディレクトリ)、FR-004〜FR-006 (上限)、FR-007〜FR-008 (セッション名)、FR-009〜FR-011 (プリセット版 2)、FR-012 (再開)、FR-013 (概要のタブ)、FR-014 (launch-usage 不変)、FR-015〜FR-017 (ADR / 記録)。SC-001〜SC-009 (マージの条件は SC-001〜SC-008、SC-009 は実機で「未実施」でもマージ可)
- 該当する charter / Confirmation: session charter の Journey 2 手順 3・5 (`charter.md:110`, `:112`)、Journey 4 手順 2 (`:133-134`)、業務ルール「無効になった下流の値は既定に戻し、UI で通知する」(`:191`)、KPI「依存解決の正しさ — 計測経路: E2E」(`:214`)、KPI「再利用率」(`:215`)。AD-064 Confirmation (pin 16・起動ゲートの拒否・preset-store の版・V-1 の実機記録)、AD-047 (失敗の理由 `max-turns` / `max-budget`)、AD-062 (registry の名前の欄)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲 (追加ディレクトリの読み取り範囲の広がりは UX の観点だけを M-007 で扱う)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (数値・名前の検証の文言と UX だけを E で扱う)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:7 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: po-reviewer は optional reviewer の担当範囲を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

024 は起動ダイアログの軸を 6 から 9 に増やす (10 キー): 追加ディレクトリ (登録フォルダの id で 0〜10 件。main がランタイムのパスに変換)、ターン数と費用の上限 (既定は「上限なし」。達したときの表示は O-4 のまま)、起動のときのセッション名 (SDK の `title`、registry の名前を初期化する)。プリセットは名前を除いた 9 キーで `presets.json` 版 2 にし、X-9 の再開では追加ディレクトリと上限を選び直せる軸として扱う。US-1 / US-2 は P1、US-3 / US-4 は P2。User Story の WHO / WHAT / WHY はどれも書かれており、Why は具体的な操作の不便 (親ディレクトリへの拡大・並列 10 本で監視できない・023 の改名の時間窓) に結びついている。SC はすべてテストの合否に落ちる形で書かれている。指摘は主に、前回の設定の復元・負の経路の文言・通知の内容・空の状態にある。

## Findings

### [High] 前回の設定 (`lastConfig`) から戻すダイアログで、上限の入力欄と名前の入力欄の初期化が定義されていない。上限が黙って消える (H-001) (scope: feature)

- **観察**: 今の `LaunchDialog.tsx:204-213` は、新規起動の形でも、拒否で戻った再開の形でも、下書きの初期値を `toLaunchDraft(session.lastConfig)` から作る。024 の設計では次の 3 点が重なる:
  - 上限の数の値は「入力の文字列を state に持ち、解釈の結果で下書きの数の値を決める」(`plan.md:235`)
  - `toLaunchDraft` は `sessionName` を落とす (`data-model.md:88`)
  - 名前は下書きの外の `sessionNameInput` に持つ (`tasks.md:78`)

  入力の文字列の初期値を数から写すと書かれているのは、再開の形の `initial` (`plan.md:238`、`tasks.md:91`) とプリセットの適用 (`tasks.md:89`) だけである。拒否の後・失敗の後の「やり直す」・受け付けの後・閉じた後に開き直した場合の `lastConfig` の経路は書かれていない。`data-model.md:261` は「やり直す」は名前を含む全部の軸に戻ると言うが、その仕組みを置く節 (§9) もタスクも無い。テストは「やり直す」で名前が戻ることだけを見ており (`tasks.md:92`)、上限が `lastConfig` から戻ることを見るテストは 1 件も無い
- **同種事象探索**: `lastConfig` で `LaunchDialog.tsx` を検索して 4 件 (`:76`, `:206`, `:209-210`, `:224`)。そのうち下書きの初期化は `:206` と `:210` の 2 件で、どちらも 024 の設計では入力の文字列に写されない
- **リスク/影響**: 「費用 2 USD まで」で起動して拒否 (例: `session-limit`) された利用者がダイアログから起動し直すと、入力欄が空 (「上限なし」) から解釈されて `maxBudgetUsd: null` で起動しうる。US-2 の価値 (費用の膨張を起動前に止める) がそのまま失われ、利用者は気づかない。名前が消えると US-4 AC6 を満たさない。O-3 の起動元の判定 (「前回の設定を変えずに起動し直した起動は前回の起動元」) にも影響しうる
- **推奨アクション**: data-model §9 に「ダイアログの初期化の時点で、`lastConfig` (新規の形・拒否で戻った再開の形) か `resume.initial` かプリセットの適用から、`maxTurnsInput` / `maxBudgetInput` を数から作った文字列で、`sessionNameInput` を `lastConfig.sessionName` (新規の形だけ) で初期化する」と 1 行足す。FE-020 と FE-030 に、拒否の後・やり直すの後の初期値をテストする行を足す (上限 30 / 2 で起動 → 拒否 → 開き直すと入力欄が「30」「2」で、送る config が同じ値)。US-2 に AC を 1 つ足す (Given 上限を付けた起動が拒否された / When ダイアログに戻る / Then 上限の入力は元の値)
- **根拠**: spec US-2 Why (`spec.md:120`)、US-4 AC6 (`spec.md:167`)、data-model §7.1 (`data-model.md:261`)
- **scope 根拠**: 本 feature の renderer の変更 (`LaunchDialog.tsx`、`launch-extra-axes.ts`) の中で直せる

### [Medium] 追加ディレクトリで main が拒否したときの文言が汎用の `invalid-config` だけで、どの軸が理由か分からない (M-001) (scope: feature)

- **観察**: 解決結果 DTO の取得 (IPC) に失敗したとき、renderer は「判定できません」と注記して起動を許し、main が変換できなければ拒否する (`research.md:69`、`tasks.md:50`)。ダイアログの後に登録が解除された場合なども main の `invalid-config` に落ちる (`research.md:84`)。今の `invalid-config` の文言は「カタログに無いモデル・非対応の effort・組み合わせの不一致など」で、追加ディレクトリに触れていない (`src/renderer/src/features/session/labels.ts:72-73`)
- **リスク/影響**: 利用者は外すべき項目を特定できない。IPC の失敗が続くと、注記 → 起動 → 汎用の拒否、の繰り返しから抜けられない
- **推奨アクション**: `invalid-config` の文言に「追加ディレクトリが使えない」を例として足す。または、IPC の失敗時の注記に「起動が拒否されたら追加ディレクトリを外してください」と回復の手順を書く。spec にこの負の経路の AC を 1 つ足す
- **根拠**: PO-6 (エラー時の出口)、`spec.md:187` (FR-002 の「起動は止めない」と、main の拒否の関係)

### [Medium] 費用の小数 3 桁と全角数字の不正に対する文言が、原因を伝えない (M-002) (scope: feature)

- **観察**: 費用の不正の文言は「費用は 0.01〜1000 の範囲で入力してください」だけである (`spec.md:91`、`data-model.md:305`)。一方で `1.234` (範囲内で小数 3 桁) も不正にする (`spec.md:129`)。ターン数・費用ともに全角数字を不正にする (`tasks.md:64`) が、文言は「整数で」「範囲で」としか言わない
- **リスク/影響**: 範囲内の値を入れて「範囲で入力してください」と言われると、利用者は原因が分からない。日本語の IME が有効なまま「３０」と打つのはよくある操作で、Principle VIII (日本語環境) の UX 損失にあたる
- **推奨アクション**: 費用の文言を「0.01〜1000 の範囲、小数 2 桁まで」にする。全角数字は NFKC で半角にしてから解釈するか、文言に「半角数字で」を足す。FE-020 の表を合わせて直す

### [Medium] 追加ディレクトリの選択肢をランタイムで絞らないため、選んだ直後に外れて通知が出る (M-003) (scope: feature)

- **観察**: `additionalDirectoryChoices(folders, folderId, selected)` は、作業フォルダ自身と選択済みを除くだけで、ランタイムからの到達を見ない (`data-model.md:285`、`spec.md:93`、`tasks.md:50`)。Win32 のランタイムで WSL のフォルダを選ぶと、依存解決 (`data-model.md:112`) がすぐに `unreachable` で外し、「このランタイムから使えないため外しました」を出す
- **リスク/影響**: 「選べる一覧に出ているのに、選ぶと外れる」という矛盾した UX になる。業務ルール (`charter.md:191`) の通知は「上流の軸を変えたとき」の通知であり、利用者が今選んだ値をその場で否定する使い方は想定していない
- **推奨アクション**: 選択肢から §2.3 の 3 (ディストロの不一致) に当たるフォルダを除くか、無効の選択肢にして理由を添える。US-1 AC1 に「このランタイムから使えないフォルダは選択肢に出ない (または無効)」を足す

### [Medium] `unregistered` の通知が、外したフォルダの名前を出せない (M-004) (scope: feature)

- **観察**: `unregistered` の判定は「`facts.folders` に id が無い」ことである (`data-model.md:110`)。表示名が引けなければ「(削除されたフォルダ)」を出す (`data-model.md:306`)。登録を解除したフォルダは定義上 facts に無いので、表示名は必ず引けない。プリセットは folder id しか持たない (`contracts/launch-config-v2.md:75`)
- **リスク/影響**: US-4 AC2 の通知は常に「追加ディレクトリ (削除されたフォルダ) は登録が解除されたため外しました」になる。複数のディレクトリを持つプリセットでは、どれが外れたかが分からない
- **推奨アクション**: 通知の文言を「登録が解除されたフォルダ N 件を追加ディレクトリから外しました」に変えるか、プリセットに表示名のスナップショットを持たせるかを決める (持たせる場合、パスではなく表示名だけにする)。spec の Clarifications (`spec.md:92`) の文言を実態に合わせる

### [Medium] 追加ディレクトリの選択肢が 0 件のとき (empty state) が定義されていない (M-005) (scope: feature)

- **観察**: US-1 AC1 (`spec.md:107`)、AC5 (`spec.md:111`)、FE-010 (`tasks.md:50-51`) は、選択肢がある場合と 10 件の上限の場合を書く。登録フォルダが作業フォルダ 1 つしか無いとき、全部を選び済みのとき、作業フォルダが未選択のときに「フォルダを追加」がどう見えるかは書かれていない
- **リスク/影響**: 空の select が押せるまま残るか、利用者が「フォルダを登録すれば足せる」と分からない。U-2 は「登録していないディレクトリを足したいときは先にフォルダを登録する」とする (`spec.md:82`) のに、その導線が UI に無い
- **推奨アクション**: 選択肢が 0 件のときは「フォルダを追加」を無効にし、「ほかの登録フォルダがありません。フォルダを登録すると追加できます」と出す、などの AC と文言を足す (`labels.ts` に置く)

### [Medium] 上限で止まった後の流れの記述が、今の分類 (終端の失敗) と食い違い、再開の初期値が止めた上限そのものになる (M-006) (scope: feature)

- **観察**: Edge Cases は、上限で止まった後に次のプロンプトを送った場合を「今の分類のまま。quickstart で記録」としている (`spec.md:176`)。quickstart V-2 の 3 は「続くか・同じ理由で止まるか」を記録する (`quickstart.md:27`)。しかし今の `classifyResult` は `success` 以外をすべて終端の `provider-error` にする (`src/agents/session-core.ts:593-597`) ので、行は失敗になり、次のプロンプトは送れない。再開の形の初期値は稼働中の行の元の上限である (`spec.md:165`) ため、上限で止まった行を再開すると、止めた上限がそのまま初期値に入る
- **リスク/影響**: US-4 の Why の中心「上限で止まったセッションを再開で引き上げて続ける」(`spec.md:156`) の入口と出口が、AC として明示されていない。そのまま「再開」を押すと同じ上限ですぐに止まり (費用が再開の前を含むならなおさら。RK-03)、利用者は理由が分からない
- **推奨アクション**: Edge Cases を「上限で止まった行は失敗の行になり (O-4 の理由)、『再開』で上限を選び直して続ける」に直す。US-4 に AC を足す (Given `max-turns` で止まった行 / When 再開 / Then 上限の初期値は止めた値で、上限で止まったことが分かる注記がある)。quickstart V-2 の 3 は「再開の操作が出ること」の確認に直す

### [Medium] 追加ディレクトリの中の読み取りが承認なしで通ることを、ダイアログで利用者に知らせない (M-007) (scope: feature)

- **観察**: AD-064 Consequences は「追加ディレクトリの中の読み取りは `default` でも承認なしで通る。利用者がこれを望まないときは追加ディレクトリを選ばない」としている (`docs/decisions/0064-…md:46`、`research.md:27`)。spec の US-1 AC2 は「Claude はそこのファイルを扱える (書き込みは今どおり)」だけで (`spec.md:108`)、読み取りの承認が省かれることを AC にも文言 (§9.3) にも書いていない
- **リスク/影響**: 利用者は判断の材料 (選ぶと承認カードなしで読まれる) を UI から得られない。ADR は利用者の判断に委ねているのに、その判断に要る情報を渡していない
- **推奨アクション**: 「追加ディレクトリ」の見出しの補足に「選んだフォルダの中は承認なしで読み取られます (書き込みは承認が要ります)」を置き、US-1 AC2 の Then に読み取りの扱いを明記する。V-1 の 2 の実機の結果で文言を確定する

### [Low] `same-as-folder` の通知の文言が spec に無く、data-model の表の書き方があいまい (L-001) (scope: feature)

- **観察**: spec の Clarifications に書かれた通知の文言は 2 種 (`spec.md:92`)。data-model は `unreachable / same-as-folder` を 1 つのセルにまとめ、括弧で別の文言を書いている (`data-model.md:306`)
- **推奨アクション**: data-model の表を理由ごとに 3 行に分け、spec の Clarifications に 3 つ目の文言を足す

### [Low] US-1 の中心の価値 (Claude が外のファイルを読める) が、実機の確認 (未実施でもマージ可) だけで確かめられる (L-002) (scope: feature)

- **観察**: SC-001〜SC-008 は options にキーが載ることまでを見る。「読める」ことは SC-009 だけで確かめ (`spec.md:234`)、未実施でもマージしてよい (`spec.md:239`)
- **推奨アクション**: 夜間の規則のとおりで構わない。roadmap の X-6 の行に、US-1 の価値が未確認であることを明記する (SH-010 に 1 文足す)

### [Medium] (H) 依存解決の新しい規則 (追加ディレクトリを外して通知する) が、charter の KPI の計測経路である E2E で確かめられない (M-008) (scope: feature)

- **観察**: charter の KPI「依存解決の正しさ」の計測経路は E2E である (`charter.md:214`)。024 の E2E 4 本 (`tasks.md:54`, `:67`, `:80`, `:93`) は、選んで起動する・プリセットを往復する、の正の経路だけで、ランタイムを切り替えて項目が外れ通知が出る流れ (US-1 AC3) と、登録を解除したフォルダを含むプリセットの適用 (US-4 AC2) は component テストにしか無い
- **推奨アクション**: FE-012 か FE-042 に、ランタイムの切り替えか登録解除を伴うプリセットの適用で `directoryResets` の通知が出ることを 1 本足す。偽の capability で行えないなら、その理由を spec に書く

### [Medium] (H) 新しい拒否の経路のログが既存の `invalid-config` と区別できない (M-009) (scope: feature)

- **観察**: 起動ゲートのログは理由のキーだけで (`src/main/app/launch-preparation.ts:99-101`)、追加ディレクトリの `directoryResets` による拒否と変換の失敗も `invalid-config` として出す (`data-model.md:142`、`tasks.md:48`)。モデル・effort の reset や作業フォルダの不一致と同じキーになる
- **リスク/影響**: サポートや開発者がログから原因 (追加ディレクトリか、他の軸か) を切り分けられない (PO-7 の運用・サポートの視点)
- **推奨アクション**: パスや id を出さずに、段を示すキー (例: `invalid-config:additional-directories`) を `logRejection` に渡す。renderer に返す `reason` は変えない。テストでログのキーを確かめる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `lastConfig` in `src/renderer/src/features/session/LaunchDialog.tsx` | 4 | LaunchDialog.tsx:76, :206, :209-210, :224 (下書きの初期化は :206 と :210) |
| M-001 | `'invalid-config'` in `src/renderer/src/features/session` (test を除く) | 1 | labels.ts:72 |
| M-006 | `max-turns\|error_max_turns` in `src` (test を除く) | 7 | session-core.ts:577, :625; agent-session.ts:29, :46, :47, :76; labels.ts:50, :152 (終端の分類は session-core.ts:593-597) |
| M-009 | `logRejection` in `launch-preparation.ts` | 2 | launch-preparation.ts:88, :100 |

## Verdict

- Critical: 0
- High: 1
- Medium: 9 (E: 7 / H: 2)
- Low: 2
