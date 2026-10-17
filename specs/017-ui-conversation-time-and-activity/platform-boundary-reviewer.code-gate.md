# platform-boundary-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17
**Reviewer**: platform-boundary-reviewer
**Gate**: code-gate iteration 1
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001, FR-002, FR-003, FR-004, FR-005, FR-007 (U-8: 所要時間は 1 つのホストの時計で引く), FR-006 / FR-008〜FR-016 (renderer の表示と記録。プラットフォーム境界の外), SC-001 / SC-002 (AC6) / SC-005
- touched files に該当する charter / Confirmation: `src/agents/{live-signals,live-tool-results,read-transcript,sdk-agent-session}.ts` (Principle VII)、`src/domain/session/{transcript,live-message,transcript-time}.ts` (Principle I / II)。runtime / isolation の charter に当たる touched file は無い。AD-003 / AD-004 / AD-012 に当たる変更も無い
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: runtime / isolation の charter に当たる touched file が無い
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

プラットフォーム境界に関わるのは `src/agents/` の 4 ファイルへの変更 (`Date.now()` と引数を渡すだけ) と、ランタイムの時計とホストの時計のずれの扱い (U-8 / AC6。所要時間はホストの時計だけで引いている) の 2 点。`process.platform`・パス・`HostPath`/`RuntimePath`・`permissionMode`・`capabilities` に触れる行は 0 件。IPC・preload・main の変更も無い。

- PB-1 該当なし: パス型もパスを運ぶフィールドも無い。IPC を越えて新しく運ぶのは既存の `createdAt: number | null` だけ
- PB-2 該当なし: 新しいモジュールスコープの状態は無い (`createCenterConversationStore` は factory)
- PB-3 該当なし: `capabilities` に触れていない
- PB-4 該当なし: `permissionMode` はテスト fixture 1 か所のみ
- PB-5 該当なし: パス変換に触れていない
- PB-6 該当なし: docker / wsl / ファイル書き込みの追加 0 件。時刻は永続化しない
- PB-7: 新ファイルは既存ディレクトリのみ。`path` / `electron` / `node:*` の別名 import・動的 import なし

## Findings

### [Low] 実行中の時刻の検査で、ランタイムの時計の進みが 1 日を超えると受信時刻に替わることを直接確かめるテストが無い (L-001) (scope: feature)

- **観察**: `src/domain/session/live-message.ts:960` は `parseMessageTime(msg.timestamp, receivedAt) ?? receivedAt`。上限比較 `ms > now + DAY_MS` の `now` はホストの受信時刻。`sdk-agent-session.test.ts` は「timestamp あり」「なし」のみで、実行中経路の「範囲外 → 受信時刻」のテストは見つからなかった
- **同種事象探索**: diff 内の `toLiveAssistantMessage(` 呼び出し 2 件
- **リスク/影響**: 小さい。将来 `?? receivedAt` が消えると時刻が黙って消える
- **推奨アクション**: `live-message.test.ts` に範囲外 timestamp → `createdAt === receivedAt` の 1 件を足す
- **根拠**: spec の Clarifications / Edge Cases / AD-051
- **scope 根拠**: touched file の中で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `toLiveAssistantMessage(` (diff 内) | 2 | src/domain/session/tool-result.test.ts:981, src/domain/session/live-message.test.ts |
| (PB 確認) | import / process.platform / HostPath / RuntimePath / permissionMode / capabilities / persist (diff) | プラットフォーム境界に当たる一致 0 | .code-gate.diff:3349 (fixture) |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
