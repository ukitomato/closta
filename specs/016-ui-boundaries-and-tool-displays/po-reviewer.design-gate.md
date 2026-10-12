# po-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-04
**Reviewer**: po-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-005 / SC-001: 会話の境界 (圧縮・会話の作り直し・拒否)、知らせの行、取り消し (US-1)
  - FR-006〜FR-010 / SC-002: 9 つの tool の専用表示と Agent plan の markdown (US-2)
  - FR-011〜FR-013 / SC-003: 結果待ち / 結果不明 / 承認待ちの印、読み上げ、ToolFallback の見出し (US-3)
  - FR-014 / SC-004: 対応表の `後続: O-6` の書き換えと M3 の完了の条件
  - FR-015〜FR-017: roadmap への O-11 の登録、AD-049、glossary・charter などの記録
  - SC-005: 境界 (SessionEvent・TRANSCRIPT_PART_FIELDS・IPC・main) の差分 0
- 対応する charter / Confirmation:
  - ui charter: Mission、KPI (表示網羅・スクロールの安定)、Journey 1 step 3、Journey 2 step 4 (中断)、業務ルール「スクロールアンカリングを壊さない」
  - AD-044 Decision 3 (M3 の完了の条件) / Consequences (持ち主のいない延期を残さない)
  - AD-049 (proposed) の Confirmation: SC-001 / SC-002 / SC-005
  - Constitution XI の Manual (po-reviewer): 受け入れ条件に観測できる振る舞いが 1 つ以上あること。US-1〜US-3 で満たされている
  - Constitution XII
  - O-2 の pr-gate で O-6 に回された残り (`specs/011-ui-coverage/pr-gate.md:30-40`)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (用語の重複は E の L-003 で文言の一貫性としてだけ扱う)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:5 Medium:7 Low:4
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux / a11y / ui-coverage-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:1

## スコープ要約

O-6 は、`docs/ui-coverage.md` で `後続: O-6` になっている 30 行のうち、Tier A の 14 行 (US-1 の境界・拒否・知らせの 5 行と、US-2 の 9 つの tool) と、O-2 の pr-gate から回された表示の状態 (結果待ち・結果不明・読み上げ・ToolFallback の見出し) を実装します。Hook・背景の task・実行中の subagent・Tier B の知らせの類・Checkpoints は、新しい feature の O-11 に送ります (U-1)。FR は 17、SC は 5 で、どの SC も計測経路を持っています。

問題は次の 3 か所に集まっています。

- **負のケース**: 中断、拒否の途中、tool のエラー、結果が 0 件のとき。
- **AC・FR と data-model のずれ**: 過去ログの圧縮の境界、拒否の文言、Task 系の表示。
- **延期した項目の行き先**: O-2 から受けた残りの扱い。Tier A の残りが M3 の完了の判定から抜けます。

## Findings

### [High] 「結果待ち」の判定がセッションの終了だけを見ている。中断・応答待ちのセッションで、結果の来ない tool が「結果待ち」(aria-busy) のまま残る (H-001) (scope: feature)

- **観察**:
  - `specs/016-ui-boundaries-and-tool-displays/data-model.md:53` の規則は「実行中のセッションで、セッションの状態が終わり (終了・失敗) でない → 結果待ち (動く印。`aria-busy`)」です。
  - `spec.md:159` (FR-011) は、この状態を「O-2 の thread の context」から受けるとしています。その実体は `src/renderer/src/features/session/SessionScreen.tsx:358` の `session.ended || errored` です。
  - 一方、`src/domain/session/run-state.ts:10` / `:16` では、`done` (応答が完了して次のプロンプト待ち) と `interrupted` (中断済み) は、claude が生きている間は終了扱いになりません。
  - 実行中のセッションで結果が来ない tool は、確実に生じます。O-2 は結果待ちが 256 件を超えると古いメッセージを捨て (`specs/011-ui-coverage/data-model.md:111`)、後から届いた結果は別のメッセージ `result:<id>` になります。元の part には結果が入りません。
  - 中断は charter の Journey 2 step 4 (`docs/domains/ui/charter.md:100`) にある主要な流れです。それなのに spec には中断の AC も Edge case もありません。
- **同種事象探索**: `中断|interrupted|応答待ち` を `specs/016-*` で検索すると 1 件 (`spec.md:73` の US-1 の Why だけ)。§3 の判定と AC2 (`spec.md:118`) に中断・応答待ちの扱いは 0 件。
- **リスク/影響**:
  - 次のプロンプトを待っているセッションに、終わらない「結果待ち」の動く印と `aria-busy` が出続けます。
  - US-3 の目的は「来ないまま終わった tool を見分ける」ことですが、中断のあとほど見分けられなくなります。
  - スクリーンリーダーの利用者には、処理中だと伝わり続けます。
- **推奨アクション**:
  - §3 の「終わり」を、セッションの終了ではなくターンの終わりで判定してください。たとえば「最新のターンに属する part で、run state が `running` / `awaiting_permission` のときだけ結果待ち。それ以外で結果の無い part は結果不明」とします。
  - AC2 と Edge cases に「中断した後」「応答待ちの間」「O-2 の 256 件の打ち切りで結果が別のメッセージに入った tool」を足してください。
  - FE-030 (`tasks.md:34`) に、中断と応答待ちの fixture を足してください。
- **根拠**: ui charter Journey 2 step 4、glossary の System event row (`docs/glossary.md:829-830`) の「結果不明」の考え方、PO-4
- **scope 根拠**: data-model §3、spec の AC2 と Edge cases、tasks の FE-030 で直せます

### [High] 拒否の取り消しが、ターンの終わりに来る `retracted_message_uuids` だけを扱っている。SDK の `supersedes` を読まないので、fallback のターンの間ずっと、拒否された部分と代わりの応答が並ぶ (H-002) (scope: feature)

- **観察**:
  - SDK の assistant メッセージの型 (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3368-3370`) には `supersedes?: UUID[]` があり、「Evict the named messages on arrival … Idempotent with the end-of-turn model_refusal_fallback notice」と書かれています (届いた時点で外せ、という指示です)。
  - `retracted_message_uuids` の説明 (`sdk.d.ts:5044`) は「Emitted AFTER the retraction, so this is a resolution-time eviction signal」です。つまり後追いの信号です。
  - data-model §1 (`data-model.md:17`) は `model_refusal_fallback` の `retracted_message_uuids` だけで外しています。
  - AD-049 は「外さずに印を付ける」案を、「拒否された部分の応答が会話の一部に見える」という理由で退けています (`docs/decisions/0049-boundaries-retraction-and-o11-split.md:41`)。
- **同種事象探索**: `supersedes` を `specs/016-*` で検索して 0 件、`src/` でも 0 件。
- **リスク/影響**:
  - fallback のモデルで再試行している間 (tool を何回か呼ぶこともあります)、拒否された部分の応答と代わりの応答が両方出ます。
  - 拒否の行はターンの終わりに来るので、それまで理由も出ません。
  - AD-049 が退けた見え方を、ターンの間ずっと生むことになり、U-2 の採用理由 (SDK の指示どおり) も半分しか満たしません。
- **推奨アクション**:
  - 方法 a: 実行中の assistant メッセージの変換で `supersedes` を読み、同じ `retraction` の meter (`SessionEvent` の種類は増えません) で届いた時点で外します。AC3 に「代わりの応答が届いた時点で、置き換えられた応答が外れる」を足します。
  - 方法 b: 「ターンの終わりまで拒否された部分が残る」ことを U-2 と Edge cases に明記し、利用者の承認を受けます。
  - どちらでも FE-010 / BE-010 に fixture を足してください。
- **根拠**: SDK の型の注記、AD-049 Alternatives、PO-4 (届く順序)
- **scope 根拠**: data-model §1、spec の AC3、tasks の BE-010 / FE-010 で直せます

### [High] US-2 に負のケースの AC が無い (tool のエラー・Web の失敗・0 件・画像の Read・Glob の 100 件の打ち切り) (H-003) (scope: feature)

- **観察**:
  - US-2 の AC1〜AC6 (`spec.md:98-103`) はすべて正常系です。
  - Edge cases (`spec.md:126-135`) が US-2 で扱うのは「200 件を超える」「URL として読めない」「知らない status」だけです。
  - data-model §3 (`data-model.md:51`) は「エラー・切り詰めの印は既存」と書くだけで、新しい 3 つの表示が印を出すことを確かめる AC やテストがありません。
  - Glob は 100 件で結果を打ち切ります (`sdk-tools.d.ts:3450` の `truncated`)。File tree の上限は 200 件 (`data-model.md:34`) なので、Glob 自身の打ち切りがどこにも出ません。
  - O-2 は結果の本文を text ブロックだけから取り出します (`specs/011-ui-coverage/data-model.md:112`)。画像や PDF を `Read` すると中身が空になります。
  - 一致なし (Glob / Grep / WebSearch)、空の TaskList、`TaskUpdate` の失敗 (`sdk-tools.d.ts:3942` の `error`) も定義されていません。
  - O-2 の pr-gate は「TodoList のエラーのテスト」を O-6 に回していますが (`specs/011-ui-coverage/pr-gate.md:39`)、FE-022 (`tasks.md:29`) は TodoList の形を使うのに、エラーの fixture がありません。
- **同種事象探索**: `エラー|0 件|空|truncated|打ち切` を `specs/016-*` で検索して 14 件。US-2 の tool のエラーと空の状態を扱うものは 0 件 (`data-model.md:51` の「既存」の注記だけ)。
- **リスク/影響**:
  - ファイルが無い、ネットワークの失敗 (オフライン)、正規表現の誤りのときに、エラーの印が出る保証がありません。
  - 「一致なし」や打ち切りの文を File tree に流すと、偽のファイル名の項目になるか、説明の無い空の tree になります。
  - それでも Tier A の 9 行が `実装済み` になり、O-2 FR-007 の不変条件 (`docs/ui-coverage.md:104`: 各表示にエラーと切り詰めの印を出す) が新しい表示で確かめられないまま残ります。
- **推奨アクション**:
  - US-2 に AC7 を足してください: 「Given 9 つの tool の結果がエラー (`is_error`)、Then 既存のエラーの印と本文が出る (表示ごと)」。
  - Edge cases に次を足してください。
    - 一致が 0 件なら「一致なし」(File tree は出さない)
    - Glob の打ち切りの文があれば「100 件で打ち切られています」
    - ファイルの一覧として読めない行があれば text の表示に倒す
    - `Read` の結果が text でなければ「text でない結果」
  - FE-020〜FE-023 にこれらの fixture と、TodoWrite の `isError` のテストを足してください。
- **根拠**: PO-4 (異常系・空の状態・ネットワークの断)、O-2 FR-007、`specs/011-ui-coverage/pr-gate.md:39`
- **scope 根拠**: spec の US-2 と Edge cases、data-model §2、tasks の FE-020〜FE-023 で直せます

### [High] Task 系の表示: FR-008 と data-model §2 が食い違い、TaskUpdate に題が出ず、「計画と進捗」が読めない (H-004) (scope: feature)

- **観察**:
  - FR-008 (`spec.md:153`) は「TaskCreate / TaskGet / TaskUpdate / TaskList を TodoList の形で描かなければならない」です。ところが data-model §2 (`data-model.md:40`) では TaskGet / TaskList は「結果の text」です。AC5 (`spec.md:102`) は 1 つの AC の中に両方を書いています。
  - `TaskUpdate` の見出しは `taskId` で、項目は「`subject` があれば」です (`data-model.md:39`)。
    - `TaskUpdateInput.subject` は任意です (`sdk-tools.d.ts:2758`)。
    - タスクの id は TaskCreate の結果 (`sdk-tools.d.ts:3922-3926`) にしか無く、TaskCreate の入力にはありません。
    - そのため「タスクを更新 3 / 完了」がどの題のタスクかを、表示から結び付けられません。
  - TaskCreate の項目は状態が「未着手」で固定です (`data-model.md:38`)。完了した後も、transcript には未着手の項目が並びます。
  - 対応表がこれらを Tier A にした理由は「TodoWrite と同じ計画・進捗の概念」です (`docs/ui-coverage.md:139`)。
- **同種事象探索**: `TodoList|taskId|subject` を `specs/016-*` で検索して 8 件 (`spec.md:22`, `:64`, `:102`, `:153`、`data-model.md:38`, `:39`、`research.md:23`、`quickstart.md:20`)。食い違いは `spec.md:102` / `:153` と `data-model.md:40` の間。
- **リスク/影響**:
  - FR と data-model のどちらでテストを書くかが決まりません。
  - 通常の TaskUpdate では、AC5 の「題」を満たせません。
  - US-2 の価値のうち「計画がどこまで進んだか」(Tier A の理由) が届かないのに、4 行が `実装済み` になります。
- **推奨アクション**:
  - 最小案: FR-008 を data-model に合わせます (TaskCreate / TaskUpdate は TodoList の 1 項目、TaskGet / TaskList は text)。AC5 は tool ごとに分けます。
  - TaskUpdate の題は、同じ transcript の TaskCreate の結果 (id と subject) から引けるときに出し、引けないときは「タスク #{id}」と明示します。
  - TaskCreate の項目は「追加した時点: 未着手」のように時点を示します。
  - 代わりの案: TaskList の結果を TodoList に写し、読めなければ text に倒します。これは U-6 として利用者に諮ってください。
- **根拠**: PO-1 / PO-3、`docs/ui-coverage.md:139` の Tier A の理由、ui charter の Journey 1 step 3
- **scope 根拠**: spec の FR-008 / AC5、data-model §2 で直せます

### [High] O-2 の pr-gate が O-6 の design に割り当てた M-201 を扱っていない。Tier A の残りが O-11 の備考に移るだけで、M3 の完了の判定から抜ける (H-005) (scope: feature)

- **観察**:
  - `specs/011-ui-coverage/pr-gate.md:34` の M-201 は、次のように O-6 に割り当てられています: 「Tier A `実装済み` の行の備考で O-6 に回した残り (5 行) を、項目 21 の M3 の件数が数えない → O-6 の design で D 節に行を起こすか、凡例に規定する」。
  - O-6 の申し送りの表 (`plan.md:64-74`) に、この行はありません。
  - data-model §5 は、備考の「O-6」を「O-11」に付け替えるだけです (`data-model.md:92` の hook_started / task_started、`:96` の Agent)。
  - 対象はいずれも Tier A の行です: `docs/ui-coverage.md:53` (一般の Hook)、`:60` (後から背景に移った task)、`:114` (実行中の subagent の入れ子)。
  - AD-044 Decision 3 (`docs/decisions/0044-ui-coverage-assignment.md:52`) が数えるのは `後続` の行だけで、O-11 に割り当てる行は全部 Tier B です。
  - `_overview.md:108` の M3 の行は今も「O-1〜O-6」です。
- **同種事象探索**: `M-201` を、plan・data-model・`docs/roadmap.md`・`docs/ui-coverage.md` で検索して 0 件 (残っているのは `specs/011-ui-coverage/pr-gate.md:34` だけ)。備考で O-6 を指している Tier A の行は 5 件 (`ui-coverage.md:53`, `:60`, `:104`, `:114`, `:117`)。O-6 で解消するのは `:104` と `:117` で、残る 3 件は O-11 に移ります。
- **リスク/影響**:
  - O-6 がマージされると、項目 21 の M3 の残りから O-6 の分が消えます。そのため、一般の Hook (PreToolUse で止まった理由を含む)、後から背景に移った task、実行中の subagent の入れ子が出ないままでも、M3 の「未表示ゼロ」を満たしたと判定されます。
  - O-11 は M3 と書かれていますが、M3 の完了を待たせません。必須なのかどうかという優先度が読めません。
- **推奨アクション**:
  - 案 1: D 節に Tier A の `後続: O-11` の行 (上の 3 つ) を起こし、M3 の判定が O-11 を待つようにします。
  - 案 2: 「O-11 は M3 の完了の条件に含めない」と明記し、3 つが Tier A である理由と、下げるならその理由を ui-coverage-reviewer に諮ります。
  - どちらの案でも FR-015 / SC-004 と、`_overview.md` の M3 の行に書いてください。U-1 の判断にも含め、利用者の承認を受けてください。
- **根拠**: AD-044 Decision 3 / Consequences (持ち主のいない延期を残さない)、`specs/011-ui-coverage/pr-gate.md:34`、PO-5
- **scope 根拠**: FR-014 / FR-015 が触る `docs/ui-coverage.md` と roadmap の範囲で直せます

### [Medium] AC1 の「過去ログでも同じ形で出る」が data-model §1 と合わない (M-001) (scope: feature)

- **観察**:
  - AC1 (`spec.md:79`) と quickstart の V-3 (`quickstart.md:16`) は「同じ形」です。
  - data-model §1 (`data-model.md:16`) は、過去ログを「数は出さない」としています。過去ログの DTO が運ぶのは label だけです (`src/domain/session/transcript.ts:207`)。
  - Edge case の「過去ログの圧縮の境界に `pre_tokens` などが無い」(`spec.md:126`) は、記録に無いことを前提にしています。実際は DTO が運ばないので、過去ログではいつも数が出ません。
- **リスク/影響**: 同じ `/compact` が、実行中は「(手動、N → M トークン)」付き、開き直すと括弧なしで出ます。AC と V-3 の合否を判断できません。
- **推奨アクション**: AC1 を「過去ログは同じ element で、手動 / 自動と数を省いた文言」と書き分けてください。Edge case は「過去ログは数を運ばない (DTO を変えない)」に、V-3 もそれに合わせて直してください。
- **根拠**: PO-3

### [Medium] 拒否の AC3 / AC4 / AC6 が data-model §4 の文言に置き場所を持たない。「外した数」は実際に外した数と一致しない (M-002) (scope: feature)

- **観察**:
  - AC4 (`spec.md:82`) の `content` と、AC6 (`spec.md:84`) のカテゴリが、§4 の文言 (`data-model.md:76-77`) にありません。カテゴリの訳の表もありません。
  - AC3 は「外した数」です。一方、data-model §1 (`data-model.md:11`) は `retracted_message_uuids` の件数です。
  - SDK のこの列には、tombstone になった tool_result の uuid も入ります (`sdk.d.ts:5044`)。O-2 は tool の結果を tool-call の part に埋めるので (`specs/011-ui-coverage/data-model.md:105-108`)、それらはストアのメッセージとして存在しません。
  - 行は agents で組みますが、外すのは renderer です。
- **リスク/影響**: 「{n} 件のメッセージを取り消しました」が実際より多く出ます。カテゴリが英語のキーのまま出るか、まったく出ないかが決まりません。
- **推奨アクション**:
  - §4 に、カテゴリの訳 (知らない値は出さない) と、no-fallback の `content` を出す位置を足してください。
  - AC3 を「SDK が取り消しを指示した件数」に直すか、renderer が実際に外した件数で文言を組んでください。
  - tool_result の uuid を含む fixture を足してください。
- **根拠**: PO-3

### [Medium] 拒否と知らせのあとに、利用者が何をすればよいかが示されていない (M-003) (scope: feature)

- **観察**:
  - no-fallback の行は「モデルが応答を拒否しました」だけです (`data-model.md:77`)。
  - SDK の `refused_user_message_uuid` は「編集して再試行」のための値ですが (`sdk.d.ts:5048`)、読まないフィールドに入っています (`data-model.md:11-12`)。範囲外 (`spec.md:198-202`) にも挙がっていません。
  - U-3 (`spec.md:54`) の「理由は Claude Code のログを見てください」には、どのログか・どこにあるか (WSL の中か) が書かれていません。300 コードポイントで切った後の続きを読む方法もありません。
  - scope が `session` の fallback ではセッションのモデルが替わります (`sdk.d.ts:5020`, `:5028`)。それでも O-7 の「概要」は `config.modelId` を出し続けます (`specs/013-ui-app-shell/data-model.md:105`)。この点の Edge case もありません。
- **リスク/影響**: 理由は分かっても、次の操作 (言い直す・ログを探す・今のモデルを確かめる) が分かりません。US-1 の Why が防ぎたい「再送の繰り返し」が残ります。
- **推奨アクション**:
  - no-fallback の行に次の操作の文言を足すか、「編集して再試行」を範囲外 (O-11 など) と明記してください。
  - ログの場所を具体的に書くか、文言を「この内容は表示できないため省きました」に変えてください。
  - 切り詰めの印を出してください。
  - fallback のあと「概要」と目盛りのモデルが替わらないことを Edge case に書き、O-4 / O-7 に申し送ってください。
- **根拠**: PO-6 (エラーからの出口)

### [Medium] 圧縮の行と境界を「並べて描く」判断に理由と AC が無い (M-004) (scope: feature)

- **観察**:
  - FR-017 (`spec.md:168`) は「両方を並べて描く」としています。
  - O-4 は、統合するか並べるかの判断を O-6 に任せていました (`specs/014-ui-metering-and-limits/data-model.md:118`)。
  - research (R-01〜R-05)、U の表、[ASSUMED]、AD-049 のどこにも、この判断の理由がありません。
- **リスク/影響**: 1 回の `/compact` で「圧縮しました」(O-4 の行) と「ここでコンテキストを圧縮しました (…)」(境界) が並びます。順序も決まっておらず、V-3 で判断できません。
- **推奨アクション**: research に理由を書き、[ASSUMED] か U に入れてください。AC1 に、2 つの順序と見え方を足してください。代わりの案として、成功した O-4 の行を境界に置き換える統合も比べてください。
- **根拠**: PO-6

### [Medium] 取り消しで行を消すことが、仮想化・スクロールの位置・隠れた古いメッセージの件数に与える影響が定義されていない (M-005) (scope: feature)

- **観察**:
  - AD-049 の Context (`0049:19`) にあるとおり、稼働中のストアにはメッセージを外す経路がありませんでした。今回が初めての「削除」です。
  - charter の業務ルールは「スクロールアンカリングを壊さない」です (`docs/domains/ui/charter.md:136`)。
  - 隠れた古いメッセージの件数 (`SessionScreen.tsx:338-348`) や、過去ログで取り消した内容が再び見えること (`0049:36`) が、Edge cases (`spec.md:126-135`) にも FE-010 (`tasks.md:22`) にもありません。
- **リスク/影響**: 画面より上の行が消えると表示位置が飛びます (KPI のスクロールの安定)。隠れた件数がずれます。開き直すと、拒否された内容が印なしで出ます。
- **推奨アクション**: Edge cases に「表示位置を保つ」「隠れた件数を直す」「過去ログでは取り消した内容が見える」を書き、FE-010 にテストを足してください。
- **根拠**: ui charter の業務ルールと KPI、PO-4

### [Medium] 読み上げのきっかけと、重ねない相手が曖昧 (M-006) (scope: feature)

- **観察**:
  - AC3 (`spec.md:119`) は「起きる」、plan (`plan.md:79`) は「メッセージの変化を見て」です。セッションの切り替え、過去ログを開いたとき、「さらに表示」(`SessionScreen.tsx:338-348`) で、すでにあるエラーを読むかどうかが決まっていません。
  - 1 秒の間に種類の違う出来事が重なったときの文言がありません (`data-model.md:64-66` が決めているのは tool のエラーだけ)。
  - `data-model.md:68` は「承認待ちと失敗は既存の SessionAttentionAnnouncer が読む」としています。しかし SessionAttentionAnnouncer が読むのは、見ていないセッションだけです (`SessionAttentionAnnouncer.tsx:13`, `:28`)。表示中のセッションの失敗は `SessionScreen.tsx:462` / `:518` の `role="alert"` が、承認は `ApprovalCard.tsx:25` の `alertdialog` が伝えています。
  - セッションが失敗すると、終わっていない Hook / task の行が一斉に「結果不明」になります。これが `alert` と同時に読まれます。
- **リスク/影響**: 切り替えのたびに大量に読み上げられ、`alert` とも重なります。FE-032 の「重ならない」テストは、相手の component を取り違えています。
- **推奨アクション**:
  - AC3 を「新しく届いた出来事だけ (切り替え・過去ログ・さらに表示では読まない)」にしてください。
  - 種類が混ざったときの文言を決めてください。
  - 重ねない相手を SessionScreen の `alert` と ApprovalCard に直し、セッションの終わりで一斉に結果不明になった行は読まないようにしてください。
- **根拠**: PO-3 / PO-4

### [Medium] 新しい表示の中身を既定で開くか閉じるかが無く、スクロールの安定 (KPI) を測る SC も無い (M-007) (scope: feature)

- **観察**:
  - data-model §2 (`data-model.md:31-40`) に、中身を既定で開くか閉じるかが書かれていません。
  - 今の ToolFallback は既定で閉じています (`tool-fallback.aui.tsx:48` の `defaultOpen = false`)。Tool group は comfortable では既定で開きます (`docs/glossary.md:850-851`)。
  - US-2 の Why は、これらの tool が「呼び出しの大半」だとしています。そこに、Read の行番号つきのコードと、最大 200 件の File tree を描きます。
  - charter の KPI (`charter.md:146-149`) に当たる SC がありません。
- **リスク/影響**: 長い transcript で DOM の量とハイライトの負荷が増えても、検出できません。
- **推奨アクション**: §2 に中身の既定 (閉じる) を書き、SC-002 か、既存の DOM ノード数のテストに fixture を足してください。
- **根拠**: ui charter の KPI、PO-7

### [Medium] (H) O-2 の pr-gate で持ち主が O-6 になった Medium / Low が、申し送りに無い (M-008) (scope: feature)

- **観察**:
  - `specs/011-ui-coverage/pr-gate.md:36-40` では、次の項目の持ち主が O-6 です: arch L-201、a11y L-001 / L-202 / L-201、po H-001 (TodoList のエラーのテスト)、ux L-101〜L-104。
  - `plan.md:64-74` の行 1 が受けているのは「R2 の 4 項目」だけで、tasks にも対応する作業がありません。
- **リスク/影響**:
  - 延期した項目の持ち主がいなくなります (AD-044 Consequences)。
  - O-6 は TodoList と SystemEventRow を使い回すのに、それらのテストの穴 (TodoWrite の `isError`、SystemEventRow の title、matcher) が残り、回帰を検出できません。
- **推奨アクション**: 申し送りの表に、項目ごとに「受ける (FE-011 / FE-022 にテスト)」「送る (O-11: ux L-102 と arch L-201、O-3: 文言の i18n)」を 1 行ずつ足してください。
- **根拠**: AD-044 Consequences、AD-028 §5

### [Medium] (H) 結果待ち・結果不明の印を付ける「各専用表示」が列挙されていない (M-009) (scope: feature)

- **観察**:
  - FR-011 (`spec.md:159`) と FE-031 (`tasks.md:35`) は「各専用表示」と書くだけです。
  - 対象は、R-4 の 5 表示 (`charter.md:173-175`)、O-5 の McpToolCall と AskUserQuestion (`specs/015-ui-mcp-elicitation-commands/data-model.md:20`, `:31`)、新しい 3 つです。
  - SC-003 (`spec.md:185`) も対象を列挙していません。O-2 は対象を列挙して確かめていました (`specs/011-ui-coverage/po-reviewer.pr-gate.round3.md:34`)。
- **リスク/影響**: 一部の表示に印が無いままでも、SC-003 が通ります。
- **推奨アクション**: §3 に対象の表示を列挙し、SC-003 を「列挙した N 個の表示すべて」にしてください。
- **根拠**: PO-2 / PO-3

### [Low] US-3 の Why が開発側の都合になっている (L-001) (scope: feature)

- **観察**: `spec.md:111` の「O-2 の pr-gate から回した宿題」は、開発のプロセスの話です。
- **推奨アクション**: 「スクリーンリーダーの利用者が、画面を巡回しなくてもエラーと止まったことを知る」「待つか動くかを判断できる」のような利用者の得を書き、WCAG 4.1.3 と結び付けてください。

### [Low] V-3 の「うるさすぎないこと」が主観的 (L-002) (scope: feature)

- **観察**: `quickstart.md:22`
- **推奨アクション**: 「並列の 10 件のエラーで、読み上げが 1 秒に 1 文」のように、判定できる基準にしてください。

### [Low] 「会話の境界」と、既存の「セッションの境界」が同じものを指すおそれ (L-003) (scope: feature)

- **観察**: `docs/glossary.md:844` と `docs/ui-coverage.md:78` は、`conversation_reset` を「セッションの境界」と呼んでいます。SH-001 (`tasks.md:15`) は「会話の境界」を新しく足します。
- **推奨アクション**: glossary で 2 つの関係を定義するか、どちらかの言い方にそろえてください (Principle XIV。正式な判断は architecture-reviewer に委ねます)。

### [Low] SC の「通さない値」の目印が、正本の一部しか含んでいない (L-004) (scope: feature)

- **観察**:
  - SC-002 (`spec.md:184`) が見るのはクエリと資格情報だけですが、data-model (`data-model.md:36`) は hash も落とします。
  - SC-001 (`spec.md:183`) は 2 つのフィールドを挙げていますが、BE-010 (`tasks.md:21`) は 4 つ、data-model (`data-model.md:11-12`) はさらに多くを挙げています。
- **推奨アクション**: SC では列挙をやめ、「data-model §1 / §2 の読まないフィールドの全部」と参照する形にしてください。

### [Low] (H) 取り消しを観測する手段が無い (L-005) (scope: feature)

- **観察**: data-model §1 (`data-model.md:17`) は、知らない id を黙って無視します。外した件数や一致しなかった件数を、ログや計数で観測する手段がありません。
- **推奨アクション**: 開発用のログに、取り消しの指示の件数と実際に外した件数を残してください。「メッセージが消えた」という問い合わせに答えられるようになります。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `中断\|interrupted\|応答待ち` (specs/016) | 1 (扱いは 0) | spec.md:73 |
| H-002 | `supersedes` (specs/016、src) | 0 / 0 | — |
| H-003 | `エラー\|0 件\|空\|truncated\|打ち切` (specs/016) | 14 (US-2 の負のケースは 0) | data-model.md:51 (「既存」の注記だけ) |
| H-004 | `TodoList\|taskId\|subject` (specs/016) | 8 | spec.md:22, :64, :102, :153; data-model.md:38, :39; research.md:23; quickstart.md:20 |
| H-005 | `M-201` (016 の plan・data-model、roadmap、ui-coverage) | 0 | 残りは specs/011-ui-coverage/pr-gate.md:34 だけ。Tier A の備考の O-6 は ui-coverage.md:53, :60, :104, :114, :117 |
| M-006 | `SessionAttentionAnnouncer` (src/renderer) | 3 ファイル | SessionAttentionAnnouncer.tsx:13, :28 (見ていないセッションだけを読む) |
| M-008 | `持ち主 O-6` の残り (011 pr-gate) | 7 項目 | specs/011-ui-coverage/pr-gate.md:36-40 |

**Critical が 0 件である根拠**:
- `specs/016-*` に `contracts/` はありません (Glob の結果: 6 ファイルで contracts 無し)。FR と契約が矛盾するという Critical の条件は成立しません。
- plan と、accepted の ADR (AD-044 / AD-035) の Decision Outcome とのずれは、E の範囲の外 (architecture-reviewer) です。
- 範囲外の定義が漏れてユーザストーリーが破綻するか、という観点で H-001〜H-005 を見ました。どれもストーリーの価値を大きく損ないますが、文面の上でストーリーが成立しなくなるもの (たとえば必須の経路が範囲外に落ちる) ではないので、High にとどめています。

## Verdict

- Critical: 0
- High: 5
- Medium: 9
- Low: 5
