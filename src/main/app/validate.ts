import type { WebFrameMain } from 'electron'

import { isValidDistroName, wslNamespace, type NamespaceId } from '@domain/runtime/namespace'
import {
  hasControlCharacter,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PATH_VALUE_LENGTH,
  MAX_SESSION_OFFSET
} from '@domain/validation'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { PathDTO } from '@domain/runtime/dto'
import { isValidSegment } from '@domain/runtime/path-api'
import { isNamespaceConsistent, type Location } from '@domain/workspace/folder'
import type { BrowseTargetDTO, LocationDTO } from '@domain/workspace/dto'

import { allowedOrigins } from './origins'

/**
 * 未信頼入力の検証 (contracts/ipc-capability.md / AD-023 のセキュリティ要件 5)。
 *
 * **送信元とペイロードの双方を検証する。** 片方だけでは要件を満たさない。
 *
 * 本ファイルの各関数は SC-018 が「検証表の**各行**について不正入力が拒否されること」を
 * 要求する対象である。3 つだけ列挙する形にしない — 列挙すると同じ構造の残りが拘束を外れる。
 */

/*
 * **述語と上限は `domain` の 1 箇所から取る。**
 *
 * 以前はここと `infra/settings/folder-record.ts` に同一実装があり、
 * 上限も各 2 箇所に散っていた。片方だけ変えると
 * **登録はできるが復元されないフォルダ**が生まれ、SC-013 が静かに崩れる。
 * (この形の `MAX_DIR_ENTRIES` は参照 0 件で死んでもいた。)
 */
export {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PATH_VALUE_LENGTH,
  MAX_SESSION_OFFSET
} from '@domain/validation'

/**
 * **送信元 (全メソッド共通)。**
 *
 * `event.senderFrame` が登録済み配信元 origin の main frame であること。
 * 不一致は応答せず破棄する。
 *
 * R-1 のウィンドウ構成では frame は 1 つだが、これを書かないと X-1 以降が
 * この土台に乗る。**環境で無効化する分岐を作らない** — 許可 origin の集合に
 * 開発ビルドの配信元を含める形で満たす (`origins.ts`)。
 */
export function isTrustedSender(frame: WebFrameMain | null): boolean {
  if (frame === null) return false
  // 親を持つ frame (iframe) は拒否する。単一 capability は main frame だけに公開する。
  if (frame.parent !== null) return false
  return allowedOrigins().includes(frame.origin)
}

/**
 * **すべてのパス値 (`PathDTO.value`)。**
 *
 * NUL と制御文字を含まないこと。**ランタイム名前空間の値はセパレータとして `/` のみを使い、
 * バックスラッシュを成分に含まないこと。** 長さ上限を超えないこと。
 *
 * POSIX 意味論ではバックスラッシュは通常の文字であり `.` / `..` の解決規則が発火しない。
 * 含んだまま UNC 形式へ変換すると値が字面で示す位置とは別の位置に解決される。
 */
export function isValidPathDTO(path: unknown): path is PathDTO {
  if (typeof path !== 'object' || path === null) return false
  const p = path as Record<string, unknown>
  if (typeof p.namespace !== 'string' || typeof p.value !== 'string') return false
  if (p.value.length === 0 || p.value.length > MAX_PATH_VALUE_LENGTH) return false
  if (hasControlCharacter(p.value)) return false

  if (p.namespace === 'host') return true
  if (p.namespace.startsWith('wsl:')) {
    // ランタイム名前空間の値はバックスラッシュを含まない。
    if (p.value.includes('\\')) return false
    if (!p.value.startsWith('/')) return false
    const distro = p.namespace.slice(4)
    return isValidDistroName(distro)
  }
  // `unc:` は `infra/fs` の内側に閉じる。境界を渡ってはならない。
  return false
}

/** **`location.distroName` (全経路)。** 列挙経路だけに置くと永続化ファイル由来の値が迂回する。 */
export function isValidLocationDTO(location: unknown): location is LocationDTO {
  if (typeof location !== 'object' || location === null) return false
  const l = location as Record<string, unknown>
  if (l.kind === 'windows') return true
  if (l.kind === 'wsl') {
    return typeof l.distroName === 'string' && isValidDistroName(l.distroName)
  }
  return false
}

export function toLocation(dto: LocationDTO): Location {
  return dto.kind === 'windows' ? { kind: 'windows' } : { kind: 'wsl', distroName: dto.distroName }
}

/** **`runtimeId`。** 既知の descriptor の識別子に完全一致すること。 */
export function findRuntime(
  runtimes: readonly RuntimeDescriptor[],
  runtimeId: unknown
): RuntimeDescriptor | null {
  if (typeof runtimeId !== 'string') return null
  return runtimes.find((r) => r.id === runtimeId) ?? null
}

/**
 * **`location` (`beginBrowse`)。**
 *
 * `kind === 'wsl'` のとき検出済み descriptor に完全一致すること。
 * **`kind === 'windows'` は常に拒否する。**
 *
 * 拒否の理由は**経路の一本化**である — ホスト側のフォルダ選択はネイティブダイアログに
 * 統一し、ホスト用のブラウズ実装を持たない。**ホストファイルシステムへの到達を
 * 塞ぐものではない** (所在 `wsl:<D>` のブラウズは Windows マウント配下を辿れ、
 * それは US-3 が越境として明示的に認める経路である)。
 */
export type BeginBrowseCheck =
  | { readonly ok: true; readonly namespace: NamespaceId }
  | { readonly ok: false; readonly reason: 'unsupported-location' | 'unknown-location' }

export function checkBeginBrowseLocation(
  runtimes: readonly RuntimeDescriptor[],
  location: unknown
): BeginBrowseCheck {
  if (!isValidLocationDTO(location)) return { ok: false, reason: 'unknown-location' }
  if (location.kind === 'windows') return { ok: false, reason: 'unsupported-location' }

  const namespace = wslNamespace(location.distroName)
  if (!runtimes.some((r) => r.id === namespace)) return { ok: false, reason: 'unknown-location' }
  return { ok: true, namespace }
}

/**
 * **`target` (`browseDirectory`)。**
 *
 * `of.namespace` が**トークンの名前空間識別子と完全一致**すること —
 * ディストロ名だけでなく**種別まで** (`unc:<D>` を `wsl:<D>` として受け付けない)。
 *
 * `name` は `/` とバックスラッシュ・NUL・制御文字を含まず、`.` / `..` **そのもの**でなく、
 * 長さ上限内であること (`.git` のような先頭ドットは許す)。
 */
export function isValidBrowseTarget(
  target: unknown,
  sessionNamespace: NamespaceId
): target is BrowseTargetDTO {
  if (typeof target !== 'object' || target === null) return false
  const t = target as Record<string, unknown>

  if (t.kind === 'root') return true

  if (t.kind === 'current' || t.kind === 'parent') {
    if (!isValidPathDTO(t.of)) return false
    return t.of.namespace === sessionNamespace
  }

  if (t.kind === 'child') {
    if (!isValidPathDTO(t.of)) return false
    if (t.of.namespace !== sessionNamespace) return false
    return typeof t.name === 'string' && isValidSegment(t.name)
  }

  return false
}

/** **`displayName`。** 長さ上限内であり制御文字を含まないこと。 */
export function isValidDisplayName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= MAX_DISPLAY_NAME_LENGTH &&
    !hasControlCharacter(name)
  )
}

/** **`folderId`。** 既知の登録エントリに一致すること。 */
export function isKnownFolderId(ids: readonly string[], folderId: unknown): folderId is string {
  return typeof folderId === 'string' && ids.includes(folderId)
}

/**
 * **`registerFolder(draft)`。**
 *
 * 所在 `windows` の `path` は **renderer の主張をそのまま受理する** (`## Assumptions`)。
 * ピッカー由来であることは要求しない。到達可能性の実在確認を登録済みエントリに限ることで、
 * 任意パスの存在を問い合わせる経路を作らない。
 *
 * `kind === 'wsl'` の `location` は検出済み descriptor に一致すること —
 * 存在しない所在で任意個のエントリを作れないようにする。
 */
export type DraftCheck =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: 'invalid-path' | 'namespace-mismatch' | 'unknown-location'
    }

export function checkFolderDraft(
  runtimes: readonly RuntimeDescriptor[],
  draft: unknown
): DraftCheck {
  if (typeof draft !== 'object' || draft === null) return { ok: false, reason: 'invalid-path' }
  const d = draft as Record<string, unknown>

  if (!isValidLocationDTO(d.location)) return { ok: false, reason: 'unknown-location' }
  if (!isValidPathDTO(d.path)) return { ok: false, reason: 'invalid-path' }
  if (!isValidDisplayName(d.displayName)) return { ok: false, reason: 'invalid-path' }

  if (d.location.kind === 'wsl') {
    const namespace = wslNamespace(d.location.distroName)
    if (!runtimes.some((r) => r.id === namespace)) return { ok: false, reason: 'unknown-location' }
  }

  // **`path` と `location`。** `domain` の `isNamespaceConsistent()` を通ること
  // (ディストロ名まで一致)。**同じ関数を永続化側も呼ぶ。**
  if (!isNamespaceConsistent(toLocation(d.location), d.path)) {
    return { ok: false, reason: 'namespace-mismatch' }
  }

  return { ok: true }
}

/* ── セッション一覧 (R-2 / BE-028) ─────────────────────────────── */

/**
 * **`fetchMoreSessions(targetKey, offset)`。**
 *
 * `targetKey` は main が発行した**不透明な値**である。
 * **既知の集合との完全一致でのみ照合し、パスとして解釈しない** (data-model §1)。
 * R-1 の `isKnownFolderId` と同じ扱いにしてある — 判定を 2 通り持たない。
 */
export function isKnownTargetKey(keys: readonly string[], targetKey: unknown): targetKey is string {
  return typeof targetKey === 'string' && keys.includes(targetKey)
}

/**
 * `offset` の検査。**非負の安全な整数であり、実名で定めた上限内**であること
 * (contracts/ipc-session-list.md の検証表)。
 *
 * **SDK に渡す前に検査する。** 上限が無いと、renderer から巨大な値を渡して
 * SDK 側の走査を無駄に走らせられる。
 */
export function isValidSessionOffset(offset: unknown): offset is number {
  return typeof offset === 'number' && Number.isSafeInteger(offset) && offset >= 0
    ? offset <= MAX_SESSION_OFFSET
    : false
}

/* ── セッション起動 + 制御 (X-1 / contracts C-1) ─────────────────── */

/**
 * **`respondPermission` の `outcome`。** `allow` / `deny` に完全一致すること。
 *
 * **`as` キャストで受けない** — 明示述語で enum を検証する (H-04 / SC-004 / SC-007)。
 * データ経路 (port) からは発行できず、この control-plane invoke だけが決定を運ぶ。
 */
export function isPermissionOutcome(value: unknown): value is 'allow' | 'deny' {
  return value === 'allow' || value === 'deny'
}

/**
 * **`respondPermission` の `scope`。** `once` / `capability` に完全一致すること。
 *
 * enum 形状の検証は境界のここで済ませる (`as` を使わせない)。**`once` 要求に `capability` 決定を
 * 受理しない** (H-04) の scope 上限強制は、要求 scope を保持する agents が `boundDecisionScope`
 * (`@domain/session/agent-session`) で行う — main は本文経路 (port) を持たず要求 scope を知らないため。
 */
export function isPermissionScope(value: unknown): value is 'once' | 'capability' {
  return value === 'once' || value === 'capability'
}
