# Implementation Plan: 日本語 composer (X-2)

**Spec**: [spec.md](spec.md) · **Spec ID**: `006-ui-japanese-ime-composer` · **Feature**: X-2 · **Domain**: `ui` · **Targets**: frontend

**Status**: frontmatter (`spec.md`) の `status:` を正とする

本 plan は「どう満たすか」を定める。受け入れ条件 (何を満たすか) は spec.md、実装方式の詳細は
[research.md](research.md) / [data-model.md](data-model.md) / [contracts/composer-behavior.md](contracts/composer-behavior.md) /
[quickstart.md](quickstart.md) が持つ。**規則の正本は 1 箇所**とし、本 plan は参照形で書く。

## Summary

有効化された live composer (X-1 が送信経路を開いた) に対し、**日本語入力の健全性を確定し回帰を Automated 検証で
恒久固定する**。自前 IME ガードは新設せず (AD-037 D1)、assistant-ui `ComposerPrimitive.Input` の二重ガードを
**消費側が殺さないこと**を守る。加えて (a) 実行中の入力積み (message queue → 同一セッションの次ターン送信)、
(b) 下書きの画面再構成をまたぐメモリ保持、を runtime capability / composer state として実装する (AD-037 D2)。
Principle VIII Automated (A) IME E2E / (B) 日本語スクリーンショット比較を **CI に常設する最小ハーネス
(Playwright + Electron 起動 + 日本語フォント + 基準画像) を導入**する (AD-037 D3)。検証の正本は grep でなく
E2E + スクリーンショット比較 (AD-024 #18)。

## Domain Context

### Charter reference

- **Domain**: `ui` ([docs/domains/ui/charter.md](../../docs/domains/ui/charter.md))
- **Mission**: Claude Code が emit する情報のすべてに専用表示を与え、**日本語環境で破綻しない操作体験**を提供する
  (軸 1。製品の採否を決める要素)
- **Scope (本 feature が触れる In scope)**: 「composer (日本語 IME、message queue、draft restore、…)」。
  **transcript / tool 表示 (R-3/R-4)・情報密度切替・検索・observability は触れない**
- **Journey**: Journey 3「日本語で入力する」(確定 Enter で送信されない / 全角混在で崩れない) と Journey 2 step 3
  「実行中に次の入力を積める (message queue)」に対応
- **charter 追随 (本 feature で行う)**: (1) Related Specs (L152-161) に本 spec を追加し「(残り。X-2 / …)」から X-2 を外す、
  (2) Open Questions の SPIKE-4 (L174-175) を AD-037 で解決済みに更新 (architecture-reviewer が charter drift として見る)

### Related ADRs

- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — **proposed (本 feature で起票。design-gate M-1)** —
  E2E / スクリーンショット検証ハーネス (Playwright + `_electron.launch` / e2e を src グラフ外に分離し lint/depcruise/tsc scope
  を carve-out / 日本語フォント同梱限定 / capability stub による credential-free 到達 / 基準画像ガバナンス / scope は
  Principle VIII の 2 項目に限定)。design-gate 再確認で accepted へ (AD-036 運用)
- [AD-037](../../docs/decisions/0037-japanese-ime-composer-behavior.md) — **accepted** — SPIKE-4。**本 feature の直接の前提**。
  D1 (自前ガード不要・既存二重ガードを殺さない) / D2 (queue・draft は runtime capability / composer state) /
  D3 (Principle VIII Automated (A)(B) の所有・roadmap L120 からの移設・正本は grep でなく E2E) / D4 (ハーネスは X-2 実装で入れる)
- [AD-036](../../docs/decisions/0036-single-session-launch-process-and-live-stream.md) — accepted — 単一 query の
  streaming input。**queue の次ターン dispatch の調整先** (積んだ入力を AsyncIterable stdin の続きとして送る)
- [AD-024](../../docs/decisions/0024-constitution-verification-paths.md) — accepted — #18: Principle VIII の
  Automated の正本を grep から E2E + スクリーンショットへ移す / `bad_pattern_grep` は番人でない。FR-009 の根拠
- [AD-033](../../docs/decisions/0033-assistant-ui-elements-introduction-cost.md) — accepted — SPIKE の測定方法 /
  investigation ≠ implementation の先例 (AD-037 D4 が踏襲)。仮想化パス (件数 > 40) の先例
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — accepted — XSS 境界 (生 HTML
  非描画・URL allowlist)。composer 入力そのものは描画経路でないが、queue/下書きテキストを表示する際に境界を回帰させない
- [AD-001](../../docs/decisions/0001-adopt-electron-over-tauri.md) — accepted — 単一 Chromium エンジン。確定 Enter の
  実機目視が 2 エンジン分不要 (人間 deferred の範囲確定)
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — accepted — Tier A tool 表示 (R-4)。
  composer は tool 表示に触れない (参照のみ)

### Glossary excerpt

- **Element / Tier A**: assistant-ui が提供する UI 部品と実装優先度 (AD-019)
- **composer**: メッセージ入力欄。**本 feature で glossary の canonical 用語として確定する** (現状 glossary に項目なし。FR-013)
- **message queue (実行中積み)**: 稼働中に積む未送信入力。X-1 の in-memory セッションキュー (`still_queued`/`cancelled`)
  と対応。**本 feature で glossary に追記** (FR-013)
- **draft (下書き)**: 未送信の composer 入力テキスト。**本 feature で glossary に追記** (FR-013)
- **supervisor / AgentSession / SessionRunState (X-1)**: 稼働セッションと状態機械。queue の次ターン送信はこの上に乗る (再利用)

## 上流からの申し送りの棚卸し (必須)

**実行コマンド** (Grep ツール): `pattern = "X-2|006-ui-japanese-ime-composer"`, `glob = "*.{md,mjs,js,yaml,yml,json,ts,tsx}"`,
リポジトリ全体。**総ヒット: 約 55 行** (docs / PLAN.md / specs 配下 / spec.md 自身)。加えて機械強制対象
(`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` / `.github/workflows/verify.yml`) を
`playwright|e2e|screenshot` で別途 grep した (ヒットは gate-verdict JSON と pnpm-lock のみ = **E2E 系の実名ルールは未整備**)。
以下に**全ヒットへ処理を割り当てる**。

### A. 機械強制の履行義務 (新規ツール = Playwright/E2E の導入に伴う)

| # | 申し送りの出所 | 本 feature での処理 | 割当 |
|---|---|---|---|
| A-1 | `playwright\|e2e\|screenshot` の grep が config に 0 件 = **E2E の実名ルールが未整備**。新規 e2e ディレクトリと Playwright は `eslint.config.mjs` / `.dependency-cruiser.js` / `tsconfig.*` の対象範囲に入っていない | e2e ディレクトリ (`e2e/` 想定) を **lint / depcruise / tsc の scope 方針に編入** (src グラフに e2e を混ぜない / e2e 専用の lint 設定)。`eslint-plugin-boundaries` のレイヤ行列に e2e を「テスト層」として扱う扱いを決める。実名リスト方式の既存ルールを壊さない | SH-conf1 |
| A-2 | discovery.md「Build / Test / Lint」表に **E2E 行が無い** (`convention-reviewer`/`lint-agent` はこの表を SSoT に読む)。「まだ宣言だけのもの」節に「E2E: Playwright 未導入」とある | discovery.md に **E2E (Playwright) の agent 用コマンド行を追加**し「未導入」を解消。CI 節の「CI に載っていないもの」表から Principle VIII Automated 2 項目を外す (revision 追記) | SH-conf2 |
| A-3 | `.github/workflows/verify.yml` は install→lint→typecheck→depcruise→check:constitution→test→test:rules→build の 1 検証 1 ステップ (discovery.md CI 節)。E2E ステップが無い | verify.yml に **IME E2E ジョブと日本語スクリーンショット比較ジョブを追加** (1 検証 1 ステップの慣習を守る)。Electron を CI で起動する仕組みと日本語フォント導入を含む | SH-conf3 / FR-009/010/011 |
| A-4 | `check.mjs` / `allowlists.mjs` は spawn / WSL / SDK 呼び出しの実名リスト。**X-2 は renderer とテスト基盤のみで spawn/WSL/SDK を新設しない** | 該当なし (X-2 は agents/infra の spawn・WSL・SDK 面を触らない)。理由を記録し不用意に allowlist を触らない | 該当なし (記録) |

### B. 設計判断の申し送り (ADR / 先行 spec)

| # | 申し送り | 処理 | 割当 |
|---|---|---|---|
| B-1 | **AD-037 D1/D2/D3/D4** + 申し送り (L175-179): 自前ガード新設せず既存を殺さない回帰を FR 化 / queue・draft を session domain と調整して確定 / Automated (A)(B) を X-2 に更新 | spec に反映済み (FR-001/004-008/009-012)。plan/tasks が実装配線と検証を持つ | 全 FR / research |
| B-2 | **X-1 申し送り**: `SessionScreen`/`useLiveSession` の **kill・failure component test → X-2** (`.gate-verdict-pr.json:491` H-501/M-003 / `code-gate.md:33` conv M-002: killed 終端 UI 含む) | X-2 は `LiveThread`/`SessionScreen` の composer 面を改修するため、**composer に関わる component テスト (下書き保持=SC-005 / 実行中積み=SC-003 / error・killed で isDisabled のとき積めない=US-2 AC-5) を本 feature で載せる**。純粋に kill 経路のみの test も同ファイルを触るため合流させる | tasks (FE) |
| B-3 | **X-1 SC-009 の全角混在レイアウト → X-2 SC** (`design-gate.round1.md:61` H-11 / X-1 spec SC-009) | SC-002 に反映済み (スクリーンショット比較。基準画像の視覚的妥当性は人間 deferred) | SC-002 / quickstart |
| B-4 | **R-3 視覚回帰基盤 → X-2** (`specs/003 spec.md:248` / `design-gate.round1.md:69` M-004 / `spec.md:189` "IME ガードと E2E は X-2 が載せる") | FR-010/011 (日本語スクリーンショット比較 + 最小ハーネス) に反映済み。R-3 の rubric-b (日本語行送り) の視覚判断と同じ扱いで quickstart に置く | FR-010/011 / quickstart |
| B-5 | **message queue 本格表示 → X-2** (`specs/005 data-model.md:107` / R-3・R-4 の out-of-scope 宣言) | US-2 / FR-004-006 に反映済み。X-1 の in-memory キュー (`still_queued`/`cancelled`) の上に composer 側 queue を載せる | US-2 / FR-004-006 |
| B-6 | roadmap L172-173: **Streamdown の採否を X-1/X-2 で判断** | **該当なし (composer 入力とは無関係)**。Streamdown は transcript 描画 (assistant 出力の未完 markdown 修復) の話であり、composer は入力欄。X-1 が既に評価済み。research R-01 に「本 feature では発火しない」と記録 | research R-01 (該当なし記録) |
| B-7 | **constitution L522 + AD-037 申し送り L179**: Principle VIII 「現状の制約」と roadmap L120 の Automated (A)(B) の持ち主を **X-2 に更新** | `.specify/memory/constitution.md` の Principle VIII Verification 注記を「Automated 2 項目の持ち主は X-2、本 feature で CI に載せた」と更新 + roadmap L115-124 から 2 項目を X-2 へ移設。docs 追随 task (architecture-reviewer が Constitution drift として見る) | tasks (Shared/docs) |
| B-8 | charter ui L161「(残り。X-2 / O-2 / …)」/ L152-161 Related Specs / L174-175 Open Question SPIKE-4 | charter 追随 (上記 Domain Context の charter 追随)。architecture-reviewer が charter drift として見る | tasks (Shared/docs) |
| B-9 | `_overview.md:54/75` X-2 定義 (IME ガード / message queue / draft restore) と独立 feature の根拠 | **該当なし (定義と整合)**。「IME ガード」表記は AD-037 D1 で「自前ガード新設せず既存を殺さない」に精緻化されたため、charter/overview の平易表記との齟齬が出ないよう spec 位置づけで補足済み | 該当なし (記録) |

**「該当なし」判断**: `PLAN.md` L692/770/773 (feature backlog / SPIKE-4 の旧記述。SSoT は roadmap/overview)、
`ux-reviewer.md:27` の "UX-2" (grep 偽陽性)、`AD-028:193` (持ち主継承の文脈。処理不要)、
speckit gate-verdict JSON の `e2e`/`playwright` ヒット (別 feature の成果物。偽陽性)。

## Technical Context

- **Stack** ([docs/discovery.md](../../docs/discovery.md) を正とする): TypeScript 5.9 / Electron 39 /
  electron-vite 5 / React 19 / Tailwind 4 / `@assistant-ui/react` 0.15 / zustand 5 / Vitest 5。
  **新規導入: Playwright (E2E) — 現状「未導入」(discovery.md)。本 feature が最小構築する** (AD-037 D4)
- **Build / Test / Lint** ([docs/discovery.md](../../docs/discovery.md) の "Build / Test / Lint" 表の「agent 用」列を正とする):
  lint = `node node_modules/eslint/bin/eslint.js --cache .` / typecheck = 2 project の `tsc --noEmit` / depcruise /
  `check:constitution` / test = Vitest。**新規: e2e = Playwright の agent 用コマンドを discovery.md に追加** (SH-conf2)
- **Storage**: N/A (下書きはメモリ内。永続層を導入しない。FR-008)
- **Target Platform**: Windows / Electron (Chromium 単一エンジン。AD-001)。CI ランナー = windows-latest (discovery.md)
- **Project Type**: Electron デスクトップアプリ (renderer = React)。**本 feature は frontend (renderer) + テスト基盤のみ**
- **レイヤ配置** (AD-023):
  - `renderer/src/features/session/` — `LiveThread` (`useExternalStoreRuntime` に message queue capability 宣言 +
    実行中の `onNew` を queue へ + 下書き state の保持)、`SessionScreen`。**feature 側の配線はここ**
  - `renderer/src/components/assistant-ui/elements/thread.aui.tsx` — `Composer` に `ComposerPrimitive.Queue` /
    `QueueItemPrimitive` の表示を追加 (vendored registry 複製。**registry からの乖離を最小化**。Principle XIII)
  - `e2e/` (新規) — Playwright specs (IME 確定 Enter 非送信 / 日本語スクリーンショット比較)。**src グラフに混ぜない** (SH-conf1)
  - `.github/workflows/verify.yml` — E2E ジョブ追加 (SH-conf3)。`docs/` / `.specify/memory/constitution.md` — docs 追随 (B-7/B-8)

## Architecture: 3 つの実装面

**IME (作り変えない最小) / queue (X-1 の上に乗せる) / 検証基盤 (新規導入) を分ける。**

```
renderer (ui)                                          既存 (X-1 / assistant-ui)
────────────                                           ─────────────────────────
composer 入力 ──(未確定は isComposing ガードで送信抑止)──▶  ComposerPrimitive.Input の二重ガード (消費側は殺さない)
   │                                                        ▲ onKeyDown/submitMode/Input を上書きしない (FR-001)
   │ 実行中 (running/awaiting_permission) の送信
   ▼
message queue (capability 宣言) ──現ターン完了後──▶ session.send (X-1) ──▶ AsyncIterable stdin の次ターン (AD-036)
   │  積み/取消は X-1 の still_queued/cancelled (FR-006)
   ▼
下書き state (feature 側・メモリ) ──Thread 再構成をまたいで保持──▶ composer 復元 (FR-007。永続層に出さない)

検証基盤 (新規)
─────────────
e2e/ (Playwright + Electron 起動 + 日本語フォント) ──▶ CI (verify.yml): IME E2E / 日本語スクリーンショット比較
```

- **IME 面**: 自前ガードを足さない。消費側 (`thread.aui.tsx` の `Composer` / `SessionScreen` の `LiveThread`) が
  `onKeyDown` で `preventDefault` しない / `submitMode` を既定のまま / `Input` を差し替えないことを守る (FR-001)。
  回帰は E2E (FR-012) と component/静的検査で固定
- **queue 面**: `useExternalStoreRuntime` に message queue capability を宣言し、実行中の `onNew` を送信でなく
  queue 追加に回す。積んだ項目は現ターン完了を trigger に `session.send` で次ターンとして送る (dispatch trigger の
  auto/manual は research R-02 で確定)。中断時は X-1 の `still_queued`/`cancelled` を提示 (FR-006)
- **下書き面**: composer text を feature 側 state (zustand or session state) に持ち上げ、Thread 再構成
  (phase/isDisabled 変化) をまたいで復元する。**メモリ内限定・IPC/永続層に出さない** (FR-007/008)
- **検証基盤面**: Playwright で Electron を起動し、CDP の composition イベント注入で確定 Enter を再現 (research R-05)。
  日本語スクリーンショットは基準画像比較。日本語フォントを CI に導入 (research R-04)

## Constitution Check

`.specify/memory/constitution.md` v1.2.6 に基づくゲート。該当しない項目は「N/A: <理由>」と明記する。
(Principle VIII の「現状の制約」は v1.2.1〜v1.2.6 と AD-024#18 で改定済み。持ち主移設の PATCH 追随は tasks の docs 追随で行う。design-gate M-2)

| Principle | 本 feature での遵守 | 検証 |
|---|---|---|
| **VIII** (日本語で破綻しない) | **本 feature の主目的**。自前ガード新設せず既存二重ガードを殺さない (FR-001)。全角混在レイアウト (FR-002)。**Automated (A) IME E2E / (B) 日本語スクリーンショット比較を CI に常設** (FR-009/010/011)。正本は grep でなく E2E (AD-024 #18) | IME E2E + スクリーンショット比較 (CI 常設。SC-001/002/006) + component/静的検査 (既存ガード非破壊) |
| **XIII** (element / design system 優先) | queue 表示は `ComposerPrimitive.Queue`/`QueueItemPrimitive` を用い自作しない。composer は `ComposerPrimitive.Input` のまま (差し替えない) | convention/ux-reviewer。registry 乖離が無いこと |
| **XIV** (Ubiquitous Language) | `composer` / `message queue` / `draft` を glossary に追記 (FR-013) | architecture/po-reviewer |
| **XV** (Multi-language) | UI/表示は日本語第一、code identifier は英語、commit は英語 1 行。i18n リソース化は M3 判断 | (drift check) |
| **XI** (垂直スライス) | 「確定 Enter で送信されない / 実行中に積める / 下書きが復元される / CI が緑」の観測可能な振る舞いを持つ | po-reviewer |
| **V** (資格情報を永続化しない) | 下書き・キュー内テキストは**会話由来ペイロード**。ログ・エラー・永続層に出さない (メタのみ)。下書きはメモリ内 | ログ走査 (会話由来文字列の混入 0) |
| **IV** (SDK 経由) | queue の次ターン送信は X-1 の `session.send` を再利用 (SDK `query()` 経由)。X-2 は SDK 呼び出しを新設せず自前パースもしない | 呼び出し形の再利用確認 (新設 0) |
| **XII** (未表示情報を残さない) | **N/A (本 feature は SDK emit 型の新規表示を追加しない)**。message queue に積むのは利用者自身の入力であり SDK emit ではない。ui-coverage 対応表の確立は O-2 (検証基盤が O-2 まで不在。roadmap) | (O-2 で ui-coverage-reviewer) |
| **I** (パス操作は domain のパス API) | **N/A**: renderer の composer/queue/draft はパス操作を持たない | — |
| **II** (プラットフォーム分岐は runtime 内) | **N/A**: renderer に `process.platform` 分岐を書かない。E2E ハーネスの OS 依存はテスト基盤であり src の分岐ではない | check.mjs 項目 8 (src 対象) |
| **III** (権限モードは capability) | **N/A**: composer は permissionMode に触れない (X-1 が `default` 固定) | — |
| **VI** (永続環境を構築しない) | 永続層を導入しない。E2E は使い捨ての CI ジョブ。**ただし CI の日本語フォント provisioning は VI の対象** — リポジトリ同梱フォント (`e2e/` の .ttf) のみを用い CI でパッケージマネージャ導入をしない (AD-038 D4)。check.mjs 項目 1 は verify.yml を走査しない死角のため **Manual (platform-boundary/security) + 同梱限定で守る** (SCAN_FILES 拡張は system-scope 後続。design-gate H-6) | platform-boundary/security-reviewer + 同梱限定 (機械検証は死角) |
| **VII** (supervisor は Electron/native 非依存) | **N/A**: X-2 は renderer とテスト基盤のみ。agents を触らない (queue 次ターンは X-1 の session 経路を再利用) | — |
| **IX** (main をブロックしない) | **N/A**: 新規の main パースを起こさない。X-1 の port transfer を再利用 | — |
| **X** (正本はアプリ外) | **N/A**: 下書きはメモリの一時状態。セッションの正本は Claude Code 側 (X-1) | — |
| **Domain charter 整合** | ui charter の composer (IME/queue/draft) In scope に収まる。他 domain の起動ロジック (session)・表示以外に踏み込まない | architecture-reviewer (charter drift) |

**新規 ADR (本 feature で起票済み)**: **[AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — E2E /
スクリーンショット検証ハーネスの導入** を **proposed で起票した** (design-gate M-1 で architecture-reviewer が「起票すべき」と
判断)。Playwright + `_electron.launch` / e2e の src グラフ外分離と lint/depcruise/tsc scope carve-out / 日本語フォント
同梱限定 (VI) / capability stub による credential-free 到達 (V) / 基準画像ガバナンス / scope を Principle VIII の 2 項目に
限定、を固定する。将来の deferred 項目 (スクロール安定 E2E / Principle IX 到達集合検査。roadmap L122-124) はこの基盤の上に
積む。**design-gate 再確認で Critical 0 を得た時点で accepted へ昇格** (X-1 が AD-036 を起票した運用に倣う)。

## Project Structure

```text
specs/006-ui-japanese-ime-composer/
├── plan.md              # 本ファイル
├── research.md          # Phase 0 (queue capability / draft state / Playwright harness / screenshot / IME E2E 注入)
├── data-model.md        # Phase 1 (Composer draft / MessageQueueItem / 状態遷移)
├── contracts/
│   └── composer-behavior.md   # composer 挙動契約 + CI 検証契約
├── quickstart.md        # Phase 1 (人間 deferred の視覚検証 + 実機 IME 目視)
└── tasks.md             # Phase 2 (/cl-tasks が生成)
```

**Source (本 feature が触れる範囲。frontend のみ)**:

```text
src/renderer/src/
├── features/session/          # LiveThread の useExternalStoreRuntime に queue capability + 下書き state / SessionScreen
└── components/assistant-ui/elements/thread.aui.tsx  # Composer に Queue 表示 (registry 準拠・最小改修)

e2e/                           # 新規: Playwright specs (ime / composer-screenshot) + 日本語フォント
playwright.config.ts          # 新規
.github/workflows/verify.yml  # E2E ジョブ追加
docs/{glossary.md, roadmap.md, domains/ui/charter.md}, .specify/memory/constitution.md  # 追随 (B-7/B-8)
eslint.config.mjs, .dependency-cruiser.js, tsconfig.*  # e2e scope 編入 (SH-conf1)
docs/discovery.md             # E2E コマンド行追加 (SH-conf2)
```

**Structure Decision**: 本 feature は renderer の composer 配線 + 新規 E2E テスト基盤。実装コードは
`src/renderer/src/features/session/` に集約し (feature 側の配線)、vendored registry (`components/assistant-ui/elements/`)
への改修は queue 表示の最小追加に留める (Principle XIII)。E2E は src グラフと分離した `e2e/` に置く。

## Phases

### Phase 0: Research ([research.md](research.md))
- R-01: **Streamdown は本 feature で発火しない**ことの記録 (composer 入力は描画経路でない。B-6)
- R-02: assistant-ui の **message queue capability の宣言方法**と `ComposerPrimitive.Queue`/`QueueItemPrimitive` の
  配線。実行中の `onNew` を queue に回す形。dispatch trigger (完了直後 auto か明示か) の確定
- R-03: **下書き state の持ち方** (feature state / zustand への持ち上げ)。Thread 再構成をまたぐ復元。メモリ限定
- R-04: **Playwright + Electron を CI で起動する構成**とスクリーンショット比較・日本語フォント provisioning。
  基準画像のガバナンス (人間 deferred の初回承認)
- R-05: **IME 確定 Enter の E2E 再現方法** (CDP の composition イベント注入で `isComposing` を再現)。自動化可能な範囲と
  人間 deferred (実機 electron の確定 Enter タイミング目視) の切り分け

### Phase 1: Design & contracts ([data-model.md](data-model.md) / [contracts/composer-behavior.md](contracts/composer-behavior.md) / [quickstart.md](quickstart.md))
- data-model: `Composer draft` / `MessageQueueItem` / 状態遷移 (queued→dispatched/cancelled、draft の保持/クリア)
- contracts: composer 挙動契約 (IME 非破壊 (a)(b)(c) / queue capability / 次ターン dispatch / 下書き保持) と
  **CI 検証契約** (IME E2E ジョブ / 日本語スクリーンショット比較ジョブ) を SC と対応づける
- quickstart: 人間 deferred の視覚検証 (実機 IME 確定 Enter 目視 / 全角行送りの見え / 基準画像の初回承認)

### Phase 2: 実装 (tasks.md が正)
FE (renderer の composer 配線 + component テスト) → E2E 基盤 (Playwright + CI) → Shared (glossary / charter /
constitution / roadmap / discovery / eslint・depcruise scope の docs・config 追随)。

### Phase 3: 検証
Vitest (SC-001 の静的/component / SC-003/004/005) + Playwright E2E (SC-001 IME / SC-002 スクリーンショット / SC-006 CI 存在) +
機械検証 (lint / typecheck / depcruise / check:constitution) + quickstart 実機 (人間 deferred)。

## Complexity / risks

- **E2E ハーネスの新規導入** (最大の新規性)。Playwright + Electron を CI で起動する構成は本プロジェクト初。
  日本語フォントの provisioning と基準画像のブレ (フォント差) がリスク。research R-04 で最小構成を確定し、
  ADR 化を design-gate で判断
- **IME 確定 Enter の E2E 再現**。GUI の実 IME 操作は自動化できない (AD-037 代償節) ため、CDP の composition イベント
  注入で `isComposing` を再現する。**実機 electron の確定 Enter タイミングは人間 deferred** (quickstart) と明示し、
  E2E が担保する範囲を正直に切り分ける (X-1 SC-005 の「fake では踏めない」明示と同じ姿勢)
- **queue の次ターン dispatch と session domain の整合**。X-1 の in-memory キュー (`still_queued`/`cancelled`) と
  AsyncIterable stdin を再利用し、**interrupt→steer しない** (AD-036 に踏み込まない)。dispatch trigger の細部を
  research R-02 で確定
- **既存 IME ガードを殺さないことの機械検証**。`bad_pattern_grep` は番人でない (AD-024)。E2E (確定 Enter 非送信) +
  静的検査 (消費側で `preventDefault`/`submitMode` 上書き/`Input` 差し替えが 0 件) の二段で担保
- **X-1 のテスト債務の合流** (B-2)。`SessionScreen`/`useLiveSession` の kill・failure component test を composer 面と
  合わせて載せる。scope を composer 関連に絞りつつ同ファイルの kill 経路も拾う

## Post-design re-check (design-gate 前の自己点検)

- [ ] FR ↔ SC ↔ Acceptance の対応に欠落が無い (FR 13 / SC 6 / US 4)
- [ ] 上流申し送り (A-1〜A-4 / B-1〜B-9) 全件に割当先または「該当なし」理由がある
- [ ] 新規 ADR (AD-038 E2E ハーネス) を proposed で起票し、Related ADRs / spec Dependencies から辿れる
- [ ] design-gate High (H-1 two-queue 単一 locus / H-2 IME E2E running 状態 / H-3 E2E credential-free / H-4 全終端 disposition / H-5 マウス送信 / H-6 フォント同梱) を spec/plan/tasks/research/data-model/contracts に反映した
- [ ] charter 追随 (Related Specs / Open Question) と constitution/roadmap 追随 (B-7) を tasks に含めた
- [ ] Principle VIII の「Automated の正本は grep でなく E2E」(AD-024) を検証設計に反映した
