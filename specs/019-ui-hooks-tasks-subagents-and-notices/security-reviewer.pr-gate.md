# security-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-19
**Reviewer**: security-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-007: query option `includeHookEvents` / `forwardSubagentText` (リテラル true)
  - FR-002 / FR-003: Hook 名の allowlist と、伏せた名前の見出し
  - FR-004 / FR-005: 後から背景に移った task。`bashCommandName` で名前を出す
  - FR-006: `background-tasks` の meter。id と種類だけを運ぶ
  - FR-008〜FR-011: 実行中と過去ログの入れ子。user の text は出さない (U-11)
  - FR-013: SDK の許可リスト 5 つ
  - SC-001 / SC-002 / SC-003 / SC-004
- touched files に該当する charter / Confirmation:
  - AD-054 Decision 3 (増えた本文は sanitizeBody を通す)
  - AD-055 Decision 1 / 3 (`read-transcript.ts` だけで呼ぶ。上限を置く)
  - AD-056 Decision 2 (description を運ばない)
  - 011 data-model §3 手順 4 (user の本文は送らない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: security の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

**新しい攻撃面は無い。** 差分は IPC・preload・main・BrowserWindow・`spawn` に触れていない (`src/main/**` と preload は touched files に無い)。このため SEC-2 / SEC-3 / SEC-5 / SEC-7 に新しい面は無い。

**SEC-6 (XSS)**
- `src/renderer/src/components/assistant-ui/elements/subagent.aui.tsx` は、入れ子の text と reasoning の描画を plain text の `<p>` から `MarkdownBody` (既存の `MarkdownText` の包み) に変えた。
- 入れ子の本文は主ループの assistant の本文と同じ信頼度なので、新しい種類の露出ではない。
- 既存の防御を確かめた。
  - `MarkdownText` は rehype-raw を使わず、URL を `safeUrlTransform` (`markdown-text.tsx:55`) で絞る。
  - 窓の遷移は `window.ts:65` の `setWindowOpenHandler` と `:76` の `will-navigate` が制御する。
- テストで固定されている: `markdown-body.test.tsx` が javascript: / file: / vbscript: / data: / 生 HTML / リモート画像を負例で確かめる。
- 入れ子の tool の表示 (`toToolCallPartProps`) は `addResult` / `resume` を何もしない関数にしている。`AskUserQuestion` も表示だけなので、入れ子から応答を送る経路は無い。

**design-gate の H-001 (入れ子の user の text が secret を出しうる) は解消している。**

| 経路 | user の扱い | 固定するテスト |
|---|---|---|
| 実行中 | `applyUserMessage` が tool_result だけを読む | `sdk-agent-session.test.ts` の `LEAK-USER-TEXT` (`isSynthetic: true` を含む) |
| 過去ログ | `transcript.ts` の `convertBlocks` が、subagent の user の記録から tool_result 以外を捨てる | `transcript.test.ts:614-628` の `LEAK-` の目印 |

**secret の露出は 3 経路とも抑えている。**
- task の description: `toBackgroundTaskEntries` と decoder が落とす。`meter.test.ts` の `SECRET-DESC` と `sdk-agent-session.test.ts` の `LEAK-DESC` / `LEAK-DESCRIPTION` で固定。
- Hook の出力本文・終了コード: 行に出ない。`system-event.test.ts` と `sdk-agent-session.test.ts` の `HOOK-OUTPUT` / `7777` / `Bearer` で固定。
- `hook_progress`: 送らない。

**SDK の呼び出し。** `listSubagents` / `getSubagentMessages` は `read-transcript.ts` だけで呼ぶ。agentId は `listSubagents` が返した空でない文字列だけを、32 件まで渡す (`read-transcript.test.ts:587-593` で固定)。subagent ごとの失敗は捨て、例外の本文を frame に載せない。

**H (自分の担当範囲の regression)。**
- 下の Medium / Low はどれも design-gate から持ち越した既知の項目で、新しい退行ではない。
- 既存の経路の退行は見当たらない。
  - 主ループの tool_result の埋め方: 直下の呼び出しは `withToolResults` のまま。
  - 孤児の扱い: 主の記録は今どおり。
  - subagent の tool_result: 列の中の表 (`localCalls`) にだけ埋める。主ループの結果を上書きしない。

## Findings

### [Medium] 過去ログの subagent の補いに、合計の大きさの上限が無い (M-001) (scope: feature)

- **観察**:
  - `src/agents/read-transcript.ts:74-95` の `readSubagentRecords` は件数で絞るだけ (32 subagent × 500 メッセージ)。
  - `src/domain/session/transcript.ts:384` の `insertSubagentList` も、`parentTc.children` に足すときに大きさを見ない。
  - 1 つの記録の本文・args・result は、それぞれ `sanitizeBody` の上限 (200,000 バイト) まで入る。
  - 実行中の側には 1 MB の送り直しの上限がある (`live-tool-results.ts` の `nest`)。過去ログの側には同じ上限が無い。
- **同種事象探索**:
  - `RESEND_RESULT_MAX_BYTES|MAX_BYTES` を `src/domain/session/transcript.ts` / `src/agents/read-transcript.ts` で検索 → 合計の上限 0 件
  - design-gate.md:92 の M-10 として記録されたまま
- **リスク/影響**: 巨大な subagent を持つセッションを開くと、取得プロセスと renderer のメモリが膨らむ (CWE-400。可用性)。
- **推奨アクション**:
  - `insertSubagentList` に、subagent の補いの合計バイト数の上限を置く。超えたら以後の子を足さず、親の `truncated` を立てる (実行中の U-10 と同じ形)。
  - `transcript.test.ts` に上限のテストを足す。
- **根拠**: AD-055 Decision 3 (上限を置く)、CWE-400
- **scope 根拠**: touched files の `transcript.ts` / `read-transcript.ts` で直せる。AD-050 により Medium は持ち越し

### [Low] `read-transcript.ts` が sessionId の形を確かめずに 2 つの新しい API に渡す (L-001) (scope: feature)

- **観察**: `src/agents/read-transcript.ts:61` の `decodeRequest` は、sessionId が空でないことしか確かめない。その値を `:77` の `listSubagents(sessionId)` と `getSubagentMessages` にそのまま渡す。SDK 側の UUID の検査に頼っている。
- **同種事象探索**: `record.sessionId` を `read-transcript.ts` で検索 → 1 件 (:61)。design-gate.md:106 の L-09
- **推奨アクション**: 2 つの API を呼ぶ前に、sessionId を UUID の形で確かめる (多重の防御)。
- **根拠**: CWE-20

### [Low] `hook_event` が allowlist を通らずに、伏せた Hook の見出しに出る (L-002) (scope: feature)

- **観察**:
  - `src/domain/session/system-event.ts:144` は `hook_event` を `oneLine` (sanitizeBody + 1 行化 + 切り詰め) に通すだけで `detail` に入れる。
  - `src/renderer/src/features/chat/labels.ts:191` の `maskedHookHeading` が、その値を `thread.aui.tsx:1227` で見出しに使う。
  - 名前を伏せた行で、見出しに残る唯一の会話外の文字列になる。描画はテキストノードなので XSS にはならない。
- **同種事象探索**: `maskedHookHeading` を `src` で検索 → 2 件 (labels.ts:191 / thread.aui.tsx:1227)。design-gate.md:107 の L-10
- **推奨アクション**: SDK の HookEvent の既知の名前の allowlist に当てる。外れた値は空にして「Hook {n}」にする。
- **根拠**: Constitution V (秘密を表示しない)、CWE-200

### [Low] `SECRET_PREFIX` の接頭辞の列が狭いまま、新しい表示面 (task の行・背景の task のタブ) に当たる (L-003) (scope: feature)

- **観察**:
  - `src/domain/session/command-name.ts:12` の接頭辞は `sk-|ghp_|gho_|glpat-|AIza|xox` の 6 つで、`AKIA` (AWS) や `github_pat_` を含まない。
  - O-11 で、この規則が直近の活動に加えて、`local_bash` の task の行の名前と `BackgroundTasksTab.tsx` の一覧に使われるようになった (`foreground-tasks.ts` の `commandNameOf`)。
  - 先頭の語が秘密そのものになる場面は稀なので Low とする。
- **同種事象探索**: `SECRET_PREFIX =` を `src` で検索 → 1 件 (command-name.ts:12。renderer にあった重複は今回消えた)
- **推奨アクション**: `src/domain/session/secret-redaction.ts` の伏せ字の規則と、接頭辞の集合を 1 箇所にまとめる。
- **根拠**: Constitution V、CWE-200

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `RESEND_RESULT_MAX_BYTES\|MAX_BYTES` (transcript.ts / read-transcript.ts) | 合計の上限 0 | src/agents/read-transcript.ts:74, src/domain/session/transcript.ts:384 |
| L-001 | `record.sessionId` (read-transcript.ts) | 1 | src/agents/read-transcript.ts:61 |
| L-002 | `maskedHookHeading` (src) | 2 | src/renderer/src/features/chat/labels.ts:191, src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:1227 |
| L-003 | `SECRET_PREFIX =` (src) | 1 | src/domain/session/command-name.ts:12 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
