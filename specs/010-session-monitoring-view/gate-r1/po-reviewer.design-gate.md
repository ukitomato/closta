# po-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-02T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (US-1 強調・件数・移動・live region) / FR-005〜FR-007 (US-2 経過時間・直近の活動・枠の使用数) / FR-008〜FR-009 (US-3 密度) / FR-010 (renderer 閉包) / FR-011〜FR-012 (US-4 E2E・実機計測) / FR-013 (記録の追随)。SC-001〜SC-006 の全件
- touched files に該当する charter / Confirmation: session charter の Journey 3 と KPI「並列時の滑らかさ」、Scope の「監視ビュー」、Out of scope の「見た目と element → ui」。_overview の M3 達成状態「10 セッションを俯瞰でき、未表示情報がゼロ」。AD-043 Decision 4 (状態通知に会話由来の文字列を載せない)。AD-038 D3/D5。AD-020 Consequences (Hook / Background task)。X-5 FR-005 / FR-009 / FR-011 / SC-003 の継承
- A. 認可 / 認証 / secret 管理: 該当なし: PO 観点の範囲外 (security-reviewer が担当)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: PO 観点の範囲外 (直近の活動の XSS 境界は security-reviewer が担当)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer が担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer が担当
- E. User Story / SC / AC / UX: Critical:0 High:3 Medium:5 Low:2
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer が担当
- G. optional reviewer 範囲: 該当なし: a11y / ux の細部は optional reviewer が担当 (E の UX negative に関わるものだけ E で扱った)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

X-5 の稼働中セッション一覧 (`RunningSessionList` サイドバー) を renderer の中だけで拡張し、承認待ちと失敗の強調、承認待ちの件数ボタン (押すと次の承認待ちへ移る)、polite live region、各行の経過時間と直近の活動、枠の使用数 (n/10)、compact / comfortable の密度切り替えを足す feature。あわせて、X-5 から繰り越した charter KPI「並列時の滑らかさ」を、E2E (偽の supervisor 接続) と実 `claude` 10 本の実機計測 (`perf/`、CI に載せない) で測る。IPC・状態通知・main・supervisor は変えない。[USER 決定] の 4 件 (サイドバー拡張のみ / 行に直近の活動を出す / 実機計測は自動化して CI 外 / Hook と Background task は O-2) は前提として扱い、その範囲の中で価値・計測可能性・負の経路を検査した。

## Findings

### [High] セッション画面以外を開いている間は、承認待ちと失敗が見えず通知もされない。US-1「見逃さない」がアプリの 7 画面のうち 1 画面でしか成り立たない (H-001) (scope: feature)

- **観察**: `src/renderer/src/App.tsx:22-30` で画面は 7 つ (`runtimes` / `folders` / `providers` / `sessions` / `resolution` / `launch` / `chat`) あり、`RunningSessionList` を載せているのは `launch` (`SessionScreen.tsx:91`) だけである。グローバルのヘッダ (`App.tsx:47-74`) は nav ボタンとテーマ切り替えだけを持つ。plan は時計について「一覧が表示されていない (画面が別) ときは止める」(`plan.md:131`) と書き、live region も一覧の中に置く (`plan.md:132`、research R-05)。このため、利用者が R-2 の過去セッション一覧 (`sessions`) や過去ログ (`chat`) を開いている間は、強調も件数も live region もマウントされていない。spec の US-1 (`spec.md:56`) は「別のセッションを見ている最中でも」と書くだけで、別の画面にいる場合に触れていない。Out of Scope (`spec.md:240`) は「承認待ちの通知はアプリ内 (一覧の強調・件数・支援技術への通知) に限る」としており、別画面での扱いを除外として明示していない。さらに、別画面にいる間に起きた遷移は、一覧に戻っても読み上げられない (announcement はストアの購読で差分を取る設計のため)
- **同種事象探索**: Grep `SessionScreen|RunningSessionList` (src/renderer/src、テストを除く) で 11 件。一覧をマウントしているのは `SessionScreen.tsx:91` の 1 箇所だけ
- **リスク/影響**: 承認待ちになったセッションは止まったままになる (`spec.md:58` が自ら「並列で回す意味が失われる」と書いている)。charter Journey 1 (過去セッションを探す) と Journey 3 (並列で差配する) を行き来する利用者ほど見逃す。M3 の達成状態「10 セッションを俯瞰でき」の前提が崩れる
- **推奨アクション**: 次のどちらかを spec に明記する。(a) 最小案: グローバルのヘッダの `launch` nav ボタンに承認待ちの件数 (色以外の手掛かりを伴う) を出し、live region を `App` の寿命に置く。ストアは既に App の寿命で張られている (`App.tsx:34`) ので、renderer に閉じる方針 (FR-010) は崩れない。(b) 「セッション画面以外では通知しない」を Out of Scope と Edge Cases に明示し、利用者の決定として記録する。どちらにしても SC-001 に「別画面にいる間に起きた遷移」の扱いを足し、FE-003 に観点を足す
- **根拠**: charter Journey 3-2「承認待ちのセッションが目立つ形で示される」/ _overview M3 / PO-4 (明示なき漏れは High 以上) / PO-6 (entry point)
- **scope 根拠**: spec / plan / tasks の文面だけで直せる

### [High] 既定の comfortable では 10 行がサイドバーに収まらない。画面外にある失敗の行を見逃す経路があり、SC-001 はこれを測っていない (H-002) (scope: feature)

- **観察**: research R-06 (`research.md:40`) は「X-5 の縦積みの行は 1 行あたり約 70px あり、10 行で一覧の高さを超える」と自ら書いている。それでも既定の密度は comfortable である (`spec.md:173` FR-009 / `spec.md:213`)。承認待ちには見出しの件数と移動の導線がある (FR-002) ため、画面外にあっても辿れる。一方、失敗は件数に含めず (`spec.md:127` / `spec.md:215` [ASSUMED])、見出しに手掛かりが無い。スクロールした先の失敗の行は、晴眼の利用者には見えない (live region は支援技術向けで、発話も 1 回きり)。SC-001 (`spec.md:220`) の「見逃さない」は行の強調の有無だけを測り、強調された行が可視領域にあるかは測らない
- **同種事象探索**: Grep `既定は comfortable|件数には含めない|10 行で一覧の高さを超える` で 3 件 (`spec.md:173`, `spec.md:215`, `research.md:40`)
- **リスク/影響**: 失敗は「利用者の応答で解消できない」ことを理由に件数から外された (`spec.md:215`)。しかし利用者が気づかなければ、そのセッションの仕事は止まったまま放置される。既定の状態で US-1 の見出し「承認待ちと失敗を見逃さない」の後半が成り立たない
- **推奨アクション**: 次のいずれかを選び、spec に書く。(a) 見出しに失敗の有無 (件数か印) を出す。件数ボタンとは別の、押せない表示でよい。(b) 既定の密度を compact にする。(c) 画面外に強調された行があるとき、一覧の端に「下に承認待ち / 失敗あり」の印を出す。あわせて SC-001 に「既定の密度・既定のウィンドウで、画面外の失敗が利用者に分かる」を足し、FE-003 / SH-031 に観点を足す
- **根拠**: PO-4 (happy path 偏重) / PO-2 / charter Journey 3
- **scope 根拠**: spec の FR-002 / FR-009 / SC-001 の範囲で直せる

### [High] SC-005 (実機計測) に「その回が有効か」の判定条件が無い。負荷が軽すぎても合格してしまう (H-003) (scope: feature)

- **観察**: SC-005 (`spec.md:224`) は「実 `claude` 10 本が同時に応答を流している間に SC-004 と同じ閾値を満たす」とし、計測条件を記録することを求める。しかし、有効な回の下限 (窓の中で応答中だった本数・届いたメッセージ数の下限) を持たない。FR-012 (`spec.md:187`) とタスク SH-032 (`tasks.md:76`) が無効とするのは「失敗したセッションがあった回」だけである。plan R-02 (`plan.md:169`) は、実 `claude` の負荷が E2E (200 件/秒) より桁違いに小さく、計測が意味を持たないリスクを自ら挙げている。それでも対処は「記録して並べる」だけで、合否に効かない。次の 2 つの場合も無効の条件に入っていない。1 つは、30 秒の窓の途中で一部のセッションが応答を終えて応答待ちに落ちる場合。もう 1 つは、承認待ちに入って止まる場合 (既定の権限モードで Glob / Read が承認を要さないという前提 (`research.md:50`) が崩れたとき)
- **同種事象探索**: Grep `無効` (specs/010) で 5 件 (`spec.md:135`, `spec.md:187`, `research.md:51`, `tasks.md:76`, `quickstart.md:31`)。いずれも「失敗」だけを無効の条件にしている
- **リスク/影響**: 10 本のうち 2 本しか流れていない回や、窓の中のメッセージが数十件の回でも SC-005 は PASS になる。X-5 から 2 feature にわたって繰り越した charter KPI の実機計測 (`spec.md:112`) が、形だけ実施されて閉じる
- **推奨アクション**: SC-005 と FR-012 に有効な回の条件を足す。例: 「窓の全期間で 10 本が応答中 (承認待ち・応答待ちは 0 本) であり、窓の中で届いたメッセージ数が N 件以上。満たさない回は無効」。N は E2E 負荷との比を quickstart-results で説明できる値を spec に置く (例: 下限を [ASSUMED] で置き、初回の実測で調整する)。SH-032 の出力に「有効 / 無効と、その理由」を足す
- **根拠**: PO-2 (boolean-evaluable であっても、計測の前提が定義されていなければ計測不能と同じ) / charter KPI「並列時の滑らかさ」
- **scope 根拠**: spec の SC-005 / FR-012 と tasks の SH-032 で直せる

### [Medium] 件数ボタンを押したときの移動先が、表示中のセッションが承認待ちの列に無い場合に未定義。列の中にある場合も「早い順」と矛盾する (M-001) (scope: feature)

- **観察**: FR-002 (`spec.md:146`) は「承認待ちになったのが早い順に」移ると書く。一方、data-model (`data-model.md:46`) と research R-04 (`research.md:27`) は「`selectedId` の次から循環」と定める。表示中の A が承認待ちでない (列に無い) とき、「A の次」がどれかは定義されていない。また、表示中の C 自身が承認待ちで、列が [B, C, D] のとき、循環の規則では D に移る。この場合、最も長く待っている B が後回しになり、R-04 の Rationale「長く待たせているセッションから応じる」に反する
- **同種事象探索**: Grep `次から循環` で 3 件 (`data-model.md:46`, `research.md:27`, `tasks.md:18`)
- **リスク/影響**: 実装者ごとに挙動が変わる。AC を Given-When-Then に落とせない
- **推奨アクション**: data-model に「表示中が列に無いときは列の先頭へ移る。列にあるときは、自分を除いた列の先頭 (最も早く承認待ちになったもの) へ移る」のように一意の規則を書く。あるいは循環を採るなら、FR-002 の文言を循環に合わせて直す。SH-003 の観点に 2 つのケースを足す
- **根拠**: PO-3 (AC testability)
- **scope 根拠**: spec / data-model / tasks の文面

### [Medium] 承認待ちが表示中のセッションだけのとき、件数ボタンは押せるのに何も起きない (M-002) (scope: feature)

- **観察**: Edge Cases (`spec.md:125`) は「表示中以外の承認待ちが無ければ何もしない」とする。plan (`plan.md:129`) は件数 0 のときだけボタンを押せなくする。このため、件数 1 (表示中の自分) のときはボタンが有効に見え、押しても反応が無い
- **同種事象探索**: Grep `何もしない|押せない` (specs/010) で 4 件 (`spec.md:125`, `plan.md:129`, `tasks.md:24`, `tasks.md:37`)
- **リスク/影響**: 利用者は壊れていると受け取る。スクリーンリーダーの利用者には、押した結果が何も伝わらない
- **推奨アクション**: 「移れる先が無いときは押せない (件数は出す)」と定め、accessible name か説明で理由 (表示中のセッションが承認を待っている) を示す。FE-003 の観点を「押せない」に直す
- **根拠**: PO-6 (エラー時の出口) / PO-3
- **scope 根拠**: spec の Edge Cases と plan の文面

### [Medium] 上限時の案内が「応答待ちを終了すれば」に限られている。終了できるセッションが無い場合と、ダイアログを入力し終えてから拒否される流れが扱われていない (M-003) (scope: feature)

- **観察**: US-2 AC6 (`spec.md:87`) と FR-007 (`spec.md:164`) は、空け方として「応答待ちのセッションを終了する」だけを示す。X-5 FR-011 では、終了は応答待ちに加えて中断済みと最初のプロンプト待ちにも出せる。10 本すべてが応答中・承認待ちのときは終了できる行が 1 本も無く、空けるには停止 (強制終了) が要る。その場合、案内の文が事実と食い違う。また、新規起動の導線は無効にしない (FR-007)。このため利用者は X-4 のダイアログで 6 軸を選び終えてから `session-limit` で拒否される
- **同種事象探索**: Grep `応答待ちのセッションを終了` で 2 件 (`spec.md:87`, `spec.md:164`)
- **リスク/影響**: 誤った案内が出る。入力の手間が無駄になる
- **推奨アクション**: 案内の文を、終了できる行の有無に応じて 2 通りに出し分ける (終了できる行がある / 停止が要る)。ダイアログを開いた時点、または起動ボタンの近くにも renderer の枠の使用数で警告を出す (拒否の判定は main のままでよい)。AC6 と FE-012 の観点を足す
- **根拠**: PO-4 (リソース枯渇) / PO-6
- **scope 根拠**: spec の FR-007 / US-2

### [Medium] 複数のセッションが同じ状態通知のバッチ (100ms の窓) で承認待ち・失敗に入ったときの読み上げが未定義 (M-004) (scope: feature)

- **観察**: FR-004 (`spec.md:149`) と SC-001 (`spec.md:220`) は「1 遷移 1 回」と定める。research R-05 (`research.md:33`) は、live region を 1 つ置いて文を**差し替える**方式を採る。X-5 FR-004 は状態通知を 100ms の窓でまとめるので、2 本の遷移は 1 回の更新で届きうる。このとき文を差し替えるだけだと、最後の 1 本しか読まれない
- **同種事象探索**: Grep `差し替える|1 回だけ` (specs/010) で 4 件 (`research.md:33`, `spec.md:149`, `tasks.md:29`, `tasks.md:40`)
- **リスク/影響**: SC-001 の「1 遷移 1 回」を満たさないまま、テストが通りうる (FE-003 の観点は単発の遷移だけを見ている)
- **推奨アクション**: 同じ更新で複数の遷移があったときの規則を決めて、spec か data-model に書く (例: 1 つの文にまとめて「B と C が承認待ちになりました」とする)。FE-003 に、同じバッチで 2 本が遷移するケースを足す
- **根拠**: PO-3 / PO-4 (同時実行)
- **scope 根拠**: spec / data-model / tasks

### [Medium] 直近の活動の定義が、spec の「先頭 1 行」と data-model の「改行を畳んで 80 文字」で食い違う (M-005) (scope: feature)

- **観察**: FR-006 の 3 番目 (`spec.md:159`) と US-2 AC3 (`spec.md:84`) は「最後の assistant 本文の先頭 1 行」と書く。一方、同じ FR の下位項目 (`spec.md:160`) と data-model (`data-model.md:26-28`) は、最後の text part 全体の改行を空白に畳んでから 80 文字で切る。本文の 1 行目が短い見出し (例: `## まとめ`) のとき、spec の文面どおりなら見出しだけが出る。data-model のとおりなら、見出しに 2 行目以降が続いて出る
- **同種事象探索**: Grep `先頭 1 行` (specs/010) で 3 件 (`spec.md:29`, `spec.md:84`, `spec.md:159`)
- **リスク/影響**: AC と単体テストの期待値が一意に決まらない。応答待ちの行で利用者が知りたいのは「claude が何を返したか・何を尋ねているか」だが、どちらの定義がその役に立つかの判断も記録されていない
- **推奨アクション**: 「先頭 1 行」と「改行を畳んだ先頭 80 文字」のどちらかに統一し、spec と data-model を揃える。SH-003 に複数行の本文の期待値を足す
- **根拠**: PO-3
- **scope 根拠**: spec / data-model

### [Medium] SC-004 の「全情報 (… 強調)」と US-1 AC2 の「承認カードが見える」を検出するテストが tasks に無い (M-006) (scope: feature) [H]

- **観察**: FR-011 (`spec.md:183`) は「経過時間・直近の活動・強調を出した状態」で E2E を流すと定める。しかし SH-031 (`tasks.md:75`) が assert するのは経過時間と直近の活動だけで、負荷の中に承認待ち・失敗の行 (強調と live region が動く状態) を含めることが書かれていない。また US-1 AC2 (`spec.md:65`) は「B の承認カードが見える」を求めるが、FE-003 (`tasks.md:37`) は「移る」までしか見ない。transcript が長いとき、移った先で承認カードが可視領域に入るかは、どこでも検証されない
- **同種事象探索**: Grep `承認カードが見える|強調` (tasks.md) で 4 件 (`tasks.md:29`, `tasks.md:34`, `tasks.md:36`, `tasks.md:65`)。いずれも E2E の負荷計測や承認カードの可視性に触れていない
- **リスク/影響**: SC-004 は、監視ビューで最も重い状態 (強調と live region が動く状態) を通さないまま PASS になりうる。AC2 は未検証のまま完了扱いになる
- **推奨アクション**: SH-031 の負荷に、承認待ち 1 本と失敗 1 本 (偽の supervisor から送る) を含め、強調が出ていることを assert する。FE-003 か SH-031 に「移った先で承認カードが可視領域にある」を足す。spec 側で「移った先で承認カードまでスクロールする」かどうかも決める
- **根拠**: reviewer-base H の義務 / PO-2
- **scope 根拠**: tasks の文面

### [Low] 2 feature にわたって繰り越した KPI の実機計測 (US-4) が P2 のまま (L-001) (scope: feature)

- **観察**: `spec.md:108-112`。X-5 pr-gate R1 po M-002 から繰り越したもので、charter KPI の実機側の唯一の計測経路である
- **同種事象探索**: Grep `Priority: P2` で 2 件 (`spec.md:91`, `spec.md:108`)
- **リスク/影響**: 優先度に従って作業を削ると、再び繰り越される
- **推奨アクション**: US-4 を P1 にするか、「本 feature では削らない」と spec に明記する
- **根拠**: PO-5
- **scope 根拠**: spec

### [Low] プロンプトを送った直後 (応答中、末尾が user) の行は、直近の活動が空になる (L-002) (scope: feature)

- **観察**: data-model (`data-model.md:26`) で、末尾が user のときは `null` になる。Edge Cases (`spec.md:129`) が扱うのは「最初のプロンプト待ち」だけである
- **同種事象探索**: Grep `末尾が user` で 2 件 (`data-model.md:26`, `tasks.md:14`)
- **リスク/影響**: 最初の応答が返るまで、何を頼んだセッションかが行から分からない
- **推奨アクション**: 送ったプロンプトの先頭を出すか、空のままにするかを Edge Cases に明記する
- **根拠**: PO-4 (empty state)
- **scope 根拠**: spec / data-model

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `SessionScreen\|RunningSessionList` (src/renderer/src、テストを除く) | 11 | 一覧のマウントは `src/renderer/src/features/session/SessionScreen.tsx:91` のみ。画面の定義は `src/renderer/src/App.tsx:22-30` |
| H-002 | `既定は comfortable\|件数には含めない\|10 行で一覧の高さを超える` | 3 | spec.md:173, spec.md:215, research.md:40 |
| H-003 | `無効` (specs/010) | 5 | spec.md:135, spec.md:187, research.md:51, tasks.md:76, quickstart.md:31 |
| M-001 | `次から循環` | 3 | data-model.md:46, research.md:27, tasks.md:18 |
| M-002 | `何もしない\|押せない` | 4 | spec.md:125, plan.md:129, tasks.md:24, tasks.md:37 |
| M-003 | `応答待ちのセッションを終了` | 2 | spec.md:87, spec.md:164 |
| M-004 | `差し替える\|1 回だけ` | 4 | research.md:33, spec.md:149, tasks.md:29, tasks.md:40 |
| M-005 | `先頭 1 行` | 3 | spec.md:29, spec.md:84, spec.md:159 |
| M-006 | `承認カードが見える\|強調` (tasks.md) | 4 | tasks.md:29, 34, 36, 65 |
| L-001 | `Priority: P2` | 2 | spec.md:91, spec.md:108 |
| L-002 | `末尾が user` | 2 | data-model.md:26, tasks.md:14 |

## Verdict

- Critical: 0
- High: 3
- Medium: 6
- Low: 2

(注) H-001 は、spec の文面上で US-1 の価値が一部の画面でしか成立しないことを示している。ただし [USER 決定] の「サイドバーの拡張のみ」の範囲内での漏れであり、Out of Scope への明記でも解消できるので、Critical ではなく High とした。
