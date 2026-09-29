# 実装ランブック — 日本語 composer (X-2)

実開発セッション (GUI + フルビルド + 反復可能な Vitest/Playwright) で残タスクを実行するための手順書。
design-gate PASS 済み・status=implementing。**T004 (`composer-queue.ts`) は実装 + Vitest 12 件 pass で検証済**。
本書は残り 32 タスクを「触るファイル / 書く内容 / 検証 / 落とし穴」で具体化する。番号は tasks.md の T00N に対応。

## 0. 全ステップ共通の掟 (壊すと gate/Principle 違反)

1. **既存 IME 二重ガードを殺さない** (FR-001 / SC-001)。`ComposerPrimitive.Input` を独自 textarea に差し替えない /
   `onKeyDown` で `preventDefault` しない・Enter を横取りしない / `submitMode` は既定 (`"enter"`) のまま。
   → 追加するのは onNew の分岐と queue/draft の配線だけ。Input 本体には触らない。
2. **queue/draft の保持は単一真実源 = `composer-queue.ts` の `ComposerQueueState`** (H-1)。X-1 の in-memory セッション
   キューを保持層として二重に経由しない。in-flight は常に 1 件。
3. **終端 disposition** (R2-M-002): interrupt は `onInterrupt` (still_queued 残置) / error・killed 等の isDisabled 終端は
   `onTerminal` (queued→cancelled) / reset・再 launch は `discard()` (持ち越し 0)。
4. **会話由来テキスト (draft / queue item) をログ・エラー・IPC・永続層に出さない** (Principle V)。`console.*` / `Error.message`
   に text を含めない。
5. **E2E は credential-free** (capability stub + production-inert) / **日本語フォントは同梱・非永続注入のみ** (AD-038 D3/D4)。
6. **検証コマンドは [docs/discovery.md](../../docs/discovery.md) の「agent 用」列**。
   **このマシンの Vitest は既定ヒープで OOM する** (実測)。必ず
   `node --max-old-space-size=3072 node_modules/vitest/vitest.mjs run <file>` の形で回す。
   lint = `node node_modules/eslint/bin/eslint.js --cache .` / typecheck = 2 project の `tsc --noEmit` /
   depcruise = `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src`。

## `composer-queue.ts` の API (T004。実装・検証済。以降これを配線する)

```
emptyComposerQueue: ComposerQueueState        // { draft:'', items:[], seq:0 }
setDraft(state, text) / clearDraft(state)
enqueue(state, text, maxItems?) -> {ok:true,state,item} | {ok:false,reason:'invalid'|'full'}
dispatchNext(state) -> {state, item: QueueItem|null}   // 先頭 queued→dispatched
onInterrupt(state) -> state                    // queued 維持 (still_queued)
onTerminal(state) -> state                     // queued→cancelled
discard() -> emptyComposerQueue                // reset/再launch
cancelItem(state, id) / stillQueued(state) / cancelledItems(state)
```

---

## Step 1 — `useLiveSession` に queue/draft を統合 (T005 / T013 / T015 / T021 の state 側)

**触る**: `src/renderer/src/features/session/useLiveSession.ts`

1. state 追加: `const [cq, setCq] = useState<ComposerQueueState>(emptyComposerQueue)` (import は `./composer-queue`)。
2. `LiveSession` interface に公開項目を足す:
   - `draft: string` / `setDraft(text: string): void`
   - `queued: readonly QueueItem[]` / `cancelled: readonly QueueItem[]`
   - `submit(text: string): { ok: boolean; reason?: 'invalid' | 'full' }` — **送信の単一入口**。
3. `submit(text)` の分岐:
   - `runState === 'running' || runState === 'awaiting_permission'` → `enqueue(cq, text)`。
     `ok` なら `setCq(r.state)` (draft は enqueue が空にする)。`!ok` は reason を返し UI が理由提示 (R2-M-001)。
   - それ以外 (`idle`/`done`/`interrupted`) → 直接送信: `appendUser(text); send(text); setCq(clearDraft(cq))`。
   - `isDisabled` (error/killed) 時は呼ばれない前提 (composer 無効。US-2 AC-5)。
4. **完了 trigger で次ターン dispatch** (FR-005): `runState` の遷移を `useRef` の prevRunState で監視する `useEffect` を追加。
   `prev === 'running' && (next === 'done' || next === 'idle')` かつ `pending === null` のとき
   `const d = dispatchNext(cq); if (d.item) { appendUser(d.item.text); send(d.item.text); setCq(d.state) }`。
   **無限ループ注意**: dispatch は 1 件ずつ。送信で runState が再び running になり、完了でまた次を引く形にする。
5. 終端 disposition:
   - `applyEvent` の `case 'failure'` と `kill()` で `setCq((s) => onTerminal(s))` (queued→cancelled)。
   - `interrupt()` は `setCq((s) => onInterrupt(s))` (no-op。still_queued 維持)。
   - `reset()` と `launch()` の頭で `setCq(discard())` (持ち越し 0)。
6. `setDraft` は `setCq((s) => setDraft(s, text))` (名前衝突するので import を別名にするか関数名を分ける)。

**検証**: `useLiveSession.test.tsx` に追加ケース — running 中 submit で queued に積まれ send されない / 完了で次ターン
dispatch / interrupt で still_queued 維持 / failure で cancelled / reset で discard。
`node --max-old-space-size=3072 node_modules/vitest/vitest.mjs run src/renderer/src/features/session/useLiveSession.test.tsx`。
既存ケースを壊さないこと (kill/failure/回帰)。**X-1 申し送りの SessionScreen/useLiveSession kill・failure テスト (T025) はここに合流**。

**落とし穴**: 既存 `send()` は `sendPrompt` を直接呼ぶ。`submit()` を新設し、LiveThread の `onNew` は `submit` を呼ぶよう変える
(下 Step 2)。`send()` 自体は dispatch/直接送信の下請けとして残す。

---

## Step 2 — LiveThread / Composer 配線 (T009 IME 非破壊 / T014 queue 表示 / T021 draft)

**触る**: `src/renderer/src/features/session/SessionScreen.tsx` (LiveThread) /
`src/renderer/src/components/assistant-ui/elements/thread.aui.tsx` (Composer)

1. **onNew を submit に**: `LiveThread` の `useExternalStoreRuntime.onNew` を
   `onNew: (m) => { const t = extractText(m); if (t.length>0) session.submit(t); return Promise.resolve() }` に変更。
   `isDisabled` は現状維持 (error/killed で無効)。
2. **実行中も積めるようにする** (FR-004): 現状 `thread.aui.tsx:585` は `isRunning` で Send→Cancel に差し替え、実行中は
   送信できない。**assistant-ui の message queue capability を実ソースで確認**してから配線する:
   - `node_modules/@assistant-ui/react` で `ComposerPrimitive.Queue` / `QueueItemPrimitive` と external store runtime の
     queue capability の実在・宣言方法を確認 (primitives/runtime)。
   - **対応していれば**: `useExternalStoreRuntime` に queue capability を宣言し、`ComposerPrimitive.Queue` を Composer に
     追加、実行中の Enter/Send が queue に入るようにする。表示は `QueueItemPrimitive` (自作しない。Principle XIII)。
   - **対応していなければ (fallback)**: Composer に実行中用の「積む」導線を feature 側で足す (Input は差し替えない)。積んだ
     項目は `session.queued` を map して `QueueItemPrimitive` 相当で表示。→ **契約 C-3 の振る舞いを満たせば手段は不問** (FR-004)。
   - cancelled/still_queued の表示は `session.queued` / `session.cancelled` から描く (表示=実状態。H-1)。
3. **draft 復元** (FR-007 / T021): composer のテキストを `session.draft` に持ち上げる。
   - assistant-ui の composer text の read/write API を実ソースで確認 (`useComposer` / composer runtime の `setText` 等)。
     `useExternalStoreRuntime` の再生成 (isDisabled/isRunning 変化) をまたいで draft を復元する配線を入れる。
   - **Input は差し替えない** (FR-001)。composer の onChange 相当で `session.setDraft` を呼び、runtime 初期化時に
     `session.draft` を流し込む。
   - 送信・明示クリアで draft が空になること (data-model の draft ライフサイクル)。
4. **既存ガード非破壊の維持** (C-1): 上記で `onKeyDown`/`submitMode`/`Input` を変えていないことを確認。

**検証**:
- 静的/component (T007): `onKeyDown` に `preventDefault` が無い / `submitMode` 未指定 (既定) / `ComposerPrimitive.Input` を
  使っている、を assert する component テスト。
- queue component (T011): running/awaiting で積まれ可視化 / error・killed で積めない / 空・空白・バイト長超過は積まれない /
  上限で拒否+理由 / HTML 風メタ文字がリテラル表示 (エスケープ回帰。L-4)。
- draft (T020): phase/isDisabled 変化で Thread 再構成をまたいで draft 保持 / send・clear で空 / メタ文字リテラル表示。
- いずれも `node --max-old-space-size=3072 node_modules/vitest/vitest.mjs run <file>`。

---

## Step 3 — Principle V ログ非混入テスト (T032)

**触る**: `src/renderer/src/features/session/composer-queue.test.ts` (or 専用) — 例外・状態遷移で text が
`console.*`/`Error.message` に出ないことを assert。あるいは軽量 grep 検査を tasks に追加。

---

## Step 4 — Playwright + Electron E2E ハーネス (T001 / T002 / T030。AD-038 D1/D2/D3/D4)

1. **導入**: `pnpm add -D @playwright/test`。`playwright.config.ts` を作成し `_electron.launch` を使う。
   `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 相当でアプリ同梱 Chromium を使う (独立ブラウザ取得しない。L-5)。
2. **scope carve-out** (T002 / AD-038 D2): `e2e/` を作り、
   - depcruise: `e2e/` を `dependency-cruise.mjs src` の起点に**入れない** (別実行 or 別 config)。`.dependency-cruiser.js` の
     `not-to-test` prefix を `^(specs|tests|e2e)` に拡張。global `from:{}` ルールを緩めない。
   - eslint: `eslint.config.mjs` に `e2e/**` の override (react-refresh/react-hooks off、Playwright 向けのみ)。base を緩めない。
   - tsconfig: e2e を web/node project に混ぜず e2e 専用の tsconfig にする (`@playwright/test` 型を src に持ち込まない)。
3. **capability stub 注入** (T030 / AD-038 D3 / security M-001): **main 側の 1 分岐で `IpcDependencies` を差し替える**。
   `src/main/index.ts` が `!app.isPackaged && process.env.CLOSTA_E2E==='1'` のときだけ `createComposition()` の代わりに
   `createE2eCapability()` (`src/main/app/e2e-capability.ts`) を配線する。**preload も `window.closta` も本番と同一** (専用 preload を
   作らず・renderer の `stubCapability` は形状が違い流用しない)。fake の folder/runtime を seed / `launchSession` は
   `MessageChannelMain` で合成 stream (`utilityProcess`/`fork`/`spawn` 不使用)。**`app.isPackaged` で本番到達不能 = production-inert**
   (env 単独ゲートにしない)。real 認証/WSL/外部 API/秘密を CI に持ち込まない。
4. **日本語フォント** (AD-038 D4 / H-101): `e2e/` に .ttf を commit し、**非永続注入 (`FontFace` API + CSSOM。CSP `style-src 'self'`
   が inline `<style>` を弾くため addStyleTag は不使用)** で用いる。OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入を**一切しない**。

**検証**: `node_modules/.bin/playwright test` (実機)。

---

## Step 5 — E2E specs (T006 / T008 / T031 / T019。research R-05)

1. `e2e/ime.spec.ts` (T006): CDP の composition イベント注入で `isComposing` 中の Enter が送信経路 (`onNew`/`session.submit`)
   に届かない / 確定後 2 度目の Enter で送信、を **(i) idle と (ii) running + queue 有効化後 (`isRunning && hasQueue`)** の
   両状態で assert (H-2)。capability stub (Step 4) で有効 composer に到達。
2. `e2e/ime.spec.ts` に AC-6 (T031): 変換中にマウスで送信ボタンを押しても未確定文字列が送信されない。assistant-ui が同経路を
   抑止するか実ソースで確認し、しない場合のみ確定優先の最小処理を足す (自前 keydown ガード新設ではない)。
3. `e2e/composer-screenshot.spec.ts` (T008): 全角・半角・絵文字混在の composer を同梱フォントで描画し `toHaveScreenshot` で
   基準画像比較。基準画像に会話/config 由来情報を含めない (H-3)。
4. 回帰固定 (T019): 既存ガードを殺す変更 (preventDefault/submitMode 上書き/Input 差し替え) を入れると T006 が落ちることを
   確認 (手動で一時的に壊して確認、または negative fixture)。

---

## Step 6 — CI (T016 / T017 / T018)

**触る**: `.github/workflows/verify.yml` (windows-latest)

- **1 検証 1 ステップ**で IME E2E ジョブ (T016) と 日本語スクリーンショット比較ジョブ (T017) を追加。
- 同梱フォントを非永続注入で供給・**OS 登録/Fonts 複製/fc-cache/パッケージマネージャ導入をしない** (H-6/H-101)。
- **real 資格情報を CI env/secrets に置かない** (H-3)。capability stub で到達。
- **移設対象外を載せない** (T018): スクロール安定 E2E / Principle IX 到達集合検査は deferred feature に残す。

---

## Step 7 — docs 追随 (T022 / T023 / T024 / T033 / T003。**Step 1-6 が実在してから**)

- **T022 glossary**: `docs/glossary.md` に英語 canonical 見出し `Composer` / `Message queue` / `Draft` を追記。既存
  `message mapping` との Counterexamples 注記。spec Key Entities / data-model のフィールド名と一致。
- **T023 charter**: `docs/domains/ui/charter.md` Related Specs に X-2 追加 / 「(残り。X-2 / …)」から X-2 除外 /
  **R-4 を「着手中」→「完了」** (merge 済み 731f27d) / frontmatter `related_specs` に 006 / Related ADRs に AD-037/AD-038 /
  Open Questions SPIKE-4 を解決済みに。
- **T024 Constitution (要 SemVer 改定。C-007)**: `.specify/memory/constitution.md` Principle VIII の「現状の制約」(A)(B) を
  **「未搭載/延期」→「X-2 で CI 搭載済み・持ち主 X-2」へ書き直す**。**version v1.2.6→v1.2.7 (PATCH)** / Sync Impact Report /
  Amendment trail entry (根拠 ADR = AD-037 D3)。`docs/roadmap.md` L115-124 の Automated (A)(B) 持ち主も X-2 に更新。
  **注意**: E2E/CI が実在してから行う (実在前に「搭載済み」と書くと虚偽)。
- **T033 roadmap (M-101)**: `docs/roadmap.md` に system-scope 後続対応「`scripts/constitution/allowlists.mjs` の `SCAN_FILES`
  に `.github/workflows/verify.yml` を追加し check.mjs 項目 1 が CI 定義を走査する」を owner 付きで登録。
- **T003 discovery**: `docs/discovery.md`「Build / Test / Lint」表に E2E (Playwright) の agent 用コマンド行を追加し
  「未導入」を解消 (Playwright 導入後)。

---

## Step 8 — 検証 & gate (全 Step 後)

1. `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false` と `… -p tsconfig.web.json …`
2. `node node_modules/eslint/bin/eslint.js --cache .`
3. `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src` (+ e2e は別実行)
4. `node scripts/constitution/check.mjs`
5. `node --max-old-space-size=3072 node_modules/vitest/vitest.mjs run` (全件)
6. `node_modules/.bin/playwright test` (E2E 実機)
7. quickstart V-1〜V-5 を実機記入 (T028。基準画像の承認者・根拠を必須記録)
8. tasks.md を全 `[x]` にし、**`/cl-code-gate specs/006-ui-japanese-ime-composer`** を起動 (lint/test/convention + auto-fix loop)。
   → PASS で reviewing。その後 `/cl-pr-gate` → `/cl-done`。

## タスク対応表 (残 32 → Step)

| Step | tasks |
|---|---|
| 1 | T005, T013, T015, T021(state), T025 |
| 2 | T007, T009, T010, T011, T014, T020, T021(UI) |
| 3 | T032 |
| 4 | T001, T002, T030 |
| 5 | T006, T008, T031, T019 |
| 6 | T016, T017, T018 |
| 7 | T022, T023, T024, T033, T003 |
| 8 | T026, T027, T028, T029(確認) |
