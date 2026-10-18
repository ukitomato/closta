# Design Gate: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-17T10:45:00+09:00
**Round**: 2 (previous: [design-gate.md.20261017T102721](./design-gate.md.20261017T102721))
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 1    | 7      | 9   |
| po-reviewer                | 0        | 0    | 6      | 3   |
| architecture-reviewer      | 0        | 0    | 3      | 4   |
| security-reviewer          | 0        | 0    | 4      | 2   |
| platform-boundary-reviewer | 0        | 0    | 3      | 2   |
| **Total (dedup)**          | **0**    | 1    | 18     | 18  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 1        | 5    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 1    |

**Status**: PASS
**Next**: Critical=0 のため status: tasking → implementing に昇格した。/cl-implement を起動できる。ただし AD-050 に従い、High の H-001 はこの round で直す (designer)。AD-052 / AD-053 は proposed のままであり、tasks.md「着手の条件」のとおり accepted 化 (利用者の承認) が実装の前に要る (M-005 も参照)。

## Critical (Total: 0)

なし。R1 の C-001 (URL / 空の form の accept が main / agents で落ちる) は、po / architecture / security / analyze の全トラックが resolved と判定した。

## High (Total: 1)

### H-001 — SDK 側で中断された Elicitation のカードが renderer に残り、US-2 AC7 の「カードが外れる」が述べられたイベントでは作れない [origin: analyze N1] [new]

- **Where**: spec.md US-2 AC7 / FR-009、data-model.md §4 renderer「外す」、tasks.md FE-020、contracts/session-answer-boundary.md C-2'
- **Issue**: SDK の `signal` による中断・MCP 側のタイムアウト・利用者の中断で agents は要求を drop して `cancel` を返すが、renderer に知らせるイベントが無い。カードは残り、最後の待ちならセッションは `running` になって、押しても無視されるカードが出たままになる。FE-020 にこの場面のテストも無い
- **Why high**: AC が満たせない形で書かれており、実装時に気付かれないまま出荷される
- **Action**: 最小案は (a) AC7 / FR-009 を利用者の操作による閉じ・終了に狭め、サーバー側の中断後に残るカードを既知の限界 (押しても無害) と記録する。ほかの案は (b) `runState` が `awaiting_permission` を出たら `elicitations` を外す (承認と同時に待つ場合を明記)、(c) 既存のイベントに cancel を載せて `SESSION_EVENT_KINDS` を 9 のまま保つ。どれでも FE-020 に対応するテストを足す。F7 (下の M-001) を同じ編集で直せる

## Medium (Total: 18, dedup)

| ID | Title | Origin | Prev |
|---|---|---|---|
| M-001 | renderer の「終端の state」に `closed` を挙げているが `SessionRunState` に無く、`done` でカードが残る | analyze F7 | unresolved |
| M-002 | 承認の `pending` が 1 枠で、重なった 2 件目が 1 件目を上書きし承認待ちから抜けない | analyze F5 | unresolved |
| M-003 | 項目 0 の form (確認だけ) を `fields: null` にしており accept できない | analyze N2 | new |
| M-004 | 項目のキーの規則が §2 (写し) と §3 (述語) で揃わない (`__proto__` / `constructor` / `prototype`)、form の値の組み立て方 (`Object.fromEntries`) も未定 | analyze F8 + security M-002 | partially resolved |
| M-005 | `ELICITATION_MAX_PENDING = 4` と超過時の黙った decline が spec に無い | analyze F4 + po M-001 | unresolved |
| M-006 | 「編集して再試行」で戻す文が、キューの入力を挟むと拒否された文と違いうる | analyze F6 + po M-004 | unresolved |
| M-007 | FR-004 / data-model §1 / plan が存在しない「静的な検査」を直す対象にしており BE-011 (実行時の pin) と食い違う。`toAskUserQuestionResult` が tool 名を受け取らない | analyze F9 + platform-boundary M-002 | unresolved |
| M-008 | リンクを押すと accept は送られるが、既定の動作 (ブラウザが開く) と `setWindowOpenHandler` → `openExternalIfHttp` を確かめるテストが無い。FE-021 の確認は条件つき | po M-006 + security M-004 | new / unresolved |
| M-009 | 最初のプロンプトの前は slash command の候補が出ないことが spec に無い | po M-002 | unresolved |
| M-010 | 書きかけの回答や form の値がセッションの切り替えで消えることが決まっていない | po M-003 | unresolved |
| M-011 | US-1 AC2 の「次の応答が回答を前提に進む」が主観の判定 | po M-005 | unresolved |
| M-012 | SessionEvent / SessionControl / 承認待ちの意味の拡張が glossary の追随 (SH-001) に無い | architecture M-002 | unresolved |
| M-013 | 承認カードが element ファイルの非公開関数 `parseAskUserQuestionArgs` を使う | architecture M-003 | unresolved |
| M-014 | 「`/cl-implement` は accepted でなければ着手しない」の強制の実体が無い | architecture M-005 | new |
| M-015 | Elicitation のスキーマの `default` と表示名に無害化と長さの上限が無い | security M-001 | unresolved |
| M-016 | renderer の decoder が `openUrl` の scheme を `safe-url` で確かめ直さない | security M-003 | unresolved |
| M-017 | 項目 16 の backstop が `src/agents/` しか見ず、`updatedInput` を組み立てる domain が検査の外 | platform-boundary M-001 | unresolved |
| M-018 | backstop の違反 fixture が `updatedInput` 1 つだけで、`updatedPermissions` と迂回の形の扱いが無い | platform-boundary M-003 | unresolved |

## Low (Total: 18, dedup)

| ID | Title | Origin | Prev |
|---|---|---|---|
| L-001 | AD-052 Decision 4 (d) の backstop の文言が plan / BE-012 と違う | analyze F11 + architecture L-004 | unresolved |
| L-002 | `CanUseToolLike` の戻り値の型の変更が plan / BE-011 に無い | analyze F13 | unresolved |
| L-003 | V-1 の「(コメントを除く)」が `updatedInput` の句に掛からない | analyze F14 | unresolved |
| L-004 | AskUserQuestion「その他」欄の IME / Enter の規則とテストが無い | analyze F15 | partially resolved |
| L-005 | SH-002 の `npx assistant-ui@latest` が 0.15.19 と合わない恐れ | analyze F16 | unresolved |
| L-006 | AskUserQuestion の回答がログに出ないことを確かめるテストが無い | analyze F17 | unresolved |
| L-007 | spec Key Entities の名前が `ElicitationPrompt` と違う | analyze F18 | unresolved |
| L-008 | 中クリックで開くと accept が送られずカードが残る。accept 後に URL を開き直せない | analyze N3 + po L-003 | new |
| L-009 | SC-003 の計測経路が FE-023 の未決の条件に依る | analyze N4 | new |
| L-010 | Elicitation の待ちも監視ビューで「承認待ち」と出る | po L-001 | unresolved |
| L-011 | User Story の価値が charter の KPI に紐付かない | po L-002 | unresolved |
| L-012 | session charter の frontmatter の追随が SH-010 に無い | architecture L-002 | unresolved |
| L-013 | 「問い」の 2 つの範囲の Counterexample が SH-001 に無い | architecture L-003 | unresolved |
| L-014 | U-8 の「リンクを押すことが accept」が AD-053 の Decision に無い | architecture L-005 | new |
| L-015 | URL の伏せ字が OAuth の `code` などを覆わない | security L-001 | unresolved |
| L-016 | form の入力欄に `spellCheck={false}` / `autoComplete="off"` が無い | security L-002 | unresolved |
| L-017 | `onUserDialog` を載せないことを CI で守るのが `QUERY_OPTION_KEYS` の単体の pin だけ | platform-boundary L-001 | unresolved |
| L-018 | URL の Elicitation がランタイムの名前空間の URL をホストで開く越境が記録されていない | platform-boundary L-002 | unresolved |

注: analyze.md の Metrics は Low 8 と書くが、表の LOW 行は 9 件 (F11, F13–F18, N3, N4) ある。本集計は表の行数 (9) を採った。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
