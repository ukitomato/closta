# platform-boundary-reviewer レビュー: セッション監視ビュー (O-1)

**Run**: 2026-10-02T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC:
  - FR-001〜FR-004 / SC-001: 強調・件数 (一覧とナビ)・live region。すべて renderer の中で完結し、境界への影響はない
  - FR-005 / FR-006 / SC-002: 経過時間・直近の活動。パス文字列は plain text に畳むだけで、解決も再 branding もしない
  - **FR-007 / SC-002**: 枠の使用数 = `countOccupying` + 起動要求中の +1。main の判定 (`session-launch-service.ts:124,189`) との整合を確認した
  - **FR-008**: compact の行。隔離バッジの置き場を明記した (isolation charter Journey 2)
  - **FR-010 / SC-006**: `src/main`・`src/preload`・`src/agents`・`src/domain` の差分 0。quickstart V-5 と SH-092 の `git diff` で確かめる
  - **FR-011 / SC-004**: E2E から強調を外した (USER 決定)。SH-031 は `e2e-capability.ts` を変えない
  - **FR-012 / SC-005**: `perf/` の実機計測 (安全柵・composition が本物であることの確認・後始末)
- touched files に該当する charter / Confirmation:
  - isolation charter `:71-72` / `:118` / `:127`
  - AD-038 D2 / D3 / D4 / Confirmation (`0038:109-119`)
  - AD-043 Decision 3 / 5 / Confirmation
  - Constitution Principle VI Verification (`constitution.md:503-506`)
  - `allowlists.mjs:4,12`、`.dependency-cruiser.js:137-141`、`eslint.config.mjs:171-179`、`verify.yml:147-150`
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。申し送り: `perf/` は実資格情報を持つ未パッケージの実アプリを Playwright 制御下で起動する。この面は A 観点で見ること
- B. 入力検証 / injection / CSP / 暗号: 該当なし: 直近の活動の plain text 化 (XSS 境界) は security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:1 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer は optional reviewer ではない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

### 固有観点 (PB-1〜PB-7)

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: 該当なし。新しい IPC・永続化・設定ファイルを持たない (data-model §3)。tool の入力に含まれるランタイム名前空間のパスは、`toActivityLine` で表示用の文字列に畳むだけで、解決しない
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。追加する値 (`statusSince` / `activity`) のキーは sessionId である。`density` は表示状態でランタイムを持たない。perf のランタイム指定 (`CLOSTA_PERF_RUNTIME`) はディストロ名で、一意である
- **PB-3 (`capabilities` の虚偽表明)**: 該当なし
- **PB-4 (権限ゲートの迂回)**: 該当なし (確認済み)。perf は UI の起動ダイアログを既定の権限モードで通り、承認カードに応答しない (FR-012 末尾、tasks SH-032)。Auto / bypass へ入る入口は増えない
- **PB-5 (多段パス変換の欠落)**: 該当なし
- **PB-6 (実質的な永続環境の構築)**: R1 の L-002 は解消した。残る問題は、後始末の経路が Playwright のタイムアウト時に動かないこと (M-002)
- **PB-7 (lint ルール自体の網羅性)**: R1 の M-003 は大筋で解消した。ただし死角の記録先が誤っている (M-001)。安全柵を持つ `playwright.perf.config.ts` は、どの静的検査にも掛からない (L-002)

## スコープ要約

R1 の後の改訂で、次の 4 点が変わった。

- FR-011 から強調を外し (USER 決定)、SC-006 の対象を `src/main|preload|agents|domain` の差分 0 に揃えた。quickstart V-5 と SH-092 に `git diff --name-only` を置いた
- `slotUsage` を domain の `countOccupying` + `launch.phase === 'launching'` の +1 に改めた
- FR-008 に、compact でも隔離バッジを行に出すことを明記した
- `perf/` に分離 (eslint の ignores・depcruise の `not-to-test`・`perf/tsconfig.json`)、安全柵 (CI での例外、`CLOSTA_E2E` を検知して失敗、env からの除去、composition の確認)、後始末 (timeout、`finally` での強制終了、各回の `wsl.exe` / WSL 内 `claude` の数の確認) を掛けた

突き合わせの結果:

- **renderer で閉じる主張と E2E は整合した。**
- **枠の数え方は、main の `countOccupying(registry) + reserved` と同じ値になる。** registry への登録と `reserved` の減算は同じ同期区間で起き (`session-launch-service.ts:203-213`)、renderer では `order` への追加と `phase: 'entry'` への遷移が同じ `setState` で起きる (`running-session-store.ts:279-284`)。handshake 前に届いた状態通知は `statuses` には入るが `order` には入らないので二重に数えない。ただし +1 は、UI が起動を直列化していることに暗黙に依存する (L-001)

残る指摘は 2 点: `perf/` の死角の記録先が AD-038 D4 の誤った引用 (M-001)、`finally` での後始末は Playwright のタイムアウトでは動かない (M-002)。

## R1 の指摘の解消状況

| R1 ID | 状態 | 根拠 |
|---|---|---|
| H-001 (FR-011 の強調と SC-006 の衝突) | **resolved from prev** | `spec.md:196-197`、`spec.md:51` / `:229` (USER 決定)、`tasks.md:82`、`spec.md:244` (SC-006) |
| M-001 (実アプリで動いたことの保証) | **resolved from prev** | `tasks.md:84`、`research.md:50`、`spec.md:243`、`quickstart.md:28` |
| M-002 (後始末とプロセス残留) | **resolved from prev** (実装の形に残余あり → new M-002) | `tasks.md:87-89`、`research.md:52-54`、`quickstart.md:29,33` |
| M-003 (`perf/` が走査範囲外) | **resolved from prev** (記録先の誤りは → new M-001) | `plan.md:174-182`、`tasks.md:12` |
| M-004 (枠を再実装し、予約を数えない) | **resolved from prev** (暗黙の前提 → new L-001) | `data-model.md:56`、`spec.md:139,176`、`tasks.md:18` |
| M-005 (compact と隔離バッジ) | **resolved from prev** | `spec.md:185`、`plan.md:65,126`、`tasks.md:71,98`、`research.md:39,41` |
| L-001 (CI で走らない保証が慣行頼み) | **resolved from prev** | `plan.md:182`、`tasks.md:84` |
| L-002 (transcript が残ること) | **resolved from prev** | `quickstart.md:8,36`、`research.md:57`、`plan.md:49` |
| L-003 (SC-006 に preload / domain が無い) | **resolved from prev** | `spec.md:191,244`、`quickstart.md:46-52`、`tasks.md:101` |

## Findings

### [Medium] `perf/` を「AD-038 D4 と同じ死角」とし、roadmap の D4 項目に併記するという記録は ADR を誤って引用している。D4 の死角は `SCAN_FILES` に verify.yml が無いことであり、`e2e/` / `perf/` というディレクトリの死角には持ち主がいない (M-001) (scope: feature) — new

- **観察**:
  - `plan.md:73` は「D4 e2e は check.mjs の死角」と書き、`plan.md:181` は「`perf/` は `e2e/` と同じく check.mjs の死角である。… roadmap の AD-038 D4 の項目に `perf/` を併記する」と書く。同じ内容が `plan.md:167`、`tasks.md:98` にもある
  - しかし AD-038 D4 (`docs/decisions/0038-e2e-screenshot-harness.md:80-83`) が死角として記録したのは、「`SCAN_FILES` は `.github/workflows/verify.yml` を含まず、font provisioning の VI 違反を機械検出できない」ことである。`e2e/` ディレクトリが `SCAN_ROOTS` の外にあることではない
  - roadmap の該当項目 (`docs/roadmap.md:128-132`) も、作業内容は「`SCAN_FILES` に verify.yml を追加する」である
  - したがって、その項目が完了しても `perf/` と `e2e/` は走査されない。持ち主のいない死角が「記録済み」と扱われる
  - **自己訂正**: R1 の M-003 で本 reviewer は「AD-038 D4 が死角として明記済み」と書き、「AD-038 D4 の roadmap 項目に `perf/` を併記」を勧めた。これは本 reviewer の事実誤認である。plan はそれに従っている
- **同種事象探索**: `D4` を spec dir で検索 → 4 件 (`plan.md:73`、`plan.md:167`、`plan.md:181`、`tasks.md:98`)。`SCAN_ROOTS|SCAN_FILES|死角` を `docs/roadmap.md` で検索 → 1 件 (`:129`。`SCAN_FILES` の verify.yml 追加のみ)。`e2e` を `allowlists.mjs` で検索 → 0 件
- **リスク/影響**: Principle VI Verification は、ディレクトリ単位で範囲の外に置かないことを求めている。`perf/` は唯一、実資格情報・実 WSL・実 `claude` を動かす自動化コードである。後で `wsl.exe` の直接起動を足しても check.mjs は検出しない。死角の解消を引き受ける持ち主がどこにも登録されない。現時点の perf は子プロセスを自ら起こさないので、実害はない
- **推奨アクション**:
  - (1) `plan.md:73` / `:181` の「D4 の死角」という引用を改める
  - (2) roadmap には、D4 項目への併記ではなく**別の system-scope 項目**として登録する (「`SCAN_ROOTS` に `e2e` / `perf` を足すか、足さない理由を ADR で決める」。`allowlists.mjs:4` は追加に ADR を要する)。`tasks.md:98` も同じく直す
  - (3) 代わりの手当てとして、`perf/` に process 起動 API を書かないことを plan の機械強制の表に明記し、SH-032 の観点に「perf が子プロセスを起こさない」を足す
- **根拠**: Constitution Principle VI Verification (AD-024 #5)、AD-038 D4、`allowlists.mjs:4,12,47-56`
- **scope 根拠**: feature の plan / tasks の記述と、roadmap への登録で直せる。走査範囲の変更そのものは ADR を要するので system scope に送る

### [Medium] 実機計測の後始末を test 本体の `finally` に置くと、Playwright のタイムアウトでは確実に動かない。後始末が最も要るのはまさにその場合である (M-002) (scope: feature) — new (R1 M-002 の残余)

- **観察**:
  - `tasks.md:89` は「test の timeout を明示 / `finally` で一覧の強制終了の操作で全セッションを止めてから `app.close()`」とする。`research.md:54` と `plan.md:194` (RK-07) も同じである
  - Playwright は test 本体がタイムアウトすると、本体の Promise の完了を待たずにテストを失敗とし、`afterEach` / fixture の teardown へ進む。本体の `finally` は実行が保証されない
  - その後、worker の終了で Electron の main が外から止められ、main の正常な終了処理 (`dispose()`) を経ない
- **同種事象探索**: `finally|afterEach|afterAll|fixture|teardown` を spec dir で検索 → 3 件 (すべて `finally`)
- **リスク/影響**: タイムアウトの回だけ後始末が走らない。WSL 内の `claude` が残った場合、利用者のトークンを消費し続ける。AD-043 Decision 5 の残余と同じ形である
- **推奨アクション**:
  - SH-032 / research R-07 の後始末を「`finally`」から「**`afterEach` (または fixture の teardown)**」に改める
  - teardown は 3 段: 一覧の強制終了の操作で全セッションを止める → `app.close()` → 期限を超えたら `app.process().kill()`
  - hook の timeout は test の timeout とは別に明示する
  - quickstart V-3 に「`claude` が残っていたら止める手順」を 1 行足す。残っていた場合は RK-07 のとおり X-6 に記録する
- **根拠**: AD-043 Decision 5 / Confirmation、spec FR-012、Constitution Principle III
- **scope 根拠**: feature の tasks / research / quickstart で直せる

### [Low] 起動要求中の +1 を単一の値 `launch.phase` から数えており、ストアが許す並行起動 (`inFlight` の計数) と一致するのは UI が起動を直列化しているからである (L-001) (scope: feature) — new (R1 M-004 の残余)

- **観察**: data-model / tasks は起動要求中を `launch.phase === 'launching' ? 1 : 0` で数える。ストアは起動要求を計数 `inFlight` で持ち、並行起動を正当な使い方としてテストしている (`running-session-store.test.ts:140-159`)。並行起動中に 1 本目の handshake が返ると `phase: 'entry'` になり、2 本目が main の `reserved` に残っているのに +1 が消える。現在は `SessionScreen.tsx:109` が `launching` の間ダイアログを出さないので、UI からは並行起動に到達しない
- **同種事象探索**: `launch.phase` を spec dir で検索 → 2 件 (`data-model.md:56`、`tasks.md:18`)。`inFlight` を `src/renderer/` で検索 → `running-session-store.ts` の 8 箇所 (state には出ていない)
- **リスク/影響**: 起動ダイアログの到達条件が変わると、枠の表示が main より少なく出る。現時点の実害はない
- **推奨アクション**: (a) data-model §2 の `slotUsage` に「起動要求は UI で直列化されている」前提を 1 行書く、または (b) ストアの state に起動要求の件数を出して足す (renderer 内の変更で FR-010 に反しない)。どちらでも SH-003 の観点を足す
- **根拠**: AD-043 Decision 3、spec FR-007 / Edge Cases
- **scope 根拠**: feature の data-model / tasks で直せる

### [Low] CI の安全柵を持つ `playwright.perf.config.ts` は、eslint の ignores に入り、`perf/tsconfig.json` の範囲にも入らない。どの静的検査にも掛からない (L-002) (scope: feature) — new (R1 L-001 の残余)

- **観察**: `plan.md:178` は `playwright.perf.config.ts` を eslint の ignores に足し、型検査の対象は「`perf/` と `e2e/support/`」でルートの config を含まない。CI での例外という機械ガードは、この型検査されないファイルに置かれる
- **同種事象探索**: `playwright.perf.config.ts` を spec dir で検索 → 型検査の対象に含める記述は 0 件
- **リスク/影響**: ガードの綴りの誤りや import の誤りが静的に検出されない。現時点の実害はない
- **推奨アクション**: `perf/tsconfig.json` の `include` に `../playwright.perf.config.ts` を明示的に足す。plan の機械強制の表に「config も型検査に含める」と書く
- **根拠**: AD-038 D3、spec FR-012
- **scope 根拠**: 新設ファイルの設定で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `D4` in spec dir / `SCAN_ROOTS\|SCAN_FILES\|死角` in `docs/roadmap.md` / `e2e` in `allowlists.mjs` | 4 / 1 / 0 | `plan.md:73,167,181`、`tasks.md:98` / `roadmap.md:129` / — |
| M-002 | `finally\|afterEach\|afterAll\|fixture\|teardown` in spec dir | 3 (すべて `finally`) | `tasks.md:89`、`research.md:54`、`plan.md:194` |
| L-001 | `launch.phase` in spec dir / `inFlight` in `src/renderer/` | 2 / 8 | `data-model.md:56`、`tasks.md:18` / `running-session-store.ts` |
| L-002 | `playwright.perf.config.ts` in spec dir (型検査の対象に含める記述) | 0 | (言及は `plan.md:178,182,216`、`tasks.md:12,84`) |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
- Round inheritance: resolved from 1: 9 / unresolved: 0 / new: 4 (M-001 は R1 M-003 の推奨に含まれていた本 reviewer の事実誤認の訂正を含む)
