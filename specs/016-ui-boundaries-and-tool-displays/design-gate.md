# Design Gate: 会話の境界と tool の専用表示の第 2 弾 (O-6)

**Run**: 2026-10-04 (Round 1)
**Spec**: specs/016-ui-boundaries-and-tool-displays/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 6 | 17 | 15 |
| po-reviewer | 0 | 5 | 9 | 5 |
| architecture-reviewer | 0 | 6 | 8 | 4 |
| security-reviewer | 0 | 3 | 6 | 4 |
| platform-boundary-reviewer | 1 | 2 | 3 | 0 |
| **Total (dedup)** | **1** | 12 | 23 | 20 |

**Status**: FIX_REQUIRED (Critical 1)
**Next**: status は tasking に据え置き。C-01 と High を直して Round 2 を回す

**cascade_enforce の誤った降格**: platform-boundary の C-001 を `cascade_enforce` が High に降格したが、本文の最初の `(FE-020)` を指摘の ID として拾い、表の `C-001` の行 (件数 5) と照合できなかったための誤りである (同種事象探索の件数は本文の次の行にある)。根拠は揃っているので Critical に戻した。検査の ID の拾い方の修正は system scope (朝の報告に記録)。

## Critical (Total: 1)

### C-01 — `Read` / `Glob` / `Grep` の UNC の扱いを renderer に置く。accepted の AD-029 §3・§4 / AD-032 と Principle I を守って実装できない [origin: platform-boundary C-001 / architecture H-004 / analyze K1]

- **Where**: spec.md:130, :196 / data-model.md:33-35 / plan.md:26 / tasks.md:27 (FE-020)
- **Issue**: 「UNC の接頭辞を出さない (R-2 FR-042 の規則を使う)」。規則の唯一の入口 `classifyRawPath` (path-api.ts:177) は renderer から届かない (`ui-not-to-core`)。agents も UNC を扱えない (項目 13 / AD-028 §3)。renderer に書けば 2 つ目の判定になり、AD-032 が退けた「文字を落とす」方式になる。FR-042 は IPC の境界のアプリのパスの規則で、会話由来の tool の入力には当たらない
- **Why critical**: Principle I (NON-NEGOTIABLE) と accepted ADR に反する実装しか残らない
- **Action**: tool の入力と結果のパスは会話由来の本文 (AD-034) とし、FR-042 を当てない。UNC を判定も除去もしない。見出しは末尾だけ (`/` と `\` の両方で切る。表示だけ)。全体は既存の ToolFallback / Code diff と同じく本文として出す。AD-049 に記録

## High (dedup 後 12 件)

| ID | 内容 | 出所 |
|---|---|---|
| H-01 | `informational.content` を出す判断 (U-3) は O-2 の「Hook の出力本文を出さない」の例外なのに「変えない」と記録し、隠す判定を `mayCarrySecret` (コマンド向け。URL の資格情報・`Bearer` を通す) に頼る | sec H-001 / analyze S1 / arch M-004 |
| H-02 | Agent plan の markdown: AD-035 D6 の決定 (MarkdownText は任意の文字列を受けられない) に答えず「Trade-off」と呼び替える。描画の方式が無く、別の描画口ができうる | arch H-001 / sec H-002 / analyze U2・I11 |
| H-03 | File tree の作り方 (パス → 木) が無い。`__proto__` のディレクトリで prototype を汚しうる。分解の区切りの規則も無い | sec H-003 / pb M-002 |
| H-04 | `retraction` が O-4 の上限・`finish()` で捨てられうる。取り消した後に agents が同じ id で送り直して戻る。decoder のタスクが無い。AD-047 D2 の読み替えが無い | arch H-002 / pb H-002 / analyze U3・U4・C1 / sec M-005 |
| H-05 | 承認待ちを `toolUseId` で判定するが、承認の要求にその値が無い (足すと session の契約と権限ゲートの核が変わる) | pb H-001 / arch H-003 / analyze U1 |
| H-06 | 結果待ちの判定がセッションの終了だけを見る。中断・応答待ちで結果の来ない tool が「結果待ち」(aria-busy) のまま残る | po H-001 / analyze U8 |
| H-07 | 拒否の取り消しが後追いの `retracted_message_uuids` だけ。SDK の `supersedes` を読まないので fallback のターンの間、拒否された部分と代わりが並ぶ | po H-002 |
| H-08 | US-2 に負のケースの AC が無い (エラー・0 件・打ち切り・text でない Read) | po H-003 |
| H-09 | Task 系: FR-008 と data-model §2 が食い違い、TaskUpdate に題が出ない | po H-004 |
| H-10 | O-2 の M-201 (Tier A の備考の残り) を扱わず、O-11 に移る Tier A の 3 行が M3 の完了の判定から抜ける | po H-005 |
| H-11 | O-11 に送る範囲 (E 節の `rewind_files` / `stop_task` / `background_tasks`・`getSubagentMessages`) が accepted の AD-036 §4 P3・AD-035 D3 と AD-048 D2 に反するのに、ADR の義務に無い。`readFile` / `backgroundTasks` が項目 16 の禁止に無い | arch H-005 / pb M-001 |
| H-12 | ui の feature が session の契約 (`meter` の中身・ストアからの削除・system の subtype) を広げるのに、未承認の判断と session charter に無い | arch H-006 / analyze K3・C3 |

## Medium (dedup 後 23 件) / Low (20 件) — 抜粋。全文は各トラックの raw output

- WebFetch の見出しのパスの秘密と読めない URL (sec M-001)、読み上げの文字列・きっかけ・重ねない相手の誤り (sec M-002 / po M-006 / analyze U7・I5)、列挙の照合 (sec M-003)、markdown で消える本文 (sec M-004)、テストと pin (sec M-006 / pb M-003)
- 過去ログの圧縮の AC (po M-001)、拒否の文言と件数 (po M-002 / analyze I4)、拒否の後の出口 (po M-003)、圧縮の行と境界を並べる理由 (po M-004)、取り消しとスクロール (po M-005)、中身の既定 (po M-007 / sec L-004)、O-2 の申し送り (po M-008)、印を付ける表示の列挙 (po M-009)
- 隠した `detail` の合成 (analyze U5)、行の不変条件 (`opens`・120 / 300・`stopped` の 2 義。arch M-002 / analyze I1・I3・U6)、category の数 (analyze I2)、結果の text の読み取り (analyze A1)
- AD-044 の読み替えと古い参照 (arch M-001 / analyze K2・C2・C4)、過去ログの `informational` (arch M-003)、`conversation_reset` の id (arch M-005 / analyze I7)、AD-045 の依存と Principle の取り違え (arch M-006 / analyze I6)、glossary (arch M-007 / analyze K4)、取り消しの id の形と観測 (arch M-008 / po L-005)
- Low: 行の id の形 (sec L-001 / analyze U10)、pattern を正規表現にしない (sec L-002)、外部の取得 (sec L-003)、US-3 の Why (po L-001)、V-3 の基準 (po L-002)、語の重複 (po L-003)、SC の列挙 (po L-004)、`original_model` (analyze I8)、plan の積み方 (analyze I9 / arch L-001)、AD-020 (analyze I10)、§5 の漏れ (analyze C5)、SC-002 の条件 (analyze A2)、重複 (analyze D1・D2)、vitest-axe (analyze U9)、subagent の divider (analyze U11 / arch L-004)、[ASSUMED] (analyze A3)、Todo list の照合 (analyze K5)、`transcript-dto.ts` (arch L-002)、Inline citation (arch L-003)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
