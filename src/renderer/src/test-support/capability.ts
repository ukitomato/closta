import { vi } from 'vitest'

import { CAPABILITY_KEY, type ClostaCapability } from '@domain/capability'

/**
 * renderer 単体テスト用の preload スタブ (SH-016 / FE-032)。
 *
 * **`src/renderer` の内側に置く。** `tests/` に置いて `src` から import すると
 * `src → tests` の依存になり、dependency-cruiser の `not-to-test` と
 * `boundaries/no-unknown-dependencies` の両方に掛かる。
 * テスト補助であってもレイヤの規則は同じである。
 *
 * 既定はすべて「呼ばれたら reject」。**テストが明示的に用意した振る舞いだけを返す** —
 * 既定で空配列などを返すと、配線し忘れと「空の結果」が区別できなくなる。
 */

/**
 * 未スタブのメソッド。**同期 throw ではなく reject を返す。**
 * capability の契約は「すべて非同期」であり (FR-039)、同期に投げると
 * 本番と違う失敗の仕方になってテストが本番の挙動を写さなくなる。
 */
function notStubbed(method: string): () => Promise<never> {
  return () =>
    Promise.reject(
      new Error(`${method} はスタブされていません。テスト側で installCapability に渡すこと`)
    )
}

/** 何も返さない購読。テストが解除を検証できるよう関数を返す。 */
function noSubscription(): () => void {
  return () => {}
}

/**
 * 全メソッドが「未スタブ」の capability。テストは必要な分だけ上書きする。
 *
 * **型変換 (`as`) を使わない。** 変換すると `ClostaCapability` にメソッドが増えたときに
 * スタブが追随しなくても型検査が通ってしまう。
 */
export function stubCapability(overrides: Partial<ClostaCapability> = {}): ClostaCapability {
  const base: ClostaCapability = {
    listRuntimes: notStubbed('listRuntimes'),
    refreshRuntimes: notStubbed('refreshRuntimes'),
    pickWin32ClaudePath: notStubbed('pickWin32ClaudePath'),
    clearWin32ClaudePath: notStubbed('clearWin32ClaudePath'),
    probeRuntime: notStubbed('probeRuntime'),
    listFolders: notStubbed('listFolders'),
    beginBrowse: notStubbed('beginBrowse'),
    browseDirectory: notStubbed('browseDirectory'),
    pickHostFolder: notStubbed('pickHostFolder'),
    registerFolder: notStubbed('registerFolder'),
    unregisterFolder: notStubbed('unregisterFolder'),
    resolveFolderRuntime: notStubbed('resolveFolderRuntime'),
    listSessions: notStubbed('listSessions'),
    refreshSessions: notStubbed('refreshSessions'),
    fetchMoreSessions: notStubbed('fetchMoreSessions'),
    getTranscript: notStubbed('getTranscript'),
    launchSession: notStubbed('launchSession'),
    resolvePastResume: notStubbed('resolvePastResume'),
    resumeSession: notStubbed('resumeSession'),
    getResumedTranscript: notStubbed('getResumedTranscript'),
    sendPrompt: notStubbed('sendPrompt'),
    respondPermission: notStubbed('respondPermission'),
    respondElicitation: notStubbed('respondElicitation'),
    interruptSession: notStubbed('interruptSession'),
    killSession: notStubbed('killSession'),
    setSessionPermissionMode: notStubbed('setSessionPermissionMode'),
    setSessionModel: notStubbed('setSessionModel'),
    renameSession: notStubbed('renameSession'),
    endSession: notStubbed('endSession'),
    listProviders: notStubbed('listProviders'),
    detectProviders: notStubbed('detectProviders'),
    registerProvider: notStubbed('registerProvider'),
    updateProvider: notStubbed('updateProvider'),
    removeProvider: notStubbed('removeProvider'),
    listReachableProviders: notStubbed('listReachableProviders'),
    providerLoadIssues: notStubbed('providerLoadIssues'),
    listPresets: notStubbed('listPresets'),
    savePreset: notStubbed('savePreset'),
    removePreset: notStubbed('removePreset'),
    getLaunchUsage: notStubbed('getLaunchUsage'),
    onRuntimesChanged: noSubscription,
    onFoldersChanged: noSubscription,
    onSessionsChanged: noSubscription,
    onSessionStatus: noSubscription,
    onSessionResumable: noSubscription
  }

  return { ...base, ...overrides }
}

/** `window.closta` を差し替える。テストの冒頭で呼ぶ。 */
export function installCapability(overrides: Partial<ClostaCapability> = {}): ClostaCapability {
  const capability = stubCapability(overrides)
  vi.stubGlobal(CAPABILITY_KEY, capability)
  return capability
}
