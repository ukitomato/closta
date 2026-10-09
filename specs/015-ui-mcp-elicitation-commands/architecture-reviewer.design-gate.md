# architecture-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: architecture-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012 / SC-001〜SC-005、US-1〜US-3 の AC、Edge Cases、U-1〜U-5、Out of Scope
- 該当 charter / Confirmation: ui charter (:43-47、:61-76、:205-206)、session charter (:46-52、:220-226)、`_overview.md` (:64、:96-97、:108、:136-148)、glossary (:727-735、:961)、Constitution III / IV / IX / X / XII / XIII / XIV、AD-020 / AD-035 / AD-036 §4 / AD-040 / AD-041 (e)(f)(g) / AD-043 / AD-044、proposed の AD-046 / AD-047 / AD-048
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲 (M-008 は経路の不変条件として C)
- C. 業務不変条件 / Charter drift: Critical:0 High:2 Medium:5 Low:3
- D. Constitution / ADR drift: Critical:0 High:0 Medium:3 Low:2
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲 (用語の衝突は M-007)
- G. optional reviewer 範囲: 該当なし: ui-coverage / ux の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

accepted ADR の書き換えや NON-NEGOTIABLE の明白な違反は無い。主な問題: 構成の最新値の不変条件が重複抑止で壊れる / 「契約を変えない」と画像・resource の印が両立しない / AD-048 Decision 2 の守りが実際に効かない機構を挙げている。

## Findings

### [High] 構成の重複抑止が「件数と名前の連結の長さ」で比べるため、MCP サーバーの状態・モデル・版・説明の変化を同じ内容とみなして送らない (H-001) (scope: feature)

- **観察**: data-model.md:51。`pending` → `failed` で送られない。O-4 の 1 秒 20 件の上限で捨てた後に二度と届かない。`init` と `commands_changed` の後勝ちの規則が無い
- **同種事象探索**: `前回|同じなら|同じ内容` 5 件
- **推奨アクション**: 無害化後の値の全体で比べ、emit できたときだけ基準を更新。上限から外すか次の境で最新値。renderer は届いた順の後勝ち。テスト
- **根拠**: spec Edge Cases / US-2 AC2・AC4、014 data-model §2、Constitution X

### [High] FR-001 の「session の契約を変えない」と、US-1 AC2 / data-model §1 の「画像・resource の印」が今のコードでは両立しない (H-002) (scope: feature)

- **観察**: `toolResultText` (`tool-result.ts:22-35`) は text 以外を捨て、`result` は `string | null`。両経路で共有。本文に印を差し込むと AD-035 Decision 4 が防いだ marker 注入と同型
- **同種事象探索**: 10 件 / `toolResultText` 1 件
- **推奨アクション**: (1) 印を範囲から外す か (2) 信頼値のフィールドを DTO に足し FR-001 を改める。本文に埋め込む案は採らない
- **根拠**: AD-035 Decision 4、O-2 FR-007

### [Medium] AD-048 Decision 2 と SC-005 が「MCP の制御要求を呼ばない」の守りを項目 14 と options のキーに求めているが、実際の制約は AD-036 §4 P3 で、機械検査はどちらも MCP の呼び出しを見ない (M-001) (scope: feature)

- **観察**: MCP・プラグインの制御は `Query` のメソッド (`sdk.d.ts:2775-2935`)。AD-036 §4 P3 は「`interrupt()` のみ」。項目 14 は `.method()` を見ない (`check.mjs:781-782`)、P3 の denylist は 6 名で含まない。U-2 の代わりの案のコストの説明も誤り (要るのは AD-036 §4 P3 の読み替え)
- **推奨アクション**: 根拠を AD-036 §4 P3 に直す。SC-005 / V-1 に「`Query` のメソッドは `interrupt` だけ」。P3 を正の形に改めるか denylist に 6 メソッドと fixture。AD-047 Decision 4 の同じ誤りは O-4 に申し送り
- **根拠**: AD-036 §4 P3、Constitution IV / VI

### [Medium] AD-048 Decision 3 の「AD-047 Decision 2 の読み替え」は前提が事実と合わず、読み替えの形も先例に沿っていない (M-002) (scope: feature)

- **推奨アクション**: 出所を「利用者の設定・作業フォルダ・MCP サーバー・プラグインの作者に由来する未信頼の文字列」に、名前と説明を分ける。「読み替える箇所」の節。AD-047 側の参照の手順

### [Medium] AD-035 Decision 1「未登録 toolName は必ず ToolFallback に落ちる」と、`mcp__*` の名前の判定による振り分けの関係が記録されていない (M-003) (scope: feature)

- **推奨アクション**: 組み込みの 4 tool は表に入れる。`mcp__` の判定は AD-048 に 1 文の読み替え (登録を 2 段に、どちらにも当たらない名前は ToolFallback)。注記を追随

### [Medium] 範囲の除外を、持ち主も charter の改定も無い恒久の決定 (`未使用` / `表示不要`) にしている (M-004) (scope: feature)

- **推奨アクション**: composer の候補を U 表に (charter から外すか持ち主を登録)。操作の 6 行の理由は AD-048 を引く

### [Medium] O-10 の domain を `ui` と決めているが、範囲の中心は session の契約であり、domain の判断が U-1 の選択肢に出ていない (M-005) (scope: feature)

- **推奨アクション**: U-1 に O-10 の domain の問い。`_overview.md` に判断と理由

### [Medium] `plugin_install` はアプリが起動するセッションでは届く経路が無く、この前提が spec / quickstart に無い。名前も SDK ではマーケットプレイスの名前 (M-006) (scope: feature)

- **観察**: `CLAUDE_CODE_` の接頭辞は転送禁止 (AD-041 (e) 3)、`--exec` は login shell を通らない (AD-041 (f))
- **推奨アクション**: Assumptions と ui-coverage の備考に。「マーケットプレイス」に。実装の価値を U 表で

### [Medium] `SessionConfig` / `meter` の種類 `config` / `meters[id].config` が、既存の `config` (SessionLaunchConfig) と同じ名前で並ぶ (M-007) (scope: feature)

- **推奨アクション**: 種類を `init-report`、型を `SessionInitReport` などに。glossary の Counterexample。モデルの置き場

### [Medium] 過去ログの tool 名は無害化されておらず、data-model §1 の前提が事実と違う (M-008) (scope: feature)

- **推奨アクション**: `transcript.ts:233` を実行中と同じ無害化に。BE のタスクと回帰テスト

### [Medium] SC-002 / SC-005 の計測経路が、本 feature で変わる箇所を測らない (M-009) (scope: feature) [H]

- **推奨アクション**: SC-002 に伝搬のテスト、SC-005 に `Query` のメソッドと `TRANSCRIPT_PART_FIELDS`

### [Low] data-model §4 は `SystemEventStatus` に `started` を足すとしているが、既にある (L-001) (scope: feature)

### [Low] ui charter の Tier C の Open Question は既に `[x]` で、`_overview.md` の Milestone の表は FR-012 の対象に入っていない (L-002) (scope: feature)

### [Low] AD-048 の Confirmation「O-10 の design の前に 2 つの ADR」は本 feature の時点で確かめられない (L-003) (scope: feature)

### [Low] `receivedMessages` の基準が `auth` / `plugin` の行の追加でまた変わる (L-004) (scope: feature)

### [Low] 畳んだ帯の注意の印に、O-7 のタブの表 (`PanelTab`) の置き場が無い (L-005) (scope: feature)

### [Low] MCP の振り分けの負例が既存の回帰テストにも FE-011 にも無い (L-006) (scope: feature) [H]

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `前回\|同じなら\|同じ内容` | 5 | data-model.md:51 / plan.md:18,82 / spec.md:151 / tasks.md:26 |
| H-002 | 印と契約の記述 / `toolResultText` | 10 / 1 | spec.md / data-model.md / tool-result.ts:23 |
| M-001 | `項目 14\|許可リストの追加\|ALLOWED_CALLS` | 6 + 3 | AD-048 / spec / plan / quickstart / AD-047 |
| M-002 | `設定由来` | 4 | spec.md:43,54,163 / AD-048:29 |
| M-003 | 振り分けの記述 | 2 (+コード 3) | data-model.md:15 / plan.md:81 / tool-registry.aui.tsx:20,36,40 |
| M-004 | `O-5 の範囲の決定\|composer の候補` | 3 | spec.md:53 / data-model.md:96,99 |
| M-005 | `M3・ui・依存 O-5` | 4 | spec.md:41,52,162 / AD-048:27 |
| M-006 | `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` / `プラグインの名前` | 1 / 2 | research.md:30 / spec.md:117 / data-model.md:78 |
| M-007 | `config` の衝突 | 4 / 12 | 013 / 014 / 015 |
| M-008 | `sanitizeToolName` / 過去ログの tool 名 | 9 / 1 | transcript.ts:233 |
| M-009 | `SC-002\|SC-005` | 4 | spec.md:179,182 / tasks.md:29 / quickstart.md:5 |
| L-001 | `'started'` | 1 | transcript-dto.ts:67 |
| L-002 | `O-1〜O-6` | 1 | _overview.md:108 |
| L-003 | `O-10 の design の前` | 3 | AD-048:27,47 / spec.md:162 |
| L-004 | `receivedMessages` (015) | 0 | — |
| L-005 | `帯` (015) | 3 | spec.md:100,153 / data-model.md:69 |
| L-006 | `mcp__` (test) | 2 | system-event.test.ts:218 / session-view.summary.test.ts:61 |

## Verdict

- Critical: 0 / High: 2 / Medium: 9 / Low: 6
