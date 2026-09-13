---
domain: <kebab-case-name>
status: <draft | needs-human-review | active>
owner: <team or person>
generated_by: <human | /spec-gate.migrate Phase 2>
last_reviewed: <ISO 8601>
related_adrs: []
related_specs: []
---

# Domain Charter: <Domain Name>

この domain (`<name>`) の **Mission / Scope / 業務ルール / KPI** の SSoT。`architecture-reviewer` / `po-reviewer` がこの charter を基準に drift を判定する。

## Mission

<1-2 sentence で「この domain は X を担う」を明示。actor (end user / admin / system) を含める。>

例:
> The `messaging` domain is responsible for direct messages, group chats, and notification delivery between users. It serves end-users (sender / receiver) and integrates with `identity` (for user resolution) and `posts` (for shared content references).

## Scope

### In scope (本 domain の責任)

- <機能 / データ / UI flow を箇条書き>
- <例: direct message 送受信>
- <例: group chat の作成 / 参加 / 退出>
- <例: notification token 管理 + push 配信>

### Out of scope (意図的に除外)

- <他 domain の責任に委ねる領域>
- <例: user profile 編集は identity domain>
- <例: post 共有経路は posts domain>

## Actors / Personas

- **<role 1>**: <description>。何ができるか
- **<role 2>**: ...
- **<role 3>**: ...

## User Journey (主要 flow)

### Journey 1: <flow name>

1. <entry point>: ユーザは <action>
2. <step 2>: システムは <reaction>
3. <step 3>: ...
4. <completion>: <goal>

### Journey 2: ...

(必要なら 2-3 本まで)

## Key concepts (Ubiquitous Language)

本 domain で使う中心概念:

- **<term 1>**: <definition>
- **<term 2>**: ...

詳細は [docs/glossary.md](../../glossary.md) を参照。

## 業務ルール / 不変条件

- <ルール 1>
- <ルール 2>
- ...

NON-NEGOTIABLE な不変条件は Constitution Principle として昇格すべき。

## KPI / Success metrics

- **<KPI 1>**: <metric definition> — 計測経路: <log / metric / event>
- **<KPI 2>**: ...

## Cross-domain dependencies

- 依存する domain: `<list>`
- 依存される domain: `<list>`
- 共有 invariant: <list> (詳細は [docs/domains/_overview.md](../_overview.md))

## Related ADRs

- [ADR-NNNN](../../decisions/NNNN-...md) — <title>
- ...

## Related Specs

- specs/<NNN>-<domain>-<slug>/ — <feature summary>
- ...

## Open Questions

(レビュー中で未決の論点)

- [ ] <question 1>
- [ ] <question 2>

## Principles (domain-specific, optional)

domain 固有の Principle がある場合のみ:

### Principle <name>

**Statement**: <statement>
**Why**: ...

(Constitution に昇格すべき重要 Principle はここではなく `.specify/memory/constitution.md` に移動)
