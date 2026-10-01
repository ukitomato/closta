import { hasControlCharacter, MAX_PATH_VALUE_LENGTH } from '@domain/validation'

/**
 * WSL へ転送する env キーの述語 (X-4 FR-013 / [AD-041](../../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) (e))。
 * **I/O を持たない。**
 *
 * env の denylist は 2 つに分かれ、役割を分担する (AD-041 (e) 3)。
 * - `LAUNCH_ENV_DENY_PATTERN` (infra/runtime): passthrough (curated base と extraEnv) の**資格情報**パターン。
 * - **転送禁止キー** (ここ): 実行の乗っ取り・transport の制御キー・導出が制御するキー。
 *
 * **transport 固有のキー (`SystemRoot` / `windir` / `TEMP` / `TMP` / `WSL_UTF8` / `WSLENV`) は複製しない** —
 * infra (`LAUNCH_ENV_ALLOWLIST` ほか) から `makeForbiddenForwardKey` に注入する。X-3 が資格情報 denylist を
 * `isDeniedEnvKey` で注入したのと同じ構え (domain に transport の名前を置かない。AD-003)。
 * 注入点は composition-root の 1 箇所で、IPC (validate) / provider-record / provider-service はそこから受け取る
 * (infra/runtime を直接 import しない。pr-gate R1 platform-boundary M-302)。
 * - **登録時の検証** (IPC と provider-record) は Provider がどのランタイムからも起動されうるため、
 *   **transport の和集合**で行う (現状は WSL の 1 transport。I-1 で transport が増えたら和集合に広げる)。
 * - **起動時の `composeLaunchEnv`** は選んだ **transport ごと**に、その transport のキー集合で最終拒否する。
 *
 * **禁止は prefix 単位、許可は実名**で持つ — Claude Code に新しい env が増えても既定で通さない。
 * 照合は大文字小文字を区別しない (Windows の env は大文字小文字を区別せず、`SYSTEMROOT` と `SystemRoot` は同じ変数)。
 */

/** env 値の長さ上限 (X-3 の extraEnv と同じ)。 */
const MAX_ENV_VALUE_LENGTH = MAX_PATH_VALUE_LENGTH

/**
 * extraEnv のキー数上限。キー名 (128) と値 (`MAX_ENV_VALUE_LENGTH`) の長さ上限と合わせて、
 * spawn env の**総量に上界を置く** (CWE-770 / pr-gate R1 security L-003、前提の訂正は R2)。
 */
export const MAX_EXTRA_ENV_KEYS = 32

/** 転送キーの名前規則。違反は捨てずに起動拒否 (`invalid-config`) にする。 */
const FORWARD_KEY_NAME = /^[A-Z_][A-Z0-9_]*$/

export function isValidForwardKeyName(key: unknown): key is string {
  return (
    typeof key === 'string' && key.length > 0 && key.length <= 128 && FORWARD_KEY_NAME.test(key)
  )
}

/** transport に依存しない固定の禁止キー (大文字で持ち、大文字化して照合する)。 */
const FIXED_FORBIDDEN_KEYS: readonly string[] = [
  'PATH',
  'HOME',
  'SHELL',
  'TMPDIR',
  'NODE_OPTIONS',
  'NODE_PATH',
  'BASH_ENV',
  'ENV',
  'PROMPT_COMMAND',
  'IFS',
  'PS4',
  // 承認済みコマンドの子プロセスで任意コードを走らせる / TLS 検証を外す (pr-gate R1 security M-001)。
  // `NODE_EXTRA_CA_CERTS` は信頼アンカーを足すだけで検証を外さず、企業 CA の唯一の経路なので禁止しない
  // (pr-gate R2 security L-102、利用者が決定)。検証を外す `NODE_TLS_REJECT_UNAUTHORIZED` は禁止する。
  'PAGER',
  'LESSOPEN',
  'LESSCLOSE',
  'EDITOR',
  'VISUAL',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  // 値がコマンド文字列・実行ファイルパス・ローダ設定として使われる残り (pr-gate R2 security L-101)。
  'MANPAGER',
  'SYSTEMD_PAGER',
  'BROWSER',
  'SSH_ASKPASS',
  'SSH_ASKPASS_REQUIRE',
  'SUDO_ASKPASS',
  'PERLLIB',
  'JAVA_TOOL_OPTIONS',
  '_JAVA_OPTIONS',
  // 導出が制御する (config-dir 分岐が RuntimePath だけを注入する。X-3 DERIVATION_CONTROLLED_KEYS を包含)。
  'CLAUDE_CONFIG_DIR'
]

/**
 * prefix 単位の禁止 (ローダ / Claude Code の実行系・権限系・方式固有キー / 言語ランタイムと git の実行乗っ取り)。
 * `GIT_` は `GIT_CONFIG_*` (core.fsmonitor 等) / `GIT_SSH_COMMAND` / `GIT_PAGER`、`PYTHON` は `PYTHONSTARTUP` /
 * `PYTHONPATH`、`PERL5` は `PERL5OPT` / `PERL5LIB`、`RUBY` は `RUBYOPT` / `RUBYLIB` (pr-gate R1 security M-001)。
 * `NPM_CONFIG_` は `NPM_CONFIG_SCRIPT_SHELL` など (npm は大文字小文字を区別せずに読む。pr-gate R2 security L-101)。
 *
 * **この denylist は既知の代表例を塞ぐもので、クラスを原理的には閉じない** (値をコマンドとして実行させる env は
 * ツールごとに増えうる)。extraEnv を名前の allowlist に切り替えることを X-7 で検討する (pr-gate R2 security L-101)。
 */
const FORBIDDEN_PREFIXES: readonly string[] = [
  'LD_',
  'CLAUDE_CODE_',
  'ANTHROPIC_',
  'GIT_',
  'PYTHON',
  'PERL5',
  'RUBY',
  'BUN_',
  'NPM_CONFIG_'
]

/** prefix 禁止の中で**実名で許す**もの (AD-041 (e): 送信先の変更は残存リスクとして受け入れる)。 */
const EXPLICIT_ALLOW: readonly string[] = ['ANTHROPIC_BASE_URL']

/**
 * 転送禁止キーの述語を作る。`transportKeys` は infra が持つ transport 固有のキー集合。
 *
 * extraEnv のキーに掛ける (env-passthrough の varNames は `PASSTHROUGH_VAR_ALLOWLIST` で別に縛る)。
 */
export function makeForbiddenForwardKey(
  transportKeys: readonly string[]
): (key: string) => boolean {
  const transport = new Set(transportKeys.map((k) => k.toUpperCase()))
  const fixed = new Set(FIXED_FORBIDDEN_KEYS)
  return (key: string): boolean => {
    const upper = key.toUpperCase()
    if (EXPLICIT_ALLOW.includes(upper)) return false
    if (transport.has(upper) || fixed.has(upper)) return true
    return FORBIDDEN_PREFIXES.some((p) => upper.startsWith(p))
  }
}

/**
 * 認証系 env 変数名の**実名の正本** (X-3 H-10 / X-4 SH-005)。
 * 検出 (`infra/provider/detector.ts`) は親 env にこの名前が**在るかだけ**を見て env-passthrough 候補を出す (値は見ない)。
 * env-passthrough の varNames の allowlist はここから導出する (下の `PASSTHROUGH_VAR_ALLOWLIST`)。
 */
export const CREDENTIAL_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
  'AWS_PROFILE',
  'AWS_REGION',
  'CLAUDE_CODE_USE_BEDROCK'
] as const

type CredentialEnvName = (typeof CREDENTIAL_ENV_NAMES)[number]
export type PassthroughVarName = Exclude<CredentialEnvName, 'CLAUDE_CONFIG_DIR'>

/**
 * env-passthrough の varNames の**実名 allowlist** (AD-041 (e) 4)。`CREDENTIAL_ENV_NAMES` から導出する
 * (検出候補と登録の allowlist を 1 つの正本に揃える。片方だけ更新して非対称にしない)。
 *
 * **`CLAUDE_CONFIG_DIR` を含まない** — config dir は config-dir 方式が RuntimePath で注入する値であり、
 * 親 env の Windows 形式の値を転送すると既定 config dir を黙って掴む経路になる (US-4 AC2)。
 */
export const PASSTHROUGH_VAR_ALLOWLIST: readonly PassthroughVarName[] = CREDENTIAL_ENV_NAMES.filter(
  (name): name is PassthroughVarName => name !== 'CLAUDE_CONFIG_DIR'
)

export function isPassthroughVarName(value: unknown): value is PassthroughVarName {
  return (
    typeof value === 'string' && (PASSTHROUGH_VAR_ALLOWLIST as readonly string[]).includes(value)
  )
}

/**
 * 導出 (`deriveLaunchEnv`) の**方式固有の実名注入**が転送するキー (X-4 / AD-041 (e) 2)。
 * derive-env はこの型のキーだけを方式固有に注入し、`composeLaunchEnv` はこれと passthrough allowlist を
 * 転送禁止キーの拒否から外す (どちらも prefix 禁止 `ANTHROPIC_` / `CLAUDE_CODE_` や固定の `CLAUDE_CONFIG_DIR` に掛かる)。
 */
export const METHOD_SPECIFIC_FORWARD_KEYS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'AWS_PROFILE',
  'AWS_REGION',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CONFIG_DIR'
] as const satisfies readonly CredentialEnvName[] // 実名の正本 `CREDENTIAL_ENV_NAMES` の部分集合 (CONV L-008)

export type MethodSpecificForwardKey = (typeof METHOD_SPECIFIC_FORWARD_KEYS)[number]

/** 導出が正当に転送するキー (方式固有の実名 ∪ passthrough allowlist) か。実名の完全一致で見る。 */
export function isDerivationForwardKey(key: string): boolean {
  return (
    (METHOD_SPECIFIC_FORWARD_KEYS as readonly string[]).includes(key) || isPassthroughVarName(key)
  )
}

/**
 * 値が Windows パスの形か (`C:\` / `C:/` / `\\server`)。
 *
 * `/u` 転送はパス変換をしないため、Windows 形式の値は WSL 内で cwd 基準の相対パスに化ける
 * (design-gate R2 の `TMP` 実測)。値の意味をアプリは知らないので変換せず、起動を拒否する。
 */
export function isWindowsPathValue(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

/* ── 登録境界の述語 (IPC と provider-record で共有。write/read 対称) ─────── */

export interface ExtraEnvPredicates {
  /** 転送禁止キー (`makeForbiddenForwardKey(transportKeys)`)。 */
  readonly isForbiddenForwardKey: (key: string) => boolean
  /** 資格情報 denylist (`LAUNCH_ENV_DENY_PATTERN`)。登録時に拒否して「黙って消える」を作らない。 */
  readonly isDeniedEnvKey: (key: string) => boolean
}

/**
 * extraEnv を検証する (X-4 FR-013 / FR-014)。キーは名前規則・転送禁止キー・資格情報 denylist、
 * 値は長さ・制御文字・Windows パスの形を見る。**IPC と永続層が同じ述語を呼ぶ** (SEC-M-001)。
 */
export function isValidExtraEnv(
  value: unknown,
  preds: ExtraEnvPredicates
): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MAX_EXTRA_ENV_KEYS) return false
  for (const [k, v] of entries) {
    if (!isValidForwardKeyName(k)) return false
    if (preds.isForbiddenForwardKey(k) || preds.isDeniedEnvKey(k)) return false
    if (typeof v !== 'string' || v.length > MAX_ENV_VALUE_LENGTH) return false
    if (hasControlCharacter(v) || isWindowsPathValue(v)) return false
  }
  return true
}

/** env-passthrough の varNames: 実名 allowlist・重複なし。 */
export function isValidPassthroughVarNames(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false
  if (!value.every(isPassthroughVarName)) return false
  return new Set(value).size === value.length
}
