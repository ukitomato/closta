---
reviewer: architecture-reviewer
gate: pr-gate
round: 1
scope: adr-drift
base: main (merge-base 44ce810)
head: fc3a5fc
---

# architecture-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: architecture-reviewer (`--scope adr-drift`。対象は ARCH-3 だけ)
**Spec**: specs/014-ui-metering-and-limits/spec.md

## 初回読了 viewpoint

- FR/SC (本 PR で ADR に関わるもの):
  - FR-001 / FR-002: 失敗の理由のキー (AD-047 Decision 1)
  - FR-003 / FR-005: `meter` (Decision 2)
  - FR-004: 行の経路 (Decision 3)
  - FR-010: 昇格の観測 (Decision 5)
  - FR-014: 対応表 (AD-044)
  - FR-015: AD-047 の訂正節
  - SC-002 / SC-005 / SC-006
- touched files に当たる ADR と Confirmation:
  - AD-047: Decision 1〜5・Consequences・Confirmation・訂正節 (全文)
  - AD-031: Decision 1 と訂正 2 (訂正節の判定基準)
  - AD-044: Decision 1 / 3 / 6
  - AD-046: Decision 4 / 6 と訂正節 (focus を書くのはシェルだけ)
  - AD-041: (a) / (g) と Consequences (昇格経路 0)
  - AD-043: Decision 2 / 4 / 6
  - AD-036: §2 / §4
  - AD-034、AD-045 Decision 2、AD-033 Decision 1、AD-020 Decision 3
  - Constitution: III / IV / IX / XII / XV と、項目 14 / 16 (`scripts/constitution/check.mjs:687-717,874-924`)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当 (`--scope adr-drift`)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`--scope adr-drift`)
- C. 業務不変条件 / Charter drift: 該当なし: `--scope adr-drift` は ARCH-3 だけを見る。charter / glossary / cross-domain は通常 scope の回の担当
- D. Constitution / ADR drift: Critical:0 High:0 Medium:2 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage / database reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1

## スコープ要約

AD-047 は main に無い。本 PR で新しく入るファイルである (`.pr-gate.diff:288-293` が `new file mode`)。2026-10-05 に accepted になった版は、ブランチ `014-ui-metering-and-limits-old` の `c89b423` にある。日付つきの訂正節 (`docs/decisions/0047-session-meter-and-failure-reasons.md:62-87`) は 2026-10-08 に足された。

**実装と ADR の照合。** 次の決定に、観察で確かめた違反は無い。

- AD-047 Decision 1
  - キーは 18 (`src/domain/session/agent-session.ts` の diff と固定テスト)。
  - `classifyResult` は変わっていない。`classifyResultFailure` が足された (`.pr-gate.diff:8262-8378`)。
- AD-047 Decision 2 (訂正 #2 を含む)
  - `MeterUpdate` が運ぶ文字列は、モデルの id と `toolUseId` だけである (`src/domain/session/meter.ts:91-110`)。
  - decoder が組み直す (`session-event-decoder.ts` の diff)。
  - 状態通知は 4 フィールドの固定テストのまま (`src/domain/session/status-update.test.ts:54`)。
  - `src/main` / `src/preload` の差分は 0。
- AD-047 Decision 3
  - `TRANSCRIPT_PART_FIELDS` は変わっていない (`transcript-dto.ts:149`)。
  - 過去ログの回帰テストがある (`transcript.system-event.test.ts` の diff)。
- AD-047 Decision 5 (訂正 #3 を含む)
  - 非テストの昇格値の綴りは、`meter.ts:25-29` と `features/chat/labels.ts:95-97` だけである。`src/agents/` の非テストでは 0 件で、項目 16 に例外は足されていない。
  - 強制はしない (`live-signals.ts:244-252`)。
- AD-047 Decision 4: SDK の制御要求の呼び出しは 0 件である (下の M-003 の Grep)。
- AD-044 Decision 1: 割当の書式に沿っている。ToolFallback だけの Tier A の行は無い。
- AD-046 の訂正節: `focus-handoff.ts` は DOM のフォーカスだけを動かし、`stores/ui.ts` の focus を書かない。シェルは session のストアを読むだけである。

**訂正節の 3 項目を AD-031 の基準 (「何を書いたか」「読み手が同じ決定に至るか」) で読んだ。**

- #1 と #2 は、採択の前の R1 の手当てという観察できる根拠を持つ。経路と前提の誤りの訂正として読める。
- #3 は、利用者が 2026-10-08 に書き誤りと判断した (design-gate R3 MG-11)。本 reviewer はこの判断を覆さない。ただし、根拠の commit を GitHub から辿れない (M-002)。

**本 PR に入っているが、ADR の照合の外にある変更。** O-4 と関係の無い commit `dc9ef2e` の 6 ファイルが本 PR に入っている (`.claude/settings.json` の `UserPromptSubmit` hook (`codegraph.cmd prompt-hook`)・`.mcp.json`・`.serena/*` など)。ADR の照合の対象ではないので見ていない。

## Findings

### [Medium] AD-047 の Decision の番号がソースでは 1, 2, 3, 5, 4 の順で、CommonMark で描くと 4 と 5 が入れ替わって見える。参照の「AD-047 Decision 4」が、描いた ADR では別の決定を指す (M-001) (scope: feature)

- **観察**:
  - `docs/decisions/0047-session-meter-and-failure-reasons.md:37` が `5. **権限モードの昇格を観測したとき**`、`:38` が `4. **制御要求を呼ばない。**` である。
  - CommonMark / GFM の番号付きリストでは、2 項目目以降の番号は無視されて連番に振り直される。そのため GitHub の表示では、「4.」が権限モードの昇格、「5.」が制御要求を呼ばない、になる。
  - 一方、リポジトリの参照はソースの番号で書いてある。「AD-047 Decision 4」は制御要求を指す (`docs/ui-coverage.md:196,197,199,262` ほか)。訂正節の見出し (`:62`) と #1 (`:69`)・#3 (`:78`) も、ソースの番号で書いてある。
  - 追加事実: design-gate R3 の analyze S2 (LOW) は、これを「並び」の問題として扱った (`analyze.md:24`。「AD-047 は訂正節を足すときに検討する」)。表示の上で番号が逆になることは書いていない。訂正節を足したときにも手当てされていない。
- **同種事象探索**:
  - AD-047 の番号の乱れ: 1 か所 (`:37-38`)。
  - 「AD-047 Decision 4」の参照: docs で 4 件 (`docs/ui-coverage.md:196,197,199,262`)。specs/014 で 9 件 (`research.md:52,62,64,106,130` / `plan.md:12,161` / `spec.md:220` / `tasks.md:163`)。
- **リスク/影響**: accepted の ADR を GitHub で読んだ人が、`ui-coverage.md` の「AD-047 Decision 4」から権限モードの昇格の節に着く。決定の対応が表示と参照でずれる。
- **推奨アクション** (最小案から):
  1. 訂正節に、日付つきで 1 行足す。例:「Decision の番号はソースの数字が正である (4 = 制御要求を呼ばない、5 = 権限モードの昇格を観測したとき)。GitHub の表示では連番に振り直され、4 と 5 が入れ替わって見える」。Decision の本文には触れない。
  2. 本文の 2 行の順を入れ替える (字面は変えない)。AD-047 はまだ main に無いので、AD-041 の「main に入る前の再採択」と同じ扱いになる。ただし訂正節は「本文は書き換えない」と書いているので、この案は利用者の判断を要する。
- **根拠**: AD-031 Decision 1 (日付つきの訂正節) / ARCH-3
- **scope 根拠**: 本 PR が足す ADR の 1 ファイルで閉じる

### [Medium] 訂正 #3 の根拠は「承認の commit `c89b423` (branch `014-ui-metering-and-limits-old`)」だが、そのブランチは origin に無い。GitHub の読み手は根拠を辿れない (M-002) (scope: feature)

- **観察**:
  - `docs/decisions/0047-session-meter-and-failure-reasons.md:73-75` は、#3 の根拠を「承認の commit `c89b423` (2026-10-05。branch `014-ui-metering-and-limits-old`) の data-model.md:178 と spec.md:134」とする。`plan.md:255` と `tasks.md:172` も同じ根拠を書く。
  - `.git/refs/heads/014-ui-metering-and-limits-old` は `c89b423c…` で、ローカルにしか無い。`.git/packed-refs` に `refs/remotes/origin/014-ui-metering-and-limits-old` は 0 件である。
  - origin で `c89b423` を指すのは、`.git/packed-refs:21` の `refs/remotes/origin/014-ui-metering-and-limits` だけである。これは本 PR の head と同じ名前で、ローカルの tip は `fc3a5fc` (`.git/refs/heads/014-ui-metering-and-limits`)。
  - 先例: 012 は旧版を origin の元の名前に残し、新しい版を `012-ui-thread-search-v2` で push した (`packed-refs:18-19`)。
  - 本 reviewer は `c89b423` の中身 (data-model.md:178 / :76、spec.md:134) を読めない (git object は圧縮されている)。訂正の根拠そのものは確かめていない。
- **同種事象探索**:
  - `014-ui-metering-and-limits-old` の origin の ref: 0 件。ローカルの ref: 1 件。
  - `c89b423` の origin の ref: 1 件 (`refs/remotes/origin/014-ui-metering-and-limits`)。
  - 根拠として引いている箇所: 3 件 (AD-047:73 / plan.md:255 / tasks.md:172)。
- **リスク/影響**:
  - AD-031 Consequences は「in-place の訂正は git の履歴を辿らないと差分が分からない」と書いている。その辿る先が、origin に無いブランチ名である。
  - 本 PR を同じ名前で強制 push すると、origin で `c89b423` を指す ref が無くなる。#3 を「訂正」とした根拠を、後の読み手が確かめられなくなる。
  - 根拠を確かめられない場合、#3 は AD-031 の基準で「決定の変更」に読める。その置き場は後続の ADR になる (design-gate R3 M-204 の論点)。
- **推奨アクション** (最小案から):
  1. 本 PR を push する前に、`014-ui-metering-and-limits-old` (かタグ。例: `adr/AD-047-accepted`) を origin に push する。訂正節の「branch」の字面を、その ref に合わせる。
  2. あわせて、または代わりに、訂正節 #3 に `c89b423` の該当行 (data-model.md:76 / :178、spec.md:134) の字面を引用で写す。根拠を ref の到達性に頼らない形にする。
  3. 本 PR の head を、012 と同じく別の名前 (例: `014-ui-metering-and-limits-v2`) で push する。
- **根拠**: AD-031 Decision 1 と Consequences / AD-047 訂正節 #3 / ARCH-3
- **scope 根拠**: ADR の訂正節の 1 項目と push の手順。本 PR で閉じる

### [Medium] AD-047 Decision 4「制御要求を呼ばない」を機械で検出する手段が無い。ADR と plan は、項目 14 の許可リストが制御要求を縛る前提で書かれている (M-003) (scope: feature)

H の観点。

- **観察**:
  - SDK の `Query` は、制御要求をインスタンスのメソッドとして持つ (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2611-2808`)。`getContextUsage()` (:2786)・`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` (:2806)・`supportedModels()`・`mcpServerStatus()`・`initializationResult()` などである。
  - 項目 14 は、SDK の named import の名前の呼び出し形だけを見る (`scripts/constitution/check.mjs:687-709`)。`q.getContextUsage()` は見えない。
  - 項目 16 の P3 が締め出すのは mutation のメソッド 6 つだけである (`scripts/constitution/allowlists.mjs:420-427`)。読み取り系の制御要求は対象外。
  - ADR と plan の字面は、項目 14 が制御要求を縛る前提に立つ。
    - AD-047 Alternatives (`:54`):「制御要求を呼ぶ — … 項目 14 の許可リストの追加 …」
    - AD-047 Consequences (`:47`):「要るようになったら制御要求の許可リストの追加とともに ADR を起こす」
    - plan Constitution Check IV (`plan.md:65`) と SC-006 (`spec.md:268`): `AGENT_SDK_ALLOWED_CALLS` の差分 0 を「新しい SDK の呼び出しなし」の根拠にしている
  - 今の呼び出しは 0 件である (下の Grep)。テストの偽の Query は `interrupt` しか持たない (`src/agents/sdk-agent-session.test.ts:146`)。テストの経路で制御要求を呼べば TypeError になるので、偶然には検出される。ただし、明示の assert は無い。
- **同種事象探索**:
  - `\.(getContextUsage|usage_EXPERIMENTAL\w*|supportedModels|supportedCommands|supportedAgents|mcpServerStatus|initializationResult|reinitialize)\s*\(` を `src/` で: 0 件。
  - 同じ名前を `scripts/` (検査の側) で: 0 件。
  - mutation の denylist: 6 件だけ (`allowlists.mjs:420-427`)。
- **リスク/影響**:
  - 後続の feature が `getContextUsage()` を呼んでも、項目 14 / 16 は緑のまま通る。その feature は「ADR が要る」ことに気づかない。
  - SC-006 の計測経路 (許可リストの差分 0) は、測ると言っているもの (制御要求を足していない) を測っていない。
- **推奨アクション** (最小案から):
  1. `sdk-agent-session.test.ts` に 1 件足す。偽の Query に制御要求のメソッドを spy として持たせ、`init` → `assistant` → `result` (成功・失敗) → 終了 まで流して、呼び出しが 0 件であることを assert する。
  2. AD-047 の訂正節に日付つきで 1 行足す。内容は「項目 14 は Query のメソッドを見ない。Decision 4 の機械の歯止めは 1. の単体テストである」(経路の事実の訂正。決定は変えない)。
  3. Query のメソッドの許可リスト (`interrupt` だけ) を項目 16 に足すかを、roadmap の system-scope に持ち主つきで登録する。`allowlists.mjs` の変更には ADR が要るので、本 PR では行わない。
- **根拠**: AD-047 Decision 4 と Consequences / Constitution Principle IV / AD-036 §4 (権限昇格面の全数封鎖の先例) / H
- **scope 根拠**: 1. と 2. は touched files (`sdk-agent-session.test.ts`・AD-047) で閉じる。3. は system

### [Low] AD-047 Decision 2 の訂正の前の字面 (「数と列挙の値だけ」「モデルの id だけ」) が、spec の U-2 と plan.md:269 に残っている (L-001) (scope: feature)

- **観察**:
  - `spec.md:67` (U-2) は「数と列挙の値だけを運ぶ」と書く。`spec.md:73` の注記は U-3 だけを直している。
  - `plan.md:269` は「Decision 2 の『数・真偽・列挙・モデルの id だけを運ぶ』の中」と、訂正の前の字面で引く。
  - 実装と訂正節 #2 は、形を検証した tool の id も運ぶ (`meter.ts:110` / AD-047:74-77)。
  - これは design-gate R3 の L-204 で、未解消のまま残っている (追加事実なし)。
- **同種事象探索**: `数と列挙の値だけ|モデルの id だけを運ぶ` で 2 件 (`spec.md:67` / `plan.md:269`)。`plan.md:260` (差の表で ADR を引いた行) と `AD-047:35` (Decision の本文) は直す対象ではない。
- **リスク/影響**: 後の round や後続 feature の reviewer が、U-2 の字面と `toolUseId` を照合して、同じ食い違いを挙げ直す。
- **推奨アクション**: `spec.md:73` の注記に、「U-2 の『数と列挙の値』は、モデルの id と形を検証した tool の id を含む (AD-047 訂正 #2)」を 1 行足す。`plan.md:269` の引用を、訂正の後の字面に直す。
- **根拠**: AD-047 訂正節 #2 / ARCH-3
- **scope 根拠**: spec と plan の 2 行

### [Low] AD-047 の Decision と Consequences の本文が、採択の版から変わっていないことを確かめた記録が無い。main との差分では原理的に見えない (L-002) (scope: feature)

H の観点。design-gate R3 の L-206 が未解消。

- **観察**:
  - SH-013 は「Decision と Consequences の本文は書き換えない」とする (`tasks.md:172`)。
  - quickstart の V-1 は、main との merge-base `44ce810` と比べている (`quickstart-results.md:27`)。`docs/decisions/0047-*.md` を対象にする行は 0 件である。
  - 追加事実: AD-047 は main に無い新しいファイルである (`.pr-gate.diff:288-293`)。main との差分は、本文の書き換えを構造的に検出できない。採択の版は `c89b423` (main の外) にしか無い。
  - 補足: R2 / R3 の報告と plan が引く行番号 (Decision 2 `:35` / Decision 5 `:37` / Decision 4 `:38` / Consequences `:48`。`plan.md:259-261`) は、今のファイルと一致する。行の位置は動いていない傍証になるが、字面が同じことの証拠ではない。
- **同種事象探索**: `0047|AD-047|c89b423` を `quickstart.md` / `quickstart-results.md` で: 0 件。
- **リスク/影響**: accepted の ADR の決定を書き換えても、検出するのは人の目だけになる (起きれば ARCH-3 で High 以上)。
- **推奨アクション**: quickstart の V-1 に 1 行足し、結果を `quickstart-results.md` に書く。内容は「`git diff c89b423 HEAD -- docs/decisions/0047-session-meter-and-failure-reasons.md` が、末尾の訂正節 (`:62-87`) の追加だけで、`:1-60` の削除・変更が 0」。M-002 の 1. で ref を残すと、後からも同じ確認ができる。
- **根拠**: AD-031 Decision 1 / ARCH-3 / H (検出の手段)
- **scope 根拠**: quickstart と quickstart-results の 1 行

### H の観点のまとめ (本 reviewer の担当範囲)

- **検出するテスト**: M-001 / M-002 / L-001 は文書の問題で、テストでは検出できない。M-003 と L-002 は、検出の手段そのものが無いことを指摘している。
- **既存の振る舞いを壊していない根拠** (ADR の不変条件):
  - `SESSION_EVENT_KINDS` の 8 と `LAUNCH_FAILURE_REASONS` の 18 を、固定テストが値で見る。
  - 状態通知が 4 フィールドであることを `status-update.test.ts:54` が見る (このファイルは触っていない)。
  - 過去ログが新しい subtype から行を作らないことを、`transcript.system-event.test.ts` の追加のテストが見る。
  - 項目 14 / 16 / 21 は ok (`quickstart-results.md:12-15`)。
- **観測点**: AD-043 Decision 6 (Worker の標準出力を読み捨てる) に沿って、観測点は足していない。plan の RK-14 がこの判断を roadmap に残している。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | AD-047 の番号付きリストの番号の乱れ (multiline) / `AD-047.{0,20}Decision [45]` | 1 | docs/decisions/0047-session-meter-and-failure-reasons.md:37-38 / 参照 docs 4・specs 9 (docs/ui-coverage.md:196,197,199,262 / research.md:52,62,64,106,130 / plan.md:12,161 / spec.md:220 / tasks.md:163) |
| M-002 | `014-ui-metering-and-limits-old` (origin の ref) / `c89b423` (origin の ref) / 根拠として引く箇所 | 0 | .git/packed-refs (無し。ローカル 1) / .git/packed-refs:21 / AD-047:73, plan.md:255, tasks.md:172 |
| M-003 | `\.(getContextUsage\|usage_EXPERIMENTAL\w*\|supportedModels\|supportedCommands\|supportedAgents\|mcpServerStatus\|initializationResult\|reinitialize)\s*\(` (src / scripts) | 0 | — (mutation の denylist だけ: allowlists.mjs:420-427) |
| L-001 | `数と列挙の値だけ\|モデルの id だけを運ぶ` | 2 | spec.md:67 / plan.md:269 |
| L-002 | `0047\|AD-047\|c89b423` (quickstart.md / quickstart-results.md) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 2
