## Specification Analysis Report (012-ui-thread-search / Track A / design-gate R1)

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| I1 | Inconsistency | HIGH | SC-007 / quickstart V-2 / tasks.md:9 / FR-014 | SC-007 と V-2 は「AD-045 が proposed で存在」を合否にするが、実装は accepted の後 | 「AD-045 が accepted、XV の改定の PR が決まっている」に、または「proposed 以上」と改定の扱いを明記 |
| U1 | Underspec / Testability | HIGH | plan・research R-05・BE-042 | 記録を `ipc.ts` に置くと Vitest で読めない (ipc.ts:244-247,255-257)。置き場は `session-ipc.ts` の `handleLaunchSession` (:137-144) | `handleLaunchSession` に置き `SessionIpcDeps` に `recordLaunch`。Project Structure に `session-ipc.ts` |
| U2 | Underspec | HIGH | plan・FE-040 | renderer の経路 `LaunchDialog.launch` → `session.launch(config)` (:60,354) → `SessionScreen.tsx:119` の `store.launch` → `running-session-store.ts:359` の `launchSession(config)`。署名・O-7 の後継・store・`test-support/capability.ts` が計画に無い | 経路のファイルを plan と FE-040 に明記、origin が capability まで届くテスト |
| C1 | Constitution (VIII) | HIGH | FR-003 / US-2・FE-020 | 会話内検索のバーの Enter / Shift+Enter に IME 変換中のガードが無い | FR-003 に `isComposing` / 229、US-2 に AC、FE-022 に観点 |
| I2 | Inconsistency | HIGH | US-1 AC3 / FR-001 / data-model §5 / SessionListScreen.tsx:1050-1062 | `filtered-out` の文言と解除の操作が AC3 と合わない。語だけで 0 件のとき解除しても 0 件のまま | 文言と解除の操作を §5 で決め AC3 を合わせる |
| I3 | Inconsistency | MEDIUM | FR-012 と data-model §4 | 読めないときの扱いが食い違う。再試行の時期が無い | 退避は parse の失敗と版違いだけ。read-failed の後の再試行 (`storeReadFailed` と同じ形) |
| U3 | Underspec | MEDIUM | FR-009・plan | 拒否・失敗の後の作り直しでプリセットの起動の再試行が `manual` になる。KPI の定義とのずれも | 再試行で origin を引き継ぐか決め、Edge Cases と charter に |
| U4 | Underspec | MEDIUM | FR-003 / data-model §2 | 会話内検索の本文の出所 (過去は ChatScreen の runtime、稼働中は running store) と中央のヘッダから読む方法が無い | hook の入力と 2 つの供給元を §2 に |
| U5 | Underspec | MEDIUM | data-model §2 | ストリーミング中の最後のメッセージの伸び・配列の差し替えを拾えない | 最後のメッセージは再走査、配列の同一性が変わったら全走査、current は messageId で保つ |
| U6 | Underspec | MEDIUM | data-model §2 強調 | NFKC 後の位置が元の offset と対応しない。text node をまたぐ一致 | 対応表か、強調だけは NFKC をかけない一致 |
| A1 | Ambiguity / Testability | MEDIUM | SC-002 | 50ms が間引きを含むか不明。jsdom の時間は不安定 | 走査の純関数で測り、間引きを除く (または件数の上限) |
| U7 | Underspec | MEDIUM | FR-001 / Edge Cases | 段階取得と truncated で、読み込み済みの行だけを探すことの規則が無い | Edge Case と Empty state の文言に「読み込み済みの範囲」 |
| T1 | Terminology | MEDIUM | Summary / US-1 / FR-001 | 登録フォルダの表示名は DTO に無い。placeholder に無いフィールド | 対象の呼び名か、フォルダの表示名 (folderLabels) を足すか |
| U8 | Underspec | LOW | data-model §3 | 稼働中と同じ sessionId の過去の行の重複。他のダイアログが開いているときの Ctrl+K | 重複の除き方と modal の扱い |
| F1 | Factual | LOW | plan:27 | `applyLocationFilter` は無い (実名は `narrowToLocation`。:706)。`thread.aui.tsx:770` は :771 | 名前を直す |
| F2 | Factual | LOW | FR-013 と data-model §4 | 「2 つの数だけ」と `{preset, manual, days}` | 揃える |
| T2 | Terminology | LOW | research R-02 | `features/search/match.ts` が `src/domain/session/match.ts` と名前がぶつかる | `session-search.ts` などに |
| F3 | Factual | LOW | ui-coverage F 節:268 / FR-015 | Empty state は既に使用。F 節の使い道の書式が無い | FR-015 で書式を決め、既存の使用も直す |
| D1 | Duplication | LOW | US-1 AC5 | 「開いて戻る」はタブの時代の言い方 | 「中央を切り替えても語が保たれる」 |

## Coverage

FR-001〜FR-016 / SC-001〜SC-007 のすべてに task がある (部分: FR-001 I2・U7、FR-003 C1・U4、FR-005 U5・U6、FR-009 U2・U3、FR-010 U1、FR-012 I3、FR-014 I1、FR-015 F3。SC-002 A1、SC-005 U1、SC-007 I1)。

## Constitution Alignment

違反 (CRITICAL) は無い。VIII: 検索のバーの IME ガード (C1)。XV: 承認待ちは指摘対象外、SC-007 と着手条件の矛盾 (I1) だけ。XII: F 節の付け替えは O-9 の登録と同じ PR。確認済みの事実は記述どおり (F1 を除く)。

## Metrics

要件 23 (FR 16 / SC 7) / タスク 18 / カバー率 100% / 曖昧 1 / 規定不足 8 / 重複 1 / **CRITICAL 0** / HIGH 5 / MEDIUM 7 / LOW 6
