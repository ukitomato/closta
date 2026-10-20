import type { RuntimeDescriptorDTO } from '@domain/runtime/dto'
import type { Win32ClaudeStatus } from '@domain/runtime/descriptor'
import type { RuntimeFact } from '@domain/session/launch-resolution'

import { runtimeTitle, WIN32_CLAUDE_STATUS_SHORT_LABELS } from '@/features/runtime-list/labels'

/**
 * 起動ダイアログのランタイムの選択肢と facts の組み立て (X-8 / data-model §10.1)。純関数。
 *
 * 先頭に `Win32Runtime` (表示名「Windows (ホスト)」)、続けて今の WSL の並び。
 * `claudeStatus !== 'found'` の `Win32Runtime` は無効にして短いラベルを添える (facts には入れない)。
 */

export interface LaunchRuntimeOption {
  readonly id: string
  readonly label: string
  readonly disabled: boolean
}

const win32StatusOf = (r: RuntimeDescriptorDTO): Win32ClaudeStatus => r.claudeStatus ?? 'not-found'

/** 起動の対象になりうるランタイム (Win32 が先頭、続けて WSL の元の並び)。 */
export function orderLaunchRuntimes(
  runtimes: readonly RuntimeDescriptorDTO[]
): readonly RuntimeDescriptorDTO[] {
  return [
    ...runtimes.filter((r) => r.kind === 'win32'),
    ...runtimes.filter((r) => r.kind === 'wsl')
  ]
}

export function buildLaunchRuntimeOptions(
  runtimes: readonly RuntimeDescriptorDTO[]
): readonly LaunchRuntimeOption[] {
  return orderLaunchRuntimes(runtimes).map((r) => {
    if (r.kind === 'win32') {
      const status = win32StatusOf(r)
      return status === 'found'
        ? { id: r.id, label: runtimeTitle('win32', null), disabled: false }
        : {
            id: r.id,
            label: `${runtimeTitle('win32', null)} (${WIN32_CLAUDE_STATUS_SHORT_LABELS[status]})`,
            disabled: true
          }
    }
    return {
      id: r.id,
      label: `${r.distroName ?? r.id}${r.state === 'running' ? '' : '（停止中）'}`,
      disabled: false
    }
  })
}

/**
 * `resolveLaunchAxes` に渡すランタイムの facts。
 * - WSL: distro 名が分からないものは入れない (選んでいれば `runtime-missing`)
 * - Win32: `found` のときだけ `{ id, distroName: null, running: true }`
 */
export function buildLaunchRuntimeFacts(
  runtimes: readonly RuntimeDescriptorDTO[]
): readonly RuntimeFact[] {
  return orderLaunchRuntimes(runtimes).flatMap((r): RuntimeFact[] => {
    if (r.kind === 'win32') {
      return win32StatusOf(r) === 'found' ? [{ id: r.id, distroName: null, running: true }] : []
    }
    return r.distroName === null
      ? []
      : [{ id: r.id, distroName: r.distroName, running: r.state === 'running' }]
  })
}

/** 起動できない状態の `Win32Runtime` の状態 (無ければ null)。選択欄の下の案内を出す条件。 */
export function unusableWin32Status(
  runtimes: readonly RuntimeDescriptorDTO[]
): Exclude<Win32ClaudeStatus, 'found'> | null {
  const win32 = runtimes.find((r) => r.kind === 'win32')
  if (win32 === undefined) return null
  const status = win32StatusOf(win32)
  return status === 'found' ? null : status
}
