---
status: proposed
date: 2026-10-04
id: AD-049
deciders: ukitomato
tags: [ui, session, sdk, scope]
supersedes: []
superseded-by: []
---

# AD-049: 会話の境界の表示・拒否の取り消し・Agent plan の markdown・tool のパスと、O-11 への分割

## Context

O-6 ([spec 016](../../specs/016-ui-boundaries-and-tool-displays/spec.md)) は `docs/ui-coverage.md` で `後続: O-6` の 30 行 (Tier A 14) と、O-2 の pr-gate と実機の目視 (V-4) から回した宿題を持つ。1 つの spec では FR が 20 を超え、ADR の判断 (`includeHookEvents`・`getSubagentMessages`・Background task の一覧の持ち主) が混ざる。

あわせて次の点は、先行の決定に触れる。

- SDK は拒否で置き換えた応答を「届いた時点で外せ」(assistant の `supersedes`。`sdk.d.ts:3370`)・「transcript の状態から外せ」(`retracted_message_uuids`。`sdk.d.ts:5044`) と指示する。今の稼働中のストアはメッセージを外す経路を持たず、agents は tool の結果が届くと同じ id でメッセージを送り直す
- `informational` の `content` は、SDK の説明では Hook の feedback (UserPromptSubmit の Hook の block reason など) と slash command の出力である (`sdk.d.ts:4853`)。O-2 は「Hook の出力本文を出さない」と決めた (011 spec の Edge case、glossary の Hook)
- [AD-035](0035-tier-a-tool-display-and-subagent-nesting.md) Decision 6 は、`MarkdownText` が text part の context に依り任意の文字列を受けられないため、Agent plan を plain text で描くと決めた
- tool の入力と結果のパスは会話由来の本文で、WSL・Windows 形式・UNC が混ざる。UNC の判定の唯一の入口 (`classifyRawPath`。[AD-032](0032-unc-shape-classification-by-separator-count.md)) は renderer から届かない

本 ADR は O-6 が夜間の自走で起こした。**未承認である (spec 016 の U-1〜U-7)。** [AD-046](0046-app-shell-layout.md) / [AD-047](0047-session-meter-and-failure-reasons.md) / [AD-048](0048-session-config-display-and-answer-ui-split.md) (proposed) を前提にする。

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-035 Decision 6 (Agent plan を plain text で描く) と Consequences の Trade-off | markdown で描く (Decision 4)。D6 の前提 (任意の文字列を受けられない) には `TextMessagePartProvider` で答える |
| [AD-044](0044-ui-coverage-assignment.md) Decision 4 (B 節の照合は O-6。D 節は「アプリが作る表示の経路」) / Decision 6 の回答 (実行中の task の一覧の要否は O-6 で判断) | 持ち主を O-11 にする (Decision 1)。D 節に「A 節の行の一部の機能の表示の経路 (Tier A の残りを M3 の件数に数えるための行)」も置く。AD-044 の本文は変えない |
| AD-047 Decision 2 (`meter` は数・真偽・列挙・モデルの id だけを運ぶ) と O-4 data-model §2 の上限・後始末 | `retraction` は message の id の列を運び、上限・間引き・`finish()` の破棄に掛けない (Decision 2) |
| O-2 (011 spec の Edge case・glossary の Hook) の「Hook の出力本文を出さない」 | `informational` の `content` は例外として、伏せ字を通して出す (Decision 3)。過去ログは今も `system` の本文をそのまま出しているので、伏せ字を当てる |

## Decision

1. **O-11 に分ける。** 一般の Hook と `includeHookEvents`・`get_hooks_listing`、Background task の一覧の要否と `background_tasks_changed`、後から背景に移った task、シェルの Background task の見分け、実行中の subagent の入れ子と Agent handoff、Tier B の知らせの類、Checkpoints の表示、File element、`server_tool_use` / `web_search_tool_result`、B 節の機械照合、過去ログへの本 feature の行の変換、V-4 の未記録の項目の確認を、新しい feature O-11 (M3・`ui`・依存 O-6) にする。O-11 の Tier A の 3 つ (一般の Hook・後から背景に移った task・実行中の subagent の入れ子) は対応表の D 節に `後続: O-11` で立て、M3 の完了は O-11 を待つ。O-11 は design の前に次の ADR を起こす: `includeHookEvents` ([AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) の読み替え)、`getSubagentMessages` (AD-035 Decision 3 の読み替えと Agent SDK の呼び出しの許可リストの追加)、`get_hooks_listing` を呼ぶなら [AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P3 の読み替え
2. **拒否で置き換えた応答を実行中の transcript から外す。** agents は assistant の `supersedes` (届いた時点) と `model_refusal_fallback` の `retracted_message_uuids` (ターンの終わり) から id の列 (形の検査・1 件に 128 件まで、超えたら分ける) を AD-047 の `meter` の種類 `retraction` で送る。O-4 の上限と間引きに掛けない。agents の tool の結果の追跡と renderer の稼働中のストアは、取り消した id を覚えて戻さない。`supersedes` で外してからターンの終わりの拒否の行が届くまで、理由の行は無い。過去ログは記録のまま
3. **`informational` の本文を出す (O-2 の規則の例外)。** 秘密の形 (URL の資格情報・webhook のパス・`Bearer`・秘密の名前の代入・既知のトークンなど) を伏せ字にする純関数を domain に置き (秘密の綴りの正本)、無害化・1 行・O-2 の切り詰めを通す。見出しは「知らせ」(SDK は Claude Code 自身の状態の行・Hook・コマンドの出力を同じ型で送るので、出所を断定しない)。コマンド向けの `mayCarrySecret` は使わない (止まった理由が分からないと判断を誤る。Tier A)。過去ログの `system` の本文にも同じ伏せ字を当てる
4. **Agent plan を markdown で描く。** plan の文字列を `TextMessagePartProvider` で text part の context に包み、R-3 の `MarkdownText` (生 HTML を描かない・URL の allowlist) をそのまま通す。新しい markdown の描画口を作らない。markdown で見えなくなる本文のために「原文」の切り替えを付ける
5. **tool の入力と結果のパスは本文として出す。** アプリのパスの値ではないので R-2 FR-042・AD-029・AD-032 を当てず、UNC を判定も除去もしない。AD-025:181 / [AD-028](0028-session-enumeration-process-and-unc-handoff.md) §3 規則 4 の対象は列挙・登録・永続化の経路が渡すパスの値で、AD-034 の本文の経路は R-3 以来その外にある (範囲の確認で、読み替えではない)。見出しはパスの末尾だけを `/` と `\` の両方で切り出す (表示だけ。ホスト OS で分けない)。本文のパスに操作 (開く・選ぶ) を付けない。`WebFetch` の見出しは host だけにする (パスの末尾が秘密の webhook があるため)
6. **task・チェックポイントを操作しない。** E 節の `rewind_files` / `stop_task` / `background_tasks` は表示不要とし (AD-036 §4 P3・AD-048 と同じ)、`Query` の `readFile` / `backgroundTasks` / `reloadOutputStyles` を `QUERY_MUTATION_METHODS` に足して集合を固定テストにする。`sdk-agent-session.ts` の `queryHandle` の型を `interrupt` と非同期の反復だけに絞り、項目 16 が見ないブラケット・参照の形を型で塞ぐ

## Consequences

- M3 の完了の条件から O-6 の Tier A 14 行が消え、O-11 の Tier A 3 行が D 節に立つ
- `meter` の種類に `retraction` が加わる (O-4 data-model §2 の検証の表に `messageIds` の行。AD-047 の Consequences に本 ADR への参照)
- 稼働中のストアに初めて「削除」の経路ができる (session charter に記録)
- 過去ログを開いたとき、取り消された応答は記録どおり残りうる (実行中と過去ログで見え方が違いうる。V-3 で確かめる)
- 伏せ字は既知の形だけを捕まえる。漏れの型が見つかれば data-model の正本に足す

## Alternatives

- **全部を O-6 に** — FR が 20 を超え、ADR の判断が混ざる
- **O-11 を `session` に** — ADR の義務は session の境界にあるが、O-11 の中身は表示が主
- **O-11 の 3 行を M3 の完了の条件に入れない** — Tier A の 3 つが出ないまま M3 が閉じる
- **取り消しを外さず印を付ける** — SDK の指示 (transcript の状態から外す) に反し、拒否された部分の応答が会話の一部に見える
- **`SessionEvent` に新しい種類 `retraction` を足す** — 種類の pin を変える。`meter` の上限から外せば同じ確実さで届く
- **`informational` を出さない** — 止まった理由が分からない
- **Agent plan を plain text のまま** — plan の構造 (見出し・箇条書き) が読めない
- **UNC の接頭辞を renderer で落とす** — 判定が 2 か所に割れ、AD-032 が退けた方式になる

## Confirmation

- spec 016 の SC-001 / SC-002 / SC-005 (固定テスト・項目 16 の fixture・伏せ字の fixture・過去ログの `system` の本文の伏せ字のテスト)
- Decision 5: FE-020 のテスト (WSL・Windows 形式・UNC のパスを本文のまま出し、renderer に UNC の綴りが無い)
- O-11 の design の前に、Decision 1 の ADR が起きていること
