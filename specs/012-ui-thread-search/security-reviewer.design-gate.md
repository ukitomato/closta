# security-reviewer レビュー: Thread 検索と探す操作 (O-3)

**Run**: 2026-10-04 (design-gate R1)
**Reviewer**: security-reviewer
**Spec**: specs/012-ui-thread-search/spec.md

結論: Critical 0 / High 1 / Medium 3 / Low 3。

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-013、SC-001〜SC-003 / SC-005 / SC-006 (FR-014〜016 / SC-004 / SC-007 は文書でセキュリティ影響なし)
- 該当 charter / Confirmation: Constitution V / IX、AD-023 セキュリティ要件 4〜6 (`preload/index.ts:15-24`、`ipc.ts:64-73,164-172`、`protocol.ts:17-63`)、AD-034 / AD-036 §2、AD-041 (h)、session charter KPI「再利用率」、AD-038 D3
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:1 Medium:2 Low:3
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-023 要件 4〜6 への drift なし)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: database-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

新しい入口は `launchSession(config, origin?)` の第 2 引数、引数なしの `closta:getLaunchUsage`、`launch-usage.json`。renderer 側は要約行の NFKC 正規化の部分一致と、transcript 本文の走査 + `CSS.highlights` の強調。既存の `handle()` / 単一 capability / CSP は効いている。記録は構造上秘密を含まず、未知の起動元で拒否しない設計は良い。新しい依存なし。

## Findings

### [High] 会話内検索の強調が「正規化後の位置」を元の text node の位置として Range に使う設計で、外部由来の本文によって例外または誤った範囲の強調が起きる (H-001) (scope: feature)

- **観察**: data-model §2 は §1 の正規化で一致した範囲の `Range` を作る。正規化 (NFKC / toLowerCase / 除去 / 圧縮) は長さを変える (`U+FDFA` は 18 文字、`İ` は 2 code unit)。`node.length` を超える値で `IndexSizeError`、または別の位置を強調。テストに長さが変わるケースが無い
- **同種事象探索**: offset map の記述 0 件。`new RegExp|innerHTML|dangerouslySetInnerHTML` (src/renderer/src) 本番 0 件・テスト 3 件
- **リスク/影響**: 例外が error boundary まで伝わり transcript が落ちる (表示の DoS)。誤った範囲の強調は表示の偽装
- **推奨アクション**: 正規化後の位置 → 元の (text node, offset) の対応表を作り、元の位置だけを Range に使う (または長さを保つ正規化に限る)。`0 <= offset <= node.length` を検査し範囲外は飛ばす。FE-022 に `U+FDFA` / `İ` / ゼロ幅・双方向制御のテスト
- **根拠**: CWE-20、CWE-129、OWASP ASVS V5.1

### [Medium] `::highlight()` のスタイルの置き場が決まっていない。本番の CSP `style-src 'self'` で開発と本番の振る舞いが分かれうる (M-001) (scope: feature)

- **同種事象探索**: `::highlight` (specs/012) 0 件。`style-src` (src) 4 件
- **推奨アクション**: 規則はバンドルされる CSS に置き、実行時に `<style>` / `style` 属性を足さない。V-3 の目視を本番ビルドで
- **根拠**: AD-023 要件 6 / FR-040

### [Medium] 一致の実装が字面の部分一致に限られると明記されておらず、検索語から正規表現を組む実装を排除していない (M-002) (scope: feature)

- **同種事象探索**: `new RegExp` (src/renderer/src) 本番 0。spec 012 で `RegExp|正規表現` 0 件
- **推奨アクション**: data-model §1 に「`indexOf` / `includes` の字面の一致。`RegExp` を組まない」。FE-010 に `.*` / `(a+)+` / `[` のテスト
- **根拠**: CWE-1333 (ReDoS)、CWE-625

### [Medium] 記録の失敗を握りつぶすだけで観測点が無く、新しいチャネルが送信元検証を通ることのテストも無い (M-003) (scope: feature)

- **同種事象探索**: specs 012 の観測点 0 件。`ipcMain.handle(` (ipc.ts) 1 件 (`handle()` の内部)
- **推奨アクション**: 失敗の種別 (errno のコードだけ) を main のログに 1 行。BE-042 / BE-043 に「全チャネルが `handle()` 経由 (信頼できない送信元で rejected)」のテスト
- **根拠**: AD-023 要件 5、`ipc.ts:66-69`

### [Low] `checkLaunchOrigin` / `getLaunchUsage` / 読み込みの検証の厳密さを文面で固定していない (L-001) (scope: feature)

- **推奨アクション**: `value === 'preset' || value === 'manual'` の厳密比較。`getLaunchUsage` は args を読まない。`Number.isSafeInteger(n) && n >= 0`、実在の暦日

### [Low] Ctrl+K を `window` の capture で受けると、開いている別のダイアログのフォーカストラップより先に palette が開く (L-002) (scope: feature)

- **推奨アクション**: モーダルのダイアログ (`aria-modal`) が開いている間は palette を開かない。FE-031 に

### [Low] FR-013「集計済みの 2 つの数だけを返す」と data-model §4 の戻り値 `{ preset, manual, days: 30 }` の食い違い (L-003) (scope: feature)

- **推奨アクション**: FR-013 を「2 つの回数と集計の日数」に

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `new RegExp\|dangerouslySetInnerHTML\|innerHTML` (src/renderer/src) | 3 (テスト) | pending-queue-notice.test.tsx:38,55, RunningSessionList.monitor.test.tsx:253 |
| H-001 | offset map の記述 (specs 012) | 0 | - |
| M-001 | `::highlight` (specs/012) / `style-src` (src) | 0 / 4 | protocol.ts:24,54, protocol.test.ts |
| M-002 | `RegExp\|正規表現` (specs/012) | 0 | - |
| M-003 | `ipcMain.handle(` (ipc.ts) | 1 | ipc.ts:168 |

## Verdict

- Critical: 0 / High: 1 / Medium: 3 / Low: 3
