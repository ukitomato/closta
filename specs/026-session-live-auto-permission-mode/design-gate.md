# Design Gate: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01T00:00:00+09:00 (Round 2)
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [design-gate.md.20261031T150056Z](./design-gate.md.20261031T150056Z) (Round 1, FIX_REQUIRED)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 9      | 10  |
| po-reviewer                | 0        | 0    | 7      | 4   |
| architecture-reviewer      | 0        | 1    | 3      | 4   |
| security-reviewer          | 0        | 0    | 2      | 0   |
| platform-boundary-reviewer | 0        | 0    | 3      | 3   |
| **Total (dedup)**          | **0**    | 1    | 15     | 18  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 1        | 7    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 1    |

**Status**: PASS
**Next**: status は tasking から implementing に上がった。`/cl-implement` を起動できる。High の H-001 は文面の食い違いで、AD-050 に従ってこの round の中で直す (plan.md:21 / :152 の 2 か所)。H-001 を確かめるためだけの round は回さない

## Critical (Total: 0)

なし。Round 1 の C-001 は、利用者が spec U-6 (2026-10-31) でリスクを受け入れたことで解消した。5 つのトラックすべてがそう判定した。

## High (Total: 1)

### H-001 — plan は「ゲートの持ち主は動かさない」ので gated の確定事項でないとするが、同じ plan と data-model §1、AD-066 Decision 2 はゲートの方針を session に暫定で置くと決めている [origin: architecture H-101] [new]

- **Where**: plan.md:20, :21, :152 (「動かさない / 読むだけ」) と plan.md:137, :154, data-model.md:34, :266, AD-066:44 (「暫定で置く」)
- **Issue**: isolation charter の In scope を書き換えるので、2 つの domain の責務の割り当てが変わる。それなのに plan は AGENTS.md の gated 確定事項 (domain decomposition) に当たらないとしている。また U-1〜U-6 に、この割り当てを承認した行が無い
- **Why high**: 記録をたどる人が、責務の移動に人間の承認が要ったのかを判別できない。ただし AD-066 は PR のレビュー (改定手順 2) で人間が見るので、マージまでに承認の機会は 1 度ある
- **Action**: plan.md:21 を「判定はゲートの方針にあたり、X-10 では session に暫定で置く。責務の割り当てを AD-066 Decision 2 に書き、PR のレビューで AD-066 を accepted にすることで人間が承認する」に書き換える。plan.md:152 を :154 にそろえる

## Medium (Total: 15)

dedup の後の一覧。詳細は各トラックの raw output にある。AD-050 に従ってこの round では直さず、マイルストーンの終わりの棚卸しで扱う。

| ID | Title | Origin | Where |
|---|---|---|---|
| M-001 | renderer と main の capability がずれると、`auto-mode-unconfirmed` から抜けられない | analyze C1, po M-003, platform-boundary M-001 | data-model §4.2 / §6.2 / §6.3 :79, :151, :163, :243; contracts C-1 / C-3 |
| M-002 | Auto の受理と `auto-mode-unconfirmed` の拒否が main のログに残らない | analyze C2, po M-007, security M-002 | data-model §4.2 :77-87; tasks BE-010 |
| M-003 | session charter :144 と glossary :819 が `presets.json` を「版 2」のまま書いている | analyze I2, architecture M-001 | docs/domains/session/charter.md:144; docs/glossary.md:819; data-model §11 |
| M-004 | 「許可の 4 値」が `autoModeAllowed` の「許可」と衝突する | analyze I3, architecture M-002 | spec.md:73, :86; plan.md:28, :131; data-model.md:22, :25 |
| M-005 | 項目 16 の P1 はテンプレートリテラルの `` `auto` `` を検出しない | analyze C4, platform-boundary M-002 | scripts/constitution/check.mjs:919; data-model §10 :257 |
| M-006 | SC-005 に合否の基準が無い | analyze A1, po M-002 | spec.md:97; plan.md:332, :386; quickstart.md:25-28 |
| M-007 | 稼働中のセッションの一覧で Auto のセッションを見分けられず、Out of Scope にも書かれていない | analyze U1, po M-005 | spec.md Out of Scope; data-model.md:125-134 |
| M-008 | isolation charter :87、glossary :71、`capabilities.ts:158` が U-6 より前の意味を残している | platform-boundary M-004, architecture L-101, analyze D1 | docs/domains/isolation/charter.md:19, :87-88; docs/glossary.md:71; src/domain/runtime/capabilities.ts:158; data-model §11 |
| M-009 | Auto で起動した直後の読み上げが、mount と最初の meter の順序に依存する | analyze I1 | data-model.md §5.3 :131-133; tasks FE-015, BE-012; quickstart V-1.3 |
| M-010 | 琥珀色の帯の文字のコントラストを確かめていない | analyze C3 | data-model §5.3 :130; tasks FE-015 |
| M-011 | User Story の利点が charter の KPI / Journey に結び付いていない | po M-001 | spec.md:44 |
| M-012 | `auto` が使えない環境向けの専用の失敗表示を持たないことが、Out of Scope に書かれていない | po M-004 | spec.md:102, :105-110; plan.md:329 |
| M-013 | `lastConfig` から復元した `auto` で確認が出ることを固定するテストが無い | po M-006 | tasks.md:64 (FE-013); spec.md:63 |
| M-014 | main の印は renderer の自己申告なのに、脅威モデルが書かれていない | security M-001 | docs/decisions/0066-auto-permission-mode-with-confirmation.md:65; data-model.md:77-87 |
| M-015 | 改定後の Principle III で、`bypassPermissions` を開く条件が `autoModeSafe` のまま | architecture M-101 | data-model.md:211, :216 |

## Low (Total: 18)

| ID | Title | Origin |
|---|---|---|
| L-001 | plan の Summary と Scale が、読み上げの持ち主を `AutoModeBanner` と書いている | analyze D2 |
| L-002 | research P-8 の参照が古い (ヘッダ、§6) | analyze D3 |
| L-003 | spec 本文の `Status: Draft` が frontmatter と食い違う | analyze D4 |
| L-004 | data-model §9 に空の表見出しが重複している | analyze D5 |
| L-005 | 解決済みの `[ASSUMED]` が spec.md:103 に残っている | analyze D6, po L-003 |
| L-006 | plan の Principle I / II の見出しが Constitution の見出しの言い換えになっている | analyze D7 |
| L-007 | 起動した直後の読み上げが FR-008 / AC2 に書かれていない | analyze T1 |
| L-008 | if / unwanted の振る舞いが Edge Cases にしか書かれていない | analyze U2 |
| L-009 | 1 操作の経路を確かめているのが単体テストだけ (RK-07 で受け入れ済み) | analyze G1 |
| L-010 | Edge Cases の 5 つ目「今の規則のまま」が稼働中の行の扱いと食い違う | po L-001 |
| L-011 | SC-001 で何を「操作」と数えるかの範囲が決まっていない | po L-002 |
| L-012 | `refetch` で起動の時点の確認が黙って閉じる | po L-004 |
| L-013 | e2e の DTO の `autoModeAllowed` と main の記述子を別々に手書きしている | platform-boundary L-001 |
| L-014 | P1 の違反の文言を変えると、文言どうしが矛盾する | platform-boundary L-002 |
| L-015 | `UnsafeModeBanner` の `allowed` の文が、隔離されていると読める | platform-boundary L-003 |
| L-016 | spec FR-011 の更新対象に isolation charter / `_overview` / prompts が入っていない | architecture L-102 |
| L-017 | AD-066 の読み替え表に AD-064 Decision 4 (書き出しは版 2) の行が無い | architecture L-103 |
| L-018 | glossary が `needs-confirmation` と `auto-mode-unconfirmed` の違いを書いていない | architecture L-003 |

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
