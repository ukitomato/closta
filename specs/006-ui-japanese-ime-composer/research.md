# Research: 日本語 composer (X-2)

Phase 0。Technical Context の未知点を解消する。各項は Decision / Rationale / Alternatives の形で記す。
**新規 SPIKE は無い** — SPIKE-4 (AD-037) が本 feature の前提を潰済み。本 research は実装方式の確定である。

## R-01: Streamdown は本 feature で発火しない (該当なし記録)

- **Decision**: composer 入力に Streamdown は**無関係**。導入判断は行わない。
- **Rationale**: Streamdown は assistant **出力** transcript の未完 markdown 構文修復 / CJK 分割耐性の話 (roadmap L170-175)。
  composer は利用者の**入力欄**であり描画経路ではない。X-1 が transcript 描画側で既に評価済み (X-1 research R-01/R-04)。
- **Alternatives considered**: なし (適用領域外)。roadmap L172「X-1/X-2 で判断」のうち X-2 分は「composer は対象外」で確定。

## R-02: message queue capability の宣言と配線

- **Decision**: `useExternalStoreRuntime` に **message queue capability を宣言**し、実行中 (`running` /
  `awaiting_permission`) の `onNew` を送信でなく **queue への追加**に回す。積んだ項目は `ComposerPrimitive.Queue` /
  `QueueItemPrimitive` で表示する (Principle XIII。自作しない)。**dispatch trigger = 現ターン完了**
  (`runState` が `running`→`done`/`idle`、または `awaiting_permission` 解消後) で、queue 先頭から `session.send` で
  **同一セッションの次ターン**として送る (X-1 の AsyncIterable stdin の続き。AD-036)。
- **Rationale**: charter Journey 2 step 3「実行中に次の入力を積める (message queue)」を標準部品で満たす。**保持の単一
  真実源は composer 側 feature state とし、X-1 の in-memory セッションキューを保持層として二重に経由しない**
  (二重積み・二重 dispatch を作らない。design-gate H-1)。X-1 の `still_queued`/`cancelled` は**意味論を継承**する対象で
  あって保持層ではない (X-1 FR-019)。同時に in-flight となるのは dispatch 済み 1 件のみ。**終端 (interrupt/error/crash/
  provider-error/強制終了) での未 dispatch 項目の disposition を定義し、表示を実状態と一致させる** (design-gate H-4。AD-037 §4/D2)。
- **実装時に確認する点 (design-gate/実装で verify)**: `useExternalStoreRuntime` が message queue capability を
  ネイティブに受けるか、`ComposerPrimitive.Queue` が external store runtime で機能するかを assistant-ui 0.15 の実ソースで
  確認する。**ネイティブ非対応なら feature 側キュー (下書き state と同じ層) + `QueueItemPrimitive` 表示で代替し、
  完了 trigger で `session.send` する** (振る舞い契約 C-3 は満たす。実現手段は実装で確定)。この「実ソースで確認する」姿勢は
  AD-037 が採った一次情報主義に倣う。
- **Alternatives considered**: (a) 手動再送 (却下: charter の「積める」体験に届かない。AskUserQuestion で不採用)、
  (b) interrupt→steer (却下: AD-036 の単一 query streaming に踏み込み X-2 の範囲を超える。AskUserQuestion で不採用)。
- **実装検証 (2026-09-28。`queue-behavior.test.tsx` で確定)**:
  - **native queue は存在し dispatch は動く** — `queue: createMessageQueue({run}).adapter` を宣言し、`notifyBusy`
    (running 立上り) / `notifyIdle` (完了) で駆動すると、実行中の送信は保留され完了後に `driver.run` で次ターン送信される
    (**FR-005 OK**)。`driver.cancel` を渡さないため実行中送信は割り込まない (**interrupt→steer しない。FR-005 OK**)。
  - **⚠ 可視化ギャップ (FR-004)**: 実行中 (isRunning) の送信は runtime の `append` が **steer lane** (`adapter.steerItems`) に
    回す (`message.steer ?? isRunning`。external-store-thread-runtime-core)。しかし `ComposerPrimitive.Queue` の表示ソースは
    composer state の `queue` (= **queue lane** `adapter.items`) であり、**steer lane の項目は表示されない** (実測: 実行中送信後
    `composer.queue.length = 0` / `adapter.steerItems.length = 1`)。→ **`ComposerPrimitive.Queue` 単体では「積まれていることが
    見える」を満たせない。**
  - **修正案 (要 live 反復。T014)**: (a) `adapter.steerItems` を subscribe して表示する経路を足す (composer state に steer が
    無いため controller から reactive に取り出す)、(b) 実行中送信を queue lane に回す (runtime の steer 既定を回避する手段の
    確認が要る)、(c) feature 側 queue を単一 locus にし `QueueItemPrimitive` を直接 map して描画する (Principle XIII の解釈は
    「registry primitive を使う」で満たす)。**採否は実機/E2E で表示を確認して決める。**

## R-03: 下書き state の持ち方 (Thread 再構成をまたぐ保持)

- **Decision**: composer の下書きテキストを **feature 側 state (session state / zustand slice)** に持ち上げ、
  `SessionScreen` の phase (entry/launching/active) 変化・`isDisabled` (error/killed) による **Thread 再マウント時に
  composer 初期値へ流し込む**。**メモリ内限定** — 永続層・IPC 境界に出さない (FR-008)。
- **Rationale**: `useExternalStoreRuntime` の composer state は runtime インスタンスに紐づくため、Thread が再構成されると
  失われる (AD-037 §4(i)/(ii))。下書きを runtime の外 (feature state) に置けば再構成に耐える。runtime インスタンス自体を
  保持し続ける案より影響が小さい (phase/isDisabled で再構成する既存設計を変えない)。
- **Alternatives considered**: (a) 永続層 (JSON/SQLite) への退避 (却下: FR-008 で out of scope。AskUserQuestion で
  「メモリのみ」確定)、(b) runtime インスタンスを phase 間で保持 (却下: SessionScreen の再構成設計への影響が大きい)。

## R-04: Playwright + Electron を CI で起動する最小ハーネス

- **Decision**: **Playwright の Electron 起動 (`_electron.launch`)** で本アプリを起動し、IME E2E と日本語スクリーンショット
  比較を回す。**`_electron.launch` はアプリ同梱の Electron/Chromium を使うため `playwright install` の独立ブラウザ取得はしない**
  (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` 相当。供給網面を増やさない。design-gate L-5)。スクリーンショットは基準画像比較
  (`toHaveScreenshot`) を用い基準画像をリポジトリに commit する。**日本語フォントはリポジトリ同梱 (`e2e/` の .ttf) のみを
  非永続な注入 (アプリ内 `@font-face` / Playwright 側注入) 経由で用い、CI ランナー/ホストへの永続的フォント変更 (OS 登録・
  `Fonts` 複製・`fc-cache` / `reg add` / パッケージマネージャ導入) を一切しない** (Principle VI = NON-NEGOTIABLE。windows-latest
  標準フォントに依存しない。check.mjs 項目 1 は verify.yml を走査しない死角のため同梱限定 + 非永続注入 + Manual reviewer で
  守る。design-gate H-6/H-101)。CI は `verify.yml` に **E2E ジョブを 1 検証 1 ステップ**で追加。
- **Decision (credential-free 到達。design-gate H-3 / security M-001)**: E2E は capability 層
  (`window.closta` = `launchSession`/`sendPrompt`) を stub し fake の runtime/session を注入して active phase
  (`isDisabled: false`) を決定的に作る。**real な Claude 認証・WSL・外部 API 接続・長期資格情報を CI env/GitHub secrets に
  一切持ち込まない** (Principle V)。SC-001 の「有効 composer」を偽の緑 (isDisabled:true) でなく満たす。
  **注入機構** (実装で確定): `test-support/capability.ts` は Vitest 専用 (`vi.stubGlobal`) で実 Electron には注入できず、
  形状 (handshake DTO) も main 側 `IpcDependencies` と異なり流用できない。E2E は **main 側の 1 分岐で `IpcDependencies` を
  差し替える** — `src/main/index.ts` が `!app.isPackaged && CLOSTA_E2E==='1'` のときだけ `createComposition()` の代わりに
  `createE2eCapability()` (`src/main/app/e2e-capability.ts`) を配線する。**preload も `window.closta` も本番と同一** で、第 2 の
  exposeInMainWorld を作らず単一 capability 境界 (FR-039) を保つ (むしろ preload 非差し替えで強める)。
  **`app.isPackaged` が本番で true → 分岐は到達不能 = production-inert** (env 単独ゲートにしない)。real 認証/WSL/spawn を持ち込まない。
- **Rationale**: discovery.md が Playwright を宣言スタック (未導入) とし、CI ランナーは windows-latest。Electron 単一
  Chromium エンジン (AD-001) のため 2 エンジン分の検証は不要。**本 feature は Principle VIII の 2 項目に必要な最小
  ハーネスに絞る** — スクロール安定 E2E / Principle IX 到達集合検査は roadmap L122-124 の deferred feature に残す (AD-037 D3)。
- **基準画像のガバナンス**: 初回基準画像の視覚的妥当性 (全角行送り・折返しの見え) は**人間 deferred** (quickstart V-2。
  R-3 rubric-b と同じ扱い)。基準画像更新は PR レビューで承認する。
- **Alternatives considered**: (a) full E2E 基盤を一括導入 (却下: scroll/reachability まで載せると scope 超過。deferred
  feature に残す)、(b) jsdom でのレイアウト検証 (却下: jsdom はフォント/字幅を持たない。AD-024)。
- **ADR 化の判断**: この harness は将来の deferred 項目が積む基盤であり、AD-023 の機械強制レイヤ規則の適用範囲 (e2e scope)
  を変える。**design-gate M-1 の指摘により [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) として proposed 起票
  した** (技術選定・CI 統合・基準画像ガバナンス・フォント同梱・credential-free・e2e の src グラフ外分離・scope 限定を固定)。

## R-05: IME 確定 Enter の E2E 再現方法

- **Decision**: Electron (Chromium) の **CDP composition イベント注入** (`Input.imeSetComposition` /
  `Input.insertText` + `keydown` with `isComposing`) で「変換中の Enter」を再現し、**送信経路
  (`onNew`/`session.send`) が発火しない**ことを assert する。変換確定後の 2 度目の Enter で送信されることも assert。
- **Rationale**: AD-037 §1 が W3C 準拠 Chromium では確定 Enter の keydown が `isComposing === true` (keyCode 229) で
  来ることを実ソース + 公式テスト (`ComposerInput.test.tsx`) で示している。CDP でこの状態を再現でき、assistant-ui の
  二重ガードと消費側の非破壊を E2E で固定できる。
- **人間 deferred の切り分け (正直に記す)**: **実機 electron 39.8.10 で実 IME を操作したときの確定 Enter の keydown
  タイミング目視**は自動化できない (GUI の IME 操作は自動不可。AD-037 代償節)。これは quickstart V-1 に置く
  (X-1 SC-005 の「fake では孫プロセスを踏めない」明示と同じ姿勢で、E2E が担保する範囲と実機目視の範囲を分ける)。
- **Decision (running-state。design-gate H-2)**: IME E2E は **(i) idle/既定 composer と (ii) `running` + message queue
  有効化後 (`isRunning && hasQueue` 分岐。AD-037 §4 の `handleKeyPress` L253-255)** の両状態で確定 Enter 非送信を assert する。
  queue 有効化が Enter 分岐を変えるため、running+hasQueue こそガードの先行を検証する必要がある。既存 `ChatScreen.test.tsx`
  は `isDisabled:true` 前提で有効 composer を守らない (新 IME E2E が番人)。
- **Decision (マウス送信。design-gate H-5 / US-1 AC-6)**: 変換中 (`isComposing`) のマウス送信ボタン押下で未確定文字列が
  送信されないことを assert する。assistant-ui が同経路 (マウス submit = `composer.send`) を変換中に抑止するかを
  `@assistant-ui/react` 実ソースで確認し、**抑止しない場合のみ「確定優先」の最小処理を消費側に足す** (keydown 用の自前 IME
  ガード新設ではない。AD-037 D1 の対象は確定 Enter の keydown 経路)。
- **到達手段**: 上記いずれの E2E も R-04 の capability stub で有効 composer に到達する (real 資格情報を使わない)。
- **Alternatives considered**: 実 IME の自動操作 (却下: OS の IME を自動で確定操作する手段が無い)。
