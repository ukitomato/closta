---
spec_id: 015-ui-mcp-elicitation-commands
feature_id: O-5
domain: ui
domain_selected_by: user
targets: both
targets_selected_by: user
status: tasking
bf_ids: []
sf_ids: []
linear: null
---

# Feature Specification: MCP・プラグイン・コマンドの表示 (O-5)

**Feature Branch**: `015-ui-mcp-elicitation-commands` (今は `013-ui-app-shell` の上に積んである)

**Created**: 2026-10-04 (夜間の自走で起案。**人間の承認が要る判断を仮採用している — 下の「未承認の判断」を参照**)

**Status**: frontmatter の `status:` を正とする

**Input**: User description: roadmap M3 の順 14 の O-5 の行の「対応表の割当 (O-2 から)」— セッションの構成 (`init` の `model` / `tools` / `slash_commands`)、MCP の Server panel (`init` の `mcp_servers`・`RefreshMcpTools`・MCP の制御要求・MCP の resource の tool)、Elicitation form (`elicitation_complete`・制御要求 `elicitation`)、`AskUserQuestion` の応答 UI、`request_user_dialog`、`plugin_install` / `reload_plugins` / `reload_skills`、`commands_changed`、`auth_status`、MCP の tool の表示、Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用するかの判断。操作画面 (MCP サーバーの追加・削除など) は含めない。対象の行は `docs/ui-coverage.md` で `後続: O-5` の行。

## Summary

セッションが使っている MCP サーバー・tool・コマンド・プラグインと、MCP の tool の呼び出しを見えるようにする。

- **MCP の tool の表示**: `mcp__<server>__<tool>` と MCP の resource の tool (`ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools`) を、サーバー名・tool 名・入力の要点・結果で専用に描く (今は ToolFallback)
- **セッションの構成**: 右のペイン (O-7) に「構成」のタブを足し、モデル・MCP サーバーとその接続の状態・tool・スラッシュコマンド・スキル・プラグインの一覧を出す (`init` と `commands_changed`)
- **認証とプラグインの出来事**: `auth_status` (認証中・失敗) と `plugin_install` (開始・導入・失敗・完了) を transcript の行で出す

完了の PR で `docs/ui-coverage.md` の `後続: O-5` の行を、本 feature の表示 (`実装済み`)・`表示不要`・新しい後続 **O-10** のどれかに書き換える。

**なぜ今**: M3 の「未表示ゼロ」の残りのうち O-5 の Tier A は 5 行 (`auth_status`・`elicitation_complete`・MCP の tool・`AskUserQuestion`・制御要求 `elicitation`)。MCP の tool の呼び出しは今 ToolFallback で入力の JSON がそのまま出ており、どのサーバーの何が動いたかが読みにくい。

## 本 feature の位置づけ

- **範囲を分ける (未承認 U-1)。** Claude Code からの問いに答える UI (`AskUserQuestion` の回答・Elicitation の form / URL・`request_user_dialog`) は、承認済みの ADR が固定している境界の変更を伴う。
  - `AskUserQuestion` の回答は、承認の応答 (`canUseTool`) に `updatedInput` (`answers`) を返す必要がある。AD-036 Decision 4 は承認の応答から `updatedInput` を構造的に除いている (正の構成 P2)
  - Elicitation は query の options に `onElicitation` を、`request_user_dialog` は `onUserDialog` を足す必要がある。AD-041 (g) は options のキーの集合を固定している (今は Elicitation は自動で断られる)
  - これらは表示とは別の設計 (権限ゲートの例外の形・入力の検証・秘密の入力) が要るので、新しい feature **O-10「Claude Code からの問いに答える UI」(M3・`ui`・依存 O-5)** に分け、roadmap に登録する。対応表の 4 行 (`AskUserQuestion`・`elicitation`・`elicitation_complete`・`request_user_dialog`) は `後続: O-10` にする
- **MCP の操作はしない (U-2)。** roadmap の O-5 の行は「操作画面 (MCP サーバーの追加・削除など) は含めない」とする。制御要求 `mcp_status` は `init` の `mcp_servers` (毎ターンの最初に届く) で足りるので呼ばない。`mcp_call` / `mcp_message` / `mcp_set_servers` / `mcp_reconnect` / `mcp_toggle` / `reload_plugins` / `reload_skills` は操作なので `表示不要` にする
- **O-7 の上に置き場所を書き (AD-046)、O-4 の `meter` の経路を使う (U-3)。** `init` と `commands_changed` はセッションの最新の値なので、O-4 が足す `SessionEvent` の `meter` (AD-047) に種類を足して運ぶ。運ぶ文字列 (tool 名・コマンド名・サーバー名・プラグイン名) は会話由来ではないが利用者の設定由来なので、形を検査して切り詰める。決定は ADR (AD-048、proposed)
- **MCP の tool の表示は今の経路のまま。** tool の呼び出しと結果は既存の `message` の経路 (過去ログ・実行中の両方) に来ている。表示の部品を足すだけで、session の契約を変えない

## 未承認の判断 (夜間の自走で仮採用。2026-10-04)

**本 spec は design-gate で止め、利用者の承認まで /cl-implement に入らない。**

| # | 判断 | 仮採用した案 | 代わりの案 |
|---|---|---|---|
| U-1 | 応答の UI を O-5 から分けるか (roadmap の範囲の変更・新しい feature の登録) | 分ける。O-10 (M3・`ui`・依存 O-5) に `AskUserQuestion` の回答・Elicitation・`request_user_dialog` を移す。O-10 は AD-036 Decision 4 と AD-041 (g) の読み替えの ADR を起こす | O-5 に入れる (FR が 20 を超え、権限ゲートの例外の設計が表示と同じ spec に混ざる) |
| U-2 | MCP の制御要求と `reload_*` | 呼ばない。`mcp_status` は `表示不要: init の mcp_servers で足りる`、操作 6 つは `表示不要: アプリから MCP サーバー・プラグイン・スキルを操作しない (O-5 の範囲の決定)` | `mcp_status` を呼ぶ (Agent SDK の呼び出しの許可リストの追加に ADR が要る) |
| U-3 | 構成の運び方 | O-4 の `meter` に種類 `config` / `commands` を足す (依存 O-4)。設定由来の文字列を形の検査と切り詰めのうえで運ぶ。AD-048 (proposed) | 新しい `SessionEvent` の種類を足す (O-4 と O-5 で種類が 2 つ増える) |
| U-4 | `auth_status` の `output` (CLI のログインの出力の行) を出すか | 出さない。状態 (認証中・失敗) だけを行に出す。出力に URL や一時的な値が含まれうる | 出力の行を無害化して出す (アプリから OAuth の URL を開ける) |
| U-5 | Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用するか | 転用しない。MCP の結果は text / JSON として描く (結果の形はサーバーごとに違い、表やグラフへの写しを推測しない) | JSON の配列を Data table で描く |

## Clarifications

### Session 2026-10-04 (夜間の自走。利用者は不在)

- Q: MCP の tool の入力をどこまで出すか → A: 入力の JSON は閉じた中身として出し、見出しには サーバー名・tool 名だけを出す。入力の値を見出しに出さない (秘密の値が入りうる) [ASSUMED]
- Q: MCP サーバーの `error` (failed のときの文字列) を出すか → A: 出さない。状態だけ。`needs-auth` には「Claude Code で認証してください」の案内 [ASSUMED]
- Q: 構成のタブのスラッシュコマンドから実行できるようにするか → A: しない (一覧だけ)。composer の候補 (Composer slash commands) も出さない [ASSUMED]
- Q: プラグインの `path` を出すか → A: 出さない (名前と版だけ) [ASSUMED]

## User Scenarios & Testing

### User Story 1 - MCP の tool の呼び出しが読める (Priority: P1)

利用者は transcript で、MCP の tool の呼び出しが、どのサーバーのどの tool で、何を返したかを読む。

**Why this priority**: Tier A。今は ToolFallback で `mcp__github__create_issue` のような名前と入力の JSON がそのまま出る。承認したあとに何が起きたかを確かめにくい。

**Independent Test**: tool の表示の component テスト (過去ログと実行中の fixture)。

**Acceptance Scenarios**:

1. **Given** `mcp__<server>__<tool>` の呼び出し、**When** transcript を見る、**Then** 見出しにサーバー名と tool 名が分かれて出る (`__` の区切りを解く)。入力は閉じた中身として JSON で出る
2. **Given** 結果が届いた、**When** 見る、**Then** 結果の text (と画像・resource のリンクがあれば種類) が出る。エラーはエラーとして示す。本文の上限で切り詰めたことが分かる (O-2 の規則)
3. **Given** `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools`、**When** 見る、**Then** 同じ MCP の表示で、サーバー名と resource の URI (あれば) が見出しに出る
4. **Given** サーバー名や tool 名に `__` が含まれる・規則に合わない名前、**When** 見る、**Then** 名前の全体を 1 つの tool 名として出す (分けられないときに落ちない)
5. **Given** 過去ログを開いた、**When** MCP の呼び出しがある、**Then** 実行中と同じ形で出る

---

### User Story 2 - セッションの構成が分かる (Priority: P1)

利用者は右のペインの「構成」のタブで、表示中のセッションが使っているモデル・MCP サーバー (と接続の状態)・tool・スラッシュコマンド・スキル・プラグインを見る。

**Why this priority**: MCP サーバーが `failed` / `needs-auth` だと、その tool は使えないまま会話が進む。今は気付く手段が無い。

**Independent Test**: 変換の単体 (`init` / `commands_changed` → `meter`) と構成のタブの component テスト。

**Acceptance Scenarios**:

1. **Given** 稼働中のセッションでターンが始まった (`init`)、**When** 「構成」のタブを見る、**Then** モデル・MCP サーバーごとの状態・tool の数と一覧・スラッシュコマンド・スキル・プラグイン (名前と版) が出る
2. **Given** MCP サーバーの状態が `failed` / `needs-auth`、**When** 見る、**Then** そのサーバーが注意の見た目で出て、`needs-auth` には「Claude Code で認証してください」の案内が出る。エラーの文字列は出さない
3. **Given** `commands_changed`、**When** 届く、**Then** スラッシュコマンドの一覧が置き換わる
4. **Given** MCP サーバーのどれかが `failed` / `needs-auth`、**When** 右のペインを畳んでいる、**Then** 右のペインの帯の「構成」のアイコンに注意の印が出る
5. **Given** 過去のセッション・未選択、**When** 「構成」のタブを見る、**Then** 「実行中のセッションだけ」/ O-7 の空の状態

---

### User Story 3 - 認証とプラグインの出来事が分かる (Priority: P2)

利用者は、Claude Code が認証中・認証に失敗したこと、プラグインの導入の進み具合を transcript の行で見る。

**Why this priority**: `auth_status` は Tier A だが、アプリが起こすセッションで届く場面は少ない (ログインは WSL の端末で済ませている)。

**Independent Test**: 変換の単体と行の component テスト。

**Acceptance Scenarios**:

1. **Given** `auth_status` の `isAuthenticating: true`、**When** 届く、**Then** 「Claude Code が認証中」の行が出る。`output` の行は出さない
2. **Given** `auth_status` に `error` がある、**When** 届く、**Then** 同じ行が「認証に失敗」に書き換わり、再ログインを案内する。`error` の文字列は出さない
3. **Given** `plugin_install` の `started` → `installed` / `failed` → `completed`、**When** 届く、**Then** 1 つの行が進み具合で書き換わり、導入できた / できなかったプラグインの名前 (検査済み) が出る。`error` の文字列は出さない

---

### Edge Cases

- MCP の tool 名が `mcp__` で始まるが、サーバー名や tool 名に `__` を含む → 最初の `__` でサーバー名、残りを tool 名にする。分けられない名前は全体を tool 名にする
- MCP の結果が非常に大きい・画像を含む → 既存の本文の上限と切り詰め。画像は「画像」の印だけ (描かない) [ASSUMED]
- `init` の `mcp_servers` が多い (数十) → 一覧は 64 件まで。超えた数を「ほか N 件」で出す
- tool・コマンド・スキル・プラグインの名前に制御文字・双方向制御・長い文字列 → 形の検査 (data-model §2) で落とすか切り詰める
- プラグインの `version` は作者が書いた値 → 形の検査 (data-model §2) に通らなければ出さない
- `init` は毎ターンの最初に届く → 構成は最新の値で置き換える
- 承認待ちの MCP の tool (`canUseTool`) → 承認カード (X-1) は今のまま。承認カードの見出しにもサーバー名と tool 名を分けて出す
- `AskUserQuestion` が来た → 今のまま承認カードで許可 / 拒否だけ (回答は O-10)。対応表は `後続: O-10`

## Requirements

### Functional Requirements

#### MCP の tool の表示 (US-1)

- **FR-001**: transcript は、`mcp__<server>__<tool>` の tool の呼び出しを MCP の専用の表示で描かなければならない。
  - 見出し: サーバー名と tool 名 (名前の解き方の正本は data-model §1)。入力の値を見出しに出さない
  - 中身: 入力の JSON (閉じた状態)、結果 (text・画像や resource の種類の印)、エラー・切り詰めの印
  - 過去ログと実行中の両方 (既存の tool-call の part を使う。session の契約を変えない)
- **FR-002**: `ListMcpResourcesTool` / `ReadMcpResourceTool` / `ReadMcpResourceDir` / `RefreshMcpTools` は FR-001 と同じ表示で、サーバー名と resource の URI (入力にあれば) を見出しに出さなければならない
- **FR-003**: 承認カード (X-1) の見出しは、MCP の tool のときサーバー名と tool 名を分けて出さなければならない (data-model §1 の関数を共有する)
- **FR-004**: MCP の結果は text / JSON として描き、Tier C の Data table / Chart / Timeline / Diagram に転用しない (U-5)

#### セッションの構成 (US-2)

- **FR-005**: セッションスレッドは、`init` と `commands_changed` から構成を作り、O-4 の `meter` の種類 `config` / `commands` で renderer に届けなければならない (U-3。AD-048)。
  - 通すフィールドと形の検査の正本は data-model §2。`cwd`・プラグインの `path`・MCP サーバーの `error`・`apiKeySource`・`betas`・`capabilities` は通さない
  - 文字列 (モデルの id・tool 名・コマンド名・説明・サーバー名・スキル名・プラグイン名と版) は形の検査と切り詰めを通し、件数に上限を置く
  - 状態通知には載せない。前回の構成と同じなら送らない
- **FR-006**: renderer は、稼働中のセッションごとに最新の構成を持たなければならない (稼働中のストアの `meters`。O-4 の保持と同じく永続化しない・閉じたら捨てる)
- **FR-007**: 右のペイン (O-7) に「構成」のタブを足さなければならない (タブの表に 1 行)。項目・見た目・空の状態の正本は data-model §3。MCP サーバーが `failed` / `needs-auth` のときは、畳んだ帯のアイコンに注意の印を出す

#### 認証とプラグイン (US-3)

- **FR-008**: `auth_status` と `plugin_install` を、O-2 のシステムイベントの行 (category `auth` / `plugin`) で出さなければならない。行の id・状態・通すフィールドの正本は data-model §4。`output` / `error` の文字列は出さない。行の組み立ては agents に置き、過去ログの変換には足さない (O-4 と同じ)

#### 対応表と記録

- **FR-009**: 完了の PR で `docs/ui-coverage.md` の `後続: O-5` の行をすべて書き換えなければならない。書き換え先の正本は data-model §5。項目 21 の出力で、割当先が O-5 の行が 0 になる
- **FR-010**: roadmap に **O-10「Claude Code からの問いに答える UI」**(M3・`ui`・依存 O-5) を登録しなければならない。範囲: `AskUserQuestion` の回答 (AD-036 Decision 4 の読み替え: 承認の応答の `updatedInput` を `AskUserQuestion` の `answers` に限る制約付き射影)、Elicitation の form / URL (`onElicitation`。AD-041 (g) の読み替え)、`request_user_dialog` (`onUserDialog` と `supportedDialogKinds`)、`elicitation_complete` の表示。O-10 は ADR を起こしてから design する
- **FR-011**: 決定を ADR (AD-048、**proposed**) に記録しなければならない: `meter` に `config` / `commands` を足し設定由来の文字列を形の検査のうえで運ぶこと、MCP の制御要求と `reload_*` を呼ばないこと、応答の UI を O-10 に分けること
- **FR-012**: 導入した用語と判断を記録に反映しなければならない (Principle XIV)。glossary (MCP の tool の表示・セッションの構成・O-10 の範囲)、ui charter (Related Specs)、session charter (`meter` の種類の追加)、`_overview.md` (Feature 帰属の表に O-10、帰属の判断根拠)、`docs/prompts.md` (O-10 のプロンプト)

### Key Entities

- **MCP の tool の名前**: `mcp__<server>__<tool>` を サーバー名・tool 名に解いたもの。正本は data-model §1
- **セッションの構成 (SessionConfig)**: モデル・MCP サーバーと状態・tool・スラッシュコマンド・スキル・プラグイン。`meter` の `config` / `commands`。正本は data-model §2

### Assumptions / Clarifications

- **[未承認 U-1〜U-5]** 上の「未承認の判断」の表
- **[ASSUMED]** MCP の入力は閉じた中身。サーバーの `error` とプラグインの `path` は出さない。構成からコマンドを実行しない。画像は印だけ

## Success Criteria

- **SC-001**: **MCP の tool が読める。** US-1 の AC1〜AC5 のとおりになり、MCP の tool の呼び出しが ToolFallback で描かれない (過去ログ・実行中)。名前の解き方の各規則が単体で通る。計測経路: 名前の純関数の単体 + tool の表示の component テスト
- **SC-002**: **構成が届き、通さないフィールドが漏れない。** `init` / `commands_changed` の fixture から `meter` までが data-model §2 のとおりになり、通さないフィールド (`cwd`・`path`・`error`・`apiKeySource` ほか) に入れた目印の値が `SessionEvent` と DOM に 0 件。形の検査の外れ (制御文字・長い名前・件数の超過・`__proto__`) で例外が出ず落ちる。計測経路: 変換の単体 + 経路の通しのテスト (O-4 の FE-031 の形)
- **SC-003**: **構成と出来事が見える。** US-2 / US-3 の AC のとおりになる。計測経路: 構成のタブ・帯の印・行の component テスト
- **SC-004**: **対応表の O-5 の行が無くなる。** 項目 21 が通り、出力で割当先が O-5 の行が 0、O-10 の行が data-model §5 の 4 行。計測経路: `node scripts/constitution/check.mjs`
- **SC-005**: **境界の変更が ADR のとおり。** Agent SDK の呼び出しの許可リスト・query の options のキー・承認の応答の形 (`toPermissionResult`)・IPC・preload・main の差分が 0。`SessionEvent` の種類の差分が 0 (O-4 の `meter` の中の種類だけが増える)。計測経路: 固定テスト + `git diff` (quickstart)

## Dependencies

- **O-2** ([011](../011-ui-coverage/spec.md)): 対応表、システムイベントの行の経路と合成の規則、tool の表示の台帳
- **O-4** ([014](../014-ui-metering-and-limits/spec.md)): `meter` の経路と稼働中のストアの保持 (AD-047。proposed)。**O-4 が先にマージされてから実装する**
- **O-7** ([013](../013-ui-app-shell/spec.md)): 右のペインのタブの表 (AD-046。proposed)
- **X-1** (005): 承認カード、承認の応答の正の構成 (AD-036 Decision 4)
- **R-4** (004): tool の専用表示の登録 (`tool-registry.aui.tsx`)

## Out of Scope

- `AskUserQuestion` の回答・Elicitation の form / URL・`request_user_dialog`・`elicitation_complete` の表示 → **O-10** (新規登録)
- MCP サーバー・プラグイン・スキルの操作 (追加・削除・再接続・有効化・再読み込み・tool の呼び出し) → 行わない (roadmap の O-5 の行の決定。U-2)
- composer のスラッシュコマンドの候補 (Composer slash commands) → 出さない。利用者が `/` で始まる文を送れば Claude Code が解決する [ASSUMED]
- MCP の結果の表・グラフへの写し (U-5)
