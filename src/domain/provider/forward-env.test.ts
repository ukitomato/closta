import { describe, expect, it } from 'vitest'

import {
  CREDENTIAL_ENV_NAMES,
  isDerivationForwardKey,
  isPassthroughVarName,
  isValidExtraEnv,
  isValidForwardKeyName,
  isWindowsPathValue,
  makeForbiddenForwardKey,
  MAX_EXTRA_ENV_KEYS,
  METHOD_SPECIFIC_FORWARD_KEYS,
  PASSTHROUGH_VAR_ALLOWLIST
} from './forward-env'

const isForbidden = makeForbiddenForwardKey([
  'SystemRoot',
  'windir',
  'TEMP',
  'TMP',
  'WSL_UTF8',
  'WSLENV'
])

describe('makeForbiddenForwardKey (転送禁止キーの pin。AD-041 (e) 3)', () => {
  it.each([
    // transport 固有 (注入) — 大文字小文字違いも同じ変数
    'SystemRoot',
    'SYSTEMROOT',
    'windir',
    'WINDIR',
    'TEMP',
    'Temp',
    'TMP',
    'WSL_UTF8',
    'WSLENV',
    // 固定
    'PATH',
    'Path',
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
    'CLAUDE_CONFIG_DIR',
    // prefix
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'CLAUDE_CODE_SHELL_PREFIX',
    'CLAUDE_CODE_SHELL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    // 実行の乗っ取り (pr-gate R1 security M-001)
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'GIT_SSH_COMMAND',
    'GIT_EXEC_PATH',
    'GIT_PAGER',
    'PYTHONSTARTUP',
    'PYTHONPATH',
    'PERL5OPT',
    'PERL5LIB',
    'RUBYOPT',
    'RUBYLIB',
    'BUN_OPTIONS',
    'PAGER',
    'LESSOPEN',
    'LESSCLOSE',
    'EDITOR',
    'VISUAL',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    // 残りのコマンド実行・ローダ系 (pr-gate R2 security L-101)
    'MANPAGER',
    'SYSTEMD_PAGER',
    'BROWSER',
    'SSH_ASKPASS',
    'SSH_ASKPASS_REQUIRE',
    'SUDO_ASKPASS',
    'PERLLIB',
    'JAVA_TOOL_OPTIONS',
    '_JAVA_OPTIONS',
    'NPM_CONFIG_SCRIPT_SHELL',
    'npm_config_script_shell'
  ])('%s は禁止', (key) => {
    expect(isForbidden(key)).toBe(true)
  })

  it.each(['ANTHROPIC_BASE_URL', 'MY_FLAG', 'HTTPS_PROXY', 'NO_PROXY'])('%s は許可', (key) => {
    expect(isForbidden(key)).toBe(false)
  })

  it('NODE_EXTRA_CA_CERTS は許可 (信頼アンカーを足すだけ。企業 CA の経路。pr-gate R2 security L-102)', () => {
    expect(isForbidden('NODE_EXTRA_CA_CERTS')).toBe(false)
    expect(isForbidden('NODE_TLS_REJECT_UNAUTHORIZED')).toBe(true)
  })

  it('M-001 で足した prefix / 実名は方式固有キーと passthrough allowlist に掛からない', () => {
    const added = makeForbiddenForwardKey([])
    const derivation = [...METHOD_SPECIFIC_FORWARD_KEYS, ...PASSTHROUGH_VAR_ALLOWLIST]
    const extraPrefixes = ['GIT_', 'PYTHON', 'PERL5', 'RUBY', 'BUN_', 'NPM_CONFIG_']
    const extraNames = [
      'PAGER',
      'LESSOPEN',
      'LESSCLOSE',
      'EDITOR',
      'VISUAL',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'MANPAGER',
      'SYSTEMD_PAGER',
      'BROWSER',
      'SSH_ASKPASS',
      'SSH_ASKPASS_REQUIRE',
      'SUDO_ASKPASS',
      'PERLLIB',
      'JAVA_TOOL_OPTIONS',
      '_JAVA_OPTIONS'
    ]
    for (const k of derivation) {
      expect(extraPrefixes.some((p) => k.startsWith(p))).toBe(false)
      expect(extraNames).not.toContain(k)
    }
    // AWS_* (passthrough allowlist) は転送禁止キーではない (資格情報 denylist は別勘定)。
    expect(added('AWS_PROFILE')).toBe(false)
    expect(added('AWS_REGION')).toBe(false)
  })

  it('transport キーは注入した集合で決まる (domain に複製しない)', () => {
    const noTransport = makeForbiddenForwardKey([])
    expect(noTransport('SystemRoot')).toBe(false)
    expect(noTransport('PATH')).toBe(true)
  })
})

describe('isValidForwardKeyName', () => {
  it.each(['A', 'MY_FLAG', '_X1'])('%s は有効', (k) => expect(isValidForwardKeyName(k)).toBe(true))
  it.each(['', 'lower', 'SystemRoot', '1ABC', 'A-B', 'A B'])('%s は無効', (k) =>
    expect(isValidForwardKeyName(k)).toBe(false)
  )
})

describe('PASSTHROUGH_VAR_ALLOWLIST (実名 allowlist。AD-041 (e) 4)', () => {
  it('集合を固定する (CLAUDE_CONFIG_DIR を含まない)', () => {
    expect([...PASSTHROUGH_VAR_ALLOWLIST].sort()).toEqual(
      [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL',
        'AWS_PROFILE',
        'AWS_REGION',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_USE_BEDROCK'
      ].sort()
    )
    expect(isPassthroughVarName('CLAUDE_CONFIG_DIR')).toBe(false)
    expect(isPassthroughVarName('GH_TOKEN')).toBe(false)
    expect(isPassthroughVarName('ANTHROPIC_API_KEY')).toBe(true)
  })

  it('CREDENTIAL_ENV_NAMES (検出の正本) から CLAUDE_CONFIG_DIR を除いたものと一致する (conv M-001)', () => {
    expect([...CREDENTIAL_ENV_NAMES].sort()).toEqual(
      [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL',
        'AWS_PROFILE',
        'AWS_REGION',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_USE_BEDROCK',
        'CLAUDE_CONFIG_DIR'
      ].sort()
    )
    expect([...PASSTHROUGH_VAR_ALLOWLIST].sort()).toEqual(
      CREDENTIAL_ENV_NAMES.filter((n) => n !== 'CLAUDE_CONFIG_DIR').sort()
    )
  })
})

describe('isDerivationForwardKey (導出が正当に転送するキー。AD-041 (e) 2)', () => {
  it('方式固有の実名集合を固定する', () => {
    expect([...METHOD_SPECIFIC_FORWARD_KEYS].sort()).toEqual(
      [
        'ANTHROPIC_API_KEY',
        'AWS_PROFILE',
        'AWS_REGION',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_USE_BEDROCK',
        'CLAUDE_CONFIG_DIR'
      ].sort()
    )
  })

  it('方式固有の実名は CREDENTIAL_ENV_NAMES (実名の正本) の部分集合 (conv L-008)', () => {
    const credentialNames: readonly string[] = CREDENTIAL_ENV_NAMES
    expect(METHOD_SPECIFIC_FORWARD_KEYS.filter((k) => !credentialNames.includes(k))).toEqual([])
  })

  it.each([...METHOD_SPECIFIC_FORWARD_KEYS, ...PASSTHROUGH_VAR_ALLOWLIST])('%s は導出キー', (k) =>
    expect(isDerivationForwardKey(k)).toBe(true)
  )

  it.each(['PATH', 'LD_PRELOAD', 'BASH_ENV', 'CLAUDE_CODE_SHELL_PREFIX', 'claude_config_dir'])(
    '%s は導出キーでない',
    (k) => expect(isDerivationForwardKey(k)).toBe(false)
  )
})

describe('isValidExtraEnv (キー数の上限。pr-gate R1 security L-003)', () => {
  const preds = { isForbiddenForwardKey: isForbidden, isDeniedEnvKey: () => false }
  const envOf = (n: number): Record<string, string> =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`K_${i}`, 'v']))

  it(`${MAX_EXTRA_ENV_KEYS} キーまでは通る`, () => {
    expect(isValidExtraEnv(envOf(MAX_EXTRA_ENV_KEYS), preds)).toBe(true)
  })

  it(`${MAX_EXTRA_ENV_KEYS + 1} キーは拒否`, () => {
    expect(isValidExtraEnv(envOf(MAX_EXTRA_ENV_KEYS + 1), preds)).toBe(false)
  })

  it('M-001 で足した転送禁止キーは登録境界でも拒否', () => {
    expect(isValidExtraEnv({ GIT_SSH_COMMAND: 'x' }, preds)).toBe(false)
    expect(isValidExtraEnv({ HTTPS_PROXY: 'http://proxy' }, preds)).toBe(true)
  })
})

describe('isWindowsPathValue', () => {
  it.each(['C:\\Users\\y', 'c:/x', '\\\\server\\share'])('%s は Windows パス', (v) =>
    expect(isWindowsPathValue(v)).toBe(true)
  )
  it.each(['/home/y', 'https://x', 'value', ''])('%s は Windows パスでない', (v) =>
    expect(isWindowsPathValue(v)).toBe(false)
  )
})
