# security-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-17
**Reviewer**: security-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-007 (2 つの query option: Hook のイベントと subagent の本文が新しく stream に乗る)、FR-002 / FR-003 (Hook 名を伏せる規則)、FR-004 / FR-005 (`local_bash` の名前を `Bash` の argsText から取る)、FR-006 (`background-tasks` の meter。id と種類だけ)、FR-008〜FR-011 (実行中と過去ログの入れ子。本文の無害化)、FR-013 (項目 14 の呼べるファイルの制限)、SC-001 / SC-002 / SC-003 / SC-004
- touched files に該当する charter / Confirmation: AD-054 Decision 3 (増えたメッセージは既存の許可リストを通す。subagent の text / thinking は sanitizeBody)、AD-055 Decision 1 / 3 (`read-transcript.ts` だけで読む。上限を置く)、011 data-model §3 手順 4 (実行中の `user` メッセージは tool_result 以外のブロックを送らない)、AD-034 (取得プロセス)
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (H-001 は AD-054 Decision 3 と 011 data-model §3 に触れるが、指摘は secret の露出の観点に限る)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: security の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

本 feature は session の契約を 4 点で広げる。(1) query option の 2 キー (`includeHookEvents` / `forwardSubagentText`)。どちらも `true` のリテラル。(2) Agent SDK の許可リストに `listSubagents` / `getSubagentMessages` を足し、呼べるのは `read-transcript.ts` だけ。(3) agents が subagent のメッセージを入れ子にして根を送り直す。(4) meter の種類 `background-tasks`。IPC・preload・main・BrowserWindow・`SessionEvent` の種類は変えない (SC-004) ので、SEC-2 / SEC-3 / SEC-5 / SEC-7 に新しい面は無い。SEC-6 は、入れ子の text が既存の `MarkdownText` を通る (`src/renderer/src/components/markdown-text.tsx:55` の `safeUrlTransform`。rehype-raw なし) ことと、FE-030 の XSS fixture で手当てされている。SDK の `getSubagentMessages` (`sdk.mjs:202` の `NZ`) は sessionId を `Xe()` で確かめ、agentId を列挙の結果と完全一致で引く。agentId からの path traversal は無いことを確かめた。残る懸念は 2 点ある。新しく流れる subagent の user 本文で secret が露出しうること (H-001) と、過去ログの合成に全体の大きさの上限が無いこと (M-001)。

## Findings

### [High] 実行中の subagent の user の text を入れ子に足す規則が、主ループの「user の本文は送らない」(O-2) を破る。Hook の出力などの合成メッセージが DOM に出る経路を開く (H-001) (scope: feature)

- **観察**:
  - `specs/019-ui-hooks-tasks-subagents-and-notices/data-model.md:153` は「入れ子の中の user の text → 子として足す」と書く。`isSynthetic` などで絞る規則が無い。
  - これに対し、主ループは `src/agents/sdk-agent-session.ts:641` (「tool_result ブロックだけを読み、user の本文は送らない」) と `specs/011-ui-coverage/data-model.md:109` (手順 4) で、実行中の user の本文を一切送らない。
  - spec FR-008 (`spec.md:198`) は「O-2 の規則を継ぐ」としており、data-model と食い違っている。
  - AD-054 Decision 3 (`docs/decisions/0054-…md:35`) が無害化の対象に挙げるのは「subagent の text / thinking」(assistant 側) だけで、user の本文には触れていない。
  - SDK の型 (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:5698-5707`) は、`SDKUserMessage` が「CLI 自身が会話に足す user-role の内容」であり、`isSynthetic?` を持つと書く。
- **同種事象探索**: `入れ子の中の user の text|isSynthetic|synthetic` を spec_dir で検索して 1 件 (data-model.md:153)。`isSynthetic|isMeta` を `src` で検索して 0 件 (今のコードはどこでも区別していない)。
- **リスク/影響**: CLI が subagent の会話に注入する合成の user メッセージ (Hook の `additionalContext`・system reminder・添付の中身など) が、親の `Agent` の入れ子として renderer に届き、DOM に出る。user / assistant の本文に `redactSecrets` は当たらない (data-model §3.2「`redactSecrets` は system だけ」)。そのため Hook の stdout 由来の文字列や環境の値が伏せられずに表示される。これは SC-001 / US-1 AC3 (「Hook の出力本文が DOM と `SessionEvent` に 0 件」) と矛盾しうる。CLI がこれらを subagent の user メッセージとして実際に emit するかは実機で確かめていないので、Critical ではなく High にとどめる。
- **推奨アクション**:
  - (a) data-model §3.1 の行を「入れ子の中の user は tool_result だけを読む (主ループと同じ。011 data-model §3 手順 4)」に直す。subagent への依頼の文は、親の `Agent` の呼び出しの args に既に出ている。
  - または (b) user の text を出すなら `isSynthetic === true` を捨てる規則を足し、過去ログの側 (`getSubagentMessages` の user の行) にも同じ判定を当てる。
  - どちらの場合も BE-031 のテストに「`isSynthetic` の user と、Hook の出力の目印を持つ user の text が、emit した `SessionEvent` に 0 件」を足す。quickstart の V-4 / V-5 に「subagent の user メッセージに合成のものが届くか」を記録する項目を足す。
- **根拠**: Constitution V (資格情報を表示・永続化しない)、AD-054 Decision 3、011 data-model §3、CWE-200
- **scope 根拠**: 本 feature の data-model §3.1 と BE-031 で直せる

### [Medium] 過去ログの subagent の補いに合計の大きさの上限が無い (M-001) (scope: feature)

- **観察**: data-model §3.2 と AD-055 Decision 3 が置く上限は件数だけ (32 件 × 500 メッセージ) で、frame の合計の大きさの上限が無い。1 記録の text / argsText / result はそれぞれ 200,000 バイトまで (`src/domain/session/sanitize-body.ts:12` / `:15`)。最悪で 16,000 記録 × 数百 KB の frame が MessagePort 経由で renderer に渡る。実行中の側には 1 MB の送り直しの上限 (§3.1) がある。
- **リスク/影響**: 巨大な subagent を持つセッションを開くと、取得プロセスと renderer のメモリが膨らむ (可用性)。主の記録も今は上限を持たないが、本 feature はその量を最大で数十倍にする。
- **推奨アクション**: §3.2 に subagent の補いの合計バイトの上限を置く (例: 主の記録とは別に数 MB。超えた列は入れず、親の `truncated` を立てる)。BE-032 / BE-033 にその単体テストを足す。
- **根拠**: CWE-400、AD-055 Decision 3 (上限を置く)

### [Medium] H-001 の経路を検出するテストが無い (M-002) (scope: feature)

- **観察**: SC-001 の目印のテスト (BE-010 / FE-011) は、Hook の system メッセージの `output` / `stdout` / `stderr` しか見ていない。BE-031 / BE-032 のテストには、入れ子の user 本文や合成メッセージに目印が混ざらないことを確かめる観点が無い (`tasks.md:82`, `:84`)。
- **リスク/影響**: H-001 の経路で出力が漏れても、既存のテストは緑のまま通る。
- **推奨アクション**: H-001 の推奨のテストを BE-031 と BE-032 の両方に足す (実行中と過去ログ)。

### [Low] `read-transcript.ts` が sessionId の形を確かめずに 2 つの新しい API に渡す (L-001) (scope: feature)

- **観察**: `src/agents/read-transcript.ts:54-59` の `decodeRequest` は、sessionId が空でないことしか確かめていない。`getSubagentMessages` は SDK の内部で UUID かを確かめる (`sdk.mjs:202` の `NZ` の `Xe(e)`)。`listSubagents` の側も確かめるかは見ていない。agentId は SDK が列挙の結果と完全一致で引くので traversal は無い。
- **推奨アクション**: BE-033 で、2 つの API を呼ぶ前に sessionId の UUID の形を確かめる (多重の防御)。agentId は `listSubagents` が返したものだけを渡すことをテストで固定する。

### [Low] `hook_event` が許可リストを通らずに見出しと読み上げに出る (L-002) (scope: feature)

- **観察**: `src/domain/session/system-event.ts:144` は `hook_event` を `oneLine` で 1 行にするだけで、`detail` に入れる。本 feature はこの値を、伏せた Hook の見出し「Hook ({hook_event}) {n}」(data-model §1.3) と読み上げの判定 (§1.4) に使う。名前を伏せた行で、見出しに残る唯一の会話外の文字列になる。
- **推奨アクション**: `hook_event` を SDK の HookEvent の既知の名前の allowlist に当てる。外れた値は空にして「Hook {n}」にする。FE-010 に負例を足す。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `入れ子の中の user の text\|isSynthetic\|synthetic` (spec_dir) / `isSynthetic\|isMeta` (src) | 1 / 0 | specs/019-ui-hooks-tasks-subagents-and-notices/data-model.md:153 |
| M-001 | `MAX_\|BODY_MAX_BYTES =` (transcript.ts / sanitize-body.ts) | 合計の上限 0 件 | src/domain/session/sanitize-body.ts:12, :15 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 2
