# architecture-reviewer レビュー: supervisor 分離とマルチセッション (X-5)

**Run**: 2026-10-01T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/009-session-supervisor-and-multi-session/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-003: supervisor の形と、本文の出口を transport に閉じること。AD-010 / AD-030 §5 / AD-034 §1 / AD-036 §1・§2 / Principle VII・IX に関わる
  - FR-002: 調停役スレッドは本文を JSON として解釈しない。項目 18、AD-031 §2
  - FR-004: 状態通知、バッチ化、`acceptBatch`、窓の外で送れる例外
  - FR-005 / FR-006: 上限 10、枠の判定に `claudeAlive` を使うこと、X-4 経路の再利用
  - FR-007: 制御の宛先、`requestId`
  - FR-008〜FR-011: renderer のストア、一覧、`ended` の導出、終了・停止・閉じる
  - FR-012〜FR-014: 失敗の閉じ込め、supervisor の異常終了、終了処理、renderer の再読み込み
  - FR-015 / FR-016: AD-043 の読み替え範囲、glossary、Constitution の追随
  - SC-001〜SC-010: 全件。特に SC-002 / SC-004 / SC-006 / SC-008 / SC-009
- touched files に該当する charter / Confirmation: session charter (Scope・業務ルール・KPI・Journey 3・Key concepts) / _overview.md の Cross-domain invariants VII / IX / X / AD-010 Decision、AD-023 §1 / §3 / §5 / §6 / §7、AD-030 §5、AD-031 §1 / §2 と訂正節、AD-034 §1、AD-036 §1 / §2 / §3、AD-038 D3 / D5、AD-041 / Constitution Principle VII (Statement)、IX (Examples・現状の制約)、改定手順、バージョニング方針表
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:2 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: 永続化スキーマの変更なし。一覧の element 選定は ui 側
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (担当範囲のテストの欠落は H-201 / M-202 の推奨アクションに含めて数えた)

## スコープ要約

R2 の主な修正は、本文の出口を transport の `openBodySink` に戻したこと、renderer に `ended` を導入したこと、状態通知の受信規則を `acceptBatch` 1 つにまとめたこと、AD-043 を proposed のうちに書き換えてから accepted にする手順にしたことの 4 点である。利用者の決定事項は前提として扱った。AD-043 は未起票のため plan.md:245-260 を草稿として照合した。

### R2 の自分の指摘の判定

| R2 ID | 判定 | 根拠 |
|---|---|---|
| H-101 (supervisor-core が経路種別で分岐) | resolved | plan.md:16・163-171、Decision 1 (plan.md:250)、spec FR-001、BE-003 / BE-005。SH-000 (2) の直送分岐では未定義が残る (M-201) |
| H-102 (`done` の二義性と composer の dead-end) | resolved | plan.md:233・236、spec FR-009 / FR-010、SH-002、FE-013。`killed` を `ended` に置き換えたことで処理中に新しい窓ができた (H-201) |
| M-101 (IX Good example / 直送分岐の本文の形) | resolved | SH-092、Decision 2、plan.md:190。PATCH の区分に別の問題 (M-203) |
| M-102 (条件分岐のまま accepted) | resolved | SH-001、plan.md:247 |
| M-103 (受信検証が 2 箇所) | resolved | `acceptBatch` を唯一の正本にした。即時に届く false の経路が迂回しうる (M-202) |
| M-104 (VIII の E2E への波及) | resolved | SH-011 |
| L-101 (`stdio: 'ignore'` の理由) | resolved | plan.md:205 |
| L-102 (単独起動の字面) | 部分的に resolved | AD-010 が FR-015 の読み替え対象に無い (L-201) |

## Findings

### [High] 終了・強制終了の処理中 (最大 3 秒) は composer が有効のままで、セッションスレッドは `done` で受けた送信を `running` に戻す。X-1 で塞いだ dead-end が再発し、終了したセッションの run-state も巻き戻る (H-201) (scope: feature) — new (R2 H-102 の修正から派生)

- **観察**:
  - X-1 の kill は `process.exit(0)` で即座に終わり (`sdk-agent-session.ts:391-404`)、終了後に制御を受ける窓は無かった。plan.md:186 は kill を「子の kill → 子の exit 待ち (期限 3 秒) → `ended`」に変え、plan.md:185 の `end` も子の exit を最大 3 秒待つ。この間、main の registry は `threadAlive: true` のままなので制御は転送される。
  - 状態機械は `done` で送信を受けると `running` に戻す (`run-state.ts:106-108`)。kill と `end` はどちらも `done` に遷移し、kill の経路では `promptQueue.close()` が既に呼ばれている。
  - renderer はこれまで composer の無効化を `killed` で即座に行っていた。plan はこれを `ended` に置き換え、`killed` を文言の出し分けだけに残す。`ended` が true になるのは状態通知が届いてからである。`ending` は終了ボタンの二度押しを防ぐだけで、composer には使われていない。
- **同種事象探索**: renderer/features/session で `killed` を 4 件 (`SessionScreen.tsx:140`, `:165`, `:189`, `:286`)。終了・強制終了の処理中の送信を扱うテスト観点は tasks に 0 件。
- **リスク/影響**: 最大 3 秒 + 100ms のあいだ送ったプロンプトは閉じたキューに入って消える (X-1 pr-gate po H-001 / H-401 と同じ状態)。セッションスレッドは `state: running` を出し直し、終了済みの行に停止と閉じるが同時に出る。「`done` に遷移したら以後は受理しない」という不変条件が、プロセスの終了という副作用に暗黙に頼っていた。
- **推奨アクション**:
  - セッションスレッドに「終了要求を受理済み」(`closing`) の状態を持たせ、kill / `end` の後の `send-prompt` / `respond-permission` / `interrupt` は無視する。
  - renderer の composer の無効化とキューの終端判定を `ended || killed || ending` にする。spec FR-010 に「終了・強制終了を要求した時点で無効」を足す。
  - BE-002 に「kill / `end` の後、`ended` までの間に届いた `send-prompt` は状態を変えず、何も送らない」を、FE-013 に「押した直後から composer が無効」を足す。
- **根拠**: X-1 pr-gate po H-001 / H-401、spec FR-010 / FR-011、run-state.ts の遷移規則
- **scope 根拠**: plan の agents 節と renderer 節、BE-002 / FE-012 / FE-013、spec FR-010 で直せる

### [Medium] SH-000 (2) の直送分岐で、標準入出力経路の本文の運び方と、AD-030 §5 を守る形が決まっていない (M-201) (scope: feature) — new

- **観察**: plan.md:190 は直送の分岐で「調停役スレッドの本文中継を外す」とするが、標準入出力経路には port が無く、SC-009 / US-3 AC4 はこの経路で本文が行として返ることを求めている。直送の分岐では supervisor-core が「port を Worker の `transferList` に渡す」か「Worker から本文を受けて行に書く」かを選ぶことになり、`openBodySink` には Worker へ渡す port を取り出す口が無い。選択が supervisor-core 側の経路の判定に戻る。2 つの経路で本文の形も違う。
- **同種事象探索**: plan.md で `直送` を 3 件 (`:190`, `:251`, `:257`)。いずれも標準入出力経路の扱いに触れていない。
- **リスク/影響**: SH-000 (2) が成立した場合、R2 H-101 と同じ drift が直送分岐で再発し、Decision 1 の宣言と実装が食い違ったまま AD-043 が accepted になりうる。
- **推奨アクション**: 直送の分岐では transport が「Worker 用の本文の出口」を作る (例: `{ transfer?: MessagePort } | { relay: (payload) => void }` を返し、supervisor-core は種別を見ずに Worker の初期化 message に載せる)。標準入出力経路は中継を残す。本文の形の違いを Decision 2 に書き、BE-003 / BE-005 の観点に足す。
- **根拠**: AD-030 §5、AD-043 Decision 1 の草稿、Principle VII
- **scope 根拠**: plan の agents 節と ADR 節、BE-003 / BE-005 で直せる

### [Medium] 即時に送る `claudeAlive: false` (`child-exited`・Worker の異常終了) の扱いが決まっていない。relay に流せば FR-004 / SC-004 の「窓 1 つあたり 1 回」を超え、流さなければ registry が `acceptBatch` の外で更新される (M-202) (scope: feature) — new (R2 M-103 の修正から派生)

- **観察**: plan.md:173 / :176 は即時に false を送るとし、R-03 は「枠の解放は即時」とする。一方、窓の外で送ってよいのは supervisor の異常終了の合成だけ (spec FR-004 / SC-004)。launch-service が扱うと書かれているのは `status-batch` と `thread-ended` だけで、`onChildExited` を registry に反映する経路は書かれていない。main が合成する `supervisor-exited` が registry をどう更新するか (`acceptBatch` を通すのか、通すなら終了した世代の値が「現行世代」の照合で捨てられないか) も書かれていない。
- **同種事象探索**: spec / plan / tasks で `即時` を 9 件。po-reviewer の今回の M-001 も同じ問題を挙げている。本指摘は registry 側の観点である。
- **リスク/影響**: どちらを選んでも spec か plan に反する。即時の false を registry に反映する経路が `acceptBatch` の外に生えると、単調性と世代照合が迂回される。
- **推奨アクション**: (a) 即時の false は supervisor-core がバッチ窓を前倒しで flush する形で `status-batch` に載せ `acceptBatch` を通し、FR-004 / SC-004 の例外に足す。または (b) main 内の枠の解放だけを domain の関数で即時に行い (`acceptBatch` に `child-exited` を入力として取らせる)、renderer へは次の窓で送り、R-03 を書き分ける。どちらの場合も `supervisor-exited` の合成が registry を更新する経路 (世代照合との順序を含む) を書く。
- **根拠**: AD-023 §5、spec FR-004 / FR-005 / SC-004
- **scope 根拠**: plan の main/app 節と agents 節、spec FR-004、BE-008 / BE-013 / BE-020 で直せる

### [Medium] 正常に起動して最初のプロンプトを待つセッションが run-state 上は `launching` のままなので、一覧には「起動中」と出て、強制終了しか選べない (M-204) (scope: feature) — new

- **観察**: セッションスレッドは最初のプロンプトを受けるまで `ready` を発火しない (`sdk-agent-session.ts:305-309`, `:434-436`)。spec FR-011 と plan.md:239 は `launching` に「強制終了だけ」を出し、Edge Case は `launching` を「起動が進まない」状態として扱う。起動して入力を待っているだけのセッションも「起動中」と出て、破損警告つきの強制終了しか選べない。
- **同種事象探索**: `launching` を操作の条件に使う箇所は 3 件 (spec.md:152, :223 / plan.md:239)。最初のプロンプト前の状態に触れる記述は 0 件。
- **リスク/影響**: プロンプトをまだ送っていない行に、事実と違う状態ラベルと強制終了だけの導線が出る。USER 決定 R1 の「穏当な終了」の趣旨とも合わない。
- **推奨アクション**: (a) `spawned` を受けた `launching` を「入力待ち」として一覧で出し分け、「終了」も出す。または (b) 最初のプロンプト前の状態を run-state の外 (状態通知のフラグ) で表す。状態機械を変えるなら FR-015 / AD-043 で X-1 の data-model §4 を読み替える旨も書く。
- **根拠**: spec FR-009 / FR-011、X-1 data-model §4、sdk-agent-session.ts の実装事実
- **scope 根拠**: spec FR-009 / FR-011、plan の renderer 節と agents 節で直せる

### [Medium] SH-092 は 3 つの変更をすべて PATCH として扱うが、VII Statement と IX Good example の変更はバージョニング方針表の PATCH 行に当たらない (M-203) (scope: feature) — new

- **観察**: SH-092 と plan は 3 つの変更 (IX の現状の制約 / IX の Good example / VII の Statement の単独起動の形) をまとめて PATCH とする。バージョニング方針表 (`constitution.md:907-913`) で PATCH になるのは「表現の修正、誤記の訂正、非意味的な refinement」と「Verification の『現状の制約』を事実に追随させる」で、「指針の実質的な拡張」は MINOR。IX の Good example の差し替えは指針の変更、VII の Statement は NON-NEGOTIABLE Principle の本文である。過去の PATCH はいずれも「statement も指針も変えていない」を根拠にしている (`constitution.md:13-14`, `:37-38`)。
- **同種事象探索**: constitution.md で `statement も指針も変えていない` を 2 件、SH-092 / plan で `PATCH` を 4 件。
- **リスク/影響**: v1.2.4 は後から MINOR 相当と記録された (`constitution.md:915-918`)。同じ誤りを繰り返し、人間の承認の前提が崩れる。
- **推奨アクション**: SH-092 の PATCH 案で、変更ごとに表のどの行に当たるかを書く。Good example の差し替えと VII の Statement の変更は MINOR (または論証つきの PATCH) とし、分けて出す場合は IX の現状の制約だけを PATCH にする。
- **根拠**: Constitution 改定手順 3、バージョニング方針表、v1.2.5 の記録
- **scope 根拠**: tasks SH-092 と plan の Constitution Check で直せる

### [Low] AD-043 Decision 6 は単独起動の形と AD-010 の Decision の字面との差を「SH-092 の PATCH 案で諮る」としているが、Constitution の PATCH では accepted の AD-010 を変えられず、FR-015 の読み替え対象にも AD-010 が無い (L-201) (scope: feature) — partially resolved from prev L-102

- **観察**: AD-010 の Decision は「`node dist/supervisor.js` として単体起動でき」と書く。plan は worker entry のパスを必須の起動引数にし、差の扱いを SH-092 に回している。spec FR-015 の読み替え対象に AD-010 は無い。
- **推奨アクション**: AD-043 Decision 6 に「AD-010 の起動コマンドは例示であり、決定 (Electron / ネイティブ非依存、標準入出力で話す) は変えない」と明記するか、AD-010 を FR-015 の読み替え対象に足す。
- **根拠**: AD-031 §1、AD-010

### [Low] AD-043 の Confirmation は、accepted 後に「実装の確認」節を日付つきで in-place 追記するとしている。AD-031 が in-place を認めているのは「訂正」節だけで、この種別は定義されていない (L-202) (scope: feature) — new

- **観察**: plan.md:260 は「実装後に追記する (訂正節ではなく「実装の確認」として日付つきで)」とする。AD-031 の表は 2 種だけを定めている。近い先例は `申し送り` のチェックボックスの in-place 更新 (`0036:211`)。
- **推奨アクション**: Confirmation に実装時に確かめる項目をチェックボックスで先に書き、実装後はチェックを付けるだけにする。
- **根拠**: AD-031 §1

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-201 | `killed` (SessionScreen.tsx) / plan の kill・end の待ち | 4 / 2 | SessionScreen.tsx:140,165,189,286 / plan.md:185,186 |
| M-201 | `直送` (plan.md) | 3 | plan.md:190,251,257 |
| M-202 | `即時` (spec / plan / tasks) | 9 | plan.md:173,175,176,183,197,198,281 / tasks.md:42,57 |
| M-204 | `launching` を操作の条件に使う箇所 | 3 | spec.md:152,223 / plan.md:239 |
| M-203 | `statement も指針も変えていない` / `PATCH` | 2 / 4 | constitution.md:14,38 / plan.md:56,257,327 / tasks.md:166 |
| L-201 | `node dist/supervisor.js` | 3 | constitution.md:496, 0010:21, glossary.md:628 |
| L-202 | `実装の確認\|実装後に追記` (docs/decisions) | 0 | — |

## Verdict

- Critical: 0
- High: 1 (C: H-201)
- Medium: 4 (C: M-202 / M-204、D: M-201 / M-203)
- Low: 2 (D: L-201 / L-202)
- Round inheritance: resolved from R2: 7 / unresolved: 0 (L-102 は部分的に解消し、残りを L-201 として継続) / new: 6

Critical を 0 とした理由: H-201 は spec / plan の文面上の不整合であり accepted ADR drift ではない。M-201 は SH-000 (2) が成立した場合に限って AD-030 §5 drift になる条件付きの指摘なので Medium とした (成立した分岐のまま AD-043 を accepted にすると High 相当)。
