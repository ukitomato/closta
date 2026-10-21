---
status: accepted
date: 2026-10-21
id: AD-059
deciders: ukitomato
tags: [session, sdk, supervisor, resume]
supersedes: []
superseded-by: []
---

# AD-059: セッションの再開 — query の options の `resume`・会話の id の運び方・`resume-failed`

本 ADR は X-9 ([spec 021](../../specs/021-session-resume/spec.md)) の plan で起こした。spec の U-1〜U-8・plan の P-1〜P-11 と本 ADR は、2026-10-21 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用し、2026-10-21 に accepted とした。規則の詳細の正本は [data-model.md](../../specs/021-session-resume/data-model.md) で、本 ADR は決定と読み替えだけを書く。調査は [research.md](../../specs/021-session-resume/research.md)。

## Context

X-9 は、終わった会話の続きを Closta から話せるようにする (過去の区画の行・稼働中の区画の終了済みと失敗した行から、Agent SDK の `resume` で再開する)。そのために 3 つの契約を広げる必要がある。

- query の options のキー集合は [AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) で `QUERY_OPTION_KEYS` に固定され、`src/agents/session-core.test.ts` の pin テストがリテラルで守る。集合を変えるには ADR が要る ([AD-036](0036-single-session-launch-process-and-live-stream.md) §4 P1)。今は 11 キー ([AD-053](0053-elicitation-callback-and-user-dialog.md)・[AD-054](0054-query-options-hook-events-and-subagent-text.md) の読み替えの後)
- Closta は SDK の会話の id を追っていない (O-6 は `conversation_reset` の `new_conversation_id` を読まない。session charter の Key concepts)。稼働中の行から再開するには、セッションスレッドが知る会話の id を main まで運ぶ経路が要る。セッションスレッド → 調停役スレッド → main の message の種類は [AD-043](0043-single-supervisor-session-threads-and-session-limit.md) の構成で、本文 (`OpaqueBody`) と状態通知と終わりの通知だけである
- X-5 ([spec 009](../../specs/009-session-supervisor-and-multi-session/spec.md)) FR-013 は「失敗したセッションを自動で再開しない (再開は X-6)」とした。roadmap は 2026-10-19 に resume と失敗したセッションの再開を X-6 から X-9 に移した
- 再開する会話が見つからないとき、今のセッションスレッドの失敗の理由は `process-crashed` になり、原因 (記録の削除・config ディレクトリの違い) を示せない。失敗の理由のキーの集合は [AD-047](0047-session-meter-and-failure-reasons.md) Decision 1 の 18 である

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-041 (g) / AD-036 §4 P1 / AD-053 / AD-054 (`QUERY_OPTION_KEYS` の 11 キー) | `resume` を足し 12 キーにする (Decision 1)。他のキーと「escalation-neutral だけを足す」の判定は変えない |
| AD-043 のセッションスレッド → 調停役スレッド → main の message の種類 | 会話の id の通知 (`conversation`) を 1 つずつ足す (Decision 2)。本文の経路 (`OpaqueBody`) と状態通知の形は変えない |
| AD-047 Decision 1 (`LaunchFailureReason` の 18) | `resume-failed` を足し 19 にする (Decision 3) |
| X-5 FR-013 の「再開は X-6」 | 利用者の操作による再開は X-9 が持つ。自動で再開しないことは変えない (Decision 4) |
| AD-041 (h) の「fork / resume / rename / tag / delete は X-6」 | resume だけを X-9 が持つ (roadmap の 2026-10-19 の切り出しの記録)。fork / rename / tag / delete は X-6 のまま |

## Decision

1. **`QUERY_OPTION_KEYS` に `resume` を足す。** 値は会話の id (UUID) で、main の検証 (`validate.ts`)・セッションスレッドの起動の値の検査 (`decodeLaunchOptions`)・`buildQueryOptions` の assert の 3 か所で `isValidSessionId` を通す。新しい起動では渡さない。`resume` は transcript を読み込んで同じ会話を続けるだけで、権限モード・tool の集合・env・MCP サーバーを変えない (escalation-neutral)。権限モードは安全 3 値のまま。`forkSession` / `sessionId` / `resumeSessionAt` / `continue` は足さない (分岐と途中からの再開は X-6 の範囲・`continue` は会話を名指さない)
2. **会話の id はセッションスレッドが最初の `system/init` の `session_id` から取り、main だけが持つ。** セッションスレッドは形を検査して `conversation` の message を 1 回送り、調停役スレッドは窓で束ねずに main へ送る (デコーダは `supervisor-protocol.ts`)。main の起動の service が registry と退避の表 (件数の上限つき) に持ち、**永続化しない・値をログに出さない・renderer に値を渡さない** (renderer には「再開できるか」の真偽だけを別のチャネルで送る)。再開の起動では要求の id を受け付けの時点で持つ。Closta の `sessionId` は再開でも新しく採る (会話の id と混ぜない)
3. **`LaunchFailureReason` に `resume-failed` を足す。** 再開の起動で、最初の `system/init` を受ける前に終了処理の外で子が終わった・stream が例外で終わった・stream が例外なく終わったときの理由。もう 1 つ、再開の起動の最初の `init` が安全 3 値の外の権限モードを報告したときも、この理由で失敗にして子を止める (fail closed。escalation-neutral の前提の backstop)。セッションスレッドの JS 例外 (`fatalSink`) と初回の `init` の後の異常終了は今どおり `process-crashed`。再ログインの導線は出さない
4. **再開は利用者の操作でだけ行う。** 失敗した行に「再開」(会話の id があるとき) か「やり直す」(無いとき) を出し、自動では再開しない。再開は新しい起動と同じ起動ゲート・同時実行数の上限・WSL / Win32 の起動の値の組み立てを通る。引き継ぐ軸 (フォルダ / ランタイム / Provider) は変えられず、変えて続けるのは分岐で X-6 に残す。同じ会話を Closta の中で同時に 2 本動かさない (main の registry で判定する)

## Consequences

- `IPC_CHANNELS` が 4 つ増える (過去の行の軸の解決・再開の起動・それまでの会話の読み取り・再開できることの通知)。それまでの会話の読み取りは AD-034 の経路 (短命の取得プロセスと renderer の port) をそのまま使い、main は会話の id と読む列挙対象を解くだけ
- `SessionStatusUpdate` と `SessionEvent` の種類は変わらない
- 過去の行の Provider は列挙対象の config ディレクトリから解くため、元の会話が `config-dir` 以外の Provider (API キーなど) で既定の config ディレクトリに書かれていた場合、再開は Provider なしの資格情報で起きる (会話は見つかる)。WSL の別のユーザのホームの会話は、`claude` がディストロの既定のユーザで動くため見つからず `resume-failed` になりうる (起動の前には弾けない)
- Closta の外 (端末の `claude --resume`) で同じ会話が動いているかは見分けられない
- `/clear` の後の会話の id の扱いは X-6 のまま (Decision 2 は最初の `init` だけを見る)

## Alternatives

- **起動のたびに SDK の `sessionId` の option で Closta の `sessionId` を会話の id にする** — 再開した会話の id が元の行の `sessionId` と同じになり、稼働中の行の鍵が衝突する
- **renderer が会話の id を持つ** — renderer から main に id が届く経路ができ、同じ会話の 2 本目の判定を renderer の表示に頼ることになる
- **状態通知に会話の id か「再開できる」を載せる** — 状態通知は会話由来の値を持たない契約で、キーの集合は supervisor → main の受信規則の一部。セッションにつき 1 回の値なので別の通知で足りる
- **失敗の理由に今の `process-crashed` を使う** — claude の不具合と読まれ、記録の削除・config ディレクトリの違いに気付けない

## Confirmation

- `src/agents/session-core.test.ts` の pin テストが 12 キー (AD-041 (g) の 8・AD-053 の 1・AD-054 の 2・本 ADR の 1) と一致する。`buildQueryOptions` と `decodeLaunchOptions` の単体テストで、UUID の形でない `resume` を拒否する
- `src/domain/session/agent-session.test.ts` の固定テストが `LAUNCH_FAILURE_REASONS` の 19 と一致する
- `supervisor-protocol` の単体テストで、`conversation` の 2 つの decoder が UUID の形でない値を捨てる
- main の起動の service の単体テストで、同じ会話の 2 本目 (動いている行・準備の途中) と退避の表の消し方を確かめる
- quickstart V-1 (WSL と Win32 × 過去・終了済み・失敗の 6 通り) で、`claude` が前のターンの内容に答え、同じ transcript に追記されることを実機で記録する。V-3 で `init` の `session_id` が要求の id と同じことを、V-4 で会話が見つからないときに `resume-failed` になることを、V-9 で昇格の権限モードで作った会話を再開しても実効の権限モードが選んだ安全 3 値のままであることを記録する。セッションスレッドの単体テストで、再開の `init` が安全 3 値の外のモードを報告すると `resume-failed` で失敗する
