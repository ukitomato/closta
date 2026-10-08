import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { SessionEvent } from '@domain/session/agent-session'
import type { PermissionModeKey } from '@domain/session/meter'

import { PERMISSION_MODE_NAMES } from '@/features/chat/labels'
import { PERMISSION_MODE_LABELS } from '@/features/session/labels'
import {
  A,
  B,
  registerAppShellHooks,
  selectPast,
  selectRunning,
  setup
} from '@/test-support/app-shell-harness'

import { OVERVIEW_LABELS, SHELL_LABELS } from './labels'

/**
 * O-4 FE-041 — 「概要」の現在の権限モード (014 spec FR-010 / US-4 AC1。data-model §4「権限モード」/ §5)。
 * 「起動時の権限モード」の行は起動時の値のまま、今のモードが起動時と違うときだけ、その下に「現在の権限モード」の行を足す。
 */

registerAppShellHooks()

const AXE_RULES = { rules: { 'color-contrast': { enabled: false } } }

const modeOf = (mode: PermissionModeKey): SessionEvent => ({
  kind: 'meter',
  meter: { type: 'permission-mode', mode }
})

async function openOverview(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: SHELL_LABELS.expandPanel }))
  return within(screen.getByRole('tabpanel')).getByTestId('overview')
}

/** 概要の見出し (`dt`) の並び。 */
const labelsOf = (overview: HTMLElement): string[] =>
  Array.from(overview.querySelectorAll('dt')).map((dt) => dt.textContent ?? '')

/** 見出し `label` の値 (`dd`)。 */
function ddOf(overview: HTMLElement, label: string): HTMLElement | null {
  const dt = Array.from(overview.querySelectorAll('dt')).find((el) => el.textContent === label)
  return (dt?.nextElementSibling as HTMLElement | null | undefined) ?? null
}

describe('「概要」の現在の権限モード (US-4 AC1 / FR-010)', () => {
  it('起動時と同じモードなら「現在の権限モード」の行を出さない', async () => {
    const h = await setup({ ids: [A], launchConfig: { permissionMode: 'plan' } })
    await selectRunning(0)
    h.emit(A, modeOf('plan'))
    const overview = await openOverview()
    expect(ddOf(overview, OVERVIEW_LABELS.permissionMode)).toHaveTextContent(
      PERMISSION_MODE_LABELS.plan
    )
    expect(labelsOf(overview)).not.toContain(OVERVIEW_LABELS.currentPermissionMode)
  })

  it('計量がまだ無いときも行を出さない', async () => {
    await setup({ ids: [A] })
    await selectRunning(0)
    const overview = await openOverview()
    expect(labelsOf(overview)).not.toContain(OVERVIEW_LABELS.currentPermissionMode)
  })

  it('変わったら起動時の行の下に今のモードの行が出て、起動時の行は起動時の値のまま', async () => {
    const h = await setup({ ids: [A], launchConfig: { permissionMode: 'plan' } })
    await selectRunning(0)
    const overview = await openOverview()
    h.emit(A, modeOf('default'))
    const labels = labelsOf(overview)
    const at = labels.indexOf(OVERVIEW_LABELS.permissionMode)
    expect(labels[at + 1]).toBe(OVERVIEW_LABELS.currentPermissionMode)
    expect(ddOf(overview, OVERVIEW_LABELS.permissionMode)).toHaveTextContent(
      PERMISSION_MODE_LABELS.plan
    )
    expect(ddOf(overview, OVERVIEW_LABELS.currentPermissionMode)).toHaveTextContent(
      PERMISSION_MODE_NAMES.default
    )

    // 安全 3 値の外 (知らない値を含む) も同じ表の名前で出す
    h.emit(A, modeOf('bypassPermissions'))
    expect(ddOf(overview, OVERVIEW_LABELS.currentPermissionMode)).toHaveTextContent(
      PERMISSION_MODE_NAMES.bypassPermissions
    )
    h.emit(A, modeOf('unknown'))
    expect(ddOf(overview, OVERVIEW_LABELS.currentPermissionMode)).toHaveTextContent(
      PERMISSION_MODE_NAMES.unknown
    )

    // 起動時のモードに戻ったら行を外す
    h.emit(A, modeOf('plan'))
    expect(labelsOf(overview)).not.toContain(OVERVIEW_LABELS.currentPermissionMode)
    // 起動の設定には書き戻さない
    expect(h.store.getState().sessions[A]?.config.permissionMode).toBe('plan')
  })

  it('値はセッションごと (別のセッションの変化を出さない)', async () => {
    const h = await setup({ ids: [A, B] })
    h.emit(B, modeOf('acceptEdits'))
    await selectRunning(0)
    const overview = await openOverview()
    expect(labelsOf(overview)).not.toContain(OVERVIEW_LABELS.currentPermissionMode)
    await selectRunning(1)
    const after = within(screen.getByRole('tabpanel')).getByTestId('overview')
    expect(ddOf(after, OVERVIEW_LABELS.currentPermissionMode)).toHaveTextContent(
      PERMISSION_MODE_NAMES.acceptEdits
    )
  })

  it('過去のセッションでは出さない', async () => {
    const h = await setup({ ids: [A] })
    h.emit(A, modeOf('acceptEdits'))
    await selectPast(0)
    const overview = await openOverview()
    expect(labelsOf(overview)).not.toContain(OVERVIEW_LABELS.currentPermissionMode)
    expect(overview).not.toHaveTextContent(PERMISSION_MODE_NAMES.acceptEdits)
  })

  it('vitest-axe: 現在の権限モードの行がある状態で違反 0', async () => {
    const h = await setup({ ids: [A] })
    await selectRunning(0)
    const overview = await openOverview()
    h.emit(A, modeOf('auto'))
    expect(ddOf(overview, OVERVIEW_LABELS.currentPermissionMode)).not.toBeNull()
    expect((await axe(screen.getByRole('tabpanel'), AXE_RULES)).violations).toEqual([])
  })
})
