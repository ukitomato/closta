/**
 * トップレベル遷移の判定 (X-5 / design-gate R3-H-02 / pr-gate R1 security M-001)。**electron に依存しない純関数**。
 *
 * | 規則 | 根拠 |
 * |---|---|
 * | **トップレベル遷移はすべて拒否する** — 同一 origin も含む。renderer は SPA で正当な文書遷移を持たず、文書が入れ替わると renderer の保持と全セッションの port が失われる (main は文書の入れ替わりで全セッションを止める) | R3-H-02 / FR-014 |
 * | 配信元 origin の外の http(s) だけを OS の既定ブラウザへ委譲する。`file:` / `app:` / カスタム scheme / 解釈できない URL は委譲もしない | pr-gate H-004 / CWE-749 |
 */

export interface NavigationDecision {
  /** 遷移を止めるか。常に true (文書を入れ替えない)。 */
  readonly prevent: true
  /** OS の既定ブラウザで開くか。 */
  readonly openExternal: boolean
}

export function decideNavigation(
  url: string,
  allowedOrigins: readonly string[]
): NavigationDecision {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { prevent: true, openExternal: false }
  }
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
  return { prevent: true, openExternal: isHttp && !allowedOrigins.includes(parsed.origin) }
}
