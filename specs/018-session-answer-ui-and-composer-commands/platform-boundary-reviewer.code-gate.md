# platform-boundary-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18T23:30:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Round**: 2 (code-gate iter 2, pr-gate の round で直したあとに reviewing から再実行)

## 初回読了 viewpoint

- FR/SC: 今回の diff が触れるのは FR-009 (composer のコマンドの候補) と SC-006 (`createSlashMatcher` / e2e の正の対照)、および Elicitation と AskUserQuestion のカードの表示 (項目ごとのエラー、スクロール、未回答の印)。FR-003 / FR-004 / FR-005 / FR-007 / FR-008 (権限の応答と IPC の境界) はこの iter で変わっていない。
- touched files に該当する charter / Confirmation: runtime / isolation の charter は touched files に入っていない。Principle III の権限ゲート (`autoModeSafe`)、AD-003 / AD-004 / AD-012 の領域にも diff は無い。`src/main/app/e2e-capability.ts` は E2E のスタブで、追加は `meter`/`commands` の emit 1 件だけ (src/main/app/e2e-capability.ts:307-315)。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

今回の diff は次のとおり。
- renderer の UI: slash の matcher を一覧と照合する `createSlashMatcher`、Elicitation の項目ごとのエラーと `aria-invalid`、カード本体のスクロール、AskUserQuestion の未回答の印
- E2E のスタブ: `commands` の meter を 1 件流す。合わせて e2e/ime.spec.ts に正の対照を足した
- charter と roadmap の追記: ADR の参照 (AD-052 / AD-053 / AD-057)

観点ごとの結果:
- PB-1: 該当なし。パス (`HostPath` / `RuntimePath`) は新しい IPC にも永続化にも流れていない。stub の emit は `JSON.stringify` した SessionEvent で、中身はコマンド名の文字列だけ。
- PB-2: 該当なし。stub の `sessions` / `emit` は `createE2eSupervisorConnection()` の closure の中にあり (e2e-capability.ts:268-305)、sessionId ごとに分かれている。`createSlashMatcher` は commands ごとに `useMemo` で作るので、module スコープの状態は持たない。
- PB-3: 該当なし。`capabilities` を表明する箇所は diff に無い。
- PB-4: 該当なし。権限モード・`respondPermission`・`respondElicitation` の経路は変わっていない。matcher の変更で、一致しない `/xxx` は候補を奪わずにそのまま送られる。ただし送信は既存の send-prompt の経路で、権限の入口は増えていない。
- PB-5: 該当なし。パス変換を変えていない。
- PB-6: 該当なし。volume / `--restart` / commit / ホストへの書き込みは diff に無い。
- PB-7: 新しい import や新しいディレクトリは無く、lint の取りこぼしは増えていない。前回 round の F の 2 件は check.mjs と fixtures が変わっていないので持ち越す。

## Findings

### [Medium] 項目 16 の P2 の検査は `AGENT_SDK_IMPORT_DIRECTORIES` しか走査しない。`updatedInput` を組む domain の関数が検査の外にある (M-001) (scope: feature) — 前 round から未解決
- **観察**: `scripts/constitution/check.mjs:918-926` は今回も変わっていない。`for (const key of ['updatedInput', 'updatedPermissions'])` が走査するのは `sdkScope` のファイルだけで、組み立ての本体は `src/domain/session/agent-session.ts` にある。
- **同種事象探索**: check.mjs で `updatedInput` を検索して 2 件 (:780 のコメント、:919-920 の P2)。前 round と同じ。
- **リスク/影響**: AD-052 の「`updatedPermissions` は 0」を機械で守っているのは、単体の pin テストだけになっている。
- **推奨アクション**: P2 の走査対象に `src/domain/` を足す。`updatedInput` は `agent-session.ts` の 1 ファイルだけを実名で許す。
- **根拠**: AD-052 Decision 4 (c)(d) / Principle III
- **scope 根拠**: touched files (check.mjs) の中で直せる。AD-050 により Medium は gate では直さない。

### [Medium] P2 の `updatedPermissions` の側に違反 fixture が無い (M-002) (scope: feature) — 前 round から未解決
- **観察**: tests/rule-fixtures で `updatedPermissions` を検索して 0 件。
- **同種事象探索**: 上記のとおり 0 件。
- **リスク/影響**: ループの 2 つ目のキーが実際に発火するかを CI が確かめていない。文字列を組み立てて迂回する形 (`obj['updated' + 'Input']`) が検出されないことも、UNDETECTED_NOTES に書かれていない。
- **推奨アクション**: `tests/rule-fixtures/b-equivalent/sdk-updated-permissions.ts.fixture` と、`expected.mjs` の対応する行を足す。
- **根拠**: AD-052 Decision 4 (d) / AD-024
- **scope 根拠**: touched files の中で直せる。

### [Low] ランタイムの名前空間の Elicitation の URL をホストのブラウザで開くことが、isolation charter に書かれていない (L-001) (scope: system) — 前 round から未解決
- **観察**: `docs/domains/isolation/charter.md` で `Elicitation|openExternal|loopback` を検索して 0 件。今回の charter の追記は session / ui の charter だけ。
- **同種事象探索**: 上記のとおり 0 件。
- **推奨アクション**: isolation charter の Open Questions に、loopback の URL はランタイムによってはホストから届かないことを 1 行書く。
- **根拠**: AD-003 / AD-012
- **scope 根拠**: touched files の外の charter への追記。

## H (テスト / regression) の補足

- 今回の diff にプラットフォーム境界の振る舞いの変更は無く、壊れうる既存の境界も無い。根拠は 3 つ。e2e-capability.ts の追加は stub の emit だけ。`launch` の戻り値 (`{ ok, port, generation }`) は変わっていない (e2e-capability.ts:316)。追加された SessionEvent は既存の `meter`/`commands` の型をそのまま使っていて、型は tsc が守る。
- M-001 / M-002 を検出するテスト (fixture) はまだ無い。M-002 そのものがその欠落の指摘なので、H には重ねて数えない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `updatedInput` in scripts/constitution/check.mjs | 2 | check.mjs:780, :919-920 |
| M-002 | `updatedPermissions` in tests/rule-fixtures | 0 | — |
| L-001 | `Elicitation\|openExternal\|loopback` in docs/domains/isolation/charter.md | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
- Round inheritance: resolved from 1: 0 / unresolved: 3 (M-001, M-002, L-001) / new: 0
