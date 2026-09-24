#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(dirname "$0")/../gate-common.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Valid PASS verdict (critical=0)
cat > "$TMP/valid_pass.json" <<EOF
{
  "gate": "code",
  "run": "2026-05-23T10:00:00Z",
  "spec_dir": "specs/001-auth-login",
  "spec_id": "001-auth-login",
  "severity_counts": {"critical": 0, "high": 2, "medium": 1, "low": 5},
  "verdict": "PASS"
}
EOF
bash "$SCRIPT" verdict-validate "$TMP/valid_pass.json" >/dev/null
echo "    OK: valid PASS verdict (exit 0)"

# Valid FIX_REQUIRED (critical=2)
cat > "$TMP/valid_fix.json" <<EOF
{
  "gate": "pr",
  "run": "2026-05-23T10:00:00Z",
  "spec_dir": "specs/001-x",
  "spec_id": "001-x",
  "severity_counts": {"critical": 2, "high": 1, "medium": 0, "low": 0},
  "verdict": "FIX_REQUIRED"
}
EOF
bash "$SCRIPT" verdict-validate "$TMP/valid_fix.json" >/dev/null
echo "    OK: valid FIX_REQUIRED verdict (exit 0)"

# Invalid: PASS with critical > 0 (hard gate violation)
cat > "$TMP/invalid_pass_with_critical.json" <<EOF
{
  "gate": "pr",
  "run": "2026-05-23T10:00:00Z",
  "spec_dir": "specs/001-x",
  "spec_id": "001-x",
  "severity_counts": {"critical": 1, "high": 0, "medium": 0, "low": 0},
  "verdict": "PASS"
}
EOF
set +e
bash "$SCRIPT" verdict-validate "$TMP/invalid_pass_with_critical.json" >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -eq 5 ]; then
  echo "    OK: PASS with critical>0 rejected (exit 5)"
else
  echo "    FAIL: expected exit 5, got $rc"
  exit 1
fi

# Invalid: missing required key
cat > "$TMP/invalid_missing.json" <<EOF
{
  "gate": "code",
  "run": "2026-05-23T10:00:00Z",
  "severity_counts": {"critical": 0, "high": 0, "medium": 0, "low": 0},
  "verdict": "PASS"
}
EOF
set +e
bash "$SCRIPT" verdict-validate "$TMP/invalid_missing.json" >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -eq 2 ]; then
  echo "    OK: missing keys rejected (exit 2)"
else
  echo "    FAIL: expected exit 2, got $rc"
  exit 1
fi

# Invalid: bad gate value
cat > "$TMP/invalid_gate.json" <<EOF
{
  "gate": "unknown",
  "run": "2026-05-23T10:00:00Z",
  "spec_dir": "x",
  "spec_id": "x",
  "severity_counts": {"critical": 0, "high": 0, "medium": 0, "low": 0},
  "verdict": "PASS"
}
EOF
set +e
bash "$SCRIPT" verdict-validate "$TMP/invalid_gate.json" >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -eq 2 ]; then
  echo "    OK: invalid gate rejected (exit 2)"
else
  echo "    FAIL: expected exit 2, got $rc"
  exit 1
fi

# Missing file → exit 3
set +e
bash "$SCRIPT" verdict-validate "$TMP/does-not-exist.json" >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -eq 3 ]; then
  echo "    OK: missing file rejected (exit 3)"
else
  echo "    FAIL: expected exit 3, got $rc"
  exit 1
fi

echo "  all verdict-validate assertions passed"
exit 0
