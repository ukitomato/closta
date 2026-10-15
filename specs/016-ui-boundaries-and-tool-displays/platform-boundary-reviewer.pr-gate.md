# platform-boundary-reviewer Review: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-14
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Gate**: pr-gate Round 1

## 初回読了 viewpoint

- FR/SC:
  - FR-018 / SC-005: 項目 16 の `readFile`、`queryHandle` の型を絞る変更、IPC / options / PermissionRequest に差分が無いこと
  - FR-002 / FR-003 / FR-005: agents の `conversation_reset` の分岐と取り消し (`meter` の `retraction`)、稼働中のストアからの削除
  - FR-006 / FR-007: パスと URL を会話由来の本文として出す (AD-049 Decision 5)
- touched files に該当する charter / Confirmation: Principle I (renderer のパス API)、Principle II (`pathTail` が OS で分岐しないこと)、Principle III / AD-036 §4 P3 (項目 16)、Principle VII (`src/agents` が domain だけを import すること)、AD-004 (branded path を使わないこと)、AD-049 Decision 5 / 6
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

この PR は次の 4 つを変える。

- agents (`live-signals.ts` / `live-tool-results.ts` / `sdk-agent-session.ts`) が、`compact_boundary`・拒否・`informational`・`conversation_reset` の行と、`retraction` の `meter` を作る
- renderer に、ファイル・Web・Task の専用表示と、結果の状態と読み上げを足す
- 項目 16 の denylist に `readFile` を足し (21 → 22)、`queryHandle` の型を `Pick<Query,'interrupt'> & AsyncIterable<SDKMessage>` に絞る
- eslint の手書き element の一覧に新しいファイルを足す

code-gate の must_fix は 0 件なので、重複を除く対象は無い。should_fix の H-001 / H-002 (手書き element の一覧の件) は convention の範囲なので、もう一度は挙げない。

PB-1〜PB-7 で見た結果:

- **PB-1 (パス型)**: 該当なし
  - 新しい renderer のファイル群で、`node:path` / `process.platform` / `navigator.*` / `window.api` / `ipcRenderer` / `HostPath` / `RuntimePath` を Grep した。一致は 0 件
  - `path-tail.ts:10-17` は `/` と `\` の両方で切る文字列操作だけで、値を IPC に戻さない
  - 新しい element に `openPath` / `openExternal` / `href=` / `invoke(` は 0 件
- **PB-2 (単一インスタンス仮定)**: 該当なし
  - `running-session-store.ts` の `retractedIds` は `Map<sessionId, Set>` で、`close()` で消える (diff 6595 / 6672)
  - 閉じたセッションへのイベントは、`applyEvent` の先頭 (diff 6645) で弾かれる
  - agents 側の取り消しの記憶は、tracker のインスタンスごとに持つ
- **PB-3 (capabilities)**: 該当なし: diff は capabilities に触れていない
- **PB-4 (権限ゲート)**: 該当なし
  - `fallback_model` は `isMeterModelId` を通したうえで、行の `name` に入れるだけ (`live-signals.ts` diff 3741)
  - `permissionMode` / `setModel` の経路は無い。`Query` のメソッドの呼び出しは `interrupt` だけ (`sdk-agent-session.ts:549-550`)
- **PB-5 (多段パス変換)**: 該当なし: パスの変換は無い
- **PB-6 (永続環境)**: 該当なし: 書き込みは `process.stderr` への件数のログだけ (`sdk-agent-session.ts` diff 4117-4119)
- **PB-7 (ルールの網羅性)**: 次の 3 点を確認した。指摘は下の M-001 / L-001
  - eslint の変更 (diff 832-854) は、新しいファイルにルールを戻す向きの変更で、ルールを緩めていない
  - 項目 16 の `dotCall` (`check.mjs:922`) は `.readFile(` に一致する
  - `src/domain/session` の新しい import は同じ層の中だけ

## Findings

### [Medium] `queryHandle` を型で絞ったことを固定するものが無く、型を `Query` に戻しても tsc もテストも緑のまま (M-001) (scope: feature)

- **観察**:
  - `src/agents/sdk-agent-session.ts:373` で型を `Pick<Query, 'interrupt'> & AsyncIterable<SDKMessage>` に絞っている。FR-018 はこれを「ブラケット・参照の形を型で塞ぐ」手段として求めている
  - 一方、この型を固定する仕組みは見当たらない:
    - 同じファイルの型の網羅 (`:143-178`) は `Query` 全体の分類を見るだけで、`queryHandle` の型は見ない
    - `tests/docs/query-mutation-methods.test.ts:65-84` は集合と union の一致を見るだけ
    - `tests/` で `Pick<Query` / `queryHandle` / `ts-expect-error` を Grep すると、一致は `tests/rule-fixtures/expected.mjs:896,907` の文章だけ
  - そのため `:373` を `Query | null` に戻しても、tsc は通る
  - 分割代入 (`const { readFile } = queryHandle`) と変数のキーは、項目 16 の綴りの検査が見ない形である (`check.mjs:919-920`、`expected.mjs:889-894`)
- **同種事象探索**: `Pick<Query|queryHandle|ts-expect-error` を `tests/` で 2 件 (`tests/rule-fixtures/expected.mjs:896` / `:907`。どちらも文章で、検査ではない)。`queryHandle` を `src/agents/sdk-agent-session.ts` で 4 件 (`:373` / `:549` / `:622` / `:623`)
- **リスク/影響**: AD-049 Decision 6 / FR-018 の型による閉じ方が、後の変更で黙って外れうる。外れると、Principle III (AD-036 §4 P3) の backstop は綴りの検査だけに戻り、分割代入の形が通る。いま実害の経路は無い
- **推奨アクション**: `sdk-agent-session.ts` の型の網羅の隣に、型の固定を 1 行足す。例:
  ```ts
  const queryHandleIsNarrow: Equal<
    keyof NonNullable<typeof queryHandle>, 'interrupt' | typeof Symbol.asyncIterator
  > = true
  ```
  `queryHandle` は関数の中の `let` なので、型の別名 (`type QueryHandle = Pick<Query,'interrupt'> & AsyncIterable<SDKMessage>`) を module に出して、それに対して書く。そのうえで quickstart V-1 の計測経路に加える
- **根拠**: Constitution Principle III / AD-036 §4 P3 / AD-049 Decision 6 / spec FR-018
- **scope 根拠**: touched file の `src/agents/sdk-agent-session.ts` の中で直せる

### [Low] `UNDETECTED_NOTES['sdk-query-method-indirect']` の記録が、本 PR で型を絞った後の状態に追従していない (L-001) (scope: feature)

- **観察**: `tests/rule-fixtures/expected.mjs` の記録が、本 PR の変更の前の状態のまま残っている
  - `:896`: 「`Query` を持つのは … `queryHandle` 1 つ」のまま
  - `:899`: `QueryUnusedReadMethod` を「7 個」としている。実際は `readFile` が移ったので 6 個 (`sdk-agent-session.ts:167-173`)
  - `:905-908` の `howToClose`: 「`queryHandle` の型を … に絞る」を、まだ済んでいない手当てとして書いている。本 PR で済んでいる (`:373`)
- **同種事象探索**: `7 個|queryHandle` を `expected.mjs` で 3 件 (`:896` / `:899` / `:907`)
- **リスク/影響**: 検出しない形の記録が実装とずれる。後の reviewer が、型の閉じ方は未着手だと読み違える
- **推奨アクション**: `mitigatedBy` に「`queryHandle` の型を `interrupt` と反復に絞った (016 FR-018)」と書き、件数を 6 に直す。`howToClose` は「正の形への置き換え」だけを残す
- **根拠**: AD-049 Decision 6 / Principle XIV (記録の反映)
- **scope 根拠**: touched file の `tests/rule-fixtures/expected.mjs` で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `Pick<Query\|queryHandle\|ts-expect-error` in tests/ | 2 | tests/rule-fixtures/expected.mjs:896, :907 |
| M-001 | `queryHandle` in src/agents/sdk-agent-session.ts | 4 | src/agents/sdk-agent-session.ts:373, :549, :622, :623 |
| L-001 | `7 個\|queryHandle` in tests/rule-fixtures/expected.mjs | 3 | tests/rule-fixtures/expected.mjs:896, :899, :907 |
| (PB-1 確認) | `node:path\|process.platform\|navigator.*\|window.api\|HostPath\|RuntimePath\|ipcRenderer` in 新しい renderer のファイル群 | 0 | - |
| (PB-1 確認) | `openPath\|openExternal\|href=\|invoke(\|postMessage` in 新しい element | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 1
