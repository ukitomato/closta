# ui-coverage-reviewer Review: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-11T00:00:00Z
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-006 (MCP の tool と AskUserQuestion の表示。対応表 C 節の 6 行) / FR-007〜FR-009 (`init`・`commands_changed` を構成のタブに出す。A 節の 2 行) / FR-010 (`auth_status`・`plugin_install`。A 節の 2 行) / FR-012 (`後続: O-5` をすべて書き換える) / FR-013 (O-10 を roadmap に登録) / SC-004
- touched files に該当する charter / Confirmation: ui charter の Out of scope / AD-044 Decision 1〜3 / AD-048 Decision 1・2・4 / 015 data-model §3・§4・§5 (書き換え先の正本)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-044 / XII の条文の drift)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ui-coverage): Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

Round 2 では、R1 の MD-01 (ui-coverage M-001 + L-003) の修正を確かめた。採ったのは案 (a) で、開いた行が無いまま届いた結果からも行を作る。

- `src/agents/live-signals.ts:456-460`: 開いた行が無いまま `isAuthenticating: false` と `error` が届くと、`auth:<連番>` の行を `failed` で作る。
- `src/agents/live-signals.ts:489-505`: `started` を経ない `installed` / `failed` / `completed` でも、プラグインの行を 1 つ作る。
- 書き直した箇所: data-model §4 (`data-model.md:137-139`)、§5 (`:155-156`)、対応表 (`docs/ui-coverage.md:61`、`:63`)。
- 固定するテスト: `src/agents/live-signals.test.ts:1649-1660`。

対応表の書き換えは data-model §5 と 1 行ずつ一致する。その他の確認結果は次のとおり。

- UC-5: roadmap の O-10 の行 (`docs/roadmap.md` の順 19「対応表の割当 (O-5 から)」) と、`後続: O-10` の 4 行 (`docs/ui-coverage.md:78`、`:139`、`:222`、`:223`) が一致する。
- UC-7: `後続: O-5` は対応表に残っていない。O-5 は roadmap で完了になっておらず、M3 の完了も主張していない。
- UC-4: Tier の変更は無い。
- UC-2: SDK の版は上がっていない。
- UC-6: 対象外の行の追加は無い。

R2 で入った変更のうち対応表に関わるのは、RightPanel の開いた tablist に注意の印を足したもの (MD-02) だけである。

## Round inheritance (前 Round の指摘)

- M-001 (MD-01、`auth_status` の単独の失敗が行にならない): **resolved**。`live-signals.ts:456-460`、`data-model.md:138`、`docs/ui-coverage.md:63` の「「認証中」を経ない失敗でも失敗の行を作る」、テスト `live-signals.test.ts:1649-1660` で直っている。cascade で挙げた `plugin_install` の同じ形も `live-signals.ts:489-505`、`data-model.md:139`、`docs/ui-coverage.md:61` で揃った。
- L-001 (LW-01、割当の element が「構成のタブ」): **unresolved**。`docs/ui-coverage.md:49` と `:72`、`data-model.md:154` と `:157` は変わっていない。
- L-002 (LW-02、D 節 `permission-request` の備考): **unresolved**。`docs/ui-coverage.md:171` は「X-1 からの申し送り (承認カード)」のまま。
- L-003 (MD-01 に統合、捨て方と食い違うテスト): **resolved**。案 (a) を採ったので代わりの経路のテストは要らない。開いた行が無いままの失敗は `live-signals.test.ts:1649-1660` で固定され、`:1636-1647` は `error` の無い成功と形の外れだけに絞られた。

## Findings

### [Low] `init` / `commands_changed` の割当の element が「構成のタブ」で、コンポーネント名になっていない (L-001) (scope: feature) — unresolved

- **観察**: `docs/ui-coverage.md:49` と `:72` の割当は `実装済み: 構成のタブ (実行中)` のまま。他の行はコンポーネント名で書いている (`:178` `UsageTab / ContextCostMeter / ... / OverviewTab`)。`InitReportTab` の名前は `:49` の備考と F 節 `:298` にしか無い。正本の `data-model.md:154` と `:157` も同じ字面である。
- **同種事象探索**: `実装済み: 構成のタブ` で 2 件 (`docs/ui-coverage.md:49`、`docs/ui-coverage.md:72`)
- **リスク/影響**: 後続の feature が割当の列を grep しても、表示の持ち主のコンポーネントを引けない。凡例の `<element>` の書き方とも揃わない。
- **推奨アクション**: 割当を `実装済み: InitReportTab / RightPanel の注意の印 (実行中)` に直し (`:72` は `InitReportTab (実行中)`)、`data-model.md:154` と `:157` も合わせる。
- **根拠**: `docs/ui-coverage.md` 凡例「割当」/ AD-044 Decision 1 / UC-3
- **scope 根拠**: touched files の中で直せる

### [Low] D 節 `permission-request` の備考に、O-5 で承認カードに足した表示が書かれていない (L-002) (scope: feature) — unresolved

- **観察**: O-5 は承認カードに次の 2 つを足した (spec FR-004)。
  - MCP の tool の生の名前を、切り詰めずに出す。
  - `AskUserQuestion` に「許可しても回答は届かない」の注記を出す。

  `docs/ui-coverage.md:171` の備考は「X-1 からの申し送り (承認カード)」のままである。この変更は C 節の `:131` と `:139` にしか書かれていない。
- **同種事象探索**: `ApprovalCard` で 2 件 (`docs/ui-coverage.md:171`、`docs/ui-coverage.md:188`)
- **リスク/影響**: 承認の判断に関わる表示 (Tier A) を、承認の行から辿れない。O-10 で注記を外すときに、D 節を直し忘れるおそれがある。
- **推奨アクション**: `:171` の備考に「O-5: MCP の tool は生の名前を切り詰めずに出す。`AskUserQuestion` は回答が届かない注記 (O-10 で外す)」を足す。
- **根拠**: UC-1 / AD-044 Decision 1
- **scope 根拠**: touched files の中で直せる

### [Low] R2 で開いた tablist にも注意の印を足したが、対応表の `init` の備考と data-model §3 は「畳んだ帯」だけのまま (L-004) (scope: feature) — new

- **観察**: R2 の MD-02 の修正で、開いた tablist のタブにも注意の印を出すようになった。根拠は `src/renderer/src/features/shell/RightPanel.tsx:150-178` (`data-attention`、`aria-label` の「注意」、`panel-tab-attention`) と、コメント `:30`。一方、`docs/ui-coverage.md:49` の備考は「MCP サーバーの `failed` / `needs-auth` は畳んだ帯のアイコンにも注意の印を付ける」のまま。正本の `specs/015-ui-mcp-elicitation-commands/data-model.md:126` も「畳んだ帯 ... は `attention` が true のタブのアイコンに印を出す」だけで、tablist の印の記述が無い。
- **同種事象探索**: `tablist|MD-02` (data-model.md) で 0 件。`畳んだ帯` (docs/ui-coverage.md) で 1 件 (`docs/ui-coverage.md:49`)
- **リスク/影響**: 表示の経路が対応表と正本に書かれておらず、後続の feature (O-6 など、タブに注意を足すもの) が印の置き場所を誤って読む。表示の欠落ではなく記述の追随漏れなので Low とした。
- **推奨アクション**: `docs/ui-coverage.md:49` の備考を「畳んだ帯のアイコンと開いた tablist のタブに注意の印を付ける (015 pr-gate R1 MD-02)」に直し、`data-model.md:126` にも同じ 1 文を足す。L-001 の割当の書き換えと同じ編集で済む。
- **根拠**: UC-1 / AD-044 Decision 1
- **scope 根拠**: touched files の中で直せる

H の補足 (自分の担当範囲): L-001 / L-002 / L-004 はどれも文書の記述で、テストで検出する対象ではない。R1 の M-001 の振る舞いは `live-signals.test.ts:1636-1660` と `:1625-1634` (文字列を送らない検査) が固定している。対応表の行の集合と割当の書式は項目 21 が見る。新たなテストの穴は見当たらない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `実装済み: 構成のタブ` (docs/ui-coverage.md) | 2 | docs/ui-coverage.md:49, docs/ui-coverage.md:72 |
| L-002 | `ApprovalCard` (docs/ui-coverage.md) | 2 | docs/ui-coverage.md:171, docs/ui-coverage.md:188 |
| L-004 | `tablist\|MD-02` (data-model.md) / `畳んだ帯` (docs/ui-coverage.md) | 0 / 1 | docs/ui-coverage.md:49 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: resolved from 1: 2 (M-001, L-003) / unresolved: 2 (L-001, L-002) / new: 1 (L-004)
