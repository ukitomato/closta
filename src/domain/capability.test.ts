import { describe, expect, it } from 'vitest'

import { IPC_CHANNELS } from './capability'

/**
 * IPC のチャネルの集合を固定する (O-3 BE-043 / 012 spec SC-006)。
 *
 * O-3 で足すチャネルは起動の利用記録の読み出し (`getLaunchUsage`) の 1 つだけである。チャネルを足す・消す・改名する
 * feature は、この表を同じ PR で直す (境界を黙って広げない)。
 */

const EXPECTED_CHANNELS = {
  listRuntimes: 'closta:listRuntimes',
  refreshRuntimes: 'closta:refreshRuntimes',
  probeRuntime: 'closta:probeRuntime',
  // X-8: Win32 の claude.exe の場所の指定・解除の 2 つ (AD-058)。
  pickWin32ClaudePath: 'closta:pickWin32ClaudePath',
  clearWin32ClaudePath: 'closta:clearWin32ClaudePath',
  listFolders: 'closta:listFolders',
  beginBrowse: 'closta:beginBrowse',
  browseDirectory: 'closta:browseDirectory',
  pickHostFolder: 'closta:pickHostFolder',
  registerFolder: 'closta:registerFolder',
  unregisterFolder: 'closta:unregisterFolder',
  resolveFolderRuntime: 'closta:resolveFolderRuntime',
  listSessions: 'closta:listSessions',
  refreshSessions: 'closta:refreshSessions',
  fetchMoreSessions: 'closta:fetchMoreSessions',
  getTranscript: 'closta:getTranscript',
  transcriptPort: 'closta:transcriptPort',
  launchSession: 'closta:launchSession',
  // X-9: 再開の 4 つ (AD-059。resolvePastResume / resumeSession / getResumedTranscript / sessionResumable)。
  resolvePastResume: 'closta:resolvePastResume',
  resumeSession: 'closta:resumeSession',
  getResumedTranscript: 'closta:getResumedTranscript',
  sendPrompt: 'closta:sendPrompt',
  respondPermission: 'closta:respondPermission',
  // O-10: Elicitation の応答 (URL を開くチャネルは足さない。AD-053 Decision 5)。
  respondElicitation: 'closta:respondElicitation',
  interruptSession: 'closta:interruptSession',
  endSession: 'closta:endSession',
  killSession: 'closta:killSession',
  // 023: 実行中の設定の変更 (AD-062)。
  setSessionPermissionMode: 'closta:setSessionPermissionMode',
  setSessionModel: 'closta:setSessionModel',
  // 025: 既定の Provider のモデルの一覧 (AD-065)。
  listSessionModels: 'closta:listSessionModels',
  renameSession: 'closta:renameSession',
  sessionPort: 'closta:sessionPort',
  sessionStatus: 'closta:sessionStatus',
  sessionResumable: 'closta:sessionResumable',
  listProviders: 'closta:listProviders',
  detectProviders: 'closta:detectProviders',
  registerProvider: 'closta:registerProvider',
  updateProvider: 'closta:updateProvider',
  removeProvider: 'closta:removeProvider',
  listReachableProviders: 'closta:listReachableProviders',
  providerLoadIssues: 'closta:providerLoadIssues',
  listPresets: 'closta:listPresets',
  savePreset: 'closta:savePreset',
  removePreset: 'closta:removePreset',
  // O-3: 本 feature で足した唯一のチャネル。
  getLaunchUsage: 'closta:getLaunchUsage',
  runtimesChanged: 'closta:runtimesChanged',
  foldersChanged: 'closta:foldersChanged',
  sessionsChanged: 'closta:sessionsChanged'
}

describe('IPC_CHANNELS (SC-006)', () => {
  it('チャネルの集合 (名前と値) が固定の表と一致する', () => {
    expect(IPC_CHANNELS).toEqual(EXPECTED_CHANNELS)
  })

  it('値は重複せず、すべて closta: の名前空間にある', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
    for (const value of values) expect(value.startsWith('closta:')).toBe(true)
  })
})
