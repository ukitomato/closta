---
status: accepted
date: 2026-10-04
id: AD-048
deciders: ukitomato
tags: [session, ui, sdk, mcp, scope]
supersedes: []
superseded-by: []
---

# AD-048: セッションの構成を `meter` で運び、MCP・プラグイン・スキルを操作せず、問いに答える UI を O-10 に分ける

## Context

O-5 ([spec 015](../../specs/015-ui-mcp-elicitation-commands/spec.md)) は、`docs/ui-coverage.md` で `後続: O-5` の行 (Tier A 5 行) を受け持つ。範囲は roadmap の O-5 の行で、「操作画面 (MCP サーバーの追加・削除など) は含めない」とされている。

調べた事実 (SDK 0.3.270):

- `AskUserQuestion` の回答は、承認の応答 (`canUseTool`) の `updatedInput` に `answers` を入れて返す (`sdk-tools.d.ts:2605-2609`)。[AD-036](0036-single-session-launch-process-and-live-stream.md) Decision 4 は承認の応答から `updatedInput` を構造的に除いた (正の構成 P2)
- Elicitation は query の options の `onElicitation` (`sdk.d.ts:1606-1626`。無ければ自動で断られる)、`request_user_dialog` は `onUserDialog` と `supportedDialogKinds` (:1628-1662) を要る。[AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) は options のキーの集合を固定した
- MCP・プラグイン・スキルの制御は `Query` のメソッドである (`mcpServerStatus` :2775、`reloadPlugins` :2838、`reloadSkills` :2846、`reconnectMcpServer` :2898、`toggleMcpServer` :2906、`setMcpServers` :2935)。AD-036 §4 P3 は `Query` のメソッドを `interrupt()` だけに限った。Constitution 検証の項目 16 の P3 の検査は 6 名の denylist で、上のどれも含まない
- `init` (`sdk.d.ts:5482-5543`) は毎ターンの最初に届き、`mcp_servers` の名前と状態を運ぶ。`commands_changed` はスラッシュコマンドの一覧の置き換え

本 ADR は O-5 が夜間の自走で起こした。本 ADR と spec 015 の U-1〜U-7 は 2026-10-05 に利用者が承認した。[AD-047](0047-session-meter-and-failure-reasons.md) (O-4。同日に accepted) を前提にする。

### 読み替える箇所

- AD-047 Decision 2 (`meter` は数・真偽・列挙・モデルの id だけ) を、本 ADR の Decision 3 の範囲で、形の検査を通った未信頼の名前と説明に広げる (spec 014 data-model §2)。AD-047 は proposed のうちに Consequences に本 ADR への参照を足す
- AD-035 Decision 1 (「未登録 toolName は必ず ToolFallback に落ちる」) の「登録」を、完全一致の表と `mcp__` の接頭辞の判定の 2 段とする (Decision 5)。どちらにも当たらない名前は ToolFallback に落ちる不変は保つ
- AD-036 §4 P3 は変えない。Decision 2 はそれを MCP・プラグイン・スキルに当てはめ、検査を広げる

## Decision

1. **問いに答える UI を O-10 に分ける。** `AskUserQuestion` の回答・Elicitation の form / URL・`request_user_dialog`・`elicitation_complete` の表示・composer のスラッシュコマンドの候補を、新しい feature O-10 (M3・依存 O-5) にする。O-10 の domain は利用者が決める (仮採用は session: 境界の ADR と制御の経路の持ち主)。O-10 は design の前に、AD-036 Decision 4 (承認の応答の `updatedInput` を、agents が SDK の元の入力に `answers` だけを足して組む制約付き射影。[AD-040](0040-provider-settings-constrained-projection.md) の `settings` の射影が先例) と AD-041 (g) (`onElicitation` / `onUserDialog` / `supportedDialogKinds`) の読み替えの ADR を起こす。問いの読み取り専用の表示と承認カードの暫定の注記は、境界を変えないので O-5 で行う
2. **MCP・プラグイン・スキルを操作しない (アプリ全体の決定)。** `Query` の `mcpServerStatus` / `reconnectMcpServer` / `toggleMcpServer` / `setMcpServers` / `reloadPlugins` / `reloadSkills` (と、それに当たる制御要求 `mcp_call` / `mcp_message`) を呼ばない (AD-036 §4 P3 の適用)。MCP サーバーの状態は `init` の `mcp_servers` で出す。項目 16 の P3 の `QUERY_MUTATION_METHODS` に上の 6 つと `rewindFiles` / `stopTask` / `seedReadState` / `streamInput` / `reinitialize` を足し、違反の fixture を置く (本 ADR が許可リストの変更の根拠)。P3 を正の形 (`interrupt` 以外を違反) に置き換えるのは項目 16 の持ち主に送る
3. **構成を `meter` で運ぶ。** AD-047 の `meter` に種類 `init-report` (`init` から) と `commands` (`commands_changed` から) を足す。運ぶ文字列は会話本文ではないが、**利用者の設定・作業フォルダ (`.claude/`)・MCP サーバー・プラグインの作者に由来する未信頼の文字列**である。名前は allowlist の正規表現、説明は無害化・Unicode の Cc / Cf / Zl / Zp の除去・切り詰めを通し、件数と 1 件のバイト数に上限を置く (正本は spec 015 data-model §2)。`cwd`・プラグインの `path`・`apiKeySource` は通さない。送るかの判定は変換後の値の全体で比べ、送ったときだけ基準を更新し、AD-047 の `meter` の上限に掛けない
4. **MCP の結果を表やグラフに写さず、画像・resource の印も出さない。** 結果は平文。印には tool-call の DTO の変更が要り、本文に印を差し込む形は偽の印を作れる
5. **tool の登録を 2 段にする。** 完全一致の表 (`Object.hasOwn`) → `mcp__` の接頭辞の判定 → ToolFallback。承認カードは MCP の tool の生の名前を切り詰めずに必ず出し、分けた見出しは補助にする (サーバー名に `__` を含みうるため)

## Consequences

- `SessionEvent` の種類は増えない (`meter` の中の種類が増える)
- O-10 が M3 に加わる。Tier A の `AskUserQuestion` / `elicitation` / `elicitation_complete` は M3 の完了の条件の残りとして O-10 に移る (O-5 で減るのは 2 行)
- アプリは MCP サーバーの再接続や認証を助けない。`failed` / `needs-auth` は Claude Code 側で確かめる・認証するよう案内する
- 過去ログの tool 名を実行中と同じ無害化に揃える (`transcript.ts:233`)
- ui charter の In scope の composer の slash commands の持ち主は O-10 になる

## Alternatives

- **応答の UI も O-5 に入れる** — 表示と権限ゲートの例外の設計が 1 つの spec に混ざり、FR が 20 を超える
- **`mcp_status` を呼ぶ・`failed` に再接続を出す** — AD-036 §4 P3 の読み替えの ADR が要る。`init` は毎ターン届くので鮮度は足りる (状態はターンの開始時点の値と表示する)
- **新しい `SessionEvent` の種類を足す** — O-4 と O-5 で種類が 2 つ増える
- **DTO に結果の種類のフィールドを足して画像・resource の印を出す** — `TRANSCRIPT_PART_FIELDS` とスキーマのテストの変更で、本 feature の範囲を超える

## Confirmation

- spec 015 の SC-002 / SC-005 (変換の単体・固定テスト・項目 16 の fixture・`git diff`)
- 対応表の O-10 の 4 行と、roadmap に O-10 の行 (範囲と 2 つの ADR の義務) があること
