---
spec_id: 015-ui-mcp-elicitation-commands
feature_id: O-5
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: implementing
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: MCP・プラグイン・コマンドの表示 (O-5)

**Feature Branch**: `015-ui-mcp-elicitation-commands` (2026-10-09 に main (faafe91) から切り直した。古い履歴は `015-ui-mcp-elicitation-commands-old`)

**Created**: 2026-10-04 (夜間の自走で起案。design-gate R1 の後に High を手当てした。夜間に仮採用した判断は **2026-10-05 に利用者が推奨案どおり承認した** — 下の「判断」を参照)

**Reopened**: 2026-10-09。O-7 の設計段階の上で書いた design を main (O-7・O-3・O-4 の完了の後) に載せ直し、O-7 の実装 (PR #13)・O-3 の実装 (PR #14)・O-4 の実装 (PR #15)・roadmap の O-5 の行 (順 15) と system-scope の持ち主の記録に合わせて直した。承認済みの判断 (U-1〜U-7・AD-048) は選び直していない。plan 以降は作り直す

**Status**: frontmatter の `status:` を正とする

**Input**: User description: roadmap M3 の順 15 の O-5 の行の「対応表の割当 (O-2 から)」— セッションの構成 (`init` の `model` / `tools` / `slash_commands`)、MCP の Server panel (`init` の `mcp_servers`・`RefreshMcpTools`・MCP の制御要求・MCP の resource の tool)、Elicitation form (`elicitation_complete`・制御要求 `elicitation`)、`AskUserQuestion` の応答 UI、`request_user_dialog`、`plugin_install` / `reload_plugins` / `reload_skills`、`commands_changed`、`auth_status`、MCP の tool の表示、Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用するかの判断。操作画面 (MCP サーバーの追加・削除など) は含めない。対象の行は `docs/ui-coverage.md` で `後続: O-5` の行。

## Summary

セッションが使っている MCP サーバー・tool・コマンド・スキル・プラグインと、MCP の tool の呼び出しを見えるようにする。

- **MCP の tool の表示**: `mcp__<server>__<tool>` と MCP の組み込みの 4 tool を、サーバー名・tool 名・入力・結果で専用に描く (今は ToolFallback)。承認カードには生の tool 名を切り詰めずに必ず出す
- **`AskUserQuestion` の問いの表示と暫定の注記**: 問いと選択肢 (過去ログに回答があれば回答) を読み取り専用で描き、承認カードに「アプリからは回答を送れない」ことを示す (回答は O-10)
- **セッションの構成**: 右のペインのタブの表 (O-7 の「概要」・O-4 の「使用量」) に 3 つ目の「構成」のタブを足し、Claude Code が報告したモデル・MCP サーバーと接続の状態・tool・スラッシュコマンド・スキル・プラグインを出す (`init` と `commands_changed`)。roadmap の O-5 の行の「右のペインのタブの候補: Server panel」はこのタブに入れる
- **認証とプラグインの出来事**: `auth_status` と `plugin_install` を transcript の行で出す

完了の PR で `docs/ui-coverage.md` の `後続: O-5` の行を、本 feature の表示 (`実装済み`)・`表示不要`・新しい後続 **O-10** のどれかに書き換える。M3 の完了の条件の残り (Tier A の後続のうち割当先が M3) は O-5 の前より 2 減る (`auth_status`・`mcp__*`。残り 3 行は O-10 に移る)。

**なぜ今**: MCP の tool の呼び出しは今 ToolFallback で入力の JSON がそのまま出ており、どのサーバーの何が動いたかが読みにくい。MCP サーバーが `failed` / `needs-auth` のまま会話が進んでも気付く手段が無い。`AskUserQuestion` は承認カードで許可しても回答が Claude に届かず、利用者はその理由を知らない。

## 本 feature の位置づけ

- **範囲を分ける (U-1)。** Claude Code からの問いに答える UI (`AskUserQuestion` の回答・Elicitation の form / URL・`request_user_dialog`) は、承認済みの ADR が固定している境界の変更を伴う。
  - `AskUserQuestion` の回答は、承認の応答 (`canUseTool`) に `updatedInput` (`answers`) を返す必要がある。AD-036 Decision 4 は承認の応答から `updatedInput` を構造的に除いている (正の構成 P2)
  - Elicitation は query の options に `onElicitation` を、`request_user_dialog` は `onUserDialog` を足す必要がある。AD-041 (g) は options のキーの集合を固定している (今は Elicitation は自動で断られる)
  - これらは新しい feature **O-10「Claude Code からの問いに答える UI と composer のコマンドの候補」(M3・依存 O-5・domain `session`。U-1 で承認済み)** に分ける。対応表の 4 行 (`AskUserQuestion`・`elicitation`・`elicitation_complete`・`request_user_dialog`) は `後続: O-10` にする。問いの読み取り専用の表示と承認カードの暫定の注記は、境界を変えないので本 feature で行う
- **MCP・プラグイン・スキルを操作しない (U-2)。** roadmap の O-5 の行は「操作画面は含めない」とする。さらにアプリ全体として、制御要求 (SDK の `Query` のメソッドと、それに当たる `mcp_call` / `mcp_message`) を呼ばない。根拠は accepted の AD-036 §4 P3 (`Query` のメソッドは `interrupt` だけ) で、AD-048 Decision 2 がこれを MCP・プラグインに当てはめる。機械検査 (Constitution 検証の項目 16 の P3) を本 feature で広げる
- **O-7 の上に置き場所を書き (AD-046)、O-4 の `meter` の経路を使う (U-3)。** O-7 (PR #13) と O-4 (PR #15) は完了している。`init` と `commands_changed` はセッションの最新の値なので、O-4 の `SessionEvent` の `meter` (AD-047。accepted) に種類 `init-report` / `commands` を足して運ぶ。運ぶ文字列は会話本文ではないが、**利用者の設定・作業フォルダ (`.claude/`)・MCP サーバー・プラグインの作者に由来する未信頼の文字列**なので、名前は allowlist の形の検査、説明は無害化と切り詰めを通す。決定は AD-048 (2026-10-05 に accepted)。`init` の `permissionMode` は O-4 がすでに権限モードの比較に読んでいる (014 data-model §2) ので、本 feature は同じ `init` の分岐で構成のフィールドを読み足すだけにする
- **MCP の tool の表示は今の経路のまま。** tool の呼び出しと結果は既存の `message` の経路 (過去ログ・実行中の両方) に来ている。表示の部品を足すだけで、tool-call の part の形 (`TRANSCRIPT_PART_FIELDS`) を変えない。ただし過去ログの tool 名は今無害化されていない (`src/domain/session/transcript.ts:233`) ので、実行中 (`live-message.ts:61`) と同じ無害化に揃える (1 行の修正)

### 義務の扱い

roadmap が O-5 に預けた義務 (O-5 の行と、system-scope の持ち主の記録で O-5 に当たりうるもの) の扱いの正本はこの表である。

| 義務 (roadmap の記録) | 扱い | 正本 / 当たる理由 |
|---|---|---|
| O-2 から: 対応表の `後続: O-5` の行 (構成・MCP・Elicitation・`AskUserQuestion`・`request_user_dialog`・プラグイン・コマンド・`auth_status`・Tier C の転用の判断) | 入れる (応答の UI は O-10 に送る。U-1) | US-1〜US-3 / FR-001〜FR-013 |
| O-7 から: 右のペインのタブの候補「Server panel」 | 入れる (「構成」のタブ) | FR-009 |
| O-7 から (O-4 が済ませた): タブのテストを `AppShell.test.tsx` に足さない・tablist の矢印キーと roving tabindex | 継ぐ (新しい義務はない) | FR-009。O-4 の分割 (`RightPanel.tabs.test.tsx`) とキー操作 (014 FR-017) をそのまま使う |
| O-8 の行の (c): 観測点 `receivedMessages` の基準の変化を並べて書く | 入れる (記録だけ) | FR-015。`auth` / `plugin` の行は `message` なので数え、`init-report` / `commands` は `meter` なので数えない |
| system-scope「composer の名前と placeholder が英語」の残り (`Send message`・`Stop generating`・`Scroll to bottom`・音声入力。持ち主 = composer を次に触る feature (O-5 と X-6 の早いほう)) | 入れない **[未承認 — `.needs-input.md` Q2]** | O-5 は composer を変えない (U-6 で composer のスラッシュコマンドの候補を O-10 に送った)。roadmap が O-5 を名指したのは `commands_changed` で composer を触る前提だったため。持ち主を「O-10 と X-6 の早いほう」に付け替える (FR-015) |
| system-scope「表示中のセッションのターンが始まるたびに composer がフォーカスを奪う」(O-7 pr-gate R2 (1)。持ち主 = 同上) | 入れない **[未承認 — `.needs-input.md` Q2]** | 同上 |
| system-scope「`runtime-store.ts` の検出を束ねる (single-flight)」(持ち主 = 次に `runtime-store.ts` を触る feature) | 当たらない | O-5 は `runtime-store.ts` を変えない |
| system-scope「直近の活動の不可視文字の残り」(持ち主 = 次に `sanitizeBody` か直近の活動を触る feature) | 当たらない | O-5 は `sanitizeBody` の集合と直近の活動の導出 (`summarizeToolInput`) を変えない。過去ログの tool 名に `sanitizeBody` を呼ぶ (FR-001) だけで、集合は今のまま |
| system-scope「`running-session-store.ts` の切り出し」・「押したボタンが自分ごと消える」・「Provider の表記の揺れ」 | 当たらない (O-4 が持って閉じた) | O-5 は `meters` に枝を足す (FR-008) が、切り出しは済んでいる。文言の「Provider」は glossary の表記に従う (data-model §6) |
| Constitution 検証の項目 16 の P3 を正の形 (`interrupt` 以外を違反) にする | 当たらない (項目 16 の持ち主に送る) | FR-011 |

## 判断 (2026-10-04 の夜間の自走で仮採用し、2026-10-05 に利用者が承認)

利用者は下の表の「仮採用した案」と AD-048 を 2026-10-05 に推奨案どおり承認した。表の字面は承認の時点のまま残す (U-3 の「proposed」は承認の前の状態で、AD-048 は同日に accepted になった)。

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | 応答の UI を O-5 から分けるか (roadmap の範囲の変更・新しい feature の登録)。分けるなら O-10 の domain | 分ける。O-10 (M3・依存 O-5) に `AskUserQuestion` の回答・Elicitation・`request_user_dialog`・composer のコマンドの候補 (U-6) を移す。O-10 の domain は **session** (境界の ADR と制御の経路の持ち主) とし、表示の部品は ui が持つ。O-10 は AD-036 Decision 4 と AD-041 (g) の読み替えの ADR を起こしてから design する | O-5 に入れる (FR が 20 を超え、権限ゲートの例外の設計が表示と同じ spec に混ざる) / O-10 を `ui` にする / O-10 の依存を O-2・X-1 にして並行に進める (composer の候補が O-5 の `commands` に依るので O-5 に依存させる) |
| U-2 | MCP・プラグイン・スキルの制御要求 | 呼ばない (アプリ全体の決定。AD-048 Decision 2。根拠は AD-036 §4 P3)。`mcp_status` は `表示不要: init の mcp_servers で足りる`、操作 6 つと `mcp_call` / `mcp_message` は `表示不要: アプリは MCP・プラグイン・スキルを操作しない (AD-048)`。項目 16 の P3 の検査を広げる | `mcp_status` を呼ぶ・`failed` に再接続 (`reconnectMcpServer`) を出す (AD-036 §4 P3 の読み替えの ADR が要る。回復の手段になる) |
| U-3 | 構成の運び方 | O-4 の `meter` に種類 `init-report` / `commands` を足す (依存 O-4)。未信頼の文字列を形の検査のうえで運ぶ。AD-048 (proposed。AD-047 Decision 2 の読み替え) | 新しい `SessionEvent` の種類を足す (O-4 と O-5 で種類が 2 つ増える) |
| U-4 | `auth_status` の `output` (CLI のログインの出力の行) を出すか | 出さない。状態 (認証中・成功・失敗) と、端末でログインする案内だけを行に出す。アプリの中でログインする方式 (`in-app-login`) を実装する feature が見直す | 出力の行を無害化して出す (アプリから OAuth の URL を開ける) |
| U-5 | Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用するか | 転用しない。MCP の結果は平文として描く | JSON の配列を Data table で描く |
| U-6 | composer のスラッシュコマンドの候補 (Composer slash commands。Tier A の element・ui charter の In scope) の持ち主 | O-10 に送る (composer の入力の拡張で、IME の扱い (Principle VIII) を回答の入力と一緒に設計する)。O-5 は一覧を構成のタブに出すだけ | O-5 に入れる (FR が増え、composer の IME の E2E が要る) / ui charter の In scope から外す |
| U-7 | MCP の結果の画像・resource の印 | 出さない。今の `toolResultText` は text 以外のブロックを捨て、tool-call の `result` は文字列だけなので、印には session の契約 (DTO) の変更が要る。本文に印を差し込む形は偽の印を作れるので採らない | DTO に結果の種類のフィールドを足す (`TRANSCRIPT_PART_FIELDS` とスキーマのテストの変更) |

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

各項目の末尾に、`/cl-spec` Phase 8 の基準での根拠を書く (2026-10-09 の載せ直しで分類した)。

- Q: MCP の tool の入力をどこまで出すか → A: 入力の JSON は閉じた中身として出す [ASSUMED: 既定の表示状態 (Phase 8 のポジティブリスト)]。見出しにはサーバー名・tool 名と、resource の tool なら URI の scheme・host・最後のパスの要素だけを出す [ASSUMED: **未承認 — ポジティブリストの外。`.needs-input.md` Q3**]
- Q: MCP サーバーのエラーの文字列を出すか → A: `init` の `mcp_servers` は名前と状態だけを運び、エラーの文字列を持たない (エラーは `mcp_status` の応答にだけあり、U-2 で呼ばない)。状態に案内を添える (案内の文言はポジティブリスト)
- Q: 構成のタブのスラッシュコマンドから実行できるようにするか → A: しない (一覧だけ)。roadmap の O-5 の行は表示の feature で、composer の候補は U-6 で O-10 に送った
- Q: プラグインの `path` を出すか → A: 出さない (名前と版だけ)。AD-048 Decision 3 (`path` は通さない) で承認済み
- Q: 構成のタブのモデルと「概要」(O-7) のモデルの関係 → A: 「概要」は起動の設定で選んだモデル (見出し「起動時のモデル」。`OVERVIEW_LABELS.model`)、「構成」は Claude Code が報告したモデル (見出し「Claude Code が報告したモデル」) [ASSUMED: UI ラベル (ポジティブリスト)]
- Q: MCP サーバーの状態の鮮度 → A: `init` は毎ターンの最初に届くので、状態はターンの開始時点の値。タブにその旨を出す (AD-048 Alternatives の「状態はターンの開始時点の値と表示する」で承認済み。文言はポジティブリスト)

## User Scenarios & Testing

### User Story 1 - MCP の tool の呼び出しと Claude からの問いが読める (Priority: P1)

利用者は transcript で、MCP の tool の呼び出しが、どのサーバーのどの tool で、何を返したかを読む。`AskUserQuestion` の問いと選択肢も読める。承認するとき、どの tool を許可するのかを取り違えない。

**Why this priority**: Tier A。今は ToolFallback で `mcp__github__create_issue` のような名前と入力の JSON がそのまま出る。`AskUserQuestion` は許可しても回答が届かないのに、そのことが分からない。

**Independent Test**: tool の表示と承認カードの component テスト (過去ログと実行中の fixture)。

**Acceptance Scenarios**:

1. **Given** `mcp__<server>__<tool>` の呼び出し、**When** transcript を見る、**Then** 見出しにサーバー名と tool 名が分かれて出る (名前の解き方の正本は data-model §1)。入力は閉じた中身として JSON で出る
2. **Given** 結果が届いた、**When** 見る、**Then** 結果の text が平文で出る。エラーはエラーとして示す。本文の上限で切り詰めたことが分かる (O-2 の規則)
3. **Given** `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools`、**When** 見る、**Then** 同じ MCP の表示で、サーバー名と resource の URI の要約 (scheme・host・最後のパスの要素) が見出しに出る
4. **Given** tool 名が `mcp__a__b__c`、**When** 見る、**Then** data-model §1 のとおり、表示中のセッションの構成が報告したサーバー名の最長一致で分ける (サーバー `a__b` があれば `a__b` › `c`、`a` だけなら `a` › `b__c`)。構成が無い・どれにも一致しない・複数に同じ長さで一致するときは、最初の `__` で分けた見出しに「サーバー名は推定」の印を付ける
5. **Given** 過去ログを開いた、**When** MCP の呼び出しがある、**Then** 実行中と同じ形で出る (tool 名は実行中と同じ無害化を通る)
6. **Given** 承認待ちの MCP の tool、**When** 承認カードを見る、**Then** カードに生の tool 名が切り詰めずに等幅で必ず出て、補助としてサーバー名と tool 名の見出しが出る。MCP でない tool のカードは今のまま
7. **Given** `AskUserQuestion` の呼び出し、**When** transcript を見る、**Then** 問い・見出し・選択肢 (説明つき) が読み取り専用で出る。過去ログで入力に回答 (`answers`) があれば、選ばれた選択肢が分かる
8. **Given** 承認待ちの `AskUserQuestion`、**When** 承認カードを見る、**Then** 「このアプリからは回答を送れません。許可しても選択は Claude に届きません。拒否して、本文で答えてください」の注記が出る
9. **Given** MCP の tool / `AskUserQuestion` の呼び出しが結果待ち・承認待ち (`requires-action`)・中断 (`incomplete`。cancelled とエラー) のいずれか、または経過時間を持つ、**When** transcript を見る、**Then** ToolFallback と同じ状態の印 (状態のアイコン・中断の印・経過時間。O-4 の `ToolResultMarks` を含む) が出る。専用の表示に移しても状態の印は減らない (data-model §1「状態の印」)

---

### User Story 2 - セッションの構成が分かる (Priority: P1)

利用者は右のペインの「構成」のタブで、表示中のセッションの Claude Code が報告したモデル・MCP サーバー (と接続の状態)・tool・スラッシュコマンド・スキル・プラグインを見る。

**Why this priority**: MCP サーバーが `failed` / `needs-auth` だと、その tool は使えないまま会話が進む。今は気付く手段が無い。

**Independent Test**: 変換の単体 (`init` / `commands_changed` → `meter`) と構成のタブの component テスト。

**Acceptance Scenarios**:

1. **Given** 稼働中のセッションでターンが始まった (`init`)、**When** 「構成」のタブを見る、**Then** Claude Code が報告したモデル・MCP サーバーごとの状態・tool の数と一覧・スラッシュコマンド・スキル・プラグイン (名前と版) が出て、「ターンの開始時点の状態」と分かる
2. **Given** MCP サーバーの状態が `failed` / `needs-auth`、**When** 見る、**Then** そのサーバーが注意の印 (アイコン・`data-attention`・`aria-label`) で出て、案内 (data-model §3) が出る
3. **Given** 次のターンの `init` で、名前は同じまま状態だけが変わった (`pending` → `failed` など)、**When** 届く、**Then** タブと印が新しい状態になる
4. **Given** `commands_changed`、**When** 届く、**Then** スラッシュコマンドの一覧が置き換わり、説明と引数の形が出る。後から届いた `init` とは、一覧の名前が前回の `init` から変わったときだけ名前の集合を後勝ちで置き換える。説明と引数の形は最新の `commands` から名前で引くので、`init` の後も消えない (MCP の状態だけが変わった `init` で一覧は変わらない。合流の規則の正本は data-model §2「renderer の保持」)
5. **Given** MCP サーバーのどれかが `failed` / `needs-auth`、**When** 右のペインを畳んでいる、**Then** 右のペインの帯 (畳んだときのタブのアイコンの列) の「構成」のアイコンに注意の印が出る
6. **Given** MCP サーバー・スキル・プラグイン・コマンドのどれかが 0 件・モデルが形の検査に通らない・状態が知らない値、**When** 見る、**Then** 節ごとに「ありません」・モデルは「不明」・状態は「不明」(注意の印は付けない) が出る
7. **Given** 過去のセッション・未選択、**When** 「構成」のタブを見る、**Then** 「実行中のセッションだけ」/ O-7 の空の状態

---

### User Story 3 - 認証とプラグインの出来事が分かる (Priority: P2)

利用者は、Claude Code が認証中・認証に失敗したこと、プラグインのマーケットプレイスの導入の進み具合を transcript の行で見る。

**Why this priority**: 価値は主に表示網羅 (ui charter KPI) にある。`auth_status` は Tier A だが、アプリが起こすセッションではログインを WSL の端末で済ませる運用で、届く場面は少ない。`plugin_install` は `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` を渡したときだけ届くが、アプリはこの変数を渡さない (AD-041 (e) の転送禁止の接頭辞) ので、通常は届かない。

**Independent Test**: 変換の単体と行の component テスト。

**Acceptance Scenarios**:

1. **Given** `auth_status` の `isAuthenticating: true`、**When** 届く、**Then** 「Claude Code が認証中です。セッションを起動した環境の端末で claude にログインしてください」の行が出る。`output` の行は出さない
2. **Given** 認証が終わった (`isAuthenticating: false`、`error` なし)、**When** 届く、**Then** 同じ行が「認証しました」に書き換わる
3. **Given** `auth_status` に `error` がある、**When** 届く、**Then** 同じ行が「認証に失敗」に書き換わり、再ログインを案内する。`error` の文字列は出さない
4. **Given** 行が「認証中」のままセッションが終わった、**When** 見る、**Then** O-2 の規則で「結果不明」
5. **Given** `plugin_install` の `started` → `installed` / `failed` → `completed`、**When** 届く、**Then** 1 つの行が進み具合で書き換わり、導入できた / できなかったマーケットプレイスの数と、最後のマーケットプレイスの名前 (形の検査済み) が出る。`error` の文字列は出さない

---

### Edge Cases

- MCP のサーバー名に `__` を含む (SDK は名前の `[a-zA-Z0-9_-]` 以外を `_` に正規化するので起こりうる) → US-1 AC4 の最長一致。推定のときは印を付け、承認カードは生の名前を必ず出す
- `mcp__` で始まるが分けられない名前 (`mcp__x` など) → 全体を 1 つの tool 名として MCP の表示で出す (data-model §1)
- MCP の結果が非常に大きい → 既存の本文の上限と切り詰め。画像・resource は印を出さない (U-7。結果の text だけ)
- `init` の `mcp_servers` が多い → 一覧は 64 件まで、超えた数を「ほか N 件」
- tool・コマンド・スキル・プラグイン・マーケットプレイスの名前が allowlist の形に合わない → 落として省いた数に数える (data-model §2)
- プラグインの `version` は作者が書いた値 → 形の検査に通らなければ出さない
- `init` は毎ターンの最初に届く → 構成は最新の値で置き換える。状態がターンの途中で変わっても次のターンまで変わらない (状態はターンの開始時点の値)
- O-4 の `meter` の上限 (セッションあたり 1 秒に 20 件。`meter-throttle.ts` の `METER_THROTTLE_SESSION_LIMIT`) に `init-report` / `commands` は掛けない (ターンに 1 回程度で、最新の値を落とすと二度と届かない場合がある。O-4 の `rate-limit` と同じく間引かずに送る)
- 承認待ちの MCP の tool → 承認カードは生の名前を必ず出す (US-1 AC6)
- `AskUserQuestion` が来た → 問いを読み取り専用で出し、承認カードに暫定の注記 (US-1 AC7 / AC8)。回答は O-10
- 表示していない稼働中のセッションの MCP サーバーが `failed` になった → 監視ビューの行には出さない (行の密度は O-1 で詰めてあり、表示したときに帯と構成のタブで気付ける) **[未承認 — ポジティブリストの外。`.needs-input.md` Q3]**

## Requirements

### Functional Requirements

#### MCP の tool と問いの表示 (US-1)

- **FR-001**: transcript は、`mcp__<server>__<tool>` の tool の呼び出しを MCP の専用の表示で描かなければならない。
  - 見出し: サーバー名と tool 名 (名前の解き方の正本は data-model §1)。入力の値を見出しに出さない
  - 中身: 入力の JSON (閉じた状態)、結果 (平文。MarkdownText に通さない)、エラー・切り詰めの印
  - 過去ログと実行中の両方。tool-call の part の形を変えない。過去ログの tool 名を実行中と同じ無害化に揃える (`transcript.ts:233`)
- **FR-002**: `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools` は FR-001 と同じ表示で、サーバー名と resource の URI の要約 (data-model §1) を見出しに出さなければならない
- **FR-003**: tool の表示の振り分け (`tool-registry.aui.tsx`) は、AD-035 Decision 1 の登録を 2 段にしなければならない: 完全一致の表 (組み込みの 4 tool を含む) → `mcp__` の接頭辞の判定 (MCP の表示)。どちらにも当たらない名前は ToolFallback に落ちる。表の照合は `Object.hasOwn` (AD-048 Decision 5)
- **FR-004**: 承認カード (`features/session/ApprovalCard.tsx`) は、MCP の tool のとき、生の tool 名を切り詰めずに等幅で必ず出し、補助としてサーバー名と tool 名の見出しを出さなければならない。`AskUserQuestion` のときは暫定の注記を出す (data-model §4)。承認の応答 (`toPermissionResult`) は変えない
- **FR-005**: `AskUserQuestion` の呼び出しを、問い・見出し・選択肢 (と入力にあれば回答) の読み取り専用の表示で描かなければならない (過去ログと実行中)。回答の入力は出さない (O-10)
- **FR-006**: MCP の結果は平文で描き、Tier C の Data table / Chart / Timeline / Diagram に転用しない (U-5)。画像・resource の印は出さない (U-7)

#### セッションの構成 (US-2)

- **FR-007**: セッションスレッドは、`init` と `commands_changed` から構成を作り、O-4 の `meter` の種類 `init-report` / `commands` で renderer に届けなければならない (U-3。AD-048 Decision 3)。
  - 通すフィールド・形の検査・件数とバイト数の上限の正本は data-model §2。`cwd`・プラグインの `path`・`apiKeySource`・`betas`・`capabilities` は通さない
  - 前回と同じかは、変換後の値の全体で比べ、実際に送ったときだけ基準を更新する。O-4 の `meter` の上限に掛けない
  - `init` の `permissionMode` は O-4 がすでに権限モードの比較に使っている (014 data-model §2)。`init-report` には載せず、O-4 の扱いを変えない
  - 状態通知には載せない
- **FR-008**: renderer は、稼働中のセッションごとに最新の構成を持たなければならない (稼働中のストア `running-session-store.ts` の `meters` (`SessionMeters`)。O-4 の保持と同じく永続化しない・閉じたら捨てる)。スラッシュコマンドの一覧は data-model §2「renderer の保持」の合流の規則で作る (名前の集合は届いた順の後勝ちだが、`init-report` は `slashCommands` が前回の `init-report` から変わったときだけ数える。説明と `argumentHint` は最新の `commands` から名前で引く)
- **FR-009**: 右のペインのタブの表 (`features/shell/panel-tabs.ts`。O-7 の「概要」と O-4 の「使用量」がある) に「構成」のタブを足さなければならない。
  - 項目・見出し・空の状態・案内・注意の印の正本は data-model §3。タブの表に注意の印のフィールドを足し、畳んだ帯のアイコンに印を出す (data-model §3)
  - tablist のキー操作は O-4 が入れたもの (014 FR-017) をそのまま使う。タブのテストは `RightPanel.tabs.test.tsx` の側に足し、`AppShell.test.tsx` に足さない

#### 認証とプラグイン (US-3)

- **FR-010**: `auth_status` (最上位の型) と `plugin_install` (`system` の subtype) を、O-2 のシステムイベントの行 (category `auth` / `plugin`) で出さなければならない。行の id・状態・通すフィールドの正本は data-model §4。`output` / `error` の文字列は出さない。行の組み立ては agents (O-4 の行と同じ `live-signals.ts`) に置き、過去ログの変換に足さない (O-4 と同じ)

#### 境界の検査と記録

- **FR-011**: Constitution 検証の項目 16 の P3 (`Query` の変更系のメソッドの検査) を広げなければならない。`QUERY_MUTATION_METHODS` に足すメソッドは AD-048 Decision 2 の 11 個と、AD-036 §4 P3 (`interrupt` だけ) を根拠とする `reloadOutputStyles` / `backgroundTasks` (ADR 不要。research R-06)。`Query` の自前のメソッドが漏れなく分類されていることを型で固定し、違反の fixture を置く。正の形 (`interrupt` 以外を違反) への置き換えは項目 16 の持ち主に送る (system scope)
- **FR-012**: 完了の PR で `docs/ui-coverage.md` の `後続: O-5` の行をすべて書き換えなければならない。書き換え先の正本は data-model §5。項目 21 の出力で、割当先が O-5 の行が 0 になる
- **FR-013**: roadmap に **O-10「Claude Code からの問いに答える UI と composer のコマンドの候補」**(M3・依存 O-5・domain `session` (U-1)) を登録しなければならない。範囲と義務:
  - `AskUserQuestion` の回答: 承認の応答の `updatedInput` は、agents の `canUseTool` の中で SDK が渡した元の `input` に `answers` だけを足して組む。renderer から受けるのは回答だけで、キーは元の問いの文と照合し、値の長さを制限する。tool 名は SDK の値で判定する。射影の関数は `toPermissionResult` の隣に置き、キーの集合を pin テストで固定する (AD-036 Decision 4 の読み替えの ADR)
  - Elicitation の form / URL (`onElicitation`) と `request_user_dialog` (`onUserDialog`・`supportedDialogKinds` は allowlist) (AD-041 (g) の読み替えの ADR)。Elicitation の入力は永続化しない・ログに出さない。URL は既存の `openExternalIfHttp` だけを通す
  - `elicitation_complete` の表示、composer のスラッシュコマンドの候補 (U-6。IME の変換中は出さない)
  - O-10 は design の前に 2 つの ADR を起こす
- **FR-014**: 決定は AD-048 (2026-10-05 に accepted) に記録済みである。本 feature は AD-048 の本文を変えない。AD-048 の「読み替える箇所」が「AD-047 は proposed のうちに Consequences に本 ADR への参照を足す」としていたが、AD-047 は参照を持たないまま accepted になった。AD-047 に日付つきの訂正節 (AD-031 Decision 1) で AD-048 への参照を足す **[未承認 — `.needs-input.md` Q1]**。`METER_UPDATE_TYPES` の固定テストを直す
- **FR-015**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。
  - glossary: MCP の tool の表示、セッションの構成 (Claude Code の報告。`SessionInitReport`。「SessionLaunchConfig (選んだ設定) とは別物」の Counterexample)、O-10 の範囲
  - ui charter: Related Specs、Open Questions の Tier C の答えを「転用しない (AD-048)」に、In scope の composer の slash commands の持ち主を O-10 に
  - session charter: `meter` の種類の追加と未信頼の文字列の区分
  - `_overview.md`: Feature 帰属の表に O-10、帰属の判断根拠 (O-10 の domain)、Milestone の M3 の列
  - roadmap: O-10 の行、O-5 の行 (依存に O-4 を足す・題から Elicitation を外す・O-5 の結論)、O-8 の行の (c) の観測点の注記 (`auth` / `plugin` の行は数え、`init-report` / `commands` は数えない)、system-scope の composer の 2 項目の持ち主を「O-10 と X-6 の早いほう」に付け替える (上の「義務の扱い」。Q2 の回答に従う)、項目 16 の P3 を正の形にする記録
  - `docs/prompts.md` (O-10 のプロンプト)

### Key Entities

- **MCP の tool の名前**: `mcp__<server>__<tool>` を サーバー名・tool 名に解いたもの。正本は data-model §1
- **セッションの構成 (SessionInitReport)**: Claude Code が報告したモデル・MCP サーバーと状態・tool・スラッシュコマンド・スキル・プラグイン。`meter` の `init-report` / `commands`。起動の設定 (`SessionLaunchConfig`) とは別物。正本は data-model §2

### Assumptions / Clarifications

- **[承認済み U-1〜U-7]** 上の「判断」の表 (2026-10-05)
- **[ASSUMED]** MCP の入力は閉じた中身・モデルの見出しを分ける (Phase 8 のポジティブリスト)。プラグインの `path` を出さない・状態はターンの開始時点は AD-048 で承認済み。構成からコマンドを実行しないのは範囲から
- **[未承認]** URI の要約の要素・監視ビューの行に MCP の印を出さない (`.needs-input.md` Q3)、composer の 2 義務を入れない (Q2)、AD-047 への参照の訂正節 (Q1)
- アプリの起動では `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` を渡さないので、`plugin_install` は通常は届かない (行は fixture の単体と component で確かめる)

## Success Criteria

- **SC-001**: **MCP の tool と問いが読める。** US-1 の AC1〜AC9 のとおりになり、MCP の tool と `AskUserQuestion` の呼び出しが ToolFallback で描かれない (過去ログ・実行中)。名前の解き方の各規則 (data-model §1 の表の各行) と、非 MCP の名前 (`mcp_x`・`MCP__a__b`・`xmcp__a__b`・`constructor`) が ToolFallback に落ちることが単体で通る。既存の 8 つの名前の振り分けが変わらない。承認カードの DOM に 200 文字の tool 名が全文で出る。計測経路: 名前の純関数の単体 + tool の表示と承認カードの component テスト
- **SC-002**: **構成が届き、変化が伝わり、通さないフィールドが漏れない。** `init` / `commands_changed` の fixture から `meter` までが data-model §2 のとおりになり、通さないフィールドの目印の値が `SessionEvent` と DOM に 0 件。名前が同じで状態だけが変わった 2 回目の `init`、同じ長さの別のモデルが送られ DOM まで届く。同じ内容は送られない。形の検査の外れ (制御文字・tag 文字・U+2028・長い名前・件数の超過・`__proto__` / `constructor`) で例外が出ず落ちる。計測経路: 変換の単体 + 経路の通しのテスト (O-4 の `tests/meter/meter-through.test.tsx` の形)
- **SC-003**: **構成と出来事が見える。** US-2 / US-3 の AC のとおりになる。計測経路: 構成のタブ・帯の印・行の component テスト
- **SC-004**: **対応表の O-5 の行が無くなる。** 項目 21 が通り、出力で割当先が O-5 の行が 0、O-10 の行が data-model §5 の 4 行。M3 の完了の条件の残りが O-5 の前より 2 減る。計測経路: `node scripts/constitution/check.mjs`
- **SC-005**: **境界の変更が ADR のとおり。** Agent SDK の呼び出しの許可リスト・query の options のキー・承認の応答の形 (`toPermissionResult`)・`TRANSCRIPT_PART_FIELDS`・IPC・preload・main の差分が 0。`SESSION_EVENT_KINDS` の差分が 0 (O-4 の `meter` の中の種類 `METER_UPDATE_TYPES` だけが増える)。`sdk-agent-session.ts` の `Query` のメソッドの呼び出しは `interrupt` だけで、項目 16 の P3 が広げたメソッドの違反の fixture で発火する。`Query` の自前のメソッドは `interrupt`・変更系 (`QUERY_MUTATION_METHODS`)・呼ばない読み取りのどれかに分類され、SDK の版上げで増えたメソッドは型検査で落ちる。計測経路: 固定テスト + `sdk-agent-session.ts` の `keyof Query` の網羅 (`Equal<Exclude<…>, never>`。tsc) + 項目 16 の fixture + `git diff` (quickstart)

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表、システムイベントの行の経路と合成の規則、tool の表示の台帳
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)。PR #15 で完了): `meter` の経路 (`src/domain/session/meter.ts`・agents の `live-signals.ts`・decoder)、稼働中のストアの `meters` の保持、`init` の `permissionMode` による権限モードの比較、タブのキー操作とタブのテストの分割 (AD-047。accepted)
- **O-7** ([013](../013-ui-app-shell/spec.md)。PR #13 で完了): 右のペインのタブの表 (`panel-tabs.ts`)・畳んだ帯 (`RightPanel.tsx`)・「概要」の「起動時のモデル」(AD-046。accepted)
- **X-1** (005): 承認カード、承認の応答の正の構成 (AD-036 Decision 4)、`Query` のメソッドの制約 (AD-036 §4 P3)
- **R-4** (004): tool の専用表示の登録 (AD-035 Decision 1)

## Out of Scope

- `AskUserQuestion` の回答・Elicitation の form / URL・`request_user_dialog`・`elicitation_complete` の表示・composer のスラッシュコマンドの候補 → **O-10** (新規登録)
- MCP サーバー・プラグイン・スキルの操作 (追加・削除・再接続・有効化・再読み込み・tool の呼び出し) → 行わない (アプリ全体の決定。U-2 / AD-048)
- MCP の結果の画像・resource の印 (U-7)、表・グラフへの写し (U-5)
- 監視ビューの行の MCP の印 → 出さない (Edge Cases。Q3)
- composer の変更 (英語のボタンの名前・フォーカスの奪取を含む) → 「義務の扱い」(Q2)
