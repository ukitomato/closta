# Data Model: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Spec**: [spec.md](spec.md) / **Plan**: [plan.md](plan.md) / **Research**: [research.md](research.md)

本書は spec が「正本は data-model」と指した規則の正本である: 射影の規則と上限 (§1)、Elicitation の通すフィールドとスキーマの部分集合 (§2)、main と agents の検証 (§3)、状態と保持 (§4)、行と composer (§5)、対応表の書き換え先 (§6)。IPC と制御の形は [contracts/session-answer-boundary.md](contracts/session-answer-boundary.md)。

---

## §1. `AskUserQuestion` の回答の射影 (AD-052)

### 型 (domain `src/domain/session/agent-session.ts`)

| 型 | 変更 | 形 |
|---|---|---|
| `PermissionRequest` | 任意のフィールドを 1 つ足す | `answerable?: 'ask-user-question'` — agents が SDK の `toolName === 'AskUserQuestion'` (無害化の前・完全一致) のときだけ付ける |
| `PermissionDecision` | 任意のフィールドを 1 つ足す | `answers?: readonly string[]` — 問いの位置ごとの回答。`outcome: 'allow'` のときだけ意味を持つ (`deny` では捨てる) |
| `PermissionResultLike` | 変えない | `{behavior: 'allow'|'deny', message?}` |
| `AskUserQuestionResult` | 新規 | `{behavior: 'allow', updatedInput: Readonly<Record<string, unknown>>}` |
| `CanUseToolResult` | 新規 (union) | `PermissionResultLike | AskUserQuestionResult` |

### 定数

| 名前 | 値 | 用途 |
|---|---|---|
| `ASK_USER_QUESTION_TOOL_NAME` | `'AskUserQuestion'` | 完全一致の比較 (agents) |
| `ANSWER_MAX_COUNT` | `4` | main の件数の上限 (SDK の型の問いの数の上限) |
| `ANSWER_MAX_CODE_POINTS` | `1000` | 1 つの回答・Elicitation の文字列の値の上限 |

### 検証の述語 `isPermissionAnswers(value: unknown): value is readonly string[]` (domain。U-9)

配列・1〜`ANSWER_MAX_COUNT` 件・全部が文字列・各値が**前後の空白を除いて 1 コードポイント以上**かつ (除く前の値で) `ANSWER_MAX_CODE_POINTS` 以下。`as` を使わない。renderer の送る前の確かめ (`AskUserQuestionAnswer`)・main (`validate.ts` から呼ぶ)・agents (`decodeDecision`) が**同じ関数**を呼ぶ。射影 (下) の 5. はこの述語と同じ規則で、3 段のどこでも空白だけの回答が落ちる。

### 回答の文字列 (renderer が問いごとに組む。research R-03)

| 問い | 回答の文字列 | 「答えた」(US-1 AC3。U-6 (a)) |
|---|---|---|
| 単一 | 選んだ選択肢の `label`。「その他」を選んだら書いた文 | 回答の文字列が前後の空白を除いて 1 コードポイント以上 (選択肢を選んだ、か「その他」を選んで空白以外を書いた) |
| `multiSelect` | 選んだ選択肢の `label` を `", "` でつなぐ。「その他」に書いた文があれば末尾に `", "` でつなぐ (空白だけなら足さない) | 同上 (選択肢を 1 つ以上選んだ、か「その他」に空白以外を書いた) |

送る値は組んだ文字列そのもの (trim しない)。「答えた」の判定と `isPermissionAnswers` は同じ「前後の空白を除いて 1 コードポイント以上」を使う。

### 射影 `projectAskUserQuestionAnswer(rawInput: unknown, answers: readonly string[]): Record<string, unknown> | null`

純関数。次のどれかで `null` (= 拒否として返す):

1. `rawInput` が plain object でない、`questions` が配列でない、問いの数が 1〜4 でない
2. どれかの `questions[i]` が object でない、`question` が空でない文字列でない
3. 問いの文 (`questions[i].question`) が重なる (キーが衝突する。spec Edge Cases)
4. `answers.length !== questions.length`
5. どれかの回答が文字列でない、前後の空白を除いて空、`ANSWER_MAX_CODE_POINTS` を超える

成功したら `{...rawInput, answers: Object.fromEntries(questions.map((q, i) => [q.question, answers[i]]))}` を返す (浅い複製。元の入力の他のキーを変えない。既にある `answers` は置き換わる。`annotations` は足さない)。キーの組み立てに `Object.fromEntries` を使う (`__proto__` の問いの文で原型を書き換えない)。

### 写像 `toAskUserQuestionResult(decision, rawInput): CanUseToolResult`

| 入力 | 出力 |
|---|---|
| `decision.outcome === 'deny'` | `toPermissionResult(decision)` |
| `allow` かつ `answers` が無い | `toPermissionResult({...decision, outcome: 'deny', message: '回答がありません'})` (回答の無い許可は送らない。US-1 AC3 の裏返し) |
| `allow` かつ射影が `null` | `toPermissionResult({...decision, outcome: 'deny', message: '回答を Claude に渡せませんでした。本文で答えてください'})` |
| `allow` かつ射影が成功 | `{behavior: 'allow', updatedInput}` |

### `createCanUseTool` の分岐 (agents `session-core.ts`)

- 要求を出すとき: `answerable` は `toolName === ASK_USER_QUESTION_TOOL_NAME` のときだけ付ける
- 決定を受けたら `boundDecisionScope` を通し、`toolName === ASK_USER_QUESTION_TOOL_NAME` なら `toAskUserQuestionResult(bounded, input)`、それ以外は `toPermissionResult(bounded)`。他の tool の決定に `answers` があっても捨てる

### pin (FR-004 / SC-002)

| 対象 | 期待 |
|---|---|
| `toPermissionResult` の出力のキー | ⊆ `{behavior, message}` (今のまま) |
| `toAskUserQuestionResult` の許可の出力のキー | `= {behavior, updatedInput}` |
| `updatedInput` のキー | `= keys(rawInput) ∪ {answers}` |
| `updatedPermissions` | どの出力にも無い |
| `createCanUseTool` の return | 全部が `toPermissionResult(` か `toAskUserQuestionResult(` を通る (`session-core.test.ts:248-270` の静的な検査を 2 つの関数を認める形に直す) |
| 負の fixture | 別の tool 名 (`Bash`)・似た名前 (`mcp__x__AskUserQuestion`・`AskUserQuestion ` (末尾の空白)・`askuserquestion`)・件数違い・1,001 コードポイント・空の回答・空白だけの回答 (`'   '`・`'\n'`)・重なる問いの文・`__proto__` の問いの文・renderer が問いの文を送った形 (`answers` が object) → `updatedInput` が出ない |

---

## §2. Elicitation の要求の写し (AD-053 Decision 2)

### `SessionEvent` の新しい種類

`{ kind: 'elicitation-request'; request: ElicitationPrompt }` (`SESSION_EVENT_KINDS` 8 → 9)

### `ElicitationPrompt` (domain `src/domain/session/elicitation.ts`。新規)

| フィールド | 型 | 元 (`ElicitationRequest`) | 検査・変換 |
|---|---|---|---|
| `requestId` | `string` (UUID) | agents が採番 | `randomUUID()` |
| `serverName` | `string` | `serverName` | `isMcpName` (`^[A-Za-z0-9_-]{1,128}$`) を通れば値、通らなければ `''` (文言の側で「MCP サーバー」) |
| `title` | `string` | `title` か `displayName` | `toOneLineText(raw, 120)` → `redactSecrets`。無ければ `''` |
| `message` | `string` | `message` | 改行を保った本文として `sanitizeBody` → `redactSecrets` → 2,000 コードポイントで切る。無ければ `''` |
| `mode` | `'form' | 'url'` | `mode` | `'url'` 以外は `'form'` (SDK の既定) |
| `url` | `ElicitationUrl | null` | `url` | `mode === 'url'` のときだけ。下の表 |
| `fields` | `readonly ElicitationField[] | null` | `requestedSchema` | `mode === 'form'` のときだけ。下の部分集合の外なら `null` (答えられない) |

`elicitationId` は renderer に運ばない (agents の中で `elicitation_complete` との照合にも使わない。行は届いた事実だけを出し、カードを外さない。`elicitation_complete` の `elicitation_id` は行の id にだけ使う。AD-053 Decision 6・spec U-8)。`description` は `message` が空のときだけ `message` の代わりに使う。

### `ElicitationUrl`

| フィールド | 検査 |
|---|---|
| `openUrl` | `new URL(raw)` が成り立ち、`protocol` が `http:` / `https:`、2,048 文字以内。外れたら `url` を `{openUrl: null, displayUrl, host: ''}` にする (「開けない URL」。断る・取り消すだけ) |
| `displayUrl` | `redactSecrets(toOneLineText(raw, 300))` (userinfo とクエリの秘密を伏せる。開く URL は伏せない) |
| `host` | `new URL(raw).host` (解釈できなければ `''`) |

### `ElicitationField` (スキーマの部分集合)

`requestedSchema` が `{type: 'object', properties: {...}, required?: string[]}` で、`properties` の項目が 1〜32 で、全部が下のどれかのときだけ写す。1 つでも外れたら `fields: null`。

| 種類 | 元の形 | 写すもの |
|---|---|---|
| `string` | `{type: 'string', title?, description?, minLength?, maxLength?, format?, default?}` | `minLength` / `maxLength` (0〜1000 の整数のときだけ。上限は 1000 で丸める)・`format` (`email` / `uri` / `date` / `date-time` のときだけ。入力の `type` の補助)・`default` (文字列) |
| `number` / `integer` | `{type: 'number'|'integer', minimum?, maximum?, default?}` | 有限の数のときだけ |
| `boolean` | `{type: 'boolean', default?}` | 真偽 |
| `enum` | `{type: 'string', enum: string[], enumNames?}` か `{type: 'string', oneOf: [{const, title}]}` | 値 (1〜50 件。各 1〜200 コードポイント) と表示名 |

各項目の共通: `key` (`^[A-Za-z0-9_.-]{1,64}$` を通らなければ部分集合の外)・`label` (`title` → `toOneLineText(…, 120)` → `redactSecrets`。無ければ `key`)・`description` (`toOneLineText(…, 300)` → `redactSecrets`)・`required` (`required` の配列に含まれるか)。

---

## §3. 検証 (FR-002 / FR-008)

### 述語の置き場所 (U-9)

検証の述語は domain に置き (`isPermissionAnswers` は `agent-session.ts`、`isElicitationAction` / `isElicitationContent` は `elicitation.ts`。`as` を使わない)、renderer の送る前の確かめ・main の `validate.ts`・agents の `decodeSessionControl` が**同じ関数**を呼ぶ。renderer は述語を通したものだけを送るので、main で落ちるのは renderer の不具合のときだけである。IPC の戻り値は `Promise<void>` のまま (今の `respondPermission` と同じ。落ちても renderer に失敗を返さない)。

### main (`src/main/app/validate.ts` から domain の述語を呼ぶ)

| 入力 | 述語 | 外れたとき |
|---|---|---|
| `respondPermission` の `answers` (第 5 引数。省略可) | `isPermissionAnswers` (§1) | 制御を送らない (supervisor に届けない) |
| `respondElicitation` の `sessionId` / `requestId` | UUID (`isValidSessionId`) | 同上 |
| `action` | `isElicitationAction`: `'accept' | 'decline' | 'cancel'` | 同上 |
| `content` (`accept` のときだけ読む。**省略可**) | `isElicitationContent`: plain object (原型が `Object.prototype` か `null`)・キーは **0〜32**・各キーは `^[A-Za-z0-9_.-]{1,64}$` で、`__proto__` / `constructor` / `prototype` ではない・値は文字列 (0〜1,000 コードポイント)・有限の数・真偽 | 同上 |

`action` が `accept` でないとき `content` は捨てる (制御に載せない)。`accept` で `content` が無い (URL の `accept`) のも通す。空の object (`{}`。全部が任意の form を空で送った) も通す。

### form の値の組み立て (renderer。US-2 AC8)

| 項目の種類 | 初期値 | 送る値 |
|---|---|---|
| `string` | `default` があればそれ、無ければ空 | 空 (前後の空白を除いて 0 コードポイント) ならキーごと省く。それ以外は入力のまま |
| `number` / `integer` | `default` があればそれ、無ければ空 | 空ならキーごと省く。それ以外は `Number(…)` が有限のときだけ (外れたら `invalid`) |
| `boolean` | `default` があればそれ、無ければ `false` | 常に送る (チェックの有無が `true` / `false`。「未選択」は無い) |
| `enum` | `default` が列挙の中ならそれ、無ければ未選択 | 未選択ならキーごと省く |

必須 (`required`) の項目でキーが省かれる (= 空・未選択) と、送らずに `invalid` を出す (真偽は常に値があるので必須を満たす)。全部の項目が任意で何も入れなければ `content: {}` を送る。URL の要求への応答 (リンクを押す) は `content` を付けない。

### agents

| 段 | 検査 | 外れたとき |
|---|---|---|
| `decodeSessionControl` | main と同じ domain の述語で形の検査をやり直す (`decodeDecision` の `answers`・新しい `respond-elicitation`) | `null` (制御を捨てる) |
| 射影 (§1) | 問いの数との一致ほか | 拒否として返す |
| Elicitation の照合 (`accept` のとき。registry が持つ要求の形 (§4) で分ける) | 下の表 | 下の表 |

| registry の要求の形 | `accept` への応答 (SDK に返すもの) |
|---|---|
| `{mode: 'url', openable: true}` | `content` を捨てて `{action: 'accept'}` (付いていても SDK に渡さない) |
| `{mode: 'url', openable: false}` (`openUrl: null`) | `{action: 'decline'}` |
| `{mode: 'form', fields: null}` (部分集合の外) | `{action: 'decline'}` |
| `{mode: 'form', fields}` | `content` が無ければ `{}` として照合する。`content` のキーの集合 ⊆ `fields` のキー、`required` の項目が全部ある、値の型が項目の種類と合う (`integer` は整数、`enum` は値の中、`string` の長さは `minLength` / `maxLength` の中で、`required` の `string` は前後の空白を除いて 1 コードポイント以上、数は `minimum` / `maximum` の中)。通れば `{action: 'accept', content}` (`content` が無かったら `content: {}`)、外れれば `{action: 'decline'}` |

`decline` / `cancel` はどの形でもそのまま (`content` 無し)。

renderer は main の検証の前に同じ domain の述語と同じ照合の範囲 (`matchesElicitationSchema`) を確かめ、外れたら送らずにカードに理由を出す (U-6 (e))。

---

## §4. 状態と保持

### agents (`session-core.ts` / `sdk-agent-session.ts`)

| 要素 | 規則 |
|---|---|
| `createElicitationRegistry` | `issue()` (UUID) / `register(id, resolve, shape)` / `settle(response): boolean` / `drop(id): boolean` / `cancelAll()` / `size()`。`shape` は `{mode: 'url', openable: boolean}` (`openable` = `openUrl !== null`) か `{mode: 'form', fields: readonly ElicitationField[] | null}` で、`settle` は §3 の表のとおりに SDK への戻り値を決める。保持するのは resolve と要求の形 (mode とスキーマの写し) だけ (入力の値は持たない) |
| 待ちの上限 | `ELICITATION_MAX_PENDING = 4`。超えたら renderer に送らず `{action: 'decline'}` |
| 状態の遷移 | 承認か Elicitation の要求を出すとき `permission-request`。応答・中断で `permissions.size() + elicitations.size() === 0` のときだけ `permission-respond` |
| 中断 (`signal`) | `drop` して `{action: 'cancel'}`。renderer には知らせない (U-10)。後から届いた同じ `requestId` の `respond-elicitation` は `settle` が `false` を返し、何もしない (SDK の callback も状態の遷移も起こさない) |
| 終了 (`finish` / `kill` / 最初のプロンプトの前の `end`) | `denyAll()` の隣で `cancelAll()` |
| `acceptsWhileClosing` | `respond-elicitation` は `respond-permission` と同じく無視する |
| ログ・永続化 | `content` を記録・出力しない (agents の記録の出力は今も 0 件。AD-043 Decision 6) |

### renderer (`running-session-store.ts` / `running-session-types.ts`)

| 要素 | 規則 |
|---|---|
| `LiveSessionState.elicitations` | `readonly ElicitationPrompt[]` (届いた順)。先頭の 1 枚を描き、残りの数を添える (U-6 (b)) |
| 追加 | `elicitation-request` を受けたら末尾に足す (同じ `requestId` は足さない) |
| 外す | 応答を送ったとき (送る前に外す。`respond` と同じ。URL のリンクを押したときも `accept` を送るので外す)・`failure`・`kill()` (`pending` と同じ)・`close()`・`state` が `interrupted` / `error` / `done` になったとき (ターンが走っていない状態。SDK の callback はターンの中でしか待たないので、この状態で待ちは残っていない)。`running` / `awaiting_permission` / `launching` / `idle` では外さない。`elicitation_complete` の行では外さない (U-8) |
| SDK の側の中断 (U-10) | ターンを続けたまま `signal` で中断された要求を renderer に知らせるイベントは無い。カードは残り、最後の待ちなら `state` は `running` に戻る。押すと上の「外す」でカードが外れ、応答は agents の registry に無い `requestId` として捨てられる (既知の限界。spec US-2 AC7) |
| 送る前の確かめ | `respondElicitation` を呼ぶ前にカードが domain の述語 (`isElicitationAction` / `isElicitationContent`) と `matchesElicitationSchema` を通す。通らなければストアを呼ばない (外さない)。main の拒否を renderer に返す経路は無い (U-9) |
| 入力の値 | カードの component の state だけに持つ。ストアに入れない。カードが外れると捨てる (SC-004) |
| 回答の値 | 承認カードの component の state だけ。`respond(sessionId, requestId, outcome, answers?)` に渡して捨てる |

---

## §5. 行と composer

### システムイベントの行

| 列挙 | 追加 | 件数 | 文言 (`features/chat/labels.ts`) |
|---|---|---|---|
| `SYSTEM_EVENT_CATEGORIES` | `elicitation` | 11 → 12 | category の名前「MCP の手続き」。行の文「{サーバー名 \|\| 'MCP サーバー'} の URL での手続きが終わりました」 |
| `SYSTEM_EVENT_STATUSES` | `no-fallback-retry` | 21 → 22 | 表示は `no-fallback` と同じ (status の表示名を同じ文言にする)。拒否の行に「編集して再試行」を出す印 |

`elicitation_complete` の行: id `elicitation:${elicitation_id}` (`isValidToolUseId` を通らなければ `elicitation:${uuid}`)・category `elicitation`・opens `true`・detail `''`・status `completed`・name はサーバー名 (`isMcpName` を通らなければ `''`)。`TRANSCRIPT_PART_FIELDS` は変えない。

### 「編集して再試行」

| 条件 | 振る舞い |
|---|---|
| status が `no-fallback-retry` で、稼働中のストアに拒否の行より前の `user-*` のメッセージがある | ボタン「編集して再試行」を出す |
| 押す・composer が空 | その文を composer に入れ (`aui.composer.setText` と `setDraft`)、フォーカスを composer へ。送らない |
| 押す・composer に下書きがある | dialog「入力中の文を置き換えますか」(「置き換える」/「取り消す」。既定のフォーカスは「取り消す」) |
| 過去ログ・`no-fallback`・`fallback` | 出さない |

### コマンドの候補

| 規則 | 値 |
|---|---|
| 一覧 | `slashCommandEntries(meters)` (015 data-model §2 の合流の結果) |
| 当てる位置 | 入力の先頭の `/` から最初の空白の手前まで (`matcher`) |
| 比べ方 | 名前の先頭の `/` を 1 つ外して、問い合わせの前方一致 (大文字小文字を区別しない) |
| 並び | 名前の昇順 (`localeCompare` の `'en'`) |
| 件数 | 20 まで。超えた数を「ほか {N} 件」 |
| 入れる値 | `/{name} ` |
| 出さない | 変換中・一覧が 0 件・過去ログ・稼働中でないセッション |

### 文言 (新規)

composer と transcript の行の文言は `features/chat/labels.ts`、承認カードと問いのカードの文言は `features/session/labels.ts` (今の `APPROVAL_CARD_LABELS` の置き場。`:186`) に置く。

| 表 | キー → 文言 |
|---|---|
| `COMPOSER_LABELS` (chat) | `send` 送信 / `stop` 生成を止める / `scrollToBottom` 最下部へ / `startVoice` 音声入力を始める / `stopVoice` 音声入力を止める / `commandCandidates` コマンドの候補 / `moreCommands` ほか {N} 件 / `retryReplaceTitle` 入力中の文を置き換えますか / `retryReplace` 置き換える / `retryCancel` 取り消す |
| `APPROVAL_CARD_LABELS` (session。`ApprovalCard` の直書きの「許可」「拒否」もここに集める) | `allow` 許可 / `deny` 拒否 / `sendAnswers` 回答を送る / `other` その他 / `otherPlaceholder` 自由に書く / `unanswered` 未回答の問いがあります / `cannotAnswer` この問いにはアプリから答えられません。拒否して本文で答えてください。`askUserQuestionNotice` を削る |
| `ELICITATION_LABELS` (session) | `heading` {サーバー名} からの問い / `unknownServer` MCP サーバー / `submit` 送る (form だけ) / `decline` 断る / `cancel` 取り消す / `openUrl` ブラウザで手続きをする (URL のリンク。押すと開いて `accept` を返す。U-8) / `openUrlNote` 開くと、手続きに進むことがサーバーに伝わります / `cannotOpenUrl` この URL はアプリから開けません / `unsupported` このアプリでは答えられない形式の問いです。断るか取り消してください / `required` 必須 / `remaining` ほか {N} 件の問い / `invalid` 入力を確かめてください |
| `SYSTEM_EVENT_LABELS` (chat。`SYSTEM_EVENT_CATEGORY_LABELS` / `SYSTEM_EVENT_STATUS_LABELS` は `Record` なので新しい列挙の値の文言も要る) | `retry` 編集して再試行 / `elicitationComplete` {サーバー名} の URL での手続きが終わりました |

---

## §6. 対応表の書き換え先 (FR-016 / SC-009)

| 行 (`docs/ui-coverage.md`) | 書き換え先 |
|---|---|
| A `SDKElicitationCompleteMessage` (:78) | `実装済み: SystemEventRow (実行中)`・経路 `実行中`・備考「O-10。`elicitation` の行 (サーバー名は形の検査を通したものだけ)。過去ログは O-11 の変換に従う」 |
| A `SDKModelRefusalNoFallbackMessage` (:56) | 備考の「「編集して再試行」は O-10」を「O-10: `refused_user_message_uuid` があれば「編集して再試行」(composer に戻すだけ。巻き戻さない)」に |
| A `SDKCommandsChangedMessage` (:72) | 備考の「composer の候補は O-10」を「composer の候補 (O-10)」の実装の記述に |
| C `AskUserQuestionInput` (:139) | `実装済み: AskUserQuestion + ApprovalCard (両方 / 回答は実行中)`・備考「O-10。回答は `updatedInput` の制約付き射影 (AD-052)」 |
| D `permission-request` (:171) | 備考に「O-10: `AskUserQuestion` (SDK の tool 名の完全一致) は答える部品と「回答を送る」(AD-052)」 |
| E `elicitation` (:225) | `実装済み: ElicitationCard (実行中)`・備考「O-10。`onElicitation` (AD-053)。form は部分集合だけ、URL は `openExternalIfHttp`」 |
| E `request_user_dialog` (:226) | `表示不要: 宣言する種類が無い (payload の形が SDK に無い。AD-053 Decision 4)` |
| F `Composer slash commands` (:259) | 使い道を `D composer` (候補)、備考に照合の結論 (SH) |
| F `Composer trigger popover` (:260) | 照合の結論 (primitive を使ったか registry の element を採ったか) |
| F `Elicitation form` (:276) | 備考に照合の結論 (自作の `ElicitationCard` と不採用の理由、または採用) |
| F `Question flow` (:318) | 備考に照合の結論 (承認カードの答える部品と不採用の理由、または採用) |
| F `Approval card` (:240) | 備考に「O-10: `AskUserQuestion` の答える部品」 |

項目 21 の出力で割当先が O-10 の行が 0、`M3 の完了の条件の残り` が 6 → 3 (O-11 の 3 行)。

---

## 観測 (O-8 の基準の変化)

`receivedMessages` は `message` だけを数える。`elicitation_complete` の行は `message` なので数え、`elicitation-request` は数えない。承認カードの答える部品・コマンドの候補・「編集して再試行」は数に影響しない。
