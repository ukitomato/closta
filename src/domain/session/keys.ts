import type { BlockedReason } from '@domain/workspace/folder'

/**
 * DTO が運ぶ**参照キーの語彙** (FR-046 / FR-047)。
 *
 * **依存の軽いモジュールに分けてある。** 理由は 1 つで、
 * `dto.ts` は `capability.ts` 経由で `ui` から到達するためである。
 * 判定の実装 (`cwd-origin.ts` / `match.ts`) はパス API に依存しており、
 * そこから型だけを取ると **`ui → node:path` の推移的到達**ができてしまう
 * (実測で `ui-not-to-core` が 4 件発火した)。
 *
 * **型 import でも依存グラフには現れる。** dependency-cruiser は
 * `tsPreCompilationDeps: true` で型だけの import も辿る — 意図的な設定であり、
 * 「型だから安全」は通らない。
 *
 * 訳出は `ui` が行う。ここには**キーだけ**を置き、日本語を持たない。
 */

/**
 * 作業ディレクトリの出自の種別 (data-model §2)。
 *
 * **6 種を潰さない。** `undetected-distro` (どのディストロか分かるが今ない) と
 * `unknown-location` (どのディストロか分からない) は、利用者に示すべきことが違う。
 */
export type CwdOriginKind =
  'host' | 'wsl-from-unc' | 'wsl-inherited' | 'unknown-location' | 'undetected-distro' | 'absent'

/**
 * 保留の理由。**R-1 の `BlockedReason` をそのまま使う。**
 *
 * 別の型として定義すると、R-1 が `unreachable` に分類している `path-not-mapped` を
 * 取り込む誤りが起きる (design-gate round 1 で実際に起きた)。
 * 混ぜると「解消手順がある」と「対応が無い」が同居する。
 */
export type PendingReason = BlockedReason

/** 出自から所在が決まらなかった理由 (data-model §4 第 0 段)。 */
export type UnknownReason = 'cwd-absent' | 'location-unknown' | 'distro-undetected'
