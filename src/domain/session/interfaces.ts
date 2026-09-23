import type { WslRuntimeDescriptor } from '@domain/runtime/descriptor'
import type { HostPath } from '@domain/runtime/path-types'
import type { VerifiedRunning } from '@domain/runtime/verified-running'

import type { EnumerationTarget, FailureReason } from './target'

/**
 * `domain` が宣言し、`infra` (探索) と `app` (プロセス生成) が実装する (AD-023 §3)。
 *
 * **境界を越えるのは値であって手続きではない。**
 */

/** 候補ごとの失敗。**所在全体の失敗にしない** (FR-030)。 */
export interface TargetIssue {
  /** 表示用の候補名 (ユーザ名など)。識別子として使わない。 */
  readonly label: string
  readonly reasonKey: FailureReason
  /**
   * 候補一覧の位置 (pr-gate Round 1 / security H-003)。
   *
   * **序数の払い出しを 1 箇所に寄せるために持たせた。**
   * 以前は失敗行の `key` を呼び出し側が `targets.length + index` で作っており、
   * **候補の一部が権限拒否に転じると失敗行の key が別候補の対象 key と一致した**。
   *
   * 例: 候補が `/home/alice`(0) / `/home/bob`(1) / `/root`(2) で bob が権限拒否のとき、
   * 対象は `#0`(alice) と `#2`(root)、失敗行は `2 + 0 = #2` → **root と衝突する**。
   * `targetKey` は未信頼入力の照合に使う唯一の鍵なので (FR-043 / SC-010)、
   * 一意でないと **renderer が指した行とは別の対象が列挙される**。
   * `/root` が UNC 経由で Access denied になることは実測済で、実機で最も起きやすい配置である。
   *
   * **候補一覧の位置であり、対象一覧の位置ではない** — 対象の位置にすると、
   * ある候補が権限拒否に転じた回で以降の `key` が全部ずれる。
   */
  readonly ordinal: number
}

/**
 * 候補探索そのものが失敗したときの序数 (pr-gate Round 1 / security H-003)。
 *
 * `/home` が読めない失敗は**候補を 1 件も特定できていない**ため、候補一覧の位置を持たない。
 * 候補の序数 (0 以上) と衝突しない値を予約する。
 *
 * **0 を使わない。** `/home` が読めないとき `/root` が候補 0 になるため、
 * 0 を割り当てると衝突する。
 */
export const DISCOVERY_ISSUE_ORDINAL = -1

export interface TargetDiscovery {
  readonly targets: readonly EnumerationTarget[]
  readonly issues: readonly TargetIssue[]
  /**
   * `.claude` を持つ候補が 1 件も無かった。
   * **失敗ではなく「履歴なし」である** (FR-012) — 混ぜると Claude Code を
   * 使っていないディストロが毎回エラーとして現れる。
   */
  readonly noHistory: boolean
}

/**
 * 列挙対象の探索 (FR-009 〜 FR-012)。UNC 経路の浅い列挙で完結する。
 *
 * **`wsl.exe` を使わない** (FR-006 / SC-003)。実測でホームの浅い列挙は 69 ms。
 */
export interface EnumerationTargetFinder {
  /**
   * 所在 `windows` の既定 1 件。
   *
   * **ホームディレクトリは注入で受け取る** — 実装が置かれる
   * `src/main/infra/session/` は `os` / `process` / `electron` のいずれも import できない
   * (R-1 の許可行列)。composition root が `app.getPath('home')` を解決して渡す
   * (R-1 が `userData` に対して採ったのと同じ形)。
   *
   * 注入しないと `process.env.USERPROFILE` へ倒れ、**import が無いので lint も
   * 検証スクリプトも素通りしたまま Windows 前提の分岐が `infra/runtime/` の外に生える。**
   *
   * **`wsl:<D>` 側と同じく `.claude` の存在を確認する** (design-gate M-001)。
   * 存在しないディレクトリに `CLAUDE_CONFIG_DIR` を向けたとき SDK が
   * ディレクトリを作るかは未確認であり、作るなら FR-013 と Principle VI に触れる。
   * 対象を作らなければその経路は**構造的に無くなる**。
   * 非対称にしておくと、Claude Code を一度も使っていないホストだけが例外経路を通る。
   */
  hostTarget(hostHome: HostPath): Promise<TargetDiscovery>

  /**
   * 所在 `wsl:<D>` の候補。
   *
   * **実行中確認済みの値しか受け取らない** (FR-008)。
   * `.claude` が無い候補は返さず、権限拒否は候補ごとの失敗として返す。
   */
  wslTargets(
    descriptor: WslRuntimeDescriptor,
    verified: VerifiedRunning,
    now: number
  ): Promise<TargetDiscovery>
}

/**
 * 列挙プロセスが返す 1 セッション分の生の値。
 *
 * **出自の判定前**である — 作業ディレクトリは生文字列のまま返し、
 * 判定は `domain` の純粋関数が行う (contracts C-3)。
 * **正規化もまだ掛かっていない** (FR-049 は main 側で掛ける)。
 *
 * ## `sessionId` 以外がすべて `unknown` である理由
 *
 * この値は config ディレクトリ由来 = **アプリ外のプロセスが書いた未信頼入力**である
 * (FR-049 が明示している)。型宣言は「そう書かれているはず」であって保証ではない。
 *
 * 以前は数値 3 項目だけが `unknown` で、文字列 6 項目は `string | null` と
 * 宣言されていた。**同じ未信頼入力に 2 つの扱いがあった**わけで、
 * `"cwd": 123` のような値が `normalizeText` の `for...of` に届いて
 * TypeError を投げ、**一覧全体が落ちた** (pr-gate Round 2 / H2-003)。
 *
 * 型を揃えると、正規化の入口が `normalize.ts` の 1 箇所になる。
 * 型が違う値は「不明」に倒れ、**行は落ちない** (FR-049)。
 *
 * **`sessionId` だけは `string` を要求する。** 識別子が無い行は
 * 鍵も表示も作れない (FR-047 の最後の手段が識別子である)。
 * これが唯一「行を作れない」条件であり、`protocol.ts` が応答ごと拒む。
 */
export interface RawSessionRecord {
  readonly sessionId: string
  readonly summary: unknown
  readonly firstPrompt: unknown
  readonly customTitle: unknown
  readonly lastModified: unknown
  readonly createdAt: unknown
  readonly fileSize: unknown
  readonly gitBranch: unknown
  readonly tag: unknown
  /** 記録されていた生の作業ディレクトリ。**UNC 形式でありうる。** */
  readonly cwd: unknown
  /**
   * SDK / daemon 由来か (実測で 269 件中 40 件。research R-09)。
   *
   * **`SDKSessionInfo` にこの項目は無い** (design-gate L-002)。
   * `includeProgrammatic` は**フィルタであって区別子ではない**ため、
   * 列挙プロセスが 2 回列挙して差集合で決める。
   * 取得手段の詳細は `src/agents/enumerate-sessions.ts` にある。
   *
   * **これは列挙プロセスが算出する値**であり SDK 由来ではないので、`boolean` を保証できる。
   */
  readonly programmatic: boolean
}

/*
 * **`worktree` は `RawSessionRecord` に無い。**
 *
 * こちらも `SDKSessionInfo` に無く、判定手段は
 * 「作業ディレクトリが `.claude/worktrees/` を含むか」という**パスの形**である。
 * 列挙プロセスはパス値に一切触らないと決めた (AD-028 §3 規則 3 の訂正版) ため、
 * 判定は `domain` の `isWorktreeOrigin()` が出自の値に対して行う。
 */

/** 先頭ページか全件か (research R-06)。 */
export type EnumerationScope =
  | { readonly kind: 'page'; readonly limit: number; readonly offset: number }
  | { readonly kind: 'all' }

export interface EnumerationRequest {
  readonly target: EnumerationTarget
  readonly scope: EnumerationScope
  readonly timeoutMs: number
  /**
   * 所在が `wsl:<D>` のとき**必須**。所在が `windows` のときは `null`。
   *
   * **ゲートを型として表す** (FR-008 / SC-002 / contracts C-1)。
   * **プロセスの起動自体が UNC アクセスを引き起こす**ため、
   * ファイルアクセスにだけ確認済みの値を要求すると、停止中の所在へ子プロセスが飛ぶ。
   * 「起動前に確かめる」という約束ではなく、**値が無ければ起動できない形**にする。
   */
  readonly verified: VerifiedRunning | null
  /** 有効期間の判定に使う。**呼び出し側の時計を受け取る** (R-1 と同じ形)。 */
  readonly now: number
}

export type EnumerationResult =
  | {
      readonly ok: true
      readonly sessions: readonly RawSessionRecord[]
      /** 件数上限で打ち切ったか。**黙って切らない** (FR-038)。 */
      readonly truncated: boolean
    }
  | { readonly ok: false; readonly reasonKey: FailureReason }

/**
 * 1 つの列挙対象に対する 1 回の列挙 (contracts C-1)。
 *
 * 実装は**短命プロセスを起動する**。インタフェースにするのは、
 * 実プロセスを起こさずにグループ分けとエラー経路を検証するためである
 * (AD-023 §4 の「テストで差し替えたい」に該当)。
 */
export interface SessionEnumerator {
  enumerate(request: EnumerationRequest): Promise<EnumerationResult>
}
