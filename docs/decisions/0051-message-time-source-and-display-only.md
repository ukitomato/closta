---
status: proposed
date: 2026-10-16
id: AD-051
deciders: ukitomato
tags: [ui, session, sdk]
supersedes: []
superseded-by: []
---

# AD-051: メッセージの時刻の出所と、表示だけに使うこと

## Context

O-9 ([spec 017](../../specs/017-ui-conversation-time-and-activity/spec.md)) は、中央の本体のメッセージに時刻を、終わったターンに所要時間を出し、右のペインに会話の地図と活動の帯を出す。どれもメッセージの時刻 (`TranscriptMessageDTO.createdAt`) を読む。今の `createdAt` は過去ログ・実行中とも、すべての経路で `null` である。

時刻の出所には次の事情がある。

- **過去ログ**: `getSessionMessages` の返りの公開の型 `SessionMessage` (`sdk.d.ts:5903-5916`) は時刻を持たない。SDK 0.3.270 の実装 (`sdk.mjs:134`) は各記録の `timestamp` (ISO 8601) を返りに含めている。transcript の JSONL をアプリが自分で読むと、[AD-034](0034-transcript-read-path-and-process-boundary.md) の取得の経路と Principle IV (SDK 経由) を外れる
- **実行中の assistant**: `SDKAssistantMessage.timestamp?` (`sdk.d.ts:3386-3388`) がある。SDK の注記は「元のホストの時計なので表示だけに使い、並べ替えに使わない。古い emitter は省くので受信時刻に倒せ」と言っている
- **実行中のシステムイベントの行・tool の結果**: SDK の system 系の型は時刻を持たない
- **利用者の入力**: SDK は本文を返さない。renderer の稼働中のストアが楽観的に出している
- **assistant-ui**: `createdAt` を渡さないメッセージを「今」にする (`@assistant-ui/core` `thread-message-like.ts:115`)

本 ADR は O-9 が夜間の自走で起こした (spec 017 の U-2 / U-3 / U-8。未承認)。`TranscriptMessageDTO` の形・`TRANSCRIPT_MESSAGE_FIELDS`・`SessionEvent` の種類は変えない (値を埋めるだけ)。持ち主の判断 (U-1) は spec と session charter に書く。

## Decision

1. **過去ログは、`getSessionMessages` の返りの各記録の `timestamp` を読む。** 公開の型に無いフィールドなので、変換の入力の型 (`SessionMessageLike`) に任意のフィールドとして足し、未信頼の値として検査する。合成した Hook / task の行は最初の記録の時刻を持つ
2. **実行中は、SDK のメッセージの `timestamp` を使い、無ければセッションスレッドの受信時刻にする。** SDK が時刻を持たないもの (システムイベントの行・tool の結果だけのメッセージ) は受信時刻にする。同じ id の送り直しは最初の時刻を保つ
3. **利用者の入力は、renderer の稼働中のストアが SDK に渡した時刻にする。** 積まれた入力 (message queue) は送った時刻であり、積んだ時刻ではない
4. **時刻は未信頼として検査する。** タイムゾーン付きの厳密な ISO 8601 だけを受け、2020-01-01 より前と、受けた時点 + 1 日より後は捨てる。読めなければ `null` (今の表示と同じ)。検査は domain の 1 つの純関数で行い、過去ログと実行中が同じものを呼ぶ
5. **時刻は表示だけに使う。** メッセージを時刻で並べ替えない (記録の順のまま)。時計のずれを補正しない。所要時間が負になったら出さない。永続化しない (Principle X)
6. **renderer は assistant-ui の `createdAt` を読まない。** 変換が `metadata.custom.createdAt` に時刻の数を入れ、表示はそれだけを読む (`createdAt` の既定値「今」を時刻として出さない)
7. **ターンの所要時間は、1 つの時計どうしで引く。** 実行中は、renderer の稼働中のストアが受け取った時点 (ホストの時計) を renderer の写しの中だけで持ち (`metadata.custom.receivedAt`。DTO には載せない)、送信の時刻と最後に受けた時点で引く。過去ログは記録の時刻どうしで引く。表示の時刻 (Decision 2) と所要時間の時計を混ぜない (spec 017 の U-8)

## Consequences

- 過去ログは SDK の公開の型の外に頼る。SDK の版を上げて `timestamp` が返りから消えても、`null` に倒れて今の表示に戻るだけで例外にはならない。気づくために、`docs/ui-coverage.md` の「SDK を上げたときの手順」に確認を 1 行足す
- 実行中の表示の時刻は、ランタイム (WSL ディストロ・docker endpoint のコンテナ) の Claude Code の時計 (SDK の値) とアプリのホストの時計 (受信時刻・送信時刻) が混ざりうる。表示の時刻と活動の帯はそのずれを補正しない。所要時間は Decision 7 で 1 つの時計どうしで引くので、ずれを含まない
- 同じターンの所要時間が、実行中 (ホストの受信時刻。IPC と port の遅れを含む) と過去ログ (記録の時刻) で少し違いうる
- `SDKUserMessage` / `SDKUserMessageReplay` の `timestamp` は読まない (実行中の user は tool の結果を運ぶだけで、replay は表示していない)
- session の契約は値の範囲だけが広がる (session charter の Key concepts と Related ADRs に記録する)

## Alternatives

- **transcript の JSONL をアプリが自分で読む** — AD-034 と Principle IV を外れる
- **過去ログは時刻を出さない** — 過去の会話を読む Journey で時刻が無く、地図と帯が過去ログで描けない
- **実行中は受信時刻だけを使う** — SDK の値を捨て、supervisor の遅れが時刻に乗る
- **renderer がすべてのメッセージに受信時刻を入れる** — 過去ログと実行中で出所が変わり、port と decoder の遅れも乗る
- **時刻で並べ替える** — SDK の注記に反する。時計が戻ったときに会話の順が壊れる
- **所要時間も表示の時刻で引き、負のときだけ隠す** — ランタイムの時計がホストより進んでいると、その差が所要時間に乗り、負にならないので隠れない (spec 017 の design-gate H-001)

## Confirmation

- spec 017 の SC-001 (検査の表と各経路の単体)・SC-002 (`deriveTurns` の時計が 2 つの固定テスト。Decision 7)・SC-005 (DTO の形と境界の固定テスト)
- spec 017 の quickstart V-3 の 1: 実機の過去ログ 1 件で時刻が出る。出なければ Decision 1 の前提が崩れたので、本 ADR を見直す (過去ログの時刻を出さない形に戻すか、別の出所を探す)
- SDK の版を上げる PR が、`docs/ui-coverage.md` の手順に従って過去ログの時刻を確かめていること
