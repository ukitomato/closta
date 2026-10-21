# Design Gate: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21T00:20:10Z
**Spec**: specs/021-session-resume/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High  | Medium | Low    |
| -------------------------- | -------- | ----- | ------ | ------ |
| analyze                    | 0        | 1     | 2      | 10     |
| po-reviewer                | 0        | 2     | 9      | 2      |
| architecture-reviewer      | 0        | 1     | 5      | 3      |
| security-reviewer          | 0        | 1     | 1      | 2      |
| platform-boundary-reviewer | 0        | 1     | 3      | 2      |
| **Total (dedup)**          | **0**    | **5** | **16** | **17** |

**Status**: PASS
**Next**: status: tasking → implementing に昇格。`/cl-implement` を起動できる。ただし tasks.md の着手の条件として AD-059 の `accepted` が要る (analyze G1)。High 5 件は AD-050 によりこの round で直す対象 (High を確かめるためだけの round は回さない)。

## Critical (Total: 0)

なし。

## High (Total: 5, dedup 後)

### H-001 — 過去の行の軸の解決が、列挙対象の所在と cwd の出自の所在の一致を見ていない [origin: architecture, platform-boundary] [new]

- **Where**: data-model.md:147-152 (§3.1 段 1 / 段 2), research.md:62, spec.md:184 (FR-005), spec.md:224 (SC-003), tasks.md:24 (BE-001), tasks.md:47
- **Issue**: 段 1 はランタイムを列挙対象の所在から、段 2 (`matchFolder`) はフォルダを cwd の出自 (`wsl-from-unc` など) の名前空間から決める。ホストの config ディレクトリにある UNC 形の cwd の行 (実測 7 件) で { WSL のフォルダ × Win32Runtime } を ok と返し、起動時に `invalid-config`、または `/mnt/c` 経由で { ホストのフォルダ × Win32 } が起動して `resume-failed` になる。BE-001 のテスト表にもこの組み合わせが無い (platform-boundary M-003 を統合)
- **Action**: §3.1 に「出自の種類と名前空間が列挙対象のランタイムと一致する (`locationNamespace` / `isSameNamespace`)」段を足し、外れたら理由のキーで拒否する。BE-001 に 3 行 (ホスト対象 × UNC→WSL フォルダ、ホスト対象 × UNC→`/mnt/c`、`wsl:D` 対象 × `wsl:E` UNC) を足す。FR-005 / SC-003 / R-05 の文言を合わせる

### H-002 — 再開の起動元が 012 の 3 段の規則 (KPI「再利用率」) に反している [origin: po, architecture] [new]

- **Where**: data-model.md:346 (§9.3), research.md:139 (R-12), tasks.md:80-81 (FE-030), contracts/ipc-session-resume.md:39, charter.md:216-218
- **Issue**: 「preset を適用したら preset、それ以外は manual」の 2 値で、初期値のまま再開すると初期値の組の起動元 (`launchOrigin`) を引き継ぐ規則が抜けている。再開が増えるほど `manual` に偏る
- **Action**: §9.3 を 012 data-model §4 の 3 段の規則に揃え、稼働中の行は `launchOrigin`、過去の行は `manual` と明記。FE-030 のテストに 2 ケース足す

### H-003 — SC-001 / SC-007 の合否が「`/cl-done` 前に必須」と「未実施でマージ」で食い違う [origin: po] [new]

- **Where**: spec.md:222 (SC-001), spec.md:228 (SC-007), quickstart.md:5, tasks.md:9 / :98 / :100
- **Issue**: 本 feature の価値を確かめる唯一の SC の合否が真偽で評価できない
- **Action**: マージの条件 (SC-002〜SC-008 緑) と X-9 完了の条件 (V-1 6 通り + V-2) を分けて書き、3 文書の文言を揃える

### H-004 — 「resume は escalation-neutral」の前提を確かめる経路が無い [origin: security] [new]

- **Where**: research.md:15 (R-01), quickstart.md (V-1〜V-7), tasks.md BE-003 / BE-004, src/agents/live-signals.ts:437-445
- **Issue**: CLI で昇格モードで作った過去の会話を再開したとき、実効の権限モードを検査も実機確認もしていない。`init` の `permissionMode` は表示に流すだけ
- **Action**: quickstart に V を 1 つ足す。BE-004 で、再開の `init` が安全 3 値の外のモードを報告したら fail closed にし、テストを足す。R-01 に結果を追記

### H-005 — 失敗の 3 か所の対応づけが実コードと合わない [origin: analyze] [new]

- **Where**: data-model.md §6.4, plan.md:212 (実装方針 agents), tasks.md BE-004, research.md R-07
- **Issue**: `:727` は `fatalSink` (JS 例外) で「init 無しで stream が終わった」経路ではない。そのまま書くと内部例外が `resume-failed` になり、clean な終了 (init 無し) は失敗の呼び出し自体が無い
- **Action**: `:717` (child exit) と `:932` (stream 例外) を `resume-failed` に、`fatalSink` は `process-crashed` のまま (または理由を明記)。init 無しの clean 終了を新しい失敗経路にするなら新設として plan に書く

## Medium (Total: 16, dedup 後)

| ID | Origin | Where | Summary |
|---|---|---|---|
| M-01 | architecture, platform-boundary | data-model.md §2 / §3, BE-001 / BE-014 | renderer が使う型を、パス API に届く `resume.ts` に置いている (`ui-not-to-core` で落ちる) |
| M-02 | architecture | charter.md:167, plan.md:199 (#28), SH-010 | charter の「会話の id を追っていない」が事実でなくなるのに記録対象外 |
| M-03 | architecture | AD-059 読み替えの表 (`0059-…md:29`) | AD-043 Decision 4 (main 経由は状態通知だけ・100ms 窓) の例外を名指していない |
| M-04 | architecture | research.md:55, data-model.md:278 (§8.1) | config-dir の Provider の会話は列挙されず、それまでの会話が必ず読めない帰結が spec に無い |
| M-05 | po | spec.md:101, tasks.md:127 | P1 の US-1 AC2 が P2 の US-4 (FE-040) に依存し、MVP で通らない |
| M-06 | po, analyze (U2) | data-model.md:314 / :320 / :379, tasks.md:57 | `cwd-mismatch` に登録の導線が無く、登録後の再判定も無い |
| M-07 | po | data-model.md:385 | `source-unknown` の文言が稼働中の行に合わない |
| M-08 | po, analyze (U1) | spec.md:78 (U-4), spec.md:192 (FR-010), §9.4 | 過去の区画から再開すると同じ会話の終了済みの稼働中の行が残る |
| M-09 | po | data-model.md:358 (§9.5), charter.md:273-274 | 「やり直す」後に取り消すと失敗の理由が消える |
| M-10 | po | spec.md:141 (US-3 AC4), spec.md:186 (FR-007), data-model.md:342 | 「選び直しを求める印」と「既定に戻して通知」が別の振る舞い |
| M-11 | po | spec.md:120 (US-2 AC2), session-launch-service.ts:31 / :165 | `supervisor-exited` 後に `claude` が残ると同じ会話の 2 本目ができうる |
| M-12 | po | tasks.md:69 (FE-021) | 過去の区画からの再開を通しで見る E2E が無い |
| M-13 | po | data-model.md:63, tasks.md:49 (BE-013) | 再開の受け付け・拒否・`resume-failed` の観測点 (ログ) が無い |
| M-14 | security | data-model.md:153-156, research.md:68, AD-059:45 | 過去の行の再開で資格情報が元と違っても利用者に知らせない |
| M-15 | platform-boundary | plan.md:181 (#15), tests/docs/wsl-free-coverage.test.ts:59-64 | `resume-service.ts` が `WSL_FREE_DIRECTORIES` から外れても検出されない |
| M-16 | analyze (C1) | spec US-2 AC2, BE-006 / BE-020 | `supervisor-exited` 後もレコードが残り再開できることのテストが無い |

## Low (Total: 17, dedup 後)

| ID | Origin | Summary |
|---|---|---|
| L-01 | architecture, platform-boundary | 段 1 の所在 → ランタイムの対応を `locationNamespace` / `isSameNamespace` と別の表として書いている |
| L-02 | architecture | `resume-service` を状態を持つ調停の規則に足すのに説明の履歴を直す手順が無い |
| L-03 | architecture | `SessionSummaryDTO.sessionId` と `conversationId` の対応が glossary に無い |
| L-04 | platform-boundary | `targetKey` の序数がアプリ稼働中にずれうる |
| L-05 | security | C-1 の送り元拒否の戻り値が既存 `handle()` の throw 方針と食い違う |
| L-06 | security | `sessionResumable` の payload の形が data-model と contracts で食い違う |
| L-07 | po | US-2 AC2 の「やり取りは残る」がどこに残るか曖昧 |
| L-08 | po | User Story の benefit が charter の KPI に紐付いていない |
| L-09 | analyze (I2) | `agent-session.ts` の行番号 `:63` / `:125` が逆 |
| L-10 | analyze (I3) | `labels.ts` の同一ファイルの順序に FE-011 / FE-040 が抜けている |
| L-11 | analyze (I4) | `retryTextFor` の置き場を plan が `features/chat/` としている (実際は `LivePane.tsx:164`) |
| L-12 | analyze (I5) | R-09 の参照先 §9.3 は §8.2 の誤り |
| L-13 | analyze (I6) | 「この会話はすでに実行中です」の適用先が spec と data-model で違う |
| L-14 | analyze (I7) | plan の Project Structure の status コメントが古い |
| L-15 | analyze (E1) | FR-003 / FR-004 / FR-015 が複数の義務を 1 文に詰めている |
| L-16 | analyze (C2) | 再開で新しい `sessionId` を採ることを assert するテストが無い |
| L-17 | analyze (D1) | plan の Constitution Check I / II の表題が正文と違う |

参考 (finding ではない): analyze G1 — tasks.md の着手の条件により AD-059 が `accepted` になるまで `/cl-implement` は止まる (020 の先例どおり)。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
