#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Critical without 同種事象探索 inline OR cascade summary row → must be demoted
cat > "$TMP/no-cascade.md" <<'EOF'
# security-reviewer Review: x

## 初回読了 viewpoint

- FR/SC: FR-001
- A. 認可: Critical:1
- B. 入力検証: 該当なし

## Findings

### [Critical] missing auth check (C-001)

- **観察**: lib/auth.ts:42 で X
- **リスク/影響**: bad
- **推奨アクション**: add check
- **根拠**: Principle II

## Verdict
- Critical: 1
EOF

count=$(bash "$SCRIPT" cascade-enforce "$TMP/no-cascade.md")
if [ "$count" = "1" ]; then
  echo "    OK: no-cascade Critical demoted (count=1)"
else
  echo "    FAIL: expected demoted count=1, got $count"
  cat "$TMP/no-cascade.md"
  exit 1
fi
if ! grep -q '^### \[High\] missing auth check' "$TMP/no-cascade.md"; then
  echo "    FAIL: Critical not rewritten to High"
  cat "$TMP/no-cascade.md"
  exit 1
fi
if ! grep -q 'gate-common: demoted Critical → High' "$TMP/no-cascade.md"; then
  echo "    FAIL: marker comment not appended"
  exit 1
fi
echo "    OK: marker comment appended"

# Critical WITH inline 同種事象探索 → should NOT be demoted
cat > "$TMP/with-cascade.md" <<'EOF'
# security-reviewer Review: x

## 初回読了 viewpoint
- A. 認可: Critical:1

## Findings

### [Critical] missing auth check (C-001)

- **観察**: lib/auth.ts:42
- **同種事象探索**: `grep -rn 'auth(' lib/` で 3 件 (lib/a.ts:10, lib/b.ts:20, lib/c.ts:30)
- **リスク/影響**: bad
- **推奨アクション**: fix all 3
- **根拠**: Principle II

## Verdict
- Critical: 1
EOF

count=$(bash "$SCRIPT" cascade-enforce "$TMP/with-cascade.md")
if [ "$count" = "0" ]; then
  echo "    OK: cascade-verified Critical NOT demoted (count=0)"
else
  echo "    FAIL: expected count=0, got $count"
  exit 1
fi
if ! grep -q '^### \[Critical\] missing auth check' "$TMP/with-cascade.md"; then
  echo "    FAIL: Critical incorrectly demoted"
  cat "$TMP/with-cascade.md"
  exit 1
fi

# Critical with 0 件 inline → NOT demoted (explicit 0 count is verification)
cat > "$TMP/zero-count.md" <<'EOF'
# security-reviewer Review: x

## Findings

### [Critical] missing auth check (C-001)

- **観察**: lib/auth.ts:42
- **同種事象探索**: `grep -rn 'auth(' lib/` で 0 件 (本箇所のみ)
- **リスク/影響**: bad
- **推奨アクション**: fix
EOF

count=$(bash "$SCRIPT" cascade-enforce "$TMP/zero-count.md")
if [ "$count" = "0" ]; then
  echo "    OK: '0 件' explicit verification NOT demoted"
else
  echo "    FAIL: expected count=0 for '0 件', got $count"
  exit 1
fi

echo "  all cascade-enforce assertions passed"
exit 0
