# platform-boundary-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17
**Reviewer**: platform-boundary-reviewer
**Gate**: pr-gate Round 1 (system scope)
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 / FR-004 (時刻の出所と検査。`src/agents/` と `src/domain/session/` の変換)。FR-005 (境界を広げない)。FR-007 (U-8: 所要時間は 1 つの時計どうしで引く)。FR-012 (活動の帯の時計)。SC-001 / SC-002 (AC6) / SC-005。FR-006 / FR-008〜FR-011 / FR-013〜FR-016 は renderer の表示と記録なので、本 reviewer のスライスの外
- touched files に該当する charter / Confirmation: Principle VII (`src/agents/{live-signals,live-tool-results,read-transcript,sdk-agent-session}.ts`。新しい import は `@domain/session/transcript-time` だけで、このファイルは import を持たない)。Principle I / II (`src/domain/session/transcript-time.ts`・`transcript.ts`・`live-message.ts`。パスも OS 分岐も無い)。AD-003 (ランタイムが複数あるときの時計の出所)。AD-012 (docker endpoint のコンテナの時計)。runtime / isolation の charter に当たる touched file は無い。AD-004 (パス型) に当たる変更も無い
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`parseMessageTime` の未信頼入力の検査も B)
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter の Out of scope に当たる touched file が無い
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

本 PR は既存の `createdAt: number | null` に値を入れる。値の出所は 3 つある。過去ログでは、`getSessionMessages` の返りに含まれるが公開の型に無い `timestamp` を読む。このとき検査の「今」は `read-transcript.ts:74` の `Date.now()` で、ホストの時計である。実行中は SDK の `timestamp` を使い、無ければ `sdk-agent-session.ts:625` でメッセージごとに 1 回取る受信時刻を使う。利用者の入力は renderer のストアの時計を使う。renderer はこれらからターン・地図・活動の帯を組む。所要時間を引くときは、`metadata.custom.receivedAt` (renderer の時計) を始まりと終わりの両端で使う。この値は DTO にも IPC にも載せない。プラットフォーム境界に関わる行は、`src/agents/` の 4 ファイル (`Date.now()` を取って引数で渡すだけ) と、ランタイムの時計とホストの時計のずれの扱いの 2 点だけである。`process.platform`・パス・`HostPath`/`RuntimePath`・`permissionMode` の処理・`capabilities`・IPC / preload / main に触れる変更は無い。

固有観点ごとの確認:

- **PB-1 (パス型の消失)**: 該当なし。IPC / MessagePort を新しく越える値は、既存の `createdAt` (epoch ms の数) だけである。`receivedAt` は renderer の写しの中だけにある (`src/renderer/src/features/chat/message-time.ts:41-51`)。地図の「入力の先頭」は本文の text で、パスとして解釈されない (`turns.ts:56-65`)
- **PB-2 (単一インスタンスの仮定)**: 該当なし。`createCenterConversationStore` は factory で、`ShellLayout` が `useState` で 1 つ作る (`AppShell.tsx:5698` 付近の diff)。module スコープに状態は無い。`conversationKey` は、稼働中が `live.sessionId`、過去が `selectedRowKey` (`targetKey\0sessionId`。ランタイムの識別子を含む) で、`CenterPane.tsx` の diff で確認した。キャッシュのキーにランタイムの識別子が欠ける箇所は無い。テスト fixture の `runtimeId: 'wsl:Ubuntu'` (`running-session-store.time.test.ts`) は値として使うだけである
- **PB-3 (capabilities の虚偽表明)**: 該当なし。`AgentRuntime` の実装と `capabilities` に触れていない
- **PB-4 (権限ゲートの迂回)**: 該当なし。`permissionMode` が出てくるのはテスト fixture (`live-signals.test.ts` の `launchPermissionMode: 'default'`、`running-session-store.time.test.ts` の CONFIG) だけで、プリセット・resume / fork・CLI 引数の経路は変わらない
- **PB-5 (多段パス変換)**: 該当なし。パス変換と bind mount を扱わない
- **PB-6 (永続環境)**: 該当なし。docker / wsl / ファイル書き込みの追加は 0 件。時刻・ターン・区間は永続化しない (`center-conversation.ts` の冒頭コメント、AD-051)
- **PB-7 (lint ルールの網羅性)**: 新しいファイルは既存のディレクトリ (`src/domain/session/`・`src/renderer/src/features/{chat,shell}/`) だけに置かれ、既存のレイヤ規則の対象に入る。`path` / `electron` / `node:*` の別名 import、`require`、動的 import は diff に無い。agents の新しい依存先 `transcript-time.ts` は import を 1 つも持たないので、Principle VII の間接 import の穴を新しく作らない。OS による分岐も無い (`Intl.DateTimeFormat('ja-JP', …)` と `Date` のローカル時刻だけ。`message-time.ts:59-85`)

所要時間の時計 (design-gate で M-001 として指摘した点) の確認: `src/renderer/src/features/chat/turns.ts:92` と `:98` は、ターンの始まりが `receivedAt` を持つと `clock = 'received'` にし、終わりも `readReceivedAt` だけで取る。`receivedAt` を持たないメッセージは `endedAt` を更新しないので、時計は混ざらない。過去ログは両端とも `readMessageTime` で引く。FR-007 / U-8 のとおりになっている。

## Findings

### [Low] 実行中の活動の帯は、利用者の入力 (ホストの時計) と応答 (ランタイムの時計) を同じ軸に並べる。ランタイムの時計がずれていると区間の位置が前後する (L-001) (scope: feature)

- **観察**: `src/renderer/src/features/chat/activity-bins.ts:52` は `readMessageTime(message)` だけで区間を決めている。実行中、利用者の入力の `createdAt` はストアの `now()` (ホスト。`running-session-store.ts` の diff 5601-5608)。assistant の `createdAt` は SDK の `timestamp` (ランタイムの中の Claude Code の時計。`live-message.ts:3633`)。data-model.md:71 は「表示の時刻・活動の帯 (§4) は `readMessageTime` のまま」と決め、spec の Edge Cases は表示の時刻が前後しうることを認めている。ただし既知の限界として書かれているのは表示の時刻だけで、活動の帯の区間がずれることは書かれていない
- **同種事象探索**: `readMessageTime|readReceivedAt|createdAt` を `activity-bins.ts` に対して検索して 1 件 (`:52`)。所要時間 (`turns.ts:92,98`) は U-8 で解消済みで、時計が混ざるのは活動の帯だけ
- **リスク/影響**: 表示だけに使う値で、移り先は「区間の中で記録の順が最初のもの」なので、操作が壊れることはない。WSL2 の VM の時計がスリープ明けに数分ずれた場合、または docker endpoint のコンテナの時計がずれている場合に、実行中の帯で、応答が入力より前の区間に描かれることがある。同じ会話を過去ログで開くと両端とも記録の時刻になるので、帯の形が変わる
- **推奨アクション**: 最小の修正は、data-model §4 か spec の Edge Cases の「時計がずれている」の項に「実行中の活動の帯も同じ理由で区間が前後しうる」と 1 文足し、既知の限界として残すことである。直すのであれば、実行中 (`receivedAt` を持つメッセージ) だけ区間の時刻に `receivedAt` を使う方法がある (AD-051 Decision の範囲内。DTO は変わらない)
- **根拠**: AD-003 (ランタイムは複数ありうる)、AD-012 (docker endpoint)、AD-051 (U-8 の「1 つの時計どうし」の考え方)
- **scope 根拠**: touched file (`activity-bins.ts` / data-model) の中で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `readMessageTime\|readReceivedAt\|createdAt` (activity-bins.ts) | 1 | src/renderer/src/features/chat/activity-bins.ts:52 |
| (PB 確認) | diff 内の import / process.platform / HostPath / RuntimePath / permissionMode / capabilities / 永続化 | プラットフォーム境界に当たる一致 0 (permissionMode はテスト fixture 2 件のみ) | src/agents/live-signals.test.ts (diff 3084), src/renderer/src/features/session/running-session-store.time.test.ts (diff 5415) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
