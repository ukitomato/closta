/**
 * SC-004 の計測点 (BE-030)。
 *
 * 計測対象は一覧描画・判定バッチ・キャッシュ再表示・ブラウズ階層移動。
 * **開発ビルドでのみログ出力する** — 出荷物に計測ログを残さない。
 *
 * **`electron` を import しない。** 開発ビルドかどうかは `app.isPackaged` で決まるが、
 * その解決は composition root が行い、ここには真偽値を注入する (FR-038 / AD-023 §8)。
 * ここで `app` を参照すると、計測を使うモジュール全部が Electron 起動を要求するようになり、
 * `runtime-store` のような状態を持つ層が単体テストできなくなる (実測でそうなった)。
 */

/** 計測点の名前。**閉じた集合**にして、後から名前が増えて追えなくなるのを防ぐ。 */
export type MeasurePoint =
  | 'list-runtimes'
  | 'list-runtimes-cached'
  | 'refresh-runtimes'
  | 'probe-batch'
  | 'probe-batch-verify'
  | 'probe-batch-run'
  | 'probe-one'
  | 'list-folders'
  | 'browse-step'
  | 'browse-step-revalidate'
  // R-2 (セッション列挙)。予算は SC-008。
  | 'list-sessions-first-page'
  | 'list-sessions-all'
  | 'list-sessions-cached'
  | 'fetch-more-sessions'

/**
 * **SC-004 が定める予算だけを書く。書かれていない計測点には予算を置かない。**
 *
 * 守る規則は 2 つあり、どちらも実測で破って直した。
 *
 * **(1) 見積りを予算として書かない。** contracts C-1 の見積り
 * (`list()` 約 1.6 秒 / 判定バッチ約 3.2 秒) は AD-015 の実測から導いた**予測**であり、
 * 受け入れ条件ではない。書くと SC-004 を満たしているのに「超過」と記録され、
 * 逆に SC-004 を破っていても気付けない状態が作れる。
 *
 * **(2) SC-004 が budget を定めていない計測点に、別の計測点の予算を流用しない。**
 * `list-folders` に階層移動の 300 ms を与えていたことがあり、
 * 仕様が求めていない超過を毎回報告していた。**要件でないものを要件として報告すると、
 * 本当の超過が雑音に埋もれる。**
 *
 * 予算を持たない計測点は**判定せず経過時間だけを出す**。内訳は依然として要る —
 * `probe-batch` が超過したとき、確認と実行のどちらが食っているかは
 * `-verify` / `-run` を見ないと分からない。
 * **ただし内訳に親の予算を与えてはならない**: 親が 8,977 ms で超過したとき、
 * 内訳の 2,582 ms が「ok」と出た。親の予算を丸ごと食っていても各内訳は合格しうる。
 */
const BUDGET_MS: Partial<Record<MeasurePoint, number>> = {
  // ランタイム一覧の初回描画は 3 秒以内 (`ready-to-show` 起点)。
  'list-runtimes': 3000,
  // キャッシュヒット時の再表示は 100 ミリ秒以内。
  'list-runtimes-cached': 100,
  // capability 判定バッチ全体は 4 秒以内。
  'probe-batch': 4000,
  // フォルダブラウザの階層移動は 300 ミリ秒以内。
  'browse-step': 300,
  // ただし**有効期間をまたぐ 1 手**は実行状態の再確認を伴うため 2 秒以内。
  'browse-step-revalidate': 2000,
  // セッション一覧の先頭 50 件の描画は 2 秒以内 (SC-008)。
  'list-sessions-first-page': 2000,
  // 1 所在あたり 700 件規模の全件取得完了は 10 秒以内 (SC-008)。
  'list-sessions-all': 10_000,
  // キャッシュヒット時の再表示は 100 ミリ秒以内 (SC-008)。
  'list-sessions-cached': 100
  /*
   * **`fetch-more-sessions` に予算を置かない。**
   * SC-008 は先頭ページ / 全件 / キャッシュヒットの 3 つだけを定めており、
   * 続きの取得には予算が無い。別の計測点の予算を流用すると、
   * SC-008 を満たしているのに「超過」と記録される (上記 (2) の規則)。
   */
}

export type Measure = <T>(point: MeasurePoint, run: () => Promise<T>) => Promise<T>

/**
 * 計測関数を作る。
 *
 * @param enabled 開発ビルドかどうか。composition root が `isDevBuild()` を渡す。
 */
export function createMeasure(enabled: boolean): Measure {
  if (!enabled) return (_point, run) => run()

  return async (point, run) => {
    const startedAt = Date.now()
    try {
      return await run()
    } finally {
      const elapsed = Date.now() - startedAt
      const budget = BUDGET_MS[point]
      /*
       * **`finally` の中で `return` しない。** 外側の return / throw を飲む。
       * 判定の有無で分岐するだけなので、報告する文字列を組み立てて 1 箇所で出す。
       */
      const report =
        budget === undefined
          ? // SC-004 が予算を定めていない計測点。**判定を書かない。**
            `${elapsed}ms (SC-004 の予算なし。内訳の観測用)`
          : `${elapsed}ms / 予算 ${budget}ms (${elapsed <= budget ? 'ok' : 'OVER'})`
      console.log(`[measure] ${point} ${report}`)
    }
  }
}

/** 計測しない実装。テストと、計測が要らない経路で使う。 */
export const noMeasure: Measure = (_point, run) => run()
