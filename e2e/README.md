# E2E (Playwright + Electron) — X-2 日本語 composer

Principle VIII の Automated 2 項目 (IME E2E / 日本語スクリーンショット比較) を載せる最小ハーネス
([AD-038](../docs/decisions/0038-e2e-screenshot-harness.md))。**このディレクトリは src の lint/型グラフから分離**されている
(`eslint.config.mjs` ignores / `.dependency-cruiser.js` の `not-to-test` / 専用 `e2e/tsconfig.json`。AD-038 D2)。

## 実行手順 (GUI のある実開発環境)

1. **導入** (独立ブラウザ取得はしない):
   ```
   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm add -D @playwright/test
   ```
2. **ビルド** (E2E は `out/main/index.js` を `_electron.launch` する):
   ```
   pnpm build
   ```
3. **app 側 E2E フック (T030。実装済み)**: `src/main/index.ts` が **`!app.isPackaged && process.env.CLOSTA_E2E === '1'`** の
   ときだけ `createE2eCapability()` (`src/main/app/e2e-capability.ts`) を配線する。fake の folder/runtime を seed し、
   `launchSession` は `MessageChannelMain` で合成 stream を返し (fork/spawn を使わない = `PROCESS_SPAWN_MODULES` 非該当)、
   `send-prompt` で `running`→合成応答→`done` を流す。**packaged では無効 = production-inert** (AD-038 D3 / FR-039 の単一
   capability 境界を保つ — preload も `window.closta` も本番と同一)。real な Claude 認証・WSL・外部 API・秘密を持ち込まない (Principle V)。
4. **同梱フォント (済。H-101)**: `e2e/fonts/NotoSansJP-Regular.ttf` (Noto Sans JP。OFL。`e2e/fonts/OFL.txt` 同梱) を commit 済み。
   スクショ spec が **FontFace API + CSSOM で CSP を壊さず非永続注入**する (`style-src 'self'` が addStyleTag を弾くため。
   `font-src 'self' data:` に従う)。**OS 登録・Fonts 複製・fc-cache・パッケージマネージャ導入はしない** (Principle VI)。
5. **実行**:
   ```
   pnpm exec playwright test -c playwright.config.ts
   # 初回スクショ基準画像:
   pnpm exec playwright test -c playwright.config.ts --update-snapshots
   ```
6. **基準画像の承認 (人間 rubber-stamp)**: 基準画像 `composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` は
   生成・commit 済みで、水平あふれ/桁ずれ/要素崩れ 0 の客観判定も済 (quickstart V-2)。**残るは人間の最終 aesthetic 承認のみ** —
   全角の行送り・折返しの見えを「標準として OK」と確認し、承認者・根拠を `specs/006-ui-japanese-ime-composer/quickstart-results.md`
   の V-2 承認欄に追記する。

## specs

- `ime.spec.ts` — 変換確定 Enter が送信にならない ((i) idle / (ii) running+queue 有効 の両状態) + 変換中マウス送信の非送信 (T006/T019/T031)
- `composer-screenshot.spec.ts` — 全角混在レイアウトの基準画像比較 (T008)
- `support/launch.ts` — Electron 起動 + credential-free 到達ヘルパ

## 現状 (2026-09-28)

- **導入済み**: `@playwright/test` (1.63)。app 側 E2E フック (T030) 実装済み。
- **IME E2E (`ime.spec.ts`) は local で 3/3 緑** — idle / running+queue / 変換中マウス送信。DOM セレクタ (`[data-role="user"]` /
  「セッション起動」nav / 「起動」exact) と CDP composition 注入列は実走で調整済み。**変換中マウス送信の未確定送信は E2E が
  実検出し、`thread.aui.tsx` の確定優先の最小処理 (onMouseDownCapture/onClickCapture) で塞いだ** (AC-6 / AD-037 D1(d))。
- **スクリーンショット比較 (`composer-screenshot.spec.ts`) も local 緑** — 同梱フォント Noto Sans JP (OFL。
  `e2e/fonts/NotoSansJP-Regular.ttf` + `e2e/fonts/OFL.txt`) を **FontFace API + CSSOM で CSP を壊さず注入**
  (アプリの `style-src 'self'` が inline `<style>` を弾くため addStyleTag は使えない。実走で発覚)。基準画像
  `composer-screenshot.spec.ts-snapshots/composer-fullwidth-win32.png` を commit 済み。**残るは人間の最終 aesthetic 承認のみ**
  (客観判定 = 水平あふれ/桁ずれ/要素崩れ 0 は済。quickstart V-2 に承認欄)。絵文字は OS フォント描画のため別ランナーで僅差が出うる。
- CI は `.github/workflows/verify.yml` の `e2e` job に authored (IME 3 + screenshot 1)。実 CI 実行はマージ後。
