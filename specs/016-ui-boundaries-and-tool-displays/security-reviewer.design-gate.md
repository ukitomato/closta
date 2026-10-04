# security-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: security-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-003 / FR-004 / FR-005: 拒否の行・`informational` の本文 (U-3)・`retraction` の運搬 (B / A)
  - FR-006: `Read` / `Glob` / `Grep` のパスと File tree (B)
  - FR-007: `WebFetch` の URL の資格情報 (A)
  - FR-009: Agent plan の markdown 化 (U-4。B / XSS)
  - FR-010: tool の振り分けの表 (B / prototype)
  - FR-012: 読み上げ (`aria-live`) に入る文字列 (B)
  - SC-001 (通さないフィールドの目印 0)、SC-002 (`WebFetch` の見出し・`<script>` / `javascript:`)、SC-005 (IPC・preload・main・SDK 呼び出しの差分 0)
- touched files に該当する charter / Confirmation:
  - ui charter:52-58 (CSP 基線。緩和には ADR が要る)
  - AD-035 Decision 6 (accepted。Agent plan を plain text で描く理由として「MarkdownText は任意の文字列を安全に受けられない」)
  - AD-049 (proposed) Decision 2-4
  - glossary.md:371 (Hook の出力本文は出さない)、glossary.md:569 (会話由来の文字列は live region に入れない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:1 Low:2
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:2 Medium:4 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-035 D6 との関係は H-002 でセキュリティの面だけを扱う)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux / a11y の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

本 spec は renderer と agents の表示の変更で、次のどれも増やさない (SC-005、quickstart V-1): IPC、preload、main、spawn、Agent SDK の呼び出し。BrowserWindow の hardening (`C:\dev\closta\src\main\app\window.ts:53-55`)、`openExternal` の http(s) 限定 (`window.ts:31-39`)、本番の CSP (`C:\dev\closta\src\main\app\protocol.ts:39-62`。`unsafe-inline` / `unsafe-eval` なし、`img-src 'self' data:`、`connect-src 'none'`) は変わらない。

攻撃面は次の 4 つの経路にある。
- 新たに出す会話由来の文字列: `informational.content`、`WebFetch` の URL、tool の結果のパスの一覧
- 新しい markdown の描画口 (Agent plan)
- 未信頼の列挙値をキーにした表の引き方
- 支援技術への読み上げ

担当外の観察 (採点外):
- AD-049 は「AD-035 の本文は変えない」と書くが、plain text は AD-035 の Decision 6 そのもの (architecture)
- `informational` の 300 コードポイントは O-2 の `detail` の上限 120 (`system-event.ts:25`) と合わない (architecture)
- `mayCarrySecret` は文章の `'` や `(` で true になり、正当な理由の大半を隠す (po / ux)

## Findings

### [High] `informational.content` を出す判断 (U-3) は、O-2 が出さないと決めた Hook の出力を別の経路から出す。唯一の防御の `mayCarrySecret` は、URL の資格情報や `Bearer` を通すことがリポジトリ内に記録されている (H-001) (scope: feature)

- **観察**:
  - `spec.md:54` (U-3)、`data-model.md:15`、`docs\decisions\0049-boundaries-retraction-and-o11-split.md:29` は、O-2 の「Hook の出力本文を出さない」を `hook_response` の `output` / `stdout` / `stderr` だけの話として、`content` を出すとしている
  - SDK の定義 (`node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts:4852-4853`) は、`informational` を「hook feedback (e.g. a UserPromptSubmit hook's block reason), slash-command output」としている。Hook の出力が別の型で届くということで、glossary.md:371 と 011 spec.md:142-143,190 が出さないと決めた内容と同じ
  - 隠すかどうかの判定は `mayCarrySecret` だけ (`C:\dev\closta\src\domain\session\system-event.ts:47-51`)。コマンドの形を見る判定で、次の 2 か所が「URL の資格情報・`Bearer`・`-p<pw>` を通す」と明記している:
    - `system-event.ts:132-133`
    - `specs\011-ui-coverage\data-model.md:88`
  - `AKIA…`・JWT (`eyJ…`)・`token: …`・`github_pat_` も通る
  - 秘密が実際に流れうる: セッションの子プロセスは秘密の env を継承する (`docs\decisions\0041-x4-launch-config-on-x1-launch-gate.md:109`)
  - `plan.md:28` は、この判定を根拠に Principle V を ✅ としている
  - `spec.md:83` は、この文字列を「Claude Code からの知らせ」の権威ある枠で出す。PreToolUse の Hook がモデルの生成した入力をそのまま返すと、モデルの影響を受けた文が Claude Code の知らせに見える (CWE-451)
- **同種事象探索**: `mayCarrySecret` を src で検索 → 本番の利用は 1 件 (`system-event.ts:64`。Hook の名前の allowlist の後段)。文章を対象にした利用は 0 件で、本 feature が最初になる
- **リスク/影響**: Hook の stderr や slash command の出力にあるトークン・URL の資格情報が transcript に常時表示される。画面共有や肩越しで漏れる
- **推奨アクション**:
  1. data-model §1 の `content` の規則を、文章向けの秘密の伏せ字に替える。行全体は隠さず、該当するトークンだけを `•••` にする。少なくとも次を伏せる:
     - `://[^/\s@]+@` (URL の userinfo)
     - `Bearer\s+\S+`、`Authorization:\s*\S+`
     - `(?i)(token|secret|password|passwd|api[_-]?key)\s*[:=]\s*\S+`
     - `eyJ[\w-]+\.[\w-]+`、`AKIA[0-9A-Z]{16}`
     - `sk-`・`ghp_`・`gho_`・`github_pat_`・`glpat-`・`xox[abprs]-`・`AIza`
     - `-p\S+`
  2. 本文は畳んだ状態を既定にし、「理由を表示」の操作の後に出す
  3. 行の見出しを「Hook・コマンドからの文言」にし、Claude Code 自身の知らせと見分けられるようにする
  4. AD-049 の Decision 3 と Context の「O-2 の決定とは別の話」という説明を、SDK の定義に合わせて直す
  5. `plan.md:28` の V の根拠を書き直す
  6. BE-010 のテストに `Bearer`・URL の資格情報・`AKIA`・JWT の fixture を足し、出力に 0 件であることを確かめる
- **根拠**: glossary.md:371、011 spec.md:142-143、AD-041:109、CWE-200、CWE-451、Principle V
- **scope 根拠**: spec / data-model / AD-049 (proposed) の文面で直せる

### [High] FR-009 は Agent plan を `MarkdownText` で描けと書くが、accepted の AD-035 D6 と今のコードは「`MarkdownText` は任意の文字列を安全に受けられない」と記録している。安全に通す方法が書かれておらず、R-3 の XSS の境界を通らない描画口ができうる (H-002) (scope: feature)

- **観察**:
  - spec 側は `spec.md:154` (FR-009)、`plan.md:80`、AD-049:30
  - accepted ADR とコードの記述:
    - `docs\decisions\0035-tier-a-tool-display-and-subagent-nesting.md:85-87`: 「text-part context 依存で任意文字列を安全に受けられない…rich markdown 化は plan を text part 化する将来課題」
    - `C:\dev\closta\src\renderer\src\components\assistant-ui\elements\agent-plan.aui.tsx:16-17` にも同じ記述がある
  - `C:\dev\closta\src\renderer\src\components\markdown-text.tsx:41-59` は本文を引数に取らず、part の context から読む。SC-005 は `TRANSCRIPT_PART_FIELDS` の変更を禁じる
  - data-model・tasks のどちらも、`TextMessagePartProvider` (`@assistant-ui/react` が export する) で包むなどの方法を指定していない
  - 実装者が別の markdown の描画口を作ると、`safeUrlTransform` と「rehype-raw を足さない」の設定を通らない経路ができうる
  - FE-023 のテスト (`tasks.md:30`) は `<script>` / `javascript:` だけで、次を含まない:
    - リモート画像 `![](https://…)`
    - `data:image/svg+xml`
    - `<img onerror>`
    - `file:` / `vbscript:`
- **同種事象探索**:
  - `react-markdown|ReactMarkdown` を src で検索 → import は 1 件 (`markdown-text.tsx:10`)
  - `rehype-raw|allowDangerousHtml` → 0 件 (コメントだけ)
  - 今は描画口が 1 つで、本 feature が 2 つ目を作る可能性がある
- **リスク/影響**: 計画の本文は会話由来の未信頼の markdown。prompt injection で `<img onerror>` やリモート画像を差し込まれると、R-3 の境界の外で描かれうる。CSP が最後の防御になる
- **推奨アクション**:
  1. data-model に方式を明記する: plan の文字列を `TextMessagePartProvider` で包み、既存の `MarkdownText` をそのまま使う。新しい markdown の描画口を作らない
  2. `@assistant-ui/react-markdown` の import を `markdown-text.tsx` だけに限る (`no-restricted-imports` か固定テスト)
  3. FE-023 に `ChatScreen.test.tsx:210-235` と同じ XSS の fixture 一式を足し、上記のリモート画像と svg の data: も加える
- **根拠**: AD-035 Decision 6、R-3 FR-020 / contracts C-7、CWE-79
- **scope 根拠**: data-model と tasks の追記で直せる。ADR drift の判定は architecture-reviewer に委ねる

### [High] File tree の作り方 (パス → 木) が決まっていない。結果のパスはリポジトリのファイル名なので、`__proto__` という名前のディレクトリで renderer 全体の prototype を汚しうる (H-003) (scope: feature)

- **観察**:
  - `data-model.md:34-35` と `tasks.md:27` (FE-020) は「File tree (200 件まで)」とだけ書いている
  - 既存の element `C:\dev\closta\src\renderer\src\components\assistant-ui\elements\file-tree.tsx:9-16` は、`depth` 付きの平らな `FileTreeNode[]` を受ける。パスの一覧を節点に変える処理は新しいコードになる
  - Glob / Grep の結果は、利用者が開いたリポジトリのディレクトリ名そのもの。clone した未信頼のリポジトリが `__proto__/` や `constructor/` を含んでもよい
  - 区切りごとに普通のオブジェクトで木を組む (`node.children[seg] ??= …`) と、`Object.prototype` に書き込む
  - renderer には ErrorBoundary が無い。再読み込みでも同じ transcript を描くので、壊れた状態が続く
  - O-4 の「id をキーにする保持は `Map` に限る」(`specs\014-ui-metering-and-limits\data-model.md:75`) は `meter` の節の規則で、本 feature の集計には及んでいない
- **同種事象探索**:
  - renderer でパスを区切って集計するコード (`split\(`) → 2 件 (`session-view.ts:254`、`WorkspaceFoldersScreen.tsx:574`)。どちらも末尾を取るだけで木は作らない
  - ErrorBoundary → 0 件
- **リスク/影響**: renderer の prototype が汚れ、UI 全体が描けなくなる。汚れの値は内部のオブジェクトなので任意コードの実行には至らないが、持続する DoS になる
- **推奨アクション**:
  1. data-model §2 に次を明記する:
     - パス → 木の変換は `Map` (または `Object.create(null)` + `Object.hasOwn`) で行う
     - 区切りは `/` と `\` の両方で、`..` などは表示の文字列のまま扱い、解決しない
     - 1 パスの長さの上限 (`MAX_PATH_VALUE_LENGTH`) と深さの上限を設ける
     - `key` が重ならないようにする (`file-tree.tsx:62` の `key={node.path}`)
  2. FE-020 のテストに `__proto__/x`・`constructor/prototype/y`・`toString` を足し、`({}).children === undefined` を確かめる
- **根拠**: CWE-1321、O-4 data-model:75、O-5 の security-reviewer の design-gate の M-003 (同じ型の指摘)

### [Medium] `WebFetch` の見出しの「ドメインとパス」は、パスにある秘密を出す。読めない URL は生の文字列を中身に出す。O-5 の URI の要約の規則より緩い (M-001) (scope: feature)

- **観察**:
  - `data-model.md:36` は、見出しにパスを全部出す
  - 読めない URL の扱いが spec と data-model で食い違う。`spec.md:132` は「中身に無害化した文字列」を出すとし、data-model.md:36 は見出しに「URL」とだけ書く
  - scheme の制限が無い
  - 先行の O-5 (`specs\015-ui-mcp-elicitation-commands\data-model.md:22`) は「`protocol` と `host` と最後のパスの要素だけ、読めない・256 文字超は出さない」としている
  - 秘密をパスに持つ URL は一般的にある: Slack の webhook `/services/T…/B…/<secret>`、Discord `/api/webhooks/<id>/<token>`、Telegram `/bot<token>/…`
  - scheme の無い `user:pass@host/p` は WHATWG URL で読めず、生の文字列のまま中身に出る
  - `javascript:` / `data:` は読めてしまい、本体がパスとして出る
- **同種事象探索**: spec 一式で `ドメインとパス|URL` → 9 件。規則の正本は data-model.md:36、文面のずれは spec.md:132
- **推奨アクション**:
  1. 見出しは http(s) のときだけ、`host` と最後のパスの要素を出す (O-5 と同じ)
  2. パスの全体は、畳んだ中身に H-001 の伏せ字を通して出す
  3. 読めない URL・http(s) 以外・256 コードポイント超は出さない
  4. 見出しはリンクにしない
  5. FE-021 のテストに webhook の形・scheme の無い `user:pass@`・`javascript:` を足す
- **根拠**: CWE-200、CWE-598、O-5 data-model:22

### [Medium] 読み上げ (`TranscriptAnnouncer`) の文に会話由来の文字列が入る。既存の「live region に会話由来の文字列を入れない」の規則に反する (M-002) (scope: feature)

- **観察**:
  - `data-model.md:64-66` の文: 「{tool 名} がエラー」「{Hook / task} が {状態}」「§1 の行の文言」
  - 後の 2 つは、task の説明 (`system-event.ts:134`。会話由来) や `informational.content` (H-001) を含むかどうかが曖昧
  - 既存の規則は次の 2 か所にある:
    - `C:\dev\closta\docs\glossary.md:569`
    - `C:\dev\closta\src\renderer\src\features\session\SessionAttentionAnnouncer.tsx:15`
  - MCP の tool 名は第三者が決める
- **同種事象探索**: `aria-live` を renderer で検索 → 5 件。会話由来の文を入れるものは 0 件 (`SessionAttentionAnnouncer.tsx:41` は固定の文言とフォルダ名だけ)
- **推奨アクション**:
  1. data-model §4 に「読み上げは固定の文言と既知の列挙 (category・状態・件数) だけ」と明記する
  2. tool 名は既知の組み込みの名前か `^[A-Za-z0-9_-]{1,64}$` に合うときだけ出し、それ以外は「tool」と読む
  3. `content`・description・prompt は入れない
  4. FE-032 に、読み上げの文に `content` / description の目印が 0 件というテストを足す
- **根拠**: glossary:569、CWE-451

### [Medium] 新しい列挙の照合方法が決まっていない (`trigger`・`level`・`direction`・`scope`・`TaskUpdate.status`)。`direction` / `scope` は検証されずに `detail` の区切りの文字列に入り、renderer で読み戻すとフィールドがずれる (M-003) (scope: feature)

- **観察**:
  - `data-model.md:11` は `detail` を `<direction> <scope> <category> retracted=<n>` で組む。検証が決まっているのは category の `^[a-z_-]{1,32}$` だけ
  - `data-model.md:42` は「知らない値 → 不明」とするが、表の引き方を指定していない
  - 既存の危ない形 (O-5 で直す予定): `tool-registry.aui.tsx:36`、`system-event.ts:117`
  - 既存の安全な先例: `labels.ts:64`、`todo-list.aui.tsx:58-59`、`transcript-guard.ts:28-39`
- **同種事象探索**: `[A-Z_]{4,}\[[a-zA-Z.]+\]` を src で検索 → 53 件。会話由来の値を照合なしで引くものは 2 件 (上記 2 件。O-5 で修正予定)
- **推奨アクション**:
  1. agents で各値を `Object.hasOwn` の表で照合する。外れたら `unknown` にするか省く:
     - `direction` ∈ {retry, revert, sticky}
     - `scope` ∈ {session, local} (無ければ session。SDK の定義どおり)
     - `trigger` ∈ {manual, auto}
     - `level` の 4 値
  2. renderer の文言の表も `Object.hasOwn` で引く
  3. `detail` を区切って読み戻すなら、各トークンを allowlist 済みに限る
  4. テストに `constructor`・`__proto__`・`"retry local"` を足す
- **根拠**: CWE-1321、CWE-20、O-4 data-model:73-75

### [Medium] Agent plan を markdown にすると、生 HTML・HTML のコメント・リンクの参照定義が黙って消える。承認する計画の一部が transcript で見えなくなる (M-004) (scope: feature)

- **観察**:
  - 今の plain text では全文が見える (AD-035:85-87)
  - rehype-raw なしの `MarkdownText` では生 HTML は描かれない (`ChatScreen.test.tsx:227-229`)。その部分のテキストも画面から消える
  - リンクは表示の文字と行き先が違いうる
  - 承認カードは生の入力を出す (`C:\dev\closta\src\renderer\src\features\session\ApprovalCard.tsx:39-43`)。ただし高さ `max-h-48` の中に JSON のエスケープ済みの文字列なので、実際に計画を読むのは transcript になる
- **同種事象探索**: `ExitPlanMode` を test で検索 → 4 件。隠れたテキストを確かめるテストは 0 件
- **推奨アクション**: 次のどれかを data-model に明記する
  - 生 HTML の節点を、見えるテキスト (inlineCode) として描く
  - Agent plan に「原文を表示」の切り替えを付ける
  - リンクの行き先を表示する

  テスト: `<!-- hidden -->` の本文が見えること
- **根拠**: CWE-451

### [Medium] `retraction` が O-4 の間引きで捨てられうる。renderer が壊れた入力をどう扱うかも決まっていない (M-005) (scope: feature)

- **観察**:
  - `data-model.md:17` は取り消しを `meter` で送る
  - O-4 の規則 (`specs\014-ui-metering-and-limits\data-model.md:81`) は「`meter` と…の合計は 1 秒に 20 件まで (超えた分は捨てる。最新の値は次の境で送る)」
  - 取り消しは「最新の値」ではなく 1 回の出来事なので、捨てると拒否された応答が表示に残る。SDK は受け取ったら外すよう求めている (`sdk.d.ts:5044`)
  - renderer の decoder が、配列でないもの・129 件以上・形の合わない id を「全体を捨てる」か「id ごとに捨てる」かが書かれていない
- **同種事象探索**: spec 一式で `retraction` → 6 件。間引きの対象外と明記した箇所は 0 件
- **推奨アクション**:
  1. `retraction` を間引きと 1 秒の上限から外すと明記する
  2. decoder は id ごとに落とし、照合は `Set` で行う
  3. テスト: 1 秒に 21 件の `meter` の後でも取り消しが反映されること。壊れた入力でストアが変わらないこと
- **根拠**: SDK の契約 (`sdk.d.ts:5044`)、CWE-20

### [Medium] H: 上の指摘を検出するテストが tasks に無い。回帰と観測の点も足りない (M-006) (scope: feature)

- **観察**: BE-010 / FE-010 / FE-020 / FE-021 / FE-023 / FE-032 (`tasks.md:21-36`) に次が無い:
  - H-001: 秘密の fixture
  - H-002: リモート画像と svg
  - H-003: `__proto__` の経路
  - M-001: webhook の形の URL
  - M-002: 読み上げの文に会話由来の文字列が無いこと
  - M-003: `constructor`
  - M-004: 隠れたテキスト
  - M-005: 間引き
- **回帰**: `ChatScreen.test.tsx:452-458` (plan の `javascript:` はリンクにならない) は残す。markdown にすると `[x](https://…)` で `<a>` ができるので、「href は http(s) か相対だけ」を足す
- **観測**: 隠した `content` を agents の logger に書かないことをテストで固定する (Principle V の「ログへの混入の禁止」)
- **推奨アクション**: 上記を各タスクのテストの列に足す

### [Low] 行の id の素材の形が検証されていない (`info:<tool_use_id>`・`refusal:<uuid>`・`reset:<uuid>`・`compact-boundary:<uuid>`) (L-001) (scope: feature)

- **観察**: `data-model.md:9-13` は形を検証しない。O-4 の `toolUseId` は `^[A-Za-z0-9_-]{1,128}$` (014 data-model:70)
- **推奨アクション**: 同じ規則と UUID の形の検査を通す。外れたら `info:<uuid>` に寄せるか、行を作らない

### [Low] `Grep` / `Glob` の `pattern` を renderer で正規表現として組まない、と明記されていない (L-002) (scope: feature)

- **観察**: `data-model.md:34-35`。一致箇所の強調などで `new RegExp(pattern)` を使うと、ReDoS と、ErrorBoundary の無い renderer での SyntaxError が起きる。今の src の本番コードで `new RegExp(` は 0 件
- **推奨アクション**: data-model §2 に「パターンは文字列として出すだけ」と書く

### [Low] SH-002 の element の照合の条件が「本番の CSP の下で動く」だけ。外部への取得 (favicon など) を外す条件が無い (L-003) (scope: feature)

- **観察**: `tasks.md:16`。Web search 系の element は、ドメインの favicon を第三者のサービスから取ることがある。取得した先のドメインが外部に漏れ、`img-src` を緩める必要が出る (ui charter:52-58 は ADR を要求)
- **推奨アクション**: 「外部への取得を外す・CSP を緩めない」を SH-002 の条件に足す

### [Low] `Read` の結果と `Grep` の一致の本文を、既定で開くか畳むかが決まっていない (L-004) (scope: feature)

- **観察**:
  - `data-model.md:33,35`。`.env` などを読んだ結果は秘密を含む
  - 今の ToolFallback は既定で畳んでいる (`tool-fallback.aui.tsx:48`) うえ、Tool group の中にある
  - 新しい表示が既定で開くと、人目に触れる量が増える
- **推奨アクション**: 中身は既定で畳む、と data-model §2 に明記する

## Critical 0 件の根拠

設計の文面と既存のコードを照合し、「現時点で実害が成立する経路」は見つからなかった。High 以下はすべて、実装の前に塞ぐべき設計の欠落である。

- 生 HTML の描画: `dangerouslySetInnerHTML|innerHTML` → 本番の利用 0 件 (`ProviderScreen.tsx:27` のコメントと test だけ)。`rehype-raw|allowDangerousHtml` → 0 件。markdown の描画口は `markdown-text.tsx:10` の 1 件
- プロセスの境界: `window.ts:53-55` (sandbox / contextIsolation / nodeIntegration false)、`window.ts:31-39,65-81` (`openExternal` は http(s) だけ、遷移はすべて拒否)。SC-005 と quickstart V-1 で、IPC・preload・main・SDK の呼び出しの差分は 0
- CSP: `protocol.ts:39-62`。本番に `unsafe-inline` / `unsafe-eval` は無く、`img-src 'self' data:`、`connect-src 'none'`
- accepted ADR との矛盾 (セキュリティの領域): `出力本文|hook_response|informational` を docs/decisions で検索 → AD-049 (proposed) の 3 件だけ。Hook の出力を出さない決定は spec と glossary の水準で、accepted ADR ではない (このため H-001 は High)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `mayCarrySecret` (src) | 本番の利用 1 件 | C:\dev\closta\src\domain\session\system-event.ts:64 |
| H-002 | `react-markdown\|ReactMarkdown` / `rehype-raw\|allowDangerousHtml` (src) | 1 / 0 | C:\dev\closta\src\renderer\src\components\markdown-text.tsx:10 |
| H-003 | `split\(` (renderer) / `ErrorBoundary` | 2 (木は作らない) / 0 | C:\dev\closta\src\renderer\src\features\session\session-view.ts:254、C:\dev\closta\src\renderer\src\features\workspace-folders\WorkspaceFoldersScreen.tsx:574 |
| M-001 | `ドメインとパス\|URL` (spec 016) | 9 | C:\dev\closta\specs\016-ui-boundaries-and-tool-displays\data-model.md:36、spec.md:132 |
| M-002 | `aria-live` (renderer) | 5 (会話由来の文を入れるもの 0) | C:\dev\closta\src\renderer\src\features\session\SessionAttentionAnnouncer.tsx:41 |
| M-003 | `[A-Z_]{4,}\[[a-zA-Z.]+\]` (src。test を除く) | 53 (照合なしで会話由来の値を引くもの 2) | C:\dev\closta\src\renderer\src\components\assistant-ui\elements\tool-registry.aui.tsx:36、C:\dev\closta\src\domain\session\system-event.ts:117 |
| M-004 | `ExitPlanMode` (renderer test) | 4 (隠れたテキストの検査 0) | C:\dev\closta\src\renderer\src\features\chat\ChatScreen.test.tsx:358,452 |
| M-005 | `retraction` (spec 016) | 6 (間引きの対象外の明記 0) | C:\dev\closta\specs\016-ui-boundaries-and-tool-displays\data-model.md:17 |

## Verdict

- Critical: 0
- High: 3
- Medium: 6
- Low: 4
