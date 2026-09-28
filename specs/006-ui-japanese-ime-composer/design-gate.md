# Design Gate: 日本語 composer (X-2)

**Run**: 2026-09-27
**Spec**: specs/006-ui-japanese-ime-composer/spec.md
**Domain**: ui
**Charter**: docs/domains/ui/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- |
| analyze | 0 | 0 | 0 | 3 |
| po-reviewer | 0 | 2 | 3 | 1 |
| architecture-reviewer | 0 | 2 | 2 | 2 |
| security-reviewer | 0 | 1 | 1 | 2 |
| platform-boundary-reviewer | 0 | 2 | 1 | 1 |
| **Total (dedup)** | **0** | **6** | **6** | **9** |

**Status**: PASS (Round 1。**Round 2 再確認済み — 下記「## Round 2」節**)
**Next**: Critical=0 のため status: tasking → implementing に昇格済み。**Round 1 High 6 は Round 2 で全 resolved 確認。Round 2 新規 High 1 (H-101) と新規 Medium も follow-up で解消**。`/cl-implement specs/006-ui-japanese-ime-composer` 起動可能。

**dedup**:
- merged [architecture C-001, po M-003] — two-queue の所有・写像と整合テスト (key: FR-006 / queue consistency)
- merged [security H-001, platform-boundary H-002] — E2E が有効 composer に real 資格情報なしで到達する手段 (key: E2E reachability / credentials)

viewpoint coverage: 全 reviewer A-H 網羅 (rc=0)。cascade_demotions: 全 track 0 (Critical 申告なし)。

## Critical (Total: 0)

なし。architecture-reviewer は accepted ADR drift なしと明言。po-reviewer の candidate-Critical (X-1 FR-019 の in-memory キュー実在) は spec 005:333-339/147-149/209 で実在確認され誤帰属 0 として却下。

## High (Total: 6)

### H-1 — message queue の二層 (X-1 in-memory / composer renderer) の所有と写像が未定義。FR-006/SC-004 が現設計で成立しない恐れ [origin: architecture C-001 ⊕ po M-003]
- **Where**: spec.md:233-234 / spec.md:315-316 / data-model.md:23-24, 52-58 / tasks.md T012, T015 / contracts C-3
- **Issue**: data-model/T015 は「現ターン完了で session.send」= running 中は renderer 保持で送らない設計。だが X-1 の in-memory セッションキュー (still_queued/cancelled) は running 中の sendPrompt で初めて積まれる層。composer 側が完了まで送らないと X-1 層は空で、interrupt 時の still_queued/cancelled が composer 側 item と対応づかない。2 つの queue の真実源・dispatch 主体が未定義 (po M-003: 表示と実挙動の一致 assert も無い)。
- **Why high**: FR-006/SC-004 (中断時に何が残り何が消えたか提示) が成立しない、または二重 dispatch = 誤送信の変種 (Principle VIII)。cross-domain invariant (ui↔session) が未閉鎖。
- **Action**: queue 保持の**単一 locus** を確定 (案 A: composer 側を唯一の保持層とし FR-006 を「意味論を継承」に緩める / 案 B: running 中も即 session.send し renderer は interrupt-receipt を反映、T015 撤回)。SC-004/T012 がその写像を assert する。

### H-2 — Principle VIII (NON-NEGOTIABLE) の IME E2E が「running + queue capability 宣言後」の composer 状態を対象にしていない [origin: architecture C-002]
- **Where**: tasks.md T006 / spec.md:83-88 (US-1 Independent Test) / SC-001
- **Issue**: IME E2E は idle/既定 composer で固定。AD-037 §4 の `if (threadState.isRunning && !hasQueue) return;` のとおり queue capability 宣言 (hasQueue=true) で running 中の Enter 分岐が変わる。この状態でこそ isComposing ガードの先行を検証すべきだが、T006 は running/hasQueue を対象にせず、既存 ChatScreen.test.tsx は isDisabled:true 前提で有効 composer を守らない。
- **Why high**: VIII の中核 (確定 Enter 誤送信) が queue 宣言後 running 状態で回帰しても CI 緑のまま通る。現設計で観察可能な回帰未検出点。
- **Action**: T006 を (a) idle と (b) running+queue capability 宣言済み の両状態で assert に拡張。SC-001 に 2 状態明記。ChatScreen.test.tsx が有効 composer の番人でないことを spec/plan VIII に注記。

### H-3 — IME E2E が「有効 live composer」に real 資格情報なしで到達する手段が未定義 (E2E reachability / credential 境界) [origin: security H-001 ⊕ platform-boundary H-002]
- **Where**: research.md R-04/R-05 / spec.md SC-001 / FR-011 / AD-037 §5
- **Issue**: SC-001 は有効 (isDisabled:false, active phase) な live composer を要し、それには launchSession 成功 = 実行中 WSL runtime と Claude Code 認証が要る。windows-latest CI (WSL/claude 不在) でこの状態に到達する手段 (capability 層 stub / fake runtime 注入) が research/plan に無い。放置すると (i) 無効 composer をテストして自明に通す偽の緑 (SC-006 形骸化)、(ii) CI に real 資格情報を持ち込む面 (Principle V の趣旨違反)。
- **Why high**: NON-NEGOTIABLE VIII の Automated 検証が「番人にならない」状態を grep→E2E 移行後も再現しうる。
- **Action**: research に「E2E が有効 composer に到達する手段」(capability=window.closta の stub / fake runtime 注入フック。既存 src/renderer/src/test-support/capability.ts 活用) を明記。real 資格情報を CI env/secrets に置かないことを FR-011 の非機能条件に固定。基準画像が会話/config を含まないことをガバナンスに追加。T006/T016 に前提タスク追加。

### H-4 — interrupt 以外の終端遷移 (error/crash/provider-error) での queue disposition が未定義 [origin: po H-001]
- **Where**: spec.md FR-006 / Edge Cases (spec.md:184-199) / contracts C-3
- **Issue**: queue 終端意味論が interrupt のみ定義。running 中に積んだ項目がターン異常終了したときの扱い (still_queued 残置/cancelled/次 launch 暴発) が未定義。X-1 の 7 状態機械に running→error は実在。
- **Why high**: 積んだ入力が異常終了時に「静かに消える/表示不一致/復帰後に予期せず送られる」いずれか未定義。queue 経由の予期せぬ dispatch は誤送信の変種 (Principle VIII)。
- **Action**: FR-006 を全終端遷移に拡張、または Edge Cases に「running→error/crash 時の queue は cancelled 扱いで提示」を明記し SC-004 か新 AC に負例追加。

### H-5 — US-1 AC-6 (IME 変換中のマウス送信) に追跡テストが無い [origin: po H-002]
- **Where**: spec.md:101-102 (AC-6) / tasks.md US-1 (T006-010)
- **Issue**: AC-6「変換中にマウス送信ボタン → 未確定文字列が送信されない」に対応テストが無い (`マウス|button|click` tasks 0 件)。AD-037 の二重ガードは keydown の isComposing ベースで、マウス submit を同様に抑止するか Confirmation でも未言及。
- **Why high**: Principle VIII 核心の AC が「自前ガードを足さない」方針でカバーされるか未検証。
- **Action**: AC-6 検証テスト (E2E/component) を US-1 に追加、または既存ガードで担保されないなら FR-001 の担保対象に含めるか AC-6 を範囲外に明記。

### H-6 — FR-011 の日本語フォント provisioning が Principle VI (NON-NEGOTIABLE) の機械検証の死角に落ちる [origin: platform-boundary H-001]
- **Where**: spec.md:198 (Edge case) / FR-011 / research.md R-04 / allowlists.mjs:12,18-24
- **Issue**: Constitution VI 検証スコープは「CI 定義を含める」と宣言するが実体 SCAN_ROOTS/SCAN_FILES は .github/workflows/verify.yml を含まない。実装者が choco/apt/sudo でフォント導入すると VI 違反だが check.mjs 項目 1 が緑のまま通過。
- **Why high**: 本 feature が初めて CI に環境 provisioning を持ち込み、VI の機械検証の穴がこの feature で初めて実害経路を持つ。
- **Action**: FR-011 を「リポジトリ同梱フォント (e2e/ に .ttf commit し Playwright に明示指定) のみ。パッケージマネージャ install を禁じる」と明記。CI provisioning が要るなら SCAN_FILES に verify.yml 追加 (system-scope 後続)。plan Constitution Check VI 行に「font provisioning は Manual で守る」と明記。

## Medium (Total: 6)

- **M-1 — E2E/スクリーンショット検証ハーネスは新規 ADR を起票すべき** [arch C-004]: T001/T002 の e2e scope 編入は AD-023 の機械強制レイヤ規則の適用範囲を変える。後続 deferred 3 項目が積む基盤。T029 を「要否判断」から「ADR 起票」に確定 (先例 AD-036/AD-034)。
- **M-2 — plan.md の Constitution 版参照が v1.0.0、現行 v1.2.6** [arch C-003]: plan.md:150 を v1.2.6 に修正。
- **M-3 — queue 上限到達時の利用者向け挙動に AC/SC/テストが無い** [po M-001]: 上限到達時の観測可能な振る舞いを US-2 AC に追加し SC-003 か新 SC に含める。
- **M-4 — 取消/消失 queue 項目テキストの復帰導線が未定義、draft↔queue 境界が非明示** [po M-002]: draft↔queue item のテキストライフサイクルを FR/data-model で明記。
- **M-5 — Principle V「ログ走査 (会話由来文字列混入 0)」を実装する task/自動検査が無い** [security M-001]: queue/draft slice に「例外・状態遷移で text を console/Error に含めない」テスト、または plan の「ログ走査」task を tasks に追加。
- **M-6 — e2e の depcruise/eslint scope 編入方式が未確定 (global ルール活性化・not-to-test の prefix 穴)** [platform M-001]: e2e は src と別 depcruise 実行にし、not-to-test を ^(specs|tests|e2e) に拡張。T002 の受け入れ条件に明文化。

## Low (Total: 9)

- **L-1** FR-003 が SC 未対応/専用テスト不在 [analyze F-1]
- **L-2** contracts C-5 本文と対応表で FR-012 の扱い不一致 [analyze F-2]
- **L-3** FR-004 が実装機構を hard requirement として断定 (research は未確認と明記) [analyze F-3]
- **L-4** queue/draft の新規表示面 (QueueItemPrimitive) にエスケープ回帰テストが無い [security L-001]
- **L-5** Playwright の postinstall/ブラウザ取得の供給網管理が未指定 (_electron.launch は独立ブラウザ不要) [security L-002]
- **L-6** ui charter の Related Specs が R-4 を「着手中」のまま (T023 で合流修正) [arch C-005 / scope: system]
- **L-7** glossary 追記 (FR-013) の canonical 表記を英語 canonical に揃え message mapping と衝突しない注記 [arch C-006]
- **L-8** eslint base が新設 e2e/ に適用され react-refresh 系の誤ノイズ (T002 で override) [platform L-001]
- **L-9** SC-002/SC-006 の基準画像「正しさ」ゲートが人間 deferred のみで形骸化リスク (承認記録を必須化) [po L-001]

## Track raw outputs

- [analyze.md](analyze.md)
- [po-reviewer.design-gate.md](po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](platform-boundary-reviewer.design-gate.md)

---

## Round 2 (再実行 2026-09-27)

Round 1 の High 6 を design 側で閉じた後、5 トラックを clean-context で再実行し resolved/unresolved/new を追跡した。

### Round 2 Verdict

| Track | Critical | High | Medium | Low | 前 Round 比 |
| --- | --- | --- | --- | --- | --- |
| analyze | 0 | 0 | 0 | 2 | R1 Low 3 全 resolved / new trivial Low 2 |
| po-reviewer | 0 | 0 | 3 | 1 | R1 High 2 + Low 1 + M-003 resolved / new 2 (R2-M-002/003) + still-open 1 (R2-M-001) + downgrade 1 (R2-L-001) |
| architecture-reviewer | 0 | 0 | 1 | 0 | R1 全 6 resolved / new 1 (C-007) |
| security-reviewer | 0 | 0 | 1 | 0 | R1 全 4 resolved / new 1 (M-001) |
| platform-boundary-reviewer | 0 | **1** | 1 | 0 | R1 全 4 resolved / new 2 (H-101, M-101) |
| **Total (dedup)** | **0** | **1** | **6** | **3** | Round 1 High 6 → 全 resolved |

**Round 2 Status**: PASS (Critical=0)。**Round 1 High 6 は全 resolved。**

### Round 2 新規指摘と follow-up 解消

- **[High] H-101** (platform-boundary) — フォント「明示指定」機構が未固定で、H-6 の禁止が「パッケージマネージャ」限定のため
  OS フォント登録という隣接 VI 違反ベクタが残る → **CLOSED**: FR-010 / Edge / AD-038 D4 / research R-04 / plan VI 行 / tasks
  T001/T017 を「**ホストへの永続的フォント変更 (登録・Fonts 複製・fc-cache・パッケージマネージャ等) を一切禁止し、同梱 .ttf は
  非永続注入 (`@font-face`/Playwright) 経由のみ**」に拡張 (禁止を「ホスト永続変更全般」に一般化し隣接ベクタを網羅的に閉じた)。
- **[Medium] security M-001** — capability stub の再利用対象 `test-support/capability.ts` が Vitest 専用で E2E 注入に成立せず →
  **CLOSED**: AD-038 D3 / research R-04 / T030 に注入機構 (E2E 専用 preload を `_electron.launch` 引数指定 + Vitest 非依存の
  純粋 stub factory 再利用 + **production-inert** = 本番 preload 差し替え経路を持たない) を明記。
- **[Medium] po R2-M-002** — error/killed 終端後の still_queued ライフサイクル未定義 → **CLOSED**: FR-006 / data-model / SC-004 /
  US-2 AC-6 / T012/T015 を「interrupt は still_queued 残置、error/killed 終端は cancelled + reset/再 launch で破棄 (持ち越し 0)」に確定。
- **[Medium] po R2-M-001** — queue 上限到達 UX の循環 defer → **CLOSED**: FR-004 / US-2 AC-7 に「上限到達で積み込み拒否+理由提示
  (最古破棄しない)、上限値のみ plan 委ね」と振る舞いを spec で確定 (循環 defer を解消)。
- **[Medium] po R2-M-003** — queued 項目のバイト長 disposition 未定義 → **CLOSED**: FR-003 / C-3 / data-model / T011 に「enqueue 時に
  空・バイト長を検証し空/超過は積まない (空扱いと対称)」を明記。
- **[Medium] arch C-007** — T024 が NON-NEGOTIABLE Principle VIII を in-place 改定するが SemVer 改定手順が未記載 → **CLOSED**:
  T024 に version bump (v1.2.6→v1.2.7 PATCH) + Sync Impact Report + Amendment trail entry + (A)(B) 本文書き直し を明記。
- **[Medium] platform M-101 (scope: system)** — `SCAN_FILES` に verify.yml が無く Constitution VI 宣言と実装が乖離 →
  **DEFERRED (owner 登録)**: system-scope のため T033 で `docs/roadmap.md` に owner 付き後続対応として登録 (AD-038 D4)。
  feature-level は同梱限定 + 非永続注入 + Manual gate で守る。
- **[Low] po R2-L-001** — cancelled 項目テキストの復帰導線 → **CLOSED**: Out of Scope に「提示のみ (再編集不可)」と明記。
- **[Low] analyze R2-N1** — T030 の [US1] タグ欠落 → **CLOSED**: T030 に [US1][US4] を併記。
- **[Low] analyze R2-N2** — entity 表記 casing → T022 (glossary canonical) が統一を担当。

**Round 2 follow-up 後の posture**: Critical 0 / High 0 (H-101 CLOSED) / 実質未 open は M-101 (system-scope。owner 登録済み) のみ。
新規 ADR **AD-038 は proposed → design-gate Round 2 PASS により accepted 相当** (実装完了時に status を accepted へ)。
**再実行 (Round 3) は行わない** — Critical は両 Round 0、Round 1 High 6 は resolved、Round 2 新規 High H-101 は「ホスト永続変更
全般の禁止」という網羅的制約で閉じ隣接ベクタを残さない。これ以上の re-gate は逓減 (infinite regress 回避)。

### Round 2 track raw outputs

各トラックの Round 2 raw は本セッションの subagent handback に記録 (design-gate.md の Round 1 ファイル群とは別 run)。要点は上記
「Round 2 新規指摘と follow-up 解消」に集約した。
