# po-reviewer Review (pr-gate Round 1): transcript の基本表示 (R-3)

**Run**: 2026-09-24 / **Base**: 6d64049...ae3d7e5 (70 files)

## 初回読了 viewpoint

- A. 認可 / 認証 / secret: 該当なし (security-reviewer owner)
- B. 入力検証 / injection / CSP: 該当なし (security-reviewer owner)
- C. 業務不変条件 / Charter・Glossary drift: 該当なし (architecture-reviewer owner)
- D. Constitution / ADR drift: 該当なし (architecture / platform-boundary owner)
- E. User Story / SC / AC / UX: Critical:0 High:2 Medium:2 Low:2
- F. 命名 / module / lint hookup: 該当なし (convention-reviewer owner)
- G. optional reviewer 範囲: 該当なし (E owner)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## 充足を確認した点

AC-4 (reasonKey 配線=M-003 解消)、AC-5 (stale 破棄)、空/失敗+retry/選択なし/composer 無効、US-3 未完 markdown 耐性、SC-003 マウント数一定はいずれも実装・回帰とも良好。

## Findings

### [High] P-H-001 — SC-010 (本 feature 主目的) の done 要件が「空 rubric 表の存在」に矮小化、実機一次判断が R-4 前に期限なく全件未実施 (scope: feature)
- Where: `spec.md:256-261` / `quickstart-results.md:29-32,34` (rubric-a〜d 全て未実施、結論空) / `charter.md:175-182` / `roadmap.md:81,95`
- Issue: 「見栄えを判断できることを受け入れ条件」を「判断する足場が存在する」に読み替え。R-4 は R-3 依存だが実機判断に締切なし
- Fix: (a) 実機一次判断を R-4 着手の前提 gate として roadmap #7 に期限付き明記、(b) 「一次判断」結論行を必須 artifact 化、(c) rubric-a/b が未実施の間 R-4 spec 着手保留を roadmap に記す

### [High] P-H-002 — quickstart-results.md が SC-001 を「自動検証 PASS」と過大表示 (核心=SDK 等価性は V-1 実機 pending) (scope: feature)
- Where: `quickstart-results.md:14` / `ChatScreen.test.tsx:112` (describe「実データ描画」= 合成 fixture)
- Issue: SC-001 の核心「SDK 直呼びとの件数・順序・役割一致」は実機のみ。Vitest は合成 fixture で順序描画のみ。describe 名が合成を「実データ」と誤称
- Fix: SC-001 を「unit 検証 (順序/役割/変換) / SDK 等価性は V-1 実機 pending」に分割表記。PASS 単独表記をやめる。describe 名を訂正

### [Medium] P-M-001 — SC-002/SC-004 (位置飛び 0 = KPI) に自動計測なし、再実装 auto-follow が無テスト (scope: feature) [E+H]
- Where: `spec.md:234-240` (計測経路「Vitest+実機」) / `virtualization.test.tsx` (マウント数=SC-003 のみ) / `thread.aui.tsx:296-358` (stickyRef 等、直接テスト 0)
- Fix: (a) spec 計測経路を「Vitest=マウント数のみ、位置飛びは実機」に正直化、(b) jsdom で可能な stickyRef 分岐/disarm 状態遷移の unit テストを 1〜2 件追加

### [Medium] P-M-002 — SC-010 機械確認 (rubric test) が意味的に空虚 (全未実施も NG も通す、結論を検査しない) (scope: feature)
- Where: `tests/spec-artifacts/r3-quickstart-rubric.test.ts:22-24,43-46`
- Fix: 「記録の存在=done」を貫くなら spec.md に本テストの限界を明記。より望ましくは結論行 非空を R-4 前 gate で検査する後続項目を roadmap に owner 付き登録

### [Low] P-L-001 — SC-003「定数倍以内」の境界が spec 未定義 (テストの方が厳しい) (scope: feature)
- Fix: spec.md:238 に「同時マウント数は総件数に依らず一定 (テストは 200/3,000 で同数要求)」を明記

### [Low] P-L-002 — ErrorState の retrying が常に false で retryingLabel が dead prop (scope: feature)
- Where: `ChatScreen.tsx:92-96`
- Fix: retrying/retryingLabel を渡すのをやめるか、retry 中に ErrorState を保持して retrying=true にするか統一

## Verdict
- Critical: 0 / High: 2 / Medium: 2 / Low: 2
- happy path + 主要 negative case はテスト済み。残課題は SC-010 done 要件の矮小化 + P1 SC の自動検証不在/過大表示 (spec 正直化 + roadmap 期限 + 一部 unit test で解消可)
