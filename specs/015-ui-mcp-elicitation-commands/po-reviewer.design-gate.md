# po-reviewer レビュー: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: po-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-012、SC-001〜SC-005 (どれも単体・component・項目 21・`git diff` で判定)
- 該当 charter / Confirmation: ui charter (Mission・KPI「表示網羅」・In scope の composer の slash commands :46・Out of scope・Open Questions の Tier C :205)、session charter、AD-048 Confirmation、AD-044 Decision 3、AD-036 Decision 4 / AD-041 (g)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:3 Medium:6 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux-reviewer / ui-coverage-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

roadmap の O-5 の割当の全項目は US・`表示不要`・O-10 のどれかに割り振られている。ui-coverage の A/C/E 21 行と F 節 9 行はすべて data-model §5 に書き換え先がある。例外は F 節の Composer slash commands (Tier A) で、持ち主が無い (H-002)。

## Findings

### [High] `AskUserQuestion` を承認カードで許可しても回答が届かないまま O-10 に送り、暫定の案内も無い。境界を変えずに済む「問いと回答の表示」まで O-10 に送っている (H-001) (scope: feature)

- **観察**: plan RK-04 は回答が届かないと認める。承認カード (`ApprovalCard.tsx:30,39-50`) は答えられないことを伝えない。O-10 は O-7 → O-4 → O-5 の後ろに直列。読み取り専用の問い・選択肢・回答の表示は session の契約を変えずにできる
- **同種事象探索**: `AskUserQuestion` (src) 0 件
- **推奨アクション**: 承認カードの暫定文言 (「この問いにはアプリから回答できません…」)。読み取り専用の表示を O-5 に残すか、送る理由。O-10 の依存を O-2 / X-1 にできないかを U-1 の代わりの案に、O-10 の順を FR-010 に
- **根拠**: PO-5 / PO-6、ui charter Journey 2、AD-044 Decision 3

### [High] Composer slash commands (Tier A element・ui charter の In scope) を、未承認の判断の表に載せず [ASSUMED] で `未使用` にしている。後を引き継ぐ feature も無い (H-002) (scope: feature)

- **観察**: ui-coverage F 節は Tier A で O-5 に割当 (:250)。ui charter の In scope (:46)、X-2 は後続に送った (006 spec:406)、PLAN.md:359
- **同種事象探索**: `slash|スラッシュ` 9 件。持ち主を書いた箇所は O-5 以外 0
- **推奨アクション**: U-6 として表に上げる (仮採用「出さない」/ 代わり「composer の候補を出す」) か、登録済みの feature (O-3 など) に送る
- **根拠**: PO-5、ui charter :46

### [High] 構成のタブで、各節が 0 件のとき・`model` が null のとき・状態が `unknown` のときの表示が定義されていない (H-003) (scope: feature)

- **同種事象探索**: 節ごとの空の文言 0 件
- **推奨アクション**: §3 に節ごとの 0 件・`model` null・`unknown` の扱い、§6 に文言、US-2 に AC6
- **根拠**: PO-4

### [Medium] US-1 AC4 が、Edge Cases と data-model §1 の名前の解き方と食い違っている (M-001) (scope: feature)

- **推奨アクション**: AC4 を data-model §1 に合わせて 2 つの AC に。サーバー名に `__` がある場合を Edge Cases に

### [Medium] MCP サーバーの状態がターンの開始時点の値であることを利用者に示しておらず、`pending` のまま古くなる場面が扱われていない (M-002) (scope: feature)

- **推奨アクション**: 「状態はターンの開始時点」の注記、Edge Cases、V-3

### [Medium] `failed` から回復する流れが無く、`needs-auth` の案内は Provider ごとの config dir を考えていない (M-003) (scope: feature)

- **観察**: `config-dir` / `in-app-login` の Provider は `CLAUDE_CONFIG_DIR` を注入する (`derive-env.ts:110-115`)。既定の config dir で `/mcp` しても直らない可能性 (推測)
- **推奨アクション**: `failed` にも案内、`needs-auth` の案内を Provider によらない文言か手順に、U-2 の代わりの案に `mcp_reconnect`、V-3

### [Medium] モデルが O-7 の「概要」と O-5 の「構成」の 2 か所に別の値で出るのに、関係が書かれていない (M-004) (scope: feature)

- **推奨アクション**: 「概要」に寄せるかラベルを分ける (起動時の選択 / 実際のモデル)

### [Medium] 「認証中」の行から先へ進む手段が無い。U-4 と `in-app-login` との関係が書かれていない (M-005) (scope: feature)

- **推奨アクション**: 「端末で claude にログインしてください」、U-4 の代わりの案に「`in-app-login` の feature が見直す」

### [Medium] 表示していない稼働中のセッションで MCP サーバーが `failed` になっても、どこにも印が出ない。出さないとも決めていない (M-006) (scope: feature)

- **推奨アクション**: Out of Scope に「監視ビューの行には出さない (理由)」

### [Medium] FR-003 (承認カードの見出し) を確かめる AC・SC・テストが無い (M-007) (scope: feature)

- **推奨アクション**: US-1 に AC6、FE-011 のテストに

### [Low] US-3 の利用者の価値が書かれていない。`plugin_install` は環境変数の条件付き (L-001) (scope: feature)

### [Low] SC-004 は M3 の完了の条件が実際にいくつ減るかを書いていない (L-002) (scope: feature)

- **推奨アクション**: 「M3 の残りが 2 減る (O-10 の Tier A が 3)」

### [Low] 細かい AC の抜けと主観語 (L-003) (scope: feature)

- **推奨アクション**: 「注意の見た目」を属性で、`commands` と後の `init` の優先、`succeeded` と結果不明の AC

### [Low] quickstart V-3 の実機確認に US-3 と `needs-auth` の場面が無い (L-004) (scope: feature)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `AskUserQuestion` (src) | 0 | ApprovalCard.tsx:30,39-50 は汎用 |
| H-002 | `slash\|スラッシュ` | 9 | ui charter:46、ui-coverage:44,67,77,250、AD-048:21、roadmap:257、006 spec:406、PLAN.md:359 |
| H-003 | 節ごとの空の文言 | 0 | data-model.md:57-69,104-115 |
| M-001 | `__` の規則 | 3 | spec.md:82,123、data-model.md:9-11 |
| M-002 | `pending\|接続中\|鮮度\|時点` | 0 | — |
| M-003 | `CLAUDE_CONFIG_DIR` (src) | 19 ファイル | derive-env.ts:110-115 |
| M-004 | 「モデル」の項目 | 2 | 013 data-model.md:105、015 data-model.md:61 |
| M-005 | `/login` (src) | 0 | — |
| M-006 | `監視ビュー\|稼働中セッション一覧\|サイドバー` | 0 | — |
| M-007 | `ApprovalCard\|承認カード` | 5 | spec.md:129,130,143、tasks.md:22、plan.md:19 |
| L-001 | `SYNC_PLUGIN_INSTALL\|plugin_install\|auth_status` (src) | 0 | — |
| L-002 | Tier A の `後続: O-5` | 5 | ui-coverage.md:58,73,126,134,216 |

## Verdict

- Critical: 0 / High: 3 / Medium: 7 / Low: 4
