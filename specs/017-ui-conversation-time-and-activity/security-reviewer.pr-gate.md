# security-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-17T13:00:00Z
**Reviewer**: security-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-005 (時刻の取り込みと検査。security 上ここが唯一の新しい信頼できない入力) / FR-009 (地図の行の入力の先頭の描画) / FR-012〜FR-013 (帯の aria 名) / SC-005 (IPC・preload・main の diff が 0)
- touched files に該当する charter / Confirmation: ui charter (React の text として描画し、`dangerouslySetInnerHTML` を使わない)、AD-051 (時刻は表示にだけ使い、永続化しない。無いときは null)
- A. 認可 / 認証 / secret 管理: 該当なし: touched files に src/main・preload・BrowserWindow・ipcMain・資格情報を扱う経路が無い (touched-files.txt を確認。SC-005 と一致)
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

本 PR は SDK の記録の `timestamp` (型に無いフィールドで未信頼) を epoch ms に直して `createdAt` に入れる。renderer では時刻、所要時間、会話の地図のタブ、活動の帯を出す。main / preload / IPC / BrowserWindow / `shell.openExternal` / 子プロセスには差分が無い。touched-files.txt に `src/main` と preload が無く、diff の Grep でも `ipcMain` / `contextBridge` / `spawn` / `exec(` / `openExternal` は実コードで 0 件だった。このため SEC-1/2/3/4/5/7/8 は対象外である。残る面は 2 つある。1 つ目は時刻の文字列の検査 (SEC-4 の考え方に相当。場所は domain 層)。2 つ目は外部由来の本文を地図に描く経路 (SEC-6)。

確かめたこと:
- `C:\dev\closta\src\domain\session\transcript-time.ts:20-50` の `parseMessageTime`: string 以外は弾く。40 文字の上限を正規表現の前に当てる。正規表現は anchor 付きで入れ子の量指定子が無い (ReDoS は成立しない)。`Date.parse` が NaN のとき、存在しない日付のとき、範囲 (2020-01-01 から now+1 日まで) の外のときは null を返す。live 経路 (`C:\dev\closta\src\domain\session\live-message.ts:86`) は null を受信時刻に倒す。renderer の `receivedAt` は `finiteNumber` で検査している (`C:\dev\closta\src\renderer\src\features\chat\message-time.ts:50`)。
- 描画: `C:\dev\closta\src\renderer\src\features\shell\ConversationMapTab.tsx:394,405` で、入力の先頭は React の text / `aria-label` として出しており、エスケープされる。`style` に入る値は virtualizer の数値だけ (`:329,340`)。触った renderer のファイルに `dangerouslySetInnerHTML` / `innerHTML` / `href` に外部の値を入れる箇所 / console への出力は無い (diff 中の `innerHTML` はテストの assertion だけ。`AppShell.tsx:63` の href は固定の skip link)。

## Findings

### [Low] 入力の先頭を作るときに 1 つ目の text part を全長でコードポイント配列に展開している (L-001) (scope: feature)

- **観察**: `C:\dev\closta\src\renderer\src\features\chat\turns.ts:59-61` の `headOf`。60 コードポイントだけ要るのに、`raw.replace(/\s+/gu, ' ')` と `Array.from(folded)` を本文の全長に対して行っている。実行中は間引きのたびに (500ms に 1 回まで) 全ターンについて計算し直す。
- **同種事象探索**: `Array\.from\(` を turns.ts / activity-bins.ts で検索して 1 件 (`turns.ts:61`)。
- **リスク/影響**: 本文は外部由来 (利用者の貼り付け・transcript) である。数 MB の入力が何ターンもあると、地図を描くたびに renderer の CPU と一時メモリが増える。正規表現は線形で ReDoS ではなく、実害の観察も無い。リソース消費の防御を厚くする提案なので Low にする。
- **推奨アクション**: 先に `raw.slice(0, N)` で頭を切ってから畳む (例: N = 60×4 + 余裕分の UTF-16 単位)。またはターンの id をキーにして結果を memo する。
- **根拠**: CWE-400 (防御を厚くする提案)
- **scope 根拠**: touched file の中で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `Array\.from\(` (turns.ts / activity-bins.ts) | 1 | src/renderer/src/features/chat/turns.ts:61 |
| (scope 確認) | `dangerouslySetInnerHTML\|innerHTML\|new RegExp\|openExternal\|eval\(\|ipcMain\|contextBridge\|spawn\|exec\(` in .pr-gate.diff | 実コードは 0 (`exec(` は `ISO_PATTERN.exec` の 1 件、innerHTML はテストの 2 件、ほかは文書の行) | specs/017-.../.pr-gate.diff:3775, 6148-6149 |

H についての補足: 時刻の検査の境界値は `C:\dev\closta\src\domain\session\transcript-time.test.ts:9-43` で押さえている (41 文字、タイムゾーン無し、存在しない日付、25 時、範囲の両端、非 string)。`Date.now` を読まないことも `:50` で確かめている。IPC / preload を変えていないことは SC-005 の固定テストと quickstart V-1 の `git diff` で確かめる設計になっている。security 上の regression の根拠は足りている。L-001 は性能の性質なので、検出するテストが無いのは許容範囲とする。

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
