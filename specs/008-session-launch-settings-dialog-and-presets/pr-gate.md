# PR Gate Round 4: 起動設定ダイアログとプリセット (X-4)

**Run**: 2026-10-01
**Base**: main (9398450)。未コミットの作業ツリー + 未追跡ファイル
**Diff scope**: 141 files (`.pr-gate-scope.txt`)
**Reviewers**: po / database / platform-boundary (3 本並列)
- 対象を Round 3 の修正箇所に絞った。security / architecture は Round 3 で Medium 以上が 0 件で、Round 3 の修正 (renderer の blocked 分岐、provider-store の版判定) はこの 2 本の担当範囲に入らないため、起動しなかった
- ux / a11y は auto_invoke_patterns に一致しないため起動しなかった

**Rule verification**: 未実行。理由: Round 2 の前に 41 件一致を確認しており、その後、規則定義と fixture を変えていない
**修正後の検証**: lint / typecheck (node・web・e2e) / depcruise / check:constitution はすべて exit 0。unit 1524 / build / E2E 8 も通過
**Round inheritance**: Round 3 の Medium 4 件はすべて resolved
**Convergence (N=4)**: R4 は resolved 4 / new 0、R3 は resolved 1 / new 0。どちらも resolved >= new なので、halt しない

## Verdict

| Severity | This round | Resolved from N-1 | New in N | Net | Suppressed by code-gate |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 0 | 0 | 0 | 0 | 0 |
| Medium | 0 | 4 | 0 | 0 | 0 |
| Low | 6 | — | 4 | 6 | 0 |

**Status**: PASS (Critical=0、High=0、Medium=0)

## Low (6)

| ID | origin | 要旨 | 扱い |
|---|---|---|---|
| L-01 | platform-boundary L-601 | probe が始まらないまま「準備を待っています…」が続く。再評価ボタンが無く、そこから抜けられない | /cl-done の前に直す |
| L-02 | po L-301 | provider の remove 失敗時の文言が「一覧を更新してから」と案内するが、画面に更新の手段が無い | /cl-done の前に直す |
| L-03 | po L-302 | probe-failed の文言に、再評価を繰り返しても失敗する場合の次の一手が書かれていない | /cl-done の前に直す |
| L-04 | po L-303 | WorkspaceFoldersScreen の再試行の挙動にテストが無い | /cl-done の前に直す |
| L-05 | database L-301 | `.bak` の再作成。対象は将来版のファイルだけに縮んだ | 繰越 (X-6) |
| L-06 | database L-302 | provider-service の直列化 | 繰越 (system) |

## System follow-up

- `gate_common::cascade_enforce` が、表セル内の `\|` で列を分割してしまう
- `infra/settings` から `infra/runtime` を再 import するのを止める depcruise ルールが無い
- AD-031 に「未マージ ADR の再採択」と「記録」節を明文化する
- folder-store が schemaVersion を `!==` で判定している
- runtime-store で、確認されなかったランタイムが `probing` のまま残る (platform-boundary L-601 の根本原因。runtime domain)

## Track raw outputs

`<reviewer>.pr-gate.round4.md` (3 本)
