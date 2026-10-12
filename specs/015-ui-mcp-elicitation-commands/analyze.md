## Specification Analysis Report

**Feature**: specs/015-ui-mcp-elicitation-commands (O-5) — Round 3, Track A (analyze)
**Inputs**: spec.md / plan.md / tasks.md / data-model.md / research.md / quickstart.md / .needs-input.md、constitution.md、docs/decisions/0031・0048、`sdk.d.ts` (SDK 0.3.270)、`src/renderer/src/features/chat/transcript-context.ts`、`src/agents/sdk-agent-session.ts`
**Previous gate**: design-gate.md.20261010T000109 (Round 2: H 3 / M 12 / L 19)
**Mode**: read-only

### Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation | Prev |
|----|----------|----------|-------------|---------|----------------|------|
| N-01 | Underspecification | MEDIUM | data-model.md:90-94、FR-008 (spec.md:192)、FE-001 (tasks.md:34-35)、`sdk.d.ts:5504` (`slash_commands: string[]`)、`sdk.d.ts:8698` (`SlashCommand.name` は "without the leading slash") | H-02 の修正は説明と `argumentHint` を `init.slash_commands` の名前で `commands` から引くが、2 つの出所で名前の書式が同じかが決まっていない。data-model の例は `/a` を使う。書式が違えば引き当ては黙って失敗し H-02 が戻る。テストは同じ書式の fixture なので気付けない | 名前を 1 つの形にそろえる規則 (先頭の `/` を 1 つ外して比べる等) を data-model §2 に書き、FE-001 / FE-021 に「`init` に `/a`、`commands` に `a`」の fixture を足す。`init` の書式は quickstart V-3 で確かめる | new |
| M-01 | Inconsistency | MEDIUM | spec.md:109 (AC5)、:108 (AC4)、data-model.md:9、tasks.md:48 (FE-012) | 過去ログでは `knownServers` が空なので `mcp__a__b` はいつも推定の印付き。AC5「実行中と同じ形」と FE-012「同じ DOM」に反する | AC5 を「推定の印だけが違ってよい」にするか、過去ログでは印を付けない規則を data-model §1 に書く。FE-012 の期待値も合わせる | unresolved from prev |
| M-02 | Inconsistency | MEDIUM | data-model.md:111、tasks.md:62 (FE-020) | `PanelTab.attention?: (sessionId) => boolean` が静的な表の関数のまま。context で注入するストアに届かず購読もしない | `(meters) => boolean` にし、`RightPanel` が `useSessionMeters` で購読する | unresolved from prev |
| M-04 | Coverage | MEDIUM | spec.md:131 (AC5)、data-model.md:111、FE-020 | 注意の印は畳んだ帯にしか出ない | 開いたときのタブの見出しにも印を出すか、出さない理由を spec に書く | unresolved from prev |
| M-05 | Underspecification | MEDIUM | data-model.md:109、§6 `mcpNeedsAuth` / `mcpFailed` | 案内に従ったあと今のセッションのまま直るのかが書かれていない (U-2 で再接続しない) | 案内の文言か Edge Cases に「次のターンの状態で分かる / 起動し直しが要る場合がある」を書く | unresolved from prev |
| M-06 | Coverage | MEDIUM | data-model.md:110 (`configAwaitFirst`)、FE-001 | decoder が `init-report` / `commands` を捨てても「最初のターンの後に出ます」が出続け、観測点が無い | 捨てた回数を数える観測点を置くか、捨てた後の表示を決める | unresolved from prev |
| M-07 | Constitution / ADR | MEDIUM | spec.md:210 (FR-014)、plan.md:155、tasks.md:106 (SH-013)、AD-031:99-106 | AD-031 Decision 1 が in-place の訂正節を許すのは事実誤認の訂正だけ。参照を足すことは当たらず、誤った記述は AD-048:28 側にある | Q1 の回答で決まる。A のままなら訂正の対象を AD-048:28 に移すことを検討 | unresolved from prev |
| M-08 | Terminology | MEDIUM | data-model.md:96, :157-166、FE-020 / FE-021 | タブの id `config` / `ConfigTab` / `config*` が `RunningSession.config` (SessionLaunchConfig) と衝突。Principle XIV に逆らう | `initReport` / `InitReportTab` / `initReport*` 等に改める | unresolved from prev |
| M-09 | Security (ambiguity) | MEDIUM | data-model.md:18、spec.md:108、tasks.md:52 (FE-014) | `a` と `a__b` が両方前方一致しても最長一致で決めて推定の印を付けない (CWE-451) | 前方一致が 2 つ以上なら推定の印。FE-010 / FE-014 の期待値を直す | unresolved from prev |
| M-10 | Security | MEDIUM | data-model.md:26-27 | URI の要約が host を無条件に出す (CWE-200) | host にも秘密らしい形を除く検査を掛け、FE-010 に host の負例を足す | unresolved from prev |
| M-11 | Security / Perf | MEDIUM | spec.md:164、data-model.md:80、BE-020 | `commands` / `init-report` は間引かず流量の上限も無い (CWE-400) | trailing emit の合流にし BE-020 のテストを直す | unresolved from prev |
| M-12 | Coverage (enforcement) | MEDIUM | tasks.md:86 (BE-040)、research R-06 | 項目 16 の P3 はドット呼び出しだけを見る。計算キーを塞いでおらず `UNDETECTED_NOTES` への記録も無い | BE-040 に `UNDETECTED_NOTES` の記録を足し SH-012 にも書く | unresolved from prev |
| L-01 | Inconsistency | LOW | spec.md:160、data-model.md:76, :106 | Edge Cases は一覧ごとに「ほか N 件」、data-model は全体で 1 つの `omitted` | どちらかにそろえる | unresolved from prev |
| L-02 | Wording | LOW | spec.md:210 (FR-014「固定テストを直す」) | plan 申し送り #14 で「足す」と読み替えたが spec の字面はそのまま | 「足す」に直す | unresolved from prev |
| L-03 | Underspecification | LOW | tasks.md:43 (BE-010 `src/agents/live-message.ts:61`)、spec.md:47 | 実在するのは `src/domain/session/live-message.ts` | パスを直す | unresolved from prev |
| L-04 | Inconsistency | LOW | data-model.md:80、tasks.md:60 | 判定の基準の置き場が `run()` の closure と `createLiveSignals` の closure で違う | 1 つにそろえる | unresolved from prev |
| L-05 | Inconsistency | LOW | tasks.md:61 | O-4 の task ID が本 spec の BE-040 と衝突 | 「014 BE-040」と書く | unresolved from prev |
| L-06 | Wording | LOW | research.md:73 (「#16〜#18」) | 実名リストに当たるのは #17 / #18 | 直す | unresolved from prev |
| L-07 | Inconsistency | LOW | plan.md:33 (「新しいモジュール 6」) | 実際は 5 つ (`tool-registry` は既存) | 5 (domain 1・renderer 4) に直す | unresolved from prev |
| L-08 | Wording | LOW | spec.md:176 (FR-001)、:179 (FR-002) | FR-001 の規則と FR-002 の例外がぶつかる | FR-001 に「FR-002 の URI の要約を除く」 | unresolved from prev |
| L-09 | Wording | LOW | data-model.md:110, :159 | 「最初のターンの後に出ます」は事実とずれる | 「最初のターンが始まると出ます」 | unresolved from prev |
| L-10 | Coverage | LOW | quickstart.md:23 | 承認カードが出ない権限モードと拒否後の流れを V-3 で確かめていない | V-3 に 1 項目足す | unresolved from prev |
| L-11 | Underspecification | LOW | spec.md:59-60 (Q2) | Q2 の A を採ったときの不利益が spec に無い | 「義務の扱い」に書く | unresolved from prev |
| L-12 | Record | LOW | tasks.md:101 (SH-012) | — | — | resolved from prev |
| L-13 | Record | LOW | tasks.md:104 (SH-013) | — | — | resolved from prev |
| L-14 | Record | LOW | tasks.md:104-105 (SH-013) | ui / session charter の frontmatter `related_adrs` (AD-048) を足す作業が無い | SH-013 に明示 | unresolved from prev (一部手当て) |
| L-15 | Record | LOW | `transcript-context.ts:32`、tasks.md:46 (FE-011) | `mcpServerNames()` を足すのに docblock を直す作業が無い | FE-011 に足す | unresolved from prev |
| L-16 | Wording / Security | LOW | data-model.md:168、spec.md:111 (AC7) | 過去ログの `answers` の出所を確かめないまま「選ばれた回答」と表示 | 中立な表現にする | unresolved from prev |
| L-17 | Supply chain | LOW | tasks.md:20 (SH-002) | `npx assistant-ui@latest` で版を固定せず差分確認の手順も無い | 版を固定し Grep の手順を足す | unresolved from prev |
| L-18 | Coverage | LOW | tasks.md:52, :61, :45 | テストが M-09 / M-11 の今の振る舞いを固定、FE-010 に host の負例が無い | 結論に合わせて直す | unresolved from prev |
| L-19 | Security | LOW | data-model.md:71 (`^[A-Za-z0-9_.:@/-]{1,128}$`) | `/home/u/x` のような絶対パスの形の名前が通る | 先頭の `/` を 1 つまで等に制限 | unresolved from prev |
| N-02 | Ambiguity | LOW | spec.md:108 (AC4)、data-model.md:18 | サーバー名が違えば同じ長さの前方一致は起こらない。成り立つのは名前の重なりだけで、重なりを取り除く規則が無い | 重なりの規則を data-model §1 / §2 に書き、AC4 の条件を言い換える | new |
| N-03 | Ordering | LOW | tasks.md:86 (BE-040 `[P]`)、:60 (BE-020)、:75 (BE-031) | BE-040 は BE-020 / BE-031 と同じ `sdk-agent-session.ts:91-108` を書き換えるのに「独立」 | 「BE-020 の後」と書く | new |

### 前回の High / Critical の状況

| Prev ID | 状況 | 根拠 |
|---|---|---|
| H-01 状態の印 | resolved | spec.md:113 (AC9)、data-model.md:29、FE-012 / FE-013 の 3 状態の fixture |
| H-02 スラッシュコマンドの後勝ち | resolved (N-01 が残る) | data-model.md:88-94、AC4 (spec.md:130)、FR-008、FE-001 / FE-021 |
| H-03 P3 の denylist | resolved | BE-040 (6 → 19・pin・`keyof Query` の網羅)、SC-005、research R-06 |
| M-03 着手の条件 | resolved | tasks.md:9-11 |

前回の指摘の集計: resolved 6 (H-01 / H-02 / H-03 / M-03 / L-12 / L-13)、unresolved 28 (M 11・L 17)、new 3 (M 1・L 2)。

### Coverage Summary Table

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Yes | BE-010, FE-010, FE-012 | M-01 / L-03 / L-08 |
| FR-002 | Yes | FE-010, FE-012 | M-10 |
| FR-003 | Yes | FE-012, FE-013 | |
| FR-004 | Yes | FE-014 | M-09 |
| FR-005 | Yes | FE-013 | L-16 |
| FR-006 | Yes | FE-012 | |
| FR-007 | Yes | BE-001, BE-002, BE-020, SH-020 | M-11 / L-04 |
| FR-008 | Yes | FE-001, FE-021 | N-01 |
| FR-009 | Yes | FE-020, FE-021 | M-02 / M-04 / M-08 |
| FR-010 | Yes | BE-030, BE-031, FE-030 | |
| FR-011 | Yes | BE-040 | M-12 / N-03 |
| FR-012 | Yes | SH-010 | |
| FR-013 | Yes | SH-012 | |
| FR-014 | Yes | BE-002, SH-013 | M-07 / L-02 |
| FR-015 | Yes | SH-001, SH-012, SH-013 | L-14 |
| SC-001 | Yes | FE-010, FE-012, FE-013, FE-014 | |
| SC-002 | Yes | BE-001, BE-020, BE-031, SH-020 | |
| SC-003 | Yes | FE-020, FE-021, FE-030 | |
| SC-004 | Yes | SH-010, SH-014 | data-model §5 は 21 行、O-10 は 4 行で件数が合う |
| SC-005 | Yes | BE-040, BE-020, SH-014 | |

**Constitution Alignment Issues:** MUST 違反なし (CRITICAL 0)。Principle XIV の懸念は M-08、ADR 手続きの懸念は M-07。Constitution:57 の項目 21 の件数 (O-5 21) は data-model §5 の 21 行と一致。

**Unmapped Tasks:** 無し。

**Metrics:**

- Total Requirements: 20 (FR 15 / SC 5)
- Total Tasks: 24 (SH 8 / BE 8 / FE 8)
- Coverage %: 100%
- Ambiguity Count: 3 (N-02 / M-09 / L-16)
- Duplication Count: 0
- Critical Issues Count: 0
- Severity: Critical 0 / High 0 / Medium 12 / Low 20 (resolved の L-12 / L-13 は件数に含めない)

### Next Actions

- CRITICAL も HIGH も無いので analyze の観点では gate を通してよい。ただし `/cl-implement` の前に tasks.md:9-11 の着手の条件 2 (`.needs-input.md` Q1〜Q3 の利用者承認) が要る (現在未承認)。
- 実装前に直すことを勧めるのは N-01。
- M-01 / M-09 / M-10 / M-11 はテストの期待値を固定する前に結論を出すのが安い。
- Low の字面の直し (L-02 / L-03 / L-05 / L-06 / L-07 / L-08 / L-09) は `Agent(designer)` にまとめて渡せる。
