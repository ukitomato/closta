## Specification Analysis Report (013-ui-app-shell / Track A / design-gate R1)

読んだもの: spec / plan / tasks / data-model / research / quickstart、constitution、ui charter、_overview、glossary、AD-025、AD-046、roadmap、ui-coverage F 節。コードは App.tsx、stores/ui.ts、SessionScreen.tsx、SessionListScreen.tsx、ChatScreen.tsx、useTranscript.ts、SessionAttentionAnnouncer.tsx、SessionNavBadge.tsx、RunningSessionList.tsx、useRunningThreadList.ts、session/dto.ts、e2e/* と照合した。未承認の U-1〜U-5 の存在自体は指摘していない。

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|---|---|---|---|---|---|
| H1 | 事実誤り / テストできない SC | HIGH | spec FR-011・SC-003、plan Summary | 既定幅 1100px (window.ts:45) で中央は 1100 − 280 − 320 = 500px。`--thread-max-width: 44rem` を下回り `composer-fullwidth` の基準画像は撮り直し | SC-003 の「更新 0」を外し、撮り直しと人間の承認 (Principle VIII (B)) を tasks に。または E2E では右を畳む |
| H2 | カバレッジの穴 / 事実 | HIGH | FR-006・FR-010、data-model §1、FE-013 | `SessionAttentionAnnouncer.tsx:28` は `screen === 'launch'` で「見ているセッション」を決める。新しい判定が無い。`RunningSessionList.monitor.test.tsx:244-291` も `screen` を使う | data-model §1 に判定の規則。Announcer の改修と monitor テストの書き換えを task に |
| H3 | 既存の受け入れ条件の後退 | HIGH | FR-003・FR-007、data-model §1 | 「閉じて起動し直す」で `selectedId=null` → 今は起動ダイアログが前回の設定と理由つき (X-4 US-1 AC7。SessionScreen.tsx:111-122,449)。新しいシェルでは空の状態 | `launchOpen=true` にするか空の状態に前回の失敗を出すかを決め、テスト |
| H4 | SC と FR の矛盾 | HIGH | SC-001、FR-001・FR-002 | `RunningSessionList.tsx:93` が自分で `<nav>` を描く。サイドバーの `nav` の中に `nav` | SC-001 を「トップレベルの nav が 1 つ」か、RunningSessionList の `nav` を外す例外を FR-002 に |
| M1 | 事実誤り | MEDIUM | research R-02、plan | `SessionListScreen.tsx:736` は hook の宣言。行の選択は `sessions.select` だけ。`setScreen` は :1044 の `'folders'` だけ | 記述を直し「行の選択で中央に出す」は新しい振る舞いと明記 |
| M2 | data-model の誤り | MEDIUM | data-model §5 (past・フォルダ) | `cwdDisplay` は所在が決まらない出自でだけ入る (dto.ts:49-52) | フォルダの表示名 (`useFolderLabels`) を正に、`cwdDisplay` を予備に |
| M3 | 事実誤り | MEDIUM | spec Edge Cases | 「見つからない」の表示は存在しない。行が消えると `hasSelection=false` (useTranscript.ts:177) で未選択の空の状態 | 実際の振る舞いを書くか新しい表示を FR に |
| M4 | E2E のリスク | MEDIUM | FR-003、data-model §2・§6、SH-020 | 「新規起動」がサイドバー・中央の空の状態・畳んだ帯の 3 か所に出うる。strict mode で失敗 | 文言を分けるか E2E をサイドバーに限った locator に |
| M5 | 不足 | MEDIUM | FR-005、FE-010 | 過去のセッションの中央のヘッダの値の出所が無い | data-model に past のヘッダの項目と出所 |
| M6 | 不整合 | MEDIUM | spec Assumptions「幅 900px 未満」、data-model §2 | 自動の畳みは 1080px から。900px は他に無い | data-model の参照に |
| M7 | 不足 | MEDIUM | FR-002、plan RK-04 | 280px に SessionListScreen (取得時刻・取り直し・Outcomes・チップ) を中身を変えずに入れる。崩れたときの手当てが無い | リスクに足し、FE-011 で外す範囲を明記 |
| M8 | 不足 | MEDIUM | data-model §1 | 2 つのストアが選択を保つので、稼働中と過去の両方の行が選択中に見える | `focus` でない側の強調を外す規則 |
| M9 | Constitution XIII | MEDIUM | FR-008、SH-002 | 照合の記録先が PR の説明 / F 節の備考 / research に割れている | PR の説明を必須にし他は写し |
| M10 | 参照誤り | MEDIUM | SH-002 | 「`docs/discovery.md` の element の取り込みの手順」は存在しない | 直すか消す |
| L1 | 事実 | LOW | research R-04、ui-coverage.md:268 | F 節の「Empty state: 未使用」は古い (既に使用) | SH-010 で直す |
| L2 | 用語 | LOW | FR-013 | 「中央の本体」が FR-013 の語の一覧に無い | 揃える |
| L3 | 不整合 | LOW | US-4 AC5、data-model §5 | AC5 の「題」が §5 に無い | 合わせる |
| L4 | テストの書き方 | LOW | FE-042 | 「出せないタブ→最初のタブ」を試すタブが無い | テスト用のタブを差し込む方法 |
| L5 | a11y | LOW | US-3 AC2、FR-009 | 「登録」から開いた場合も「設定」のボタンに戻る | 開いた元の要素に戻す |
| L6 | 追随漏れ | LOW | tasks | e2e/README.md:46、WorkspaceFoldersScreen.tsx:249、SessionNavBadge.tsx:12 のコメント | SH-010 / SH-020 に |
| L7 | 構成 | LOW | spec の FR の並び、FR-013 | FR-014/015 が FR-007 の前。roadmap の「順」の振り直しに触れていない | 並べ直し、振り直しを注記 |
| L8 | カバレッジ | LOW | FR-001 | サイドバーを手で畳むテストが無い | FE-014 / FE-042 に |

**Coverage Summary Table:**

| Requirement | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | ✅ | FE-010, FE-014, FE-041 | L8 / H4 |
| FR-002 | ✅ | FE-010, FE-011, FE-012, FE-014 | M7 |
| FR-003 | ✅ | FE-010, FE-014 | H3 |
| FR-004 | ✅ | FE-002, FE-013, FE-014, SH-020 | |
| FR-005 | △ | FE-010 | M5 |
| FR-006 | △ | FE-013, FE-014 | H2 |
| FR-007 | ✅ | FE-020, FE-021, SH-020 | |
| FR-008 | ✅ | FE-030, FE-031, SH-002 | |
| FR-009 | ✅ | FE-001, FE-011, FE-031 | |
| FR-010 | ✅ | FE-001, SH-011 | H2 |
| FR-011 | ✅ | SH-020, SH-011 | H1 |
| FR-012 | ✅ | SH-011 V-2 | |
| FR-013 | ✅ | SH-001, SH-010 | L2 |
| FR-014 | ✅ | FE-040, FE-041, FE-042 | |
| FR-015 | ✅ | FE-040, FE-042 | M2 |
| SC-001〜SC-006 | ✅ | | SC-001 H4 / SC-003 H1 |

**Constitution Alignment Issues:** MUST の違反は 0。VIII (B) の前提の誤り (H1)、XIII の記録先 (M9)、XIV の語の揺れ (L2)。

**Metrics:** Requirements 21 (FR 15 / SC 6) / Tasks 20 / Coverage 100% (部分 2) / Ambiguity 4 / Duplication 0 / **Critical 0** (HIGH 4 / MEDIUM 10 / LOW 8)
