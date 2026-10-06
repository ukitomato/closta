# Design Gate: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-04 (Round 1)
**Spec**: specs/012-ui-thread-search/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer, database-reviewer (optional の追加。永続化を伴うため) (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
|---|---|---|---|---|
| analyze | 0 | 5 | 7 | 6 |
| po-reviewer | 0 | 3 | 6 | 3 |
| architecture-reviewer | 0 | 3 | 6 | 3 |
| security-reviewer | 0 | 1 | 3 | 3 |
| platform-boundary-reviewer | 0 | 0 | 2 | 1 |
| database-reviewer | 0 | 1 | 6 | 3 |
| **Total (dedup)** | **0** | 10 | 20 | 14 |

**Status**: PASS (Critical 0)
**Next**: status は tasking → implementing。**ただし本 spec は未承認の判断 (U-1〜U-6)・proposed の AD-045 / AD-046・未マージの O-7 に依るので、/cl-implement には入らない。** High 10 件は gate の後に spec / data-model / plan / research / tasks / quickstart / AD-045 で手当てした。手当ては再レビューを受けていない

## High (dedup 後 10 件)

| ID | 内容 | 出所 | 手当て |
|---|---|---|---|
| H-01 | 起動元の記録を `ipc.ts` に置くと Vitest で測れず、既存の分担 (`session-ipc.ts`) に反する | arch H-001 / analyze U1 / pb M-002 | `handleLaunchSession` に置く。どの起動元でも service に同じ引数で 1 回のテスト (FR-010 / BE-042) |
| H-02 | AD-045 の status (proposed / accepted) の前提が文書で食い違う | arch H-002 / analyze I1 | AD-045 の accepted を着手の条件に。SC-007 / V-2 を accepted に。XV の改定は MINOR で本 PR (U-3 / FR-014) |
| H-03 | ui の feature が session の操作 UI と domain / main を変えるのに、承認を求めるのが U-2 だけ | arch H-003 | U-5 を足す。ui / session charter に 1 行ずつ (FR-016) |
| H-04 | KPI「再利用率」の定義 (全軸を手で選ぶ) と分類 (適用 / 非適用) がずれ、拒否の後の再試行が manual になる | po H-001 / arch M-003 / analyze U3 | U-6 を足す (KPI の文言を改める)。`lastOrigin` で再試行も preset (FR-009 / US-4 AC6 / SC-005) |
| H-05 | Thread search の 0 件が `filtered-out` に合流し、語を消す操作が無い | po H-002 / analyze I2 | 新しい `search-empty` (語と絞り込みをすべて解除)。`filtered-out` は変えない (data-model §1 / §5) |
| H-06 | 会話内検索が「追加分だけ」を走査し、ストリーミングで伸びる本文を数えない | po H-003 / analyze U5 | 変わったメッセージを走査し直し、`current` をキーで保つ (data-model §2) |
| H-07 | 強調が正規化後の位置を元の text node に使い、例外・誤った範囲の強調になる | security H-001 / analyze U6 | 2 つの位置の表で写し、範囲外は飛ばす。長さの変わる文字のテスト (data-model §2 / US-2 AC8) |
| H-08 | 将来版のファイルを退避して空から書き始め、ダウングレードで記録が途切れる | database H-001 | 将来版は書かない (`storeNewerVersion`)。読み込みの結果の表を既存の store に合わせる (data-model §4) |
| H-09 | 会話内検索のバーの Enter に IME の変換中のガードが無い (Principle VIII) | analyze C1 | FR-003 と US-2 AC7。`e2e/ime.spec.ts` に Ctrl+K / Ctrl+F の 1 ケース (arch M-006 も) |
| H-10 | 起動元を capability まで運ぶ renderer の経路 (store・型・stub) が計画に無い | analyze U2 / arch M-001 | FR-009 と plan に経路を明記。切り出しの発動条件に当たらない判断を申し送りの表に |

## Medium / Low (抜粋。全文は各トラックの raw output)

- 照合先 `cwdDisplay` は登録フォルダで null → グループの見出しの文字列を対象に、`cwd.value` は使わない。plan の Principle I の根拠を直した (pb M-001 / analyze T1)
- 検索語から `RegExp` を組まない (security M-002)、`::highlight()` はバンドルされる CSS と既存のトークン (security M-001 / arch L-003)、V-3 は本番ビルドで
- 記録の失敗の観測点 (理由キーと errno だけ) (security M-003 / po M-005 / database M-006)、全チャネルが `handle()` 経由のテスト
- 読み込みの結果の表 (日単位の不正・読めないと記録なしの区別・退避の失敗・成功してからメモリ・時計の先跳び・一時ファイルの後始末・`.bak` の重複) (database M-001〜M-005 / L-001〜L-003)
- 未登録グループの畳み (po M-001)、モーダルの間の Ctrl+K / Ctrl+F (po M-002 / security L-002)、013 の「1 つの一覧に混ぜるか」を閉じる (po M-003)、SC-002 を構造の条件に (po M-004 / analyze A1)
- E2E の記録は fake (arch M-005)、暦日の計算は domain (arch L-001)、O-9 の session の契約の注記 (arch L-002)、呼び名を「起動の利用記録」に (arch M-004)、`session-search.ts` に改名 (analyze T2)、`narrowToLocation` (analyze F1)、`getLaunchUsage` の戻り値 (analyze F2 / security L-003)、HostPath (pb L-001)、Constitution XV は MINOR (arch M-002)

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
- [database-reviewer.design-gate.md](./database-reviewer.design-gate.md)
