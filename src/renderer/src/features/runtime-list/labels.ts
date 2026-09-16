import type {
  AutoModeStatus,
  DependencyName,
  ProbeState,
  SandboxKind,
  SeccompFilterState
} from '@domain/runtime/capabilities'
import type { EnumerationIssueReason, RunState, WslAvailability } from '@domain/runtime/descriptor'

/**
 * 参照キーの訳出 (FR-047)。
 *
 * **内部識別子をそのまま提示しない。** DTO が閉じた参照キーを運び、
 * renderer がここで日本語にする。main 側で訳出済みのラベルを渡す形は採らない —
 * 隔離バッジ (I-2) がローカライズ済み文字列の比較でしか種別を分岐できなくなる。
 *
 * **`Record` で網羅する。** キーが増えたときに型エラーになり、訳し漏れが残らない。
 */

export const PROBE_STATE_LABELS: Record<ProbeState, string> = {
  idle: '未判定',
  probing: '判定中',
  done: '判定済み',
  failed: '判定失敗'
}

export const SANDBOX_LABELS: Record<SandboxKind, string> = {
  none: 'なし',
  bubblewrap: 'bubblewrap',
  unknown: '未判定'
}

export const SECCOMP_LABELS: Record<SeccompFilterState, string> = {
  present: 'あり',
  absent: 'なし',
  unknown: '未判定'
}

/**
 * 無人実行の可否。**3 状態を区別する** (FR-003)。
 * `autoModeAllowed` (真偽) を表示に使うと未判定が「不可」に潰れる。
 */
export const AUTO_MODE_LABELS: Record<AutoModeStatus, string> = {
  allowed: '可',
  unavailable: '不可',
  undetermined: '未判定'
}

export const RUN_STATE_LABELS: Record<RunState, string> = {
  running: '実行中',
  stopped: '停止中'
}

export const ENUMERATION_ISSUE_LABELS: Record<EnumerationIssueReason, string> = {
  'invalid-name-charset':
    'ディストロ名に使えない文字が含まれています (バックスラッシュ・スラッシュ・コロン・制御文字、先頭のハイフン)'
}

/**
 * WSL の利用可否の訳出 (SC-015)。
 *
 * **`available` にも文言を与える** — `Record` で網羅するため。
 * 画面側は `available` のとき描画しない。
 */
export const WSL_AVAILABILITY_LABELS: Record<WslAvailability, string> = {
  available: '',
  'not-installed':
    'このホストでは WSL が見つかりませんでした。Windows のランタイムだけを使えます。',
  'enumeration-failed':
    'WSL のディストロを列挙できませんでした。WSL の状態を確認してから再検出してください。'
}

/** 必須依存の表示名。パッケージ名として案内できる形にする。 */
export const DEPENDENCY_LABELS: Record<DependencyName, string> = {
  bwrap: 'bubblewrap',
  socat: 'socat'
}

/** 導入手順文書の位置。**アンカーは DTO が運ぶ** (FR-009 / FR-048)。 */
export const DEPENDENCY_DOC_PATH = 'docs/runtime/wsl-sandbox-dependencies.md'

/** 種別の表示名。`kind` をそのまま出さない。 */
export function runtimeTitle(kind: string, distroName: string | null): string {
  if (kind === 'win32') return 'Windows (ホスト)'
  if (distroName === null) return 'WSL'
  return `WSL: ${distroName}`
}
