import { autoModeStatus, isAutoModeAllowed } from '@domain/runtime/capabilities'
import type { RuntimeDescriptor } from '@domain/runtime/descriptor'
import type { CapabilitiesDTO, RuntimeDescriptorDTO } from '@domain/runtime/dto'
import { hostPathOps, runtimePathOps } from '@domain/runtime/path-api'
import { pathParts, type HostPath, type RuntimePath } from '@domain/runtime/path-types'
import { originDisplay, originPath } from '@domain/session/cwd-origin'
import { PATH_DISPLAY_MAX_BYTES, TEXT_MAX_BYTES, normalizeText } from '@domain/session/normalize'
import type { EnumerationOutcomeDTO, SessionGroupDTO, SessionSummaryDTO } from '@domain/session/dto'
import type { SessionGroup } from '@domain/session/group'
import type { Boundary } from '@domain/workspace/dto'
import { sessionRowKey, type SessionSummary } from '@domain/session/summary'
import type { EnumerationOutcome } from '@domain/session/target'

/**
 * `domain` の値を IPC 境界を渡る形へ写す (`app` レイヤ)。
 *
 * **生の `autoModeSafe` を渡さない** — `unknown` は JavaScript で truthy であり真偽判定が誤る。
 * ゲート判定用の `autoModeAllowed` と表示用の `autoModeStatus` を別フィールドで渡す。
 *
 * **`PathMapping` の中身を渡さない** — `hasPathMapping` の真偽だけを渡す。
 * 変換は main 側の `domain` 純粋関数で行う。
 */

function toCapabilitiesDTO(descriptor: RuntimeDescriptor): CapabilitiesDTO {
  const c = descriptor.capabilities
  return {
    probeState: c.probeState,
    // 閉じた参照キー。renderer が FR-047 に従って訳出する。
    // **ここから `autoModeSafe` 相当を再導出してはならない** (不変条件)。
    sandboxKind: c.sandbox,
    seccompStatus: c.seccompFilter,
    missingDependencies: c.missingDependencies.map((d) => ({
      name: d.name,
      docAnchor: d.docAnchor
    })),
    probedAt: c.probedAt,
    autoModeAllowed: isAutoModeAllowed(c),
    autoModeStatus: autoModeStatus(c)
  }
}

export function toRuntimeDescriptorDTO(descriptor: RuntimeDescriptor): RuntimeDescriptorDTO {
  return {
    id: descriptor.id,
    kind: descriptor.kind,
    distroName: descriptor.kind === 'wsl' ? descriptor.distroName : null,
    wslVersion: descriptor.kind === 'wsl' ? descriptor.wslVersion : null,
    state: descriptor.state,
    isDefault: descriptor.isDefault,
    capabilities: toCapabilitiesDTO(descriptor),
    hasPathMapping: descriptor.kind === 'wsl' ? descriptor.pathMapping !== null : false,
    detectedAt: descriptor.detectedAt
  }
}

/* ── セッション列挙 (R-2 / BE-026) ─────────────────────────────── */

/**
 * 由来候補の表示名を境界で整える (pr-gate Round 4 / 不変条件 4 / FR-049)。
 *
 * **関門を境界側に置く。** `EnumerationTarget.label` は `domain` の型であり、
 * 「正規化済みである」という保証を型が持てない。`target-finder` は関門を通すが、
 * **そこを通らずに `EnumerationTarget` を組み立てる経路が作れてしまう**
 * (実際、境界の性質テストを書いた最初の実行でこの穴が出た)。
 *
 * この値は 2 本の経路で境界を渡る — セッション行 (`targetLabel`) と
 * 所在の行 (`EnumerationOutcomeDTO.targetLabel`)。**どちらも本モジュールを通る**ので、
 * ここを関門にすれば経路が増えても漏れない。
 *
 * 正規化は冪等なので、`target-finder` が既に通した値に二度掛けても変わらない。
 * あちらは**一意性の判定に正規化後の値が要る**ため独自に呼んでいる (責務が違う)。
 */
function displayName(raw: string): string {
  return normalizeText(raw, TEXT_MAX_BYTES).value
}

/**
 * 作業ディレクトリの表示値を境界で整える (pr-gate Round 4 / A4-007)。
 *
 * **予算が `displayName` と違う。** こちらはパスなので `PATH_DISPLAY_MAX_BYTES`
 * を使う。`TEXT_MAX_BYTES` (512) で切ると長いパスの末尾が落ちる
 * — 表示値として意味を失うだけでなく、`disambiguate` の序数接尾辞のように
 * **一意性を担う末尾を落とす**形の欠陥に繋がる (PB4-013)。
 *
 * ## なぜ関門が要るのか
 *
 * この値は `build.ts` が `classifyCwd` の前に正規化した `cwdText` から
 * 導かれるので、通常の経路では制御文字を含まない。
 * だが `SessionGroup` / `SessionSummary` は `domain` の型であり、
 * **「正規化済みである」という保証を型が持たない** — `targetLabel` で
 * まったく同じ前提が崩れていた (不変条件 4)。
 *
 * 実際、グループ 4 variant を走査に加えた最初の実行で
 * `unregistered.cwdDisplay` がここを通っていないことが出た。
 * **2 本の経路 (セッション行とグループ) の両方が本モジュールを通る**ので、
 * ここを関門にすれば経路が増えても漏れない。
 */
function pathDisplay(raw: string | null): string | null {
  return raw === null ? null : normalizeText(raw, PATH_DISPLAY_MAX_BYTES).value
}

/**
 * `SessionSummary` を DTO へ写す。
 *
 * **表示用の生値を運ぶのは `cwdDisplay` の 1 種類だけである** (FR-042 / SC-011)。
 * `rawCwd` のような名前で UNC 形式を境界に出す穴を作らない。
 * `cwd` は所在が決まる出自のときだけ値を持ち、**名前空間を明示して運ぶ**
 * (brand は境界で退化するため)。
 */
export function toSessionSummaryDTO(
  session: SessionSummary,
  /**
   * この行の対応づけの越境 (pr-gate Round 1 / po H-001)。
   *
   * **既定を `null` にする。** 登録フォルダに対応づかない行 (未登録 / 保留 / 不明) は
   * 越境という概念を持たない。**推測で埋めない。**
   */
  boundary: Boundary | null = null
): SessionSummaryDTO {
  const path = originPath(session.origin)
  return {
    sessionId: session.sessionId,
    targetKey: session.targetKey,
    targetLabel: displayName(session.targetLabel),
    summary: session.summary,
    firstPrompt: session.firstPrompt,
    customTitle: session.customTitle,
    lastModified: session.lastModified,
    createdAt: session.createdAt,
    fileSize: session.fileSize,
    gitBranch: session.gitBranch,
    tag: session.tag,
    cwd: path === null ? null : pathParts(path),
    cwdDisplay: pathDisplay(originDisplay(session.origin)),
    originKind: session.origin.kind,
    programmatic: session.source.programmatic,
    worktree: session.source.worktree,
    boundary,
    normalized: {
      truncated: session.normalized.truncated,
      controlCharsRemoved: session.normalized.controlCharsRemoved
    }
  }
}

/**
 * 登録するときの表示名の既定値 (FE-051)。
 *
 * **組み立てはパス API に委ねる。** 名前空間ごとに意味論が違うため、
 * 素の文字列操作で末尾を取ると片方で誤る (`C:\` と `/` の扱い)。
 * 末尾が取れない値 (ドライブルート等) では**パス値そのもの**を既定値にする —
 * 空文字を返すと登録側の検証で弾かれ、利用者は理由を得られない。
 */
function suggestedDisplayName(path: HostPath | RuntimePath): string {
  const base =
    path.namespace === 'host' ? hostPathOps.basename(path) : runtimePathOps.basename(path)
  return base.length > 0 ? base : path.value
}

/** グループを DTO へ写す。**4 種を 2 種に潰さない** (FR-022 / FR-025 / FR-028)。 */
export function toSessionGroupDTO(group: SessionGroup): SessionGroupDTO {
  /*
   * **登録フォルダ以外は越境を持たない** (pr-gate Round 1 / po H-001)。
   * 越境は「登録フォルダとセッションの組み合わせ」の性質であり、
   * 対応づかない行に付ける値が無い。**推測で埋めない。**
   */
  const sessions = group.sessions.map((session) => toSessionSummaryDTO(session))

  switch (group.kind) {
    case 'folder':
      return {
        kind: 'folder',
        folderId: group.folderId,
        boundary: group.boundary,
        /*
         * **行ごとの越境を載せる** (pr-gate Round 1 / po H-001)。
         * グループ単位の OR は見出し用に残すが、行の判断はこちらを使う。
         */
        sessions: group.sessions.map((session) =>
          toSessionSummaryDTO(session, group.boundaryOf.get(sessionRowKey(session)) ?? null)
        )
      }
    case 'pending':
      return {
        kind: 'pending',
        /* 登録フォルダに対応づかない行は越境を持たない。 */
        location: group.location,
        reasonKey: group.reasonKey,
        sessions
      }
    case 'unregistered':
      return {
        kind: 'unregistered',
        cwdKey: group.cwdKey,
        cwd: group.cwd === null ? null : pathParts(group.cwd),
        cwdDisplay: pathDisplay(group.cwdDisplay),
        /*
         * **到達しないと分かったうえで安全側を書いている** (pr-gate Round 4 / PO4-003)。
         *
         * `suggestedDisplayName` は branded なパス値の末尾成分であり、
         * `makeHostPath` / `makeRuntimePath` が制御文字を `forbidden-character` で
         * 拒むので、ここに制御文字が来る入力は**作れない**。
         * 変異 (この関門を外す) が発火しないのはテストが弱いからではなく、
         * この分岐に入る入力が存在しないためである。
         *
         * それでも通すのは、**これが `cwdDisplay` に次ぐ 2 つ目の表示値**であり
         * (SC-011 の許可リストが固定している)、パス検証が緩んだときに
         * 素通しにしないためである。正規化は冪等なので費用は無い。
         */
        suggestedDisplayName:
          group.cwd === null ? null : displayName(suggestedDisplayName(group.cwd)),
        location: group.location,
        sessions
      }
    case 'unknown':
      return { kind: 'unknown', reasonKey: group.reasonKey, sessions }
  }
}

/**
 * 所在ごとの成否を DTO へ写す。
 *
 * **config ディレクトリの実体パスを渡さない** (FR-042)。
 * 不透明な `targetKey` と表示用の `targetLabel` だけを渡す —
 * `TargetOutcome.configDir` は**意図的に捨てている**。
 */
export function toEnumerationOutcomeDTOs(
  outcome: EnumerationOutcome
): readonly EnumerationOutcomeDTO[] {
  return outcome.outcomes.map((target) => ({
    location: target.location,
    targetKey: target.key,
    targetLabel: displayName(target.label),
    status: target.status,
    reasonKey: target.reasonKey,
    count: target.count,
    truncated: target.truncated,
    fetchedAt: outcome.fetchedAt
  }))
}
