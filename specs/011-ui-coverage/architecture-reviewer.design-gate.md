# architecture-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: architecture-reviewer (default mode と `scope: adr-drift`)
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016 / SC-001〜SC-007 (R2 で中身が変わったのは FR-001 / 002 / 004 / 008 / 009 / 014 / 015 / 016、SC-002 / SC-004)
- touched files に当たる charter / Confirmation: ui charter (:41-43、:126-127、:135、:180-195)、session charter (:54-58、:218-220)、`_overview.md` (:60-62、:85-89、:100)、Constitution (改定手順 :284-296、XII :712-734、XIII :753-770、方針表 :954-962)、AD-019 D2/D3、AD-020 D1/D2/Open Questions、AD-034、AD-035 Trade-off、AD-036 §4 P1、AD-041 (g)、AD-043、AD-027、AD-028 §5、AD-031
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:1 Medium:0 Low:2
- D. Constitution / ADR drift: Critical:0 High:0 Medium:3 Low:3
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当 (L-102 は Ubiquitous Language の衝突として C)
- G. optional reviewer 範囲: 該当なし: 永続化スキーマの変更なし
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (テストの欠けは各指摘の推奨アクションに入れた)

## スコープ要約

R2 の改訂: Hook は SessionStart / Setup だけ、event の DTO は `role: 'system'` のまま `convert.ts` が `role: 'assistant'` の data part に写す、`mergeSystemEvent` で 1 行に合成、`deriveActivity` の読み飛ばし、AD-044 → v1.3.0、O-4〜O-6 は ui、書式の正本を凡例と AD-044 に、項目 21 は pending を持たず発火のテスト。利用者の決定は覆していない。

## Findings

### [High] 名前つきの `task_updated` が、`skip_transcript` で隠した task の行を作る。data-model §2 の合成の規則が FR-009 と食い違う (H-101) (scope: feature)

- **観察**: FR-009 と Clarifications は「行の無い Hook / task への更新は捨てる」。data-model §2 は「行が無くても `next.name` が空でなければ行を作る」で、`task_updated` の `patch.description` を `name` にする。`task_updated` は `skip_transcript` を持たない (`sdk.d.ts:5632-5649`)。research R-04 の「隠した task の後続も現れない」は名前の無い更新にしか成り立たない
- **同種事象探索**: `patch\.description|行の無い` で 8 件。spec の 2 か所は「更新は捨てる」、data-model / plan / research / tasks の 4 か所は「名前の無い更新は捨てる」
- **リスク/影響**: SDK の注記に反し、ambient / housekeeping の task が出る。実装者が spec と data-model のどちらに従うかで振る舞いが分かれる。R1 H-002 の残り
- **推奨アクション**: (a) `task_updated` の `patch.description` を読まない、(b) DTO の `event` に「行を作ってよいか」(`opens`) を足し、`hook_started` / `hook_response` / `task_started` だけ true。8 か所をそろえ、BE-021 / FE-012 に「隠した task に `patch.description` つきの `task_updated` が届いても行が出ない」
- **根拠**: SDK の注記 (`sdk.d.ts:5620-5623`)、spec FR-009、R1 H-002

### [Medium] 合成と読み飛ばしの規則を DTO の形で書いているが、実行中の store が持つのは変換後の ThreadMessageLike である (M-101) (scope: feature)

- **観察**: `running-session-store.ts:256` は変換してから upsert し、store の `messages` は `ThreadMessageLike[]`。data-model / plan / FE-010 は store の upsert で DTO の `mergeSystemEvent` を使う前提。`deriveActivity` も `ThreadMessageLike` を受け、event の行は `role: 'assistant'` の data part で届く
- **リスク/影響**: store に DTO を持たせるか、data part を対象にした別の合成を書くことになり、規則の正本が 2 か所になりうる
- **推奨アクション**: store の upsert では変換の前に DTO どうしで `mergeSystemEvent` を通す (前の値は data part の `data` から DTO の `event` を復元する小さな関数を `convert.ts` に置き、規則は domain の 1 か所)。読み飛ばしは「data part の `name === 'system-event'` だけのメッセージ、または id が `result:` で始まる」と ThreadMessageLike の形で書く。FE-010 / FE-031 は ThreadMessageLike で
- **根拠**: spec FR-009、AD-034、`convert.ts:5-11`

### [Medium] event の行を `role: 'assistant'` にすると、assistant-ui の「最後の assistant メッセージ」の扱いと AssistantMessage の部品がそのまま付く (M-102) (scope: feature)

- **観察**: `thread.aui.tsx:463-473` は role だけで分岐し、event の行は `AssistantMessage` (BranchPicker・ActionBar・余白・running indicator) で描かれる。external store は `isRunning` で末尾が assistant のとき placeholder を足さない (`external-store-thread-runtime-core.ts:75-78`) ので、応答の前に Hook / task の行が末尾に来ると、その行に「●」が出る
- **リスク/影響**: 応答中の印が Hook の行に出て動かない。Copy / Reload が付く。仮想化の高さの見積もりがずれる
- **推奨アクション**: `ThreadMessage` で data part `system-event` だけのメッセージを専用の部品に回し、footer・action bar・indicator を持たせない。`isRunning` で末尾が event の行のときの indicator の扱いを決めて書く。FE-012 に観点。SH-002 の前提に

### [Medium] Constitution XII の Adoption metadata「開発途上の未割当は違反としない」が、常に CI で落とす項目 21 と食い違う。FR-016 / SH-090 の改定の対象に入っていない (M-103) (scope: feature)

- **観察**: `constitution.md:716` の `violation_threshold` は「UI 系 feature の完了時点。開発途上の未割当は違反としない」。項目 21 はすべての PR で違反にする。改定手順 5 は強化のときに既存違反の enumeration を求める。SDK の版を上げる PR は domain を問わず対応表を直す必要が生まれる
- **推奨アクション**: FR-016 / SH-090 に `violation_threshold` と `existing_violations` の改定、Sync Impact Report に既存違反の enumeration を足す。AD-044 の Consequences に「SDK の版を上げる PR は対応表を同じ PR で直す」を書き、discovery の手順にも置く
- **根拠**: Constitution 改定手順 5、XII Adoption metadata、AD-020 D1

### [Low] 対応表の書式の正本を「凡例と AD-044」の 2 か所にしている (L-101)

- **推奨アクション**: AD-044 は決定の正本、凡例は書式の詳細の正本。食い違ったら AD-044 を正とし、決定を変えるときは後続 ADR

### [Low] 「event」という語が同じ経路で 3 つの意味を持つ (L-102)

- **観察**: `post` の kind `event`、`SessionEvent`、DTO の part `type: 'event'`
- **推奨アクション**: DTO の part の type を `system-event` にし、glossary・data part の名前・`TRANSCRIPT_PART_FIELDS` のキーとそろえる

### [Low] 項目 21 の入力のパスを差し替える口を、Constitution 検証の本体に置く (L-103)

- **推奨アクション**: (a) 引数だけにし、差し替えたときは出力に `[override]` と入力のパス、(b) item21.test.ts は一時ディレクトリにリポジトリの形を組み `cwd` を変えて呼ぶ (口を足さない)

### [Low] MINOR の理由の書き方 (L-104)

- **推奨アクション**: 版は利用者の決定どおり。Sync Impact Report と AD-044 に「MAJOR に当たらない理由」(これまで適合していた状態が違反になることは無く、適合の範囲を広げるだけ) を 1 文

### [Low] roadmap の M3 に 3 行を足すと、M4 / M5 の「順」の列 (13〜16) と重なる (L-105)

- **推奨アクション**: SH-010 に順の振り直しか「順の数は振らない」を書く。D-1 の依存を O-3 のままにするかも決める

## R1 指摘の判定

| R1 ID | 判定 |
|---|---|
| C-001 | resolved |
| H-001 | resolved (派生は M-102) |
| H-002 | unresolved (一部) → H-101 |
| H-003 | resolved (表現の問題は M-101) |
| H-004 / H-005 | resolved |
| M-001〜M-003、M-005〜M-009 | resolved |
| M-004 | unresolved (一部) → L-101 |
| L-001〜L-004 | resolved |

## ADR-drift 節

AD-036 §4 P1 / AD-041 (g) 従っている。AD-020 D1 / D2 / Open Questions 従っている (B 節は D1 の分母の外)。AD-019 D3 従っている。AD-023 drift ではない (M-102 で最後の assistant の扱いを取り込む)。AD-034 従っている (M-101 の二重化の危険)。AD-035 Trade-off への回答。AD-043 / AD-027 / AD-028 §5 従っている。AD-031 / 改定手順 1 従っている (M-103 / L-104 が残る)。AD-044 の番号は空き。in-place の書き換えの計画 0 件。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-101 | `patch\.description\|行の無い` / `skip_transcript` (sdk.d.ts) | 8 / 3 型 | data-model.md:73, :79 / plan.md:139 / research.md:50 / spec.md:56, :144, :191 / tasks.md:48 |
| M-101 | `mergeSystemEvent` / `upsertMessage` | 8 / 2 | plan / data-model / research / tasks、running-session-store.ts:256, :433 |
| M-102 | `role === "system"` の描画分岐 / `hasUpcomingMessage` | 1 / 1 | thread.aui.tsx:471 / external-store-thread-runtime-core.ts:75-78 |
| M-103 | `violation_threshold\|existing_violations` (XII) | 2 | constitution.md:715, :716 |
| L-103 | check.mjs の入力を env / argv で読む箇所 | 0 | — |
| L-105 | M3〜M5 の「順」の列 | 7 行 | roadmap.md:249-251, :266-268, :280 |

## Verdict

- Critical: 0
- High: 1
- Medium: 3
- Low: 5
- Round inheritance: resolved 17 / unresolved 2 / new 7
