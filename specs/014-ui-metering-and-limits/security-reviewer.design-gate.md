# security-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-07T00:00:00+09:00 (design-gate R2)
**Reviewer**: security-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001 (`errors` / `result` の文字列を運ばない)・FR-002 (再ログインの導線)・FR-003 (`meter` の許可リストと値の検証)・FR-004 (行は既存の `message` の経路)・FR-005 (保持のみ、永続化なし)・FR-006 / FR-009 (範囲外の数と日時の書式化)・FR-007 / FR-011 (エラー文を出さない)・FR-012 / FR-013 (間引きと上限)・FR-019 (固定のセレクタ)・SC-002・SC-004・SC-006
- touched files に該当する charter / Confirmation: AD-047 Confirmation (SC-001 / SC-002 / SC-006、状態通知のフィールドの差分 0)。ui charter の「Electron 特有の配線」(CSP 基線 AD-025 §7。`unsafe-inline` は本番で使わない)。Constitution V (資格情報を永続化しない・ログに混ぜない)・IX。O-2 data-model §2 (`transcript-guard.ts` の `enumTable` / `inEnum`)。main / preload / IPC は差分 0 の計画 (SC-006 / quickstart V-1) なので SEC-2 / SEC-3 / SEC-5 / SEC-7 の対象になる箇所は無い (遷移の防御 `src/main/app/window.ts:65,76` は変わらない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:2 Low:3
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲 (L-004 の ADR の字面の判定もそちら。権限モードのゲートは platform-boundary-reviewer の PB-4)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

R1 の指摘の大半は data-model §2 に入った。列挙は `Object.create(null)` と `Object.hasOwn` で照合し、`toolUseId` / `modelId` の形を決め、数の範囲と単位、`resetsAt` の Invalid Date、間引き・上限・取り消し、`dispose()` の後に何も送らないこと、を定めた。認証の分類も「ログイン状態も確かめる」の文言と RK-06 で手当てした。骨格はそのまま保たれている。会話由来の文字列を読まない許可リスト、状態通知に載せないこと、main / preload / IPC の差分 0、制御要求を呼ばないこと、通しのテスト (SC-002) の 5 点である。今回の残りは 4 つ。(1) R1 で求めた上限について、間引きの鍵を外す条件が決まっておらず、上限が常に埋まったままになる。(2) 実機で値の形を記録する手順 (V-4 #1 / #4) に観測点が無い。(3) R1 の M-001 で挙げた prototype のキーの引き方 2 か所 (`tool-registry.aui.tsx:36` / `system-event.ts:117`) が直っていない。(4) 許可リストの字面のずれ (`modelId` の userinfo の形、FR-003 の値の種類) と、registry の element を取り込むときの安全の観点。

## Findings

### [Medium] 間引きの鍵の上限 64 に「鍵を外す」条件が無い。上限が一度埋まると、そのセッションでは tool の経過時間と task の進み具合が出なくなる (M-001) (scope: feature)

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:109` は「同時に追う鍵 (tool と task) は 64 まで。超えた新しい鍵の更新は捨てる」と定める。一方 `:110` の取り消しは「その tool の鍵の**保留を**捨てる」「全部の tool の鍵の**保留を**捨てる」で、保留中の値を捨てるだけで鍵そのものは外さない。task の鍵 (`task:<taskId>`) は `finish()` まで一度も外れない。renderer の側 (`data-model.md:124` の `toolElapsed`) には「`turn` で空・64 を超えたら古いものから落とす」がある。agents の側 (`meter-throttle`) には外す規則が無い。BE-041 のテスト (`C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:111`) が見るのは「65 個目の鍵を捨てる」だけで、外す側のテストは無い。`task_id` の形の検証も `data-model.md:76-84` の表に無い (`:139` は「空でない文字列」だけ)。R1 の M-002 で挙げた `taskId` の分がまだ残っている
- **同種事象探索**: spec_dir の 6 文書で `64` → 関連 5 件 (`data-model.md:109` 外す規則なし / `data-model.md:124` 追い出しあり / `plan.md:28` / `tasks.md:50` / `tasks.md:110`)
- **リスク/影響**: 字面のとおりに実装すると、長いセッションで 64 個目の tool の呼び出しや背景の task が来た時点で、新しい鍵がすべて捨てられる。以後は FR-012 / FR-013 の表示が黙って出なくなる。R1 で求めた上限 (CWE-770 への手当て) が、外す条件が無いために可用性を壊す形になっている
- **推奨アクション**: `data-model.md` §2「間引きと後始末」に外す規則を足す。たとえば「保留が無く、最後に送ってから 1 秒を過ぎた鍵は外す」(上限は今動いている鍵だけを数える)。時間で外す形なら task の終わりを見なくてよい。FR-013 / AD-044 Decision 6 (task ごとの状態を持たない) との整合の判定は architecture-reviewer に委ねる。tool の鍵は `tool_result` と result で、保留だけでなく鍵も外す。`task_id` には `toolUseId` と同じ形の規則 (`^[A-Za-z0-9_-]{1,128}$`) を当て、外れたら更新を送らない。BE-041 のテストに「64 個の鍵が 1 秒休んだ後、65 個目が通る」「ターンをまたいで 65 個以上の tool に経過時間が出る」「形の外れた `task_id` で送らない」を足す
- **根拠**: CWE-770 / CWE-400、spec FR-012 / FR-013 / SC-004、R1 security M-002 / M-004
- **scope 根拠**: data-model §2 と BE-041 (本 feature の新設のモジュール) の中で直せる

### [Medium] H: 値の検証で落ちたもの、実機の値の形の両方に観測点が無い。V-4 #1 / #4 の「形・単位を記録する」は、書かれた手順では実行できない (M-002) (scope: feature)

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md:28` は「届いた result と assistant のメッセージの形 (subtype / `api_error_status` / `error`) を記録する」、`:31` は「`utilization` と `resetsAt` の実際の単位を記録する」と求める。plan RK-06 / RK-07 (`plan.md:277-278`) の手当てはこの記録を前提にしている。一方、設計は生の値をどこにも出さない。理由のキーは 401 と認証の列挙をどちらも `auth-failed` にまとめ、知らない形は `provider-error` に倒すので、元の値に戻せない。`utilizationPct` / `resetsAtSec` は範囲の外で null になる。renderer の decoder は外れを黙って捨てる (`C:\dev\closta\src\renderer\src\features\session\running-session-store.ts:333-334`)。R1 の M-006 で求めた「decoder が捨てた件数を開発ビルドで数える」は tasks に入っていない
- **同種事象探索**: renderer の非テストで `decodeSessionEvent\(` → 呼び出しは 1 か所で黙って捨てる (`running-session-store.ts:333-334`)。既存の観測点は `receivedMessages` (`running-session-store.ts:297` / `RunningSessionList.tsx:234-240`) だけで、捨てた数は見えない。quickstart で記録を求める行は 2 件 (`quickstart.md:28,31`)
- **リスク/影響**: 検証の規則 (`data-model.md:78-82` の値域・単位・`modelId` の形) が実データに合わないと、帯・目盛り・内訳が黙って出ない。そのとき「届いていない」と「検証で落ちた」を区別できない。data-model §1 / §2 を直すかどうかの判断 (SH-014) の材料が手に入らない
- **推奨アクション**: V-4 #1 / #4 の記録の方法を quickstart に書く。案は 2 つ。(a) 同じ Provider でアプリの外の Claude Code CLI (`--output-format stream-json`) を動かし、data-model §2 の許可リストのフィールドだけを書き写す (アプリのコードに stream の解析を足さないので Principle IV に触れない)。(b) 開発ビルドに限り (`app.isPackaged` / `import.meta.env.DEV` で切る)、`live-signals` が許可リストの**数と列挙だけ**を出力し、decoder が `meter` を捨てた件数をセッションごとに数える (文字列のフィールドは出さない。Constitution V)。どちらを採るかを SH-014 に書く
- **根拠**: Constitution V (ログに秘密を混ぜない範囲で観測する)、plan RK-06 / RK-07、R1 security M-006
- **scope 根拠**: quickstart と tasks (SH-014 / BE-004 / FE-004) の中で直せる

### [Medium] `tool-registry.aui.tsx:36` が tool 名を prototype を持つ object から引くので、tool 名が `constructor` などのとき表示の部品が `Object` になり、描画が例外を投げる。ErrorBoundary が無いので renderer の全体が落ちる (M-003) (scope: system)

- **観察**: `C:\dev\closta\src\renderer\src\components\assistant-ui\elements\tool-registry.aui.tsx:22` の `TOOL_DISPLAY` は object リテラルで、`:36` は `TOOL_DISPLAY[props.toolName] ?? ToolFallback`。tool 名の経路を追った。agents で `sanitizeBody` を通す (`C:\dev\closta\src\domain\session\live-message.ts:61`)。renderer の guard は `typeof toolName === 'string'` だけを見る (`C:\dev\closta\src\renderer\src\features\chat\transcript-guard.ts:66-67`)。どちらも名前の形を制限しない。結果として `constructor` は `Object` を、`__proto__` は `Object.prototype` を、`hasOwnProperty` / `valueOf` は `this` の無い関数を部品として描こうとし、どれも描画中に例外を投げる。renderer に ErrorBoundary は 0 件。R1 の M-001 で「同じ PR か system scope で」と挙げたが、tasks に入っていない。O-4 は FE-043 で、この dispatcher が振り分ける先の 6 つの表示と `tool-result-marks.tsx` に手を入れる
- **同種事象探索**: `components/assistant-ui/elements` で `\[[a-zA-Z.]+\] \?\?|Object\.hasOwn` → 2 件 (`tool-registry.aui.tsx:36` は守られていない。`tool-fallback.aui.tsx:332` は `Object.hasOwn` で守られている)。`ErrorBoundary|componentDidCatch|getDerivedStateFromError` は renderer で 0 件。同じ dir のテストで `constructor|__proto__` は 0 件
- **リスク/影響**: モデルの出力 (prompt injection で誘われたものや、存在しない tool 名) に tool_use の名前 `constructor` が含まれると、10 セッションを並べた画面がまとめて白くなる。過去ログにもその名前が残るので、そのセッションを開くたびに落ちる。いまは設計段階で実害は観察していないので High に上げない
- **推奨アクション**: `Object.hasOwn(TOOL_DISPLAY, props.toolName) ? TOOL_DISPLAY[props.toolName] : ToolFallback` にし、`constructor` / `__proto__` / `hasOwnProperty` / `valueOf` で `ToolFallback` になるテストを足す。直す場所は 1 行なので FE-043 に入れるのが安い。入れないなら roadmap の system-scope に持ち主 (次に `tool-registry.aui.tsx` を触る feature) と一緒に記録する。Thread を ErrorBoundary で囲むかどうかは別の判断として同じ記録に残す
- **根拠**: CWE-1321 / CWE-248、data-model §2 の「文言の表も `Object.hasOwn` で引く」(`data-model.md:87`) と同じ方式、R1 security M-001
- **scope 根拠**: `tool-registry.aui.tsx` は plan の Source Code (`plan.md:316-318`) に入っていない。FE-043 で取り込めば feature の範囲で直せる

### [Low] BE-003 で手を入れる `system-event.ts` に、prototype を持つ表を引く `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` が残る (L-001) (scope: feature)

- **観察**: `C:\dev\closta\src\domain\session\system-event.ts:75-79` は object リテラル、`:117` は `HOOK_OUTCOMES[m.outcome] ?? 'unknown'`。`outcome` が `constructor` のとき `status` が `Object` 関数になる。実行中の経路では `JSON.stringify` で `status` のキーが消える。そのため renderer の guard (`transcript-guard.ts:53`) で part が落ち、Hook の行が丸ごと消える (例外は出ない)。過去ログの経路での帰結は確かめていない。BE-003 (`tasks.md:40`) はこのファイルに表と復号の関数を足すが、この行には触れない
- **同種事象探索**: R1 の M-001 と同じクエリで、今回の touched files の中に 1 件 (`system-event.ts:117`)。`chat/labels.ts:64-65` は `Object.hasOwn` で守られている
- **推奨アクション**: BE-003 で `Object.hasOwn(HOOK_OUTCOMES, m.outcome)` に替える。`outcome: 'constructor'` / `'__proto__'` で `unknown` になるテストを `system-event.test.ts` に足す。新しく足す表 (category・status・`detail` の復号) も同じ方式にする
- **根拠**: CWE-1321、`data-model.md:84,87`
- **scope 根拠**: BE-003 の touched file の中で直せる

### [Low] `modelId` の規則が、scheme の無い userinfo の形 (`user:token@host/model`) を通す (L-002) (scope: feature)

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:82` の規則は 3 つ。`^[A-Za-z0-9.:@/-]{1,128}$`、`//` を含まない、`mayCarrySecret` が false。`mayCarrySecret` (`C:\dev\closta\src\domain\session\system-event.ts:47-51`) が見るのはクォート類・`NAME=`・既知の接頭辞だけなので、`u:p@h/m` は 3 つとも通る。BE-001 のテスト (`tasks.md:39`) は `https://u:p@h/m` しか見ない。R1 の M-002 の残りである
- **同種事象探索**: `data-model.md:82` の 1 件。`mayCarrySecret` の呼び出しは `system-event.ts:64` (Hook の名前。こちらは `HOOK_NAME_SHAPE` が `@` を弾くので問題ない)
- **推奨アクション**: 「`:` の後ろに `@` がある (`/^[^/]*:[^/]*@/`) ものは落とす」を足す。Vertex の `model@date` (`:` が無い) と Bedrock の ARN (`@` が無い) は変わらず通る。テストに `u:p@h/m` を足す。表示はローカルだけで永続化しないので Low とする
- **根拠**: CWE-532 / CWE-200、AD-047 Decision 2、R1 security M-002
- **scope 根拠**: data-model §2 と BE-001 の中で直せる

### [Low] SH-002 で registry の element を取り込むとき、採るかの観点に安全の項目が無い (L-003) (scope: feature)

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:16` の観点は CSP・日本語の props・npm の依存の 3 つ。O-3 の同じ作業 (`C:\dev\closta\specs\012-ui-thread-search\tasks.md:19`) は「(e) 命令の id から DOM の id・セレクタを組まない」という安全の観点を持っていた。Quota banner には「もっと得る」の操作 (`onUpgrade`) がある (`.claude/skills/elements/references/standalone-elements.md:1308`)。`npx assistant-ui@latest add` は registry が要求する依存を入れることがあり、「依存を足さない」を確かめる時点では install (と lifecycle script) が既に走っている
- **同種事象探索**: renderer の `src` で `dangerouslySetInnerHTML|innerHTML` は、コメントとテストを除いて 0 件。main の遷移の防御は `src/main/app/window.ts:65,76` (変わらない)
- **推奨アクション**: SH-002 の観点に 3 つ足す。(a) 取り込んだ source に `dangerouslySetInnerHTML` / `innerHTML` / `href` / `window.open` / `fetch` が無いこと。(b) Quota banner に `onUpgrade` を渡さないこと。(c) `add` の後に `git diff -- package.json pnpm-lock.yaml` が 0 であること (0 でなければ戻してから照合する)
- **根拠**: SEC-6 / SEC-8、Principle XIII、O-3 SH-003 (e)
- **scope 根拠**: tasks SH-002 の中で直せる

### [Low] FR-003 と AD-047 Decision 2 は運ぶ値を「数・真偽・列挙・モデルの id」と書くが、data-model §2 の `tool-elapsed` は `toolUseId` (文字列の id) も運ぶ (L-004) (scope: feature)

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\spec.md:188` と `C:\dev\closta\docs\decisions\0047-session-meter-and-failure-reasons.md:35` は運ぶ値を「数・真偽・列挙・モデルの id だけ」とする。`data-model.md:43` の `tool-elapsed` は `toolUseId: string` を運ぶ (形の規則は `:81`)。plan の ADR 節 (`plan.md:253-256`) は、ターン数と拒否の件数が Decision 2 の範囲に入ることは書いているが、`toolUseId` には触れていない
- **同種事象探索**: 字面「数・真偽・列挙・モデルの id」→ spec.md:188 / AD-047:35 / plan.md:12,255 の 4 か所。`toolUseId` を運ぶ種類は `data-model.md:43` の 1 つ
- **推奨アクション**: FR-003 の括弧書きと data-model §2 の冒頭を「数・真偽・列挙・モデルの id・形を検証した tool の id」に直す。plan の ADR 節に「Decision 2 は `tool_progress` を間引いて運ぶことを定めており、運ぶには tool の id が要るので範囲の中」と 1 行足す。許可リストの監査で「範囲の外の文字列」と読み違えられないようにするためである。ADR の drift にあたるかの判定は architecture-reviewer に委ねる
- **根拠**: AD-047 Decision 2、spec SC-002
- **scope 根拠**: spec / data-model / plan の字面の中で直せる (AD-047 の本文は変えない)

## H. テストと regression (担当範囲)

- 各指摘を検出するテスト: M-001 は BE-041 が上限を見るだけで、鍵を外す側のテストが無い。M-003 / L-001 は prototype のキーのテストが 0 件。L-002 は scheme の無い形のテストが無い。M-002 は観測点そのものが無い
- 既存の振る舞いを壊さない根拠: SC-002 の通しのテスト (目印の値が `SessionEvent` と DOM に 0 件、状態通知の全フィールドの走査)。既存の注入のテスト `src/renderer/src/features/session/pending-queue-notice.test.tsx:38` (FE-050 が `PendingQueueNotice` に手を入れても書き換えない)。`transcript-guard.ts` の列挙の表は `SYSTEM_EVENT_CATEGORIES` / `SYSTEM_EVENT_STATUSES` から作るので、category の追加に自動で追随する。過去ログの `toSystemEventMessage` が新しい行を作らない回帰テスト (BE-003)。どれも計画に入っている

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `64` (spec_dir の 6 文書) | 5 | data-model.md:109 / data-model.md:124 / plan.md:28 / tasks.md:50 / tasks.md:110 |
| M-002 | `decodeSessionEvent\(` (renderer の非テスト) / quickstart で記録を求める行 | 1 / 2 | running-session-store.ts:333-334 / quickstart.md:28,31 |
| M-003 | `\[[a-zA-Z.]+\] \?\?\|Object\.hasOwn` (elements) / `ErrorBoundary\|componentDidCatch\|getDerivedStateFromError` (renderer) | 2 / 0 | tool-registry.aui.tsx:36 (守られていない) / tool-fallback.aui.tsx:332 (守られている) |
| L-001 | 同上 (touched files) | 1 | system-event.ts:117 |
| L-002 | `data-model.md` の `modelId` の規則 / `mayCarrySecret` | 1 / 2 | data-model.md:82 / system-event.ts:47-51,64 |
| L-003 | `dangerouslySetInnerHTML\|innerHTML` (renderer の src。コメントとテストを除く) | 0 | — (遷移の防御 window.ts:65,76) |
| L-004 | 「数・真偽・列挙・モデルの id」 | 4 | spec.md:188 / AD-047:35 / plan.md:12 / plan.md:255 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 4
- Round inheritance: resolved from 1: 4 (R1 M-003 数の範囲と Invalid Date / M-004 間引きの範囲と後始末 / M-005 認証の分類 / L-001 `error_status` が null)。新しいコードの分が解消し既存箇所の cascade が残るもの: R1 M-001 → M-003 / L-001 に分けて持ち越し。unresolved (一部): 2 (R1 M-002 → L-002 と M-001 の `taskId` / R1 M-006 → M-002)。new: 2 (M-001 の外す規則、L-003、L-004 のうち、M-001 と L-003 / L-004 は今回初出。R1 から Critical に上げたものは無い)
