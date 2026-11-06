# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

Include the version, the IDE and OS, and the steps to reproduce. You should get a first answer within a week.

## Supported versions

Only the latest release is supported.

## Scope

Closta starts the `claude` CLI and passes it the IDE's context. Problems in the CLI itself should be reported to
Anthropic ([anthropics/claude-code](https://github.com/anthropics/claude-code)).
