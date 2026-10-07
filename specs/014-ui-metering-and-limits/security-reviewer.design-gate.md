# security-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-08T00:00:00+09:00 (design-gate R3)
**Reviewer**: security-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-001 (`errors` / `result` の文字列を運ばない)・FR-002 (再ログインの導線)・FR-003 (`meter` の許可リスト。運ぶ値に「形を検証した tool の id」が入った)・FR-004 (行は `message` の経路)・FR-005 (保持のみ。永続化しない)・FR-006 / FR-009 (範囲外の数と日時)・FR-007 / FR-011 (エラー文を出さない)・FR-010 (`init` の `permissionMode` だけを読む)・FR-012 / FR-013 (間引き・上限・取り消し)・FR-019 (固定のセレクタ)・SC-002 (userinfo の形の modelId、`[1m]` / `_` は落とさない)・SC-004・SC-006
- touched files に該当する charter / Confirmation: AD-047 Confirmation (SC-001 / SC-002 / SC-006、状態通知のフィールドの差分 0)。AD-047 の訂正節 (#2: tool の id を運ぶ値に含める。SH-013)。ui charter の「Electron 特有の配線」(CSP 基線 AD-025 §7。本番で `unsafe-inline` を使わない)。Constitution V (資格情報を永続化しない・ログに混ぜない)・IX。`src/domain/provider/model-catalog.ts:26-35` (`isValidModelId`。今回 modelId の正本になった)。`src/domain/session/system-event.ts:47-51` (`mayCarrySecret`)。main / preload / IPC は差分 0 の計画 (SC-006 / quickstart V-1)。そのため SEC-2 / SEC-3 / SEC-5 / SEC-7 の対象は無い。遷移の防御 (`src/main/app/window.ts:65-81`) も変わらない
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:2 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲 (AD-047 の訂正節が ADR の決定の範囲に収まるかの判定もそちら。権限モードのゲートと隔離の文言は platform-boundary-reviewer の PB-4)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (下の「H. テストと regression」に実質を書いた)

## スコープ要約

R2 の指摘のうち 3 件が手当てされた。(1) `modelId` は `isValidModelId` を正本にし、`//`・scheme の無い userinfo・`mayCarrySecret` の 3 条件を足した (`data-model.md:85`、BE-001 のテスト `tasks.md:39`、SC-002 `spec.md:261`)。(2) FR-003・data-model・plan が運ぶ値に「形を検証した tool の id」を含めた。AD-047 には訂正節を足す (`spec.md:190` / `data-model.md:55` / `plan.md:257,262`)。(3) 実機の形は、アプリの外の CLI で数と列挙だけを控える手順になった (`quickstart.md:39-54`)。アプリの中に観測点を足さないことは理由つきで RK-14 に書かれた (`plan.md:295`)。新しく足された `init` の読み方も、読むのは `permissionMode` だけで、`cwd` / `plugins[].path` / `apiKeySource` などは許可リストの外にある (`data-model.md:67`)。BE-040 のテストも目印の値で 0 件を確かめる (`tasks.md:104`)。境界を守る骨格は R2 から変わっていない。骨格とは、許可リスト、状態通知に載せないこと、main / preload / IPC の差分 0、制御要求を呼ばないこと、通しのテストである。残りは 6 件ある。R2 からの持ち越しが 4 件で、内訳は間引きの鍵を外す条件、`tool-registry.aui.tsx:36` の prototype のキー、`system-event.ts:117` の prototype のキー、SH-002 の安全の観点である。新規が 2 件で、R2 で私が出した userinfo の正規表現の抜け道と、quickstart の手順で API キーがシェルの履歴に残ることである。

## Findings

### [Medium] 間引きの鍵の上限 64 に、鍵を外す条件がまだ無い。上限が埋まると、そのセッションでは tool の経過時間と task の進み具合が黙って出なくなる (M-001) (scope: feature) — unresolved from prev (R2 M-001 / gate MG-01)

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:112` は R2 と同じく「同時に追う鍵 (tool と task) は 64 まで。超えた新しい鍵の更新は捨てる」とある。`:113` の取り消しも「その tool の鍵の**保留を**捨てる」「全部の tool の鍵の**保留を**捨てる」のままで、鍵そのものを外す規則が無い。task の鍵 (`task:<taskId>`) は `finish()` まで外れない。鍵ごとに 1 秒 1 回を守るには最後に送った時刻を鍵ごとに持つ必要がある (`:110`)。このため、外す規則が無ければ鍵は残り続ける。renderer 側の `toolElapsed` には「`turn` で空・64 を超えたら古いものから落とす」がある (`:127`)。agents 側には同じ規則が無い。BE-041 のテスト (`C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:110-111`) は「65 個目の鍵を捨てる」だけを見る。`task_id` の形の規則も R2 と同じく「空でない文字列」だけ (`data-model.md:142`)
- **同種事象探索**: spec_dir の 6 文書で `\b64\b` → 9 件。行番号の範囲を除くと関連は 6 件: `data-model.md:112` (外す規則なし) / `data-model.md:127` (renderer は追い出しあり) / `plan.md:28` / `plan.md:244` (テストは上限だけ) / `tasks.md:50` / `tasks.md:110`。`鍵を外す|外す` に当たる規則は 0 件
- **リスク/影響**: 字面どおりに実装すると、`tool_progress` を出す長い tool を 64 回呼んだ時点で、以後の FR-012 の経過時間が出なくなる。背景の task が 64 を超えたときの FR-013 の進み具合も同じで、どちらも黙って出ない。R1 で求めた上限 (CWE-770 への手当て) が、外す条件の欠落によって可用性の欠陥 (CWE-400 の裏返し) になっている。新しい事実は無いので、R2 と同じ Medium に据え置く
- **推奨アクション**: data-model §2「間引きと後始末」に次の 1 行を足す。「保留が無く、最後に送ってから 1 秒を過ぎた鍵は外す (上限は今動いている鍵だけを数える)」。時間で外す形なら、task の終わりを観測しなくてよい (FR-013 / AD-044 Decision 6 の「task ごとの状態を持たない」と整合するかの判定は architecture-reviewer に委ねる)。tool の鍵は、`tool_result` と result の取り消しで保留と一緒に外す。`task_id` には `toolUseId` と同じ形 (`^[A-Za-z0-9_-]{1,128}$`) を当て、外れたら更新を送らない。BE-041 のテストに次の 3 つを足す。「64 個の鍵が 1 秒休んだ後、65 個目が通る」「ターンをまたいで 65 個以上の tool に経過時間が出る」「形の外れた `task_id` で送らない」
- **根拠**: CWE-770 / CWE-400、spec FR-012 / FR-013 / SC-004、R1 security M-002 / M-004、R2 security M-001
- **scope 根拠**: data-model §2 と BE-041 (本 feature で新設するモジュール) の中で直せる

### [Medium] `tool-registry.aui.tsx:36` が tool 名を prototype を持つ object から引いている。`constructor` などの名前で描画が例外を投げ、ErrorBoundary が無いので renderer 全体が落ちる (M-002) (scope: system) — unresolved from prev (R2 M-003 / gate MG-14)

- **観察**: `C:\dev\closta\src\renderer\src\components\assistant-ui\elements\tool-registry.aui.tsx:22` の `TOOL_DISPLAY` は object リテラルのまま。`:36` も `TOOL_DISPLAY[props.toolName] ?? ToolFallback` のまま変わっていない。FE-043 (`C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:115`) は、この dispatcher が振り分ける先の 6 つの表示と `tool-result-marks.tsx` に手を入れるが、`tool-registry.aui.tsx` は対象に入っていない。roadmap の system-scope にも記録が無い (docs で `tool-registry|TOOL_DISPLAY` → `docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md:35` の設計の説明 1 件だけ)。gate R2 は MG-14 として「FE-043 で取り込むのが安い」と勧めていたが、tasks にも記録にも入らなかった
- **同種事象探索**: `components/assistant-ui/elements` で `TOOL_DISPLAY|Object\.hasOwn` → 3 件。`tool-registry.aui.tsx:22,36` は守られていない。`tool-fallback.aui.tsx:332` は `Object.hasOwn` で守られている。spec_dir の 6 文書で `tool-registry|ErrorBoundary` → 0 件
- **リスク/影響**: tool_use の名前が `constructor` / `__proto__` / `hasOwnProperty` / `valueOf` だと、部品が関数や `Object.prototype` になり、描画中に例外を投げる。モデルの出力 (prompt injection で誘われたものや、存在しない tool 名) からこの名前が来ると、10 セッションを並べた画面がまとめて白くなる。過去ログにもその名前が残るので、そのセッションを開くたびに落ちる。設計段階では実害を観察していないので Medium に据え置く
- **推奨アクション**: FE-043 に 1 行を足す。`Object.hasOwn(TOOL_DISPLAY, props.toolName) ? TOOL_DISPLAY[props.toolName] : ToolFallback` とし、4 つの名前で `ToolFallback` になるテストを付ける。FE-043 に入れない場合は、SH-013 の roadmap の system-scope に、持ち主 (次に `tool-registry.aui.tsx` を触る feature) と一緒に記録する。Thread を ErrorBoundary で囲むかどうかも、同じ記録に別の判断として残す
- **根拠**: CWE-1321 / CWE-248。`data-model.md:87,90` が新しい表に求める規則 (`Object.hasOwn`・外部由来の id の保持は `Map`) と同じ方式。R1 security M-001、R2 security M-003
- **scope 根拠**: `tool-registry.aui.tsx` は plan の Source Code (`plan.md:328-330`) に入っていない。FE-043 で取り込めば feature の範囲で直せる

### [Low] BE-003 で手を入れる `system-event.ts` に、prototype を持つ表を引く `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` が残っている (L-001) (scope: feature) — unresolved from prev (R2 L-001)

- **観察**: `C:\dev\closta\src\domain\session\system-event.ts:75-79` は object リテラル、`:117` は `HOOK_OUTCOMES[m.outcome] ?? 'unknown'` で、どちらも R2 と同じ。BE-003 (`C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:40-41`) は同じファイルに category・status・`detail` の符号化と復号を足すが、この行には触れない。`outcome: 'constructor'` だと `status` が `Object` 関数になる。実行中の経路では `JSON.stringify` でキーが落ち、renderer の guard で part が捨てられて、Hook の行が丸ごと消える
- **同種事象探索**: touched files で `\[m\.[a-z_]+\] \?\?` → `system-event.ts:117` の 1 件。spec_dir で `HOOK_OUTCOMES` → 0 件
- **推奨アクション**: BE-003 で `Object.hasOwn(HOOK_OUTCOMES, m.outcome)` に替える。`outcome: 'constructor'` / `'__proto__'` で `unknown` になるテストを `system-event.test.ts` に足す
- **根拠**: CWE-1321、`data-model.md:87,90`
- **scope 根拠**: BE-003 の touched file の中で直せる

### [Low] SH-002 で registry の element を取り込むときの観点に、source の安全の確かめと、依存と lockfile の差分の確かめが無い (L-002) (scope: feature) — unresolved (一部) from prev (R2 L-003)

- **観察**: Quota banner の「もっと得る」(`onUpgrade`) は、research R-09 の採る条件「『もっと得る』の操作を出さずに使える」(`C:\dev\closta\specs\014-ui-metering-and-limits\research.md:104`) が入り、SH-002 がそれを参照するので手当て済み。一方、SH-002 (`C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:16`) の観点は CSP・日本語の props・新しい npm の依存の 3 つのままである。(a) 取り込んだ source に `dangerouslySetInnerHTML` / `innerHTML` / `href` / `window.open` / `fetch` が無いことの確認が無い。(c) `npx assistant-ui@latest add` の後で `package.json` / `pnpm-lock.yaml` の差分を見る手順も無い。`add` は依存の install (と lifecycle script) を走らせうるので、「依存を足さない」を照合する時点では install が既に済んでいる
- **同種事象探索**: renderer の lint に `dangerouslySetInnerHTML|no-danger|innerHTML` の規則は 0 件 (`eslint.config.mjs`)。spec_dir で `pnpm-lock|lockfile|lifecycle` → 0 件。O-3 の同じ作業 (`specs/012-ui-thread-search/tasks.md:19`) も lockfile の確認は持たない
- **推奨アクション**: SH-002 の観点に 2 つを足す。(a) 取り込んだ source を Grep し、上の 5 つが 0 件であること (あれば採らないか取り除く)。(c) `add` の後に `git diff -- package.json pnpm-lock.yaml` が 0 であること。0 でなければ取り込みを戻してから照合する
- **根拠**: SEC-6 / SEC-8、Principle XIII、R2 security L-003
- **scope 根拠**: tasks SH-002 の中で直せる

### [Low] `modelId` の userinfo を落とす正規表現 `/^[^/]*:[^/]*@/` は、パスワードに `/` を含む形 (`u:ab/cd@h/m`) を通す。評価の順 (長さの検査を先に) も書かれていない (L-003) (scope: feature) — new

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\data-model.md:85` と BE-001 (`C:\dev\closta\specs\014-ui-metering-and-limits\tasks.md:38`) は、R2 L-002 で私が提案した `/^[^/]*:[^/]*@/` をそのまま採っている。`u:ab/cd@h/m` を追うと、文字種は `isValidModelId` の `^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]*$` (`C:\dev\closta\src\domain\provider\model-catalog.ts:26`) を満たす。`//` も含まない。2 つ目の `[^/]*` は `@` の前の `/` を越えられないので、正規表現にも当たらない。`mayCarrySecret` (`C:\dev\closta\src\domain\session\system-event.ts:47-51`) は、クォート・`$`・`NAME=`・既知の接頭辞を含まない限り false を返す。結局、4 つの条件をすべて通る。base64 の資格情報は `/` を含みうる。もう 1 つ、`meter.ts` の 3 条件を `isValidModelId` (128 文字の上限) より先に評価すると、`^[^/]*:[^/]*@` は `:` が多く `@` の無い長い入力でバックトラックが O(n²) になる。data-model は「その上に 3 つだけを足す」と書くだけで、順を定めていない
- **同種事象探索**: spec_dir で `\[\^/\]\*:\[\^/\]\*@` → 2 件 (`data-model.md:85` / `tasks.md:38`)。テストの fixture は `u:p@h/m` だけで、パスワードに `/` を含む形は 0 件 (`tasks.md:39`)
- **リスク/影響**: 資格情報の形の modelId がモデルごとの内訳 (使用量のタブ) に出る。表示はローカルだけで、永続化もログもしないので Low とする
- **推奨アクション**: 条件を「`@` より前に `:` がある (`/:[^@]*@/`)」に替える。Vertex の `model@date` (`:` が無い)・Bedrock の ARN (`@` が無い)・`[1m]` 付きは変わらず通る。data-model §2 に「`isValidModelId` を先に評価し、通ったものだけに 3 条件を当てる」と順を書く。BE-001 のテストに `u:ab/cd@h/m` (落とす) を足す
- **根拠**: CWE-200 / CWE-532 / CWE-1333、AD-047 Decision 2、spec SC-002
- **scope 根拠**: data-model §2 と BE-001 の中で直せる

### [Low] quickstart の「形の控え方」は API キーを環境変数で与えるよう指示するが、キーをコマンドラインに書かない注意が無い。シェルの履歴 (`~/.bash_history`) に長期資格情報が残りうる (L-004) (scope: feature) — new

- **観察**: `C:\dev\closta\specs\014-ui-metering-and-limits\quickstart.md:43` は「API キーの Provider なら同じ環境変数」で認証を与え、`:44` で `claude -p … --output-format stream-json --verbose` を走らせるよう指示する。`:45` は出力の保存を禁じているが、キーの与え方は書いていない。利用者がよく取る `ANTHROPIC_API_KEY=sk-… claude -p …` や `export ANTHROPIC_API_KEY=sk-…` は、WSL の distro のシェルの履歴にキーを書く。アプリ自身は、キーを `env-passthrough` で子プロセスに渡すだけで書き出さない (`C:\dev\closta\src\domain\provider\forward-env.ts:126`)。手順書がその外で永続化の経路を作っている
- **同種事象探索**: spec_dir で `環境変数|ANTHROPIC_API_KEY|history|履歴` → 該当は `quickstart.md:43` の 1 件
- **推奨アクション**: 「形の控え方」の手順 1 に 1 行を足す。「キーをコマンドラインに書かない (シェルの履歴に残る)。`read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY` のように履歴に残らない形で与え、終わったら `unset ANTHROPIC_API_KEY` する。設定ディレクトリの Provider ではキーを扱わない」
- **根拠**: Constitution V (長期資格情報を永続化しない・ログへの混入を禁止)、CWE-312 / CWE-532
- **scope 根拠**: quickstart の字面の中で直せる

## H. テストと regression (担当範囲)

- **指摘を検出するテスト**: どの指摘も、それを検出するテストがまだ計画に無い。M-001 について、BE-041 は上限 (65 個目を捨てる) だけを見ており、鍵を外す側と `task_id` の形のテストが無い。M-002 / L-001 は、prototype のキー (`constructor` / `__proto__`) のテストが 0 件。L-003 は、パスワードに `/` を含む userinfo の fixture が無い。L-002 / L-004 は手順書の話で、テストの対象外
- **既存の振る舞いを壊さない根拠** (計画に入っていることを確かめた):
  - SC-002 の通しのテスト (SH-010): 目印の値が `SessionEvent` と DOM に 0 件、状態通知の全フィールドの走査
  - BE-040: `init` の `permissionMode` 以外 (`cwd`・`plugins[].path`・`mcp_servers` ほか) に目印の値を入れて 0 件
  - BE-003: 過去ログの `toSystemEventMessage` が新しい subtype から行を作らない回帰テスト
  - BE-011: `apiErrorStatus` が 1000・-1・小数のとき `provider-error` になる
  - FE-050: セレクタは固定の文字列だけで、外部由来の id を入れない
  - SC-006 / quickstart V-1: main / preload / IPC の差分 0
- **観測点**: アプリの中で、検証で落ちた値や知らない形の失敗を後から知る観測点は足さない。この判断は、理由 (出す値・条件・出し先の設計が要る。Principle V) とともに RK-14 に記録された。実機の形はアプリの外の CLI で、数と列挙だけを控える (quickstart「形の控え方」)。完了までに確かめられなかった項目は roadmap の O-4 の行に残す (SH-013)。R2 の M-002 はこれで閉じたと判断する

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `\b64\b` (spec_dir の 6 文書。行番号の範囲を除く) / `鍵を外す\|外す` | 6 / 0 | data-model.md:112 / data-model.md:127 / plan.md:28 / plan.md:244 / tasks.md:50 / tasks.md:110 |
| M-002 | `TOOL_DISPLAY\|Object\.hasOwn` (elements) / `tool-registry\|ErrorBoundary` (spec_dir) / `tool-registry\|TOOL_DISPLAY` (docs) | 3 / 0 / 1 | tool-registry.aui.tsx:22,36 (守られていない) / tool-fallback.aui.tsx:332 (守られている) / AD-0035:35 (設計の説明。system-scope の記録なし) |
| L-001 | `\[m\.[a-z_]+\] \?\?` (touched files) / `HOOK_OUTCOMES` (spec_dir) | 1 / 0 | system-event.ts:117 |
| L-002 | `dangerouslySetInnerHTML\|no-danger\|innerHTML` (eslint.config.mjs) / `pnpm-lock\|lockfile\|lifecycle` (spec_dir) | 0 / 0 | — (`onUpgrade` は research.md:104 で手当て済み) |
| L-003 | `\[\^/\]\*:\[\^/\]\*@` (spec_dir) | 2 | data-model.md:85 / tasks.md:38 |
| L-004 | `環境変数\|ANTHROPIC_API_KEY\|history\|履歴` (spec_dir) | 1 | quickstart.md:43 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Round inheritance: resolved from 2: 3 (R2 M-002 観測点 → quickstart「形の控え方」と RK-14 / R2 L-002 userinfo の形の modelId → data-model.md:85・BE-001・SC-002 / R2 L-004 運ぶ値の字面 → FR-003・data-model §2・plan の ADR 節 #2) / unresolved: 4 (R2 M-001 → M-001 / R2 M-003 → M-002 / R2 L-001 → L-001 / R2 L-003 → L-002 (Quota banner の `onUpgrade` は R-09 で手当て済み、source の確認と lockfile の差分が残る)) / new: 2 (L-003 userinfo の正規表現の抜け道と評価の順 / L-004 quickstart の API キーとシェルの履歴)。R2 から severity を上げたものは無い
