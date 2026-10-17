# Design Gate: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-16T00:00:00+09:00
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 7      | 10  |
| po-reviewer                | 0        | 1    | 3      | 3   |
| architecture-reviewer      | 0        | 0    | 6      | 4   |
| security-reviewer          | 0        | 0    | 2      | 1   |
| platform-boundary-reviewer | 0        | 0    | 2      | 0   |
| **Total (dedup)**          | **0**    | 1    | 14     | 14  |

**Status**: PASS
**Next**: status: tasking → implementing に昇格。/cl-implement を起動できる。ただし tasks.md の開始条件のとおり、U-1〜U-7 と AD-051 の承認が先に要る (analyze G1)。High 1 件 (H-001) は AGENTS.md の規則どおり、この round で直す対象である。

## Critical (Total: 0)

なし。

## High (Total: 1)

### H-001 — 実行中のターンの所要時間がホストの時計とランタイムの時計の差を含む。正の誤差は検出も抑止もされない [origin: po, platform-boundary] [new]

- **Where**: data-model.md:48, :50-53, :87; spec.md:104, :116, :159 (US-1 AC5); AD-051 Consequences (0051:39); plan.md:246 RK-03; research.md:29; quickstart.md:40 (V-3 #4); tasks.md:25, :34, :40, :44
- **Issue**: 実行中、ターンの始まりはホストの時計 (renderer の送信時刻)。終わりは SDK の `timestamp` (ランタイムの時計。WSL ディストロや docker endpoint のコンテナ) か、受信時刻 (ホストの時計) になり、どちらになるかはターンの最後のメッセージの種類で決まる。手当ては負の値を隠すことだけ。正の誤差はそのまま表示に乗り、同じターンでも実行中と過去ログで値が変わる。ADR / plan / research は WSL だけを挙げ、docker の時計には触れていない。実機の確認 (V-3) もテストも、時計が 1 つの前提で回っている。
- **Why high**: US-1 の価値「どれだけかかったか」(AC4) が、本アプリが前提にする構成 (Windows ホスト + WSL) で系統的に誤る。SC-002 のテストでは検出できない。
- **Action**: 最小案は 2 つのどちらか。
  - (a) 既知の限界として受け入れる: AD-051 Consequences / RK-03 / R-02 の書き方を「ランタイム (WSL・docker) の時計」に広げ、US-1 AC5 と Edge Cases に「正のずれは所要時間に乗る。補正しない」と書き、U-3 の承認項目に入れる。
  - (b) 実行中の所要時間を 1 つの時計で計算する: renderer の写しの中だけで受信時刻を持ち、それを `deriveTurns` の `endedAt` に使う。DTO は変えない。
  - どちらでも: quickstart V-3 #4 を WSL ランタイムで行うこと (docker endpoint があればそれでも) と明記する。時計が 2 つのときの `deriveTurns` の単体テストを 1 件足す。

## Medium (Total: 14)

| ID | Title | Origin | Where |
|---|---|---|---|
| M-001 | 過去ログの境界の印は `compact-boundary` だけ。refusal / reset は O-11 まで実行中にしか出ない。US-2 AC1 と FE-022 の fixture が過去ログにも 3 つを求めている (AD-049 D1 で O-11 の範囲) | analyze I1, arch M-005 | spec.md:130, data-model.md:91, tasks.md:57 |
| M-002 | 「ターン」の意味が 3 つある (地図のターン / 使用量タブのターン数 / API の往復)。glossary に反例が無い | analyze T2, arch M-004 | spec.md:160, data-model.md:93, ui-coverage.md:48, SH-001 |
| M-003 | 型に無い `timestamp` が消えても CI が気づかない。`getSessionMessages` の契約テストを足すか、AD-051 に「検出は手動だけ」と書く | po M-003, arch M-003 | tasks.md:34 BE-010, AD-051:29,:38,:55, quickstart.md:37 |
| M-004 | 圧縮の要約 / `is_meta` が偽のターンになることが spec に書かれておらず、後続の担当も決まっていない | po M-002, arch M-006 | spec.md:163, :231-237, plan.md:248 RK-05, research.md:65 |
| M-005 | glossary の SessionMessage が型に無い `timestamp` に触れていない | analyze C1 (+ arch L-002) | glossary.md:867-874, SH-001 |
| M-006 | FR-014 は書き直す行を 4 つと言うが、plan / data-model は Conversation map の行も足して 5 つにしている | analyze I2 | spec.md:32, :196, data-model.md:231-232 |
| M-007 | 同じ UI に名前が 2 つある (「活動の heat graph」と「活動の帯」) | analyze T1 | spec.md:30, :139-153, FR-012 |
| M-008 | `formatMessageTime` に渡す `now` を誰が持ち、どこで差し込むかが決まっていない | analyze U1 | data-model.md:171, FE-010/012/022/031 |
| M-009 | U-1〜U-7 / AD-051 が未承認。実装の前に承認が要る | analyze G1 | spec.md:43-55, tasks.md:9 |
| M-010 | O-9 の帰属の判断が `_overview.md` に無く、session charter の frontmatter も更新されない | arch M-001 | _overview.md:104-120, session/charter.md:7-31, SH-010 |
| M-011 | `toTranscriptMessages` の `now` が既定で `Date.now()` に倒れる。domain で時計を読む最初の箇所になる | arch M-002 | data-model.md:47, plan.md:41, tasks.md:33 |
| M-012 | 地図の行がターンの失敗と中断を示さない。AC1 の「エラーの数」が何を数えるか決まっていない | po M-001 | spec.md:26, :130, data-model.md:90-91 |
| M-013 | renderer の `readMessageTime` が `Date` の範囲外の有限値を受け、描画で RangeError になりうる | sec M-001 | data-model.md:61, tasks.md:39 FE-010 |
| M-014 | registry の取り込みの後に package.json / lockfile の差分が 0 か確かめる手順が無い | sec M-002 | tasks.md:16 SH-002, :82 SH-013, quickstart V-1 |

## Low (Total: 14)

| ID | Title | Origin |
|---|---|---|
| L-001 | 「活動の帯」と既存の Recent activity、ターンの `startedAt` とセッションの `startedAt` が紛らわしい | analyze T3, arch L-001 |
| L-002 | registry の数が 127 から 128 になるが、charter と constitution は 127 のまま | analyze C2, arch L-003 |
| L-003 | 移り先が消えていたときの動き (移らない・何も知らせない) にテストも決めも無い | analyze U2, po L-002 |
| L-004 | 空のビンについて、AC2 の「選べない」と data-model の「フォーカスは止まるが何もしない」が食い違う | analyze U3 |
| L-005 | 帯の範囲が、AC1 では最初と最後のメッセージ、data-model では min / max になっている | analyze I3 |
| L-006 | AD-051 D2 は行の時刻を「受信時刻」と書くが、実際には行を組んだ時刻である | analyze I4 |
| L-007 | data-model の変更箇所の列に、目標の値ではなく今のコード (`null`) が書かれている | analyze A1 |
| L-008 | EARS: FR-003 にキューの条件が無く、FR-010 に「移り先が無ければ移らない」が無い | analyze E1 |
| L-009 | spec の Dependencies に O-5 が無い | analyze D1 |
| L-010 | quickstart V-1 に e2e の typecheck が無い | analyze D2 |
| L-011 | 所要時間に承認待ちの時間が含まれることが書かれていない | po L-001 |
| L-012 | User Story の価値が charter の KPI と結びついていない | po L-003 |
| L-013 | 中央から右のペインへ渡す store が ui charter の「面の状態」に書かれていない | arch L-004 |
| L-014 | 正規表現がオフセットの範囲 (`+99:99`) を検査しない | sec L-001 |

詳しい内容は下の raw outputs にある。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
