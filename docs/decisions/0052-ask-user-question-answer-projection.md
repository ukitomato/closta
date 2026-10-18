---
status: accepted
date: 2026-10-17
id: AD-052
deciders: ukitomato
tags: [session, sdk, security, permission, scope]
supersedes: []
superseded-by: []
---

# AD-052: `AskUserQuestion` の回答を、承認の応答の `updatedInput` に元の入力と `answers` だけの制約付き射影で返す (AD-036 Decision 4 P2 の読み替え)

## Context

O-10 ([spec 018](../../specs/018-session-answer-ui-and-composer-commands/spec.md)) は、Claude Code の `AskUserQuestion` にアプリから答えられるようにする。範囲と義務の正本は roadmap の O-10 の行 (015 spec FR-013) で、[AD-048](0048-session-config-display-and-answer-ui-split.md) Decision 1 が「design の前に AD-036 Decision 4 の読み替えの ADR を起こす」と決めた。

調べた事実 (SDK 0.3.270):

- `AskUserQuestion` の回答は、承認の応答 (`canUseTool`) の `updatedInput` に入れて返す。入力の型は `questions` (1〜4 件。各問いに `question`・`header`・`options` (2〜4 件の `label` / `description` / `preview?`)・`multiSelect`) と、承認の部品が集めた回答 `answers?: { [問いの文]: string }`・`annotations?` (`sdk-tools.d.ts:1058-2630`)
- [AD-036](0036-single-session-launch-process-and-live-stream.md) Decision 4 の正の構成 P2 は、`toPermissionResult` の出力を `{behavior, message}` の完全部分集合に固定し、`updatedInput` と `updatedPermissions` (6 variant) を構造的に締め出した。今の承認の応答は `updatedInput` を持たないので、`AskUserQuestion` を許可しても選択は Claude に届かない (O-5 は承認カードにその注記を出した。015 spec FR-004 / FR-005)
- `updatedInput` は任意の tool の入力の書き換えである。tool を問わず許すと、承認した後に `Bash` の `command` を差し替えるなど、承認の意味を変える経路になる (AD-036 が P2 で閉じた理由)
- 先例: [AD-040](0040-provider-settings-constrained-projection.md) は、昇格レバーの `Options.settings` を「2 キー限定の制約付き射影」(型 + 実行時の assert + 項目 16 の backstop) に限って許した

本 ADR は O-10 が夜間の自走で起こした (spec 018 の U-1)。本 ADR と spec 018 の U-1〜U-10 は 2026-10-17 に利用者が承認した。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-036 Decision 4 (P2): `toPermissionResult` の出力は `{behavior, message}` の完全部分集合。`updatedInput` を一切出力しない | `AskUserQuestion` の許可に限り、出力に `updatedInput` を 1 つ足す。中身は Decision 2 の射影だけ。他の tool と拒否の出力は `{behavior, message}` のまま。`updatedPermissions` は全 tool で出さないまま |
| AD-036 Decision 4 の検証 (b) (`toPermissionResult` の出力のキー集合 ⊆ {behavior, message}) と 005 contracts C-4 | tool ごとの出力のキー集合の pin テストに読み替える (Decision 4)。005 contracts C-4 には本 ADR への pointer を置く |
| 005 data-model §5 の `PermissionDecision` (`requestId` / `outcome` / `scope` / `message?`) | 回答 (`answers`。問いの位置ごとの文字列) を任意のフィールドとして足す (Decision 3) |

## Decision

1. **`updatedInput` を出すのは `AskUserQuestion` の許可だけにする。** 判定は agents の `canUseTool` が SDK から受けた tool 名そのもの (無害化する前の値) の完全一致で行う。`mcp__x__AskUserQuestion` や無害化で同じ見た目になる名前は当たらない。拒否・回答の無い許可・他の tool の出力は今の `toPermissionResult` のまま
2. **`updatedInput` は、SDK が `canUseTool` に渡した元の入力に `answers` だけを足した値にする。** 元の入力は agents の `canUseTool` の中に留まり、renderer へ往復しない (renderer に届くのは今どおり表示用に無害化した文字列)。射影の関数は domain の `toPermissionResult` の隣に置く純関数で、次を満たす:
   - `answers` のキーは、元の入力の `questions[i].question` の文字列そのもの。renderer から受けた文字列をキーに使わない (renderer は問いの位置で回答を送る。無害化で問いの文が変わっても照合が崩れない)
   - 回答の数は問いの数と一致する。値は文字列で、長さに上限を置く (上限の値の正本は spec 018 data-model)。外れたら射影せず、拒否として返す (回答を黙って落として許可しない)
   - 元の入力のほかのキー (`questions`・`metadata` など) は変えない。`annotations` (利用者のメモ・選んだ preview) は足さない
   - 元の入力に既に `answers` があっても、アプリが組んだ値で置き換える
3. **renderer → main → agents の経路は今の承認の経路 (`respond-permission`) を使う。** 新しい IPC のチャネルを作らない。main は回答の形 (配列・件数・文字列・長さ) を明示の述語で検証し (`as` を使わない)、問いの文との照合は元の入力を持つ agents が行う (main は本文の経路を持たない。AD-036 Decision 2)
4. **境界を固定テストで守る。** (a) `toPermissionResult` と射影の出力のキー集合を tool ごとに pin する (`AskUserQuestion` の許可は `{behavior, updatedInput}`、それ以外は ⊆ `{behavior, message}`)。(b) `updatedInput` のキー集合は「元の入力のキー ∪ {`answers`}」。(c) `updatedPermissions` は全 tool で 0。(d) 項目 16 に backstop を足す: SDK を保持するファイル (`AGENT_SDK_IMPORT_DIRECTORIES`) に `updatedInput` の綴りが、射影の関数の呼び出しの外に現れたら違反にする (AD-040 の `assertHelperSettings` と同じ形)

## Consequences

- `AskUserQuestion` の回答が Claude に届く。O-5 の承認カードの注記 (「許可しても選択は Claude に届きません」) は、回答の UI に置き換わる
- 承認の応答の形が tool によって 2 通りになる。P2 の「型として `updatedInput` を持たない」は、「`AskUserQuestion` の射影の型だけが `updatedInput` を持つ」に弱まる。代わりに tool 名の完全一致・元の入力を往復させないこと・pin テスト・項目 16 の backstop で閉じる
- 回答の文字列は利用者の入力で、Claude の会話 (transcript) に入る。アプリは永続化もログへの出力もしない (会話の正本は Claude Code。Principle X)
- `PermissionDecision` に任意のフィールドが 1 つ増える (session の契約の拡張。session charter に記録する)

## Alternatives

- **全 tool に `updatedInput` を許す** — 承認の後に入力を差し替える経路になる (AD-036 が P2 で閉じたもの)
- **renderer から `updatedInput` の全体を受ける** — renderer が問いや他のキーを書き換えられる。元の入力を agents に留める方が狭い
- **問いの文をキーとして renderer から受ける** — 無害化で文が変わると照合が崩れ、照合の失敗を利用者が直せない
- **回答を承認と別の経路 (新しい `SessionControl` の種類) で送る** — 承認の要求と回答の相関を 2 か所で持つ。`AskUserQuestion` は SDK の上でも承認の要求として届く
- **読み替えずに、拒否して本文で答える運用のまま** — O-5 の暫定の姿。Tier A の行 (`AskUserQuestion`) が `後続` のまま残り、M3 が閉じない

## Confirmation

- spec 018 の SC-001 / SC-002 (射影の純関数の単体・tool ごとの pin テスト・負の fixture (別の tool 名・似た名前・件数違い・長すぎる値・既にある `answers`)・項目 16 の backstop の違反 fixture)
- quickstart で、回答を送った `AskUserQuestion` の tool_result の中身を実機で記録する (O-5 の quickstart V-3 から預かった項目)
