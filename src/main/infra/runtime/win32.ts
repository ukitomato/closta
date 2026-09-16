import { fixedCapabilities } from '@domain/runtime/capabilities'
import type { Win32RuntimeDescriptor } from '@domain/runtime/descriptor'

/**
 * `Win32Runtime` の descriptor を生成する (BE-024 / FR-004)。
 *
 * 実地テストを行わず sandbox なし / 無人実行不可を**表明する**。
 * **`probedAt` を設定する** — 設定しないと導出式が `unknown` を返し、
 * AD-003 の Decision Outcome (「`Win32Runtime` は `autoModeSafe: false` として表明する」) と
 * `runtime` charter の KPI を満たせず、利用者には永久に「判定中」と表示される。
 *
 * **パス変換ロジックを持たない。** 恒等変換であり `PathMapping` も持たない (data-model §2)。
 * 変換はパス API に委ねる。
 */
export function createWin32Descriptor(now: number): Win32RuntimeDescriptor {
  return {
    id: 'host',
    kind: 'win32',
    state: 'running',
    isDefault: false,
    capabilities: fixedCapabilities(now),
    detectedAt: now
  }
}
