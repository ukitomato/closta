---
status: accepted
date: 2026-10-17
id: AD-053
deciders: ukitomato
tags: [session, sdk, mcp, security, ipc, scope]
supersedes: []
superseded-by: []
---

# AD-053: query の options に `onElicitation` を足し、`onUserDialog` / `supportedDialogKinds` は渡さない (AD-041 (g) の読み替え)

## Context

O-10 ([spec 018](../../specs/018-session-answer-ui-and-composer-commands/spec.md)) は、MCP サーバーが求める入力 (Elicitation の form / URL) と `request_user_dialog` に答える UI を持つ。範囲と義務の正本は roadmap の O-10 の行 (015 spec FR-013) で、[AD-048](0048-session-config-display-and-answer-ui-split.md) Decision 1 が「design の前に AD-041 (g) の読み替えの ADR を起こす」と決めた。

調べた事実 (SDK 0.3.270):

- Elicitation は query の options の `onElicitation` で受ける (`sdk.d.ts:1606-1626`)。無ければ、Hook が扱わない Elicitation は自動で断られる。要求は `serverName`・`message`・`mode` (`form` / `url`)・`url`・`elicitationId`・`requestedSchema` (form)・`title` / `displayName` / `description` (`sdk.d.ts:628-647`)。応答は MCP の `ElicitResult` (`action`: `accept` / `decline` / `cancel` と `content`)。callback は `signal` (中断) を受ける (`sdk.d.ts:1370-1378`)
- URL の Elicitation が終わると `system` / `elicitation_complete` (`mcp_server_name`・`elicitation_id`) が届く (`sdk.d.ts:4765-4772`)
- `request_user_dialog` は `onUserDialog` と `supportedDialogKinds` で受ける (`sdk.d.ts:1627-1662`)。**宣言した種類だけが届き、宣言が無ければ届かない** (CLI は宣言の無い種類を「描けない」とみなし、ダイアログの無い振る舞いに落ちる。`refusal_fallback_prompt` なら従来の拒否のエラーでターンが終わる)。**payload と結果の形は種類ごとに決まり、SDK の型には無い** (`payload: Record<string, unknown>`・`result: unknown`。`sdk.d.ts:9119-9144`)。SDK のパッケージにも種類ごとの形の定義は無い (CLI は WSL 内の native の実行ファイル)
- [AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) は query の options のキーを `{permissionMode, canUseTool, pathToClaudeCodeExecutable, spawnClaudeCodeProcess, abortController, settings, model, effort}` に固定し、`session-core.ts` の `QUERY_OPTION_KEYS` の pin テストがリテラルで守る
- agents → renderer の一方向のデータは `SessionEvent` (`SESSION_EVENT_KINDS` 8 種)、renderer → main → agents の制御は検証済みの IPC の `SessionControl` だけ (AD-036 Decision 2)
- 外部の URL を OS に渡す最終の防御は main の `openExternalIfHttp` (`src/main/app/window.ts`。http(s) だけ) で、renderer の新しいウィンドウの要求 (`setWindowOpenHandler`) と遷移 (`will-navigate`) から呼ばれる

本 ADR は O-10 が夜間の自走で起こした (spec 018 の U-2 / U-3 / U-7 / U-8)。本 ADR と spec 018 の U-1〜U-10 は 2026-10-17 に利用者が承認した。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-041 (g): `QUERY_OPTION_KEYS` の 8 キー | `onElicitation` を足して 9 キーにする。`onUserDialog` / `supportedDialogKinds` は足さない (Decision 4) |
| AD-036 Decision 2 の `SessionEvent` (agents → renderer) と `SessionControl` (renderer → main → agents) の語彙 | `SessionEvent` に種類 `elicitation-request` を、`SessionControl` に種類 `respond-elicitation` を足す (Decision 2)。port は一方向のまま、応答は main の検証済み IPC を通す |
| AD-048 Decision 1 の「`request_user_dialog` (`onUserDialog`。`supportedDialogKinds` は allowlist)」(roadmap の O-10 の行 (2)) | allowlist は空から始め、空のあいだは callback も渡さない (Decision 4) |

## Decision

1. **`onElicitation` を query の options に足す。** escalation-neutral である: 権限モード・tool の集合・env を変えず、MCP サーバーに利用者が入れた値を返すだけ。`buildQueryOptions` のオブジェクトリテラルに 1 キーを足し、`QUERY_OPTION_KEYS` の pin テストを 9 キーに直す
2. **要求と応答は今の 2 つの経路に 1 種類ずつ足す。** agents は `onElicitation` の要求を形の検査に通し、`SessionEvent` の `elicitation-request` で renderer に送る (相関の id は agents が採番する。承認の要求と同じ)。renderer の応答は `SessionControl` の `respond-elicitation` で main を通り、main は形 (id・`action` の列挙・`content` の件数と値の型と長さ) を明示の述語で検証する。中身がスキーマに合うかは、要求を持つ agents が最後に確かめ、合わなければ断る (`decline`)。通すフィールド・スキーマの部分集合・上限の正本は spec 018 data-model
3. **入力を持ち続けない。** Elicitation の入力は永続化しない・ログに出さない・transcript の `message` に載せない。応答した時点・中断 (`signal`)・セッションの終了で renderer と agents の保持を捨てる。答えられないスキーマ (部分集合の外) は、form を描かず「断る」「取り消す」だけを出す
4. **`request_user_dialog` は今は受けない。** `supportedDialogKinds` の allowlist は domain の固定の定数として持ち、空から始める。空のあいだは `onUserDialog` も `supportedDialogKinds` も options に載せない (CLI はダイアログの無い振る舞いに落ちる。`refusal_fallback_prompt` は従来の拒否のエラーになり、O-6 の拒否の行が出る)。種類を足すのは、その種類の payload と結果の形を確かめた feature で、足すときに本 ADR を読み替える ADR を起こし、2 つのキーを `QUERY_OPTION_KEYS` に足す
5. **URL は今の経路だけで開く。** URL の Elicitation の URL は agents が http(s) だけを通し (他の scheme は「開けない URL」として form と同じく断る・取り消すだけ)、renderer はリンクとして出して、開くのは今の新しいウィンドウの要求 → `openExternalIfHttp` の経路に任せる。URL を開くための新しい IPC を作らない
6. **`elicitation_complete` は表示だけ。** agents は O-2 のシステムイベントの行 (`message`) で「URL での手続きが終わった」行を作る。読むのは `mcp_server_name` (形の検査を通したもの) と `elicitation_id` (形の検査を通したものを行の id にだけ使う。待っている要求・カードとは照合せず、カードを外さない。カードが残っているのは SDK の callback がまだ応答を待っている要求だけだから。spec 018 U-8) で、何かを操作しない

## Consequences

- MCP サーバーの Elicitation (form / URL) にアプリから答えられる。今の「自動で断られる」は無くなる
- `SessionEvent` の種類が 8 → 9、`SessionControl` の種類が 1 つ増える (session の契約の拡張。session charter に記録する)。今の main は制御の種類ごとに専用の IPC のチャネルと capability のメソッドを持つので、応答を運ぶチャネル `respondElicitation` が 1 つ増える (`IPC_CHANNELS`・`ClostaCapability`・preload・チャネルの集合の固定テスト。spec 018 U-7)。URL を開くチャネルは足さない (Decision 5)。O-8 の観測点 `receivedMessages` は `message` だけを数えるので、`elicitation-request` は数えず、`elicitation_complete` の行は数える
- 利用者が form に入れた値は MCP サーバーに渡る。アプリは値の意味を解釈しない (MCP の仕様は form で秘密を求めることを禁じるが、サーバーが守るとは限らない。アプリは持ち続けないことで面を狭める)
- `request_user_dialog` は届かない。対応表の `request_user_dialog` (Tier B) は `表示不要` にし、理由に本 ADR を書く。拒否の後に fallback のモデルで再試行するかを聞くダイアログ (`refusal_fallback_prompt`) は出ない

## Alternatives

- **`onUserDialog` を渡し、`refusal_fallback_prompt` を宣言する** — payload と結果の形が SDK の型に無く、推測で答えると CLI の流れを誤らせる。宣言しなければ CLI が安全側 (ダイアログの無い振る舞い) に落ちる
- **`onUserDialog` を渡し、全部を `cancelled` で答える** — SDK の説明は「宣言していない種類には答えてはならない」とし、宣言が空なら届かない。callback を渡す意味が無い
- **Elicitation の要求を `permission-request` に載せる** — 承認の要求のフィールド (`toolName` / `input` / `scope`) と応答 (`allow` / `deny`) に合わず、`PermissionRequest` の型を広げる
- **URL を開く IPC を足す** — `openExternalIfHttp` に到る経路が増え、main の最終の防御の前に別の入口ができる
- **読み替えずに自動で断られるままにする** — Tier A の行 (`elicitation`・`elicitation_complete`) が `後続` のまま残り、M3 が閉じない

## Confirmation

- spec 018 の SC-003 / SC-004 / SC-010 (`QUERY_OPTION_KEYS` の pin テスト (9 キー・`onUserDialog` / `supportedDialogKinds` を含まない)・`SESSION_EVENT_KINDS` の pin テスト・main の検証の負の fixture・入力の目印の値が永続化・ログ・`message` に 0 件)
- quickstart で、実機の MCP サーバーの Elicitation (form / URL) と `elicitation_complete` の届き方を記録する (起こせなければ未確認として残す)
