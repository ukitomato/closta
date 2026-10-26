# ui-coverage-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-006 (知らせの類と Checkpoints)、FR-007〜FR-011 (中身のブロックと知らないブロックの印)、FR-012 (過去ログの変換)、FR-013〜FR-015 (B 節の照合と `後続: O-12` の書き換え)、FR-016 / FR-017 (記録)。SC-001〜SC-009。このうち対応表の判断に直接かかるのは FR-011 / FR-014 / FR-015 と SC-004 / SC-006 / SC-009。
- touched files に該当する charter / Confirmation:
  - `docs/ui-coverage.md` は AD-044 の Decision 1〜4 に当たる。
  - `docs/roadmap.md` の O-12 の行は AD-044 Decision 3 (M3 の完了の条件) と AD-028 §5 に当たる。
  - `docs/domains/ui/charter.md` の Out of scope は UC-6 に当たる。
  - 機械照合 (項目 21) の範囲は code-gate で PASS 済み (lint 0 / test 3953 件通過)。本 reviewer は再確認していない。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。対応表の判断は扱わない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。UC-6 (対応表の対象の範囲) は G で見て、違反なし
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。U-12 (Principle XII の Verification の字面が A・C・E 節のまま、項目 21 は B 節も照合する) は architecture の領分なので扱わない
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ui-coverage スライス): Critical:0 High:0 Medium:4 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

O-12 は対応表の `後続: O-12` の行を全部書き換えた。A 節 7 行、A' 節 1 行、B 節 3 行である。あわせて B 節を機械照合の対象にし、33 行 (assistant 17・user 16) に広げた。検証した結果は次のとおり。

- `docs/ui-coverage.md` に `後続:` が残るのは X-6 (E 節の 4 行)、I-3 (D 節 1 行と E 節 1 行) だけ。割当先が O-12 の行は 0 で、UC-5 と UC-7 に該当する問題はない。
- SDK の版は変わっていない (`package.json` は diff に無い)。`@anthropic-ai/sdk` 0.125.0 の行が増えただけで、UC-2 の「版を上げる PR」には当たらない。
- 実装済みと書いた element と変換は、コードで存在を確認した。
  - `server-tool-call.aui.tsx` と `unsupported-block-mark.tsx`。
  - `content-blocks.ts` の `convertServerOrUnsupported`。
  - `notice-rows.ts` の `toNoticeRow` (12 種)。
  - `live-signals.ts:712-716`、`sdk-agent-session.ts:967-975` (`active_goal` は型ガードで受けており、cast は無い)。
  - `convert.ts` の `server-tool-call` / `unsupported-block` / `file` と `thread.aui.tsx` の Parts への配線。
- UC-1 の違反 (表示を足したのに行が `実装済み` に直っていない、またはその逆) は見つからなかった。
- UC-4 の違反 (既存行の Tier の引き下げ) も見つからなかった。diff で Tier 列が変わった既存行は 0。
- UC-6 の違反 (他 domain の値を行にした、または SDK の emit を行から外した) も見つからなかった。

以下は、機械照合を通ったうえで残る判断の指摘である。Critical と High は 0。

## Findings

### [Medium] 割当が `表示不要` なのに経路が `過去ログ` の行が 11 行ある (M-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:126-128` と `docs/ui-coverage.md:130-137` の user/thinking・redacted_thinking・tool_use・server_tool_use・各 `*_tool_result`・container_upload が、割当 `表示不要: Claude Code の user のメッセージに現れない (過去ログに届けば UnsupportedBlockMark を出す…)`、経路 `過去ログ` になっている。
  - 凡例 (`docs/ui-coverage.md:28`) は経路 `なし` を「表示していない」と定めている。他の `表示不要` の行はすべて `なし`。
  - 一方で `user/search_result` (`docs/ui-coverage.md:125`) は、同じ仕組み (過去ログの user の許可一覧の外のブロックを印にする) なのに `実装済み: UnsupportedBlockMark (過去ログ)` になっている。
  - `content-blocks.server.test.ts:73` の B 節 33 行の表のテストは全行を印か表示に流すので、この 11 行は実際に印が出る。
- **同種事象探索**: Grep `表示不要.*\| 過去ログ \|` で `docs/ui-coverage.md` に 11 件 (`docs/ui-coverage.md:126,127,128,130-137`)。
- **リスク/影響**: 行は「表示しない」と「印を出す」を同時に言っている。「Claude Code の user に現れない」は quickstart V-4 / V-5 が未実施なので未確認の前提でもある。届いた場合に利用者が見るのは種類名だけの印である。
- **推奨アクション**: 次のどちらかにそろえる。(a) 実際に印を出すので `実装済み: UnsupportedBlockMark (過去ログ)` にし、備考に「現れない見込み」と書く (`user/search_result` と同じ書き方)。(b) `表示不要` のまま経路を `なし` にし、印の話は備考に移す。(a) のほうが SC-004 のテストの表と整合する。
- **根拠**: AD-044 Decision 1 / 凡例の「経路」/ UC-3
- **scope 根拠**: touched files (`docs/ui-coverage.md`)

### [Medium] Tier B の「tool の結果」のブロックに、Tier B とした理由の備考が無い (M-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:110-116` の `web_search_tool_result` 以外の 6 つの結果ブロック (`web_fetch` / `advisor` / `code_execution` / `bash_code_execution` / `text_editor_code_execution` / `tool_search`) と、`docs/ui-coverage.md:117-118` の `mcp_tool_use` / `mcp_tool_result` は、Tier B で表示は「結果の位置に種類名の印」だけ (`content-blocks.ts:84-92`、`serverToolResultOf` が `kind: 'unsupported'` を返す)。
  - これらは AD-044 Decision 2 が Tier A とする「tool の実行と結果」の一種になりうる。
  - 備考は「結果の位置に印 (U-8)」だけで、Tier B にした理由 (Claude Code が実際には emit しない、など) が無い。`mcp_tool_use` だけは「MCP の tool は `tool_use` で届く」と書いてある。
  - Decision 2 は「迷う行は備考に理由を書き、`ui-coverage-reviewer` が妥当性を見る」と定めている。
  - 「emit されない」という前提自体が quickstart V-3 (未実施) に依存している。
- **同種事象探索**: Grep `\| B \| 実装済み: ServerToolCall / UnsupportedBlockMark` で `docs/ui-coverage.md` に 6 件 (`docs/ui-coverage.md:111-116`)。`UnsupportedBlockMark (実行中)` だけの行は 4 件 (`docs/ui-coverage.md:117-120`)。
- **リスク/影響**: server-side の code 実行や fetch が届いたとき、利用者は「何が実行され、何が返ったか」を見られず、種類名しか分からない。`server_tool_use` の入力は出るので、実行の事実は分かる。Tier B のまま印だけで通すか、結果の本文を出すかを決めた根拠が、後から読めない。
- **推奨アクション**: 該当 8 行の備考に、Tier B とした理由と、実機で届いたとき (V-3) の再判定の条件を 1 行足す。例: 「Claude Code は server 側の code 実行を使わない見込み。V-3 で届けば Tier を見直す」。
- **根拠**: AD-044 Decision 2 / UC-4
- **scope 根拠**: touched files (`docs/ui-coverage.md`)

### [Medium] Tier A の `assistant/text` が `citations` を落としている。Tier A の Inline citation も、見直す契機も持ち主も無いまま `未使用` になっている (M-003) (scope: feature)

- **観察**: `docs/ui-coverage.md:105` は Tier A の `assistant/text` を `実装済み: MarkdownText (両方)` とし、備考で「`citations` は読まない」と書く。`content-blocks.ts:60` の `documentPart` も `citations` を読まない。F 節の `docs/ui-coverage.md:318` は Tier A の Inline citation を `未使用` とし、理由を「text の `citations` を MarkdownText に差し込むと AD-034 の境界に触れる」としている。
  - 同じ PR で、`web_search_tool_result` の Sources (出典) は出すようになった (`docs/ui-coverage.md:110`)。本文の主張と出典の対応だけが、どちらの経路でも見えない。
  - AD-019 (`docs/decisions/0019-assistant-ui-element-inventory.md:39`) は Inline citation を Tier A 35 に入れている。
  - 理由はコスト (実装が XSS 境界に触れる) の話で、「利用者が見なくても判断を誤らない」の話ではない。AD-044 Decision 2 の Tier の定義 (A は利用者が見ないと判断を誤るもの) と、説明が噛み合っていない。
  - 「判断し直した結果、組まない」と決めた先 (後続の feature、または理由と再判定の条件) が書かれていない。
- **同種事象探索**: Grep `citations` を src の非テストで探すと content-blocks.ts:60 の 1 件 (コメントのみ、読む実装は 0)。F 節の Tier A で `未使用` のもの (`Inline citation` / `Web search` / `Tool call` / `Message branches` ほか) は他にも複数あるが、いずれも理由か持ち主 (X-6 など) がある。`Inline citation` だけは持ち主が無い。
- **リスク/影響**: citations が届く経路は主に server-side の web search で、Claude Code の主ループには現れない見込みである (spec の Assumptions)。そのため実害は限定的で、High にしない。ただし届いた場合に Tier A の text の一部が黙って落ちる。
- **推奨アクション**: `assistant/text` の備考か F 節の Inline citation の備考に、次のどちらかを書く。(a) `citations` は Claude Code の主ループに現れない見込みで、V-3 で届いたら見直す。(b) 見直す feature の ID。
- **根拠**: AD-044 Decision 2 / AD-019 / AD-028 §5 (持ち主のいない延期) / UC-3
- **scope 根拠**: touched files (`docs/ui-coverage.md`)

### [Medium] `local_command_output` は Tier B のまま。利用者が自分で打ったスラッシュコマンドの出力が 120 コードポイントで切れる (M-004) (scope: feature)

- **観察**: `docs/ui-coverage.md:60` は Tier B で、本文は「伏せ字と切り詰めを通して 1 行」。`notice-rows.ts:303-311` は `redactedBodyLine(r.content)` で、`system-event.ts:27` の 120 コードポイントで切れ、改行は空白に潰れる (`system-event.ts:55`)。
  - 一方で `docs/ui-coverage.md:85` (`informational`、Tier A) の備考は「slash command の出力の文言」を Tier A の理由に挙げている。
  - O-10 の composer の候補 (`docs/ui-coverage.md:75`) は、利用者に `/` コマンドを打つ入口を与えている。
  - 同じ「スラッシュコマンドの出力」が、`informational` では Tier A、`local_command_output` では Tier B になっている。
- **同種事象探索**: Grep `slash command の出力` を `docs/ui-coverage.md` で探すと 1 件 (`docs/ui-coverage.md:85`)。
- **リスク/影響**: `/cost` や `/context` のような複数行の出力は、先頭 1 行ぶんしか見えない。備考には「全文は Claude Code で見られる」と書かれず、spec の Edge Cases (`spec.md:180`) にだけ書かれている。この行を O-2 から Tier B にしたのは今回の PR ではないので、High にはしない。
- **推奨アクション**: `docs/ui-coverage.md:60` の備考に「複数行の出力は先頭 120 コードポイントだけ。全文は Claude Code で見る」と、Tier B のままにする理由を書く。または `informational` の備考の「slash command の出力」の書き方を直し、2 行の Tier の違いを説明する。
- **根拠**: AD-044 Decision 2 / UC-3 / UC-4
- **scope 根拠**: touched files (`docs/ui-coverage.md`、`notice-rows.ts`)

### [Low] 過去ログの変換を実装したのに、A 節と B 節の経路が `実行中` のまま (L-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:58-60,76-79,81,84-86,94,109-121` の行は「過去ログの変換は実装済み。実データに残るかは 022 quickstart V-4 (未実施)」と書きつつ、経路は `実行中`。quickstart-results.md:13 はこれを「実機で『残る』と分かった行だけ『両方』に直す」方針としている。
- **同種事象探索**: Grep `過去ログの変換は実装済み` で `docs/ui-coverage.md` に約 25 件。O-2 の `hook_started` の行 (`docs/ui-coverage.md:61`) と同じ書き方。
- **リスク/影響**: 経路の列は「表示する能力」ではなく「実機で確かめた経路」を意味している、と読めば矛盾しない。ただし凡例 (`docs/ui-coverage.md:28`) にはその定義が無く、読み手は「過去ログでは見えない」と取りうる。実害は小さい。
- **推奨アクション**: 凡例の「経路」に「両方は実機で過去ログに残ると確かめた行だけ。変換の実装だけでは `実行中` / `過去ログ` のまま」を 1 行足す。
- **根拠**: UC-3 (経路の列の誤り)
- **scope 根拠**: touched files (`docs/ui-coverage.md`)

### [Low] 割当に書いた `Sources` が、実在する component 名ではない (L-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:110` の割当は `実装済み: ServerToolCall / Sources (実行中)` だが、`Sources` という component はコードに無い。一覧は `ServerToolCall` の中にあり、F 節 (`docs/ui-coverage.md:362`) も「未取り込み・ServerToolCall の中の一覧を自作した」と書く。
- **同種事象探索**: Grep `ServerToolCall` と `Sources` を src の非テストで探すと、`Sources` を名乗る component は 0 件。`server-tool-call.aui.tsx` の中の一覧の実装だけがある。
- **リスク/影響**: 割当の element 名が実在しない。後で行から実装を辿れない。
- **推奨アクション**: 割当を `ServerToolCall (Sources の一覧を含む)` のように直す。
- **根拠**: UC-1 / 凡例の割当の書式
- **scope 根拠**: touched files (`docs/ui-coverage.md`)

### [Low] H: 「行が `実装済み` なら実装がある」ことを突き合わせる自動のテストが無い (L-003) (scope: out-of-scope)

- **観察**: 項目 21 は割当の書式と集合の一致しか見ない (`docs/ui-coverage.md:15`)。割当の element 名が実在するか、`実装済み` の行の変換が呼ばれているかは、reviewer の目視でしか確かめられない。SC-004 のテスト (`content-blocks.server.test.ts:73`、B 節 33 行 × 経路) が B 節の変換の網羅だけを固定している。L-002 のような名前のずれは、この仕組みでは検出できない。
- **同種事象探索**: Grep `ui-coverage` を `tests/` で探すと `tests/ui-coverage/coverage.test.ts` と `tests/ui-coverage/item21.test.ts` の 2 件で、どちらも element 名の実在は見ていない。
- **リスク/影響**: AD-044 が機械照合しないと決めた範囲 (Decision 4) の話で、O-12 の欠陥ではない。
- **推奨アクション**: 対応不要。必要になれば別の ADR で扱う。
- **根拠**: AD-044 Decision 4
- **scope 根拠**: AD-044 の決定の範囲で、本 PR では直せない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `表示不要.*\| 過去ログ \|` | 11 | `docs/ui-coverage.md:126,127,128,130-137` |
| M-002 | `\| B \| 実装済み: ServerToolCall / UnsupportedBlockMark` | 6 | `docs/ui-coverage.md:111-116` (ほか UnsupportedBlockMark だけの 4 行: `:117-120`) |
| M-003 | `citations` (src の非テスト) | 1 (コメントのみ) | `src/domain/session/content-blocks.ts:60` |
| M-004 | `slash command の出力` | 1 | `docs/ui-coverage.md:85` |
| L-001 | `過去ログの変換は実装済み` | 約 25 | `docs/ui-coverage.md:58-60,76-79,81,84-86,94,109-121` |
| L-002 | `Sources` の component 名 (src の非テスト) | 0 | なし |
| L-003 | `ui-coverage` (tests/) | 2 | `tests/ui-coverage/coverage.test.ts`, `tests/ui-coverage/item21.test.ts` |

## Verdict

- Critical: 0
- High: 0
- Medium: 4
- Low: 3
- Round inheritance: 1 round 目のため該当なし

各 UC の結論:
- UC-1: 違反なし。
- UC-2: 該当なし (SDK の版は不変)。
- UC-3: M-001 / M-003 / M-004 / L-001 / L-002。
- UC-4: 既存行の Tier は不変。新しい B 節の Tier B に理由の不足 (M-002)、M-004 も Tier の整合。
- UC-5: 該当なし (本 PR で足した `後続:` は 0 件)。
- UC-6: 違反なし。
- UC-7: 割当先が O-12 の行は 0。quickstart V-1〜V-5 は未実施と明記。
