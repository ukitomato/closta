/**
 * ランタイムが提供する能力 (data-model §3)。**表明するもの**である。
 *
 * 能力がないものを「ある」と表明してはならず、判定していないものを
 * 「ない」と表明してもならない (FR-003)。
 */

export type ProbeState = 'idle' | 'probing' | 'done' | 'failed'

/** 隔離機構の種別。`container` は I-1 で追加する。 */
export type SandboxKind = 'none' | 'bubblewrap' | 'unknown'

/** R-1 では常に `unknown` (FR-006。検出方法の確定は I-3)。 */
export type SeccompFilterState = 'present' | 'absent' | 'unknown'

export type Tristate = true | false | 'unknown'

/**
 * 必須依存の名前。**閉じた集合**であり `docAnchor` と 1 対 1 で対応する。
 * スクリプト出力が未知の名前を返した場合は判定失敗として扱う —
 * ランタイム内部の出力由来の文字列を UI へ直達させない。
 */
export const DEPENDENCY_NAMES = ['bwrap', 'socat'] as const
export type DependencyName = (typeof DEPENDENCY_NAMES)[number]

/** `docs/runtime/wsl-sandbox-dependencies.md` (FR-048) のアンカー。 */
export const DEPENDENCY_DOC_ANCHORS: Record<DependencyName, string> = {
  bwrap: 'bubblewrap',
  socat: 'socat'
}

export interface MissingDependency {
  readonly name: DependencyName
  /** 導入手順文書のアンカー。**コマンド文字列を持たない** (FR-009)。 */
  readonly docAnchor: string
}

export function isDependencyName(value: string): value is DependencyName {
  return (DEPENDENCY_NAMES as readonly string[]).includes(value)
}

export function missingDependency(name: DependencyName): MissingDependency {
  return { name, docAnchor: DEPENDENCY_DOC_ANCHORS[name] }
}

export interface Capabilities {
  readonly probeState: ProbeState
  readonly sandbox: SandboxKind
  readonly autoModeSafe: Tristate
  readonly seccompFilter: SeccompFilterState
  readonly missingDependencies: readonly MissingDependency[]
  /**
   * capabilities を**確定させた**時刻。
   * 実地判定を行わないランタイム (`Win32Runtime` / 実行中 WSL1) も確定時にこれを設定する。
   * 設定しないと §3 の表の `false` 行が導出式から到達できず、
   * AD-003 の Decision Outcome と `runtime` charter の KPI を満たせない。
   */
  readonly probedAt: number | null
}

/**
 * 安全とみなす sandbox 種別の **allowlist**。
 *
 * **denylist (`sandbox !== 'none'`) で書いてはならない** — `unknown` に対して真になり、
 * 判定に失敗したランタイムが「安全」と表明される。また値を追加するたびに
 * 判定が自動的に広がる。
 *
 * I-1 で `container` を追加する際は **endpoint の到達性が検証済みであること**を
 * 追加条件として要求する。種別の追記だけで安全判定を広げてはならない。
 * この定義はいずれ `isolation` domain に移る (AD-025)。
 */
const SAFE_SANDBOX_KINDS: readonly SandboxKind[] = ['bubblewrap']

/** 判定が完了し、時刻があり、種別が判明していること。 */
function isProbed(c: Pick<Capabilities, 'probeState' | 'probedAt' | 'sandbox'>): boolean {
  return c.probeState === 'done' && c.probedAt !== null && c.sandbox !== 'unknown'
}

/**
 * `autoModeSafe` を導出する (data-model §3)。
 *
 * 判定が完了していない・判定時刻が無い・種別が不明のいずれでも `unknown` を返す。
 * `false` は「判定したうえで安全でない」ことの表明であり、未判定と区別する (FR-003)。
 */
export function deriveAutoModeSafe(
  c: Pick<Capabilities, 'probeState' | 'probedAt' | 'sandbox'>
): Tristate {
  if (!isProbed(c)) return 'unknown'
  return SAFE_SANDBOX_KINDS.includes(c.sandbox)
}

/** capabilities の初期状態。再判定を開始するときは**ここへ戻してから** `probing` に遷移する。 */
export function initialCapabilities(): Capabilities {
  return {
    probeState: 'idle',
    sandbox: 'unknown',
    autoModeSafe: 'unknown',
    seccompFilter: 'unknown',
    missingDependencies: [],
    probedAt: null
  }
}

/**
 * 判定を開始する。**旧値を据え置かない** —
 * 初期状態に戻してから `probing` に遷移する (data-model §3 不変条件)。
 */
export function beginProbing(): Capabilities {
  return { ...initialCapabilities(), probeState: 'probing' }
}

/** 判定失敗。capabilities を未判定に戻す。 */
export function probeFailed(): Capabilities {
  return { ...initialCapabilities(), probeState: 'failed' }
}

/**
 * 実地判定を行わないランタイムの固定値 (`Win32Runtime` / 実行中 WSL1)。
 * **`probedAt` を設定する** — 設定しないと導出式が `unknown` を返す。
 */
export function fixedCapabilities(probedAt: number): Capabilities {
  const base = {
    probeState: 'done' as const,
    sandbox: 'none' as const,
    seccompFilter: 'unknown' as const,
    missingDependencies: [] as readonly MissingDependency[],
    probedAt
  }
  return { ...base, autoModeSafe: deriveAutoModeSafe(base) }
}

/** 実地判定の結果から capabilities を組み立てる。 */
export function probedCapabilities(input: {
  sandbox: SandboxKind
  missingDependencies: readonly MissingDependency[]
  probedAt: number
}): Capabilities {
  const base = {
    probeState: 'done' as const,
    sandbox: input.sandbox,
    seccompFilter: 'unknown' as const,
    missingDependencies: input.missingDependencies,
    probedAt: input.probedAt
  }
  return { ...base, autoModeSafe: deriveAutoModeSafe(base) }
}

/** 表示用の 3 状態。`autoModeAllowed` を表示に使うと未判定を「不可」に潰してしまう。 */
export type AutoModeStatus = 'allowed' | 'unavailable' | 'undetermined'

/**
 * 安全側の解釈 (FR-008)。
 *
 * **`probeState` / `autoModeSafe` / `sandbox` / `probedAt` を見る唯一の判定点である。**
 * 呼び出し側に生の値や再導出の素材を渡さない — `unknown` は JavaScript で truthy であり、
 * `sandbox` を渡せば denylist 再導出が書けてしまう。
 *
 * ゲートの入力にするのは I-3。R-1 の判定点は未確定値の安全側解釈であってゲートではない。
 */
export function isAutoModeAllowed(c: Capabilities): boolean {
  return c.autoModeSafe === true
}

/** 表示用の 3 状態を返す。未判定と「判定したうえで不可」を区別する (FR-003)。 */
export function autoModeStatus(c: Capabilities): AutoModeStatus {
  if (c.autoModeSafe === true) return 'allowed'
  if (c.autoModeSafe === false) return 'unavailable'
  return 'undetermined'
}
