import type { ClostaCapability } from '@domain/capability'

/**
 * renderer 側の型。preload が公開する**単一 capability** だけが見える。
 * 生の `ipcRenderer` も `electronAPI` も公開しない (FR-039)。
 */
declare global {
  interface Window {
    readonly closta: ClostaCapability
  }
}

export {}
