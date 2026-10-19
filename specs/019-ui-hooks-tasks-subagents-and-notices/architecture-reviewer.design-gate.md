# architecture-reviewer Review: Hook・背景の task・実行中の subagent の表示 (O-11)

**Run**: 2026-10-17T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/019-ui-hooks-tasks-subagents-and-notices/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-005 (全件が設計対象。design-gate のため diff はまだ無い)
- touched files に該当する charter / Confirmation:
  - ui charter: Scope (右のペインのタブ・Subagent・ui-coverage)、Open Questions :260-262 (task の一覧の持ち主)
  - session charter: Key concepts の `meter` :137-139 / `meters` :146 / system の分岐 :154-158、O-11 の項 :296-299
  - _overview.md: :97-101 / :114-117 (O-11 の帰属、Hook / task の状態を session に含めない)
  - accepted ADR: AD-034 D1/D3、AD-035 D3/D4/D5/D6、AD-036 §4 P1/P3、AD-041 (g)、AD-044 D1/D3/D6、AD-046 D4、AD-047 D2/D3 (+ 訂正節)、AD-049 D1/D5/D6、AD-023 (循環の禁止)
  - proposed ADR: AD-054 / AD-055 / AD-056 (承認の前なので本文の食い違いは High が上限)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:3 Low:0
- D. Constitution / ADR drift: Critical:0 High:3 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner (循環 import は AD-023 の layering として D に入れた)
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-11 は次の 3 つを入れる。(1) `includeHookEvents` で一般の Hook の行を出す。(2) 前景で始まった task を覚えておき、後から背景に移った task の行を出す。`background_tasks_changed` を `meter` の種類 `background-tasks` で送り、右のペインのタブに出す。(3) `forwardSubagentText` を渡し、`parent_tool_use_id` で実行中の subagent を入れ子にする。過去ログは `listSubagents` / `getSubagentMessages` で補う。

これに伴い、session の契約 (query の options・SDK の許可リスト・`meter` の種類・agents の入れ子) を ui の feature が広げる。根拠は proposed の 3 ADR (AD-054 / AD-055 / AD-056)。U-1〜U-8 は未承認で、tasks.md は承認を着手の条件にしている。

本 review の範囲は Constitution・accepted ADR・charter・glossary との整合と、レイヤ・モジュールの境界である。

## Findings

### [High] FE-031 / FE-021 の設計が `tool-registry.aui.tsx` ⇄ `subagent.aui.tsx` の循環 import を作る (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/components/assistant-ui/elements/tool-registry.aui.tsx:12` は今 `import { Subagent } from "./subagent.aui"` を持つ。
  - plan.md:225 と tasks.md:89 (FE-031) は逆向きを指示している: 「`subagent.aui.tsx` の入れ子の tool-call を、`tool-registry.aui.tsx` が export する振り分けの関数で描く」。
  - tasks.md:68 (FE-021) は `subagent.aui.tsx` に「同じ表の参照」を求めている。その表 `SYSTEM_EVENT_ICONS` は `thread.aui.tsx:1121` にある。`thread.aui.tsx:20` は tool-registry を import しているので、thread → registry → subagent → thread の第 2 の循環になる。
  - `.dependency-cruiser.js:77-81` は `no-circular` を error にしている (AD-023 §7)。
  - plan.md:190 (申し送り #24) は dependency-cruiser を「当たらない」と処理している。
- **同種事象探索**: Grep `^import .*(tool-registry|subagent)|SYSTEM_EVENT_ICONS` (src/renderer/src/components/assistant-ui) で 6 件。循環に関わるのは `tool-registry.aui.tsx:12`、`thread.aui.tsx:20`、`thread.aui.tsx:1121` の 3 つ。
- **リスク/影響**: 計画どおりに作ると SH-013 の依存グラフ検証で必ず落ちる。そこで初めて設計を作り直すことになり、RK-05 と FE-001 の前提 (props だけで registry の表示を置く) も変わりうる。
- **推奨アクション**: plan の「実装方針」の描画と FE-031 / FE-021 で、依存の向きを 1 方向に決める。
  - 例 (a): 振り分けの表を新しいモジュール (`tool-dispatch.aui.tsx` など) に移す。registry と Subagent の両方がそこを参照するのではなく、Subagent には React の context で描画関数を注入する。thread か registry が Provider を置く。
  - 例 (b): `SYSTEM_EVENT_ICONS` と `systemEventDetailText` を `thread.aui.tsx` から独立したファイルに切り出し、subagent.aui.tsx はそちらを import する。
  - 申し送り #24 を「当たる (循環)」に直す。
- **根拠**: AD-023 §7 / `.dependency-cruiser.js` の `no-circular`
- **scope 根拠**: 本 feature の plan / tasks が指示する新しい依存

### [High] U-3「一覧の持ち主は `ui`」と、一覧を session の契約とストア (`meters`) に置く設計が食い違う。AD-044 D6 の読み替えが半分しか書かれていない (H-002) (scope: feature)

- **観察**:
  - spec.md:42 / :89 (U-3) と AD-056:35 (Decision 2) は「持ち主は `ui`。AD-044 Decision 6 で session に Hook / task の責務を持たせないと決めた」とする。
  - 一方で一覧の置き場は次のとおり。いずれも session の持ち物である。
    - `SessionEvent` の `meter` の種類 (data-model.md:95-114)
    - 稼働中のストア `SessionMeters.backgroundTasks` (data-model.md:120。`features/session/running-session-store.ts`)
  - glossary.md:609 は Meter の Domain を「`session` (契約と保持) / 表示は `ui`」とする。session charter :137-139 / :146 も `meter` と `meters` を session の Key concepts に置く。
  - AD-044:84 (D6) の回答は「Hook / Background task を session の責務に含めない。状態は保持せず」。AD-056 の「読み替える箇所」(:29) は「状態は保持しない」の部分しか読み替えておらず、「session に含めない」の部分には触れていない。
- **同種事象探索**: Grep `持ち主は .ui.|持ち主の domain は .ui.` (specs/019, docs/decisions/0056) で spec.md:42, :89、AD-056:35, :50 の 4 件。Grep `Domain.*session.*契約と保持` (docs/glossary.md) で :609 の 1 件。
- **リスク/影響**: U-3 は AGENTS.md の gated 確定事項 (domain の分解) である。利用者は、保持先が session のストアであることが読めない根拠を見て承認することになる。承認後に AD-056 が accepted になると、「session に含めない」と「session の meters に持つ」が同じ ADR 群の中で並び、次の feature の持ち主の判断が割れる。
- **推奨アクション**: AD-056 (proposed なので本文を直せる) と spec U-3 の文言を、実際の配置に合わせる。
  1. 「表示と feature の持ち主は `ui`、保持は session の契約 (`meter` / 稼働中のストアの `meters`)。O-4〜O-6 と同じ形」と書き分ける。
  2. AD-056 の「読み替える箇所」に、AD-044 D6 の「session の責務に含めない」側の読み替えを足す。
  3. Alternatives の「持ち主を session にする」を退けた理由も、その書き分けに合わせて直す。
- **根拠**: AD-044 Decision 6 / glossary Meter / session charter Key concepts / AGENTS.md gate の原則 (domain の分解は人間が承認)
- **scope 根拠**: 本 feature の spec と proposed ADR で直せる

### [High] AD-056 Decision 2 の「`local_bash` は名前を出さない」が、FR-005 / data-model §2.3 (シェルの task の行にコマンドの名前を入れる) と矛盾したまま承認に回る (H-003) (scope: feature)

- **観察**:
  - AD-056:35 は「一覧の各行の名前は同じ id の transcript の task の行 (O-2 の規則で無害化済み。`local_bash` は名前を出さない) から引く」とする。
  - spec.md:192 (FR-005) と data-model.md:90 は、`local_bash` の行の `name` に `bashCommandName` の値を入れる。tasks.md:70 (FE-022) は一覧の行の名前をその行から引く。
  - plan.md:253 は「AD-054 / AD-056 は変えない」としている。
- **同種事象探索**: Grep `local_bash. は名前を出さない` (docs/decisions, specs/019) で AD-056:35 の 1 件。
- **リスク/影響**: このまま AD-056 が accepted になると、FR-005 の実装は「accepted ADR の Decision に反する」状態になる。その場合 pr-gate で Critical (accepted ADR drift) になる。
- **推奨アクション**: AD-056 Decision 2 の括弧書きを「`local_bash` は説明を出さず、起動した `Bash` の呼び出しのコマンドの名前 (FR-005。秘密の形を弾く規則) だけを出す」に直す。plan.md:253 の「AD-056 は変えない」も直す。
- **根拠**: AD-056 Decision 2 (proposed) と spec FR-005 / data-model §2.3
- **scope 根拠**: proposed ADR と本 spec の整合

### [High] 前景の task の記憶 (agents のセッションスレッドに task の状態の表を 256 件持つ) を、どの ADR も読み替えていない (H-004) (scope: feature)

- **観察**:
  - data-model.md:58-68 (§2.1) と tasks.md:58 (BE-020) / :64 (BE-023) は、セッションスレッドごとに task の表を持つ。中身は `task_type`・`description`・`tool_use_id` で、上限 256 の LRU。
  - AD-044:84 (D6) は「状態は保持せず … session は agents で無害化して通す経路だけを持つ」とする。glossary.md:1046 (System event row の Counterexamples) は「task の状態を持たない (AD-044 Decision 6)」とする。
  - AD-056:29 の読み替えは「一覧の最新の 1 つを `meters` に持つ」だけで、agents 側の前景の task の記憶には触れていない。plan の Constitution Check にも記載が無い。
- **同種事象探索**: Grep `前景の task の記憶|createForegroundTaskMemory` (specs/019) で data-model.md:58, plan.md:49, :213, tasks.md:58, :59 ほか。Grep `前景` (docs/decisions/0056) で 0 件。
- **リスク/影響**: accepted の AD-044 D6 が「通す経路だけ」と決めた session (agents) に、根拠の ADR の無い task の状態が置かれる。どの ADR の上に立つ設計かが読めず、承認の対象からも漏れる。
- **推奨アクション**: AD-056 の「読み替える箇所」に次の 1 行を足す: 「AD-044 D6 (session は通す経路だけ) → agents は後から背景に移った task の行を作るため、前景の task の種類・説明・起動の id を、セッションスレッドごとに上限つき (256)・永続化しない形で覚える」。過去ログの変換の側 (1 回の変換に 1 つ) も同じ行に書く。glossary の System event row の Counterexamples を直すことも SH-001 に足す。
- **根拠**: AD-044 Decision 6
- **scope 根拠**: proposed ADR に読み替えを足せば本 feature の中で閉じる

### [Medium] glossary に、本 feature の規則と食い違う定義が残る。SH-001 の書き換えの対象に入っていない (M-001) (scope: feature)

- **観察**:
  - glossary.md:899-903 (Subagent) は「多段時は `parent_agent_id` が連鎖鍵」とする。data-model.md:184 は「agentId・`parent_agent_id` は入れ子の決定に使わない (多段は `parent_tool_use_id` の連鎖で決まる)」とする。
  - glossary.md:85 の Background task の日本語表記は「バックグラウンドタスク」。spec・UI の文言・タブ名は「背景の task」で、plan.md:127 はこれを glossary の表記として引いている (事実と違う)。
  - glossary.md:1032 (System event row) は「行を作れるのは Hook の開始・応答、task の開始と…」とする。本 feature は `task_updated` で行を開く。
  - tasks.md:15 (SH-001) は Hook / Background task / System event row (category の追加) / Meter / O-11 を直すが、上の 3 点は書き換えの対象に入っていない。
- **同種事象探索**: Grep `parent_agent_id` (docs/glossary.md) で :899, :903 の 2 件。Grep `日本語表記\*\*: バックグラウンドタスク` で :85 の 1 件。
- **リスク/影響**: Principle XIV の同義異語の禁止に当たる (同じ概念に 2 つの日本語表記)。一次鍵の規則も glossary と data-model で割れる。
- **推奨アクション**: SH-001 に次を足す。
  - Subagent の連鎖鍵の記述を「多段も `parent_tool_use_id` の連鎖。`parent_agent_id` は使わない (AD-055)」に直す。
  - Background task の日本語表記を、spec と UI が使う「背景の task」に揃える。揃えないなら spec と UI を glossary に合わせる。
  - System event row の「行を作れる」の列に、後から背景に移った task を足す。
- **根拠**: Constitution Principle XIV
- **scope 根拠**: glossary の SSoT drift。本 feature の SH-001 で直せる

### [Medium] session charter の Key concepts (`meter` が運ぶ値・セッションスレッドの system の分岐) に、本 feature の拡張を書くタスクが無い (M-002) (scope: feature)

- **観察**:
  - session charter :137-139 は、`meter` が運ぶ値を「数・真偽・列挙・モデルの id・形を検証した tool の id」と定義している。:154-158 は、セッションスレッドの `system` の分岐を O-6 の時点の形で書いている。
  - O-5 / O-6 はこの Key concepts を直してきた (:140-145、:148-153)。
  - tasks.md:16 (SH-002) が書くのは :296-299 の O-11 の項だけである。task の id の列、`parent_tool_use_id` 付きのメッセージの入れ子と送り直し、`background_tasks_changed` の分岐は、Key concepts に入らない。
- **同種事象探索**: Grep `meter|meters|system. の分岐` (docs/domains/session/charter.md) で :137, :146, :148, :154 の 4 件。tasks.md で `:137` / `:154` への言及は 0 件。
- **リスク/影響**: session の契約の SSoT が、O-11 の後に実際の契約と合わなくなる。
- **推奨アクション**: SH-002 に、session charter の Key concepts の更新を足す。
  - `meter` の項に「O-11 が `background-tasks` を足した (9 → 10。task の id と種類。AD-056 Decision 2)」
  - `meters` の項に `backgroundTasks`
  - system の分岐の項に「帰属つき (`parent_tool_use_id`) のメッセージは入れ子にし、根を送り直す。`background_tasks_changed` を `meter` で送る」
- **根拠**: session charter (契約の SSoT)。O-5 / O-6 の前例
- **scope 根拠**: charter の SSoT drift。本 feature の SH-002 で直せる

### [Medium] 先行の accepted ADR に、読み替える側の ADR への参照を足す手順が tasks に無い (M-003) (scope: feature)

- **観察**:
  - AD-047:91-109 は、AD-048 / AD-049 が Decision 2 を読み替えたときに「訂正: AD-04x への参照」の節を足してきた (AD-031 の規則に従う。O-6 SH-010)。
  - 本 feature では次の 3 つの読み替えが起きる。
    - AD-056 → AD-047 Decision 2 (運ぶ値)
    - AD-055 → AD-035 Decision 3
    - AD-054 → AD-041 (g)
  - tasks.md:99 (SH-010) は 014 data-model に行を足すだけで、AD-047 自体への参照の節を足すタスクが無い。
- **同種事象探索**: Grep `訂正: AD-04. への参照` (docs/decisions) で AD-047:91, :101 の 2 件。tasks.md で AD-047 / AD-035 / AD-041 の訂正節への言及は 0 件。
- **リスク/影響**: AD-047 を読む人が、運ぶ値がさらに広がったこと (task の id の列) に辿り着けない。前例と同じ手当てが欠ける。
- **推奨アクション**: SH-002 か SH-010 に「AD-047 に『訂正: AD-056 への参照』を足す (Decision と Consequences の本文は変えない)」を入れる。AD-035 / AD-041 にも同じ形で足すかは、前例 (AD-047 だけ) に合わせて判断を記録する。
- **根拠**: AD-031 (訂正節の規則)、AD-047 の訂正節の前例
- **scope 根拠**: 本 feature の記録のタスク

### [Medium] 過去ログの `getSubagentMessages` 由来の記録の捨て方が、AD-035 Decision 5 の「欠落なし」と食い違う。AD-055 の読み替えの対象に D5 が無い (M-004) (scope: feature)

- **観察**:
  - AD-035:76 (D5) は「親不明の subagent メッセージは孤児として top-level に平坦化 (欠落なし)」とする。spec.md:159 (US-3 AC2) も「AD-035 Decision 5 の規則で描く (欠落させない)」とする。
  - 一方、data-model.md:176-181 (§3.2) は次の 2 種類を捨てる。
    - 親の見つからない列 (「top-level に出さない」)
    - 列の親と違う `parent_tool_use_id` の記録
  - AD-055:34 の「読み替える箇所」は AD-035 Decision 3 だけを名指している。
- **同種事象探索**: Grep `捨てる` (specs/019/data-model.md §3.2) で :176, :179, :180, :181, :182 の 5 件。Grep `Decision 5` (docs/decisions/0055) で :41 の 1 件 (健全性の継承として。読み替えではない)。
- **リスク/影響**: 新しい取得元の記録だけ D5 の例外になるのに、ADR 上の根拠が無い。spec の AC2 と data-model の規則も読み手によって割れる。
- **推奨アクション**: AD-055 の「読み替える箇所」に、次の 1 行を足す: 「AD-035 D5 の『欠落なし』は `getSessionMessages` の inline の記録に限る。`getSubagentMessages` の記録は親が結べない列を捨てる (今どおり Task のカードと inline の分)」。spec US-3 AC2 の「欠落させない」の範囲も、同じ形で限定する。
- **根拠**: AD-035 Decision 5
- **scope 根拠**: proposed ADR と spec で直せる

### [Medium] 過去ログの subagent の取得の失敗が観測できない (H 観点) (M-005) (scope: feature)

- **観察**:
  - data-model.md:166-167 は、`listSubagents` の失敗と `getSubagentMessages` の 1 件ごとの失敗を「捕まえて捨てる」とする。
  - `src/agents/read-transcript.ts:76` の既存の `catch {}` にもログは無い。
  - 失敗した件数や理由を運ぶ経路 (frame のメタ・quickstart の記録のための観測点) は、spec / plan / tasks のどこにも無い。
- **同種事象探索**: Grep `console\.|log\(|catch` (src/agents/read-transcript.ts) で :76 の 1 件 (ログ無し)。
- **リスク/影響**: RK-07 / RK-09 / V-6 (入れ子の subagent のファイルが列挙されるか、開く時間) を実機で確かめるとき、「SDK が返さない」と「呼び出しが失敗した」を区別できない。U-8 が前提にしている SDK の振る舞いを検証できない。
- **推奨アクション**: BE-033 に、本文や agentId を含めない観測値を足す。例: 読んだ件数・失敗の件数・上限で切った件数を frame の軽量メタか開発用のカウンタで運ぶ。quickstart V-6 の記録項目にも入れる。
- **根拠**: reviewer-base H 観点 (障害時の観測点)。Principle V (本文と id をログに出さない) と両立する形で
- **scope 根拠**: 本 feature の BE-033

### [Low] Principle IV の Statement の API の列挙に `listSubagents` / `getSubagentMessages` が無い (L-001) (scope: out-of-scope)

- **観察**: constitution.md:475 は「セッションの読み書きは `listSessions()` / `getSessionMessages()` / `getSessionInfo()` / `renameSession()` / `tagSession()` を使い」と列挙している。AD-055:47 と plan.md:77 は「Statement に合う。本文は変えない」とする。
- **同種事象探索**: Grep `listSubagents|getSubagentMessages` (.specify/memory/constitution.md) で 0 件。
- **リスク/影響**: 列挙は例示として読めるので実害は無い。ただし、列挙が閉じた集合だと読む読み手には、AD-055 が Statement の外に見える。
- **推奨アクション**: 次の Constitution の PATCH の機会に、列挙を「SDK のセッションの読み取り API (例: …)」の形にするか 2 つを足す。本 feature では AD-055 の Consequences に「列挙は例示と読む」と 1 行書くだけで足りる。
- **根拠**: Constitution Principle IV / 改定手順 (表現の修正は PATCH)
- **scope 根拠**: Constitution の文言。本 PR の必須ではない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `^import .*(tool-registry\|subagent)\|SYSTEM_EVENT_ICONS` (src/renderer/src/components/assistant-ui) | 6 (循環に関わるのは 3) | tool-registry.aui.tsx:12, thread.aui.tsx:20, thread.aui.tsx:1121 (計画側: plan.md:225, tasks.md:68, tasks.md:89) |
| H-002 | `持ち主は .ui.\|持ち主の domain は .ui.` / `Domain.*session.*契約と保持` | 4 / 1 | spec.md:42, :89, AD-056:35, :50 / glossary.md:609 |
| H-003 | `local_bash. は名前を出さない` | 1 | docs/decisions/0056-…md:35 |
| H-004 | `前景` (docs/decisions/0056) / `前景の task の記憶` (specs/019) | 0 / 5+ | data-model.md:58, plan.md:49, :213, tasks.md:58, :59 |
| M-001 | `parent_agent_id` / `日本語表記\*\*: バックグラウンドタスク` (docs/glossary.md) | 2 / 1 | glossary.md:899, :903 / :85 |
| M-002 | `meter\|meters\|system. の分岐` (session charter) | 4 | session/charter.md:137, :146, :148, :154 |
| M-003 | `訂正: AD-04. への参照` (docs/decisions) | 2 | 0047-…md:91, :101 |
| M-004 | `捨てる` (data-model §3.2) | 5 | data-model.md:176, :179, :180, :181, :182 |
| M-005 | `console\.\|log\(\|catch` (read-transcript.ts) | 1 | src/agents/read-transcript.ts:76 |
| L-001 | `listSubagents\|getSubagentMessages` (constitution.md) | 0 | — |

## Verdict

- Critical: 0
- High: 4
- Medium: 5
- Low: 1
