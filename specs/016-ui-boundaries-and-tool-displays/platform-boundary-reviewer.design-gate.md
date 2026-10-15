# platform-boundary-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-04
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-003 / FR-005 (拒否の取り消しを `meter` の `retraction` で運び、稼働中のストアから外す) — 境界の主張 (`SessionEvent` の種類を増やさない) に関わる
  - FR-006 / FR-010 (`Read` / `Glob` / `Grep` の表示。パスは表示用の文字列で解決しない。UNC の接頭辞を出さない) — Principle I に関わる
  - FR-007 (`WebFetch` の URL) — パスと同じ扱いの所在文字列に関わる
  - FR-011 (結果の状態。承認待ちを `toolUseId` の一致で決める) — 権限ゲートのデータ経路に関わる
  - SC-001 (取り消した id がストアから消える) / SC-005 (境界を広げない。固定テストと `git diff` で測る)
- touched files に該当する charter / Confirmation:
  - Constitution Principle I (パス操作は domain のパス API を通す) / II (プラットフォーム分岐) / III (権限ゲート)
  - AD-029 §3・§4・§5 (accepted。UNC の判定は 1 箇所に置き、`ui` からは届かない) と AD-032 による読み替え / AD-028 §3 規則 2 (agents は UNC を扱わない)
  - AD-041 (g) Confirmation (`QUERY_OPTION_KEYS` の pin) / AD-036 §4 P1-P3 (項目 14・16)
  - AD-047 Decision 2 (proposed。`meter` は数・真偽・列挙・モデルの id だけを運び、間引く) / AD-049 (proposed。本 spec)
  - runtime / isolation の charter の Out of scope への踏み込みは無い
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。File tree の prototype の汚染・URL・markdown は security-reviewer.design-gate.md の H-002 / H-003 / M-001 が扱う
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:1 High:1 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当 (a11y・ux・ui-coverage)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-6 は agents (`live-system-rows.ts` / `sdk-agent-session.ts`) で圧縮の境界・会話の作り直し・モデルの拒否・`informational` を O-2 のシステムイベントの行にします。拒否の取り消しは O-4 の `meter` に種類 `retraction` を足して運びます。renderer には `Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `Task*` の専用表示、結果の状態の純関数、`TranscriptAnnouncer` を新設します。Hook・背景の task・実行中の subagent (`includeHookEvents` / `getSubagentMessages`) は O-11 に送ります。

本 reviewer が見たのは、型と lint が見られない次の 3 点です。

- 表示用のパスの扱い (UNC)
- 承認待ちの判定が権限ゲートのデータ経路に触れるか
- SC-005「境界を広げない」が機械で守られているか

### 固有観点の判定

- **PB-1 (パス型の消失)**: C-001 / M-002 として指摘する。tool の入力のパスは本文 (`argsText`) の中の文字列として port を越え、名前空間を失う。renderer はどの名前空間か (WSL の POSIX・ホストの Windows・UNC) を知らない。過去ログはホストの config ディレクトリのセッションも読むので、Windows 形式と UNC の両方が実際に来る (AD-029 の実測表: ホスト既定 43 件のうち UNC が 7 件)
- **PB-2 (単一インスタンス仮定)**: 該当なし。新しい状態はセッションスレッドの `run()` の closure (O-4 data-model §2) か、`sessionId` をキーにした稼働中のストアに置かれる。`retraction` は同じセッションの `messages` だけに当たる (data-model.md:17)。ランタイムや distro を module スコープに持つ設計は無い
- **PB-3 (capabilities の虚偽)**: 該当なし。`capabilities` / `autoModeSafe` に触れない
- **PB-4 (権限ゲートの迂回)**: 迂回は無いと判断した。「承認待ち」の印は表示だけで、承認は既存の承認カード → `respond-permission` → `requestId` での照合 (session-core.ts:216-219) を通る。印から承認する経路は無い。権限モードを注入する経路も足されない。ただし判定に使う `toolUseId` は今の型に無い (H-001)
- **PB-5 (多段パス変換)**: 該当なし。パスを解決も変換もしない (FR-006)。docker endpoint にも触れない
- **PB-6 (永続環境)**: 該当なし。ファイル・ボリューム・ディストロへの書き込みが無い (書き換えるのは docs だけ)
- **PB-7 (lint とルールの網羅性)**: M-001 / M-002 として指摘する

## Findings

### [Critical] `Read` / `Glob` / `Grep` の UNC の扱いを renderer に置いている。この置き場では accepted の AD-029 §3・§4 と Principle I を守って実装できない (C-001) (scope: feature)

- **観察**:
  - **spec 側の要求**:
    - spec.md:130: 「`Read` の `file_path` が WSL のパス・UNC → 表示用の文字列として出し、UNC の接頭辞は出さない (R-2 FR-042 の規則を使う)」
    - data-model.md:33: `Read` の中身を「全体のパス (R-2 の表示の規則で UNC の接頭辞を出さない)」と定める
    - tasks.md:27 (FE-020): これを renderer の `file-tool.aui.tsx` で実装する
    - plan.md:26: Principle I を ✅ とし、根拠に「UNC の接頭辞を出さない (R-2 FR-042)」を挙げる
  - **R-2 の規則の実体**: `src/domain/runtime/path-api.ts:177` の `classifyRawPath` (AD-032 で 1 関数に畳んだもの)。同ファイル :39-40 は「本ファイルは標準モジュールに依存するため、`ui` から到達してはならない」と書く
  - **AD-029 (accepted)**:
    - §4 (docs/decisions/0029-session-cwd-origin-classification.md:101-114): 「判定関数は `ui` から到達できない。これは意図した性質である … renderer は DTO の `originKind` (参照キー) を読んで表示を分岐する」
    - §3 (:98-99): 「文字列操作で接頭辞を剥がさない」
  - **機械の制約 (どれも renderer での実装を塞ぐ)**:
    - `.dependency-cruiser.js:302-309` の `ui-not-to-core` (推移的到達) が、renderer から `path-api.ts` (`node:path` を import する) への到達を error にする
    - 検証項目 12 (`check.mjs:565-596`、`allowlists.mjs:315-324`) が、UNC の接頭辞リテラルを `path-types.ts` / `path-api.ts` 以外で違反にする
    - 生成側に置く道も閉じている。項目 13 (`allowlists.mjs:341`, `:504-511`) が `src/agents/` での `classifyRawPath` / `parseWslUncPath` の呼び出しを禁じる。AD-028 §3 規則 2 は「agents は UNC を扱わない」と定める
    - tool の本文は main を通らない (AD-034)
  - **したがって FE-020 の実装は次の 2 つのどちらかになり、どちらも accepted の決定に反する**:
    - (a) renderer で `^[\\/]{2}` のような正規表現を書き、UNC を判定して剥がす。2 つ目の判定箇所になり、AD-029 §3 / AD-032 と Principle I (「接頭辞照合は … 同モジュール群の別の公開面」) に反する。項目 12 はリテラルしか見ないので、これは素通りする
    - (b) `path-api` を import する。`ui-not-to-core` に反する
  - **R-2 の規則とも食い違う**: R-2 は解析できない UNC (`opaque-unc`) に表示値を持たせない (path-api.ts:145-152「何も出さない」)。spec.md:130 の「表示用の文字列として出し、接頭辞は出さない」は、剥がした残りを出す形で、これと合わない
  - **適用範囲の漏れ**: UNC の規則は `Read` の `file_path` にしか書かれていない。`Glob` / `Grep` の `path` (data-model.md:34-35)、File tree に写す結果のファイル一覧、`Grep` の text 出力 (`path:line:...`) は規則の外にある
- **同種事象探索**:
  - `UNC|WSL のパス` で specs/016 (reviewer の出力を除く) を探した: 5 件 (spec.md:130, spec.md:196, plan.md:26, data-model.md:33, tasks.md:27)。renderer に置く以外の置き場を書いた箇所は 0 件
  - renderer の既存の UNC の扱い (`\bUNC\b|wsl\.localhost|originKind|cwdDisplay`、テストを除く): src/renderer/src/features/session-list/SessionListScreen.tsx:139, :142, :382, :386-395 の参照キーと `cwdDisplay` だけ。**renderer で UNC を判定するコードは 0 件**。UNC の接頭辞リテラルを renderer に置いた箇所も 0 件 (項目 12)
  - 今ある生のパスの表示 (同じ種類の表示): code-diff.aui.tsx:126, :136, :148 (`args.file_path` をそのまま出す)。ToolFallback の `argsText`
- **リスク/影響**: 実装者は (a) を選ぶしかなく、R-2 の pr-gate で 4 ラウンドかけて 1 箇所に畳んだ UNC の判定 (cwd-origin.ts:86-90 の注記) が renderer にもう 1 つできる。綴りの取りこぼし (`\\?\UNC\`、先頭の空白、単一のバックスラッシュの混入) は R-2 で実際に起きた (path-api.ts:179-211)。renderer 側の判定は項目 12 にも項目 13 にも掛からない
- **推奨アクション** (どちらかを選び、spec.md:130 / :196、plan.md:26、data-model.md:33-35、tasks.md:27 を同じ PR で直す):
  1. **最小案**: tool の入力のパスは本文 (AD-034) として扱い、FR-042 (列挙の IPC と `cwdDisplay` の規則) の対象外であると明記する。「UNC の接頭辞を出さない」を削る。見出しのファイル名だけを M-002 の規則で取り、全体の値は今の ToolFallback / Code diff と同じく本文として出す。AD-049 に「tool の入力のパスは本文であり、FR-042 を当てない」を 1 行足す
  2. UNC を隠すと決めるなら、新しい ADR か AD-049 の決定で AD-028 §3 規則 2 を読み替える。domain/session の純関数 (cwd-origin.ts と同じく `classifyRawPath` を使う) を生成側 (live-message.ts と transcript.ts) で通し、結果を参照キーで運ぶ。`TRANSCRIPT_PART_FIELDS` が変わるので SC-005 も直す。`Glob` / `Grep` の `path` と結果の一覧にも同じ規則を当てる
- **根拠**: Constitution Principle I (NON-NEGOTIABLE) / AD-029 §3・§4・§5 (accepted) / AD-032 / AD-028 §3 / 検証項目 12・13 / `.dependency-cruiser.js` の `ui-not-to-core`
- **scope 根拠**: spec / data-model / tasks の文面と置き場の問題で、本 feature の中で直せる

<!-- gate-common: demoted Critical → High (no cascade evidence) finding=FE-020 -->
<!-- design-gate 集約: 上の降格は誤り。cascade_enforce が本文の最初の `(FE-020)` を指摘の ID として拾い、表の C-001 の行 (件数 5) と照合できなかった。同種事象探索の件数は本文の次の行にある。Critical に戻した (2026-10-04) -->

### [High] 「承認待ち」を決める `toolUseId` が、承認の要求の型にも `canUseTool` の受け口にも無い。足すと権限ゲートの核 (`createCanUseTool`) と `permission-request` の中身が変わるが、plan / tasks / SC-005 のどれにも載っていない (H-001) (scope: feature)

- **観察**:
  - data-model.md:52 は、承認待ちを「表示中のセッションの承認の要求の `toolUseId` が一致」で判定する
  - 今の型にはこのフィールドが無い:
    - `PermissionRequest` (src/domain/session/agent-session.ts:137-146) は `requestId` / `toolName` / `input` / `scope` だけを持つ
    - `CanUseToolLike` の options (src/agents/session-core.ts:79-83) は `{ signal }` だけを受ける
    - `createCanUseTool` (session-core.ts:169-185) は要求に `toolUseId` を載せない
  - SDK 側は `toolUseID: string` を渡している (node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:255-258)
  - renderer の decoder (src/renderer/src/features/session/session-event-decoder.ts:31-39, :64) は `request` を 4 フィールドで検査した後、**値全体をそのまま通す** (cast)。足したフィールドは検査されずに届く
  - plan.md:18 の agents の変更は `sdk-agent-session.ts` / `live-system-rows.ts` だけ。session-core.ts / agent-session.ts / session-event-decoder.ts は Project Structure (plan.md:103-110) にも tasks にも無い
  - SC-005 (spec.md:187) は「承認の応答の形 (`toPermissionResult`)」を差分 0 の対象に入れていない。O-5 の SC-005 (specs/015-.../spec.md:212) は入れている
- **同種事象探索**:
  - `toolUseId|toolUseID` で src/domain/session/agent-session.ts と src/agents/session-core.ts を探した: 0 件
  - `PermissionRequest|permission-request|承認の要求` で specs/014・015 を探した: 型を変える記述は 0 件 (015 data-model.md:115 は `toolName` による表示の分岐だけ)
- **リスク/影響**:
  - 迂回ではない (PB-4 の判定のとおり)
  - ただし実装は次の 2 つに分かれる:
    - (a) 4 ラウンドの design-gate で固めた `createCanUseTool` (session-core.ts:16-21 の注記) と `permission-request` の中身を、記録の無いまま広げる。decoder は検査なしで通す
    - (b) `toolName` の一致で代用する。並列の同名 tool (Bash × 3 など) で、承認待ちでない tool に印が付き、承認待ちの tool に「結果待ち」が付く
  - 承認カードは `toolName` と入力を出すので、誤承認には直結しない。それでも「どの呼び出しを承認しているか」の手がかりが食い違う
- **推奨アクション**:
  - 案 1: plan / tasks に「`createCanUseTool` が `options.toolUseID` を形の検査 (O-4 data-model.md:70 と同じ `^[A-Za-z0-9_-]{1,128}$`) のうえで `PermissionRequest.toolUseId` に載せる」を足す。`isPermissionRequest` の検査を足し、cast をやめて組み直す。SC-005 に「`toPermissionResult` の出力は `{behavior, message}` のまま (P2)」を足す。AD-049 に 1 行記録する
  - 案 2 (最小): data-model.md:52 の行を「承認待ち (セッションの状態が `awaiting_permission`) なら、結果の無い tool の印を出さない (承認カードに任せる)」に変え、tool ごとの照合をやめる
- **根拠**: Principle III / AD-036 §4 P1-P3 (承認の往復) / AD-041 Confirmation (P2)
- **scope 根拠**: data-model §3 の規則が今の型で実装できない。本 feature の文面で直せる

### [High] `retraction` を `meter` に載せると、間引きで捨てられ、agents に残った同じ id のメッセージが送り直されて戻ってくる。「`SessionEvent` の種類を増やさない」は SC-005 の固定テストを形の上で通るだけになる (H-002) (scope: feature)

- **観察**:
  - **間引きで捨てられる** (security-reviewer M-005 と重なる):
    - O-4 の data-model.md:81 は「セッションあたりの `meter` と間引きの対象の行の合計は 1 秒に 20 件まで (超えた分は捨てる。最新の値は次の境で送る)」、:83 は「`finish()` → 全部の保留と timer を捨ててから `ended` を送る」と定める
    - O-5 は `init-report` / `commands` をこの上限から外すと明記した (specs/015-.../spec.md:142、data-model.md:76)
    - O-6 の data-model.md:17 と AD-049 Decision 2 (:28) は `retraction` を外すと書いていない。`retraction` は「最新の値」で置き換えられない一度きりの指示なので、捨てられると二度と届かない
  - **送り直しで戻ってくる** (本 reviewer の観点):
    - agents の `createLiveToolResultTracker` (src/agents/live-tool-results.ts:108-121) は、tool の結果が届くと、覚えている assistant メッセージを**同じ id で丸ごと送り直す**
    - renderer の `upsertMessage` (src/renderer/src/features/session/running-session-store.ts:94-103) は、id が見つからなければ末尾に足す
    - plan.md:96 の RK-02 は「外したメッセージの tool の結果待ち … は既存の経路のまま」とする。そのため取り消した後に結果が届くと、外したメッセージが transcript の末尾に戻る
    - BE-010 / FE-010 (tasks.md:21-22) は、agents 側でその id を忘れること (`forget`) を含まない
  - **境界の主張**:
    - AD-047 Decision 2 (docs/decisions/0047-…md:35) は `meter` を「数・真偽・列挙・モデルの id だけを運ぶ」と定める。`retraction` はメッセージの id の列で、ストアの `messages` を書き換える指示である
    - SC-005 (spec.md:187) と quickstart.md:7 が測るのは `SESSION_EVENT_KINDS` の差分だけ。`MeterUpdate` の種類の集合は測っていない
    - renderer の decoder の変更が plan.md:19 / :108 に無い。O-5 の plan.md:20 は `session-event-decoder.ts` を挙げている
  - **観測**: 行の `detail` の `retracted=<n>` は `retracted_message_uuids` の件数そのもの (data-model.md:11)。実際に外すのは、形の検査を通った 128 件までの id だけ (:17)。捨てられた場合も行は「{n} 件のメッセージを取り消しました」(:76) と出る
- **同種事象探索**: `retraction` を specs/016・docs/decisions で探した: 9 件 (spec.md:147, research.md:28, plan.md:9, :17, :78, data-model.md:17, tasks.md:17, :21, AD-049:28)。間引きの例外を書いた箇所は 0 件。agents 側で忘れる処理を書いた箇所は 0 件
- **リスク/影響**:
  - FR-003 / SC-001 (「取り消しで指定された id のメッセージが稼働中のストアから消える」) が、並列の tool が多いときや結果が後から届くときに成り立たない
  - SDK の指示 (sdk.d.ts の `retracted_message_uuids`「remove these messages from transcript state on receipt」) に反し、拒否された応答が会話の一部に見える
  - データの経路にメッセージを書き換える指示が加わるのに、種類の pin テストはそれを見ない
- **推奨アクション**:
  1. data-model §1 に「`retraction` は O-4 の間引きと上限に掛けない (O-5 と同じ)。`finish()` の前に送り切る」を足す
  2. agents は `retraction` を送るとき、live-tool-results の tracker からその id を忘れる (`forget(messageIds)` を足す)。後から届いた結果は結果だけのメッセージ (`result:<toolUseId>`) にするか捨てるかを決める。BE-010 に足す
  3. renderer のストアは外した id を覚え (セッションごと・上限つき)、同じ id の `message` を足さない。FE-010 に足す
  4. plan の renderer の一覧に `session-event-decoder.ts` (`retraction` の検査) を足す
  5. SC-005 を「`SESSION_EVENT_KINDS` の差分 0。`MeterUpdate` の種類は O-4 の後の値から `retraction` の 1 つだけ増える」と正直に書き、pin テストを置く
  6. AD-049 に「AD-047 Decision 2 (運ぶものの許可リスト) の読み替え」と明記する
  7. 拒否の行の件数は、agents が送った `messageIds` の件数にそろえる
- **根拠**: AD-047 Decision 2 / AD-049 Decision 2 / AD-043 (データの経路) / spec SC-001・SC-005
- **scope 根拠**: 本 feature の data-model / tasks / SC で直せる。間引きの例外は O-5 の先例どおりの形

### [Medium] SC-005「境界を広げない」の機械の検査に穴がある。O-11 に送った領域の `Query.backgroundTasks()` と、パスを解決する `Query.readFile()` が項目 16 の禁止リストに無い。動的 import は項目 14 を抜ける (M-001) (scope: system)

- **観察**:
  - **守られているもの**: `includeHookEvents` (sdk.d.ts:1731) は query の options のキーなので、`QUERY_OPTION_KEYS` の pin テスト (src/agents/session-core.test.ts:191) と `buildQueryOptions` の固定のリテラルで捕まる
  - **名前付き import の直接呼び出しだけが捕まるもの**: `getSubagentMessages` (sdk.d.ts:844) は関数として export されている。項目 14 (check.mjs:687-709) は名前付き import の呼び出しの形だけを見る。再束縛と `(await import(...)).getSubagentMessages()` は素通りする。これは tests/rule-fixtures/expected.mjs:650-660 の `sdk-forbidden-call-alias` に既知の穴として記録され、持ち主は X-6
  - **禁止リストに無いもの**: 項目 16 の P3 は禁止リスト (allowlists.mjs:420-427) で、O-5 が 11 個足しても (specs/015-.../spec.md:179) 次のメソッドは残る:
    - `readFile` (sdk.d.ts:2820。「Path is resolved against cwd」。パスを解決してファイルを読む)
    - `backgroundTasks` (:2962。前面の task を背景に移す。O-11 の範囲「後から背景に移った task」そのもの)
    - `reloadOutputStyles` (:2856)
  - **SC-005 の書き方**: spec.md:187 には O-5 の SC-005 にある「`sdk-agent-session.ts` の `Query` のメソッドの呼び出しは `interrupt` だけ」が無い
  - **AD-049 の義務の書き方**: AD-049 Decision 1 (:27) は O-11 の ADR の義務を `includeHookEvents` と `getSubagentMessages` の 2 つだけにしている
- **同種事象探索**: sdk.d.ts:2611-2972 の `Query` のメソッド 30 余りと、O-5 の拡張後の `QUERY_MUTATION_METHODS` を突き合わせた。禁止リストに無いのは `readFile` / `backgroundTasks` / `reloadOutputStyles` / `getContextUsage` / `accountInfo` / `supported*` / `initializationResult` / `close` など。このうち状態を変えるか、パスを解決するものは 3 件 (:2820, :2856, :2962)
- **リスク/影響**:
  - O-6 はこれらを呼ばないので、今は害が無い
  - しかし File tree の項目から中身を見せたくなったときに `query.readFile(path)` を呼ぶと、「パスを解決しない」(FR-006) が機械の検査なしに破れる
  - O-11 が `backgroundTasks()` を呼ぶと、ADR の義務の一覧に無いまま境界が広がる
- **推奨アクション**:
  - SC-005 に O-5 と同じ「`Query` のメソッドは `interrupt` だけ」を足す
  - AD-049 Decision 1 の O-11 の義務に `backgroundTasks()` (と `stopTask` の使用) を足す
  - `readFile` / `backgroundTasks` / `reloadOutputStyles` を `QUERY_MUTATION_METHODS` に足すか、O-5 が送った「正の形 (`interrupt` 以外を違反)」への置き換えを項目 16 の持ち主で先に済ませる
- **根拠**: Principle IV / AD-036 §4 P3 / AD-041 (g) / PB-7
- **scope 根拠**: 項目 16 の作りは system。SC-005 と AD-049 の文面は本 feature で直せる

### [Medium] renderer でパスを分解する規則 (ファイル名・File tree) が決まっていない。分解は Principle I の機械の検査が見ない領域で、区切りをプラットフォームで選ぶ実装は項目 8 も見ない (M-002) (scope: feature)

- **観察**:
  - **分解が決まっていない**: data-model.md:33-35 は「ファイル名 (パスの末尾)」「`path` があれば末尾」「結果のファイルの一覧を File tree」と書くが、区切り (`/` か `\` か) と木の組み方を決めていない。入力には 3 つの名前空間の文字列が来る (PB-1。WSL の POSIX、ホストの config の Windows 形式、UNC)
  - **既知の穴の前提が崩れる**: tests/rule-fixtures/expected.mjs:673-685 の既知の穴 `ui-path-concat` は、「renderer は main が返した完成パスだけを使う」(FR-025) を代わりの防御にしている。O-6 は renderer がパスを分解する初めての transcript の表示で、この前提が成り立たない
  - **既存の同じ種類のコード**: src/renderer/src/features/session/session-view.ts:252-256 の `pathTail` (`/` と `\` の両方で分ける) と src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx:574 がある
  - **項目 8 の穴**: 項目 8 の `PLATFORM_BRANCH_PATTERNS` (allowlists.mjs:564-579) は `process.*` / `os.*` だけを見て、`navigator.platform` / `navigator.userAgent` / `navigator.userAgentData` を見ない。「Windows なら `\` で分ける」と書いた renderer のコードは捕まらない
- **同種事象探索**:
  - renderer でパスを分解するコード: 2 件 (session-view.ts:253, WorkspaceFoldersScreen.tsx:574)
  - 項目 8 の `navigator` の検査: 0 件
- **リスク/影響**:
  - 実行環境 (ホスト OS) で区切りを選ぶと、Principle II が禁じる「ホスト OS とランタイムの不一致」(Docker / WSL) をそのまま持ち込む
  - POSIX の名前に含まれうる `\` で木が割れる
  - 解決はしないので害は表示に限られる
- **推奨アクション**:
  - data-model §2 に「分解は表示だけ。区切りは `/` と `\` の両方 (`pathTail` と同じ規則を共通の純関数にして再利用する)。ホスト OS やランタイムで分けない。分解した値を IPC・port に戻さない」と書く
  - `expected.mjs` の `ui-path-concat` の注記に、O-6 が分解を足したことと表示だけであることを記録する
  - 項目 8 に `navigator.(platform|userAgent|userAgentData)` を足す (system)
- **根拠**: Principle I / Principle II / AD-003 (トランスポート軸) / PB-7
- **scope 根拠**: 区切りの規則は本 feature の data-model で直せる。項目 8 の拡張は system

### [Medium] H: 上の指摘を検出するテストと pin が tasks に無い (M-003) (scope: feature)

- **観察**:
  - FE-020 (tasks.md:27) の「UNC の接頭辞を出さない」のテストは、renderer で判定を手書きしても通る。C-001 の逸脱を検出できない。単一の判定 (`classifyRawPath`) を通っていることを確かめる手段が無い
  - `PermissionRequest` のフィールドの集合と `MeterUpdate` の種類の集合に pin テストが無い。今の pin は `SESSION_EVENT_KINDS` (agent-session.kinds.test.ts)、`QUERY_OPTION_KEYS` (session-core.test.ts:191)、`TRANSCRIPT_PART_FIELDS` (transcript-schema.test.ts) の 3 つ
  - BE-010 / FE-010 に、取り消した後に結果が届く場合のテスト (H-002 の送り直し) と、間引きの飽和の下で `retraction` が届くテストが無い
  - RK-02 (plan.md:96) は「テストで固定」とするが、取り消したメッセージの tool の承認カードが残るときの見え方 (何の操作か分かるか) を確かめる項目が tasks に無い
- **同種事象探索**: tasks.md の BE-010 / FE-010 / FE-020 / FE-030 を突き合わせた。該当するテストの記述は 0 件
- **リスク/影響**: C-001 / H-001 / H-002 を直しても、退行を検出できない
- **推奨アクション**:
  - BE-001 に `MeterUpdate` の種類の pin (`retraction` を含む集合)、`PermissionRequest` のフィールドの pin (H-001 で足すなら `toolUseId` を含む)、`toPermissionResult` の出力の pin を足す
  - BE-010 に「`retraction` の後に同じ id の `message` を送らない」「20 件/秒が埋まっていても `retraction` が届く」を足す
  - FE-010 に「外した id の `message` が再び届いても足さない」を足す
  - C-001 で案 1 を選んだ場合: FE-020 に「`file_path` を本文として出す」のテスト (ToolFallback と同じ値) を足す
  - C-001 で案 2 を選んだ場合: 生成側の純関数に cwd-origin-unc.test.ts と同じ綴りの表 (3 綴り・`\\?\UNC\`・先頭の空白・単一のバックスラッシュ) を当てる
- **根拠**: reviewer-base H (自分の担当範囲のテストと退行) / AD-041 Confirmation (pin テストの方式)
- **scope 根拠**: tasks に足せば本 feature で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `UNC\|WSL のパス` in specs/016 (reviewer の出力を除く) | 5 | spec.md:130, spec.md:196, plan.md:26, data-model.md:33, tasks.md:27 |
| C-001 | `\bUNC\b\|wsl\.localhost\|originKind\|cwdDisplay` in src/renderer/src (テストを除く) | 手書きの UNC の判定 0 (参照キーの利用 1 ファイル) | SessionListScreen.tsx:139, :142, :382, :386-395 |
| C-001 | 生のパスを出す既存の表示 | 3 | code-diff.aui.tsx:126, :136, :148 |
| H-001 | `toolUseId\|toolUseID` in agent-session.ts / session-core.ts | 0 | — (SDK 側 sdk.d.ts:258 にだけある) |
| H-001 | `PermissionRequest\|permission-request\|承認の要求` in specs/014・015 | 型の変更 0 | 015 data-model.md:115 (表示の分岐だけ) |
| H-002 | `retraction` in specs/016・docs/decisions | 9 (間引きの例外 0・agents 側で忘れる処理 0) | spec.md:147, research.md:28, plan.md:9, :17, :78, data-model.md:17, tasks.md:17, :21, AD-049:28 |
| H-002 | 送り直しと upsert | 2 | live-tool-results.ts:108-121, running-session-store.ts:94-103 |
| M-001 | `Query` のメソッド vs `QUERY_MUTATION_METHODS` (O-5 の拡張後) | 状態を変えるかパスを解決するもの 3 | sdk.d.ts:2820, :2856, :2962 |
| M-002 | renderer のパスの分解 / 項目 8 の `navigator` | 2 / 0 | session-view.ts:253, WorkspaceFoldersScreen.tsx:574 / allowlists.mjs:564-579 |
| M-003 | tasks のテストの記述 | 0 | tasks.md:21, :22, :27 |

## Verdict

- Critical: 1
- High: 2
- Medium: 3
- Low: 0
