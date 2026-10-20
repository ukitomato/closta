# ui-coverage-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-007 (起動拒否の理由の出し方。`claude-not-found` を流用し、細かい理由は descriptor の `claudeStatus` から引く) と FR-013 (承認・ストリーミング・状態通知・監視ビューの行は WSL と同じ経路) だけが本 reviewer の範囲。SC-006 (Constitution 検証。項目 21 を含む) に関係する。
- touched files に該当する charter / Confirmation: session / runtime charter は touched。`docs/ui-coverage.md` は touched files にも diff にも無い。`docs/roadmap.md` は touched。ui charter の Out of scope (起動ダイアログとランタイム一覧は SDK の外の操作 UI) が関係する。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲 (ui-coverage スライス): Critical:0 High:0 Medium:0 Low:0
- H. テスト / coverage / observability / regression: 該当なし: 対応表の行の集合と版は項目 21 が CI で機械検証する。UC-1〜UC-7 は diff に該当する変更が無かった。

## スコープ要約

SDK の emit するメッセージ・ブロック・tool を新しく描く変更は無い。`convert.ts` / `thread.aui.tsx` / `tool-registry.aui.tsx` と agents の SDK メッセージ変換の分岐は diff に無い。SDK の版も変わっていない (`docs/ui-coverage.md` は 0.3.270 のまま)。

## Findings

指摘なし。

- **UC-1**: 該当なし。`src/agents/sdk-agent-session.ts` の差分 (`.pr-gate.diff:4360-4658`) は Win32 の起動の値の検査 (`decodeWin32LaunchSpec`)、プロセス木の停止 (`stopTree`)、spawn の `cwd` / `windowsHide` だけ。`[tree-stop] ...` は stderr への診断で、対応表の行にならない。
- **UC-2**: 該当なし。版は変わっていない。
- **UC-3**: 該当なし。変わるのは `LAUNCH_REJECT_LABELS['claude-not-found']` の文言と `LAUNCH_AXIS_LABELS.runtime` の見出しだけ (`.pr-gate.diff:8966-9000`)。D 節 `launch-failure` (`docs/ui-coverage.md:176`) の理由キー 18 は research R-10 のとおり変わらない。
- **UC-4**: 該当なし。
- **UC-5**: 該当なし。X-8 を指す割当は 0 件 (`docs/ui-coverage.md:308` は `fork (X-6) / resume (X-9)` で X-8 の割当ではない)。
- **UC-6**: 該当なし。起動ダイアログ・ランタイム一覧・`claude.exe` の場所の指定は SDK の外の操作 UI で、行にしないのが正しい。
- **UC-7**: 該当なし。X-8 は M3 の完了の条件に数えない。roadmap の X-8 を「完了」と書く点は po / architecture の範囲。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (なし) | `^diff --git .*(ui-coverage\|convert\|thread\.aui\|tool-registry\|claude-agent-sdk\|package\.json\|pnpm-lock\|assistant-ui)` (`.pr-gate.diff`) | 0 | - |
| (なし) | `後続: X-8\|X-8\|X-9` (`docs/ui-coverage.md`) | 1 (X-8 を指す割当は 0) | docs/ui-coverage.md:308 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Round inheritance: 該当なし (Round 1)
