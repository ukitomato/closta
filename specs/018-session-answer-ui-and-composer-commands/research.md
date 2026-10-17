# Research: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Spec**: [spec.md](spec.md) / **Plan**: [plan.md](plan.md)

`/speckit.plan` の research agents の dispatch は designer が自分で調べて書いた (Agent ツールを持たない)。SDK は `@anthropic-ai/claude-agent-sdk` 0.3.270、assistant-ui は `@assistant-ui/react` 0.15.19 の同梱の型と実装 (`node_modules`) を読んだ。

---

## R-01. `AskUserQuestion` の回答の返し方と、承認カードが「答えられる要求」を知る方法

- **Decision**:
  - agents の `createCanUseTool` の closure が、SDK から受けた**無害化の前の** `toolName` と `input` を持ち続ける。決定が届いたら、`toolName === 'AskUserQuestion'` (完全一致) で、決定が `allow` で、`answers` があるときだけ、domain の純関数 `projectAskUserQuestionAnswer(rawInput, answers)` を通す。射影が `null` を返したら `{behavior: 'deny', message}` を返す (AD-052 Decision 1 / 2)
  - renderer が「答えられる要求」と知るための印を `PermissionRequest` に任意のフィールド `answerable: 'ask-user-question'` として足す。付けるのは agents で、条件は射影と同じ完全一致 (無害化の後の `toolName` の比較をやめる。FR-001)
  - renderer が描く問いは、今どおり `PermissionRequest.input` (無害化した JSON の文字列) を `parseAskUserQuestionArgs` で読んで得る。読めない (切り詰めで JSON が壊れた・問いが 0 件・5 件以上) ときは答える部品を出さず、「この問いにはアプリから答えられません。拒否して本文で答えてください」と「拒否」だけを出す
- **Rationale**: 元の入力を renderer に往復させない (AD-052 Decision 2) ために、射影の材料は closure の中にしか無い。`createCanUseTool` はすでに `toolName` / `input` を引数で受けている (`session-core.ts:171-187`) ので、引数の型を変えずに済む。印を agents が付ければ、MCP の `mcp__x__AskUserQuestion` や無害化で同じ見た目になる名前 (制御文字の除去など) に答える部品が出ない (US-1 AC6)
- **Alternatives considered**:
  - renderer が無害化した `toolName === 'AskUserQuestion'` で判定する (今の O-5 の注記の判定) — 無害化で同じ見た目になる名前に答える部品が出る。agents が射影しないので実害は「回答が届かない」だけだが、FR-001 が印を求める
  - 問いの構造 (問いの文・選択肢) を `PermissionRequest` の新しいフィールドで運ぶ — 運ぶ形が 1 つ増え、無害化と切り詰めの規則を二重に持つ。`input` の文字列を O-5 と同じ関数で読む方が狭い
  - `PermissionRequest` の `scope` を流用する — 意味が違う

## R-02. 射影の関数の置き場と、`toPermissionResult` の型

- **Decision**: `src/domain/session/agent-session.ts` の `toPermissionResult` の隣に、`AskUserQuestionResult` (`{behavior: 'allow', updatedInput: Record<string, unknown>}`) と `PermissionResultLike` の union を置く。`toPermissionResult` の出力の型は今の `{behavior, message?}` のまま変えず、新しい関数 `toAskUserQuestionResult(decision, rawInput)` が射影の結果 (成功なら `AskUserQuestionResult`、失敗なら `toPermissionResult` の deny) を返す。`canUseTool` の戻り値の型は union にする
- **Rationale**: P2 の「`toPermissionResult` の出力は `{behavior, message}` だけ」は他の tool について残る (AD-052 の読み替えの表)。新しい関数に閉じ込めると、`updatedInput` の綴りが現れるのは domain の 1 ファイル (の 1 か所) と、その pin テストだけになる。agents の `session-core.ts` は関数を呼ぶだけで、`updatedInput` を綴らない (項目 16 の backstop が「agents の非テストのコードで `updatedInput` の綴りは 0」で済む。R-10)
- **Alternatives considered**:
  - agents の `session-core.ts` に射影を書く — 項目 16 の backstop に「射影の関数の呼び出しの外」という例外の形が要る (AD-052 Decision 4 (d) は例外の形を許すが、0 件の方が簡単で強い)
  - `toPermissionResult` に引数を足して union を返す — 他の tool の呼び出し元全部の型が union になる

## R-03. 回答の文字列の上限と `multiSelect` の書式

- **Decision**: 1 つの回答は 1〜1,000 コードポイントの文字列 (前後の空白を除いて空でない)。件数は 1〜4 (main の検証)、かつ元の入力の `questions` の数と一致 (agents)。`multiSelect` は選んだ選択肢の `label` を `", "` でつないだ 1 つの文字列。「その他」を選んだら、書いた文をその位置に入れる (`multiSelect` で他の選択肢と一緒なら末尾に `", "` でつなぐ)
- **Rationale**: SDK の型 (`sdk-tools.d.ts:2607`) は `answers?: { [question: string]: string }` で、値は文字列 1 つ。O-5 の過去ログの表示 (`ask-user-question.aui.tsx` の `isSelected`) は `","` で分けてから trim して照合するので、`", "` でつないだ値も選ばれた印として読める。上限の値は spec の Clarifications のとおり
- **Alternatives considered**: `","` (空白なし) — Claude Code の端末の UI の書式が未確認 (V-3 で記録する)。読みやすさで `", "` を採った。書式が違っても Claude は文として読める

## R-04. Elicitation の要求の形の検査とスキーマの部分集合

- **Decision**: agents は `onElicitation(request, {signal})` で要求を受け、data-model §2 の形の検査を通した写し `ElicitationPrompt` を `SessionEvent` の `elicitation-request` で送る。form のスキーマは「平らな object の `properties` の、`string` (`minLength` / `maxLength` / `format` は表示の補助だけ)・`number` / `integer` (`minimum` / `maximum`)・`boolean`・列挙 (`enum` か `oneOf` の `const`/`title`)」だけを写す。部分集合の外の項目が 1 つでもあれば `schema: null` (答えられない) にする。項目は 32 まで (超えたら答えられない)
- **Rationale**: MCP の仕様の Elicitation の `requestedSchema` は「平らな object と原始型」に制限されている (SDK の型は `Record<string, unknown>`)。仕様の中の型だけを描けば、ほとんどのサーバーに答えられ、外れたものは「断る」「取り消す」で安全に返せる (AD-053 Decision 3)。文字列の項目の名前・説明・列挙の表示名は未信頼なので、O-5 の `toOneLineText` と O-6 の `redactSecrets` を通す
- **Alternatives considered**: 任意の JSON Schema を描く (入れ子・配列) — 部品と検証が大きくなり、Out of Scope。スキーマを renderer にそのまま送る — 未信頼の object をそのまま renderer に渡す (AD-036 Decision 2 の「表示用に無害化した文字列だけ」と合わない)

## R-05. Elicitation の相関と待ちの数、状態の機械

- **Decision**: agents は `createElicitationRegistry` (`session-core.ts`。`createPermissionRegistry` と同じ形: `issue` / `register` / `settle` / `drop` / `cancelAll` / `size`) を持つ。相関の id は `randomUUID()` (承認の要求と同じ)。1 セッションで同時に待つ Elicitation は 4 まで。5 つ目は renderer に送らず `{action: 'decline'}` を返す。状態は、承認か Elicitation の最初の 1 件で `transition({kind: 'permission-request'})`、応答・中断で**承認と Elicitation の待ちの合計が 0 になったときだけ** `transition({kind: 'permission-respond'})` (FR-011 / U-5)。`createPermissionRegistry` にも `size()` を足す
- **Rationale**: `run-state.ts` の機械 (`awaiting_permission` ↔ `running`) を変えずに U-5 を満たす。今の `respond-permission` は待ちの数を見ずに `permission-respond` に遷移するので、承認が 2 件重なると 1 件目の応答で `running` に戻る (今の不具合ではないが、FR-011 は「どちらかが残る間は承認待ちのまま」を求める)。合計で判定すれば両方の重なりに当たる
- **Alternatives considered**: 新しい状態 `awaiting_answer` (U-5 の代わりの案) / 上限を持たない — MCP サーバーが要求を出し続けると renderer の列とメモリが伸びる

## R-06. 中断・終了での Elicitation の返し方

- **Decision**: SDK の `signal` の abort で `drop` し、`null` ではなく `{action: 'cancel'}` で resolve する。セッションの `finish()` / `kill` / 最初のプロンプトの前の `end` では `cancelAll()` (`denyAll()` の隣) で全部を `{action: 'cancel'}` にする。renderer は `failure` / `state` が終端になったとき、または `close()` で、そのセッションの待ちの列を捨てる。agents が `respond-elicitation` を受けて `settle` できなかった (id が無い) ときは何もしない
- **Rationale**: `onElicitation` の戻り値の `null` は「応答しない」(fail-closed) だが、SDK の説明では未処理のまま CLI に残る可能性がある。`cancel` を明示した方が MCP サーバーが待ち続けない。中断後の応答は SDK が捨てるので害が無い
- **Alternatives considered**: `decline` を返す — 利用者が断ったのではないので `cancel` が正しい (MCP の仕様の意味)

## R-07. Elicitation の応答の経路 (U-7)

- **Decision**: IPC のチャネル `respondElicitation` を足す。`ClostaCapability.respondElicitation(sessionId, requestId, action, content?)`。main の `handleRespondElicitation` は `sessionId` / `requestId` の UUID・`action` の列挙・`content` の形 (data-model §3。省略可・あれば 0〜32 キー) を明示の述語 (domain に置き、renderer と agents も同じものを使う。spec U-9) で検証し、`controlSession(sessionId, {kind: 'respond-elicitation', response})` を呼ぶ。`action` が `accept` でないときの `content` は捨てる (渡さない)。agents の `decodeSessionControl` も同じ形を検証し直す (`decodeDecision` と同じ扱い)
- **Rationale**: spec U-7 (`.needs-input.md` の Q1 の回答 A)。今の main は制御の種類ごとに専用のチャネルと capability のメソッドを持つ
- **Alternatives considered**: `respondPermission` に相乗りさせる (U-7 の代わりの案)

## R-08. URL の Elicitation の開き方

- **Decision**: カードの「ブラウザで手続きをする」は `<a href={openUrl} target="_blank" rel="noreferrer noopener">`。押すと renderer の新しいウィンドウの要求になり、main の `setWindowOpenHandler` → `openExternalIfHttp` (http(s) だけ) が OS の既定のブラウザに渡す (`src/main/app/window.ts:31` / `:65`)。リンクの `onClick` は既定の動作を止めずに content なしの `accept` を返してカードを外す (spec U-8。MCP の URL モードの `accept` は「URL に進むことに同意した」の意味で、完了はサーバーが `elicitation_complete` で知らせる)。agents は `new URL()` で解釈でき、`protocol` が `http:` / `https:` で、2,048 文字以内のものだけを `openUrl` に入れる。表示用の `displayUrl` は `redactSecrets` を通した文字列と、強調する `host` を別に持つ
- **Rationale**: AD-053 Decision 5 (URL を開く IPC を作らない)。renderer には `target="_blank"` の先例が無いが、`setWindowOpenHandler` は scaffold 由来の防御で、どの URL も新しいウィンドウを開かずに `openExternalIfHttp` に落ちる (`deny` を返す)。CSP にも当たらない (遷移ではない)
- **Alternatives considered**: `window.open(url)` — 同じ経路に落ちるが、`<a>` の方が支援技術でリンクとして読まれ、中クリックなどでも同じ防御に落ちる。URL を開く IPC を足す (AD-053 の Alternatives)

## R-09. `elicitation_complete` の行と、拒否の行の「編集して再試行」の印

- **Decision**:
  - `live-signals.ts` の `onSystem` の switch に `elicitation_complete` を足し、システムイベントの行 (`rowEvent`) を作る: id `elicitation:${elicitation_id}` (`isValidToolUseId` を通らなければ `elicitation:${uuid}`)・category `elicitation` (新規。`SYSTEM_EVENT_CATEGORIES` 11 → 12)・status は既存の `completed` (新しい status は足さない)・name はサーバー名 (`isMcpName` を通らなければ空で、文言の側で「MCP サーバー」)
  - `onRefusalNoFallback` は `refused_user_message_uuid` が文字列で空でないとき、status を `no-fallback-retry` (新規。`SYSTEM_EVENT_STATUSES` 21 → 22) にする。値は運ばない
  - renderer の拒否の行は status が `no-fallback-retry` のときだけ「編集して再試行」を出す。入れる文は、稼働中のストアのそのセッションのメッセージの列で、拒否の行より前にある最も近い `user-*` (アプリが送った入力。`appendUser` が作る楽観の行) の本文
- **Rationale**: `TRANSCRIPT_PART_FIELDS` を変えない (SC-010) ので、真偽は既存のフィールド (status) の列挙で運ぶ。category と status の列挙の追加は O-4〜O-6 が同じ形で行ってきた (固定テストは `system-event.test.ts`)。`elicitation_complete` は「手続きが終わった」の 1 行なので、既存の `completed` で足りる
- **Alternatives considered**: 拒否の行に UUID を運び、renderer が `uuid` で利用者のメッセージを探す — SC-008 が値を運ばないことを求める。稼働中のストアの利用者のメッセージの id は `user-${seq}` で SDK の uuid と対応しない。`refused_user_message_uuid` を見ず、全部の `no_fallback` の行にボタンを出す — 自動のプロンプト (Hook など) の拒否で、関係のない利用者の文を戻してしまう

## R-10. 項目 16 の backstop (`updatedInput` / `updatedPermissions`)

- **Decision**: `scripts/constitution/check.mjs` の項目 16 に、`AGENT_SDK_IMPORT_DIRECTORIES` (`src/agents/`) の非テストのコード (コメントを除いた `src.code`) に識別子 `updatedInput` / `updatedPermissions` が現れたら違反にする検査を足す。違反の fixture `tests/rule-fixtures/b-equivalent/sdk-updated-input.ts.fixture` と `expected.mjs` の行を足す。射影は domain にあるので、agents の正しいコードで 0 件になる
- **Rationale**: AD-052 Decision 4 (d)。domain の射影の関数は SDK を import しないので、SDK の型の `updatedInput` を agents が直接組む経路だけを閉じればよい
- **Alternatives considered**: domain にも検査を広げる — 射影の関数そのものが綴るので例外が要る。pin テスト (FR-004) が domain の側を守る

## R-11. composer のスラッシュコマンドの候補 (Principle XIII の照合)

- **Decision**: assistant-ui 0.15.19 の `ComposerPrimitive.Unstable_TriggerPopoverRoot` / `Unstable_TriggerPopover` (`char="/"`) と `.Directive` を使う。adapter は `categories: () => []` と `search(query)` (表示中のセッションの `slashCommandEntries(meters)` を名前の昇順・前方一致で返す) を持つ平らな検索。`matcher` で「入力の先頭 (offset 0) の `/` から、空白までの間」だけに当てる (U-6 (d))。`formatter.serialize(item)` は `/${item.id}` (選ぶとライブラリが末尾に空白を足し `/{name} ` になる)。候補は 20 件まで描き、超えた数を「ほか N 件」で添える。名前・説明・引数の形は O-5 の合流の結果のまま (無害化済み)
  - registry の `Composer slash commands` / `Composer trigger popover` (F 節) は tasks の SH で `npx assistant-ui@latest add` で取り込み、実名で照合する (015 SH-002 と同じ方法)。不採用の条件は CSP (`style-src 'self'`) の下で動かない・文言が日本語の props にできない・新しい npm の依存が要る・IME のガード (`isComposing` / 229) を外す。照合の結論は PR の説明と対応表の F 節に書く
- **Rationale**: primitive は `ComposerPrimitive.Input` のキー処理の中で動き、`handleKeyPress` は `nativeEvent.isComposing` のときトリガーの plugin より前に返る (`ComposerInput.js`)。変換中に候補を出さずキーを奪わない (Principle VIII) をライブラリの側で満たす。開いている間は Input に combobox の ARIA が付く。`categories()` が `[]` で `search` があると、空の問い合わせでも平らな検索になる (`triggerNavigationResource.js`)。glossary の Composer の Counterexample (`ComposerPrimitive.Input` を差し替えない) を守れる
- **Alternatives considered**: 自作の listbox を composer の上に重ねる — Principle XIII と AD-037 D1 (IME のガードはライブラリ側) に反する。`unstable_` の API の変化は R-13 / RK-05

## R-12. composer のフォーカス (system-scope O-7 pr-gate R2 (1))

- **Decision**: `thread.aui.tsx` の `Composer` の `ComposerPrimitive.Input` に `unstable_focusOnRunStart={false}` を渡す。`unstable_focusOnThreadSwitched` は既定 (true) のまま (U-6 (c))。`unstable_focusOnScrollToBottom` (既定 true。最下部へのスクロールで focus を呼ぶ) は今回は変えず、RK-06 で記録する
- **Rationale**: `ComposerInput.js` は `thread.runStart` で `focus()` を呼ぶ (`autoFocus` のときだけ)。runStart だけを止めれば、行の選択の直後に打てる今の挙動を保てる
- **Alternatives considered**: `autoFocus` を外す — 行の選択とスレッドの切り替えの移動も止まる

## R-13. composer のボタンの日本語の名前

- **Decision**: `COMPOSER_LABELS` (`features/chat/labels.ts:414`) に `send: '送信'`・`stop: '生成を止める'`・`scrollToBottom: '最下部へ'`・`startVoice: '音声入力を始める'`・`stopVoice: '音声入力を止める'` を足し、`thread.aui.tsx` の `ComposerAction` と `VirtualScrollToBottom` / `ThreadScrollToBottom` の tooltip / aria-label を表から取る。locator は `e2e/ime.spec.ts:105` (`'Send message'`) と `LivePane.o2.test.tsx:454` (`'Stop generating'`) を同じ PR で直す。perf/ に当たる文字列は無い (grep 0 件)
- **Rationale**: AD-045 Decision 2 (文言の表)。spec の Clarifications の語
- **Alternatives considered**: なし (ポジティブリストの UI ラベル)

## R-14. 問いのカードの部品 (Principle XIII の照合)

- **Decision**: 問いのカード (Elicitation) は `features/session/ElicitationCard.tsx` に自作する。承認カード (`ApprovalCard.tsx`。対応表 F 節「Approval card」の自作) と同じ枠と `role="alertdialog"`。入力は components/ui の `input` / `textarea` と、ラジオ・チェックは素の `<input type="radio|checkbox">`。registry の `Elicitation form` (A) と `Question flow` (C) は SH で取り込んで照合し、不採用の条件 (R-11 と同じ + 回答の送り先の配線が要る + `header` のチップ・`multiSelect` を持たない (Question flow。015 research R-03)) で判断する
- **Rationale**: 承認カードと同じ場所・同じ操作の形 (FR-007) にすると、フォーカスの規則 (`focus-handoff.ts`) と読み上げをそのまま当てられる
- **Alternatives considered**: registry の element をそのまま使う — 照合の前に決めない (SH で判断し、採れるなら差し替える)

## R-15. 「編集して再試行」の下書きの置き換えの確かめ

- **Decision**: components/ui の `dialog` (`alert-dialog` は無い) で「入力中の文を置き換えますか」を出す。ボタンは「置き換える」「取り消す」で、既定のフォーカスは「取り消す」。置き換えたら `aui.composer.setText(text)` (LivePane の `DraftBridge` と同じ口) と `setDraft`、フォーカスを composer へ
- **Rationale**: 既存の部品で済む。破壊的な操作の既定を取り消しにする
- **Alternatives considered**: `window.confirm` — 見た目と読み上げが揃わない

## R-16. `dontAsk` / `plan` での `AskUserQuestion` と、O-8 の観測点

- **Decision**: 規則は「承認の要求として届いたときだけ答えられる」。届き方は V-3 で記録する (spec Edge Cases)。O-8 の観測点 `receivedMessages` は `message` だけを数えるので、`elicitation_complete` の行 (`message`) は数え、`elicitation-request` (新しい `SessionEvent` の種類) は数えない。roadmap の O-8 の行の (c) に並べて書く (FR-017)
- **Rationale**: 確かめずに分岐を足さない
