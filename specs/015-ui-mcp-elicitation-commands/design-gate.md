# Design Gate: MCP・プラグイン・コマンドの表示 (O-5)

**Run**: 2026-10-04 (Round 1)
**Spec**: specs/015-ui-mcp-elicitation-commands/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 3 | 8 | 8 |
| po-reviewer | 0 | 3 | 7 | 4 |
| architecture-reviewer | 0 | 2 | 9 | 6 |
| security-reviewer | 0 | 1 | 7 | 3 |
| platform-boundary-reviewer | 0 | 2 | 4 | 3 |
| **Total (dedup)** | **0** | 7 | 19 | 15 |

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。**ただし本 spec は未承認の判断 (U-1〜U-7)・proposed の AD-046 / AD-047 / AD-048・未マージの O-7 / O-4 に依るので、/cl-implement には入らない。** High 7 件は gate の後に spec / data-model / plan / tasks / quickstart / AD-048 で手当てした (spec は書き直した)。手当ては再レビューを受けていない

## High (dedup 後 7 件)

| ID | 内容 | 出所 | 手当て |
|---|---|---|---|
| H-01 | 構成の「前回と同じなら送らない」が件数と名前の長さで比べ、MCP の状態の変化や同じ長さのモデルの切り替えを送らない。O-4 の上限で捨てた後に二度と届かない | analyze F1 / pb H-002 / arch H-001 | 値の全体で比べ、送ったときだけ基準を更新、`meter` の上限に掛けない、renderer は後勝ち。US-2 AC3 / SC-002 / BE-020 / FE-022 |
| H-02 | 「session の契約を変えない」と画像・resource の印が両立しない | analyze C1 / arch H-002 / sec M-005 | 印を出さない (U-7)。本文に差し込む形は採らない |
| H-03 | US-1 AC4 と data-model §1 の名前の解き方が食い違う | analyze F2 / po M-001 | 構成のサーバー名の最長一致と推定の印に統一 (AC4 / AC5 / data-model §1) |
| H-04 | 承認カードの見出しが MCP の名前を分割・切り詰め、生の名前が消える。`__` を含むサーバー名で取り違える | sec H-001 / pb M-001 / analyze B2 | 承認カードに生の名前を切り詰めずに必ず出し、分けた見出しは補助 (FR-004 / AC7 / FE-012) |
| H-05 | 「MCP を操作しない」を守る機械検査が無い (項目 16 の P3 は 6 名の denylist)。根拠も項目 14 と誤っていた | pb H-001 / arch M-001 | 根拠を AD-036 §4 P3 に。`QUERY_MUTATION_METHODS` に 11 足し違反の fixture (FR-011 / BE-040)。正の形は system scope |
| H-06 | `AskUserQuestion` を許可しても回答が届かないまま O-10 に送り、暫定の案内も無い | po H-001 / sec M-006 | 承認カードの注記 (AC9) と問いの読み取り専用の表示 (AC8 / FR-005) を O-5 で |
| H-07 | Composer slash commands (Tier A・charter の In scope) を持ち主の無い `未使用` にしている | po H-002 / arch M-004 | U-6 を足し O-10 に送る (charter に持ち主を書く) |

## Medium / Low (抜粋。全文は各トラックの raw output)

- 名前は allowlist・説明は Cc / Cf / Zl / Zp を除き平文、AD-048 の出所を「未信頼」に (sec M-004 / arch M-002)。URI は userinfo / query を捨てる要約 (sec M-001 / analyze B1)。過去ログの tool 名の無害化 (sec M-002 / arch M-008)。集計は `Map` (sec M-003)。結果は平文 (sec L-003)
- tool の登録の 2 段を AD-048 に (arch M-003)。O-10 の domain を U-1 に (arch M-005)。O-10 の制約を FR-013 に (sec L-002 / pb L-003)
- `init.permissionMode` を昇格の観測に (pb M-002)。入力型の代入可能性の固定 (pb M-004)。`auth_status` は最上位の型 (analyze C3 / pb M-004)。`meter` 1 件のバイト数 (pb L-002)
- 名前の衝突 `config` → `init-report` / `SessionInitReport`、モデルの見出しを分ける (arch M-007 / analyze F3 / po M-004)
- 節ごとの 0 件・`unknown`・状態の時点・`failed` の案内・`CLAUDE_CONFIG_DIR`・WSL の決め打ちの解消 (po H-003 / M-002 / M-003 / pb L-001)。「認証中」の案内と U-4 の見直しの条件 (po M-005)
- `plugin_install` は通常届かない・マーケットプレイス (arch M-006 / analyze F4 / po L-001)
- `PanelTab.attention` (analyze C4 / arch L-005)、監視ビューの行に出さない判断 (po M-006)、承認カードのテスト (po M-007)、SC-004 の M3 の残り (po L-002)、`started` は既存 (analyze L1 / arch L-001)、経路の列 (analyze L3)、`receivedMessages` (arch L-004)、`_overview.md` の M3 の列 (arch L-002)、AD-048 の Confirmation (arch L-003)、振り分けの負例 (arch L-006)
- system scope へ: 項目 16 の P3 を正の形に、項目 14 のすべての import 文・再 export・動的 import (pb M-003)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
