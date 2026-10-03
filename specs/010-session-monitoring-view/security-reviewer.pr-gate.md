# security-reviewer Review: セッション監視ビュー (O-1)

**Run**: 2026-10-03
**Reviewer**: security-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-006 (不可視文字の除去を足した)、FR-010、FR-012 (改訂。error-context を含めて記録と出力に会話由来の文字列と env を入れない。例外の文は理由キーと件数だけ。下限の検証と `probe-missing`)、SC-002、SC-005 (許可リストに `minMessages` / `thresholdOverridden`)、SC-006
- touched files に関係する charter / Confirmation: session charter KPI「並列時の滑らかさ」(宿題を O-3 へ移す記述だけ)。AD-038 D2 / D3 (perf は CI で実行しない。vitest の node project の `perf/**/*.test.ts` は純関数だけ)。AD-043 (本 Round の変更は触れていない)
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / database の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

0ba910f..HEAD の差分: perf (`PLAYWRIGHT_NO_COPY_PROMPT=1` と `testMatch`、例外の文を理由キーと件数だけに、`teardown=killed`、判定の純関数化、vitest の include)、renderer (`normalizeLine` の不可視文字の除去、compact の失敗の短い理由と終了の告知 — どちらも固定の表の文言)、E2E (compact の幅のテストに強制終了と終了済みの行)、文書。`src/main`・`src/preload`・`src/agents`・`src/domain` の差分は 0 件。IPC・preload・BrowserWindow・`shell.openExternal`・子プロセスの経路の追加も 0 件。

## Round 1 の指摘の判定

| R1 ID | 判定 | 根拠 |
|---|---|---|
| H-001 error-context.md の aria snapshot | **resolved** | `playwright.perf.config.ts:23` が `PLAYWRIGHT_NO_COPY_PROMPT = '1'`。抑止の条件 (`node_modules/playwright/lib/index.js:658`) は truthy だけを見る。設定ファイルは runner と worker の両方で読まれる。`%TEMP%\closta-perf-results\**\*` の Glob は 0 件で、削除は quickstart-results に記録。research R-07・tasks SH-032・spec FR-012 に error-context が加わった |
| M-001 成果物の方針を検証する手段がない | **resolved** (最小案) | quickstart V-3 手順 5 と docs/discovery.md に「outputDir に `.last-run.json` 以外が無いことを確かめる」。機械化はしていない |
| L-001 不可視の書式文字 | **resolved** | `INVISIBLE_FORMAT` が U+200B-200D、U+2060-2064、U+180E、U+E0000-E007F を除く。`sanitizeBody` の後、`\s+` の畳み込みと切り詰めの前。テストは session-view.monitor.test.ts:81-86。残りの細部は新規 L-001 |
| L-002 例外の文に env の値が入る | **resolved** | `perf/real-sessions.spec.ts` の `throw new Error(` 8 件はすべて理由キーと件数だけ。`run-judgement.ts` の例外も `refused: CLOSTA_PERF_MIN_MESSAGES` だけで、テストが `/^…$/` で固定 |

## Findings

### [Low] 不可視の書式文字の除去が、走査の先頭 1024 コードユニットを埋め尽くされた行と、残りの不可視・空白類の文字を扱っていない (L-001) (scope: feature)

- **観察**:
  - `toActivityLine` は 1 行のうち先頭 1024 コードユニットだけを `normalizeLine` に回し、空なら次の行に進む。U+200B を 1024 個以上並べた後に本文を書いた行は空として飛ばされる。テストは 200 個まで
  - 除去の対象外: U+00AD (soft hyphen)、U+034F (CGJ)、U+FE00-FE0F (異体字セレクタ)、U+3164 / U+115F / U+1160 / U+FFA0 (ハングルの埋め字。`\s` に含まれず空白として残る)
- **同種事象探索**: `00AD|034F|FE0F|3164|115F` を src で 0 件。会話由来の文字列を 1 行にする経路は `normalizeLine` の 1 か所。transcript 本文と承認カードは R1 と同じ `sanitizeBody` の集合で、本 PR では増えていない
- **リスク/影響**: 並びを入れ替える文字ではないので偽装の力は弱い。できるのは直近の活動の 1 行を空にする/次の行に差し替えることと、見えない空白で切り詰めの枠を埋めること。差し出すのは会話の相手で、利用者の権限は越えない
- **推奨アクション**: 記録だけでよい (最小案)。直すなら上の文字を `INVISIBLE_FORMAT` に足し、1100 個の U+200B の行のテストで今の挙動を固定する。domain の sanitizeBody 側は FR-010 で変えられないので roadmap の system-scope に載せる
- **根拠**: spec FR-006 / Edge Cases、CWE-451

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 (新規) | `00AD\|034F\|FE0F\|3164\|115F` in src | 0 | session-view.ts:154, :170, :173-181, :203-211 / sanitize-body.ts:33-41 |
| R1 H-001 | `PLAYWRIGHT_NO_COPY_PROMPT` in node_modules/playwright/lib | 1 | node_modules/playwright/lib/index.js:658 |
| R1 H-001 | `closta-perf-results/**/*` | 0 | — |
| R1 L-002 | `throw new Error(\|console\.\|annotations?\.push\|expect\(` in perf/real-sessions.spec.ts | throw 8 / log 2 / annotation 1 / expect 4。env の値・表示名の一覧を含むものは 0 | — |
| (0 件の確認) | delta の `+++ b/src/(main\|preload\|agents\|domain)` | 0 | — |
| (0 件の確認) | delta の新規コードで `dangerouslySetInnerHTML\|innerHTML\|ipcMain\|ipcRenderer\|contextBridge\|shell.openExternal\|child_process` | 0 | — |

## H (テスト / regression) の所見

- H-001 の対策を検出する機械的なテストはない (R1 M-001 で最小案を採ったので新しい指摘にしない)。次に実機計測を回したら outputDir が `.last-run.json` だけであることを最初に記録するとよい
- L-002 の回帰は `run-judgement.test.ts` が固定。`optionIndex` の文の形は perf の tsc だけが見ている
- 既存の XSS 境界のテストは delta でも消えていない。compact の短い理由と終了の告知は固定の文言で、テストが中身を固定
- `teardown=killed` は理由キーだけ。`minMessages` / `thresholdOverridden` は数値と真偽値で、許可リストに加わっている

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 1: 4 (H-001, M-001, L-001, L-002) / unresolved: 0 / new: 1
