---
id: AD-038
title: E2E / スクリーンショット検証ハーネスの導入 (Playwright + Electron)。credential-free・フォント同梱・e2e を src グラフ外に分離し、scope は Principle VIII の 2 項目に限定する
status: accepted
date: 2026-09-27
deciders: [ukitomato]
tags: [ui, testing, e2e, ci, principle-vi, principle-viii, i18n]
supersedes: []
superseded-by: []
related: [AD-023, AD-024, AD-034, AD-036, AD-037]
---

# AD-038: E2E / スクリーンショット検証ハーネスの導入

> **status: accepted (2026-09-29 昇格。起票 2026-09-27)。** X-2 (spec `006-ui-japanese-ime-composer`) の design-gate M-1 として起票。
> architecture-reviewer が「research ノート留めは governance 不足。起票すべき」と判断した (先例 AD-036 = X-1 の基盤 /
> AD-034 = R-3 の port transfer)。**design-gate PASS + pr-gate Critical 0 を得たため accepted へ昇格** (AD-036 の
> proposed→accepted 運用に倣う。pr-gate Round 2 arch-L-001)。D3 の注入機構は実装 (main 側 IpcDependencies 差し替え) に一致済み、
> D4 のフォント注入は FontFace + CSSOM に更新済み。

## Context

X-2 は Constitution Principle VIII (NON-NEGOTIABLE) の Automated 2 項目 — composer の IME テストと日本語を含む
スクリーンショット比較 — を CI に常設する ([AD-037](0037-japanese-ime-composer-behavior.md) D3)。これは本プロジェクトで
**初めて E2E / GUI 起動を CI に持ち込む** feature である (discovery.md: Playwright は宣言のみで未導入)。この基盤は
[docs/roadmap.md](../roadmap.md) L115-124 の deferred「E2E / 検証基盤 feature」が後で積む 2 項目 (スクロール安定 E2E /
Principle IX 到達集合検査) の土台にもなるため、技術選定・CI 統合・検証 scope の carve-out・資格情報境界・フォント
provisioning・基準画像ガバナンスを ADR に固定する (research ノートだと後続 feature が根拠を辿れず drift する)。

design-gate は次のギャップを指摘した: (H-3) E2E が有効 composer に real 資格情報なしで到達する手段が未定義、
(H-6) 日本語フォント provisioning が Principle VI の機械検証 (check.mjs 項目 1 は `.github/workflows/verify.yml` を
走査しない) の死角に落ちる、(M-6) e2e を lint/depcruise/tsc の scope に naïve に足すと AD-023 の機械強制レイヤ規則が
誤発火し、緩める誘惑が src の強制を弱める。

## Decision

### D1. Playwright を採用し `_electron.launch` で本アプリの Electron/Chromium を起動する
E2E フレームワークは Playwright (discovery.md 宣言スタック)。**アプリ同梱の Electron/Chromium を `_electron.launch` で
起動し、Playwright の独立ブラウザ取得 (`playwright install`) はしない** (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` 相当)。
供給網・バイナリ provenance の増加を避ける (design-gate L-5)。依存は pnpm lockfile で pin する。

### D2. e2e を `e2e/` に置き、src の依存グラフから分離する
`e2e/` は src の dependency-cruiser 起点 (`dependency-cruise.mjs src`) に**混ぜない** — e2e 専用の実行 (別 config / 別
起点) とする。同一グラフに入れる場合も AD-023 の global ルール (`from: {}`) を緩めず `e2e/` を各ルールの `pathNot` 例外に
加える。`not-to-test` の prefix を `^(specs|tests|e2e)` に拡張し src→e2e の逆流入を塞ぐ。eslint は `e2e/**` の明示
override (react-refresh/react-hooks off、Playwright 向けのみ) を足し、base を緩めない (design-gate M-6 / L-8)。
**実名リスト方式の既存ルールを緩める形の scope 編入を禁じる。**

### D3. E2E は capability 層を stub し credential-free で有効 composer に到達する
E2E は capability 層 (`window.closta` = `launchSession` / `sendPrompt` 等) を stub し、fake の runtime / session を
注入して active phase (`isDisabled: false`) を決定的に作る。**real な Claude 認証・WSL・外部 API 接続・長期資格情報を
CI env / GitHub secrets に一切持ち込まない** (Principle V)。これにより SC-001 が要求する「有効 composer」を
偽の緑 (isDisabled: true の無効 composer) でなく満たす (design-gate H-3)。

**注入機構 (design-gate security M-001)**: `src/renderer/src/test-support/capability.ts` は Vitest 専用 (`vi.stubGlobal`)
であり `_electron.launch` の実 Electron (contextBridge / contextIsolation 固定) には注入できない。
**注入方式は当初案の「E2E 専用 preload を起動オプションで指定 + `stubCapability` 再利用」ではなく、main 側の 1 分岐で
`IpcDependencies` を差し替える形とする** (X-2 実装)。理由: `_electron.launch` は実 main が自前で作る window の preload
(`window.ts`) を上書きできず、字面どおりの「専用 preload 指定」は結局 main 側の分岐を要して D3 自身の「preload を env/flag で
差し替えない」と衝突する。また renderer の `stubCapability` は handshake DTO を返す形で main 側 `IpcDependencies` (launchSession が
port 付き `LaunchOutcome` を返す) と形状が異なり流用できない。実装:
- **preload も `window.closta` も本番と同一**。`src/main/index.ts` が **`!app.isPackaged && process.env.CLOSTA_E2E === '1'`** の
  ときだけ `createComposition()` の代わりに `createE2eCapability()` (`src/main/app/e2e-capability.ts`) を配線し、
  `registerIpcHandlers(stub.ipc)` で **`IpcDependencies` だけを差し替える** (第 2 の `exposeInMainWorld` を作らない)。
- fake の folder/runtime を seed し、`launchSession` は `MessageChannelMain` で合成 stream を返す (`utilityProcess`/`fork`/`spawn`
  不使用 = `PROCESS_SPAWN_MODULES` 非該当)。
- **`app.isPackaged` が本番で true になり分岐は到達不能 = production-inert** (env 単独ゲートにしない。origins.ts E-H004 と同一原則)。
  preload の単一 capability 境界 (FR-039 / AD-023) を迂回する攻撃面を作らない (むしろ preload 非差し替えで境界を強める)。

### D4. 日本語フォントはリポジトリ同梱のみ。ホストへの永続的フォント変更を一切しない
基準画像がフォント差でぶれないよう、**日本語フォントを `e2e/` 配下に .ttf として commit し、非永続な注入経由でのみ用いる**。
実装 (X-2) では Noto Sans JP (OFL。`e2e/fonts/NotoSansJP-Regular.ttf` + `OFL.txt`) を同梱した。
**注入方式は当初案の Playwright `addStyleTag` (inline `<style>`) ではなく `FontFace` API + CSSOM とする** — アプリの CSP が
`style-src 'self'` (unsafe-inline なし) で inline `<style>` を弾くため addStyleTag は実走で `CSP violation` になる (実測)。
`font-src 'self' data:` は data URL フォントを許すので、`new FontFace(...url(data:...))` + `document.fonts.add` でフォントを
登録し、`el.style.setProperty('font-family', ..., 'important')` (CSSOM) で当てる。どちらも CSP style-src に抵触せず、**本番 CSP を
テストで緩めない** (`Page.setBypassCSP` は使わない)。**CI ランナー / ホストへの永続的フォント変更 —
OS 登録・`Fonts` ディレクトリ複製・`fc-cache` / `reg add` / PowerShell `Add-Font` / パッケージマネージャ導入
(choco/apt/sudo) 等 — を一切禁じる** (Principle VI = NON-NEGOTIABLE。design-gate H-6/H-101。禁止対象を「パッケージ
マネージャ」に限定せず「ホスト永続変更全般」に広げる)。`scripts/constitution/check.mjs` 項目 1 の `SCAN_FILES` は
`.github/workflows/verify.yml` を含まず font provisioning の VI 違反を機械検出できない (死角)。当面は **同梱限定 +
非永続注入 + Manual reviewer (platform-boundary / security)** で守り、`SCAN_FILES` への verify.yml 追加は system-scope の
後続対応として `docs/roadmap.md` に owner 付きで登録する (design-gate H-6/H-101/M-101)。

### D5. スクリーンショット基準画像のガバナンス
基準画像はリポジトリに commit し、更新は PR レビューで承認する。**基準画像に会話本文・config ディレクトリ由来情報を
含めない** (credential-free の帰結)。初回基準画像の視覚的妥当性 (全角の行送り・折返しの見え) の判断は**人間 deferred**
とし quickstart に記録する (R-3 rubric-b と同じ扱い。jsdom はフォント/字幅を持たない。AD-024)。

### D6. 本ハーネスの scope は Principle VIII の 2 項目に限定する
本 feature が載せるのは **IME E2E と日本語スクリーンショット比較のみ**。roadmap L122-124 の deferred 2 項目
(スクロール安定 E2E / Principle IX 到達集合検査) は移設せず deferred feature に残す (過剰前倒しをしない。AD-037 D3)。
ただし本ハーネスはそれらが後で積める土台として設計する。

## Consequences

### 良くなること
- Principle VIII の Automated が CI で恒久固定され、grep でなく E2E が検証の正本になる (AD-024 #18)。
- 後続 deferred (スクロール安定 / 到達集合検査) が同一ハーネスに積める根拠を得る。
- credential-free・フォント同梱により CI が外部依存・秘密・不安定接続を持たない。

### 代償 / リスク
- CI に Electron 起動コストが加わる (E2E ジョブ)。
- 基準画像のメンテナンス (フォント/レイアウト変更で撮り直し) が発生する。
- **Principle VI の font provisioning は機械検証の死角**であり Manual reviewer + 同梱限定でしか守れない (SCAN_FILES 拡張まで)。
- capability stub が実挙動と乖離すると E2E が実アプリの回帰を見逃す — stub (`src/main/app/e2e-capability.ts`) は real の
  `IpcDependencies` / `SessionLaunchService` と同じ契約 (handshake + port) を模し乖離を抑える。

## Confirmation

- `.github/workflows/verify.yml` に IME E2E ジョブと日本語スクリーンショット比較ジョブが存在し緑。
- E2E が `_electron.launch` を用い `playwright install` の独立ブラウザ取得をしない。
- E2E が capability stub (main 側 `IpcDependencies` を差し替える `createE2eCapability`。preload は本番と同一) で有効 composer に
  到達し、CI env/secrets に real 資格情報が無い (走査で 0 件)。**stub 注入経路が production ビルドで到達不能である
  (`!app.isPackaged && CLOSTA_E2E` で production-inert。env 単独ゲートにしない)**。
- 日本語フォントが `e2e/` 同梱で非永続注入 (`@font-face` / Playwright) 経由で供給され、verify.yml に OS 登録・Fonts 複製・
  fc-cache・パッケージマネージャ導入 等のホスト永続変更が無い。
- e2e が src の depcruise グラフに混ざらず、既存レイヤ規則が緩められていない (depcruise / lint 緑 + `not-to-test` prefix 拡張)。
- 基準画像に会話/config 由来情報が含まれない。

## References
- [AD-037](0037-japanese-ime-composer-behavior.md) D3 / D4 (Principle VIII Automated の持ち主 X-2 / ハーネスは X-2 実装で入れる)
- [AD-024](0024-constitution-verification-paths.md) #18 (検証の正本を grep から E2E へ / bad_pattern_grep は番人でない)
- [AD-036](0036-single-session-launch-process-and-live-stream.md) / [AD-034](0034-transcript-read-path-and-process-boundary.md) (feature 基盤を ADR 化した先例)
- [AD-023](0023-application-architecture.md) (ESLint + dependency-cruiser によるレイヤ依存の機械強制)
- `docs/roadmap.md` L115-124 (deferred E2E / 検証基盤 feature) / `PLAN.md` §3 (蒸し返しは ADR 起票)
- X-2 spec: `specs/006-ui-japanese-ime-composer/spec.md` (FR-009/010/011/012 / SC-006) / design-gate.md (H-3/H-6/M-1/M-6)
