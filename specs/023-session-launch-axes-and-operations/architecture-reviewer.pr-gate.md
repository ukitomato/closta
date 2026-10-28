# architecture-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28T00:00:00+09:00
**Reviewer**: architecture-reviewer (default mode + ADR-drift mode)
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Scope**: default + adr-drift (ARCH-3 を集中して見た)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (権限モード) / FR-005〜FR-007 (モデル) / FR-008 (思考量) / FR-009〜FR-012 (名前) / FR-013〜FR-018 (置き場・残し方・記録)、SC-001〜SC-008 (マージの条件)。SC-009 は実機で、未実施
- touched files に当たる charter / Confirmation:
  - session charter (In scope :67-73、業務ルール :180-191、Related ADRs/Specs、X-6 の項 :352-354)
  - ui charter :110 (他 domain の操作 UI は各 domain が持つ)
  - AD-062 Confirmation (項目 14 / 16 の fixture、SC-001/003/004 の単体テスト、quickstart V-1〜V-5)
  - AD-063 Confirmation (allowlists のコメント、check.mjs が違反 0)
  - AD-034 §3 defense-in-depth (捕まらない経路を UNDETECTED_NOTES に記録する)
  - AD-036 §4 P3 / §5 (AD-062 が読み替え。AD-041 (a) が既に SC-006(a) の dontAsk を上書きしている)
  - AD-043 (control-result の中継)
  - AD-031 (訂正節と後続 ADR の境目)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:2 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (module の置き場は charter の境界として C で扱った)
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

本 PR は動いているセッションに 3 つの操作を足す。権限モードは安全 3 値の中だけで切り替える。モデルはその Provider のカタログのうち、起動の effort が効くものに切り替える。名前は `renameSession` を、env を固定した短命の `utilityProcess` から呼んで付ける。

ADR は 2 本。AD-062 は AD-036 §4 P3 / §5・AD-034 決定 3・AD-041 (h) を読み替え、`QUERY_MUTATION_METHODS` を 22 → 20、`AGENT_SDK_ALLOWED_CALLS` を 5 → 6 にする。AD-063 は `rename-spawner.test.ts` を `PROCESS_SPAWN_MODULES` に足す。どちらも新しい ADR で、先行 ADR の本文は書き換えていない (AD-031 に合っている)。

確かめた点:
- レイヤ: domain は純関数、main/app の service は I/O を注入で受ける、agents は Electron に依存しない
- 調停役スレッドは `control-result` を窓で束ねず中継する (AD-043 の構成のまま)
- Constitution Principle IV は `renameSession()` を既に挙げている

ADR drift で残ったのは 3 点。
- **項目 14 の閉じ方**: re-export の経路を塞いでも記録してもいない
- **AD-063 の事実誤認**: 検証の範囲を実際より広く書いている
- **charter / 対応表の追随**: 一部が追随していない

## Findings

### [High] 項目 14 が SDK の re-export (`export { tagSession } from '@anthropic-ai/claude-agent-sdk'` / `export * from`) を素通しする。UNDETECTED_NOTES の項目を消したので、この経路はどこにも記録が無い (H-001) (scope: feature)

- **観察**:
  - `scripts/constitution/check.mjs:689-692`: 名前付き import の収集は `import\s*\{…\}\s*from` だけを見る
  - `check.mjs:708-715`: 動的 import は `(?:import|require)\s*\(` だけを見る
  - `check.mjs:680-686`: 名前空間 import は `import\s+\*\s+as` だけを見る
  - したがって `src/agents/` のファイルに `export { tagSession } from '@anthropic-ai/claude-agent-sdk'` (または `export * from …`) と書くと、binding が 0 件のまま違反なしで通る
  - それを `./x` から import するファイルは SDK のパッケージ名を含まない。`check.mjs:668` の `if (!src.code.includes(AGENT_SDK_PACKAGE)) continue` で検査から外れる
  - 本 PR は `tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES['sdk-forbidden-call-alias']` を削除した (.pr-gate.diff:8835-8858)。この項目は書き込み系 API の迂回 (別名・動的 import) を「捕まらない経路」として記録していた
- **同種事象探索**: `export\s*(\*|\{[^}]*\})\s*from\s*['"]@anthropic-ai/claude-agent-sdk` を src/ で検索して 0 件。いま実害は無いので High にした。`expected.mjs` で `再エクスポート|re-export|export \{|export \*` を検索して 0 件 (未記録)
- **リスク/影響**: AD-062 Decision 5 は「書き込みを起こす IPC が無い」という第一の担保 (AD-034 決定 3) が改名の IPC で崩れたので、別名を項目 14 で塞ぐと決めた。re-export はその別名と同じ形の迂回である。塞いでも記録してもいないので、AD-034 §3 の規範 (捕まらない経路を `UNDETECTED_NOTES` に `nextFeature` つきで明記する) に反する。`tagSession` / `deleteSession` / `forkSession` への到達を機械検証が見逃す
- **推奨アクション** (どちらか):
  - (a) 項目 14 に `export\s*(?:\*|\{[^}]*\})\s*from\s*['"]<pkg>` の検出を足し、違反にする (許可の名前の re-export も違反にするのが最小)。`tests/rule-fixtures/b-equivalent/sdk-reexport.ts.fixture` を足して `constitution` で発火させる
  - (b) 塞がないなら、`UNDETECTED_NOTES` に `sdk-reexport` の項目を足す (why / mitigatedBy / nextFeature)
- **根拠**: AD-034 §3 defense-in-depth、AD-062 Decision 5、AD-027 / SC-017 (捕まらない経路は列挙する)
- **scope 根拠**: 本 PR の touched files (`check.mjs` / `expected.mjs`) で直せる

### [Medium] AD-063 Decision 1 と allowlists のコメントが「項目 5 / 15 は引き続きこのテストファイルに掛かる」と書くが、事実でない (M-001) (scope: feature)

- **観察**:
  - `docs/decisions/0063-rename-spawner-test-in-process-spawn-modules.md:24` は「項目 1 / 3 / 4 / 5 / 15 は引き続きこのファイルに掛かる」と書く。`scripts/constitution/allowlists.mjs:264` は「項目 3 / 15 は `wsl.exe` を綴らないことで引き続き掛かる」と書く
  - 項目 15 は `check.mjs:783` の `if (src.file.endsWith('.test.ts') || …) continue` でテストファイルを除外している
  - しかも `WSL_FREE_DIRECTORIES` には `rename-spawner.ts` しか載っていない (`allowlists.mjs:582-590`)
  - 項目 5 は `DOCKER_CALLER_MODULES` (空) だけを走査する (`check.mjs:255-268`)
  - このファイルに実際に掛かるのは項目 1 / 3 / 4 だけである
- **同種事象探索**: `PROCESS_SPAWN_MODULES` の中のテストファイルは `allowlists.mjs:266` の 1 件だけ (AD-063 の Consequences と一致)。同じ過大な記述は AD-063:24 と allowlists.mjs:264 の 2 か所
- **リスク/影響**: 許可を広げる判断の根拠 (「他の項目が引き続き捕まえる」) が、実在しない検査を数えている。AD-031 の基準では、事実誤認として訂正すべきもの
- **推奨アクション**:
  - AD-063:24 を「項目 1 / 3 / 4 は掛かる (項目 15 はテストファイルを走査しない。項目 5 は docker の許可モジュールだけを見る)」に直す。ADR は本 PR で起こしたものなのでマージ前に直してよい。accepted として扱うなら、日付つきの訂正節にする
  - allowlists.mjs:264 も同じく直す
- **根拠**: AD-031 Decision 1、Principle VI の allowlist の手続き
- **scope 根拠**: 本 PR で起こした ADR とコメント

### [Medium] 対応表 E 節の書き換えた 3 行の「経路」の列が `なし` のまま。FR-015 は「経路は実行中」とする (M-002) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:219`, `:220`, `:222` は割当を `実装済み: … (実行中)` にしたが、経路の列は `なし` のまま
  - 同じ節の `interrupt` / `can_use_tool` (`:216-217`) は、割当も経路の列も `実行中`
  - `scripts/ui-coverage/coverage.mjs:22-24` は割当の書式に `(<経路>)` を持ち、経路の列とは別に置く。両者の一致は検査していない (`:767` は値の綴りだけを見る)
- **同種事象探索**: `\| 実装済み[^|]*\| なし \|` で 4 件。本 PR の 3 行 (`:219` / `:220` / `:222`) と既存の `:251` (elicitation。O-10)
- **リスク/影響**: Principle XII の SSoT が同じ行の中で食い違う。項目 21 は通るので、機械検証では気づけない
- **推奨アクション**: 3 行の経路の列を `実行中` にする (`rename_session` は過去の一覧にも出るので `両方` も考えられる。spec に合わせる)。`:251` は system scope に回す
- **根拠**: FR-015、Principle XII、AD-044
- **scope 根拠**: 本 PR の touched file

### [Medium] 実行中の設定の操作の部品 `LiveSettingsControls.tsx` が ui の `features/shell` にある。ui charter の「他 domain の操作 UI は各 domain が持つ」と、session charter の In scope が追随していない (M-003) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/LiveSettingsControls.tsx:1-49` は権限モードとモデルの選択、名前の編集 (session の操作 UI) を持つ
  - `docs/domains/ui/charter.md:110`: 「他 domain の操作 UI (一覧・登録・選択画面) → 各 domain が持つ」
  - 先例では、起動の選択の部品は `src/renderer/src/features/session/LaunchDialog.tsx` に置き、シェルには `features/shell/LaunchDialogHost.tsx` (枠) だけを置いている
  - plan.md:100 は「部品は ui のシェルの中に置くが、操作は session が持つ」と書くが、部品そのものはシェルにある
  - あわせて `docs/domains/session/charter.md:67-73` の In scope は、「実行中のセッションの権限モード・モデル・名前の変更 (transcript の custom-title の追記)」を足していない。本 PR は session が初めて transcript に書く経路を作るが、charter の業務ルール (:180-191) にも「実行中の変更は永続化しない・名前の正本は transcript」が無い
- **同種事象探索**: `features/shell/*.tsx` の中で session の操作の部品は本件 1 件 (LaunchDialog は features/session)
- **リスク/影響**: Principle XII の持ち主の分け方 (ui charter :112-113) が曖昧になる。session charter を読んでも、session が transcript に書くことが分からない
- **推奨アクション**:
  - `LiveSettingsControls.tsx` (とそのテスト) を `src/renderer/src/features/session/` に移し、`CenterHeader.tsx` からは置き場所として使う。移さないなら、ui charter にその例外を書く
  - session charter の In scope に「実行中のセッションの設定の変更 (権限モード・モデル・名前。AD-062)」を、業務ルールに「実行中の変更は永続化しない・名前の正本は transcript の custom-title」を 1 行ずつ足す
- **根拠**: ui charter :110、session charter Scope / 業務ルール、Principle XIV
- **scope 根拠**: 本 PR の touched files (CenterHeader / charter)

### [Medium] AD-062 Decision 5 の「動的 import / require を違反にする」を発火させる rule fixture が無い (M-004) (scope: feature)

- **観察**:
  - `check.mjs:708-715` に動的 import の検出を足した
  - `tests/` で `(import|require)\s*\(\s*['"]@anthropic-ai/claude-agent-sdk` を検索すると 0 件
  - AD-062 Confirmation が挙げる fixture は、別名と `rename-session.ts` の外での呼び出しだけ
  - 削除した UNDETECTED_NOTES は、`(await import(...)).renameSession()` を捕まらない経路として名指していた
- **同種事象探索**: 上のクエリで tests/ に 0 件
- **リスク/影響**: 検出を退行させても、どのテストも落ちない。UNDETECTED_NOTES から外した根拠 (「塞いだ」) を機械で確かめていない
- **推奨アクション**: `tests/rule-fixtures/b-equivalent/sdk-dynamic-import.ts.fixture` (`await import('@anthropic-ai/claude-agent-sdk')` で `tagSession` を呼ぶ) を足し、`expected.mjs` に `detectors: ['constitution'], rules: ['#14']` で登録する
- **根拠**: AD-062 Decision 5 / Confirmation、SC-002
- **scope 根拠**: 本 PR の touched files

### [Low] glossary の SessionControl が「8 種類」と書くが、列挙は 7 つ (`respond-elicitation` が抜けている) (L-001) (scope: feature)

- **観察**: `docs/glossary.md:1016` の列挙は `send-prompt` / `respond-permission` / `interrupt` / `end` / `kill` / `set-permission-mode` / `set-model` で、型の `src/domain/session/agent-session.ts:315-322` は 8 種類 (`respond-elicitation` を含む)。Ref に AD-062 が無い
- **推奨アクション**: `respond-elicitation` を足し、Ref に AD-062 を足す
- **根拠**: Principle XIV

### [Low] `LIVE_SETTING_FAILURES` のコメントが「集合を変えるには ADR が要る (AD-062)」と書くが、AD-062 にその決定は無い (L-002) (scope: feature)

- **観察**: `src/domain/session/live-settings.ts:51`。AD-062 の本文に `LIVE_SETTING_FAILURES` も理由キーの集合の固定も出てこない (契約の正本は contracts の :27)
- **推奨アクション**: 参照先を contracts / data-model に直すか、「pin テストで固定する」だけにする

### [Low] UNDETECTED_NOTES `sdk-query-method-indirect` の howToClose が `Pick<Query, 'interrupt'>` のまま。実行中の設定の 2 つの間接呼び出し (分割代入・`.call`) が包みの検査を素通りすることも書いていない (L-003) (scope: feature)

- **観察**:
  - `tests/rule-fixtures/expected.mjs:933` の howToClose が `Pick<Query, 'interrupt'>` に絞ると書く
  - 本 PR で `queryHandle` は `Pick<Query, 'interrupt' | 'setPermissionMode' | 'setModel'>` になった (`sdk-agent-session.ts:461`)
  - `.setPermissionMode(` の包みの検査 (`check.mjs:604-620`) は、`const { setPermissionMode } = q` の形を見ない
- **推奨アクション**: howToClose を 3 つの Pick に直し、why に包みの検査の間接の形を 1 文で足す

### [Low] glossary の `total_terms: 104` が古い (L-004) (scope: system)

- **観察**: `docs/glossary.md:5` は 104 だが、`#### **` の見出しは 124。本 PR は 2 語を足し、値を直していない (乖離は以前から)
- **推奨アクション**: 棚卸しで直す

### [Low] AD-062 の frontmatter に `amends:` が無い (L-005) (scope: feature)

- **観察**: AD-030 / AD-031 / AD-032 は読み替えた ADR を `amends:` で frontmatter に持つ (`0030-…md:9` / `0031-…md:9` / `0032-…md:10`)。AD-062 は AD-036 / AD-034 / AD-041 / AD-043 を読み替えるが、`supersedes: []` だけである。後の版では必ず付けているわけではなく、規範ではない
- **推奨アクション**: `amends: [AD-036, AD-034, AD-041, AD-043]` を足すと、読み替えが機械で追える

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `export\s*(\*\|\{[^}]*\})\s*from\s*['"]@anthropic-ai/claude-agent-sdk` (src/) | 0 | — (実害なし。High 上限) |
| H-001 | `再エクスポート\|re-export\|export \{\|export \*` (expected.mjs) | 0 | — (未記録) |
| M-001 | `'[^']+\.test\.ts'` (allowlists.mjs) | 1 | scripts/constitution/allowlists.mjs:266 |
| M-001 | `\.test\.ts` の除外 (check.mjs 項目 15) | 1 | scripts/constitution/check.mjs:783 |
| M-002 | `\| 実装済み[^|]*\| なし \|` (ui-coverage.md) | 4 | docs/ui-coverage.md:219, :220, :222, :251 |
| M-003 | features/shell の session の操作の部品 | 1 | src/renderer/src/features/shell/LiveSettingsControls.tsx |
| M-004 | `(import\|require)\s*\(\s*['"]@anthropic-ai/claude-agent-sdk` (tests/) | 0 | — |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 5
